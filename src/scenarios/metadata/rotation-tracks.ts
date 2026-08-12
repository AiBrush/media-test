/**
 * src/scenarios/metadata/rotation-tracks.ts — rotation-as-a-real-assertion + multi-track attribution
 * for the "metadata" family (A.11 rotation/display-matrix, A.16 "rotated (matrix not w/h swap)",
 * A.11/A.16 multi-track + track selection).
 *
 * WHY these are modeled the way they are (see _shared.ts ORACLE TRUTH — load-bearing):
 *
 * ROTATION: `probe/h264_rotated90` asserts the exact 270° clockwise value and unrotated coded
 * dimensions against the independently normalized FFprobe golden. These metadata-family cases add
 * the OBSERVABLE DECODED EFFECT and write-path preservation:
 *   - `metadata/rotation_decode_read_h264_rotated90` decodes the rotated asset and compares strict
 *     display geometry plus perceptual luma evidence to committed golden frames. The reference decoder
 *     (mediabunny CanvasSink / VideoSample.draw) BAKES the 270° display matrix into its decoded RGBA.
 *     Exact RGBA hashes are intentionally not compared across that Canvas presenter and the product's
 *     WebCodecs+filter presenter because legal YUV→RGB rounding differs. An engine that (a) drops the
 *     matrix, or (b) the A.16 trap — swaps width/height but serves unrotated pixels — still fails the
 *     independent geometry/signature evidence. This is the faithful "matrix not w/h swap" guard.
 *   - `metadata/rotation_survives_mp4_mkv` remuxes the rotated asset to MKV and asserts
 *     decode(remux(x))==decode(x): the display rotation must survive the wrapper change (a dropped
 *     matrix changes decoded presentation → mismatch). Complements the read with a WRITE-path gate
 *     and a second container (the remux family already covers mp4->mov; this covers mp4->mkv).
 * Additional cardinal values are covered by structural and mutation unit tests; the public corpus
 * keeps this one authored display-matrix fixture.
 *
 * MULTI-TRACK + TRACK ATTRIBUTION (closes oracleGap "no case SELECTS/attributes a specific track"):
 * `h264_multitrack.mp4` has 3 tracks (video + 2 audio). True per-track SELECTION (probe a specific
 * non-default track and assert THAT track's metadata) is not an operation the engine contract exposes
 * — probe returns ALL tracks. What is verifiable is LOGICAL attribution: golden-metadata partitions
 * by type and deterministically matches codec/dimensions/rate/language/default/id evidence, while
 * golden-packets joins through the logical mapping before evaluating representation. So:
 *   - `metadata/tracks_attribution_multitrack` gates that all three logical tracks are present and
 *     distinct, independent of array order.
 *   - `metadata/tracks_packet_attribution_multitrack` (demux + golden-packets) gates that EVERY packet
 *     is stamped with the correct trackIndex (the order-independent per-track layout check), catching a
 *     demuxer that mis-attributes a packet to the wrong track.
 * DISTINCT per-track LANGUAGE values (eng/fra/jpn) are not asserted because this source/golden has
 * every track 'und'/null. The semantic comparator can match language when the fixture exposes it;
 * the paired equivalence matrix covers that distinction until a tagged media source is baked.
 */

import type { Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';
import {
  buildDecodeRead,
  buildProperty,
  DECODE_REMUX,
  type DecodeReadCase,
  type MetaPropertyCase,
} from './_shared.ts';

const ROT_TIMEOUT_MS = 30_000;

// ── Rotation read-by-decode (observable-effect gate) ──────────────────────────────────────────────

const ROTATION_DECODE_READ: DecodeReadCase[] = [
  {
    id: 'rotation_decode_read_h264_rotated90',
    revision: 2,
    asset: 'h264_rotated90.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    features: ['rotation:decode'],
    // The clip is short; a handful of frames is enough to catch a wrong/absent rotation since the
    // golden frames and luma signatures are baked rotation-applied. Geometry is exact and the 0.99
    // luma floor tolerates only representation-level YUV→RGB differences between browser presenters.
    maxFrames: 8,
    oracles: ['ssim-psnr'],
    tolerances: { ssimMin: 0.99 },
    timeoutMs: ROT_TIMEOUT_MS,
    notes:
      'Rotation READ as observable decoded effect (A.16 "matrix not w/h swap"): decode h264_rotated90 ' +
      'and compare exact display geometry plus strict perceptual luma to golden frames, which the ' +
      'reference decoder baked rotation-APPLIED. An ' +
      'engine that drops the 270° clockwise display matrix, or bakes rotation into width/height and serves ' +
      'unrotated pixels, fails the independent geometry/signature evidence. Complements the ' +
      'exact clockwise-value probe gate. Requires feature rotation:decode so generic decodeFrames implementations that ' +
      'do not explicitly claim display-matrix-applied output report NA(engine) instead of a misleading ' +
      'pixel mismatch.',
  },
];

// ── Rotation survival across a wrapper change (write-path metamorphic gate) ───────────────────────

const ROTATION_PROPERTY: MetaPropertyCase[] = [
  {
    id: 'rotation_survives_mp4_mkv',
    invariant: DECODE_REMUX,
    input: 'h264_rotated90.mp4',
    from: 'mp4',
    to: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    features: ['rotate'],
    timeoutMs: ROT_TIMEOUT_MS,
    notes:
      'Rotation (270° clockwise display matrix) MP4->MKV: decode(remux(x))==decode(x) proves the display rotation ' +
      'survived the container change (a dropped/garbled matrix changes decoded presentation -> ' +
      'frame-digest mismatch). Complements metadata/rotation_decode_read_h264_rotated90 (a READ gate) ' +
      'with a WRITE-path gate onto MKV (the remux family already covers the mp4->mov path).',
  },
];

// ── Multi-track positional attribution (probe + demux) ────────────────────────────────────────────

/**
 * Probe-side attribution: semantic golden metadata matches logical tracks by type/evidence, so this
 * gates that all three tracks remain distinct even if an API reports a different array order.
 */
const multitrackAttribution: Scenario = defineScenario({
  id: 'metadata/tracks_attribution_multitrack',
  op: 'probe',
  input: 'h264_multitrack.mp4',
  requires: {
    operations: ['probe'],
    containersIn: ['mp4'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
  },
  oracles: ['golden-metadata'],
  metrics: ['wall'],
  notes:
    'Multi-track positional attribution (A.11/A.16 multi-track): h264_multitrack.mp4 has 3 tracks ' +
    '(video + 2 AAC). semantic golden-metadata performs deterministic logical matching, asserting one ' +
    'video and two distinct audio tracks with the right codec/type/sampleRate/channels while allowing ' +
    'array reorder (catches a probe that merges/drops/duplicates a track). True ' +
    'non-default track SELECTION is not part of probe (probe returns all tracks). This asset has no ' +
    'distinct language values; logical language/default/id matching is covered by the metadata ' +
    'equivalence matrix.',
});

/**
 * Demux-side attribution: golden-packets checks the per-track trackIndex layout (order-independent),
 * so this gates that EVERY packet is stamped with the correct trackIndex across the 3 tracks.
 */
const multitrackPacketAttribution: Scenario = defineScenario({
  id: 'metadata/tracks_packet_attribution_multitrack',
  op: 'demux',
  input: 'h264_multitrack.mp4',
  requires: {
    operations: ['demux'],
    containersIn: ['mp4'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
  },
  oracles: ['golden-packets'],
  metrics: ['wall', 'packetsPerSec'],
  primaryMetric: 'packetsPerSec',
  notes:
    'Multi-track packet attribution: demux h264_multitrack.mp4 and assert the per-track trackIndex ' +
    'layout matches golden (golden-packets compares the multiset of trackIndex + per-track sizes/' +
    'keyframes). Catches a demuxer that mis-attributes a packet to the wrong track (the read-side ' +
    'analogue of correct-track metadata reporting).',
});

export const metadataRotationTrackScenarios: Scenario[] = [
  ...ROTATION_DECODE_READ.map(buildDecodeRead),
  ...ROTATION_PROPERTY.map(buildProperty),
  multitrackAttribution,
  multitrackPacketAttribution,
];

export default metadataRotationTrackScenarios;
