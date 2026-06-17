#!/usr/bin/env bash
# scripts/add-engine.sh <id> — scaffold a new engine adapter from src/engines/_template/adapter.ts
# (§6: "Add a library: scripts/add-engine.sh <id> → implement interface + capabilities() → register").
#
# Copies the template to src/engines/<id>/adapter.ts, rewrites the placeholder identifiers
# (TemplateEngine → <Pascal>Engine, template@0.0.0 → <id>@0.0.0, registerTemplate → register<Pascal>),
# uncomments the registration block, and prints the remaining manual steps. It does NOT touch the
# registry wiring or run any binary — it only stamps a file.
#
#   add-engine.sh mylib            # → src/engines/mylib/adapter.ts, exports registerMylib()
#   add-engine.sh mylib --force    # overwrite an existing adapter
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

FORCE=0
ID=""
for a in "$@"; do
  case "$a" in
    --force) FORCE=1 ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --*) echo "add-engine.sh: unknown flag '$a'" >&2; exit 2 ;;
    *) ID="$a" ;;
  esac
done

if [[ -z "${ID}" ]]; then
  echo "usage: scripts/add-engine.sh <id> [--force]" >&2
  echo "  <id> must be a directory-safe slug, e.g. 'mylib' or 'mylib-fork'." >&2
  exit 2
fi

# Validate the id: lowercase letters, digits, dash, dot, underscore (so 'mylib-fork' / 'av.js' ok).
if [[ ! "${ID}" =~ ^[a-z0-9][a-z0-9._-]*$ ]]; then
  echo "error: invalid id '${ID}'. Use lowercase [a-z0-9._-], starting alphanumeric." >&2
  exit 2
fi

TEMPLATE="src/engines/_template/adapter.ts"
DEST_DIR="src/engines/${ID}"
DEST="${DEST_DIR}/adapter.ts"

if [[ ! -f "${TEMPLATE}" ]]; then
  echo "error: template not found at ${TEMPLATE}" >&2
  exit 1
fi
if [[ -e "${DEST}" && "${FORCE}" -ne 1 ]]; then
  echo "error: ${DEST} already exists (use --force to overwrite)." >&2
  exit 1
fi

# Pascal-case the id for type/function names: strip non-alnum to word boundaries, capitalize each.
#   mylib       -> Mylib
#   mylib-fork  -> MylibFork
#   av.js       -> AvJs
PASCAL="$(printf '%s' "${ID}" | awk '
  { n=split($0, a, /[^A-Za-z0-9]+/); out="";
    for (i=1;i<=n;i++){ s=a[i]; if (length(s)>0){ out=out toupper(substr(s,1,1)) substr(s,2) } }
    print out }')"
if [[ -z "${PASCAL}" ]]; then PASCAL="Engine"; fi

mkdir -p "${DEST_DIR}"

# Stamp the template:
#   - class TemplateEngine          -> class <Pascal>Engine
#   - ENGINE_ID 'template@0.0.0'    -> '<id>@0.0.0'
#   - registerTemplate              -> register<Pascal>
#   - uncomment the `export function registerTemplate()` block + the `registerEngine(...)` line
#   - drop the `void registerEngine;` unused-import guard (no longer needed once wired)
sed \
  -e "s/TemplateEngine/${PASCAL}Engine/g" \
  -e "s/template@0\.0\.0/${ID}@0.0.0/g" \
  -e "s/registerTemplate/register${PASCAL}/g" \
  -e "s|^// export function register${PASCAL}|export function register${PASCAL}|" \
  -e "s|^//   registerEngine(ENGINE_ID|  registerEngine(ENGINE_ID|" \
  -e "s|^// }|}|" \
  -e "/^void registerEngine;$/d" \
  "${TEMPLATE}" > "${DEST}"

echo "✓ created ${DEST}"
echo ""
echo "Next steps:"
echo "  1. Set ENGINE_ID to a stable VERSIONED id (currently '${ID}@0.0.0') in ${DEST}."
echo "  2. Implement init()/dispose() + only the operations your library performs;"
echo "     declare exactly those in capabilities() with canonical tokens (engine.ts CANONICAL_*)."
echo "  3. Wire the engine into the app: add a wiring entry in src/app/register.ts importing"
echo "     '../engines/${ID}/adapter.ts' and calling register${PASCAL}()."
echo "  4. Serve + run:  bash scripts/serve.sh   then   bash scripts/run.sh --engine ${ID}@<version>"
echo "  5. Compare:      bash scripts/compare.sh   → results/report.md (Δ vs the reference engine)."
echo ""
echo "Honesty rule: declare ONLY what you implement. Undeclared ops record NA(engine); a declared-but-"
echo "wrong op records a CONFORMANCE FAILURE (BUILD_INSTRUCTIONS §15)."
