import { ascii, u24be } from './binary.ts';
import type { RemuxProgramEvidence, RemuxReadResult } from './types.ts';

export interface FlacStreamInfo {
  sampleRate: number;
  channels: number;
  totalSamples: number;
  bytes: Uint8Array;
}

export function parseFlacStreamInfo(bytes: Uint8Array, offset: number): FlacStreamInfo | undefined {
  if (offset + 34 > bytes.byteLength) return undefined;
  const packed = bytes.subarray(offset + 10, offset + 18);
  let value = 0n;
  for (const byte of packed) value = (value << 8n) | BigInt(byte);
  const sampleRate = Number((value >> 44n) & 0xfffffn);
  const channels = Number((value >> 41n) & 0x7n) + 1;
  const totalSamples = Number(value & 0xfffffffffn);
  if (!sampleRate || !channels || !Number.isSafeInteger(totalSamples)) return undefined;
  return { sampleRate, channels, totalSamples, bytes: bytes.subarray(offset, offset + 34) };
}

export function readFlacProgram(bytes: Uint8Array): RemuxReadResult {
  const evidence = { reader: 'flac', byteLength: bytes?.byteLength ?? 0, detectedContainer: 'flac' } as const;
  try {
    if (!bytes || bytes.byteLength < 8) return { state: 'INCOMPLETE', reasonCode: 'REMUX_FLAC_INPUT_INCOMPLETE', evidence };
    if (ascii(bytes, 0, 4) !== 'fLaC') return { state: 'MALFORMED', reasonCode: 'REMUX_FLAC_MARKER_INVALID', evidence };
    let offset = 4;
    let streamInfo: FlacStreamInfo | undefined;
    let metadataBlocks = 0;
    let last = false;
    while (!last) {
      if (offset + 4 > bytes.byteLength) return { state: 'INCOMPLETE', reasonCode: 'REMUX_FLAC_METADATA_HEADER_INCOMPLETE', evidence };
      last = (bytes[offset]! & 0x80) !== 0;
      const type = bytes[offset]! & 0x7f;
      const size = u24be(bytes, offset + 1);
      const body = offset + 4;
      if (body + size > bytes.byteLength) return { state: 'INCOMPLETE', reasonCode: 'REMUX_FLAC_METADATA_INCOMPLETE', evidence };
      if (metadataBlocks === 0 && (type !== 0 || size !== 34)) return { state: 'MALFORMED', reasonCode: 'REMUX_FLAC_STREAMINFO_MISSING', evidence };
      if (type === 0) streamInfo = parseFlacStreamInfo(bytes, body);
      metadataBlocks++;
      if (metadataBlocks > 128) return { state: 'MALFORMED', reasonCode: 'REMUX_FLAC_METADATA_COUNT_EXCESSIVE', evidence };
      offset = body + size;
    }
    if (!streamInfo) return { state: 'MALFORMED', reasonCode: 'REMUX_FLAC_STREAMINFO_INVALID', evidence };
    if (offset >= bytes.byteLength) return { state: 'INCOMPLETE', reasonCode: 'REMUX_FLAC_AUDIO_FRAMES_MISSING', evidence };
    // Native FLAC frame boundaries are bit-coded. Keeping the complete post-metadata stream as one
    // semantic extent is lossless and lets the strict comparator tolerate container packet grouping.
    const payload = bytes.subarray(offset);
    const durationUs = streamInfo.totalSamples > 0
      ? Math.round((streamInfo.totalSamples / streamInfo.sampleRate) * 1_000_000)
      : undefined;
    const value: RemuxProgramEvidence = {
      schema: 'media-test/remux-program@1', container: 'flac', byteLength: bytes.byteLength,
      ...(durationUs !== undefined ? { durationUs } : {}),
      tracks: [{
        id: 'flac:0', type: 'audio', codec: 'flac', sampleRate: streamInfo.sampleRate,
        channels: streamInfo.channels, timescale: streamInfo.sampleRate,
        codecPrivate: streamInfo.bytes,
        samples: [{ payload, ptsUs: 0, dtsUs: 0, ...(durationUs ? { durationUs } : {}), keyframe: true, fileOffset: offset, framing: 'flac-frame' }],
      }],
      representation: {},
    };
    return { state: 'OK', value, evidence: { ...evidence, parsedTracks: 1, parsedSamples: 1 } };
  } catch {
    return { state: 'MALFORMED', reasonCode: 'REMUX_FLAC_PARSE_GUARD', evidence };
  }
}
