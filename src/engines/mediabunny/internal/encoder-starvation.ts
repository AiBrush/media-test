/**
 * src/engines/mediabunny/internal/encoder-starvation.ts — OPTIONAL per-engine annex (§10.4).
 *
 * THIS IS NOT PART OF THE CROSS-ENGINE COMPARISON. The suite judges only observable behavior; this
 * module is an engine-internal diagnostic that polls WebCodecs encoder/decoder queue sizes during a
 * mediabunny conversion to detect encoder starvation / backpressure. It lives strictly under
 * src/engines/mediabunny/internal/ and feeds only the per-engine annex, never the matrix (§0 / §10).
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
    return this.samples;
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
