/**
 * src/engines/platform/demux-mp4.ts — a MINIMAL ISO-BMFF (MP4/MOV) demuxer, just enough to feed
 * WebCodecs VideoDecoder AND to enumerate the container's tracks (video + audio) for probe/demux.
 * It parses each track's moov sample tables (stbl) and emits the encoded samples in DECODE order with
 * PTS/DTS and keyframe flags, plus the video codec description (avcC / hvcC / vpcC) needed for the
 * decoder config and the audio descriptor (esds → AAC) needed for honest probe metadata.
 *
 * Scope (HONEST): progressive (non-fragmented) MP4/MOV with a contiguous moov. This is NOT a general
 * MP4 parser — it does not handle moof/traf fragments. It enumerates every 'vide'/'soun' trak so the
 * normalized metadata + packet table match a multi-track golden; it throws a typed
 * {@link UnsupportedMp4Error} when it meets something it cannot handle so callers can fall back to a
 * <video>-element frame grab. AV bytes are never mutated.
 *
 * SOURCES (dossier research/dossiers/platform.md §2 demux / §5 description seam, researched 2026-06-17):
 *   - WebCodecs API: https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API
 *   - VideoDecoder.configure (description/extradata): https://developer.mozilla.org/en-US/docs/Web/API/VideoDecoder/configure
 *   - AVC codec registration (avcC = description ⇒ avc format): https://www.w3.org/TR/webcodecs-avc-codec-registration/
 *
 * ROBUSTNESS (§A.16 deep-edge): every sample-table parser bounds its declared entry_count against the
 * bytes actually remaining in the box (boundEntryCount) so a fuzzed/truncated moov with a huge
 * entry_count degrades to a clean {@link UnsupportedMp4Error} (→ NA/FAIL) instead of reading/allocating
 * past the buffer (OOB/OOM). be32() coerces undefined bytes to 0, so an unbounded loop would otherwise
 * push millions of phantom entries.
 */

import { be16, be24, be32, be64, fourcc, Reader } from './bytes.ts';

export class UnsupportedMp4Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedMp4Error';
  }
}

/**
 * Clamp a full-box `entry_count` to what the box can actually hold: each entry is `entrySize` bytes
 * starting at `entriesStart`, and the box ends at `boxEnd`. A fuzzed moov can declare e.g. 0xFFFFFFFF
 * entries in a 20-byte box; without this bound the table parsers would iterate billions of times,
 * reading undefined bytes (be32 → 0) and allocating an enormous array (OOM/hang). We never read more
 * entries than fit; if the declared count exceeds capacity, the table is malformed → caller throws.
 */
function boundEntryCount(declared: number, entriesStart: number, entrySize: number, boxEnd: number): number {
  if (!Number.isFinite(declared) || declared < 0) return 0;
  const capacity = Math.max(0, Math.floor((boxEnd - entriesStart) / Math.max(1, entrySize)));
  return Math.min(declared, capacity);
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

/** A canonical audio codec token + the per-track audio parameters probe metadata needs. */
export interface Mp4AudioConfig {
  /** canonical token: 'aac' (the only audio sample-entry the inline demuxer identifies in MP4/MOV) */
  codec: string;
  sampleRate: number;
  channels: number;
  timescale: number;
}

export interface Mp4AudioTrack {
  config: Mp4AudioConfig;
  samples: Mp4Sample[];
}

/**
 * Every track the inline demuxer can enumerate, in CONTAINER ORDER (the trak order inside moov), so a
 * consumer can assign trackIndex 0,1,2,… to match a multi-track golden's layout. `kind` distinguishes
 * the discriminated union; unknown/unparseable traks are skipped (honest: we only emit what we read).
 */
export type Mp4Track =
  | ({ kind: 'video' } & Mp4VideoTrack)
  | ({ kind: 'audio' } & Mp4AudioTrack);

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

/** Map an audio sample-entry fourcc to a canonical codec token (only AAC is identified here). */
function audioCodecTokenForEntry(entryType: string): string | undefined {
  // 'mp4a' is the AAC (MPEG-4 Audio) sample entry; its esds names the precise object type but for
  // probe metadata the canonical token is 'aac'. Other entries (Opus 'Opus', AC-3 'ac-3', ALAC
  // 'alac', …) are not identified by this minimal demuxer → skipped honestly.
  return entryType === 'mp4a' ? 'aac' : undefined;
}

/**
 * Parse an AudioSampleEntry (mp4a) for codec token + sampleRate + channels. Layout (ISO-BMFF
 * AudioSampleEntry, verified against the corpus): bodyStart + 6 reserved + 2 data_ref_idx + 8
 * reserved + 2 channelcount + 2 samplesize + 2 predefined + 2 reserved + 4 samplerate(16.16 fixed),
 * then child boxes (esds/btrt) from bodyStart + 28. The 16.16 sample rate's integer part is the rate
 * for the common 0..65535 Hz range (48000 fits). We do not need esds contents for the token (mp4a ⇒
 * aac), only its presence as the AAC marker.
 */
function parseAudioStsd(
  buf: Uint8Array,
  stsd: Box,
): { token: string; sampleRate: number; channels: number } | undefined {
  const entriesStart = stsd.bodyStart + 8;
  const entry = [...iterBoxes(buf, entriesStart, stsd.bodyEnd)][0];
  if (!entry) return undefined;
  const token = audioCodecTokenForEntry(entry.type);
  if (!token) return undefined;
  const channels = be16(buf, entry.bodyStart + 16);
  // samplerate is a 16.16 fixed-point in the AudioSampleEntry; the integer (high 16 bits) is the rate.
  const sampleRate = be32(buf, entry.bodyStart + 24) >>> 16;
  return { token, sampleRate, channels };
}

/** Time-to-sample (stts): array of {count, delta} → per-sample duration (in track timescale). */
function parseStts(buf: Uint8Array, stts: Box): number[] {
  const entriesStart = stts.bodyStart + 8;
  const count = boundEntryCount(be32(buf, stts.bodyStart + 4), entriesStart, 8, stts.bodyEnd);
  let off = entriesStart;
  const durations: number[] = [];
  for (let i = 0; i < count; i++) {
    const sampleCount = be32(buf, off);
    const delta = be32(buf, off + 4);
    off += 8;
    // Guard the inner expansion too: a fuzzed sampleCount must not balloon the array past the file.
    const expand = Math.min(sampleCount, buf.length);
    for (let j = 0; j < expand; j++) durations.push(delta);
  }
  return durations;
}

/** Composition-time-to-sample (ctts): per-sample PTS-DTS offset (signed in v1). Optional. */
function parseCtts(buf: Uint8Array, ctts: Box): number[] {
  const version = buf[ctts.bodyStart] ?? 0;
  const entriesStart = ctts.bodyStart + 8;
  const count = boundEntryCount(be32(buf, ctts.bodyStart + 4), entriesStart, 8, ctts.bodyEnd);
  let off = entriesStart;
  const offsets: number[] = [];
  for (let i = 0; i < count; i++) {
    const sampleCount = be32(buf, off);
    const raw = be32(buf, off + 4);
    const offset = version === 1 ? (raw | 0) : raw; // v1 signed, v0 unsigned
    off += 8;
    const expand = Math.min(sampleCount, buf.length);
    for (let j = 0; j < expand; j++) offsets.push(offset);
  }
  return offsets;
}

/** Sync-sample table (stss): 1-based sample numbers that are keyframes. Absent ⇒ all keyframes. */
function parseStss(buf: Uint8Array, stss: Box | undefined): Set<number> | null {
  if (!stss) return null;
  const entriesStart = stss.bodyStart + 8;
  const count = boundEntryCount(be32(buf, stss.bodyStart + 4), entriesStart, 4, stss.bodyEnd);
  let off = entriesStart;
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
  const declared = be32(buf, stsz.bodyStart + 8);
  const sizes: number[] = [];
  if (defaultSize !== 0) {
    // Fixed-size: cap by what the rest of the FILE could hold (sizes are not stored, but a fuzzed
    // sample_count must not allocate billions of entries).
    const count = Math.min(declared, buf.length);
    for (let i = 0; i < count; i++) sizes.push(defaultSize);
    return sizes;
  }
  const entriesStart = stsz.bodyStart + 12;
  const count = boundEntryCount(declared, entriesStart, 4, stsz.bodyEnd);
  let off = entriesStart;
  for (let i = 0; i < count; i++) {
    sizes.push(be32(buf, off));
    off += 4;
  }
  return sizes;
}

/** Sample-to-chunk (stsc): runs of {first_chunk, samples_per_chunk}. */
function parseStsc(buf: Uint8Array, stsc: Box): Array<{ firstChunk: number; samplesPerChunk: number }> {
  const entriesStart = stsc.bodyStart + 8;
  const count = boundEntryCount(be32(buf, stsc.bodyStart + 4), entriesStart, 12, stsc.bodyEnd);
  let off = entriesStart;
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
    const entriesStart = co64.bodyStart + 8;
    const count = boundEntryCount(be32(buf, co64.bodyStart + 4), entriesStart, 8, co64.bodyEnd);
    let off = entriesStart;
    for (let i = 0; i < count; i++) {
      offsets.push(Number(be64(buf, off)));
      off += 8;
    }
  } else if (stco) {
    const entriesStart = stco.bodyStart + 8;
    const count = boundEntryCount(be32(buf, stco.bodyStart + 4), entriesStart, 4, stco.bodyEnd);
    let off = entriesStart;
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

/** A located stbl + the track media timescale, shared by the video and audio sample builders. */
interface TrackStbl {
  stbl: Box;
  timescale: number;
}

/** Locate the mdia → minf → stbl of a trak and its media timescale, or throw {@link UnsupportedMp4Error}. */
function locateStbl(bytes: Uint8Array, trak: Box): TrackStbl {
  const mdia = findBox(bytes, trak.bodyStart, trak.bodyEnd, 'mdia');
  if (!mdia) throw new UnsupportedMp4Error('track missing mdia');
  const mdhd = findBox(bytes, mdia.bodyStart, mdia.bodyEnd, 'mdhd');
  const timescale = mdhd ? parseMdhdTimescale(bytes, mdhd) : 1000;
  const minf = findBox(bytes, mdia.bodyStart, mdia.bodyEnd, 'minf');
  if (!minf) throw new UnsupportedMp4Error('track missing minf');
  const stbl = findBox(bytes, minf.bodyStart, minf.bodyEnd, 'stbl');
  if (!stbl) throw new UnsupportedMp4Error('track missing stbl');
  return { stbl, timescale: timescale || 1000 };
}

/**
 * Walk a track's sample tables (stts/ctts/stsz/stsc/stco|co64/stss) into ordered encoded samples with
 * PTS/DTS/keyframe, normalizing the timeline so the earliest PTS is 0 (mirrors edit-list / negative-CTS
 * priming so timestamps line up with golden/ffprobe). Shared by video and audio tracks. Throws
 * {@link UnsupportedMp4Error} on incomplete/truncated tables.
 */
function buildSamplesFromStbl(bytes: Uint8Array, stbl: Box, timescale: number): Mp4Sample[] {
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

  // Normalize the presentation timeline so the earliest PTS is 0. PTS and DTS are shifted by the same
  // amount to keep the decode timeline self-consistent for WebCodecs. The golden-packets oracle
  // forgives a CONSTANT per-track origin offset, so each track's independent priming (e.g. audio's
  // edit-list lead) lines up after first-packet alignment.
  const shift = Number.isFinite(minPtsTicks) ? minPtsTicks : 0;
  const toUs = (ticks: number) => Math.round((ticks * 1_000_000) / timescale);
  return raw.map((s) => ({
    data: bytes.subarray(s.offset, s.offset + s.size).slice(),
    dtsUs: toUs(s.dtsTicks - shift),
    ptsUs: toUs(s.ptsTicks - shift),
    durationUs: toUs(s.durTicks),
    keyframe: s.keyframe,
  }));
}

/**
 * Enumerate EVERY parseable track (video + audio) of a progressive MP4/MOV in CONTAINER ORDER (moov
 * trak order), so a caller can assign trackIndex 0,1,2,… to match a multi-track golden's layout and
 * emit honest probe metadata (video codec/dims/fps + audio codec/sampleRate/channels). Skips traks
 * whose handler/sample-entry this minimal demuxer cannot identify (honest: only what we read). Throws
 * {@link UnsupportedMp4Error} for fragmented MP4 / no moov / no usable track.
 */
export function demuxMp4Tracks(bytes: Uint8Array): Mp4Track[] {
  const fileEnd = bytes.length;
  const moov = findBox(bytes, 0, fileEnd, 'moov');
  if (!moov) {
    if (findBox(bytes, 0, fileEnd, 'moof')) {
      throw new UnsupportedMp4Error('fragmented MP4 (moof) is not supported by the inline demuxer');
    }
    throw new UnsupportedMp4Error('no moov box (not a progressive MP4 or truncated)');
  }

  const tracks: Mp4Track[] = [];
  for (const trak of iterBoxes(bytes, moov.bodyStart, moov.bodyEnd)) {
    if (trak.type !== 'trak') continue;
    const mdia = findBox(bytes, trak.bodyStart, trak.bodyEnd, 'mdia');
    if (!mdia) continue;
    const hdlr = findBox(bytes, mdia.bodyStart, mdia.bodyEnd, 'hdlr');
    const handler = hdlr ? hdlrType(bytes, hdlr) : '';

    if (handler === 'vide') {
      const { stbl, timescale } = locateStbl(bytes, trak);
      const stsd = findBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'stsd');
      if (!stsd) throw new UnsupportedMp4Error('video track missing stsd');
      const sampleDesc = parseStsd(bytes, stsd);
      const samples = buildSamplesFromStbl(bytes, stbl, timescale);
      const config: Mp4VideoConfig = {
        codec: sampleDesc.token,
        codecString: sampleDesc.codecString,
        codedWidth: sampleDesc.width,
        codedHeight: sampleDesc.height,
        timescale,
      };
      if (sampleDesc.description) config.description = sampleDesc.description;
      tracks.push({ kind: 'video', config, samples });
    } else if (handler === 'soun') {
      const { stbl, timescale } = locateStbl(bytes, trak);
      const stsd = findBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'stsd');
      if (!stsd) continue; // no sample description → can't identify; skip honestly
      const audioDesc = parseAudioStsd(bytes, stsd);
      if (!audioDesc) continue; // sample entry not one we identify (e.g. non-AAC) → skip
      // Audio sample tables can be malformed in fuzzed input; degrade by skipping THIS track rather
      // than failing the whole demux (the video track may still be perfectly readable).
      let samples: Mp4Sample[];
      try {
        samples = buildSamplesFromStbl(bytes, stbl, timescale);
      } catch {
        continue;
      }
      const config: Mp4AudioConfig = {
        codec: audioDesc.token,
        sampleRate: audioDesc.sampleRate,
        channels: audioDesc.channels,
        timescale,
      };
      tracks.push({ kind: 'audio', config, samples });
    }
    // Other handlers (text/hint/meta) are not enumerated.
  }

  if (tracks.length === 0) throw new UnsupportedMp4Error('no decodable video/audio track found in moov');
  return tracks;
}

/**
 * Demux the first video track of a progressive MP4/MOV into ordered encoded samples + decoder
 * config. Thin wrapper over {@link demuxMp4Tracks}. Throws {@link UnsupportedMp4Error} for fragmented
 * MP4, no moov, or no decodable video track.
 */
export function demuxMp4Video(bytes: Uint8Array): Mp4VideoTrack {
  const tracks = demuxMp4Tracks(bytes);
  const video = tracks.find((t): t is { kind: 'video' } & Mp4VideoTrack => t.kind === 'video');
  if (!video) throw new UnsupportedMp4Error('no video track found in moov');
  return { config: video.config, samples: video.samples };
}

/** Cheap container sniff: an MP4/MOV begins with an 'ftyp' (or 'styp'/'moov'/'free'/'skip') box. */
export function looksLikeMp4(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const type = fourcc(bytes, 4);
  return type === 'ftyp' || type === 'styp' || type === 'moov' || type === 'free' || type === 'skip' || type === 'mdat';
}

// Silence unused-import lint if be24 is not referenced (kept for symmetry with bytes.ts API).
void be24;
