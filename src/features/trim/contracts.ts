import { finiteInteger, isRecord } from './types.ts';

export type TrimMode = 'copy' | 'frame-accurate';

/** Stable production routes carried by trim scenarios through the shared property oracle. */
export const TRIM_AUDIO_CONTENT_INVARIANT = 'trim-audio-content' as const;
export const TRIM_FEATURE_PROPERTIES_INVARIANT = 'trim-feature-properties' as const;
export const TRIM_NOOP_IDENTITY_INVARIANT = 'trim-noop-semantic-identity' as const;

export interface TrimRange {
  readonly startUs: number;
  readonly endUs: number;
}

export interface EffectiveTrimInterval {
  readonly requested: TrimRange;
  readonly effective: TrimRange;
  readonly requestedDurationUs: number;
  readonly effectiveDurationUs: number;
  readonly clampedAtEnd: boolean;
  readonly outputOriginUs: 0;
}

export interface TrimContract {
  readonly schema: 'media-test/trim-contract@1';
  readonly container: string;
  readonly mode: TrimMode;
  readonly range: TrimRange;
  readonly outputOrigin: 'zero';
  readonly fragmentedOutput: boolean;
}

export class TrimRangeError extends RangeError {
  override readonly name = 'TrimRangeError';

  constructor(readonly reasonCode: string, message: string) {
    super(message);
  }
}

/** Strictly parse the authored trim option vocabulary. Invalid ranges stay malformed-input errors. */
export function trimContractFromOptions(options: unknown): TrimContract {
  if (!isRecord(options)) throw new TypeError('trim options must be an object');
  const container = requireToken(options.container, 'container');
  const rangeObject = isRecord(options.range) ? options.range : options;
  const range = requireTrimRange({ startUs: rangeObject.startUs, endUs: rangeObject.endUs });
  if (options.frameAccurate !== undefined && typeof options.frameAccurate !== 'boolean') {
    throw new TypeError('frameAccurate must be boolean');
  }
  if (options.fragmented !== undefined && typeof options.fragmented !== 'boolean') {
    throw new TypeError('fragmented must be boolean');
  }
  return Object.freeze({
    schema: 'media-test/trim-contract@1' as const,
    container,
    mode: options.frameAccurate === true ? 'frame-accurate' : 'copy',
    range,
    outputOrigin: 'zero' as const,
    fragmentedOutput: options.fragmented === true,
  });
}

/** Scenario-level feature requirements are part of the authored output contract, not only caps. */
export function trimContractForScenario(scenario: {
  options?: unknown;
  requires?: { features?: readonly string[] };
}): TrimContract {
  const base = trimContractFromOptions(scenario.options);
  const fragmentedOutput = base.fragmentedOutput || scenario.requires?.features?.includes('fragmented') === true;
  return fragmentedOutput === base.fragmentedOutput
    ? base
    : Object.freeze({ ...base, fragmentedOutput });
}

export function requireTrimRange(value: { startUs: unknown; endUs: unknown }): TrimRange {
  if (!finiteInteger(value.startUs) || !finiteInteger(value.endUs)) {
    throw new TrimRangeError('TRIM_RANGE_NON_FINITE', 'trim range timestamps must be finite safe-integer microseconds');
  }
  if (value.startUs < 0) {
    throw new TrimRangeError('TRIM_RANGE_NEGATIVE_START', 'trim start must be non-negative');
  }
  if (value.endUs <= value.startUs) {
    throw new TrimRangeError('TRIM_RANGE_EMPTY_OR_INVERTED', 'trim end must be greater than start');
  }
  return Object.freeze({ startUs: value.startUs, endUs: value.endUs });
}

/** Resolve [start,end) on the presented timeline. A valid end beyond EOF is clamped, never rejected. */
export function resolveEffectiveTrimInterval(
  requested: TrimRange,
  presentedDurationUs: number,
): EffectiveTrimInterval {
  const range = requireTrimRange(requested);
  if (!finiteInteger(presentedDurationUs) || presentedDurationUs <= 0) {
    throw new TrimRangeError('TRIM_PRESENTATION_DURATION_INVALID', 'presented duration must be a positive safe-integer microsecond value');
  }
  if (range.startUs >= presentedDurationUs) {
    throw new TrimRangeError('TRIM_RANGE_START_PAST_PRESENTATION', 'trim start is outside the presented timeline');
  }
  const effectiveEndUs = Math.min(range.endUs, presentedDurationUs);
  return Object.freeze({
    requested: range,
    effective: Object.freeze({ startUs: range.startUs, endUs: effectiveEndUs }),
    requestedDurationUs: range.endUs - range.startUs,
    effectiveDurationUs: effectiveEndUs - range.startUs,
    clampedAtEnd: effectiveEndUs !== range.endUs,
    outputOriginUs: 0 as const,
  });
}

export function intervalsIntersect(a: TrimRange, b: TrimRange): boolean {
  return a.startUs < b.endUs && b.startUs < a.endUs;
}

function requireToken(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(value)) {
    throw new TypeError(`${field} must be a canonical token`);
  }
  return value;
}
