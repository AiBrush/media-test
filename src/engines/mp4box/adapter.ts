/**
 * src/engines/mp4box/adapter.ts — MediaEngine adapter for mp4box.js (npm `mp4box`) @ 2.3.0.
 *
 * ROLE: ISO-BMFF (MP4 / MOV, incl. fragmented-MP4 / CMAF) PARSER + FRAGMENTER. mp4box.js is a
 * pure-JS box parser, sample-table walker, and on-the-fly fragmenter/segmenter + box writer. It does
 * NOT decode or encode media (no pixels, no PCM, no re-encode) and handles ONLY ISOBMFF. So this
 * adapter declares — and implements — exactly three operations:
 *   - probe   : read `moov` → NormalizedMetadata.
 *   - demux   : walk sample tables → encoded PacketInfo table (the WebCodecs demux fast path).
 *   - remux   : ISOBMFF → FRAGMENTED-MP4 (fMP4/CMAF) via setSegmentOptions/onSegment (the fragmenter).
 * Everything else (transcode/decodeFrames/seek-to-frame/trim/decrypt) needs decode/encode or a
 * non-ISOBMFF container and is therefore NOT declared — the runner records those as NA(engine).
 *
 * ── Why `mux` is NOT declared (honest NA, not a hidden capability) ───────────────────────────────
 * The dossier (§2.4 / §7 A.3+A.7 / §8) confirms mp4box CAN mux already-encoded WebCodecs chunks into
 * MP4 (addTrack/addSample/getBuffer — all present in mp4box@2.3.0). The reason we still leave `mux`
 * undeclared is a HARNESS-CONTRACT constraint, not a library limit: the runner's mux dispatch
 * (src/core/runner.ts executeOp `case 'mux'`) requires `scenario.options.tracks` (an EncodedTracks
 * payload) and its own doc-comment states "assembl[ing] EncodedTracks … is out of scope here — the
 * suite feeds options.tracks". But src/scenarios/mux/index.ts supplies ONLY `{ container }` and never
 * a `tracks` payload. So declaring `mux:true` would pass negotiate() and then THROW
 * "mux scenario requires options.tracks" inside executeOp → a hard ERROR cell — strictly worse than
 * the current honest NA(engine) "-". Per the suite's honesty rule, an unrunnable cell that ERRORs is
 * an OVER-claim, not honest capability. Wiring the runner to demux→tracks would fix it, but
 * src/core/runner.ts and src/scenarios/** are outside this adapter's write scope. We therefore keep
 * `mux` undeclared (and the method a fail-loud throw) and record the divergence-from-§8 here so the
 * gap is explicit. If/when the harness feeds options.tracks, declaring mux + implementing the §2.4
 * addTrack/addSample/getBuffer path (containersOut already 'mp4'; reject non-mp4) is the honest upgrade.
 *
 * ── UPGRADE 0.5.4 -> 2.3.0 (this is a rewrite) ──────────────────────────────────────────────────
 * The 2.x line is a TypeScript+ESM rewrite that SHIPS its own `.d.ts`, so we import the real typed
 * surface (no local ambient module). Breaking-change deltas honored here:
 *   • `onError(module, message)` now takes TWO args (was one string in 0.5.x).
 *   • `onReady(info: Movie)` — info is the `Movie` shape from `getInfo()`.
 *   • `appendBuffer(MP4BoxBuffer)` — buffers are `MP4BoxBuffer` (carry `fileStart`); build via
 *     `MP4BoxBuffer.fromArrayBuffer(ab, fileStart)`.
 *   • `discardMdatData` DEFAULTS TO TRUE since 1.0.0 — with it true, `setExtractionOptions`/
 *     `setSegmentOptions` warn and produce NO samples. So demux/remux MUST use `createFile(true)`
 *     (= keepMdatData, → discardMdatData=false) to retain media bytes. Probe stays `createFile()`
 *     (discard mdat) — it only needs the `moov`, the memory-optimal path.
 *   • `initializeSegmentation()` now returns `{ tracks:[{id,user}], buffer }` — a SINGLE combined
 *     init segment (not the 0.5.x array of per-track init segments).
 *   • 2.x enforces a UNIFORM `nbSamples` across all segmented tracks.
 *   • `DataStream` default endianness is now BIG_ENDIAN (we still pass it explicitly for the
 *     avcC/hvcC/vpcC/av1C description serialization path used by demux description bytes).
 *
 * ── BEST PATH (dossier §3 / §0.9) ───────────────────────────────────────────────────────────────
 * mp4box is pure-JS, single-threaded, CPU-only: NO WASM / SIMD / WebGPU / threads. Its "fast path" is
 * lazy/streaming IO + feeding hardware WebCodecs — NOT internal acceleration. This adapter records
 * that reality in configUsed. Heavy work in init() is just the dynamic import (UNTIMED, §0.7).
 *
 * ── DOCS RESEARCHED (2026-06-17, mp4box@2.3.0) ──────────────────────────────────────────────────
 *   - npm:        https://www.npmjs.com/package/mp4box
 *   - repo/README: https://github.com/gpac/mp4box.js / https://github.com/gpac/mp4box.js/blob/main/README.md
 *   - docs/demos: https://gpac.github.io/mp4box.js/ , https://gpac.github.io/mp4box.js/test/
 *   - releases:   https://github.com/gpac/mp4box.js/releases (v2.3.0, 2025-11-22)
 *   - 1.0.0 TS announcement (discardMdatData / big-endian DataStream breaking changes):
 *                 https://gpac.io/2025/06/19/announcing-mp4box-js-1-0-0-with-typescript-support/
 *   - WebCodecs demux fast-path (avcC/hvcC/vpcC/av1C description, streaming sink, Worker):
 *                 https://w3c.github.io/webcodecs/samples/video-decode-display/ (demuxer_mp4.js)
 *   - in-repo dossier: research/dossiers/mp4box.md
 *   - verified against installed dist: node_modules/mp4box/dist/mp4box.all.{js,d.ts} +
 *     node_modules/mp4box/dist/log-DO1-_KSL.d.ts (ISOFile @1153, getInfo @6448, processSamples
 *     @6577, createFile @8212, Movie/Track/Sample @4475/4432/4399).
 */

import { registerEngine } from '../../core/registry.ts';
import type {
  CapabilitySet,
  DemuxResult,
  EncodedTracks,
  FrameDigest,
  FrameSink,
  MediaBytes,
  MediaEngine,
  MediaInput,
  NormalizedMetadata,
  NormalizedTrack,
  PacketInfo,
  TrackType,
  TranscodeOptions,
} from '../../core/engine.ts';

// 2.x ships real types — import the typed surface directly (no local ambient module).
type Mp4boxModule = typeof import('mp4box');
type Mp4Movie = import('mp4box').Movie;
type Mp4Track = import('mp4box').Track;
type Mp4Sample = import('mp4box').Sample;
type Mp4ISOFile = import('mp4box').ISOFile;

const ENGINE_ID = 'mp4box@2.3.0';

/** The chosen best-path config, surfaced as configUsed (dossier §3). mp4box is pure-JS/CPU-only. */
const CONFIG_USED = {
  backend: 'pure-js' as const,
  hwAccel: false,
  wasmThreads: 0,
  worker: false, // run inline; mp4box needs no Worker and the suite shell drives it directly
  pipeline: 'whole-file-append(MP4BoxBuffer+fileStart)',
  rangeReads: false, // corpus assets fit in memory; we append the whole file once for determinism
  discardMdatDataProbe: true, // probe drops mdat (moov-only) for minimal peak memory
  discardMdatDataDemuxRemux: false, // demux/remux keep mdat (createFile(true)) so samples survive
  segmentRapAlignement: true, // fragmenter starts each segment on a RAP
};

// ── pure helpers (no lib dependency) ──────────────────────────────────────────────────────────────

/** Map mp4box's handler-derived track `type` to our canonical TrackType. */
function trackType(t: Mp4Track): TrackType {
  switch (t.type) {
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    case 'subtitles':
      return 'subtitle';
    default:
      // Fallback by which media-header sub-object getInfo populated.
      if (t.video) return 'video';
      if (t.audio) return 'audio';
      return 'other';
  }
}

/**
 * Map an MP4 MIME codecs token (e.g. 'avc1.640028', 'hev1.1.6.L93.B0', 'mp4a.40.2', 'vp09.00.10.08',
 * 'av01.0.04M.08') to our canonical lowercase token. Unrecognized → the raw token lowercased (honest:
 * surface what the file declares rather than guess a canonical id that may be wrong).
 */
function canonicalCodec(codec: string): string {
  const c = codec.toLowerCase();
  // Video. (avc1/avc3/avc2/avc4 all carry an avcC; hev1/hvc1 carry hvcC.)
  if (c.startsWith('avc1') || c.startsWith('avc3') || c.startsWith('avc2') || c.startsWith('avc4')) return 'h264';
  if (c.startsWith('hev1') || c.startsWith('hvc1') || c.startsWith('hev2') || c.startsWith('hvc2')) return 'hevc';
  if (c.startsWith('vp08') || c === 'vp8') return 'vp8';
  if (c.startsWith('vp09') || c === 'vp9') return 'vp9';
  if (c.startsWith('av01')) return 'av1';
  // Audio. NB: `mp4aSampleEntry.getCodec()` appends `.<OTI>[.<DSI>]` ONLY when an `esds` ESD is
  // present and parsed; QuickTime/MOV audio frequently exposes the BARE token 'mp4a' (no '.40.2'
  // suffix) because the ESD's OTI is absent — so we must canonicalize bare 'mp4a' to AAC, not just
  // the suffixed 'mp4a.40.*'. (Verified in node_modules/mp4box dist: getCodec returns `baseCodec`
  // ('mp4a') when `!esds.esd`. Golden h264_1080p_5s.mov audio codec === 'aac'.) OTI 0x40/0x67 = AAC.
  if (c === 'mp4a' || c === 'aac' || c.startsWith('mp4a.40') || c.startsWith('mp4a.67')) return 'aac';
  if (c.startsWith('opus')) return 'opus';
  // OTI 0x6b/0x69 = MP3; bare 'mp3'/'.mp3' tokens too.
  if (c.startsWith('mp4a.6b') || c.startsWith('mp4a.69') || c === 'mp3' || c === '.mp3') return 'mp3';
  if (c.startsWith('flac') || c.startsWith('fla')) return 'flac';
  return c;
}

/**
 * Encrypted-track codec unwrap (CENC). For protected tracks, mp4box's `getInfo()` reports
 * `track.codec` as the SAMPLE-ENTRY type 'encv'/'enca' (and 'encs'/'encu' for sys/subtitle) because
 * `encvSampleEntry`/`encaSampleEntry` inherit the BASE `SampleEntry.getCodec()` (= `type.replace('.','')`)
 * — they carry NO avcC/esds-aware getCodec. The ORIGINAL four-cc lives in the OriginalFormatBox:
 *   stsd → encv/enca sampleEntry → sinf (ProtectionSchemeInfoBox) → frma.data_format ('avc1'/'mp4a').
 * The suite's probe is documented to report container/track WITHOUT decrypting (dossier A.11/A.12), so
 * we resolve `frma.data_format` and canonicalize THAT. Returns the unwrapped four-cc, or undefined when
 * the track is not an `enc*` protected entry (caller then uses `track.codec` verbatim).
 *
 * Type-correct, no internal imports: `stsd.entries` are public `SampleEntry`s; `SampleEntry` (a
 * `ContainerBox`) exposes the generic `boxes: Box[]`, and each `Box` has a typed `.type`. We locate
 * `sinf`→`frma` by fourcc on `.boxes`, then read the `data_format` string through a minimal structural
 * shape (the concrete `frmaBox`/`sinfBox` classes are NOT part of mp4box's public entry exports).
 */
const ENCRYPTED_ENTRY_TYPES = new Set(['encv', 'enca', 'encs', 'encu', 'enct', 'encm']);

interface BoxNode {
  type: string;
  boxes?: BoxNode[];
  data_format?: string;
}

function findChildBox(node: BoxNode | undefined, fourcc: string): BoxNode | undefined {
  if (!node || !node.boxes) return undefined;
  for (const b of node.boxes) {
    if (b && b.type === fourcc) return b;
  }
  return undefined;
}

function unwrapEncryptedCodec(file: Mp4ISOFile, trackId: number, rawCodec: string): string | undefined {
  if (!ENCRYPTED_ENTRY_TYPES.has(rawCodec.toLowerCase())) return undefined;
  // Defensive: only enc* tracks reach here; a malformed/partial box tree must never turn a clean
  // probe into an ERROR — on any surprise we fall back to the wrapper four-cc (caller uses t.codec).
  try {
    // getTrackById → trakBox; mdia.minf.stbl.stsd.entries[] are SampleEntry boxes.
    const trak = file.getTrackById(trackId);
    const entries = trak?.mdia?.minf?.stbl?.stsd?.entries;
    if (!entries || !entries.length) return undefined;
    // Find the protected entry (its type matches the rawCodec) — fall back to the first entry.
    const entry =
      (entries.find((e) => (e as unknown as BoxNode).type === rawCodec) ?? entries[0]) as unknown as BoxNode;
    const sinf = findChildBox(entry, 'sinf');
    const frma = findChildBox(sinf, 'frma');
    const fmt = frma?.data_format;
    return typeof fmt === 'string' && fmt.length ? fmt : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Derive clockwise rotation degrees from the tkhd transform matrix, if present. getInfo() exposes the
 * 9-element fixed-point matrix [a,b,u, c,d,v, x,y,w]; a/b/c/d are 16.16 fixed-point. Classify the four
 * canonical orientations (0/90/180/270) — non-orthogonal matrices report `undefined` (we never
 * fabricate an angle we cannot trust).
 */
function rotationFromMatrix(
  matrix: Int32Array | Uint32Array | number[] | undefined,
): number | undefined {
  if (!matrix || matrix.length < 9) return undefined;
  // u32 fields can carry the sign bit of a negative 16.16 value; normalize through Int32.
  const f = (raw: number | undefined): number => (raw === undefined ? 0 : (raw | 0) / 65536);
  const a = f(matrix[0]);
  const b = f(matrix[1]);
  const c = f(matrix[3]);
  const d = f(matrix[4]);
  const eq = (x: number, y: number) => Math.abs(x - y) < 0.01;
  if (eq(a, 1) && eq(b, 0) && eq(c, 0) && eq(d, 1)) return 0;
  if (eq(a, 0) && eq(b, 1) && eq(c, -1) && eq(d, 0)) return 90;
  if (eq(a, -1) && eq(b, 0) && eq(c, 0) && eq(d, -1)) return 180;
  if (eq(a, 0) && eq(b, -1) && eq(c, 1) && eq(d, 0)) return 270;
  return undefined;
}

/**
 * Pick the canonical container token. getInfo() does not separately tag mov vs mp4, so we inspect the
 * ftyp brands: the QuickTime brand 'qt  ' (and 'qt') marks a MOV; everything else in the ISOBMFF
 * family normalizes to 'mp4'.
 */
function canonicalContainer(brands: string[] | undefined): string {
  if (brands && brands.some((b) => b === 'qt  ' || b === 'qt')) return 'mov';
  return 'mp4';
}

/**
 * Build NormalizedMetadata from an mp4box `Movie` (getInfo() result). The owning `ISOFile` is threaded
 * in so the encrypted-track codec unwrap (frma.data_format) and any box-tree lookups can resolve the
 * ORIGINAL codec for CENC `encv`/`enca` sample entries (getInfo() only exposes the wrapper four-cc).
 */
function toNormalizedMetadata(file: Mp4ISOFile, info: Mp4Movie): NormalizedMetadata {
  // Movie duration: prefer mvhd duration/timescale; for fragmented files where mvhd.duration is 0,
  // fall back to the fragment duration ratio getInfo() exposes as {num, den}.
  let durationSec: number | null = null;
  if (info.timescale > 0 && info.duration > 0) {
    durationSec = info.duration / info.timescale;
  } else if (info.fragment_duration && info.fragment_duration.den > 0 && info.fragment_duration.num > 0) {
    durationSec = info.fragment_duration.num / info.fragment_duration.den;
  }
  // Movie-level fragment seconds, reused as the fps denominator for fragmented video tracks whose
  // per-track tkhd.duration is 0 (mvhd/tkhd duration is 0 in a fragmented init segment).
  const movieFragSec =
    info.fragment_duration && info.fragment_duration.den > 0 && info.fragment_duration.num > 0
      ? info.fragment_duration.num / info.fragment_duration.den
      : 0;

  const tracks: NormalizedTrack[] = info.tracks.map((t): NormalizedTrack => {
    const type = trackType(t);
    const trackDurSec = t.timescale > 0 ? t.duration / t.timescale : 0;
    const lang = t.language && t.language !== 'und' ? t.language : null;
    // Unwrap CENC-protected sample entries ('encv'/'enca') to their original four-cc before
    // canonicalizing; non-encrypted tracks pass `t.codec` straight through.
    const rawCodec = unwrapEncryptedCodec(file, t.id, t.codec) ?? t.codec;
    const track: NormalizedTrack = {
      type,
      codec: canonicalCodec(rawCodec),
      bitrate: typeof t.bitrate === 'number' && Number.isFinite(t.bitrate) ? Math.round(t.bitrate) : null,
      language: lang,
    };
    if (type === 'video') {
      track.width = t.video?.width ?? (Math.round(t.track_width) || undefined);
      track.height = t.video?.height ?? (Math.round(t.track_height) || undefined);
      // Average fps over the track (sample count / track-seconds). VFR tracks report an average.
      // For FRAGMENTED files the per-track duration is 0 (no samples in the moov), so fall back to
      // the movie-level fragment duration: fps = nb_samples / fragment_seconds. (cenc_ctr.mp4:
      // 150 / 5.0214 = 29.87, matching golden 29.872 within the ±0.05 fps oracle tolerance.)
      const fpsDenSec = trackDurSec > 0 ? trackDurSec : movieFragSec;
      if (fpsDenSec > 0 && t.nb_samples > 0) track.fps = t.nb_samples / fpsDenSec;
      const rot = rotationFromMatrix(t.matrix);
      if (rot !== undefined) track.rotation = rot;
    } else if (type === 'audio') {
      track.sampleRate = t.audio?.sample_rate;
      track.channels = t.audio?.channel_count;
    }
    return track;
  });

  const meta: NormalizedMetadata = {
    container: canonicalContainer(info.brands),
    durationSec,
    tracks,
  };
  const tags: Record<string, string> = {};
  if (info.brands && info.brands.length) tags.brands = info.brands.join(',');
  if (info.isFragmented) tags.fragmented = 'true';
  if (info.mime) tags.mime = info.mime;
  if (Object.keys(tags).length) meta.tags = tags;
  return meta;
}

/** Concatenate ArrayBuffers/Uint8Arrays into one Uint8Array (fMP4 init + media segments). */
function concatBuffers(parts: Array<ArrayBuffer | Uint8Array>): Uint8Array {
  let total = 0;
  for (const p of parts) total += p instanceof Uint8Array ? p.byteLength : p.byteLength;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    const u8 = p instanceof Uint8Array ? p : new Uint8Array(p);
    out.set(u8, off);
    off += u8.byteLength;
  }
  return out;
}

/**
 * mp4box.js engine (2.3.0): probe + demux + remux-to-fragmented-MP4 for the ISO-BMFF family.
 * Pure-JS — init() only dynamically imports the lib (UNTIMED); there is no WASM/Worker to spin up.
 */
export class Mp4boxEngine implements MediaEngine {
  readonly id = ENGINE_ID;

  private mp4box: Mp4boxModule | null = null;

  /** The best-path config chosen; recorded per §8.5 / surfaced to the harness. */
  readonly configUsed = CONFIG_USED;

  capabilities(): CapabilitySet {
    return {
      // HONEST: mp4box parses boxes (probe), walks sample tables (demux), and fragments ISOBMFF
      // (remux → fMP4). It NEVER produces pixels (decodeFrames/seek-to-frame), re-encodes
      // (transcode), or trims frame-accurately → those are omitted so the runner negotiates
      // NA(engine). `mux` is library-capable (dossier §2.4) but left UNDECLARED because the harness
      // never feeds options.tracks (declaring it would ERROR, not contest — see header). `decrypt`
      // is genuinely impossible (CENC signalling parsed, no AES). Omissions here are true NAs, not
      // hidden features.
      operations: {
        probe: true,
        demux: true,
        remux: true,
      },
      // ISO-BMFF only. 'mov' shares the box structure; fragmented-MP4/CMAF are the same family,
      // surfaced via the 'fragmented' feature, not a separate container token.
      containersIn: ['mp4', 'mov'],
      // Remux writes FRAGMENTED MP4 (fMP4/CMAF), container token 'mp4'.
      containersOut: ['mp4'],
      // Codecs mp4box can IDENTIFY / DEMUX from the sample table (it does not decode/encode them).
      videoCodecs: ['h264', 'hevc', 'vp8', 'vp9', 'av1'],
      audioCodecs: ['aac', 'opus', 'mp3', 'flac'],
      // Parses CENC signalling (pssh/senc/...) but does NOT decrypt → declare none.
      encryption: [],
      // 'fragmented'        : remux produces fMP4/CMAF.
      // 'metadata:read'     : probe reads duration/dims/fps/rotation/brands/language; unwraps CENC
      //                       'encv'/'enca' to the original codec via sinf→frma.data_format, and
      //                       derives video fps from fragment_duration for fragmented inputs.
      // 'webcodecs:demux-feed': demux output feeds WebCodecs EncodedVideoChunk/description.
      // 'webcodecs:independent': probe/demux/remux are pure-JS and never touch the browser codec
      //                          gate, so the runner must not browser-gate them on codec availability.
      features: ['fragmented', 'metadata:read', 'webcodecs:demux-feed', 'webcodecs:independent'],
    };
  }

  /** UNTIMED (§0.7): dynamically import the (pure-JS) lib. No WASM/Worker/encoder warmup needed. */
  async init(): Promise<void> {
    if (!this.mp4box) {
      this.mp4box = await import('mp4box');
    }
  }

  async dispose(): Promise<void> {
    // Pure-JS, no global resources/workers held between operations; drop the module handle so a fresh
    // engine per Worker/iter starts clean for peak-memory accounting.
    this.mp4box = null;
  }

  private lib(): Mp4boxModule {
    if (!this.mp4box) throw new Error(`${ENGINE_ID}: init() must run before operations (lib not loaded)`);
    return this.mp4box;
  }

  /** Wrap an ArrayBuffer as the MP4BoxBuffer (carrying fileStart) that appendBuffer requires. */
  private makeBuffer(ab: ArrayBuffer, fileStart = 0): import('mp4box').MP4BoxBuffer {
    return this.lib().MP4BoxBuffer.fromArrayBuffer(ab, fileStart);
  }

  /**
   * Drive an ISOFile to its onReady/onError resolution by appending the whole file then flush()ing.
   * `keepMdatData` MUST be true for demux/remux (else discardMdatData drops media and no samples are
   * produced); probe leaves it false (moov-only, minimal memory). 2.x onError takes (module, message).
   */
  private parseToInfo(
    bytes: ArrayBuffer,
    keepMdatData: boolean,
  ): Promise<{ file: Mp4ISOFile; info: Mp4Movie }> {
    const MP4Box = this.lib();
    return new Promise((resolve, reject) => {
      const file = MP4Box.createFile(keepMdatData);
      let settled = false;
      file.onError = (module: string, message: string) => {
        if (settled) return;
        settled = true;
        reject(new Error(`mp4box parse error [${module}]: ${message}`));
      };
      file.onReady = (info: Mp4Movie) => {
        if (settled) return;
        settled = true;
        resolve({ file, info });
      };
      try {
        file.appendBuffer(this.makeBuffer(bytes, 0));
        file.flush();
      } catch (e) {
        if (!settled) {
          settled = true;
          reject(e instanceof Error ? e : new Error(String(e)));
        }
        return;
      }
      // Neither onReady nor onError fired → no moov was parsed (truncated / not ISO-BMFF).
      if (!settled) {
        settled = true;
        reject(new Error('mp4box: moov not found (not an ISO-BMFF/MP4 file, or moov truncated)'));
      }
    });
  }

  // ── probe ──────────────────────────────────────────────────────────────────────────────────
  async probe(input: MediaInput): Promise<NormalizedMetadata> {
    const bytes = await input.arrayBuffer();
    // moov-only: discard mdat (createFile()/keepMdatData=false) for minimal peak memory. We still
    // need the parsed `file` to resolve CENC `encv`/`enca` → original codec via frma.data_format
    // (the OriginalFormatBox lives in the moov's stsd, so it is present even with mdat discarded).
    const { file, info } = await this.parseToInfo(bytes, false);
    return toNormalizedMetadata(file, info);
  }

  // ── demux ──────────────────────────────────────────────────────────────────────────────────
  /**
   * Walk the sample tables → a global, decode-ordered PacketInfo table. Timestamps convert from each
   * sample's `timescale` ticks to microseconds (ptsUs from cts, dtsUs from dts — B-frame reorder is
   * observable through cts != dts). keepMdatData=true so samples carry data; we read only the scalar
   * fields we need and release sample memory as we go.
   */
  async demux(input: MediaInput): Promise<DemuxResult> {
    const bytes = await input.arrayBuffer();
    const { file, info } = await this.parseToInfo(bytes, true);
    const metadata = toNormalizedMetadata(file, info);

    // mp4box track id → index in info.tracks, so PacketInfo.trackIndex indexes NormalizedMetadata.tracks.
    const idToIndex = new Map<number, number>();
    info.tracks.forEach((t, i) => idToIndex.set(t.id, i));

    const packets: PacketInfo[] = [];

    file.onSamples = (id: number, _user: unknown, samples: Mp4Sample[]) => {
      const trackIndex = idToIndex.get(id) ?? -1;
      for (const s of samples) {
        const ts = s.timescale > 0 ? s.timescale : 1;
        packets.push({
          trackIndex,
          size: s.size,
          ptsUs: Math.round((s.cts / ts) * 1_000_000),
          dtsUs: Math.round((s.dts / ts) * 1_000_000),
          keyframe: !!s.is_sync,
        });
      }
      // Free decoded sample memory once scalars are copied (we keep no `data`).
      const last = samples.length ? samples[samples.length - 1] : undefined;
      if (last) file.releaseUsedSamples(id, last.number + 1);
    };

    // Extract every track; large nbSamples keeps callback overhead low (mp4box still chunks at EOF).
    for (const t of info.tracks) {
      file.setExtractionOptions(t.id, null, { nbSamples: 100_000 });
    }
    file.start();
    file.flush(); // synchronous for whole-file input: drives processSamples to completion
    file.stop();

    // Stable, engine-independent global decode order: dts then trackIndex.
    packets.sort((a, b) => a.dtsUs - b.dtsUs || a.trackIndex - b.trackIndex);
    return { metadata, packets };
  }

  // ── remux (FRAGMENTER) ───────────────────────────────────────────────────────────────────────
  /**
   * ISO-BMFF → FRAGMENTED-MP4 (fMP4 / CMAF). This is mp4box's documented "fragmenter" path:
   * setSegmentOptions per track → initializeSegmentation() (one combined init segment) → onSegment
   * (media fragments) → start()/flush(). We concatenate the init segment + every media fragment (in
   * arrival order) into one playable fragmented-MP4 byte buffer. Cross-family conversion (to
   * mkv/webm/ts/wav/...) is IMPOSSIBLE for mp4box, so any non-mp4 target throws.
   */
  async remux(input: MediaInput, opts: { container: string }): Promise<MediaBytes> {
    if (opts.container !== 'mp4') {
      throw new Error(
        `${ENGINE_ID}: remux only targets fragmented 'mp4' (ISO-BMFF→fMP4); '${opts.container}' is out of scope`,
      );
    }
    const bytes = await input.arrayBuffer();
    const { file, info } = await this.parseToInfo(bytes, true); // keep mdat or no media is fragmented

    if (!info.tracks.length) throw new Error(`${ENGINE_ID}: remux found no tracks to fragment`);

    const mediaSegments: Uint8Array[] = [];
    file.onSegment = (_id, _user, buffer) => {
      mediaSegments.push(new Uint8Array(buffer));
    };

    // 2.x requires a UNIFORM nbSamples across all segmented tracks; rapAlignement starts segments on
    // a RAP (CMAF-friendly). Use the documented default of 1000 samples per segment.
    const NB_SAMPLES = 1000;
    for (const t of info.tracks) {
      file.setSegmentOptions(t.id, null, { nbSamples: NB_SAMPLES, rapAlignement: true });
    }

    // One combined init segment (ftyp + moov with mvex), then media fragments via onSegment.
    const init = file.initializeSegmentation();
    file.start();
    file.flush(); // synchronous for whole-file input: emits all media segments
    file.stop();

    const out = concatBuffers([init.buffer, ...mediaSegments]);
    return { bytes: out, mime: 'video/mp4', container: 'mp4' };
  }

  // ── Undeclared operations: mp4box does none of these. They throw so a mis-wired runner fails
  //    loudly; capabilities() does NOT declare them, so the runner negotiates NA(engine). ──────────

  async transcode(_input: MediaInput, _opts: TranscodeOptions): Promise<MediaBytes> {
    throw new Error(`${ENGINE_ID}: transcode not supported (no encoder/decoder — ISOBMFF parser only)`);
  }

  async decodeFrames(_input: MediaInput, _opts?: { maxFrames?: number }): Promise<FrameSink> {
    throw new Error(`${ENGINE_ID}: decodeFrames not supported (no decoder — pair with WebCodecs)`);
  }

  async seek(_input: MediaInput, _tUs: number): Promise<{ landedPtsUs: number; frame: FrameDigest }> {
    // mp4box can seek to a byte offset of the previous RAP, but cannot produce a decoded FrameDigest.
    throw new Error(`${ENGINE_ID}: seek-to-frame not supported (no decoder — RAP→byte-offset only)`);
  }

  async trim(
    _input: MediaInput,
    _range: { startUs: number; endUs: number },
    _opts: { container: string; frameAccurate: boolean },
  ): Promise<MediaBytes> {
    throw new Error(`${ENGINE_ID}: trim not supported (keyframe-bounded DIY only; not declared)`);
  }

  // mux/decrypt are optional on MediaEngine. mp4box CAN mux encoded chunks into MP4 (dossier §2.4),
  // but the runner does not feed `options.tracks`, so declaring it would ERROR rather than contest
  // (see header "Why `mux` is NOT declared"). Kept present + fail-loud so a future mis-wired direct
  // call surfaces a clear error; capabilities() does NOT declare it → runner negotiates NA(engine).
  // `decrypt` is genuinely impossible (parses CENC signalling, performs no AES) and is simply absent.
  async mux(_tracks: EncodedTracks, _opts: { container: string }): Promise<MediaBytes> {
    throw new Error(
      `${ENGINE_ID}: mux is undeclared in this harness (runner does not supply options.tracks); ` +
        `mp4box can addTrack/addSample/getBuffer per dossier §2.4 once tracks are fed`,
    );
  }
}

/**
 * Register helper for Phase D to wire the registry (this file does NOT register at import time —
 * "Register NOTHING; Phase D wires registry"). Phase D calls registerMp4box() where it assembles the
 * engine list. The registry KEY defaults to 'mp4box'; the engine reports its own versioned id.
 */
export function registerMp4box(opts?: { id?: string; reference?: boolean }): void {
  const id = opts?.id ?? 'mp4box';
  registerEngine(id, () => new Mp4boxEngine(), { reference: opts?.reference ?? false });
}
