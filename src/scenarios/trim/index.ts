/**
 * src/scenarios/trim/index.ts — Pillar 1, family "trim".
 *
 * Cut a sub-range out of the input. Two modes:
 *  - keyframe-aligned (frameAccurate: false): fast, copy-only; the cut snaps to the enclosing
 *    keyframe boundaries. Oracle asserts output duration ≈ the (snapped) requested range and the
 *    boundary frames vs golden.
 *  - frame-accurate (frameAccurate: true): re-encodes the leading GOP so the cut is exact;
 *    requires the 'trim:frame-accurate' feature.
 *
 * The `trim-boundaries` oracle checks probe(out).dur ≈ requested AND the first/last frames match
 * golden. Range is carried in options.range {startUs, endUs}; mode in options.frameAccurate.
 */

import type { OracleTolerances, Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';

interface TrimCase {
  id: string;
  asset: string;
  container: string;
  videoCodec?: string;
  audioCodec?: string;
  startUs: number;
  endUs: number;
  frameAccurate: boolean;
  tolerances?: OracleTolerances;
  notes?: string;
}

const TRIM_CASES: TrimCase[] = [
  // ── Keyframe-aligned (copy) trims ──
  {
    id: 'h264_keyframe_aligned',
    asset: 'h264_1080p_30s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    startUs: 2_000_000,
    endUs: 8_000_000,
    frameAccurate: false,
    // Snaps to keyframes, so allow up to ~1 GOP of slack on each boundary.
    tolerances: { durationToleranceSec: 0.5 },
    notes: 'Copy-trim 2s–8s snapping to keyframes; duration within one GOP of requested.',
  },
  {
    id: 'h264_keyframe_aligned_short',
    asset: 'h264_1080p_30s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    startUs: 10_000_000,
    endUs: 12_000_000,
    frameAccurate: false,
    tolerances: { durationToleranceSec: 0.5 },
    notes: 'Short 2s copy-trim deeper in the file.',
  },
  {
    id: 'vp9_keyframe_aligned',
    asset: 'vp9_1080p_10s.webm',
    container: 'webm',
    videoCodec: 'vp9',
    audioCodec: 'opus',
    startUs: 1_000_000,
    endUs: 5_000_000,
    frameAccurate: false,
    tolerances: { durationToleranceSec: 0.5 },
    notes: 'WebM/VP9 copy-trim using Cues for keyframe boundaries.',
  },
  {
    id: 'audio_mp3_copy',
    asset: 'mp3_xing.mp3',
    container: 'mp3',
    audioCodec: 'mp3',
    startUs: 5_000_000,
    endUs: 15_000_000,
    frameAccurate: false,
    tolerances: { durationToleranceSec: 0.1 },
    notes: 'Audio-only copy-trim; MP3 frame boundaries are dense so duration is tight.',
  },

  // ── Frame-accurate (re-encode leading GOP) trims ──
  {
    id: 'h264_frame_accurate',
    asset: 'h264_1080p_30s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    startUs: 2_033_000,
    endUs: 7_966_000,
    frameAccurate: true,
    // Exact cut: duration matches requested within ~1 frame.
    tolerances: { durationToleranceSec: 0.05 },
    notes: 'Frame-accurate 2.033s–7.966s; leading GOP re-encoded; boundary frames vs golden.',
  },
  {
    id: 'h264_bframes_frame_accurate',
    asset: 'h264_bframes_1080p.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    startUs: 1_500_000,
    endUs: 4_500_000,
    frameAccurate: true,
    tolerances: { durationToleranceSec: 0.05 },
    notes: 'Frame-accurate cut through a B-frame run; reorder must not corrupt the boundary frame.',
  },
  {
    id: 'h264_vfr_frame_accurate',
    asset: 'h264_vfr.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    startUs: 3_000_000,
    endUs: 6_000_000,
    frameAccurate: true,
    // VFR boundary timestamps are uneven; widen duration tolerance slightly.
    tolerances: { durationToleranceSec: 0.1 },
    notes: 'Frame-accurate trim of VFR content; tests exact-cut on non-uniform timestamps.',
  },
];

export const trimScenarios: Scenario[] = TRIM_CASES.map((c) =>
  defineScenario({
    id: `trim/${c.id}`,
    op: 'trim',
    input: c.asset,
    options: {
      container: c.container,
      frameAccurate: c.frameAccurate,
      range: { startUs: c.startUs, endUs: c.endUs },
    },
    requires: {
      operations: ['trim'],
      containersIn: [c.container],
      containersOut: [c.container],
      ...(c.videoCodec ? { videoCodecs: [c.videoCodec] } : {}),
      ...(c.audioCodec ? { audioCodecs: [c.audioCodec] } : {}),
      ...(c.frameAccurate ? { features: ['trim:frame-accurate'] } : {}),
    },
    oracles: ['trim-boundaries'],
    metrics: ['wall', 'throughputRealtime', 'peakMemory', 'targetWrites', 'longtasks'],
    ...(c.tolerances ? { tolerances: c.tolerances } : {}),
    ...(c.notes ? { notes: c.notes } : {}),
  }),
);

export default trimScenarios;
