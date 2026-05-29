/**
 * Bridge-protocol integration test.
 *
 * Unlike demo.spec.ts (which drives the page with native Playwright APIs), this
 * spec stands up a WebSocket server that plays the role of @feedthrough/mcp's
 * bridge-client, injects the real @feedthrough/core bridge pointing at it, and
 * exercises the wire protocol end to end: transport connect/hello, console and
 * network streaming, the failed-fetch path, and every command (query_dom, click,
 * fill, inspect, get_console_logs, get_network_requests).
 *
 * If the bridge regresses — transport, interceptors, or command dispatch — these
 * tests fail. demo.spec.ts would stay green.
 */
import { setupFeedthrough, expect } from "@feedthrough/playwright";
import { WebSocketServer, WebSocket } from "ws";

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
  private waiters: Array<{ match: (m: BridgeMessage) => boolean; resolve: (m: BridgeMessage) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }> = [];
  private connectionWaiters: Array<() => void> = [];
  private cmdId = 0;

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });
    this.wss.on("connection", (ws) => {
      this.socket = ws;
      this.received = []; // fresh page → fresh capture buffer
      const waiters = this.connectionWaiters;
      this.connectionWaiters = [];
      waiters.forEach((r) => r());

      ws.on("message", (data) => {
        let msg: BridgeMessage;
        try { msg = JSON.parse(data.toString()); } catch { return; }
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
    return new Promise((resolve) => this.connectionWaiters.push(resolve));
  }

  waitFor(match: (m: BridgeMessage) => boolean, timeout = 5000): Promise<BridgeMessage> {
    const existing = this.received.find(match);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w.timer !== timer);
        reject(new Error("timed out waiting for a matching bridge message"));
      }, timeout);
      this.waiters.push({ match, resolve, reject, timer });
    });
  }

  async command<T = unknown>(action: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = `test-cmd-${++this.cmdId}`;
    const result = this.waitFor((m) => m.type === "result" && m.commandId === id);
    this.socket!.send(JSON.stringify({ type: "command", id, action, ...params }));
    const res = await result;
    if (!res.ok) throw new Error(`command ${action} failed: ${res.error}`);
    return res.value as T;
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.wss.close(() => resolve()));
  }
}

const test = setupFeedthrough({ serverUrl: `ws://localhost:${PORT}` });

let server: TestBridgeServer;

test.beforeAll(() => { server = new TestBridgeServer(PORT); });
test.afterAll(async () => { await server.close(); });

// Establish a fresh bridge connection for each test and wait for the hello.
test.beforeEach(async ({ page }) => {
  const connected = server.nextConnection();
  await page.goto("/");
  await connected;
  await server.waitFor((m) => m.type === "hello");
});

test("transport connects and announces the page URL", async () => {
  const hello = await server.waitFor((m) => m.type === "hello");
  expect(hello.url).toContain("localhost:4173");
});

test("query_dom returns every matching element", async () => {
  const rows = await server.command<Array<{ tag: string }>>("query_dom", { selector: "#member-list li" });
  expect(rows).toHaveLength(6); // six team members rendered on load
  expect(rows[0].tag).toBe("li");
});

test("click dispatches a real click and the DOM mutates", async () => {
  const clicked = await server.command<{ tag: string; id: string | null }>("click", { selector: "#record-view-btn" });
  expect(clicked).toMatchObject({ tag: "button", id: "record-view-btn" });

  const counter = await server.command<{ textContent?: string }>("inspect", { selector: "#view-count" });
  expect(counter.textContent).toBe("2"); // app's off-by-one bug: one click adds 2
});

test("console output is intercepted and streamed", async () => {
  const log = server.waitFor((m) => m.type === "console" && JSON.stringify(m.args).includes("page view recorded"));
  await server.command("click", { selector: "#record-view-btn" });
  const msg = await log;
  expect(msg.level).toBe("log");

  const logs = await server.command<Array<{ level: string }>>("get_console_logs");
  expect(logs.some((l) => l.level === "log")).toBe(true);
});

test("fill sets the value and fires input/change so the app reacts", async () => {
  const filled = await server.command<{ tag: string; value: string }>("fill", { selector: "#search-input", value: "Alice" });
  expect(filled).toMatchObject({ tag: "input", value: "Alice" });

  const count = await server.command<{ textContent?: string }>("inspect", { selector: "#result-count" });
  expect(count.textContent).toContain("1 of 6"); // input handler ran and filtered the list
});

test("network requests are intercepted, including failures", async () => {
  // A successful (well, 200 but non-JSON) fetch the app fires on refresh.
  const netMsg = server.waitFor((m) => m.type === "network" && String(m.url).includes("/api/events"));
  await server.command("click", { selector: "#refresh-btn" });
  await netMsg;

  const requests = await server.command<Array<{ url: string; status?: number }>>("get_network_requests", { filter: "events" });
  expect(requests.some((r) => r.url.includes("/api/events"))).toBe(true);
});

test("a rejected fetch is recorded with an error field", async ({ page }) => {
  await page.evaluate(() => {
    // Already-aborted signal makes fetch reject immediately and deterministically.
    fetch("/api/never", { signal: AbortSignal.abort() }).catch(() => {});
  });

  const failed = await server.waitFor(
    (m) => m.type === "network" && String(m.url).includes("/api/never") && typeof m.error === "string",
  );
  expect(String(failed.error).toLowerCase()).toMatch(/abort/);
});

test("request and response bodies + headers are captured", async ({ page }) => {
  await page.route("**/api/echo", (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-echoed": "yes" },
      body: JSON.stringify({ got: "your post" }),
    }),
  );

  const bodied = server.waitFor(
    (m) => m.type === "network" && String(m.url).includes("/api/echo") && typeof m.responseBody === "string",
  );
  await page.evaluate(async () => {
    const res = await fetch("/api/echo", {
      method: "POST",
      headers: { "content-type": "application/json", "x-test": "hi" },
      body: JSON.stringify({ ping: "pong" }),
    });
    await res.text();
  });
  await bodied;

  type CapturedRequest = {
    method: string;
    url: string;
    requestBody?: string;
    requestHeaders?: Record<string, string>;
    responseBody?: string;
    responseHeaders?: Record<string, string>;
  };
  const reqs = await server.command<CapturedRequest[]>("get_network_requests", { filter: "echo" });
  const req = reqs.find((r) => r.url.includes("/api/echo"));
  expect(req).toBeDefined();
  expect(req!.method).toBe("POST");
  expect(req!.requestBody).toBe(JSON.stringify({ ping: "pong" }));
  expect(req!.requestHeaders?.["x-test"]).toBe("hi");
  expect(req!.responseBody).toContain("got");
  expect(req!.responseHeaders?.["x-echoed"]).toBe("yes");
});

test("response body is truncated when it exceeds the cap", async ({ page }) => {
  const huge = "x".repeat(20_000);
  await page.route("**/api/big", (route) =>
    route.fulfill({ status: 200, contentType: "text/plain", body: huge }),
  );

  const bodied = server.waitFor(
    (m) => m.type === "network" && String(m.url).includes("/api/big") && typeof m.responseBody === "string",
    7000,
  );
  await page.evaluate(() => fetch("/api/big").then((r) => r.text()));
  const msg = await bodied;

  const body = String(msg.responseBody);
  expect(body).toContain("truncated");
  expect(body.length).toBeLessThan(11_000); // 10 KB cap + small truncation marker
});

test("console.assert records on failure but stays silent on success", async ({ page }) => {
  const asserted = server.waitFor((m) => m.type === "console" && m.method === "assert");
  await page.evaluate(() => {
    console.assert(true, "should NOT be recorded");
    console.assert(false, "should be recorded");
  });
  const msg = await asserted;
  expect(msg.level).toBe("error");
  expect(JSON.stringify(msg.args)).toContain("should be recorded");
  expect(typeof msg.stack).toBe("string");
  expect(String(msg.stack).length).toBeGreaterThan(0);

  // Verify the truthy assertion was NOT captured.
  const logs = await server.command<Array<{ method?: string; args: unknown[] }>>("get_console_logs");
  const asserts = logs.filter((l) => l.method === "assert");
  expect(asserts).toHaveLength(1);
  expect(JSON.stringify(asserts[0].args)).not.toContain("NOT be recorded");
});

test("console.count maintains state across calls", async ({ page }) => {
  await page.evaluate(() => {
    console.count("widgets");
    console.count("widgets");
    console.count("widgets");
  });
  const logs = await server.command<Array<{ method?: string; args: unknown[] }>>("get_console_logs");
  const counts = logs.filter((l) => l.method === "count");
  expect(counts).toHaveLength(3);
  expect(counts[0].args[0]).toBe("widgets: 1");
  expect(counts[1].args[0]).toBe("widgets: 2");
  expect(counts[2].args[0]).toBe("widgets: 3");
});

test("console.time/timeEnd reports an elapsed duration", async ({ page }) => {
  const timed = server.waitFor((m) => m.type === "console" && m.method === "timeEnd");
  await page.evaluate(async () => {
    console.time("op");
    await new Promise((r) => setTimeout(r, 25));
    console.timeEnd("op");
  });
  const msg = await timed;
  const args = msg.args as unknown[];
  expect(String(args[0])).toMatch(/^op: \d+(\.\d+)?ms$/);
});

test("console.trace captures the call-site stack", async ({ page }) => {
  const traced = server.waitFor((m) => m.type === "console" && m.method === "trace");
  await page.evaluate(() => { console.trace("from the test"); });
  const msg = await traced;
  expect(JSON.stringify(msg.args)).toContain("from the test");
  expect(typeof msg.stack).toBe("string");
  expect(String(msg.stack).length).toBeGreaterThan(0);
});
