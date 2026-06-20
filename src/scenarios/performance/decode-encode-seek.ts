/**
 * src/scenarios/performance/decode-encode-seek.ts — the §A.14 decode-fps↑ / encode-fps↑ / seek-ms↓
 * headline-adjacent cases. Each is a NAMED §A.14 throughput/latency dimension that had NO performance
 * scenario declaring it as primaryMetric. All three rank by a metric the runner produces and are
 * correctness-gated so a fast-but-wrong engine FAILs.
 *
 *   • decode-fps  (§A.14 'decode fps ↑', §8.3/§A.4): op=decodeFrames on the big-read file, ranked by
 *     decodeFps. Gated by decoded-frames-bitexact (decoded RGBA digests vs golden frame digests).
 *     GOLDEN STATE: h264_1080p_30s.mp4.frames.json is a `pending:true` placeholder (sha256:null) the
 *     in-browser frame-bake has not filled, so loadGolden() drops it → this case FAILs/NAs honestly
 *     ("golden frames pending"), NEVER fabricates, and gates HARD the moment the frame-bake commits
 *     real digests. maxFrames bounds the bench window to a representative prefix.
 *
 *   • encode-fps  (§A.14 'encode fps ↑', §A.5): a STANDALONE encode-throughput case, ranked by
 *     encodeFps — distinct from the headline convert (ranked framesPerSec) and from op-sweep-transcode
 *     (a heavy 1080p→180p DOWNSCALE). This one re-encodes at SOURCE resolution (1920×1080) to VP9/Opus
 *     so the encoder, not the scaler, is the bottleneck. Gated by ssim-psnr (perceptual) + playback-smoke.
 *
 *   • seek-ms     (§A.14 'seek ms/seek ↓'): op=seek to a mid-file VIDEO keyframe, ranked by seekMs
 *     (lower-better; seekMs = wall/seeks, seeks=1). Gated by seek-accuracy against golden.packets
 *     (baked TODAY) — the landed PTS must be within tolerance of a real keyframe at/before the request.
 *
 * SEEK TARGET + TOLERANCE (verified against fixtures/golden/h264_1080p_30s.mp4.packets.json):
 *   The packet table has TWO tracks — video (track 0): 15 keyframes at exact 2 s GOP boundaries
 *   (0, 2_000_000, 4_000_000, … µs); audio (track 1): every packet a keyframe at ~21.3 ms spacing.
 *   seek-accuracy's keyframeAtOrBefore() scans ALL packets, so the "expected" keyframe near a 14 s
 *   request is the nearest AUDIO keyframe (~14 s ∓ ≤22 ms), while a video-accurate engine lands on the
 *   VIDEO keyframe at exactly 14_000_000 µs. To fairly accept either (audio- or video-keyframe snap)
 *   while still rejecting a BROKEN seek (which lands at file start / the wrong GOP, ≥2 s = 2_000_000 µs
 *   away), we request tUs = 14_000_000 (exactly a video keyframe) and widen seekToleranceUs to 50_000
 *   (50 ms ≈ 2 audio-frames / 1.5 video-frames) — far below the ≥2 s error a real seek bug produces.
 */

import {
  BIG_READ_GOLDEN,
  mp4H264In,
  perfCase,
  T_FAST,
} from './_shared.ts';
import type { Scenario } from '../../core/scenario.ts';
import type { TranscodeOptions } from '../../core/engine.ts';

// decode fps — decode a bounded prefix; rank by decodeFps; gate by decoded-frames-bitexact.
const DECODE_MAX_FRAMES = 12; // matches the baked golden prefix and avoids retaining huge RGBA buffers.

const decodeFps: Scenario = perfCase({
  id: 'performance/decode-fps',
  op: 'decodeFrames',
  input: BIG_READ_GOLDEN,
  options: { maxFrames: DECODE_MAX_FRAMES },
  requires: { ...mp4H264In('decodeFrames'), features: ['decode:golden-rgba'] },
  oracles: ['decoded-frames-bitexact'],
  metrics: ['decodeFps', 'framesPerSec', 'wall'],
  primary: 'decodeFps',
  timeoutMs: T_FAST,
  notes:
    `§A.14 decode-fps↑: decode ${DECODE_MAX_FRAMES} frames of ${BIG_READ_GOLDEN}, rank by decodeFps. ` +
    `Gated by decoded-frames-bitexact against the browser/WebCodecs RGBA golden; engines whose decode ` +
    `path cannot normalize to that golden declare no decode:golden-rgba feature and negotiate NA.`,
});

// encode fps — re-encode at SOURCE resolution to VP9/Opus WebM (encoder-bound, no downscale).
const ENCODE_SOURCE_RES: TranscodeOptions = {
  container: 'webm',
  video: { codec: 'vp9', width: 1920, height: 1080 },
  audio: { codec: 'opus' },
};
const T_ENCODE_FPS = 120_000;

const encodeFps: Scenario = perfCase({
  id: 'performance/encode-fps',
  op: 'transcode',
  input: BIG_READ_GOLDEN,
  options: ENCODE_SOURCE_RES,
  requires: {
    operations: ['transcode'],
    containersIn: ['mp4'],
    containersOut: ['webm'],
    videoCodecs: ['h264', 'vp9'],
    audioCodecs: ['aac', 'opus'],
  },
  oracles: ['ssim-psnr', 'playback-smoke'],
  metrics: ['encodeFps', 'framesPerSec', 'throughputRealtime', 'wall'],
  primary: 'encodeFps',
  // Same-resolution re-encode to a different codec: keep the headline-grade SSIM floor (no downscale
  // penalty), modest PSNR floor for cross-codec quantization. (ssim-psnr gates on SSIM mean; PSNR
  // floor is advisory in the reference-source path — see oracles.ts ssimVsReferenceSource.)
  tolerances: { ssimMin: 0.98, psnrMinDb: 38 },
  timeoutMs: T_ENCODE_FPS,
  notes:
    `§A.14 encode-fps↑: re-encode ${BIG_READ_GOLDEN} → WebM/VP9/Opus at SOURCE 1920×1080 (encoder-bound, ` +
    `no scaler), rank by encodeFps. Gated by ssim-psnr + playback-smoke. Distinct from the downscale convert.`,
});

// seek ms — seek to a mid-file video keyframe; rank by seekMs; gate by seek-accuracy (packets golden).
const SEEK_TARGET_US = 14_000_000; // exactly a video keyframe (2 s GOP), mid-file.

const seekMs: Scenario = perfCase({
  id: 'performance/seek-ms',
  op: 'seek',
  input: BIG_READ_GOLDEN,
  options: { tUs: SEEK_TARGET_US },
  requires: mp4H264In('seek'),
  oracles: ['seek-accuracy'],
  metrics: ['seekMs', 'wall'],
  primary: 'seekMs',
  // Accept audio- or video-keyframe snap (≤~22 ms apart) while rejecting a ≥2 s broken-seek error.
  tolerances: { seekToleranceUs: 50_000 },
  timeoutMs: T_FAST,
  notes:
    `§A.14 seek-ms↓: seek ${BIG_READ_GOLDEN} to ${SEEK_TARGET_US}µs (a 2 s-GOP video keyframe), rank by ` +
    `seekMs (lower-better). Gated by seek-accuracy vs golden.packets (baked); ±50 ms band tolerates ` +
    `audio/video keyframe-snap but catches a ≥2 s broken seek.`,
});

export const decodeEncodeSeekScenarios: Scenario[] = [decodeFps, encodeFps, seekMs];
