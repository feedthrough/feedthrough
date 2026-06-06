/**
 * Bridge-protocol integration test.
 *
 * Unlike demo.spec.ts (which drives the page with native Playwright APIs), this
 * spec stands up a WebSocket server that plays the role of @feedthrough/mcp's
 * bridge-client, injects the real @feedthrough/core bridge pointing at it, and
 * exercises the wire protocol end to end: transport connect/hello, console and
 * network capture, the failed-fetch path, and every command (query_dom, click,
 * fill, inspect, get_console_logs, get_network_requests).
 *
 * The bridge does NOT stream console/network events — an agent pulls them on
 * demand — so the tests poll the get_* tools (via `poll`) until the expected
 * data appears, mirroring how a real MCP client investigates. Only `hello` and
 * command `result`s arrive unprompted, so those still use `waitFor`.
 *
 * If the bridge regresses — transport, interceptors, or command dispatch — these
 * tests fail. demo.spec.ts would stay green.
 */
import { expect, setupFeedthrough } from "@feedthrough/playwright";
import { type WebSocket, WebSocketServer } from "ws";

const PORT = 8799;

interface BridgeMessage {
  type: string;
  ok?: boolean;
  value?: unknown;
  error?: string;
  commandId?: string;
  [k: string]: unknown;
}

class TestBridgeServer {
  private readonly wss: WebSocketServer;
  private socket: WebSocket | null = null;
  private received: BridgeMessage[] = [];
  private waiters: Array<{
    match: (m: BridgeMessage) => boolean;
    resolve: (m: BridgeMessage) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];
  private connectionWaiters: Array<() => void> = [];
  private cmdId = 0;

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });
    this.wss.on("connection", ws => {
      this.socket = ws;
      this.received = []; // fresh page → fresh capture buffer
      const waiters = this.connectionWaiters;
      this.connectionWaiters = [];
      waiters.forEach(r => {
        r();
      });

      ws.on("message", data => {
        let msg: BridgeMessage;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }
        this.received.push(msg);
        for (let i = this.waiters.length - 1; i >= 0; i--) {
          if (this.waiters[i].match(msg)) {
            const w = this.waiters.splice(i, 1)[0];
            clearTimeout(w.timer);
            w.resolve(msg);
          }
        }
      });
    });
  }

  /** Resolves when the *next* browser connection is established. Call before page.goto. */
  nextConnection(): Promise<void> {
    return new Promise(resolve => this.connectionWaiters.push(resolve));
  }

  /** Wait for an unprompted message (hello, or a command result). */
  waitFor(match: (m: BridgeMessage) => boolean, timeout = 5000): Promise<BridgeMessage> {
    const existing = this.received.find(match);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter(w => w.timer !== timer);
        reject(new Error("timed out waiting for a matching bridge message"));
      }, timeout);
      this.waiters.push({ match, resolve, reject, timer });
    });
  }

  async command<T = unknown>(action: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = `test-cmd-${++this.cmdId}`;
    const result = this.waitFor(m => m.type === "result" && m.commandId === id);
    this.socket?.send(JSON.stringify({ type: "command", id, action, ...params }));
    const res = await result;
    if (!res.ok) throw new Error(`command ${action} failed: ${res.error}`);
    return res.value as T;
  }

  /**
   * Re-run a get_* command until `predicate` accepts the result, mirroring how
   * an agent polls for state. Captured data (console/network) is populated
   * asynchronously, so a single query can race ahead of it.
   */
  async poll<T>(
    action: string,
    params: Record<string, unknown>,
    predicate: (value: T) => boolean,
    { timeout = 5000, interval = 50 }: { timeout?: number; interval?: number } = {},
  ): Promise<T> {
    const deadline = Date.now() + timeout;
    for (;;) {
      const value = await this.command<T>(action, params);
      if (predicate(value)) return value;
      if (Date.now() > deadline) throw new Error(`poll for ${action} timed out`);
      await new Promise(r => setTimeout(r, interval));
    }
  }

  close(): Promise<void> {
    return new Promise(resolve => this.wss.close(() => resolve()));
  }
}

const test = setupFeedthrough({ serverUrl: `ws://localhost:${PORT}` });

let server: TestBridgeServer;

test.beforeAll(() => {
  server = new TestBridgeServer(PORT);
});
test.afterAll(async () => {
  await server.close();
});

// Establish a fresh bridge connection for each test and wait for the hello.
test.beforeEach(async ({ page }) => {
  const connected = server.nextConnection();
  await page.goto("/");
  await connected;
  await server.waitFor(m => m.type === "hello");
});

type ConsoleEntry = { level: string; method?: string; args: unknown[]; stack?: string };
type NetEntry = {
  method: string;
  url: string;
  status?: number;
  error?: string;
  requestBody?: string;
  requestHeaders?: Record<string, string>;
  responseBody?: string;
  responseHeaders?: Record<string, string>;
};

test("transport connects and announces the page URL", async () => {
  const hello = await server.waitFor(m => m.type === "hello");
  expect(hello.url).toContain("localhost:4173");
});

test("query_dom returns every matching element", async () => {
  const rows = await server.command<Array<{ tag: string }>>("query_dom", {
    selector: "#member-list li",
  });
  expect(rows).toHaveLength(6); // six team members rendered on load
  expect(rows[0].tag).toBe("li");
});

test("click dispatches a real click and the DOM mutates", async () => {
  const clicked = await server.command<{ tag: string; id: string | null }>("click", {
    selector: "#record-view-btn",
  });
  expect(clicked).toMatchObject({ tag: "button", id: "record-view-btn" });

  const counter = await server.command<{ textContent?: string }>("inspect", {
    selector: "#view-count",
  });
  expect(counter.textContent).toBe("2"); // app's off-by-one bug: one click adds 2
});

test("fill sets the value and fires input/change so the app reacts", async () => {
  const filled = await server.command<{ tag: string; value: string }>("fill", {
    selector: "#search-input",
    value: "Alice",
  });
  expect(filled).toMatchObject({ tag: "input", value: "Alice" });

  const count = await server.command<{ textContent?: string }>("inspect", {
    selector: "#result-count",
  });
  expect(count.textContent).toContain("1 of 6"); // input handler ran and filtered the list
});

test("inspect_element returns styles, live form state, and requested props", async () => {
  // Fill the input, then inspect it — live value must be visible in state.
  await server.command("fill", { selector: "#search-input", value: "Bob" });

  type Inspected = {
    tag: string;
    rect: { width: number; inViewport?: boolean };
    inViewport: boolean;
    styles: Record<string, string>;
    state?: { value?: string; type?: string; disabled?: boolean };
    requested?: Record<string, string>;
  };

  const info = await server.command<Inspected>("inspect", {
    selector: "#search-input",
    properties: ["box-sizing", "cursor"],
  });

  // Curated default styles are present.
  expect(info.styles.display).toBeTruthy();
  expect(typeof info.inViewport).toBe("boolean");
  expect(info.rect.width).toBeGreaterThan(0);

  // Live form state reflects what we just typed.
  expect(info.state?.value).toBe("Bob");
  expect(info.state?.type).toBe("text");
  expect(info.state?.disabled).toBe(false);

  // Requested props come back under `requested`.
  expect(info.requested?.["box-sizing"]).toBe("border-box");
  expect(typeof info.requested?.cursor).toBe("string");
});

test("inspect_element reports a11y, effective visibility, and hittability", async () => {
  type Inspected = {
    visible: boolean;
    hiddenReason?: string;
    hittable?: boolean;
    a11y?: { role?: string; name?: string; states?: Record<string, unknown> };
  };

  // A plain, visible, unobstructed button: resolved role + accessible name,
  // visible true, hittable true.
  const btn = await server.command<Inspected>("inspect", { selector: "#record-view-btn" });
  expect(btn.a11y?.role).toBe("button");
  expect(btn.a11y?.name).toBe("Record View");
  expect(btn.visible).toBe(true);
  expect(btn.hittable).toBe(true);

  // A text input resolves to the textbox role.
  const input = await server.command<Inspected>("inspect", { selector: "#search-input" });
  expect(input.a11y?.role).toBe("textbox");

  // Hiding an ancestor makes the element not visible, and the reason names the
  // cause walked up the tree.
  await server.command("set_style", { selector: "#feed-section", properties: { display: "none" } });
  const hidden = await server.command<Inspected>("inspect", { selector: "#refresh-btn" });
  expect(hidden.visible).toBe(false);
  expect(hidden.hiddenReason).toContain("display:none");
  await server.command("reset_overrides");
});

test("inspect_element reports overflow and occlusion", async () => {
  type Inspected = {
    overflow?: { x: boolean; y: boolean; scrollWidth: number; clientWidth: number };
    hittable?: boolean;
    occludedBy?: { tag: string; id: string | null };
  };

  // Force horizontal overflow: a narrow, non-wrapping, clipped box whose text
  // is wider than its content area.
  await server.command("set_style", {
    selector: "#feed-status",
    properties: { width: "20px", "white-space": "nowrap", overflow: "hidden" },
  });
  const ov = await server.command<Inspected>("inspect", { selector: "#feed-status" });
  expect(ov.overflow?.x).toBe(true);
  expect(ov.overflow?.scrollWidth).toBeGreaterThan(ov.overflow?.clientWidth);
  await server.command("reset_overrides");

  // pointer-events:none makes the element non-hittable; the center-point
  // hit-test lands on whatever is behind it. Use a top-of-page button so its
  // center is reliably within the viewport.
  await server.command("set_style", {
    selector: "#record-view-btn",
    properties: { "pointer-events": "none" },
  });
  const occ = await server.command<Inspected>("inspect", { selector: "#record-view-btn" });
  expect(occ.hittable).toBe(false);
  expect(occ.occludedBy).toBeTruthy();
  await server.command("reset_overrides");
});

test("set_style applies inline CSS live and returns a preview note", async () => {
  const res = await server.command<{ applied: Record<string, string>; note: string }>("set_style", {
    selector: "#record-view-btn",
    properties: { "font-size": "13px", "white-space": "nowrap" },
  });
  expect(res.applied["font-size"]).toBe("13px");
  expect(res.note.toLowerCase()).toContain("preview");

  // Confirm it actually landed on the element.
  const info = await server.command<{ requested?: Record<string, string> }>("inspect", {
    selector: "#record-view-btn",
    properties: ["font-size", "white-space"],
  });
  expect(info.requested?.["font-size"]).toBe("13px");
  expect(info.requested?.["white-space"]).toBe("nowrap");
});

test("set_attribute sets and removes, warning on framework-owned attrs", async () => {
  // A framework-owned attribute carries a clobber warning.
  const cls = await server.command<{ frameworkWarning?: string }>("set_attribute", {
    selector: "#record-view-btn",
    name: "class",
    value: "preview-cls",
  });
  expect(cls.frameworkWarning).toBeTruthy();
  let info = await server.command<{ classes: string[] }>("inspect", {
    selector: "#record-view-btn",
  });
  expect(info.classes).toContain("preview-cls");

  // A plain attribute does not warn; null removes it.
  const data = await server.command<{ frameworkWarning?: string; value: unknown }>(
    "set_attribute",
    { selector: "#record-view-btn", name: "data-preview", value: "1" },
  );
  expect(data.frameworkWarning).toBeUndefined();
  info = await server.command<{ classes: string[] }>("inspect", { selector: "#record-view-btn" });

  const removed = await server.command<{ removed: boolean }>("set_attribute", {
    selector: "#record-view-btn",
    name: "data-preview",
    value: null,
  });
  expect(removed.removed).toBe(true);
  const after = await server.command<{ attributes: Record<string, string> }>("inspect", {
    selector: "#record-view-btn",
  });
  expect(after.attributes["data-preview"]).toBeUndefined();
});

test("set_text replaces content and always warns about framework clobber", async () => {
  const res = await server.command<{ text: string; frameworkWarning?: string }>("set_text", {
    selector: "#record-view-btn",
    text: "Tally a view",
  });
  expect(res.frameworkWarning).toBeTruthy();
  const info = await server.command<{ textContent?: string }>("inspect", {
    selector: "#record-view-btn",
  });
  expect(info.textContent).toBe("Tally a view");
});

test("reset_overrides rolls back every live edit", async () => {
  const before = await server.command<{
    textContent?: string;
    attributes: Record<string, string>;
    styles: Record<string, string>;
  }>("inspect", { selector: "#refresh-btn", properties: ["opacity"] });

  await server.command("set_style", { selector: "#refresh-btn", properties: { opacity: "0.3" } });
  await server.command("set_attribute", { selector: "#refresh-btn", name: "data-x", value: "y" });
  await server.command("set_text", { selector: "#refresh-btn", text: "CHANGED" });

  const reset = await server.command<{ reverted: number }>("reset_overrides");
  expect(reset.reverted).toBeGreaterThanOrEqual(3);

  const after = await server.command<{
    textContent?: string;
    attributes: Record<string, string>;
    requested?: Record<string, string>;
  }>("inspect", { selector: "#refresh-btn", properties: ["opacity"] });
  expect(after.textContent).toBe(before.textContent);
  expect(after.attributes["data-x"]).toBeUndefined();
  // opacity inline override removed → back to the stylesheet/computed default
  expect(after.requested?.opacity).toBe("1");
});

test("console output is intercepted and retrievable", async () => {
  await server.command("click", { selector: "#record-view-btn" });

  const logs = await server.poll<ConsoleEntry[]>("get_console_logs", {}, l =>
    l.some(e => JSON.stringify(e.args).includes("page view recorded")),
  );
  const entry = logs.find(e => JSON.stringify(e.args).includes("page view recorded"))!;
  expect(entry.level).toBe("log");
});

test("network requests are intercepted", async () => {
  await server.command("click", { selector: "#refresh-btn" });

  const requests = await server.poll<NetEntry[]>("get_network_requests", { filter: "events" }, r =>
    r.some(req => req.url.includes("/api/events")),
  );
  expect(requests.some(r => r.url.includes("/api/events"))).toBe(true);
});

test("a rejected fetch is recorded with an error field", async ({ page }) => {
  await page.evaluate(() => {
    // Already-aborted signal makes fetch reject immediately and deterministically.
    fetch("/api/never", { signal: AbortSignal.abort() }).catch(() => {});
  });

  const requests = await server.poll<NetEntry[]>("get_network_requests", { filter: "never" }, r =>
    r.some(req => req.url.includes("/api/never") && typeof req.error === "string"),
  );
  const failed = requests.find(r => r.url.includes("/api/never"))!;
  expect(String(failed.error).toLowerCase()).toMatch(/abort/);
});

test("request and response bodies + headers are captured", async ({ page }) => {
  await page.route("**/api/echo", route =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-echoed": "yes" },
      body: JSON.stringify({ got: "your post" }),
    }),
  );

  await page.evaluate(async () => {
    const res = await fetch("/api/echo", {
      method: "POST",
      headers: { "content-type": "application/json", "x-test": "hi" },
      body: JSON.stringify({ ping: "pong" }),
    });
    await res.text();
  });

  const reqs = await server.poll<NetEntry[]>("get_network_requests", { filter: "echo" }, r =>
    r.some(req => req.url.includes("/api/echo") && typeof req.responseBody === "string"),
  );
  const req = reqs.find(r => r.url.includes("/api/echo"))!;
  expect(req.method).toBe("POST");
  expect(req.requestBody).toBe(JSON.stringify({ ping: "pong" }));
  expect(req.requestHeaders?.["x-test"]).toBe("hi");
  expect(req.responseBody).toContain("got");
  expect(req.responseHeaders?.["x-echoed"]).toBe("yes");
});

test("response body is truncated when it exceeds the cap", async ({ page }) => {
  const huge = "x".repeat(20_000);
  await page.route("**/api/big", route =>
    route.fulfill({ status: 200, contentType: "text/plain", body: huge }),
  );

  await page.evaluate(() => fetch("/api/big").then(r => r.text()));

  const reqs = await server.poll<NetEntry[]>(
    "get_network_requests",
    { filter: "big" },
    r => r.some(req => req.url.includes("/api/big") && typeof req.responseBody === "string"),
    { timeout: 7000 },
  );
  const body = String(reqs.find(r => r.url.includes("/api/big"))?.responseBody);
  expect(body).toContain("truncated");
  expect(body.length).toBeLessThan(11_000); // 10 KB cap + small truncation marker
});

test("an SSE / event-stream response is not buffered as a body", async ({ page }) => {
  // A never-ending text/event-stream must be summarised, never read into memory.
  await page.route("**/api/stream", async route => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body: "data: hello\n\n",
    });
  });

  await page.evaluate(() => {
    fetch("/api/stream");
  });

  const reqs = await server.poll<NetEntry[]>("get_network_requests", { filter: "stream" }, r =>
    r.some(req => req.url.includes("/api/stream") && typeof req.responseBody === "string"),
  );
  const body = String(reqs.find(r => r.url.includes("/api/stream"))?.responseBody);
  expect(body.toLowerCase()).toContain("event stream");
  expect(body).not.toContain("data: hello"); // body bytes were never read
});

test("console.assert records on failure but stays silent on success", async ({ page }) => {
  await page.evaluate(() => {
    console.assert(true, "should NOT be recorded");
    console.assert(false, "should be recorded");
  });

  const logs = await server.poll<ConsoleEntry[]>("get_console_logs", {}, l =>
    l.some(e => e.method === "assert"),
  );
  const asserts = logs.filter(l => l.method === "assert");
  expect(asserts).toHaveLength(1);
  expect(asserts[0].level).toBe("error");
  expect(JSON.stringify(asserts[0].args)).toContain("should be recorded");
  expect(JSON.stringify(asserts[0].args)).not.toContain("NOT be recorded");
  expect(typeof asserts[0].stack).toBe("string");
  expect(String(asserts[0].stack).length).toBeGreaterThan(0);
});

test("console.count maintains state across calls", async ({ page }) => {
  await page.evaluate(() => {
    console.count("widgets");
    console.count("widgets");
    console.count("widgets");
  });

  const logs = await server.poll<ConsoleEntry[]>(
    "get_console_logs",
    {},
    l => l.filter(e => e.method === "count").length >= 3,
  );
  const counts = logs.filter(l => l.method === "count");
  expect(counts).toHaveLength(3);
  expect(counts[0].args[0]).toBe("widgets: 1");
  expect(counts[1].args[0]).toBe("widgets: 2");
  expect(counts[2].args[0]).toBe("widgets: 3");
});

test("console.time/timeEnd reports an elapsed duration", async ({ page }) => {
  await page.evaluate(async () => {
    console.time("op");
    await new Promise(r => setTimeout(r, 25));
    console.timeEnd("op");
  });

  const logs = await server.poll<ConsoleEntry[]>("get_console_logs", {}, l =>
    l.some(e => e.method === "timeEnd"),
  );
  const timed = logs.find(e => e.method === "timeEnd")!;
  expect(String(timed.args[0])).toMatch(/^op: \d+(\.\d+)?ms$/);
});

test("console.trace captures the call-site stack", async ({ page }) => {
  await page.evaluate(() => {
    console.trace("from the test");
  });

  const logs = await server.poll<ConsoleEntry[]>("get_console_logs", {}, l =>
    l.some(e => e.method === "trace"),
  );
  const traced = logs.find(e => e.method === "trace")!;
  expect(JSON.stringify(traced.args)).toContain("from the test");
  expect(typeof traced.stack).toBe("string");
  expect(String(traced.stack).length).toBeGreaterThan(0);
});

test("get_console_logs filters by level so errors aren't buried in noise", async ({ page }) => {
  await page.evaluate(() => {
    console.log("ordinary log");
    console.warn("deprecation warning");
    console.error("real error A");
    console.warn("another deprecation");
    console.error("real error B");
  });

  // Wait until all five have landed in the buffer.
  await server.poll<ConsoleEntry[]>(
    "get_console_logs",
    {},
    l => l.filter(e => e.level === "error").length >= 2,
  );

  const errorsOnly = await server.command<ConsoleEntry[]>("get_console_logs", {
    levels: ["error"],
  });
  expect(errorsOnly.length).toBe(2);
  expect(errorsOnly.every(l => l.level === "error")).toBe(true);

  const errorsAndWarns = await server.command<ConsoleEntry[]>("get_console_logs", {
    levels: ["error", "warn"],
  });
  expect(errorsAndWarns.length).toBe(4);
  expect(errorsAndWarns.some(l => l.level === "log")).toBe(false);
});

test("get_console_logs match filter is case-insensitive", async ({ page }) => {
  await page.evaluate(() => {
    console.log("Connecting to /api/users");
    console.warn("response slow");
    console.error("AUTH failure on /api/login");
  });

  await server.poll<ConsoleEntry[]>("get_console_logs", {}, l =>
    l.some(e => JSON.stringify(e.args).includes("AUTH")),
  );

  const auth = await server.command<ConsoleEntry[]>("get_console_logs", { match: "auth" });
  expect(auth.length).toBe(1);
  expect(JSON.stringify(auth[0].args).toLowerCase()).toContain("auth");

  const errorsMatchingAuth = await server.command<ConsoleEntry[]>("get_console_logs", {
    levels: ["error"],
    match: "auth",
  });
  expect(errorsMatchingAuth.length).toBe(1);
});

test("uncaught errors are captured", async ({ page }) => {
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error("boom uncaught");
    }, 0);
  });

  const logs = await server.poll<ConsoleEntry[]>("get_console_logs", { levels: ["error"] }, l =>
    l.some(e => e.method === "uncaught"),
  );
  const u = logs.find(e => e.method === "uncaught")!;
  expect(JSON.stringify(u.args)).toContain("boom uncaught");
  expect(typeof u.stack).toBe("string");
});

test("unhandled promise rejections are captured", async ({ page }) => {
  await page.evaluate(() => {
    Promise.reject(new Error("boom rejected"));
  });

  const logs = await server.poll<ConsoleEntry[]>("get_console_logs", { levels: ["error"] }, l =>
    l.some(e => e.method === "unhandledrejection"),
  );
  const r = logs.find(e => e.method === "unhandledrejection")!;
  expect(JSON.stringify(r.args)).toContain("boom rejected");
});

test("since filter scopes logs + network to what happened after a point", async ({ page }) => {
  await page.evaluate(() => console.log("before marker"));
  await server.poll<ConsoleEntry[]>("get_console_logs", {}, l =>
    l.some(e => JSON.stringify(e.args).includes("before marker")),
  );

  const t = Date.now();
  await new Promise(r => setTimeout(r, 5));
  await page.evaluate(() => {
    console.log("after marker");
    fetch("/api/since-test").catch(() => {});
  });

  const logs = await server.poll<ConsoleEntry[]>("get_console_logs", { since: t }, l =>
    l.some(e => JSON.stringify(e.args).includes("after marker")),
  );
  expect(logs.some(e => JSON.stringify(e.args).includes("after marker"))).toBe(true);
  expect(logs.some(e => JSON.stringify(e.args).includes("before marker"))).toBe(false);

  const nets = await server.poll<NetEntry[]>("get_network_requests", { since: t }, r =>
    r.some(x => x.url.includes("since-test")),
  );
  expect(nets.some(x => x.url.includes("since-test"))).toBe(true);
});

test("press_key fires key handlers on the target element", async ({ page }) => {
  await page.evaluate(() => {
    const input = document.getElementById("search-input")!;
    input.addEventListener("keydown", e => {
      if ((e as KeyboardEvent).key === "Enter") document.title = "ENTER_PRESSED";
    });
  });

  await server.command("press_key", { selector: "#search-input", key: "Enter" });
  const info = await server.command<{ title: string }>("get_page_info");
  expect(info.title).toBe("ENTER_PRESSED");
});

test("get_html returns the outerHTML of a region", async () => {
  const res = await server.command<{ html: string; truncated: boolean }>("get_html", {
    selector: "#member-list",
  });
  expect(res.html).toContain("<li");
  expect(res.html).toContain("Alice");
  expect(res.truncated).toBe(false);
});

test("get_page_info returns page context", async () => {
  const info = await server.command<{
    url: string;
    title: string;
    readyState: string;
    viewport: { width: number; height: number };
  }>("get_page_info");
  expect(info.url).toContain("localhost:4173");
  expect(typeof info.title).toBe("string");
  expect(info.viewport.width).toBeGreaterThan(0);
});
