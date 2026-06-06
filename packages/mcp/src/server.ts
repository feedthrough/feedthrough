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
      "Call this first — every tool except get_instructions requires a connected browser.",
  }, () => Promise.resolve(
    bridge.startupError
      ? err(bridge.startupError)
      : ok({ connected: bridge.connected, tabs: bridge.tabs }),
  ));

  server.registerTool("get_console_logs", {
    description:
      "Return console output captured since the bridge connected. Covers every console method — " +
      "log/warn/error/info/debug plus dir, table, assert, trace, count, countReset, time/timeEnd/" +
      "timeLog, group/groupCollapsed/groupEnd, and clear. Each entry has a 'level' (the closest of " +
      "the five standard levels); rich methods also carry a 'method' field, and console.trace() " +
      "plus failing console.assert() entries include a 'stack'. Uncaught exceptions and unhandled " +
      "promise rejections are also captured (level 'error', method 'uncaught' / 'unhandledrejection') " +
      "even though the app never logged them. When the app is noisy with framework or deprecation " +
      "warnings, pass levels: ['error'] (or ['error', 'warn']) so the real errors aren't buried, " +
      "and use 'match' to narrow by content. Pass 'since' (a ms timestamp from an earlier entry's " +
      "'ts', or Date.now() before an action) to see only what happened after that point. Always " +
      "check this early — app errors and debug output often identify the root cause immediately.",
    inputSchema: {
      limit: z.number().int().positive().optional().describe("Return only the N most-recent entries"),
      levels: z.array(z.enum(["log", "warn", "error", "info", "debug"])).optional()
        .describe("Restrict to these levels — e.g. ['error'] to skip noisy warn/info/debug"),
      match: z.string().optional().describe("Case-insensitive substring filter on the serialized message content"),
      since: z.number().optional().describe("Only entries with ts >= this (ms epoch). Scope to 'what happened after I did X'."),
    },
  }, ({ limit, levels, match, since }) => run(bridge, "get_console_logs", {
    ...(limit !== undefined && { limit }),
    ...(levels !== undefined && { levels }),
    ...(match !== undefined && { match }),
    ...(since !== undefined && { since }),
  }));

  server.registerTool("get_network_requests", {
    description:
      "Return all fetch and XHR requests captured since the bridge connected, including URL, method, " +
      "HTTP status, duration, request and response headers, and request and response bodies " +
      "(bodies capped at 10 KB each — anything longer is truncated with a marker; binary responses " +
      "are summarised). Use this to find failed requests (4xx/5xx), wrong URLs, slow calls, or to " +
      "inspect what the app actually sent or received. Use 'filter' to narrow by URL/method and " +
      "'since' (a ms timestamp) to see only requests that fired after an action.",
    inputSchema: {
      filter: z.string().optional().describe("Filter by URL substring or HTTP method, e.g. 'api' or 'POST'"),
      since: z.number().optional().describe("Only requests with ts >= this (ms epoch). Scope to 'what fired after I did X'."),
    },
  }, ({ filter, since }) => run(bridge, "get_network_requests", {
    ...(filter !== undefined && { filter }),
    ...(since !== undefined && { since }),
  }));

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
      "bounding rect (top/right/bottom/left/width/height + page scroll and an inViewport flag), a " +
      "curated set of computed styles (layout, box model, typography, positioning, flex/grid), an " +
      "'overflow' block when content is clipped/overflowing (scroll vs client size + per-axis x/y " +
      "flags), an effective-visibility check ('visible' boolean, with a 'hiddenReason' such as " +
      "'ancestor div#modal display:none' or 'opacity:0' when not visible, accounting for ancestors), " +
      "and live form state where applicable (an input's current value, checked, disabled, etc.). " +
      "Pass 'properties' to additionally read any specific computed CSS properties by name — they " +
      "come back under 'requested'. Use this to understand why an element looks wrong or isn't " +
      "behaving as expected. Note: addEventListener-registered event handlers cannot be read from " +
      "the page; only inline on* handler attributes appear (in 'attributes').",
    inputSchema: {
      selector: z.string().describe("CSS selector — should match exactly one element"),
      properties: z.array(z.string()).optional()
        .describe("Extra computed CSS properties to read by name, e.g. ['transform', 'z-index', 'margin-top']"),
    },
  }, ({ selector, properties }) => run(bridge, "inspect", {
    selector,
    ...(properties !== undefined && { properties }),
  }));

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

  server.registerTool("press_key", {
    description:
      "Dispatch a key press (keydown/keypress/keyup) on an element — e.g. Enter to submit a search, " +
      "Escape to close a modal, Tab to move focus, or ArrowUp/ArrowDown in a list. Use named keys " +
      "(Enter, Escape, Tab, Backspace, Delete, ArrowUp/Down/Left/Right) or a single character. " +
      "Note: this fires key handlers but does NOT insert text into inputs — use 'fill' to set an " +
      "input's value, then press_key for the submit/shortcut.",
    inputSchema: {
      selector: z.string().describe("CSS selector for the element to receive the key"),
      key: z.string().describe("A key name (Enter, Escape, Tab, ArrowDown, …) or a single character"),
    },
  }, ({ selector, key }) => run(bridge, "press_key", { selector, key }));

  server.registerTool("get_html", {
    description:
      "Return the outerHTML of an element (capped at 50 KB). Use this when the summarised query_dom " +
      "output isn't enough and you need to see the actual markup/structure of a region.",
    inputSchema: { selector: z.string().describe("CSS selector — should match one element") },
  }, ({ selector }) => run(bridge, "get_html", { selector }));

  server.registerTool("get_page_info", {
    description:
      "Return basic page context: current URL, document title, readyState, viewport size, scroll " +
      "position, and user agent. Useful to orient at the start of a session or confirm navigation.",
  }, () => run(bridge, "get_page_info"));

  server.registerTool("set_style", {
    description:
      "Set one or more inline CSS properties on an element to PREVIEW a visual change live (e.g. " +
      "shrink a label that doesn't fit, adjust padding or width). This edits the running DOM only " +
      "— it is NOT saved to source and resets on reload — so tell the user it's a preview, and once " +
      "they're happy, make the real change in the CSS/component source. Inline styles override the " +
      "stylesheet and usually survive re-renders. The result includes a 'note' to relay; reset with " +
      "reset_overrides.",
    inputSchema: {
      selector: z.string().describe("CSS selector — should match one element"),
      properties: z.record(z.string(), z.string())
        .describe("CSS property → value map, e.g. { 'font-size': '13px', 'white-space': 'nowrap' }"),
    },
  }, ({ selector, properties }) => run(bridge, "set_style", { selector, properties }));

  server.registerTool("set_attribute", {
    description:
      "Set or remove an attribute on an element to preview a change (toggle disabled, swap a class, " +
      "set an aria-* attribute). Pass value=null to remove the attribute. Live preview only — not " +
      "saved to source, resets on reload. If the attribute is one a framework controls (class, " +
      "value, checked, disabled, …) the result includes a 'frameworkWarning' that it may be " +
      "reverted on the next render — relay it. Reset with reset_overrides.",
    inputSchema: {
      selector: z.string().describe("CSS selector — should match one element"),
      name: z.string().describe("Attribute name"),
      value: z.string().nullable().describe("New value, or null to remove the attribute"),
    },
  }, ({ selector, name, value }) => run(bridge, "set_attribute", { selector, name, value }));

  server.registerTool("set_text", {
    description:
      "Replace an element's text content to preview wording/label changes. Live preview only — not " +
      "saved to source, resets on reload. textContent is almost always framework-controlled, so the " +
      "result includes a 'frameworkWarning' that React/Vue/etc. will likely overwrite it on the next " +
      "render — relay that, and persist real changes in the source. Reset with reset_overrides.",
    inputSchema: {
      selector: z.string().describe("CSS selector — should match one element"),
      text: z.string().describe("New text content"),
    },
  }, ({ selector, text }) => run(bridge, "set_text", { selector, text }));

  server.registerTool("reset_overrides", {
    description:
      "Undo every set_style / set_attribute / set_text change the bridge has applied since it " +
      "connected, restoring the original values. Best effort: elements the framework has since " +
      "re-created may not roll back (a page reload always fully resets).",
  }, () => run(bridge, "reset_overrides"));

  process.stderr.write(`[feedthrough] MCP server starting, bridge WebSocket on ws://127.0.0.1:${port}\n`);
  await server.connect(new StdioServerTransport());
}
