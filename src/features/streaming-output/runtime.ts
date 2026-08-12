import type { OracleId, OracleOutcome, OracleVerdict } from '../../core/scenario.ts';
import type { JsonObject, JsonValue } from '../../core/canonical-json.ts';
import {
  evaluateStreamingCorrectness,
  streamingOutputContractFromOptions,
  type StreamingOutputContract,
  type StreamingRepresentation,
} from './contracts.ts';
import { assessFragmentedMp4 } from './fragmented-mp4.ts';
import { assessLiveWebm } from './live-webm.ts';
import { assessMpegTsStructure } from './mpeg-ts.ts';
import {
  assessInMemoryFastStartTrace,
  assessReserveWriteTrace,
  assessTimeToFirstByte,
  validateSinkTrace,
  type ReserveTraceContract,
} from './sink-trace.ts';
import {
  stableReasonCode,
  streamingError,
  streamingUnavailable,
  streamingVerdict,
  type SinkTrace,
  type SinkTraceContract,
  type SinkTraceEvent,
  type StreamingCorrectnessResult,
  type StreamingDecision,
} from './types.ts';
import { readIsoBmffRangeProgram, type IsoBmffRangeSource } from '../remux/readers.ts';

export const STREAMING_RUNTIME_EVIDENCE_SCHEMA = 'media-test/streaming-runtime-evidence@1' as const;
export const STREAMING_RUNTIME_RESULT_SCHEMA = 'media-test/streaming-runtime-result@1' as const;

export type StreamingContainerValidator = 'fragmented-mp4' | 'mpeg-ts' | 'live-webm' | 'external';

/** The executable contract selected from one authored streaming-output scenario. */
export interface StreamingScenarioRuntimeContract {
  readonly schema: 'media-test/streaming-scenario-contract@1';
  readonly scenarioId: string;
  readonly output: StreamingOutputContract;
  readonly containerValidator: StreamingContainerValidator;
  readonly cmaf: boolean;
  readonly requiresSinkTrace: true;
  readonly requiresTimeToFirstByte: boolean;
  readonly requiresBrowserAppend: boolean;
  readonly requiresResolvedRepresentation: boolean;
}

export type StreamingScenarioContractRecognition =
  | { readonly matched: false }
  | {
      readonly matched: true;
      readonly state: 'ERROR';
      readonly decision: StreamingDecision;
    }
  | {
      readonly matched: true;
      readonly state: 'OK';
      readonly contract: StreamingScenarioRuntimeContract;
    };

/** Raw adapter/runner evidence. Scalar write counters are deliberately not a substitute. */
export interface StreamingRuntimeEvidence {
  readonly schema: typeof STREAMING_RUNTIME_EVIDENCE_SCHEMA;
  readonly sinkTrace?: SinkTrace;
  readonly resolvedRepresentation?: StreamingRepresentation;
  readonly observedPacketCount?: number;
  readonly reserveCompletion?: ReserveTraceContract['completion'];
  readonly reserveOverflowReasonCode?: string;
  readonly observerPolicy?: string;
  readonly retainedOutputPolicy?: string;
  readonly measurementContract?: string;
}

export type StreamingRuntimeEvidenceReadResult =
  | {
      readonly state: 'OK';
      readonly source: 'direct-envelope' | 'direct-sink-trace' | 'output-envelope' | 'output-sink-trace';
      readonly evidence: StreamingRuntimeEvidence;
    }
  | {
      readonly state: 'ABSENT';
      readonly reasonCode: string;
      readonly detail: string;
    }
  | {
      readonly state: 'INVALID';
      readonly reasonCode: string;
      readonly detail: string;
    };

export interface StreamingComparabilityEvidence {
  readonly complete: boolean;
  readonly resolvedRepresentation?: StreamingRepresentation;
  readonly observerPolicy?: string;
  readonly retainedOutputPolicy?: string;
  readonly measurementContract?: string;
  readonly missingFields: readonly (
    | 'resolvedRepresentation'
    | 'observerPolicy'
    | 'retainedOutputPolicy'
    | 'measurementContract'
  )[];
}

export interface StreamingRuntimeHookInput {
  readonly scenario: unknown;
  readonly output?: unknown;
  readonly applicability: StreamingDecision;
  readonly mediaSemantics?: StreamingDecision;
  /** Runner-owned trace/envelope. When supplied, it takes precedence over output-attached evidence. */
  readonly runtimeEvidence?: unknown;
  /** Existing core layout/re-import evidence can supplement the dependency-free feature reader. */
  readonly containerValidity?: StreamingDecision;
  /** Result of a real MSE append attempt, including an honest NA_BROWSER outcome. */
  readonly browserAppend?: StreamingDecision;
}

export interface StreamingRuntimeChecks {
  readonly sinkTrace: readonly StreamingDecision[];
  readonly containerValidity: readonly StreamingDecision[];
  readonly mediaSemantics: readonly StreamingDecision[];
}

export type StreamingRuntimeHookResult =
  | { readonly handled: false }
  | {
      readonly handled: true;
      readonly state: 'ERROR';
      readonly reasonCode: string;
      readonly detail: string;
    }
  | {
      readonly handled: true;
      readonly state: 'ASSESSED';
      readonly contract: StreamingScenarioRuntimeContract;
      readonly evidence: StreamingRuntimeEvidenceReadResult;
      readonly comparability: StreamingComparabilityEvidence;
      readonly checks: StreamingRuntimeChecks;
      readonly result: StreamingCorrectnessResult;
    };

export type StreamingCoreHookDisposition =
  | { readonly kind: 'IGNORED' }
  | {
      readonly kind: 'NOT_APPLICABLE';
      readonly status: 'NA_ENGINE';
      readonly reasonCode: string;
      readonly detail: string;
    }
  | { readonly kind: 'ORACLE_OUTCOME'; readonly outcome: OracleOutcome };

/**
 * Recognize only the streaming-output family and freeze its full output-mode contract. A malformed
 * recognized scenario is an ERROR; an unrelated family remains untouched by the hook.
 */
export function recognizeStreamingScenarioContract(scenario: unknown): StreamingScenarioContractRecognition {
  if (!isRecord(scenario)) return Object.freeze({ matched: false as const });
  const id = scenario.id;
  const family = scenario.family;
  const matched = family === 'streaming-output' ||
    (typeof id === 'string' && id.startsWith('streaming-output/'));
  if (!matched) return Object.freeze({ matched: false as const });

  try {
    if (typeof id !== 'string' || !/^streaming-output\/[a-z0-9][a-z0-9_-]*$/.test(id)) {
      throw new TypeError('streaming-output scenario id is missing or non-canonical');
    }
    if (family !== undefined && family !== 'streaming-output') {
      throw new TypeError(`scenario family ${JSON.stringify(family)} conflicts with id ${id}`);
    }
    if (scenario.op !== 'remux') throw new TypeError('streaming-output scenarios must execute remux');
    const output = streamingOutputContractFromOptions(scenario.options);
    if (output.representation === 'other') {
      throw new TypeError(`streaming-output container ${JSON.stringify(output.container)} has no validator contract`);
    }
    const metrics = optionalStringArray(scenario.metrics, 'scenario.metrics');
    const requires = scenario.requires === undefined ? undefined : requireRecord(scenario.requires, 'scenario.requires');
    optionalStringArray(requires?.features, 'scenario.requires.features');
    const lowerId = id.toLowerCase();
    const isScale = /\/(?:stream|buffer)_(?:large|huge|massive)_/.test(lowerId);
    return Object.freeze({
      matched: true as const,
      state: 'OK' as const,
      contract: Object.freeze({
        schema: 'media-test/streaming-scenario-contract@1' as const,
        scenarioId: id,
        output,
        containerValidator: containerValidatorFor(output),
        cmaf: output.representation === 'fragmented-mp4' && lowerId.includes('cmaf'),
        requiresSinkTrace: true as const,
        requiresTimeToFirstByte: metrics.includes('timeToFirstByte'),
        // Full-output MSE append is covered by the ordinary rows. Scale rows isolate output retention
        // and use the complete neutral range reader instead of asking SourceBuffer to retain hours of
        // buffered media, which would make the browser probe itself the dominant memory consumer.
        requiresBrowserAppend: !isScale && (
          output.representation === 'fragmented-mp4' || output.representation === 'live-webm'
        ),
        requiresResolvedRepresentation: isScale,
      }),
    });
  } catch (error) {
    return Object.freeze({
      matched: true as const,
      state: 'ERROR' as const,
      decision: streamingError(
        'STREAMING_SCENARIO_CONTRACT_INVALID',
        error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      ),
    });
  }
}

/**
 * Read only real trace/evidence objects. In particular, targetWrites/firstByteMs/final counters are
 * never expanded into invented write positions, lengths, timestamps, or backpressure observations.
 */
export function readStreamingRuntimeEvidence(value: unknown): StreamingRuntimeEvidenceReadResult {
  if (isRecord(value) && value.schema === STREAMING_RUNTIME_EVIDENCE_SCHEMA) {
    return parseEvidenceEnvelope(value, 'direct-envelope');
  }
  if (isRecord(value) && value.schema === 'media-test/sink-trace@1') {
    return wrapDirectTrace(value, 'direct-sink-trace');
  }
  if (!isRecord(value)) return evidenceAbsent();
  if (hasOwn(value, 'streamingEvidence')) {
    if (!isRecord(value.streamingEvidence)) {
      return evidenceInvalid('STREAMING_EVIDENCE_ENVELOPE_INVALID', 'output.streamingEvidence must be an object');
    }
    return parseEvidenceEnvelope(value.streamingEvidence, 'output-envelope');
  }
  if (hasOwn(value, 'sinkTrace')) {
    return wrapDirectTrace(value.sinkTrace, 'output-sink-trace');
  }
  return evidenceAbsent();
}

/** Preserve an already validated core oracle outcome without changing its semantic disposition. */
export function streamingDecisionFromOracleOutcome(outcome: OracleOutcome): StreamingDecision {
  if (outcome.state === 'VERDICT') {
    return streamingVerdict(
      outcome.verdict,
      outcome.reasonCode,
      outcome.detail ?? `${outcome.oracle} returned ${outcome.verdict}`,
      outcome.measurements,
    );
  }
  if (outcome.state === 'UNAVAILABLE') {
    return streamingUnavailable(outcome.status, outcome.reasonCode, outcome.detail);
  }
  return streamingError(outcome.reasonCode, outcome.detail);
}

/**
 * Minimal runner/oracle hook. It selects the format reader, validates any real sink trace, keeps
 * browser append evidence independent, and applies the four-layer reducer exactly once.
 */
export async function assessStreamingRuntime(input: StreamingRuntimeHookInput): Promise<StreamingRuntimeHookResult> {
  const recognition = recognizeStreamingScenarioContract(input.scenario);
  if (!recognition.matched) return Object.freeze({ handled: false as const });
  if (recognition.state === 'ERROR') {
    return Object.freeze({
      handled: true as const,
      state: 'ERROR' as const,
      reasonCode: recognition.decision.reasonCode,
      detail: recognition.decision.detail,
    });
  }
  const contract = recognition.contract;
  const notExecuted = streamingError(
    'STREAMING_LAYER_NOT_EXECUTED',
    'operation was rejected before streaming evidence could be observed',
  );
  if (input.applicability.state !== 'VERDICT' || input.applicability.verdict !== 'PASS') {
    const mediaSemantics = input.mediaSemantics ?? notExecuted;
    const result = evaluateStreamingCorrectness({
      applicability: input.applicability,
      sinkTrace: notExecuted,
      containerValidity: notExecuted,
      mediaSemantics,
    });
    const absent = evidenceAbsent('operation was not applicable; no runtime evidence was read');
    return Object.freeze({
      handled: true as const,
      state: 'ASSESSED' as const,
      contract,
      evidence: absent,
      comparability: comparabilityEvidence(undefined),
      checks: freezeChecks([notExecuted], [notExecuted], [mediaSemantics]),
      result,
    });
  }

  const evidence = readStreamingRuntimeEvidence(input.runtimeEvidence ?? input.output);
  const sinkChecks: StreamingDecision[] = [];
  const sinkTrace = assessSinkLayer(contract, evidence, sinkChecks);
  const containerChecks: StreamingDecision[] = [];
  const containerValidity = await assessContainerLayer(contract, input.output, input.containerValidity, input.browserAppend, containerChecks);
  const mediaSemantics = input.mediaSemantics ?? streamingError(
    'STREAMING_MEDIA_SEMANTICS_EVIDENCE_MISSING',
    'runner supplied no independent media-semantics outcome',
  );
  const result = evaluateStreamingCorrectness({
    applicability: input.applicability,
    sinkTrace,
    containerValidity,
    mediaSemantics,
  });
  return Object.freeze({
    handled: true as const,
    state: 'ASSESSED' as const,
    contract,
    evidence,
    comparability: comparabilityEvidence(evidence.state === 'OK' ? evidence.evidence : undefined),
    checks: freezeChecks(sinkChecks, containerChecks, [mediaSemantics]),
    result,
  });
}

/** Convert the hook result to the two channels core must keep separate: NA_ENGINE vs oracle outcome. */
export function streamingRuntimeToCoreDisposition(
  assessment: StreamingRuntimeHookResult,
  oracle: OracleId,
): StreamingCoreHookDisposition {
  if (!assessment.handled) return Object.freeze({ kind: 'IGNORED' as const });
  const evidence = Object.freeze({
    streamingRuntime: serializeStreamingRuntimeAssessment(assessment),
  }) satisfies JsonObject;
  if (assessment.state === 'ERROR') {
    return Object.freeze({
      kind: 'ORACLE_OUTCOME' as const,
      outcome: Object.freeze({
        state: 'ERROR' as const,
        oracle,
        reasonCode: stableReasonCode(assessment.reasonCode),
        detail: assessment.detail,
        evidence,
      }),
    });
  }
  const result = assessment.result;
  const detail = runtimeResultDetail(result);
  if (result.status === 'NA_ENGINE') {
    return Object.freeze({
      kind: 'NOT_APPLICABLE' as const,
      status: 'NA_ENGINE' as const,
      reasonCode: result.reasonCode,
      detail,
    });
  }
  if (result.status === 'PASS' || result.status === 'FAIL') {
    const decisive = Object.values(result.layers).find(
      (layer) => layer.state === 'VERDICT' && layer.verdict === result.status && layer.reasonCode === result.reasonCode,
    );
    return Object.freeze({
      kind: 'ORACLE_OUTCOME' as const,
      outcome: Object.freeze({
        state: 'VERDICT' as const,
        oracle,
        verdict: result.status,
        reasonCode: result.reasonCode,
        detail,
        ...(decisive?.state === 'VERDICT' && decisive.measurements
          ? { measurements: { ...decisive.measurements } }
          : {}),
        evidence,
      }),
    });
  }
  if (result.status === 'NA_BROWSER' || result.status === 'NA_ASSET') {
    return Object.freeze({
      kind: 'ORACLE_OUTCOME' as const,
      outcome: Object.freeze({
        state: 'UNAVAILABLE' as const,
        oracle,
        status: result.status,
        reasonCode: result.reasonCode,
        detail,
        evidence,
      }),
    });
  }
  return Object.freeze({
    kind: 'ORACLE_OUTCOME' as const,
    outcome: Object.freeze({
      state: 'ERROR' as const,
      oracle,
      reasonCode: result.reasonCode,
      detail,
      evidence,
    }),
  });
}

/** JSON-safe evidence envelope persisted on the combined oracle outcome. */
export function serializeStreamingRuntimeAssessment(
  assessment: Exclude<StreamingRuntimeHookResult, { handled: false }>,
): JsonObject {
  if (assessment.state === 'ERROR') {
    return {
      schema: STREAMING_RUNTIME_RESULT_SCHEMA,
      state: assessment.state,
      reasonCode: assessment.reasonCode,
      detail: assessment.detail,
    };
  }
  return {
    schema: STREAMING_RUNTIME_RESULT_SCHEMA,
    state: assessment.state,
    contract: jsonRecord(assessment.contract),
    evidence: serializeEvidenceRead(assessment.evidence),
    comparability: jsonRecord(assessment.comparability),
    checks: jsonRecord(assessment.checks),
    result: jsonRecord(assessment.result),
  };
}

function assessSinkLayer(
  contract: StreamingScenarioRuntimeContract,
  evidenceRead: StreamingRuntimeEvidenceReadResult,
  checks: StreamingDecision[],
): StreamingDecision {
  if (evidenceRead.state !== 'OK') {
    const decision = streamingError(evidenceRead.reasonCode, evidenceRead.detail);
    checks.push(decision);
    return decision;
  }
  const evidence = evidenceRead.evidence;
  if (!evidence.sinkTrace) {
    const decision = streamingError(
      'STREAMING_SINK_TRACE_EVIDENCE_MISSING',
      'runtime evidence contains no sink trace; scalar write counters are not trace evidence',
    );
    checks.push(decision);
    return decision;
  }
  const sinkContract: SinkTraceContract = {
    target: contract.output.target,
    appendOnly: contract.output.appendOnly,
    ...(contract.output.writeChunkBytes !== undefined
      ? { writeChunkBytes: contract.output.writeChunkBytes }
      : {}),
    requireAwaitedBackpressure: contract.output.target === 'stream',
    requireNonEmpty: true,
  };
  const traceDecision = validateSinkTrace(evidence.sinkTrace, sinkContract);
  checks.push(traceDecision);
  if (isFail(traceDecision)) return traceDecision;

  if (evidence.resolvedRepresentation !== undefined) {
    const representation = evidence.resolvedRepresentation === contract.output.representation
      ? streamingVerdict(
          'PASS',
          'STREAMING_RESOLVED_REPRESENTATION_MATCH',
          `resolved ${evidence.resolvedRepresentation}`,
        )
      : streamingVerdict(
          'FAIL',
          'STREAMING_RESOLVED_REPRESENTATION_MISMATCH',
          `resolved ${evidence.resolvedRepresentation}, requested ${contract.output.representation}`,
        );
    checks.push(representation);
  }

  if (contract.output.fastStart === 'reserve') {
    if (evidence.observedPacketCount === undefined || evidence.reserveCompletion === undefined) {
      checks.push(streamingError(
        'STREAMING_RESERVE_EVIDENCE_INCOMPLETE',
        'reserve mode requires observedPacketCount and reserveCompletion in addition to the write trace',
      ));
    } else {
      checks.push(assessReserveWriteTrace(evidence.sinkTrace, {
        maximumPacketCount: contract.output.maximumPacketCount!,
        observedPacketCount: evidence.observedPacketCount,
        completion: evidence.reserveCompletion,
        ...(evidence.reserveOverflowReasonCode
          ? { overflowReasonCode: evidence.reserveOverflowReasonCode }
          : {}),
      }));
    }
  } else if (contract.output.fastStart === 'in-memory') {
    checks.push(assessInMemoryFastStartTrace(evidence.sinkTrace));
  }
  if (contract.requiresTimeToFirstByte) checks.push(assessTimeToFirstByte(evidence.sinkTrace));
  return reduceRequiredSinkChecks(checks);
}

async function assessContainerLayer(
  contract: StreamingScenarioRuntimeContract,
  outputValue: unknown,
  external: StreamingDecision | undefined,
  browserAppend: StreamingDecision | undefined,
  checks: StreamingDecision[],
): Promise<StreamingDecision> {
  const output = readOutputBytes(outputValue);
  if (output.state === 'INVALID') {
    const invalid = streamingError(output.reasonCode, output.detail);
    checks.push(invalid);
  } else if (output.container !== contract.output.container) {
    checks.push(streamingVerdict(
      'FAIL',
      'STREAMING_OUTPUT_CONTAINER_MISMATCH',
      `output container ${output.container} != requested ${contract.output.container}`,
    ));
  } else if (contract.containerValidator === 'fragmented-mp4') {
    if (output.artifact !== undefined) {
      const read = await readIsoBmffRangeProgram(output.artifact, output.container);
      checks.push(
        read.state === 'OK' && read.value.representation.fragmented === true
          ? streamingVerdict(
              'PASS',
              contract.cmaf ? 'CMAF_RANGE_FRAGMENT_STRUCTURE_VALID' : 'FMP4_RANGE_FRAGMENT_STRUCTURE_VALID',
              `${read.value.tracks.length} range-read track(s), ` +
                `${read.value.tracks.reduce((sum, track) => sum + track.samples.length, 0)} sample(s)`,
              {
                tracks: read.value.tracks.length,
                samples: read.value.tracks.reduce((sum, track) => sum + track.samples.length, 0),
              },
            )
          : streamingVerdict(
              'FAIL',
              read.state === 'OK'
                ? 'FMP4_RANGE_REPRESENTATION_MISMATCH'
                : read.reasonCode,
              read.state === 'OK'
                ? 'range-read ISO-BMFF output is not fragmented'
                : `range-read fragmented MP4 ${read.state}`,
            ),
      );
    } else {
      checks.push(assessFragmentedMp4(output.bytes, { cmaf: contract.cmaf }));
    }
  } else if (contract.containerValidator === 'mpeg-ts') {
    checks.push(assessMpegTsStructure(output.bytes));
  } else if (contract.containerValidator === 'live-webm') {
    checks.push(await assessLiveWebm(output.bytes));
  }

  if (external) checks.push(external);
  if (contract.containerValidator === 'external' && !external) {
    checks.push(streamingError(
      'STREAMING_EXTERNAL_CONTAINER_EVIDENCE_MISSING',
      `representation ${contract.output.representation} requires the core structural/re-import reader outcome`,
    ));
  }
  if (browserAppend) checks.push(browserAppend);
  else if (contract.requiresBrowserAppend) {
    checks.push(streamingError(
      'STREAMING_BROWSER_APPEND_PROBE_NOT_RUN',
      'no real MediaSource append result was supplied; browser support was not guessed',
    ));
  }
  return reduceIndependentChecks(checks, 'STREAMING_CONTAINER_LAYER_NO_EVIDENCE');
}

function reduceRequiredSinkChecks(checks: readonly StreamingDecision[]): StreamingDecision {
  const sorted = sortDecisions(checks);
  const fail = findVerdict(sorted, 'FAIL');
  if (fail) return fail;
  const error = sorted.find((decision) => decision.state === 'ERROR');
  if (error) return error;
  const unavailable = sorted.find((decision) => decision.state === 'UNAVAILABLE');
  if (unavailable) return unavailable;
  if (!findVerdict(sorted, 'PASS')) {
    return streamingError('STREAMING_SINK_LAYER_NO_EVIDENCE', 'sink layer produced no required check outcome');
  }
  return streamingVerdict(
    'PASS',
    'STREAMING_SINK_LAYER_VALID',
    `${checks.length} required sink/algorithm check(s) passed`,
  );
}

/** Independent checks use the same semantic-first rule as the four top-level layers. */
function reduceIndependentChecks(checks: readonly StreamingDecision[], emptyReasonCode: string): StreamingDecision {
  const sorted = sortDecisions(checks);
  const decisive = findVerdict(sorted, 'FAIL') ?? findVerdict(sorted, 'PASS');
  if (decisive) return decisive;
  const error = sorted.find((decision) => decision.state === 'ERROR');
  if (error) return error;
  const browser = sorted.find((decision) => decision.state === 'UNAVAILABLE' && decision.status === 'NA_BROWSER');
  if (browser) return browser;
  const asset = sorted.find((decision) => decision.state === 'UNAVAILABLE' && decision.status === 'NA_ASSET');
  if (asset) return asset;
  const engine = sorted.find((decision) => decision.state === 'UNAVAILABLE' && decision.status === 'NA_ENGINE');
  if (engine) return streamingError('STREAMING_DOWNSTREAM_NA_ENGINE_INVALID', engine.detail);
  return streamingError(emptyReasonCode, 'no independent check produced evidence');
}

function findVerdict(
  decisions: readonly StreamingDecision[],
  verdict: OracleVerdict,
): Extract<StreamingDecision, { state: 'VERDICT' }> | undefined {
  return decisions.find(
    (decision): decision is Extract<StreamingDecision, { state: 'VERDICT' }> =>
      decision.state === 'VERDICT' && decision.verdict === verdict,
  );
}

function sortDecisions(decisions: readonly StreamingDecision[]): StreamingDecision[] {
  return [...decisions].sort((left, right) =>
    `${left.reasonCode}\u0000${left.detail}`.localeCompare(`${right.reasonCode}\u0000${right.detail}`));
}

function isFail(decision: StreamingDecision): boolean {
  return decision.state === 'VERDICT' && decision.verdict === 'FAIL';
}

function containerValidatorFor(output: StreamingOutputContract): StreamingContainerValidator {
  if (output.representation === 'fragmented-mp4') return 'fragmented-mp4';
  if (output.representation === 'mpeg-ts') return 'mpeg-ts';
  if (output.representation === 'live-webm') return 'live-webm';
  return 'external';
}

function parseEvidenceEnvelope(
  value: Record<string, unknown>,
  source: Extract<StreamingRuntimeEvidenceReadResult, { state: 'OK' }>['source'],
): StreamingRuntimeEvidenceReadResult {
  if (value.schema !== STREAMING_RUNTIME_EVIDENCE_SCHEMA) {
    return evidenceInvalid(
      'STREAMING_EVIDENCE_SCHEMA_INVALID',
      `expected ${STREAMING_RUNTIME_EVIDENCE_SCHEMA}, received ${String(value.schema)}`,
    );
  }
  let sinkTrace: SinkTrace | undefined;
  if (value.sinkTrace !== undefined) {
    const trace = parseSinkTrace(value.sinkTrace);
    if (!trace.ok) return evidenceInvalid(trace.reasonCode, trace.detail);
    sinkTrace = trace.value;
  }
  const resolvedRepresentation = optionalRepresentation(value.resolvedRepresentation);
  if (resolvedRepresentation === null) {
    return evidenceInvalid('STREAMING_RESOLVED_REPRESENTATION_INVALID', 'resolvedRepresentation is not canonical');
  }
  const observedPacketCount = optionalNonNegativeInteger(value.observedPacketCount);
  if (observedPacketCount === null) {
    return evidenceInvalid('STREAMING_PACKET_COUNT_EVIDENCE_INVALID', 'observedPacketCount must be a non-negative integer');
  }
  const reserveCompletion = value.reserveCompletion;
  if (reserveCompletion !== undefined &&
      reserveCompletion !== 'COMPLETED' && reserveCompletion !== 'OVERFLOW_REJECTED' && reserveCompletion !== 'FAILED') {
    return evidenceInvalid('STREAMING_RESERVE_COMPLETION_INVALID', 'reserveCompletion is not canonical');
  }
  const reserveOverflowReasonCode = optionalStableReason(value.reserveOverflowReasonCode);
  if (reserveOverflowReasonCode === null) {
    return evidenceInvalid('STREAMING_RESERVE_REASON_INVALID', 'reserveOverflowReasonCode is not a stable reason code');
  }
  const observerPolicy = optionalNonEmptyString(value.observerPolicy);
  const retainedOutputPolicy = optionalNonEmptyString(value.retainedOutputPolicy);
  const measurementContract = optionalNonEmptyString(value.measurementContract);
  if (observerPolicy === null || retainedOutputPolicy === null || measurementContract === null) {
    return evidenceInvalid('STREAMING_MEASUREMENT_IDENTITY_INVALID', 'measurement identity fields must be non-empty strings');
  }
  const evidence: StreamingRuntimeEvidence = Object.freeze({
    schema: STREAMING_RUNTIME_EVIDENCE_SCHEMA,
    ...(sinkTrace ? { sinkTrace } : {}),
    ...(resolvedRepresentation ? { resolvedRepresentation } : {}),
    ...(observedPacketCount !== undefined ? { observedPacketCount } : {}),
    ...(reserveCompletion !== undefined ? { reserveCompletion } : {}),
    ...(reserveOverflowReasonCode ? { reserveOverflowReasonCode } : {}),
    ...(observerPolicy ? { observerPolicy } : {}),
    ...(retainedOutputPolicy ? { retainedOutputPolicy } : {}),
    ...(measurementContract ? { measurementContract } : {}),
  });
  return Object.freeze({ state: 'OK' as const, source, evidence });
}

function wrapDirectTrace(
  value: unknown,
  source: 'direct-sink-trace' | 'output-sink-trace',
): StreamingRuntimeEvidenceReadResult {
  const trace = parseSinkTrace(value);
  if (!trace.ok) return evidenceInvalid(trace.reasonCode, trace.detail);
  return Object.freeze({
    state: 'OK' as const,
    source,
    evidence: Object.freeze({ schema: STREAMING_RUNTIME_EVIDENCE_SCHEMA, sinkTrace: trace.value }),
  });
}

function parseSinkTrace(value: unknown):
  | { readonly ok: true; readonly value: SinkTrace }
  | { readonly ok: false; readonly reasonCode: string; readonly detail: string } {
  if (!isRecord(value) || value.schema !== 'media-test/sink-trace@1') {
    return invalidTrace('STREAMING_SINK_TRACE_SCHEMA_INVALID', 'sink trace schema is absent or unrecognized');
  }
  if (value.target !== 'buffer' && value.target !== 'stream') {
    return invalidTrace('STREAMING_SINK_TRACE_SHAPE_INVALID', 'sink trace target must be buffer or stream');
  }
  if (!Array.isArray(value.events) || !value.events.every(isSinkTraceEvent)) {
    return invalidTrace('STREAMING_SINK_TRACE_EVENTS_INVALID', 'sink trace events are not structurally valid');
  }
  for (const field of [
    'totalUniqueBytes',
    'nativeWriteBytes',
    'maximumOutstandingWritePromises',
    'maximumQueuedBytes',
    'retainedOutputBytes',
  ] as const) {
    if (!isNonNegativeInteger(value[field])) {
      return invalidTrace('STREAMING_SINK_TRACE_COUNTERS_INVALID', `${field} must be a non-negative integer`);
    }
  }
  if (typeof value.rollingHash !== 'string' || value.rollingHashAlgorithm !== 'fnv1a64' ||
      !(value.validationPrefix instanceof Uint8Array) || !(value.validationTail instanceof Uint8Array)) {
    return invalidTrace('STREAMING_SINK_TRACE_PAYLOAD_INVALID', 'hash/prefix/tail evidence is malformed');
  }
  return Object.freeze({ ok: true as const, value: value as unknown as SinkTrace });
}

function isSinkTraceEvent(value: unknown): value is SinkTraceEvent {
  if (!isRecord(value) || !isNonNegativeInteger(value.sequence) || !isFiniteNumber(value.atMs)) return false;
  if (value.type === 'operation-start') return true;
  if (value.type === 'reservation') {
    return isNonNegativeInteger(value.position) && isPositiveInteger(value.length) &&
      isPositiveInteger(value.maximumPacketCount);
  }
  if (value.type === 'write') {
    return isNonNegativeInteger(value.position) && isPositiveInteger(value.length) &&
      isNonNegativeInteger(value.cumulativeUniqueBytes) && isPositiveInteger(value.outstandingWritePromises);
  }
  if (value.type === 'buffer-observable') {
    return isNonNegativeInteger(value.length);
  }
  if (value.type === 'finalize-start' || value.type === 'finalize-complete' ||
      value.type === 'close' || value.type === 'abort') {
    return value.reasonCode === undefined || (typeof value.reasonCode === 'string' && stableReason(value.reasonCode));
  }
  return false;
}

function readOutputBytes(value: unknown):
  | {
      readonly state: 'OK';
      readonly bytes: Uint8Array;
      readonly mime: string;
      readonly container: string;
      readonly artifact?: IsoBmffRangeSource;
    }
  | { readonly state: 'INVALID'; readonly reasonCode: string; readonly detail: string } {
  if (!isRecord(value) || !(value.bytes instanceof Uint8Array) ||
      typeof value.mime !== 'string' || value.mime.trim() === '' ||
      typeof value.container !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(value.container)) {
    return Object.freeze({
      state: 'INVALID' as const,
      reasonCode: 'STREAMING_OUTPUT_BYTES_EVIDENCE_INVALID',
      detail: 'output must expose Uint8Array bytes plus canonical non-empty mime/container values',
    });
  }
  let artifact: IsoBmffRangeSource | undefined;
  if (value.artifact !== undefined) {
    if (
      !isRecord(value.artifact) ||
      value.artifact.schema !== 'media-test/media-range-artifact@1' ||
      !isNonNegativeInteger(value.artifact.byteLength) ||
      typeof value.artifact.range !== 'function'
    ) {
      return Object.freeze({
        state: 'INVALID' as const,
        reasonCode: 'STREAMING_OUTPUT_RANGE_ARTIFACT_INVALID',
        detail: 'output range artifact is malformed',
      });
    }
    artifact = {
      size: value.artifact.byteLength,
      range: value.artifact.range as IsoBmffRangeSource['range'],
    };
  }
  return Object.freeze({
    state: 'OK' as const,
    bytes: value.bytes,
    mime: value.mime,
    container: value.container,
    ...(artifact ? { artifact } : {}),
  });
}

function comparabilityEvidence(evidence: StreamingRuntimeEvidence | undefined): StreamingComparabilityEvidence {
  const missingFields: StreamingComparabilityEvidence['missingFields'][number][] = [];
  if (!evidence?.resolvedRepresentation) missingFields.push('resolvedRepresentation');
  if (!evidence?.observerPolicy) missingFields.push('observerPolicy');
  if (!evidence?.retainedOutputPolicy) missingFields.push('retainedOutputPolicy');
  if (!evidence?.measurementContract) missingFields.push('measurementContract');
  return Object.freeze({
    complete: missingFields.length === 0,
    ...(evidence?.resolvedRepresentation ? { resolvedRepresentation: evidence.resolvedRepresentation } : {}),
    ...(evidence?.observerPolicy ? { observerPolicy: evidence.observerPolicy } : {}),
    ...(evidence?.retainedOutputPolicy ? { retainedOutputPolicy: evidence.retainedOutputPolicy } : {}),
    ...(evidence?.measurementContract ? { measurementContract: evidence.measurementContract } : {}),
    missingFields: Object.freeze(missingFields),
  });
}

function freezeChecks(
  sinkTrace: readonly StreamingDecision[],
  containerValidity: readonly StreamingDecision[],
  mediaSemantics: readonly StreamingDecision[],
): StreamingRuntimeChecks {
  return Object.freeze({
    sinkTrace: Object.freeze([...sinkTrace]),
    containerValidity: Object.freeze([...containerValidity]),
    mediaSemantics: Object.freeze([...mediaSemantics]),
  });
}

function runtimeResultDetail(result: StreamingCorrectnessResult): string {
  const layers = Object.values(result.layers)
    .sort((left, right) => left.layer.localeCompare(right.layer))
    .map((layer) => {
      const disposition = layer.state === 'VERDICT'
        ? layer.verdict
        : layer.state === 'UNAVAILABLE'
          ? layer.status
          : 'ERROR';
      return `${layer.layer}=${disposition}[${layer.reasonCode}] ${layer.detail}`;
    });
  return layers.join('; ');
}

function evidenceAbsent(
  detail = 'no sink trace or media-test/streaming-runtime-evidence@1 envelope was supplied; scalar counters were not expanded',
): Extract<StreamingRuntimeEvidenceReadResult, { state: 'ABSENT' }> {
  return Object.freeze({ state: 'ABSENT' as const, reasonCode: 'STREAMING_RUNTIME_EVIDENCE_ABSENT', detail });
}

function evidenceInvalid(
  reasonCode: string,
  detail: string,
): Extract<StreamingRuntimeEvidenceReadResult, { state: 'INVALID' }> {
  return Object.freeze({ state: 'INVALID' as const, reasonCode: stableReasonCode(reasonCode), detail });
}

function invalidTrace(
  reasonCode: string,
  detail: string,
): { readonly ok: false; readonly reasonCode: string; readonly detail: string } {
  return Object.freeze({ ok: false as const, reasonCode: stableReasonCode(reasonCode), detail });
}

function serializeEvidenceRead(value: StreamingRuntimeEvidenceReadResult): JsonObject {
  return jsonRecord(value);
}

function jsonRecord(value: object): JsonObject {
  const converted = jsonValue(value, new Set<object>());
  if (converted === null || Array.isArray(converted) || typeof converted !== 'object') {
    throw new TypeError('streaming runtime evidence root must serialize to a JSON object');
  }
  return converted;
}

function jsonValue(value: unknown, active: Set<object>): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('streaming runtime evidence contains a non-finite number');
    return value;
  }
  if (value instanceof Uint8Array) return Array.from(value);
  if (Array.isArray(value)) return value.map((entry) => jsonValue(entry, active));
  if (typeof value !== 'object') {
    throw new TypeError(`streaming runtime evidence contains non-JSON ${typeof value}`);
  }
  if (active.has(value)) throw new TypeError('streaming runtime evidence contains a cycle');
  active.add(value);
  try {
    const out: JsonObject = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) out[key] = jsonValue(entry, active);
    }
    return out;
  } finally {
    active.delete(value);
  }
}

function optionalRepresentation(value: unknown): StreamingRepresentation | undefined | null {
  if (value === undefined) return undefined;
  return isRepresentation(value) ? value : null;
}

function isRepresentation(value: unknown): value is StreamingRepresentation {
  return value === 'progressive-mp4' || value === 'fragmented-mp4' ||
    value === 'faststart-in-memory-mp4' || value === 'faststart-reserve-mp4' ||
    value === 'finite-webm' || value === 'live-webm' || value === 'mpeg-ts' || value === 'other';
}

function optionalNonNegativeInteger(value: unknown): number | undefined | null {
  if (value === undefined) return undefined;
  return isNonNegativeInteger(value) ? value : null;
}

function optionalNonEmptyString(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function optionalStableReason(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === 'string' && stableReason(value) ? value : null;
}

function stableReason(value: string): boolean {
  return /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/.test(value);
}

function optionalStringArray(value: unknown, field: string): readonly string[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new TypeError(`${field} must be a string array`);
  }
  return value;
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${field} must be an object`);
  return value;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}
