# Feedthrough — Vue example

A minimal Vue 3 + Vite app showing that Feedthrough works with Vue just as well as React.
The bridge patches browser APIs (`console`, `fetch`, `XHR`) at the platform level, so the
framework doesn't matter.

For the full diagnostic workflow with three deliberately buggy features, see the
[React example](../react-app/README.md). This app has one bug — a page view counter that
increments by 2 while logging +1 — just enough to verify the bridge is working.

## Running

```bash
# Terminal 1 — app (http://localhost:5174 or next free port)
pnpm dev

# Terminal 2 — MCP server
cd ../../packages/mcp && node dist/index.js
```

Open the page, then ask an AI agent:

```
> click #record-view-btn
> get_console_logs
```

The display will show 2, the log will say 1.
