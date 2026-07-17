import {
  createNotApplicableError,
  type ApplicabilityTupleSummary,
} from '../../core/engine.ts';
import type { Scenario } from '../../core/scenario.ts';
import { muxError, muxVerdict, type MuxDecision } from './types.ts';

export const ILLEGAL_MUX_SCENARIO_IDS = Object.freeze([
  'mux/neg_h264_into_wav_illegal',
  'mux/neg_h264_into_ogg_illegal',
  'mux/neg_vp9_into_adts_illegal',
  'mux/neg_zero_tracks_empty_audio_to_mp4',
] as const);

export type IllegalMuxScenarioId = (typeof ILLEGAL_MUX_SCENARIO_IDS)[number];

const ILLEGAL_MUX_IDS = new Set<string>(ILLEGAL_MUX_SCENARIO_IDS);

export type MuxExecutionObservation =
  | Readonly<{ state: 'RETURNED_OUTPUT'; byteLength: number }>
  | Readonly<{ state: 'REJECTED'; reasonCode: string; detail: string }>
  | Readonly<{ state: 'NOT_APPLICABLE'; reasonCode: string; detail: string }>
  | Readonly<{ state: 'CRASH'; reasonCode: string; detail: string }>
  | Readonly<{ state: 'TIMEOUT'; timeoutMs: number }>;

export interface MuxApplicabilityPreflight {
  readonly supported: boolean;
  readonly reasonCode?: string;
  readonly detail?: string;
}

/**
 * Negative illegality is part of conformance and therefore bypasses tuple non-applicability.
 * The explicit id set is deliberate: neither prose nor an exception message can change routing.
 */
export function isDeliberatelyIllegalMuxScenario(
  scenario: Pick<Scenario, 'id' | 'op' | 'oracles'>,
): scenario is Pick<Scenario, 'id' | 'op' | 'oracles'> & { id: IllegalMuxScenarioId } {
  return scenario.op === 'mux' &&
    ILLEGAL_MUX_IDS.has(scenario.id) &&
    scenario.oracles.includes('graceful-failure');
}

/**
 * Apply a concrete support result before mux dispatch. Valid-but-unsupported tuples use the one
 * shared realm-safe error; deliberately illegal rows always execute so rejection can be judged.
 */
export function preflightMuxApplicability(
  scenario: Pick<Scenario, 'id' | 'op' | 'oracles'>,
  engineId: string,
  tuple: Partial<ApplicabilityTupleSummary>,
  decision: MuxApplicabilityPreflight,
): void {
  if (decision.supported || isDeliberatelyIllegalMuxScenario(scenario)) return;
  throw createNotApplicableError(
    engineId,
    'mux',
    decision.detail ?? 'the concrete mux tuple is not implemented by this engine',
    tuple,
    decision.reasonCode ?? 'MUX_CONCRETE_TUPLE_UNSUPPORTED',
  );
}

/** Judge an observed mux disposition without inspecting error names, messages, or stack text. */
export function assessMuxExecutionBoundary(
  scenario: Pick<Scenario, 'id' | 'op' | 'oracles'>,
  observation: MuxExecutionObservation,
): MuxDecision {
  const illegal = isDeliberatelyIllegalMuxScenario(scenario);
  if (!illegal) {
    if (observation.state === 'NOT_APPLICABLE') {
      return muxError(
        'MUX_NA_MUST_USE_SHARED_ERROR',
        `valid tuple applicability must be propagated before oracle reduction (${observation.reasonCode})`,
      );
    }
    if (observation.state === 'CRASH') {
      return muxError(observation.reasonCode, observation.detail);
    }
    if (observation.state === 'TIMEOUT') {
      return muxError('MUX_EXECUTION_TIMEOUT', `mux exceeded ${observation.timeoutMs} ms`);
    }
    if (observation.state === 'REJECTED') {
      return muxVerdict(
        'FAIL',
        'MUX_VALID_TUPLE_REJECTED',
        `applicable mux tuple rejected after preflight [${observation.reasonCode}]: ${observation.detail}`,
      );
    }
    return muxVerdict('PASS', 'MUX_APPLICABLE_OUTPUT_RETURNED', `${observation.byteLength} output byte(s)`);
  }

  switch (observation.state) {
    case 'REJECTED':
      return muxVerdict(
        'PASS',
        'MUX_ILLEGAL_COMBINATION_REJECTED',
        `declared-illegal mux rejected cleanly [${observation.reasonCode}]: ${observation.detail}`,
      );
    case 'RETURNED_OUTPUT':
      return muxVerdict(
        'FAIL',
        'MUX_ILLEGAL_COMBINATION_ACCEPTED',
        `declared-illegal mux returned ${observation.byteLength} byte(s)`,
      );
    case 'NOT_APPLICABLE':
      return muxVerdict(
        'FAIL',
        'MUX_ILLEGAL_COMBINATION_MISCLASSIFIED_NA',
        `declared-illegal mux was skipped as unsupported [${observation.reasonCode}]`,
      );
    case 'CRASH':
      return muxError(observation.reasonCode, observation.detail);
    case 'TIMEOUT':
      return muxVerdict('FAIL', 'MUX_ILLEGAL_REJECTION_TIMEOUT', `rejection exceeded ${observation.timeoutMs} ms`);
  }
}
