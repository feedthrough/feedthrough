import type { Transport } from "./transport";
import type { ConsoleInterceptor } from "./interceptors/console";
import type { NetworkInterceptor } from "./interceptors/network";
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
      case "click":               return clickEl(cmd.selector);
      case "fill":                return fillEl(cmd.selector, cmd.value);
      case "hover":               return hoverEl(cmd.selector);
      case "inspect":             return inspectEl(cmd.selector, cmd.properties);
      case "query_dom":           return queryDom(cmd.selector);
      case "get_console_logs":    return this.console.getLogs({ limit: cmd.limit, levels: cmd.levels, match: cmd.match });
      case "get_network_requests": return this.network.getRequests(cmd.filter);
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
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype :
    el instanceof HTMLSelectElement ? HTMLSelectElement.prototype :
    HTMLInputElement.prototype;
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
  "display", "position", "visibility", "opacity", "z-index", "box-sizing",
  "top", "right", "bottom", "left",
  "width", "height", "margin", "padding", "border",
  "color", "background-color",
  "font-family", "font-size", "font-weight", "line-height", "text-align",
  "overflow", "cursor", "pointer-events",
  "flex", "flex-direction", "justify-content", "align-items", "gap",
  "grid-template-columns", "transform",
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
      top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left,
      width: rect.width, height: rect.height, x: rect.x, y: rect.y,
    },
    scroll: { x: window.scrollX, y: window.scrollY },
    inViewport:
      rect.bottom > 0 && rect.right > 0 &&
      rect.top < window.innerHeight && rect.left < window.innerWidth,
    styles: pickStyles(cs, DEFAULT_STYLE_PROPS),
  };

  const state = elementState(el);
  if (state) result.state = state;

  if (properties && properties.length > 0) {
    const requested: Record<string, string> = {};
    for (const p of properties) requested[p] = cs.getPropertyValue(p);
    result.requested = requested;
  }

  return result;
}

function pickStyles(cs: CSSStyleDeclaration, props: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of props) {
    const v = cs.getPropertyValue(p);
    if (v) out[p] = v;
  }
  return out;
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
  return v.length > 1000 ? v.slice(0, 1000) + "…[truncated]" : v;
}

function queryDom(selector: string) {
  return Array.from(document.querySelectorAll(selector)).map(el => ({
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    classes: Array.from(el.classList),
    textContent: el.textContent?.trim().slice(0, 100),
  }));
}

// ── Type guard ────────────────────────────────────────────────────────────────

function isCommand(v: unknown): v is Command {
  return (
    typeof v === "object" && v !== null &&
    (v as Record<string, unknown>).type === "command" &&
    typeof (v as Record<string, unknown>).id === "string"
  );
}
