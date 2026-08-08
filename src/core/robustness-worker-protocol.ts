import type { BrowserName, DecryptKey } from './engine.ts';
import type { CodecSupport } from './feature-detect.ts';
import type { CandidateOracleEvidencePlan, ResolvedInput, VerifiedContent } from './media-selection.ts';
import type { ResultSelection, RunEnv, ScenarioResult } from './scenario.ts';
import type { PixelBehaviorEvidence } from './runner.ts';

export const ROBUSTNESS_WORKER_PROTOCOL = 'media-test/robustness-worker@1' as const;
export const DEFAULT_ROBUSTNESS_MEMORY_DELTA_LIMIT_BYTES = 512 * 1024 * 1024;
export const DEFAULT_ROBUSTNESS_MEMORY_SAMPLE_INTERVAL_MS = 25;

export interface RobustnessWorkerResourceLimits {
  /** Peak-minus-baseline ceiling, so unrelated origin memory cannot fail this isolated cell. */
  readonly memoryDeltaBytes?: number;
  readonly sampleIntervalMs?: number;
}

export type RobustnessWorkerMemoryEvidence =
  | Readonly<{
      state: 'AVAILABLE';
      source: 'measureUserAgentSpecificMemory' | 'bun-process-rss';
      baselineBytes: number;
      peakBytes: number;
      afterBytes: number;
      deltaBytes: number;
      limitBytes: number;
      limitBasis: 'peak-minus-baseline';
      samples: number;
    }>
  | Readonly<{
      state: 'UNAVAILABLE';
      status: 'NA_BROWSER';
      reasonCode: 'ROBUSTNESS_MEMORY_API_UNAVAILABLE' | 'ROBUSTNESS_MEMORY_MEASUREMENT_FAILED';
      reason: string;
      limitBytes: number;
      limitBasis: 'peak-minus-baseline';
    }>;

export interface RobustnessWorkerResourceEvidence {
  readonly schema: 'media-test/robustness-resources@1';
  readonly wallTime: Readonly<{
    state: 'AVAILABLE';
    source: 'worker-performance-clock';
    observedMs: number;
    limitMs: number;
  }>;
  readonly memory: RobustnessWorkerMemoryEvidence;
  readonly longtasks: Readonly<{
    state: 'UNAVAILABLE';
    status: 'NA_BROWSER';
    reasonCode: 'ROBUSTNESS_LONGTASK_WORKER_SCOPE_UNAVAILABLE';
    reason: string;
  }>;
}

/** Serializable request only. Functions, AbortSignals, engine instances, and scenario mutation
 * closures are deliberately reconstructed inside the isolated realm. */
export interface RobustnessWorkerRequest {
  readonly schema: typeof ROBUSTNESS_WORKER_PROTOCOL;
  readonly engineRegistryId: string;
  readonly scenarioId: string;
  readonly selectedFile?: string;
  readonly browser: BrowserName;
  readonly support: CodecSupport;
  readonly options: Readonly<{
    pillar: 'functional' | 'performance' | 'robustness' | 'all';
    env: RunEnv;
    resolvedInputs?: readonly ResolvedInput[];
    selection?: Readonly<ResultSelection>;
    selectionEvidencePlan?: CandidateOracleEvidencePlan;
    verifiedContents?: readonly VerifiedContent[];
    decryptKeyOverride?: DecryptKey;
    pixelBehavior: PixelBehaviorEvidence;
    cachedResult?: ScenarioResult;
    resourceLimits?: RobustnessWorkerResourceLimits;
  }>;
}

export type RobustnessWorkerResponse =
  | Readonly<{
      schema: typeof ROBUSTNESS_WORKER_PROTOCOL;
      state: 'RESULT';
      result: ScenarioResult;
    }>
  | Readonly<{
      schema: typeof ROBUSTNESS_WORKER_PROTOCOL;
      state: 'HARNESS_ERROR';
      error: Readonly<{ name: string; message: string; stack?: string }>;
    }>;
