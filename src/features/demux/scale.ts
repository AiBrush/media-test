export type DemuxScaleBucket = 'large' | 'huge' | 'massive';

export interface DemuxScaleLimits {
  readonly peakMemoryDeltaBytes: number;
  readonly sourceReadCalls: number;
  readonly sourceReadAmplification: number;
  readonly longestLongTaskMs: number;
  readonly totalLongTaskMs: number;
  readonly firstPacketMs: number;
  readonly lastPacketMs: number;
}

export interface DemuxScaleContract {
  readonly schema: 'media-test/demux-scale-contract@1';
  readonly bucket: DemuxScaleBucket;
  /** Full scans may compete; the trace must still disclose the bytes and cannot claim lazy access. */
  readonly readPolicy: 'full-scan-permitted-observed';
  readonly limits: DemuxScaleLimits;
}

export interface DemuxScaleObservation {
  readonly schema: 'media-test/demux-scale-observation@1';
  readonly assetBytes: number;
  readonly peakMemoryDeltaBytes?: number;
  readonly sourceReadCalls?: number;
  readonly sourceBytesRead?: number;
  readonly longestLongTaskMs?: number;
  readonly totalLongTaskMs?: number;
  readonly firstPacketMs?: number;
  readonly lastPacketMs?: number;
  readonly timedOut?: boolean;
}

export type DemuxScaleAssessment =
  | Readonly<{
      state: 'PASS' | 'FAIL';
      reasonCode: string;
      detail: string;
      measurements: Record<string, number>;
    }>
  | Readonly<{
      state: 'UNAVAILABLE';
      status: 'NA_ENGINE' | 'NA_BROWSER';
      reasonCode: string;
      detail: string;
      missingFields: readonly string[];
    }>
  | Readonly<{ state: 'ERROR'; reasonCode: string; detail: string }>;

const MIB = 1024 * 1024;

/** Explicit, committed thresholds for every at-scale demux rung. */
export function defineDemuxScaleContract(bucket: DemuxScaleBucket): DemuxScaleContract {
  const limits: Record<DemuxScaleBucket, DemuxScaleLimits> = {
    large: {
      peakMemoryDeltaBytes: 256 * MIB,
      sourceReadCalls: 16_384,
      sourceReadAmplification: 1.5,
      longestLongTaskMs: 250,
      totalLongTaskMs: 5_000,
      firstPacketMs: 5_000,
      lastPacketMs: 120_000,
    },
    huge: {
      peakMemoryDeltaBytes: 384 * MIB,
      sourceReadCalls: 32_768,
      sourceReadAmplification: 1.5,
      longestLongTaskMs: 500,
      totalLongTaskMs: 15_000,
      firstPacketMs: 10_000,
      lastPacketMs: 600_000,
    },
    massive: {
      peakMemoryDeltaBytes: 512 * MIB,
      sourceReadCalls: 65_536,
      sourceReadAmplification: 1.5,
      longestLongTaskMs: 1_000,
      totalLongTaskMs: 30_000,
      firstPacketMs: 15_000,
      lastPacketMs: 600_000,
    },
  };
  return deepFreeze({
    schema: 'media-test/demux-scale-contract@1' as const,
    bucket,
    readPolicy: 'full-scan-permitted-observed' as const,
    limits: { ...limits[bucket] },
  });
}

export function demuxScaleContractFromOptions(options: unknown): DemuxScaleContract | undefined {
  if (!isRecord(options) || !isRecord(options.robustness)) return undefined;
  const value = options.robustness;
  if (value.schema !== 'media-test/demux-scale-contract@1') return undefined;
  if (value.bucket !== 'large' && value.bucket !== 'huge' && value.bucket !== 'massive') return undefined;
  if (value.readPolicy !== 'full-scan-permitted-observed' || !isRecord(value.limits)) return undefined;
  const limits = value.limits;
  const required = [
    'peakMemoryDeltaBytes', 'sourceReadCalls', 'sourceReadAmplification', 'longestLongTaskMs',
    'totalLongTaskMs', 'firstPacketMs', 'lastPacketMs',
  ];
  if (!required.every((field) => finitePositive(limits[field]))) return undefined;
  return value as unknown as DemuxScaleContract;
}

/** Evaluate the full observation together; absent instruments are labelled, never coerced to zero. */
export function assessDemuxScale(
  contract: DemuxScaleContract,
  observation: DemuxScaleObservation,
): DemuxScaleAssessment {
  if (observation.schema !== 'media-test/demux-scale-observation@1' ||
      !Number.isSafeInteger(observation.assetBytes) || observation.assetBytes <= 0) {
    return { state: 'ERROR', reasonCode: 'DEMUX_SCALE_OBSERVATION_INVALID', detail: 'scale observation schema/asset byte count is invalid' };
  }
  if (observation.timedOut) {
    return {
      state: 'FAIL', reasonCode: 'DEMUX_SCALE_TIMEOUT', detail: `${contract.bucket} demux exceeded its hard deadline`,
      measurements: { assetBytes: observation.assetBytes, lastPacketBudgetMs: contract.limits.lastPacketMs },
    };
  }

  const fields = [
    'peakMemoryDeltaBytes', 'sourceReadCalls', 'sourceBytesRead', 'longestLongTaskMs',
    'totalLongTaskMs', 'firstPacketMs', 'lastPacketMs',
  ] as const;
  const invalid = fields.find((field) => observation[field] !== undefined && !finiteNonNegative(observation[field]));
  if (invalid) {
    return { state: 'ERROR', reasonCode: 'DEMUX_SCALE_COUNTER_INVALID', detail: `${invalid} must be finite and non-negative` };
  }
  const missing = fields.filter((field) => observation[field] === undefined);
  if (missing.length > 0) {
    const browserFields = new Set(['peakMemoryDeltaBytes', 'longestLongTaskMs', 'totalLongTaskMs']);
    const onlyBrowser = missing.every((field) => browserFields.has(field));
    return {
      state: 'UNAVAILABLE',
      status: onlyBrowser ? 'NA_BROWSER' : 'NA_ENGINE',
      reasonCode: onlyBrowser ? 'DEMUX_SCALE_BROWSER_INSTRUMENT_UNAVAILABLE' : 'DEMUX_SCALE_ADAPTER_TRACE_UNAVAILABLE',
      detail: `scale claim is not rankable without ${missing.join(', ')}`,
      missingFields: Object.freeze([...missing]),
    };
  }

  const observed = observation as Required<DemuxScaleObservation>;
  const amplification = observed.sourceBytesRead / observed.assetBytes;
  const measurements: Record<string, number> = {
    assetBytes: observed.assetBytes,
    peakMemoryDeltaBytes: observed.peakMemoryDeltaBytes,
    sourceReadCalls: observed.sourceReadCalls,
    sourceBytesRead: observed.sourceBytesRead,
    sourceReadAmplification: amplification,
    longestLongTaskMs: observed.longestLongTaskMs,
    totalLongTaskMs: observed.totalLongTaskMs,
    firstPacketMs: observed.firstPacketMs,
    lastPacketMs: observed.lastPacketMs,
    peakMemoryBudgetBytes: contract.limits.peakMemoryDeltaBytes,
    sourceReadCallBudget: contract.limits.sourceReadCalls,
    sourceReadAmplificationBudget: contract.limits.sourceReadAmplification,
    longestLongTaskBudgetMs: contract.limits.longestLongTaskMs,
    totalLongTaskBudgetMs: contract.limits.totalLongTaskMs,
    firstPacketBudgetMs: contract.limits.firstPacketMs,
    lastPacketBudgetMs: contract.limits.lastPacketMs,
  };
  const exceeded: string[] = [];
  if (observed.peakMemoryDeltaBytes > contract.limits.peakMemoryDeltaBytes) exceeded.push('peak memory');
  if (observed.sourceReadCalls > contract.limits.sourceReadCalls) exceeded.push('source read calls');
  if (amplification > contract.limits.sourceReadAmplification) exceeded.push('source read amplification');
  if (observed.longestLongTaskMs > contract.limits.longestLongTaskMs) exceeded.push('longest long task');
  if (observed.totalLongTaskMs > contract.limits.totalLongTaskMs) exceeded.push('total long tasks');
  if (observed.firstPacketMs > contract.limits.firstPacketMs) exceeded.push('first packet latency');
  if (observed.lastPacketMs > contract.limits.lastPacketMs) exceeded.push('last packet latency');
  return exceeded.length > 0
    ? {
        state: 'FAIL', reasonCode: 'DEMUX_SCALE_BUDGET_EXCEEDED',
        detail: `${contract.bucket} demux exceeded: ${exceeded.join(', ')}`,
        measurements,
      }
    : {
        state: 'PASS', reasonCode: 'DEMUX_SCALE_BUDGETS_MET',
        detail: `${contract.bucket} demux met memory, read, long-task, and first/last-packet budgets`,
        measurements,
      };
}

function finitePositive(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function finiteNonNegative(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze<T extends object>(value: T): T {
  Object.freeze(value);
  for (const item of Object.values(value)) {
    if (item && typeof item === 'object' && !Object.isFrozen(item)) Object.freeze(item);
  }
  return value;
}
