# Feedthrough — Remix example app

A minimal Remix 2 app (Vite) that demonstrates `@feedthrough/remix`. Contains the same three
deliberate bugs as the React example.

## Running

```bash
# Terminal 1 — app (http://localhost:3003)
pnpm dev

# Terminal 2 — MCP server
cd ../../packages/mcp && node dist/index.js
```

## The bugs

Same as the [React example](../react-app/README.md#the-bugs) — off-by-one counter, case-sensitive
search, and a silent 404 on the activity feed.

## How feedthrough is wired in

`vite.config.ts` adds `feedthrough()` to the plugins array alongside `remix()`. The plugin uses
a `configureServer` middleware to intercept HTML responses from Remix's dev server and inject
the bridge script into `<head>`.

Because Remix renders HTML server-side, Vite's `transformIndexHtml` hook is never called — that
is why a dedicated middleware approach is needed rather than `@feedthrough/vite`. The plugin uses
`apply: "serve"` so it is completely absent from production builds.
