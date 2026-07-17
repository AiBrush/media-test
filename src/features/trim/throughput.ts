import type { EffectiveTrimInterval, TrimRange } from './contracts.ts';
import { resolveEffectiveTrimInterval } from './contracts.ts';

export interface TrimThroughputEvidence {
  readonly effectiveInterval: EffectiveTrimInterval;
  readonly wallMs: number;
  readonly mediaSecondsProcessed: number;
  readonly throughputRealtime: number;
  readonly sourceBytesRead?: number;
  readonly outputDurationUs?: number;
  readonly bytesNeededForRetainedSamples?: number;
  readonly readAmplification?: number;
  readonly decodedBoundaryFrames?: number;
  readonly encodedBoundaryFrames?: number;
}

export function buildTrimThroughputEvidence(input: {
  requestedRange: TrimRange;
  presentedDurationUs: number;
  wallMs: number;
  sourceBytesRead?: number;
  outputDurationUs?: number;
  bytesNeededForRetainedSamples?: number;
  decodedBoundaryFrames?: number;
  encodedBoundaryFrames?: number;
}): TrimThroughputEvidence {
  if (!Number.isFinite(input.wallMs) || input.wallMs <= 0) throw new TypeError('trim wallMs must be finite and positive');
  const effectiveInterval = resolveEffectiveTrimInterval(input.requestedRange, input.presentedDurationUs);
  const mediaSecondsProcessed = effectiveInterval.effectiveDurationUs / 1_000_000;
  const readAmplification = input.sourceBytesRead !== undefined && input.bytesNeededForRetainedSamples !== undefined
    ? requireNonNegative(input.sourceBytesRead, 'sourceBytesRead') /
      requirePositive(input.bytesNeededForRetainedSamples, 'bytesNeededForRetainedSamples')
    : undefined;
  return Object.freeze({
    effectiveInterval,
    wallMs: input.wallMs,
    mediaSecondsProcessed,
    throughputRealtime: mediaSecondsProcessed / (input.wallMs / 1000),
    ...(input.sourceBytesRead !== undefined ? { sourceBytesRead: requireNonNegative(input.sourceBytesRead, 'sourceBytesRead') } : {}),
    ...(input.outputDurationUs !== undefined ? { outputDurationUs: requireNonNegative(input.outputDurationUs, 'outputDurationUs') } : {}),
    ...(input.bytesNeededForRetainedSamples !== undefined
      ? { bytesNeededForRetainedSamples: requirePositive(input.bytesNeededForRetainedSamples, 'bytesNeededForRetainedSamples') }
      : {}),
    ...(readAmplification !== undefined ? { readAmplification } : {}),
    ...(input.decodedBoundaryFrames !== undefined
      ? { decodedBoundaryFrames: requireNonNegative(input.decodedBoundaryFrames, 'decodedBoundaryFrames') }
      : {}),
    ...(input.encodedBoundaryFrames !== undefined
      ? { encodedBoundaryFrames: requireNonNegative(input.encodedBoundaryFrames, 'encodedBoundaryFrames') }
      : {}),
  });
}

function requireNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${label} must be finite and non-negative`);
  return value;
}

function requirePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${label} must be finite and positive`);
  return value;
}
