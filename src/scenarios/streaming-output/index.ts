/**
 * src/scenarios/streaming-output/index.ts — Pillar 1, family "streaming-output".
 *
 * Exercises HOW bytes leave the engine, independent of the codec work:
 *  - buffer vs streaming target: produce the whole blob at once vs incrementally (target writes
 *    observed via the targetWrites/bytesOut metrics).
 *  - fragmented / CMAF (feature 'fragmented'): moof/mdat fragmented MP4 suitable for MSE.
 *  - fastStart:reserve (feature 'fastStart:reserve'): reserve a forward moov and patch it — the
 *    oracle/runner provokes a large forward seek in the target to test reserve handling.
 *  - tiny TS writes: MPEG-TS output written in many small 188-byte-aligned chunks.
 *
 * All are remux ops (coded samples copied) so correctness reduces to "re-imports + plays": the
 * `reference-reimport` and `playback-smoke` oracles. The output-shape knob lives in options.
 */

import type { Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';

const STREAM_METRICS = [
  'wall',
  'throughputRealtime',
  'peakMemory',
  'targetWrites',
  'bytesOut',
  'longtasks',
] as const;

interface StreamCase {
  id: string;
  asset: string;
  from: string;
  to: string;
  videoCodecs?: string[];
  audioCodecs?: string[];
  /** output-shape options forwarded to the engine */
  options: Record<string, unknown>;
  /** extra features the output mode needs */
  features?: string[];
  notes?: string;
}

const STREAM_CASES: StreamCase[] = [
  {
    id: 'mp4_buffer_target',
    asset: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    options: { container: 'mp4', target: 'buffer' },
    notes: 'Whole-blob (in-memory) target; baseline for the streaming comparison.',
  },
  {
    id: 'mp4_streaming_target',
    asset: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    options: { container: 'mp4', target: 'stream' },
    notes: 'Incremental/streaming target; targetWrites should be many small writes, not one.',
  },
  {
    id: 'mp4_fragmented_cmaf',
    asset: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    options: { container: 'mp4', fragmented: true, target: 'stream' },
    features: ['fragmented'],
    notes: 'Fragmented MP4 (CMAF): moof/mdat fragments, MSE-appendable; re-import must see segments.',
  },
  {
    id: 'mp4_faststart_reserve',
    asset: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    options: { container: 'mp4', fastStart: 'reserve', target: 'stream' },
    features: ['fastStart:reserve'],
    notes: 'fastStart with reserved forward moov; runner provokes a large forward seek in the target.',
  },
  {
    id: 'ts_tiny_writes',
    asset: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'ts',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    options: { container: 'ts', target: 'stream', writeChunkBytes: 188 },
    notes: 'MPEG-TS streamed in many tiny 188-byte-aligned writes; stresses small-write paths.',
  },
  {
    id: 'webm_streaming_target',
    asset: 'vp9_1080p_10s.webm',
    from: 'webm',
    to: 'webm',
    videoCodecs: ['vp9'],
    audioCodecs: ['opus'],
    options: { container: 'webm', target: 'stream' },
    notes: 'Streaming WebM (live-profile clusters); re-import + playback.',
  },
];

export const streamingOutputScenarios: Scenario[] = STREAM_CASES.map((c) =>
  defineScenario({
    id: `streaming-output/${c.id}`,
    op: 'remux',
    input: c.asset,
    options: c.options,
    requires: {
      operations: ['remux'],
      containersIn: [c.from],
      containersOut: [c.to],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
      ...(c.features ? { features: c.features } : {}),
    },
    oracles: ['reference-reimport', 'playback-smoke'],
    metrics: [...STREAM_METRICS],
    ...(c.notes ? { notes: c.notes } : {}),
  }),
);

export default streamingOutputScenarios;
