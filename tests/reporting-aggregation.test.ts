import { describe, expect, test } from 'bun:test';

import type { BrowserName } from '../src/core/engine.ts';
import type { BenchSummary, MetricId, OracleVerdict, ScenarioResult } from '../src/core/scenario.ts';
import {
  buildReport,
  canonicalContentHash,
  computeCohortId,
  deduplicateObservations,
  normalizeMetricObservation,
  normalizeScenarioResult,
  ratioOfSums,
  reduceExpectedCell,
  serializeReportJson,
} from '../src/core/report.ts';
import type {
  CohortDimensions,
  ExpectedMatrixDefinition,
  ReportingNormalizationContext,
  VariantObservation,
} from '../src/core/report.ts';

describe('REQ-REP-01..04, 08, 11, 12: orthogonal correctness and denominators', () => {
  test('the mandatory 1/3 fixture is Partial, lossless, and coverage outranks speed', () => {
    const expected = expectedMatrix(['fast-1@1', 'fast-2@1', 'slow-full@1'], ['01.mp4', '02.mp4', '03.mp4']);
    const one = resultWithVariants('fast-1@1', [
      variant('01.mp4', 'a1', 'PASS', 1),
      variant('02.mp4', 'a2', 'FAIL', undefined, 'PACKETS_CHANGED'),
      variant('03.mp4', 'a3', 'FAIL', undefined, 'TIMESTAMPS_CHANGED'),
    ], 1);
    const two = resultWithVariants('fast-2@1', [
      variant('01.mp4', 'a1', 'PASS', 10),
      variant('02.mp4', 'a2', 'PASS', 10, 'LEGAL_REORDER'),
      variant('03.mp4', 'a3', 'FAIL', undefined, 'MISSING_TRACK'),
    ], 20);
    const full = resultWithVariants('slow-full@1', [
      variant('01.mp4', 'a1', 'PASS', 100),
      variant('02.mp4', 'a2', 'PASS', 100, 'LEGAL_REORDER'),
      variant('03.mp4', 'a3', 'PASS', 100),
    ], 300);
    const contexts = new Map([
      [one.engineId, completeContext(one, { sampleAxis: 'file', aggregation: 'sum', requestedIterations: 3 })],
      [two.engineId, completeContext(two, { sampleAxis: 'file', aggregation: 'sum', requestedIterations: 3 })],
      [full.engineId, completeContext(full, { sampleAxis: 'file', aggregation: 'sum', requestedIterations: 3 })],
    ]);
    const report = buildReport({
      results: [one, two, full],
      expected,
      generatedAtIso: '2026-01-01T00:00:00.000Z',
      contextForResult: (result) => contexts.get(result.engineId),
    });
    const cells = report.json.cohorts.find((cohort) => cohort.comparable)!.cells;
    expect(cells.find((cell) => cell.engineId === one.engineId)?.label).toBe('Partial (1/3)');
    expect(cells.find((cell) => cell.engineId === two.engineId)?.label).toBe('Partial (2/3)');
    expect(cells.find((cell) => cell.engineId === full.engineId)?.grade).toBe('PASS');
    expect(cells.find((cell) => cell.engineId === one.engineId)?.failedVariantIds).toEqual(['02.mp4#a2', '03.mp4#a3']);
    const ranking = report.json.cohorts.find((cohort) => cohort.comparable)!.rankings[0]!;
    expect(ranking.winner).toBe('slow-full@1');
    expect(ranking.reasons.join(' ')).toContain('greater valid coverage');
    expect(report.markdown).toContain('Partial (1/3)');
    expect(report.markdown).toContain('02.mp4');
    expect(report.markdown).toContain('03.mp4');
    expect(report.markdown).not.toContain('Partial (1/3) · 1/3 · failing: 02.mp4#a2, 03.mp4#a3 | — | — | ERROR');
    const normalizedOne = report.json.observations.find((observation) => observation.engineId === one.engineId)!;
    expect(normalizedOne.variants[0]?.oracleOutcomes[0]).toMatchObject({ verdict: 'PASS' });
    expect(normalizedOne.variants[1]?.oracleOutcomes[0]).toMatchObject({ verdict: 'FAIL', reasonCode: 'PACKETS_CHANGED' });
    expect(normalizedOne.variants[1]?.metrics[0]?.state).toBe('UNAVAILABLE');
  });

  test('variant reduction is order independent and preserves every state identity', () => {
    const expected = expectedMatrix(['e@1'], ['p', 'd', 'f', 'err', 'ne', 'nb', 'na', 'skip']);
    const raw = resultWithExplicitOutcomes('e@1', [
      variantOutcome('p', 'EXECUTED', 'PASS'),
      variantOutcome('d', 'EXECUTED', 'PASS'),
      variantOutcome('f', 'EXECUTED', 'FAIL'),
      variantOutcome('err', 'ERROR'),
      variantOutcome('ne', 'NA_ENGINE'),
      variantOutcome('nb', 'NA_BROWSER'),
      variantOutcome('na', 'NA_ASSET'),
      variantOutcome('skip', 'SKIPPED'),
    ]);
    const normalized = normalizeScenarioResult(raw, completeContext(raw, { sampleAxis: 'iteration', aggregation: 'median' }));
    const cellExpected = expected.cells[0]!;
    const forward = reduceExpectedCell(cellExpected, [normalized]);
    const reversedResult = resultWithExplicitOutcomes('e@1', [...(raw as unknown as { variants: VariantObservation[] }).variants].reverse());
    const reversed = reduceExpectedCell(
      cellExpected,
      [normalizeScenarioResult(reversedResult, completeContext(reversedResult, { sampleAxis: 'iteration', aggregation: 'median' }))],
    );
    expect(reversed.grade).toBe(forward.grade);
    expect(reversed.counts).toEqual(forward.counts);
    expect(forward.grade).toBe('PARTIAL');
    expect(forward.counts).toMatchObject({
      expected: 8, observed: 8, executed: 3, oracleEvaluable: 3, valid: 2,
      pass: 2, failed: 1, errors: 1, naEngine: 1, naBrowser: 1, naAsset: 1, skipped: 1, notRun: 0,
    });
  });

  test('candidate evidence remains lossless and Markdown exposes required/applied/unavailable/sufficient sets', () => {
    const result = makeResult('evidence@1', 'PASS');
    result.selection = { file: '01.mp4', sha256: 'a'.repeat(64), isBaked: false };
    result.candidateEvidence = {
      schema: 'media-test/candidate-evidence-result@1',
      contractDigest: 'b'.repeat(64),
      status: 'PASS',
      reasonCode: 'EVIDENCE_SUFFICIENT_PASS',
      required: ['golden-metadata'],
      applied: ['golden-metadata', 'playback-smoke'],
      unavailable: [{ oracle: 'playback-smoke', status: 'NA_BROWSER', reasonCode: 'PLAYBACK_UNAVAILABLE' }],
      sufficientSurvivorOracles: ['golden-metadata'],
      sufficient: true,
    };
    const report = buildReport({ results: [result], generatedAtIso: '2026-01-01T00:00:00.000Z' });
    expect(report.json.observations[0]?.variants[0]?.candidateEvidence).toEqual(result.candidateEvidence);
    expect(report.markdown).toContain('required=golden-metadata');
    expect(report.markdown).toContain('applied=golden-metadata, playback-smoke');
    expect(report.markdown).toContain('playback-smoke:NA_BROWSER[PLAYBACK_UNAVAILABLE]');
    expect(report.markdown).toContain('sufficient=yes (golden-metadata)');
  });

  test('correctness formulas exclude ERROR and zero denominators are null/emdash', () => {
    const expected = expectedMatrix(['e@1'], ['pass', 'diff', 'fail', 'error']);
    const result = resultWithExplicitOutcomes('e@1', [
      variantOutcome('pass', 'EXECUTED', 'PASS'),
      variantOutcome('diff', 'EXECUTED', 'PASS'),
      variantOutcome('fail', 'EXECUTED', 'FAIL'),
      variantOutcome('error', 'ERROR'),
    ]);
    const cell = reduceExpectedCell(expected.cells[0]!, [normalizeScenarioResult(result)]);
    expect(cell.summary.correctness).toEqual({ numerator: 2, denominator: 3, value: 2 / 3 });
    expect(cell.summary.exactMatch).toEqual({ numerator: 2, denominator: 3, value: 2 / 3 });

    const onlyNa = makeResult('na@1', 'NA_ENGINE');
    const report = buildReport({ results: [onlyNa], generatedAtIso: '2026-01-01T00:00:00.000Z' });
    expect(report.json.scorecards[0]?.correctness.value).toBeNull();
    expect(report.markdown).toContain('| — | — | — |');
    expect(report.markdown).toContain('NA_ENGINE');
  });

  test('an expected-but-removed cell becomes not-run without changing correctness denominator', () => {
    const expected = expectedMatrix(['a@1', 'b@1'], ['only.mp4']);
    const a = resultWithVariants('a@1', [variant('only.mp4', undefined, 'PASS', 3)], 3);
    const both = buildReport({ results: [a, resultWithVariants('b@1', [variant('only.mp4', undefined, 'FAIL')])], expected });
    const removed = buildReport({ results: [a], expected });
    const bothA = both.json.scorecards.find((score) => score.engineId === 'a@1')!;
    const removedA = removed.json.scorecards.find((score) => score.engineId === 'a@1')!;
    expect(removedA.correctness).toEqual(bothA.correctness);
    expect(removed.json.scorecards.find((score) => score.engineId === 'b@1')?.counts.notRun).toBe(1);
    expect(removed.json.scorecards.find((score) => score.engineId === 'b@1')?.counts.expected).toBe(1);
  });
});

describe('REQ-REP-05..08, 13, 18: comparable metrics and honest ranking', () => {
  test('n=0 is typed unavailable and n=1 cannot claim a sole metric winner', () => {
    const empty = normalizeMetricObservation('wall', {
      n: 0, warmup: 1, metric: 'wall', median: 0, p95: 0, mad: 0, unit: 'ms', samples: [],
    });
    expect(empty).toEqual({
      state: 'UNAVAILABLE', metric: 'wall', unit: 'ms', direction: 'lower', reasonCode: 'NO_FINITE_SAMPLES',
      reason: 'n=0 or the finite sample array is empty',
    });
    expect(JSON.stringify(empty)).not.toContain('median');

    const a = makeResult('a@1', 'PASS', 1, 'wall');
    const b = makeResult('b@1', 'PASS', 2, 'wall');
    const contexts = new Map([
      [a.engineId, completeContext(a)],
      [b.engineId, completeContext(b)],
    ]);
    const report = buildReport({ results: [a, b], contextForResult: (result) => contexts.get(result.engineId) });
    const decision = report.json.cohorts.find((cohort) => cohort.comparable)!.rankings[0]!;
    expect(decision.winner).toBeNull();
    expect(decision.flag).toBe('unresolved');
    expect(decision.contenders.every((contender) => contender.eligibility === 'INSUFFICIENT_SAMPLES')).toBe(true);
    expect(report.markdown).toContain('n=1; requires n>=3');
  });

  test('near-noise and overlapping intervals are ties; exact protocol mismatches split cohorts', () => {
    const a = makeResult('a@1', 'PASS', 100, 'wall', [99, 100, 101]);
    const b = makeResult('b@1', 'PASS', 102, 'wall', [101, 102, 103]);
    const baseA = completeContext(a);
    const baseB = completeContext(b);
    const tied = buildReport({
      results: [a, b],
      contextForResult: (result) => result.engineId === a.engineId ? baseA : baseB,
    });
    const decision = tied.json.cohorts.find((cohort) => cohort.comparable)!.rankings[0]!;
    expect(decision.flag).toBe('tie');
    expect(decision.winner).toBeNull();
    expect(decision.tieBandPct).toBeGreaterThanOrEqual(3);
    expect(decision.intervalRule).toContain('MAD');

    const mutations: Array<[keyof CohortDimensions, unknown]> = [
      ['browserBuild', 'other-build'],
      ['corpusChecksum', 'other-corpus'],
      ['scenarioDefinitionHash', 'other-scenario'],
      ['warmup', 2],
      ['primaryUnit', 'seconds'],
    ];
    for (const [key, value] of mutations) {
      const changed = { ...baseB, cohortDimensions: { ...baseB.cohortDimensions!, [key]: value } };
      const report = buildReport({
        results: [a, b],
        contextForResult: (result) => result.engineId === a.engineId ? baseA : changed,
      });
      expect(report.json.cohorts.every((cohort) => !cohort.comparable)).toBe(true);
      expect(report.json.cohorts.every((cohort) => cohort.comparisonLabel === 'NOT_COMPARABLE')).toBe(true);
      expect(new Set(report.json.observations.map(computeCohortId)).size).toBe(2);
    }
  });

  test('a changed engine config for the same immutable id rejects the cohort', () => {
    const first = makeResult('same@1', 'PASS', 10, 'wall', [10, 10, 10]);
    const second = { ...makeResult('same@1', 'PASS', 9, 'wall', [9, 9, 9]), reason: 'second run' };
    const base = completeContext(first, {}, 'run-one');
    const changed = completeContext(second, {}, 'run-two');
    changed.engineRecord = { ...changed.engineRecord, configUsed: { threads: 2 } };
    const report = buildReport({
      results: [first, second],
      contextForResult: (result) => result === first ? base : changed,
    });
    const cohort = report.json.cohorts.find((entry) => entry.exclusionReasons.some((reason) => reason.startsWith('ENGINE_RECORD_CONFLICT')))!;
    expect(cohort.comparable).toBe(false);
    expect(cohort.rankings[0]?.winner).toBeNull();
  });

  test('ratio-of-sums retains the per-file rate distribution', () => {
    const observation = normalizeMetricObservation('framesPerSec', {
      n: 2,
      warmup: 1,
      metric: 'framesPerSec',
      median: 3.75,
      p95: 5,
      mad: 1.25,
      unit: 'frames/s',
      samples: [5, 2.5],
      sampleAxis: 'file',
      aggregation: 'ratio-of-sums',
      ratioComponents: [
        { identity: 'a', numerator: 10, denominator: 2 },
        { identity: 'b', numerator: 20, denominator: 8 },
      ],
    }, { validVariantIds: ['a', 'b'] });
    expect(ratioOfSums([
      { identity: 'a', numerator: 10, denominator: 2 },
      { identity: 'b', numerator: 20, denominator: 8 },
    ])).toBe(3);
    expect(observation).toMatchObject({
      state: 'AVAILABLE', sampleAxis: 'file', aggregation: 'ratio-of-sums', rankedValue: 3, samples: [5, 2.5],
    });
  });

  test('Markdown renders the exact exhaustive non-wall winner value and wall separately', () => {
    const expected = expectedMatrix(['metric-winner@1', 'wall-winner@1'], ['a', 'b', 'c']);
    const first = fullRateResult('metric-winner@1', 6, 300);
    const second = fullRateResult('wall-winner@1', 5, 100);
    const contexts = new Map([
      [first.engineId, completeContext(first, { primaryMetric: 'throughputRealtime', primaryUnit: '×', sampleAxis: 'file', aggregation: 'median' })],
      [second.engineId, completeContext(second, { primaryMetric: 'throughputRealtime', primaryUnit: '×', sampleAxis: 'file', aggregation: 'median' })],
    ]);
    const report = buildReport({
      results: [first, second],
      expected,
      generatedAtIso: '2026-01-01T00:00:00.000Z',
      contextForResult: (result) => contexts.get(result.engineId),
    });
    const ranking = report.json.cohorts.find((cohort) => cohort.comparable)!.rankings[0]!;
    expect(ranking.winner).toBe('metric-winner@1');
    expect(ranking.winnerValue).toBe(6);
    expect(report.markdown).toContain('6 × (median, file; n=3');
    expect(report.markdown).toContain('300 ms (sum; n=3)');
    expect(report.markdown).toContain('Primary ranked value');
    expect(report.markdown).toContain('Wall diagnostic');
  });
});

describe('REQ-REP-09, 10, 15, 16: lossless deterministic pipeline', () => {
  test('raw evidence round-trips and permutations are byte/hash stable', () => {
    const a = makeResult('a@1', 'PASS', 10, 'wall', [9, 10, 11]);
    const b = makeResult('b@1', 'PASS', 8, 'wall', [7, 8, 9]);
    (a as unknown as Record<string, unknown>).extraEvidence = { z: 1, a: 'kept' };
    const options = { generatedAtIso: '2026-01-01T00:00:00.000Z' } as const;
    const forward = buildReport({ results: [a, b], ...options });
    const reversed = buildReport({ results: [b, a], ...options });
    expect(forward.json.contentHash).toBe(reversed.json.contentHash);
    expect(serializeReportJson(forward.json)).toBe(serializeReportJson(reversed.json));
    expect(forward.markdown).toBe(reversed.markdown);
    expect(forward.markdown.match(/^## Cohort /gm)?.length).toBe(forward.json.cohorts.length);
    expect(forward.json.observations.find((entry) => entry.engineId === 'a@1')?.evidence.extraEvidence).toEqual({ a: 'kept', z: 1 });
    expect(forward.json.observations.find((entry) => entry.engineId === 'a@1')?.variants[0]?.oracleOutcomes[0]).toMatchObject({ verdict: 'PASS' });

    const laterEnvelope = buildReport({ results: [a, b], generatedAtIso: '2027-01-01T00:00:00.000Z' });
    expect(laterEnvelope.json.contentHash).toBe(forward.json.contentHash);
    expect(laterEnvelope.json.envelope.generatedAtIso).not.toBe(forward.json.envelope.generatedAtIso);
    const changed = buildReport({ results: [{ ...a, reason: 'substantive' }, b], ...options });
    expect(changed.json.contentHash).not.toBe(forward.json.contentHash);
  });

  test('canonical identities coalesce exact duplicates, reject conflicts, and latest reports discards', () => {
    const base = makeResult('a@1', 'PASS', 10, 'wall', [10, 10, 10]);
    const context = completeContext(base, {}, 'run-id');
    const one = normalizeScenarioResult(base, { ...context, observedAtIso: '2026-01-01T00:00:00Z' });
    const identical = normalizeScenarioResult(base, { ...context, observedAtIso: '2026-01-02T00:00:00Z' });
    const exact = deduplicateObservations([identical, one]);
    expect(exact.observations).toHaveLength(1);
    expect(exact.discarded[0]?.reason).toBe('IDENTICAL_DUPLICATE');

    const changed = normalizeScenarioResult(
      { ...base, reason: 'changed evidence' },
      { ...context, observedAtIso: '2026-01-03T00:00:00Z' },
    );
    expect(() => deduplicateObservations([one, changed], 'strict')).toThrow('CONFLICTING_OBSERVATION_DUPLICATE');
    const latest = deduplicateObservations([one, changed], 'latest');
    expect(latest.observations[0]?.contentHash).toBe(changed.contentHash);
    expect(latest.discarded[0]).toMatchObject({ reason: 'LATEST_POLICY', discardedContentHash: one.contentHash });
  });

  test('multiple run identities require explicit selection and never synthesize correctness ERROR', () => {
    const first = makeResult('a@1', 'PASS', 10, 'wall', [10, 10, 10]);
    const second = makeResult('a@1', 'PASS', 9, 'wall', [9, 9, 9]);
    const firstContext = completeContext(first, {}, 'run-one');
    const secondContext = {
      ...completeContext(second, {}, 'run-two'),
      observedAtIso: '2026-01-02T00:00:00Z',
    };
    const contextForResult = (result: ScenarioResult) => result === first ? firstContext : secondContext;
    const unselected = buildReport({ results: [first, second], contextForResult });
    expect(unselected.json.scorecards[0]?.counts).toMatchObject({ errors: 0, failed: 0, notRun: 1 });
    expect(unselected.json.browserSections[0]?.conformance['a@1']?.['probe/example']?.label).toBe('— (selection required)');
    expect(unselected.json.observations).toHaveLength(2);

    const selected = buildReport({ results: [first, second], contextForResult, dedupePolicy: 'latest' });
    expect(selected.json.scorecards[0]?.counts).toMatchObject({ errors: 0, failed: 0, pass: 1, notRun: 0 });
    expect(selected.json.deduplication.discarded[0]?.reason).toBe('LATEST_POLICY');
  });

  test('Markdown escapes pipes and line breaks without changing evidence', () => {
    const result = { ...makeResult('a@1', 'FAIL'), reason: 'left | right\nnext' };
    const report = buildReport({ results: [result], generatedAtIso: '2026-01-01T00:00:00Z' });
    expect(report.markdown).toContain('left \\| right<br>next');
    expect(report.json.observations[0]?.evidence.reason).toBe('left | right\nnext');
    expect(canonicalContentHash({ b: 1, a: 2 })).toBe(canonicalContentHash({ a: 2, b: 1 }));
  });
});

function makeResult(
  engineId: string,
  status: ScenarioResult['status'],
  median = 0,
  metric: MetricId = 'wall',
  samples = [median],
): ScenarioResult {
  const verdict = status === 'PASS' || status === 'FAIL' ? status : undefined;
  const summary: BenchSummary = {
    n: samples.length,
    warmup: 1,
    metric,
    median,
    p95: Math.max(...samples),
    mad: samples.length > 1 ? Math.abs(samples[0]! - median) : 0,
    unit: metric === 'throughputRealtime' ? '×' : 'ms',
    samples,
  };
  return {
    engineId,
    browser: 'chromium',
    scenarioId: 'probe/example',
    family: 'probe',
    status,
    oracleOutcomes: verdict
      ? [{ state: 'VERDICT', oracle: 'golden-metadata', verdict, detail: verdict }]
      : [],
    ...(verdict === 'PASS' ? { bench: { [metric]: summary }, primaryMetric: metric } : {}),
    env: {
      suiteVersion: '1.2.3',
      engineId,
      browser: 'chromium',
      browserVersion: '123.0.0',
      gpu: 'gpu/driver',
      corpusChecksum: 'corpus',
      acPower: true,
      configUsed: { threads: 1 },
    },
  };
}

function resultWithVariants(
  engineId: string,
  variants: VariantObservation[],
  wallAggregate = 1,
): ScenarioResult {
  const valid = variants.filter((entry) => entry.verdict === 'PASS');
  const result = makeResult(engineId, valid.length === variants.length ? 'PASS' : 'FAIL');
  result.bench = valid.length > 0 ? {
    wall: {
      n: valid.length,
      warmup: 1,
      metric: 'wall',
      median: wallAggregate / valid.length,
      p95: wallAggregate / valid.length,
      mad: 0,
      unit: 'ms',
      samples: Array.from({ length: valid.length }, () => wallAggregate / valid.length),
      aggregate: wallAggregate,
    },
  } : undefined;
  result.primaryMetric = 'wall';
  (result as unknown as { variants: VariantObservation[] }).variants = variants;
  return result;
}

function resultWithExplicitOutcomes(engineId: string, variants: VariantObservation[]): ScenarioResult {
  const result = makeResult(engineId, 'FAIL');
  (result as unknown as { variants: VariantObservation[] }).variants = variants;
  return result;
}

function variant(
  file: string,
  sha256: string | undefined,
  verdict: OracleVerdict,
  wall?: number,
  reasonCode?: string,
): VariantObservation {
  return {
    variantId: sha256 ? `${file}#${sha256}` : file,
    file,
    ...(sha256 ? { sha256 } : {}),
    isBaked: false,
    execution: 'EXECUTED',
    verdict,
    ...(reasonCode ? { reasonCode, reason: `${reasonCode} detail` } : {}),
    oracleOutcomes: [{ state: 'VERDICT', oracle: 'golden-packets', verdict, ...(reasonCode ? { reasonCode } : {}) }],
    metrics: wall === undefined
      ? [{ state: 'UNAVAILABLE', metric: 'wall', unit: 'ms', direction: 'lower', reasonCode: 'CORRECTNESS_GATE_NOT_VALID' }]
      : [{
          state: 'AVAILABLE', metric: 'wall', unit: 'ms', direction: 'lower', sampleAxis: 'iteration', aggregation: 'median',
          n: 3, warmup: 1, samples: [wall, wall, wall], median: wall, p95: wall, mad: 0, rankedValue: wall,
          validVariantIds: [sha256 ? `${file}#${sha256}` : file], empiricalNoisePct: 0,
          confidenceInterval: { low: wall, high: wall, confidence: 0.95, method: 'fixture' },
        }],
    evidence: { file, ...(sha256 ? { sha256 } : {}), verdict, ...(reasonCode ? { reasonCode } : {}) },
  };
}

function variantOutcome(
  file: string,
  execution: VariantObservation['execution'],
  verdict?: OracleVerdict,
): VariantObservation {
  return {
    variantId: file,
    file,
    execution,
    ...(verdict ? { verdict } : {}),
    oracleOutcomes: verdict ? [{ state: 'VERDICT', oracle: 'golden-metadata', verdict }] : [],
    metrics: [],
    evidence: { file, execution, ...(verdict ? { verdict } : {}) },
  };
}

function expectedMatrix(engines: string[], files: string[]): ExpectedMatrixDefinition {
  return {
    definitionId: 'fixture-matrix',
    cells: engines.map((engineId) => ({
      engineId,
      browser: 'chromium' as BrowserName,
      scenarioId: 'probe/example',
      family: 'probe',
      variants: files.map((file, index) => ({
        variantId: index < 3 && /^0/.test(file) ? `${file}#a${index + 1}` : file,
        file,
        ...(index < 3 && /^0/.test(file) ? { sha256: `a${index + 1}` } : {}),
      })),
    })),
  };
}

function completeContext(
  result: ScenarioResult,
  overrides: Partial<CohortDimensions> = {},
  runId = `run-${result.engineId}`,
): ReportingNormalizationContext {
  const metric = overrides.primaryMetric ?? result.primaryMetric ?? 'wall';
  const summary = result.bench?.[metric];
  const sampleAxis = overrides.sampleAxis ?? (summary?.aggregate === undefined ? 'iteration' : 'file');
  const aggregation = overrides.aggregation ?? (sampleAxis === 'file' && metric === 'wall' ? 'sum' : 'median');
  const unit = overrides.primaryUnit ?? summary?.unit ?? (metric === 'throughputRealtime' ? '×' : 'ms');
  return {
    runId,
    observedAtIso: '2026-01-01T00:00:00Z',
    engineRecord: {
      frameworkVersion: result.engineId.split('@')[1] ?? '1',
      adapterVersion: 'adapter-1',
      configUsed: result.env?.configUsed ?? {},
    },
    cohortDimensions: {
      artifactSchemaMajor: 1,
      suiteVersion: '1.2.3',
      scenarioId: result.scenarioId,
      scenarioDefinitionHash: 'scenario-hash',
      oraclePolicyVersion: 'oracle-v1',
      goldenProvenanceVersion: 'golden-v1',
      browserFamily: result.browser,
      browserBuild: '123.0.0',
      executionRealm: 'window',
      featureFlagsHash: 'flags-hash',
      supportSnapshotHash: 'support-hash',
      hostOs: 'test-os',
      hostArch: 'test-arch',
      cpuClass: 'test-cpu',
      gpuDriver: 'gpu/driver',
      powerState: 'AC',
      isolationPolicy: 'quiesced',
      corpusChecksum: 'corpus',
      selectedFileSetHash: 'files-hash',
      mutationHash: 'no-mutation',
      runSelectionHash: 'selection-hash',
      primaryMetric: metric,
      primaryUnit: unit,
      metricDirection: metric === 'throughputRealtime' ? 'higher' : 'lower',
      metricNumerator: metric,
      metricDenominator: 'operation',
      sampleAxis,
      aggregation,
      warmup: summary?.warmup ?? 1,
      requestedIterations: summary?.n ?? 3,
      minRankSamples: 3,
      uncertaintyPolicy: 'fixture uncertainty policy',
      ...overrides,
    },
  };
}

function fullRateResult(engineId: string, rate: number, wall: number): ScenarioResult {
  const variants = ['a', 'b', 'c'].map((file) => variant(file, undefined, 'PASS', wall / 3));
  const result = resultWithVariants(engineId, variants, wall);
  result.status = 'PASS';
  result.primaryMetric = 'throughputRealtime';
  result.bench = {
    wall: {
      n: 3, warmup: 1, metric: 'wall', median: wall / 3, p95: wall / 3, mad: 0, unit: 'ms',
      samples: [wall / 3, wall / 3, wall / 3], aggregate: wall,
    },
    throughputRealtime: {
      n: 3, warmup: 1, metric: 'throughputRealtime', median: rate, p95: rate, mad: 0, unit: '×',
      samples: [rate, rate, rate], aggregate: rate,
    },
  };
  return result;
}
