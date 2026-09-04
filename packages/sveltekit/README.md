# @feedthrough/sveltekit

[feedthrough.dev](https://feedthrough.dev) · [npm](https://www.npmjs.com/package/@feedthrough/sveltekit) · [GitHub](https://github.com/feedthrough/feedthrough)

SvelteKit adapter for [Feedthrough](https://feedthrough.dev). Injects the browser bridge into
every server-rendered page during development so an AI agent can observe console logs, network
requests, and DOM state in real time.

## Installation

```bash
npm install --save-dev @feedthrough/sveltekit
```

## Setup

Add `feedthroughHandle` (or the result of `setupFeedthrough()`) to your `hooks.server.ts`:

```typescript
// src/hooks.server.ts
import { feedthroughHandle } from "@feedthrough/sveltekit";
import { sequence } from "@sveltejs/kit/hooks";

export const handle = sequence(feedthroughHandle);
```

If you have other handles, include them in the `sequence` call. Feedthrough is a no-op outside
`NODE_ENV=development`, so it is safe to leave wired in across all environments.

### Custom options

```typescript
import { setupFeedthrough } from "@feedthrough/sveltekit";
export const handle = sequence(setupFeedthrough({ serverUrl: "ws://localhost:8765" }));
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

## Running with the MCP server

```bash
# Terminal 1 — app
npx vite dev

# Terminal 2 — MCP server
npx @feedthrough/mcp
```

Then connect your AI agent (Claude Code, Cursor, or any other MCP client) to the server and
use `connection_status`, `get_console_logs`, `query_dom`, etc.

## How it works

The adapter exports a SvelteKit `Handle` function that uses `resolve(event, { transformPageChunk })`
to inject the Feedthrough IIFE bridge into the `<head>` of every HTML response. The bridge
script is embedded at build time — there are no runtime fetches from the adapter itself.

The guard `process.env.NODE_ENV !== "development"` means the handle is a transparent pass-through
in production builds.
