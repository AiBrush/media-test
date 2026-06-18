/**
 * src/engines/platform/oracle-helpers.ts — the two helpers the runner injects into oracles
 * (INTERNAL_API.md §Adapter notes / OracleContext):
 *   - decodeBytesToFrames(bytes, opts) → FrameSink  (injected as ctx.decodeWithPlatform)
 *   - playbackSmoke(bytes)            → boolean      (injected as ctx.playbackSmoke)
 *
 * Both take arbitrary container bytes (the OUTPUT of an engine under test) and validate them using
 * only raw platform APIs, so the oracle is library-independent. Decode prefers the inline demux +
 * WebCodecs path (Worker-safe, exact); for containers the inline demuxer can't parse it falls back
 * to a <video> element + drawImage frame grab (page only). Digests are normalized identically to
 * oracles.ts so they compare against golden / other engines.
 */

import type { FrameSink, MediaBytes } from '../../core/engine.ts';
import { decodeWithVideoElement, decodeWithWebCodecs } from './decode.ts';
import type { DecodeInput } from './decode.ts';
import { demuxMp4Video, looksLikeMp4, UnsupportedMp4Error } from './demux-mp4.ts';
import { demuxWebmVideo, looksLikeWebm, UnsupportedWebmError } from './demux-webm.ts';

/** Coerce MediaBytes (or a bare Uint8Array) to a Uint8Array. */
function toBytes(input: MediaBytes | Uint8Array): Uint8Array {
  return input instanceof Uint8Array ? input : input.bytes;
}

/** Best-effort MIME for blob construction, used by the <video> fallback + playback smoke. */
function mimeFor(input: MediaBytes | Uint8Array): string {
  const bytes = toBytes(input);
  // Prefer a sniffed container type — it is more reliable for the <video> element than a possibly
  // missing/wrong `mime` on the MediaBytes (e.g. an engine that emits a WebM blob with a null/blank
  // mime). A correct top-level type ('video/webm' / 'video/mp4') is what makes Chrome pick the right
  // demuxer for the playback fallback.
  if (looksLikeWebm(bytes)) return 'video/webm';
  if (looksLikeMp4(bytes)) return 'video/mp4';
  if (!(input instanceof Uint8Array) && typeof input.mime === 'string' && input.mime.trim().length > 0) {
    return input.mime;
  }
  return 'application/octet-stream';
}

/** True when a DOM <video> + canvas frame grab is possible in this realm (page main thread only). */
function hasDom(): boolean {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

/** Build a DecodeInput from whichever inline demuxer recognizes the bytes; null if neither does. */
function demuxToDecodeInput(bytes: Uint8Array, container?: string): DecodeInput | null {
  const c = container?.toLowerCase();
  // Try by declared container first, then by sniff. Demux errors (unsupported variant) → null.
  const tryMp4 = (): DecodeInput | null => {
    try {
      const t = demuxMp4Video(bytes);
      const di: DecodeInput = {
        codecString: t.config.codecString,
        codedWidth: t.config.codedWidth,
        codedHeight: t.config.codedHeight,
        samples: t.samples,
      };
      if (t.config.description) di.description = t.config.description;
      return di;
    } catch (e) {
      if (e instanceof UnsupportedMp4Error) return null;
      throw e;
    }
  };
  const tryWebm = (): DecodeInput | null => {
    try {
      const t = demuxWebmVideo(bytes);
      const di: DecodeInput = {
        codecString: t.config.codecString,
        codedWidth: t.config.codedWidth,
        codedHeight: t.config.codedHeight,
        samples: t.samples,
      };
      if (t.config.description) di.description = t.config.description;
      return di;
    } catch (e) {
      if (e instanceof UnsupportedWebmError) return null;
      throw e;
    }
  };

  if (c === 'mp4' || c === 'mov' || (c === undefined && looksLikeMp4(bytes))) {
    const di = tryMp4();
    if (di) return di;
  }
  if (c === 'webm' || c === 'mkv' || (c === undefined && looksLikeWebm(bytes))) {
    const di = tryWebm();
    if (di) return di;
  }
  // No declared container match: sniff regardless.
  if (looksLikeMp4(bytes)) {
    const di = tryMp4();
    if (di) return di;
  }
  if (looksLikeWebm(bytes)) {
    const di = tryWebm();
    if (di) return di;
  }
  return null;
}

/**
 * Decode arbitrary container bytes to normalized FrameDigests (+ getPixels).
 *
 * Strategy (robust for engine OUTPUT, which is the fragile case):
 *   1. Try the inline demux (mp4/mov/webm/mkv) → WebCodecs `VideoDecoder`. Exact + Worker-safe.
 *   2. If that throws (codec NA / config rejected) OR produces ZERO frames (e.g. the inline EBML
 *      walk couldn't recover a streaming/unknown-size WebM's frames), AND a DOM is available, fall
 *      back to a <video> element + OffscreenCanvas frame grab. A <video> element can play any
 *      browser-playable container (incl. a VP9/Opus WebM that raw WebCodecs has no demuxer for), so
 *      this is the reliable safety net that unblocked mediabunny's convert-webm-resize output.
 *
 * The WebCodecs path NEVER lets a null/blank codec string reach the browser (which would null-deref
 * on Chrome's internal `codec.trim()`); see decode.ts `normalizeCodecString`. In a Worker (no DOM)
 * the <video> fallback is unavailable, so a WebCodecs failure is surfaced honestly.
 *
 * Injected by the runner as `ctx.decodeWithPlatform`.
 */
export async function decodeBytesToFrames(input: MediaBytes | Uint8Array, opts?: { maxFrames?: number }): Promise<FrameSink> {
  const bytes = toBytes(input);
  const container = input instanceof Uint8Array ? undefined : input.container;

  // demuxToDecodeInput only throws on a non-Unsupported parse error (a bug); a recognized-but-
  // unparseable container returns null. Guard it so any unexpected throw still routes to <video>.
  let decodeInput: DecodeInput | null = null;
  let demuxThrew: unknown;
  try {
    decodeInput = demuxToDecodeInput(bytes, container);
  } catch (e) {
    demuxThrew = e;
  }

  if (decodeInput && decodeInput.samples.length > 0) {
    try {
      const sink = await decodeWithWebCodecs(decodeInput, opts);
      // A non-empty sink is a clean success. An EMPTY sink means the decoder accepted the config but
      // emitted no frames (e.g. samples the inline demux mis-sliced) — prefer the <video> fallback
      // when we can, rather than returning 0 frames to the oracle.
      if (sink.frames.length > 0 || !hasDom()) return sink;
    } catch (err) {
      // WebCodecs couldn't decode (codec unsupported in this browser / config rejected / corrupt
      // samples). Fall back to <video> if we have a DOM; otherwise surface the error honestly.
      if (!hasDom()) throw err;
    }
  }

  // Fallback: <video> element + OffscreenCanvas frame grab. Requires DOM (page main thread).
  if (!hasDom()) {
    if (demuxThrew) throw demuxThrew instanceof Error ? demuxThrew : new Error(String(demuxThrew));
    throw new Error(
      'platform decodeBytesToFrames: could not decode via WebCodecs and no DOM is available for the ' +
        '<video> fallback (running in a Worker?)',
    );
  }
  const blob = new Blob([bytes.slice().buffer], { type: mimeFor(input) });
  const fallbackOpts: { maxFrames?: number } = {};
  if (opts?.maxFrames !== undefined) fallbackOpts.maxFrames = opts.maxFrames;
  return decodeWithVideoElement(blob, fallbackOpts);
}

/**
 * Playback smoke test: attach the bytes to a <video> via a blob URL and return true iff it reaches
 * readyState>=2 (HAVE_CURRENT_DATA) AND advances at least a couple of frames within a timeout.
 * Returns false (never throws) on any failure so an oracle can record a clean negative.
 *
 * Injected by the runner as `ctx.playbackSmoke`. Page main thread only (a <video> needs the DOM);
 * resolves false in a Worker where <video> is unavailable.
 */
export async function playbackSmoke(input: MediaBytes | Uint8Array, opts?: { timeoutMs?: number }): Promise<boolean> {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return false; // <video> unavailable (Worker) — cannot smoke-test; honest false.
  }
  const timeoutMs = opts?.timeoutMs ?? 5000;
  const bytes = toBytes(input);
  const blob = new Blob([bytes.slice().buffer], { type: mimeFor(input) });
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  try {
    return await new Promise<boolean>((resolve) => {
      let settled = false;
      let advancedFrames = 0;
      let lastTime = -1;

      const finish = (result: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          video.pause();
        } catch {
          /* ignore */
        }
        cleanup();
        resolve(result);
      };

      const onTimeUpdate = () => {
        if (video.readyState >= 2 && video.currentTime > lastTime) {
          lastTime = video.currentTime;
          advancedFrames++;
          // readyState>=2 AND advanced a couple of frames ⇒ it plays.
          if (advancedFrames >= 2) finish(true);
        }
      };
      const onError = () => finish(false);
      const onLoadedData = () => {
        // We have at least one frame; try to play to advance the clock.
        void video.play().catch(() => {
          // Autoplay may be blocked; fall back to manually stepping currentTime.
          stepManually();
        });
      };

      // Some engines/containers won't autoplay; nudge currentTime to force frame advance.
      const stepManually = () => {
        if (settled) return;
        if (video.readyState >= 2) {
          const next = Math.min((video.duration || 1) - 0.001, video.currentTime + 1 / 15);
          try {
            video.currentTime = Number.isFinite(next) && next > video.currentTime ? next : video.currentTime + 0.05;
          } catch {
            /* ignore */
          }
        }
      };

      const onSeeked = () => {
        if (video.readyState >= 2) {
          advancedFrames++;
          if (advancedFrames >= 2) finish(true);
          else stepManually();
        }
      };

      const timer = setTimeout(() => finish(advancedFrames >= 2 && video.readyState >= 2), timeoutMs);

      const cleanup = () => {
        video.removeEventListener('timeupdate', onTimeUpdate);
        video.removeEventListener('error', onError);
        video.removeEventListener('loadeddata', onLoadedData);
        video.removeEventListener('seeked', onSeeked);
        video.removeAttribute('src');
        try {
          video.load();
        } catch {
          /* ignore */
        }
        URL.revokeObjectURL(url);
      };

      video.addEventListener('timeupdate', onTimeUpdate);
      video.addEventListener('error', onError);
      video.addEventListener('loadeddata', onLoadedData);
      video.addEventListener('seeked', onSeeked);
    });
  } catch {
    URL.revokeObjectURL(url);
    return false;
  }
}
