# Feedthrough

**An MCP server that lives inside your web app and knows its internals.**

Feedthrough injects a lightweight debug bridge into any running web page, then exposes everything
— DOM state, console logs, network requests, and user interactions — as MCP tools. Any
MCP-compatible AI agent can inspect and drive the page conversationally, in real time.

```
Browser (any)
 └── @feedthrough/core          ← injected into your page
      ├── console interceptor
      ├── fetch / XHR interceptor
      └── DOM inspector
      ↕  WebSocket
@feedthrough/mcp               ← MCP server, exposes tools over stdio
 └── Tools: click, fill, inspect_element, query_dom,
            get_console_logs, get_network_requests, …
      ↕  MCP protocol
Claude Code / Cursor / any MCP client
```

---

## The name

A feedthrough is a vacuum systems component that passes signals in and out of a sealed chamber
without breaking the vacuum. You can't reach inside directly — but the feedthrough lets you
observe and control what's happening in there anyway.

The parallel is exact: Feedthrough extracts runtime debug data from inside a running web app
without disturbing it, and sends control signals back in — clicks, keystrokes, DOM queries —
without breaking the execution environment.

---

## Why Feedthrough?

Every other browser MCP tool is an **external observer** — it controls the browser from outside
via Puppeteer or CDP and only works in Chrome. Feedthrough is an **embedded agent**. It runs
*inside* the page, so it sees:

- Framework internals (React component trees, Redux store, custom globals)
- Any browser, not just Chrome
- Your existing dev workflow — no separate controlled browser to launch
- Cypress's own browser context during test runs

---

## Packages

| Package | Description |
|---|---|
| [`@feedthrough/core`](packages/core) | In-browser bridge — intercepts console, fetch, XHR; handles commands |
| [`@feedthrough/mcp`](packages/mcp) | MCP server — bridges any MCP client to the browser via WebSocket |
| [`@feedthrough/cypress`](packages/cypress) | Cypress adapter — auto-injects the bridge before each test page load |
| [`@feedthrough/vite`](packages/vite) | Vite plugin — auto-injects in dev mode *(coming soon)* |
| [`@feedthrough/webpack`](packages/webpack) | Webpack plugin *(coming soon)* |

---

## Quick start

### 1. Start the MCP server

```bash
npx @feedthrough/mcp
```

The server listens for a browser connection on `ws://localhost:8765` and exposes MCP tools on
stdio. Override the port with `FEEDTHROUGH_PORT=9000`.

### 2. Add it to your MCP client config

```json
{
  "mcpServers": {
    "feedthrough": {
      "command": "npx",
      "args": ["@feedthrough/mcp"]
    }
  }
}
```

### 3. Inject the bridge into your page

**Vite / any bundler — dev only:**

```ts
// main.ts
if (import.meta.env.DEV) {
  import("@feedthrough/core").then(({ init }) => init());
}
```

**Cypress:**

```ts
// cypress/support/e2e.ts
import { setupFeedthrough } from "@feedthrough/cypress";
setupFeedthrough();
```

### 4. Open your page and start asking Claude

Once the bridge connects you'll see `[feedthrough] browser connected` in the MCP server output.
Then ask your AI agent:

```
> What's on the page right now?
> Click the submit button and tell me what network requests fired
> Why is the counter showing the wrong value?
```

---

## MCP tools

| Tool | Description |
|---|---|
| `click(selector)` | Click an element |
| `fill(selector, value)` | Type into an input field |
| `hover(selector)` | Trigger mouseover/mouseenter |
| `inspect_element(selector)` | Tag, classes, attributes, bounding rect, computed styles |
| `query_dom(selector)` | All elements matching a CSS selector |
| `get_console_logs(limit?)` | Captured console output since the bridge connected |
| `get_network_requests(filter?)` | Captured fetch + XHR requests, with status codes |
| `screenshot()` | Page screenshot *(requires canvas library — coming soon)* |
| `connection_status()` | Check whether a browser is currently connected |

---

## Example app

`examples/react-app` is a small React app with three deliberate bugs — a good sandbox for
trying out the diagnostic workflow:

```bash
# Terminal 1 — app
cd examples/react-app && pnpm dev    # http://localhost:5173

# Terminal 2 — MCP server
cd packages/mcp && node dist/index.js
```

Connect an AI agent and ask it to find what's wrong. The three bugs are all invisible from the
UI but findable in under a minute via `get_console_logs`, `get_network_requests`, and `query_dom`.

---

## Development

```bash
pnpm install       # install all workspace deps
pnpm build         # build all packages
pnpm typecheck     # typecheck all packages
```

Requires Node.js ≥ 22 and pnpm.

---

## License

MIT — see [LICENSE](LICENSE).
