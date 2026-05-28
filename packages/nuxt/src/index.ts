import { defineNuxtModule, addVitePlugin } from "@nuxt/kit";
import { feedthrough } from "@feedthrough/vite";
import type { BridgeOptions } from "@feedthrough/core";

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
    addVitePlugin(() => feedthrough(options));
  },
});
