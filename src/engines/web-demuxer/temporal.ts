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
  retainLowestPtsValue(retained, candidate, limit)?.value.close();
}

/** Keep the lowest presentation-time values and return the evicted value to its owner. */
export function retainLowestPtsValue<T>(
  retained: TimedClosable<T>[],
  candidate: TimedClosable<T>,
  limit: number,
): TimedClosable<T> | undefined {
  if (limit <= 0) {
    return candidate;
  }
  retained.push(candidate);
  if (retained.length <= limit) return undefined;
  let largest = 0;
  for (let index = 1; index < retained.length; index++) {
    if (compareTimed(retained[index]!, retained[largest]!) > 0) largest = index;
  }
  const [removed] = retained.splice(largest, 1);
  return removed;
}

export function sortByPresentationTime<T>(values: TimedClosable<T>[]): TimedClosable<T>[] {
  return values.sort(compareTimed);
}

/** Keep only the two frames sufficient for the seek rule, independent of callback ordering. */
export function retainSeekLandingCandidates<T extends Closable>(
  retained: TimedClosable<T>[],
  candidate: TimedClosable<T>,
  targetUs: number,
): void {
  const beforeTarget = candidate.ptsUs <= targetUs;
  const index = retained.findIndex((item) => (item.ptsUs <= targetUs) === beforeTarget);
  if (index < 0) {
    retained.push(candidate);
    return;
  }
  const current = retained[index]!;
  const preferred = beforeTarget
    ? candidate.ptsUs > current.ptsUs
    : candidate.ptsUs < current.ptsUs;
  if (!preferred) {
    candidate.value.close();
    return;
  }
  retained[index] = candidate;
  current.value.close();
}

/**
 * Deterministic seek rule: nearest real decoded PTS to the target, with the earlier frame winning
 * an exact tie. The selected PTS must also exist in the submitted demux evidence.
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
  for (const candidate of ordered.slice(1)) {
    const candidateDistance = Math.abs(candidate.ptsUs - targetUs);
    const landedDistance = Math.abs(landed.ptsUs - targetUs);
    if (candidateDistance < landedDistance) landed = candidate;
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

/** A later keyframe closes the presentation-reorder window for a requested leading-N prefix. */
export function decodePrefixProgressSatisfied(
  chunk: Pick<EncodedVideoChunk, 'timestamp' | 'type'>,
  requestedFrames: number,
  submittedChunks: number,
  firstSubmittedPtsUs: number | undefined,
): boolean {
  return submittedChunks >= requestedFrames
    && firstSubmittedPtsUs !== undefined
    && chunk.type === 'key'
    && chunk.timestamp > firstSubmittedPtsUs;
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
