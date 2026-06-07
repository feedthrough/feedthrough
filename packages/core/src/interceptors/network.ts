import type { NetworkMessage } from "../types";

const MAX_REQUESTS = 1000;
const MAX_BODY_CHARS = 10_000;
// Hard cap on bytes we'll pull off a response stream while capturing the body.
// Bounds memory for large/streaming responses regardless of content-length.
const MAX_BODY_BYTES = 64 * 1024;

export class NetworkInterceptor {
  private requests: NetworkMessage[] = [];
  private origFetch: typeof window.fetch | null = null;
  private OrigXHR: typeof XMLHttpRequest | null = null;

  // Captured into a local buffer only — never streamed. An agent pulls requests
  // on demand via get_network_requests; pushing every request/response over the
  // WebSocket would be wasted traffic since nothing subscribes to it.
  install(): void {
    this.interceptFetch();
    this.interceptXHR();
  }

  private interceptFetch(): void {
    this.origFetch = window.fetch.bind(window);
    const orig = this.origFetch;
    const requests = this.requests;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = input instanceof Request ? input.url : String(input);
      const method = resolveMethod(input, init);
      const requestId = uid();
      const startTs = Date.now();
      const requestHeaders = mergeRequestHeaders(input, init);
      const requestBody = serializeRequestBody(init?.body);

      const pending: NetworkMessage = {
        type: "network",
        ts: startTs,
        requestId,
        method,
        url,
        requestHeaders,
        requestBody,
      };
      pushRequest(requests, pending);

      try {
        const res = await orig(input, init);
        Object.assign(pending, {
          ts: Date.now(),
          status: res.status,
          duration: Date.now() - startTs,
          responseHeaders: headersToObject(res.headers),
        });

        // Read the body off a clone so the app keeps full access to res. Bounded
        // and fire-and-forget: we never delay the app's await chain, and we cap
        // the bytes we pull so a streaming or huge response can't grow unbounded.
        captureResponseBody(res.clone(), pending);
        return res;
      } catch (e) {
        // Network-level failure (DNS, connection refused, CORS, abort) — the
        // fetch rejects rather than resolving, so record it before rethrowing.
        Object.assign(pending, {
          ts: Date.now(),
          duration: Date.now() - startTs,
          error: e instanceof Error ? e.message : String(e),
        });
        throw e;
      }
    };
  }

  private interceptXHR(): void {
    this.OrigXHR = window.XMLHttpRequest;
    const OrigXHR = this.OrigXHR;
    const requests = this.requests;

    function FeedthroughXHR(this: XMLHttpRequest) {
      const xhr = new OrigXHR();
      let method = "GET";
      let url = "";
      const requestHeaders: Record<string, string> = {};

      const origOpen = xhr.open.bind(xhr);
      xhr.open = (
        m: string,
        u: string | URL,
        async?: boolean,
        user?: string | null,
        password?: string | null,
      ) => {
        method = m.toUpperCase();
        url = String(u);
        origOpen(m, String(u), async ?? true, user, password);
      };

      const origSetHeader = xhr.setRequestHeader.bind(xhr);
      xhr.setRequestHeader = (name: string, value: string) => {
        requestHeaders[name] = String(value);
        origSetHeader(name, value);
      };

      const origSend = xhr.send.bind(xhr);
      xhr.send = (body?: Document | XMLHttpRequestBodyInit | null) => {
        const requestId = uid();
        const startTs = Date.now();
        const requestBody = serializeRequestBody(body ?? undefined);
        const pending: NetworkMessage = {
          type: "network",
          ts: startTs,
          requestId,
          method,
          url,
          requestHeaders: Object.keys(requestHeaders).length ? { ...requestHeaders } : undefined,
          requestBody,
        };
        pushRequest(requests, pending);
        xhr.addEventListener("loadend", () => {
          let responseBody: string | undefined;
          try {
            if (xhr.responseType === "" || xhr.responseType === "text") {
              responseBody = capText(xhr.responseText);
            } else {
              responseBody = `[XHR responseType=${xhr.responseType}]`;
            }
          } catch {
            /* ignore — accessing responseText on non-text type throws */
          }
          Object.assign(pending, {
            ts: Date.now(),
            status: xhr.status,
            duration: Date.now() - startTs,
            responseBody,
            responseHeaders: parseRawHeaders(xhr.getAllResponseHeaders()),
          });
        });
        origSend(body);
      };

      return xhr;
    }

    FeedthroughXHR.prototype = OrigXHR.prototype;
    window.XMLHttpRequest = FeedthroughXHR as unknown as typeof XMLHttpRequest;
  }

  uninstall(): void {
    if (this.origFetch) window.fetch = this.origFetch;
    if (this.OrigXHR) window.XMLHttpRequest = this.OrigXHR;
  }

  getRequests(filter?: string, since?: number): NetworkMessage[] {
    let all = [...this.requests];
    if (since !== undefined) all = all.filter(r => r.ts >= since);
    if (!filter) return all;
    const lower = filter.toLowerCase();
    return all.filter(r => r.url.toLowerCase().includes(lower) || r.method.toLowerCase() === lower);
  }
}

function resolveMethod(input: RequestInfo | URL, init?: RequestInit): string {
  return (init?.method ?? (input instanceof Request ? input.method : null) ?? "GET").toUpperCase();
}

function pushRequest(requests: NetworkMessage[], msg: NetworkMessage): void {
  requests.push(msg);
  if (requests.length > MAX_REQUESTS) requests.shift();
}

function mergeRequestHeaders(
  input: RequestInfo | URL,
  init?: RequestInit,
): Record<string, string> | undefined {
  // If init.headers is set, fetch ignores input.headers — match that.
  const source = init?.headers ?? (input instanceof Request ? input.headers : undefined);
  if (!source) return undefined;
  const out: Record<string, string> = {};
  if (source instanceof Headers) {
    source.forEach((v, k) => {
      out[k] = v;
    });
  } else if (Array.isArray(source)) {
    for (const [k, v] of source) out[k] = String(v);
  } else {
    for (const [k, v] of Object.entries(source)) out[k] = String(v);
  }
  return Object.keys(out).length ? out : undefined;
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

function parseRawHeaders(raw: string): Record<string, string> | undefined {
  if (!raw) return undefined;
  const out: Record<string, string> = {};
  for (const line of raw.split("\r\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    if (k) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

function serializeRequestBody(body: BodyInit | Document | null | undefined): string | undefined {
  if (body == null) return undefined;
  if (typeof body === "string") return capText(body);
  if (body instanceof URLSearchParams) return capText(body.toString());
  if (body instanceof FormData) {
    const obj: Record<string, unknown> = {};
    body.forEach((v, k) => {
      obj[k] = v instanceof File ? `[File: ${v.name}, ${v.size} bytes]` : v;
    });
    try {
      return capText(JSON.stringify(obj));
    } catch {
      return "[FormData]";
    }
  }
  if (body instanceof Blob) return `[Blob: ${body.size} bytes, ${body.type || "unknown"}]`;
  if (body instanceof ArrayBuffer) return `[ArrayBuffer: ${body.byteLength} bytes]`;
  if (ArrayBuffer.isView(body)) return `[${body.constructor.name}: ${body.byteLength} bytes]`;
  if (body instanceof ReadableStream) return "[ReadableStream]";
  try {
    return capText(JSON.stringify(body));
  } catch {
    return String(body);
  }
}

function capText(text: string): string {
  if (text.length <= MAX_BODY_CHARS) return text;
  return `${text.slice(0, MAX_BODY_CHARS)}…[truncated, ${text.length - MAX_BODY_CHARS} more chars]`;
}

function captureResponseBody(res: Response, pending: NetworkMessage): void {
  const ct = (res.headers.get("content-type") ?? "").toLowerCase();
  if (isSkippable(ct)) {
    const len = res.headers.get("content-length");
    pending.responseBody = `[${describe(ct)}${len ? `, ${len} bytes` : ""}, ${ct || "no content-type"}]`;
    return;
  }
  readBounded(res)
    .then(body => {
      pending.responseBody = body;
    })
    .catch(() => {
      /* aborted/locked */
    });
}

async function readBounded(res: Response): Promise<string> {
  // Pull at most MAX_BODY_BYTES off the stream, then cancel. This bounds memory
  // and, crucially, releases the teed clone so an open stream (SSE-style) or a
  // huge download can't make the browser buffer the whole thing on our behalf.
  if (!res.body) return capText(await res.text());
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  let truncated = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      text += decoder.decode(value, { stream: true });
      if (bytes >= MAX_BODY_BYTES || text.length >= MAX_BODY_CHARS) {
        truncated = true;
        break;
      }
    }
  } finally {
    reader.cancel().catch(() => {
      /* already closed */
    });
  }
  if (!truncated) return capText(text);
  return `${text.slice(0, MAX_BODY_CHARS)}…[truncated]`;
}

function isSkippable(ct: string): boolean {
  return (
    /^(image|video|audio|font)\//.test(ct) ||
    ct.startsWith("application/octet-stream") ||
    ct.startsWith("application/pdf") ||
    ct.startsWith("application/zip") ||
    ct.startsWith("text/event-stream") || // SSE — never-ending stream
    ct.startsWith("application/x-ndjson")
  ); // streaming JSON lines
}

function describe(ct: string): string {
  if (ct.startsWith("text/event-stream")) return "event stream";
  if (ct.startsWith("application/x-ndjson")) return "ndjson stream";
  return "binary";
}

let counter = 0;
function uid(): string {
  return `${Date.now()}-${++counter}`;
}
