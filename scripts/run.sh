#!/usr/bin/env bash
# scripts/run.sh — run the suite across real browsers via the Playwright LAUNCHER (§13). It starts a
# static server (serve.sh), opens the suite in each requested browser, triggers the in-page run, and
# collects the results JSON the page exposes into results/raw/. THE LAUNCHER DOES NO MEASUREMENT —
# every number is produced in-page by the suite (BUILD_INSTRUCTIONS §10/§13/§15). This script only
# automates: serve → open → click Run → save.
#
# Flags (all optional; sensible defaults):
#   --engine <id>        run only this engine (repeatable / comma-separated). Default: all registered.
#   --browser <name>     brave|chromium|webkit|firefox (repeatable / comma-separated). Default: brave.
#   --feature <id>       run only this feature family (probe|demux|remux|...). Repeatable / CSV.
#   --operation <op>     run only this operation (probe|demux|remux|...). Repeatable / CSV.
#   --pillar <name>      functional|performance|robustness|all. Default: all.
#   --scenario <id>      run only this scenario (repeatable / comma-separated).
#   --port <n>           static server port. Default: reuse the last cache-origin port when free,
#                        otherwise choose a temporary free port. Pass --port to pin one; if a pinned
#                        port is already taken the run aborts (it will NOT reuse a foreign server).
#   --warmup <n> --iters <n>   bench protocol overrides forwarded to the page.
#   --timeout-ms <ms>    per-browser run cap (default 86400000 = 24 hours).
#   --exhaustive         run every eligible catalog input for each selected scenario.
#   --no-reuse           force every selected executable cell to run instead of reusing stored
#                        results from prior runs.
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
FEATURES=()
OPERATIONS=()
SCENARIOS=()
PILLAR="all"
PORT=""            # empty ⇒ prefer the remembered cache-origin port (see port selection below)
PORT_EXPLICIT=0   # set when the user pins --port (we then refuse to reuse a foreign server on it)
WARMUP=""
ITERS=""
TIMEOUT_MS="86400000"
NO_SERVE=0
KEEP_SERVING=0
BASE_URL=""
NO_REUSE=0
EXHAUSTIVE=0
CACHE_PROFILE_DIR="${ROOT_DIR}/results/.browser-cache"
PORT_STATE_FILE="${CACHE_PROFILE_DIR}/runner-origin-port"

# bash 3.2-compatible CSV-append into a named array (macOS ships bash 3.2 — no `local -n` namerefs).
append_csv() { local _name="$1" _val="$2" _p; IFS=',' read -ra _parts <<< "$_val"; for _p in "${_parts[@]}"; do [[ -n "$_p" ]] && eval "${_name}+=(\"\$_p\")"; done; }

print_help() {
  echo "bash scripts/run.sh [wrapper options] [canonical run options]"
  echo "The wrapper opens each requested browser in a visible window."
  echo "Canonical options (generated from src/app/options.ts):"
  bun "${SCRIPT_DIR}/launch.mjs" --help-canonical
  echo "Default run deadline: 86400000 ms (24 hours)."
  printf '%s\n' \
    "Wrapper options:" \
    "  --port <n>         pin the suite server port (default: reuse the last cache-origin port)" \
    "  --no-serve         use an already-running suite server" \
    "  --base-url <URL>   server URL; implies --no-serve" \
    "  --keep-serving     leave a server started by this wrapper running"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --engine) append_csv ENGINES "$2"; shift 2 ;;
    --browser) append_csv BROWSERS "$2"; shift 2 ;;
    --feature) append_csv FEATURES "$2"; shift 2 ;;
    --operation) append_csv OPERATIONS "$2"; shift 2 ;;
    --scenario) append_csv SCENARIOS "$2"; shift 2 ;;
    --pillar) PILLAR="$2"; shift 2 ;;
    --port) PORT="$2"; PORT_EXPLICIT=1; shift 2 ;;
    --warmup) WARMUP="$2"; shift 2 ;;
    --iters) ITERS="$2"; shift 2 ;;
    --timeout-ms) TIMEOUT_MS="$2"; shift 2 ;;
    --exhaustive) EXHAUSTIVE=1; shift ;;
    --no-reuse) NO_REUSE=1; shift ;;
    --no-serve) NO_SERVE=1; shift ;;
    --keep-serving) KEEP_SERVING=1; shift ;;
    --base-url) BASE_URL="$2"; NO_SERVE=1; shift 2 ;;
    -h|--help) print_help; exit 0 ;;
    *) echo "run.sh: unknown arg '$1'" >&2; exit 2 ;;
  esac
done

# Default to Brave in a visible browser window. Other browsers remain selectable via --browser.
if [[ ${#BROWSERS[@]} -eq 0 ]]; then BROWSERS=(brave); fi

if ! command -v bun >/dev/null 2>&1; then echo "error: bun required for the launcher (node/npm/npx are unavailable here)." >&2; exit 2; fi

# ── port helpers ───────────────────────────────────────────────────────────────────────────────
# port_in_use <port> → 0 (true) if something is LISTENING on the TCP port, else 1. Uses lsof when
# available (present on macOS + most Linux); falls back to a bash /dev/tcp connect probe.
port_in_use() {
  local p="$1"
  if command -v lsof >/dev/null 2>&1; then
    [[ -n "$(lsof -ti "tcp:${p}" -sTCP:LISTEN 2>/dev/null)" ]]
    return $?
  fi
  # /dev/tcp probe: a successful connect means a listener is present.
  (exec 3<>"/dev/tcp/127.0.0.1/${p}") >/dev/null 2>&1 && { exec 3>&- 3<&- 2>/dev/null; return 0; }
  return 1
}

# pids_on_port <port> → space-separated PIDs LISTENING on the port (empty if none / no lsof).
pids_on_port() {
  command -v lsof >/dev/null 2>&1 && lsof -ti "tcp:$1" -sTCP:LISTEN 2>/dev/null | tr '\n' ' '
}

# valid_port <value> → 0 only for a decimal TCP port in range.
valid_port() {
  local value="$1" decimal
  case "${value}" in ''|*[!0-9]*) return 1 ;; esac
  [[ "${#value}" -le 5 ]] || return 1
  decimal=$((10#${value}))
  [[ "${decimal}" -ge 1 && "${decimal}" -le 65535 ]]
}

# read_remembered_port → echo the last origin port selected by this wrapper, if valid.
read_remembered_port() {
  local value=""
  [[ -f "${PORT_STATE_FILE}" ]] || return 0
  IFS= read -r value < "${PORT_STATE_FILE}" || true
  valid_port "${value}" && echo "${value}"
}

# remember_origin_port <port> → best-effort persistence under the already-ignored browser profile.
remember_origin_port() {
  local value="$1" temporary
  valid_port "${value}" || return 1
  mkdir -p "${CACHE_PROFILE_DIR}" || return 1
  temporary="${PORT_STATE_FILE}.tmp.$$"
  printf '%s\n' "${value}" > "${temporary}" || return 1
  mv "${temporary}" "${PORT_STATE_FILE}"
}

# pick_free_port [preferred] → echo a TCP port nothing is listening on. The remembered origin is
# tried first, then 5151 and a spread of candidates so concurrent runs don't collide. Bash 3.2-safe.
pick_free_port() {
  local preferred="${1:-}" cand offset
  if valid_port "${preferred}" && ! port_in_use "${preferred}"; then
    echo "${preferred}"
    return 0
  fi
  offset=$(( ( $$ + ${RANDOM:-0} ) % 4000 ))
  # Candidate list: the app's 5151 default, then a deterministic-ish spread in the 49152–65535 ephemeral
  # range so we avoid well-known ports and reduce collision odds across parallel launchers.
  for cand in 5151 5152 5153 $((49152 + offset)) $((50000 + offset)) $((51000 + offset)) $((52000 + offset)) $((53000 + offset)) $((54000 + offset)) $((55000 + offset)); do
    [[ "${cand}" == "${preferred}" ]] && continue
    if ! port_in_use "${cand}"; then echo "${cand}"; return 0; fi
  done
  return 1
}

# ── select the static-server port (only relevant when we actually serve) ─────────────────────────
if [[ "${NO_SERVE}" -ne 1 ]]; then
  REMEMBERED_PORT="$(read_remembered_port)"
  if [[ "${PORT_EXPLICIT}" -eq 1 ]]; then
    if ! valid_port "${PORT}"; then
      echo "[run] --port must be an integer from 1 to 65535." >&2
      exit 2
    fi
    # User pinned a port. NEVER reuse a foreign server already on it — abort with guidance instead.
    if port_in_use "${PORT}"; then
      echo "[run] port ${PORT} is already in use$( [[ -n "$(pids_on_port "${PORT}")" ]] && echo " (pid(s): $(pids_on_port "${PORT}"))" )." >&2
      echo "[run] refusing to reuse a server we did not start. Free it (e.g. kill the pid above), or omit --port to auto-pick a free one." >&2
      exit 1
    fi
    remember_origin_port "${PORT}" || echo "[run] warning: could not remember cache-origin port ${PORT}." >&2
  else
    # Prefer the previous origin so persistent IndexedDB remains addressable without reusing a
    # foreign listener. If it is occupied, use a temporary origin but retain the remembered one.
    PORT="$(pick_free_port "${REMEMBERED_PORT}")" || { echo "[run] could not find a free port to serve on." >&2; exit 1; }
    if [[ -n "${REMEMBERED_PORT}" && "${PORT}" == "${REMEMBERED_PORT}" ]]; then
      echo "[run] reusing cache-origin port :${PORT}"
    elif [[ -n "${REMEMBERED_PORT}" ]]; then
      echo "[run] cache-origin port :${REMEMBERED_PORT} is busy; using temporary origin :${PORT}. Its IndexedDB cache is separate." >&2
    else
      echo "[run] selected and remembered cache-origin port :${PORT}"
      remember_origin_port "${PORT}" || echo "[run] warning: could not remember cache-origin port ${PORT}." >&2
    fi
  fi
fi

# Default port for the --no-serve display case (server is foreign / already up).
if [[ -z "${PORT}" ]]; then PORT="5151"; fi
if [[ -z "${BASE_URL}" ]]; then BASE_URL="http://127.0.0.1:${PORT}"; fi

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

# is_descendant <pid> <ancestor> → 0 if <pid> is <ancestor> or any process up its parent chain is
# <ancestor>. Used to confirm the process listening on our port really is the serve.sh we launched
# (vite runs as a CHILD of the serve.sh wrapper, so the listener is a descendant of SERVER_PID).
is_descendant() {
  local pid="$1" ancestor="$2" ppid guard=0
  while [[ -n "${pid}" && "${pid}" != "0" && "${pid}" != "1" ]]; do
    [[ "${pid}" == "${ancestor}" ]] && return 0
    ppid="$(ps -o ppid= -p "${pid}" 2>/dev/null | tr -d ' ')"
    [[ -z "${ppid}" || "${ppid}" == "${pid}" ]] && break
    pid="${ppid}"
    guard=$((guard + 1)); [[ "${guard}" -gt 50 ]] && break
  done
  return 1
}

# server_is_ours → 0 if the listener on $PORT is SERVER_PID or a descendant of it. If lsof is not
# available we can't inspect ownership, so we return 0 (don't block) and rely on the readiness probe.
server_is_ours() {
  local owners owner
  owners="$(pids_on_port "${PORT}")"
  [[ -z "${owners}" ]] && return 1                 # nothing listening yet → not ready
  if ! command -v lsof >/dev/null 2>&1; then return 0; fi
  for owner in ${owners}; do
    is_descendant "${owner}" "${SERVER_PID}" && return 0
  done
  return 1
}

if [[ "${NO_SERVE}" -ne 1 ]]; then
  echo "[run] starting static server on :${PORT}"
  bash "${SCRIPT_DIR}/serve.sh" --port "${PORT}" >/tmp/media-suite-serve.log 2>&1 &
  SERVER_PID=$!

  # Wait until OUR server answers (up to ~30s). Readiness = two conditions both true:
  #   (1) the process listening on :PORT is SERVER_PID or a descendant (we picked a free port, so
  #       this should hold — but it guards against a race where something else grabbed it), AND
  #   (2) it serves a real suite response. We probe /fixtures/manifest.json: it is served by the
  #       suite's own vite fixtures middleware with Cache-Control: no-store, so a successful 200
  #       confirms THIS run's server (not a stale build cache or a foreign static server lacking
  #       the fixtures tree). We also confirm index.html resolves.
  echo "[run] waiting for ${BASE_URL} (own server on :${PORT}) …"
  ready=0
  for _ in $(seq 1 60); do
    # If our server died, surface its log immediately.
    if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
      echo "[run] server exited early; log:" >&2; cat /tmp/media-suite-serve.log >&2; exit 1
    fi
    if server_is_ours \
        && curl -fsS "${BASE_URL}/fixtures/manifest.json" >/dev/null 2>&1 \
        && curl -fsS "${BASE_URL}/index.html" >/dev/null 2>&1; then
      ready=1; break
    fi
    sleep 0.5
  done
  if [[ "${ready}" -ne 1 ]]; then
    # Distinguish "a foreign server stole the port" from "our server never came up".
    if ! server_is_ours && curl -fsS "${BASE_URL}/index.html" >/dev/null 2>&1; then
      echo "[run] a server we did NOT start is answering on :${PORT} (pid(s): $(pids_on_port "${PORT}")); refusing to use it." >&2
    else
      echo "[run] server did not become ready; log:" >&2; cat /tmp/media-suite-serve.log >&2
    fi
    exit 1
  fi
  echo "[run] server ready (verified own instance on :${PORT})."
fi

# ── launch each browser through the Playwright driver ────────────────────────────────────────
mkdir -p results/raw

LAUNCH_COMMON=(--base-url "${BASE_URL}" --pillar "${PILLAR}" --out "results/raw" --timeout-ms "${TIMEOUT_MS}")
[[ "${NO_REUSE}" -eq 1 ]] && LAUNCH_COMMON+=(--no-reuse)
[[ "${EXHAUSTIVE}" -eq 1 ]] && LAUNCH_COMMON+=(--exhaustive)
[[ -n "${WARMUP}" ]] && LAUNCH_COMMON+=(--warmup "${WARMUP}")
[[ -n "${ITERS}" ]] && LAUNCH_COMMON+=(--iters "${ITERS}")
# bash 3.2 + set -u: expanding an EMPTY array as "${arr[@]}" raises 'unbound variable', so guard on
# length first (${#arr[@]} is always safe). Empty ENGINES/SCENARIOS ⇒ run all (no filter forwarded).
if [[ ${#ENGINES[@]} -gt 0 ]]; then for e in "${ENGINES[@]}"; do LAUNCH_COMMON+=(--engine "${e}"); done; fi
if [[ ${#FEATURES[@]} -gt 0 ]]; then for f in "${FEATURES[@]}"; do LAUNCH_COMMON+=(--feature "${f}"); done; fi
if [[ ${#OPERATIONS[@]} -gt 0 ]]; then for o in "${OPERATIONS[@]}"; do LAUNCH_COMMON+=(--operation "${o}"); done; fi
if [[ ${#SCENARIOS[@]} -gt 0 ]]; then for s in "${SCENARIOS[@]}"; do LAUNCH_COMMON+=(--scenario "${s}"); done; fi

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
