import { MAX_REMUX_SAMPLES, MAX_REMUX_TRACKS, ascii, u64beSafe } from './binary.ts';
import { parseFlacStreamInfo, type FlacStreamInfo } from './reader-flac.ts';
import type { RemuxProgramEvidence, RemuxReadResult, RemuxSampleEvidence, RemuxTrackEvidence } from './types.ts';

interface OggPacket {
  bytes: Uint8Array;
  fileOffset: number;
  endGranule?: number;
}

interface OggLogicalStream {
  serial: number;
  sequence?: number;
  pending: Uint8Array[];
  pendingBytes: number;
  pendingOffset: number;
  packets: OggPacket[];
  eosGranule?: number;
}

function u32le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! * 0x1000000)) >>> 0;
}

function u16le(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function oggGranule(bytes: Uint8Array, offset: number): number | undefined {
  // Reuse the checked BE helper after reversing the little-endian field without allocating.
  const reversed = new Uint8Array(8);
  for (let i = 0; i < 8; i++) reversed[i] = bytes[offset + 7 - i]!;
  const value = u64beSafe(reversed, 0);
  return value === Number.MAX_SAFE_INTEGER || value === undefined ? undefined : value;
}

function oggCrc(bytes: Uint8Array, pageStart: number, pageEnd: number): number {
  let crc = 0;
  for (let i = pageStart; i < pageEnd; i++) {
    const byte = i >= pageStart + 22 && i < pageStart + 26 ? 0 : bytes[i]!;
    crc ^= byte << 24;
    for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ ((crc & 0x80000000) ? 0x04c11db7 : 0)) >>> 0;
  }
  return crc >>> 0;
}

function join(chunks: readonly Uint8Array[], total: number): Uint8Array {
  if (chunks.length === 1) return chunks[0]!;
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

function opusPacketSamples(packet: Uint8Array): number | undefined {
  if (packet.byteLength < 1) return undefined;
  const toc = packet[0]!;
  const config = toc >> 3;
  let frameSamples: number;
  if (config >= 16) frameSamples = 120 << (config & 3); // 2.5, 5, 10, 20 ms at 48 kHz
  else if (config >= 12) frameSamples = 480 << (config & 1); // 10 or 20 ms
  else if ((config & 3) === 3) frameSamples = 2880; // 60 ms
  else frameSamples = 480 << (config & 3); // 10, 20 or 40 ms
  const code = toc & 3;
  const frames = code === 0 ? 1 : code === 1 || code === 2 ? 2 : packet.byteLength >= 2 ? packet[1]! & 0x3f : 0;
  const total = frameSamples * frames;
  return frames > 0 && total <= 5760 ? total : undefined;
}

function vorbisIdentification(packet: Uint8Array): { channels: number; sampleRate: number } | undefined {
  if (packet.byteLength < 30 || packet[0] !== 1 || ascii(packet, 1, 6) !== 'vorbis') return undefined;
  const channels = packet[11]!;
  const sampleRate = u32le(packet, 12);
  return channels > 0 && sampleRate > 0 ? { channels, sampleRate } : undefined;
}

function flacInfoFromOggHeader(packet: Uint8Array): FlacStreamInfo | undefined {
  for (let i = 0; i + 42 <= packet.byteLength; i++) {
    if (ascii(packet, i, 4) !== 'fLaC') continue;
    const header = i + 4;
    if ((packet[header]! & 0x7f) !== 0) continue;
    const length = (packet[header + 1]! << 16) | (packet[header + 2]! << 8) | packet[header + 3]!;
    if (length !== 34) continue;
    return parseFlacStreamInfo(packet, header + 4);
  }
  return undefined;
}

function logicalTrack(stream: OggLogicalStream): RemuxTrackEvidence | undefined {
  const first = stream.packets[0]?.bytes;
  if (!first) return undefined;
  if (first.byteLength >= 19 && ascii(first, 0, 8) === 'OpusHead') {
    const channels = first[9]!;
    const preSkip = u16le(first, 10);
    let frames = 0;
    const samples: RemuxSampleEvidence[] = [];
    for (const packet of stream.packets.slice(2)) {
      const count = opusPacketSamples(packet.bytes);
      if (count === undefined) return undefined;
      const ptsUs = Math.round(((frames - preSkip) / 48_000) * 1_000_000);
      samples.push({
        payload: packet.bytes, ptsUs,
        durationUs: Math.round((count / 48_000) * 1_000_000), keyframe: true,
        fileOffset: packet.fileOffset, framing: 'ogg-packet',
      });
      frames += count;
    }
    return {
      id: `ogg:${stream.serial}`, type: 'audio', codec: 'opus', sampleRate: 48_000,
      channels, timescale: 48_000, codecPrivate: first, samples,
    };
  }
  const vorbis = vorbisIdentification(first);
  if (vorbis) {
    const samples = stream.packets.slice(3).map((packet) => ({
      payload: packet.bytes, fileOffset: packet.fileOffset, framing: 'ogg-packet' as const,
      keyframe: true,
    }));
    return {
      id: `ogg:${stream.serial}`, type: 'audio', codec: 'vorbis',
      sampleRate: vorbis.sampleRate, channels: vorbis.channels, timescale: vorbis.sampleRate,
      codecPrivate: first, samples,
    };
  }
  if ((first.byteLength >= 5 && first[0] === 0x7f && ascii(first, 1, 4) === 'FLAC') || ascii(first, 0, 4) === 'fLaC') {
    const info = flacInfoFromOggHeader(first);
    if (!info) return undefined;
    const dataPackets = stream.packets.filter((packet, index) => index > 0 && packet.bytes.byteLength >= 2 && packet.bytes[0] === 0xff && (packet.bytes[1]! & 0xfc) === 0xf8);
    if (dataPackets.length === 0) return undefined;
    const durationUs = info.totalSamples > 0 ? Math.round((info.totalSamples / info.sampleRate) * 1_000_000) : undefined;
    return {
      id: `ogg:${stream.serial}`, type: 'audio', codec: 'flac', sampleRate: info.sampleRate,
      channels: info.channels, timescale: info.sampleRate, codecPrivate: info.bytes,
      samples: dataPackets.map((packet, index) => ({
        payload: packet.bytes, ...(index === 0 ? { ptsUs: 0, dtsUs: 0 } : {}),
        ...(index === dataPackets.length - 1 && durationUs ? { durationUs } : {}),
        keyframe: true, fileOffset: packet.fileOffset, framing: 'flac-frame',
      })),
    };
  }
  // Skeleton and metadata-only logical streams are not part of the coded media program.
  if (ascii(first, 0, 8) === 'fishead\0') return undefined;
  return undefined;
}

export function readOggProgram(bytes: Uint8Array): RemuxReadResult {
  const evidence = { reader: 'ogg', byteLength: bytes?.byteLength ?? 0, detectedContainer: 'ogg' } as const;
  try {
    if (!bytes || bytes.byteLength < 27) return { state: 'INCOMPLETE', reasonCode: 'REMUX_OGG_INPUT_INCOMPLETE', evidence };
    const streams = new Map<number, OggLogicalStream>();
    let offset = 0;
    let pageCount = 0;
    while (offset < bytes.byteLength) {
      if (offset + 27 > bytes.byteLength) return { state: 'INCOMPLETE', reasonCode: 'REMUX_OGG_PAGE_HEADER_INCOMPLETE', evidence };
      if (ascii(bytes, offset, 4) !== 'OggS' || bytes[offset + 4] !== 0) {
        return { state: 'MALFORMED', reasonCode: 'REMUX_OGG_CAPTURE_INVALID', evidence };
      }
      const flags = bytes[offset + 5]!;
      const granule = oggGranule(bytes, offset + 6);
      const serial = u32le(bytes, offset + 14);
      const sequence = u32le(bytes, offset + 18);
      const storedCrc = u32le(bytes, offset + 22);
      const segments = bytes[offset + 26]!;
      const headerEnd = offset + 27 + segments;
      if (headerEnd > bytes.byteLength) return { state: 'INCOMPLETE', reasonCode: 'REMUX_OGG_LACING_INCOMPLETE', evidence };
      let bodySize = 0;
      for (let i = 0; i < segments; i++) bodySize += bytes[offset + 27 + i]!;
      const pageEnd = headerEnd + bodySize;
      if (pageEnd > bytes.byteLength) return { state: 'INCOMPLETE', reasonCode: 'REMUX_OGG_PAGE_BODY_INCOMPLETE', evidence };
      if (oggCrc(bytes, offset, pageEnd) !== storedCrc) return { state: 'MALFORMED', reasonCode: 'REMUX_OGG_CRC_MISMATCH', evidence };
      let stream = streams.get(serial);
      if (!stream) {
        if (streams.size >= MAX_REMUX_TRACKS) return { state: 'MALFORMED', reasonCode: 'REMUX_OGG_STREAM_COUNT_EXCESSIVE', evidence };
        stream = { serial, pending: [], pendingBytes: 0, pendingOffset: headerEnd, packets: [] };
        streams.set(serial, stream);
      }
      if (stream.sequence !== undefined && sequence !== ((stream.sequence + 1) >>> 0)) {
        return { state: 'INCOMPLETE', reasonCode: 'REMUX_OGG_PAGE_SEQUENCE_GAP', evidence };
      }
      stream.sequence = sequence;
      const continued = (flags & 1) !== 0;
      if (continued !== (stream.pendingBytes > 0)) {
        return { state: continued ? 'INCOMPLETE' : 'MALFORMED', reasonCode: 'REMUX_OGG_CONTINUATION_INVALID', evidence };
      }
      let bodyOffset = headerEnd;
      for (let i = 0; i < segments; i++) {
        const size = bytes[offset + 27 + i]!;
        const part = bytes.subarray(bodyOffset, bodyOffset + size);
        if (stream.pendingBytes === 0) stream.pendingOffset = bodyOffset;
        stream.pending.push(part);
        stream.pendingBytes += size;
        bodyOffset += size;
        if (size < 255) {
          if (stream.packets.length >= MAX_REMUX_SAMPLES) return { state: 'MALFORMED', reasonCode: 'REMUX_OGG_PACKET_COUNT_EXCESSIVE', evidence };
          stream.packets.push({
            bytes: join(stream.pending, stream.pendingBytes), fileOffset: stream.pendingOffset,
            ...(i === segments - 1 && granule !== undefined ? { endGranule: granule } : {}),
          });
          stream.pending = [];
          stream.pendingBytes = 0;
        }
      }
      if ((flags & 4) !== 0 && granule !== undefined) stream.eosGranule = granule;
      offset = pageEnd;
      pageCount++;
    }
    if ([...streams.values()].some((stream) => stream.pendingBytes > 0)) {
      return { state: 'INCOMPLETE', reasonCode: 'REMUX_OGG_PACKET_INCOMPLETE', evidence };
    }
    const tracks = [...streams.values()].map(logicalTrack).filter((track): track is RemuxTrackEvidence => !!track);
    if (tracks.length === 0) return { state: 'UNSUPPORTED_STRUCTURE', reasonCode: 'REMUX_OGG_CODEC_UNSUPPORTED', evidence };
    let observedDurationUs = 0;
    for (const track of tracks) {
      for (const sample of track.samples) {
        if (sample.ptsUs !== undefined && sample.durationUs !== undefined) {
          observedDurationUs = Math.max(observedDurationUs, sample.ptsUs + sample.durationUs);
        }
      }
    }
    // The final Ogg granule is the container-authored presentation endpoint. In particular, Opus
    // may discard part of its final coded packet, so summing full packet durations overstates the
    // playable program even though every coded payload was copied intact.
    let granuleDurationUs = 0;
    for (const track of tracks) {
      const serial = Number(track.id.slice('ogg:'.length));
      const stream = Number.isInteger(serial) ? streams.get(serial) : undefined;
      if (stream?.eosGranule === undefined || !track.sampleRate) continue;
      granuleDurationUs = Math.max(
        granuleDurationUs,
        Math.round((stream.eosGranule / track.sampleRate) * 1_000_000),
      );
    }
    const durationUs = granuleDurationUs > 0 ? granuleDurationUs : observedDurationUs;
    const parsedSamples = tracks.reduce((sum, track) => sum + track.samples.length, 0);
    const value: RemuxProgramEvidence = {
      schema: 'media-test/remux-program@1', container: 'ogg', byteLength: bytes.byteLength,
      ...(durationUs > 0 ? { durationUs } : {}), tracks,
      representation: { lacing: true },
    };
    return {
      state: 'OK', value,
      evidence: { ...evidence, parsedTracks: tracks.length, parsedSamples, markers: [`pages:${pageCount}`] },
    };
  } catch {
    return { state: 'MALFORMED', reasonCode: 'REMUX_OGG_PARSE_GUARD', evidence };
  }
}
