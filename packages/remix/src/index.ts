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
      // Register before Vite/Remix internals so the res.end patch is in place
      // when Remix renders HTML and calls res.end.
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
          const _write = res.write.bind(res);
          const _end = res.end.bind(res);
          const chunks: Buffer[] = [];

          (res as any).write = (chunk: any, ...rest: any[]): boolean => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
            return true;
          };

          (res as any).end = (chunk?: any, ...rest: any[]): ServerResponse => {
            if (chunk != null && chunk !== "") {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
            }
            const ct = String(res.getHeader("content-type") ?? "");
            const combined = Buffer.concat(chunks);
            if (ct.includes("text/html")) {
              const injected = combined.toString("utf-8").replace("</head>", `${script}</head>`);
              res.removeHeader("content-length");
              return _end(injected);
            }
            return _end(combined);
          };

          next();
        });
    },
  };
}
