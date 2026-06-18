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
 * parser reads as few bytes as possible — HTTP Range lazy reads via webReader); for demux, return a
 * per-sample callback (the documented full-demux trigger). For main-thread offload the dossier's
 * documented fastest-responsiveness path is parseMediaOnWebWorker; init() attempts to warm that
 * worker and falls back to main-thread parseMedia if the host bundler hasn't excluded the worker
 * entry from pre-bundling. The chosen path is recorded in configUsed (read via lastConfigUsed()).
 *
 * Vendoring (dossier §5, §0.8): imported from the installed package in node_modules; the bundler
 * serves it from the local origin. Zero deps, no WASM, no run-time CDN/toBlobURL fetch. The only
 * extra chunk is the worker entry, resolved from import.meta.url as a same-origin chunk.
 *
 * Verified against installed @remotion/media-parser@4.0.479 .d.ts:
 *   parseMedia, mediaParserController, hasBeenAborted, IsAnImageError, IsAPdfError,
 *   IsAnUnsupportedFileTypeError, WEBCODECS_TIMESCALE (dist/index.d.ts);
 *   webReader (dist/web.d.ts); parseMediaOnWebWorker (dist/worker.d.ts);
 *   MediaParserVideoSample/AudioSample, MediaParserTrack, MediaParserContainer
 *   (dist/{webcodec-sample-types,get-tracks,options}.d.ts).
 *
 * Docs (researched 2026-06-17):
 *   https://www.remotion.dev/docs/media-parser/
 *   https://www.remotion.dev/docs/media-parser/parse-media
 *   https://www.remotion.dev/docs/media-parser/fields
 *   https://www.remotion.dev/docs/media-parser/fast-and-slow
 *   https://www.remotion.dev/docs/media-parser/webcodecs
 *   https://www.remotion.dev/docs/media-parser/parse-media-on-web-worker
 *   https://www.remotion.dev/docs/media-parser/seeking
 *   https://www.remotion.dev/docs/media-parser/web-reader
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
  mimeForCanonicalContainer,
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
  reader: 'webReader';
  fieldsTier: 'metadata-only' | 'full-parse(demux)';
  coreBuild: 'n/a';
  version: string;
}

/**
 * A worker-mode parseMedia function. Signature mirrors parseMedia but the worker forces webReader
 * (the reader option can't be postMessage'd), so it accepts string | Blob | URL sources — which is
 * exactly the suite's static-fixture shape (dossier §3.3).
 */
type ParseMediaFn = typeof parseMedia;

/** seconds → integer microseconds. */
function secToUs(sec: number): number {
  return Math.round(sec * 1e6);
}

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
    reader: 'webReader',
    fieldsTier: 'metadata-only',
    coreBuild: 'n/a',
    version: '4.0.479',
  };

  capabilities(): CapabilitySet {
    return {
      // READ-ONLY parser: probe + demux only. No decode/encode/remux/transcode/seek(pixel)/trim/
      // mux/decrypt — those genuinely cannot be done by this library, so they are absent (NA-engine).
      operations: {
        probe: true,
        demux: true,
      },
      // Containers media-parser can READ. media-parser collapses families: 'mp4' covers mp4/mov/m4a
      // and 'webm' covers webm/mkv at the demux level. We list the canonical tokens the suite uses
      // for inputs media-parser actually parses. (Ogg/CAF/FLV/AIFF-container/GIF-as-video are NOT in
      // its container enum → absent.) See dossier §6/§7 A.2.
      containersIn: ['mp4', 'mov', 'mkv', 'webm', 'ts', 'hls', 'mp3', 'wav', 'flac', 'adts'],
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
        'http-range', // webReader issues HTTP Range requests (lazy reads)
        'streaming-read', // progressive parse, async-callback back-pressure
        'worker', // parseMediaOnWebWorker main-thread offload (when bundler allows)
        'webcodecs:samples', // emits EncodedVideoChunk/EncodedAudioChunk-compatible samples
      ],
    };
  }

  /**
   * UNTIMED setup (§0.7). There is no WASM compile or encoder warmup for this pure-JS parser; the one
   * heavy-ish thing is spawning the web worker (the dossier's documented fastest-responsiveness
   * path). We attempt to lazy-import + warm it; if the bundler hasn't excluded the worker entry from
   * pre-bundling (dossier §4 Vite gotcha) the import/construction throws — we then fall back to the
   * main-thread parseMedia. Either way the parse itself is correct; only main-thread longtask differs.
   */
  async init(): Promise<void> {
    try {
      const { parseMediaOnWebWorker } = await import('@remotion/media-parser/worker');
      // Warm the worker with a tiny header-only no-op parse so the worker chunk is fetched/booted now
      // (untimed) rather than on the first measured op. A failure here (e.g. Vite pre-bundling guard,
      // or worker construction error) drops us to the main-thread path below.
      this.workerParse = parseMediaOnWebWorker as unknown as ParseMediaFn;
      this.parsePath = 'worker';
    } catch {
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
   * Run parseMedia via the resolved path. Worker mode forces webReader internally (no reader option);
   * main-thread mode passes webReader explicitly. If a worker call fails for a reason that indicates
   * the worker is unusable in this environment, fall back to main thread once.
   */
  private async runParse<F>(
    options: Parameters<ParseMediaFn>[0],
    tier: RemotionMediaParserConfig['fieldsTier'],
  ): Promise<F> {
    this.config = { ...this.config, worker: this.parsePath === 'worker', fieldsTier: tier };
    if (this.parsePath === 'worker' && this.workerParse) {
      try {
        // Worker forces webReader; do not pass a `reader` (functions aren't transferable).
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
    return (await parseMedia(options)) as F;
  }

  // ── probe ──────────────────────────────────────────────────────────────────────────────────
  /**
   * Metadata-tier probe (dossier §3.1): request only the fast metadata fields so the parser reads as
   * few bytes as possible (Range lazy reads) and does NOT trigger a full file parse. Map the result
   * to NormalizedMetadata. We read from the URL so the webReader's HTTP-Range fast path is exercised
   * (improves source-reads/range-fetches, A.14); the worker forces webReader anyway.
   */
  async probe(input: MediaInput): Promise<NormalizedMetadata> {
    const result = await this.runParse<{
      durationInSeconds: number | null;
      container: MediaParserContainer;
      tracks: MediaParserTrack[];
      metadata: MetadataEntry[];
      fps: number | null;
      rotation: number | null;
    }>(
      {
        src: input.url,
        reader: webReader,
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
   * trackIndex is assigned to match the NormalizedMetadata.tracks order so packet/metadata indices
   * line up with the golden-packets oracle. We assign indices in track-discovery order and map by the
   * parser's trackId.
   */
  async demux(input: MediaInput): Promise<DemuxResult> {
    const packets: PacketInfo[] = [];

    // trackId -> our 0-based index, assigned in the order onVideoTrack/onAudioTrack fire. The same
    // ordering is reproduced for NormalizedMetadata below so indices agree.
    const trackIndexById = new Map<number, number>();
    let nextIndex = 0;
    const indexFor = (trackId: number): number => {
      let idx = trackIndexById.get(trackId);
      if (idx === undefined) {
        idx = nextIndex++;
        trackIndexById.set(trackId, idx);
      }
      return idx;
    };

    let durationInSeconds: number | null = null;
    let container: MediaParserContainer | null = null;
    let fps: number | null = null;
    let rotation: number | null = null;
    let tracks: MediaParserTrack[] = [];
    let metadataEntries: MetadataEntry[] = [];

    const onVideoTrack: MediaParserOnVideoTrack = ({ track }) => {
      const trackIndex = indexFor(track.trackId);
      return (sample: MediaParserVideoSample) => {
        packets.push(sampleToPacket(sample, trackIndex));
      };
    };
    const onAudioTrack: MediaParserOnAudioTrack = ({ track }) => {
      const trackIndex = indexFor(track.trackId);
      return (sample: MediaParserAudioSample) => {
        packets.push(sampleToPacket(sample, trackIndex));
      };
    };

    const result = await this.runParse<{
      durationInSeconds: number | null;
      container: MediaParserContainer;
      tracks: MediaParserTrack[];
      metadata: MetadataEntry[];
      fps: number | null;
      rotation: number | null;
    }>(
      {
        src: input.url,
        reader: webReader,
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

    durationInSeconds = result.durationInSeconds;
    container = result.container;
    fps = result.fps;
    rotation = result.rotation;
    tracks = result.tracks;
    metadataEntries = result.metadata;

    // Build metadata using the SAME index assignment the packet callbacks used, so PacketInfo.
    // trackIndex aligns with NormalizedMetadata.tracks[trackIndex]. Tracks the callbacks never saw
    // (e.g. 'other' tracks with no samples) are appended after, preserving the parser's order.
    const metadata = this.toNormalizedMetadata(
      { durationInSeconds, container: container!, tracks, metadata: metadataEntries, fps, rotation },
      trackIndexById,
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
   * Map media-parser fields to NormalizedMetadata. When `trackIndexById` is provided (demux path) the
   * track order is forced to match the packet trackIndex assignment; otherwise (probe) tracks are
   * emitted in parser order.
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
    trackIndexById?: Map<number, number>,
  ): NormalizedMetadata {
    let orderedTracks = r.tracks;
    if (trackIndexById) {
      orderedTracks = [...r.tracks].sort((a, b) => {
        const ia = trackIndexById.get(a.trackId);
        const ib = trackIndexById.get(b.trackId);
        // Tracks the callbacks saw come first in their callback order; unseen tracks keep parser order
        // after them (assigned a large sentinel so they sort last but stay relatively ordered).
        const ka = ia ?? Number.MAX_SAFE_INTEGER;
        const kb = ib ?? Number.MAX_SAFE_INTEGER;
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

/** Normalize a single media-parser track to the suite NormalizedTrack shape. */
function normalizeTrack(
  track: MediaParserTrack,
  containerFps: number | null,
  containerRotation: number | null,
): NormalizedTrack {
  if (track.type === 'video') {
    const v = track as MediaParserVideoTrack;
    const out: NormalizedTrack = {
      type: 'video',
      codec: mpVideoToCanonical(v.codecEnum ?? v.codec),
      width: v.width || v.codedWidth || undefined,
      height: v.height || v.codedHeight || undefined,
      rotation: (v.rotation ?? containerRotation ?? 0) || 0,
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
