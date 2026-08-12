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
import { mp3FrameAudioConfig } from './reader-mp3.ts';

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
  presentationDurationUs: number;
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

export interface IsoBmffRangeSource {
  readonly size: number;
  range(start: number, end: number, signal?: AbortSignal): Promise<Uint8Array>;
}

export interface IsoBmffRangeSampleEvidence extends Omit<RemuxSampleEvidence, 'payload'> {
  readonly byteLength: number;
  readonly fileOffset: number;
}

export interface IsoBmffRangeTrackEvidence extends Omit<RemuxTrackEvidence, 'samples'> {
  readonly samples: readonly IsoBmffRangeSampleEvidence[];
}

export interface IsoBmffRangeProgramEvidence
  extends Omit<RemuxProgramEvidence, 'tracks'> {
  readonly tracks: readonly IsoBmffRangeTrackEvidence[];
}

export type IsoBmffRangeReadResult =
  | Readonly<{ state: 'OK'; value: IsoBmffRangeProgramEvidence }>
  | Readonly<{
      state: 'UNSUPPORTED_STRUCTURE' | 'MALFORMED' | 'INCOMPLETE';
      reasonCode: string;
    }>;

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

export function parseIsoAudioSampleEntryHeader(
  bytes: Uint8Array,
  bodyStart: number,
  bodyEnd: number,
): { headerBytes: number; sampleRate?: number; channels?: number } | undefined {
  if (bodyStart < 0 || bodyEnd > bytes.byteLength || bodyStart + 28 > bodyEnd) return undefined;
  const version = u16be(bytes, bodyStart + 8);
  let headerBytes = 28;
  let channels = u16be(bytes, bodyStart + 16) || undefined;
  let sampleRate = (u32be(bytes, bodyStart + 24) >>> 16) || undefined;

  if (version === 1) {
    headerBytes = 44;
  } else if (version === 2) {
    // QuickTime AudioSampleEntry v2 replaces the legacy 16.16 rate/channel placeholders with a
    // 64-bit float rate and a 32-bit channel count in its 36-byte extension.
    headerBytes = 64;
    if (bodyStart + headerBytes > bodyEnd) return undefined;
    const view = new DataView(bytes.buffer, bytes.byteOffset + bodyStart + 32, 8);
    const extendedRate = view.getFloat64(0, false);
    const extendedChannels = u32be(bytes, bodyStart + 40);
    sampleRate = Number.isFinite(extendedRate) && extendedRate > 0 && extendedRate <= 1_000_000
      ? Math.round(extendedRate)
      : undefined;
    channels = extendedChannels > 0 && extendedChannels <= 256 ? extendedChannels : undefined;
  } else if (version !== 0) {
    return undefined;
  }

  if (bodyStart + headerBytes > bodyEnd) return undefined;
  return {
    headerBytes,
    ...(sampleRate ? { sampleRate } : {}),
    ...(channels ? { channels } : {}),
  };
}

export function parseIsoVisualSampleEntryHeader(
  bytes: Uint8Array,
  bodyStart: number,
  bodyEnd: number,
): { headerBytes: 78; width?: number; height?: number } | undefined {
  const headerBytes = 78 as const;
  if (bodyStart < 0 || bodyEnd > bytes.byteLength || bodyStart + headerBytes > bodyEnd) return undefined;
  const width = u16be(bytes, bodyStart + 24) || undefined;
  const height = u16be(bytes, bodyStart + 26) || undefined;
  return {
    headerBytes,
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
  };
}

function paddedChildBoxes(bytes: Uint8Array, start: number, end: number): Box[] | undefined {
  const exact = boxes(bytes, start, end);
  if (exact) return exact;
  let trimmedEnd = end;
  while (trimmedEnd > start && end - trimmedEnd < 16 && bytes[trimmedEnd - 1] === 0) {
    trimmedEnd--;
  }
  return trimmedEnd < end ? boxes(bytes, start, trimmedEnd) : undefined;
}

function entryChildren(bytes: Uint8Array, entry: Box, type: TrackTables['type']): Box[] | undefined {
  const header = type === 'video'
    ? parseIsoVisualSampleEntryHeader(bytes, entry.body, entry.end)?.headerBytes
    : type === 'audio'
      ? parseIsoAudioSampleEntryHeader(bytes, entry.body, entry.end)?.headerBytes
      : 8;
  if (header === undefined) return undefined;
  if (entry.body + header > entry.end) return undefined;
  const start = entry.body + header;
  // QuickTime permits zero padding after the final sample-entry extension. Keep the enclosing file
  // parser strict while accepting only a bounded all-zero suffix here, so avcC/hvcC evidence is not
  // discarded merely because four alignment bytes follow the last child box.
  return paddedChildBoxes(bytes, start, entry.end);
}

function parseSampleEntry(
  bytes: Uint8Array,
  stsd: Box,
  type: TrackTables['type'],
): Pick<TrackTables, 'codec' | 'sampleRate' | 'channels' | 'width' | 'height' | 'codecPrivate' | 'nalLengthSize'> | undefined {
  if (stsd.body + 8 > stsd.end || u32be(bytes, stsd.body + 4) < 1) return undefined;
  const entries = boxes(bytes, stsd.body + 8, stsd.end);
  const entry = entries?.[0];
  if (!entry) return undefined;
  let codec = canonicalCodec(entry.type);
  let channels: number | undefined;
  let sampleRate: number | undefined;
  let width: number | undefined;
  let height: number | undefined;
  if (type === 'video') {
    const header = parseIsoVisualSampleEntryHeader(bytes, entry.body, entry.end);
    width = header?.width;
    height = header?.height;
  }
  if (type === 'audio' && entry.body + 28 <= entry.end) {
    const header = parseIsoAudioSampleEntryHeader(bytes, entry.body, entry.end);
    channels = header?.channels;
    sampleRate = header?.sampleRate;
  }
  const sub = entryChildren(bytes, entry, type);
  const configType = codec === 'h264' ? 'avcC' : codec === 'hevc' ? 'hvcC' : codec === 'av1' ? 'av1C' : codec === 'vp9' ? 'vpcC' : codec === 'opus' ? 'dOps' : codec === 'flac' ? 'dfLa' : codec === 'aac' ? 'esds' : undefined;
  const wave = sub?.find((box) => box.type === 'wave');
  const waveChildren = wave ? paddedChildBoxes(bytes, wave.body, wave.end) : undefined;
  const config = configType
    ? [...(sub ?? []), ...(waveChildren ?? [])].find((box) => box.type === configType)
    : undefined;
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
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
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

const AAC_SAMPLE_RATES = [
  96_000, 88_200, 64_000, 48_000, 44_100, 32_000, 24_000,
  22_050, 16_000, 12_000, 11_025, 8_000, 7_350,
] as const;

export interface AacAudioSpecificConfig {
  readonly audioObjectType: number;
  readonly coreSampleRate: number;
  readonly presentationSampleRate: number;
  readonly channelConfiguration: number;
  readonly sbrPresent: boolean;
  readonly psPresent: boolean;
}

/** Reads the explicit AAC/SBR rate relationship carried by an ISO-BMFF esds descriptor. */
export function aacAudioSpecificConfigFromEsds(bytes: Uint8Array): AacAudioSpecificConfig | undefined {
  const asc = decoderSpecificInfoFromEsds(bytes);
  if (!asc) return undefined;
  let bitOffset = 0;
  const bits = (count: number): number | undefined => {
    if (count < 1 || bitOffset + count > asc.byteLength * 8) return undefined;
    let value = 0;
    for (let index = 0; index < count; index++) {
      value = value * 2 + ((asc[bitOffset >> 3]! >> (7 - (bitOffset & 7))) & 1);
      bitOffset++;
    }
    return value;
  };
  const objectType = (): number | undefined => {
    const base = bits(5);
    if (base === undefined) return undefined;
    if (base !== 31) return base;
    const extension = bits(6);
    return extension === undefined ? undefined : 32 + extension;
  };
  const sampleRate = (): number | undefined => {
    const index = bits(4);
    if (index === undefined) return undefined;
    if (index === 15) {
      const explicit = bits(24);
      return explicit && explicit <= 1_000_000 ? explicit : undefined;
    }
    return AAC_SAMPLE_RATES[index];
  };

  const signaledObjectType = objectType();
  const signaledRate = sampleRate();
  const channelConfiguration = bits(4);
  if (!signaledObjectType || !signaledRate || channelConfiguration === undefined) return undefined;
  if (signaledObjectType === 5 || signaledObjectType === 29) {
    const presentationSampleRate = sampleRate();
    const coreObjectType = objectType();
    if (!presentationSampleRate || !coreObjectType) return undefined;
    return {
      audioObjectType: coreObjectType,
      coreSampleRate: signaledRate,
      presentationSampleRate,
      channelConfiguration,
      sbrPresent: true,
      psPresent: signaledObjectType === 29,
    };
  }
  return {
    audioObjectType: signaledObjectType,
    coreSampleRate: signaledRate,
    presentationSampleRate: signaledRate,
    channelConfiguration,
    sbrPresent: false,
    psPresent: false,
  };
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
  if (!elst || elst.body + 8 > elst.end || movieTimescale <= 0) return undefined;
  const version = bytes[elst.body]!;
  const count = u32be(bytes, elst.body + 4);
  if ((version !== 0 && version !== 1) || count === 0 || count > 10_000) return undefined;
  let at = elst.body + 8;
  let presentationTicks = 0;
  let presentationStartUs: number | undefined;
  let mediaStart: number | undefined;
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
    const rateOffset = at + (wide ? 16 : 8);
    if (u16be(bytes, rateOffset) !== 1 || u16be(bytes, rateOffset + 2) !== 0) return undefined;
    if (mediaTime < -1) return undefined;
    if (mediaTime >= 0) {
      // A single media edit, optionally preceded by an empty edit, is the lossless presentation mapping
      // this reader can apply to every coded sample without inventing concatenation semantics.
      if (mediaStart !== undefined) return undefined;
      mediaStart = mediaTime;
      presentationStartUs = Math.round((presentationTicks / movieTimescale) * 1_000_000);
    }
    presentationTicks += segmentDuration;
    at += entrySize;
  }
  return mediaStart !== undefined && presentationStartUs !== undefined && presentationTicks > 0
    ? {
        mediaStart,
        presentationStartUs,
        presentationDurationUs: Math.round((presentationTicks / movieTimescale) * 1_000_000),
      }
    : undefined;
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
      ...(sample.width ?? tk.width ? { width: sample.width ?? tk.width } : {}),
      ...(sample.height ?? tk.height ? { height: sample.height ?? tk.height } : {}),
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

function classicRangeSamples(
  bytes: Uint8Array,
  track: TrackTables,
  mdats: readonly Box[],
): IsoBmffRangeSampleEvidence[] | undefined {
  const sizes = sampleSizes(bytes, track.stbl);
  const stts = child(bytes, track.stbl, 'stts');
  if (!sizes || !stts || sizes.some((size) => size <= 0)) return undefined;
  const durations = expandedRunTable(bytes, stts, false);
  if (!durations || durations.length !== sizes.length) return undefined;
  const ctts = child(bytes, track.stbl, 'ctts');
  const offsets = ctts ? expandedRunTable(bytes, ctts, true) : new Array(sizes.length).fill(0);
  const positions = sampleOffsets(bytes, track.stbl, sizes);
  const sync = syncSamples(bytes, track.stbl, sizes.length);
  if (!offsets || offsets.length !== sizes.length || !positions) return undefined;
  const out: IsoBmffRangeSampleEvidence[] = [];
  let dts = 0;
  for (let index = 0; index < sizes.length; index++) {
    const byteLength = sizes[index]!;
    const fileOffset = positions[index]!;
    if (!inMdat(fileOffset, byteLength, mdats)) return undefined;
    const edit = track.edit;
    const toUs = (value: number): number =>
      Math.round((value / track.timescale) * 1_000_000);
    const mediaStart = edit?.mediaStart ?? 0;
    const presentationStartUs = edit?.presentationStartUs ?? 0;
    out.push({
      byteLength,
      fileOffset,
      dtsUs: presentationStartUs + toUs(dts - mediaStart),
      ptsUs: presentationStartUs + toUs(dts + offsets[index]! - mediaStart),
      durationUs: toUs(durations[index]!),
      keyframe: sync ? sync.has(index + 1) : track.type === 'audio' ? true : undefined,
      framing:
        track.codec === 'h264' || track.codec === 'hevc'
          ? 'length-prefixed'
          : 'raw',
    });
    dts += durations[index]!;
  }
  return out;
}

function fragmentSequenceNumber(bytes: Uint8Array, moof: Box): number | undefined {
  const mfhd = child(bytes, moof, 'mfhd');
  return mfhd && mfhd.body + 8 <= mfhd.end ? u32be(bytes, mfhd.body + 4) : undefined;
}

/**
 * Parse one bounded `moof` window into global file-range sample descriptors. The media payload is
 * deliberately never fetched here: `trun` offsets are checked against the complete top-level mdat
 * layout, then retained as lazy ranges for the independent content comparator.
 */
function fragmentRangeSamples(
  bytes: Uint8Array,
  localMoof: Box,
  globalMoofStart: number,
  tracks: readonly TrackTables[],
  mdats: readonly Box[],
  defaults: ReadonlyMap<number, FragmentDefaults>,
  result: Map<number, IsoBmffRangeSampleEvidence[]>,
): boolean {
  for (const traf of children(bytes, localMoof)?.filter((box) => box.type === 'traf') ?? []) {
    const tfhd = child(bytes, traf, 'tfhd');
    if (!tfhd || tfhd.body + 8 > tfhd.end) return false;
    const flags = u32be(bytes, tfhd.body) & 0x00ff_ffff;
    const trackId = u32be(bytes, tfhd.body + 4);
    const track = tracks.find((entry) => entry.id === trackId);
    if (!track) return false;
    let at = tfhd.body + 8;
    let baseDataOffset = globalMoofStart;
    if (flags & 0x000001) {
      const value = u64beSafe(bytes, at);
      if (value === undefined) return false;
      baseDataOffset = value;
      at += 8;
    }
    if (flags & 0x000002) at += 4;
    const inherited = defaults.get(trackId) ?? {};
    const defaultDuration = flags & 0x000008 ? u32be(bytes, at) : inherited.duration;
    if (flags & 0x000008) at += 4;
    const defaultSize = flags & 0x000010 ? u32be(bytes, at) : inherited.size;
    if (flags & 0x000010) at += 4;
    const defaultFlags = flags & 0x000020 ? u32be(bytes, at) : inherited.flags;
    if (flags & 0x000020) at += 4;
    if (at > tfhd.end) return false;
    const tfdt = child(bytes, traf, 'tfdt');
    let decodeTime = 0;
    if (tfdt) {
      const version = fullBoxVersion(bytes, tfdt);
      const value = version === 1
        ? u64beSafe(bytes, tfdt.body + 4)
        : u32be(bytes, tfdt.body + 4);
      if (value === undefined) return false;
      decodeTime = value;
    }
    let implicitDataOffset = baseDataOffset;
    for (const trun of children(bytes, traf)?.filter((box) => box.type === 'trun') ?? []) {
      if (trun.body + 8 > trun.end) return false;
      const version = fullBoxVersion(bytes, trun);
      const trunFlags = u32be(bytes, trun.body) & 0x00ff_ffff;
      const count = u32be(bytes, trun.body + 4);
      const list = result.get(trackId) ?? [];
      if (count > MAX_REMUX_SAMPLES || list.length + count > MAX_REMUX_SAMPLES) return false;
      let cursor = trun.body + 8;
      let dataOffset = implicitDataOffset;
      if (trunFlags & 0x000001) {
        let signed = u32be(bytes, cursor);
        if (signed >= 0x8000_0000) signed -= 0x1_0000_0000;
        dataOffset = baseDataOffset + signed;
        cursor += 4;
      }
      const firstFlags = trunFlags & 0x000004 ? u32be(bytes, cursor) : undefined;
      if (trunFlags & 0x000004) cursor += 4;
      for (let index = 0; index < count; index++) {
        const duration = trunFlags & 0x000100 ? u32be(bytes, cursor) : defaultDuration;
        if (trunFlags & 0x000100) cursor += 4;
        const byteLength = trunFlags & 0x000200 ? u32be(bytes, cursor) : defaultSize;
        if (trunFlags & 0x000200) cursor += 4;
        const sampleFlags = trunFlags & 0x000400
          ? u32be(bytes, cursor)
          : index === 0 && firstFlags !== undefined
            ? firstFlags
            : defaultFlags;
        if (trunFlags & 0x000400) cursor += 4;
        let composition = 0;
        if (trunFlags & 0x000800) {
          composition = u32be(bytes, cursor);
          if (version === 1 && composition >= 0x8000_0000) composition -= 0x1_0000_0000;
          cursor += 4;
        }
        if (
          !duration ||
          !byteLength ||
          cursor > trun.end ||
          !Number.isSafeInteger(dataOffset) ||
          !inMdat(dataOffset, byteLength, mdats)
        ) {
          return false;
        }
        const toUs = (value: number): number => Math.round((value / track.timescale) * 1_000_000);
        list.push({
          byteLength,
          fileOffset: dataOffset,
          dtsUs: toUs(decodeTime),
          ptsUs: toUs(decodeTime + composition),
          durationUs: toUs(duration),
          keyframe: sampleFlags !== undefined
            ? (sampleFlags & 0x0001_0000) === 0
            : track.type === 'audio'
              ? true
              : undefined,
          framing: track.codec === 'h264' || track.codec === 'hevc' ? 'length-prefixed' : 'raw',
        });
        decodeTime += duration;
        dataOffset += byteLength;
      }
      result.set(trackId, list);
      implicitDataOffset = dataOffset;
    }
  }
  return true;
}

async function topLevelRangeBoxes(
  source: IsoBmffRangeSource,
  signal?: AbortSignal,
): Promise<Box[] | undefined> {
  const result: Box[] = [];
  let offset = 0;
  while (offset < source.size) {
    if (result.length >= MAX_BOXES_PER_LEVEL || offset + 8 > source.size) return undefined;
    signal?.throwIfAborted();
    const headerBytes = await source.range(offset, Math.min(source.size, offset + 16), signal);
    if (headerBytes.byteLength < 8) return undefined;
    const size32 = u32be(headerBytes, 0);
    const type = ascii(headerBytes, 4, 4);
    let header = 8;
    let size: number | undefined = size32;
    if (size32 === 1) {
      if (headerBytes.byteLength < 16) return undefined;
      size = u64beSafe(headerBytes, 8);
      header = 16;
    } else if (size32 === 0) {
      size = source.size - offset;
    }
    if (
      size === undefined ||
      size < header ||
      !Number.isSafeInteger(size) ||
      offset + size > source.size
    ) {
      return undefined;
    }
    result.push({
      type,
      start: offset,
      body: offset + header,
      end: offset + size,
      header,
    });
    offset += size;
  }
  return offset === source.size ? result : undefined;
}

/**
 * Range-native classic ISO-BMFF reader used by large remux correctness. It retains only top-level
 * headers plus `moov`; sample payloads remain address descriptors and are fetched/compared lazily.
 */
export async function readIsoBmffRangeProgram(
  source: IsoBmffRangeSource,
  hint = 'mp4',
  signal?: AbortSignal,
): Promise<IsoBmffRangeReadResult> {
  try {
    if (!Number.isSafeInteger(source.size) || source.size < 8) {
      return { state: 'INCOMPLETE', reasonCode: 'REMUX_ISOBMFF_RANGE_INPUT_INCOMPLETE' };
    }
    const top = await topLevelRangeBoxes(source, signal);
    if (!top) {
      return { state: 'INCOMPLETE', reasonCode: 'REMUX_ISOBMFF_RANGE_BOX_INCOMPLETE' };
    }
    const fragmented = top.some((box) => box.type === 'moof');
    const moov = top.find((box) => box.type === 'moov');
    const mdats = top.filter((box) => box.type === 'mdat');
    if (!moov || mdats.length === 0) {
      return {
        state: 'MALFORMED',
        reasonCode: 'REMUX_ISOBMFF_RANGE_REQUIRED_BOX_MISSING',
      };
    }
    signal?.throwIfAborted();
    const moovBytes = await source.range(moov.start, moov.end, signal);
    const localMoov = boxes(moovBytes, 0, moovBytes.byteLength)?.find(
      (box) => box.type === 'moov',
    );
    if (!localMoov) {
      return { state: 'INCOMPLETE', reasonCode: 'REMUX_ISOBMFF_RANGE_MOOV_INCOMPLETE' };
    }
    const tables = parseTracks(moovBytes, localMoov);
    if (!tables) {
      return { state: 'MALFORMED', reasonCode: 'REMUX_ISOBMFF_RANGE_TRACK_TABLE_INVALID' };
    }
    let fragments: Map<number, IsoBmffRangeSampleEvidence[]> | undefined;
    if (fragmented) {
      const firstMoof = top.find((box) => box.type === 'moof')!;
      const ftyp = top.find((box) => box.type === 'ftyp');
      if (
        ftyp === undefined ||
        ftyp.start > moov.start ||
        moov.start > firstMoof.start ||
        child(moovBytes, localMoov, 'mvex') === undefined
      ) {
        return { state: 'MALFORMED', reasonCode: 'REMUX_ISOBMFF_RANGE_FRAGMENT_INIT_INVALID' };
      }
      fragments = new Map();
      const defaults = trexDefaults(moovBytes, localMoov);
      let previousSequence = -1;
      for (const moof of top.filter((box) => box.type === 'moof')) {
        signal?.throwIfAborted();
        const moofBytes = await source.range(moof.start, moof.end, signal);
        const local = boxes(moofBytes, 0, moofBytes.byteLength)?.find((box) => box.type === 'moof');
        const sequence = local ? fragmentSequenceNumber(moofBytes, local) : undefined;
        if (!local || sequence === undefined || sequence <= previousSequence) {
          return { state: 'MALFORMED', reasonCode: 'REMUX_ISOBMFF_RANGE_FRAGMENT_SEQUENCE_INVALID' };
        }
        previousSequence = sequence;
        if (!fragmentRangeSamples(
          moofBytes,
          local,
          moof.start,
          tables,
          mdats,
          defaults,
          fragments,
        )) {
          return { state: 'MALFORMED', reasonCode: 'REMUX_ISOBMFF_RANGE_FRAGMENT_INVALID' };
        }
      }
      const missingRandomAccess = tables.find((table) =>
        table.type === 'video' && fragments?.get(table.id)?.[0]?.keyframe !== true
      );
      if (missingRandomAccess !== undefined) {
        return { state: 'MALFORMED', reasonCode: 'REMUX_ISOBMFF_RANGE_FRAGMENT_RANDOM_ACCESS_MISSING' };
      }
    }
    const tracks: IsoBmffRangeTrackEvidence[] = [];
    for (const table of tables) {
      const samples = fragmented
        ? fragments?.get(table.id)
        : classicRangeSamples(moovBytes, table, mdats);
      if (!samples || samples.length === 0) {
        return { state: 'INCOMPLETE', reasonCode: 'REMUX_ISOBMFF_RANGE_SAMPLES_INCOMPLETE' };
      }
      tracks.push({
        id: `isobmff:${table.id}`,
        type: table.type,
        codec: table.codec,
        timescale: table.timescale,
        ...(table.language ? { language: table.language } : {}),
        ...(table.width ? { width: table.width } : {}),
        ...(table.height ? { height: table.height } : {}),
        ...(table.sampleRate ? { sampleRate: table.sampleRate } : {}),
        ...(table.channels ? { channels: table.channels } : {}),
        ...(table.codecPrivate ? { codecPrivate: table.codecPrivate } : {}),
        samples,
      });
    }
    let minimumPtsUs = Number.POSITIVE_INFINITY;
    let maximumEndUs = Number.NEGATIVE_INFINITY;
    for (const track of tracks) {
      for (const sample of track.samples) {
        if (sample.ptsUs === undefined) continue;
        minimumPtsUs = Math.min(minimumPtsUs, sample.ptsUs);
        maximumEndUs = Math.max(
          maximumEndUs,
          sample.ptsUs + (sample.durationUs ?? 0),
        );
      }
    }
    const codedDurationUs =
      Number.isFinite(minimumPtsUs) && Number.isFinite(maximumEndUs)
        ? maximumEndUs - minimumPtsUs
        : undefined;
    const editedDurationUs = tables
      .map((table) => table.edit?.presentationDurationUs)
      .filter((duration): duration is number => duration !== undefined && duration >= 0)
      .reduce<number | undefined>(
        (maximum, duration) =>
          maximum === undefined ? duration : Math.max(maximum, duration),
        undefined,
      );
    const durationUs =
      editedDurationUs !== undefined &&
      codedDurationUs !== undefined &&
      Math.abs(editedDurationUs - codedDurationUs) > 50_000
        ? editedDurationUs
        : codedDurationUs ?? editedDurationUs;
    return {
      state: 'OK',
      value: {
        schema: 'media-test/remux-program@1',
        container: hint.toLowerCase() === 'mov' ? 'mov' : 'mp4',
        byteLength: source.size,
        ...(durationUs !== undefined && durationUs >= 0 ? { durationUs } : {}),
        tracks,
        representation: { fragmented },
      },
    };
  } catch {
    return { state: 'MALFORMED', reasonCode: 'REMUX_ISOBMFF_RANGE_PARSE_GUARD' };
  }
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
      // MPEG audio headers carry the authoritative channel mode and rate. Some muxers write a
      // contradictory generic mp4a channel field while preserving mono MP3 frames byte-for-byte.
      const mp3Config = table.codec === 'mp3' ? mp3FrameAudioConfig(samples[0]!.payload) : undefined;
      const sampleRate = mp3Config?.sampleRate ?? table.sampleRate;
      const channels = mp3Config?.channels ?? table.channels;
      tracks.push({
        id: `isobmff:${table.id}`, type: table.type, codec: table.codec, timescale: table.timescale,
        ...(table.language ? { language: table.language } : {}),
        ...(table.width ? { width: table.width } : {}), ...(table.height ? { height: table.height } : {}),
        ...(sampleRate ? { sampleRate } : {}), ...(channels ? { channels } : {}),
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
    const codedDurationUs = Number.isFinite(minimumPtsUs) && Number.isFinite(maximumEndUs)
      ? maximumEndUs - minimumPtsUs
      : undefined;
    // ISO edit lists define the presentation program span independently of the raw final stts delta.
    // Some valid MOV files retain a multi-second terminal coded delta while presenting a much shorter
    // movie; carrying that raw span across containers is not a remux-duration requirement.
    const editedDurationUs = tables
      .map((table) => table.edit?.presentationDurationUs)
      .filter((duration): duration is number => duration !== undefined && duration >= 0)
      .reduce<number | undefined>(
        (maximum, duration) => maximum === undefined ? duration : Math.max(maximum, duration),
        undefined,
      );
    const durationUs =
      editedDurationUs !== undefined &&
      codedDurationUs !== undefined &&
      Math.abs(editedDurationUs - codedDurationUs) > 50_000
        ? editedDurationUs
        : codedDurationUs ?? editedDurationUs;
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
