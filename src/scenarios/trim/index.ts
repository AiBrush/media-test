/**
 * src/scenarios/trim/index.ts — Pillar 1, family "trim".
 *
 * Cut a sub-range out of the input. Two modes:
 *  - keyframe-aligned (frameAccurate: false): fast, copy-only; the cut snaps to the enclosing
 *    keyframe boundaries. Oracle asserts output duration ≈ the requested range within a GOP budget.
 *  - frame-accurate (frameAccurate: true): re-encodes the leading GOP so the cut is exact;
 *    requires the 'trim:frame-accurate' feature.
 *
 * The `trim-boundaries` oracle checks probe(out).dur ≈ requested. Boundary-frame digests are compared
 * only when trim-range-specific golden declares the same {startUs,endUs}; source-prefix golden is not
 * a valid boundary oracle for sub-range trims. Range is carried in options.range {startUs, endUs};
 * mode in options.frameAccurate.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * ORACLE-STRENGTH NOTE (correctness GATES every number, §0.1; honest capabilities, §0; cite dossier).
 *
 * `trim-boundaries` must not compare a trimmed output to source-opening frame golden. Golden is keyed
 * off the SOURCE asset id (`loadGolden(primaryInput.id)`), so the source `.frames.json` is only an
 * opening prefix of the whole file. For a trim whose boundary is not inside that exact prefix, digest
 * comparison is a wrong oracle. The trim oracle therefore keeps duration as the live gate and compares
 * boundary digests only after a future bake/runner path provides trim-range-specific golden.
 *
 * We make video sub-range trims stronger than duration-only WITHOUT introducing a wrong oracle by
 * adding — where the browser reliably plays the output container — one extra oracle that does not
 * depend on source-keyed boundary golden:
 *
 *   • `playback-smoke` — the trimmed bytes must be a VALID, PLAYABLE container that a <video>
 *                        element advances a few frames on. Catches the
 *                        "structurally-broken-but-platform-decodable" output the dossier calls out
 *                        (bad moov / wrong edit list / negative ctts that decodeWithPlatform might
 *                        tolerate but a real player rejects). It has NO source-keyed dependency, so
 *                        it cannot mis-fire on a correct trim.
 *
 * We DELIBERATELY do NOT add `reference-reimport` to sub-range trims: that oracle compares the
 * output packet/keyframe COUNT against `ctx.golden.packets`, which is the FULL-SOURCE packet table
 * (golden is keyed off the source id). A correct 6s cut of a 30s file has ~1/5 the packets, so
 * `reference-reimport` would FAIL a correct sub-range trim — the precise §0.1 wrong-oracle trap
 * (FAILing a correct engine). `reference-reimport` is therefore used ONLY on the full-range / no-op
 * idempotent trims (output packet count ≈ source), where it is sound.
 *
 * These are STRICTLY ADDITIONAL gates (all declared oracles must pass). They do not pretend to verify
 * the cut LANDED at the right decoded frame; only trim-range-specific golden can do that. `playback-
 * smoke` is attached only where it is HONEST for the current helper: video containers a platform
 * <video> element reliably plays (mp4/mov/webm). Audio-only outputs (mp3/ogg/wav/adts/flac/aiff)
 * rely on the audio-appropriate duration gate in `trim-boundaries` until the harness has an <audio>
 * playback smoke or decoded-PCM oracle. For raw / non-<video> containers (MKV, MPEG-TS, ADTS .aac,
 * AIFF, FLAC) we also attach NO extra oracle rather than over-claim a playback the browser may not
 * honor (over-claim → spurious FAIL is the §0 anti-pattern we avoid). The ±duration tolerance per
 * case is the same ±1-GOP (copy) / ±1-frame (frame-accurate) budget the existing cases use.
 *
 * GOLDEN-TODO (for the bake, NOT writable here): bake per-(asset,startUs,endUs) boundary golden at
 * `fixtures/golden/<asset>__<start>_<end>.trim.frames.json` and have the oracle/runner load it keyed
 * by scenario range. Until then, source-prefix frame golden is deliberately ignored for trim boundary
 * digest checks.
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 */

import type { OracleId, OracleTolerances, Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';

// ── Default metric sets ─────────────────────────────────────────────────────────────────────────

/** Functional trim metrics (correctness gates them; recorded for context, no leaderboard ranking). */
const TRIM_METRICS = ['wall', 'throughputRealtime', 'peakMemory', 'targetWrites', 'longtasks'] as const;

/**
 * Size-ladder trim metrics (§5.3): wall + peakMemory + sourceReads are the first-class axes the spec
 * mandates for sustained-throughput / lazy-read behavior. A copy-trim that buffers the WHOLE file
 * (instead of Range-reading only the kept GOPs) shows up as rising sourceReads/peakMemory here —
 * which medium-only cases cannot reveal.
 */
const TRIM_LADDER_METRICS = [
  'wall',
  'throughputRealtime',
  'peakMemory',
  'sourceReads',
  'targetWrites',
  'longtasks',
] as const;

// ── Real trim cases (copy + frame-accurate) ─────────────────────────────────────────────────────

interface TrimCase {
  id: string;
  asset: string;
  /** source container token (== output container; trim keeps the wrapper) */
  container: string;
  videoCodec?: string;
  audioCodec?: string;
  startUs: number;
  endUs: number;
  frameAccurate: boolean;
  tolerances?: OracleTolerances;
  /**
   * Extra oracles BEYOND `trim-boundaries`, gated honestly per container (see ORACLE-STRENGTH NOTE).
   * Omit for containers the browser <video> cannot reliably play / the reference cannot demux.
   */
  extraOracles?: OracleId[];
  /** declare frame-accurate without re-stating frameAccurate=true in requires.features. */
  size?: 'normal' | 'ladder';
  /** declared additional capability features (e.g. 'rotate','alpha','fragmented'). */
  features?: string[];
  /** Extra engine options for robustness/todo cases. */
  extraOptions?: Record<string, unknown>;
  /** per-case primary leaderboard metric (only meaningful for the size-ladder perf rungs). */
  primaryMetric?: Scenario['primaryMetric'];
  /** hard per-row timeout for large/longform trim rungs. */
  timeoutMs?: number;
  notes?: string;
}

// WHY `reference-reimport` is NOT used on sub-range trims (correctness, §0.1 — never a wrong oracle):
// the `reference-reimport` oracle compares the OUTPUT packet/keyframe COUNT against
// `ctx.golden.packets`, which is keyed off the SOURCE asset (the FULL file — `loadGolden(source.id)`,
// runner.ts:564). Source `packets.json` golden EXISTS for these assets (e.g. h264_1080p_30s.mp4 =
// 2308 packets), so a CORRECT 6s sub-range trim (~462 packets) would FAIL the `withinRel(…,2%)`
// packet-count check (oracles.ts:635) and the keyframe-count check — a wrong oracle that FAILs a
// correct engine. We therefore reserve `reference-reimport` for ONLY the full-range / no-op trims,
// where output packet count ≈ source packet count (the idempotent cases below). For VIDEO sub-range
// trims the strongest HONEST extra gate is `playback-smoke` (the output must be a valid, playable
// <video> container) — which has no source-keyed dependency and cannot mis-fire on a correct trim.

/** Extra gate for a sub-range trim whose output container a <video> element plays. */
const PLAYABLE_AV: OracleId[] = ['playback-smoke'];
/** Audio-only trims currently have no decoded-PCM or <audio> smoke oracle; duration is the honest gate. */
const PLAYABLE_AUDIO: OracleId[] = [];
/**
 * Sub-range trim whose output container <video> cannot reliably play and on which `reference-reimport`
 * would mis-fire (full-source packet golden). No safe ADDITIONAL gate exists, so these rely on
 * `trim-boundaries` alone — exactly as strong as the original copy cases.
 */
const BOUNDARIES_ONLY: OracleId[] = [];

const TRIM_CASES: TrimCase[] = [
  // ══ EXISTING CASES — preserved verbatim (currently-working behavior) ════════════════════════════
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
    tolerances: { durationToleranceSec: 1.1 },
    extraOracles: PLAYABLE_AV,
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
    tolerances: { durationToleranceSec: 1.1 },
    extraOracles: PLAYABLE_AV,
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
    tolerances: { durationToleranceSec: 1.1 },
    extraOracles: PLAYABLE_AV,
    notes: 'WebM/VP9 copy-trim using Cues for keyframe boundaries.',
  },
  {
    id: 'audio_mp3_copy',
    asset: 'mp3_xing.mp3',
    container: 'mp3',
    audioCodec: 'mp3',
    startUs: 5_000_000,
    endUs: 10_000_000,
    frameAccurate: false,
    tolerances: { durationToleranceSec: 0.1 },
    extraOracles: PLAYABLE_AUDIO,
    notes: 'Audio-only copy-trim through EOF of the 10s fixture; MP3 frame boundaries are dense so duration is tight.',
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
    // Exact cut: muxed A/V duration quantizes by a couple of frames across engines.
    tolerances: { durationToleranceSec: 0.1 },
    extraOracles: PLAYABLE_AV,
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
    tolerances: { durationToleranceSec: 0.1 },
    extraOracles: PLAYABLE_AV,
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
    extraOracles: PLAYABLE_AV,
    notes: 'Frame-accurate trim of VFR content; tests exact-cut on non-uniform timestamps.',
  },

  // ══ NEW: CODEC-MATRIX coverage (A.7 codec matrix × trim — every codec/container must be a case) ══

  // HEVC/H.265 trim — copy + frame-accurate. NA(browser) where HEVC decode/encode is unavailable
  // (Firefox / WebKit-no-HW); still must EXIST as a case (dossier missingCases #1).
  {
    id: 'hevc_keyframe_aligned',
    asset: 'hevc_1080p_10s.mp4',
    container: 'mp4',
    videoCodec: 'hevc',
    audioCodec: 'aac',
    startUs: 2_000_000,
    endUs: 6_000_000,
    frameAccurate: false,
    tolerances: { durationToleranceSec: 1.1 },
    extraOracles: PLAYABLE_AV,
    notes: 'HEVC (hvc1) copy-trim; NA(browser) where HEVC unsupported.',
  },
  {
    id: 'hevc_frame_accurate',
    asset: 'hevc_1080p_10s.mp4',
    container: 'mp4',
    videoCodec: 'hevc',
    audioCodec: 'aac',
    startUs: 2_500_000,
    endUs: 6_500_000,
    frameAccurate: true,
    tolerances: { durationToleranceSec: 0.1 },
    extraOracles: PLAYABLE_AV,
    notes: 'HEVC frame-accurate trim (leading GOP re-encode requires an HEVC encoder); NA where unsupported.',
  },

  // MOV/QuickTime container trim — corpus has h264_1080p_5s.mov (dossier missingCases #2).
  {
    id: 'mov_keyframe_aligned',
    asset: 'h264_1080p_5s.mov',
    container: 'mov',
    videoCodec: 'h264',
    audioCodec: 'aac',
    startUs: 1_000_000,
    endUs: 4_000_000,
    frameAccurate: false,
    tolerances: { durationToleranceSec: 1.1 },
    extraOracles: PLAYABLE_AV,
    notes: 'QuickTime MOV copy-trim; preserves the QT atom/edit-list structure.',
  },

  // Matroska (MKV, non-WebM) trim — h264_in_mkv.mkv; MKV copy-trim via Cues is distinct from WebM
  // (dossier missingCases #3). <video> may not play raw .mkv reliably → reimport-only gate.
  {
    id: 'mkv_keyframe_aligned',
    asset: 'h264_in_mkv.mkv',
    container: 'mkv',
    videoCodec: 'h264',
    audioCodec: 'aac',
    startUs: 1_000_000,
    endUs: 5_000_000,
    frameAccurate: false,
    tolerances: { durationToleranceSec: 1.1 },
    extraOracles: BOUNDARIES_ONLY,
    notes: 'Matroska (non-WebM) copy-trim using Cues; distinct from WebM Cue layout.',
  },

  // AV1 WebM trim + VP8 WebM trim — only vp9 webm was trimmed (dossier missingCases #4).
  {
    id: 'av1_keyframe_aligned',
    asset: 'av1_720p_5s.webm',
    container: 'webm',
    videoCodec: 'av1',
    audioCodec: 'opus',
    startUs: 1_000_000,
    endUs: 4_000_000,
    frameAccurate: false,
    tolerances: { durationToleranceSec: 0.5 },
    extraOracles: PLAYABLE_AV,
    notes: 'AV1/Opus WebM copy-trim; NA(browser) if AV1 decode absent.',
  },
  {
    id: 'vp8_keyframe_aligned',
    asset: 'vp8_720p_10s.webm',
    container: 'webm',
    videoCodec: 'vp8',
    // Vorbis has no WebCodecs decode string; declaring it would force NA where the rest works. The
    // engine still copies the Vorbis track losslessly during the container trim — audio codec is not
    // required for a copy-trim. Leave audioCodec undeclared so the case isn't gated on Vorbis decode.
    startUs: 1_000_000,
    endUs: 5_000_000,
    frameAccurate: false,
    tolerances: { durationToleranceSec: 1.1 },
    extraOracles: PLAYABLE_AV,
    notes: 'VP8 WebM copy-trim; audio (Vorbis) copied through, not decoded.',
  },

  // VP9-with-alpha trim — §5.1/A.8 first-class edge; alpha plane must survive the copy
  // (dossier missingCases #5). Declares the 'alpha' feature so only alpha-aware engines contest it.
  {
    id: 'vp9_alpha_keyframe_aligned',
    asset: 'vp9_alpha.webm',
    container: 'webm',
    videoCodec: 'vp9',
    startUs: 1_000_000,
    endUs: 3_000_000,
    frameAccurate: false,
    tolerances: { durationToleranceSec: 0.5 },
    features: ['alpha'],
    extraOracles: PLAYABLE_AV,
    notes: 'VP9-with-alpha copy-trim; alpha plane must survive the cut. NA where alpha decode unsupported.',
  },

  // ── Audio-only trims beyond MP3 (A.6/A.9 corpus has all of these) — dossier missingCases #6 ──
  {
    id: 'audio_opus_ogg_copy',
    asset: 'opus.ogg',
    container: 'ogg',
    audioCodec: 'opus',
    startUs: 2_000_000,
    endUs: 7_000_000,
    frameAccurate: false,
    tolerances: { durationToleranceSec: 0.1 },
    extraOracles: PLAYABLE_AUDIO,
    notes: 'Opus-in-OGG copy-trim; cut on Ogg page / granulepos boundaries.',
  },
  {
    id: 'audio_aac_adts_copy',
    asset: 'aac_adts.aac',
    container: 'adts',
    audioCodec: 'aac',
    startUs: 2_000_000,
    endUs: 7_000_000,
    frameAccurate: false,
    tolerances: { durationToleranceSec: 0.1 },
    // Raw ADTS has no global index and <video> playback of a bare .aac is unreliable → reimport only.
    extraOracles: BOUNDARIES_ONLY,
    notes: 'Raw ADTS AAC copy-trim; headerless frame-stream, cut on 1024-sample ADTS frame boundaries.',
  },
  {
    id: 'audio_flac_seektable_copy',
    asset: 'flac_seektable.flac',
    container: 'flac',
    audioCodec: 'flac',
    startUs: 2_000_000,
    endUs: 7_000_000,
    frameAccurate: false,
    tolerances: { durationToleranceSec: 0.1 },
    features: ['trim:flac-seektable-copy'],
    extraOracles: BOUNDARIES_ONLY,
    notes:
      'FLAC WITH SEEKTABLE copy-trim; boundary located via the seek index and STREAMINFO rewritten. ' +
      'Requires an explicit trim:flac-seektable-copy feature because generic FLAC read/write support ' +
      'does not prove a copy trim can update the total-samples duration.',
  },
  {
    id: 'audio_flac_noseektable_copy',
    asset: 'flac_noseektable.flac',
    container: 'flac',
    audioCodec: 'flac',
    startUs: 2_000_000,
    endUs: 7_000_000,
    frameAccurate: false,
    tolerances: { durationToleranceSec: 0.1 },
    features: ['trim:flac-no-seektable-frame-scan'],
    extraOracles: BOUNDARIES_ONLY,
    notes: 'FLAC WITHOUT SEEKTABLE copy-trim; boundary must be found by a frame scan (no seek index).',
  },
  {
    id: 'audio_wav_pcm_copy',
    asset: 'wav_s16.wav',
    container: 'wav',
    audioCodec: 'pcm-s16',
    startUs: 1_000_000,
    endUs: 4_000_000,
    frameAccurate: false,
    // WAV PCM packets in the fixture are 85.333ms chunks; packet-copy trims can include one edge
    // chunk while still preserving decoded content and a rewritten RIFF data length.
    tolerances: { durationToleranceSec: 0.09 },
    extraOracles: PLAYABLE_AUDIO,
    notes: 'WAV/PCM-s16 copy-trim; packet-boundary byte-range cut, rewrite RIFF data-chunk size.',
  },
  {
    id: 'audio_aiff_pcm_be_copy',
    asset: 'pcm_s16be.aiff',
    container: 'aiff',
    audioCodec: 'pcm-s16be',
    startUs: 1_000_000,
    endUs: 4_000_000,
    frameAccurate: false,
    tolerances: { durationToleranceSec: 0.02 },
    // AIFF playback in <video> is unreliable across browsers → reimport-only gate.
    extraOracles: BOUNDARIES_ONLY,
    notes: 'AIFF big-endian PCM copy-trim; byte-order + SSND-offset handling on the cut.',
  },

  // MPEG-TS trim — h264_ts.ts; no global index, estimate-only timestamps, 188-byte packet alignment
  // (dossier missingCases #7). Documented hard case. <video> may not play a bare .ts → reimport only.
  {
    id: 'ts_keyframe_aligned',
    asset: 'h264_ts.ts',
    container: 'ts',
    videoCodec: 'h264',
    audioCodec: 'aac',
    startUs: 2_000_000,
    endUs: 6_000_000,
    frameAccurate: false,
    // TS duration is PTS-estimated (no global header); allow a wider band than indexed containers.
    tolerances: { durationToleranceSec: 1.0 },
    extraOracles: BOUNDARIES_ONLY,
    notes: 'MPEG-TS copy-trim; estimate-only PTS, must keep 188-byte TS packet alignment.',
  },

  // start == 0 trim (range 0..N) exercises the 'no leading GOP to re-encode' path (dossier
  // missingCases #9). Boundary digest comparison still needs range-specific golden for the end frame.
  {
    id: 'h264_start_zero_copy',
    asset: 'h264_1080p_30s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    startUs: 0,
    endUs: 5_000_000,
    frameAccurate: false,
    tolerances: { durationToleranceSec: 0.5 },
    extraOracles: PLAYABLE_AV,
    notes: 'Copy-trim 0..5s; start==0 so the first kept frame IS source frame 0 (no leading GOP cut).',
  },

  // Trim to end-of-file (endUs == duration; an engine should clamp endUs>duration to duration). The
  // source is 30s; request 27s..end exercises EOF boundary clamping (dossier missingCases #10).
  {
    id: 'h264_to_eof_copy',
    asset: 'h264_1080p_30s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    startUs: 27_000_000,
    endUs: 30_000_000,
    frameAccurate: false,
    tolerances: { durationToleranceSec: 1.1 },
    extraOracles: PLAYABLE_AV,
    notes: 'Copy-trim 27s..EOF; tests end-of-file boundary (last kept GOP runs to the real last sample).',
  },

  // Open-GOP frame-accurate trim — h264_bframes_1080p.mp4 is open-GOP (manifest: "open GOP",
  // forward refs across the cut). The canonical frame-accurate hazard; cut at an interior,
  // non-keyframe pts so the first kept frame has refs across the boundary (dossier missingCases #11
  // / deepEdgeToAdd open-GOP). Tight ±1-frame tolerance — boundary must be reconstructed, not greened.
  {
    id: 'h264_open_gop_frame_accurate',
    asset: 'h264_bframes_1080p.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    startUs: 2_700_000,
    endUs: 6_300_000,
    frameAccurate: true,
    tolerances: { durationToleranceSec: 0.1 },
    extraOracles: PLAYABLE_AV,
    notes: 'Open-GOP frame-accurate cut at an interior pts with forward refs across the boundary.',
  },

  // Rotated-video trim — h264_rotated90.mp4; trim must preserve the display matrix
  // (dossier missingCases #12). Declares 'rotate' so only rotation-aware engines contest it.
  {
    id: 'h264_rotated_keyframe_aligned',
    asset: 'h264_rotated90.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    startUs: 1_000_000,
    endUs: 5_000_000,
    frameAccurate: false,
    tolerances: { durationToleranceSec: 1.1 },
    features: ['rotate'],
    extraOracles: PLAYABLE_AV,
    notes: 'Copy-trim of rotated (rotate=90 display matrix) video; the matrix must survive the cut.',
  },

  // Multi-track trim — h264_multitrack.mp4 (1 video + 2 audio); all tracks must stay aligned at the
  // cut (dossier missingCases #13).
  {
    id: 'h264_multitrack_keyframe_aligned',
    asset: 'h264_multitrack.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    startUs: 1_000_000,
    endUs: 5_000_000,
    frameAccurate: false,
    tolerances: { durationToleranceSec: 1.1 },
    extraOracles: PLAYABLE_AV,
    notes: 'Copy-trim of a 1-video/2-audio file; every track must be cut & re-based in lockstep.',
  },

  // Fragmented-MP4 / CMAF trim — A.10/A.16; cut on a fragment boundary, rewrite tfdt
  // (dossier missingCases #8). Declares 'fragmented' so only fMP4-capable engines contest it.
  {
    id: 'fmp4_fragment_boundary_copy',
    asset: 'h264_1080p_30s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    startUs: 4_000_000,
    endUs: 10_000_000,
    frameAccurate: false,
    tolerances: { durationToleranceSec: 0.5 },
    features: ['fragmented'],
    extraOracles: PLAYABLE_AV,
    notes: 'Fragmented/CMAF trim: cut on a fragment boundary and rewrite tfdt/baseMediaDecodeTime.',
  },

  // Very short / single-GOP frame-accurate trim — exact-cut degenerate, range ≈ a few frames
  // (dossier missingCases #14). 100ms ≈ 3 frames @30fps.
  {
    id: 'h264_single_gop_frame_accurate',
    asset: 'h264_1080p_30s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    startUs: 5_000_000,
    endUs: 5_100_000,
    frameAccurate: true,
    tolerances: { durationToleranceSec: 0.1 },
    extraOracles: BOUNDARIES_ONLY,
    notes: 'Very short (~100ms / ~3 frame) frame-accurate trim; exact-cut on a sub-GOP range.',
  },

  // Sub-frame range (shorter than one frame interval, ~10ms < 33ms@30fps) frame-accurate
  // (dossier missingCases #14). Engine must still emit at least the single enclosing frame.
  {
    id: 'h264_subframe_range_frame_accurate',
    asset: 'h264_1080p_30s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    startUs: 6_000_000,
    endUs: 6_010_000,
    frameAccurate: true,
    // A <1-frame request can only yield the enclosing video frame plus muxer/audio packet padding.
    tolerances: { durationToleranceSec: 0.1 },
    extraOracles: BOUNDARIES_ONLY,
    notes:
      'Sub-frame range (~10ms, shorter than one 33ms frame interval); degenerate exact-cut. ' +
      'No playback-smoke: a valid one-frame-ish clip may be too short for a <video> advancement gate.',
  },
];

// ── Size-ladder trim curve (§5.3) — same copy + frame-accurate trims on large assets ─────────────
// dossier missingCases #15 / deepEdgeToAdd size-ladder: copy-trim that buffers the whole file
// (instead of Range-reading only the kept GOPs) must be VISIBLE as rising memory/reads — which the
// medium-only cases cannot reveal. primaryMetric is set so the leaderboard ranks these by the axis
// the spec cares about for the rung (peakMemory for the lazy-read story; wall for sustained
// throughput on the very large one). These assets are size-ladder bake rungs — large/huge/massive
// (manifest: sha256 null until the slow bake produces them) — so the cells resolve correctness the
// moment the bake adds the file + golden; until then they negotiate normally per the corpus.

const LADDER_CASES: TrimCase[] = [
  {
    id: 'large_h264_copy_lazyread',
    asset: 'large_h264_1080p_120s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    startUs: 60_000_000,
    endUs: 66_000_000,
    frameAccurate: false,
    tolerances: { durationToleranceSec: 0.5 },
    size: 'ladder',
    // Lazier wins: a copy-trim deep in a 100 MB file should Range-read only the kept GOPs.
    primaryMetric: 'sourceReads',
    extraOracles: PLAYABLE_AV,
    notes:
      'Size-ladder (large ~100 MB): copy-trim 60s..66s deep in the file. peakMemory + sourceReads ' +
      'expose whether the engine Range-reads only the kept GOPs or buffers the whole input.',
  },
  {
    id: 'large_h264_frame_accurate_throughput',
    asset: 'large_h264_1080p_120s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    startUs: 60_000_000,
    endUs: 66_000_000,
    frameAccurate: true,
    tolerances: { durationToleranceSec: 0.1 },
    size: 'ladder',
    // Re-encode path: sustained throughput is the headline number.
    primaryMetric: 'throughputRealtime',
    extraOracles: PLAYABLE_AV,
    notes:
      'Size-ladder (large): frame-accurate trim on a 100 MB file; re-encode throughput + peakMemory ' +
      'at scale (the leading-GOP re-encode must not balloon memory).',
  },
  {
    id: 'huge_h264_mov_copy_peakmem',
    asset: 'huge_h264_1080p_600s.mov',
    container: 'mov',
    videoCodec: 'h264',
    audioCodec: 'aac',
    startUs: 300_000_000,
    endUs: 306_000_000,
    frameAccurate: false,
    tolerances: { durationToleranceSec: 0.5 },
    size: 'ladder',
    primaryMetric: 'peakMemory',
    extraOracles: PLAYABLE_AV,
    notes:
      'Size-ladder (huge ~500-700 MB .mov): copy-trim 300s..306s. Peak memory + sourceReads are the ' +
      'OOM-resistance / lazy-read story the huge rung mandates; mid-file cut on the big-read asset.',
  },
  {
    id: 'massive_h264_copy_sustained',
    asset: 'massive_h264_1080p_2h.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    // A copy-trim spanning > 4096 decoded frames (oracle decodes up to 4096) — the oracle's
    // duration-span proxy is capped, so this rung deliberately relies on the reference-engine probe
    // + playback gate rather than the frame-span fallback. Mid-file 1-minute cut in a 2h file.
    startUs: 3_600_000_000,
    endUs: 3_660_000_000,
    frameAccurate: false,
    tolerances: { durationToleranceSec: 1.0 },
    size: 'ladder',
    primaryMetric: 'sourceReads',
    features: ['trim:massive-lazy-read'],
    timeoutMs: 300_000,
    extraOracles: PLAYABLE_AV,
    notes:
      'Size-ladder (massive ~1-1.4 GB / 2h): copy-trim a 1-minute span deep in a many-thousand-sample ' +
      'file. Lazy/partial reading + peak-memory + OOM-resistance; sample-table must not be fully ' +
      'materialized. Output spans >4096 frames so correctness leans on reference-probe + playback.',
  },
];

// ── Compose the real + ladder trim scenarios ────────────────────────────────────────────────────

function buildTrim(c: TrimCase): Scenario {
  const metrics = c.size === 'ladder' ? TRIM_LADDER_METRICS : TRIM_METRICS;
  const oracles: OracleId[] = ['trim-boundaries', ...(c.extraOracles ?? [])];
  return defineScenario({
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
      features: [
        ...(c.frameAccurate ? ['trim:frame-accurate'] : []),
        ...(c.features ?? []),
      ],
    },
    oracles,
    metrics: [...metrics],
    ...(c.primaryMetric ? { primaryMetric: c.primaryMetric } : {}),
    ...(c.tolerances ? { tolerances: c.tolerances } : {}),
    ...(c.timeoutMs ? { timeoutMs: c.timeoutMs } : {}),
    ...(c.notes ? { notes: c.notes } : {}),
  });
}

const realTrimScenarios: Scenario[] = [...TRIM_CASES, ...LADDER_CASES].map(buildTrim);

// ── METAMORPHIC / property-invariant trim cases (§7 / §11 / A.16) ────────────────────────────────
// Only invariants the harness ACTUALLY computes are used (no fabricated oracle). The
// `property-invariant` oracle (oracles.ts:1197) supports:
//   - trim-concat   : decode(out) == golden(source-decode)  [reduces to source-decode equality]
//   - probe-duration: probe(out).dur ≈ golden source duration  (independent of frame digests)
// The full 3-trim "trim(a..b)++trim(b..c)≈trim(a..c)" requires runner-side splice machinery that
// does not exist in scenario-land; the robustness family owns the single registered attempt of it.
// Here we add the duration-cross-check invariant — a genuine, harness-computable metamorphic gate
// that validates probe(trim(a..b)).dur ≈ (b-a) INDEPENDENTLY of the boundary frame digests
// (dossier deepEdgeToAdd: "probe(trim(a..b)).dur ≈ (b-a) as an explicit invariant case").
//
// NOTE on `invariant: probe-duration` semantics here: the oracle compares probe(out).dur against the
// GOLDEN SOURCE duration. For a trim that is NOT a no-op that would FALSELY fail (out is shorter than
// source). So we only use the probe-duration invariant on the IDEMPOTENT 0..fullDuration trim, where
// out.dur SHOULD equal source.dur — making it a correct, non-circular duration invariant. For
// sub-range duration cross-checks we rely on `trim-boundaries` (which already compares out.dur to the
// requested (b-a) range), so we do not mis-apply the source-duration invariant to sub-ranges.

interface InvariantTrimCase {
  id: string;
  asset: string;
  container: string;
  videoCodec?: string;
  audioCodec?: string;
  startUs: number;
  endUs: number;
  frameAccurate: boolean;
  invariant: string;
  /** extra non-invariant oracles to also assert. */
  extraOracles?: OracleId[];
  features?: string[];
  tolerances?: OracleTolerances;
  notes?: string;
}

const INVARIANT_CASES: InvariantTrimCase[] = [
  // Idempotence / no-op edge: trim(0 .. fullDuration) ≈ identity. The probed duration must equal the
  // source duration (dossier deepEdgeToAdd "Idempotence/no-op edge").
  // Gated by: trim-boundaries (out.dur ≈ requested full range) + property-invariant probe-duration
  // (out.dur ≈ golden SOURCE dur — non-circular here) + reference-reimport (packet/keyframe table
  // ≈ source) + playback-smoke.
  {
    id: 'h264_noop_full_range_idempotent',
    asset: 'h264_1080p_30s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    startUs: 0,
    endUs: 30_000_000,
    frameAccurate: false,
    invariant: 'probe-duration',
    // Full-range no-op: output packet count ≈ source, so reference-reimport is SOUND here (unlike on
    // sub-range trims). decoded-frames-bitexact is intentionally omitted: source-prefix golden can
    // validate only the opening frames, not the full identity trim.
    extraOracles: ['playback-smoke', 'reference-reimport'],
    // Full-range no-op: duration should match the source duration to within ~1 frame.
    tolerances: { durationToleranceSec: 0.05 },
    notes:
      'Idempotent trim(0..fullDuration) ≈ identity: probe(out).dur ≈ source dur (probe-duration ' +
      'invariant), reference re-import ≈ source packet table, output plays.',
  },
  {
    id: 'vp9_noop_full_range_idempotent',
    asset: 'vp9_1080p_10s.webm',
    container: 'webm',
    videoCodec: 'vp9',
    audioCodec: 'opus',
    startUs: 0,
    endUs: 10_000_000,
    frameAccurate: false,
    invariant: 'probe-duration',
    // Full-range no-op: reference-reimport is sound (output packet count ≈ source).
    extraOracles: ['playback-smoke', 'reference-reimport'],
    tolerances: { durationToleranceSec: 0.05 },
    notes:
      'WebM/VP9 idempotent full-range trim ≈ identity; probe-duration invariant + playback + ' +
      'reference re-import ≈ source packets.',
  },
];

const invariantTrimScenarios: Scenario[] = INVARIANT_CASES.map((c) =>
  defineScenario({
    id: `trim/${c.id}`,
    op: 'trim',
    input: c.asset,
    options: {
      container: c.container,
      frameAccurate: c.frameAccurate,
      range: { startUs: c.startUs, endUs: c.endUs },
      invariant: c.invariant,
    },
    requires: {
      operations: ['trim'],
      containersIn: [c.container],
      containersOut: [c.container],
      ...(c.videoCodec ? { videoCodecs: [c.videoCodec] } : {}),
      ...(c.audioCodec ? { audioCodecs: [c.audioCodec] } : {}),
      features: [...(c.frameAccurate ? ['trim:frame-accurate'] : []), ...(c.features ?? [])],
    },
    oracles: ['property-invariant', 'trim-boundaries', ...(c.extraOracles ?? [])],
    metrics: [...TRIM_METRICS],
    ...(c.tolerances ? { tolerances: c.tolerances } : {}),
    ...(c.notes ? { notes: c.notes } : {}),
  }),
);

// ── ROBUSTNESS trim cases (§7) — degenerate ranges + corrupt sources → graceful failure ──────────
// The runner routes any case with the graceful-failure oracle to its robustness path. BAD-RANGE cases
// feed a well-formed file and illegal range; BAD-BYTE cases point at deterministic malformed fixture
// files. PASS iff the op throws/returns safely within timeout; FAIL on timeout or suspicious output.

const ROBUSTNESS_TIMEOUT_MS = 15_000;

interface RobustnessTrimCase {
  id: string;
  asset: string;
  container: string;
  videoCodec?: string;
  audioCodec?: string;
  startUs: number;
  endUs: number;
  frameAccurate: boolean;
  extraOptions?: Record<string, unknown>;
  notes: string;
}

const ROBUSTNESS_CASES: RobustnessTrimCase[] = [
  // Inverted range (endUs <= startUs) on valid bytes — dossier missingCases #14 / deepEdgeToAdd
  // "inverted range (endUs<=startUs)".
  {
    id: 'robust_inverted_range',
    asset: 'h264_1080p_30s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    startUs: 8_000_000,
    endUs: 2_000_000,
    frameAccurate: false,
    notes: 'Inverted range (end<start) on a VALID file: trim must reject cleanly (graceful), no output.',
  },
  // Zero-length range (endUs == startUs).
  {
    id: 'robust_zero_length_range',
    asset: 'h264_1080p_30s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    startUs: 5_000_000,
    endUs: 5_000_000,
    frameAccurate: false,
    notes: 'Zero-length range (end==start): either a clean empty-trim reject or graceful throw.',
  },
  // Negative startUs.
  {
    id: 'robust_negative_start',
    asset: 'h264_1080p_30s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    startUs: -2_000_000,
    endUs: 4_000_000,
    frameAccurate: false,
    notes: 'Negative startUs: out-of-domain range; trim must reject gracefully, never fabricate output.',
  },
  // start >= duration (seek-past-EOF range).
  {
    id: 'robust_start_past_eof',
    asset: 'h264_1080p_30s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    startUs: 40_000_000,
    endUs: 45_000_000,
    frameAccurate: false,
    notes: 'startUs ≥ duration (past EOF): nothing to cut; trim must reject gracefully.',
  },
  // endUs far past EOF (start valid). Some engines clamp (covered by h264_to_eof_copy); here both
  // ends are well past the 30s duration to force the past-EOF branch, not a clamp.
  {
    id: 'robust_end_far_past_eof',
    asset: 'h264_1080p_30s.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    startUs: 50_000_000,
    endUs: 9_999_000_000,
    frameAccurate: false,
    notes: 'Range entirely past EOF (50s..~2.7h on a 30s file): graceful reject, no hang/OOM.',
  },
  // Corrupt source: truncated MP4 (moov/mdat incomplete) then a normal trim range — bad BYTES.
  {
    id: 'robust_truncated_source',
    asset: 'trim_truncated_h264_55p.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    startUs: 2_000_000,
    endUs: 8_000_000,
    frameAccurate: false,
    extraOptions: { gracefulAllowOutput: true },
    notes: 'Source truncated to 55% (incomplete moov/mdat) then trimmed: must fail gracefully.',
  },
  // Corrupt source: bit-flipped MP4 then a normal trim range — bad BYTES.
  {
    id: 'robust_bitflipped_source',
    asset: 'trim_bitflipped_h264.mp4',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    startUs: 2_000_000,
    endUs: 8_000_000,
    frameAccurate: false,
    notes: '128 seeded bit-flips across the MP4 then trimmed: graceful reject/degrade, no crash.',
  },
];

const robustnessTrimScenarios: Scenario[] = ROBUSTNESS_CASES.map((c) =>
  defineScenario({
    id: `trim/${c.id}`,
    op: 'trim',
    input: c.asset,
    options: {
      container: c.container,
      frameAccurate: c.frameAccurate,
      range: { startUs: c.startUs, endUs: c.endUs },
      ...(c.extraOptions ?? {}),
    },
    requires: {
      operations: ['trim'],
      containersIn: [c.container],
      containersOut: [c.container],
      ...(c.videoCodec ? { videoCodecs: [c.videoCodec] } : {}),
      ...(c.audioCodec ? { audioCodecs: [c.audioCodec] } : {}),
      ...(c.frameAccurate ? { features: ['trim:frame-accurate'] } : {}),
    },
    oracles: ['graceful-failure'],
    metrics: ['wall', 'peakMemory'],
    timeoutMs: ROBUSTNESS_TIMEOUT_MS,
    notes: c.notes,
  }),
);

// ── Export the full trim battery ─────────────────────────────────────────────────────────────────

export const trimScenarios: Scenario[] = [
  ...realTrimScenarios,
  ...invariantTrimScenarios,
  ...robustnessTrimScenarios,
];

export default trimScenarios;
