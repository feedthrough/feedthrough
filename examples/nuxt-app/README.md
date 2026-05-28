# Feedthrough — Nuxt example app

A minimal Nuxt 3 app that demonstrates `@feedthrough/nuxt`. Contains the same three
deliberate bugs as the React example.

## Running

```bash
# Terminal 1 — app (http://localhost:3001)
pnpm dev

# Terminal 2 — MCP server
cd ../../packages/mcp && node dist/index.js
```

## The bugs

Same as the [React example](../react-app/README.md#the-bugs) — off-by-one counter, case-sensitive
search, and a silent 404 on the activity feed.

## How feedthrough is wired in

`nuxt.config.ts` registers `@feedthrough/nuxt` in the `modules` array. The module exits early
when `nuxt.options.dev` is false, so `pnpm build` produces a clean production bundle with no
bridge code.
