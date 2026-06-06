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
    id: "press-key",
    name: "press_key(selector, key)",
    short: "Dispatch a key press — Enter to submit, Escape to close, Tab, arrow keys",
    long: "Dispatches keydown/keypress/keyup on an element — Enter to submit a search, Escape to close a modal, Tab to move focus, ArrowUp/ArrowDown in a list. Use named keys (Enter, Escape, Tab, Backspace, Delete, ArrowUp/Down/Left/Right) or a single character. Note: it fires key handlers but does not insert text into inputs — use fill to set a value, then press_key for the submit/shortcut.",
    inputs: [
      { name: "selector", type: "string", desc: "CSS selector for the element to receive the key" },
      { name: "key", type: "string", desc: "A key name (Enter, Escape, ArrowDown, …) or a single character" },
    ],
  },
  {
    id: "inspect-element",
    name: "inspect_element(selector, properties?)",
    short: "Tag, attributes, rect, styles, overflow, visibility, occlusion, and live form state",
    long: "Returns full details about a single element: tag, id, classes, all attributes, text content, bounding rect (top/right/bottom/left/width/height plus page scroll and an inViewport flag), a curated set of computed styles (layout, box model, typography, positioning, flex/grid), an overflow block when content is clipped or overflowing (scroll vs client size plus per-axis x/y flags), an effective-visibility check (a visible boolean, plus a hiddenReason like 'ancestor div#modal display:none' or 'opacity:0' when it isn't, accounting for ancestors), an occlusion check (a hittable boolean from a center-point hit-test, plus an occludedBy reference to whatever covers it), and live form state where applicable (an input's current value, checked, disabled, readOnly, etc.). Pass properties to additionally read any specific computed CSS properties by name — they come back under a requested object. Note: addEventListener-registered handlers can't be read from the page; only inline on* handler attributes appear (under attributes).",
    inputs: [
      { name: "selector", type: "string", desc: "CSS selector — should match exactly one element" },
      { name: "properties", type: "string[] (optional)", desc: "Extra computed CSS properties to read by name, e.g. ['transform', 'z-index', 'margin-top']" },
    ],
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
    name: "get_console_logs(limit?, levels?, match?, since?)",
    short: "Console output from every method — plus uncaught errors & rejections",
    long: "Returns console output captured since the bridge connected. Covers every console method — log/warn/error/info/debug plus dir, table, assert, trace, count, countReset, time/timeEnd/timeLog, group/groupCollapsed/groupEnd, and clear. Uncaught exceptions and unhandled promise rejections are captured too (level error, method uncaught / unhandledrejection) even though the app never logged them. Each entry has a level; rich methods carry a method field, and trace/assert/uncaught entries include a stack. When the app is noisy, pass levels: ['error'] so real errors aren't buried, use match to narrow by content, and use since (a ms timestamp) to see only what happened after an action.",
    inputs: [
      { name: "limit", type: "number (optional)", desc: "Return only the N most recent entries" },
      { name: "levels", type: "('log'|'warn'|'error'|'info'|'debug')[] (optional)", desc: "Restrict to these levels — e.g. ['error'] to skip noisy warn/info/debug" },
      { name: "match", type: "string (optional)", desc: "Case-insensitive substring filter on the serialized message content" },
      { name: "since", type: "number (optional)", desc: "Only entries with ts >= this (ms epoch). Scope to 'what happened after I did X'." },
    ],
  },
  {
    id: "get-network-requests",
    name: "get_network_requests(filter?, since?)",
    short: "Fetch + XHR with headers and request/response bodies, capped at 10 KB",
    long: "Returns every fetch and XHR captured since the bridge connected, including URL, method, HTTP status, duration, request and response headers, and request and response bodies. Bodies are capped at 10 KB each — anything longer is truncated with a marker; binary responses (image/video/audio/font/octet-stream/pdf/zip) are summarised as a placeholder. Use this to find failed requests (4xx/5xx), wrong URLs, slow calls, or to inspect what the app actually sent or received. Use filter to narrow by URL/method and since (a ms timestamp) to see only requests that fired after an action.",
    inputs: [
      { name: "filter", type: "string (optional)", desc: "Filter by URL substring or HTTP method, e.g. 'api' or 'POST'" },
      { name: "since", type: "number (optional)", desc: "Only requests with ts >= this (ms epoch). Scope to 'what fired after I did X'." },
    ],
  },
  {
    id: "connection-status",
    name: "connection_status()",
    short: "Check whether a browser is currently connected",
    long: "Checks whether a browser with the Feedthrough bridge is currently connected. Returns the connected flag and a list of open tabs (id, url, which is the active one). Call this first — every tool except get_instructions requires a connected browser.",
  },
  {
    id: "get-html",
    name: "get_html(selector)",
    short: "Raw outerHTML of a region (capped at 50 KB)",
    long: "Returns the outerHTML of an element, capped at 50 KB. Use this when the summarised query_dom output isn't enough and you need to see the actual markup and structure of a region.",
    inputs: [{ name: "selector", type: "string", desc: "CSS selector — should match one element" }],
  },
  {
    id: "get-page-info",
    name: "get_page_info()",
    short: "URL, title, readyState, viewport, scroll position",
    long: "Returns basic page context: current URL, document title, readyState, viewport size, scroll position, and user agent. Useful to orient at the start of a session or to confirm a navigation happened.",
  },
  {
    id: "set-style",
    name: "set_style(selector, properties)",
    short: "Preview a visual fix live — set inline CSS on an element (not saved to source)",
    long: "Sets one or more inline CSS properties on an element to preview a visual change live — shrink a label that doesn't fit, adjust padding, width, etc. This edits the running DOM only: it is NOT written to your source and resets on reload/HMR, so it's a preview the agent shows you, then persists by editing the actual CSS/component source once you're happy. Inline styles override the stylesheet and usually survive re-renders. Undo with reset_overrides.",
    inputs: [
      { name: "selector", type: "string", desc: "CSS selector — should match one element" },
      { name: "properties", type: "Record<string,string>", desc: "CSS property → value map, e.g. { 'font-size': '13px', 'white-space': 'nowrap' }" },
    ],
  },
  {
    id: "set-attribute",
    name: "set_attribute(selector, name, value)",
    short: "Preview an attribute change — toggle disabled, swap a class, set aria-* (not saved)",
    long: "Sets or removes an attribute on an element to preview a change (toggle disabled, swap a class, set an aria-* attribute). Pass value=null to remove it. Live preview only — not saved to source, resets on reload. If the attribute is one a framework controls (class, value, checked, disabled, …) the result includes a frameworkWarning that it may be reverted on the next render. Undo with reset_overrides.",
    inputs: [
      { name: "selector", type: "string", desc: "CSS selector — should match one element" },
      { name: "name", type: "string", desc: "Attribute name" },
      { name: "value", type: "string | null", desc: "New value, or null to remove the attribute" },
    ],
  },
  {
    id: "set-text",
    name: "set_text(selector, text)",
    short: "Preview wording/label changes — replace an element's text (not saved)",
    long: "Replaces an element's text content to preview wording or label changes. Live preview only — not saved to source, resets on reload. textContent is almost always framework-controlled, so the result includes a frameworkWarning that React/Vue/etc. will likely overwrite it on the next render; persist real changes in the source. Undo with reset_overrides.",
    inputs: [
      { name: "selector", type: "string", desc: "CSS selector — should match one element" },
      { name: "text", type: "string", desc: "New text content" },
    ],
  },
  {
    id: "reset-overrides",
    name: "reset_overrides()",
    short: "Undo every live set_style / set_attribute / set_text change",
    long: "Undoes every set_style, set_attribute, and set_text change the bridge has applied since it connected, restoring the original values. Best effort: elements the framework has since re-created may not roll back, and a page reload always fully resets.",
  },
];
