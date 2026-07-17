import { streamingUnavailable, streamingVerdict, type StreamingDecision } from './types.ts';

interface Box {
  readonly type: string;
  readonly start: number;
  readonly bodyStart: number;
  readonly end: number;
}

export interface FragmentedMp4TrackEvidence {
  readonly trackId: number;
  readonly type: 'video' | 'audio' | 'other';
  readonly timescale: number;
  readonly codec: string | null;
  readonly parameterSetsAvailable: boolean;
  readonly sampleCount: number;
  readonly firstDecodeTime: number;
  readonly finalDecodeTime: number;
}

export interface FragmentedMp4SegmentEvidence {
  readonly sequenceNumber: number;
  readonly start: number;
  readonly end: number;
  readonly moofStart: number;
  readonly mdatPayloadBytes: number;
  readonly sampleBytes: number;
  readonly sampleCount: number;
  readonly trackIds: readonly number[];
}

export interface FragmentedMp4Evidence {
  readonly state: 'OK';
  readonly majorBrand: string;
  readonly compatibleBrands: readonly string[];
  readonly cmafCompatible: boolean;
  readonly initialization: Readonly<{ start: number; end: number }>;
  readonly segments: readonly FragmentedMp4SegmentEvidence[];
  readonly tracks: readonly FragmentedMp4TrackEvidence[];
  readonly totalSamples: number;
}

export type FragmentedMp4ReadResult =
  | FragmentedMp4Evidence
  | {
      readonly state: 'UNSUPPORTED' | 'MALFORMED';
      readonly reasonCode: string;
      readonly detail: string;
      readonly offset?: number;
    };

export interface FragmentedMp4Contract {
  readonly cmaf?: boolean;
  readonly requireParameterSets?: boolean;
  readonly requireRandomAccessStart?: boolean;
}

interface TrackDefaults {
  trackId: number;
  type: FragmentedMp4TrackEvidence['type'];
  timescale: number;
  codec: string | null;
  parameterSetsAvailable: boolean;
  defaultDuration: number;
  defaultSize: number;
  defaultFlags: number;
  sampleCount: number;
  firstDecodeTime?: number;
  finalDecodeTime?: number;
  firstSampleSync?: boolean;
}

interface RunEvidence {
  start: number;
  end: number;
  sampleCount: number;
  sampleBytes: number;
  duration: number;
  firstSampleSync: boolean;
}

class Mp4Malformed extends Error {
  constructor(readonly reasonCode: string, message: string, readonly offset?: number) {
    super(message);
    this.name = 'Mp4Malformed';
  }
}

/** Strict ISO BMFF fragment reader. Any incomplete table/run returns MALFORMED, never partial facts. */
export function inspectFragmentedMp4(
  bytes: Uint8Array,
  contract: FragmentedMp4Contract = {},
): FragmentedMp4ReadResult {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 16) {
    return malformed('FMP4_INPUT_INCOMPLETE', 'input is shorter than ftyp plus one box');
  }
  try {
    const top = readBoxes(bytes, 0, bytes.byteLength);
    const ftyp = top.find((box) => box.type === 'ftyp');
    const moov = top.find((box) => box.type === 'moov');
    const firstMoof = top.find((box) => box.type === 'moof');
    if (!ftyp) throw problem('FMP4_FTYP_MISSING', 'initialization segment has no ftyp');
    if (!moov) throw problem('FMP4_MOOV_MISSING', 'initialization segment has no moov');
    if (!firstMoof) throw problem('FMP4_MEDIA_SEGMENT_MISSING', 'fragmented output has no moof/media segment');
    if (ftyp.start > moov.start || moov.start > firstMoof.start) {
      throw problem('FMP4_INITIALIZATION_ORDER_INVALID', 'required order is ftyp, moov, then media fragments');
    }
    if (top.some((box) => box.type === 'mdat' && box.start < firstMoof.start)) {
      throw problem('FMP4_INIT_CONTAINS_MEDIA_DATA', 'initialization segment contains mdat');
    }
    const brands = parseFtyp(bytes, ftyp);
    const allBrands = new Set([brands.majorBrand, ...brands.compatibleBrands]);
    const cmafCompatible = ['cmfc', 'cmfs', 'cmaf'].some((brand) => allBrands.has(brand));
    if (contract.cmaf && !cmafCompatible) {
      throw problem('CMAF_BRAND_MISSING', `brands ${[...allBrands].join(',')} do not signal CMAF compatibility`, ftyp.start);
    }

    const moovChildren = readBoxes(bytes, moov.bodyStart, moov.end);
    const mvex = moovChildren.find((box) => box.type === 'mvex');
    if (!mvex) throw problem('FMP4_MVEX_MISSING', 'fragmented moov has no mvex', moov.start);
    const tracks = parseTracks(bytes, moovChildren, mvex);
    if (tracks.size === 0) throw problem('FMP4_TRACKS_MISSING', 'moov has no media tracks', moov.start);
    if (contract.requireParameterSets ?? true) {
      const missing = [...tracks.values()].find((track) =>
        track.type === 'video' && (track.codec === 'h264' || track.codec === 'hevc') && !track.parameterSetsAvailable);
      if (missing) {
        throw problem(
          'FMP4_PARAMETER_SETS_MISSING',
          `track ${missing.trackId} ${missing.codec} has no avcC/hvcC parameter-set evidence`,
          moov.start,
        );
      }
    }

    const segments: FragmentedMp4SegmentEvidence[] = [];
    const seenSequences = new Set<number>();
    for (let index = 0; index < top.length; index++) {
      const moof = top[index]!;
      if (moof.type !== 'moof') continue;
      const segmentStart = index > 0 && top[index - 1]?.type === 'styp' ? top[index - 1]!.start : moof.start;
      const mdats: Box[] = [];
      let segmentEnd = moof.end;
      for (let next = index + 1; next < top.length; next++) {
        const box = top[next]!;
        if (box.type === 'moof' || box.type === 'styp') break;
        if (box.type === 'mdat') mdats.push(box);
        segmentEnd = box.end;
      }
      if (mdats.length === 0) throw problem('FMP4_MDAT_MISSING', 'moof has no following mdat', moof.start);
      const parsed = parseMoof(bytes, moof, mdats, tracks);
      if (seenSequences.has(parsed.sequenceNumber)) {
        throw problem('FMP4_SEQUENCE_DUPLICATE', `duplicate mfhd sequence ${parsed.sequenceNumber}`, moof.start);
      }
      seenSequences.add(parsed.sequenceNumber);
      segments.push(Object.freeze({
        sequenceNumber: parsed.sequenceNumber,
        start: segmentStart,
        end: segmentEnd,
        moofStart: moof.start,
        mdatPayloadBytes: parsed.mdatPayloadBytes,
        sampleBytes: parsed.sampleBytes,
        sampleCount: parsed.sampleCount,
        trackIds: Object.freeze([...parsed.trackIds].sort((a, b) => a - b)),
      }));
    }
    if (segments.length === 0) throw problem('FMP4_MEDIA_SEGMENT_MISSING', 'no complete media segment was found');
    for (let index = 1; index < segments.length; index++) {
      if (segments[index]!.sequenceNumber <= segments[index - 1]!.sequenceNumber) {
        throw problem('FMP4_SEQUENCE_NOT_MONOTONIC', 'mfhd sequence numbers must increase', segments[index]!.moofStart);
      }
    }
    if (contract.requireRandomAccessStart ?? true) {
      const missingRap = [...tracks.values()].find((track) => track.type === 'video' && track.firstSampleSync !== true);
      if (missingRap) throw problem('FMP4_RANDOM_ACCESS_START_MISSING', `video track ${missingRap.trackId} does not begin on a sync sample`);
    }

    const trackEvidence = [...tracks.values()].sort((a, b) => a.trackId - b.trackId).map((track) => {
      if (track.sampleCount === 0 || track.firstDecodeTime === undefined || track.finalDecodeTime === undefined) {
        throw problem('FMP4_ZERO_SAMPLE_TRACK', `media track ${track.trackId} has no complete fragment samples`);
      }
      return Object.freeze({
        trackId: track.trackId,
        type: track.type,
        timescale: track.timescale,
        codec: track.codec,
        parameterSetsAvailable: track.parameterSetsAvailable,
        sampleCount: track.sampleCount,
        firstDecodeTime: track.firstDecodeTime,
        finalDecodeTime: track.finalDecodeTime,
      });
    });
    return Object.freeze({
      state: 'OK' as const,
      majorBrand: brands.majorBrand,
      compatibleBrands: Object.freeze(brands.compatibleBrands),
      cmafCompatible,
      initialization: Object.freeze({ start: ftyp.start, end: moov.end }),
      segments: Object.freeze(segments),
      tracks: Object.freeze(trackEvidence),
      totalSamples: trackEvidence.reduce((sum, track) => sum + track.sampleCount, 0),
    });
  } catch (error) {
    if (error instanceof Mp4Malformed) return malformed(error.reasonCode, error.message, error.offset);
    return malformed('FMP4_READER_INTERNAL_ERROR', error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  }
}

export function assessFragmentedMp4(
  bytes: Uint8Array,
  contract: FragmentedMp4Contract = {},
): StreamingDecision {
  const result = inspectFragmentedMp4(bytes, contract);
  if (result.state !== 'OK') return streamingVerdict('FAIL', result.reasonCode, result.detail);
  return streamingVerdict(
    'PASS',
    contract.cmaf ? 'CMAF_FRAGMENT_STRUCTURE_VALID' : 'FMP4_FRAGMENT_STRUCTURE_VALID',
    `${result.segments.length} independently bounded segment(s), ${result.totalSamples} sample(s)`,
    {
      segments: result.segments.length,
      tracks: result.tracks.length,
      samples: result.totalSamples,
      cmafCompatible: result.cmafCompatible ? 1 : 0,
    },
  );
}

export interface FragmentedMp4AppendEnvironment {
  isTypeSupported(mime: string): boolean;
  appendInitialization(bytes: Uint8Array): Promise<void>;
  appendMediaSegment(bytes: Uint8Array, index: number): Promise<void>;
  finalize(): Promise<void>;
}

/** Real MSE integration is injected by the runner/browser; structural coverage survives NA_BROWSER. */
export async function probeFragmentedMp4Append(
  bytes: Uint8Array,
  mime: string,
  environment: FragmentedMp4AppendEnvironment,
  contract: FragmentedMp4Contract = {},
): Promise<StreamingDecision> {
  const read = inspectFragmentedMp4(bytes, contract);
  if (read.state !== 'OK') return streamingVerdict('FAIL', read.reasonCode, read.detail);
  if (!environment.isTypeSupported(mime)) {
    return streamingUnavailable('NA_BROWSER', 'FMP4_MSE_MIME_UNSUPPORTED', `MediaSource does not support ${mime}`);
  }
  try {
    const init = bytes.slice(read.initialization.start, read.initialization.end);
    await environment.appendInitialization(init);
    for (const [index, segment] of read.segments.entries()) {
      await environment.appendMediaSegment(bytes.slice(segment.start, segment.end), index);
    }
    await environment.finalize();
    return streamingVerdict(
      'PASS',
      'FMP4_MSE_APPEND_VALID',
      `MediaSource accepted initialization plus ${read.segments.length} media segment(s) incrementally`,
      { appendedSegments: read.segments.length },
    );
  } catch (error) {
    return streamingVerdict(
      'FAIL',
      'FMP4_MSE_APPEND_FAILED',
      error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    );
  }
}

function parseTracks(bytes: Uint8Array, moovChildren: readonly Box[], mvex: Box): Map<number, TrackDefaults> {
  const tracks = new Map<number, TrackDefaults>();
  for (const trak of moovChildren.filter((box) => box.type === 'trak')) {
    const children = readBoxes(bytes, trak.bodyStart, trak.end);
    const tkhd = children.find((box) => box.type === 'tkhd');
    const mdia = children.find((box) => box.type === 'mdia');
    if (!tkhd || !mdia) throw problem('FMP4_TRACK_HEADER_MISSING', 'trak lacks tkhd or mdia', trak.start);
    const trackId = fullBoxVersion(bytes, tkhd) === 1 ? u32(bytes, tkhd.bodyStart + 20) : u32(bytes, tkhd.bodyStart + 12);
    const mdiaChildren = readBoxes(bytes, mdia.bodyStart, mdia.end);
    const mdhd = mdiaChildren.find((box) => box.type === 'mdhd');
    const hdlr = mdiaChildren.find((box) => box.type === 'hdlr');
    if (!mdhd || !hdlr) throw problem('FMP4_MEDIA_HEADER_MISSING', `track ${trackId} lacks mdhd/hdlr`, mdia.start);
    const timescale = fullBoxVersion(bytes, mdhd) === 1 ? u32(bytes, mdhd.bodyStart + 20) : u32(bytes, mdhd.bodyStart + 12);
    if (trackId <= 0 || timescale <= 0) throw problem('FMP4_TRACK_ID_TIMESCALE_INVALID', 'track id/timescale must be positive', trak.start);
    const handler = fourcc(bytes, hdlr.bodyStart + 8);
    const type = handler === 'vide' ? 'video' : handler === 'soun' ? 'audio' : 'other';
    const codec = detectCodec(bytes, trak);
    tracks.set(trackId, {
      trackId,
      type,
      timescale,
      codec,
      parameterSetsAvailable: codec === 'h264'
        ? containsBoxType(bytes, trak, 'avcC')
        : codec === 'hevc'
          ? containsBoxType(bytes, trak, 'hvcC')
          : true,
      defaultDuration: 0,
      defaultSize: 0,
      defaultFlags: 0,
      sampleCount: 0,
    });
  }
  for (const trex of readBoxes(bytes, mvex.bodyStart, mvex.end).filter((box) => box.type === 'trex')) {
    requireBody(trex, 24);
    const trackId = u32(bytes, trex.bodyStart + 4);
    const track = tracks.get(trackId);
    if (!track) throw problem('FMP4_TREX_TRACK_UNKNOWN', `trex references unknown track ${trackId}`, trex.start);
    track.defaultDuration = u32(bytes, trex.bodyStart + 12);
    track.defaultSize = u32(bytes, trex.bodyStart + 16);
    track.defaultFlags = u32(bytes, trex.bodyStart + 20);
  }
  for (const track of tracks.values()) {
    if (![...readBoxes(bytes, mvex.bodyStart, mvex.end)].some((box) => box.type === 'trex' && u32(bytes, box.bodyStart + 4) === track.trackId)) {
      throw problem('FMP4_TREX_MISSING', `track ${track.trackId} has no trex defaults`, mvex.start);
    }
  }
  return tracks;
}

function parseMoof(
  bytes: Uint8Array,
  moof: Box,
  mdats: readonly Box[],
  tracks: Map<number, TrackDefaults>,
): {
  sequenceNumber: number;
  mdatPayloadBytes: number;
  sampleBytes: number;
  sampleCount: number;
  trackIds: Set<number>;
} {
  const children = readBoxes(bytes, moof.bodyStart, moof.end);
  const mfhd = children.find((box) => box.type === 'mfhd');
  const trafs = children.filter((box) => box.type === 'traf');
  if (!mfhd) throw problem('FMP4_MFHD_MISSING', 'moof has no mfhd', moof.start);
  requireBody(mfhd, 8);
  if (trafs.length === 0) throw problem('FMP4_TRAF_MISSING', 'moof has no traf', moof.start);
  const sequenceNumber = u32(bytes, mfhd.bodyStart + 4);
  const payloadRanges = mdats.map((mdat) => ({ start: mdat.bodyStart, end: mdat.end }));
  const mdatPayloadBytes = payloadRanges.reduce((sum, range) => sum + range.end - range.start, 0);
  const runRanges: Array<{ start: number; end: number }> = [];
  let sampleBytes = 0;
  let sampleCount = 0;
  const trackIds = new Set<number>();

  for (const traf of trafs) {
    const trafChildren = readBoxes(bytes, traf.bodyStart, traf.end);
    const tfhd = trafChildren.find((box) => box.type === 'tfhd');
    const tfdt = trafChildren.find((box) => box.type === 'tfdt');
    const truns = trafChildren.filter((box) => box.type === 'trun');
    if (!tfhd) throw problem('FMP4_TFHD_MISSING', 'traf has no tfhd', traf.start);
    if (!tfdt) throw problem('FMP4_TFDT_MISSING', 'traf has no tfdt', traf.start);
    if (truns.length === 0) throw problem('FMP4_TRUN_MISSING', 'traf has no trun', traf.start);
    requireBody(tfhd, 8);
    const flags = fullBoxFlags(bytes, tfhd);
    const trackId = u32(bytes, tfhd.bodyStart + 4);
    const track = tracks.get(trackId);
    if (!track) throw problem('FMP4_TFHD_TRACK_UNKNOWN', `tfhd references unknown track ${trackId}`, tfhd.start);
    if ((flags & 0x000001) !== 0 || (flags & 0x020000) === 0) {
      throw problem(
        'FMP4_ADDRESSING_NOT_MOOF_RELATIVE',
        `track ${trackId} must use default-base-is-moof without absolute base_data_offset`,
        tfhd.start,
      );
    }
    let cursor = tfhd.bodyStart + 8;
    if (flags & 0x000002) cursor += 4;
    let defaultDuration = track.defaultDuration;
    let defaultSize = track.defaultSize;
    let defaultFlags = track.defaultFlags;
    if (flags & 0x000008) { defaultDuration = u32(bytes, cursor); cursor += 4; }
    if (flags & 0x000010) { defaultSize = u32(bytes, cursor); cursor += 4; }
    if (flags & 0x000020) { defaultFlags = u32(bytes, cursor); cursor += 4; }
    if (cursor > tfhd.end) throw problem('FMP4_TFHD_TRUNCATED', 'tfhd optional fields are truncated', tfhd.start);
    const decodeStart = parseTfdt(bytes, tfdt);
    let decodeCursor = decodeStart;
    let nextDataStart: number | undefined;
    for (const trun of truns) {
      const run = parseTrun(bytes, trun, moof.start, nextDataStart, defaultDuration, defaultSize, defaultFlags);
      if (!rangeInsidePayload(run.start, run.end, payloadRanges)) {
        throw problem('FMP4_TRUN_OUTSIDE_MDAT', `trun byte range [${run.start},${run.end}) is outside mdat payload`, trun.start);
      }
      runRanges.push({ start: run.start, end: run.end });
      nextDataStart = run.end;
      decodeCursor += run.duration;
      sampleBytes += run.sampleBytes;
      sampleCount += run.sampleCount;
      track.sampleCount += run.sampleCount;
      track.firstDecodeTime ??= decodeStart;
      if (track.finalDecodeTime !== undefined && decodeStart < track.finalDecodeTime) {
        throw problem(
          'FMP4_DECODE_TIMELINE_NON_MONOTONIC',
          `track ${trackId} tfdt ${decodeStart} < prior end ${track.finalDecodeTime}`,
          tfdt.start,
        );
      }
      track.finalDecodeTime = decodeCursor;
      track.firstSampleSync ??= run.firstSampleSync;
    }
    trackIds.add(trackId);
  }
  const covered = exactCoverage(runRanges, payloadRanges);
  if (!covered) {
    throw problem(
      'FMP4_TRUN_MDAT_COVERAGE_MISMATCH',
      `trun sample bytes ${sampleBytes} do not exactly and uniquely cover ${mdatPayloadBytes} mdat payload bytes`,
      moof.start,
    );
  }
  return { sequenceNumber, mdatPayloadBytes, sampleBytes, sampleCount, trackIds };
}

function parseTrun(
  bytes: Uint8Array,
  trun: Box,
  moofStart: number,
  previousEnd: number | undefined,
  defaultDuration: number,
  defaultSize: number,
  defaultFlags: number,
): RunEvidence {
  requireBody(trun, 8);
  const version = fullBoxVersion(bytes, trun);
  const flags = fullBoxFlags(bytes, trun);
  const count = u32(bytes, trun.bodyStart + 4);
  if (count <= 0 || count > 10_000_000) throw problem('FMP4_TRUN_SAMPLE_COUNT_INVALID', `trun sample_count=${count}`, trun.start);
  let cursor = trun.bodyStart + 8;
  let start = previousEnd;
  if (flags & 0x000001) {
    start = moofStart + i32(bytes, cursor);
    cursor += 4;
  }
  if (start === undefined) throw problem('FMP4_TRUN_DATA_OFFSET_MISSING', 'first trun has no movie-fragment-relative data_offset', trun.start);
  let firstFlags: number | undefined;
  if (flags & 0x000004) { firstFlags = u32(bytes, cursor); cursor += 4; }
  let sampleBytes = 0;
  let duration = 0;
  let firstSampleSync = true;
  for (let index = 0; index < count; index++) {
    let itemDuration = defaultDuration;
    let itemSize = defaultSize;
    let itemFlags = index === 0 && firstFlags !== undefined ? firstFlags : defaultFlags;
    if (flags & 0x000100) { itemDuration = u32(bytes, cursor); cursor += 4; }
    if (flags & 0x000200) { itemSize = u32(bytes, cursor); cursor += 4; }
    if (flags & 0x000400) { itemFlags = u32(bytes, cursor); cursor += 4; }
    if (flags & 0x000800) cursor += 4;
    if (cursor > trun.end || itemDuration <= 0 || itemSize <= 0) {
      throw problem('FMP4_TRUN_SAMPLE_FIELDS_INVALID', 'trun sample fields are truncated/zero', trun.start);
    }
    if (index === 0) firstSampleSync = (itemFlags & 0x00010000) === 0;
    sampleBytes += itemSize;
    duration += itemDuration;
  }
  return { start, end: start + sampleBytes, sampleCount: count, sampleBytes, duration, firstSampleSync };
}

function parseTfdt(bytes: Uint8Array, box: Box): number {
  requireBody(box, fullBoxVersion(bytes, box) === 1 ? 12 : 8);
  return fullBoxVersion(bytes, box) === 1 ? u64(bytes, box.bodyStart + 4) : u32(bytes, box.bodyStart + 4);
}

function parseFtyp(bytes: Uint8Array, box: Box): { majorBrand: string; compatibleBrands: string[] } {
  if (box.end - box.bodyStart < 8 || (box.end - box.bodyStart - 8) % 4 !== 0) {
    throw problem('FMP4_FTYP_MALFORMED', 'ftyp payload is truncated or unaligned', box.start);
  }
  const compatibleBrands: string[] = [];
  for (let offset = box.bodyStart + 8; offset < box.end; offset += 4) compatibleBrands.push(fourcc(bytes, offset));
  return { majorBrand: fourcc(bytes, box.bodyStart), compatibleBrands };
}

function readBoxes(bytes: Uint8Array, start: number, end: number): Box[] {
  const boxes: Box[] = [];
  let offset = start;
  while (offset < end) {
    if (offset + 8 > end) throw problem('FMP4_BOX_HEADER_TRUNCATED', 'box header is truncated', offset);
    let size = u32(bytes, offset);
    const type = fourcc(bytes, offset + 4);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) throw problem('FMP4_LARGE_SIZE_TRUNCATED', `${type} large-size header is truncated`, offset);
      size = u64(bytes, offset + 8);
      header = 16;
    } else if (size === 0) size = end - offset;
    if (!Number.isSafeInteger(size) || size < header || offset + size > end) {
      throw problem('FMP4_BOX_SIZE_INVALID', `${type} size ${size} exceeds parent`, offset);
    }
    boxes.push({ type, start: offset, bodyStart: offset + header, end: offset + size });
    offset += size;
  }
  return boxes;
}

function detectCodec(bytes: Uint8Array, trak: Box): string | null {
  if (containsBoxType(bytes, trak, 'avc1') || containsBoxType(bytes, trak, 'avc3')) return 'h264';
  if (containsBoxType(bytes, trak, 'hvc1') || containsBoxType(bytes, trak, 'hev1')) return 'hevc';
  if (containsBoxType(bytes, trak, 'mp4a')) return 'aac';
  if (containsBoxType(bytes, trak, 'Opus')) return 'opus';
  return null;
}

function containsBoxType(bytes: Uint8Array, parent: Box, type: string): boolean {
  const target = new TextEncoder().encode(type);
  for (let offset = parent.bodyStart + 4; offset + 4 <= parent.end; offset++) {
    if (target.every((byte, index) => bytes[offset + index] === byte)) {
      const sizeOffset = offset - 4;
      if (sizeOffset >= parent.bodyStart && u32(bytes, sizeOffset) >= 8 && sizeOffset + u32(bytes, sizeOffset) <= parent.end) return true;
    }
  }
  return false;
}

function rangeInsidePayload(start: number, end: number, payloads: readonly { start: number; end: number }[]): boolean {
  if (end <= start) return false;
  let cursor = start;
  for (const range of [...payloads].sort((a, b) => a.start - b.start)) {
    if (cursor < range.start) return false;
    if (cursor >= range.start && cursor < range.end) cursor = Math.min(end, range.end);
    if (cursor === end) return true;
  }
  return false;
}

function exactCoverage(
  runs: readonly { start: number; end: number }[],
  payloads: readonly { start: number; end: number }[],
): boolean {
  const sortedRuns = [...runs].sort((a, b) => a.start - b.start || a.end - b.end);
  const sortedPayloads = [...payloads].sort((a, b) => a.start - b.start);
  if (sortedRuns.some((run, index) => index > 0 && run.start < sortedRuns[index - 1]!.end)) return false;
  if (sortedRuns.reduce((sum, run) => sum + run.end - run.start, 0) !==
      sortedPayloads.reduce((sum, range) => sum + range.end - range.start, 0)) return false;
  return sortedRuns.every((run) => rangeInsidePayload(run.start, run.end, sortedPayloads));
}

function fullBoxVersion(bytes: Uint8Array, box: Box): number {
  requireBody(box, 4);
  return bytes[box.bodyStart]!;
}

function fullBoxFlags(bytes: Uint8Array, box: Box): number {
  requireBody(box, 4);
  return bytes[box.bodyStart + 1]! * 65536 + bytes[box.bodyStart + 2]! * 256 + bytes[box.bodyStart + 3]!;
}

function requireBody(box: Box, length: number): void {
  if (box.bodyStart + length > box.end) throw problem('FMP4_BOX_BODY_TRUNCATED', `${box.type} body is truncated`, box.start);
}

function u32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.byteLength) throw problem('FMP4_INTEGER_TRUNCATED', 'uint32 is truncated', offset);
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
}

function i32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.byteLength) throw problem('FMP4_INTEGER_TRUNCATED', 'int32 is truncated', offset);
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getInt32(0);
}

function u64(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 8 > bytes.byteLength) throw problem('FMP4_INTEGER_TRUNCATED', 'uint64 is truncated', offset);
  const value = new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getBigUint64(0);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw problem('FMP4_INTEGER_UNSAFE', 'uint64 exceeds safe integer range', offset);
  return Number(value);
}

function fourcc(bytes: Uint8Array, offset: number): string {
  if (offset < 0 || offset + 4 > bytes.byteLength) throw problem('FMP4_FOURCC_TRUNCATED', 'fourcc is truncated', offset);
  return String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!);
}

function problem(reasonCode: string, detail: string, offset?: number): Mp4Malformed {
  return new Mp4Malformed(reasonCode, detail, offset);
}

function malformed(reasonCode: string, detail: string, offset?: number): Exclude<FragmentedMp4ReadResult, FragmentedMp4Evidence> {
  return Object.freeze({
    state: 'MALFORMED' as const,
    reasonCode,
    detail,
    ...(offset !== undefined ? { offset } : {}),
  });
}
