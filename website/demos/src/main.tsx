import { createRoot } from "react-dom/client";
import { Harness } from "./Harness";
import "./styles.css";

// No StrictMode on purpose — its double-invoked effects would run the timeline twice.
createRoot(document.getElementById("root")!).render(<Harness />);
