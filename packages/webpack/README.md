# @feedthrough/webpack

[feedthrough.dev](https://feedthrough.dev) · [npm](https://www.npmjs.com/package/@feedthrough/webpack) · [GitHub](https://github.com/feedthrough/feedthrough)

Webpack 5 plugin for [Feedthrough](https://feedthrough.dev). Injects the bridge automatically in development mode — no
changes to your app code needed. Has no effect on production builds.

## Install

```bash
npm install --save-dev @feedthrough/webpack
```

## Usage

```js
// webpack.config.mjs
import { FeedthroughPlugin } from "@feedthrough/webpack";

export default {
  plugins: [
    new FeedthroughPlugin(),
  ],
};
```

`FeedthroughPlugin` adds the bridge as a global webpack entry. It returns immediately if
`compiler.options.mode` is not `"development"`, so production builds are clean.

Make sure your `build` script passes `--mode production` so the mode is set correctly:

```json
{
  "scripts": {
    "dev": "webpack serve",
    "build": "webpack --mode production"
  }
}
```

## Options

```js
new FeedthroughPlugin({
  serverUrl: "ws://localhost:8765", // default
  reconnectDelay: 2000,             // ms, default
})
```

## ESM resolution note

`@feedthrough/core` is compiled with `moduleResolution: Bundler`, which produces
extension-less imports that webpack 5 rejects in strict ESM mode. Add this rule to your
webpack config to allow them:

```js
module: {
  rules: [{ test: /\.m?js$/, resolve: { fullySpecified: false } }],
},
```

## Running alongside the MCP server

```bash
# Terminal 1 — app
webpack serve

# Terminal 2 — MCP server
node node_modules/@feedthrough/mcp/dist/index.js
```
