/**
 * src/scenarios/performance/op-sweep.ts — the §8.2 per-operation TIMED throughput sweep.
 *
 * §8.2: "every functional op gets a timed case reporting throughput × real-time." The functional
 * families (probe/demux/remux/transcode/…) already RUN their ops, but most carry only metrics:['wall']
 * with NO primaryMetric, so they are timed yet never RANKED as a throughput sweep, and
 * `throughputRealtime` (mediaSec/wallSec, §8.3) is declared by no scenario at all. This file complements
 * the three headline cases with a per-op sweep on the big-read golden asset, each declaring a real
 * primaryMetric the runner produces, each correctness-gated so a fast-but-wrong op cannot win.
 *
 * ORACLE TRUTH (mirrors remux/_shared.ts + trim/index.ts, the authoritative precedent):
 *   • probe  → golden-metadata reads ctx.metadata (baked meta golden) — gates the probe result.
 *   • demux  → golden-packets reads ctx.demux (baked packets golden)  — gates the full packet table.
 *   • remux  → reference-reimport (re-demux output via reference engine, diff packet count/keyframes
 *              vs golden.packets) + playback-smoke. golden-metadata/golden-packets DON'T observe a
 *              remux output (they read ctx.metadata/ctx.demux, only set for probe/demux) — attaching
 *              them would be a wrong oracle. throughputRealtime is the natural rank for an I/O-bound copy.
 *   • transcode → ssim-psnr (perceptual, gates on golden frames once baked / reference-source fallback
 *                 today) + output-metadata invariant + playback-smoke. Ranked by encodeFps. Re-encode
 *                 outputs may legitimately choose a different WebM packet/GOP layout than the source.
 *
 * METRIC CHOICES (all produced by the runner, all in report's PRIMARY_METRIC_PRIORITY):
 *   probe→opsPerSec, demux→packetsPerSec, remux→throughputRealtime, transcode→encodeFps. wall +
 *   throughputRealtime kept as context where useful.
 *
 * INPUT: BIG_READ_GOLDEN (h264_1080p_30s.mp4), the largest fully-golden 1080p H.264 asset, so each
 * op's throughput is dominated by real work. The size axis (tiny→massive) lives in size-ladder.ts.
 */

import {
  BIG_READ_GOLDEN,
  CONVERT_320x180,
  CONVERT_REQUIRES,
  CONVERT_TOLERANCES,
  mp4H264In,
  perfCase,
  T_FAST,
} from './_shared.ts';
import type { Scenario } from '../../core/scenario.ts';

const T_TRANSCODE_SWEEP = 120_000;

// probe → ops/sec (distinct from the headline extract-metadata only in being part of the named sweep;
// kept with a sweep-specific id so both appear without colliding).
const sweepProbe: Scenario = perfCase({
  id: 'performance/op-sweep-probe',
  op: 'probe',
  input: BIG_READ_GOLDEN,
  requires: mp4H264In('probe'),
  oracles: ['golden-metadata'],
  metrics: ['opsPerSec', 'wall'],
  primary: 'opsPerSec',
  timeoutMs: T_FAST,
  notes:
    `§8.2 per-op sweep — PROBE throughput on ${BIG_READ_GOLDEN}. Score = probes/sec; gated by ` +
    `golden-metadata (ctx.metadata vs golden meta). Complements headline extract-metadata as the ranked sweep entry.`,
});

// demux → packets/sec
const sweepDemux: Scenario = perfCase({
  id: 'performance/op-sweep-demux',
  op: 'demux',
  input: BIG_READ_GOLDEN,
  requires: mp4H264In('demux'),
  oracles: ['golden-packets'],
  metrics: ['packetsPerSec', 'throughputRealtime', 'wall'],
  primary: 'packetsPerSec',
  timeoutMs: T_FAST,
  notes:
    `§8.2 per-op sweep — DEMUX throughput on ${BIG_READ_GOLDEN}. Score = packets/sec (denominator is ` +
    `the demuxed packet count, the same table golden-packets validates). throughputRealtime reported alongside.`,
});

// remux MP4 → MKV → throughput × realtime (I/O-bound sample copy; no re-encode).
const sweepRemux: Scenario = perfCase({
  id: 'performance/op-sweep-remux-mp4-to-mkv',
  op: 'remux',
  input: BIG_READ_GOLDEN,
  options: { container: 'mkv' },
  requires: {
    operations: ['remux'],
    containersIn: ['mp4'],
    containersOut: ['mkv'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
  },
  oracles: ['reference-reimport', 'playback-smoke'],
  metrics: ['throughputRealtime', 'bytesOut', 'wall'],
  primary: 'throughputRealtime',
  timeoutMs: T_FAST,
  notes:
    `§8.2 per-op sweep — REMUX ${BIG_READ_GOLDEN} (MP4 → MKV). Score = throughput × realtime ` +
    `(media-sec/wall-sec). Correctness gated by reference-reimport (packet count/keyframes vs golden) + playback-smoke.`,
});

// transcode → WebM/VP9/Opus @180p → encode fps (heavy re-encode; perceptual gate).
const CONVERT_OUTPUT_METADATA_TOLERANCES = {
  ...CONVERT_TOLERANCES,
  durationToleranceSec: 0.15,
};

const sweepTranscode: Scenario = perfCase({
  id: 'performance/op-sweep-transcode-webm',
  op: 'transcode',
  input: BIG_READ_GOLDEN,
  options: { ...CONVERT_320x180, invariant: 'transcode-output-metadata' },
  requires: CONVERT_REQUIRES,
  oracles: ['ssim-psnr', 'property-invariant', 'playback-smoke'],
  metrics: ['encodeFps', 'framesPerSec', 'throughputRealtime', 'wall'],
  primary: 'encodeFps',
  tolerances: CONVERT_OUTPUT_METADATA_TOLERANCES,
  timeoutMs: T_TRANSCODE_SWEEP,
  notes:
    `§8.2 per-op sweep — TRANSCODE ${BIG_READ_GOLDEN} → WebM/VP9/Opus @320×180. Score = encode fps. ` +
    `Gated by ssim-psnr (perceptual; golden-frame path once baked, reference-source fallback today) + ` +
    `property-invariant output metadata (container/codecs/dimensions/duration; no source packet-count ` +
    `gate for re-encoded WebM) + playback-smoke.`,
});

export const opSweepScenarios: Scenario[] = [sweepProbe, sweepDemux, sweepRemux, sweepTranscode];
