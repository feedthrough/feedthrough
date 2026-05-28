# Feedthrough — webpack example app

A plain JavaScript app using webpack 5 that demonstrates `@feedthrough/webpack`. Contains
the same three deliberate bugs as the React example, so the diagnostic workflow is identical.

## Running

```bash
# Terminal 1 — app (http://localhost:5175)
pnpm dev

# Terminal 2 — MCP server
cd ../../packages/mcp && node dist/index.js
```

## The bugs

Same as the [React example](../react-app/README.md#the-bugs) — off-by-one counter, case-sensitive
search, and a silent 404 on the activity feed.

## How feedthrough is wired in

`FeedthroughPlugin` is added to `webpack.config.mjs`. The plugin only activates when
`compiler.options.mode === "development"`, so `pnpm build` (which passes `--mode production`)
produces a clean bundle with no bridge code.
