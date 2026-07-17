import type { OracleVerdict } from '../../core/scenario.ts';

export const MUX_CONTRACT_SCHEMA = 'media-test/mux-contract@1' as const;

export type MuxDecision =
  | Readonly<{
      state: 'VERDICT';
      verdict: OracleVerdict;
      reasonCode: string;
      detail: string;
      measurements?: Readonly<Record<string, number>>;
    }>
  | Readonly<{
      state: 'UNAVAILABLE';
      status: 'NA_ASSET' | 'NA_BROWSER';
      reasonCode: string;
      detail: string;
    }>
  | Readonly<{
      state: 'ERROR';
      reasonCode: string;
      detail: string;
    }>;

export function muxVerdict(
  verdict: OracleVerdict,
  reasonCode: string,
  detail: string,
  measurements?: Readonly<Record<string, number>>,
): MuxDecision {
  return Object.freeze({
    state: 'VERDICT' as const,
    verdict,
    reasonCode: muxReasonCode(reasonCode),
    detail,
    ...(measurements ? { measurements: Object.freeze({ ...measurements }) } : {}),
  });
}

export function muxUnavailable(
  status: 'NA_ASSET' | 'NA_BROWSER',
  reasonCode: string,
  detail: string,
): MuxDecision {
  return Object.freeze({ state: 'UNAVAILABLE' as const, status, reasonCode: muxReasonCode(reasonCode), detail });
}

export function muxError(reasonCode: string, detail: string): MuxDecision {
  return Object.freeze({ state: 'ERROR' as const, reasonCode: muxReasonCode(reasonCode), detail });
}

export function muxReasonCode(value: string): string {
  if (!/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/.test(value)) {
    throw new TypeError(`mux reasonCode must be stable UPPER_SNAKE_CASE: ${JSON.stringify(value)}`);
  }
  return value;
}
