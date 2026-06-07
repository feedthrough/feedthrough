import type { BridgeOptions } from "@feedthrough/core";
import { init } from "@feedthrough/core";

// Injected at build time by FeedthroughPlugin via webpack.DefinePlugin
declare const __FEEDTHROUGH_OPTIONS__: BridgeOptions;
init(__FEEDTHROUGH_OPTIONS__);
