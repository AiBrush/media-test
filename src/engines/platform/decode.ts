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
  samples: Array<{ data: Uint8Array; ptsUs: number; dtsUs: number; keyframe: boolean }>;
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
 * Decode demuxed samples via WebCodecs. Resolves a FrameSink of up to `maxFrames` digests in
 * presentation order. Throws if VideoDecoder is unavailable or the config is unsupported.
 */
export async function decodeWithWebCodecs(input: DecodeInput, opts?: { maxFrames?: number }): Promise<FrameSink> {
  if (!hasVideoDecoder()) throw new Error('VideoDecoder/EncodedVideoChunk unavailable in this realm');
  const maxFrames = opts?.maxFrames ?? Number.POSITIVE_INFINITY;

  const config: VideoDecoderConfig = {
    codec: input.codecString,
    codedWidth: input.codedWidth || undefined,
    codedHeight: input.codedHeight || undefined,
  };
  if (input.description) {
    // description must be a BufferSource; pass a fresh ArrayBuffer slice.
    config.description = input.description.slice().buffer;
  }

  const support = await VideoDecoder.isConfigSupported(config).catch(() => null);
  if (!support || support.supported !== true) {
    throw new Error(`VideoDecoder config not supported: ${input.codecString}`);
  }

  const sink = new RetainingFrameSink();
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
    const submitCap = Number.isFinite(maxFrames) ? Math.min(input.samples.length, maxFrames + 16) : input.samples.length;
    for (let i = 0; i < submitCap; i++) {
      if (decodeError) break;
      const s = input.samples[i]!;
      const chunk = new EncodedVideoChunk({
        type: s.keyframe ? 'key' : 'delta',
        timestamp: s.ptsUs,
        data: s.data,
      });
      decoder.decode(chunk);
    }
    await decoder.flush();
  } catch (e) {
    // Clean up any frames already collected before rethrowing.
    for (const c of collected) c.frame.close();
    throw e instanceof Error ? e : new Error(String(e));
  } finally {
    try {
      decoder.close();
    } catch {
      /* already closed */
    }
  }

  if (decodeError && collected.length === 0) throw decodeError;

  // Emit in presentation (pts) order, capped at maxFrames.
  collected.sort((a, b) => a.ptsUs - b.ptsUs);
  const emit = collected.slice(0, Number.isFinite(maxFrames) ? maxFrames : collected.length);

  // Rasterize + digest the emitted frames; close ALL collected frames afterwards.
  try {
    for (let i = 0; i < emit.length; i++) {
      const { ptsUs, frame } = emit[i]!;
      const img = imageDataFromVideoFrame(frame);
      const digest = await digestImageData(img, i, ptsUs);
      sink.add(digest, img);
    }
  } finally {
    for (const c of collected) {
      try {
        c.frame.close();
      } catch {
        /* ignore */
      }
    }
  }

  return sink;
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
