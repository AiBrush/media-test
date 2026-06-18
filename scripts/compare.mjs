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
const opts = {
  rawDir: 'results/raw',
  out: 'results/report.md',
  reference: null,
  bundleSizes: 'results/bundle-sizes.json',
};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--raw-dir') opts.rawDir = argv[++i];
  else if (a === '--out') opts.out = argv[++i];
  else if (a === '--reference') opts.reference = argv[++i];
  else if (a === '--bundle-sizes') opts.bundleSizes = argv[++i];
  else if (a === '-h' || a === '--help') {
    console.log(
      'bun scripts/compare.mjs [--raw-dir results/raw] [--out results/report.md] [--reference <id>] [--bundle-sizes results/bundle-sizes.json]',
    );
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

// ── inject offline per-engine bundle sizes into the bundle-size case ──────────────────────────
// The `performance/bundle-size` case is a build-time metric: there is nothing to measure at run time,
// so the runner emits its `bench.bundleSize` with n=0/median=0 (an honest empty bench, which is why
// the headline shows a 5-way tie at 0 kB). The real per-engine sizes are produced OFFLINE by
// scripts/measure-bundles.mjs → results/bundle-sizes.json ({engineId: kB}). Here — after loading the
// raw results and BEFORE buildReport — we read that map and inject each engine's kB into its
// bundle-size ScenarioResult as a real `bundleSize` BenchSummary (median = kB). report.ts then ranks
// the bundle-size winner (lower kB = better) and fills the leaderboard's Bundle column from
// bench.bundleSize.median exactly like any other metric. No runtime/browser change is involved; if the
// map is absent the results pass through untouched (the honest 0/NA stays).
const BUNDLE_SCENARIO_ID = 'performance/bundle-size';
const bundleInjected = injectBundleSizes(allResults, resolve(ROOT, opts.bundleSizes));

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
    `${json.scenarios.length} scenarios · ref=${referenceEngineId}` +
    (bundleInjected > 0 ? ` · bundle-sizes injected into ${bundleInjected} cell(s)` : ''),
);

// ── bundle-size injection helpers ─────────────────────────────────────────────────────────────

/**
 * Read results/bundle-sizes.json (if present) and inject each engine's kB into its bundle-size
 * ScenarioResult as a real `bundleSize` BenchSummary (median = kB). Only PASS cells are touched — the
 * correctness gate (§0.1) still governs the case, so a FAIL/ERROR/NA cell never gets a fabricated
 * number (it stays an honest no-number/NA in the report). Returns how many cells were injected.
 *
 * @param {import('../src/core/scenario.ts').ScenarioResult[]} results
 * @param {string} mapPath absolute path to results/bundle-sizes.json
 * @returns {number}
 */
function injectBundleSizes(results, mapPath) {
  if (!existsSync(mapPath)) {
    console.error(
      `[compare] no bundle-sizes map at ${mapPath.replace(ROOT + '/', '')} — bundle-size stays 0/NA. ` +
        `Run: bun scripts/measure-bundles.mjs`,
    );
    return 0;
  }
  /** @type {Record<string, number>} */
  let sizes;
  try {
    sizes = JSON.parse(readFileSync(mapPath, 'utf8'));
  } catch (e) {
    console.error(`[compare] unreadable bundle-sizes map ${mapPath}: ${e?.message || e} — skipping injection.`);
    return 0;
  }

  let injected = 0;
  const missing = new Set();
  for (const r of results) {
    if (r.scenarioId !== BUNDLE_SCENARIO_ID) continue;
    // Correctness gate: only an engine whose probe oracle PASSed is eligible to carry a bench/win.
    if (r.status !== 'PASS') continue;
    const kb = lookupBundleKb(sizes, r.engineId);
    if (kb === undefined) {
      missing.add(r.engineId);
      continue;
    }
    // Overwrite the runner's empty (n=0/median=0) bench with the real offline number. Shape matches
    // BenchSummary (src/core/scenario.ts); report.ts reads bench.bundleSize.median.
    r.bench = r.bench ?? {};
    r.bench.bundleSize = {
      n: 1,
      warmup: 0,
      metric: 'bundleSize',
      median: kb,
      p95: kb,
      mad: 0,
      unit: 'kB',
      samples: [kb],
    };
    // Keep the result's declared ranking metric consistent (report.ts also infers it, but be explicit).
    if (!r.primaryMetric) r.primaryMetric = 'bundleSize';
    injected++;
  }

  if (missing.size > 0) {
    console.error(
      `[compare] bundle-sizes map has no entry for PASSing engine(s): ${[...missing].join(', ')} ` +
        `— those cells stay 0/NA (honest). Add them to scripts/measure-bundles.mjs.`,
    );
  }
  console.log(
    `[compare] injected bundle sizes from ${mapPath.replace(ROOT + '/', '')} into ${injected} ` +
      `'${BUNDLE_SCENARIO_ID}' cell(s).`,
  );
  return injected;
}

/**
 * Look up an engine's bundle kB in the offline map. Tries the exact engine id, then the bare registry
 * id (everything before '@'), then — for the navigator-derived `platform@<family>-<major>` ids whose
 * exact suffix is only known at run time — a `platform@`-prefix fallback to any platform key in the
 * map (they all carry the same 0 kB shipped-library cost). Returns undefined when nothing matches.
 *
 * @param {Record<string, number>} sizes
 * @param {string} engineId
 * @returns {number | undefined}
 */
function lookupBundleKb(sizes, engineId) {
  const direct = sizes[engineId];
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct;

  const bare = engineId.includes('@') ? engineId.slice(0, engineId.indexOf('@')) : engineId;
  const byBare = sizes[bare];
  if (typeof byBare === 'number' && Number.isFinite(byBare)) return byBare;

  // platform@<family>-<major> variant not explicitly listed: fall back to any 'platform@*' / 'platform'
  // key (all 0 kB — the platform engine ships no third-party library on any browser).
  if (bare === 'platform') {
    for (const [k, v] of Object.entries(sizes)) {
      if ((k === 'platform' || k.startsWith('platform@')) && typeof v === 'number' && Number.isFinite(v)) {
        return v;
      }
    }
  }
  return undefined;
}
