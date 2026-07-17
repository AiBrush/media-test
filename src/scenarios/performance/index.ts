/**
 * src/scenarios/performance/index.ts — the headline performance battery (§8.1 / §A.14) + the extended
 * per-op sweep (§8.2), size axis (§5.3), decode/encode/seek + resource metrics (§A.14), and metamorphic
 * deep-edge (§A.16). Aggregates every performance topic file into the single `performanceScenarios`
 * array that src/scenarios/index.ts imports (the only seam this writer may feed without editing
 * src/scenarios/index.ts).
 *
 * These are the Mediabunny-parity headline cases, run for EVERY framework. Each declares a single
 * `primaryMetric` (the one number the per-case leaderboard ranks engines by, §9). Correctness still
 * gates the bench: every perf case carries a real oracle, so a fast-but-wrong engine FAILs and is
 * never crowned the winner.
 *
 *   - performance/extract-metadata              (repeated probe of the big file)  → 'opsPerSec'
 *   - performance/iterate-video-packets         (demux, count all video packets)  → 'packetsPerSec'
 *   - performance/convert-webm-resize-320x180   (transcode → WebM, resize)        → 'framesPerSec'
 *   - performance/bundle-size                   (offline per-engine min+gzip)      → 'bundleSize'
 *
 * EXTENDED cases (added in the sibling files, all exported through this array):
 *   - op-sweep.ts          §8.2 per-op TIMED throughput, ranked: probe→opsPerSec, demux→packetsPerSec,
 *                          remux→throughputRealtime, transcode→encodeFps.
 *   - decode-encode-seek.ts §A.14 decodeFps↑ / encodeFps↑ / seekMs↓ headline-adjacent cases.
 *   - size-ladder.ts       §5.3 size axis tiny→…→massive (ops/packets/peakMemory) + OOM-resistance.
 *   - resource.ts          §A.14 peakMemory↓ and longtasks↓ ranked on the heavy convert workload.
 *   - metamorphic.ts       §A.16 transcode-idempotent / probe-duration / decode(remux(x)) / VFR.
 *
 * Honest measurement hooks live in src/features/performance: event latency accepts only adapter events,
 * source-read counts require a counting random-access source at the adapter boundary, and complete
 * bundle components are joined before report construction. Missing evidence stays typed unavailable.
 *
 * BIG-READ ASSET (§8.1): the throughput cases run against the largest 1080p H.264 file with FULL golden
 * so throughput is dominated by real work, not per-call overhead — exactly the "big read" Mediabunny
 * benchmarks against. The corpus's largest fully-golden 1080p H.264 asset is `h264_1080p_30s.mp4`
 * (~31 MB, 30 s). A dedicated, much larger big-read asset (`BIG_READ_ASSET` below) is the INTENDED
 * headline input; the size-ladder additionally covers committed large/huge/massive identities and lets
 * the manifest plus typed golden reader decide runtime availability.
 */

import type { TranscodeOptions } from '../../core/engine.ts';
import type { MetricId, Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';
import {
  aggregatePerformanceQuestionIds,
  validatePerformanceQuestionCatalog,
} from '../../features/performance/catalog.ts';
import { opSweepScenarios } from './op-sweep.ts';
import { decodeEncodeSeekScenarios } from './decode-encode-seek.ts';
import { sizeLadderScenarios } from './size-ladder.ts';
import { resourceScenarios } from './resource.ts';
import { metamorphicScenarios } from './metamorphic.ts';

// The stable headline input is a content-addressed 31 MB / 30 s 1080p H.264/AAC fixture.
const BIG_READ_ASSET = 'h264_1080p_30s.mp4';

/** Fallback the bake may substitute if it chooses not to add a dedicated big-read fixture. */
const BIG_READ_FALLBACK = 'h264_1080p_30s.mp4';

// ── 1) extract-metadata — repeated probe → ops/sec ───────────────────────────────────────────────

/**
 * Probe the big file as many times as fit in the bench window; the score is probes/second. Each
 * probe must still produce correct normalized metadata, validated by `golden-metadata` against
 * golden/<asset>.meta.json — a wrong-but-fast probe FAILs and cannot win. `opsPerSec` is the primary
 * metric; `wall` is kept for context.
 */
const extractMetadata: Scenario = defineScenario({
  id: 'performance/extract-metadata',
  op: 'probe',
  input: BIG_READ_ASSET,
  requires: {
    operations: ['probe'],
    containersIn: ['mp4'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
  },
  oracles: ['golden-metadata'],
  metrics: ['opsPerSec', 'wall'],
  primaryMetric: 'opsPerSec',
  notes:
    `Headline §8.1: repeated metadata extraction on the big-read 1080p H.264 file (${BIG_READ_ASSET}; ` +
    `bake fallback ${BIG_READ_FALLBACK}). Score = probes/sec; correctness gated by golden-metadata.`,
});

// ── 2) iterate-video-packets — demux, count all video packets → packets/sec ──────────────────────

/**
 * Demux the big file and walk every video packet; the score is packets/second of the whole iterate.
 * `golden-packets` validates the packet table (per-track index, pts/dts µs, keyframe flags, sizes)
 * against golden/<asset>.packets.json so a skip-ahead/short-read demux FAILs rather than winning.
 */
const iterateVideoPackets: Scenario = defineScenario({
  id: 'performance/iterate-video-packets',
  op: 'demux',
  input: BIG_READ_ASSET,
  requires: {
    operations: ['demux'],
    containersIn: ['mp4'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
  },
  oracles: ['golden-packets'],
  metrics: ['packetsPerSec', 'wall'],
  primaryMetric: 'packetsPerSec',
  notes:
    `Headline §8.1: iterate every video packet of the big-read file (${BIG_READ_ASSET}; bake ` +
    `fallback ${BIG_READ_FALLBACK}). Score = packets/sec; correctness gated by golden-packets.`,
});

// ── 3) convert-webm-resize-320x180 — transcode → WebM @ 320×180 → frames/sec ─────────────────────

/**
 * Transcode the big H.264/AAC MP4 to WebM (VP9 video + Opus audio) while resizing to 320×180 — the
 * Mediabunny "convert + resize" headline. The score is encoded frames/second. Because it is a lossy
 * re-encode, correctness is perceptual: `ssim-psnr` against the reference 320×180 frames (floors set
 * here; the resize is aggressive so floors are loosened vs the default transcode floors).
 */
const CONVERT_OPTS: TranscodeOptions = {
  container: 'webm',
  video: { codec: 'vp9', width: 320, height: 180 },
  audio: { codec: 'opus' },
};

const convertWebmResize: Scenario = defineScenario({
  id: 'performance/convert-webm-resize-320x180',
  op: 'transcode',
  input: BIG_READ_ASSET,
  options: CONVERT_OPTS,
  requires: {
    operations: ['transcode'],
    containersIn: ['mp4'],
    containersOut: ['webm'],
    videoCodecs: ['h264', 'vp9'],
    audioCodecs: ['aac', 'opus'],
    features: ['resize'],
  },
  oracles: ['ssim-psnr'],
  metrics: ['framesPerSec', 'wall', 'encodeFps'],
  primaryMetric: 'framesPerSec',
  // Heavy downscale (1080p → 180p) to a different codec: relax the SSIM/PSNR floors accordingly.
  tolerances: { ssimMin: 0.97, psnrMinDb: 36 },
  notes:
    `Headline §8.1: convert ${BIG_READ_ASSET} (bake fallback ${BIG_READ_FALLBACK}) → WebM/VP9/Opus, ` +
    `resize 320×180. Score = actual output presentation units/sec from the adapter final counter or ` +
    `neutral output reader; unavailable counts emit no rate. Correctness gated by ssim-psnr at 320×180.`,
});

// ── 4) bundle-size — offline per-engine min+gzip build → kB ──────────────────────────────────────

/**
 * The single build-time metric (§8.1 / §A.14). It is NOT measured at run time and has no media work,
 * but every per-case cell in the matrix is a (scenario × engine × browser), and the report ranks
 * winners per scenario by `primaryMetric`. So bundle-size is modeled as a normal Scenario whose
 * primaryMetric is 'bundleSize' (kB, lower-is-better) — keeping it in the same table/leaderboard
 * machinery as every other headline case instead of a bolted-on special path.
 *
 * HOW THE NUMBER IS FED:
 *  - A versioned offline artifact records exact engine/source/toolchain provenance and separate
 *    minified+gzipped JavaScript, runtime WASM, worker, and codec/core transfer components.
 *  - The same validated artifact is joined before live or offline report construction. The score is
 *    the component sum in bytes; a missing/stale/failed map is typed NA_ASSET, never numeric zero.
 *  - Because there is nothing to read from media, the input is the smallest fully-golden VALID MEDIA
 *    asset (tiny_h264_360p_2s.mp4 — NOT an image, which probe correctly rejects) and the op is the
 *    cheapest universally-supported op (probe). The op is never actually timed for the score; the
 *    score comes entirely from the injected bundleSizeKb. The oracle is `golden-metadata` (the
 *    correct oracle for a PROBE op): it validates ctx.metadata produced by the probe against
 *    golden/tiny_h264_360p_2s.mp4.meta.json, so a real-but-wrong probe FAILs and the nominal op
 *    only PASSes when the engine actually probed the file correctly. (The previous oracle was
 *    `property-invariant`, which is WRONG for a probe: for op:'probe' it infers the 'probe-duration'
 *    invariant whose first guard is `if (!ctx.output) return fail(... no ctx.output to probe)` — a
 *    probe NEVER sets ctx.output (it sets ctx.metadata), so that oracle FAILed on every engine with
 *    "[probe-duration] no ctx.output to probe". golden-metadata reads ctx.metadata and PASSes.)
 *
 * `bundle-components.ts` owns the complete component and early-join contract; REP-17 owns the shared
 * provenance artifact and report ingestion seam.
 */
const BUNDLE_PRIMARY: MetricId = 'bundleSize';

const bundleSize: Scenario = defineScenario({
  id: 'performance/bundle-size',
  op: 'probe',
  // The op result is irrelevant to the score (which comes entirely from the injected bundleSizeKb),
  // but the nominal op must still SUCCEED on every engine — so the input must be a tiny VALID MEDIA
  // asset, not an image. image.jpg/image.png are the image-negative corpus (probe correctly FAILs
  // them: "Image files are not supported" / "unrecognizable format"), which previously errored this
  // headline case on every engine. tiny_h264_360p_2s.mp4 is the smallest fully-golden valid media
  // file (~100 KB H.264/AAC MP4, golden meta+packets+frames present) so probe passes everywhere.
  input: 'tiny_h264_360p_2s.mp4',
  requires: {
    // probe is the cheapest universally-declared op; this case never depends on the probe output.
    operations: ['probe'],
  },
  // CORRECT oracle for a PROBE op: golden-metadata validates ctx.metadata (set by probe) against
  // golden/tiny_h264_360p_2s.mp4.meta.json. A probe op never sets ctx.output, so the previous
  // 'property-invariant' oracle (which, for op:'probe', infers 'probe-duration' and immediately bails
  // with "[probe-duration] no ctx.output to probe") FAILed on EVERY engine. golden-metadata reads the
  // probe's metadata and PASSes the nominal op iff the engine actually probed the file correctly.
  oracles: ['golden-metadata'],
  metrics: [BUNDLE_PRIMARY],
  primaryMetric: BUNDLE_PRIMARY,
  notes:
    'Headline build-time metric: complete transfer bytes, lower-is-better, with separate minified+gzip ' +
    'JavaScript, runtime WASM, worker, and codec/core components. Versioned evidence is joined before ' +
    'both live and offline reports; missing or stale evidence is NA_ASSET. Nominal probe correctness is ' +
    'gated by golden-metadata.',
});

// ── battery ──────────────────────────────────────────────────────────────────────────────────────

export const performanceScenarios: Scenario[] = [
  // Original Mediabunny-parity headlines (§8.1).
  extractMetadata,
  iterateVideoPackets,
  convertWebmResize,
  bundleSize,
  // Extended battery (§8.2 sweep, §A.14 fps/seek/resource, §5.3 size axis, §A.16 metamorphic).
  ...opSweepScenarios,
  ...decodeEncodeSeekScenarios,
  ...sizeLadderScenarios,
  ...resourceScenarios,
  ...metamorphicScenarios,
];

const questionDiagnostics = validatePerformanceQuestionCatalog(performanceScenarios.map((scenario) => scenario.id));
if (questionDiagnostics.length > 0) {
  throw new Error(`invalid performance question catalog: ${questionDiagnostics.join('; ')}`);
}

/** Alias rows remain visible but are excluded from aggregate win weighting. */
export const performanceAggregateScenarioIds = Object.freeze(
  aggregatePerformanceQuestionIds(performanceScenarios.map((scenario) => scenario.id)),
);

export default performanceScenarios;
