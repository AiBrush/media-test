import type { MediaBytes } from '../../core/engine.ts';
import type {
  OracleOutcome,
  OracleUnavailableStatus,
  OracleVerdict,
} from '../../core/scenario.ts';
import type { DecodedAudioSignal } from './audio.ts';
import { evaluateTranscodedAudioContent } from './audio.ts';
import {
  TRANSCODE_ROUNDTRIP_CONTRACT,
  transcodeAudioContractForScenario,
  transcodeTransformContractForScenario,
} from './contracts.ts';
import {
  assessTranscodeRoundTripProvenance,
  executeTranscodeRoundTrip,
  type ExecuteTranscodeLeg,
  type TranscodeRoundTripContract,
  type TranscodeRoundTripEvidence,
} from './composition.ts';
import {
  admitTranscodeMetrics,
  type TranscodeMetricAdmission,
  type TranscodeMetricAdmissionContract,
} from './metrics.ts';
import {
  evaluateTranscodeTransform,
  type TranscodePixelFrame,
  type TransformSignalEvidence,
} from './transforms.ts';
import {
  isRecord,
  transcodeError,
  type TranscodeDecision,
  type TranscodeOracleEvidence,
  type TranscodeRateEvidence,
} from './types.ts';

export const TRANSCODE_EFFECT_INVARIANT = 'transcode-effect-aware' as const;
export const TRANSCODE_AUDIO_CONTENT_INVARIANT = 'transcode-audio-content' as const;
export const TRANSCODE_ROUNDTRIP_INVARIANT = 'transcode-roundtrip-composed' as const;

/** Exact tokens owned by REQ-FEAT-20/21/23. No case-folding, prefix matching, or aliases. */
export const TRANSCODE_RUNTIME_INVARIANTS = Object.freeze([
  TRANSCODE_EFFECT_INVARIANT,
  TRANSCODE_AUDIO_CONTENT_INVARIANT,
  TRANSCODE_ROUNDTRIP_INVARIANT,
] as const);

export type TranscodeRuntimeInvariant = (typeof TRANSCODE_RUNTIME_INVARIANTS)[number];

export function isTranscodeRuntimeInvariant(value: unknown): value is TranscodeRuntimeInvariant {
  return typeof value === 'string' &&
    (TRANSCODE_RUNTIME_INVARIANTS as readonly string[]).includes(value);
}

/** Read only the exact `options.invariant` contract; a typo must remain unknown to the runner. */
export function readTranscodeRuntimeInvariant(options: unknown): TranscodeRuntimeInvariant | undefined {
  if (!isRecord(options)) return undefined;
  return isTranscodeRuntimeInvariant(options.invariant) ? options.invariant : undefined;
}

/**
 * Generic, serializable feature-layer outcome. Core can rename `layer` to its own oracle/result key
 * without this module importing the core oracle implementation (and without losing DIFF/NA/ERROR).
 */
export type TranscodeLayerOutcome<Layer extends string = string> =
  | Readonly<{
      layer: Layer;
      state: 'VERDICT';
      verdict: OracleVerdict;
      reasonCode: string;
      detail: string;
      measurements?: Readonly<Record<string, number>>;
    }>
  | Readonly<{
      layer: Layer;
      state: 'UNAVAILABLE';
      status: OracleUnavailableStatus;
      reasonCode: string;
      detail: string;
      measurements?: Readonly<Record<string, number>>;
    }>
  | Readonly<{
      layer: Layer;
      state: 'ERROR';
      reasonCode: string;
      detail: string;
      measurements?: Readonly<Record<string, number>>;
    }>;

export function transcodeDecisionToLayerOutcome<Layer extends string>(
  layer: Layer,
  decision: TranscodeDecision,
): TranscodeLayerOutcome<Layer> {
  if (!layer.trim()) throw new TypeError('transcode runtime layer is required');
  const measurements = decision.measurements
    ? Object.freeze({ ...decision.measurements })
    : undefined;
  if (decision.state === 'VERDICT') {
    return Object.freeze({
      layer,
      state: decision.state,
      verdict: decision.verdict,
      reasonCode: decision.reasonCode,
      detail: decision.detail,
      ...(measurements ? { measurements } : {}),
    });
  }
  if (decision.state === 'UNAVAILABLE') {
    return Object.freeze({
      layer,
      state: decision.state,
      status: decision.status,
      reasonCode: decision.reasonCode,
      detail: decision.detail,
      ...(measurements ? { measurements } : {}),
    });
  }
  return Object.freeze({
    layer,
    state: decision.state,
    reasonCode: decision.reasonCode,
    detail: decision.detail,
    ...(measurements ? { measurements } : {}),
  });
}

export type TranscodeRuntimeInvariantRequest =
  | Readonly<{
      invariant: typeof TRANSCODE_EFFECT_INVARIANT;
      scenarioId: string;
      sourceFrames: readonly TranscodePixelFrame[];
      candidateFrames: readonly TranscodePixelFrame[];
      signal: TransformSignalEvidence;
    }>
  | Readonly<{
      invariant: typeof TRANSCODE_AUDIO_CONTENT_INVARIANT;
      scenarioId: string;
      source: DecodedAudioSignal;
      candidate: DecodedAudioSignal;
    }>
  | Readonly<{
      invariant: typeof TRANSCODE_ROUNDTRIP_INVARIANT;
      contract: TranscodeRoundTripContract;
      evidence: TranscodeRoundTripEvidence;
    }>;

/** Dispatch a recognized token only after the runner has collected the typed neutral evidence. */
export function evaluateTranscodeRuntimeInvariant(
  request: TranscodeRuntimeInvariantRequest,
): TranscodeDecision {
  switch (request.invariant) {
    case TRANSCODE_EFFECT_INVARIANT: {
      const contract = transcodeTransformContractForScenario(request.scenarioId);
      if (!contract) {
        return transcodeError(
          'TRANSCODE_TRANSFORM_CONTRACT_NOT_REGISTERED',
          `scenario '${request.scenarioId}' selected ${request.invariant} without a transform contract`,
        );
      }
      return evaluateTranscodeTransform(
        request.sourceFrames,
        request.candidateFrames,
        request.signal,
        contract,
      );
    }
    case TRANSCODE_AUDIO_CONTENT_INVARIANT: {
      const contract = transcodeAudioContractForScenario(request.scenarioId);
      if (!contract) {
        return transcodeError(
          'TRANSCODE_AUDIO_CONTRACT_NOT_REGISTERED',
          `scenario '${request.scenarioId}' selected ${request.invariant} without an audio contract`,
        );
      }
      return evaluateTranscodedAudioContent(request.source, request.candidate, contract);
    }
    case TRANSCODE_ROUNDTRIP_INVARIANT:
      return assessTranscodeRoundTripProvenance(request.contract, request.evidence);
  }
}

export interface TranscodeRoundTripRuntimeRequest {
  readonly original: MediaBytes;
  readonly execute: ExecuteTranscodeLeg;
  readonly contract?: TranscodeRoundTripContract;
}

export type TranscodeRoundTripRuntimeResult =
  | Readonly<{
      state: 'OK';
      contract: TranscodeRoundTripContract;
      evidence: TranscodeRoundTripEvidence;
      decision: TranscodeDecision;
      outcome: TranscodeLayerOutcome<'property-invariant'>;
    }>
  | Readonly<{
      state: 'BLOCKED';
      contract: TranscodeRoundTripContract;
      decision: TranscodeDecision;
      outcome: TranscodeLayerOutcome<'property-invariant'>;
      evidence?: TranscodeRoundTripEvidence;
    }>;

/** Execute and immediately provenance-grade the exact A->B->A binding used by the runner. */
export async function executeTranscodeRoundTripRuntime(
  request: TranscodeRoundTripRuntimeRequest,
): Promise<TranscodeRoundTripRuntimeResult> {
  const contract = request.contract ?? TRANSCODE_ROUNDTRIP_CONTRACT;
  const execution = await executeTranscodeRoundTrip(contract, request.original, request.execute);
  if (execution.state === 'BLOCKED') {
    return roundTripBlocked(contract, execution.decision);
  }
  const decision = evaluateTranscodeRuntimeInvariant({
    invariant: TRANSCODE_ROUNDTRIP_INVARIANT,
    contract,
    evidence: execution.value,
  });
  const outcome = transcodeDecisionToLayerOutcome('property-invariant', decision);
  if (decision.state !== 'VERDICT' || decision.verdict === 'FAIL') {
    return Object.freeze({
      state: 'BLOCKED' as const,
      contract,
      decision,
      outcome,
      evidence: execution.value,
    });
  }
  return Object.freeze({
    state: 'OK' as const,
    contract,
    evidence: execution.value,
    decision,
    outcome,
  });
}

export interface TranscodeMetricRuntimeEvidence {
  readonly oracleEvidence: readonly TranscodeOracleEvidence[];
  /** Qualified measurements plus unambiguous raw names and the typed `ssimScore` gate alias. */
  readonly measurements: Readonly<Record<string, number>>;
}

/**
 * Convert the shared typed oracle result model into the family metric gate. This is deliberately a
 * type-only dependency on scenario.ts; no core oracle implementation or prose parsing is involved.
 */
export function transcodeMetricRuntimeEvidenceFromOracleOutcomes(
  outcomes: readonly OracleOutcome[],
): TranscodeMetricRuntimeEvidence {
  const oracleEvidence = Object.freeze(outcomes.map(copyOracleEvidence));
  const measurements: Record<string, number> = {};
  const candidates = new Map<string, number[]>();

  for (const outcome of outcomes) {
    for (const [name, value] of Object.entries(outcome.measurements ?? {})) {
      if (!Number.isFinite(value)) continue;
      addMeasurementCandidate(candidates, `${outcome.oracle}.${name}`, value);
      addMeasurementCandidate(candidates, name, value);
    }
  }

  const ssimOutcomes = outcomes.filter((outcome) => outcome.oracle === 'ssim-psnr');
  if (ssimOutcomes.length === 1) {
    const score = transcodeSsimGateScore(ssimOutcomes[0]!.measurements);
    if (score !== undefined) addMeasurementCandidate(candidates, 'ssimScore', score);
  }
  for (const [name, values] of [...candidates].sort(([first], [second]) => first.localeCompare(second))) {
    retainUnambiguousMeasurement(measurements, name, values);
  }

  return Object.freeze({
    oracleEvidence,
    measurements: Object.freeze(measurements),
  });
}

export interface AdmitTranscodeRuntimeMetricsInput {
  readonly contract: TranscodeMetricAdmissionContract;
  readonly outcomes: readonly OracleOutcome[];
  readonly rates: readonly TranscodeRateEvidence[];
  /** Non-oracle observations such as a measured operation count; conflicts are harness errors. */
  readonly additionalMeasurements?: Readonly<Record<string, number>>;
}

export function admitTranscodeRuntimeMetrics(
  input: AdmitTranscodeRuntimeMetricsInput,
): TranscodeMetricAdmission {
  const converted = transcodeMetricRuntimeEvidenceFromOracleOutcomes(input.outcomes);
  const measurements: Record<string, number> = { ...converted.measurements };
  for (const [name, value] of Object.entries(input.additionalMeasurements ?? {})
    .sort(([first], [second]) => first.localeCompare(second))) {
    if (!Number.isFinite(value)) continue;
    if (measurements[name] !== undefined && !Object.is(measurements[name], value)) {
      return {
        state: 'BLOCKED',
        decision: transcodeError(
          'TRANSCODE_METRIC_MEASUREMENT_CONFLICT',
          `metric observation '${name}' conflicts (${measurements[name]} vs ${value})`,
        ),
      };
    }
    measurements[name] = value;
  }
  return admitTranscodeMetrics(input.contract, converted.oracleEvidence, measurements, input.rates);
}

function roundTripBlocked(
  contract: TranscodeRoundTripContract,
  decision: TranscodeDecision,
): TranscodeRoundTripRuntimeResult {
  return Object.freeze({
    state: 'BLOCKED' as const,
    contract,
    decision,
    outcome: transcodeDecisionToLayerOutcome('property-invariant', decision),
  });
}

function copyOracleEvidence(outcome: OracleOutcome): TranscodeOracleEvidence {
  const measurements = outcome.measurements
    ? Object.freeze({ ...outcome.measurements })
    : undefined;
  if (outcome.state === 'VERDICT') {
    return Object.freeze({
      oracle: outcome.oracle,
      state: outcome.state,
      verdict: outcome.verdict,
      reasonCode: outcome.reasonCode,
      ...(outcome.detail !== undefined ? { detail: outcome.detail } : {}),
      ...(measurements ? { measurements } : {}),
    });
  }
  if (outcome.state === 'UNAVAILABLE') {
    return Object.freeze({
      oracle: outcome.oracle,
      state: outcome.state,
      status: outcome.status,
      reasonCode: outcome.reasonCode,
      detail: outcome.detail,
      ...(measurements ? { measurements } : {}),
    });
  }
  return Object.freeze({
    oracle: outcome.oracle,
    state: outcome.state,
    reasonCode: outcome.reasonCode,
    detail: outcome.detail,
    ...(measurements ? { measurements } : {}),
  });
}

function retainUnambiguousMeasurement(
  target: Record<string, number>,
  name: string,
  values: readonly number[],
): void {
  const first = values[0];
  if (first !== undefined && values.every((value) => Object.is(value, first))) target[name] = first;
}

function addMeasurementCandidate(
  target: Map<string, number[]>,
  name: string,
  value: number,
): void {
  const values = target.get(name);
  if (values) values.push(value);
  else target.set(name, [value]);
}

/** Select the statistic the typed SSIM evidence says actually gated that path. */
function transcodeSsimGateScore(
  measurements: Readonly<Record<string, number>> | undefined,
): number | undefined {
  if (!measurements) return undefined;
  for (const explicit of ['gatingSsimScore', 'ssimGateScore', 'ssimScore']) {
    const value = measurements[explicit];
    if (Number.isFinite(value)) return value;
  }
  // Committed-golden evidence names `exactFrames` and gates its worst paired frame.
  if (Number.isFinite(measurements.exactFrames) && Number.isFinite(measurements.ssimMin)) {
    return measurements.ssimMin;
  }
  // Neutral source-reference evidence gates its presentation-aligned mean.
  for (const mean of ['ssimMean', 'meanSsim']) {
    const value = measurements[mean];
    if (Number.isFinite(value)) return value;
  }
  return undefined;
}
