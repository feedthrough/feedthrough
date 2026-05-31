import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Plain Vite + React. These demos are reenactments — the harness simulates the
// agent and applies the visual effects itself, so no Feedthrough bridge is injected.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
