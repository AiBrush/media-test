import { pairFramesByTimestamp } from '../../core/golden-frame-evidence.ts';
import type { TrimMode, TrimRange } from './contracts.ts';
import { trimError, trimUnavailable, trimVerdict, type TrimDecision } from './types.ts';

export const TRIM_BOUNDARY_EVIDENCE_SCHEMA = 'media-test/trim-boundary-evidence@1' as const;

export interface TrimBoundaryFrame {
  /** Timestamp in the source presentation timeline. Required for baked reference frames. */
  readonly sourcePtsUs?: number;
  /** Timestamp observed in the zero-based candidate output timeline. */
  readonly ptsUs: number;
  readonly durationUs: number;
  readonly contentDigest: string;
  /** Measured SSIM against this frame's paired reference after a declared re-encode. */
  readonly contentSimilarity?: number;
  readonly required?: boolean;
  readonly keyframe?: boolean;
}

export interface TrimBoundaryEvidenceArtifact {
  readonly schema: typeof TRIM_BOUNDARY_EVIDENCE_SCHEMA;
  readonly assetId: string;
  readonly key: string;
  readonly range: TrimRange;
  readonly mode: TrimMode;
  readonly representationClass: string;
  readonly provenance: Readonly<{
    decoder: string;
    configurationDigest: string;
    browserFamily?: string;
  }>;
  readonly expectedLandedInterval: TrimRange;
  readonly outputOriginUs: 0;
  readonly timestampToleranceUs: number;
  /** Optional perceptual gate for a declared lossy boundary re-encode. */
  readonly minimumContentSimilarity?: number;
  /** Optional aggregate gate across all paired required observations for a lossy re-encode. */
  readonly minimumMeanContentSimilarity?: number;
  readonly frames: readonly TrimBoundaryFrame[];
}

export type TrimBoundaryReference =
  | { readonly state: 'READY'; readonly artifact: TrimBoundaryEvidenceArtifact }
  | { readonly state: 'MISSING'; readonly reasonCode: string; readonly detail: string }
  | { readonly state: 'BROWSER_UNAVAILABLE'; readonly reasonCode: string; readonly detail: string }
  | { readonly state: 'INVALID_BITSTREAM'; readonly reasonCode: string; readonly detail: string }
  | { readonly state: 'ERROR'; readonly reasonCode: string; readonly detail: string };

export interface CandidateTrimBoundaryEvidence {
  readonly outputOriginUs: number;
  readonly landedSourceInterval: TrimRange;
  readonly frames: readonly TrimBoundaryFrame[];
  readonly decodeComplete: boolean;
  /** Named legal form changes (AVCC/Annex-B, parameter-set placement, NAL grouping, …). */
  readonly representationDifferences?: readonly string[];
}

export interface TrimBoundaryAssessmentRequest {
  readonly assetId: string;
  readonly range: TrimRange;
  readonly mode: TrimMode;
  readonly representationClass: string;
  readonly reference: TrimBoundaryReference;
  readonly candidate: CandidateTrimBoundaryEvidence;
}

export interface SampledTrimFrame {
  readonly ptsUs: number;
  readonly contentDigest: string;
  readonly required?: boolean;
}

export interface GoldenTrimPacket {
  readonly trackIndex: number;
  readonly size: number;
  readonly ptsUs: number;
  readonly dtsUs?: number;
  readonly durationUs?: number;
  readonly keyframe: boolean;
}

export interface CandidateTrimPacket {
  readonly payloadByteLength: number;
  readonly ptsUs?: number;
  readonly dtsUs?: number;
  readonly durationUs?: number;
  readonly keyframe?: boolean;
}

function minimumTimestamp(values: readonly number[]): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (const value of values) minimum = Math.min(minimum, value);
  return minimum;
}

/** Compare a bounded URL copy-trim against an independently baked source packet table. */
export function assessGoldenVideoPacketCopyTrim(input: {
  readonly packets: readonly GoldenTrimPacket[];
  readonly videoTrackIndex: number;
  readonly candidate: readonly CandidateTrimPacket[];
  readonly range: TrimRange;
  readonly timestampToleranceUs: number;
  readonly durationToleranceUs: number;
}): TrimDecision {
  const source = input.packets.filter((packet) => packet.trackIndex === input.videoTrackIndex);
  if (source.length === 0) {
    return trimUnavailable('NA_ASSET', 'TRIM_GOLDEN_VIDEO_PACKETS_MISSING', 'baked source has no video packets');
  }
  const sourcePresentationOriginUs = minimumTimestamp(source.map((packet) => packet.ptsUs));
  const sourceDurationUs = (index: number): number => packetDurationUs(source, index);
  let first = source.findIndex((packet, index) => {
    const ptsUs = packet.ptsUs - sourcePresentationOriginUs;
    return ptsUs < input.range.endUs && ptsUs + sourceDurationUs(index) > input.range.startUs;
  });
  if (first < 0) {
    return trimUnavailable(
      'NA_ASSET',
      'TRIM_GOLDEN_VIDEO_INTERVAL_EMPTY',
      'baked source has no video packet intersecting the requested range',
    );
  }
  while (first > 0 && source[first]?.keyframe !== true) first--;
  if (source[first]?.keyframe !== true) {
    return trimUnavailable(
      'NA_ASSET',
      'TRIM_GOLDEN_VIDEO_RANDOM_ACCESS_MISSING',
      'baked source has no random-access packet at or before the requested range',
    );
  }
  const selected = source.slice(first).filter(
    (packet) => packet.ptsUs - sourcePresentationOriginUs < input.range.endUs,
  );
  const candidate = input.candidate;
  const measurements: Record<string, number> = {
    selectedSourceSamples: selected.length,
    candidateOutputSamples: candidate.length,
  };
  if (selected.length !== candidate.length) {
    return trimVerdict(
      'FAIL',
      'TRIM_GOLDEN_PACKET_TIMELINE_MISMATCH',
      `candidate has ${candidate.length} video samples; baked trim window requires ${selected.length}`,
      measurements,
    );
  }
  const sourcePtsOriginUs = minimumTimestamp(selected.map((packet) => packet.ptsUs));
  const candidatePts = candidate.flatMap((packet) => packet.ptsUs === undefined ? [] : [packet.ptsUs]);
  if (candidatePts.length !== candidate.length) {
    return trimVerdict('FAIL', 'TRIM_GOLDEN_PACKET_TIMELINE_MISMATCH', 'candidate video PTS is incomplete', measurements);
  }
  const candidatePtsOriginUs = minimumTimestamp(candidatePts);
  const sourceDts = selected.flatMap((packet) => packet.dtsUs === undefined ? [] : [packet.dtsUs]);
  const candidateDts = candidate.flatMap((packet) => packet.dtsUs === undefined ? [] : [packet.dtsUs]);
  const compareDts = sourceDts.length === selected.length && candidateDts.length === candidate.length;
  const sourceDtsOriginUs = compareDts ? minimumTimestamp(sourceDts) : 0;
  const candidateDtsOriginUs = compareDts ? minimumTimestamp(candidateDts) : 0;
  let maxTimestampDeltaUs = 0;
  let maxDurationDeltaUs = 0;
  for (let index = 0; index < selected.length; index++) {
    const want = selected[index]!;
    const got = candidate[index]!;
    if (got.payloadByteLength !== want.size) {
      return trimVerdict(
        'FAIL',
        'TRIM_GOLDEN_PACKET_TIMELINE_MISMATCH',
        `video sample ${index} size ${got.payloadByteLength} vs baked ${want.size}`,
        measurements,
      );
    }
    if (got.keyframe !== want.keyframe) {
      return trimVerdict(
        'FAIL',
        'TRIM_GOLDEN_PACKET_TIMELINE_MISMATCH',
        `video sample ${index} random-access flag changed`,
        measurements,
      );
    }
    const ptsDeltaUs = Math.abs(
      ((got.ptsUs as number) - candidatePtsOriginUs) - (want.ptsUs - sourcePtsOriginUs),
    );
    maxTimestampDeltaUs = Math.max(maxTimestampDeltaUs, ptsDeltaUs);
    if (ptsDeltaUs > input.timestampToleranceUs) {
      return trimVerdict(
        'FAIL',
        'TRIM_GOLDEN_PACKET_TIMELINE_MISMATCH',
        `video sample ${index} relative PTS differs by ${ptsDeltaUs}us`,
        { ...measurements, maxTimestampDeltaUs },
      );
    }
    if (compareDts) {
      const dtsDeltaUs = Math.abs(
        ((got.dtsUs as number) - candidateDtsOriginUs) - ((want.dtsUs as number) - sourceDtsOriginUs),
      );
      maxTimestampDeltaUs = Math.max(maxTimestampDeltaUs, dtsDeltaUs);
      if (dtsDeltaUs > input.timestampToleranceUs) {
        return trimVerdict(
          'FAIL',
          'TRIM_GOLDEN_PACKET_TIMELINE_MISMATCH',
          `video sample ${index} relative DTS differs by ${dtsDeltaUs}us`,
          { ...measurements, maxTimestampDeltaUs },
        );
      }
    }
    const durationDeltaUs = Math.abs(packetDurationUs(candidate, index) - packetDurationUs(selected, index));
    maxDurationDeltaUs = Math.max(maxDurationDeltaUs, durationDeltaUs);
    if (durationDeltaUs > input.durationToleranceUs) {
      return trimVerdict(
        'FAIL',
        'TRIM_GOLDEN_PACKET_TIMELINE_MISMATCH',
        `video sample ${index} duration differs by ${durationDeltaUs}us`,
        { ...measurements, maxTimestampDeltaUs, maxDurationDeltaUs },
      );
    }
  }
  return trimVerdict(
    'PASS',
    'TRIM_GOLDEN_PACKET_TIMELINE_MATCH',
    `${selected.length} copied video samples match baked size, timing, duration, and random-access evidence`,
    { ...measurements, maxTimestampDeltaUs, maxDurationDeltaUs },
  );
}

function packetDurationUs(
  packets: readonly { readonly ptsUs?: number; readonly durationUs?: number }[],
  index: number,
): number {
  const packet = packets[index]!;
  if (packet.durationUs !== undefined && packet.durationUs > 0) return packet.durationUs;
  const ptsUs = packet.ptsUs;
  if (ptsUs === undefined) return 1;
  let following = Number.POSITIVE_INFINITY;
  let preceding = Number.NEGATIVE_INFINITY;
  for (const other of packets) {
    if (other.ptsUs === undefined) continue;
    if (other.ptsUs > ptsUs) following = Math.min(following, other.ptsUs);
    else if (other.ptsUs < ptsUs) preceding = Math.max(preceding, other.ptsUs);
  }
  if (Number.isFinite(following)) return following - ptsUs;
  if (Number.isFinite(preceding)) return ptsUs - preceding;
  return 1;
}

/**
 * Decide whether two decoder sampling passes observed the same displayed source frames after the
 * candidate timeline was rebased. A platform decoder may coalesce multiple nearby sample requests
 * onto one displayed frame, so evidence cardinality is compared between the two observations — never
 * against the number of requested timestamps.
 */
export function sampledTrimFramesAlign(input: {
  readonly reference: readonly SampledTrimFrame[];
  readonly candidate: readonly SampledTrimFrame[];
  readonly referenceOriginUs: number;
  readonly timestampToleranceUs: number;
  readonly similarities?: readonly number[];
  readonly minimumContentSimilarity?: number;
  readonly minimumMeanContentSimilarity?: number;
}): boolean {
  const { reference, candidate } = input;
  if (reference.length === 0 || reference.length !== candidate.length) return false;

  for (let index = 0; index < reference.length; index++) {
    const want = reference[index]!;
    const got = candidate[index]!;
    if (want.required === false) continue;
    if (Math.abs((want.ptsUs - input.referenceOriginUs) - got.ptsUs) > input.timestampToleranceUs) {
      return false;
    }
    if (normalizeDigest(want.contentDigest) === normalizeDigest(got.contentDigest)) continue;
    const similarity = input.similarities?.[index];
    if (
      input.minimumContentSimilarity === undefined ||
      similarity === undefined ||
      !Number.isFinite(similarity) ||
      similarity < input.minimumContentSimilarity
    ) {
      return false;
    }
  }

  if (input.minimumMeanContentSimilarity !== undefined) {
    const requiredCount = reference.filter((frame) => frame.required !== false).length;
    const allRequiredSimilarities = reference.flatMap((frame, index) => {
      if (frame.required === false) return [];
      const similarity = input.similarities?.[index];
      return similarity !== undefined && Number.isFinite(similarity) ? [similarity] : [];
    });
    if (allRequiredSimilarities.length !== requiredCount) return false;
    const mean = allRequiredSimilarities.reduce((sum, value) => sum + value, 0) /
      allRequiredSimilarities.length;
    if (mean < input.minimumMeanContentSimilarity) return false;
  }

  return true;
}

/** Stable identity for a bake. Provenance prevents one browser decode from masquerading as another. */
export function trimBoundaryEvidenceKey(input: {
  assetId: string;
  range: TrimRange;
  mode: TrimMode;
  representationClass: string;
  configurationDigest: string;
}): string {
  return [
    input.assetId,
    `${input.range.startUs}-${input.range.endUs}`,
    input.mode,
    input.representationClass,
    input.configurationDigest,
  ].map(encodeURIComponent).join('__');
}

/**
 * Compare range-specific neutral-decode evidence by presentation time, never by frame array index.
 * Extra non-required VFR observations are tolerated; every required reference moment remains 1:1.
 */
export function assessTrimBoundaryEvidence(request: TrimBoundaryAssessmentRequest): TrimDecision {
  const reference = request.reference;
  if (reference.state === 'MISSING') {
    return trimUnavailable('NA_ASSET', reference.reasonCode, reference.detail);
  }
  if (reference.state === 'BROWSER_UNAVAILABLE') {
    return trimUnavailable('NA_BROWSER', reference.reasonCode, reference.detail);
  }
  if (reference.state === 'INVALID_BITSTREAM') {
    return trimVerdict('FAIL', reference.reasonCode, reference.detail);
  }
  if (reference.state === 'ERROR') return trimError(reference.reasonCode, reference.detail);

  const artifact = reference.artifact;
  const keyMismatch = validateArtifactIdentity(request, artifact);
  if (keyMismatch) return trimError('TRIM_BOUNDARY_ARTIFACT_IDENTITY_MISMATCH', keyMismatch);
  if (!request.candidate.decodeComplete) {
    return trimVerdict('FAIL', 'TRIM_CANDIDATE_DECODE_INCOMPLETE', 'candidate boundary decode did not reach both requested boundary windows');
  }
  if (request.candidate.outputOriginUs !== 0) {
    return trimVerdict(
      'FAIL',
      'TRIM_OUTPUT_ORIGIN_NOT_ZERO',
      `candidate output origin is ${request.candidate.outputOriginUs}us; contract requires zero`,
      { outputOriginUs: request.candidate.outputOriginUs },
    );
  }

  const landed = request.candidate.landedSourceInterval;
  const expected = artifact.expectedLandedInterval;
  if (landed.startUs !== expected.startUs || landed.endUs !== expected.endUs) {
    return trimVerdict(
      'FAIL',
      'TRIM_WRONG_SOURCE_INTERVAL',
      `candidate landed [${landed.startUs},${landed.endUs})us; expected [${expected.startUs},${expected.endUs})us`,
      {
        landedStartUs: landed.startUs,
        landedEndUs: landed.endUs,
        expectedStartUs: expected.startUs,
        expectedEndUs: expected.endUs,
      },
    );
  }

  const required = artifact.frames.filter((frame) => frame.required !== false);
  if (required.length === 0) {
    return trimError('TRIM_BOUNDARY_ARTIFACT_EMPTY', 'range-specific evidence contains no required boundary observations');
  }
  const pairs = pairFramesByTimestamp(required, request.candidate.frames, {
    toleranceUs: artifact.timestampToleranceUs,
    unmatchedPolicy: 'require-all-reference',
  });
  const representationDifferences = [...new Set(request.candidate.representationDifferences ?? [])].sort();
  const failures: string[] = [];
  for (const missingIndex of pairs.unmatchedReferenceIndices) {
    const frame = required[missingIndex]!;
    failures.push(`missing reference moment ${frame.ptsUs}us (${shortDigest(frame.contentDigest)})`);
  }
  for (const pair of pairs.pairs) {
    const want = required[pair.referenceIndex]!;
    const got = request.candidate.frames[pair.candidateIndex]!;
    const digestMatches = normalizeDigest(want.contentDigest) === normalizeDigest(got.contentDigest);
    const similarity = got.contentSimilarity;
    const perceptualMatch = representationDifferences.length > 0 &&
      artifact.minimumContentSimilarity !== undefined &&
      typeof similarity === 'number' && Number.isFinite(similarity) &&
      similarity >= artifact.minimumContentSimilarity;
    if (!digestMatches && !perceptualMatch) {
      failures.push(
        `content at output ${got.ptsUs}us is ${shortDigest(got.contentDigest)}; expected ${shortDigest(want.contentDigest)}` +
        (similarity === undefined ? '' : ` (SSIM ${similarity.toFixed(4)})`),
      );
    }
    const gotEnd = got.ptsUs + got.durationUs;
    const wantEnd = want.ptsUs + want.durationUs;
    if (Math.abs(gotEnd - wantEnd) > artifact.timestampToleranceUs) {
      failures.push(`frame interval end ${gotEnd}us differs from expected ${wantEnd}us`);
    }
  }
  if (
    representationDifferences.length > 0 &&
    artifact.minimumMeanContentSimilarity !== undefined
  ) {
    const pairedSimilarities = pairs.pairs.map((pair) =>
      request.candidate.frames[pair.candidateIndex]?.contentSimilarity);
    if (pairedSimilarities.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
      failures.push('mean perceptual gate requires a similarity for every paired boundary observation');
    } else if (pairedSimilarities.length > 0) {
      const mean = (pairedSimilarities as number[]).reduce((sum, value) => sum + value, 0) /
        pairedSimilarities.length;
      if (mean < artifact.minimumMeanContentSimilarity) {
        failures.push(
          `mean boundary SSIM ${mean.toFixed(4)} is below ${artifact.minimumMeanContentSimilarity.toFixed(4)}`,
        );
      }
    }
  }
  const usedCandidates = new Set(pairs.pairs.map((pair) => pair.candidateIndex));
  for (const [candidateIndex, got] of request.candidate.frames.entries()) {
    if (usedCandidates.has(candidateIndex)) continue;
    const optionalMatch = artifact.frames.find((want) =>
      want.required === false &&
      Math.abs(want.ptsUs - got.ptsUs) <= artifact.timestampToleranceUs);
    if (!optionalMatch) {
      failures.push(`extra candidate boundary content at ${got.ptsUs}us (${shortDigest(got.contentDigest)})`);
    }
  }
  const first = request.candidate.frames.reduce<TrimBoundaryFrame | undefined>(
    (best, frame) => best === undefined || frame.ptsUs < best.ptsUs ? frame : best,
    undefined,
  );
  const atOrPastEnd = request.candidate.frames.find((frame) => frame.ptsUs >= landed.endUs - landed.startUs);
  if (!first || first.ptsUs !== 0) failures.push('first displayed candidate frame does not begin at output time zero');
  if (atOrPastEnd) failures.push(`candidate displays a frame beginning at/past the half-open end (${atOrPastEnd.ptsUs}us)`);

  const measurements = {
    referenceBoundaryFrames: required.length,
    candidateBoundaryFrames: request.candidate.frames.length,
    pairedBoundaryFrames: pairs.pairs.length,
    unmatchedReferenceFrames: pairs.unmatchedReferenceIndices.length,
    unmatchedCandidateFrames: pairs.unmatchedCandidateIndices.length,
    landedStartUs: landed.startUs,
    landedEndUs: landed.endUs,
  };
  if (failures.length > 0) {
    return trimVerdict('FAIL', 'TRIM_BOUNDARY_CONTENT_MISMATCH', failures.join('; '), measurements, {
      pairing: pairs,
    });
  }
  if (representationDifferences.length > 0) {
    return trimVerdict(
      'PASS',
      'TRIM_LEGAL_REPRESENTATION_DIFFERENCE',
      `boundary semantics match; legal representation difference: ${representationDifferences.join(', ')}`,
      measurements,
      { representationDifferences },
    );
  }
  return trimVerdict(
    'PASS',
    'TRIM_BOUNDARY_PRESENTATION_MATCH',
    `${pairs.pairs.length} required boundary moment(s) match by timestamp window`,
    measurements,
    { pairing: pairs },
  );
}

function validateArtifactIdentity(
  request: TrimBoundaryAssessmentRequest,
  artifact: TrimBoundaryEvidenceArtifact,
): string | undefined {
  if (artifact.schema !== TRIM_BOUNDARY_EVIDENCE_SCHEMA) return `unknown schema '${artifact.schema}'`;
  if (artifact.assetId !== request.assetId) return `asset '${artifact.assetId}' vs '${request.assetId}'`;
  if (artifact.mode !== request.mode) return `mode '${artifact.mode}' vs '${request.mode}'`;
  if (artifact.representationClass !== request.representationClass) {
    return `representation '${artifact.representationClass}' vs '${request.representationClass}'`;
  }
  if (artifact.range.startUs !== request.range.startUs || artifact.range.endUs !== request.range.endUs) {
    return `range [${artifact.range.startUs},${artifact.range.endUs}) vs [${request.range.startUs},${request.range.endUs})`;
  }
  const expectedKey = trimBoundaryEvidenceKey({
    assetId: artifact.assetId,
    range: artifact.range,
    mode: artifact.mode,
    representationClass: artifact.representationClass,
    configurationDigest: artifact.provenance.configurationDigest,
  });
  return artifact.key === expectedKey ? undefined : `key '${artifact.key}' vs '${expectedKey}'`;
}

function normalizeDigest(value: string): string {
  return value.trim().toLowerCase();
}

function shortDigest(value: string): string {
  return `${normalizeDigest(value).slice(0, 12)}…`;
}
