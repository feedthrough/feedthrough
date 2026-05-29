import type { Transport } from "../transport";
import type { NetworkMessage } from "../types";

const MAX_REQUESTS = 1000;
const MAX_BODY_CHARS = 10_000;

export class NetworkInterceptor {
  private requests: NetworkMessage[] = [];
  private origFetch: typeof window.fetch | null = null;
  private OrigXHR: typeof XMLHttpRequest | null = null;

  install(transport: Transport): void {
    this.interceptFetch(transport);
    this.interceptXHR(transport);
  }

  private interceptFetch(transport: Transport): void {
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
        type: "network", ts: startTs, requestId, method, url,
        requestHeaders, requestBody,
      };
      pushRequest(requests, pending);
      transport.send(pending);

      try {
        const res = await orig(input, init);
        const responseHeaders = headersToObject(res.headers);
        const done: NetworkMessage = {
          ...pending, ts: Date.now(), status: res.status, duration: Date.now() - startTs,
          responseHeaders,
        };
        Object.assign(pending, done);
        transport.send(done);

        // Read the response body off a clone so the app keeps full access to
        // res. Fire-and-forget — we don't want to delay the app's await chain
        // waiting for body bytes we only need for debugging.
        captureResponseBody(res.clone(), pending, transport);
        return res;
      } catch (e) {
        // Network-level failure (DNS, connection refused, CORS, abort) — the
        // fetch rejects rather than resolving, so record it before rethrowing.
        const failed: NetworkMessage = {
          ...pending, ts: Date.now(), duration: Date.now() - startTs,
          error: e instanceof Error ? e.message : String(e),
        };
        Object.assign(pending, failed);
        transport.send(failed);
        throw e;
      }
    };
  }

  private interceptXHR(transport: Transport): void {
    this.OrigXHR = window.XMLHttpRequest;
    const OrigXHR = this.OrigXHR;
    const requests = this.requests;

    function FeedthroughXHR(this: XMLHttpRequest) {
      const xhr = new OrigXHR();
      let method = "GET";
      let url = "";
      const requestHeaders: Record<string, string> = {};

      const origOpen = xhr.open.bind(xhr);
      xhr.open = (m: string, u: string | URL, async?: boolean, user?: string | null, password?: string | null) => {
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
          type: "network", ts: startTs, requestId, method, url,
          requestHeaders: Object.keys(requestHeaders).length ? { ...requestHeaders } : undefined,
          requestBody,
        };
        pushRequest(requests, pending);
        transport.send(pending);
        xhr.addEventListener("loadend", () => {
          let responseBody: string | undefined;
          try {
            if (xhr.responseType === "" || xhr.responseType === "text") {
              responseBody = capText(xhr.responseText);
            } else {
              responseBody = `[XHR responseType=${xhr.responseType}]`;
            }
          } catch { /* ignore — accessing responseText on non-text type throws */ }
          const done: NetworkMessage = {
            ...pending, ts: Date.now(), status: xhr.status, duration: Date.now() - startTs,
            responseBody,
            responseHeaders: parseRawHeaders(xhr.getAllResponseHeaders()),
          };
          Object.assign(pending, done);
          transport.send(done);
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

  getRequests(filter?: string): NetworkMessage[] {
    const all = [...this.requests];
    if (!filter) return all;
    const lower = filter.toLowerCase();
    return all.filter(r => r.url.toLowerCase().includes(lower) || r.method.toLowerCase() === lower);
  }
}

function resolveMethod(input: RequestInfo | URL, init?: RequestInit): string {
  return (
    init?.method ??
    (input instanceof Request ? input.method : null) ??
    "GET"
  ).toUpperCase();
}

function pushRequest(requests: NetworkMessage[], msg: NetworkMessage): void {
  requests.push(msg);
  if (requests.length > MAX_REQUESTS) requests.shift();
}

function mergeRequestHeaders(input: RequestInfo | URL, init?: RequestInit): Record<string, string> | undefined {
  // If init.headers is set, fetch ignores input.headers — match that.
  const source = init?.headers ?? (input instanceof Request ? input.headers : undefined);
  if (!source) return undefined;
  const out: Record<string, string> = {};
  if (source instanceof Headers) {
    source.forEach((v, k) => { out[k] = v; });
  } else if (Array.isArray(source)) {
    for (const [k, v] of source) out[k] = String(v);
  } else {
    for (const [k, v] of Object.entries(source)) out[k] = String(v);
  }
  return Object.keys(out).length ? out : undefined;
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((v, k) => { out[k] = v; });
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
    try { return capText(JSON.stringify(obj)); } catch { return "[FormData]"; }
  }
  if (body instanceof Blob) return `[Blob: ${body.size} bytes, ${body.type || "unknown"}]`;
  if (body instanceof ArrayBuffer) return `[ArrayBuffer: ${body.byteLength} bytes]`;
  if (ArrayBuffer.isView(body)) return `[${body.constructor.name}: ${body.byteLength} bytes]`;
  if (body instanceof ReadableStream) return "[ReadableStream]";
  try { return capText(JSON.stringify(body)); } catch { return String(body); }
}

function capText(text: string): string {
  if (text.length <= MAX_BODY_CHARS) return text;
  return text.slice(0, MAX_BODY_CHARS) + `…[truncated, ${text.length - MAX_BODY_CHARS} more chars]`;
}

function captureResponseBody(res: Response, pending: NetworkMessage, transport: Transport): void {
  const ct = res.headers.get("content-type") ?? "";
  if (isLikelyBinary(ct)) {
    const len = res.headers.get("content-length");
    pending.responseBody = `[binary, ${len ?? "?"} bytes, ${ct || "no content-type"}]`;
    transport.send({ ...pending });
    return;
  }
  res.text().then(text => {
    pending.responseBody = capText(text);
    transport.send({ ...pending });
  }).catch(() => { /* clone read can fail if the original is aborted */ });
}

function isLikelyBinary(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return /^(image|video|audio|font)\//.test(ct) ||
         ct.startsWith("application/octet-stream") ||
         ct.startsWith("application/pdf") ||
         ct.startsWith("application/zip");
}

let counter = 0;
function uid(): string {
  return `${Date.now()}-${++counter}`;
}
