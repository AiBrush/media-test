/**
 * src/engines/platform/demux-mp4.ts — a MINIMAL ISO-BMFF (MP4/MOV) demuxer, just enough to feed
 * WebCodecs VideoDecoder: it parses the moov sample tables (stbl) and emits the first video track's
 * encoded samples in DECODE order with PTS/DTS and keyframe flags, plus the codec description
 * (avcC / hvcC / vpcC) needed for the decoder config.
 *
 * Scope (HONEST): progressive (non-fragmented) MP4/MOV with a contiguous moov. This is NOT a general
 * MP4 parser — it does not handle moof/traf fragments, edit lists, or multi-track muxing. It throws
 * a typed {@link UnsupportedMp4Error} when it meets something it cannot handle so callers can fall
 * back to a <video>-element frame grab. AV bytes are never mutated.
 */

import { be16, be24, be32, be64, fourcc, Reader } from './bytes.ts';

export class UnsupportedMp4Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedMp4Error';
  }
}

/** A canonical video codec token + the WebCodecs description blob (codec-private data). */
export interface Mp4VideoConfig {
  /** canonical token: 'h264' | 'hevc' | 'vp8' | 'vp9' | 'av1' */
  codec: string;
  /** WebCodecs codec string, e.g. 'avc1.640028' / 'hev1.1.6.L93.B0' / 'vp09...' / 'av01...' */
  codecString: string;
  codedWidth: number;
  codedHeight: number;
  /** avcC / hvcC / vpcC / av1C box payload (the `description` for VideoDecoderConfig). */
  description?: Uint8Array;
  timescale: number;
}

export interface Mp4Sample {
  data: Uint8Array;
  ptsUs: number;
  dtsUs: number;
  durationUs: number;
  keyframe: boolean;
}

export interface Mp4VideoTrack {
  config: Mp4VideoConfig;
  samples: Mp4Sample[];
}

/** A located top-level/child box. */
interface Box {
  type: string;
  start: number; // offset of box header
  size: number; // total box size incl. header
  bodyStart: number; // offset of box payload
  bodyEnd: number; // exclusive
}

/** Iterate child boxes within [start, end). Handles 32-bit + 64-bit sizes; stops at size==0 (to EOF). */
function* iterBoxes(buf: Uint8Array, start: number, end: number): Generator<Box> {
  let off = start;
  while (off + 8 <= end) {
    let size = be32(buf, off);
    const type = fourcc(buf, off + 4);
    let headerLen = 8;
    if (size === 1) {
      // 64-bit largesize
      size = Number(be64(buf, off + 8));
      headerLen = 16;
    } else if (size === 0) {
      // extends to end of file
      size = end - off;
    }
    if (size < headerLen || off + size > end) {
      // Truncated / malformed box — stop iterating rather than reading OOB.
      return;
    }
    yield { type, start: off, size, bodyStart: off + headerLen, bodyEnd: off + size };
    off += size;
  }
}

/** Find the first direct child box of `type` within [start,end). */
function findBox(buf: Uint8Array, start: number, end: number, type: string): Box | undefined {
  for (const b of iterBoxes(buf, start, end)) if (b.type === type) return b;
  return undefined;
}

/** Map a sample-entry fourcc to a canonical codec token. */
function codecTokenForEntry(entryType: string): string | undefined {
  switch (entryType) {
    case 'avc1':
    case 'avc3':
      return 'h264';
    case 'hev1':
    case 'hvc1':
      return 'hevc';
    case 'vp08':
      return 'vp8';
    case 'vp09':
      return 'vp9';
    case 'av01':
      return 'av1';
    default:
      return undefined;
  }
}

/** Build the WebCodecs codec string from avcC (profile/compat/level bytes). */
function avcCodecString(avcC: Uint8Array): string {
  // avcC: [0]=version,[1]=AVCProfileIndication,[2]=profile_compatibility,[3]=AVCLevelIndication
  const profile = avcC[1] ?? 0x64;
  const compat = avcC[2] ?? 0x00;
  const level = avcC[3] ?? 0x28;
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `avc1.${hex(profile)}${hex(compat)}${hex(level)}`;
}

/**
 * Build a best-effort HEVC codec string from hvcC. Full hvcC parsing is involved; we extract the
 * fields WebCodecs cares about (general_profile_idc, compat flags, general_level_idc) for the codec
 * string. The `description` (the whole hvcC) is what the decoder actually configures from.
 */
function hevcCodecString(hvcC: Uint8Array): string {
  // hvcC layout: [0]=ver,[1]=general_profile_space(2)|tier(1)|profile_idc(5),
  // [2..5]=general_profile_compatibility_flags, [6..11]=constraint flags, [12]=general_level_idc.
  const b1 = hvcC[1] ?? 0x01;
  const profileSpace = (b1 >> 6) & 0x03;
  const tierFlag = (b1 >> 5) & 0x01;
  const profileIdc = b1 & 0x1f;
  const compat = be32(hvcC, 2) >>> 0;
  const levelIdc = hvcC[12] ?? 93;
  const space = profileSpace === 0 ? '' : String.fromCharCode(64 + profileSpace); // 1->'A'
  const tier = tierFlag === 0 ? 'L' : 'H';
  // Reverse-bit compat as a hex string per RFC; common content is 6 (0x60000000 -> "6").
  const compatHex = compat.toString(16);
  return `hev1.${space}${profileIdc}.${compatHex}.${tier}${levelIdc}.B0`;
}

/** Parse the stsd sample entry to obtain codec token, dims, and codec-private description box. */
function parseStsd(
  buf: Uint8Array,
  stsd: Box,
): { token: string; codecString: string; width: number; height: number; description?: Uint8Array } {
  // stsd: version(1)+flags(3)+entry_count(4) then sample entries.
  const entriesStart = stsd.bodyStart + 8;
  const entry = [...iterBoxes(buf, entriesStart, stsd.bodyEnd)][0];
  if (!entry) throw new UnsupportedMp4Error('stsd has no sample entry');
  const token = codecTokenForEntry(entry.type);
  if (!token) throw new UnsupportedMp4Error(`unsupported video sample entry: ${entry.type}`);

  // VisualSampleEntry: 6 reserved + 2 data_ref_idx + 16 predefined/reserved, then width(2),height(2)
  // at offset bodyStart+24. Children (avcC/hvcC/vpcC/av1C) follow after the fixed 78-byte header.
  const w = be16(buf, entry.bodyStart + 24);
  const h = be16(buf, entry.bodyStart + 26);
  const childStart = entry.bodyStart + 78;

  let description: Uint8Array | undefined;
  let codecString: string;
  if (token === 'h264') {
    const avcCBox = findBox(buf, childStart, entry.bodyEnd, 'avcC');
    if (!avcCBox) throw new UnsupportedMp4Error('avc1 entry missing avcC');
    description = buf.subarray(avcCBox.bodyStart, avcCBox.bodyEnd).slice();
    codecString = avcCodecString(description);
  } else if (token === 'hevc') {
    const hvcCBox = findBox(buf, childStart, entry.bodyEnd, 'hvcC');
    if (!hvcCBox) throw new UnsupportedMp4Error('hevc entry missing hvcC');
    description = buf.subarray(hvcCBox.bodyStart, hvcCBox.bodyEnd).slice();
    codecString = hevcCodecString(description);
  } else if (token === 'vp9' || token === 'vp8') {
    const vpcC = findBox(buf, childStart, entry.bodyEnd, 'vpcC');
    if (vpcC) description = buf.subarray(vpcC.bodyStart, vpcC.bodyEnd).slice();
    // vpcC bytes (after the 4-byte version/flags) start with profile/level/bitDepth.
    codecString = token === 'vp9' ? 'vp09.00.10.08' : 'vp8';
  } else {
    // av1
    const av1C = findBox(buf, childStart, entry.bodyEnd, 'av1C');
    if (av1C) description = buf.subarray(av1C.bodyStart, av1C.bodyEnd).slice();
    codecString = 'av01.0.04M.08';
  }

  const out: { token: string; codecString: string; width: number; height: number; description?: Uint8Array } = {
    token,
    codecString,
    width: w,
    height: h,
  };
  if (description) out.description = description;
  return out;
}

/** Time-to-sample (stts): array of {count, delta} → per-sample duration (in track timescale). */
function parseStts(buf: Uint8Array, stts: Box): number[] {
  const count = be32(buf, stts.bodyStart + 4);
  let off = stts.bodyStart + 8;
  const durations: number[] = [];
  for (let i = 0; i < count; i++) {
    const sampleCount = be32(buf, off);
    const delta = be32(buf, off + 4);
    off += 8;
    for (let j = 0; j < sampleCount; j++) durations.push(delta);
  }
  return durations;
}

/** Composition-time-to-sample (ctts): per-sample PTS-DTS offset (signed in v1). Optional. */
function parseCtts(buf: Uint8Array, ctts: Box): number[] {
  const version = buf[ctts.bodyStart] ?? 0;
  const count = be32(buf, ctts.bodyStart + 4);
  let off = ctts.bodyStart + 8;
  const offsets: number[] = [];
  for (let i = 0; i < count; i++) {
    const sampleCount = be32(buf, off);
    const raw = be32(buf, off + 4);
    const offset = version === 1 ? (raw | 0) : raw; // v1 signed, v0 unsigned
    off += 8;
    for (let j = 0; j < sampleCount; j++) offsets.push(offset);
  }
  return offsets;
}

/** Sync-sample table (stss): 1-based sample numbers that are keyframes. Absent ⇒ all keyframes. */
function parseStss(buf: Uint8Array, stss: Box | undefined): Set<number> | null {
  if (!stss) return null;
  const count = be32(buf, stss.bodyStart + 4);
  let off = stss.bodyStart + 8;
  const set = new Set<number>();
  for (let i = 0; i < count; i++) {
    set.add(be32(buf, off));
    off += 4;
  }
  return set;
}

/** Sample-size table (stsz): default_size + per-sample sizes. */
function parseStsz(buf: Uint8Array, stsz: Box): number[] {
  const defaultSize = be32(buf, stsz.bodyStart + 4);
  const count = be32(buf, stsz.bodyStart + 8);
  const sizes: number[] = [];
  if (defaultSize !== 0) {
    for (let i = 0; i < count; i++) sizes.push(defaultSize);
    return sizes;
  }
  let off = stsz.bodyStart + 12;
  for (let i = 0; i < count; i++) {
    sizes.push(be32(buf, off));
    off += 4;
  }
  return sizes;
}

/** Sample-to-chunk (stsc): runs of {first_chunk, samples_per_chunk}. */
function parseStsc(buf: Uint8Array, stsc: Box): Array<{ firstChunk: number; samplesPerChunk: number }> {
  const count = be32(buf, stsc.bodyStart + 4);
  let off = stsc.bodyStart + 8;
  const runs: Array<{ firstChunk: number; samplesPerChunk: number }> = [];
  for (let i = 0; i < count; i++) {
    runs.push({ firstChunk: be32(buf, off), samplesPerChunk: be32(buf, off + 4) });
    off += 12;
  }
  return runs;
}

/** Chunk-offset table (stco 32-bit / co64 64-bit). */
function parseChunkOffsets(buf: Uint8Array, stco: Box | undefined, co64: Box | undefined): number[] {
  const offsets: number[] = [];
  if (co64) {
    const count = be32(buf, co64.bodyStart + 4);
    let off = co64.bodyStart + 8;
    for (let i = 0; i < count; i++) {
      offsets.push(Number(be64(buf, off)));
      off += 8;
    }
  } else if (stco) {
    const count = be32(buf, stco.bodyStart + 4);
    let off = stco.bodyStart + 8;
    for (let i = 0; i < count; i++) {
      offsets.push(be32(buf, off));
      off += 4;
    }
  }
  return offsets;
}

/** mdhd timescale (track media timescale). */
function parseMdhdTimescale(buf: Uint8Array, mdhd: Box): number {
  const version = buf[mdhd.bodyStart] ?? 0;
  // v0: creation(4) mod(4) timescale(4); v1: creation(8) mod(8) timescale(4)
  const tsOff = mdhd.bodyStart + (version === 1 ? 4 + 16 : 4 + 8);
  return be32(buf, tsOff);
}

/** hdlr handler_type fourcc (e.g. 'vide','soun'). */
function hdlrType(buf: Uint8Array, hdlr: Box): string {
  // version(1)+flags(3)+predefined(4)+handler_type(4)
  return fourcc(buf, hdlr.bodyStart + 8);
}

/**
 * Demux the first video track of a progressive MP4/MOV into ordered encoded samples + decoder
 * config. Throws {@link UnsupportedMp4Error} for fragmented MP4, no moov, or no decodable video.
 */
export function demuxMp4Video(bytes: Uint8Array): Mp4VideoTrack {
  const fileEnd = bytes.length;
  const moov = findBox(bytes, 0, fileEnd, 'moov');
  if (!moov) {
    if (findBox(bytes, 0, fileEnd, 'moof')) {
      throw new UnsupportedMp4Error('fragmented MP4 (moof) is not supported by the inline demuxer');
    }
    throw new UnsupportedMp4Error('no moov box (not a progressive MP4 or truncated)');
  }

  // Find a 'vide' trak.
  let videoTrak: Box | undefined;
  for (const trak of iterBoxes(bytes, moov.bodyStart, moov.bodyEnd)) {
    if (trak.type !== 'trak') continue;
    const mdia = findBox(bytes, trak.bodyStart, trak.bodyEnd, 'mdia');
    if (!mdia) continue;
    const hdlr = findBox(bytes, mdia.bodyStart, mdia.bodyEnd, 'hdlr');
    if (hdlr && hdlrType(bytes, hdlr) === 'vide') {
      videoTrak = trak;
      break;
    }
  }
  if (!videoTrak) throw new UnsupportedMp4Error('no video track found in moov');

  const mdia = findBox(bytes, videoTrak.bodyStart, videoTrak.bodyEnd, 'mdia')!;
  const mdhd = findBox(bytes, mdia.bodyStart, mdia.bodyEnd, 'mdhd');
  const timescale = mdhd ? parseMdhdTimescale(bytes, mdhd) : 1000;
  const minf = findBox(bytes, mdia.bodyStart, mdia.bodyEnd, 'minf');
  if (!minf) throw new UnsupportedMp4Error('track missing minf');
  const stbl = findBox(bytes, minf.bodyStart, minf.bodyEnd, 'stbl');
  if (!stbl) throw new UnsupportedMp4Error('track missing stbl');

  const stsd = findBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'stsd');
  if (!stsd) throw new UnsupportedMp4Error('track missing stsd');
  const sampleDesc = parseStsd(bytes, stsd);

  const sttsBox = findBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'stts');
  const stszBox = findBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'stsz');
  const stscBox = findBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'stsc');
  const stcoBox = findBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'stco');
  const co64Box = findBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'co64');
  const cttsBox = findBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'ctts');
  const stssBox = findBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'stss');
  if (!sttsBox || !stszBox || !stscBox || (!stcoBox && !co64Box)) {
    throw new UnsupportedMp4Error('incomplete sample tables (stts/stsz/stsc/stco)');
  }

  const durations = parseStts(bytes, sttsBox);
  const sizes = parseStsz(bytes, stszBox);
  const stsc = parseStsc(bytes, stscBox);
  const chunkOffsets = parseChunkOffsets(bytes, stcoBox, co64Box);
  const ctts = cttsBox ? parseCtts(bytes, cttsBox) : null;
  const syncSet = parseStss(bytes, stssBox);

  const sampleCount = sizes.length;
  if (sampleCount === 0) throw new UnsupportedMp4Error('no samples in track');

  // Expand stsc into a per-sample chunk membership to compute each sample's byte offset.
  // Build, for each sample, its file offset by walking chunks.
  const sampleOffsets = new Array<number>(sampleCount);
  let sampleIdx = 0;
  for (let r = 0; r < stsc.length && sampleIdx < sampleCount; r++) {
    const run = stsc[r]!;
    const nextFirstChunk = r + 1 < stsc.length ? stsc[r + 1]!.firstChunk : chunkOffsets.length + 1;
    for (let chunk = run.firstChunk; chunk < nextFirstChunk && sampleIdx < sampleCount; chunk++) {
      const chunkStart = chunkOffsets[chunk - 1];
      if (chunkStart === undefined) throw new UnsupportedMp4Error('stsc references missing chunk offset');
      let off = chunkStart;
      for (let s = 0; s < run.samplesPerChunk && sampleIdx < sampleCount; s++) {
        sampleOffsets[sampleIdx] = off;
        off += sizes[sampleIdx]!;
        sampleIdx++;
      }
    }
  }
  if (sampleIdx < sampleCount) throw new UnsupportedMp4Error('stsc did not cover all samples');

  // First pass in TICKS: DTS = cumulative durations, PTS = DTS + ctts offset.
  interface RawSample {
    offset: number;
    size: number;
    dtsTicks: number;
    ptsTicks: number;
    durTicks: number;
    keyframe: boolean;
  }
  const raw: RawSample[] = [];
  let dtsTicks = 0;
  let minPtsTicks = Number.POSITIVE_INFINITY;
  for (let i = 0; i < sampleCount; i++) {
    const dur = durations[i] ?? durations[durations.length - 1] ?? 0;
    const cttsOff = ctts ? (ctts[i] ?? 0) : 0;
    const offset = sampleOffsets[i]!;
    const size = sizes[i]!;
    if (offset + size > bytes.length) throw new UnsupportedMp4Error('sample extends past end of file (truncated)');
    const ptsTicks = dtsTicks + cttsOff;
    if (ptsTicks < minPtsTicks) minPtsTicks = ptsTicks;
    raw.push({ offset, size, dtsTicks, ptsTicks, durTicks: dur, keyframe: syncSet ? syncSet.has(i + 1) : true });
    dtsTicks += dur;
  }

  // Normalize the presentation timeline so the earliest PTS is 0. This mirrors what a player does
  // with an edit list / negative-CTS lead (B-frame reorder offset), so our timestamps line up with
  // golden / ffprobe frame timestamps. PTS and DTS are shifted by the same amount to keep the
  // decode timeline self-consistent for WebCodecs.
  const shift = Number.isFinite(minPtsTicks) ? minPtsTicks : 0;
  const toUs = (ticks: number) => Math.round((ticks * 1_000_000) / timescale);
  const samples: Mp4Sample[] = raw.map((s) => ({
    data: bytes.subarray(s.offset, s.offset + s.size).slice(),
    dtsUs: toUs(s.dtsTicks - shift),
    ptsUs: toUs(s.ptsTicks - shift),
    durationUs: toUs(s.durTicks),
    keyframe: s.keyframe,
  }));

  const config: Mp4VideoConfig = {
    codec: sampleDesc.token,
    codecString: sampleDesc.codecString,
    codedWidth: sampleDesc.width,
    codedHeight: sampleDesc.height,
    timescale,
  };
  if (sampleDesc.description) config.description = sampleDesc.description;

  return { config, samples };
}

/** Cheap container sniff: an MP4/MOV begins with an 'ftyp' (or 'styp'/'moov'/'free'/'skip') box. */
export function looksLikeMp4(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const type = fourcc(bytes, 4);
  return type === 'ftyp' || type === 'styp' || type === 'moov' || type === 'free' || type === 'skip' || type === 'mdat';
}

// Silence unused-import lint if be24 is not referenced (kept for symmetry with bytes.ts API).
void be24;
