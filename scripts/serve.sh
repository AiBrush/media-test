#!/usr/bin/env bash
# scripts/serve.sh — static-serve the suite so index.html runs in any browser (§13: "Suite also runs
# by opening index.html"). Serves the app (Vite dev server) AND the fixtures/ tree (media + golden)
# from the same origin so the runner can fetch /fixtures/media/<id> and /fixtures/golden/<id>.*.json.
#
# Uses bun/bunx (npm/npx are unavailable in this environment, §1). Vite is the default — it resolves
# the .ts module imports and serves the repo root, which already contains fixtures/, so no extra
# config is needed. Falls back to `vite preview` against a build if a dev server is not wanted.
#
#   serve.sh                 # vite dev server on :5173 (default)
#   serve.sh --port 8080     # choose a port
#   serve.sh --host          # expose on the LAN (0.0.0.0)
#   serve.sh --preview       # build then `vite preview` (serves dist/ + fixtures via symlink)
#
# Cross-origin isolation: performance.measureUserAgentSpecificMemory needs COOP/COEP headers. Vite's
# dev server honors a small middleware we set via the VITE config if present; absent that, peak-mem
# falls back gracefully (measure.ts handles the missing API). We pass the headers through env so a
# vite.config can pick them up, and they are harmless when unused.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

PORT="5173"
HOST_FLAG=""
PREVIEW=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --port=*) PORT="${1#*=}"; shift ;;
    --host) HOST_FLAG="--host"; shift ;;
    --preview) PREVIEW=1; shift ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "serve.sh: unknown arg '$1'" >&2; exit 2 ;;
  esac
done

if ! command -v bunx >/dev/null 2>&1 && ! command -v bun >/dev/null 2>&1; then
  echo "error: bun/bunx not found. This environment uses bun (npm/npx unavailable)." >&2
  exit 2
fi

# Run vite under the BUN runtime — never node. `bunx vite` honors vite's '#!/usr/bin/env node'
# shebang and spawns a node process; invoking vite's CLI script with `bun --bun` forces the bun
# runtime instead (verified: process is `bun --bun …vite.js`, no node, serves correctly).
run_vite() {
  bun --bun node_modules/vite/bin/vite.js "$@"
}

# Enable cross-origin isolation so measureUserAgentSpecificMemory is available where supported.
export VITE_COOP="same-origin"
export VITE_COEP="require-corp"

if [[ "${PREVIEW}" -eq 1 ]]; then
  echo "→ building suite (bunx vite build) then serving dist/ via vite preview on :${PORT}"
  run_vite build
  # vite preview serves dist/; fixtures live outside dist, so symlink them in for the preview server.
  if [[ ! -e dist/fixtures ]]; then ln -s ../fixtures dist/fixtures; fi
  run_vite preview --port "${PORT}" ${HOST_FLAG}
fi

echo "→ serving suite (bunx vite dev) on http://localhost:${PORT}/  (fixtures/ served from repo root)"
echo "  open http://localhost:${PORT}/index.html in any browser, or drive headlessly with scripts/run.sh"
run_vite --port "${PORT}" ${HOST_FLAG}
