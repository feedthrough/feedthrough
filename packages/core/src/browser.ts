import { FeedthroughBridge } from "./bridge";

window.__feedthrough = new FeedthroughBridge(window.__feedthroughOptions ?? {});
window.__feedthrough.connect();
