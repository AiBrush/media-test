import { stableReasonCode } from './types.ts';

export interface StreamingWorkIdentity {
  readonly engineId: string;
  readonly browser: string;
  readonly fixtureSha256: string;
  readonly representation: string;
  readonly observerPolicy: string;
  readonly retainedOutputPolicy: string;
  readonly measurementContract: string;
  readonly warmup: number;
  readonly iterations: number;
  readonly metric: string;
  readonly unit: string;
}

export interface StreamingComparabilityResult {
  readonly comparable: boolean;
  /** Reporting disposition only. Refusal is not a media-correctness FAIL. */
  readonly status: 'COMPARABLE' | 'REFUSED';
  readonly reasonCode: string;
  readonly detail: string;
  readonly mismatchedFields: readonly (keyof StreamingWorkIdentity)[];
}

const COHORT_FIELDS = [
  'browser',
  'fixtureSha256',
  'representation',
  'observerPolicy',
  'retainedOutputPolicy',
  'measurementContract',
  'warmup',
  'iterations',
  'metric',
  'unit',
] as const satisfies readonly (keyof StreamingWorkIdentity)[];

/** Cross-engine winners are legal only for byte-for-byte equivalent work/measurement cohorts. */
export function assessStreamingComparability(
  records: readonly StreamingWorkIdentity[],
): StreamingComparabilityResult {
  if (records.length < 2) {
    return Object.freeze({
      comparable: false,
      status: 'REFUSED' as const,
      reasonCode: stableReasonCode('STREAMING_COMPARISON_INSUFFICIENT_RECORDS'),
      detail: 'at least two records are required',
      mismatchedFields: Object.freeze([]),
    });
  }
  records.forEach(validateIdentity);
  const first = records[0]!;
  const mismatchedFields = COHORT_FIELDS.filter((field) => records.some((record) => record[field] !== first[field]));
  const comparable = mismatchedFields.length === 0;
  return Object.freeze({
    comparable,
    status: comparable ? 'COMPARABLE' as const : 'REFUSED' as const,
    reasonCode: stableReasonCode(comparable ? 'STREAMING_WORK_COMPARABLE' : 'STREAMING_WORK_NOT_COMPARABLE'),
    detail: comparable
      ? `${records.length} records share representation, retention, fixture, browser, and measurement contract`
      : `winner comparison refused: ${mismatchedFields.join(', ')} differ`,
    mismatchedFields: Object.freeze(mismatchedFields),
  });
}

/** Stable cohort material; callers may hash/canonicalize it with the report's shared JSON helper. */
export function streamingCohortProjection(identity: StreamingWorkIdentity): Omit<StreamingWorkIdentity, 'engineId'> {
  validateIdentity(identity);
  return Object.freeze({
    browser: identity.browser,
    fixtureSha256: identity.fixtureSha256,
    representation: identity.representation,
    observerPolicy: identity.observerPolicy,
    retainedOutputPolicy: identity.retainedOutputPolicy,
    measurementContract: identity.measurementContract,
    warmup: identity.warmup,
    iterations: identity.iterations,
    metric: identity.metric,
    unit: identity.unit,
  });
}

function validateIdentity(value: StreamingWorkIdentity): void {
  for (const field of [
    'engineId', 'browser', 'fixtureSha256', 'representation', 'observerPolicy',
    'retainedOutputPolicy', 'measurementContract', 'metric', 'unit',
  ] as const) {
    if (typeof value[field] !== 'string' || value[field].trim() === '') {
      throw new TypeError(`streaming work identity ${field} must be non-empty`);
    }
  }
  if (!/^[0-9a-f]{64}$/.test(value.fixtureSha256)) throw new TypeError('fixtureSha256 must be canonical lowercase SHA-256');
  if (!Number.isSafeInteger(value.warmup) || value.warmup < 0) throw new TypeError('warmup must be a non-negative integer');
  if (!Number.isSafeInteger(value.iterations) || value.iterations <= 0) throw new TypeError('iterations must be positive');
}
