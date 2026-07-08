/**
 * src/core/report.ts — THE DELIVERABLE (§12): the cross-engine comparison BENCHMARK report.
 *
 * Pure assembly: takes the flat list of ScenarioResult produced by the runner and folds it into the
 * comparison product — a leaderboard of numbers, per-case primary-metric tables, a conformance view,
 * and a per-engine scorecard — rendered as GitHub-flavored markdown AND emitted as a machine-readable
 * JSON object. No DOM, no Node-only API: this runs in a Worker, the page, or Node alike (it only builds
 * strings + plain objects). There is deliberately NO reference engine: oracles compare against pre-baked
 * golden data, never a live candidate, so the report has no "vs reference" concept at all.
 *
 * Three laws are baked into the structure (§0, §8, §9, §13, §15):
 *   1. The comparison is the product, and every number is read "within the SAME browser, on the same
 *      corpus." Numbers are NEVER compared across browsers — the entire report is grouped by browser
 *      and comparisons are only ever made within a browser group.
 *   2. A benchmark is admissible only behind a green conformance gate; a perf number with no PASS is
 *      not reported (§0.1). A FAIL (wrong output) is shown as FAIL, never as a benchmark number.
 *   3. THE NUMBERS ARE THE PRODUCT (§8, §9): the markdown leads with the primary-metric value (with
 *      unit) for each engine × case that PASSed, "N/A" where the framework genuinely cannot run the
 *      case, and FAIL where the output was wrong. The conformance LETTER is secondary.
 *
 * NA distinction — model vs presentation: the data model and `report.json` KEEP NA_ENGINE,
 * NA_BROWSER, and NA_ASSET DISTINCT (spec §0.6/§10/§14 forbid collapsing them in the
 * machine-readable twin, and `ResultStatus` carries all three). The USER DIRECTIVE overrides only the *markdown
 * presentation*: `report.md` renders BOTH as a single user-facing "N/A" (the `-ᵇ` browser-specific
 * marker is gone) because the reader does not care about browser-specific gaps. JSON consumers are
 * unaffected; only the human-facing rendering collapses. See `naLabelMd` / `statusLabelMd`.
 */

import type {
  MetricId,
  ResultSelection,
  ResultStatus,
  ScenarioResult,
} from './scenario.ts';
import type { BrowserName } from './engine.ts';
import { metricHigherIsBetter, metricUnit } from './bench.ts';
import { visibleResult } from './format.ts';

export interface ReportInput {
  results: ScenarioResult[];
  suiteVersion?: string;
  generatedAtIso?: string;
}

export interface ReportOutput {
  markdown: string;
  json: ReportJson;
}

// ── machine-readable shape ───────────────────────────────────────────────────────────────────

export interface ConformanceCell {
  status: ResultStatus | null; // null = not run (—)
  reason?: string;
  durationMs?: number;
  /**
   * Per-scenario file-rotation provenance (§10 reproducibility): the input file this cell was actually
   * run against, its sha256, whether it was the baked golden fixture (`isBaked:true`) or a rotated real
   * download (`isBaked:false`), and how many candidates were considered. Projected from
   * `ScenarioResult.selection` (runSeed dropped — it is a run-level scalar, not per-cell). PURELY
   * ADDITIVE: never read by `isAdmissible` or any PASS/admissible math. Absent on legacy results
   * (⇒ treat as baked/unknown).
   */
  selection?: { file: string; sha256?: string; isBaked: boolean; candidateCount?: number };
  /**
   * §6.2 exhaustive-mode per-file breakdown: each candidate file's individual verdict, so the aggregate
   * cell (PASS only if all pass; bench = median across files) is transparent and a FAIL traces to its
   * bytes. Present only in exhaustive runs. PURELY ADDITIVE — the aggregate `status` above is what scores.
   */
  exhaustive?: Array<{ file: string; isBaked: boolean; status: ResultStatus; sha256?: string }>;
}

export interface BenchCell {
  /** wall-clock median/p95 in ms, when measured. */
  wallMedianMs?: number;
  wallP95Ms?: number;
  /**
   * Exhaustive-mode (§6.2) TOTAL wall across the whole candidate file set (BenchSummary.wall.aggregate):
   * the cell's true end-to-end cost and the coverage-first tiebreak. Absent in single-file mode (there
   * `wallMedianMs` is the value). The display prefers this over the median (see format.pickExecutionMs).
   */
  wallAggregateMs?: number;
  throughputRealtime?: number; // ×-realtime, median
  peakMemoryBytes?: number; // median
  longtaskMs?: number; // median
  /**
   * Exhaustive-mode (§6.2) file coverage for this PASS cell: `passed` files out of `total` candidates
   * (projected from ScenarioResult.coverage). Drives the ` · <passed>/<total>` display suffix so a
   * partial-coverage PASS is visibly partial, and the coverage-FIRST winner ranking. Absent in
   * single-file mode.
   */
  coverage?: { passed: number; total: number };
  /**
   * THE headline number for this case (§8.1/§9): the case's primary ranking metric, its median value
   * for THIS engine, and the metric's unit — populated ONLY when the cell PASSed and actually measured
   * that metric. This is the number the benchmark-first markdown leads each per-case row with; it is
   * the SAME metric the per-case winner ranks by, so the table column is internally consistent. Absent
   * when the engine did not PASS or did not measure the case's primary metric.
   */
  primaryMetric?: MetricId;
  primaryValueMedian?: number;
  primaryUnit?: string;
}

export interface EngineScorecard {
  engineId: string;
  /** conformance % across all NON-NA (admissible) cells, all browsers. */
  conformancePct: number;
  conformancePassCount: number;
  conformanceAdmissibleCount: number;
  /** distinct scenario families this engine produced a PASS in (capability breadth). */
  capabilityBreadth: number;
  capabilityFamilies: string[];
  /** robustness pass rate over the 'robustness' family (graceful handling / no crash-hang-OOM). */
  robustnessRate: number | null;
  robustnessPassCount: number;
  robustnessTotal: number;
  // ── leaderboard fields (§9) ──
  /** cases this engine WON (sole winner or co-winner of a tie), summed over all browsers. */
  wins: number;
  winsByBrowser: Partial<Record<BrowserName, number>>;
  /** uncontested wins (the engine was the only eligible one) — split out so a default win is visible. */
  uncontestedWins: number;
  /**
   * Perf index vs the per-case WINNER: geomean of (this engine's value ÷ winner's value), normalized
   * so 1.00 = always the fastest. ≤1; null when no rankable co-eligible case exists in that browser.
   */
  perfIndexVsWinnerByBrowser: Partial<Record<BrowserName, number | null>>;
  /** bundle size kB (min+gzip), from the bundle-size case if present; null otherwise. */
  bundleSizeKb: number | null;
  /** one-line auto verdict (§10.2). */
  verdict: string;
}

/**
 * The per-case verdict (§9) — THE deliverable. For one scenario within one browser: the fastest
 * CORRECT engine, its value, and the margin over the runner-up.
 *   - `flag`: 'contested' (≥2 eligible, clear winner) · 'tie' (top engines within the noise band) ·
 *     'uncontested' (only one engine eligible) · 'none' (no engine eligible, or no rankable metric).
 *   - `coWinners`: engines tied with the winner inside the band (includes the winner). On a clear
 *     win it is just [winner]; on a tie it lists all co-winners; '[]' when there is no winner.
 */
export interface CaseWinner {
  scenarioId: string;
  family: string;
  /** the metric the ranking used; null when the case has no rankable measured metric. */
  primaryMetric: MetricId | null;
  winner: string | null;
  winnerValue: number | null;
  runnerUp: string | null;
  runnerUpValue: number | null;
  /** signed so POSITIVE == winner is better than runner-up, on the metric's natural direction. */
  marginPct: number | null;
  flag: 'contested' | 'tie' | 'uncontested' | 'none';
  /** engines whose correctness oracle passed (the only ones eligible to win). */
  eligible: string[];
  coWinners: string[];
}

export interface BrowserSection {
  browser: BrowserName;
  engines: string[];
  scenarios: string[];
  conformance: Record<string, Record<string, ConformanceCell>>; // [engineId][scenarioId]
  bench: Record<string, Record<string, BenchCell>>; // [engineId][scenarioId]
  conformancePctByEngine: Record<string, number>;
  /** per-case winner verdicts (§9), one per scenario, in scenario order. */
  winners: CaseWinner[];
}

/**
 * One cell reference for the file-rotation provenance sections (§12). Identifies which engine × browser
 * × scenario cell ran against which real file, with the sha256 for traceability and the result status +
 * reason so a finding is actionable. Only ever built for ROTATED REAL cells (selection.isBaked===false).
 */
export interface RotationCell {
  scenarioId: string;
  engineId: string;
  browser: BrowserName;
  family: string;
  file: string;
  sha256?: string;
  status: ResultStatus;
  reason?: string;
  candidateCount?: number;
}

/** Per-family rotation coverage (§12 DoD): which scenarios ran on a real file vs still baked-only. */
export interface RotationFamilyCoverage {
  family: string;
  /** distinct scenarioIds with ≥1 cell run on a rotated real file this run. */
  realScenarios: string[];
  /** distinct scenarioIds that ran this run but never on a real file (baked/legacy only). */
  bakedOnlyScenarios: string[];
  /** result cells run on a rotated real file (selection.isBaked === false) in this family. */
  realCellCount: number;
  /** result cells baked/legacy/unknown (the complement) in this family. */
  bakedCellCount: number;
}

/**
 * Per-scenario file-rotation provenance, coverage & findings (§10/§11/§12). PURELY ADDITIVE reporting:
 * nothing here feeds `isAdmissible` or any PASS/admissible score — it only surfaces WHICH real files were
 * exercised this run and what they revealed.
 */
export interface RotationReport {
  /**
   * Cells where a ROTATED REAL file yielded ZERO admissible signal — every oracle was golden-keyed so
   * the whole cell resolved to NA_ASSET (predicate: selection.isBaked===false && status==='NA_ASSET').
   * These need survivor oracle coverage or per-file goldens (§7.4); surfaced, never hidden.
   */
  allNaRotated: RotationCell[];
  allNaRotatedCount: number;
  /**
   * The VALUABLE findings (§12): cells where a rotated real file produced FAIL or ERROR
   * (predicate: selection.isBaked===false && (status==='FAIL' || status==='ERROR')). These are real
   * defects that real files exposed — traceable to the exact bytes via file + sha256.
   */
  realDefects: RotationCell[];
  realDefectCount: number;
  /** per-family real-vs-baked coverage, family-sorted. */
  familyCoverage: RotationFamilyCoverage[];
  /** distinct scenarios exercised on a real file this run (any engine/browser). */
  realScenarioCount: number;
  /** distinct scenarios that ran but never on a real file this run. */
  bakedOnlyScenarioCount: number;
  /** total result cells run on a rotated real file (selection.isBaked === false). */
  realCellCount: number;
  /** total result cells baked/legacy/unknown (the complement). */
  bakedCellCount: number;
}

export interface ReportJson {
  suiteVersion: string;
  generatedAtIso: string;
  engines: string[];
  browsers: BrowserName[];
  scenarios: string[];
  browserSections: BrowserSection[];
  scorecards: EngineScorecard[];
  caveats: string[];
  /**
   * Distinct, non-empty `env.corpusChecksum` values seen across all results (§10 reproducibility). One
   * entry ⇒ a single corpus; MORE THAN ONE ⇒ results were merged across corpora/selections and a dynamic
   * caveat is added (per-cell selected files differ — compare only within one checksum).
   */
  corpusChecksums: string[];
  /** Per-scenario file-rotation provenance, coverage & findings (§10/§11/§12). Additive; never scoring. */
  rotation: RotationReport;
}

// ── constants ────────────────────────────────────────────────────────────────────────────────

const EM_DASH = '—';
const BROWSER_ORDER: BrowserName[] = ['brave', 'chromium', 'webkit', 'firefox'];

/**
 * Priority order for INFERRING a case's primary ranking metric when results don't declare one
 * (ScenarioResult.primaryMetric). Higher-is-better headline metrics first, then latency/cost ones,
 * then generic timing. The first metric present in every eligible result wins (so the ranking is
 * fair — every ranked engine actually measured it).
 */
const PRIMARY_METRIC_PRIORITY: MetricId[] = [
  'opsPerSec',
  'packetsPerSec',
  'framesPerSec',
  'decodeFps',
  'encodeFps',
  'throughputRealtime',
  'seekMs',
  'timeToFirstFrame',
  'timeToFirstByte',
  'bundleSize',
  'loadInit',
  'wall',
  'peakMemory',
  'bytesOut',
  'sourceReads',
  'targetWrites',
  'longtasks',
];

/** Winner tie band (§9): rank-1 and rank-2 within max(noise, 3%) are co-winners (a tie). */
const WINNER_NOISE_BAND_PCT = 3;

/** §13 reproducibility caveats, written into every report verbatim. */
const CAVEATS: string[] = [
  'Browser numbers are INDICATIVE only. They depend on GPU, OS, drivers, and thermal state; a measurement made on one machine does not transfer to another.',
  'NEVER compare a raw number across browsers or across machines. Every comparison in this report is within the SAME browser, on the same corpus. Cross-browser comparison is invalid by construction — that is why the report is grouped by browser.',
  'Hardware codec sessions are the real parallelism ceiling, not navigator.hardwareConcurrency. Contention for a limited number of hardware decode/encode sessions can dominate timing for codec-bound workloads.',
  'No measurement -> no claim. No green correctness oracle -> no admissible benchmark: a perf number is reported only after the engine produced correct output for that engine x browser x scenario. A speedup with wrong output is a regression, not a win.',
  'N/A = not supported by the framework, browser/runtime, or currently available corpus assets. The machine-readable report.json keeps the internal not-applicable statuses distinct; the human-facing table intentionally folds them into one marker.',
  'Runs assume AC power and a quiesced machine. Differences within the noise band are reported as within-noise and are NOT claimed as improvements or regressions.',
];

// ── public entry point ───────────────────────────────────────────────────────────────────────

export function buildReport(input: ReportInput): ReportOutput {
  const suiteVersion = input.suiteVersion ?? firstEnvSuiteVersion(input.results) ?? 'dev';
  const generatedAtIso = input.generatedAtIso ?? new Date().toISOString();

  // Engines are derived purely from the results (no reference engine to hoist to the front).
  const engines = uniqueSorted(input.results.map((r) => r.engineId));
  const browsers = orderBrowsers(uniqueRaw(input.results.map((r) => r.browser)));
  const scenarios = uniqueRaw(input.results.map((r) => r.scenarioId));

  const byKey = indexResults(input.results);

  const browserSections = browsers.map((browser) =>
    buildBrowserSection(browser, engines, scenarios, byKey),
  );

  const scorecards = engines.map((engineId) =>
    buildScorecard(engineId, browsers, scenarios, byKey, browserSections),
  );

  // §10/§13 reproducibility: WHICH corpus (checksum) produced these cells. When results were merged
  // across MORE THAN ONE distinct corpus the per-cell selected files differ, so we append an honest
  // dynamic caveat ON TOP of the static CAVEATS (copied, never mutating the shared const).
  const corpusChecksums = collectCorpusChecksums(input.results);
  const caveats = [...CAVEATS];
  if (corpusChecksums.length > 1) {
    caveats.push(
      `Results merged across ${corpusChecksums.length} distinct corpusChecksums ` +
        `(${corpusChecksums.map(shortChecksum).join(', ')}): per-cell selected files differ between ` +
        'corpora/selections — compare only within a single checksum.',
    );
  }

  // §11/§12 file-rotation provenance, coverage & findings (additive; never touches scoring).
  const rotation = buildRotationReport(input.results);

  const json: ReportJson = {
    suiteVersion,
    generatedAtIso,
    engines,
    browsers,
    scenarios,
    browserSections,
    scorecards,
    caveats,
    corpusChecksums,
    rotation,
  };

  const markdown = renderMarkdown(json);
  return { markdown, json };
}

// ── rotation provenance & findings (§10/§11/§12) ───────────────────────────────────────────────

/** Distinct, non-empty corpus checksums across results, sorted for deterministic output. */
function collectCorpusChecksums(results: ScenarioResult[]): string[] {
  const set = new Set<string>();
  for (const r of results) {
    const c = r.env?.corpusChecksum;
    if (typeof c === 'string' && c.length > 0) set.add(c);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Project a runner `ResultSelection` into the per-cell provenance stored in report.json (drops runSeed). */
function projectSelection(
  sel: ResultSelection,
): { file: string; sha256?: string; isBaked: boolean; candidateCount?: number } {
  return {
    file: sel.file,
    isBaked: sel.isBaked,
    ...(sel.sha256 !== undefined ? { sha256: sel.sha256 } : {}),
    ...(sel.candidateCount !== undefined ? { candidateCount: sel.candidateCount } : {}),
  };
}

/** Short, human-readable checksum for prose (the full value is kept in the machine JSON). */
function shortChecksum(c: string): string {
  return c.length > 12 ? `${c.slice(0, 12)}…` : c;
}

/**
 * Fold the flat result list into the file-rotation provenance report (§11/§12). A cell is "real" iff its
 * selection says it ran on a rotated real download (`isBaked === false`); everything else (the baked
 * fixture, or legacy/absent selection ⇒ treat as baked/unknown) is "baked". Reads ONLY `r.selection`,
 * `r.status`, `r.family`, `r.reason` and identity fields — NEVER anything that changes admissibility.
 */
function buildRotationReport(results: ScenarioResult[]): RotationReport {
  const allNaRotated: RotationCell[] = [];
  const realDefects: RotationCell[] = [];

  // scenarioId → family + whether ANY cell ran it on a real file (scenario-level coverage).
  const scenarioReal = new Map<string, { family: string; hadReal: boolean }>();
  // family → cell counts (real vs baked) for the coverage table.
  const famCells = new Map<string, { realCellCount: number; bakedCellCount: number }>();

  let realCellCount = 0;
  let bakedCellCount = 0;

  for (const r of results) {
    const sel = r.selection;
    const isReal = sel?.isBaked === false;

    if (isReal) realCellCount++;
    else bakedCellCount++;

    const fc = famCells.get(r.family) ?? { realCellCount: 0, bakedCellCount: 0 };
    if (isReal) fc.realCellCount++;
    else fc.bakedCellCount++;
    famCells.set(r.family, fc);

    const prev = scenarioReal.get(r.scenarioId);
    if (prev) {
      if (isReal) prev.hadReal = true;
    } else {
      scenarioReal.set(r.scenarioId, { family: r.family, hadReal: isReal });
    }

    if (isReal && sel) {
      const ref: RotationCell = {
        scenarioId: r.scenarioId,
        engineId: r.engineId,
        browser: r.browser,
        family: r.family,
        file: sel.file,
        status: r.status,
        ...(sel.sha256 !== undefined ? { sha256: sel.sha256 } : {}),
        ...(r.reason !== undefined ? { reason: r.reason } : {}),
        ...(sel.candidateCount !== undefined ? { candidateCount: sel.candidateCount } : {}),
      };
      // All-NA rotation guard (§7.4/§12): a rotated real file whose every oracle was golden-keyed → the
      // whole cell is NA_ASSET (zero admissible signal). Needs survivor coverage or per-file goldens.
      if (r.status === 'NA_ASSET') allNaRotated.push(ref);
      // Valuable findings (§12): a rotated real file that produced a FAIL or ERROR — a real defect.
      if (r.status === 'FAIL' || r.status === 'ERROR') realDefects.push(ref);
    }
  }

  // Per-family scenario coverage, derived from the scenario-level map.
  const famScenarios = new Map<string, { real: string[]; bakedOnly: string[] }>();
  let realScenarioCount = 0;
  let bakedOnlyScenarioCount = 0;
  for (const [scenarioId, info] of scenarioReal) {
    const entry = famScenarios.get(info.family) ?? { real: [], bakedOnly: [] };
    if (info.hadReal) {
      entry.real.push(scenarioId);
      realScenarioCount++;
    } else {
      entry.bakedOnly.push(scenarioId);
      bakedOnlyScenarioCount++;
    }
    famScenarios.set(info.family, entry);
  }

  const families = new Set<string>([...famCells.keys(), ...famScenarios.keys()]);
  const familyCoverage: RotationFamilyCoverage[] = [...families]
    .sort((a, b) => a.localeCompare(b))
    .map((family) => {
      const s = famScenarios.get(family) ?? { real: [], bakedOnly: [] };
      const c = famCells.get(family) ?? { realCellCount: 0, bakedCellCount: 0 };
      return {
        family,
        realScenarios: [...s.real].sort((a, b) => a.localeCompare(b)),
        bakedOnlyScenarios: [...s.bakedOnly].sort((a, b) => a.localeCompare(b)),
        realCellCount: c.realCellCount,
        bakedCellCount: c.bakedCellCount,
      };
    });

  const byCell = (a: RotationCell, b: RotationCell): number =>
    a.family.localeCompare(b.family) ||
    a.scenarioId.localeCompare(b.scenarioId) ||
    a.engineId.localeCompare(b.engineId) ||
    a.browser.localeCompare(b.browser);
  allNaRotated.sort(byCell);
  realDefects.sort(byCell);

  return {
    allNaRotated,
    allNaRotatedCount: allNaRotated.length,
    realDefects,
    realDefectCount: realDefects.length,
    familyCoverage,
    realScenarioCount,
    bakedOnlyScenarioCount,
    realCellCount,
    bakedCellCount,
  };
}

// ── result indexing ──────────────────────────────────────────────────────────────────────────

type ResultKey = string; // `${engineId}\0${browser}\0${scenarioId}`

function keyOf(engineId: string, browser: BrowserName, scenarioId: string): ResultKey {
  return `${engineId}\0${browser}\0${scenarioId}`;
}

/** Last write wins if the same triple appears twice (later runs supersede earlier). */
function indexResults(results: ScenarioResult[]): Map<ResultKey, ScenarioResult> {
  const map = new Map<ResultKey, ScenarioResult>();
  for (const r of results) {
    map.set(keyOf(r.engineId, r.browser, r.scenarioId), r);
  }
  return map;
}

function getResult(
  byKey: Map<ResultKey, ScenarioResult>,
  engineId: string,
  browser: BrowserName,
  scenarioId: string,
): ScenarioResult | undefined {
  return byKey.get(keyOf(engineId, browser, scenarioId));
}

// ── per-browser assembly ─────────────────────────────────────────────────────────────────────

function buildBrowserSection(
  browser: BrowserName,
  engines: string[],
  scenarios: string[],
  byKey: Map<ResultKey, ScenarioResult>,
): BrowserSection {
  const conformance: Record<string, Record<string, ConformanceCell>> = {};
  const bench: Record<string, Record<string, BenchCell>> = {};
  const conformancePctByEngine: Record<string, number> = {};

  for (const engineId of engines) {
    const confRow: Record<string, ConformanceCell> = {};
    const benchRow: Record<string, BenchCell> = {};
    let pass = 0;
    let admissible = 0;

    for (const scenarioId of scenarios) {
      const r = getResult(byKey, engineId, browser, scenarioId);
      if (!r) {
        confRow[scenarioId] = { status: null };
        benchRow[scenarioId] = {};
        continue;
      }
      const reasonProps = r.reason ? { reason: r.reason } : {};
      const durationProps = r.durationMs !== undefined ? { durationMs: r.durationMs } : {};
      // §10 reproducibility: stamp the actually-tested file + sha per cell (rotated-real or baked).
      // Spread only when present so legacy/absent results stay untouched (⇒ baked/unknown downstream).
      const selectionProps = r.selection ? { selection: projectSelection(r.selection) } : {};
      const exhaustiveProps = r.exhaustive?.length
        ? {
            exhaustive: r.exhaustive.map((e) => ({
              file: e.file,
              isBaked: e.isBaked,
              status: e.status,
              ...(e.sha256 ? { sha256: e.sha256 } : {}),
            })),
          }
        : {};
      confRow[scenarioId] = { status: r.status, ...reasonProps, ...durationProps, ...selectionProps, ...exhaustiveProps };
      benchRow[scenarioId] = benchCellFrom(r);

      if (isAdmissible(r.status)) {
        admissible++;
        if (r.status === 'PASS') pass++;
      }
    }

    conformance[engineId] = confRow;
    bench[engineId] = benchRow;
    conformancePctByEngine[engineId] = admissible === 0 ? 0 : round1((pass / admissible) * 100);
  }

  // Per-case winners (§9) — the deliverable for this browser.
  const winners = scenarios.map((scenarioId) =>
    computeCaseWinner(browser, scenarioId, engines, byKey),
  );

  // Benchmark-first rework (USER DIRECTIVE; §8.1/§9): attach the case's PRIMARY-METRIC number to every
  // PASSing cell so the markdown can lead each per-case row with the number, not the conformance
  // letter. The metric is the SAME one the winner ranked by (winner.primaryMetric) so a case's column
  // is internally consistent; the value is THIS engine's median on that metric. Correctness still
  // gates (§0.1): we read bench only for PASS cells (benchCellFrom already blanked non-PASS), and we
  // only stamp a number when this engine actually measured that metric.
  for (const w of winners) {
    if (!w.primaryMetric) continue;
    const metric = w.primaryMetric;
    const unit = metricUnit(metric);
    for (const engineId of engines) {
      const r = getResult(byKey, engineId, browser, w.scenarioId);
      if (!r || r.status !== 'PASS') continue;
      const median = r.bench?.[metric]?.median;
      if (median === undefined || !Number.isFinite(median)) continue;
      const cell = bench[engineId]?.[w.scenarioId];
      if (!cell) continue;
      cell.primaryMetric = metric;
      cell.primaryValueMedian = median;
      cell.primaryUnit = unit;
    }
  }

  return {
    browser,
    engines,
    scenarios,
    conformance,
    bench,
    conformancePctByEngine,
    winners,
  };
}

// ── winner determination (§9) ──────────────────────────────────────────────────────────────────

/**
 * Determine the winner of ONE scenario within ONE browser:
 *   1. Eligibility — only engines whose correctness oracle PASSed (rule §0.1) can win.
 *   2. Pick the ranking metric — the engines' declared primaryMetric if shared, else inferred from
 *      PRIMARY_METRIC_PRIORITY (first metric present in every eligible result).
 *   3. Rank COVERAGE-FIRST (§6.2): an engine that PASSed more candidate files always outranks one that
 *      passed fewer, REGARDLESS of speed; equal coverage falls back to the metric's exhaustive aggregate
 *      (else the single-file median), direction-aware. Winner = rank 1. In single-file mode coverage is
 *      absent (all 0), so this reduces to the historical pure-metric ranking.
 *   4. Ties, runner-up and margin are computed ONLY among engines at the winner's coverage tier (a
 *      lower-coverage engine is strictly beaten and cannot co-win): tie when ≥2 of them are within
 *      max(noise, 3%); uncontested when only one engine is eligible at all.
 */
function computeCaseWinner(
  browser: BrowserName,
  scenarioId: string,
  engines: string[],
  byKey: Map<ResultKey, ScenarioResult>,
): CaseWinner {
  const eligibleResults = engines
    .map((e) => getResult(byKey, e, browser, scenarioId))
    .filter((r): r is ScenarioResult => !!r && r.status === 'PASS');
  const eligible = eligibleResults.map((r) => r.engineId);
  const family = eligibleResults[0]?.family ?? scenarioId.split('/')[0] ?? '';

  const none: CaseWinner = {
    scenarioId,
    family,
    primaryMetric: null,
    winner: null,
    winnerValue: null,
    runnerUp: null,
    runnerUpValue: null,
    marginPct: null,
    flag: 'none',
    eligible,
    coWinners: [],
  };

  if (eligibleResults.length === 0) return none;

  const metric = primaryMetricForCase(eligibleResults);

  // No rankable metric (e.g. a functional-only case with no admissible perf number). A single PASS
  // is still an uncontested "win" on correctness; multiple PASSes with no metric cannot be ordered.
  if (!metric) {
    if (eligible.length === 1) {
      return { ...none, winner: eligible[0] ?? null, flag: 'uncontested', coWinners: [eligible[0] ?? ''] };
    }
    return { ...none, flag: 'none' };
  }

  const higher = metricHigherIsBetter(metric);
  // Coverage-FIRST: rank by files PASSed (DESC), then by the metric's exhaustive aggregate (SUM for cost
  // metrics, MEDIAN for rates — see BenchSummary.aggregate) or the single-file median, direction-aware.
  // In single-file mode `passed` is 0 for every engine and `aggregate` is absent, so this is exactly the
  // historical pure-metric-on-median ranking.
  const ranked = eligibleResults
    .map((r) => ({
      id: r.engineId,
      v: r.bench?.[metric]?.aggregate ?? r.bench?.[metric]?.median,
      passed: r.coverage?.passed ?? 0,
    }))
    .filter(
      (x): x is { id: string; v: number; passed: number } =>
        typeof x.v === 'number' && Number.isFinite(x.v),
    )
    .sort((a, b) => b.passed - a.passed || (higher ? b.v - a.v : a.v - b.v));

  if (ranked.length === 0) return { ...none, primaryMetric: metric };

  const top = ranked[0]!;
  if (ranked.length === 1) {
    return {
      ...none,
      primaryMetric: metric,
      winner: top.id,
      winnerValue: top.v,
      flag: 'uncontested',
      coWinners: [top.id],
    };
  }

  // Ties, runner-up and margin are meaningful ONLY among engines at the winner's coverage tier: a
  // lower-coverage engine is strictly beaten (coverage wins regardless of speed) so it can never co-win,
  // and a speed "margin" over it would be misleading (it did less work). Lower-tier engines still appear
  // in `eligible`, and their partial coverage shows in their own cell (` · passed/total`).
  const band = WINNER_NOISE_BAND_PCT;
  const topTier = ranked.filter((x) => x.passed === top.passed);
  const coWinners = topTier
    .filter((x) => Math.abs(relativeBetterPct(top.v, x.v, higher)) <= band)
    .map((x) => x.id);
  const second = ranked[1]!; // next engine overall (may be at a lower coverage tier)
  const sameTierSecond = topTier[1]; // closest rival AT the winner's coverage tier, if any
  // A metric margin is only honest between equal-coverage engines; when the win was decided by coverage
  // (no same-tier rival) there is no speed margin to claim, so it is null (rendered as —).
  const marginPct = sameTierSecond
    ? roundTo(relativeBetterPct(top.v, sameTierSecond.v, higher), 2)
    : null;
  const flag = coWinners.length > 1 ? 'tie' : 'contested';

  return {
    scenarioId,
    family,
    primaryMetric: metric,
    winner: top.id,
    winnerValue: top.v,
    runnerUp: second.id,
    runnerUpValue: second.v,
    marginPct,
    flag,
    eligible,
    coWinners,
  };
}

/**
 * Choose the metric a case is ranked by: the engines' declared primaryMetric when it is shared by
 * every eligible result, else the first PRIMARY_METRIC_PRIORITY metric present in all of them, else
 * the first present in any. null when no eligible result carries a measured metric.
 */
function primaryMetricForCase(results: ScenarioResult[]): MetricId | null {
  const declared = results.map((r) => r.primaryMetric).filter((m): m is MetricId => !!m);
  for (const m of declared) {
    if (results.every((r) => r.bench?.[m])) return m;
  }
  for (const m of PRIMARY_METRIC_PRIORITY) {
    if (results.every((r) => r.bench?.[m])) return m;
  }
  for (const m of PRIMARY_METRIC_PRIORITY) {
    if (results.some((r) => r.bench?.[m])) return m;
  }
  return null;
}

/**
 * Percentage by which `a` is BETTER than `b` on a metric (positive == a better), direction-aware and
 * guarded against a zero/degenerate baseline. For higher-is-better: (a-b)/b·100; for lower: (b-a)/b·100.
 */
function relativeBetterPct(a: number, b: number, higherIsBetter: boolean): number {
  if (b === 0) {
    if (a === b) return 0;
    // a strictly better than a zero baseline → treat as a large (capped) margin, not Infinity.
    return 100;
  }
  const raw = ((a - b) / b) * 100;
  return higherIsBetter ? raw : -raw;
}

function benchCellFrom(r: ScenarioResult): BenchCell {
  // Correctness gate: a non-PASS result carries no admissible benchmark (§0.1).
  if (r.status !== 'PASS') return {};
  const cell: BenchCell = {};
  const wall = r.bench?.wall;
  if (wall) {
    cell.wallMedianMs = wall.median;
    cell.wallP95Ms = wall.p95;
    // Exhaustive mode: total wall across the whole candidate file set (the coverage-first cost basis).
    if (wall.aggregate !== undefined && Number.isFinite(wall.aggregate)) cell.wallAggregateMs = wall.aggregate;
  }
  const tput = r.bench?.throughputRealtime;
  if (tput) cell.throughputRealtime = tput.median;
  const mem = r.bench?.peakMemory;
  if (mem) cell.peakMemoryBytes = mem.median;
  const lt = r.bench?.longtasks;
  if (lt) cell.longtaskMs = lt.median;
  // Exhaustive-mode file coverage → drives the ` · passed/total` display suffix + coverage-first winner.
  // Attached for any PASS (independent of bench presence) so a functional-only exhaustive PASS still
  // shows its coverage.
  if (r.coverage) cell.coverage = { passed: r.coverage.passed, total: r.coverage.total };
  return cell;
}

// ── scorecards ───────────────────────────────────────────────────────────────────────────────

function buildScorecard(
  engineId: string,
  browsers: BrowserName[],
  scenarios: string[],
  byKey: Map<ResultKey, ScenarioResult>,
  browserSections: BrowserSection[],
): EngineScorecard {
  let pass = 0;
  let admissible = 0;
  const families = new Set<string>();
  let robustnessPass = 0;
  let robustnessTotal = 0;

  for (const browser of browsers) {
    for (const scenarioId of scenarios) {
      const r = getResult(byKey, engineId, browser, scenarioId);
      if (!r) continue;
      if (isAdmissible(r.status)) {
        admissible++;
        if (r.status === 'PASS') {
          pass++;
          families.add(r.family);
        }
      }
      if (r.family === 'robustness') {
        robustnessTotal++;
        // Robust = graceful handling: a PASS oracle (graceful-failure / invariant) counts as robust.
        if (r.status === 'PASS') robustnessPass++;
      }
    }
  }

  const capabilityFamilies = [...families].sort();

  // ── leaderboard aggregates (§9) ──
  let wins = 0;
  let uncontestedWins = 0;
  const winsByBrowser: Partial<Record<BrowserName, number>> = {};
  const perfIndexVsWinnerByBrowser: Partial<Record<BrowserName, number | null>> = {};
  for (const section of browserSections) {
    let browserWins = 0;
    for (const w of section.winners) {
      if (w.coWinners.includes(engineId)) {
        browserWins++;
        if (w.flag === 'uncontested') uncontestedWins++;
      }
    }
    wins += browserWins;
    winsByBrowser[section.browser] = browserWins;
    perfIndexVsWinnerByBrowser[section.browser] = perfIndexVsWinnerFor(engineId, section, byKey);
  }

  const bundleSizeKb = engineBundleSizeKb(engineId, browsers, scenarios, byKey);
  const conformancePct = admissible === 0 ? 0 : round1((pass / admissible) * 100);
  const robustnessRate = robustnessTotal === 0 ? null : round1((robustnessPass / robustnessTotal) * 100);

  const verdict = buildVerdict({
    wins,
    uncontestedWins,
    perfIndexVsWinnerByBrowser,
    conformancePct,
    bundleSizeKb,
    robustnessRate,
  });

  return {
    engineId,
    conformancePct,
    conformancePassCount: pass,
    conformanceAdmissibleCount: admissible,
    capabilityBreadth: capabilityFamilies.length,
    capabilityFamilies,
    robustnessRate,
    robustnessPassCount: robustnessPass,
    robustnessTotal,
    wins,
    winsByBrowser,
    uncontestedWins,
    perfIndexVsWinnerByBrowser,
    bundleSizeKb,
    verdict,
  };
}

/**
 * Perf index vs the per-case WINNER for one browser: geomean of (engine value ÷ winner value),
 * direction-normalized so every ratio is ≤1 and 1.00 = the engine was the winner on every case it
 * could be ranked on. null when there is no rankable case the engine was eligible for.
 */
function perfIndexVsWinnerFor(
  engineId: string,
  section: BrowserSection,
  byKey: Map<ResultKey, ScenarioResult>,
): number | null {
  let logSum = 0;
  let count = 0;
  for (const w of section.winners) {
    const metric = w.primaryMetric;
    if (!metric || w.winnerValue === null || !Number.isFinite(w.winnerValue)) continue;
    const r = getResult(byKey, engineId, section.browser, w.scenarioId);
    if (!r || r.status !== 'PASS') continue;
    // aggregate??median to match `w.winnerValue` (both exhaustive-aggregate when present, else median).
    const val = r.bench?.[metric]?.aggregate ?? r.bench?.[metric]?.median;
    if (val === undefined || !Number.isFinite(val) || val <= 0) continue;
    const winnerVal = w.winnerValue;
    if (winnerVal <= 0) continue;
    // ratio ≤ 1: higher-is-better → val/winner; lower-is-better → winner/val.
    const ratio = metricHigherIsBetter(metric) ? val / winnerVal : winnerVal / val;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    logSum += Math.log(ratio);
    count++;
  }
  if (count === 0) return null;
  return round2(Math.exp(logSum / count));
}

/** Bundle size kB for an engine — the median of any measured `bundleSize` bench across the matrix. */
function engineBundleSizeKb(
  engineId: string,
  browsers: BrowserName[],
  scenarios: string[],
  byKey: Map<ResultKey, ScenarioResult>,
): number | null {
  const vals: number[] = [];
  for (const browser of browsers) {
    for (const scenarioId of scenarios) {
      const r = getResult(byKey, engineId, browser, scenarioId);
      const v = r?.bench?.bundleSize?.median;
      if (typeof v === 'number' && Number.isFinite(v)) vals.push(v);
    }
  }
  if (vals.length === 0) return null;
  vals.sort((a, b) => a - b);
  return round1(vals[Math.floor((vals.length - 1) / 2)] ?? vals[0]!);
}

/** One-line factual verdict (§10.2) from the leaderboard aggregates. */
function buildVerdict(s: {
  wins: number;
  uncontestedWins: number;
  perfIndexVsWinnerByBrowser: Partial<Record<BrowserName, number | null>>;
  conformancePct: number;
  bundleSizeKb: number | null;
  robustnessRate: number | null;
}): string {
  const parts: string[] = [];
  const contested = s.wins - s.uncontestedWins;
  parts.push(
    `${s.wins} win${s.wins === 1 ? '' : 's'}` +
      (s.uncontestedWins ? ` (${contested} contested, ${s.uncontestedWins} uncontested)` : ''),
  );
  const idxs = Object.values(s.perfIndexVsWinnerByBrowser).filter(
    (x): x is number => typeof x === 'number',
  );
  if (idxs.length) {
    const best = Math.max(...idxs);
    parts.push(`perf ${fmtNum(best)}× vs winners`);
  }
  parts.push(`${fmtNum(s.conformancePct)}% conformant`);
  if (s.robustnessRate !== null) parts.push(`${fmtNum(s.robustnessRate)}% robust`);
  if (s.bundleSizeKb !== null) parts.push(`${fmtNum(s.bundleSizeKb)} kB bundle`);
  return parts.join(' · ');
}

// ── markdown rendering ───────────────────────────────────────────────────────────────────────

function renderMarkdown(json: ReportJson): string {
  const out: string[] = [];

  out.push('# Browser Media-Engine Benchmark Report');
  out.push('');
  out.push(`Suite ${json.suiteVersion} · Generated ${json.generatedAtIso}`);
  out.push('');
  out.push(
    `Engines: ${json.engines.map((e) => `\`${e}\``).join(', ') || EM_DASH} · ` +
      `Browsers: ${json.browsers.join(', ') || EM_DASH} · ` +
      `Scenarios: ${json.scenarios.length}`,
  );
  out.push('');
  out.push(
    'All comparisons are **within a single browser, on the same corpus.** ' +
      'Numbers are never compared across browsers (see Caveats).',
  );
  out.push('');
  // Benchmark-first reading guide (USER DIRECTIVE; §8/§9). The NUMBER is the product; correctness
  // gates it (§0.1); NA collapses the two not-supported flavors into one user-facing marker.
  out.push(
    '> **Reading the matrix:** every completed cell shows **Pass (<execution time>)** — or, when the ' +
      'case was run against a whole set of real files, **Pass (<total time> · <files passed>/<files>)** ' +
      '— when the operation ran correctly, or **N/A** when the engine or browser/runtime cannot support ' +
      'that case. Machine-readable `report.json` keeps the internal status distinction.',
  );
  out.push('');

  // 0. THE LEADERBOARD — the headline deliverable (§9): wins per engine + verdict.
  out.push('## 🏆 Leaderboard');
  out.push('');
  out.push(renderLeaderboard(json));
  out.push('');

  // Conformance % summary (secondary context: per-engine pass rate across NON-NA cells, per browser).
  out.push('## Conformance summary (context)');
  out.push('');
  out.push(renderConformanceSummary(json));
  out.push('');

  // Per-browser groups: BENCHMARK NUMBERS FIRST (the product), then winners, then the secondary
  // letter-based conformance matrix, and the detailed benchmark matrix.
  for (const section of json.browserSections) {
    out.push(`## Browser: ${section.browser}`);
    out.push('');

    out.push('### 1. Result matrix — display value per engine × case');
    out.push('');
    out.push(
      '_Each completed cell is formatted as `Pass (<execution time>)` or `N/A`. Indicative for this ' +
        'browser only — never compared across browsers (see Caveats)._',
    );
    out.push('');
    out.push(renderBenchmarkNumbers(section));
    out.push('');

    out.push('### 2. Winners — one per case (🏆 = most files passed, then fastest correct engine)');
    out.push('');
    out.push(renderWinners(section));
    out.push('');

    out.push('### 3. Conformance matrix (same display rule, grouped by correctness)');
    out.push('');
    out.push(renderConformanceMatrix(section));
    out.push('');
    out.push(renderReasonNotes(section));

    out.push('### 4. Benchmark matrix (full per-engine timing detail)');
    out.push('');
    out.push(
      '_Indicative for this browser only. Cells without a green conformance gate are blank (—)._',
    );
    out.push('');
    out.push(renderBenchMatrix(section));
    out.push('');
  }

  // Per-engine scorecard (cross-browser layout, but perf index is per-browser).
  out.push('## Per-engine scorecard');
  out.push('');
  out.push(renderScorecards(json));
  out.push('');

  // File-rotation provenance & findings (§10/§12) — ADDITIVE reporting; never affects the score.
  out.push('## File-rotation provenance & findings (§10/§12)');
  out.push('');
  out.push(renderCorpusChecksums(json));
  out.push('');
  out.push('### Rotation coverage — real vs baked-only, per family (§12)');
  out.push('');
  out.push(renderRotationCoverage(json.rotation));
  out.push('');
  out.push('### Real files that exposed defects — FAIL / ERROR on a rotated real file (§12)');
  out.push('');
  out.push(renderRotationDefects(json.rotation));
  out.push('');
  out.push(
    '### Rotated real files with no admissible oracle (all-NA) — need survivor coverage or per-file goldens (§7.4)',
  );
  out.push('');
  out.push(renderAllNaRotated(json.rotation));
  out.push('');

  // Caveats (§13).
  out.push('## Caveats (read before quoting any number)');
  out.push('');
  for (const c of json.caveats) out.push(`- ${c}`);
  out.push('');

  return out.join('\n');
}

function renderConformanceSummary(json: ReportJson): string {
  if (json.engines.length === 0 || json.browsers.length === 0) {
    return '_No results._';
  }
  const header = ['Engine', ...json.browsers.map((b) => `${b} conf %`)];
  const rows: string[][] = [];
  for (const engineId of json.engines) {
    const cells = json.browsers.map((b) => {
      const section = json.browserSections.find((s) => s.browser === b);
      const pct = section?.conformancePctByEngine[engineId];
      return pct === undefined ? EM_DASH : `${fmtNum(pct)}%`;
    });
    rows.push([engineLabel(engineId), ...cells]);
  }
  return mdTable(header, rows);
}

/**
 * THE benchmark-first per-case table (USER DIRECTIVE item 1/4; §8/§9): scenario × engine, every cell
 * the PRIMARY-METRIC NUMBER (with unit) when that engine ran the case correctly, "N/A" when the
 * framework can't, FAIL when the output was wrong. This is the product — the conformance matrix below
 * is now the secondary, letter-based view. Each row appends the case's primary-metric name so the
 * unit/direction is unambiguous; 🏆 prefixes the per-case winner's number.
 */
function renderBenchmarkNumbers(section: BrowserSection): string {
  if (section.engines.length === 0 || section.scenarios.length === 0) {
    return '_No results._';
  }
  const metricByScenario = new Map<string, MetricId | null>();
  for (const w of section.winners) {
    metricByScenario.set(w.scenarioId, w.primaryMetric);
  }

  const header = ['Case', 'Primary metric', ...section.engines];
  const rows: string[][] = [];
  for (const scenarioId of section.scenarios) {
    const metric = metricByScenario.get(scenarioId) ?? null;
    const cells = section.engines.map((engineId) => {
      const benchCell = section.bench[engineId]?.[scenarioId];
      const confCell = section.conformance[engineId]?.[scenarioId];
      return benchmarkCellMd(benchCell, confCell);
    });
    rows.push([
      `\`${scenarioId}\``,
      metric ? `${metric} (${metricUnit(metric)})` : EM_DASH,
      ...cells,
    ]);
  }
  return mdTable(header, rows);
}

function renderConformanceMatrix(section: BrowserSection): string {
  if (section.engines.length === 0 || section.scenarios.length === 0) {
    return '_No results._';
  }
  const header = ['Scenario', ...section.engines.map((e) => e)];
  const rows: string[][] = [];
  for (const scenarioId of section.scenarios) {
    const cells = section.engines.map((engineId) => {
      const cell = section.conformance[engineId]?.[scenarioId];
      const benchCell = section.bench[engineId]?.[scenarioId];
      return cell ? visibleCellMd(benchCell, cell) : EM_DASH;
    });
    rows.push([`\`${scenarioId}\``, ...cells]);
  }
  return mdTable(header, rows);
}

/** Footnote-style reasons for non-PASS / non-NA-clean cells so the matrix stays scannable. */
function renderReasonNotes(section: BrowserSection): string {
  const notes: string[] = [];
  for (const engineId of section.engines) {
    for (const scenarioId of section.scenarios) {
      const cell = section.conformance[engineId]?.[scenarioId];
      if (!cell || cell.status === null || cell.status === 'PASS') continue;
      if (!cell.reason) continue;
      const benchCell = section.bench[engineId]?.[scenarioId];
      notes.push(`- \`${engineId}\` · \`${scenarioId}\` — **${visibleCellMd(benchCell, cell)}**: ${cell.reason}`);
    }
  }
  if (notes.length === 0) return '';
  return ['<details><summary>Cell details</summary>', '', ...notes, '', '</details>', ''].join('\n');
}

function renderBenchMatrix(section: BrowserSection): string {
  if (section.engines.length === 0 || section.scenarios.length === 0) {
    return '_No results._';
  }
  // One block per engine: scenario × {wall median/p95, ×RT, peak mem, longtasks}.
  const blocks: string[] = [];
  for (const engineId of section.engines) {
    const header = ['Scenario', 'wall median (ms)', 'wall p95 (ms)', '×realtime', 'peak mem', 'longtasks (ms)'];
    const rows: string[][] = [];
    let anyData = false;
    for (const scenarioId of section.scenarios) {
      const cell = section.bench[engineId]?.[scenarioId] ?? {};
      const hasData =
        cell.wallMedianMs !== undefined ||
        cell.throughputRealtime !== undefined ||
        cell.peakMemoryBytes !== undefined ||
        cell.longtaskMs !== undefined;
      if (hasData) anyData = true;
      rows.push([
        `\`${scenarioId}\``,
        fmtMaybe(cell.wallMedianMs, 1),
        fmtMaybe(cell.wallP95Ms, 1),
        cell.throughputRealtime === undefined ? EM_DASH : `${fmtNum(round2(cell.throughputRealtime))}×`,
        fmtBytes(cell.peakMemoryBytes),
        fmtMaybe(cell.longtaskMs, 1),
      ]);
    }
    blocks.push(`**\`${engineId}\`**`);
    blocks.push('');
    blocks.push(anyData ? mdTable(header, rows) : '_No admissible benchmarks (no green conformance gate)._');
    blocks.push('');
  }
  return blocks.join('\n');
}

function renderScorecards(json: ReportJson): string {
  if (json.scorecards.length === 0) return '_No engines._';
  const header = [
    'Engine',
    'Conformance %',
    'Pass / applicable',
    ...json.browsers.map((b) => `Perf idx vs winner (${b})`),
    'Capability breadth',
    'Robustness %',
  ];
  const rows: string[][] = [];
  for (const sc of json.scorecards) {
    const perfCells = json.browsers.map((b) => {
      const idx = sc.perfIndexVsWinnerByBrowser[b];
      return idx === undefined || idx === null ? EM_DASH : `${fmtNum(idx)}×`;
    });
    rows.push([
      engineLabel(sc.engineId),
      `${fmtNum(sc.conformancePct)}%`,
      `${sc.conformancePassCount} / ${sc.conformanceAdmissibleCount}`,
      ...perfCells,
      `${sc.capabilityBreadth} (${sc.capabilityFamilies.join(', ') || EM_DASH})`,
      sc.robustnessRate === null ? EM_DASH : `${fmtNum(sc.robustnessRate)}% (${sc.robustnessPassCount}/${sc.robustnessTotal})`,
    ]);
  }
  return [
    mdTable(header, rows),
    '',
    '_Perf index = geometric mean of throughput ratios vs the per-case WINNER, per browser, over co-eligible scenarios. 1.00× = the fastest correct engine on every rankable case; <1.00× = slower than the winner on average; null/— = no co-eligible scenario to compare._',
  ].join('\n');
}

function renderLeaderboard(json: ReportJson): string {
  if (json.scorecards.length === 0) return '_No engines._';
  const ranked = [...json.scorecards].sort(
    (a, b) => b.wins - a.wins || b.conformancePct - a.conformancePct,
  );
  const header = ['#', 'Engine', 'Wins', 'Conf %', 'Robust %', 'Bundle', 'Breadth', 'Verdict'];
  const rows: string[][] = [];
  ranked.forEach((sc, i) => {
    rows.push([
      String(i + 1),
      engineLabel(sc.engineId),
      sc.uncontestedWins ? `${sc.wins} (${sc.uncontestedWins} unc.)` : String(sc.wins),
      `${fmtNum(sc.conformancePct)}%`,
      sc.robustnessRate === null ? EM_DASH : `${fmtNum(sc.robustnessRate)}%`,
      sc.bundleSizeKb === null ? EM_DASH : `${fmtNum(sc.bundleSizeKb)} kB`,
      String(sc.capabilityBreadth),
      sc.verdict,
    ]);
  });
  return [
    mdTable(header, rows),
    '',
    '_Wins = cases where the engine was the winner — the CORRECT engine that passed the most candidate ' +
      'files, ties broken by lowest total time; co-winners of a tie both count, "unc." = uncontested ' +
      '(the only eligible engine). Win COUNTS are aggregated across browsers (counts are safe to sum; ' +
      'raw timing numbers are not — see Caveats). Ranked by wins, then conformance._',
  ].join('\n');
}

function renderWinners(section: BrowserSection): string {
  if (section.winners.length === 0) return '_No cases._';
  const header = ['Case', 'Winner', 'Value', 'Runner-up', 'Margin', 'Eligible', 'Flag'];
  const rows: string[][] = [];
  for (const w of section.winners) {
    rows.push([
      `\`${w.scenarioId}\``,
      winnerCell(w),
      w.winnerValue === null ? EM_DASH : fmtMetricValue(w.winnerValue, w.primaryMetric),
      w.runnerUp ? `\`${w.runnerUp}\`` : EM_DASH,
      w.marginPct === null ? EM_DASH : `+${fmtNum(Math.abs(w.marginPct))}%`,
      String(w.eligible.length),
      winnerFlagLabel(w.flag),
    ]);
  }
  return mdTable(header, rows);
}

function winnerCell(w: CaseWinner): string {
  if (w.flag === 'tie') return `🤝 ${w.coWinners.map((e) => `\`${e}\``).join(', ')}`;
  if (w.flag === 'uncontested') return w.winner ? `\`${w.winner}\` (uncontested)` : EM_DASH;
  if (w.flag === 'none' || !w.winner) return EM_DASH;
  return `🏆 \`${w.winner}\``;
}

function winnerFlagLabel(flag: CaseWinner['flag']): string {
  switch (flag) {
    case 'contested':
      return 'contested';
    case 'tie':
      return 'tie';
    case 'uncontested':
      return 'uncontested';
    case 'none':
    default:
      return 'no winner';
  }
}

/** Format a metric value with its unit (bytes get human units; rates/ms get the metric unit). */
function fmtMetricValue(value: number, metric: MetricId | null): string {
  if (!Number.isFinite(value)) return EM_DASH;
  if (metric === 'peakMemory' || metric === 'bytesOut') return fmtBytes(value);
  const unit = metric ? metricUnit(metric) : '';
  return `${fmtNum(round2(value))}${unit ? ` ${unit}` : ''}`;
}

/**
 * THE benchmark cell (USER DIRECTIVE; §0.1/§8/§9): render one engine × case cell, NUMBER-FIRST.
 *   - PASS with a measured primary metric → the primary-metric value WITH UNIT (the product). 🏆 is
 *     prefixed when this engine is the per-case winner/co-winner, so the fastest correct engine reads
 *     at a glance — but the NUMBER leads, the marker only decorates.
 *   - PASS with no rankable/measured metric → "PASS" (correct, but nothing to time — e.g. a
 *     functional-only oracle case). Honest: we never invent a number (§0.6/§14).
 *   - FAIL / ERROR → shown as FAIL / ERROR. Correctness GATES the number (§0.1): a wrong output is a
 *     clearly-marked non-number, NEVER a benchmark value.
 *   - NA_* → a single collapsed "N/A" (the framework genuinely cannot run the case;
 *     best-effort attempted). The `-ᵇ` distinction is intentionally dropped here (see `statusLabelMd`).
 *   - SKIPPED / not-run → SKIPPED / — .
 */
function benchmarkCellMd(
  cell: BenchCell | undefined,
  conf: ConformanceCell | undefined,
): string {
  return visibleCellMd(cell, conf);
}

// ── rotation provenance rendering (§10/§12) ────────────────────────────────────────────────────

/** Reproducibility line: the corpus checksum(s) these cells came from (§10/§13). */
function renderCorpusChecksums(json: ReportJson): string {
  const sums = json.corpusChecksums;
  if (sums.length === 0) {
    return '_Corpus checksum: not recorded in any result env — reproducibility of the selected files is unverifiable._';
  }
  const list = sums.map((c) => `\`${c}\``).join(', ');
  if (sums.length === 1) {
    return `Corpus checksum: ${list} — single corpus, so the per-cell selected files are directly comparable.`;
  }
  return (
    `**Corpus checksum: ${sums.length} DISTINCT values** — ${list}. Results were merged across different ` +
    'corpora/selections, so the per-cell selected files differ; compare only within one checksum (see Caveats).'
  );
}

/** §12 DoD (a): per-family real-vs-baked coverage, with the actually-exercised real scenarios enumerated. */
function renderRotationCoverage(rot: RotationReport): string {
  const totals =
    `_Totals: ${rot.realScenarioCount} scenario(s) exercised on a rotated real file, ` +
    `${rot.bakedOnlyScenarioCount} still baked-only; ${rot.realCellCount} real cell(s) vs ` +
    `${rot.bakedCellCount} baked/legacy cell(s). A cell is "real" iff selection.isBaked === false; ` +
    'absent selection ⇒ baked/unknown. Coverage is provenance only — it never affects scoring._';
  if (rot.familyCoverage.length === 0) {
    return ['_No results._', '', totals].join('\n');
  }
  const header = ['Family', 'Scenarios on real file', 'Baked-only scenarios', 'Real cells', 'Baked cells'];
  const rows = rot.familyCoverage.map((f) => [
    f.family,
    String(f.realScenarios.length),
    String(f.bakedOnlyScenarios.length),
    String(f.realCellCount),
    String(f.bakedCellCount),
  ]);
  const detailFamilies = rot.familyCoverage.filter((f) => f.realScenarios.length > 0);
  const details =
    detailFamilies.length === 0
      ? []
      : [
          '',
          '<details><summary>Scenarios exercised on a real file, per family</summary>',
          '',
          ...detailFamilies.map(
            (f) => `- **${f.family}**: ${f.realScenarios.map((s) => `\`${s}\``).join(', ')}`,
          ),
          '',
          '</details>',
        ];
  return [mdTable(header, rows), '', totals, ...details].join('\n');
}

/** §12 DoD (b): the VALUABLE findings — a rotated real file that produced FAIL/ERROR (a real defect). */
function renderRotationDefects(rot: RotationReport): string {
  if (rot.realDefects.length === 0) {
    return '_None — no rotated real file produced a FAIL or ERROR this run._';
  }
  const header = ['Case', 'Engine', 'Browser', 'Status', 'File', 'sha256', 'Reason'];
  const rows = rot.realDefects.map((c) => [
    `\`${c.scenarioId}\``,
    `\`${c.engineId}\``,
    c.browser,
    c.status,
    `\`${c.file}\``,
    c.sha256 ? `\`${c.sha256}\`` : EM_DASH,
    c.reason ?? EM_DASH,
  ]);
  return [
    mdTable(header, rows),
    '',
    `_${rot.realDefectCount} defect(s) exposed by rotated real files — real bugs, traceable to the exact ` +
      'bytes (file + sha256). These are the payoff of rotation (§12)._',
  ].join('\n');
}

/** §11 phase 2 / §12: rotated real files whose every oracle was golden-keyed → the cell is all-NA. */
function renderAllNaRotated(rot: RotationReport): string {
  if (rot.allNaRotated.length === 0) {
    return '_None — every rotated real file produced at least one admissible oracle outcome._';
  }
  const header = ['Case', 'Engine', 'Browser', 'File', 'sha256', 'Candidates'];
  const rows = rot.allNaRotated.map((c) => [
    `\`${c.scenarioId}\``,
    `\`${c.engineId}\``,
    c.browser,
    `\`${c.file}\``,
    c.sha256 ? `\`${c.sha256}\`` : EM_DASH,
    c.candidateCount === undefined ? EM_DASH : String(c.candidateCount),
  ]);
  return [
    mdTable(header, rows),
    '',
    `_${rot.allNaRotatedCount} rotated real cell(s) resolved to NA_ASSET (every oracle was golden-keyed to ` +
      'the baked fixture, so the real file produced zero admissible signal). Add a survivor oracle ' +
      '(golden-free invariant) or a per-file golden so these files can actually be scored (§7.4)._',
  ].join('\n');
}

// ── label / format helpers ───────────────────────────────────────────────────────────────────

function visibleCellMd(cell: BenchCell | undefined, conf: ConformanceCell | undefined): string {
  const status = conf?.status ?? null;
  if (status === null) return EM_DASH;
  // Wall stats: pickExecutionMs prefers the exhaustive aggregate (total across the candidate file set),
  // else the single-file median. Include whichever the cell measured so the displayed time is the total.
  const median = cell?.wallMedianMs;
  const aggregate = cell?.wallAggregateMs;
  const wall: { median?: number; aggregate?: number } = {};
  if (median !== undefined && Number.isFinite(median)) wall.median = median;
  if (aggregate !== undefined && Number.isFinite(aggregate)) wall.aggregate = aggregate;
  const hasWall = wall.median !== undefined || wall.aggregate !== undefined;
  return visibleResult({
    status,
    ...(hasWall ? { bench: { wall } } : {}),
    ...(conf?.durationMs !== undefined ? { durationMs: conf.durationMs } : {}),
    // Coverage drives the ` · passed/total` suffix on exhaustive PASS cells (absent ⇒ no suffix).
    ...(cell?.coverage ? { coverage: cell.coverage } : {}),
  });
}

function engineLabel(engineId: string): string {
  return `\`${engineId}\``;
}

/** Admissible = the cell counts toward conformance % (excludes NA_*, SKIPPED). ERROR/FAIL count. */
function isAdmissible(status: ResultStatus): boolean {
  return status === 'PASS' || status === 'FAIL' || status === 'ERROR';
}

function fmtMaybe(value: number | undefined, decimals: number): string {
  if (value === undefined || !Number.isFinite(value)) return EM_DASH;
  return fmtNum(roundTo(value, decimals));
}

function fmtBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return EM_DASH;
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${fmtNum(round2(v))} ${units[i]}`;
}

/** Number → string without trailing ".0" noise; integers stay integers. */
function fmtNum(value: number): string {
  if (!Number.isFinite(value)) return EM_DASH;
  if (Number.isInteger(value)) return String(value);
  return String(value);
}

// ── small utilities ──────────────────────────────────────────────────────────────────────────

function firstEnvSuiteVersion(results: ScenarioResult[]): string | undefined {
  for (const r of results) {
    if (r.env?.suiteVersion) return r.env.suiteVersion;
  }
  return undefined;
}

function uniqueRaw<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

/** Unique + sorted; if `first` is provided and present, it is hoisted to the front. */
function uniqueSorted(xs: string[], first?: string): string[] {
  const sorted = [...new Set(xs)].sort((a, b) => a.localeCompare(b));
  if (first && sorted.includes(first)) {
    return [first, ...sorted.filter((x) => x !== first)];
  }
  return sorted;
}

function orderBrowsers(browsers: BrowserName[]): BrowserName[] {
  const present = new Set(browsers);
  const ordered = BROWSER_ORDER.filter((b) => present.has(b));
  // include any unexpected browser names defensively (shouldn't happen given the union type)
  for (const b of browsers) if (!ordered.includes(b)) ordered.push(b);
  return ordered;
}

function mdTable(header: string[], rows: string[][]): string {
  const esc = (s: string): string => s.replace(/\|/g, '\\|');
  const head = `| ${header.map(esc).join(' | ')} |`;
  const sep = `| ${header.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.map((c) => esc(c ?? EM_DASH)).join(' | ')} |`);
  return [head, sep, ...body].join('\n');
}

function round1(value: number): number {
  return roundTo(value, 1);
}

function round2(value: number): number {
  return roundTo(value, 2);
}

function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
