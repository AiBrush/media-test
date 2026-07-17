import { streamingVerdict, type StreamingDecision } from './types.ts';

export const MPEG_TS_PACKET_BYTES = 188;
const PTS_MODULUS = 2 ** 33;
const PTS_HALF = 2 ** 32;
const NULL_PID = 0x1fff;

export interface MpegTsStreamEvidence {
  readonly pid: number;
  readonly streamType: number;
  readonly pesStarts: number;
  readonly firstPts33: number;
  readonly lastPtsUnwrapped: number;
  readonly ptsRolloverCount: number;
  readonly firstDts33: number | null;
  readonly lastDtsUnwrapped: number | null;
  readonly dtsRolloverCount: number;
}

export interface MpegTsEvidence {
  readonly state: 'OK';
  readonly packetCount: number;
  readonly programNumber: number;
  readonly pmtPid: number;
  readonly pcrPid: number;
  readonly patSections: number;
  readonly pmtSections: number;
  readonly continuityWraps: number;
  readonly duplicatePackets: number;
  readonly discontinuities: number;
  readonly pcrCount: number;
  readonly streams: readonly MpegTsStreamEvidence[];
}

export type MpegTsReadResult =
  | MpegTsEvidence
  | {
      readonly state: 'UNSUPPORTED' | 'MALFORMED';
      readonly reasonCode: string;
      readonly detail: string;
      readonly packetIndex?: number;
      readonly pid?: number;
    };

interface ContinuityState {
  cc: number;
  packet: Uint8Array;
}

interface ProgramState {
  programNumber: number;
  pmtPid: number;
}

interface PmtState {
  programNumber: number;
  pcrPid: number;
  streams: Map<number, number>;
}

interface StreamState {
  streamType: number;
  pesStarts: number;
  firstPts33?: number;
  lastRawPts?: number;
  lastPtsUnwrapped?: number;
  ptsEpoch: number;
  ptsRolloverCount: number;
  firstDts33?: number;
  lastRawDts?: number;
  lastDtsUnwrapped?: number;
  dtsEpoch: number;
  dtsRolloverCount: number;
  remainingPesBytes?: number;
}

class TsMalformed extends Error {
  constructor(
    readonly reasonCode: string,
    message: string,
    readonly packetIndex?: number,
    readonly pid?: number,
  ) {
    super(message);
    this.name = 'TsMalformed';
  }
}

/** Strict dependency-free MPEG-TS structure/continuity reader. It never returns partial evidence. */
export function inspectMpegTs(bytes: Uint8Array): MpegTsReadResult {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < MPEG_TS_PACKET_BYTES) {
    return malformed('TS_INPUT_INCOMPLETE', 'input is shorter than one 188-byte transport packet');
  }
  if (bytes[0] !== 0x47) {
    return Object.freeze({
      state: 'UNSUPPORTED' as const,
      reasonCode: 'TS_SYNC_PREFIX_MISSING',
      detail: 'input does not begin with an MPEG-TS sync byte',
    });
  }
  if (bytes.byteLength % MPEG_TS_PACKET_BYTES !== 0) {
    return malformed(
      'TS_PACKET_ALIGNMENT_INVALID',
      `byte length ${bytes.byteLength} is not divisible by ${MPEG_TS_PACKET_BYTES}`,
    );
  }

  const continuity = new Map<number, ContinuityState>();
  const psi = new Map<number, PsiAssembler>();
  let program: ProgramState | undefined;
  let pmt: PmtState | undefined;
  let patSections = 0;
  let pmtSections = 0;
  let continuityWraps = 0;
  let duplicatePackets = 0;
  let discontinuities = 0;
  let pcrCount = 0;
  let pcrSeen = false;
  const streams = new Map<number, StreamState>();

  try {
    for (let packetIndex = 0; packetIndex < bytes.byteLength / MPEG_TS_PACKET_BYTES; packetIndex++) {
      const packet = bytes.subarray(packetIndex * MPEG_TS_PACKET_BYTES, (packetIndex + 1) * MPEG_TS_PACKET_BYTES);
      if (packet[0] !== 0x47) throw issue('TS_SYNC_BYTE_INVALID', 'transport packet sync byte is not 0x47', packetIndex);
      const tei = (packet[1]! & 0x80) !== 0;
      const payloadUnitStart = (packet[1]! & 0x40) !== 0;
      const pid = ((packet[1]! & 0x1f) << 8) | packet[2]!;
      const scrambling = (packet[3]! >> 6) & 0x03;
      const adaptationControl = (packet[3]! >> 4) & 0x03;
      const cc = packet[3]! & 0x0f;
      if (tei) throw issue('TS_TRANSPORT_ERROR_INDICATOR_SET', 'transport_error_indicator is set', packetIndex, pid);
      if (scrambling !== 0) throw issue('TS_SCRAMBLED_PACKET_UNSUPPORTED', 'transport_scrambling_control is non-zero', packetIndex, pid);
      if (adaptationControl === 0) throw issue('TS_ADAPTATION_CONTROL_RESERVED', 'adaptation_field_control=0 is reserved', packetIndex, pid);

      let payloadOffset = 4;
      let discontinuity = false;
      let hasPcr = false;
      if (adaptationControl === 2 || adaptationControl === 3) {
        const adaptationLength = packet[4]!;
        const adaptationEnd = 5 + adaptationLength;
        if (adaptationEnd > MPEG_TS_PACKET_BYTES) {
          throw issue('TS_ADAPTATION_FIELD_TRUNCATED', 'adaptation field extends beyond its packet', packetIndex, pid);
        }
        payloadOffset = adaptationEnd;
        if (adaptationLength > 0) {
          const flags = packet[5]!;
          discontinuity = (flags & 0x80) !== 0;
          hasPcr = (flags & 0x10) !== 0;
          if (hasPcr) {
            if (adaptationLength < 7) throw issue('TS_PCR_TRUNCATED', 'PCR flag is set without six PCR bytes', packetIndex, pid);
            parsePcr(packet, 6, packetIndex, pid);
            pcrCount++;
            if (pmt?.pcrPid === pid) pcrSeen = true;
          }
        }
      }
      const hasPayload = adaptationControl === 1 || adaptationControl === 3;
      if (hasPayload && payloadOffset >= MPEG_TS_PACKET_BYTES) {
        throw issue('TS_PAYLOAD_EMPTY', 'payload flag is set but adaptation consumes the packet', packetIndex, pid);
      }
      if (discontinuity) discontinuities++;

      let duplicate = false;
      if (pid !== NULL_PID && hasPayload) {
        const previous = continuity.get(pid);
        if (previous && !discontinuity) {
          const expected = (previous.cc + 1) & 0x0f;
          if (cc === previous.cc) {
            if (!equalBytes(packet, previous.packet)) {
              throw issue(
                'TS_CONTINUITY_DUPLICATE_PAYLOAD_CHANGED',
                `PID ${pid} repeats continuity counter ${cc} with different packet bytes`,
                packetIndex,
                pid,
              );
            }
            duplicate = true;
            duplicatePackets++;
          } else if (cc !== expected) {
            throw issue(
              'TS_CONTINUITY_COUNTER_MISMATCH',
              `PID ${pid} continuity ${cc}, expected ${expected} after ${previous.cc}`,
              packetIndex,
              pid,
            );
          } else if (previous.cc === 15 && cc === 0) continuityWraps++;
        }
        if (!duplicate) continuity.set(pid, { cc, packet: packet.slice() });
      }
      if (!hasPayload || duplicate || pid === NULL_PID) continue;
      const payload = packet.subarray(payloadOffset);

      if (pid === 0) {
        const sections = assembler(psi, 0).feed(payload, payloadUnitStart, packetIndex, pid);
        for (const section of sections) {
          const next = parsePat(section, packetIndex);
          if (program && (program.programNumber !== next.programNumber || program.pmtPid !== next.pmtPid)) {
            throw issue('TS_PAT_CHANGED', 'PAT program mapping changed within one byte stream', packetIndex, pid);
          }
          program = next;
          patSections++;
        }
        continue;
      }
      if (program && pid === program.pmtPid) {
        const sections = assembler(psi, pid).feed(payload, payloadUnitStart, packetIndex, pid);
        for (const section of sections) {
          const next = parsePmt(section, program, packetIndex);
          if (pmt && !samePmt(pmt, next)) throw issue('TS_PMT_CHANGED', 'PMT changed within one byte stream', packetIndex, pid);
          pmt = next;
          for (const [streamPid, streamType] of next.streams) {
            const existing = streams.get(streamPid);
            if (existing && existing.streamType !== streamType) {
              throw issue('TS_STREAM_TYPE_CHANGED', `PID ${streamPid} stream type changed`, packetIndex, streamPid);
            }
            streams.set(streamPid, existing ?? {
              streamType,
              pesStarts: 0,
              ptsEpoch: 0,
              ptsRolloverCount: 0,
              dtsEpoch: 0,
              dtsRolloverCount: 0,
            });
          }
          if (hasPcr) pcrSeen = true;
          pmtSections++;
        }
        continue;
      }

      const stream = streams.get(pid);
      if (!stream) {
        if (payloadUnitStart && isPesPrefix(payload)) {
          throw issue('TS_MEDIA_BEFORE_PMT', `PES PID ${pid} appeared before its PMT declaration`, packetIndex, pid);
        }
        continue;
      }
      if (!pcrSeen) {
        throw issue('TS_PCR_NOT_BEFORE_MEDIA', `media PID ${pid} appeared before PCR PID ${pmt?.pcrPid ?? '?'}`, packetIndex, pid);
      }
      consumePes(stream, payload, payloadUnitStart, packetIndex, pid);
    }

    for (const [pid, assemblerValue] of psi) {
      if (!assemblerValue.complete) throw issue('TS_PSI_SECTION_INCOMPLETE', `PSI PID ${pid} ends with an incomplete section`, undefined, pid);
    }
    if (!program || patSections === 0) throw issue('TS_PAT_MISSING', 'no complete PAT section was observed');
    if (!pmt || pmtSections === 0) throw issue('TS_PMT_MISSING', 'no complete PMT section was observed');
    if (pmt.streams.size === 0) throw issue('TS_PMT_STREAMS_EMPTY', 'PMT declares no elementary streams');
    if (!pcrSeen || pcrCount === 0) throw issue('TS_PCR_MISSING', 'no PCR was observed on the declared PCR PID');
    for (const [pid, stream] of streams) {
      if (stream.pesStarts === 0 || stream.firstPts33 === undefined || stream.lastPtsUnwrapped === undefined) {
        throw issue('TS_PES_PTS_MISSING', `stream PID ${pid} has no complete PES start with PTS`, undefined, pid);
      }
      if (stream.remainingPesBytes !== undefined && stream.remainingPesBytes > 0) {
        throw issue('TS_PES_PACKET_INCOMPLETE', `stream PID ${pid} PES is short by ${stream.remainingPesBytes} bytes`, undefined, pid);
      }
    }

    return Object.freeze({
      state: 'OK' as const,
      packetCount: bytes.byteLength / MPEG_TS_PACKET_BYTES,
      programNumber: program.programNumber,
      pmtPid: program.pmtPid,
      pcrPid: pmt.pcrPid,
      patSections,
      pmtSections,
      continuityWraps,
      duplicatePackets,
      discontinuities,
      pcrCount,
      streams: Object.freeze([...streams.entries()].sort(([a], [b]) => a - b).map(([pid, stream]) => Object.freeze({
        pid,
        streamType: stream.streamType,
        pesStarts: stream.pesStarts,
        firstPts33: stream.firstPts33!,
        lastPtsUnwrapped: stream.lastPtsUnwrapped!,
        ptsRolloverCount: stream.ptsRolloverCount,
        firstDts33: stream.firstDts33 ?? null,
        lastDtsUnwrapped: stream.lastDtsUnwrapped ?? null,
        dtsRolloverCount: stream.dtsRolloverCount,
      }))),
    });
  } catch (error) {
    if (error instanceof TsMalformed) {
      return malformed(error.reasonCode, error.message, error.packetIndex, error.pid);
    }
    return malformed('TS_READER_INTERNAL_ERROR', error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  }
}

export function assessMpegTsStructure(bytes: Uint8Array): StreamingDecision {
  const result = inspectMpegTs(bytes);
  if (result.state !== 'OK') {
    return streamingVerdict(
      'FAIL',
      result.reasonCode,
      `${result.detail}${result.packetIndex !== undefined ? ` at packet ${result.packetIndex}` : ''}`,
    );
  }
  return streamingVerdict(
    'PASS',
    'TS_STRUCTURE_CONTINUITY_VALID',
    `${result.packetCount} packet(s), program ${result.programNumber}, ${result.streams.length} stream(s)`,
    {
      packetCount: result.packetCount,
      streamCount: result.streams.length,
      continuityWraps: result.continuityWraps,
      duplicatePackets: result.duplicatePackets,
      discontinuities: result.discontinuities,
      pcrCount: result.pcrCount,
      ptsRollovers: result.streams.reduce((sum, stream) => sum + stream.ptsRolloverCount, 0),
      dtsRollovers: result.streams.reduce((sum, stream) => sum + stream.dtsRolloverCount, 0),
    },
  );
}

class PsiAssembler {
  private pending: Uint8Array = new Uint8Array(0);

  get complete(): boolean {
    return this.pending.byteLength === 0;
  }

  feed(payload: Uint8Array, start: boolean, packetIndex: number, pid: number): Uint8Array[] {
    const sections: Uint8Array[] = [];
    let cursor = 0;
    if (start) {
      if (payload.byteLength === 0) throw issue('TS_PSI_POINTER_MISSING', 'PSI start has no pointer field', packetIndex, pid);
      const pointer = payload[0]!;
      cursor = 1;
      if (cursor + pointer > payload.byteLength) {
        throw issue('TS_PSI_POINTER_INVALID', 'PSI pointer extends beyond payload', packetIndex, pid);
      }
      if (this.pending.byteLength > 0) {
        this.pending = append(this.pending, payload.subarray(cursor, cursor + pointer));
        cursor += pointer;
        this.extract(sections, packetIndex, pid);
        if (this.pending.byteLength > 0) {
          throw issue('TS_PSI_SECTION_INCOMPLETE', 'new PSI section starts before the previous section completed', packetIndex, pid);
        }
      } else {
        cursor += pointer;
      }
    }
    this.pending = append(this.pending, payload.subarray(cursor));
    this.extract(sections, packetIndex, pid);
    return sections;
  }

  private extract(out: Uint8Array[], packetIndex: number, pid: number): void {
    while (this.pending.byteLength > 0) {
      if (this.pending[0] === 0xff) {
        if (!this.pending.every((byte) => byte === 0xff)) {
          throw issue('TS_PSI_STUFFING_INVALID', 'non-0xff bytes follow PSI stuffing', packetIndex, pid);
        }
        this.pending = new Uint8Array(0);
        return;
      }
      if (this.pending.byteLength < 3) return;
      const sectionLength = ((this.pending[1]! & 0x0f) << 8) | this.pending[2]!;
      if (sectionLength < 4 || sectionLength > 1021) {
        throw issue('TS_PSI_SECTION_LENGTH_INVALID', `PSI section_length=${sectionLength}`, packetIndex, pid);
      }
      const total = 3 + sectionLength;
      if (this.pending.byteLength < total) return;
      out.push(this.pending.slice(0, total));
      this.pending = this.pending.slice(total);
    }
  }
}

function parsePat(section: Uint8Array, packetIndex: number): ProgramState {
  validatePsi(section, 0x00, packetIndex, 0);
  const entriesEnd = section.byteLength - 4;
  if ((entriesEnd - 8) % 4 !== 0) throw issue('TS_PAT_ENTRIES_MALFORMED', 'PAT entries are not 4-byte aligned', packetIndex, 0);
  const programs: ProgramState[] = [];
  for (let offset = 8; offset < entriesEnd; offset += 4) {
    const programNumber = (section[offset]! << 8) | section[offset + 1]!;
    const pid = ((section[offset + 2]! & 0x1f) << 8) | section[offset + 3]!;
    if (programNumber !== 0) programs.push({ programNumber, pmtPid: pid });
  }
  if (programs.length !== 1) {
    throw issue('TS_PAT_SINGLE_PROGRAM_REQUIRED', `PAT declares ${programs.length} non-network program(s)`, packetIndex, 0);
  }
  return programs[0]!;
}

function parsePmt(section: Uint8Array, program: ProgramState, packetIndex: number): PmtState {
  validatePsi(section, 0x02, packetIndex, program.pmtPid);
  const programNumber = (section[3]! << 8) | section[4]!;
  if (programNumber !== program.programNumber) {
    throw issue('TS_PMT_PROGRAM_MISMATCH', `PMT program ${programNumber} != PAT ${program.programNumber}`, packetIndex, program.pmtPid);
  }
  const pcrPid = ((section[8]! & 0x1f) << 8) | section[9]!;
  const programInfoLength = ((section[10]! & 0x0f) << 8) | section[11]!;
  const end = section.byteLength - 4;
  let offset = 12 + programInfoLength;
  if (offset > end) throw issue('TS_PMT_PROGRAM_INFO_TRUNCATED', 'PMT program_info extends beyond section', packetIndex, program.pmtPid);
  const streams = new Map<number, number>();
  while (offset < end) {
    if (offset + 5 > end) throw issue('TS_PMT_STREAM_ENTRY_TRUNCATED', 'PMT stream entry is truncated', packetIndex, program.pmtPid);
    const streamType = section[offset]!;
    const pid = ((section[offset + 1]! & 0x1f) << 8) | section[offset + 2]!;
    const infoLength = ((section[offset + 3]! & 0x0f) << 8) | section[offset + 4]!;
    offset += 5;
    if (offset + infoLength > end) throw issue('TS_PMT_ES_INFO_TRUNCATED', 'PMT ES_info extends beyond section', packetIndex, program.pmtPid);
    if (streams.has(pid)) throw issue('TS_PMT_PID_DUPLICATE', `PMT repeats elementary PID ${pid}`, packetIndex, pid);
    streams.set(pid, streamType);
    offset += infoLength;
  }
  return { programNumber, pcrPid, streams };
}

function validatePsi(section: Uint8Array, tableId: number, packetIndex: number, pid: number): void {
  if (section[0] !== tableId) throw issue('TS_PSI_TABLE_ID_INVALID', `table_id ${section[0]} != ${tableId}`, packetIndex, pid);
  if ((section[1]! & 0x80) === 0) throw issue('TS_PSI_SYNTAX_INDICATOR_MISSING', 'section_syntax_indicator is zero', packetIndex, pid);
  if ((section[5]! & 0x01) === 0) throw issue('TS_PSI_NOT_CURRENT', 'current_next_indicator is zero', packetIndex, pid);
  if (section[6] !== 0 || section[7] !== 0) {
    throw issue('TS_PSI_MULTI_SECTION_UNSUPPORTED', 'PSI must be a complete single section (0/0)', packetIndex, pid);
  }
  if (mpegCrc32(section) !== 0) throw issue('TS_PSI_CRC_MISMATCH', 'PSI MPEG-2 CRC-32 does not validate', packetIndex, pid);
}

function consumePes(
  stream: StreamState,
  payload: Uint8Array,
  start: boolean,
  packetIndex: number,
  pid: number,
): void {
  if (start) {
    if (stream.remainingPesBytes !== undefined && stream.remainingPesBytes > 0) {
      throw issue('TS_PES_PACKET_INCOMPLETE', `previous PES is short by ${stream.remainingPesBytes} bytes`, packetIndex, pid);
    }
    if (!isPesPrefix(payload) || payload.byteLength < 9) {
      throw issue('TS_PES_HEADER_MALFORMED', 'payload_unit_start does not carry a complete PES header', packetIndex, pid);
    }
    const packetLength = (payload[4]! << 8) | payload[5]!;
    const ptsDtsFlags = (payload[7]! >> 6) & 0x03;
    const headerLength = payload[8]!;
    if (9 + headerLength > payload.byteLength) throw issue('TS_PES_HEADER_TRUNCATED', 'PES optional header is truncated', packetIndex, pid);
    if (ptsDtsFlags !== 0x02 && ptsDtsFlags !== 0x03) {
      throw issue('TS_PES_PTS_MISSING', 'PES start does not carry PTS', packetIndex, pid);
    }
    const pts = parseTimestamp(payload, 9, ptsDtsFlags === 0x03 ? 0x03 : 0x02, packetIndex, pid);
    const dts = ptsDtsFlags === 0x03 ? parseTimestamp(payload, 14, 0x01, packetIndex, pid) : undefined;
    stream.pesStarts++;
    stream.firstPts33 ??= pts;
    if (stream.lastRawPts !== undefined && pts < stream.lastRawPts && stream.lastRawPts - pts > PTS_HALF) {
      stream.ptsEpoch++;
      stream.ptsRolloverCount++;
    }
    stream.lastRawPts = pts;
    stream.lastPtsUnwrapped = pts + stream.ptsEpoch * PTS_MODULUS;
    if (dts !== undefined) {
      stream.firstDts33 ??= dts;
      if (stream.lastRawDts !== undefined && dts < stream.lastRawDts && stream.lastRawDts - dts > PTS_HALF) {
        stream.dtsEpoch++;
        stream.dtsRolloverCount++;
      }
      const unwrappedDts = dts + stream.dtsEpoch * PTS_MODULUS;
      if (stream.lastDtsUnwrapped !== undefined && unwrappedDts < stream.lastDtsUnwrapped) {
        throw issue(
          'TS_PES_DTS_NON_MONOTONIC',
          `DTS ${unwrappedDts} precedes prior decode timestamp ${stream.lastDtsUnwrapped}`,
          packetIndex,
          pid,
        );
      }
      stream.lastRawDts = dts;
      stream.lastDtsUnwrapped = unwrappedDts;
    }
    stream.remainingPesBytes = packetLength === 0 ? undefined : Math.max(0, packetLength - (payload.byteLength - 6));
  } else if (stream.remainingPesBytes !== undefined) {
    stream.remainingPesBytes = Math.max(0, stream.remainingPesBytes - payload.byteLength);
  }
}

function parseTimestamp(bytes: Uint8Array, offset: number, prefix: number, packetIndex: number, pid: number): number {
  if (offset + 5 > bytes.byteLength) throw issue('TS_PES_TIMESTAMP_TRUNCATED', 'PES timestamp is truncated', packetIndex, pid);
  if ((bytes[offset]! >> 4) !== prefix || (bytes[offset]! & 1) !== 1 ||
      (bytes[offset + 2]! & 1) !== 1 || (bytes[offset + 4]! & 1) !== 1) {
    throw issue('TS_PES_TIMESTAMP_MARKER_INVALID', 'PES timestamp prefix/marker bits are invalid', packetIndex, pid);
  }
  return ((bytes[offset]! >> 1) & 0x07) * 2 ** 30 +
    bytes[offset + 1]! * 2 ** 22 +
    ((bytes[offset + 2]! >> 1) & 0x7f) * 2 ** 15 +
    bytes[offset + 3]! * 2 ** 7 +
    ((bytes[offset + 4]! >> 1) & 0x7f);
}

function parsePcr(bytes: Uint8Array, offset: number, packetIndex: number, pid: number): number {
  const base = bytes[offset]! * 2 ** 25 + bytes[offset + 1]! * 2 ** 17 +
    bytes[offset + 2]! * 2 ** 9 + bytes[offset + 3]! * 2 + (bytes[offset + 4]! >> 7);
  const reserved = (bytes[offset + 4]! >> 1) & 0x3f;
  const extension = ((bytes[offset + 4]! & 1) << 8) | bytes[offset + 5]!;
  if (reserved !== 0x3f || extension >= 300) {
    throw issue('TS_PCR_ENCODING_INVALID', 'PCR reserved bits or extension are invalid', packetIndex, pid);
  }
  return base * 300 + extension;
}

function assembler(map: Map<number, PsiAssembler>, pid: number): PsiAssembler {
  let value = map.get(pid);
  if (!value) {
    value = new PsiAssembler();
    map.set(pid, value);
  }
  return value;
}

function samePmt(a: PmtState, b: PmtState): boolean {
  if (a.programNumber !== b.programNumber || a.pcrPid !== b.pcrPid || a.streams.size !== b.streams.size) return false;
  return [...a.streams].every(([pid, type]) => b.streams.get(pid) === type);
}

function isPesPrefix(payload: Uint8Array): boolean {
  return payload.byteLength >= 3 && payload[0] === 0 && payload[1] === 0 && payload[2] === 1;
}

function mpegCrc32(bytes: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte << 24;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000_0000) !== 0 ? ((crc << 1) ^ 0x04c1_1db7) >>> 0 : (crc << 1) >>> 0;
    }
  }
  return crc >>> 0;
}

function append(first: Uint8Array, second: Uint8Array): Uint8Array {
  const out = new Uint8Array(first.byteLength + second.byteLength);
  out.set(first);
  out.set(second, first.byteLength);
  return out;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.byteLength === b.byteLength && a.every((byte, index) => byte === b[index]);
}

function issue(reasonCode: string, detail: string, packetIndex?: number, pid?: number): TsMalformed {
  return new TsMalformed(reasonCode, detail, packetIndex, pid);
}

function malformed(
  reasonCode: string,
  detail: string,
  packetIndex?: number,
  pid?: number,
): Exclude<MpegTsReadResult, MpegTsEvidence> {
  return Object.freeze({
    state: 'MALFORMED' as const,
    reasonCode,
    detail,
    ...(packetIndex !== undefined ? { packetIndex } : {}),
    ...(pid !== undefined ? { pid } : {}),
  });
}
