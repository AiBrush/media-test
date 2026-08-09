/**
 * src/engines/platform/decode.ts — WebCodecs VideoDecoder driver + <video>-element fallback frame
 * grabber. Consumes demuxed samples (from demux-mp4 / demux-webm) and produces normalized
 * FrameDigests with on-demand getPixels.
 *
 * Two paths:
 *   1) WebCodecs (preferred, Worker-safe): feed EncodedVideoChunks to a VideoDecoder, rasterize each
 *      VideoFrame to ImageData (raster.ts), digest (digest.ts).
 *   2) <video> element fallback (page only): attach a blob URL, step currentTime, drawImage-grab.
 *      Used for containers the inline demuxer can't parse (e.g. MPEG-TS, fragmented MP4, OGG).
 */

import type { DecodeOptions, FrameDigest, FrameSink } from '../../core/engine.ts';
import { digestImageData } from './digest.ts';
import { imageDataFromVideoElement, imageDataFromVideoFrame } from './raster.ts';

/** Sampling controls used by the neutral oracle decoder, in addition to public engine decode options. */
export interface PlatformDecodeOptions extends DecodeOptions {
  /** Leading presentation prefix by default; bounded whole-program evidence when `uniform`. */
  sampling?: 'prefix' | 'uniform';
  /** Presentation duration known independently by the caller, used only when no demux timeline exists. */
  durationHintSec?: number;
  /** Explicit presentation instants, relative to the first video PTS, for paired comparisons. */
  sampleTimesSec?: readonly number[];
}

/** Shape the decoder driver needs from either demuxer. */
export interface DecodeInput {
  codecString: string;
  codedWidth: number;
  codedHeight: number;
  description?: Uint8Array;
  samples: Array<{ data: Uint8Array; alpha?: Uint8Array; ptsUs: number; dtsUs: number; keyframe: boolean }>;
  selectedTrack?: FrameSink['selectedTrack'];
}

/** Sort decoded output into a deterministic leading presentation-time prefix. */
export function leadingPresentationFramePrefix<T extends { ptsUs: number }>(
  input: readonly T[],
  maxFrames: number,
): T[] {
  const sorted = input
    .map((entry, decodeIndex) => ({ entry, decodeIndex }))
    .sort((a, b) => a.entry.ptsUs - b.entry.ptsUs || a.decodeIndex - b.decodeIndex)
    .map(({ entry }) => entry);
  if (!Number.isFinite(maxFrames)) return sorted;
  return sorted.slice(0, Math.max(0, Math.floor(maxFrames)));
}

export interface VideoElementPresentationAnchor {
  /** Zero-based media-element seek time after subtracting the declared source PTS origin. */
  mediaTimeSec: number;
  /** Original source-timeline PTS retained on the resulting FrameDigest. */
  ptsUs: number;
}

/**
 * Validate and translate an exact source-timeline request for an HTMLMediaElement. The two time
 * domains remain explicit: pixels are presented at `mediaTimeSec`, then labeled with the original
 * `ptsUs`. This prevents a non-zero source PTS origin from either seeking the wrong frame or being
 * silently normalized away in browser-qualified evidence.
 */
export function exactPresentationAnchorsForVideoElement(
  opts?: Pick<DecodeOptions, 'maxFrames' | 'exactPresentationTimes'>,
): VideoElementPresentationAnchor[] | undefined {
  const request = opts?.exactPresentationTimes;
  if (request === undefined) return undefined;
  if (!Number.isSafeInteger(request.originUs)) {
    throw new Error('platform exact presentation origin must be a safe integer number of microseconds');
  }
  if (request.timestampsUs.length === 0) {
    throw new Error('platform exact presentation request must contain at least one timestamp');
  }

  const limit = typeof opts?.maxFrames === 'number' && Number.isFinite(opts.maxFrames)
    ? Math.max(0, Math.floor(opts.maxFrames))
    : request.timestampsUs.length;
  const timestampsUs = request.timestampsUs.slice(0, limit);
  let previousPtsUs: number | undefined;
  return timestampsUs.map((ptsUs) => {
    if (!Number.isSafeInteger(ptsUs)) {
      throw new Error('platform exact presentation timestamps must be safe integer microseconds');
    }
    if (ptsUs < request.originUs) {
      throw new Error(`platform exact presentation timestamp ${ptsUs}us precedes origin ${request.originUs}us`);
    }
    if (previousPtsUs !== undefined && ptsUs <= previousPtsUs) {
      throw new Error('platform exact presentation timestamps must be strictly increasing and unique');
    }
    previousPtsUs = ptsUs;
    return { mediaTimeSec: (ptsUs - request.originUs) / 1_000_000, ptsUs };
  });
}

/**
 * Derive bounded presentation instants from the demuxed timeline. Unlike HTMLMediaElement.duration,
 * this remains usable for headerless/live-style WebM files whose clusters expose valid timestamps
 * but whose container duration is intentionally absent.
 */
export function presentationSampleTimesUs(
  samples: readonly { ptsUs: number }[],
  opts?: Pick<PlatformDecodeOptions, 'maxFrames' | 'sampling' | 'sampleTimesSec'>,
): number[] {
  const finitePts = samples
    .map((sample) => sample.ptsUs)
    .filter((ptsUs) => Number.isFinite(ptsUs))
    .sort((a, b) => a - b);
  if (finitePts.length === 0) return [];

  const requestedLimit = typeof opts?.maxFrames === 'number' && Number.isFinite(opts.maxFrames)
    ? Math.max(0, Math.floor(opts.maxFrames))
    : 8;
  const limit = Math.min(requestedLimit, finitePts.length);
  if (limit === 0) return [];

  const explicit = opts?.sampleTimesSec
    ?.filter((timeSec) => Number.isFinite(timeSec) && timeSec >= 0)
    .slice(0, limit)
    .map((timeSec) => Math.round(timeSec * 1_000_000))
    .sort((a, b) => a - b);
  if (explicit?.length) return explicit;
  if (opts?.sampling !== 'uniform') return [];

  const originUs = finitePts[0]!;
  const distinctPts = finitePts.filter((ptsUs, index) => index === 0 || ptsUs !== finitePts[index - 1]);
  if (distinctPts.length === 1) return [0];
  const deltas = distinctPts
    .slice(1)
    .map((ptsUs, index) => ptsUs - distinctPts[index]!)
    .filter((deltaUs) => deltaUs > 0)
    .sort((a, b) => a - b);
  const cadenceUs = deltas[Math.floor(deltas.length / 2)] ?? 0;
  const presentationWindowUs = Math.max(0, distinctPts[distinctPts.length - 1]! - originUs + cadenceUs);
  const count = Math.min(limit, distinctPts.length);
  return Array.from({ length: count }, (_, index) =>
    Math.round((presentationWindowUs * index) / Math.max(1, count)),
  );
}

export interface PresentationDecodeWindow {
  startIndex: number;
  endIndex: number;
  targetPtsUs: number[];
}

/** Group requested frames by their preceding random-access point so each GOP/prefix is decoded once. */
export function presentationDecodeWindows<T extends { ptsUs: number; keyframe: boolean }>(
  samples: readonly T[],
  relativeTimesUs: readonly number[],
): PresentationDecodeWindow[] {
  if (samples.length === 0 || relativeTimesUs.length === 0) return [];
  const finitePts = samples.map((sample) => sample.ptsUs).filter((ptsUs) => Number.isFinite(ptsUs));
  if (finitePts.length === 0) return [];
  const originUs = Math.min(...finitePts);
  const groups = new Map<number, { targetIndices: number[]; targetPtsUs: Set<number> }>();

  for (const relativeTimeUs of relativeTimesUs) {
    const targetUs = originUs + Math.max(0, relativeTimeUs);
    let targetIndex = 0;
    let targetDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < samples.length; index++) {
      const distance = Math.abs(samples[index]!.ptsUs - targetUs);
      if (distance < targetDistance ||
          (distance === targetDistance && samples[index]!.ptsUs < samples[targetIndex]!.ptsUs)) {
        targetIndex = index;
        targetDistance = distance;
      }
    }

    let startIndex = targetIndex;
    while (startIndex > 0 && !samples[startIndex]!.keyframe) startIndex--;
    if (!samples[startIndex]!.keyframe) {
      const firstKeyframe = samples.findIndex((sample) => sample.keyframe);
      if (firstKeyframe < 0 || firstKeyframe > targetIndex) {
        throw new Error(`platform uniform decode: no keyframe at or before ${targetUs}us`);
      }
      startIndex = firstKeyframe;
    }
    const group = groups.get(startIndex) ?? { targetIndices: [], targetPtsUs: new Set<number>() };
    group.targetIndices.push(targetIndex);
    group.targetPtsUs.add(samples[targetIndex]!.ptsUs);
    groups.set(startIndex, group);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([startIndex, group]) => ({
      startIndex,
      // Sixteen submitted frames cover practical WebCodecs reorder depth after the last target.
      endIndex: Math.min(samples.length, Math.max(...group.targetIndices) + 17),
      targetPtsUs: [...group.targetPtsUs].sort((a, b) => a - b),
    }));
}

/** A frame sink that also retains ImageData for getPixels (SSIM/PSNR oracles need raw pixels). */
class RetainingFrameSink implements FrameSink {
  frames: FrameDigest[] = [];
  decodedColorSpaces: NonNullable<FrameSink['decodedColorSpaces']> = [];
  selectedTrack?: FrameSink['selectedTrack'];
  private pixels: ImageData[] = [];

  add(
    digest: FrameDigest,
    img: ImageData,
    colorSpace?: {
      primaries?: string | null;
      transfer?: string | null;
      matrix?: string | null;
      fullRange?: boolean | null;
    },
  ): void {
    this.frames.push(digest);
    this.pixels.push(img);
    if (colorSpace !== undefined) this.decodedColorSpaces.push(colorSpace);
  }

  getPixels = async (i: number): Promise<ImageData> => {
    const img = this.pixels[i];
    if (!img) throw new Error(`no pixels retained for frame ${i}`);
    return img;
  };
}

function hasVideoDecoder(): boolean {
  return typeof (globalThis as Record<string, unknown>).VideoDecoder === 'function' &&
    typeof (globalThis as Record<string, unknown>).EncodedVideoChunk === 'function';
}

/**
 * Normalize a demuxed codec string into the exact form WebCodecs wants, or return `null` if it is
 * not a usable codec string.
 *
 * WHY this exists: Chrome's `VideoDecoder.isConfigSupported`/`configure` run the `config.codec` value
 * through an internal parser that calls `.trim()` on it. If `codec` is `null` (e.g. a demuxer that
 * could not resolve the codec but still produced a track config), that native path throws an UNCAUGHT
 * `TypeError: Cannot read properties of null (reading 'trim')`, which then surfaces as a confusing
 * oracle failure on otherwise-valid output (observed decoding remotion-webcodecs' VP9/Opus WebM). We
 * trim here and treat a null/empty/whitespace codec as "no usable codec" so the caller can fail
 * cleanly with a clear message instead of letting a null reach the browser's `.trim()`.
 */
function normalizeCodecString(codec: string | null | undefined): string | null {
  if (typeof codec !== 'string') return null;
  const trimmed = codec.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Whether a codec carries its decoder configuration OUT-OF-BAND (in a `description` / extradata box)
 * vs IN-BAND in the bitstream. Only avc1/hvc1 (and AV1's av1C, which Chrome does consume) use a
 * description; VP8/VP9 carry everything in-band and Chrome's WebCodecs VP9 decoder makes NO use of
 * the `description` field.
 *
 * This matters because some muxers (e.g. mediabunny, used by remotion-webcodecs) DO write a WebM
 * `CodecPrivate` for VP9 — the "VP9 Codec Feature Metadata" blob, which is NOT a WebCodecs decoder
 * description. Feeding that blob to `VideoDecoder` as `config.description` for VP9 corrupts the config
 * and lands on the same null-`.trim()` native error. So for VP8/VP9 we DROP any demuxed description.
 */
function codecUsesDescription(codecString: string): boolean {
  const c = codecString.toLowerCase();
  if (c.startsWith('vp8') || c.startsWith('vp08') || c.startsWith('vp9') || c.startsWith('vp09')) {
    return false;
  }
  return true; // avc1/avc3/hvc1/hev1/av01/… — keep the description when one is present
}

/**
 * Decode demuxed samples via WebCodecs. Resolves a FrameSink of up to `maxFrames` digests in
 * presentation order. Throws if VideoDecoder is unavailable or the config is unsupported.
 */
export async function decodeWithWebCodecs(input: DecodeInput, opts?: PlatformDecodeOptions): Promise<FrameSink> {
  if (!hasVideoDecoder()) throw new Error('VideoDecoder/EncodedVideoChunk unavailable in this realm');
  const maxFrames = opts?.maxFrames ?? Number.POSITIVE_INFINITY;

  // Guard the codec string BEFORE it reaches the browser. A null/empty codec would otherwise hit
  // Chrome's native `.trim()` on the codec config and throw an uncaught TypeError; fail cleanly here.
  const codec = normalizeCodecString(input.codecString);
  if (codec === null) {
    throw new Error(
      `platform decode: missing/empty codec string (got ${JSON.stringify(input.codecString)}); ` +
        'cannot configure VideoDecoder',
    );
  }

  const config: VideoDecoderConfig = {
    codec,
    codedWidth: input.codedWidth || undefined,
    codedHeight: input.codedHeight || undefined,
  };
  // Only attach the out-of-band description for codecs that actually use one. For VP8/VP9 the
  // decoder ignores it, and a WebM-style VP9 CodecPrivate (e.g. from mediabunny/remotion-webcodecs)
  // is NOT a valid WebCodecs description — passing it corrupts the config and trips the native
  // null-`.trim()` path. So drop it for VP8/VP9 and keep it for avc1/hvc1/av01.
  if (input.description && input.description.byteLength > 0 && codecUsesDescription(codec)) {
    // description must be a BufferSource; pass a fresh ArrayBuffer slice.
    config.description = input.description.slice().buffer;
  }

  const hasAlphaSideData = input.samples.some((sample) => sample.alpha && sample.alpha.byteLength > 0);

  const support = await VideoDecoder.isConfigSupported(config).catch(() => null);
  if (!support || support.supported !== true) {
    throw new Error(`VideoDecoder config not supported: ${codec}`);
  }

  const sink = new RetainingFrameSink();
  let colorFrames: Array<{ ptsUs: number; frame: VideoFrame }> = [];
  let alphaFrames: Array<{ ptsUs: number; frame: VideoFrame }> = [];
  const sampleTimesUs = presentationSampleTimesUs(input.samples, opts);
  try {
    colorFrames = sampleTimesUs.length > 0
      ? await collectDecodedFramesAtTimes(config, input.samples, sampleTimesUs, (sample) => sample.data)
      : await collectDecodedFrames(config, input.samples, maxFrames, (sample) => sample.data);
    if (hasAlphaSideData) {
      const alphaSamples = input.samples.filter((sample): sample is typeof sample & { alpha: Uint8Array } =>
        !!sample.alpha && sample.alpha.byteLength > 0,
      );
      alphaFrames = sampleTimesUs.length > 0
        ? await collectDecodedFramesAtTimes(config, alphaSamples, sampleTimesUs, (sample) => sample.alpha)
        : await collectDecodedFrames(config, alphaSamples, maxFrames, (sample) => sample.alpha);
    }
  } catch (e) {
    closeCollectedFrames(colorFrames);
    closeCollectedFrames(alphaFrames);
    throw e instanceof Error ? e : new Error(String(e));
  }

  const emit = sampleTimesUs.length > 0
    ? colorFrames
    : colorFrames.slice(0, Number.isFinite(maxFrames) ? maxFrames : colorFrames.length);
  const alphaByPts = new Map(alphaFrames.map((entry) => [entry.ptsUs, entry.frame]));

  // Rasterize + digest the emitted frames; close ALL collected frames afterwards.
  try {
    for (let i = 0; i < emit.length; i++) {
      const { ptsUs, frame } = emit[i]!;
      let img = await imageDataFromVideoFrame(frame);
      const alphaFrame = alphaByPts.get(ptsUs);
      if (alphaFrame) {
        img = mergeAlphaPlane(img, await alphaLumaPlaneFromVideoFrame(alphaFrame, img.width, img.height));
      }
      const digest = await digestImageData(img, i, ptsUs);
      sink.add(digest, img, {
        primaries: frame.colorSpace.primaries,
        transfer: frame.colorSpace.transfer,
        matrix: frame.colorSpace.matrix,
        fullRange: frame.colorSpace.fullRange,
      });
      if (i === 0) opts?.onFirstFrame?.(monotonicNowMs());
    }
  } finally {
    closeCollectedFrames(colorFrames);
    closeCollectedFrames(alphaFrames);
  }

  sink.selectedTrack = input.selectedTrack;
  return sink;
}

/**
 * Decode one bounded random-access window per distinct preceding keyframe. Only the exact requested
 * VideoFrames are retained, so memory is O(samples requested) and even a stream with one keyframe is
 * decoded at most once. Every window begins at a real random-access point and carries reorder lookahead.
 */
async function collectDecodedFramesAtTimes<T extends { ptsUs: number; keyframe: boolean }>(
  config: VideoDecoderConfig,
  samples: T[],
  relativeTimesUs: readonly number[],
  dataForSample: (sample: T) => Uint8Array,
): Promise<Array<{ ptsUs: number; frame: VideoFrame }>> {
  const selected: Array<{ ptsUs: number; frame: VideoFrame }> = [];
  const windows = presentationDecodeWindows(samples, relativeTimesUs);

  try {
    for (const window of windows) {
      selected.push(...await collectDecodedFramesAtPts(
        config,
        samples.slice(window.startIndex, window.endIndex),
        window.targetPtsUs,
        dataForSample,
      ));
    }
    return selected.sort((a, b) => a.ptsUs - b.ptsUs);
  } catch (error) {
    closeCollectedFrames(selected);
    throw error;
  }
}

async function collectDecodedFramesAtPts<T extends { ptsUs: number; keyframe: boolean }>(
  config: VideoDecoderConfig,
  samples: T[],
  targetPtsUs: readonly number[],
  dataForSample: (sample: T) => Uint8Array,
): Promise<Array<{ ptsUs: number; frame: VideoFrame }>> {
  const wanted = new Set(targetPtsUs);
  const retained = new Map<number, VideoFrame>();
  let decodeError: Error | undefined;
  const decoder = new VideoDecoder({
    output: (frame) => {
      if (wanted.has(frame.timestamp) && !retained.has(frame.timestamp)) {
        retained.set(frame.timestamp, frame);
      } else {
        frame.close();
      }
    },
    error: (error) => {
      decodeError = error instanceof Error ? error : new Error(String(error));
    },
  });

  try {
    decoder.configure(config);
    for (const sample of samples) {
      if (decodeError) break;
      decoder.decode(new EncodedVideoChunk({
        type: sample.keyframe ? 'key' : 'delta',
        timestamp: sample.ptsUs,
        data: dataForSample(sample),
      }));
    }
    await decoder.flush();
  } catch (error) {
    for (const frame of retained.values()) frame.close();
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    try {
      decoder.close();
    } catch {
      /* already closed */
    }
  }

  const missing = targetPtsUs.filter((ptsUs) => !retained.has(ptsUs));
  if (missing.length > 0) {
    for (const frame of retained.values()) frame.close();
    throw decodeError ?? new Error(
      `platform uniform decode omitted ${missing.length}/${targetPtsUs.length} requested presentation frame(s)`,
    );
  }
  return targetPtsUs.map((ptsUs) => ({ ptsUs, frame: retained.get(ptsUs)! }));
}

async function collectDecodedFrames<T extends { ptsUs: number; keyframe: boolean }>(
  config: VideoDecoderConfig,
  samples: T[],
  maxFrames: number,
  dataForSample: (sample: T) => Uint8Array,
): Promise<Array<{ ptsUs: number; frame: VideoFrame }>> {
  // Collected (pts, VideoFrame) so we can emit in presentation order after flush.
  const collected: Array<{ ptsUs: number; frame: VideoFrame }> = [];
  let decodeError: Error | undefined;

  const decoder = new VideoDecoder({
    output: (frame) => {
      collected.push({ ptsUs: frame.timestamp, frame });
    },
    error: (e) => {
      decodeError = e instanceof Error ? e : new Error(String(e));
    },
  });

  try {
    decoder.configure(config);

    // Feed chunks in decode order until we have submitted enough to yield maxFrames presentation
    // frames. We submit a bit extra past maxFrames to flush out-of-order (B-frame) reordering.
    const submitCap = Number.isFinite(maxFrames) ? Math.min(samples.length, maxFrames + 16) : samples.length;
    for (let i = 0; i < submitCap; i++) {
      if (decodeError) break;
      const sample = samples[i]!;
      const chunk = new EncodedVideoChunk({
        type: sample.keyframe ? 'key' : 'delta',
        timestamp: sample.ptsUs,
        data: dataForSample(sample),
      });
      decoder.decode(chunk);
    }
    await decoder.flush();
  } catch (e) {
    closeCollectedFrames(collected);
    throw e instanceof Error ? e : new Error(String(e));
  } finally {
    try {
      decoder.close();
    } catch {
      /* already closed */
    }
  }

  if (decodeError && collected.length === 0) {
    closeCollectedFrames(collected);
    throw decodeError;
  }

  // Decoder output order is not necessarily presentation order. Retaining only the first
  // maxFrames callbacks can therefore discard an earlier B/VFR frame that is emitted later. The
  // submitted set is already bounded to maxFrames + reorder look-ahead, so sort that bounded set,
  // retain the true presentation prefix, and close only the surplus frames afterwards.
  const prefix = leadingPresentationFramePrefix(collected, maxFrames);
  const retained = new Set(prefix);
  closeCollectedFrames(collected.filter((entry) => !retained.has(entry)));
  return prefix;
}

async function alphaLumaPlaneFromVideoFrame(
  frame: VideoFrame,
  width: number,
  height: number,
): Promise<Uint8Array> {
  if (frame.displayWidth !== width || frame.displayHeight !== height) {
    throw new Error(
      `alpha plane dimensions ${frame.displayWidth}x${frame.displayHeight} do not match color frame ` +
        `${width}x${height}`,
    );
  }
  // Matroska VPx alpha stores opacity as a grayscale VPx elementary stream. Its decoded Y samples are
  // the alpha bytes; rasterizing that frame as RGBA first applies video-range Y→RGB expansion and changes
  // the plane. Copy the decoder's native planar layout and tighten plane 0; Chromium may reject an
  // explicit I420 conversion even though its native VPx output exposes the same luma plane.
  const storage = new Uint8Array(frame.allocationSize());
  const layout = await frame.copyTo(storage);
  const y = layout[0];
  if (y === undefined || y.offset < 0 || y.stride < width) {
    throw new Error('decoded VPx alpha frame has no valid I420 luma plane');
  }
  const alpha = new Uint8Array(width * height);
  for (let row = 0; row < height; row++) {
    const start = y.offset + row * y.stride;
    const end = start + width;
    if (end > storage.byteLength) throw new Error('decoded VPx alpha luma plane is truncated');
    alpha.set(storage.subarray(start, end), row * width);
  }
  return alpha;
}

function mergeAlphaPlane(color: ImageData, alpha: Uint8Array): ImageData {
  if (alpha.byteLength !== color.width * color.height) {
    throw new Error(
      `alpha plane has ${alpha.byteLength} bytes for color frame ${color.width}x${color.height}`,
    );
  }
  for (let i = 0; i < color.data.length; i += 4) {
    color.data[i + 3] = alpha[i / 4] as number;
  }
  return color;
}

function closeCollectedFrames(frames: Array<{ frame: VideoFrame }>): void {
  for (const item of frames) {
    try {
      item.frame.close();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Fallback frame grab via an HTMLVideoElement (page main thread only). Attaches a blob URL, waits
 * for metadata, then steps currentTime across the duration grabbing up to `maxFrames` frames.
 * Resolves a FrameSink; rejects if no DOM / element never reaches readyState>=2 within the timeout.
 */
export async function decodeWithVideoElement(
  blob: Blob,
  opts?: DecodeOptions & {
    perFrameTimeoutMs?: number;
    selectedTrack?: FrameSink['selectedTrack'];
    durationHintSec?: number;
    /** Explicit presentation instants for paired source/candidate comparisons. */
    sampleTimesSec?: readonly number[];
    /** Optional source-timeline labels paired one-to-one with `sampleTimesSec`. */
    sampleTimestampsUs?: readonly number[];
  },
): Promise<FrameSink> {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    throw new Error('<video> fallback requires a DOM (page main thread)');
  }
  const maxFrames = opts?.maxFrames ?? 8;
  const perFrameTimeoutMs = opts?.perFrameTimeoutMs ?? 3000;

  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.crossOrigin = 'anonymous';
  video.src = url;

  const sink = new RetainingFrameSink();
  try {
    await waitForEvent(video, 'loadedmetadata', perFrameTimeoutMs, 'metadata');
    // Ensure at least one frame is decodable.
    await waitForReadyState(video, 2, perFrameTimeoutMs);

    const duration = typeof opts?.durationHintSec === 'number' &&
        Number.isFinite(opts.durationHintSec) && opts.durationHintSec > 0
      ? opts.durationHintSec
      : Number.isFinite(video.duration) && video.duration > 0 ? video.duration : NaN;
    // Choose sample timestamps: use caller-provided anchored instants when present, otherwise spread
    // across duration (or step from zero if duration is unknown).
    const times: number[] = [];
    const explicitTimes = opts?.sampleTimesSec
      ?.filter((time) => typeof time === 'number' && Number.isFinite(time) && time >= 0)
      .slice(0, maxFrames);
    const explicitTimestampsUs = opts?.sampleTimestampsUs?.slice(0, maxFrames);
    if (explicitTimestampsUs !== undefined) {
      if (explicitTimes === undefined || explicitTimes.length !== explicitTimestampsUs.length) {
        throw new Error(
          '<video> exact presentation labels require one valid source timestamp per explicit media time',
        );
      }
      if (explicitTimestampsUs.some((ptsUs) => !Number.isSafeInteger(ptsUs))) {
        throw new Error('<video> exact presentation labels must be safe integer microseconds');
      }
    }
    if (explicitTimes?.length) {
      times.push(...explicitTimes);
    } else if (Number.isFinite(duration)) {
      for (let i = 0; i < maxFrames; i++) {
        times.push((duration * i) / Math.max(1, maxFrames));
      }
    } else {
      for (let i = 0; i < maxFrames; i++) times.push(i / 30);
    }

    for (let i = 0; i < times.length; i++) {
      const t = times[i]!;
      const observedMediaTime = await seekToPresentedVideoFrame(
        video,
        t,
        perFrameTimeoutMs,
        explicitTimes?.length ? 0.001 : undefined,
      );
      const seekResidualSec = Math.abs(video.currentTime - t);
      if (seekResidualSec > 0.001) {
        throw new Error(
          `<video> seek landed ${(seekResidualSec * 1_000).toFixed(3)}ms from requested presentation anchor`,
        );
      }
      const img = imageDataFromVideoElement(video);
      // Source and candidate comparisons are authored against the same requested presentation anchors.
      // currentTime is checked above as seek evidence, but must not silently become a different pairing key.
      const ptsUs = explicitTimestampsUs?.[i] !== undefined
        ? explicitTimestampsUs[i]! + Math.round(((observedMediaTime ?? t) - t) * 1_000_000)
        : Math.round(t * 1_000_000);
      const digest = await digestImageData(img, i, ptsUs);
      sink.add(digest, img);
      if (i === 0) opts?.onFirstFrame?.(monotonicNowMs());
    }
  } finally {
    video.removeAttribute('src');
    try {
      video.load();
    } catch {
      /* ignore */
    }
    URL.revokeObjectURL(url);
  }
  sink.selectedTrack = opts?.selectedTrack;
  return sink;
}

function monotonicNowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

/** Grab a single frame at tUs via a <video> element (used by the adapter's seek()). */
export async function grabFrameAt(blob: Blob, tUs: number, timeoutMs = 5000): Promise<{ landedPtsUs: number; frame: FrameDigest }> {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    throw new Error('seek frame grab requires a DOM (page main thread)');
  }
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await waitForEvent(video, 'loadedmetadata', timeoutMs, 'metadata');
    await waitForReadyState(video, 1, timeoutMs);
    await seekToPresentedVideoFrame(video, tUs / 1_000_000, timeoutMs);
    const img = imageDataFromVideoElement(video);
    const landedPtsUs = Math.round(video.currentTime * 1_000_000);
    const digest = await digestImageData(img, 0, landedPtsUs);
    return { landedPtsUs, frame: digest };
  } finally {
    video.removeAttribute('src');
    try {
      video.load();
    } catch {
      /* ignore */
    }
    URL.revokeObjectURL(url);
  }
}

// ── <video> element promise helpers ──────────────────────────────────────────────────────────

function waitForEvent(el: HTMLMediaElement, event: string, timeoutMs: number, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    const onOk = () => {
      if (done) return;
      done = true;
      cleanup();
      resolve();
    };
    const onErr = () => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error(`<video> error before ${label}`));
    };
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error(`<video> timed out waiting for ${label} (${timeoutMs}ms)`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      el.removeEventListener(event, onOk);
      el.removeEventListener('error', onErr);
    };
    el.addEventListener(event, onOk, { once: true });
    el.addEventListener('error', onErr, { once: true });
  });
}

function waitForReadyState(el: HTMLMediaElement, min: number, timeoutMs: number): Promise<void> {
  if (el.readyState >= min) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let done = false;
    const check = () => {
      if (done) return;
      if (el.readyState >= min) {
        done = true;
        cleanup();
        resolve();
      }
    };
    const onErr = () => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error('<video> error while awaiting readyState'));
    };
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error(`<video> timed out awaiting readyState>=${min} (${timeoutMs}ms)`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      el.removeEventListener('loadeddata', check);
      el.removeEventListener('canplay', check);
      el.removeEventListener('error', onErr);
    };
    el.addEventListener('loadeddata', check);
    el.addEventListener('canplay', check);
    el.addEventListener('error', onErr);
    check();
  });
}

interface VideoFrameCallbackMetadataLike {
  readonly mediaTime?: number;
}

type VideoFrameCallbackTarget = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (now: number, metadata: VideoFrameCallbackMetadataLike) => void,
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

/**
 * Seek and wait until the media element has submitted the requested frame to its compositor.
 *
 * `seeked` proves only that `currentTime` changed and media data is available; it does not prove that
 * a subsequent `drawImage(video, ...)` will consume the new presentation surface. A callback is armed
 * before the seek so a fast compositor update cannot be missed. If an explicit authored anchor is in
 * use, stale callbacks are ignored until their `mediaTime` identifies that anchor within the supplied
 * tolerance. Callers without exact timeline evidence retain the legacy `seeked` fallback on engines
 * that do not expose requestVideoFrameCallback.
 */
export function seekToPresentedVideoFrame(
  el: HTMLVideoElement,
  t: number,
  timeoutMs: number,
  exactMediaTimeToleranceSec?: number,
): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const callbackTarget = el as VideoFrameCallbackTarget;
    const requestFrame = callbackTarget.requestVideoFrameCallback?.bind(callbackTarget);
    const cancelFrame = callbackTarget.cancelVideoFrameCallback?.bind(callbackTarget);
    const requiresExactPresentation = exactMediaTimeToleranceSec !== undefined;
    if (requiresExactPresentation && requestFrame === undefined) {
      reject(
        new Error(
          '<video> exact presentation anchor requires requestVideoFrameCallback mediaTime evidence',
        ),
      );
      return;
    }

    let done = false;
    // Assigning currentTime to an already-presented exact anchor (notably the first zero-based frame)
    // need not dispatch `seeked`. A fresh matching rVFC is sufficient proof for that no-op seek.
    let seeked = requiresExactPresentation &&
      Math.abs(el.currentTime - Math.max(0, t)) <= exactMediaTimeToleranceSec;
    let callbackPending = false;
    let callbackHandle: number | undefined;
    let observedPresentation = false;
    let observedMediaTime: number | undefined;
    const mediaTimeMatches = (mediaTime: number | undefined): boolean =>
      observedPresentation &&
      (!requiresExactPresentation ||
        (mediaTime !== undefined &&
          Number.isFinite(mediaTime) &&
          Math.abs(mediaTime - t) <= exactMediaTimeToleranceSec));
    const finish = (): void => {
      if (done) return;
      done = true;
      cleanup();
      resolve(observedMediaTime);
    };
    const maybeFinish = (): void => {
      if (!seeked || done) return;
      if (requestFrame === undefined) {
        finish();
        return;
      }
      if (mediaTimeMatches(observedMediaTime)) {
        finish();
        return;
      }
      if (!callbackPending) armFrameCallback();
    };
    const armFrameCallback = (): void => {
      if (requestFrame === undefined || callbackPending || done) return;
      callbackPending = true;
      callbackHandle = requestFrame((_now, metadata) => {
        callbackPending = false;
        callbackHandle = undefined;
        observedPresentation = true;
        observedMediaTime = metadata.mediaTime;
        maybeFinish();
      });
    };
    const onSeeked = () => {
      if (done) return;
      seeked = true;
      maybeFinish();
    };
    const onErr = () => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error('<video> error during seek'));
    };
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error(`<video> seek timed out (${timeoutMs}ms)`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      el.removeEventListener('seeked', onSeeked);
      el.removeEventListener('error', onErr);
      if (callbackHandle !== undefined) {
        try {
          cancelFrame?.(callbackHandle);
        } catch {
          /* already delivered/cancelled */
        }
      }
      callbackHandle = undefined;
      callbackPending = false;
    };
    el.addEventListener('seeked', onSeeked, { once: true });
    el.addEventListener('error', onErr, { once: true });
    try {
      armFrameCallback();
      el.currentTime = Math.max(0, t);
    } catch (e) {
      done = true;
      cleanup();
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}
