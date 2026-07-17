/**
 * Lossless correctness/fairness reporting entry point.
 *
 * All consumers share the pure reporting modules re-exported below. buildReport is intentionally a
 * compatibility wrapper: callers still provide ScenarioResult[], while the returned JSON now retains the
 * normalized evidence, expected set, cohort decisions, exact denominators, and rank eligibility used to
 * render Markdown.
 */

import type { BrowserName } from './engine.ts';
import type { MetricId, ResultStatus, ScenarioResult } from './scenario.ts';
import { canonicalContentHash, stablePrettyJson } from './reporting/canonical.ts';
import type {
  BundleJoinResult,
  BundleMeasurementsArtifact,
} from './reporting/bundle.ts';
import { expectedCellKey } from './reporting/normalize.ts';
import { reduceSelectedExpectedCell, runReportingPipeline } from './reporting/pipeline.ts';
import { scoreSummaryFromCounts, sumStateCounts } from './reporting/reducer.ts';
import type {
  AvailableMetricObservation,
  CellGrade,
  CohortReport,
  ExpectedMatrixDefinition,
  JsonObject,
  JsonValue,
  MetricAggregation,
  MetricObservation,
  NormalizedObservation,
  RankingDecision,
  ReducedCell,
  ReportingNormalizationContext,
  ReportingPolicy,
  ScoreSummary,
  StateCounts,
} from './reporting/model.ts';
import { REPORT_SCHEMA_ID, REPORTING_SCHEMA_VERSION, validateReportArtifact } from './reporting/schemas.ts';
import { aggregatePerformanceQuestionIds } from '../features/performance/catalog.ts';

export * from './reporting/model.ts';
export * from './reporting/canonical.ts';
export * from './reporting/schemas.ts';
export * from './reporting/metrics.ts';
export * from './reporting/normalize.ts';
export * from './reporting/reducer.ts';
export * from './reporting/ranking.ts';
export * from './reporting/pipeline.ts';
export * from './reporting/bundle.ts';

export interface ReportInput {
  results: readonly ScenarioResult[];
  suiteVersion?: string;
  generatedAtIso?: string;
  expected?: ExpectedMatrixDefinition;
  contextForResult?: (result: ScenarioResult, index: number) => ReportingNormalizationContext | undefined;
  dedupePolicy?: 'strict' | 'latest';
  policy?: Partial<ReportingPolicy>;
  /** Optional already-validated build artifact and exact join decisions, retained losslessly. */
  bundleArtifact?: BundleMeasurementsArtifact;
  bundleJoins?: Record<string, BundleJoinResult>;
}

export interface ReportOutput {
  markdown: string;
  json: ReportJson;
}

export interface ReportEnvelope {
  generatedAtIso: string;
}

/** Compact convenience projection; `observations` and `cohorts` remain the authoritative evidence. */
export interface ConformanceCell {
  status: ResultStatus | null;
  grade: CellGrade;
  label: string;
  counts: StateCounts;
  reason?: string;
  variants: ReducedCell['variants'];
  cohortIds: string[];
}

export interface BenchCell {
  primaryMetric?: MetricId;
  primaryValue?: number;
  primaryValueMedian?: number;
  primaryUnit?: string;
  aggregation?: MetricAggregation;
  sampleAxis?: AvailableMetricObservation['sampleAxis'];
  n?: number;
  mad?: number;
  noiseBandPct?: number;
  confidenceInterval?: AvailableMetricObservation['confidenceInterval'];
  wallDiagnostic?: MetricObservation;
  coverage?: { valid: number; total: number };
  eligibility?: string;
}

export interface CaseWinner {
  scenarioId: string;
  family: string;
  primaryMetric: MetricId | null;
  winner: string | null;
  winnerValue: number | null;
  runnerUp: string | null;
  runnerUpValue: number | null;
  marginPct: number | null;
  flag: 'contested' | 'tie' | 'uncontested' | 'none' | 'unresolved';
  eligible: string[];
  coWinners: string[];
  cohortId?: string;
  reasons: string[];
}

export interface BrowserSection {
  browser: BrowserName;
  engines: string[];
  scenarios: string[];
  conformance: Record<string, Record<string, ConformanceCell>>;
  bench: Record<string, Record<string, BenchCell>>;
  conformancePctByEngine: Record<string, number | null>;
  winners: CaseWinner[];
}

export interface EngineScorecard extends ScoreSummary {
  engineId: string;
  conformancePct: number | null;
  conformancePassCount: number;
  conformanceAdmissibleCount: number;
  capabilityBreadth: number;
  capabilityFamilies: string[];
  robustnessRate: number | null;
  robustnessPassCount: number;
  robustnessTotal: number;
  wins: number;
  winsByBrowser: Partial<Record<BrowserName, number>>;
  uncontestedWins: number;
  perfIndexVsWinnerByBrowser: Partial<Record<BrowserName, number | null>>;
  bundleSizeKb: number | null;
  verdict: string;
}

export interface ReportJson {
  schemaId: string;
  schemaVersion: string;
  suiteVersion: string;
  contentHash: string;
  envelope: ReportEnvelope;
  policy: ReportingPolicy;
  expected: ExpectedMatrixDefinition;
  observations: NormalizedObservation[];
  cohorts: CohortReport[];
  deduplication: { discarded: ReturnType<typeof runReportingPipeline>['discarded'] };
  engines: string[];
  browsers: BrowserName[];
  scenarios: string[];
  browserSections: BrowserSection[];
  scorecards: EngineScorecard[];
  caveats: string[];
  corpusChecksums: string[];
  rotation: {
    realCellCount: number;
    bakedCellCount: number;
    allNaRotatedCount: number;
    realDefectCount: number;
  };
  bundle?: {
    artifact: BundleMeasurementsArtifact;
    joins: Record<string, BundleJoinResult>;
  };
}

const CAVEATS = [
  'Correctness is binary and gates performance: only PASS (a semantically-correct output) is valid; FAIL is a wrong output, while ERROR is execution reliability and never enters an oracle-correctness denominator.',
  'A representationally-different-but-correct output (codec spelling, estimate-only duration, raw-vs-presentation view, track reordering) is a PASS; the difference is recorded in the oracle reasonCode/detail, not as a separate verdict.',
  'NA_ENGINE, NA_BROWSER, NA_ASSET, SKIPPED, and not-run remain distinct in JSON and detailed Markdown; compact cells may render all NA subtypes as N/A.',
  'Cross-engine winners are emitted only inside a complete normalized cohort with the same expected inputs and metric protocol. Split cohorts are explicitly not comparable.',
  'Browser performance is host/build/configuration specific. Never compare raw values across cohorts or browsers.',
];

export function buildReport(input: ReportInput): ReportOutput {
  const pipeline = runReportingPipeline({
    results: input.results,
    ...(input.suiteVersion ? { suiteVersion: input.suiteVersion } : {}),
    ...(input.generatedAtIso ? { generatedAtIso: input.generatedAtIso } : {}),
    ...(input.expected ? { expected: input.expected } : {}),
    ...(input.contextForResult ? { contextForResult: input.contextForResult } : {}),
    ...(input.dedupePolicy ? { dedupePolicy: input.dedupePolicy } : {}),
    ...(input.policy ? { policy: input.policy } : {}),
  });
  const axes = reportAxes(pipeline.expected);
  const globalCells = buildGlobalCells(pipeline.expected, pipeline.observations);
  const browserSections = buildBrowserSections(axes, globalCells, pipeline.cohorts);
  const scorecards = buildScorecards(axes, globalCells, pipeline.cohorts);
  const corpusChecksums = [...new Set(pipeline.observations
    .map((observation) => observation.environment.corpusChecksum)
    .filter((value): value is string => typeof value === 'string' && value.length > 0))].sort();
  const rotation = buildRotationProjection(globalCells);
  const data = {
    schemaId: REPORT_SCHEMA_ID,
    schemaVersion: REPORTING_SCHEMA_VERSION,
    suiteVersion: pipeline.suiteVersion,
    policy: pipeline.policy,
    expected: pipeline.expected,
    observations: pipeline.observations,
    cohorts: pipeline.cohorts,
    deduplication: { discarded: pipeline.discarded },
    engines: axes.engines,
    browsers: axes.browsers,
    scenarios: axes.scenarios,
    browserSections,
    scorecards,
    caveats: CAVEATS.slice(),
    corpusChecksums,
    rotation,
    ...(input.bundleArtifact
      ? { bundle: { artifact: input.bundleArtifact, joins: sortRecord(input.bundleJoins ?? {}) } }
      : {}),
  };
  const json: ReportJson = {
    ...data,
    contentHash: canonicalContentHash(data),
    envelope: { generatedAtIso: pipeline.generatedAtIso },
  };
  validateReportArtifact(json);
  return { json, markdown: renderReportMarkdown(json) };
}

export function serializeReportJson(json: ReportJson): string {
  validateReportArtifact(json);
  return stablePrettyJson(json);
}

export function renderReportMarkdown(json: ReportJson): string {
  validateReportArtifact(json);
  const out: string[] = [
    '# Browser Media-Engine Correctness & Benchmark Report',
    '',
    `Suite ${escapeInline(json.suiteVersion)} · data schema ${json.schemaVersion} · generated ${json.envelope.generatedAtIso}`,
    '',
    `Content hash: \`${json.contentHash}\``,
    '',
    '## Overall evidence counts',
    '',
    renderScorecards(json.scorecards),
    '',
  ];
  if (json.deduplication.discarded.length > 0) {
    out.push('## Deduplication decisions', '', renderDedupe(json), '');
  }
  for (const cohort of json.cohorts) {
    out.push(...renderCohort(cohort));
  }
  if (json.bundle) out.push(...renderBundle(json.bundle));
  out.push('## Reporting rules', '');
  for (const caveat of json.caveats) out.push(`- ${caveat}`);
  out.push('');
  return out.join('\n');
}

function buildGlobalCells(
  expected: ExpectedMatrixDefinition,
  observations: readonly NormalizedObservation[],
): ReducedCell[] {
  const byCell = new Map<string, NormalizedObservation[]>();
  for (const observation of observations) {
    const key = expectedCellKey(observation.engineId, observation.browser, observation.scenarioId);
    const group = byCell.get(key) ?? [];
    group.push(observation);
    byCell.set(key, group);
  }
  return expected.cells.map((cell) => reduceSelectedExpectedCell(
    cell,
    byCell.get(expectedCellKey(cell.engineId, cell.browser, cell.scenarioId)) ?? [],
  ));
}

function buildBrowserSections(
  axes: ReturnType<typeof reportAxes>,
  cells: readonly ReducedCell[],
  cohorts: readonly CohortReport[],
): BrowserSection[] {
  return axes.browsers.map((browser) => {
    const conformance: BrowserSection['conformance'] = {};
    const bench: BrowserSection['bench'] = {};
    const conformancePctByEngine: BrowserSection['conformancePctByEngine'] = {};
    for (const engineId of axes.engines) {
      conformance[engineId] = {};
      bench[engineId] = {};
      const engineCells = cells.filter((cell) => cell.browser === browser && cell.engineId === engineId);
      const counts = sumStateCounts(engineCells.map((cell) => cell.counts));
      conformancePctByEngine[engineId] = scoreSummaryFromCounts(counts).correctness.value === null
        ? null
        : scoreSummaryFromCounts(counts).correctness.value! * 100;
      for (const scenarioId of axes.scenarios) {
        const cell = engineCells.find((entry) => entry.scenarioId === scenarioId);
        if (!cell) continue;
        const cohortIds = cohorts
          .filter((cohort) => cohort.cells.some((entry) => entry.cellId === cell.cellId))
          .map((cohort) => cohort.cohortId)
          .sort();
        conformance[engineId]![scenarioId] = {
          status: legacyStatus(cell),
          grade: cell.grade,
          label: cell.label,
          counts: cell.counts,
          ...(cell.exclusionReasons.length > 0 ? { reason: cell.exclusionReasons.join('; ') } : {}),
          variants: cell.variants,
          cohortIds,
        };
        bench[engineId]![scenarioId] = projectBenchCell(cell, cohorts);
      }
    }
    const decisions = cohorts
      .flatMap((cohort) => cohort.rankings)
      .filter((decision) => decision.browser === browser);
    return {
      browser,
      engines: axes.engines.slice(),
      scenarios: axes.scenarios.slice(),
      conformance,
      bench,
      conformancePctByEngine,
      winners: axes.scenarios.map((scenarioId) => projectWinner(
        scenarioId,
        cells.find((cell) => cell.browser === browser && cell.scenarioId === scenarioId)?.family ?? scenarioId.split('/')[0] ?? '',
        decisions.filter((decision) => decision.scenarioId === scenarioId),
      )),
    };
  });
}

function buildScorecards(
  axes: ReturnType<typeof reportAxes>,
  cells: readonly ReducedCell[],
  cohorts: readonly CohortReport[],
): EngineScorecard[] {
  const aggregatePerformanceIds = new Set(aggregatePerformanceQuestionIds());
  const clearWins = cohorts.flatMap((cohort) => cohort.rankings).filter((ranking) =>
    ranking.flag === 'winner' && ranking.winner &&
    (!ranking.scenarioId.startsWith('performance/') || aggregatePerformanceIds.has(ranking.scenarioId)));
  return axes.engines.map((engineId) => {
    const engineCells = cells.filter((cell) => cell.engineId === engineId);
    const counts = sumStateCounts(engineCells.map((cell) => cell.counts));
    const summary = scoreSummaryFromCounts(counts);
    const validFamilies = [...new Set(engineCells.filter((cell) => cell.counts.valid > 0).map((cell) => cell.family))].sort();
    const robustness = engineCells.filter((cell) => cell.family === 'robustness');
    const robustnessCounts = sumStateCounts(robustness.map((cell) => cell.counts));
    const robustnessRate = scoreSummaryFromCounts(robustnessCounts).correctness.value;
    const winsByBrowser: Partial<Record<BrowserName, number>> = {};
    for (const browser of axes.browsers) winsByBrowser[browser] = clearWins.filter((win) => win.browser === browser && win.winner === engineId).length;
    const bundle = engineCells
      .flatMap((cell) => cell.metrics)
      .find((metric) => metric.metric === 'bundleSize' && metric.state === 'AVAILABLE');
    const wins = clearWins.filter((win) => win.winner === engineId).length;
    return {
      engineId,
      ...summary,
      conformancePct: summary.correctness.value === null ? null : summary.correctness.value * 100,
      conformancePassCount: counts.pass,
      conformanceAdmissibleCount: counts.pass + counts.failed,
      capabilityBreadth: validFamilies.length,
      capabilityFamilies: validFamilies,
      robustnessRate: robustnessRate === null ? null : robustnessRate * 100,
      robustnessPassCount: robustnessCounts.valid,
      robustnessTotal: robustnessCounts.oracleEvaluable,
      wins,
      winsByBrowser,
      uncontestedWins: 0,
      perfIndexVsWinnerByBrowser: Object.fromEntries(axes.browsers.map((browser) => [browser, null])),
      bundleSizeKb: bundle?.state === 'AVAILABLE' ? bundle.rankedValue / 1024 : null,
      verdict: `${formatPercent(summary.correctness.value)} correct · ${counts.valid}/${counts.expected} valid/expected · ${wins} clear cohort win${wins === 1 ? '' : 's'}`,
    };
  });
}

function projectBenchCell(cell: ReducedCell, cohorts: readonly CohortReport[]): BenchCell {
  const decisions = cohorts.flatMap((cohort) => cohort.rankings)
    .filter((decision) => decision.browser === cell.browser && decision.scenarioId === cell.scenarioId);
  const contender = decisions.flatMap((decision) => decision.contenders)
    .find((entry) => entry.engineId === cell.engineId && entry.observation?.state === 'AVAILABLE');
  const selected = contender?.observation?.state === 'AVAILABLE'
    ? contender.observation
    : firstAvailableMetric(cell);
  const wall = cell.metrics.find((metric) => metric.metric === 'wall');
  return {
    ...(selected ? {
      primaryMetric: selected.metric,
      primaryValue: selected.rankedValue,
      primaryValueMedian: selected.median,
      primaryUnit: selected.unit,
      aggregation: selected.aggregation,
      sampleAxis: selected.sampleAxis,
      n: selected.n,
      mad: selected.mad,
      noiseBandPct: selected.empiricalNoisePct,
      confidenceInterval: selected.confidenceInterval,
    } : {}),
    ...(wall ? { wallDiagnostic: wall } : {}),
    coverage: { valid: cell.counts.valid, total: cell.counts.expected },
    eligibility: contender?.eligibilityReason ?? (cell.exclusionReasons.join('; ') || 'descriptive only'),
  };
}

function projectWinner(scenarioId: string, family: string, decisions: readonly RankingDecision[]): CaseWinner {
  const comparable = decisions.filter((decision) => decision.comparable);
  if (comparable.length !== 1) {
    return {
      scenarioId,
      family,
      primaryMetric: null,
      winner: null,
      winnerValue: null,
      runnerUp: null,
      runnerUpValue: null,
      marginPct: null,
      flag: comparable.length > 1 ? 'unresolved' : 'none',
      eligible: [],
      coWinners: [],
      reasons: comparable.length > 1 ? ['scenario split across multiple comparable cohorts'] : ['no complete comparable cohort'],
    };
  }
  const decision = comparable[0]!;
  return {
    scenarioId,
    family,
    primaryMetric: decision.primaryMetric,
    winner: decision.winner,
    winnerValue: decision.winnerValue,
    runnerUp: decision.runnerUp,
    runnerUpValue: decision.runnerUpValue,
    marginPct: relativeMargin(decision),
    flag: decision.flag === 'winner' ? 'contested' : decision.flag === 'tie' ? 'tie' : decision.flag === 'unresolved' ? 'unresolved' : 'none',
    eligible: decision.contenders.filter((entry) => entry.eligibility === 'ELIGIBLE').map((entry) => entry.engineId).sort(),
    coWinners: decision.coWinners,
    cohortId: decision.cohortId,
    reasons: decision.reasons,
  };
}

function renderScorecards(scorecards: readonly EngineScorecard[]): string {
  const header = [
    'Engine', 'expected', 'observed', 'executed', 'oracle-evaluable', 'valid', 'PASS', 'FAIL',
    'ERROR', 'NA_ENGINE', 'NA_BROWSER', 'NA_ASSET', 'SKIPPED', 'not-run', 'correctness', 'exact',
  ];
  const rows = scorecards.map((score) => [
    `\`${score.engineId}\``,
    ...countsCells(score.counts),
    formatPercent(score.correctness.value),
    formatPercent(score.exactMatch.value),
  ]);
  return mdTable(header, rows);
}

function renderCohort(cohort: CohortReport): string[] {
  const out = [
    `## Cohort \`${cohort.cohortId}\``,
    '',
    `Comparability: **${cohort.comparisonLabel === 'COMPARABLE' ? 'comparable' : 'not comparable'}**`,
    '',
  ];
  if (cohort.missingDimensions.length > 0) {
    out.push(`Missing dimensions: ${cohort.missingDimensions.map((field) => `\`${field}\``).join(', ')}`, '');
  }
  if (cohort.exclusionReasons.length > 0) {
    out.push(`Exclusions: ${cohort.exclusionReasons.map((reason) => `\`${escapeInline(reason)}\``).join(', ')}`, '');
  }
  out.push('### Denominators', '');
  out.push(mdTable(
    ['Engine', 'expected', 'observed', 'executed', 'oracle-evaluable', 'valid', 'PASS', 'FAIL', 'ERROR', 'NA_ENGINE', 'NA_BROWSER', 'NA_ASSET', 'SKIPPED', 'not-run', 'correctness', 'exact'],
    cohort.engineSummaries.map((summary) => [
      `\`${summary.engineId}\``,
      ...countsCells(summary.counts),
      formatPercent(summary.correctness.value),
      formatPercent(summary.exactMatch.value),
    ]),
  ));
  out.push('', '### Exact ranked values', '');
  const decision = cohort.rankings[0];
  out.push(renderCohortCells(cohort.cells, decision));
  out.push('', '### Variant evidence', '');
  out.push(renderVariantEvidence(cohort.cells));
  out.push('');
  return out;
}

function renderCohortCells(cells: readonly ReducedCell[], decision: RankingDecision | undefined): string {
  return mdTable(
    ['Engine', 'Verdict / coverage', 'Primary ranked value', 'Wall diagnostic', 'Eligibility'],
    cells.map((cell) => {
      const contender = decision?.contenders.find((entry) => entry.engineId === cell.engineId);
      const selected = contender?.observation?.state === 'AVAILABLE' ? contender.observation : firstAvailableMetric(cell);
      const failed = cell.failedVariantIds.length > 0 ? ` · failing: ${cell.failedVariantIds.join(', ')}` : '';
      return [
        `\`${cell.engineId}\``,
        `${cell.label} · ${cell.counts.valid}/${cell.counts.expected}${failed}`,
        selected ? formatMetric(selected) : unavailableMetricReason(cell),
        formatWallDiagnostic(cell),
        contender ? `${contender.eligibility}: ${contender.eligibilityReason}` : 'NOT_COMPARABLE: no ranking decision',
      ];
    }),
  );
}

function renderVariantEvidence(cells: readonly ReducedCell[]): string {
  const rows: string[][] = [];
  for (const cell of cells) {
    for (const variant of cell.variants) {
      const observed = variant.observation;
      const oracle = observed
        ? observed.oracleOutcomes.map(renderOracleOutcome).join('; ') || '—'
        : '—';
      const candidateEvidence = renderCandidateEvidence(observed?.candidateEvidence);
      rows.push([
        `\`${cell.engineId}\``,
        `\`${variant.expected.file}\``,
        variant.expected.sha256 ? `\`${variant.expected.sha256}\`` : '—',
        observed?.execution ?? 'NOT_RUN',
        observed?.verdict ?? '—',
        observed?.reasonCode ?? '—',
        observed?.reason ?? '—',
        oracle,
        candidateEvidence,
      ]);
    }
  }
  return mdTable(
    ['Engine', 'Variant', 'sha256', 'Execution', 'Oracle verdict', 'Reason code', 'Reason', 'Oracle evidence', 'Candidate sufficiency'],
    rows,
  );
}

function renderCandidateEvidence(value: JsonObject | undefined): string {
  if (!value) return '—';
  const list = (field: JsonValue | undefined): string =>
    Array.isArray(field) ? field.map((entry) => typeof entry === 'string' ? entry : JSON.stringify(entry)).join(', ') || 'none' : 'none';
  const unavailable = Array.isArray(value.unavailable)
    ? value.unavailable.map((entry) => {
        if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return JSON.stringify(entry);
        const oracle = typeof entry.oracle === 'string' ? entry.oracle : 'oracle';
        const status = typeof entry.status === 'string' ? entry.status : 'unavailable';
        const reason = typeof entry.reasonCode === 'string' ? entry.reasonCode : 'unspecified';
        return `${oracle}:${status}[${reason}]`;
      }).join(', ') || 'none'
    : 'none';
  return `required=${list(value.required)}; applied=${list(value.applied)}; unavailable=${unavailable}; ` +
    `sufficient=${value.sufficient === true ? 'yes' : 'no'} (${list(value.sufficientSurvivorOracles)})`;
}

function renderOracleOutcome(value: JsonValue): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return JSON.stringify(value);
  const oracle = typeof value.oracle === 'string' ? value.oracle : 'oracle';
  const state = typeof value.state === 'string' ? value.state : '';
  const verdict = typeof value.verdict === 'string' ? value.verdict : typeof value.status === 'string' ? value.status : '';
  const reason = typeof value.reasonCode === 'string' ? ` [${value.reasonCode}]` : '';
  return `${oracle}:${state}${verdict ? `/${verdict}` : ''}${reason}`;
}

function renderDedupe(json: ReportJson): string {
  return mdTable(
    ['Identity', 'Kept', 'Discarded', 'Reason'],
    json.deduplication.discarded.map((entry) => [
      `\`${entry.identity}\``,
      `\`${entry.keptObservationId}\` / \`${entry.keptContentHash}\``,
      `\`${entry.discardedObservationId}\` / \`${entry.discardedContentHash}\``,
      entry.reason,
    ]),
  );
}

function renderBundle(bundle: NonNullable<ReportJson['bundle']>): string[] {
  const rows = bundle.artifact.measurements.map((measurement) => [
    `\`${measurement.engineId}\``,
    measurement.engineVersion,
    measurement.state,
    measurement.state === 'MEASURED' ? `${measurement.compressedBytes} byte` : '—',
    measurement.state === 'MEASURED' ? measurement.excludedRuntimeAssets.join(', ') || 'none' : measurement.reason,
  ]);
  return [
    '## Bundle-measurement cohort',
    '',
    `Artifact \`${bundle.artifact.contentHash}\`; bundler \`${bundle.artifact.measurementDefinition.bundler.name}@${bundle.artifact.measurementDefinition.bundler.version}\`; compression \`${bundle.artifact.measurementDefinition.compression.algorithm}\`.`,
    '',
    mdTable(['Engine', 'Version', 'State', 'Compressed', 'Excluded runtime assets / reason'], rows),
    '',
  ];
}

function reportAxes(expected: ExpectedMatrixDefinition): { engines: string[]; browsers: BrowserName[]; scenarios: string[] } {
  return {
    engines: [...new Set(expected.cells.map((cell) => cell.engineId))].sort(),
    browsers: [...new Set(expected.cells.map((cell) => cell.browser))].sort(),
    scenarios: [...new Set(expected.cells.map((cell) => cell.scenarioId))].sort(),
  };
}

function firstAvailableMetric(cell: ReducedCell): AvailableMetricObservation | undefined {
  const declared = cell.observations.find((observation) => observation.primaryMetric)?.primaryMetric;
  const selected = declared ? cell.metrics.find((metric) => metric.metric === declared && metric.state === 'AVAILABLE') : undefined;
  return selected?.state === 'AVAILABLE'
    ? selected
    : cell.metrics.find((metric): metric is AvailableMetricObservation => metric.state === 'AVAILABLE' && metric.metric !== 'wall')
      ?? cell.metrics.find((metric): metric is AvailableMetricObservation => metric.state === 'AVAILABLE');
}

function formatMetric(metric: AvailableMetricObservation): string {
  const ci = metric.confidenceInterval;
  return `${formatNumber(metric.rankedValue)} ${metric.unit} (${metric.aggregation}, ${metric.sampleAxis}; `
    + `n=${metric.n}, MAD=${formatNumber(metric.mad)}, band=${formatNumber(metric.empiricalNoisePct)}%, `
    + `CI ${formatNumber(ci.low)}–${formatNumber(ci.high)} ${ci.method})`;
}

function formatWallDiagnostic(cell: ReducedCell): string {
  const wall = cell.metrics.find((metric): metric is AvailableMetricObservation => metric.metric === 'wall' && metric.state === 'AVAILABLE');
  return wall ? `${formatNumber(wall.rankedValue)} ${wall.unit} (${wall.aggregation}; n=${wall.n})` : '—';
}

function unavailableMetricReason(cell: ReducedCell): string {
  const unavailable = cell.metrics.find((metric) => metric.state === 'UNAVAILABLE');
  return unavailable?.state === 'UNAVAILABLE' ? `— (${unavailable.reasonCode}${unavailable.reason ? `: ${unavailable.reason}` : ''})` : '—';
}

function countsCells(counts: StateCounts): string[] {
  return [
    counts.expected,
    counts.observed,
    counts.executed,
    counts.oracleEvaluable,
    counts.valid,
    counts.pass,
    counts.failed,
    counts.errors,
    counts.naEngine,
    counts.naBrowser,
    counts.naAsset,
    counts.skipped,
    counts.notRun,
  ].map(String);
}

function formatPercent(value: number | null): string {
  return value === null ? '—' : `${formatNumber(value * 100)}%`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return Number(value.toPrecision(7)).toString();
}

function mdTable(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const head = `| ${header.map(escapeMdCell).join(' | ')} |`;
  const divider = `| ${header.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.map((cell) => escapeMdCell(cell ?? '—')).join(' | ')} |`);
  return [head, divider, ...body].join('\n');
}

export function escapeMdCell(value: string): string {
  return value.replace(/\r\n|\r|\n/g, '<br>').replace(/\|/g, '\\|');
}

function escapeInline(value: string): string {
  return value.replace(/`/g, '\\`').replace(/\r\n|\r|\n/g, ' ');
}

function legacyStatus(cell: ReducedCell): ResultStatus | null {
  if (cell.grade === 'NOT_RUN') return null;
  if (cell.grade === 'NA') {
    if (cell.counts.naEngine > 0 && cell.counts.naBrowser === 0 && cell.counts.naAsset === 0) return 'NA_ENGINE';
    if (cell.counts.naBrowser > 0 && cell.counts.naEngine === 0 && cell.counts.naAsset === 0) return 'NA_BROWSER';
    if (cell.counts.naAsset > 0 && cell.counts.naEngine === 0 && cell.counts.naBrowser === 0) return 'NA_ASSET';
    return 'NA_ENGINE';
  }
  if (cell.grade === 'PARTIAL') return cell.counts.failed > 0 ? 'FAIL' : 'PASS';
  return cell.grade;
}

function relativeMargin(decision: RankingDecision): number | null {
  if (decision.winnerValue === null || decision.runnerUpValue === null || decision.runnerUpValue === 0) return null;
  const contender = decision.contenders.find((entry) => entry.engineId === decision.winner);
  const direction = contender?.observation?.state === 'AVAILABLE' ? contender.observation.direction : undefined;
  if (!direction) return null;
  const raw = ((decision.winnerValue - decision.runnerUpValue) / Math.abs(decision.runnerUpValue)) * 100;
  return direction === 'higher' ? raw : -raw;
}

function buildRotationProjection(cells: readonly ReducedCell[]): ReportJson['rotation'] {
  let realCellCount = 0;
  let bakedCellCount = 0;
  let allNaRotatedCount = 0;
  let realDefectCount = 0;
  for (const cell of cells) {
    const hasReal = cell.variants.some((variant) => variant.observation?.isBaked === false);
    if (hasReal) realCellCount++;
    else bakedCellCount++;
    if (hasReal && cell.grade === 'NA' && cell.counts.naAsset > 0) allNaRotatedCount++;
    if (hasReal && (cell.grade === 'FAIL' || cell.grade === 'ERROR' || cell.failedVariantIds.length > 0)) realDefectCount++;
  }
  return { realCellCount, bakedCellCount, allNaRotatedCount, realDefectCount };
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}
