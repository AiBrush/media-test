# INTERNAL_API — binding cross-module signatures

> Authoritative contract for how `src/core/*` modules and adapters import each other. Parallel
> agents code against THIS so concurrent work does not drift. If you need to change a signature
> here, that is a coordination event — note it loudly. Types referenced come from `engine.ts` and
> `scenario.ts` (already committed). Use `.ts` extension on relative imports (bundler resolution,
> `verbatimModuleSyntax` on → use `import type` for type-only imports).

## feature-detect.ts
```ts
import type { BrowserName } from './engine.ts';

export interface EnvInfo { browser: BrowserName; version?: string; userAgent: string; gpu?: string }
export interface CodecSupport {
  webcodecs: boolean;
  videoDecode: Record<string, boolean>;   // canonical token (h264/hevc/vp8/vp9/av1) -> supported
  videoEncode: Record<string, boolean>;
  audioDecode: Record<string, boolean>;   // aac/opus/mp3/flac/vorbis/pcm-*
  audioEncode: Record<string, boolean>;
  alpha: boolean;
  webgpu: boolean;
  measureMemory: boolean;                  // performance.measureUserAgentSpecificMemory available
}
export function detectEnv(): Promise<EnvInfo>;          // UA-based browser guess + GPU via WebGL UNMASKED_RENDERER
export function detectCodecSupport(): Promise<CodecSupport>;   // uses *Decoder/*Encoder.isConfigSupported
/** Map a canonical codec token + dims to a WebCodecs codec string (e.g. 'h264'->'avc1.640028'). null if unknown. */
export function webcodecsVideoString(codec: string, opts?: { width?: number; height?: number }): string | null;
export function webcodecsAudioString(codec: string): string | null;
```

## measure.ts
```ts
import type { MetricSample } from './scenario.ts';

export interface MeasureContext {
  mediaSec?: number;        // source media duration -> throughputRealtime = mediaSec / (wallMs/1000)
  bytesOut?: number;
  sourceReads?: number;     // from CountingSource
  targetWrites?: number;    // from CountingTarget
  decodedFrames?: number;
  encodedFrames?: number;
}

/** One measured op. Captures wall (performance.now), longtasks (PerformanceObserver), peak mem. */
export class Meter {
  constructor(opts?: { observeLongtasks?: boolean });
  begin(): void;
  end(ctx?: MeasureContext): Promise<MetricSample>;   // computes throughputRealtime, decode/encodeFps, etc.
}

export function peakMemoryBytes(): Promise<number | null>;   // measureUserAgentSpecificMemory | performance.memory | null

/** Wrappers that count I/O against an in-page byte source/target (for sourceReads/targetWrites/bytesOut). */
export class CountingSource {
  constructor(bytes: Uint8Array | ArrayBuffer);
  reads: number;
  read(offset: number, length: number): Uint8Array;
  get size(): number;
}
export class CountingTarget {
  writes: number;
  bytes: number;
  write(chunk: Uint8Array, position?: number): void;
  toUint8Array(): Uint8Array;
}
```

## bench.ts
```ts
import type { BenchSummary, MetricId, MetricSample } from './scenario.ts';

export interface BenchOptions { warmup?: number; iters?: number; noiseBandPct?: number }  // defaults 3 / 6 / 3
export const DEFAULT_BENCH: Required<BenchOptions>;

/** Run warmup+iters of `run`, collect one MetricSample per iter, summarize the chosen metric. */
export function bench(metric: MetricId, run: (iter: number) => Promise<MetricSample>, opts?: BenchOptions): Promise<BenchSummary>;
export function summarize(metric: MetricId, samples: number[], warmup: number, unit?: string): BenchSummary;  // median/p95/MAD

export type CompareVerdict = 'faster' | 'slower' | 'within-noise';
/** Lower-is-better metrics (wall): faster = candidate lower. For throughput, higher-is-better — pass higherIsBetter. */
export function compareBench(reference: BenchSummary, candidate: BenchSummary, opts?: { noiseBandPct?: number; higherIsBetter?: boolean }):
  { verdict: CompareVerdict; deltaPct: number };
export function metricUnit(metric: MetricId): string;       // 'ms','x-realtime','bytes','count','fps'
export function metricHigherIsBetter(metric: MetricId): boolean;
```

## oracles.ts
```ts
import type { DemuxResult, FrameDigest, FrameSink, MediaBytes, MediaEngine, MediaInput, NormalizedMetadata, PacketInfo } from './engine.ts';
import type { OracleId, OracleOutcome, OracleTolerances, Scenario } from './scenario.ts';
// NOTE: PacketInfo is exported from engine.ts (NOT scenario.ts).

export interface GoldenStore {
  meta?: NormalizedMetadata;
  packets?: PacketInfo[];
  frames?: FrameDigest[];          // golden decoded-frame digests
  ssimRef?: number[][];            // downsampled luma signatures per reference frame (for ssim-psnr)
  raw?: Record<string, unknown>;
}
export function loadGolden(assetId: string, baseUrl?: string): Promise<GoldenStore>;   // fetch fixtures/golden/<id>.*.json

export interface OracleContext {
  scenario: Scenario;
  input: MediaInput;
  output?: MediaBytes;             // bytes-producing ops
  metadata?: NormalizedMetadata;   // probe
  demux?: DemuxResult;             // demux
  frames?: FrameSink;              // decodeFrames
  seek?: { landedPtsUs: number; frame: FrameDigest };
  golden: GoldenStore;
  referenceEngine?: MediaEngine;   // for 'reference-reimport'
  /** injected by runner: decode arbitrary bytes with the platform engine (WebCodecs) → frames */
  decodeWithPlatform: (bytes: MediaBytes, opts?: { maxFrames?: number }) => Promise<FrameSink>;
  /** injected by runner: <video> playback smoke test → resolves true if it plays a few frames */
  playbackSmoke: (bytes: MediaBytes) => Promise<boolean>;
}
export function runOracle(oracle: OracleId, ctx: OracleContext, tol?: OracleTolerances): Promise<OracleOutcome>;

/** Pixel utilities (browser): normalize → tight RGBA top-left; digest = sha256(normalized RGBA). */
export function digestFrame(img: ImageData, index: number, ptsUs: number): Promise<FrameDigest>;
export function ssim(a: ImageData, b: ImageData): number;       // 0..1
export function psnrDb(a: ImageData, b: ImageData): number;     // dB (Infinity if identical)
export const DEFAULT_TOLERANCES: Required<OracleTolerances>;     // ssimMin 0.99, psnrMinDb 40, durationToleranceSec ~1 frame, seekToleranceUs
```

## runner.ts
```ts
import type { BrowserName, CapabilitySet, MediaEngine } from './engine.ts';
import type { Requires, Scenario, ScenarioResult } from './scenario.ts';
import type { CodecSupport } from './feature-detect.ts';

export type Negotiation =
  | { ok: true }
  | { ok: false; status: 'NA_ENGINE' | 'NA_BROWSER'; reason: string };
/** Declared caps ∧ runtime support vs scenario.requires. NA_ENGINE (undeclared) takes precedence over NA_BROWSER. */
export function negotiate(caps: CapabilitySet, support: CodecSupport, requires: Requires): Negotiation;

export interface RunOptions {
  browser: BrowserName;
  engineIds?: string[];          // default: all registered
  scenarioIds?: string[];        // default: all registered
  pillar?: 'functional' | 'performance' | 'robustness' | 'all';   // default 'all'
  benchOptions?: import('./bench.ts').BenchOptions;
  onResult?: (r: ScenarioResult) => void;
  onProgress?: (done: number, total: number, label: string) => void;
}
export function runMatrix(opts: RunOptions): Promise<ScenarioResult[]>;
export function runOne(engine: MediaEngine, scenario: Scenario, browser: BrowserName, support: CodecSupport, opts?: Partial<RunOptions>): Promise<ScenarioResult>;
```
Runner responsibilities: build engine via registry factory; init(); detect support; negotiate; if NA → record and skip; else execute op (functional pass first), run its oracles; ONLY if all oracles pass and pillar includes performance, run bench() and attach `bench`; catch errors → status ERROR with reason; enforce scenario.timeoutMs (Promise.race) for robustness; dispose(). Functional gate blocks bench (rule §0.1).

## report.ts
```ts
import type { ScenarioResult } from './scenario.ts';

export interface ReportInput {
  results: ScenarioResult[];
  referenceEngineId: string;
  suiteVersion?: string;
  generatedAtIso?: string;
}
export interface ReportOutput { markdown: string; json: unknown }
export function buildReport(input: ReportInput): ReportOutput;
```
Report sections (§12): (1) capability matrix, (2) conformance matrix + conformance %, (3) benchmark
matrix, (4) Δ-vs-reference (within-browser only; vocabulary faster/slower/within-noise/gained/
regressed/NA), (5) per-engine scorecard. Plus the browser caveats (§13) written in. Emit JSON too.
NEVER compare numbers across browsers.

## Adapter notes
- All adapters implement `MediaEngine` from `engine.ts`. `capabilities()` must be HONEST (declare
  only what the lib does). Use canonical codec/container tokens.
- `platform` adapter additionally EXPORTS helpers the runner injects into oracles:
  `decodeBytesToFrames(bytes, opts)` and `playbackSmoke(bytes)`.
- Dynamically import the heavy lib inside `init()` so the suite shell stays light.
- Reference engine id is `mediabunny@1.48.0`.
