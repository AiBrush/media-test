/**
 * src/scenarios/streaming-output/ttfb.ts — time-to-first-byte (§A.10), the headline streaming metric
 * the legacy battery never measured.
 *
 * §A.10 lists time-to-first-byte as a PRIMARY streaming metric: a streaming target's whole point is
 * that the first bytes leave the engine BEFORE the file is done, whereas a BufferTarget emits its
 * first byte only at finalize() (first byte == end of op). The legacy STREAM_METRICS omitted
 * 'timeToFirstByte' and no case ranked on it, so buffer vs stream could not be told apart on the
 * headline number. These two cases add it and rank on it.
 *
 * PRIMARY METRIC: `timeToFirstByte` (lower-is-better), set explicitly (§9). The metric is appended to
 * STREAM_METRICS via extraMetrics so the leaderboard column exists.
 *
 * MEASUREMENT DEPENDENCY (honest): `timeToFirstByte` collapses to undefined until the runner sets
 * `MeasureContext.firstByteMs` from a streaming/incremental write callback during the remux op
 * (measure.ts already has firstByteMs → timeToFirstByteMs plumbing, but the streaming-output bench
 * never invokes a first-byte callback). That callback wiring is a core change (runner.ts/adapters),
 * OUTSIDE this writer's scope. The cases are authored so the number materializes the moment it lands.
 *
 * CROSS-CASE DISCRIMINATOR: the metamorphic claim "stream.ttfb << buffer.ttfb" is a comparison of TWO
 * cases' numbers, which the per-output oracle model (oracles.ts judges ONE ctx.output) cannot express
 * as an oracle. It is realized HONESTLY at the report layer: both cases publish timeToFirstByte, so the
 * leaderboard shows stream's first byte arriving earlier than buffer's. We do NOT invent a fake oracle
 * to assert it.
 *
 * CORRECTNESS STILL GATES (§0.1): both are progressive mp4 → reference-reimport (the default), so a
 * fast-but-wrong output FAILs and cannot win the ttfb crown.
 */

import type { Scenario } from '../../core/scenario.ts';
import { buildStreamAll, type StreamCase } from './_shared.ts';

const TTFB_CASES: StreamCase[] = [
  {
    id: 'mp4_ttfb_buffer_target',
    asset: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    shape: { container: 'mp4', target: 'buffer' },
    extraMetrics: ['timeToFirstByte'],
    primaryMetric: 'timeToFirstByte',
    notes:
      'TIME-TO-FIRST-BYTE control (buffer target): a BufferTarget emits its first byte only at ' +
      'finalize(), so ttfb ≈ whole-op wall. The high-water baseline the streaming target is measured ' +
      'against (stream.ttfb should be markedly lower). Ranked on timeToFirstByte (lower-is-better).',
  },
  {
    id: 'mp4_ttfb_streaming_target',
    asset: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    shape: { container: 'mp4', target: 'stream' },
    extraMetrics: ['timeToFirstByte'],
    primaryMetric: 'timeToFirstByte',
    notes:
      'TIME-TO-FIRST-BYTE (streaming target): a StreamTarget writes the first chunk well before the ' +
      'op finishes, so ttfb should be a small fraction of the buffer baseline — the direct, observable ' +
      'buffer-vs-stream discriminator. Requires the runner to set firstByteMs from a write callback.',
  },
];

export const streamingTtfbScenarios: Scenario[] = buildStreamAll(TTFB_CASES);

export default streamingTtfbScenarios;
