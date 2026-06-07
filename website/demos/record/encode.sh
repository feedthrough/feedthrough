#!/usr/bin/env bash
# Transcode the raw Playwright webm captures into web-ready assets under
# website/public/. Produces mp4 (broad support) + webm (smaller) per demo, and
# an optional gif. Requires ffmpeg.
set -euo pipefail
cd "$(dirname "$0")"

# This script lives in website/demos/record/, so the served public dir is two up.
OUT="../../public"
mkdir -p "$OUT"

DEMOS=("$@")
[ ${#DEMOS[@]} -eq 0 ] && DEMOS=(list button occlusion)

# Playwright starts capturing on the blank pre-render page (a white frame), which
# would flash on every loop. Skip the first fraction of a second so each clip
# begins — and loops back to — a fully-rendered dark frame.
TRIM="${TRIM:-0.6}"

for demo in "${DEMOS[@]}"; do
  raw="raw/$demo.webm"
  if [ ! -f "$raw" ]; then
    echo "skip $demo — $raw not found (run pnpm record first)"
    continue
  fi

  # mp4 / h264 — the primary <source>, plays everywhere
  ffmpeg -y -ss "$TRIM" -i "$raw" -vf "fps=30" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "$OUT/demo-$demo.mp4"

  # webm / vp9 — smaller, crisper, listed first in <video>
  ffmpeg -y -ss "$TRIM" -i "$raw" -vf "fps=30" -c:v libvpx-vp9 -b:v 0 -crf 32 "$OUT/demo-$demo.webm"

  # gif — optional, for places that can't embed <video>
  pal="$(mktemp -t ft-pal-XXXX).png"
  ffmpeg -y -ss "$TRIM" -i "$raw" -vf "fps=15,scale=900:-1:flags=lanczos,palettegen" "$pal"
  ffmpeg -y -ss "$TRIM" -i "$raw" -i "$pal" -lavfi "fps=15,scale=900:-1:flags=lanczos[x];[x][1:v]paletteuse" "$OUT/demo-$demo.gif"
  rm -f "$pal"

  echo "encoded $demo → $OUT/demo-$demo.{mp4,webm,gif}"
done
