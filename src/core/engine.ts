/**
 * src/core/engine.ts — the MediaEngine contract (§5) + normalized result types + CapabilitySet.
 *
 * AUTHORITATIVE. Every adapter implements `MediaEngine`; the runner/oracles/report consume the
 * result types here. Everything is bytes/blobs/metadata/frames in → bytes/metadata/frames out,
 * async, browser-native. No method exposes a library's internals — only observable behavior is
 * judged. Keep this file dependency-free (pure types) so it can be imported from page, Worker,
 * and bake contexts alike.
 */

export type BrowserName = 'brave' | 'chromium' | 'webkit' | 'firefox';

/** A corpus asset, served as a static file (supports HTTP Range). */
export interface MediaInput {
  /** corpus asset id, e.g. 'h264_1080p_30s.mp4' */
  id: string;
  /** served static URL; supports HTTP Range */
  url: string;
  mime: string;
  /** true when robustness logic rewrites bytes before the engine receives them */
  mutated?: boolean;
  blob(): Promise<Blob>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** Bytes produced by an operation (remux/transcode/trim/mux/decrypt). */
export type MediaBytes = {
  bytes: Uint8Array;
  mime: string;
  container: string;
  /** Multi-rendition operations such as ABR fanout. Includes the primary rendition as variants[0]. */
  variants?: MediaBytes[];
};

export type TrackType = 'video' | 'audio' | 'subtitle' | 'other';

export interface NormalizedTrack {
  type: TrackType;
  codec: string;
  width?: number;
  height?: number;
  fps?: number;
  rotation?: number;
  sampleRate?: number;
  channels?: number;
  bitrate?: number | null;
  language?: string | null;
}

export interface NormalizedMetadata {
  container: string;
  durationSec: number | null;
  tracks: NormalizedTrack[];
  tags?: Record<string, string>;
}

export interface PacketInfo {
  trackIndex: number;
  size: number;
  ptsUs: number;
  dtsUs: number;
  keyframe: boolean;
}

export interface DemuxResult {
  metadata: NormalizedMetadata;
  packets: PacketInfo[];
}

/**
 * Frames are returned as digests for committed-golden comparison, and optionally as raw pixels for
 * SSIM/PSNR. The sha256 is of the NORMALIZED RGBA buffer (see oracles.ts for the normalization
 * rule: tight RGBA, top-left origin, premultiplied-off) so it is engine-independent.
 */
export interface FrameDigest {
  index: number;
  ptsUs: number;
  /** sha256 hex of normalized RGBA pixels */
  sha256: string;
  width?: number;
  height?: number;
}

export interface FrameSink {
  frames: FrameDigest[];
  /** raw pixels for SSIM/PSNR oracles; may be absent if the engine only produced digests */
  getPixels?(i: number): Promise<ImageData>;
}

export type Operation =
  | 'probe'
  | 'demux'
  | 'remux'
  | 'transcode'
  | 'decodeFrames'
  | 'seek'
  | 'trim'
  | 'mux'
  | 'decrypt';

export type EncryptionScheme =
  | 'cenc-ctr'
  | 'cenc-cbcs'
  | 'hls-aes128'
  | 'clearkey'
  | 'cenc-cens'
  | 'hls-sample-aes';

/**
 * What an engine DECLARES it can do. The runner additionally runtime-feature-detects per browser
 * (feature-detect.ts) before running — declared ∧ detected. Codec/container ids are lowercase
 * canonical tokens (see CANONICAL_* below) so engines and scenarios speak the same vocabulary.
 */
export interface CapabilitySet {
  operations: Partial<Record<Operation, boolean>>;
  containersIn: string[]; // e.g. ['mp4','mov','mkv','webm','ts','wav','ogg','flac','mp3','adts','hls']
  containersOut: string[];
  videoCodecs: string[]; // ['h264','hevc','vp8','vp9','av1', ...]
  audioCodecs: string[]; // ['aac','opus','mp3','flac','vorbis','pcm-s16','pcm-s24','pcm-f32', ...]
  /**
   * Optional operation-specific codec declarations. When absent, negotiation falls back to the flat
   * `videoCodecs` / `audioCodecs` sets for backwards compatibility. Use these only when a framework
   * can honestly read/copy/decode a codec but cannot encode it, or vice versa.
   */
  videoCodecsIn?: string[];
  audioCodecsIn?: string[];
  videoCodecsOut?: string[];
  audioCodecsOut?: string[];
  encryption: EncryptionScheme[];
  features: string[]; // 'fragmented','fastStart:reserve','trim:frame-accurate','metadata:write','packets:dts','alpha','resize','rotate', ...
}

export interface TranscodeVideoOptions {
  codec?: string;
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: number;
  rotate?: number;
}

export interface TranscodeAudioOptions {
  codec?: string;
  sampleRate?: number;
  channels?: number;
  bitrate?: number;
}

export interface TranscodeOptions {
  container: string;
  video?: TranscodeVideoOptions;
  audio?: TranscodeAudioOptions;
  /** fan-out / ABR ladder: one input → N renditions */
  variants?: TranscodeVideoOptions[];
}

/** Encoded, demuxed tracks fed back into a muxer (mux()). Opaque chunk bytes + minimal framing. */
export interface EncodedTrack {
  type: TrackType;
  codec: string;
  timescale: number;
  width?: number;
  height?: number;
  sampleRate?: number;
  channels?: number;
  /** codec private/description data (e.g. avcC/hvcC/esds), if any */
  description?: Uint8Array;
  chunks: Array<{ data: Uint8Array; ptsUs: number; dtsUs: number; durationUs: number; keyframe: boolean }>;
}

export interface EncodedTracks {
  tracks: EncodedTrack[];
}

export interface DecryptKey {
  kid?: string;
  keyHex: string;
  ivHex?: string;
}

export interface RemuxOptions extends Record<string, unknown> {
  container: string;
  tags?: Record<string, string>;
}

export interface MuxOptions extends Record<string, unknown> {
  container: string;
}

/**
 * The single interface every adapter implements. Optional methods (mux/decrypt) are declared via
 * capabilities(); the runner gates accordingly. init/dispose bracket expensive setup (WASM load,
 * Worker spawn) so it is excluded from measured timing.
 */
export interface MediaEngine {
  /** stable, versioned id, e.g. 'mediabunny@1.48.0', 'ffmpeg.wasm@0.12', 'aibrush-media@dev' */
  readonly id: string;
  capabilities(): CapabilitySet;
  /**
   * The best-path configuration this engine drives (§0.9 / §8.5), recorded into the report so a
   * number is never an apples-to-oranges artifact of a slow API path. Optional + additive: the
   * runner reads it off the instance when present (e.g. { backend:'webgpu', wasmThreads:8 }).
   * Typed as `object` (not Record) so adapters may declare a concrete config interface without an
   * index signature; the runner serializes it for the report.
   */
  readonly configUsed?: object;
  init?(): Promise<void>;
  dispose?(): Promise<void>;

  probe(input: MediaInput): Promise<NormalizedMetadata>;
  demux(input: MediaInput): Promise<DemuxResult>;
  remux(input: MediaInput, opts: RemuxOptions): Promise<MediaBytes>;
  transcode(input: MediaInput, opts: TranscodeOptions): Promise<MediaBytes>;
  decodeFrames(input: MediaInput, opts?: { maxFrames?: number }): Promise<FrameSink>;
  seek(input: MediaInput, tUs: number): Promise<{ landedPtsUs: number; frame: FrameDigest }>;
  trim(
    input: MediaInput,
    range: { startUs: number; endUs: number },
    opts: { container: string; frameAccurate: boolean },
  ): Promise<MediaBytes>;
  /**
   * Optional runner hook for mux scenarios. Engines that can expose encoded packet bytes may turn one
   * or more corpus inputs into mux-ready tracks; support is still declared exclusively through
   * capabilities().operations.mux and negotiated before this hook is called.
   */
  prepareMuxTracks?(inputs: MediaInput[], options?: Record<string, unknown>): Promise<EncodedTracks>;
  mux?(tracks: EncodedTracks, opts: MuxOptions): Promise<MediaBytes>;
  /** Optional composition hook for scenarios that must concatenate already-produced media segments. */
  concat?(segments: MediaBytes[], opts: MuxOptions): Promise<MediaBytes>;
  decrypt?(input: MediaInput, key: DecryptKey, opts: { scheme: EncryptionScheme }): Promise<MediaBytes>;
}

/** Factory registered in the registry; lets the runner construct a fresh engine per Worker/iter. */
export type EngineFactory = () => MediaEngine | Promise<MediaEngine>;

// ── Canonical vocabularies (single source of truth shared by adapters, scenarios, feature-detect) ──

export const CANONICAL_CONTAINERS = [
  'mp4',
  'mov',
  'mkv',
  'webm',
  'ts',
  'hls',
  'wav',
  'mp3',
  'flac',
  'ogg',
  'adts',
  'aiff',
  'caf',
] as const;
export type CanonicalContainer = (typeof CANONICAL_CONTAINERS)[number];

export const CANONICAL_VIDEO_CODECS = ['h264', 'hevc', 'vp8', 'vp9', 'av1'] as const;
export type CanonicalVideoCodec = (typeof CANONICAL_VIDEO_CODECS)[number];

export const CANONICAL_AUDIO_CODECS = [
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
export type CanonicalAudioCodec = (typeof CANONICAL_AUDIO_CODECS)[number];
