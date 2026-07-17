/** Honest performance numerators, presentation timelines, and event-latency evidence. */

import {
  readOutputPacketsResult,
  readOutputStructureResult,
  type PacketRow,
} from '../../core/box-readers.ts';
import type {
  DemuxResult,
  MediaBytes,
  OperationFinalCounters,
  PacketInfo,
} from '../../core/engine.ts';
import {
  available,
  finiteNonNegative,
  nonNegativeSafeInteger,
  unavailable,
  type PerformanceEvidence,
} from './contracts.ts';

export type PresentationUnitSource =
  | 'adapter-final-counter'
  | 'neutral-output-packet-reader'
  | 'decoded-frame-sink';

export interface PresentationUnitCount {
  count: number;
  source: PresentationUnitSource;
  /** Optional independent count used to reject a stale or fabricated producer counter. */
  corroboratingCount?: number;
  trackIndexes?: number[];
}

export interface OutputPresentationEvidence {
  units: PerformanceEvidence<PresentationUnitCount>;
  duration: PerformanceEvidence<PresentationDuration>;
}

export type PresentationDurationBasis =
  | 'source-presentation'
  | 'output-presentation'
  | 'processed-interval';

export interface PresentationDuration {
  durationUs: number;
  durationSec: number;
  basis: PresentationDurationBasis;
  policy: string;
  /** Exact rational is retained when the reader/adapter provides it. */
  rational?: { numerator: number; denominator: number };
}

export interface DurationCandidates {
  sourcePresentationUs?: number;
  outputPresentationUs?: number;
  processedIntervalUs?: number;
  sourceRational?: { numerator: number; denominator: number };
  outputRational?: { numerator: number; denominator: number };
}

/**
 * Resolve the explicitly declared timeline basis. There is deliberately no fallback between source,
 * output, and processed interval: silently changing the denominator changes the benchmark question.
 */
export function resolvePresentationDuration(
  basis: PresentationDurationBasis,
  candidates: DurationCandidates,
  policy: string,
): PerformanceEvidence<PresentationDuration> {
  const durationUs = basis === 'source-presentation'
    ? candidates.sourcePresentationUs
    : basis === 'output-presentation'
      ? candidates.outputPresentationUs
      : candidates.processedIntervalUs;
  if (!finiteNonNegative(durationUs) || durationUs <= 0) {
    return unavailable(
      'ERROR',
      'PRESENTATION_DURATION_UNAVAILABLE',
      `${basis} duration is required and must be a finite positive microsecond value`,
    );
  }
  const rational = basis === 'source-presentation'
    ? candidates.sourceRational
    : basis === 'output-presentation'
      ? candidates.outputRational
      : undefined;
  if (rational && !validRational(rational)) {
    return unavailable('ERROR', 'PRESENTATION_RATE_INVALID', `${basis} rational is invalid`);
  }
  return available({
    durationUs,
    durationSec: durationUs / 1_000_000,
    basis,
    policy,
    ...(rational ? { rational: { ...rational } } : {}),
  });
}

/** Count actual decoded presentation units. This path never estimates from fps or duration. */
export function countDecodedPresentationUnits(
  frames: readonly unknown[] | undefined,
  telemetry?: OperationFinalCounters,
): PerformanceEvidence<PresentationUnitCount> {
  const observed = frames?.length;
  const counter = telemetry?.decodedFrames;
  if (counter !== undefined && !nonNegativeSafeInteger(counter)) {
    return unavailable('ERROR', 'DECODED_FRAME_COUNTER_INVALID', 'decodedFrames must be a non-negative safe integer');
  }
  if (observed === undefined) {
    if (counter === undefined) {
      return unavailable('ERROR', 'DECODED_PRESENTATION_UNITS_UNAVAILABLE', 'no frame sink or final decoded-frame counter was emitted');
    }
    return available({ count: counter, source: 'adapter-final-counter' });
  }
  if (counter !== undefined && counter !== observed) {
    return unavailable(
      'ERROR',
      'DECODED_FRAME_COUNTER_MISMATCH',
      `adapter reported ${counter} decoded frames but the frame sink contains ${observed}`,
    );
  }
  return available({
    count: observed,
    source: 'decoded-frame-sink',
    ...(counter !== undefined ? { corroboratingCount: counter } : {}),
  });
}

/**
 * Count encoded video presentation units from the adapter's callback-independent final counter and/or
 * the neutral output packet reader. The two independent sources must agree when both are present.
 */
export function countOutputPresentationUnits(
  output: MediaBytes,
): PerformanceEvidence<PresentationUnitCount> {
  const counter = output.telemetry?.encodedFrames;
  if (counter !== undefined && !nonNegativeSafeInteger(counter)) {
    return unavailable('ERROR', 'ENCODED_FRAME_COUNTER_INVALID', 'encodedFrames must be a non-negative safe integer');
  }

  const neutral = neutralOutputVideoUnits(output);
  if (counter !== undefined && neutral.state === 'AVAILABLE') {
    if (counter !== neutral.value.count) {
      return unavailable(
        'ERROR',
        'ENCODED_FRAME_COUNTER_MISMATCH',
        `adapter reported ${counter} encoded frames but neutral re-import counted ${neutral.value.count}`,
      );
    }
    return available({
      count: counter,
      source: 'adapter-final-counter',
      corroboratingCount: neutral.value.count,
      ...(neutral.value.trackIndexes ? { trackIndexes: neutral.value.trackIndexes } : {}),
    });
  }
  if (counter !== undefined) return available({ count: counter, source: 'adapter-final-counter' });
  if (neutral.state === 'AVAILABLE') return neutral;
  return unavailable(
    neutral.status,
    'OUTPUT_PRESENTATION_UNITS_UNAVAILABLE',
    `no adapter encoded-frame counter and neutral re-import failed: [${neutral.reasonCode}] ${neutral.reason}`,
  );
}

/** Count units in an already normalized demux result, respecting access-unit identities when present. */
export function countDemuxVideoPresentationUnits(
  demux: DemuxResult,
): PerformanceEvidence<PresentationUnitCount> {
  const videoTracks = new Set(
    demux.metadata.tracks
      .map((track, index) => ({ track, index }))
      .filter(({ track }) => track.type === 'video')
      .map(({ index }) => index),
  );
  if (videoTracks.size === 0) {
    return unavailable('NA_ENGINE', 'VIDEO_TRACK_UNAVAILABLE', 'the observed output has no video track');
  }
  const packets = demux.packets.filter((packet) =>
    packet.trackType === 'video' || videoTracks.has(packet.trackIndex));
  return countPacketPresentationUnits(packets, [...videoTracks]);
}

/**
 * Count access units rather than manufacturing a count from cadence. If every row supplies an
 * accessUnitId, legal multi-packet grouping is collapsed; otherwise one faithful reader row is one
 * presentation unit.
 */
export function countPacketPresentationUnits(
  packets: readonly Pick<PacketInfo, 'trackIndex' | 'accessUnitId'>[],
  trackIndexes?: number[],
): PerformanceEvidence<PresentationUnitCount> {
  if (packets.length === 0) {
    return unavailable('ERROR', 'VIDEO_PRESENTATION_UNITS_EMPTY', 'the video packet table contains no presentation units');
  }
  const allHaveAccessUnit = packets.every((packet) =>
    typeof packet.accessUnitId === 'string' && packet.accessUnitId.length > 0);
  const count = allHaveAccessUnit
    ? new Set(packets.map((packet) => `${packet.trackIndex}\u0000${packet.accessUnitId}`)).size
    : packets.length;
  return available({
    count,
    source: 'neutral-output-packet-reader',
    ...(trackIndexes ? { trackIndexes: [...trackIndexes].sort((a, b) => a - b) } : {}),
  });
}

/** Read presentation duration and actual video units from one output without using a scored engine. */
export function inspectOutputPresentation(output: MediaBytes): OutputPresentationEvidence {
  const structure = readOutputStructureResult(output.bytes, output.container);
  const duration = structure.state === 'OK' && finiteNonNegative(structure.value.durationSec) && structure.value.durationSec > 0
    ? resolvePresentationDuration(
        'output-presentation',
        { outputPresentationUs: structure.value.durationSec * 1_000_000 },
        'neutral container presentation timeline after edit-list/container mapping',
      )
    : unavailable<PresentationDuration>(
        structure.state === 'UNSUPPORTED_FORMAT' || structure.state === 'UNSUPPORTED_STRUCTURE' ? 'NA_ENGINE' : 'ERROR',
        structure.state === 'OK' ? 'OUTPUT_PRESENTATION_DURATION_UNAVAILABLE' : structure.reasonCode,
        structure.state === 'OK'
          ? 'neutral structure reader did not expose a positive presentation duration'
          : `neutral structure reader returned ${structure.state}`,
      );
  return { units: countOutputPresentationUnits(output), duration };
}

export type EventLatencyKind = 'first-byte' | 'first-frame';

export interface EventLatency {
  kind: EventLatencyKind;
  milliseconds: number;
  clockOrigin: 'operation-entry';
  source: 'adapter-event-final-counter';
}

/** Event latency must have been captured by the operation; completion-time inference is forbidden. */
export function operationEventLatency(
  kind: EventLatencyKind,
  telemetry: OperationFinalCounters | undefined,
  measuredWallMs?: number,
): PerformanceEvidence<EventLatency> {
  const value = kind === 'first-byte' ? telemetry?.firstByteMs : telemetry?.firstFrameMs;
  if (value === undefined) {
    return unavailable(
      'NA_ENGINE',
      kind === 'first-byte' ? 'FIRST_BYTE_EVENT_UNAVAILABLE' : 'FIRST_FRAME_EVENT_UNAVAILABLE',
      `adapter did not emit a ${kind} event relative to operation entry`,
    );
  }
  if (!finiteNonNegative(value)) {
    return unavailable('ERROR', 'EVENT_LATENCY_INVALID', `${kind} latency must be finite and non-negative`);
  }
  if (finiteNonNegative(measuredWallMs) && value > measuredWallMs) {
    return unavailable(
      'ERROR',
      'EVENT_LATENCY_OUTSIDE_WINDOW',
      `${kind} latency ${value}ms exceeds the measured operation window ${measuredWallMs}ms`,
    );
  }
  return available({
    kind,
    milliseconds: value,
    clockOrigin: 'operation-entry',
    source: 'adapter-event-final-counter',
  });
}

export interface SourceReadEvidence {
  reads: number;
  bytesRead?: number;
  sourceMode: 'random-access';
  boundary: 'adapter-input';
}

/** Source-read claims are admissible only when a real random-access source crossed the adapter boundary. */
export function sourceReadEvidence(input: {
  sourceMode?: string;
  reads?: number;
  bytesRead?: number;
  crossedAdapterBoundary?: boolean;
}): PerformanceEvidence<SourceReadEvidence> {
  if (input.sourceMode !== 'random-access' || input.crossedAdapterBoundary !== true) {
    return unavailable(
      'NA_ENGINE',
      'COUNTING_SOURCE_NOT_WIRED',
      'source-read counts require a random-access counting source passed through the adapter input boundary',
    );
  }
  if (!nonNegativeSafeInteger(input.reads) ||
      (input.bytesRead !== undefined && !nonNegativeSafeInteger(input.bytesRead))) {
    return unavailable('ERROR', 'SOURCE_READ_COUNTER_INVALID', 'source read counters must be non-negative safe integers');
  }
  return available({
    reads: input.reads,
    ...(input.bytesRead !== undefined ? { bytesRead: input.bytesRead } : {}),
    sourceMode: 'random-access',
    boundary: 'adapter-input',
  });
}

function neutralOutputVideoUnits(output: MediaBytes): PerformanceEvidence<PresentationUnitCount> {
  const structure = readOutputStructureResult(output.bytes, output.container);
  if (structure.state !== 'OK') {
    return unavailable(
      structure.state === 'UNSUPPORTED_FORMAT' || structure.state === 'UNSUPPORTED_STRUCTURE' ? 'NA_ENGINE' : 'ERROR',
      structure.reasonCode,
      `neutral structure reader returned ${structure.state}`,
    );
  }
  const videoTracks = structure.value.tracks
    .map((track, index) => ({ track, index }))
    .filter(({ track }) => track.type === 'video')
    .map(({ index }) => index);
  if (videoTracks.length === 0) {
    return unavailable('NA_ENGINE', 'VIDEO_TRACK_UNAVAILABLE', 'the observed output has no video track');
  }
  const packets = readOutputPacketsResult(output.bytes, output.container);
  if (packets.state !== 'OK') {
    return unavailable(
      packets.state === 'UNSUPPORTED_FORMAT' || packets.state === 'UNSUPPORTED_STRUCTURE' ? 'NA_ENGINE' : 'ERROR',
      packets.reasonCode,
      `neutral packet reader returned ${packets.state}`,
    );
  }
  const videoRows = packets.value.filter((packet: PacketRow) => videoTracks.includes(packet.trackIndex));
  return countPacketPresentationUnits(videoRows, videoTracks);
}

function validRational(value: { numerator: number; denominator: number }): boolean {
  return Number.isSafeInteger(value.numerator) && value.numerator > 0 &&
    Number.isSafeInteger(value.denominator) && value.denominator > 0;
}
