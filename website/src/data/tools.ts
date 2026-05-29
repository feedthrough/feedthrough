export type ToolInput = { name: string; type: string; desc: string };

export type Tool = {
  id: string;            // URL-safe slug used as the anchor on /tools
  name: string;          // signature shown on cards
  short: string;         // one-line description for index Tools cards
  long: string;          // fuller description for the /tools page
  inputs?: ToolInput[];  // typed inputs, if any
};

export const tools: Tool[] = [
  {
    id: "get-instructions",
    name: "get_instructions()",
    short: "Usage guide — recommended workflow and selector tips",
    long: "Returns a usage guide for Feedthrough: recommended workflow, tool-ordering tips, and selector advice. Call this at the start of a debugging session if you're unfamiliar with Feedthrough or want a quick refresher.",
  },
  {
    id: "click",
    name: "click(selector)",
    short: "Click any element by CSS selector",
    long: "Clicks an element. Triggers the same event sequence as a real user click — useful for any button, link, or anything with a click handler attached. Returns the tag and id of the clicked element. Prefer IDs as selectors when possible (#submit-btn) for stable targeting.",
    inputs: [{ name: "selector", type: "string", desc: "CSS selector for the element to click" }],
  },
  {
    id: "fill",
    name: "fill(selector, value)",
    short: "Type into an input, fires input + change events",
    long: "Types a value into an input, textarea, or select element. Uses the element's own native value setter and dispatches input and change events, so it works correctly with React, Vue, and other frameworks that track controlled inputs via reference-equality on the underlying value.",
    inputs: [
      { name: "selector", type: "string", desc: "CSS selector for the input element" },
      { name: "value", type: "string", desc: "Value to type into the element" },
    ],
  },
  {
    id: "hover",
    name: "hover(selector)",
    short: "Trigger mouseover / mouseenter",
    long: "Hovers over an element by dispatching mouseover and mouseenter events. Useful for triggering tooltips, dropdown menus, hover states, or anything else gated behind a pointerover-like interaction.",
    inputs: [{ name: "selector", type: "string", desc: "CSS selector for the element to hover" }],
  },
  {
    id: "inspect-element",
    name: "inspect_element(selector)",
    short: "Tag, classes, attributes, bounding rect, computed styles",
    long: "Returns full details about a single element: tag, id, classes, all attributes, text content, bounding rect (position and size on screen), and key computed styles (display, visibility, color, background-color). Use this when you need to understand why an element looks wrong or isn't behaving as expected.",
    inputs: [{ name: "selector", type: "string", desc: "CSS selector — should match exactly one element" }],
  },
  {
    id: "query-dom",
    name: "query_dom(selector)",
    short: "All elements matching a selector, summarised",
    long: "Queries the page with a CSS selector and returns a summary of every matching element (tag, id, classes, truncated text content). Good for counting list items, checking what's rendered, or finding the right selector before calling inspect_element or click.",
    inputs: [{ name: "selector", type: "string", desc: "CSS selector to query" }],
  },
  {
    id: "get-console-logs",
    name: "get_console_logs(limit?, levels?, match?)",
    short: "Console output from every method — log/warn/error, plus dir, table, assert, trace, count, time, group",
    long: "Returns console output captured since the bridge connected. Covers every console method — log/warn/error/info/debug plus dir, table, assert, trace, count, countReset, time/timeEnd/timeLog, group/groupCollapsed/groupEnd, and clear. Each entry has a level (the closest of the five standard levels); rich methods also carry a method field, and console.trace() plus failing console.assert() entries include a stack. When the app is noisy with framework or deprecation warnings, pass levels: ['error'] (or ['error', 'warn']) so real errors aren't buried, and use match to narrow further by content. Always check this early — app errors and debug output often pinpoint the root cause immediately.",
    inputs: [
      { name: "limit", type: "number (optional)", desc: "Return only the N most recent entries" },
      { name: "levels", type: "('log'|'warn'|'error'|'info'|'debug')[] (optional)", desc: "Restrict to these levels — e.g. ['error'] to skip noisy warn/info/debug" },
      { name: "match", type: "string (optional)", desc: "Case-insensitive substring filter on the serialized message content" },
    ],
  },
  {
    id: "get-network-requests",
    name: "get_network_requests(filter?)",
    short: "Fetch + XHR with headers and request/response bodies, capped at 10 KB",
    long: "Returns every fetch and XHR captured since the bridge connected, including URL, method, HTTP status, duration, request and response headers, and request and response bodies. Bodies are capped at 10 KB each — anything longer is truncated with a marker; binary responses (image/video/audio/font/octet-stream/pdf/zip) are summarised as a placeholder. Use this to find failed requests (4xx/5xx), wrong URLs, slow calls, or to inspect what the app actually sent or received. Use the filter argument to narrow results.",
    inputs: [{ name: "filter", type: "string (optional)", desc: "Filter by URL substring or HTTP method, e.g. 'api' or 'POST'" }],
  },
  {
    id: "connection-status",
    name: "connection_status()",
    short: "Check whether a browser is currently connected",
    long: "Checks whether a browser with the Feedthrough bridge is currently connected. Returns the connected flag and a list of open tabs (id, url, which is the active one). Call this first — every tool except get_instructions requires a connected browser.",
  },
];
