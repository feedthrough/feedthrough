import type { BrowserMessage } from "./types";

export type OnMessageCallback = (data: unknown) => void;
export type OnStatusCallback = (connected: boolean) => void;

const MAX_QUEUE = 1000;

export class Transport {
  private ws: WebSocket | null = null;
  private queue: string[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(
    private readonly url: string,
    private readonly onMessage: OnMessageCallback,
    private readonly onStatus: OnStatusCallback,
    private readonly reconnectDelay: number,
  ) {}

  connect(): void {
    if (this.destroyed) return;
    // Capture this specific socket so the handlers act on it even if connect()
    // runs again (reconnect) and reassigns this.ws before this one opens.
    const ws = new WebSocket(this.url);
    this.ws = ws;

    // A stale socket (one replaced by a later connect()) must not mutate shared
    // state — otherwise its onclose could flip us to disconnected and schedule a
    // spurious reconnect while a newer socket is live.
    const isCurrent = () => this.ws === ws;

    ws.onopen = () => {
      if (!isCurrent()) return;
      this.onStatus(true);
      for (const msg of this.queue) ws.send(msg);
      this.queue = [];
    };

    ws.onmessage = event => {
      if (!isCurrent()) return;
      try {
        this.onMessage(JSON.parse(event.data as string));
      } catch {
        /* ignore */
      }
    };

    ws.onclose = () => {
      if (!isCurrent()) return;
      this.onStatus(false);
      if (!this.destroyed) {
        this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay);
      }
    };

    ws.onerror = () => {
      /* onclose fires immediately after */
    };
  }

  send(msg: BrowserMessage): void {
    const serialized = JSON.stringify(msg);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(serialized);
    } else {
      // Bound the queue so a page that runs with no server connected (a common
      // state) doesn't leak memory; drop the oldest messages first.
      this.queue.push(serialized);
      if (this.queue.length > MAX_QUEUE) this.queue.shift();
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}
