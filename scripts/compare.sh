#!/usr/bin/env bash
# scripts/compare.sh — regenerate the comparison report (§12) from results/raw/*.json. Delegates to
# scripts/compare.mjs, which imports buildReport from src/core/report.ts (pure TS). We run it with
# `bun` because bun executes TypeScript directly, so the .ts import resolves without a build step
# (npm/npx are unavailable — §1). NO BINARY, NO MEASUREMENT: pure assembly of already-gated results.
#
#   compare.sh                          # results/raw/*.json → results/report.md (+ results/report.json)
#   compare.sh --reference mediabunny   # override the Δ baseline
#   compare.sh --raw-dir results/raw --out results/report.md
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

if ! command -v bun >/dev/null 2>&1; then
  echo "error: 'bun' is required (it runs the TypeScript report.ts import directly). npm/npx are unavailable here." >&2
  exit 2
fi

echo "→ building report from results/raw/ via scripts/compare.mjs"
exec bun scripts/compare.mjs "$@"
