import type { Compiler } from "webpack";
import type { BridgeOptions } from "@feedthrough/core";
import { fileURLToPath } from "node:url";

const CLIENT_ENTRY = fileURLToPath(new URL("./client.js", import.meta.url));

export class FeedthroughPlugin {
  constructor(private readonly options: BridgeOptions = {}) {}

  apply(compiler: Compiler): void {
    if (compiler.options.mode !== "development") return;

    new compiler.webpack.DefinePlugin({
      __FEEDTHROUGH_OPTIONS__: JSON.stringify(this.options),
    }).apply(compiler);

    new compiler.webpack.EntryPlugin(
      compiler.context,
      CLIENT_ENTRY,
      { name: undefined },
    ).apply(compiler);
  }
}
