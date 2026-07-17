import type { MetricId } from '../scenario.ts';
import {
  confidenceIntervalsOverlap,
  observationsUseSameProtocol,
  relativeDifferencePct,
} from './metrics.ts';
import { REPORTABLE_METRICS } from './normalize.ts';
import type {
  AvailableMetricObservation,
  RankedContender,
  RankingDecision,
  ReducedCell,
  ReportingPolicy,
} from './model.ts';

export function rankScenarioCells(
  cells: readonly ReducedCell[],
  cohortId: string,
  comparable: boolean,
  policy: ReportingPolicy,
): RankingDecision {
  const orderedCells = cells.slice().sort((a, b) => a.engineId.localeCompare(b.engineId));
  const scenarioId = orderedCells[0]?.scenarioId ?? '';
  const browser = orderedCells[0]?.browser ?? 'chromium';
  const contenders = orderedCells.map(toContender);
  const reasons: string[] = [];
  const none = (flag: RankingDecision['flag'] = 'none'): RankingDecision => ({
    scenarioId,
    browser,
    cohortId,
    comparable,
    primaryMetric: null,
    aggregation: null,
    unit: null,
    sampleAxis: null,
    winner: null,
    winnerValue: null,
    runnerUp: null,
    runnerUpValue: null,
    flag,
    coWinners: [],
    tieBandPct: null,
    intervalRule: null,
    contenders,
    reasons: [...new Set(reasons)].sort(),
  });

  if (!comparable) {
    reasons.push('Cohort dimensions are incomplete, unequal, or contain an engine-record conflict.');
    markAll(contenders, 'NOT_COMPARABLE', 'cross-engine comparison rejected by the cohort gate');
    return none();
  }
  const validCells = orderedCells.filter((cell) => cell.counts.valid > 0);
  for (const contender of contenders) {
    if (contender.valid === 0) {
      contender.eligibility = 'NO_VALID_COVERAGE';
      contender.eligibilityReason = 'no PASS input variant';
    }
  }
  if (validCells.length < 2) {
    reasons.push('At least two correctness-valid contenders are required for a cross-engine winner.');
    return none('unresolved');
  }

  const expectedSets = validCells.map((cell) => cell.variants.map((variant) => variant.expected.variantId).sort());
  if (!expectedSets.every((set) => sameStrings(set, expectedSets[0]!))) {
    reasons.push('Contenders do not share the same expected input identity set.');
    for (const contender of contenders.filter((entry) => entry.valid > 0)) {
      contender.eligibility = 'VALID_FILE_SET_MISMATCH';
      contender.eligibilityReason = 'expected input identity sets differ';
    }
    return none('unresolved');
  }

  const maxValid = Math.max(...validCells.map((cell) => cell.counts.valid));
  const coverageTier = validCells.filter((cell) => cell.counts.valid === maxValid);
  if (coverageTier.length === 1) {
    const winnerCell = coverageTier[0]!;
    const runner = validCells
      .filter((cell) => cell !== winnerCell)
      .sort((a, b) => b.counts.valid - a.counts.valid || a.engineId.localeCompare(b.engineId))[0];
    const primary = selectedMetricForCell(winnerCell);
    const winnerContender = contenders.find((entry) => entry.engineId === winnerCell.engineId)!;
    if (primary) {
      winnerContender.metric = primary.metric;
      winnerContender.observation = primary;
    }
    winnerContender.eligibility = 'ELIGIBLE';
    winnerContender.eligibilityReason = `highest valid coverage (${winnerCell.counts.valid}/${winnerCell.counts.expected})`;
    reasons.push('Winner decided by strictly greater valid coverage before performance was considered.');
    return {
      ...none('winner'),
      primaryMetric: primary?.metric ?? null,
      aggregation: primary?.aggregation ?? null,
      unit: primary?.unit ?? null,
      sampleAxis: primary?.sampleAxis ?? null,
      winner: winnerCell.engineId,
      winnerValue: primary?.rankedValue ?? null,
      runnerUp: runner?.engineId ?? null,
      runnerUpValue: selectedMetricForCell(runner)?.rankedValue ?? null,
      coWinners: [winnerCell.engineId],
      contenders,
      reasons,
    };
  }

  const validIdSets = coverageTier.map((cell) => cell.validVariantIds);
  if (!validIdSets.every((set) => sameStrings(set, validIdSets[0]!))) {
    reasons.push('Equal-coverage contenders are valid on different input identities; their metrics are not comparable.');
    for (const cell of coverageTier) setContender(contenders, cell.engineId, 'VALID_FILE_SET_MISMATCH', 'exact valid file identities differ');
    return none('unresolved');
  }

  const metric = selectCommonPrimaryMetric(coverageTier);
  if (!metric) {
    reasons.push('No metric is available for every top-coverage contender.');
    for (const cell of coverageTier) setContender(contenders, cell.engineId, 'NO_COMMON_METRIC', 'no common primary metric');
    return none('unresolved');
  }
  const metricRows = coverageTier.map((cell) => ({ cell, observation: availableMetric(cell, metric) }));
  if (metricRows.some((row) => !row.observation)) {
    reasons.push(`Primary metric ${metric} is unavailable for at least one contender.`);
    for (const row of metricRows) {
      setContender(
        contenders,
        row.cell.engineId,
        row.observation ? 'ELIGIBLE' : 'METRIC_UNAVAILABLE',
        row.observation ? 'metric available' : `${metric} unavailable`,
        metric,
        row.observation ?? null,
      );
    }
    return metricNone(none('unresolved'), metric, metricRows.find((row) => row.observation)?.observation ?? null);
  }
  const availableRows = metricRows as Array<{ cell: ReducedCell; observation: AvailableMetricObservation }>;
  const protocol = availableRows[0]!.observation;
  if (!availableRows.every((row) => observationsUseSameProtocol(protocol, row.observation))) {
    reasons.push('Metric unit, direction, aggregation, or sample axis differs between contenders.');
    for (const row of availableRows) {
      setContender(contenders, row.cell.engineId, 'METRIC_PROTOCOL_MISMATCH', 'metric protocols differ', metric, row.observation);
    }
    return metricNone(none('unresolved'), metric, protocol);
  }
  if (!availableRows.every((row) => sameStrings(row.observation.validVariantIds, validIdSets[0]!))) {
    reasons.push('Metric observations do not cover the exact valid file identity set.');
    for (const row of availableRows) {
      setContender(contenders, row.cell.engineId, 'VALID_FILE_SET_MISMATCH', 'metric file identities differ', metric, row.observation);
    }
    return metricNone(none('unresolved'), metric, protocol);
  }

  let insufficient = false;
  for (const row of availableRows) {
    if (row.observation.n < policy.minRankSamples) {
      insufficient = true;
      setContender(
        contenders,
        row.cell.engineId,
        'INSUFFICIENT_SAMPLES',
        `n=${row.observation.n}; requires n>=${policy.minRankSamples}`,
        metric,
        row.observation,
      );
    } else {
      setContender(contenders, row.cell.engineId, 'ELIGIBLE', 'rankable metric observation', metric, row.observation);
    }
  }
  if (insufficient) {
    reasons.push(`At least one contender has fewer than minRankSamples=${policy.minRankSamples}.`);
    return metricNone(none('unresolved'), metric, protocol);
  }

  const ranked = availableRows.slice().sort((a, b) => {
    const delta = protocol.direction === 'higher'
      ? b.observation.rankedValue - a.observation.rankedValue
      : a.observation.rankedValue - b.observation.rankedValue;
    return delta || a.cell.engineId.localeCompare(b.cell.engineId);
  });
  const top = ranked[0]!;
  const second = ranked[1]!;
  const tieBandPct = Math.max(
    policy.relativeNoiseFloorPct,
    top.observation.empiricalNoisePct,
    second.observation.empiricalNoisePct,
  );
  const coWinners = ranked
    .filter((row) => {
      const pairBandPct = Math.max(
        policy.relativeNoiseFloorPct,
        top.observation.empiricalNoisePct,
        row.observation.empiricalNoisePct,
      );
      const withinBand = Math.abs(relativeDifferencePct(top.observation.rankedValue, row.observation.rankedValue, protocol.direction)) <= pairBandPct;
      const overlapping = confidenceIntervalsOverlap(top.observation.confidenceInterval, row.observation.confidenceInterval);
      return withinBand || overlapping;
    })
    .map((row) => row.cell.engineId)
    .sort();
  const tied = coWinners.length > 1;
  const intervalRule = `${policy.uncertaintyPolicy}; top ${formatInterval(top.observation)}, runner-up ${formatInterval(second.observation)}`;
  if (tied) {
    reasons.push(`Top contenders are within the ${tieBandPct}% band or have overlapping confidence intervals.`);
    return {
      ...metricNone(none('tie'), metric, protocol),
      runnerUp: second.cell.engineId,
      runnerUpValue: second.observation.rankedValue,
      coWinners,
      tieBandPct,
      intervalRule,
      contenders,
      reasons,
    };
  }

  reasons.push('Clear winner after coverage, protocol, sample-plan, noise-band, and interval gates.');
  return {
    ...metricNone(none('winner'), metric, protocol),
    winner: top.cell.engineId,
    winnerValue: top.observation.rankedValue,
    runnerUp: second.cell.engineId,
    runnerUpValue: second.observation.rankedValue,
    coWinners: [top.cell.engineId],
    tieBandPct,
    intervalRule,
    contenders,
    reasons,
  };
}

function toContender(cell: ReducedCell): RankedContender {
  return {
    engineId: cell.engineId,
    grade: cell.grade,
    valid: cell.counts.valid,
    expected: cell.counts.expected,
    validVariantIds: cell.validVariantIds.slice(),
    metric: null,
    observation: null,
    eligibility: cell.counts.valid > 0 ? 'NO_COMMON_METRIC' : 'NO_VALID_COVERAGE',
    eligibilityReason: cell.counts.valid > 0 ? 'not evaluated yet' : 'no PASS input variant',
  };
}

function selectCommonPrimaryMetric(cells: readonly ReducedCell[]): MetricId | undefined {
  const declared = cells.map((cell) => cell.observations.find((observation) => observation.primaryMetric)?.primaryMetric);
  if (declared.length > 0 && declared.every((metric) => metric !== undefined && metric === declared[0])) {
    const metric = declared[0]!;
    if (cells.every((cell) => availableMetric(cell, metric))) return metric;
  }
  return REPORTABLE_METRICS.find((metric) => cells.every((cell) => availableMetric(cell, metric)));
}

function selectedMetricForCell(cell: ReducedCell | undefined): AvailableMetricObservation | undefined {
  if (!cell) return undefined;
  const declared = cell.observations.find((observation) => observation.primaryMetric)?.primaryMetric;
  if (declared) {
    const found = availableMetric(cell, declared);
    if (found) return found;
  }
  for (const metric of REPORTABLE_METRICS) {
    const found = availableMetric(cell, metric);
    if (found) return found;
  }
  return undefined;
}

function availableMetric(cell: ReducedCell, metric: MetricId): AvailableMetricObservation | undefined {
  const observation = cell.metrics.find((entry) => entry.metric === metric);
  return observation?.state === 'AVAILABLE' ? observation : undefined;
}

function setContender(
  contenders: RankedContender[],
  engineId: string,
  eligibility: RankedContender['eligibility'],
  reason: string,
  metric?: MetricId,
  observation?: AvailableMetricObservation | null,
): void {
  const contender = contenders.find((entry) => entry.engineId === engineId);
  if (!contender) return;
  contender.eligibility = eligibility;
  contender.eligibilityReason = reason;
  if (metric) contender.metric = metric;
  if (observation !== undefined) contender.observation = observation;
}

function markAll(
  contenders: RankedContender[],
  eligibility: RankedContender['eligibility'],
  reason: string,
): void {
  for (const contender of contenders) {
    contender.eligibility = eligibility;
    contender.eligibilityReason = reason;
  }
}

function metricNone(
  decision: RankingDecision,
  metric: MetricId,
  protocol: AvailableMetricObservation | null,
): RankingDecision {
  return {
    ...decision,
    primaryMetric: metric,
    aggregation: protocol?.aggregation ?? null,
    unit: protocol?.unit ?? null,
    sampleAxis: protocol?.sampleAxis ?? null,
  };
}

function formatInterval(observation: AvailableMetricObservation): string {
  return `n=${observation.n}, MAD=${observation.mad}, band=${observation.empiricalNoisePct}%, `
    + `CI=[${observation.confidenceInterval.low}, ${observation.confidenceInterval.high}]`;
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
