# @feedthrough/remix

[feedthrough.dev](https://feedthrough.dev) · [npm](https://www.npmjs.com/package/@feedthrough/remix) · [GitHub](https://github.com/feedthrough/feedthrough)

Remix adapter for [Feedthrough](https://feedthrough.dev). Injects the browser bridge into
every server-rendered page during development so an AI agent can observe console logs, network
requests, and DOM state in real time.

## Installation

```bash
npm install --save-dev @feedthrough/remix
```

## Setup

Wrap your Vite config with the `feedthrough()` plugin:

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import { vitePlugin as remix } from "@remix-run/dev";
import { feedthrough } from "@feedthrough/remix";

export default defineConfig({
  plugins: [remix(), feedthrough()],
});
```

The plugin applies only in dev mode (`apply: "serve"`) and is a no-op in production builds.

### Custom options

```typescript
feedthrough({ port: 8765 })
```

## Running with the MCP server

```bash
# Terminal 1 — app
npx vite dev

# Terminal 2 — MCP server
npx @feedthrough/mcp
```

Then connect Claude Code (or any MCP client) to the server.

## How it works

The adapter is a Vite plugin that hooks into the dev server via `configureServer`. It adds a
Connect middleware that intercepts HTML responses, injects the Feedthrough IIFE bridge into
`<head>`, and relays the modified response. Non-HTML responses (JS, CSS, images) pass through
unmodified.

Because Remix renders HTML server-side, Vite's `transformIndexHtml` hook is never called — that
is why a dedicated middleware is needed rather than `@feedthrough/vite`.
