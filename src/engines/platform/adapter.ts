/**
 * src/engines/platform/adapter.ts — the `platform` engine: raw-browser media via WebCodecs +
 * <video>/MSE/MediaRecorder. NO library. It is the suite's baseline AND the in-browser
 * decode/playback oracle helper (it EXPORTS decodeBytesToFrames + playbackSmoke that the runner
 * injects into oracles — see ./oracle-helpers.ts).
 *
 * capabilities() is HONEST about what raw platform APIs can really do:
 *   - probe        ✓  <video> metadata (duration/dims) + inline MP4/WebM demux for codec/dims/fps
 *   - demux        ✓  inline MINIMAL MP4 (progressive) + WebM/MKV sample extraction (video track)
 *   - decodeFrames ✓  WebCodecs VideoDecoder (inline demux feeds it); <video> fallback for others
 *   - seek         ✓  HTMLVideoElement.currentTime + drawImage frame grab
 *   - transcode    ✓ (LIMITED) decode→canvas→MediaRecorder→webm (lossy, real-time, video-only)
 *   - remux        ✗  NA: raw platform cannot losslessly rewrap encoded samples into a new container
 *   - trim         ✗  NA: no frame-accurate cut without a real muxer
 *   - mux          ✗  NA: MediaRecorder re-encodes a live stream; it can't accept opaque EncodedTracks
 *   - decrypt      ✗  NA: EME drives protected playback to the screen, not byte/frame export
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
 *   - MediaRecorder.isTypeSupported + cross-browser format reality:
 *       https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static
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
import { demuxMp4Video, looksLikeMp4, UnsupportedMp4Error } from './demux-mp4.ts';
import { demuxWebmVideo, looksLikeWebm, UnsupportedWebmError } from './demux-webm.ts';
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
  decode: 'VideoDecoder';
  encode: 'VideoEncoder+MediaRecorder(out)';
}

/** Thrown for operations this engine honestly does not implement. The runner records NA_ENGINE. */
class NotApplicableError extends Error {
  constructor(op: string, why: string) {
    super(`platform engine: ${op} is NA — ${why}`);
    this.name = 'NotApplicableError';
  }
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
    encode: 'VideoEncoder+MediaRecorder(out)',
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
      containersIn: ['mp4', 'mov', 'webm', 'mkv'],
      // The only container raw platform can WRITE is what MediaRecorder muxes (webm broadly; mp4 on
      // Safari). We declare webm; mp4-out is browser-conditional and surfaces via recorderMimeFor().
      containersOut: ['webm'],
      // Codecs WebCodecs commonly decodes (declared; runtime feature-detect narrows per browser).
      videoCodecs: ['h264', 'hevc', 'vp8', 'vp9', 'av1'],
      // Audio decode/encode is not part of the platform engine's exercised ops (no audio op here);
      // declare none to avoid implying audio transcode/mux we don't perform.
      audioCodecs: [],
      encryption: [],
      // 'alpha' decode is possible via WebCodecs alpha:'keep' on VP8/VP9; 'resize' via canvas in the
      // transcode path. We do NOT claim fragmented/faststart/metadata:write/rotate/fanout/trim.
      features: ['resize', 'alpha'],
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
   * Demux to a packet table from the inline MP4/WebM extractors. Honest NA for containers neither
   * parser handles (TS/OGG/HLS/etc.) — we cannot demux those with raw platform APIs.
   */
  async demux(input: MediaInput): Promise<DemuxResult> {
    const ab = await input.arrayBuffer();
    const bytes = new Uint8Array(ab);
    const meta = await this.probe(input);

    try {
      if (looksLikeMp4(bytes)) {
        const t = demuxMp4Video(bytes);
        const packets: PacketInfo[] = t.samples.map((s) => ({
          trackIndex: 0,
          size: s.data.length,
          ptsUs: s.ptsUs,
          dtsUs: s.dtsUs,
          keyframe: s.keyframe,
        }));
        return { metadata: meta, packets };
      }
      if (looksLikeWebm(bytes)) {
        const t = demuxWebmVideo(bytes);
        const packets: PacketInfo[] = t.samples.map((s) => ({
          trackIndex: 0,
          size: s.data.length,
          ptsUs: s.ptsUs,
          dtsUs: s.dtsUs,
          keyframe: s.keyframe,
        }));
        return { metadata: meta, packets };
      }
    } catch (e) {
      if (e instanceof UnsupportedMp4Error || e instanceof UnsupportedWebmError) {
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
   * LIMITED transcode: decode→canvas→MediaRecorder→webm. Lossy, real-time-bound, video-only. NA if
   * MediaRecorder/captureStream is unavailable or the requested container can't be recorded.
   */
  async transcode(input: MediaInput, opts: TranscodeOptions): Promise<MediaBytes> {
    if (!canMediaRecorderTranscode()) {
      throw new NotApplicableError(
        'transcode',
        'requires DOM + MediaRecorder + canvas.captureStream (unavailable in this realm)',
      );
    }
    const mime = recorderMimeFor(opts.container, opts.video?.codec);
    if (!mime) {
      throw new NotApplicableError('transcode', `MediaRecorder cannot produce container '${opts.container}' here`);
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
