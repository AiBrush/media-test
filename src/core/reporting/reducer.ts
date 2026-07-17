import type { MetricId } from '../scenario.ts';
import { canonicalJson } from './canonical.ts';
import { metricSortKey, normalizeMetricObservation, summarizeMetricAcrossVariants } from './metrics.ts';
import type {
  ExpectedCellDefinition,
  MetricObservation,
  NormalizedObservation,
  RateSummary,
  ReducedCell,
  ReducedVariant,
  ScoreSummary,
  StateCounts,
  VariantObservation,
} from './model.ts';

/** Order-independent cell reduction over the already-declared expected variant set. */
export function reduceExpectedCell(
  expected: ExpectedCellDefinition,
  observations: readonly NormalizedObservation[],
): ReducedCell {
  const sortedObservations = observations.slice().sort((a, b) =>
    a.observationId.localeCompare(b.observationId) || a.contentHash.localeCompare(b.contentHash));
  const observedByVariant = new Map<string, VariantObservation[]>();
  const exclusionReasons = sortedObservations.flatMap((observation) => observation.exclusionReasons);
  for (const observation of sortedObservations) {
    for (const variant of observation.variants) {
      const list = observedByVariant.get(variant.variantId) ?? [];
      list.push(variant);
      observedByVariant.set(variant.variantId, list);
    }
  }
  const expectedIds = new Set(expected.variants.map((variant) => variant.variantId));
  for (const variantId of observedByVariant.keys()) {
    if (!expectedIds.has(variantId)) exclusionReasons.push(`UNEXPECTED_VARIANT:${variantId}`);
  }

  const variants: ReducedVariant[] = [];
  const counts = zeroStateCounts();
  counts.expected = expected.variants.length;
  for (const expectedVariant of expected.variants) {
    const candidates = observedByVariant.get(expectedVariant.variantId) ?? [];
    if (candidates.length === 0) {
      counts.notRun++;
      variants.push({ expected: expectedVariant, observed: false });
      continue;
    }
    const variant = coalesceVariantCandidates(candidates, expectedVariant.variantId, exclusionReasons);
    counts.observed++;
    countVariant(counts, variant);
    variants.push({ expected: expectedVariant, observed: true, observation: variant });
  }

  const validVariantIds = variants
    .filter((entry) => entry.observation?.execution === 'EXECUTED'
      && entry.observation.verdict === 'PASS')
    .map((entry) => entry.expected.variantId)
    .sort();
  const failedVariantIds = variants
    .filter((entry) => entry.observation?.verdict === 'FAIL')
    .map((entry) => entry.expected.variantId)
    .sort();
  const grade = reduceGrade(counts);
  const label = formatReducedCellLabel(grade, counts.valid, counts.expected);
  const observedVariants = variants
    .map((entry) => entry.observation)
    .filter((entry): entry is VariantObservation => entry !== undefined);
  const metrics = reduceMetrics(sortedObservations, observedVariants, validVariantIds, counts.valid > 0, exclusionReasons);

  return {
    cellId: `${expected.engineId}\u0000${expected.browser}\u0000${expected.scenarioId}`,
    engineId: expected.engineId,
    browser: expected.browser,
    scenarioId: expected.scenarioId,
    family: expected.family,
    grade,
    label,
    counts,
    summary: scoreSummaryFromCounts(counts),
    validVariantIds,
    failedVariantIds,
    variants,
    observations: sortedObservations,
    metrics,
    exclusionReasons: [...new Set(exclusionReasons)].sort(),
  };
}

export function formatReducedCellLabel(grade: ReducedCell['grade'], valid: number, expected: number): string {
  switch (grade) {
    case 'NOT_RUN': return '—';
    case 'SKIPPED': return 'SKIPPED';
    case 'NA': return 'N/A';
    case 'FAIL': return 'FAIL';
    case 'ERROR': return 'ERROR';
    case 'PARTIAL': return `Partial (${valid}/${expected})`;
    case 'PASS': return 'PASS';
  }
}

export function zeroStateCounts(): StateCounts {
  return {
    expected: 0,
    observed: 0,
    executed: 0,
    oracleEvaluable: 0,
    valid: 0,
    pass: 0,
    failed: 0,
    errors: 0,
    naEngine: 0,
    naBrowser: 0,
    naAsset: 0,
    skipped: 0,
    notRun: 0,
  };
}

export function sumStateCounts(values: readonly StateCounts[]): StateCounts {
  const output = zeroStateCounts();
  for (const value of values) {
    output.expected += value.expected;
    output.observed += value.observed;
    output.executed += value.executed;
    output.oracleEvaluable += value.oracleEvaluable;
    output.valid += value.valid;
    output.pass += value.pass;
    output.failed += value.failed;
    output.errors += value.errors;
    output.naEngine += value.naEngine;
    output.naBrowser += value.naBrowser;
    output.naAsset += value.naAsset;
    output.skipped += value.skipped;
    output.notRun += value.notRun;
  }
  return output;
}

export function scoreSummaryFromCounts(counts: StateCounts): ScoreSummary {
  const oracleDenominator = counts.pass + counts.failed;
  return {
    counts: { ...counts },
    correctness: rate(counts.valid, oracleDenominator),
    exactMatch: rate(counts.pass, oracleDenominator),
    expectedCoverage: rate(counts.observed, counts.expected),
  };
}

function countVariant(counts: StateCounts, variant: VariantObservation): void {
  switch (variant.execution) {
    case 'EXECUTED': counts.executed++; break;
    case 'ERROR': counts.errors++; break;
    case 'NA_ENGINE': counts.naEngine++; break;
    case 'NA_BROWSER': counts.naBrowser++; break;
    case 'NA_ASSET': counts.naAsset++; break;
    case 'SKIPPED': counts.skipped++; break;
  }
  if (variant.verdict === 'PASS') {
    counts.oracleEvaluable++;
    counts.valid++;
    counts.pass++;
  } else if (variant.verdict === 'FAIL') {
    counts.oracleEvaluable++;
    counts.failed++;
  }
}

function reduceGrade(counts: StateCounts): ReducedCell['grade'] {
  if (counts.observed === 0) return 'NOT_RUN';
  if (counts.notRun === 0 && counts.skipped === counts.expected) return 'SKIPPED';
  const na = counts.naEngine + counts.naBrowser + counts.naAsset;
  if (counts.valid === 0 && counts.failed === 0 && counts.errors === 0 && na > 0 && na + counts.skipped === counts.observed) {
    return 'NA';
  }
  if (counts.valid === 0 && counts.failed > 0) return 'FAIL';
  if (counts.valid === 0 && counts.failed === 0 && counts.errors > 0) return 'ERROR';
  if (counts.valid > 0 && counts.valid < counts.expected) return 'PARTIAL';
  if (counts.valid === counts.expected && counts.pass === counts.expected) return 'PASS';
  if (counts.valid > 0) return 'PARTIAL';
  if (counts.skipped > 0) return 'SKIPPED';
  return 'NA';
}

function reduceMetrics(
  observations: readonly NormalizedObservation[],
  variants: readonly VariantObservation[],
  validVariantIds: readonly string[],
  correctnessValid: boolean,
  exclusionReasons: string[],
): MetricObservation[] {
  const metricIds = new Set<MetricId>();
  for (const observation of observations) for (const metric of observation.metrics) metricIds.add(metric.metric);
  for (const variant of variants) for (const metric of variant.metrics) metricIds.add(metric.metric);
  const output: MetricObservation[] = [];
  for (const metricId of metricIds) {
    if (!correctnessValid) {
      output.push(normalizeMetricObservation(metricId, undefined, { unavailableReasonCode: 'CORRECTNESS_GATE_NOT_VALID' }));
      continue;
    }
    const candidates = observations
      .flatMap((observation) => observation.metrics)
      .filter((metric) => metric.metric === metricId);
    let chosen = coalesceMetricCandidates(metricId, candidates, exclusionReasons);
    if (!chosen || chosen.state === 'UNAVAILABLE') {
      const summarized = summarizeMetricAcrossVariants(metricId, variants);
      if (summarized.state === 'AVAILABLE') chosen = summarized;
    }
    if (!chosen) chosen = normalizeMetricObservation(metricId, undefined);
    if (chosen.state === 'AVAILABLE' && !sameStrings(chosen.validVariantIds, validVariantIds)) {
      exclusionReasons.push(`METRIC_VALID_FILE_SET_MISMATCH:${metricId}`);
      chosen = normalizeMetricObservation(metricId, undefined, {
        unavailableReasonCode: 'VALID_FILE_SET_MISMATCH',
        unavailableReason: `metric covers [${chosen.validVariantIds.join(', ')}], cell validity covers [${validVariantIds.join(', ')}]`,
      });
    }
    output.push(chosen);
  }
  return output.sort((a, b) => metricSortKey(a).localeCompare(metricSortKey(b)));
}

function coalesceVariantCandidates(
  candidates: readonly VariantObservation[],
  variantId: string,
  exclusionReasons: string[],
): VariantObservation {
  const sorted = candidates.slice().sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
  const first = sorted[0]!;
  if (sorted.some((candidate) => canonicalJson(candidate) !== canonicalJson(first))) {
    exclusionReasons.push(`DUPLICATE_VARIANT_CONFLICT:${variantId}`);
    return {
      variantId,
      file: first.file,
      ...(first.sha256 ? { sha256: first.sha256 } : {}),
      ...(first.isBaked !== undefined ? { isBaked: first.isBaked } : {}),
      execution: 'ERROR',
      reasonCode: 'DUPLICATE_VARIANT_CONFLICT',
      reason: 'multiple observations with the same expected variant identity disagree',
      oracleOutcomes: sorted.flatMap((candidate) => candidate.oracleOutcomes),
      metrics: [],
      evidence: first.evidence,
    };
  }
  return first;
}

function coalesceMetricCandidates(
  metricId: MetricId,
  candidates: readonly MetricObservation[],
  exclusionReasons: string[],
): MetricObservation | undefined {
  if (candidates.length === 0) return undefined;
  const sorted = candidates.slice().sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
  const first = sorted[0]!;
  if (sorted.some((candidate) => canonicalJson(candidate) !== canonicalJson(first))) {
    exclusionReasons.push(`DUPLICATE_METRIC_CONFLICT:${metricId}`);
    return normalizeMetricObservation(metricId, undefined, {
      unavailableReasonCode: 'DUPLICATE_METRIC_CONFLICT',
    });
  }
  return first;
}

function rate(numerator: number, denominator: number): RateSummary {
  return { numerator, denominator, value: denominator === 0 ? null : numerator / denominator };
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
