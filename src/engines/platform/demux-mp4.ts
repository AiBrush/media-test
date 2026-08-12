/**
 * src/engines/platform/demux-mp4.ts — a MINIMAL ISO-BMFF (MP4/MOV) demuxer, just enough to feed
 * WebCodecs VideoDecoder AND to enumerate the container's tracks (video + audio) for probe/demux.
 * It parses each track's moov sample tables (stbl) and emits the encoded samples in DECODE order with
 * PTS/DTS and keyframe flags, plus the video codec description (avcC / hvcC / vpcC) needed for the
 * decoder config and the audio descriptor (esds → AAC) needed for honest probe metadata.
 *
 * Scope (HONEST): progressive MP4/MOV with a contiguous moov, plus flat/hybrid movie fragments whose
 * traf/trun tables carry bounded sample sizes and an explicit addressable media-data offset. This is
 * NOT a general MP4 parser. It enumerates every 'vide'/'soun' trak so the normalized metadata + packet
 * table match a multi-track golden; it throws a typed {@link UnsupportedMp4Error} when it meets a
 * fragment layout it cannot address so callers can fall back to a <video>-element frame grab. AV
 * bytes are never mutated.
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
  /** Fully-qualified WebCodecs codec string derived from the MPEG-4 AudioSpecificConfig. */
  codecString: string;
  /** DecoderSpecificInfo / AudioSpecificConfig bytes from `esds`. */
  description?: Uint8Array;
  /** MPEG-4 Audio object type (AAC-LC is 2). */
  audioObjectType: number;
  sampleRate: number;
  channels: number;
  timescale: number;
}

/** Explicit ISO-BMFF timing facts used by the native-rate gapless oracle. */
export interface Mp4GaplessAudioTrack extends Mp4AudioTrack {
  codedSampleFrames: number;
  primingFrames: number;
  remainderFrames: number;
  presentationSampleFrames: number;
  editListMediaStartFrame: number;
  timingSource: 'edit-list' | 'media-timeline';
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

export type Mp4MetadataTrack =
  | ({ kind: 'video'; sampleCount: number; durationUs: number | null } & Mp4VideoTrack)
  | ({ kind: 'audio'; sampleCount: number; durationUs: number | null } & Mp4AudioTrack);

export interface Mp4MetadataProbe {
  tracks: Mp4MetadataTrack[];
  durationSec: number | null;
  fragmented: boolean;
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

/** Protected CENC entries (`encv`/`enca`) carry their real sample-entry fourcc in `sinf/frma`. */
function originalFormatForProtectedEntry(buf: Uint8Array, childStart: number, entryEnd: number): string | undefined {
  const sinf = findBox(buf, childStart, entryEnd, 'sinf');
  if (!sinf) return undefined;
  const frma = findBox(buf, sinf.bodyStart, sinf.bodyEnd, 'frma');
  if (!frma || frma.bodyEnd - frma.bodyStart < 4) return undefined;
  return fourcc(buf, frma.bodyStart);
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

/** Reverse all 32 compatibility bits, as required by the RFC 6381 HEVC codec-string grammar. */
function reverseBits32(value: number): number {
  let reversed = 0;
  for (let bit = 0; bit < 32; bit++) reversed = (reversed << 1) | ((value >>> bit) & 1);
  return reversed >>> 0;
}

/**
 * Build an exact HEVC codec string from hvcC. A supplied HEVCDecoderConfigurationRecord carries the
 * VPS/SPS/PPS out of band, so the WebCodecs configuration uses the hvc1 semantic. Compatibility flags
 * are bit-reversed for RFC 6381 and the actual non-trailing-zero constraint bytes are retained; a raw
 * mask such as `60000000` or an invented `.B0` makes otherwise supported browser configs fail parsing.
 */
function hevcCodecString(hvcC: Uint8Array): string {
  // hvcC layout: [0]=ver,[1]=general_profile_space(2)|tier(1)|profile_idc(5),
  // [2..5]=general_profile_compatibility_flags, [6..11]=constraint flags, [12]=general_level_idc.
  const b1 = hvcC[1] ?? 0x01;
  const profileSpace = (b1 >> 6) & 0x03;
  const tierFlag = (b1 >> 5) & 0x01;
  const profileIdc = b1 & 0x1f;
  const compat = reverseBits32(be32(hvcC, 2) >>> 0);
  const levelIdc = hvcC[12] ?? 93;
  const space = profileSpace === 0 ? '' : String.fromCharCode(64 + profileSpace); // 1->'A'
  const tier = tierFlag === 0 ? 'L' : 'H';
  const compatHex = compat.toString(16).toUpperCase();
  let codec = `hvc1.${space}${profileIdc}.${compatHex}.${tier}${levelIdc}`;
  let lastConstraintByte = 5;
  while (lastConstraintByte >= 0 && (hvcC[6 + lastConstraintByte] ?? 0) === 0) lastConstraintByte--;
  for (let index = 0; index <= lastConstraintByte; index++) {
    codec += `.${(hvcC[6 + index] ?? 0).toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return codec;
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
  // VisualSampleEntry: 6 reserved + 2 data_ref_idx + 16 predefined/reserved, then width(2),height(2)
  // at offset bodyStart+24. Children (avcC/hvcC/vpcC/av1C) follow after the fixed 78-byte header.
  const w = be16(buf, entry.bodyStart + 24);
  const h = be16(buf, entry.bodyStart + 26);
  const childStart = entry.bodyStart + 78;
  const entryType =
    entry.type === 'encv' ? originalFormatForProtectedEntry(buf, childStart, entry.bodyEnd) ?? entry.type : entry.type;
  const token = codecTokenForEntry(entryType);
  if (!token) throw new UnsupportedMp4Error(`unsupported video sample entry: ${entry.type}`);

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
 * for the common 0..65535 Hz range (48000 fits). `esds` is also parsed for its DecoderSpecificInfo:
 * raw AAC access units require that AudioSpecificConfig when fed to WebCodecs.
 */
function parseAudioStsd(
  buf: Uint8Array,
  stsd: Box,
): {
  token: string;
  codecString: string;
  description?: Uint8Array;
  audioObjectType: number;
  sampleRate: number;
  channels: number;
} | undefined {
  const entriesStart = stsd.bodyStart + 8;
  const entry = [...iterBoxes(buf, entriesStart, stsd.bodyEnd)][0];
  if (!entry) return undefined;
  const version = be16(buf, entry.bodyStart + 8);
  const childStart = audioSampleEntryChildStart(entry.bodyStart, version);
  const entryType =
    entry.type === 'enca' ? originalFormatForProtectedEntry(buf, childStart, entry.bodyEnd) ?? entry.type : entry.type;
  const token = audioCodecTokenForEntry(entryType);
  if (!token) return undefined;
  const qtV2 = parseQuickTimeAudioV2(buf, entry);
  const entryChannels = qtV2?.channels ?? be16(buf, entry.bodyStart + 16);
  // Version 0/1 samplerate is a 16.16 fixed-point value; QuickTime version 2 stores a Float64.
  const entrySampleRate = qtV2?.sampleRate ?? (be32(buf, entry.bodyStart + 24) >>> 16);
  const esds = findBox(buf, childStart, entry.bodyEnd, 'esds');
  const description = esds ? findAudioSpecificConfig(buf, esds.bodyStart + 4, esds.bodyEnd) : undefined;
  const audioObjectType = description ? audioObjectTypeFromAsc(description) : 2;
  // FFmpeg may retain the legacy AudioSampleEntry channelcount while the AAC encoder writes a new
  // mono/stereo AudioSpecificConfig. For AAC-LC the ASC is the authoritative decoder contract.
  const lcConfig = description ? aacLcRateAndChannels(description) : undefined;
  const sampleRate = lcConfig?.sampleRate ?? entrySampleRate;
  const channels = lcConfig?.channels ?? entryChannels;
  const result: {
    token: string;
    codecString: string;
    description?: Uint8Array;
    audioObjectType: number;
    sampleRate: number;
    channels: number;
  } = {
    token,
    codecString: `mp4a.40.${audioObjectType}`,
    audioObjectType,
    sampleRate,
    channels,
  };
  if (description) result.description = description;
  return result;
}

interface Mpeg4Descriptor {
  tag: number;
  payloadStart: number;
  payloadEnd: number;
}

function readMpeg4Descriptor(buf: Uint8Array, offset: number, end: number): Mpeg4Descriptor | undefined {
  if (offset >= end) return undefined;
  const tag = buf[offset++]!;
  let length = 0;
  let complete = false;
  for (let i = 0; i < 4 && offset < end; i++) {
    const byte = buf[offset++]!;
    length = (length << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      complete = true;
      break;
    }
  }
  if (!complete || length < 0 || offset + length > end) return undefined;
  return { tag, payloadStart: offset, payloadEnd: offset + length };
}

/** Walk the known ES_Descriptor/DecoderConfigDescriptor nesting and return tag 0x05 bytes. */
function findAudioSpecificConfig(buf: Uint8Array, start: number, end: number): Uint8Array | undefined {
  const visit = (offset: number, limit: number): Uint8Array | undefined => {
    while (offset < limit) {
      const descriptor = readMpeg4Descriptor(buf, offset, limit);
      if (!descriptor) return undefined;
      if (descriptor.tag === 0x05 && descriptor.payloadEnd > descriptor.payloadStart) {
        return buf.subarray(descriptor.payloadStart, descriptor.payloadEnd).slice();
      }

      let childStart: number | undefined;
      if (descriptor.tag === 0x03) {
        // ES_ID(2), flags(1), followed by optional dependsOn/url/OCR fields.
        let cursor = descriptor.payloadStart + 3;
        const flags = buf[descriptor.payloadStart + 2] ?? 0;
        if (flags & 0x80) cursor += 2;
        if (flags & 0x40) cursor += 1 + (buf[cursor] ?? 0);
        if (flags & 0x20) cursor += 2;
        childStart = cursor;
      } else if (descriptor.tag === 0x04) {
        // objectTypeIndication(1), streamType/upstream/reserved(1), bufferSizeDB(3), max/avg bitrate(8).
        childStart = descriptor.payloadStart + 13;
      }
      if (childStart !== undefined && childStart < descriptor.payloadEnd) {
        const found = visit(childStart, descriptor.payloadEnd);
        if (found) return found;
      }
      offset = descriptor.payloadEnd;
    }
    return undefined;
  };
  return visit(start, end);
}

function audioObjectTypeFromAsc(asc: Uint8Array): number {
  if (asc.length === 0) return 2;
  let objectType = (asc[0]! >> 3) & 0x1f;
  if (objectType === 31 && asc.length >= 2) objectType = 32 + ((asc[0]! & 0x07) << 3) + (asc[1]! >> 5);
  return objectType > 0 ? objectType : 2;
}

function aacLcRateAndChannels(asc: Uint8Array): { sampleRate: number; channels: number } | undefined {
  if (asc.byteLength < 2 || audioObjectTypeFromAsc(asc) !== 2) return undefined;
  const sampleRateIndex = ((asc[0]! & 0x07) << 1) | (asc[1]! >> 7);
  const channelConfiguration = (asc[1]! >> 3) & 0x0f;
  const sampleRate = [
    96_000, 88_200, 64_000, 48_000, 44_100, 32_000, 24_000,
    22_050, 16_000, 12_000, 11_025, 8_000, 7_350,
  ][sampleRateIndex];
  const channels = [undefined, 1, 2, 3, 4, 5, 6, 8][channelConfiguration];
  return sampleRate !== undefined && channels !== undefined ? { sampleRate, channels } : undefined;
}

function audioSampleEntryChildStart(bodyStart: number, version: number): number {
  if (version === 1) return bodyStart + 44;
  if (version === 2) return bodyStart + 64;
  return bodyStart + 28;
}

function parseQuickTimeAudioV2(buf: Uint8Array, entry: Box): { sampleRate: number; channels: number } | undefined {
  if (be16(buf, entry.bodyStart + 8) !== 2 || entry.bodyStart + 44 > entry.bodyEnd) return undefined;
  const sampleRate = readFloat64BE(buf, entry.bodyStart + 32);
  const channels = be32(buf, entry.bodyStart + 40);
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || channels <= 0) return undefined;
  return { sampleRate: Math.round(sampleRate), channels };
}

function readFloat64BE(buf: Uint8Array, offset: number): number {
  return new DataView(buf.buffer, buf.byteOffset + offset, 8).getFloat64(0, false);
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
    // Some QuickTime/MOV files store signed composition offsets in a version-0 ctts box. Treat
    // high-bit v0 values as signed to avoid turning -100 ticks into a multi-day PTS.
    const offset = version === 1 || raw > 0x7fffffff ? (raw | 0) : raw;
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

function parseMdhdDurationTicks(buf: Uint8Array, mdhd: Box): number {
  const version = buf[mdhd.bodyStart] ?? 0;
  const durationOff = mdhd.bodyStart + (version === 1 ? 4 + 16 + 4 : 4 + 8 + 4);
  if (version === 1) return durationOff + 8 <= mdhd.bodyEnd ? Number(be64(buf, durationOff)) : 0;
  return durationOff + 4 <= mdhd.bodyEnd ? be32(buf, durationOff) : 0;
}

function parseMvhdTimescale(buf: Uint8Array, mvhd: Box): number {
  const version = buf[mvhd.bodyStart] ?? 0;
  const timescaleOffset = mvhd.bodyStart + (version === 1 ? 20 : 12);
  return timescaleOffset + 4 <= mvhd.bodyEnd ? be32(buf, timescaleOffset) : 0;
}

interface EditListTiming {
  presentationTicks: number;
  mediaStartTicks: number;
}

/** Read unit-rate, non-empty edit segments. Empty leading edits do not contribute program frames. */
function parseEditListTimingRaw(buf: Uint8Array, trak: Box): EditListTiming | undefined {
  const edts = findBox(buf, trak.bodyStart, trak.bodyEnd, 'edts');
  const elst = edts ? findBox(buf, edts.bodyStart, edts.bodyEnd, 'elst') : undefined;
  if (!elst || elst.bodyEnd - elst.bodyStart < 8) return undefined;
  const version = buf[elst.bodyStart] ?? 0;
  if (version !== 0 && version !== 1) throw new UnsupportedMp4Error(`unsupported elst version ${version}`);
  const entryBytes = version === 1 ? 20 : 12;
  const entriesStart = elst.bodyStart + 8;
  const count = boundEntryCount(be32(buf, elst.bodyStart + 4), entriesStart, entryBytes, elst.bodyEnd);
  let cursor = entriesStart;
  let presentationTicks = 0;
  let mediaStartTicks: number | undefined;
  for (let index = 0; index < count; index++) {
    const view = new DataView(buf.buffer, buf.byteOffset + cursor, entryBytes);
    const segmentDuration = version === 1 ? Number(view.getBigUint64(0, false)) : view.getUint32(0, false);
    const mediaTime = version === 1 ? Number(view.getBigInt64(8, false)) : view.getInt32(4, false);
    const rateInteger = view.getInt16(version === 1 ? 16 : 8, false);
    const rateFraction = view.getInt16(version === 1 ? 18 : 10, false);
    if (rateInteger !== 1 || rateFraction !== 0) {
      throw new UnsupportedMp4Error('gapless timing does not support non-unit edit-list media rates');
    }
    if (mediaTime >= 0) {
      presentationTicks += segmentDuration;
      if (mediaStartTicks === undefined) mediaStartTicks = mediaTime;
    }
    cursor += entryBytes;
  }
  if (mediaStartTicks === undefined) return undefined;
  return { presentationTicks, mediaStartTicks };
}

/** Gapless evidence additionally requires a positive movie-presentation span. */
function parseEditListTiming(buf: Uint8Array, trak: Box): EditListTiming | undefined {
  const timing = parseEditListTimingRaw(buf, trak);
  return timing && timing.presentationTicks > 0 ? timing : undefined;
}

function parseTkhdTrackId(buf: Uint8Array, tkhd: Box): number | null {
  const version = buf[tkhd.bodyStart] ?? 0;
  const idOff = tkhd.bodyStart + (version === 1 ? 4 + 16 : 4 + 8);
  return idOff + 4 <= tkhd.bodyEnd ? be32(buf, idOff) : null;
}

function parseTkhdDisplayMatrix(buf: Uint8Array, tkhd: Box): { a: number; b: number; c: number; d: number } | null {
  const version = buf[tkhd.bodyStart] ?? 0;
  const matrixOff = tkhd.bodyStart + (version === 1 ? 52 : 40);
  if (matrixOff + 36 > tkhd.bodyEnd) return null;
  return {
    a: be32(buf, matrixOff) | 0,
    b: be32(buf, matrixOff + 4) | 0,
    c: be32(buf, matrixOff + 12) | 0,
    d: be32(buf, matrixOff + 16) | 0,
  };
}

function displayMatrixIsIdentity(matrix: { a: number; b: number; c: number; d: number }): boolean {
  return matrix.a === 0x00010000 && matrix.b === 0 && matrix.c === 0 && matrix.d === 0x00010000;
}

export function hasMp4DisplayMatrixTransform(bytes: Uint8Array): boolean {
  const moov = findBox(bytes, 0, bytes.length, 'moov');
  if (!moov) return false;

  for (const trak of iterBoxes(bytes, moov.bodyStart, moov.bodyEnd)) {
    if (trak.type !== 'trak') continue;
    const mdia = findBox(bytes, trak.bodyStart, trak.bodyEnd, 'mdia');
    if (!mdia) continue;
    const hdlr = findBox(bytes, mdia.bodyStart, mdia.bodyEnd, 'hdlr');
    if (!hdlr || hdlrType(bytes, hdlr) !== 'vide') continue;
    const tkhd = findBox(bytes, trak.bodyStart, trak.bodyEnd, 'tkhd');
    const matrix = tkhd ? parseTkhdDisplayMatrix(bytes, tkhd) : null;
    if (matrix && !displayMatrixIsIdentity(matrix)) return true;
  }

  return false;
}

function childBoxes(buf: Uint8Array, box: Box): Box[] {
  return [...iterBoxes(buf, box.bodyStart, box.bodyEnd)];
}

interface FragmentDefaults {
  durationTicks?: number;
  sizeBytes?: number;
  sampleFlags?: number;
}

interface FragmentStats {
  sampleCount: number;
  maxEndTicks: number;
  cursorTicks: number;
}

function parseTrexDefaults(buf: Uint8Array, moov: Box): Map<number, FragmentDefaults> {
  const out = new Map<number, FragmentDefaults>();
  const mvex = findBox(buf, moov.bodyStart, moov.bodyEnd, 'mvex');
  if (!mvex) return out;
  for (const trex of childBoxes(buf, mvex)) {
    if (trex.type !== 'trex' || trex.bodyStart + 24 > trex.bodyEnd) continue;
    const trackId = be32(buf, trex.bodyStart + 4);
    const durationTicks = be32(buf, trex.bodyStart + 12);
    const sizeBytes = be32(buf, trex.bodyStart + 16);
    const sampleFlags = be32(buf, trex.bodyStart + 20);
    out.set(trackId, {
      ...(durationTicks > 0 ? { durationTicks } : {}),
      ...(sizeBytes > 0 ? { sizeBytes } : {}),
      ...(sampleFlags > 0 ? { sampleFlags } : {}),
    });
  }
  return out;
}

function parseTfhd(
  buf: Uint8Array,
  tfhd: Box,
  defaults: FragmentDefaults | undefined,
): { trackId: number; durationTicks?: number } | null {
  if (tfhd.bodyStart + 8 > tfhd.bodyEnd) return null;
  const flags = be24(buf, tfhd.bodyStart + 1);
  const trackId = be32(buf, tfhd.bodyStart + 4);
  let off = tfhd.bodyStart + 8;
  if (flags & 0x000001) off += 8; // base-data-offset
  if (flags & 0x000002) off += 4; // sample-description-index
  let durationTicks = defaults?.durationTicks;
  if (flags & 0x000008) {
    if (off + 4 > tfhd.bodyEnd) return { trackId, ...(durationTicks !== undefined ? { durationTicks } : {}) };
    durationTicks = be32(buf, off);
  }
  return { trackId, ...(durationTicks !== undefined && durationTicks > 0 ? { durationTicks } : {}) };
}

function parseTfdtBaseTicks(buf: Uint8Array, tfdt: Box | undefined): number | undefined {
  if (!tfdt) return undefined;
  const version = buf[tfdt.bodyStart] ?? 0;
  const off = tfdt.bodyStart + 4;
  if (version === 1) return off + 8 <= tfdt.bodyEnd ? Number(be64(buf, off)) : undefined;
  return off + 4 <= tfdt.bodyEnd ? be32(buf, off) : undefined;
}

function parseTrunStats(
  buf: Uint8Array,
  trun: Box,
  defaultDurationTicks: number | undefined,
): { sampleCount: number; durationTicks: number } {
  if (trun.bodyStart + 8 > trun.bodyEnd) return { sampleCount: 0, durationTicks: 0 };
  const flags = be24(buf, trun.bodyStart + 1);
  const declaredSamples = be32(buf, trun.bodyStart + 4);
  let off = trun.bodyStart + 8;
  if (flags & 0x000001) off += 4; // data-offset
  if (flags & 0x000004) off += 4; // first-sample-flags

  const hasDuration = (flags & 0x000100) !== 0;
  const perSampleBytes =
    (hasDuration ? 4 : 0) +
    ((flags & 0x000200) !== 0 ? 4 : 0) +
    ((flags & 0x000400) !== 0 ? 4 : 0) +
    ((flags & 0x000800) !== 0 ? 4 : 0);
  const sampleCount = perSampleBytes > 0 ? boundEntryCount(declaredSamples, off, perSampleBytes, trun.bodyEnd) : declaredSamples;

  if (!hasDuration) {
    return { sampleCount, durationTicks: (defaultDurationTicks ?? 0) * sampleCount };
  }

  let durationTicks = 0;
  for (let i = 0; i < sampleCount; i++) {
    durationTicks += be32(buf, off);
    off += 4;
    if (flags & 0x000200) off += 4; // sample-size
    if (flags & 0x000400) off += 4; // sample-flags
    if (flags & 0x000800) off += 4; // sample-composition-time-offset
  }
  return { sampleCount, durationTicks };
}

function parseFragmentStats(buf: Uint8Array, moov: Box): Map<number, FragmentStats> {
  const defaults = parseTrexDefaults(buf, moov);
  const stats = new Map<number, FragmentStats>();
  for (const moof of iterBoxes(buf, 0, buf.length)) {
    if (moof.type !== 'moof') continue;
    for (const traf of childBoxes(buf, moof)) {
      if (traf.type !== 'traf') continue;
      const tfhd = findBox(buf, traf.bodyStart, traf.bodyEnd, 'tfhd');
      if (!tfhd || tfhd.bodyStart + 8 > tfhd.bodyEnd) continue;
      const trackId = be32(buf, tfhd.bodyStart + 4);
      const base = parseTfhd(buf, tfhd, defaults.get(trackId));
      if (!base) continue;
      const trackStats = stats.get(base.trackId) ?? { sampleCount: 0, maxEndTicks: 0, cursorTicks: 0 };
      let cursor = parseTfdtBaseTicks(buf, findBox(buf, traf.bodyStart, traf.bodyEnd, 'tfdt')) ?? trackStats.cursorTicks;
      for (const trun of childBoxes(buf, traf)) {
        if (trun.type !== 'trun') continue;
        const run = parseTrunStats(buf, trun, base.durationTicks);
        trackStats.sampleCount += run.sampleCount;
        cursor += run.durationTicks;
        trackStats.maxEndTicks = Math.max(trackStats.maxEndTicks, cursor);
      }
      trackStats.cursorTicks = Math.max(trackStats.cursorTicks, cursor);
      stats.set(base.trackId, trackStats);
    }
  }
  return stats;
}

interface FragmentSampleHeader {
  trackId: number;
  baseDataOffset?: number;
  defaultDurationTicks?: number;
  defaultSizeBytes?: number;
  defaultSampleFlags?: number;
}

/** Fully parse the tfhd fields that are needed to address and decode a fragment's sample payloads. */
function parseFragmentSampleHeader(
  buf: Uint8Array,
  moof: Box,
  tfhd: Box,
  defaults: FragmentDefaults | undefined,
): FragmentSampleHeader {
  if (tfhd.bodyStart + 8 > tfhd.bodyEnd) throw new UnsupportedMp4Error('fragment has truncated tfhd');
  const flags = be24(buf, tfhd.bodyStart + 1);
  const trackId = be32(buf, tfhd.bodyStart + 4);
  let off = tfhd.bodyStart + 8;
  let baseDataOffset: number | undefined;
  if (flags & 0x000001) {
    if (off + 8 > tfhd.bodyEnd) throw new UnsupportedMp4Error('fragment has truncated tfhd base-data-offset');
    baseDataOffset = Number(be64(buf, off));
    off += 8;
  } else if (flags & 0x020000) {
    baseDataOffset = moof.start;
  }
  if (flags & 0x000002) {
    if (off + 4 > tfhd.bodyEnd) throw new UnsupportedMp4Error('fragment has truncated sample-description-index');
    off += 4;
  }

  let defaultDurationTicks = defaults?.durationTicks;
  let defaultSizeBytes = defaults?.sizeBytes;
  let defaultSampleFlags = defaults?.sampleFlags;
  if (flags & 0x000008) {
    if (off + 4 > tfhd.bodyEnd) throw new UnsupportedMp4Error('fragment has truncated default sample duration');
    defaultDurationTicks = be32(buf, off);
    off += 4;
  }
  if (flags & 0x000010) {
    if (off + 4 > tfhd.bodyEnd) throw new UnsupportedMp4Error('fragment has truncated default sample size');
    defaultSizeBytes = be32(buf, off);
    off += 4;
  }
  if (flags & 0x000020) {
    if (off + 4 > tfhd.bodyEnd) throw new UnsupportedMp4Error('fragment has truncated default sample flags');
    defaultSampleFlags = be32(buf, off);
  }
  return {
    trackId,
    ...(baseDataOffset !== undefined ? { baseDataOffset } : {}),
    ...(defaultDurationTicks !== undefined ? { defaultDurationTicks } : {}),
    ...(defaultSizeBytes !== undefined ? { defaultSizeBytes } : {}),
    ...(defaultSampleFlags !== undefined ? { defaultSampleFlags } : {}),
  };
}

function fragmentSampleIsSync(flags: number): boolean {
  return (flags & 0x0001_0000) === 0;
}

/**
 * Read every addressable sample for one track from top-level moof/traf/trun fragments. Hybrid files
 * are common in the encryption corpus: their moov contains an initial progressive prefix and later
 * moofs continue the same timeline. Ignoring those moofs silently truncated the clear reference from
 * 150 to 60 frames and manufactured a decrypt cardinality failure.
 */
function buildSamplesFromFragments(
  bytes: Uint8Array,
  moov: Box,
  trackId: number,
  timescale: number,
  normalizeToEarliestPts: boolean,
): Mp4Sample[] {
  const defaults = parseTrexDefaults(bytes, moov);
  interface RawFragmentSample {
    data: Uint8Array;
    decodeTicks: number;
    presentationTicks: number;
    durationTicks: number;
    keyframe: boolean;
  }
  const rawSamples: RawFragmentSample[] = [];
  let nextDecodeTicks: number | undefined;

  for (const moof of iterBoxes(bytes, 0, bytes.length)) {
    if (moof.type !== 'moof') continue;
    for (const traf of childBoxes(bytes, moof)) {
      if (traf.type !== 'traf') continue;
      const tfhd = findBox(bytes, traf.bodyStart, traf.bodyEnd, 'tfhd');
      if (!tfhd) throw new UnsupportedMp4Error('fragment traf is missing tfhd');
      const header = parseFragmentSampleHeader(bytes, moof, tfhd, defaults.get(trackId));
      if (header.trackId !== trackId) continue;

      const tfdt = findBox(bytes, traf.bodyStart, traf.bodyEnd, 'tfdt');
      let decodeTicks = parseTfdtBaseTicks(bytes, tfdt) ?? nextDecodeTicks;
      if (decodeTicks === undefined) {
        throw new UnsupportedMp4Error(`fragment track ${trackId} has no addressable decode-time origin`);
      }
      let previousRunEnd: number | undefined;

      for (const trun of childBoxes(bytes, traf)) {
        if (trun.type !== 'trun') continue;
        if (trun.bodyStart + 8 > trun.bodyEnd) throw new UnsupportedMp4Error('fragment has truncated trun');
        const version = bytes[trun.bodyStart] ?? 0;
        const flags = be24(bytes, trun.bodyStart + 1);
        const declaredSamples = be32(bytes, trun.bodyStart + 4);
        if (declaredSamples > bytes.byteLength) {
          throw new UnsupportedMp4Error('fragment sample count exceeds the bounded input size');
        }
        let off = trun.bodyStart + 8;
        let dataStart: number | undefined;
        if (flags & 0x000001) {
          if (off + 4 > trun.bodyEnd) throw new UnsupportedMp4Error('fragment has truncated trun data offset');
          if (header.baseDataOffset === undefined) {
            throw new UnsupportedMp4Error('fragment trun data offset has no addressable tfhd base');
          }
          dataStart = header.baseDataOffset + (be32(bytes, off) | 0);
          off += 4;
        } else {
          dataStart = previousRunEnd ?? header.baseDataOffset;
        }
        if (dataStart === undefined || !Number.isSafeInteger(dataStart) || dataStart < 0) {
          throw new UnsupportedMp4Error('fragment media-data offset is not addressable');
        }

        let firstSampleFlags: number | undefined;
        if (flags & 0x000004) {
          if (off + 4 > trun.bodyEnd) throw new UnsupportedMp4Error('fragment has truncated first-sample flags');
          firstSampleFlags = be32(bytes, off);
          off += 4;
        }

        let dataOffset = dataStart;
        for (let index = 0; index < declaredSamples; index++) {
          let durationTicks = header.defaultDurationTicks ?? 0;
          let sizeBytes = header.defaultSizeBytes ?? 0;
          let sampleFlags = index === 0 && firstSampleFlags !== undefined
            ? firstSampleFlags
            : header.defaultSampleFlags ?? 0;
          let compositionOffsetTicks = 0;
          if (flags & 0x000100) {
            if (off + 4 > trun.bodyEnd) throw new UnsupportedMp4Error('fragment has truncated sample duration');
            durationTicks = be32(bytes, off);
            off += 4;
          }
          if (flags & 0x000200) {
            if (off + 4 > trun.bodyEnd) throw new UnsupportedMp4Error('fragment has truncated sample size');
            sizeBytes = be32(bytes, off);
            off += 4;
          }
          if (flags & 0x000400) {
            if (off + 4 > trun.bodyEnd) throw new UnsupportedMp4Error('fragment has truncated sample flags');
            sampleFlags = be32(bytes, off);
            off += 4;
          }
          if (flags & 0x000800) {
            if (off + 4 > trun.bodyEnd) throw new UnsupportedMp4Error('fragment has truncated composition offset');
            compositionOffsetTicks = version === 1 ? (be32(bytes, off) | 0) : be32(bytes, off);
            off += 4;
          }
          if (durationTicks <= 0 || sizeBytes <= 0 || dataOffset + sizeBytes > bytes.byteLength) {
            throw new UnsupportedMp4Error('fragment sample has invalid duration, size, or media-data extent');
          }
          rawSamples.push({
            data: bytes.subarray(dataOffset, dataOffset + sizeBytes).slice(),
            decodeTicks,
            presentationTicks: decodeTicks + compositionOffsetTicks,
            durationTicks,
            keyframe: fragmentSampleIsSync(sampleFlags),
          });
          dataOffset += sizeBytes;
          decodeTicks += durationTicks;
        }
        previousRunEnd = dataOffset;
      }
      nextDecodeTicks = decodeTicks;
    }
  }
  const originTicks = normalizeToEarliestPts
    ? rawSamples.reduce(
      (minimum, sample) => Math.min(minimum, sample.presentationTicks),
      Number.POSITIVE_INFINITY,
    )
    : 0;
  const shiftTicks = Number.isFinite(originTicks) ? originTicks : 0;
  const toUs = (ticks: number): number => Math.round((ticks * 1_000_000) / timescale);
  return rawSamples.map((sample) => ({
    data: sample.data,
    dtsUs: toUs(sample.decodeTicks - shiftTicks),
    ptsUs: toUs(sample.presentationTicks - shiftTicks),
    durationUs: toUs(sample.durationTicks),
    keyframe: sample.keyframe,
  }));
}

/** Apply the same earliest-PTS origin policy to progressive, fragmented, and hybrid representations. */
function normalizeCombinedSampleTimeline(samples: readonly Mp4Sample[]): Mp4Sample[] {
  const originUs = samples.reduce(
    (minimum, sample) => Math.min(minimum, sample.ptsUs),
    Number.POSITIVE_INFINITY,
  );
  if (!Number.isFinite(originUs) || originUs === 0) return [...samples];
  return samples.map((sample) => ({
    ...sample,
    dtsUs: sample.dtsUs - originUs,
    ptsUs: sample.ptsUs - originUs,
  }));
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
      const tkhd = findBox(bytes, trak.bodyStart, trak.bodyEnd, 'tkhd');
      const trackId = tkhd ? parseTkhdTrackId(bytes, tkhd) : null;
      let samples: Mp4Sample[] = [];
      try {
        samples = buildSamplesFromStbl(bytes, stbl, timescale);
      } catch (error) {
        if (!findBox(bytes, 0, bytes.length, 'moof')) throw error;
      }
      if (trackId !== null) {
        const hasProgressivePrefix = samples.length > 0;
        samples.push(...buildSamplesFromFragments(
          bytes,
          moov,
          trackId,
          timescale,
          !hasProgressivePrefix,
        ));
      }
      if (samples.length === 0) throw new UnsupportedMp4Error('video track contains no addressable samples');
      samples = normalizeCombinedSampleTimeline(samples);
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
      let samples: Mp4Sample[] = [];
      try {
        samples = buildSamplesFromStbl(bytes, stbl, timescale);
      } catch (error) {
        if (!findBox(bytes, 0, bytes.length, 'moof')) continue;
      }
      const tkhd = findBox(bytes, trak.bodyStart, trak.bodyEnd, 'tkhd');
      const trackId = tkhd ? parseTkhdTrackId(bytes, tkhd) : null;
      if (trackId !== null) {
        const hasProgressivePrefix = samples.length > 0;
        samples.push(...buildSamplesFromFragments(
          bytes,
          moov,
          trackId,
          timescale,
          !hasProgressivePrefix,
        ));
      }
      if (samples.length === 0) continue;
      samples = normalizeCombinedSampleTimeline(samples);
      const config: Mp4AudioConfig = {
        codec: audioDesc.token,
        codecString: audioDesc.codecString,
        audioObjectType: audioDesc.audioObjectType,
        sampleRate: audioDesc.sampleRate,
        channels: audioDesc.channels,
        timescale,
      };
      if (audioDesc.description) config.description = audioDesc.description;
      tracks.push({ kind: 'audio', config, samples });
    }
    // Other handlers (text/hint/meta) are not enumerated.
  }

  if (tracks.length === 0) throw new UnsupportedMp4Error('no decodable video/audio track found in moov');
  return tracks;
}

/**
 * Demux the first AAC track and retain the independent coded, edit-list, priming, and remainder
 * facts needed by the native gapless oracle. AAC-LC is deliberately the only frame-capacity model
 * implemented here: applying 1,024 frames blindly to SBR/PS output-rate views would manufacture
 * evidence, so those object types remain typed unsupported until their dual-rate model is added.
 */
export function demuxMp4GaplessAudio(bytes: Uint8Array): Mp4GaplessAudioTrack {
  const moov = findBox(bytes, 0, bytes.length, 'moov');
  if (!moov) throw new UnsupportedMp4Error('gapless audio evidence requires a progressive MP4 moov');
  const mvhd = findBox(bytes, moov.bodyStart, moov.bodyEnd, 'mvhd');
  const movieTimescale = mvhd ? parseMvhdTimescale(bytes, mvhd) : 0;
  if (movieTimescale <= 0) throw new UnsupportedMp4Error('gapless audio evidence requires mvhd timescale');

  for (const trak of iterBoxes(bytes, moov.bodyStart, moov.bodyEnd)) {
    if (trak.type !== 'trak') continue;
    const mdia = findBox(bytes, trak.bodyStart, trak.bodyEnd, 'mdia');
    if (!mdia) continue;
    const hdlr = findBox(bytes, mdia.bodyStart, mdia.bodyEnd, 'hdlr');
    if (!hdlr || hdlrType(bytes, hdlr) !== 'soun') continue;
    const mdhd = findBox(bytes, mdia.bodyStart, mdia.bodyEnd, 'mdhd');
    const { stbl, timescale } = locateStbl(bytes, trak);
    const stsd = findBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'stsd');
    const stts = findBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'stts');
    if (!stsd || !stts) throw new UnsupportedMp4Error('gapless audio track lacks stsd/stts timing');
    const audioDesc = parseAudioStsd(bytes, stsd);
    if (!audioDesc) continue;
    if (audioDesc.audioObjectType !== 2) {
      throw new UnsupportedMp4Error(
        `gapless AAC frame-capacity model does not support audio object type ${audioDesc.audioObjectType}`,
      );
    }
    if (!audioDesc.description) {
      throw new UnsupportedMp4Error('gapless AAC WebCodecs evidence requires esds AudioSpecificConfig');
    }

    const samples = buildSamplesFromStbl(bytes, stbl, timescale);
    const codedSampleFrames = samples.length * 1024;
    const edits = parseEditListTiming(bytes, trak);
    const mediaDurationTicks = mdhd ? parseMdhdDurationTicks(bytes, mdhd) : parseStts(bytes, stts).reduce((a, b) => a + b, 0);
    const presentationSampleFrames = edits
      ? Math.round((edits.presentationTicks * audioDesc.sampleRate) / movieTimescale)
      : Math.round((mediaDurationTicks * audioDesc.sampleRate) / timescale);
    const editListMediaStartFrame = edits
      ? Math.round((edits.mediaStartTicks * audioDesc.sampleRate) / timescale)
      : 0;
    const primingFrames = editListMediaStartFrame;
    const remainderFrames = codedSampleFrames - primingFrames - presentationSampleFrames;
    if (presentationSampleFrames <= 0 || remainderFrames < 0) {
      throw new UnsupportedMp4Error(
        `inconsistent AAC timing: coded=${codedSampleFrames}, priming=${primingFrames}, presentation=${presentationSampleFrames}`,
      );
    }

    const config: Mp4AudioConfig = {
      codec: audioDesc.token,
      codecString: audioDesc.codecString,
      description: audioDesc.description,
      audioObjectType: audioDesc.audioObjectType,
      sampleRate: audioDesc.sampleRate,
      channels: audioDesc.channels,
      timescale,
    };
    return {
      config,
      samples,
      codedSampleFrames,
      primingFrames,
      remainderFrames,
      presentationSampleFrames,
      editListMediaStartFrame,
      timingSource: edits ? 'edit-list' : 'media-timeline',
    };
  }
  throw new UnsupportedMp4Error('no AAC audio track found for gapless evidence');
}

/**
 * Metadata-only MP4 probe. This intentionally accepts cases demuxMp4Tracks() rejects, such as
 * fragmented MP4 and CENC-protected sample entries, because the clear MP4 headers still expose track
 * shape and timing even though raw platform APIs cannot export decrypted packets.
 */
export function probeMp4Metadata(bytes: Uint8Array): Mp4MetadataProbe {
  const moov = findBox(bytes, 0, bytes.length, 'moov');
  if (!moov) throw new UnsupportedMp4Error('no moov box (not a progressive MP4 or truncated)');

  const fragmentStats = parseFragmentStats(bytes, moov);
  const fragmented = fragmentStats.size > 0 || findBox(bytes, 0, bytes.length, 'moof') !== undefined;
  const tracks: Mp4MetadataTrack[] = [];
  let durationSec: number | null = null;

  for (const trak of iterBoxes(bytes, moov.bodyStart, moov.bodyEnd)) {
    if (trak.type !== 'trak') continue;
    const tkhd = findBox(bytes, trak.bodyStart, trak.bodyEnd, 'tkhd');
    const trackId = tkhd ? parseTkhdTrackId(bytes, tkhd) : null;
    const mdia = findBox(bytes, trak.bodyStart, trak.bodyEnd, 'mdia');
    if (!mdia) continue;
    const hdlr = findBox(bytes, mdia.bodyStart, mdia.bodyEnd, 'hdlr');
    const handler = hdlr ? hdlrType(bytes, hdlr) : '';
    const mdhd = findBox(bytes, mdia.bodyStart, mdia.bodyEnd, 'mdhd');
    const { stbl, timescale } = locateStbl(bytes, trak);
    const stsd = findBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'stsd');
    if (!stsd) continue;

    const frag = trackId !== null ? fragmentStats.get(trackId) : undefined;
    const mdhdDurationTicks = mdhd ? parseMdhdDurationTicks(bytes, mdhd) : 0;
    const durationTicks = mdhdDurationTicks > 0 ? mdhdDurationTicks : frag?.maxEndTicks ?? 0;
    const durationUs = durationTicks > 0 ? Math.round((durationTicks * 1_000_000) / timescale) : null;
    if (durationUs !== null) durationSec = Math.max(durationSec ?? 0, durationUs / 1_000_000);
    const sampleCount = frag?.sampleCount ?? 0;

    if (handler === 'vide') {
      const sampleDesc = parseStsd(bytes, stsd);
      const config: Mp4VideoConfig = {
        codec: sampleDesc.token,
        codecString: sampleDesc.codecString,
        codedWidth: sampleDesc.width,
        codedHeight: sampleDesc.height,
        timescale,
      };
      if (sampleDesc.description) config.description = sampleDesc.description;
      tracks.push({ kind: 'video', config, samples: [], sampleCount, durationUs });
    } else if (handler === 'soun') {
      const audioDesc = parseAudioStsd(bytes, stsd);
      if (!audioDesc) continue;
      const config: Mp4AudioConfig = {
        codec: audioDesc.token,
        codecString: audioDesc.codecString,
        audioObjectType: audioDesc.audioObjectType,
        sampleRate: audioDesc.sampleRate,
        channels: audioDesc.channels,
        timescale,
      };
      if (audioDesc.description) config.description = audioDesc.description;
      tracks.push({ kind: 'audio', config, samples: [], sampleCount, durationUs });
    }
  }

  if (tracks.length === 0) throw new UnsupportedMp4Error('no metadata-readable video/audio track found in moov');
  return { tracks, durationSec, fragmented };
}

/**
 * Demux the first video track of a progressive or addressable flat/hybrid-fragmented MP4/MOV into
 * ordered encoded samples + decoder config. Thin wrapper over {@link demuxMp4Tracks}.
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
