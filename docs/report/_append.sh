#!/usr/bin/env bash
# Append a family's workflow rows to the master table, with contiguous numbering.
# Usage: _append.sh <task-output.json> [--dry]
# Reads .result[] (schema rows), cleans cells (single-line, '|' escaped), links detail file.
set -euo pipefail
OUT="$1"
DRY="${2:-}"
MASTER="results/report/best-framework-by-feature.md"
OFFSET=$(grep -cE '^\| [0-9]+ \|' "$MASTER" || true)

ROWS=$(jq -r --argjson off "$OFFSET" '
  def clean: gsub("\r";" ")|gsub("\n";" ")|gsub("</?(whyShort|othersShort|validationNote|invoke|parameter|antml:[a-zA-Z:]+|StructuredOutput)[^>]*>";"")|gsub("&lt;/?(whyShort|othersShort|validationNote|invoke|parameter|antml:[a-zA-Z:]+|StructuredOutput)[^&]*&gt;";"")|gsub("\\\\\\|";"|")|gsub("\\|";"\\|")|gsub(" ";" ")|gsub(" {2,}";" ")|gsub("^ +| +$";"");
  .result
  | to_entries[]
  | ($off + .key + 1) as $n
  | .value as $r
  | ($r.detailPath | sub("^results/report/";"")) as $rel
  | "| \($n) | \($r.scenarioId|clean) | \($r.family|clean) | \($r.bestFramework|clean) | \($r.whyShort|clean) | \($r.othersShort|clean) | \($r.validationVerdict)\(if $r.cachedWinner then " (cached)" else "" end) — \($r.validationNote|clean) | [detail](\($rel)) |"
' "$OUT")

if [ "$DRY" = "--dry" ]; then
  printf '%s\n' "$ROWS"
  exit 0
fi

printf '%s\n' "$ROWS" >> "$MASTER"

# Also append normalized structured rows to the durable consolidated ndjson (for leaderboard).
NORM='def norm(e): if (e|test("@")) then e elif e=="mediabunny" then "mediabunny@1.48.0" elif e=="platform" then "platform@chrome-149" elif (e=="ffmpeg.wasm" or e=="ffmpeg-wasm") then "ffmpeg.wasm@0.12.15" elif e=="mp4box" then "mp4box@2.3.0" elif e=="remotion-media-parser" then "remotion-media-parser@4.0.479" elif e=="web-demuxer" then "web-demuxer@4.0.0" elif e=="remotion-webcodecs" then "remotion-webcodecs@4.0.479" else e end;'
jq -c "$NORM"' .result[] | .bestFramework = norm(.bestFramework)' "$OUT" >> results/report/_rows.ndjson

NEWCOUNT=$(grep -cE '^\| [0-9]+ \|' "$MASTER" || true)
sed -i '' -E "s#^Status: [0-9]+ / 558 features analyzed\.#Status: ${NEWCOUNT} / 558 features analyzed.#" "$MASTER"
echo "appended $(printf '%s\n' "$ROWS" | grep -c '^|') rows; table now has ${NEWCOUNT} / 558 data rows"
