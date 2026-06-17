/**
 * src/scenarios/transcode/index.ts — Pillar 1, family "transcode".
 *
 * Lossy re-encode. Pixels change, so correctness is judged by perceptual similarity to the
 * reference frames: `ssim-psnr` with floors {ssimMin: 0.99, psnrMinDb: 40} (tunable per scenario),
 * plus a `playback-smoke`. Coverage is the codec matrix (h264/hevc/vp8/vp9/av1 video;
 * aac/opus/mp3/flac/pcm audio), plus the spatial/temporal/bitrate/rotate transforms, plus a
 * fan-out/ABR ladder (one input → N renditions, each SSIM-validated).
 *
 * Each scenario's `requires` declares both the input codec(s)/container and the *output* codec(s)/
 * container/features so the runner negotiates NA correctly when a browser lacks an encoder.
 */

import type { TranscodeOptions } from '../../core/engine.ts';
import type { OracleTolerances, Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';

/** SSIM/PSNR floors shared by every (non-overridden) transcode scenario. */
const TC_TOL: OracleTolerances = { ssimMin: 0.99, psnrMinDb: 40 };

const TC_METRICS = ['wall', 'throughputRealtime', 'peakMemory', 'decodeFps', 'encodeFps', 'longtasks'] as const;

// ── Video codec transcode matrix ────────────────────────────────────────────────────────────────

interface VideoTranscodeCase {
  id: string;
  asset: string;
  fromContainer: string;
  fromVideo: string;
  fromAudio?: string;
  toContainer: string;
  /** target video codec (canonical token) */
  toVideo: string;
  /** target audio codec, if the audio is also re-encoded; omit to keep/copy audio */
  toAudio?: string;
  /** extra features the op needs (resize/fps/rotate) */
  features?: string[];
  opts: TranscodeOptions;
  tolerances?: OracleTolerances;
  notes?: string;
}

const VIDEO_CASES: VideoTranscodeCase[] = [
  // ── Cross-codec re-encode (same resolution), H.264 source → each target codec ──
  {
    id: 'h264_to_hevc_mp4',
    asset: 'h264_1080p_30s.mp4',
    fromContainer: 'mp4',
    fromVideo: 'h264',
    fromAudio: 'aac',
    toContainer: 'mp4',
    toVideo: 'hevc',
    opts: { container: 'mp4', video: { codec: 'hevc' } },
  },
  {
    id: 'h264_to_vp9_webm',
    asset: 'h264_1080p_30s.mp4',
    fromContainer: 'mp4',
    fromVideo: 'h264',
    fromAudio: 'aac',
    toContainer: 'webm',
    toVideo: 'vp9',
    toAudio: 'opus',
    opts: { container: 'webm', video: { codec: 'vp9' }, audio: { codec: 'opus' } },
    notes: 'mp4/H.264/AAC → webm/VP9/Opus: container forces audio re-encode to Opus too.',
  },
  {
    id: 'h264_to_vp8_webm',
    asset: 'h264_1080p_30s.mp4',
    fromContainer: 'mp4',
    fromVideo: 'h264',
    fromAudio: 'aac',
    toContainer: 'webm',
    toVideo: 'vp8',
    toAudio: 'vorbis',
    opts: { container: 'webm', video: { codec: 'vp8' }, audio: { codec: 'vorbis' } },
  },
  {
    id: 'h264_to_av1_mp4',
    asset: 'h264_1080p_30s.mp4',
    fromContainer: 'mp4',
    fromVideo: 'h264',
    fromAudio: 'aac',
    toContainer: 'mp4',
    toVideo: 'av1',
    opts: { container: 'mp4', video: { codec: 'av1' } },
    notes: 'AV1 encode is slow/SW on most browsers; expect NA where no AV1 encoder is configurable.',
  },

  // ── Reverse direction: modern codecs → H.264 (the universal baseline) ──
  {
    id: 'hevc_to_h264_mp4',
    asset: 'hevc_1080p_10s.mp4',
    fromContainer: 'mp4',
    fromVideo: 'hevc',
    fromAudio: 'aac',
    toContainer: 'mp4',
    toVideo: 'h264',
    opts: { container: 'mp4', video: { codec: 'h264' } },
  },
  {
    id: 'vp9_to_h264_mp4',
    asset: 'vp9_1080p_10s.webm',
    fromContainer: 'webm',
    fromVideo: 'vp9',
    fromAudio: 'opus',
    toContainer: 'mp4',
    toVideo: 'h264',
    toAudio: 'aac',
    opts: { container: 'mp4', video: { codec: 'h264' }, audio: { codec: 'aac' } },
  },
  {
    id: 'vp8_to_h264_mp4',
    asset: 'vp8_720p_10s.webm',
    fromContainer: 'webm',
    fromVideo: 'vp8',
    fromAudio: 'vorbis',
    toContainer: 'mp4',
    toVideo: 'h264',
    toAudio: 'aac',
    opts: { container: 'mp4', video: { codec: 'h264' }, audio: { codec: 'aac' } },
  },
  {
    id: 'av1_to_h264_mp4',
    asset: 'av1_720p_5s.webm',
    fromContainer: 'webm',
    fromVideo: 'av1',
    fromAudio: 'opus',
    toContainer: 'mp4',
    toVideo: 'h264',
    toAudio: 'aac',
    opts: { container: 'mp4', video: { codec: 'h264' }, audio: { codec: 'aac' } },
  },

  // ── Resize (downscale + upscale) ──
  {
    id: 'h264_resize_720p',
    asset: 'h264_1080p_30s.mp4',
    fromContainer: 'mp4',
    fromVideo: 'h264',
    fromAudio: 'aac',
    toContainer: 'mp4',
    toVideo: 'h264',
    features: ['resize'],
    opts: { container: 'mp4', video: { codec: 'h264', width: 1280, height: 720 } },
    // Reference frames for SSIM are the same content scaled to 720p; keep floors but slightly relaxed.
    tolerances: { ssimMin: 0.98, psnrMinDb: 38 },
    notes: 'Downscale 1080p→720p; SSIM computed against reference 720p frames.',
  },
  {
    id: 'h264_resize_4k_to_1080p',
    asset: 'h264_4k_10s.mp4',
    fromContainer: 'mp4',
    fromVideo: 'h264',
    fromAudio: 'aac',
    toContainer: 'mp4',
    toVideo: 'h264',
    features: ['resize'],
    opts: { container: 'mp4', video: { codec: 'h264', width: 1920, height: 1080 } },
    tolerances: { ssimMin: 0.98, psnrMinDb: 38 },
    notes: '4K→1080p downscale.',
  },

  // ── FPS change (temporal resample) ──
  {
    id: 'h264_fps_30_to_15',
    asset: 'h264_1080p_30s.mp4',
    fromContainer: 'mp4',
    fromVideo: 'h264',
    fromAudio: 'aac',
    toContainer: 'mp4',
    toVideo: 'h264',
    opts: { container: 'mp4', video: { codec: 'h264', fps: 15 } },
    // Dropped frames mean SSIM is measured only on retained pts; relax floors modestly.
    tolerances: { ssimMin: 0.98, psnrMinDb: 38 },
    notes: 'Frame-rate halved (30→15); oracle compares surviving frames at matching pts.',
  },
  {
    id: 'h264_vfr_to_cfr_30',
    asset: 'h264_vfr.mp4',
    fromContainer: 'mp4',
    fromVideo: 'h264',
    fromAudio: 'aac',
    toContainer: 'mp4',
    toVideo: 'h264',
    opts: { container: 'mp4', video: { codec: 'h264', fps: 30 } },
    tolerances: { ssimMin: 0.98, psnrMinDb: 38 },
    notes: 'VFR → constant 30fps; tests timestamp normalization during encode.',
  },

  // ── Bitrate target (quality knob) ──
  {
    id: 'h264_bitrate_2mbps',
    asset: 'h264_1080p_30s.mp4',
    fromContainer: 'mp4',
    fromVideo: 'h264',
    fromAudio: 'aac',
    toContainer: 'mp4',
    toVideo: 'h264',
    opts: { container: 'mp4', video: { codec: 'h264', bitrate: 2_000_000 } },
    // Aggressive bitrate cut lowers fidelity; floors loosened to reflect a real ABR rung.
    tolerances: { ssimMin: 0.95, psnrMinDb: 34 },
    notes: 'Re-encode at 2 Mbps; lower floors acknowledge intended quality loss.',
  },

  // ── Rotate (apply/normalize display rotation) ──
  {
    id: 'h264_rotate_normalize',
    asset: 'h264_rotated90.mp4',
    fromContainer: 'mp4',
    fromVideo: 'h264',
    fromAudio: 'aac',
    toContainer: 'mp4',
    toVideo: 'h264',
    features: ['rotate'],
    opts: { container: 'mp4', video: { codec: 'h264', rotate: 0 } },
    tolerances: { ssimMin: 0.98, psnrMinDb: 38 },
    notes: 'Bake the 90° display rotation into pixels (rotate→0); SSIM vs upright reference frames.',
  },
];

const videoScenarios: Scenario[] = VIDEO_CASES.map((c) =>
  defineScenario({
    id: `transcode/${c.id}`,
    op: 'transcode',
    input: c.asset,
    options: c.opts,
    requires: {
      operations: ['transcode'],
      containersIn: [c.fromContainer],
      containersOut: [c.toContainer],
      videoCodecs: [c.fromVideo, c.toVideo],
      ...(c.fromAudio || c.toAudio
        ? { audioCodecs: [...new Set([c.fromAudio, c.toAudio].filter((x): x is string => !!x))] }
        : {}),
      ...(c.features ? { features: c.features } : {}),
    },
    oracles: ['ssim-psnr', 'playback-smoke'],
    metrics: [...TC_METRICS],
    tolerances: c.tolerances ?? TC_TOL,
    ...(c.notes ? { notes: c.notes } : {}),
  }),
);

// ── Audio-only transcode matrix ─────────────────────────────────────────────────────────────────

/**
 * Audio re-encode. SSIM/PSNR are video-only, so audio fidelity is judged via
 * `decoded-frames-bitexact` over decoded-PCM digests (the engine's decoded output vs golden PCM
 * digests) — for *lossy* targets the golden is the reference engine's decode of its own output, so
 * the oracle here primarily asserts the file decodes to the expected sample layout; format
 * correctness is additionally covered by `golden-metadata`.
 */
interface AudioTranscodeCase {
  id: string;
  asset: string;
  fromContainer: string;
  fromAudio: string;
  toContainer: string;
  toAudio: string;
  opts: TranscodeOptions;
  notes?: string;
}

const AUDIO_CASES: AudioTranscodeCase[] = [
  {
    id: 'wav_to_aac_mp4',
    asset: 'wav_s16.wav',
    fromContainer: 'wav',
    fromAudio: 'pcm-s16',
    toContainer: 'mp4',
    toAudio: 'aac',
    opts: { container: 'mp4', audio: { codec: 'aac', bitrate: 192_000 } },
  },
  {
    id: 'wav_to_opus_ogg',
    asset: 'wav_s16.wav',
    fromContainer: 'wav',
    fromAudio: 'pcm-s16',
    toContainer: 'ogg',
    toAudio: 'opus',
    opts: { container: 'ogg', audio: { codec: 'opus', bitrate: 128_000 } },
  },
  {
    id: 'wav_to_flac',
    asset: 'wav_s16.wav',
    fromContainer: 'wav',
    fromAudio: 'pcm-s16',
    toContainer: 'flac',
    toAudio: 'flac',
    opts: { container: 'flac', audio: { codec: 'flac' } },
    notes: 'Lossless target: decoded PCM must be bit-exact vs the source PCM digest.',
  },
  {
    id: 'mp3_to_aac_mp4',
    asset: 'mp3_xing.mp3',
    fromContainer: 'mp3',
    fromAudio: 'mp3',
    toContainer: 'mp4',
    toAudio: 'aac',
    opts: { container: 'mp4', audio: { codec: 'aac', bitrate: 192_000 } },
  },
  {
    id: 'flac_to_aac_mp4',
    asset: 'flac_seektable.flac',
    fromContainer: 'flac',
    fromAudio: 'flac',
    toContainer: 'mp4',
    toAudio: 'aac',
    opts: { container: 'mp4', audio: { codec: 'aac', bitrate: 256_000 } },
  },
  {
    id: 'aac_to_opus_webm',
    asset: 'aac_adts.aac',
    fromContainer: 'adts',
    fromAudio: 'aac',
    toContainer: 'webm',
    toAudio: 'opus',
    opts: { container: 'webm', audio: { codec: 'opus', bitrate: 128_000 } },
  },
];

const audioScenarios: Scenario[] = AUDIO_CASES.map((c) =>
  defineScenario({
    id: `transcode/${c.id}`,
    op: 'transcode',
    input: c.asset,
    options: c.opts,
    requires: {
      operations: ['transcode'],
      containersIn: [c.fromContainer],
      containersOut: [c.toContainer],
      audioCodecs: [...new Set([c.fromAudio, c.toAudio])],
    },
    // Audio: no SSIM/PSNR. PCM-digest bit-exactness where lossless; metadata for format correctness.
    oracles: ['decoded-frames-bitexact', 'golden-metadata', 'playback-smoke'],
    metrics: ['wall', 'throughputRealtime', 'peakMemory', 'longtasks'],
    ...(c.notes ? { notes: c.notes } : {}),
  }),
);

// ── Fan-out / ABR ladder (one input → N renditions) ──────────────────────────────────────────────

/**
 * ABR fan-out via TranscodeOptions.variants: one decode feeds N encoders producing a quality ladder.
 * Each rendition is SSIM/PSNR-validated against the reference frames for that rung's resolution.
 * Requires the 'fanout' feature so engines without a ladder API negotiate NA.
 */
const ABR_OPTS: TranscodeOptions = {
  container: 'mp4',
  video: { codec: 'h264' },
  variants: [
    { codec: 'h264', width: 1920, height: 1080, bitrate: 5_000_000 },
    { codec: 'h264', width: 1280, height: 720, bitrate: 2_800_000 },
    { codec: 'h264', width: 854, height: 480, bitrate: 1_400_000 },
    { codec: 'h264', width: 640, height: 360, bitrate: 800_000 },
  ],
};

const fanoutScenarios: Scenario[] = [
  defineScenario({
    id: 'transcode/fanout_h264_abr_ladder',
    op: 'transcode',
    input: 'h264_1080p_30s.mp4',
    options: ABR_OPTS,
    requires: {
      operations: ['transcode'],
      containersIn: ['mp4'],
      containersOut: ['mp4'],
      videoCodecs: ['h264'],
      audioCodecs: ['aac'],
      features: ['fanout', 'resize'],
    },
    // ssim-psnr is applied per rendition; floors loosen for the lower rungs in the oracle config.
    oracles: ['ssim-psnr', 'playback-smoke'],
    metrics: [...TC_METRICS],
    tolerances: { ssimMin: 0.95, psnrMinDb: 34 },
    notes: '1→4 H.264 ABR renditions (1080/720/480/360); SSIM/PSNR validated per rung.',
  }),
];

export const transcodeScenarios: Scenario[] = [...videoScenarios, ...audioScenarios, ...fanoutScenarios];

export default transcodeScenarios;
