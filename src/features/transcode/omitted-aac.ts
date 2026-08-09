import type {
  RemuxProgramEvidence,
  RemuxSampleEvidence,
  RemuxTrackEvidence,
} from '../remux/types.ts';
import {
  transcodeUnavailable,
  transcodeVerdict,
  type TranscodeDecision,
} from './types.ts';

export const TRANSCODE_OMITTED_AAC_PRESERVATION_INVARIANT =
  'transcode-preserve-omitted-aac' as const;

/**
 * Prove that omitting an audio target preserved, rather than dropped or re-encoded, the AAC track.
 * Both inputs are neutral-reader observations; no scored engine code participates in comparison.
 */
export function evaluateOmittedAacPreservation(
  source: RemuxProgramEvidence,
  candidate: RemuxProgramEvidence,
): TranscodeDecision {
  const sourceAac = source.tracks.filter(isAacTrack);
  const sourceVideo = source.tracks.filter((track) => track.type === 'video');
  if (sourceAac.length !== 1 || sourceVideo.length !== 1) {
    return transcodeUnavailable(
      'NA_ASSET',
      'TRANSCODE_OMITTED_AAC_SOURCE_TRACK_SHAPE_INVALID',
      `authored source requires exactly one AAC and one video track; observed ` +
        `${sourceAac.length} AAC and ${sourceVideo.length} video track(s)`,
    );
  }

  const candidateAac = candidate.tracks.filter(isAacTrack);
  const candidateVideo = candidate.tracks.filter((track) => track.type === 'video');
  if (candidateAac.length !== 1 || candidateVideo.length !== 1) {
    return transcodeVerdict(
      'FAIL',
      'TRANSCODE_OMITTED_AAC_CANDIDATE_TRACK_SHAPE_MISMATCH',
      `candidate must contain exactly one preserved AAC and one transcoded video track; observed ` +
        `${candidateAac.length} AAC and ${candidateVideo.length} video track(s)`,
      trackMeasurements(sourceAac[0], candidateAac[0]),
    );
  }

  const sourceTrack = sourceAac[0]!;
  const candidateTrack = candidateAac[0]!;
  const measurements = trackMeasurements(sourceTrack, candidateTrack);
  if (sourceTrack.samples.length !== candidateTrack.samples.length) {
    return transcodeVerdict(
      'FAIL',
      'TRANSCODE_OMITTED_AAC_SAMPLE_COUNT_MISMATCH',
      `AAC access-unit count changed ${sourceTrack.samples.length} -> ${candidateTrack.samples.length}`,
      measurements,
    );
  }
  if (sourceTrack.samples.length === 0) {
    return transcodeUnavailable(
      'NA_ASSET',
      'TRANSCODE_OMITTED_AAC_SOURCE_EMPTY',
      'authored AAC source contains no coded access units',
      measurements,
    );
  }

  const sourceTimeline = normalizedAacTimeline(sourceTrack);
  const candidateTimeline = normalizedAacTimeline(candidateTrack);
  if (!sourceTimeline) {
    return transcodeUnavailable(
      'NA_ASSET',
      'TRANSCODE_OMITTED_AAC_SOURCE_TIMELINE_UNAVAILABLE',
      'source AAC samples lack complete integer PTS/duration evidence',
      measurements,
    );
  }
  if (!candidateTimeline) {
    return transcodeVerdict(
      'FAIL',
      'TRANSCODE_OMITTED_AAC_CANDIDATE_TIMELINE_UNAVAILABLE',
      'candidate AAC samples lack complete integer PTS/duration evidence',
      measurements,
    );
  }

  for (let index = 0; index < sourceTrack.samples.length; index++) {
    const sourceSample = sourceTrack.samples[index]!;
    const candidateSample = candidateTrack.samples[index]!;
    if (!bytesEqual(sourceSample.payload, candidateSample.payload)) {
      return transcodeVerdict(
        'FAIL',
        'TRANSCODE_OMITTED_AAC_PAYLOAD_MISMATCH',
        `AAC access-unit payload changed at index ${index}`,
        { ...measurements, firstMismatchedAacSample: index },
      );
    }
    const sourceTiming = sourceTimeline[index]!;
    const candidateTiming = candidateTimeline[index]!;
    if (
      sourceTiming.ptsUs !== candidateTiming.ptsUs ||
      sourceTiming.durationUs !== candidateTiming.durationUs
    ) {
      return transcodeVerdict(
        'FAIL',
        'TRANSCODE_OMITTED_AAC_TIMESTAMP_MISMATCH',
        `normalized AAC timing changed at index ${index}: ` +
          `PTS ${sourceTiming.ptsUs} -> ${candidateTiming.ptsUs}, ` +
          `duration ${sourceTiming.durationUs} -> ${candidateTiming.durationUs}`,
        { ...measurements, firstMismatchedAacSample: index },
      );
    }
  }

  const sourceBounds = avBounds(sourceVideo[0]!, sourceTrack);
  const candidateBounds = avBounds(candidateVideo[0]!, candidateTrack);
  if (!sourceBounds) {
    return transcodeUnavailable(
      'NA_ASSET',
      'TRANSCODE_OMITTED_AAC_SOURCE_AV_TIMELINE_UNAVAILABLE',
      'source tracks lack complete A/V boundary timestamps',
      measurements,
    );
  }
  if (!candidateBounds) {
    return transcodeVerdict(
      'FAIL',
      'TRANSCODE_OMITTED_AAC_CANDIDATE_AV_TIMELINE_UNAVAILABLE',
      'candidate tracks lack complete A/V boundary timestamps',
      measurements,
    );
  }

  const tickToleranceUs = maximumContainerTickUs(
    sourceVideo[0]!, sourceTrack, candidateVideo[0]!, candidateTrack,
  );
  const startSkewDeltaUs = Math.abs(candidateBounds.startSkewUs - sourceBounds.startSkewUs);
  const endSkewDeltaUs = Math.abs(candidateBounds.endSkewUs - sourceBounds.endSkewUs);
  const finalMeasurements = {
    ...measurements,
    sourceAvStartSkewUs: sourceBounds.startSkewUs,
    candidateAvStartSkewUs: candidateBounds.startSkewUs,
    sourceAvEndSkewUs: sourceBounds.endSkewUs,
    candidateAvEndSkewUs: candidateBounds.endSkewUs,
    avStartSkewDeltaUs: startSkewDeltaUs,
    avEndSkewDeltaUs: endSkewDeltaUs,
    containerTickToleranceUs: tickToleranceUs,
  };
  if (startSkewDeltaUs > tickToleranceUs || endSkewDeltaUs > tickToleranceUs) {
    return transcodeVerdict(
      'FAIL',
      'TRANSCODE_OMITTED_AAC_AV_SKEW_MISMATCH',
      `A/V boundary skew changed by start=${startSkewDeltaUs}us, end=${endSkewDeltaUs}us; ` +
        `one observed container tick is ${tickToleranceUs.toFixed(3)}us`,
      finalMeasurements,
    );
  }

  return transcodeVerdict(
    'PASS',
    'TRANSCODE_OMITTED_AAC_PRESERVED',
    `${sourceTrack.samples.length} AAC access units are payload- and normalized-timestamp-exact; ` +
      'input/output A/V boundary skew agrees within one container tick',
    finalMeasurements,
  );
}

interface NormalizedAacSample {
  readonly ptsUs: number;
  readonly durationUs: number;
}

function normalizedAacTimeline(track: RemuxTrackEvidence): readonly NormalizedAacSample[] | undefined {
  let originUs = Number.POSITIVE_INFINITY;
  for (const sample of track.samples) {
    if (!isSafeTimestamp(sample.ptsUs) || !isSafeDuration(sample.durationUs)) return undefined;
    originUs = Math.min(originUs, sample.ptsUs);
  }
  if (!Number.isFinite(originUs)) return undefined;
  return track.samples.map((sample) => ({
    ptsUs: sample.ptsUs! - originUs,
    durationUs: sample.durationUs!,
  }));
}

function avBounds(
  video: RemuxTrackEvidence,
  audio: RemuxTrackEvidence,
): { readonly startSkewUs: number; readonly endSkewUs: number } | undefined {
  const videoBounds = presentationBounds(video.samples);
  const audioBounds = presentationBounds(audio.samples);
  if (!videoBounds || !audioBounds) return undefined;
  return {
    startSkewUs: audioBounds.startUs - videoBounds.startUs,
    endSkewUs: audioBounds.endUs - videoBounds.endUs,
  };
}

function presentationBounds(
  samples: readonly RemuxSampleEvidence[],
): { readonly startUs: number; readonly endUs: number } | undefined {
  let startUs = Number.POSITIVE_INFINITY;
  let endUs = Number.NEGATIVE_INFINITY;
  for (const sample of samples) {
    if (!isSafeTimestamp(sample.ptsUs) || !isSafeDuration(sample.durationUs)) return undefined;
    startUs = Math.min(startUs, sample.ptsUs);
    endUs = Math.max(endUs, sample.ptsUs + sample.durationUs);
  }
  return Number.isFinite(startUs) && Number.isFinite(endUs) && endUs >= startUs
    ? { startUs, endUs }
    : undefined;
}

function maximumContainerTickUs(...tracks: readonly RemuxTrackEvidence[]): number {
  let tickUs = 1;
  for (const track of tracks) {
    if (Number.isSafeInteger(track.timescale) && track.timescale! > 0) {
      tickUs = Math.max(tickUs, 1_000_000 / track.timescale!);
    }
  }
  return tickUs;
}

function trackMeasurements(
  source: RemuxTrackEvidence | undefined,
  candidate: RemuxTrackEvidence | undefined,
): Readonly<Record<string, number>> {
  return {
    sourceAacTracks: source ? 1 : 0,
    candidateAacTracks: candidate ? 1 : 0,
    sourceAacSamples: source?.samples.length ?? 0,
    candidateAacSamples: candidate?.samples.length ?? 0,
  };
}

function isAacTrack(track: RemuxTrackEvidence): boolean {
  return track.type === 'audio' && track.codec.trim().toLowerCase() === 'aac';
}

function isSafeTimestamp(value: number | undefined): value is number {
  return Number.isSafeInteger(value);
}

function isSafeDuration(value: number | undefined): value is number {
  return Number.isSafeInteger(value) && value! > 0;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}
