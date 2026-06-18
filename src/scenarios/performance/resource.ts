/**
 * src/scenarios/performance/resource.ts — the §A.14 resource-cost cases ranked as their OWN metric:
 * peak-memory↓ and main-thread-longtask↓ on the heavy 1080p→180p convert workload. Both are collected
 * as secondary bench metrics elsewhere but no performance scenario sets them as primaryMetric, so there
 * was no per-case memory/blocking WINNER. These add one.
 *
 *   • convert-peak-memory (§A.14 'peak memory bytes ↓', §8.3 measureUserAgentSpecificMemory): the
 *     heavy convert ranked by peakMemory. peakMemory materializes only under cross-origin-isolated
 *     Chromium (the only cross-engine-correct memory API); elsewhere the sample is null → that cell is
 *     honestly NA, never zero.
 *
 *   • convert-longtasks (§A.14 'longtask ms ↓', §8.3 PerformanceObserver): the same heavy convert
 *     ranked by longtasks — exposes engines that BLOCK the main thread (no Worker offload) during a
 *     1080p→180p transcode (the §8.5 "streaming/pipelined, Worker offload" fast-path claim, otherwise
 *     unmeasured). The Meter attaches PerformanceObserver('longtask') only for the longtasks metric
 *     pass (Chromium-only); on engines/browsers without it the sample is 0/absent → honest NA.
 *
 * Both keep ssim-psnr + playback-smoke so a fast/cheap-but-WRONG convert FAILs and cannot win the
 * memory or responsiveness crown (correctness gates the bench, §0.1). Input is the big-read golden
 * asset; tolerances match the headline convert (heavy downscale → loosened SSIM/PSNR floors).
 *
 * NOTE on metrics that are NOT given a resource case here: sourceReads↓ (§A.14 'count ↓ = lazier'),
 * timeToFirstByte/Frame↓, and loadInit (cold/warm) are real §A.14 dimensions, but the runner produces
 * NO sample for any of them (it never wraps the source in CountingSource, never records first-byte/
 * first-frame markers, and never times init() into loadInitMs), and the wiring lives in
 * runner/app/engine — outside this writer's scope. Shipping a scenario whose primaryMetric can never
 * receive a sample would be a permanently-blank leaderboard cell masquerading as a measured dimension
 * (the silent-hole anti-pattern the spec calls worse than an honest omission). They are therefore
 * documented as known gaps in _shared.ts rather than shipped as dead cases.
 */

import {
  BIG_READ_GOLDEN,
  CONVERT_320x180,
  CONVERT_REQUIRES,
  CONVERT_TOLERANCES,
  perfCase,
  T_FAST,
} from './_shared.ts';
import type { Scenario } from '../../core/scenario.ts';

const convertPeakMemory: Scenario = perfCase({
  id: 'performance/convert-peak-memory',
  op: 'transcode',
  input: BIG_READ_GOLDEN,
  options: CONVERT_320x180,
  requires: CONVERT_REQUIRES,
  oracles: ['ssim-psnr', 'playback-smoke'],
  metrics: ['peakMemory', 'framesPerSec', 'wall'],
  primary: 'peakMemory',
  tolerances: CONVERT_TOLERANCES,
  timeoutMs: T_FAST,
  notes:
    `§A.14 peak-memory↓: convert ${BIG_READ_GOLDEN} → WebM/VP9/Opus @320×180 ranked by peakMemory ` +
    `(lower-better). peakMemory present only on cross-origin-isolated Chromium; NA elsewhere. Gated by ` +
    `ssim-psnr + playback-smoke so a cheap-but-wrong convert can't win.`,
});

const convertLongtasks: Scenario = perfCase({
  id: 'performance/convert-longtasks',
  op: 'transcode',
  input: BIG_READ_GOLDEN,
  options: CONVERT_320x180,
  requires: CONVERT_REQUIRES,
  oracles: ['ssim-psnr', 'playback-smoke'],
  metrics: ['longtasks', 'framesPerSec', 'wall'],
  primary: 'longtasks',
  tolerances: CONVERT_TOLERANCES,
  timeoutMs: T_FAST,
  notes:
    `§A.14 longtask-ms↓ (§8.5 Worker-offload claim): convert ${BIG_READ_GOLDEN} → WebM/VP9/Opus @320×180 ` +
    `ranked by main-thread longtask ms (lower-better; PerformanceObserver, Chromium-only → NA elsewhere). ` +
    `Exposes engines that block the main thread. Gated by ssim-psnr + playback-smoke.`,
});

export const resourceScenarios: Scenario[] = [convertPeakMemory, convertLongtasks];
