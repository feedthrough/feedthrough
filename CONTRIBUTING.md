# Contributing to Feedthrough

Thanks for taking the time to contribute.

## Contributor License Agreement

Before your pull request can be merged, you must sign the
[Contributor License Agreement](CLA.md). This is a one-time step — a bot will prompt you
automatically when you open your first PR.

The short version: you keep your copyright, and you grant the project maintainer the right to
use and relicense your contribution, including commercially. See [CLA.md](CLA.md) for the full
text.

## Getting started

```bash
git clone https://github.com/HEnquist/feedthrough.git
cd feedthrough
pnpm install   # Node ≥ 22 required
pnpm build
```

See [CLAUDE.md](CLAUDE.md) for the full project layout, build quirks, and per-package details.

## Pull requests

- Keep changes focused — one thing per PR.
- Run `pnpm build && pnpm typecheck` before opening a PR.
- No need to update the changelog or bump versions; the maintainer handles that.

## Reporting bugs

Open a GitHub issue with a minimal reproduction. If it involves the MCP tools, include the
output of `connection_status()` and any relevant `get_console_logs()` output.
