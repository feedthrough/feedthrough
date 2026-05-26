import { bridgeBundle } from "./generated/bundle.js";
import type { BridgeOptions } from "@feedthrough/core";

/**
 * Call this in your cypress/support/e2e.ts to inject the Feedthrough bridge
 * into every page under test before its scripts run.
 *
 * @example
 * // cypress/support/e2e.ts
 * import { setupFeedthrough } from "@feedthrough/cypress";
 * setupFeedthrough();
 */
export function setupFeedthrough(options: BridgeOptions = {}): void {
  Cypress.on("window:before:load", (win) => {
    win.__feedthroughOptions = options;
    // Execute the bridge bundle in the AUT window's scope so that `window`,
    // `console`, and `fetch` inside the bundle all refer to the AUT globals.
    win.eval(bridgeBundle);
  });
}
