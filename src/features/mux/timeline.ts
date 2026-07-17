import type { RemuxProgramEvidence, RemuxTrackEvidence } from '../remux/types.ts';
import { muxVerdict, type MuxDecision } from './types.ts';

export const MUX_TIMELINE_SCHEMA = 'media-test/mux-timeline@1' as const;

export interface MuxTimelineSample {
  readonly decodeIndex: number;
  readonly pts: number;
  readonly dts: number;
  readonly duration: number;
  readonly keyframe: boolean;
}

export interface MuxTrackTimeline {
  readonly semanticId: string;
  readonly type: 'video' | 'audio';
  readonly codec: string;
  /** Positive ticks per second. Every sample field is an integer in this timebase. */
  readonly timescale: number;
  readonly samples: readonly MuxTimelineSample[];
}

export interface MuxTimelineEvidence {
  readonly schema: typeof MUX_TIMELINE_SCHEMA;
  readonly tracks: readonly MuxTrackTimeline[];
}

export interface MuxTimelineTolerance {
  /** Maximum legal rounding in candidate/output ticks. The acceptance contract defaults to one. */
  readonly targetTicks: number;
}

export type MuxTimelineBuildResult =
  | Readonly<{ state: 'OK'; value: MuxTimelineEvidence }>
  | Readonly<{ state: 'ERROR'; reasonCode: string; detail: string }>;

export type MuxTimelineSemanticId = (
  track: RemuxTrackEvidence,
  typeCodecOrdinal: number,
) => string;

/** Convert a neutral reader program into a complete microsecond timeline without inventing DTS. */
export function muxTimelineEvidenceFromProgram(
  program: RemuxProgramEvidence,
  semanticId: MuxTimelineSemanticId = defaultTimelineSemanticId,
): MuxTimelineBuildResult {
  const tracks: MuxTrackTimeline[] = [];
  const ordinals = new Map<string, number>();
  for (const track of program.tracks) {
    if (track.type !== 'video' && track.type !== 'audio') continue;
    const key = `${track.type}:${canonicalCodec(track.codec)}`;
    const ordinal = ordinals.get(key) ?? 0;
    ordinals.set(key, ordinal + 1);
    const resolvedId = semanticId(track, ordinal);
    if (!resolvedId.trim()) {
      return Object.freeze({
        state: 'ERROR' as const,
        reasonCode: 'MUX_TIMELINE_SEMANTIC_ID_MISSING',
        detail: `neutral track ${track.id} has no stable semantic id`,
      });
    }
    const samples: MuxTimelineSample[] = [];
    for (let index = 0; index < track.samples.length; index++) {
      const sample = track.samples[index]!;
      if (!Number.isSafeInteger(sample.ptsUs) || !Number.isSafeInteger(sample.dtsUs) ||
          !Number.isSafeInteger(sample.durationUs) || sample.durationUs! <= 0 ||
          (track.type === 'video' && typeof sample.keyframe !== 'boolean')) {
        return Object.freeze({
          state: 'ERROR' as const,
          reasonCode: 'MUX_TIMELINE_READER_EVIDENCE_INCOMPLETE',
          detail: `${track.id} sample ${index} lacks independent integer PTS/DTS/duration/keyframe evidence`,
        });
      }
      samples.push(Object.freeze({
        decodeIndex: index,
        pts: sample.ptsUs!,
        dts: sample.dtsUs!,
        duration: sample.durationUs!,
        keyframe: track.type === 'audio' ? true : sample.keyframe!,
      }));
    }
    tracks.push(Object.freeze({
      semanticId: resolvedId,
      type: track.type,
      codec: track.codec,
      timescale: 1_000_000,
      samples: Object.freeze(samples),
    }));
  }
  if (tracks.length === 0) {
    return Object.freeze({
      state: 'ERROR' as const,
      reasonCode: 'MUX_TIMELINE_MEDIA_TRACKS_MISSING',
      detail: 'neutral reader program has no audio/video timeline',
    });
  }
  const value: MuxTimelineEvidence = Object.freeze({
    schema: MUX_TIMELINE_SCHEMA,
    tracks: Object.freeze(tracks),
  });
  const invalid = validateTimeline(value, 'neutral-reader');
  return invalid
    ? Object.freeze({ state: 'ERROR' as const, ...invalid })
    : Object.freeze({ state: 'OK' as const, value });
}

/**
 * Compare the complete decode and presentation axes after exact rational rescaling. A shared origin
 * shift is normalized; DTS, PTS, duration, composition offset, random access, and VFR intervals are not.
 */
export function compareMuxTimelines(
  reference: MuxTimelineEvidence,
  candidate: MuxTimelineEvidence,
  tolerance: Partial<MuxTimelineTolerance> = {},
): MuxDecision {
  const targetTicks = tolerance.targetTicks ?? 1;
  if (!Number.isSafeInteger(targetTicks) || targetTicks < 0) {
    throw new TypeError('mux timeline tolerance must be a non-negative number of target ticks');
  }
  const invalid = validateTimeline(reference, 'reference') ?? validateTimeline(candidate, 'candidate');
  if (invalid) return muxVerdict('FAIL', invalid.reasonCode, invalid.detail);
  const measurements: Record<string, number> = {
    referenceTracks: reference.tracks.length,
    candidateTracks: candidate.tracks.length,
    comparedTracks: 0,
    comparedSamples: 0,
    targetTickTolerance: targetTicks,
    maximumResidualTargetTicks: 0,
  };
  if (candidate.tracks.length !== reference.tracks.length) {
    return muxVerdict(
      'FAIL',
      'MUX_TIMELINE_TRACK_COUNT_MISMATCH',
      `candidate has ${candidate.tracks.length} timeline track(s), reference has ${reference.tracks.length}`,
      measurements,
    );
  }

  const candidateById = new Map(candidate.tracks.map((track) => [track.semanticId, track]));
  const representationDiffs: string[] = [];
  for (const expected of reference.tracks) {
    const got = candidateById.get(expected.semanticId);
    if (!got) {
      return muxVerdict('FAIL', 'MUX_TIMELINE_TRACK_MISSING', `candidate is missing timeline '${expected.semanticId}'`, measurements);
    }
    if (expected.type !== got.type || canonicalCodec(expected.codec) !== canonicalCodec(got.codec)) {
      return muxVerdict(
        'FAIL',
        'MUX_TIMELINE_TRACK_IDENTITY_MISMATCH',
        `${expected.semanticId} expected ${expected.type}/${canonicalCodec(expected.codec)}, got ` +
          `${got.type}/${canonicalCodec(got.codec)}`,
        measurements,
      );
    }
    if (got.samples.length !== expected.samples.length) {
      return muxVerdict(
        'FAIL',
        'MUX_TIMELINE_SAMPLE_COUNT_MISMATCH',
        `${expected.semanticId} has ${got.samples.length} candidate sample(s), expected ${expected.samples.length}`,
        measurements,
      );
    }
    const monotonicFailure = decodeMonotonicityFailure(got);
    if (monotonicFailure) return muxVerdict('FAIL', 'MUX_DTS_NOT_MONOTONIC', monotonicFailure, measurements);
    const referenceMonotonicFailure = decodeMonotonicityFailure(expected);
    if (referenceMonotonicFailure) {
      return muxVerdict('FAIL', 'MUX_REFERENCE_DTS_NOT_MONOTONIC', referenceMonotonicFailure, measurements);
    }
    if (got.timescale !== expected.timescale) {
      representationDiffs.push(`${expected.semanticId} timescale ${expected.timescale}->${got.timescale}`);
    }

    const want = [...expected.samples].sort((a, b) => a.decodeIndex - b.decodeIndex);
    const have = [...got.samples].sort((a, b) => a.decodeIndex - b.decodeIndex);
    const referenceOrigin = want[0]?.dts ?? 0;
    const candidateOrigin = have[0]?.dts ?? 0;
    if (BigInt(referenceOrigin) * BigInt(got.timescale) !==
        BigInt(candidateOrigin) * BigInt(expected.timescale)) {
      representationDiffs.push(`${expected.semanticId} timestamp origin changed`);
    }
    for (let index = 0; index < want.length; index++) {
      const a = want[index]!;
      const b = have[index]!;
      if (a.decodeIndex !== b.decodeIndex) {
        return muxVerdict(
          'FAIL',
          'MUX_DECODE_SEQUENCE_MISMATCH',
          `${expected.semanticId} sample ${index} decode index ${b.decodeIndex}, expected ${a.decodeIndex}`,
          measurements,
        );
      }
      if (a.keyframe !== b.keyframe) {
        return muxVerdict(
          'FAIL',
          'MUX_RANDOM_ACCESS_MISMATCH',
          `${expected.semanticId} decode sample ${a.decodeIndex} keyframe=${b.keyframe}, expected ${a.keyframe}`,
          measurements,
        );
      }
      const fields = [
        ['DTS', a.dts - referenceOrigin, b.dts - candidateOrigin],
        ['PTS', a.pts - referenceOrigin, b.pts - candidateOrigin],
        ['duration', a.duration, b.duration],
        ['composition offset', a.pts - a.dts, b.pts - b.dts],
      ] as const;
      for (const [label, referenceTicks, candidateTicks] of fields) {
        const residual = residualInTargetTicks(referenceTicks, expected.timescale, candidateTicks, got.timescale);
        measurements.maximumResidualTargetTicks = Math.max(measurements.maximumResidualTargetTicks!, residual);
        if (residual > targetTicks) {
          return muxVerdict(
            'FAIL',
            label === 'composition offset' ? 'MUX_COMPOSITION_OFFSET_MISMATCH' : 'MUX_SAMPLE_TIMELINE_MISMATCH',
            `${expected.semanticId} decode sample ${a.decodeIndex} ${label} differs by ` +
              `${residual.toFixed(6)} target tick(s), tolerance ${targetTicks}`,
            measurements,
          );
        }
      }
      measurements.comparedSamples = (measurements.comparedSamples ?? 0) + 1;
    }

    const expectedIntervals = presentationIntervals(want);
    const candidateIntervals = presentationIntervals(have);
    for (let index = 0; index < expectedIntervals.length; index++) {
      const residual = residualInTargetTicks(
        expectedIntervals[index]!, expected.timescale,
        candidateIntervals[index]!, got.timescale,
      );
      measurements.maximumResidualTargetTicks = Math.max(measurements.maximumResidualTargetTicks!, residual);
      if (residual > targetTicks) {
        return muxVerdict(
          'FAIL',
          'MUX_VFR_INTERVAL_MISMATCH',
          `${expected.semanticId} presentation interval ${index} differs by ${residual.toFixed(6)} ` +
            `target tick(s), tolerance ${targetTicks}`,
          measurements,
        );
      }
    }
    measurements.comparedTracks = (measurements.comparedTracks ?? 0) + 1;
  }

  const candidateOrder = candidate.tracks.map((track) => track.semanticId).join('\u0000');
  const referenceOrder = reference.tracks.map((track) => track.semanticId).join('\u0000');
  if (candidateOrder !== referenceOrder) representationDiffs.push('output track order changed');
  return representationDiffs.length
    ? muxVerdict(
        'PASS',
        'MUX_TIMELINE_EQUIVALENT_REPRESENTATION',
        `full rational DTS/PTS/duration/VFR timeline matches; ${representationDiffs.join('; ')}`,
        measurements,
      )
    : muxVerdict(
        'PASS',
        'MUX_FULL_TIMELINE_MATCH',
        `${measurements.comparedSamples} sample(s) preserve DTS, PTS, duration, composition offset, and VFR cadence`,
        measurements,
      );
}

function validateTimeline(
  evidence: MuxTimelineEvidence,
  label: string,
): { reasonCode: string; detail: string } | undefined {
  if (evidence.schema !== MUX_TIMELINE_SCHEMA) {
    return { reasonCode: 'MUX_TIMELINE_SCHEMA_INVALID', detail: `${label} timeline schema is invalid` };
  }
  const ids = new Set<string>();
  for (const track of evidence.tracks) {
    if (!track.semanticId.trim() || ids.has(track.semanticId)) {
      return { reasonCode: 'MUX_TIMELINE_TRACK_ID_INVALID', detail: `${label} has an empty/duplicate semantic track id` };
    }
    ids.add(track.semanticId);
    if (!Number.isSafeInteger(track.timescale) || track.timescale <= 0) {
      return { reasonCode: 'MUX_TIMELINE_TIMESCALE_INVALID', detail: `${label} ${track.semanticId} timescale is invalid` };
    }
    if (track.samples.length === 0) {
      return { reasonCode: 'MUX_TIMELINE_EMPTY', detail: `${label} ${track.semanticId} has no samples` };
    }
    const decodeIndexes = new Set<number>();
    for (const sample of track.samples) {
      if (![sample.decodeIndex, sample.pts, sample.dts, sample.duration].every(Number.isSafeInteger) ||
          sample.decodeIndex < 0 || sample.duration <= 0 || decodeIndexes.has(sample.decodeIndex)) {
        return {
          reasonCode: 'MUX_TIMELINE_SAMPLE_INVALID',
          detail: `${label} ${track.semanticId} carries an invalid/duplicate decode sample`,
        };
      }
      decodeIndexes.add(sample.decodeIndex);
    }
  }
  return undefined;
}

function decodeMonotonicityFailure(track: MuxTrackTimeline): string | undefined {
  const samples = [...track.samples].sort((a, b) => a.decodeIndex - b.decodeIndex);
  for (let index = 1; index < samples.length; index++) {
    if (samples[index]!.dts < samples[index - 1]!.dts) {
      return `${track.semanticId} DTS regresses at decode index ${samples[index]!.decodeIndex}: ` +
        `${samples[index - 1]!.dts}->${samples[index]!.dts}`;
    }
  }
  return undefined;
}

function presentationIntervals(samples: readonly MuxTimelineSample[]): number[] {
  const pts = samples.map((sample) => sample.pts).sort((a, b) => a - b);
  return pts.slice(1).map((value, index) => value - pts[index]!);
}

function residualInTargetTicks(
  referenceTicks: number,
  referenceScale: number,
  targetTicks: number,
  targetScale: number,
): number {
  const numerator = absBigInt(
    BigInt(referenceTicks) * BigInt(targetScale) - BigInt(targetTicks) * BigInt(referenceScale),
  );
  return Number(numerator) / referenceScale;
}

function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function canonicalCodec(value: string): string {
  const codec = value.trim().toLowerCase();
  if (/^(avc1|avc3)(\.|$)/.test(codec)) return 'h264';
  if (/^(hvc1|hev1)(\.|$)/.test(codec)) return 'hevc';
  if (/^mp4a\.40(?:\.|$)/.test(codec)) return 'aac';
  return codec;
}

function defaultTimelineSemanticId(track: RemuxTrackEvidence, typeCodecOrdinal: number): string {
  return `${track.type}:${canonicalCodec(track.codec)}:${typeCodecOrdinal}`;
}
