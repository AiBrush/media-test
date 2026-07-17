import type { OracleId, OracleOutcome } from '../../core/scenario.ts';
import { readNeutralRemuxProgram } from './readers.ts';
import type {
  PartialRemuxAssessment,
  RemuxProgramEvidence,
  TerminalSampleProbe,
} from './types.ts';

export interface ReturnedPartialRemuxInput {
  readonly outputBytes: Uint8Array;
  readonly outputContainer: string;
  readonly sourceByteLength: number;
  readonly maxExpansionRatio?: number;
  readonly timestampToleranceUs?: number;
  /** Optional independent decode/probe. The neutral reader itself is always the first probe. */
  readonly terminalProbe?: TerminalSampleProbe | ((program: RemuxProgramEvidence) => TerminalSampleProbe | Promise<TerminalSampleProbe>);
  readonly oracle?: OracleId;
}

function outcome(
  oracle: OracleId,
  verdict: 'PASS' | 'FAIL',
  reasonCode: string,
  detail: string,
  measurements?: Record<string, number>,
): OracleOutcome {
  return { state: 'VERDICT', oracle, verdict, reasonCode, detail, ...(measurements ? { measurements } : {}) };
}

export function classifyRejectedPartialRemux(oracle: OracleId = 'graceful-failure'): PartialRemuxAssessment {
  return {
    disposition: 'rejected',
    outcome: outcome(oracle, 'PASS', 'REMUX_PARTIAL_CLEAN_REJECT', 'malformed/truncated source was cleanly rejected'),
  };
}

export function classifyTimedOutPartialRemux(oracle: OracleId = 'graceful-failure'): PartialRemuxAssessment {
  return {
    disposition: 'timeout',
    outcome: outcome(oracle, 'FAIL', 'REMUX_PARTIAL_TIMEOUT', 'partial remux exceeded its bounded deadline'),
  };
}

function invalid(
  oracle: OracleId,
  reasonCode: string,
  detail: string,
  program?: RemuxProgramEvidence,
): PartialRemuxAssessment {
  return { disposition: 'invalid-output', outcome: outcome(oracle, 'FAIL', reasonCode, detail), ...(program ? { program } : {}) };
}

/**
 * A returned partial earns PASS only after a bounded neutral reader reaches every complete retained
 * sample and its terminal timeline. Corrupt offsets, incomplete frames, non-monotonic decode time,
 * or an independent terminal-probe failure remain FAIL. Reader implementation gaps are ERROR.
 */
export async function validateReturnedPartialRemux(input: ReturnedPartialRemuxInput): Promise<PartialRemuxAssessment> {
  const oracle = input.oracle ?? 'property-invariant';
  if (!Number.isSafeInteger(input.sourceByteLength) || input.sourceByteLength <= 0) {
    return {
      disposition: 'invalid-output',
      outcome: { state: 'ERROR', oracle, reasonCode: 'REMUX_PARTIAL_SOURCE_BOUND_INVALID', detail: 'source byte bound is not a positive safe integer' },
    };
  }
  const maxRatio = input.maxExpansionRatio ?? 4;
  if (!Number.isFinite(maxRatio) || maxRatio < 1) {
    return {
      disposition: 'invalid-output',
      outcome: { state: 'ERROR', oracle, reasonCode: 'REMUX_PARTIAL_EXPANSION_POLICY_INVALID', detail: 'maxExpansionRatio must be finite and >= 1' },
    };
  }
  if (input.outputBytes.byteLength === 0) return invalid(oracle, 'REMUX_PARTIAL_OUTPUT_EMPTY', 'returned partial has no bytes');
  if (input.outputBytes.byteLength > input.sourceByteLength * maxRatio) {
    return invalid(
      oracle,
      'REMUX_PARTIAL_OUTPUT_UNBOUNDED',
      `returned ${input.outputBytes.byteLength} bytes exceeds ${maxRatio}x the ${input.sourceByteLength}-byte source bound`,
    );
  }
  const read = readNeutralRemuxProgram(input.outputBytes, input.outputContainer);
  if (read.state !== 'OK') {
    if (read.state === 'MALFORMED' || read.state === 'INCOMPLETE') {
      return invalid(oracle, read.reasonCode, `returned partial is ${read.state.toLowerCase()} [${read.reasonCode}]`);
    }
    return {
      disposition: 'invalid-output',
      outcome: {
        state: 'ERROR', oracle, reasonCode: read.reasonCode,
        detail: `safe-partial neutral reader is ${read.state.toLowerCase()} for '${input.outputContainer}'`,
      },
    };
  }
  const program = read.value;
  const mediaTracks = program.tracks.filter((track) => track.type === 'video' || track.type === 'audio');
  if (mediaTracks.length === 0) return invalid(oracle, 'REMUX_PARTIAL_MEDIA_TRACKS_MISSING', 'returned partial has no media track', program);
  let completeSamples = 0;
  let terminalPtsUs = Number.NEGATIVE_INFINITY;
  for (const track of mediaTracks) {
    if (track.samples.length === 0) return invalid(oracle, 'REMUX_PARTIAL_TRACK_EMPTY', `media track '${track.id}' has no complete retained sample`, program);
    let priorDts = Number.NEGATIVE_INFINITY;
    for (const sample of track.samples) {
      if (sample.payload.byteLength === 0) return invalid(oracle, 'REMUX_PARTIAL_SAMPLE_EMPTY', `track '${track.id}' contains an empty sample`, program);
      if (sample.fileOffset !== undefined && (sample.fileOffset < 0 || sample.fileOffset + sample.payload.byteLength > program.byteLength)) {
        return invalid(oracle, 'REMUX_PARTIAL_SAMPLE_OFFSET_INVALID', `track '${track.id}' sample points outside returned bytes`, program);
      }
      for (const [name, value] of [['ptsUs', sample.ptsUs], ['dtsUs', sample.dtsUs], ['durationUs', sample.durationUs]] as const) {
        if (value !== undefined && (!Number.isFinite(value) || (name === 'durationUs' && value <= 0))) {
          return invalid(oracle, 'REMUX_PARTIAL_TIMELINE_INVALID', `track '${track.id}' has invalid ${name}`, program);
        }
      }
      if (sample.dtsUs !== undefined) {
        if (sample.dtsUs < priorDts) return invalid(oracle, 'REMUX_PARTIAL_DTS_NON_MONOTONIC', `track '${track.id}' decode timeline moves backwards`, program);
        priorDts = sample.dtsUs;
      }
      if (sample.ptsUs !== undefined) terminalPtsUs = Math.max(terminalPtsUs, sample.ptsUs + (sample.durationUs ?? 0));
      completeSamples++;
    }
  }
  const builtInProbe: TerminalSampleProbe = {
    state: 'PASS',
    ...(Number.isFinite(terminalPtsUs) ? { decodedThroughPtsUs: terminalPtsUs } : {}),
    validatedTrackIds: mediaTracks.map((track) => track.id),
    detail: 'payload-bearing neutral probe reached every retained sample extent',
  };
  const terminalProbe = typeof input.terminalProbe === 'function'
    ? await input.terminalProbe(program)
    : input.terminalProbe ?? builtInProbe;
  if (terminalProbe.state === 'FAIL') return invalid(oracle, terminalProbe.reasonCode, terminalProbe.detail, program);
  if (terminalProbe.state === 'ERROR') {
    return { disposition: 'invalid-output', program, outcome: { state: 'ERROR', oracle, reasonCode: terminalProbe.reasonCode, detail: terminalProbe.detail } };
  }
  if (terminalProbe.state === 'UNAVAILABLE') {
    return {
      disposition: 'invalid-output', program,
      outcome: { state: 'UNAVAILABLE', oracle, status: 'NA_BROWSER', reasonCode: terminalProbe.reasonCode, detail: terminalProbe.detail },
    };
  }
  const validated = new Set(terminalProbe.validatedTrackIds ?? builtInProbe.validatedTrackIds);
  const missing = mediaTracks.filter((track) => !validated.has(track.id));
  if (missing.length) return invalid(oracle, 'REMUX_PARTIAL_TERMINAL_TRACK_UNPROBED', `terminal probe omitted ${missing.map((track) => track.id).join(', ')}`, program);
  const tolerance = input.timestampToleranceUs ?? 1_000;
  if (
    Number.isFinite(terminalPtsUs) &&
    terminalProbe.decodedThroughPtsUs !== undefined &&
    terminalProbe.decodedThroughPtsUs + tolerance < terminalPtsUs
  ) {
    return invalid(
      oracle,
      'REMUX_PARTIAL_TERMINAL_SAMPLE_UNREACHED',
      `terminal probe stopped at ${terminalProbe.decodedThroughPtsUs}us before retained end ${terminalPtsUs}us`,
      program,
    );
  }
  return {
    disposition: 'valid-partial', program,
    outcome: outcome(
      oracle,
      'PASS',
      'REMUX_PARTIAL_VALID_COMPLETE_PREFIX',
      `valid bounded partial: ${mediaTracks.length} track(s), ${completeSamples} complete sample(s); ${terminalProbe.detail ?? builtInProbe.detail}`,
      {
        outputBytes: input.outputBytes.byteLength,
        sourceBytes: input.sourceByteLength,
        mediaTracks: mediaTracks.length,
        completeSamples,
        ...(Number.isFinite(terminalPtsUs) ? { terminalPtsUs } : {}),
      },
    ),
  };
}
