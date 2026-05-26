export type LogLevel = "log" | "warn" | "error" | "info" | "debug";

// ── Browser → server ──────────────────────────────────────────────────────────

export interface ConsoleMessage {
  type: "console";
  ts: number;
  level: LogLevel;
  args: unknown[];
}

export interface NetworkMessage {
  type: "network";
  ts: number;
  requestId: string;
  method: string;
  url: string;
  status?: number;
  duration?: number;
}

export interface ResultMessage {
  type: "result";
  ts: number;
  commandId: string;
  ok: boolean;
  value?: unknown;
  error?: string;
}

export type BrowserMessage = ConsoleMessage | NetworkMessage | ResultMessage;

// ── Server → browser ──────────────────────────────────────────────────────────

export interface ClickCommand     { type: "command"; id: string; action: "click";    selector: string }
export interface FillCommand      { type: "command"; id: string; action: "fill";     selector: string; value: string }
export interface HoverCommand     { type: "command"; id: string; action: "hover";    selector: string }
export interface InspectCommand   { type: "command"; id: string; action: "inspect";  selector: string }
export interface QueryDomCommand  { type: "command"; id: string; action: "query_dom"; selector: string }
export interface ScreenshotCommand { type: "command"; id: string; action: "screenshot" }
export interface GetConsoleLogsCommand    { type: "command"; id: string; action: "get_console_logs";    limit?: number }
export interface GetNetworkRequestsCommand { type: "command"; id: string; action: "get_network_requests"; filter?: string }

export type Command =
  | ClickCommand | FillCommand | HoverCommand | InspectCommand
  | QueryDomCommand | ScreenshotCommand
  | GetConsoleLogsCommand | GetNetworkRequestsCommand;

// ── Config ────────────────────────────────────────────────────────────────────

export interface BridgeOptions {
  serverUrl?: string;
  reconnectDelay?: number;
}
