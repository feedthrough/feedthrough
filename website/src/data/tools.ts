export type ToolInput = { name: string; type: string; desc: string };

export type Tool = {
  id: string; // URL-safe slug used as the anchor on /tools
  name: string; // signature shown on cards
  short: string; // one-line description for index Tools cards
  long: string; // fuller description for the /tools page
  inputs?: ToolInput[]; // typed inputs, if any
};

export const tools: Tool[] = [
  {
    id: "get-instructions",
    name: "get_instructions()",
    short: "Usage guide — recommended workflow and selector tips",
    long: "Returns the Feedthrough usage guide as a Markdown document, with sections for the recommended workflow, tool-ordering tips, and selector advice. Read-only and takes no arguments; it doesn't touch the page or require a connected browser. Call it at the start of a debugging session if you're unfamiliar with Feedthrough or want a quick refresher.",
  },
  {
    id: "click",
    name: "click(selector)",
    short: "Click any element by CSS selector",
    long: "Clicks an element by calling its native click(), firing a click event and running the default activation (follow a link, toggle a checkbox/radio, submit a form). It does not synthesize the preceding pointer/mouse sequence (pointerdown/mousedown/mouseup) or move focus, so use press_key for keyboard-driven activation. If the selector matches nothing the call returns an error; it doesn't scroll the element into view or wait for any resulting navigation, network, or re-render to settle, returning as soon as the click is dispatched (observe the effect with a follow-up get_console_logs/get_network_requests/query_dom). Returns the tag and id of the clicked element. Prefer IDs as selectors when possible (#submit-btn) for stable targeting.",
    inputs: [
      {
        name: "selector",
        type: "string",
        desc: "CSS selector for the element to click, e.g. '#submit-btn' or 'button[type=submit]'. First match in document order wins.",
      },
    ],
  },
  {
    id: "fill",
    name: "fill(selector, value)",
    short: "Type into an input, fires input + change events",
    long: "Sets the value of an input, textarea, or select element. Focuses it, assigns the value through the element's own native value setter, then dispatches bubbling input and change events, so React, Vue, and other frameworks that track controlled inputs register the change. The value is set in one shot rather than typed character by character, so per-keystroke handlers (keydown/keypress/keyup) do not fire; follow with press_key to send Enter or a shortcut. Errors if the selector matches nothing, and returns as soon as the events are dispatched (it doesn't wait for downstream validation or re-renders).",
    inputs: [
      {
        name: "selector",
        type: "string",
        desc: "CSS selector for the input, textarea, or select to fill, e.g. '#email' or 'input[name=q]'.",
      },
      {
        name: "value",
        type: "string",
        desc: "The full value to set. Replaces the field's current contents (not appended); for a <select>, pass the target option's value.",
      },
    ],
  },
  {
    id: "hover",
    name: "hover(selector)",
    short: "Trigger mouseover / mouseenter",
    long: "Hovers over an element by dispatching synthetic mouseover and mouseenter events, triggering JavaScript hover handlers so tooltips, popovers, and dropdown/submenus mount into the DOM (read them back with query_dom, get_html, or inspect_element). Three things to know: it doesn't activate the CSS :hover pseudo-class, so content shown purely via :hover in CSS won't appear this way; no mouseout/mouseleave is sent, so the hovered state stays until the app tears it down; and events fire whether or not the element is visible (it isn't scrolled into view), so a successful call doesn't by itself confirm anything rendered. Errors if the selector matches nothing.",
    inputs: [
      {
        name: "selector",
        type: "string",
        desc: "CSS selector for the element to hover, e.g. '#menu-trigger' or '.tooltip-anchor'. Target the element that owns the hover handler (usually the trigger, not the popup).",
      },
    ],
  },
  {
    id: "press-key",
    name: "press_key(selector, key)",
    short: "Dispatch a key press — Enter to submit, Escape to close, Tab, arrow keys",
    long: "Dispatches keydown/keypress/keyup on an element (Enter to submit a search, Escape to close a modal, Tab to move focus, ArrowUp/ArrowDown in a list). Use named keys (Enter, Escape, Tab, Backspace, Delete, ArrowUp/Down/Left/Right) or a single character. Note it fires key handlers but does not insert text into inputs, so use fill to set a value, then press_key for the submit/shortcut. Errors if the selector matches nothing, and returns without waiting for any resulting navigation or re-render.",
    inputs: [
      {
        name: "selector",
        type: "string",
        desc: "CSS selector for the element that receives the key, e.g. '#search-input'. Target a focused or focusable element.",
      },
      {
        name: "key",
        type: "string",
        desc: "A named key (Enter, Escape, Tab, Backspace, Delete, ArrowUp/Down/Left/Right, case-sensitive) or any single character ('a', '/').",
      },
    ],
  },
  {
    id: "inspect-element",
    name: "inspect_element(selector, properties?)",
    short:
      "Tag, attributes, rect, path, styles, overflow, visibility, occlusion, a11y, and form state",
    long: "Returns full details about a single element: tag, id, classes, all attributes, text content, bounding rect (top/right/bottom/left/width/height plus page scroll and an inViewport flag), a compact ancestor path (like 'body > main > div#app > button.cta') for structural context, a curated set of computed styles (layout, box model, typography, positioning, flex/grid), an overflow block when content is clipped or overflowing (scroll vs client size plus per-axis x/y flags), a clipped block when an ancestor's overflow cuts the element off (naming the clipping ancestor and which edges), an effective-visibility check (a visible boolean, plus a hiddenReason like 'ancestor div#modal display:none' or 'opacity:0' when it isn't, accounting for ancestors), an occlusion check (a hittable boolean from a center-point hit-test, plus an occludedBy reference to whatever covers it), an a11y block (resolved role, best-effort accessible name, and key states like expanded, checked, selected, disabled, hidden, and tabindex), a pseudo block with ::before/::after content when set (icon fonts, generated text), and live form state where applicable (an input's current value, checked, disabled, readOnly, etc.). Pass properties to additionally read any specific computed CSS properties by name; they come back under a requested object. Read-only: it only reads element state and never changes the page, and it returns an error if the selector matches nothing. Note: addEventListener-registered handlers can't be read from the page; only inline on* handler attributes appear (under attributes).",
    inputs: [
      {
        name: "selector",
        type: "string",
        desc: "CSS selector that should resolve to one element, e.g. '#submit-btn' or 'main .card:first-child'. If several match, the first in document order is inspected.",
      },
      {
        name: "properties",
        type: "string[] (optional)",
        desc: "Extra computed CSS properties to read by name (kebab-case), e.g. ['transform', 'z-index', 'margin-top']. Returned under a 'requested' object.",
      },
    ],
  },
  {
    id: "query-dom",
    name: "query_dom(selector)",
    short: "All elements matching a selector, summarised",
    long: "Queries the page with a CSS selector and returns a summary of every matching element (tag, id, classes, truncated text content). Good for counting list items, checking what's rendered, or finding the right selector before calling inspect_element or click. Read-only: it only reads the DOM and never changes the page, and it returns an empty list (not an error) when nothing matches, so it's also a safe existence check.",
    inputs: [
      {
        name: "selector",
        type: "string",
        desc: "CSS selector matched against the whole document, e.g. '.todo-item', '#search-input', or 'nav a'. Returns every match, so it doubles as a count or existence check.",
      },
    ],
  },
  {
    id: "get-console-logs",
    name: "get_console_logs(limit?, levels?, match?, since?)",
    short: "Console output from every method — plus uncaught errors & rejections",
    long: "Returns console output captured since the bridge connected. Covers every console method (log/warn/error/info/debug plus dir, table, assert, trace, count, countReset, time/timeEnd/timeLog, group/groupCollapsed/groupEnd, and clear). Uncaught exceptions and unhandled promise rejections are captured too (level error, method uncaught / unhandledrejection) even though the app never logged them. Each entry has a level; rich methods carry a method field, and trace/assert/uncaught entries include a stack. When the app is noisy, pass levels: ['error'] so real errors aren't buried, use match to narrow by content, and use since (a ms timestamp) to see only what happened after an action. Read-only: it returns a passively captured buffer and neither clears the console nor changes the page.",
    inputs: [
      {
        name: "limit",
        type: "number (optional)",
        desc: "Cap the result to the N most-recent entries, e.g. 50. Omit to return everything captured.",
      },
      {
        name: "levels",
        type: "('log'|'warn'|'error'|'info'|'debug')[] (optional)",
        desc: "Restrict to these levels, e.g. ['error'] to skip noisy warn/info/debug, or ['error', 'warn'] for both. Omit for all levels.",
      },
      {
        name: "match",
        type: "string (optional)",
        desc: "Case-insensitive substring filter on the serialized message content",
      },
      {
        name: "since",
        type: "number (optional)",
        desc: "Only entries with ts >= this (ms epoch). Scope to 'what happened after I did X'.",
      },
    ],
  },
  {
    id: "get-network-requests",
    name: "get_network_requests(filter?, since?)",
    short: "Fetch + XHR with headers and request/response bodies, capped at 10 KB",
    long: "Returns every fetch and XHR captured since the bridge connected, including URL, method, HTTP status, duration, request and response headers, and request and response bodies. Bodies are capped at 10 KB each (anything longer is truncated with a marker); binary responses (image/video/audio/font/octet-stream/pdf/zip) are summarised as a placeholder. Use this to find failed requests (4xx/5xx), wrong URLs, slow calls, or to inspect what the app actually sent or received. Use filter to narrow by URL/method and since (a ms timestamp) to see only requests that fired after an action. Read-only: it returns a passively captured log and does not issue or modify any requests.",
    inputs: [
      {
        name: "filter",
        type: "string (optional)",
        desc: "Filter by URL substring or HTTP method, e.g. 'api' or 'POST'",
      },
      {
        name: "since",
        type: "number (optional)",
        desc: "Only requests with ts >= this (ms epoch). Scope to 'what fired after I did X'.",
      },
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
    long: "Returns the outerHTML of an element, capped at 50 KB. Use this when the summarised query_dom output isn't enough and you need to see the actual markup and structure of a region. Read-only: it only reads the DOM and makes no changes, and it returns an error if the selector matches nothing.",
    inputs: [
      {
        name: "selector",
        type: "string",
        desc: "CSS selector for the region to dump, e.g. '#app' or '.modal'. First match wins; scope it tightly since outerHTML is capped at 50 KB.",
      },
    ],
  },
  {
    id: "get-page-info",
    name: "get_page_info()",
    short: "URL, title, readyState, viewport, scroll position",
    long: "Returns basic page context: current URL, document title, readyState, viewport size, scroll position, and user agent. Read-only and non-destructive: it only reads page state and makes no changes. Useful to orient at the start of a session or to confirm a navigation happened.",
  },
  {
    id: "set-style",
    name: "set_style(selector, properties)",
    short: "Preview a visual fix live — set inline CSS on an element (not saved to source)",
    long: "Sets one or more inline CSS properties on an element to preview a visual change live — shrink a label that doesn't fit, adjust padding, width, etc. This edits the running DOM only: it is NOT written to your source and resets on reload/HMR, so it's a preview the agent shows you, then persists by editing the actual CSS/component source once you're happy. Inline styles override the stylesheet and usually survive re-renders. Undo with reset_overrides.",
    inputs: [
      {
        name: "selector",
        type: "string",
        desc: "CSS selector for the element to restyle, e.g. '#banner' or '.cta'. First match in document order wins.",
      },
      {
        name: "properties",
        type: "Record<string,string>",
        desc: "Map of CSS property (kebab-case) to value string, applied inline, e.g. { 'font-size': '13px', 'white-space': 'nowrap' }. An empty string clears a property.",
      },
    ],
  },
  {
    id: "set-attribute",
    name: "set_attribute(selector, name, value)",
    short: "Preview an attribute change — toggle disabled, swap a class, set aria-* (not saved)",
    long: "Sets or removes an attribute on an element to preview a change (toggle disabled, swap a class, set an aria-* attribute). Pass value=null to remove it. Live preview only — not saved to source, resets on reload. If the attribute is one a framework controls (class, value, checked, disabled, …) the result includes a frameworkWarning that it may be reverted on the next render. Undo with reset_overrides.",
    inputs: [
      {
        name: "selector",
        type: "string",
        desc: "CSS selector for the target element, e.g. '#menu' or 'button.cta'. First match in document order wins.",
      },
      {
        name: "name",
        type: "string",
        desc: "Attribute name to set or remove, e.g. 'disabled', 'class', 'aria-expanded', 'hidden', or a 'data-*' attribute.",
      },
      {
        name: "value",
        type: "string | null",
        desc: "New value as a string, or null to remove the attribute. For boolean attributes like 'disabled', any non-null string (even '') sets it.",
      },
    ],
  },
  {
    id: "set-text",
    name: "set_text(selector, text)",
    short: "Preview wording/label changes — replace an element's text (not saved)",
    long: "Replaces an element's text content to preview wording or label changes. Live preview only — not saved to source, resets on reload. textContent is almost always framework-controlled, so the result includes a frameworkWarning that React/Vue/etc. will likely overwrite it on the next render; persist real changes in the source. Undo with reset_overrides.",
    inputs: [
      {
        name: "selector",
        type: "string",
        desc: "CSS selector for the element to relabel, e.g. '#title' or '.cta-label'. First match in document order wins.",
      },
      {
        name: "text",
        type: "string",
        desc: "Replacement text, inserted as plain text (not parsed as HTML). Replaces all existing child content.",
      },
    ],
  },
  {
    id: "reset-overrides",
    name: "reset_overrides()",
    short: "Undo every live set_style / set_attribute / set_text change",
    long: "Undoes every set_style, set_attribute, and set_text change the bridge has applied since it connected, restoring the original values. Best effort: elements the framework has since re-created may not roll back, and a page reload always fully resets.",
  },
];
