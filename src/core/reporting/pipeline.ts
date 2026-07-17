import { canonicalContentHash, canonicalJson } from './canonical.ts';
import {
  compareObservations,
  deriveExpectedMatrix,
  expectedCellKey,
  normalizeScenarioResults,
  scenarioBrowserKey,
} from './normalize.ts';
import { rankScenarioCells } from './ranking.ts';
import {
  assessStreamingComparability,
  type StreamingComparabilityResult,
  type StreamingWorkIdentity,
} from '../../features/streaming-output/comparability.ts';
import { reduceExpectedCell, scoreSummaryFromCounts, sumStateCounts } from './reducer.ts';
import type {
  CohortReport,
  DedupeDiscard,
  DedupeResult,
  EngineCohortSummary,
  ExpectedCellDefinition,
  ExpectedMatrixDefinition,
  NormalizedObservation,
  ReportingPipelineInput,
  ReportingPolicy,
  ReducedCell,
} from './model.ts';
import { DEFAULT_REPORTING_POLICY } from './model.ts';

export interface ReportingPipelineOutput {
  suiteVersion: string;
  generatedAtIso: string;
  policy: ReportingPolicy;
  expected: ExpectedMatrixDefinition;
  observations: NormalizedObservation[];
  discarded: DedupeDiscard[];
  cohorts: CohortReport[];
}

export class DuplicateObservationError extends Error {
  readonly identity: string;

  constructor(identity: string, hashes: readonly string[]) {
    super(`[CONFLICTING_OBSERVATION_DUPLICATE] ${identity}: ${hashes.join(', ')}`);
    this.name = 'DuplicateObservationError';
    this.identity = identity;
  }
}

export function runReportingPipeline(input: ReportingPipelineInput): ReportingPipelineOutput {
  const policy = reportingPolicy(input.policy);
  const expected = deriveExpectedMatrix(input.results, input.expected);
  const normalized = normalizeScenarioResults(input.results, input.contextForResult, policy);
  const deduped = deduplicateObservations(normalized, input.dedupePolicy ?? 'strict');
  const cohorts = buildCohorts(expected, deduped.observations, policy);
  const suiteVersion = input.suiteVersion
    ?? deduped.observations.find((observation) => typeof observation.environment.suiteVersion === 'string')
      ?.environment.suiteVersion as string | undefined
    ?? 'unknown';
  return {
    suiteVersion,
    generatedAtIso: input.generatedAtIso ?? new Date().toISOString(),
    policy,
    expected,
    observations: deduped.observations,
    discarded: deduped.discarded,
    cohorts,
  };
}

export function deduplicateObservations(
  observations: readonly NormalizedObservation[],
  policy: 'strict' | 'latest' = 'strict',
): DedupeResult {
  const discarded: DedupeDiscard[] = [];
  const byObservationId = groupBy(observations, (observation) => observation.observationId);
  const identityDeduped: NormalizedObservation[] = [];
  for (const [identity, group] of [...byObservationId.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const byHash = groupBy(group, (observation) => observation.contentHash);
    if (byHash.size > 1 && policy === 'strict') {
      throw new DuplicateObservationError(identity, [...byHash.keys()].sort());
    }
    const candidates = [...byHash.values()].map((duplicates) => {
      const ordered = duplicates.slice().sort(compareObservations);
      const kept = ordered[0]!;
      for (const duplicate of ordered.slice(1)) {
        discarded.push({
          identity,
          keptObservationId: kept.observationId,
          discardedObservationId: duplicate.observationId,
          keptContentHash: kept.contentHash,
          discardedContentHash: duplicate.contentHash,
          reason: 'IDENTICAL_DUPLICATE',
        });
      }
      return kept;
    });
    if (candidates.length === 1) {
      identityDeduped.push(candidates[0]!);
    } else {
      const kept = selectLatest(candidates, identity);
      identityDeduped.push(kept);
      for (const candidate of candidates) {
        if (candidate === kept) continue;
        discarded.push(latestDiscard(identity, kept, candidate));
      }
    }
  }

  if (policy !== 'latest') {
    return { observations: identityDeduped.sort(compareObservations), discarded: sortDiscards(discarded) };
  }

  // A deliberate latest policy also selects one run observation per comparable cell. This is separate
  // from canonical identity dedupe and never consults a filename or input order.
  const byCell = groupBy(identityDeduped, latestCellIdentity);
  const latest: NormalizedObservation[] = [];
  for (const [identity, group] of [...byCell.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (group.length === 1) {
      latest.push(group[0]!);
      continue;
    }
    const kept = selectLatest(group, identity);
    latest.push(kept);
    for (const candidate of group) {
      if (candidate === kept) continue;
      discarded.push(latestDiscard(identity, kept, candidate));
    }
  }
  return { observations: latest.sort(compareObservations), discarded: sortDiscards(discarded) };
}

export function computeCohortId(observation: NormalizedObservation): string {
  if (observation.cohortDimensions) {
    return `cohort-${canonicalContentHash(observation.cohortDimensions)}`;
  }
  // A missing required dimension cannot be pooled by coincidence. Isolate the record and explain why.
  return `not-comparable-${canonicalContentHash({
    observationId: observation.observationId,
    cohortInput: observation.cohortInput,
    missing: observation.cohortMissingDimensions,
  })}`;
}

export function buildCohorts(
  expected: ExpectedMatrixDefinition,
  observations: readonly NormalizedObservation[],
  policy: ReportingPolicy,
): CohortReport[] {
  const groups = groupBy(observations, computeCohortId);
  const output: CohortReport[] = [];
  const representedScenarioBrowsers = new Set<string>();
  for (const [cohortId, group] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const first = group[0]!;
    const key = scenarioBrowserKey(first.browser, first.scenarioId);
    representedScenarioBrowsers.add(key);
    const relevantExpected = expected.cells.filter((cell) =>
      cell.browser === first.browser && cell.scenarioId === first.scenarioId);
    output.push(buildOneCohort(cohortId, expected, relevantExpected, group, policy));
  }

  // Scenarios with no persisted observation still exist in the report as explicit not-run cohorts.
  const byScenarioBrowser = groupBy(expected.cells, (cell) => scenarioBrowserKey(cell.browser, cell.scenarioId));
  for (const [key, cells] of [...byScenarioBrowser.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (representedScenarioBrowsers.has(key)) continue;
    const cohortId = `not-run-${canonicalContentHash({ key, expected: cells })}`;
    output.push(buildOneCohort(cohortId, expected, cells, [], policy));
  }
  return output.sort((a, b) => {
    const ac = a.cells[0];
    const bc = b.cells[0];
    return (ac?.browser ?? '').localeCompare(bc?.browser ?? '')
      || (ac?.scenarioId ?? '').localeCompare(bc?.scenarioId ?? '')
      || a.cohortId.localeCompare(b.cohortId);
  });
}

function buildOneCohort(
  cohortId: string,
  wholeExpected: ExpectedMatrixDefinition,
  expectedCells: readonly ExpectedCellDefinition[],
  observations: readonly NormalizedObservation[],
  policy: ReportingPolicy,
): CohortReport {
  const first = observations[0];
  const observationsByCell = groupBy(observations, (observation) =>
    expectedCellKey(observation.engineId, observation.browser, observation.scenarioId));
  const cells = expectedCells
    .map((expectedCell) => reduceSelectedExpectedCell(
      expectedCell,
      observationsByCell.get(expectedCellKey(expectedCell.engineId, expectedCell.browser, expectedCell.scenarioId)) ?? [],
    ))
    .sort((a, b) => a.engineId.localeCompare(b.engineId));
  const missingDimensions = [...new Set(observations.flatMap((observation) => observation.cohortMissingDimensions))].sort();
  const exclusionReasons = [...new Set(observations.flatMap((observation) => observation.exclusionReasons))].sort();
  const engineConflicts = engineRecordConflicts(observations);
  exclusionReasons.push(...engineConflicts);
  const streamingComparability = assessStreamingCohort(observations);
  if (streamingComparability && !streamingComparability.comparable) {
    exclusionReasons.push(`STREAMING_COMPARISON_REFUSED:${streamingComparability.reasonCode}`);
  }
  for (const [cellKey, group] of observationsByCell) {
    if (group.length > 1) exclusionReasons.push(`MULTIPLE_RUN_OBSERVATIONS_REQUIRE_SELECTION:${cellKey}`);
  }
  const criticalExclusion = exclusionReasons.some((reason) =>
    reason.startsWith('COHORT_')
    || reason.startsWith('ENGINE_')
    || reason.startsWith('ADAPTER_')
    || reason.startsWith('MULTIPLE_RUN_')
    || reason.startsWith('STREAMING_'));
  const observedEngineCount = new Set(observations.map((observation) => observation.engineId)).size;
  if (observedEngineCount < 2) exclusionReasons.push('CROSS_ENGINE_COMPARISON_REQUIRES_TWO_ENGINES');
  const comparable = Boolean(first?.cohortDimensions)
    && missingDimensions.length === 0
    && engineConflicts.length === 0
    && !criticalExclusion
    && observedEngineCount >= 2
    && (streamingComparability?.comparable ?? true);
  const dimensions = comparable ? first!.cohortDimensions! : null;
  const expectedScenarioIntersection = commonExpectedScenarios(
    wholeExpected,
    first?.browser ?? expectedCells[0]?.browser,
  );
  const engineSummaries = summarizeEngines(cells);
  const rankings = cells.length === 0
    ? []
    : [rankScenarioCells(cells, cohortId, comparable, policy)];
  return {
    cohortId,
    comparable,
    comparisonLabel: comparable ? 'COMPARABLE' : 'NOT_COMPARABLE',
    ...(streamingComparability ? { streamingComparability } : {}),
    dimensions,
    missingDimensions,
    exclusionReasons: [...new Set(exclusionReasons)].sort(),
    expectedScenarioIntersection,
    cells,
    engineSummaries,
    rankings,
  };
}

function assessStreamingCohort(
  observations: readonly NormalizedObservation[],
): StreamingComparabilityResult | undefined {
  const streaming = observations.filter((observation) => observation.family === 'streaming-output');
  if (streaming.length === 0) return undefined;
  const identities = streaming
    .map((observation) => observation.streamingWork?.identity)
    .filter((identity): identity is StreamingWorkIdentity => identity !== undefined);
  if (identities.length !== streaming.length) {
    const missing = [...new Set(streaming.flatMap((observation) => [
      ...(observation.streamingWork?.missingFields ?? []),
      ...(observation.streamingWork?.conflictFields ?? []),
    ]))].sort();
    return Object.freeze({
      comparable: false,
      status: 'REFUSED' as const,
      reasonCode: 'STREAMING_WORK_IDENTITY_INCOMPLETE',
      detail: `winner comparison refused: required work facts are missing or conflicting${missing.length ? ` (${missing.join(', ')})` : ''}`,
      mismatchedFields: Object.freeze([]),
    });
  }
  return assessStreamingComparability(identities);
}

/**
 * A cell with multiple distinct run observations has no implicit winner. It remains losslessly
 * inspectable, but its convenience projection is not-run until an explicit latest policy selects one.
 */
export function reduceSelectedExpectedCell(
  expected: ExpectedCellDefinition,
  observations: readonly NormalizedObservation[],
): ReducedCell {
  if (observations.length <= 1) return reduceExpectedCell(expected, observations);
  const sorted = observations.slice().sort(compareObservations);
  const cell = reduceExpectedCell(expected, []);
  const selectionReason = `MULTIPLE_RUN_OBSERVATIONS_REQUIRE_SELECTION:${expectedCellKey(
    expected.engineId,
    expected.browser,
    expected.scenarioId,
  )}`;
  return {
    ...cell,
    label: '— (selection required)',
    observations: sorted,
    exclusionReasons: [...new Set([
      ...sorted.flatMap((observation) => observation.exclusionReasons),
      selectionReason,
    ])].sort(),
  };
}

function summarizeEngines(cells: readonly ReturnType<typeof reduceExpectedCell>[]): EngineCohortSummary[] {
  const grouped = groupBy(cells, (cell) => cell.engineId);
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([engineId, engineCells]) => {
    const counts = sumStateCounts(engineCells.map((cell) => cell.counts));
    return { engineId, cellCount: engineCells.length, ...scoreSummaryFromCounts(counts) };
  });
}

function commonExpectedScenarios(
  expected: ExpectedMatrixDefinition,
  browser: ExpectedCellDefinition['browser'] | undefined,
): string[] {
  if (!browser) return [];
  const cells = expected.cells.filter((cell) => cell.browser === browser);
  const engines = [...new Set(cells.map((cell) => cell.engineId))].sort();
  if (engines.length === 0) return [];
  const sets = engines.map((engineId) => new Set(cells.filter((cell) => cell.engineId === engineId).map((cell) => cell.scenarioId)));
  return [...sets[0]!].filter((scenarioId) => sets.every((set) => set.has(scenarioId))).sort();
}

function engineRecordConflicts(observations: readonly NormalizedObservation[]): string[] {
  const byEngine = groupBy(observations, (observation) => observation.engineId);
  const conflicts: string[] = [];
  for (const [engineId, group] of byEngine) {
    const hashes = [...new Set(group.map((observation) => observation.engine.recordHash))];
    if (hashes.length > 1) conflicts.push(`ENGINE_RECORD_CONFLICT:${engineId}:${hashes.sort().join(',')}`);
  }
  return conflicts.sort();
}

function reportingPolicy(input: Partial<ReportingPolicy> | undefined): ReportingPolicy {
  return {
    minRankSamples: Number.isInteger(input?.minRankSamples) && (input?.minRankSamples ?? 0) >= 3
      ? input!.minRankSamples!
      : DEFAULT_REPORTING_POLICY.minRankSamples,
    relativeNoiseFloorPct: typeof input?.relativeNoiseFloorPct === 'number'
      && Number.isFinite(input.relativeNoiseFloorPct)
      && input.relativeNoiseFloorPct >= 3
      ? input.relativeNoiseFloorPct
      : DEFAULT_REPORTING_POLICY.relativeNoiseFloorPct,
    uncertaintyPolicy: typeof input?.uncertaintyPolicy === 'string' && input.uncertaintyPolicy.length > 0
      ? input.uncertaintyPolicy
      : DEFAULT_REPORTING_POLICY.uncertaintyPolicy,
  };
}

function latestCellIdentity(observation: NormalizedObservation): string {
  const comparableDimensions = observation.cohortDimensions ?? observation.cohortInput;
  return `${observation.engineId}\u0000${observation.browser}\u0000${observation.scenarioId}\u0000${canonicalContentHash(comparableDimensions)}`;
}

function selectLatest(candidates: readonly NormalizedObservation[], identity: string): NormalizedObservation {
  for (const candidate of candidates) {
    if (!candidate.observedAtIso || !Number.isFinite(Date.parse(candidate.observedAtIso))) {
      throw new Error(`[LATEST_TIMESTAMP_MISSING] ${identity}: ${candidate.observationId}`);
    }
  }
  return candidates.slice().sort((a, b) => {
    const time = Date.parse(b.observedAtIso!) - Date.parse(a.observedAtIso!);
    return time || b.contentHash.localeCompare(a.contentHash) || b.observationId.localeCompare(a.observationId);
  })[0]!;
}

function latestDiscard(
  identity: string,
  kept: NormalizedObservation,
  discarded: NormalizedObservation,
): DedupeDiscard {
  return {
    identity,
    keptObservationId: kept.observationId,
    discardedObservationId: discarded.observationId,
    keptContentHash: kept.contentHash,
    discardedContentHash: discarded.contentHash,
    reason: 'LATEST_POLICY',
  };
}

function sortDiscards(discarded: DedupeDiscard[]): DedupeDiscard[] {
  return discarded.sort((a, b) =>
    a.identity.localeCompare(b.identity)
    || a.discardedObservationId.localeCompare(b.discardedObservationId)
    || a.discardedContentHash.localeCompare(b.discardedContentHash));
}

function groupBy<T>(values: readonly T[], keyOf: (value: T) => string): Map<string, T[]> {
  const output = new Map<string, T[]>();
  for (const value of values) {
    const key = keyOf(value);
    const group = output.get(key) ?? [];
    group.push(value);
    output.set(key, group);
  }
  return output;
}
