import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  adaptiveBench,
  createInterleavedBenchSchedule,
  requireFiniteMetricSample,
} from '../src/core/bench.ts';
import {
  CountingSource,
  Meter,
  measurePeakMemoryWindow,
  sumLongTasksInWindow,
  type LongTaskObserverEnvironment,
  type MemorySampler,
} from '../src/core/measure.ts';
import type {
  LifecycleContext,
  MediaBytes,
  MediaInput,
  NormalizedTrack,
} from '../src/core/engine.ts';
import { RemotionWebcodecsEngine } from '../src/engines/remotion-webcodecs/adapter.ts';
import { performanceScenarios, performanceAggregateScenarioIds } from '../src/scenarios/performance/index.ts';
import {
  PERFORMANCE_QUESTIONS,
  aggregatePerformanceQuestionIds,
  available,
  bundleMetricInput,
  consumeOwnedFrames,
  countOutputPresentationUnits,
  countPacketPresentationUnits,
  createBundleComponentsArtifact,
  inspectOutputPresentation,
  joinBundleComponents,
  operationEventLatency,
  repeatedDecodeLeakCheck,
  repeatedScenarioDecodeLeakCheck,
  resolvePresentationDuration,
  resolveScaleAvailability,
  sourceReadEvidence,
  unavailable,
  validatePerformanceQuestionCatalog,
  type BundleComponentKind,
  type BundleComponentsRecord,
  type BundleTransferComponent,
  type ClosableFrame,
} from '../src/features/performance/index.ts';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);

describe('REQ-FEAT-68: actual output presentation-unit numerators', () => {
  test('CFR and VFR counts come from neutral output sample tables, not fps × duration', async () => {
    const fixtures = [
      ['tiny_h264_360p_2s.mp4', 60],
      ['h264_vfr.mp4', 111],
    ] as const;
    for (const [file, expectedVideoUnits] of fixtures) {
      const bytes = new Uint8Array(await Bun.file(join(ROOT, 'fixtures/media', file)).arrayBuffer());
      const output: MediaBytes = { bytes, mime: 'video/mp4', container: 'mp4' };
      const counted = countOutputPresentationUnits(output);
      expect(counted).toMatchObject({
        state: 'AVAILABLE',
        value: { count: expectedVideoUnits, source: 'neutral-output-packet-reader' },
      });
      const inspected = inspectOutputPresentation(output);
      expect(inspected.duration).toMatchObject({
        state: 'AVAILABLE', value: { basis: 'output-presentation' },
      });
    }
  });

  test('NTSC/fps-conversion counters remain exact and conflicting independent evidence is ERROR', async () => {
    const counterOnly = countOutputPresentationUnits({
      bytes: new Uint8Array([0]), mime: 'video/example', container: 'example',
      telemetry: { encodedFrames: 240 },
    });
    expect(counterOnly).toEqual({
      state: 'AVAILABLE', value: { count: 240, source: 'adapter-final-counter' },
    });

    const bytes = new Uint8Array(await Bun.file(join(ROOT, 'fixtures/media/h264_vfr.mp4')).arrayBuffer());
    expect(countOutputPresentationUnits({
      bytes, mime: 'video/mp4', container: 'mp4', telemetry: { encodedFrames: 110 },
    })).toMatchObject({ state: 'UNAVAILABLE', status: 'ERROR', reasonCode: 'ENCODED_FRAME_COUNTER_MISMATCH' });
  });

  test('legal packet grouping collapses access-unit ids; no evidence emits no count or rate', () => {
    expect(countPacketPresentationUnits([
      { trackIndex: 0, accessUnitId: 'frame-0' },
      { trackIndex: 0, accessUnitId: 'frame-0' },
      { trackIndex: 0, accessUnitId: 'frame-1' },
    ])).toMatchObject({ state: 'AVAILABLE', value: { count: 2 } });
    expect(countOutputPresentationUnits({
      bytes: new Uint8Array([0]), mime: 'application/octet-stream', container: 'unknown',
    })).toMatchObject({ state: 'UNAVAILABLE', reasonCode: 'OUTPUT_PRESENTATION_UNITS_UNAVAILABLE' });
  });
});

describe('REQ-FEAT-69: adaptive, repeated, randomized/interleaved timing', () => {
  test('fast operations calibrate their inner loop and collect at least five independent repetitions', async () => {
    const calls: Array<{ phase: string; innerIterations: number }> = [];
    const result = await adaptiveBench('opsPerSec', async (request) => {
      calls.push(request);
      return {
        wallMs: request.innerIterations * 10,
        opsPerSec: 100,
      };
    }, { warmup: 1, iters: 1, minDurationMs: 100 }, sequenceClock([0, 0, 0.5, 1, 1.5, 2]));
    expect(result.protocol.innerIterations).toBe(10);
    expect(result.protocol.measuredCount).toBe(5);
    expect(result.rawSamples).toHaveLength(5);
    expect(result.summary).toMatchObject({ n: 5, requestedIterations: 5, sampleAxis: 'iteration' });
    expect(calls.filter((call) => call.phase === 'measured').every((call) => call.innerIterations === 10)).toBe(true);
    expect(result.protocol.timerResolutionMs).toBe(0.5);
  });

  test('a slow single operation uses at least three repetitions', async () => {
    const result = await adaptiveBench('wall', async () => ({ wallMs: 150 }), {
      warmup: 0, iters: 1, minDurationMs: 100,
    }, sequenceClock([0, 1, 2, 3]));
    expect(result.protocol).toMatchObject({ slowOperation: true, innerIterations: 1, measuredCount: 3 });
    expect(result.summary.n).toBe(3);
  });

  test('every randomized block contains every engine once and replays from its seed', () => {
    const first = createInterleavedBenchSchedule(['a', 'b', 'c'], 5, 'replay-seed');
    const second = createInterleavedBenchSchedule(['a', 'b', 'c'], 5, 'replay-seed');
    expect(first).toEqual(second);
    for (let block = 0; block < 5; block++) {
      expect(first.filter((turn) => turn.block === block).map((turn) => turn.engineId).sort()).toEqual(['a', 'b', 'c']);
    }
    expect(new Set(first.map((turn) => first.filter((other) => other.block === turn.block).map((other) => other.engineId).join(','))).size)
      .toBeGreaterThan(1);
  });

  test('a promised missing/non-finite metric names the exact metric and iteration', () => {
    expect(() => requireFiniteMetricSample('framesPerSec', { wallMs: 1 }, 4))
      .toThrow("[METRIC_SAMPLE_NON_FINITE] metric 'framesPerSec' iteration 4");
  });
});

describe('REQ-FEAT-70: honest memory window', () => {
  test('records one API, baseline, operation maximum, delta, end, and settle samples', async () => {
    let now = 0;
    let sleepCount = 0;
    let finish!: () => void;
    const operation = new Promise<void>((resolve) => { finish = resolve; });
    const values = [100, 180, 140, 120, 110];
    const sampler: MemorySampler = {
      api: 'measureUserAgentSpecificMemory',
      sample: async () => values.shift() ?? 110,
    };
    const result = await measurePeakMemoryWindow(
      async () => operation,
      available(sampler),
      {
        sampleIntervalMs: 10,
        settleWindowMs: 20,
        clock: () => now,
        sleep: async (ms) => {
          now += ms;
          sleepCount += 1;
          if (sleepCount === 2) finish();
          await Promise.resolve();
        },
      },
    );
    expect(result).toMatchObject({
      state: 'AVAILABLE',
      value: { memory: {
        api: 'measureUserAgentSpecificMemory',
        baselineBytes: 100,
        maximumBytes: 180,
        deltaBytes: 80,
        memoryAfterOperationBytes: 140,
        settleWindowMs: 20,
      } },
    });
    if (result.state === 'AVAILABLE') {
      expect(result.value.memory.samples.map((sample) => sample.phase)).toEqual([
        'baseline', 'operation', 'end', 'settle', 'settle',
      ]);
    }
  });

  test('unsupported memory instrumentation is NA_BROWSER and never runs the measured operation', async () => {
    let ran = false;
    const result = await measurePeakMemoryWindow(
      async () => { ran = true; },
      unavailable('NA_BROWSER', 'MEMORY_API_UNSUPPORTED', 'not installed'),
    );
    expect(result).toMatchObject({ state: 'UNAVAILABLE', status: 'NA_BROWSER', reasonCode: 'MEMORY_API_UNSUPPORTED' });
    expect(ran).toBe(false);
  });

  test('operation rejection remains in the operation channel instead of becoming a memory error', async () => {
    const operationError = new Error('typed operation rejection');
    await expect(measurePeakMemoryWindow(
      async () => { throw operationError; },
      available({ api: 'measureUserAgentSpecificMemory', sample: async () => 100 }),
      { sampleIntervalMs: 1, settleWindowMs: 0 },
    )).rejects.toBe(operationError);
  });
});

describe('REQ-FEAT-71: gated, in-window long-task measurement', () => {
  test('pre-window, post-window, and threshold-only records do not contaminate the window', () => {
    expect(sumLongTasksInWindow([
      { startTime: 20, duration: 90 },
      { startTime: 110, duration: 60 },
      { startTime: 120, duration: 50 },
      { startTime: 190, duration: 75 },
      { startTime: 201, duration: 100 },
    ], 100, 200)).toEqual({
      totalDurationMs: 135,
      longestDurationMs: 75,
      count: 2,
      window: { beginMs: 100, endMs: 200 },
      thresholdMs: 50,
      observerActive: true,
    });
  });

  test('unsupported observer yields NA_BROWSER while an active empty observer yields a valid zero', async () => {
    let now = 100;
    const unsupported = new Meter({
      observeLongtasks: true,
      clock: () => now,
      longTaskEnvironment: observerEnvironment([], []),
    });
    unsupported.begin();
    now = 200;
    const unsupportedSample = await unsupported.end();
    expect(unsupportedSample.longtaskMs).toBeUndefined();
    expect(unsupported.evidence().longtasks).toMatchObject({
      state: 'UNAVAILABLE', status: 'NA_BROWSER', reasonCode: 'LONGTASK_ENTRY_TYPE_UNSUPPORTED',
    });

    now = 300;
    const active = new Meter({
      observeLongtasks: true,
      clock: () => now,
      longTaskEnvironment: observerEnvironment(['longtask'], []),
    });
    active.begin();
    now = 400;
    const activeSample = await active.end();
    expect(activeSample.longtaskMs).toBe(0);
    expect(active.evidence().longtasks).toMatchObject({
      state: 'AVAILABLE', value: { totalDurationMs: 0, longestDurationMs: 0, count: 0, observerActive: true },
    });
  });
});

describe('REQ-FEAT-72: complete early-joined bundle transfer components', () => {
  test('all four components and their total produce the same live/offline pre-report input', () => {
    const record = measuredBundleRecord('engine@1');
    const artifact = createBundleComponentsArtifact({ artifactId: 'fixture', records: [record] });
    const expectation = {
      engineId: 'engine@1', engineVersion: '1', sourceContentHash: DIGEST_A, toolchainContentHash: DIGEST_B,
    };
    const joined = joinBundleComponents(artifact, expectation);
    const live = bundleMetricInput(joined);
    const offline = bundleMetricInput(joinBundleComponents(artifact, expectation));
    expect(live).toEqual(offline);
    expect(live).toMatchObject({
      state: 'AVAILABLE',
      value: { value: 100, unit: 'byte', joinedBeforeReport: true },
    });
    if (live.state === 'AVAILABLE') {
      expect(live.value.components.map((component) => component.kind)).toEqual([
        'javascript-minified-gzip', 'runtime-wasm', 'worker', 'codec-core',
      ]);
    }
  });

  test('missing maps are NA_ASSET, and incomplete maps cannot become numeric zero', () => {
    const artifact = createBundleComponentsArtifact({ artifactId: 'empty', records: [] });
    expect(joinBundleComponents(artifact, {
      engineId: 'missing@1', engineVersion: '1', sourceContentHash: DIGEST_A, toolchainContentHash: DIGEST_B,
    })).toMatchObject({ state: 'UNAVAILABLE', status: 'NA_ASSET', reasonCode: 'BUNDLE_COMPONENT_MAP_MISSING' });

    const incomplete = measuredBundleRecord('bad@1');
    incomplete.components = incomplete.components.filter((component) => component.kind !== 'runtime-wasm');
    incomplete.transferTotalBytes = incomplete.components.reduce((sum, component) => sum + component.transferBytes, 0);
    expect(() => createBundleComponentsArtifact({ artifactId: 'bad', records: [incomplete] }))
      .toThrow('[BUNDLE_COMPONENT_MISSING] runtime-wasm');
  });

  test('the production build producer counts emitted JS plus runtime WASM, workers, and codec cores', async () => {
    await runCommand(['bun', 'run', 'build']);
    const temporary = mkdtempSync(join(tmpdir(), 'media-test-bundles-'));
    const artifactPath = join(temporary, 'bundle-measurements.json');
    try {
      await runCommand([
        'bun',
        'scripts/measure-bundles.mjs',
        '--dist', 'dist',
        '--out', artifactPath,
      ]);
      const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as ProductionBundleArtifact;
      expect(artifact.measurements).toHaveLength(7);
      for (const measurement of artifact.measurements) {
        expect(measurement.state).toBe('MEASURED');
        if (measurement.state !== 'MEASURED') continue;
        expect(measurement.excludedRuntimeAssets).toEqual([]);
        expect(measurement.components.map((component) => component.kind)).toEqual([
          'javascript-minified-gzip', 'runtime-wasm', 'worker', 'codec-core',
        ]);
        const componentTotal = measurement.components.reduce((sum, component) => sum + component.transferBytes, 0);
        expect(measurement.compressedBytes).toBe(componentTotal);
        expect(measurement.transferTotalBytes).toBe(componentTotal);
        for (const component of measurement.components) {
          expect(component.files.reduce((sum, file) => sum + file.transferBytes, 0)).toBe(component.transferBytes);
          for (const file of component.files) expect(existsSync(join(ROOT, 'dist', file.path))).toBe(true);
        }
      }

      const componentBytes = (engineId: string, kind: BundleComponentKind): number => {
        const measurement = artifact.measurements.find((entry) => entry.engineId === engineId);
        if (!measurement || measurement.state !== 'MEASURED') return -1;
        return measurement.components.find((component) => component.kind === kind)?.transferBytes ?? -1;
      };
      for (const kind of [
        'javascript-minified-gzip', 'runtime-wasm', 'worker', 'codec-core',
      ] as const) {
        expect(componentBytes('ffmpeg.wasm@0.12.15', kind)).toBeGreaterThan(0);
      }
      expect(componentBytes('web-demuxer@4.0.0', 'runtime-wasm')).toBeGreaterThan(0);
      expect(componentBytes('remotion@4.0.479', 'worker')).toBeGreaterThan(0);
      expect(componentBytes('aibrush-media@dev', 'runtime-wasm')).toBeGreaterThan(0);
      expect(componentBytes('aibrush-media@dev', 'worker')).toBeGreaterThan(0);
      expect(componentBytes('aibrush-media@dev', 'codec-core')).toBeGreaterThan(0);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }, 120_000);
});

describe('REQ-FEAT-73: presentation denominators, event latency, and source-read claims', () => {
  test('duration basis is explicit and rational NTSC evidence is retained without rounding', () => {
    const duration = resolvePresentationDuration('output-presentation', {
      sourcePresentationUs: 10_000_000,
      outputPresentationUs: 8_000_000,
      outputRational: { numerator: 30_000, denominator: 1_001 },
    }, 'output movie presentation timeline');
    expect(duration).toEqual({
      state: 'AVAILABLE',
      value: {
        durationUs: 8_000_000,
        durationSec: 8,
        basis: 'output-presentation',
        policy: 'output movie presentation timeline',
        rational: { numerator: 30_000, denominator: 1_001 },
      },
    });
    expect(resolvePresentationDuration('processed-interval', {
      sourcePresentationUs: 10_000_000,
    }, 'trim interval only')).toMatchObject({
      state: 'UNAVAILABLE', status: 'ERROR', reasonCode: 'PRESENTATION_DURATION_UNAVAILABLE',
    });
  });

  test('first-byte/frame latency requires an operation event and rejects completion inference', () => {
    expect(operationEventLatency('first-byte', { firstByteMs: 2.5 }, 10)).toEqual({
      state: 'AVAILABLE',
      value: { kind: 'first-byte', milliseconds: 2.5, clockOrigin: 'operation-entry', source: 'adapter-event-final-counter' },
    });
    expect(operationEventLatency('first-frame', undefined, 10)).toMatchObject({
      state: 'UNAVAILABLE', status: 'NA_ENGINE', reasonCode: 'FIRST_FRAME_EVENT_UNAVAILABLE',
    });
    expect(operationEventLatency('first-frame', { firstFrameMs: 11 }, 10)).toMatchObject({
      state: 'UNAVAILABLE', status: 'ERROR', reasonCode: 'EVENT_LATENCY_OUTSIDE_WINDOW',
    });
  });

  test('source reads are claimable only through the actual random-access adapter boundary', () => {
    const source = new CountingSource(new Uint8Array(10));
    expect(source.read(0, 4)).toHaveLength(4);
    expect(source.read(8, 10)).toHaveLength(2);
    expect(sourceReadEvidence(source.evidence(false))).toMatchObject({
      state: 'UNAVAILABLE', status: 'NA_ENGINE', reasonCode: 'COUNTING_SOURCE_NOT_WIRED',
    });
    expect(sourceReadEvidence(source.evidence(true))).toEqual({
      state: 'AVAILABLE',
      value: { reads: 2, bytesRead: 6, sourceMode: 'random-access', boundary: 'adapter-input' },
    });
  });
});

describe('REQ-FEAT-74: data-driven scale availability and de-duplicated questions', () => {
  test('all 33 registered ids have unique questions and aliases cannot double-weight aggregates', () => {
    const ids = performanceScenarios.map((scenario) => scenario.id);
    expect(ids).toHaveLength(33);
    expect(PERFORMANCE_QUESTIONS).toHaveLength(33);
    expect(validatePerformanceQuestionCatalog(ids)).toEqual([]);
    expect(new Set(PERFORMANCE_QUESTIONS.map((entry) => entry.question)).size).toBe(33);
    expect(aggregatePerformanceQuestionIds(ids)).toEqual(performanceAggregateScenarioIds);
    expect(performanceAggregateScenarioIds).toHaveLength(31);
    expect(performanceAggregateScenarioIds).not.toContain('performance/op-sweep-probe');
    expect(performanceAggregateScenarioIds).not.toContain('performance/op-sweep-demux');
  });

  test('committed long-form identities and goldens run without stale source availability notes', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'fixtures/manifest.json'), 'utf8')) as {
      assets: Array<{ id: string; sha256?: string; sizeBytes?: number }>;
    };
    for (const assetId of [
      'large_h264_1080p_120s.mp4',
      'huge_h264_1080p_600s.mov',
      'massive_h264_1080p_2h.mp4',
    ]) {
      const asset = manifest.assets.find((entry) => entry.id === assetId)!;
      expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(asset.sizeBytes).toBeGreaterThan(0);
      expect(existsSync(join(ROOT, 'fixtures/golden', `${assetId}.meta.json`))).toBe(true);
      expect(existsSync(join(ROOT, 'fixtures/golden', `${assetId}.packets.json`))).toBe(true);
    }
    expect(performanceScenarios.map((scenario) => scenario.notes).join('\n'))
      .not.toMatch(/un[- ]?baked|not (?:yet )?baked|golden[- ]absent/i);
  });

  test('availability follows manifest identity and typed reader state, not a baked boolean', () => {
    const ready = resolveScaleAvailability({
      assetId: 'large.mp4',
      manifest: { sha256: DIGEST_A, sizeBytes: 100 },
      requiredGoldenKinds: ['meta', 'packets'],
      goldenEvidence: { meta: { state: 'OK' }, packets: { state: 'OK' } },
    });
    expect(ready).toMatchObject({ state: 'AVAILABLE', value: { assetId: 'large.mp4', sizeBytes: 100 } });
    expect(resolveScaleAvailability({
      assetId: 'large.mp4',
      manifest: { sha256: DIGEST_A, sizeBytes: 100 },
      requiredGoldenKinds: ['meta', 'packets'],
      goldenEvidence: { meta: { state: 'OK' }, packets: { state: 'PENDING' } },
    })).toMatchObject({ state: 'UNAVAILABLE', status: 'NA_ASSET', reasonCode: 'SCALE_GOLDEN_UNAVAILABLE' });
    expect(resolveScaleAvailability({
      assetId: 'large.mp4',
      manifest: { sha256: DIGEST_A, sizeBytes: 100 },
      requiredGoldenKinds: ['meta'],
      goldenEvidence: { meta: { state: 'DIGEST_MISMATCH', reasonCode: 'GOLDEN_DIGEST_MISMATCH' } },
    })).toMatchObject({ state: 'UNAVAILABLE', status: 'ERROR', reasonCode: 'GOLDEN_DIGEST_MISMATCH' });
  });
});

describe('REQ-FEAT-75: close frames and prove repeated decode returns to baseline', () => {
  test('success and consumer failure both close every owned frame exactly once', async () => {
    const successFrames = [new FakeFrame(), new FakeFrame(), new FakeFrame()];
    const success = await consumeOwnedFrames(successFrames, (_frame, index) => index);
    expect(success.values).toEqual([0, 1, 2]);
    expect(success.ownership).toEqual({ acquired: 3, closed: 3, active: 0, exactlyOnce: true });
    expect(successFrames.every((frame) => frame.closeCalls === 1)).toBe(true);

    const throwingFrames = [new FakeFrame(), new FakeFrame(), new FakeFrame()];
    await expect(consumeOwnedFrames(throwingFrames, (_frame, index) => {
      if (index === 1) throw new Error('digest failed');
    })).rejects.toThrow('digest failed');
    expect(throwingFrames.every((frame) => frame.closeCalls === 1)).toBe(true);
  });

  test('five repeated decodes return retained resources to baseline after every iteration', async () => {
    let active = 0;
    const result = await repeatedDecodeLeakCheck({
      repetitions: 5,
      retainedResourceCount: () => active,
      decode: async () => {
        active += 2;
        return [
          new FakeFrame(() => { active -= 1; }),
          new FakeFrame(() => { active -= 1; }),
        ];
      },
      inspect: (frame) => frame.clone,
    });
    expect(result).toMatchObject({
      state: 'AVAILABLE',
      value: { repetitions: 5, decodedFrames: 10, closedFrames: 10, retainedBaseline: 0, retainedAfter: 0 },
    });
    if (result.state === 'AVAILABLE') {
      expect(result.value.perRepetition.every((entry) => entry.retainedAfter === 0)).toBe(true);
    }
  });

  test('a retained resource is a typed leak error', async () => {
    let retained = 0;
    const result = await repeatedDecodeLeakCheck({
      decode: async () => [new FakeFrame(() => { retained += 1; })],
      retainedResourceCount: () => retained,
    });
    expect(result).toMatchObject({
      state: 'UNAVAILABLE', status: 'ERROR', reasonCode: 'REPEATED_DECODE_RESOURCE_LEAK',
    });
  });

  test('the registered decode scenario traverses the production adapter and closes native frames every repetition', async () => {
    const native = installNativeDecodeHarness();
    const scenario = performanceScenarios.find((entry) => entry.id === 'performance/decode-fps');
    expect(scenario).toBeDefined();
    if (!scenario) return;
    const fixture = Bun.file(join(ROOT, 'fixtures/media', String(scenario.input)));
    const input: MediaInput = {
      id: String(scenario.input),
      url: `https://fixtures.invalid/${String(scenario.input)}`,
      mime: 'video/mp4',
      sizeBytes: fixture.size,
      blob: async () => fixture,
      arrayBuffer: async () => fixture.arrayBuffer(),
    };
    const tracks: NormalizedTrack[] = [
      { type: 'video', codec: 'h264', width: 1, height: 1, fps: 30 },
      { type: 'audio', codec: 'aac', sampleRate: 48_000, channels: 2 },
    ];

    class LeakCheckRemotionEngine extends RemotionWebcodecsEngine {
      override async init(context?: LifecycleContext): Promise<void> {
        await super.init(context);
        installDecodeLibrary(this);
      }
    }

    try {
      const result = await repeatedScenarioDecodeLeakCheck({
        engineFactory: () => new LeakCheckRemotionEngine(),
        scenario,
        input,
        inputTracks: tracks,
        repetitions: 5,
      });
      expect(result).toMatchObject({
        state: 'AVAILABLE',
        value: {
          engineId: 'remotion-webcodecs@4.0.479',
          scenarioId: 'performance/decode-fps',
          repetitions: 5,
          adapterManagedFrames: 5,
          retainedBaseline: 0,
          retainedAfter: 0,
          retainedAfterDispose: 0,
        },
      });
      if (result.state === 'AVAILABLE') {
        expect(result.value.perRepetition).toHaveLength(5);
        expect(result.value.perRepetition.every((entry) => entry.retainedAfter === 0)).toBe(true);
        expect(result.value.resourceCounters).toEqual([
          'activeControllers', 'activeDecoders', 'activeFrames', 'activeWriterBuffers',
        ]);
      }
      expect(native.decodedFrames()).toBe(5);
      expect(native.closedFrames()).toBe(5);
      expect(native.activeFrames()).toBe(0);
      expect(native.closedDecoders()).toBe(5);
    } finally {
      native.restore();
    }
  }, 30_000);
});

function sequenceClock(sequence: number[]): () => number {
  let index = 0;
  return () => sequence[Math.min(index++, sequence.length - 1)] ?? 0;
}

function observerEnvironment(
  supportedEntryTypes: readonly string[],
  entries: Array<{ startTime: number; duration: number }>,
): LongTaskObserverEnvironment {
  return {
    supportedEntryTypes,
    create(callback) {
      void callback;
      return {
        observe() {},
        takeRecords: () => entries.splice(0),
        disconnect() {},
      };
    },
  };
}

function component(kind: BundleComponentKind, transferBytes: number): BundleTransferComponent {
  return {
    kind,
    transferBytes,
    files: transferBytes === 0 ? [] : [{ path: `${kind}.bin`, sha256: DIGEST_A, transferBytes }],
    compression: { algorithm: 'gzip', options: { level: 9 } },
  };
}

function measuredBundleRecord(engineId: string): Extract<BundleComponentsRecord, { state: 'MEASURED' }> {
  return {
    state: 'MEASURED',
    engineId,
    engineVersion: '1',
    sourceContentHash: DIGEST_A,
    toolchainContentHash: DIGEST_B,
    components: [
      component('javascript-minified-gzip', 10),
      component('runtime-wasm', 20),
      component('worker', 30),
      component('codec-core', 40),
    ],
    transferTotalBytes: 100,
  };
}

class FakeFrame implements ClosableFrame {
  closeCalls = 0;

  constructor(private readonly onClose?: () => void) {}

  close(): void {
    this.closeCalls += 1;
    this.onClose?.();
  }

  clone(): ClosableFrame {
    return new FakeFrame();
  }
}

interface ProductionBundleArtifact {
  measurements: ProductionBundleMeasurement[];
}

type ProductionBundleMeasurement =
  | { state: 'UNAVAILABLE'; engineId: string }
  | {
      state: 'MEASURED';
      engineId: string;
      compressedBytes: number;
      transferTotalBytes: number;
      excludedRuntimeAssets: string[];
      components: Array<{
        kind: BundleComponentKind;
        transferBytes: number;
        files: Array<{ path: string; transferBytes: number }>;
      }>;
    };

async function runCommand(command: string[]): Promise<void> {
  const process = Bun.spawn({
    cmd: command,
    cwd: ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`${command.join(' ')} failed (${exitCode})\n${stdout}\n${stderr}`);
  }
}

function installNativeDecodeHarness(): {
  activeFrames(): number;
  decodedFrames(): number;
  closedFrames(): number;
  closedDecoders(): number;
  restore(): void;
} {
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const key of ['VideoDecoder', 'EncodedVideoChunk', 'VideoFrame', 'ImageData']) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }
  let activeFrames = 0;
  let decodedFrames = 0;
  let closedFrames = 0;
  let closedDecoders = 0;

  class VideoFrameMock {
    readonly codedWidth = 1;
    readonly codedHeight = 1;
    readonly displayWidth = 1;
    readonly displayHeight = 1;
    readonly visibleRect = { x: 0, y: 0, width: 1, height: 1 };
    private closed = false;

    constructor(readonly timestamp: number) {
      activeFrames++;
      decodedFrames++;
    }

    async copyTo(destination: Uint8Array): Promise<void> {
      destination.set([10, 20, 30, 255]);
    }

    close(): void {
      if (this.closed) return;
      this.closed = true;
      activeFrames--;
      closedFrames++;
    }
  }

  class EncodedVideoChunkMock {
    readonly timestamp: number;

    constructor(init: { timestamp: number }) {
      this.timestamp = init.timestamp;
    }
  }

  class VideoDecoderMock {
    static async isConfigSupported(config: VideoDecoderConfig): Promise<VideoDecoderSupport> {
      return { supported: true, config };
    }

    state: CodecState = 'unconfigured';
    decodeQueueSize = 0;
    private closed = false;

    constructor(private readonly init: VideoDecoderInit) {}

    configure(): void {
      this.state = 'configured';
    }

    decode(chunk: EncodedVideoChunkMock): void {
      this.init.output(new VideoFrameMock(chunk.timestamp) as unknown as VideoFrame);
    }

    async flush(): Promise<void> {}

    close(): void {
      if (this.closed) return;
      this.closed = true;
      this.state = 'closed';
      closedDecoders++;
    }

    addEventListener(): void {}
    removeEventListener(): void {}
  }

  class ImageDataMock {
    constructor(
      readonly data: Uint8ClampedArray,
      readonly width: number,
      readonly height: number,
    ) {}
  }

  for (const [key, value] of Object.entries({
    VideoDecoder: VideoDecoderMock,
    EncodedVideoChunk: EncodedVideoChunkMock,
    VideoFrame: VideoFrameMock,
    ImageData: ImageDataMock,
  })) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }

  return {
    activeFrames: () => activeFrames,
    decodedFrames: () => decodedFrames,
    closedFrames: () => closedFrames,
    closedDecoders: () => closedDecoders,
    restore: () => {
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

function installDecodeLibrary(engine: RemotionWebcodecsEngine): void {
  const videoTrack = {
    type: 'video',
    trackId: 1,
    codecEnum: 'h264',
    codec: 'avc1.640028',
    codedWidth: 1,
    codedHeight: 1,
    width: 1,
    height: 1,
    fps: 30,
    colorSpace: {},
    description: new Uint8Array([1, 100, 0, 40]),
  };
  const parseMedia = async (options: {
    onVideoTrack?: (event: { track: typeof videoTrack }) => unknown;
  }): Promise<unknown> => {
    if (options.onVideoTrack) {
      const consume = await options.onVideoTrack({ track: videoTrack });
      if (typeof consume === 'function') {
        await consume({
          type: 'key',
          timestamp: 0,
          duration: 33_333,
          data: new Uint8Array([0, 0, 0, 1, 0x65]),
        });
      }
    }
    return {
      container: 'mp4',
      durationInSeconds: 1,
      fps: 30,
      tracks: [videoTrack],
      metadata: [],
    };
  };
  (engine as unknown as { lib: unknown }).lib = {
    wc: { webcodecsController: () => ({ abort: () => undefined }) },
    bufferWriter: {},
    mp: {
      mediaParserController: () => ({ abort: () => undefined, seek: () => undefined }),
      parseMedia,
    },
    webReader: () => undefined,
  };
}
