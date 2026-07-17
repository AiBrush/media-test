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

# Execute under the committed reproducibility perimeter. The bake records both these actual values
# and the declared lock in provenance; exporting here ensures the normal entry point really uses the
# declared clock/locale/timezone instead of merely describing them after the fact.
while IFS='=' read -r name value; do
  case "${name}" in
    SOURCE_DATE_EPOCH|LANG|LC_ALL|TZ) export "${name}=${value}" ;;
    *) echo "error: unexpected toolchain perimeter key '${name}'" >&2; exit 2 ;;
  esac
done < <(
  bun -e '
    const lock = await Bun.file("fixtures/toolchain.lock.json").json();
    if (!Number.isSafeInteger(lock.sourceDateEpoch) || lock.sourceDateEpoch < 0 ||
        typeof lock.locale !== "string" || !lock.locale ||
        typeof lock.timezone !== "string" || !lock.timezone) {
      throw new Error("fixtures/toolchain.lock.json has an invalid pinned environment");
    }
    console.log(`SOURCE_DATE_EPOCH=${lock.sourceDateEpoch}`);
    console.log(`LANG=${lock.locale}`);
    console.log(`LC_ALL=${lock.locale}`);
    console.log(`TZ=${lock.timezone}`);
  '
)

for required in SOURCE_DATE_EPOCH LANG LC_ALL TZ; do
  if [[ -z "${!required:-}" ]]; then
    echo "error: pinned environment '${required}' was not exported" >&2
    exit 2
  fi
done

echo "→ baking fixtures via fixtures/bake.mjs $*"
exec bun fixtures/bake.mjs "$@"
