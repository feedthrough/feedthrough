// ── Chat messages (what the panel renders) ──────────────────────────────────

export interface CodeLine {
  text: string;
  kind?: "del" | "add";
}

export type ChatMessage =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "agent"; text: string }
  | { id: number; role: "tool"; name: string; arg?: string; status: "running" | "done" }
  | { id: number; role: "code"; label: string; lines: CodeLine[] };

// ── The handle the timeline uses to drive the embedded demo app ──────────────

export interface DemoApi {
  /** Simulate clicking "Item N". With the bug, the wrong row ticks. */
  clickItem(displayIndex: number, fixed?: boolean): void;
  /** Widen the button (live set_style preview, then the committed fix). */
  setButtonFixed(fixed: boolean): void;
}

// ── Timeline steps (a demo is just an ordered list of these) ─────────────────

export type Step =
  | { kind: "user"; text: string }
  | { kind: "agent"; text: string }
  | { kind: "tool"; name: string; arg?: string; dwell?: number; do?: (api: DemoApi) => void }
  | { kind: "code"; label: string; lines: CodeLine[] }
  | { kind: "pause"; ms: number };

export type Demo = "list" | "button";
