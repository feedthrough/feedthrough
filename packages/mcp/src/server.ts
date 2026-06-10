import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { BridgeClient } from "./bridge-client.js";

// Single source of truth for the advertised version: read it from the package's
// own package.json at runtime (resolves to the package root in dev and when
// published) instead of duplicating the literal here.
const { version: VERSION } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: true };

function ok(value: unknown): ToolResult {
  return {
    content: [
      { type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) },
    ],
  };
}

function err(e: unknown): ToolResult {
  return {
    content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }],
    isError: true,
  };
}

async function run(
  bridge: BridgeClient,
  action: string,
  params: Record<string, unknown> = {},
): Promise<ToolResult> {
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

The tools are more general than their names suggest. Everything below is one way to use them,
not the only way, so improvise: any observe -> interact -> re-observe loop is fair game.

- IDs are the most reliable selectors: \`#submit-btn\`, \`#search-input\`
- \`query_dom\` returns all matches; use it to count items or verify what's in a list
- Console errors often include stack traces pointing to the exact source line
- Network requests include duration — slow requests are visible immediately
- All data is captured from the moment the bridge connects; reload the page to reset
- \`set_style\` previews CSS fixes live, but it's also a quick way to show the user something:
  outline or highlight an element you're explaining (they can see the live page), then call
  \`reset_overrides\` to undo it
- \`set_attribute\` can force a component into a state you can't easily reach: flip
  \`aria-expanded\`, \`open\`, \`disabled\`, \`hidden\`, or a \`class\`/\`data-*\` to open a dropdown,
  expand an accordion, or unhide an element so you can inspect what it renders, without driving
  the exact trigger sequence
- \`hover\` mounts hover-only UI (tooltips, popovers, submenus) that isn't in the DOM otherwise;
  hover the trigger, then \`query_dom\`/\`get_html\`/\`inspect_element\` to read what appeared. It fires
  JS hover handlers but not the CSS \`:hover\` pseudo-class, so something shown purely via \`:hover\` in
  CSS won't reveal this way
- There is no navigation tool, by design: the bridge lives inside the page, so it drives the app
  you're on rather than the browser. To reach another view, \`click\` a link or use the app's own
  navigation; for cross-page or cross-origin automation, a browser driver like Playwright is the
  right tool (and can inject this same bridge via \`@feedthrough/playwright\`)
- When a click "does nothing", suspect layout before logic: \`inspect_element\`'s rect shows
  whether the target is off-screen, zero-size, or sitting under another element (compare
  overlapping rects and z-index) before you go hunting for a handler bug
- \`press_key\` is for more than typing: Tab repeatedly to audit focus order and catch keyboard
  traps, Escape to close modals, Enter to submit
- \`fill\` dispatches real input events from inside the page, so React/Vue controlled inputs and
  their validation actually react (setting \`.value\` from devtools wouldn't trigger that)
`;

export async function startServer(port = 8765): Promise<void> {
  const bridge = new BridgeClient(port);
  const server = new McpServer({ name: "feedthrough", version: VERSION });

  server.registerTool(
    "get_instructions",
    {
      description:
        "Returns the Feedthrough usage guide as a Markdown text document, with sections for the " +
        "recommended workflow, tool-ordering tips, and selector advice. Read-only and takes no " +
        "arguments; it does not touch the page or require a connected browser. Call it at the start " +
        "of a debugging session if you are unfamiliar with Feedthrough or want a quick refresher.",
    },
    () => Promise.resolve(ok(INSTRUCTIONS)),
  );

  server.registerTool(
    "connection_status",
    {
      description:
        "Check whether a browser with the Feedthrough bridge is currently connected. " +
        "Returns connected flag and a list of open tabs (id, url, which is active). " +
        "Call this first — every tool except get_instructions requires a connected browser.",
    },
    () =>
      Promise.resolve(
        bridge.startupError
          ? err(bridge.startupError)
          : ok({ connected: bridge.connected, tabs: bridge.tabs }),
      ),
  );

  server.registerTool(
    "get_console_logs",
    {
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
        "'ts', or Date.now() before an action) to see only what happened after that point. Read-only: " +
        "it returns a passively captured buffer and neither clears the console nor changes the page. " +
        "Always check this early — app errors and debug output often identify the root cause immediately.",
      inputSchema: {
        limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            "Cap the result to the N most-recent entries, e.g. 50. Omit to return everything " +
              "captured since the bridge connected.",
          ),
        levels: z
          .array(z.enum(["log", "warn", "error", "info", "debug"]))
          .optional()
          .describe(
            "Restrict to these levels, e.g. ['error'] to skip noisy warn/info/debug, or " +
              "['error', 'warn'] for both. Omit for all levels.",
          ),
        match: z
          .string()
          .optional()
          .describe("Case-insensitive substring filter on the serialized message content"),
        since: z
          .number()
          .optional()
          .describe(
            "Only entries with ts >= this (ms epoch). Scope to 'what happened after I did X'.",
          ),
      },
    },
    ({ limit, levels, match, since }) =>
      run(bridge, "get_console_logs", {
        ...(limit !== undefined && { limit }),
        ...(levels !== undefined && { levels }),
        ...(match !== undefined && { match }),
        ...(since !== undefined && { since }),
      }),
  );

  server.registerTool(
    "get_network_requests",
    {
      description:
        "Return all fetch and XHR requests captured since the bridge connected, including URL, method, " +
        "HTTP status, duration, request and response headers, and request and response bodies " +
        "(bodies capped at 10 KB each — anything longer is truncated with a marker; binary responses " +
        "are summarised). Use this to find failed requests (4xx/5xx), wrong URLs, slow calls, or to " +
        "inspect what the app actually sent or received. Use 'filter' to narrow by URL/method and " +
        "'since' (a ms timestamp) to see only requests that fired after an action. Read-only: it " +
        "returns a passively captured log and does not issue or modify any requests.",
      inputSchema: {
        filter: z
          .string()
          .optional()
          .describe("Filter by URL substring or HTTP method, e.g. 'api' or 'POST'"),
        since: z
          .number()
          .optional()
          .describe(
            "Only requests with ts >= this (ms epoch). Scope to 'what fired after I did X'.",
          ),
      },
    },
    ({ filter, since }) =>
      run(bridge, "get_network_requests", {
        ...(filter !== undefined && { filter }),
        ...(since !== undefined && { since }),
      }),
  );

  server.registerTool(
    "query_dom",
    {
      description:
        "Query the page with a CSS selector and return a summary of every matching element " +
        "(tag, id, classes, text content). Good for counting list items, checking what's rendered, " +
        "or finding the right selector before calling inspect_element or click. Read-only: it only " +
        "reads the DOM and never changes the page. Returns an empty list (not an error) when nothing " +
        "matches, so it is also a safe existence check.",
      inputSchema: {
        selector: z
          .string()
          .describe(
            "A CSS selector matched against the whole document, e.g. '.todo-item', '#search-input', " +
              "or 'nav a'. Returns every match, so it also works as a count or existence check.",
          ),
      },
    },
    ({ selector }) => run(bridge, "query_dom", { selector }),
  );

  server.registerTool(
    "inspect_element",
    {
      description:
        "Return full details about a single element: tag, id, classes, all attributes, text content, " +
        "bounding rect (top/right/bottom/left/width/height + page scroll and an inViewport flag), a " +
        "compact ancestor 'path' (e.g. 'body > main > div#app > button.cta'), a " +
        "curated set of computed styles (layout, box model, typography, positioning, flex/grid), an " +
        "'overflow' block when content is clipped/overflowing (scroll vs client size + per-axis x/y " +
        "flags), a 'clipped' block when an ancestor's overflow cuts the element off (the clipping " +
        "ancestor + which edges), an effective-visibility check ('visible' boolean, with a 'hiddenReason' such as " +
        "'ancestor div#modal display:none' or 'opacity:0' when not visible, accounting for ancestors), " +
        "an occlusion check ('hittable' boolean from a center-point hit-test, with 'occludedBy' naming " +
        "the element actually on top when something covers it), " +
        "an 'a11y' block (resolved role, best-effort accessible name, and key states like expanded/" +
        "checked/selected/disabled/hidden/tabindex), " +
        "a 'pseudo' block with ::before/::after content when set (icon fonts, generated text), " +
        "and live form state where applicable (an input's current value, checked, disabled, etc.). " +
        "Pass 'properties' to additionally read any specific computed CSS properties by name — they " +
        "come back under 'requested'. Use this to understand why an element looks wrong or isn't " +
        "behaving as expected. Read-only: it only reads element state and never changes the page, and " +
        "it returns an error if the selector matches nothing. Note: addEventListener-registered event " +
        "handlers cannot be read from the page; only inline on* handler attributes appear (in " +
        "'attributes').",
      inputSchema: {
        selector: z
          .string()
          .describe(
            "A CSS selector that should resolve to one element, e.g. '#submit-btn' or " +
              "'main .card:first-child'. If several match, the first in document order is inspected.",
          ),
        properties: z
          .array(z.string())
          .optional()
          .describe(
            "Extra computed CSS properties to read by name (kebab-case), e.g. " +
              "['transform', 'z-index', 'margin-top']. They come back under a 'requested' object, " +
              "in addition to the curated default set.",
          ),
      },
    },
    ({ selector, properties }) =>
      run(bridge, "inspect", {
        selector,
        ...(properties !== undefined && { properties }),
      }),
  );

  server.registerTool(
    "click",
    {
      description:
        "Click an element by calling its native click(), which fires a click event and runs the " +
        "default activation: following a link, toggling a checkbox or radio, submitting a form. " +
        "Prefer an id selector (#submit-btn) for reliable targeting. Note it does NOT synthesize the " +
        "preceding pointer/mouse sequence (pointerdown / mousedown / mouseup) or move focus, so a " +
        "handler wired specifically to those events rather than to click won't fire; for keyboard-" +
        "driven activation use press_key instead. Behavior: if the selector matches nothing the call " +
        "returns an error; it does not scroll the element into view, and it does not wait for any " +
        "resulting navigation, network, or re-render to settle, returning as soon as the click is " +
        "dispatched. Observe the effect with a follow-up get_console_logs / get_network_requests / " +
        "query_dom. Returns the tag and id of the clicked element.",
      inputSchema: {
        selector: z
          .string()
          .describe(
            "A CSS selector for the element to click, e.g. '#submit-btn' or 'button[type=submit]'. " +
              "If several match, the first in document order is clicked.",
          ),
      },
    },
    ({ selector }) => run(bridge, "click", { selector }),
  );

  server.registerTool(
    "fill",
    {
      description:
        "Set the value of an input, textarea, or select element. Focuses the element, assigns the " +
        "value through the element's native value setter (so React/Vue controlled inputs register " +
        "the change), then fires bubbling input and change events. The value is set in one shot, not " +
        "typed character by character, so per-keystroke handlers (keydown / keypress / keyup / " +
        "beforeinput) do NOT fire; to send Enter to submit or trigger a key shortcut, follow with " +
        "press_key. Prefer an id selector (#search-input). If the selector matches nothing the call " +
        "returns an error; it returns as soon as the events are dispatched and does not wait for " +
        "downstream validation or re-renders. Returns the tag and the value that was set.",
      inputSchema: {
        selector: z
          .string()
          .describe(
            "A CSS selector for the input, textarea, or select to fill, e.g. '#email' or " +
              "'input[name=q]'.",
          ),
        value: z
          .string()
          .describe(
            "The full value to set. It replaces the field's current contents (it is not appended); " +
              "for a <select>, pass the target option's value attribute.",
          ),
      },
    },
    ({ selector, value }) => run(bridge, "fill", { selector, value }),
  );

  server.registerTool(
    "hover",
    {
      description:
        "Hover over an element by dispatching synthetic, bubbling mouseover and mouseenter events " +
        "from inside the page. This triggers JavaScript hover handlers (onMouseEnter / onMouseOver), " +
        "so hover-only UI that mounts on hover (tooltips, popovers, dropdown and submenus) appears in " +
        "the DOM; follow up with query_dom, get_html, or inspect_element to read what was revealed. " +
        "Three limits to know: it does NOT activate the CSS :hover pseudo-class (that is driven by " +
        "the real cursor, not synthetic events), so styles or content shown purely via :hover in CSS " +
        "will not change; no mouseout / mouseleave is sent, so the hovered state stays until the app " +
        "tears it down or you interact elsewhere; and the events are dispatched whether or not the " +
        "element is visible or in the viewport (it is not scrolled into view), so a successful call " +
        "does not by itself confirm anything rendered. If the selector matches nothing the call " +
        "returns an error. Returns the tag of the hovered element.",
      inputSchema: {
        selector: z
          .string()
          .describe(
            "A CSS selector for the element to hover, e.g. '#menu-trigger' or '.tooltip-anchor'. " +
              "Target the element that owns the hover handler (often the trigger, not the popup).",
          ),
      },
    },
    ({ selector }) => run(bridge, "hover", { selector }),
  );

  server.registerTool(
    "press_key",
    {
      description:
        "Dispatch a key press (keydown/keypress/keyup) on an element — e.g. Enter to submit a search, " +
        "Escape to close a modal, Tab to move focus, or ArrowUp/ArrowDown in a list. Use named keys " +
        "(Enter, Escape, Tab, Backspace, Delete, ArrowUp/Down/Left/Right) or a single character. " +
        "Note: this fires key handlers but does NOT insert text into inputs — use 'fill' to set an " +
        "input's value, then press_key for the submit/shortcut. If the selector matches nothing the " +
        "call returns an error; it dispatches the key events and returns without waiting for any " +
        "resulting navigation or re-render.",
      inputSchema: {
        selector: z
          .string()
          .describe(
            "A CSS selector for the element that receives the key, e.g. '#search-input'. Target a " +
              "focused or focusable element: Enter on a focused input submits its form, Escape on an " +
              "open dialog closes it, Tab moves focus to the next element.",
          ),
        key: z
          .string()
          .describe(
            "A named key or a single character. Named keys: Enter, Escape, Tab, Backspace, Delete, " +
              "ArrowUp, ArrowDown, ArrowLeft, ArrowRight (case-sensitive, as in the DOM KeyboardEvent " +
              "'key' value). Any other single character (e.g. 'a', '/') is sent as that character.",
          ),
      },
    },
    ({ selector, key }) => run(bridge, "press_key", { selector, key }),
  );

  server.registerTool(
    "get_html",
    {
      description:
        "Return the outerHTML of an element (capped at 50 KB). Use this when the summarised query_dom " +
        "output isn't enough and you need to see the actual markup/structure of a region. Read-only: " +
        "it only reads the DOM and makes no changes, and it returns an error if the selector matches " +
        "nothing.",
      inputSchema: {
        selector: z
          .string()
          .describe(
            "A CSS selector for the region to dump, e.g. '#app' or '.modal'. If several match, the " +
              "first in document order is used. Scope it tightly: the outerHTML is capped at 50 KB.",
          ),
      },
    },
    ({ selector }) => run(bridge, "get_html", { selector }),
  );

  server.registerTool(
    "get_page_info",
    {
      description:
        "Return basic page context: current URL, document title, readyState, viewport size, scroll " +
        "position, and user agent. Read-only and non-destructive: it only reads page state and makes " +
        "no changes. Useful to orient at the start of a session or confirm a navigation happened.",
    },
    () => run(bridge, "get_page_info"),
  );

  server.registerTool(
    "set_style",
    {
      description:
        "Set one or more inline CSS properties on an element to PREVIEW a visual change live (e.g. " +
        "shrink a label that doesn't fit, adjust padding or width). This edits the running DOM only " +
        "— it is NOT saved to source and resets on reload — so tell the user it's a preview, and once " +
        "they're happy, make the real change in the CSS/component source. Inline styles override the " +
        "stylesheet and usually survive re-renders. The result includes a 'note' to relay; reset with " +
        "reset_overrides.",
      inputSchema: {
        selector: z
          .string()
          .describe(
            "A CSS selector for the element to restyle, e.g. '#banner' or '.cta'. If several match, " +
              "the first in document order is used.",
          ),
        properties: z
          .record(z.string(), z.string())
          .describe(
            "A map of CSS property to value, applied as inline styles. Property names are kebab-case " +
              "and values are full CSS strings, e.g. { 'font-size': '13px', 'white-space': 'nowrap' }. " +
              "Pass an empty string as the value to clear a single inline property.",
          ),
      },
    },
    ({ selector, properties }) => run(bridge, "set_style", { selector, properties }),
  );

  server.registerTool(
    "set_attribute",
    {
      description:
        "Set or remove an attribute on an element to preview a change (toggle disabled, swap a class, " +
        "set an aria-* attribute). Pass value=null to remove the attribute. Live preview only — not " +
        "saved to source, resets on reload. If the attribute is one a framework controls (class, " +
        "value, checked, disabled, …) the result includes a 'frameworkWarning' that it may be " +
        "reverted on the next render — relay it. Reset with reset_overrides.",
      inputSchema: {
        selector: z
          .string()
          .describe(
            "A CSS selector for the target element, e.g. '#menu' or 'button.cta'. If several match, " +
              "the first in document order is used.",
          ),
        name: z
          .string()
          .describe(
            "The attribute name to set or remove, e.g. 'disabled', 'class', 'aria-expanded', " +
              "'hidden', or a 'data-*' attribute.",
          ),
        value: z
          .string()
          .nullable()
          .describe(
            "The new value as a string, or null to remove the attribute entirely. For boolean " +
              "attributes like 'disabled' or 'hidden', any non-null string (even '') sets them; use " +
              "null to unset.",
          ),
      },
    },
    ({ selector, name, value }) => run(bridge, "set_attribute", { selector, name, value }),
  );

  server.registerTool(
    "set_text",
    {
      description:
        "Replace an element's text content to preview wording/label changes. Live preview only — not " +
        "saved to source, resets on reload. textContent is almost always framework-controlled, so the " +
        "result includes a 'frameworkWarning' that React/Vue/etc. will likely overwrite it on the next " +
        "render — relay that, and persist real changes in the source. Reset with reset_overrides.",
      inputSchema: {
        selector: z
          .string()
          .describe(
            "A CSS selector for the element to relabel, e.g. '#title' or '.cta-label'. If several " +
              "match, the first in document order is used.",
          ),
        text: z
          .string()
          .describe(
            "The replacement text, inserted as plain text (not parsed as HTML). Replaces all existing " +
              "child content of the element.",
          ),
      },
    },
    ({ selector, text }) => run(bridge, "set_text", { selector, text }),
  );

  server.registerTool(
    "reset_overrides",
    {
      description:
        "Undo every set_style / set_attribute / set_text change the bridge has applied since it " +
        "connected, restoring the original values. Best effort: elements the framework has since " +
        "re-created may not roll back (a page reload always fully resets).",
    },
    () => run(bridge, "reset_overrides"),
  );

  process.stderr.write(
    `[feedthrough] MCP server starting, bridge WebSocket on ws://127.0.0.1:${port}\n`,
  );
  await server.connect(new StdioServerTransport());
}
