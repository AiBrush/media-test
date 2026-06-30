/**
 * src/scenarios/streaming-output/size-ladder.ts — the buffer-vs-stream PEAK-MEMORY contrast at scale
 * (§A.10 core claim + §5.3 size axis). This is the streaming target's reason-to-exist.
 *
 * §A.10's central claim is that a streaming target AVOIDS holding the whole file in memory. The legacy
 * battery used a single ~10 MB asset for every case, so the buffer and stream cases reported IDENTICAL
 * peak memory — the contrast that makes this family meaningful was absent. §5.3 makes size a first-class
 * axis: the winner at 10 MB can differ from the winner at 1 GB (sustained throughput vs peak memory vs
 * lazy-read diverge at scale). This file streams the large/huge/massive rungs and ranks on peak memory.
 *
 * PRIMARY METRIC: `peakMemory` (lower-is-better at scale). A true StreamTarget should keep peak memory
 * BOUNDED (<< file size) while an equivalent BufferTarget shows file-sized peak memory (or OOMs). Both a
 * buffer rung and a stream rung are cased at the massive size so the leaderboard shows the divergence.
 *
 * MEASUREMENT NOTES (honest):
 *   - peakMemory is cross-engine-correct only via measureUserAgentSpecificMemory (Chromium,
 *     cross-origin-isolated); measure.ts falls back to performance.memory.usedJSHeapSize, else null. On
 *     engines/browsers without either, peakMemory is null (omitted) — reported honestly, not faked.
 *   - The buffer-vs-stream peak-memory DIVERGENCE only materializes once the runner forwards the
 *     target/shape arg to the adapter so the stream rung actually uses a StreamTarget (today both run a
 *     buffered remux → identical peak memory). The cases are wired so the contrast appears the moment
 *     that lands; until then they honestly report equal peak memory.
 *   - The large/huge/massive assets are manifest-declared with sizeBytes=null (gated behind a non-skip-
 *     longform bake) and their golden is pending → these cases resolve to NA(asset-missing) / a clean
 *     golden-absent FAIL rather than a fabricated number. Wired now so the leaderboard cell + golden
 *     filenames line up the moment the bake completes (mirrors remux/size-ladder.ts).
 *
 * CORRECTNESS STILL GATES (§0.1): reference-reimport keeps a fast/low-memory-but-WRONG stream from
 * winning the peak-memory crown. (decode-remux/playback-smoke are omitted: at GB scale a full decode is
 * needlessly slow, golden frames are pending, and the point here is the memory/throughput axis.)
 *
 * TIMEOUT: a generous per-op cap so a pathological lazy-reader hang at GB scale is caught as a timeout
 * FAIL instead of stalling the Worker — surfacing exactly the failure mode the size axis exists to find.
 */

import type { Scenario } from '../../core/scenario.ts';
import { buildStream, type StreamCase } from './_shared.ts';

const SIZE_LADDER_TIMEOUT_MS = 300_000; // 5 min: bounds a GB-scale streaming-remux hang.

const SIZE_LADDER_CASES: StreamCase[] = [
  // large (~100 MB) H.264 MP4 streamed to MP4: sustained throughput + peak memory at the large rung.
  {
    id: 'stream_large_h264_mp4',
    asset: 'large_h264_1080p_120s.mp4',
    from: 'mp4',
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    shape: { container: 'mp4', target: 'stream' },
    oracles: ['reference-reimport'],
    primaryMetric: 'peakMemory',
    timeoutMs: SIZE_LADDER_TIMEOUT_MS,
    notes:
      'SIZE LADDER (large ~100 MB) STREAM target: 120 s 1080p H.264 MP4 streamed out. Measures sustained ' +
      'streaming throughput + bounded peak memory at the large rung (legacy streaming-output was 10 MB only).',
  },
  // large (~100 MB) VP9 WebM streamed to WebM: crosses the size axis with the WebM/VP9 family.
  {
    id: 'stream_large_vp9_webm',
    asset: 'large_vp9_1080p_120s.webm',
    from: 'webm',
    to: 'webm',
    videoCodecs: ['vp9'],
    audioCodecs: ['opus'],
    shape: { container: 'webm', target: 'stream' },
    oracles: ['reference-reimport'],
    primaryMetric: 'peakMemory',
    timeoutMs: SIZE_LADDER_TIMEOUT_MS,
    notes: 'SIZE LADDER (large ~100 MB) STREAM target: 120 s 1080p VP9 WebM streamed out. Large-rung WebM streaming memory/throughput.',
  },
  // huge (~500-700 MB) .mov streamed to MP4: lazy/partial reading + sustained throughput at scale.
  {
    id: 'stream_huge_h264_mov_to_mp4',
    asset: 'huge_h264_1080p_600s.mov',
    from: 'mov',
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    shape: { container: 'mp4', target: 'stream' },
    oracles: ['reference-reimport'],
    primaryMetric: 'peakMemory',
    timeoutMs: SIZE_LADDER_TIMEOUT_MS,
    notes:
      'SIZE LADDER (huge ~500-700 MB) STREAM target: the self-contained big-read 1080p H.264 .mov ' +
      'streamed to MP4. Exercises lazy/partial reading + sustained streaming throughput + bounded peak ' +
      'memory at the huge rung.',
  },
  // massive (~1-1.4 GB, 2h) low-bitrate H.264 MP4 — STREAM rung: bounded peak memory / OOM-resistance.
  {
    id: 'stream_massive_h264_mp4',
    asset: 'massive_h264_1080p_2h.mp4',
    from: 'mp4',
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    shape: { container: 'mp4', target: 'stream' },
    oracles: ['reference-reimport'],
    primaryMetric: 'peakMemory',
    timeoutMs: SIZE_LADDER_TIMEOUT_MS,
    notes:
      'SIZE LADDER (massive ~1-1.4 GB, 2h, ~216k samples) STREAM target: low-bitrate 1080p H.264 MP4 ' +
      'streamed out. The bounded-peak-memory / OOM-resistance rung that proves the streaming target ' +
      'reason-to-exist — peak memory must stay << file size where the buffer rung is file-sized / OOMs.',
  },
  // massive (~1-1.4 GB) — BUFFER rung: the contrast partner. A BufferTarget holds the whole file →
  // file-sized peak memory (or OOM). Paired with stream_massive_h264_mp4 so the leaderboard shows the
  // buffer-vs-stream peak-memory divergence at the size where it matters.
  {
    id: 'buffer_massive_h264_mp4',
    asset: 'massive_h264_1080p_2h.mp4',
    from: 'mp4',
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    shape: { container: 'mp4', target: 'buffer' },
    oracles: ['reference-reimport'],
    primaryMetric: 'peakMemory',
    timeoutMs: SIZE_LADDER_TIMEOUT_MS,
    notes:
      'SIZE LADDER (massive ~1-1.4 GB) BUFFER target — the contrast partner to stream_massive_h264_mp4: ' +
      'a BufferTarget materializes the whole output in memory → file-sized peak memory (or OOM at the ' +
      'massive rung). The buffer-vs-stream peak-memory divergence that makes this family meaningful.',
  },
];

export const streamingSizeLadderScenarios: Scenario[] = SIZE_LADDER_CASES.map(buildStream);

export default streamingSizeLadderScenarios;
