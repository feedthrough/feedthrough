import type { ConsoleMessage, LogLevel } from "../types";

export interface GetLogsOptions {
  limit?: number;
  levels?: LogLevel[];
  match?: string;
  since?: number;
}

const STD_LEVELS: LogLevel[] = ["log", "warn", "error", "info", "debug"];
const MAX_LOGS = 1000;
const MAX_ARG_CHARS = 10_000;

type AnyFn = (...args: any[]) => any;

export class ConsoleInterceptor {
  private originals = new Map<string, AnyFn>();
  private logs: ConsoleMessage[] = [];
  private counts = new Map<string, number>();
  private timers = new Map<string, number>();
  private onError?: (e: ErrorEvent) => void;
  private onRejection?: (e: PromiseRejectionEvent) => void;

  install(): void {
    const c = console as unknown as Record<string, AnyFn>;

    // Captured into a local buffer only — never streamed. An agent pulls logs
    // on demand via get_console_logs; pushing every entry over the WebSocket
    // would be wasted traffic since nothing subscribes to it.
    const record = (msg: ConsoleMessage): void => {
      this.logs.push(msg);
      if (this.logs.length > MAX_LOGS) this.logs.shift();
    };
    const rich = (
      method: string,
      level: LogLevel,
      args: unknown[],
      extras: Partial<ConsoleMessage> = {},
    ): void => {
      record({
        type: "console",
        ts: Date.now(),
        level,
        method,
        args: args.map(serialize),
        ...extras,
      });
    };
    const wrap = (name: string, fn: AnyFn): void => {
      const orig = c[name];
      if (typeof orig !== "function") return; // not available in this environment
      this.originals.set(name, orig.bind(console));
      c[name] = fn;
    };

    // log / warn / error / info / debug — the standard levels.
    for (const level of STD_LEVELS) {
      const orig = c[level].bind(console);
      this.originals.set(level, orig);
      c[level] = (...args: unknown[]) => {
        orig(...args);
        record({ type: "console", ts: Date.now(), level, args: args.map(serialize) });
      };
    }

    // dir / table — formatted variants of log.
    wrap("dir", (obj: unknown, options?: unknown) => {
      this.originals.get("dir")?.(obj, options);
      rich("dir", "log", options === undefined ? [obj] : [obj, options]);
    });
    wrap("table", (data: unknown, columns?: unknown) => {
      this.originals.get("table")?.(data, columns);
      rich("table", "log", columns === undefined ? [data] : [data, columns]);
    });

    // trace — captures the call-site stack.
    wrap("trace", (...args: unknown[]) => {
      this.originals.get("trace")?.(...args);
      rich("trace", "log", args, { stack: captureStack() });
    });

    // assert — fires only when the condition is falsy, like the browser.
    wrap("assert", (condition?: unknown, ...args: unknown[]) => {
      this.originals.get("assert")?.(condition, ...args);
      if (condition) return;
      rich("assert", "error", args.length ? args : ["Assertion failed"], { stack: captureStack() });
    });

    // count / countReset — we maintain the counter so the recorded value
    // mirrors what the browser prints.
    wrap("count", (label?: unknown) => {
      this.originals.get("count")?.(label);
      const key = label == null ? "default" : String(label);
      const n = (this.counts.get(key) ?? 0) + 1;
      this.counts.set(key, n);
      rich("count", "log", [`${key}: ${n}`]);
    });
    wrap("countReset", (label?: unknown) => {
      this.originals.get("countReset")?.(label);
      const key = label == null ? "default" : String(label);
      this.counts.set(key, 0);
      rich("countReset", "log", [`${key}: 0`]);
    });

    // time / timeEnd / timeLog — only timeEnd and timeLog produce output, same
    // as the browser. time() silently starts a stopwatch.
    wrap("time", (label?: unknown) => {
      this.originals.get("time")?.(label);
      const key = label == null ? "default" : String(label);
      this.timers.set(key, performance.now());
    });
    wrap("timeEnd", (label?: unknown) => {
      this.originals.get("timeEnd")?.(label);
      const key = label == null ? "default" : String(label);
      const start = this.timers.get(key);
      if (start === undefined) {
        rich("timeEnd", "warn", [`Timer "${key}" does not exist`]);
        return;
      }
      this.timers.delete(key);
      rich("timeEnd", "log", [`${key}: ${(performance.now() - start).toFixed(3)}ms`]);
    });
    wrap("timeLog", (label?: unknown, ...args: unknown[]) => {
      this.originals.get("timeLog")?.(label, ...args);
      const key = label == null ? "default" : String(label);
      const start = this.timers.get(key);
      if (start === undefined) {
        rich("timeLog", "warn", [`Timer "${key}" does not exist`, ...args]);
        return;
      }
      rich("timeLog", "log", [`${key}: ${(performance.now() - start).toFixed(3)}ms`, ...args]);
    });

    // group / groupCollapsed / groupEnd / clear — recorded as markers. We do
    // NOT flush the buffer on clear() so prior context remains available to
    // the agent; the clear() call itself appears as an event in the stream.
    wrap("group", (...args: unknown[]) => {
      this.originals.get("group")?.(...args);
      rich("group", "log", args);
    });
    wrap("groupCollapsed", (...args: unknown[]) => {
      this.originals.get("groupCollapsed")?.(...args);
      rich("groupCollapsed", "log", args);
    });
    wrap("groupEnd", () => {
      this.originals.get("groupEnd")?.();
      rich("groupEnd", "log", []);
    });
    wrap("clear", () => {
      this.originals.get("clear")?.();
      rich("clear", "log", []);
    });

    // Uncaught exceptions and unhandled promise rejections are logged by the
    // browser directly, NOT through console.error, so the wrappers above miss
    // them. Capture them explicitly — they're exactly what a debugging agent
    // wants — as error-level entries with a distinguishing `method`.
    this.onError = (e: ErrorEvent) => {
      record({
        type: "console",
        ts: Date.now(),
        level: "error",
        method: "uncaught",
        args: [serialize(e.message || "Uncaught error")],
        stack: e.error instanceof Error ? e.error.stack : undefined,
      });
    };
    this.onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      record({
        type: "console",
        ts: Date.now(),
        level: "error",
        method: "unhandledrejection",
        args: [serialize(reason instanceof Error ? reason.message : reason)],
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    };
    window.addEventListener("error", this.onError);
    window.addEventListener("unhandledrejection", this.onRejection);
  }

  uninstall(): void {
    const c = console as unknown as Record<string, AnyFn>;
    for (const [name, original] of this.originals) {
      c[name] = original;
    }
    this.originals.clear();
    if (this.onError) window.removeEventListener("error", this.onError);
    if (this.onRejection) window.removeEventListener("unhandledrejection", this.onRejection);
  }

  getLogs(opts: GetLogsOptions = {}): ConsoleMessage[] {
    let result: ConsoleMessage[] = this.logs;
    if (opts.levels && opts.levels.length > 0) {
      const wanted = new Set(opts.levels);
      result = result.filter(m => wanted.has(m.level));
    }
    if (opts.match) {
      const needle = opts.match.toLowerCase();
      result = result.filter(m => JSON.stringify(m.args).toLowerCase().includes(needle));
    }
    if (opts.since !== undefined) {
      result = result.filter(m => m.ts >= opts.since!);
    }
    if (opts.limit !== undefined) {
      result = result.slice(-opts.limit);
    } else if (result === this.logs) {
      // No filter and no limit — clone so callers can't mutate the buffer.
      result = [...this.logs];
    }
    return result;
  }
}

function captureStack(): string {
  // Drop "Error" line + the wrapper frame so the first line points at the
  // user's call site.
  const raw = new Error().stack ?? "";
  const lines = raw.split("\n");
  return lines.length > 2 ? lines.slice(2).join("\n") : raw;
}

function serialize(v: unknown): unknown {
  if (v === null || v === undefined) return String(v);
  if (typeof v === "string") return cap(v);
  if (typeof v !== "object") return v;
  if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };
  try {
    const json = JSON.stringify(v);
    // Cap large objects so one console.log(hugeObject) can't bloat the buffer.
    // Past the cap we keep the truncated JSON text rather than the live object.
    return json.length > MAX_ARG_CHARS ? cap(json) : JSON.parse(json);
  } catch {
    return String(v);
  }
}

function cap(text: string): string {
  return text.length > MAX_ARG_CHARS ? `${text.slice(0, MAX_ARG_CHARS)}…[truncated]` : text;
}
