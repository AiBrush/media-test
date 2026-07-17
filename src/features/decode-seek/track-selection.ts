import {
  DECODE_TRACK_SELECTOR_SCHEMA,
  type DecodeOptions,
  type DecodeTrackSelector,
  type FrameDigest,
  type SelectedDecodeTrackEvidence,
} from '../../core/engine.ts';
import { decodeSeekVerdict, isRecord, type DecodeSeekVerdict } from './types.ts';

export { DECODE_TRACK_SELECTOR_SCHEMA };
export type { DecodeTrackSelector, SelectedDecodeTrackEvidence };
export type DecodeFeatureOptions = DecodeOptions;

export function defineDecodeTrackSelector(
  input: Omit<DecodeTrackSelector, 'schema'>,
): DecodeTrackSelector {
  if (input.type !== 'video' && input.type !== 'audio') throw new TypeError('decode selector type is invalid');
  if (input.trackIndex !== undefined && (!Number.isSafeInteger(input.trackIndex) || input.trackIndex < 0)) {
    throw new TypeError('decode selector trackIndex must be a non-negative integer');
  }
  if (input.typeOrdinal !== undefined && (!Number.isSafeInteger(input.typeOrdinal) || input.typeOrdinal < 0)) {
    throw new TypeError('decode selector typeOrdinal must be a non-negative integer');
  }
  if (input.trackId !== undefined && input.trackId.trim() === '') throw new TypeError('decode selector trackId is empty');
  if (input.trackIndex === undefined && input.typeOrdinal === undefined && input.trackId === undefined) {
    throw new TypeError('decode selector must identify a concrete track');
  }
  return Object.freeze({ schema: DECODE_TRACK_SELECTOR_SCHEMA, ...input });
}

/** Parse the normalized selector, retaining the legacy type-only hint as intentionally insufficient. */
export function decodeTrackSelectorFromOptions(options: unknown): DecodeTrackSelector | undefined {
  if (!isRecord(options)) return undefined;
  const raw = options.decodeTrackSelector;
  if (!isRecord(raw) || raw.schema !== DECODE_TRACK_SELECTOR_SCHEMA) return undefined;
  try {
    return defineDecodeTrackSelector({
      type: raw.type as DecodeTrackSelector['type'],
      ...(typeof raw.trackIndex === 'number' ? { trackIndex: raw.trackIndex } : {}),
      ...(typeof raw.typeOrdinal === 'number' ? { typeOrdinal: raw.typeOrdinal } : {}),
      ...(typeof raw.trackId === 'string' ? { trackId: raw.trackId } : {}),
      ...(typeof raw.firstFrameSha256 === 'string' ? { firstFrameSha256: raw.firstFrameSha256 } : {}),
    });
  } catch {
    return undefined;
  }
}

export function assessDecodeTrackSelection(
  requested: DecodeTrackSelector,
  observed: SelectedDecodeTrackEvidence | undefined,
  frames: readonly FrameDigest[],
): DecodeSeekVerdict {
  if (!observed) {
    return decodeSeekVerdict(
      'FAIL',
      'DECODE_TRACK_SELECTION_EVIDENCE_MISSING',
      'adapter did not identify the track that produced the decoded frames',
    );
  }
  const mismatches: string[] = [];
  if (observed.schema !== DECODE_TRACK_SELECTOR_SCHEMA) mismatches.push('evidence schema');
  if (observed.type !== requested.type) mismatches.push(`type ${observed.type} != ${requested.type}`);
  if (requested.trackIndex !== undefined && observed.trackIndex !== requested.trackIndex) {
    mismatches.push(`trackIndex ${observed.trackIndex} != ${requested.trackIndex}`);
  }
  if (requested.typeOrdinal !== undefined && observed.typeOrdinal !== requested.typeOrdinal) {
    mismatches.push(`typeOrdinal ${observed.typeOrdinal} != ${requested.typeOrdinal}`);
  }
  if (requested.trackId !== undefined && observed.trackId !== requested.trackId) {
    mismatches.push(`trackId ${observed.trackId ?? '<absent>'} != ${requested.trackId}`);
  }
  if (frames.length === 0) mismatches.push('selected track produced no frames');
  const first = frames[0];
  if (requested.firstFrameSha256 &&
      (!first || normalizeDigest(first.sha256) !== normalizeDigest(requested.firstFrameSha256))) {
    mismatches.push('first-frame identity does not match selected track');
  }
  if (first && observed.width !== undefined && first.width !== undefined && first.width !== observed.width) {
    mismatches.push(`frame width ${first.width} != selected-track width ${observed.width}`);
  }
  if (first && observed.height !== undefined && first.height !== undefined && first.height !== observed.height) {
    mismatches.push(`frame height ${first.height} != selected-track height ${observed.height}`);
  }
  const measurements = {
    selectedTrackIndex: observed.trackIndex,
    selectedTypeOrdinal: observed.typeOrdinal,
    decodedFrames: frames.length,
  };
  return mismatches.length > 0
    ? decodeSeekVerdict('FAIL', 'DECODE_TRACK_SELECTION_MISMATCH', mismatches.join('; '), measurements)
    : decodeSeekVerdict(
        'PASS',
        'DECODE_TRACK_SELECTION_MATCH',
        `decoded requested ${observed.type} track index ${observed.trackIndex} (ordinal ${observed.typeOrdinal})`,
        measurements,
      );
}

function normalizeDigest(value: string): string {
  return value.trim().toLowerCase();
}
