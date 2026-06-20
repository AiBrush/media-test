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
import type { OracleId, OracleTolerances, Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';

/** SSIM/PSNR floors shared by every (non-overridden) transcode scenario. */
const TC_TOL: OracleTolerances = { ssimMin: 0.99, psnrMinDb: 40 };

/**
 * Browser/WebCodecs transcodes routinely quantize encoded duration by a few frames when changing FPS
 * or baking rotation. Keep the band small enough that large truncation/drift still fails.
 */
const TC_REENCODE_DURATION_TOLERANCE_SEC = 0.15;

/** AAC/Opus/MP3 encoder-delay + padding allowance for lossy audio targets. */
const TC_AUDIO_PRIMING_TOLERANCE_SEC = 0.12;

const TC_METRICS = ['wall', 'throughputRealtime', 'peakMemory', 'decodeFps', 'encodeFps', 'longtasks'] as const;

/** Tight wall-clock cap (ms) for edge/negative cases that must fail fast (no crash/hang/OOM). */
const TC_EDGE_TIMEOUT_MS = 20_000;

/**
 * Transcode option payload. Some extended cases carry knobs beyond the core TranscodeOptions shape
 * (e.g. `invariant` for the property-invariant oracle, or a not-yet-supported transform like
 * `flip`/`crop`/`tonemap` that drives an honest NA). The runner forwards options opaquely and the
 * scenario `options` field is `TranscodeOptions | Record<string, unknown>`, so we widen here.
 */
type TranscodeOpts = TranscodeOptions & Record<string, unknown>;

const withOutputMetadataInvariant = (opts: TranscodeOptions | TranscodeOpts): TranscodeOpts => ({
  ...opts,
  invariant: 'transcode-output-metadata',
});

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
  /** extra features the op needs (resize/fps/rotate/alpha) */
  features?: string[];
  opts: TranscodeOpts;
  tolerances?: OracleTolerances;
  /** replace the default ['ssim-psnr','playback-smoke'] oracle list entirely (order significant). */
  oraclesOverride?: OracleId[];
  /** append extra oracles to the default list (e.g. 'property-invariant' for output metadata). */
  extraOracles?: OracleId[];
  /** when property-invariant is in the oracle list, the invariant token it interprets. */
  optsInvariant?: string;
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
    tolerances: { ssimMin: 0.97, psnrMinDb: 36 },
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
    tolerances: { ssimMin: 0.97, psnrMinDb: 36 },
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
    tolerances: { ssimMin: 0.98, psnrMinDb: 38 },
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
    tolerances: { ssimMin: 0.98, psnrMinDb: 38 },
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
    tolerances: { ssimMin: 0.98, psnrMinDb: 38 },
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
    tolerances: { ssimMin: 0.98, psnrMinDb: 38 },
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
    tolerances: { ssimMin: 0.97, psnrMinDb: 36 },
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
    features: ['fps'],
    opts: { container: 'mp4', video: { codec: 'h264', fps: 15 } },
    oraclesOverride: ['property-invariant', 'playback-smoke'],
    optsInvariant: 'transcode-output-metadata',
    tolerances: { durationToleranceSec: TC_REENCODE_DURATION_TOLERANCE_SEC },
    notes:
      'Frame-rate halved (30→15). Index-paired SSIM is unsound for frame dropping, so output metadata ' +
      'checks requested fps/container/codec and preserves duration within a small re-encode band.',
  },
  {
    id: 'h264_vfr_to_cfr_30',
    asset: 'h264_vfr.mp4',
    fromContainer: 'mp4',
    fromVideo: 'h264',
    fromAudio: 'aac',
    toContainer: 'mp4',
    toVideo: 'h264',
    features: ['fps'],
    opts: { container: 'mp4', video: { codec: 'h264', fps: 30 } },
    oraclesOverride: ['property-invariant', 'playback-smoke'],
    optsInvariant: 'transcode-output-metadata',
    tolerances: { durationToleranceSec: TC_REENCODE_DURATION_TOLERANCE_SEC },
    notes:
      'VFR → constant 30fps; tests timestamp normalization during encode. Output metadata is the hard ' +
      'gate because index-paired SSIM mis-pairs VFR/CFR frame timelines.',
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

/**
 * Build one video transcode Scenario from a VideoTranscodeCase. Default oracle set is
 * ['ssim-psnr','playback-smoke']; `oraclesOverride` replaces it wholesale and `extraOracles` appends.
 * When the oracle list includes 'property-invariant', `optsInvariant` is merged into options as
 * `invariant` so the oracle selects the right (sound) metamorphic check.
 */
function buildVideoScenario(c: VideoTranscodeCase): Scenario {
  const oracles: OracleId[] = c.oraclesOverride
    ? [...c.oraclesOverride]
    : ['ssim-psnr', 'playback-smoke', ...(c.extraOracles ?? [])];
  const options: TranscodeOpts =
    c.optsInvariant && (c.opts as Record<string, unknown>).invariant === undefined
      ? { ...c.opts, invariant: c.optsInvariant }
      : c.opts;
  return defineScenario({
    id: `transcode/${c.id}`,
    op: 'transcode',
    input: c.asset,
    options,
    requires: {
      operations: ['transcode'],
      containersIn: [c.fromContainer],
      containersOut: [c.toContainer],
      videoCodecs: [...new Set([c.fromVideo, c.toVideo])],
      ...(c.fromAudio || c.toAudio
        ? { audioCodecs: [...new Set([c.fromAudio, c.toAudio].filter((x): x is string => !!x))] }
        : {}),
      ...(c.features ? { features: c.features } : {}),
    },
    oracles,
    metrics: [...TC_METRICS],
    tolerances: c.tolerances ?? TC_TOL,
    ...(c.notes ? { notes: c.notes } : {}),
  });
}

const videoScenarios: Scenario[] = VIDEO_CASES.map(buildVideoScenario);

// ── Audio-only transcode matrix ─────────────────────────────────────────────────────────────────

/**
 * Audio re-encode. SSIM/PSNR are video-only and transcode does not populate ctx.metadata, so these
 * rows use the transcode output-metadata invariant: reference-probe the produced bytes, assert the
 * requested container/codec/channel shape, and keep duration within a small priming band for lossy
 * targets. Browser-playable containers also get a playback smoke check.
 */
interface AudioTranscodeCase {
  id: string;
  asset: string;
  fromContainer: string;
  fromAudio: string;
  toContainer: string;
  toAudio: string;
  opts: TranscodeOptions;
  lossless?: boolean;
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
    lossless: true,
    notes:
      'Lossless target. Output metadata gates the FLAC container/codec and duration; PCM bit-exactness ' +
      'needs a dedicated audio decode oracle before it can be asserted here.',
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

const audioScenarios: Scenario[] = AUDIO_CASES.map((c) => {
  const browserPlayable = c.toContainer === 'mp4' || c.toContainer === 'webm';
  const oracles: OracleId[] = ['property-invariant'];
  if (browserPlayable) oracles.push('playback-smoke');
  return defineScenario({
    id: `transcode/${c.id}`,
    op: 'transcode',
    input: c.asset,
    options: withOutputMetadataInvariant(c.opts),
    requires: {
      operations: ['transcode'],
      containersIn: [c.fromContainer],
      containersOut: [c.toContainer],
      audioCodecs: [...new Set([c.fromAudio, c.toAudio])],
    },
    oracles,
    metrics: ['wall', 'throughputRealtime', 'peakMemory', 'longtasks'],
    ...(c.lossless ? {} : { tolerances: { durationToleranceSec: TC_AUDIO_PRIMING_TOLERANCE_SEC } }),
    ...(c.notes ? { notes: c.notes } : {}),
  });
});

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

// ════════════════════════════════════════════════════════════════════════════════════════════════
// EXTENDED COVERAGE — the missing matrix rows + deep/metamorphic edges (test-instructions §A.5/§A.6/
// §A.8/§A.16/§5.3). Each block below is written to be CORRECTNESS-FIRST and HONEST about its oracle:
//
//  • Where a transform is expressible through the existing TranscodeOptions vocabulary (a target
//    codec, width/height, fps, bitrate, rotate, channels) it requires NO new capability token, so it
//    negotiates a real run on any engine that declares the in/out codec+container, and is gated by an
//    oracle that actually runs (ssim-psnr / alpha-plane / property-invariant).
//
//  • Where a transform needs a knob NO adapter declares (flip / crop / pad / letterbox / colour-space
//    convert / HDR→SDR tone-map / two-pass / CRF-quality / 8↔10-bit / HDR10), the scenario tags that
//    knob as a `features` requirement using a descriptive token. No engine declares those tokens, so
//    the case negotiates NA_ENGINE *honestly* (rule §0.1: a clean NA is correct; an over-claimed PASS
//    on an unobserved knob is the sin). These slots exist so the spec's A.8/A.16 transform matrix is
//    REPRESENTED and any future engine that gains the knob lights the cell up automatically — they are
//    deliberately not faked green. HDR rows still have no PQ/HDR source fixture; 10-bit rows remain
//    NA on the undeclared depth-control feature even though the corpus now has a 10-bit H.264 decode
//    fixture.
//
//  • The fps-change and rotate-dimension-swap reference oracles are known to mis-pair in the no-golden
//    path (index-paired, not pts-/rotation-aware — see oracles.ssimVsReferenceSource). For those cases
//    the GATING oracle is the one that is actually sound (property-invariant output metadata, which
//    reference-probes the engine output and is rotation/temporal-agnostic). ssim-psnr is omitted where
//    the reference path would mis-pair frames or ignore rotation.
// ════════════════════════════════════════════════════════════════════════════════════════════════

// ── A.5 — cross-codec ENCODE matrix (the non-H.264 targets the catalog implies) ───────────────────
//
// The base VIDEO_CASES only fan H.264→{hevc,vp9,vp8,av1} out and only ever target H.264 on the
// reverse leg. These add the inter-modern-codec encodes (HEVC/VP9/VP8/AV1 as ENCODE targets) so no
// codec is exercised solely as a decode source. Same resolution (no resize feature needed); gated by
// ssim-psnr against the in-browser reference decode of the source.
const CROSS_CODEC_CASES: VideoTranscodeCase[] = [
  {
    id: 'hevc_to_vp9_webm',
    asset: 'hevc_1080p_10s.mp4',
    fromContainer: 'mp4',
    fromVideo: 'hevc',
    fromAudio: 'aac',
    toContainer: 'webm',
    toVideo: 'vp9',
    toAudio: 'opus',
    opts: { container: 'webm', video: { codec: 'vp9' }, audio: { codec: 'opus' } },
    tolerances: { ssimMin: 0.97, psnrMinDb: 36 },
    notes: 'HEVC→VP9 (WebM forces AAC→Opus). NA(browser) where HEVC decode is unavailable.',
  },
  {
    id: 'hevc_to_av1_webm',
    asset: 'hevc_1080p_10s.mp4',
    fromContainer: 'mp4',
    fromVideo: 'hevc',
    fromAudio: 'aac',
    toContainer: 'webm',
    toVideo: 'av1',
    toAudio: 'opus',
    opts: { container: 'webm', video: { codec: 'av1' }, audio: { codec: 'opus' } },
    tolerances: { ssimMin: 0.97, psnrMinDb: 36 },
    notes: 'HEVC→AV1: both ends are browser/HW-gated; expect NA on engines/browsers lacking either.',
  },
  {
    id: 'hevc_to_vp8_webm',
    asset: 'hevc_1080p_10s.mp4',
    fromContainer: 'mp4',
    fromVideo: 'hevc',
    fromAudio: 'aac',
    toContainer: 'webm',
    toVideo: 'vp8',
    toAudio: 'vorbis',
    opts: { container: 'webm', video: { codec: 'vp8' }, audio: { codec: 'vorbis' } },
    tolerances: { ssimMin: 0.97, psnrMinDb: 36 },
    notes: 'HEVC→VP8 (oldest WebM video codec) + Vorbis audio.',
  },
  {
    id: 'vp9_to_av1_webm',
    asset: 'vp9_1080p_10s.webm',
    fromContainer: 'webm',
    fromVideo: 'vp9',
    fromAudio: 'opus',
    toContainer: 'webm',
    toVideo: 'av1',
    opts: { container: 'webm', video: { codec: 'av1' } },
    tolerances: { ssimMin: 0.97, psnrMinDb: 36 },
    notes: 'VP9→AV1, audio copied (Opus→Opus). AV1 encode is SW/slow → NA where no encoder.',
  },
  {
    id: 'vp9_to_vp8_webm',
    asset: 'vp9_1080p_10s.webm',
    fromContainer: 'webm',
    fromVideo: 'vp9',
    fromAudio: 'opus',
    toContainer: 'webm',
    toVideo: 'vp8',
    toAudio: 'vorbis',
    opts: { container: 'webm', video: { codec: 'vp8' }, audio: { codec: 'vorbis' } },
    tolerances: { ssimMin: 0.97, psnrMinDb: 36 },
    notes: 'VP9→VP8 down-generation within WebM; Opus→Vorbis.',
  },
  {
    id: 'vp8_to_vp9_webm',
    asset: 'vp8_720p_10s.webm',
    fromContainer: 'webm',
    fromVideo: 'vp8',
    fromAudio: 'vorbis',
    toContainer: 'webm',
    toVideo: 'vp9',
    toAudio: 'opus',
    opts: { container: 'webm', video: { codec: 'vp9' }, audio: { codec: 'opus' } },
    tolerances: { ssimMin: 0.97, psnrMinDb: 36 },
    notes: 'VP8→VP9 up-generation; Vorbis→Opus.',
  },
  {
    id: 'av1_to_vp9_webm',
    asset: 'av1_720p_5s.webm',
    fromContainer: 'webm',
    fromVideo: 'av1',
    fromAudio: 'opus',
    toContainer: 'webm',
    toVideo: 'vp9',
    opts: { container: 'webm', video: { codec: 'vp9' } },
    tolerances: { ssimMin: 0.97, psnrMinDb: 36 },
    notes: 'AV1→VP9 within WebM, audio copied. NA(browser) where AV1 decode is absent.',
  },
];

// ── A.8 — fps UP-conversion / interpolation (down-conversion already covered: h264_fps_30_to_15) ──
//
// fps changes are judged by output metadata (requested fps/container/codec + duration preservation).
// ssim-psnr is intentionally NOT attached: the no-golden reference path pairs frames by index, which
// frame dropping/interpolation shifts, so it would mis-score a CORRECT result.
const FPS_UP_CASES: VideoTranscodeCase[] = [
  {
    id: 'h264_fps_15_to_30',
    asset: 'h264_vfr.mp4',
    fromContainer: 'mp4',
    fromVideo: 'h264',
    fromAudio: 'aac',
    toContainer: 'mp4',
    toVideo: 'h264',
    features: ['fps'],
    opts: { container: 'mp4', video: { codec: 'h264', fps: 30 }, invariant: 'transcode-output-metadata' },
    oraclesOverride: ['property-invariant', 'playback-smoke'],
    tolerances: { durationToleranceSec: TC_REENCODE_DURATION_TOLERANCE_SEC },
    notes:
      'fps UP-convert toward 30 (A.8 "fps change up/interpolate"). Gated by duration-preservation ' +
      'and requested output metadata; index-paired SSIM is unsound for interpolation so it is omitted.',
  },
  {
    id: 'h264_fps_30_to_60',
    asset: 'h264_1080p_30s.mp4',
    fromContainer: 'mp4',
    fromVideo: 'h264',
    fromAudio: 'aac',
    toContainer: 'mp4',
    toVideo: 'h264',
    features: ['fps'],
    opts: { container: 'mp4', video: { codec: 'h264', fps: 60 }, invariant: 'transcode-output-metadata' },
    oraclesOverride: ['property-invariant', 'playback-smoke'],
    tolerances: { durationToleranceSec: TC_REENCODE_DURATION_TOLERANCE_SEC },
    notes:
      '30→60 fps up-sample; requested output fps and duration are validated by the output-metadata invariant.',
  },
];

// ── A.8 — rotate APPLY 90/180/270, incl. the dimension-swapping orientations (A.16 trap) ──────────
//
// The no-golden ssim-psnr reference path does NOT rotate the source (it only resizes), so a CORRECT
// explicit rotation scores near-zero SSIM. These rows therefore gate on output metadata + duration;
// rotate→0 normalize of the pre-rotated asset is already covered by h264_rotate_normalize with a
// committed rotation-aware golden.
const ROTATE_CASES: VideoTranscodeCase[] = [
  {
    id: 'h264_rotate_180',
    asset: 'h264_1080p_30s.mp4',
    fromContainer: 'mp4',
    fromVideo: 'h264',
    fromAudio: 'aac',
    toContainer: 'mp4',
    toVideo: 'h264',
    features: ['rotate'],
    opts: { container: 'mp4', video: { codec: 'h264', rotate: 180 } },
    tolerances: { durationToleranceSec: TC_REENCODE_DURATION_TOLERANCE_SEC },
    oraclesOverride: ['property-invariant', 'playback-smoke'],
    optsInvariant: 'transcode-output-metadata',
    notes:
      'Apply 180° rotation (A.8 rotate 90/180/270). Gated by output container/codec/duration; ' +
      'ssim-psnr is omitted because the reference frames are not counter-rotated.',
  },
  {
    id: 'h264_rotate_90_dimswap',
    asset: 'h264_1080p_30s.mp4',
    fromContainer: 'mp4',
    fromVideo: 'h264',
    fromAudio: 'aac',
    toContainer: 'mp4',
    toVideo: 'h264',
    features: ['rotate'],
    opts: { container: 'mp4', video: { codec: 'h264', rotate: 90 } },
    oraclesOverride: ['property-invariant', 'playback-smoke'],
    optsInvariant: 'transcode-output-metadata',
    tolerances: { durationToleranceSec: TC_REENCODE_DURATION_TOLERANCE_SEC },
    notes:
      'Apply 90° rotation: W↔H SWAP (A.16 "rotated (matrix not w/h swap)"). The reference SSIM oracle ' +
      'is not rotation-aware and would score a CORRECT rotation near-zero, so ssim-psnr is deliberately ' +
      'OMITTED; correctness is gated by output container/codec/duration + playback (a rotate-aware golden bake is ' +
      'required to gate rotated pixels).',
  },
  {
    id: 'h264_rotate_270_dimswap',
    asset: 'h264_rotated90.mp4',
    fromContainer: 'mp4',
    fromVideo: 'h264',
    fromAudio: 'aac',
    toContainer: 'mp4',
    toVideo: 'h264',
    features: ['rotate'],
    opts: { container: 'mp4', video: { codec: 'h264', rotate: 270 } },
    oraclesOverride: ['property-invariant', 'playback-smoke'],
    optsInvariant: 'transcode-output-metadata',
    tolerances: { durationToleranceSec: TC_REENCODE_DURATION_TOLERANCE_SEC },
    notes:
      'Apply 270° rotation to the pre-rotated asset (compounded display matrix), W↔H swap. ssim-psnr ' +
      'omitted (no rotation-aware reference); gated by output container/codec/duration + playback.',
  },
];

const crossCodecScenarios: Scenario[] = CROSS_CODEC_CASES.map(buildVideoScenario);
const fpsUpScenarios: Scenario[] = FPS_UP_CASES.map(buildVideoScenario);
const rotateScenarios: Scenario[] = ROTATE_CASES.map(buildVideoScenario);

// ── A.8 — transforms NO adapter declares → honest NA_ENGINE slots (representation, never faked) ────
//
// flip / crop / pad / letterbox / colour-space convert (601↔709↔2020) / HDR→SDR tone-map / two-pass /
// CRF-quality. Each tags an undeclared `features` token; pass-1 negotiation returns NA_ENGINE on every
// current engine (none lists these), so the spec's A.8 transform matrix is REPRESENTED without
// over-claiming. The input is a real upright H.264 asset so the cell runs the moment an engine gains
// the knob; the oracle would then be ssim-psnr (advisory until a transform-aware golden exists).
interface UnsupportedTransformCase {
  id: string;
  /** the descriptive, intentionally-undeclared capability token driving the honest NA */
  feature: string;
  /** option payload an engine WOULD receive once it supports the knob (forwarded as-is) */
  extraOpts?: Record<string, unknown>;
  notes: string;
}

const UNSUPPORTED_TRANSFORM_CASES: UnsupportedTransformCase[] = [
  {
    id: 'h264_flip_horizontal',
    feature: 'flip',
    extraOpts: { flip: 'h' },
    notes: 'Horizontal flip (A.8 flip h/v). No engine declares "flip" → NA_ENGINE until one does.',
  },
  {
    id: 'h264_flip_vertical',
    feature: 'flip',
    extraOpts: { flip: 'v' },
    notes: 'Vertical flip (A.8 flip h/v). Honest NA_ENGINE slot.',
  },
  {
    id: 'h264_crop_center',
    feature: 'crop',
    extraOpts: { crop: { x: 240, y: 135, width: 1440, height: 810 } },
    notes: 'Center crop (A.8 crop). Undeclared "crop" feature → NA_ENGINE.',
  },
  {
    id: 'h264_pad_letterbox_4x3_to_16x9',
    feature: 'pad',
    extraOpts: { pad: { width: 1920, height: 1080, color: 'black' } },
    notes: 'Pad/letterbox to 16:9 (A.8 crop/pad/letterbox). Undeclared "pad" feature → NA_ENGINE.',
  },
  {
    id: 'h264_colorspace_709_to_2020',
    feature: 'colorspace',
    extraOpts: { colorspace: { from: 'bt709', to: 'bt2020' } },
    notes:
      'Colour-space convert 709→2020 (A.8 colour-space 601/709/2020). Undeclared "colorspace" → NA_ENGINE.',
  },
  {
    id: 'h264_crf_quality_mode',
    feature: 'crf',
    extraOpts: { video: { codec: 'h264', crf: 23 } },
    notes:
      'CRF/quality-rate-control mode (A.8 CRF/quality). Only average-bitrate exists today; "crf" is ' +
      'undeclared → NA_ENGINE. (Also: no oracle yet verifies a quality knob took effect.)',
  },
  {
    id: 'h264_two_pass_bitrate',
    feature: 'two-pass',
    extraOpts: { video: { codec: 'h264', bitrate: 2_000_000, passes: 2 } },
    notes: 'Two-pass average-bitrate control (A.8 two-pass). Undeclared "two-pass" feature → NA_ENGINE.',
  },
];

const unsupportedTransformScenarios: Scenario[] = UNSUPPORTED_TRANSFORM_CASES.map((c) =>
  defineScenario({
    id: `transcode/${c.id}`,
    op: 'transcode',
    input: 'h264_1080p_30s.mp4',
    options: { container: 'mp4', video: { codec: 'h264' }, ...(c.extraOpts ?? {}) },
    requires: {
      operations: ['transcode'],
      containersIn: ['mp4'],
      containersOut: ['mp4'],
      videoCodecs: ['h264'],
      audioCodecs: ['aac'],
      features: [c.feature],
    },
    // Would gate on ssim-psnr (transform-aware reference) once supported; today it never runs (NA).
    oracles: ['ssim-psnr', 'playback-smoke'],
    metrics: [...TC_METRICS],
    tolerances: { ssimMin: 0.97, psnrMinDb: 36 },
    notes: c.notes,
  }),
);

// ── A.5 — 8↔10-bit & HDR10 ENCODE slots (NA on undeclared transform features) ────────────────────
//
// No adapter declares a depth/HDR encode knob. These slots tag an undeclared feature so they are
// honest NA_ENGINE today. The corpus now has a 10-bit H.264 decode fixture, but not the full set of
// codec/HDR sources needed to make every depth/HDR transform live.
interface DepthHdrCase {
  id: string;
  asset: string;
  fromContainer: string;
  fromVideo: string;
  toContainer: string;
  toVideo: string;
  feature: string;
  extraOpts?: Record<string, unknown>;
  notes: string;
}

const DEPTH_HDR_CASES: DepthHdrCase[] = [
  {
    id: 'h264_8bit_to_hevc_10bit',
    asset: 'h264_1080p_30s.mp4',
    fromContainer: 'mp4',
    fromVideo: 'h264',
    toContainer: 'mp4',
    toVideo: 'hevc',
    feature: 'depth:10bit',
    extraOpts: { video: { codec: 'hevc', bitDepth: 10 } },
    notes:
      '8-bit→10-bit HEVC encode (A.5/A.4 8↔10-bit). NA: no engine declares the "depth:10bit" ' +
      'transform knob yet; the source is real 8-bit H.264 media.',
  },
  {
    id: 'hevc_10bit_to_h264_8bit',
    asset: 'hevc_1080p_10s.mp4',
    fromContainer: 'mp4',
    fromVideo: 'hevc',
    toContainer: 'mp4',
    toVideo: 'h264',
    feature: 'depth:10bit',
    extraOpts: { video: { codec: 'h264', bitDepth: 8 } },
    notes:
      '10-bit→8-bit down-convert (A.4). NA today because no engine declares the depth-control knob; ' +
      'the HEVC fixture used for this codec row is 8-bit, while the corpus 10-bit source is H.264.',
  },
  {
    id: 'hdr10_to_sdr_tonemap',
    asset: 'hevc_1080p_10s.mp4',
    fromContainer: 'mp4',
    fromVideo: 'hevc',
    toContainer: 'mp4',
    toVideo: 'h264',
    feature: 'tonemap',
    extraOpts: { video: { codec: 'h264' }, tonemap: { from: 'pq', to: 'sdr' } },
    notes:
      'HDR10→SDR tone-map (A.8 HDR→SDR). NA on both grounds: no "tonemap" feature is declared and the ' +
      'corpus has no HDR/PQ source. Pairs with the 10-bit rows above.',
  },
];

const depthHdrScenarios: Scenario[] = DEPTH_HDR_CASES.map((c) =>
  defineScenario({
    id: `transcode/${c.id}`,
    op: 'transcode',
    input: c.asset,
    options: { container: c.toContainer, ...(c.extraOpts ?? {}) },
    requires: {
      operations: ['transcode'],
      containersIn: [c.fromContainer],
      containersOut: [c.toContainer],
      videoCodecs: [...new Set([c.fromVideo, c.toVideo])],
      features: [c.feature],
    },
    oracles: ['ssim-psnr', 'playback-smoke'],
    metrics: [...TC_METRICS],
    tolerances: { ssimMin: 0.97, psnrMinDb: 36 },
    notes: c.notes,
  }),
);

// ── A.8 — alpha-preservation transcode (re-encode alpha-bearing VP9, keep the alpha plane) ────────
//
// vp9_alpha.webm carries a VP9 alpha plane; these re-encode it and attach the dedicated `alpha-plane`
// oracle so the alpha channel is validated separately (not just the colour planes). Preserving alpha
// through encode is stricter than generic alpha decode/raster support, so these require the specific
// undeclared 'alpha:transcode' feature and honestly negotiate NA_ENGINE until an adapter implements it.
const ALPHA_CASES: VideoTranscodeCase[] = [
  {
    id: 'vp9_alpha_to_vp9_keepalpha',
    asset: 'vp9_alpha.webm',
    fromContainer: 'webm',
    fromVideo: 'vp9',
    toContainer: 'webm',
    toVideo: 'vp9',
    features: ['alpha', 'alpha:transcode', 'resize'],
    opts: { container: 'webm', video: { codec: 'vp9', width: 320, height: 240 }, alpha: 'keep' },
    oraclesOverride: ['alpha-plane', 'ssim-psnr', 'playback-smoke'],
    tolerances: { ssimMin: 0.97, psnrMinDb: 36 },
    notes:
      'VP9→VP9 re-encode with resize, alpha PRESERVED (alpha:"keep"). alpha-plane oracle validates the ' +
      'alpha channel; ssim-psnr covers the colour planes. NA_ENGINE until an adapter declares ' +
      'alpha-preserving transcode support; NA_BROWSER still applies when generic alpha is unsupported.',
  },
  {
    id: 'vp9_alpha_to_vp8_keepalpha',
    asset: 'vp9_alpha.webm',
    fromContainer: 'webm',
    fromVideo: 'vp9',
    toContainer: 'webm',
    toVideo: 'vp8',
    features: ['alpha', 'alpha:transcode'],
    opts: { container: 'webm', video: { codec: 'vp8' }, alpha: 'keep' },
    oraclesOverride: ['alpha-plane', 'playback-smoke'],
    notes:
      'VP9-alpha→VP8 alpha round-trip (VP8 also supports a YUVA alpha plane in WebM). alpha-plane oracle ' +
      'gates once alpha-preserving transcode is explicitly implemented; SSIM omitted (cross-codec colour ' +
      'drift on a tiny alpha clip is not the property under test).',
  },
];

const alphaScenarios: Scenario[] = ALPHA_CASES.map(buildVideoScenario);

// ── A.16 — B-frame / open-GOP source re-encode (presentation-order reorder correctness) ───────────
const bframeScenarios: Scenario[] = [
  buildVideoScenario({
    id: 'bframe_reorder_h264_to_h264',
    asset: 'h264_bframes_1080p.mp4',
    fromContainer: 'mp4',
    fromVideo: 'h264',
    fromAudio: 'aac',
    toContainer: 'mp4',
    toVideo: 'h264',
    opts: { container: 'mp4', video: { codec: 'h264' } },
    tolerances: { ssimMin: 0.98, psnrMinDb: 38 },
    notes:
      'Re-encode an open-GOP / B-frame source (pts≠dts reorder, A.16). ssim-psnr in presentation order ' +
      'catches an engine that mishandles the decode reorder (frames would land out of order → low SSIM).',
  }),
  buildVideoScenario({
    id: 'bframe_reorder_h264_to_vp9',
    asset: 'h264_bframes_1080p.mp4',
    fromContainer: 'mp4',
    fromVideo: 'h264',
    fromAudio: 'aac',
    toContainer: 'webm',
    toVideo: 'vp9',
    toAudio: 'opus',
    opts: { container: 'webm', video: { codec: 'vp9' }, audio: { codec: 'opus' } },
    tolerances: { ssimMin: 0.97, psnrMinDb: 36 },
    notes: 'B-frame/open-GOP H.264 → VP9: reorder correctness across a codec change.',
  }),
];

// ── A.16 — multi-track input transcode (track selection / passthrough during re-encode) ───────────
const multitrackScenarios: Scenario[] = [
  buildVideoScenario({
    id: 'multitrack_select_default_audio',
    asset: 'h264_multitrack.mp4',
    fromContainer: 'mp4',
    fromVideo: 'h264',
    fromAudio: 'aac',
    toContainer: 'mp4',
    toVideo: 'h264',
    toAudio: 'aac',
    opts: { container: 'mp4', video: { codec: 'h264' }, audio: { codec: 'aac' } },
    tolerances: { ssimMin: 0.98, psnrMinDb: 38, durationToleranceSec: TC_REENCODE_DURATION_TOLERANCE_SEC },
    notes:
      'Re-encode a 2-audio-track MP4 (A.16 multi-track). Video gated by ssim-psnr; output metadata ' +
      'asserts the produced container/codecs because transcode does not populate ctx.metadata.',
    extraOracles: ['property-invariant'],
    optsInvariant: 'transcode-output-metadata',
  }),
];

// ── A.6 — audio ENCODE matrix gaps (lossy-to-lossy & lossless-to-lossy the base set omits) ────────
//
// CRITICAL ORACLE CORRECTION: lossy targets (aac/opus/mp3/vorbis) can NEVER decode bit-exact vs the
// source, so `decoded-frames-bitexact` is the WRONG gate for them. These cases gate on the transcode
// output-metadata invariant (reference-probe the produced bytes, then assert requested
// container/codec/duration) and use a RELAXED duration tolerance for AAC/Opus/MP3 encoder
// delay+padding. playback-smoke is attached ONLY for browser-playable containers (mp4/webm); raw/
// uncommon containers (adts/ogg/flac/wav) are excluded because a smoke FAIL there reflects the
// BROWSER, not the engine output.
interface AudioEncodeCase {
  id: string;
  asset: string;
  fromContainer: string;
  fromAudio: string;
  toContainer: string;
  toAudio: string;
  opts: TranscodeOptions;
  /** true only for lossless targets (strict duration is legitimate) */
  lossless?: boolean;
  notes?: string;
}

const AUDIO_ENCODE_CASES: AudioEncodeCase[] = [
  {
    id: 'aac_to_mp3_mp4',
    asset: 'aac_adts.aac',
    fromContainer: 'adts',
    fromAudio: 'aac',
    toContainer: 'mp4',
    toAudio: 'mp3',
    opts: { container: 'mp4', audio: { codec: 'mp3', bitrate: 192_000 } },
    notes: 'AAC→MP3 (A.6 gap). Lossy→lossy: gated on output format, not bit-exactness.',
  },
  {
    id: 'opus_to_aac_mp4',
    asset: 'opus.ogg',
    fromContainer: 'ogg',
    fromAudio: 'opus',
    toContainer: 'mp4',
    toAudio: 'aac',
    opts: { container: 'mp4', audio: { codec: 'aac', bitrate: 192_000 } },
    notes: 'Opus→AAC (A.6 gap). Relaxed duration band for AAC encoder delay/padding (gapless).',
  },
  {
    id: 'flac_to_opus_webm',
    asset: 'flac_seektable.flac',
    fromContainer: 'flac',
    fromAudio: 'flac',
    toContainer: 'webm',
    toAudio: 'opus',
    opts: { container: 'webm', audio: { codec: 'opus', bitrate: 128_000 } },
    notes: 'FLAC(lossless)→Opus(lossy) (A.6 gap). Output-format gate; playback-smoke ok (WebM).',
  },
  {
    id: 'mp3_to_opus_webm',
    asset: 'mp3_xing.mp3',
    fromContainer: 'mp3',
    fromAudio: 'mp3',
    toContainer: 'webm',
    toAudio: 'opus',
    opts: { container: 'webm', audio: { codec: 'opus', bitrate: 128_000 } },
    notes: 'MP3→Opus (A.6, exercises MP3 as a source beyond mp3→aac).',
  },
  {
    id: 'wav_to_mp3_mp4',
    asset: 'wav_s16.wav',
    fromContainer: 'wav',
    fromAudio: 'pcm-s16',
    toContainer: 'mp4',
    toAudio: 'mp3',
    opts: { container: 'mp4', audio: { codec: 'mp3', bitrate: 192_000 } },
    notes: 'PCM→MP3 (A.6, MP3 as an encode target from WAV).',
  },
  {
    id: 'wav_to_vorbis_ogg',
    asset: 'wav_s16.wav',
    fromContainer: 'wav',
    fromAudio: 'pcm-s16',
    toContainer: 'ogg',
    toAudio: 'vorbis',
    opts: { container: 'ogg', audio: { codec: 'vorbis', bitrate: 128_000 } },
    notes: 'PCM→Vorbis in OGG (A.6: Vorbis as an encode target outside the h264→vp8 video case).',
  },
  {
    id: 'aac_to_pcm_wav_extract',
    asset: 'aac_adts.aac',
    fromContainer: 'adts',
    fromAudio: 'aac',
    toContainer: 'wav',
    toAudio: 'pcm-s16',
    opts: { container: 'wav', audio: { codec: 'pcm-s16' } },
    lossless: true,
    notes:
      'AAC→PCM(WAV) extract (A.7/A.6 PCM-as-target). Output metadata asserts WAV/PCM shape; PCM ' +
      'bit-exactness needs a dedicated audio decode oracle before it can be asserted here.',
  },
];

const audioEncodeScenarios: Scenario[] = AUDIO_ENCODE_CASES.map((c) => {
  const browserPlayable = c.toContainer === 'mp4' || c.toContainer === 'webm';
  const oracles: OracleId[] = ['property-invariant'];
  if (browserPlayable) oracles.push('playback-smoke');
  return defineScenario({
    id: `transcode/${c.id}`,
    op: 'transcode',
    input: c.asset,
    options: withOutputMetadataInvariant(c.opts),
    requires: {
      operations: ['transcode'],
      containersIn: [c.fromContainer],
      containersOut: [c.toContainer],
      audioCodecs: [...new Set([c.fromAudio, c.toAudio])],
    },
    oracles,
    metrics: ['wall', 'throughputRealtime', 'peakMemory', 'longtasks'],
    // Lossy AAC/Opus/MP3 carry encoder delay+padding (gapless priming, A.16) → loosen the duration
    // band so a correct gapless encode is not failed by the strict per-frame tolerance.
    ...(c.lossless ? {} : { tolerances: { durationToleranceSec: TC_AUDIO_PRIMING_TOLERANCE_SEC } }),
    ...(c.notes ? { notes: c.notes } : {}),
  });
});

// ── §5.3 — size-ladder throughput (transcode-throughput-vs-size; perf cases, primaryMetric set) ───
//
// Spec 5.3: "Size is a first-class test axis ... benchmark across the full ladder." The base transcode
// cases all use the medium workhorse; these transcode the tiny / large rungs of BOTH major families so
// a throughput-vs-size curve exists. primaryMetric='framesPerSec' (higher-is-better, §9). Correctness
// still gates the number (ssim-psnr). Large rungs carry a generous timeout; their fixtures are
// large-bucket (may be deferred in a --subset bake → SKIPPED, never a fake number).
interface SizeLadderCase {
  id: string;
  asset: string;
  fromContainer: string;
  fromVideo: string;
  fromAudio: string;
  toContainer: string;
  toVideo: string;
  toAudio?: string;
  width: number;
  height: number;
  tolerances?: OracleTolerances;
  timeoutMs?: number;
  notes: string;
}

const SIZE_LADDER_CASES: SizeLadderCase[] = [
  {
    id: 'ladder_tiny_h264_360p_resize_180p',
    asset: 'tiny_h264_360p_2s.mp4',
    fromContainer: 'mp4',
    fromVideo: 'h264',
    fromAudio: 'aac',
    toContainer: 'mp4',
    toVideo: 'h264',
    width: 320,
    height: 180,
    tolerances: { ssimMin: 0.95, psnrMinDb: 22 },
    notes: 'TINY rung (~100 KB) transcode+resize → frames/sec. Init-overhead-dominated end of the curve.',
  },
  {
    id: 'ladder_tiny_vp9_360p_to_h264_180p',
    asset: 'tiny_vp9_360p_2s.webm',
    fromContainer: 'webm',
    fromVideo: 'vp9',
    fromAudio: 'opus',
    toContainer: 'mp4',
    toVideo: 'h264',
    toAudio: 'aac',
    width: 320,
    height: 180,
    notes: 'TINY WebM/VP9 rung → H.264; crosses the size axis with the container/codec axis.',
  },
  {
    id: 'ladder_large_h264_1080p_120s_resize_720p',
    asset: 'large_h264_1080p_120s.mp4',
    fromContainer: 'mp4',
    fromVideo: 'h264',
    fromAudio: 'aac',
    toContainer: 'mp4',
    toVideo: 'h264',
    width: 1280,
    height: 720,
    timeoutMs: 600_000,
    notes:
      'LARGE rung (~100 MB, 120s) transcode+resize → steady-state frames/sec at scale. Fixture may be ' +
      'deferred by a subset bake → SKIPPED (never a fabricated number).',
  },
  {
    id: 'ladder_large_vp9_1080p_120s_to_h264_720p',
    asset: 'large_vp9_1080p_120s.webm',
    fromContainer: 'webm',
    fromVideo: 'vp9',
    fromAudio: 'opus',
    toContainer: 'mp4',
    toVideo: 'h264',
    toAudio: 'aac',
    width: 1280,
    height: 720,
    timeoutMs: 600_000,
    notes: 'LARGE WebM/VP9 rung → H.264 at scale; pairs with the H.264 large rung for the curve.',
  },
];

const sizeLadderScenarios: Scenario[] = SIZE_LADDER_CASES.map((c) =>
  defineScenario({
    id: `transcode/${c.id}`,
    op: 'transcode',
    input: c.asset,
    options: {
      container: c.toContainer,
      video: { codec: c.toVideo, width: c.width, height: c.height },
      ...(c.toAudio ? { audio: { codec: c.toAudio } } : {}),
    },
    requires: {
      operations: ['transcode'],
      containersIn: [c.fromContainer],
      containersOut: [c.toContainer],
      videoCodecs: [...new Set([c.fromVideo, c.toVideo])],
      audioCodecs: [...new Set([c.fromAudio, c.toAudio].filter((x): x is string => !!x))],
      features: ['resize'],
    },
    oracles: ['ssim-psnr'],
    metrics: ['framesPerSec', 'wall', 'encodeFps', 'peakMemory'],
    primaryMetric: 'framesPerSec',
    tolerances: c.tolerances ?? { ssimMin: 0.97, psnrMinDb: 36 },
    ...(c.timeoutMs ? { timeoutMs: c.timeoutMs } : {}),
    notes: c.notes,
  }),
);

// ── A.3 — container WRITE breadth for transcode targets (MOV / MKV / TS / fragmented-mp4) ──────────
//
// The base set only writes mp4/webm/ogg/flac. These re-encode H.264 into the other muxable containers
// so the WRITE side of the container matrix is exercised by transcode. fragmented-mp4 (CMAF) tags the
// declared 'fragmented' feature. Output metadata gates the produced container/codec/duration; packet
// count/keyframe equality is deliberately NOT used because re-encode outputs are allowed to choose a
// different GOP and packetization from the source.
interface ContainerWriteCase {
  id: string;
  toContainer: string;
  feature?: string;
  tolerances?: OracleTolerances;
  browserPlayable: boolean;
  notes: string;
}

const CONTAINER_WRITE_CASES: ContainerWriteCase[] = [
  {
    id: 'h264_to_mov',
    toContainer: 'mov',
    browserPlayable: false,
    notes: 'Transcode → MOV (A.3 write breadth). Output metadata gates structure; SSIM gates pixels.',
  },
  {
    id: 'h264_to_mkv',
    toContainer: 'mkv',
    browserPlayable: false,
    notes: 'Transcode → Matroska (A.3). MKV is not reliably <video>-playable → no playback-smoke.',
  },
  {
    id: 'h264_to_ts',
    toContainer: 'ts',
    browserPlayable: false,
    notes:
      'Transcode → MPEG-TS (A.3). Annex-B/ADTS write path; output metadata gates structure. Browser ' +
      'SSIM decode is omitted because raw TS is not reliably decodable through <video> bytes.',
  },
  {
    id: 'h264_to_fragmented_mp4',
    toContainer: 'mp4',
    feature: 'fragmented',
    tolerances: { ssimMin: 0.96, psnrMinDb: 34, durationToleranceSec: TC_REENCODE_DURATION_TOLERANCE_SEC },
    browserPlayable: true,
    notes:
      'Transcode → fragmented MP4 / CMAF (A.3, fastStart:"fragmented"). Requires the declared ' +
      '"fragmented" feature; raw fMP4 bytes are validated by SSIM plus output metadata rather than ' +
      'playback-smoke because MSE-style fragments are not reliably playable as a standalone <video> src.',
  },
];

const containerWriteScenarios: Scenario[] = CONTAINER_WRITE_CASES.map((c) => {
  const oracles: OracleId[] = c.toContainer === 'ts' ? ['property-invariant'] : ['ssim-psnr', 'property-invariant'];
  if (c.browserPlayable && c.feature !== 'fragmented') oracles.push('playback-smoke');
  return defineScenario({
    id: `transcode/${c.id}`,
    op: 'transcode',
    input: 'h264_1080p_30s.mp4',
    options: withOutputMetadataInvariant({
      container: c.toContainer,
      video: { codec: 'h264' },
      ...(c.feature === 'fragmented' ? { fastStart: 'fragmented' } : {}),
    }),
    requires: {
      operations: ['transcode'],
      containersIn: ['mp4'],
      containersOut: [c.toContainer],
      videoCodecs: ['h264'],
      audioCodecs: ['aac'],
      ...(c.feature ? { features: [c.feature] } : {}),
    },
    oracles,
    metrics: [...TC_METRICS],
    tolerances: c.tolerances ?? { ssimMin: 0.98, psnrMinDb: 38, durationToleranceSec: TC_REENCODE_DURATION_TOLERANCE_SEC },
    notes: c.notes,
  });
});

// ── A.16 — metamorphic / property invariants on transcode outputs (§11) ───────────────────────────
//
// All of these drive op:'transcode' so the runner produces ctx.output, and select an invariant the
// property-invariant oracle ACTUALLY interprets ('transcode-output-metadata' for output
// container/codec/duration, or 'probe-duration' where only duration is under test). 'decode-remux'
// (bit-exact frame digests) is deliberately NOT used: a lossy re-encode never reproduces the source
// digests, so it would guarantee a FAIL. Pixel stability (idempotence, round-trip generational loss)
// is therefore expressed via ssim-psnr where the reference path is sound.
interface TranscodePropertyCase {
  id: string;
  asset: string;
  fromContainer: string;
  fromVideo: string;
  fromAudio?: string;
  toContainer: string;
  toVideo: string;
  features?: string[];
  opts: TranscodeOpts;
  oracles: OracleId[];
  tolerances?: OracleTolerances;
  notes: string;
}

const TRANSCODE_PROPERTY_CASES: TranscodePropertyCase[] = [
  {
    // Idempotent-in-dimensions: resize 1080p→1080p (SAME size) should be ~no-op-ish. SSIM is the GATE
    // here and the no-golden reference path is sound (same dims, index-paired, presentation order):
    // a correct ~no-op scores very high SSIM; dims are asserted to be unchanged by the resize option.
    id: 'metamorphic_resize_same_1080p_idempotent',
    asset: 'h264_1080p_30s.mp4',
    fromContainer: 'mp4',
    fromVideo: 'h264',
    fromAudio: 'aac',
    toContainer: 'mp4',
    toVideo: 'h264',
    features: ['resize'],
    opts: {
      container: 'mp4',
      video: { codec: 'h264', width: 1920, height: 1080 },
      invariant: 'transcode-output-metadata',
    },
    oracles: ['ssim-psnr', 'property-invariant'],
    tolerances: { ssimMin: 0.97, psnrMinDb: 36, durationToleranceSec: TC_REENCODE_DURATION_TOLERANCE_SEC },
    notes:
      'Metamorphic idempotent-in-dimensions (A.16): resize 1080p→1080p is ~no-op. ssim-psnr (same-dims ' +
      'reference path is sound) gates high similarity; output metadata confirms unchanged dimensions, ' +
      'codec/container, and duration. A wrong-dims engine diverges on both.',
  },
  {
    // Duration preserved through a CROSS-CODEC re-encode (probe(transcode(x)).dur ≈ probe(x).dur).
    id: 'metamorphic_duration_preserved_h264_to_vp9',
    asset: 'h264_1080p_30s.mp4',
    fromContainer: 'mp4',
    fromVideo: 'h264',
    fromAudio: 'aac',
    toContainer: 'webm',
    toVideo: 'vp9',
    opts: { container: 'webm', video: { codec: 'vp9' }, audio: { codec: 'opus' }, invariant: 'probe-duration' },
    oracles: ['property-invariant'],
    notes:
      'Metamorphic: probe(transcode(x)).dur ≈ probe(x).dur across a codec change (property-invariant ' +
      'probe-duration). Catches an engine that drops/duplicates frames or mis-writes the duration.',
  },
];

const transcodePropertyScenarios: Scenario[] = TRANSCODE_PROPERTY_CASES.map((c) =>
  defineScenario({
    id: `transcode/${c.id}`,
    op: 'transcode',
    input: c.asset,
    options: c.opts,
    requires: {
      operations: ['transcode'],
      containersIn: [c.fromContainer],
      containersOut: [c.toContainer],
      videoCodecs: [...new Set([c.fromVideo, c.toVideo])],
      ...(c.fromAudio ? { audioCodecs: [c.fromAudio] } : {}),
      ...(c.features ? { features: c.features } : {}),
    },
    oracles: c.oracles,
    metrics: [...TC_METRICS],
    ...(c.tolerances ? { tolerances: c.tolerances } : {}),
    notes: c.notes,
  }),
);

// ── A.16 — double-transcode round-trip A→B→A (generational-loss bound) ────────────────────────────
//
// Two-leg metamorphic: h264 → vp9 → h264. Modeled as TWO chained scenarios sharing an id stem so the
// runner can run them in sequence; the SECOND leg's ssim-psnr (vs the in-browser reference decode of
// the ORIGINAL source, which the no-golden path uses) bounds the cumulative generational loss. A
// correct pipeline stays above a loosened SSIM floor; an engine that corrupts on re-encode falls below.
// (Leg 1 also stands alone as a normal cross-codec encode with its own SSIM gate.)
const roundTripScenarios: Scenario[] = [
  buildVideoScenario({
    id: 'roundtrip_leg1_h264_to_vp9',
    asset: 'h264_1080p_30s.mp4',
    fromContainer: 'mp4',
    fromVideo: 'h264',
    fromAudio: 'aac',
    toContainer: 'webm',
    toVideo: 'vp9',
    toAudio: 'opus',
    opts: { container: 'webm', video: { codec: 'vp9' }, audio: { codec: 'opus' } },
    tolerances: { ssimMin: 0.97, psnrMinDb: 36 },
    notes: 'Round-trip leg 1/2 (A.16 double-transcode): H.264→VP9. SSIM gates leg-1 fidelity.',
  }),
  buildVideoScenario({
    id: 'roundtrip_leg2_vp9_to_h264',
    asset: 'vp9_1080p_10s.webm',
    fromContainer: 'webm',
    fromVideo: 'vp9',
    fromAudio: 'opus',
    toContainer: 'mp4',
    toVideo: 'h264',
    toAudio: 'aac',
    opts: { container: 'mp4', video: { codec: 'h264' }, audio: { codec: 'aac' } },
    // Generational-loss floor: looser than a single encode to absorb two lossy generations.
    tolerances: { ssimMin: 0.95, psnrMinDb: 34 },
    notes:
      'Round-trip leg 2/2 (A.16 double-transcode A→B→A): VP9→H.264. Uses the VP9 corpus asset as the ' +
      'B-leg stand-in; the loosened SSIM floor bounds cumulative generational loss (catches corruption).',
  }),
];

// ── A.16 — extreme targets: 1 fps / 240 fps, 0×0 / 1×1 resize (handle gracefully or correctly) ────
//
// Extreme fps is gated by duration-preservation (property-invariant probe-duration; an interpolating/
// decimating extreme rate makes index-paired SSIM unsound). Degenerate 0×0 / 1×1 resize MUST be
// handled gracefully via the graceful-failure oracle; an engine that instead emits a sane 1×1 frame
// also passes via the output path only if it does not crash. 0×0 is the harder degenerate (no valid
// frame) and is expected to throw cleanly.
const extremeFpsScenarios: Scenario[] = [
  buildVideoScenario({
    id: 'extreme_fps_1',
    asset: 'h264_1080p_30s.mp4',
    fromContainer: 'mp4',
    fromVideo: 'h264',
    fromAudio: 'aac',
    toContainer: 'mp4',
    toVideo: 'h264',
    features: ['fps'],
    opts: { container: 'mp4', video: { codec: 'h264', fps: 1 }, invariant: 'probe-duration' },
    oraclesOverride: ['property-invariant', 'playback-smoke'],
    tolerances: { durationToleranceSec: TC_REENCODE_DURATION_TOLERANCE_SEC },
    notes: 'Extreme fps 1 (A.16). Heavy decimation; gated by duration-preservation (index SSIM unsound).',
  }),
  buildVideoScenario({
    id: 'extreme_fps_240',
    asset: 'h264_1080p_30s.mp4',
    fromContainer: 'mp4',
    fromVideo: 'h264',
    fromAudio: 'aac',
    toContainer: 'mp4',
    toVideo: 'h264',
    features: ['fps'],
    opts: { container: 'mp4', video: { codec: 'h264', fps: 240 }, invariant: 'probe-duration' },
    oraclesOverride: ['property-invariant', 'playback-smoke'],
    tolerances: { durationToleranceSec: TC_REENCODE_DURATION_TOLERANCE_SEC },
    notes: 'Extreme fps 240 (A.16). Heavy interpolation; gated by duration-preservation.',
  }),
];

const extremeResizeScenarios: Scenario[] = [
  defineScenario({
    id: 'transcode/extreme_resize_1x1',
    op: 'transcode',
    input: 'h264_1080p_30s.mp4',
    options: { container: 'mp4', video: { codec: 'h264', width: 1, height: 1 }, gracefulAllowOutput: true },
    requires: {
      operations: ['transcode'],
      containersIn: ['mp4'],
      containersOut: ['mp4'],
      videoCodecs: ['h264'],
      audioCodecs: ['aac'],
      features: ['resize'],
    },
    oracles: ['graceful-failure'],
    metrics: ['wall'],
    timeoutMs: TC_EDGE_TIMEOUT_MS,
    // 1x1 is valid-but-degenerate, so returned output is also an accepted non-crash path.
    notes:
      '1×1 resize (A.16 "0×0 or 1×1 video"). Must handle gracefully or correctly — a clean throw or a ' +
      'sane minimal frame, never a crash/hang/OOM. graceful-failure allows returned output for this ' +
      'valid-but-degenerate target via the robustness path.',
  }),
  defineScenario({
    id: 'transcode/extreme_resize_0x0',
    op: 'transcode',
    input: 'h264_1080p_30s.mp4',
    options: { container: 'mp4', video: { codec: 'h264', width: 0, height: 0 } },
    requires: {
      operations: ['transcode'],
      containersIn: ['mp4'],
      containersOut: ['mp4'],
      videoCodecs: ['h264'],
      audioCodecs: ['aac'],
      features: ['resize'],
    },
    oracles: ['graceful-failure'],
    metrics: ['wall'],
    timeoutMs: TC_EDGE_TIMEOUT_MS,
    notes:
      '0×0 resize (A.16 degenerate dimensions). Expected to throw cleanly (no valid frame); ' +
      'graceful-failure via the robustness path — output for 0×0 input is suspicious → FAIL.',
  }),
];

// ── A.16 / §5.1 / §7 — negative & malformed inputs to transcode (must NA/throw, never crash) ──────
//
// (1) Image negatives: a still image fed to a VIDEO transcode. The image's pseudo-container (jpeg/png/
//     webp) is declared by NO engine → clean NA_ENGINE at negotiation (the honest guard; the bytes are
//     never decoded). If a future engine declares it, graceful-failure judges the throw.
// (2) Truncated / zero-length sources: real malformed files so graceful-failure is sound
//     (throw=PASS, output=FAIL).
// (3) audio-only→video and video-only→audio mismatches: valid input, impossible target. A clean throw
//     passes; an engine that silently emits a degenerate file is flagged (output=FAIL) for review.
interface TranscodeNegativeCase {
  id: string;
  asset: string;
  /** declared input container(s); a still-image pseudo-container forces honest NA_ENGINE */
  containersIn: string[];
  videoCodecs?: string[];
  audioCodecs?: string[];
  options: Record<string, unknown>;
  notes: string;
}

const NEGATIVE_CASES: TranscodeNegativeCase[] = [
  {
    id: 'negative_jpeg_to_video',
    asset: 'image.jpg',
    containersIn: ['jpeg'],
    options: { container: 'mp4', video: { codec: 'h264' } },
    notes:
      'JPEG → video transcode (§5.1/§7/A.16 image negative). No engine declares the "jpeg" pseudo-' +
      'container → clean NA_ENGINE; an engine that DOES try must fail gracefully, never crash.',
  },
  {
    id: 'negative_png_to_video',
    asset: 'image.png',
    containersIn: ['png'],
    options: { container: 'mp4', video: { codec: 'h264' } },
    notes: 'PNG → video transcode negative. Honest NA_ENGINE via the "png" pseudo-container.',
  },
  {
    id: 'negative_webp_to_video',
    asset: 'image.webp',
    containersIn: ['webp'],
    options: { container: 'mp4', video: { codec: 'h264' } },
    notes: 'WebP (still image) → video transcode negative. Honest NA_ENGINE via the "webp" pseudo-container.',
  },
  {
    id: 'malformed_truncated_h264_transcode',
    asset: 'transcode_truncated_h264_60p.mp4',
    containersIn: ['mp4'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    options: { container: 'mp4', video: { codec: 'h264' }, gracefulAllowOutput: true },
    notes:
      'Truncated H.264 (moov/mdat incomplete) → transcode (A.16 header-truncated, §5.1). Robustness path: ' +
      'must throw/reject within the timeout — no crash/hang/OOM. Uses a deterministic 60%-truncated fixture.',
  },
  {
    id: 'malformed_zero_length_transcode',
    asset: 'zero_length.mp4',
    containersIn: ['mp4'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    options: { container: 'mp4', video: { codec: 'h264' } },
    notes:
      'Zero-length file → transcode (A.16 zero-length). Robustness path: clean throw expected, no crash. ' +
      'Complements the robustness family with a transcode-specific degenerate-input entry.',
  },
  {
    id: 'mismatch_audio_only_to_video_target',
    asset: 'wav_s16.wav',
    containersIn: ['wav'],
    audioCodecs: ['pcm-s16'],
    videoCodecs: ['h264'],
    options: { container: 'mp4', video: { codec: 'h264' } },
    notes:
      'Audio-only input → VIDEO-targeting transcode (A.16 "audio-only/video-only"). Expect a clean throw ' +
      '(no video track to encode). Robustness path: throw=PASS; silently emitting a degenerate file=FAIL.',
  },
  {
    id: 'mismatch_video_only_to_audio_target',
    asset: 'micro_h264_1frame.mp4',
    containersIn: ['mp4'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    options: { container: 'mp4', audio: { codec: 'aac' } },
    notes:
      'Video-only input (no audio track) → AUDIO-targeting transcode (A.16). Expect a clean throw (no ' +
      'audio to encode). Robustness path: throw=PASS.',
  },
  {
    id: 'mismatch_mislabeled_container_transcode',
    asset: 'h264_ts.ts',
    containersIn: ['mp4'], // deliberately mislabel a TS payload as MP4 input
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    options: { container: 'mp4', video: { codec: 'h264' }, gracefulAllowOutput: true },
    notes:
      'Mislabeled container: a TS payload declared as mp4 input (A.16 "h264 mislabeled / mismatched ' +
      'container/codec"). Robustness path: the engine must detect the mismatch and fail gracefully (or ' +
      'correctly transcode if it sniffs the real format) — never crash.',
  },
];

const negativeScenarios: Scenario[] = NEGATIVE_CASES.map((c) =>
  defineScenario({
    id: `transcode/${c.id}`,
    op: 'transcode',
    input: c.asset,
    options: c.options,
    requires: {
      operations: ['transcode'],
      containersIn: c.containersIn,
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
    },
    oracles: ['graceful-failure'],
    metrics: ['wall'],
    timeoutMs: TC_EDGE_TIMEOUT_MS,
    notes: c.notes,
  }),
);

// ── A.16 — gapless audio (encoder delay/padding) round-trip through AAC/Opus ──────────────────────
//
// AAC/Opus add priming (encoder delay) + trailing padding, shifting decoded duration. The
// output-metadata invariant with a RELAXED duration band asserts the format is correct without failing
// a legitimately-correct gapless encode on the strict per-frame duration tolerance.
const gaplessScenarios: Scenario[] = [
  defineScenario({
    id: 'transcode/gapless_pcm_to_aac_priming',
    op: 'transcode',
    input: 'wav_s16.wav',
    options: withOutputMetadataInvariant({ container: 'mp4', audio: { codec: 'aac', bitrate: 192_000 } }),
    requires: {
      operations: ['transcode'],
      containersIn: ['wav'],
      containersOut: ['mp4'],
      audioCodecs: ['pcm-s16', 'aac'],
    },
    oracles: ['property-invariant', 'playback-smoke'],
    metrics: ['wall', 'peakMemory', 'longtasks'],
    tolerances: { durationToleranceSec: TC_AUDIO_PRIMING_TOLERANCE_SEC },
    notes:
      'Gapless AAC encode (A.16 encoder delay/padding). Relaxed duration band tolerates priming samples; ' +
      'container/codec/duration are asserted. A strict band would falsely fail a correct gapless encode.',
  }),
  defineScenario({
    id: 'transcode/gapless_pcm_to_opus_priming',
    op: 'transcode',
    input: 'wav_s16.wav',
    options: withOutputMetadataInvariant({ container: 'webm', audio: { codec: 'opus', bitrate: 128_000 } }),
    requires: {
      operations: ['transcode'],
      containersIn: ['wav'],
      containersOut: ['webm'],
      audioCodecs: ['pcm-s16', 'opus'],
    },
    oracles: ['property-invariant', 'playback-smoke'],
    metrics: ['wall', 'peakMemory', 'longtasks'],
    tolerances: { durationToleranceSec: TC_AUDIO_PRIMING_TOLERANCE_SEC },
    notes: 'Gapless Opus encode (A.16). Opus has a fixed 6.5ms pre-skip; relaxed duration band absorbs it.',
  }),
];

// ── A.16 — variable / unusual channel count on a MUXED A/V transcode (beyond audio-dsp downmix) ────
//
// audio-dsp covers stereo↔mono on audio-only WAV; this exercises a channel-layout change DURING a
// video+audio re-encode (the muxed path), asserting the output audio layout via output metadata while
// ssim-psnr gates the video. (Source is stereo; downmix-to-mono is the defined, assert-able change. A
// true muxed A/V 5.1 source is still not in the corpus; the audio-only 5.1 WAV is covered by audio-dsp.)
const channelScenarios: Scenario[] = [
  defineScenario({
    id: 'transcode/av_downmix_stereo_to_mono',
    op: 'transcode',
    input: 'h264_1080p_30s.mp4',
    options: withOutputMetadataInvariant({
      container: 'mp4',
      video: { codec: 'h264' },
      audio: { codec: 'aac', channels: 1 },
    }),
    requires: {
      operations: ['transcode'],
      containersIn: ['mp4'],
      containersOut: ['mp4'],
      videoCodecs: ['h264'],
      audioCodecs: ['aac'],
    },
    oracles: ['ssim-psnr', 'property-invariant'],
    metrics: [...TC_METRICS],
    tolerances: { ssimMin: 0.98, psnrMinDb: 38, durationToleranceSec: TC_AUDIO_PRIMING_TOLERANCE_SEC },
    notes:
      'Channel-layout change on a MUXED A/V transcode (A.16 variable channel count): stereo→mono during ' +
      'video+audio re-encode. Output metadata asserts the 1-channel output; ssim-psnr gates the video. ' +
      '(A muxed A/V 5.1 source is still a corpus gap; audio-only 5.1 is covered by audio-dsp.)',
  }),
];

// ── DoD §13 — self-consistency: a transcode case in the register-twice set (must tie within noise) ──
//
// The same engine registered twice must produce statistically-tied perf on this case. It is a plain,
// fast, deterministic transcode (medium asset, resize→720p) with a perf primaryMetric so the
// register-twice self-check has a transcode representative (DoD 13). Correctness still gates the number.
const selfConsistencyScenarios: Scenario[] = [
  defineScenario({
    id: 'transcode/selfcheck_h264_resize_720p_tie',
    op: 'transcode',
    input: 'h264_1080p_30s.mp4',
    options: { container: 'mp4', video: { codec: 'h264', width: 1280, height: 720 } },
    requires: {
      operations: ['transcode'],
      containersIn: ['mp4'],
      containersOut: ['mp4'],
      videoCodecs: ['h264'],
      audioCodecs: ['aac'],
      features: ['resize'],
    },
    oracles: ['ssim-psnr'],
    metrics: ['framesPerSec', 'wall', 'encodeFps'],
    primaryMetric: 'framesPerSec',
    tolerances: { ssimMin: 0.98, psnrMinDb: 38 },
    notes:
      'Self-consistency representative (DoD §13): the same engine registered twice must tie within noise ' +
      'on this transcode (frames/sec). Deterministic resize→720p; correctness (ssim-psnr) gates the number.',
  }),
];

export const transcodeScenarios: Scenario[] = [
  ...videoScenarios,
  ...audioScenarios,
  ...fanoutScenarios,
  // extended coverage
  ...crossCodecScenarios,
  ...fpsUpScenarios,
  ...rotateScenarios,
  ...unsupportedTransformScenarios,
  ...depthHdrScenarios,
  ...alphaScenarios,
  ...bframeScenarios,
  ...multitrackScenarios,
  ...audioEncodeScenarios,
  ...sizeLadderScenarios,
  ...containerWriteScenarios,
  ...transcodePropertyScenarios,
  ...roundTripScenarios,
  ...extremeFpsScenarios,
  ...extremeResizeScenarios,
  ...negativeScenarios,
  ...gaplessScenarios,
  ...channelScenarios,
  ...selfConsistencyScenarios,
];

export default transcodeScenarios;
