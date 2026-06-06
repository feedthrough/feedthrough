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

### Allowed origins

The bridge WebSocket only accepts connections whose page origin is loopback
(`localhost`, `127.0.0.1`, `::1`) or ends with an allowed host suffix. The
default suffix list is `.test`, so apps served on local dev domains — e.g.
Laravel Valet's `myapp.test` — connect out of the box.

Override the suffix list with `FEEDTHROUGH_ALLOWED_HOST_SUFFIXES`
(comma-separated). Setting it **replaces** the defaults, so re-include `.test`
if you still want it:

    FEEDTHROUGH_ALLOWED_HOST_SUFFIXES=".test,.local,.localhost"

This only widens which page origins may connect; the server still binds to
`127.0.0.1` only. Set it to empty (`FEEDTHROUGH_ALLOWED_HOST_SUFFIXES=`) for
loopback-only.

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
| `press_key` | `selector: string`, `key: string` | Dispatch a key press (Enter, Escape, Tab, arrows, or a character) |
| `inspect_element` | `selector: string`, `properties?: string[]` | Full element details — tag, attributes, bounding rect + inViewport, curated computed styles, overflow info (clipped/overflowing content), effective visibility (`visible` + reason, accounting for ancestors), live form state; `properties` reads extra CSS props by name |
| `query_dom` | `selector: string` | All matching elements, summarised |
| `get_console_logs` | `limit?`, `levels?`, `match?`, `since?` | Console output across every method, plus uncaught errors & promise rejections; filter by levels/match/since |
| `get_network_requests` | `filter?`, `since?` | Fetch + XHR with headers and request/response bodies (10 KB cap); narrow by filter or since |
| `get_html` | `selector: string` | Raw outerHTML of a region (capped at 50 KB) |
| `get_page_info` | — | URL, title, readyState, viewport, scroll, user agent |
| `connection_status` | — | Whether a browser is currently connected |
| `set_style` | `selector: string`, `properties: Record<string,string>` | Preview a visual fix — set inline CSS live (not saved to source) |
| `set_attribute` | `selector: string`, `name: string`, `value: string \| null` | Preview an attribute change (toggle disabled, swap class, aria-*); `null` removes |
| `set_text` | `selector: string`, `text: string` | Preview wording/label changes — replace an element's text |
| `reset_overrides` | — | Undo every live `set_style` / `set_attribute` / `set_text` change |

`set_style` / `set_attribute` / `set_text` are **live previews**, not saved edits — they mutate the
running DOM only and reset on reload. Framework-owned text/attributes may be overwritten on the next
render; the tool result flags this.

## Architecture

```
AI agent  ──stdio──  @feedthrough/mcp  ──ws://localhost:8765──  @feedthrough/core (browser)
```

Multiple browser tabs can be connected at once; commands are routed to the most recently active
tab, and `connection_status` lists them all. Commands are sent with unique IDs and matched to
responses with a 10-second timeout. All debug output goes to stderr so stdout stays clean for
the MCP protocol.
