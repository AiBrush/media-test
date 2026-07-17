import type { DemuxResult, MediaInput, NormalizedTrack, PacketInfo } from '../../core/engine.ts';
import type { OracleOutcome } from '../../core/scenario.ts';
import { bytesEqual, canonicalDemuxCodec, demuxError, demuxVerdict } from './types.ts';

export const FLAC_SEEKTABLE_INVARIANT = 'demux-flac-index-invariance' as const;

export interface FlacFileEvidence {
  readonly state: 'OK';
  readonly hasSeektable: boolean;
  readonly metadataBlockTypes: readonly number[];
  readonly streamInfo: Uint8Array;
  readonly frameBytes: Uint8Array;
}

export type FlacFileReadResult =
  | FlacFileEvidence
  | Readonly<{ state: 'MALFORMED'; reasonCode: string; detail: string }>;

export interface FlacSeektablePairObservation {
  readonly withSeektableInput: MediaInput;
  readonly withoutSeektableInput: MediaInput;
  readonly withSeektable: DemuxResult;
  readonly withoutSeektable: DemuxResult;
  readonly outcome: OracleOutcome;
}

export type DemuxPairOperation = (input: MediaInput) => Promise<DemuxResult>;

/** Execute both declared inputs using the same candidate engine instance and compare them directly. */
export async function executeFlacSeektableInvariant(
  inputs: readonly MediaInput[],
  demux: DemuxPairOperation,
  toleranceUs = 1_000,
): Promise<FlacSeektablePairObservation> {
  if (inputs.length !== 2) throw new TypeError(`FLAC SEEKTABLE invariant requires exactly two inputs, got ${inputs.length}`);
  const withSeektableInput = inputs.find((input) => input.id.includes('flac_seektable'));
  const withoutSeektableInput = inputs.find((input) => input.id.includes('flac_noseektable'));
  if (!withSeektableInput || !withoutSeektableInput || withSeektableInput === withoutSeektableInput) {
    throw new TypeError('FLAC SEEKTABLE invariant requires distinct seektable and no-seektable inputs');
  }
  // Adapter lifecycle is not assumed re-entrant (notably single-flight WASM engines), so the two
  // dependent observations are intentionally serialized on the same initialized instance.
  const withSeektable = await demux(withSeektableInput);
  const withoutSeektable = await demux(withoutSeektableInput);
  return Object.freeze({
    withSeektableInput,
    withoutSeektableInput,
    withSeektable,
    withoutSeektable,
    outcome: compareFlacSeektableDemux(withSeektable, withoutSeektable, toleranceUs),
  });
}

/**
 * Compare semantic FLAC frame inventories, not container metadata blocks. Removing SEEKTABLE is
 * allowed to move metadata offsets only; audio-frame count/content/size and the normalized timeline
 * must remain invariant.
 */
export function compareFlacSeektableDemux(
  withSeektable: DemuxResult,
  withoutSeektable: DemuxResult,
  toleranceUs = 1_000,
): OracleOutcome {
  if (!Number.isFinite(toleranceUs) || toleranceUs < 0) {
    return demuxError('DEMUX_FLAC_TOLERANCE_INVALID', 'FLAC timeline tolerance must be finite and non-negative', 'property-invariant');
  }
  const left = flacTrack(withSeektable);
  const right = flacTrack(withoutSeektable);
  if ('error' in left) return demuxVerdict('FAIL', left.error, left.detail, undefined, 'property-invariant');
  if ('error' in right) return demuxVerdict('FAIL', right.error, right.detail, undefined, 'property-invariant');

  const measurements: Record<string, number> = {
    withSeektableFrames: left.packets.length,
    withoutSeektableFrames: right.packets.length,
    comparedFrames: 0,
    maximumPtsResidualUs: 0,
    maximumDtsResidualUs: 0,
    payloadComparedFrames: 0,
  };
  if (left.packets.length !== right.packets.length) {
    return demuxVerdict(
      'FAIL',
      'DEMUX_FLAC_FRAME_COUNT_MISMATCH',
      `SEEKTABLE variant has ${left.packets.length} frame(s), no-SEEKTABLE variant has ${right.packets.length}`,
      measurements,
      'property-invariant',
    );
  }
  for (const field of ['sampleRate', 'channels'] as const) {
    const a = left.track[field];
    const b = right.track[field];
    if (a !== undefined && b !== undefined && a !== b) {
      return demuxVerdict(
        'FAIL', 'DEMUX_FLAC_TRACK_SEMANTICS_MISMATCH',
        `FLAC ${field} changed from ${a} to ${b} when SEEKTABLE was removed`, measurements, 'property-invariant',
      );
    }
  }
  const durationA = withSeektable.metadata.durationSec;
  const durationB = withoutSeektable.metadata.durationSec;
  if (durationA !== null && durationB !== null && Math.abs(durationA - durationB) > toleranceUs / 1_000_000) {
    return demuxVerdict(
      'FAIL', 'DEMUX_FLAC_DURATION_MISMATCH',
      `FLAC duration changed by ${Math.abs(durationA - durationB).toFixed(6)}s when SEEKTABLE was removed`,
      measurements, 'property-invariant',
    );
  }

  const leftOrdered = [...left.packets].sort(byPresentation);
  const rightOrdered = [...right.packets].sort(byPresentation);
  const ptsOrigin = leftOrdered.length ? leftOrdered[0]!.ptsUs - rightOrdered[0]!.ptsUs : 0;
  const leftDts = leftOrdered[0]?.dtsUs;
  const rightDts = rightOrdered[0]?.dtsUs;
  const dtsOrigin = leftDts !== undefined && rightDts !== undefined ? leftDts - rightDts : undefined;
  const representationDiffs: string[] = [];
  if (left.trackIndex !== right.trackIndex) representationDiffs.push('numeric track index differs');
  if ((leftDts === undefined) !== (rightDts === undefined)) representationDiffs.push('DTS observation coverage differs');
  let scalarOnly = 0;
  for (let index = 0; index < leftOrdered.length; index++) {
    const a = leftOrdered[index]!;
    const b = rightOrdered[index]!;
    measurements.comparedFrames = (measurements.comparedFrames ?? 0) + 1;
    if (a.size !== b.size) {
      return demuxVerdict(
        'FAIL', 'DEMUX_FLAC_FRAME_SIZE_MISMATCH',
        `FLAC frame ${index} has ${a.size} vs ${b.size} byte(s)`, measurements, 'property-invariant',
      );
    }
    const ptsResidual = Math.abs(a.ptsUs - b.ptsUs - ptsOrigin);
    measurements.maximumPtsResidualUs = Math.max(measurements.maximumPtsResidualUs ?? 0, ptsResidual);
    if (ptsResidual > toleranceUs) {
      return demuxVerdict(
        'FAIL', 'DEMUX_FLAC_FRAME_TIMELINE_MISMATCH',
        `FLAC frame ${index} PTS residual ${ptsResidual}us exceeds ${toleranceUs}us`, measurements, 'property-invariant',
      );
    }
    if (a.durationUs !== undefined && b.durationUs !== undefined && Math.abs(a.durationUs - b.durationUs) > toleranceUs) {
      return demuxVerdict(
        'FAIL', 'DEMUX_FLAC_FRAME_DURATION_MISMATCH',
        `FLAC frame ${index} duration changed ${a.durationUs}us -> ${b.durationUs}us`, measurements, 'property-invariant',
      );
    }
    if (a.dtsUs !== undefined && b.dtsUs !== undefined && dtsOrigin !== undefined) {
      const residual = Math.abs(a.dtsUs - b.dtsUs - dtsOrigin);
      measurements.maximumDtsResidualUs = Math.max(measurements.maximumDtsResidualUs ?? 0, residual);
      if (residual > toleranceUs) {
        return demuxVerdict(
          'FAIL', 'DEMUX_FLAC_FRAME_DTS_MISMATCH',
          `FLAC frame ${index} DTS residual ${residual}us exceeds ${toleranceUs}us`, measurements, 'property-invariant',
        );
      }
    }
    const payload = comparePacketPayload(a, b);
    if (payload === false) {
      return demuxVerdict(
        'FAIL', 'DEMUX_FLAC_FRAME_PAYLOAD_MISMATCH',
        `FLAC frame ${index} payload identity changed when SEEKTABLE was removed`, measurements, 'property-invariant',
      );
    }
    if (payload === true) measurements.payloadComparedFrames = (measurements.payloadComparedFrames ?? 0) + 1;
    else scalarOnly++;
  }

  const evidence = scalarOnly > 0
    ? `${scalarOnly} frame(s) compared by frame size/timeline because neither side retained a payload identity`
    : `payload identity compared for all ${measurements.payloadComparedFrames ?? 0} frame(s)`;
  return demuxVerdict(
    'PASS',
    representationDiffs.length ? 'DEMUX_FLAC_EQUIVALENT_REPRESENTATION' : 'DEMUX_FLAC_SEEKTABLE_INVARIANT',
    `FLAC semantic frame inventory and timeline are invariant; ${evidence}` +
      (representationDiffs.length ? `; ${representationDiffs.join('; ')}` : ''),
    measurements,
    'property-invariant',
  );
}

/** Bounded native reader used to prove the fixture pair differs only before the FLAC frame stream. */
export function readFlacFileEvidence(bytes: Uint8Array): FlacFileReadResult {
  if (bytes.byteLength < 8 || bytes[0] !== 0x66 || bytes[1] !== 0x4c || bytes[2] !== 0x61 || bytes[3] !== 0x43) {
    return { state: 'MALFORMED', reasonCode: 'DEMUX_FLAC_MAGIC_INVALID', detail: 'FLAC marker is absent' };
  }
  let offset = 4;
  let last = false;
  let streamInfo: Uint8Array | undefined;
  const metadataBlockTypes: number[] = [];
  while (!last) {
    if (offset + 4 > bytes.byteLength) {
      return { state: 'MALFORMED', reasonCode: 'DEMUX_FLAC_METADATA_TRUNCATED', detail: 'FLAC metadata header is truncated' };
    }
    last = (bytes[offset]! & 0x80) !== 0;
    const type = bytes[offset]! & 0x7f;
    const length = (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    offset += 4;
    if (offset + length > bytes.byteLength) {
      return { state: 'MALFORMED', reasonCode: 'DEMUX_FLAC_METADATA_EXTENT_INVALID', detail: `FLAC metadata block ${type} exceeds the file` };
    }
    metadataBlockTypes.push(type);
    if (type === 0) {
      if (length !== 34 || streamInfo) {
        return { state: 'MALFORMED', reasonCode: 'DEMUX_FLAC_STREAMINFO_INVALID', detail: 'FLAC must have one 34-byte STREAMINFO block' };
      }
      streamInfo = bytes.slice(offset, offset + length);
    }
    offset += length;
  }
  if (!streamInfo) {
    return { state: 'MALFORMED', reasonCode: 'DEMUX_FLAC_STREAMINFO_MISSING', detail: 'FLAC STREAMINFO block is absent' };
  }
  if (offset >= bytes.byteLength) {
    return { state: 'MALFORMED', reasonCode: 'DEMUX_FLAC_FRAME_STREAM_EMPTY', detail: 'FLAC contains no audio frame bytes' };
  }
  return Object.freeze({
    state: 'OK' as const,
    hasSeektable: metadataBlockTypes.includes(3),
    metadataBlockTypes: Object.freeze([...metadataBlockTypes]),
    streamInfo,
    frameBytes: bytes.slice(offset),
  });
}

export function compareFlacFixturePair(
  withSeektableBytes: Uint8Array,
  withoutSeektableBytes: Uint8Array,
): OracleOutcome {
  const left = readFlacFileEvidence(withSeektableBytes);
  const right = readFlacFileEvidence(withoutSeektableBytes);
  if (left.state !== 'OK') return demuxError(left.reasonCode, left.detail, 'property-invariant');
  if (right.state !== 'OK') return demuxError(right.reasonCode, right.detail, 'property-invariant');
  if (!left.hasSeektable || right.hasSeektable) {
    return demuxError(
      'DEMUX_FLAC_FIXTURE_RELATION_INVALID',
      `fixture pair must be SEEKTABLE=true/false, observed ${left.hasSeektable}/${right.hasSeektable}`,
      'property-invariant',
    );
  }
  if (!bytesEqual(left.streamInfo, right.streamInfo)) {
    return demuxVerdict('FAIL', 'DEMUX_FLAC_FIXTURE_STREAMINFO_MISMATCH', 'fixture STREAMINFO differs beyond SEEKTABLE metadata', undefined, 'property-invariant');
  }
  if (!bytesEqual(left.frameBytes, right.frameBytes)) {
    return demuxVerdict('FAIL', 'DEMUX_FLAC_FIXTURE_FRAME_STREAM_MISMATCH', 'fixture audio-frame bytes differ', undefined, 'property-invariant');
  }
  return demuxVerdict(
    'PASS', 'DEMUX_FLAC_FIXTURE_RELATION_PROVEN',
    `fixtures have identical STREAMINFO and ${left.frameBytes.byteLength} audio-frame byte(s); only the SEEKTABLE metadata relation differs`,
    { frameBytes: left.frameBytes.byteLength }, 'property-invariant',
  );
}

function flacTrack(result: DemuxResult):
  | { track: NormalizedTrack; trackIndex: number; packets: PacketInfo[] }
  | { error: string; detail: string } {
  const matches = result.metadata.tracks
    .map((track, trackIndex) => ({ track, trackIndex }))
    .filter(({ track }) => track.type === 'audio' && canonicalDemuxCodec(track.codec) === 'flac');
  if (matches.length !== 1) {
    return {
      error: 'DEMUX_FLAC_TRACK_CARDINALITY_INVALID',
      detail: `expected exactly one FLAC audio track, observed ${matches.length}`,
    };
  }
  const match = matches[0]!;
  const packets = result.packets.filter((packet) => packet.trackIndex === match.trackIndex);
  if (packets.length === 0) {
    return { error: 'DEMUX_FLAC_FRAME_INVENTORY_EMPTY', detail: 'FLAC demux returned no audio frames' };
  }
  return { ...match, packets };
}

function comparePacketPayload(left: PacketInfo, right: PacketInfo): boolean | undefined {
  if (left.payloadDigest && right.payloadDigest) return left.payloadDigest.toLowerCase() === right.payloadDigest.toLowerCase();
  if (left.payload instanceof Uint8Array && right.payload instanceof Uint8Array) return bytesEqual(left.payload, right.payload);
  if (left.accessUnitId && right.accessUnitId && looksDigest(left.accessUnitId) && looksDigest(right.accessUnitId)) {
    return left.accessUnitId.toLowerCase() === right.accessUnitId.toLowerCase();
  }
  return undefined;
}

function looksDigest(value: string): boolean {
  return /^[a-f0-9]{16,128}$/i.test(value);
}

function byPresentation(left: PacketInfo, right: PacketInfo): number {
  return left.ptsUs - right.ptsUs || (left.dtsUs ?? left.ptsUs) - (right.dtsUs ?? right.ptsUs);
}
