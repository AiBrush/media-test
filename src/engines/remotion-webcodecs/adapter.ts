/**
 * src/engines/remotion-webcodecs/adapter.ts — MediaEngine adapter for @remotion/webcodecs@4.0.479
 * (+ its sole dependency @remotion/media-parser@4.0.479).
 *
 * ROLE: a GPU-accelerated browser CONVERTER. Its sharp, honest surface is probe / demux / decode /
 * seek / remux / transcode (resize + rotate). It is NOT a general muxer (no public muxer fed by
 * external EncodedTracks), has NO trim/concat/crop, and NO decrypt — those are left UNDECLARED so the
 * runner records them as NA(engine) (never a fabricated pass). See dossier §2, §7, §10.
 *
 * BEST-PERFORMANCE PATH (dossier §0.9 / §4), recorded in configUsed:
 *   - Native WebCodecs decode/encode with hardwareAcceleration:'prefer-hardware' (+ automatic
 *     software fallback) — this is automatic inside the lib, the #1 perf lever.
 *   - Streaming, backpressure-throttled pipeline (parse -> decode -> encode), driven by the lib's
 *     waitForQueueToBeLessThan() — no fixed queue depth.
 *   - Pixel resize/rotate on OffscreenCanvas 2D (the lib's only pixel backend; no WebGPU/WebGL rung).
 *   - In-memory output via the library's WriterInterface into one resizable ArrayBuffer (the suite's
 *     MediaBytes contract). This preserves bufferWriter semantics without its save-time Blob copy;
 *     OPFS webFsWriter is disk-backed and therefore not used for deterministic corpus results.
 *   - expectedDurationInSeconds / expectedFrameRate passed from the probe so the MP4 `moov` is sized
 *     in one pass.
 *
 * HOSTED LOCALLY (§0.8): both packages are pure ESM imported from node_modules and bundled
 * same-origin. No CDN / unpkg / toBlobURL. Telemetry was removed from @remotion/webcodecs in v4.0.399
 * so nothing phones home at run time; `acknowledgeRemotionLicense` is passed only to silence console
 * warnings (free-tier eligibility), no network call.
 *
 * Lib surface used (verified against the installed 4.0.479 .d.ts):
 *   @remotion/webcodecs:
 *     convertMedia, WriterInterface, webcodecsController,
 *     getAvailableContainers, getAvailableVideoCodecs, getAvailableAudioCodecs
 *   @remotion/media-parser:
 *     parseMedia, mediaParserController, MediaParserVideoTrack/AudioTrack/Track, sample callbacks
 *
 * Timestamps: media-parser tracks use a FIXED timescale of 1_000_000, so sample `timestamp` /
 * `decodingTimestamp` are ALREADY in microseconds. Track times in seconds (startInSeconds, fps) are
 * converted to microseconds where the contract needs it.
 *
 * Docs cited (researched 2026-06-17, package version 4.0.479):
 *   - https://www.remotion.dev/docs/webcodecs
 *   - https://www.remotion.dev/docs/webcodecs/convert-media
 *   - https://www.remotion.dev/docs/webcodecs/resize-a-video
 *   - https://www.remotion.dev/docs/webcodecs/rotate-a-video
 *   - https://www.remotion.dev/docs/webcodecs/track-transformation
 *   - https://www.remotion.dev/docs/webcodecs/webcodecs-controller
 *   - https://www.remotion.dev/docs/webcodecs/telemetry
 *   - https://www.remotion.dev/docs/media-parser/parse-media
 *   - https://www.remotion.dev/docs/media-parser/webcodecs
 *   - https://www.remotion.dev/docs/media-parser/seeking
 *   - https://www.remotion.dev/docs/media-parser/fast-and-slow
 *   - https://registry.npmjs.org/@remotion/webcodecs/latest
 */

import type {
  AdapterConfigProfile,
  CapabilitySet,
  ConcreteOperationRequest,
  ConcreteWebCodecsConfig,
  DecodeOptions,
  DecodeTrackSelector,
  DemuxResult,
  DemuxTrackRepresentation,
  FrameDigest,
  FrameRateProvenance,
  FrameSink,
  LifecycleContext,
  MediaBytes,
  MediaEngine,
  MediaInput,
  NormalizedMetadata,
  NormalizedTrack,
  OperationContext,
  PacketInfo,
  SerializableValue,
  SupportDecision,
  TranscodeOptions,
  TranscodeVideoOptions,
} from '../../core/engine.ts';
import {
  AdapterLifecycleController,
  CONCRETE_OPERATION_PROTOCOL,
  SUPPORTED_CHECKED_SUPPORT_SNAPSHOT,
  DECODE_TRACK_SELECTOR_SCHEMA,
  captureConfigUsedSnapshot,
  createBrowserNotSupportedError,
  createMalformedInputError,
  createNotApplicableError,
  isBrowserNotSupportedError,
  isMalformedInputError,
  isNotApplicableError,
  validateAdapterResult,
  validateCapabilitySet,
  validateSupportDecision,
} from '../../core/engine.ts';

import {
  CONTAINERS_IN,
  CONTAINERS_OUT,
  canonicalToRemotionAudio,
  canonicalToRemotionContainer,
  canonicalToRemotionVideo,
  mimeForContainer,
  parserContainerToCanonical,
  parserToCanonicalAudio,
  parserToCanonicalVideo,
  type RemotionAudioCodec,
  type RemotionContainer,
  type RemotionVideoCodec,
} from './codecs.ts';
import { digestImageData } from './digest.ts';
import {
  decideRemotionWebcodecsSupport,
  remotionTupleSummary,
} from '../remotion/support.ts';
import { readIsoBmffPresentationTimeline } from '../../features/trim/isobmff-timeline.ts';

const ENGINE_ID = 'remotion-webcodecs@4.0.479';
const PROTECTED_TRACK_METADATA_FEATURE = 'metadata:protected-tracks';
const WEBM_HEADER_RANGE_BYTES = 64 * 1024;
const VERIFIED_READER_CHUNK_BYTES = 1024 * 1024;
const DIRECT_WRITER_INPUT_THRESHOLD_BYTES = 256 * 1024 * 1024;
const SEEK_DECODE_REORDER_LOOKAHEAD_SAMPLES = 32;

// ── Lazily-imported lib handles (loaded in init(), UNTIMED per §0.7). ───────────────────────────
type WebcodecsModule = typeof import('@remotion/webcodecs');
type BufferWriterModule = typeof import('@remotion/webcodecs/buffer');
type MediaParserModule = typeof import('@remotion/media-parser');
type WebReaderModule = typeof import('@remotion/media-parser/web');
type MediaParserReader = import('@remotion/media-parser').MediaParserReaderInterface;
type MediaParserWriter = import('@remotion/media-parser').WriterInterface;
type SourceOptions = { src: string | Blob; reader?: MediaParserReader };
type AbortableController = { abort(reason?: unknown): void };

interface IsolatedVideoDecoder {
  decode(sample: EncodedVideoChunkInit): Promise<void>;
  flush(): Promise<void>;
  waitForQueueToBeLessThan(items: number): Promise<void>;
  close(): void;
}

interface LibHandle {
  wc: WebcodecsModule;
  bufferWriter: BufferWriterModule['bufferWriter'];
  mp: MediaParserModule;
  /**
   * The HTTP reader. Passed to parseMedia/convertMedia alongside `src: input.url` for normal corpus
   * assets so the lib resolves m3u8 sibling segments from the base URL and exercises the dossier
   * §A.1/§A.14 HTTP-Range lazy-read fast path. Mutated robustness inputs intentionally bypass this
   * reader and use Blob sources so the engine sees the rewritten bytes rather than the pristine URL.
   */
  webReader: WebReaderModule['webReader'];
}

export interface RemotionWebcodecsConfig extends AdapterConfigProfile {
  framework: '@remotion/webcodecs';
  packageVersions: {
    '@remotion/webcodecs': '4.0.479';
    '@remotion/media-parser': '4.0.479';
  };
  backend: 'webcodecs';
  hardwareAcceleration: 'prefer-hardware-with-software-fallback';
  workerCount: 0;
  threadCount: 0;
  readerMode: 'not-selected' | 'webReader' | 'verified-buffer';
  writerMode: 'not-selected' | 'bufferWriter' | 'directArrayBufferWriter';
  targetMode: 'in-memory-complete-output';
  codecConfigs: SerializableValue[];
  encoderNondeterministic: true;
  pixelBackend: 'offscreencanvas-2d';
  pipeline: 'streaming-backpressure';
  queueDepth: 'waitForQueueToBeLessThan';
  operation: 'none' | 'probe' | 'demux' | 'remux' | 'transcode' | 'decodeFrames' | 'seek';
  parsePath: 'not-selected' | 'main-thread';
  sourceReader: 'not-selected' | 'webReader' | 'verified-buffer';
  selectedTrackIds: number[];
  trackDecisions: Array<{ trackId: number; type: string; decision: string; reasonCode?: string }>;
  queueHighWaterMark: number;
  controllerFinalState: Record<string, number | null> | null;
  outputBytes: number;
  cleanupComplete: boolean;
  activeControllers: number;
  activeDecoders: number;
  activeFrames: number;
  activeWriterBuffers: number;
}

/** Initial immutable snapshot; instances replace operation-local fields with observed facts. */
export const CONFIG_USED: RemotionWebcodecsConfig = {
  framework: '@remotion/webcodecs',
  packageVersions: {
    '@remotion/webcodecs': '4.0.479',
    '@remotion/media-parser': '4.0.479',
  },
  backend: 'webcodecs',
  hardwareAcceleration: 'prefer-hardware-with-software-fallback',
  workerCount: 0,
  threadCount: 0,
  readerMode: 'not-selected',
  writerMode: 'not-selected',
  targetMode: 'in-memory-complete-output',
  codecConfigs: [],
  encoderNondeterministic: true,
  pixelBackend: 'offscreencanvas-2d',
  pipeline: 'streaming-backpressure',
  queueDepth: 'waitForQueueToBeLessThan',
  operation: 'none',
  parsePath: 'not-selected',
  sourceReader: 'not-selected',
  selectedTrackIds: [],
  trackDecisions: [],
  queueHighWaterMark: 0,
  controllerFinalState: null,
  outputBytes: 0,
  cleanupComplete: true,
  activeControllers: 0,
  activeDecoders: 0,
  activeFrames: 0,
  activeWriterBuffers: 0,
};

/** A FrameSink backed by digests + cached ImageData for SSIM/PSNR pixel access. */
class CapturedFrameSink implements FrameSink {
  frames: FrameDigest[] = [];
  telemetry?: FrameSink['telemetry'];
  selectedTrack?: FrameSink['selectedTrack'];
  private pixels: ImageData[] = [];

  push(img: ImageData, digest: FrameDigest): void {
    this.frames.push(digest);
    this.pixels.push(img);
  }

  getPixels = async (i: number): Promise<ImageData> => {
    const img = this.pixels[i];
    if (!img) throw new Error(`No pixels captured for frame ${i}`);
    return img;
  };
}

/**
 * Read a VideoFrame into tight, top-left, straight-alpha ImageData. For untransformed frames, prefer
 * VideoFrame.copyTo(RGBA); canvas drawImage can perturb exact decoded-frame hashes in Brave. Frames
 * with display crops/rotation still use canvas so display-space dimensions stay correct.
 */
async function imageDataFromVideoFrame(frame: VideoFrame): Promise<ImageData> {
  const width = frame.displayWidth || frame.codedWidth;
  const height = frame.displayHeight || frame.codedHeight;
  if (width <= 0 || height <= 0) throw new Error('VideoFrame has zero display size');

  const copied = await imageDataFromVideoFrameCopyTo(frame, width, height);
  if (copied) return copied;

  const { canvas, ctx } = make2dCanvas(width, height);
  // drawImage rasterizes transformed frames (crop/rotation/display size) to top-left RGBA.
  ctx.drawImage(frame as unknown as CanvasImageSource, 0, 0, width, height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

async function imageDataFromVideoFrameCopyTo(
  frame: VideoFrame,
  width: number,
  height: number,
): Promise<ImageData | null> {
  const visible = frame.visibleRect;
  const hasDisplayTransform =
    frame.displayWidth !== frame.codedWidth ||
    frame.displayHeight !== frame.codedHeight ||
    (visible != null &&
      (visible.x !== 0 || visible.y !== 0 || visible.width !== frame.codedWidth || visible.height !== frame.codedHeight));
  if (hasDisplayTransform || typeof frame.copyTo !== 'function') return null;

  try {
    const rgba = new Uint8Array(width * height * 4);
    await frame.copyTo(rgba, { format: 'RGBA' } as VideoFrameCopyToOptions);
    return new ImageData(new Uint8ClampedArray(rgba.buffer), width, height);
  } catch {
    return null;
  }
}

function make2dCanvas(width: number, height: number): {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
} {
  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
    if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');
    return { canvas, ctx };
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    return { canvas, ctx };
  }
  throw new Error('No canvas implementation available in this realm');
}

/**
 * The @remotion/webcodecs adapter.
 */
export class RemotionWebcodecsEngine implements MediaEngine {
  readonly id = ENGINE_ID;

  /**
   * The best-path config this engine drives (§8.5). Surfaced so the runner records it in the report
   * (hardware WebCodecs + OffscreenCanvas-2D pixel backend + streaming/backpressure pipeline +
   * direct in-memory WriterInterface). Previously CONFIG_USED was exported but never attached, so the report
   * recorded `configUsed === undefined` for this engine.
   */
  private lib: LibHandle | null = null;
  private readonly lifecycle = new AdapterLifecycleController(ENGINE_ID);
  private readonly fallbackAbort = new AbortController();
  private readonly activeControllers = new Set<AbortableController>();
  private readonly controllerAbortBindings = new Map<AbortableController, { signal: AbortSignal; abort: () => void }>();
  private readonly activeDecoders = new Set<IsolatedVideoDecoder>();
  private readonly activeFrames = new Set<VideoFrame>();
  private readonly verifiedSourceBytes = new WeakMap<MediaInput, Promise<Uint8Array>>();
  private activeWriterBuffers = 0;
  private config: RemotionWebcodecsConfig = structuredClone(CONFIG_USED);

  get configUsed(): RemotionWebcodecsConfig {
    return captureConfigUsedSnapshot(ENGINE_ID, this.config, {
      requireProfile: true,
    }) as unknown as RemotionWebcodecsConfig;
  }

  // ── capabilities (HONEST, dossier §10) ───────────────────────────────────────────────────────
  capabilities(): CapabilitySet {
    const capabilities: CapabilitySet = {
      operations: {
        probe: true, // via @remotion/media-parser parseMedia
        demux: true, // via parseMedia sample callbacks
        decodeFrames: true, // parseMedia samples -> createVideoDecoder
        seek: true, // mediaParserController.seek + decode
        remux: true, // convertMedia copy-tracks
        transcode: true, // convertMedia reencode + resize + rotate
        // trim / mux / decrypt: NOT supported by the lib -> left undeclared (NA(engine)).
      },
      containersIn: [...CONTAINERS_IN],
      containersOut: [...CONTAINERS_OUT], // mp4, webm, wav (the only three it can write)
      // READ-side superset: the codecs @remotion/media-parser can probe / demux / decode-identify.
      // The runner's negotiate() Pass-1 uses this single flat list to gate ALL ops including the
      // read-only probe/demux/decode paths, so it must reflect the lib's full READ reach, NOT just the
      // (narrower) ENCODE union. Output-codec honesty is protected separately: the ENCODE restriction
      // is still enforced for transcode/remux by canonicalToRemotionVideo/Audio (which return null →
      // throw for non-encodable codecs), the containersOut:['mp4','webm','wav'] gate, and negotiate()
      // Pass-2's WebCodecs VideoEncoder/AudioEncoder.isConfigSupported feature-detect. So widening the
      // read union does NOT enable any false-PASS encode. Mirrors the proven-honest sibling
      // remotion-media-parser adapter, which drives the IDENTICAL parseMedia read path.
      //
      // Video read set (MediaParserVideoCodec ⊇ these): adds 'av1' (encode-side has no av1 path).
      videoCodecs: ['h264', 'hevc', 'vp8', 'vp9', 'av1'],
      videoCodecsIn: ['h264', 'hevc', 'vp8', 'vp9', 'av1'],
      videoCodecsOut: ['h264', 'hevc', 'vp8', 'vp9'],
      // Audio read set (MediaParserAudioCodec ⊇ these): adds mp3/flac/vorbis + pcm-s24 that
      // media-parser reads but @remotion/webcodecs cannot encode (encode is aac/opus/pcm-s16 only).
      // Although 4.0.479's public types include `pcm-f32`, this build throws on IEEE-float WAVE
      // format tag 3 before returning metadata, so float WAV rows must negotiate NA.
      audioCodecs: ['aac', 'opus', 'mp3', 'flac', 'vorbis', 'pcm-s16', 'pcm-s24'],
      audioCodecsIn: ['aac', 'opus', 'mp3', 'flac', 'vorbis', 'pcm-s16', 'pcm-s24'],
      audioCodecsOut: ['aac', 'opus', 'pcm-s16'],
      // No decrypt API.
      encryption: [],
      // Pixel transforms are limited to resize + rotate (90° multiples) on OffscreenCanvas 2D.
      // 'resample' is HONEST for WAV output only: getDefaultAudioCodec({container:'wav'}) === 'wav',
      // whose getWaveAudioEncoder runs convertAudioData({ newSampleRate: config.sampleRate, format:'s16' })
      // and writes the requested rate into the output fmt chunk (verified in 4.0.479 ESM). For mp4/opus
      // Chrome's AudioEncoder overrides the requested rate, so non-WAV sampleRate still throws NA in
      // ensureSupportedTranscodeRequest (~line 2190) and channel remap stays NA there too.
      features: ['resize', 'rotate', 'resample', 'packets:dts', PROTECTED_TRACK_METADATA_FEATURE, 'decode:golden-rgba'],
    };
    return validateCapabilitySet(this, capabilities);
  }

  supports(request: ConcreteOperationRequest): SupportDecision {
    return validateSupportDecision(ENGINE_ID, decideRemotionWebcodecsSupport(request));
  }

  // ── init / dispose (UNTIMED, §0.7) ───────────────────────────────────────────────────────────
  /**
   * Dynamically import both packages (keeps the suite shell light) and warm the WebCodecs path.
   * There is no WASM to compile and no worker to spawn for the conversion pipeline, so init is
   * cheap; we still front-load the dynamic imports here so they are excluded from measured timing.
   * A short encoder warm-up exercises the native VideoEncoder so the first measured convert does not
   * pay the codec-spin-up cost.
   */
  async init(context?: LifecycleContext): Promise<void> {
    const call = context ?? fallbackLifecycleContext(this.fallbackAbort.signal, 'support');
    await this.lifecycle.init(call, async () => {
      const [wc, bufferMod, mp, webMod] = await Promise.all([
        import('@remotion/webcodecs'),
        import('@remotion/webcodecs/buffer'),
        import('@remotion/media-parser'),
        import('@remotion/media-parser/web'),
      ]);
      this.lib = { wc, bufferWriter: bufferMod.bufferWriter, mp, webReader: webMod.webReader };

      // Encoder warm-up (best-effort; never fails init). Spin up + tear down a hardware-preferred
      // VideoEncoder so the codec implementation is resident before the first measured operation.
      await warmUpEncoder();
    });
  }

  async dispose(context?: LifecycleContext): Promise<void> {
    const call = context ?? fallbackLifecycleContext(this.fallbackAbort.signal, 'cleanup');
    await this.lifecycle.dispose(call, async () => {
      for (const controller of this.activeControllers) controller.abort('adapter disposed');
      for (const decoder of this.activeDecoders) decoder.close();
      for (const frame of this.activeFrames) frame.close();
      this.activeControllers.clear();
      this.activeDecoders.clear();
      this.activeFrames.clear();
      this.activeWriterBuffers = 0;
      this.lib = null;
      this.updateResourceConfig(true);
    });
  }

  private mustLib(): LibHandle {
    if (!this.lib) throw new Error(`${ENGINE_ID}: init() must be awaited before use`);
    return this.lib;
  }

  /**
   * Choose the native Remotion source for this MediaInput.
   *
   * HTTP corpus assets keep the URL + webReader path because that is range-friendly and the only
   * correct path for HLS sibling segment resolution. The runner's digest-verified single-file
   * transport is a `blob:` URL; Remotion's fetch reader cannot establish its content length, while
   * its Blob reader can fail partway through large browser-managed Blobs. Serve the runner's exact,
   * already digest-verified bytes through a bounded-chunk random-access reader instead. Mutated
   * robustness inputs use the same reader because their URL still points at the pristine fixture.
   */
  private async sourceOptions(input: MediaInput): Promise<SourceOptions> {
    const { webReader } = this.mustLib();
    if (isHlsInput(input) || (!input.mutated && !input.url.startsWith('blob:'))) {
      this.config = {
        ...this.config,
        readerMode: 'webReader',
        sourceReader: 'webReader',
        parsePath: 'main-thread',
      };
      return { src: input.url, reader: webReader };
    }
    const bytes = await this.exactInputBytes(input);
    this.config = {
      ...this.config,
      readerMode: 'verified-buffer',
      sourceReader: 'verified-buffer',
      parsePath: 'main-thread',
    };
    return {
      src: input.url,
      reader: verifiedBufferReader(bytes, input.id, input.mime),
    };
  }

  private exactInputBytes(input: MediaInput): Promise<Uint8Array> {
    const cached = this.verifiedSourceBytes.get(input);
    if (cached) return cached;
    const pending = input.arrayBuffer().then((buffer) => new Uint8Array(buffer));
    this.verifiedSourceBytes.set(input, pending);
    return pending;
  }

  private async parse<F>(
    options: Parameters<MediaParserModule['parseMedia']>[0],
    context: OperationContext,
    onController?: (controller: ReturnType<MediaParserModule['mediaParserController']>) => void,
  ): Promise<F> {
    const { mp } = this.mustLib();
    const controller = mp.mediaParserController();
    onController?.(controller);
    this.activeControllers.add(controller);
    this.updateResourceConfig(false);
    const abort = (): void => controller.abort(context.signal.reason);
    if (context.signal.aborted) abort();
    else context.signal.addEventListener('abort', abort, { once: true });
    try {
      return (await mp.parseMedia({ ...options, controller })) as F;
    } finally {
      context.signal.removeEventListener('abort', abort);
      controller.abort('parse settled');
      this.activeControllers.delete(controller);
      this.updateResourceConfig(this.allResourcesClosed());
    }
  }

  // ── probe ────────────────────────────────────────────────────────────────────────────────────
  /**
   * Probe with media-parser. We request the "fast" header fields plus `tracks` (gives per-track
   * codec/dims/sampleRate/channels/rotation/fps) and `durationInSeconds`. `tracks` does not force a
   * full decode pass; duration comes from the header where present. Metadata tags are read via the
   * `metadata` field and flattened best-effort.
   */
  async probe(input: MediaInput, context?: OperationContext): Promise<NormalizedMetadata> {
    const call = context ?? fallbackOperationContext('probe', this.fallbackAbort.signal);
    return this.lifecycle.operation('probe', call, async () => {
      this.beginOperation('probe');
      try {
        return validateAdapterResult(ENGINE_ID, 'probe', await this.probeImpl(input, call));
      } finally {
        this.updateResourceConfig(this.allResourcesClosed());
      }
    });
  }

  private async probeImpl(input: MediaInput, context: OperationContext): Promise<NormalizedMetadata> {
    if (isHlsInput(input)) {
      const { metadata, packets } = await this.demuxImpl(input, context);
      return withVideoFpsFromPackets(metadata, packets);
    }

    const srcOptions = await this.sourceOptions(input);
    const headerMetadata = await webmHeaderMetadata(input);
    if (shouldUseHeaderOnlyWebmProbe(input, headerMetadata)) {
      return headerMetadata;
    }
    const headerFps = singleVideoFpsFromMetadata(headerMetadata);

    const result = await this.parse<{
      container: import('@remotion/media-parser').MediaParserContainer;
      durationInSeconds: number | null;
      tracks: import('@remotion/media-parser').MediaParserTrack[];
      metadata: import('@remotion/media-parser').MediaParserMetadataEntry[];
    }>({
      ...srcOptions,
      acknowledgeRemotionLicense: true,
      fields: {
        container: true,
        durationInSeconds: true,
        tracks: true,
        metadata: true,
      },
    }, context);

    const container = await canonicalContainerForInput(input, result.container);
    const metadata = await withProtectedMp4MetadataFallback(
      input,
      normalizeMetadata(container, result.durationInSeconds, result.tracks, result.metadata),
      result.tracks,
    );
    if (needsPacketProbeFallback(metadata)) {
      const { metadata: demuxMetadata, packets } = await this.demuxImpl(input, context);
      return withProbeFieldsFromPackets(demuxMetadata, packets);
    }

    if (!needsWebmFamilyFpsFallback(metadata)) return metadata;

    if (headerFps != null) return withSingleVideoFps(metadata, headerFps);

    const slow = await this.parse<{ slowFps: number }>({
      ...srcOptions,
      acknowledgeRemotionLicense: true,
      fields: { slowFps: true },
    }, context);
    const fps = typeof slow.slowFps === 'number' && Number.isFinite(slow.slowFps) && slow.slowFps > 0
      ? slow.slowFps
      : null;
    return fps == null ? metadata : withSingleVideoFps(metadata, fps);
  }

  // ── demux ────────────────────────────────────────────────────────────────────────────────────
  /**
   * Emit a packet table by attaching sample callbacks for every track. Returning a sample callback
   * forces a full parse (dossier §2). Each MediaParserSample carries `timestamp` (PTS, microseconds),
   * `decodingTimestamp` (DTS, microseconds), `data` (size), and `type` ('key'|'delta').
   *
   * trackIndex must match the container's STABLE stream order (the golden-packets oracle anchors
   * trackIndex to the ffprobe stream index, e.g. multitrack = video:0,audio:1,audio:2). media-parser
   * may FIRE onVideoTrack/onAudioTrack in a different order than the stream order, so we DO NOT index
   * by first-announcement order (that would invert indices for files where an audio track is announced
   * before video, FAILing the per-track size compare). Instead each sample is tagged with its raw
   * `trackId`, and after the parse we assign the final 0-based trackIndex from result.tracks ordered by
   * ascending trackId (= container stream order), remapping every packet. The metadata track list is
   * sorted the same way so packets[i].trackIndex aligns with metadata.tracks[trackIndex].
   */
  async demux(input: MediaInput, context?: OperationContext): Promise<DemuxResult> {
    const call = context ?? fallbackOperationContext('demux', this.fallbackAbort.signal);
    return this.lifecycle.operation('demux', call, async () => {
      this.beginOperation('demux');
      try {
        return validateAdapterResult(ENGINE_ID, 'demux', await this.demuxImpl(input, call), {
          requireExplicitCodedRepresentation: true,
        });
      } finally {
        this.updateResourceConfig(this.allResourcesClosed());
      }
    });
  }

  private async demuxImpl(input: MediaInput, context: OperationContext): Promise<DemuxResult> {
    const srcOptions = await this.sourceOptions(input);

    // Collect packets tagged with the raw container trackId; index is resolved AFTER the parse.
    const tagged: TaggedPacket[] = [];
    const onSample = (
      track: import('@remotion/media-parser').MediaParserVideoTrack
        | import('@remotion/media-parser').MediaParserAudioTrack,
    ) => (
      sample: import('@remotion/media-parser').MediaParserVideoSample
        | import('@remotion/media-parser').MediaParserAudioSample,
    ): void => {
      tagged.push({
        trackId: track.trackId,
        packet: remotionWebcodecsSampleEvidence(sample, track),
      });
    };

    const result = await this.parse<{
      container: import('@remotion/media-parser').MediaParserContainer;
      durationInSeconds: number | null;
      tracks: import('@remotion/media-parser').MediaParserTrack[];
      metadata: import('@remotion/media-parser').MediaParserMetadataEntry[];
    }>({
      ...srcOptions,
      acknowledgeRemotionLicense: true,
      fields: {
        container: true,
        durationInSeconds: true,
        tracks: true,
        metadata: true,
      },
      onVideoTrack: ({ track }) => onSample(track),
      onAudioTrack: ({ track }) => onSample(track),
    }, context);

    // Stable trackId -> 0-based index in ascending-trackId order (= container stream order). Tracks
    // that emitted samples but were not in result.tracks (defensive) are appended after, preserving
    // their relative trackId order, so no packet is dropped.
    const indexByTrackId = new Map<number, number>();
    let nextIndex = 0;
    for (const t of result.tracks) {
      if (!indexByTrackId.has(t.trackId)) indexByTrackId.set(t.trackId, nextIndex++);
    }
    for (const { trackId } of tagged) {
      if (!indexByTrackId.has(trackId)) indexByTrackId.set(trackId, nextIndex++);
    }

    const container = await canonicalContainerForInput(input, result.container);
    const packets: PacketInfo[] = tagged.map(({ trackId, packet }) => {
      const trackIndex = indexByTrackId.get(trackId)!;
      return {
        trackIndex,
        ...packet,
      };
    });

    const metadata = normalizeMetadata(
      container,
      result.durationInSeconds,
      result.tracks,
      result.metadata,
      indexByTrackId,
    );
    const representations = result.tracks.map((track) =>
      trackRepresentation(track, indexByTrackId.get(track.trackId) ?? indexByTrackId.size),
    );
    return {
      metadata,
      packets,
      packetOrdering: 'decode',
      representations,
      telemetry: { packetCount: packets.length },
    };
  }

  // ── remux ────────────────────────────────────────────────────────────────────────────────────
  /**
   * Lossless container change: convertMedia copies encoded samples when the target container accepts
   * the source codecs. We do NOT force a codec, so the default track handler copies where it can and
   * only re-encodes if the container cannot hold the source codec. Output goes to the direct
   * in-memory WriterInterface so the completed bytes do not need a save-time Blob round trip.
   */
  async remux(
    input: MediaInput,
    opts: { container: string },
    context?: OperationContext,
  ): Promise<MediaBytes> {
    const call = context ?? fallbackOperationContext('remux', this.fallbackAbort.signal, input, opts);
    return this.lifecycle.operation('remux', call, async () => {
      this.beginOperation('remux');
      try {
        if (context) {
          const decision = decideRemotionWebcodecsSupport(call.request);
          if (!decision.supported) throw decisionToNotApplicable(call.request, decision);
        }
        return validateAdapterResult(ENGINE_ID, 'remux', await this.remuxImpl(input, opts, call));
      } finally {
        this.updateResourceConfig(this.allResourcesClosed());
      }
    });
  }

  private async remuxImpl(
    input: MediaInput,
    opts: { container: string },
    context: OperationContext,
  ): Promise<MediaBytes> {
    const container = canonicalToRemotionContainer(opts.container);
    if (!container) {
      throw createNotApplicableError(
        ENGINE_ID,
        'remux',
        `Remotion cannot write container '${opts.container}'`,
        remotionTupleSummary(context.request),
        'REMOTION_OUTPUT_CONTAINER_UNSUPPORTED',
      );
    }

    const handlers = await this.copyOnlyTrackHandlers(input, container, context);
    return this.convert(input, { container, ...handlers }, context);
  }

  // ── transcode ────────────────────────────────────────────────────────────────────────────────
  /**
   * Re-encode / resize / rotate via convertMedia. A requested fan-out ladder executes every rendition
   * independently and retains every output in MediaBytes.variants (the primary bytes remain the first
   * requested rendition for backward compatibility). When a codec is requested explicitly we
   * map+validate it; when ONLY resize/rotate is asked for we leave the codec undefined so convertMedia's
   * default handler re-encodes with the container default. Same-aspect exact width+height requests use
   * a width operation; aspect-changing boxes are rejected before conversion.
   */
  async transcode(
    input: MediaInput,
    opts: TranscodeOptions,
    context?: OperationContext,
  ): Promise<MediaBytes> {
    const call = context ?? fallbackOperationContext(
      'transcode',
      this.fallbackAbort.signal,
      input,
      opts as unknown as Record<string, unknown>,
    );
    return this.lifecycle.operation('transcode', call, async () => {
      this.beginOperation('transcode');
      try {
        if (context) {
          const decision = decideRemotionWebcodecsSupport(call.request);
          if (!decision.supported) throw decisionToNotApplicable(call.request, decision);
        }
        const output = await this.transcodeImpl(input, opts, call);
        return validateAdapterResult(ENGINE_ID, 'transcode', output);
      } catch (error) {
        if (
          isGracefulTranscodeNegative(call.request) &&
          !isMalformedInputError(error) &&
          !isNotApplicableError(error) &&
          !isBrowserNotSupportedError(error)
        ) {
          throw createMalformedInputError(
            ENGINE_ID,
            'transcode',
            'parse',
            describeError(error),
            'REMOTION_TRANSCODE_MALFORMED_INPUT_REJECTED',
            input.id,
            error,
          );
        }
        throw error;
      } finally {
        this.updateResourceConfig(this.allResourcesClosed());
      }
    });
  }

  private async transcodeImpl(
    input: MediaInput,
    opts: TranscodeOptions,
    context: OperationContext,
  ): Promise<MediaBytes> {
    const container = canonicalToRemotionContainer(opts.container);
    if (!container) {
      throw createNotApplicableError(
        ENGINE_ID,
        'transcode',
        `Remotion cannot write container '${opts.container}'`,
        remotionTupleSummary(context.request),
        'REMOTION_OUTPUT_CONTAINER_UNSUPPORTED',
      );
    }

    if (opts.variants?.length) {
      const outputs: MediaBytes[] = [];
      for (const variant of opts.variants) {
        outputs.push(await this.transcodeSingle(input, { ...opts, variants: undefined, video: variant }, container, context));
      }
      const first = outputs[0];
      if (!first) {
        throw createNotApplicableError(
          ENGINE_ID,
          'transcode',
          'an empty rendition ladder has no output contract',
          remotionTupleSummary(context.request),
          'REMOTION_EMPTY_RENDITION_LADDER',
        );
      }
      return { ...first, variants: outputs.map((output) => ({ ...output })) };
    }

    return this.transcodeSingle(input, opts, container, context);
  }

  private async transcodeSingle(
    input: MediaInput,
    opts: TranscodeOptions,
    container: RemotionContainer,
    context: OperationContext,
  ): Promise<MediaBytes> {

    const videoSpec = opts.video;
    const parsed = await this.assertRequestedTracksPresent(input, opts, videoSpec, context);
    ensureSupportedTranscodeRequest(input, opts, container, videoSpec, parsed.tracks, context.request);

    let videoCodec: RemotionVideoCodec | undefined;
    let resize: import('@remotion/webcodecs').ResizeOperation | undefined;
    let rotate: number | undefined;

    // wav is audio-only: ignore any video spec entirely.
    if (container !== 'wav' && videoSpec) {
      if (videoSpec.codec) {
        const mapped = canonicalToRemotionVideo(videoSpec.codec);
        if (!mapped) {
          throw createNotApplicableError(
            ENGINE_ID,
            'transcode',
            `Remotion cannot encode video codec '${videoSpec.codec}'`,
            remotionTupleSummary(context.request),
            'REMOTION_VIDEO_CODEC_UNSUPPORTED',
          );
        }
        videoCodec = mapped;
      }
      // (no explicit codec -> leave undefined; convertMedia uses the container default on re-encode)
      resize = buildResize(videoSpec);
      if (typeof videoSpec.rotate === 'number') {
        rotate = ((videoSpec.rotate % 360) + 360) % 360;
      }
    }

    let audioCodec: RemotionAudioCodec | undefined;
    if (opts.audio && opts.audio.codec) {
      const mapped = canonicalToRemotionAudio(opts.audio.codec);
      if (!mapped || opts.audio.codec !== canonicalAudioForRemotion(mapped)) {
        throw createNotApplicableError(
          ENGINE_ID,
          'transcode',
          `Remotion cannot encode '${opts.audio.codec}' exactly`,
          remotionTupleSummary(context.request),
          opts.audio.codec === 'pcm-s24'
            ? 'REMOTION_PCM_S24_OUTPUT_UNSUPPORTED'
            : 'REMOTION_AUDIO_CODEC_UNSUPPORTED',
        );
      }
      audioCodec = mapped;
    }

    // Audio resample (sampleRate only; channel remap stays NA and is rejected upstream by
    // ensureSupportedTranscodeRequest). When a target rate is requested without a channel change we
    // forward it to convertMedia via an onAudioTrack resolver. The resolver MUST return 'reencode'
    // UNCONDITIONALLY: a 'copy' (which canCopyTrack would allow for an already-pcm-s16 WAV source)
    // bypasses the encoder entirely and would emit the SOURCE rate, silently ignoring the resample.
    // Re-encoding routes every AudioData through getWaveAudioEncoder ->
    // convertAudioData({ newSampleRate, format:'s16' }), which resamples and writes the requested rate
    // into the WAV fmt chunk. Only reachable for WAV here: ensureSupportedTranscodeRequest still throws
    // NA for non-WAV sampleRate (Chrome's AudioEncoder overrides the rate for aac/opus).
    const handlers = this.reencodeTrackHandlers(
      container,
      videoCodec,
      audioCodec,
      resize,
      rotate,
      opts,
      context,
    );

    return this.convert(input, { container, videoCodec, audioCodec, resize, rotate, ...handlers }, context);
  }

  private async copyOnlyTrackHandlers(
    input: MediaInput,
    container: RemotionContainer,
    context: OperationContext,
  ): Promise<{
    onVideoTrack: import('@remotion/webcodecs').ConvertMediaOnVideoTrackHandler;
    onAudioTrack: import('@remotion/webcodecs').ConvertMediaOnAudioTrackHandler;
  }> {
    const { wc } = this.mustLib();
    const srcOptions = await this.sourceOptions(input);
    const parsed = await this.parse<{
      container: import('@remotion/media-parser').MediaParserContainer;
      tracks: import('@remotion/media-parser').MediaParserTrack[];
    }>({
      ...srcOptions,
      acknowledgeRemotionLicense: true,
      fields: { container: true, tracks: true },
    }, context);

    if (!parsed.tracks.length) {
      throw createNotApplicableError(
        ENGINE_ID,
        'remux',
        'copy-only remux requires at least one track',
        remotionTupleSummary(context.request),
        'REMOTION_REMUX_TRACK_REQUIRED',
      );
    }

    const copiedVideo = new Set<number>();
    const copiedAudio = new Set<number>();
    for (const track of parsed.tracks) {
      let copy = false;
      if (track.type === 'video') {
        copy = wc.canCopyVideoTrack({
          inputContainer: parsed.container,
          inputTrack: track,
          outputContainer: container,
          outputVideoCodec: null,
          resizeOperation: null,
          rotationToApply: 0,
        });
        if (copy) copiedVideo.add(track.trackId);
      } else if (track.type === 'audio') {
        copy = wc.canCopyAudioTrack({
          inputCodec: track.codecEnum,
          inputContainer: parsed.container,
          outputContainer: container,
          outputAudioCodec: null,
        });
        if (copy) copiedAudio.add(track.trackId);
      }
      this.recordTrackDecision(track.trackId, track.type, copy ? 'copy' : 'reject', copy ? undefined : 'REMOTION_REMUX_COPY_INCOMPATIBLE');
      if (!copy) {
        throw createNotApplicableError(
          ENGINE_ID,
          'remux',
          `track ${track.trackId} (${track.type}) cannot be copied into ${container}`,
          remotionTupleSummary(context.request),
          'REMOTION_REMUX_COPY_INCOMPATIBLE',
        );
      }
    }

    const inputContainer = context.request.inputs[0]?.container;
    if (inputContainer === 'mp4' || inputContainer === 'mov') {
      const sampleCountByTrackId = new Map<number, number>();
      const countSample = (trackId: number): void => {
        sampleCountByTrackId.set(trackId, (sampleCountByTrackId.get(trackId) ?? 0) + 1);
      };
      await this.parse({
        ...srcOptions,
        acknowledgeRemotionLicense: true,
        fields: { tracks: true },
        onVideoTrack: ({ track }: { track: import('@remotion/media-parser').MediaParserVideoTrack }) =>
          () => countSample(track.trackId),
        onAudioTrack: ({ track }: { track: import('@remotion/media-parser').MediaParserAudioTrack }) =>
          () => countSample(track.trackId),
      }, context);
      const timeline = readIsoBmffPresentationTimeline(new Uint8Array(await input.arrayBuffer()));
      if (timeline.state === 'OK') {
        for (const track of parsed.tracks) {
          if (track.type !== 'video' && track.type !== 'audio') continue;
          const expected = timeline.tracks.find((candidate) => candidate.trackId === track.trackId);
          if (!expected) continue;
          const observed = sampleCountByTrackId.get(track.trackId) ?? 0;
          if (observed !== expected.codedSampleCount) {
            throw createNotApplicableError(
              ENGINE_ID,
              'remux',
              `media-parser 4.0.479 extracted ${observed}/${expected.codedSampleCount} coded samples for ISO track ${track.trackId}`,
              remotionTupleSummary(context.request),
              'REMOTION_REMUX_SAMPLE_EXTRACTION_INCOMPLETE',
            );
          }
        }
      }
    }

    return {
      onVideoTrack: ({ track, canCopyTrack }) => {
        if (!canCopyTrack || !copiedVideo.has(track.trackId)) {
          throw createNotApplicableError(
            ENGINE_ID,
            'remux',
            `framework copy eligibility changed for video track ${track.trackId}`,
            remotionTupleSummary(context.request),
            'REMOTION_REMUX_COPY_INCOMPATIBLE',
          );
        }
        return { type: 'copy' };
      },
      onAudioTrack: ({ track, canCopyTrack }) => {
        if (!canCopyTrack || !copiedAudio.has(track.trackId)) {
          throw createNotApplicableError(
            ENGINE_ID,
            'remux',
            `framework copy eligibility changed for audio track ${track.trackId}`,
            remotionTupleSummary(context.request),
            'REMOTION_REMUX_COPY_INCOMPATIBLE',
          );
        }
        return { type: 'copy' };
      },
    };
  }

  private reencodeTrackHandlers(
    container: RemotionContainer,
    videoCodec: RemotionVideoCodec | undefined,
    audioCodec: RemotionAudioCodec | undefined,
    resize: import('@remotion/webcodecs').ResizeOperation | undefined,
    rotate: number | undefined,
    opts: TranscodeOptions,
    context: OperationContext,
  ): {
    onVideoTrack: import('@remotion/webcodecs').ConvertMediaOnVideoTrackHandler;
    onAudioTrack: import('@remotion/webcodecs').ConvertMediaOnAudioTrackHandler;
  } {
    const { wc } = this.mustLib();
    return {
      onVideoTrack: async ({ track, canCopyTrack, defaultVideoCodec }) => {
        if (container === 'wav') {
          this.recordTrackDecision(track.trackId, 'video', 'drop');
          return { type: 'drop' };
        }
        const transformRequested = Boolean(opts.video?.codec || resize || rotate);
        if (!transformRequested && canCopyTrack) {
          this.recordTrackDecision(track.trackId, 'video', 'copy');
          return { type: 'copy' };
        }
        const codec = videoCodec ?? defaultVideoCodec;
        if (!codec) {
          throw createNotApplicableError(
            ENGINE_ID,
            'transcode',
            `no output video codec is available for track ${track.trackId}`,
            remotionTupleSummary(context.request),
            'REMOTION_VIDEO_CODEC_UNSUPPORTED',
          );
        }
        await this.assertExactVideoReencodeConfigs(track, codec, resize, rotate, context);
        const supported = await wc.canReencodeVideoTrack({
          videoCodec: codec,
          track,
          resizeOperation: resize ?? null,
          rotate: rotate ?? null,
        });
        this.recordFrameworkCodecProbe('framework-video-reencode', track.trackId, codec, supported, {
          width: opts.video?.width ?? track.width,
          height: opts.video?.height ?? track.height,
          frameRate: track.fps,
        });
        if (!supported) {
          throw createBrowserNotSupportedError(
            ENGINE_ID,
            'transcode',
            `the browser cannot configure Remotion's ${codec} encoder for track ${track.trackId}`,
            remotionTupleSummary(context.request),
            'REMOTION_VIDEO_ENCODER_CONFIG_UNSUPPORTED',
          );
        }
        this.recordTrackDecision(track.trackId, 'video', 'reencode');
        return { type: 'reencode', videoCodec: codec, resize: resize ?? null, rotate: rotate ?? 0 };
      },
      onAudioTrack: async ({ track, canCopyTrack, defaultAudioCodec }) => {
        const transformRequested = Boolean(opts.audio);
        if (!transformRequested && canCopyTrack) {
          this.recordTrackDecision(track.trackId, 'audio', 'copy');
          return { type: 'copy' };
        }
        const codec = audioCodec ?? defaultAudioCodec;
        if (!codec) {
          throw createNotApplicableError(
            ENGINE_ID,
            'transcode',
            `no output audio codec is available for track ${track.trackId}`,
            remotionTupleSummary(context.request),
            'REMOTION_AUDIO_CODEC_UNSUPPORTED',
          );
        }
        const bitrate = opts.audio?.bitrate ?? 128_000;
        const sampleRate = opts.audio?.sampleRate ?? null;
        await this.assertExactAudioReencodeConfigs(track, codec, bitrate, sampleRate, context);
        const supported = await wc.canReencodeAudioTrack({
          track,
          audioCodec: codec,
          bitrate,
          sampleRate,
        });
        this.recordFrameworkCodecProbe('framework-audio-reencode', track.trackId, codec, supported, {
          sampleRate: sampleRate ?? track.sampleRate,
          channels: track.numberOfChannels,
          bitrate,
        });
        if (!supported) {
          throw createBrowserNotSupportedError(
            ENGINE_ID,
            'transcode',
            `the browser cannot configure Remotion's ${codec} encoder for track ${track.trackId}`,
            remotionTupleSummary(context.request),
            'REMOTION_AUDIO_ENCODER_CONFIG_UNSUPPORTED',
          );
        }
        this.recordTrackDecision(track.trackId, 'audio', 'reencode');
        return { type: 'reencode', audioCodec: codec, bitrate, sampleRate };
      },
    };
  }

  /** Shared convertMedia driver: buffer writer + license ack + probe-derived expected metadata. */
  private async convert(
    input: MediaInput,
    opts: {
      container: RemotionContainer;
      videoCodec?: RemotionVideoCodec;
      audioCodec?: RemotionAudioCodec;
      resize?: import('@remotion/webcodecs').ResizeOperation;
      rotate?: number;
      // Optional per-audio-track resolver (used only for the resample path). When provided it OVERRIDES
      // the lib's default copy/reencode decision so the requested output sampleRate is honored.
      onAudioTrack?: import('@remotion/webcodecs').ConvertMediaOnAudioTrackHandler;
      onVideoTrack?: import('@remotion/webcodecs').ConvertMediaOnVideoTrackHandler;
    },
    context: OperationContext,
  ): Promise<MediaBytes> {
    const { wc, bufferWriter } = this.mustLib();
    const srcOptions = await this.sourceOptions(input);
    const useDirectWriter = (input.sizeBytes ?? 0) >= DIRECT_WRITER_INPUT_THRESHOLD_BYTES;
    const outputWriter = useDirectWriter ? directArrayBufferWriter() : null;
    this.config = {
      ...this.config,
      writerMode: useDirectWriter ? 'directArrayBufferWriter' : 'bufferWriter',
    };

    // Probe (fast, header-only) to size the MP4 moov in one pass (dossier §4.6).
    let expectedDurationInSeconds: number | null = null;
    let expectedFrameRate: number | null = null;
    try {
      const probed = await this.parse<{ durationInSeconds: number | null; fps: number | null }>({
        ...srcOptions,
        acknowledgeRemotionLicense: true,
        fields: { durationInSeconds: true, fps: true },
      }, context);
      expectedDurationInSeconds = probed.durationInSeconds ?? null;
      expectedFrameRate = probed.fps ?? null;
    } catch (error) {
      if (context.signal.aborted) {
        throw context.signal.reason ?? error;
      }
      // Non-fatal: convertMedia still works without the size hints, just may re-write the moov.
    }

    const controller = wc.webcodecsController();
    this.activeControllers.add(controller);
    this.activeWriterBuffers++;
    this.updateResourceConfig(false);
    const abort = (): void => controller.abort(context.signal.reason);
    if (context.signal.aborted) abort();
    else context.signal.addEventListener('abort', abort, { once: true });

    const started = nowMs();
    let lastAtMs = 0;
    let lastProgress = -1;
    let decodedFrames = 0;
    let encodedFrames = 0;
    let result: Awaited<ReturnType<WebcodecsModule['convertMedia']>> | undefined;
    let primaryError: unknown;
    try {
      // NOTE: convertMedia sets acknowledgeRemotionLicense:true internally and does NOT accept it as
      // a param (it would be an excess property); we only pass it to parseMedia above.
      result = await wc.convertMedia({
        ...srcOptions,
        container: opts.container,
        videoCodec: opts.videoCodec,
        audioCodec: opts.audioCodec,
        resize: opts.resize,
        rotate: opts.rotate,
        onAudioTrack: opts.onAudioTrack,
        onVideoTrack: opts.onVideoTrack,
        controller,
        writer: outputWriter?.writer ?? bufferWriter,
        expectedDurationInSeconds,
        expectedFrameRate,
        onProgress: (state) => {
          const atMs = monotonicElapsed(started, lastAtMs);
          lastAtMs = atMs;
          if (state.overallProgress == null) {
            context.emit({ type: 'progress', atMs, determinate: false });
          } else if (Number.isFinite(state.overallProgress)) {
            // Remotion can transiently report values above 1 while mux finalization catches up.
            // Normalize that framework-local estimate to the adapter telemetry contract.
            const progress = Math.min(1, Math.max(0, state.overallProgress));
            if (progress >= lastProgress) {
              lastProgress = progress;
              context.emit({ type: 'progress', atMs, determinate: true, value: progress });
            }
          }
          if (state.decodedVideoFrames > decodedFrames) {
            decodedFrames = state.decodedVideoFrames;
            context.emit({ type: 'decoded-frame-count', atMs, count: decodedFrames });
          }
          if (state.encodedVideoFrames > encodedFrames) {
            encodedFrames = state.encodedVideoFrames;
            context.emit({ type: 'encoded-frame-count', atMs, count: encodedFrames });
          }
        },
      });

      this.config = {
        ...this.config,
        controllerFinalState: normalizeFinalState(result.finalState),
      };

      // Remotion's stock bufferWriter getBlob() clones the complete resizable buffer into a File,
      // after which Blob.arrayBuffer() clones it again. Large outputs can finish successfully and
      // then fail only during those two redundant copies. Our WriterInterface exposes the finished
      // buffer directly. Test doubles that do not invoke the supplied writer retain save() fallback.
      let bytes = outputWriter?.bytes() ?? null;
      if (bytes === null) {
        const blob = await result.save();
        bytes = new Uint8Array(await blob.arrayBuffer());
      }
      const atMs = monotonicElapsed(started, lastAtMs);
      lastAtMs = atMs;
      context.emit({ type: 'first-byte', atMs });
      context.emit({ type: 'bytes-written', atMs, bytes: bytes.byteLength });
      context.emit({ type: 'write-count', atMs, count: 1 });
      if (result.finalState.decodedVideoFrames > decodedFrames) {
        decodedFrames = result.finalState.decodedVideoFrames;
        context.emit({ type: 'decoded-frame-count', atMs, count: decodedFrames });
      }
      if (result.finalState.encodedVideoFrames > encodedFrames) {
        encodedFrames = result.finalState.encodedVideoFrames;
        context.emit({ type: 'encoded-frame-count', atMs, count: encodedFrames });
      }
      if (lastProgress < 1) {
        lastProgress = 1;
        context.emit({ type: 'progress', atMs, determinate: true, value: 1 });
      }
      this.config = {
        ...this.config,
        outputBytes: bytes.byteLength,
      };
      return {
        bytes,
        mime: mimeForContainer(opts.container),
        container: opts.container,
        targetWrites: 1,
        firstByteMs: atMs,
        telemetry: {
          progress: 1,
          bytesWritten: bytes.byteLength,
          writeCount: 1,
          decodedFrames,
          encodedFrames,
          firstByteMs: atMs,
        },
      };
    } catch (error) {
      primaryError = error;
      throw error;
    } finally {
      context.signal.removeEventListener('abort', abort);
      controller.abort('conversion settled');
      let cleanupError: unknown;
      if (result) {
        try {
          await result.remove();
        } catch (error) {
          cleanupError = error;
        }
      }
      this.activeWriterBuffers = Math.max(0, this.activeWriterBuffers - 1);
      this.activeControllers.delete(controller);
      this.updateResourceConfig(this.allResourcesClosed() && cleanupError === undefined);
      if (cleanupError !== undefined) {
        if (primaryError !== undefined) {
          throw new AggregateError([primaryError, cleanupError], 'Remotion conversion and writer cleanup both failed');
        }
        throw cleanupError;
      }
    }
  }

  // ── decodeFrames ─────────────────────────────────────────────────────────────────────────────
  /**
   * Decode the primary video track to normalized RGBA frame digests. We parse with media-parser to
   * obtain the track config + encoded samples, feed those EncodedVideoChunks into an isolated native
   * VideoDecoder, and rasterize each emitted VideoFrame to tight straight-alpha RGBA. The isolated
   * decoder preserves native flush failures that the pinned framework wrapper swallows; queue-size
   * backpressure and exact hardware/software support probes remain explicit adapter evidence.
   *
   * Frames are emitted by the decoder in PRESENTATION order; we sort the captured frames by pts and
   * re-index so the digest list is presentation-ordered (matching the golden frame ordering).
   */
  async decodeFrames(
    input: MediaInput,
    opts?: DecodeOptions,
    context?: OperationContext,
  ): Promise<FrameSink> {
    const call = context ?? fallbackOperationContext('decodeFrames', this.fallbackAbort.signal, input);
    return this.lifecycle.operation('decodeFrames', call, async () => {
      this.beginOperation('decodeFrames');
      try {
        return validateAdapterResult(ENGINE_ID, 'decodeFrames', await this.decodeFramesImpl(input, opts, call));
      } finally {
        this.updateResourceConfig(this.allResourcesClosed());
      }
    });
  }

  private async decodeFramesImpl(
    input: MediaInput,
    opts: DecodeOptions | undefined,
    context: OperationContext,
  ): Promise<FrameSink> {
    const { wc } = this.mustLib();
    const srcOptions = await this.sourceOptions(input);
    const max = opts?.maxFrames ?? Number.MAX_SAFE_INTEGER;
    const selection = await this.primaryVideoTrack(input, context, opts?.track);
    const selected = selection.track;
    this.config = { ...this.config, selectedTrackIds: [selected.trackId] };

    const captured: Array<{ img: Promise<ImageData>; ptsUs: number }> = [];
    let decodeError: Error | null = null;
    const decoderState: { value: IsolatedVideoDecoder | null } = { value: null };
    let decoderPromise: Promise<IsolatedVideoDecoder> | null = null;
    let stopped = false;
    let pending = 0;
    let firstFrameMs: number | undefined;
    const started = nowMs();
    const controller = wc.webcodecsController();
    this.bindActiveController(controller, context.signal);

    try {
      await this.parse({
        ...srcOptions,
        acknowledgeRemotionLicense: true,
        fields: { tracks: true },
        onVideoTrack: ({ track }) => {
          if (track.trackId !== selected.trackId) return null;
          const config = decoderConfigForTrack(track);
          decoderPromise = this.createTrackedDecoder(
            track.trackId,
            config,
            'decodeFrames',
            context,
            controller,
            (frame) => {
              if (captured.length >= max) {
                frame.close();
                return;
              }
              this.activeFrames.add(frame);
              this.updateResourceConfig(false);
              const ptsUs = Math.round(frame.timestamp);
              const img = imageDataFromVideoFrame(frame).finally(() => {
                frame.close();
                this.activeFrames.delete(frame);
                this.updateResourceConfig(this.allResourcesClosed());
              });
              void img.catch(() => undefined);
              captured.push({ img, ptsUs });
              const atMs = Math.max(0, nowMs() - started);
              if (firstFrameMs === undefined) {
                firstFrameMs = atMs;
                context.emit({ type: 'first-frame', atMs });
              }
              context.emit({ type: 'decoded-frame-count', atMs, count: captured.length });
            },
            (error) => {
              decodeError = error;
            },
          ).then((created) => {
            decoderState.value = created;
            return created;
          });

          return async (sample) => {
            if (stopped) return;
            const active = decoderState.value ?? (await decoderPromise!);
            if (captured.length >= max) {
              stopped = true;
              return () => undefined;
            }
            pending++;
            this.config = { ...this.config, queueHighWaterMark: Math.max(this.config.queueHighWaterMark, pending) };
            try {
              await active.waitForQueueToBeLessThan(16);
              await active.decode({
                type: sample.type,
                timestamp: sample.timestamp,
                duration: sample.duration,
                data: sample.data,
              });
            } finally {
              pending--;
            }
          };
        },
      }, context);

      if (decoderPromise) decoderState.value = await decoderPromise;
      if (decoderState.value) await decoderState.value.flush();
      if (decodeError) throw decodeError;

      captured.sort((a, b) => a.ptsUs - b.ptsUs);
      const out = new CapturedFrameSink();
      for (let i = 0; i < captured.length && i < max; i++) {
        const item = captured[i]!;
        const img = await item.img;
        out.push(img, await digestImageData(img, i, item.ptsUs));
        if (i === 0) opts?.onFirstFrame?.(nowMs());
      }
      out.telemetry = {
        decodedFrames: out.frames.length,
        ...(firstFrameMs !== undefined ? { firstFrameMs } : {}),
      };
      out.selectedTrack = {
        schema: DECODE_TRACK_SELECTOR_SCHEMA,
        type: 'video',
        trackIndex: selection.trackIndex,
        typeOrdinal: selection.typeOrdinal,
        trackId: String(selected.trackId),
        codec: parserToCanonicalVideo(selected.codec),
        width: selected.width,
        height: selected.height,
      };
      return out;
    } finally {
      if (decoderState.value) {
        decoderState.value.close();
        this.activeDecoders.delete(decoderState.value);
      }
      for (const frame of this.activeFrames) frame.close();
      this.activeFrames.clear();
      await Promise.allSettled(captured.map((item) => item.img));
      this.releaseActiveController(controller, context.signal);
      this.updateResourceConfig(this.allResourcesClosed());
    }
  }

  // ── seek ─────────────────────────────────────────────────────────────────────────────────────
  /**
   * Seek to tUs: drive media-parser with a controller `.seek(tInSeconds)` so the parser jumps to the
   * best keyframe <= t, then decode forward through the first sample after t and choose the nearest
   * real presentation sample (earlier on an exact tie). Returns that frame's landed pts + digest.
   * Uses the same native decoder path as
   * decodeFrames.
   */
  async seek(
    input: MediaInput,
    tUs: number,
    context?: OperationContext,
  ): Promise<{ landedPtsUs: number; frame: FrameDigest; telemetry?: { decodedFrames?: number; firstFrameMs?: number } }> {
    const call = context ?? fallbackOperationContext('seek', this.fallbackAbort.signal, input);
    return this.lifecycle.operation('seek', call, async () => {
      this.beginOperation('seek');
      try {
        return validateAdapterResult(ENGINE_ID, 'seek', await this.seekImpl(input, tUs, call));
      } finally {
        this.updateResourceConfig(this.allResourcesClosed());
      }
    });
  }

  private async seekImpl(
    input: MediaInput,
    tUs: number,
    context: OperationContext,
  ): Promise<{ landedPtsUs: number; frame: FrameDigest; telemetry: { decodedFrames: number; firstFrameMs?: number } }> {
    const { wc } = this.mustLib();
    const srcOptions = await this.sourceOptions(input);
    const targetUs = Math.max(0, tUs);
    const selected = (await this.primaryVideoTrack(input, context)).track;
    this.config = { ...this.config, selectedTrackIds: [selected.trackId] };

    let best: { img: Promise<ImageData>; ptsUs: number } | null = null;
    const frameTasks: Promise<ImageData>[] = [];
    let decodeError: Error | null = null;
    const decoderState: { value: IsolatedVideoDecoder | null } = { value: null };
    let decoderPromise: Promise<IsolatedVideoDecoder> | null = null;
    let done = false;
    let samplesPastTarget = 0;
    let parserController: ReturnType<MediaParserModule['mediaParserController']> | null = null;
    let decodedFrames = 0;
    let firstFrameMs: number | undefined;
    const started = nowMs();
    const decoderController = wc.webcodecsController();
    this.bindActiveController(decoderController, context.signal);

    try {
      await this.parse({
        ...srcOptions,
        acknowledgeRemotionLicense: true,
        fields: { tracks: true },
        onVideoTrack: ({ track }) => {
          if (track.trackId !== selected.trackId) return null;
          parserController!.seek(targetUs / 1e6);
          const config = decoderConfigForTrack(track);
          decoderPromise = this.createTrackedDecoder(
            track.trackId,
            config,
            'seek',
            context,
            decoderController,
            (frame) => {
              decodedFrames++;
              const atMs = Math.max(0, nowMs() - started);
              if (firstFrameMs === undefined) {
                firstFrameMs = atMs;
                context.emit({ type: 'first-frame', atMs });
              }
              context.emit({ type: 'decoded-frame-count', atMs, count: decodedFrames });
              const ptsUs = Math.round(frame.timestamp);
              const keep = shouldReplaceRemotionSeekSample(ptsUs, best?.ptsUs, targetUs);
              if (keep) {
                this.activeFrames.add(frame);
                this.updateResourceConfig(false);
                const img = imageDataFromVideoFrame(frame).finally(() => {
                  frame.close();
                  this.activeFrames.delete(frame);
                  this.updateResourceConfig(this.allResourcesClosed());
                });
                void img.catch(() => undefined);
                frameTasks.push(img);
                best = {
                  img,
                  ptsUs,
                };
              } else {
                frame.close();
              }
            },
            (error) => {
              decodeError = error;
            },
          ).then((created) => {
            decoderState.value = created;
            return created;
          });

          return async (sample) => {
            if (done) return;
            const active = decoderState.value ?? (await decoderPromise!);
            await active.waitForQueueToBeLessThan(16);
            await active.decode({
              type: sample.type,
              timestamp: sample.timestamp,
              duration: sample.duration,
              data: sample.data,
            });
            if (sample.timestamp > targetUs) {
              // Encoded sample timestamps may arrive before their reordered VideoFrame output.
              // Retain a bounded coded lookahead so the nearest earlier VFR/B-frame cannot remain
              // buffered when the first encoded sample crosses the target.
              samplesPastTarget++;
              if (samplesPastTarget >= SEEK_DECODE_REORDER_LOOKAHEAD_SAMPLES) {
                done = true;
                return () => undefined;
              }
            }
          };
        },
      }, context, (controller) => {
        parserController = controller;
      });

      if (decoderPromise) decoderState.value = await decoderPromise;
      if (decoderState.value) await decoderState.value.flush();
      if (decodeError) throw decodeError;
      if (!best) throw new Error(`${ENGINE_ID} seek: no frame decoded at ${tUs}us`);

      const landed = best as { img: Promise<ImageData>; ptsUs: number };
      const img = await landed.img;
      return {
        landedPtsUs: landed.ptsUs,
        frame: await digestImageData(img, 0, landed.ptsUs),
        telemetry: {
          decodedFrames,
          ...(firstFrameMs !== undefined ? { firstFrameMs } : {}),
        },
      };
    } finally {
      if (decoderState.value) {
        decoderState.value.close();
        this.activeDecoders.delete(decoderState.value);
      }
      for (const frame of this.activeFrames) frame.close();
      this.activeFrames.clear();
      await Promise.allSettled(frameTasks);
      this.releaseActiveController(decoderController, context.signal);
      this.updateResourceConfig(this.allResourcesClosed());
    }
  }

  private async assertRequestedTracksPresent(
    input: MediaInput,
    opts: TranscodeOptions,
    videoSpec: TranscodeVideoOptions | undefined,
    context: OperationContext,
  ): Promise<{ tracks: import('@remotion/media-parser').MediaParserTrack[] }> {
    const srcOptions = await this.sourceOptions(input);
    const result = await this.parse<{ tracks: import('@remotion/media-parser').MediaParserTrack[] }>({
      ...srcOptions,
      acknowledgeRemotionLicense: true,
      fields: { tracks: true },
    }, context);
    if (videoSpec && !result.tracks.some((track) => track.type === 'video')) {
      throw createNotApplicableError(
        ENGINE_ID,
        'transcode',
        'requested video output but input has no video track',
        remotionTupleSummary(context.request),
        'REMOTION_VIDEO_TRACK_REQUIRED',
      );
    }
    if (opts.audio && !result.tracks.some((track) => track.type === 'audio')) {
      throw createNotApplicableError(
        ENGINE_ID,
        'transcode',
        'requested audio output but input has no audio track',
        remotionTupleSummary(context.request),
        'REMOTION_AUDIO_TRACK_REQUIRED',
      );
    }
    return result;
  }

  private async primaryVideoTrack(
    input: MediaInput,
    context: OperationContext,
    selector?: DecodeTrackSelector,
  ): Promise<{
    track: import('@remotion/media-parser').MediaParserVideoTrack;
    trackIndex: number;
    typeOrdinal: number;
  }> {
    const srcOptions = await this.sourceOptions(input);
    const result = await this.parse<{ tracks: import('@remotion/media-parser').MediaParserTrack[] }>({
      ...srcOptions,
      acknowledgeRemotionLicense: true,
      fields: { tracks: true },
    }, context);
    if (selector && selector.type !== 'video') {
      throw createNotApplicableError(
        ENGINE_ID,
        context.request.operation,
        'Remotion decodeFrames currently exposes video frame sinks only',
        remotionTupleSummary(context.request),
        'REMOTION_VIDEO_TRACK_REQUIRED',
      );
    }
    const videoTracks = result.tracks
      .map((track, trackIndex) => ({ track, trackIndex }))
      .filter((entry): entry is {
        track: import('@remotion/media-parser').MediaParserVideoTrack;
        trackIndex: number;
      } => entry.track.type === 'video');
    const selected = selector?.trackIndex !== undefined
      ? videoTracks.find((entry) => entry.trackIndex === selector.trackIndex)
      : selector?.typeOrdinal !== undefined
        ? videoTracks[selector.typeOrdinal]
        : selector?.trackId !== undefined
          ? videoTracks.find((entry) => String(entry.track.trackId) === selector.trackId)
          : videoTracks[0];
    if (!selected) {
      throw createNotApplicableError(
        ENGINE_ID,
        context.request.operation,
        'the operation requires a video track',
        remotionTupleSummary(context.request),
        'REMOTION_VIDEO_TRACK_REQUIRED',
      );
    }
    const typeOrdinal = selected
      ? videoTracks.findIndex((entry) => entry.trackIndex === selected.trackIndex)
      : -1;
    if (selector?.typeOrdinal !== undefined && typeOrdinal !== selector.typeOrdinal) {
      throw createNotApplicableError(
        ENGINE_ID,
        context.request.operation,
        `requested video ordinal ${selector.typeOrdinal} does not exist`,
        remotionTupleSummary(context.request),
        'REMOTION_VIDEO_TRACK_REQUIRED',
      );
    }
    if (selector?.trackId !== undefined && String(selected?.track.trackId) !== selector.trackId) {
      throw createNotApplicableError(
        ENGINE_ID,
        context.request.operation,
        `requested trackId '${selector.trackId}' does not exist`,
        remotionTupleSummary(context.request),
        'REMOTION_VIDEO_TRACK_REQUIRED',
      );
    }
    return { track: selected.track, trackIndex: selected.trackIndex, typeOrdinal };
  }

  private async createTrackedDecoder(
    trackId: number,
    config: VideoDecoderConfig,
    operation: 'decodeFrames' | 'seek',
    context: OperationContext,
    _controller: import('@remotion/webcodecs').WebCodecsController,
    onFrame: (frame: VideoFrame) => void | Promise<void>,
    onError: (error: Error) => void,
  ): Promise<IsolatedVideoDecoder> {
    const exactConfig = await this.assertExactVideoDecoderConfig(config, trackId, operation, context);
    if (typeof EncodedVideoChunk === 'undefined') {
      throw createBrowserNotSupportedError(
        ENGINE_ID,
        operation,
        'EncodedVideoChunk is unavailable in this browser realm',
        remotionTupleSummary(context.request),
        'REMOTION_ENCODED_VIDEO_CHUNK_API_UNAVAILABLE',
        { role: 'video-decoder', trackIndex: trackId, config: exactConfig },
      );
    }
    let decoder: IsolatedVideoDecoder;
    try {
      decoder = createIsolatedVideoDecoder(exactConfig, context.signal, onFrame, onError);
    } catch (error) {
      if (!isNamedError(error, 'NotSupportedError')) throw error;
      throw createBrowserNotSupportedError(
        ENGINE_ID,
        operation,
        `the browser rejected decoder config '${exactConfig.codec}' during configure`,
        remotionTupleSummary(context.request),
        'REMOTION_VIDEO_DECODER_CONFIG_UNSUPPORTED',
        { role: 'video-decoder', trackIndex: trackId, config: exactConfig },
        error,
      );
    }
    this.activeDecoders.add(decoder);
    this.updateResourceConfig(false);
    return decoder;
  }

  private async assertExactVideoDecoderConfig(
    config: VideoDecoderConfig,
    trackId: number,
    operation: 'decodeFrames' | 'seek',
    context: OperationContext,
  ): Promise<VideoDecoderConfig> {
    const base = cloneVideoDecoderConfig(config);
    const candidates: VideoDecoderConfig[] = base.hardwareAcceleration
      ? [base]
      : [
          { ...base, hardwareAcceleration: 'prefer-hardware' },
          { ...base, hardwareAcceleration: 'prefer-software' },
        ];
    let lastUnsupported: unknown;
    for (const exact of candidates) {
      try {
        const supported = await probeExactRemotionVideoDecoderConfig(exact, trackId, operation, context.request);
        this.recordExactCodecConfig('video-decoder', trackId, supported, true);
        return supported;
      } catch (error) {
        if (!isBrowserNotSupportedError(error)) throw error;
        this.recordExactCodecConfig('video-decoder', trackId, exact, false);
        if (error.reasonCode !== 'REMOTION_VIDEO_DECODER_CONFIG_UNSUPPORTED') throw error;
        lastUnsupported = error;
      }
    }
    throw lastUnsupported;
  }

  private async assertExactVideoReencodeConfigs(
    track: import('@remotion/media-parser').MediaParserVideoTrack,
    codec: RemotionVideoCodec,
    resize: import('@remotion/webcodecs').ResizeOperation | undefined,
    rotate: number | undefined,
    context: OperationContext,
  ): Promise<void> {
    const decoderBase = decoderConfigForTrack(track);
    const decoderCandidates: VideoDecoderConfig[] = [
      { ...decoderBase, hardwareAcceleration: 'prefer-hardware' },
      { ...decoderBase, hardwareAcceleration: 'prefer-software' },
    ];
    await this.requireSupportedCodecCandidate(
      'video-decoder',
      track.trackId,
      decoderCandidates,
      context,
      'REMOTION_VIDEO_DECODER_API_UNAVAILABLE',
      'REMOTION_VIDEO_DECODER_CONFIG_UNSUPPORTED',
    );

    const encoderCandidates = remotionVideoEncoderConfigCandidates(track, codec, resize, rotate);
    await this.requireSupportedCodecCandidate(
      'video-encoder',
      track.trackId,
      encoderCandidates,
      context,
      'REMOTION_VIDEO_ENCODER_API_UNAVAILABLE',
      'REMOTION_VIDEO_ENCODER_CONFIG_UNSUPPORTED',
    );
  }

  private async assertExactAudioReencodeConfigs(
    track: import('@remotion/media-parser').MediaParserAudioTrack,
    codec: RemotionAudioCodec,
    bitrate: number,
    sampleRate: number | null,
    context: OperationContext,
  ): Promise<void> {
    const decoderConfig: AudioDecoderConfig = {
      codec: track.codec,
      sampleRate: track.sampleRate,
      numberOfChannels: track.numberOfChannels,
      ...(track.description ? { description: track.description.slice() } : {}),
    };
    if (track.codec === 'pcm-s16' || track.codec === 'pcm-s24') {
      this.recordExactCodecConfig('audio-decoder', track.trackId, decoderConfig, true);
    } else {
      await this.requireSupportedCodecCandidate(
        'audio-decoder',
        track.trackId,
        [decoderConfig],
        context,
        'REMOTION_AUDIO_DECODER_API_UNAVAILABLE',
        'REMOTION_AUDIO_DECODER_CONFIG_UNSUPPORTED',
      );
    }

    const encoderCandidates = remotionAudioEncoderConfigCandidates(
      codec,
      track.numberOfChannels,
      sampleRate ?? track.sampleRate,
      bitrate,
    );
    if (codec === 'wav') {
      this.recordExactCodecConfig('audio-encoder', track.trackId, encoderCandidates[0]!, true);
      return;
    }
    await this.requireSupportedCodecCandidate(
      'audio-encoder',
      track.trackId,
      encoderCandidates,
      context,
      'REMOTION_AUDIO_ENCODER_API_UNAVAILABLE',
      'REMOTION_AUDIO_ENCODER_CONFIG_UNSUPPORTED',
    );
  }

  private async requireSupportedCodecCandidate(
    role: ConcreteWebCodecsConfig['role'],
    trackId: number,
    candidates: Array<VideoDecoderConfig | VideoEncoderConfig | AudioDecoderConfig | AudioEncoderConfig>,
    context: OperationContext,
    unavailableReasonCode: string,
    unsupportedReasonCode: string,
  ): Promise<void> {
    const constructor = webCodecsConstructorForRole(role);
    const first = candidates[0]!;
    if (!constructor) {
      this.recordExactCodecConfig(role, trackId, first, false);
      throw createBrowserNotSupportedError(
        ENGINE_ID,
        'transcode',
        `${role} is unavailable in this browser realm`,
        remotionTupleSummary(context.request),
        unavailableReasonCode,
        concreteConfig(role, trackId, first),
      );
    }

    let lastCause: unknown;
    for (const candidate of candidates) {
      let supported = false;
      try {
        supported = (await constructor(candidate as never)).supported === true;
      } catch (error) {
        if (error instanceof TypeError) throw error;
        if (!isNamedError(error, 'NotSupportedError')) throw error;
        lastCause = error;
      }
      this.recordExactCodecConfig(role, trackId, candidate, supported);
      if (supported) return;
    }

    const last = candidates[candidates.length - 1]!;
    throw createBrowserNotSupportedError(
      ENGINE_ID,
      'transcode',
      `the browser rejected every exact ${role} configuration for track ${trackId}`,
      remotionTupleSummary(context.request),
      unsupportedReasonCode,
      concreteConfig(role, trackId, last),
      lastCause,
    );
  }

  private bindActiveController(controller: AbortableController, signal: AbortSignal): void {
    const abort = (): void => controller.abort(signal.reason);
    this.activeControllers.add(controller);
    this.controllerAbortBindings.set(controller, { signal, abort });
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    this.updateResourceConfig(false);
  }

  private releaseActiveController(controller: AbortableController, signal: AbortSignal): void {
    const binding = this.controllerAbortBindings.get(controller);
    (binding?.signal ?? signal).removeEventListener('abort', binding?.abort ?? (() => undefined));
    controller.abort('operation settled');
    this.controllerAbortBindings.delete(controller);
    this.activeControllers.delete(controller);
  }

  private beginOperation(operation: RemotionWebcodecsConfig['operation']): void {
    this.config = {
      ...this.config,
      operation,
      readerMode: 'not-selected',
      writerMode: 'not-selected',
      sourceReader: 'not-selected',
      parsePath: 'not-selected',
      codecConfigs: [],
      selectedTrackIds: [],
      trackDecisions: [],
      queueHighWaterMark: 0,
      controllerFinalState: null,
      outputBytes: 0,
      cleanupComplete: false,
    };
    this.updateResourceConfig(false);
  }

  private recordTrackDecision(
    trackId: number,
    type: string,
    decision: string,
    reasonCode?: string,
  ): void {
    this.config = {
      ...this.config,
      selectedTrackIds: this.config.selectedTrackIds.includes(trackId)
        ? this.config.selectedTrackIds
        : [...this.config.selectedTrackIds, trackId],
      trackDecisions: [
        ...this.config.trackDecisions,
        { trackId, type, decision, ...(reasonCode ? { reasonCode } : {}) },
      ],
    };
  }

  private recordFrameworkCodecProbe(
    role: string,
    trackId: number,
    codec: string,
    supported: boolean,
    fields: Record<string, number | null | undefined>,
  ): void {
    const normalizedFields: Record<string, number | null> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) normalizedFields[key] = value;
    }
    this.config = {
      ...this.config,
      codecConfigs: [
        ...this.config.codecConfigs,
        { role, trackId, codec, supported, ...normalizedFields },
      ],
    };
  }

  private recordExactCodecConfig(
    role: string,
    trackId: number,
    config: VideoDecoderConfig | VideoEncoderConfig | AudioDecoderConfig | AudioEncoderConfig,
    supported: boolean,
  ): void {
    this.config = {
      ...this.config,
      codecConfigs: [
        ...this.config.codecConfigs,
        { role, trackId, supported, config: jsonWebCodecsConfig(config) },
      ],
    };
  }

  private allResourcesClosed(): boolean {
    return this.activeControllers.size === 0
      && this.activeDecoders.size === 0
      && this.activeFrames.size === 0
      && this.activeWriterBuffers === 0;
  }

  private updateResourceConfig(cleanupComplete: boolean): void {
    this.config = {
      ...this.config,
      activeControllers: this.activeControllers.size,
      activeDecoders: this.activeDecoders.size,
      activeFrames: this.activeFrames.size,
      activeWriterBuffers: this.activeWriterBuffers,
      cleanupComplete,
    };
  }

  // ── trim (NOT SUPPORTED) ─────────────────────────────────────────────────────────────────────
  /**
   * @remotion/webcodecs has NO trim/cut API (docs list it under "Soon"). The interface requires a
   * `trim` method, so we provide one that throws; `trim` is left UNDECLARED in capabilities() so the
   * runner negotiates NA(engine) and never calls this. Throwing keeps a mis-wired runner LOUD rather
   * than fabricating output.
   */
  async trim(
    _input: MediaInput,
    _range: { startUs: number; endUs: number },
    _opts: { container: string; frameAccurate: boolean },
    context?: OperationContext,
  ): Promise<MediaBytes> {
    const request = context?.request ?? fallbackOperationContext('trim', this.fallbackAbort.signal).request;
    throw createNotApplicableError(
      ENGINE_ID,
      'trim',
      'Remotion WebCodecs has no trim API',
      remotionTupleSummary(request),
      'REMOTION_TRIM_UNSUPPORTED',
    );
  }
}

// ── module-level helpers ─────────────────────────────────────────────────────────────────────────

function fallbackLifecycleContext(
  signal: AbortSignal,
  phase: LifecycleContext['phase'] = 'functional',
): LifecycleContext {
  return { signal, emit: () => undefined, phase };
}

function fallbackOperationContext(
  operation: ConcreteOperationRequest['operation'],
  signal: AbortSignal,
  input?: MediaInput,
  options: Record<string, unknown> = {},
): OperationContext {
  const outputContainer = typeof options.container === 'string' ? options.container : undefined;
  return {
    ...fallbackLifecycleContext(signal),
    checkedSupport: SUPPORTED_CHECKED_SUPPORT_SNAPSHOT,
    request: {
      protocol: CONCRETE_OPERATION_PROTOCOL,
      scenarioId: 'remotion-webcodecs/direct',
      operation,
      inputs: input
        ? [{
            id: input.id,
            mime: input.mime,
            container: containerFromInput(input),
            ...(input.sizeBytes !== undefined ? { sizeBytes: input.sizeBytes } : {}),
            mutated: input.mutated === true,
            sourceEvidence: 'UNRESOLVED',
            tracks: [],
          }]
        : [],
      ...(outputContainer ? { output: { container: outputContainer } } : {}),
      options,
    },
  };
}

function containerFromInput(input: MediaInput): string {
  const mime = input.mime.toLowerCase();
  if (mime.includes('quicktime')) return 'mov';
  if (mime.includes('matroska')) return 'mkv';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mp2t')) return 'ts';
  if (mime.includes('mpegurl')) return 'hls';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('flac')) return 'flac';
  if (mime.includes('aac')) return 'adts';
  if (mime.includes('mpeg')) return 'mp3';
  return 'mp4';
}

function decisionToNotApplicable(
  request: ConcreteOperationRequest,
  decision: Extract<SupportDecision, { supported: false }>,
): ReturnType<typeof createNotApplicableError> {
  return createNotApplicableError(
    ENGINE_ID,
    request.operation,
    decision.reason,
    remotionTupleSummary(request),
    decision.reasonCode,
  );
}

function canonicalAudioForRemotion(codec: RemotionAudioCodec): string {
  return codec === 'wav' ? 'pcm-s16' : codec;
}

function decoderConfigForTrack(
  track: import('@remotion/media-parser').MediaParserVideoTrack,
): VideoDecoderConfig {
  return {
    codec: track.codec,
    codedWidth: track.codedWidth,
    codedHeight: track.codedHeight,
    ...(Number.isFinite(track.displayAspectWidth) && track.displayAspectWidth > 0
      ? { displayAspectWidth: track.displayAspectWidth }
      : {}),
    ...(Number.isFinite(track.displayAspectHeight) && track.displayAspectHeight > 0
      ? { displayAspectHeight: track.displayAspectHeight }
      : {}),
    ...(track.description ? { description: track.description.slice() } : {}),
    colorSpace: { ...track.colorSpace },
  };
}

function cloneVideoDecoderConfig(config: VideoDecoderConfig): VideoDecoderConfig {
  const description = config.description;
  let copiedDescription: Uint8Array | undefined;
  if (description !== undefined) {
    const view = ArrayBuffer.isView(description)
      ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength)
      : new Uint8Array(description as ArrayBuffer);
    copiedDescription = view.slice();
  }
  return {
    ...config,
    ...(copiedDescription ? { description: copiedDescription } : {}),
    ...(config.colorSpace ? { colorSpace: { ...config.colorSpace } } : {}),
  };
}

/**
 * Probe the exact decoder configuration immediately before use. The returned value is the owned
 * clone that the adapter passes unchanged to the isolated native decoder; a browser-normalized
 * `support.config` is deliberately ignored because it is not the requested concrete configuration.
 */
export async function probeExactRemotionVideoDecoderConfig(
  config: VideoDecoderConfig,
  trackId: number,
  operation: 'decodeFrames' | 'seek',
  request: ConcreteOperationRequest,
): Promise<VideoDecoderConfig> {
  const exact = cloneVideoDecoderConfig(config);
  const browserConfig: ConcreteWebCodecsConfig = {
    role: 'video-decoder',
    trackIndex: trackId,
    config: exact,
  };
  if (typeof VideoDecoder === 'undefined' || typeof VideoDecoder.isConfigSupported !== 'function') {
    throw createBrowserNotSupportedError(
      ENGINE_ID,
      operation,
      'VideoDecoder is unavailable in this browser realm',
      remotionTupleSummary(request),
      'REMOTION_VIDEO_DECODER_API_UNAVAILABLE',
      browserConfig,
    );
  }

  let support: VideoDecoderSupport;
  try {
    support = await VideoDecoder.isConfigSupported(exact);
  } catch (error) {
    if (error instanceof TypeError) throw error;
    if (isNamedError(error, 'NotSupportedError')) {
      throw createBrowserNotSupportedError(
        ENGINE_ID,
        operation,
        `the browser rejected decoder config '${exact.codec}'`,
        remotionTupleSummary(request),
        'REMOTION_VIDEO_DECODER_CONFIG_UNSUPPORTED',
        browserConfig,
        error,
      );
    }
    throw error;
  }
  if (!support.supported) {
    throw createBrowserNotSupportedError(
      ENGINE_ID,
      operation,
      `the browser does not support decoder config '${exact.codec}'`,
      remotionTupleSummary(request),
      'REMOTION_VIDEO_DECODER_CONFIG_UNSUPPORTED',
      browserConfig,
    );
  }
  return exact;
}

type WebCodecsSupportProbe = (
  config: VideoDecoderConfig | VideoEncoderConfig | AudioDecoderConfig | AudioEncoderConfig,
) => Promise<{ supported?: boolean }>;

function webCodecsConstructorForRole(role: ConcreteWebCodecsConfig['role']): WebCodecsSupportProbe | null {
  if (role === 'video-decoder') {
    if (
      typeof VideoDecoder === 'undefined'
      || typeof VideoDecoder.isConfigSupported !== 'function'
      || typeof EncodedVideoChunk === 'undefined'
    ) return null;
    return (config) => VideoDecoder.isConfigSupported(config as VideoDecoderConfig);
  }
  if (role === 'video-encoder') {
    if (typeof VideoEncoder === 'undefined' || typeof VideoEncoder.isConfigSupported !== 'function') return null;
    return (config) => VideoEncoder.isConfigSupported(config as VideoEncoderConfig);
  }
  if (role === 'audio-decoder') {
    if (
      typeof AudioDecoder === 'undefined'
      || typeof AudioDecoder.isConfigSupported !== 'function'
      || typeof EncodedAudioChunk === 'undefined'
    ) return null;
    return (config) => AudioDecoder.isConfigSupported(config as AudioDecoderConfig);
  }
  if (typeof AudioEncoder === 'undefined' || typeof AudioEncoder.isConfigSupported !== 'function') return null;
  return (config) => AudioEncoder.isConfigSupported(config as AudioEncoderConfig);
}

function concreteConfig(
  role: ConcreteWebCodecsConfig['role'],
  trackIndex: number,
  config: VideoDecoderConfig | VideoEncoderConfig | AudioDecoderConfig | AudioEncoderConfig,
): ConcreteWebCodecsConfig {
  switch (role) {
    case 'video-decoder':
      return { role, trackIndex, config: config as VideoDecoderConfig };
    case 'video-encoder':
      return { role, trackIndex, config: config as VideoEncoderConfig };
    case 'audio-decoder':
      return { role, trackIndex, config: config as AudioDecoderConfig };
    case 'audio-encoder':
      return { role, trackIndex, config: config as AudioEncoderConfig };
  }
}

/** Nearest real presentation sample, with the suite's deterministic earlier-PTS tie break. */
export function shouldReplaceRemotionSeekSample(
  candidatePtsUs: number,
  currentPtsUs: number | undefined,
  targetUs: number,
): boolean {
  if (!Number.isFinite(candidatePtsUs)) return false;
  if (currentPtsUs === undefined || !Number.isFinite(currentPtsUs)) return true;
  const candidateDelta = Math.abs(candidatePtsUs - targetUs);
  const currentDelta = Math.abs(currentPtsUs - targetUs);
  return candidateDelta < currentDelta ||
    (candidateDelta === currentDelta && candidatePtsUs < currentPtsUs);
}

export function remotionVideoEncoderConfigCandidates(
  track: import('@remotion/media-parser').MediaParserVideoTrack,
  codec: RemotionVideoCodec,
  resize: import('@remotion/webcodecs').ResizeOperation | undefined,
  rotate: number | undefined,
): VideoEncoderConfig[] {
  const dimensions = remotionOutputDimensions(
    track.codedWidth,
    track.codedHeight,
    resize,
    rotate ?? 0,
    codec === 'h264',
  );
  const safari = typeof navigator !== 'undefined'
    && /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const base: VideoEncoderConfig = {
    codec: remotionEncoderCodecString(codec, dimensions.width, dimensions.height, track.fps),
    width: dimensions.width,
    height: dimensions.height,
    ...(safari ? { bitrate: 3_000_000 } : {}),
    ...(codec === 'vp9' && !safari ? { bitrateMode: 'quantizer' as const } : {}),
    ...(track.fps == null ? {} : { framerate: track.fps }),
  };
  return [
    { ...base, hardwareAcceleration: 'prefer-hardware' },
    { ...base, hardwareAcceleration: 'prefer-software' },
  ];
}

function remotionAudioEncoderConfigCandidates(
  codec: RemotionAudioCodec,
  numberOfChannels: number,
  sampleRate: number,
  bitrate: number,
): AudioEncoderConfig[] {
  const config: AudioEncoderConfig = {
    codec: codec === 'aac'
      ? 'mp4a.40.02'
      : codec === 'opus'
        ? 'opus'
        : 'wav-should-not-to-into-audio-encoder',
    numberOfChannels,
    sampleRate,
    bitrate,
  };
  if (codec === 'wav' || sampleRate === 48_000 || sampleRate === 44_100) return [config];
  return [
    config,
    { ...config, sampleRate: sampleRate === 22_050 ? 44_100 : 48_000 },
  ];
}

export function remotionOutputDimensions(
  sourceWidth: number,
  sourceHeight: number,
  resize: import('@remotion/webcodecs').ResizeOperation | undefined,
  rotation: number,
  even: boolean,
): { width: number; height: number } {
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  let width = normalizedRotation === 90 || normalizedRotation === 270 ? sourceHeight : sourceWidth;
  let height = normalizedRotation === 90 || normalizedRotation === 270 ? sourceWidth : sourceHeight;
  if (resize?.mode === 'width') {
    height = Math.round((resize.width / width) * height);
    width = resize.width;
  } else if (resize?.mode === 'height') {
    width = Math.round((resize.height / height) * width);
    height = resize.height;
  } else if (resize?.mode === 'max-height-width') {
    const scale = Math.min(
      Math.min(width, resize.maxWidth) / width,
      Math.min(height, resize.maxHeight) / height,
    );
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  } else if (resize?.mode === 'max-height') {
    const target = Math.min(height, resize.maxHeight);
    width = Math.round((target / height) * width);
    height = target;
  } else if (resize?.mode === 'max-width') {
    const target = Math.min(width, resize.maxWidth);
    height = Math.round((target / width) * height);
    width = target;
  } else if (resize?.mode === 'scale') {
    width = Math.round(width * resize.scale);
    height = Math.round(height * resize.scale);
  }
  if (even) {
    width = Math.floor(width / 2) * 2;
    height = Math.floor(height / 2) * 2;
  }
  return { width, height };
}

function remotionEncoderCodecString(
  codec: RemotionVideoCodec,
  width: number,
  height: number,
  fps: number | null,
): string {
  if (codec === 'vp8') return 'vp8';
  if (codec === 'vp9') return 'vp09.00.10.08';
  if (codec === 'h264') {
    const profiles = [
      { hex: '1F', width: 1280, height: 720, fps: 30 },
      { hex: '20', width: 1280, height: 1024, fps: 42.2 },
      { hex: '28', width: 2048, height: 1024, fps: 30 },
      { hex: '29', width: 2048, height: 1024, fps: 30 },
      { hex: '2A', width: 2048, height: 1080, fps: 60 },
      { hex: '32', width: 3672, height: 1536, fps: 26.7 },
      { hex: '33', width: 4096, height: 2304, fps: 26.7 },
      { hex: '34', width: 4096, height: 2304, fps: 56.3 },
      { hex: '3C', width: 8192, height: 4320, fps: 30.2 },
      { hex: '3D', width: 8192, height: 4320, fps: 60.4 },
      { hex: '3E', width: 8192, height: 4320, fps: 120.8 },
    ];
    const profile = profiles.find((candidate) =>
      width <= candidate.width && height <= candidate.height && (fps ?? 60) <= candidate.fps,
    );
    if (!profile) throw new Error(`No suitable AVC1 profile found for ${width}x${height}@${fps}fps`);
    return `avc1.6400${profile.hex}`;
  }

  const levels = [
    { level: 3.1, limits: [[720, 480, 84.3], [720, 576, 75], [960, 540, 60], [1280, 720, 33.7]] },
    { level: 4, limits: [[1280, 720, 68], [1920, 1080, 32], [2048, 1080, 30]] },
    { level: 4.1, limits: [[1280, 720, 136], [1920, 1080, 64], [2048, 1080, 60]] },
    { level: 5, limits: [[1920, 1080, 128], [2048, 1080, 120], [3840, 2160, 32], [4096, 2160, 30]] },
    { level: 5.1, limits: [[1920, 1080, 256], [2048, 1080, 240], [3840, 2160, 64], [4096, 2160, 60]] },
    { level: 5.2, limits: [[2048, 1080, 300], [3840, 2160, 128], [4096, 2160, 120]] },
    { level: 6, limits: [[3840, 2160, 128], [4096, 2160, 120], [7680, 4320, 32], [8192, 4320, 30]] },
    { level: 6.1, limits: [[3840, 2160, 256], [4096, 2160, 240], [7680, 4320, 64], [8192, 4320, 60]] },
    { level: 6.2, limits: [[3840, 2160, 512], [4096, 2160, 480], [7680, 4320, 128], [8192, 4320, 120]] },
  ] as const;
  const level = levels.find((candidate) => candidate.limits.some((limit) =>
    width <= limit[0] && height <= limit[1] && (fps ?? 60) <= limit[2],
  ));
  if (!level) throw new Error(`No suitable HEVC profile found for ${width}x${height}@${fps}fps`);
  return `hvc1.1.0.L${Math.round(level.level * 30)}.b0`;
}

/**
 * Native decoder wrapper used instead of Remotion's decoder helper because 4.0.479 intentionally
 * catches and discards the native `VideoDecoder.flush()` rejection. Correctness needs that rejection
 * (and its original cause) to reach the runner, while still retaining Remotion's parser/controller
 * for sample production and cancellation.
 */
function createIsolatedVideoDecoder(
  config: VideoDecoderConfig,
  signal: AbortSignal,
  onFrame: (frame: VideoFrame) => void | Promise<void>,
  onError: (error: Error) => void,
): IsolatedVideoDecoder {
  let codecError: Error | null = null;
  let closed = false;
  const pendingOutputs = new Set<Promise<void>>();
  const reportError = (error: unknown): void => {
    const normalized = error instanceof Error ? error : new Error(String(error));
    codecError ??= normalized;
    onError(normalized);
  };
  const native = new VideoDecoder({
    output: (frame) => {
      let output: Promise<void>;
      try {
        output = Promise.resolve(onFrame(frame));
      } catch (error) {
        frame.close();
        reportError(error);
        return;
      }
      const tracked = output
        .catch((error) => {
          frame.close();
          reportError(error);
        })
        .finally(() => pendingOutputs.delete(tracked));
      pendingOutputs.add(tracked);
    },
    error: reportError,
  });

  const close = (): void => {
    if (closed) return;
    closed = true;
    signal.removeEventListener('abort', abort);
    if (native.state !== 'closed') native.close();
  };
  const abort = (): void => close();
  if (signal.aborted) abort();
  else signal.addEventListener('abort', abort, { once: true });

  try {
    if (!closed) native.configure(config);
  } catch (error) {
    close();
    throw error;
  }

  const throwIfUnavailable = (): void => {
    if (signal.aborted) throw signal.reason ?? new DOMException('Operation aborted', 'AbortError');
    if (codecError) throw codecError;
    if (closed || native.state === 'closed') throw new Error('video decoder is closed');
  };

  return {
    decode: async (sample) => {
      throwIfUnavailable();
      native.decode(new EncodedVideoChunk(sample));
    },
    flush: async () => {
      throwIfUnavailable();
      await native.flush();
      await Promise.all([...pendingOutputs]);
      if (codecError) throw codecError;
    },
    waitForQueueToBeLessThan: async (items) => {
      throwIfUnavailable();
      if (native.decodeQueueSize < items) return;
      await new Promise<void>((resolve, reject) => {
        const cleanup = (): void => {
          native.removeEventListener('dequeue', check);
          signal.removeEventListener('abort', onAbort);
        };
        const check = (): void => {
          if (native.decodeQueueSize >= items) return;
          cleanup();
          resolve();
        };
        const onAbort = (): void => {
          cleanup();
          reject(signal.reason ?? new DOMException('Operation aborted', 'AbortError'));
        };
        native.addEventListener('dequeue', check);
        signal.addEventListener('abort', onAbort, { once: true });
        check();
      });
      throwIfUnavailable();
    },
    close,
  };
}

function jsonWebCodecsConfig(
  config: VideoDecoderConfig | VideoEncoderConfig | AudioDecoderConfig | AudioEncoderConfig,
): Record<string, SerializableValue> {
  const out: Record<string, SerializableValue> = {};
  for (const [key, value] of Object.entries(config)) {
    if (
      typeof value === 'string'
      || typeof value === 'boolean'
      || (typeof value === 'number' && Number.isFinite(value))
      || value === null
    ) {
      out[key] = value;
      continue;
    }
    if (key === 'description' && (ArrayBuffer.isView(value) || value instanceof ArrayBuffer)) {
      const view = ArrayBuffer.isView(value)
        ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
        : new Uint8Array(value);
      out.descriptionHex = bytesToHex(view);
      continue;
    }
    if (value && typeof value === 'object') {
      const nested: Record<string, SerializableValue> = {};
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        if (
          typeof nestedValue === 'string'
          || typeof nestedValue === 'boolean'
          || (typeof nestedValue === 'number' && Number.isFinite(nestedValue))
          || nestedValue === null
        ) {
          nested[nestedKey] = nestedValue;
        }
      }
      if (Object.keys(nested).length) out[key] = nested;
    }
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

function isNamedError(error: unknown, name: string): boolean {
  return typeof error === 'object'
    && error !== null
    && 'name' in error
    && (error as { name?: unknown }).name === name;
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function monotonicElapsed(started: number, previous: number): number {
  return Math.max(previous, Math.max(0, nowMs() - started));
}

function normalizeFinalState(
  state: import('@remotion/webcodecs').ConvertMediaProgress,
): Record<string, number | null> {
  return {
    decodedVideoFrames: state.decodedVideoFrames,
    decodedAudioFrames: state.decodedAudioFrames,
    encodedVideoFrames: state.encodedVideoFrames,
    encodedAudioFrames: state.encodedAudioFrames,
    bytesWritten: state.bytesWritten,
    millisecondsWritten: state.millisecondsWritten,
    expectedOutputDurationInMs: state.expectedOutputDurationInMs,
    overallProgress: state.overallProgress,
  };
}

interface TaggedPacket {
  trackId: number;
  packet: Omit<PacketInfo, 'trackIndex'>;
}

/** Preserve the media-parser sample exactly; semantic representation comparison belongs to oracles. */
export function remotionWebcodecsSampleEvidence(
  sample: import('@remotion/media-parser').MediaParserVideoSample
    | import('@remotion/media-parser').MediaParserAudioSample,
  track: import('@remotion/media-parser').MediaParserVideoTrack
    | import('@remotion/media-parser').MediaParserAudioTrack,
): Omit<PacketInfo, 'trackIndex'> {
  return {
    size: sample.data.byteLength,
    ptsUs: sample.timestamp,
    ...(typeof sample.decodingTimestamp === 'number' && Number.isFinite(sample.decodingTimestamp)
      ? { dtsUs: sample.decodingTimestamp }
      : {}),
    ...(typeof sample.duration === 'number' && Number.isFinite(sample.duration)
      ? { durationUs: sample.duration }
      : {}),
    keyframe: sample.type === 'key',
    trackType: track.type,
    codec: track.type === 'video'
      ? parserToCanonicalVideo(track.codec)
      : parserToCanonicalAudio(track.codec),
    payload: sample.data.slice(),
    framing: packetFraming(track),
    ...(track.type === 'video' && nalLengthSize(track) !== undefined
      ? { nalLengthSize: nalLengthSize(track) }
      : {}),
    ...(track.description ? { decoderConfig: track.description.slice() } : {}),
  };
}

function packetFraming(
  track: import('@remotion/media-parser').MediaParserVideoTrack
    | import('@remotion/media-parser').MediaParserAudioTrack,
): NonNullable<PacketInfo['framing']> {
  if (track.type === 'video') {
    if (track.codecEnum === 'h264') return track.description ? 'avc' : 'annexb';
    if (track.codecEnum === 'h265') return track.description ? 'hevc' : 'annexb';
    if (track.codecEnum === 'av1') return 'obu';
    if (track.codecEnum === 'vp8' || track.codecEnum === 'vp9') return 'raw';
    return 'codec-private';
  }
  if (track.codecEnum === 'aac') return track.description ? 'raw' : 'adts';
  if (track.codecEnum === 'opus' || track.codecEnum === 'vorbis') return 'codec-private';
  return 'raw';
}

function nalLengthSize(track: import('@remotion/media-parser').MediaParserVideoTrack): number | undefined {
  const description = track.description;
  if (!description) return undefined;
  if (track.codecEnum === 'h264' && description.byteLength > 4) return (description[4]! & 0x03) + 1;
  if (track.codecEnum === 'h265' && description.byteLength > 21) return (description[21]! & 0x03) + 1;
  return undefined;
}

function trackRepresentation(
  track: import('@remotion/media-parser').MediaParserTrack,
  trackIndex: number,
): DemuxTrackRepresentation {
  if (track.type === 'video') {
    const coded = track.codecEnum === 'h264' || track.codecEnum === 'h265';
    return {
      trackIndex,
      packetOrdering: 'decode',
      timebase: { numerator: 1, denominator: 1_000_000 },
      framing: packetFraming(track),
      accessUnitGrouping: 'one-access-unit-per-chunk',
      parameterSetLocation: coded ? (track.description ? 'description' : 'in-band') : 'not-applicable',
      nativeCodecTag: track.codec,
      ...(track.description ? { description: track.description.slice() } : {}),
      ...(track.codecEnum === 'h264' && track.description
        ? { descriptionRecord: 'avc-decoder-configuration-record' as const }
        : {}),
      ...(track.codecEnum === 'h265' && track.description
        ? { descriptionRecord: 'hevc-decoder-configuration-record' as const }
        : {}),
    };
  }
  if (track.type === 'audio') {
    return {
      trackIndex,
      packetOrdering: 'decode',
      timebase: { numerator: 1, denominator: 1_000_000 },
      framing: packetFraming(track),
      accessUnitGrouping: 'one-frame-per-chunk',
      parameterSetLocation: track.codecEnum === 'aac' && track.description ? 'description' : 'not-applicable',
      nativeCodecTag: track.codec,
      ...(track.description ? { description: track.description.slice() } : {}),
      ...(track.codecEnum === 'aac' && track.description
        ? { descriptionRecord: 'audio-specific-config' as const }
        : track.description
          ? { descriptionRecord: 'codec-private' as const }
          : {}),
    };
  }
  return {
    trackIndex,
    packetOrdering: 'decode',
    timebase: { numerator: 1, denominator: 1_000_000 },
    framing: 'codec-private',
    accessUnitGrouping: 'one-packet-per-chunk',
    parameterSetLocation: 'not-applicable',
    nativeCodecTag: 'unknown',
  };
}

/**
 * Normalize a media-parser parse result into the suite's NormalizedMetadata. media-parser tracks use
 * a fixed 1_000_000 timescale; widths/heights and codec are read off the typed track shapes.
 *
 * When `indexByTrackId` is supplied (demux path) the track list is ordered so tracks[i] is the track
 * whose assigned trackIndex is i — i.e. it matches the packet trackIndex assignment exactly. Without
 * it (probe path) tracks keep media-parser's natural order.
 */
function normalizeMetadata(
  container: string,
  durationInSeconds: number | null,
  tracks: import('@remotion/media-parser').MediaParserTrack[],
  metadata: import('@remotion/media-parser').MediaParserMetadataEntry[] | undefined,
  indexByTrackId?: Map<number, number>,
): NormalizedMetadata {
  const ordered = indexByTrackId
    ? [...tracks].sort(
        (a, b) =>
          (indexByTrackId.get(a.trackId) ?? Number.MAX_SAFE_INTEGER) -
          (indexByTrackId.get(b.trackId) ?? Number.MAX_SAFE_INTEGER),
      )
    : tracks;
  const normalized: NormalizedTrack[] = ordered.map((t) => normalizeTrack(t));

  const meta: NormalizedMetadata = {
    container,
    durationSec: typeof durationInSeconds === 'number' && Number.isFinite(durationInSeconds)
      ? durationInSeconds
      : null,
    tracks: normalized,
  };

  const tags = flattenMetadata(metadata);
  if (tags && Object.keys(tags).length) meta.tags = tags;

  return meta;
}

async function canonicalContainerForInput(
  input: MediaInput,
  parsedContainer: import('@remotion/media-parser').MediaParserContainer,
): Promise<string> {
  const canonical = parserContainerToCanonical(parsedContainer);
  if (canonical === 'webm') {
    const docType = ebmlDocTypeFromPrefix(await readInputPrefix(input, 256));
    if (docType === 'matroska') return 'mkv';
    if (docType === 'webm') return 'webm';
    return canonical;
  }
  if (canonical !== 'mp4') return canonical;

  const brands = isoBmffBrandsFromPrefix(await readInputPrefix(input, 64));
  return brands.some(isQuickTimeBrand) ? 'mov' : canonical;
}

async function readInputPrefix(input: MediaInput, length: number): Promise<Uint8Array | null> {
  if (input.mutated) {
    const bytes = new Uint8Array(await input.arrayBuffer());
    return bytes.slice(0, length);
  }

  try {
    const res = await fetch(input.url, {
      cache: 'no-store',
      headers: { Range: `bytes=0-${length - 1}` },
    });
    if (!res.ok) return null;
    if (res.status === 206) {
      return new Uint8Array(await res.arrayBuffer()).slice(0, length);
    }

    const reader = res.body?.getReader();
    if (!reader) return new Uint8Array(await res.arrayBuffer()).slice(0, length);

    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (total < length) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        total += value.byteLength;
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    return concatPrefix(chunks, Math.min(total, length));
  } catch {
    return null;
  }
}

function concatPrefix(chunks: Uint8Array[], length: number): Uint8Array {
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    const take = Math.min(chunk.byteLength, length - offset);
    out.set(chunk.subarray(0, take), offset);
    offset += take;
    if (offset >= length) break;
  }
  return out;
}

function isoBmffBrandsFromPrefix(prefix: Uint8Array | null): string[] {
  if (!prefix || prefix.byteLength < 16 || ascii(prefix, 4, 8) !== 'ftyp') return [];
  const boxSize = readUint32Be(prefix, 0);
  const end = Math.min(boxSize > 0 ? boxSize : prefix.byteLength, prefix.byteLength);
  const brands = [ascii(prefix, 8, 12)];
  for (let i = 16; i + 4 <= end; i += 4) brands.push(ascii(prefix, i, i + 4));
  return brands;
}

function readUint32Be(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) * 0x1000000) +
    ((bytes[offset + 1] ?? 0) << 16) +
    ((bytes[offset + 2] ?? 0) << 8) +
    (bytes[offset + 3] ?? 0)
  );
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let out = '';
  for (let i = start; i < end; i++) out += String.fromCharCode(bytes[i] ?? 0);
  return out;
}

function isQuickTimeBrand(brand: string): boolean {
  return brand === 'qt  ' || brand.trim() === 'qt';
}

function ebmlDocTypeFromPrefix(prefix: Uint8Array | null): string | null {
  if (!prefix || prefix.byteLength < 8) return null;
  for (let i = 0; i + 3 < prefix.byteLength; i++) {
    if (prefix[i] !== 0x42 || prefix[i + 1] !== 0x82) continue; // EBML DocType
    const size = readEbmlVint(prefix, i + 2);
    if (!size || size.value <= 0 || size.value > 32) continue;
    const start = i + 2 + size.length;
    const end = start + size.value;
    if (end > prefix.byteLength) continue;
    const docType = ascii(prefix, start, end).toLowerCase();
    if (docType === 'matroska' || docType === 'webm') return docType;
  }
  return null;
}

function readEbmlVint(bytes: Uint8Array, offset: number): { value: number; length: number } | null {
  const first = bytes[offset];
  if (first == null || first === 0) return null;

  let marker = 0x80;
  let length = 1;
  while (length <= 8 && (first & marker) === 0) {
    marker >>= 1;
    length++;
  }
  if (length > 8 || offset + length > bytes.byteLength) return null;

  let value = first & (marker - 1);
  for (let i = 1; i < length; i++) value = value * 256 + (bytes[offset + i] ?? 0);
  return { value, length };
}

async function webmHeaderMetadata(input: MediaInput): Promise<NormalizedMetadata | null> {
  const prefix = await readInputPrefix(input, WEBM_HEADER_RANGE_BYTES);
  if (!prefix) return null;

  const docType = ebmlDocTypeFromPrefix(prefix);
  if (docType !== 'matroska' && docType !== 'webm') return null;
  const container: 'mkv' | 'webm' = docType === 'matroska' ? 'mkv' : 'webm';
  return webmHeaderMetadataFromPrefix(prefix, container);
}

function shouldUseHeaderOnlyWebmProbe(
  input: MediaInput,
  metadata: NormalizedMetadata | null,
): metadata is NormalizedMetadata {
  if (input.mutated || metadata == null) return false;
  return metadata.durationSec != null && metadata.durationSec >= 600;
}

function singleVideoFpsFromMetadata(metadata: NormalizedMetadata | null): number | null {
  if (!metadata) return null;
  const videoTracks = metadata.tracks.filter((track) => track.type === 'video');
  if (videoTracks.length !== 1) return null;
  return videoTracks[0]?.fps ?? null;
}

interface EbmlElement {
  id: number;
  bodyStart: number;
  bodyEnd: number;
  next: number;
}

const EBML_ID = {
  Segment: 0x18538067,
  Info: 0x1549a966,
  TimestampScale: 0x2ad7b1,
  Duration: 0x4489,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackNumber: 0xd7,
  TrackType: 0x83,
  CodecID: 0x86,
  DefaultDuration: 0x23e383,
  Video: 0xe0,
  PixelWidth: 0xb0,
  PixelHeight: 0xba,
  Audio: 0xe1,
  SamplingFrequency: 0xb5,
  Channels: 0x9f,
} as const;

function webmHeaderMetadataFromPrefix(bytes: Uint8Array, container: 'mkv' | 'webm'): NormalizedMetadata | null {
  const segment = findEbmlChild(bytes, 0, bytes.byteLength, EBML_ID.Segment);
  if (!segment) return null;

  let timestampScaleNs = 1_000_000;
  let durationSec: number | null = null;
  const info = findEbmlChild(bytes, segment.bodyStart, segment.bodyEnd, EBML_ID.Info);
  if (info) {
    for (const field of ebmlChildren(bytes, info.bodyStart, info.bodyEnd)) {
      if (field.id === EBML_ID.TimestampScale) {
        timestampScaleNs = readEbmlUint(bytes, field.bodyStart, field.bodyEnd);
      } else if (field.id === EBML_ID.Duration) {
        const durationTicks = readEbmlFloat(bytes, field.bodyStart, field.bodyEnd);
        if (durationTicks != null) durationSec = (durationTicks * timestampScaleNs) / 1_000_000_000;
      }
    }
  }

  const tracks = findEbmlChild(bytes, segment.bodyStart, segment.bodyEnd, EBML_ID.Tracks);
  if (!tracks) return null;

  const normalizedTracks: NormalizedTrack[] = [];
  for (const trackEntry of ebmlChildren(bytes, tracks.bodyStart, tracks.bodyEnd)) {
    if (trackEntry.id !== EBML_ID.TrackEntry) continue;

    let trackType: number | null = null;
    let codecId = '';
    let defaultDurationNs: number | null = null;
    let width: number | undefined;
    let height: number | undefined;
    let sampleRate: number | undefined;
    let channels: number | undefined;

    for (const field of ebmlChildren(bytes, trackEntry.bodyStart, trackEntry.bodyEnd)) {
      if (field.id === EBML_ID.TrackType) {
        trackType = readEbmlUint(bytes, field.bodyStart, field.bodyEnd);
      } else if (field.id === EBML_ID.CodecID) {
        codecId = readEbmlString(bytes, field.bodyStart, field.bodyEnd);
      } else if (field.id === EBML_ID.DefaultDuration) {
        defaultDurationNs = readEbmlUint(bytes, field.bodyStart, field.bodyEnd);
      } else if (field.id === EBML_ID.Video) {
        for (const videoField of ebmlChildren(bytes, field.bodyStart, field.bodyEnd)) {
          if (videoField.id === EBML_ID.PixelWidth) {
            width = readEbmlUint(bytes, videoField.bodyStart, videoField.bodyEnd);
          } else if (videoField.id === EBML_ID.PixelHeight) {
            height = readEbmlUint(bytes, videoField.bodyStart, videoField.bodyEnd);
          }
        }
      } else if (field.id === EBML_ID.Audio) {
        for (const audioField of ebmlChildren(bytes, field.bodyStart, field.bodyEnd)) {
          if (audioField.id === EBML_ID.SamplingFrequency) {
            sampleRate = Math.round(readEbmlFloat(bytes, audioField.bodyStart, audioField.bodyEnd) ?? 0) || undefined;
          } else if (audioField.id === EBML_ID.Channels) {
            channels = readEbmlUint(bytes, audioField.bodyStart, audioField.bodyEnd) || undefined;
          }
        }
      }
    }

    if (trackType === 1) {
      const codec = webmVideoCodec(codecId);
      if (!codec) continue;
      const track: NormalizedTrack = {
        type: 'video',
        codec,
        width,
        height,
        bitrate: null,
        language: null,
      };
      if (defaultDurationNs != null && defaultDurationNs > 0) {
        track.fps = Math.round((1_000_000_000 / defaultDurationNs) * 1000) / 1000;
      }
      normalizedTracks.push(track);
    } else if (trackType === 2) {
      const codec = webmAudioCodec(codecId);
      if (!codec) continue;
      normalizedTracks.push({
        type: 'audio',
        codec,
        sampleRate,
        channels,
        bitrate: null,
        language: null,
      });
    }
  }

  return normalizedTracks.length ? { container, durationSec, tracks: normalizedTracks } : null;
}

function webmVideoCodec(codecId: string): string | null {
  switch (codecId) {
    case 'V_VP8':
      return 'vp8';
    case 'V_VP9':
      return 'vp9';
    case 'V_AV1':
      return 'av1';
    case 'V_MPEG4/ISO/AVC':
      return 'h264';
    case 'V_MPEGH/ISO/HEVC':
      return 'hevc';
    default:
      return null;
  }
}

function webmAudioCodec(codecId: string): string | null {
  switch (codecId) {
    case 'A_OPUS':
      return 'opus';
    case 'A_VORBIS':
      return 'vorbis';
    case 'A_AAC':
      return 'aac';
    case 'A_FLAC':
      return 'flac';
    default:
      return null;
  }
}

function findEbmlChild(bytes: Uint8Array, start: number, end: number, id: number): EbmlElement | null {
  for (const child of ebmlChildren(bytes, start, end)) {
    if (child.id === id) return child;
  }
  return null;
}

function* ebmlChildren(bytes: Uint8Array, start: number, end: number): Generator<EbmlElement> {
  let pos = start;
  const limit = Math.min(end, bytes.byteLength);
  while (pos + 1 < limit) {
    const element = readEbmlElement(bytes, pos, limit);
    if (!element || element.bodyStart > limit) return;
    yield element;
    if (element.next <= pos) return;
    pos = element.next;
  }
}

function readEbmlElement(bytes: Uint8Array, pos: number, parentEnd: number): EbmlElement | null {
  const id = readEbmlVariableInt(bytes, pos, true);
  if (!id) return null;
  const size = readEbmlVariableInt(bytes, id.next, false);
  if (!size) return null;
  const bodyStart = size.next;
  const declaredEnd = size.value === -1 ? parentEnd : bodyStart + size.value;
  const bodyEnd = Math.min(declaredEnd, parentEnd);
  if (bodyStart > parentEnd || bodyEnd < bodyStart) return null;
  return { id: id.value, bodyStart, bodyEnd, next: bodyEnd };
}

function readEbmlVariableInt(
  bytes: Uint8Array,
  pos: number,
  keepMarker: boolean,
): { value: number; next: number; length: number } | null {
  const first = bytes[pos];
  if (first == null || first === 0) return null;
  let mask = 0x80;
  let length = 1;
  while (length <= 8 && (first & mask) === 0) {
    mask >>= 1;
    length++;
  }
  if (length > 8 || pos + length > bytes.byteLength) return null;

  let value = keepMarker ? first : first & (mask - 1);
  for (let i = 1; i < length; i++) value = value * 256 + (bytes[pos + i] ?? 0);

  const allOnes = Math.pow(2, 7 * length) - 1;
  return { value: !keepMarker && value === allOnes ? -1 : value, next: pos + length, length };
}

function readEbmlUint(bytes: Uint8Array, start: number, end: number): number {
  let value = 0;
  for (let i = start; i < end; i++) value = value * 256 + (bytes[i] ?? 0);
  return value;
}

function readEbmlFloat(bytes: Uint8Array, start: number, end: number): number | null {
  const size = end - start;
  if (size !== 4 && size !== 8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset + start, size);
  return size === 4 ? view.getFloat32(0) : view.getFloat64(0);
}

function readEbmlString(bytes: Uint8Array, start: number, end: number): string {
  let out = '';
  for (let i = start; i < end; i++) {
    const char = bytes[i] ?? 0;
    if (char === 0) break;
    out += String.fromCharCode(char);
  }
  return out;
}

async function withProtectedMp4MetadataFallback(
  input: MediaInput,
  metadata: NormalizedMetadata,
  parserTracks: import('@remotion/media-parser').MediaParserTrack[],
): Promise<NormalizedMetadata> {
  if (metadata.container !== 'mp4' || !parserTracks.some(isProtectedParserTrack)) {
    return metadata;
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await input.arrayBuffer());
  } catch {
    return metadata;
  }

  const protectedInfos = parserTracks.map((track) => protectedTrackInfo(track, bytes));
  const usableInfos = protectedInfos.filter((info): info is ProtectedTrackInfo => info !== null);
  if (!usableInfos.length) return metadata;

  const timescaleByTrackId = new Map<number, number>();
  for (const info of usableInfos) timescaleByTrackId.set(info.trackId, info.timescale);

  const fragmentStats = collectFragmentTrackStats(bytes);
  const durationSec =
    metadata.durationSec ?? durationFromFragmentStats(fragmentStats, timescaleByTrackId, usableInfos);

  const tracks = metadata.tracks.map((track, index) => {
    const info = protectedInfos[index];
    if (!info) return track;

    if (info.kind !== 'video') return info.track;

    const progressiveTiming = progressiveTimingForProtectedTrack(bytes, info.sample, info.timescale);
    const trackDurationSec =
      durationForFragmentTrack(fragmentStats.get(info.trackId), info.timescale) ??
      progressiveTiming?.durationSec ??
      durationSec;
    const sampleCount = fragmentStats.get(info.trackId)?.sampleCount ?? progressiveTiming?.sampleCount ?? null;
    const fps =
      sampleCount != null && trackDurationSec != null && trackDurationSec > 0
        ? sampleCount / trackDurationSec
        : null;

    return fps != null && Number.isFinite(fps) && fps > 0
      ? { ...info.track, fps }
      : info.track;
  });

  return { ...metadata, durationSec, tracks };
}

interface ProtectedTrackInfo {
  kind: 'video' | 'audio';
  trackId: number;
  timescale: number;
  sample: ProtectedSampleRef;
  track: NormalizedTrack;
}

interface ProtectedSampleRef {
  offset: number;
  size: number;
  format: string;
}

interface ProtectedSampleEntry {
  kind: 'video' | 'audio';
  codec: string;
  width?: number;
  height?: number;
  sampleRate?: number;
  channels?: number;
}

interface Mp4BoxHeader {
  offset: number;
  size: number;
  headerSize: number;
  end: number;
  type: string;
}

interface FragmentTrackStats {
  sampleCount: number;
  maxEnd: number;
}

interface ProgressiveTrackTiming {
  sampleCount: number;
  durationSec: number;
}

interface TfhdInfo {
  trackId: number;
  defaultSampleDuration: number | null;
}

interface TrunInfo {
  sampleCount: number;
  duration: number;
}

function isProtectedParserTrack(track: import('@remotion/media-parser').MediaParserTrack): boolean {
  if (track.type !== 'other') return false;
  const sample = protectedSampleRef(track.trakBox);
  return sample?.format === 'encv' || sample?.format === 'enca';
}

function protectedTrackInfo(
  track: import('@remotion/media-parser').MediaParserTrack,
  bytes: Uint8Array,
): ProtectedTrackInfo | null {
  if (track.type !== 'other') return null;

  const sample = protectedSampleRef(track.trakBox);
  if (!sample) return null;

  const entry = parseProtectedSampleEntry(bytes, sample);
  if (!entry) return null;

  const trackId = track.trackId;
  const timescale = track.originalTimescale;
  if (!Number.isFinite(timescale) || timescale <= 0) return null;

  if (entry.kind === 'video') {
    const tkhd = findBox(track.trakBox, (box) => stringProp(box, 'type') === 'tkhd-box');
    const width = entry.width || numberProp(tkhd, 'unrotatedWidth') || numberProp(tkhd, 'width') || undefined;
    const height =
      entry.height || numberProp(tkhd, 'unrotatedHeight') || numberProp(tkhd, 'height') || undefined;
    const rotation = numberProp(tkhd, 'rotation') ?? 0;

    return {
      kind: 'video',
      trackId,
      timescale,
      sample,
      track: {
        type: 'video',
        codec: entry.codec,
        width,
        height,
        rotation,
        bitrate: null,
        language: null,
      },
    };
  }

  return {
    kind: 'audio',
    trackId,
    timescale,
    sample,
    track: {
      type: 'audio',
      codec: entry.codec,
      sampleRate: entry.sampleRate,
      channels: entry.channels,
      bitrate: null,
      language: null,
    },
  };
}

function protectedSampleRef(trackBox: unknown): ProtectedSampleRef | null {
  const stsd = findBox(trackBox, (box) => stringProp(box, 'type') === 'stsd-box');
  const samples = arrayProp(stsd, 'samples');
  if (!samples) return null;

  for (const rawSample of samples) {
    const sample = asRecord(rawSample);
    const format = stringProp(sample, 'format');
    if (format !== 'encv' && format !== 'enca') continue;
    const offset = numberProp(sample, 'offset');
    const size = numberProp(sample, 'size');
    if (offset == null || size == null || size <= 0) continue;
    return { offset, size, format };
  }

  return null;
}

function parseProtectedSampleEntry(
  bytes: Uint8Array,
  sample: ProtectedSampleRef,
): ProtectedSampleEntry | null {
  if (!hasRange(bytes, sample.offset, sample.size) || sample.size < 16) return null;
  const format = ascii(bytes, sample.offset + 4, sample.offset + 8);
  if (format !== sample.format) return null;

  if (format === 'encv') {
    if (!hasRange(bytes, sample.offset, 86)) return null;
    const childStart = sample.offset + 86;
    const end = sample.offset + sample.size;
    const originalFormat = protectedOriginalFormat(bytes, childStart, end);
    const codec = videoCodecFromSampleFormat(originalFormat);
    if (!codec) return null;

    return {
      kind: 'video',
      codec,
      width: readUint16Be(bytes, sample.offset + 32) || undefined,
      height: readUint16Be(bytes, sample.offset + 34) || undefined,
    };
  }

  if (format === 'enca') {
    if (!hasRange(bytes, sample.offset, 36)) return null;
    const version = readUint16Be(bytes, sample.offset + 16);
    if (version !== 0 && version !== 1) return null;

    const childStart = sample.offset + (version === 0 ? 36 : 52);
    const end = sample.offset + sample.size;
    const originalFormat = protectedOriginalFormat(bytes, childStart, end);
    const codec = audioCodecFromSampleFormat(originalFormat);
    if (!codec) return null;

    return {
      kind: 'audio',
      codec,
      channels: readUint16Be(bytes, sample.offset + 24) || undefined,
      sampleRate: readFixed1616Be(bytes, sample.offset + 32) || undefined,
    };
  }

  return null;
}

function protectedOriginalFormat(bytes: Uint8Array, start: number, end: number): string | null {
  let offset = start;
  while (offset + 8 <= end) {
    const box = readMp4BoxHeader(bytes, offset, end);
    if (!box) break;

    if (box.type === 'frma' && hasRange(bytes, box.offset + box.headerSize, 4)) {
      return ascii(bytes, box.offset + box.headerSize, box.offset + box.headerSize + 4);
    }

    if (box.type === 'sinf' || box.type === 'schi') {
      const nested = protectedOriginalFormat(bytes, box.offset + box.headerSize, box.end);
      if (nested) return nested;
    }

    offset = box.end;
  }

  return null;
}

function videoCodecFromSampleFormat(format: string | null): string | null {
  switch (format) {
    case 'avc1':
    case 'avc3':
      return 'h264';
    case 'hvc1':
    case 'hev1':
      return 'hevc';
    case 'av01':
      return 'av1';
    case 'vp08':
      return 'vp8';
    case 'vp09':
      return 'vp9';
    default:
      return null;
  }
}

function audioCodecFromSampleFormat(format: string | null): string | null {
  switch (format) {
    case 'mp4a':
      return 'aac';
    case 'Opus':
      return 'opus';
    case '.mp3':
      return 'mp3';
    default:
      return null;
  }
}

function collectFragmentTrackStats(bytes: Uint8Array): Map<number, FragmentTrackStats> {
  const stats = new Map<number, FragmentTrackStats>();
  let offset = 0;

  while (offset + 8 <= bytes.byteLength) {
    const box = readMp4BoxHeader(bytes, offset, bytes.byteLength);
    if (!box) break;
    if (box.type === 'moof') collectMoofTrackStats(bytes, box, stats);
    offset = box.end;
  }

  return stats;
}

function collectMoofTrackStats(
  bytes: Uint8Array,
  moof: Mp4BoxHeader,
  stats: Map<number, FragmentTrackStats>,
): void {
  let offset = moof.offset + moof.headerSize;

  while (offset + 8 <= moof.end) {
    const box = readMp4BoxHeader(bytes, offset, moof.end);
    if (!box) break;
    if (box.type === 'traf') collectTrafTrackStats(bytes, box, stats);
    offset = box.end;
  }
}

function collectTrafTrackStats(
  bytes: Uint8Array,
  traf: Mp4BoxHeader,
  stats: Map<number, FragmentTrackStats>,
): void {
  let offset = traf.offset + traf.headerSize;
  let tfhd: TfhdInfo | null = null;
  let baseDecodeTime = 0;
  const truns: TrunInfo[] = [];

  while (offset + 8 <= traf.end) {
    const box = readMp4BoxHeader(bytes, offset, traf.end);
    if (!box) break;

    if (box.type === 'tfhd') tfhd = parseTfhd(bytes, box);
    if (box.type === 'tfdt') baseDecodeTime = parseTfdt(bytes, box) ?? baseDecodeTime;
    if (box.type === 'trun') truns.push(parseTrun(bytes, box, tfhd?.defaultSampleDuration ?? null));

    offset = box.end;
  }

  if (!tfhd) return;

  let cursor = baseDecodeTime;
  for (const trun of truns) {
    cursor += trun.duration;
    const existing = stats.get(tfhd.trackId) ?? { sampleCount: 0, maxEnd: 0 };
    existing.sampleCount += trun.sampleCount;
    existing.maxEnd = Math.max(existing.maxEnd, cursor);
    stats.set(tfhd.trackId, existing);
  }
}

function parseTfhd(bytes: Uint8Array, box: Mp4BoxHeader): TfhdInfo | null {
  if (!hasRange(bytes, box.offset, 16)) return null;
  const flags = readFullBoxFlags(bytes, box.offset);
  let offset = box.offset + 12;
  const trackId = readUint32Be(bytes, offset);
  offset += 4;

  if ((flags & 0x000001) !== 0) offset += 8;
  if ((flags & 0x000002) !== 0) offset += 4;

  let defaultSampleDuration: number | null = null;
  if ((flags & 0x000008) !== 0) {
    if (!hasRange(bytes, offset, 4)) return null;
    defaultSampleDuration = readUint32Be(bytes, offset);
    offset += 4;
  }

  return { trackId, defaultSampleDuration };
}

function parseTfdt(bytes: Uint8Array, box: Mp4BoxHeader): number | null {
  if (!hasRange(bytes, box.offset, 16)) return null;
  const version = bytes[box.offset + 8] ?? 0;
  if (version === 1) {
    if (!hasRange(bytes, box.offset + 12, 8)) return null;
    return readUint64Be(bytes, box.offset + 12);
  }
  return readUint32Be(bytes, box.offset + 12);
}

function parseTrun(
  bytes: Uint8Array,
  box: Mp4BoxHeader,
  defaultSampleDuration: number | null,
): TrunInfo {
  if (!hasRange(bytes, box.offset, 16)) return { sampleCount: 0, duration: 0 };
  const flags = readFullBoxFlags(bytes, box.offset);
  let offset = box.offset + 12;
  const sampleCount = readUint32Be(bytes, offset);
  offset += 4;

  if ((flags & 0x000001) !== 0) offset += 4; // data-offset-present
  if ((flags & 0x000004) !== 0) offset += 4; // first-sample-flags-present

  let duration = 0;
  for (let i = 0; i < sampleCount; i++) {
    let sampleDuration = defaultSampleDuration ?? 0;
    if ((flags & 0x000100) !== 0) {
      if (!hasRange(bytes, offset, 4)) break;
      sampleDuration = readUint32Be(bytes, offset);
      offset += 4;
    }
    if ((flags & 0x000200) !== 0) offset += 4; // sample-size-present
    if ((flags & 0x000400) !== 0) offset += 4; // sample-flags-present
    if ((flags & 0x000800) !== 0) offset += 4; // sample-composition-time-offset-present
    duration += sampleDuration;
  }

  return { sampleCount, duration };
}

function durationFromFragmentStats(
  stats: Map<number, FragmentTrackStats>,
  timescaleByTrackId: Map<number, number>,
  infos: ProtectedTrackInfo[],
): number | null {
  const videoTrackIds = infos.filter((info) => info.kind === 'video').map((info) => info.trackId);
  return (
    maxDurationForTrackIds(stats, timescaleByTrackId, videoTrackIds) ??
    maxDurationForTrackIds(
      stats,
      timescaleByTrackId,
      infos.map((info) => info.trackId),
    )
  );
}

function maxDurationForTrackIds(
  stats: Map<number, FragmentTrackStats>,
  timescaleByTrackId: Map<number, number>,
  trackIds: number[],
): number | null {
  let maxDurationSec = 0;
  for (const trackId of trackIds) {
    const durationSec = durationForFragmentTrack(stats.get(trackId), timescaleByTrackId.get(trackId));
    if (durationSec != null) maxDurationSec = Math.max(maxDurationSec, durationSec);
  }
  return maxDurationSec > 0 ? maxDurationSec : null;
}

function durationForFragmentTrack(
  stats: FragmentTrackStats | undefined,
  timescale: number | undefined,
): number | null {
  if (!stats || !timescale || !Number.isFinite(timescale) || timescale <= 0 || stats.maxEnd <= 0) {
    return null;
  }
  return stats.maxEnd / timescale;
}

function progressiveTimingForProtectedTrack(
  bytes: Uint8Array,
  sample: ProtectedSampleRef,
  timescale: number,
): ProgressiveTrackTiming | null {
  if (!Number.isFinite(timescale) || timescale <= 0) return null;

  const stbl = stblContainingSampleEntry(bytes, sample.offset);
  if (!stbl) return null;

  const stts = findMp4ChildBox(bytes, stbl.offset + stbl.headerSize, stbl.end, 'stts');
  if (!stts) return null;

  const bodyStart = stts.offset + stts.headerSize;
  if (!hasRange(bytes, bodyStart, 8)) return null;

  const entryCount = readUint32Be(bytes, bodyStart + 4);
  let offset = bodyStart + 8;
  let sampleCount = 0;
  let durationTicks = 0;

  for (let i = 0; i < entryCount && hasRange(bytes, offset, 8); i++) {
    const count = readUint32Be(bytes, offset);
    const delta = readUint32Be(bytes, offset + 4);
    offset += 8;
    sampleCount += count;
    durationTicks += count * delta;
  }

  if (sampleCount <= 0 || durationTicks <= 0) return null;
  return { sampleCount, durationSec: durationTicks / timescale };
}

function stblContainingSampleEntry(bytes: Uint8Array, sampleOffset: number): Mp4BoxHeader | null {
  const moov = findMp4ChildBox(bytes, 0, bytes.byteLength, 'moov');
  if (!moov) return null;

  let offset = moov.offset + moov.headerSize;
  while (offset + 8 <= moov.end) {
    const trak = readMp4BoxHeader(bytes, offset, moov.end);
    if (!trak) break;
    if (trak.type === 'trak' && sampleOffset >= trak.offset && sampleOffset < trak.end) {
      const mdia = findMp4ChildBox(bytes, trak.offset + trak.headerSize, trak.end, 'mdia');
      const minf = mdia ? findMp4ChildBox(bytes, mdia.offset + mdia.headerSize, mdia.end, 'minf') : null;
      const stbl = minf ? findMp4ChildBox(bytes, minf.offset + minf.headerSize, minf.end, 'stbl') : null;
      if (stbl) return stbl;
    }
    offset = trak.end;
  }

  return null;
}

function findMp4ChildBox(
  bytes: Uint8Array,
  start: number,
  end: number,
  type: string,
): Mp4BoxHeader | null {
  let offset = start;
  while (offset + 8 <= end) {
    const box = readMp4BoxHeader(bytes, offset, end);
    if (!box) break;
    if (box.type === type) return box;
    offset = box.end;
  }
  return null;
}

function findBox(root: unknown, predicate: (box: Record<string, unknown>) => boolean): Record<string, unknown> | null {
  const box = asRecord(root);
  if (!box) return null;
  if (predicate(box)) return box;

  const children = arrayProp(box, 'children');
  if (!children) return null;
  for (const child of children) {
    const match = findBox(child, predicate);
    if (match) return match;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function arrayProp(value: unknown, key: string): unknown[] | null {
  const record = asRecord(value);
  const prop = record?.[key];
  return Array.isArray(prop) ? prop : null;
}

function stringProp(value: unknown, key: string): string | null {
  const record = asRecord(value);
  const prop = record?.[key];
  return typeof prop === 'string' ? prop : null;
}

function numberProp(value: unknown, key: string): number | null {
  const record = asRecord(value);
  const prop = record?.[key];
  return typeof prop === 'number' && Number.isFinite(prop) ? prop : null;
}

function readMp4BoxHeader(bytes: Uint8Array, offset: number, limit: number): Mp4BoxHeader | null {
  if (!hasRange(bytes, offset, 8) || offset + 8 > limit) return null;

  let size = readUint32Be(bytes, offset);
  let headerSize = 8;
  if (size === 1) {
    if (!hasRange(bytes, offset + 8, 8)) return null;
    const wideSize = readUint64Be(bytes, offset + 8);
    if (wideSize == null) return null;
    size = wideSize;
    headerSize = 16;
  } else if (size === 0) {
    size = limit - offset;
  }

  if (size < headerSize || offset + size > limit) return null;
  return {
    offset,
    size,
    headerSize,
    end: offset + size,
    type: ascii(bytes, offset + 4, offset + 8),
  };
}

function readFullBoxFlags(bytes: Uint8Array, boxOffset: number): number {
  return ((bytes[boxOffset + 9] ?? 0) << 16) + ((bytes[boxOffset + 10] ?? 0) << 8) + (bytes[boxOffset + 11] ?? 0);
}

function readUint16Be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) + (bytes[offset + 1] ?? 0);
}

function readUint64Be(bytes: Uint8Array, offset: number): number | null {
  const high = readUint32Be(bytes, offset);
  const low = readUint32Be(bytes, offset + 4);
  const value = high * 2 ** 32 + low;
  return Number.isSafeInteger(value) ? value : null;
}

function readFixed1616Be(bytes: Uint8Array, offset: number): number {
  return readUint32Be(bytes, offset) / 65536;
}

function hasRange(bytes: Uint8Array, offset: number, length: number): boolean {
  return offset >= 0 && length >= 0 && offset + length <= bytes.byteLength;
}

function normalizeTrack(t: import('@remotion/media-parser').MediaParserTrack): NormalizedTrack {
  if (t.type === 'video') {
    const out: NormalizedTrack = {
      type: 'video',
      codec: parserToCanonicalVideo(t.codecEnum),
      nativeCodecTag: t.codec,
      width: t.width || t.codedWidth || undefined,
      height: t.height || t.codedHeight || undefined,
      rotation: t.rotation || 0,
      bitrate: null,
      language: null,
    };
    if (typeof t.fps === 'number' && Number.isFinite(t.fps) && t.fps > 0) {
      out.fps = t.fps;
      out.fpsProvenance = { source: 'nominal', cadence: 'UNKNOWN' };
    }
    return out;
  }
  if (t.type === 'audio') {
    return {
      type: 'audio',
      codec: parserToCanonicalAudio(t.codecEnum),
      nativeCodecTag: t.codec,
      sampleRate: t.sampleRate || undefined,
      channels: t.numberOfChannels || undefined,
      bitrate: null,
      language: null,
    };
  }
  return {
    type: 'other',
    codec: 'unknown',
    bitrate: null,
    language: null,
  };
}

function withVideoFpsFromPackets(metadata: NormalizedMetadata, packets: PacketInfo[]): NormalizedMetadata {
  const tracks = metadata.tracks.map((track, trackIndex) => {
    if (track.type !== 'video' || track.fps != null) return track;
    const observation = fpsObservationFromTrackPackets(
      packets.filter((packet) => packet.trackIndex === trackIndex),
      metadata.durationSec,
    );
    return observation == null
      ? track
      : { ...track, fps: observation.fps, fpsProvenance: observation.provenance };
  });
  return { ...metadata, tracks };
}

function needsPacketProbeFallback(metadata: NormalizedMetadata): boolean {
  if (metadata.container !== 'ts' && metadata.container !== 'adts') return false;
  return metadata.durationSec == null || needsSingleVideoFpsFallback(metadata);
}

function withProbeFieldsFromPackets(
  metadata: NormalizedMetadata,
  packets: PacketInfo[],
): NormalizedMetadata {
  const durationSec = metadata.durationSec ?? durationFromPacketPts(packets);
  const tracks = metadata.tracks.map((track, trackIndex) => {
    if (track.type !== 'video' || track.fps != null) return track;
    const observation = fpsObservationFromTrackPackets(
      packets.filter((packet) => packet.trackIndex === trackIndex),
      null,
    );
    return observation == null
      ? track
      : { ...track, fps: observation.fps, fpsProvenance: observation.provenance };
  });
  return { ...metadata, durationSec, tracks };
}

function needsSingleVideoFpsFallback(metadata: NormalizedMetadata): boolean {
  const videoTracks = metadata.tracks.filter((track) => track.type === 'video');
  return videoTracks.length === 1 && videoTracks[0]?.fps == null;
}

function needsWebmFamilyFpsFallback(metadata: NormalizedMetadata): boolean {
  if (metadata.container !== 'webm' && metadata.container !== 'mkv') return false;

  return needsSingleVideoFpsFallback(metadata);
}

function withSingleVideoFps(
  metadata: NormalizedMetadata,
  fps: number,
  options: { replace?: boolean } = {},
): NormalizedMetadata {
  if (!Number.isFinite(fps) || fps <= 0) return metadata;
  let applied = false;
  const tracks = metadata.tracks.map((track) => {
    if (track.type !== 'video' || (!options.replace && track.fps != null) || applied) return track;
    applied = true;
    return {
      ...track,
      fps,
      fpsProvenance: { source: 'nominal' as const, cadence: 'UNKNOWN' as const },
    };
  });
  return applied ? { ...metadata, tracks } : metadata;
}

function ensureSupportedTranscodeRequest(
  input: MediaInput,
  opts: TranscodeOptions,
  container: RemotionContainer,
  videoSpec: TranscodeVideoOptions | undefined,
  tracks: import('@remotion/media-parser').MediaParserTrack[],
  request: ConcreteOperationRequest,
): void {
  const tuple = remotionTupleSummary(request);
  // Channel remap (downmix/upmix) has NO native path in @remotion/webcodecs on ANY container,
  // including WAV: the onAudioTrack resolver can change the sample rate but not numberOfChannels.
  // Check this BEFORE the WAV early-return so a channel-count request (e.g. 5.1 -> stereo) is an
  // honest NA_ENGINE rather than silently emitting the source layout and failing the metadata oracle.
  if (opts.audio?.channels != null) {
    throw createNotApplicableError(
      ENGINE_ID,
      'transcode',
      'the adapter cannot remap audio channel count (downmix/upmix)',
      tuple,
      'REMOTION_CHANNEL_REMAP_UNSUPPORTED',
    );
  }

  if (
    videoSpec &&
    ((videoSpec.width !== undefined && videoSpec.width <= 0) ||
      (videoSpec.height !== undefined && videoSpec.height <= 0))
  ) {
    throw createNotApplicableError(
      ENGINE_ID,
      'transcode',
      'video dimensions must be positive',
      tuple,
      'REMOTION_INVALID_DIMENSIONS',
    );
  }

  if (videoSpec?.codec === 'av1') {
    throw createNotApplicableError(
      ENGINE_ID,
      'transcode',
      'Remotion WebCodecs 4.0.479 exposes no AV1 encoder',
      tuple,
      'REMOTION_AV1_ENCODER_UNAVAILABLE',
    );
  }

  if (input.sizeBytes !== undefined && input.sizeBytes > 512 * 1024 * 1024) {
    throw createNotApplicableError(
      ENGINE_ID,
      'transcode',
      'input exceeds the adapter\'s 512MiB in-memory output policy',
      tuple,
      'REMOTION_BUFFER_WRITER_RESOURCE_LIMIT',
    );
  }

  if (videoSpec?.fps != null) {
    throw createNotApplicableError(
      ENGINE_ID,
      'transcode',
      'Remotion WebCodecs 4.0.479 convertMedia has no output FPS conversion option',
      tuple,
      'REMOTION_OUTPUT_FPS_UNSUPPORTED',
    );
  }

  if (videoSpec?.bitrate != null) {
    throw createNotApplicableError(
      ENGINE_ID,
      'transcode',
      'Remotion WebCodecs 4.0.479 convertMedia has no exact video bitrate option',
      tuple,
      'REMOTION_VIDEO_BITRATE_UNSUPPORTED',
    );
  }

  if (container === 'wav' && videoSpec) {
    throw createNotApplicableError(
      ENGINE_ID,
      'transcode',
      'WAV is audio-only and cannot satisfy a requested video output',
      tuple,
      'REMOTION_WAV_VIDEO_OUTPUT_UNSUPPORTED',
    );
  }

  // Reached for NON-WAV containers only (container==='wav' returned early above). WAV resample is now
  // honored natively via the onAudioTrack resolver in transcode() (getWaveAudioEncoder writes the
  // requested rate). For mp4/webm, Chrome's AudioEncoder overrides the requested sampleRate for
  // aac/opus, so non-WAV resample is NOT exact -> still NA. Channel remap has no native path on ANY
  // container (the resolver cannot change numberOfChannels) -> still NA everywhere.
  if (container !== 'wav' && opts.audio?.sampleRate != null) {
    throw createNotApplicableError(
      ENGINE_ID,
      'transcode',
      'the pinned browser encoders do not honor non-WAV sample-rate requests exactly',
      tuple,
      'REMOTION_NON_WAV_SAMPLE_RATE_UNSUPPORTED',
    );
  }

  const rotate = typeof videoSpec?.rotate === 'number' ? ((videoSpec.rotate % 360) + 360) % 360 : 0;
  if (container === 'mp4' && (rotate === 90 || rotate === 270)) {
    throw createNotApplicableError(
      ENGINE_ID,
      'transcode',
      'rotated MP4 outputs are not playback-smoke-safe in this package',
      tuple,
      'REMOTION_ROTATED_MP4_UNSUPPORTED',
    );
  }

  const sourceVideo = tracks.find(
    (track): track is import('@remotion/media-parser').MediaParserVideoTrack => track.type === 'video',
  );
  if (
    sourceVideo
    && videoSpec?.width !== undefined
    && videoSpec.height !== undefined
    && sourceVideo.width * videoSpec.height !== sourceVideo.height * videoSpec.width
  ) {
    throw createNotApplicableError(
      ENGINE_ID,
      'transcode',
      'the requested two-dimensional resize changes aspect ratio but convertMedia only exposes box fit',
      tuple,
      'REMOTION_RESIZE_BOX_NOT_EXACT',
    );
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isGracefulTranscodeNegative(request: ConcreteOperationRequest): boolean {
  return request.options.gracefulAllowOutput === true ||
    request.scenarioId.startsWith('transcode/malformed_') ||
    request.scenarioId.startsWith('transcode/mismatch_');
}

function fpsFromTrackPackets(packets: PacketInfo[], durationSec: number | null): number | null {
  return fpsObservationFromTrackPackets(packets, durationSec)?.fps ?? null;
}

function fpsFromPts(ptsUs: number[], durationSec: number | null): number | null {
  if (!ptsUs.length) return null;
  if (durationSec != null && Number.isFinite(durationSec) && durationSec > 0) {
    return ptsUs.length / durationSec;
  }
  if (ptsUs.length < 2) return null;
  const pts = [...ptsUs].sort((a, b) => a - b);
  const spanUs = pts[pts.length - 1]! - pts[0]!;
  return spanUs > 0 ? ((pts.length - 1) * 1_000_000) / spanUs : null;
}

function fpsObservationFromTrackPackets(
  packets: PacketInfo[],
  durationSec: number | null,
): { fps: number; provenance: FrameRateProvenance } | null {
  if (!packets.length) return null;
  const pts = packets.map((packet) => packet.ptsUs).sort((a, b) => a - b);
  const deltas: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const delta = pts[i]! - pts[i - 1]!;
    if (delta > 0) deltas.push(delta);
  }
  const cadence = deltas.length > 1 && Math.max(...deltas) - Math.min(...deltas) > 2
    ? 'VFR' as const
    : deltas.length
      ? 'CFR' as const
      : 'UNKNOWN' as const;
  const envelope = deltas.length
    ? { minFps: 1_000_000 / Math.max(...deltas), maxFps: 1_000_000 / Math.min(...deltas) }
    : undefined;
  if (durationSec != null && Number.isFinite(durationSec) && durationSec > 0) {
    return {
      fps: packets.length / durationSec,
      provenance: {
        source: 'average',
        cadence,
        sampleCount: packets.length,
        observedIntervalUs: durationSec * 1_000_000,
        ...(envelope ? { envelope } : {}),
      },
    };
  }
  if (pts.length < 2) return null;
  const observedIntervalUs = pts[pts.length - 1]! - pts[0]!;
  if (observedIntervalUs <= 0) return null;
  return {
    fps: ((pts.length - 1) * 1_000_000) / observedIntervalUs,
    provenance: {
      source: 'observed',
      cadence,
      sampleCount: pts.length - 1,
      observedIntervalUs,
      ...(envelope ? { envelope } : {}),
    },
  };
}

function durationFromPacketPts(packets: PacketInfo[]): number | null {
  if (!packets.length) return null;
  let originUs = Number.POSITIVE_INFINITY;
  for (const packet of packets) originUs = Math.min(originUs, packet.ptsUs);
  let maxEndUs = 0;
  for (const group of packetsByTrack(packets).values()) {
    const pts = group.map((packet) => packet.ptsUs).sort((a, b) => a - b);
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (first == null || last == null) continue;
    const durationUs = medianPositiveDelta(pts) ?? 0;
    maxEndUs = Math.max(maxEndUs, last + durationUs - originUs);
  }
  return maxEndUs > 0 ? maxEndUs / 1_000_000 : null;
}

function packetsByTrack(packets: PacketInfo[]): Map<number, PacketInfo[]> {
  const groups = new Map<number, PacketInfo[]>();
  for (const packet of packets) {
    const group = groups.get(packet.trackIndex);
    if (group) {
      group.push(packet);
    } else {
      groups.set(packet.trackIndex, [packet]);
    }
  }
  return groups;
}

function medianPositiveDelta(sortedPtsUs: number[]): number | null {
  const deltas: number[] = [];
  for (let i = 1; i < sortedPtsUs.length; i++) {
    const delta = sortedPtsUs[i]! - sortedPtsUs[i - 1]!;
    if (delta > 0) deltas.push(delta);
  }
  if (!deltas.length) return null;
  deltas.sort((a, b) => a - b);
  return deltas[Math.floor(deltas.length / 2)]!;
}

function isHlsInput(input: MediaInput): boolean {
  const mime = (input.mime || '').toLowerCase();
  if (mime.includes('mpegurl') || mime.includes('x-mpegurl') || mime.includes('vnd.apple.mpegurl')) {
    return true;
  }
  const u = (input.url || input.id || '').toLowerCase();
  return u.endsWith('.m3u8');
}

/**
 * Random-access reader over the runner's authenticated bytes. Remotion ranges are inclusive at the
 * upper bound; emitting small views keeps a whole-file read from becoming one enormous stream chunk.
 */
function verifiedBufferReader(
  bytes: Uint8Array,
  name: string,
  contentType: string,
): MediaParserReader {
  return {
    async read({ range }) {
      const requestedStart = range === null ? 0 : typeof range === 'number' ? range : range[0];
      const requestedEnd = range === null || typeof range === 'number' ? bytes.byteLength : range[1] + 1;
      const start = Math.max(0, Math.min(bytes.byteLength, requestedStart));
      const end = Math.max(start, Math.min(bytes.byteLength, requestedEnd));
      let cursor = start;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (cursor >= end) {
            controller.close();
            return;
          }
          const next = Math.min(end, cursor + VERIFIED_READER_CHUNK_BYTES);
          controller.enqueue(bytes.subarray(cursor, next));
          cursor = next;
        },
      });
      const reader = stream.getReader();
      return {
        reader: {
          reader,
          async abort() {
            try {
              await reader.cancel();
            } catch {
              // The parser may already have consumed and released the stream.
            }
          },
        },
        contentLength: bytes.byteLength,
        contentType,
        name,
        supportsContentRange: true,
        needsContentRange: true,
      };
    },
    async readWholeAsText() {
      return new TextDecoder().decode(bytes);
    },
    createAdjacentFileSource() {
      throw new Error('verified single-file inputs cannot resolve adjacent resources');
    },
    preload() {
      // Bytes are already resident and range reads are synchronous; no speculative preload needed.
    },
  };
}

function directArrayBufferWriter(): {
  writer: MediaParserWriter;
  bytes: () => Uint8Array | null;
} {
  type ResizableOutputBuffer = ArrayBuffer & {
    resize(byteLength: number): void;
    transferToFixedLength?: () => ArrayBuffer;
  };
  const ResizableArrayBuffer = ArrayBuffer as unknown as {
    new(byteLength: number, options: { maxByteLength: number }): ResizableOutputBuffer;
  };
  let output: ResizableOutputBuffer | null = null;
  let finalBytes: Uint8Array | null = null;
  let removed = false;
  let finished = false;
  const writer: MediaParserWriter = {
    async createContent({ filename, mimeType }) {
      if (output !== null) throw new Error('directArrayBufferWriter supports one output per conversion');
      const buffer = new ResizableArrayBuffer(0, { maxByteLength: 2_000_000_000 });
      if (typeof buffer.resize !== 'function') {
        throw new Error('Resizable ArrayBuffer is required for directArrayBufferWriter');
      }
      output = buffer;
      return {
        async write(data) {
          const position = buffer.byteLength;
          buffer.resize(position + data.byteLength);
          new Uint8Array(buffer).set(data, position);
        },
        async finish() {
          if (removed) throw new Error('Already called .remove() on the result');
          finished = true;
        },
        getWrittenByteCount() {
          return buffer.byteLength;
        },
        async updateDataAt(position, data) {
          new Uint8Array(buffer).set(data, position);
        },
        async remove() {
          removed = true;
        },
        async getBlob() {
          if (!finished) throw new Error('Cannot save directArrayBufferWriter output before finish()');
          return new File([new Uint8Array(buffer)], filename, { type: mimeType });
        },
      };
    },
  };
  return {
    writer,
    bytes: () => {
      if (finalBytes) return finalBytes;
      if (output === null || !finished) return null;
      const fixed = typeof output.transferToFixedLength === 'function'
        ? output.transferToFixedLength()
        : output;
      finalBytes = new Uint8Array(fixed);
      return finalBytes;
    },
  };
}

/** Flatten media-parser's metadata entries to a string map (best-effort, descriptive tags only). */
function flattenMetadata(
  entries: import('@remotion/media-parser').MediaParserMetadataEntry[] | undefined,
): Record<string, string> | undefined {
  if (!entries || !entries.length) return undefined;
  const flat: Record<string, string> = {};
  for (const e of entries) {
    // MediaParserMetadataEntry.value is string | number.
    flat[e.key] = typeof e.value === 'string' ? e.value : String(e.value);
  }
  return flat;
}

/** Build a remotion ResizeOperation from the suite's video transcode dims (or undefined if none). */
export function buildResize(
  v: TranscodeVideoOptions,
): import('@remotion/webcodecs').ResizeOperation | undefined {
  const hasW = typeof v.width === 'number' && v.width > 0;
  const hasH = typeof v.height === 'number' && v.height > 0;
  if (hasW && hasH) {
    // The request contract is an exact width+height, not a non-upscaling bounding box. Applicability
    // already proves the source/request aspect ratios match, so Remotion's width mode deterministically
    // lands on both requested dimensions for downscales and upscales alike.
    return { mode: 'width', width: v.width as number };
  }
  if (hasW) return { mode: 'width', width: v.width as number };
  if (hasH) return { mode: 'height', height: v.height as number };
  return undefined;
}

/**
 * Best-effort native VideoEncoder warm-up (init-time only). Configures a tiny hardware-preferred
 * H.264 encoder and tears it down so the codec is resident before the first measured convert. Never
 * throws — if WebCodecs encode is unavailable here the real conversion will surface that itself.
 */
async function warmUpEncoder(): Promise<void> {
  try {
    if (typeof VideoEncoder === 'undefined') return;
    const support = await VideoEncoder.isConfigSupported({
      codec: 'avc1.42001f',
      width: 64,
      height: 64,
      hardwareAcceleration: 'prefer-hardware',
    }).catch(() => null);
    const config = support?.supported
      ? support.config!
      : ({ codec: 'avc1.42001f', width: 64, height: 64 } as VideoEncoderConfig);
    const enc = new VideoEncoder({ output: () => undefined, error: () => undefined });
    enc.configure(config);
    enc.close();
  } catch {
    // ignore — warm-up is purely an optimization.
  }
}
