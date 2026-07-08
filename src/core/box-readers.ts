/**
 * src/core/box-readers.ts — self-contained, NO-ENGINE byte parser for media OUTPUT structure.
 *
 * Reads track layout (video/audio/other + codec + dimensions) and duration straight from raw
 * container bytes for ISO-BMFF (MP4/MOV/M4A) and EBML (WebM/MKV). Oracles use this to verify a
 * candidate engine's OWN output WITHOUT invoking any scored engine, so no engine can grade itself.
 *
 * HARD CONTRACTS (do not weaken):
 *   1. NEVER throws — every public entry point is wrapped so malformed / truncated / adversarial
 *      bytes return `null` (or a partial structure with null codecs) instead of an exception.
 *   2. NEVER emits a codec token that could cause a false FAIL — the returned `codec` strings are a
 *      SUBSET of the golden's exact codec-token vocabulary (learned from fixtures/golden/**.meta.json
 *      and fixtures/media/scenarios/_sources.ndjson). When a fourcc / CodecID cannot be mapped to a
 *      golden token with confidence, the codec is `null` and the oracle SKIPS the codec assertion
 *      rather than failing on a token the golden never uses.
 *   3. Browser-safe — only `Uint8Array` + `DataView`; no DOM, no Node APIs, no dependencies.
 *
 * Golden codec vocabulary this maps into (verbatim strings, observed across 1375 goldens):
 *   video : 'h264' 'hevc' 'vp9' 'vp8' 'av1' 'mjpeg'            (image codecs png/webp live in image
 *                                                                containers this parser never sees)
 *   audio : 'aac' 'opus' 'vorbis' 'flac' 'mp3' 'alac'
 *   NOTE  : H.265 is written 'hevc' (NOT 'h265'); there is NO 'ac3' token in the golden vocabulary;
 *           PCM is bit-depth/endian specific ('pcm-s16' / 'pcm-s16be' / 'pcm-s24' / 'pcm-s24be' /
 *           'pcm-f32' …) and is NOT derivable from a fourcc/CodecID alone, so PCM → null (safe).
 *   Any 'other'-type track uses codec '' in the golden; this parser returns null for it, which the
 *   codec assertion treats identically (null ⇒ skipped).
 */

export interface ReadTrack {
  type: 'video' | 'audio' | 'other';
  codec: string | null;
  width?: number;
  height?: number;
}

export interface ReadStructure {
  container: 'mp4' | 'webm';
  tracks: ReadTrack[];
  durationSec?: number;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Codec vocabulary mapping (the ONLY place a raw fourcc / CodecID becomes a golden token).
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Map a raw ISO-BMFF fourcc (e.g. 'avc1', 'mp4a', 'hev1') or an EBML CodecID (e.g. 'V_VP9',
 * 'A_OPUS', 'V_MPEG4/ISO/AVC') to the golden's exact codec-token string. Returns `null` when the
 * codec cannot be mapped with confidence — the caller then omits the codec assertion rather than
 * risk a false FAIL on a token the golden never emits.
 */
export function canonicalCodecToken(raw: string): string | null {
  try {
    if (typeof raw !== 'string') return null;
    // Strip trailing NUL padding (EBML strings) and surrounding whitespace ('qt' fourccs pad w/ 0x20).
    const s = raw.replace(/\0+$/g, '').trim();
    if (!s) return null;

    // ── ISO-BMFF / QuickTime fourccs (4 chars). Compared case-insensitively ('Opus', 'fLaC', …). ──
    switch (s.toLowerCase()) {
      // video
      case 'avc1':
      case 'avc3':
        return 'h264';
      case 'hev1':
      case 'hvc1':
      case 'hev2':
      case 'hvc2':
        return 'hevc';
      case 'vp08':
        return 'vp8';
      case 'vp09':
        return 'vp9';
      case 'av01':
        return 'av1';
      case 'mjpa':
      case 'mjpb':
      case 'jpeg':
        return 'mjpeg';
      // audio
      case 'mp4a': // MPEG-4 audio sample entry — AAC across the entire corpus & golden vocabulary.
        return 'aac';
      case 'alac':
        return 'alac';
      case 'opus':
        return 'opus';
      case 'flac':
        return 'flac';
      case '.mp3':
      case 'mp3 ':
        return 'mp3';
      // NOTE: PCM fourccs (twos/sowt/lpcm/in24/in32/fl32/fl64/raw /NONE) and AC-3 (ac-3/ec-3) are
      // deliberately NOT mapped here — their exact golden token (pcm-s16 vs pcm-s24 vs pcm-s16be …,
      // or none at all for ac3) is not derivable from the fourcc alone → fall through to null.
      default:
        break;
    }

    // ── EBML CodecIDs (Matroska/WebM). Prefix-matched, uppercased. ──
    const up = s.toUpperCase();
    // video
    if (up.startsWith('V_VP9')) return 'vp9';
    if (up.startsWith('V_VP8')) return 'vp8';
    if (up.startsWith('V_AV1')) return 'av1';
    if (up.startsWith('V_MPEGH/ISO/HEVC') || up.startsWith('V_HEVC')) return 'hevc';
    if (up.startsWith('V_MPEG4/ISO/AVC') || up.startsWith('V_AVC')) return 'h264';
    if (up.startsWith('V_MJPEG')) return 'mjpeg';
    // audio
    if (up.startsWith('A_OPUS')) return 'opus';
    if (up.startsWith('A_VORBIS')) return 'vorbis';
    if (up.startsWith('A_AAC')) return 'aac';
    if (up.startsWith('A_FLAC')) return 'flac';
    if (up.startsWith('A_ALAC')) return 'alac';
    if (up.startsWith('A_MPEG/L3')) return 'mp3'; // NOT A_MPEG/L1|L2 (mp1/mp2 — absent from vocab).

    // Unknown / ambiguous (PCM variants, AC-3, subtitles, timecode, data) → null (oracle skips it).
    return null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Low-level byte helpers (bounds-checked; never throw).
// ─────────────────────────────────────────────────────────────────────────────────────────────────

function ascii(bytes: Uint8Array, off: number, len: number): string {
  let out = '';
  const end = Math.min(off + len, bytes.length);
  for (let i = off; i < end; i++) out += String.fromCharCode(bytes[i] ?? 0);
  return out;
}

function u8(bytes: Uint8Array, off: number): number {
  return bytes[off] ?? 0;
}

function u16(dv: DataView, off: number): number {
  return off + 2 <= dv.byteLength ? dv.getUint16(off) : 0;
}

function u32(dv: DataView, off: number): number {
  return off + 4 <= dv.byteLength ? dv.getUint32(off) : 0;
}

/** 64-bit big-endian as a JS number (exact up to 2^53; container sizes/durations never exceed that). */
function u64(dv: DataView, off: number): number {
  if (off + 8 > dv.byteLength) return 0;
  const hi = dv.getUint32(off);
  const lo = dv.getUint32(off + 4);
  return hi * 0x1_0000_0000 + lo;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// ISO-BMFF (MP4 / MOV / M4A) reader.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

interface Box {
  type: string;
  /** first byte of the box payload (after size+type, and after largesize when size===1). */
  bodyStart: number;
  /** exclusive end of this box (clamped to the buffer). */
  end: number;
}

/** Plausible top-level ISO-BMFF box types (used only for header sniffing). */
const ISO_TOP_TYPES = new Set([
  'ftyp', 'styp', 'moov', 'moof', 'mdat', 'free', 'skip', 'wide', 'pnot', 'uuid', 'meta', 'mfra',
  'sidx', 'ssix', 'prft', 'emsg',
]);

/** Walk the boxes in bytes[start,end). Bounded; stops on any malformed/oversized/non-advancing box. */
function readBoxes(bytes: Uint8Array, dv: DataView, start: number, end: number): Box[] {
  const boxes: Box[] = [];
  let pos = start;
  let guard = 0;
  while (pos + 8 <= end && guard++ < 4096) {
    const size32 = u32(dv, pos);
    const type = ascii(bytes, pos + 4, 4);
    let bodyStart = pos + 8;
    let boxEnd: number;
    if (size32 === 1) {
      // 64-bit largesize follows the type.
      if (pos + 16 > end) break;
      const large = u64(dv, pos + 8);
      bodyStart = pos + 16;
      if (large < 16) break; // impossible box size → bail.
      boxEnd = pos + large;
    } else if (size32 === 0) {
      // Extends to the end of the enclosing range (only valid for the final box).
      boxEnd = end;
    } else {
      if (size32 < 8) break; // smaller than its own header → malformed.
      boxEnd = pos + size32;
    }
    if (boxEnd <= pos) break; // non-advancing → bail (never loop forever).
    // Record with the payload clamped to the available bytes so leaf parsers stay in-bounds even if
    // the declared box overruns a truncated slice.
    boxes.push({ type, bodyStart, end: Math.min(boxEnd, end) });
    if (boxEnd > end) break; // can't advance past a box that overruns the slice.
    pos = boxEnd;
  }
  return boxes;
}

function findBox(boxes: Box[], type: string): Box | undefined {
  return boxes.find((b) => b.type === type);
}

/** mvhd → { timescale, duration }. durationSec computed by caller. */
function parseMvhd(dv: DataView, box: Box): { timescale: number; duration: number } | null {
  const b = box.bodyStart;
  if (b + 4 > box.end || b >= dv.byteLength) return null;
  const version = dv.getUint8(b);
  if (version === 1) {
    // version(1)+flags(3) creation(8) modification(8) timescale(4) duration(8)
    const timescale = u32(dv, b + 20);
    const duration = u64(dv, b + 24);
    // 0xFFFFFFFFFFFFFFFF ⇒ unknown; our u64 caps at 2^53 so treat >= 2^53 as unknown too.
    if (duration >= 0x1f_ffff_ffff_ffff) return { timescale, duration: 0 };
    return { timescale, duration };
  }
  // version 0: creation(4) modification(4) timescale(4) duration(4)
  const timescale = u32(dv, b + 12);
  const duration = u32(dv, b + 16);
  if (duration === 0xffff_ffff) return { timescale, duration: 0 }; // unknown sentinel.
  return { timescale, duration };
}

/** tkhd trailing 8 bytes = width/height as 16.16 fixed-point (integer part only). 0 for audio. */
function parseTkhdDims(dv: DataView, box: Box): { w: number; h: number } {
  const wOff = box.end - 8;
  const hOff = box.end - 4;
  if (wOff < box.bodyStart) return { w: 0, h: 0 };
  return { w: u32(dv, wOff) >>> 16, h: u32(dv, hOff) >>> 16 };
}

/** hdlr handler_type → track kind. */
function parseHandlerType(bytes: Uint8Array, box: Box): 'video' | 'audio' | 'other' {
  // version(1)+flags(3) pre_defined(4) handler_type(4)
  const handler = ascii(bytes, box.bodyStart + 8, 4);
  if (handler === 'vide') return 'video';
  if (handler === 'soun') return 'audio';
  return 'other';
}

/**
 * Scan a sample-entry box body for the CENC `frma` (Original Format) box and return its data_format
 * fourcc. `frma` is always a 12-byte box (`[size=12]['frma'][4cc]`), so we match on that exact shape
 * to avoid false hits in binary. Returns null when absent.
 */
function findFrma(bytes: Uint8Array, dv: DataView, start: number, end: number): string | null {
  const hardEnd = Math.min(end, bytes.length) - 8;
  for (let i = start; i <= hardEnd; i++) {
    if (
      u8(bytes, i + 4) === 0x66 && // 'f'
      u8(bytes, i + 5) === 0x72 && // 'r'
      u8(bytes, i + 6) === 0x6d && // 'm'
      u8(bytes, i + 7) === 0x61 && // 'a'
      u32(dv, i) === 12 // frma box size is always 12
    ) {
      return ascii(bytes, i + 8, 4).trim() || null;
    }
  }
  return null;
}

/** stsd → first sample-entry fourcc + (for visual entries) width/height. */
function parseStsd(
  bytes: Uint8Array,
  dv: DataView,
  box: Box,
  isVideo: boolean,
): { fourcc: string | null; w: number; h: number } {
  // version(1)+flags(3) entry_count(4) then the first sample-entry box: size(4) type(4) …
  const entryStart = box.bodyStart + 8;
  if (entryStart + 8 > box.end) return { fourcc: null, w: 0, h: 0 };
  const entrySize = u32(dv, entryStart);
  const entryEnd = entrySize >= 8 ? Math.min(entryStart + entrySize, box.end) : box.end;
  let fourcc = ascii(bytes, entryStart + 4, 4).trim();

  // CENC/CBCS encrypted entries ('encv'/'enca'/'encs') hide the real codec in sinf→frma. Unwrap it —
  // frma is authoritative, so the token stays golden-exact with zero false-FAIL risk. (The encrypted
  // entry keeps the underlying VisualSampleEntry layout, so dimensions are still read below.)
  if (fourcc === 'encv' || fourcc === 'enca' || fourcc === 'encs') {
    const original = findFrma(bytes, dv, entryStart + 8, entryEnd);
    if (original) fourcc = original;
  }

  let w = 0;
  let h = 0;
  if (isVideo) {
    // VisualSampleEntry: sampleEntryBody = entryStart+8; width @ +24, height @ +26 (both u16).
    const seBody = entryStart + 8;
    if (seBody + 28 <= box.end) {
      w = u16(dv, seBody + 24);
      h = u16(dv, seBody + 26);
    }
  }
  return { fourcc: fourcc || null, w, h };
}

/** Descend a `trak` into a single ReadTrack. */
function parseTrak(bytes: Uint8Array, dv: DataView, trak: Box): ReadTrack | null {
  const trakChildren = readBoxes(bytes, dv, trak.bodyStart, trak.end);
  const tkhd = findBox(trakChildren, 'tkhd');
  const mdia = findBox(trakChildren, 'mdia');
  if (!mdia) return null;

  const mdiaChildren = readBoxes(bytes, dv, mdia.bodyStart, mdia.end);
  const hdlr = findBox(mdiaChildren, 'hdlr');
  const type = hdlr ? parseHandlerType(bytes, hdlr) : 'other';

  // mdia → minf → stbl → stsd
  let fourcc: string | null = null;
  let stsdW = 0;
  let stsdH = 0;
  const minf = findBox(mdiaChildren, 'minf');
  if (minf) {
    const stbl = findBox(readBoxes(bytes, dv, minf.bodyStart, minf.end), 'stbl');
    if (stbl) {
      const stsd = findBox(readBoxes(bytes, dv, stbl.bodyStart, stbl.end), 'stsd');
      if (stsd) {
        const parsed = parseStsd(bytes, dv, stsd, type === 'video');
        fourcc = parsed.fourcc;
        stsdW = parsed.w;
        stsdH = parsed.h;
      }
    }
  }

  const track: ReadTrack = { type, codec: fourcc ? canonicalCodecToken(fourcc) : null };
  if (type === 'video') {
    // Prefer the visual sample-entry dimensions; fall back to tkhd.
    let w = stsdW;
    let h = stsdH;
    if ((!w || !h) && tkhd) {
      const td = parseTkhdDims(dv, tkhd);
      w = w || td.w;
      h = h || td.h;
    }
    if (w > 0) track.width = w;
    if (h > 0) track.height = h;
  }
  return track;
}

/** Parse ISO-BMFF (MP4/MOV) moov → track layout + duration. null if not parseable. Never throws. */
export function readMp4Structure(bytes: Uint8Array): ReadStructure | null {
  try {
    if (!bytes || bytes.length < 8) return null;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const top = readBoxes(bytes, dv, 0, bytes.length);
    const moov = findBox(top, 'moov');
    if (!moov) return null;

    const moovChildren = readBoxes(bytes, dv, moov.bodyStart, moov.end);

    let durationSec: number | undefined;
    const mvhd = findBox(moovChildren, 'mvhd');
    if (mvhd) {
      const parsed = parseMvhd(dv, mvhd);
      if (parsed && parsed.timescale > 0 && parsed.duration > 0) {
        durationSec = parsed.duration / parsed.timescale;
      }
    }

    const tracks: ReadTrack[] = [];
    for (const child of moovChildren) {
      if (child.type !== 'trak') continue;
      const t = parseTrak(bytes, dv, child);
      if (t) tracks.push(t);
    }

    const out: ReadStructure = { container: 'mp4', tracks };
    if (durationSec != null && isFinite(durationSec) && durationSec >= 0) out.durationSec = durationSec;
    return out;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// EBML (WebM / MKV) reader.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

const EBML_ID = {
  Header: 0x1a45dfa3,
  Segment: 0x18538067,
  Info: 0x1549a966,
  TimecodeScale: 0x2ad7b1,
  Duration: 0x4489,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackType: 0x83,
  CodecID: 0x86,
  Video: 0xe0,
  Audio: 0xe1,
  PixelWidth: 0xb0,
  PixelHeight: 0xba,
  Cluster: 0x1f43b675,
} as const;

interface Vint {
  /** value (element-ID form keeps the marker bits; size form strips them). */
  value: number;
  length: number;
  /** true when a size vint had all data bits set (Matroska "unknown size"). */
  unknown: boolean;
}

/** Read an EBML variable-length integer at `pos`. `keepMarker` true for element IDs. */
function readVint(bytes: Uint8Array, pos: number, end: number, keepMarker: boolean): Vint | null {
  if (pos >= end) return null;
  const first = u8(bytes, pos);
  if (first === 0) return null; // length would exceed 8 bytes — unsupported / malformed.
  let mask = 0x80;
  let length = 1;
  while (length <= 8 && (first & mask) === 0) {
    mask >>= 1;
    length++;
  }
  if (length > 8 || pos + length > end) return null;

  let unknown = true;
  let value: number;
  if (keepMarker) {
    value = first;
  } else {
    value = first & (mask - 1);
    if ((first & (mask - 1)) !== (mask - 1)) unknown = false;
  }
  for (let i = 1; i < length; i++) {
    const byte = u8(bytes, pos + i);
    if (byte !== 0xff) unknown = false;
    value = value * 256 + byte;
  }
  // For element IDs, "unknown" is meaningless; only size vints use it.
  return { value, length, unknown: keepMarker ? false : unknown };
}

interface Element {
  id: number;
  bodyStart: number;
  /** exclusive end (clamped to parentEnd; unknown-size ⇒ parentEnd). */
  bodyEnd: number;
}

function readElement(bytes: Uint8Array, pos: number, parentEnd: number): Element | null {
  const id = readVint(bytes, pos, parentEnd, true);
  if (!id) return null;
  const size = readVint(bytes, pos + id.length, parentEnd, false);
  if (!size) return null;
  const bodyStart = pos + id.length + size.length;
  if (bodyStart > parentEnd) return null;
  const bodyEnd = size.unknown ? parentEnd : Math.min(bodyStart + size.value, parentEnd);
  if (bodyEnd < bodyStart) return null;
  return { id: id.value, bodyStart, bodyEnd };
}

/** Iterate the child elements of [start,end). Bounded; stops on malformed/non-advancing elements. */
function ebmlChildren(bytes: Uint8Array, start: number, end: number): Element[] {
  const out: Element[] = [];
  let pos = start;
  let guard = 0;
  while (pos < end && guard++ < 8192) {
    const el = readElement(bytes, pos, end);
    if (!el) break;
    out.push(el);
    const next = el.bodyEnd;
    if (next <= pos) break; // non-advancing → bail.
    pos = next;
  }
  return out;
}

function ebmlUint(dv: DataView, el: Element): number {
  let v = 0;
  const end = Math.min(el.bodyEnd, dv.byteLength);
  for (let i = el.bodyStart; i < end; i++) v = v * 256 + (i < dv.byteLength ? dv.getUint8(i) : 0);
  return v;
}

function ebmlFloat(dv: DataView, el: Element): number | null {
  const len = el.bodyEnd - el.bodyStart;
  if (len === 4 && el.bodyStart + 4 <= dv.byteLength) return dv.getFloat32(el.bodyStart);
  if (len === 8 && el.bodyStart + 8 <= dv.byteLength) return dv.getFloat64(el.bodyStart);
  return null;
}

function ebmlString(bytes: Uint8Array, el: Element): string {
  return ascii(bytes, el.bodyStart, el.bodyEnd - el.bodyStart);
}

function parseTrackEntry(bytes: Uint8Array, dv: DataView, entry: Element): ReadTrack {
  let type: 'video' | 'audio' | 'other' = 'other';
  let codecId: string | null = null;
  let w = 0;
  let h = 0;
  for (const el of ebmlChildren(bytes, entry.bodyStart, entry.bodyEnd)) {
    switch (el.id) {
      case EBML_ID.TrackType: {
        const tt = ebmlUint(dv, el);
        type = tt === 1 ? 'video' : tt === 2 ? 'audio' : 'other';
        break;
      }
      case EBML_ID.CodecID:
        codecId = ebmlString(bytes, el);
        break;
      case EBML_ID.Video:
        for (const v of ebmlChildren(bytes, el.bodyStart, el.bodyEnd)) {
          if (v.id === EBML_ID.PixelWidth) w = ebmlUint(dv, v);
          else if (v.id === EBML_ID.PixelHeight) h = ebmlUint(dv, v);
        }
        break;
      default:
        break;
    }
  }
  const track: ReadTrack = { type, codec: codecId ? canonicalCodecToken(codecId) : null };
  if (type === 'video') {
    if (w > 0) track.width = w;
    if (h > 0) track.height = h;
  }
  return track;
}

/** Parse WebM/MKV Segment → Tracks + Info duration. null if not parseable. Never throws. */
export function readWebmStructure(bytes: Uint8Array): ReadStructure | null {
  try {
    if (!bytes || bytes.length < 8) return null;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    // Top level: EBML header then Segment.
    const topLevel = ebmlChildren(bytes, 0, bytes.length);
    const segment = topLevel.find((el) => el.id === EBML_ID.Segment);
    if (!segment) return null;

    const segChildren = ebmlChildren(bytes, segment.bodyStart, segment.bodyEnd);

    // ── Info → TimecodeScale (default 1e6 ns) + Duration (float, in timecode units) ──
    let durationSec: number | undefined;
    const info = segChildren.find((el) => el.id === EBML_ID.Info);
    if (info) {
      let timecodeScale = 1_000_000;
      let durationTicks: number | null = null;
      for (const el of ebmlChildren(bytes, info.bodyStart, info.bodyEnd)) {
        if (el.id === EBML_ID.TimecodeScale) timecodeScale = ebmlUint(dv, el) || timecodeScale;
        else if (el.id === EBML_ID.Duration) durationTicks = ebmlFloat(dv, el);
      }
      if (durationTicks != null && durationTicks > 0 && timecodeScale > 0) {
        durationSec = (durationTicks * timecodeScale) / 1e9;
      }
    }

    // ── Tracks → TrackEntry* ──
    const tracks: ReadTrack[] = [];
    const tracksEl = segChildren.find((el) => el.id === EBML_ID.Tracks);
    if (tracksEl) {
      for (const el of ebmlChildren(bytes, tracksEl.bodyStart, tracksEl.bodyEnd)) {
        if (el.id === EBML_ID.TrackEntry) tracks.push(parseTrackEntry(bytes, dv, el));
      }
    }

    // Nothing recognizable (no tracks and no duration) ⇒ not a usable parse.
    if (!tracksEl && durationSec == null) return null;

    const out: ReadStructure = { container: 'webm', tracks };
    if (durationSec != null && isFinite(durationSec) && durationSec >= 0) out.durationSec = durationSec;
    return out;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Dispatcher.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

function looksEbml(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    u8(bytes, 0) === 0x1a &&
    u8(bytes, 1) === 0x45 &&
    u8(bytes, 2) === 0xdf &&
    u8(bytes, 3) === 0xa3
  );
}

function looksIsoBmff(bytes: Uint8Array): boolean {
  // A top-level box type at offset 4 from a known ISO-BMFF set.
  return bytes.length >= 8 && ISO_TOP_TYPES.has(ascii(bytes, 4, 4));
}

/**
 * Sniff the header (EBML magic → webm; ftyp/moov box at offset 4 → mp4) and dispatch to the matching
 * reader. `containerHint` (e.g. an engine-reported container string) takes precedence when present.
 * Returns null when neither reader can make sense of the bytes. Never throws.
 */
export function readOutputStructure(bytes: Uint8Array, containerHint?: string): ReadStructure | null {
  try {
    if (!bytes || bytes.length < 8) return null;

    if (containerHint) {
      const h = containerHint.toLowerCase();
      if (/webm|mkv|matroska/.test(h)) return readWebmStructure(bytes);
      if (/mp4|mov|m4a|m4v|m4b|quicktime|\bqt\b|isom|iso-?bmff|3gp|mpeg-?4/.test(h)) {
        return readMp4Structure(bytes);
      }
    }

    if (looksEbml(bytes)) return readWebmStructure(bytes);
    if (looksIsoBmff(bytes)) return readMp4Structure(bytes);

    // Ambiguous header — try both; whichever parses wins (mp4 first, it's the common output).
    return readMp4Structure(bytes) ?? readWebmStructure(bytes);
  } catch {
    return null;
  }
}
