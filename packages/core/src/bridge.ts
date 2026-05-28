import { Transport } from "./transport";
import { ConsoleInterceptor } from "./interceptors/console";
import { NetworkInterceptor } from "./interceptors/network";
import { CommandHandler } from "./commands";
import type { BridgeOptions } from "./types";

const DEFAULT_SERVER_URL = "ws://localhost:8765";

export class FeedthroughBridge {
  private readonly transport: Transport;
  private readonly consoleInterceptor: ConsoleInterceptor;
  private readonly networkInterceptor: NetworkInterceptor;
  private readonly commandHandler: CommandHandler;

  constructor(options: BridgeOptions = {}) {
    const url = options.serverUrl ?? DEFAULT_SERVER_URL;
    const reconnectDelay = options.reconnectDelay ?? 2000;

    this.consoleInterceptor = new ConsoleInterceptor();
    this.networkInterceptor = new NetworkInterceptor();

    // Transport is constructed first; the onMessage callback closes over `this`
    // which is safe because WebSocket messages only arrive after connect() returns.
    this.transport = new Transport(
      url,
      (msg) => this.commandHandler.handle(msg),
      (connected) => { if (connected) this.transport.send({ type: "hello", url: window.location.href }); },
      reconnectDelay,
    );
    this.commandHandler = new CommandHandler(this.transport, this.consoleInterceptor, this.networkInterceptor);
  }

  connect(): void {
    this.consoleInterceptor.install(this.transport);
    this.networkInterceptor.install(this.transport);
    this.transport.connect();
  }

  destroy(): void {
    this.transport.destroy();
    this.consoleInterceptor.uninstall();
    this.networkInterceptor.uninstall();
  }
}
