import { FeedthroughBridge } from "./bridge";
import type { BridgeOptions } from "./types";

export { FeedthroughBridge } from "./bridge";
export type { BridgeOptions, BrowserMessage, Command, LogLevel } from "./types";

export const VERSION = "0.0.1";

export function init(options?: BridgeOptions): FeedthroughBridge {
  const bridge = new FeedthroughBridge(options);
  bridge.connect();
  return bridge;
}
