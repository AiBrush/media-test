import { metricHigherIsBetter, metricUnit } from '../bench.ts';
import type { BenchSummary, MetricId } from '../scenario.ts';
import type {
  AvailableMetricObservation,
  ConfidenceInterval,
  MetricAggregation,
  MetricObservation,
  RatioComponent,
  SampleAxis,
  VariantObservation,
} from './model.ts';

interface ExtendedBenchSummary extends Omit<Partial<BenchSummary>, 'ratioComponents'> {
  sampleAxis?: SampleAxis;
  aggregation?: MetricAggregation;
  requestedIterations?: number;
  noiseBandPct?: number;
  empiricalNoisePct?: number;
  confidenceInterval?: Partial<ConfidenceInterval>;
  ratioComponents?: unknown;
  rawComponents?: unknown;
}

export interface NormalizeMetricOptions {
  sampleAxis?: SampleAxis;
  validVariantIds?: readonly string[];
  requestedIterations?: number;
  unavailableReasonCode?: string;
  unavailableReason?: string;
}

export function normalizeMetricObservation(
  metric: MetricId,
  value: unknown,
  options: NormalizeMetricOptions = {},
): MetricObservation {
  const direction = metricHigherIsBetter(metric) ? 'higher' : 'lower';
  const summary = asRecord(value) as ExtendedBenchSummary | undefined;
  const unit = typeof summary?.unit === 'string' && summary.unit.length > 0 ? summary.unit : metricUnit(metric);
  if (!summary) {
    return unavailable(metric, unit, direction, options.unavailableReasonCode ?? 'METRIC_NOT_OBSERVED', options.unavailableReason);
  }

  const samplesRaw = summary.samples;
  const n = summary.n;
  if (!Number.isInteger(n) || (n ?? 0) < 1 || !Array.isArray(samplesRaw) || samplesRaw.length < 1) {
    return unavailable(metric, unit, direction, 'NO_FINITE_SAMPLES', 'n=0 or the finite sample array is empty');
  }
  if (samplesRaw.length !== n || !samplesRaw.every(isFiniteNumber)) {
    return unavailable(
      metric,
      unit,
      direction,
      'INVALID_METRIC_SAMPLES',
      'n must equal the number of finite samples',
    );
  }
  if (!isFiniteNumber(summary.median) || !isFiniteNumber(summary.p95) || !isFiniteNumber(summary.mad)) {
    return unavailable(
      metric,
      unit,
      direction,
      'NON_FINITE_METRIC_STATISTIC',
      'median, p95, and MAD must all be finite',
    );
  }
  if (summary.mad < 0) {
    return unavailable(metric, unit, direction, 'INVALID_METRIC_MAD', 'MAD cannot be negative');
  }

  const samples = samplesRaw.slice();
  const sampleAxis = options.sampleAxis ?? validSampleAxis(summary.sampleAxis) ?? (summary.aggregate === undefined ? 'iteration' : 'file');
  const ratioComponents = parseRatioComponents(summary.ratioComponents ?? summary.rawComponents);
  const aggregation = chooseAggregation(metric, sampleAxis, summary.aggregation, ratioComponents, summary.aggregate);
  const rankedValue = combinedValue(metric, samples, summary.aggregate, aggregation, ratioComponents);
  if (!isFiniteNumber(rankedValue)) {
    return unavailable(metric, unit, direction, 'RANKED_VALUE_UNAVAILABLE', 'the declared aggregation has no finite value');
  }
  const empiricalNoisePct = finiteNonNegative(summary.empiricalNoisePct)
    ?? finiteNonNegative(summary.noiseBandPct)
    ?? empiricalMadBandPct(summary.median, summary.mad);
  const confidenceInterval = normalizeConfidenceInterval(summary.confidenceInterval, summary.median, summary.mad, n);
  const warmup = Number.isInteger(summary.warmup) && (summary.warmup ?? -1) >= 0 ? summary.warmup! : 0;
  const requestedIterations = positiveInteger(summary.requestedIterations)
    ?? positiveInteger(options.requestedIterations);
  const validVariantIds = [...new Set(options.validVariantIds ?? [])].sort();

  return {
    state: 'AVAILABLE',
    metric,
    unit,
    direction,
    sampleAxis,
    aggregation,
    n,
    warmup,
    ...(requestedIterations !== undefined ? { requestedIterations } : {}),
    samples,
    median: summary.median,
    p95: summary.p95,
    mad: summary.mad,
    rankedValue,
    ...(sampleAxis === 'file' || summary.aggregate !== undefined ? { aggregate: rankedValue } : {}),
    ...(ratioComponents.length > 0 ? { ratioComponents } : {}),
    validVariantIds,
    empiricalNoisePct,
    confidenceInterval,
  };
}

/** Build a file-axis observation from the exact correctness-valid variant set. */
export function summarizeMetricAcrossVariants(
  metric: MetricId,
  variants: readonly VariantObservation[],
): MetricObservation {
  const valid = variants
    .filter((variant) => variant.execution === 'EXECUTED' && (variant.verdict === 'PASS'))
    .map((variant) => ({
      variant,
      metric: variant.metrics.find((observation) => observation.metric === metric && observation.state === 'AVAILABLE'),
    }))
    .filter((entry): entry is { variant: VariantObservation; metric: AvailableMetricObservation } =>
      entry.metric?.state === 'AVAILABLE');
  if (valid.length === 0) {
    return unavailable(metric, metricUnit(metric), metricHigherIsBetter(metric) ? 'higher' : 'lower', 'METRIC_NOT_OBSERVED');
  }

  const unit = valid[0]!.metric.unit;
  const direction = valid[0]!.metric.direction;
  if (valid.some((entry) => entry.metric.unit !== unit || entry.metric.direction !== direction)) {
    return unavailable(metric, unit, direction, 'METRIC_PROTOCOL_MISMATCH', 'per-file units or directions differ');
  }
  const samples = valid.map((entry) => entry.metric.rankedValue);
  const ratioComponents = valid.flatMap((entry) => entry.metric.ratioComponents ?? []);
  const hasCompleteRatios = ratioComponents.length >= valid.length && valid.every((entry) => (entry.metric.ratioComponents?.length ?? 0) > 0);
  const aggregation = chooseAggregation(metric, 'file', undefined, hasCompleteRatios ? ratioComponents : [], undefined);
  const rankedValue = combinedValue(metric, samples, undefined, aggregation, ratioComponents);
  if (rankedValue === undefined || !Number.isFinite(rankedValue)) {
    return unavailable(metric, unit, direction, 'RANKED_VALUE_UNAVAILABLE', 'file aggregation has no finite value');
  }
  const sorted = samples.slice().sort((a, b) => a - b);
  const median = medianOfSorted(sorted);
  const mad = medianOfSorted(sorted.map((sample) => Math.abs(sample - median)).sort((a, b) => a - b));
  const p95 = percentileNearestRank(sorted, 0.95);
  const noise = empiricalMadBandPct(median, mad);
  const validVariantIds = valid.map((entry) => entry.variant.variantId).sort();

  return {
    state: 'AVAILABLE',
    metric,
    unit,
    direction,
    sampleAxis: 'file',
    aggregation,
    n: samples.length,
    warmup: Math.max(...valid.map((entry) => entry.metric.warmup)),
    samples,
    median,
    p95,
    mad,
    rankedValue,
    aggregate: rankedValue,
    ...(hasCompleteRatios ? { ratioComponents } : {}),
    validVariantIds,
    empiricalNoisePct: noise,
    confidenceInterval: robustConfidenceInterval(median, mad, samples.length),
  };
}

export function ratioOfSums(components: readonly RatioComponent[]): number | undefined {
  if (components.length === 0) return undefined;
  let numerator = 0;
  let denominator = 0;
  for (const component of components) {
    if (!isFiniteNumber(component.numerator) || !isFiniteNumber(component.denominator) || component.denominator < 0) {
      return undefined;
    }
    numerator += component.numerator;
    denominator += component.denominator;
  }
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return undefined;
  return numerator / denominator;
}

export function observationsUseSameProtocol(
  a: AvailableMetricObservation,
  b: AvailableMetricObservation,
): boolean {
  return a.metric === b.metric
    && a.unit === b.unit
    && a.direction === b.direction
    && a.aggregation === b.aggregation
    && a.sampleAxis === b.sampleAxis;
}

export function confidenceIntervalsOverlap(a: ConfidenceInterval, b: ConfidenceInterval): boolean {
  return a.low <= b.high && b.low <= a.high;
}

export function relativeDifferencePct(
  better: number,
  other: number,
  direction: AvailableMetricObservation['direction'],
): number {
  if (better === other) return 0;
  const scale = Math.max(Math.abs(better), Math.abs(other), Number.MIN_VALUE);
  const raw = ((better - other) / scale) * 100;
  return direction === 'higher' ? raw : -raw;
}

export function metricSortKey(observation: MetricObservation): string {
  return `${observation.metric}\u0000${observation.state}\u0000${observation.unit}`;
}

function combinedValue(
  metric: MetricId,
  samples: readonly number[],
  rawAggregate: unknown,
  aggregation: MetricAggregation,
  components: readonly RatioComponent[],
): number | undefined {
  if (aggregation === 'ratio-of-sums') return ratioOfSums(components);
  if (isFiniteNumber(rawAggregate)) return rawAggregate;
  if (aggregation === 'sum') return samples.reduce((total, sample) => total + sample, 0);
  if (aggregation === 'max') return Math.max(...samples);
  const sorted = samples.slice().sort((a, b) => a - b);
  return medianOfSorted(sorted);
}

function chooseAggregation(
  metric: MetricId,
  sampleAxis: SampleAxis,
  declared: unknown,
  ratioComponents: readonly RatioComponent[],
  aggregate: unknown,
): MetricAggregation {
  if (declared === 'median' || declared === 'sum' || declared === 'max' || declared === 'ratio-of-sums') {
    return declared;
  }
  if (sampleAxis === 'iteration') return 'median';
  if (metricHigherIsBetter(metric)) return ratioComponents.length > 0 ? 'ratio-of-sums' : 'median';
  if (metric === 'peakMemory') return 'max';
  return aggregate === undefined ? 'sum' : 'sum';
}

function normalizeConfidenceInterval(
  input: Partial<ConfidenceInterval> | undefined,
  median: number,
  mad: number,
  n: number,
): ConfidenceInterval {
  if (
    input
    && isFiniteNumber(input.low)
    && isFiniteNumber(input.high)
    && input.low <= input.high
    && isFiniteNumber(input.confidence)
    && input.confidence > 0
    && input.confidence < 1
    && typeof input.method === 'string'
    && input.method.length > 0
  ) {
    return { low: input.low, high: input.high, confidence: input.confidence, method: input.method };
  }
  return robustConfidenceInterval(median, mad, n);
}

function robustConfidenceInterval(median: number, mad: number, n: number): ConfidenceInterval {
  const halfWidth = n > 0 ? (1.96 * 1.4826 * mad) / Math.sqrt(n) : 0;
  return {
    low: median - halfWidth,
    high: median + halfWidth,
    confidence: 0.95,
    method: 'normal-approximation from scaled MAD',
  };
}

function parseRatioComponents(value: unknown): RatioComponent[] {
  if (!Array.isArray(value)) return [];
  const components: RatioComponent[] = [];
  for (let index = 0; index < value.length; index++) {
    const record = asRecord(value[index]);
    if (!record) return [];
    const numerator = record.numerator ?? record.work;
    const denominator = record.denominator ?? record.wallTime;
    if (!isFiniteNumber(numerator) || !isFiniteNumber(denominator) || denominator < 0) return [];
    components.push({
      identity: typeof record.identity === 'string' ? record.identity : typeof record.file === 'string' ? record.file : String(index),
      numerator,
      denominator,
    });
  }
  return components.sort((a, b) => a.identity.localeCompare(b.identity));
}

function unavailable(
  metric: MetricId,
  unit: string,
  direction: 'higher' | 'lower',
  reasonCode: string,
  reason?: string,
): MetricObservation {
  return { state: 'UNAVAILABLE', metric, unit, direction, reasonCode, ...(reason ? { reason } : {}) };
}

function validSampleAxis(value: unknown): SampleAxis | undefined {
  return value === 'iteration' || value === 'file' ? value : undefined;
}

function empiricalMadBandPct(median: number, mad: number): number {
  if (mad === 0) return 0;
  if (median === 0) return 100;
  return Math.abs((mad / median) * 100);
}

function finiteNonNegative(value: unknown): number | undefined {
  return isFiniteNumber(value) && value >= 0 ? value : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return Number.isInteger(value) && (value as number) > 0 ? (value as number) : undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function medianOfSorted(sorted: readonly number[]): number {
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function percentileNearestRank(sorted: readonly number[], percentile: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.max(0, Math.ceil(percentile * sorted.length) - 1);
  return sorted[index]!;
}
