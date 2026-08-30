import { afterEach, describe, expect, test } from 'bun:test';
import { $ } from 'bun';
import {
  AdapterContractError,
  AdapterLifecycleController,
  ConfigUsedSnapshots,
  OperationTelemetryCollector,
  ResourceOwnershipTracker,
  assertRepeatableNormalizedObservations,
  captureConfigUsedSnapshot,
  createBrowserNotSupportedError,
  createNotApplicableError,
  validateAdapterConformanceSurface,
  validateAdapterFactory,
  validateOperationTelemetry,
  type AdapterConfigProfile,
  type ConcreteOperationRequest,
  type LifecycleContext,
  type MediaEngine,
  type Operation,
  type OperationContext,
  type OperationFinalCounters,
  type OperationTelemetry,
} from '../src/core/engine.ts';
import { __resetRegistry, getEngine } from '../src/core/registry.ts';
import { TemplateEngine } from '../src/engines/_template/adapter.ts';

const ENGINE_ID = 'conformance-fake@1.2.3';

afterEach(() => __resetRegistry());

describe('REQ-ADP-06: normative serial lifecycle', () => {
  test('init/dispose are idempotent, operations are serial/reset, and pre/post misuse is rejected', async () => {
    const controller = new AdapterLifecycleController(ENGINE_ID);
    const context = operationContext('probe');
    let setups = 0;
    let cleanups = 0;
    let resets = 0;

    await expect(controller.operation('probe', context, () => 'never')).rejects.toMatchObject({
      reasonCode: 'ADAPTER_LIFECYCLE_MISUSE',
    });
    await Promise.all([
      controller.init(context, () => { setups++; }),
      controller.init(context, () => { setups++; }),
    ]);
    expect(setups).toBe(1);

    const first = await controller.operation('probe', context, () => ({ container: 'mp4', durationSec: 1 }), () => { resets++; });
    const second = await controller.operation('probe', context, () => ({ container: 'mp4', durationSec: 1 }), () => { resets++; });
    expect(first).toEqual(second);
    expect(resets).toBe(4);
    await expect(
      controller.operation('probe', operationContext('probe', new AbortController().signal), () => 'never'),
    ).rejects.toMatchObject({ reasonCode: 'ADAPTER_SIGNAL_IDENTITY_MISMATCH' });

    await Promise.all([
      controller.dispose(context, () => { cleanups++; }),
      controller.dispose(context, () => { cleanups++; }),
    ]);
    expect(cleanups).toBe(1);
    expect(controller.state).toBe('disposed');
    await expect(controller.operation('probe', context, () => 'never')).rejects.toMatchObject({
      reasonCode: 'ADAPTER_LIFECYCLE_MISUSE',
    });
  });

  test('cleanup rejection is diagnostic and does not replace prior semantic output', async () => {
    const controller = new AdapterLifecycleController(ENGINE_ID);
    const context = operationContext('probe');
    await controller.init(context, () => undefined);
    const semantic = await controller.operation('probe', context, () => 'PASS');
    const diagnostics = await controller.dispose(context, () => { throw new Error('cleanup failed'); });
    expect(semantic).toBe('PASS');
    expect(diagnostics).toEqual([{ resource: 'adapter.dispose', reason: 'Error: cleanup failed' }]);
  });
});

describe('REQ-ADP-07/08: cancellation and native ownership', () => {
  test('never-resolving work observes abort, closes once, and stops telemetry before the deadline', async () => {
    const abort = new AbortController();
    const context = operationContext('transcode', abort.signal);
    const controller = new AdapterLifecycleController(ENGINE_ID);
    const resources = new ResourceOwnershipTracker(ENGINE_ID);
    const telemetry = new OperationTelemetryCollector(ENGINE_ID, abort.signal);
    let closeCount = 0;
    const codec = resources.own({ close: () => { closeCount++; } }, 'video-codec');
    void codec;
    resources.bindAbort(abort.signal);
    await controller.init(context, () => undefined);
    telemetry.emit({ type: 'progress', atMs: 0, determinate: true, value: 0 });

    const operation = controller.operation('transcode', context, () => new Promise<never>((_resolve, reject) => {
      abort.signal.addEventListener('abort', () => reject(abort.signal.reason), { once: true });
    }));
    abort.abort(new DOMException('timed out', 'AbortError'));

    await expect(Promise.race([
      operation,
      new Promise((_, reject) => setTimeout(() => reject(new Error('cleanup deadline exceeded')), 250)),
    ])).rejects.toHaveProperty('name', 'AbortError');
    await resources.waitForAbortCleanup();
    expect(closeCount).toBe(1);
    expect(resources.activeCount).toBe(0);
    expect(() => telemetry.emit({ type: 'progress', atMs: 1, determinate: true, value: 1 })).toThrow(AdapterContractError);
    expect(telemetry.close({ progress: 0 })).toHaveLength(1);
    await resources.disposeAll();
    expect(closeCount).toBe(1);
  });

  for (const exit of ['success', 'throw', 'NA_ENGINE', 'NA_BROWSER', 'timeout', 'abort', 'partial-output'] as const) {
    test(`closes every owned frame/codec/worker exactly once on ${exit}`, async () => {
      const tracker = new ResourceOwnershipTracker(`${ENGINE_ID}/${exit}`);
      const counts = { frame: 0, codec: 0, worker: 0 };
      tracker.own({ close: () => { counts.frame++; } }, 'frame');
      tracker.own({ close: () => { counts.codec++; } }, 'codec');
      tracker.own({ terminate: () => { counts.worker++; } }, 'worker');
      if (exit === 'NA_ENGINE') createNotApplicableError(ENGINE_ID, 'transcode', 'tuple unsupported');
      if (exit === 'NA_BROWSER') createBrowserNotSupportedError(ENGINE_ID, 'transcode', 'browser unsupported');
      if (exit === 'abort') {
        const abort = new AbortController();
        tracker.bindAbort(abort.signal);
        abort.abort();
        await tracker.waitForAbortCleanup();
      } else {
        await tracker.disposeAll();
      }
      await tracker.disposeAll();
      tracker.assertNoLeaks();
      expect(counts).toEqual({ frame: 1, codec: 1, worker: 1 });
      expect(tracker.closeCounts).toEqual({ frame: 1, codec: 1, worker: 1 });
    });
  }
});

describe('REQ-ADP-10: typed telemetry stream', () => {
  test('accepts monotonic events whose final counters exactly match', () => {
    const events: OperationTelemetry[] = [
      { type: 'progress', atMs: 0, determinate: true, value: 0 },
      { type: 'bytes-read', atMs: 1, bytes: 10 },
      { type: 'first-byte', atMs: 2 },
      { type: 'bytes-written', atMs: 2, bytes: 4 },
      { type: 'write-count', atMs: 3, count: 1 },
      { type: 'decoded-frame-count', atMs: 4, count: 1 },
      { type: 'encoded-frame-count', atMs: 5, count: 1 },
      { type: 'first-frame', atMs: 5 },
      { type: 'framework-fallback', atMs: 6, from: 'hardware', to: 'software', reasonCode: 'HW_BUSY', reason: 'hardware queue busy' },
      { type: 'progress', atMs: 7, determinate: true, value: 1 },
    ];
    const final: OperationFinalCounters = {
      progress: 1,
      bytesRead: 10,
      bytesWritten: 4,
      writeCount: 1,
      decodedFrames: 1,
      encodedFrames: 1,
      firstByteMs: 2,
      firstFrameMs: 5,
      fallback: { from: 'hardware', to: 'software', reasonCode: 'HW_BUSY', reason: 'hardware queue busy' },
    };
    expect(validateOperationTelemetry(ENGINE_ID, events, final)).toBe(events);
  });

  test('rejects regressing timestamps/progress/counters and mismatched finals at exact fields', () => {
    expectTelemetryPath([
      { type: 'bytes-read', atMs: 2, bytes: 2 },
      { type: 'bytes-read', atMs: 1, bytes: 3 },
    ], undefined, 'telemetry.events[1].atMs');
    expectTelemetryPath([
      { type: 'progress', atMs: 0, determinate: true, value: 0.8 },
      { type: 'progress', atMs: 1, determinate: true, value: 0.7 },
    ], undefined, 'telemetry.events[1].value');
    expectTelemetryPath(
      [{ type: 'bytes-written', atMs: 0, bytes: 4 }],
      { bytesWritten: 3 },
      'telemetry.final.bytesWritten',
    );
  });
});

describe('REQ-ADP-11: immutable config snapshots', () => {
  test('captures functional/measured phases before cleanup and resists source mutation', () => {
    const source = configProfile();
    const snapshots = new ConfigUsedSnapshots(ENGINE_ID);
    const functional = snapshots.capture('functional', source, true);
    source.backend = 'mutated-after-capture';
    const measured = snapshots.capture('measured', { ...source, backend: 'software' }, true);
    expect(functional.backend).toBe('webcodecs');
    expect(measured.backend).toBe('software');
    expect(Object.isFrozen(functional)).toBe(true);
    expect(() => { (functional as Record<string, unknown>).backend = 'illegal'; }).toThrow();
    expect(snapshots.toJSON()).toEqual({ functional, measured });
  });

  for (const [name, value, path] of [
    ['function', { ...configProfile(), bad: () => undefined }, 'configUsed.bad'],
    ['promise', { ...configProfile(), bad: Promise.resolve() }, 'configUsed.bad'],
    ['native object', { ...configProfile(), bad: new Uint8Array([1]) }, 'configUsed.bad'],
    ['non-finite', { ...configProfile(), bad: Infinity }, 'configUsed.bad'],
  ] as const) {
    test(`rejects ${name} config values`, () => {
      expectConfigPath(value, path);
    });
  }

  test('rejects cyclic config values', () => {
    const value = configProfile() as AdapterConfigProfile & { cycle?: unknown };
    value.cycle = value;
    expectConfigPath(value, 'configUsed.cycle');
  });
});

describe('REQ-ADP-12: repeatable normalized observations', () => {
  test('fresh instances produce identical canonical ordering and applicability meanings', async () => {
    const [first, second] = await validateAdapterFactory(() => new TemplateEngine());
    expect(first).not.toBe(second);
    assertRepeatableNormalizedObservations(first.id, {
      metadata: { container: 'mp4', durationSec: 1, tracks: [{ type: 'video', codec: 'h264' }] },
      packets: [{ trackIndex: 0, size: 4, ptsUs: 0, dtsUs: 0, keyframe: true }],
      applicabilityReasonCode: 'TUPLE_UNSUPPORTED',
      telemetry: { packetCount: 1 },
    }, {
      metadata: { container: 'mp4', durationSec: 1, tracks: [{ type: 'video', codec: 'h264' }] },
      packets: [{ trackIndex: 0, size: 4, ptsUs: 0, dtsUs: 0, keyframe: true }],
      applicabilityReasonCode: 'TUPLE_UNSUPPORTED',
      telemetry: { packetCount: 1 },
    });
  });

  test('encoded bytes may differ only when nondeterminism is explicitly declared', () => {
    expect(() => assertRepeatableNormalizedObservations(ENGINE_ID, {
      encodedBytesSha256: 'a', encoderNondeterministic: false,
    }, {
      encodedBytesSha256: 'b', encoderNondeterministic: false,
    })).toThrow(AdapterContractError);
    expect(() => assertRepeatableNormalizedObservations(ENGINE_ID, {
      encodedBytesSha256: 'a', encoderNondeterministic: true,
    }, {
      encodedBytesSha256: 'b', encoderNondeterministic: true,
    })).not.toThrow();
  });
});

describe('REQ-ADP-09/13: scaffold conformance gate', () => {
  test('clean scaffold passes only all-undeclared baseline; declared ops require all five fixture proofs', () => {
    const template = new TemplateEngine();
    expect(() => validateAdapterConformanceSurface(template)).not.toThrow();

    const declared = new TemplateEngine();
    declared.capabilities = () => ({
      ...template.capabilities(),
      operations: { probe: true },
      containersIn: ['mp4'],
      videoCodecs: ['h264'],
    });
    expect(() => validateAdapterConformanceSurface(declared)).toThrow(AdapterContractError);
    expect(() => validateAdapterConformanceSurface(declared, {
      operations: {
        probe: ['positive', 'negative-tuple', 'lifecycle', 'normalized-result', 'cancellation'],
      },
    })).not.toThrow();
  });

  test('add-engine generates, typechecks, registers, gates, and removes an isolated adapter', async () => {
    const id = `codex-contract-${process.pid}-${Date.now()}`;
    const directory = `${process.cwd()}/src/engines/${id}`;
    const scenarioBefore = await Bun.file('src/core/disabled-cells.ts').text();
    const registryBefore = await Bun.file('src/core/scenario.ts').text();
    try {
      const generated = Bun.spawn(['bash', 'scripts/add-engine.sh', id], { stdout: 'pipe', stderr: 'pipe' });
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(generated.stdout).text(),
        new Response(generated.stderr).text(),
        generated.exited,
      ]);
      expect(stderr).toBe('');
      expect(exitCode).toBe(0);
      expect(stdout.indexOf('REQUIRED PRE-WIRING GATE')).toBeGreaterThan(-1);
      expect(stdout.indexOf('REQUIRED PRE-WIRING GATE')).toBeLessThan(stdout.indexOf('wire the engine'));

      const module = await import(`../src/engines/${id}/adapter.ts?conformance=${Date.now()}`) as Record<string, unknown>;
      const Engine = Object.values(module).find(
        (value): value is new () => MediaEngine =>
          typeof value === 'function' && typeof (value as { prototype?: { capabilities?: unknown } }).prototype?.capabilities === 'function',
      );
      const register = Object.values(module).find(
        (value) => typeof value === 'function' && String((value as { name?: string }).name).startsWith('register'),
      ) as (() => void) | undefined;
      expect(Engine).toBeDefined();
      expect(register).toBeDefined();
      const GeneratedEngine = Engine!;
      await validateAdapterFactory(() => new GeneratedEngine());
      register!();
      const registration = getEngine(`${id}@0.0.0`);
      expect(registration).toBeDefined();
      const one = await registration!.factory();
      const two = await registration!.factory();
      expect(one).not.toBe(two);

      const checked = Bun.spawn(['bun', 'run', 'typecheck'], { stdout: 'pipe', stderr: 'pipe' });
      const [checkOut, checkErr, checkCode] = await Promise.all([
        new Response(checked.stdout).text(),
        new Response(checked.stderr).text(),
        checked.exited,
      ]);
      expect(`${checkOut}${checkErr}`).not.toContain(`${id}/adapter.ts(`);
      expect(checkCode).toBe(0);
    } finally {
      __resetRegistry();
      await $`rm -rf ${directory}`.quiet();
    }
    expect(await Bun.file('src/core/disabled-cells.ts').text()).toBe(scenarioBefore);
    expect(await Bun.file('src/core/scenario.ts').text()).toBe(registryBefore);
  }, 30_000);
});

function operationContext(operation: Operation, signal = new AbortController().signal): OperationContext {
  return {
    signal,
    emit: () => undefined,
    phase: 'functional',
    request: request(operation),
  };
}

function request(operation: Operation): ConcreteOperationRequest {
  return {
    protocol: 'media-browser-test/concrete-operation@1',
    scenarioId: `conformance/${operation}`,
    operation,
    inputs: [],
    options: {},
  };
}

function configProfile(): AdapterConfigProfile {
  return {
    framework: 'fake',
    packageVersions: { fake: '1.2.3' },
    backend: 'webcodecs',
    hardwareAcceleration: 'prefer-hardware',
    workerCount: 1,
    threadCount: 1,
    readerMode: 'stream',
    writerMode: 'stream',
    targetMode: 'buffer',
    codecConfigs: [{ codec: 'avc1.640028', width: 1920, height: 1080 }],
    encoderNondeterministic: false,
  };
}

function expectTelemetryPath(
  events: OperationTelemetry[],
  final: OperationFinalCounters | undefined,
  path: string,
): void {
  try {
    validateOperationTelemetry(ENGINE_ID, events, final);
    throw new Error(`expected telemetry failure at ${path}`);
  } catch (error) {
    expect(error).toBeInstanceOf(AdapterContractError);
    expect((error as AdapterContractError).fieldPath).toBe(path);
  }
}

function expectConfigPath(value: unknown, path: string): void {
  try {
    captureConfigUsedSnapshot(ENGINE_ID, value);
    throw new Error(`expected config failure at ${path}`);
  } catch (error) {
    expect(error).toBeInstanceOf(AdapterContractError);
    expect((error as AdapterContractError).fieldPath).toBe(path);
  }
}
