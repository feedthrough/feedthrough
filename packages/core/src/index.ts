import { FeedthroughBridge } from "./bridge";
import type { BridgeOptions } from "./types";

export { FeedthroughBridge } from "./bridge";
export type {
  BridgeOptions,
  BrowserMessage,
  Command,
  LogLevel,
  ServerInfo,
  WelcomeMessage,
} from "./types";

export function init(options?: BridgeOptions): FeedthroughBridge {
  const bridge = new FeedthroughBridge(options);
  bridge.connect();
  // Exposed for the same reason the IIFE entry does it: `window.__feedthrough.server`
  // is how a human (or an agent driving devtools) checks which MCP server this page
  // is paired with. Kept consistent across every injection path.
  if (typeof window !== "undefined") window.__feedthrough = bridge;
  return bridge;
}
