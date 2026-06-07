import type { BridgeOptions } from "@feedthrough/core";
import { feedthrough } from "@feedthrough/vite";
import { addVitePlugin, defineNuxtModule } from "@nuxt/kit";

/**
 * Nuxt module that injects the Feedthrough bridge in dev mode.
 *
 * @example
 * // nuxt.config.ts
 * export default defineNuxtConfig({
 *   modules: ["@feedthrough/nuxt"],
 * });
 *
 * // With custom options:
 * export default defineNuxtConfig({
 *   modules: ["@feedthrough/nuxt"],
 *   feedthrough: { serverUrl: "ws://localhost:9000" },
 * });
 */
export default defineNuxtModule<BridgeOptions>({
  meta: {
    name: "@feedthrough/nuxt",
    configKey: "feedthrough",
  },
  defaults: {},
  setup(options, nuxt) {
    if (!nuxt.options.dev) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // biome-ignore lint/suspicious/noExplicitAny: addVitePlugin parameter type does not match the plugin inferred type
    addVitePlugin(() => feedthrough(options) as any);
  },
});
