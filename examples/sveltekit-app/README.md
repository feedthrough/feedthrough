# Feedthrough — SvelteKit example app

A minimal SvelteKit 2 app that demonstrates `@feedthrough/sveltekit`. Contains the same three
deliberate bugs as the React example.

## Running

```bash
# Terminal 1 — app (http://localhost:3002)
pnpm dev

# Terminal 2 — MCP server
cd ../../packages/mcp && node dist/index.js
```

## The bugs

Same as the [React example](../react-app/README.md#the-bugs) — off-by-one counter, case-sensitive
search, and a silent 404 on the activity feed.

## How feedthrough is wired in

`src/hooks.server.ts` imports `feedthroughHandle` from `@feedthrough/sveltekit` and passes it
to SvelteKit's `sequence()`. The handle uses `resolve(event, { transformPageChunk })` to inject
the bridge into the `<head>` of every rendered page.

The guard `process.env.NODE_ENV !== "development"` means `pnpm build` produces a clean
production bundle with no bridge code.
