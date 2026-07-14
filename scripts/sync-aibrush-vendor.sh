#!/usr/bin/env bash
#
# sync-aibrush-vendor.sh — refresh node_modules/@aibrush/media from the latest build of ../../media.
#
# WHY THIS EXISTS. The suite runs the aibrush-media engine as a normal dependency:
#   package.json  ->  "@aibrush/media": "file:../media"
#   adapter.ts    ->  await import('@aibrush/media')  +  '@aibrush/media/core'
# Because it is a `file:` dependency, `bun install` COPIES ../media/dist into
# node_modules/@aibrush/media — it does not symlink. So the installed copy silently DRIFTS behind
# ../../media as that package is edited. Run this before a suite run to test the LATEST engine.
#
# WHAT IT DOES.
#   1. build @aibrush/media (tsup) so dist/ is current, then `vendor-wasm` to copy every codec tail's
#      *.wasm + glue INTO dist/ (a bare tsup dist has NO .wasm — the eager kernel stays wasm-free by
#      design; the codec tier needs the wasm or decode/transcode break).
#   2. `bun install` here, which re-copies the freshly-built dist/ into node_modules/@aibrush/media.
#
# Usage:  bun run sync-vendor        (from media-test/)   — or —   bash scripts/sync-aibrush-vendor.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # media-test/
MEDIA="$(cd "$HERE/../media" && pwd)"                     # aibrush.lib/media/
INSTALLED="$HERE/node_modules/@aibrush/media"

echo "[sync-vendor] media source: $MEDIA"
if command -v git >/dev/null 2>&1; then
  REV="$(git -C "$MEDIA" rev-parse --short HEAD 2>/dev/null || echo '?')"
  DIRTY="$(git -C "$MEDIA" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  echo "[sync-vendor] media @ $REV (${DIRTY} uncommitted change(s) — this build reflects the WORKING TREE)"
fi

echo "[sync-vendor] building @aibrush/media (tsup) + vendoring wasm into dist/ …"
( cd "$MEDIA" && bun run build && bun run vendor-wasm )

# A complete dist MUST carry the codec .wasm (else the install would ship a broken codec tier).
if [ "$(find "$MEDIA/dist" -name '*.wasm' | wc -l | tr -d ' ')" -eq 0 ]; then
  echo "[sync-vendor] ERROR: $MEDIA/dist has no *.wasm after build+vendor-wasm — refusing to install an incomplete runtime" >&2
  exit 1
fi

echo "[sync-vendor] installing into node_modules/@aibrush/media (bun copies the file: dep's dist) …"
( cd "$HERE" && bun install )

# The two entrypoints adapter.ts imports must exist, and the codec wasm must have come across.
for f in index.js core.js; do
  [ -f "$INSTALLED/dist/$f" ] || { echo "[sync-vendor] ERROR: $INSTALLED/dist/$f missing after install" >&2; exit 1; }
done
WASM_N="$(find "$INSTALLED/dist" -name '*.wasm' | wc -l | tr -d ' ')"
[ "$WASM_N" -gt 0 ] || { echo "[sync-vendor] ERROR: no *.wasm landed in node_modules/@aibrush/media/dist/" >&2; exit 1; }

# bun may either copy the file: dep's dist or symlink each entry back to $MEDIA/dist — both work with
# vite (it serves the symlink realpath). Count files+symlinks so the tally is right either way.
FILE_N="$(find "$INSTALLED/dist" \( -type f -o -type l \) | wc -l | tr -d ' ')"
echo "[sync-vendor] done — node_modules/@aibrush/media mirrors $MEDIA/dist (${FILE_N} files, ${WASM_N} wasm)."
echo "[sync-vendor] Restart the dev server / hard-reload the page so vite serves the fresh engine."
