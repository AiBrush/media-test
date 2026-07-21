import { MAX_REMUX_SAMPLES, MAX_REMUX_TRACKS, ascii } from './binary.ts';
import { readAdtsProgram } from './reader-adts.ts';
import { readMp3Program } from './reader-mp3.ts';
import type { RemuxProgramEvidence, RemuxReadResult, RemuxSampleEvidence, RemuxTrackEvidence } from './types.ts';

interface TsStream {
  pid: number;
  codec: string;
  type: 'video' | 'audio';
  program: number;
  streamType: number;
}

interface PesAssembly {
  chunks: Uint8Array[];
  length: number;
  fileOffset: number;
  ptsUs?: number;
  dtsUs?: number;
  expectedBytes?: number;
}

interface PesRecord extends PesAssembly {
  payload: Uint8Array;
}

function u16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function join(chunks: readonly Uint8Array[], length: number): Uint8Array {
  if (chunks.length === 1 && chunks[0]!.byteLength === length) return chunks[0]!;
  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    const take = Math.min(chunk.byteLength, length - at);
    out.set(chunk.subarray(0, take), at);
    at += take;
    if (at === length) break;
  }
  return out;
}

function psiCrcValid(section: Uint8Array): boolean {
  let crc = 0xffff_ffff;
  for (const byte of section) {
    crc ^= byte << 24;
    for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ ((crc & 0x8000_0000) ? 0x04c1_1db7 : 0)) >>> 0;
  }
  return crc === 0;
}

function completePsi(payload: Uint8Array, unitStart: boolean): Uint8Array | undefined {
  let offset = 0;
  if (unitStart) {
    if (payload.byteLength < 1) return undefined;
    offset = 1 + payload[0]!;
  }
  if (offset + 3 > payload.byteLength) return undefined;
  const length = ((payload[offset + 1]! & 0x0f) << 8) | payload[offset + 2]!;
  const end = offset + 3 + length;
  return end <= payload.byteLength ? payload.subarray(offset, end) : undefined;
}

function parsePts(bytes: Uint8Array, offset: number): number | undefined {
  if (offset + 5 > bytes.byteLength) return undefined;
  const value = (bytes[offset]! & 0x0e) * 2 ** 29 + bytes[offset + 1]! * 2 ** 22 +
    (bytes[offset + 2]! & 0xfe) * 2 ** 14 + bytes[offset + 3]! * 2 ** 7 + (bytes[offset + 4]! >> 1);
  return Number.isSafeInteger(value) ? Math.round((value / 90_000) * 1_000_000) : undefined;
}

function streamForType(streamType: number): Pick<TsStream, 'codec' | 'type'> | undefined {
  switch (streamType) {
    case 0x1b: return { codec: 'h264', type: 'video' };
    case 0x24: return { codec: 'hevc', type: 'video' };
    case 0x0f: return { codec: 'aac', type: 'audio' };
    case 0x03:
    case 0x04: return { codec: 'mp3', type: 'audio' };
    default: return undefined;
  }
}

function packetStride(bytes: Uint8Array): { offset: number; stride: number } | undefined {
  for (const stride of [188, 192, 204] as const) {
    for (let offset = 0; offset < Math.min(stride, bytes.byteLength); offset++) {
      if (bytes[offset] !== 0x47) continue;
      let matches = 1;
      for (let n = 1; n < 4 && offset + n * stride < bytes.byteLength; n++) {
        if (bytes[offset + n * stride] === 0x47) matches++;
      }
      if (matches >= Math.min(3, Math.floor((bytes.byteLength - offset) / stride))) return { offset, stride };
    }
  }
  return undefined;
}

function parsePat(section: Uint8Array): Map<number, number> | undefined {
  if (section[0] !== 0x00 || section.byteLength < 12 || !psiCrcValid(section)) return undefined;
  const programs = new Map<number, number>();
  for (let at = 8; at + 4 <= section.byteLength - 4; at += 4) {
    const program = u16(section, at);
    const pid = ((section[at + 2]! & 0x1f) << 8) | section[at + 3]!;
    if (program !== 0) programs.set(pid, program);
  }
  return programs;
}

function parsePmt(section: Uint8Array, program: number): TsStream[] | undefined {
  if (section[0] !== 0x02 || section.byteLength < 16 || !psiCrcValid(section)) return undefined;
  const programInfoLength = ((section[10]! & 0x0f) << 8) | section[11]!;
  let at = 12 + programInfoLength;
  const end = section.byteLength - 4;
  const streams: TsStream[] = [];
  while (at + 5 <= end) {
    const streamType = section[at]!;
    const pid = ((section[at + 1]! & 0x1f) << 8) | section[at + 2]!;
    const esInfoLength = ((section[at + 3]! & 0x0f) << 8) | section[at + 4]!;
    if (at + 5 + esInfoLength > end) return undefined;
    const mapped = streamForType(streamType);
    if (mapped) streams.push({ pid, program, streamType, ...mapped });
    at += 5 + esInfoLength;
  }
  return streams;
}

function beginPes(payload: Uint8Array, fileOffset: number): PesAssembly | undefined {
  if (payload.byteLength < 9 || payload[0] !== 0 || payload[1] !== 0 || payload[2] !== 1) return undefined;
  const pesPacketLength = u16(payload, 4);
  const flags = payload[7]!;
  const headerLength = payload[8]!;
  const dataStart = 9 + headerLength;
  if (dataStart > payload.byteLength) return undefined;
  const pts = (flags & 0x80) !== 0 ? parsePts(payload, 9) : undefined;
  const dts = (flags & 0x40) !== 0 ? parsePts(payload, 14) : pts;
  const first = payload.subarray(dataStart);
  const expectedBytes = pesPacketLength > 0 ? pesPacketLength - 3 - headerLength : undefined;
  if (expectedBytes !== undefined && expectedBytes < 0) return undefined;
  return {
    chunks: [first], length: first.byteLength, fileOffset,
    ...(pts !== undefined ? { ptsUs: pts } : {}),
    ...(dts !== undefined ? { dtsUs: dts } : {}),
    ...(expectedBytes !== undefined ? { expectedBytes } : {}),
  };
}

function finishPes(value: PesAssembly | undefined): PesRecord | undefined {
  if (!value) return undefined;
  const length = value.expectedBytes ?? value.length;
  if (value.length < length || length <= 0) return undefined;
  return { ...value, payload: join(value.chunks, length) };
}

function timestampsFromPes(records: readonly PesRecord[], framing: 'annexb' | 'raw'): RemuxSampleEvidence[] {
  return records.map((record, index) => {
    const next = records[index + 1];
    const durationUs = record.ptsUs !== undefined && next?.ptsUs !== undefined && next.ptsUs > record.ptsUs
      ? next.ptsUs - record.ptsUs
      : undefined;
    return {
      payload: record.payload,
      sourceByteLength: record.payload.byteLength,
      ...(record.ptsUs !== undefined ? { ptsUs: record.ptsUs } : {}),
      ...(record.dtsUs !== undefined ? { dtsUs: record.dtsUs } : {}),
      ...(durationUs !== undefined ? { durationUs } : {}),
      fileOffset: record.fileOffset,
      framing,
    };
  });
}

interface H264NalStart {
  offset: number;
  type: number;
}

function h264NalStarts(bytes: Uint8Array): H264NalStart[] {
  const starts: H264NalStart[] = [];
  for (let offset = 0; offset + 3 < bytes.byteLength; offset++) {
    let prefix = 0;
    if (
      bytes[offset] === 0 && bytes[offset + 1] === 0 &&
      bytes[offset + 2] === 0 && bytes[offset + 3] === 1
    ) prefix = 4;
    else if (bytes[offset] === 0 && bytes[offset + 1] === 0 && bytes[offset + 2] === 1) prefix = 3;
    if (prefix === 0) continue;
    const header = bytes[offset + prefix];
    if (header !== undefined) starts.push({ offset, type: header & 0x1f });
    offset += prefix - 1;
  }
  return starts;
}

function h264HasIdr(bytes: Uint8Array): boolean {
  return h264NalStarts(bytes).some((nal) => nal.type === 5);
}

/** Reframe H.264 PES payloads at in-band AUD boundaries; PES may split or contain access units. */
function deframeH264PesSamples(samples: readonly RemuxSampleEvidence[]): RemuxSampleEvidence[] {
  if (samples.length === 0) return [];
  const totalBytes = samples.reduce((sum, sample) => sum + sample.payload.byteLength, 0);
  const joined = new Uint8Array(totalBytes);
  const anchors: Array<{ offset: number; sample: RemuxSampleEvidence }> = [];
  let writeOffset = 0;
  for (const sample of samples) {
    anchors.push({ offset: writeOffset, sample });
    joined.set(sample.payload, writeOffset);
    writeOffset += sample.payload.byteLength;
  }
  const nals = h264NalStarts(joined);
  if (nals.length === 0 || !nals.some((nal) => nal.type === 9)) return [...samples];
  const ranges: Array<{ start: number; end: number }> = [];
  let accessUnitStart = nals[0]!.offset;
  let sawVcl = false;
  for (const nal of nals) {
    if (nal.type === 9 && sawVcl) {
      ranges.push({ start: accessUnitStart, end: nal.offset });
      accessUnitStart = nal.offset;
      sawVcl = false;
    }
    if (nal.type === 1 || nal.type === 5) sawVcl = true;
  }
  if (sawVcl) ranges.push({ start: accessUnitStart, end: joined.byteLength });
  if (ranges.length === 0) return [...samples];

  const out: RemuxSampleEvidence[] = [];
  let anchorIndex = 0;
  for (const range of ranges) {
    while (anchorIndex + 1 < anchors.length && anchors[anchorIndex + 1]!.offset <= range.start) anchorIndex++;
    const anchor = anchors[anchorIndex]!.sample;
    const payload = joined.subarray(range.start, range.end);
    out.push({
      payload,
      sourceByteLength: payload.byteLength,
      ...(anchor.ptsUs !== undefined ? { ptsUs: anchor.ptsUs } : {}),
      ...(anchor.dtsUs !== undefined ? { dtsUs: anchor.dtsUs } : {}),
      keyframe: h264HasIdr(payload),
      framing: 'annexb',
    });
  }
  return out.map((sample, index) => {
    const next = out[index + 1];
    const durationUs = sample.ptsUs !== undefined && next?.ptsUs !== undefined && next.ptsUs > sample.ptsUs
      ? next.ptsUs - sample.ptsUs
      : undefined;
    return durationUs === undefined ? sample : { ...sample, durationUs };
  });
}

function audioFromPes(stream: TsStream, records: readonly PesRecord[]): RemuxTrackEvidence | undefined {
  const length = records.reduce((sum, record) => sum + record.payload.byteLength, 0);
  if (!Number.isSafeInteger(length) || length <= 0 || length > 512 * 1024 * 1024) return undefined;
  const joined = join(records.map((record) => record.payload), length);
  const read = stream.codec === 'aac' ? readAdtsProgram(joined) : readMp3Program(joined);
  if (read.state !== 'OK' || read.value.tracks.length !== 1) return undefined;
  const track = read.value.tracks[0]!;
  const originUs = records.find((record) => record.ptsUs !== undefined)?.ptsUs ?? 0;
  const recordStarts: number[] = [];
  let joinedOffset = 0;
  for (const record of records) {
    recordStarts.push(joinedOffset);
    joinedOffset += record.payload.byteLength;
  }
  let recordIndex = 0;
  const firstRelativePtsByRecord = new Map<number, number>();
  return {
    ...track,
    id: `ts:${stream.program}:${stream.pid}`,
    samples: track.samples.map((sample) => {
      while (
        recordIndex + 1 < recordStarts.length &&
        (sample.fileOffset ?? 0) >= recordStarts[recordIndex + 1]!
      ) recordIndex++;
      const record = records[recordIndex];
      const relativePts = sample.ptsUs ?? 0;
      const firstRelativePts = firstRelativePtsByRecord.get(recordIndex) ?? relativePts;
      firstRelativePtsByRecord.set(recordIndex, firstRelativePts);
      const anchorUs = record?.ptsUs ?? originUs;
      const ptsUs = anchorUs + relativePts - firstRelativePts;
      return {
        ...sample,
        ...(sample.ptsUs !== undefined ? { ptsUs } : {}),
        ...(sample.dtsUs !== undefined ? { dtsUs: ptsUs } : {}),
        framing: sample.framing,
      };
    }),
  };
}

export function readTsProgram(bytes: Uint8Array): RemuxReadResult {
  const evidence = { reader: 'mpeg-ts', byteLength: bytes?.byteLength ?? 0, detectedContainer: 'ts' } as const;
  try {
    if (!bytes || bytes.byteLength < 188) return { state: 'INCOMPLETE', reasonCode: 'REMUX_TS_INPUT_INCOMPLETE', evidence };
    const layout = packetStride(bytes);
    if (!layout) return { state: 'MALFORMED', reasonCode: 'REMUX_TS_SYNC_INVALID', evidence };
    const pmtPids = new Map<number, number>();
    const streams = new Map<number, TsStream>();
    const pes = new Map<number, PesAssembly>();
    const records = new Map<number, PesRecord[]>();
    const continuity = new Map<number, number>();
    let packetCount = 0;
    for (let packetStart = layout.offset; packetStart + 188 <= bytes.byteLength; packetStart += layout.stride) {
      if (bytes[packetStart] !== 0x47) return { state: 'MALFORMED', reasonCode: 'REMUX_TS_SYNC_LOST', evidence };
      const b1 = bytes[packetStart + 1]!;
      if ((b1 & 0x80) !== 0) return { state: 'MALFORMED', reasonCode: 'REMUX_TS_TRANSPORT_ERROR', evidence };
      const unitStart = (b1 & 0x40) !== 0;
      const pid = ((b1 & 0x1f) << 8) | bytes[packetStart + 2]!;
      const control = (bytes[packetStart + 3]! >> 4) & 3;
      const cc = bytes[packetStart + 3]! & 0x0f;
      if (control === 0) return { state: 'MALFORMED', reasonCode: 'REMUX_TS_ADAPTATION_CONTROL_INVALID', evidence };
      let payloadStart = packetStart + 4;
      if (control === 2 || control === 3) {
        if (payloadStart >= packetStart + 188) return { state: 'MALFORMED', reasonCode: 'REMUX_TS_ADAPTATION_INCOMPLETE', evidence };
        payloadStart += 1 + bytes[payloadStart]!;
        if (payloadStart > packetStart + 188) return { state: 'MALFORMED', reasonCode: 'REMUX_TS_ADAPTATION_INVALID', evidence };
      }
      if (control === 2 || payloadStart === packetStart + 188) continue;
      const payload = bytes.subarray(payloadStart, packetStart + 188);
      const continuityRelevant = pid === 0 || pmtPids.has(pid) || streams.has(pid);
      const priorCc = continuityRelevant ? continuity.get(pid) : undefined;
      if (priorCc !== undefined && cc !== ((priorCc + 1) & 0x0f)) {
        // Concatenated TS segments restart every PID's continuity counter after a fresh PAT. Accept
        // that boundary only when the discontinuous packet is itself a complete, valid PAT; an
        // arbitrary media-PID gap remains incomplete/corrupt input.
        const restartedPat = pid === 0 && unitStart
          ? completePsi(payload, true)
          : undefined;
        if (!restartedPat || !parsePat(restartedPat)) {
          return { state: 'INCOMPLETE', reasonCode: 'REMUX_TS_CONTINUITY_GAP', evidence };
        }
        continuity.clear();
      }
      if (continuityRelevant) continuity.set(pid, cc);
      if (pid === 0) {
        const section = completePsi(payload, unitStart);
        if (section) {
          const parsed = parsePat(section);
          if (!parsed) return { state: 'MALFORMED', reasonCode: 'REMUX_TS_PAT_INVALID', evidence };
          for (const entry of parsed) pmtPids.set(...entry);
        }
      } else if (pmtPids.has(pid)) {
        const section = completePsi(payload, unitStart);
        if (section) {
          const parsed = parsePmt(section, pmtPids.get(pid)!);
          if (!parsed) return { state: 'MALFORMED', reasonCode: 'REMUX_TS_PMT_INVALID', evidence };
          for (const stream of parsed) {
            if (streams.size >= MAX_REMUX_TRACKS && !streams.has(stream.pid)) return { state: 'MALFORMED', reasonCode: 'REMUX_TS_STREAM_COUNT_EXCESSIVE', evidence };
            streams.set(stream.pid, stream);
          }
        }
      } else if (streams.has(pid)) {
        if (unitStart) {
          const done = finishPes(pes.get(pid));
          if (done) {
            const list = records.get(pid) ?? [];
            if (list.length >= MAX_REMUX_SAMPLES) return { state: 'MALFORMED', reasonCode: 'REMUX_TS_PES_COUNT_EXCESSIVE', evidence };
            list.push(done);
            records.set(pid, list);
          } else if (pes.has(pid)) {
            return { state: 'INCOMPLETE', reasonCode: 'REMUX_TS_PES_INCOMPLETE', evidence };
          }
          const started = beginPes(payload, payloadStart);
          if (!started) return { state: 'MALFORMED', reasonCode: 'REMUX_TS_PES_HEADER_INVALID', evidence };
          pes.set(pid, started);
        } else {
          const current = pes.get(pid);
          if (!current) continue;
          current.chunks.push(payload);
          current.length += payload.byteLength;
        }
      }
      packetCount++;
    }
    for (const [pid, pending] of pes) {
      const done = finishPes(pending);
      if (!done) return { state: 'INCOMPLETE', reasonCode: 'REMUX_TS_PES_INCOMPLETE', evidence };
      const list = records.get(pid) ?? [];
      list.push(done);
      records.set(pid, list);
    }
    if (streams.size === 0) return { state: 'MALFORMED', reasonCode: 'REMUX_TS_PROGRAM_MAP_MISSING', evidence };
    const tracks: RemuxTrackEvidence[] = [];
    for (const stream of streams.values()) {
      const streamRecords = records.get(stream.pid) ?? [];
      if (streamRecords.length === 0) continue;
      if (stream.type === 'audio') {
        const track = audioFromPes(stream, streamRecords);
        if (!track) return { state: 'UNSUPPORTED_STRUCTURE', reasonCode: 'REMUX_TS_AUDIO_FRAMING_UNSUPPORTED', evidence };
        tracks.push(track);
      } else {
        const samples = timestampsFromPes(streamRecords, 'annexb');
        tracks.push({
          id: `ts:${stream.program}:${stream.pid}`, type: 'video', codec: stream.codec,
          timescale: 90_000,
          samples: stream.codec === 'h264' ? deframeH264PesSamples(samples) : samples,
        });
      }
    }
    if (tracks.length === 0) return { state: 'MALFORMED', reasonCode: 'REMUX_TS_MEDIA_SAMPLES_MISSING', evidence };
    const parsedSamples = tracks.reduce((sum, track) => sum + track.samples.length, 0);
    let origin = Number.POSITIVE_INFINITY;
    let end = Number.NEGATIVE_INFINITY;
    for (const track of tracks) {
      for (const sample of track.samples) {
        if (sample.ptsUs === undefined) continue;
        origin = Math.min(origin, sample.ptsUs);
        end = Math.max(end, sample.ptsUs + (sample.durationUs ?? 0));
      }
    }
    const value: RemuxProgramEvidence = {
      schema: 'media-test/remux-program@1', container: 'ts', byteLength: bytes.byteLength,
      ...(Number.isFinite(origin) && Number.isFinite(end) && end > origin ? { durationUs: end - origin } : {}),
      tracks, representation: { programCount: new Set([...streams.values()].map((stream) => stream.program)).size },
    };
    return {
      state: 'OK', value,
      evidence: { ...evidence, parsedTracks: tracks.length, parsedSamples, markers: [`packets:${packetCount}`, `stride:${layout.stride}`] },
    };
  } catch {
    return { state: 'MALFORMED', reasonCode: 'REMUX_TS_PARSE_GUARD', evidence };
  }
}
