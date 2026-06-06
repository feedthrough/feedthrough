import type { BridgeOptions } from "@feedthrough/core";
import { FeedthroughPlugin } from "@feedthrough/webpack";
import type { NextConfig } from "next";

/**
 * Wraps your Next.js config to inject the Feedthrough bridge in dev mode.
 *
 * @example
 * // next.config.ts
 * import { withFeedthrough } from "@feedthrough/nextjs";
 * export default withFeedthrough()(nextConfig);
 *
 * // With custom options:
 * export default withFeedthrough({ serverUrl: "ws://localhost:9000" })(nextConfig);
 */
export function withFeedthrough(options: BridgeOptions = {}) {
  return (nextConfig: NextConfig = {}): NextConfig => ({
    ...nextConfig,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // biome-ignore lint/suspicious/noExplicitAny: Next.js passes an untyped webpack config and context
    webpack(config: any, ctx: any) {
      if (ctx.dev && !ctx.isServer) {
        config.plugins ??= [];
        config.plugins.push(new FeedthroughPlugin(options));
      }
      if (typeof nextConfig.webpack === "function") {
        return nextConfig.webpack(config, ctx);
      }
      return config;
    },
  });
}
