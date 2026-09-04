import type { BridgeOptions } from "@feedthrough/core";
import { resolveBridgeOptions } from "@feedthrough/core/node";
import type { Handle } from "@sveltejs/kit";
import { bridgeBundle } from "./generated/bundle.js";

export function setupFeedthrough(options: BridgeOptions = {}): Handle {
  // Resolved once in Node and inlined into the page, so FEEDTHROUGH_PORT in the
  // dev server's environment points the bridge at a server that moved off 8765.
  const resolved = resolveBridgeOptions(options);

  return async ({ event, resolve }) => {
    if (process.env.NODE_ENV !== "development") return resolve(event);
    return resolve(event, {
      transformPageChunk({ html }) {
        const script = `<script>window.__feedthroughOptions=${JSON.stringify(resolved)};${bridgeBundle}</script>`;
        return html.replace("</head>", `${script}</head>`);
      },
    });
  };
}

export const feedthroughHandle: Handle = setupFeedthrough();
