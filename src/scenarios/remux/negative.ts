/**
 * src/scenarios/remux/negative.ts — negative / edge inputs fed INTO a remux op (graceful-failure).
 *
 * The robustness family fuzzes PROBE/DEMUX/DECODE and has ONE generic remux fuzz (zeroed spans) plus a
 * zero-length PROBE — but nothing that targets the remux op with a zero-length or header-truncated
 * input specifically. A lossless remux that copies coded samples has its own failure surface (sample
 * table / cluster parse, then a WRITE path) that a malformed input must trip CLEANLY: throw/reject
 * within the timeout, never crash/hang/OOM.
 *
 * HOW THESE GATE (oracles.ts `gracefulFailure` + runner.ts robustness path):
 *   - Each case carries a deterministic `mutate` that corrupts a VALID source asset. A scenario with a
 *     `mutate` function is (a) classified into the robustness PILLAR (runner.selectByPillar) and (b)
 *     routed through runner.runRobustness, which feeds the mutated bytes and expects engine.remux to
 *     throw/reject within `timeoutMs`. `gracefulFailure` then reads `!!ctx.scenario.mutate` as the
 *     robustness signal and PASSes iff no output was produced (graceful) — FAILs on a hang/timeout or
 *     on output emitted from clearly-malformed input.
 *   - This file lives under src/scenarios/remux/ (so the id is `remux/...` and it ships with the
 *     family) while behaving as a robustness probe of the remux op — the cleanest way to add
 *     remux-targeted negatives without editing the robustness family.
 *
 * The two `recorder_headerless`-style duration-materialization invariant (a VALID headerless input
 * that must yield a sane output) is NOT here — it is a property-invariant (valid output expected) and
 * lives in metamorphic.ts. This file is only for inputs that must be REJECTED.
 */

import type { Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';

const REMUX_NEG_TIMEOUT_MS = 15_000;

/** Zero the entire buffer (models an empty / all-zero input the remux sample-table parse must reject). */
function zeroOutAll(): (bytes: Uint8Array) => Uint8Array {
  return (bytes) => new Uint8Array(bytes.length);
}

/** Truncate to ~50%: a partial upload where moov/mdat (or the final cluster) is incomplete. */
function truncateTail(fraction: number): (bytes: Uint8Array) => Uint8Array {
  return (bytes) => bytes.slice(0, Math.max(0, Math.floor(bytes.length * fraction)));
}

/** Drop the first `headerBytes` bytes so container magic / moov head is destroyed but payload remains. */
function dropHeader(headerBytes: number): (bytes: Uint8Array) => Uint8Array {
  return (bytes) => (bytes.length <= headerBytes ? new Uint8Array(0) : bytes.slice(headerBytes));
}

interface RemuxNegativeCase {
  id: string;
  /** valid base asset to corrupt before remuxing */
  asset: string;
  from: string;
  to: string;
  videoCodecs?: string[];
  audioCodecs?: string[];
  mutate: (bytes: Uint8Array) => Uint8Array;
  gracefulAllowOutput?: boolean;
  notes: string;
}

const NEGATIVE_CASES: RemuxNegativeCase[] = [
  {
    id: 'neg_zeroed_mp4_to_mkv',
    asset: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    mutate: zeroOutAll(),
    notes:
      'All-zero MP4 bytes -> remux to MKV: the sample-table/box parse must reject cleanly (no codable ' +
      'stream), never crash/hang/OOM. (Targets the remux op specifically; robustness only zero-spans it.)',
  },
  {
    id: 'neg_truncated_mp4_to_mkv',
    asset: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    mutate: truncateTail(0.5),
    gracefulAllowOutput: true,
    notes:
      'MP4 cut at 50% (incomplete moov/mdat) -> remux to MKV: engine must reject or emit nothing ' +
      'cleanly, or emit a safe partial output, within the timeout — no OOM on a half-present sample table.',
  },
  {
    id: 'neg_headerless_webm_to_mkv',
    asset: 'vp9_1080p_10s.webm',
    from: 'webm',
    to: 'mkv',
    videoCodecs: ['vp9'],
    audioCodecs: ['opus'],
    mutate: dropHeader(128),
    notes:
      'WebM with the EBML header destroyed -> remux to MKV: the demux stage of remux must reject the ' +
      'unparseable header gracefully rather than loop on a bogus element size.',
  },
];

export const remuxNegativeScenarios: Scenario[] = NEGATIVE_CASES.map((c) =>
  defineScenario({
    id: `remux/${c.id}`,
    op: 'remux',
    input: c.asset,
    options: { container: c.to, ...(c.gracefulAllowOutput ? { gracefulAllowOutput: true } : {}) },
    requires: {
      operations: ['remux'],
      containersIn: [c.from],
      containersOut: [c.to],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
    },
    oracles: ['graceful-failure'],
    metrics: ['wall', 'peakMemory'],
    mutate: c.mutate,
    timeoutMs: REMUX_NEG_TIMEOUT_MS,
    notes: c.notes,
  }),
);

export default remuxNegativeScenarios;
