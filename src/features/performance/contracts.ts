/** Shared, per-metric evidence result used by the performance measurement hooks. */

export type PerformanceEvidenceStatus = 'NA_ENGINE' | 'NA_BROWSER' | 'NA_ASSET' | 'ERROR';

export type PerformanceEvidence<T> =
  | { state: 'AVAILABLE'; value: T }
  | {
      state: 'UNAVAILABLE';
      status: PerformanceEvidenceStatus;
      reasonCode: string;
      reason: string;
    };

export function available<T>(value: T): PerformanceEvidence<T> {
  return { state: 'AVAILABLE', value };
}

export function unavailable<T = never>(
  status: PerformanceEvidenceStatus,
  reasonCode: string,
  reason: string,
): PerformanceEvidence<T> {
  return { state: 'UNAVAILABLE', status, reasonCode, reason };
}

export function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function nonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
