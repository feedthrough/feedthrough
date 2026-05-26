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
      case "inspect":             return inspectEl(cmd.selector);
      case "query_dom":           return queryDom(cmd.selector);
      case "screenshot":          return screenshot();
      case "get_console_logs":    return this.console.getLogs(cmd.limit);
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
  const el = getEl(selector) as HTMLInputElement;
  el.focus();
  // Use the native setter so React's synthetic event system sees the change
  // (React tracks the last value it set; a plain `el.value =` assignment may be
  // treated as "no change" and onChange won't fire for controlled inputs).
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
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

function inspectEl(selector: string) {
  const el = getEl(selector);
  const rect = el.getBoundingClientRect();
  const styles = window.getComputedStyle(el);
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    classes: Array.from(el.classList),
    attributes: Object.fromEntries(Array.from(el.attributes).map(a => [a.name, a.value])),
    textContent: el.textContent?.trim().slice(0, 200),
    rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    styles: {
      display: styles.display,
      visibility: styles.visibility,
      color: styles.color,
      backgroundColor: styles.backgroundColor,
    },
  };
}

function queryDom(selector: string) {
  return Array.from(document.querySelectorAll(selector)).map(el => ({
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    classes: Array.from(el.classList),
    textContent: el.textContent?.trim().slice(0, 100),
  }));
}

function screenshot(): string {
  // Requires a canvas library or CDP; placeholder for now
  return "screenshot:not-implemented";
}

// ── Type guard ────────────────────────────────────────────────────────────────

function isCommand(v: unknown): v is Command {
  return (
    typeof v === "object" && v !== null &&
    (v as Record<string, unknown>).type === "command" &&
    typeof (v as Record<string, unknown>).id === "string"
  );
}
