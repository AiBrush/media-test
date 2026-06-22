/**
 * src/scenarios/remux/matrix.ts — completes the symmetric lossless container mesh (spec §6).
 *
 * Spec §6 demands the symmetric mesh MP4<->MOV<->MKV<->WebM<->TS. The legacy index.ts implemented
 * only a sparse, mostly one-directional slice. This file fills the missing reverse / round-trip
 * directions and the previously-zero coverage cells, each restricted to a LOSSLESS pair (the codec is
 * legal in BOTH source and target container, so only the wrapper changes — no re-encode).
 *
 * Codec-in-container legality (all confirmed against research/dossiers/mediabunny.md — the reference
 * engine writes these via its ISOBMFF/Matroska/WebM/MPEG-TS muxers, WebCodecs-gated for decode only):
 *   - H.264 (avc)  : legal in mp4, mov, mkv, ts                (portable across all 4 video containers)
 *   - HEVC (hvc1)  : legal in mp4, mov, mkv  (NOT webm)
 *   - VP9          : legal in webm, mkv, AND mp4 (registered ISO-BMFF 'vp09' sample entry / vpcC box)
 *   - VP8          : legal in webm, mkv
 *   - AV1          : legal in webm, mkv, mp4 (av1C)            (already exercised webm->mp4 in legacy)
 *
 * Each video cell carries the strongest oracle set: decoded-frames-bitexact (pixels identical after a
 * lossless re-wrap) + reference-reimport (output is a real parseable container) + playback-smoke.
 *
 * CORPUS LIMIT (honest, no fabrication): the gap also names "MKV(VP9/Opus)->WebM" and "mkv(h264)->?".
 * The corpus has NO VP9-in-MKV source asset, and H.264 is NOT legal in WebM, so neither cell can be
 * added without inventing an asset (forbidden). The to:'webm' VIDEO write path the family lacked is
 * instead covered by the VP9 WebM->WebM identity write, the AV1 WebM->WebM write, and VP9 WebM->MP4
 * below — all from real corpus assets. Add a vp9/opus .mkv fixture to close the MKV->WebM cell later.
 */

import type { Scenario } from '../../core/scenario.ts';
import { buildRemuxAll, type RemuxCase } from './_shared.ts';

const MATRIX_CASES: RemuxCase[] = [
  // ── H.264 reverse / round-trip directions to complete MP4<->MOV<->MKV<->TS for H.264 ──
  // Legacy had: mp4->mov, mp4->mkv, mp4->ts, mov->mp4, mkv->mp4, ts->mp4. The reverse/cross cells
  // BELOW were missing, leaving the H.264 mesh one-directional. H.264 in mov/mkv/ts uses the same
  // coded samples; ts<->{mp4,mkv,mov} additionally exercises the Annex-B <-> length-prefixed (AVCC)
  // NAL framing rewrite, which is still lossless (identical coded samples, only the start-code /
  // length-prefix container framing changes).
  {
    asset: 'h264_1080p_5s.mov',
    from: 'mov',
    to: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'MOV->MKV reverse of the mp4->mkv cell: H.264 coded samples re-wrapped MOV→Matroska.',
  },
  {
    asset: 'h264_1080p_5s.mov',
    from: 'mov',
    to: 'ts',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'MOV->TS: AVCC length-prefixed NALs rewritten to Annex-B start codes; coded samples unchanged.',
  },
  {
    asset: 'h264_in_mkv.mkv',
    from: 'mkv',
    to: 'mov',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'MKV->MOV: completes the MOV<->MKV arm in the reverse direction (mov->mkv is also added here).',
  },
  {
    asset: 'h264_in_mkv.mkv',
    from: 'mkv',
    to: 'ts',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'MKV->TS: Matroska H.264 -> MPEG-TS (Annex-B); coded samples identical.',
  },
  {
    asset: 'h264_ts.ts',
    from: 'ts',
    to: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'TS->MKV reverse of mkv->ts: Annex-B -> Matroska length-prefixed; coded samples unchanged.',
  },
  {
    asset: 'h264_ts.ts',
    from: 'ts',
    to: 'mov',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'TS->MOV: Annex-B -> AVCC into QuickTime; completes the TS<->MOV arm.',
  },

  // ── '<->WebM' video arm: previously ZERO video remux ever targeted webm (only the audio
  //    opus.ogg->webm case used to:'webm'). Add the canonical Matroska<->WebM VIDEO pairs that
  //    actually WRITE webm. WebM is a Matroska profile restricted to VP8/VP9/AV1 + Opus/Vorbis, so
  //    these are lossless re-wraps. (The WebM->MKV widening already exists in the base matrix, so it
  //    is NOT repeated here; this arm contributes the to:'webm' VIDEO writes the family lacked.) ──
  {
    asset: 'vp9_1080p_10s.webm',
    from: 'webm',
    to: 'webm',
    videoCodecs: ['vp9'],
    audioCodecs: ['opus'],
    notes:
      'VP9/Opus WebM->WebM identity re-mux: exercises the WebM WRITE path for VIDEO (previously only ' +
      'audio ever wrote WebM). Re-emits Cues/SeekHead; decoded pixels must be bit-identical.',
  },
  {
    asset: 'av1_720p_5s.webm',
    from: 'webm',
    to: 'webm',
    videoCodecsIn: ['av1'],
    audioCodecs: ['opus'],
    features: ['remux:av1-opus-in-webm'],
    notes: 'AV1/Opus WebM->WebM identity re-mux: AV1 video through the WebM writer (av1C in Matroska).',
  },

  // ── HEVC under-coverage: legacy had only hevc mp4->mkv. HEVC is legal in MOV (hvc1), so this is a
  //    valid lossless cell. (HEVC is NOT legal in webm — intentionally absent.) ──
  {
    asset: 'hevc_1080p_10s.mp4',
    from: 'mp4',
    to: 'mov',
    videoCodecs: ['hevc'],
    audioCodecs: ['aac'],
    notes: 'HEVC MP4->MOV: hvc1 is legal in QuickTime; lossless re-wrap. Decode is browser-gated (NA(browser) ok).',
  },

  // ── VP9->MP4: the legacy header comment WRONGLY excluded VP9->mp4 as "transcode, not remux". VP9
  //    is a registered ISO-BMFF coded stream ('vp09'/vpcC), so webm(VP9)->mp4 is a lossless re-wrap,
  //    exactly mirroring the already-present av1 webm->mp4 cell. ──
  {
    asset: 'vp9_1080p_10s.webm',
    from: 'webm',
    to: 'mp4',
    videoCodecs: ['vp9'],
    audioCodecs: ['opus'],
    features: ['remux:vp9-opus-in-mp4'],
    notes:
      'VP9/Opus WebM->MP4: VP9 is a legal ISO-BMFF sample entry (vp09 + vpcC) — lossless re-wrap, NOT ' +
      'a transcode (the legacy exclusion premise was factually wrong). Mirrors the av1 webm->mp4 cell.',
  },
];

export const remuxMatrixScenarios: Scenario[] = buildRemuxAll(MATRIX_CASES);

export default remuxMatrixScenarios;
