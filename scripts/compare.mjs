/**
 * scripts/compare.mjs — assemble the comparison report (§12). Reads every results/raw/*.json the
 * launcher (or the in-page Download button) produced, flattens their `results[]` into one stream,
 * and calls `buildReport` (src/core/report.ts — pure TS, runs under bun) to produce
 * results/report.md + results/report.json. NO BINARY, NO MEASUREMENT — pure assembly of already-
 * measured, oracle-gated results.
 *
 * Run with bun (which executes TypeScript directly, so the .ts import of report.ts resolves):
 *   bun scripts/compare.mjs [--raw-dir results/raw] [--out results/report.md] [--reference <id>]
 *
 * The reference engine defaults to the one recorded in the raw files (the page exposes
 * referenceEngineId); --reference overrides it. Later runs supersede earlier ones for the same
 * (engine, browser, scenario) triple (report.ts does last-write-wins on that key).
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildReport } from '../src/core/report.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── args ───────────────────────────────────────────────────────────────────────────────────────
const opts = { rawDir: 'results/raw', out: 'results/report.md', reference: null };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--raw-dir') opts.rawDir = argv[++i];
  else if (a === '--out') opts.out = argv[++i];
  else if (a === '--reference') opts.reference = argv[++i];
  else if (a === '-h' || a === '--help') {
    console.log('bun scripts/compare.mjs [--raw-dir results/raw] [--out results/report.md] [--reference <id>]');
    process.exit(0);
  } else {
    console.error(`compare.mjs: unknown arg '${a}'`);
    process.exit(2);
  }
}

const rawDir = resolve(ROOT, opts.rawDir);
if (!existsSync(rawDir)) {
  console.error(`compare.mjs: raw results dir not found: ${rawDir}\nRun scripts/run.sh first (or use the in-page Download button into results/raw/).`);
  process.exit(1);
}

// ── load + flatten raw result files ──────────────────────────────────────────────────────────
const files = readdirSync(rawDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => join(rawDir, f))
  .sort(); // stable order → deterministic last-write-wins when triples collide

if (files.length === 0) {
  console.error(`compare.mjs: no *.json in ${rawDir}. Nothing to compare.`);
  process.exit(1);
}

/** @type {import('../src/core/scenario.ts').ScenarioResult[]} */
const allResults = [];
let referenceFromData = null;
let suiteVersion;

for (const file of files) {
  let payload;
  try {
    payload = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`compare.mjs: skipping unreadable ${file}: ${e?.message || e}`);
    continue;
  }
  const results = Array.isArray(payload.results) ? payload.results : Array.isArray(payload) ? payload : [];
  if (results.length === 0) {
    console.error(`compare.mjs: ${file} has no results[] — skipping.`);
    continue;
  }
  allResults.push(...results);
  if (!referenceFromData && payload.referenceEngineId) referenceFromData = payload.referenceEngineId;
  for (const r of results) {
    if (!suiteVersion && r.env?.suiteVersion) suiteVersion = r.env.suiteVersion;
  }
  console.log(`[compare] loaded ${results.length} results from ${file}`);
}

if (allResults.length === 0) {
  console.error('compare.mjs: no results loaded from any file.');
  process.exit(1);
}

const referenceEngineId = opts.reference ?? referenceFromData ?? 'mediabunny';

// ── build the report ───────────────────────────────────────────────────────────────────────
const { markdown, json } = buildReport({
  results: allResults,
  referenceEngineId,
  ...(suiteVersion ? { suiteVersion } : {}),
});

const outMd = resolve(ROOT, opts.out);
mkdirSync(dirname(outMd), { recursive: true });
writeFileSync(outMd, markdown.endsWith('\n') ? markdown : markdown + '\n');

// Emit the machine-readable JSON alongside the markdown (§12: "Emit machine-readable results/raw/*.json").
const outJson = outMd.replace(/\.md$/, '.json');
writeFileSync(outJson, JSON.stringify(json, null, 2) + '\n');

console.log(
  `[compare] wrote ${opts.out} + ${outJson.replace(ROOT + '/', '')} ` +
    `· ${allResults.length} results · ${json.engines.length} engines · ${json.browsers.length} browsers · ` +
    `${json.scenarios.length} scenarios · ref=${referenceEngineId}`,
);
