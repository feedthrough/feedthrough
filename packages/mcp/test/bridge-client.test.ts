/**
 * Unit tests for BridgeClient startup-error handling.
 *
 * The Playwright bridge-protocol spec exercises the wire protocol against a
 * stand-in server, so it never instantiates the real BridgeClient. This is the
 * one path that needs the real class: when the WebSocket server fails to bind
 * (port already in use, etc.), every tool must surface a clear error instead of
 * the process crashing on an unhandled 'error' event.
 *
 * Run with `node --test` (Node 22+ strips the TS types natively).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { WebSocketServer } from "ws";
import { BridgeClient } from "../src/bridge-client.ts";

const PORT = 8771;

/** Resolve once the BridgeClient's async 'error' handler has set startupError. */
async function waitForStartupError(client: BridgeClient, timeout = 1000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (client.startupError === null) {
    if (Date.now() > deadline) throw new Error("timed out waiting for startupError");
    await new Promise((r) => setTimeout(r, 10));
  }
}

test("a failed bind surfaces a startup error through every tool path", async () => {
  // Occupy the port so the BridgeClient's bind fails with EADDRINUSE.
  const blocker = new WebSocketServer({ port: PORT, host: "127.0.0.1" });
  await new Promise<void>((resolve) => blocker.on("listening", () => resolve()));

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
  await new Promise<void>((resolve) => blocker.close(() => resolve()));
});
