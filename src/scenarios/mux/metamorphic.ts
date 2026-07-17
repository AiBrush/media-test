/**
 * src/scenarios/mux/metamorphic.ts — the canonical mux property-invariants (§A.16, §11).
 *
 * The mux family declared NO metamorphic invariant: the strongest correctness claim for mux is
 * "demux(mux(x)) ≈ x" (re-demuxing the muxed output reproduces the per-track coded samples / duration
 * it was handed) and "decode(mux(x)) == decode(x)" (packing must not alter decoded pixels). oracles.ts
 * already implements the property-invariant oracle with a probe-duration branch (probe(out).dur ≈
 * golden source duration) and a decode branch; this file wires them into the mux family.
 *
 * Probe-duration remains a useful independent cross-container invariant. Neutral semantic re-import
 * now supplies the deeper selected-track/content/timeline gate without requiring packet serialization
 * equality, so legal reframing is DIFF rather than a false failure.
 *
 *   decode(mux(x))==decode(x) (the bit-exact pixel gate) is added for the video cases; it needs a baked
 *   <asset>.frames.json (= decode(x)). Those source frame goldens are `$todo` placeholders today, so
 *   those entries resolve to a clean "no golden frames" FAIL until the bake fills them — wired now so
 *   the cell lines up the moment frames are baked (same posture as remux/metamorphic.ts).
 *
 * VFR (§A.16 VFR nominal vs real fps): the semantic mux layer compares full per-sample DTS, PTS,
 * duration, composition offset, and presentation intervals within one target tick; total duration is
 * retained as a separate coarse invariant.
 */

import type { Scenario } from '../../core/scenario.ts';
import { buildMuxPropertyAll, DECODE_MUX, type MuxPropertyCase, PROBE_DUR } from './_shared.ts';

// VFR mux invariants require the engine's corpus-input→EncodedTracks path to preserve per-sample
// timestamps. Engines that flatten the source to raw elementary streams before muxing cannot exercise
// this row honestly, because raw H.264/ADTS inputs do not carry the original irregular MP4 PTS table.
const VFR_MUX_TIMESTAMPS = 'mux:vfr-timestamps';

const METAMORPHIC_CASES: MuxPropertyCase[] = [
  // ── probe(mux(x)).dur ≈ probe(x).dur across the container change (the faithful cross-container gate) ──
  {
    id: 'prop_h264_mux_duration_mp4_to_mkv',
    invariant: PROBE_DUR,
    input: 'h264_1080p_30s.mp4',
    containersIn: ['mp4'],
    to: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    tolerances: { durationToleranceSec: 0.125 },
    notes:
      'demux(mux(x))≈x via duration (§A.16): H.264+AAC muxed MP4→MKV must materialize a Segment ' +
      'Duration ≈ the source. probe(mux(x)).dur≈probe(x).dur — the count-gate-free cross-container check.',
  },
  {
    id: 'prop_h264_mux_duration_mp4_to_ts',
    invariant: PROBE_DUR,
    input: 'h264_1080p_30s.mp4',
    containersIn: ['mp4'],
    to: 'ts',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'demux(mux(x))≈x via duration (§A.16): MP4→TS. MPEG-TS reframes into Annex-B/PES; neutral ' +
      'semantic re-import permits that representation difference while duration stays invariant.',
  },
  {
    id: 'prop_vp9_mux_duration_webm_to_webm',
    invariant: PROBE_DUR,
    input: 'vp9_1080p_10s.webm',
    containersIn: ['webm'],
    to: 'webm',
    videoCodecs: ['vp9'],
    audioCodecs: ['opus'],
    notes:
      'demux(mux(x))≈x via duration: VP9+Opus WebM→WebM identity mux must re-author a sane Segment ' +
      'Duration. Faithful duration gate on the WebM writer.',
  },
  {
    id: 'prop_av1_mux_duration_webm_to_mp4',
    invariant: PROBE_DUR,
    input: 'av1_720p_5s.webm',
    containersIn: ['webm'],
    to: 'mp4',
    videoCodecs: ['av1'],
    audioCodecs: ['opus'],
    notes:
      'demux(mux(x))≈x via duration: AV1+Opus WebM→MP4 must write a precise mvhd duration ≈ source. ' +
      'Cross-container (WebM→ISO-BMFF) duration materialization.',
  },

  // ── decode(mux(x)) == decode(x): packing must not alter decoded pixels (VIDEO; needs baked frames) ──
  {
    id: 'prop_h264_decode_mux_mp4_to_mp4',
    invariant: DECODE_MUX,
    input: 'h264_1080p_30s.mp4',
    containersIn: ['mp4'],
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    // mp4 target faithful → also gate sample survival via reference-reimport.
    oracles: ['property-invariant', 'reference-reimport'],
    notes:
      'decode(mux(x))==decode(x) (§A.16): re-pack H.264+AAC → mp4; decoded pixels must be identical ' +
      '(mux copies coded samples). The strongest mux video gate; faithful reference-reimport added.',
  },
  {
    id: 'prop_vp9_decode_mux_webm_to_webm',
    invariant: DECODE_MUX,
    input: 'vp9_1080p_10s.webm',
    containersIn: ['webm'],
    to: 'webm',
    videoCodecs: ['vp9'],
    audioCodecs: ['opus'],
    notes:
      'decode(mux(x))==decode(x): VP9+Opus WebM→WebM identity mux; decoded pixels must be bit-identical ' +
      'through the Matroska/WebM writer; neutral re-import validates media semantics after reframing.',
  },

  // ── VFR: variable per-sample durations must survive the mux (constant-fps muxers corrupt them) ──
  {
    id: 'prop_vfr_mux_duration_mp4_to_mp4',
    invariant: PROBE_DUR,
    input: 'h264_vfr.mp4',
    containersIn: ['mp4'],
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    features: [VFR_MUX_TIMESTAMPS],
    tolerances: { durationToleranceSec: 0.25 },
    notes:
      'VFR through mux → mp4 (§A.16 VFR nominal vs real fps): irregular per-sample DTS/PTS/durations ' +
      'must survive within one target tick; total duration is an independent coarse gate. ' +
      'Requires a timestamp-preserving corpus-input→EncodedTracks path; engines that flatten to raw ' +
      'elementary streams are NA for this row. Allows a 125 ms container-duration materialization band ' +
      'for VFR sample rounding, not the global gate.',
  },
  {
    id: 'prop_vfr_mux_duration_mp4_to_mkv',
    invariant: PROBE_DUR,
    input: 'h264_vfr.mp4',
    containersIn: ['mp4'],
    to: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    features: [VFR_MUX_TIMESTAMPS],
    tolerances: { durationToleranceSec: 0.2 },
    notes:
      'VFR through mux → mkv (§A.16): VFR timestamps re-authored as Matroska block timestamps; the ' +
      'materialized duration must match. Catches a muxer that quantizes VFR to a constant cadence while ' +
      'requiring a timestamp-preserving corpus-input→EncodedTracks path and allowing a 200 ms ' +
      'VFR/Matroska final-sample duration materialization band.',
  },
];

export const muxMetamorphicScenarios: Scenario[] = buildMuxPropertyAll(METAMORPHIC_CASES);

export default muxMetamorphicScenarios;
