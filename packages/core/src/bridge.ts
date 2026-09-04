import { CommandHandler } from "./commands";
import { ConsoleInterceptor } from "./interceptors/console";
import { NetworkInterceptor } from "./interceptors/network";
import { Transport } from "./transport";
import type { BridgeOptions, ServerInfo, WelcomeMessage } from "./types";

declare global {
  interface Window {
    __feedthrough?: FeedthroughBridge;
    __feedthroughOptions?: BridgeOptions;
  }
}

const DEFAULT_SERVER_URL = "ws://localhost:8765";

// Bound at module load, before ConsoleInterceptor.install() patches console, so
// the one line we print about the connection does not come back out of
// get_console_logs as noise the agent has to read past.
const nativeLog: (...args: unknown[]) => void =
  typeof console !== "undefined" ? console.log.bind(console) : () => {};

function isWelcome(msg: unknown): msg is WelcomeMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as Record<string, unknown>).type === "welcome" &&
    typeof (msg as Record<string, unknown>).name === "string"
  );
}

export class FeedthroughBridge {
  private readonly transport: Transport;
  private readonly consoleInterceptor: ConsoleInterceptor;
  private readonly networkInterceptor: NetworkInterceptor;
  private readonly commandHandler: CommandHandler;

  /**
   * Which MCP server this page is connected to, as the server described itself
   * in its `welcome`. Null before the first connection, and with servers older
   * than 0.4 which never send one. Also returned by `get_page_info`, so an agent
   * can check the page agrees with it about which bridge they share.
   */
  server: ServerInfo | null = null;

  constructor(options: BridgeOptions = {}) {
    const url = options.serverUrl ?? DEFAULT_SERVER_URL;
    const reconnectDelay = options.reconnectDelay ?? 2000;

    this.consoleInterceptor = new ConsoleInterceptor();
    this.networkInterceptor = new NetworkInterceptor();

    // Transport is constructed first; the onMessage callback closes over `this`
    // which is safe because WebSocket messages only arrive after connect() returns.
    this.transport = new Transport(
      url,
      msg => {
        if (isWelcome(msg)) {
          this.server = { name: msg.name, port: msg.port, version: msg.version };
          nativeLog(`[feedthrough] connected to ${msg.name} (${url})`);
          return;
        }
        this.commandHandler.handle(msg);
      },
      connected => {
        if (connected) this.transport.send({ type: "hello", url: window.location.href });
        else this.server = null;
      },
      reconnectDelay,
    );
    this.commandHandler = new CommandHandler(
      this.transport,
      this.consoleInterceptor,
      this.networkInterceptor,
      () => this.server,
    );
  }

  connect(): void {
    this.consoleInterceptor.install();
    this.networkInterceptor.install();
    this.transport.connect();
  }

  destroy(): void {
    this.transport.destroy();
    this.consoleInterceptor.uninstall();
    this.networkInterceptor.uninstall();
  }
}
