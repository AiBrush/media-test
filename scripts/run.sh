#!/usr/bin/env bash
# scripts/run.sh — run the suite across real browsers via the Playwright LAUNCHER (§13). It starts a
# static server (serve.sh), opens the suite in each requested browser, triggers the in-page run, and
# collects the results JSON the page exposes into results/raw/. THE LAUNCHER DOES NO MEASUREMENT —
# every number is produced in-page by the suite (BUILD_INSTRUCTIONS §10/§13/§15). This script only
# automates: serve → open → click Run → save.
#
# Flags (all optional; sensible defaults):
#   --engine <id>        run only this engine (repeatable / comma-separated). Default: all registered.
#   --browser <name>     chromium|webkit|firefox (repeatable / comma-separated). Default: all three.
#   --pillar <name>      functional|performance|robustness|all. Default: all.
#   --scenario <id>      run only this scenario (repeatable / comma-separated).
#   --port <n>           static server port (default 5173).
#   --warmup <n> --iters <n>   bench protocol overrides forwarded to the page.
#   --timeout-ms <ms>    per-browser run cap (default 1800000 = 30 min).
#   --headed             show the browser window (debugging).
#   --no-serve           do not start a server; assume one is already up at --base-url.
#   --base-url <url>     use this base url instead of starting a server (implies --no-serve).
#   --keep-serving       leave the server running after the run (for manual inspection).
#
# Long matrices: safe to launch with run_in_background — it starts its own server, runs to
# completion, tears the server down, and exits. Poll results/raw/ for the per-browser JSON files.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

# ── defaults ─────────────────────────────────────────────────────────────────────────────────
BROWSERS=()
ENGINES=()
SCENARIOS=()
PILLAR="all"
PORT="5173"
WARMUP=""
ITERS=""
TIMEOUT_MS="1800000"
HEADED=0
NO_SERVE=0
KEEP_SERVING=0
BASE_URL=""

append_csv() { local -n arr=$1; IFS=',' read -ra parts <<< "$2"; for p in "${parts[@]}"; do [[ -n "$p" ]] && arr+=("$p"); done; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --engine) append_csv ENGINES "$2"; shift 2 ;;
    --browser) append_csv BROWSERS "$2"; shift 2 ;;
    --scenario) append_csv SCENARIOS "$2"; shift 2 ;;
    --pillar) PILLAR="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --warmup) WARMUP="$2"; shift 2 ;;
    --iters) ITERS="$2"; shift 2 ;;
    --timeout-ms) TIMEOUT_MS="$2"; shift 2 ;;
    --headed) HEADED=1; shift ;;
    --no-serve) NO_SERVE=1; shift ;;
    --keep-serving) KEEP_SERVING=1; shift ;;
    --base-url) BASE_URL="$2"; NO_SERVE=1; shift 2 ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "run.sh: unknown arg '$1'" >&2; exit 2 ;;
  esac
done

if [[ ${#BROWSERS[@]} -eq 0 ]]; then BROWSERS=(chromium webkit firefox); fi
if [[ -z "${BASE_URL}" ]]; then BASE_URL="http://localhost:${PORT}"; fi

if ! command -v bun >/dev/null 2>&1; then echo "error: bun required for the launcher (node/npm/npx are unavailable here)." >&2; exit 2; fi

# ── start the static server (unless told not to) ─────────────────────────────────────────────
SERVER_PID=""
cleanup() {
  if [[ -n "${SERVER_PID}" ]] && [[ "${KEEP_SERVING}" -ne 1 ]]; then
    echo "[run] stopping static server (pid ${SERVER_PID})"
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if [[ "${NO_SERVE}" -ne 1 ]]; then
  echo "[run] starting static server on :${PORT}"
  bash "${SCRIPT_DIR}/serve.sh" --port "${PORT}" >/tmp/media-suite-serve.log 2>&1 &
  SERVER_PID=$!

  # Wait for the server to answer index.html (up to ~30s).
  echo "[run] waiting for ${BASE_URL}/index.html …"
  ready=0
  for _ in $(seq 1 60); do
    if curl -fsS "${BASE_URL}/index.html" >/dev/null 2>&1; then ready=1; break; fi
    # If the server died, surface its log.
    if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
      echo "[run] server exited early; log:" >&2; cat /tmp/media-suite-serve.log >&2; exit 1
    fi
    sleep 0.5
  done
  if [[ "${ready}" -ne 1 ]]; then
    echo "[run] server did not become ready; log:" >&2; cat /tmp/media-suite-serve.log >&2; exit 1
  fi
  echo "[run] server ready."
fi

# ── launch each browser through the Playwright driver ────────────────────────────────────────
mkdir -p results/raw

LAUNCH_COMMON=(--base-url "${BASE_URL}" --pillar "${PILLAR}" --out "results/raw" --timeout-ms "${TIMEOUT_MS}")
[[ "${HEADED}" -eq 1 ]] && LAUNCH_COMMON+=(--headed)
[[ -n "${WARMUP}" ]] && LAUNCH_COMMON+=(--warmup "${WARMUP}")
[[ -n "${ITERS}" ]] && LAUNCH_COMMON+=(--iters "${ITERS}")
for e in "${ENGINES[@]}"; do LAUNCH_COMMON+=(--engine "${e}"); done
for s in "${SCENARIOS[@]}"; do LAUNCH_COMMON+=(--scenario "${s}"); done

OVERALL=0
for b in "${BROWSERS[@]}"; do
  echo "[run] === ${b} ==="
  if bun "${SCRIPT_DIR}/launch.mjs" --browser "${b}" "${LAUNCH_COMMON[@]}"; then
    echo "[run] ${b} ok"
  else
    code=$?
    echo "[run] ${b} returned ${code} (a browser may be uninstalled, or some cells errored — results still saved)." >&2
    OVERALL=1
  fi
done

echo "[run] all requested browsers done. Raw results in results/raw/."
echo "[run] next: bash scripts/compare.sh  → results/report.md"
exit "${OVERALL}"
