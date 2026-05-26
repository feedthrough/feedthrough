import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

// Initialize the Feedthrough bridge in dev mode only — zero cost in production.
if (import.meta.env.DEV) {
  import("@feedthrough/core").then(({ init }) => init());
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
