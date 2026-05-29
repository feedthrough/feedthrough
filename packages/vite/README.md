# @feedthrough/vite

[feedthrough.dev](https://feedthrough.dev) · [npm](https://www.npmjs.com/package/@feedthrough/vite) · [GitHub](https://github.com/feedthrough/feedthrough)

Vite plugin for [Feedthrough](https://feedthrough.dev). Automatically injects the bridge in dev mode — no `main.ts`
changes needed.

## Install

```bash
npm install --save-dev @feedthrough/vite
```

## Usage

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { feedthrough } from "@feedthrough/vite";

export default defineConfig({
  plugins: [feedthrough()],
});
```

That's it. The bridge auto-connects on `vite dev`. No effect on production builds.

## Options

```ts
feedthrough({
  serverUrl: "ws://localhost:8765", // default
  reconnectDelay: 2000,             // ms, default
})
```

## Manual alternative

If you prefer not to use the plugin, add this to your entry point instead:

```ts
// main.ts
if (import.meta.env.DEV) {
  import("@feedthrough/core").then(({ init }) => init());
}
```
