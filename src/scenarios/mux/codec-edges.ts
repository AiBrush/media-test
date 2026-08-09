/**
 * src/scenarios/mux/codec-edges.ts — gnarly codec/bitstream inputs fed THROUGH the mux op (§A.16).
 *
 * The legacy mux family used only clean ~5-30 s 720p/1080p sources. The remux/robustness families
 * exercise B-frame reorder, display-matrix rotation, HEVC, and multitrack — but mux/ fed NONE of these
 * into the muxer, even though packing already-encoded tracks has its OWN author-side bug surface that a
 * remux (single-engine re-wrap) does not isolate:
 *
 *   - B-FRAME reorder (h264_bframes_1080p.mp4): the muxer must regenerate ctts / edit-list (ISO-BMFF)
 *     or SimpleBlock lacing (Matroska) from the dts/pts spread of the supplied chunks. A muxer that
 *     assumes pts==dts corrupts the reorder. Gated by decode(mux(x))==decode(x) (frames decode in
 *     identical presentation order with identical pixels) — the canonical mux-author B-frame check.
 *   - ROTATION / display matrix (h264_rotated90.mp4): muxers commonly DROP the display matrix. The
 *     decoded presentation changes if it is lost, so decode(mux(x))==decode(x) catches it (golden
 *     frames are baked rotated). mov is the faithful target (matrix is a QuickTime/ISO concept).
 *   - HEVC (hevc_1080p_10s.mp4): mux hvcC-described HEVC into mp4 and mkv — codec-private (hvcC) must
 *     be authored into the new container. mp4 target is faithful for reference-reimport.
 *   - MULTITRACK keep-all (h264_multitrack.mp4): mux ALL tracks (1 video + 2 audio) into one container
 *     — the survival counterpart to multi-source/drop. reference-reimport (mp4 target, faithful) checks
 *     track layout + per-track packets so a dropped track shows as a count/layout divergence.
 *
 * DECODE_MUX cases compare decode(mux(x)) against a baked <asset>.frames.json (= decode(x)). Those source
 * frame goldens are BAKED (in-browser frame-bake, 2026-06-18/21 — `pending:false`, real RGBA sha256 per
 * frame; ffmpeg cannot produce them, see frame-bake.ts), so a red DECODE_MUX cell means an engine-decode
 * divergence or a stale harness run, NOT a missing golden — re-bake via `window.__FRAME_BAKE__` only if the
 * asset changes. PROBE_DUR is added as a second, immediately-active invariant where it adds signal.
 * Neutral semantic re-import is attached for every target; representation-sensitive packet counts
 * are not used across containers.
 */

import type { Scenario } from '../../core/scenario.ts';
import {
  FULL_HD_10S_CANDIDATE_ENVELOPE,
  HD_1280X720_10S_CANDIDATE_ENVELOPE,
} from '../_candidate-envelopes.ts';
import {
  buildMux,
  buildMuxProperty,
  DECODE_MUX,
  type MuxCase,
  type MuxPropertyCase,
} from './_shared.ts';

const CODEC_EDGE_PROPERTY_CASES: MuxPropertyCase[] = [
  // ── B-frame reorder must survive the mux: dts/pts spread → regenerated ctts / SimpleBlock lacing ──
  {
    id: 'edge_bframes_decode_mux_mp4',
    revision: 2,
    invariant: DECODE_MUX,
    input: 'h264_bframes_1080p.mp4',
    containersIn: ['mp4'],
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    features: ['mux:vfr-timestamps'],
    candidateEnvelope: FULL_HD_10S_CANDIDATE_ENVELOPE,
    // mp4 target is faithful → add reference-reimport so dropped/duplicated samples also show up.
    oracles: ['property-invariant', 'reference-reimport'],
    notes:
      'B-FRAME mux → mp4 (§A.16 open-GOP & B-frame reorder): the muxer must regenerate ctts/edit-list ' +
      'from the supplied dts/pts spread. decode(mux(x))==decode(x) proves the reorder survived; ' +
      'reference-reimport (faithful mp4 target) catches sample drop/dup.',
  },
  {
    id: 'edge_bframes_decode_mux_mkv',
    revision: 2,
    invariant: DECODE_MUX,
    input: 'h264_bframes_1080p.mp4',
    containersIn: ['mp4'],
    to: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    features: ['mux:vfr-timestamps'],
    candidateEnvelope: FULL_HD_10S_CANDIDATE_ENVELOPE,
    notes:
      'B-FRAME mux → mkv (§A.16): same coded samples re-laced as Matroska SimpleBlocks; the muxer must ' +
      'preserve the reorder via block timestamps. Full timeline + decode + neutral semantic re-import gate it.',
  },

  // ── Rotation / display matrix preservation through mux ──
  {
    id: 'edge_rotation_decode_mux_mov',
    revision: 2,
    invariant: DECODE_MUX,
    input: 'h264_rotated90.mp4',
    containersIn: ['mp4'],
    to: 'mov',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    features: ['rotate'],
    candidateEnvelope: HD_1280X720_10S_CANDIDATE_ENVELOPE,
    oracles: ['property-invariant', 'reference-reimport'],
    notes:
      'ROTATION mux → mov (§A.16 rotated, matrix not w/h swap): the 90° display matrix must be authored ' +
      'into the output. decode(mux(x))==decode(x) catches a dropped matrix (decoded presentation would ' +
      'change). mov is the faithful matrix target.',
  },
  {
    id: 'edge_rotation_decode_mux_mkv',
    revision: 2,
    invariant: DECODE_MUX,
    input: 'h264_rotated90.mp4',
    containersIn: ['mp4'],
    to: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    features: ['rotate'],
    candidateEnvelope: HD_1280X720_10S_CANDIDATE_ENVELOPE,
    notes:
      'ROTATION mux → mkv (§A.16): rotation carried as a Matroska track ProjectionPoseRoll / display ' +
      'metadata; decode(mux(x))==decode(x) gates the observable rotation through the Matroska writer.',
  },

  // ── HEVC (hvcC) into mp4 and mkv: codec-private authoring into the new container ──
  {
    id: 'edge_hevc_decode_mux_mp4',
    invariant: DECODE_MUX,
    input: 'hevc_1080p_10s.mp4',
    containersIn: ['mp4'],
    to: 'mp4',
    videoCodecs: ['hevc'],
    audioCodecs: ['aac'],
    features: ['mux:hevc-browser-decode-equality'],
    oracles: ['property-invariant', 'reference-reimport'],
    notes:
      'HEVC mux → mp4 (§A.3/§A.16): the hvcC codec-private must be authored into the output hev1/hvc1 ' +
      'sample entry. decode(mux(x))==decode(x) (browser-HEVC-gated → NA(browser) ok) + faithful ' +
      'reference-reimport.',
  },
  {
    id: 'edge_hevc_decode_mux_mkv',
    invariant: DECODE_MUX,
    input: 'hevc_1080p_10s.mp4',
    containersIn: ['mp4'],
    to: 'mkv',
    videoCodecs: ['hevc'],
    audioCodecs: ['aac'],
    features: ['mux:hevc-browser-decode-equality'],
    notes:
      'HEVC mux → mkv (§A.3): HEVC into Matroska (CodecPrivate = hvcC). decode(mux(x))==decode(x) gates ' +
      'pixels through the Matroska writer; neutral re-import validates the reframed track.',
  },
];

// ── Multitrack KEEP-ALL: gate that EVERY track survives via faithful reference-reimport (mp4 target) ──
// This one is NOT a decode invariant (it is about track SURVIVAL, not pixels), and its mp4 target is
// faithful, so we build it directly (not via the property builder) so it carries reference-reimport +
// probe-duration (via defaultOracles).
const MULTITRACK_KEEP_ALL: MuxCase = {
  id: 'edge_multitrack_keep_all_to_mp4',
  input: 'h264_multitrack.mp4',
  containersIn: ['mp4'],
  to: 'mp4',
  videoCodecs: ['h264'],
  audioCodecs: ['aac'],
  // mp4 target of an mp4 source is faithful → defaultOracles attaches reference-reimport (which checks
  // track layout + per-track packet counts) + probe-duration. A dropped audio track shows up as a
  // packet-count / track-layout divergence vs the source golden.
  notes:
    'MULTITRACK KEEP-ALL mux → mp4 (§A.16): mux ALL tracks (1 video + 2 audio) of the multitrack source ' +
    'into a single mp4; every track must survive. reference-reimport (faithful mp4 target) checks track ' +
    'layout + per-track packet counts so a dropped/merged track FAILs.',
};

export const muxCodecEdgeScenarios: Scenario[] = [
  ...CODEC_EDGE_PROPERTY_CASES.map(buildMuxProperty),
  buildMux(MULTITRACK_KEEP_ALL),
];

export default muxCodecEdgeScenarios;
