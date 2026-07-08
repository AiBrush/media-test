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
  /** true when the size vint was Matroska "unknown size" (all data bits set). */
  unknown: boolean;
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
  return { id: id.value, bodyStart, bodyEnd, unknown: size.unknown };
}

/**
 * Iterate the child elements of [start,end). Bounded; stops on malformed/non-advancing elements.
 * `limit` caps the iteration count (default 8192, ample for structure elements); packet parsing over
 * huge clusters passes a larger, byte-derived bound so a many-thousand-block cluster is not truncated.
 */
function ebmlChildren(bytes: Uint8Array, start: number, end: number, limit = 8192): Element[] {
  const out: Element[] = [];
  let pos = start;
  let guard = 0;
  while (pos < end && guard++ < limit) {
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
// Packet-table extraction (per-sample metadata) — no-engine, for the golden-packets comparator.
//
// Emits ONE row per coded sample/block, so an oracle can compare a candidate's OWN output packet table
// against the baked ffprobe golden (fixtures/golden/**.packets.json) with NO scored/reference engine.
// Same defensive contract as the structure readers: never throws, returns null (or bails to null) on
// anything malformed/ambiguous, and NEVER fabricates a size or timestamp it cannot read faithfully.
//
//   trackIndex : moov `trak` order (MP4) / `Tracks` declaration order (EBML) == ffprobe stream_index.
//   size       : coded sample bytes (MP4 stsz/stz2; EBML block payload after the block header).
//   dtsUs/ptsUs: rounded µs. MP4 dts=Σstts, pts=dts+ctts, over the mdhd (media) timescale. EBML has no
//                per-block DTS, so dts=pts=(clusterTC+relTC)·TimecodeScale/1000; a track whose block
//                PTS is non-monotonic in file order carries B-frame reorder whose true DTS a byte
//                reader cannot reconstruct → the whole parse bails to null (never a wrong table).
//   keyframe   : MP4 stss (absent ⇒ all sync); EBML SimpleBlock flag 0x80 / BlockGroup no ReferenceBlock.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * One demuxed packet's metadata. Structurally mirrors engine.ts `PacketInfo` on purpose (kept local so
 * this browser-pure module takes no dependency on the engine contract). The oracle's shared comparator
 * consumes this shape directly.
 */
export interface PacketRow {
  trackIndex: number;
  size: number;
  ptsUs: number;
  dtsUs: number;
  keyframe: boolean;
}

/** Reject absurd sample/entry counts BEFORE allocating (a corrupt box could claim billions). */
const MAX_SAMPLES = 50_000_000;

// ── ISO-BMFF sample tables ──────────────────────────────────────────────────────────────────────

/** mdhd → media timescale (NOT mvhd's movie timescale). Handles version 0/1. 0 when unreadable. */
function parseMdhdTimescale(dv: DataView, box: Box): number {
  const b = box.bodyStart;
  if (b + 4 > box.end || b >= dv.byteLength) return 0;
  const version = dv.getUint8(b);
  // v0: version+flags(4) creation(4) modification(4) timescale(4); v1: …creation(8) modification(8) timescale(4)
  return version === 1 ? u32(dv, b + 20) : u32(dv, b + 12);
}

/** stsz/stz2 → per-sample sizes in decode order. null when unreadable. */
function parseSampleSizes(dv: DataView, box: Box): number[] | null {
  const b = box.bodyStart;
  if (box.type === 'stsz') {
    if (b + 12 > box.end) return null;
    const sampleSize = u32(dv, b + 4);
    const count = u32(dv, b + 8);
    if (count > MAX_SAMPLES) return null;
    if (sampleSize !== 0) return new Array<number>(count).fill(sampleSize); // constant-size: no table follows
    const sizes = new Array<number>(count);
    let p = b + 12;
    for (let i = 0; i < count; i++) {
      if (p + 4 > box.end) return null;
      sizes[i] = u32(dv, p);
      p += 4;
    }
    return sizes;
  }
  // stz2: version+flags(4) reserved(3) field_size(1) sample_count(4) then packed sizes (4/8/16-bit).
  if (box.type === 'stz2') {
    if (b + 12 > box.end) return null;
    const fieldSize = dv.getUint8(b + 7);
    const count = u32(dv, b + 8);
    if (count > MAX_SAMPLES) return null;
    const sizes = new Array<number>(count);
    const p = b + 12;
    if (fieldSize === 16) {
      for (let i = 0; i < count; i++) {
        const off = p + i * 2;
        if (off + 2 > box.end) return null;
        sizes[i] = u16(dv, off);
      }
    } else if (fieldSize === 8) {
      for (let i = 0; i < count; i++) {
        const off = p + i;
        if (off + 1 > box.end) return null;
        sizes[i] = dv.getUint8(off);
      }
    } else if (fieldSize === 4) {
      for (let i = 0; i < count; i++) {
        const off = p + (i >> 1);
        if (off + 1 > box.end) return null;
        const byte = dv.getUint8(off);
        sizes[i] = (i & 1) === 0 ? byte >> 4 : byte & 0x0f;
      }
    } else {
      return null;
    }
    return sizes;
  }
  return null;
}

/** stts → per-sample cumulative DTS in timescale units (decode order). null when unreadable. */
function parseSttsDts(dv: DataView, box: Box): number[] | null {
  const b = box.bodyStart;
  if (b + 8 > box.end) return null;
  const entryCount = u32(dv, b + 4);
  if (entryCount > MAX_SAMPLES) return null;
  const dts: number[] = [];
  let p = b + 8;
  let t = 0;
  for (let e = 0; e < entryCount; e++) {
    if (p + 8 > box.end) break;
    const cnt = u32(dv, p);
    const delta = u32(dv, p + 4);
    p += 8;
    if (cnt > MAX_SAMPLES || dts.length + cnt > MAX_SAMPLES) return null;
    for (let i = 0; i < cnt; i++) {
      dts.push(t);
      t += delta;
    }
  }
  return dts;
}

/**
 * ctts → per-sample composition offset in timescale units. version 1 is signed int32 by spec; version
 * 0 is nominally uint32 but MOV/QuickTime (and thus ffmpeg/ffprobe, which bakes the golden) interpret it
 * as SIGNED int32 — real files carry negative offsets like 0xFFFFFFD8 (=-40). We read signed for both so
 * pts = dts + ctts matches ffprobe (a genuine >2^31 positive offset would be ~millions of seconds, so
 * signed interpretation is safe across the corpus).
 */
function parseCttsOffsets(dv: DataView, box: Box): number[] | null {
  const b = box.bodyStart;
  if (b + 8 > box.end) return null;
  const entryCount = u32(dv, b + 4);
  if (entryCount > MAX_SAMPLES) return null;
  const offs: number[] = [];
  let p = b + 8;
  for (let e = 0; e < entryCount; e++) {
    if (p + 8 > box.end) break;
    const cnt = u32(dv, p);
    const off = dv.getInt32(p + 4);
    p += 8;
    if (cnt > MAX_SAMPLES || offs.length + cnt > MAX_SAMPLES) return null;
    for (let i = 0; i < cnt; i++) offs.push(off);
  }
  return offs;
}

/** stss → set of 1-based sync (keyframe) sample numbers. null when unreadable. */
function parseStssSet(dv: DataView, box: Box): Set<number> | null {
  const b = box.bodyStart;
  if (b + 8 > box.end) return null;
  const entryCount = u32(dv, b + 4);
  if (entryCount > MAX_SAMPLES) return null;
  const set = new Set<number>();
  let p = b + 8;
  for (let e = 0; e < entryCount; e++) {
    if (p + 4 > box.end) break;
    set.add(u32(dv, p));
    p += 4;
  }
  return set;
}

/**
 * Emit one PacketRow per sample for a single `trak`. Returns false to signal a FATAL parse problem (the
 * caller then bails the whole file to null — an incomplete packet table would mis-compare vs golden).
 * A trak with no media/sample table simply emits nothing and returns true.
 */
function parseTrakPackets(
  bytes: Uint8Array,
  dv: DataView,
  trak: Box,
  trackIndex: number,
  out: PacketRow[],
): boolean {
  const trakChildren = readBoxes(bytes, dv, trak.bodyStart, trak.end);
  const mdia = findBox(trakChildren, 'mdia');
  if (!mdia) return true;
  const mdiaChildren = readBoxes(bytes, dv, mdia.bodyStart, mdia.end);
  const mdhd = findBox(mdiaChildren, 'mdhd');
  const timescale = mdhd ? parseMdhdTimescale(dv, mdhd) : 0;
  const minf = findBox(mdiaChildren, 'minf');
  if (!minf) return true;
  const stbl = findBox(readBoxes(bytes, dv, minf.bodyStart, minf.end), 'stbl');
  if (!stbl) return true;
  const stblChildren = readBoxes(bytes, dv, stbl.bodyStart, stbl.end);
  const stszBox = findBox(stblChildren, 'stsz') ?? findBox(stblChildren, 'stz2');
  if (!stszBox) return true; // no sample sizes → no packets for this trak
  const sizes = parseSampleSizes(dv, stszBox);
  if (!sizes) return false;
  const n = sizes.length;
  if (n === 0) return true; // e.g. a fragmented moov (samples live in moof) — handled by the caller
  if (!timescale || timescale <= 0) return false; // cannot express timestamps → fatal

  const sttsBox = findBox(stblChildren, 'stts');
  const dts = sttsBox ? parseSttsDts(dv, sttsBox) : null;
  if (!dts || dts.length < n) return false;
  const cttsBox = findBox(stblChildren, 'ctts');
  const cts = cttsBox ? parseCttsOffsets(dv, cttsBox) : null;
  if (cttsBox && (!cts || cts.length < n)) return false;
  const stssBox = findBox(stblChildren, 'stss');
  const syncSet = stssBox ? parseStssSet(dv, stssBox) : null;
  if (stssBox && !syncSet) return false;

  for (let i = 0; i < n; i++) {
    const d = dts[i]!;
    const c = cts ? (cts[i] ?? 0) : 0;
    out.push({
      trackIndex,
      size: sizes[i]!,
      dtsUs: Math.round((d / timescale) * 1e6),
      ptsUs: Math.round(((d + c) / timescale) * 1e6),
      keyframe: syncSet ? syncSet.has(i + 1) : true, // absent stss ⇒ every sample is a sync sample
    });
  }
  return true;
}

/**
 * Parse ISO-BMFF (MP4/MOV/M4A) → per-sample packet table from the moov sample tables. Returns null when
 * not parseable, or when the file is FRAGMENTED (mvex/moof) — those carry their samples in movie
 * fragments this sample-table reader deliberately does not decode, so it honestly returns null (the
 * oracle then routes to NA) rather than emit an empty/partial table. Never throws.
 */
export function readMp4Packets(bytes: Uint8Array): PacketRow[] | null {
  try {
    if (!bytes || bytes.length < 8) return null;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const top = readBoxes(bytes, dv, 0, bytes.length);
    const moov = findBox(top, 'moov');
    if (!moov) return null;
    if (findBox(top, 'moof')) return null; // fragmented: samples in movie fragments, not moov stbl
    const moovChildren = readBoxes(bytes, dv, moov.bodyStart, moov.end);
    if (findBox(moovChildren, 'mvex')) return null; // declares fragmentation → moov stbl is empty

    const out: PacketRow[] = [];
    let trackIndex = 0;
    let sawTrak = false;
    for (const child of moovChildren) {
      if (child.type !== 'trak') continue;
      sawTrak = true;
      if (!parseTrakPackets(bytes, dv, child, trackIndex, out)) return null;
      trackIndex++;
    }
    if (!sawTrak) return null;
    return out;
  } catch {
    return null;
  }
}

// ── EBML block tables ─────────────────────────────────────────────────────────────────────────────

const EBML_BLOCK = {
  Timecode: 0xe7,
  SimpleBlock: 0xa3,
  BlockGroup: 0xa0,
  Block: 0xa1,
  ReferenceBlock: 0xfb,
  TrackNumber: 0xd7,
} as const;

/**
 * Parse a SimpleBlock/Block header at [start,end) → one PacketRow. Returns:
 *   PacketRow  — a laced-free block for a mapped track,
 *   null       — FATAL (malformed header, or LACING which this reader will not fabricate) → bail file,
 *   undefined  — SKIP (block for a track absent from the Tracks map; defensive, not fatal).
 * `keyframe` comes from the SimpleBlock flag byte, or (BlockGroup) the caller's ReferenceBlock check.
 */
function parseEbmlBlock(
  bytes: Uint8Array,
  start: number,
  end: number,
  clusterTc: number,
  timecodeScale: number,
  trackIndexByNumber: Map<number, number>,
  keyframeFromFlags: boolean,
  keyframeOverride: boolean,
): PacketRow | null | undefined {
  const tn = readVint(bytes, start, end, false);
  if (!tn) return null;
  let p = start + tn.length;
  if (p + 3 > end) return null; // need int16 rel timecode + 1 flag byte
  const relRaw = (u8(bytes, p) << 8) | u8(bytes, p + 1);
  const rel = relRaw >= 0x8000 ? relRaw - 0x10000 : relRaw; // signed int16
  p += 2;
  const flags = u8(bytes, p);
  p += 1;
  if (((flags >> 1) & 0x03) !== 0) return null; // lacing present → bail (never fabricate laced sizes/ts)
  const trackIndex = trackIndexByNumber.get(tn.value);
  if (trackIndex === undefined) return undefined; // block for an undeclared track → skip
  const size = Math.max(0, end - p); // remaining block payload = the single (unlaced) frame
  const ptsUs = Math.round(((clusterTc + rel) * timecodeScale) / 1000); // TimecodeScale is ns → µs
  return {
    trackIndex,
    size,
    ptsUs,
    dtsUs: ptsUs,
    keyframe: keyframeFromFlags ? (flags & 0x80) !== 0 : keyframeOverride,
  };
}

/**
 * Parse WebM/MKV → per-block packet table (Segment → Cluster* → SimpleBlock/BlockGroup). Returns null
 * when not parseable, on an unknown-size cluster, on lacing, or on B-frame reorder (a track whose block
 * PTS is non-monotonic in file order — this reader carries no separate DTS and will not fabricate one).
 * Never throws.
 */
export function readWebmPackets(bytes: Uint8Array): PacketRow[] | null {
  try {
    if (!bytes || bytes.length < 8) return null;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const topLevel = ebmlChildren(bytes, 0, bytes.length);
    const segment = topLevel.find((el) => el.id === EBML_ID.Segment);
    if (!segment) return null;
    const bound = segment.bodyEnd - segment.bodyStart; // upper bound on element count within the segment
    const segChildren = ebmlChildren(bytes, segment.bodyStart, segment.bodyEnd, bound);

    // TimecodeScale (ns), default 1e6.
    let timecodeScale = 1_000_000;
    const info = segChildren.find((el) => el.id === EBML_ID.Info);
    if (info) {
      for (const el of ebmlChildren(bytes, info.bodyStart, info.bodyEnd)) {
        if (el.id === EBML_ID.TimecodeScale) {
          const v = ebmlUint(dv, el);
          if (v > 0) timecodeScale = v;
        }
      }
    }

    // TrackNumber → 0-based declaration-order index (== ffprobe stream_index). Also record which
    // declaration indices are AUDIO: ffmpeg/ffprobe flags every audio packet as a keyframe regardless
    // of the block's own flag (audio frames are independently decodable), so we mirror that below.
    const tracksEl = segChildren.find((el) => el.id === EBML_ID.Tracks);
    if (!tracksEl) return null;
    const trackIndexByNumber = new Map<number, number>();
    const audioTrackIndices = new Set<number>();
    let decl = 0;
    for (const te of ebmlChildren(bytes, tracksEl.bodyStart, tracksEl.bodyEnd)) {
      if (te.id !== EBML_ID.TrackEntry) continue;
      let tn = -1;
      let trackType = -1;
      for (const c of ebmlChildren(bytes, te.bodyStart, te.bodyEnd)) {
        if (c.id === EBML_BLOCK.TrackNumber) tn = ebmlUint(dv, c);
        else if (c.id === EBML_ID.TrackType) trackType = ebmlUint(dv, c);
      }
      if (tn >= 0) trackIndexByNumber.set(tn, decl);
      if (trackType === 2) audioTrackIndices.add(decl); // Matroska TrackType 2 = audio
      decl++;
    }
    if (trackIndexByNumber.size === 0) return null;

    const out: PacketRow[] = [];
    for (const cluster of segChildren) {
      if (cluster.id !== EBML_ID.Cluster) continue;
      if (cluster.unknown) return null; // unknown-size cluster: cannot bound blocks safely → bail
      const clusterBound = cluster.bodyEnd - cluster.bodyStart;
      const clusterChildren = ebmlChildren(bytes, cluster.bodyStart, cluster.bodyEnd, clusterBound);
      let clusterTc = 0;
      let sawTc = false;
      for (const c of clusterChildren) {
        if (c.id === EBML_BLOCK.Timecode) {
          clusterTc = ebmlUint(dv, c);
          sawTc = true;
          break;
        }
      }
      if (!sawTc) return null; // a cluster without a Timecode cannot place its blocks
      for (const c of clusterChildren) {
        if (c.id === EBML_BLOCK.SimpleBlock) {
          const row = parseEbmlBlock(bytes, c.bodyStart, c.bodyEnd, clusterTc, timecodeScale, trackIndexByNumber, true, false);
          if (row === null) return null;
          if (row) {
            if (audioTrackIndices.has(row.trackIndex)) row.keyframe = true;
            out.push(row);
          }
        } else if (c.id === EBML_BLOCK.BlockGroup) {
          const groupChildren = ebmlChildren(bytes, c.bodyStart, c.bodyEnd);
          const blockEl = groupChildren.find((g) => g.id === EBML_BLOCK.Block);
          if (!blockEl) continue;
          const hasRef = groupChildren.some((g) => g.id === EBML_BLOCK.ReferenceBlock);
          const row = parseEbmlBlock(bytes, blockEl.bodyStart, blockEl.bodyEnd, clusterTc, timecodeScale, trackIndexByNumber, false, !hasRef);
          if (row === null) return null;
          if (row) {
            if (audioTrackIndices.has(row.trackIndex)) row.keyframe = true;
            out.push(row);
          }
        }
      }
    }

    // B-frame reorder guard: with dts=pts, each track's PTS must be non-decreasing in file (decode)
    // order. A decrease means presentation≠decode order (reorder), whose true DTS a container-only
    // reader cannot reconstruct → bail rather than emit a table that mis-sorts against the golden.
    const lastByTrack = new Map<number, number>();
    for (const row of out) {
      const prev = lastByTrack.get(row.trackIndex);
      if (prev !== undefined && row.ptsUs < prev) return null;
      lastByTrack.set(row.trackIndex, row.ptsUs);
    }

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

/**
 * Sniff the header / `containerHint` and dispatch to the matching packet-table reader (same routing as
 * readOutputStructure). Returns `PacketRow[]` on a faithful parse, or null when the container is outside
 * mp4/webm coverage OR the parse bails (fragmented mp4, unknown-size cluster, lacing, B-frame reorder,
 * truncation). Never throws. A null result means "packet truth unavailable" — the oracle routes to NA.
 */
export function readOutputPackets(bytes: Uint8Array, containerHint?: string): PacketRow[] | null {
  try {
    if (!bytes || bytes.length < 8) return null;

    if (containerHint) {
      const h = containerHint.toLowerCase();
      if (/webm|mkv|matroska/.test(h)) return readWebmPackets(bytes);
      if (/mp4|mov|m4a|m4v|m4b|quicktime|\bqt\b|isom|iso-?bmff|3gp|mpeg-?4/.test(h)) {
        return readMp4Packets(bytes);
      }
    }

    if (looksEbml(bytes)) return readWebmPackets(bytes);
    if (looksIsoBmff(bytes)) return readMp4Packets(bytes);

    // Ambiguous header — try both; whichever parses wins (mp4 first, it's the common output).
    return readMp4Packets(bytes) ?? readWebmPackets(bytes);
  } catch {
    return null;
  }
}
