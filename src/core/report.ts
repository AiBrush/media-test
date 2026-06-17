/**
 * src/core/report.ts — THE DELIVERABLE (§12): the cross-engine comparison report.
 *
 * Pure assembly: takes the flat list of ScenarioResult produced by the runner and folds it into the
 * comparison product — capability/conformance %, a conformance matrix, a benchmark matrix, the
 * Δ-vs-reference view, and a per-engine scorecard — rendered as GitHub-flavored markdown AND emitted
 * as a machine-readable JSON object. No DOM, no Node-only API: this runs in a Worker, the page, or
 * Node alike (it only builds strings + plain objects).
 *
 * Two laws are baked into the structure (§0, §13, §15):
 *   1. The comparison is the product, and every delta is "vs the reference engine, on the SAME
 *      browser, on the same corpus." Numbers are NEVER compared across browsers — the entire report
 *      is grouped by browser and deltas are only ever computed within a browser group.
 *   2. A benchmark is admissible only behind a green conformance gate; a perf number with no PASS is
 *      not reported. NA(engine) and NA(browser) are kept distinct and never collapsed.
 */

import type { BenchSummary, MetricId, ResultStatus, ScenarioResult } from './scenario.ts';
import type { BrowserName } from './engine.ts';
import { compareBench, metricHigherIsBetter, metricUnit } from './bench.ts';
import type { CompareVerdict } from './bench.ts';

export interface ReportInput {
  results: ScenarioResult[];
  referenceEngineId: string;
  suiteVersion?: string;
  generatedAtIso?: string;
}

export interface ReportOutput {
  markdown: string;
  json: ReportJson;
}

// ── machine-readable shape ───────────────────────────────────────────────────────────────────

/** Conformance delta vs reference (per scenario, within a browser). */
export type ConformanceDelta = 'gained' | 'regressed' | 'same' | 'NA';

export interface ConformanceCell {
  status: ResultStatus | null; // null = not run (—)
  reason?: string;
}

export interface BenchCell {
  /** wall-clock median/p95 in ms, when measured. */
  wallMedianMs?: number;
  wallP95Ms?: number;
  throughputRealtime?: number; // ×-realtime, median
  peakMemoryBytes?: number; // median
  longtaskMs?: number; // median
}

export interface DeltaCell {
  /** perf verdict on the primary throughput metric (within this browser, vs reference). */
  perf?: { verdict: CompareVerdict; deltaPct: number; metric: MetricId } | null;
  /** conformance movement vs reference for this scenario in this browser. */
  conformance: ConformanceDelta;
  /** human reason when conformance moved or perf is NA. */
  reason?: string;
}

export interface EngineScorecard {
  engineId: string;
  isReference: boolean;
  /** conformance % across all NON-NA (admissible) cells, all browsers. */
  conformancePct: number;
  conformancePassCount: number;
  conformanceAdmissibleCount: number;
  /** geomean of throughput ratios vs reference, per browser (only scenarios both passed). */
  perfIndexByBrowser: Partial<Record<BrowserName, number | null>>;
  /** distinct scenario families this engine produced a PASS in (capability breadth). */
  capabilityBreadth: number;
  capabilityFamilies: string[];
  /** robustness pass rate over the 'robustness' family (graceful handling / no crash-hang-OOM). */
  robustnessRate: number | null;
  robustnessPassCount: number;
  robustnessTotal: number;
}

export interface BrowserSection {
  browser: BrowserName;
  engines: string[];
  scenarios: string[];
  conformance: Record<string, Record<string, ConformanceCell>>; // [engineId][scenarioId]
  bench: Record<string, Record<string, BenchCell>>; // [engineId][scenarioId]
  deltas: Record<string, Record<string, DeltaCell>>; // [engineId][scenarioId] (reference excluded)
  conformancePctByEngine: Record<string, number>;
}

export interface ReportJson {
  suiteVersion: string;
  generatedAtIso: string;
  referenceEngineId: string;
  engines: string[];
  browsers: BrowserName[];
  scenarios: string[];
  browserSections: BrowserSection[];
  scorecards: EngineScorecard[];
  caveats: string[];
}

// ── constants ────────────────────────────────────────────────────────────────────────────────

const EM_DASH = '—';
const BROWSER_ORDER: BrowserName[] = ['chromium', 'webkit', 'firefox'];

/** Primary throughput metric used for Δ + perf index, in priority order (first present wins). */
const THROUGHPUT_METRICS: MetricId[] = ['throughputRealtime', 'decodeFps', 'encodeFps'];

/** §13 reproducibility caveats, written into every report verbatim. */
const CAVEATS: string[] = [
  'Browser numbers are INDICATIVE only. They depend on GPU, OS, drivers, and thermal state; a measurement made on one machine does not transfer to another.',
  'NEVER compare a raw number across browsers or across machines. Every delta in this report is "vs the reference engine, on the SAME browser, on the same corpus." Cross-browser comparison is invalid by construction — that is why the report is grouped by browser.',
  'Hardware codec sessions are the real parallelism ceiling, not navigator.hardwareConcurrency. Contention for a limited number of hardware decode/encode sessions can dominate timing for codec-bound workloads.',
  'No measurement → no claim. No green correctness oracle → no admissible benchmark: a perf number is reported only behind a PASS for that engine × browser × scenario. A speedup that fails conformance is a regression, not a win.',
  'NA(engine) (the engine did not declare the capability) and NA(browser) (the browser lacks the WebCodecs codec / API) are kept distinct and are never collapsed.',
  'Runs assume AC power and a quiesced machine. Differences within the noise band are reported as within-noise and are NOT claimed as improvements or regressions.',
];

// ── public entry point ───────────────────────────────────────────────────────────────────────

export function buildReport(input: ReportInput): ReportOutput {
  const suiteVersion = input.suiteVersion ?? firstEnvSuiteVersion(input.results) ?? 'dev';
  const generatedAtIso = input.generatedAtIso ?? new Date().toISOString();
  const referenceEngineId = input.referenceEngineId;

  const engines = uniqueSorted(input.results.map((r) => r.engineId), referenceEngineId);
  const browsers = orderBrowsers(uniqueRaw(input.results.map((r) => r.browser)));
  const scenarios = uniqueSorted(input.results.map((r) => r.scenarioId));

  const byKey = indexResults(input.results);

  const browserSections = browsers.map((browser) =>
    buildBrowserSection(browser, engines, scenarios, byKey, referenceEngineId),
  );

  const scorecards = engines.map((engineId) =>
    buildScorecard(engineId, engineId === referenceEngineId, browsers, scenarios, byKey, referenceEngineId),
  );

  const json: ReportJson = {
    suiteVersion,
    generatedAtIso,
    referenceEngineId,
    engines,
    browsers,
    scenarios,
    browserSections,
    scorecards,
    caveats: CAVEATS,
  };

  const markdown = renderMarkdown(json);
  return { markdown, json };
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
  referenceEngineId: string,
): BrowserSection {
  const conformance: Record<string, Record<string, ConformanceCell>> = {};
  const bench: Record<string, Record<string, BenchCell>> = {};
  const deltas: Record<string, Record<string, DeltaCell>> = {};
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
      confRow[scenarioId] = { status: r.status, ...reasonProps };
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

  // Δ-vs-reference: only for non-reference engines, only within THIS browser.
  for (const engineId of engines) {
    if (engineId === referenceEngineId) continue;
    const deltaRow: Record<string, DeltaCell> = {};
    for (const scenarioId of scenarios) {
      deltaRow[scenarioId] = computeDeltaCell(byKey, browser, referenceEngineId, engineId, scenarioId);
    }
    deltas[engineId] = deltaRow;
  }

  return {
    browser,
    engines,
    scenarios,
    conformance,
    bench,
    deltas,
    conformancePctByEngine,
  };
}

function benchCellFrom(r: ScenarioResult): BenchCell {
  // Correctness gate: a non-PASS result carries no admissible benchmark (§0.1).
  if (r.status !== 'PASS' || !r.bench) return {};
  const cell: BenchCell = {};
  const wall = r.bench.wall;
  if (wall) {
    cell.wallMedianMs = wall.median;
    cell.wallP95Ms = wall.p95;
  }
  const tput = r.bench.throughputRealtime;
  if (tput) cell.throughputRealtime = tput.median;
  const mem = r.bench.peakMemory;
  if (mem) cell.peakMemoryBytes = mem.median;
  const lt = r.bench.longtasks;
  if (lt) cell.longtaskMs = lt.median;
  return cell;
}

function computeDeltaCell(
  byKey: Map<ResultKey, ScenarioResult>,
  browser: BrowserName,
  referenceEngineId: string,
  engineId: string,
  scenarioId: string,
): DeltaCell {
  const ref = getResult(byKey, referenceEngineId, browser, scenarioId);
  const cand = getResult(byKey, engineId, browser, scenarioId);

  const conformance = conformanceDelta(ref?.status, cand?.status);

  // Perf delta is admissible only when BOTH reference and candidate PASS (correctness gate) AND
  // a shared throughput metric is present in both. Otherwise perf is NA with a reason.
  if (!ref || !cand) {
    return { perf: null, conformance, reason: !ref ? 'reference not run' : 'candidate not run' };
  }
  if (ref.status !== 'PASS' || cand.status !== 'PASS') {
    const reason =
      ref.status !== 'PASS'
        ? `reference ${ref.status.toLowerCase()} (no admissible baseline)`
        : `candidate ${cand.status.toLowerCase()} (no admissible benchmark)`;
    return { perf: null, conformance, reason };
  }

  const metric = pickSharedThroughputMetric(ref, cand);
  if (!metric) {
    return { perf: null, conformance, reason: 'no shared throughput metric measured' };
  }
  const refSummary = ref.bench?.[metric];
  const candSummary = cand.bench?.[metric];
  if (!refSummary || !candSummary) {
    return { perf: null, conformance, reason: 'no shared throughput metric measured' };
  }

  const { verdict, deltaPct } = compareBench(refSummary, candSummary, {
    higherIsBetter: metricHigherIsBetter(metric),
  });
  return { perf: { verdict, deltaPct, metric }, conformance };
}

/** First throughput metric (priority order) present in BOTH results' bench. */
function pickSharedThroughputMetric(ref: ScenarioResult, cand: ScenarioResult): MetricId | null {
  for (const m of THROUGHPUT_METRICS) {
    if (ref.bench?.[m] && cand.bench?.[m]) return m;
  }
  return null;
}

/**
 * gained  = candidate PASS where reference did NOT pass (admissible, non-NA on candidate side).
 * regressed = reference PASS where candidate did NOT pass.
 * same    = both PASS, or both equally non-pass-admissible.
 * NA      = comparison not meaningful (a side was NA / not run).
 */
function conformanceDelta(
  refStatus: ResultStatus | undefined,
  candStatus: ResultStatus | undefined,
): ConformanceDelta {
  if (refStatus === undefined || candStatus === undefined) return 'NA';
  const refNA = !isAdmissible(refStatus);
  const candNA = !isAdmissible(candStatus);
  if (refNA || candNA) return 'NA';

  const refPass = refStatus === 'PASS';
  const candPass = candStatus === 'PASS';
  if (candPass && !refPass) return 'gained';
  if (refPass && !candPass) return 'regressed';
  return 'same';
}

// ── scorecards ───────────────────────────────────────────────────────────────────────────────

function buildScorecard(
  engineId: string,
  isReference: boolean,
  browsers: BrowserName[],
  scenarios: string[],
  byKey: Map<ResultKey, ScenarioResult>,
  referenceEngineId: string,
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

  const perfIndexByBrowser: Partial<Record<BrowserName, number | null>> = {};
  for (const browser of browsers) {
    perfIndexByBrowser[browser] = isReference
      ? 1
      : perfIndexFor(engineId, referenceEngineId, browser, scenarios, byKey);
  }

  const capabilityFamilies = [...families].sort();

  return {
    engineId,
    isReference,
    conformancePct: admissible === 0 ? 0 : round1((pass / admissible) * 100),
    conformancePassCount: pass,
    conformanceAdmissibleCount: admissible,
    perfIndexByBrowser,
    capabilityBreadth: capabilityFamilies.length,
    capabilityFamilies,
    robustnessRate: robustnessTotal === 0 ? null : round1((robustnessPass / robustnessTotal) * 100),
    robustnessPassCount: robustnessPass,
    robustnessTotal,
  };
}

/**
 * Perf index = geometric mean of candidate/reference throughput ratios over every scenario where
 * BOTH engines PASS and share a throughput metric, in this browser. >1 means faster-than-reference
 * on average; <1 slower. null when there is no co-passing scenario to compare.
 */
function perfIndexFor(
  engineId: string,
  referenceEngineId: string,
  browser: BrowserName,
  scenarios: string[],
  byKey: Map<ResultKey, ScenarioResult>,
): number | null {
  let logSum = 0;
  let count = 0;
  for (const scenarioId of scenarios) {
    const ref = getResult(byKey, referenceEngineId, browser, scenarioId);
    const cand = getResult(byKey, engineId, browser, scenarioId);
    if (!ref || !cand || ref.status !== 'PASS' || cand.status !== 'PASS') continue;
    const metric = pickSharedThroughputMetric(ref, cand);
    if (!metric) continue;
    const refMed = ref.bench?.[metric]?.median;
    const candMed = cand.bench?.[metric]?.median;
    if (refMed === undefined || candMed === undefined) continue;
    if (!Number.isFinite(refMed) || !Number.isFinite(candMed) || refMed <= 0 || candMed <= 0) continue;
    logSum += Math.log(candMed / refMed);
    count++;
  }
  if (count === 0) return null;
  return round2(Math.exp(logSum / count));
}

// ── markdown rendering ───────────────────────────────────────────────────────────────────────

function renderMarkdown(json: ReportJson): string {
  const out: string[] = [];

  out.push('# Browser Media-Engine Comparison Report');
  out.push('');
  out.push(
    `Reference engine: \`${json.referenceEngineId}\` · Suite ${json.suiteVersion} · Generated ${json.generatedAtIso}`,
  );
  out.push('');
  out.push(
    `Engines: ${json.engines.map((e) => `\`${e}\``).join(', ') || EM_DASH} · ` +
      `Browsers: ${json.browsers.join(', ') || EM_DASH} · ` +
      `Scenarios: ${json.scenarios.length}`,
  );
  out.push('');
  out.push(
    'All deltas are **within a single browser, vs the reference engine, on the same corpus.** ' +
      'Numbers are never compared across browsers (see Caveats).',
  );
  out.push('');

  // 1. Capability / conformance % summary (per browser).
  out.push('## 1. Conformance Summary');
  out.push('');
  out.push(renderConformanceSummary(json));
  out.push('');
  // Legend for the dash markers used in the conformance matrix. The two NA reasons are kept
  // distinct per §15 (never collapsed): the engine doesn't support the feature vs the browser can't.
  out.push(
    '> **Cell legend:** `PASS` / `FAIL` / `ERROR` / `SKIPPED` are conformance outcomes. ' +
      '`-` = feature not supported by that engine (NA·engine — the feature still lives in the suite, ' +
      'only this cell is skipped). `-ᵇ` = supported by the engine but the browser lacks the codec/API ' +
      '(NA·browser). `—` = not run.',
  );
  out.push('');

  // Per-browser groups: conformance matrix, benchmark matrix, Δ-vs-reference.
  for (const section of json.browserSections) {
    out.push(`## Browser: ${section.browser}`);
    out.push('');

    out.push('### 2. Conformance matrix');
    out.push('');
    out.push(renderConformanceMatrix(section));
    out.push('');
    out.push(renderReasonNotes(section));

    out.push('### 3. Benchmark matrix');
    out.push('');
    out.push(
      '_Indicative for this browser only. Cells without a green conformance gate are blank (—)._',
    );
    out.push('');
    out.push(renderBenchMatrix(section));
    out.push('');

    out.push(`### 4. Δ vs reference (\`${json.referenceEngineId}\`)`);
    out.push('');
    out.push(renderDeltaMatrix(section, json.referenceEngineId));
    out.push('');
  }

  // 5. Per-engine scorecard (cross-browser layout, but perf index is per-browser).
  out.push('## 5. Per-engine scorecard');
  out.push('');
  out.push(renderScorecards(json));
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
    rows.push([engineLabel(engineId, json.referenceEngineId), ...cells]);
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
      return cell ? statusLabel(cell.status) : EM_DASH;
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
      notes.push(`- \`${engineId}\` · \`${scenarioId}\` — **${statusLabel(cell.status)}**: ${cell.reason}`);
    }
  }
  if (notes.length === 0) return '';
  return ['<details><summary>Reasons (FAIL / NA / ERROR)</summary>', '', ...notes, '', '</details>', ''].join(
    '\n',
  );
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

function renderDeltaMatrix(section: BrowserSection, referenceEngineId: string): string {
  const candidates = section.engines.filter((e) => e !== referenceEngineId);
  if (candidates.length === 0) {
    return '_Only the reference engine present in this browser; no deltas to compute._';
  }
  const header = ['Scenario', ...candidates.flatMap((e) => [`${e} perf`, `${e} conf`])];
  const rows: string[][] = [];
  for (const scenarioId of section.scenarios) {
    const cells: string[] = [];
    for (const engineId of candidates) {
      const d = section.deltas[engineId]?.[scenarioId];
      cells.push(perfDeltaLabel(d));
      cells.push(conformanceDeltaLabel(d?.conformance));
    }
    rows.push([`\`${scenarioId}\``, ...cells]);
  }
  return mdTable(header, rows);
}

function renderScorecards(json: ReportJson): string {
  if (json.scorecards.length === 0) return '_No engines._';
  const header = [
    'Engine',
    'Conformance %',
    'PASS / admissible',
    ...json.browsers.map((b) => `Perf idx (${b})`),
    'Capability breadth',
    'Robustness %',
  ];
  const rows: string[][] = [];
  for (const sc of json.scorecards) {
    const perfCells = json.browsers.map((b) => {
      if (sc.isReference) return '1.00× (ref)';
      const idx = sc.perfIndexByBrowser[b];
      return idx === undefined || idx === null ? EM_DASH : `${fmtNum(idx)}×`;
    });
    rows.push([
      engineLabel(sc.engineId, json.referenceEngineId),
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
    '_Perf index = geometric mean of throughput ratios vs reference, per browser, over co-passing scenarios. >1.00× = faster than reference on average; null/— = no co-passing scenario to compare._',
  ].join('\n');
}

// ── label / format helpers ───────────────────────────────────────────────────────────────────

function statusLabel(status: ResultStatus | null): string {
  switch (status) {
    case 'PASS':
      return 'PASS';
    case 'FAIL':
      return 'FAIL';
    // Missing-feature cells render as a dash (per user preference) but stay DISTINGUISHABLE per §15:
    // '-' = engine does not support the feature; '-ᵇ' = browser lacks the codec/API. See legend.
    case 'NA_ENGINE':
      return '-';
    case 'NA_BROWSER':
      return '-ᵇ';
    case 'ERROR':
      return 'ERROR';
    case 'SKIPPED':
      return 'SKIPPED';
    case null:
    default:
      return EM_DASH;
  }
}

function perfDeltaLabel(d: DeltaCell | undefined): string {
  if (!d || d.perf === undefined || d.perf === null) {
    return d?.reason ? `NA` : 'NA';
  }
  const { verdict, deltaPct } = d.perf;
  const sign = deltaPct > 0 ? '+' : '';
  // deltaPct is normalized so positive == better.
  if (verdict === 'within-noise') return `within-noise (${sign}${fmtNum(deltaPct)}%)`;
  if (verdict === 'faster') return `faster (${sign}${fmtNum(deltaPct)}%)`;
  return `slower (${sign}${fmtNum(deltaPct)}%)`;
}

function conformanceDeltaLabel(d: ConformanceDelta | undefined): string {
  switch (d) {
    case 'gained':
      return 'gained';
    case 'regressed':
      return 'regressed';
    case 'same':
      return 'same';
    case 'NA':
    case undefined:
    default:
      return 'NA';
  }
}

function engineLabel(engineId: string, referenceEngineId: string): string {
  return engineId === referenceEngineId ? `\`${engineId}\` (ref)` : `\`${engineId}\``;
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
