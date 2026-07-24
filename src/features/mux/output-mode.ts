import type { Scenario } from '../../core/scenario.ts';
import { inspectFragmentedMp4 } from '../streaming-output/fragmented-mp4.ts';
import { muxVerdict, type MuxDecision } from './types.ts';

export const MUX_WRITE_TRACE_SCHEMA = 'media-test/mux-write-trace@1' as const;
export const MUX_OUTPUT_MODE_SCHEMA = 'media-test/mux-output-mode@1' as const;

export interface MuxPositionedWrite {
  readonly sequence: number;
  readonly atMs: number;
  readonly position: number;
  readonly bytes: Uint8Array;
  readonly kind: 'append' | 'patch';
}

export interface MuxWriteReservation {
  readonly sequence: number;
  readonly position: number;
  readonly length: number;
}

export interface MuxWriteTrace {
  readonly schema: typeof MUX_WRITE_TRACE_SCHEMA;
  readonly writes: readonly MuxPositionedWrite[];
  readonly reservations: readonly MuxWriteReservation[];
  readonly finalByteLength: number;
  readonly peakBufferedBytes: number;
}

export interface MuxOutputModeContract {
  readonly schema: typeof MUX_OUTPUT_MODE_SCHEMA;
  readonly mode: 'progressive-buffer' | 'stream' | 'faststart-reserve' | 'fragmented-mp4';
  readonly minimumIncrementalBytes: number;
  readonly maximumBufferedBytes?: number;
  /** CMAF is opt-in only; fragmented MP4 alone never implies it. */
  readonly profile: 'generic-fragmented-mp4' | 'cmaf';
}

export interface MuxOutputModeEvidence {
  readonly bytes: Uint8Array;
  readonly trace?: MuxWriteTrace;
}

export function muxOutputModeContractFromScenario(
  scenario: Pick<Scenario, 'op' | 'options'>,
): MuxOutputModeContract | undefined {
  if (scenario.op !== 'mux' || !isRecord(scenario.options)) return undefined;
  const options: Record<string, unknown> = scenario.options;
  const fragmented = options.fragmented === true;
  const fastStart = options.fastStart;
  const target = options.target;
  const mode: MuxOutputModeContract['mode'] | undefined = fragmented
    ? 'fragmented-mp4'
    : fastStart === 'reserve'
      ? 'faststart-reserve'
      : target === 'stream'
        ? 'stream'
        : fastStart === false
          ? 'progressive-buffer'
          : undefined;
  if (!mode) return undefined;
  return Object.freeze({
    schema: MUX_OUTPUT_MODE_SCHEMA,
    mode,
    minimumIncrementalBytes: 4096,
    ...((mode === 'stream' || mode === 'faststart-reserve')
      ? { maximumBufferedBytes: 16 * 1024 * 1024 }
      : {}),
    profile: 'generic-fragmented-mp4',
  });
}

export function evaluateMuxOutputMode(
  contract: MuxOutputModeContract,
  evidence: MuxOutputModeEvidence,
): MuxDecision {
  if (contract.schema !== MUX_OUTPUT_MODE_SCHEMA) {
    return muxVerdict('FAIL', 'MUX_OUTPUT_MODE_SCHEMA_INVALID', 'mux output-mode contract schema is invalid');
  }
  if (!(evidence.bytes instanceof Uint8Array) || evidence.bytes.byteLength === 0) {
    return muxVerdict('FAIL', 'MUX_OUTPUT_BYTES_EMPTY', 'output-mode contract has no candidate bytes');
  }
  const layout = topLevelBoxes(evidence.bytes);
  if ('reasonCode' in layout) return muxVerdict('FAIL', layout.reasonCode, layout.detail);
  const measurements: Record<string, number> = {
    outputBytes: evidence.bytes.byteLength,
    topLevelBoxes: layout.length,
  };

  if (contract.mode === 'fragmented-mp4') {
    const fragmented = inspectFragmentedMp4(evidence.bytes, { cmaf: contract.profile === 'cmaf' });
    if (fragmented.state !== 'OK') return muxVerdict('FAIL', fragmented.reasonCode, fragmented.detail, measurements);
    return muxVerdict(
      'PASS',
      contract.profile === 'cmaf' ? 'MUX_CMAF_FRAGMENT_CONTRACT_MATCH' : 'MUX_GENERIC_FMP4_CONTRACT_MATCH',
      `${fragmented.segments.length} fragment(s), ${fragmented.totalSamples} sample(s); profile=${contract.profile}`,
      {
        ...measurements,
        fragments: fragmented.segments.length,
        samples: fragmented.totalSamples,
        cmafCompatible: fragmented.cmafCompatible ? 1 : 0,
      },
    );
  }

  const moov = layout.find((box) => box.type === 'moov');
  const mdat = layout.find((box) => box.type === 'mdat');
  const ftyp = layout.find((box) => box.type === 'ftyp');
  if (!ftyp || !moov || !mdat) {
    return muxVerdict('FAIL', 'MUX_MP4_INIT_MOVIE_MEDIA_MISSING', 'MP4 output requires ftyp, moov, and mdat', measurements);
  }
  if (contract.mode === 'progressive-buffer') {
    if (mdat.start >= moov.start) {
      return muxVerdict('FAIL', 'MUX_PROGRESSIVE_LAYOUT_MISMATCH', 'progressive buffered MP4 requires mdat before final moov', measurements);
    }
    if (evidence.trace) {
      const replay = validateMuxWriteTrace(evidence.trace, evidence.bytes, false);
      if (replay.state !== 'VERDICT' || replay.verdict === 'FAIL') return replay;
    }
    return muxVerdict('PASS', 'MUX_PROGRESSIVE_BUFFER_VALID', 'valid mdat-before-moov buffered MP4', measurements);
  }

  if (!evidence.trace) {
    return muxVerdict('FAIL', 'MUX_WRITE_TRACE_MISSING', `${contract.mode} correctness requires positioned-write evidence`, measurements);
  }
  const replay = validateMuxWriteTrace(evidence.trace, evidence.bytes, contract.mode === 'faststart-reserve');
  if (replay.state !== 'VERDICT' || replay.verdict !== 'PASS') return replay;
  const writes = evidence.trace.writes.length;
  measurements.writeCount = writes;
  measurements.peakBufferedBytes = evidence.trace.peakBufferedBytes;
  if (evidence.bytes.byteLength >= contract.minimumIncrementalBytes && writes <= 1) {
    return muxVerdict(
      'FAIL',
      'MUX_STREAM_NOT_INCREMENTAL',
      `${evidence.bytes.byteLength} byte nontrivial stream used ${writes} write`,
      measurements,
    );
  }
  if (contract.maximumBufferedBytes !== undefined && evidence.trace.peakBufferedBytes > contract.maximumBufferedBytes) {
    return muxVerdict(
      'FAIL',
      'MUX_STREAM_BUFFER_BOUND_EXCEEDED',
      `peak buffered bytes ${evidence.trace.peakBufferedBytes} > ${contract.maximumBufferedBytes}`,
      measurements,
    );
  }

  if (contract.mode === 'faststart-reserve') {
    if (moov.start >= mdat.start) {
      return muxVerdict('FAIL', 'MUX_RESERVE_LAYOUT_MISMATCH', 'reserved fast-start MP4 requires moov before media', measurements);
    }
    const reserve = validateReserveAlgorithm(evidence.trace);
    if (reserve.state !== 'VERDICT' || reserve.verdict !== 'PASS') return reserve;
    return muxVerdict(
      'PASS',
      'MUX_FASTSTART_RESERVE_VALID',
      'moov precedes media and positioned reservation was patched into an exact byte reconstruction',
      measurements,
    );
  }

  return muxVerdict(
    'PASS',
    'MUX_INCREMENTAL_STREAM_VALID',
    `${writes} positioned writes reconstruct the exact ${evidence.bytes.byteLength}-byte output within buffer bounds`,
    measurements,
  );
}

/** Replay exact bytes with a range ledger: no allocation proportional to a sparse address space. */
export function validateMuxWriteTrace(
  trace: MuxWriteTrace,
  finalBytes: Uint8Array,
  allowReservedPatches: boolean,
): MuxDecision {
  if (trace.schema !== MUX_WRITE_TRACE_SCHEMA) {
    return muxVerdict('FAIL', 'MUX_WRITE_TRACE_SCHEMA_INVALID', 'positioned-write trace schema is invalid');
  }
  if (!Number.isSafeInteger(trace.finalByteLength) || trace.finalByteLength !== finalBytes.byteLength ||
      !Number.isSafeInteger(trace.peakBufferedBytes) || trace.peakBufferedBytes < 0) {
    return muxVerdict('FAIL', 'MUX_WRITE_TRACE_SUMMARY_INVALID', 'write trace extent/buffer summary is invalid');
  }
  const reservations = trace.reservations.map((reservation) => ({
    ...reservation,
    start: reservation.position,
    end: reservation.position + reservation.length,
  }));
  for (const reservation of reservations) {
    if (!validRange(reservation.position, reservation.length, finalBytes.byteLength) ||
        !Number.isSafeInteger(reservation.sequence) || reservation.sequence < 0) {
      return muxVerdict('FAIL', 'MUX_RESERVATION_RANGE_INVALID', 'reservation is outside final output extent');
    }
  }
  for (let index = 0; index < reservations.length; index++) {
    if (reservations.slice(index + 1).some((other) => overlaps(reservations[index]!, other))) {
      return muxVerdict('FAIL', 'MUX_RESERVATION_OVERLAP', 'write reservations overlap');
    }
  }
  let priorSequence = -1;
  let priorAtMs = -Infinity;
  const eventSequences = new Set(reservations.map((reservation) => reservation.sequence));
  if (eventSequences.size !== reservations.length) {
    return muxVerdict('FAIL', 'MUX_RESERVATION_SEQUENCE_DUPLICATE', 'reservation sequences must be unique');
  }
  const appendRanges: Array<{ start: number; end: number }> = [];
  const patchRanges: Array<{ start: number; end: number }> = [];
  const allRanges: Array<{ start: number; end: number }> = [];
  for (const write of trace.writes) {
    if (!Number.isSafeInteger(write.sequence) || write.sequence <= priorSequence || eventSequences.has(write.sequence) ||
        !Number.isFinite(write.atMs) || write.atMs < priorAtMs ||
        !(write.bytes instanceof Uint8Array) || write.bytes.byteLength === 0 ||
        !validRange(write.position, write.bytes.byteLength, finalBytes.byteLength)) {
      return muxVerdict('FAIL', 'MUX_WRITE_EVENT_INVALID', `write sequence ${write.sequence} has invalid order/range/bytes`);
    }
    priorSequence = write.sequence;
    priorAtMs = write.atMs;
    eventSequences.add(write.sequence);
    const range = { start: write.position, end: write.position + write.bytes.byteLength };
    if (write.kind === 'append') {
      if (appendRanges.some((other) => overlaps(range, other)) || patchRanges.some((other) => overlaps(range, other))) {
        return muxVerdict('FAIL', 'MUX_APPEND_WRITE_OVERLAP', `append write ${write.sequence} overlaps prior output bytes`);
      }
      appendRanges.push(range);
    } else {
      const reservation = reservations.find((item) =>
        item.sequence < write.sequence && range.start >= item.position && range.end <= item.end);
      const priorWritesCoverRange = rangeCoveredBy(range, allRanges);
      if (!priorWritesCoverRange && (!allowReservedPatches || !reservation)) {
        return muxVerdict(
          'FAIL',
          'MUX_PATCH_WITHOUT_PRIOR_BYTES_OR_RESERVATION',
          `patch write ${write.sequence} is neither inside a prior reservation nor over prior positioned bytes`,
        );
      }
      patchRanges.push(range);
    }
    allRanges.push(range);
  }

  // Validate the exact replay with last-write-wins semantics. Earlier placeholder/header writes
  // are compared only where no later positioned patch superseded them; this retains a range ledger
  // and never allocates a second output-sized buffer.
  let laterRanges: Array<{ start: number; end: number }> = [];
  for (let writeIndex = trace.writes.length - 1; writeIndex >= 0; writeIndex--) {
    const write = trace.writes[writeIndex]!;
    const range = { start: write.position, end: write.position + write.bytes.byteLength };
    for (const visible of subtractCoveredRange(range, laterRanges)) {
      for (let position = visible.start; position < visible.end; position++) {
        if (write.bytes[position - write.position] !== finalBytes[position]) {
          return muxVerdict(
            'FAIL',
            'MUX_WRITE_RECONSTRUCTION_MISMATCH',
            `write ${write.sequence} differs from final output at byte ${position}`,
          );
        }
      }
    }
    laterRanges = mergeRanges([...laterRanges, range]);
  }
  // A forward reservation is an observable zero-filled extent in the positioned spool. Patches may
  // materialize only the moov/free headers; untouched free-box payload remains implicit zero data.
  for (const reservation of reservations) {
    for (const visible of subtractCoveredRange(reservation, allRanges)) {
      for (let position = visible.start; position < visible.end; position++) {
        if (finalBytes[position] !== 0) {
          return muxVerdict(
            'FAIL',
            'MUX_RESERVATION_RECONSTRUCTION_MISMATCH',
            `unwritten reserved byte ${position} is nonzero in final output`,
          );
        }
      }
    }
  }
  const merged = mergeRanges([...allRanges, ...reservations]);
  if (merged.length !== 1 || merged[0]!.start !== 0 || merged[0]!.end !== finalBytes.byteLength) {
    return muxVerdict('FAIL', 'MUX_WRITE_RECONSTRUCTION_GAP', 'positioned writes do not cover every final output byte exactly');
  }
  return muxVerdict(
    'PASS',
    'MUX_WRITE_RECONSTRUCTION_EXACT',
    `${trace.writes.length} write(s) exactly reconstruct ${finalBytes.byteLength} byte(s)`,
    { writeCount: trace.writes.length, outputBytes: finalBytes.byteLength, peakBufferedBytes: trace.peakBufferedBytes },
  );
}

function validateReserveAlgorithm(trace: MuxWriteTrace): MuxDecision {
  if (trace.reservations.length !== 1) {
    return muxVerdict('FAIL', 'MUX_RESERVATION_CARDINALITY_INVALID', `expected one reservation, got ${trace.reservations.length}`);
  }
  const reservation = trace.reservations[0]!;
  const end = reservation.position + reservation.length;
  const forward = trace.writes.find((write) => write.kind === 'append' && write.sequence > reservation.sequence && write.position >= end);
  const patch = forward && trace.writes.find((write) =>
    write.kind === 'patch' && write.sequence > forward.sequence &&
    write.position >= reservation.position && write.position + write.bytes.byteLength <= end);
  return forward && patch
    ? muxVerdict('PASS', 'MUX_RESERVE_POSITIONED_PATCH_OBSERVED', `forward write ${forward.sequence}, patch ${patch.sequence}`)
    : muxVerdict('FAIL', 'MUX_RESERVE_POSITIONED_PATCH_MISSING', 'reserve mode needs a forward media write followed by a patch');
}

interface BoxRange { type: string; start: number; end: number }

function topLevelBoxes(bytes: Uint8Array): BoxRange[] | { reasonCode: string; detail: string } {
  const out: BoxRange[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) return { reasonCode: 'MUX_MP4_BOX_HEADER_INCOMPLETE', detail: `box header truncated at ${offset}` };
    const size32 = view.getUint32(offset);
    const type = ascii(bytes, offset + 4, 4);
    let size = size32;
    let header = 8;
    if (!/^[A-Za-z0-9 ]{4}$/.test(type)) return { reasonCode: 'MUX_MP4_BOX_TYPE_INVALID', detail: `invalid box type at ${offset}` };
    if (size32 === 1) {
      if (offset + 16 > bytes.byteLength) return { reasonCode: 'MUX_MP4_LARGE_SIZE_INCOMPLETE', detail: `large-size box truncated at ${offset}` };
      size = Number(view.getBigUint64(offset + 8));
      header = 16;
    } else if (size32 === 0) {
      size = bytes.byteLength - offset;
    }
    if (!Number.isSafeInteger(size) || size < header || offset + size > bytes.byteLength) {
      return { reasonCode: 'MUX_MP4_BOX_SIZE_INVALID', detail: `${type} size ${size} is invalid at ${offset}` };
    }
    out.push({ type, start: offset, end: offset + size });
    offset += size;
  }
  return out;
}

function validRange(position: number, length: number, extent: number): boolean {
  return Number.isSafeInteger(position) && position >= 0 && Number.isSafeInteger(length) && length > 0 &&
    Number.isSafeInteger(position + length) && position + length <= extent;
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

function rangeCoveredBy(
  range: { start: number; end: number },
  ranges: readonly { start: number; end: number }[],
): boolean {
  return mergeRanges(ranges).some((candidate) => candidate.start <= range.start && candidate.end >= range.end);
}

function subtractCoveredRange(
  range: { start: number; end: number },
  covered: readonly { start: number; end: number }[],
): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  let cursor = range.start;
  for (const item of mergeRanges(covered)) {
    if (item.end <= cursor) continue;
    if (item.start >= range.end) break;
    if (item.start > cursor) out.push({ start: cursor, end: Math.min(item.start, range.end) });
    cursor = Math.max(cursor, item.end);
    if (cursor >= range.end) break;
  }
  if (cursor < range.end) out.push({ start: cursor, end: range.end });
  return out;
}

function mergeRanges(ranges: readonly { start: number; end: number }[]): Array<{ start: number; end: number }> {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Array<{ start: number; end: number }> = [];
  for (const range of sorted) {
    const last = out[out.length - 1];
    if (!last || range.start > last.end) out.push({ ...range });
    else last.end = Math.max(last.end, range.end);
  }
  return out;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = '';
  for (let index = 0; index < length; index++) out += String.fromCharCode(bytes[offset + index] ?? 0);
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
