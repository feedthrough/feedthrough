import { FeedthroughBridge } from "./bridge";
import type { BridgeOptions } from "./types";

declare global {
  interface Window {
    __feedthrough?: FeedthroughBridge;
    __feedthroughOptions?: BridgeOptions;
  }
}

window.__feedthrough = new FeedthroughBridge(window.__feedthroughOptions ?? {});
window.__feedthrough.connect();
