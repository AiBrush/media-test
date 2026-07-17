/**
 * src/engines/mediabunny/internal/encoder-starvation.ts — OPTIONAL per-engine annex (§10.4).
 *
 * This is adapter telemetry, never an oracle.  It records measured causes rather than inferring a
 * scheduling implementation from a static config label.  Every operation owns a fresh sampler and
 * calls stop(), which makes cross-operation leakage testable.
 *
 * It is a thin, clearly-separate helper: callers wire it into a Conversion's encoder config via the
 * `onEncoderConfig` hook plus their own polling loop. We expose a small sampler rather than driving
 * a conversion ourselves, to keep this dependency-light and side-effect free.
 */

/** One sample of encoder/decoder backpressure at a point in time. */
export interface QueueSample {
  /** ms since the sampler started. */
  tMs: number;
  /** VideoEncoder.encodeQueueSize, if a video encoder is attached. */
  encodeQueueSize?: number;
  /** VideoDecoder.decodeQueueSize, if a video decoder is attached. */
  decodeQueueSize?: number;
}

/** A minimal object exposing a WebCodecs-style queue size. */
interface HasEncodeQueue {
  encodeQueueSize: number;
}
interface HasDecodeQueue {
  decodeQueueSize: number;
}

/**
 * Periodically samples encoder/decoder queue sizes. Encoder STARVATION shows up as a decode queue
 * that stays near zero while the encode queue is also near zero (the pipeline can't feed frames fast
 * enough); BACKPRESSURE shows up as a persistently high encode queue. Interpretation is left to the
 * annex report; this only collects the raw series.
 */
export class EncoderStarvationSampler {
  private samples: QueueSample[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;

  constructor(
    private readonly opts: {
      encoder?: HasEncodeQueue;
      decoder?: HasDecodeQueue;
      intervalMs?: number;
    } = {},
  ) {}

  start(): void {
    if (this.timer !== null) return;
    this.startedAt = performance.now();
    const interval = this.opts.intervalMs ?? 50;
    this.timer = setInterval(() => {
      const sample: QueueSample = { tMs: performance.now() - this.startedAt };
      if (this.opts.encoder) sample.encodeQueueSize = this.opts.encoder.encodeQueueSize;
      if (this.opts.decoder) sample.decodeQueueSize = this.opts.decoder.decodeQueueSize;
      this.samples.push(sample);
    }, interval);
  }

  stop(): QueueSample[] {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    return this.samples.map((sample) => ({ ...sample }));
  }

  /** Stop and clear all state. A subsequent start() begins a genuinely fresh observation. */
  reset(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.startedAt = 0;
    this.samples = [];
  }

  /** Summary stats for the annex (max/mean queue depths, fraction of time starved). */
  summary(): {
    n: number;
    maxEncodeQueue: number;
    maxDecodeQueue: number;
    meanEncodeQueue: number;
    starvedFraction: number;
  } {
    const n = this.samples.length;
    if (n === 0) {
      return { n, maxEncodeQueue: 0, maxDecodeQueue: 0, meanEncodeQueue: 0, starvedFraction: 0 };
    }
    let maxE = 0;
    let maxD = 0;
    let sumE = 0;
    let starved = 0;
    for (const s of this.samples) {
      const e = s.encodeQueueSize ?? 0;
      const d = s.decodeQueueSize ?? 0;
      maxE = Math.max(maxE, e);
      maxD = Math.max(maxD, d);
      sumE += e;
      if (e === 0 && d === 0) starved++;
    }
    return {
      n,
      maxEncodeQueue: maxE,
      maxDecodeQueue: maxD,
      meanEncodeQueue: sumE / n,
      starvedFraction: starved / n,
    };
  }
}

export type StarvationCause = 'none' | 'source' | 'transform' | 'encoder' | 'output' | 'mixed';

export interface PipelineStarvationSummary {
  cause: StarvationCause;
  sourceWaitMs: number;
  transformWaitMs: number;
  outputWaitMs: number;
  maxEncodeQueue: number;
  maxDecodeQueue: number;
  samples: number;
}

/**
 * Operation-scoped measured wait/queue accumulator.  The adapter can observe source and target wait
 * times even when Mediabunny does not expose its internal codec objects; tests may additionally feed
 * the actual queue depths supplied by encoder callbacks.  `finish()` freezes a snapshot then clears
 * the mutable accumulator, so every success/error/abort exit starts from zero.
 */
export class PipelineStarvationSampler {
  private sourceWaitMs = 0;
  private transformWaitMs = 0;
  private outputWaitMs = 0;
  private maxEncodeQueue = 0;
  private maxDecodeQueue = 0;
  private samples = 0;

  noteSourceWait(ms: number): void {
    this.sourceWaitMs += finiteDuration(ms);
  }

  noteTransformWait(ms: number): void {
    this.transformWaitMs += finiteDuration(ms);
  }

  noteOutputWait(ms: number): void {
    this.outputWaitMs += finiteDuration(ms);
  }

  noteQueues(encodeQueueSize?: number, decodeQueueSize?: number): void {
    if (encodeQueueSize !== undefined) this.maxEncodeQueue = Math.max(this.maxEncodeQueue, finiteDepth(encodeQueueSize));
    if (decodeQueueSize !== undefined) this.maxDecodeQueue = Math.max(this.maxDecodeQueue, finiteDepth(decodeQueueSize));
    this.samples++;
  }

  snapshot(): PipelineStarvationSummary {
    const waits = [
      ['source', this.sourceWaitMs],
      ['transform', this.transformWaitMs],
      ['output', this.outputWaitMs],
      ['encoder', this.maxEncodeQueue > 0 ? this.maxEncodeQueue : 0],
    ] as const;
    const positive = waits
      .filter(([, value]) => value > 0)
      .sort((a, b) => b[1] - a[1]);
    const largest = positive[0];
    const second = positive[1];
    // Promise/callback bookkeeping produces tiny non-zero waits in adjacent stages. Attribute a
    // deliberately slow stage when its observation dominates by at least 4x; reserve `mixed` for
    // genuinely competing bottlenecks instead of treating nanosecond noise as causal evidence.
    const cause: StarvationCause = !largest
      ? 'none'
      : !second || largest[1] >= second[1] * 4
        ? largest[0]
        : 'mixed';
    return {
      cause,
      sourceWaitMs: this.sourceWaitMs,
      transformWaitMs: this.transformWaitMs,
      outputWaitMs: this.outputWaitMs,
      maxEncodeQueue: this.maxEncodeQueue,
      maxDecodeQueue: this.maxDecodeQueue,
      samples: this.samples,
    };
  }

  finish(): PipelineStarvationSummary {
    const summary = this.snapshot();
    this.reset();
    return summary;
  }

  reset(): void {
    this.sourceWaitMs = 0;
    this.transformWaitMs = 0;
    this.outputWaitMs = 0;
    this.maxEncodeQueue = 0;
    this.maxDecodeQueue = 0;
    this.samples = 0;
  }
}

function finiteDuration(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function finiteDepth(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}
