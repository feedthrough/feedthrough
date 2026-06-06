import type { ChatMessage, CodeLine, DemoApi, Step } from "./types";

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Reveal text one character at a time, with a little human jitter. */
export async function typewriter(text: string, onUpdate: (partial: string) => void, cps = 50) {
  const base = 1000 / cps;
  let out = "";
  for (const ch of text) {
    out += ch;
    onUpdate(out);
    await sleep(base + Math.random() * 18);
    if (".,?!:—".includes(ch)) await sleep(110); // beat after punctuation
  }
}

/**
 * Owns the chat transcript and pushes immutable snapshots to React on every
 * change. The timeline never touches React directly — it just calls these.
 */
export class ChatController {
  private msgs: ChatMessage[] = [];
  private nextId = 0;

  constructor(private render: (msgs: ChatMessage[]) => void) {}

  private commit() {
    this.render(this.msgs.slice());
  }
  private push(msg: ChatMessage) {
    this.msgs = [...this.msgs, msg];
    this.commit();
  }
  private patch(id: number, patch: Partial<ChatMessage>) {
    this.msgs = this.msgs.map(m => (m.id === id ? ({ ...m, ...patch } as ChatMessage) : m));
    this.commit();
  }

  async say(role: "user" | "agent", text: string) {
    const id = this.nextId++;
    this.push({ id, role, text: "" } as ChatMessage);
    const cps = role === "user" ? 40 : 55;
    await typewriter(
      text,
      partial => this.patch(id, { text: partial } as Partial<ChatMessage>),
      cps,
    );
  }

  async tool(name: string, arg: string | undefined, dwell = 700) {
    const id = this.nextId++;
    this.push({ id, role: "tool", name, arg, status: "running" });
    await sleep(dwell);
    this.patch(id, { status: "done" } as Partial<ChatMessage>);
  }

  code(label: string, lines: CodeLine[]) {
    this.push({ id: this.nextId++, role: "code", label, lines });
  }
}

/** Play a timeline: animate the chat and fire each step's effect on the app. */
export async function play(steps: Step[], chat: ChatController, api: DemoApi) {
  for (const step of steps) {
    switch (step.kind) {
      case "user":
      case "agent":
        await chat.say(step.kind, step.text);
        break;
      case "tool":
        await chat.tool(step.name, step.arg, step.dwell);
        step.do?.(api);
        break;
      case "code":
        chat.code(step.label, step.lines);
        await sleep(550);
        break;
      case "pause":
        await sleep(step.ms);
        break;
    }
    await sleep(300); // inter-step beat
  }
}
