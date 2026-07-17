/**
 * src/core/measure.ts — in-browser metrics: a per-op {@link Meter}, honest resource windows, and
 * I/O-counting source/target wrappers.
 *
 * Optional browser instruments never manufacture zero: unsupported long-task/memory APIs produce
 * typed availability evidence. A memory endpoint is never relabelled as a peak.
 */

import type { MetricSample } from './scenario.ts';
import {
  available,
  finiteNonNegative,
  unavailable,
  type PerformanceEvidence,
} from '../features/performance/contracts.ts';

export interface MeasureContext {
  /** @deprecated Supply mediaDuration so the denominator basis remains observable. */
  mediaSec?: number;
  mediaDuration?: {
    durationUs: number;
    basis: 'source-presentation' | 'output-presentation' | 'processed-interval';
    policy: string;
  };
  bytesOut?: number;
  sourceReads?: number; // from CountingSource
  targetWrites?: number; // from CountingTarget
  decodedFrames?: number;
  encodedFrames?: number;
  // ── headline-throughput counts (→ per-second rates over the measured wall window) ──
  ops?: number; // completed operations (e.g. repeated probes) -> opsPerSec
  packets?: number; // demuxed packets counted -> packetsPerSec
  frames?: number; // transcoded/converted frames -> framesPerSec
  sampleFrames?: number; // interleaved audio sample-frames (one frame spans all channels)
  seeks?: number; // seeks performed -> seekMs = wall / seeks (mean ms per seek)
  // ── latency markers captured BY THE OP, in ms relative to the measured begin() ──
  firstByteMs?: number; // -> timeToFirstByteMs
  firstFrameMs?: number; // -> timeToFirstFrameMs
  /** Real peak observation produced by measurePeakMemoryWindow(). */
  memoryPeak?: MemoryPeakObservation;
}

/** PerformanceObserver longtask entries are durations in ms; the spec threshold is 50ms. */
export const LONGTASK_THRESHOLD_MS = 50;

export interface LongTaskEntryLike {
  startTime: number;
  duration: number;
}

export interface LongTaskObservation {
  totalDurationMs: number;
  /** Longest single in-window task; zero when the active observer saw no qualifying task. */
  longestDurationMs: number;
  count: number;
  window: { beginMs: number; endMs: number };
  thresholdMs: number;
  observerActive: true;
}

export type LongTaskEvidence =
  | { state: 'NOT_REQUESTED' }
  | PerformanceEvidence<LongTaskObservation>;

interface LongTaskObserverLike {
  observe(options: { type: string; buffered?: boolean }): void;
  takeRecords(): LongTaskEntryLike[];
  disconnect(): void;
}

export interface LongTaskObserverEnvironment {
  supportedEntryTypes?: readonly string[];
  create(callback: (entries: readonly LongTaskEntryLike[]) => void): LongTaskObserverLike;
}

export interface MeterEvidence {
  longtasks: LongTaskEvidence;
  mediaDuration?: MeasureContext['mediaDuration'];
}

/**
 * One measured operation. `begin()` snapshots the wall clock and starts a longtask observer (if
 * available); `end(ctx)` stops the observer, reads peak memory, and derives throughput / fps from
 * the supplied context. A Meter is single-shot per begin/end pair but may be reused after end().
 */
export class Meter {
  private readonly observeLongtasks: boolean;
  private readonly clock: () => number;
  private readonly longTaskEnvironment: LongTaskObserverEnvironment | undefined;
  private startWall = 0;
  private running = false;
  private longtaskEntries: LongTaskEntryLike[] = [];
  private observer: LongTaskObserverLike | undefined;
  private observerState: 'NOT_REQUESTED' | 'ACTIVE' | 'UNSUPPORTED' | 'ERROR' = 'NOT_REQUESTED';
  private lastEvidence: MeterEvidence = { longtasks: { state: 'NOT_REQUESTED' } };

  constructor(opts?: {
    observeLongtasks?: boolean;
    clock?: () => number;
    longTaskEnvironment?: LongTaskObserverEnvironment;
  }) {
    this.observeLongtasks = opts?.observeLongtasks ?? true;
    this.clock = opts?.clock ?? nowMs;
    this.longTaskEnvironment = opts?.longTaskEnvironment ?? defaultLongTaskEnvironment();
  }

  begin(): void {
    this.running = true;
    this.longtaskEntries = [];
    this.detachObserver();
    this.observerState = this.observeLongtasks ? 'UNSUPPORTED' : 'NOT_REQUESTED';
    if (this.observeLongtasks) this.attachObserver();
    // Take the wall snapshot last so observer setup is excluded from the measured window.
    this.startWall = this.clock();
  }

  async end(ctx?: MeasureContext): Promise<MetricSample> {
    const endWall = this.clock();
    const wallMs = this.running ? Math.max(0, endWall - this.startWall) : 0;
    this.running = false;

    // Drain any buffered longtask records, then detach.
    this.drainObserver();
    this.detachObserver();
    const longtasks = this.longTaskEvidence(endWall);
    this.lastEvidence = {
      longtasks,
      ...(ctx?.mediaDuration ? { mediaDuration: { ...ctx.mediaDuration } } : {}),
    };

    const sample: MetricSample = { wallMs };
    if (longtasks.state === 'AVAILABLE') sample.longtaskMs = longtasks.value.totalDurationMs;
    if (ctx?.memoryPeak) sample.peakMemoryBytes = ctx.memoryPeak.maximumBytes;

    const wallSec = wallMs / 1000;

    const mediaSec = ctx?.mediaDuration && finitePositiveDuration(ctx.mediaDuration.durationUs)
      ? ctx.mediaDuration.durationUs / 1_000_000
      : ctx?.mediaSec;
    if (mediaSec !== undefined && Number.isFinite(mediaSec) && mediaSec > 0 && wallSec > 0) {
      sample.throughputRealtime = mediaSec / wallSec;
    }
    if (ctx?.bytesOut !== undefined) sample.bytesOut = ctx.bytesOut;
    if (ctx?.sourceReads !== undefined) sample.sourceReads = ctx.sourceReads;
    if (ctx?.targetWrites !== undefined) sample.targetWrites = ctx.targetWrites;

    if (ctx?.decodedFrames !== undefined && wallSec > 0) {
      sample.decodeFps = ctx.decodedFrames / wallSec;
    }
    if (ctx?.encodedFrames !== undefined && wallSec > 0) {
      sample.encodeFps = ctx.encodedFrames / wallSec;
    }

    // Headline per-second rates over the measured window (§8.1). Each guards on a positive wall.
    if (ctx?.ops !== undefined && wallSec > 0) sample.opsPerSec = ctx.ops / wallSec;
    if (ctx?.packets !== undefined && wallSec > 0) sample.packetsPerSec = ctx.packets / wallSec;
    if (ctx?.frames !== undefined && wallSec > 0) sample.framesPerSec = ctx.frames / wallSec;
    if (ctx?.sampleFrames !== undefined && wallSec > 0) sample.sampleFramesPerSec = ctx.sampleFrames / wallSec;
    // Mean ms per seek over the measured window.
    if (ctx?.seeks !== undefined && ctx.seeks > 0) sample.seekMs = wallMs / ctx.seeks;
    // Latency markers the op recorded relative to begin() (NOT load/init, which is untimed, §0.7).
    if (ctx?.firstByteMs !== undefined) sample.timeToFirstByteMs = ctx.firstByteMs;
    if (ctx?.firstFrameMs !== undefined) sample.timeToFirstFrameMs = ctx.firstFrameMs;

    return sample;
  }

  evidence(): MeterEvidence {
    return structuredClone(this.lastEvidence);
  }

  private attachObserver(): void {
    const environment = this.longTaskEnvironment;
    if (!environment) return;
    if (Array.isArray(environment.supportedEntryTypes) && !environment.supportedEntryTypes.includes('longtask')) {
      return;
    }
    try {
      this.observer = environment.create((entries) => {
        this.longtaskEntries.push(...entries.map((entry) => ({
          startTime: entry.startTime,
          duration: entry.duration,
        })));
      });
      // Buffered records are allowed because strict timestamp filtering below excludes prior work.
      this.observer.observe({ type: 'longtask', buffered: true });
      this.observerState = 'ACTIVE';
    } catch {
      this.observer = undefined;
      this.observerState = 'ERROR';
    }
  }

  /** Flush records the observer has queued but not yet delivered to the callback. */
  private drainObserver(): void {
    if (!this.observer) return;
    try {
      const records = this.observer.takeRecords();
      this.longtaskEntries.push(...records.map((entry) => ({ startTime: entry.startTime, duration: entry.duration })));
    } catch {
      this.observerState = 'ERROR';
    }
  }

  private detachObserver(): void {
    if (!this.observer) return;
    try {
      this.observer.disconnect();
    } catch {
      /* ignore */
    }
    this.observer = undefined;
  }

  private longTaskEvidence(endWall: number): LongTaskEvidence {
    if (!this.observeLongtasks) return { state: 'NOT_REQUESTED' };
    if (this.observerState === 'UNSUPPORTED') {
      return unavailable('NA_BROWSER', 'LONGTASK_ENTRY_TYPE_UNSUPPORTED', "PerformanceObserver does not support the 'longtask' entry type");
    }
    if (this.observerState !== 'ACTIVE') {
      return unavailable('ERROR', 'LONGTASK_OBSERVER_FAILED', 'long-task observation could not be attached or drained');
    }
    return available(sumLongTasksInWindow(this.longtaskEntries, this.startWall, endWall));
  }
}

/** Monotonic high-resolution clock; falls back to Date.now when performance.now is unavailable. */
function nowMs(): number {
  try {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
  } catch {
    /* fall through */
  }
  return Date.now();
}

/** Sum only entries whose start timestamp belongs to the exact measured operation window. */
export function sumLongTasksInWindow(
  entries: readonly LongTaskEntryLike[],
  beginMs: number,
  endMs: number,
): LongTaskObservation {
  if (!Number.isFinite(beginMs) || !Number.isFinite(endMs) || endMs < beginMs) {
    throw new RangeError('long-task window must be finite and end at or after begin');
  }
  const inWindow = entries.filter((entry) =>
    finiteNonNegative(entry.startTime) && finiteNonNegative(entry.duration) &&
    entry.duration > LONGTASK_THRESHOLD_MS && entry.startTime >= beginMs && entry.startTime <= endMs);
  return {
    totalDurationMs: inWindow.reduce((sum, entry) => sum + entry.duration, 0),
    longestDurationMs: inWindow.reduce((longest, entry) => Math.max(longest, entry.duration), 0),
    count: inWindow.length,
    window: { beginMs, endMs },
    thresholdMs: LONGTASK_THRESHOLD_MS,
    observerActive: true,
  };
}

function defaultLongTaskEnvironment(): LongTaskObserverEnvironment | undefined {
  if (typeof PerformanceObserver !== 'function') return undefined;
  const constructor = PerformanceObserver as unknown as {
    supportedEntryTypes?: readonly string[];
    new(callback: (list: { getEntries(): PerformanceEntry[] }) => void): PerformanceObserver;
  };
  return {
    ...(Array.isArray(constructor.supportedEntryTypes)
      ? { supportedEntryTypes: [...constructor.supportedEntryTypes] }
      : {}),
    create(callback) {
      const observer = new constructor((list) => callback(list.getEntries().map((entry) => ({
        startTime: entry.startTime,
        duration: entry.duration,
      }))));
      return {
        observe: (options) => observer.observe(options as PerformanceObserverInit),
        takeRecords: () => observer.takeRecords().map((entry) => ({ startTime: entry.startTime, duration: entry.duration })),
        disconnect: () => observer.disconnect(),
      };
    },
  };
}

// ── Memory windows ──────────────────────────────────────────────────────────────────────────────

interface UASpecificMemoryResult {
  bytes: number;
}
interface PerfMemory {
  usedJSHeapSize?: number;
}

export interface MemorySampler {
  api: 'measureUserAgentSpecificMemory';
  sample(): Promise<number>;
}

export interface MemoryPoint {
  atMs: number;
  bytes: number;
  phase: 'baseline' | 'operation' | 'end' | 'settle';
}

export interface MemoryPeakObservation {
  api: MemorySampler['api'];
  baselineBytes: number;
  maximumBytes: number;
  deltaBytes: number;
  memoryAfterOperationBytes: number;
  settleWindowMs: number;
  sampleIntervalMs: number;
  samples: MemoryPoint[];
}

export interface MemoryWindowResult<T> {
  result: T;
  memory: MemoryPeakObservation;
}

/** Preflight the one comparable memory API. Deprecated performance.memory is never mixed in. */
export function userAgentSpecificMemorySampler(): PerformanceEvidence<MemorySampler> {
  const perf = (typeof performance !== 'undefined' ? performance : undefined) as
    | (Performance & { measureUserAgentSpecificMemory?: () => Promise<UASpecificMemoryResult> })
    | undefined;
  if (!perf || typeof perf.measureUserAgentSpecificMemory !== 'function') {
    return unavailable('NA_BROWSER', 'MEMORY_API_UNSUPPORTED', 'measureUserAgentSpecificMemory is unavailable in this realm');
  }
  if (typeof crossOriginIsolated === 'boolean' && !crossOriginIsolated) {
    return unavailable('NA_BROWSER', 'MEMORY_CONTEXT_NOT_ISOLATED', 'measureUserAgentSpecificMemory requires a cross-origin-isolated context');
  }
  return available({
    api: 'measureUserAgentSpecificMemory',
    async sample() {
      const result = await perf.measureUserAgentSpecificMemory!();
      if (!result || !finiteNonNegative(result.bytes)) throw new TypeError('memory API returned a non-finite byte count');
      return result.bytes;
    },
  });
}

/**
 * Baseline + during-operation + end + settle-window sampling. An unavailable API is returned before
 * work starts, so unsupported browsers cannot accidentally receive a rankable zero.
 */
export async function measurePeakMemoryWindow<T>(
  operation: () => Promise<T>,
  samplerEvidence: PerformanceEvidence<MemorySampler> = userAgentSpecificMemorySampler(),
  options: {
    sampleIntervalMs?: number;
    settleWindowMs?: number;
    clock?: () => number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<PerformanceEvidence<MemoryWindowResult<T>>> {
  if (samplerEvidence.state === 'UNAVAILABLE') return samplerEvidence;
  const sampleIntervalMs = finitePositiveOption(options.sampleIntervalMs ?? 100, 'sampleIntervalMs');
  const settleWindowMs = finiteNonNegativeOption(options.settleWindowMs ?? 500, 'settleWindowMs');
  const clock = options.clock ?? nowMs;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const sampler = samplerEvidence.value;
  const points: MemoryPoint[] = [];
  let operationFailure: unknown;
  let operationFailed = false;
  const origin = clock();
  const take = async (phase: MemoryPoint['phase']): Promise<number> => {
    const bytes = await sampler.sample();
    if (!finiteNonNegative(bytes)) throw new TypeError('memory sampler returned a non-finite byte count');
    points.push({ atMs: Math.max(0, clock() - origin), bytes, phase });
    return bytes;
  };
  try {
    const baselineBytes = await take('baseline');
    let settled = false;
    const operationOutcome = Promise.resolve()
      .then(operation)
      .then(
        (result) => ({ ok: true as const, result }),
        (error) => ({ ok: false as const, error }),
      )
      .finally(() => { settled = true; });
    while (!settled) {
      const turn = await Promise.race([
        operationOutcome.then(() => 'operation-ended' as const),
        sleep(sampleIntervalMs).then(() => 'sample' as const),
      ]);
      if (turn === 'sample' && !settled) await take('operation');
    }
    const outcome = await operationOutcome;
    const memoryAfterOperationBytes = await take('end');
    let settledFor = 0;
    while (settledFor < settleWindowMs) {
      const step = Math.min(sampleIntervalMs, settleWindowMs - settledFor);
      await sleep(step);
      settledFor += step;
      await take('settle');
    }
    if (!outcome.ok) {
      operationFailed = true;
      operationFailure = outcome.error;
      throw outcome.error;
    }
    const maximumBytes = Math.max(...points.map((point) => point.bytes));
    return available({
      result: outcome.result,
      memory: {
        api: sampler.api,
        baselineBytes,
        maximumBytes,
        deltaBytes: maximumBytes - baselineBytes,
        memoryAfterOperationBytes,
        settleWindowMs,
        sampleIntervalMs,
        samples: points,
      },
    });
  } catch (error) {
    // Applicability, cancellation, timeout, and adapter failures belong to the operation channel.
    // Memory instrumentation may observe around them, but must never relabel them as a memory error.
    if (operationFailed) throw operationFailure;
    return unavailable(
      'ERROR',
      'MEMORY_PROTOCOL_ERROR',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export interface MemoryAfterOperationObservation {
  api: 'performance.memory.usedJSHeapSize';
  bytes: number;
  rankable: false;
}

/** Deprecated endpoint evidence is named honestly and is never used as peakMemory. */
export function memoryAfterOperation(): PerformanceEvidence<MemoryAfterOperationObservation> {
  const mem = (typeof performance !== 'undefined'
    ? (performance as unknown as { memory?: PerfMemory }).memory
    : undefined);
  const bytes = mem?.usedJSHeapSize;
  if (!finiteNonNegative(bytes)) {
    return unavailable('NA_BROWSER', 'MEMORY_ENDPOINT_UNSUPPORTED', 'performance.memory.usedJSHeapSize is unavailable');
  }
  return available({ api: 'performance.memory.usedJSHeapSize', bytes, rankable: false });
}

/** @deprecated One endpoint sample is not a peak; use measurePeakMemoryWindow(). */
export async function peakMemoryBytes(): Promise<number | null> {
  const sampler = userAgentSpecificMemorySampler();
  if (sampler.state === 'UNAVAILABLE') return null;
  try {
    return await sampler.value.sample();
  } catch {
    return null;
  }
}

function finitePositiveDuration(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function finitePositiveOption(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${field} must be finite and > 0`);
  return value;
}

function finiteNonNegativeOption(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${field} must be finite and >= 0`);
  return value;
}

// ── I/O counting wrappers ────────────────────────────────────────────────────────────────────────

/**
 * Wraps an in-page byte buffer as a random-access source, counting each `read(offset,length)` call.
 * Used to attribute `sourceReads` (a proxy for range fetches) to an operation. Reads are clamped to
 * the buffer bounds and return a view sliced from the backing store.
 */
export class CountingSource {
  reads = 0;
  bytesRead = 0;
  readonly sourceMode = 'random-access' as const;
  private readonly buf: Uint8Array;

  constructor(bytes: Uint8Array | ArrayBuffer) {
    this.buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  }

  /** Read `length` bytes at `offset`, clamped to the buffer. Increments {@link reads}. */
  read(offset: number, length: number): Uint8Array {
    this.reads++;
    const total = this.buf.length;
    const start = clamp(offset, 0, total);
    const end = clamp(offset + Math.max(0, length), start, total);
    // Copy so callers can't mutate the backing store through the returned view.
    const output = this.buf.slice(start, end);
    this.bytesRead += output.byteLength;
    return output;
  }

  get size(): number {
    return this.buf.length;
  }

  /** Evidence is admissible only after the adapter boundary explicitly marks it as wired. */
  evidence(crossedAdapterBoundary: boolean): {
    sourceMode: 'random-access';
    reads: number;
    bytesRead: number;
    crossedAdapterBoundary: boolean;
  } {
    return {
      sourceMode: this.sourceMode,
      reads: this.reads,
      bytesRead: this.bytesRead,
      crossedAdapterBoundary,
    };
  }
}

/**
 * Accumulates written chunks, counting each `write()` call and total bytes. Supports both append
 * (no position) and positioned writes (sparse target grows to fit). `toUint8Array()` materializes
 * the contiguous result.
 */
export class CountingTarget {
  writes = 0;
  bytes = 0;
  /** Ordered list of (position, data) segments; positions allow out-of-order/sparse writes. */
  private segments: Array<{ pos: number; data: Uint8Array }> = [];
  private appendCursor = 0;
  private maxEnd = 0;

  /** Append (position omitted) or write at an explicit byte position. Increments {@link writes}. */
  write(chunk: Uint8Array, position?: number): void {
    this.writes++;
    this.bytes += chunk.length;
    const pos = position ?? this.appendCursor;
    // Copy the chunk: callers commonly reuse/overwrite their buffers between writes.
    const data = chunk.slice();
    this.segments.push({ pos, data });
    const end = pos + data.length;
    if (end > this.maxEnd) this.maxEnd = end;
    // Append cursor always tracks the end of the highest write so subsequent appends follow on.
    if (end > this.appendCursor) this.appendCursor = end;
  }

  /** Flatten all writes into one contiguous buffer (last writer wins on overlap). */
  toUint8Array(): Uint8Array {
    const out = new Uint8Array(this.maxEnd);
    for (const seg of this.segments) {
      out.set(seg.data, seg.pos);
    }
    return out;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}
