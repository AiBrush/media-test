import type { OracleVerdict } from '../../core/scenario.ts';

/** Stable streaming-output correctness layers. Applicability never shares the semantic verdict path. */
export type StreamingCorrectnessLayer =
  | 'applicability'
  | 'sink-trace'
  | 'container-validity'
  | 'media-semantics';

export type StreamingUnavailableStatus = 'NA_ENGINE' | 'NA_BROWSER' | 'NA_ASSET';

export type StreamingDecision =
  | {
      readonly state: 'VERDICT';
      readonly verdict: OracleVerdict;
      readonly reasonCode: string;
      readonly detail: string;
      readonly measurements?: Readonly<Record<string, number>>;
    }
  | {
      readonly state: 'UNAVAILABLE';
      readonly status: StreamingUnavailableStatus;
      readonly reasonCode: string;
      readonly detail: string;
    }
  | {
      readonly state: 'ERROR';
      readonly reasonCode: string;
      readonly detail: string;
    };

export type StreamingLayerOutcome = StreamingDecision & {
  readonly layer: StreamingCorrectnessLayer;
};

export interface StreamingCorrectnessResult {
  readonly schema: 'media-test/streaming-correctness@1';
  readonly status: OracleVerdict | StreamingUnavailableStatus | 'ERROR';
  readonly reasonCode: string;
  readonly layers: Readonly<Record<StreamingCorrectnessLayer, StreamingLayerOutcome>>;
}

export interface SinkOperationStartEvent {
  readonly type: 'operation-start';
  readonly sequence: number;
  /** Absolute monotonic timestamp, never adapter-relative. */
  readonly atMs: number;
}

export interface SinkReservationEvent {
  readonly type: 'reservation';
  readonly sequence: number;
  readonly atMs: number;
  readonly position: number;
  readonly length: number;
  readonly maximumPacketCount: number;
}

export interface SinkWriteEvent {
  readonly type: 'write';
  readonly sequence: number;
  readonly atMs: number;
  readonly position: number;
  readonly length: number;
  readonly cumulativeUniqueBytes: number;
  readonly outstandingWritePromises: number;
}

export interface SinkLifecycleEvent {
  readonly type: 'finalize-start' | 'finalize-complete' | 'close' | 'abort';
  readonly sequence: number;
  readonly atMs: number;
  readonly reasonCode?: string;
}

export interface SinkBufferObservableEvent {
  readonly type: 'buffer-observable';
  readonly sequence: number;
  readonly atMs: number;
  readonly length: number;
}

export type SinkTraceEvent =
  | SinkOperationStartEvent
  | SinkReservationEvent
  | SinkWriteEvent
  | SinkLifecycleEvent
  | SinkBufferObservableEvent;

export interface SinkTrace {
  readonly schema: 'media-test/sink-trace@1';
  readonly target: 'buffer' | 'stream';
  readonly events: readonly SinkTraceEvent[];
  readonly totalUniqueBytes: number;
  readonly nativeWriteBytes: number;
  readonly maximumOutstandingWritePromises: number;
  readonly maximumQueuedBytes: number;
  readonly retainedOutputBytes: number;
  readonly rollingHash: string;
  readonly rollingHashAlgorithm: 'fnv1a64';
  readonly validationPrefix: Uint8Array;
  readonly validationTail: Uint8Array;
}

export interface SinkTraceContract {
  readonly target: 'buffer' | 'stream';
  readonly appendOnly?: boolean;
  readonly writeChunkBytes?: number;
  readonly requireAwaitedBackpressure?: boolean;
  readonly maximumQueuedBytes?: number;
  readonly maximumRetainedOutputBytes?: number;
  readonly requireNonEmpty?: boolean;
}

export function streamingVerdict(
  verdict: OracleVerdict,
  reasonCode: string,
  detail: string,
  measurements?: Readonly<Record<string, number>>,
): StreamingDecision {
  return Object.freeze({
    state: 'VERDICT' as const,
    verdict,
    reasonCode: stableReasonCode(reasonCode),
    detail,
    ...(measurements ? { measurements: Object.freeze({ ...measurements }) } : {}),
  });
}

export function streamingUnavailable(
  status: StreamingUnavailableStatus,
  reasonCode: string,
  detail: string,
): StreamingDecision {
  return Object.freeze({ state: 'UNAVAILABLE' as const, status, reasonCode: stableReasonCode(reasonCode), detail });
}

export function streamingError(reasonCode: string, detail: string): StreamingDecision {
  return Object.freeze({ state: 'ERROR' as const, reasonCode: stableReasonCode(reasonCode), detail });
}

export function stableReasonCode(value: string): string {
  if (!/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/.test(value)) {
    throw new TypeError(`reasonCode must be stable UPPER_SNAKE_CASE: ${JSON.stringify(value)}`);
  }
  return value;
}
