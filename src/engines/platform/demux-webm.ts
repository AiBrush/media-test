/**
 * src/engines/platform/demux-webm.ts — a MINIMAL Matroska/WebM (EBML) demuxer, just enough to feed
 * WebCodecs VideoDecoder AND to enumerate the container's tracks (video + audio) for probe/demux:
 * it walks Segment → Info (TimestampScale), Tracks (codec/dims/CodecPrivate + audio rate/channels)
 * and Clusters (SimpleBlock / BlockGroup) to emit each track's frames with timestamps and keyframe
 * flags.
 *
 * Scope (HONEST): unencrypted, non-lacing (or fixed/EBML lacing handled) WebM/MKV with VP8/VP9/AV1
 * (and H.264/HEVC-in-MKV) video, plus Opus/Vorbis/AAC audio tracks (enumerated for metadata + packet
 * tables). It does NOT implement seeking via Cues, chapters, or block lacing edge cases beyond the
 * common path; on anything it can't handle it throws {@link UnsupportedWebmError}.
 *
 * SOURCES (dossier research/dossiers/platform.md §2 demux, researched 2026-06-17):
 *   - WebCodecs API: https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API
 *   - WebCodecs codec selection: https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Codec_selection
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

export interface WebmAudioConfig {
  codec: string; // canonical token: 'opus' | 'vorbis' | 'aac'
  sampleRate: number;
  channels: number;
  timescaleNs: number;
}

export interface WebmAudioTrack {
  config: WebmAudioConfig;
  samples: WebmSample[];
}

/**
 * Every track the demuxer can enumerate, in CONTAINER ORDER (Tracks declaration order), so a caller
 * can assign trackIndex 0,1,2,… to match a multi-track golden's layout. Unknown/unparseable tracks are
 * skipped (honest: only what we read).
 */
export type WebmTrack =
  | ({ kind: 'video' } & WebmVideoTrack)
  | ({ kind: 'audio' } & WebmAudioTrack);

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
  Audio: 0xe1,
  SamplingFrequency: 0xb5, // EBML float (Hz)
  Channels: 0x9f,
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
  bodyEnd: number; // exclusive; resolved (see resolveUnknownEnd) for unknown-size masters
  next: number; // offset after this element
}

// Extra Segment-level (level-1) element IDs we don't otherwise constant above, used only as
// unknown-size boundary markers.
const ID_Cues = 0x1c53bb6b;
const ID_Chapters = 0x1043a770;
const ID_Tags = 0x1254c367;
const ID_SeekHead = 0x114d9b74;
const ID_Attachments = 0x1941a469;

/**
 * For an UNKNOWN-SIZE master with the given `id`, the set of element IDs that TERMINATE it (its
 * siblings/ancestors), or `null` if we don't special-case unbounded masters of this type.
 *
 * WHY this matters (the WebM-streaming bug): WebCodecs-based muxers (mediabunny, remotion-webcodecs,
 * the browser's own MediaRecorder) write WebM in a LIVE/streaming style where the `Segment` AND every
 * `Cluster` carry an "unknown size" (the all-ones vint `01 FF FF FF FF FF FF FF`) because the writer
 * can't know the length up front. A naive reader treats an unknown-size element as spanning to its
 * parent's end (EOF for the Segment), so the FIRST Cluster swallows every later Cluster and only the
 * first cluster's frames are recovered — the decoder then sees 1 corrupt EOF-spanning "frame" instead
 * of the real stream (the exact failure on mediabunny's convert-webm-resize WebM). Per EBML, an
 * unknown-size master ends at the next element whose ID is a valid sibling/ancestor. The two masters
 * we ever see unbounded are:
 *   - Segment  → ended only by another Segment or a new top-level EBML header (its children
 *                Info/Tracks/Cluster/… must NOT terminate it).
 *   - Cluster  → ended by the next Cluster or ANY Segment-level sibling (Cues/Tags/SeekHead/Info/
 *                Tracks/Chapters/Attachments) or a new Segment/EBML.
 */
function unknownEndBoundary(id: number): ReadonlySet<number> | null {
  if (id === ID.Segment) return new Set<number>([ID.Segment, ID.EBML]);
  if (id === ID.Cluster) {
    return new Set<number>([
      ID.Cluster,
      ID.Info,
      ID.Tracks,
      ID_Cues,
      ID_Chapters,
      ID_Tags,
      ID_SeekHead,
      ID_Attachments,
      ID.Segment,
      ID.EBML,
    ]);
  }
  return null; // other unknown-size masters (rare in our path) fall back to parentEnd
}

/**
 * Resolve the real end (exclusive) of an UNKNOWN-SIZE master whose body starts at `bodyStart`, by
 * scanning forward (vint-aligned) for the next element ID in `boundary`. Returns `hardEnd` (parent
 * end / EOF) if no boundary is found. At each step it reads an element header; a boundary ID stops the
 * scan there, otherwise it skips that child's body by its declared size. A nested unknown-size child
 * (which this minimal demuxer can't bound) also stops the scan at `hardEnd`.
 */
function resolveUnknownEnd(buf: Uint8Array, bodyStart: number, hardEnd: number, boundary: ReadonlySet<number>): number {
  let pos = bodyStart;
  while (pos + 1 < hardEnd) {
    let id: number;
    let afterId: number;
    let size: number;
    let afterSize: number;
    try {
      ({ id, next: afterId } = readId(buf, pos));
      ({ size, next: afterSize } = readSize(buf, afterId));
    } catch {
      return hardEnd; // malformed tail — treat the rest as this master's body
    }
    if (pos > bodyStart && boundary.has(id)) return pos; // sibling/ancestor boundary → end here
    if (size === -1) return hardEnd; // nested unknown-size child: can't bound precisely
    const childEnd = afterSize + size;
    if (childEnd <= pos || childEnd > hardEnd) return hardEnd; // no progress / overrun → bail
    pos = childEnd;
  }
  return hardEnd;
}

/** Read one element header at `pos`. Unknown-size Segment/Cluster get a resolved {@link bodyEnd}. */
function readElement(buf: Uint8Array, pos: number, parentEnd: number): Element {
  const { id, next: afterId } = readId(buf, pos);
  const { size, next: afterSize } = readSize(buf, afterId);
  const bodyStart = afterSize;
  let bodyEnd: number;
  if (size === -1) {
    // Unknown size: resolve to the next sibling/ancestor boundary so a streaming (unknown-size)
    // Segment/Cluster doesn't swallow the rest of the file. Masters we don't special-case span to
    // parentEnd (best effort), matching the prior behavior.
    const boundary = unknownEndBoundary(id);
    bodyEnd = boundary ? resolveUnknownEnd(buf, bodyStart, parentEnd, boundary) : parentEnd;
  } else {
    bodyEnd = Math.min(bodyStart + size, parentEnd);
  }
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

/**
 * Whether a codec's CodecPrivate should be forwarded to WebCodecs as the decoder `description`.
 * VP8/VP9 carry config in-band and WebCodecs ignores (and can be broken by) a description; avc1/hvc1
 * need their avcC/hvcC, and AV1's av1C is consumed by Chrome — so keep the description for those.
 */
function codecUsesDescription(token: string): boolean {
  return token !== 'vp8' && token !== 'vp9';
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

/** Map a Matroska audio CodecID to a canonical token (for probe metadata + packet enumeration). */
function audioCodecFromCodecId(codecId: string): string | undefined {
  switch (codecId) {
    case 'A_OPUS':
      return 'opus';
    case 'A_VORBIS':
      return 'vorbis';
    case 'A_AAC':
      return 'aac';
    default:
      return undefined; // A_MPEG/L3, A_PCM/…, A_FLAC etc. not identified by this minimal demuxer
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

/** Internal per-track descriptor collected from the Tracks element, in declaration order. */
interface WebmTrackDesc {
  trackNumber: number;
  track: WebmTrack; // config + (initially empty) samples, filled from clusters
}

/**
 * Enumerate EVERY parseable track (video + audio) of a WebM/MKV in CONTAINER ORDER (Tracks declaration
 * order), each with its ordered frames from the Clusters, so a caller can assign trackIndex 0,1,2,… to
 * match a multi-track golden and emit honest probe metadata. VP8/VP9 WebM frames are effectively in
 * PTS order (PTS==DTS), but H.264/HEVC-in-MKV may carry B-frame reorder where Matroska block order is
 * the only decode-order signal this minimal demuxer has. Tracks whose codec this minimal demuxer
 * cannot identify are skipped (honest).
 * Throws {@link UnsupportedWebmError} for a missing Segment or when NO track is parseable.
 */
export function demuxWebmTracks(bytes: Uint8Array): WebmTrack[] {
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
  const descs: WebmTrackDesc[] = []; // in Tracks declaration order

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
        let audioChannels = 0;
        let audioSampleRate = 0;
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
            case ID.Audio:
              for (const a of children(bytes, f.bodyStart, f.bodyEnd)) {
                if (a.id === ID.SamplingFrequency) audioSampleRate = readFloat(bytes, a.bodyStart, a.bodyEnd - a.bodyStart);
                else if (a.id === ID.Channels) audioChannels = readUint(bytes, a.bodyStart, a.bodyEnd - a.bodyStart);
              }
              break;
            default:
              break;
          }
        }
        if (tnum === undefined) continue;

        if (ttype === 1) {
          // Video track. Skip (don't fail the whole demux) if the codec is unidentified — another
          // track may still be usable.
          const codec = codecFromCodecId(codecId);
          if (!codec) continue;
          const config: WebmVideoConfig = {
            codec: codec.token,
            codecString: codec.codecString,
            codedWidth: width,
            codedHeight: height,
            timescaleNs,
          };
          // Attach CodecPrivate as the WebCodecs `description` ONLY for codecs that consume one.
          // VP8/VP9 carry their config in-band and WebCodecs ignores the description; moreover a WebM
          // VP9 CodecPrivate (the "VP9 Codec Feature Metadata" blob written by mediabunny /
          // remotion-webcodecs) is NOT a valid WebCodecs description and corrupts the decoder config
          // (it triggers a null-`.trim()` TypeError in Chrome's native config parser). Drop it here so
          // every consumer (oracle-helpers + adapter) gets a clean, decodable config.
          if (codecPrivate && codecUsesDescription(codec.token)) config.description = codecPrivate;
          descs.push({ trackNumber: tnum, track: { kind: 'video', config, samples: [] } });
        } else if (ttype === 2) {
          // Audio track. Enumerate for metadata + packets; skip unidentified codecs honestly.
          const token = audioCodecFromCodecId(codecId);
          if (!token) continue;
          const config: WebmAudioConfig = {
            codec: token,
            sampleRate: Math.round(audioSampleRate) || 0,
            channels: audioChannels || 0,
            timescaleNs,
          };
          descs.push({ trackNumber: tnum, track: { kind: 'audio', config, samples: [] } });
        }
        // Other track types (subtitle/button/control) are not enumerated.
      }
    } else if (el.id === ID.Cluster) {
      clusters.push(el);
    }
  }

  if (descs.length === 0) throw new UnsupportedWebmError('no video/audio track found in WebM/MKV');

  // Keep timescale consistent on every track config (Info may follow Tracks in some files).
  for (const d of descs) d.track.config.timescaleNs = timescaleNs;

  const tickToUs = (ticks: number) => Math.round((ticks * timescaleNs) / 1000);
  const byTrackNumber = new Map<number, WebmTrackDesc>();
  for (const d of descs) byTrackNumber.set(d.trackNumber, d);

  // Single pass over clusters → route each block's frames to its track by track number.
  const push = (trackNum: number, frame: Uint8Array, ptsUs: number, durationUs: number, keyframe: boolean): void => {
    const d = byTrackNumber.get(trackNum);
    if (!d) return; // block for a track we didn't enumerate (e.g. unidentified codec) → ignore
    d.track.samples.push({ data: frame, ptsUs, dtsUs: ptsUs, durationUs, keyframe });
  };

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
        const block = parseBlock(bytes, c.bodyStart, c.bodyEnd);
        if (!block) continue;
        const ptsUs = tickToUs(clusterTs + block.relTs);
        for (const frame of block.frames) push(block.track, frame, ptsUs, 0, block.keyframe);
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
        const block = parseBlock(bytes, blockEl.bodyStart, blockEl.bodyEnd);
        if (!block) continue;
        const ptsUs = tickToUs(clusterTs + block.relTs);
        const keyframe = !hasReference;
        for (const frame of block.frames) push(block.track, frame, ptsUs, tickToUs(durationTicks), keyframe);
      }
    }
  }

  // Sort PTS==DTS codecs defensively, but preserve Matroska block order for B-frame-capable codecs.
  // The WebCodecs driver feeds samples in array order, then sorts decoded VideoFrames by PTS before
  // digesting, so H.264/HEVC must keep container decode order here.
  const out: WebmTrack[] = [];
  for (const d of descs) {
    if (d.track.samples.length === 0) continue;
    const keepBlockOrder =
      d.track.kind === 'video' && (d.track.config.codec === 'h264' || d.track.config.codec === 'hevc');
    if (!keepBlockOrder) d.track.samples.sort((a, b) => a.ptsUs - b.ptsUs);
    out.push(d.track);
  }
  if (out.length === 0) throw new UnsupportedWebmError('no frames decoded from WebM/MKV clusters');
  return out;
}

/**
 * Demux the first video track of a WebM/MKV into ordered frames + decoder config. Thin wrapper over
 * {@link demuxWebmTracks}. Throws {@link UnsupportedWebmError} when no video track is present.
 */
export function demuxWebmVideo(bytes: Uint8Array): WebmVideoTrack {
  const tracks = demuxWebmTracks(bytes);
  const video = tracks.find((t): t is { kind: 'video' } & WebmVideoTrack => t.kind === 'video');
  if (!video) throw new UnsupportedWebmError('no video track found in WebM/MKV');
  return { config: video.config, samples: video.samples };
}

interface ParsedBlock {
  track: number; // block's track number (caller routes frames to the matching track)
  relTs: number; // signed int16 relative timestamp
  keyframe: boolean;
  frames: Uint8Array[];
}

/**
 * Parse a (Simple)Block body: track vint, int16 rel ts, flags, then frame(s) (handles lacing).
 * Returns the block's track number so the caller can route frames to the right track (multi-track).
 */
function parseBlock(buf: Uint8Array, start: number, end: number): ParsedBlock | undefined {
  const { value: track, next } = readVint(buf, start, false);
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
    return { track, relTs: signedRelTs, keyframe, frames };
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
  return { track, relTs: signedRelTs, keyframe, frames };
}

/** Cheap sniff: WebM/MKV starts with the EBML header magic 0x1A45DFA3. */
export function looksLikeWebm(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
  );
}
