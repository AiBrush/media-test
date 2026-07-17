import { describe, expect, test } from 'bun:test';
import { FfmpegFsLedger } from '../src/engines/ffmpeg-wasm/evidence.ts';
import {
  FfmpegLifecycleGate,
  FfmpegWorkerStateError,
} from '../src/engines/ffmpeg-wasm/lifecycle.ts';

describe('REQ-ENG-15: single-flight and race-safe ffmpeg lifecycle', () => {
  test('shares one in-flight load among every waiter', async () => {
    const gate = new FfmpegLifecycleGate();
    const load = deferred<void>();
    let calls = 0;
    const loader = async (): Promise<void> => {
      calls++;
      return load.promise;
    };
    const signal = new AbortController().signal;
    const first = gate.init(signal, loader);
    const second = gate.init(signal, loader);
    await tick();
    expect(calls).toBe(1);
    expect(gate.state).toBe('loading');
    load.resolve();
    await Promise.all([first, second]);
    expect(gate.state).toBe('ready');
  });

  test('serializes whole operations and never interleaves one shared FS/worker', async () => {
    const gate = await readyGate();
    const firstDone = deferred<void>();
    const order: string[] = [];
    const signal = new AbortController().signal;
    const first = gate.operation(signal, async () => {
      order.push('first:start');
      await firstDone.promise;
      order.push('first:end');
      return 1;
    });
    const second = gate.operation(signal, async () => {
      order.push('second:start');
      order.push('second:end');
      return 2;
    });
    await tick();
    expect(order).toEqual(['first:start']);
    firstDone.resolve();
    expect(await Promise.all([first, second])).toEqual([1, 2]);
    expect(order).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
    expect(gate.state).toBe('ready');
  });

  test('a queued caller can cancel without deadlocking the next queue slot', async () => {
    const gate = await readyGate();
    const activeDone = deferred<void>();
    const active = gate.operation(new AbortController().signal, async () => activeDone.promise);
    const queuedAbort = new AbortController();
    const queued = gate.operation(queuedAbort.signal, async () => 'never');
    queuedAbort.abort(new Error('queued cancel'));
    await expect(queued).rejects.toThrow('queued cancel');
    activeDone.resolve();
    await active;
    await expect(gate.operation(new AbortController().signal, async () => 'next')).resolves.toBe('next');
  });

  test('retries a failed load with a genuinely fresh load attempt', async () => {
    const gate = new FfmpegLifecycleGate();
    let attempts = 0;
    const signal = new AbortController().signal;
    await expect(gate.init(signal, async () => {
      attempts++;
      throw new Error('load failed');
    })).rejects.toThrow('load failed');
    expect(gate.state).toBe('idle');
    await gate.init(signal, async () => { attempts++; });
    expect(attempts).toBe(2);
    expect(gate.state).toBe('ready');
  });

  test('dispose during load aborts the loader, terminates once, and settles every waiter', async () => {
    const gate = new FfmpegLifecycleGate();
    let terminations = 0;
    gate.setTerminator(() => { terminations++; });
    const loader = (signal: AbortSignal): Promise<void> => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
    const signal = new AbortController().signal;
    const first = gate.init(signal, loader);
    const second = gate.init(signal, loader);
    await tick();
    await gate.dispose();
    const settled = await Promise.allSettled([first, second]);
    expect(settled.map((item) => item.status)).toEqual(['rejected', 'rejected']);
    expect(terminations).toBe(1);
    expect(gate.state).toBe('disposed');
  });

  test('active cancellation terminates the generation and returns a distinct broken-worker error', async () => {
    const gate = await readyGate();
    const controller = new AbortController();
    let rejectRun!: (error: Error) => void;
    let terminations = 0;
    gate.setTerminator(() => {
      terminations++;
      rejectRun(new Error('underlying worker terminated'));
    });
    const running = gate.operation(controller.signal, () => new Promise<never>((_, reject) => {
      rejectRun = reject;
    }));
    await tick();
    controller.abort(new Error('cancel requested'));
    await expect(running).rejects.toMatchObject({
      name: 'FfmpegWorkerStateError', reasonCode: 'FFMPEG_WORKER_CANCELLED',
    });
    expect(terminations).toBe(1);
    expect(gate.state).toBe('broken');
  });

  test('timeout/termination is terminal until an explicit fresh init succeeds', async () => {
    const gate = await readyGate();
    const timeout = gate.breakWorker('FFMPEG_WORKER_TIMEOUT', 'worker exceeded deadline');
    expect(timeout).toBeInstanceOf(FfmpegWorkerStateError);
    await expect(gate.operation(new AbortController().signal, async () => undefined)).rejects.toMatchObject({
      reasonCode: 'FFMPEG_WORKER_TIMEOUT',
    });
    let reloads = 0;
    await gate.init(new AbortController().signal, async () => { reloads++; });
    expect(reloads).toBe(1);
    expect(gate.state).toBe('ready');
  });

  test('disposed and pre-aborted instances reject deterministically', async () => {
    const preAborted = new AbortController();
    preAborted.abort(new Error('already cancelled'));
    const gate = new FfmpegLifecycleGate();
    await expect(gate.init(preAborted.signal, async () => undefined)).rejects.toThrow('already cancelled');
    await gate.dispose();
    await expect(gate.init(new AbortController().signal, async () => undefined)).rejects.toMatchObject({
      reasonCode: 'FFMPEG_INSTANCE_DISPOSED',
    });
  });
});

describe('REQ-ENG-16: deterministic FFmpeg FS/memory accounting', () => {
  test('accounts MEMFS, WORKERFS, JS copies, working buffers, and peak independently', () => {
    const ledger = new FfmpegFsLedger();
    ledger.add('/input', 100, 'WORKERFS');
    ledger.add('/output', 40, 'MEMFS');
    ledger.addJsCopy(20);
    ledger.setWrapperHeapEstimate(10);
    ledger.setWorkingEstimate(60);
    expect(ledger.snapshot()).toEqual({
      memfsBytes: 40,
      workerFsBytes: 100,
      jsCopyBytes: 20,
      wrapperHeapBytes: 10,
      workingBytes: 60,
      estimatedPeakBytes: 230,
      livePaths: ['/input', '/output'],
    });
    ledger.remove('/input');
    ledger.remove('/output');
    ledger.releaseJsCopy(20);
    ledger.setWrapperHeapEstimate(0);
    ledger.setWorkingEstimate(0);
    expect(ledger.snapshot()).toEqual({
      memfsBytes: 0,
      workerFsBytes: 0,
      jsCopyBytes: 0,
      wrapperHeapBytes: 0,
      workingBytes: 0,
      estimatedPeakBytes: 230,
      livePaths: [],
    });
    expect(() => ledger.assertEmpty()).not.toThrow();
  });

  test('exposes leaks after any terminal path and reset clears the next worker generation', () => {
    const ledger = new FfmpegFsLedger();
    for (const terminal of ['success', 'na', 'failure', 'timeout', 'cancel', 'partial-hls']) {
      ledger.reset();
      ledger.add(`/${terminal}.scratch`, 1, 'MEMFS');
      expect(() => ledger.assertEmpty(), terminal).toThrow(terminal);
      ledger.remove(`/${terminal}.scratch`);
      expect(() => ledger.assertEmpty(), terminal).not.toThrow();
    }
    ledger.add('/old-generation', 99, 'WORKERFS');
    ledger.reset();
    expect(ledger.snapshot().livePaths).toEqual([]);
    expect(ledger.snapshot().estimatedPeakBytes).toBe(0);
  });

  test('rejects impossible accounting values rather than corrupting provenance', () => {
    const ledger = new FfmpegFsLedger();
    expect(() => ledger.add('/bad', -1, 'MEMFS')).toThrow('non-negative safe integer');
    expect(() => ledger.addJsCopy(Number.POSITIVE_INFINITY)).toThrow('non-negative safe integer');
  });
});

async function readyGate(): Promise<FfmpegLifecycleGate> {
  const gate = new FfmpegLifecycleGate();
  await gate.init(new AbortController().signal, async () => undefined);
  return gate;
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function tick(): Promise<void> {
  await new Promise<void>((resolve) => queueMicrotask(resolve));
}
