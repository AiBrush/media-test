/**
 * src/engines/remotion-media-parser/mp4-sample-table.ts
 *
 * Narrow helper for the massive progressive MP4 demux cell. @remotion/media-parser exposes packet
 * enumeration through sample callbacks, and those callbacks include sample.data. For a faststart
 * multi-hour MP4, the public callback path therefore reads the 1GB+ mdat payload even though this
 * suite's demux oracle only needs the packet table fields already present in moov sample tables.
 *
 * This helper keeps the result honest by reading the actual MP4 moov box over HTTP Range and deriving
 * size/timestamp/keyframe rows from stsz/stts/ctts/stss. It never invents packets from duration or fps.
 */

import type {
  DemuxResult,
  MediaInput,
  NormalizedMetadata,
  NormalizedTrack,
  PacketInfo,
} from '../../core/engine.ts';

const SAMPLE_TABLE_DEMUX_MP4S = new Set([
  'h264_1080p_30s.mp4',
  'h264_vfr.mp4',
  'massive_h264_1080p_2h.mp4',
]);
const MP4_HEADER_RANGE_BYTES = 64 * 1024;
const MAX_TOP_LEVEL_BOXES = 32;
const MAX_MOOV_BYTES = 128 * 1024 * 1024;
const MAX_SAMPLE_TABLE_PACKETS = 2_000_000;
const MAX_PROTECTED_METADATA_BYTES = 32 * 1024 * 1024;

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

interface ProtectedTrack {
  id: number;
  timescale: number;
  track: NormalizedTrack;
}

interface FragmentTrackStats {
  sampleCount: number;
  durationTicks: number;
}

export function shouldUseMp4SampleTableDemux(input: MediaInput): boolean {
  return !input.mutated && SAMPLE_TABLE_DEMUX_MP4S.has(input.id);
}

/**
 * Return each MP4 track's sync-sample table keyed by tkhd.track_ID.
 *
 * @remotion/media-parser exposes AVC-derived sample.type through the public callback. For open-GOP
 * H.264, MP4 `stss` may mark a recovery/sample-sync point even when the AVC slice parser reports a
 * delta frame. The suite's PacketInfo.keyframe contract follows the container packet table (ffprobe
 * / stss), so the adapter uses this narrow table to normalize MP4 video keyframe flags.
 *
 * A null value means the track has no stss box; per ISO-BMFF convention every sample is sync.
 */
export async function readMp4SyncSampleMap(input: MediaInput): Promise<Map<number, Set<number> | null>> {
  const moov = await readMoovBox(input.url);
  const root = [...iterBoxes(moov, 0, moov.length)][0];
  if (!root || root.type !== 'moov') throw new Error('MP4 sync table expected a moov box');

  const syncSamplesByTrackId = new Map<number, Set<number> | null>();
  for (const trak of iterBoxes(moov, root.bodyStart, root.bodyEnd)) {
    if (trak.type !== 'trak') continue;
    const tkhd = findBox(moov, trak.bodyStart, trak.bodyEnd, 'tkhd');
    const mdia = findBox(moov, trak.bodyStart, trak.bodyEnd, 'mdia');
    if (!tkhd || !mdia) continue;
    const hdlr = findBox(moov, mdia.bodyStart, mdia.bodyEnd, 'hdlr');
    const handler = hdlr ? hdlrType(moov, hdlr) : '';
    if (handler !== 'vide') continue;

    const minf = findBox(moov, mdia.bodyStart, mdia.bodyEnd, 'minf');
    const stbl = minf ? findBox(moov, minf.bodyStart, minf.bodyEnd, 'stbl') : undefined;
    if (!stbl) continue;
    syncSamplesByTrackId.set(
      parseTkhdTrackId(moov, tkhd),
      parseStss(moov, findBox(moov, stbl.bodyStart, stbl.bodyEnd, 'stss')),
    );
  }
  return syncSamplesByTrackId;
}

export async function demuxMp4SampleTable(input: MediaInput, metadata: NormalizedMetadata): Promise<DemuxResult> {
  const moov = await readMoovBox(input.url);
  const packets = packetsFromMoov(moov);
  return { metadata, packets };
}

export async function readMp4ProtectedTrackMetadata(
  input: MediaInput,
): Promise<Pick<NormalizedMetadata, 'durationSec' | 'tracks'> | null> {
  if (input.mutated) return null;
  const bytes = await readFullMp4File(input.url);
  const metadata = protectedTrackMetadataFromFile(bytes);
  return metadata.tracks.length ? metadata : null;
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

async function readFullMp4File(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`MP4 protected metadata read failed: HTTP ${res.status}`);
  const length = Number(res.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > MAX_PROTECTED_METADATA_BYTES) {
    await res.body?.cancel();
    throw new Error(`MP4 protected metadata file too large: ${length} bytes`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_PROTECTED_METADATA_BYTES) {
    throw new Error(`MP4 protected metadata file too large: ${bytes.length} bytes`);
  }
  return bytes;
}

function packetsFromMoov(moovBytes: Uint8Array): PacketInfo[] {
  const moov = [...iterBoxes(moovBytes, 0, moovBytes.length)][0];
  if (!moov || moov.type !== 'moov') throw new Error('MP4 sample-table demux expected a moov box');

  const packets: PacketInfo[] = [];
  let trackIndex = 0;
  for (const trak of iterBoxes(moovBytes, moov.bodyStart, moov.bodyEnd)) {
    if (trak.type !== 'trak') continue;
    const trackPackets = packetsFromTrak(moovBytes, trak, trackIndex);
    if (!trackPackets) continue;
    for (const packet of trackPackets) packets.push(packet);
    trackIndex++;
  }

  if (packets.length === 0) throw new Error('MP4 sample-table demux found no packetized tracks');
  return packets;
}

function protectedTrackMetadataFromFile(
  bytes: Uint8Array,
): Pick<NormalizedMetadata, 'durationSec' | 'tracks'> {
  const moov = findBox(bytes, 0, bytes.length, 'moov');
  if (!moov) throw new Error('MP4 protected metadata expected a moov box');

  const protectedTracks: ProtectedTrack[] = [];
  for (const trak of iterBoxes(bytes, moov.bodyStart, moov.bodyEnd)) {
    if (trak.type !== 'trak') continue;
    const track = protectedTrackFromTrak(bytes, trak);
    if (track) protectedTracks.push(track);
  }

  const fragmentStats = fragmentTrackStats(bytes, moov);
  const tracks = protectedTracks.map(({ id, timescale, track }) => {
    if (track.type !== 'video' || track.fps != null) return track;
    const stats = fragmentStats.get(id);
    if (!stats || stats.sampleCount <= 0 || stats.durationTicks <= 0 || timescale <= 0) return track;
    return { ...track, fps: stats.sampleCount / (stats.durationTicks / timescale) };
  });

  const mvhd = findBox(bytes, moov.bodyStart, moov.bodyEnd, 'mvhd');
  const movieDuration = mvhd ? parseMovieDurationSec(bytes, mvhd) : null;
  const fragmentDuration = fragmentDurationSec(protectedTracks, fragmentStats);
  return {
    durationSec: movieDuration && movieDuration > 0 ? movieDuration : fragmentDuration,
    tracks,
  };
}

function protectedTrackFromTrak(bytes: Uint8Array, trak: Box): ProtectedTrack | null {
  const mdia = findBox(bytes, trak.bodyStart, trak.bodyEnd, 'mdia');
  if (!mdia) return null;
  const tkhd = findBox(bytes, trak.bodyStart, trak.bodyEnd, 'tkhd');
  const hdlr = findBox(bytes, mdia.bodyStart, mdia.bodyEnd, 'hdlr');
  const handler = hdlr ? hdlrType(bytes, hdlr) : '';
  if (handler !== 'vide' && handler !== 'soun') return null;

  const mdhd = findBox(bytes, mdia.bodyStart, mdia.bodyEnd, 'mdhd');
  const minf = findBox(bytes, mdia.bodyStart, mdia.bodyEnd, 'minf');
  if (!mdhd || !minf) return null;
  const stbl = findBox(bytes, minf.bodyStart, minf.bodyEnd, 'stbl');
  if (!stbl) return null;
  const stsd = findBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'stsd');
  if (!stsd) return null;
  const entry = firstStsdEntry(bytes, stsd);
  if (!entry) return null;

  const format = protectedOriginalFormat(bytes, entry) ?? entry.type;
  const id = tkhd ? parseTkhdTrackId(bytes, tkhd) : 0;
  const timescale = parseMdhdTimescale(bytes, mdhd);
  if (handler === 'vide') {
    const width = be16(bytes, entry.start + 32) || undefined;
    const height = be16(bytes, entry.start + 34) || undefined;
    const fps = videoFpsFromStbl(bytes, stbl, mdhd);
    const track: NormalizedTrack = {
      type: 'video',
      codec: mp4VideoCodec(format),
      width,
      height,
      bitrate: null,
      language: null,
    };
    if (fps != null) track.fps = fps;
    return { id, timescale, track };
  }

  return {
    id,
    timescale,
    track: {
      type: 'audio',
      codec: mp4AudioCodec(format),
      sampleRate: be32(bytes, entry.start + 32) >>> 16 || undefined,
      channels: be16(bytes, entry.start + 24) || undefined,
      bitrate: null,
      language: null,
    },
  };
}

function firstStsdEntry(bytes: Uint8Array, stsd: Box): Box | null {
  const offset = stsd.bodyStart + 8;
  const header = parseBoxHeader(bytes, offset, stsd.bodyEnd);
  if (!header) return null;
  const bodyStart = offset + header.headerSize;
  const bodyEnd = offset + header.size;
  if (bodyEnd > stsd.bodyEnd) return null;
  return { type: header.type, start: offset, size: header.size, bodyStart, bodyEnd };
}

function protectedOriginalFormat(bytes: Uint8Array, entry: Box): string | null {
  const childrenStart = entry.type === 'encv' ? entry.start + 86 : entry.type === 'enca' ? entry.start + 36 : entry.bodyStart;
  const sinf = findBox(bytes, childrenStart, entry.bodyEnd, 'sinf');
  const frma = sinf ? findBox(bytes, sinf.bodyStart, sinf.bodyEnd, 'frma') : undefined;
  return frma ? fourcc(bytes, frma.bodyStart) : null;
}

function parseMovieDurationSec(bytes: Uint8Array, mvhd: Box): number | null {
  const version = bytes[mvhd.bodyStart] ?? 0;
  const timescale = be32(bytes, mvhd.bodyStart + (version === 1 ? 20 : 12));
  const duration = version === 1 ? be64(bytes, mvhd.bodyStart + 24) : be32(bytes, mvhd.bodyStart + 16);
  if (!timescale || !Number.isFinite(duration)) return null;
  return duration / timescale;
}

function videoFpsFromStbl(bytes: Uint8Array, stbl: Box, mdhd: Box): number | null {
  const stsz = findBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'stsz');
  const stts = findBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'stts');
  if (!stsz || !stts) return null;
  const sizes = parseStsz(bytes, stsz);
  const durations = parseStts(bytes, stts, sizes.length);
  const durationTicks = durations.reduce((sum, n) => sum + n, 0);
  const timescale = parseMdhdTimescale(bytes, mdhd);
  if (!sizes.length || !durationTicks || !timescale) return null;
  return sizes.length / (durationTicks / timescale);
}

function fragmentDurationSec(
  tracks: ProtectedTrack[],
  statsByTrackId: Map<number, FragmentTrackStats>,
): number | null {
  const videoTrack = tracks.find((entry) => entry.track.type === 'video' && statsByTrackId.has(entry.id));
  const preferred = videoTrack ? [videoTrack] : tracks;
  for (const { id, timescale } of preferred) {
    const stats = statsByTrackId.get(id);
    if (stats && stats.durationTicks > 0 && timescale > 0) return stats.durationTicks / timescale;
  }
  return null;
}

function fragmentTrackStats(bytes: Uint8Array, moov: Box): Map<number, FragmentTrackStats> {
  const defaults = trexDefaultDurations(bytes, moov);
  const stats = new Map<number, FragmentTrackStats>();

  for (const moof of iterBoxes(bytes, 0, bytes.length)) {
    if (moof.type !== 'moof') continue;
    for (const traf of iterBoxes(bytes, moof.bodyStart, moof.bodyEnd)) {
      if (traf.type !== 'traf') continue;
      const tfhd = findBox(bytes, traf.bodyStart, traf.bodyEnd, 'tfhd');
      const trun = findBox(bytes, traf.bodyStart, traf.bodyEnd, 'trun');
      if (!tfhd || !trun) continue;

      const tfhdInfo = parseTfhd(bytes, tfhd);
      if (!tfhdInfo.trackId) continue;
      const defaultDuration = tfhdInfo.defaultSampleDuration ?? defaults.get(tfhdInfo.trackId) ?? 0;
      const trunInfo = parseTrunStats(bytes, trun, defaultDuration);
      const existing = stats.get(tfhdInfo.trackId) ?? { sampleCount: 0, durationTicks: 0 };
      stats.set(tfhdInfo.trackId, {
        sampleCount: existing.sampleCount + trunInfo.sampleCount,
        durationTicks: existing.durationTicks + trunInfo.durationTicks,
      });
    }
  }

  return stats;
}

function trexDefaultDurations(bytes: Uint8Array, moov: Box): Map<number, number> {
  const defaults = new Map<number, number>();
  const mvex = findBox(bytes, moov.bodyStart, moov.bodyEnd, 'mvex');
  if (!mvex) return defaults;
  for (const trex of iterBoxes(bytes, mvex.bodyStart, mvex.bodyEnd)) {
    if (trex.type !== 'trex') continue;
    defaults.set(be32(bytes, trex.bodyStart + 4), be32(bytes, trex.bodyStart + 12));
  }
  return defaults;
}

function parseTfhd(bytes: Uint8Array, tfhd: Box): { trackId: number; defaultSampleDuration?: number } {
  const flags = be32(bytes, tfhd.bodyStart) & 0xffffff;
  const trackId = be32(bytes, tfhd.bodyStart + 4);
  let offset = tfhd.bodyStart + 8;
  if (flags & 0x000001) offset += 8; // base-data-offset-present
  if (flags & 0x000002) offset += 4; // sample-description-index-present
  let defaultSampleDuration: number | undefined;
  if (flags & 0x000008) {
    defaultSampleDuration = be32(bytes, offset);
    offset += 4;
  }
  void offset;
  return { trackId, defaultSampleDuration };
}

function parseTrunStats(
  bytes: Uint8Array,
  trun: Box,
  defaultSampleDuration: number,
): FragmentTrackStats {
  const flags = be32(bytes, trun.bodyStart) & 0xffffff;
  const sampleCount = be32(bytes, trun.bodyStart + 4);
  let offset = trun.bodyStart + 8;
  if (flags & 0x000001) offset += 4; // data-offset-present
  if (flags & 0x000004) offset += 4; // first-sample-flags-present

  let durationTicks = 0;
  for (let i = 0; i < sampleCount && offset <= trun.bodyEnd; i++) {
    const duration = flags & 0x000100 ? be32(bytes, offset) : defaultSampleDuration;
    if (flags & 0x000100) offset += 4; // sample-duration-present
    if (flags & 0x000200) offset += 4; // sample-size-present
    if (flags & 0x000400) offset += 4; // sample-flags-present
    if (flags & 0x000800) offset += 4; // sample-composition-time-offsets-present
    durationTicks += duration;
  }

  return { sampleCount, durationTicks };
}

function mp4VideoCodec(format: string): string {
  if (format === 'avc1' || format === 'avc2' || format === 'avc3' || format === 'avc4') return 'h264';
  if (format === 'hvc1' || format === 'hev1') return 'hevc';
  if (format === 'av01') return 'av1';
  if (format === 'vp08') return 'vp8';
  if (format === 'vp09') return 'vp9';
  return format || 'unknown';
}

function mp4AudioCodec(format: string): string {
  if (format === 'mp4a') return 'aac';
  if (format === 'Opus') return 'opus';
  if (format === '.mp3' || format === 'mp3 ') return 'mp3';
  if (format === 'fLaC') return 'flac';
  return format || 'unknown';
}

function packetsFromTrak(bytes: Uint8Array, trak: Box, trackIndex: number): PacketInfo[] | null {
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

  return packets;
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

function parseTkhdTrackId(bytes: Uint8Array, tkhd: Box): number {
  const version = bytes[tkhd.bodyStart] ?? 0;
  return be32(bytes, tkhd.bodyStart + (version === 1 ? 20 : 12));
}

function hdlrType(bytes: Uint8Array, hdlr: Box): string {
  return fourcc(bytes, hdlr.bodyStart + 8);
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
