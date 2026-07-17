export interface TimedClosable<T> {
  ptsUs: number;
  value: T;
  arrivalIndex: number;
}

export interface Closable {
  close(): void;
}

/** Ordinary correctness error: some output existed, but the decode did not complete successfully. */
export class WebDemuxerPartialDecodeError extends Error {
  readonly reasonCode = 'WEB_DEMUXER_PARTIAL_DECODE';
  readonly emittedFrames: number;
  readonly phase: 'decode' | 'seek';

  constructor(phase: 'decode' | 'seek', emittedFrames: number, cause: unknown) {
    super(
      `web-demuxer ${phase} failed after ${emittedFrames} decoded frame(s): ${errorMessage(cause)}`,
      { cause },
    );
    this.name = 'WebDemuxerPartialDecodeError';
    this.phase = phase;
    this.emittedFrames = emittedFrames;
  }
}

/** Keep only the lowest presentation-time N frames, independent of decoder callback ordering. */
export function retainLowestPts<T extends Closable>(
  retained: TimedClosable<T>[],
  candidate: TimedClosable<T>,
  limit: number,
): void {
  if (limit <= 0) {
    candidate.value.close();
    return;
  }
  retained.push(candidate);
  if (retained.length <= limit) return;
  let largest = 0;
  for (let index = 1; index < retained.length; index++) {
    if (compareTimed(retained[index]!, retained[largest]!) > 0) largest = index;
  }
  const [removed] = retained.splice(largest, 1);
  removed?.value.close();
}

export function sortByPresentationTime<T>(values: TimedClosable<T>[]): TimedClosable<T>[] {
  return values.sort(compareTimed);
}

/**
 * Deterministic seek rule: greatest real decoded PTS <= target; if no preceding frame exists, the
 * earliest following frame. The selected PTS must also exist in the submitted demux evidence.
 */
export function selectSeekLanding<T>(
  decoded: TimedClosable<T>[],
  targetUs: number,
  submittedPtsUs: readonly number[],
  toleranceUs = 1,
): TimedClosable<T> | undefined {
  if (!decoded.length) return undefined;
  const ordered = [...decoded].sort(compareTimed);
  let landed = ordered[0]!;
  for (const candidate of ordered) {
    if (candidate.ptsUs <= targetUs) landed = candidate;
    else break;
  }
  const observed = submittedPtsUs.some((ptsUs) => Math.abs(ptsUs - landed.ptsUs) <= toleranceUs);
  if (!observed) {
    throw new Error(
      `web-demuxer seek selected ${landed.ptsUs}us, which is absent from submitted demux timing`,
    );
  }
  return landed;
}

/** Read until the first GOP boundary after the target, rather than assuming a fixed time window. */
export function seekGopProgressSatisfied(
  chunk: Pick<EncodedVideoChunk, 'timestamp' | 'type'>,
  targetUs: number,
  hasSubmittedAtOrBeforeTarget: boolean,
): boolean {
  return hasSubmittedAtOrBeforeTarget && chunk.type === 'key' && chunk.timestamp > targetUs;
}

export function closeAll<T extends Closable>(values: readonly TimedClosable<T>[]): void {
  const errors: unknown[] = [];
  for (const item of values) {
    try {
      item.value.close();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) throw new AggregateError(errors, `failed to close ${errors.length} decoded frame(s)`);
}

function compareTimed<T>(a: TimedClosable<T>, b: TimedClosable<T>): number {
  return a.ptsUs - b.ptsUs || a.arrivalIndex - b.arrivalIndex;
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
