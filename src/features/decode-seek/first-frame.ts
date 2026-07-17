import type { BenchSummary } from '../../core/scenario.ts';
import { finiteNonNegative } from './types.ts';

export const FIRST_FRAME_BOUNDARY_SCHEMA = 'media-test/first-frame-boundary@1' as const;

export interface FirstFrameBoundaryEvidence {
  readonly schema: typeof FIRST_FRAME_BOUNDARY_SCHEMA;
  readonly firstFrameMs: number;
  readonly deliveredFrames: number;
}

export type FirstFrameMetricAdmission =
  | {
      readonly state: 'AVAILABLE';
      readonly value: BenchSummary;
    }
  | {
      readonly state: 'ERROR';
      readonly reasonCode: string;
      readonly detail: string;
    };

/**
 * Records the first frame exactly where an adapter hands it to its normalized frame sink. Calling
 * delivered() more than once only increments cardinality; it cannot move the first-frame marker.
 */
export class FirstFrameBoundaryRecorder {
  readonly #startedAtMs: number;
  readonly #now: () => number;
  #firstFrameMs: number | undefined;
  #deliveredFrames = 0;

  constructor(startedAtMs: number, now: () => number = () => performance.now()) {
    if (!Number.isFinite(startedAtMs)) throw new TypeError('first-frame start time must be finite');
    this.#startedAtMs = startedAtMs;
    this.#now = now;
  }

  delivered(atMs = this.#now()): void {
    if (!Number.isFinite(atMs) || atMs < this.#startedAtMs) {
      throw new TypeError('frame delivery time precedes operation start or is not finite');
    }
    this.#deliveredFrames++;
    this.#firstFrameMs ??= atMs - this.#startedAtMs;
  }

  evidence(): FirstFrameBoundaryEvidence | undefined {
    if (this.#firstFrameMs === undefined) return undefined;
    return Object.freeze({
      schema: FIRST_FRAME_BOUNDARY_SCHEMA,
      firstFrameMs: this.#firstFrameMs,
      deliveredFrames: this.#deliveredFrames,
    });
  }
}

/** Require one finite first-frame value per measured iteration; n=0 is never a numeric result. */
export function validateFirstFrameSummary(
  summary: BenchSummary | undefined,
  expectedIterations: number,
): FirstFrameMetricAdmission {
  if (!Number.isSafeInteger(expectedIterations) || expectedIterations <= 0) {
    return {
      state: 'ERROR',
      reasonCode: 'FIRST_FRAME_EXPECTED_ITERATIONS_INVALID',
      detail: `expected measured iterations must be a positive integer, got ${expectedIterations}`,
    };
  }
  if (!summary || summary.n === 0) {
    return {
      state: 'ERROR',
      reasonCode: 'FIRST_FRAME_SAMPLE_MISSING',
      detail: 'timeToFirstFrame has no measured frame-sink marker (n=0)',
    };
  }
  if (summary.n !== expectedIterations || summary.samples.length !== expectedIterations) {
    return {
      state: 'ERROR',
      reasonCode: 'FIRST_FRAME_SAMPLE_COUNT_MISMATCH',
      detail: `timeToFirstFrame has n=${summary.n}/samples=${summary.samples.length}, expected ${expectedIterations}`,
    };
  }
  const representative = summary.aggregate ?? summary.median;
  if (!summary.samples.every(finiteNonNegative) || !finiteNonNegative(representative)) {
    return {
      state: 'ERROR',
      reasonCode: 'FIRST_FRAME_SAMPLE_INVALID',
      detail: 'timeToFirstFrame contains a negative or non-finite value',
    };
  }
  return { state: 'AVAILABLE', value: summary };
}
