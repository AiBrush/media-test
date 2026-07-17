import type { FrameDigest, FrameSink } from '../../core/engine.ts';
import { sha256Hex } from '../../core/seeded-rng.ts';
import { matchTimestamps } from './timing.ts';
import { decodeSeekVerdict, isRecord, type DecodeSeekVerdict } from './types.ts';

export const DISPLAY_EVIDENCE_SCHEMA = 'media-test/display-space-evidence@1' as const;

export interface DisplayTransformContract {
  readonly schema: typeof DISPLAY_EVIDENCE_SCHEMA;
  readonly codedWidth: number;
  readonly codedHeight: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
  /** Clockwise rotation applied before display-space flips. */
  readonly rotationDegrees: 0 | 90 | 180 | 270;
  readonly flipX: boolean;
  readonly flipY: boolean;
}

export interface RgbaPlane {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array | Uint8ClampedArray;
}

export interface DisplayFrameEvidence {
  readonly ptsUs: number;
  readonly width: number;
  readonly height: number;
  readonly rgbaSha256: string;
}

export interface DisplayEvidenceArtifact {
  readonly schema: typeof DISPLAY_EVIDENCE_SCHEMA;
  readonly assetId: string;
  readonly transform: DisplayTransformContract;
  readonly frames: readonly DisplayFrameEvidence[];
}

export function defineDisplayTransform(
  input: Omit<DisplayTransformContract, 'schema'>,
): DisplayTransformContract {
  for (const [name, value] of Object.entries({
    codedWidth: input.codedWidth,
    codedHeight: input.codedHeight,
    displayWidth: input.displayWidth,
    displayHeight: input.displayHeight,
  })) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive integer`);
  }
  if (![0, 90, 180, 270].includes(input.rotationDegrees)) throw new TypeError('display rotation is invalid');
  const rotatedWidth = input.rotationDegrees === 90 || input.rotationDegrees === 270
    ? input.codedHeight
    : input.codedWidth;
  const rotatedHeight = input.rotationDegrees === 90 || input.rotationDegrees === 270
    ? input.codedWidth
    : input.codedHeight;
  if (input.displayWidth !== rotatedWidth || input.displayHeight !== rotatedHeight) {
    throw new TypeError(
      `display dimensions ${input.displayWidth}x${input.displayHeight} do not follow coded ` +
      `${input.codedWidth}x${input.codedHeight} rotation ${input.rotationDegrees}`,
    );
  }
  return Object.freeze({ schema: DISPLAY_EVIDENCE_SCHEMA, ...input });
}

export function displayTransformFromOptions(options: unknown): DisplayTransformContract | undefined {
  if (!isRecord(options) || !isRecord(options.displayEvidence)) return undefined;
  const raw = options.displayEvidence;
  if (raw.schema !== DISPLAY_EVIDENCE_SCHEMA) return undefined;
  try {
    return defineDisplayTransform({
      codedWidth: raw.codedWidth as number,
      codedHeight: raw.codedHeight as number,
      displayWidth: raw.displayWidth as number,
      displayHeight: raw.displayHeight as number,
      rotationDegrees: raw.rotationDegrees as DisplayTransformContract['rotationDegrees'],
      flipX: raw.flipX === true,
      flipY: raw.flipY === true,
    });
  } catch {
    return undefined;
  }
}

/** Apply rotation and flip to actual RGBA bytes; changing metadata/dimensions alone cannot satisfy it. */
export function transformRgbaToDisplaySpace(
  source: RgbaPlane,
  contract: DisplayTransformContract,
): RgbaPlane {
  if (source.width !== contract.codedWidth || source.height !== contract.codedHeight) {
    throw new TypeError(
      `source pixels ${source.width}x${source.height} do not match coded ` +
      `${contract.codedWidth}x${contract.codedHeight}`,
    );
  }
  if (source.data.byteLength !== source.width * source.height * 4) {
    throw new TypeError('source RGBA plane is not tight');
  }
  const output = new Uint8Array(contract.displayWidth * contract.displayHeight * 4);
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      let dx: number;
      let dy: number;
      switch (contract.rotationDegrees) {
        case 90:
          dx = source.height - 1 - y;
          dy = x;
          break;
        case 180:
          dx = source.width - 1 - x;
          dy = source.height - 1 - y;
          break;
        case 270:
          dx = y;
          dy = source.width - 1 - x;
          break;
        default:
          dx = x;
          dy = y;
      }
      if (contract.flipX) dx = contract.displayWidth - 1 - dx;
      if (contract.flipY) dy = contract.displayHeight - 1 - dy;
      const sourceOffset = (y * source.width + x) * 4;
      const outputOffset = (dy * contract.displayWidth + dx) * 4;
      output.set(source.data.subarray(sourceOffset, sourceOffset + 4), outputOffset);
    }
  }
  return Object.freeze({
    width: contract.displayWidth,
    height: contract.displayHeight,
    data: output,
  });
}

export function displayFrameEvidence(ptsUs: number, pixels: RgbaPlane): DisplayFrameEvidence {
  if (!Number.isFinite(ptsUs)) throw new TypeError('display evidence PTS must be finite');
  if (pixels.data.byteLength !== pixels.width * pixels.height * 4) throw new TypeError('display RGBA is not tight');
  return Object.freeze({
    ptsUs,
    width: pixels.width,
    height: pixels.height,
    rgbaSha256: sha256Hex(new Uint8Array(pixels.data.buffer, pixels.data.byteOffset, pixels.data.byteLength)),
  });
}

export async function collectDisplayEvidence(sink: FrameSink): Promise<readonly DisplayFrameEvidence[]> {
  if (!sink.getPixels) throw new TypeError('frame sink has no pixel reader');
  const evidence: DisplayFrameEvidence[] = [];
  for (let index = 0; index < sink.frames.length; index++) {
    const frame = sink.frames[index]!;
    const pixels = await sink.getPixels(index);
    evidence.push(displayFrameEvidence(frame.ptsUs, {
      width: pixels.width,
      height: pixels.height,
      data: pixels.data,
    }));
  }
  return Object.freeze(evidence);
}

export function assessDisplaySpaceEvidence(
  candidate: readonly DisplayFrameEvidence[],
  reference: readonly DisplayFrameEvidence[],
  contract: DisplayTransformContract,
  timestampToleranceUs = 1_000,
): DecodeSeekVerdict {
  const matched = matchTimestamps(candidate, reference, timestampToleranceUs);
  const measurements = {
    candidateFrames: candidate.length,
    referenceFrames: reference.length,
    matchedFrames: matched.matches.length,
    unmatchedCandidateFrames: matched.unmatchedCandidate.length,
    unmatchedReferenceFrames: matched.unmatchedReference.length,
  };
  if (reference.length === 0) {
    return decodeSeekVerdict('FAIL', 'DISPLAY_REFERENCE_EVIDENCE_EMPTY', 'display-space golden has no frames', measurements);
  }
  if (matched.unmatchedReference.length || matched.unmatchedCandidate.length) {
    return decodeSeekVerdict(
      'FAIL',
      'DISPLAY_TIMESTAMP_COVERAGE_MISMATCH',
      `display timeline has ${matched.unmatchedReference.length} missing and ` +
        `${matched.unmatchedCandidate.length} surplus frame(s)`,
      measurements,
    );
  }
  for (const { candidate: got, reference: want } of matched.matches) {
    if (got.width !== contract.displayWidth || got.height !== contract.displayHeight) {
      return decodeSeekVerdict(
        'FAIL',
        'DISPLAY_DIMENSIONS_NOT_PRESENTED',
        `frame ${got.ptsUs}µs is ${got.width}x${got.height}; expected displayed ` +
          `${contract.displayWidth}x${contract.displayHeight}`,
        measurements,
      );
    }
    if (want.width !== contract.displayWidth || want.height !== contract.displayHeight) {
      return decodeSeekVerdict(
        'FAIL',
        'DISPLAY_GOLDEN_DIMENSIONS_INVALID',
        'display-space golden dimensions disagree with its transform contract',
        measurements,
      );
    }
    if (normalizeDigest(got.rgbaSha256) !== normalizeDigest(want.rgbaSha256)) {
      return decodeSeekVerdict(
        'FAIL',
        'DISPLAY_PIXEL_TRANSFORM_MISMATCH',
        `displayed RGBA differs at ${want.ptsUs}µs; dimension-only metadata handling cannot pass`,
        measurements,
      );
    }
  }
  return decodeSeekVerdict(
    'PASS',
    'DISPLAY_SPACE_EVIDENCE_MATCH',
    `${matched.matches.length} timestamp-keyed frame(s) match displayed rotation/flip pixels`,
    measurements,
  );
}

/** Convert an existing digest list into evidence only when it already represents display-space RGBA. */
export function displayEvidenceFromFrameDigests(frames: readonly FrameDigest[]): DisplayFrameEvidence[] {
  return frames.map((frame) => ({
    ptsUs: frame.ptsUs,
    width: frame.width ?? 0,
    height: frame.height ?? 0,
    rgbaSha256: frame.sha256,
  }));
}

function normalizeDigest(value: string): string {
  return value.trim().toLowerCase();
}
