import type { FrameDigest, OperationFinalCounters, SeekResult } from '../../core/engine.ts';
import { decodeSeekVerdict, finiteNonNegative, isRecord, type DecodeSeekVerdict } from './types.ts';

export const SEEK_SEQUENCE_SCHEMA = 'media-test/decode-seek-sequence@1' as const;

export type SeekSequenceEdge = 'single' | 'repeated' | 'backward';

export interface SeekTimelinePoint {
  readonly ptsUs: number;
  readonly keyframe?: boolean;
  /** Optional decoded-frame identity at this presentation timestamp. */
  readonly frameSha256?: string;
}

export interface SeekSequenceStep {
  readonly targetUs: number;
  readonly expectKeyframe: boolean;
}

export interface SeekSequenceContract {
  readonly schema: typeof SEEK_SEQUENCE_SCHEMA;
  readonly edge: SeekSequenceEdge;
  readonly steps: readonly SeekSequenceStep[];
  readonly realPtsToleranceUs: number;
  readonly requireFreshObservation: boolean;
}

export interface SeekStepObservation {
  readonly stepIndex: number;
  readonly targetUs: number;
  readonly landedPtsUs: number;
  readonly frame: FrameDigest;
  readonly latencyMs: number;
  /** True only when an adapter returned the same result/frame object from an earlier invocation. */
  readonly aliasedPreviousResult: boolean;
  readonly telemetry?: OperationFinalCounters;
}

export interface SeekSequenceObservation {
  readonly schema: typeof SEEK_SEQUENCE_SCHEMA;
  readonly edge: SeekSequenceEdge;
  readonly steps: readonly SeekStepObservation[];
}

export type SeekInvoker = (targetUs: number, stepIndex: number) => Promise<SeekResult>;

/** Derive the exact sequence already declared by the family scenarios. */
export function seekSequenceContractFromOptions(options: unknown): SeekSequenceContract | undefined {
  if (!isRecord(options) || typeof options.tUs !== 'number' || !Number.isFinite(options.tUs)) return undefined;
  const tUs = options.tUs;
  const expectKeyframe = options.expectKeyframe === true;
  const edge = options.seekEdge === 'repeated'
    ? 'repeated'
    : options.seekEdge === 'backward'
      ? 'backward'
      : 'single';
  const steps: SeekSequenceStep[] = edge === 'repeated'
    ? [{ targetUs: tUs, expectKeyframe }, { targetUs: tUs, expectKeyframe }]
    : edge === 'backward'
      ? [
          {
            targetUs: typeof options.priorSeekUs === 'number' && Number.isFinite(options.priorSeekUs)
              ? options.priorSeekUs
              : tUs,
            expectKeyframe: true,
          },
          { targetUs: tUs, expectKeyframe },
        ]
      : [{ targetUs: tUs, expectKeyframe }];
  return Object.freeze({
    schema: SEEK_SEQUENCE_SCHEMA,
    edge,
    steps: Object.freeze(steps.map((step) => Object.freeze({ ...step }))),
    realPtsToleranceUs: 1,
    requireFreshObservation: edge !== 'single',
  });
}

/** Execute every step serially through the same initialized adapter instance. */
export async function executeSeekSequence(
  invoke: SeekInvoker,
  contract: SeekSequenceContract,
  now: () => number = () => performance.now(),
): Promise<SeekSequenceObservation> {
  const observations: SeekStepObservation[] = [];
  let previousResult: SeekResult | undefined;
  let previousFrame: FrameDigest | undefined;
  for (let stepIndex = 0; stepIndex < contract.steps.length; stepIndex++) {
    const step = contract.steps[stepIndex]!;
    const startedAt = now();
    const result = await invoke(step.targetUs, stepIndex);
    const endedAt = now();
    const latencyMs = endedAt - startedAt;
    if (!finiteNonNegative(latencyMs)) throw new TypeError(`seek step ${stepIndex} produced invalid latency`);
    observations.push(Object.freeze({
      stepIndex,
      targetUs: step.targetUs,
      landedPtsUs: result.landedPtsUs,
      frame: Object.freeze({ ...result.frame }),
      latencyMs,
      aliasedPreviousResult: previousResult === result || previousFrame === result.frame,
      ...(result.telemetry ? { telemetry: Object.freeze({ ...result.telemetry }) } : {}),
    }));
    previousResult = result;
    previousFrame = result.frame;
  }
  return Object.freeze({
    schema: SEEK_SEQUENCE_SCHEMA,
    edge: contract.edge,
    steps: Object.freeze(observations),
  });
}

/** Require an adapter landing to be an observed real sample PTS, never a copied request. */
export function assessObservedSeekLanding(
  observation: Pick<SeekStepObservation, 'targetUs' | 'landedPtsUs' | 'frame'>,
  timelineInput: readonly SeekTimelinePoint[],
  expectKeyframe: boolean,
  toleranceUs = 1,
): DecodeSeekVerdict {
  const timeline = normalizedTimeline(timelineInput);
  const measurements = {
    targetUs: observation.targetUs,
    landedPtsUs: observation.landedPtsUs,
    timelinePoints: timeline.length,
  };
  if (timeline.length === 0) {
    return decodeSeekVerdict('FAIL', 'SEEK_TIMELINE_EVIDENCE_EMPTY', 'no real sample PTS evidence exists', measurements);
  }
  if (!Number.isFinite(observation.landedPtsUs) || !Number.isFinite(observation.frame.ptsUs)) {
    return decodeSeekVerdict('FAIL', 'SEEK_LANDING_PTS_INVALID', 'landing/frame PTS must be finite', measurements);
  }
  if (Math.abs(observation.frame.ptsUs - observation.landedPtsUs) > toleranceUs) {
    return decodeSeekVerdict(
      'FAIL',
      'SEEK_FRAME_PTS_DISAGREES',
      `frame PTS ${observation.frame.ptsUs} does not identify landed PTS ${observation.landedPtsUs}`,
      measurements,
    );
  }

  const real = nearestPoint(timeline, observation.landedPtsUs);
  if (!real || Math.abs(real.ptsUs - observation.landedPtsUs) > toleranceUs) {
    const copied = Math.abs(observation.landedPtsUs - observation.targetUs) <= toleranceUs;
    return decodeSeekVerdict(
      'FAIL',
      copied ? 'SEEK_REQUEST_TIME_COPIED' : 'SEEK_LANDING_NOT_REAL_SAMPLE',
      copied
        ? `adapter copied requested ${observation.targetUs}µs instead of reporting a decoded sample PTS`
        : `landed ${observation.landedPtsUs}µs is not a member of the real sample timeline`,
      { ...measurements, nearestRealPtsUs: real?.ptsUs ?? 0 },
    );
  }

  const expected = expectedPoint(timeline, observation.targetUs, expectKeyframe);
  if (!expected) {
    return decodeSeekVerdict('FAIL', 'SEEK_EXPECTED_POINT_UNRESOLVED', 'no expected landing could be resolved', measurements);
  }
  if (Math.abs(observation.landedPtsUs - expected.ptsUs) > toleranceUs) {
    return decodeSeekVerdict(
      'FAIL',
      'SEEK_WRONG_REAL_SAMPLE',
      `landed on real PTS ${observation.landedPtsUs}µs, expected ${expected.ptsUs}µs`,
      { ...measurements, expectedPtsUs: expected.ptsUs },
    );
  }
  if (expected.frameSha256 && normalizeDigest(observation.frame.sha256) !== normalizeDigest(expected.frameSha256)) {
    return decodeSeekVerdict(
      'FAIL',
      'SEEK_FRAME_IDENTITY_MISMATCH',
      `frame digest at ${expected.ptsUs}µs does not match timestamp-keyed evidence`,
      { ...measurements, expectedPtsUs: expected.ptsUs },
    );
  }
  return decodeSeekVerdict(
    'PASS',
    'SEEK_OBSERVED_SAMPLE_MATCH',
    `observed real sample PTS ${expected.ptsUs}µs`,
    { ...measurements, expectedPtsUs: expected.ptsUs },
  );
}

export function assessSeekSequence(
  contract: SeekSequenceContract,
  observation: SeekSequenceObservation,
  timeline: readonly SeekTimelinePoint[],
): DecodeSeekVerdict {
  if (observation.schema !== SEEK_SEQUENCE_SCHEMA || observation.edge !== contract.edge) {
    return decodeSeekVerdict('FAIL', 'SEEK_SEQUENCE_CONTRACT_MISMATCH', 'seek observation does not match its contract');
  }
  if (observation.steps.length !== contract.steps.length) {
    return decodeSeekVerdict(
      'FAIL',
      'SEEK_SEQUENCE_STEP_COUNT_MISMATCH',
      `executed ${observation.steps.length} seek(s), required ${contract.steps.length}`,
      { executedSeeks: observation.steps.length, requiredSeeks: contract.steps.length },
    );
  }
  let totalLatencyMs = 0;
  for (let index = 0; index < contract.steps.length; index++) {
    const step = contract.steps[index]!;
    const actual = observation.steps[index]!;
    if (actual.stepIndex !== index || actual.targetUs !== step.targetUs) {
      return decodeSeekVerdict('FAIL', 'SEEK_SEQUENCE_ORDER_MISMATCH', `seek step ${index} target/order changed`);
    }
    if (!finiteNonNegative(actual.latencyMs)) {
      return decodeSeekVerdict('FAIL', 'SEEK_STEP_LATENCY_INVALID', `seek step ${index} has invalid latency`);
    }
    totalLatencyMs += actual.latencyMs;
    if (contract.requireFreshObservation && actual.aliasedPreviousResult) {
      return decodeSeekVerdict(
        'FAIL',
        'SEEK_STALE_RESULT_REUSED',
        `seek step ${index} reused the previous result/frame object instead of recording a fresh observation`,
        { stepIndex: index, totalLatencyMs },
      );
    }
    const landing = assessObservedSeekLanding(actual, timeline, step.expectKeyframe, contract.realPtsToleranceUs);
    if (landing.verdict !== 'PASS') return landing;
  }

  const first = observation.steps[0];
  const last = observation.steps.at(-1);
  if (!first || !last) {
    return decodeSeekVerdict('FAIL', 'SEEK_SEQUENCE_EMPTY', 'seek sequence produced no steps');
  }
  if (contract.edge === 'repeated' &&
      (first.landedPtsUs !== last.landedPtsUs || normalizeDigest(first.frame.sha256) !== normalizeDigest(last.frame.sha256))) {
    return decodeSeekVerdict(
      'FAIL',
      'SEEK_REPEAT_NOT_IDEMPOTENT',
      'repeated seek did not land on the identical PTS and frame identity',
      { firstPtsUs: first.landedPtsUs, finalPtsUs: last.landedPtsUs, totalLatencyMs },
    );
  }
  if (contract.edge === 'backward' &&
      (last.landedPtsUs >= first.landedPtsUs || normalizeDigest(last.frame.sha256) === normalizeDigest(first.frame.sha256))) {
    return decodeSeekVerdict(
      'FAIL',
      'SEEK_BACKWARD_STALE_FRAME',
      'backward seek retained the earlier forward landing/frame',
      { firstPtsUs: first.landedPtsUs, finalPtsUs: last.landedPtsUs, totalLatencyMs },
    );
  }
  return decodeSeekVerdict(
    'PASS',
    contract.edge === 'single' ? 'SEEK_SEQUENCE_SINGLE_PASS' : 'SEEK_STATEFUL_SEQUENCE_PASS',
    `${contract.edge} seek executed ${observation.steps.length} step(s) on one adapter instance`,
    { executedSeeks: observation.steps.length, totalLatencyMs },
  );
}

function normalizedTimeline(input: readonly SeekTimelinePoint[]): SeekTimelinePoint[] {
  return input
    .filter((point) => Number.isFinite(point.ptsUs))
    .map((point) => ({ ...point }))
    .sort((a, b) => a.ptsUs - b.ptsUs || Number(b.keyframe === true) - Number(a.keyframe === true));
}

function nearestPoint(timeline: readonly SeekTimelinePoint[], targetUs: number): SeekTimelinePoint | undefined {
  return [...timeline].sort((a, b) =>
    Math.abs(a.ptsUs - targetUs) - Math.abs(b.ptsUs - targetUs) || a.ptsUs - b.ptsUs)[0];
}

function expectedPoint(
  timeline: readonly SeekTimelinePoint[],
  targetUs: number,
  expectKeyframe: boolean,
): SeekTimelinePoint | undefined {
  if (!expectKeyframe) return nearestPoint(timeline, targetUs);
  const keyframes = timeline.filter((point) => point.keyframe === true);
  const source = keyframes.length ? keyframes : timeline;
  return source.filter((point) => point.ptsUs <= targetUs).at(-1) ?? source[0];
}

function normalizeDigest(value: string): string {
  return value.trim().toLowerCase();
}
