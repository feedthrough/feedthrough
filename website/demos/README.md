# Feedthrough demo videos

The little app that generates the demo clips on the landing page. Each clip is a **scripted
reenactment**: the harness plays a canned agent transcript (typewriter + tool-call chips) while
applying the real visual effects to a real buggy app. Playwright records the viewport; ffmpeg
encodes it. Deterministic and re-runnable any time the UI changes.

The agent prose and timing are staged. The DOM effects (the wrong row ticking, the button
growing) are the genuine behaviour. Output assets land in [`../public/`](../public/) and are
served at the site root.

## Demos

| `?demo=` | Bug | Feedthrough tools shown |
|---|---|---|
| `list` | Off-by-one — clicking "Item 3" ticks "Item 4" | `click`, `inspect_element`, `edit` |
| `button` | Label clipped by a too-narrow button; fixed via live `set_style` | `inspect_element`, `set_style`, `edit` |
| `occlusion` | Dialog buttons unclickable — an invisible text container covers them | `inspect_element`, `set_style`, `edit` |

## Layout

```
src/
  Harness.tsx        chat panel + demo stage; reads ?demo= and autoplays
  ChatPanel.tsx      renders the transcript (user / agent / tool chip / code diff)
  player.ts          ChatController + typewriter + play(timeline)
  timelines.ts       the two scripts, as plain data — edit these to change a demo
  demos/             ListBug.tsx (the off-by-one), ButtonOverflow.tsx
record/
  record.ts          Playwright: open harness, record webm, stop on __demoComplete
  encode.sh          ffmpeg: raw webm → public/demo-*.{mp4,webm,gif}
  raw/               raw captures (gitignored)
```

## Preview a take

```bash
pnpm --filter @feedthrough/demos dev      # http://localhost:5173
```

Open `http://localhost:5173/?demo=list` — it autoplays on load. Reload to replay. Append
`&autoplay=0` to inspect a frozen frame. Edit `src/timelines.ts` and the change is live.

## Record + encode

```bash
pnpm --filter @feedthrough/demos dev      # terminal 1 — leave running
pnpm --filter @feedthrough/demos record   # terminal 2 — records both demos
pnpm --filter @feedthrough/demos encode    # ffmpeg → ../public/demo-*.{mp4,webm,gif}
```

`record`/`encode` take demo names to do just one: `pnpm record list`, `pnpm encode list`.

`encode` reads from `record/raw/`, so if you only changed encode settings (trim, fps, codec)
you can re-`encode` without re-`record`. Anything that changes what's on screen — layout,
timelines, sizing, or timing — needs a fresh `record` first.

## Timing & framing knobs

Four numbers control how the clips look and feel. After changing any of them, re-record + encode
(except `TRIM`, which is encode-only).

| Knob | Where | What it does |
|---|---|---|
| `SIZE` | `record/record.ts` | Capture dimensions (currently `800×450`). For retina output, double it and add `deviceScaleFactor: 2`. |
| `LEAD_IN_MS` | `src/Harness.tsx` | Idle pause before the user starts typing (~1s visible; includes the `TRIM` below). |
| `waitForTimeout(…)` | `record/record.ts` | How long it sits on the final frame before the loop restarts. |
| `TRIM` | `record/encode.sh` | Seconds shaved off the front. Playwright captures a white pre-render frame; trimming it stops the loop from flashing white. Override per run: `TRIM=0.8 pnpm encode`. |

The stage/card sizing and the dark recording background live in `src/styles.css` and
`index.html` respectively.

## Re-recording later

When the harness UI changes:

1. `pnpm --filter @feedthrough/demos record && pnpm --filter @feedthrough/demos encode`
   — regenerates `../public/demo-*.{mp4,webm,gif}`.
2. **Rebuild the site** so the static build picks up the new files:
   `pnpm --filter feedthrough-website build`.
3. Commit the regenerated files in `../public/`.

The scripts here are the source of truth — the videos are build output. `record/raw/` is
gitignored; only the encoded assets in `../public/` are committed.

## Priming prompts (for a live agent demo, not the recording)

If you ever want to drive the *real* apps with a real agent over Feedthrough instead of the
reenactment, prime it with:

> When I describe a UI issue, start by interacting with the page using the Feedthrough MCP tools.
> Reproduce the issue visually before inspecting the code. Explain what you observe, ask a
> clarifying question if multiple fixes are possible, and only then propose a fix. After applying
> it, verify by interacting with the UI again.
