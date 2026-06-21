/**
 * src/scenarios/streaming-output/base.ts — the BASE streaming-output battery (the original six
 * output-shape cases), now routed through ./_shared.ts so every sub-battery shares one shape.
 *
 * STABLE IDS: the six ids below (mp4_buffer_target, mp4_streaming_target, mp4_fragmented_cmaf,
 * mp4_faststart_reserve, ts_tiny_writes, webm_streaming_target) are unchanged from the legacy
 * index.ts so existing leaderboard cells / golden filenames line up.
 *
 * ORACLE FIX vs the legacy index (which attached reference-reimport + playback-smoke to ALL six):
 * every base case now gates byte validity with reference-reimport only. The raw Brave run showed
 * playback-smoke false-failing progressive MP4 outputs that re-imported correctly, and fragmented/TS
 * outputs were never safe plain-<video> inputs. MP4 fastStart/fragmented rows also get the
 * mp4-box-layout oracle from the shared builder so the requested shape cannot pass as a plain remux.
 *
 * See ./_shared.ts for the full oracle rationale and remaining observability caveats.
 */

import type { Scenario } from '../../core/scenario.ts';
import { buildStreamAll, type StreamCase } from './_shared.ts';

const BASE_CASES: StreamCase[] = [
  {
    id: 'mp4_buffer_target',
    asset: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    shape: { container: 'mp4', target: 'buffer' },
    notes: 'Whole-blob (in-memory BufferTarget) output; baseline for the streaming comparison.',
  },
  {
    id: 'mp4_streaming_target',
    asset: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    shape: { container: 'mp4', target: 'stream' },
    notes:
      'Incremental/streaming target; targetWrites should be many small writes, not one (becomes ' +
      'observable once the runner threads a CountingTarget through remux).',
  },
  {
    id: 'mp4_fragmented_cmaf',
    asset: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    shape: { container: 'mp4', fragmented: true, target: 'stream' },
    features: ['fragmented'],
    // reference-reimport + mp4-box-layout: a bare fMP4 is not reliably plain-<video>-playable and the
    // platform inline demux is progressive-only — playback-smoke/decode-remux would risk a false FAIL.
    oracles: ['reference-reimport'],
    notes:
      'Fragmented MP4 (CMAF): moof/mdat fragments, MSE-appendable. reference-reimport proves the ' +
      'fragments re-parse to the same packet table; mp4-box-layout checks top-level moov/moof/mdat ' +
      'structure. Deeper MSE appendability remains a separate oracle gap.',
  },
  {
    id: 'mp4_faststart_reserve',
    asset: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    shape: { container: 'mp4', fastStart: 'reserve', target: 'stream', maximumPacketCount: 4096 },
    features: ['fastStart:reserve'],
    notes:
      'fastStart with reserved forward moov (mediabunny fastStart:"reserve", needs maximumPacketCount). ' +
      'reference-reimport verifies the reserved-moov output still re-imports; the ' +
      'forward-seek/patch STRUCTURE assertion is a separate case (see ./fragmented-faststart.ts).',
  },
  {
    id: 'ts_tiny_writes',
    asset: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'ts',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    shape: { container: 'ts', target: 'stream', writeChunkBytes: 188 },
    // reference-reimport ONLY: raw TS is not reliably plain-<video>-playable; duration is estimate-only.
    oracles: ['reference-reimport'],
    notes:
      'MPEG-TS streamed in many tiny 188-byte-aligned writes; stresses small-write paths. ' +
      'reference-reimport (mediabunny reads MPEG_TS) gates structural integrity; the 188-byte write- ' +
      'granularity assertion needs CountingTarget wiring (see ./ts-webm-live.ts).',
  },
  {
    id: 'webm_streaming_target',
    asset: 'vp9_1080p_10s.webm',
    from: 'webm',
    to: 'webm',
    videoCodecs: ['vp9'],
    audioCodecs: ['opus'],
    shape: { container: 'webm', target: 'stream' },
    notes:
      'Streaming WebM (normal Segment Duration); reference re-import gates byte validity. The ' +
      'headerless/live Matroska profile is a separate case (see ./ts-webm-live.ts).',
  },
];

export const streamingBaseScenarios: Scenario[] = buildStreamAll(BASE_CASES);

export default streamingBaseScenarios;
