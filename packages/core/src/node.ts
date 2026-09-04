// Node-side helpers for the build-tool adapters. Not part of the browser bundle:
// the adapters run in Node, read the environment there, and serialise the result
// into the page as a literal, so the browser never needs a discovery mechanism.

import type { BridgeOptions } from "./types";

export const DEFAULT_PORT = 8765;

// Read without @types/node so this stays inside the browser package's tsconfig,
// and so it degrades to "no env" rather than throwing if something bundles it.
function env(name: string): string | undefined {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.[name];
}

/**
 * Fills in `serverUrl` from the environment when the caller did not set one.
 *
 * The MCP server picks the port, not the page: it is spawned with its own
 * environment before the agent's first turn, and moves off 8765 when another
 * session's server already holds it. So the page has to be told where to
 * connect, and the dev server's environment is the channel:
 *
 *     FEEDTHROUGH_PORT=8766 npm run dev
 *
 * Precedence is `serverUrl` option > `FEEDTHROUGH_URL` > `FEEDTHROUGH_PORT` >
 * port 8765. An explicit option always wins, so a committed config that pins a
 * URL keeps working exactly as before.
 */
export function resolveBridgeOptions(options: BridgeOptions = {}): BridgeOptions {
  if (options.serverUrl !== undefined) return options;
  const serverUrl =
    env("FEEDTHROUGH_URL") ?? `ws://localhost:${env("FEEDTHROUGH_PORT") ?? DEFAULT_PORT}`;
  return { ...options, serverUrl };
}
