export interface Timestamped {
  readonly ptsUs: number;
}

export interface TimestampMatch<C extends Timestamped, R extends Timestamped> {
  readonly candidate: C;
  readonly reference: R;
  readonly deltaUs: number;
}

export interface TimestampMatchSet<C extends Timestamped, R extends Timestamped> {
  readonly matches: readonly TimestampMatch<C, R>[];
  readonly unmatchedCandidate: readonly C[];
  readonly unmatchedReference: readonly R[];
}

/**
 * One-to-one nearest-PTS matching with a deterministic earlier-PTS tie break.  Reference entries
 * drive the walk so a missing alpha/display frame cannot be hidden by a surplus candidate frame.
 */
export function matchTimestamps<C extends Timestamped, R extends Timestamped>(
  candidateInput: readonly C[],
  referenceInput: readonly R[],
  toleranceUs: number,
): TimestampMatchSet<C, R> {
  if (!Number.isFinite(toleranceUs) || toleranceUs < 0) {
    throw new TypeError('timestamp tolerance must be finite and non-negative');
  }
  const candidates = candidateInput
    .filter((entry) => Number.isFinite(entry.ptsUs))
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => a.entry.ptsUs - b.entry.ptsUs || a.index - b.index);
  const references = referenceInput
    .filter((entry) => Number.isFinite(entry.ptsUs))
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => a.entry.ptsUs - b.entry.ptsUs || a.index - b.index);
  const unused = new Set(candidates.map((entry) => entry.index));
  const matches: TimestampMatch<C, R>[] = [];
  const unmatchedReference: R[] = [];

  for (const reference of references) {
    const best = candidates
      .filter((candidate) => unused.has(candidate.index))
      .map((candidate) => ({
        candidate,
        deltaUs: Math.abs(candidate.entry.ptsUs - reference.entry.ptsUs),
      }))
      .sort((a, b) =>
        a.deltaUs - b.deltaUs ||
        a.candidate.entry.ptsUs - b.candidate.entry.ptsUs ||
        a.candidate.index - b.candidate.index)[0];
    if (!best || best.deltaUs > toleranceUs) {
      unmatchedReference.push(reference.entry);
      continue;
    }
    unused.delete(best.candidate.index);
    matches.push({
      candidate: best.candidate.entry,
      reference: reference.entry,
      deltaUs: best.deltaUs,
    });
  }

  return Object.freeze({
    matches: Object.freeze(matches),
    unmatchedCandidate: Object.freeze(candidates.filter((entry) => unused.has(entry.index)).map((entry) => entry.entry)),
    unmatchedReference: Object.freeze(unmatchedReference),
  });
}
