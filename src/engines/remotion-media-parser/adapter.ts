/**
 * src/engines/remotion-media-parser/adapter.ts — MediaEngine adapter for @remotion/media-parser.
 *
 * ROLE: READ-SIDE specialist. @remotion/media-parser is a pure-TypeScript, zero-dependency,
 * STREAMING container parser: a read-only demuxer + metadata extractor. It identifies the container,
 * reads metadata, and emits encoded packets (EncodedVideoChunk/EncodedAudioChunk-compatible). It
 * contains NO codecs and NO muxer — it does not decode, encode, remux, transcode, trim, mux, or
 * decrypt. Pixel/PCM output and container writing are delegated to WebCodecs / a writer library.
 *
 * Therefore capabilities() declares ONLY `probe` and `demux` (canonical tokens). Everything else is
 * left UNDECLARED so the runner records it as NA(engine) and never calls the method. In particular
 * `seek` is NOT declared: media-parser can resolve a read-side keyframe but cannot decode it to the
 * RGBA FrameDigest the suite's seek() contract + seek-accuracy oracle require (no decoder). Declaring
 * it would be a conformance failure, not a free pass (BUILD_INSTRUCTIONS §15 honesty rule).
 *
 * BEST PATH (dossier §3 / §0.9): ask for the fewest, fastest metadata-tier fields for probe (the
 * parser reads as few bytes as possible); for demux, return a per-sample callback (the documented
 * full-demux trigger). For main-thread offload the dossier's documented fastest-responsiveness path
 * is parseMediaOnWebWorker; init() warms that worker with a real header-only parse on a tiny in-memory
 * Blob so that, if the host bundler has NOT excluded '@remotion/media-parser/worker' from pre-bundling
 * (dossier §4 Vite gotcha), the synchronous worker guard throw is absorbed HERE — untimed (§0.7) — and
 * we fall back to main-thread parseMedia BEFORE any measured op. The chosen path is recorded in
 * configUsed (read off the instance; mirrored by lastConfigUsed()).
 *
 * SOURCE selection (mutation-honoring, HLS-safe — chooseSrcOptions()). The runner builds MediaInput so
 * that blob()/arrayBuffer() apply the robustness `mutate()` (fuzz/truncate/bit-flip) while `url` always
 * serves the PRISTINE static file. So:
 *   - single-file containers (mp4/webm/ts/mp3/flac/wav/adts) parse `src: await input.blob()` — this is
 *     what makes the fuzz/truncate/zero-length probe+demux cases feed media-parser the CORRUPTED bytes
 *     so it can throw cleanly (graceful-failure PASS) instead of parsing the pristine URL and FAILing.
 *     On non-mutated runs the Blob is the real file, so functional probe/demux are byte-identical.
 *   - HLS playlists (.m3u8) keep `src: input.url` + webReader, because the playlist references sibling
 *     .ts segments by RELATIVE url that need a base URL to resolve (a Blob has none) — and HLS has no
 *     robustness mutate() case here, so nothing is lost. This is the proven-honest sibling
 *     remotion-webcodecs's posture for HLS. (ParseMediaSrc = string|Blob|URL, options.d.ts:153.)
 * The Range fast path ('http-range') is URL-only (dossier §3.3 point 2) and runs on the HLS path; the
 * worker path accepts both URL and Blob sources (dossier §3.3 point 3). Correctness GATES every number
 * (§0.1/§15), so the Blob choice for fuzzable containers is the right call.
 *
 * Vendoring (dossier §5, §0.8): imported from the installed package in node_modules; the bundler
 * serves it from the local origin. Zero deps, no WASM, no run-time CDN/toBlobURL fetch. The only
 * extra chunk is the worker entry, resolved from import.meta.url as a same-origin chunk.
 *
 * Verified against installed @remotion/media-parser@4.0.479 .d.ts:
 *   parseMedia, IsAnImageError, IsAPdfError, IsAnUnsupportedFileTypeError, WEBCODECS_TIMESCALE
 *   (dist/index.d.ts); parseMediaOnWebWorker (dist/worker.d.ts; ParseMediaOnWorkerOptions src is
 *   ParseMediaSrc); ParseMediaSrc = string | Blob | URL (dist/options.d.ts:153); MediaParserVideoTrack
 *   has width/height (display, rotation-applied) AND codedWidth/codedHeight (unrotated) + rotation:number
 *   (dist/get-tracks.d.ts); MediaParserVideoSample/AudioSample, MediaParserTrack, MediaParserContainer
 *   (dist/{webcodec-sample-types,get-tracks,options}.d.ts). Worker Vite-prebundle guard throws
 *   synchronously at CALL time (dist/esm/worker.mjs:530-543).
 *
 * Docs (dossier research/dossiers/remotion-media-parser.md; researched 2026-06-17):
 *   https://www.remotion.dev/docs/media-parser/
 *   https://www.remotion.dev/docs/media-parser/parse-media
 *   https://www.remotion.dev/docs/media-parser/fields
 *   https://www.remotion.dev/docs/media-parser/fast-and-slow
 *   https://www.remotion.dev/docs/media-parser/types
 *   https://www.remotion.dev/docs/media-parser/webcodecs
 *   https://www.remotion.dev/docs/media-parser/parse-media-on-web-worker
 *   https://www.remotion.dev/docs/media-parser/seeking
 *   https://www.remotion.dev/docs/media-parser/web-reader
 *   https://www.remotion.dev/docs/media-parser/foreign-file-types
 *   https://www.remotion.dev/blog/media-parser  (deprecated 2026-02-01; still functional at 4.0.479)
 */

import {
  parseMedia,
  IsAnImageError,
  IsAPdfError,
  IsAnUnsupportedFileTypeError,
  WEBCODECS_TIMESCALE,
  type MediaParserOnVideoTrack,
  type MediaParserOnAudioTrack,
  type MediaParserVideoSample,
  type MediaParserAudioSample,
  type MediaParserTrack,
  type MediaParserVideoTrack,
  type MediaParserAudioTrack,
  type MediaParserContainer,
} from '@remotion/media-parser';
import { webReader } from '@remotion/media-parser/web';

import { registerEngine } from '../../core/registry.ts';
import type {
  CapabilitySet,
  DecryptKey,
  DemuxResult,
  EncodedTracks,
  EncryptionScheme,
  FrameDigest,
  FrameSink,
  MediaBytes,
  MediaEngine,
  MediaInput,
  NormalizedMetadata,
  NormalizedTrack,
  PacketInfo,
  TranscodeOptions,
} from '../../core/engine.ts';

import {
  mpAudioToCanonical,
  mpContainerToCanonical,
  mpVideoToCanonical,
} from './codecs.ts';

const ENGINE_ID = 'remotion-media-parser@4.0.479';

/** The Remotion license acknowledgement flag (dossier §4). Required by parseMedia(). */
const ACK_LICENSE = true;

/**
 * Which parse path init() resolved to. media-parser's documented best-responsiveness path is the web
 * worker (parseMediaOnWebWorker); if the host bundler hasn't excluded '@remotion/media-parser/worker'
 * from pre-bundling the worker can't be constructed, so we transparently fall back to main thread.
 */
type ParsePath = 'worker' | 'main-thread';

/** The config recorded per run (dossier §8.5 / §3) — exposed so the runner/report can record it. */
export interface RemotionMediaParserConfig {
  backend: 'cpu-js';
  hwAccel: false;
  wasmThreads: 0;
  pipeline: 'streaming';
  worker: boolean;
  /**
   * Source-reading mode for the most recent op (honest, per-input). 'webReader' = URL src with the
   * HTTP-Range lazy-read reader (used for HLS playlists so relative sibling segments resolve). 'blob' =
   * in-memory Blob src (used for single-file containers so the runner's robustness mutate() reaches the
   * parser). See chooseSrcOptions(). (dossier §3.3 points 2-3.)
   */
  reader: 'webReader' | 'blob';
  fieldsTier: 'metadata-only' | 'full-parse(demux)';
  coreBuild: 'n/a';
  version: string;
}

/**
 * A worker-mode parseMedia function. Signature mirrors parseMedia but the worker forces webReader
 * internally (the reader option can't be postMessage'd), so it accepts string | Blob | URL sources —
 * which fits the suite's Blob-fed shape (dossier §3.3 point 3; ParseMediaSrc verified options.d.ts:153).
 */
type ParseMediaFn = typeof parseMedia;

export class RemotionMediaParserEngine implements MediaEngine {
  readonly id = ENGINE_ID;

  /** Resolved parse path; set in init(). Defaults to main-thread until init() proves the worker. */
  private parsePath: ParsePath = 'main-thread';

  /** The worker-mode parse function, lazily imported in init() when the worker is usable. */
  private workerParse: ParseMediaFn | null = null;

  /** The chosen config for the most recent operation (probe/demux), for §8.5 recording. */
  private config: RemotionMediaParserConfig = {
    backend: 'cpu-js',
    hwAccel: false,
    wasmThreads: 0,
    pipeline: 'streaming',
    worker: false,
    reader: 'blob',
    fieldsTier: 'metadata-only',
    coreBuild: 'n/a',
    version: '4.0.479',
  };

  /**
   * Best-path config (§8.5), read off the instance by the runner (runner.ts records `engine.configUsed`
   * into the report env). Exposing it as a getter — not just lastConfigUsed() — is what actually lands
   * the worker/reader/fieldsTier choice in the report, so the `worker` flag is verifiable rather than a
   * claim. Reflects the MOST RECENT op (probe = metadata-only; demux = full-parse).
   */
  get configUsed(): RemotionMediaParserConfig {
    return { ...this.config };
  }

  capabilities(): CapabilitySet {
    return {
      // READ-ONLY parser: probe + demux only. No decode/encode/remux/transcode/seek(pixel)/trim/
      // mux/decrypt — those genuinely cannot be done by this library, so they are absent (NA-engine).
      operations: {
        probe: true,
        demux: true,
      },
      // Containers media-parser can READ — listed ONLY as the canonical tokens its MediaParserContainer
      // enum actually emits (and that codecs.ts mpContainerToCanonical() produces). media-parser
      // COLLAPSES families: ISO-BMFF (mp4/mov/m4a) → 'mp4' and Matroska (webm/mkv) → 'webm'; it cannot
      // distinguish 'mov' from 'mp4' or 'mkv' from 'webm' at the container level (dossier §6). So we do
      // NOT declare 'mov'/'mkv': declaring them would let mov/mkv probe cases negotiate + RUN and then
      // FAIL goldenMetadata's strict container check (measured 'mp4' vs golden 'mov', 'webm' vs 'mkv')
      // — the §15 anti-pattern of turning an honest NA into a FAIL on a row the library genuinely can't
      // satisfy. Omitting them makes those cases a truthful NA_ENGINE. (Ogg/CAF/FLV/AIFF-container/
      // GIF-as-video are likewise absent from its enum → absent here.) See dossier §6/§7 A.2.
      containersIn: ['mp4', 'webm', 'ts', 'hls', 'mp3', 'wav', 'flac', 'adts'],
      // No muxer / no container writer.
      containersOut: [],
      // Video codecs media-parser IDENTIFIES (parse only; no decode). 'prores' has no canonical token.
      videoCodecs: ['h264', 'hevc', 'vp8', 'vp9', 'av1'],
      // Audio codecs media-parser IDENTIFIES (parse only; no decode).
      audioCodecs: ['aac', 'opus', 'mp3', 'flac', 'vorbis', 'pcm-s16', 'pcm-s24', 'pcm-f32'],
      // No decryption.
      encryption: [],
      // Read-side features the dossier confirms (§8). These are descriptive of the read path; they
      // do NOT promise any write/transform/decode capability.
      features: [
        'metadata:read', // duration/dims/fps/codecs/container/rotation/HDR/tracks/tags
        'rotate:detect', // reports rotation/display-matrix as metadata (no pixel rotate)
        'hdr:detect', // reports isHdr (no tonemap)
        'keyframes', // keyframe table available
        'http-range', // webReader issues HTTP Range requests for URL sources (HLS path; dossier §A.1/§A.14)
        'streaming-read', // progressive parse, async-callback back-pressure
        'worker', // parseMediaOnWebWorker main-thread offload (when bundler allows)
        'webcodecs:samples', // emits EncodedVideoChunk/EncodedAudioChunk-compatible samples
      ],
    };
  }

  /**
   * UNTIMED setup (§0.7). There is no WASM compile or encoder warmup for this pure-JS parser; the one
   * heavy-ish thing is spawning the web worker (the dossier's documented fastest-responsiveness path,
   * §3.3 point 3 / §4). We lazy-import it AND genuinely warm it with a real header-only parse on a tiny
   * in-memory Blob. This matters because parseMediaOnWebWorker() runs its guards at CALL time, not at
   * import: it throws SYNCHRONOUSLY if `Worker` is undefined or if it detects Vite pre-bundling
   * ("optimizeDeps: exclude ['@remotion/media-parser/worker']" — verified dist/esm/worker.mjs:530-543),
   * and otherwise constructs `new Worker(...)` and round-trips a parse. By performing that call HERE we
   * absorb a construction/guard failure untimed and fall back to main-thread parseMedia BEFORE the
   * first measured op — instead of letting the throw + fallback pollute the first probe/demux. A
   * non-worker parse error on the bogus warm-up bytes (e.g. IsAnUnsupportedFileTypeError) is EXPECTED
   * and proves the worker round-trips, so we keep the worker path; only a fatal worker error
   * (guard/construction/postMessage) drops us to main-thread. Either way the parse itself is correct;
   * only main-thread longtask offload differs.
   */
  async init(): Promise<void> {
    try {
      const { parseMediaOnWebWorker } = await import('@remotion/media-parser/worker');
      const workerParse = parseMediaOnWebWorker as unknown as ParseMediaFn;
      // Header-only warm parse on a tiny Blob: triggers the synchronous worker guard + Worker
      // construction + a postMessage round-trip, all untimed. ~32 zero bytes is not a valid container,
      // so the worker will reject with a genuine parse/unsupported-type error — which is fine: that
      // means the worker is alive and usable. Only a FATAL worker error means we must avoid it.
      const warmSrc = new Blob([new Uint8Array(32)], { type: 'application/octet-stream' });
      try {
        await workerParse({
          src: warmSrc,
          acknowledgeRemotionLicense: ACK_LICENSE,
          fields: { container: true },
        });
      } catch (err) {
        if (isFatalWorkerError(err)) throw err; // re-throw to the outer catch → main-thread fallback
        // else: worker constructed + round-tripped; the bogus bytes simply aren't parseable. Keep it.
      }
      this.workerParse = workerParse;
      this.parsePath = 'worker';
    } catch {
      // Worker unavailable in this bundler/host (Vite pre-bundling guard, no Worker, construction
      // failure). Use the main-thread path; every op stays correct, only responsiveness differs.
      this.workerParse = null;
      this.parsePath = 'main-thread';
    }
  }

  async dispose(): Promise<void> {
    // No persistent worker handle is retained (parseMediaOnWebWorker manages its own per-call worker
    // lifecycle). Drop references for clean peak-memory accounting.
    this.workerParse = null;
    this.parsePath = 'main-thread';
  }

  /** The config chosen for the most recent op (for the runner to record per §8.5). */
  lastConfigUsed(): RemotionMediaParserConfig {
    return { ...this.config };
  }

  /**
   * Choose the parse source for an input, and record the reader mode into config.
   *
   *  - HLS (.m3u8): keep `src: input.url` + explicit webReader so the parser can resolve the playlist's
   *    relative sibling .ts segments from the base URL (a buffered Blob has no base URL). HLS has no
   *    robustness mutate() case for this engine, so feeding the URL loses nothing on the robustness
   *    pillar; it also exercises the genuine HTTP-Range lazy-read path ('http-range' feature).
   *  - Everything else: `src: await input.blob()`. The runner applies the robustness mutate()
   *    (fuzz/truncate/bit-flip) through blob()/arrayBuffer() while url serves the PRISTINE file, so a
   *    Blob is REQUIRED for the parser to actually see corrupted bytes and fail cleanly
   *    (graceful-failure PASS). On non-mutated runs the Blob is the real file, so functional probes/
   *    demux are byte-identical to the URL path. Single-file containers (mp4/webm/ts/mp3/flac/wav/adts)
   *    have no sibling-segment resolution to lose.
   */
  private async chooseSrcOptions(
    input: MediaInput,
  ): Promise<{ src: string | Blob; reader?: typeof webReader }> {
    if (isHlsInput(input)) {
      this.config = { ...this.config, reader: 'webReader' };
      return { src: input.url, reader: webReader };
    }
    this.config = { ...this.config, reader: 'blob' };
    return { src: await input.blob() };
  }

  /**
   * Run parseMedia via the resolved path. HLS uses URL src + webReader; other inputs use a
   * mutation-honoring Blob src (see chooseSrcOptions). On the worker path the `reader` option is
   * stripped (functions aren't transferable; the worker forces its internal reader), so HLS over the
   * worker still resolves siblings via the URL string. If a worker call fails for a reason that
   * indicates the worker is unusable here (guard/construction/postMessage), fall back to main thread.
   */
  private async runParse<F>(
    options: Parameters<ParseMediaFn>[0],
    tier: RemotionMediaParserConfig['fieldsTier'],
  ): Promise<F> {
    this.config = { ...this.config, worker: this.parsePath === 'worker', fieldsTier: tier };
    if (this.parsePath === 'worker' && this.workerParse) {
      try {
        // Worker uses its hardcoded internal reader (a `reader` function isn't transferable); we do not
        // pass one. A Blob src round-trips via postMessage/structured-clone; a URL string is forwarded.
        const { reader: _reader, ...workerOptions } = options as { reader?: unknown };
        return (await this.workerParse(workerOptions as Parameters<ParseMediaFn>[0])) as F;
      } catch (err) {
        // If the worker itself is broken (not a genuine parse error), fall back to main thread.
        if (isFatalWorkerError(err)) {
          this.parsePath = 'main-thread';
          this.workerParse = null;
          this.config = { ...this.config, worker: false };
        } else {
          throw err;
        }
      }
    }
    // Main-thread parse with whatever src/reader the caller chose.
    return (await parseMedia(options)) as F;
  }

  // ── probe ──────────────────────────────────────────────────────────────────────────────────
  /**
   * Metadata-tier probe (dossier §3.1): request only the fast metadata fields so the parser reads as
   * few bytes as possible and does NOT trigger a full file parse. Map the result to NormalizedMetadata.
   *
   * Source selection is delegated to chooseSrcOptions(): a mutation-honoring Blob for single-file
   * containers (so fuzz/truncate/zero-length probe cases feed the CORRUPTED bytes → clean throw →
   * graceful-failure PASS), or the URL + webReader for HLS playlists (so relative sibling .ts segments
   * resolve, and the HTTP-Range lazy-read path runs).
   */
  async probe(input: MediaInput): Promise<NormalizedMetadata> {
    const srcOptions = await this.chooseSrcOptions(input);
    const result = await this.runParse<{
      durationInSeconds: number | null;
      container: MediaParserContainer;
      tracks: MediaParserTrack[];
      metadata: MetadataEntry[];
      fps: number | null;
      rotation: number | null;
    }>(
      {
        ...srcOptions,
        acknowledgeRemotionLicense: ACK_LICENSE,
        fields: {
          durationInSeconds: true,
          container: true,
          tracks: true,
          metadata: true,
          fps: true,
          rotation: true,
        },
      },
      'metadata-only',
    );

    return this.toNormalizedMetadata(result);
  }

  // ── demux ──────────────────────────────────────────────────────────────────────────────────
  /**
   * Full demux (dossier §3 / §2): returning a per-sample callback from onVideoTrack/onAudioTrack is
   * the documented trigger for a complete demux of that track. Each MediaParserVideoSample/AudioSample
   * maps 1:1 to PacketInfo: size = data.byteLength, keyframe = type === 'key', ptsUs = timestamp,
   * dtsUs = decodingTimestamp (already MICROSECONDS — timescale is WEBCODECS_TIMESCALE = 1_000_000).
   *
   * trackIndex assignment is anchored to the CONTAINER STREAM-INDEX convention the golden uses
   * (ffprobe: video streams first, then audio, then other — verified across the golden corpus:
   * h264_1080p_30s {0:video(900),1:audio(1408)}, h264_multitrack {0:video,1:audio,2:audio}). We do NOT
   * key the index to callback-FIRE order: media-parser may fire the audio-track callback before video
   * (the first-EMITTED sample is audio for these MP4/WebM goldens), which would have flipped video↔audio
   * indices and tripped the goldenPackets sameLayout() check. Instead we tag each packet with the
   * parser's stable trackId during the callback, then — once result.tracks is known — assign a canonical
   * index by (type rank video<audio<other, then trackId ascending) and remap. NormalizedMetadata.tracks
   * is ordered by the SAME canonical map so packet.trackIndex ↔ tracks[trackIndex] stay aligned.
   */
  async demux(input: MediaInput): Promise<DemuxResult> {
    // Packets tagged with the parser's stable trackId; remapped to canonical stream-index after parse.
    const tagged: Array<{ trackId: number; packet: PacketInfo }> = [];

    const onVideoTrack: MediaParserOnVideoTrack = ({ track }) => {
      const trackId = track.trackId;
      return (sample: MediaParserVideoSample) => {
        tagged.push({ trackId, packet: sampleToPacket(sample, -1) });
      };
    };
    const onAudioTrack: MediaParserOnAudioTrack = ({ track }) => {
      const trackId = track.trackId;
      return (sample: MediaParserAudioSample) => {
        tagged.push({ trackId, packet: sampleToPacket(sample, -1) });
      };
    };

    // Source selection (see chooseSrcOptions): a mutation-honoring Blob for single-file containers so
    // the runner's robustness mutate() (fuzz/truncate/bit-flip) actually reaches the parser; URL +
    // webReader for HLS so relative sibling segments resolve.
    const srcOptions = await this.chooseSrcOptions(input);
    const result = await this.runParse<{
      durationInSeconds: number | null;
      container: MediaParserContainer;
      tracks: MediaParserTrack[];
      metadata: MetadataEntry[];
      fps: number | null;
      rotation: number | null;
    }>(
      {
        ...srcOptions,
        acknowledgeRemotionLicense: ACK_LICENSE,
        fields: {
          durationInSeconds: true,
          container: true,
          tracks: true,
          metadata: true,
          fps: true,
          rotation: true,
        },
        onVideoTrack,
        onAudioTrack,
      },
      'full-parse(demux)',
    );

    // Canonical stream-index map: video(0) before audio(1) before other(2), ties broken by trackId.
    const canonicalIndexById = canonicalTrackIndexMap(result.tracks);
    const packets: PacketInfo[] = tagged.map(({ trackId, packet }) => ({
      ...packet,
      // A trackId with no entry in tracks[] (shouldn't happen) sorts last but stays deterministic.
      trackIndex: canonicalIndexById.get(trackId) ?? canonicalIndexById.size,
    }));

    // Build metadata ordered by the SAME canonical map so PacketInfo.trackIndex indexes tracks[].
    const metadata = this.toNormalizedMetadata(
      {
        durationInSeconds: result.durationInSeconds,
        container: result.container,
        tracks: result.tracks,
        metadata: result.metadata,
        fps: result.fps,
        rotation: result.rotation,
      },
      canonicalIndexById,
    );

    return { metadata, packets };
  }

  // ── unsupported operations (UNDECLARED → runner records NA(engine), never calls these) ─────────
  // They throw LOUDLY so any mis-wired call surfaces as ERROR rather than a fabricated result.

  async remux(_input: MediaInput, _opts: { container: string }): Promise<MediaBytes> {
    throw new Error(`${ENGINE_ID}: remux not supported (read-only parser; no muxer)`);
  }

  async transcode(_input: MediaInput, _opts: TranscodeOptions): Promise<MediaBytes> {
    throw new Error(`${ENGINE_ID}: transcode not supported (no encoder, no muxer)`);
  }

  async decodeFrames(_input: MediaInput, _opts?: { maxFrames?: number }): Promise<FrameSink> {
    throw new Error(`${ENGINE_ID}: decodeFrames not supported (no decoder; emits encoded samples only)`);
  }

  /**
   * media-parser CAN resolve a read-side keyframe at/just-before a time (controller.seek /
   * simulateSeek), but it produces no pixels — so it cannot return the RGBA FrameDigest this contract
   * requires. seek is therefore UNDECLARED (NA-engine) and this method throws rather than fabricate a
   * frame digest that could never match golden (which would be a conformance failure, not a pass).
   */
  async seek(_input: MediaInput, _tUs: number): Promise<{ landedPtsUs: number; frame: FrameDigest }> {
    throw new Error(`${ENGINE_ID}: seek-to-frame not supported (no decoder; read-side keyframe only)`);
  }

  async trim(
    _input: MediaInput,
    _range: { startUs: number; endUs: number },
    _opts: { container: string; frameAccurate: boolean },
  ): Promise<MediaBytes> {
    throw new Error(`${ENGINE_ID}: trim not supported (can seek-read a range but cannot write output)`);
  }

  async mux(_tracks: EncodedTracks, _opts: { container: string }): Promise<MediaBytes> {
    throw new Error(`${ENGINE_ID}: mux not supported (no container writer)`);
  }

  async decrypt(
    _input: MediaInput,
    _key: DecryptKey,
    _opts: { scheme: EncryptionScheme },
  ): Promise<MediaBytes> {
    throw new Error(`${ENGINE_ID}: decrypt not supported (no decryption; encrypted samples pass through)`);
  }

  // ── normalization ──────────────────────────────────────────────────────────────────────────
  /**
   * Map media-parser fields to NormalizedMetadata. When `canonicalIndexById` is provided (demux path)
   * the track order is forced to the canonical stream-index map (video<audio<other, trackId tiebreak)
   * so NormalizedMetadata.tracks[i] corresponds to PacketInfo.trackIndex === i. Otherwise (probe) tracks
   * are emitted in parser order — which for the probe corpus already matches the golden (video first).
   */
  private toNormalizedMetadata(
    r: {
      durationInSeconds: number | null;
      container: MediaParserContainer;
      tracks: MediaParserTrack[];
      metadata: MetadataEntry[];
      fps: number | null;
      rotation: number | null;
    },
    canonicalIndexById?: Map<number, number>,
  ): NormalizedMetadata {
    let orderedTracks = r.tracks;
    if (canonicalIndexById) {
      orderedTracks = [...r.tracks].sort((a, b) => {
        // Sort by the canonical stream-index assigned to each trackId; an unmapped track (shouldn't
        // happen) sorts last but stays deterministic.
        const ka = canonicalIndexById.get(a.trackId) ?? Number.MAX_SAFE_INTEGER;
        const kb = canonicalIndexById.get(b.trackId) ?? Number.MAX_SAFE_INTEGER;
        return ka - kb;
      });
    }

    const tracks: NormalizedTrack[] = orderedTracks.map((t) =>
      normalizeTrack(t, r.fps, r.rotation),
    );

    const meta: NormalizedMetadata = {
      container: mpContainerToCanonical(r.container),
      durationSec:
        r.durationInSeconds != null && Number.isFinite(r.durationInSeconds)
          ? r.durationInSeconds
          : null,
      tracks,
    };

    const tags = flattenMetadataTags(r.metadata);
    if (Object.keys(tags).length) meta.tags = tags;

    return meta;
  }
}

// ── module-level helpers ──────────────────────────────────────────────────────────────────────

/** Local alias for the metadata-entry shape (key/value/trackId) — kept narrow & dependency-light. */
type MetadataEntry = { key: string; value: string | number; trackId: number | null };

/**
 * HLS playlists (.m3u8) reference sibling .ts segments by RELATIVE url, so the parser needs a base URL
 * to resolve them — a buffered Blob has none. Detect HLS by mime / extension so the src chooser keeps
 * the URL src (+ webReader) for playlists while everything else uses a mutation-honoring Blob.
 */
function isHlsInput(input: MediaInput): boolean {
  const mime = (input.mime || '').toLowerCase();
  if (mime.includes('mpegurl') || mime.includes('x-mpegurl') || mime.includes('vnd.apple.mpegurl')) {
    return true;
  }
  const u = (input.url || input.id || '').toLowerCase();
  return u.endsWith('.m3u8');
}

/** Convert a media-parser sample to a suite PacketInfo. Timestamps are already in microseconds. */
function sampleToPacket(
  sample: MediaParserVideoSample | MediaParserAudioSample,
  trackIndex: number,
): PacketInfo {
  // media-parser timestamps use WEBCODECS_TIMESCALE (1_000_000) → values are already microseconds.
  // (Reference the constant so the assumption is self-documenting and tied to the library.)
  void WEBCODECS_TIMESCALE;
  return {
    trackIndex,
    size: sample.data.byteLength,
    ptsUs: Math.round(sample.timestamp),
    dtsUs: Math.round(sample.decodingTimestamp),
    keyframe: sample.type === 'key',
  };
}

/**
 * Build a canonical `trackId → 0-based index` map matching the container STREAM-INDEX convention the
 * golden uses: video tracks first, then audio, then 'other'; ties within a class broken by trackId
 * ascending (preserves the file's declaration order for same-type tracks, e.g. dual audio in
 * h264_multitrack). This makes PacketInfo.trackIndex deterministic and golden-aligned regardless of the
 * order media-parser fires onVideoTrack/onAudioTrack (which follows sample DTS, not stream index).
 */
function canonicalTrackIndexMap(tracks: MediaParserTrack[]): Map<number, number> {
  const rank = (t: MediaParserTrack): number => (t.type === 'video' ? 0 : t.type === 'audio' ? 1 : 2);
  const ordered = [...tracks].sort((a, b) => rank(a) - rank(b) || a.trackId - b.trackId);
  const map = new Map<number, number>();
  ordered.forEach((t, i) => map.set(t.trackId, i));
  return map;
}

/** Normalize a single media-parser track to the suite NormalizedTrack shape. */
function normalizeTrack(
  track: MediaParserTrack,
  containerFps: number | null,
  containerRotation: number | null,
): NormalizedTrack {
  if (track.type === 'video') {
    const v = track as MediaParserVideoTrack;
    const rotation = (v.rotation ?? containerRotation ?? 0) || 0;
    // Golden reports the CODED (unrotated) dims with rotation carried separately (probe scenario note:
    // "Rotation must surface as track.rotation, not by swapping w/h"; golden h264_rotated90 = 1280x720).
    // Verified on the installed 4.0.479 against the corpus: for h264_rotated90.mp4 the parser already
    // reports width/height = 1280x720 (== codedWidth/codedHeight) with rotation 0, so the default
    // `v.width || v.codedWidth` already matches golden. media-parser's width/height are nonetheless
    // DISPLAY dims in general (rotation-applied → swapped for a quarter-turn), so as a DEFENSIVE guard
    // we prefer the coded dims whenever rotation is ±90/270 — a no-op for this corpus (rotation 0) but
    // correct for any file where the parser does swap. For 0/180, display == coded.
    const quarterTurn = Math.abs(Math.round(rotation)) % 180 === 90;
    const width = quarterTurn
      ? v.codedWidth || v.width || undefined
      : v.width || v.codedWidth || undefined;
    const height = quarterTurn
      ? v.codedHeight || v.height || undefined
      : v.height || v.codedHeight || undefined;
    const out: NormalizedTrack = {
      type: 'video',
      codec: mpVideoToCanonical(v.codecEnum ?? v.codec),
      width,
      height,
      rotation,
      bitrate: null,
      language: null,
    };
    const fps = v.fps ?? containerFps;
    if (fps != null && Number.isFinite(fps) && fps > 0) out.fps = fps;
    return out;
  }

  if (track.type === 'audio') {
    const a = track as MediaParserAudioTrack;
    return {
      type: 'audio',
      codec: mpAudioToCanonical(a.codecEnum ?? a.codec),
      sampleRate: a.sampleRate || undefined,
      channels: a.numberOfChannels || undefined,
      bitrate: null,
      language: null,
    };
  }

  // 'other' — non-A/V track; media-parser exposes no codec/text payload.
  return {
    type: 'other',
    codec: 'unknown',
    bitrate: null,
    language: null,
  };
}

/**
 * Flatten media-parser's MediaParserMetadataEntry[] (key/value/trackId) into a string map. Duplicate
 * keys keep the first occurrence (container-level tags before per-track). Values are stringified.
 */
function flattenMetadataTags(entries: MetadataEntry[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!entries) return out;
  for (const e of entries) {
    if (!e || typeof e.key !== 'string') continue;
    if (e.key in out) continue;
    out[e.key] = typeof e.value === 'string' ? e.value : String(e.value);
  }
  return out;
}

/**
 * Decide whether a worker error means the worker is fundamentally unusable here (so we should fall
 * back to the main thread) rather than a genuine parse error (which must propagate). Image/PDF/
 * unsupported-file-type errors are genuine parse outcomes and must NOT trigger a fallback. Worker
 * construction / module-resolution / postMessage errors mean the worker is broken in this bundler.
 */
function isFatalWorkerError(err: unknown): boolean {
  if (
    err instanceof IsAnImageError ||
    err instanceof IsAPdfError ||
    err instanceof IsAnUnsupportedFileTypeError
  ) {
    return false;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /worker/i.test(msg) ||
    /optimizeDeps/i.test(msg) ||
    /import\.meta\.url/i.test(msg) ||
    /failed to (fetch|construct|resolve)/i.test(msg) ||
    /Worker is not defined/i.test(msg)
  );
}

/**
 * Registration helper. Phase D wires this into the registry; this adapter registers NOTHING on its
 * own (the call below is commented out to honor "Register NOTHING").
 *
 * export function registerRemotionMediaParser(): void {
 *   registerEngine(ENGINE_ID, () => new RemotionMediaParserEngine());
 * }
 */
export function registerRemotionMediaParser(): void {
  registerEngine(ENGINE_ID, () => new RemotionMediaParserEngine());
}

// `registerEngine` is imported so registerRemotionMediaParser() type-checks; it is exported (not
// called here) so Phase D can wire it. Reference it to satisfy strict unused-symbol checks until
// the central wiring imports it.
void registerEngine;
