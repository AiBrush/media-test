import { readOutputPacketsResult, readOutputStructureResult } from '../../core/box-readers.ts';
import type { MediaBytes } from '../../core/engine.ts';
import { demuxMp4Tracks } from '../../engines/platform/demux-mp4.ts';
import {
  transcodeError,
  transcodeUnavailable,
  transcodeVerdict,
  type TranscodeDecision,
} from './types.ts';

export const TRANSCODE_ABR_SCHEMA = 'media-test/transcode-abr@1' as const;
export const TRANSCODE_ABR_RENDITION_SET_ROLE = 'transcode-abr-rendition-set' as const;
export const TRANSCODE_ABR_SWITCH_ROLE_PREFIX = 'transcode-abr-switch:' as const;
export const TRANSCODE_AVERAGE_VIDEO_BITRATE_SCHEMA = 'media-test/transcode-average-video-bitrate@1' as const;

/** Stable intermediate role for a neutrally decodable, actually stitched adjacent-rung switch. */
export function transcodeAbrSwitchRole(fromId: string, toId: string, switchPointUs: number): string {
  if (!fromId.trim() || !toId.trim() || !Number.isSafeInteger(switchPointUs) || switchPointUs < 0) {
    throw new TypeError('ABR switch role requires rendition ids and a non-negative integer switch point');
  }
  return `${TRANSCODE_ABR_SWITCH_ROLE_PREFIX}${encodeURIComponent(fromId)}:${encodeURIComponent(toId)}:${switchPointUs}`;
}

export interface AbrSampleInterval {
  readonly ptsUs: number;
  readonly durationUs: number;
  readonly keyframe: boolean;
}

export interface AbrRenditionEvidence {
  readonly id: string;
  readonly codec: string;
  readonly width: number;
  readonly height: number;
  readonly bitrateBps: number;
  /** Sum of elementary video sample payload bytes; excludes audio and container overhead. */
  readonly videoSamplePayloadBytes: number;
  readonly durationUs: number;
  readonly timebase: Readonly<{ numerator: number; denominator: number }>;
  readonly samples: readonly AbrSampleInterval[];
  readonly segmentBoundariesUs?: readonly number[];
  readonly validity: TranscodeDecision;
  readonly quality: TranscodeDecision;
}

export interface AverageVideoBitrateContract {
  readonly schema: typeof TRANSCODE_AVERAGE_VIDEO_BITRATE_SCHEMA;
  readonly targetBitrateBps: number;
  readonly minimumBitrateRatio: number;
  readonly maximumBitrateRatio: number;
}

export interface AverageVideoBitrateEvidence {
  /** Sum of elementary video sample payload bytes; never the whole output file size. */
  readonly videoSamplePayloadBytes: number;
  /** max(video PTS + duration) - min(video PTS), in microseconds. */
  readonly presentationSpanUs: number;
  readonly sampleCount: number;
}

export type AverageVideoBitrateEvidenceResult =
  | Readonly<{ state: 'OK'; value: AverageVideoBitrateEvidence }>
  | Readonly<{ state: 'BLOCKED'; decision: TranscodeDecision }>;

export type AbrRenditionEvidenceResult =
  | Readonly<{ state: 'OK'; value: AbrRenditionEvidence }>
  | Readonly<{ state: 'BLOCKED'; decision: TranscodeDecision }>;

export interface AbrRenditionContract {
  readonly id: string;
  readonly codec: string;
  readonly width: number;
  readonly height: number;
  readonly targetBitrateBps: number;
  readonly minimumBitrateRatio: number;
  readonly maximumBitrateRatio: number;
}

export interface AbrSwitchingContract {
  readonly schema: typeof TRANSCODE_ABR_SCHEMA;
  readonly id: string;
  readonly renditions: readonly AbrRenditionContract[];
  readonly durationToleranceUs: number;
  readonly alignmentToleranceUs: number;
  readonly requireCommonTimebase: boolean;
}

/** Candidate-authored manifest or an equally explicit normalized rendition-set description. */
export interface AbrRenditionSetDescription {
  readonly kind: 'manifest' | 'explicit';
  readonly id: string;
  readonly renditionIds: readonly string[];
  readonly switchPointsUs: readonly number[];
  readonly segmentMode: 'random-access' | 'segments';
}

/** Evidence from actually decoding a source-rung prefix followed by the target random-access suffix. */
export interface AbrSwitchDecodeEvidence {
  readonly fromId: string;
  readonly toId: string;
  readonly switchPointUs: number;
  readonly sourceLastEndUs: number;
  readonly targetFirstPtsUs: number;
  readonly decodedTargetFrames: number;
  readonly decision: TranscodeDecision;
}

export function defineAbrSwitchingContract(
  value: Omit<AbrSwitchingContract, 'schema'>,
): AbrSwitchingContract {
  if (!value.id.trim() || value.renditions.length < 2) {
    throw new TypeError('ABR contract requires an id and at least two renditions');
  }
  const ids = new Set<string>();
  for (const rendition of value.renditions) {
    if (!rendition.id.trim() || ids.has(rendition.id)) throw new TypeError('ABR rendition ids must be unique');
    ids.add(rendition.id);
    if (!rendition.codec.trim() || !Number.isSafeInteger(rendition.width) || rendition.width <= 0 ||
        !Number.isSafeInteger(rendition.height) || rendition.height <= 0 ||
        !Number.isFinite(rendition.targetBitrateBps) || rendition.targetBitrateBps <= 0 ||
        !Number.isFinite(rendition.minimumBitrateRatio) || rendition.minimumBitrateRatio <= 0 ||
        !Number.isFinite(rendition.maximumBitrateRatio) ||
        rendition.maximumBitrateRatio < rendition.minimumBitrateRatio) {
      throw new TypeError(`ABR rendition '${rendition.id}' has an invalid shape/bitrate band`);
    }
  }
  if (!Number.isFinite(value.durationToleranceUs) || value.durationToleranceUs < 0 ||
      !Number.isFinite(value.alignmentToleranceUs) || value.alignmentToleranceUs < 0) {
    throw new TypeError('ABR tolerances must be finite and non-negative');
  }
  return deepFreeze({ schema: TRANSCODE_ABR_SCHEMA, ...value });
}

export function defineAverageVideoBitrateContract(
  value: Omit<AverageVideoBitrateContract, 'schema'>,
): AverageVideoBitrateContract {
  if (!Number.isFinite(value.targetBitrateBps) || value.targetBitrateBps <= 0 ||
      !Number.isFinite(value.minimumBitrateRatio) || value.minimumBitrateRatio <= 0 ||
      !Number.isFinite(value.maximumBitrateRatio) ||
      value.maximumBitrateRatio < value.minimumBitrateRatio) {
    throw new TypeError('average-video-bitrate contract requires a positive target and ordered positive ratio band');
  }
  return deepFreeze({ schema: TRANSCODE_AVERAGE_VIDEO_BITRATE_SCHEMA, ...value });
}

/**
 * Reuse the ABR collector's neutral MP4/sample-table path for a single output. The returned
 * evidence is deliberately limited to elementary video payload bytes and presentation span so a
 * consumer cannot accidentally substitute whole-file size or a track's declared bitrate field.
 */
export function collectAverageVideoBitrateEvidence(
  output: MediaBytes,
): AverageVideoBitrateEvidenceResult {
  const notScored = transcodeVerdict(
    'PASS',
    'TRANSCODE_AVERAGE_VIDEO_BITRATE_COLLECTION_ONLY',
    'single-output collection does not score validity or quality',
  );
  const collected = collectAbrRenditionEvidence('single-output', output, notScored, notScored);
  if (collected.state === 'BLOCKED') return collected;
  return {
    state: 'OK',
    value: Object.freeze({
      videoSamplePayloadBytes: collected.value.videoSamplePayloadBytes,
      presentationSpanUs: collected.value.durationUs,
      sampleCount: collected.value.samples.length,
    }),
  };
}

/** Score the independently observed average video rate against an authored target band. */
export function evaluateAverageVideoBitrate(
  contract: AverageVideoBitrateContract,
  evidence: AverageVideoBitrateEvidence,
): TranscodeDecision {
  if (!Number.isSafeInteger(evidence.videoSamplePayloadBytes) || evidence.videoSamplePayloadBytes <= 0 ||
      !Number.isSafeInteger(evidence.presentationSpanUs) || evidence.presentationSpanUs <= 0 ||
      !Number.isSafeInteger(evidence.sampleCount) || evidence.sampleCount <= 0) {
    return transcodeError(
      'TRANSCODE_AVERAGE_VIDEO_BITRATE_EVIDENCE_INVALID',
      'average-video-bitrate evidence requires positive integer payload bytes, presentation span, and sample count',
    );
  }
  const bitrateBps = evidence.videoSamplePayloadBytes * 8 * 1_000_000 / evidence.presentationSpanUs;
  const ratio = bitrateBps / contract.targetBitrateBps;
  const measurements = {
    videoSamplePayloadBytes: evidence.videoSamplePayloadBytes,
    videoPresentationSpanUs: evidence.presentationSpanUs,
    videoSampleCount: evidence.sampleCount,
    videoAverageBitrateBps: bitrateBps,
    videoTargetBitrateBps: contract.targetBitrateBps,
    videoBitrateRatio: ratio,
    videoMinimumBitrateBps: contract.targetBitrateBps * contract.minimumBitrateRatio,
    videoMaximumBitrateBps: contract.targetBitrateBps * contract.maximumBitrateRatio,
  };
  if (ratio < contract.minimumBitrateRatio || ratio > contract.maximumBitrateRatio) {
    return transcodeVerdict(
      'FAIL',
      'TRANSCODE_AVERAGE_VIDEO_BITRATE_BAND_MISMATCH',
      `measured elementary video rate ${Math.round(bitrateBps)}bps is ${ratio.toFixed(3)}x requested; ` +
        `allowed ${contract.minimumBitrateRatio}..${contract.maximumBitrateRatio}`,
      measurements,
    );
  }
  return transcodeVerdict(
    'PASS',
    'TRANSCODE_AVERAGE_VIDEO_BITRATE_MATCH',
    `measured elementary video rate ${Math.round(bitrateBps)}bps is ${ratio.toFixed(3)}x requested, ` +
      `inside ${contract.minimumBitrateRatio}..${contract.maximumBitrateRatio}`,
    measurements,
  );
}

/** Collect authored sample/keyframe/bitrate facts without using a scored engine. */
export function collectAbrRenditionEvidence(
  id: string,
  output: MediaBytes,
  validity: TranscodeDecision,
  quality: TranscodeDecision,
): AbrRenditionEvidenceResult {
  if (!(output.bytes instanceof Uint8Array) || output.bytes.byteLength === 0) {
    return blocked(transcodeVerdict('FAIL', 'TRANSCODE_ABR_RENDITION_EMPTY', `rendition '${id}' has no bytes`));
  }
  const structure = readOutputStructureResult(output.bytes, output.container);
  if (structure.state === 'MALFORMED' || structure.state === 'INCOMPLETE') {
    return blocked(transcodeVerdict(
      'FAIL',
      'TRANSCODE_ABR_RENDITION_INVALID',
      `rendition '${id}' is ${structure.state.toLowerCase()} [${structure.reasonCode}]`,
    ));
  }
  if (structure.state !== 'OK') {
    return blocked(transcodeUnavailable(
      'NA_ASSET',
      structure.reasonCode,
      `neutral reader cannot establish rendition '${id}' structure`,
    ));
  }
  const structureVideo = structure.value.tracks.find((track) => track.type === 'video');
  if (!structureVideo) {
    return blocked(transcodeVerdict('FAIL', 'TRANSCODE_ABR_VIDEO_TRACK_MISSING', `rendition '${id}' has no video track`));
  }

  try {
    const mp4 = demuxMp4Tracks(output.bytes).find((track) => track.kind === 'video');
    if (mp4) {
      const samples = mp4.samples
        .map((sample) => ({ ptsUs: sample.ptsUs, durationUs: sample.durationUs, keyframe: sample.keyframe }))
        .sort((a, b) => a.ptsUs - b.ptsUs);
      return collected(id, structureVideo.codec ?? mp4.config.codec, mp4.config.codedWidth,
        mp4.config.codedHeight, mp4.config.timescale, samples,
        mp4.samples.reduce((sum, sample) => sum + sample.data.byteLength, 0), validity, quality);
    }
  } catch {
    // Typed neutral packet fallback below; never infer success from this catch.
  }

  const packets = readOutputPacketsResult(output.bytes, output.container);
  if (packets.state === 'MALFORMED' || packets.state === 'INCOMPLETE') {
    return blocked(transcodeVerdict(
      'FAIL',
      'TRANSCODE_ABR_SAMPLE_TABLE_INVALID',
      `rendition '${id}' sample table is ${packets.state.toLowerCase()} [${packets.reasonCode}]`,
    ));
  }
  if (packets.state !== 'OK') {
    return blocked(transcodeUnavailable(
      'NA_ASSET',
      packets.reasonCode,
      `neutral sample-table evidence is unavailable for rendition '${id}'`,
    ));
  }
  const videoIndex = structure.value.tracks.findIndex((track) => track.type === 'video');
  const rows = packets.value.filter((packet) => packet.trackIndex === videoIndex);
  if (!rows.length || structureVideo.width === undefined || structureVideo.height === undefined) {
    return blocked(transcodeUnavailable(
      'NA_ASSET',
      'TRANSCODE_ABR_SAMPLE_EVIDENCE_INCOMPLETE',
      `rendition '${id}' lacks byte-readable video samples/dimensions`,
    ));
  }
  return collected(
    id,
    structureVideo.codec ?? '',
    structureVideo.width,
    structureVideo.height,
    1_000_000,
    rows.map((row) => ({ ptsUs: row.ptsUs, durationUs: row.durationUs ?? 0, keyframe: row.keyframe }))
      .sort((a, b) => a.ptsUs - b.ptsUs),
    rows.reduce((sum, row) => sum + row.size, 0),
    validity,
    quality,
  );
}

export function evaluateAbrSwitchability(
  contract: AbrSwitchingContract,
  description: AbrRenditionSetDescription | undefined,
  evidence: readonly AbrRenditionEvidence[],
  switchDecodeEvidence?: readonly AbrSwitchDecodeEvidence[],
): TranscodeDecision {
  if (!description) {
    return transcodeVerdict(
      'FAIL',
      'TRANSCODE_ABR_DESCRIPTION_MISSING',
      'four independent files are insufficient: candidate exposed no manifest/rendition-set description',
    );
  }
  if (description.id !== contract.id) {
    return transcodeVerdict('FAIL', 'TRANSCODE_ABR_DESCRIPTION_ID_MISMATCH',
      `rendition-set id '${description.id}' vs requested '${contract.id}'`);
  }
  const expectedIds = contract.renditions.map((rendition) => rendition.id);
  if (!sameArray(description.renditionIds, expectedIds)) {
    return transcodeVerdict(
      'FAIL',
      'TRANSCODE_ABR_DESCRIPTION_RENDITIONS_MISMATCH',
      `description renditions [${description.renditionIds.join(',')}] vs expected [${expectedIds.join(',')}]`,
    );
  }
  if (evidence.length !== contract.renditions.length) {
    return transcodeVerdict(
      'FAIL',
      'TRANSCODE_ABR_RENDITION_COUNT_MISMATCH',
      `candidate exposed ${evidence.length} rendition(s); expected ${contract.renditions.length}`,
    );
  }
  if (!sameArray(evidence.map((entry) => entry.id), expectedIds)) {
    return transcodeVerdict(
      'FAIL',
      'TRANSCODE_ABR_RENDITION_ORDER_MISMATCH',
      'candidate rendition order/ids do not match the explicit switching set',
    );
  }
  const switchPoints = [...description.switchPointsUs];
  if (switchPoints.length === 0 || switchPoints.some((value, index) =>
    !Number.isSafeInteger(value) || value < 0 || (index > 0 && value <= switchPoints[index - 1]!))) {
    return transcodeVerdict(
      'FAIL',
      'TRANSCODE_ABR_SWITCH_POINTS_INVALID',
      'description must declare a strictly increasing non-negative switching timeline',
    );
  }

  const expectedSwitchKeys = new Set<string>();
  for (const point of switchPoints) {
    for (let index = 0; index + 1 < expectedIds.length; index++) {
      expectedSwitchKeys.add(switchKey(expectedIds[index]!, expectedIds[index + 1]!, point));
      expectedSwitchKeys.add(switchKey(expectedIds[index + 1]!, expectedIds[index]!, point));
    }
  }
  const observedSwitches = new Map<string, AbrSwitchDecodeEvidence>();
  for (const attempt of switchDecodeEvidence ?? []) {
    const key = switchKey(attempt.fromId, attempt.toId, attempt.switchPointUs);
    if (!expectedSwitchKeys.has(key) || observedSwitches.has(key)) {
      return transcodeError(
        'TRANSCODE_ABR_SWITCH_DECODE_EVIDENCE_INVALID',
        `unexpected or duplicate decoded switch evidence '${key}'`,
      );
    }
    observedSwitches.set(key, attempt);
  }
  if (observedSwitches.size !== expectedSwitchKeys.size) {
    const missing = [...expectedSwitchKeys].filter((key) => !observedSwitches.has(key));
    return transcodeVerdict(
      'FAIL',
      'TRANSCODE_ABR_SWITCH_DECODE_EVIDENCE_MISSING',
      `decoded switching evidence covers ${observedSwitches.size}/${expectedSwitchKeys.size} adjacent ` +
        `bidirectional attempts; missing ${missing.join(', ')}`,
    );
  }

  let sawDiff = false;
  const measurements: Record<string, number> = { renditions: evidence.length, switchPoints: switchPoints.length };
  for (let index = 0; index < evidence.length; index++) {
    const observed = evidence[index]!;
    const expected = contract.renditions[index]!;
    for (const [role, decision] of [['validity', observed.validity], ['quality', observed.quality]] as const) {
      if (decision.state === 'ERROR') return transcodeError(decision.reasonCode, `${observed.id} ${role}: ${decision.detail}`);
      if (decision.state === 'UNAVAILABLE') {
        return transcodeUnavailable(decision.status, decision.reasonCode, `${observed.id} ${role}: ${decision.detail}`);
      }
      if (decision.verdict === 'FAIL') {
        return transcodeVerdict('FAIL', decision.reasonCode, `${observed.id} ${role}: ${decision.detail}`);
      }
    }
    if (canonicalCodec(observed.codec) !== canonicalCodec(expected.codec) ||
        observed.width !== expected.width || observed.height !== expected.height) {
      return transcodeVerdict(
        'FAIL',
        'TRANSCODE_ABR_RENDITION_SHAPE_MISMATCH',
        `${observed.id} is ${observed.codec} ${observed.width}x${observed.height}; expected ` +
          `${expected.codec} ${expected.width}x${expected.height}`,
      );
    }
    const ratio = observed.bitrateBps / expected.targetBitrateBps;
    measurements[`rendition${index}BitrateBps`] = observed.bitrateBps;
    measurements[`rendition${index}BitrateRatio`] = ratio;
    measurements[`rendition${index}DurationUs`] = observed.durationUs;
    if (ratio < expected.minimumBitrateRatio || ratio > expected.maximumBitrateRatio) {
      return transcodeVerdict(
        'FAIL',
        'TRANSCODE_ABR_BITRATE_BAND_MISMATCH',
        `${observed.id} video bitrate ${Math.round(observed.bitrateBps)}bps is ` +
          `${ratio.toFixed(3)}x requested; allowed ${expected.minimumBitrateRatio}..${expected.maximumBitrateRatio}`,
        measurements,
      );
    }
    if (observed.samples.length === 0 || observed.samples.some((sample) =>
      !Number.isSafeInteger(sample.ptsUs) || !Number.isSafeInteger(sample.durationUs) || sample.durationUs <= 0)) {
      return transcodeVerdict(
        'FAIL',
        'TRANSCODE_ABR_SAMPLE_TIMELINE_INVALID',
        `${observed.id} does not expose a complete positive-duration sample timeline`,
      );
    }
  }

  const anchor = evidence[0]!;
  for (let index = 1; index < evidence.length; index++) {
    const observed = evidence[index]!;
    const durationDelta = Math.abs(observed.durationUs - anchor.durationUs);
    measurements[`rendition${index}DurationDeltaUs`] = durationDelta;
    if (durationDelta > contract.durationToleranceUs) {
      return transcodeVerdict(
        'FAIL',
        'TRANSCODE_ABR_DURATION_MISMATCH',
        `${observed.id} duration differs from ${anchor.id} by ${durationDelta}us`,
        measurements,
      );
    }
    if (contract.requireCommonTimebase && !sameRational(observed.timebase, anchor.timebase)) {
      return transcodeVerdict(
        'FAIL',
        'TRANSCODE_ABR_TIMEBASE_MISMATCH',
        `${observed.id} timebase ${observed.timebase.numerator}/${observed.timebase.denominator} vs ` +
          `${anchor.id} ${anchor.timebase.numerator}/${anchor.timebase.denominator}`,
      );
    }
  }
  for (const point of switchPoints) {
    if (point > anchor.durationUs + contract.alignmentToleranceUs) {
      return transcodeVerdict(
        'FAIL',
        'TRANSCODE_ABR_SWITCH_POINT_OUTSIDE_PRESENTATION',
        `declared switch point ${point}us exceeds the common presentation`,
      );
    }
    for (let index = 0; index + 1 < evidence.length; index++) {
      const high = evidence[index]!;
      const low = evidence[index + 1]!;
      const down = assessSwitch(high, low, point, contract.alignmentToleranceUs, description.segmentMode);
      if (down) return down;
      const downDecode = assessDecodedSwitch(
        observedSwitches.get(switchKey(high.id, low.id, point))!,
        contract.alignmentToleranceUs,
      );
      if (downDecode.decision) return downDecode.decision;
      if (downDecode.sawDiff) sawDiff = true;
      const up = assessSwitch(low, high, point, contract.alignmentToleranceUs, description.segmentMode);
      if (up) return up;
      const upDecode = assessDecodedSwitch(
        observedSwitches.get(switchKey(low.id, high.id, point))!,
        contract.alignmentToleranceUs,
      );
      if (upDecode.decision) return upDecode.decision;
      if (upDecode.sawDiff) sawDiff = true;
    }
  }
  return transcodeVerdict(
    'PASS',
    sawDiff ? 'TRANSCODE_ABR_SWITCHABLE_WITH_REPRESENTATION_DIFF' : 'TRANSCODE_ABR_SWITCHABLE_SET',
    `${evidence.length} valid renditions switch in both directions across every adjacent rung at ` +
      `${switchPoints.length} declared boundary/boundaries without a timeline gap or overlap`,
    measurements,
  );
}

function assessDecodedSwitch(
  evidence: AbrSwitchDecodeEvidence,
  toleranceUs: number,
): { decision?: TranscodeDecision; sawDiff: boolean } {
  const prefix = `${evidence.fromId}->${evidence.toId} at ${evidence.switchPointUs}us`;
  if (evidence.decision.state === 'ERROR') {
    return { decision: transcodeError(evidence.decision.reasonCode, `${prefix}: ${evidence.decision.detail}`), sawDiff: false };
  }
  if (evidence.decision.state === 'UNAVAILABLE') {
    return {
      decision: transcodeUnavailable(
        evidence.decision.status,
        evidence.decision.reasonCode,
        `${prefix}: ${evidence.decision.detail}`,
      ),
      sawDiff: false,
    };
  }
  if (evidence.decision.verdict === 'FAIL') {
    return {
      decision: transcodeVerdict('FAIL', evidence.decision.reasonCode, `${prefix}: ${evidence.decision.detail}`),
      sawDiff: false,
    };
  }
  if (!Number.isSafeInteger(evidence.decodedTargetFrames) || evidence.decodedTargetFrames <= 0 ||
      !Number.isSafeInteger(evidence.sourceLastEndUs) || !Number.isSafeInteger(evidence.targetFirstPtsUs)) {
    return {
      decision: transcodeError(
        'TRANSCODE_ABR_SWITCH_DECODE_EVIDENCE_INVALID',
        `${prefix}: decoded boundary observations are not complete integers`,
      ),
      sawDiff: false,
    };
  }
  const gapOrOverlap = evidence.targetFirstPtsUs - evidence.sourceLastEndUs;
  if (Math.abs(gapOrOverlap) > toleranceUs ||
      Math.abs(evidence.targetFirstPtsUs - evidence.switchPointUs) > toleranceUs) {
    return {
      decision: transcodeVerdict(
        'FAIL',
        gapOrOverlap > 0 ? 'TRANSCODE_ABR_DECODED_SWITCH_GAP' : 'TRANSCODE_ABR_DECODED_SWITCH_OVERLAP',
        `${prefix}: decoded boundary has ${gapOrOverlap}us gap/overlap`,
      ),
      sawDiff: false,
    };
  }
  return { sawDiff: false };
}

function assessSwitch(
  from: AbrRenditionEvidence,
  to: AbrRenditionEvidence,
  pointUs: number,
  toleranceUs: number,
  mode: AbrRenditionSetDescription['segmentMode'],
): TranscodeDecision | undefined {
  const target = nearest(to.samples.filter((sample) => sample.keyframe), pointUs);
  if (!target || Math.abs(target.ptsUs - pointUs) > toleranceUs) {
    return transcodeVerdict(
      'FAIL',
      'TRANSCODE_ABR_RANDOM_ACCESS_MISALIGNED',
      `${from.id}->${to.id} at ${pointUs}us has no aligned target random-access sample`,
    );
  }
  if (pointUs > 0) {
    const previous = from.samples
      .filter((sample) => sample.ptsUs < pointUs)
      .sort((a, b) =>
        Math.abs(a.ptsUs + a.durationUs - pointUs) - Math.abs(b.ptsUs + b.durationUs - pointUs) ||
        b.ptsUs - a.ptsUs)[0];
    if (!previous) {
      return transcodeVerdict('FAIL', 'TRANSCODE_ABR_SWITCH_SOURCE_INTERVAL_MISSING',
        `${from.id}->${to.id} at ${pointUs}us has no source interval`);
    }
    const sourceEnd = previous.ptsUs + previous.durationUs;
    const gapOrOverlap = target.ptsUs - sourceEnd;
    if (Math.abs(gapOrOverlap) > toleranceUs) {
      return transcodeVerdict(
        'FAIL',
        gapOrOverlap > 0 ? 'TRANSCODE_ABR_SWITCH_GAP' : 'TRANSCODE_ABR_SWITCH_OVERLAP',
        `${from.id}->${to.id} at ${pointUs}us has ${gapOrOverlap}us ` +
          `${gapOrOverlap > 0 ? 'gap' : 'overlap'}`,
      );
    }
  }
  if (mode === 'segments') {
    if (!from.segmentBoundariesUs || !to.segmentBoundariesUs ||
        !nearValue(from.segmentBoundariesUs, pointUs, toleranceUs) ||
        !nearValue(to.segmentBoundariesUs, pointUs, toleranceUs)) {
      return transcodeVerdict(
        'FAIL',
        'TRANSCODE_ABR_SEGMENT_BOUNDARY_MISALIGNED',
        `${from.id}->${to.id} at ${pointUs}us is not a shared segment boundary`,
      );
    }
  }
  return undefined;
}

function collected(
  id: string,
  codec: string,
  width: number,
  height: number,
  timescale: number,
  samples: AbrSampleInterval[],
  videoBytes: number,
  validity: TranscodeDecision,
  quality: TranscodeDecision,
): AbrRenditionEvidenceResult {
  if (!Number.isSafeInteger(timescale) || timescale <= 0 || samples.length === 0) {
    return blocked(transcodeUnavailable(
      'NA_ASSET', 'TRANSCODE_ABR_TIMELINE_EVIDENCE_UNAVAILABLE', `${id} lacks timescale/sample evidence`));
  }
  const first = Math.min(...samples.map((sample) => sample.ptsUs));
  const end = Math.max(...samples.map((sample) => sample.ptsUs + sample.durationUs));
  const durationUs = end - first;
  if (durationUs <= 0) {
    return blocked(transcodeVerdict('FAIL', 'TRANSCODE_ABR_DURATION_INVALID', `${id} has no positive presentation span`));
  }
  return {
    state: 'OK',
    value: Object.freeze({
      id, codec, width, height,
      bitrateBps: videoBytes * 8 * 1_000_000 / durationUs,
      videoSamplePayloadBytes: videoBytes,
      durationUs,
      timebase: Object.freeze({ numerator: 1, denominator: timescale }),
      samples: Object.freeze(samples.map((sample) => Object.freeze({ ...sample }))),
      validity,
      quality,
    }),
  };
}

function blocked(decision: TranscodeDecision): AbrRenditionEvidenceResult {
  return { state: 'BLOCKED', decision };
}

function nearest(samples: readonly AbrSampleInterval[], pointUs: number): AbrSampleInterval | undefined {
  return [...samples].sort((a, b) =>
    Math.abs(a.ptsUs - pointUs) - Math.abs(b.ptsUs - pointUs) || a.ptsUs - b.ptsUs)[0];
}

function nearValue(values: readonly number[], pointUs: number, toleranceUs: number): boolean {
  return values.some((value) => Math.abs(value - pointUs) <= toleranceUs);
}

function sameRational(
  first: Readonly<{ numerator: number; denominator: number }>,
  second: Readonly<{ numerator: number; denominator: number }>,
): boolean {
  return first.numerator * second.denominator === second.numerator * first.denominator;
}

function sameArray(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function switchKey(fromId: string, toId: string, pointUs: number): string {
  return `${fromId}->${toId}@${pointUs}`;
}

function canonicalCodec(value: string): string {
  const token = value.trim().toLowerCase();
  if (token.startsWith('avc1') || token === 'avc3') return 'h264';
  if (token.startsWith('hvc1') || token.startsWith('hev1')) return 'hevc';
  if (token.startsWith('vp09')) return 'vp9';
  if (token.startsWith('av01')) return 'av1';
  return token;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return value;
}
