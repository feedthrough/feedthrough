import HtmlWebpackPlugin from "html-webpack-plugin";
import { FeedthroughPlugin } from "@feedthrough/webpack";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// mode is set by webpack-cli: "development" for `webpack serve`, "production" for
// `webpack --mode production`. FeedthroughPlugin is a no-op in production mode.
export default {
  entry: "./src/index.js",
  output: {
    path: resolve(__dirname, "dist"),
    clean: true,
  },
  // Extension-less imports from ESM packages compiled with moduleResolution: Bundler
  // (e.g. @feedthrough/core) need fullySpecified disabled for webpack to resolve them.
  module: {
    rules: [{ test: /\.m?js$/, resolve: { fullySpecified: false } }],
  },
  plugins: [
    new HtmlWebpackPlugin({ template: "./public/index.html" }),
    new FeedthroughPlugin(),
  ],
  devServer: {
    port: 5175,
  },
};
