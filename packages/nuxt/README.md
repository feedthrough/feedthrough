# @feedthrough/nuxt

[feedthrough.dev](https://feedthrough.dev) · [npm](https://www.npmjs.com/package/@feedthrough/nuxt) · [GitHub](https://github.com/feedthrough/feedthrough)

Nuxt 3 module for [Feedthrough](https://feedthrough.dev). Registers the Vite plugin when running in dev mode.
Production builds (`nuxt build`) are unaffected.

## Install

```bash
npm install --save-dev @feedthrough/nuxt
```

## Usage

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: [
    // Dev only — no-op in production builds.
    "@feedthrough/nuxt",
  ],
});
```

## Options

Pass options via the `feedthrough` config key:

```ts
export default defineNuxtConfig({
  modules: ["@feedthrough/nuxt"],
  feedthrough: {
    serverUrl: "ws://localhost:8765", // default
    reconnectDelay: 2000,             // ms, default
  },
});
```

## How it works

The module calls `nuxt.options.dev` and exits early when building for production. In dev mode
it calls `addVitePlugin(() => feedthrough(options))`, which registers the `@feedthrough/vite`
plugin — the same plugin used in standalone Vite projects.

## Running alongside the MCP server

```bash
# Terminal 1 — app
nuxt dev

# Terminal 2 — MCP server
node node_modules/@feedthrough/mcp/dist/index.js
```
