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
 * HONESTY BOUNDARY — §A.14 metrics deliberately NOT given a standalone case (see _shared.ts header for
 * the full mechanism): loadInit (cold+warm, §8.4/§0.7), timeToFirstFrame/timeToFirstByte (§A.14 'ms↓'),
 * sourceReads (§A.14 'count↓ = lazier'), and per-FEATURE bundle-size (§8.1 asks per-feature + total).
 * The runner produces NO sample for any of these (it never times init() into loadInitMs, never records
 * first-byte/first-frame markers, never wraps the source in CountingSource, and the bundleSizeKb
 * injection does not exist), and adding that wiring lives in runner/app/engine — OUTSIDE this writer's
 * scope. A scenario whose primaryMetric can never receive a sample is a permanently-blank leaderboard
 * cell that READS as measured (the silent-hole anti-pattern the spec calls worse than an honest
 * omission). So these are documented as known gaps + the exact one-line wiring each needs, rather than
 * shipped as dead cases that fabricate the appearance of coverage. The existing bundle-size case below
 * is itself NA until that injection lands (see its comment); we do not multiply that hole.
 *
 * BIG-READ ASSET (§8.1): the throughput cases run against the largest 1080p H.264 file with FULL golden
 * so throughput is dominated by real work, not per-call overhead — exactly the "big read" Mediabunny
 * benchmarks against. The corpus's largest fully-golden 1080p H.264 asset is `h264_1080p_30s.mp4`
 * (~31 MB, 30 s). A dedicated, much larger big-read asset (`BIG_READ_ASSET` below) is the INTENDED
 * headline input; the size-ladder file additionally wires the manifest's large/huge/massive rungs by
 * their canonical ids so the runner + golden filenames line up the moment the bake produces them (until
 * then those rungs resolve to a clean golden-absent FAIL / NA — never a fabricated number). See BAKE NOTE.
 */

import type { TranscodeOptions } from '../../core/engine.ts';
import type { MetricId, Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';
import { opSweepScenarios } from './op-sweep.ts';
import { decodeEncodeSeekScenarios } from './decode-encode-seek.ts';
import { sizeLadderScenarios } from './size-ladder.ts';
import { resourceScenarios } from './resource.ts';
import { metamorphicScenarios } from './metamorphic.ts';

/**
 * BAKE NOTE — big-read asset.
 *
 * The headline throughput battery wants a *large* 1080p H.264/AAC progressive MP4 (faststart moov so
 * probe is a cheap front-of-file read; long enough that demux/transcode throughput is steady-state).
 * The intended asset id is below. It is NOT yet present in fixtures/manifest.json; the bake should
 * add it (e.g. ffmpeg testsrc2 1920x1080@30 ~120 s, libx264 yuv420p CRF20 -g 60 closed GOP, AAC
 * 128k, +faststart, -fflags +bitexact — same recipe as h264_1080p_30s.mp4, just longer) and emit the
 * matching golden (golden/<id>.meta.json + golden/<id>.packets.json). If the bake declines to add a
 * new asset, point BIG_READ_ASSET at 'h264_1080p_30s.mp4' (the current largest 1080p H.264 file) and
 * the battery runs unchanged against existing golden.
 */
// Resolves to a real, golden-backed corpus asset so the headline cases run today. The dedicated
// dossier-intended big-read fixture id ('h264_1080p_bigread.mp4') is NOT produced by the bake, and
// the larger synthetic rung ('large_h264_1080p_120s.mp4') is gated behind a non-skip-longform bake.
// For closer Mediabunny parity, drop in the provided BBB asset (see fixtures MISSING ASSETS) and
// repoint this const. h264_1080p_30s.mp4 is a 31 MB / 30 s 1080p H.264/AAC file with full golden.
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
    `resize 320×180. Score = encoded frames/sec; correctness gated by ssim-psnr at 320×180.`,
});

// ── 4) bundle-size — offline per-engine min+gzip build → kB ──────────────────────────────────────

/**
 * The single build-time metric (§8.1 / §A.14). It is NOT measured at run time and has no media work,
 * but every per-case cell in the matrix is a (scenario × engine × browser), and the report ranks
 * winners per scenario by `primaryMetric`. So bundle-size is modeled as a normal Scenario whose
 * primaryMetric is 'bundleSize' (kB, lower-is-better) — keeping it in the same table/leaderboard
 * machinery as every other headline case instead of a bolted-on special path.
 *
 * HOW THE NUMBER IS FED (least-hacky path consistent with scenario.ts):
 *  - An OFFLINE, per-engine build step (a small bundler entry per adapter, tree-shaken + minified +
 *    gzipped) computes each engine's shipped byte cost and writes it out (a sizes JSON keyed by
 *    engineId). This is exactly the offline build the spec calls for; no run-time bundling happens.
 *  - The suite/runner READS those offline sizes and populates `MetricSample.bundleSizeKb` for this
 *    scenario's (engine) cell — the field scenario.ts already reserves for "set from the offline
 *    per-engine build, not measured at run time". The runner then surfaces it as the
 *    `bundleSize` BenchSummary so the report ranks engines by it like any other primaryMetric.
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
 * WHERE THE OFFLINE SIZES COME FROM: scripts/measure-bundles.mjs (bun-only) bundles+minifies+gzips
 * each engine entrypoint OFFLINE and writes results/bundle-sizes.json as { engineId: kBytes } (plus a
 * bare-alias key per engine, e.g. "mediabunny"). See the header of scripts/measure-bundles.mjs for
 * the exact contract.
 *
 * EXACT RUN-TIME WIRING (how results/bundle-sizes.json becomes MetricSample.bundleSizeKb):
 *   1. (APP, page boot) The page fetches results/bundle-sizes.json once at boot and stashes the map on
 *      a global the runner can read without importing Node:  window.__BUNDLE_SIZES__ : Record<id,kB>.
 *      It is a static asset served alongside fixtures/, so a plain `fetch('results/bundle-sizes.json')`
 *      works in the browser (no CDN, no run-time bundling — the numbers were produced OFFLINE).
 *   2. (RUNNER, runBench sample closure) For THIS scenario (id === 'performance/bundle-size') and the
 *      'bundleSize' metric, instead of (or in addition to) the Meter sample, the runner looks the
 *      engine up in window.__BUNDLE_SIZES__ — keyed by engine.id, falling back to the bare registry id
 *      — and sets sample.bundleSizeKb to that value. A present finite number flows through
 *      bench()→BenchSummary.bundleSize.median→report engineBundleSizeKb(); a MISSING/zero entry yields
 *      NaN→n=0→no number, surfaced as an honest FAIL/NA for that cell — never a fabricated value.
 *   This scenario owns the SEMANTICS (op/input/oracle/metric/primaryMetric) and the offline producer;
 *   the two-line read+inject (steps 1–2) lives in app/main.ts + core/runner.ts, which this file may not
 *   edit — see the precise TODO in scripts/measure-bundles.mjs's header and below.
 *
 * If the report adds a dedicated build-only lane later, this scenario is the seam to retarget; today
 * it rides the standard scenario pipeline with zero special-casing in scenario.ts.
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
    'Headline §8.1 build-time metric: per-engine shipped JS cost (kB, min+gzip), lower-is-better. ' +
    'Nominal op is a probe gated by golden-metadata (correct oracle for a probe). An offline build ' +
    '(scripts/measure-bundles.mjs → results/bundle-sizes.json) writes each engineId→kB; the page ' +
    'loads it into window.__BUNDLE_SIZES__ and the runner injects MetricSample.bundleSizeKb for this ' +
    'cell, so the report ranks by primaryMetric=bundleSize. Not run-time measured.',
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

export default performanceScenarios;
