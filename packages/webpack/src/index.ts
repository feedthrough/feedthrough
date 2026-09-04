import { fileURLToPath } from "node:url";
import type { BridgeOptions } from "@feedthrough/core";
import { resolveBridgeOptions } from "@feedthrough/core/node";
import type { Compiler } from "webpack";

const CLIENT_ENTRY = fileURLToPath(new URL("./client.js", import.meta.url));

export class FeedthroughPlugin {
  constructor(private readonly options: BridgeOptions = {}) {}

  apply(compiler: Compiler): void {
    if (compiler.options.mode !== "development") return;

    // Resolved in Node and baked into the client bundle as a literal, so
    // FEEDTHROUGH_PORT in the dev server's environment is enough to point the
    // page at a bridge that had to move off the default port.
    new compiler.webpack.DefinePlugin({
      __FEEDTHROUGH_OPTIONS__: JSON.stringify(resolveBridgeOptions(this.options)),
    }).apply(compiler);

    new compiler.webpack.EntryPlugin(compiler.context, CLIENT_ENTRY, { name: undefined }).apply(
      compiler,
    );
  }
}
