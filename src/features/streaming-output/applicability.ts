import {
  NotApplicableError,
  type ApplicabilityTupleSummary,
} from '../../core/engine.ts';
import type { StreamingOutputContract } from './contracts.ts';

export interface StreamingTupleRequest {
  readonly engineId: string;
  readonly inputContainer: string;
  readonly inputCodecs: readonly string[];
  readonly outputCodecs: readonly string[];
  readonly inputSizeBytes?: number;
  readonly contract: StreamingOutputContract;
}

export interface StreamingTupleCapabilities {
  readonly containersIn: readonly string[];
  readonly containersOut: readonly string[];
  readonly inputCodecs: readonly string[];
  readonly outputCodecs: readonly string[];
  readonly streamObserver: boolean;
  readonly positionedWrites: boolean;
  readonly fragmentedMp4: boolean;
  readonly fastStartInMemory: boolean;
  readonly fastStartReserve: boolean;
  readonly appendOnlyWebm: boolean;
  readonly exactWriteChunkBytes?: readonly number[];
  readonly maximumStreamInputBytes?: number;
  readonly maximumBufferInputBytes?: number;
  /** Optional complete legality table after the common shape checks. */
  readonly supportsContainerCodecTuple?: (request: StreamingTupleRequest) => boolean;
}

export type StreamingTupleDecision =
  | { readonly supported: true; readonly reasonCode: 'STREAMING_TUPLE_SUPPORTED' }
  | {
      readonly supported: false;
      readonly status: 'NA_ENGINE';
      readonly reasonCode:
        | 'STREAMING_INPUT_CONTAINER_UNSUPPORTED'
        | 'STREAMING_OUTPUT_CONTAINER_UNSUPPORTED'
        | 'STREAMING_CONTAINER_CODEC_TUPLE_UNSUPPORTED'
        | 'STREAMING_TARGET_OBSERVER_UNSUPPORTED'
        | 'STREAMING_POSITIONED_WRITES_UNSUPPORTED'
        | 'STREAMING_FRAGMENTED_MODE_UNSUPPORTED'
        | 'STREAMING_FASTSTART_MODE_UNSUPPORTED'
        | 'STREAMING_APPEND_ONLY_MODE_UNSUPPORTED'
        | 'STREAMING_WRITE_GRANULARITY_UNSUPPORTED'
        | 'STREAMING_VERIFIED_SCALE_CAP';
      readonly reason: string;
    };

/** Full operation/container/codecs/mode/scale tuple gate; no option is silently ignored. */
export function decideStreamingTupleSupport(
  request: StreamingTupleRequest,
  capabilities: StreamingTupleCapabilities,
): StreamingTupleDecision {
  const { contract } = request;
  if (!capabilities.containersIn.includes(request.inputContainer)) {
    return miss('STREAMING_INPUT_CONTAINER_UNSUPPORTED', `input container '${request.inputContainer}' is unsupported`);
  }
  if (!capabilities.containersOut.includes(contract.container)) {
    return miss('STREAMING_OUTPUT_CONTAINER_UNSUPPORTED', `output container '${contract.container}' is unsupported`);
  }
  if (request.inputCodecs.some((codec) => !capabilities.inputCodecs.includes(codec)) ||
      request.outputCodecs.some((codec) => !capabilities.outputCodecs.includes(codec)) ||
      capabilities.supportsContainerCodecTuple?.(request) === false) {
    return miss(
      'STREAMING_CONTAINER_CODEC_TUPLE_UNSUPPORTED',
      `${request.inputContainer}[${request.inputCodecs.join('+')}] -> ` +
      `${contract.container}[${request.outputCodecs.join('+')}] is unsupported`,
    );
  }
  if (contract.target === 'stream' && !capabilities.streamObserver) {
    return miss('STREAMING_TARGET_OBSERVER_UNSUPPORTED', 'stream target has no observable write sink');
  }
  if (contract.fastStart === 'reserve' && !capabilities.positionedWrites) {
    return miss('STREAMING_POSITIONED_WRITES_UNSUPPORTED', 'reserve mode requires positioned reservation/patch writes');
  }
  if (contract.fragmented && !capabilities.fragmentedMp4) {
    return miss('STREAMING_FRAGMENTED_MODE_UNSUPPORTED', 'fragmented ISO BMFF output is unsupported');
  }
  if (contract.fastStart === 'in-memory' && !capabilities.fastStartInMemory) {
    return miss('STREAMING_FASTSTART_MODE_UNSUPPORTED', 'in-memory fast-start is unsupported');
  }
  if (contract.fastStart === 'reserve' && !capabilities.fastStartReserve) {
    return miss('STREAMING_FASTSTART_MODE_UNSUPPORTED', 'reserved fast-start is unsupported');
  }
  if (contract.appendOnly && !capabilities.appendOnlyWebm) {
    return miss('STREAMING_APPEND_ONLY_MODE_UNSUPPORTED', 'append-only live WebM is unsupported');
  }
  if (contract.writeChunkBytes !== undefined &&
      !capabilities.exactWriteChunkBytes?.includes(contract.writeChunkBytes)) {
    return miss(
      'STREAMING_WRITE_GRANULARITY_UNSUPPORTED',
      `exact ${contract.writeChunkBytes}-byte writes are unsupported`,
    );
  }
  const cap = contract.target === 'stream'
    ? capabilities.maximumStreamInputBytes
    : capabilities.maximumBufferInputBytes;
  if (cap !== undefined && request.inputSizeBytes !== undefined && request.inputSizeBytes > cap) {
    return miss(
      'STREAMING_VERIFIED_SCALE_CAP',
      `${contract.target} input ${request.inputSizeBytes} bytes exceeds verified cap ${cap}`,
    );
  }
  return Object.freeze({ supported: true as const, reasonCode: 'STREAMING_TUPLE_SUPPORTED' as const });
}

/** Convert only a typed capability miss to the shared Worker/realm-safe NA channel. */
export function assertStreamingTupleSupported(
  request: StreamingTupleRequest,
  capabilities: StreamingTupleCapabilities,
): void {
  const decision = decideStreamingTupleSupport(request, capabilities);
  if (decision.supported) return;
  throw new NotApplicableError({
    reasonCode: decision.reasonCode,
    operation: 'remux',
    engineId: request.engineId,
    tuple: tupleSummary(request),
    reason: decision.reason,
  });
}

export function tupleSummary(request: StreamingTupleRequest): ApplicabilityTupleSummary {
  const contract = request.contract;
  return {
    inputContainers: [request.inputContainer],
    inputCodecs: [...request.inputCodecs],
    outputContainer: contract.container,
    outputCodecs: [...request.outputCodecs],
    options: {
      target: contract.target,
      fragmented: contract.fragmented,
      appendOnly: contract.appendOnly,
      fastStart: contract.fastStart,
      ...(contract.writeChunkBytes !== undefined ? { writeChunkBytes: contract.writeChunkBytes } : {}),
      ...(contract.maximumPacketCount !== undefined ? { maximumPacketCount: contract.maximumPacketCount } : {}),
      ...(request.inputSizeBytes !== undefined ? { inputSizeBytes: request.inputSizeBytes } : {}),
    },
  };
}

function miss<T extends Exclude<StreamingTupleDecision, { supported: true }>['reasonCode']>(
  reasonCode: T,
  reason: string,
): Extract<StreamingTupleDecision, { supported: false }> {
  return Object.freeze({ supported: false as const, status: 'NA_ENGINE' as const, reasonCode, reason });
}
