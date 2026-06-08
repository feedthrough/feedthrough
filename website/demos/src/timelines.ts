import type { Step } from "./types";

// ── Demo 1: off-by-one list bug ─────────────────────────────────────────────

export const listTimeline: Step[] = [
  { kind: "user", text: "Clicking ticks the wrong box." },
  { kind: "agent", text: "Let me reproduce it — I'll click “Item 3”." },
  { kind: "tool", name: "click", arg: '"Item 3"', do: api => api.clickItem(3) },
  { kind: "pause", ms: 500 },
  {
    kind: "agent",
    text: "Clicking Item 3 ticks Item 4. That's a classic off-by-one. Let me read the handler.",
  },
  { kind: "tool", name: "inspect_element", arg: '".list"' },
  {
    kind: "code",
    label: "List.tsx",
    lines: [
      { text: "function handleClick(index) {" },
      { text: "  const wrongIndex = index + 1;", kind: "del" },
      { text: "  setTicked(wrongIndex);", kind: "del" },
      { text: "  setTicked(index);", kind: "add" },
      { text: "}" },
    ],
  },
  {
    kind: "agent",
    text: "The handler adds 1 to the index. Drop the +1 and it ticks the row you actually clicked.",
  },
  { kind: "user", text: "Apply it." },
  { kind: "tool", name: "edit", arg: "List.tsx" },
  { kind: "agent", text: "Applied. Clicking Item 3 again to verify…" },
  { kind: "tool", name: "click", arg: '"Item 3"', do: api => api.clickItem(3, true) },
  { kind: "pause", ms: 500 },
  { kind: "agent", text: "Now Item 3 ticks. Fixed." },
];

// ── Demo 2: button text overflow / live DOM edit ────────────────────────────

export const buttonTimeline: Step[] = [
  { kind: "user", text: "The text on this button doesn't fit." },
  { kind: "agent", text: "Let me look at it." },
  { kind: "tool", name: "inspect_element", arg: '".cta"' },
  {
    kind: "agent",
    text: "The label is wider than the button, so it's clipped. Want the text smaller, or the button larger?",
  },
  { kind: "user", text: "Button larger. Show me how that looks." },
  {
    kind: "tool",
    name: "set_style",
    arg: ".cta { width: auto; padding: 14px 28px }",
    do: api => api.setButtonFixed(true),
  },
  { kind: "pause", ms: 500 },
  {
    kind: "agent",
    text: "Previewed live — the label fits now. Should I write it into the stylesheet?",
  },
  { kind: "user", text: "Yes." },
  { kind: "tool", name: "edit", arg: "button.css" },
  {
    kind: "code",
    label: "button.css",
    lines: [
      { text: ".cta {" },
      { text: "  width: 200px;", kind: "del" },
      { text: "  padding: 6px 10px;", kind: "del" },
      { text: "  width: auto;", kind: "add" },
      { text: "  padding: 14px 28px;", kind: "add" },
      { text: "}" },
    ],
  },
  { kind: "agent", text: "Saved. It survives a reload now, not just the live preview." },
];

// ── Demo 3: occlusion — an invisible container covering the dialog buttons ───

export const occlusionTimeline: Step[] = [
  { kind: "user", text: "I click Discard and nothing happens." },
  { kind: "agent", text: "Let me hit-test it." },
  { kind: "tool", name: "inspect_element", arg: '".discard"' },
  {
    kind: "code",
    label: 'inspect_element ".discard"',
    lines: [
      { text: "{" },
      { text: '  "visible": true,' },
      { text: '  "hittable": false,' },
      { text: '  "occludedBy": { "tag": "div", "classes": ["message"] }' },
      { text: "}" },
    ],
  },
  {
    kind: "agent",
    text: "The button's covered — a div.message is sitting on top of it. I'll highlight it so you can see.",
  },
  {
    kind: "tool",
    name: "set_style",
    arg: ".message { outline: 2px dashed red }",
    do: api => api.revealOverlap(),
  },
  { kind: "pause", ms: 700 },
  { kind: "tool", name: "edit", arg: "Dialog.css", do: api => api.fixOverlap() },
  {
    kind: "code",
    label: "Dialog.css",
    lines: [
      { text: ".message {" },
      { text: "  padding-bottom: 60px;", kind: "del" },
      { text: "  margin-bottom: -60px;", kind: "del" },
      { text: "  margin-bottom: 18px;", kind: "add" },
      { text: "}" },
    ],
  },
  { kind: "agent", text: "Fixed — the container no longer overlaps the buttons." },
];
