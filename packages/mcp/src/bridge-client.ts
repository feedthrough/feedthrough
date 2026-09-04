import { WebSocket, WebSocketServer } from "ws";
import { generateInstanceName } from "./instance-name.ts";

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
    typeof v === "object" &&
    v !== null &&
    (v as Record<string, unknown>).type === "result" &&
    typeof (v as Record<string, unknown>).commandId === "string"
  );
}

function isHelloMessage(v: unknown): v is HelloMessage {
  return (
    typeof v === "object" &&
    v !== null &&
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

/** How this server identifies itself, to the page and to its own agent. */
export interface ServerInfo {
  name: string;
  /** The port actually bound, which is not always the one requested. */
  port: number | null;
  version: string;
}

// How far up from the requested port to look for a free one before giving up.
// A handful of concurrent agent sessions is the case worth covering; more than
// that and something is leaking servers, which the error should say plainly.
const MAX_PORT_ATTEMPTS = 10;

// Loopback hostnames that may always connect; .test is an RFC 6761 reserved
// dev TLD (Laravel Valet etc.) and is allowed by default.
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const DEFAULT_ALLOWED_HOST_SUFFIXES = [".test"];

// Non-loopback host suffixes that may connect, defaulting to .test. Override
// with FEEDTHROUGH_ALLOWED_HOST_SUFFIXES (comma-separated); setting it replaces
// the defaults, so include ".test" to keep it (e.g. ".test,.local,.localhost").
// A leading dot is added if missing, so "test" never matches "mytest".
function allowedHostSuffixes(): string[] {
  const fromEnv = process.env.FEEDTHROUGH_ALLOWED_HOST_SUFFIXES;
  if (fromEnv === undefined) return DEFAULT_ALLOWED_HOST_SUFFIXES;
  return fromEnv
    .split(",")
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => (s.startsWith(".") ? s : `.${s}`));
}

// An origin is allowed when its hostname is loopback or ends with a configured
// suffix. The match is host-only; a malformed/absent origin is rejected.
function isAllowedOrigin(origin: string | undefined, suffixes: string[]): boolean {
  if (origin === undefined) return false;
  try {
    const { hostname } = new URL(origin);
    if (LOOPBACK_HOSTS.has(hostname)) return true;
    return suffixes.some(suffix => hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

export class BridgeClient {
  private wss: WebSocketServer | null = null;
  private readonly connections = new Map<string, Connection>();
  private readonly pending = new Map<string, Pending>();
  private counter = 0;
  private bound = false;
  private boundPort: number | null = null;
  startupError: string | null = null;

  /** Readable name for this server process, fresh on every start. */
  readonly name = generateInstanceName();
  /** The port asked for, which is what the page assumes unless told otherwise. */
  readonly requestedPort: number;
  readonly version: string;

  constructor(port = 8765, version = "unknown") {
    this.requestedPort = port;
    this.version = version;
    this.listen(port, MAX_PORT_ATTEMPTS - 1);
  }

  /**
   * Bind the WebSocket server, stepping up a port at a time while the address is
   * taken. The usual occupant is another agent session's feedthrough server, and
   * leaving this session inert (the old behaviour) is worse than moving: the
   * agent is told the real port by connection_status and passes it to its dev
   * server as FEEDTHROUGH_PORT, so the page follows.
   *
   * Only EADDRINUSE retries. Everything else (EACCES and friends) is a real
   * configuration problem and still fails hard with the original message.
   */
  private listen(port: number, retriesLeft: number): void {
    const suffixes = allowedHostSuffixes();

    const wss = new WebSocketServer({
      port,
      host: "127.0.0.1",
      verifyClient: ({ origin }: { origin: string }) => isAllowedOrigin(origin, suffixes),
    });
    this.wss = wss;

    // A server we have moved on from can still emit; ignore it so a superseded
    // attempt cannot overwrite the state of the one that actually bound.
    const isCurrent = () => this.wss === wss;

    wss.on("listening", () => {
      if (!isCurrent()) return;
      this.bound = true;
      this.boundPort = port;
      process.stderr.write(
        `[feedthrough] bridge "${this.name}" (v${this.version}) listening on ws://127.0.0.1:${port}\n`,
      );
      if (port !== this.requestedPort) {
        process.stderr.write(
          `[feedthrough] port ${this.requestedPort} was already in use, so this server took ${port}. ` +
            `Start the app's dev server with FEEDTHROUGH_PORT=${port} so the page connects here ` +
            `(the injected bridge otherwise defaults to ${this.requestedPort}).\n`,
        );
      }
    });

    // Server-level errors (most commonly EADDRINUSE on startup). Without this
    // listener Node would crash on an unhandled 'error' event.
    wss.on("error", (err: NodeJS.ErrnoException) => {
      if (!isCurrent()) return;

      if (!this.bound) {
        if (err.code === "EADDRINUSE" && retriesLeft > 0) {
          wss.close();
          this.listen(port + 1, retriesLeft - 1);
          return;
        }

        // Any other error before the server binds is a fatal startup failure.
        const lastTried = this.requestedPort + (MAX_PORT_ATTEMPTS - 1);
        this.startupError =
          err.code === "EADDRINUSE"
            ? `Bridge WebSocket server found no free port in ${this.requestedPort}-${lastTried} ` +
              `(all in use). Free one (e.g. lsof -ti :${this.requestedPort} | xargs kill) or set ` +
              `FEEDTHROUGH_PORT to an available port, then restart the MCP server.`
            : `Bridge WebSocket server failed to start on port ${port}: ${err.message}` +
              (err.code === "EACCES"
                ? `. Port ${port} requires elevated privileges; set FEEDTHROUGH_PORT to a port above 1024.`
                : ` (${err.code ?? "unknown error"}).`);
        process.stderr.write(`[feedthrough] ${this.startupError}\n`);
        return;
      }
      process.stderr.write(`[feedthrough] websocket server error: ${err.message}\n`);
    });

    wss.on("connection", ws => {
      if (!isCurrent()) return;
      const id = `tab-${++this.counter}`;
      const conn: Connection = {
        id,
        ws,
        url: "(unknown)",
        lastActivity: Date.now(),
        connectedAt: Date.now(),
      };
      this.connections.set(id, conn);
      process.stderr.write(`[feedthrough] tab connected (${id}), open tabs: ${this.openCount}\n`);

      // Answer the page's `hello` with who we are. Bridges older than 0.4 drop
      // unknown message types silently, so this needs no version negotiation.
      // `port` is the one we are listening on, which is what the page should be
      // pointed at — boundPort is always set by the time a connection arrives.
      ws.send(JSON.stringify({ type: "welcome", name: this.name, port, version: this.version }));

      // Per-connection errors (dropped TCP, malformed frames, etc.). Without
      // this listener one misbehaving tab would crash the whole MCP server.
      // 'close' fires after 'error', so cleanup still happens in the close handler.
      ws.on("error", err => {
        process.stderr.write(`[feedthrough] tab error (${id}): ${err.message}\n`);
      });

      ws.on("message", data => {
        let msg: unknown;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }

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
        process.stderr.write(
          `[feedthrough] tab disconnected (${id}), open tabs: ${this.openCount}\n`,
        );
      });
    });
  }

  /** Identity this server reports to the page and to connection_status. */
  get info(): ServerInfo {
    return { name: this.name, port: this.boundPort, version: this.version };
  }

  /** The port actually bound, or null while binding is still in flight/failed. */
  get port(): number | null {
    return this.boundPort;
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
    const wss = this.wss;
    if (!wss) return Promise.resolve();
    return new Promise(resolve => wss.close(() => resolve()));
  }
}
