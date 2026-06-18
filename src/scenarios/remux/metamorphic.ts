/**
 * src/scenarios/remux/metamorphic.ts — property-invariant remux cases living IN the remux family.
 *
 * Until now the metamorphic remux invariants (decode(remux(x))==decode(x), probe(remux(x)).dur) lived
 * ONLY in the robustness family, and only for mp4->mkv and webm->mkv. The B-frame, TS, multitrack,
 * rotation and audio paths had NO invariant gate even though oracles.ts has a dedicated
 * `inferInvariant` → 'decode-remux' branch for op:'remux'. This file adds the missing property cases.
 *
 * WHICH INVARIANT EACH CASE USES (the `property-invariant` oracle in oracles.ts matches on substring):
 *   - 'decode(remux(x))==decode(x)'      → oracle decodes ctx.output and compares frame digests to
 *                                          golden.frames (== the offline decode of x). VIDEO-ONLY (it
 *                                          decodes to RGBA) and needs a baked <asset>.frames.json.
 *   - 'probe(remux(x)).dur≈probe(x).dur' → oracle reference-probes ctx.output's duration and compares
 *                                          to golden.meta.durationSec. Works for VIDEO and AUDIO; the
 *                                          honest audio analogue of decode-remux (no PCM oracle exists)
 *                                          and the way to gate ESTIMATE-ONLY-duration containers (ts /
 *                                          adts / mp3) materializing a precise output duration.
 *
 * Round-trip / idempotence: modeled as a single property case whose options carry a `roundTrip`
 * target so a runner that supports remux(remux(x,'mkv'),'mp4') can re-wrap through a foreign container
 * and back; the invariant token stays 'decode(remux(x))==decode(x)' so even a runner that does a
 * single remux still gates decoded-pixel equality (a strict subset of the round-trip guarantee).
 */

import type { Scenario } from '../../core/scenario.ts';
import { buildRemuxPropertyAll, type RemuxPropertyCase } from './_shared.ts';

// ORACLE-ROUTING CRITICAL: oracles.ts `propertyInvariant` selects the branch by SUBSTRING, testing
// `which.includes('decode')||which.includes('remux')` BEFORE `which.includes('duration')||includes('probe')`.
// So any token containing "remux" (e.g. 'probe(remux(x)).dur…') misroutes to the DECODE branch — which
// needs golden VIDEO frames and would FAIL every audio duration case. The probe-duration token must
// therefore contain "duration"/"probe" and contain NEITHER "decode" NOR "remux". 'probe-duration' does.
const DECODE_REMUX = 'decode(remux(x))==decode(x)'; // routes to decode-remux (contains 'decode')
const PROBE_DUR = 'probe-duration'; // routes to probe-duration; human phrasing 'probe(remux(x)).dur≈probe(x).dur' lives in notes

const PROPERTY_CASES: RemuxPropertyCase[] = [
  // ── B-FRAME path: dts/pts reorder must survive the wrapper change. Legacy had the b-frame remux
  //    cell but only reference-reimport/playback gated it; robustness covered mp4->mkv/webm->mkv but
  //    NOT b-frames. decode(remux(x))==decode(x) verifies the reordered frames decode identically. ──
  {
    id: 'prop_bframes_decode_remux_mp4_mkv',
    invariant: DECODE_REMUX,
    input: 'h264_bframes_1080p.mp4',
    from: 'mp4',
    to: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'B-frame/open-GOP MP4->MKV: decode(remux(x))==decode(x) proves the dts/pts reorder survived the ' +
      'container change (frames decode in identical presentation order with identical pixels).',
  },
  {
    id: 'prop_bframes_decode_remux_mp4_mov',
    invariant: DECODE_REMUX,
    input: 'h264_bframes_1080p.mp4',
    from: 'mp4',
    to: 'mov',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'B-frame MP4->MOV: same reorder-survival invariant onto the QuickTime container.',
  },

  // ── ESTIMATE-ONLY duration containers: probe(remux(x)).dur≈probe(x).dur exercises the
  //    LOOSE_DURATION_CONTAINERS path from the REMUX side — TS has no global duration, so a correct
  //    remux to MP4 must MATERIALIZE a precise mvhd duration that matches the source. ──
  {
    id: 'prop_ts_to_mp4_duration_materialized',
    invariant: PROBE_DUR,
    input: 'h264_ts.ts',
    from: 'ts',
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'TS->MP4 duration materialization: MPEG-TS carries no global duration; the output MP4 must ' +
      'write a precise mvhd duration ≈ the source. probe(remux(x)).dur≈probe(x).dur gates it.',
  },
  {
    id: 'prop_adts_to_mp4_duration_invariant',
    invariant: PROBE_DUR,
    input: 'aac_adts.aac',
    from: 'adts',
    to: 'mp4',
    audioCodecs: ['aac'],
    notes:
      'ADTS AAC->MP4 audio duration invariance: raw ADTS has no duration header (frameCount×1024/SR); ' +
      'the output .m4a must carry an accurate duration. Honest audio analogue of decode-remux.',
  },
  {
    id: 'prop_mp3_to_mp4_duration_invariant',
    invariant: PROBE_DUR,
    input: 'mp3_xing.mp3',
    from: 'mp3',
    to: 'mp4',
    audioCodecs: ['mp3'],
    notes: 'MP3->MP4 audio duration invariance: Xing frame count -> precise MP4 duration. Audio sample-fidelity proxy.',
  },

  // ── Round-trip / idempotence: re-wrap through a foreign container and back must reproduce decoded
  //    output (catches asymmetric box / edit-list handling). Token stays decode-remux so the
  //    decoded-pixel equality is gated even for a single-remux runner. ──
  {
    id: 'prop_roundtrip_mp4_mkv_mp4',
    invariant: DECODE_REMUX,
    input: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    extraOptions: { roundTrip: ['mkv', 'mp4'] },
    notes:
      'Round-trip idempotence decode(remux(remux(x,mkv),mp4))==decode(x): re-wrap MP4->MKV->MP4 must ' +
      'reproduce decoded pixels (catches asymmetric edit-list / box handling). options.roundTrip lists ' +
      'the re-wrap chain; a single-remux runner still gates decoded-pixel equality (a subset guarantee).',
  },

  // ── Multi-track packet preservation: all tracks (video + 2 audio) must survive the remux.
  //    decode(remux(x))==decode(x) gates the VIDEO track pixels; reference-reimport (added as a
  //    secondary oracle) re-parses the output so a dropped audio track shows up as a packet-count /
  //    track-layout divergence vs golden. ──
  {
    id: 'prop_multitrack_survives_mp4_mkv',
    invariant: DECODE_REMUX,
    input: 'h264_multitrack.mp4',
    from: 'mp4',
    to: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    oracles: ['property-invariant', 'reference-reimport'],
    notes:
      'Multi-track (video + 2 audio) MP4->MKV: decode(remux(x))==decode(x) gates the video pixels; ' +
      'reference-reimport gates that ALL tracks survived (packet count / track layout vs golden). A ' +
      'per-track metamorphic count check needs a demux(remux(x)) oracle that does not yet exist.',
  },

  // ── Rotation/display-matrix survival: rotation loss changes the DECODED PRESENTATION, so
  //    decode(remux(x))==decode(x) catches a dropped display matrix (the decoded golden frames are
  //    baked rotated). A dedicated rotation-VALUE-via-probe gate is not expressible in oracles.ts
  //    today (the probe branch only checks duration), so we gate the observable effect instead. ──
  {
    id: 'prop_rotation_survives_mp4_mov',
    invariant: DECODE_REMUX,
    input: 'h264_rotated90.mp4',
    from: 'mp4',
    to: 'mov',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    features: ['rotate'],
    notes:
      'Rotation (90 deg display matrix) MP4->MOV: decode(remux(x))==decode(x) gates that the display ' +
      'rotation survived (a dropped matrix would change decoded presentation -> frame-digest mismatch).',
  },

  // ── Headerless MediaRecorder WebM duration materialization: a headerless input (no Segment
  //    Duration, sparse/absent Cues) must yield a sane, seekable output duration after remux. ──
  {
    id: 'prop_recorder_headerless_duration_materialized',
    invariant: PROBE_DUR,
    input: 'recorder_headerless.webm',
    from: 'webm',
    to: 'mkv',
    videoCodecs: ['vp8'],
    audioCodecs: ['opus'],
    notes:
      'Headerless MediaRecorder WebM->MKV: input lacks a Segment Duration; the remux must materialize ' +
      'a sane, seekable output duration. probe(remux(x)).dur≈probe(x).dur (loose recorder-webm band).',
  },
];

export const remuxMetamorphicScenarios: Scenario[] = buildRemuxPropertyAll(PROPERTY_CASES);

export default remuxMetamorphicScenarios;
