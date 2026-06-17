/**
 * src/scenarios/mux/index.ts — Pillar 1, family "mux".
 *
 * Pack already-encoded tracks into a container. The engine's mux() takes EncodedTracks; the runner
 * obtains those tracks by demuxing the named source asset(s) (the source provides the coded chunks +
 * codec private data), then asks the engine to remux them into the target container via mux().
 * Because the coded samples are copied, the output must round-trip: `reference-reimport` re-parses
 * the muxed file with the reference engine and diffs the packet table, and `playback-smoke` confirms
 * a <video> can play it.
 *
 * `input` is the source asset whose demuxed tracks feed the muxer. For multi-track muxing we name a
 * list so the runner can assemble tracks from more than one source.
 */

import type { Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';

const MUX_METRICS = ['wall', 'throughputRealtime', 'peakMemory', 'targetWrites', 'longtasks'] as const;

interface MuxCase {
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

const MUX_CASES: MuxCase[] = [
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

export const muxScenarios: Scenario[] = MUX_CASES.map((c) =>
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

export default muxScenarios;
