/**
 * src/scenarios/streaming-output/base.ts — the BASE streaming-output battery (the original six
 * output-shape cases), now routed through ./_shared.ts so every sub-battery shares one shape.
 *
 * STABLE IDS: the six ids below (mp4_buffer_target, mp4_streaming_target, mp4_fragmented_cmaf,
 * mp4_faststart_reserve, ts_tiny_writes, webm_streaming_target) are unchanged from the legacy
 * index.ts so existing leaderboard cells / golden filenames line up.
 *
 * ORACLE FIX vs the legacy index (which attached reference-reimport + playback-smoke to ALL six):
 *   - mp4_fragmented_cmaf  → DROP playback-smoke (a bare fMP4 may not play in a plain <video src=blob>,
 *     and the platform inline mp4 demux is progressive-only → a CORRECT fragmented output risked a
 *     FALSE FAIL). Gate on reference-reimport only (mediabunny reads fMP4/CMAF, dossier §A.2). The
 *     moof/mdat init+media-split STRUCTURE assertion needs a new oracle (see ./fragmented-faststart.ts
 *     header) that is outside this writer's scope.
 *   - ts_tiny_writes       → DROP playback-smoke (raw MPEG-TS is not reliably plain-<video>-playable
 *     cross-browser; TS duration is estimate-only). Gate on reference-reimport (mediabunny reads
 *     MPEG_TS, dossier §A.2).
 *   - webm_streaming_target→ KEEP both: a normal streamed WebM with a Segment Duration is plain-<video>
 *     playable and inline-demuxable. (The HEADERLESS/live WebM profile is a SEPARATE case in
 *     ./ts-webm-live.ts and there gates on reference-reimport only.)
 *   - mp4_buffer_target / mp4_streaming_target → KEEP both (progressive mp4, plain-playable).
 *
 * See ./_shared.ts for the full oracle rationale and the contract-level caveat that the shape knobs in
 * `options` are not yet forwarded by the runner.
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
    // reference-reimport ONLY: a bare fMP4 is not reliably plain-<video>-playable and the platform
    // inline demux is progressive-only — playback-smoke/decode-remux would risk a false FAIL.
    oracles: ['reference-reimport'],
    notes:
      'Fragmented MP4 (CMAF): moof/mdat fragments, MSE-appendable. reference-reimport proves the ' +
      'fragments re-parse to the same packet table; the moof/mdat init+media-split STRUCTURE check ' +
      'is a separate case needing a new structural oracle (see ./fragmented-faststart.ts).',
  },
  {
    id: 'mp4_faststart_reserve',
    asset: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    shape: { container: 'mp4', fastStart: 'reserve', target: 'stream' },
    features: ['fastStart:reserve'],
    notes:
      'fastStart with reserved forward moov (mediabunny fastStart:"reserve", needs maximumPacketCount). ' +
      'reference-reimport + playback-smoke verify the reserved-moov output still re-imports + plays; the ' +
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
      'Streaming WebM (normal Segment Duration, plain-<video> playable); re-import + playback. The ' +
      'headerless/live Matroska profile is a separate case (see ./ts-webm-live.ts).',
  },
];

export const streamingBaseScenarios: Scenario[] = buildStreamAll(BASE_CASES);

export default streamingBaseScenarios;
