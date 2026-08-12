/**
 * src/scenarios/mux/size-ladder.ts — mux across the SIZE axis (spec §5.3, §A.16).
 *
 * Every legacy mux video case was ~5-30 s 720p/1080p — a single rung. §5.3 makes size a first-class
 * benchmark axis, and the muxer's sample-table / index growth only manifests at the extremes:
 *
 *   - TINY / MICRO rung (micro_h264_1frame.mp4, tiny_h264_360p_2s.mp4): one-sample sample tables and
 *     single-cluster files are a known muxer off-by-one source (§A.16 single-frame / 0×0-ish). A mux
 *     that mishandles a 1-sample stts/stsz/stco or an empty-ish chunk list shows up here, never on the
 *     medium rung.
 *   - LARGE / LONG rung (large_h264_1080p_120s.mp4, longform_1h_audio.m4a): sustained table/index
 *     growth and Matroska cue density across many-thousand samples.
 *   - SPARSE >4 GiB rung: an explicit runner-injected sparse target crosses 0xffffffff without a
 *     multi-gigabyte allocation. A declaring muxer must author co64/large-size boxes and the neutral
 *     reader re-imports sample prefixes on both sides of the boundary.
 *
 * PRIMARY METRIC: `throughputRealtime` (output media-seconds per wall-second). Mux is an I/O-bound
 * sample COPY (no re-encode), so sustained throughput + peak memory are the meaningful axes at scale,
 * and throughputRealtime is the per-case leaderboard ranking number (§9). CORRECTNESS STILL GATES
 * (§0.1): each case keeps its container-appropriate oracle set (probe-duration always; reference-
 * reimport for faithful mp4 targets), so a fast-but-wrong mux FAILs and cannot win the throughput crown.
 *
 * HONESTY: the large/long assets are `source: generated` with sha256/sizeBytes still null in the
 * manifest (gated behind a non-skip-longform bake). Until the bake produces them, these cases resolve
 * to NA(asset-missing) / a clean golden-absent gate rather than a fabricated number — wired now so the
 * leaderboard cell lines up the moment the bake completes (same posture as remux/size-ladder.ts).
 *
 * TIMEOUT: a generous per-op cap so a pathological lazy-reader / index-rewrite hang at scale is caught
 * as a timeout FAIL instead of stalling the Worker.
 */

import type { Scenario } from '../../core/scenario.ts';
import { MUX_SPARSE_CO64_ACCEPTANCE_CASE } from '../../features/mux/index.ts';
import {
  LARGE_1080P_120S_CANDIDATE_ENVELOPE,
  TINY_640X360_2S_CANDIDATE_ENVELOPE,
} from '../_candidate-envelopes.ts';
import { buildMux, type MuxCase } from './_shared.ts';

const SIZE_LADDER_TIMEOUT_MS = 120_000; // 2 min: bounds a large/long mux index-rewrite hang.

const SIZE_LADDER_CASES: MuxCase[] = [
  // ── TINY / MICRO rung: one-sample / few-sample sample tables (off-by-one surface) ──
  {
    id: 'size_micro_1frame_to_mp4',
    input: 'micro_h264_1frame.mp4',
    containersIn: ['mp4'],
    to: 'mp4',
    videoCodecs: ['h264'],
    timeoutMs: SIZE_LADDER_TIMEOUT_MS,
    notes:
      'SIZE LADDER (micro, single frame §A.16): mux a 1-keyframe H.264 stream → mp4. Single-sample ' +
      'stts/stsz/stco authoring — a classic muxer off-by-one rung a short-but-multi-frame clip misses.',
  },
  {
    id: 'size_micro_1frame_to_mkv',
    input: 'micro_h264_1frame.mp4',
    containersIn: ['mp4'],
    to: 'mkv',
    videoCodecs: ['h264'],
    timeoutMs: SIZE_LADDER_TIMEOUT_MS,
    notes:
      'SIZE LADDER (micro §A.16): 1-frame H.264 → mkv. Single-cluster / single-SimpleBlock Matroska ' +
      'authoring (the off-by-one rung on the Matroska writer).',
  },
  {
    id: 'size_tiny_360p_to_mp4',
    revision: 2,
    input: 'tiny_h264_360p_2s.mp4',
    containersIn: ['mp4'],
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    candidateEnvelope: TINY_640X360_2S_CANDIDATE_ENVELOPE,
    timeoutMs: SIZE_LADDER_TIMEOUT_MS,
    notes: 'SIZE LADDER (tiny ~100 KB): 2 s 360p H.264+AAC → mp4. Tiny-rung mux latency / small sample table.',
  },

  // ── LARGE / LONG rung: 64-bit (co64) offset crossover + dense mkv cues + many-thousand samples ──
  {
    id: 'size_large_1080p_to_mp4',
    revision: 2,
    input: 'large_h264_1080p_120s.mp4',
    containersIn: ['mp4'],
    to: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    candidateEnvelope: LARGE_1080P_120S_CANDIDATE_ENVELOPE,
    primaryMetric: 'throughputRealtime',
    tolerances: { durationToleranceSec: 0.125 },
    timeoutMs: SIZE_LADDER_TIMEOUT_MS,
    notes:
      'SIZE LADDER (large ~100 MB §A.16): 120 s 1080p H.264 → mp4. Many-thousand-sample sample table; ' +
      'stco→co64 crossover territory. Sustained mux throughput + peak memory (legacy mux was ≤30 s).',
  },
  {
    id: 'size_large_1080p_to_mkv',
    revision: 2,
    input: 'large_h264_1080p_120s.mp4',
    containersIn: ['mp4'],
    to: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    candidateEnvelope: LARGE_1080P_120S_CANDIDATE_ENVELOPE,
    primaryMetric: 'throughputRealtime',
    tolerances: { durationToleranceSec: 0.125 },
    timeoutMs: SIZE_LADDER_TIMEOUT_MS,
    notes:
      'SIZE LADDER (large ~100 MB §A.16): 120 s 1080p H.264 → mkv. Matroska cue-index density at scale ' +
      '(a short clip has a trivial cue list); sustained throughput + memory.',
  },
  {
    id: 'size_longform_audio_to_mp4',
    input: 'longform_1h_audio.m4a',
    containersIn: ['mp4'],
    to: 'mp4',
    audioCodecs: ['aac'],
    primaryMetric: 'throughputRealtime',
    timeoutMs: SIZE_LADDER_TIMEOUT_MS,
    notes:
      'SIZE LADDER (long, multi-hour §A.16): mux 1 h of AAC → mp4(.m4a). Many-thousand-sample audio ' +
      'sample table — forces the index-growth path (large stsz/stco) a short clip never reaches.',
  },
  {
    id: 'size_sparse_gt4gib_co64',
    revision: 2,
    input: 'tiny_h264_360p_2s.mp4',
    containersIn: ['mp4'],
    to: 'mp4',
    videoCodecs: ['h264'],
    features: ['mux:sparse-co64'],
    extraOptions: {
      invariant: 'mux-large-file-addressing',
      trackSelect: ['video:0'],
      robustness: { muxLargeFile: MUX_SPARSE_CO64_ACCEPTANCE_CASE.contract },
    },
    oracles: ['property-invariant'],
    metrics: ['wall'],
    timeoutMs: 600_000,
    notes:
      'LONG RESOURCE GATE: author source-bound H.264 packets into the runner sparse target with media offsets below and above ' +
      '0xffffffff. Neutral re-import requires co64, a 64-bit mdat size, in-range offsets, and exact ' +
      'sample-prefix readback without allocating the virtual >4 GiB extent.',
  },
];

export const muxSizeLadderScenarios: Scenario[] = SIZE_LADDER_CASES.map((c) => buildMux(c));

export default muxSizeLadderScenarios;
