import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { BridgeClient } from "./bridge-client.js";

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: true };

function ok(value: unknown): ToolResult {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}

function err(e: unknown): ToolResult {
  return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true };
}

async function run(bridge: BridgeClient, action: string, params: Record<string, unknown> = {}): Promise<ToolResult> {
  try {
    return ok(await bridge.sendCommand(action, params));
  } catch (e) {
    return err(e);
  }
}

export async function startServer(port = 8765): Promise<void> {
  const bridge = new BridgeClient(port);
  const server = new McpServer({ name: "feedthrough", version: "0.0.1" });

  server.registerTool("click", {
    description: "Click an element in the browser page.",
    inputSchema: { selector: z.string().describe("CSS selector for the element to click") },
  }, ({ selector }) => run(bridge, "click", { selector }));

  server.registerTool("fill", {
    description: "Type a value into an input field.",
    inputSchema: {
      selector: z.string().describe("CSS selector for the input element"),
      value: z.string().describe("Value to type"),
    },
  }, ({ selector, value }) => run(bridge, "fill", { selector, value }));

  server.registerTool("hover", {
    description: "Hover over an element to trigger mouseover/mouseenter events.",
    inputSchema: { selector: z.string().describe("CSS selector") },
  }, ({ selector }) => run(bridge, "hover", { selector }));

  server.registerTool("inspect_element", {
    description: "Return detailed information about an element: tag, id, classes, attributes, text content, bounding rect, and computed styles.",
    inputSchema: { selector: z.string().describe("CSS selector") },
  }, ({ selector }) => run(bridge, "inspect", { selector }));

  server.registerTool("query_dom", {
    description: "Query the DOM with a CSS selector and return a summary of all matching elements.",
    inputSchema: { selector: z.string().describe("CSS selector") },
  }, ({ selector }) => run(bridge, "query_dom", { selector }));

  server.registerTool("get_console_logs", {
    description: "Return console logs captured since the bridge was injected.",
    inputSchema: { limit: z.number().int().positive().optional().describe("Maximum number of most-recent entries to return") },
  }, ({ limit }) => run(bridge, "get_console_logs", limit !== undefined ? { limit } : {}));

  server.registerTool("get_network_requests", {
    description: "Return network requests (fetch + XHR) captured since the bridge was injected.",
    inputSchema: { filter: z.string().optional().describe("Filter by URL substring or HTTP method (e.g. 'api', 'POST')") },
  }, ({ filter }) => run(bridge, "get_network_requests", filter !== undefined ? { filter } : {}));

  server.registerTool("screenshot", {
    description: "Take a screenshot of the current page. Returns a base64-encoded image when a canvas library is available.",
  }, () => run(bridge, "screenshot"));

  server.registerTool("connection_status", {
    description: "Check whether a browser with @feedthrough/core injected is currently connected.",
  }, () => Promise.resolve(ok({ connected: bridge.connected })));

  process.stderr.write(`[feedthrough] MCP server starting, bridge WebSocket on ws://localhost:${port}\n`);
  await server.connect(new StdioServerTransport());
}
