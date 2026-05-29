import type { Plugin } from "vite";
import type { BridgeOptions } from "@feedthrough/core";
import { bridgeBundle } from "./generated/bundle.js";
import type { IncomingMessage, ServerResponse } from "node:http";

export function feedthrough(options: BridgeOptions = {}): Plugin {
  const script = `<script>window.__feedthroughOptions=${JSON.stringify(options)};${bridgeBundle}</script>`;

  return {
    name: "feedthrough-remix",
    apply: "serve",
    configureServer(server) {
      // Remix renders HTML at request time (no static index.html to transform),
      // so we inject by patching the response stream. We touch *only* the first
      // HTML chunk containing </head>: assets, JSON, and the streamed body after
      // the <head> all pass straight through untouched, so Remix's streaming SSR
      // is preserved and non-HTML responses are never buffered.
      server.middlewares.use((_req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const origWrite = res.write.bind(res);
        const origEnd = res.end.bind(res);

        let done = false; // injected, or decided not to — stop intercepting
        let held = "";    // partial HTML buffered only while seeking </head>

        const isHtml = () => String(res.getHeader("content-type") ?? "").includes("text/html");

        // Returns true if the chunk was consumed here (written or held);
        // false means the caller should write it through normally.
        const intercept = (chunk: unknown): boolean => {
          if (done) return false;
          if (!isHtml()) { done = true; return false; }
          const text = held + toStr(chunk);
          const idx = text.indexOf("</head>");
          if (idx === -1) { held = text; return true; } // keep seeking
          done = true;
          held = "";
          res.removeHeader("content-length"); // injected script changes the length
          origWrite(text.slice(0, idx) + script + text.slice(idx));
          return true;
        };

        res.write = function (chunk: unknown, ...rest: unknown[]): boolean {
          if (chunk != null && intercept(chunk)) {
            const cb = rest.find((a) => typeof a === "function") as (() => void) | undefined;
            cb?.();
            return true;
          }
          return (origWrite as (...a: unknown[]) => boolean)(chunk, ...rest);
        } as typeof res.write;

        res.end = function (chunk?: unknown, ...rest: unknown[]): ServerResponse {
          if (chunk != null && chunk !== "" && typeof chunk !== "function" && !intercept(chunk)) {
            origWrite(chunk as string | Buffer);
          }
          if (held) { origWrite(held); held = ""; } // never saw </head>; flush as-is
          return (origEnd as (...a: unknown[]) => ServerResponse)(
            typeof chunk === "function" ? chunk : undefined,
            ...rest,
          );
        } as typeof res.end;

        next();
      });
    },
  };
}

function toStr(chunk: unknown): string {
  return Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
}
