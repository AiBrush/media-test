/**
 * src/core/bench.ts — the benchmark protocol (§10.2) + summary statistics + A/B comparison.
 *
 * Pure computation: no DOM, no Worker, no Node-only API. `adaptiveBench()` calibrates an inner loop
 * to a minimum duration and collects independent repetitions; `bench()` remains the explicit-count
 * compatibility path. Both reject missing/non-finite promised samples.
 * `compareBench()` turns a reference vs candidate pair into a direction-aware verdict, treating any
 * delta inside the noise band as 'within-noise' (rule §10 / §15: no within-noise "improvement").
 *
 * Metric direction is fixed here (single source of truth): wall / memory / I/O counts / longtasks /
 * bytesOut are lower-is-better; throughput×realtime and decode/encode fps are higher-is-better.
 */

import type { BenchSummary, MetricId, MetricSample } from './scenario.ts';
import { hashSeed, mulberry32 } from './seeded-rng.ts';

export interface BenchOptions {
  /** unmeasured priming iterations run before measurement (default 1). */
  warmup?: number;
  /** measured repetitions whose samples feed the summary (default 5). */
  iters?: number;
  /** |deltaPct| at or below this (floored at 3) is reported as within-noise (default 3). */
  noiseBandPct?: number;
  /** Minimum wall time for one calibrated repetition batch. */
  minDurationMs?: number;
  /** Minimum independent repetitions for a fast operation. */
  minRepetitions?: number;
  /** Minimum repetitions when one operation already exceeds minDurationMs. */
  slowRepetitions?: number;
  /** Safety ceiling for adaptive inner-iteration calibration. */
  maxInnerIterations?: number;
}

export const DEFAULT_BENCH = Object.freeze({
  warmup: 1,
  iters: 5,
  noiseBandPct: 3,
  minDurationMs: 100,
  minRepetitions: 5,
  slowRepetitions: 3,
  maxInnerIterations: 1_048_576,
});

/** Hard floor on the noise band — we never claim a difference smaller than this (§10). */
const MIN_NOISE_BAND_PCT = 3;

/** Which MetricSample field backs each MetricId. Single mapping used by bench() + getMetricValue. */
const METRIC_FIELD: Record<MetricId, keyof MetricSample> = {
  wall: 'wallMs',
  throughputRealtime: 'throughputRealtime',
  peakMemory: 'peakMemoryBytes',
  sourceReads: 'sourceReads',
  targetWrites: 'targetWrites',
  bytesOut: 'bytesOut',
  longtasks: 'longtaskMs',
  decodeFps: 'decodeFps',
  encodeFps: 'encodeFps',
  opsPerSec: 'opsPerSec',
  packetsPerSec: 'packetsPerSec',
  framesPerSec: 'framesPerSec',
  sampleFramesPerSec: 'sampleFramesPerSec',
  seekMs: 'seekMs',
  timeToFirstByte: 'timeToFirstByteMs',
  timeToFirstFrame: 'timeToFirstFrameMs',
  loadInit: 'loadInitMs',
  bundleSize: 'bundleSizeKb',
};

const METRIC_UNIT: Record<MetricId, string> = {
  wall: 'ms',
  throughputRealtime: 'x-realtime',
  peakMemory: 'bytes',
  sourceReads: 'count',
  targetWrites: 'count',
  bytesOut: 'bytes',
  longtasks: 'ms',
  decodeFps: 'fps',
  encodeFps: 'fps',
  opsPerSec: 'ops/s',
  packetsPerSec: 'packets/s',
  framesPerSec: 'fps',
  sampleFramesPerSec: 'sample-frames/s',
  seekMs: 'ms',
  timeToFirstByte: 'ms',
  timeToFirstFrame: 'ms',
  loadInit: 'ms',
  bundleSize: 'kB',
};

/** The only higher-is-better metrics; everything else is lower-is-better. */
const HIGHER_IS_BETTER: ReadonlySet<MetricId> = new Set<MetricId>([
  'throughputRealtime',
  'decodeFps',
  'encodeFps',
  'opsPerSec',
  'packetsPerSec',
  'framesPerSec',
  'sampleFramesPerSec',
]);

/** Canonical unit string for a metric ('ms' | 'x-realtime' | 'bytes' | 'count' | 'fps'). */
export function metricUnit(metric: MetricId): string {
  return METRIC_UNIT[metric];
}

/** True when a larger value is better (throughput / fps); false for wall / memory / I/O. */
export function metricHigherIsBetter(metric: MetricId): boolean {
  return HIGHER_IS_BETTER.has(metric);
}

/** Pull the chosen metric's numeric value out of a sample; null/undefined -> NaN (dropped later). */
export function metricSampleValue(metric: MetricId, sample: MetricSample): number {
  const raw = sample[METRIC_FIELD[metric]];
  return typeof raw === 'number' ? raw : Number.NaN;
}

/**
 * Run the benchmark protocol for one metric:
 *   - `warmup` unmeasured calls (priming JIT / caches / GPU; samples discarded),
 *   - then `iters` measured calls; one MetricSample is collected per measured iteration.
 * Each call receives its 0-based iteration index so the runner can rotate inputs / alternate A/B.
 * The chosen metric is extracted from every measured sample and summarized.
 */
export async function bench(
  metric: MetricId,
  run: (iter: number) => Promise<MetricSample>,
  opts?: BenchOptions,
): Promise<BenchSummary> {
  const warmup = opts?.warmup ?? DEFAULT_BENCH.warmup;
  const iters = opts?.iters ?? DEFAULT_BENCH.iters;

  // Warmup: run but discard. iter index is shared so a rotating source keeps advancing.
  for (let i = 0; i < warmup; i++) {
    await run(i);
  }

  const values: number[] = [];
  for (let i = 0; i < iters; i++) {
    const sample = await run(warmup + i);
    values.push(requireFiniteMetricSample(metric, sample, i));
  }

  return summarize(metric, values, warmup);
}

export class MetricProtocolError extends Error {
  readonly reasonCode: string;
  readonly metric: MetricId;
  readonly iteration: number;

  constructor(reasonCode: string, metric: MetricId, iteration: number, detail: string) {
    super(`[${reasonCode}] metric '${metric}' iteration ${iteration}: ${detail}`);
    this.name = 'MetricProtocolError';
    this.reasonCode = reasonCode;
    this.metric = metric;
    this.iteration = iteration;
  }
}

/** A promised metric must be present and finite in every measured repetition. */
export function requireFiniteMetricSample(
  metric: MetricId,
  sample: MetricSample,
  iteration: number,
): number {
  const value = metricSampleValue(metric, sample);
  if (!Number.isFinite(value)) {
    throw new MetricProtocolError(
      'METRIC_SAMPLE_NON_FINITE',
      metric,
      iteration,
      `${String(METRIC_FIELD[metric])} was missing, NaN, or infinite`,
    );
  }
  return value;
}

export interface AdaptiveBatchRequest {
  phase: 'warmup' | 'calibration' | 'measured';
  repetition: number;
  innerIterations: number;
}

export interface AdaptiveRawSample {
  repetition: number;
  innerIterations: number;
  wallMs: number;
  value: number;
}

export interface AdaptiveTimingProtocol {
  schema: 'media-test/adaptive-timing@1';
  minDurationMs: number;
  warmupCount: number;
  measuredCount: number;
  innerIterations: number;
  slowOperation: boolean;
  exploratory: boolean;
  timerResolutionMs: number | null;
}

export type ProtocolBenchSummary = BenchSummary & {
  sampleAxis: 'iteration';
  aggregation: 'median';
  requestedIterations: number;
  timerResolutionMs: number | null;
  timingProtocol: AdaptiveTimingProtocol;
};

export interface AdaptiveBenchmarkResult {
  summary: ProtocolBenchSummary;
  protocol: AdaptiveTimingProtocol;
  rawSamples: AdaptiveRawSample[];
}

/**
 * Calibrate an inner loop to a minimum monotonic-clock window, then collect independent repetitions.
 * The batch callback owns the actual operation loop and must return one sample for that exact batch.
 */
export async function adaptiveBench(
  metric: MetricId,
  runBatch: (request: AdaptiveBatchRequest) => Promise<MetricSample>,
  opts: BenchOptions = {},
  clock: () => number = monotonicNow,
): Promise<AdaptiveBenchmarkResult> {
  const warmup = integerAtLeast(opts.warmup ?? DEFAULT_BENCH.warmup, 0, 'warmup');
  const requested = integerAtLeast(opts.iters ?? DEFAULT_BENCH.iters, 1, 'iters');
  const minDurationMs = finitePositive(opts.minDurationMs ?? DEFAULT_BENCH.minDurationMs, 'minDurationMs');
  const minRepetitions = integerAtLeast(opts.minRepetitions ?? DEFAULT_BENCH.minRepetitions, 5, 'minRepetitions');
  const slowRepetitions = integerAtLeast(opts.slowRepetitions ?? DEFAULT_BENCH.slowRepetitions, 3, 'slowRepetitions');
  const maxInnerIterations = integerAtLeast(
    opts.maxInnerIterations ?? DEFAULT_BENCH.maxInnerIterations,
    1,
    'maxInnerIterations',
  );

  for (let i = 0; i < warmup; i++) {
    await runBatch({ phase: 'warmup', repetition: i, innerIterations: 1 });
  }

  let innerIterations = 1;
  let calibrationIndex = 0;
  let calibration = await runBatch({ phase: 'calibration', repetition: calibrationIndex, innerIterations });
  let calibrationWall = finitePositiveWall(calibration.batchWallMs ?? calibration.wallMs, metric, calibrationIndex);
  const slowOperation = calibrationWall >= minDurationMs;
  while (!slowOperation && calibrationWall < minDurationMs && innerIterations < maxInnerIterations) {
    const scaled = Math.ceil(innerIterations * Math.max(2, minDurationMs / calibrationWall));
    innerIterations = Math.min(maxInnerIterations, scaled);
    calibrationIndex += 1;
    calibration = await runBatch({ phase: 'calibration', repetition: calibrationIndex, innerIterations });
    calibrationWall = finitePositiveWall(calibration.batchWallMs ?? calibration.wallMs, metric, calibrationIndex);
  }

  const measuredCount = Math.max(requested, slowOperation ? slowRepetitions : minRepetitions);
  const rawSamples: AdaptiveRawSample[] = [];
  for (let repetition = 0; repetition < measuredCount; repetition++) {
    const sample = await runBatch({ phase: 'measured', repetition, innerIterations });
    const wallMs = finitePositiveWall(sample.batchWallMs ?? sample.wallMs, metric, repetition);
    const value = requireFiniteMetricSample(metric, sample, repetition);
    rawSamples.push({ repetition, innerIterations, wallMs, value });
  }

  const timerResolutionMs = measureTimerResolution(clock);
  const protocol: AdaptiveTimingProtocol = {
    schema: 'media-test/adaptive-timing@1',
    minDurationMs,
    warmupCount: warmup,
    measuredCount,
    innerIterations,
    slowOperation,
    exploratory: !slowOperation && calibrationWall < minDurationMs,
    timerResolutionMs,
  };
  const base = summarize(metric, rawSamples.map((sample) => sample.value), warmup);
  const summary: ProtocolBenchSummary = {
    ...base,
    sampleAxis: 'iteration',
    aggregation: 'median',
    requestedIterations: measuredCount,
    timerResolutionMs,
    timingProtocol: protocol,
  };
  return { summary, protocol, rawSamples };
}

export interface InterleavedBenchTurn {
  block: number;
  order: number;
  engineId: string;
  seed: string;
}

/** Deterministic randomized blocks: every engine occurs exactly once before the next repetition. */
export function createInterleavedBenchSchedule(
  engineIds: readonly string[],
  repetitions: number,
  seed: string,
): InterleavedBenchTurn[] {
  const unique = [...new Set(engineIds)];
  if (unique.length !== engineIds.length || unique.some((id) => id.trim().length === 0)) {
    throw new TypeError('engineIds must be unique non-empty strings');
  }
  integerAtLeast(repetitions, 1, 'repetitions');
  if (!seed) throw new TypeError('interleave seed must be non-empty');
  const schedule: InterleavedBenchTurn[] = [];
  for (let block = 0; block < repetitions; block++) {
    const blockSeed = `${seed}\u0000${block}`;
    const rng = mulberry32(hashSeed(blockSeed));
    const order = unique.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    order.forEach((engineId, index) => schedule.push({ block, order: index, engineId, seed: blockSeed }));
  }
  return schedule;
}

/** Smallest positive delta observed from the same monotonic clock used by the benchmark. */
export function measureTimerResolution(clock: () => number = monotonicNow, probes = 64): number | null {
  integerAtLeast(probes, 2, 'probes');
  let previous = clock();
  let resolution = Number.POSITIVE_INFINITY;
  for (let i = 1; i < probes; i++) {
    const current = clock();
    const delta = current - previous;
    if (Number.isFinite(delta) && delta > 0 && delta < resolution) resolution = delta;
    previous = current;
  }
  return Number.isFinite(resolution) ? resolution : null;
}

/**
 * Aggregate measured samples into a BenchSummary: median, p95 (nearest-rank), MAD (median absolute
 * deviation from the median). `n` reports the count of admissible (finite) samples actually used,
 * not the requested iteration count. Reporting converts an empty legacy summary to typed UNAVAILABLE;
 * measured protocols use requireFiniteMetricSample and never deliberately produce an empty summary.
 */
export function summarize(
  metric: MetricId,
  samples: number[],
  warmup: number,
  unit?: string,
): BenchSummary {
  const finite = samples.filter((v) => Number.isFinite(v));
  const med = median(finite);
  const dev = finite.map((v) => Math.abs(v - med));
  return {
    n: finite.length,
    warmup,
    metric,
    median: med,
    p95: percentileNearestRank(finite, 95),
    mad: median(dev),
    unit: unit ?? metricUnit(metric),
    samples: finite,
  };
}

export type CompareVerdict = 'faster' | 'slower' | 'within-noise';

/**
 * Compare a candidate summary against a reference summary on the SAME metric (and, by contract, the
 * same browser — never compare across browsers, §13). `deltaPct` is the candidate's median relative
 * to the reference median, expressed as a percentage, signed so that POSITIVE always means "better
 * for this metric": for lower-is-better metrics deltaPct = (ref - cand)/ref·100, for higher-is-better
 * deltaPct = (cand - ref)/ref·100. Any |deltaPct| within max(noiseBandPct, 3) is 'within-noise'.
 *
 * `higherIsBetter` overrides the metric-derived direction when the metrics differ; if omitted it is
 * inferred from the candidate's metric (matching the reference is the caller's responsibility).
 */
export function compareBench(
  reference: BenchSummary,
  candidate: BenchSummary,
  opts?: { noiseBandPct?: number; higherIsBetter?: boolean },
): { verdict: CompareVerdict; deltaPct: number } {
  const band = Math.max(opts?.noiseBandPct ?? DEFAULT_BENCH.noiseBandPct, MIN_NOISE_BAND_PCT);
  const higherIsBetter = opts?.higherIsBetter ?? metricHigherIsBetter(candidate.metric);

  const ref = reference.median;
  const cand = candidate.median;

  // Degenerate reference: cannot form a ratio. Equal → within-noise; otherwise direction-only.
  if (!Number.isFinite(ref) || ref === 0) {
    if (cand === ref) return { verdict: 'within-noise', deltaPct: 0 };
    const better = higherIsBetter ? cand > ref : cand < ref;
    return { verdict: better ? 'faster' : 'slower', deltaPct: 0 };
  }

  const rawPct = ((cand - ref) / ref) * 100;
  // Normalize sign so positive == better, regardless of metric direction.
  const deltaPct = higherIsBetter ? rawPct : -rawPct;
  const rounded = roundTo(deltaPct, 2);

  if (Math.abs(rounded) <= band) {
    return { verdict: 'within-noise', deltaPct: rounded };
  }
  return { verdict: rounded > 0 ? 'faster' : 'slower', deltaPct: rounded };
}

/**
 * Combine one metric's per-file values into the exhaustive-mode (§6.2) representative aggregate.
 * Direction-aware and physically meaningful:
 *   - higher-is-better RATE metrics (ops/s, fps, packets/s, x-realtime) → MEDIAN (summing rates is
 *     meaningless; the median per-file rate is the fair central value),
 *   - peakMemory → MAX (a peak across files is the worst peak, not a sum),
 *   - everything else (lower-is-better, additive cost: wall, I/O counts, bytesOut, latency) → SUM
 *     (total cost to process the whole candidate set — the owner's "sum, not average").
 * FAIR TO COMPARE ACROSS ENGINES ONLY over the same file set — the caller enforces coverage-first.
 * Returns NaN when there are no finite values.
 */
export interface BenchRatioComponent {
  identity: string;
  numerator: number;
  denominator: number;
}

export function combineMetricAcrossFiles(
  metric: MetricId,
  values: number[],
  ratioComponents?: readonly BenchRatioComponent[],
): number {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return Number.NaN;
  if (metricHigherIsBetter(metric)) {
    const ratio = ratioComponents && ratioComponents.length === finite.length
      ? ratioOfSums(ratioComponents)
      : undefined;
    return ratio ?? median(finite);
  }
  if (metric === 'peakMemory') return Math.max(...finite);
  return finite.reduce((a, b) => a + b, 0);
}

/**
 * Build an exhaustive-mode aggregate BenchSummary from per-file values: `.aggregate` is the combined
 * representative value (see combineMetricAcrossFiles), `.median`/`.p95`/`.mad` describe the per-file
 * SPREAD, `.samples` are the per-file values, and `.n` is the file count. Used by the runner to
 * collapse an exhaustive cell; the display / winner layers prefer `.aggregate` over `.median`.
 */
export function summarizeAcrossFiles(
  metric: MetricId,
  values: number[],
  warmup: number,
  unit?: string,
  ratioComponents?: readonly BenchRatioComponent[],
): BenchSummary {
  const base = summarize(metric, values, warmup, unit);
  const completeRatios = metricHigherIsBetter(metric) && ratioComponents?.length === base.n
    ? ratioComponents.map((component) => ({ ...component }))
    : undefined;
  return {
    ...base,
    aggregate: combineMetricAcrossFiles(metric, values, completeRatios),
    sampleAxis: 'file',
    aggregation: completeRatios ? 'ratio-of-sums' : metricHigherIsBetter(metric) ? 'median' : metric === 'peakMemory' ? 'max' : 'sum',
    ...(completeRatios ? { ratioComponents: completeRatios } : {}),
  } as BenchSummary;
}

// ── statistics helpers (pure) ──────────────────────────────────────────────────────────────────

/** Median of a numeric list; 0 for empty input. Sorts a copy (does not mutate the argument). */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid] ?? 0;
  }
  const lo = sorted[mid - 1] ?? 0;
  const hi = sorted[mid] ?? 0;
  return (lo + hi) / 2;
}

/**
 * Nearest-rank percentile (§10.2 reports p95). rank = ceil(p/100 · N), clamped to [1, N];
 * returns the value at that 1-based rank in the sorted list. 0 for empty input.
 */
function percentileNearestRank(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const idx = Math.min(Math.max(rank, 1), sorted.length) - 1;
  return sorted[idx] ?? 0;
}

function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

function ratioOfSums(components: readonly BenchRatioComponent[]): number | undefined {
  let numerator = 0;
  let denominator = 0;
  for (const component of components) {
    if (!Number.isFinite(component.numerator) || !Number.isFinite(component.denominator) || component.denominator <= 0) {
      return undefined;
    }
    numerator += component.numerator;
    denominator += component.denominator;
  }
  return denominator > 0 ? numerator / denominator : undefined;
}

function monotonicNow(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
  return Date.now();
}

function integerAtLeast(value: number, minimum: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${field} must be a safe integer >= ${minimum}`);
  }
  return value;
}

function finitePositive(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${field} must be finite and > 0`);
  return value;
}

function finitePositiveWall(value: number | undefined, metric: MetricId, iteration: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new MetricProtocolError('MEASURED_WINDOW_INVALID', metric, iteration, 'wallMs must be finite and > 0');
  }
  return value;
}
