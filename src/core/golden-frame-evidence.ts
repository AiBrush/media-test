/** Timestamp pairing and neutral-decoder availability types shared by frame-evidence consumers. */

export interface TimestampedFrameEvidence {
  ptsUs: number;
  durationUs?: number;
}

export interface TimestampTransform {
  /** candidate presentation time = offset + reference presentation time * numerator / denominator */
  offsetUs: number;
  numerator: number;
  denominator: number;
}

export interface TimestampPair {
  referenceIndex: number;
  candidateIndex: number;
  referencePtsUs: number;
  transformedReferencePtsUs: number;
  candidatePtsUs: number;
  residualUs: number;
}

export interface TimestampPairingResult {
  pairs: TimestampPair[];
  unmatchedReferenceIndices: number[];
  unmatchedCandidateIndices: number[];
  complete: boolean;
  policy: 'require-all-reference' | 'allow-frame-drop' | 'nearest-window';
}

/** Deterministic order-preserving maximum-cardinality/minimum-residual 1:1 timestamp matching. */
export function pairFramesByTimestamp(
  reference: readonly TimestampedFrameEvidence[],
  candidate: readonly TimestampedFrameEvidence[],
  options: {
    toleranceUs: number;
    transform?: TimestampTransform;
    unmatchedPolicy?: TimestampPairingResult['policy'];
  },
): TimestampPairingResult {
  if (!Number.isFinite(options.toleranceUs) || options.toleranceUs < 0) throw new TypeError('timestamp tolerance must be non-negative');
  const transform = options.transform ?? { offsetUs: 0, numerator: 1, denominator: 1 };
  if (!Number.isFinite(transform.offsetUs) || !Number.isFinite(transform.numerator) || !Number.isFinite(transform.denominator) || transform.denominator <= 0) {
    throw new TypeError('timestamp transform is invalid');
  }
  const policy = options.unmatchedPolicy ?? 'require-all-reference';
  const orderedReference = reference.map((frame, index) => ({ frame, index })).sort((a, b) => a.frame.ptsUs - b.frame.ptsUs || a.index - b.index);
  const orderedCandidate = candidate.map((frame, index) => ({ frame, index })).sort((a, b) => a.frame.ptsUs - b.frame.ptsUs || a.index - b.index);
  type Solution = { pairs: TimestampPair[]; residual: number };
  const memo = new Map<string, Solution>();
  const solve = (referenceCursor: number, candidateCursor: number): Solution => {
    if (referenceCursor >= orderedReference.length || candidateCursor >= orderedCandidate.length) {
      return { pairs: [], residual: 0 };
    }
    const key = `${referenceCursor}:${candidateCursor}`;
    const cached = memo.get(key);
    if (cached) return cached;
    const choices: Solution[] = [
      solve(referenceCursor + 1, candidateCursor),
      solve(referenceCursor, candidateCursor + 1),
    ];
    const ref = orderedReference[referenceCursor]!;
    const cand = orderedCandidate[candidateCursor]!;
    const transformedReferencePtsUs = transform.offsetUs + ref.frame.ptsUs * transform.numerator / transform.denominator;
    const residualUs = Math.abs(cand.frame.ptsUs - transformedReferencePtsUs);
    if (residualUs <= options.toleranceUs) {
      const tail = solve(referenceCursor + 1, candidateCursor + 1);
      choices.push({
        pairs: [{
          referenceIndex: ref.index,
          candidateIndex: cand.index,
          referencePtsUs: ref.frame.ptsUs,
          transformedReferencePtsUs,
          candidatePtsUs: cand.frame.ptsUs,
          residualUs,
        }, ...tail.pairs],
        residual: residualUs + tail.residual,
      });
    }
    choices.sort((a, b) =>
      b.pairs.length - a.pairs.length ||
      a.residual - b.residual ||
      pairIdentity(a.pairs).localeCompare(pairIdentity(b.pairs)));
    const best = choices[0]!;
    memo.set(key, best);
    return best;
  };
  const pairs = solve(0, 0).pairs;
  const usedReference = new Set(pairs.map((pair) => pair.referenceIndex));
  const usedCandidate = new Set(pairs.map((pair) => pair.candidateIndex));
  pairs.sort((a, b) => a.referenceIndex - b.referenceIndex);
  const unmatchedReferenceIndices = reference.map((_, index) => index).filter((index) => !usedReference.has(index));
  const unmatchedCandidateIndices = candidate.map((_, index) => index).filter((index) => !usedCandidate.has(index));
  const complete = policy === 'require-all-reference'
    ? unmatchedReferenceIndices.length === 0
    : policy === 'allow-frame-drop'
      ? pairs.length > 0
      : pairs.length > 0 && pairs.length === Math.min(reference.length, candidate.length);
  return { pairs, unmatchedReferenceIndices, unmatchedCandidateIndices, complete, policy };
}

function pairIdentity(pairs: readonly TimestampPair[]): string {
  return pairs.map((pair) => `${pair.referenceIndex.toString().padStart(8, '0')}:${pair.candidateIndex.toString().padStart(8, '0')}`).join('|');
}

export type ReferenceDecoderEvidence =
  | { state: 'available'; decoder: string; configuration: Record<string, unknown> }
  | { state: 'browser-unavailable'; reasonCode: string; configuration: Record<string, unknown> }
  | { state: 'invalid-bitstream'; reasonCode: string; structuralEvidence: Record<string, unknown> }
  | { state: 'ambiguous-error'; reasonCode: string; detail: string };

export function routeReferenceDecoderEvidence(evidence: ReferenceDecoderEvidence):
  | { execution: 'READY' }
  | { execution: 'NA_BROWSER'; reasonCode: string }
  | { execution: 'VERDICT'; verdict: 'FAIL'; reasonCode: string }
  | { execution: 'ERROR'; reasonCode: string } {
  switch (evidence.state) {
    case 'available': return { execution: 'READY' };
    case 'browser-unavailable': return { execution: 'NA_BROWSER', reasonCode: evidence.reasonCode };
    case 'invalid-bitstream': return { execution: 'VERDICT', verdict: 'FAIL', reasonCode: evidence.reasonCode };
    case 'ambiguous-error': return { execution: 'ERROR', reasonCode: evidence.reasonCode };
  }
}
