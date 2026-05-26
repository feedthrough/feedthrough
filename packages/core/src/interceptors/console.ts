import type { Transport } from "../transport";
import type { ConsoleMessage, LogLevel } from "../types";

const LEVELS: LogLevel[] = ["log", "warn", "error", "info", "debug"];

export class ConsoleInterceptor {
  private originals = {} as Record<LogLevel, typeof console.log>;
  private logs: ConsoleMessage[] = [];

  install(transport: Transport): void {
    for (const level of LEVELS) {
      const original = console[level].bind(console);
      this.originals[level] = original;
      console[level] = (...args: unknown[]) => {
        original(...args);
        const msg: ConsoleMessage = { type: "console", ts: Date.now(), level, args: args.map(serialize) };
        this.logs.push(msg);
        transport.send(msg);
      };
    }
  }

  uninstall(): void {
    for (const level of LEVELS) {
      if (this.originals[level]) console[level] = this.originals[level];
    }
  }

  getLogs(limit?: number): ConsoleMessage[] {
    return limit !== undefined ? this.logs.slice(-limit) : [...this.logs];
  }
}

function serialize(v: unknown): unknown {
  if (v === null || v === undefined) return String(v);
  if (typeof v !== "object") return v;
  if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };
  try { return JSON.parse(JSON.stringify(v)); } catch { return String(v); }
}
