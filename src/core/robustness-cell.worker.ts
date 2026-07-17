/// <reference lib="webworker" />

import { registerAll } from '../app/register.ts';
import { getEngine, getScenario } from './registry.ts';
import { candidatesForRun, loadScenarioSources } from './media-selection.ts';
import { runOne } from './runner.ts';
import { decodeBytesToFrames, playbackSmoke } from '../engines/platform/oracle-helpers.ts';
import {
  DEFAULT_ROBUSTNESS_MEMORY_DELTA_LIMIT_BYTES,
  DEFAULT_ROBUSTNESS_MEMORY_SAMPLE_INTERVAL_MS,
  ROBUSTNESS_WORKER_PROTOCOL,
  type RobustnessWorkerMemoryEvidence,
  type RobustnessWorkerRequest,
  type RobustnessWorkerResourceEvidence,
  type RobustnessWorkerResponse,
} from './robustness-worker-protocol.ts';
import type { Scenario, ScenarioResult } from './scenario.ts';

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<RobustnessWorkerRequest>): void => {
  void execute(event.data).then(
    (response) => workerScope.postMessage(response),
    (error) => workerScope.postMessage(harnessError(error)),
  );
};

async function execute(request: RobustnessWorkerRequest): Promise<RobustnessWorkerResponse> {
  if (request.schema !== ROBUSTNESS_WORKER_PROTOCOL) {
    throw new TypeError(`unsupported robustness worker protocol '${String(request.schema)}'`);
  }
  // Registry/module loading is identical harness setup for every cell. Establish the resource
  // baseline after it so engine/scenario work, rather than unrelated cold imports, is budgeted.
  await registerAll();
  const monitor = await WorkerResourceMonitor.start(request.options.resourceLimits);
  try {
    const registered = getEngine(request.engineRegistryId);
    if (!registered) throw new Error(`isolated engine '${request.engineRegistryId}' is not registered`);
    const baseScenario = getScenario(request.scenarioId);
    if (!baseScenario) throw new Error(`isolated scenario '${request.scenarioId}' is not registered`);

    let scenario = baseScenario;
    const selectedFile = request.selectedFile;
    if (selectedFile && !isBakedSelection(baseScenario.input, selectedFile)) {
      const sources = await loadScenarioSources();
      const candidates = candidatesForRun([baseScenario], sources, { rotate: true }).get(baseScenario.id) ?? [];
      const selected = candidates.find((candidate) => candidate.selectedFile === selectedFile);
      if (!selected) {
        throw new Error(
          `isolated selection '${selectedFile}' is absent from the verified pool for '${baseScenario.id}'`,
        );
      }
      scenario = selected.effectiveScenario;
    }

    const engine = await registered.factory();
    const result = await runOne(engine, scenario, request.browser, request.support, {
      browser: request.browser,
      pillar: request.options.pillar,
      env: request.options.env,
      decodeWithPlatform: decodeBytesToFrames,
      playbackSmoke,
      ...(request.options.resolvedInputs
        ? { resolvedInputs: [...request.options.resolvedInputs] }
        : {}),
      ...(request.options.selection ? { selection: { ...request.options.selection } } : {}),
      ...(request.options.selectionEvidencePlan
        ? { selectionEvidencePlan: request.options.selectionEvidencePlan }
        : {}),
      ...(request.options.verifiedContents
        ? { verifiedContents: request.options.verifiedContents }
        : {}),
      ...(request.options.decryptKeyOverride
        ? { decryptKeyOverride: request.options.decryptKeyOverride }
        : {}),
      ...(request.options.runSeed !== undefined ? { runSeed: request.options.runSeed } : {}),
      pixelBehavior: request.options.pixelBehavior,
      ...(request.options.cachedResult ? { cachedResult: request.options.cachedResult } : {}),
    });
    const resources = await monitor.finish(scenario.timeoutMs);
    const withResourceOutcome = enforceResourceLimit(result, scenario, resources);
    return {
      schema: ROBUSTNESS_WORKER_PROTOCOL,
      state: 'RESULT',
      result: attachSingleExecutionMeasurements(withResourceOutcome, scenario, resources),
    };
  } catch (error) {
    await monitor.finish(0);
    throw error;
  }
}

function isBakedSelection(input: string | readonly string[], selectedFile: string): boolean {
  return (Array.isArray(input) ? input : [input]).includes(selectedFile);
}

function harnessError(error: unknown): RobustnessWorkerResponse {
  const name = error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  return {
    schema: ROBUSTNESS_WORKER_PROTOCOL,
    state: 'HARNESS_ERROR',
    error: { name, message, ...(stack ? { stack } : {}) },
  };
}

type MemorySource = Extract<RobustnessWorkerMemoryEvidence, { state: 'AVAILABLE' }>['source'];

interface MemorySampler {
  source: MemorySource;
  sample(): Promise<number>;
}

class WorkerResourceMonitor {
  private readonly startedAt = monotonicNow();
  private readonly values: number[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;
  private sampling = Promise.resolve();
  private samplePending = false;
  private sampleFailure: unknown;
  private finished: RobustnessWorkerResourceEvidence | undefined;

  private constructor(
    private readonly sampler: MemorySampler | undefined,
    private readonly memoryLimitBytes: number,
    private readonly sampleIntervalMs: number,
    private readonly unavailableReason?: string,
  ) {}

  static async start(limits: RobustnessWorkerRequest['options']['resourceLimits']): Promise<WorkerResourceMonitor> {
    const memoryLimitBytes = positiveSafeInteger(
      limits?.memoryDeltaBytes ?? DEFAULT_ROBUSTNESS_MEMORY_DELTA_LIMIT_BYTES,
      'resourceLimits.memoryDeltaBytes',
    );
    const sampleIntervalMs = positiveSafeInteger(
      limits?.sampleIntervalMs ?? DEFAULT_ROBUSTNESS_MEMORY_SAMPLE_INTERVAL_MS,
      'resourceLimits.sampleIntervalMs',
    );
    const resolved = resolveMemorySampler();
    const monitor = new WorkerResourceMonitor(
      resolved.sampler,
      memoryLimitBytes,
      sampleIntervalMs,
      resolved.reason,
    );
    await monitor.checkpoint();
    if (monitor.sampler) {
      monitor.timer = setInterval(() => {
        void monitor.checkpoint();
      }, sampleIntervalMs);
    }
    return monitor;
  }

  checkpoint(): Promise<void> {
    if (!this.sampler || this.sampleFailure !== undefined || this.samplePending) return this.sampling;
    this.samplePending = true;
    this.sampling = this.sampling
      .then(async () => {
        try {
          const bytes = await this.sampler!.sample();
          if (!Number.isFinite(bytes) || bytes < 0) {
            throw new TypeError(`memory sampler returned invalid byte count '${String(bytes)}'`);
          }
          this.values.push(bytes);
        } catch (error) {
          this.sampleFailure = error;
        }
      })
      .finally(() => { this.samplePending = false; });
    return this.sampling;
  }

  async finish(limitMs: number): Promise<RobustnessWorkerResourceEvidence> {
    if (this.finished) return this.finished;
    if (this.timer !== undefined) clearInterval(this.timer);
    await this.sampling;
    await this.checkpoint();
    await this.sampling;
    const observedMs = Math.max(0, monotonicNow() - this.startedAt);
    let memory: RobustnessWorkerMemoryEvidence;
    if (!this.sampler) {
      memory = {
        state: 'UNAVAILABLE',
        status: 'NA_BROWSER',
        reasonCode: 'ROBUSTNESS_MEMORY_API_UNAVAILABLE',
        reason: this.unavailableReason ?? 'no Worker-safe memory measurement API exists in this realm',
        limitBytes: this.memoryLimitBytes,
        limitBasis: 'peak-minus-baseline',
      };
    } else if (this.sampleFailure !== undefined || this.values.length === 0) {
      memory = {
        state: 'UNAVAILABLE',
        status: 'NA_BROWSER',
        reasonCode: 'ROBUSTNESS_MEMORY_MEASUREMENT_FAILED',
        reason: errorMessage(this.sampleFailure ?? 'memory sampler produced no observations'),
        limitBytes: this.memoryLimitBytes,
        limitBasis: 'peak-minus-baseline',
      };
    } else {
      const baselineBytes = this.values[0]!;
      const peakBytes = Math.max(...this.values);
      const afterBytes = this.values[this.values.length - 1]!;
      memory = {
        state: 'AVAILABLE',
        source: this.sampler.source,
        baselineBytes,
        peakBytes,
        afterBytes,
        deltaBytes: Math.max(0, peakBytes - baselineBytes),
        limitBytes: this.memoryLimitBytes,
        limitBasis: 'peak-minus-baseline',
        samples: this.values.length,
      };
    }
    this.finished = {
      schema: 'media-test/robustness-resources@1',
      wallTime: {
        state: 'AVAILABLE',
        source: 'worker-performance-clock',
        observedMs,
        limitMs: Math.max(0, limitMs),
      },
      memory,
      longtasks: {
        state: 'UNAVAILABLE',
        status: 'NA_BROWSER',
        reasonCode: 'ROBUSTNESS_LONGTASK_WORKER_SCOPE_UNAVAILABLE',
        reason: 'PerformanceObserver longtask entries describe the page main thread, not this isolated Worker',
      },
    };
    return this.finished;
  }
}

function resolveMemorySampler(): { sampler?: MemorySampler; reason?: string } {
  const extendedPerformance = performance as Performance & {
    measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
  };
  if (typeof extendedPerformance.measureUserAgentSpecificMemory === 'function') {
    return {
      sampler: {
        source: 'measureUserAgentSpecificMemory',
        sample: async () => (await extendedPerformance.measureUserAgentSpecificMemory!()).bytes,
      },
    };
  }
  const processLike = (globalThis as unknown as {
    process?: { memoryUsage?: () => { rss?: number } };
  }).process;
  if (typeof processLike?.memoryUsage === 'function') {
    // Resident set size is the honest process-memory footprint an OOM killer observes, and — unlike
    // V8/JSC `heapUsed`, which only updates at GC boundaries and stays flat across a sub-slack micro
    // operation — it moves with every native buffer/codec allocation. It is the Bun-realm analog of a
    // browser's `measureUserAgentSpecificMemory` total-bytes figure.
    return {
      sampler: {
        source: 'bun-process-rss',
        sample: async () => processLike.memoryUsage!().rss ?? Number.NaN,
      },
    };
  }
  return { reason: 'measureUserAgentSpecificMemory and Worker-safe heap telemetry are unavailable' };
}

function enforceResourceLimit(
  result: ScenarioResult,
  scenario: Scenario,
  resources: RobustnessWorkerResourceEvidence,
): ScenarioResult {
  const memory = resources.memory;
  if (
    memory.state !== 'AVAILABLE' ||
    memory.deltaBytes <= memory.limitBytes ||
    !resourceLimitApplies(result)
  ) {
    return result;
  }
  const detail = `isolated Worker peak-minus-baseline memory ${memory.deltaBytes} bytes exceeded ${memory.limitBytes} bytes`;
  const oracle = scenario.oracles.includes('graceful-failure')
    ? 'graceful-failure'
    : scenario.oracles[0] ?? 'property-invariant';
  const oracleOutcomes = result.oracleOutcomes.some((outcome) =>
    outcome.state === 'VERDICT' && outcome.reasonCode === 'ROBUSTNESS_RESOURCE_LIMIT')
    ? result.oracleOutcomes
    : [...result.oracleOutcomes, {
        state: 'VERDICT' as const,
        oracle,
        verdict: 'FAIL' as const,
        reasonCode: 'ROBUSTNESS_RESOURCE_LIMIT',
        detail,
      }];
  const { bench: _bench, ...withoutBench } = result;
  return {
    ...withoutBench,
    status: 'FAIL',
    oracleOutcomes,
    measurement: {
      state: 'UNAVAILABLE',
      reasonCode: 'ROBUSTNESS_RESOURCE_LIMIT',
      detail,
    },
    operationEvidence: {
      ...(result.operationEvidence ?? {}),
      schema: 'media-test/robustness-operation@1',
      disposition: 'resource-limit',
      stage: 'cleanup',
      resource: {
        kind: 'memory',
        observed: memory.deltaBytes,
        limit: memory.limitBytes,
        unit: 'bytes',
      },
    },
    reason: `[ROBUSTNESS_RESOURCE_LIMIT] ${detail}` +
      (result.reason ? `; prior outcome: ${result.reason}` : ''),
  };
}

function resourceLimitApplies(result: ScenarioResult): boolean {
  if (result.status === 'PASS' || result.status === 'FAIL') return true;
  return result.status === 'ERROR' && (
    result.operationEvidence?.disposition === 'returned-validatable-output' ||
    result.operationEvidence?.disposition === 'clean-reject'
  );
}

function attachSingleExecutionMeasurements(
  result: ScenarioResult,
  scenario: Scenario,
  resources: RobustnessWorkerResourceEvidence,
): ScenarioResult {
  if (result.operationEvidence?.disposition === 'resource-limit') return result;
  const operationEvidence = result.operationEvidence
    ? {
        ...result.operationEvidence,
        resource: {
          kind: 'wall-time' as const,
          observed: resources.wallTime.observedMs,
          limit: resources.wallTime.limitMs,
          unit: 'ms' as const,
        },
      }
    : result.operationEvidence;
  if (result.status !== 'PASS') {
    return { ...result, ...(operationEvidence ? { operationEvidence } : {}) };
  }

  const protocolEvidence = {
    ...(result.bench?.wall?.protocolEvidence ?? {}),
    robustnessResources: resources,
    correctnessExecutions: 1,
    benchmarkLoop: false,
  };
  const wall = result.bench?.wall
    ? { ...result.bench.wall, protocolEvidence }
    : oneSampleSummary('wall', resources.wallTime.observedMs, 'ms', protocolEvidence);
  const bench: NonNullable<ScenarioResult['bench']> = { ...(result.bench ?? {}), wall };
  const measured = new Set(result.measurement?.state === 'AVAILABLE' ? result.measurement.metrics : []);
  measured.add('wall');
  if (resources.memory.state === 'AVAILABLE' && scenario.metrics.includes('peakMemory')) {
    bench.peakMemory = result.bench?.peakMemory ?? oneSampleSummary(
      'peakMemory',
      resources.memory.peakBytes,
      'byte',
      { robustnessResources: resources, correctnessExecutions: 1, benchmarkLoop: false },
    );
    measured.add('peakMemory');
  }
  return {
    ...result,
    ...(operationEvidence ? { operationEvidence } : {}),
    bench,
    measurement: { state: 'AVAILABLE', metrics: [...measured] },
  };
}

function oneSampleSummary(
  metric: 'wall' | 'peakMemory',
  value: number,
  unit: string,
  protocolEvidence: Record<string, unknown>,
): NonNullable<ScenarioResult['bench']>['wall'] {
  return {
    n: 1,
    warmup: 0,
    metric,
    median: value,
    p95: value,
    mad: 0,
    unit,
    samples: [value],
    sampleAxis: 'iteration',
    requestedIterations: 1,
    protocolEvidence,
  };
}

function positiveSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function monotonicNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
