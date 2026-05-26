# @feedthrough/cypress

Cypress adapter for Feedthrough. Automatically injects the bridge into the app under test
before each page load, so console output and network requests are captured from the very first
line of page JavaScript.

## Setup

```bash
npm install --save-dev @feedthrough/cypress
```

Add one line to your Cypress support file:

```ts
// cypress/support/e2e.ts
import { setupFeedthrough } from "@feedthrough/cypress";
setupFeedthrough();
```

That's it. Every `cy.visit()` will have the bridge running.

## Options

```ts
setupFeedthrough({
  serverUrl: "ws://localhost:8765", // default
  reconnectDelay: 2000,             // ms, default
});
```

## How it works

`setupFeedthrough` registers a `window:before:load` hook. Cypress fires this before each page
load and passes the AUT (app under test) window object. The adapter sets any options on
`win.__feedthroughOptions`, then calls `win.eval(bridgeBundle)` to execute the bridge in the
correct window scope — so `console`, `fetch`, and `XHR` are patched in the AUT frame, not the
Cypress runner frame.

The bridge bundle is embedded at build time (9 KB, no runtime file reads).

## Running alongside the MCP server

Start the MCP server before running Cypress:

```bash
# Terminal 1
node node_modules/@feedthrough/mcp/dist/index.js

# Terminal 2
npx cypress run
```

Claude Code can then interact with the page while Cypress tests are running.
