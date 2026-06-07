import { fileURLToPath } from "node:url";
import type { BridgeOptions } from "@feedthrough/core";
import type { HtmlTagDescriptor, Plugin } from "vite";

const MODULE_ID = "virtual:feedthrough";
const RESOLVED_ID = "\0virtual:feedthrough";
const CORE_ID = "@feedthrough/core";

export function feedthrough(options: BridgeOptions = {}): Plugin {
  return {
    name: "feedthrough",
    apply: "serve",

    async resolveId(id, importer, opts) {
      if (id === MODULE_ID) return RESOLVED_ID;
      // Vite can't resolve bare imports from a virtual module (no real directory).
      // Resolve @feedthrough/core relative to this plugin file instead.
      if (importer === RESOLVED_ID && id === CORE_ID) {
        return this.resolve(id, fileURLToPath(import.meta.url), { ...opts, skipSelf: true });
      }
    },

    load(id) {
      if (id !== RESOLVED_ID) return;
      return `import { init } from "${CORE_ID}";\ninit(${JSON.stringify(options)});\n`;
    },

    transformIndexHtml(): HtmlTagDescriptor[] {
      return [
        {
          tag: "script",
          attrs: { type: "module", src: `/@id/${MODULE_ID}` },
          injectTo: "body",
        },
      ];
    },
  };
}
