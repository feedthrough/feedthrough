# Feedthrough

**Debug with AI — from inside your app.**

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
| [`@feedthrough/playwright`](packages/playwright) | Playwright adapter — injects the bridge via `page.addInitScript()` |
| [`@feedthrough/vite`](packages/vite) | Vite plugin for apps with a static `index.html` |
| [`@feedthrough/webpack`](packages/webpack) | Webpack plugin — adds bridge as a global entry point |
| [`@feedthrough/nextjs`](packages/nextjs) | Next.js adapter — wraps `next.config.ts` with `withFeedthrough()` |
| [`@feedthrough/nuxt`](packages/nuxt) | Nuxt 3 module |
| [`@feedthrough/sveltekit`](packages/sveltekit) | SvelteKit adapter — injects via the `handle` hook |
| [`@feedthrough/remix`](packages/remix) | Remix adapter — injects via a Vite dev server middleware |

---

## Framework support

| Framework | Adapter | Notes |
|---|---|---|
| Vite + React / Vue / Solid / Preact | `@feedthrough/vite` | Static `index.html` — plugin uses `transformIndexHtml` |
| Next.js | `@feedthrough/nextjs` | Wraps the webpack config; dev only |
| Nuxt 3 | `@feedthrough/nuxt` | Registers as a Nuxt module; dev only |
| SvelteKit | `@feedthrough/sveltekit` | `handle` hook with `transformPageChunk`; dev only |
| Remix | `@feedthrough/remix` | Vite dev server middleware; dev only |
| Webpack apps | `@feedthrough/webpack` | Global entry point; guards against production mode |
| Cypress | `@feedthrough/cypress` | `window:before:load` hook |
| Playwright | `@feedthrough/playwright` | `page.addInitScript()` |

---

## Quick start

### 1. Start the MCP server

```bash
npx @feedthrough/mcp
```

The server listens for browser connections on `ws://127.0.0.1:8765` and exposes MCP tools on
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

**Vite + React / Vue / Solid / Preact:**

```ts
// vite.config.ts
import { feedthrough } from "@feedthrough/vite";
export default defineConfig({ plugins: [feedthrough()] });
```

**Next.js:**

```ts
// next.config.ts
import { withFeedthrough } from "@feedthrough/nextjs";
export default withFeedthrough()({ /* your next config */ });
```

**Nuxt 3:**

```ts
// nuxt.config.ts
export default defineNuxtConfig({ modules: ["@feedthrough/nuxt"] });
```

**SvelteKit:**

```ts
// src/hooks.server.ts
import { feedthroughHandle } from "@feedthrough/sveltekit";
import { sequence } from "@sveltejs/kit/hooks";
export const handle = sequence(feedthroughHandle);
```

**Remix:**

```ts
// vite.config.ts
import { feedthrough } from "@feedthrough/remix";
export default defineConfig({ plugins: [remix(), feedthrough()] });
```

**Webpack:**

```ts
// webpack.config.mjs
import { FeedthroughPlugin } from "@feedthrough/webpack";
export default { plugins: [new FeedthroughPlugin()] };
```

**Cypress:**

```ts
// cypress/support/e2e.ts
import { setupFeedthrough } from "@feedthrough/cypress";
setupFeedthrough();
```

**Playwright:**

```ts
// import test from the adapter instead of @playwright/test
import { test, expect } from "@feedthrough/playwright";
```

**Or manually (any bundler):**

```ts
// main.ts
if (import.meta.env.DEV) {
  import("@feedthrough/core").then(({ init }) => init());
}
```

### 4. Open your page and start asking

Once the bridge connects you'll see `[feedthrough] tab connected` in the MCP server output.
For the simplest experience, keep a single tab open. Multiple tabs can connect at the same time
and commands are routed to the most recently active one, but a single tab avoids any ambiguity.

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
| `get_instructions()` | Usage guide — recommended workflow, tool ordering, and selector tips |
| `click(selector)` | Click an element |
| `fill(selector, value)` | Type into an input field |
| `hover(selector)` | Trigger mouseover/mouseenter |
| `inspect_element(selector)` | Tag, classes, attributes, bounding rect, computed styles |
| `query_dom(selector)` | All elements matching a CSS selector |
| `get_console_logs(limit?)` | Captured console output since the bridge connected |
| `get_network_requests(filter?)` | Captured fetch + XHR requests, with status codes |
| `connection_status()` | List connected tabs and which one is currently active |

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

## Using with an AI agent

### Recommended workflow

1. `connection_status()` — confirm the bridge is connected before anything else
2. `get_console_logs()` — errors and app output often identify the root cause immediately
3. `get_network_requests()` — look for failed fetches, wrong URLs, or missing calls
4. `query_dom(selector)` — find elements and check what's rendered
5. `inspect_element(selector)` — deep-dive on a specific element
6. `click()` / `fill()` — interact, then re-check logs and network

### Claude Code — CLAUDE.md snippet

Add this to your project's `CLAUDE.md` to prime Claude with the right workflow:

```markdown
## Debugging with Feedthrough

A Feedthrough MCP server is configured. When investigating UI bugs:

1. Call `connection_status()` first — fail fast if no browser is connected.
2. Check `get_console_logs()` before touching the DOM.
3. Check `get_network_requests()` for failed or missing API calls.
4. Use `query_dom` to orient yourself, `inspect_element` to dig into a specific element.
5. Interact with `click` / `fill`, then re-check logs.

Prefer element IDs as selectors — they're stable. Avoid long attribute selectors.
```

### Sample system prompt

For one-off sessions with any MCP client:

```
You have access to the Feedthrough MCP server. It gives you live access to a running web app
from inside the browser — console logs, network requests, DOM state, and the ability to click
and fill inputs. Start by calling get_instructions() for the recommended workflow.
```

---

## Security

v1 is local-only. Two guards enforce this:

- **Localhost binding** — the WebSocket server binds to `127.0.0.1`, so it is not reachable
  from other machines on the network.
- **Origin validation** — each incoming WebSocket connection is checked against its `Origin` header.
  Connections from any origin other than `localhost` or `127.0.0.1` are rejected.

Do not inject `@feedthrough/core` into production builds.

---

## Development

```bash
pnpm install       # install all workspace deps
pnpm build         # build all packages
pnpm typecheck     # typecheck all packages
```

Requires Node.js ≥ 22 and pnpm.

## Releasing

All packages are versioned together. To cut a release:

```bash
# 1. Bump all packages to the new version
pnpm -r exec npm version 0.2.0 --no-git-tag-version
git add packages/*/package.json
git commit -m "Release 0.2.0"
git push

# 2. Publish to npm (run from the repo root, requires npm login)
pnpm -r --filter './packages/*' publish

# 3. Tag and create a GitHub release
git tag v0.2.0 && git push origin v0.2.0
```

---

## License

MIT — see [LICENSE](LICENSE).
