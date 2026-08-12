import { contractError, verdict, type ProbeContractAssessment } from './types.ts';
import type { ProbeReadMode } from '../../core/engine.ts';

export type { ProbeReadMode } from '../../core/engine.ts';

export const PROBE_BUDGET_SCHEMA = 'media-test/probe-budget@1' as const;

export type ProbeScale = 'large' | 'huge' | 'massive';

export interface ProbeBudgetContract {
  schema: typeof PROBE_BUDGET_SCHEMA;
  scale: ProbeScale;
  allowedReadModes: readonly Exclude<ProbeReadMode, 'whole-file'>[];
  maxBytesRead: number;
  maxReadFraction: number;
  maxPeakMemoryDeltaBytes: number;
}

export interface ProbeBudgetObservation {
  inputSizeBytes: number;
  readMode?: ProbeReadMode;
  bytesRead?: number;
  peakMemoryDeltaBytes?: number;
  memoryBaselineBytes?: number;
  memoryMaximumBytes?: number;
  memoryAfterOperationBytes?: number;
}

export type ProbeBudgetPreflightDecision =
  | { supported: true; readMode: Exclude<ProbeReadMode, 'whole-file'> }
  | {
      supported: false;
      reasonCode: 'PROBE_BOUNDED_READ_MODE_UNAVAILABLE';
      detail: string;
      tuple: { scale: ProbeScale; inputSizeBytes: number; allowedReadModes: readonly string[] };
    };

export const PROBE_SCALE_BUDGETS: Readonly<Record<ProbeScale, ProbeBudgetContract>> = Object.freeze({
  large: Object.freeze({
    schema: PROBE_BUDGET_SCHEMA,
    scale: 'large',
    allowedReadModes: Object.freeze(['range', 'progressive'] as const),
    maxBytesRead: 16 * 1024 * 1024,
    maxReadFraction: 0.2,
    maxPeakMemoryDeltaBytes: 64 * 1024 * 1024,
  }),
  huge: Object.freeze({
    schema: PROBE_BUDGET_SCHEMA,
    scale: 'huge',
    allowedReadModes: Object.freeze(['range', 'progressive'] as const),
    maxBytesRead: 24 * 1024 * 1024,
    maxReadFraction: 0.08,
    maxPeakMemoryDeltaBytes: 96 * 1024 * 1024,
  }),
  massive: Object.freeze({
    schema: PROBE_BUDGET_SCHEMA,
    scale: 'massive',
    allowedReadModes: Object.freeze(['range', 'progressive'] as const),
    maxBytesRead: 32 * 1024 * 1024,
    maxReadFraction: 0.04,
    maxPeakMemoryDeltaBytes: 128 * 1024 * 1024,
  }),
});

export function defineProbeBudgetContract(
  value: Omit<ProbeBudgetContract, 'schema'>,
): ProbeBudgetContract {
  if (!['large', 'huge', 'massive'].includes(value.scale)) throw new TypeError('probe scale is invalid');
  if (!value.allowedReadModes.length || value.allowedReadModes.some((mode) => mode !== 'range' && mode !== 'progressive')) {
    throw new TypeError('probe budget needs at least one bounded read mode');
  }
  for (const [name, number] of Object.entries({
    maxBytesRead: value.maxBytesRead,
    maxReadFraction: value.maxReadFraction,
    maxPeakMemoryDeltaBytes: value.maxPeakMemoryDeltaBytes,
  })) {
    if (!Number.isFinite(number) || number < 0) throw new TypeError(`${name} must be finite and non-negative`);
  }
  if (value.maxReadFraction > 1) throw new TypeError('maxReadFraction must be at most 1');
  return Object.freeze({
    schema: PROBE_BUDGET_SCHEMA,
    scale: value.scale,
    allowedReadModes: Object.freeze([...new Set(value.allowedReadModes)]),
    maxBytesRead: value.maxBytesRead,
    maxReadFraction: value.maxReadFraction,
    maxPeakMemoryDeltaBytes: value.maxPeakMemoryDeltaBytes,
  });
}

export function probeBudgetPreflight(
  contract: ProbeBudgetContract,
  inputSizeBytes: number,
  adapterReadModes: readonly ProbeReadMode[],
): ProbeBudgetPreflightDecision {
  const selected = contract.allowedReadModes.find((mode) => adapterReadModes.includes(mode));
  if (selected) return { supported: true, readMode: selected };
  return {
    supported: false,
    reasonCode: 'PROBE_BOUNDED_READ_MODE_UNAVAILABLE',
    detail: `adapter exposes ${adapterReadModes.join(', ') || 'no read mode'} but ${contract.scale} probe requires ` +
      `${contract.allowedReadModes.join(' or ')}`,
    tuple: { scale: contract.scale, inputSizeBytes, allowedReadModes: [...contract.allowedReadModes] },
  };
}

export function assessProbeBudget(
  contract: ProbeBudgetContract,
  observation: ProbeBudgetObservation,
): ProbeContractAssessment {
  if (contract.schema !== PROBE_BUDGET_SCHEMA) {
    return contractError('PROBE_BUDGET_SCHEMA_INVALID', 'probe budget has an unsupported schema');
  }
  if (!Number.isFinite(observation.inputSizeBytes) || observation.inputSizeBytes <= 0) {
    return contractError('PROBE_INPUT_SIZE_INVALID', 'probe budget needs the verified positive input byte length');
  }
  if (observation.readMode === undefined) {
    return contractError(
      'PROBE_READ_MODE_EVIDENCE_MISSING',
      `${contract.scale} probe returned no adapter-owned source-read mode evidence`,
    );
  }
  if (!contract.allowedReadModes.includes(observation.readMode as Exclude<ProbeReadMode, 'whole-file'>)) {
    return verdict(
      'FAIL',
      'PROBE_READ_MODE_CONTRACT_VIOLATION',
      `${contract.scale} probe used '${observation.readMode}' instead of ${contract.allowedReadModes.join(' or ')}`,
      { inputSizeBytes: observation.inputSizeBytes },
    );
  }
  if (observation.bytesRead === undefined) {
    return contractError(
      'PROBE_SOURCE_READ_TELEMETRY_MISSING',
      `${contract.scale} probe claimed a bounded read mode without source-read telemetry`,
    );
  }
  if (!Number.isFinite(observation.bytesRead) || observation.bytesRead < 0) {
    return contractError('PROBE_SOURCE_READ_TELEMETRY_INVALID', 'source-read telemetry is not finite and non-negative');
  }
  if (observation.peakMemoryDeltaBytes === undefined) {
    return contractError(
      'PROBE_PEAK_MEMORY_TELEMETRY_MISSING',
      `${contract.scale} probe has no operation-relative peak-memory evidence`,
    );
  }
  if (!Number.isFinite(observation.peakMemoryDeltaBytes) || observation.peakMemoryDeltaBytes < 0) {
    return contractError('PROBE_PEAK_MEMORY_TELEMETRY_INVALID', 'peak-memory delta is not finite and non-negative');
  }

  const effectiveReadLimit = Math.min(
    contract.maxBytesRead,
    observation.inputSizeBytes * contract.maxReadFraction,
  );
  const measurements = {
    inputSizeBytes: observation.inputSizeBytes,
    bytesRead: observation.bytesRead,
    readFraction: observation.bytesRead / observation.inputSizeBytes,
    effectiveReadLimitBytes: effectiveReadLimit,
    peakMemoryDeltaBytes: observation.peakMemoryDeltaBytes,
    peakMemoryLimitBytes: contract.maxPeakMemoryDeltaBytes,
    ...(observation.memoryBaselineBytes === undefined
      ? {}
      : { memoryBaselineBytes: observation.memoryBaselineBytes }),
    ...(observation.memoryMaximumBytes === undefined
      ? {}
      : { memoryMaximumBytes: observation.memoryMaximumBytes }),
    ...(observation.memoryAfterOperationBytes === undefined
      ? {}
      : { memoryAfterOperationBytes: observation.memoryAfterOperationBytes }),
  };
  const failures: string[] = [];
  if (observation.bytesRead > effectiveReadLimit) {
    failures.push(`read ${observation.bytesRead} bytes > effective limit ${effectiveReadLimit}`);
  }
  if (observation.peakMemoryDeltaBytes > contract.maxPeakMemoryDeltaBytes) {
    failures.push(
      `peak-memory delta ${observation.peakMemoryDeltaBytes} bytes > ${contract.maxPeakMemoryDeltaBytes}`,
    );
  }
  if (failures.length) {
    return verdict('FAIL', 'PROBE_SCALE_BUDGET_EXCEEDED', failures.join('; '), measurements, {
      contract,
      observation,
    });
  }
  return verdict(
    'PASS',
    'PROBE_SCALE_BUDGET_MET',
    `${contract.scale} probe stayed within declared source-read and peak-memory budgets`,
    measurements,
    { contract, observation },
  );
}

export function probeBudgetFromOptions(options: unknown): ProbeBudgetContract | undefined {
  if (!isRecord(options)) return undefined;
  const direct = options.probeBudget;
  const robustness = isRecord(options.robustness) ? options.robustness : undefined;
  const probe = isRecord(robustness?.probe) ? robustness.probe : undefined;
  const candidate = direct ?? probe?.probeBudget;
  if (!isRecord(candidate) || candidate.schema !== PROBE_BUDGET_SCHEMA) return undefined;
  if (
    !isScale(candidate.scale) ||
    !Array.isArray(candidate.allowedReadModes) ||
    !candidate.allowedReadModes.every((mode) => mode === 'range' || mode === 'progressive') ||
    typeof candidate.maxBytesRead !== 'number' ||
    typeof candidate.maxReadFraction !== 'number' ||
    typeof candidate.maxPeakMemoryDeltaBytes !== 'number'
  ) {
    return undefined;
  }
  try {
    return defineProbeBudgetContract({
      scale: candidate.scale,
      allowedReadModes: candidate.allowedReadModes,
      maxBytesRead: candidate.maxBytesRead,
      maxReadFraction: candidate.maxReadFraction,
      maxPeakMemoryDeltaBytes: candidate.maxPeakMemoryDeltaBytes,
    });
  } catch {
    return undefined;
  }
}

function isScale(value: unknown): value is ProbeScale {
  return value === 'large' || value === 'huge' || value === 'massive';
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
