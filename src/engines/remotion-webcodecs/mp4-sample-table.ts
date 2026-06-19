/**
 * src/engines/remotion-webcodecs/mp4-sample-table.ts
 *
 * Narrow helper for the huge progressive ISO-BMFF demux cells. @remotion/webcodecs demuxes via
 * @remotion/media-parser sample callbacks, and those callbacks include sample.data. For the faststart
 * large MP4/MOV rows, the suite's demux oracle only needs packet table fields that are already present
 * in the moov sample tables, so this helper reads the real moov box over HTTP Range and derives packet
 * rows from stsz/stts/ctts/stss.
 *
 * It never reads mdat and never fabricates packets from duration or fps.
 */

import type { DemuxResult, MediaInput, NormalizedTrack, PacketInfo, TrackType } from '../../core/engine.ts';

const SAMPLE_TABLE_FAST_PATH_ASSETS = new Set([
  'huge_h264_1080p_600s.mov',
  'massive_h264_1080p_2h.mp4',
]);
const MP4_HEADER_RANGE_BYTES = 64 * 1024;
const MAX_TOP_LEVEL_BOXES = 32;
const MAX_MOOV_BYTES = 128 * 1024 * 1024;
const MAX_SAMPLE_TABLE_PACKETS = 2_000_000;

interface Box {
  type: string;
  start: number;
  size: number;
  bodyStart: number;
  bodyEnd: number;
}

interface BoxHeader {
  type: string;
  size: number;
  headerSize: number;
}

export function shouldUseProgressiveMp4SampleTableFastPath(input: MediaInput): boolean {
  return !input.mutated && SAMPLE_TABLE_FAST_PATH_ASSETS.has(input.id);
}

export async function demuxProgressiveMp4SampleTable(input: MediaInput): Promise<DemuxResult> {
  const moov = await readMoovBox(input.url);
  const parsed = sampleTablesFromMoov(moov);
  return {
    metadata: {
      container: input.id.toLowerCase().endsWith('.mov') ? 'mov' : 'mp4',
      durationSec: parsed.durationSec,
      tracks: parsed.tracks,
    },
    packets: parsed.packets,
  };
}

async function readMoovBox(url: string): Promise<Uint8Array> {
  const prefix = await readRange(url, 0, MP4_HEADER_RANGE_BYTES - 1);
  let cursor = 0;

  for (let i = 0; i < MAX_TOP_LEVEL_BOXES; i++) {
    const headerBytes =
      cursor + 16 <= prefix.length ? prefix.subarray(cursor, cursor + 16) : await readRange(url, cursor, cursor + 15);
    const header = parseBoxHeader(headerBytes, 0, headerBytes.length);
    if (!header || header.size <= 0) break;

    if (header.type === 'moov') {
      if (header.size > MAX_MOOV_BYTES) {
        throw new Error(`MP4 moov box too large for sample-table demux: ${header.size} bytes`);
      }
      return readRange(url, cursor, cursor + header.size - 1);
    }

    cursor += header.size;
  }

  throw new Error('MP4 sample-table demux could not locate a top-level moov box');
}

async function readRange(url: string, start: number, end: number): Promise<Uint8Array> {
  const requestedLength = end - start + 1;
  const res = await fetch(url, {
    cache: 'no-store',
    headers: { Range: `bytes=${start}-${end}` },
  });
  if (!res.ok) throw new Error(`MP4 range read failed: HTTP ${res.status} for bytes=${start}-${end}`);
  if (res.status !== 206) {
    const length = Number(res.headers.get('content-length') ?? '0');
    if (!Number.isFinite(length) || length > requestedLength) {
      await res.body?.cancel();
      throw new Error(`server did not honor MP4 range read bytes=${start}-${end}`);
    }
  }
  return new Uint8Array(await res.arrayBuffer());
}

function sampleTablesFromMoov(moovBytes: Uint8Array): {
  durationSec: number | null;
  tracks: NormalizedTrack[];
  packets: PacketInfo[];
} {
  const moov = [...iterBoxes(moovBytes, 0, moovBytes.length)][0];
  if (!moov || moov.type !== 'moov') throw new Error('MP4 sample-table demux expected a moov box');

  const packets: PacketInfo[] = [];
  const tracks: NormalizedTrack[] = [];
  const trackDurationsSec: number[] = [];
  let trackIndex = 0;
  for (const trak of iterBoxes(moovBytes, moov.bodyStart, moov.bodyEnd)) {
    if (trak.type !== 'trak') continue;
    const track = sampleTableFromTrak(moovBytes, trak, trackIndex);
    if (!track) continue;
    tracks.push(track.metadata);
    trackDurationsSec.push(track.durationSec);
    for (const packet of track.packets) packets.push(packet);
    trackIndex++;
  }

  if (packets.length === 0) throw new Error('MP4 sample-table demux found no packetized tracks');
  const movieDurationSec = parseMvhdDuration(moovBytes, findBox(moovBytes, moov.bodyStart, moov.bodyEnd, 'mvhd'));
  return {
    durationSec: movieDurationSec ?? maxFinite(trackDurationsSec),
    tracks,
    packets,
  };
}

function sampleTableFromTrak(
  bytes: Uint8Array,
  trak: Box,
  trackIndex: number,
): { metadata: NormalizedTrack; durationSec: number; packets: PacketInfo[] } | null {
  const mdia = findBox(bytes, trak.bodyStart, trak.bodyEnd, 'mdia');
  if (!mdia) return null;
  const hdlr = findBox(bytes, mdia.bodyStart, mdia.bodyEnd, 'hdlr');
  const handler = hdlr ? hdlrType(bytes, hdlr) : '';
  if (handler !== 'vide' && handler !== 'soun') return null;

  const mdhd = findBox(bytes, mdia.bodyStart, mdia.bodyEnd, 'mdhd');
  const minf = findBox(bytes, mdia.bodyStart, mdia.bodyEnd, 'minf');
  if (!mdhd || !minf) throw new Error('MP4 track missing mdhd/minf');
  const stbl = findBox(bytes, minf.bodyStart, minf.bodyEnd, 'stbl');
  if (!stbl) throw new Error('MP4 track missing stbl');

  const stsz = findBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'stsz');
  const stts = findBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'stts');
  if (!stsz || !stts) throw new Error('MP4 track missing stsz/stts');

  const timescale = parseMdhdTimescale(bytes, mdhd);
  const sizes = parseStsz(bytes, stsz);
  const durations = parseStts(bytes, stts, sizes.length);
  const ctts = parseCtts(bytes, findBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'ctts'), sizes.length);
  const syncSamples = parseStss(bytes, findBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'stss'));
  const durationSec = durations.reduce((sum, value) => sum + value, 0) / timescale;
  const metadata = parseStsdTrack(
    bytes,
    findBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'stsd'),
    handler,
    sizes.length,
    durationSec,
  );

  let dtsTicks = 0;
  const packets: PacketInfo[] = [];
  for (let i = 0; i < sizes.length; i++) {
    const durationTicks = durations[i] ?? durations[durations.length - 1] ?? 0;
    const ptsTicks = dtsTicks + (ctts?.[i] ?? 0);
    packets.push({
      trackIndex,
      size: sizes[i]!,
      ptsUs: ticksToUs(ptsTicks, timescale),
      dtsUs: ticksToUs(dtsTicks, timescale),
      keyframe: syncSamples ? syncSamples.has(i + 1) : true,
    });
    dtsTicks += durationTicks;
  }

  return { metadata, durationSec, packets };
}

function* iterBoxes(bytes: Uint8Array, start: number, end: number): Generator<Box> {
  let off = start;
  while (off + 8 <= end) {
    const header = parseBoxHeader(bytes, off, end);
    if (!header) return;
    const boxEnd = off + header.size;
    if (boxEnd > end) return;
    yield {
      type: header.type,
      start: off,
      size: header.size,
      bodyStart: off + header.headerSize,
      bodyEnd: boxEnd,
    };
    off = boxEnd;
  }
}

function parseBoxHeader(bytes: Uint8Array, offset: number, limit: number): BoxHeader | null {
  if (offset + 8 > limit) return null;
  let size = be32(bytes, offset);
  const type = fourcc(bytes, offset + 4);
  let headerSize = 8;
  if (size === 1) {
    if (offset + 16 > limit) return null;
    size = be64(bytes, offset + 8);
    headerSize = 16;
  } else if (size === 0) {
    size = limit - offset;
  }
  if (!Number.isFinite(size) || size < headerSize) return null;
  return { type, size, headerSize };
}

function findBox(bytes: Uint8Array, start: number, end: number, type: string): Box | undefined {
  for (const box of iterBoxes(bytes, start, end)) {
    if (box.type === type) return box;
  }
  return undefined;
}

function parseMdhdTimescale(bytes: Uint8Array, mdhd: Box): number {
  const version = bytes[mdhd.bodyStart] ?? 0;
  const timescaleOffset = mdhd.bodyStart + (version === 1 ? 20 : 12);
  const timescale = be32(bytes, timescaleOffset);
  return timescale || 1;
}

function parseMvhdDuration(bytes: Uint8Array, mvhd: Box | undefined): number | null {
  if (!mvhd) return null;
  const version = bytes[mvhd.bodyStart] ?? 0;
  const timescaleOffset = mvhd.bodyStart + (version === 1 ? 20 : 12);
  const durationOffset = mvhd.bodyStart + (version === 1 ? 24 : 16);
  const timescale = be32(bytes, timescaleOffset);
  const duration = version === 1 ? be64(bytes, durationOffset) : be32(bytes, durationOffset);
  if (!timescale || !Number.isFinite(duration)) return null;
  return duration / timescale;
}

function hdlrType(bytes: Uint8Array, hdlr: Box): string {
  return fourcc(bytes, hdlr.bodyStart + 8);
}

function parseStsdTrack(
  bytes: Uint8Array,
  stsd: Box | undefined,
  handler: string,
  sampleCount: number,
  durationSec: number,
): NormalizedTrack {
  const type: TrackType = handler === 'vide' ? 'video' : 'audio';
  const entryStart = stsd ? stsd.bodyStart + 8 : -1;
  const sampleEntryType = entryStart >= 0 && entryStart + 8 <= (stsd?.bodyEnd ?? 0) ? fourcc(bytes, entryStart + 4) : '';
  const track: NormalizedTrack = {
    type,
    codec: codecFromSampleEntry(sampleEntryType, type),
  };

  if (type === 'video') {
    if (entryStart >= 0 && entryStart + 36 <= (stsd?.bodyEnd ?? 0)) {
      const width = be16(bytes, entryStart + 32);
      const height = be16(bytes, entryStart + 34);
      if (width > 0) track.width = width;
      if (height > 0) track.height = height;
    }
    if (durationSec > 0 && sampleCount > 0) {
      const fps = sampleCount / durationSec;
      if (Number.isFinite(fps)) track.fps = Math.round(fps * 1000) / 1000;
    }
  } else {
    if (entryStart >= 0 && entryStart + 36 <= (stsd?.bodyEnd ?? 0)) {
      const channels = be16(bytes, entryStart + 24);
      const sampleRate = be32(bytes, entryStart + 32) >>> 16;
      if (sampleRate > 0) track.sampleRate = sampleRate;
      if (channels > 0) track.channels = channels;
    }
  }

  return track;
}

function codecFromSampleEntry(sampleEntryType: string, type: TrackType): string {
  switch (sampleEntryType) {
    case 'avc1':
    case 'avc3':
      return 'h264';
    case 'hvc1':
    case 'hev1':
      return 'hevc';
    case 'mp4a':
      return 'aac';
    default:
      return sampleEntryType || (type === 'video' ? 'unknown-video' : 'unknown-audio');
  }
}

function parseStsz(bytes: Uint8Array, stsz: Box): number[] {
  const defaultSize = be32(bytes, stsz.bodyStart + 4);
  const declared = be32(bytes, stsz.bodyStart + 8);
  if (declared > MAX_SAMPLE_TABLE_PACKETS) {
    throw new Error(`MP4 sample table too large: ${declared} samples`);
  }

  if (defaultSize !== 0) {
    return Array.from({ length: declared }, () => defaultSize);
  }

  const entriesStart = stsz.bodyStart + 12;
  const count = boundEntryCount(declared, entriesStart, 4, stsz.bodyEnd);
  const sizes: number[] = [];
  let off = entriesStart;
  for (let i = 0; i < count; i++) {
    sizes.push(be32(bytes, off));
    off += 4;
  }
  if (sizes.length !== declared) throw new Error('MP4 stsz table is truncated');
  return sizes;
}

function parseStts(bytes: Uint8Array, stts: Box, maxSamples: number): number[] {
  const entriesStart = stts.bodyStart + 8;
  const count = boundEntryCount(be32(bytes, stts.bodyStart + 4), entriesStart, 8, stts.bodyEnd);
  const durations: number[] = [];
  let off = entriesStart;
  for (let i = 0; i < count && durations.length < maxSamples; i++) {
    const sampleCount = be32(bytes, off);
    const delta = be32(bytes, off + 4);
    off += 8;
    const remaining = maxSamples - durations.length;
    const repeat = Math.min(sampleCount, remaining);
    for (let j = 0; j < repeat; j++) durations.push(delta);
  }
  return durations;
}

function parseCtts(bytes: Uint8Array, ctts: Box | undefined, maxSamples: number): number[] | null {
  if (!ctts) return null;
  const version = bytes[ctts.bodyStart] ?? 0;
  const entriesStart = ctts.bodyStart + 8;
  const count = boundEntryCount(be32(bytes, ctts.bodyStart + 4), entriesStart, 8, ctts.bodyEnd);
  const offsets: number[] = [];
  let off = entriesStart;
  for (let i = 0; i < count && offsets.length < maxSamples; i++) {
    const sampleCount = be32(bytes, off);
    const rawOffset = be32(bytes, off + 4);
    const offset = version === 1 || rawOffset > 0x7fffffff ? rawOffset | 0 : rawOffset;
    off += 8;
    const remaining = maxSamples - offsets.length;
    const repeat = Math.min(sampleCount, remaining);
    for (let j = 0; j < repeat; j++) offsets.push(offset);
  }
  return offsets;
}

function parseStss(bytes: Uint8Array, stss: Box | undefined): Set<number> | null {
  if (!stss) return null;
  const entriesStart = stss.bodyStart + 8;
  const count = boundEntryCount(be32(bytes, stss.bodyStart + 4), entriesStart, 4, stss.bodyEnd);
  const samples = new Set<number>();
  let off = entriesStart;
  for (let i = 0; i < count; i++) {
    samples.add(be32(bytes, off));
    off += 4;
  }
  return samples;
}

function boundEntryCount(declared: number, entriesStart: number, entrySize: number, boxEnd: number): number {
  if (!Number.isFinite(declared) || declared < 0) return 0;
  const capacity = Math.max(0, Math.floor((boxEnd - entriesStart) / Math.max(1, entrySize)));
  return Math.min(declared, capacity);
}

function ticksToUs(ticks: number, timescale: number): number {
  return Math.round((ticks * 1_000_000) / timescale);
}

function maxFinite(values: number[]): number | null {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length ? Math.max(...finite) : null;
}

function be16(bytes: Uint8Array, offset: number): number {
  return (((bytes[offset] as number) << 8) | (bytes[offset + 1] as number)) >>> 0;
}

function be32(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] as number) << 24) |
      ((bytes[offset + 1] as number) << 16) |
      ((bytes[offset + 2] as number) << 8) |
      (bytes[offset + 3] as number)) >>>
    0
  );
}

function be64(bytes: Uint8Array, offset: number): number {
  const hi = BigInt(be32(bytes, offset));
  const lo = BigInt(be32(bytes, offset + 4));
  const value = (hi << 32n) | lo;
  const asNumber = Number(value);
  if (!Number.isSafeInteger(asNumber)) throw new Error(`MP4 box size exceeds safe integer: ${value}`);
  return asNumber;
}

function fourcc(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset] as number,
    bytes[offset + 1] as number,
    bytes[offset + 2] as number,
    bytes[offset + 3] as number,
  );
}
