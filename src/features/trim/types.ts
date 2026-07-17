import type { OracleVerdict, OracleUnavailableStatus } from '../../core/scenario.ts';

export const TRIM_EVIDENCE_SCHEMA = 'media-test/trim-evidence@1' as const;

export type TrimDecision =
  | {
      readonly state: 'VERDICT';
      readonly verdict: OracleVerdict;
      readonly reasonCode: string;
      readonly detail: string;
      readonly measurements?: Readonly<Record<string, number>>;
      readonly diagnostics?: Readonly<Record<string, unknown>>;
    }
  | {
      readonly state: 'UNAVAILABLE';
      readonly status: OracleUnavailableStatus;
      readonly reasonCode: string;
      readonly detail: string;
      readonly measurements?: Readonly<Record<string, number>>;
    }
  | {
      readonly state: 'ERROR';
      readonly reasonCode: string;
      readonly detail: string;
      readonly measurements?: Readonly<Record<string, number>>;
    };

export function trimVerdict(
  verdict: OracleVerdict,
  reasonCode: string,
  detail: string,
  measurements?: Readonly<Record<string, number>>,
  diagnostics?: Readonly<Record<string, unknown>>,
): TrimDecision {
  return Object.freeze({
    state: 'VERDICT' as const,
    verdict,
    reasonCode: stableTrimReasonCode(reasonCode),
    detail,
    ...(measurements ? { measurements: Object.freeze({ ...measurements }) } : {}),
    ...(diagnostics ? { diagnostics: Object.freeze({ ...diagnostics }) } : {}),
  });
}

export function trimUnavailable(
  status: OracleUnavailableStatus,
  reasonCode: string,
  detail: string,
  measurements?: Readonly<Record<string, number>>,
): TrimDecision {
  return Object.freeze({
    state: 'UNAVAILABLE' as const,
    status,
    reasonCode: stableTrimReasonCode(reasonCode),
    detail,
    ...(measurements ? { measurements: Object.freeze({ ...measurements }) } : {}),
  });
}

export function trimError(
  reasonCode: string,
  detail: string,
  measurements?: Readonly<Record<string, number>>,
): TrimDecision {
  return Object.freeze({
    state: 'ERROR' as const,
    reasonCode: stableTrimReasonCode(reasonCode),
    detail,
    ...(measurements ? { measurements: Object.freeze({ ...measurements }) } : {}),
  });
}

export function stableTrimReasonCode(value: string): string {
  if (!/^[A-Z][A-Z0-9_]{2,127}$/.test(value)) {
    throw new TypeError(`trim reasonCode is not stable: ${JSON.stringify(value)}`);
  }
  return value;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function finiteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}
