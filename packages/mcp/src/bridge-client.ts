import { WebSocketServer, WebSocket } from "ws";

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface Connection {
  id: string;
  ws: WebSocket;
  url: string;
  lastActivity: number;
  connectedAt: number;
}

interface ResultMessage {
  type: "result";
  commandId: string;
  ok: boolean;
  value?: unknown;
  error?: string;
}

interface HelloMessage {
  type: "hello";
  url: string;
}

function isResultMessage(v: unknown): v is ResultMessage {
  return (
    typeof v === "object" && v !== null &&
    (v as Record<string, unknown>).type === "result" &&
    typeof (v as Record<string, unknown>).commandId === "string"
  );
}

function isHelloMessage(v: unknown): v is HelloMessage {
  return (
    typeof v === "object" && v !== null &&
    (v as Record<string, unknown>).type === "hello" &&
    typeof (v as Record<string, unknown>).url === "string"
  );
}

export interface TabInfo {
  id: string;
  url: string;
  active: boolean;
  connectedAt: number;
}

// Loopback hostnames that may always connect; .test is an RFC 6761 reserved
// dev TLD (Laravel Valet etc.) and is allowed by default.
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const DEFAULT_ALLOWED_HOST_SUFFIXES = [".test"];

// Non-loopback host suffixes that may connect, defaulting to .test. Override
// with FEEDTHROUGH_ALLOWED_HOST_SUFFIXES (comma-separated); setting it replaces
// the defaults, so include ".test" to keep it (e.g. ".test,.local,.localhost").
function allowedHostSuffixes(): string[] {
  const fromEnv = process.env["FEEDTHROUGH_ALLOWED_HOST_SUFFIXES"];
  if (fromEnv === undefined) return DEFAULT_ALLOWED_HOST_SUFFIXES;
  return fromEnv.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

// An origin is allowed when its hostname is loopback or ends with a configured
// suffix. The match is host-only; a malformed/absent origin is rejected.
function isAllowedOrigin(origin: string | undefined, suffixes: string[]): boolean {
  if (origin === undefined) return false;
  try {
    const { hostname } = new URL(origin);
    if (LOOPBACK_HOSTS.has(hostname)) return true;
    return suffixes.some((suffix) => hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

export class BridgeClient {
  private readonly wss: WebSocketServer;
  private readonly connections = new Map<string, Connection>();
  private readonly pending = new Map<string, Pending>();
  private counter = 0;
  private bound = false;
  startupError: string | null = null;

  constructor(port = 8765) {
    const suffixes = allowedHostSuffixes();

    this.wss = new WebSocketServer({
      port,
      host: "127.0.0.1",
      verifyClient: ({ origin }: { origin: string }) => isAllowedOrigin(origin, suffixes),
    });

    this.wss.on("listening", () => { this.bound = true; });

    // Server-level errors (most commonly EADDRINUSE on startup). Without this
    // listener Node would crash on an unhandled 'error' event.
    this.wss.on("error", (err: NodeJS.ErrnoException) => {
      if (!this.bound) {
        // Any error before the server binds is a fatal startup failure.
        this.startupError = err.code === "EADDRINUSE"
          ? `Bridge WebSocket server failed to bind to port ${port} (address already in use). ` +
            `Free the port (e.g. lsof -ti :${port} | xargs kill) or set FEEDTHROUGH_PORT ` +
            `to an available port, then restart the MCP server.`
          : `Bridge WebSocket server failed to start on port ${port}: ${err.message}` +
            (err.code === "EACCES"
              ? `. Port ${port} requires elevated privileges; set FEEDTHROUGH_PORT to a port above 1024.`
              : ` (${err.code ?? "unknown error"}).`);
        process.stderr.write(`[feedthrough] ${this.startupError}\n`);
        return;
      }
      process.stderr.write(`[feedthrough] websocket server error: ${err.message}\n`);
    });

    this.wss.on("connection", (ws) => {
      const id = `tab-${++this.counter}`;
      const conn: Connection = { id, ws, url: "(unknown)", lastActivity: Date.now(), connectedAt: Date.now() };
      this.connections.set(id, conn);
      process.stderr.write(`[feedthrough] tab connected (${id}), open tabs: ${this.openCount}\n`);

      // Per-connection errors (dropped TCP, malformed frames, etc.). Without
      // this listener one misbehaving tab would crash the whole MCP server.
      // 'close' fires after 'error', so cleanup still happens in the close handler.
      ws.on("error", (err) => {
        process.stderr.write(`[feedthrough] tab error (${id}): ${err.message}\n`);
      });

      ws.on("message", (data) => {
        let msg: unknown;
        try { msg = JSON.parse(data.toString()); } catch { return; }

        conn.lastActivity = Date.now();

        if (isHelloMessage(msg)) {
          conn.url = msg.url;
          process.stderr.write(`[feedthrough] ${id} → ${msg.url}\n`);
          return;
        }

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
        this.connections.delete(id);
        process.stderr.write(`[feedthrough] tab disconnected (${id}), open tabs: ${this.openCount}\n`);
      });
    });
  }

  private get openCount(): number {
    let n = 0;
    for (const c of this.connections.values()) {
      if (c.ws.readyState === WebSocket.OPEN) n++;
    }
    return n;
  }

  private get activeConnection(): Connection | null {
    // Most-recently-active open tab. The bridge only sends us `hello` (on connect/
    // navigation) and command `result`s — it does not stream console/network
    // events — so lastActivity tracks the tab we're actually interacting with
    // rather than whichever tab happens to be the noisiest.
    let best: Connection | null = null;
    for (const conn of this.connections.values()) {
      if (conn.ws.readyState !== WebSocket.OPEN) continue;
      if (!best || conn.lastActivity > best.lastActivity) best = conn;
    }
    return best;
  }

  get connected(): boolean {
    return this.activeConnection !== null;
  }

  get tabs(): TabInfo[] {
    const active = this.activeConnection;
    return Array.from(this.connections.values())
      .filter(c => c.ws.readyState === WebSocket.OPEN)
      .map(c => ({ id: c.id, url: c.url, active: c === active, connectedAt: c.connectedAt }));
  }

  sendCommand(action: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (this.startupError) {
        reject(new Error(this.startupError));
        return;
      }
      const conn = this.activeConnection;
      if (!conn) {
        reject(new Error("no browser connected — open a page with @feedthrough/core injected"));
        return;
      }

      const id = `cmd-${Date.now()}-${++this.counter}`;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("command timed out after 10s"));
      }, 10_000);

      this.pending.set(id, { resolve, reject, timer });
      conn.ws.send(JSON.stringify({ type: "command", id, action, ...params }));
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.wss.close(() => resolve()));
  }
}
