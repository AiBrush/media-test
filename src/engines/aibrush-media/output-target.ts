import type { StreamingRepresentation } from '../../features/streaming-output/contracts.ts';
import type { SinkTrace, SinkTraceEvent } from '../../features/streaming-output/types.ts';

const DEFAULT_VALIDATION_WINDOW_BYTES = 4_096;
const FNV1A64_OFFSET_HIGH = 0xcbf29ce4;
const FNV1A64_OFFSET_LOW = 0x84222325;
const FNV1A64_PRIME_LOW = 0x1b3;

export interface AibrushCallbackRetentionEvidence {
  readonly callbackWriteCount: number;
  readonly bytesWritten: number;
  readonly peakRetainedBytes: number;
}

export interface AibrushStreamingRuntimeEvidence {
  readonly schema: 'media-test/streaming-runtime-evidence@1';
  readonly sinkTrace: SinkTrace;
  readonly resolvedRepresentation: StreamingRepresentation;
  readonly observerPolicy: string;
  readonly retainedOutputPolicy: string;
  readonly measurementContract: 'media-test/streaming-output-measurement@1';
}

export interface AibrushSinkTraceRecorderOptions {
  /** Runner-owned absolute monotonic origin. No trace is emitted when legacy callers omit it. */
  readonly operationStartMs?: number;
  readonly now?: () => number;
  readonly validationPrefixBytes?: number;
  readonly validationTailBytes?: number;
}

/**
 * Adapter-boundary observer for genuine framework chunks/callbacks. It retains only bounded validation
 * windows; the separate callback accumulator below remains the (honestly reported) whole-output owner.
 */
export class AibrushSinkTraceRecorder {
  readonly #operationStartMs: number | undefined;
  readonly #now: () => number;
  readonly #prefixLimit: number;
  readonly #tailLimit: number;
  readonly #events: SinkTraceEvent[] = [];
  #lastAtMs = -Infinity;
  #acceptedEnd = 0;
  #nativeWriteBytes = 0;
  #writeCount = 0;
  #maximumQueuedBytes = 0;
  #lastWriteAtMs: number | undefined;
  #hashHigh = FNV1A64_OFFSET_HIGH;
  #hashLow = FNV1A64_OFFSET_LOW;
  #prefix = new Uint8Array(0);
  #tail = new Uint8Array(0);
  #finalizeStarted = false;
  #finalized = false;

  constructor(options: AibrushSinkTraceRecorderOptions = {}) {
    if (options.operationStartMs !== undefined && !Number.isFinite(options.operationStartMs)) {
      throw new TypeError('operationStartMs must be a finite runner-owned monotonic timestamp');
    }
    this.#operationStartMs = options.operationStartMs;
    this.#now = options.now ?? monotonicNow;
    this.#prefixLimit = nonNegativeInteger(
      options.validationPrefixBytes ?? DEFAULT_VALIDATION_WINDOW_BYTES,
      'validationPrefixBytes',
    );
    this.#tailLimit = nonNegativeInteger(
      options.validationTailBytes ?? DEFAULT_VALIDATION_WINDOW_BYTES,
      'validationTailBytes',
    );
    if (this.#operationStartMs !== undefined) {
      this.#lastAtMs = this.#operationStartMs;
      this.#events.push({ type: 'operation-start', sequence: 0, atMs: this.#operationStartMs });
    }
  }

  get enabled(): boolean {
    return this.#operationStartMs !== undefined;
  }

  get bytesWritten(): number {
    return this.#acceptedEnd;
  }

  get writeCount(): number {
    return this.#writeCount;
  }

  get firstWriteAtMs(): number | undefined {
    return this.#events.find((event) => event.type === 'write' && event.length > 0)?.atMs;
  }

  get lastWriteAtMs(): number | undefined {
    return this.#lastWriteAtMs;
  }

  /** Observe one real non-empty native output write. Positions must stay append-only for supported modes. */
  write(chunk: Uint8Array, position: number): void {
    if (!(chunk instanceof Uint8Array)) throw new TypeError('aibrush sink write must be a Uint8Array');
    if (!Number.isSafeInteger(position) || position < 0) throw new RangeError('aibrush sink position is invalid');
    if (position !== this.#acceptedEnd) {
      throw new AibrushPositionedWriteUnsupportedError(position, this.#acceptedEnd);
    }
    if (chunk.byteLength === 0) return;
    if (this.#finalizeStarted) throw new Error('aibrush sink wrote after finalization began');

    this.#acceptedEnd += chunk.byteLength;
    this.#nativeWriteBytes += chunk.byteLength;
    this.#writeCount++;
    // The callback itself is synchronous. One native chunk is being accepted at this event; there is no
    // adapter-side asynchronous queue or unawaited write promise.
    this.#maximumQueuedBytes = Math.max(this.#maximumQueuedBytes, chunk.byteLength);
    if (!this.enabled) return;
    this.#consume(chunk);
    const atMs = this.#readNow();
    this.#lastWriteAtMs = atMs;
    this.#events.push({
      type: 'write',
      sequence: this.#events.length,
      atMs,
      position,
      length: chunk.byteLength,
      cumulativeUniqueBytes: this.#acceptedEnd,
      outstandingWritePromises: 1,
    });
  }

  beginFinalize(): void {
    if (!this.enabled || this.#finalizeStarted) return;
    this.#finalizeStarted = true;
    this.#events.push({
      type: 'finalize-start',
      sequence: this.#events.length,
      atMs: this.#readNow(),
    });
  }

  /**
   * Close the trace after bytes are externally observable. `retainedOutputBytes` is the actual/peak
   * full-output retention of the surrounding adapter, not merely this observer's bounded windows.
   */
  complete(target: 'buffer' | 'stream', retainedOutputBytes: number): SinkTrace | undefined {
    if (!this.enabled) return undefined;
    if (!this.#finalizeStarted) this.beginFinalize();
    if (this.#finalized) throw new Error('aibrush sink trace already finalized');
    this.#finalized = true;
    const atMs = this.#readNow();
    if (target === 'buffer') {
      this.#events.push({
        type: 'buffer-observable',
        sequence: this.#events.length,
        atMs,
        length: this.#acceptedEnd,
      });
    }
    this.#events.push({ type: 'finalize-complete', sequence: this.#events.length, atMs });
    this.#events.push({ type: 'close', sequence: this.#events.length, atMs: this.#readNow() });
    return Object.freeze({
      schema: 'media-test/sink-trace@1' as const,
      target,
      events: Object.freeze(this.#events.map((event) => Object.freeze({ ...event }))),
      totalUniqueBytes: this.#acceptedEnd,
      nativeWriteBytes: this.#nativeWriteBytes,
      maximumOutstandingWritePromises: this.#writeCount > 0 ? 1 : 0,
      maximumQueuedBytes: this.#maximumQueuedBytes,
      retainedOutputBytes: nonNegativeInteger(retainedOutputBytes, 'retainedOutputBytes'),
      rollingHash:
        this.#hashHigh.toString(16).padStart(8, '0') +
        this.#hashLow.toString(16).padStart(8, '0'),
      rollingHashAlgorithm: 'fnv1a64' as const,
      validationPrefix: this.#prefix.slice(),
      validationTail: this.#tail.slice(),
    });
  }

  #consume(bytes: Uint8Array): void {
    let high = this.#hashHigh;
    let low = this.#hashLow;
    for (let index = 0; index < bytes.byteLength; index++) {
      low = (low ^ bytes[index]!) >>> 0;
      const lowProduct = low * FNV1A64_PRIME_LOW;
      high =
        (Math.imul(high, FNV1A64_PRIME_LOW) +
          Math.floor(lowProduct / 0x1_0000_0000) +
          Math.imul(low, 0x100)) >>>
        0;
      low = lowProduct >>> 0;
    }
    this.#hashHigh = high;
    this.#hashLow = low;
    if (this.#prefix.byteLength < this.#prefixLimit) {
      const count = Math.min(this.#prefixLimit - this.#prefix.byteLength, bytes.byteLength);
      this.#prefix = concatBounded(this.#prefix, bytes.subarray(0, count), this.#prefixLimit, false);
    }
    this.#tail = concatBounded(this.#tail, bytes, this.#tailLimit, true);
  }

  #readNow(): number {
    const value = this.#now();
    if (!Number.isFinite(value)) throw new TypeError('aibrush sink clock returned a non-finite timestamp');
    if (value < this.#lastAtMs) throw new Error('aibrush sink clock moved backwards');
    this.#lastAtMs = value;
    return value;
  }
}

/** Typed local signal for a framework mode that unexpectedly needs positioned/patch writes. */
export class AibrushPositionedWriteUnsupportedError extends Error {
  readonly position: number;
  readonly expectedPosition: number;

  constructor(position: number, expectedPosition: number) {
    super(`aibrush stream target write at position ${position}, expected ${expectedPosition} (append-only)`);
    this.name = 'AibrushPositionedWriteUnsupportedError';
    this.position = position;
    this.expectedPosition = expectedPosition;
  }
}

/** Contiguous callback target plus honest accounting for the later full-output concatenation. */
export class AibrushCallbackAccumulator {
  readonly #chunks: Uint8Array[] = [];
  readonly #recorder: AibrushSinkTraceRecorder;
  #bytesWritten = 0;
  #callbackWriteCount = 0;
  #peakRetainedBytes = 0;

  constructor(options: AibrushSinkTraceRecorderOptions = {}) {
    this.#recorder = new AibrushSinkTraceRecorder(options);
  }

  get recorder(): AibrushSinkTraceRecorder {
    return this.#recorder;
  }

  write(chunk: Uint8Array, position: number): void {
    if (position !== this.#bytesWritten) {
      throw new AibrushPositionedWriteUnsupportedError(position, this.#bytesWritten);
    }
    this.#recorder.write(chunk, position);
    if (chunk.byteLength === 0) return;
    const owned = chunk.slice();
    this.#chunks.push(owned);
    this.#bytesWritten += owned.byteLength;
    this.#callbackWriteCount++;
    this.#peakRetainedBytes = Math.max(this.#peakRetainedBytes, this.#bytesWritten);
  }

  materialize(): Uint8Array {
    const output = new Uint8Array(this.#bytesWritten);
    // During concatenation both every callback-owned chunk and the full output allocation coexist.
    this.#peakRetainedBytes = Math.max(this.#peakRetainedBytes, this.#bytesWritten + output.byteLength);
    let offset = 0;
    for (const chunk of this.#chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    this.#chunks.length = 0;
    return output;
  }

  get evidence(): AibrushCallbackRetentionEvidence {
    return {
      callbackWriteCount: this.#callbackWriteCount,
      bytesWritten: this.#bytesWritten,
      peakRetainedBytes: this.#peakRetainedBytes,
    };
  }
}

function monotonicNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function nonNegativeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${field} must be a non-negative safe integer`);
  return value;
}

function concatBounded(
  first: Uint8Array,
  second: Uint8Array,
  limit: number,
  keepTail: boolean,
): Uint8Array<ArrayBuffer> {
  if (limit === 0) return new Uint8Array(0);
  const length = Math.min(limit, first.byteLength + second.byteLength);
  const output = new Uint8Array(length);
  if (!keepTail) {
    const firstCount = Math.min(first.byteLength, length);
    output.set(first.subarray(0, firstCount));
    if (firstCount < length) output.set(second.subarray(0, length - firstCount), firstCount);
    return output;
  }
  const skip = first.byteLength + second.byteLength - length;
  if (skip < first.byteLength) {
    const firstStart = skip;
    const firstCount = first.byteLength - firstStart;
    output.set(first.subarray(firstStart));
    output.set(second, firstCount);
  } else {
    output.set(second.subarray(skip - first.byteLength));
  }
  return output;
}
