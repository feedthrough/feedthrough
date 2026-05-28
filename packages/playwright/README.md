# @feedthrough/playwright

Playwright adapter for Feedthrough. Injects the bridge into every page before it loads, so
console output and network requests are captured from the first line of page JavaScript.

While your tests run, an AI agent connected to the MCP server can observe what's happening
in the browser in real time — useful for diagnosing test failures interactively.

## Install

```bash
npm install --save-dev @feedthrough/playwright
```

## Usage

Replace the `@playwright/test` import in your spec files with `@feedthrough/playwright`:

```ts
// tests/example.spec.ts
import { test, expect } from "@feedthrough/playwright";

test("my test", async ({ page }) => {
  await page.goto("/");
  // bridge is already injected — MCP server can observe this page
});
```

Or create a shared fixture file to avoid touching every spec:

```ts
// tests/fixtures.ts
export { test, expect } from "@feedthrough/playwright";
```

## Options

If you need a non-default server URL, use `setupFeedthrough` instead of the pre-built `test`:

```ts
import { setupFeedthrough, expect } from "@feedthrough/playwright";

export const test = setupFeedthrough({ serverUrl: "ws://localhost:9000" });
export { expect };
```

## Running alongside the MCP server

```bash
# Terminal 1 — MCP server
node node_modules/@feedthrough/mcp/dist/index.js

# Terminal 2 — tests
npx playwright test
```

An AI agent can connect to the MCP server while the tests are running and observe each page
via `get_console_logs`, `get_network_requests`, and `query_dom`.
