/**
 * src/core/measure.ts — in-browser metrics: a per-op {@link Meter}, peak-memory probing, and
 * I/O-counting source/target wrappers.
 *
 * All browser APIs touched here are optional and vary by engine: PerformanceObserver('longtask') is
 * Chromium-only; measureUserAgentSpecificMemory needs cross-origin isolation; performance.memory is
 * a non-standard Chromium fallback. Each is guarded so a missing API degrades the sample (omitted /
 * null field) rather than throwing.
 */

import type { MetricSample } from './scenario.ts';

export interface MeasureContext {
  mediaSec?: number; // source media duration -> throughputRealtime = mediaSec / (wallMs/1000)
  bytesOut?: number;
  sourceReads?: number; // from CountingSource
  targetWrites?: number; // from CountingTarget
  decodedFrames?: number;
  encodedFrames?: number;
}

/** PerformanceObserver longtask entries are durations in ms; the spec threshold is 50ms. */
const LONGTASK_THRESHOLD_MS = 50;

/**
 * One measured operation. `begin()` snapshots the wall clock and starts a longtask observer (if
 * available); `end(ctx)` stops the observer, reads peak memory, and derives throughput / fps from
 * the supplied context. A Meter is single-shot per begin/end pair but may be reused after end().
 */
export class Meter {
  private readonly observeLongtasks: boolean;
  private startWall = 0;
  private running = false;
  private longtaskMs = 0;
  private observer: PerformanceObserver | undefined;

  constructor(opts?: { observeLongtasks?: boolean }) {
    // Default on; only actually attaches if the API exists in this realm.
    this.observeLongtasks = opts?.observeLongtasks ?? true;
  }

  begin(): void {
    this.running = true;
    this.longtaskMs = 0;
    this.detachObserver();
    if (this.observeLongtasks) this.attachObserver();
    // Take the wall snapshot last so observer setup is excluded from the measured window.
    this.startWall = nowMs();
  }

  async end(ctx?: MeasureContext): Promise<MetricSample> {
    const endWall = nowMs();
    const wallMs = this.running ? Math.max(0, endWall - this.startWall) : 0;
    this.running = false;

    // Drain any buffered longtask records, then detach.
    this.drainObserver();
    const longtaskMs = this.longtaskMs;
    this.detachObserver();

    const peakMemoryBytes = await peakMemoryBytes_();

    const sample: MetricSample = { wallMs, peakMemoryBytes };

    if (this.observeLongtasks) sample.longtaskMs = longtaskMs;

    const wallSec = wallMs / 1000;

    if (ctx?.mediaSec !== undefined && wallSec > 0) {
      sample.throughputRealtime = ctx.mediaSec / wallSec;
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

    return sample;
  }

  private attachObserver(): void {
    if (typeof PerformanceObserver !== 'function') return;
    // Some engines expose PerformanceObserver but not the 'longtask' entry type; guard via
    // supportedEntryTypes when present, and swallow the throw observe() raises for unknown types.
    try {
      const supported = (PerformanceObserver as unknown as { supportedEntryTypes?: string[] }).supportedEntryTypes;
      if (Array.isArray(supported) && !supported.includes('longtask')) return;

      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > LONGTASK_THRESHOLD_MS) this.longtaskMs += entry.duration;
        }
      });
      // buffered:true catches longtasks that fired between begin() and observer attach.
      this.observer.observe({ type: 'longtask', buffered: true });
    } catch {
      this.observer = undefined;
    }
  }

  /** Flush records the observer has queued but not yet delivered to the callback. */
  private drainObserver(): void {
    if (!this.observer) return;
    try {
      const records = this.observer.takeRecords();
      for (const entry of records) {
        if (entry.duration > LONGTASK_THRESHOLD_MS) this.longtaskMs += entry.duration;
      }
    } catch {
      /* ignore */
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

// ── Peak memory ─────────────────────────────────────────────────────────────────────────────────

interface UASpecificMemoryResult {
  bytes: number;
}
interface PerfMemory {
  usedJSHeapSize?: number;
}

/**
 * Best-effort peak/current memory in bytes. Order (per §10): measureUserAgentSpecificMemory →
 * performance.memory.usedJSHeapSize → null. The UA-specific API is the only cross-engine-correct
 * one; it requires cross-origin isolation, so its absence/throw is normal.
 */
async function peakMemoryBytes_(): Promise<number | null> {
  // 1. measureUserAgentSpecificMemory (Chromium, cross-origin-isolated).
  try {
    const perf = (typeof performance !== 'undefined' ? performance : undefined) as
      | (Performance & { measureUserAgentSpecificMemory?: () => Promise<UASpecificMemoryResult> })
      | undefined;
    if (perf && typeof perf.measureUserAgentSpecificMemory === 'function') {
      const res = await perf.measureUserAgentSpecificMemory();
      if (res && typeof res.bytes === 'number' && Number.isFinite(res.bytes)) return res.bytes;
    }
  } catch {
    /* fall through to next strategy */
  }

  // 2. performance.memory.usedJSHeapSize (non-standard Chromium fallback).
  try {
    const mem = (performance as unknown as { memory?: PerfMemory } | undefined)?.memory;
    if (mem && typeof mem.usedJSHeapSize === 'number' && Number.isFinite(mem.usedJSHeapSize)) {
      return mem.usedJSHeapSize;
    }
  } catch {
    /* fall through */
  }

  // 3. Unavailable (WebKit / Firefox).
  return null;
}

/** Public peak-memory probe (see {@link MeasureContext}); null when no API is available. */
export function peakMemoryBytes(): Promise<number | null> {
  return peakMemoryBytes_();
}

// ── I/O counting wrappers ────────────────────────────────────────────────────────────────────────

/**
 * Wraps an in-page byte buffer as a random-access source, counting each `read(offset,length)` call.
 * Used to attribute `sourceReads` (a proxy for range fetches) to an operation. Reads are clamped to
 * the buffer bounds and return a view sliced from the backing store.
 */
export class CountingSource {
  reads = 0;
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
    return this.buf.slice(start, end);
  }

  get size(): number {
    return this.buf.length;
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
