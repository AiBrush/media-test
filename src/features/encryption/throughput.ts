import type { BenchSummary } from '../../core/scenario.ts';

export type DecryptDurationDecision =
  | {
      readonly state: 'READY';
      readonly durationSec: number;
      readonly source: 'selected-catalog' | 'baked-golden' | 'neutral-probe';
    }
  | {
      readonly state: 'UNAVAILABLE';
      readonly status: 'NA_ASSET' | 'ERROR';
      readonly reasonCode: 'DECRYPT_DURATION_UNAVAILABLE' | 'DECRYPT_DURATION_INVALID';
      readonly detail: string;
    };

export interface DecryptDurationInputs {
  /** Duration of the exact digest-selected file. Takes precedence for rotated candidates. */
  readonly selectedCatalogDurationSec?: number | null;
  readonly bakedGoldenDurationSec?: number | null;
  readonly neutralProbeDurationSec?: number | null;
  readonly selectedIsBaked: boolean;
}

/** Choose the numerator belonging to the exact selected bytes; never use a different baked asset. */
export function resolveDecryptDuration(inputs: DecryptDurationInputs): DecryptDurationDecision {
  const candidates: Array<{ value: number | null | undefined; source: Extract<DecryptDurationDecision, { state: 'READY' }>['source'] }> =
    inputs.selectedIsBaked
      ? [
          { value: inputs.bakedGoldenDurationSec, source: 'baked-golden' },
          { value: inputs.selectedCatalogDurationSec, source: 'selected-catalog' },
          { value: inputs.neutralProbeDurationSec, source: 'neutral-probe' },
        ]
      : [
          { value: inputs.selectedCatalogDurationSec, source: 'selected-catalog' },
          { value: inputs.neutralProbeDurationSec, source: 'neutral-probe' },
        ];
  for (const candidate of candidates) {
    if (candidate.value === undefined || candidate.value === null) continue;
    if (Number.isFinite(candidate.value) && candidate.value > 0) {
      return Object.freeze({ state: 'READY', durationSec: candidate.value, source: candidate.source });
    }
    return Object.freeze({
      state: 'UNAVAILABLE',
      status: 'ERROR',
      reasonCode: 'DECRYPT_DURATION_INVALID',
      detail: `${candidate.source} decrypt duration evidence is non-finite or non-positive`,
    });
  }
  return Object.freeze({
    state: 'UNAVAILABLE',
    status: 'NA_ASSET',
    reasonCode: 'DECRYPT_DURATION_UNAVAILABLE',
    detail: 'selected decrypt input has no catalog, golden, or neutral-probe duration',
  });
}

export type DecryptThroughputAdmission =
  | { readonly state: 'READY'; readonly realtime: number }
  | {
      readonly state: 'ERROR';
      readonly reasonCode:
        | 'DECRYPT_THROUGHPUT_DURATION_INVALID'
        | 'DECRYPT_THROUGHPUT_WALL_INVALID'
        | 'DECRYPT_THROUGHPUT_SAMPLE_COUNT_INVALID';
      readonly detail: string;
    };

export function decryptRealtimeFactor(durationSec: number, wallMs: number): DecryptThroughputAdmission {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return throughputError('DECRYPT_THROUGHPUT_DURATION_INVALID', 'decrypt throughput requires a finite positive media duration');
  }
  if (!Number.isFinite(wallMs) || wallMs <= 0) {
    return throughputError('DECRYPT_THROUGHPUT_WALL_INVALID', 'decrypt throughput requires a finite positive wall duration');
  }
  const realtime = durationSec / (wallMs / 1000);
  return Number.isFinite(realtime) && realtime > 0
    ? Object.freeze({ state: 'READY', realtime })
    : throughputError('DECRYPT_THROUGHPUT_WALL_INVALID', 'decrypt realtime factor overflowed its finite range');
}

/** Headline admission: every requested measured iteration must produce one finite positive sample. */
export function validateDecryptThroughputSummary(
  summary: BenchSummary | undefined,
  requestedIterations: number,
): DecryptThroughputAdmission {
  if (!Number.isSafeInteger(requestedIterations) || requestedIterations <= 0) {
    throw new TypeError('requestedIterations must be a positive safe integer');
  }
  if (!summary || summary.metric !== 'throughputRealtime' || summary.n !== requestedIterations ||
      summary.samples.length !== requestedIterations ||
      summary.samples.some((sample) => !Number.isFinite(sample) || sample <= 0) ||
      !Number.isFinite(summary.median) || summary.median <= 0 ||
      !Number.isFinite(summary.p95) || summary.p95 <= 0 ||
      !Number.isFinite(summary.mad) || summary.mad < 0) {
    return throughputError(
      'DECRYPT_THROUGHPUT_SAMPLE_COUNT_INVALID',
      `ranked decrypt throughput requires ${requestedIterations} finite positive sample(s)`,
    );
  }
  return Object.freeze({ state: 'READY', realtime: summary.median });
}

function throughputError(
  reasonCode: Extract<DecryptThroughputAdmission, { state: 'ERROR' }>['reasonCode'],
  detail: string,
): Extract<DecryptThroughputAdmission, { state: 'ERROR' }> {
  return Object.freeze({ state: 'ERROR', reasonCode, detail });
}
