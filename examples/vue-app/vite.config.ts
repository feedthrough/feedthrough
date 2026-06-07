import { feedthrough } from "@feedthrough/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    vue(),
    // Dev only (apply: "serve") — has no effect on production builds.
    feedthrough(),
  ],
});
