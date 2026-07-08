#!/usr/bin/env bash
#
# sync-aibrush-vendor.sh — refresh the vendored aibrush-media runtime from the latest build of ../../media.
#
# WHY THIS EXISTS. The suite runs the aibrush-media engine from a LOCAL, GITIGNORED copy at
# src/engines/aibrush-media/vendor/ (imported at runtime by adapter.ts:
#   await import('./vendor/index.js')  +  './vendor/core.js'
# ). That vendor/ dir is a hand-copy of the media package's compiled dist/ — nothing wires it to the
# source, so it silently DRIFTS behind ../../media as that package is edited. Run this before a suite run
# to test the LATEST engine instead of a stale snapshot.
#
# WHY NOT just `cp dist vendor`. A bare `tsup` dist has NO .wasm (the eager kernel stays wasm-free by
# design). The media package's `vendor-wasm` step copies every codec tail's *.wasm + glue INTO dist/
# (its own header: "the harness's dist → vendor/ copy carries both"). So a complete runtime requires
#   bun run build && bun run vendor-wasm
# BEFORE the copy — otherwise the codec tier loads with missing .wasm and decode/transcode break.
#
# Usage:  bun run sync-vendor        (from media-browser-test/)   — or —   bash scripts/sync-aibrush-vendor.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # media-browser-test/
MEDIA="$(cd "$HERE/../../media" && pwd)"                  # aibrush.lib/media/
VENDOR="$HERE/src/engines/aibrush-media/vendor"

echo "[sync-vendor] media source: $MEDIA"
if command -v git >/dev/null 2>&1; then
  REV="$(git -C "$MEDIA" rev-parse --short HEAD 2>/dev/null || echo '?')"
  DIRTY="$(git -C "$MEDIA" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  echo "[sync-vendor] media @ $REV (${DIRTY} uncommitted change(s) — this build reflects the WORKING TREE)"
fi

echo "[sync-vendor] building @aibrush/media (tsup) + vendoring wasm into dist/ …"
( cd "$MEDIA" && bun run build && bun run vendor-wasm )

# A complete dist MUST carry the codec .wasm (else the copy would ship a broken codec tier).
if [ "$(find "$MEDIA/dist" -name '*.wasm' | wc -l | tr -d ' ')" -eq 0 ]; then
  echo "[sync-vendor] ERROR: $MEDIA/dist has no *.wasm after build+vendor-wasm — refusing to copy an incomplete runtime" >&2
  exit 1
fi

echo "[sync-vendor] mirroring dist → vendor (clean, drops orphaned chunks) …"
rm -rf "$VENDOR"
mkdir -p "$VENDOR"
cp -R "$MEDIA/dist/." "$VENDOR/"

# The two entrypoints adapter.ts imports must exist, and the codec wasm must have come across.
for f in index.js core.js; do
  [ -f "$VENDOR/$f" ] || { echo "[sync-vendor] ERROR: $VENDOR/$f missing after copy" >&2; exit 1; }
done
WASM_N="$(find "$VENDOR" -name '*.wasm' | wc -l | tr -d ' ')"
[ "$WASM_N" -gt 0 ] || { echo "[sync-vendor] ERROR: no *.wasm landed in vendor/" >&2; exit 1; }

echo "[sync-vendor] done — vendor/ now mirrors $MEDIA/dist ($(find "$VENDOR" -type f | wc -l | tr -d ' ') files, ${WASM_N} wasm)."
echo "[sync-vendor] Restart the dev server / hard-reload the page so vite serves the fresh vendor/."
