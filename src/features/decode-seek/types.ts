import type { OracleVerdict } from '../../core/scenario.ts';

/** A family-local semantic decision that an oracle can envelope without re-interpreting prose. */
export interface DecodeSeekVerdict {
  readonly state: 'VERDICT';
  readonly verdict: OracleVerdict;
  readonly reasonCode: string;
  readonly detail: string;
  readonly measurements?: Readonly<Record<string, number>>;
}

export function decodeSeekVerdict(
  verdict: OracleVerdict,
  reasonCode: string,
  detail: string,
  measurements?: Readonly<Record<string, number>>,
): DecodeSeekVerdict {
  return Object.freeze({
    state: 'VERDICT',
    verdict,
    reasonCode,
    detail,
    ...(measurements ? { measurements: Object.freeze({ ...measurements }) } : {}),
  });
}

export function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
