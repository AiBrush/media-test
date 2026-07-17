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
  const failures: string[] = [];
  for (const missingIndex of pairs.unmatchedReferenceIndices) {
    const frame = required[missingIndex]!;
    failures.push(`missing reference moment ${frame.ptsUs}us (${shortDigest(frame.contentDigest)})`);
  }
  for (const pair of pairs.pairs) {
    const want = required[pair.referenceIndex]!;
    const got = request.candidate.frames[pair.candidateIndex]!;
    if (normalizeDigest(want.contentDigest) !== normalizeDigest(got.contentDigest)) {
      failures.push(
        `content at output ${got.ptsUs}us is ${shortDigest(got.contentDigest)}; expected ${shortDigest(want.contentDigest)}`,
      );
    }
    const gotEnd = got.ptsUs + got.durationUs;
    const wantEnd = want.ptsUs + want.durationUs;
    if (Math.abs(gotEnd - wantEnd) > artifact.timestampToleranceUs) {
      failures.push(`frame interval end ${gotEnd}us differs from expected ${wantEnd}us`);
    }
  }
  const usedCandidates = new Set(pairs.pairs.map((pair) => pair.candidateIndex));
  for (const [candidateIndex, got] of request.candidate.frames.entries()) {
    if (usedCandidates.has(candidateIndex)) continue;
    const optionalMatch = artifact.frames.find((want) =>
      want.required === false &&
      Math.abs(want.ptsUs - got.ptsUs) <= artifact.timestampToleranceUs &&
      normalizeDigest(want.contentDigest) === normalizeDigest(got.contentDigest));
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
  const representationDifferences = [...new Set(request.candidate.representationDifferences ?? [])].sort();
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
