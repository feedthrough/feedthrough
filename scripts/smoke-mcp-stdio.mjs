#!/usr/bin/env node
// Smoke-test an MCP stdio server: launch it, run the initialize + tools/list
// handshake, and assert it reports a version and the expected tool count
// (EXPECTED_TOOL_COUNT).
//
// The launch command is passed as argv, so it works against the built package
// or the Docker image:
//   node scripts/smoke-mcp-stdio.mjs node packages/mcp/dist/index.js
//   node scripts/smoke-mcp-stdio.mjs docker run -i --rm feedthrough-mcp:ci
//
// Exits 0 on success, 1 on failure. Resolves as soon as both responses arrive
// (no fixed sleep), with a hard timeout as a backstop.

import { spawn } from "node:child_process";

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error("usage: smoke-mcp-stdio.mjs <command> [args...]");
  process.exit(1);
}

const TIMEOUT_MS = 30_000;
const EXPECTED_TOOL_COUNT = 16;

const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "inherit"] });

let buffer = "";
const responses = new Map(); // id -> message

const timer = setTimeout(
  () => fail(`timed out after ${TIMEOUT_MS}ms waiting for responses`),
  TIMEOUT_MS,
);

function send(msg) {
  child.stdin.write(`${JSON.stringify(msg)}\n`);
}

let finished = false;

// Shut the child down gracefully so `docker run` can stop and --rm its container;
// SIGKILL only as a fallback if it doesn't exit promptly.
function shutdown(code) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  // If the child has already exited (e.g. shutdown was called from its own exit
  // handler), exit now — a fresh once("exit") would never fire.
  if (child.exitCode !== null || child.signalCode !== null) {
    process.exit(code);
  }
  child.once("exit", () => process.exit(code));
  child.kill("SIGTERM");
  setTimeout(() => child.kill("SIGKILL"), 2000).unref();
}

function fail(reason) {
  if (finished) return;
  console.error(`✗ smoke test failed: ${reason}`);
  shutdown(1);
}

child.on("error", err => fail(`could not launch '${cmd}': ${err.message}`));
child.on("exit", code => {
  // Only an early, unprompted exit (before we finished) counts as a failure.
  if (!finished && !responses.has(2)) fail(`server exited early (code ${code})`);
});

child.stdout.on("data", chunk => {
  buffer += chunk.toString();
  let nl;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard line-buffering loop
  while ((nl = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue; // ignore non-JSON log noise
    }
    if (msg.id !== undefined) responses.set(msg.id, msg);
    if (responses.has(1) && !responses.has(2)) {
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    }
    if (responses.has(2)) check();
  }
});

function check() {
  const init = responses.get(1);
  const list = responses.get(2);

  const version = init?.result?.serverInfo?.version;
  if (!version) return fail("initialize did not return serverInfo.version");

  const tools = list?.result?.tools;
  if (!Array.isArray(tools) || tools.length === 0) return fail("tools/list returned no tools");
  if (tools.length !== EXPECTED_TOOL_COUNT) {
    return fail(`expected ${EXPECTED_TOOL_COUNT} tools, got ${tools.length}`);
  }

  console.log(`✓ MCP server ok: ${init.result.serverInfo.name} v${version}, ${tools.length} tools`);
  shutdown(0);
}

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "ci-smoke", version: "0" },
  },
});
