/**
 * src/scenarios/remux/size-ladder.ts — remux across the SIZE axis (spec §5.3).
 *
 * §5.3 makes size a first-class benchmark axis: the winner at 10 MB can differ from the winner at
 * 1 GB (sustained-throughput vs peak-memory vs lazy-read behavior diverge at scale). Every legacy
 * remux case was tiny/medium, so remux throughput/peak-memory at scale was UNMEASURED. This file
 * remuxes the large/huge/massive rungs of the corpus.
 *
 * PRIMARY METRIC: `throughputRealtime` (output media-seconds per wall-second). Remux is an I/O-bound
 * sample COPY (no re-encode), so sustained throughput + peak memory are the meaningful axes at scale,
 * and throughputRealtime is the per-case leaderboard ranking number (§9). It is in the metrics list.
 *
 * CORRECTNESS STILL GATES (§0.1): each case keeps the semantic reference-reimport gate, so a
 * fast-but-wrong remux cannot win the throughput crown. Fixture availability is intentionally not
 * copied into this comment: src/features/remux/availability.ts derives and audits it from the
 * canonical manifest. At the current manifest revision every rung below has a concrete hash/size.
 *
 * TIMEOUT: each carries a generous per-op cap so a pathological lazy-reader hang at GB scale is caught
 * as a timeout FAIL instead of stalling the Worker (the whole point of the size axis is to surface
 * exactly that failure mode).
 */

import type { Scenario } from '../../core/scenario.ts';
import {
  HUGE_1080P_10MIN_CANDIDATE_ENVELOPE,
  LARGE_1080P_120S_CANDIDATE_ENVELOPE,
  MASSIVE_1080P_2H_CANDIDATE_ENVELOPE,
} from '../_candidate-envelopes.ts';
import { buildRemux, type RemuxCase } from './_shared.ts';

const SIZE_LADDER_TIMEOUT_MS = 120_000; // 2 min: bounds a GB-scale lazy-read remux hang.

interface SizeLadderCase extends RemuxCase {}

const SIZE_LADDER_CASES: SizeLadderCase[] = [
  // large (~100 MB) H.264 MP4 -> MKV: sustained throughput + peak memory for the MP4/H.264 family.
  {
    asset: 'large_h264_1080p_120s.mp4',
    revision: 2,
    candidateEnvelope: LARGE_1080P_120S_CANDIDATE_ENVELOPE,
    from: 'mp4',
    to: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    timeoutMs: SIZE_LADDER_TIMEOUT_MS,
    notes:
      'SIZE LADDER (large ~100 MB): 120 s 1080p H.264 MP4 -> MKV. Measures sustained remux ' +
      'throughput + peak memory at the large rung (legacy remux was tiny/medium only).',
  },
  // large (~100 MB) VP9 WebM -> MKV: crosses the size axis with the WebM/VP9 family.
  {
    asset: 'large_vp9_1080p_120s.webm',
    revision: 2,
    candidateEnvelope: LARGE_1080P_120S_CANDIDATE_ENVELOPE,
    from: 'webm',
    to: 'mkv',
    videoCodecs: ['vp9'],
    audioCodecs: ['opus'],
    timeoutMs: SIZE_LADDER_TIMEOUT_MS,
    notes: 'SIZE LADDER (large ~100 MB): 120 s 1080p VP9 WebM -> MKV. Large-rung WebM remux throughput/memory.',
  },
  // huge (~500-700 MB) self-contained big-read .mov -> MP4: the deterministic big-read remux.
  {
    asset: 'huge_h264_1080p_600s.mov',
    revision: 2,
    candidateEnvelope: HUGE_1080P_10MIN_CANDIDATE_ENVELOPE,
    from: 'mov',
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    timeoutMs: SIZE_LADDER_TIMEOUT_MS,
    notes:
      'SIZE LADDER (huge ~500-700 MB): the self-contained big-read 1080p H.264 .mov -> MP4. Exercises ' +
      'lazy/partial reading + sustained throughput + peak memory at the huge rung.',
  },
  // massive (~1-1.4 GB, 2h) low-bitrate H.264 MP4 -> MKV: lazy-read / OOM-resistance / many-samples.
  {
    asset: 'massive_h264_1080p_2h.mp4',
    revision: 2,
    candidateEnvelope: MASSIVE_1080P_2H_CANDIDATE_ENVELOPE,
    from: 'mp4',
    to: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    timeoutMs: SIZE_LADDER_TIMEOUT_MS,
    notes:
      'SIZE LADDER (massive ~1-1.4 GB, 2h, ~216k frames): low-bitrate 1080p H.264 MP4 -> MKV. The ' +
      'lazy-read / streaming-demux / peak-memory / OOM-resistance + many-thousand-sample stress rung.',
  },
];

export const remuxSizeLadderScenarios: Scenario[] = SIZE_LADDER_CASES.map((c) =>
  // Size is the benchmark axis here: rank the per-case winner by sustained realtime throughput.
  // Supply it to the builder so hashing and deep-freezing cover the final definition.
  buildRemux({ ...c, primaryMetric: 'throughputRealtime' }),
);

export default remuxSizeLadderScenarios;
