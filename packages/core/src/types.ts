export type LogLevel = "log" | "warn" | "error" | "info" | "debug";

// ── Browser → server ──────────────────────────────────────────────────────────

export interface ConsoleMessage {
  type: "console";
  ts: number;
  level: LogLevel;
  // Set for non-standard methods (dir, table, assert, trace, count, countReset,
  // time, timeEnd, timeLog, group, groupCollapsed, groupEnd, clear). Absent for
  // the five standard levels, where the method name is the same as `level`.
  method?: string;
  args: unknown[];
  // Populated by console.trace() and failing console.assert() calls.
  stack?: string;
}

export interface NetworkMessage {
  type: "network";
  ts: number;
  requestId: string;
  method: string;
  url: string;
  status?: number;
  duration?: number;
  error?: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
}

export interface ResultMessage {
  type: "result";
  ts: number;
  commandId: string;
  ok: boolean;
  value?: unknown;
  error?: string;
}

export interface HelloMessage {
  type: "hello";
  url: string;
}

export type BrowserMessage = ConsoleMessage | NetworkMessage | ResultMessage | HelloMessage;

// ── Server → browser ──────────────────────────────────────────────────────────

export interface ClickCommand     { type: "command"; id: string; action: "click";    selector: string }
export interface FillCommand      { type: "command"; id: string; action: "fill";     selector: string; value: string }
export interface HoverCommand     { type: "command"; id: string; action: "hover";    selector: string }
export interface InspectCommand   { type: "command"; id: string; action: "inspect";  selector: string; properties?: string[] }
export interface QueryDomCommand  { type: "command"; id: string; action: "query_dom"; selector: string }
export interface PressKeyCommand  { type: "command"; id: string; action: "press_key"; selector: string; key: string }
export interface GetHtmlCommand   { type: "command"; id: string; action: "get_html";   selector: string }
export interface GetPageInfoCommand { type: "command"; id: string; action: "get_page_info" }
export interface GetConsoleLogsCommand    { type: "command"; id: string; action: "get_console_logs";    limit?: number; levels?: LogLevel[]; match?: string; since?: number }
export interface GetNetworkRequestsCommand { type: "command"; id: string; action: "get_network_requests"; filter?: string; since?: number }

// Live-edit (preview) commands — mutate the running DOM, never the source.
export interface SetStyleCommand     { type: "command"; id: string; action: "set_style";     selector: string; properties: Record<string, string> }
export interface SetAttributeCommand { type: "command"; id: string; action: "set_attribute"; selector: string; name: string; value: string | null }
export interface SetTextCommand      { type: "command"; id: string; action: "set_text";      selector: string; text: string }
export interface ResetOverridesCommand { type: "command"; id: string; action: "reset_overrides" }

export type Command =
  | ClickCommand | FillCommand | HoverCommand | InspectCommand
  | QueryDomCommand | PressKeyCommand | GetHtmlCommand | GetPageInfoCommand
  | GetConsoleLogsCommand | GetNetworkRequestsCommand
  | SetStyleCommand | SetAttributeCommand | SetTextCommand | ResetOverridesCommand;

// ── Config ────────────────────────────────────────────────────────────────────

export interface BridgeOptions {
  serverUrl?: string;
  reconnectDelay?: number;
}
