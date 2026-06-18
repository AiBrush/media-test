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
 *   - In-memory output via the bufferWriter (the suite's MediaBytes contract); OPFS webFsWriter is the
 *     lib's perf path for huge outputs but is disk-backed, so we force bufferWriter for determinism.
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
 *     convertMedia, bufferWriter (./buffer), webcodecsController, createVideoDecoder,
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
  CapabilitySet,
  DemuxResult,
  FrameDigest,
  FrameSink,
  MediaBytes,
  MediaEngine,
  MediaInput,
  NormalizedMetadata,
  NormalizedTrack,
  PacketInfo,
  TranscodeOptions,
  TranscodeVideoOptions,
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

const ENGINE_ID = 'remotion-webcodecs@4.0.479';

// ── Lazily-imported lib handles (loaded in init(), UNTIMED per §0.7). ───────────────────────────
type WebcodecsModule = typeof import('@remotion/webcodecs');
type BufferWriterModule = typeof import('@remotion/webcodecs/buffer');
type MediaParserModule = typeof import('@remotion/media-parser');
type WebReaderModule = typeof import('@remotion/media-parser/web');

interface LibHandle {
  wc: WebcodecsModule;
  bufferWriter: BufferWriterModule['bufferWriter'];
  mp: MediaParserModule;
  /**
   * The HTTP/Blob-aware reader. Passed to parseMedia/convertMedia alongside `src: input.url` so the
   * lib resolves m3u8 sibling segments from the base URL and exercises the dossier §A.1/§A.14
   * HTTP-Range lazy-read fast path (read header/duration cheaply instead of force-buffering the whole
   * file). Mirrors the proven-honest sibling remotion-media-parser adapter.
   */
  webReader: WebReaderModule['webReader'];
}

/** The config we drive the lib with (best-path per dossier §0.9), surfaced as configUsed (§8.5). */
export const CONFIG_USED = {
  backend: 'webcodecs',
  hwAccel: 'prefer-hardware(+software fallback)',
  pixelBackend: 'offscreencanvas-2d',
  wasmThreads: 0,
  pipeline: 'streaming-backpressure',
  queueDepth: 'waitForQueueToBeLessThan',
  writer: 'bufferWriter',
  worker: 'convert=main-thread; extractFrames/parse=worker-capable',
} as const;

/** A FrameSink backed by digests + cached ImageData for SSIM/PSNR pixel access. */
class CapturedFrameSink implements FrameSink {
  frames: FrameDigest[] = [];
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

/** Read a VideoFrame into tight, top-left, straight-alpha ImageData via an OffscreenCanvas 2D ctx. */
function imageDataFromVideoFrame(frame: VideoFrame): ImageData {
  const width = frame.displayWidth || frame.codedWidth;
  const height = frame.displayHeight || frame.codedHeight;
  if (width <= 0 || height <= 0) throw new Error('VideoFrame has zero display size');
  const { canvas, ctx } = make2dCanvas(width, height);
  // drawImage rasterizes the frame (any YUV/colorspace) to straight-alpha RGBA, top-left origin.
  ctx.drawImage(frame as unknown as CanvasImageSource, 0, 0, width, height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
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
   * in-memory bufferWriter). Previously CONFIG_USED was exported but never attached, so the report
   * recorded `configUsed === undefined` for this engine.
   */
  readonly configUsed = CONFIG_USED;

  private lib: LibHandle | null = null;

  // ── capabilities (HONEST, dossier §10) ───────────────────────────────────────────────────────
  capabilities(): CapabilitySet {
    return {
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
      // Audio read set (MediaParserAudioCodec ⊇ these): adds mp3/flac/vorbis + pcm-s24/pcm-f32 that
      // media-parser reads but @remotion/webcodecs cannot encode (encode is aac/opus/pcm-s16 only).
      audioCodecs: ['aac', 'opus', 'mp3', 'flac', 'vorbis', 'pcm-s16', 'pcm-s24', 'pcm-f32'],
      // No decrypt API.
      encryption: [],
      // Pixel transforms are limited to resize + rotate (90° multiples) on OffscreenCanvas 2D.
      features: ['resize', 'rotate', 'packets:dts'],
    };
  }

  // ── init / dispose (UNTIMED, §0.7) ───────────────────────────────────────────────────────────
  /**
   * Dynamically import both packages (keeps the suite shell light) and warm the WebCodecs path.
   * There is no WASM to compile and no worker to spawn for the conversion pipeline, so init is
   * cheap; we still front-load the dynamic imports here so they are excluded from measured timing.
   * A short encoder warm-up exercises the native VideoEncoder so the first measured convert does not
   * pay the codec-spin-up cost.
   */
  async init(): Promise<void> {
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
  }

  async dispose(): Promise<void> {
    this.lib = null;
  }

  private mustLib(): LibHandle {
    if (!this.lib) throw new Error(`${ENGINE_ID}: init() must be awaited before use`);
    return this.lib;
  }

  // ── probe ────────────────────────────────────────────────────────────────────────────────────
  /**
   * Probe with media-parser. We request the "fast" header fields plus `tracks` (gives per-track
   * codec/dims/sampleRate/channels/rotation/fps) and `durationInSeconds`. `tracks` does not force a
   * full decode pass; duration comes from the header where present. Metadata tags are read via the
   * `metadata` field and flattened best-effort.
   */
  async probe(input: MediaInput): Promise<NormalizedMetadata> {
    if (isHlsInput(input)) {
      const { metadata, packets } = await this.demux(input);
      return withVideoFpsFromPackets(metadata, packets);
    }

    const { mp, webReader } = this.mustLib();

    const result = await mp.parseMedia({
      // src: input.url + webReader (NOT a buffered Blob): lets the lib resolve hls m3u8 sibling .ts
      // segments from the base URL, and exercises the HTTP-Range lazy-read fast path so longform
      // inputs report duration cheaply instead of force-buffering the whole file (dossier §A.1/§A.14).
      src: input.url,
      reader: webReader,
      acknowledgeRemotionLicense: true,
      fields: {
        container: true,
        durationInSeconds: true,
        tracks: true,
        metadata: true,
      },
    });

    return normalizeMetadata(result.container, result.durationInSeconds, result.tracks, result.metadata);
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
  async demux(input: MediaInput): Promise<DemuxResult> {
    const { mp, webReader } = this.mustLib();

    // Collect packets tagged with the raw container trackId; index is resolved AFTER the parse.
    const tagged: Array<{ trackId: number; packet: Omit<PacketInfo, 'trackIndex'> }> = [];
    const onSample = (trackId: number) => (
      sample: import('@remotion/media-parser').MediaParserVideoSample
        | import('@remotion/media-parser').MediaParserAudioSample,
    ): void => {
      tagged.push({
        trackId,
        packet: {
          size: sample.data.byteLength,
          ptsUs: Math.round(sample.timestamp),
          dtsUs: Math.round(sample.decodingTimestamp),
          keyframe: sample.type === 'key',
        },
      });
    };

    const result = await mp.parseMedia({
      src: input.url,
      reader: webReader,
      acknowledgeRemotionLicense: true,
      fields: {
        container: true,
        durationInSeconds: true,
        tracks: true,
        metadata: true,
      },
      onVideoTrack: ({ track }) => onSample(track.trackId),
      onAudioTrack: ({ track }) => onSample(track.trackId),
    });

    // Stable trackId -> 0-based index in ascending-trackId order (= container stream order). Tracks
    // that emitted samples but were not in result.tracks (defensive) are appended after, preserving
    // their relative trackId order, so no packet is dropped.
    const indexByTrackId = new Map<number, number>();
    let nextIndex = 0;
    for (const t of [...result.tracks].sort((a, b) => a.trackId - b.trackId)) {
      if (!indexByTrackId.has(t.trackId)) indexByTrackId.set(t.trackId, nextIndex++);
    }
    for (const { trackId } of tagged) {
      if (!indexByTrackId.has(trackId)) indexByTrackId.set(trackId, nextIndex++);
    }

    const packets: PacketInfo[] = tagged.map(({ trackId, packet }) => ({
      trackIndex: indexByTrackId.get(trackId)!,
      ...packet,
    }));

    const metadata = normalizeMetadata(
      result.container,
      result.durationInSeconds,
      result.tracks,
      result.metadata,
      indexByTrackId,
    );
    return { metadata, packets };
  }

  // ── remux ────────────────────────────────────────────────────────────────────────────────────
  /**
   * Lossless container change: convertMedia copies encoded samples when the target container accepts
   * the source codecs. We do NOT force a codec, so the default track handler copies where it can and
   * only re-encodes if the container cannot hold the source codec. Output goes to the in-memory
   * bufferWriter so `save()` yields the bytes directly.
   */
  async remux(input: MediaInput, opts: { container: string }): Promise<MediaBytes> {
    const container = canonicalToRemotionContainer(opts.container);
    if (!container) throw new Error(`${ENGINE_ID} cannot write container '${opts.container}'`);
    return this.convert(input, { container });
  }

  // ── transcode ────────────────────────────────────────────────────────────────────────────────
  /**
   * Re-encode / resize / rotate via convertMedia. The single-bytes contract means we drive the FIRST
   * variant when a fan-out ladder is requested (the lib has no native single-output fan-out). When a
   * codec is requested explicitly we map+validate it; when ONLY resize/rotate is asked for we leave
   * the codec undefined so convertMedia's default handler re-encodes with the container default
   * (faithful to the lib's documented "convert + resize" path). Resize uses the lib's ResizeOperation
   * ('max-height-width' when both dims are given, else width/height); rotate is a degrees number.
   */
  async transcode(input: MediaInput, opts: TranscodeOptions): Promise<MediaBytes> {
    const container = canonicalToRemotionContainer(opts.container);
    if (!container) throw new Error(`${ENGINE_ID} cannot write container '${opts.container}'`);

    const videoSpec = opts.variants && opts.variants.length ? opts.variants[0] : opts.video;

    let videoCodec: RemotionVideoCodec | undefined;
    let resize: import('@remotion/webcodecs').ResizeOperation | undefined;
    let rotate: number | undefined;

    // wav is audio-only: ignore any video spec entirely.
    if (container !== 'wav' && videoSpec) {
      if (videoSpec.codec) {
        const mapped = canonicalToRemotionVideo(videoSpec.codec);
        if (!mapped) throw new Error(`${ENGINE_ID} cannot encode video codec '${videoSpec.codec}'`);
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
      if (!mapped) throw new Error(`${ENGINE_ID} cannot encode audio codec '${opts.audio.codec}'`);
      audioCodec = mapped;
    }

    return this.convert(input, { container, videoCodec, audioCodec, resize, rotate });
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
    },
  ): Promise<MediaBytes> {
    const { wc, bufferWriter, mp, webReader } = this.mustLib();
    // src: input.url + webReader (NOT a buffered Blob) so hls m3u8 sibling segments resolve from the
    // base URL and the lib's HTTP-Range lazy reads work; a bare Blob has no base URL and force-buffers
    // the whole file (dossier §A.1/§A.14). Mirrors the sibling remotion-media-parser adapter.
    const src = input.url;

    // Probe (fast, header-only) to size the MP4 moov in one pass (dossier §4.6).
    let expectedDurationInSeconds: number | null = null;
    let expectedFrameRate: number | null = null;
    try {
      const probed = await mp.parseMedia({
        src,
        reader: webReader,
        acknowledgeRemotionLicense: true,
        fields: { durationInSeconds: true, fps: true },
      });
      expectedDurationInSeconds = probed.durationInSeconds ?? null;
      expectedFrameRate = probed.fps ?? null;
    } catch {
      // Non-fatal: convertMedia still works without the size hints, just may re-write the moov.
    }

    const controller = wc.webcodecsController();

    // NOTE: convertMedia sets acknowledgeRemotionLicense:true internally and does NOT accept it as a
    // param (it would be an excess property); we only pass it to parseMedia above.
    const result = await wc.convertMedia({
      src,
      reader: webReader,
      container: opts.container,
      videoCodec: opts.videoCodec,
      audioCodec: opts.audioCodec,
      resize: opts.resize,
      rotate: opts.rotate,
      controller,
      writer: bufferWriter, // in-memory output -> save() returns the bytes
      expectedDurationInSeconds,
      expectedFrameRate,
    });

    const blob = await result.save();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    // Free the in-memory output buffer held by the writer.
    await result.remove().catch(() => undefined);

    return {
      bytes,
      mime: mimeForContainer(opts.container),
      container: opts.container,
    };
  }

  // ── decodeFrames ─────────────────────────────────────────────────────────────────────────────
  /**
   * Decode the primary video track to normalized RGBA frame digests. We parse with media-parser to
   * obtain the track config + encoded samples, feed those EncodedVideoChunks into the lib's
   * createVideoDecoder (native WebCodecs, hardware-preferred), and rasterize each emitted VideoFrame
   * to tight straight-alpha RGBA. Backpressure is honored via the decoder's waitForQueueToBeLessThan.
   *
   * Frames are emitted by the decoder in PRESENTATION order; we sort the captured frames by pts and
   * re-index so the digest list is presentation-ordered (matching the golden frame ordering).
   */
  async decodeFrames(input: MediaInput, opts?: { maxFrames?: number }): Promise<FrameSink> {
    const { wc, mp, webReader } = this.mustLib();
    const src = input.url;
    const max = opts?.maxFrames ?? Infinity;

    const captured: Array<{ img: ImageData; ptsUs: number }> = [];
    let decodeError: Error | null = null;
    let decoder: import('@remotion/webcodecs').WebCodecsVideoDecoder | null = null;
    let stopped = false;

    await mp.parseMedia({
      src,
      reader: webReader,
      acknowledgeRemotionLicense: true,
      fields: { tracks: true },
      onVideoTrack: ({ track }) => {
        // Build the native WebCodecs decoder from the parsed track (it IS a VideoDecoderConfig).
        const config: VideoDecoderConfig = {
          codec: track.codec,
          codedWidth: track.codedWidth,
          codedHeight: track.codedHeight,
          description: track.description,
          colorSpace: track.colorSpace,
        };

        const decoderPromise = wc
          .createVideoDecoder({
            track: config,
            onFrame: (frame) => {
              try {
                if (captured.length >= max) {
                  frame.close();
                  return;
                }
                const ptsUs = Math.round(frame.timestamp); // VideoFrame.timestamp is microseconds
                const img = imageDataFromVideoFrame(frame);
                captured.push({ img, ptsUs });
              } finally {
                frame.close();
              }
            },
            onError: (err) => {
              decodeError = err;
            },
          })
          .then((d) => {
            decoder = d;
            return d;
          });

        // Per-sample callback: push each encoded chunk into the decoder with backpressure.
        return async (sample) => {
          if (stopped) return;
          const d = decoder ?? (await decoderPromise);
          if (captured.length >= max) {
            stopped = true;
            return () => undefined; // OnTrackDoneCallback: stop pulling more samples
          }
          await d.waitForQueueToBeLessThan(16);
          await d.decode({
            type: sample.type,
            timestamp: sample.timestamp,
            duration: sample.duration,
            data: sample.data,
          });
        };
      },
    });

    if (decoder) {
      await (decoder as import('@remotion/webcodecs').WebCodecsVideoDecoder).flush().catch(() => undefined);
      (decoder as import('@remotion/webcodecs').WebCodecsVideoDecoder).close();
    }
    if (decodeError) throw decodeError;

    // Presentation order + re-index, then digest.
    captured.sort((a, b) => a.ptsUs - b.ptsUs);
    const out = new CapturedFrameSink();
    for (let i = 0; i < captured.length && i < max; i++) {
      const c = captured[i]!;
      const digest = await digestImageData(c.img, i, c.ptsUs);
      out.push(c.img, digest);
    }
    return out;
  }

  // ── seek ─────────────────────────────────────────────────────────────────────────────────────
  /**
   * Seek to tUs: drive media-parser with a controller `.seek(tInSeconds)` so the parser jumps to the
   * best keyframe <= t, then decode forward until we reach the frame visible at t (last frame with
   * pts <= t). Returns that frame's landed pts + digest. Uses the same native decoder path as
   * decodeFrames.
   */
  async seek(input: MediaInput, tUs: number): Promise<{ landedPtsUs: number; frame: FrameDigest }> {
    const { wc, mp, webReader } = this.mustLib();
    const src = input.url;
    const targetUs = Math.max(0, tUs);

    let best: { img: ImageData; ptsUs: number } | null = null;
    let decodeError: Error | null = null;
    let decoder: import('@remotion/webcodecs').WebCodecsVideoDecoder | null = null;
    let done = false;

    const controller = mp.mediaParserController();

    await mp.parseMedia({
      src,
      reader: webReader,
      controller,
      acknowledgeRemotionLicense: true,
      fields: { tracks: true },
      onVideoTrack: ({ track }) => {
        // Seek to the keyframe at/just before the target time.
        controller.seek(targetUs / 1e6);

        const config: VideoDecoderConfig = {
          codec: track.codec,
          codedWidth: track.codedWidth,
          codedHeight: track.codedHeight,
          description: track.description,
          colorSpace: track.colorSpace,
        };

        const decoderPromise = wc
          .createVideoDecoder({
            track: config,
            onFrame: (frame) => {
              try {
                const ptsUs = Math.round(frame.timestamp);
                // Keep the latest frame whose pts <= target (the frame visible at t).
                if (ptsUs <= targetUs) {
                  if (!best || ptsUs > best.ptsUs) {
                    best = { img: imageDataFromVideoFrame(frame), ptsUs };
                  }
                } else if (!best) {
                  // Target is before the first decodable frame after the keyframe — take it.
                  best = { img: imageDataFromVideoFrame(frame), ptsUs };
                }
              } finally {
                frame.close();
              }
            },
            onError: (err) => {
              decodeError = err;
            },
          })
          .then((d) => {
            decoder = d;
            return d;
          });

        return async (sample) => {
          if (done) return;
          const d = decoder ?? (await decoderPromise);
          await d.waitForQueueToBeLessThan(16);
          await d.decode({
            type: sample.type,
            timestamp: sample.timestamp,
            duration: sample.duration,
            data: sample.data,
          });
          // Once we have decoded past the target, we can stop pulling samples.
          if (sample.timestamp > targetUs) {
            done = true;
            return () => undefined;
          }
        };
      },
    });

    if (decoder) {
      await (decoder as import('@remotion/webcodecs').WebCodecsVideoDecoder).flush().catch(() => undefined);
      (decoder as import('@remotion/webcodecs').WebCodecsVideoDecoder).close();
    }
    if (decodeError) throw decodeError;
    if (!best) throw new Error(`${ENGINE_ID} seek: no frame decoded at ${tUs}us`);

    const landed = best as { img: ImageData; ptsUs: number };
    const frame = await digestImageData(landed.img, 0, landed.ptsUs);
    return { landedPtsUs: landed.ptsUs, frame };
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
  ): Promise<MediaBytes> {
    throw new Error(`${ENGINE_ID}: trim is not supported (NA(engine))`);
  }
}

// ── module-level helpers ─────────────────────────────────────────────────────────────────────────

/**
 * Normalize a media-parser parse result into the suite's NormalizedMetadata. media-parser tracks use
 * a fixed 1_000_000 timescale; widths/heights and codec are read off the typed track shapes.
 *
 * When `indexByTrackId` is supplied (demux path) the track list is ordered so tracks[i] is the track
 * whose assigned trackIndex is i — i.e. it matches the packet trackIndex assignment exactly. Without
 * it (probe path) tracks keep media-parser's natural order.
 */
function normalizeMetadata(
  container: import('@remotion/media-parser').MediaParserContainer,
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
    container: parserContainerToCanonical(container),
    durationSec: typeof durationInSeconds === 'number' && Number.isFinite(durationInSeconds)
      ? durationInSeconds
      : null,
    tracks: normalized,
  };

  const tags = flattenMetadata(metadata);
  if (tags && Object.keys(tags).length) meta.tags = tags;

  return meta;
}

function normalizeTrack(t: import('@remotion/media-parser').MediaParserTrack): NormalizedTrack {
  if (t.type === 'video') {
    const out: NormalizedTrack = {
      type: 'video',
      codec: parserToCanonicalVideo(t.codecEnum),
      width: t.width || t.codedWidth || undefined,
      height: t.height || t.codedHeight || undefined,
      rotation: t.rotation || 0,
      bitrate: null,
      language: null,
    };
    if (typeof t.fps === 'number' && Number.isFinite(t.fps) && t.fps > 0) out.fps = t.fps;
    return out;
  }
  if (t.type === 'audio') {
    return {
      type: 'audio',
      codec: parserToCanonicalAudio(t.codecEnum),
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
    const fps = fpsFromTrackPackets(
      packets.filter((packet) => packet.trackIndex === trackIndex),
      metadata.durationSec,
    );
    return fps == null ? track : { ...track, fps };
  });
  return { ...metadata, tracks };
}

function fpsFromTrackPackets(packets: PacketInfo[], durationSec: number | null): number | null {
  if (!packets.length) return null;
  if (durationSec != null && Number.isFinite(durationSec) && durationSec > 0) {
    return packets.length / durationSec;
  }
  if (packets.length < 2) return null;
  const pts = packets.map((packet) => packet.ptsUs).sort((a, b) => a - b);
  const spanUs = pts[pts.length - 1]! - pts[0]!;
  return spanUs > 0 ? ((pts.length - 1) * 1_000_000) / spanUs : null;
}

function isHlsInput(input: MediaInput): boolean {
  const mime = (input.mime || '').toLowerCase();
  if (mime.includes('mpegurl') || mime.includes('x-mpegurl') || mime.includes('vnd.apple.mpegurl')) {
    return true;
  }
  const u = (input.url || input.id || '').toLowerCase();
  return u.endsWith('.m3u8');
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
function buildResize(
  v: TranscodeVideoOptions,
): import('@remotion/webcodecs').ResizeOperation | undefined {
  const hasW = typeof v.width === 'number' && v.width > 0;
  const hasH = typeof v.height === 'number' && v.height > 0;
  if (hasW && hasH) {
    // Exact target box. 'max-height-width' fits within the box preserving aspect; when the source
    // aspect matches the requested box this lands on the exact dimensions, which is the common case
    // for the suite's resize scenarios (e.g. 320x180 from 16:9 sources).
    return { mode: 'max-height-width', maxWidth: v.width as number, maxHeight: v.height as number };
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
