#!/usr/bin/env bash
# scripts/bake-fixtures.sh — run the OFFLINE fixture bake (§7). This is the ONLY script that may
# touch a native binary (ffmpeg/ffprobe, optionally Bento4/shaka). It generates the static media
# corpus + golden ground truth and writes checksums back into fixtures/manifest.json.
#
# The bake is offline + one-time; nothing here runs during the browser test loop. All flags are
# forwarded straight to fixtures/bake.mjs:
#   bake-fixtures.sh                       # bake everything (slow)
#   bake-fixtures.sh --subset h264,wav     # bake a subset by id-substring
#   bake-fixtures.sh wav_s16.wav           # bake one asset
#   bake-fixtures.sh --skip-longform       # skip the multi-hour stress asset
#   bake-fixtures.sh --force               # regenerate even if files exist
#   bake-fixtures.sh --golden-only         # re-derive golden from existing media
#
# Long full bakes: launch with run_in_background and poll the printed summary.
set -euo pipefail

# Resolve repo root from this script's location so it works from any CWD.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

if ! command -v bun >/dev/null 2>&1; then
  echo "error: 'bun' is required to run the bake (fixtures/bake.mjs runs under bun; node/npm/npx are unavailable here)." >&2
  exit 2
fi
if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  echo "error: ffmpeg and ffprobe must be on PATH for the offline bake (binaries allowed here ONLY)." >&2
  exit 2
fi

echo "→ baking fixtures via fixtures/bake.mjs $*"
exec bun fixtures/bake.mjs "$@"
