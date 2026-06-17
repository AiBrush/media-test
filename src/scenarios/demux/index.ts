/**
 * src/scenarios/demux/index.ts — Pillar 1, family "demux".
 *
 * Demux MP4/MOV/WebM/MKV/TS and assert the packet table (per-track index, pts/dts in µs, keyframe
 * flags, sizes) against committed independent golden via the `golden-packets` oracle. This is the
 * structural test that catches reordering, dropped packets, wrong timescales, or missing keyframe
 * flags. Audio-only containers are exercised too so single-track demux is covered.
 */

import type { Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';

interface DemuxCase {
  asset: string;
  container: string;
  videoCodecs?: string[];
  audioCodecs?: string[];
  notes?: string;
}

const DEMUX_CASES: DemuxCase[] = [
  // ── MP4 / MOV ──
  { asset: 'h264_1080p_30s.mp4', container: 'mp4', videoCodecs: ['h264'], audioCodecs: ['aac'] },
  {
    asset: 'h264_bframes_1080p.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'B-frames: dts < pts on reordered frames — golden encodes the exact dts/pts spread.',
  },
  {
    asset: 'h264_vfr.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'VFR: uneven inter-packet pts deltas; demux must preserve per-sample timestamps verbatim.',
  },
  {
    asset: 'h264_multitrack.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'Multiple tracks: packets must carry correct trackIndex; golden interleaves both tracks.',
  },
  { asset: 'h264_1080p_5s.mov', container: 'mov', videoCodecs: ['h264'], audioCodecs: ['aac'] },

  // ── WebM / MKV ──
  { asset: 'vp9_1080p_10s.webm', container: 'webm', videoCodecs: ['vp9'], audioCodecs: ['opus'] },
  { asset: 'vp8_720p_10s.webm', container: 'webm', videoCodecs: ['vp8'], audioCodecs: ['vorbis'] },
  { asset: 'av1_720p_5s.webm', container: 'webm', videoCodecs: ['av1'], audioCodecs: ['opus'] },
  { asset: 'h264_in_mkv.mkv', container: 'mkv', videoCodecs: ['h264'], audioCodecs: ['aac'] },

  // ── TS ──
  {
    asset: 'h264_ts.ts',
    container: 'ts',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'MPEG-TS: PES timestamps in 90kHz clock; demux normalizes pts/dts to µs for the golden.',
  },

  // ── Audio-only single-track demux ──
  { asset: 'aac_adts.aac', container: 'adts', audioCodecs: ['aac'], notes: 'ADTS frame boundaries → audio packets.' },
  { asset: 'opus.ogg', container: 'ogg', audioCodecs: ['opus'], notes: 'OGG page → Opus packet boundaries.' },
  { asset: 'flac_seektable.flac', container: 'flac', audioCodecs: ['flac'] },
];

export const demuxScenarios: Scenario[] = DEMUX_CASES.map((c) =>
  defineScenario({
    id: `demux/${c.asset.replace(/\.[^.]+$/, '')}`,
    op: 'demux',
    input: c.asset,
    requires: {
      operations: ['demux'],
      containersIn: [c.container],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
    },
    oracles: ['golden-packets'],
    metrics: ['wall'],
    ...(c.notes ? { notes: c.notes } : {}),
  }),
);

export default demuxScenarios;
