# @feedthrough/core

[feedthrough.dev](https://feedthrough.dev) · [npm](https://www.npmjs.com/package/@feedthrough/core) · [GitHub](https://github.com/feedthrough/feedthrough)

The in-browser debug bridge for [Feedthrough](https://feedthrough.dev). Intercepts console output, fetch, and XHR; handles incoming
commands; streams everything to the MCP server over WebSocket.

## Usage

```ts
import { init } from "@feedthrough/core";

// Connect to the default MCP server at ws://localhost:8765
const bridge = init();

// Or with options
const bridge = init({ serverUrl: "ws://localhost:9000" });

// Clean up
bridge.destroy();
```

**Dev-only pattern** (zero cost in production):

```ts
if (import.meta.env.DEV) {
  import("@feedthrough/core").then(({ init }) => init());
}
```

## What it captures

- **Console** — `log`, `warn`, `error`, `info`, `debug`. Originals still fire normally.
- **Network** — `fetch` and `XMLHttpRequest`, both pending and resolved (with status code and
  duration).
- **Commands** — incoming MCP tool calls: `click`, `fill`, `hover`, `inspect`, `query_dom`,
  `get_console_logs`, `get_network_requests`.

## Options

```ts
interface BridgeOptions {
  serverUrl?: string;      // default: "ws://localhost:8765"
  reconnectDelay?: number; // ms between reconnect attempts, default: 2000
}
```

## How it connects

The bridge opens a WebSocket to the MCP server (`@feedthrough/mcp`) on startup. If the
connection fails or drops it reconnects automatically. Messages are queued and flushed once the
socket opens, so nothing is lost even if the bridge initialises before the server is ready.

The server answers with a `welcome` naming itself, which the bridge logs once and keeps on
`bridge.server` (also `window.__feedthrough.server`, and returned by the `get_page_info`
command):

```
[feedthrough] connected to quiet-olive-heron (ws://localhost:8766)
```

That is how you tell, with several agent sessions running on one machine, which server this page
is actually paired with. It is `null` against a server older than 0.4, which sends no `welcome`.
The line is logged through a `console.log` reference captured before the interceptor installs, so
it never shows up in `get_console_logs`.

## Node helper

`@feedthrough/core/node` exports `resolveBridgeOptions(options)` for the build-tool adapters. It
fills in `serverUrl` from `FEEDTHROUGH_URL`, else `FEEDTHROUGH_PORT`, else port 8765 — read in
Node and serialised into the page, so the browser never needs to discover the server. An explicit
`serverUrl` is returned untouched. Not part of the browser bundle.

## IIFE bundle

`dist/feedthrough.iife.js` is a self-contained bundle for direct injection into any page
(used by `@feedthrough/cypress` and the bookmarklet). It reads initial options from
`window.__feedthroughOptions` before connecting.
