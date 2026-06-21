/**
 * src/core/scenario.ts — the engine-independent test/benchmark case model + defineScenario(),
 * plus the result/verdict types the runner and report share.
 *
 * A Scenario NEVER names a library. It declares (operation, input asset, options,
 * required-capabilities, oracles, metrics). The runner negotiates it against each engine × browser.
 *
 * TERMINOLOGY: a "Scenario" here IS the spec's "case" (test-instructions.md §6–§9). The codebase
 * uses `Scenario`/`scenarios/` as the authoritative internal term; "case" in the spec and report
 * prose refers to the same thing. We deliberately did NOT rename to `cases/` — it is pure churn.
 */

import type { BrowserName, EncryptionScheme, Operation, TranscodeOptions } from './engine.ts';

// ── Capability requirements a scenario declares (matched against an engine's CapabilitySet) ──

export interface Requires {
  operations: Operation[];
  containersIn?: string[];
  containersOut?: string[];
  videoCodecs?: string[];
  audioCodecs?: string[];
  encryption?: EncryptionScheme[];
  features?: string[];
}

// ── Oracle + metric vocabularies (see oracles.ts / measure.ts) ──

export type OracleId =
  | 'golden-metadata' // probe vs golden/<asset>.meta.json
  | 'golden-packets' // demux vs golden/<asset>.packets.json
  | 'decoded-frames-bitexact' // decode output in-browser vs golden frame digests
  | 'decoded-audio-pcm' // audio decode output vs browser-decoded PCM sample digests
  | 'reference-reimport' // re-import engine output with the reference engine; compare packet tables
  | 'playback-smoke' // <video> can play the output
  | 'ssim-psnr' // decode output → SSIM+PSNR vs reference frames (lossy ops)
  | 'mp4-box-layout' // MP4/MOV top-level box order/fragment structure for output-shape rows
  | 'webm-live-layout' // WebM/MKV live/append-only layout: unknown-size Segment, no SeekHead/Duration
  | 'fanout-renditions' // multi-rendition transcode output: count, dimensions, playback, and SSIM
  | 'alpha-plane' // alpha channel compared separately
  | 'seek-accuracy' // seek lands on expected keyframe / within tolerance
  | 'trim-boundaries' // out duration ≈ requested; boundary frames only with trim-range golden
  | 'decrypt-bitexact' // decoded frames bit-exact vs golden (offline reference decrypt)
  | 'graceful-failure' // malformed input → throw/reject within timeout, no crash/hang/OOM
  | 'property-invariant'; // metamorphic invariant computed in-browser (§11)

export type MetricId =
  | 'wall'
  | 'throughputRealtime'
  | 'peakMemory'
  | 'sourceReads'
  | 'targetWrites'
  | 'bytesOut'
  | 'longtasks'
  | 'decodeFps'
  | 'encodeFps'
  // ── headline benchmarks (§8.1 / §A.14), higher-is-better ──
  | 'opsPerSec' // extract-metadata: repeated probe → ops/s
  | 'packetsPerSec' // iterate-video-packets: demux → packets/s
  | 'framesPerSec' // convert/transcode throughput (distinct from decode/encode fps)
  // ── latency / cost metrics (§8.3 / §A.14), lower-is-better ──
  | 'seekMs' // ms per seek
  | 'timeToFirstByte' // ms to first output byte
  | 'timeToFirstFrame' // ms to first decoded/rendered frame
  | 'loadInit' // ms to init() (load+compile+warmup) — reported separately per §0.7, NEVER folded into op timing
  | 'bundleSize'; // kB min+gzip — the one build-time metric

export type ScenarioFamily =
  | 'probe'
  | 'demux'
  | 'remux'
  | 'transcode'
  | 'decode-seek'
  | 'trim'
  | 'mux'
  | 'encryption'
  | 'metadata'
  | 'streaming-output'
  | 'audio-dsp'
  | 'robustness'
  | 'performance'; // headline §8.1 cases (perf/extract-metadata, iterate-packets, convert+resize, bundle-size)

export const SCENARIO_FAMILY_ORDER: ScenarioFamily[] = [
  'probe',
  'demux',
  'remux',
  'transcode',
  'decode-seek',
  'trim',
  'mux',
  'encryption',
  'metadata',
  'streaming-output',
  'audio-dsp',
  'robustness',
  'performance',
];

export const SCENARIO_FAMILY_LABELS: Record<ScenarioFamily, string> = {
  probe: 'Probe',
  demux: 'Demux',
  remux: 'Remux',
  transcode: 'Transcode',
  'decode-seek': 'Decode + seek',
  trim: 'Trim',
  mux: 'Mux',
  encryption: 'Encryption',
  metadata: 'Metadata',
  'streaming-output': 'Streaming output',
  'audio-dsp': 'Audio DSP',
  robustness: 'Robustness',
  performance: 'Performance',
};

export interface ScenarioFeatureGroup {
  id: ScenarioFamily;
  label: string;
  scenarios: Scenario[];
}

export function scenarioAssetIds(scenario: Pick<ScenarioSpec, 'input'>): string[] {
  return Array.isArray(scenario.input) ? scenario.input : [scenario.input];
}

export function groupScenariosByFeature(scenarios: Scenario[]): ScenarioFeatureGroup[] {
  const byFamily = new Map<ScenarioFamily, Scenario[]>();
  for (const scenario of scenarios) {
    const items = byFamily.get(scenario.family);
    if (items) items.push(scenario);
    else byFamily.set(scenario.family, [scenario]);
  }
  return SCENARIO_FAMILY_ORDER.filter((family) => byFamily.has(family)).map((family) => ({
    id: family,
    label: SCENARIO_FAMILY_LABELS[family],
    scenarios: byFamily.get(family) ?? [],
  }));
}

/** Per-oracle tunables (e.g. SSIM/PSNR floors, duration tolerance) overriding defaults. */
export interface OracleTolerances {
  ssimMin?: number;
  psnrMinDb?: number;
  durationToleranceSec?: number;
  fpsTolerance?: number;
  seekToleranceUs?: number;
}

export interface ScenarioSpec {
  /** stable id, namespaced by family, e.g. 'remux/h264_mp4_to_mkv' */
  id: string;
  op: Operation;
  /** corpus asset id (manifest.json), or list for multi-input ops (mux) */
  input: string | string[];
  /** operation options forwarded to the engine method (container/transcode/trim/decrypt args) */
  options?: TranscodeOptions | { container?: string } | Record<string, unknown>;
  requires: Requires;
  oracles: OracleId[];
  metrics: MetricId[];
  /**
   * The metric the per-case WINNER is ranked by (§9). Defaults to metrics[0] when omitted. This is
   * the single number the leaderboard compares across engines for this case (e.g. 'opsPerSec' for
   * extract-metadata, 'packetsPerSec' for iterate-packets, 'bundleSize' for the bundle case).
   */
  primaryMetric?: MetricId;
  tolerances?: OracleTolerances;
  /** robustness: a transform that mutates the input bytes before feeding the engine */
  mutate?: (bytes: Uint8Array) => Uint8Array;
  /** hard wall-clock cap (ms) for the operation in a Worker; exceeding it ⇒ timeout result */
  timeoutMs?: number;
  notes?: string;
}

export interface Scenario extends ScenarioSpec {
  family: ScenarioFamily;
}

/** Derive family from the id's namespace prefix (e.g. 'remux/...' → 'remux'). */
function familyFromId(id: string): ScenarioFamily {
  const prefix = id.split('/')[0] as ScenarioFamily;
  return prefix;
}

/**
 * Define an engine-independent scenario. Lightly validated so a malformed scenario fails loudly at
 * registration rather than producing a bogus matrix cell.
 */
export function defineScenario(spec: ScenarioSpec): Scenario {
  if (!spec.id || !spec.id.includes('/')) {
    throw new Error(`Scenario id must be 'family/name', got: ${JSON.stringify(spec.id)}`);
  }
  if (!spec.requires?.operations?.length) {
    throw new Error(`Scenario ${spec.id} must declare requires.operations`);
  }
  if (!spec.oracles?.length) {
    throw new Error(`Scenario ${spec.id} must declare at least one oracle`);
  }
  return { ...spec, family: familyFromId(spec.id) };
}

// ── Result types (produced by runner.ts, consumed by report.ts) ──

/**
 * NA is split: NA_ENGINE (engine did not declare the capability), NA_BROWSER (browser lacks the
 * WebCodecs codec / API), and NA_ASSET (the corpus asset is intentionally absent/unbaked).
 * These must never be collapsed in machine-readable results (anti-pattern §15).
 */
export type ResultStatus = 'PASS' | 'FAIL' | 'NA_ENGINE' | 'NA_BROWSER' | 'NA_ASSET' | 'ERROR' | 'SKIPPED';

export interface OracleOutcome {
  oracle: OracleId;
  pass: boolean;
  /** human-readable detail; for FAIL, WHY (mismatch summary, measured vs expected) */
  detail?: string;
  /** structured measurements an oracle produced (e.g. { ssim: 0.994, psnrDb: 42.1 }) */
  measurements?: Record<string, number>;
}

/** A single timing/resource sample from one measured iteration (see measure.ts). */
export interface MetricSample {
  wallMs?: number;
  throughputRealtime?: number;
  peakMemoryBytes?: number | null;
  sourceReads?: number;
  targetWrites?: number;
  bytesOut?: number;
  longtaskMs?: number;
  decodeFps?: number;
  encodeFps?: number;
  // headline (higher-is-better)
  opsPerSec?: number;
  packetsPerSec?: number;
  framesPerSec?: number;
  // latency / cost (lower-is-better)
  seekMs?: number;
  timeToFirstByteMs?: number;
  timeToFirstFrameMs?: number;
  loadInitMs?: number; // set by the runner OUTSIDE the timed op window (§0.7), not by the Meter
  bundleSizeKb?: number; // set from the offline per-engine build, not measured at run time
}

/** Aggregated bench statistics over the measured iterations (see bench.ts). */
export interface BenchSummary {
  n: number;
  warmup: number;
  metric: MetricId;
  median: number;
  p95: number;
  mad: number;
  unit: string;
  samples: number[];
}

export interface ScenarioResult {
  engineId: string;
  browser: BrowserName;
  scenarioId: string;
  family: ScenarioFamily;
  status: ResultStatus;
  /** for NA / FAIL / ERROR: the reason (which capability/codec, which oracle, the error) */
  reason?: string;
  oracleOutcomes: OracleOutcome[];
  /** per-metric aggregated stats; present only when status === 'PASS' (correctness gates benches) */
  bench?: Partial<Record<MetricId, BenchSummary>>;
  /**
   * The scenario's primary ranking metric (§9), copied by the runner from ScenarioSpec.primaryMetric
   * so report.ts can rank winners without re-reading the scenario registry. Optional: report.ts falls
   * back to inferring it from the bench keys when absent.
   */
  primaryMetric?: MetricId;
  /** environment captured at run time (browser build, GPU string, suite/engine versions) */
  env?: RunEnv;
  startedAtIso?: string;
  durationMs?: number;
}

export interface RunEnv {
  suiteVersion: string;
  engineId: string;
  browser: BrowserName;
  browserVersion?: string;
  userAgent?: string;
  gpu?: string;
  corpusChecksum?: string;
  acPower?: boolean;
  /** §8.5: the engine's best-path config (engine.configUsed), recorded so a number is reproducible. */
  configUsed?: object;
}
