# @feedthrough/nextjs

[feedthrough.dev](https://feedthrough.dev) · [npm](https://www.npmjs.com/package/@feedthrough/nextjs) · [GitHub](https://github.com/feedthrough/feedthrough)

Next.js adapter for [Feedthrough](https://feedthrough.dev). Wraps your Next.js config to inject the bridge on the
client side in dev mode. Production builds (`next build`) are unaffected.

## Install

```bash
npm install --save-dev @feedthrough/nextjs
```

## Usage

```ts
// next.config.ts
import type { NextConfig } from "next";
import { withFeedthrough } from "@feedthrough/nextjs";

const nextConfig: NextConfig = {
  // your existing config
};

// withFeedthrough() only injects code when Next.js is running in dev mode.
export default withFeedthrough()(nextConfig);
```

## Options

```ts
export default withFeedthrough({
  serverUrl: "ws://localhost:8765", // default
  reconnectDelay: 2000,             // ms, default
})(nextConfig);
```

### Choosing the port

`serverUrl` defaults to `ws://localhost:8765`, but the plugin resolves it in Node when you
don't pass one, so the environment can override it:

```bash
FEEDTHROUGH_PORT=8766 npm run dev     # or FEEDTHROUGH_URL=ws://localhost:8766
```

That matters when several AI agent sessions run on one machine: only one MCP server gets 8765
and the rest step up, so each session starts its dev server with the port `connection_status()`
reported. An explicit `serverUrl` always wins over the environment.

## How it works

`withFeedthrough` adds a `FeedthroughPlugin` (from `@feedthrough/webpack`) to the client-side
webpack config. The plugin is only applied when `ctx.dev && !ctx.isServer`, so it never runs
in production builds or on the server bundle.

## Running alongside the MCP server

```bash
# Terminal 1 — app
next dev

# Terminal 2 — MCP server
node node_modules/@feedthrough/mcp/dist/index.js
```
