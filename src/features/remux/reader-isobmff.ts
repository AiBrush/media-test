import {
  MAX_REMUX_SAMPLES,
  MAX_REMUX_TRACKS,
  ascii,
  canonicalCodec,
  safeSlice,
  u16be,
  u32be,
  u64beSafe,
} from './binary.ts';
import type { RemuxProgramEvidence, RemuxReadResult, RemuxSampleEvidence, RemuxTrackEvidence } from './types.ts';

interface Box {
  type: string;
  start: number;
  body: number;
  end: number;
  header: number;
}

interface EditTiming {
  mediaStart: number;
  presentationStartUs: number;
}

interface TrackTables {
  id: number;
  type: 'video' | 'audio' | 'subtitle' | 'other';
  codec: string;
  timescale: number;
  language?: string;
  width?: number;
  height?: number;
  sampleRate?: number;
  channels?: number;
  codecPrivate?: Uint8Array;
  nalLengthSize?: number;
  stbl: Box;
  edit?: EditTiming;
}

interface FragmentDefaults {
  duration?: number;
  size?: number;
  flags?: number;
}

const MAX_BOXES_PER_LEVEL = 1_000_000;

function boxes(bytes: Uint8Array, start: number, end: number): Box[] | undefined {
  const out: Box[] = [];
  let offset = start;
  while (offset < end) {
    if (out.length >= MAX_BOXES_PER_LEVEL || offset + 8 > end) return undefined;
    const size32 = u32be(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    let header = 8;
    let size: number | undefined = size32;
    if (size32 === 1) {
      if (offset + 16 > end) return undefined;
      size = u64beSafe(bytes, offset + 8);
      header = 16;
    } else if (size32 === 0) {
      size = end - offset;
    }
    if (size === undefined || size < header || offset + size > end) return undefined;
    out.push({ type, start: offset, body: offset + header, end: offset + size, header });
    offset += size;
  }
  return offset === end ? out : undefined;
}

function children(bytes: Uint8Array, parent: Box): Box[] | undefined {
  return boxes(bytes, parent.body, parent.end);
}

function child(bytes: Uint8Array, parent: Box, type: string): Box | undefined {
  return children(bytes, parent)?.find((box) => box.type === type);
}

function findPath(bytes: Uint8Array, root: Box, path: readonly string[]): Box | undefined {
  let current = root;
  for (const type of path) {
    const next = child(bytes, current, type);
    if (!next) return undefined;
    current = next;
  }
  return current;
}

function fullBoxVersion(bytes: Uint8Array, box: Box): number | undefined {
  return box.body + 4 <= box.end ? bytes[box.body] : undefined;
}

function parseMvhdTimescale(bytes: Uint8Array, moov: Box): number | undefined {
  const mvhd = child(bytes, moov, 'mvhd');
  if (!mvhd) return undefined;
  const version = fullBoxVersion(bytes, mvhd);
  const offset = version === 1 ? mvhd.body + 20 : mvhd.body + 12;
  return offset + 4 <= mvhd.end ? u32be(bytes, offset) || undefined : undefined;
}

function parseMdhd(bytes: Uint8Array, mdhd: Box): { timescale: number; language?: string } | undefined {
  const version = fullBoxVersion(bytes, mdhd);
  const timescaleOffset = version === 1 ? mdhd.body + 20 : mdhd.body + 12;
  const languageOffset = version === 1 ? mdhd.body + 32 : mdhd.body + 20;
  if (timescaleOffset + 4 > mdhd.end || languageOffset + 2 > mdhd.end) return undefined;
  const timescale = u32be(bytes, timescaleOffset);
  if (!timescale) return undefined;
  const packed = u16be(bytes, languageOffset);
  const chars = [((packed >> 10) & 0x1f) + 0x60, ((packed >> 5) & 0x1f) + 0x60, (packed & 0x1f) + 0x60];
  const language = chars.every((value) => value >= 0x61 && value <= 0x7a)
    ? String.fromCharCode(...chars)
    : undefined;
  return { timescale, ...(language && language !== 'und' ? { language } : {}) };
}

function parseTkhd(bytes: Uint8Array, tkhd: Box): { id: number; width?: number; height?: number } | undefined {
  const version = fullBoxVersion(bytes, tkhd);
  const idOffset = version === 1 ? tkhd.body + 20 : tkhd.body + 12;
  if (idOffset + 4 > tkhd.end) return undefined;
  const id = u32be(bytes, idOffset);
  if (!id) return undefined;
  const widthOffset = tkhd.end - 8;
  const width = widthOffset >= tkhd.body ? u32be(bytes, widthOffset) / 65536 : 0;
  const height = widthOffset >= tkhd.body ? u32be(bytes, widthOffset + 4) / 65536 : 0;
  return { id, ...(width > 0 ? { width } : {}), ...(height > 0 ? { height } : {}) };
}

function handlerType(bytes: Uint8Array, hdlr: Box): TrackTables['type'] | undefined {
  if (hdlr.body + 12 > hdlr.end) return undefined;
  const token = ascii(bytes, hdlr.body + 8, 4);
  if (token === 'vide') return 'video';
  if (token === 'soun') return 'audio';
  if (['subt', 'text', 'sbtl', 'clcp'].includes(token)) return 'subtitle';
  return 'other';
}

function entryChildren(bytes: Uint8Array, entry: Box, type: TrackTables['type']): Box[] | undefined {
  const header = type === 'video' ? 78 : type === 'audio' ? 28 : 8;
  if (entry.body + header > entry.end) return undefined;
  const start = entry.body + header;
  const exact = boxes(bytes, start, entry.end);
  if (exact) return exact;
  // QuickTime permits zero padding after the final sample-entry extension. Keep the enclosing file
  // parser strict while accepting only a bounded all-zero suffix here, so avcC/hvcC evidence is not
  // discarded merely because four alignment bytes follow the last child box.
  let trimmedEnd = entry.end;
  while (trimmedEnd > start && entry.end - trimmedEnd < 16 && bytes[trimmedEnd - 1] === 0) {
    trimmedEnd--;
  }
  return trimmedEnd < entry.end ? boxes(bytes, start, trimmedEnd) : undefined;
}

function parseSampleEntry(
  bytes: Uint8Array,
  stsd: Box,
  type: TrackTables['type'],
): Pick<TrackTables, 'codec' | 'sampleRate' | 'channels' | 'codecPrivate' | 'nalLengthSize'> | undefined {
  if (stsd.body + 8 > stsd.end || u32be(bytes, stsd.body + 4) < 1) return undefined;
  const entries = boxes(bytes, stsd.body + 8, stsd.end);
  const entry = entries?.[0];
  if (!entry) return undefined;
  let codec = canonicalCodec(entry.type);
  let channels: number | undefined;
  let sampleRate: number | undefined;
  if (type === 'audio' && entry.body + 28 <= entry.end) {
    channels = u16be(bytes, entry.body + 16) || undefined;
    sampleRate = (u32be(bytes, entry.body + 24) >>> 16) || undefined;
  }
  const sub = entryChildren(bytes, entry, type);
  const configType = codec === 'h264' ? 'avcC' : codec === 'hevc' ? 'hvcC' : codec === 'av1' ? 'av1C' : codec === 'vp9' ? 'vpcC' : codec === 'opus' ? 'dOps' : codec === 'flac' ? 'dfLa' : codec === 'aac' ? 'esds' : undefined;
  const config = configType ? sub?.find((box) => box.type === configType) : undefined;
  const codecPrivate = config ? bytes.subarray(config.body, config.end) : undefined;
  if (entry.type === 'mp4a' && codecPrivate) {
    const objectType = esdsObjectType(codecPrivate);
    if (objectType === 0x69 || objectType === 0x6b) codec = 'mp3';
    else if (objectType === 0x40 || objectType === 0x66 || objectType === 0x67 || objectType === 0x68) codec = 'aac';
  }
  if (codec === 'aac' && codecPrivate) {
    channels = aacLcChannelsFromEsds(codecPrivate) ?? channels;
  }
  const nalLengthSize = codec === 'h264' && codecPrivate && codecPrivate.byteLength >= 5
    ? (codecPrivate[4]! & 3) + 1
    : codec === 'hevc' && codecPrivate && codecPrivate.byteLength >= 22
      ? (codecPrivate[21]! & 3) + 1
      : undefined;
  return {
    codec,
    ...(sampleRate ? { sampleRate } : {}),
    ...(channels ? { channels } : {}),
    ...(codecPrivate ? { codecPrivate } : {}),
    ...(nalLengthSize ? { nalLengthSize } : {}),
  };
}

function esdsObjectType(bytes: Uint8Array): number | undefined {
  for (let at = 4; at < bytes.byteLength - 2; at++) {
    if (bytes[at] !== 0x04) continue;
    let cursor = at + 1;
    let length = 0;
    let octets = 0;
    while (cursor < bytes.byteLength && octets < 4) {
      const value = bytes[cursor++]!;
      length = (length << 7) | (value & 0x7f);
      octets++;
      if ((value & 0x80) === 0) break;
    }
    if (octets > 0 && length > 0 && cursor < bytes.byteLength) return bytes[cursor];
  }
  return undefined;
}

function decoderSpecificInfoFromEsds(bytes: Uint8Array): Uint8Array | undefined {
  for (let offset = 4; offset + 2 <= bytes.byteLength; offset++) {
    if (bytes[offset] !== 0x05) continue;
    let length = 0;
    let cursor = offset + 1;
    let complete = false;
    for (let octet = 0; octet < 4 && cursor < bytes.byteLength; octet++) {
      const value = bytes[cursor++]!;
      length = (length << 7) | (value & 0x7f);
      if ((value & 0x80) === 0) {
        complete = true;
        break;
      }
    }
    if (complete && length > 0 && length <= 64 && cursor + length <= bytes.byteLength) {
      return bytes.subarray(cursor, cursor + length);
    }
  }
  return undefined;
}

/** AAC-LC has no SBR/PS channel expansion, so its ASC channelConfiguration is authoritative. */
export function aacLcChannelsFromEsds(bytes: Uint8Array): number | undefined {
  const asc = decoderSpecificInfoFromEsds(bytes);
  if (!asc || asc.byteLength !== 2) return undefined;
  const audioObjectType = asc[0]! >> 3;
  if (audioObjectType !== 2) return undefined;
  const configuration = (asc[1]! >> 3) & 0x0f;
  return [undefined, 1, 2, 3, 4, 5, 6, 8][configuration];
}

function parseEdit(bytes: Uint8Array, trak: Box, movieTimescale: number): EditTiming | undefined {
  const elst = findPath(bytes, trak, ['edts', 'elst']);
  if (!elst || elst.body + 8 > elst.end) return undefined;
  const version = bytes[elst.body]!;
  const count = u32be(bytes, elst.body + 4);
  let at = elst.body + 8;
  let presentationStartUs = 0;
  for (let index = 0; index < count; index++) {
    const wide = version === 1;
    const entrySize = wide ? 20 : 12;
    if (at + entrySize > elst.end) return undefined;
    const segmentDuration = wide ? u64beSafe(bytes, at) : u32be(bytes, at);
    const mediaRaw = wide ? u64beSafe(bytes, at + 8) : u32be(bytes, at + 4);
    if (segmentDuration === undefined || mediaRaw === undefined) return undefined;
    const mediaTime = wide
      ? mediaRaw >= 2 ** 63 ? mediaRaw - 2 ** 64 : mediaRaw
      : mediaRaw >= 0x8000_0000 ? mediaRaw - 0x1_0000_0000 : mediaRaw;
    if (mediaTime === -1) presentationStartUs += Math.round((segmentDuration / movieTimescale) * 1_000_000);
    else if (mediaTime >= 0) return { mediaStart: mediaTime, presentationStartUs };
    at += entrySize;
  }
  return undefined;
}

function parseTracks(bytes: Uint8Array, moov: Box): TrackTables[] | undefined {
  const movieTimescale = parseMvhdTimescale(bytes, moov) ?? 1;
  const traks = children(bytes, moov)?.filter((box) => box.type === 'trak') ?? [];
  if (traks.length === 0 || traks.length > MAX_REMUX_TRACKS) return undefined;
  const out: TrackTables[] = [];
  for (const trak of traks) {
    const tkhd = child(bytes, trak, 'tkhd');
    const mdia = child(bytes, trak, 'mdia');
    const mdhd = mdia && child(bytes, mdia, 'mdhd');
    const hdlr = mdia && child(bytes, mdia, 'hdlr');
    const stbl = mdia && findPath(bytes, mdia, ['minf', 'stbl']);
    const stsd = stbl && child(bytes, stbl, 'stsd');
    if (!tkhd || !mdia || !mdhd || !hdlr || !stbl || !stsd) return undefined;
    const tk = parseTkhd(bytes, tkhd);
    const md = parseMdhd(bytes, mdhd);
    const type = handlerType(bytes, hdlr);
    if (!tk || !md || !type) return undefined;
    const sample = parseSampleEntry(bytes, stsd, type);
    if (!sample) return undefined;
    out.push({
      id: tk.id, type, timescale: md.timescale, stbl,
      ...(md.language ? { language: md.language } : {}),
      ...(tk.width ? { width: tk.width } : {}),
      ...(tk.height ? { height: tk.height } : {}),
      ...sample,
      ...(parseEdit(bytes, trak, movieTimescale) ? { edit: parseEdit(bytes, trak, movieTimescale) } : {}),
    });
  }
  return out;
}

function sampleSizes(bytes: Uint8Array, stbl: Box): number[] | undefined {
  const stsz = child(bytes, stbl, 'stsz');
  if (stsz) {
    if (stsz.body + 12 > stsz.end) return undefined;
    const fixed = u32be(bytes, stsz.body + 4);
    const count = u32be(bytes, stsz.body + 8);
    if (count > MAX_REMUX_SAMPLES) return undefined;
    if (fixed) return new Array(count).fill(fixed);
    if (stsz.body + 12 + count * 4 > stsz.end) return undefined;
    return Array.from({ length: count }, (_, index) => u32be(bytes, stsz.body + 12 + index * 4));
  }
  const stz2 = child(bytes, stbl, 'stz2');
  if (!stz2 || stz2.body + 12 > stz2.end) return undefined;
  const field = bytes[stz2.body + 7]!;
  const count = u32be(bytes, stz2.body + 8);
  if (count > MAX_REMUX_SAMPLES) return undefined;
  const at = stz2.body + 12;
  if (field === 8 && at + count <= stz2.end) return Array.from(bytes.subarray(at, at + count));
  if (field === 16 && at + count * 2 <= stz2.end) return Array.from({ length: count }, (_, i) => u16be(bytes, at + i * 2));
  if (field === 4 && at + Math.ceil(count / 2) <= stz2.end) {
    return Array.from({ length: count }, (_, i) => i & 1 ? bytes[at + (i >> 1)]! & 0xf : bytes[at + (i >> 1)]! >> 4);
  }
  return undefined;
}

function expandedRunTable(bytes: Uint8Array, box: Box, signedValue: boolean): number[] | undefined {
  if (box.body + 8 > box.end) return undefined;
  const count = u32be(bytes, box.body + 4);
  if (count > MAX_REMUX_SAMPLES || box.body + 8 + count * 8 > box.end) return undefined;
  const out: number[] = [];
  for (let index = 0; index < count; index++) {
    const at = box.body + 8 + index * 8;
    const repeat = u32be(bytes, at);
    let value = u32be(bytes, at + 4);
    if (signedValue && value >= 0x8000_0000) value -= 0x1_0000_0000;
    if (repeat > MAX_REMUX_SAMPLES || out.length + repeat > MAX_REMUX_SAMPLES) return undefined;
    for (let n = 0; n < repeat; n++) out.push(value);
  }
  return out;
}

function chunkOffsets(bytes: Uint8Array, stbl: Box): number[] | undefined {
  const stco = child(bytes, stbl, 'stco');
  const co64 = child(bytes, stbl, 'co64');
  const box = stco ?? co64;
  if (!box || box.body + 8 > box.end) return undefined;
  const count = u32be(bytes, box.body + 4);
  const width = co64 ? 8 : 4;
  if (count > MAX_REMUX_SAMPLES || box.body + 8 + count * width > box.end) return undefined;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const value = width === 8 ? u64beSafe(bytes, box.body + 8 + i * 8) : u32be(bytes, box.body + 8 + i * 4);
    if (value === undefined) return undefined;
    out.push(value);
  }
  return out;
}

function sampleOffsets(bytes: Uint8Array, stbl: Box, sizes: readonly number[]): number[] | undefined {
  const stsc = child(bytes, stbl, 'stsc');
  const chunks = chunkOffsets(bytes, stbl);
  if (!stsc || !chunks || stsc.body + 8 > stsc.end) return undefined;
  const count = u32be(bytes, stsc.body + 4);
  if (count === 0 || count > MAX_REMUX_SAMPLES || stsc.body + 8 + count * 12 > stsc.end) return undefined;
  const runs = Array.from({ length: count }, (_, i) => ({
    first: u32be(bytes, stsc.body + 8 + i * 12), perChunk: u32be(bytes, stsc.body + 12 + i * 12),
  }));
  if (runs[0]?.first !== 1 || runs.some((run) => run.perChunk === 0)) return undefined;
  const out: number[] = [];
  let sample = 0;
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunkNumber = chunkIndex + 1;
    let run = runs[0]!;
    for (let i = 1; i < runs.length && runs[i]!.first <= chunkNumber; i++) run = runs[i]!;
    let offset = chunks[chunkIndex]!;
    for (let n = 0; n < run.perChunk && sample < sizes.length; n++) {
      out.push(offset);
      offset += sizes[sample]!;
      sample++;
    }
  }
  return sample === sizes.length ? out : undefined;
}

function syncSamples(bytes: Uint8Array, stbl: Box, count: number): Set<number> | undefined {
  const stss = child(bytes, stbl, 'stss');
  if (!stss) return undefined;
  if (stss.body + 8 > stss.end) return new Set();
  const entries = u32be(bytes, stss.body + 4);
  if (entries > count || stss.body + 8 + entries * 4 > stss.end) return undefined;
  return new Set(Array.from({ length: entries }, (_, i) => u32be(bytes, stss.body + 8 + i * 4)));
}

function inMdat(offset: number, size: number, mdats: readonly Box[]): boolean {
  return mdats.some((mdat) => offset >= mdat.body && offset + size <= mdat.end);
}

function classicSamples(bytes: Uint8Array, track: TrackTables, mdats: readonly Box[]): RemuxSampleEvidence[] | undefined {
  const sizes = sampleSizes(bytes, track.stbl);
  const stts = child(bytes, track.stbl, 'stts');
  if (!sizes || !stts || sizes.some((size) => size <= 0)) return undefined;
  const durations = expandedRunTable(bytes, stts, false);
  if (!durations || durations.length !== sizes.length) return undefined;
  const ctts = child(bytes, track.stbl, 'ctts');
  // QuickTime/MOV and FFmpeg commonly store negative B-frame offsets as two's-complement int32 in
  // version-0 ctts despite ISO BMFF nominally declaring that version unsigned. Treat both classic
  // versions as signed, matching ffprobe and the suite's independent packet reader; a genuine
  // positive offset >= 2^31 ticks would imply an implausible multi-day presentation displacement.
  const offsets = ctts ? expandedRunTable(bytes, ctts, true) : new Array(sizes.length).fill(0);
  const positions = sampleOffsets(bytes, track.stbl, sizes);
  const sync = syncSamples(bytes, track.stbl, sizes.length);
  if (!offsets || offsets.length !== sizes.length || !positions) return undefined;
  const out: RemuxSampleEvidence[] = [];
  let dts = 0;
  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i]!;
    const fileOffset = positions[i]!;
    if (!inMdat(fileOffset, size, mdats)) return undefined;
    const payload = safeSlice(bytes, fileOffset, fileOffset + size);
    if (!payload) return undefined;
    const edit = track.edit;
    const toUs = (value: number): number => Math.round((value / track.timescale) * 1_000_000);
    const mediaStart = edit?.mediaStart ?? 0;
    const presentationStartUs = edit?.presentationStartUs ?? 0;
    out.push({
      payload,
      dtsUs: presentationStartUs + toUs(dts - mediaStart),
      ptsUs: presentationStartUs + toUs(dts + offsets[i]! - mediaStart),
      durationUs: toUs(durations[i]!),
      keyframe: sync ? sync.has(i + 1) : track.type === 'audio' ? true : undefined,
      fileOffset,
      framing: track.codec === 'h264' || track.codec === 'hevc' ? 'length-prefixed' : 'raw',
    });
    dts += durations[i]!;
  }
  return out;
}

function trexDefaults(bytes: Uint8Array, moov: Box): Map<number, FragmentDefaults> {
  const result = new Map<number, FragmentDefaults>();
  const mvex = child(bytes, moov, 'mvex');
  for (const trex of (mvex ? children(bytes, mvex) : []) ?? []) {
    if (trex.type !== 'trex' || trex.body + 24 > trex.end) continue;
    result.set(u32be(bytes, trex.body + 4), {
      duration: u32be(bytes, trex.body + 12) || undefined,
      size: u32be(bytes, trex.body + 16) || undefined,
      flags: u32be(bytes, trex.body + 20),
    });
  }
  return result;
}

function fragmentSamples(
  bytes: Uint8Array,
  top: readonly Box[],
  moov: Box,
  tracks: readonly TrackTables[],
  mdats: readonly Box[],
): Map<number, RemuxSampleEvidence[]> | undefined {
  const result = new Map<number, RemuxSampleEvidence[]>();
  const defaults = trexDefaults(bytes, moov);
  for (const moof of top.filter((box) => box.type === 'moof')) {
    for (const traf of children(bytes, moof)?.filter((box) => box.type === 'traf') ?? []) {
      const tfhd = child(bytes, traf, 'tfhd');
      if (!tfhd || tfhd.body + 8 > tfhd.end) return undefined;
      const flags = u32be(bytes, tfhd.body) & 0x00ff_ffff;
      const trackId = u32be(bytes, tfhd.body + 4);
      const track = tracks.find((entry) => entry.id === trackId);
      if (!track) return undefined;
      let at = tfhd.body + 8;
      let baseDataOffset = moof.start;
      if (flags & 0x000001) {
        const value = u64beSafe(bytes, at); if (value === undefined) return undefined;
        baseDataOffset = value; at += 8;
      }
      if (flags & 0x000002) at += 4;
      const inherited = defaults.get(trackId) ?? {};
      const defaultDuration = flags & 0x000008 ? u32be(bytes, at) : inherited.duration; if (flags & 0x000008) at += 4;
      const defaultSize = flags & 0x000010 ? u32be(bytes, at) : inherited.size; if (flags & 0x000010) at += 4;
      const defaultFlags = flags & 0x000020 ? u32be(bytes, at) : inherited.flags; if (flags & 0x000020) at += 4;
      if (at > tfhd.end) return undefined;
      const tfdt = child(bytes, traf, 'tfdt');
      let decodeTime = 0;
      if (tfdt) {
        const version = fullBoxVersion(bytes, tfdt);
        const value = version === 1 ? u64beSafe(bytes, tfdt.body + 4) : u32be(bytes, tfdt.body + 4);
        if (value === undefined) return undefined;
        decodeTime = value;
      }
      let implicitDataOffset = baseDataOffset;
      for (const trun of children(bytes, traf)?.filter((box) => box.type === 'trun') ?? []) {
        if (trun.body + 8 > trun.end) return undefined;
        const version = fullBoxVersion(bytes, trun);
        const trunFlags = u32be(bytes, trun.body) & 0x00ff_ffff;
        const count = u32be(bytes, trun.body + 4);
        if (count > MAX_REMUX_SAMPLES) return undefined;
        let cursor = trun.body + 8;
        let dataOffset = implicitDataOffset;
        if (trunFlags & 0x000001) {
          let signed = u32be(bytes, cursor); if (signed >= 0x8000_0000) signed -= 0x1_0000_0000;
          dataOffset = baseDataOffset + signed; cursor += 4;
        }
        const firstFlags = trunFlags & 0x000004 ? u32be(bytes, cursor) : undefined; if (trunFlags & 0x000004) cursor += 4;
        const list = result.get(trackId) ?? [];
        for (let i = 0; i < count; i++) {
          const duration = trunFlags & 0x000100 ? u32be(bytes, cursor) : defaultDuration; if (trunFlags & 0x000100) cursor += 4;
          const size = trunFlags & 0x000200 ? u32be(bytes, cursor) : defaultSize; if (trunFlags & 0x000200) cursor += 4;
          const sampleFlags = trunFlags & 0x000400 ? u32be(bytes, cursor) : i === 0 && firstFlags !== undefined ? firstFlags : defaultFlags; if (trunFlags & 0x000400) cursor += 4;
          let composition = 0;
          if (trunFlags & 0x000800) {
            composition = u32be(bytes, cursor); if (version === 1 && composition >= 0x8000_0000) composition -= 0x1_0000_0000;
            cursor += 4;
          }
          if (!duration || !size || cursor > trun.end || !inMdat(dataOffset, size, mdats)) return undefined;
          const payload = safeSlice(bytes, dataOffset, dataOffset + size); if (!payload) return undefined;
          const toUs = (value: number): number => Math.round((value / track.timescale) * 1_000_000);
          list.push({
            payload, dtsUs: toUs(decodeTime), ptsUs: toUs(decodeTime + composition), durationUs: toUs(duration),
            keyframe: sampleFlags !== undefined ? (sampleFlags & 0x0001_0000) === 0 : track.type === 'audio' ? true : undefined,
            fileOffset: dataOffset,
            framing: track.codec === 'h264' || track.codec === 'hevc' ? 'length-prefixed' : 'raw',
          });
          decodeTime += duration;
          dataOffset += size;
        }
        result.set(trackId, list);
        implicitDataOffset = dataOffset;
      }
    }
  }
  return result;
}

export function readIsoBmffProgram(bytes: Uint8Array, hint = 'mp4'): RemuxReadResult {
  const container = hint.toLowerCase() === 'mov' ? 'mov' : 'mp4';
  const evidence = { reader: 'isobmff-payload', byteLength: bytes?.byteLength ?? 0, detectedContainer: container } as const;
  try {
    if (!bytes || bytes.byteLength < 8) return { state: 'INCOMPLETE', reasonCode: 'REMUX_ISOBMFF_INPUT_INCOMPLETE', evidence };
    const top = boxes(bytes, 0, bytes.byteLength);
    if (!top) return { state: 'INCOMPLETE', reasonCode: 'REMUX_ISOBMFF_BOX_INCOMPLETE', evidence };
    const moov = top.find((box) => box.type === 'moov');
    const mdats = top.filter((box) => box.type === 'mdat');
    if (!moov || mdats.length === 0) return { state: 'MALFORMED', reasonCode: 'REMUX_ISOBMFF_REQUIRED_BOX_MISSING', evidence };
    const tables = parseTracks(bytes, moov);
    if (!tables) return { state: 'MALFORMED', reasonCode: 'REMUX_ISOBMFF_TRACK_TABLE_INVALID', evidence };
    const fragmented = top.some((box) => box.type === 'moof');
    const fragments = fragmented ? fragmentSamples(bytes, top, moov, tables, mdats) : undefined;
    if (fragmented && !fragments) return { state: 'MALFORMED', reasonCode: 'REMUX_ISOBMFF_FRAGMENT_INVALID', evidence };
    const tracks: RemuxTrackEvidence[] = [];
    for (const table of tables) {
      const samples = fragmented ? fragments?.get(table.id) : classicSamples(bytes, table, mdats);
      if (!samples || samples.length === 0) return { state: 'INCOMPLETE', reasonCode: 'REMUX_ISOBMFF_SAMPLES_INCOMPLETE', evidence };
      tracks.push({
        id: `isobmff:${table.id}`, type: table.type, codec: table.codec, timescale: table.timescale,
        ...(table.language ? { language: table.language } : {}),
        ...(table.width ? { width: table.width } : {}), ...(table.height ? { height: table.height } : {}),
        ...(table.sampleRate ? { sampleRate: table.sampleRate } : {}), ...(table.channels ? { channels: table.channels } : {}),
        ...(table.codecPrivate ? { codecPrivate: table.codecPrivate } : {}), samples,
      });
    }
    let minimumPtsUs = Number.POSITIVE_INFINITY;
    let maximumEndUs = Number.NEGATIVE_INFINITY;
    for (const track of tracks) {
      for (const sample of track.samples) {
        if (sample.ptsUs === undefined) continue;
        minimumPtsUs = Math.min(minimumPtsUs, sample.ptsUs);
        maximumEndUs = Math.max(maximumEndUs, sample.ptsUs + (sample.durationUs ?? 0));
      }
    }
    const durationUs = Number.isFinite(minimumPtsUs) && Number.isFinite(maximumEndUs)
      ? maximumEndUs - minimumPtsUs
      : undefined;
    const parsedSamples = tracks.reduce((sum, track) => sum + track.samples.length, 0);
    const value: RemuxProgramEvidence = {
      schema: 'media-test/remux-program@1', container, byteLength: bytes.byteLength,
      ...(durationUs !== undefined && durationUs >= 0 ? { durationUs } : {}),
      tracks, representation: { fragmented },
    };
    return { state: 'OK', value, evidence: { ...evidence, parsedTracks: tracks.length, parsedSamples } };
  } catch {
    return { state: 'MALFORMED', reasonCode: 'REMUX_ISOBMFF_PARSE_GUARD', evidence };
  }
}
