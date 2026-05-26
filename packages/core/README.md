# @feedthrough/core

The in-browser debug bridge. Intercepts console output, fetch, and XHR; handles incoming
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

## IIFE bundle

`dist/feedthrough.iife.js` is a self-contained bundle for direct injection into any page
(used by `@feedthrough/cypress` and the bookmarklet). It reads initial options from
`window.__feedthroughOptions` before connecting.
