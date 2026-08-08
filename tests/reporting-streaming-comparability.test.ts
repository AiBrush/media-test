import { describe, expect, test } from 'bun:test';

import type { BenchSummary, MetricId, ScenarioResult } from '../src/core/scenario.ts';
import { normalizedComparableScenarioRanking } from '../src/app/ui.ts';
import { buildReport } from '../src/core/report.ts';
import type { CohortDimensions } from '../src/core/report.ts';

const FIXTURE_SHA = 'a'.repeat(64);

describe('REQ-FEAT-89 production equivalent-work reporting', () => {
  test('direct and reducer-layer runtime evidence form one comparable cohort and rank normally', () => {
    const fast = streamingResult('fast@1', 10, 'direct');
    const slow = streamingResult('slow@1', 20, 'layer');
    const report = buildReport({ results: [fast, slow], generatedAtIso: '2026-07-16T00:00:00.000Z' });

    expect(report.json.observations.map((observation) => observation.streamingWork?.state)).toEqual([
      'COMPLETE',
      'COMPLETE',
    ]);
    expect(report.json.observations[0]?.cohortDimensions).toMatchObject({
      fixtureSha256: FIXTURE_SHA,
      resolvedRepresentation: 'fragmented-mp4',
      observerPolicy: 'runner-write-observer@1',
      retainedOutputPolicy: 'bounded-prefix-tail-hash@1',
      measurementContract: 'streaming-output-measure@1',
      browserFamily: 'chromium',
      warmup: 1,
      requestedIterations: 3,
      primaryMetric: 'wall',
      primaryUnit: 'ms',
    });
    const cohort = report.json.cohorts.find((entry) => entry.comparable)!;
    expect(cohort.streamingComparability).toMatchObject({
      comparable: true,
      status: 'COMPARABLE',
      reasonCode: 'STREAMING_WORK_COMPARABLE',
    });
    expect(cohort.rankings[0]).toMatchObject({ flag: 'winner', winner: 'fast@1', winnerValue: 10 });
    expect(normalizedComparableScenarioRanking([fast, slow])).toMatchObject({
      status: 'WINNER', winnerEngineId: 'fast@1', winnerValue: 10, metric: 'wall', unit: 'ms',
    });
  });

  test('every required work/measurement fact participates in cohort refusal', () => {
    const mutations: Array<[string, (result: ScenarioResult) => void]> = [
      ['resolved representation', (result) => setRuntimeFact(result, 'resolvedRepresentation', 'progressive-mp4')],
      ['observer policy', (result) => setRuntimeFact(result, 'observerPolicy', 'adapter-relative-observer@1')],
      ['retained-output policy', (result) => setRuntimeFact(result, 'retainedOutputPolicy', 'full-buffer')],
      ['measurement contract', (result) => setRuntimeFact(result, 'measurementContract', 'streaming-output-measure@2')],
      ['fixture SHA', (result) => { result.selection!.sha256 = 'b'.repeat(64); }],
      ['browser', (result) => {
        result.browser = 'firefox';
        result.env!.browser = 'firefox';
      }],
      ['warmup', (result) => { result.bench!.wall!.warmup = 2; }],
      ['iterations', (result) => { result.bench!.wall!.requestedIterations = 4; }],
      ['metric', (result) => setPrimaryMetric(result, 'peakMemory', 'bytes')],
      ['unit', (result) => { result.bench!.wall!.unit = 'seconds'; }],
    ];

    for (const [label, mutate] of mutations) {
      const first = streamingResult('first@1', 10, 'direct');
      const second = streamingResult('second@1', 8, 'direct');
      mutate(second);
      const report = buildReport({ results: [first, second], generatedAtIso: '2026-07-16T00:00:00.000Z' });
      expect(report.json.cohorts.flatMap((cohort) => cohort.rankings).every((ranking) => ranking.winner === null), label).toBe(true);
      expect(report.json.cohorts.every((cohort) => !cohort.comparable), label).toBe(true);
      expect(normalizedComparableScenarioRanking([first, second]).status, label).toBe('REFUSED');
    }
  });

  test('missing or conflicting oracle work evidence blocks ranking and remains machine-readable', () => {
    const incomplete = streamingResult('incomplete@1', 10, 'direct');
    const runtime = directRuntime(incomplete);
    delete runtime.comparability.observerPolicy;
    delete incomplete.selection!.sha256;
    delete incomplete.bench!.wall!.requestedIterations;

    const conflict = streamingResult('conflict@1', 8, 'direct');
    const direct = directRuntime(conflict);
    const conflicting = runtimeEnvelope({
      ...direct.comparability,
      resolvedRepresentation: 'progressive-mp4',
    });
    const evidence = conflict.oracleOutcomes[0]!.evidence as Record<string, unknown>;
    evidence.layers = [{ evidence: { streamingRuntime: conflicting } }];

    const report = buildReport({ results: [incomplete, conflict], generatedAtIso: '2026-07-16T00:00:00.000Z' });
    const incompleteObservation = report.json.observations.find((entry) => entry.engineId === 'incomplete@1')!;
    expect(incompleteObservation.streamingWork).toMatchObject({
      state: 'INCOMPLETE',
      missingFields: expect.arrayContaining(['fixtureSha256', 'observerPolicy', 'iterations']),
    });
    expect(incompleteObservation.cohortMissingDimensions).toEqual(expect.arrayContaining([
      'fixtureSha256', 'observerPolicy', 'requestedIterations',
    ]));
    const conflictObservation = report.json.observations.find((entry) => entry.engineId === 'conflict@1')!;
    expect(conflictObservation.streamingWork).toMatchObject({
      state: 'CONFLICT', conflictFields: ['resolvedRepresentation'], sourceCount: 2,
    });
    expect(conflictObservation.exclusionReasons).toContain('STREAMING_WORK_IDENTITY_CONFLICT:resolvedRepresentation');
    expect(report.json.cohorts.every((cohort) => cohort.rankings[0]?.winner === null)).toBe(true);
    expect(JSON.parse(JSON.stringify(report.json)).observations[0].streamingWork).toBeDefined();
  });
});

function streamingResult(
  engineId: string,
  wall: number,
  evidencePath: 'direct' | 'layer',
): ScenarioResult {
  const summary = metricSummary('wall', 'ms', wall);
  const runtime = runtimeEnvelope();
  const outcomeEvidence = evidencePath === 'direct'
    ? { streamingRuntime: runtime }
    : { layers: [{ evidence: { streamingRuntime: runtime } }] };
  const result: ScenarioResult = {
    engineId,
    browser: 'chromium',
    scenarioId: 'streaming-output/stream_massive_h264_mp4',
    family: 'streaming-output',
    status: 'PASS',
    primaryMetric: 'wall',
    selection: { file: 'massive.mp4', sha256: FIXTURE_SHA, isBaked: true },
    oracleOutcomes: [{
      state: 'VERDICT',
      oracle: 'reference-reimport',
      verdict: 'PASS',
      reasonCode: 'STREAMING_CORRECTNESS_VALID',
      evidence: outcomeEvidence,
    }],
    bench: { wall: summary },
    env: {
      suiteVersion: '1.2.3',
      engineId,
      browser: 'chromium',
      browserVersion: '126.0.0',
      gpu: 'gpu/driver',
      corpusChecksum: 'corpus-v1',
      acPower: true,
      configUsed: { threads: 1 },
    },
  };
  (result as unknown as Record<string, unknown>).reporting = {
    cohortDimensions: completeDimensions(result),
  };
  return result;
}

function runtimeEnvelope(comparability: Record<string, unknown> = {}): {
  schema: string;
  state: string;
  comparability: Record<string, unknown>;
} {
  return {
    schema: 'media-test/streaming-runtime-result@1',
    state: 'ASSESSED',
    comparability: {
      complete: true,
      resolvedRepresentation: 'fragmented-mp4',
      observerPolicy: 'runner-write-observer@1',
      retainedOutputPolicy: 'bounded-prefix-tail-hash@1',
      measurementContract: 'streaming-output-measure@1',
      missingFields: [],
      ...comparability,
    },
  };
}

function directRuntime(result: ScenarioResult): ReturnType<typeof runtimeEnvelope> {
  return (result.oracleOutcomes[0]!.evidence as Record<string, unknown>).streamingRuntime as ReturnType<typeof runtimeEnvelope>;
}

function setRuntimeFact(result: ScenarioResult, field: string, value: string): void {
  directRuntime(result).comparability[field] = value;
}

function setPrimaryMetric(result: ScenarioResult, metric: MetricId, unit: string): void {
  result.primaryMetric = metric;
  result.bench = { [metric]: metricSummary(metric, unit, 8) };
}

function metricSummary(metric: MetricId, unit: string, value: number): BenchSummary {
  return {
    n: 3,
    warmup: 1,
    requestedIterations: 3,
    metric,
    median: value,
    p95: value,
    mad: 0,
    unit,
    samples: [value, value, value],
  };
}

function completeDimensions(result: ScenarioResult): CohortDimensions {
  return {
    artifactSchemaMajor: 1,
    suiteVersion: '1.2.3',
    scenarioId: result.scenarioId,
    scenarioDefinitionHash: 'scenario-hash',
    oraclePolicyVersion: 'oracle-v1',
    goldenProvenanceVersion: 'golden-v1',
    browserFamily: result.browser,
    browserBuild: '126.0.0',
    executionRealm: 'window',
    featureFlagsHash: 'flags-hash',
    supportSnapshotHash: 'support-hash',
    hostOs: 'test-os',
    hostArch: 'test-arch',
    cpuClass: 'test-cpu',
    gpuDriver: 'gpu/driver',
    powerState: 'AC',
    isolationPolicy: 'quiesced',
    corpusChecksum: 'corpus-v1',
    selectedFileSetHash: 'selected-files-hash',
    mutationHash: 'no-mutation',
    runSelectionHash: 'selection-hash',
    primaryMetric: 'wall',
    primaryUnit: 'ms',
    metricDirection: 'lower',
    metricNumerator: 'wall',
    metricDenominator: 'operation',
    sampleAxis: 'iteration',
    aggregation: 'median',
    warmup: 1,
    requestedIterations: 3,
    minRankSamples: 3,
    uncertaintyPolicy: 'fixture uncertainty policy',
  };
}
