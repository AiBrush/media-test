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
  readonly observedPacketCount?: number;
  readonly reserveCompletion?: 'COMPLETED' | 'OVERFLOW_REJECTED' | 'FAILED';
  readonly reserveOverflowReasonCode?: string;
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
  #maximumEnd = 0;
  #ranges: Array<{ start: number; end: number }> = [];
  #nativeWriteBytes = 0;
  #writeCount = 0;
  #maximumQueuedBytes = 0;
  #lastWriteAtMs: number | undefined;
  #hashHigh = FNV1A64_OFFSET_HIGH;
  #hashLow = FNV1A64_OFFSET_LOW;
  #hashEnd = 0;
  #incrementalHashValid = true;
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

  /** Bytes retained solely for independent prefix/tail validation (overlap counted once). */
  get validationRetainedBytes(): number {
    return this.#prefix.byteLength + this.#tail.byteLength;
  }

  /** Record a forward sparse region which a reserved-fast-start producer will patch before completion. */
  reserve(position: number, length: number, maximumPacketCount: number): void {
    if (!Number.isSafeInteger(position) || position < 0) throw new RangeError('aibrush reservation position is invalid');
    if (!Number.isSafeInteger(length) || length < 1) throw new RangeError('aibrush reservation length is invalid');
    if (!Number.isSafeInteger(maximumPacketCount) || maximumPacketCount < 1) {
      throw new RangeError('aibrush reservation packet bound is invalid');
    }
    if (this.#finalizeStarted) throw new Error('aibrush sink reserved bytes after finalization began');
    if (!this.enabled) return;
    this.#events.push({
      type: 'reservation',
      sequence: this.#events.length,
      atMs: this.#readNow(),
      position,
      length,
      maximumPacketCount,
    });
  }

  /** Observe one real non-empty native output write, including positioned patches and forward jumps. */
  write(chunk: Uint8Array, position: number): void {
    if (!(chunk instanceof Uint8Array)) throw new TypeError('aibrush sink write must be a Uint8Array');
    if (!Number.isSafeInteger(position) || position < 0) throw new RangeError('aibrush sink position is invalid');
    if (chunk.byteLength === 0) return;
    if (this.#finalizeStarted) throw new Error('aibrush sink wrote after finalization began');
    const end = position + chunk.byteLength;
    if (!Number.isSafeInteger(end)) throw new RangeError('aibrush sink write extent is invalid');

    this.#ranges = coalesceRanges([...this.#ranges, { start: position, end }]);
    this.#acceptedEnd = coveredByteLength(this.#ranges);
    this.#maximumEnd = Math.max(this.#maximumEnd, end);
    this.#nativeWriteBytes += chunk.byteLength;
    this.#writeCount++;
    // The callback itself is synchronous. One native chunk is being accepted at this event; there is no
    // adapter-side asynchronous queue or unawaited write promise.
    this.#maximumQueuedBytes = Math.max(this.#maximumQueuedBytes, chunk.byteLength);
    if (!this.enabled) return;
    if (this.#incrementalHashValid && position === this.#hashEnd) {
      this.#consume(chunk);
      this.#hashEnd = end;
    } else {
      this.#incrementalHashValid = false;
    }
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
  complete(
    target: 'buffer' | 'stream',
    retainedOutputBytes: number,
    finalBytes?: Uint8Array,
  ): SinkTrace | undefined {
    if (!this.enabled) return undefined;
    if (!this.#finalizeStarted) this.beginFinalize();
    if (this.#finalized) throw new Error('aibrush sink trace already finalized');
    this.#finalized = true;
    if (finalBytes !== undefined && finalBytes.byteLength !== this.#maximumEnd) {
      throw new Error(
        `aibrush finalized bytes have length ${finalBytes.byteLength}, expected positioned extent ${this.#maximumEnd}`,
      );
    }
    if (finalBytes === undefined && !this.#incrementalHashValid) {
      throw new Error('aibrush positioned sink trace completion requires finalized bytes');
    }
    const rollingHash = finalBytes === undefined
      ? this.#hashHigh.toString(16).padStart(8, '0') + this.#hashLow.toString(16).padStart(8, '0')
      : fnv1a64Hex(finalBytes);
    const validationPrefix = finalBytes === undefined
      ? this.#prefix.slice()
      : finalBytes.slice(0, this.#prefixLimit);
    const validationTail = finalBytes === undefined
      ? this.#tail.slice()
      : finalBytes.slice(Math.max(0, finalBytes.byteLength - this.#tailLimit));
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
      rollingHash,
      rollingHashAlgorithm: 'fnv1a64' as const,
      validationPrefix,
      validationTail,
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

export interface AibrushCallbackAccumulatorOptions extends AibrushSinkTraceRecorderOptions {
  /** Per-track bound attached to the single inferred forward reservation in reserved fast-start mode. */
  readonly maximumPacketCount?: number;
}

/** Positioned callback target plus honest accounting for retained writes and final materialization. */
export class AibrushCallbackAccumulator {
  readonly #writes: Array<{ readonly bytes: Uint8Array; readonly position: number }> = [];
  readonly #recorder: AibrushSinkTraceRecorder;
  readonly #maximumPacketCount: number | undefined;
  #extent = 0;
  #retainedWriteBytes = 0;
  #reservationRecorded = false;
  #callbackWriteCount = 0;
  #peakRetainedBytes = 0;

  constructor(options: AibrushCallbackAccumulatorOptions = {}) {
    if (options.maximumPacketCount !== undefined &&
        (!Number.isSafeInteger(options.maximumPacketCount) || options.maximumPacketCount < 1)) {
      throw new RangeError('maximumPacketCount must be a positive safe integer');
    }
    this.#recorder = new AibrushSinkTraceRecorder(options);
    this.#maximumPacketCount = options.maximumPacketCount;
  }

  get recorder(): AibrushSinkTraceRecorder {
    return this.#recorder;
  }

  write(chunk: Uint8Array, position: number): void {
    if (
      this.#maximumPacketCount !== undefined &&
      !this.#reservationRecorded &&
      position > this.#extent
    ) {
      this.#recorder.reserve(this.#extent, position - this.#extent, this.#maximumPacketCount);
      this.#reservationRecorded = true;
    }
    this.#recorder.write(chunk, position);
    if (chunk.byteLength === 0) return;
    const owned = chunk.slice();
    const end = position + owned.byteLength;
    this.#writes.push({ bytes: owned, position });
    this.#extent = Math.max(this.#extent, end);
    this.#retainedWriteBytes += owned.byteLength;
    this.#callbackWriteCount++;
    this.#peakRetainedBytes = Math.max(this.#peakRetainedBytes, this.#retainedWriteBytes);
  }

  materialize(): Uint8Array {
    const output = new Uint8Array(this.#extent);
    // During reconstruction every callback-owned write and the final positioned extent coexist.
    this.#peakRetainedBytes = Math.max(
      this.#peakRetainedBytes,
      this.#retainedWriteBytes + output.byteLength,
    );
    for (const write of this.#writes) {
      output.set(write.bytes, write.position);
    }
    this.#writes.length = 0;
    this.#retainedWriteBytes = 0;
    return output;
  }

  get evidence(): AibrushCallbackRetentionEvidence {
    return {
      callbackWriteCount: this.#callbackWriteCount,
      bytesWritten: this.#extent,
      peakRetainedBytes: this.#peakRetainedBytes,
    };
  }
}

function coalesceRanges(
  ranges: readonly { readonly start: number; readonly end: number }[],
): Array<{ start: number; end: number }> {
  const sorted = [...ranges].sort((left, right) => left.start - right.start || left.end - right.end);
  const output: Array<{ start: number; end: number }> = [];
  for (const range of sorted) {
    const prior = output[output.length - 1];
    if (prior !== undefined && range.start <= prior.end) prior.end = Math.max(prior.end, range.end);
    else output.push({ start: range.start, end: range.end });
  }
  return output;
}

function coveredByteLength(ranges: readonly { readonly start: number; readonly end: number }[]): number {
  return ranges.reduce((total, range) => total + range.end - range.start, 0);
}

function fnv1a64Hex(bytes: Uint8Array): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
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
