import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { BridgeClient } from "./bridge-client.js";

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: true };

function ok(value: unknown): ToolResult {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}

function err(e: unknown): ToolResult {
  return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true };
}

async function run(bridge: BridgeClient, action: string, params: Record<string, unknown> = {}): Promise<ToolResult> {
  try {
    return ok(await bridge.sendCommand(action, params));
  } catch (e) {
    return err(e);
  }
}

const INSTRUCTIONS = `\
# Feedthrough — usage guide

Feedthrough gives you live access to a running web app from inside the browser runtime.
The bridge is injected into the page, so you see framework state, not just the rendered DOM.

## Recommended workflow

1. Call \`connection_status()\` first. If not connected, ask the user to open their app and
   check that the bridge is injected (Vite plugin, Cypress adapter, or manual init).

2. Start with observation before action:
   - \`get_console_logs()\` — errors and app-level logging often pinpoint the problem immediately
   - \`get_network_requests()\` — look for failed fetches (4xx/5xx), wrong URLs, missing calls
   - \`query_dom(selector)\` — find elements and check what's rendered

3. Then interact:
   - \`inspect_element(selector)\` — deep-dive on a specific element (styles, rect, attributes)
   - \`click(selector)\` — trigger buttons, links, or any clickable element
   - \`fill(selector, value)\` — type into inputs; works with React, Vue, and plain inputs

4. After interacting, re-check logs and network to see what changed.

## Tips

- IDs are the most reliable selectors: \`#submit-btn\`, \`#search-input\`
- \`query_dom\` returns all matches; use it to count items or verify what's in a list
- Console errors often include stack traces pointing to the exact source line
- Network requests include duration — slow requests are visible immediately
- All data is captured from the moment the bridge connects; reload the page to reset
`;

export async function startServer(port = 8765): Promise<void> {
  const bridge = new BridgeClient(port);
  const server = new McpServer({ name: "feedthrough", version: "0.1.0" });

  server.registerTool("get_instructions", {
    description:
      "Returns a usage guide for Feedthrough: recommended workflow, tool-ordering tips, and selector advice. " +
      "Call this at the start of a debugging session if you are unfamiliar with Feedthrough or want a quick refresher.",
  }, () => Promise.resolve(ok(INSTRUCTIONS)));

  server.registerTool("connection_status", {
    description:
      "Check whether a browser with the Feedthrough bridge is currently connected. " +
      "Returns connected flag and a list of open tabs (id, url, which is active). " +
      "Call this first — all other tools fail if no browser is connected.",
  }, () => Promise.resolve(ok({ connected: bridge.connected, tabs: bridge.tabs })));

  server.registerTool("get_console_logs", {
    description:
      "Return console output (log, warn, error, info, debug) captured since the bridge connected. " +
      "Always check this early — app errors and debug output often identify the root cause immediately. " +
      "Error entries include the full stack trace.",
    inputSchema: { limit: z.number().int().positive().optional().describe("Return only the N most-recent entries") },
  }, ({ limit }) => run(bridge, "get_console_logs", limit !== undefined ? { limit } : {}));

  server.registerTool("get_network_requests", {
    description:
      "Return all fetch and XHR requests captured since the bridge connected, including URL, method, " +
      "HTTP status, and duration. Use this to find failed requests (4xx/5xx), wrong URLs, slow calls, " +
      "or requests that should have fired but didn't.",
    inputSchema: { filter: z.string().optional().describe("Filter by URL substring or HTTP method, e.g. 'api' or 'POST'") },
  }, ({ filter }) => run(bridge, "get_network_requests", filter !== undefined ? { filter } : {}));

  server.registerTool("query_dom", {
    description:
      "Query the page with a CSS selector and return a summary of every matching element " +
      "(tag, id, classes, text content). Good for counting list items, checking what's rendered, " +
      "or finding the right selector before calling inspect_element or click.",
    inputSchema: { selector: z.string().describe("CSS selector") },
  }, ({ selector }) => run(bridge, "query_dom", { selector }));

  server.registerTool("inspect_element", {
    description:
      "Return full details about a single element: tag, id, classes, all attributes, text content, " +
      "bounding rect (position and size on screen), and key computed styles (display, visibility, color). " +
      "Use this when you need to understand why an element looks wrong or isn't behaving as expected.",
    inputSchema: { selector: z.string().describe("CSS selector — should match exactly one element") },
  }, ({ selector }) => run(bridge, "inspect", { selector }));

  server.registerTool("click", {
    description:
      "Click an element. Triggers the same event sequence as a real user click. " +
      "Use IDs when possible (#submit-btn) for reliable targeting. " +
      "Returns the tag and id of the clicked element.",
    inputSchema: { selector: z.string().describe("CSS selector for the element to click") },
  }, ({ selector }) => run(bridge, "click", { selector }));

  server.registerTool("fill", {
    description:
      "Type a value into an input, textarea, or select element. Fires input and change events, " +
      "so it works correctly with React, Vue, and other frameworks that use controlled inputs. " +
      "For React inputs, prefer the element's id selector (#search-input).",
    inputSchema: {
      selector: z.string().describe("CSS selector for the input element"),
      value: z.string().describe("Value to type"),
    },
  }, ({ selector, value }) => run(bridge, "fill", { selector, value }));

  server.registerTool("hover", {
    description:
      "Hover over an element, firing mouseover and mouseenter events. " +
      "Useful for triggering tooltips, dropdown menus, or hover states.",
    inputSchema: { selector: z.string().describe("CSS selector") },
  }, ({ selector }) => run(bridge, "hover", { selector }));

  process.stderr.write(`[feedthrough] MCP server starting, bridge WebSocket on ws://127.0.0.1:${port}\n`);
  await server.connect(new StdioServerTransport());
}
