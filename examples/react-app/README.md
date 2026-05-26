# Feedthrough — React example app

A small React + Vite app that demonstrates the Feedthrough diagnostic workflow. It contains
three deliberate bugs that are invisible from the UI but immediately visible via MCP tools.

## Running

```bash
# Terminal 1 — app (http://localhost:5173)
pnpm dev

# Terminal 2 — MCP server
cd ../../packages/mcp && node dist/index.js
```

Then connect Claude Code to the MCP server and ask it to investigate.

## The bugs

### Bug 1 — Page view counter (off-by-one)

Clicking "Record View" logs `total: 1` to the console but the displayed count jumps to `2`.
Each click adds 2 to state while logging +1.

**How to find it:** `click #record-view-btn` a few times, then `get_console_logs` — the logged
totals will be half the displayed value.

### Bug 2 — Team search (case-sensitive)

Searching for `alice` returns no results. Searching for `Alice` works fine. The name comparison
is missing `.toLowerCase()` on the data side.

**How to find it:** `fill #search-input alice`, then `query_dom #member-list li` — zero items
despite Alice Chen being in the list.

### Bug 3 — Activity feed (silent 404)

Clicking "Refresh Feed" always leaves the feed empty. The request goes to `/api/events` (which
doesn't exist), returns a 404, and the error is caught and logged but never shown to the user.

**How to find it:** `click #refresh-btn`, then `get_network_requests` — shows a 404. Confirm
with `get_console_logs` — shows the swallowed error message.
