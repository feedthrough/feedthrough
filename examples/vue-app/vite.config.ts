import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { feedthrough } from "@feedthrough/vite";

export default defineConfig({
  plugins: [
    vue(),
    // Dev only (apply: "serve") — has no effect on production builds.
    feedthrough(),
  ],
});
