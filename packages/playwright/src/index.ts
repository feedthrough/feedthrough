import type { BridgeOptions } from "@feedthrough/core";
import { test as baseTest } from "@playwright/test";
import { bridgeBundle } from "./generated/bundle.js";

export { expect } from "@playwright/test";

/**
 * Returns a `test` object with the Feedthrough bridge pre-injected into every
 * page. The bridge connects to the MCP server so an AI agent can observe
 * console logs, network requests, and DOM state during the test run.
 *
 * @example
 * // playwright.config.ts or a fixture file
 * export { test, expect } from "@feedthrough/playwright";
 */
export function setupFeedthrough(options: BridgeOptions = {}) {
  return baseTest.extend({
    page: async ({ page }, use) => {
      await page.addInitScript({
        content: `window.__feedthroughOptions = ${JSON.stringify(options)};\n${bridgeBundle}`,
      });
      await use(page);
    },
  });
}

export const test = setupFeedthrough();
