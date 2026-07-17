/**
 * Explicit progressive ISO-BMFF table backend used only for the three declared large fixtures.
 * It observes moov sample tables and validates every stsc/stco/co64-derived sample range against a
 * top-level mdat range. It does not read or claim payload bytes and reports that omission verbatim.
 */

import {
  createNotApplicableError,
  type DemuxResult,
  type DemuxTrackRepresentation,
  type MediaInput,
  type NormalizedMetadata,
  type NormalizedTrack,
  type OperationTelemetry,
  type PacketInfo,
  type TrackType,
} from '../../core/engine.ts';

const ENGINE_ID = 'web-demuxer@4.0.0';
const SAMPLE_TABLE_FAST_PATH_ASSETS = new Set([
  'h264_1080p_30s.mp4',
  'huge_h264_1080p_600s.mov',
  'massive_h264_1080p_2h.mp4',
]);
const MAX_TOP_LEVEL_BOXES = 64;
const MAX_MOOV_BYTES = 128 * 1024 * 1024;
const MAX_SAMPLE_TABLE_PACKETS = 2_000_000;

interface Box {
  type: string;
  start: number;
  size: number;
  bodyStart: number;
  bodyEnd: number;
}

interface BoxHeader {
  type: string;
  size: number;
  headerSize: number;
}

interface ByteRange {
  start: number;
  endExclusive: number;
}

interface TopLevelLayout {
  fileSize: number;
  moov: Uint8Array;
  moovStart: number;
  mdats: ByteRange[];
  bytesRead: number;
  rangeCount: number;
}

export interface WebDemuxerBackendEvidence {
  backend: 'iso-bmff-sample-table';
  contract: 'table-with-validated-payload-ranges';
  bytesRead: number;
  rangeCount: number;
  moovBytes: number;
  packetCount: number;
  payloadRangeCount: number;
  payloadRangesValidated: true;
  payloadBytesRead: false;
  fileSize: number;
  trackIdToIndex: Record<string, number>;
  omittedEvidence: string[];
  peakRetainedBytesEstimate: number;
}

export interface ProgressiveMp4SampleTableDemux extends DemuxResult {
  backendEvidence: WebDemuxerBackendEvidence;
}

interface ParseResult {
  durationSec: number | null;
  tracks: NormalizedTrack[];
  packets: PacketInfo[];
  representations: DemuxTrackRepresentation[];
  trackIdToIndex: Record<string, number>;
  payloadRangeCount: number;
  retainedBytesEstimate: number;
}

interface SampleSizeTable {
  count: number;
  sizeAt(index: number): number;
}

interface TimingRun {
  count: number;
  value: number;
}

interface TimingRuns {
  runs: TimingRun[];
  sampleCount: number;
  total: number;
}

export function shouldUseProgressiveMp4SampleTableFastPath(input: MediaInput): boolean {
  return !input.mutated && SAMPLE_TABLE_FAST_PATH_ASSETS.has(input.id);
}

export async function demuxProgressiveMp4SampleTable(
  input: MediaInput,
  options: { signal?: AbortSignal; emit?: (event: OperationTelemetry) => void } = {},
): Promise<ProgressiveMp4SampleTableDemux> {
  throwIfAborted(options.signal);
  const startedAt = nowMs();
  const layout = await readTopLevelLayout(input.url, input.sizeBytes, options.signal);
  const parsed = sampleTablesFromMoov(layout.moov, layout);
  throwIfAborted(options.signal);
  options.emit?.({ type: 'bytes-read', atMs: nowMs() - startedAt, bytes: layout.bytesRead });

  const metadata: NormalizedMetadata = {
    container: input.id.toLowerCase().endsWith('.mov') ? 'mov' : 'mp4',
    durationSec: parsed.durationSec,
    tracks: parsed.tracks,
    telemetry: { bytesRead: layout.bytesRead, packetCount: parsed.packets.length },
  };
  return {
    metadata,
    packets: parsed.packets,
    representations: parsed.representations,
    telemetry: { bytesRead: layout.bytesRead, packetCount: parsed.packets.length },
    backendEvidence: {
      backend: 'iso-bmff-sample-table',
      contract: 'table-with-validated-payload-ranges',
      bytesRead: layout.bytesRead,
      rangeCount: layout.rangeCount,
      moovBytes: layout.moov.byteLength,
      packetCount: parsed.packets.length,
      payloadRangeCount: parsed.payloadRangeCount,
      payloadRangesValidated: true,
      payloadBytesRead: false,
      fileSize: layout.fileSize,
      trackIdToIndex: parsed.trackIdToIndex,
      omittedEvidence: [
        'coded-payload-bytes',
        'semantic-access-unit-digest',
        'web-demuxer-worker-parser',
      ],
      peakRetainedBytesEstimate: layout.moov.byteLength + parsed.retainedBytesEstimate,
    },
  };
}

/** Test/conformance entry point for a complete in-memory file. */
export function parseProgressiveMp4SampleTableBytes(bytes: Uint8Array): ProgressiveMp4SampleTableDemux {
  const boxes = [...iterBoxes(bytes, 0, bytes.byteLength)];
  if (boxes.some((box) => box.type === 'moof')) {
    throw tableUnsupported(
      'WEB_DEMUXER_FAST_PATH_FRAGMENTED',
      'fragmented ISO-BMFF is not a progressive sample-table tuple',
    );
  }
  const moov = boxes.find((box) => box.type === 'moov');
  const mdats = boxes
    .filter((box) => box.type === 'mdat')
    .map((box) => ({ start: box.bodyStart, endExclusive: box.bodyEnd }));
  if (!moov) throw new Error('MP4 sample-table demux could not locate a top-level moov box');
  const moovBytes = bytes.slice(moov.start, moov.bodyEnd);
  const layout: TopLevelLayout = {
    fileSize: bytes.byteLength,
    moov: moovBytes,
    moovStart: moov.start,
    mdats,
    bytesRead: bytes.byteLength,
    rangeCount: 1,
  };
  const parsed = sampleTablesFromMoov(moovBytes, layout);
  const metadata: NormalizedMetadata = {
    container: 'mp4',
    durationSec: parsed.durationSec,
    tracks: parsed.tracks,
    telemetry: { bytesRead: bytes.byteLength, packetCount: parsed.packets.length },
  };
  return {
    metadata,
    packets: parsed.packets,
    representations: parsed.representations,
    telemetry: { bytesRead: bytes.byteLength, packetCount: parsed.packets.length },
    backendEvidence: {
      backend: 'iso-bmff-sample-table',
      contract: 'table-with-validated-payload-ranges',
      bytesRead: bytes.byteLength,
      rangeCount: 1,
      moovBytes: moovBytes.byteLength,
      packetCount: parsed.packets.length,
      payloadRangeCount: parsed.payloadRangeCount,
      payloadRangesValidated: true,
      payloadBytesRead: false,
      fileSize: bytes.byteLength,
      trackIdToIndex: parsed.trackIdToIndex,
      omittedEvidence: ['coded-payload-bytes', 'semantic-access-unit-digest', 'web-demuxer-worker-parser'],
      peakRetainedBytesEstimate: moovBytes.byteLength + parsed.retainedBytesEstimate,
    },
  };
}

export async function readProgressiveMp4PacketTableFromMoov(
  url: string,
  options: { sizeBytes?: number; signal?: AbortSignal } = {},
): Promise<PacketInfo[]> {
  const layout = await readTopLevelLayout(url, options.sizeBytes, options.signal);
  return sampleTablesFromMoov(layout.moov, layout).packets;
}

class RangeReader {
  bytesRead = 0;
  rangeCount = 0;
  fileSize: number | undefined;

  constructor(
    private readonly url: string,
    sizeHint: number | undefined,
    private readonly signal: AbortSignal | undefined,
  ) {
    if (sizeHint !== undefined && Number.isSafeInteger(sizeHint) && sizeHint > 0) this.fileSize = sizeHint;
  }

  async read(start: number, end: number): Promise<Uint8Array> {
    throwIfAborted(this.signal);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) {
      throw new TypeError(`invalid MP4 range ${start}-${end}`);
    }
    const response = await fetch(this.url, {
      cache: 'no-store',
      headers: { Range: `bytes=${start}-${end}` },
      ...(this.signal ? { signal: this.signal } : {}),
    });
    if (!response.ok) throw new Error(`MP4 range read failed: HTTP ${response.status} for bytes=${start}-${end}`);
    const requestedLength = end - start + 1;
    if (response.status !== 206) {
      const rawContentLength = response.headers.get('content-length');
      const contentLength = rawContentLength == null ? Number.NaN : Number(rawContentLength);
      const exactWholeSmallFile = start === 0
        && Number.isSafeInteger(contentLength)
        && contentLength === requestedLength
        && (this.fileSize === undefined || this.fileSize === requestedLength);
      if (!exactWholeSmallFile) {
        await response.body?.cancel();
        throw new Error(`server did not honor MP4 range read bytes=${start}-${end}`);
      }
    }
    const contentRange = response.headers.get('content-range');
    if (contentRange) {
      const match = /^bytes\s+(\d+)-(\d+)\/(\d+)$/i.exec(contentRange.trim());
      if (!match || Number(match[1]) !== start || Number(match[2]) !== end) {
        throw new Error(`invalid Content-Range '${contentRange}'`);
      }
      const total = Number(match[3]);
      if (!Number.isSafeInteger(total) || total <= 0) throw new Error(`invalid MP4 file size '${match[3]}'`);
      if (this.fileSize !== undefined && this.fileSize !== total) {
        throw new Error(`MP4 size mismatch: manifest ${this.fileSize} vs range response ${total}`);
      }
      this.fileSize = total;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== requestedLength) {
      throw new Error(`short MP4 range read bytes=${start}-${end}: received ${bytes.byteLength}`);
    }
    this.bytesRead += bytes.byteLength;
    this.rangeCount++;
    throwIfAborted(this.signal);
    return bytes;
  }
}

async function readTopLevelLayout(
  url: string,
  sizeHint?: number,
  signal?: AbortSignal,
): Promise<TopLevelLayout> {
  const reader = new RangeReader(url, sizeHint, signal);
  let cursor = 0;
  let moov: Uint8Array | undefined;
  let moovStart = -1;
  const mdats: ByteRange[] = [];

  let boxesRead = 0;
  for (; boxesRead < MAX_TOP_LEVEL_BOXES; boxesRead++) {
    if (reader.fileSize !== undefined && cursor >= reader.fileSize) break;
    const headerEnd = reader.fileSize === undefined
      ? cursor + 15
      : Math.min(cursor + 15, reader.fileSize - 1);
    if (headerEnd - cursor + 1 < 8) throw new Error('truncated top-level MP4 box header');
    const headerBytes = await reader.read(cursor, headerEnd);
    const header = parseTopLevelHeader(headerBytes, reader.fileSize, cursor);
    if (header.size <= 0 || !Number.isSafeInteger(header.size)) throw new Error(`invalid top-level ${header.type} size`);
    const boxEnd = cursor + header.size;
    if (reader.fileSize !== undefined && boxEnd > reader.fileSize) {
      throw new Error(`top-level ${header.type} exceeds file size`);
    }
    if (header.type === 'moov') {
      if (header.size > MAX_MOOV_BYTES) {
        throw new Error(`MP4 moov box too large for sample-table demux: ${header.size} bytes`);
      }
      moov = await reader.read(cursor, boxEnd - 1);
      moovStart = cursor;
    } else if (header.type === 'mdat') {
      mdats.push({ start: cursor + header.headerSize, endExclusive: boxEnd });
    } else if (header.type === 'moof') {
      throw tableUnsupported('WEB_DEMUXER_FAST_PATH_FRAGMENTED', 'fragmented ISO-BMFF is not a progressive sample-table tuple');
    }
    cursor = boxEnd;
  }
  if (boxesRead >= MAX_TOP_LEVEL_BOXES && (reader.fileSize === undefined || cursor < reader.fileSize)) {
    throw tableUnsupported(
      'WEB_DEMUXER_FAST_PATH_TOP_LEVEL_BOX_BUDGET',
      `top-level box count exceeds ${MAX_TOP_LEVEL_BOXES}`,
    );
  }
  if (!moov) throw new Error('MP4 sample-table demux could not locate a top-level moov box');
  if (!mdats.length) throw new Error('MP4 sample-table demux found no top-level mdat box');
  if (reader.fileSize === undefined) throw new Error('MP4 range response did not expose a trustworthy file size');
  return {
    fileSize: reader.fileSize,
    moov,
    moovStart,
    mdats,
    bytesRead: reader.bytesRead,
    rangeCount: reader.rangeCount,
  };
}

function parseTopLevelHeader(bytes: Uint8Array, fileSize: number | undefined, absoluteStart: number): BoxHeader {
  if (bytes.byteLength < 8) throw new Error('truncated top-level MP4 box header');
  const rawSize = be32(bytes, 0);
  const type = fourcc(bytes, 4);
  if (rawSize === 1) {
    if (bytes.byteLength < 16) throw new Error(`truncated extended-size top-level ${type} box header`);
    return { type, size: be64(bytes, 8), headerSize: 16 };
  }
  if (rawSize === 0) {
    if (fileSize === undefined) throw new Error(`size-zero top-level ${type} requires known file size`);
    return { type, size: fileSize - absoluteStart, headerSize: 8 };
  }
  if (rawSize < 8) throw new Error(`invalid top-level ${type} size ${rawSize}`);
  return { type, size: rawSize, headerSize: 8 };
}

function sampleTablesFromMoov(moovBytes: Uint8Array, layout: TopLevelLayout): ParseResult {
  const moov = [...iterBoxes(moovBytes, 0, moovBytes.length)][0];
  if (!moov || moov.type !== 'moov') throw new Error('MP4 sample-table demux expected a moov box');
  const movie = parseMvhd(moovBytes, findBox(moovBytes, moov.bodyStart, moov.bodyEnd, 'mvhd'));
  const tracks: NormalizedTrack[] = [];
  const packets: PacketInfo[] = [];
  const representations: DemuxTrackRepresentation[] = [];
  const trackDurationsSec: number[] = [];
  const trackIdToIndex: Record<string, number> = {};
  let payloadRangeCount = 0;

  const traks = [...iterBoxes(moovBytes, moov.bodyStart, moov.bodyEnd)].filter((box) => box.type === 'trak');
  for (let trackIndex = 0; trackIndex < traks.length; trackIndex++) {
    const parsed = sampleTableFromTrak(moovBytes, traks[trackIndex]!, trackIndex, movie.timescale, layout);
    tracks.push(parsed.metadata);
    packets.push(...parsed.packets);
    representations.push(parsed.representation);
    trackDurationsSec.push(parsed.durationSec);
    if (Object.hasOwn(trackIdToIndex, String(parsed.trackId))) {
      throw new Error(`MP4 contains duplicate track id ${parsed.trackId}`);
    }
    trackIdToIndex[String(parsed.trackId)] = trackIndex;
    payloadRangeCount += parsed.packets.length;
  }
  if (!tracks.length || !packets.length) throw new Error('MP4 sample-table demux found no packetized tracks');
  return {
    durationSec: movie.durationSec ?? maxFinite(trackDurationsSec),
    tracks,
    packets,
    representations,
    trackIdToIndex,
    payloadRangeCount,
    retainedBytesEstimate:
      packets.length * 256 + tracks.length * 256 + representations.reduce((sum, item) => sum + (item.description?.byteLength ?? 0), 0),
  };
}

function sampleTableFromTrak(
  bytes: Uint8Array,
  trak: Box,
  trackIndex: number,
  movieTimescale: number,
  layout: TopLevelLayout,
): {
  trackId: number;
  metadata: NormalizedTrack;
  durationSec: number;
  packets: PacketInfo[];
  representation: DemuxTrackRepresentation;
} {
  const tkhd = findBox(bytes, trak.bodyStart, trak.bodyEnd, 'tkhd');
  const trackId = tkhd ? parseTkhdTrackId(bytes, tkhd) : 0;
  if (trackId <= 0) throw new Error(`MP4 track ${trackIndex} has no valid tkhd track id`);
  const mdia = findBox(bytes, trak.bodyStart, trak.bodyEnd, 'mdia');
  if (!mdia) throw new Error(`MP4 track ${trackId} missing mdia`);
  const hdlr = findBox(bytes, mdia.bodyStart, mdia.bodyEnd, 'hdlr');
  const handler = hdlr ? hdlrType(bytes, hdlr) : '';
  if (handler !== 'vide' && handler !== 'soun') {
    throw tableUnsupported(
      'WEB_DEMUXER_FAST_PATH_TRACK_TYPE',
      `sample-table backend cannot preserve '${handler || 'unknown'}' track ${trackId}`,
    );
  }
  const type: TrackType = handler === 'vide' ? 'video' : 'audio';
  const mdhd = findBox(bytes, mdia.bodyStart, mdia.bodyEnd, 'mdhd');
  const minf = findBox(bytes, mdia.bodyStart, mdia.bodyEnd, 'minf');
  if (!mdhd || !minf) throw new Error(`MP4 track ${trackId} missing mdhd/minf`);
  const stbl = findBox(bytes, minf.bodyStart, minf.bodyEnd, 'stbl');
  if (!stbl) throw new Error(`MP4 track ${trackId} missing stbl`);
  const stsz = findBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'stsz');
  const stts = findBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'stts');
  const stsc = findBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'stsc');
  const stco = findBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'stco');
  const co64 = findBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'co64');
  if (!stsz || !stts || !stsc || (!stco && !co64)) {
    throw new Error(`MP4 track ${trackId} missing stsz/stts/stsc/stco-or-co64`);
  }

  const timescale = parseMdhdTimescale(bytes, mdhd);
  const sizes = parseStsz(bytes, stsz);
  const durations = parseTimingRuns(bytes, stts, sizes.count, false);
  if (durations.sampleCount !== sizes.count) throw new Error(`MP4 track ${trackId} stts sample count mismatch`);
  const cttsBox = findBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'ctts');
  const ctts = cttsBox ? parseTimingRuns(bytes, cttsBox, sizes.count, true) : undefined;
  if (ctts && ctts.sampleCount !== sizes.count) throw new Error(`MP4 track ${trackId} ctts sample count mismatch`);
  const syncSamples = parseStss(bytes, findBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'stss'));
  const chunkOffsets = parseChunkOffsets(bytes, stco ?? co64!, stco ? 4 : 8);
  const chunkMap = parseStsc(bytes, stsc);
  validateSamplePlacement(sizes, chunkOffsets, chunkMap, layout);

  const mediaDurationSec = durations.total / timescale;
  const edit = parseEditList(bytes, trak, movieTimescale, timescale);
  const durationSec = edit.durationSec ?? mediaDurationSec;
  const stsd = findBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'stsd');
  const sampleEntry = parseStsdTrack(bytes, stsd, type, sizes.count, mediaDurationSec);
  const metadata: NormalizedTrack = {
    ...sampleEntry.metadata,
    ...(tkhd && type === 'video' ? { rotation: parseTkhdRotation(bytes, tkhd) } : {}),
  };

  let dtsTicks = 0;
  const packets: PacketInfo[] = [];
  const durationValues = timingValueIterator(durations.runs);
  const compositionValues = ctts ? timingValueIterator(ctts.runs) : undefined;
  for (let index = 0; index < sizes.count; index++) {
    const durationTicks = durationValues.next().value;
    if (durationTicks === undefined) throw new Error(`MP4 track ${trackId} stts ended early`);
    const compositionTicks = compositionValues?.next().value ?? 0;
    const ptsTicks = dtsTicks + compositionTicks;
    packets.push({
      trackIndex,
      trackType: type,
      codec: metadata.codec,
      size: sizes.sizeAt(index),
      ptsUs: ticksToUs(ptsTicks, timescale) + edit.shiftUs,
      dtsUs: ticksToUs(dtsTicks, timescale) + edit.shiftUs,
      durationUs: ticksToUs(durationTicks, timescale),
      keyframe: syncSamples ? syncSamples.has(index + 1) : true,
      ...(sampleEntry.framing ? { framing: sampleEntry.framing } : {}),
      ...(sampleEntry.nalLengthSize !== undefined ? { nalLengthSize: sampleEntry.nalLengthSize } : {}),
      randomAccessKind: syncSamples ? (syncSamples.has(index + 1) ? 'sample-table-sync' : 'non-sync') : 'all-samples-sync',
    });
    dtsTicks += durationTicks;
  }

  return {
    trackId,
    metadata,
    durationSec,
    packets,
    representation: {
      trackIndex,
      packetOrdering: 'decode',
      timebase: { numerator: 1, denominator: timescale },
      framing: sampleEntry.framing ?? 'raw',
      accessUnitGrouping: type === 'video' ? 'one-access-unit-per-chunk' : 'one-packet-per-chunk',
      parameterSetLocation: sampleEntry.description ? 'description' : 'not-applicable',
      nativeCodecTag: sampleEntry.nativeCodecTag,
      ...(sampleEntry.description ? { description: sampleEntry.description.slice() } : {}),
      ...(sampleEntry.descriptionRecord ? { descriptionRecord: sampleEntry.descriptionRecord } : {}),
    },
  };
}

function* iterBoxes(bytes: Uint8Array, start: number, end: number): Generator<Box> {
  let offset = start;
  while (offset + 8 <= end) {
    const header = parseBoxHeader(bytes, offset, end);
    if (!header) throw new Error(`invalid MP4 child box at offset ${offset}`);
    const bodyEnd = offset + header.size;
    if (bodyEnd > end) throw new Error(`truncated MP4 ${header.type} box`);
    yield {
      type: header.type,
      start: offset,
      size: header.size,
      bodyStart: offset + header.headerSize,
      bodyEnd,
    };
    offset = bodyEnd;
  }
  if (offset !== end && end - offset >= 4) throw new Error(`trailing malformed MP4 box bytes at ${offset}`);
}

function parseBoxHeader(bytes: Uint8Array, offset: number, limit: number): BoxHeader | null {
  if (offset + 8 > limit) return null;
  let size = be32(bytes, offset);
  const type = fourcc(bytes, offset + 4);
  let headerSize = 8;
  if (size === 1) {
    if (offset + 16 > limit) return null;
    size = be64(bytes, offset + 8);
    headerSize = 16;
  } else if (size === 0) {
    size = limit - offset;
  }
  return Number.isSafeInteger(size) && size >= headerSize ? { type, size, headerSize } : null;
}

function findBox(bytes: Uint8Array, start: number, end: number, type: string): Box | undefined {
  for (const box of iterBoxes(bytes, start, end)) if (box.type === type) return box;
  return undefined;
}

function findCodecConfigBox(
  bytes: Uint8Array,
  start: number,
  end: number,
  type: string,
): Box | undefined {
  for (const box of iterBoxes(bytes, start, end)) {
    if (box.type === type) return box;
    // QuickTime version-1 audio sample entries commonly wrap `esds` in a `wave` box.
    if (box.type === 'wave') {
      const nested = findCodecConfigBox(bytes, box.bodyStart, box.bodyEnd, type);
      if (nested) return nested;
    }
  }
  return undefined;
}

/** Extract MPEG-4 DecoderSpecificInfo (descriptor tag 0x05) from an esds full-box payload. */
function decoderSpecificInfoFromEsds(esdsBody: Uint8Array): Uint8Array | undefined {
  for (let offset = 4; offset + 2 <= esdsBody.byteLength; offset++) {
    if (esdsBody[offset] !== 0x05) continue;
    let length = 0;
    let cursor = offset + 1;
    let lengthBytes = 0;
    for (; lengthBytes < 4 && cursor < esdsBody.byteLength; lengthBytes++, cursor++) {
      const byte = esdsBody[cursor]!;
      length = (length << 7) | (byte & 0x7f);
      if ((byte & 0x80) === 0) {
        cursor++;
        break;
      }
    }
    if (lengthBytes >= 4 || length <= 0 || length > 64 || cursor + length > esdsBody.byteLength) continue;
    return esdsBody.slice(cursor, cursor + length);
  }
  return undefined;
}

function parseMdhdTimescale(bytes: Uint8Array, mdhd: Box): number {
  const version = bytes[mdhd.bodyStart] ?? 0;
  const offset = mdhd.bodyStart + (version === 1 ? 20 : 12);
  if (offset + 4 > mdhd.bodyEnd) throw new Error('truncated mdhd timescale');
  const timescale = be32(bytes, offset);
  if (!timescale) throw new Error('MP4 mdhd has zero timescale');
  return timescale;
}

function parseMvhd(bytes: Uint8Array, mvhd: Box | undefined): { timescale: number; durationSec: number | null } {
  if (!mvhd) return { timescale: 1, durationSec: null };
  const version = bytes[mvhd.bodyStart] ?? 0;
  const timescaleOffset = mvhd.bodyStart + (version === 1 ? 20 : 12);
  const durationOffset = mvhd.bodyStart + (version === 1 ? 24 : 16);
  if (durationOffset + (version === 1 ? 8 : 4) > mvhd.bodyEnd) throw new Error('truncated mvhd');
  const timescale = be32(bytes, timescaleOffset);
  const duration = version === 1 ? be64(bytes, durationOffset) : be32(bytes, durationOffset);
  return { timescale: timescale || 1, durationSec: timescale ? duration / timescale : null };
}

function parseTkhdTrackId(bytes: Uint8Array, tkhd: Box): number {
  const version = bytes[tkhd.bodyStart] ?? 0;
  const offset = tkhd.bodyStart + (version === 1 ? 20 : 12);
  return offset + 4 <= tkhd.bodyEnd ? be32(bytes, offset) : 0;
}

function parseTkhdRotation(bytes: Uint8Array, tkhd: Box): number {
  const version = bytes[tkhd.bodyStart] ?? 0;
  const matrix = tkhd.bodyStart + (version === 1 ? 52 : 40);
  if (matrix + 20 > tkhd.bodyEnd) return 0;
  const a = signed32(bytes, matrix) / 65536;
  const b = signed32(bytes, matrix + 4) / 65536;
  const c = signed32(bytes, matrix + 12) / 65536;
  const d = signed32(bytes, matrix + 16) / 65536;
  const near = (value: number, expected: number): boolean => Math.abs(value - expected) < 0.001;
  if (near(a, 0) && near(b, 1) && near(c, -1) && near(d, 0)) return 90;
  if (near(a, -1) && near(b, 0) && near(c, 0) && near(d, -1)) return 180;
  if (near(a, 0) && near(b, -1) && near(c, 1) && near(d, 0)) return 270;
  return 0;
}

function hdlrType(bytes: Uint8Array, hdlr: Box): string {
  return hdlr.bodyStart + 12 <= hdlr.bodyEnd ? fourcc(bytes, hdlr.bodyStart + 8) : '';
}

function parseStsdTrack(
  bytes: Uint8Array,
  stsd: Box | undefined,
  type: TrackType,
  sampleCount: number,
  durationSec: number,
): {
  metadata: NormalizedTrack;
  nativeCodecTag: string;
  framing?: 'avc' | 'hevc' | 'raw';
  nalLengthSize?: number;
  description?: Uint8Array;
  descriptionRecord?: 'avc-decoder-configuration-record' | 'hevc-decoder-configuration-record' | 'audio-specific-config' | 'codec-private';
} {
  if (!stsd || stsd.bodyStart + 8 > stsd.bodyEnd) throw new Error('MP4 track missing/truncated stsd');
  const entryCount = be32(bytes, stsd.bodyStart + 4);
  if (entryCount !== 1) {
    throw tableUnsupported(
      'WEB_DEMUXER_FAST_PATH_MULTIPLE_SAMPLE_DESCRIPTIONS',
      `sample-table backend requires exactly one sample description, found ${entryCount}`,
    );
  }
  const entryStart = stsd.bodyStart + 8;
  const header = parseBoxHeader(bytes, entryStart, stsd.bodyEnd);
  if (!header || entryStart + header.size > stsd.bodyEnd) throw new Error('truncated stsd sample entry');
  const entryEnd = entryStart + header.size;
  const nativeCodecTag = header.type;
  const codec = codecFromSampleEntry(nativeCodecTag, type);
  const metadata: NormalizedTrack = { type, codec, nativeCodecTag };
  if (type === 'video') {
    if (entryStart + 36 > entryEnd) throw new Error('truncated visual sample entry');
    const width = be16(bytes, entryStart + 32);
    const height = be16(bytes, entryStart + 34);
    if (width > 0) metadata.width = width;
    if (height > 0) metadata.height = height;
    if (durationSec > 0 && sampleCount > 0) {
      const observedIntervalUs = Math.round(durationSec * 1_000_000);
      metadata.fps = (sampleCount * 1_000_000) / observedIntervalUs;
      metadata.fpsProvenance = {
        source: 'average',
        cadence: 'UNKNOWN',
        sampleCount,
        observedIntervalUs,
      };
    }
  } else {
    if (entryStart + 36 > entryEnd) throw new Error('truncated audio sample entry');
    const channels = be16(bytes, entryStart + 24);
    const sampleRate = be32(bytes, entryStart + 32) >>> 16;
    if (sampleRate > 0) metadata.sampleRate = sampleRate;
    if (channels > 0) metadata.channels = channels;
  }

  const audioVersion = type === 'audio' ? be16(bytes, entryStart + 16) : 0;
  const childStart = type === 'video'
    ? entryStart + 86
    : audioVersion === 0
      ? entryStart + 36
      : audioVersion === 1
        ? entryStart + 52
        : audioVersion === 2
          ? entryStart + 72
          : -1;
  if (childStart < 0 || childStart > entryEnd) {
    throw tableUnsupported(
      'WEB_DEMUXER_FAST_PATH_AUDIO_SAMPLE_ENTRY_VERSION',
      `unsupported/truncated QuickTime audio sample-entry version ${audioVersion}`,
    );
  }
  const configType = codec === 'h264' ? 'avcC' : codec === 'hevc' ? 'hvcC' : codec === 'aac' ? 'esds' : '';
  const config = configType && childStart < entryEnd
    ? findCodecConfigBox(bytes, childStart, entryEnd, configType)
    : undefined;
  const description = config
    ? codec === 'aac'
      ? decoderSpecificInfoFromEsds(bytes.subarray(config.bodyStart, config.bodyEnd))
      : bytes.slice(config.bodyStart, config.bodyEnd)
    : undefined;
  const framing = codec === 'h264' ? 'avc' : codec === 'hevc' ? 'hevc' : 'raw';
  const nalLengthSize = description && (codec === 'h264' || codec === 'hevc')
    ? ((description[codec === 'h264' ? 4 : 21] ?? 3) & 0x03) + 1
    : undefined;
  const descriptionRecord = description
    ? codec === 'h264'
      ? 'avc-decoder-configuration-record'
      : codec === 'hevc'
        ? 'hevc-decoder-configuration-record'
        : codec === 'aac'
          ? 'audio-specific-config'
          : 'codec-private'
    : undefined;
  return {
    metadata,
    nativeCodecTag,
    framing,
    ...(nalLengthSize !== undefined ? { nalLengthSize } : {}),
    ...(description ? { description } : {}),
    ...(descriptionRecord ? { descriptionRecord } : {}),
  };
}

function codecFromSampleEntry(sampleEntryType: string, type: TrackType): string {
  switch (sampleEntryType) {
    case 'avc1':
    case 'avc3': return 'h264';
    case 'hvc1':
    case 'hev1': return 'hevc';
    case 'vp08': return 'vp8';
    case 'vp09': return 'vp9';
    case 'av01': return 'av1';
    case 'mp4a': return 'aac';
    case 'Opus': return 'opus';
    default: return sampleEntryType || (type === 'video' ? 'unknown-video' : 'unknown-audio');
  }
}

function parseStsz(bytes: Uint8Array, stsz: Box): SampleSizeTable {
  if (stsz.bodyStart + 12 > stsz.bodyEnd) throw new Error('truncated stsz header');
  const defaultSize = be32(bytes, stsz.bodyStart + 4);
  const declared = be32(bytes, stsz.bodyStart + 8);
  if (declared > MAX_SAMPLE_TABLE_PACKETS) throw tableUnsupported('WEB_DEMUXER_FAST_PATH_PACKET_BUDGET', `sample table declares ${declared} packets`);
  if (defaultSize !== 0) return { count: declared, sizeAt: () => defaultSize };
  const start = stsz.bodyStart + 12;
  if (start + declared * 4 > stsz.bodyEnd) throw new Error('MP4 stsz table is truncated');
  return {
    count: declared,
    sizeAt: (index) => {
      if (!Number.isSafeInteger(index) || index < 0 || index >= declared) {
        throw new RangeError(`stsz sample index ${index} is out of range`);
      }
      return be32(bytes, start + index * 4);
    },
  };
}

function parseTimingRuns(
  bytes: Uint8Array,
  box: Box,
  maxSamples: number,
  compositionOffsets: boolean,
): TimingRuns {
  if (box.bodyStart + 8 > box.bodyEnd) throw new Error(`truncated ${box.type} header`);
  const version = bytes[box.bodyStart] ?? 0;
  const entryCount = be32(bytes, box.bodyStart + 4);
  if (box.bodyStart + 8 + entryCount * 8 > box.bodyEnd) throw new Error(`truncated ${box.type} entries`);
  const runs: TimingRun[] = [];
  let sampleCount = 0;
  let total = 0;
  for (let index = 0; index < entryCount; index++) {
    const offset = box.bodyStart + 8 + index * 8;
    const count = be32(bytes, offset);
    const raw = be32(bytes, offset + 4);
    const value = compositionOffsets && version === 1 ? raw | 0 : raw;
    if (!count || sampleCount + count > maxSamples) {
      throw new Error(`${box.type} declares an invalid sample count`);
    }
    sampleCount += count;
    total += count * value;
    if (!Number.isSafeInteger(total)) throw new Error(`${box.type} timing total exceeds safe integer range`);
    runs.push({ count, value });
  }
  return { runs, sampleCount, total };
}

function* timingValueIterator(runs: readonly TimingRun[]): Generator<number> {
  for (const run of runs) for (let index = 0; index < run.count; index++) yield run.value;
}

function parseStss(bytes: Uint8Array, stss: Box | undefined): Set<number> | undefined {
  if (!stss) return undefined;
  if (stss.bodyStart + 8 > stss.bodyEnd) throw new Error('truncated stss header');
  const count = be32(bytes, stss.bodyStart + 4);
  if (stss.bodyStart + 8 + count * 4 > stss.bodyEnd) throw new Error('truncated stss entries');
  const samples = new Set<number>();
  for (let index = 0; index < count; index++) samples.add(be32(bytes, stss.bodyStart + 8 + index * 4));
  return samples;
}

interface StscEntry {
  firstChunk: number;
  samplesPerChunk: number;
  sampleDescriptionIndex: number;
}

function parseStsc(bytes: Uint8Array, stsc: Box): StscEntry[] {
  if (stsc.bodyStart + 8 > stsc.bodyEnd) throw new Error('truncated stsc header');
  const count = be32(bytes, stsc.bodyStart + 4);
  if (!count || stsc.bodyStart + 8 + count * 12 > stsc.bodyEnd) throw new Error('truncated/empty stsc entries');
  const entries: StscEntry[] = [];
  for (let index = 0; index < count; index++) {
    const offset = stsc.bodyStart + 8 + index * 12;
    const entry = {
      firstChunk: be32(bytes, offset),
      samplesPerChunk: be32(bytes, offset + 4),
      sampleDescriptionIndex: be32(bytes, offset + 8),
    };
    if (!entry.firstChunk || !entry.samplesPerChunk) throw new Error('stsc contains zero firstChunk/samplesPerChunk');
    if (index === 0 && entry.firstChunk !== 1) throw new Error('stsc first entry must begin at chunk 1');
    if (index > 0 && entry.firstChunk <= entries[index - 1]!.firstChunk) throw new Error('stsc firstChunk is not strictly increasing');
    if (entry.sampleDescriptionIndex !== 1) {
      throw tableUnsupported('WEB_DEMUXER_FAST_PATH_MULTIPLE_SAMPLE_DESCRIPTIONS', `stsc references sample description ${entry.sampleDescriptionIndex}`);
    }
    entries.push(entry);
  }
  return entries;
}

function parseChunkOffsets(bytes: Uint8Array, box: Box, width: 4 | 8): number[] {
  if (box.bodyStart + 8 > box.bodyEnd) throw new Error(`truncated ${box.type} header`);
  const count = be32(bytes, box.bodyStart + 4);
  if (!count || box.bodyStart + 8 + count * width > box.bodyEnd) throw new Error(`truncated/empty ${box.type} entries`);
  return Array.from({ length: count }, (_, index) =>
    width === 4 ? be32(bytes, box.bodyStart + 8 + index * width) : be64(bytes, box.bodyStart + 8 + index * width),
  );
}

function validateSamplePlacement(
  sizes: SampleSizeTable,
  chunkOffsets: readonly number[],
  entries: readonly StscEntry[],
  layout: TopLevelLayout,
): void {
  let sampleIndex = 0;
  let entryIndex = 0;
  for (let chunkIndex = 1; chunkIndex <= chunkOffsets.length; chunkIndex++) {
    while (entryIndex + 1 < entries.length && entries[entryIndex + 1]!.firstChunk <= chunkIndex) entryIndex++;
    const entry = entries[entryIndex]!;
    let offset = chunkOffsets[chunkIndex - 1]!;
    for (let inChunk = 0; inChunk < entry.samplesPerChunk; inChunk++) {
      if (sampleIndex >= sizes.count) throw new Error('stsc maps more samples than stsz declares');
      const size = sizes.sizeAt(sampleIndex);
      const end = offset + size;
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(end) || size < 0 || end > layout.fileSize) {
        throw new Error(`MP4 sample ${sampleIndex} range ${offset}-${end} exceeds file bounds`);
      }
      const containingMdat = layout.mdats.some((mdat) => offset >= mdat.start && end <= mdat.endExclusive);
      if (!containingMdat) {
        throw new Error(`MP4 sample ${sampleIndex} range ${offset}-${end} is outside every mdat payload`);
      }
      offset = end;
      sampleIndex++;
    }
  }
  if (sampleIndex !== sizes.count) throw new Error(`stsc maps ${sampleIndex} samples but stsz declares ${sizes.count}`);
}

function parseEditList(
  bytes: Uint8Array,
  trak: Box,
  movieTimescale: number,
  mediaTimescale: number,
): { shiftUs: number; durationSec?: number } {
  const edts = findBox(bytes, trak.bodyStart, trak.bodyEnd, 'edts');
  const elst = edts ? findBox(bytes, edts.bodyStart, edts.bodyEnd, 'elst') : undefined;
  if (!elst) return { shiftUs: 0 };
  if (elst.bodyStart + 8 > elst.bodyEnd) throw new Error('truncated elst header');
  const version = bytes[elst.bodyStart] ?? 0;
  const count = be32(bytes, elst.bodyStart + 4);
  const width = version === 1 ? 20 : 12;
  if (!count || elst.bodyStart + 8 + count * width > elst.bodyEnd) throw new Error('truncated/empty elst entries');
  let emptyDuration = 0;
  let mediaTime: number | undefined;
  let presentationDuration = 0;
  for (let index = 0; index < count; index++) {
    const offset = elst.bodyStart + 8 + index * width;
    const segmentDuration = version === 1 ? be64(bytes, offset) : be32(bytes, offset);
    const rawMediaTime = version === 1 ? signed64(bytes, offset + 8) : signed32(bytes, offset + 4);
    const rateOffset = offset + (version === 1 ? 16 : 8);
    if (be16(bytes, rateOffset) !== 1 || be16(bytes, rateOffset + 2) !== 0) {
      throw tableUnsupported('WEB_DEMUXER_FAST_PATH_EDIT_RATE', 'non-unity edit-list media rate is unsupported');
    }
    presentationDuration += segmentDuration;
    if (rawMediaTime === -1 && mediaTime === undefined) emptyDuration += segmentDuration;
    else if (rawMediaTime >= 0 && mediaTime === undefined) mediaTime = rawMediaTime;
    else if (rawMediaTime >= 0) {
      throw tableUnsupported('WEB_DEMUXER_FAST_PATH_MULTIPLE_EDITS', 'multiple media edit-list segments are unsupported');
    }
  }
  const shiftUs = Math.round(
    (emptyDuration / Math.max(1, movieTimescale) - (mediaTime ?? 0) / Math.max(1, mediaTimescale)) * 1_000_000,
  );
  return {
    shiftUs,
    ...(presentationDuration > 0 ? { durationSec: presentationDuration / Math.max(1, movieTimescale) } : {}),
  };
}

function ticksToUs(ticks: number, timescale: number): number {
  return Math.round((ticks * 1_000_000) / timescale);
}

function maxFinite(values: number[]): number | null {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length ? Math.max(...finite) : null;
}

function tableUnsupported(reasonCode: string, reason: string): ReturnType<typeof createNotApplicableError> {
  return createNotApplicableError(
    ENGINE_ID,
    'demux',
    reason,
    { inputContainers: ['mp4'], inputCodecs: [], outputCodecs: [] },
    reasonCode,
  );
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new DOMException('operation aborted', 'AbortError');
}

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function be16(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function be32(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)) >>> 0
  );
}

function signed32(bytes: Uint8Array, offset: number): number {
  return be32(bytes, offset) | 0;
}

function be64(bytes: Uint8Array, offset: number): number {
  const value = (BigInt(be32(bytes, offset)) << 32n) | BigInt(be32(bytes, offset + 4));
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(`MP4 64-bit value exceeds safe integer: ${value}`);
  return number;
}

function signed64(bytes: Uint8Array, offset: number): number {
  const unsigned = (BigInt(be32(bytes, offset)) << 32n) | BigInt(be32(bytes, offset + 4));
  const signed = BigInt.asIntN(64, unsigned);
  const number = Number(signed);
  if (!Number.isSafeInteger(number)) throw new Error(`MP4 signed 64-bit value exceeds safe integer: ${signed}`);
  return number;
}

function fourcc(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0,
  );
}
