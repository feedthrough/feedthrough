/**
 * Unit tests for the real BridgeClient.
 *
 * The Playwright bridge-protocol spec exercises the wire protocol against a
 * stand-in server, so it never instantiates the real BridgeClient. Three paths
 * need the real class: the bind behaviour (a busy port must be stepped over so a
 * second agent session is not left inert, and an exhausted range must still
 * surface a clear error instead of crashing on an unhandled 'error' event), the
 * `welcome` handshake that tells a page which server it reached, and the origin
 * allow-list enforced by the WebSocket server's verifyClient.
 *
 * Run with `node --test` (Node 22+ strips the TS types natively).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { WebSocket, WebSocketServer } from "ws";
import { BridgeClient } from "../src/bridge-client.ts";

const PORT = 8771;

/** Resolve once the BridgeClient's async 'error' handler has set startupError. */
async function waitForStartupError(client: BridgeClient, timeout = 2000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (client.startupError === null) {
    if (Date.now() > deadline) throw new Error("timed out waiting for startupError");
    await new Promise(r => setTimeout(r, 10));
  }
}

/** Resolve once the BridgeClient has bound a port (it may have stepped up to find one). */
async function waitForBind(client: BridgeClient, timeout = 2000): Promise<number> {
  const deadline = Date.now() + timeout;
  while (client.port === null) {
    if (client.startupError !== null) throw new Error(`bind failed: ${client.startupError}`);
    if (Date.now() > deadline) throw new Error("timed out waiting for the bridge to bind");
    await new Promise(r => setTimeout(r, 10));
  }
  return client.port;
}

/** Occupy a contiguous range of ports; returns a disposer. */
async function occupy(from: number, count: number): Promise<() => Promise<void>> {
  const servers: WebSocketServer[] = [];
  for (let p = from; p < from + count; p++) {
    const s = new WebSocketServer({ port: p, host: "127.0.0.1" });
    await new Promise<void>(resolve => s.on("listening", () => resolve()));
    servers.push(s);
  }
  return async () => {
    for (const s of servers) await new Promise<void>(resolve => s.close(() => resolve()));
  };
}

/** Open one connection with the given Origin; resolve whether the server accepted it. */
function tryConnect(port: number, origin: string, timeout = 1000): Promise<boolean> {
  return new Promise(resolve => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin });
    const finish = (accepted: boolean) => {
      clearTimeout(timer);
      ws.terminate();
      resolve(accepted);
    };
    const timer = setTimeout(() => finish(false), timeout);
    ws.on("open", () => finish(true));
    ws.on("error", () => finish(false));
  });
}

/** Resolve once the bridge is accepting connections (loopback is always allowed). */
async function waitUntilReady(port: number, timeout = 1000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!(await tryConnect(port, "http://localhost"))) {
    if (Date.now() > deadline) throw new Error("bridge did not start accepting connections");
    await new Promise(r => setTimeout(r, 10));
  }
}

test("a busy port is stepped over rather than leaving the server inert", async () => {
  // The usual cause is another agent session's feedthrough server holding the
  // default port. Occupy two so the client has to step more than once.
  const release = await occupy(PORT, 2);

  const client = new BridgeClient(PORT);
  const bound = await waitForBind(client);

  assert.equal(bound, PORT + 2);
  assert.equal(client.startupError, null);
  // connection_status has to report the real port: the agent cannot pick it
  // (the server was spawned before its first turn), it can only be told.
  assert.deepEqual(client.info, { name: client.name, port: PORT + 2, version: "unknown" });
  assert.equal(client.requestedPort, PORT);

  await client.close();
  await release();
});

test("an exhausted port range still surfaces a startup error through every tool path", async () => {
  // Ten attempts, so ten occupied ports leave nowhere to go.
  const release = await occupy(PORT, 10);

  const client = new BridgeClient(PORT);
  await waitForStartupError(client);

  // The message is actionable and names the range it tried.
  // biome-ignore lint/style/noNonNullAssertion: startupError is set after the start failure asserted above
  assert.match(client.startupError!, /no free port/i);
  // biome-ignore lint/style/noNonNullAssertion: startupError is set after the start failure asserted above
  assert.match(client.startupError!, new RegExp(`${PORT}-${PORT + 9}`));

  // connection_status reads startupError directly; connected must be false.
  assert.equal(client.connected, false);

  // Action tools go through sendCommand, which must reject with the same error
  // rather than the generic "no browser connected" message.
  await assert.rejects(() => client.sendCommand("query_dom", { selector: "#x" }), /no free port/i);

  await client.close();
  await release();
});

test("the server names itself to each page in a welcome message", async () => {
  const port = 8781;
  const client = new BridgeClient(port, "1.2.3");
  await waitForBind(client);

  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin: "http://localhost:5173" });
  const welcome = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no welcome message")), 2000);
    ws.on("message", data => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
    ws.on("error", reject);
  });

  // This is what lets a page say which bridge it is on, so a mispaired session
  // is a one-call check rather than something noticed by the wrong app changing.
  assert.deepEqual(welcome, {
    type: "welcome",
    name: client.name,
    port,
    version: "1.2.3",
  });
  // Readable and unambiguous: three lowercase words.
  assert.match(client.name, /^[a-z]+-[a-z]+-[a-z]+$/);

  ws.terminate();
  await client.close();
});

test("the bridge accepts loopback and default .test origins, rejects public ones", async () => {
  const port = 8772;
  const client = new BridgeClient(port);
  await waitUntilReady(port);

  // Loopback always connects.
  assert.equal(await tryConnect(port, "http://localhost:5173"), true);
  assert.equal(await tryConnect(port, "http://127.0.0.1:8080"), true);
  // .test is allowed by default (e.g. Laravel Valet's myapp.test).
  assert.equal(await tryConnect(port, "https://myapp.test"), true);
  // A public origin with no allowed suffix is rejected.
  assert.equal(await tryConnect(port, "https://example.com"), false);

  await client.close();
});

test("FEEDTHROUGH_ALLOWED_HOST_SUFFIXES replaces the default suffix list", async () => {
  const original = process.env.FEEDTHROUGH_ALLOWED_HOST_SUFFIXES;
  process.env.FEEDTHROUGH_ALLOWED_HOST_SUFFIXES = ".local";
  const port = 8773;
  const client = new BridgeClient(port);
  await waitUntilReady(port);

  try {
    // The configured suffix connects.
    assert.equal(await tryConnect(port, "https://myapp.local"), true);
    // Setting the env var replaces the defaults, so .test no longer applies.
    assert.equal(await tryConnect(port, "https://myapp.test"), false);
    // Loopback is always allowed, regardless of the suffix list.
    assert.equal(await tryConnect(port, "http://localhost"), true);
  } finally {
    await client.close();
    if (original === undefined) {
      delete process.env.FEEDTHROUGH_ALLOWED_HOST_SUFFIXES;
    } else {
      process.env.FEEDTHROUGH_ALLOWED_HOST_SUFFIXES = original;
    }
  }
});

test("a suffix without a leading dot is normalized to a boundary match", async () => {
  const original = process.env.FEEDTHROUGH_ALLOWED_HOST_SUFFIXES;
  // No leading dot: must not match an arbitrary substring of the hostname.
  process.env.FEEDTHROUGH_ALLOWED_HOST_SUFFIXES = "test";
  const port = 8774;
  const client = new BridgeClient(port);
  await waitUntilReady(port);

  try {
    // A real subdomain under the suffix still connects.
    assert.equal(await tryConnect(port, "https://app.test"), true);
    // "mytest" ends with "test" but not ".test", so it must be rejected.
    assert.equal(await tryConnect(port, "https://mytest"), false);
  } finally {
    await client.close();
    if (original === undefined) {
      delete process.env.FEEDTHROUGH_ALLOWED_HOST_SUFFIXES;
    } else {
      process.env.FEEDTHROUGH_ALLOWED_HOST_SUFFIXES = original;
    }
  }
});
