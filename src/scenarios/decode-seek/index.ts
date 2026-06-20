/**
 * src/scenarios/decode-seek/index.ts — Pillar 1, family "decode-seek".
 *
 * Two ops share this family:
 *  - decodeFrames: pull frames and compare their pixels to golden with tolerance via `ssim-psnr`.
 *    Exercises B-frame reorder (output in pts order), VFR timing, the
 *    codec matrix (H.264/HEVC/VP8/VP9/AV1), the container matrix (mp4/mov/mkv/webm), display-matrix
 *    rotation, non-default track selection, bit depth (8/10), and the SIZE ladder (§5.3 — the decode
 *    fps-vs-size curve A.14/8.2 asks for: tiny → small → medium → large → huge).
 *  - seek: jump to a target time and assert the landed frame via `seek-accuracy` (keyframe seeks
 *    land exactly; non-keyframe seeks land within tolerance). Covers the codec/container matrix (A.7)
 *    AND the seek-OP edges (A.16):
 *    seek-past-EOF, negative seek, backward seek, seek-to-0, repeated idempotent seek.
 *
 * The seek target time is carried in `options.tUs` (microseconds); the keyframe-vs-arbitrary nature
 * is recorded in `options.expectKeyframe` + notes and reflected in the tolerance.
 *
 * METRIC WIRING (§8.3 / §A.14):
 *  - decode cases rank on `decodeFps` (frames/s, higher-better; the size-ladder curve) and carry
 *    `timeToFirstFrame` for decode-latency context (A.14). `decodeFps` is wired at measure.ts:85 from
 *    the FrameSink the runner attaches.
 *  - seek cases rank on `seekMs` (ms/seek, lower-better — the spec's PRIMARY seek headline A.7/A.14),
 *    wired at measure.ts:96 (wallMs / ctx.seeks, with the runner setting ctx.seeks=1). Previously the
 *    seek cases declared only ['wall','longtasks'] so the leaderboard ranked seeks on wall and the
 *    spec's seek number never reached the report; setting primaryMetric:'seekMs' fixes that here (a
 *    scenario-owned concern, in this writer's scope).
 *
 * ASSET-MISSING / DEEP-EDGE policy (§5.4): some A.16 rows need fixtures the bake has not yet produced
 * (10-bit-depth clip, open-GOP-distinct-from-B-frames clip, 1 fps / 240 fps clips, 1×1 / 0×0 clips).
 * Per the honest-NA protocol we STILL register the case against the canonical asset id the bake must
 * emit (recorded in `MISSING_DECODE_ASSETS` below + flagged in notes), so the moment the asset is
 * baked the case activates and golden lines up. Until then the runner records a distinct
 * asset-missing failure (fetch of `/fixtures/media/<id>` 404s) — never a fabricated value, never a
 * silent skip. These ids are NOT in fixtures/manifest.json yet; adding them there is the bake's job.
 *
 * METAMORPHIC invariants (§7) are registered as `property-invariant` cases carrying an `invariant`
 * token. The decode-anchored remux-equivalence invariant maps to the oracle's existing
 * 'decode(remux(x))==decode(x)' handler. The genuinely-new decode/seek invariants
 * (seek-vs-linear-decode, pts-monotonic-after-reorder, vfr-seek-lands-on-true-pts) are computed by
 * the oracle from the operation result plus golden packet/frame timing. The seek invariants assert
 * landed PTS rather than cross-decoder byte-identical pixels, because exact RGBA digests are too
 * strict across independent decoders.
 */

import type { OracleId, OracleTolerances, Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';

/**
 * Canonical ids for fixtures this family needs but the bake does not yet produce (§5.4). Surfaced
 * here so the bake/manifest can add them; cases below reference these ids and activate on bake.
 */
export const MISSING_DECODE_ASSETS: ReadonlyArray<{ id: string; why: string }> = [
  {
    id: 'h264_10bit_1080p_5s.mp4',
    why: 'A.4 8-bit & 10-bit depth: a 10-bit (yuv420p10le, High 10) H.264/HEVC clip so decode of 10-bit depth is exercised. No 10-bit asset is baked today.',
  },
  {
    id: 'h264_open_gop_1080p.mp4',
    why: 'A.16 open-GOP first-frame correctness as a case DISTINCT from B-frame reorder: needs a true open-GOP clip (leading B-frames before the first I/IDR) the corpus lacks.',
  },
  {
    id: 'h264_1fps_30s.mp4',
    why: 'A.16 extreme fps (1 fps): nominal-vs-real low frame-rate decode timing.',
  },
  {
    id: 'h264_240fps_5s.mp4',
    why: 'A.16 extreme fps (240 fps): high frame-rate decode throughput + timestamp density.',
  },
  {
    id: 'h264_1x1_1s.mp4',
    why: 'A.16 1×1 video: minimum-dimension decode (degenerate but legal).',
  },
  {
    id: 'h264_0x0_1s.mp4',
    why: 'A.16 0×0 video: zero-dimension decode → must be graceful/correct, not a crash.',
  },
];

// ── Frame-accurate decode ─────────────────────────────────────────────────────────────────────

interface DecodeCase {
  id: string;
  asset: string;
  container: string;
  videoCodec: string;
  maxFrames?: number;
  /** extra capability features the case requires (e.g. 'rotate' for display-matrix output) */
  features?: string[];
  /** marks a case whose fixture the bake has not produced yet (§5.4) — documented in notes */
  assetMissing?: boolean;
  /** size-ladder bucket this decode point measures (for the decode-fps-vs-size curve) */
  sizeBucket?: string;
  notes?: string;
}

const DECODE_CASES: DecodeCase[] = [
  // ── codec / container correctness (A.4 / A.7) ──
  {
    id: 'decode_h264_first_frames',
    asset: 'h264_1080p_30s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    maxFrames: 60,
    sizeBucket: 'medium',
    notes: 'Linear decode of the first frames; digests must match golden in pts order.',
  },
  {
    id: 'decode_bframes_reorder',
    asset: 'h264_bframes_1080p.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    maxFrames: 60,
    sizeBucket: 'medium',
    notes: 'B-frame reorder: frames must be emitted in presentation (pts) order, not decode order.',
  },
  {
    id: 'decode_vfr_timing',
    asset: 'h264_vfr.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    maxFrames: 60,
    sizeBucket: 'small',
    notes: 'VFR: each frame digest is keyed by its true (uneven) pts; golden encodes the same pts.',
  },
  {
    id: 'decode_hevc',
    asset: 'hevc_1080p_10s.mp4',
    container: 'mp4',
    videoCodec: 'hevc',
    maxFrames: 30,
    sizeBucket: 'medium',
    notes: 'HEVC (hvc1) in MP4. NA(browser) where the browser cannot configure an HEVC decoder.',
  },
  {
    id: 'decode_vp9',
    asset: 'vp9_1080p_10s.webm',
    container: 'webm',
    videoCodec: 'vp9',
    maxFrames: 30,
    sizeBucket: 'medium',
  },
  {
    id: 'decode_vp8',
    asset: 'vp8_720p_10s.webm',
    container: 'webm',
    videoCodec: 'vp8',
    maxFrames: 30,
    sizeBucket: 'small',
  },
  {
    id: 'decode_av1',
    asset: 'av1_720p_5s.webm',
    container: 'webm',
    videoCodec: 'av1',
    maxFrames: 30,
    sizeBucket: 'small',
    notes: 'AV1/WebM decode. NA(browser) where AV1 decode is unavailable (software-only otherwise).',
  },
  {
    id: 'decode_vp9_alpha',
    asset: 'vp9_alpha.webm',
    container: 'webm',
    videoCodec: 'vp9',
    maxFrames: 30,
    notes: 'Alpha track decode; alpha plane compared separately via the alpha-plane oracle.',
  },

  // ── container matrix gaps (A.2/A.7): the mov/mkv decode paths were exercised nowhere ──
  {
    id: 'decode_mov_h264',
    asset: 'h264_1080p_5s.mov',
    container: 'mov',
    videoCodec: 'h264',
    maxFrames: 60,
    sizeBucket: 'small',
    notes:
      'QuickTime .mov decode path (only .mp4/.webm decode existed before). Same H.264/AAC content, ' +
      'QuickTime sample tables / chunk offsets instead of ISOBMFF moov ordering.',
  },
  {
    id: 'decode_mkv_h264',
    asset: 'h264_in_mkv.mkv',
    container: 'mkv',
    videoCodec: 'h264',
    maxFrames: 60,
    sizeBucket: 'small',
    notes:
      'H.264-in-Matroska decode path (Cluster/SimpleBlock timestamps, lacing) — decode-relevant and ' +
      'previously untested; only mp4/webm decode was covered.',
  },

  // ── size axis (A.14 / 8.2 / 5.3): the winner at 4K can differ from 1080p/720p ──
  {
    id: 'decode_h264_4k',
    asset: 'h264_4k_10s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    maxFrames: 30,
    sizeBucket: 'large',
    notes:
      '4K (3840×2160) H.264 decode — size axis per §5.3. May NA(browser) where a 4K-level decode ' +
      'session is unavailable. Distinct decode-fps-vs-size point from the 1080p/720p rungs.',
  },

  // ── display-matrix rotation as a DECODE case (A.16 "rotated (matrix not w/h swap)") ──
  {
    id: 'decode_rotated_display_matrix',
    asset: 'h264_rotated90.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    features: ['rotate'],
    maxFrames: 30,
    sizeBucket: 'small',
    notes:
      'Does the decoder apply the display matrix to OUTPUT PIXELS (content rotated 90°, dims swapped) ' +
      'rather than merely swapping width/height in metadata? Golden frames are the rotated, displayed ' +
      'pixels. This is the decode-side counterpart to the rotation remux edge in robustness.',
  },

  // ── non-default track selection (A.16 "multi-track + non-default track select") ──
  {
    id: 'decode_multitrack_select_video',
    asset: 'h264_multitrack.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    maxFrames: 30,
    sizeBucket: 'small',
    notes:
      'Decode the VIDEO track of a multi-track asset (one H.264 video + two AAC audio tracks); the ' +
      'decoder must select the correct (video) track and ignore the extra audio tracks. multitrack ' +
      'was only demux-tested in robustness before. (options.trackIndex/selectTrack hints the intended ' +
      'video track for engines that expose track selection.)',
  },

  // ── bit depth (A.4 "8-bit & 10-bit depth") — honest asset-missing until the bake adds 10-bit ──
  {
    id: 'decode_h264_10bit',
    asset: 'h264_10bit_1080p_5s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    maxFrames: 30,
    assetMissing: true,
    sizeBucket: 'small',
    notes:
      'A.4 10-bit-depth decode (yuv420p10le / High 10). Fixture NOT yet baked (§5.4): registered so ' +
      'it activates on bake; until then this resolves to a distinct asset-missing failure, never a ' +
      'fabricated value. 10-bit output is normalized to RGBA by the oracle decoder like 8-bit.',
  },

  // ── open-GOP first-frame correctness, distinct from B-frame reorder (A.16) — asset-missing ──
  {
    id: 'decode_open_gop_first_frame',
    asset: 'h264_open_gop_1080p.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    maxFrames: 16,
    assetMissing: true,
    sizeBucket: 'small',
    notes:
      'A.16 open-GOP: leading B-frames precede the first I/IDR, so the very first DISPLAYED frame is ' +
      'not the first DECODED frame. Distinct from decode_bframes_reorder (closed-GOP B-frames). ' +
      'Fixture NOT yet baked (§5.4); registered for activation on bake.',
  },

  // ── extreme fps (A.16 "extreme fps (1 fps, 240 fps)") — asset-missing until baked ──
  {
    id: 'decode_extreme_fps_1',
    asset: 'h264_1fps_30s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    maxFrames: 30,
    assetMissing: true,
    sizeBucket: 'tiny',
    notes: 'A.16 extreme fps (1 fps): low-rate timestamp spacing. Fixture NOT yet baked (§5.4).',
  },
  {
    id: 'decode_extreme_fps_240',
    asset: 'h264_240fps_5s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    maxFrames: 240,
    assetMissing: true,
    sizeBucket: 'small',
    notes: 'A.16 extreme fps (240 fps): dense timestamps / high decode throughput. Fixture NOT yet baked (§5.4).',
  },

  // ── degenerate dimensions (A.16 "0×0 or 1×1 video") — asset-missing until baked ──
  {
    id: 'decode_tiny_dims_1x1',
    asset: 'h264_1x1_1s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    maxFrames: 8,
    assetMissing: true,
    sizeBucket: 'micro',
    notes: 'A.16 1×1 video: minimum-dimension decode (legal but degenerate). Fixture NOT yet baked (§5.4).',
  },
  {
    id: 'decode_tiny_dims_0x0',
    asset: 'h264_0x0_1s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    maxFrames: 8,
    assetMissing: true,
    sizeBucket: 'micro',
    notes: 'A.16 0×0 video: zero-dimension decode → must be graceful/correct, not a crash. Fixture NOT yet baked (§5.4).',
  },
];

const DECODE_ORACLES: OracleId[] = ['ssim-psnr'];
const DECODE_ALPHA_ORACLES: OracleId[] = ['ssim-psnr', 'alpha-plane'];
// decodeFps is the size-ladder headline (frames/s, higher-better); timeToFirstFrame is the decode
// latency line (A.14). wall/peakMemory/longtasks stay for context.
const DECODE_METRICS = ['decodeFps', 'timeToFirstFrame', 'wall', 'peakMemory', 'longtasks'] as const;

const decodeScenarios: Scenario[] = DECODE_CASES.map((c) => {
  const isAlpha = c.id.includes('alpha');
  return defineScenario({
    id: `decode-seek/${c.id}`,
    op: 'decodeFrames',
    input: c.asset,
    options: {
      maxFrames: c.maxFrames ?? 30,
      // For multi-track selection, hint the intended video track for engines that expose it. Engines
      // that auto-select video ignore this; it is read by track-aware adapters only.
      ...(c.id.includes('multitrack') ? { selectTrackType: 'video' } : {}),
    },
    requires: {
      operations: ['decodeFrames'],
      containersIn: [c.container],
      videoCodecs: [c.videoCodec],
      ...(c.features ? { features: isAlpha ? [...c.features, 'alpha'] : c.features } : isAlpha ? { features: ['alpha'] } : {}),
    },
    oracles: isAlpha ? DECODE_ALPHA_ORACLES : DECODE_ORACLES,
    metrics: [...DECODE_METRICS],
    primaryMetric: 'decodeFps',
    ...(c.notes ? { notes: c.notes } : {}),
  });
});

// ── Decode throughput across the SIZE ladder (A.14 / 8.2 / 5.3) ──────────────────────────────────
//
// The decode-fps-vs-size CURVE the spec asks for: one decode point per size bucket per major
// codec/container, so the report can plot decode fps against size and reveal that the winner at
// 10 MB can differ from the winner at 700 MB. These reuse the real corpus rungs (tiny → huge). They
// are correctness-gated by `ssim-psnr` like every decode case (the same leading-N frames are compared
// regardless of file length), and rank on `decodeFps`.

interface SizeLadderCase {
  id: string;
  asset: string;
  container: string;
  videoCodec: string;
  maxFrames: number;
  sizeBucket: string;
  /** the long/huge rungs are gated behind a slow bake; flag so notes are explicit */
  heavyBake?: boolean;
  notes?: string;
}

const SIZE_LADDER_CASES: SizeLadderCase[] = [
  {
    id: 'decode_size_micro_h264_1frame',
    asset: 'micro_h264_1frame.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    maxFrames: 1,
    sizeBucket: 'micro',
    notes: 'Single-frame micro clip: decode latency / per-call overhead floor of the size curve.',
  },
  {
    id: 'decode_size_tiny_h264_360p',
    asset: 'tiny_h264_360p_2s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    maxFrames: 30,
    sizeBucket: 'tiny',
    notes: 'Tiny 360p H.264: low end of the decode-fps-vs-size curve.',
  },
  {
    id: 'decode_size_tiny_vp9_360p',
    asset: 'tiny_vp9_360p_2s.webm',
    container: 'webm',
    videoCodec: 'vp9',
    maxFrames: 30,
    sizeBucket: 'tiny',
    notes: 'Tiny 360p VP9: crosses the size axis with the WebM/VP9 format axis.',
  },
  {
    id: 'decode_size_large_h264_120s',
    asset: 'large_h264_1080p_120s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    maxFrames: 60,
    sizeBucket: 'large',
    heavyBake: true,
    notes:
      'Large (~100 MB, 120 s) 1080p H.264: sustained-decode rung. Decode fps measured over the ' +
      'leading frames (length does not change the per-frame digest). Gated behind a non-skip-longform bake.',
  },
  {
    id: 'decode_size_large_vp9_120s',
    asset: 'large_vp9_1080p_120s.webm',
    container: 'webm',
    videoCodec: 'vp9',
    maxFrames: 60,
    sizeBucket: 'large',
    heavyBake: true,
    notes:
      'Large (~100 MB, 120 s) 1080p VP9: the WebM/VP9 large rung so the size axis crosses the format ' +
      'axis at scale. Gated behind a non-skip-longform bake.',
  },
  {
    id: 'decode_size_huge_h264_600s',
    asset: 'huge_h264_1080p_600s.mov',
    container: 'mov',
    videoCodec: 'h264',
    maxFrames: 60,
    sizeBucket: 'huge',
    heavyBake: true,
    notes:
      'Huge (~500–700 MB, 600 s) 1080p H.264 .mov: top of the decode size curve — lazy/partial read + ' +
      'peak-memory under a multi-hundred-MB input. Decode fps over leading frames. Heavy bake.',
  },
];

const sizeLadderScenarios: Scenario[] = SIZE_LADDER_CASES.map((c) =>
  defineScenario({
    id: `decode-seek/${c.id}`,
    op: 'decodeFrames',
    input: c.asset,
    options: { maxFrames: c.maxFrames },
    requires: {
      operations: ['decodeFrames'],
      containersIn: [c.container],
      videoCodecs: [c.videoCodec],
    },
    oracles: DECODE_ORACLES,
    metrics: [...DECODE_METRICS],
    primaryMetric: 'decodeFps',
    ...(c.notes ? { notes: c.notes } : {}),
  }),
);

// ── Seek ──────────────────────────────────────────────────────────────────────────────────────

interface SeekCase {
  id: string;
  asset: string;
  container: string;
  videoCodec: string;
  /** target time in microseconds (may be negative or past EOF for the seek-op edges) */
  tUs: number;
  /** true when the target time is on a known keyframe (exact landing expected) */
  keyframe: boolean;
  /** A.16 seek-op edge marker (past-EOF / negative / backward / zero / repeated) for notes/grouping */
  edge?: 'past-eof' | 'negative' | 'backward' | 'zero' | 'repeated';
  /** for repeated-seek: the target is issued twice; for backward: a prior forward seek precedes it */
  priorSeekUs?: number;
  tolerances?: OracleTolerances;
  notes?: string;
}

const SEEK_CASES: SeekCase[] = [
  // ── H.264 baseline (kept) ──
  {
    id: 'seek_h264_keyframe',
    asset: 'h264_1080p_30s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    tUs: 4_000_000,
    keyframe: true,
    tolerances: { seekToleranceUs: 0 },
    notes: 'Seek to a known keyframe at 4s; must land exactly on it.',
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

  // ── codec matrix gaps (A.7): seek on HEVC, AV1, VP8, and Matroska ──
  {
    id: 'seek_hevc_keyframe',
    asset: 'hevc_1080p_10s.mp4',
    container: 'mp4',
    videoCodec: 'hevc',
    tUs: 4_000_000,
    keyframe: true,
    tolerances: { seekToleranceUs: 0 },
    notes:
      'HEVC keyframe seek at 4s (only H.264 mp4 and VP9 webm seek existed). NA(browser) where HEVC ' +
      'decode is unconfigurable.',
  },
  {
    id: 'seek_av1_keyframe',
    asset: 'av1_720p_5s.webm',
    container: 'webm',
    videoCodec: 'av1',
    tUs: 2_000_000,
    keyframe: true,
    tolerances: { seekToleranceUs: 0 },
    notes: 'AV1/WebM keyframe seek at 2s. NA(browser) where AV1 decode is unavailable.',
  },
  {
    id: 'seek_vp8_keyframe',
    asset: 'vp8_720p_10s.webm',
    container: 'webm',
    videoCodec: 'vp8',
    tUs: 4_000_000,
    keyframe: true,
    tolerances: { seekToleranceUs: 0 },
    notes: 'VP8/WebM keyframe seek at 4s.',
  },
  {
    id: 'seek_mkv_h264_keyframe',
    asset: 'h264_in_mkv.mkv',
    container: 'mkv',
    videoCodec: 'h264',
    tUs: 4_000_000,
    keyframe: true,
    tolerances: { seekToleranceUs: 0 },
    notes:
      'Matroska Cues/Cluster seek path (untested before): seek to a keyframe at 4s using the MKV Cues ' +
      'index / Cluster timestamps.',
  },

  // ── seek-OP edges (A.16) — these belong HERE (seek-op edges), absent in decode-seek AND robustness ──
  {
    id: 'seek_past_eof',
    asset: 'h264_1080p_30s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    // ~5 minutes past the end of a 30 s clip: must clamp to the last decodable frame, never hang/OOM.
    tUs: 300_000_000,
    keyframe: false,
    edge: 'past-eof',
    // Landing on the last keyframe is acceptable; widen tolerance to "the rest of the clip".
    tolerances: { seekToleranceUs: 2_000_000 },
    notes:
      'A.16 seek-past-EOF: target far beyond duration → engine must clamp to the last decodable frame ' +
      '(or fail gracefully), no crash/hang/OOM. Expected landing is the final keyframe; the wide ' +
      'tolerance reflects "anywhere at/after the last keyframe is correct".',
  },
  {
    id: 'seek_negative',
    asset: 'h264_1080p_30s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    // Negative target: must clamp to 0 / the first frame.
    tUs: -5_000_000,
    keyframe: true,
    edge: 'negative',
    tolerances: { seekToleranceUs: 0 },
    notes:
      'A.16 negative seek: a negative tUs must clamp to 0 (land on the first keyframe / frame), ' +
      'gracefully — never throw on the sign, never seek "before" the start.',
  },
  {
    id: 'seek_zero',
    asset: 'h264_1080p_30s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    tUs: 0,
    keyframe: true,
    edge: 'zero',
    tolerances: { seekToleranceUs: 0 },
    notes: 'Seek to 0: must land deterministically on the first frame (pts 0 keyframe).',
  },
  {
    id: 'seek_repeated_same_target',
    asset: 'h264_1080p_30s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    tUs: 4_000_000,
    keyframe: true,
    edge: 'repeated',
    // Idempotency: seeking to the same keyframe target a second time must land identically.
    tolerances: { seekToleranceUs: 0 },
    notes:
      'Idempotent seek: seeking twice to the same 4s keyframe target must land on the IDENTICAL frame ' +
      '(deterministic landing; no decoder-state drift between the two seeks).',
  },
  {
    id: 'seek_backward_then_forward',
    asset: 'h264_1080p_30s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    // The measured seek is the BACKWARD one (to 2s) after a prior forward seek to 8s; asserts the
    // decoder fully reset its reference state rather than reusing stale forward frames.
    tUs: 2_000_000,
    keyframe: true,
    edge: 'backward',
    priorSeekUs: 8_000_000,
    tolerances: { seekToleranceUs: 0 },
    notes:
      'Backward seek correctness: after a forward seek to 8s, seek BACK to the 2s keyframe; the landed ' +
      'frame must be the correct 2s frame (decoder reference state reset, not stale 8s frames). ' +
      '(options.priorSeekUs records the preceding forward target for engines/harness that replay it.)',
  },
];

const seekScenarios: Scenario[] = SEEK_CASES.map((c) =>
  defineScenario({
    id: `decode-seek/${c.id}`,
    op: 'seek',
    input: c.asset,
    options: {
      tUs: c.tUs,
      expectKeyframe: c.keyframe,
      ...(c.edge ? { seekEdge: c.edge } : {}),
      ...(c.priorSeekUs !== undefined ? { priorSeekUs: c.priorSeekUs } : {}),
    },
    requires: {
      operations: ['seek'],
      containersIn: [c.container],
      videoCodecs: [c.videoCodec],
    },
    oracles: ['seek-accuracy'],
    // seekMs (ms/seek, lower-better) is the spec's PRIMARY seek headline (A.7/A.14), wired at
    // measure.ts:96 from ctx.seeks=1. wall/longtasks stay for context.
    metrics: ['seekMs', 'wall', 'longtasks'],
    primaryMetric: 'seekMs',
    ...(c.tolerances ? { tolerances: c.tolerances } : {}),
    ...(c.notes ? { notes: c.notes } : {}),
  }),
);

// ── Metamorphic / property invariants (§7) ──────────────────────────────────────────────────────
//
// In-family cross-checks that need no external golden frame digests (they compare two of the
// suite's OWN outputs). Registered as `property-invariant` cases carrying an `invariant` token the
// oracle interprets. Where the oracle already implements the token (decode-anchored remux
// equivalence → 'decode(remux(x))==decode(x)') the case is live today; the genuinely-new
// decode/seek invariants are timestamp/property checks rather than cross-decoder byte-identical pixel
// checks. Exact RGBA frame digests are deliberately avoided here because independent decoders may
// differ by small, visually irrelevant pixel deltas.

interface InvariantCase {
  id: string;
  op: 'seek' | 'decodeFrames' | 'remux';
  input: string;
  container: string;
  videoCodec: string;
  containersOut?: string[];
  /** the invariant token (also surfaced in options.invariant for the oracle) */
  invariant: string;
  options?: Record<string, unknown>;
  /** true once oracles.ts implements this invariant token (informational, drives notes wording) */
  oracleImplemented: boolean;
  notes: string;
}

const INVARIANT_CASES: InvariantCase[] = [
  {
    id: 'meta_decode_remux_eq_decode_anchored',
    op: 'remux',
    input: 'h264_1080p_30s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    containersOut: ['mkv'],
    invariant: 'decode(remux(x))==decode(x)',
    options: { container: 'mkv', invariant: 'decode(remux(x))==decode(x)' },
    oracleImplemented: true,
    notes:
      'Decode-ANCHORED remux equivalence: prove from the DECODE oracle\'s side that a lossless remux ' +
      'is pixel-lossless — decode(remux(x)) frame digests == golden decode(x). The robustness family ' +
      'has the remux-anchored variant; this is the decode-family counterpart so the decode oracle ' +
      'itself certifies the remux.',
  },
  {
    id: 'meta_seek_vs_linear_decode',
    op: 'seek',
    input: 'h264_1080p_30s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    invariant: 'seek(t)==linear-decode-frame-at(t)',
    options: { tUs: 4_000_000, expectKeyframe: true, invariant: 'seek(t)==linear-decode-frame-at(t)' },
    oracleImplemented: true,
    notes:
      'METAMORPHIC seek-vs-linear-decode: seek(4s) must land on the same PTS that a linear decode ' +
      'would expose at that keyframe — cross-checks the seek path against decode timing without a ' +
      'cross-decoder bit-exact pixel requirement.',
  },
  {
    id: 'meta_pts_monotonic_after_reorder',
    op: 'decodeFrames',
    input: 'h264_bframes_1080p.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    invariant: 'decode-pts-strictly-increasing',
    options: { maxFrames: 60, invariant: 'decode-pts-strictly-increasing' },
    oracleImplemented: true,
    notes:
      'METAMORPHIC pts-monotonic-after-reorder: decodeFrames output pts must be STRICTLY INCREASING ' +
      '(B-frame reorder correctness) as an explicit in-family invariant, not just implicit golden ' +
      'ordering. Needs no golden.',
  },
  {
    id: 'meta_vfr_seek_lands_on_true_pts',
    op: 'seek',
    input: 'h264_vfr.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    invariant: 'vfr-seek-lands-on-true-pts',
    options: { tUs: 4_250_000, expectKeyframe: false, invariant: 'vfr-seek-lands-on-true-pts' },
    oracleImplemented: true,
    notes:
      'METAMORPHIC vfr-seek-lands-on-true-pts: for the VFR clip, seek(4.25s) must land on the nearest ' +
      'ACTUAL (uneven) frame pts, NOT a nominal-fps grid point — guards the VFR seek tolerance against ' +
      'masking a grid-snapping bug. The landed pts must equal the nearest demuxed real pts.',
  },
];

const invariantScenarios: Scenario[] = INVARIANT_CASES.map((c) =>
  defineScenario({
    id: `decode-seek/${c.id}`,
    op: c.op,
    input: c.input,
    ...(c.options ? { options: c.options } : {}),
    requires: {
      operations: [c.op],
      containersIn: [c.container],
      videoCodecs: [c.videoCodec],
      ...(c.containersOut ? { containersOut: c.containersOut } : {}),
    },
    oracles: ['property-invariant'],
    metrics: ['wall', 'peakMemory', 'longtasks'],
    notes: c.notes,
  }),
);

export const decodeSeekScenarios: Scenario[] = [
  ...decodeScenarios,
  ...sizeLadderScenarios,
  ...seekScenarios,
  ...invariantScenarios,
];

export default decodeSeekScenarios;
