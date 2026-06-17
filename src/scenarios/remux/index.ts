/**
 * src/scenarios/remux/index.ts — Pillar 1, family "remux".
 *
 * Lossless container conversion: the coded bitstream is copied, only the wrapper changes. Because
 * pixels never re-encode, the strongest oracle is `decoded-frames-bitexact` (decode the output and
 * compare frame digests to golden), backed by `reference-reimport` (re-parse the output with the
 * reference engine and diff the packet table) and a `playback-smoke` (<video> can play it).
 *
 * Coverage is a cross-container matrix restricted to *lossless* pairs — a codec must be legal in
 * both source and target container (e.g. H.264 in mp4/mov/mkv/ts, VP9/Opus in webm/mkv, PCM only in
 * wav, etc.). Pairs where the codec cannot live in the target (H.264→webm, VP9→mp4) are intentionally
 * omitted: those are transcode, not remux.
 */

import type { Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';

const REMUX_OUT_METRICS = [
  'wall',
  'throughputRealtime',
  'peakMemory',
  'sourceReads',
  'targetWrites',
  'longtasks',
] as const;

interface RemuxCase {
  /** source asset id */
  asset: string;
  /** source container token */
  from: string;
  /** target container token */
  to: string;
  videoCodecs?: string[];
  audioCodecs?: string[];
  notes?: string;
}

/**
 * Lossless cross-container matrix. Each entry is a (source asset, target container) pair where every
 * track's codec is representable in the target without re-encoding.
 */
const REMUX_CASES: RemuxCase[] = [
  // ── H.264(+AAC) is portable across mp4 / mov / mkv / ts ──
  { asset: 'h264_1080p_30s.mp4', from: 'mp4', to: 'mov', videoCodecs: ['h264'], audioCodecs: ['aac'] },
  { asset: 'h264_1080p_30s.mp4', from: 'mp4', to: 'mkv', videoCodecs: ['h264'], audioCodecs: ['aac'] },
  { asset: 'h264_1080p_30s.mp4', from: 'mp4', to: 'ts', videoCodecs: ['h264'], audioCodecs: ['aac'] },
  { asset: 'h264_1080p_5s.mov', from: 'mov', to: 'mp4', videoCodecs: ['h264'], audioCodecs: ['aac'] },
  { asset: 'h264_in_mkv.mkv', from: 'mkv', to: 'mp4', videoCodecs: ['h264'], audioCodecs: ['aac'] },
  {
    asset: 'h264_ts.ts',
    from: 'ts',
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'TS→MP4: Annex-B → AVCC bitstream conversion is still lossless (same coded samples).',
  },
  {
    asset: 'h264_bframes_1080p.mp4',
    from: 'mp4',
    to: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'B-frame reorder must survive the wrapper change: dts/pts spread preserved.',
  },
  {
    asset: 'h264_rotated90.mp4',
    from: 'mp4',
    to: 'mov',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'Rotation metadata (display matrix) must carry across to the new container.',
  },
  {
    asset: 'h264_multitrack.mp4',
    from: 'mp4',
    to: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'All tracks must survive remux; reference-reimport checks track count + per-track packets.',
  },
  {
    asset: 'hevc_1080p_10s.mp4',
    from: 'mp4',
    to: 'mkv',
    videoCodecs: ['hevc'],
    audioCodecs: ['aac'],
    notes: 'HEVC is legal in mp4 and mkv (not in webm).',
  },

  // ── VP9 / VP8 / AV1 with Opus/Vorbis are portable across webm / mkv ──
  { asset: 'vp9_1080p_10s.webm', from: 'webm', to: 'mkv', videoCodecs: ['vp9'], audioCodecs: ['opus'] },
  { asset: 'vp8_720p_10s.webm', from: 'webm', to: 'mkv', videoCodecs: ['vp8'], audioCodecs: ['vorbis'] },
  { asset: 'av1_720p_5s.webm', from: 'webm', to: 'mkv', videoCodecs: ['av1'], audioCodecs: ['opus'] },
  {
    asset: 'av1_720p_5s.webm',
    from: 'webm',
    to: 'mp4',
    videoCodecs: ['av1'],
    audioCodecs: ['opus'],
    notes: 'AV1 + Opus are both legal in mp4 — lossless remux out of webm.',
  },

  // ── Audio-only lossless remux (codec must be legal in target) ──
  {
    asset: 'aac_adts.aac',
    from: 'adts',
    to: 'mp4',
    audioCodecs: ['aac'],
    notes: 'ADTS AAC → MP4(.m4a): strip ADTS headers, wrap raw AAC — lossless.',
  },
  {
    asset: 'mp3_xing.mp3',
    from: 'mp3',
    to: 'mp4',
    audioCodecs: ['mp3'],
    notes: 'MP3 is legal in MP4 — lossless audio remux.',
  },
  {
    asset: 'flac_seektable.flac',
    from: 'flac',
    to: 'mkv',
    audioCodecs: ['flac'],
    notes: 'FLAC → MKV: lossless audio re-wrap; SEEKTABLE dropped, samples identical.',
  },
  {
    asset: 'opus.ogg',
    from: 'ogg',
    to: 'webm',
    audioCodecs: ['opus'],
    notes: 'Opus OGG → WebM: lossless audio re-wrap into Matroska/WebM.',
  },
];

export const remuxScenarios: Scenario[] = REMUX_CASES.map((c) =>
  defineScenario({
    id: `remux/${c.asset.replace(/\.[^.]+$/, '')}_${c.from}_to_${c.to}`,
    op: 'remux',
    input: c.asset,
    options: { container: c.to },
    requires: {
      operations: ['remux'],
      containersIn: [c.from],
      containersOut: [c.to],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
    },
    oracles: ['decoded-frames-bitexact', 'reference-reimport', 'playback-smoke'],
    metrics: [...REMUX_OUT_METRICS],
    ...(c.notes ? { notes: c.notes } : {}),
  }),
);

export default remuxScenarios;
