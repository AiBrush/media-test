/**
 * src/scenarios/decode-seek/index.ts — Pillar 1, family "decode-seek".
 *
 * Two ops share this family:
 *  - decodeFrames: pull frames and compare their digests (sha256 of normalized RGBA) to golden via
 *    `decoded-frames-bitexact`. Exercises B-frame reorder (output in pts order) and VFR timing.
 *  - seek: jump to a target time and assert the landed frame via `seek-accuracy` (keyframe seeks
 *    land exactly; non-keyframe seeks land within tolerance) plus `decoded-frames-bitexact` on the
 *    landed frame's digest.
 *
 * The seek target time is carried in `options.tUs` (microseconds); the keyframe-vs-arbitrary nature
 * is recorded in options + notes and reflected in the tolerance.
 */

import type { OracleTolerances, Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';

// ── Frame-accurate decode ─────────────────────────────────────────────────────────────────────

interface DecodeCase {
  id: string;
  asset: string;
  container: string;
  videoCodec: string;
  maxFrames?: number;
  notes?: string;
}

const DECODE_CASES: DecodeCase[] = [
  {
    id: 'decode_h264_first_frames',
    asset: 'h264_1080p_30s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    maxFrames: 60,
    notes: 'Linear decode of the first frames; digests must match golden in pts order.',
  },
  {
    id: 'decode_bframes_reorder',
    asset: 'h264_bframes_1080p.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    maxFrames: 60,
    notes: 'B-frame reorder: frames must be emitted in presentation (pts) order, not decode order.',
  },
  {
    id: 'decode_vfr_timing',
    asset: 'h264_vfr.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    maxFrames: 60,
    notes: 'VFR: each frame digest is keyed by its true (uneven) pts; golden encodes the same pts.',
  },
  {
    id: 'decode_hevc',
    asset: 'hevc_1080p_10s.mp4',
    container: 'mp4',
    videoCodec: 'hevc',
    maxFrames: 30,
  },
  {
    id: 'decode_vp9',
    asset: 'vp9_1080p_10s.webm',
    container: 'webm',
    videoCodec: 'vp9',
    maxFrames: 30,
  },
  {
    id: 'decode_vp8',
    asset: 'vp8_720p_10s.webm',
    container: 'webm',
    videoCodec: 'vp8',
    maxFrames: 30,
  },
  {
    id: 'decode_av1',
    asset: 'av1_720p_5s.webm',
    container: 'webm',
    videoCodec: 'av1',
    maxFrames: 30,
  },
  {
    id: 'decode_vp9_alpha',
    asset: 'vp9_alpha.webm',
    container: 'webm',
    videoCodec: 'vp9',
    maxFrames: 30,
    notes: 'Alpha track decode; alpha plane compared separately via the alpha-plane oracle.',
  },
];

const decodeScenarios: Scenario[] = DECODE_CASES.map((c) => {
  const isAlpha = c.id.includes('alpha');
  return defineScenario({
    id: `decode-seek/${c.id}`,
    op: 'decodeFrames',
    input: c.asset,
    options: { maxFrames: c.maxFrames ?? 30 },
    requires: {
      operations: ['decodeFrames'],
      containersIn: [c.container],
      videoCodecs: [c.videoCodec],
      ...(isAlpha ? { features: ['alpha'] } : {}),
    },
    oracles: isAlpha ? ['decoded-frames-bitexact', 'alpha-plane'] : ['decoded-frames-bitexact'],
    metrics: ['wall', 'decodeFps', 'peakMemory', 'longtasks'],
    ...(c.notes ? { notes: c.notes } : {}),
  });
});

// ── Seek ──────────────────────────────────────────────────────────────────────────────────────

interface SeekCase {
  id: string;
  asset: string;
  container: string;
  videoCodec: string;
  /** target time in microseconds */
  tUs: number;
  /** true when the target time is on a known keyframe (exact landing expected) */
  keyframe: boolean;
  tolerances?: OracleTolerances;
  notes?: string;
}

const SEEK_CASES: SeekCase[] = [
  {
    id: 'seek_h264_keyframe',
    asset: 'h264_1080p_30s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    tUs: 5_000_000,
    keyframe: true,
    tolerances: { seekToleranceUs: 0 },
    notes: 'Seek to a known keyframe at 5s; must land exactly on it.',
  },
  {
    id: 'seek_h264_nonkeyframe',
    asset: 'h264_1080p_30s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    tUs: 7_333_000,
    keyframe: false,
    // Non-keyframe seek: engine decodes from the prior keyframe; landed pts within one GOP/tolerance.
    tolerances: { seekToleranceUs: 100_000 },
    notes: 'Arbitrary (non-keyframe) target 7.333s; lands on the nearest decodable frame within tol.',
  },
  {
    id: 'seek_bframes_midgop',
    asset: 'h264_bframes_1080p.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    tUs: 3_500_000,
    keyframe: false,
    tolerances: { seekToleranceUs: 100_000 },
    notes: 'Seek into a B-frame run: decoded frame must be the correct pts despite reorder.',
  },
  {
    id: 'seek_vfr_arbitrary',
    asset: 'h264_vfr.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    tUs: 4_250_000,
    keyframe: false,
    // VFR: frame spacing is uneven, so accuracy is judged against the nearest true pts.
    tolerances: { seekToleranceUs: 150_000 },
    notes: 'VFR seek: landing tolerance widened because frame intervals are non-uniform.',
  },
  {
    id: 'seek_vp9_keyframe',
    asset: 'vp9_1080p_10s.webm',
    container: 'webm',
    videoCodec: 'vp9',
    tUs: 4_000_000,
    keyframe: true,
    tolerances: { seekToleranceUs: 0 },
    notes: 'WebM/VP9 keyframe seek at 4s via Cues.',
  },
];

const seekScenarios: Scenario[] = SEEK_CASES.map((c) =>
  defineScenario({
    id: `decode-seek/${c.id}`,
    op: 'seek',
    input: c.asset,
    options: { tUs: c.tUs, expectKeyframe: c.keyframe },
    requires: {
      operations: ['seek'],
      containersIn: [c.container],
      videoCodecs: [c.videoCodec],
    },
    oracles: ['seek-accuracy', 'decoded-frames-bitexact'],
    metrics: ['wall', 'longtasks'],
    ...(c.tolerances ? { tolerances: c.tolerances } : {}),
    ...(c.notes ? { notes: c.notes } : {}),
  }),
);

export const decodeSeekScenarios: Scenario[] = [...decodeScenarios, ...seekScenarios];

export default decodeSeekScenarios;
