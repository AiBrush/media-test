import type { MetricId, OracleId, OracleVerdict } from '../../core/scenario.ts';
import {
  transcodeError,
  transcodeUnavailable,
  transcodeVerdict,
  type TranscodeDecision,
  type TranscodeOracleEvidence,
  type TranscodeRateEvidence,
} from './types.ts';

export const TRANSCODE_METRIC_ADMISSION_SCHEMA = 'media-test/transcode-metric-admission@1' as const;

export interface AllowedTranscodeDiff {
  readonly oracle: OracleId;
  readonly reasonCodes: readonly string[];
}

export interface TranscodeThreshold {
  readonly id: string;
  readonly measurement: string;
  readonly mode: 'gating' | 'advisory';
  readonly comparator: 'at-least' | 'at-most';
  readonly value: number;
}

export interface TranscodeMetricAdmissionContract {
  readonly schema: typeof TRANSCODE_METRIC_ADMISSION_SCHEMA;
  readonly mandatoryOracles: readonly OracleId[];
  readonly allowedDiffs: readonly AllowedTranscodeDiff[];
  readonly thresholds: readonly TranscodeThreshold[];
}

export type TranscodeMetricAdmission =
  | Readonly<{
      state: 'ADMITTED';
      associatedVerdict: Extract<OracleVerdict, 'PASS' | 'DIFF'>;
      rates: readonly TranscodeRateEvidence[];
      advisoryThresholds: readonly Readonly<{ id: string; passed: boolean; observed: number }>[];
    }>
  | Readonly<{ state: 'BLOCKED'; decision: TranscodeDecision }>;

export function defineTranscodeMetricAdmissionContract(
  value: Omit<TranscodeMetricAdmissionContract, 'schema'>,
): TranscodeMetricAdmissionContract {
  if (value.mandatoryOracles.length === 0 || new Set(value.mandatoryOracles).size !== value.mandatoryOracles.length) {
    throw new TypeError('transcode metric admission requires unique mandatory oracles');
  }
  const thresholdIds = new Set<string>();
  for (const threshold of value.thresholds) {
    if (!threshold.id.trim() || thresholdIds.has(threshold.id) || !threshold.measurement.trim() ||
        !Number.isFinite(threshold.value)) {
      throw new TypeError('transcode metric thresholds require unique ids, measurement names, and finite values');
    }
    thresholdIds.add(threshold.id);
  }
  return deepFreeze({ schema: TRANSCODE_METRIC_ADMISSION_SCHEMA, ...value });
}

/**
 * Admit competitive metrics only after every mandatory oracle is substantive and each gating
 * threshold has actually been evaluated. A DIFF must be explicitly whitelisted by reason code.
 */
export function admitTranscodeMetrics(
  contract: TranscodeMetricAdmissionContract,
  evidence: readonly TranscodeOracleEvidence[],
  measurements: Readonly<Record<string, number>>,
  rates: readonly TranscodeRateEvidence[],
): TranscodeMetricAdmission {
  const semanticFailure = sortedEvidence(evidence).find(
    (outcome) => outcome.state === 'VERDICT' && outcome.verdict === 'FAIL',
  );
  if (semanticFailure?.state === 'VERDICT') {
    return blocked(transcodeVerdict(
      'FAIL',
      semanticFailure.reasonCode,
      semanticFailure.detail ?? `${semanticFailure.oracle} failed`,
    ));
  }
  const harnessError = sortedEvidence(evidence).find((outcome) => outcome.state === 'ERROR');
  if (harnessError?.state === 'ERROR') {
    return blocked(transcodeError(
      harnessError.reasonCode,
      harnessError.detail ?? `${harnessError.oracle} errored`,
    ));
  }

  let associatedVerdict: Extract<OracleVerdict, 'PASS' | 'DIFF'> = 'PASS';
  for (const oracle of contract.mandatoryOracles) {
    const outcomes = evidence.filter((candidate) => candidate.oracle === oracle);
    if (outcomes.length === 0) {
      return blocked(transcodeUnavailable(
        'NA_ASSET',
        'TRANSCODE_METRIC_MANDATORY_EVIDENCE_MISSING',
        `mandatory oracle '${oracle}' produced no evidence`,
      ));
    }
    if (outcomes.length !== 1) {
      return blocked(transcodeError(
        'TRANSCODE_METRIC_ORACLE_EVIDENCE_DUPLICATE',
        `mandatory oracle '${oracle}' produced ${outcomes.length} ambiguous evidence records`,
      ));
    }
    const outcome = outcomes[0]!;
    if (outcome.state === 'UNAVAILABLE') {
      return blocked(transcodeUnavailable(
        outcome.status ?? 'NA_ASSET',
        outcome.reasonCode,
        outcome.detail ?? `mandatory oracle '${oracle}' is unavailable`,
      ));
    }
    if (outcome.state === 'ERROR') {
      return blocked(transcodeError(outcome.reasonCode, outcome.detail ?? `mandatory oracle '${oracle}' errored`));
    }
    if (outcome.verdict !== 'PASS') {
      return blocked(transcodeError(
        'TRANSCODE_METRIC_ORACLE_EVIDENCE_INVALID',
        `mandatory oracle '${oracle}' has no PASS verdict`,
      ));
    }
  }

  const advisoryThresholds: Array<{ id: string; passed: boolean; observed: number }> = [];
  for (const threshold of contract.thresholds) {
    const observed = measurements[threshold.measurement];
    if (!Number.isFinite(observed)) {
      if (threshold.mode === 'gating') {
        return blocked(transcodeUnavailable(
          'NA_ASSET',
          'TRANSCODE_GATING_THRESHOLD_EVIDENCE_MISSING',
          `gating threshold '${threshold.id}' names unmeasured '${threshold.measurement}'`,
        ));
      }
      continue;
    }
    const passed = threshold.comparator === 'at-least'
      ? observed! >= threshold.value
      : observed! <= threshold.value;
    if (threshold.mode === 'gating' && !passed) {
      return blocked(transcodeVerdict(
        'FAIL',
        'TRANSCODE_GATING_THRESHOLD_FAILED',
        `${threshold.measurement}=${observed} fails ${threshold.comparator} ${threshold.value} ` +
          `(threshold '${threshold.id}')`,
        { [threshold.measurement]: observed!, threshold: threshold.value },
      ));
    }
    if (threshold.mode === 'advisory') advisoryThresholds.push({ id: threshold.id, passed, observed: observed! });
  }

  for (const rate of rates) {
    const rateDecision = validateRate(rate, associatedVerdict);
    if (rateDecision) return blocked(rateDecision);
  }
  return Object.freeze({
    state: 'ADMITTED' as const,
    associatedVerdict,
    rates: Object.freeze(rates.map((rate) => deepFreeze({ ...rate }))),
    advisoryThresholds: Object.freeze(advisoryThresholds.map((entry) => Object.freeze({ ...entry }))),
  });
}

export function makeTranscodeRateEvidence(input: {
  metric: MetricId;
  numerator: TranscodeRateEvidence['numerator'];
  denominator: TranscodeRateEvidence['denominator'];
  associatedVerdict: Extract<OracleVerdict, 'PASS' | 'DIFF'>;
}): TranscodeRateEvidence {
  return deepFreeze({
    ...input,
    value: input.numerator.value / input.denominator.value,
  });
}

function validateRate(
  rate: TranscodeRateEvidence,
  associatedVerdict: Extract<OracleVerdict, 'PASS' | 'DIFF'>,
): TranscodeDecision | undefined {
  if (!Number.isFinite(rate.numerator.value) || rate.numerator.value < 0 ||
      !Number.isFinite(rate.denominator.value) || rate.denominator.value <= 0 ||
      !rate.numerator.name.trim() || !rate.denominator.name.trim() ||
      !rate.numerator.unit.trim() || !rate.denominator.unit.trim() ||
      !rate.numerator.source.trim() || !rate.denominator.source.trim()) {
    return transcodeError(
      'TRANSCODE_RATE_COMPONENTS_INVALID',
      `rate '${rate.metric}' requires named finite numerator/denominator observations`,
    );
  }
  const expected = rate.numerator.value / rate.denominator.value;
  const error = Math.abs(rate.value - expected);
  if (!Number.isFinite(rate.value) || error > Math.max(1e-12, Math.abs(expected) * 1e-9)) {
    return transcodeError(
      'TRANSCODE_RATE_RATIO_MISMATCH',
      `rate '${rate.metric}' value ${rate.value} != ${rate.numerator.value}/${rate.denominator.value}`,
    );
  }
  if (rate.associatedVerdict !== associatedVerdict) {
    return transcodeError(
      'TRANSCODE_RATE_VERDICT_MISMATCH',
      `rate '${rate.metric}' is associated with ${rate.associatedVerdict}; correctness is ${associatedVerdict}`,
    );
  }
  const source = rate.numerator.source.toLowerCase();
  const allowedNumerators = new Set([
    'neutral-output-sample-table',
    'neutral-output-packet-table',
    'neutral-output-audio-timeline',
    'neutral-output-presentation-timeline',
    'decoded-frame-sink',
    'encoded-chunk-sink',
    'adapter-final-counter',
    'exact-output-byte-length',
    'measured-operation-count',
  ]);
  if (!allowedNumerators.has(source)) {
    return transcodeUnavailable(
      'NA_ASSET',
      'TRANSCODE_RATE_NUMERATOR_ESTIMATED',
      `rate '${rate.metric}' does not name an approved observed numerator source: '${rate.numerator.source}'`,
    );
  }
  if (rate.denominator.source !== 'monotonic-operation-window') {
    return transcodeError(
      'TRANSCODE_RATE_DENOMINATOR_UNOBSERVED',
      `rate '${rate.metric}' denominator is not the measured monotonic operation window`,
    );
  }
  const requiresFrames = rate.metric === 'framesPerSec' || rate.metric === 'encodeFps' || rate.metric === 'decodeFps';
  if (requiresFrames && !/(frame|presentation-unit|sample-table|adapter-final-counter)/i.test(
    `${rate.numerator.name} ${rate.numerator.unit} ${rate.numerator.source}`,
  )) {
    return transcodeError(
      'TRANSCODE_RATE_FRAME_NUMERATOR_UNTYPED',
      `rate '${rate.metric}' numerator is not an observed frame/presentation-unit count`,
    );
  }
  return undefined;
}

function blocked(decision: TranscodeDecision): TranscodeMetricAdmission {
  return { state: 'BLOCKED', decision };
}

function sortedEvidence(evidence: readonly TranscodeOracleEvidence[]): TranscodeOracleEvidence[] {
  return [...evidence].sort((first, second) => evidenceKey(first).localeCompare(evidenceKey(second)));
}

function evidenceKey(evidence: TranscodeOracleEvidence): string {
  const discriminator = evidence.state === 'VERDICT'
    ? evidence.verdict
    : evidence.state === 'UNAVAILABLE'
      ? evidence.status
      : 'ERROR';
  return `${evidence.oracle}\u0000${evidence.state}\u0000${discriminator}\u0000${evidence.reasonCode}`;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return value;
}
