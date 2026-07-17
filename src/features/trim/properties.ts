import type { TrimRange } from './contracts.ts';
import { matchSemanticTracks, type SemanticTrimTrack } from './identity.ts';
import { trimUnavailable, trimVerdict, type TrimDecision } from './types.ts';

export interface AlphaTrimEvidence {
  readonly state: 'AVAILABLE' | 'MISSING_ASSET' | 'BROWSER_UNAVAILABLE';
  readonly reasonCode?: string;
  readonly alphaDigest?: string;
  readonly transparentPixels?: number;
  readonly translucentPixels?: number;
  readonly opaquePixels?: number;
}

export interface DisplayTrimEvidence {
  readonly state: 'AVAILABLE' | 'MISSING_ASSET' | 'BROWSER_UNAVAILABLE';
  readonly reasonCode?: string;
  readonly rotationDegrees?: number;
  readonly displayWidth?: number;
  readonly displayHeight?: number;
  readonly displayDigest?: string;
}

export interface OpenGopTrimEvidence {
  readonly sourcePtsUs: number;
  readonly contentDigest: string;
  readonly decodeSucceeded: boolean;
  readonly missingReferenceCount: number;
}

export interface ShortTrimFrameEvidence {
  readonly sourcePtsUs: number;
  readonly outputPtsUs: number;
  readonly durationUs: number;
  readonly contentDigest: string;
}

export interface FeatureLabelledTrimEvidence {
  readonly alpha?: { reference: AlphaTrimEvidence; candidate: AlphaTrimEvidence };
  readonly display?: { reference: DisplayTrimEvidence; candidate: DisplayTrimEvidence };
  readonly tracks?: {
    source: readonly SemanticTrimTrack[];
    candidate: readonly SemanticTrimTrack[];
    startAlignmentToleranceUs: number;
    endAlignmentToleranceUs: number;
  };
  readonly openGop?: { reference: OpenGopTrimEvidence; candidate: OpenGopTrimEvidence };
  readonly shortRange?: {
    range: TrimRange;
    expected: readonly ShortTrimFrameEvidence[];
    candidate: readonly ShortTrimFrameEvidence[];
    timestampToleranceUs: number;
  };
}

/** Independently assert every property named by a trim scenario; generic playback is not evidence. */
export function assessFeatureLabelledTrim(input: FeatureLabelledTrimEvidence): TrimDecision {
  const failures: string[] = [];
  const unavailable: TrimDecision[] = [];
  let checks = 0;
  if (input.alpha) {
    checks++;
    const routed = routeAlpha(input.alpha.reference, input.alpha.candidate, failures);
    if (routed) unavailable.push(routed);
  }
  if (input.display) {
    checks++;
    const routed = routeDisplay(input.display.reference, input.display.candidate, failures);
    if (routed) unavailable.push(routed);
  }
  if (input.tracks) {
    checks++;
    const matched = matchSemanticTracks(input.tracks.source, input.tracks.candidate);
    failures.push(...matched.failures);
    for (const match of matched.matches) {
      const sourceFirst = match.source.samples[0];
      const sourceLast = match.source.samples.at(-1);
      const candidateFirst = match.candidate.samples[0];
      const candidateLast = match.candidate.samples.at(-1);
      const label = `${match.source.type}:${match.source.identity}`;
      if (!sourceFirst || !sourceLast || !candidateFirst || !candidateLast) {
        failures.push(`${label} has an empty presentation`);
        continue;
      }
      if (Math.abs(sourceFirst.ptsUs - candidateFirst.ptsUs) > input.tracks.startAlignmentToleranceUs) {
        failures.push(`${label} start is not aligned (${candidateFirst.ptsUs}us vs ${sourceFirst.ptsUs}us)`);
      }
      const sourceEnd = sourceLast.ptsUs + sourceLast.durationUs;
      const candidateEnd = candidateLast.ptsUs + candidateLast.durationUs;
      if (Math.abs(sourceEnd - candidateEnd) > input.tracks.endAlignmentToleranceUs) {
        failures.push(`${label} end is not aligned (${candidateEnd}us vs ${sourceEnd}us)`);
      }
    }
  }
  if (input.openGop) {
    checks++;
    const want = input.openGop.reference;
    const got = input.openGop.candidate;
    if (!got.decodeSucceeded || got.missingReferenceCount > 0) {
      failures.push(`first open-GOP frame is not dependency-safe (${got.missingReferenceCount} missing reference(s))`);
    }
    if (got.sourcePtsUs !== want.sourcePtsUs || normalize(got.contentDigest) !== normalize(want.contentDigest)) {
      failures.push('first displayed open-GOP frame is not the requested source picture');
    }
  }
  if (input.shortRange) {
    checks++;
    assessShortRange(input.shortRange, failures);
  }
  if (checks === 0) {
    return trimVerdict('FAIL', 'TRIM_FEATURE_EVIDENCE_NOT_ATTACHED', 'feature-labelled scenario supplied no property evidence');
  }
  if (failures.length > 0) {
    return trimVerdict('FAIL', 'TRIM_FEATURE_PROPERTY_MISMATCH', failures.join('; '), { propertyChecks: checks });
  }
  if (unavailable.length > 0) return unavailable[0]!;
  return trimVerdict('PASS', 'TRIM_FEATURE_PROPERTIES_PRESERVED', `${checks} named trim propert${checks === 1 ? 'y' : 'ies'} preserved`, {
    propertyChecks: checks,
  });
}

function routeAlpha(
  reference: AlphaTrimEvidence,
  candidate: AlphaTrimEvidence,
  failures: string[],
): TrimDecision | undefined {
  if (reference.state === 'MISSING_ASSET') {
    return trimUnavailable('NA_ASSET', reference.reasonCode ?? 'TRIM_ALPHA_REFERENCE_MISSING', 'source alpha evidence is unavailable');
  }
  if (reference.state === 'BROWSER_UNAVAILABLE' || candidate.state === 'BROWSER_UNAVAILABLE') {
    return trimUnavailable('NA_BROWSER', reference.reasonCode ?? candidate.reasonCode ?? 'TRIM_ALPHA_DECODER_UNAVAILABLE', 'neutral alpha decode is unavailable');
  }
  if (candidate.state !== 'AVAILABLE') {
    failures.push('candidate alpha evidence is absent');
    return undefined;
  }
  if (normalize(reference.alphaDigest) !== normalize(candidate.alphaDigest) ||
      reference.transparentPixels !== candidate.transparentPixels ||
      reference.translucentPixels !== candidate.translucentPixels) {
    failures.push('decoded alpha plane differs from the source interval');
  }
  return undefined;
}

function routeDisplay(
  reference: DisplayTrimEvidence,
  candidate: DisplayTrimEvidence,
  failures: string[],
): TrimDecision | undefined {
  if (reference.state === 'MISSING_ASSET') {
    return trimUnavailable('NA_ASSET', reference.reasonCode ?? 'TRIM_DISPLAY_REFERENCE_MISSING', 'source display-transform evidence is unavailable');
  }
  if (reference.state === 'BROWSER_UNAVAILABLE' || candidate.state === 'BROWSER_UNAVAILABLE') {
    return trimUnavailable('NA_BROWSER', reference.reasonCode ?? candidate.reasonCode ?? 'TRIM_DISPLAY_DECODER_UNAVAILABLE', 'neutral display-space decode is unavailable');
  }
  if (candidate.state !== 'AVAILABLE') {
    failures.push('candidate display evidence is absent');
    return undefined;
  }
  if (reference.rotationDegrees !== candidate.rotationDegrees ||
      reference.displayWidth !== candidate.displayWidth ||
      reference.displayHeight !== candidate.displayHeight ||
      normalize(reference.displayDigest) !== normalize(candidate.displayDigest)) {
    failures.push('display transform or display-space pixels differ from the source interval');
  }
  return undefined;
}

function assessShortRange(
  input: NonNullable<FeatureLabelledTrimEvidence['shortRange']>,
  failures: string[],
): void {
  if (input.candidate.length === 0) {
    failures.push('very-short/subframe trim produced no displayed frame');
    return;
  }
  if (input.candidate.some((frame) => frame.sourcePtsUs >= input.range.endUs)) {
    failures.push('very-short/subframe trim displays a frame beginning at/past the half-open end');
  }
  const want = input.expected.filter((frame) =>
    frame.sourcePtsUs < input.range.endUs && frame.sourcePtsUs + frame.durationUs > input.range.startUs);
  for (const expected of want) {
    const match = input.candidate.find((candidate) =>
      Math.abs(candidate.outputPtsUs - expected.outputPtsUs) <= input.timestampToleranceUs &&
      normalize(candidate.contentDigest) === normalize(expected.contentDigest));
    if (!match) failures.push(`missing intersecting short-range frame ${expected.sourcePtsUs}us`);
  }
  if (input.candidate.length !== want.length) {
    failures.push(`short-range displayed frame count ${input.candidate.length} vs expected ${want.length}`);
  }
}

function normalize(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}
