import { WebSocketServer, WebSocket } from "ws";

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface ResultMessage {
  type: "result";
  commandId: string;
  ok: boolean;
  value?: unknown;
  error?: string;
}

function isResultMessage(v: unknown): v is ResultMessage {
  return (
    typeof v === "object" && v !== null &&
    (v as Record<string, unknown>).type === "result" &&
    typeof (v as Record<string, unknown>).commandId === "string"
  );
}

export class BridgeClient {
  private readonly wss: WebSocketServer;
  private socket: WebSocket | null = null;
  private readonly pending = new Map<string, Pending>();
  private counter = 0;

  constructor(port = 8765) {
    this.wss = new WebSocketServer({ port });

    this.wss.on("connection", (ws) => {
      if (this.socket) {
        process.stderr.write("[feedthrough] replacing existing browser connection\n");
      }
      this.socket = ws;
      process.stderr.write("[feedthrough] browser connected\n");

      ws.on("message", (data) => {
        let msg: unknown;
        try { msg = JSON.parse(data.toString()); } catch { return; }
        if (!isResultMessage(msg)) return;

        const pending = this.pending.get(msg.commandId);
        if (!pending) return;

        clearTimeout(pending.timer);
        this.pending.delete(msg.commandId);

        if (msg.ok) {
          pending.resolve(msg.value ?? null);
        } else {
          pending.reject(new Error(msg.error ?? "command failed"));
        }
      });

      ws.on("close", () => {
        this.socket = null;
        process.stderr.write("[feedthrough] browser disconnected\n");
      });
    });
  }

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  sendCommand(action: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        reject(new Error("no browser connected — open a page with @feedthrough/core injected"));
        return;
      }

      const id = `cmd-${Date.now()}-${++this.counter}`;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("command timed out after 10s"));
      }, 10_000);

      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ type: "command", id, action, ...params }));
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.wss.close(() => resolve()));
  }
}
