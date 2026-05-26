import type { BrowserMessage } from "./types";

export type OnMessageCallback = (data: unknown) => void;
export type OnStatusCallback = (connected: boolean) => void;

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
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.onStatus(true);
      for (const msg of this.queue) this.ws!.send(msg);
      this.queue = [];
    };

    this.ws.onmessage = (event) => {
      try { this.onMessage(JSON.parse(event.data as string)); } catch { /* ignore */ }
    };

    this.ws.onclose = () => {
      this.onStatus(false);
      if (!this.destroyed) {
        this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay);
      }
    };

    this.ws.onerror = () => { /* onclose fires immediately after */ };
  }

  send(msg: BrowserMessage): void {
    const serialized = JSON.stringify(msg);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(serialized);
    } else {
      this.queue.push(serialized);
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}
