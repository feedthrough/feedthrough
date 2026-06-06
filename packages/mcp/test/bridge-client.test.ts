/**
 * Unit tests for the real BridgeClient.
 *
 * The Playwright bridge-protocol spec exercises the wire protocol against a
 * stand-in server, so it never instantiates the real BridgeClient. Two paths
 * need the real class: the startup-error handling (a failed bind must surface a
 * clear error instead of crashing on an unhandled 'error' event), and the
 * origin allow-list enforced by the WebSocket server's verifyClient.
 *
 * Run with `node --test` (Node 22+ strips the TS types natively).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { WebSocket, WebSocketServer } from "ws";
import { BridgeClient } from "../src/bridge-client.ts";

const PORT = 8771;

/** Resolve once the BridgeClient's async 'error' handler has set startupError. */
async function waitForStartupError(client: BridgeClient, timeout = 1000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (client.startupError === null) {
    if (Date.now() > deadline) throw new Error("timed out waiting for startupError");
    await new Promise(r => setTimeout(r, 10));
  }
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

test("a failed bind surfaces a startup error through every tool path", async () => {
  // Occupy the port so the BridgeClient's bind fails with EADDRINUSE.
  const blocker = new WebSocketServer({ port: PORT, host: "127.0.0.1" });
  await new Promise<void>(resolve => blocker.on("listening", () => resolve()));

  const client = new BridgeClient(PORT);
  await waitForStartupError(client);

  // The message is actionable and mentions the port conflict.
  assert.match(client.startupError!, /already in use/i);
  assert.match(client.startupError!, new RegExp(String(PORT)));

  // connection_status reads startupError directly; connected must be false.
  assert.equal(client.connected, false);

  // Action tools go through sendCommand, which must reject with the same error
  // rather than the generic "no browser connected" message.
  await assert.rejects(
    () => client.sendCommand("query_dom", { selector: "#x" }),
    /already in use/i,
  );

  await client.close();
  await new Promise<void>(resolve => blocker.close(() => resolve()));
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
