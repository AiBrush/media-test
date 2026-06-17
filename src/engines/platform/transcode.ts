/**
 * src/engines/platform/transcode.ts — LIMITED transcode + mux for the platform engine.
 *
 * Raw platform APIs can only produce a container that the browser itself can mux. The single
 * reliable, broadly-available path is MediaRecorder, which muxes to WebM (VP8/VP9/Opus, sometimes
 * H.264) or — on Safari — MP4. So `transcode` is implemented as:
 *     decode source frames (<video>) → draw onto a <canvas> → captureStream() → MediaRecorder → webm
 * This is lossy, real-time-bound, container-limited (WebM, maybe MP4), and main-thread/DOM-only.
 *
 * `mux` from pre-encoded EncodedTracks is NOT supportable with raw platform APIs (MediaRecorder
 * re-encodes a live stream; it cannot accept opaque encoded chunks). The adapter declares mux NA.
 *
 * Everything here degrades honestly: if MediaRecorder or canvas.captureStream is unavailable, the
 * caller (adapter) declares transcode NA and these functions are never invoked.
 */

import type { MediaBytes, MediaInput, TranscodeOptions } from '../../core/engine.ts';

/** True when the MediaRecorder + canvas.captureStream path is usable in this realm. */
export function canMediaRecorderTranscode(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
  );
}

/** Pick a MediaRecorder mimeType for a requested container + video codec, or null if none works. */
export function recorderMimeFor(container: string, videoCodec?: string): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return null;
  const c = container.toLowerCase();
  const candidates: string[] = [];
  if (c === 'webm') {
    if (videoCodec === 'vp9') candidates.push('video/webm;codecs=vp9', 'video/webm;codecs=vp09');
    else if (videoCodec === 'vp8') candidates.push('video/webm;codecs=vp8');
    else if (videoCodec === 'av1') candidates.push('video/webm;codecs=av01');
    else if (videoCodec === 'h264') candidates.push('video/webm;codecs=h264');
    candidates.push('video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm');
  } else if (c === 'mp4' || c === 'mov') {
    // Safari supports MP4 recording; Chromium/Firefox generally do not.
    candidates.push('video/mp4;codecs=avc1', 'video/mp4');
  } else {
    return null;
  }
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

/** The canonical container token a recorder mimeType maps to. */
function containerFromRecorderMime(mime: string): string {
  return mime.toLowerCase().includes('mp4') ? 'mp4' : 'webm';
}

/**
 * Transcode by replaying the source through a canvas-captured MediaRecorder. Lossy + real-time.
 * Honors opts.video.{width,height,fps} for the canvas/recorder; audio is dropped (canvas stream is
 * video-only — raw platform cannot easily remux the source audio track through this path).
 *
 * Throws if the recorder path is unavailable or the requested container can't be recorded; the
 * adapter declares those cases NA so this should only run for supported (webm, maybe mp4) requests.
 */
export async function transcodeViaRecorder(input: MediaInput, opts: TranscodeOptions): Promise<MediaBytes> {
  if (!canMediaRecorderTranscode()) {
    throw new Error('platform transcode requires DOM + MediaRecorder + canvas.captureStream');
  }
  const mime = recorderMimeFor(opts.container, opts.video?.codec);
  if (!mime) throw new Error(`platform transcode cannot record container '${opts.container}'`);

  const blob = await input.blob();
  const srcUrl = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = srcUrl;

  try {
    await whenMetadata(video);

    const outW = opts.video?.width ?? video.videoWidth ?? 640;
    const outH = opts.video?.height ?? video.videoHeight ?? 480;
    const fps = opts.video?.fps ?? 30;

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas context unavailable for transcode');

    // Capture at 0 fps so frames are pushed ONLY when we call track.requestFrame(): this decouples
    // capture from requestAnimationFrame (which a backgrounded/automated tab throttles), so the
    // recording is driven by decoded source frames instead of wall-clock rAF ticks.
    const stream = canvas.captureStream(0);
    const recorderOpts: MediaRecorderOptions = { mimeType: mime };
    if (opts.video?.bitrate) recorderOpts.videoBitsPerSecond = opts.video.bitrate;
    const recorder = new MediaRecorder(stream, recorderOpts);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });

    // Request the recorder emit a chunk every 250ms so we always get data even on short clips.
    recorder.start(250);

    // Drive playback and paint frames onto the canvas. We stop at the source's end.
    const videoTrack = stream.getVideoTracks()[0] as (MediaStreamTrack & { requestFrame?: () => void }) | undefined;
    await playAndPaint(video, ctx, outW, outH, videoTrack);

    if (recorder.state !== 'inactive') recorder.stop();
    await stopped;
    // Drain any pending track frames.
    for (const track of stream.getTracks()) track.stop();

    const outMime = mime.split(';')[0] ?? mime;
    const outBlob = new Blob(chunks, { type: outMime });
    const outBytes = new Uint8Array(await outBlob.arrayBuffer());
    return { bytes: outBytes, mime: outMime, container: containerFromRecorderMime(mime) };
  } finally {
    video.removeAttribute('src');
    try {
      video.load();
    } catch {
      /* ignore */
    }
    URL.revokeObjectURL(srcUrl);
  }
}

function whenMetadata(video: HTMLVideoElement, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    const ok = () => {
      if (done) return;
      done = true;
      cleanup();
      resolve();
    };
    const err = () => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error('<video> error before metadata (transcode source)'));
    };
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error('transcode source metadata timeout'));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener('loadedmetadata', ok);
      video.removeEventListener('error', err);
    };
    video.addEventListener('loadedmetadata', ok, { once: true });
    video.addEventListener('error', err, { once: true });
  });
}

type VideoWithRvfc = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: unknown) => void) => number;
};

/**
 * Play the source to its end, painting each decoded frame onto the canvas and pushing it into the
 * capture track via track.requestFrame(). Painting is driven by requestVideoFrameCallback (fires per
 * decoded frame, robust to background-tab rAF throttling) with a setInterval fallback. Resolves on
 * 'ended'.
 */
function playAndPaint(
  video: HTMLVideoElement,
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  track?: MediaStreamTrack & { requestFrame?: () => void },
): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    let interval = 0;
    const rvfc = (video as VideoWithRvfc).requestVideoFrameCallback?.bind(video);

    const paint = () => {
      if (done) return;
      try {
        ctx.drawImage(video, 0, 0, w, h);
        // Push the freshly-painted canvas content as a captured frame (no-op if unsupported).
        track?.requestFrame?.();
      } catch {
        /* a paint can fail transiently (e.g. between seeks); keep going */
      }
    };

    const onFrame = () => {
      if (done) return;
      paint();
      rvfc?.(onFrame);
    };

    const onEnded = () => {
      if (done) return;
      paint(); // capture the final frame
      done = true;
      cleanup();
      resolve();
    };
    const onErr = () => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error('<video> error during transcode playback'));
    };
    // Hard cap so a stuck stream can't hang forever (10 min ceiling; real assets are short).
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      resolve(); // resolve with whatever was recorded rather than reject on cap
    }, 10 * 60 * 1000);
    const cleanup = () => {
      clearTimeout(timer);
      if (interval) clearInterval(interval);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onErr);
    };

    video.addEventListener('ended', onEnded);
    video.addEventListener('error', onErr);

    if (rvfc) {
      rvfc(onFrame);
    } else {
      // Fallback: paint on a wall-clock interval (best effort under throttling).
      interval = setInterval(paint, 33) as unknown as number;
    }
    paint();
    // A play() rejection (e.g. autoplay policy) is NOT fatal: the element is muted and we still
    // advance frames via requestVideoFrameCallback / the interval, and resolve on 'ended'. Only a
    // genuine media 'error' event aborts. If play() is rejected we manually pump currentTime so the
    // 'ended' event still fires.
    void video.play().catch(() => {
      pumpManually();
    });

    // Manual frame pump for environments where play() is blocked: step currentTime to the end.
    function pumpManually(): void {
      if (done) return;
      const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      const step = () => {
        if (done) return;
        if (dur > 0 && video.currentTime >= dur - 0.001) {
          onEnded();
          return;
        }
        paint();
        try {
          video.currentTime = Math.min(dur || video.currentTime + 0.1, video.currentTime + 0.1);
        } catch {
          /* ignore */
        }
        setTimeout(step, 50);
      };
      step();
    }
  });
}
