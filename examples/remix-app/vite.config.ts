import { vitePlugin as remix } from "@remix-run/dev";
import { feedthrough } from "@feedthrough/remix";
import { defineConfig } from "vite";

// feedthrough() applies in dev mode only — production builds are unaffected.
export default defineConfig({
  plugins: [remix(), feedthrough()],
});
