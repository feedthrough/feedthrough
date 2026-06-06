import type { BridgeOptions } from "@feedthrough/core";
import type { Handle } from "@sveltejs/kit";
import { bridgeBundle } from "./generated/bundle.js";

export function setupFeedthrough(options: BridgeOptions = {}): Handle {
  return async ({ event, resolve }) => {
    if (process.env.NODE_ENV !== "development") return resolve(event);
    return resolve(event, {
      transformPageChunk({ html }) {
        const script = `<script>window.__feedthroughOptions=${JSON.stringify(options)};${bridgeBundle}</script>`;
        return html.replace("</head>", `${script}</head>`);
      },
    });
  };
}

export const feedthroughHandle: Handle = setupFeedthrough();
