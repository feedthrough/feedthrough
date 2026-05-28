# Feedthrough — Next.js example app

A minimal Next.js 15 app (App Router) that demonstrates `@feedthrough/nextjs`. Contains
the same three deliberate bugs as the React example.

## Running

```bash
# Terminal 1 — app (http://localhost:3000)
pnpm dev

# Terminal 2 — MCP server
cd ../../packages/mcp && node dist/index.js
```

## The bugs

Same as the [React example](../react-app/README.md#the-bugs) — off-by-one counter, case-sensitive
search, and a silent 404 on the activity feed.

## How feedthrough is wired in

`next.config.ts` wraps the config with `withFeedthrough()`. The wrapper adds `FeedthroughPlugin`
to the client-side webpack config only when `ctx.dev` is true. Running `pnpm build` produces
a clean production bundle with no bridge code.
