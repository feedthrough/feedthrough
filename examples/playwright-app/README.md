# Feedthrough — Playwright example

A static HTML app with three deliberate bugs and Playwright tests that trigger them. The
`@feedthrough/playwright` fixture injects the bridge before every page load, so an AI agent
can observe console logs, network requests, and DOM state while the tests run.

## Running

```bash
# Terminal 1 — MCP server (optional, for AI agent observation)
cd ../../packages/mcp && node dist/index.js

# Terminal 2 — tests
pnpm test
```

The tests pass — they verify the buggy behaviour. The point is that the bridge is live during
the run, so an AI agent can inspect what's happening interactively.

## The bugs

The three bugs are the same as in the [React example](../react-app/README.md#the-bugs): an
off-by-one counter, case-sensitive search, and a silent 404 on the activity feed.

## How feedthrough is wired in

`tests/demo.spec.ts` imports `test` and `expect` from `@feedthrough/playwright` instead of
`@playwright/test`. That's the only change needed — the fixture wraps the built-in `page`
and calls `page.addInitScript()` to inject the bridge before each navigation.
