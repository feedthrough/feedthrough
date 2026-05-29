# @feedthrough/mcp

[feedthrough.dev](https://feedthrough.dev) · [npm](https://www.npmjs.com/package/@feedthrough/mcp) · [GitHub](https://github.com/feedthrough/feedthrough)

The MCP server for [Feedthrough](https://feedthrough.dev). Runs a WebSocket server that the
browser bridge connects to, and exposes all bridge capabilities as MCP tools over stdio.

## Usage

```bash
# via npx (once published)
npx @feedthrough/mcp

# from the monorepo
node packages/mcp/dist/index.js
```

Set `FEEDTHROUGH_PORT` to override the default WebSocket port (8765).

## MCP client config

Add to `.claude/settings.json` or `~/.claude.json`:

```json
{
  "mcpServers": {
    "feedthrough": {
      "command": "npx",
      "args": ["@feedthrough/mcp"]
    }
  }
}
```

## Tools

| Tool | Input | Description |
|---|---|---|
| `get_instructions` | — | Usage guide: recommended workflow, tool ordering, selector tips |
| `click` | `selector: string` | Click a DOM element |
| `fill` | `selector: string`, `value: string` | Type into an input |
| `hover` | `selector: string` | Fire mouseover/mouseenter |
| `inspect_element` | `selector: string` | Full element details — tag, classes, attributes, rect, styles |
| `query_dom` | `selector: string` | All matching elements, summarised |
| `get_console_logs` | `limit?: number` | Console output captured since bridge connected |
| `get_network_requests` | `filter?: string` | Fetch + XHR requests with headers and request/response bodies (10 KB cap); filter by URL substring or method |
| `connection_status` | — | Whether a browser is currently connected |

## Architecture

```
AI agent  ──stdio──  @feedthrough/mcp  ──ws://localhost:8765──  @feedthrough/core (browser)
```

Multiple browser tabs can be connected at once; commands are routed to the most recently active
tab, and `connection_status` lists them all. Commands are sent with unique IDs and matched to
responses with a 10-second timeout. All debug output goes to stderr so stdout stays clean for
the MCP protocol.
