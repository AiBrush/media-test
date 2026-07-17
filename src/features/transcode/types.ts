import type {
  MetricId,
  OracleId,
  OracleUnavailableStatus,
  OracleVerdict,
} from '../../core/scenario.ts';

/** Family-local decision. Oracle code adds its own OracleId envelope at the shared boundary. */
export type TranscodeDecision =
  | Readonly<{
      state: 'VERDICT';
      verdict: OracleVerdict;
      reasonCode: string;
      detail: string;
      measurements?: Readonly<Record<string, number>>;
    }>
  | Readonly<{
      state: 'UNAVAILABLE';
      status: OracleUnavailableStatus;
      reasonCode: string;
      detail: string;
      measurements?: Readonly<Record<string, number>>;
    }>
  | Readonly<{
      state: 'ERROR';
      reasonCode: string;
      detail: string;
      measurements?: Readonly<Record<string, number>>;
    }>;

export function transcodeVerdict(
  verdict: OracleVerdict,
  reasonCode: string,
  detail: string,
  measurements?: Readonly<Record<string, number>>,
): TranscodeDecision {
  return Object.freeze({
    state: 'VERDICT' as const,
    verdict,
    reasonCode,
    detail,
    ...(measurements ? { measurements: Object.freeze({ ...measurements }) } : {}),
  });
}

export function transcodeUnavailable(
  status: OracleUnavailableStatus,
  reasonCode: string,
  detail: string,
  measurements?: Readonly<Record<string, number>>,
): TranscodeDecision {
  return Object.freeze({
    state: 'UNAVAILABLE' as const,
    status,
    reasonCode,
    detail,
    ...(measurements ? { measurements: Object.freeze({ ...measurements }) } : {}),
  });
}

export function transcodeError(
  reasonCode: string,
  detail: string,
  measurements?: Readonly<Record<string, number>>,
): TranscodeDecision {
  return Object.freeze({
    state: 'ERROR' as const,
    reasonCode,
    detail,
    ...(measurements ? { measurements: Object.freeze({ ...measurements }) } : {}),
  });
}

/**
 * The metric gate consumes the same typed evidence vocabulary as the shared oracle reducer, but
 * remains family-local so feature code never needs to import the oracle implementation module.
 */
export type TranscodeOracleEvidence =
  | Readonly<{
      oracle: OracleId;
      state: 'VERDICT';
      verdict: OracleVerdict;
      reasonCode: string;
      detail?: string;
      measurements?: Readonly<Record<string, number>>;
    }>
  | Readonly<{
      oracle: OracleId;
      state: 'UNAVAILABLE';
      status: OracleUnavailableStatus;
      reasonCode: string;
      detail: string;
      measurements?: Readonly<Record<string, number>>;
    }>
  | Readonly<{
      oracle: OracleId;
      state: 'ERROR';
      reasonCode: string;
      detail: string;
      measurements?: Readonly<Record<string, number>>;
    }>;

export interface NamedQuantity<Source extends string = string> {
  readonly name: string;
  readonly value: number;
  readonly unit: string;
  /** Exact observer, never explanatory prose such as "estimated". */
  readonly source: Source;
}

export type TranscodeRateNumeratorSource =
  | 'neutral-output-sample-table'
  | 'neutral-output-packet-table'
  | 'neutral-output-audio-timeline'
  | 'neutral-output-presentation-timeline'
  | 'decoded-frame-sink'
  | 'encoded-chunk-sink'
  | 'adapter-final-counter'
  | 'exact-output-byte-length'
  | 'measured-operation-count';

export type TranscodeRateDenominatorSource = 'monotonic-operation-window';

export interface TranscodeRateEvidence {
  readonly metric: MetricId;
  readonly numerator: NamedQuantity<TranscodeRateNumeratorSource>;
  readonly denominator: NamedQuantity<TranscodeRateDenominatorSource>;
  readonly value: number;
  readonly associatedVerdict: Extract<OracleVerdict, 'PASS' | 'DIFF'>;
}

export function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
