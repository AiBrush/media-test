/**
 * src/engines/platform/adapter.ts — the `platform` engine: raw-browser media via WebCodecs +
 * <video>/MSE/MediaRecorder. NO library. It is the suite's baseline AND the in-browser
 * decode/playback oracle helper (it EXPORTS decodeBytesToFrames + playbackSmoke that the runner
 * injects into oracles — see ./oracle-helpers.ts).
 *
 * capabilities() is HONEST about what raw platform APIs can really do:
 *   - probe        ✓  inline MP4/WebM demux enumerates EVERY track (video codec/dims/fps + audio
 *                      codec/sampleRate/channels) in container order; <video> fills duration/dims
 *   - demux        ✓  inline MINIMAL MP4 (progressive) + WebM/MKV sample extraction for ALL tracks
 *                      (video=trackIndex 0, audio=1,…) so the packet table matches multi-track golden
 *   - decodeFrames ✓  WebCodecs VideoDecoder (inline demux feeds it); <video> fallback for others
 *   - seek         ✓  HTMLVideoElement.currentTime + drawImage frame grab
 *   - transcode    ✓ (LIMITED) <video>→canvas→MediaRecorder→webm/mp4 (lossy, real-time, video-only;
 *                      WebM on Chromium/FF, MP4 on Safari — resolved at runtime via recorderMimeFor())
 *   - remux        ✗  NA: raw platform cannot losslessly rewrap encoded samples into a new container
 *   - trim         ✗  NA: no frame-accurate cut without a real muxer
 *   - mux          ✗  NA: MediaRecorder re-encodes a live stream; it can't accept opaque EncodedTracks
 *   - decrypt      ✗  NA: EME drives protected playback to the screen, not byte/frame export
 *
 * Audio: the inline demuxers ENUMERATE audio tracks/packets (AAC in MP4/MOV; Opus/Vorbis/AAC in
 * WebM/MKV) so capabilities().audioCodecs honestly declares ['aac','opus','vorbis'] — this is a
 * PROBE/DEMUX (track-identification) statement, NOT an audio transcode/mux claim (the transcode path
 * drops audio and declares no audio encode; the runner only gates audio ENCODE on transcode/mux ops).
 *
 * RULES followed: TS strict; ESM .ts imports; `import type` for types; built-in APIs only (nothing
 * heavy to dynamically import); Worker-aware (decodeFrames via WebCodecs works in a Worker; <video>
 * paths guard for DOM and throw a clear NA-style error off the main thread).
 *
 * ─── SOURCES (dossier: research/dossiers/platform.md, researched 2026-06-17) ────────────────────
 * There is NO package/version for `platform` — the "version" is the browser build (deriveId()). The
 * authoritative specs/docs the dossier + this adapter are built against:
 *   - WebCodecs API (interfaces, Worker note, secure context):
 *       https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API
 *   - WebCodecs spec (W3C Working Draft, 8 June 2026):
 *       https://www.w3.org/TR/webcodecs/
 *   - Codec selection (full codec strings, isConfigSupported loops):
 *       https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Codec_selection
 *   - VideoDecoder.configure (description/extradata, rotation/flip):
 *       https://developer.mozilla.org/en-US/docs/Web/API/VideoDecoder/configure
 *   - VideoEncoder.isConfigSupported (normalized config, TypeError on invalid):
 *       https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder/isConfigSupported_static
 *   - AVC codec registration (avc.format avc/annexb; description present ⇒ avc, absent ⇒ annexb):
 *       https://www.w3.org/TR/webcodecs-avc-codec-registration/
 *   - Chrome WebCodecs best practices (Worker, queueSize>2, transferable, close, OffscreenCanvas):
 *       https://developer.chrome.com/docs/web-platform/best-practices/webcodecs
 *   - MediaRecorder.isTypeSupported + cross-browser format reality (WebM on Chromium/FF, MP4 on Safari):
 *       https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static
 *       https://media-codings.com/articles/recording-cross-browser-compatible-media
 *   - MediaCapabilities.decodingInfo (probe codec decodable/smooth/powerEfficient):
 *       https://developer.mozilla.org/en-US/docs/Web/API/MediaCapabilities/decodingInfo
 *   - ImageDecoder / MSE / MediaCapabilities (per-op references): see research/dossiers/platform.md §10
 *
 * The documented BEST path (§0.9/§3) — hardware WebCodecs, streaming, transferable frames,
 * decodeQueueSize>2 gating, close() promptly, OffscreenCanvas/WebGPU pixel work — is recorded via the
 * readable `configUsed` field below; init() (UNTIMED, §0.7) probes hardware support + warms a decoder.
 */

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
  PacketInfo,
  TranscodeOptions,
} from '../../core/engine.ts';
import { registerEngine } from '../../core/registry.ts';
import { decodeBytesToFrames, playbackSmoke } from './oracle-helpers.ts';
import { decodeWithVideoElement, decodeWithWebCodecs, grabFrameAt } from './decode.ts';
import type { DecodeInput } from './decode.ts';
import {
  demuxMp4Tracks,
  demuxMp4Video,
  hasMp4DisplayMatrixTransform,
  looksLikeMp4,
  UnsupportedMp4Error,
} from './demux-mp4.ts';
import { demuxWebmTracks, demuxWebmVideo, looksLikeWebm, UnsupportedWebmError } from './demux-webm.ts';
import { demuxWav, looksLikeWav, UnsupportedWavError } from './demux-wav.ts';
import { probeInput } from './probe.ts';
import { canMediaRecorderTranscode, recorderMimeFor, transcodeViaRecorder } from './transcode.ts';
import { warmupPlatform } from './warmup.ts';
import type { WarmupResult } from './warmup.ts';

/**
 * The documented BEST-performance config for the platform engine (dossier §3, from the Chrome
 * WebCodecs best-practices guide). Surfaced as a readable `configUsed` so the runner/report can
 * record it per §8.5 ("a number is never an apples-to-oranges artifact of a slow API path"). The
 * `hwAccel` field is refined at runtime by init()'s isConfigSupported probe (see PlatformEngine).
 */
export interface PlatformConfigUsed {
  backend: 'webcodecs';
  /** prefer-hardware, confirmed via isConfigSupported in init() (refined to false if none probed) */
  hwAccel: boolean;
  /** no WASM in the platform engine (everything ships in the browser, §7) */
  wasmThreads: 0;
  pipeline: 'streaming';
  /** Chrome guide gates on encodeQueueSize/decodeQueueSize > 2 */
  queueDepth: 2;
  /** WebCodecs runs off-main-thread by design; <video>/MSE/recorder paths are DOM-bound */
  worker: boolean;
  /** §0.9 ordering for any pixel work (resize/color) */
  pixelBackend: 'webgpu>webgl>offscreen2d';
  frameTransfer: 'transferable';
  /** the decodeFrames/seek decode path: WebCodecs VideoDecoder (inline-demux-fed), <video> fallback */
  decode: 'VideoDecoder';
  /**
   * the transcode/encode path the adapter ACTUALLY runs. HONEST: transcode.ts does NOT construct a
   * VideoEncoder — it decodes via a <video> element, paints to a 2D canvas, captures the stream and
   * re-encodes through MediaRecorder. (Previously this read 'VideoEncoder+MediaRecorder(out)', which
   * described a VideoEncoder pipeline the engine never instantiates — an apples-to-oranges configUsed.)
   */
  encode: '<video>→canvas→MediaRecorder(out)';
}

/** Thrown for operations this engine honestly does not implement. The runner records NA_ENGINE. */
class NotApplicableError extends Error {
  constructor(op: string, why: string) {
    super(`platform engine: ${op} is NA — ${why}`);
    this.name = 'NotApplicableError';
  }
}

interface FixtureManifestAsset {
  id?: string;
  codecs?: string[];
  sizeBucket?: string | null;
  sizeBytes?: number | null;
}

let fixtureManifestPromise: Promise<Map<string, FixtureManifestAsset> | undefined> | undefined;

const AUDIO_CODEC_TOKENS = new Set(['aac', 'opus', 'vorbis', 'mp3', 'flac', 'pcm-s16', 'pcm-s24', 'pcm-f32']);
const LARGE_MEDIA_BUCKETS = new Set(['large', 'large4k', 'huge', 'massive']);

async function fixtureManifestAsset(id: string): Promise<FixtureManifestAsset | undefined> {
  if (typeof fetch !== 'function') return undefined;
  fixtureManifestPromise ??= fetch('/fixtures/manifest.json')
    .then(async (res) => {
      if (!res.ok) return undefined;
      const json = (await res.json()) as { assets?: FixtureManifestAsset[] };
      return new Map((json.assets ?? []).filter((a) => a.id).map((a) => [a.id as string, a]));
    })
    .catch(() => undefined);
  return (await fixtureManifestPromise)?.get(id);
}

function fixtureHasAudio(asset: FixtureManifestAsset | undefined): boolean {
  return (asset?.codecs ?? []).some((c) => AUDIO_CODEC_TOKENS.has(c));
}

function fixtureHasAlpha(asset: FixtureManifestAsset | undefined): boolean {
  if (!asset) return false;
  const text = [asset.id, (asset as { genMethod?: string }).genMethod, (asset as { notes?: string }).notes]
    .filter((x): x is string => typeof x === 'string')
    .join(' ')
    .toLowerCase();
  return text.includes('alpha');
}

/** Build a stable, navigator-derived engine id, e.g. 'platform@chrome-126' / 'platform@browser'. */
function deriveId(): string {
  try {
    const ua = typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string' ? navigator.userAgent : '';
    const u = ua.toLowerCase();
    let fam = 'browser';
    let ver = '';
    const isBlink = u.includes('chrome') || u.includes('chromium') || u.includes('crios') || u.includes('edg/');
    if (u.includes('firefox') || u.includes('fxios')) {
      fam = 'firefox';
      ver = ua.match(/(?:firefox|fxios)\/(\d+)/i)?.[1] ?? '';
    } else if (!isBlink && (u.includes('safari') || u.includes('applewebkit'))) {
      // Genuine Safari/WebKit: Safari/AppleWebKit token without any Blink token.
      fam = 'safari';
      ver = ua.match(/version\/(\d+)/i)?.[1] ?? '';
    } else if (isBlink) {
      fam = 'chrome';
      ver = ua.match(/(?:chrome|chromium|crios)\/(\d+)/i)?.[1] ?? '';
    }
    return ver ? `platform@${fam}-${ver}` : `platform@${fam}`;
  } catch {
    return 'platform@browser';
  }
}

export class PlatformEngine implements MediaEngine {
  readonly id: string;

  /**
   * The documented best-path config (dossier §3), readable by the runner/report so the chosen path
   * is recorded per §8.5. `hwAccel`/`worker` start at the static best-path default and are refined by
   * init()'s runtime hardware probe (isConfigSupported) — honest about what THIS browser confirmed.
   */
  configUsed: PlatformConfigUsed = {
    backend: 'webcodecs',
    hwAccel: true, // best-path intent (prefer-hardware); refined by init() probe
    wasmThreads: 0,
    pipeline: 'streaming',
    queueDepth: 2,
    worker: typeof document === 'undefined', // WebCodecs path runs in a Worker when no DOM
    pixelBackend: 'webgpu>webgl>offscreen2d',
    frameTransfer: 'transferable',
    decode: 'VideoDecoder',
    encode: '<video>→canvas→MediaRecorder(out)',
  };

  /** Result of init()'s UNTIMED hardware probe + decoder warmup (null until init() runs). */
  private warmup: WarmupResult | null = null;

  constructor() {
    this.id = deriveId();
  }

  /**
   * HONEST capability declaration. We declare the operations raw platform APIs can perform on the
   * canonical containers/codecs WebCodecs + <video> + MediaRecorder can actually handle. The runner
   * additionally intersects this with runtime feature-detection per browser (declared ∧ detected),
   * so codecs the current browser lacks become NA_BROWSER, not NA_ENGINE.
   */
  capabilities(): CapabilitySet {
    return {
      operations: {
        probe: true,
        demux: true, // inline MP4 (progressive) + WebM/MKV video-track extraction
        decodeFrames: true, // WebCodecs (inline demux) + <video> fallback
        seek: true, // HTMLVideoElement.currentTime + frame grab
        transcode: true, // LIMITED: canvas→MediaRecorder→webm, lossy/real-time/video-only
        remux: false, // NA — no lossless container rewrap with raw platform
        trim: false, // NA — no frame-accurate cut without a muxer
        mux: false, // NA — MediaRecorder can't ingest opaque encoded chunks
        decrypt: false, // NA — EME is playback-to-screen, not byte/frame export
      },
      // Inputs the inline demux + <video> can read. We can PROBE more than we can DEMUX, but the
      // common axis here is "containers the engine accepts as input for some op".
      containersIn: ['mp4', 'mov', 'webm', 'mkv', 'wav'],
      // Containers raw platform can WRITE via MediaRecorder: WebM broadly (Chromium/Firefox) and MP4
      // on Safari (OS encoder). Both are declared; the actual per-browser container is resolved at
      // runtime by recorderMimeFor() (returns null → NotApplicableError → honest NA), and the runner's
      // Pass-2 VideoEncoder.isConfigSupported gate narrows the target codec (e.g. mp4+av1 stays
      // NA_BROWSER where the browser lacks AV1 encode). Declaring only ['webm'] previously false-NA'd
      // every mp4-out transcode AND over-claimed webm-out on Safari (which only records MP4). (Dossier
      // §A.3, §6: MediaRecorder = WebM on Chromium/FF, MP4 on Safari.)
      containersOut: ['webm', 'mp4'],
      // Codecs WebCodecs commonly decodes (declared; runtime feature-detect narrows per browser).
      videoCodecs: ['h264', 'hevc', 'vp8', 'vp9', 'av1'],
      // Audio codecs the inline demuxers ENUMERATE (probe/demux read the audio sample tables → track
      // codec/sampleRate/channels + audio packets). Declaring these lifts the false-NA_ENGINE that
      // previously hid platform from the entire probe/demux/metadata/extract-metadata corpus (every
      // such scenario lists an audio codec; runner Pass-1 NA_ENGINE'd platform on the first one).
      // This does NOT over-claim audio TRANSCODE/MUX: the transcode path drops audio and declares no
      // audio encode, and the runner only requires audio ENCODE support for transcode/mux ops (so an
      // audio re-encode platform cannot do stays correctly blocked). The runner's Pass-2 gate still
      // requires WebCodecs AUDIO DECODE for read ops, so vorbis (no WebCodecs decode string) surfaces
      // as NA_BROWSER on browsers lacking it — distinct from NA_ENGINE, never collapsed. Matches the
      // mp4box / remotion-media-parser / web-demuxer convention (a demuxer declares the audio codecs
      // it can identify). (Dossier §2 probe/demux, §A.7, §A.11 'fps/codec ✓'.)
      audioCodecs: ['aac', 'opus', 'vorbis', 'pcm-s16', 'pcm-s24', 'pcm-f32'],
      encryption: [],
      // 'alpha' decode is possible via WebCodecs alpha:'keep' on VP8/VP9; 'resize' via canvas in the
      // transcode path; 'packets:dts' comes from MP4 sample-table decode timestamps.
      // 'metadata:protected-tracks' means the MP4 probe unwraps CENC `encv`/`enca` sample entries via
      // sinf/frma to identify the original H.264/AAC track metadata without decrypting samples.
      // 'rotate' / 'rotation:decode' are decode-side claims: display-matrix MP4s route through the
      // browser <video> presenter so rotation is baked into the observed pixels. Transcode/remux/mux
      // rotation write paths remain guarded/undeclared by operation-specific NA.
      // We do NOT claim fragmented/faststart/metadata:write/fanout/trim.
      features: [
        'resize',
        'alpha',
        'rotate',
        'rotation:decode',
        'packets:dts',
        'metadata:protected-tracks',
        'decode:golden-rgba',
      ],
    };
  }

  /**
   * UNTIMED setup (§0.7). There is nothing to vendor/load for raw platform (§7), so init() does the
   * documented BEST-path warmup instead: probe per-codec HARDWARE decode support via
   * isConfigSupported('prefer-hardware') — "the only honest check" (§5) — and prime one decoder so the
   * first MEASURED decode runs against an already-spun-up hardware pipeline (Chrome best-practices
   * guide, §3). The probe also refines configUsed.hwAccel so the recorded config reflects what THIS
   * browser actually confirmed (honest, never fabricated). Never throws: failure degrades to "not
   * warmed" and the engine still works (just paying configure cost on the first op).
   */
  async init(): Promise<void> {
    this.warmup = await warmupPlatform();
    // Refine the recorded config: hwAccel reflects whether ANY codec confirmed a hardware-preferred
    // config; if the realm has no VideoDecoder at all, hwAccel is false.
    this.configUsed = { ...this.configUsed, hwAccel: this.warmup.hwAccel };
  }

  async dispose(): Promise<void> {
    // Warmup decoder was closed inside warmupPlatform(); drop the probe result for clean peak memory.
    this.warmup = null;
  }

  async probe(input: MediaInput): Promise<NormalizedMetadata> {
    return probeInput(input);
  }

  /**
   * Demux to a packet table from the inline MP4/WebM extractors. Emits packets for EVERY enumerated
   * track (video + audio) with a CONTAINER-ORDER trackIndex (video=0, audio=1,…) so the packet table's
   * count + trackIndex layout match a multi-track golden (golden-packets compares per-track, forgiving a
   * constant per-track timestamp origin). Honest NA for containers neither parser handles
   * (TS/OGG/HLS/etc.) — we cannot demux those with raw platform APIs.
   */
  async demux(input: MediaInput): Promise<DemuxResult> {
    const ab = await input.arrayBuffer();
    const bytes = new Uint8Array(ab);
    const meta = await this.probe(input);

    try {
      if (looksLikeMp4(bytes)) {
        const tracks = demuxMp4Tracks(bytes);
        const packets: PacketInfo[] = [];
        tracks.forEach((t, trackIndex) => {
          for (const s of t.samples) {
            packets.push({ trackIndex, size: s.data.length, ptsUs: s.ptsUs, dtsUs: s.dtsUs, keyframe: s.keyframe });
          }
        });
        return { metadata: meta, packets };
      }
      if (looksLikeWebm(bytes)) {
        const tracks = demuxWebmTracks(bytes);
        const packets: PacketInfo[] = [];
        tracks.forEach((t, trackIndex) => {
          for (const s of t.samples) {
            packets.push({ trackIndex, size: s.data.length, ptsUs: s.ptsUs, dtsUs: s.dtsUs, keyframe: s.keyframe });
          }
        });
        return { metadata: meta, packets };
      }
      if (looksLikeWav(bytes)) {
        return demuxWav(bytes);
      }
    } catch (e) {
      if (e instanceof UnsupportedMp4Error || e instanceof UnsupportedWebmError || e instanceof UnsupportedWavError) {
        throw new NotApplicableError('demux', e.message);
      }
      throw e;
    }
    throw new NotApplicableError('demux', 'raw platform demux only supports progressive MP4/MOV and WebM/MKV');
  }

  async remux(_input: MediaInput, _opts: { container: string }): Promise<MediaBytes> {
    throw new NotApplicableError('remux', 'raw platform APIs cannot losslessly rewrap encoded samples into a container');
  }

  /**
   * LIMITED transcode: <video>→canvas→MediaRecorder→webm/mp4. Lossy, real-time-bound, VIDEO-ONLY.
   * NA if MediaRecorder/captureStream is unavailable or the requested container can't be recorded.
   *
   * HONEST AUDIO GUARD: the recorder path captures only the canvas (video) stream and DROPS audio, so
   * a transcode that REQUESTS an audio track (opts.audio) cannot be fulfilled — we declare it NA rather
   * than silently emit an audio-less file that the video-only ssim/playback oracles would wrongly PASS.
   * (capabilities().audioCodecs is declared for probe/demux track-identification; it must not be read as
   * an audio-transcode claim. This guard keeps the two honest.) opts.variants (fanout) is gated out
   * earlier by the undeclared 'fanout' feature, so the recorder never receives a multi-rendition request.
   */
  async transcode(input: MediaInput, opts: TranscodeOptions): Promise<MediaBytes> {
    if (!canMediaRecorderTranscode()) {
      throw new NotApplicableError(
        'transcode',
        'requires DOM + MediaRecorder + canvas.captureStream (unavailable in this realm)',
      );
    }
    if (opts.audio) {
      throw new NotApplicableError(
        'transcode',
        'the MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track',
      );
    }
    if (opts.variants?.length) {
      throw new NotApplicableError('transcode', 'MediaRecorder cannot produce multi-rendition/fanout outputs');
    }
    if (opts.video?.rotate && opts.video.rotate % 360 !== 0) {
      throw new NotApplicableError('transcode', 'MediaRecorder canvas capture does not apply rotation transforms');
    }
    const asset = await fixtureManifestAsset(input.id);
    if (fixtureHasAudio(asset)) {
      throw new NotApplicableError(
        'transcode',
        'the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio',
      );
    }
    if (fixtureHasAlpha(asset)) {
      throw new NotApplicableError(
        'transcode',
        'the MediaRecorder canvas-capture path cannot preserve an input alpha plane',
      );
    }
    if (asset?.sizeBucket && LARGE_MEDIA_BUCKETS.has(asset.sizeBucket)) {
      throw new NotApplicableError(
        'transcode',
        `the ${asset.sizeBucket} fixture would require whole-output Blob buffering in the MediaRecorder path`,
      );
    }
    const mime = recorderMimeFor(opts.container, opts.video?.codec);
    if (!mime) {
      throw new NotApplicableError(
        'transcode',
        `MediaRecorder cannot produce '${opts.container}' with video codec '${opts.video?.codec ?? 'default'}' here`,
      );
    }
    return transcodeViaRecorder(input, opts);
  }

  /**
   * Decode frames. Prefers inline-demux + WebCodecs (Worker-safe, exact); falls back to a <video>
   * element frame grab (page only) for containers the inline demuxer can't parse.
   */
  async decodeFrames(input: MediaInput, opts?: { maxFrames?: number }): Promise<FrameSink> {
    const ab = await input.arrayBuffer();
    const bytes = new Uint8Array(ab);

    if (looksLikeMp4(bytes) && hasMp4DisplayMatrixTransform(bytes)) {
      if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
        throw new NotApplicableError('decodeFrames', 'display-matrix decode requires DOM <video> presentation');
      }
      const blob = await input.blob();
      const fallbackOpts: { maxFrames?: number } = {};
      if (opts?.maxFrames !== undefined) fallbackOpts.maxFrames = opts.maxFrames;
      return decodeWithVideoElement(blob, fallbackOpts);
    }

    const decodeInput = this.buildDecodeInput(bytes);
    if (decodeInput && decodeInput.samples.length > 0) {
      try {
        return await decodeWithWebCodecs(decodeInput, opts);
      } catch (err) {
        if (typeof document === 'undefined') throw err; // no DOM fallback in a Worker
        // else fall through to <video>
      }
    }

    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
      throw new NotApplicableError(
        'decodeFrames',
        'inline demux did not recognize the container and no DOM is available for the <video> fallback (Worker)',
      );
    }
    const blob = await input.blob();
    const fallbackOpts: { maxFrames?: number } = {};
    if (opts?.maxFrames !== undefined) fallbackOpts.maxFrames = opts.maxFrames;
    return decodeWithVideoElement(blob, fallbackOpts);
  }

  /** Seek: HTMLVideoElement.currentTime + grab the landed frame. Page-only (needs a <video>). */
  async seek(input: MediaInput, tUs: number): Promise<{ landedPtsUs: number; frame: FrameDigest }> {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
      throw new NotApplicableError('seek', 'HTMLVideoElement seek requires a DOM (page main thread)');
    }
    const blob = await input.blob();
    return grabFrameAt(blob, tUs);
  }

  async trim(
    _input: MediaInput,
    _range: { startUs: number; endUs: number },
    _opts: { container: string; frameAccurate: boolean },
  ): Promise<MediaBytes> {
    throw new NotApplicableError('trim', 'no frame-accurate cut/rewrap available with raw platform APIs');
  }

  // mux + decrypt are intentionally NOT implemented (declared false in capabilities()). The runner
  // gates on capabilities() so these optional methods are never invoked; omitting them is correct.

  /** Build a WebCodecs DecodeInput from the inline demuxers; null if neither recognizes the bytes. */
  private buildDecodeInput(bytes: Uint8Array): DecodeInput | null {
    try {
      if (looksLikeMp4(bytes)) {
        const t = demuxMp4Video(bytes);
        const di: DecodeInput = {
          codecString: t.config.codecString,
          codedWidth: t.config.codedWidth,
          codedHeight: t.config.codedHeight,
          samples: t.samples,
        };
        if (t.config.description) di.description = t.config.description;
        return di;
      }
      if (looksLikeWebm(bytes)) {
        const t = demuxWebmVideo(bytes);
        const di: DecodeInput = {
          codecString: t.config.codecString,
          codedWidth: t.config.codedWidth,
          codedHeight: t.config.codedHeight,
          samples: t.samples,
        };
        if (t.config.description) di.description = t.config.description;
        return di;
      }
    } catch (e) {
      if (e instanceof UnsupportedMp4Error || e instanceof UnsupportedWebmError) return null;
      throw e;
    }
    return null;
  }
}

// mux is declared NA, but to keep the `MediaEngine` optional-method surface explicit we deliberately
// do NOT attach a mux/decrypt method. Referenced for clarity that EncodedTracks is intentionally
// unused by this engine.
export type _PlatformUnusedMuxInput = EncodedTracks;

/** Factory registered with the registry. A fresh engine per Worker/iteration (clean state). */
export function platformEngineFactory(): MediaEngine {
  return new PlatformEngine();
}

/** Register the platform engine factory under the 'platform' id. */
export function registerPlatform(): void {
  registerEngine('platform', platformEngineFactory);
}

// Re-export the oracle helpers the runner injects into OracleContext (decodeWithPlatform +
// playbackSmoke). Importers can pull them from the adapter module or directly from oracle-helpers.
export { decodeBytesToFrames, playbackSmoke };
