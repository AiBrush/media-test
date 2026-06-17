/**
 * src/engines/platform/demux-webm.ts — a MINIMAL Matroska/WebM (EBML) demuxer, just enough to feed
 * WebCodecs VideoDecoder: it walks Segment → Info (TimestampScale), Tracks (codec/dims/CodecPrivate)
 * and Clusters (SimpleBlock / BlockGroup) to emit the first video track's frames with timestamps and
 * keyframe flags.
 *
 * Scope (HONEST): unencrypted, non-lacing (or fixed/EBML lacing handled) WebM/MKV with VP8/VP9/AV1
 * (and H.264/HEVC-in-MKV). It does NOT implement seeking via Cues, chapters, or block lacing edge
 * cases beyond the common path; on anything it can't handle it throws {@link UnsupportedWebmError}.
 */

export class UnsupportedWebmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedWebmError';
  }
}

export interface WebmVideoConfig {
  codec: string; // canonical token
  codecString: string; // WebCodecs string
  codedWidth: number;
  codedHeight: number;
  description?: Uint8Array; // CodecPrivate (e.g. av1C, avcC inside MKV); often absent for VP8/VP9
  timescaleNs: number; // TimestampScale (ns per tick), default 1_000_000 (1ms)
}

export interface WebmSample {
  data: Uint8Array;
  ptsUs: number;
  dtsUs: number;
  durationUs: number;
  keyframe: boolean;
}

export interface WebmVideoTrack {
  config: WebmVideoConfig;
  samples: WebmSample[];
}

// ── EBML primitives ──────────────────────────────────────────────────────────────────────────

/** Read a variable-length integer (vint). `keepMarker` keeps the length-marker bit (for element IDs). */
function readVint(buf: Uint8Array, pos: number, keepMarker: boolean): { value: number; next: number; length: number } {
  const first = buf[pos];
  if (first === undefined) throw new UnsupportedWebmError('vint past end of buffer');
  let mask = 0x80;
  let length = 1;
  while (length <= 8 && !(first & mask)) {
    mask >>= 1;
    length++;
  }
  if (length > 8) throw new UnsupportedWebmError('invalid EBML vint length');
  let value = keepMarker ? first : first & (mask - 1);
  for (let i = 1; i < length; i++) {
    const b = buf[pos + i];
    if (b === undefined) throw new UnsupportedWebmError('vint truncated');
    value = value * 256 + b;
  }
  return { value, next: pos + length, length };
}

/** Read element ID (vint with marker kept) → returns the ID as a number + new position. */
function readId(buf: Uint8Array, pos: number): { id: number; next: number } {
  const { value, next } = readVint(buf, pos, true);
  return { id: value, next };
}

/** Read element size (vint, marker stripped). All-ones size means "unknown size" → returned as -1. */
function readSize(buf: Uint8Array, pos: number): { size: number; next: number } {
  const { value, next, length } = readVint(buf, pos, false);
  // Unknown size sentinel: all data bits set.
  const allOnes = Math.pow(2, 7 * length) - 1;
  return { size: value === allOnes ? -1 : value, next };
}

function readUint(buf: Uint8Array, pos: number, size: number): number {
  let v = 0;
  for (let i = 0; i < size; i++) v = v * 256 + (buf[pos + i] as number);
  return v;
}

function readFloat(buf: Uint8Array, pos: number, size: number): number {
  const dv = new DataView(buf.buffer, buf.byteOffset + pos, size);
  if (size === 4) return dv.getFloat32(0);
  if (size === 8) return dv.getFloat64(0);
  return 0;
}

// Matroska element IDs (full IDs incl. length marker).
const ID = {
  EBML: 0x1a45dfa3,
  Segment: 0x18538067,
  Info: 0x1549a966,
  TimestampScale: 0x2ad7b1,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackNumber: 0xd7,
  TrackType: 0x83,
  CodecID: 0x86,
  CodecPrivate: 0x63a2,
  Video: 0xe0,
  PixelWidth: 0xb0,
  PixelHeight: 0xba,
  Cluster: 0x1f43b675,
  Timestamp: 0xe7, // cluster timestamp
  SimpleBlock: 0xa3,
  BlockGroup: 0xa0,
  Block: 0xa1,
  BlockDuration: 0x9b,
  ReferenceBlock: 0xfb,
} as const;

interface Element {
  id: number;
  size: number; // -1 if unknown
  bodyStart: number;
  bodyEnd: number; // exclusive; for unknown-size, == buf.length (best effort)
  next: number; // offset after this element
}

/** Read one element header at `pos`. */
function readElement(buf: Uint8Array, pos: number, parentEnd: number): Element {
  const { id, next: afterId } = readId(buf, pos);
  const { size, next: afterSize } = readSize(buf, afterId);
  const bodyStart = afterSize;
  const bodyEnd = size === -1 ? parentEnd : Math.min(bodyStart + size, parentEnd);
  return { id, size, bodyStart, bodyEnd, next: bodyEnd };
}

/** Iterate direct children within [start,end). */
function* children(buf: Uint8Array, start: number, end: number): Generator<Element> {
  let pos = start;
  while (pos + 1 < end) {
    let el: Element;
    try {
      el = readElement(buf, pos, end);
    } catch {
      return; // malformed tail — stop
    }
    if (el.bodyStart > end) return;
    yield el;
    if (el.next <= pos) return; // no forward progress → bail
    pos = el.next;
  }
}

/** Map a Matroska CodecID string to a canonical token + WebCodecs codec string. */
function codecFromCodecId(codecId: string): { token: string; codecString: string } | undefined {
  switch (codecId) {
    case 'V_VP8':
      return { token: 'vp8', codecString: 'vp8' };
    case 'V_VP9':
      return { token: 'vp9', codecString: 'vp09.00.10.08' };
    case 'V_AV1':
      return { token: 'av1', codecString: 'av01.0.04M.08' };
    case 'V_MPEG4/ISO/AVC':
      return { token: 'h264', codecString: 'avc1.640028' };
    case 'V_MPEGH/ISO/HEVC':
      return { token: 'hevc', codecString: 'hev1.1.6.L93.B0' };
    default:
      return undefined;
  }
}

/** ASCII/UTF-8 string from element body. */
function readString(buf: Uint8Array, start: number, end: number): string {
  let s = '';
  for (let i = start; i < end; i++) {
    const c = buf[i] as number;
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

/**
 * Demux the first video track of a WebM/MKV into ordered frames + decoder config. WebM frames are
 * stored in PTS order (no B-frames for VP8/VP9; PTS==DTS). Throws {@link UnsupportedWebmError}.
 */
export function demuxWebmVideo(bytes: Uint8Array): WebmVideoTrack {
  const end = bytes.length;
  // Top level: EBML header then Segment.
  let segment: Element | undefined;
  for (const el of children(bytes, 0, end)) {
    if (el.id === ID.Segment) {
      segment = el;
      break;
    }
  }
  if (!segment) throw new UnsupportedWebmError('no Segment element (not a WebM/MKV)');

  let timescaleNs = 1_000_000; // default 1ms
  let trackNumber: number | undefined;
  let config: WebmVideoConfig | undefined;

  // Walk segment children for Info + Tracks; collect clusters lazily after.
  const clusters: Element[] = [];
  for (const el of children(bytes, segment.bodyStart, segment.bodyEnd)) {
    if (el.id === ID.Info) {
      for (const c of children(bytes, el.bodyStart, el.bodyEnd)) {
        if (c.id === ID.TimestampScale) timescaleNs = readUint(bytes, c.bodyStart, c.bodyEnd - c.bodyStart);
      }
    } else if (el.id === ID.Tracks) {
      for (const te of children(bytes, el.bodyStart, el.bodyEnd)) {
        if (te.id !== ID.TrackEntry) continue;
        let tnum: number | undefined;
        let ttype: number | undefined;
        let codecId = '';
        let codecPrivate: Uint8Array | undefined;
        let width = 0;
        let height = 0;
        for (const f of children(bytes, te.bodyStart, te.bodyEnd)) {
          switch (f.id) {
            case ID.TrackNumber:
              tnum = readUint(bytes, f.bodyStart, f.bodyEnd - f.bodyStart);
              break;
            case ID.TrackType:
              ttype = readUint(bytes, f.bodyStart, f.bodyEnd - f.bodyStart);
              break;
            case ID.CodecID:
              codecId = readString(bytes, f.bodyStart, f.bodyEnd);
              break;
            case ID.CodecPrivate:
              codecPrivate = bytes.subarray(f.bodyStart, f.bodyEnd).slice();
              break;
            case ID.Video:
              for (const v of children(bytes, f.bodyStart, f.bodyEnd)) {
                if (v.id === ID.PixelWidth) width = readUint(bytes, v.bodyStart, v.bodyEnd - v.bodyStart);
                else if (v.id === ID.PixelHeight) height = readUint(bytes, v.bodyStart, v.bodyEnd - v.bodyStart);
              }
              break;
            default:
              break;
          }
        }
        // TrackType 1 == video. Take the first decodable video track.
        if (ttype === 1 && tnum !== undefined && !config) {
          const codec = codecFromCodecId(codecId);
          if (!codec) throw new UnsupportedWebmError(`unsupported WebM/MKV codec: ${codecId}`);
          trackNumber = tnum;
          config = {
            codec: codec.token,
            codecString: codec.codecString,
            codedWidth: width,
            codedHeight: height,
            timescaleNs,
          };
          if (codecPrivate) config.description = codecPrivate;
        }
      }
    } else if (el.id === ID.Cluster) {
      clusters.push(el);
    }
  }

  if (!config || trackNumber === undefined) throw new UnsupportedWebmError('no video track found in WebM/MKV');
  config.timescaleNs = timescaleNs;

  const tickToUs = (ticks: number) => Math.round((ticks * timescaleNs) / 1000);

  const samples: WebmSample[] = [];
  for (const cluster of clusters) {
    let clusterTs = 0;
    // First pass to find the cluster Timestamp (it precedes blocks per spec, but be tolerant).
    for (const c of children(bytes, cluster.bodyStart, cluster.bodyEnd)) {
      if (c.id === ID.Timestamp) {
        clusterTs = readUint(bytes, c.bodyStart, c.bodyEnd - c.bodyStart);
        break;
      }
    }
    for (const c of children(bytes, cluster.bodyStart, cluster.bodyEnd)) {
      if (c.id === ID.SimpleBlock) {
        const block = parseBlock(bytes, c.bodyStart, c.bodyEnd, trackNumber);
        if (!block) continue;
        const ptsUs = tickToUs(clusterTs + block.relTs);
        for (const frame of block.frames) {
          samples.push({ data: frame, ptsUs, dtsUs: ptsUs, durationUs: 0, keyframe: block.keyframe });
        }
      } else if (c.id === ID.BlockGroup) {
        // BlockGroup: a Block + optional ReferenceBlock (presence ⇒ not a keyframe) + BlockDuration.
        let blockEl: Element | undefined;
        let hasReference = false;
        let durationTicks = 0;
        for (const g of children(bytes, c.bodyStart, c.bodyEnd)) {
          if (g.id === ID.Block) blockEl = g;
          else if (g.id === ID.ReferenceBlock) hasReference = true;
          else if (g.id === ID.BlockDuration) durationTicks = readUint(bytes, g.bodyStart, g.bodyEnd - g.bodyStart);
        }
        if (!blockEl) continue;
        const block = parseBlock(bytes, blockEl.bodyStart, blockEl.bodyEnd, trackNumber);
        if (!block) continue;
        const ptsUs = tickToUs(clusterTs + block.relTs);
        const keyframe = !hasReference;
        for (const frame of block.frames) {
          samples.push({ data: frame, ptsUs, dtsUs: ptsUs, durationUs: tickToUs(durationTicks), keyframe });
        }
      }
    }
  }

  if (samples.length === 0) throw new UnsupportedWebmError('no frames decoded from WebM/MKV clusters');
  // Sort by PTS to be safe (clusters are ordered, but defensive).
  samples.sort((a, b) => a.ptsUs - b.ptsUs);
  return { config, samples };
}

interface ParsedBlock {
  relTs: number; // signed int16 relative timestamp
  keyframe: boolean;
  frames: Uint8Array[];
}

/** Parse a (Simple)Block body: track vint, int16 rel ts, flags, then frame(s) (handles lacing). */
function parseBlock(buf: Uint8Array, start: number, end: number, wantTrack: number): ParsedBlock | undefined {
  const { value: track, next } = readVint(buf, start, false);
  if (track !== wantTrack) return undefined;
  let pos = next;
  const relTs = ((buf[pos] as number) << 8) | (buf[pos + 1] as number);
  const signedRelTs = relTs > 0x7fff ? relTs - 0x10000 : relTs;
  pos += 2;
  const flags = buf[pos] as number;
  pos += 1;
  const keyframe = (flags & 0x80) !== 0; // SimpleBlock keyframe bit; in Block it's reserved (0)
  const lacing = (flags >> 1) & 0x03; // 0=none,1=Xiph,2=fixed,3=EBML

  const frames: Uint8Array[] = [];
  if (lacing === 0) {
    frames.push(buf.subarray(pos, end).slice());
    return { relTs: signedRelTs, keyframe, frames };
  }

  // Laced: first byte is (numFrames - 1).
  const frameCount = (buf[pos] as number) + 1;
  pos += 1;
  const sizes: number[] = [];
  if (lacing === 2) {
    // Fixed: all frames equal size.
    const total = end - pos;
    const each = Math.floor(total / frameCount);
    for (let i = 0; i < frameCount; i++) sizes.push(each);
  } else if (lacing === 1) {
    // Xiph: sizes coded as sums of 255-bytes for all but the last.
    for (let i = 0; i < frameCount - 1; i++) {
      let size = 0;
      let b: number;
      do {
        b = buf[pos++] as number;
        size += b;
      } while (b === 255);
      sizes.push(size);
    }
  } else {
    // EBML lacing: first size is a vint; subsequent are signed-vint deltas.
    const firstV = readVint(buf, pos, false);
    pos = firstV.next;
    let prev = firstV.value;
    sizes.push(prev);
    for (let i = 1; i < frameCount - 1; i++) {
      const v = readVint(buf, pos, false);
      pos = v.next;
      // delta is centered: subtract (2^(7*length-1) - 1)
      const bias = Math.pow(2, 7 * v.length - 1) - 1;
      prev += v.value - bias;
      sizes.push(prev);
    }
  }
  // Last frame consumes the remainder.
  let consumed = 0;
  for (let i = 0; i < frameCount - 1; i++) {
    const sz = sizes[i] as number;
    frames.push(buf.subarray(pos, pos + sz).slice());
    pos += sz;
    consumed += sz;
  }
  void consumed;
  frames.push(buf.subarray(pos, end).slice());
  return { relTs: signedRelTs, keyframe, frames };
}

/** Cheap sniff: WebM/MKV starts with the EBML header magic 0x1A45DFA3. */
export function looksLikeWebm(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
  );
}
