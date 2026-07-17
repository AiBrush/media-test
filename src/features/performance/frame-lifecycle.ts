/** Explicit ownership helpers and the repeated-decode retained-resource acceptance check. */

import {
  CONCRETE_OPERATION_PROTOCOL,
  SUPPORTED_CHECKED_SUPPORT_SNAPSHOT,
  type DecodeOptions,
  type EngineFactory,
  type FrameSink,
  type MediaEngine,
  type MediaInput,
  type NormalizedTrack,
  type OperationContext,
} from '../../core/engine.ts';
import type { Scenario } from '../../core/scenario.ts';
import { available, unavailable, type PerformanceEvidence } from './contracts.ts';

export interface ClosableFrame {
  close(): void;
  clone?(): ClosableFrame;
}

interface OwnedState {
  closed: boolean;
  closeCalls: number;
}

/** Instruments transfer-like frame ownership and rejects double-close or unregistered resources. */
export class FrameOwnershipLedger {
  private readonly states = new Map<ClosableFrame, OwnedState>();
  private acquiredCount = 0;
  private closedCount = 0;

  acquire<T extends ClosableFrame>(frame: T): T {
    if (this.states.has(frame)) throw new Error('[FRAME_OWNERSHIP_DUPLICATE] frame is already owned by this ledger');
    this.states.set(frame, { closed: false, closeCalls: 0 });
    this.acquiredCount += 1;
    return frame;
  }

  cloneOwned<T extends ClosableFrame>(frame: T): ClosableFrame {
    const state = this.states.get(frame);
    if (!state || state.closed) throw new Error('[FRAME_CLONE_AFTER_RELEASE] source frame is not actively owned');
    if (typeof frame.clone !== 'function') throw new Error('[FRAME_CLONE_UNSUPPORTED] retained async consumers must clone explicitly');
    return this.acquire(frame.clone());
  }

  release(frame: ClosableFrame): void {
    const state = this.states.get(frame);
    if (!state) throw new Error('[FRAME_RELEASE_UNOWNED] frame was not acquired by this ledger');
    if (state.closed) throw new Error('[FRAME_DOUBLE_CLOSE] frame ownership was already released');
    state.closed = true;
    state.closeCalls += 1;
    try {
      frame.close();
    } finally {
      this.closedCount += 1;
    }
  }

  releaseAll(): void {
    const errors: unknown[] = [];
    for (const [frame, state] of this.states) {
      if (state.closed) continue;
      try {
        this.release(frame);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, '[FRAME_CLOSE_FAILED] one or more owned frames failed to close');
  }

  snapshot(): FrameOwnershipSnapshot {
    const active = [...this.states.values()].filter((state) => !state.closed).length;
    return {
      acquired: this.acquiredCount,
      closed: this.closedCount,
      active,
      exactlyOnce: [...this.states.values()].every((state) => state.closed && state.closeCalls === 1),
    };
  }
}

export interface FrameOwnershipSnapshot {
  acquired: number;
  closed: number;
  active: number;
  exactlyOnce: boolean;
}

/** Copy/digest frames while owned, then close every frame on success or any consumer exception. */
export async function consumeOwnedFrames<T extends ClosableFrame, R>(
  frames: readonly T[],
  consumer: (frame: T, index: number, ledger: FrameOwnershipLedger) => Promise<R> | R,
): Promise<{ values: R[]; ownership: FrameOwnershipSnapshot }> {
  const ledger = new FrameOwnershipLedger();
  for (const frame of frames) ledger.acquire(frame);
  const values: R[] = [];
  let operationError: unknown;
  try {
    for (let index = 0; index < frames.length; index++) {
      values.push(await consumer(frames[index]!, index, ledger));
    }
  } catch (error) {
    operationError = error;
  }
  try {
    ledger.releaseAll();
  } catch (closeError) {
    if (operationError !== undefined) {
      throw new AggregateError([operationError, closeError], '[FRAME_CONSUME_AND_CLOSE_FAILED]');
    }
    throw closeError;
  }
  if (operationError !== undefined) throw operationError;
  return { values, ownership: ledger.snapshot() };
}

export interface RepeatedDecodeLeakEvidence {
  repetitions: number;
  decodedFrames: number;
  closedFrames: number;
  retainedBaseline: number;
  retainedAfter: number;
  perRepetition: Array<{
    iteration: number;
    decoded: number;
    closed: number;
    retainedAfter: number;
  }>;
}

/**
 * Repeatedly decode/copy/digest/close frames and prove the retained resource count returns to the
 * same baseline after every repetition. The decoder supplies owned frames; this function consumes
 * that ownership exactly once.
 */
export async function repeatedDecodeLeakCheck<T extends ClosableFrame>(options: {
  repetitions?: number;
  decode: (iteration: number) => Promise<readonly T[]>;
  inspect?: (frame: T, frameIndex: number, iteration: number) => Promise<unknown> | unknown;
  retainedResourceCount?: () => number | Promise<number>;
}): Promise<PerformanceEvidence<RepeatedDecodeLeakEvidence>> {
  const repetitions = options.repetitions ?? 5;
  if (!Number.isSafeInteger(repetitions) || repetitions < 2) {
    return unavailable('ERROR', 'LEAK_CHECK_REPETITIONS_INVALID', 'repeated decode leak checks require at least two repetitions');
  }
  const retainedCount = options.retainedResourceCount ?? (() => 0);
  const baseline = await retainedCount();
  if (!Number.isSafeInteger(baseline) || baseline < 0) {
    return unavailable('ERROR', 'LEAK_BASELINE_INVALID', 'retained resource baseline must be a non-negative safe integer');
  }
  let decodedFrames = 0;
  let closedFrames = 0;
  const perRepetition: RepeatedDecodeLeakEvidence['perRepetition'] = [];
  for (let iteration = 0; iteration < repetitions; iteration++) {
    try {
      const frames = await options.decode(iteration);
      const consumed = await consumeOwnedFrames(frames, async (frame, frameIndex) => {
        await options.inspect?.(frame, frameIndex, iteration);
      });
      decodedFrames += frames.length;
      closedFrames += consumed.ownership.closed;
      if (!consumed.ownership.exactlyOnce || consumed.ownership.active !== 0) {
        return unavailable('ERROR', 'FRAME_OWNERSHIP_NOT_CLOSED', `iteration ${iteration} did not close every owned frame exactly once`);
      }
      const retainedAfter = await retainedCount();
      if (!Number.isSafeInteger(retainedAfter) || retainedAfter < 0) {
        return unavailable('ERROR', 'LEAK_RETAINED_COUNT_INVALID', `iteration ${iteration} returned an invalid retained count`);
      }
      perRepetition.push({
        iteration,
        decoded: frames.length,
        closed: consumed.ownership.closed,
        retainedAfter,
      });
      if (retainedAfter !== baseline) {
        return unavailable(
          'ERROR',
          'REPEATED_DECODE_RESOURCE_LEAK',
          `iteration ${iteration} retained ${retainedAfter} resources; baseline is ${baseline}`,
        );
      }
    } catch (error) {
      return unavailable(
        'ERROR',
        'REPEATED_DECODE_CHECK_ERROR',
        `iteration ${iteration}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  const retainedAfter = await retainedCount();
  return available({
    repetitions,
    decodedFrames,
    closedFrames,
    retainedBaseline: baseline,
    retainedAfter,
    perRepetition,
  });
}

export interface AdapterDecodeLeakEvidence {
  engineId: string;
  scenarioId: string;
  repetitions: number;
  adapterManagedFrames: number;
  retainedBaseline: number;
  retainedAfter: number;
  retainedAfterDispose: number;
  resourceCounters: string[];
  perRepetition: Array<{
    iteration: number;
    adapterManagedFrames: number;
    retainedAfter: number;
  }>;
}

interface AdapterResourceSnapshot {
  total: number;
  counters: string[];
}

/**
 * Exercise the production MediaEngine decode boundary repeatedly and verify adapter-owned resources
 * return to their initialized baseline. Unlike `repeatedDecodeLeakCheck`, this path never accepts a
 * caller-supplied list of fake frames: the registered scenario options are sent through the real
 * adapter method and the adapter's public `configUsed.active*` counters are sampled after every run.
 * Native VideoFrames remain adapter-owned and must already be closed before its FrameSink resolves.
 */
export async function repeatedScenarioDecodeLeakCheck(options: {
  engineFactory: EngineFactory;
  scenario: Scenario;
  input: MediaInput;
  inputTracks?: readonly NormalizedTrack[];
  repetitions?: number;
  inspect?: (sink: FrameSink, iteration: number) => Promise<unknown> | unknown;
}): Promise<PerformanceEvidence<AdapterDecodeLeakEvidence>> {
  const repetitions = options.repetitions ?? 5;
  if (options.scenario.op !== 'decodeFrames') {
    return unavailable(
      'ERROR',
      'LEAK_CHECK_SCENARIO_OPERATION_INVALID',
      `scenario '${options.scenario.id}' uses '${options.scenario.op}', expected 'decodeFrames'`,
    );
  }
  if (!Number.isSafeInteger(repetitions) || repetitions < 2) {
    return unavailable('ERROR', 'LEAK_CHECK_REPETITIONS_INVALID', 'repeated decode leak checks require at least two repetitions');
  }

  let engine: MediaEngine;
  try {
    engine = await options.engineFactory();
  } catch (error) {
    return unavailable('ERROR', 'REPEATED_DECODE_CHECK_ERROR', `engine construction: ${errorMessage(error)}`);
  }

  const abort = new AbortController();
  const lifecycle = (phase: OperationContext['phase']): Omit<OperationContext, 'request'> => ({
    signal: abort.signal,
    phase,
    emit: () => undefined,
    checkedSupport: SUPPORTED_CHECKED_SUPPORT_SNAPSHOT,
  });
  let lifecycleStarted = false;
  let outcome: PerformanceEvidence<AdapterDecodeLeakEvidence> | undefined;
  let retainedAfterDispose = 0;

  try {
    lifecycleStarted = true;
    await engine.init?.(lifecycle('support'));
    const baseline = adapterResourceSnapshot(engine);
    if (!baseline) {
      outcome = unavailable(
        'NA_ENGINE',
        'ADAPTER_RESOURCE_COUNTERS_UNAVAILABLE',
        `${engine.id} does not expose numeric configUsed.active* resource counters`,
      );
    } else {
      let adapterManagedFrames = 0;
      const perRepetition: AdapterDecodeLeakEvidence['perRepetition'] = [];
      const request = concreteDecodeRequest(options.scenario, options.input, options.inputTracks);
      const support = await engine.supports?.(request, lifecycle('support'));
      if (support?.supported === false) {
        outcome = unavailable(support.status, support.reasonCode, support.reason);
      }
      for (let iteration = 0; iteration < repetitions; iteration++) {
        if (outcome) break;
        let sink: FrameSink;
        try {
          sink = await engine.decodeFrames(
            options.input,
            cloneDecodeOptions(options.scenario.options),
            {
              ...lifecycle('functional'),
              request,
              operationStartMs: monotonicNow(),
            },
          );
          if (options.inspect) {
            await options.inspect(sink, iteration);
          } else if (sink.getPixels) {
            for (let frameIndex = 0; frameIndex < sink.frames.length; frameIndex++) {
              await sink.getPixels(frameIndex);
            }
          }
        } catch (error) {
          outcome = unavailable(
            'ERROR',
            'REPEATED_DECODE_CHECK_ERROR',
            `iteration ${iteration}: ${errorMessage(error)}`,
          );
          break;
        }

        adapterManagedFrames += sink.frames.length;
        const retained = adapterResourceSnapshot(engine);
        if (!retained || retained.counters.join('\u0000') !== baseline.counters.join('\u0000')) {
          outcome = unavailable(
            'ERROR',
            'ADAPTER_RESOURCE_COUNTERS_CHANGED',
            `iteration ${iteration}: ${engine.id} changed its configUsed.active* counter surface`,
          );
          break;
        }
        perRepetition.push({
          iteration,
          adapterManagedFrames: sink.frames.length,
          retainedAfter: retained.total,
        });
        if (retained.total !== baseline.total) {
          outcome = unavailable(
            'ERROR',
            'REPEATED_DECODE_RESOURCE_LEAK',
            `iteration ${iteration} retained ${retained.total} adapter resources; baseline is ${baseline.total}`,
          );
          break;
        }
      }

      if (!outcome) {
        const retained = adapterResourceSnapshot(engine)!;
        outcome = available({
          engineId: engine.id,
          scenarioId: options.scenario.id,
          repetitions,
          adapterManagedFrames,
          retainedBaseline: baseline.total,
          retainedAfter: retained.total,
          retainedAfterDispose: retained.total,
          resourceCounters: baseline.counters,
          perRepetition,
        });
      }
    }
  } catch (error) {
    outcome = unavailable('ERROR', 'REPEATED_DECODE_CHECK_ERROR', errorMessage(error));
  } finally {
    if (lifecycleStarted) {
      try {
        await engine.dispose?.(lifecycle('cleanup'));
        const disposed = adapterResourceSnapshot(engine);
        if (!disposed && outcome?.state === 'AVAILABLE') {
          outcome = unavailable(
            'ERROR',
            'ADAPTER_RESOURCE_COUNTERS_CHANGED',
            `${engine.id} stopped exposing configUsed.active* counters after disposal`,
          );
        } else {
          retainedAfterDispose = disposed?.total ?? 0;
        }
      } catch (error) {
        outcome = unavailable('ERROR', 'REPEATED_DECODE_DISPOSE_ERROR', errorMessage(error));
      }
    }
  }

  if (!outcome) {
    return unavailable('ERROR', 'REPEATED_DECODE_CHECK_ERROR', 'decode leak check produced no evidence');
  }
  if (outcome.state === 'AVAILABLE') {
    outcome.value.retainedAfterDispose = retainedAfterDispose;
    if (retainedAfterDispose !== 0) {
      return unavailable(
        'ERROR',
        'REPEATED_DECODE_RESOURCE_LEAK',
        `dispose retained ${retainedAfterDispose} adapter resources; expected zero after lifecycle cleanup`,
      );
    }
  }
  return outcome;
}

function adapterResourceSnapshot(engine: MediaEngine): AdapterResourceSnapshot | undefined {
  const config = engine.configUsed;
  if (!config || typeof config !== 'object') return undefined;
  const entries = Object.entries(config)
    .filter(([key, value]) => /^active[A-Z]/.test(key) && Number.isSafeInteger(value) && (value as number) >= 0)
    .sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return undefined;
  return {
    total: entries.reduce((sum, [, value]) => sum + (value as number), 0),
    counters: entries.map(([key]) => key),
  };
}

function concreteDecodeRequest(
  scenario: Scenario,
  input: MediaInput,
  tracks: readonly NormalizedTrack[] | undefined,
): OperationContext['request'] {
  const inputTracks = tracks?.map((track) => ({ ...track })) ?? [
    ...(scenario.requires.videoCodecsIn ?? scenario.requires.videoCodecs ?? []).map((codec) => ({
      type: 'video' as const,
      codec,
    })),
    ...(scenario.requires.audioCodecsIn ?? scenario.requires.audioCodecs ?? []).map((codec) => ({
      type: 'audio' as const,
      codec,
    })),
  ];
  return {
    protocol: CONCRETE_OPERATION_PROTOCOL,
    scenarioId: scenario.id,
    operation: 'decodeFrames',
    inputs: [{
      id: input.id,
      mime: input.mime,
      container: inputContainer(input),
      ...(input.sizeBytes !== undefined ? { sizeBytes: input.sizeBytes } : {}),
      mutated: input.mutated === true,
      sourceEvidence: inputTracks.length > 0 ? 'RESOLVED' : 'UNRESOLVED',
      tracks: inputTracks,
    }],
    options: { ...cloneDecodeOptions(scenario.options) },
  };
}

function cloneDecodeOptions(options: Scenario['options']): DecodeOptions {
  const source = options && typeof options === 'object' ? options : {};
  return structuredClone(source) as DecodeOptions;
}

function inputContainer(input: MediaInput): string {
  const mime = input.mime.toLowerCase();
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('matroska')) return 'mkv';
  if (mime.includes('quicktime')) return 'mov';
  if (mime.includes('mpegurl')) return 'hls';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('wave') || mime.includes('wav')) return 'wav';
  const extension = input.id.toLowerCase().match(/\.([a-z0-9]+)(?:$|\?)/)?.[1] ?? '';
  if (extension === 'm4a' || extension === 'm4v') return 'mp4';
  if (extension === 'm3u8') return 'hls';
  if (extension === 'aac') return 'adts';
  return extension;
}

function monotonicNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
