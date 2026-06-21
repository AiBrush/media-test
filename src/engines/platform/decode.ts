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

import type { FrameDigest, FrameSink } from '../../core/engine.ts';
import { digestImageData } from './digest.ts';
import { imageDataFromVideoElement, imageDataFromVideoFrame } from './raster.ts';

/** Shape the decoder driver needs from either demuxer. */
export interface DecodeInput {
  codecString: string;
  codedWidth: number;
  codedHeight: number;
  description?: Uint8Array;
  samples: Array<{ data: Uint8Array; alpha?: Uint8Array; ptsUs: number; dtsUs: number; keyframe: boolean }>;
}

/** A frame sink that also retains ImageData for getPixels (SSIM/PSNR oracles need raw pixels). */
class RetainingFrameSink implements FrameSink {
  frames: FrameDigest[] = [];
  private pixels: ImageData[] = [];

  add(digest: FrameDigest, img: ImageData): void {
    this.frames.push(digest);
    this.pixels.push(img);
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
export async function decodeWithWebCodecs(input: DecodeInput, opts?: { maxFrames?: number }): Promise<FrameSink> {
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
  try {
    colorFrames = await collectDecodedFrames(config, input.samples, maxFrames, (sample) => sample.data);
    if (hasAlphaSideData) {
      const alphaSamples = input.samples.filter((sample): sample is typeof sample & { alpha: Uint8Array } =>
        !!sample.alpha && sample.alpha.byteLength > 0,
      );
      alphaFrames = await collectDecodedFrames(config, alphaSamples, maxFrames, (sample) => sample.alpha);
    }
  } catch (e) {
    closeCollectedFrames(colorFrames);
    closeCollectedFrames(alphaFrames);
    throw e instanceof Error ? e : new Error(String(e));
  }

  const emit = colorFrames.slice(0, Number.isFinite(maxFrames) ? maxFrames : colorFrames.length);
  const alphaByPts = new Map(alphaFrames.map((entry) => [entry.ptsUs, entry.frame]));

  // Rasterize + digest the emitted frames; close ALL collected frames afterwards.
  try {
    for (let i = 0; i < emit.length; i++) {
      const { ptsUs, frame } = emit[i]!;
      let img = await imageDataFromVideoFrame(frame);
      const alphaFrame = alphaByPts.get(ptsUs);
      if (alphaFrame) {
        const alphaImg = await imageDataFromVideoFrame(alphaFrame);
        img = mergeAlphaPlane(img, alphaImg);
      }
      const digest = await digestImageData(img, i, ptsUs);
      sink.add(digest, img);
    }
  } finally {
    closeCollectedFrames(colorFrames);
    closeCollectedFrames(alphaFrames);
  }

  return sink;
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
      // Stop retaining once we have enough; close extras immediately.
      if (collected.length >= maxFrames) {
        frame.close();
        return;
      }
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

  collected.sort((a, b) => a.ptsUs - b.ptsUs);
  return collected;
}

function mergeAlphaPlane(color: ImageData, alpha: ImageData): ImageData {
  if (color.width !== alpha.width || color.height !== alpha.height) {
    throw new Error(
      `alpha plane dimensions ${alpha.width}x${alpha.height} do not match color frame ` +
        `${color.width}x${color.height}`,
    );
  }
  for (let i = 0; i < color.data.length; i += 4) {
    color.data[i + 3] = alpha.data[i] as number;
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
  opts?: { maxFrames?: number; perFrameTimeoutMs?: number },
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

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : NaN;
    // Choose sample timestamps: spread across duration, or step from 0 if duration unknown.
    const times: number[] = [];
    if (Number.isFinite(duration)) {
      for (let i = 0; i < maxFrames; i++) {
        times.push((duration * i) / Math.max(1, maxFrames));
      }
    } else {
      for (let i = 0; i < maxFrames; i++) times.push(i / 30);
    }

    for (let i = 0; i < times.length; i++) {
      const t = times[i]!;
      await seekTo(video, t, perFrameTimeoutMs);
      const img = imageDataFromVideoElement(video);
      // Use the element's actual currentTime as the pts (µs).
      const ptsUs = Math.round(video.currentTime * 1_000_000);
      const digest = await digestImageData(img, i, ptsUs);
      sink.add(digest, img);
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
  return sink;
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
    await seekTo(video, tUs / 1_000_000, timeoutMs);
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

function seekTo(el: HTMLVideoElement, t: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    const onSeeked = () => {
      if (done) return;
      done = true;
      cleanup();
      resolve();
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
    };
    el.addEventListener('seeked', onSeeked, { once: true });
    el.addEventListener('error', onErr, { once: true });
    try {
      el.currentTime = Math.max(0, t);
    } catch (e) {
      done = true;
      cleanup();
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}
