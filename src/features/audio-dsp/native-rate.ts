import type { AudioDspOracleOutcome, DecodedPcmEvidence } from './types.ts';

/**
 * Native-rate truth never accepts Web Audio playback evidence. `hostContextSampleRate` is recorded
 * only to prove that changing the device playback rate cannot change this comparison.
 */
export function compareNativeRateEvidence(
  expected: Pick<DecodedPcmEvidence, 'sampleRate' | 'sampleFrames' | 'channels' | 'evidenceSource'>,
  observed: Pick<DecodedPcmEvidence, 'sampleRate' | 'sampleFrames' | 'channels' | 'evidenceSource'>,
  hostContextSampleRate?: number,
): AudioDspOracleOutcome {
  const measurements: Record<string, number> = {
    expectedNativeSampleRate: expected.sampleRate,
    observedNativeSampleRate: observed.sampleRate,
    expectedNativeSampleFrames: expected.sampleFrames,
    observedNativeSampleFrames: observed.sampleFrames,
    expectedChannels: expected.channels,
    observedChannels: observed.channels,
    ...(hostContextSampleRate != null ? { hostPlaybackContextSampleRate: hostContextSampleRate } : {}),
  };
  const failures: string[] = [];
  if (expected.sampleRate !== observed.sampleRate) failures.push(`native rate ${observed.sampleRate} != ${expected.sampleRate}`);
  if (expected.sampleFrames !== observed.sampleFrames) failures.push(`native frame count ${observed.sampleFrames} != ${expected.sampleFrames}`);
  if (expected.channels !== observed.channels) failures.push(`channels ${observed.channels} != ${expected.channels}`);
  if (failures.length > 0) {
    return {
      state: 'VERDICT', oracle: 'property-invariant', verdict: 'FAIL',
      reasonCode: 'AUDIO_NATIVE_RATE_MISMATCH', detail: failures.join('; '), measurements,
    };
  }
  return {
    state: 'VERDICT', oracle: 'property-invariant', verdict: 'PASS',
    reasonCode: 'AUDIO_NATIVE_RATE_EVIDENCE_MATCH',
    detail: `native ${observed.sampleRate}Hz/${observed.sampleFrames} frame evidence (${observed.evidenceSource}); playback context is non-normative`,
    measurements,
  };
}
