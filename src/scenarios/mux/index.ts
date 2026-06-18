/**
 * src/scenarios/mux/index.ts — Pillar 1, family "mux".
 *
 * Pack already-encoded tracks into a container. The engine's mux() takes EncodedTracks; the runner
 * obtains those tracks by demuxing the named source asset(s) (the source provides the coded chunks +
 * codec private data), then asks the engine to remux them into the target container via mux().
 * Because the coded samples are copied, the output must round-trip: `reference-reimport` re-parses the
 * muxed file with the reference engine and diffs the packet table, `playback-smoke` confirms a <video>
 * can play it, and `property-invariant:probe-duration` checks the materialized output duration ≈ the
 * source (the container-agnostic gate that survives cross-container reframing).
 *
 * `input` is the source asset whose demuxed tracks feed the muxer. For multi-track muxing we name a
 * list so the runner can assemble tracks from more than one source.
 *
 * STRUCTURE (mirrors src/scenarios/remux/): the legacy LEGACY_CASES below are preserved VERBATIM
 * (same ids, oracles, options, metrics — existing behavior is not altered). The missing + deep-edge /
 * metamorphic coverage lives in sibling files, each emitting the same Scenario shape via _shared.ts:
 *   - write-targets.ts : the missing WRITE-target containers (mov/ogg/wav/adts/mp3) + audio write matrix
 *   - multi-source.ts  : multi-source → non-mp4, 3-track, track-drop, audio-swap
 *   - codec-edges.ts   : B-frame / rotation / HEVC / multitrack-keep-all fed through the muxer
 *   - size-ladder.ts   : tiny/micro + large/long rungs (sample-table / index growth, co64 crossover)
 *   - output-modes.ts  : mp4 progressive / streaming / fastStart:reserve / fragmented WRITE sub-modes
 *   - metamorphic.ts   : demux(mux(x))≈x (probe-duration), decode(mux(x))==decode(x), VFR
 *   - negative.ts      : illegal codec→container + zero-track mux (graceful-failure)
 */

import type { Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';

import muxCodecEdgeScenarios from './codec-edges.ts';
import muxMetamorphicScenarios from './metamorphic.ts';
import muxMultiSourceScenarios from './multi-source.ts';
import muxNegativeScenarios from './negative.ts';
import muxOutputModeScenarios from './output-modes.ts';
import muxSizeLadderScenarios from './size-ladder.ts';
import muxWriteTargetScenarios from './write-targets.ts';

const MUX_METRICS = ['wall', 'throughputRealtime', 'peakMemory', 'targetWrites', 'longtasks'] as const;

interface LegacyMuxCase {
  id: string;
  /** source asset(s) the runner demuxes to obtain EncodedTracks */
  input: string | string[];
  /** source container(s) — for negotiation */
  containersIn: string[];
  /** target container to mux into */
  to: string;
  videoCodecs?: string[];
  audioCodecs?: string[];
  notes?: string;
}

/**
 * The original 7 mux cases — preserved verbatim (ids, oracles, options, metrics) so existing behavior
 * is unchanged. New coverage lives in the sibling sub-batteries (see the file header).
 */
const LEGACY_CASES: LegacyMuxCase[] = [
  {
    id: 'h264_aac_to_mp4',
    input: 'h264_1080p_30s.mp4',
    containersIn: ['mp4'],
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'Demux H.264+AAC, re-mux into MP4: classic A/V interleave; round-trips via reference.',
  },
  {
    id: 'h264_aac_to_mkv',
    input: 'h264_1080p_30s.mp4',
    containersIn: ['mp4'],
    to: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'Same coded tracks muxed into Matroska.',
  },
  {
    id: 'h264_aac_to_ts',
    input: 'h264_1080p_30s.mp4',
    containersIn: ['mp4'],
    to: 'ts',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'Mux into MPEG-TS: requires Annex-B framing + PES packetization of the coded samples.',
  },
  {
    id: 'vp9_opus_to_webm',
    input: 'vp9_1080p_10s.webm',
    containersIn: ['webm'],
    to: 'webm',
    videoCodecs: ['vp9'],
    audioCodecs: ['opus'],
    notes: 'Demux VP9+Opus, mux back into WebM.',
  },
  {
    id: 'av1_opus_to_mp4',
    input: 'av1_720p_5s.webm',
    containersIn: ['webm'],
    to: 'mp4',
    videoCodecs: ['av1'],
    audioCodecs: ['opus'],
    notes: 'AV1+Opus tracks muxed into MP4 (both legal in MP4).',
  },
  {
    id: 'video_plus_audio_to_mp4',
    input: ['h264_1080p_30s.mp4', 'aac_adts.aac'],
    containersIn: ['mp4', 'adts'],
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'Multi-source mux: video track from one asset + audio track from another into one MP4.',
  },
  {
    id: 'audio_only_aac_to_mp4',
    input: 'aac_adts.aac',
    containersIn: ['adts'],
    to: 'mp4',
    audioCodecs: ['aac'],
    notes: 'Audio-only mux: raw ADTS AAC → MP4(.m4a) sample table.',
  },
];

const legacyMuxScenarios: Scenario[] = LEGACY_CASES.map((c) =>
  defineScenario({
    id: `mux/${c.id}`,
    op: 'mux',
    input: c.input,
    options: { container: c.to },
    requires: {
      // mux needs demux (to get the tracks) + mux (to pack them).
      operations: ['demux', 'mux'],
      containersIn: c.containersIn,
      containersOut: [c.to],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
    },
    oracles: ['reference-reimport', 'playback-smoke'],
    metrics: [...MUX_METRICS],
    ...(c.notes ? { notes: c.notes } : {}),
  }),
);

export const muxScenarios: Scenario[] = [
  ...legacyMuxScenarios,
  ...muxWriteTargetScenarios,
  ...muxMultiSourceScenarios,
  ...muxCodecEdgeScenarios,
  ...muxSizeLadderScenarios,
  ...muxOutputModeScenarios,
  ...muxMetamorphicScenarios,
  ...muxNegativeScenarios,
];

export default muxScenarios;
