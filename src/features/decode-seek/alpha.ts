import type { FrameSink } from '../../core/engine.ts';
import { sha256Hex } from '../../core/seeded-rng.ts';
import { matchTimestamps } from './timing.ts';
import { decodeSeekVerdict, isRecord, type DecodeSeekVerdict } from './types.ts';

export const ALPHA_EVIDENCE_SCHEMA = 'media-test/alpha-plane-evidence@1' as const;
export const ALPHA_DIGEST_ALGORITHM = 'sha256-tight-alpha-u8' as const;

export interface AlphaFrameEvidence {
  readonly ptsUs: number;
  readonly width: number;
  readonly height: number;
  readonly alphaSha256: string;
  readonly nonOpaquePixels: number;
  readonly minAlpha: number;
  readonly maxAlpha: number;
}

export interface AlphaEvidenceArtifact {
  readonly schema: typeof ALPHA_EVIDENCE_SCHEMA;
  readonly assetId: string;
  readonly sourceSha256: string;
  readonly algorithm: typeof ALPHA_DIGEST_ALGORITHM;
  readonly frames: readonly AlphaFrameEvidence[];
}

export function alphaFrameEvidence(
  ptsUs: number,
  width: number,
  height: number,
  rgba: Uint8Array | Uint8ClampedArray,
): AlphaFrameEvidence {
  if (!Number.isFinite(ptsUs)) throw new TypeError('alpha evidence PTS must be finite');
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
    throw new TypeError('alpha evidence dimensions must be positive integers');
  }
  if (rgba.byteLength !== width * height * 4) throw new TypeError('alpha evidence RGBA is not tight');
  const alpha = new Uint8Array(width * height);
  let nonOpaquePixels = 0;
  let minAlpha = 255;
  let maxAlpha = 0;
  for (let pixel = 0, source = 3; pixel < alpha.length; pixel++, source += 4) {
    const value = rgba[source]!;
    alpha[pixel] = value;
    if (value !== 255) nonOpaquePixels++;
    minAlpha = Math.min(minAlpha, value);
    maxAlpha = Math.max(maxAlpha, value);
  }
  return Object.freeze({
    ptsUs,
    width,
    height,
    alphaSha256: sha256Hex(alpha),
    nonOpaquePixels,
    minAlpha,
    maxAlpha,
  });
}

export async function collectAlphaEvidence(sink: FrameSink): Promise<readonly AlphaFrameEvidence[]> {
  if (!sink.getPixels) throw new TypeError('frame sink has no pixel reader for alpha evidence');
  const result: AlphaFrameEvidence[] = [];
  for (let index = 0; index < sink.frames.length; index++) {
    const frame = sink.frames[index]!;
    const pixels = await sink.getPixels(index);
    result.push(alphaFrameEvidence(frame.ptsUs, pixels.width, pixels.height, pixels.data));
  }
  return Object.freeze(result);
}

export function parseAlphaEvidenceArtifact(value: unknown): AlphaEvidenceArtifact | undefined {
  if (!isRecord(value) ||
      value.schema !== ALPHA_EVIDENCE_SCHEMA ||
      value.algorithm !== ALPHA_DIGEST_ALGORITHM ||
      typeof value.assetId !== 'string' || !value.assetId ||
      typeof value.sourceSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(value.sourceSha256) ||
      !Array.isArray(value.frames)) return undefined;
  const frames: AlphaFrameEvidence[] = [];
  for (const entry of value.frames) {
    if (!isRecord(entry) ||
        typeof entry.ptsUs !== 'number' || !Number.isFinite(entry.ptsUs) ||
        !Number.isSafeInteger(entry.width) || Number(entry.width) <= 0 ||
        !Number.isSafeInteger(entry.height) || Number(entry.height) <= 0 ||
        typeof entry.alphaSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.alphaSha256) ||
        !Number.isSafeInteger(entry.nonOpaquePixels) || Number(entry.nonOpaquePixels) < 0 ||
        !Number.isSafeInteger(entry.minAlpha) || Number(entry.minAlpha) < 0 || Number(entry.minAlpha) > 255 ||
        !Number.isSafeInteger(entry.maxAlpha) || Number(entry.maxAlpha) < 0 || Number(entry.maxAlpha) > 255) {
      return undefined;
    }
    frames.push(Object.freeze({
      ptsUs: entry.ptsUs,
      width: Number(entry.width),
      height: Number(entry.height),
      alphaSha256: entry.alphaSha256,
      nonOpaquePixels: Number(entry.nonOpaquePixels),
      minAlpha: Number(entry.minAlpha),
      maxAlpha: Number(entry.maxAlpha),
    }));
  }
  if (frames.length === 0) return undefined;
  return Object.freeze({
    schema: ALPHA_EVIDENCE_SCHEMA,
    assetId: value.assetId,
    sourceSha256: value.sourceSha256,
    algorithm: ALPHA_DIGEST_ALGORITHM,
    frames: Object.freeze(frames),
  });
}

export function assessAlphaEvidence(
  candidate: readonly AlphaFrameEvidence[],
  reference: readonly AlphaFrameEvidence[],
  timestampToleranceUs = 1_000,
): DecodeSeekVerdict {
  const matched = matchTimestamps(candidate, reference, timestampToleranceUs);
  const measurements = {
    candidateFrames: candidate.length,
    referenceFrames: reference.length,
    matchedFrames: matched.matches.length,
    unmatchedCandidateFrames: matched.unmatchedCandidate.length,
    unmatchedReferenceFrames: matched.unmatchedReference.length,
    nonOpaqueCandidateFrames: candidate.filter((entry) => entry.nonOpaquePixels > 0).length,
  };
  if (reference.length === 0) {
    return decodeSeekVerdict('FAIL', 'ALPHA_REFERENCE_EVIDENCE_EMPTY', 'alpha golden has no frames', measurements);
  }
  if (matched.unmatchedCandidate.length || matched.unmatchedReference.length) {
    return decodeSeekVerdict(
      'FAIL',
      'ALPHA_TIMESTAMP_COVERAGE_MISMATCH',
      `alpha timeline has ${matched.unmatchedReference.length} missing and ` +
        `${matched.unmatchedCandidate.length} surplus frame(s)`,
      measurements,
    );
  }
  for (const { candidate: got, reference: want } of matched.matches) {
    if (got.width !== want.width || got.height !== want.height) {
      return decodeSeekVerdict(
        'FAIL',
        'ALPHA_DIMENSIONS_MISMATCH',
        `alpha dimensions differ at ${want.ptsUs}µs`,
        measurements,
      );
    }
    if (got.nonOpaquePixels === 0) {
      return decodeSeekVerdict(
        'FAIL',
        'ALPHA_OUTPUT_OPAQUE',
        `candidate alpha is fully opaque at ${want.ptsUs}µs`,
        measurements,
      );
    }
    if (normalizeDigest(got.alphaSha256) !== normalizeDigest(want.alphaSha256)) {
      return decodeSeekVerdict(
        'FAIL',
        'ALPHA_PLANE_DIGEST_MISMATCH',
        `alpha values differ at timestamp ${want.ptsUs}µs`,
        measurements,
      );
    }
  }
  return decodeSeekVerdict(
    'PASS',
    'ALPHA_TIMESTAMP_EVIDENCE_MATCH',
    `${matched.matches.length} timestamp-keyed alpha plane(s) match exactly`,
    measurements,
  );
}

function normalizeDigest(value: string): string {
  return value.trim().toLowerCase();
}
