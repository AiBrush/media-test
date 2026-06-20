/**
 * src/core/feature-detect.ts — per-browser environment + WebCodecs/codec/WebGPU support probing.
 *
 * Everything here MUST be defensive: WebCodecs, WebGPU, measureUserAgentSpecificMemory, the WEBGL
 * debug-renderer extension, and even `navigator`/`document` vary wildly across Chromium / WebKit /
 * Firefox and between page and Worker contexts. We never throw on a missing API — a probe that
 * cannot run resolves to `false` (or `undefined` for optional metadata).
 */

import type { BrowserName } from './engine.ts';

export interface EnvInfo {
  browser: BrowserName;
  version?: string;
  userAgent: string;
  gpu?: string;
}

export interface CodecSupport {
  webcodecs: boolean;
  videoDecode: Record<string, boolean>; // canonical token (h264/hevc/vp8/vp9/av1) -> supported
  videoEncode: Record<string, boolean>;
  audioDecode: Record<string, boolean>; // aac/opus/mp3/flac/vorbis/pcm-*
  audioEncode: Record<string, boolean>;
  alpha: boolean;
  webgpu: boolean;
  measureMemory: boolean; // performance.measureUserAgentSpecificMemory available
}

// ── Canonical codec → WebCodecs codec-string mapping ────────────────────────────────────────────

/**
 * Canonical video tokens we probe. The default WebCodecs string for each is what
 * {@link webcodecsVideoString} emits when no resolution-specific override applies.
 */
const VIDEO_TOKENS = ['h264', 'hevc', 'vp8', 'vp9', 'av1'] as const;
type VideoToken = (typeof VIDEO_TOKENS)[number];

const AUDIO_TOKENS = [
  'aac',
  'opus',
  'mp3',
  'flac',
  'vorbis',
  'pcm-s16',
  'pcm-s24',
  'pcm-f32',
  'pcm-s16be',
  'pcm-s24be',
] as const;
type AudioToken = (typeof AUDIO_TOKENS)[number];

/**
 * Default WebCodecs codec strings per canonical video token. h264 uses High@4.0 (avc1.640028),
 * vp9 / av1 use conservative profile-0 / Main strings that match the most common 8-bit 4:2:0 SDR
 * content in the corpus. Resolution-dependent levels are refined in {@link webcodecsVideoString}.
 */
const VIDEO_DEFAULT: Record<VideoToken, string> = {
  h264: 'avc1.640028',
  hevc: 'hev1.1.6.L93.B0',
  vp8: 'vp8',
  vp9: 'vp09.00.10.08',
  av1: 'av01.0.04M.08',
};

/** Audio codec strings. WebCodecs has no string for vorbis; PCM uses the pcm-* family. */
const AUDIO_STRING: Record<AudioToken, string | null> = {
  aac: 'mp4a.40.2',
  opus: 'opus',
  mp3: 'mp3',
  flac: 'flac',
  vorbis: 'vorbis',
  'pcm-s16': 'pcm-s16',
  'pcm-s24': 'pcm-s24',
  'pcm-f32': 'pcm-f32',
  'pcm-s16be': 'pcm-s16be',
  'pcm-s24be': 'pcm-s24be',
};

/**
 * Map a canonical codec token + optional dims to a WebCodecs video codec string.
 * Returns null for unknown tokens. For h264/hevc/vp9/av1 a resolution-aware level is chosen so that
 * isConfigSupported reflects what the browser will actually accept for the asset's dimensions.
 */
export function webcodecsVideoString(codec: string, opts?: { width?: number; height?: number }): string | null {
  const token = codec.toLowerCase() as VideoToken;
  const base = VIDEO_DEFAULT[token];
  if (base === undefined) return null;

  const w = opts?.width;
  const h = opts?.height;
  if (w === undefined || h === undefined) return base;

  const pixels = w * h;
  switch (token) {
    case 'h264': {
      // avc1.<profile_idc><constraints><level>; profile High (0x64). Level scaled to resolution.
      const level = h264Level(w, h);
      return `avc1.6400${level}`;
    }
    case 'hevc': {
      // hev1.<profile>.<compat>.L<level>.B0 — Main profile. Level expressed as general_level_idc.
      const level = hevcLevelIdc(w, h);
      return `hev1.1.6.L${level}.B0`;
    }
    case 'vp9': {
      // vp09.<profile>.<level>.<bitdepth>; profile 0, 8-bit. Level scaled to resolution.
      const level = vp9Level(w, h);
      return `vp09.00.${level}.08`;
    }
    case 'av1': {
      // av01.<profile>.<level><tier>.<bitdepth>; Main profile, Main tier (M), 8-bit.
      const level = av1Level(pixels);
      return `av01.0.${level}M.08`;
    }
    case 'vp8':
      return base;
    default:
      return base;
  }
}

/** Map a canonical audio token to its WebCodecs codec string. null if unknown / unrepresentable. */
export function webcodecsAudioString(codec: string): string | null {
  const token = codec.toLowerCase() as AudioToken;
  const str = AUDIO_STRING[token];
  return str === undefined ? null : str;
}

// ── Resolution → codec-level helpers ────────────────────────────────────────────────────────────

/** H.264 level byte (hex, two chars) by frame dimensions. Conservative, monotonically increasing. */
function h264Level(w: number, h: number): string {
  const max = Math.max(w, h);
  // level_idc values: 3.1=0x1f, 4.0=0x28, 4.1=0x29, 5.0=0x32, 5.1=0x33, 5.2=0x34, 6.0=0x3c
  if (max <= 1280) return '1f'; // 720p → 3.1
  if (max <= 1920) return '28'; // 1080p → 4.0
  if (max <= 2048) return '33'; // 2K → 5.1
  if (max <= 3840) return '34'; // 4K → 5.2
  return '3c'; // >4K → 6.0
}

/** HEVC general_level_idc = level*30. 4K → L153 (5.1), 1080p → L120 (4.0), 720p → L93 (3.1). */
function hevcLevelIdc(w: number, h: number): number {
  const max = Math.max(w, h);
  if (max <= 1280) return 93; // 3.1
  if (max <= 1920) return 120; // 4.0
  if (max <= 2560) return 150; // 5.0
  if (max <= 3840) return 153; // 5.1
  return 180; // 6.0
}

/** VP9 level (two-digit string). 720p→31, 1080p→40, 1440p→50, 4K→51. */
function vp9Level(w: number, h: number): string {
  const max = Math.max(w, h);
  if (max <= 1280) return '31';
  if (max <= 1920) return '40';
  if (max <= 2560) return '50';
  if (max <= 3840) return '51';
  return '60';
}

/** AV1 seq_level_idx (two-digit string) by total pixel count. 4.0=08, 5.0=12, 5.1=13, 6.0=16. */
function av1Level(pixels: number): string {
  if (pixels <= 1280 * 720) return '04'; // 3.0
  if (pixels <= 1920 * 1080) return '08'; // 4.0
  if (pixels <= 2560 * 1440) return '09'; // 4.1
  if (pixels <= 3840 * 2160) return '12'; // 5.0
  return '13'; // 5.1
}

// ── Environment detection ───────────────────────────────────────────────────────────────────────

/**
 * UA-based browser family + version guess, plus the GPU renderer string via the WebGL
 * WEBGL_debug_renderer_info UNMASKED_RENDERER_WEBGL token. Order of UA checks matters: WebKit-on-iOS
 * and Chromium both carry "Safari"/"AppleWebKit", and Edge/Chrome both carry "Chrome".
 */
export async function detectEnv(): Promise<EnvInfo> {
  const ua = typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string' ? navigator.userAgent : '';
  const { browser, version } = guessBrowser(ua);
  const gpu = detectGpu();
  const info: EnvInfo = { browser, userAgent: ua };
  if (version !== undefined) info.version = version;
  if (gpu !== undefined) info.gpu = gpu;
  return info;
}

/**
 * Classify the UA string into one of the three engine families and extract a build version.
 * Firefox → "firefox"; genuine Safari/WebKit (no Chrome/Chromium token) → "webkit"; everything
 * Blink-based (Chrome, Edge, Opera, Brave, Chromium) → "chromium". Defaults to chromium.
 */
function guessBrowser(ua: string): { browser: BrowserName; version?: string } {
  const u = ua.toLowerCase();

  if (u.includes('firefox') || u.includes('fxios')) {
    return { browser: 'firefox', version: matchVersion(ua, /(?:firefox|fxios)\/(\d+(?:\.\d+)*)/i) };
  }

  // Genuine WebKit/Safari: has Safari + AppleWebKit but NOT a Chromium/Blink token.
  const isBlink = u.includes('chrome') || u.includes('chromium') || u.includes('crios') || u.includes('edg/');
  if (!isBlink && (u.includes('applewebkit') || u.includes('safari'))) {
    // Safari version is carried in "Version/<v>"; fall back to AppleWebKit build.
    const v = matchVersion(ua, /version\/(\d+(?:\.\d+)*)/i) ?? matchVersion(ua, /applewebkit\/(\d+(?:\.\d+)*)/i);
    return { browser: 'webkit', version: v };
  }

  // Blink family: prefer the Chrome/Chromium token; Edge (Edg/) reports its own but rides Blink.
  const v =
    matchVersion(ua, /(?:chrome|chromium|crios)\/(\d+(?:\.\d+)*)/i) ?? matchVersion(ua, /edg\/(\d+(?:\.\d+)*)/i);
  return { browser: 'chromium', version: v };
}

function matchVersion(ua: string, re: RegExp): string | undefined {
  const m = ua.match(re);
  return m && m[1] ? m[1] : undefined;
}

/**
 * Read the unmasked GPU renderer via a throwaway WebGL context. Many configurations gate
 * WEBGL_debug_renderer_info (privacy), so absence is expected and returns undefined rather than
 * throwing. Tries WebGL2 then WebGL1; falls back to the masked RENDERER token if unmasked is gated.
 */
function detectGpu(): string | undefined {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return undefined;
  let canvas: HTMLCanvasElement | undefined;
  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  try {
    canvas = document.createElement('canvas');
    gl =
      (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ??
      (canvas.getContext('webgl') as WebGLRenderingContext | null) ??
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) return undefined;

    const ext = gl.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL: number } | null;
    if (ext) {
      const unmasked = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
      if (typeof unmasked === 'string' && unmasked.length > 0) return unmasked;
    }
    const renderer = gl.getParameter(gl.RENDERER);
    return typeof renderer === 'string' && renderer.length > 0 ? renderer : undefined;
  } catch {
    return undefined;
  } finally {
    // Best-effort context teardown so a probe doesn't leak a GL context.
    try {
      const lose = gl?.getExtension('WEBGL_lose_context') as { loseContext(): void } | null | undefined;
      lose?.loseContext();
    } catch {
      /* ignore */
    }
  }
}

// ── Codec / API support detection ─────────────────────────────────────────────────────────────

/** True when the named WebCodecs constructor exists in this realm. */
function hasGlobal(name: 'VideoDecoder' | 'VideoEncoder' | 'AudioDecoder' | 'AudioEncoder'): boolean {
  try {
    return typeof (globalThis as Record<string, unknown>)[name] === 'function';
  } catch {
    return false;
  }
}

/**
 * Probe a WebCodecs *Decoder/*Encoder for a config via isConfigSupported. Returns false on any
 * error (missing constructor, missing static method, throw, or `supported !== true`).
 */
async function isVideoDecodeSupported(config: VideoDecoderConfig): Promise<boolean> {
  if (!hasGlobal('VideoDecoder')) return false;
  try {
    const res = await VideoDecoder.isConfigSupported(config);
    return res?.supported === true;
  } catch {
    return false;
  }
}

async function isVideoEncodeSupported(config: VideoEncoderConfig): Promise<boolean> {
  if (!hasGlobal('VideoEncoder')) return false;
  try {
    const res = await VideoEncoder.isConfigSupported(config);
    return res?.supported === true;
  } catch {
    return false;
  }
}

async function isAudioDecodeSupported(config: AudioDecoderConfig): Promise<boolean> {
  if (!hasGlobal('AudioDecoder')) return false;
  try {
    const res = await AudioDecoder.isConfigSupported(config);
    return res?.supported === true;
  } catch {
    return false;
  }
}

async function isAudioEncodeSupported(config: AudioEncoderConfig): Promise<boolean> {
  if (!hasGlobal('AudioEncoder')) return false;
  try {
    const res = await AudioEncoder.isConfigSupported(config);
    return res?.supported === true;
  } catch {
    return false;
  }
}

/** Representative sample rate / channel count used purely for audio isConfigSupported probes. */
const AUDIO_PROBE_SAMPLE_RATE = 48000;
const AUDIO_PROBE_CHANNELS = 2;

/**
 * Detect WebCodecs presence, per-codec decode/encode support, alpha decode, WebGPU, and the
 * measureUserAgentSpecificMemory API. Every probe is independently guarded; a single unsupported
 * codec never aborts the others.
 */
export async function detectCodecSupport(): Promise<CodecSupport> {
  const webcodecs =
    hasGlobal('VideoDecoder') || hasGlobal('VideoEncoder') || hasGlobal('AudioDecoder') || hasGlobal('AudioEncoder');

  const videoDecode: Record<string, boolean> = {};
  const videoEncode: Record<string, boolean> = {};
  const audioDecode: Record<string, boolean> = {};
  const audioEncode: Record<string, boolean> = {};

  // Probe at 1080p so codec-level strings exercise the path the suite actually runs.
  const probeW = 1920;
  const probeH = 1080;

  // Video decode + encode, per canonical token, in parallel.
  await Promise.all(
    VIDEO_TOKENS.map(async (token) => {
      const codecStr = webcodecsVideoString(token, { width: probeW, height: probeH });
      if (!codecStr) {
        videoDecode[token] = false;
        videoEncode[token] = false;
        return;
      }
      const [dec, enc] = await Promise.all([
        isVideoDecodeSupported({ codec: codecStr, codedWidth: probeW, codedHeight: probeH }),
        isVideoEncodeSupported({ codec: codecStr, width: probeW, height: probeH, bitrate: 4_000_000, framerate: 30 }),
      ]);
      videoDecode[token] = dec;
      videoEncode[token] = enc;
    }),
  );

  // Audio decode + encode, per canonical token, in parallel.
  await Promise.all(
    AUDIO_TOKENS.map(async (token) => {
      const codecStr = webcodecsAudioString(token);
      if (!codecStr) {
        audioDecode[token] = false;
        audioEncode[token] = false;
        return;
      }
      const decCfg: AudioDecoderConfig = {
        codec: codecStr,
        sampleRate: AUDIO_PROBE_SAMPLE_RATE,
        numberOfChannels: AUDIO_PROBE_CHANNELS,
      };
      const encCfg: AudioEncoderConfig = {
        codec: codecStr,
        sampleRate: AUDIO_PROBE_SAMPLE_RATE,
        numberOfChannels: AUDIO_PROBE_CHANNELS,
        bitrate: 128_000,
      };
      const [dec, enc] = await Promise.all([isAudioDecodeSupported(decCfg), isAudioEncodeSupported(encCfg)]);
      audioDecode[token] = dec;
      audioEncode[token] = enc;
    }),
  );

  const alpha = await detectAlpha(probeW, probeH);
  const webgpu = detectWebGpu();
  const measureMemory = detectMeasureMemory();

  return { webcodecs, videoDecode, videoEncode, audioDecode, audioEncode, alpha, webgpu, measureMemory };
}

/**
 * Alpha decode support: ask VideoDecoder for an alpha-keep config on a codec that can carry alpha
 * (VP8/VP9). If neither alpha-capable codec is supported, alpha is false.
 */
async function detectAlpha(w: number, h: number): Promise<boolean> {
  if (!hasGlobal('VideoDecoder')) return false;
  const candidates: string[] = [];
  const vp9 = webcodecsVideoString('vp9', { width: w, height: h });
  const vp8 = webcodecsVideoString('vp8', { width: w, height: h });
  if (vp9) candidates.push(vp9);
  if (vp8) candidates.push(vp8);
  for (const codec of candidates) {
    try {
      // `alpha` is a newer VideoDecoderConfig field; widen so older DOM lib typings don't reject it.
      const config: VideoDecoderConfig = { codec, codedWidth: w, codedHeight: h };
      (config as { alpha?: 'discard' | 'keep' }).alpha = 'keep';
      const res = await VideoDecoder.isConfigSupported(config);
      if (res?.supported === true) return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

/** WebGPU presence: `navigator.gpu` exposed (does not request an adapter — that is async + heavy). */
function detectWebGpu(): boolean {
  try {
    // Accessed via a structural cast so this compiles with or without @webgpu/types loaded.
    return typeof navigator !== 'undefined' && (navigator as unknown as { gpu?: unknown }).gpu != null;
  } catch {
    return false;
  }
}

/** performance.measureUserAgentSpecificMemory presence (Chromium, cross-origin-isolated only). */
function detectMeasureMemory(): boolean {
  try {
    return (
      typeof performance !== 'undefined' &&
      typeof (performance as unknown as { measureUserAgentSpecificMemory?: unknown })
        .measureUserAgentSpecificMemory === 'function'
    );
  } catch {
    return false;
  }
}
