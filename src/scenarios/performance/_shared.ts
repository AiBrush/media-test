/**
 * src/scenarios/performance/_shared.ts — shared inputs, constants, and a thin scenario builder for
 * the headline performance battery (§8.1 / §8.2 / §A.14).
 *
 * WHY THIS FILE: the family was a single index.ts with the four Mediabunny-parity headlines. Extending
 * it (size ladder, per-op sweep, decode/encode/seek fps, resource metrics, metamorphic) means many
 * cases sharing the SAME asset ids, timeouts, and `requires` shapes — so the inputs and a builder live
 * here and the topic files stay declarative. Nothing here names a library; everything is engine-
 * independent (op / input / requires / oracles / metrics), exactly as scenario.ts mandates.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────────────
 * HONESTY BOUNDARY — which §A.14 metrics this family can rank TODAY, and which it deliberately omits.
 *
 * A scenario can only be ranked by a `primaryMetric` the RUNNER actually produces a sample for. The
 * runner's bench loop (src/core/runner.ts, runBench) populates exactly these per measured iteration:
 *   • ctx.ops = 1                         → opsPerSec        (every op execution = 1 op)
 *   • ctx.packets = demux.packets.length  → packetsPerSec    (demux op)
 *   • ctx.seeks = 1                       → seekMs           (seek op; seekMs = wall/seeks)
 *   • ctx.decodedFrames / ctx.frames      → decodeFps / framesPerSec (decodeFrames op, real FrameSink)
 *   • estimated frames (golden fps×dur)   → encodeFps / framesPerSec (transcode/remux/trim, encoded bytes)
 *   • ctx.bytesOut                        → bytesOut
 *   • ctx.mediaSec (golden duration)      → throughputRealtime
 *   • Meter, every sample                 → peakMemory (peakMemoryBytes), and longtasks when the metric is 'longtasks'
 *
 * The runner NEVER sets loadInitMs, firstFrameMs, firstByteMs, sourceReads, nor injects bundleSizeKb.
 * So `loadInit`, `timeToFirstFrame`, `timeToFirstByte`, `sourceReads`, and per-feature `bundleSize`
 * have NO producer reachable from a scenario, and wiring one lives in runner/app/engine — OUTSIDE this
 * writer's scope. Declaring a headline case whose primaryMetric can never receive a sample would put a
 * permanently-blank leaderboard cell in the report (report.ts ranks by `bench[metric].median`; with no
 * finite sample the winner is an EM_DASH forever). That is the exact "looks measured, isn't" silent
 * hole the spec calls WORSE than an honest omission. THEREFORE this family does NOT add standalone
 * scenarios for loadInit / TTFF / TTFB / sourceReads / per-feature-bundle: each is documented here as a
 * known gap with the one missing wiring, instead of shipped as a dead case. (The existing
 * performance/bundle-size case is likewise NA until the runner gains the documented bundleSizeKb
 * injection; see index.ts. We do not multiply that hole.)
 *
 * What IS added (all ranked by a metric the runner produces, all correctness-gated):
 *   • op-sweep.ts          — §8.2 per-op timed throughput, each with a real primaryMetric
 *   • decode-encode-seek.ts— §A.14 decodeFps↑ / encodeFps↑ / seekMs↓ headline-adjacent cases
 *   • size-ladder.ts       — §5.3 size axis (tiny→…→massive): throughputRealtime / packetsPerSec / peakMemory
 *   • resource.ts          — §A.14 peakMemory↓ and longtasks↓ ranked on the heavy convert workload
 *   • metamorphic.ts       — §A.16 transcode-idempotent / probe-duration / decode(remux(x)) / VFR real-fps
 * ──────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * GOLDEN-GATING / BAKE NOTE (mirrors remux/size-ladder.ts, the sanctioned precedent): several cases
 * reference the large/huge/massive rungs (large_h264_1080p_120s.mp4, huge_h264_1080p_600s.mov,
 * big_buck_bunny_1080p_h264.mov, massive_h264_1080p_2h.mp4). The manifest DEFINES these ids but their
 * golden is NOT yet baked (verified: only h264_1080p_30s.mp4 + tiny_h264_360p_2s.mp4 etc. have meta/
 * packets golden; all frame goldens are `pending:true` placeholders the in-browser frame-bake has not
 * filled). loadGolden() drops absent/pending golden, so those cases resolve to a CLEAN golden-absent
 * FAIL / NA — never a fabricated number — and light up the moment the bake produces asset+golden. They
 * are wired now so the leaderboard cell and golden filenames line up. Cases on already-baked assets
 * (meta+packets present today: h264_1080p_30s.mp4, tiny_h264_360p_2s.mp4, h264_vfr.mp4, …) rank for
 * real immediately. Frame-gated cases (decodeFps via decoded-frames-bitexact, ssim-psnr golden path,
 * decode-remux) gate hard once the frame-bake fills frames[].sha256; until then they FAIL/NA honestly
 * with "golden frames pending" rather than silently running a weaker oracle.
 */

import type { TranscodeOptions } from '../../core/engine.ts';
import type { MetricId, OracleId, OracleTolerances, Requires, Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';

// ── Big-read + size-ladder asset ids (canonical; must match manifest + golden filenames) ──────────

/**
 * The largest 1080p H.264/AAC asset with FULL golden TODAY (meta+packets baked). The four original
 * headlines and the decode/encode/seek/metamorphic cases run against this so throughput is dominated
 * by real work, not per-call overhead, while remaining correctness-gated right now. 31 MB / 30 s,
 * faststart moov (cheap front-of-file probe), CRF20 closed GOP -g 60 — see manifest genMethod.
 */
export const BIG_READ_GOLDEN = 'h264_1080p_30s.mp4';

/** Size-ladder rungs (§5.3). Golden presence noted; the un-baked rungs degrade to NA/golden-absent. */
export const LADDER = {
  micro: 'micro_h264_1frame.mp4', //   golden: meta+packets (1-frame edge)
  tiny: 'tiny_h264_360p_2s.mp4', //    golden: meta+packets (smallest valid media)
  medium: 'h264_1080p_30s.mp4', //     golden: meta+packets (== BIG_READ_GOLDEN)
  large4k: 'h264_4k_10s.mp4', //       golden: meta+packets (4K, large bucket, baked)
  large: 'large_h264_1080p_120s.mp4', // manifest-defined, golden NOT yet baked → NA until bake
  huge: 'huge_h264_1080p_600s.mov', //  manifest-defined, golden NOT yet baked → NA until bake
  bbb: 'big_buck_bunny_1080p_h264.mov', // provided asset, golden NOT yet baked → NA until bake
  massive: 'massive_h264_1080p_2h.mp4', // ~216k frames, golden NOT yet baked → NA until bake
} as const;

/** VFR asset (§A.16 real-vs-nominal fps). Golden meta+packets baked today. */
export const VFR_ASSET = 'h264_vfr.mp4';

// ── Timeouts (bound pathological lazy-read / OOM hangs so they surface as a timeout FAIL) ──────────

export const T_FAST = 30_000; // tiny/medium ops
export const T_LARGE = 120_000; // large rung (~100 MB)
export const T_HUGE = 300_000; // huge/massive rung (~500 MB–multi-GB); a hang here is the point of the case

// ── Common requires fragments ─────────────────────────────────────────────────────────────────────

/** H.264/AAC MP4 input for a given op (probe/demux/decodeFrames/seek). */
export function mp4H264In(op: Requires['operations'][number]): Requires {
  return { operations: [op], containersIn: ['mp4'], videoCodecs: ['h264'], audioCodecs: ['aac'] };
}

/** The convert/resize target used by the headline + ladder convert cases: H.264/AAC MP4 → VP9/Opus WebM @180p. */
export const CONVERT_320x180: TranscodeOptions = {
  container: 'webm',
  video: { codec: 'vp9', width: 320, height: 180 },
  audio: { codec: 'opus' },
};

/** Convert requires for MP4(H.264/AAC) → WebM(VP9/Opus) with resize. */
export const CONVERT_REQUIRES: Requires = {
  operations: ['transcode'],
  containersIn: ['mp4'],
  containersOut: ['webm'],
  videoCodecs: ['h264', 'vp9'],
  audioCodecs: ['aac', 'opus'],
  features: ['resize'],
};

/** Heavy 1080p→180p cross-codec downscale: loosened SSIM/PSNR floors (same rationale as the headline). */
export const CONVERT_TOLERANCES: OracleTolerances = { ssimMin: 0.97, psnrMinDb: 36 };

// ── Builder ───────────────────────────────────────────────────────────────────────────────────────

export interface PerfCaseSpec {
  id: string;
  op: Scenario['op'];
  input: string | string[];
  requires: Requires;
  oracles: OracleId[];
  /** metrics list; `primary` is prepended if absent and is set as the case's primaryMetric. */
  metrics: MetricId[];
  primary: MetricId;
  options?: TranscodeOptions | Record<string, unknown>;
  tolerances?: OracleTolerances;
  timeoutMs?: number;
  notes: string;
}

/** Build a performance Scenario with a guaranteed-present primaryMetric. */
export function perfCase(s: PerfCaseSpec): Scenario {
  const metrics = s.metrics.includes(s.primary) ? s.metrics : [s.primary, ...s.metrics];
  return defineScenario({
    id: s.id,
    op: s.op,
    input: s.input,
    ...(s.options ? { options: s.options } : {}),
    requires: s.requires,
    oracles: s.oracles,
    metrics,
    primaryMetric: s.primary,
    ...(s.tolerances ? { tolerances: s.tolerances } : {}),
    ...(s.timeoutMs ? { timeoutMs: s.timeoutMs } : {}),
    notes: s.notes,
  });
}
