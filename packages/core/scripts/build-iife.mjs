import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/browser.ts"],
  bundle: true,
  format: "iife",
  target: "es2020",
  outfile: "dist/feedthrough.iife.js",
});

console.log("built dist/feedthrough.iife.js");
