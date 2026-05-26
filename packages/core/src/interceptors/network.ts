import type { Transport } from "../transport";
import type { NetworkMessage } from "../types";

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

      const pending: NetworkMessage = { type: "network", ts: startTs, requestId, method, url };
      requests.push(pending);
      transport.send(pending);

      const res = await orig(input, init);
      const done: NetworkMessage = { ...pending, ts: Date.now(), status: res.status, duration: Date.now() - startTs };
      Object.assign(pending, done);
      transport.send(done);
      return res;
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

      const origOpen = xhr.open.bind(xhr);
      xhr.open = (m: string, u: string | URL, async?: boolean, user?: string | null, password?: string | null) => {
        method = m.toUpperCase();
        url = String(u);
        origOpen(m, String(u), async ?? true, user, password);
      };

      const origSend = xhr.send.bind(xhr);
      xhr.send = (body?: Document | XMLHttpRequestBodyInit | null) => {
        const requestId = uid();
        const startTs = Date.now();
        const pending: NetworkMessage = { type: "network", ts: startTs, requestId, method, url };
        requests.push(pending);
        transport.send(pending);
        xhr.addEventListener("loadend", () => {
          const done: NetworkMessage = { ...pending, ts: Date.now(), status: xhr.status, duration: Date.now() - startTs };
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

let counter = 0;
function uid(): string {
  return `${Date.now()}-${++counter}`;
}
