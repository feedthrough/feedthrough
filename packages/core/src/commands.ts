import type { ConsoleInterceptor } from "./interceptors/console";
import type { NetworkInterceptor } from "./interceptors/network";
import type { Transport } from "./transport";
import type { Command, ResultMessage } from "./types";

export class CommandHandler {
  constructor(
    private readonly transport: Transport,
    private readonly console: ConsoleInterceptor,
    private readonly network: NetworkInterceptor,
  ) {}

  handle(msg: unknown): void {
    if (!isCommand(msg)) return;

    let value: unknown;
    let error: string | undefined;
    try {
      value = this.dispatch(msg);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    const result: ResultMessage = {
      type: "result",
      ts: Date.now(),
      commandId: msg.id,
      ok: error === undefined,
      value,
      error,
    };
    this.transport.send(result);
  }

  private dispatch(cmd: Command): unknown {
    switch (cmd.action) {
      case "click":
        return clickEl(cmd.selector);
      case "fill":
        return fillEl(cmd.selector, cmd.value);
      case "hover":
        return hoverEl(cmd.selector);
      case "inspect":
        return inspectEl(cmd.selector, cmd.properties);
      case "query_dom":
        return queryDom(cmd.selector);
      case "get_console_logs":
        return this.console.getLogs({
          limit: cmd.limit,
          levels: cmd.levels,
          match: cmd.match,
          since: cmd.since,
        });
      case "get_network_requests":
        return this.network.getRequests(cmd.filter, cmd.since);
      case "press_key":
        return pressKey(cmd.selector, cmd.key);
      case "get_html":
        return getHtml(cmd.selector);
      case "get_page_info":
        return getPageInfo();
      case "set_style":
        return setStyle(cmd.selector, cmd.properties);
      case "set_attribute":
        return setAttribute(cmd.selector, cmd.name, cmd.value);
      case "set_text":
        return setText(cmd.selector, cmd.text);
      case "reset_overrides":
        return resetOverrides();
    }
  }
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function getEl(selector: string): Element {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`no element matches "${selector}"`);
  return el;
}

function clickEl(selector: string) {
  const el = getEl(selector) as HTMLElement;
  el.click();
  return { tag: el.tagName.toLowerCase(), id: el.id || null };
}

function fillEl(selector: string, value: string) {
  const el = getEl(selector) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  el.focus();
  // Use the native setter so React's synthetic event system sees the change
  // (React tracks the last value it set; a plain `el.value =` assignment may be
  // treated as "no change" and onChange won't fire for controlled inputs).
  // The setter is brand-checked to its interface, so it must come from the
  // element's own prototype — using HTMLInputElement's setter on a <textarea>
  // or <select> throws "Illegal invocation".
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (nativeSetter) {
    nativeSetter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return { tag: el.tagName.toLowerCase(), value };
}

function hoverEl(selector: string) {
  const el = getEl(selector) as HTMLElement;
  el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
  return { tag: el.tagName.toLowerCase() };
}

// A practical default set of computed styles covering layout, box model,
// typography, positioning, and fl/grid — enough to diagnose most "why does this
// look wrong" cases. Request anything beyond this via the `properties` arg.
const DEFAULT_STYLE_PROPS = [
  "display",
  "position",
  "visibility",
  "opacity",
  "z-index",
  "box-sizing",
  "top",
  "right",
  "bottom",
  "left",
  "width",
  "height",
  "margin",
  "padding",
  "border",
  "color",
  "background-color",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "text-align",
  "overflow",
  "cursor",
  "pointer-events",
  "flex",
  "flex-direction",
  "justify-content",
  "align-items",
  "gap",
  "grid-template-columns",
  "transform",
];

function inspectEl(selector: string, properties?: string[]) {
  const el = getEl(selector);
  const rect = el.getBoundingClientRect();
  const cs = window.getComputedStyle(el);

  const result: Record<string, unknown> = {
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    classes: Array.from(el.classList),
    attributes: Object.fromEntries(Array.from(el.attributes).map(a => [a.name, a.value])),
    textContent: el.textContent?.trim().slice(0, 200),
    rect: {
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      x: rect.x,
      y: rect.y,
    },
    scroll: { x: window.scrollX, y: window.scrollY },
    inViewport:
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth,
    styles: pickStyles(cs, DEFAULT_STYLE_PROPS),
  };

  result.path = ancestorChain(el);

  const overflow = overflowInfo(el);
  if (overflow) result.overflow = overflow;

  const clipped = clippedByAncestor(el, rect, cs);
  if (clipped) result.clipped = clipped;

  const vis = effectiveVisibility(el, rect, cs);
  result.visible = vis.visible;
  if (!vis.visible) result.hiddenReason = vis.reason;

  const occ = occlusionInfo(el, rect);
  if (occ) {
    result.hittable = occ.hittable;
    if (occ.occludedBy) result.occludedBy = occ.occludedBy;
  }

  const a11y = accessibilityInfo(el);
  if (a11y) result.a11y = a11y;

  const pseudo = pseudoContent(el);
  if (pseudo) result.pseudo = pseudo;

  const state = elementState(el);
  if (state) result.state = state;

  if (properties && properties.length > 0) {
    const requested: Record<string, string> = {};
    for (const p of properties) requested[p] = cs.getPropertyValue(p);
    result.requested = requested;
  }

  return result;
}

// Detect content larger than the element's box — the standard signal for
// clipped/truncated labels or content spilling out of a container. Reported only
// when something actually overflows (omitted otherwise), to keep the payload lean.
function overflowInfo(el: Element): Record<string, unknown> | undefined {
  const { scrollWidth, clientWidth, scrollHeight, clientHeight } = el;
  const x = scrollWidth > clientWidth;
  const y = scrollHeight > clientHeight;
  if (!x && !y) return undefined;
  return { x, y, scrollWidth, clientWidth, scrollHeight, clientHeight };
}

// A compact CSS-ish reference for an element, e.g. "div#app.modal.open" —
// enough structural context to identify the culprit without a full get_html.
function refString(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : "";
  const classes = Array.from(el.classList)
    .map(c => `.${c}`)
    .join("");
  return tag + id + classes;
}

// A single compact segment for the ancestor chain: tag + #id, or tag + first
// class, or just the tag. Kept lighter than refString so the path stays short.
function chainRef(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (el.id) return `${tag}#${el.id}`;
  const cls = el.classList[0];
  return cls ? `${tag}.${cls}` : tag;
}

// A compact structural path from an ancestor down to the element, e.g.
// "body > main > div#app > button.cta". Gives the agent context about where the
// element lives without a full get_html. Capped in depth, with a leading "…" when
// the chain is longer than the cap.
function ancestorChain(el: Element): string {
  const maxDepth = 6;
  const parts: string[] = [];
  let node: Element | null = el;
  while (node) {
    parts.unshift(chainRef(node));
    node = node.parentElement;
    if (parts.length >= maxDepth && node) {
      parts.unshift("…");
      break;
    }
  }
  return parts.join(" > ");
}

// Detect when the element is cut off by an ancestor's clipping context
// (overflow:hidden/scroll/auto/clip) even though the element itself renders fine —
// e.g. a dropdown clipped by a panel, or content scrolled out of a container. This
// is distinct from inViewport (viewport-level) and from occlusion (z-order).
// Reports the nearest clipping ancestor and which edges are cut. Best-effort: a
// position:fixed element escapes overflow clipping, so it's skipped.
function clippedByAncestor(
  el: Element,
  rect: DOMRect,
  cs: CSSStyleDeclaration,
): { by: string; edges: string[] } | undefined {
  if (cs.position === "fixed") return undefined;
  const tol = 1;
  for (let node = el.parentElement; node; node = node.parentElement) {
    const acs = window.getComputedStyle(node);
    const clipsX = acs.overflowX !== "visible";
    const clipsY = acs.overflowY !== "visible";
    if (!clipsX && !clipsY) continue;
    const ar = node.getBoundingClientRect();
    const edges: string[] = [];
    if (clipsY && rect.top < ar.top - tol) edges.push("top");
    if (clipsX && rect.right > ar.right + tol) edges.push("right");
    if (clipsY && rect.bottom > ar.bottom + tol) edges.push("bottom");
    if (clipsX && rect.left < ar.left - tol) edges.push("left");
    if (edges.length > 0) return { by: refString(node), edges };
  }
  return undefined;
}

// Content set via ::before / ::after pseudo-elements (icon fonts, CSS counters,
// generated text), which is invisible to DOM/textContent inspection. Reported only
// when present and not the empty/none default. Values come back quoted as the
// computed style returns them (e.g. "\"★\"").
function pseudoContent(el: Element): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const pseudo of ["::before", "::after"]) {
    const content = window.getComputedStyle(el, pseudo).content;
    if (content && content !== "none" && content !== "normal") {
      out[pseudo] = content.length > 200 ? `${content.slice(0, 200)}…` : content;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// Hit-test the element's center against document.elementFromPoint to detect
// occlusion: the element can be present and in-viewport but covered by an overlay,
// modal backdrop, sticky header, or have pointer-events:none, so an interaction
// silently lands elsewhere. Returns undefined when the center is offscreen (can't
// be tested). hittable is true when the topmost element is the element itself or a
// descendant; otherwise occludedBy names the element actually on top.
function occlusionInfo(
  el: Element,
  rect: DOMRect,
): { hittable: boolean; occludedBy?: Record<string, unknown> } | undefined {
  if (rect.width === 0 || rect.height === 0) return undefined;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) return undefined;

  const top = document.elementFromPoint(cx, cy);
  if (!top) return undefined;
  if (top === el || el.contains(top)) return { hittable: true };
  return {
    hittable: false,
    occludedBy: {
      tag: top.tagName.toLowerCase(),
      id: top.id || null,
      classes: Array.from(top.classList),
    },
  };
}

// Effective visibility: is the element actually rendered to the user, accounting
// for ancestors? The element's own computed display/opacity/visibility can look
// fine while a parent hides the whole subtree. Walks up to find the hiding cause.
// Note: opacity and display:none on an ancestor hide the subtree regardless of
// the child's own styles; visibility:hidden inherits but a child can override it,
// so we rely on the element's own computed visibility for that one.
function effectiveVisibility(
  el: Element,
  rect: DOMRect,
  cs: CSSStyleDeclaration,
): { visible: true } | { visible: false; reason: string } {
  if (cs.display === "none") return { visible: false, reason: "display:none" };

  for (let node = el.parentElement; node; node = node.parentElement) {
    const acs = window.getComputedStyle(node);
    if (acs.display === "none")
      return { visible: false, reason: `ancestor ${refString(node)} display:none` };
    if (parseFloat(acs.opacity) === 0)
      return { visible: false, reason: `ancestor ${refString(node)} opacity:0` };
    if (node.getAttribute("aria-hidden") === "true")
      return { visible: false, reason: `ancestor ${refString(node)} aria-hidden` };
  }

  if (cs.visibility === "hidden" || cs.visibility === "collapse")
    return { visible: false, reason: `visibility:${cs.visibility}` };
  if (parseFloat(cs.opacity) === 0) return { visible: false, reason: "opacity:0" };
  if (el.getAttribute("aria-hidden") === "true") return { visible: false, reason: "aria-hidden" };
  if (rect.width === 0 || rect.height === 0) return { visible: false, reason: "zero-size" };

  return { visible: true };
}

function pickStyles(cs: CSSStyleDeclaration, props: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of props) {
    const v = cs.getPropertyValue(p);
    if (v) out[p] = v;
  }
  return out;
}

// Implicit ARIA role for common HTML tags, used when there's no explicit `role`
// attribute. Best-effort: not the full HTML-AAM mapping, but covers the elements
// agents reason about most. Some real roles are context-dependent (e.g. header is
// only "banner" at the top level); we keep it simple.
function implicitRole(el: Element): string | null {
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case "a":
    case "area":
      return el.hasAttribute("href") ? "link" : null;
    case "button":
      return "button";
    case "input": {
      const t = (el.getAttribute("type") || "text").toLowerCase();
      const map: Record<string, string> = {
        checkbox: "checkbox",
        radio: "radio",
        range: "slider",
        number: "spinbutton",
        button: "button",
        submit: "button",
        reset: "button",
        image: "button",
        search: "searchbox",
        email: "textbox",
        tel: "textbox",
        url: "textbox",
        text: "textbox",
      };
      return map[t] ?? (t === "hidden" ? null : "textbox");
    }
    case "select":
      return el.hasAttribute("multiple") ? "listbox" : "combobox";
    case "textarea":
      return "textbox";
    case "img":
      return el.getAttribute("alt") === "" ? "presentation" : "img";
    case "nav":
      return "navigation";
    case "main":
      return "main";
    case "header":
      return "banner";
    case "footer":
      return "contentinfo";
    case "aside":
      return "complementary";
    case "section":
      return "region";
    case "article":
      return "article";
    case "dialog":
      return "dialog";
    case "form":
      return "form";
    case "table":
      return "table";
    case "ul":
    case "ol":
      return "list";
    case "li":
      return "listitem";
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return "heading";
    default:
      return null;
  }
}

// Best-effort accessible name: aria-labelledby targets, then aria-label, then an
// associated/wrapping <label>, then title/alt/placeholder, then visible text. Not
// the full accname algorithm, but enough for an agent to identify "the Submit
// button" rather than juggling CSS selectors.
function accessibleName(el: Element): string | undefined {
  const labelledby = el.getAttribute("aria-labelledby");
  if (labelledby) {
    const txt = labelledby
      .split(/\s+/)
      .map(id => document.getElementById(id)?.textContent?.trim())
      .filter(Boolean)
      .join(" ");
    if (txt) return txt.slice(0, 200);
  }
  const label = el.getAttribute("aria-label")?.trim();
  if (label) return label.slice(0, 200);

  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    if (el.id) {
      const forLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      const txt = forLabel?.textContent?.trim();
      if (txt) return txt.slice(0, 200);
    }
    const wrapping = el.closest("label")?.textContent?.trim();
    if (wrapping) return wrapping.slice(0, 200);
    if (el instanceof HTMLInputElement && el.placeholder) return el.placeholder.slice(0, 200);
  }
  if (el instanceof HTMLImageElement && el.alt) return el.alt.slice(0, 200);

  const title = el.getAttribute("title")?.trim();
  if (title) return title.slice(0, 200);

  const text = el.textContent?.trim();
  if (text) return text.slice(0, 200);
  return undefined;
}

// Resolved accessibility info: role, accessible name, and key ARIA/control states.
// This is how assistive tech (and increasingly agents) identify elements, and
// missing/incorrect a11y is its own common bug class.
function accessibilityInfo(el: Element): Record<string, unknown> | undefined {
  const a11y: Record<string, unknown> = {};

  const role = el.getAttribute("role") || implicitRole(el);
  if (role) a11y.role = role;

  const name = accessibleName(el);
  if (name) a11y.name = name;

  const states: Record<string, unknown> = {};
  for (const attr of [
    "aria-expanded",
    "aria-checked",
    "aria-selected",
    "aria-pressed",
    "aria-current",
    "aria-disabled",
  ]) {
    const v = el.getAttribute(attr);
    if (v !== null) states[attr.slice(5)] = v;
  }
  if (el.getAttribute("aria-hidden") === "true") states.hidden = true;
  if ("disabled" in el && (el as { disabled?: boolean }).disabled) states.disabled = true;
  const tabindex = el.getAttribute("tabindex");
  if (tabindex !== null) states.tabindex = Number(tabindex);
  if (Object.keys(states).length > 0) a11y.states = states;

  return Object.keys(a11y).length > 0 ? a11y : undefined;
}

// Live form/control state that isn't visible in static attributes (e.g. an
// input's current value after the user typed, or a checkbox's checked flag).
function elementState(el: Element): Record<string, unknown> | undefined {
  const s: Record<string, unknown> = {};
  if (el instanceof HTMLInputElement) {
    s.value = capValue(el.value);
    s.type = el.type;
    s.checked = el.checked;
    s.disabled = el.disabled;
    s.readOnly = el.readOnly;
    s.required = el.required;
    if (el.placeholder) s.placeholder = el.placeholder;
    if (el.validationMessage) s.validationMessage = el.validationMessage;
  } else if (el instanceof HTMLTextAreaElement) {
    s.value = capValue(el.value);
    s.disabled = el.disabled;
    s.readOnly = el.readOnly;
  } else if (el instanceof HTMLSelectElement) {
    s.value = el.value;
    s.selectedIndex = el.selectedIndex;
    s.disabled = el.disabled;
  } else if (el instanceof HTMLButtonElement) {
    s.type = el.type;
    s.disabled = el.disabled;
  } else if (el instanceof HTMLAnchorElement) {
    s.href = el.href;
  }
  if (el instanceof HTMLElement && Object.keys(el.dataset).length > 0) {
    s.dataset = { ...el.dataset };
  }
  return Object.keys(s).length > 0 ? s : undefined;
}

function capValue(v: string): string {
  return v.length > 1000 ? `${v.slice(0, 1000)}…[truncated]` : v;
}

function queryDom(selector: string) {
  return Array.from(document.querySelectorAll(selector)).map(el => ({
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    classes: Array.from(el.classList),
    textContent: el.textContent?.trim().slice(0, 100),
  }));
}

// Named keys → DOM code/keyCode. keyCode is legacy but many handlers still read
// it, so we set it for the common keys. Single printable chars are handled below.
const NAMED_KEYS: Record<string, { code: string; keyCode: number }> = {
  Enter: { code: "Enter", keyCode: 13 },
  Tab: { code: "Tab", keyCode: 9 },
  Escape: { code: "Escape", keyCode: 27 },
  Backspace: { code: "Backspace", keyCode: 8 },
  Delete: { code: "Delete", keyCode: 46 },
  ArrowUp: { code: "ArrowUp", keyCode: 38 },
  ArrowDown: { code: "ArrowDown", keyCode: 40 },
  ArrowLeft: { code: "ArrowLeft", keyCode: 37 },
  ArrowRight: { code: "ArrowRight", keyCode: 39 },
  " ": { code: "Space", keyCode: 32 },
};

function pressKey(selector: string, key: string) {
  const el = getEl(selector) as HTMLElement;
  el.focus?.();
  const named = NAMED_KEYS[key];
  const keyCode = named ? named.keyCode : key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0;
  const code = named ? named.code : key.length === 1 ? `Key${key.toUpperCase()}` : key;
  const init: KeyboardEventInit & { keyCode: number; which: number } = {
    key,
    code,
    keyCode,
    which: keyCode,
    bubbles: true,
    cancelable: true,
  };
  el.dispatchEvent(new KeyboardEvent("keydown", init));
  if (key.length === 1) el.dispatchEvent(new KeyboardEvent("keypress", init));
  el.dispatchEvent(new KeyboardEvent("keyup", init));
  // Note: synthetic key events fire handlers but do NOT insert text into inputs.
  // Use `fill` to set an input's value; use this to trigger Enter/Escape/shortcuts.
  return { tag: el.tagName.toLowerCase(), key };
}

const MAX_HTML_CHARS = 50_000;

function getHtml(selector: string) {
  const el = getEl(selector);
  const html = el.outerHTML;
  const truncated = html.length > MAX_HTML_CHARS;
  return {
    tag: el.tagName.toLowerCase(),
    html: truncated ? `${html.slice(0, MAX_HTML_CHARS)}…[truncated]` : html,
    truncated,
  };
}

function getPageInfo() {
  return {
    url: window.location.href,
    title: document.title,
    readyState: document.readyState,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    scroll: { x: window.scrollX, y: window.scrollY },
    userAgent: navigator.userAgent,
  };
}

// ── Live edit (preview) ─────────────────────────────────────────────────────────
//
// These mutate the *running* DOM so an agent can preview a fix ("does this look
// better?"). Nothing is written to source — changes vanish on reload/HMR — so
// every result carries a note saying so, and changes a framework is likely to
// overwrite carry an extra warning. Each edit pushes an undo closure so
// reset_overrides() can roll everything back without a reload.

const PREVIEW_NOTE =
  "Live preview only — applied to the running DOM, not saved to source, and reset on reload/HMR. " +
  "Once the user is happy, edit the actual source to make it permanent.";

const CLOBBER_WARNING =
  "This may be reverted on the next framework render (React/Vue/etc. re-render this element from " +
  "component state). If it snaps back, change it in the source instead of here.";

// Attributes frameworks commonly own and rewrite on render.
const FRAMEWORK_OWNED_ATTRS = new Set([
  "class",
  "style",
  "value",
  "checked",
  "disabled",
  "selected",
]);

const overrides: Array<() => void> = [];

function setStyle(selector: string, properties: Record<string, string>) {
  const el = getEl(selector) as HTMLElement;
  if (!el.style) throw new Error(`element "${selector}" has no style (not an HTMLElement)`);
  const applied: Record<string, string> = {};
  for (const [prop, value] of Object.entries(properties)) {
    const prevValue = el.style.getPropertyValue(prop);
    const prevPriority = el.style.getPropertyPriority(prop);
    overrides.push(() => {
      if (prevValue) el.style.setProperty(prop, prevValue, prevPriority);
      else el.style.removeProperty(prop);
    });
    el.style.setProperty(prop, value);
    applied[prop] = el.style.getPropertyValue(prop);
  }
  // Inline styles usually survive re-renders, so no clobber warning by default.
  return { tag: el.tagName.toLowerCase(), applied, note: PREVIEW_NOTE };
}

function setAttribute(selector: string, name: string, value: string | null) {
  const el = getEl(selector);
  const had = el.hasAttribute(name);
  const prev = had ? el.getAttribute(name) : null;
  overrides.push(() => {
    if (had) el.setAttribute(name, prev ?? "");
    else el.removeAttribute(name);
  });
  if (value === null) el.removeAttribute(name);
  else el.setAttribute(name, value);
  const result: Record<string, unknown> = {
    tag: el.tagName.toLowerCase(),
    name,
    value: value === null ? null : el.getAttribute(name),
    removed: value === null,
    note: PREVIEW_NOTE,
  };
  if (FRAMEWORK_OWNED_ATTRS.has(name.toLowerCase())) result.frameworkWarning = CLOBBER_WARNING;
  return result;
}

function setText(selector: string, text: string) {
  const el = getEl(selector);
  const prev = el.textContent;
  overrides.push(() => {
    el.textContent = prev;
  });
  el.textContent = text;
  // textContent is almost always framework-controlled, so always warn.
  return {
    tag: el.tagName.toLowerCase(),
    text,
    note: PREVIEW_NOTE,
    frameworkWarning: CLOBBER_WARNING,
  };
}

function resetOverrides() {
  const count = overrides.length;
  // Undo in reverse so repeated edits to the same property unwind to the original.
  while (overrides.length) overrides.pop()?.();
  return {
    reverted: count,
    note: "All bridge-applied DOM changes since connect have been undone (best effort — elements re-created by the framework since may not roll back).",
  };
}

// ── Type guard ────────────────────────────────────────────────────────────────

function isCommand(v: unknown): v is Command {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as Record<string, unknown>).type === "command" &&
    typeof (v as Record<string, unknown>).id === "string"
  );
}
