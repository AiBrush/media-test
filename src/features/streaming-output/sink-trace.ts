import {
  streamingVerdict,
  type SinkTrace,
  type SinkTraceContract,
  type SinkTraceEvent,
  type SinkLifecycleEvent,
  type SinkReservationEvent,
  type SinkWriteEvent,
  type StreamingDecision,
} from './types.ts';

export interface ReserveTraceContract {
  readonly maximumPacketCount: number;
  readonly observedPacketCount: number;
  readonly completion: 'COMPLETED' | 'OVERFLOW_REJECTED' | 'FAILED';
  readonly overflowReasonCode?: string;
}

export type TimeToFirstByteSample =
  | {
      readonly available: true;
      readonly sampleCount: 1;
      readonly target: 'buffer' | 'stream';
      readonly operationStartMs: number;
      readonly firstObservableByteMs: number;
      readonly finalizeMs: number;
      readonly timeToFirstByteMs: number;
      readonly wallMs: number;
      readonly firstByteWallRatio: number;
    }
  | {
      readonly available: false;
      readonly sampleCount: 0;
      readonly reasonCode: string;
      readonly detail: string;
    };

/** Validate the ordered trace independently from container/media correctness. */
export function validateSinkTrace(trace: SinkTrace, contract: SinkTraceContract): StreamingDecision {
  if (trace.schema !== 'media-test/sink-trace@1') {
    return streamingVerdict('FAIL', 'SINK_TRACE_SCHEMA_INVALID', 'sink trace schema is not recognized');
  }
  if (trace.target !== contract.target) {
    return streamingVerdict('FAIL', 'SINK_TARGET_MODE_MISMATCH', `trace target ${trace.target} != ${contract.target}`);
  }
  const structural = validateTraceStructure(trace);
  if (structural) return structural;
  const writes = writeEvents(trace);
  const start = trace.events[0]!;
  const finalize = trace.events.find((event) => event.type === 'finalize-complete');
  const close = trace.events.find((event) => event.type === 'close');
  if (!finalize || !close || close.atMs < finalize.atMs) {
    return streamingVerdict('FAIL', 'SINK_FINALIZE_CLOSE_MISSING', 'trace must finalize and then close exactly once');
  }
  if ((contract.requireNonEmpty ?? true) && trace.totalUniqueBytes <= 0) {
    return streamingVerdict('FAIL', 'SINK_OUTPUT_EMPTY', 'requested output target produced no bytes');
  }

  if (contract.target === 'stream') {
    const first = writes.find((event) => event.length > 0);
    if (!first || first.atMs < start.atMs || first.atMs >= finalize.atMs) {
      return streamingVerdict(
        'FAIL',
        'SINK_STREAM_FIRST_WRITE_INVALID',
        'stream first non-empty write must occur at/after operation start and before finalize completion',
      );
    }
  } else {
    const observable = trace.events.filter((event) => event.type === 'buffer-observable');
    if (observable.length !== 1 || observable[0]!.atMs !== finalize.atMs || observable[0]!.length !== trace.totalUniqueBytes) {
      return streamingVerdict(
        'FAIL',
        'SINK_BUFFER_OBSERVABILITY_INVALID',
        'buffer output must become externally observable exactly at finalize with the complete length',
      );
    }
  }

  if (contract.appendOnly) {
    let expectedPosition = 0;
    for (const event of writes) {
      if (event.position !== expectedPosition) {
        return streamingVerdict(
          'FAIL',
          'SINK_APPEND_POSITION_MISMATCH',
          `write ${event.sequence} starts at ${event.position}, expected cumulative position ${expectedPosition}`,
        );
      }
      expectedPosition += event.length;
    }
  }
  if (contract.writeChunkBytes !== undefined) {
    const granularity = assessWriteChunkGranularity(trace, contract.writeChunkBytes);
    if (granularity.state !== 'VERDICT' || granularity.verdict !== 'PASS') return granularity;
  }
  if (contract.requireAwaitedBackpressure && trace.maximumOutstandingWritePromises > 1) {
    return streamingVerdict(
      'FAIL',
      'SINK_BACKPRESSURE_NOT_AWAITED',
      `${trace.maximumOutstandingWritePromises} writes were simultaneously outstanding`,
      { maximumOutstandingWritePromises: trace.maximumOutstandingWritePromises },
    );
  }
  if (contract.maximumQueuedBytes !== undefined && trace.maximumQueuedBytes > contract.maximumQueuedBytes) {
    return streamingVerdict(
      'FAIL',
      'SINK_QUEUE_BOUND_EXCEEDED',
      `maximum queued bytes ${trace.maximumQueuedBytes} > bound ${contract.maximumQueuedBytes}`,
      { maximumQueuedBytes: trace.maximumQueuedBytes, queueBoundBytes: contract.maximumQueuedBytes },
    );
  }
  if (contract.maximumRetainedOutputBytes !== undefined &&
      trace.retainedOutputBytes > contract.maximumRetainedOutputBytes) {
    return streamingVerdict(
      'FAIL',
      'SINK_RETENTION_BOUND_EXCEEDED',
      `retained output bytes ${trace.retainedOutputBytes} > bound ${contract.maximumRetainedOutputBytes}`,
      {
        retainedOutputBytes: trace.retainedOutputBytes,
        retentionBoundBytes: contract.maximumRetainedOutputBytes,
      },
    );
  }
  return streamingVerdict(
    'PASS',
    'SINK_TRACE_CONTRACT_MATCH',
    `${writes.length} write(s), ${trace.totalUniqueBytes} unique byte(s), target=${trace.target}`,
    {
      writeCount: writes.length,
      totalUniqueBytes: trace.totalUniqueBytes,
      maximumQueuedBytes: trace.maximumQueuedBytes,
      maximumOutstandingWritePromises: trace.maximumOutstandingWritePromises,
      retainedOutputBytes: trace.retainedOutputBytes,
    },
  );
}

/** The TTFB clock origin is the runner-owned absolute operation-start event. */
export function assessTimeToFirstByte(trace: SinkTrace): StreamingDecision {
  const structural = validateTraceStructure(trace);
  if (structural) return structural;
  const sample = readTimeToFirstByteSample(trace);
  if (!sample.available) return streamingVerdict('FAIL', sample.reasonCode, sample.detail);
  return streamingVerdict(
    'PASS',
    'TTFB_REAL_WRITE_OBSERVED',
    `first externally observable byte after ${sample.timeToFirstByteMs} ms (${trace.target})`,
    {
      timeToFirstByteMs: sample.timeToFirstByteMs,
      wallMs: sample.wallMs,
      firstByteWallRatio: sample.firstByteWallRatio,
    },
  );
}

/**
 * Extract a rankable metric sample without manufacturing zero. Missing/invalid telemetry produces
 * n=0 and remains separate from the cell's correctness verdict.
 */
export function readTimeToFirstByteSample(trace: SinkTrace | undefined): TimeToFirstByteSample {
  if (!trace) return ttfbUnavailable('TTFB_TELEMETRY_UNAVAILABLE', 'no sink trace was supplied');
  const structural = validateTraceStructure(trace);
  if (structural) return ttfbUnavailable(structural.reasonCode, structural.detail);
  const start = trace.events[0]!;
  const finalize = trace.events.find((event) => event.type === 'finalize-complete');
  if (!finalize) return ttfbUnavailable('TTFB_FINALIZE_MISSING', 'trace has no finalize completion');
  const observed = trace.target === 'stream'
    ? writeEvents(trace).find((event) => event.length > 0)
    : trace.events.find((event) => event.type === 'buffer-observable' && event.length > 0);
  if (!observed) return ttfbUnavailable('TTFB_FIRST_BYTE_MISSING', 'no externally observable non-empty byte event');
  const ttfbMs = observed.atMs - start.atMs;
  const wallMs = finalize.atMs - start.atMs;
  if (!Number.isFinite(ttfbMs) || ttfbMs < 0 || wallMs < 0 ||
      (trace.target === 'stream' ? observed.atMs >= finalize.atMs : observed.atMs !== finalize.atMs)) {
    return ttfbUnavailable(
      'TTFB_EVENT_ORDER_INVALID',
      `target=${trace.target}, start=${start.atMs}, first=${observed.atMs}, finalize=${finalize.atMs}`,
    );
  }
  return Object.freeze({
    available: true as const,
    sampleCount: 1 as const,
    target: trace.target,
    operationStartMs: start.atMs,
    firstObservableByteMs: observed.atMs,
    finalizeMs: finalize.atMs,
    timeToFirstByteMs: ttfbMs,
    wallMs,
    firstByteWallRatio: wallMs > 0 ? ttfbMs / wallMs : 1,
  });
}

/** A valid TS byte stream in larger writes is still a behavioral FAIL for an explicit 188-byte row. */
export function assessWriteChunkGranularity(trace: SinkTrace, requestedBytes: number): StreamingDecision {
  if (!Number.isSafeInteger(requestedBytes) || requestedBytes <= 0) {
    throw new TypeError('requested write chunk size must be a positive safe integer');
  }
  const writes = writeEvents(trace);
  if (writes.length === 0) {
    return streamingVerdict('FAIL', 'SINK_WRITE_TRACE_EMPTY', 'no sink write was observed');
  }
  const mismatch = writes.find((event) => event.length !== requestedBytes);
  return mismatch
    ? streamingVerdict(
        'FAIL',
        'SINK_WRITE_GRANULARITY_MISMATCH',
        `write ${mismatch.sequence} has ${mismatch.length} bytes, requested ${requestedBytes}`,
        { requestedWriteBytes: requestedBytes, observedWriteBytes: mismatch.length },
      )
    : streamingVerdict(
        'PASS',
        'SINK_WRITE_GRANULARITY_MATCH',
        `${writes.length} write(s) are exactly ${requestedBytes} bytes`,
        { requestedWriteBytes: requestedBytes, writeCount: writes.length },
      );
}

/** Reserve is an algorithm contract: forward reservation + later positioned patch, not moov order. */
export function assessReserveWriteTrace(trace: SinkTrace, contract: ReserveTraceContract): StreamingDecision {
  requirePositiveInteger(contract.maximumPacketCount, 'maximumPacketCount');
  requireNonNegativeInteger(contract.observedPacketCount, 'observedPacketCount');
  const structural = validateTraceStructure(trace);
  if (structural) return structural;
  const reservations = trace.events.filter((event) => event.type === 'reservation');
  if (reservations.length !== 1) {
    return streamingVerdict('FAIL', 'RESERVE_EVENT_CARDINALITY_INVALID', `expected one reservation, observed ${reservations.length}`);
  }
  const reservation = reservations[0]!;
  if (reservation.maximumPacketCount !== contract.maximumPacketCount) {
    return streamingVerdict(
      'FAIL',
      'RESERVE_PACKET_BOUND_NOT_PROPAGATED',
      `trace bound ${reservation.maximumPacketCount} != requested ${contract.maximumPacketCount}`,
    );
  }
  const writes = writeEvents(trace);
  const reservationEnd = reservation.position + reservation.length;
  const forward = writes.find((event) => event.sequence > reservation.sequence && event.position >= reservationEnd);
  const patch = forward && writes.find((event) =>
    event.sequence > forward.sequence &&
    event.position >= reservation.position &&
    event.position + event.length <= reservationEnd);

  if (contract.observedPacketCount > contract.maximumPacketCount) {
    const aborted = trace.events.some((event) => event.type === 'abort');
    const finalized = trace.events.some((event) => event.type === 'finalize-complete');
    if (contract.completion !== 'OVERFLOW_REJECTED' || !contract.overflowReasonCode || !aborted || finalized) {
      return streamingVerdict(
        'FAIL',
        'RESERVE_OVERFLOW_NOT_BOUNDED',
        'packet-bound overflow must reject with a stable reason, abort, and produce no finalized output',
      );
    }
    return streamingVerdict(
      'PASS',
      'RESERVE_OVERFLOW_REJECTED',
      `overflow ${contract.observedPacketCount}/${contract.maximumPacketCount} rejected as ${contract.overflowReasonCode}`,
      { observedPacketCount: contract.observedPacketCount, maximumPacketCount: contract.maximumPacketCount },
    );
  }
  if (contract.completion !== 'COMPLETED' || !forward || !patch) {
    return streamingVerdict(
      'FAIL',
      'RESERVE_POSITIONED_PATCH_MISSING',
      'successful reserve mode must write beyond the reserved region and later patch inside it',
    );
  }
  const fit = contract.observedPacketCount === contract.maximumPacketCount ? 'exact-fit' : 'under-fill';
  return streamingVerdict(
    'PASS',
    fit === 'exact-fit' ? 'RESERVE_EXACT_FIT_VALID' : 'RESERVE_UNDERFILL_VALID',
    `${fit} ${contract.observedPacketCount}/${contract.maximumPacketCount}; forward write ${forward.sequence}, patch ${patch.sequence}`,
    {
      observedPacketCount: contract.observedPacketCount,
      maximumPacketCount: contract.maximumPacketCount,
      reservationBytes: reservation.length,
    },
  );
}

/** In-memory fast-start must not masquerade as reserve via a positioned patch trace. */
export function assessInMemoryFastStartTrace(trace: SinkTrace): StreamingDecision {
  const reservations = trace.events.filter((event) => event.type === 'reservation');
  const writes = writeEvents(trace);
  let maximumEnd = 0;
  let positionedPatch = false;
  for (const write of writes) {
    if (write.position < maximumEnd) positionedPatch = true;
    maximumEnd = Math.max(maximumEnd, write.position + write.length);
  }
  return reservations.length || positionedPatch
    ? streamingVerdict(
        'FAIL',
        'IN_MEMORY_FASTSTART_RESERVE_TRACE',
        `in-memory mode exposed ${reservations.length} reservation(s), positionedPatch=${positionedPatch}`,
      )
    : streamingVerdict('PASS', 'IN_MEMORY_FASTSTART_TRACE_VALID', 'bulk/in-memory path has no reserve or positioned patch evidence');
}

export interface BoundedStreamingSinkOptions {
  readonly target?: 'buffer' | 'stream';
  readonly operationStartMs: number;
  readonly now: () => number;
  readonly prefixBytes?: number;
  readonly tailBytes?: number;
  /** Injected slow-target hook; awaiting each write is how callers honor backpressure. */
  readonly beforeConsume?: (sequence: number, bytes: Uint8Array) => void | Promise<void>;
}

/**
 * Non-retaining append sink: bounded prefix/tail + rolling hash only. Calling write again before its
 * promise settles is observable as >1 outstanding promise and queued-byte growth.
 */
export class BoundedStreamingSink {
  private readonly target: 'buffer' | 'stream';
  private readonly now: () => number;
  private readonly beforeConsume: BoundedStreamingSinkOptions['beforeConsume'];
  private readonly prefixLimit: number;
  private readonly tailLimit: number;
  private readonly events: SinkTraceEvent[] = [];
  private prefix: Uint8Array = new Uint8Array(0);
  private tailBytes: Uint8Array = new Uint8Array(0);
  private acceptedEnd = 0;
  private nativeWriteBytes = 0;
  private outstanding = 0;
  private maximumOutstanding = 0;
  private queuedBytes = 0;
  private maximumQueued = 0;
  private hash = 0xcbf29ce484222325n;
  private work: Promise<void> = Promise.resolve();
  private finalized = false;
  private aborted = false;

  constructor(options: BoundedStreamingSinkOptions) {
    if (!Number.isFinite(options.operationStartMs) || !Number.isFinite(options.now())) {
      throw new TypeError('sink clock values must be finite');
    }
    this.target = options.target ?? 'stream';
    this.now = options.now;
    this.beforeConsume = options.beforeConsume;
    this.prefixLimit = nonNegativeLimit(options.prefixBytes ?? 4096, 'prefixBytes');
    this.tailLimit = nonNegativeLimit(options.tailBytes ?? 4096, 'tailBytes');
    this.events.push({ type: 'operation-start', sequence: 0, atMs: options.operationStartMs });
  }

  reserve(position: number, length: number, maximumPacketCount: number): void {
    this.assertOpen();
    requireNonNegativeInteger(position, 'reservation position');
    requirePositiveInteger(length, 'reservation length');
    requirePositiveInteger(maximumPacketCount, 'maximumPacketCount');
    this.pushEvent({ type: 'reservation', position, length, maximumPacketCount });
  }

  write(source: Uint8Array, position = this.acceptedEnd): Promise<void> {
    this.assertOpen();
    if (!(source instanceof Uint8Array) || source.byteLength === 0) {
      return Promise.reject(new TypeError('sink writes must be non-empty Uint8Array values'));
    }
    requireNonNegativeInteger(position, 'write position');
    if (position !== this.acceptedEnd) {
      return Promise.reject(new RangeError(`bounded hash sink is append-only: position ${position} != ${this.acceptedEnd}`));
    }
    const bytes = source.slice();
    const sequence = this.events.length;
    this.acceptedEnd += bytes.byteLength;
    this.nativeWriteBytes += bytes.byteLength;
    this.outstanding++;
    this.queuedBytes += bytes.byteLength;
    this.maximumOutstanding = Math.max(this.maximumOutstanding, this.outstanding);
    this.maximumQueued = Math.max(this.maximumQueued, this.queuedBytes);
    this.events.push({
      type: 'write',
      sequence,
      atMs: this.now(),
      position,
      length: bytes.byteLength,
      cumulativeUniqueBytes: this.acceptedEnd,
      outstandingWritePromises: this.outstanding,
    });

    const operation = this.work.then(async () => {
      await this.beforeConsume?.(sequence, bytes);
      this.consume(bytes);
    }).finally(() => {
      this.queuedBytes -= bytes.byteLength;
      this.outstanding--;
    });
    this.work = operation.catch(() => undefined);
    return operation;
  }

  async finalize(): Promise<SinkTrace> {
    this.assertOpen();
    this.pushEvent({ type: 'finalize-start' });
    await this.work;
    this.finalized = true;
    const atMs = this.now();
    if (this.target === 'buffer') {
      this.events.push({
        type: 'buffer-observable',
        sequence: this.events.length,
        atMs,
        length: this.acceptedEnd,
      });
    }
    this.events.push({ type: 'finalize-complete', sequence: this.events.length, atMs });
    this.events.push({ type: 'close', sequence: this.events.length, atMs: this.now() });
    return this.trace();
  }

  abort(reasonCode = 'SINK_ABORTED'): SinkTrace {
    if (!this.finalized && !this.aborted) {
      this.aborted = true;
      this.pushEvent({ type: 'abort', reasonCode });
    }
    return this.trace();
  }

  trace(): SinkTrace {
    const prefix = this.prefix.slice();
    const tail = this.tailBytes.slice();
    return Object.freeze({
      schema: 'media-test/sink-trace@1' as const,
      target: this.target,
      events: Object.freeze(this.events.map((event) => Object.freeze({ ...event }))),
      totalUniqueBytes: this.acceptedEnd,
      nativeWriteBytes: this.nativeWriteBytes,
      maximumOutstandingWritePromises: this.maximumOutstanding,
      maximumQueuedBytes: this.maximumQueued,
      retainedOutputBytes: prefix.byteLength + tail.byteLength,
      rollingHash: this.hash.toString(16).padStart(16, '0'),
      rollingHashAlgorithm: 'fnv1a64' as const,
      validationPrefix: prefix,
      validationTail: tail,
    });
  }

  private consume(bytes: Uint8Array): void {
    for (const byte of bytes) {
      this.hash ^= BigInt(byte);
      this.hash = BigInt.asUintN(64, this.hash * 0x100000001b3n);
    }
    if (this.prefix.byteLength < this.prefixLimit) {
      const count = Math.min(this.prefixLimit - this.prefix.byteLength, bytes.byteLength);
      this.prefix = concatBounded(this.prefix, bytes.subarray(0, count), this.prefixLimit, false);
    }
    this.tailBytes = concatBounded(this.tailBytes, bytes, this.tailLimit, true);
  }

  private pushEvent(
    event: (
      | Omit<SinkReservationEvent, 'sequence' | 'atMs'>
      | Omit<SinkLifecycleEvent, 'sequence' | 'atMs'>
    ) & { atMs?: number },
  ): void {
    this.events.push({ ...event, sequence: this.events.length, atMs: event.atMs ?? this.now() } as SinkTraceEvent);
  }

  private assertOpen(): void {
    if (this.finalized) throw new Error('sink is finalized');
    if (this.aborted) throw new Error('sink is aborted');
  }
}

function validateTraceStructure(trace: SinkTrace): StreamingDecision | undefined {
  if (trace.events.length === 0 || trace.events[0]?.type !== 'operation-start') {
    return streamingVerdict('FAIL', 'SINK_OPERATION_START_MISSING', 'first trace event must be operation-start');
  }
  let lastAt = -Infinity;
  let unique = 0;
  let native = 0;
  const ranges: Array<{ start: number; end: number }> = [];
  for (const [index, event] of trace.events.entries()) {
    if (event.sequence !== index || !Number.isFinite(event.atMs) || event.atMs < lastAt) {
      return streamingVerdict(
        'FAIL',
        'SINK_TRACE_ORDER_INVALID',
        `event ${index} has sequence=${event.sequence}, atMs=${event.atMs}, previous=${lastAt}`,
      );
    }
    lastAt = event.atMs;
    if (event.type !== 'write') continue;
    if (!Number.isSafeInteger(event.position) || event.position < 0 || !Number.isSafeInteger(event.length) || event.length <= 0) {
      return streamingVerdict('FAIL', 'SINK_WRITE_EVENT_INVALID', `write ${index} has invalid position/length`);
    }
    native += event.length;
    ranges.push({ start: event.position, end: event.position + event.length });
    unique = unionLength(ranges);
    if (event.cumulativeUniqueBytes !== unique || !Number.isSafeInteger(event.outstandingWritePromises) ||
        event.outstandingWritePromises <= 0) {
      return streamingVerdict(
        'FAIL',
        'SINK_WRITE_COUNTER_MISMATCH',
        `write ${index} counters do not match recomputed unique/outstanding evidence`,
      );
    }
  }
  if (unique !== trace.totalUniqueBytes || native !== trace.nativeWriteBytes) {
    return streamingVerdict(
      'FAIL',
      'SINK_FINAL_COUNTER_MISMATCH',
      `trace counters unique=${trace.totalUniqueBytes}/${unique}, native=${trace.nativeWriteBytes}/${native}`,
    );
  }
  if (!/^[0-9a-f]{16}$/.test(trace.rollingHash)) {
    return streamingVerdict('FAIL', 'SINK_ROLLING_HASH_INVALID', 'rolling hash must be canonical 64-bit lowercase hex');
  }
  return undefined;
}

function writeEvents(trace: SinkTrace): SinkWriteEvent[] {
  return trace.events.filter((event): event is SinkWriteEvent => event.type === 'write');
}

function unionLength(ranges: readonly { start: number; end: number }[]): number {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  let total = 0;
  let start = 0;
  let end = 0;
  let active = false;
  for (const range of sorted) {
    if (!active) {
      start = range.start;
      end = range.end;
      active = true;
    } else if (range.start <= end) {
      end = Math.max(end, range.end);
    } else {
      total += end - start;
      start = range.start;
      end = range.end;
    }
  }
  return active ? total + end - start : 0;
}

function concatBounded(first: Uint8Array, second: Uint8Array, limit: number, keepTail: boolean): Uint8Array {
  if (limit === 0) return new Uint8Array(0);
  const length = Math.min(limit, first.byteLength + second.byteLength);
  const out = new Uint8Array(length);
  if (keepTail) {
    const skip = first.byteLength + second.byteLength - length;
    if (skip < first.byteLength) {
      const firstStart = skip;
      const firstCount = first.byteLength - firstStart;
      out.set(first.subarray(firstStart));
      out.set(second, firstCount);
    } else {
      out.set(second.subarray(skip - first.byteLength));
    }
  } else {
    const firstCount = Math.min(first.byteLength, length);
    out.set(first.subarray(0, firstCount));
    if (firstCount < length) out.set(second.subarray(0, length - firstCount), firstCount);
  }
  return out;
}

function requirePositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${field} must be a positive safe integer`);
}

function requireNonNegativeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${field} must be a non-negative safe integer`);
}

function nonNegativeLimit(value: number, field: string): number {
  requireNonNegativeInteger(value, field);
  return value;
}

function ttfbUnavailable(reasonCode: string, detail: string): Extract<TimeToFirstByteSample, { available: false }> {
  return Object.freeze({ available: false as const, sampleCount: 0 as const, reasonCode, detail });
}
