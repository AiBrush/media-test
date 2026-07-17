import type { Scenario } from '../../core/scenario.ts';
import {
  assessDisplaySpaceEvidence,
  DISPLAY_EVIDENCE_SCHEMA,
  type DisplayFrameEvidence,
  type DisplayTransformContract,
} from '../decode-seek/display.ts';
import { muxError, muxUnavailable, muxVerdict, type MuxDecision } from './types.ts';

export const MUX_ROTATION_POLICY_SCHEMA = 'media-test/mux-rotation-policy@1' as const;
export const MUX_ORIENTATION_EVIDENCE_SCHEMA = 'media-test/mux-orientation-evidence@1' as const;
export const MUX_ROTATION_SCENARIO_IDS = Object.freeze([
  'mux/edge_rotation_decode_mux_mov',
  'mux/edge_rotation_decode_mux_mkv',
] as const);

const ROTATION_SCENARIO_IDS = new Set<string>(MUX_ROTATION_SCENARIO_IDS);

export type MuxRotationPolicyMode =
  | 'preserve-coded-raster-and-orientation'
  | 'bake-orientation-into-pixels'
  | 'preserve-or-bake';

export interface MuxRotationPolicy {
  readonly schema: typeof MUX_ROTATION_POLICY_SCHEMA;
  readonly mode: MuxRotationPolicyMode;
  /** Rotation acceptance rows require an independently verified non-identity source transform. */
  readonly requireNonZeroSourceRotation: true;
}

export interface MuxOrientationEvidence {
  readonly schema: typeof MUX_ORIENTATION_EVIDENCE_SCHEMA;
  readonly container: 'mp4' | 'mov' | 'mkv' | 'webm';
  readonly codedWidth: number;
  readonly codedHeight: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
  readonly rotationDegrees: 0 | 90 | 180 | 270;
  readonly representation: 'isobmff-track-matrix' | 'matroska-projection-roll' | 'none';
}

export type MuxOrientationReadResult =
  | Readonly<{ state: 'OK'; value: MuxOrientationEvidence }>
  | Readonly<{
      state: 'UNSUPPORTED_FORMAT' | 'UNSUPPORTED_STRUCTURE' | 'MALFORMED' | 'INCOMPLETE';
      reasonCode: string;
      detail: string;
    }>;

export function defineMuxRotationPolicy(mode: MuxRotationPolicyMode = 'preserve-or-bake'): MuxRotationPolicy {
  return Object.freeze({
    schema: MUX_ROTATION_POLICY_SCHEMA,
    mode,
    requireNonZeroSourceRotation: true as const,
  });
}

export function muxRotationPolicyFromScenario(
  scenario: Pick<Scenario, 'id' | 'op' | 'requires'>,
): MuxRotationPolicy | undefined {
  return scenario.op === 'mux' && ROTATION_SCENARIO_IDS.has(scenario.id) &&
      scenario.requires.features?.includes('rotate')
    ? defineMuxRotationPolicy('preserve-or-bake')
    : undefined;
}

/** Inspect orientation from the authored container, independently of browser presentation behavior. */
export function readMuxOrientation(bytes: Uint8Array, containerHint: string): MuxOrientationReadResult {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 8) {
    return problem('INCOMPLETE', 'MUX_ORIENTATION_INPUT_INCOMPLETE', 'orientation input is empty/truncated');
  }
  const container = canonicalContainer(containerHint);
  try {
    if (container === 'mp4' || container === 'mov') return readIsoBmffOrientation(bytes, container);
    if (container === 'mkv' || container === 'webm') return readMatroskaOrientation(bytes, container);
    return problem(
      'UNSUPPORTED_FORMAT',
      'MUX_ORIENTATION_FORMAT_UNSUPPORTED',
      `orientation reader does not support '${containerHint}'`,
    );
  } catch (error) {
    const issue = error instanceof OrientationReadError
      ? error
      : new OrientationReadError('MALFORMED', 'MUX_ORIENTATION_READER_FAILURE', errorMessage(error));
    return problem(issue.state, issue.reasonCode, issue.message);
  }
}

/**
 * A valid mux may preserve coded pixels plus metadata or bake the transform into coded pixels. Both
 * paths must first satisfy structure and then match presentation-normalized RGBA at every timestamp.
 */
export function assessMuxRotation(
  source: MuxOrientationReadResult,
  candidate: MuxOrientationReadResult,
  sourcePresentationFrames: readonly DisplayFrameEvidence[],
  candidatePresentationFrames: readonly DisplayFrameEvidence[],
  policy: MuxRotationPolicy = defineMuxRotationPolicy(),
  timestampToleranceUs = 1_000,
): MuxDecision {
  if (policy.schema !== MUX_ROTATION_POLICY_SCHEMA) {
    return muxError('MUX_ROTATION_POLICY_SCHEMA_INVALID', 'mux rotation policy schema is invalid');
  }
  if (source.state !== 'OK') {
    return muxUnavailable(
      'NA_ASSET',
      'MUX_ROTATION_REFERENCE_EVIDENCE_MISSING',
      `source orientation evidence is not decisive [${source.reasonCode}]: ${source.detail}`,
    );
  }
  const reference = source.value;
  if (policy.requireNonZeroSourceRotation &&
      (reference.rotationDegrees === 0 || reference.representation === 'none')) {
    return muxUnavailable(
      'NA_ASSET',
      'MUX_ROTATION_REFERENCE_UNVERIFIED',
      `rotation acceptance requires non-identity structural source evidence; observed ` +
        `${reference.rotationDegrees}° via ${reference.representation}`,
    );
  }
  if (candidate.state !== 'OK') {
    return muxVerdict(
      'FAIL',
      'MUX_ROTATION_CANDIDATE_STRUCTURE_INVALID',
      `candidate orientation cannot be inspected [${candidate.reasonCode}]: ${candidate.detail}`,
    );
  }
  const got = candidate.value;
  const sameDisplay = got.displayWidth === reference.displayWidth && got.displayHeight === reference.displayHeight;
  const preserves =
    got.codedWidth === reference.codedWidth &&
    got.codedHeight === reference.codedHeight &&
    got.rotationDegrees === reference.rotationDegrees &&
    got.representation !== 'none' &&
    sameDisplay;
  const baked =
    got.rotationDegrees === 0 &&
    got.codedWidth === reference.displayWidth &&
    got.codedHeight === reference.displayHeight &&
    got.displayWidth === reference.displayWidth &&
    got.displayHeight === reference.displayHeight;

  if (policy.mode === 'preserve-coded-raster-and-orientation' && !preserves) {
    return rotationStructureFailure(reference, got, 'policy requires coded-raster + orientation preservation');
  }
  if (policy.mode === 'bake-orientation-into-pixels' && !baked) {
    return rotationStructureFailure(reference, got, 'policy requires a baked upright coded raster');
  }
  if (policy.mode === 'preserve-or-bake' && !preserves && !baked) {
    return rotationStructureFailure(
      reference,
      got,
      'candidate neither preserves the transform nor bakes it once into an upright raster',
    );
  }

  const displayContract: DisplayTransformContract = Object.freeze({
    schema: DISPLAY_EVIDENCE_SCHEMA,
    codedWidth: reference.codedWidth,
    codedHeight: reference.codedHeight,
    displayWidth: reference.displayWidth,
    displayHeight: reference.displayHeight,
    rotationDegrees: reference.rotationDegrees,
    flipX: false,
    flipY: false,
  });
  const display = assessDisplaySpaceEvidence(
    candidatePresentationFrames,
    sourcePresentationFrames,
    displayContract,
    timestampToleranceUs,
  );
  if (display.verdict === 'FAIL') {
    return muxVerdict(
      'FAIL',
      `MUX_ROTATION_${display.reasonCode}`,
      display.detail,
      display.measurements,
    );
  }

  const measurements = {
    ...(display.measurements ?? {}),
    sourceRotationDegrees: reference.rotationDegrees,
    candidateRotationDegrees: got.rotationDegrees,
    bakedPixels: baked ? 1 : 0,
  };
  if (baked) {
    return muxVerdict(
      'PASS',
      'MUX_ROTATION_BAKED_PRESENTATION_EQUIVALENT',
      'orientation was intentionally baked into pixels exactly once; normalized presentation matches',
      measurements,
    );
  }
  if (got.representation !== reference.representation) {
    return muxVerdict(
      'PASS',
      'MUX_ROTATION_METADATA_REPRESENTATION_CHANGED',
      `${reference.representation} was translated to ${got.representation}; normalized presentation matches`,
      measurements,
    );
  }
  return muxVerdict(
    'PASS',
    'MUX_ROTATION_STRUCTURE_AND_PRESENTATION_MATCH',
    'coded raster, structural orientation, and presentation-normalized frames all match',
    measurements,
  );
}

function rotationStructureFailure(
  source: MuxOrientationEvidence,
  candidate: MuxOrientationEvidence,
  prefix: string,
): MuxDecision {
  return muxVerdict(
    'FAIL',
    'MUX_ROTATION_STRUCTURE_MISMATCH',
    `${prefix}; source coded/display/rotation=${source.codedWidth}x${source.codedHeight}/` +
      `${source.displayWidth}x${source.displayHeight}/${source.rotationDegrees}°, candidate=` +
      `${candidate.codedWidth}x${candidate.codedHeight}/${candidate.displayWidth}x` +
      `${candidate.displayHeight}/${candidate.rotationDegrees}°`,
  );
}

function readIsoBmffOrientation(
  bytes: Uint8Array,
  container: 'mp4' | 'mov',
): MuxOrientationReadResult {
  const top = isoBoxes(bytes, 0, bytes.byteLength);
  const moov = top.find((box) => box.type === 'moov');
  if (!moov) return problem('MALFORMED', 'MUX_ORIENTATION_MOOV_MISSING', 'ISO BMFF has no moov box');
  const tracks = isoBoxes(bytes, moov.bodyStart, moov.end).filter((box) => box.type === 'trak');
  for (const trak of tracks) {
    const direct = isoBoxes(bytes, trak.bodyStart, trak.end);
    const tkhd = direct.find((box) => box.type === 'tkhd');
    const mdia = direct.find((box) => box.type === 'mdia');
    if (!tkhd || !mdia) continue;
    const mdiaChildren = isoBoxes(bytes, mdia.bodyStart, mdia.end);
    const hdlr = mdiaChildren.find((box) => box.type === 'hdlr');
    if (!hdlr || hdlr.bodyStart + 12 > hdlr.end || fourcc(bytes, hdlr.bodyStart + 8) !== 'vide') continue;
    const minf = mdiaChildren.find((box) => box.type === 'minf');
    const stbl = minf && isoBoxes(bytes, minf.bodyStart, minf.end).find((box) => box.type === 'stbl');
    const stsd = stbl && isoBoxes(bytes, stbl.bodyStart, stbl.end).find((box) => box.type === 'stsd');
    if (!stsd) {
      return problem('UNSUPPORTED_STRUCTURE', 'MUX_ORIENTATION_STSD_MISSING', 'video track has no sample description');
    }
    const dimensions = visualSampleEntryDimensions(bytes, stsd);
    const rotation = isoTrackRotation(bytes, tkhd);
    if (!dimensions || rotation === null) {
      return problem(
        'UNSUPPORTED_STRUCTURE',
        'MUX_ORIENTATION_TRACK_METADATA_UNREADABLE',
        'video dimensions or track matrix are not readable',
      );
    }
    return okOrientation(container, dimensions.width, dimensions.height, rotation, 'isobmff-track-matrix');
  }
  return problem('UNSUPPORTED_STRUCTURE', 'MUX_ORIENTATION_VIDEO_TRACK_MISSING', 'ISO BMFF has no readable video track');
}

function readMatroskaOrientation(
  bytes: Uint8Array,
  container: 'mkv' | 'webm',
): MuxOrientationReadResult {
  const top = ebmlChildren(bytes, 0, bytes.byteLength);
  const segment = top.find((element) => element.id === 0x18538067);
  if (!segment) return problem('MALFORMED', 'MUX_ORIENTATION_SEGMENT_MISSING', 'Matroska has no Segment');
  const tracks = ebmlChildren(bytes, segment.bodyStart, segment.end).find((element) => element.id === 0x1654ae6b);
  if (!tracks) return problem('UNSUPPORTED_STRUCTURE', 'MUX_ORIENTATION_TRACKS_MISSING', 'Matroska has no Tracks');
  for (const entry of ebmlChildren(bytes, tracks.bodyStart, tracks.end).filter((element) => element.id === 0xae)) {
    const fields = ebmlChildren(bytes, entry.bodyStart, entry.end);
    const type = fields.find((element) => element.id === 0x83);
    if (!type || ebmlUint(bytes, type) !== 1) continue;
    const video = fields.find((element) => element.id === 0xe0);
    if (!video) continue;
    const videoFields = ebmlChildren(bytes, video.bodyStart, video.end);
    const width = videoFields.find((element) => element.id === 0xb0);
    const height = videoFields.find((element) => element.id === 0xba);
    if (!width || !height) {
      return problem('UNSUPPORTED_STRUCTURE', 'MUX_ORIENTATION_PIXEL_SIZE_MISSING', 'Matroska video has no pixel size');
    }
    const codedWidth = ebmlUint(bytes, width);
    const codedHeight = ebmlUint(bytes, height);
    const projection = videoFields.find((element) => element.id === 0x7670);
    const projectionFields = projection ? ebmlChildren(bytes, projection.bodyStart, projection.end) : [];
    const roll = projectionFields.find((element) => element.id === 0x7675);
    const rotation = roll ? cardinalRotation(ebmlFloat(bytes, roll)) : 0;
    if (rotation === null) {
      return problem(
        'UNSUPPORTED_STRUCTURE',
        'MUX_ORIENTATION_NON_CARDINAL_ROTATION',
        'Matroska ProjectionPoseRoll is not a cardinal display rotation',
      );
    }
    const representation = roll ? 'matroska-projection-roll' : 'none';
    return okOrientation(container, codedWidth, codedHeight, rotation, representation);
  }
  return problem('UNSUPPORTED_STRUCTURE', 'MUX_ORIENTATION_VIDEO_TRACK_MISSING', 'Matroska has no readable video track');
}

function okOrientation(
  container: MuxOrientationEvidence['container'],
  codedWidth: number,
  codedHeight: number,
  rotationDegrees: MuxOrientationEvidence['rotationDegrees'],
  representation: MuxOrientationEvidence['representation'],
): MuxOrientationReadResult {
  if (!Number.isSafeInteger(codedWidth) || codedWidth <= 0 ||
      !Number.isSafeInteger(codedHeight) || codedHeight <= 0) {
    return problem('MALFORMED', 'MUX_ORIENTATION_DIMENSIONS_INVALID', 'coded video dimensions are invalid');
  }
  const swapsAxes = rotationDegrees === 90 || rotationDegrees === 270;
  return Object.freeze({
    state: 'OK' as const,
    value: Object.freeze({
      schema: MUX_ORIENTATION_EVIDENCE_SCHEMA,
      container,
      codedWidth,
      codedHeight,
      displayWidth: swapsAxes ? codedHeight : codedWidth,
      displayHeight: swapsAxes ? codedWidth : codedHeight,
      rotationDegrees,
      representation,
    }),
  });
}

interface IsoBox { type: string; start: number; bodyStart: number; end: number }

function isoBoxes(bytes: Uint8Array, start: number, end: number): IsoBox[] {
  const out: IsoBox[] = [];
  let offset = start;
  while (offset < end) {
    if (offset + 8 > end) throw new OrientationReadError('INCOMPLETE', 'MUX_ORIENTATION_BOX_TRUNCATED', 'ISO box header is truncated');
    let size = u32(bytes, offset);
    const type = fourcc(bytes, offset + 4);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) throw new OrientationReadError('INCOMPLETE', 'MUX_ORIENTATION_LARGESIZE_TRUNCATED', 'ISO large size is truncated');
      size = safeU64(bytes, offset + 8);
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < header || offset + size > end) {
      throw new OrientationReadError('MALFORMED', 'MUX_ORIENTATION_BOX_SIZE_INVALID', `${type} box exceeds its parent`);
    }
    out.push({ type, start: offset, bodyStart: offset + header, end: offset + size });
    offset += size;
  }
  return out;
}

function visualSampleEntryDimensions(bytes: Uint8Array, stsd: IsoBox): { width: number; height: number } | undefined {
  if (stsd.bodyStart + 16 > stsd.end || u32(bytes, stsd.bodyStart + 4) < 1) return undefined;
  const entry = isoBoxes(bytes, stsd.bodyStart + 8, stsd.end)[0];
  if (!entry || entry.start + 36 > entry.end) return undefined;
  return { width: u16(bytes, entry.start + 32), height: u16(bytes, entry.start + 34) };
}

function isoTrackRotation(bytes: Uint8Array, tkhd: IsoBox): 0 | 90 | 180 | 270 | null {
  if (tkhd.bodyStart + 1 > tkhd.end) return null;
  const version = bytes[tkhd.bodyStart]!;
  const offset = tkhd.bodyStart + (version === 1 ? 52 : 40);
  if (offset + 36 > tkhd.end) return null;
  const a = fixed16(bytes, offset);
  const b = fixed16(bytes, offset + 4);
  const c = fixed16(bytes, offset + 12);
  const d = fixed16(bytes, offset + 16);
  const close = (actual: number, expected: number): boolean => Math.abs(actual - expected) <= 1 / 65536;
  if (close(a, 1) && close(b, 0) && close(c, 0) && close(d, 1)) return 0;
  // ISO matrices transform coordinates counter-clockwise; expose the equivalent clockwise display
  // rotation used by WebCodecs/ffprobe and by DisplayTransformContract.
  if (close(a, 0) && close(b, 1) && close(c, -1) && close(d, 0)) return 270;
  if (close(a, -1) && close(b, 0) && close(c, 0) && close(d, -1)) return 180;
  if (close(a, 0) && close(b, -1) && close(c, 1) && close(d, 0)) return 90;
  return null;
}

interface EbmlElement { id: number; bodyStart: number; end: number }

function ebmlChildren(bytes: Uint8Array, start: number, end: number): EbmlElement[] {
  const out: EbmlElement[] = [];
  let offset = start;
  while (offset < end) {
    const id = ebmlVint(bytes, offset, end, false);
    const size = ebmlVint(bytes, offset + id.width, end, true);
    const bodyStart = offset + id.width + size.width;
    const bodyEnd = size.unknown ? end : bodyStart + size.value;
    if (bodyEnd < bodyStart || bodyEnd > end) {
      throw new OrientationReadError('MALFORMED', 'MUX_ORIENTATION_EBML_SIZE_INVALID', 'EBML element exceeds its parent');
    }
    out.push({ id: id.value, bodyStart, end: bodyEnd });
    if (bodyEnd === offset) throw new OrientationReadError('MALFORMED', 'MUX_ORIENTATION_EBML_ZERO_PROGRESS', 'EBML parser made no progress');
    offset = bodyEnd;
  }
  return out;
}

function ebmlVint(
  bytes: Uint8Array,
  offset: number,
  end: number,
  isSize: boolean,
): { value: number; width: number; unknown: boolean } {
  if (offset >= end) throw new OrientationReadError('INCOMPLETE', 'MUX_ORIENTATION_EBML_VINT_TRUNCATED', 'EBML VINT is truncated');
  const first = bytes[offset]!;
  let mask = 0x80;
  let width = 1;
  while (width <= 8 && (first & mask) === 0) { mask >>= 1; width++; }
  if (width > (isSize ? 8 : 4) || offset + width > end) {
    throw new OrientationReadError('MALFORMED', 'MUX_ORIENTATION_EBML_VINT_INVALID', 'EBML VINT width is invalid');
  }
  let value = isSize ? first & (mask - 1) : first;
  const unknown = isSize && (first & (mask - 1)) === mask - 1 &&
    bytes.subarray(offset + 1, offset + width).every((byte) => byte === 0xff);
  if (unknown) return { value: 0, width, unknown: true };
  for (let index = 1; index < width; index++) value = value * 256 + bytes[offset + index]!;
  if (!Number.isSafeInteger(value)) {
    throw new OrientationReadError('UNSUPPORTED_STRUCTURE', 'MUX_ORIENTATION_EBML_VINT_UNSAFE', 'EBML extent exceeds safe in-memory addressing');
  }
  return { value, width, unknown: false };
}

function ebmlUint(bytes: Uint8Array, element: EbmlElement): number {
  const width = element.end - element.bodyStart;
  if (width < 1 || width > 6) throw new OrientationReadError('MALFORMED', 'MUX_ORIENTATION_EBML_UINT_INVALID', 'EBML integer width is invalid');
  let value = 0;
  for (let offset = element.bodyStart; offset < element.end; offset++) value = value * 256 + bytes[offset]!;
  return value;
}

function ebmlFloat(bytes: Uint8Array, element: EbmlElement): number {
  const width = element.end - element.bodyStart;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (width === 4) return view.getFloat32(element.bodyStart, false);
  if (width === 8) return view.getFloat64(element.bodyStart, false);
  throw new OrientationReadError('MALFORMED', 'MUX_ORIENTATION_EBML_FLOAT_INVALID', 'ProjectionPoseRoll must be a 32/64-bit float');
}

function cardinalRotation(value: number): 0 | 90 | 180 | 270 | null {
  if (!Number.isFinite(value)) return null;
  const normalized = ((value % 360) + 360) % 360;
  for (const cardinal of [0, 90, 180, 270] as const) {
    if (Math.abs(normalized - cardinal) <= 0.01 || Math.abs(normalized - cardinal - 360) <= 0.01) return cardinal;
  }
  return null;
}

class OrientationReadError extends Error {
  constructor(
    readonly state: Exclude<MuxOrientationReadResult['state'], 'OK'>,
    readonly reasonCode: string,
    message: string,
  ) {
    super(message);
    this.name = 'OrientationReadError';
  }
}

function problem(
  state: Exclude<MuxOrientationReadResult['state'], 'OK'>,
  reasonCode: string,
  detail: string,
): MuxOrientationReadResult {
  return Object.freeze({ state, reasonCode, detail });
}

function fixed16(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt32(offset, false) / 65536;
}

function u16(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, false);
}

function u32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

function safeU64(bytes: Uint8Array, offset: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const value = BigInt(view.getUint32(offset, false)) * 0x1_0000_0000n + BigInt(view.getUint32(offset + 4, false));
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new OrientationReadError('UNSUPPORTED_STRUCTURE', 'MUX_ORIENTATION_BOX_TOO_LARGE', 'ISO box exceeds safe in-memory addressing');
  }
  return Number(value);
}

function fourcc(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!);
}

function canonicalContainer(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'quicktime') return 'mov';
  if (normalized === 'matroska') return 'mkv';
  return normalized;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
