import type { AudioDspOracleOutcome, GaplessNativeEvidence, GaplessTrackEvidence } from './types.ts';

/** Priming/remainder and edit-list presentation are graded separately at the codec's native rate. */
export function evaluateGaplessNativeEvidence(
  evidence: GaplessNativeEvidence,
  toleranceFrames = 1,
): AudioDspOracleOutcome {
  const referenceValidFrames = validFrames(evidence.reference);
  const candidateValidFrames = validFrames(evidence.candidate);
  const decodedDelta = Math.abs(evidence.candidate.decodedSampleFrames - evidence.candidate.presentationSampleFrames);
  const referenceDecodedDelta = Math.abs(evidence.reference.decodedSampleFrames - evidence.reference.presentationSampleFrames);
  const validVsPresentationDelta = Math.abs(candidateValidFrames - evidence.candidate.presentationSampleFrames);
  const referenceValidVsPresentationDelta = Math.abs(referenceValidFrames - evidence.reference.presentationSampleFrames);
  const programDelta = Math.abs(evidence.candidate.decodedSampleFrames - evidence.reference.decodedSampleFrames);
  const measurements: Record<string, number> = {
    nativeSampleRate: evidence.candidate.nativeSampleRate,
    decodedSampleRate: evidence.candidate.decodedSampleRate,
    codedSampleFrames: evidence.candidate.codedSampleFrames,
    primingFrames: evidence.candidate.primingFrames,
    remainderFrames: evidence.candidate.remainderFrames,
    expectedValidFrames: candidateValidFrames,
    presentationSampleFrames: evidence.candidate.presentationSampleFrames,
    editListMediaStartFrame: evidence.candidate.editListMediaStartFrame,
    rawDecodedSampleFrames: evidence.candidate.rawDecodedSampleFrames,
    decodedSampleFrames: evidence.candidate.decodedSampleFrames,
    decodedDeltaFrames: decodedDelta,
    validVsPresentationDeltaFrames: validVsPresentationDelta,
    discardedPrimingFrames: evidence.candidate.discardedPrimingFrames,
    discardedRemainderFrames: evidence.candidate.discardedRemainderFrames,
    referenceNativeSampleRate: evidence.reference.nativeSampleRate,
    referenceCodedSampleFrames: evidence.reference.codedSampleFrames,
    referencePrimingFrames: evidence.reference.primingFrames,
    referenceRemainderFrames: evidence.reference.remainderFrames,
    referencePresentationSampleFrames: evidence.reference.presentationSampleFrames,
    referenceEditListMediaStartFrame: evidence.reference.editListMediaStartFrame,
    referenceRawDecodedSampleFrames: evidence.reference.rawDecodedSampleFrames,
    referenceDecodedSampleFrames: evidence.reference.decodedSampleFrames,
    referenceExpectedValidFrames: referenceValidFrames,
    referenceDecodedDeltaFrames: referenceDecodedDelta,
    referenceValidVsPresentationDeltaFrames: referenceValidVsPresentationDelta,
    programDeltaFrames: programDelta,
    leadingExtraFrames: evidence.leadingExtraFrames,
    trailingExtraFrames: evidence.trailingExtraFrames,
    toleranceFrames,
  };
  const failures: string[] = [];
  validateTrack('reference', evidence.reference, toleranceFrames, failures);
  validateTrack('candidate', evidence.candidate, toleranceFrames, failures);
  for (const [name, value] of Object.entries({ leadingExtraFrames: evidence.leadingExtraFrames, trailingExtraFrames: evidence.trailingExtraFrames })) {
    if (!Number.isSafeInteger(value) || value < 0) failures.push(`${name} is not a non-negative safe integer`);
  }
  if (evidence.candidate.nativeSampleRate !== evidence.reference.nativeSampleRate) {
    failures.push(`candidate native rate ${evidence.candidate.nativeSampleRate} != reference ${evidence.reference.nativeSampleRate}`);
  }
  if (decodedDelta > toleranceFrames) {
    failures.push(`candidate decoded program frames ${evidence.candidate.decodedSampleFrames} vs presentation ${evidence.candidate.presentationSampleFrames} (delta ${decodedDelta})`);
  }
  if (validVsPresentationDelta > toleranceFrames) {
    failures.push(`candidate valid coded frames ${candidateValidFrames} vs presentation ${evidence.candidate.presentationSampleFrames} (delta ${validVsPresentationDelta})`);
  }
  if (referenceDecodedDelta > toleranceFrames || referenceValidVsPresentationDelta > toleranceFrames) {
    failures.push('reference native decode does not corroborate its coded/edit-list timing');
  }
  if (programDelta > toleranceFrames) {
    failures.push(`candidate program ${evidence.candidate.decodedSampleFrames} vs reference ${evidence.reference.decodedSampleFrames} frame(s) (delta ${programDelta})`);
  }
  if (evidence.leadingExtraFrames > toleranceFrames || evidence.trailingExtraFrames > toleranceFrames) {
    failures.push(`loop boundary has ${evidence.leadingExtraFrames} leading/${evidence.trailingExtraFrames} trailing extra frame(s)`);
  }
  if (failures.length > 0) {
    return {
      state: 'VERDICT', oracle: 'property-invariant', verdict: 'FAIL',
      reasonCode: 'AUDIO_GAPLESS_PROGRAM_SAMPLES_WRONG', detail: failures.join('; '), measurements,
    };
  }
  return {
    state: 'VERDICT', oracle: 'property-invariant', verdict: 'PASS',
    reasonCode: 'AUDIO_GAPLESS_PRIMING_REMOVED',
    detail: `native-rate candidate program has ${evidence.candidate.decodedSampleFrames} frame(s), matching reference; priming ${evidence.candidate.primingFrames} and remainder ${evidence.candidate.remainderFrames} removed; presentation timing verified`,
    measurements,
  };
}

function validFrames(track: GaplessTrackEvidence): number {
  return track.codedSampleFrames - track.primingFrames - track.remainderFrames;
}

function validateTrack(
  label: 'reference' | 'candidate',
  track: GaplessTrackEvidence,
  toleranceFrames: number,
  failures: string[],
): void {
  if (![track.nativeSampleRate, track.decodedSampleRate].every((value) => Number.isFinite(value) && value > 0)) {
    failures.push(`${label} native/decoded sample rate is missing or invalid`);
  }
  for (const [name, value] of Object.entries({
    codedSampleFrames: track.codedSampleFrames,
    primingFrames: track.primingFrames,
    remainderFrames: track.remainderFrames,
    presentationSampleFrames: track.presentationSampleFrames,
    editListMediaStartFrame: track.editListMediaStartFrame,
    rawDecodedSampleFrames: track.rawDecodedSampleFrames,
    decodedSampleFrames: track.decodedSampleFrames,
    discardedPrimingFrames: track.discardedPrimingFrames,
    discardedRemainderFrames: track.discardedRemainderFrames,
  })) {
    if (!Number.isSafeInteger(value) || value < 0) failures.push(`${label} ${name} is not a non-negative safe integer`);
  }
  if (validFrames(track) < 0) failures.push(`${label} priming + remainder exceeds coded sample frames`);
  if (track.decodedSampleRate !== track.nativeSampleRate) {
    failures.push(`${label} decoded evidence rate ${track.decodedSampleRate} != native ${track.nativeSampleRate}`);
  }
  if (Math.abs(track.rawDecodedSampleFrames - track.codedSampleFrames) > toleranceFrames) {
    failures.push(`${label} raw native decode ${track.rawDecodedSampleFrames} vs coded capacity ${track.codedSampleFrames}`);
  }
  if (Math.abs(track.discardedPrimingFrames - track.primingFrames) > toleranceFrames) {
    failures.push(`${label} discarded priming ${track.discardedPrimingFrames} vs signaled ${track.primingFrames}`);
  }
  if (Math.abs(track.discardedRemainderFrames - track.remainderFrames) > toleranceFrames) {
    failures.push(`${label} discarded remainder ${track.discardedRemainderFrames} vs signaled ${track.remainderFrames}`);
  }
}
