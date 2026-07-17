/**
 * src/scenarios/performance/metamorphic.ts — §A.16 metamorphic / deep-edge cases that pair a
 * correctness INVARIANT with a throughput metric, so the fast path is exercised under the same property
 * the oracle approves (closing the "oracle pass and timed run are independent" gap as far as a scenario
 * can: every iteration runs the SAME op the oracle gates).
 *
 *   1. transcode-idempotent-at-source-res (§A.16 'transcode idempotent in dimensions'):
 *      convert/resize to the SOURCE resolution (1920×1080) is a near no-op in geometry. ssim-psnr with
 *      a TIGHT floor (0.99, no downscale penalty) asserts the output still looks like the source at
 *      1:1 — catching resamplers that distort even at 1:1. A wrong-dimension output mismatches the
 *      reference frames and FAILs. Ranked by framesPerSec. (Frames golden pending → ssim uses the
 *      reference-source fallback today; gates on real golden frames once the frame-bake commits them.)
 *
 *   2. probe-duration-cross-container (§A.16 'probe(x).dur consistent across containers'):
 *      op=remux MP4 → WebM with options.invariant='probe-duration'. The op produces ctx.output, then
 *      property-invariant re-probes the remuxed output via the REFERENCE engine and asserts its
 *      duration ≈ golden duration (the property-invariant 'probe-duration' branch — which needs an
 *      OUTPUT to probe, so it CANNOT run on a bare probe op; remux is the correct carrier). golden meta
 *      is baked TODAY → this ranks for real now. Ranked by throughputRealtime.
 *
 *   3. decode-remux (§A.16 'decode(remux(x)) == decode(x)'):
 *      op=remux MP4 → MKV with options.invariant='decode-remux'. property-invariant decodes ctx.output
 *      and compares frame digests to the golden source-decode (decode(x) baked offline). Exercises the
 *      demux+mux fast path under timing. ALSO carries reference-reimport (packet count/keyframes vs
 *      golden.packets, baked today) so the case still gates SOMETHING now; the frame-digest invariant
 *      gates hard once the frame-bake fills golden frames. Ranked by throughputRealtime.
 *
 *   4. vfr-iterate-packets (§A.16 'VFR nominal vs real fps'): op=demux on the VFR asset (h264_vfr.mp4:
 *      111 video packets over 12.533 s with genuinely irregular PTS — 33/66/100 ms gaps and B-frame
 *      reorder deltas; nominal fps 8.856 ≠ any constant). golden-packets validates the EXACT irregular
 *      packet table (per-packet pts/dts µs), so an engine that fabricates packets from nominal
 *      duration×fps FAILs. Ranked by packetsPerSec — frames/sec accounting must use the real packet
 *      count, not nominal duration. (decode-fps on VFR would need golden frames, still pending — demux
 *      is the honest VFR throughput gate available now.)
 *   4b. vfr-probe-duration: probe the VFR asset gated by golden-metadata — asserts the reported
 *       duration derives from real timestamps, not nominal frame-count/fps. Ranked by opsPerSec.
 */

import { VFR_ASSET, mp4H264In, perfCase, T_FAST } from './_shared.ts';
import type { Scenario } from '../../core/scenario.ts';
import type { TranscodeOptions } from '../../core/engine.ts';

// 1) transcode idempotent at source resolution (1:1 geometry no-op) — tight SSIM floor.
const SOURCE_RES_CONVERT: TranscodeOptions = {
  container: 'webm',
  video: { codec: 'vp9', width: 1920, height: 1080 },
  audio: { codec: 'opus' },
};

const transcodeIdempotent: Scenario = perfCase({
  id: 'performance/metamorphic-transcode-idempotent-source-res',
  op: 'transcode',
  input: 'h264_1080p_30s.mp4',
  options: SOURCE_RES_CONVERT,
  requires: {
    operations: ['transcode'],
    containersIn: ['mp4'],
    containersOut: ['webm'],
    videoCodecs: ['h264', 'vp9'],
    audioCodecs: ['aac', 'opus'],
    features: ['resize'],
  },
  oracles: ['ssim-psnr', 'playback-smoke'],
  metrics: ['framesPerSec', 'encodeFps', 'wall'],
  primary: 'framesPerSec',
  // 1:1 geometry: NO downscale penalty → keep the headline-grade SSIM floor so a 1:1 resampler
  // distortion is caught. (ssim-psnr gates on SSIM mean; the PSNR floor is advisory in the
  // reference-source path — oracles.ts ssimVsReferenceSource.)
  tolerances: { ssimMin: 0.99, psnrMinDb: 40 },
  timeoutMs: T_FAST,
  notes:
    `§A.16 transcode-idempotent-in-dimensions: convert h264_1080p_30s.mp4 → WebM/VP9/Opus at SOURCE ` +
    `1920×1080 (geometry no-op). Tight ssim-psnr floor catches 1:1 resampler distortion. Rank actual ` +
    `output presentation units/sec; no cadence×duration estimate is permitted.`,
});

// 2) probe-duration consistent across containers — remux carries the invariant (probe needs output).
const probeDurationCrossContainer: Scenario = perfCase({
  id: 'performance/metamorphic-probe-duration-cross-container',
  op: 'remux',
  input: 'h264_1080p_30s.mp4',
  options: { container: 'webm', invariant: 'probe-duration' },
  requires: {
    operations: ['remux'],
    containersIn: ['mp4'],
    containersOut: ['webm'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
  },
  oracles: ['property-invariant'],
  metrics: ['throughputRealtime', 'wall'],
  primary: 'throughputRealtime',
  timeoutMs: T_FAST,
  notes:
    `§A.16 probe-duration across containers: remux h264_1080p_30s.mp4 → WebM, then property-invariant ` +
    `re-probes the output and asserts duration ≈ golden. Rank source-presentation seconds / wall-second.`,
});

// 3) decode(remux(x)) == decode(x) — demux+mux fast path under timing; reference-reimport gates now.
const decodeRemux: Scenario = perfCase({
  id: 'performance/metamorphic-decode-remux',
  op: 'remux',
  input: 'h264_1080p_30s.mp4',
  options: { container: 'mkv', invariant: 'decode-remux' },
  requires: {
    operations: ['remux'],
    containersIn: ['mp4'],
    containersOut: ['mkv'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
  },
  oracles: ['property-invariant', 'reference-reimport'],
  metrics: ['throughputRealtime', 'wall'],
  primary: 'throughputRealtime',
  timeoutMs: T_FAST,
  notes:
    `§A.16 decode(remux(x))==decode(x): remux h264_1080p_30s.mp4 → MKV under timing; property-invariant ` +
    `compares decoded output vs golden source-decode (frames pending → gates hard after frame-bake), ` +
    `reference-reimport gates packet count/keyframes now. Rank throughputRealtime.`,
});

// 4) VFR demux — real packet table (irregular PTS), not nominal duration×fps.
const vfrIteratePackets: Scenario = perfCase({
  id: 'performance/metamorphic-vfr-iterate-packets',
  op: 'demux',
  input: VFR_ASSET,
  requires: { ...mp4H264In('demux'), features: ['packets:dts'] },
  oracles: ['golden-packets'],
  metrics: ['packetsPerSec', 'throughputRealtime', 'wall'],
  primary: 'packetsPerSec',
  timeoutMs: T_FAST,
  notes:
    `§A.16 VFR real-vs-nominal fps: demux ${VFR_ASSET} (111 video packets, irregular PTS / B-frame ` +
    `reorder). golden-packets validates the exact irregular table → an engine faking packets from ` +
    `nominal duration×fps FAILs. Rank packets/sec (real count, not nominal).`,
});

// 4b) VFR probe — duration from real timestamps.
const vfrProbeDuration: Scenario = perfCase({
  id: 'performance/metamorphic-vfr-probe-duration',
  op: 'probe',
  input: VFR_ASSET,
  requires: mp4H264In('probe'),
  oracles: ['golden-metadata'],
  metrics: ['opsPerSec', 'wall'],
  primary: 'opsPerSec',
  tolerances: { fpsTolerance: 0.1 },
  timeoutMs: T_FAST,
  notes:
    `§A.16 VFR duration: probe ${VFR_ASSET}, golden-metadata asserts duration derives from real ` +
    `timestamps (not nominal frame-count/fps). Rank ops/sec.`,
});

export const metamorphicScenarios: Scenario[] = [
  transcodeIdempotent,
  probeDurationCrossContainer,
  decodeRemux,
  vfrIteratePackets,
  vfrProbeDuration,
];
