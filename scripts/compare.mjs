/** Validate raw runs, execute the shared reporting pipeline, and write its two deterministic views. */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applyBundleArtifactToResults,
  buildReport,
  normalizeExpectedMatrix,
  parseBundleMeasurementsArtifact,
  parseRawRunArtifact,
  serializeReportJson,
} from '../src/core/report.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const opts = {
  rawDir: 'results/raw',
  out: 'results/report.md',
  bundleMeasurements: 'results/bundle-measurements.json',
  latest: false,
  generatedAtIso: undefined,
};

const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index++) {
  const arg = argv[index];
  if (arg === '--raw-dir') opts.rawDir = requiredArg(argv, ++index, arg);
  else if (arg === '--out') opts.out = requiredArg(argv, ++index, arg);
  else if (arg === '--bundle-measurements' || arg === '--bundle-sizes') {
    opts.bundleMeasurements = requiredArg(argv, ++index, arg);
  } else if (arg === '--latest') opts.latest = true;
  else if (arg === '--generated-at') opts.generatedAtIso = requiredArg(argv, ++index, arg);
  else if (arg === '--reference') {
    const ignored = requiredArg(argv, ++index, arg);
    console.error(`[compare] --reference '${ignored}' ignored: oracle evidence has no live reference engine.`);
  } else if (arg === '-h' || arg === '--help') {
    console.log(
      'bun scripts/compare.mjs [--raw-dir results/raw] [--out results/report.md] '
      + '[--bundle-measurements results/bundle-measurements.json] [--latest] [--generated-at ISO]',
    );
    process.exit(0);
  } else {
    console.error(`compare.mjs: unknown arg '${arg}'`);
    process.exit(2);
  }
}

const rawDir = resolve(ROOT, opts.rawDir);
if (!existsSync(rawDir)) fail(`raw results dir not found: ${rawDir}`);
const files = readdirSync(rawDir).filter((file) => file.endsWith('.json')).sort().map((file) => join(rawDir, file));
if (files.length === 0) fail(`no *.json in ${rawDir}`);

const runs = [];
const quarantined = [];
for (const file of files) {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    const run = parseRawRunArtifact(value);
    runs.push(run);
    console.log(`[compare] validated ${run.results.length} observations from ${relative(file)}`);
  } catch (error) {
    quarantined.push({ file: relative(file), reason: error instanceof Error ? error.message : String(error) });
    console.error(`[compare] quarantined ${relative(file)}: ${quarantined.at(-1).reason}`);
  }
}
if (runs.length === 0) fail('no validated raw-run artifacts remain after quarantine');

let results = runs.flatMap((run) => run.results);
const context = new WeakMap();
for (const run of runs) {
  for (const result of run.results) {
    const resultReporting = isRecord(result.reporting) ? result.reporting : undefined;
    context.set(result, {
      runId: run.runId,
      observedAtIso: run.generatedAtIso,
      ...(isRecord(resultReporting?.cohortDimensions)
        ? { cohortDimensions: resultReporting.cohortDimensions }
        : {}),
    });
  }
}

let bundleArtifact;
let bundleJoins;
const bundlePath = resolve(ROOT, opts.bundleMeasurements);
if (existsSync(bundlePath)) {
  try {
    bundleArtifact = parseBundleMeasurementsArtifact(JSON.parse(readFileSync(bundlePath, 'utf8')));
    const applied = applyBundleArtifactToResults(results, bundleArtifact, (result) => {
      const reporting = isRecord(result.reporting) ? result.reporting : undefined;
      return isRecord(reporting?.bundleExpectation) ? reporting.bundleExpectation : undefined;
    });
    results = applied.results;
    bundleJoins = applied.joins;
    // Clones created by bundle joining retain the original per-result run context by stable cell identity.
    const byCell = new Map(runs.flatMap((run) => run.results.map((result) => [cellKey(result), context.get(result)])));
    for (const result of results) {
      const previous = byCell.get(cellKey(result));
      if (previous) context.set(result, previous);
    }
    console.log(`[compare] validated bundle artifact ${bundleArtifact.contentHash}`);
  } catch (error) {
    quarantined.push({ file: relative(bundlePath), reason: error instanceof Error ? error.message : String(error) });
    console.error(`[compare] quarantined ${relative(bundlePath)}: ${quarantined.at(-1).reason}`);
    bundleArtifact = undefined;
  }
}

const expected = mergeExpected(runs.map((run) => run.expected).filter(Boolean));
const report = buildReport({
  results,
  suiteVersion: singleSuiteVersion(runs),
  ...(opts.generatedAtIso ? { generatedAtIso: opts.generatedAtIso } : {}),
  ...(expected ? { expected } : {}),
  contextForResult: (result) => context.get(result),
  dedupePolicy: opts.latest ? 'latest' : 'strict',
  ...(bundleArtifact ? { bundleArtifact, bundleJoins } : {}),
});

const outMd = resolve(ROOT, opts.out);
const outJson = outMd.replace(/\.md$/i, '.json');
mkdirSync(dirname(outMd), { recursive: true });
writeFileSync(outMd, report.markdown.endsWith('\n') ? report.markdown : `${report.markdown}\n`);
writeFileSync(outJson, serializeReportJson(report.json));

console.log(
  `[compare] wrote ${relative(outMd)} + ${relative(outJson)} · ${report.json.observations.length} normalized observations `
  + `· ${report.json.cohorts.length} cohorts · ${report.json.deduplication.discarded.length} discarded`
  + (quarantined.length > 0 ? ` · ${quarantined.length} quarantined` : ''),
);

function mergeExpected(values) {
  if (values.length === 0) return undefined;
  const cells = new Map();
  for (const value of values) {
    for (const cell of normalizeExpectedMatrix(value).cells) {
      const key = `${cell.engineId}\0${cell.browser}\0${cell.scenarioId}`;
      const previous = cells.get(key);
      if (previous && JSON.stringify(previous) !== JSON.stringify(cell)) {
        throw new Error(`[EXPECTED_CELL_CONFLICT] ${key}`);
      }
      cells.set(key, cell);
    }
  }
  return normalizeExpectedMatrix({ definitionId: 'merged-validated-raw-runs', cells: [...cells.values()] });
}

function singleSuiteVersion(runs) {
  const versions = [...new Set(runs.map((run) => run.suiteVersion))].sort();
  return versions.length === 1 ? versions[0] : `mixed:${versions.join(',')}`;
}

function cellKey(result) {
  return `${result.engineId}\0${result.browser}\0${result.scenarioId}`;
}

function requiredArg(values, index, flag) {
  const value = values[index];
  if (!value) fail(`${flag} requires a value`, 2);
  return value;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function relative(path) {
  return path.startsWith(`${ROOT}/`) ? path.slice(ROOT.length + 1) : path;
}

function fail(message, code = 1) {
  console.error(`compare.mjs: ${message}`);
  process.exit(code);
}
