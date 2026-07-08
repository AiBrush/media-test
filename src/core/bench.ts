/**
 * src/core/bench.ts — the benchmark protocol (§10.2) + summary statistics + A/B comparison.
 *
 * Pure computation: no DOM, no Worker, no Node-only API. `bench()` orchestrates warmup + measured
 * iterations of a caller-supplied `run` (which performs ONE measured op and returns a MetricSample),
 * pulls the chosen metric out of each sample, and `summarize()`s it (median / p95 / MAD).
 * `compareBench()` turns a reference vs candidate pair into a direction-aware verdict, treating any
 * delta inside the noise band as 'within-noise' (rule §10 / §15: no within-noise "improvement").
 *
 * Metric direction is fixed here (single source of truth): wall / memory / I/O counts / longtasks /
 * bytesOut are lower-is-better; throughput×realtime and decode/encode fps are higher-is-better.
 */

import type { BenchSummary, MetricId, MetricSample } from './scenario.ts';

export interface BenchOptions {
  /** unmeasured priming iterations run before measurement (default 1). */
  warmup?: number;
  /** measured iterations whose samples feed the summary (default 1). */
  iters?: number;
  /** |deltaPct| at or below this (floored at 3) is reported as within-noise (default 3). */
  noiseBandPct?: number;
}

export const DEFAULT_BENCH: Required<BenchOptions> = { warmup: 1, iters: 1, noiseBandPct: 3 };

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
    const value = metricSampleValue(metric, sample);
    if (Number.isFinite(value)) values.push(value);
  }

  return summarize(metric, values, warmup);
}

/**
 * Aggregate measured samples into a BenchSummary: median, p95 (nearest-rank), MAD (median absolute
 * deviation from the median). `n` reports the count of admissible (finite) samples actually used,
 * not the requested iteration count. Empty input yields zeros (and is surfaced as n=0).
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
export function combineMetricAcrossFiles(metric: MetricId, values: number[]): number {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return Number.NaN;
  if (metricHigherIsBetter(metric)) return median(finite);
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
): BenchSummary {
  const base = summarize(metric, values, warmup, unit);
  return { ...base, aggregate: combineMetricAcrossFiles(metric, values) };
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
