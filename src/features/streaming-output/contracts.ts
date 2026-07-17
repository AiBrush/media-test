import type { OracleVerdict } from '../../core/scenario.ts';
import {
  stableReasonCode,
  type StreamingCorrectnessLayer,
  type StreamingCorrectnessResult,
  type StreamingDecision,
  type StreamingLayerOutcome,
} from './types.ts';

export interface StreamingCorrectnessInput {
  readonly applicability: StreamingDecision;
  readonly sinkTrace: StreamingDecision;
  readonly containerValidity: StreamingDecision;
  readonly mediaSemantics: StreamingDecision;
}

/**
 * Order-independent four-layer reduction. An unsupported tuple short-circuits semantics without
 * laundering it into FAIL/ERROR. Every downstream layer is required: a proved semantic/container
 * FAIL wins first, then a harness ERROR or unavailable required layer blocks admission, and only
 * complete evidence can reduce to DIFF/PASS.
 *
 * Optional sub-check coverage is reduced inside its owning layer (for example structural FMP4
 * evidence may survive an unavailable MSE append probe). At this boundary, however, the four named
 * layers themselves are mandatory. Only applicability may short-circuit a complete cell as
 * NA_ENGINE.
 */
export function evaluateStreamingCorrectness(input: StreamingCorrectnessInput): StreamingCorrectnessResult {
  const layers: Record<StreamingCorrectnessLayer, StreamingLayerOutcome> = {
    applicability: withLayer('applicability', input.applicability),
    'sink-trace': withLayer('sink-trace', input.sinkTrace),
    'container-validity': withLayer('container-validity', input.containerValidity),
    'media-semantics': withLayer('media-semantics', input.mediaSemantics),
  };

  const applicability = layers.applicability;
  if (applicability.state === 'UNAVAILABLE') {
    return applicability.status === 'NA_ENGINE'
      ? freezeResult(applicability.status, applicability.reasonCode, layers)
      : freezeResult('ERROR', 'STREAMING_APPLICABILITY_UNAVAILABLE_STATUS_INVALID', layers);
  }
  if (applicability.state === 'ERROR') {
    return freezeResult('ERROR', applicability.reasonCode, layers);
  }
  if (applicability.verdict !== 'PASS') {
    return freezeResult('ERROR', 'STREAMING_APPLICABILITY_INVALID_VERDICT', layers);
  }

  const downstream = canonicalLayerOrder([
    layers['sink-trace'],
    layers['container-validity'],
    layers['media-semantics'],
  ]);
  const verdicts = downstream.filter((decision): decision is StreamingLayerOutcome & {
    state: 'VERDICT'; verdict: OracleVerdict;
  } => decision.state === 'VERDICT');
  const failure = verdicts.find((decision) => decision.verdict === 'FAIL');
  if (failure) return freezeResult('FAIL', failure.reasonCode, layers);

  const misplacedEngine = downstream.find(
    (decision) => decision.state === 'UNAVAILABLE' && decision.status === 'NA_ENGINE',
  );
  if (misplacedEngine) return freezeResult('ERROR', 'STREAMING_DOWNSTREAM_NA_ENGINE_INVALID', layers);
  const error = downstream.find((decision) => decision.state === 'ERROR');
  if (error?.state === 'ERROR') return freezeResult('ERROR', error.reasonCode, layers);
  const browser = downstream.find(
    (decision) => decision.state === 'UNAVAILABLE' && decision.status === 'NA_BROWSER',
  );
  if (browser?.state === 'UNAVAILABLE') return freezeResult('NA_BROWSER', browser.reasonCode, layers);
  const asset = downstream.find(
    (decision) => decision.state === 'UNAVAILABLE' && decision.status === 'NA_ASSET',
  );
  if (asset?.state === 'UNAVAILABLE') return freezeResult('NA_ASSET', asset.reasonCode, layers);
  const pass = verdicts.find((decision) => decision.verdict === 'PASS');
  if (pass && verdicts.length === downstream.length) {
    return freezeResult('PASS', 'STREAMING_CORRECTNESS_VALID', layers);
  }
  return freezeResult('ERROR', 'STREAMING_LAYER_EVIDENCE_INCOMPLETE', layers);
}

export type StreamingRepresentation =
  | 'progressive-mp4'
  | 'fragmented-mp4'
  | 'faststart-in-memory-mp4'
  | 'faststart-reserve-mp4'
  | 'finite-webm'
  | 'live-webm'
  | 'mpeg-ts'
  | 'other';

export interface StreamingOutputContract {
  readonly container: string;
  readonly target: 'buffer' | 'stream';
  readonly representation: StreamingRepresentation;
  readonly fragmented: boolean;
  readonly appendOnly: boolean;
  readonly fastStart: false | 'in-memory' | 'reserve' | null;
  readonly writeChunkBytes?: number;
  readonly maximumPacketCount?: number;
}

/** Strictly parse the existing remux option vocabulary; ambiguous/invalid shapes are harness errors. */
export function streamingOutputContractFromOptions(options: unknown): StreamingOutputContract {
  if (!isRecord(options)) throw new TypeError('streaming output options must be an object');
  const container = requireToken(options.container, 'container');
  const target = options.target === undefined ? 'buffer' : options.target;
  if (target !== 'buffer' && target !== 'stream') throw new TypeError("target must be 'buffer' or 'stream'");
  const fragmented = options.fragmented === undefined ? false : options.fragmented;
  if (typeof fragmented !== 'boolean') throw new TypeError('fragmented must be boolean');
  const appendOnly = options.appendOnly === undefined ? false : options.appendOnly;
  if (typeof appendOnly !== 'boolean') throw new TypeError('appendOnly must be boolean');
  const fastStart = options.fastStart === undefined ? null : options.fastStart;
  if (fastStart !== null && fastStart !== false && fastStart !== 'in-memory' && fastStart !== 'reserve') {
    throw new TypeError("fastStart must be false, 'in-memory', or 'reserve'");
  }
  if (fragmented && fastStart !== null) throw new TypeError('fragmented and fastStart are mutually exclusive');
  if (appendOnly && container !== 'webm' && container !== 'mkv') {
    throw new TypeError('appendOnly is valid only for WebM/Matroska');
  }
  const writeChunkBytes = optionalPositiveInteger(options.writeChunkBytes, 'writeChunkBytes');
  const maximumPacketCount = optionalPositiveInteger(options.maximumPacketCount, 'maximumPacketCount');
  if (fastStart === 'reserve' && maximumPacketCount === undefined) {
    throw new TypeError('fastStart reserve requires maximumPacketCount');
  }
  if (fastStart !== 'reserve' && maximumPacketCount !== undefined) {
    throw new TypeError('maximumPacketCount is meaningful only for fastStart reserve');
  }
  return Object.freeze({
    container,
    target,
    representation: representationFor(container, fragmented, appendOnly, fastStart),
    fragmented,
    appendOnly,
    fastStart,
    ...(writeChunkBytes !== undefined ? { writeChunkBytes } : {}),
    ...(maximumPacketCount !== undefined ? { maximumPacketCount } : {}),
  });
}

function representationFor(
  container: string,
  fragmented: boolean,
  appendOnly: boolean,
  fastStart: StreamingOutputContract['fastStart'],
): StreamingRepresentation {
  if (container === 'mp4' || container === 'mov') {
    if (fragmented) return 'fragmented-mp4';
    if (fastStart === 'reserve') return 'faststart-reserve-mp4';
    if (fastStart === 'in-memory') return 'faststart-in-memory-mp4';
    return 'progressive-mp4';
  }
  if (container === 'webm' || container === 'mkv') return appendOnly ? 'live-webm' : 'finite-webm';
  if (container === 'ts') return 'mpeg-ts';
  return 'other';
}

function withLayer(layer: StreamingCorrectnessLayer, decision: StreamingDecision): StreamingLayerOutcome {
  stableReasonCode(decision.reasonCode);
  return Object.freeze({ ...decision, layer }) as StreamingLayerOutcome;
}

function freezeResult(
  status: StreamingCorrectnessResult['status'],
  reasonCode: string,
  layers: Record<StreamingCorrectnessLayer, StreamingLayerOutcome>,
): StreamingCorrectnessResult {
  return Object.freeze({
    schema: 'media-test/streaming-correctness@1' as const,
    status,
    reasonCode: stableReasonCode(reasonCode),
    layers: Object.freeze({ ...layers }),
  });
}

function canonicalLayerOrder(outcomes: readonly StreamingLayerOutcome[]): StreamingLayerOutcome[] {
  return [...outcomes].sort((left, right) =>
    `${left.layer}\u0000${left.reasonCode}\u0000${left.detail}`.localeCompare(
      `${right.layer}\u0000${right.reasonCode}\u0000${right.detail}`,
    ));
}

function optionalPositiveInteger(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new TypeError(`${field} must be a positive safe integer`);
  }
  return value as number;
}

function requireToken(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(value)) {
    throw new TypeError(`${field} must be a canonical token`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
