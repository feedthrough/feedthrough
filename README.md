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

Many physics and chemistry experiments run inside a sealed vacuum chamber, with all the air
pumped out so nothing contaminates the experiment. The catch: you still need to control
instruments inside the chamber and read their measurements, and the smallest air leak ruins
the run. A feedthrough is the part that solves this — a specially engineered connector that
carries electrical signals through the chamber wall while keeping the vacuum perfectly intact.
You can't reach inside, but the feedthrough lets you observe and control what's happening in
there anyway.

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
| `query_dom(selector)` | All elements matching a CSS selector |
| `inspect_element(selector, properties?)` | Tag, attributes, full bounding rect + inViewport, curated computed styles, live form state; `properties` reads extra CSS props by name |
| `get_html(selector)` | Raw outerHTML of a region (capped at 50 KB) |
| `get_console_logs(limit?, levels?, match?, since?)` | Console output (all methods) plus uncaught errors & promise rejections; filter by `levels`, `match`, or `since` timestamp |
| `get_network_requests(filter?, since?)` | Captured fetch + XHR — URL, method, status, duration, headers, request/response bodies (10 KB cap); narrow by `filter` or `since` |
| `get_page_info()` | URL, title, readyState, viewport size, scroll position, user agent |
| `connection_status()` | List connected tabs and which one is currently active |
| `click(selector)` | Click an element |
| `fill(selector, value)` | Type into an input field |
| `hover(selector)` | Trigger mouseover/mouseenter |
| `press_key(selector, key)` | Dispatch a key press — Enter, Escape, Tab, arrow keys, or a character |
| `set_style(selector, properties)` | Preview a visual fix — set inline CSS live (not saved to source) |
| `set_attribute(selector, name, value)` | Preview an attribute change — toggle disabled, swap a class, set aria-* (`null` removes) |
| `set_text(selector, text)` | Preview wording/label changes — replace an element's text |
| `reset_overrides()` | Undo every live `set_style` / `set_attribute` / `set_text` change |

**Live edit is a preview, not a save.** `set_style` / `set_attribute` / `set_text` mutate the
running DOM so the agent can show you a fix without a rebuild. They are *not* written to your
source and reset on reload/HMR. The loop: the agent previews live, you confirm, then it edits the
actual source to make it stick. Changes a framework owns (text, controlled attributes) may be
overwritten on the next render — the tool result flags this so the agent can tell you.

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

### Project-memory snippet

Add this to whatever project-memory file your AI agent reads — `CLAUDE.md` for Claude Code,
`.cursor/rules/*.md` for Cursor, and so on — to prime it with the right workflow:

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

### What gets captured

Captured network requests include request and response **bodies and headers**, including
`Authorization`, `Cookie`, and any other headers your app sends. That's intentional — debugging
auth and session flows needs them. But the data does leave the page over the local WebSocket,
flows through the MCP server, and reaches whichever AI agent you've connected. If that agent is
cloud-backed, sensitive values reach the provider. Run Feedthrough only on dev machines and dev
data. Do not inject `@feedthrough/core` into production builds.

---

## Development

```bash
pnpm install       # install all workspace deps
pnpm build         # build all packages
pnpm typecheck     # typecheck all packages
```

Requires Node.js ≥ 22 and pnpm.

## Releasing

Packages are versioned **independently** — bump only the package(s) you actually changed and leave
the rest alone. Publishing to npm is handled by CI: the `Publish to npm` workflow runs on every
published GitHub Release and publishes only the packages whose `name@version` isn't on npm yet,
skipping the ones already published (via OIDC trusted publishing, no tokens).

To cut a release:

```bash
# 1. Bump the changed package(s) only
pnpm --filter @feedthrough/mcp exec npm version 0.1.1 --no-git-tag-version
# When bumping @feedthrough/mcp, also bump the version (and packages[].version) in
# packages/mcp/server.json to match — the MCP registry validates them against npm.
git add packages/mcp/package.json packages/mcp/server.json
git commit -m "Release @feedthrough/mcp 0.1.1"
git push

# 2. Create a GitHub Release (this triggers the publish workflow)
gh release create v0.1.1 --title "v0.1.1" --notes "..."
```

The workflow builds all packages and publishes only the newly bumped ones. When `@feedthrough/mcp`
itself is published, the workflow also publishes it to the [official MCP registry](https://registry.modelcontextprotocol.io)
(`io.github.feedthrough/feedthrough`) via GitHub OIDC — no extra step. Mark the release as a
pre-release to skip publishing.

---

## License

MIT — see [LICENSE](LICENSE).
