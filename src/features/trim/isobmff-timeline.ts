export interface IsoBmffEdit {
  readonly segmentDurationMovieTicks: number;
  readonly mediaTimeTicks: number;
  readonly mediaRateInteger: number;
  readonly mediaRateFraction: number;
}

export interface IsoBmffSampleInterval {
  readonly sampleIndex: number;
  readonly decodeStartMediaTicks: number;
  readonly compositionStartMediaTicks: number;
  readonly durationMediaTicks: number;
  readonly presentationStartUs: number;
  readonly presentationEndUs: number;
  readonly sync: boolean;
}

export interface IsoBmffTrackTimeline {
  readonly trackId: number;
  readonly type: 'video' | 'audio' | 'other';
  readonly codec: string | null;
  readonly mediaTimescale: number;
  readonly mediaDurationTicks: number;
  readonly codedSampleCount: number;
  readonly edits: readonly IsoBmffEdit[];
  readonly samples: readonly IsoBmffSampleInterval[];
  readonly emptyLeadingEditUs: number;
  readonly firstMediaTimeTicks: number;
  readonly presentationStartUs: number;
  readonly presentationEndUs: number;
  readonly rotationDegrees: 0 | 90 | 180 | 270 | null;
}

export interface IsoBmffPresentationTimeline {
  readonly state: 'OK';
  readonly movieTimescale: number;
  readonly movieHeaderDurationTicks: number;
  readonly presentationDurationUs: number;
  readonly tracks: readonly IsoBmffTrackTimeline[];
}

/**
 * Return the exact coded-sample prefix retained by a short trailing ISO edit.
 *
 * Golden packet semantics intentionally retain coded priming before the presentation origin. This
 * helper therefore declines leading, repeated, gapped, or broad edit rewrites and only recognizes a
 * zero-based contiguous prefix with at most 100 ms of excluded coded tail.
 */
export function smallTrailingIsoEditSampleIndices(
  track: IsoBmffTrackTimeline | undefined,
): Set<number> | undefined {
  if (!track || track.samples.length === 0) return undefined;
  const indices = [...new Set(track.samples.map((sample) => sample.sampleIndex))].sort((a, b) => a - b);
  if (indices[0] !== 0 || indices.at(-1) !== indices.length - 1) return undefined;
  const rawMediaSpanSec = track.mediaDurationTicks / track.mediaTimescale;
  const trailingEditSec = rawMediaSpanSec - track.presentationEndUs / 1_000_000;
  if (!(trailingEditSec > 0 && trailingEditSec <= 0.1)) return undefined;
  return new Set(indices);
}

export interface IsoBmffTrimWindow {
  readonly trackId: number;
  readonly type: IsoBmffTrackTimeline['type'];
  readonly firstSampleIndex: number;
  readonly lastSampleIndex: number;
  readonly landedStartUs: number;
  readonly landedEndUs: number;
  readonly sampleCount: number;
}

export type IsoBmffTimelineReadResult =
  | IsoBmffPresentationTimeline
  | {
      readonly state: 'UNSUPPORTED_FORMAT' | 'UNSUPPORTED_STRUCTURE' | 'MALFORMED' | 'INCOMPLETE';
      readonly reasonCode: string;
      readonly detail: string;
      readonly offset?: number;
    };

interface Box {
  readonly type: string;
  readonly start: number;
  readonly bodyStart: number;
  readonly end: number;
}

interface RawSample {
  sampleIndex: number;
  decodeStart: number;
  compositionStart: number;
  duration: number;
  sync: boolean;
}

class IsoProblem extends Error {
  constructor(
    readonly state: Exclude<IsoBmffTimelineReadResult['state'], 'OK'>,
    readonly reasonCode: string,
    message: string,
    readonly offset?: number,
  ) {
    super(message);
    this.name = 'IsoProblem';
  }
}

/** Resolve sample presentation through movie/media timescales and every supported edit-list entry. */
export function readIsoBmffPresentationTimeline(bytes: Uint8Array): IsoBmffTimelineReadResult {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 16) {
    return issue('INCOMPLETE', 'ISOBMFF_INPUT_INCOMPLETE', 'input is too short for an ISO BMFF header');
  }
  try {
    const top = boxes(bytes, 0, bytes.byteLength);
    if (!top.some((box) => box.type === 'ftyp' || box.type === 'moov' || box.type === 'mdat')) {
      throw new IsoProblem('UNSUPPORTED_FORMAT', 'ISOBMFF_SIGNATURE_MISSING', 'no ISO BMFF top-level boxes were found');
    }
    const moov = top.find((box) => box.type === 'moov');
    if (!moov) throw new IsoProblem('INCOMPLETE', 'ISOBMFF_MOOV_MISSING', 'movie box is missing');
    const moovChildren = boxes(bytes, moov.bodyStart, moov.end);
    const mvhd = moovChildren.find((box) => box.type === 'mvhd');
    if (!mvhd) throw new IsoProblem('MALFORMED', 'ISOBMFF_MVHD_MISSING', 'movie header is missing', moov.start);
    const movie = parseMovieHeader(bytes, mvhd);
    const tracks = moovChildren.filter((box) => box.type === 'trak').map((trak) =>
      parseTrack(bytes, trak, movie.timescale));
    if (tracks.length === 0) throw new IsoProblem('MALFORMED', 'ISOBMFF_TRACKS_MISSING', 'movie contains no tracks', moov.start);
    const presentationDurationUs = Math.max(0, ...tracks.map((track) => track.presentationEndUs));
    return Object.freeze({
      state: 'OK' as const,
      movieTimescale: movie.timescale,
      movieHeaderDurationTicks: movie.duration,
      presentationDurationUs,
      tracks: Object.freeze(tracks),
    });
  } catch (error) {
    if (error instanceof IsoProblem) return issue(error.state, error.reasonCode, error.message, error.offset);
    return issue(
      'MALFORMED',
      'ISOBMFF_TIMELINE_READER_INTERNAL',
      error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    );
  }
}

/** Select coded/presentation samples against a half-open requested interval on the resolved movie timeline. */
export function selectIsoBmffTrimWindows(
  timeline: IsoBmffPresentationTimeline,
  range: { startUs: number; endUs: number },
  mode: 'copy' | 'frame-accurate',
): IsoBmffTrimWindow[] {
  if (!Number.isSafeInteger(range.startUs) || !Number.isSafeInteger(range.endUs) ||
      range.startUs < 0 || range.endUs <= range.startUs) {
    throw new RangeError('ISO BMFF trim window requires a valid half-open microsecond range');
  }
  const windows: IsoBmffTrimWindow[] = [];
  for (const track of timeline.tracks) {
    let effectiveStartUs = range.startUs;
    if (mode === 'copy' && track.type === 'video') {
      const safe = track.samples.filter((sample) => sample.sync && sample.presentationStartUs <= range.startUs).at(-1);
      if (safe) effectiveStartUs = safe.presentationStartUs;
    }
    const selected = track.samples.filter((sample) =>
      sample.presentationStartUs < range.endUs && sample.presentationEndUs > effectiveStartUs);
    if (selected.length === 0) continue;
    windows.push(Object.freeze({
      trackId: track.trackId,
      type: track.type,
      firstSampleIndex: selected[0]!.sampleIndex,
      lastSampleIndex: selected.at(-1)!.sampleIndex,
      landedStartUs: selected[0]!.presentationStartUs,
      landedEndUs: selected.at(-1)!.presentationEndUs,
      sampleCount: selected.length,
    }));
  }
  return windows;
}

function parseMovieHeader(bytes: Uint8Array, box: Box): { timescale: number; duration: number } {
  const version = fullBoxVersion(bytes, box);
  requireBytes(box, version === 1 ? 32 : 20);
  const timescale = version === 1 ? u32(bytes, box.bodyStart + 20) : u32(bytes, box.bodyStart + 12);
  const duration = version === 1 ? safeU64(bytes, box.bodyStart + 24, box.start) : u32(bytes, box.bodyStart + 16);
  if (timescale <= 0) throw new IsoProblem('MALFORMED', 'ISOBMFF_MOVIE_TIMESCALE_INVALID', 'mvhd timescale must be positive', box.start);
  return { timescale, duration };
}

function parseTrack(bytes: Uint8Array, trak: Box, movieTimescale: number): IsoBmffTrackTimeline {
  const children = boxes(bytes, trak.bodyStart, trak.end);
  const tkhd = children.find((box) => box.type === 'tkhd');
  const mdia = children.find((box) => box.type === 'mdia');
  if (!tkhd || !mdia) throw new IsoProblem('MALFORMED', 'ISOBMFF_TRACK_HEADER_MISSING', 'trak lacks tkhd or mdia', trak.start);
  const trackId = fullBoxVersion(bytes, tkhd) === 1 ? u32(bytes, tkhd.bodyStart + 20) : u32(bytes, tkhd.bodyStart + 12);
  if (trackId <= 0) throw new IsoProblem('MALFORMED', 'ISOBMFF_TRACK_ID_INVALID', 'track id must be positive', tkhd.start);
  const mdiaChildren = boxes(bytes, mdia.bodyStart, mdia.end);
  const mdhd = mdiaChildren.find((box) => box.type === 'mdhd');
  const hdlr = mdiaChildren.find((box) => box.type === 'hdlr');
  const minf = mdiaChildren.find((box) => box.type === 'minf');
  if (!mdhd || !hdlr || !minf) throw new IsoProblem('MALFORMED', 'ISOBMFF_MEDIA_HEADER_MISSING', `track ${trackId} lacks mdhd/hdlr/minf`, mdia.start);
  const mediaHeader = parseMediaHeader(bytes, mdhd);
  const handler = fourcc(bytes, hdlr.bodyStart + 8);
  const type = handler === 'vide' ? 'video' : handler === 'soun' ? 'audio' : 'other';
  const stbl = boxes(bytes, minf.bodyStart, minf.end).find((box) => box.type === 'stbl');
  if (!stbl) throw new IsoProblem('MALFORMED', 'ISOBMFF_SAMPLE_TABLE_MISSING', `track ${trackId} has no sample table`, minf.start);
  const table = boxes(bytes, stbl.bodyStart, stbl.end);
  const rawSamples = parseRawSamples(bytes, table, trackId);
  const edits = parseEdits(bytes, children.find((box) => box.type === 'edts'));
  const mapped = mapSamplesThroughEdits(rawSamples, edits, movieTimescale, mediaHeader.timescale, trackId);
  if (mapped.length === 0) {
    throw new IsoProblem('UNSUPPORTED_STRUCTURE', 'ISOBMFF_PRESENTED_SAMPLES_EMPTY', `track ${trackId} has no samples after edit-list mapping`, trak.start);
  }
  const stsd = table.find((box) => box.type === 'stsd');
  const codec = stsd ? codecFromStsd(bytes, stsd) : null;
  const emptyLeadingEditTicks = leadingEmptyEditTicks(edits);
  const firstMediaTimeTicks = edits.find((entry) => entry.mediaTimeTicks >= 0)?.mediaTimeTicks ?? 0;
  return Object.freeze({
    trackId,
    type,
    codec,
    mediaTimescale: mediaHeader.timescale,
    mediaDurationTicks: mediaHeader.duration,
    codedSampleCount: rawSamples.length,
    edits: Object.freeze(edits),
    samples: Object.freeze(mapped),
    emptyLeadingEditUs: ticksToUs(emptyLeadingEditTicks, movieTimescale),
    firstMediaTimeTicks,
    presentationStartUs: Math.min(...mapped.map((sample) => sample.presentationStartUs)),
    presentationEndUs: Math.max(...mapped.map((sample) => sample.presentationEndUs)),
    rotationDegrees: rotationFromTkhd(bytes, tkhd),
  });
}

function parseMediaHeader(bytes: Uint8Array, box: Box): { timescale: number; duration: number } {
  const version = fullBoxVersion(bytes, box);
  requireBytes(box, version === 1 ? 32 : 20);
  const timescale = version === 1 ? u32(bytes, box.bodyStart + 20) : u32(bytes, box.bodyStart + 12);
  const duration = version === 1 ? safeU64(bytes, box.bodyStart + 24, box.start) : u32(bytes, box.bodyStart + 16);
  if (timescale <= 0) throw new IsoProblem('MALFORMED', 'ISOBMFF_MEDIA_TIMESCALE_INVALID', 'mdhd timescale must be positive', box.start);
  return { timescale, duration };
}

function parseRawSamples(bytes: Uint8Array, table: readonly Box[], trackId: number): RawSample[] {
  const stts = table.find((box) => box.type === 'stts');
  const stsz = table.find((box) => box.type === 'stsz');
  if (!stts || !stsz) {
    throw new IsoProblem(
      'UNSUPPORTED_STRUCTURE',
      'ISOBMFF_PROGRESSIVE_SAMPLE_TIMING_MISSING',
      `track ${trackId} needs complete stts/stsz timing (fragment-only timing is a separate reader)`,
    );
  }
  requireBytes(stsz, 12);
  const constantSampleSize = u32(bytes, stsz.bodyStart + 4);
  const sampleCount = u32(bytes, stsz.bodyStart + 8);
  if (sampleCount === 0 || sampleCount > 10_000_000) {
    throw new IsoProblem('MALFORMED', 'ISOBMFF_SAMPLE_COUNT_INVALID', `track ${trackId} sample_count=${sampleCount}`, stsz.start);
  }
  if (constantSampleSize === 0) {
    if (stsz.bodyStart + 12 + sampleCount * 4 > stsz.end) {
      throw new IsoProblem('INCOMPLETE', 'ISOBMFF_STSZ_TRUNCATED', `track ${trackId} sample-size table is incomplete`, stsz.start);
    }
    for (let index = 0; index < sampleCount; index++) {
      if (u32(bytes, stsz.bodyStart + 12 + index * 4) === 0) {
        throw new IsoProblem('MALFORMED', 'ISOBMFF_SAMPLE_SIZE_INVALID', `track ${trackId} sample ${index} has zero size`, stsz.start);
      }
    }
  }
  const durations = expandTimeRuns(bytes, stts, sampleCount, false, 'STTS');
  const ctts = table.find((box) => box.type === 'ctts');
  const offsets = ctts ? expandTimeRuns(bytes, ctts, sampleCount, fullBoxVersion(bytes, ctts) === 1, 'CTTS') : new Array<number>(sampleCount).fill(0);
  const stss = table.find((box) => box.type === 'stss');
  const syncSamples = stss ? parseSyncSamples(bytes, stss, sampleCount) : undefined;
  const samples: RawSample[] = [];
  let decodeStart = 0;
  for (let index = 0; index < sampleCount; index++) {
    const duration = durations[index]!;
    const compositionStart = decodeStart + offsets[index]!;
    samples.push({
      sampleIndex: index,
      decodeStart,
      compositionStart,
      duration,
      sync: syncSamples?.has(index + 1) ?? true,
    });
    decodeStart += duration;
  }
  return samples;
}

function expandTimeRuns(
  bytes: Uint8Array,
  box: Box,
  sampleCount: number,
  signedValue: boolean,
  label: string,
): number[] {
  requireBytes(box, 8);
  const count = u32(bytes, box.bodyStart + 4);
  if (count > sampleCount || box.bodyStart + 8 + count * 8 > box.end) {
    throw new IsoProblem('INCOMPLETE', `ISOBMFF_${label}_TRUNCATED`, `${label} run table is incomplete`, box.start);
  }
  const out: number[] = [];
  let cursor = box.bodyStart + 8;
  for (let index = 0; index < count; index++) {
    const runCount = u32(bytes, cursor);
    const value = signedValue ? i32(bytes, cursor + 4) : u32(bytes, cursor + 4);
    if (runCount === 0 || (label === 'STTS' && value <= 0) || out.length + runCount > sampleCount) {
      throw new IsoProblem('MALFORMED', `ISOBMFF_${label}_RUN_INVALID`, `${label} run ${index} is invalid`, cursor);
    }
    for (let sample = 0; sample < runCount; sample++) out.push(value);
    cursor += 8;
  }
  if (out.length !== sampleCount) {
    throw new IsoProblem('INCOMPLETE', `ISOBMFF_${label}_COVERAGE_INCOMPLETE`, `${label} covers ${out.length}/${sampleCount} samples`, box.start);
  }
  return out;
}

function parseSyncSamples(bytes: Uint8Array, box: Box, sampleCount: number): Set<number> {
  requireBytes(box, 8);
  const count = u32(bytes, box.bodyStart + 4);
  if (box.bodyStart + 8 + count * 4 > box.end) {
    throw new IsoProblem('INCOMPLETE', 'ISOBMFF_STSS_TRUNCATED', 'sync-sample table is incomplete', box.start);
  }
  const sync = new Set<number>();
  for (let index = 0; index < count; index++) {
    const value = u32(bytes, box.bodyStart + 8 + index * 4);
    if (value <= 0 || value > sampleCount) throw new IsoProblem('MALFORMED', 'ISOBMFF_STSS_INDEX_INVALID', `sync sample ${value} is out of range`, box.start);
    sync.add(value);
  }
  return sync;
}

function parseEdits(bytes: Uint8Array, edts: Box | undefined): IsoBmffEdit[] {
  if (!edts) return [];
  const elst = boxes(bytes, edts.bodyStart, edts.end).find((box) => box.type === 'elst');
  if (!elst) throw new IsoProblem('MALFORMED', 'ISOBMFF_ELST_MISSING', 'edts contains no elst', edts.start);
  const version = fullBoxVersion(bytes, elst);
  requireBytes(elst, 8);
  const count = u32(bytes, elst.bodyStart + 4);
  const width = version === 1 ? 20 : 12;
  if (count === 0 || count > 1024 || elst.bodyStart + 8 + count * width > elst.end) {
    throw new IsoProblem('INCOMPLETE', 'ISOBMFF_ELST_TRUNCATED', 'edit-list entries are incomplete', elst.start);
  }
  const edits: IsoBmffEdit[] = [];
  let cursor = elst.bodyStart + 8;
  for (let index = 0; index < count; index++) {
    const segmentDurationMovieTicks = version === 1 ? safeU64(bytes, cursor, elst.start) : u32(bytes, cursor);
    const mediaTimeTicks = version === 1 ? safeI64(bytes, cursor + 8, elst.start) : i32(bytes, cursor + 4);
    const rateOffset = cursor + (version === 1 ? 16 : 8);
    const mediaRateInteger = i16(bytes, rateOffset);
    const mediaRateFraction = i16(bytes, rateOffset + 2);
    if (segmentDurationMovieTicks <= 0) throw new IsoProblem('MALFORMED', 'ISOBMFF_ELST_DURATION_INVALID', `edit ${index} has zero duration`, cursor);
    if (mediaTimeTicks < -1) throw new IsoProblem('MALFORMED', 'ISOBMFF_ELST_MEDIA_TIME_INVALID', `edit ${index} media_time=${mediaTimeTicks}`, cursor);
    if (mediaRateInteger !== 1 || mediaRateFraction !== 0) {
      throw new IsoProblem('UNSUPPORTED_STRUCTURE', 'ISOBMFF_ELST_RATE_UNSUPPORTED', `edit ${index} rate is ${mediaRateInteger}+${mediaRateFraction}/65536`, cursor);
    }
    edits.push({ segmentDurationMovieTicks, mediaTimeTicks, mediaRateInteger, mediaRateFraction });
    cursor += width;
  }
  return edits;
}

function mapSamplesThroughEdits(
  raw: readonly RawSample[],
  edits: readonly IsoBmffEdit[],
  movieTimescale: number,
  mediaTimescale: number,
  trackId: number,
): IsoBmffSampleInterval[] {
  if (edits.length === 0) {
    return raw.map((sample) => mappedSample(sample, sample.compositionStart, sample.compositionStart + sample.duration, 0, 0, movieTimescale, mediaTimescale));
  }
  const mapped: IsoBmffSampleInterval[] = [];
  let movieCursor = 0;
  for (const edit of edits) {
    if (edit.mediaTimeTicks === -1) {
      movieCursor += edit.segmentDurationMovieTicks;
      continue;
    }
    const mediaStart = edit.mediaTimeTicks;
    const mediaEnd = mediaStart + edit.segmentDurationMovieTicks * mediaTimescale / movieTimescale;
    for (const sample of raw) {
      const sampleEnd = sample.compositionStart + sample.duration;
      const start = Math.max(sample.compositionStart, mediaStart);
      const end = Math.min(sampleEnd, mediaEnd);
      if (start >= end) continue;
      mapped.push(mappedSample(sample, start, end, movieCursor, mediaStart, movieTimescale, mediaTimescale));
    }
    movieCursor += edit.segmentDurationMovieTicks;
  }
  const seen = new Set<string>();
  for (const sample of mapped) {
    const identity = `${sample.sampleIndex}:${sample.presentationStartUs}:${sample.presentationEndUs}`;
    if (seen.has(identity)) throw new IsoProblem('UNSUPPORTED_STRUCTURE', 'ISOBMFF_REPEATED_EDIT_UNSUPPORTED', `track ${trackId} repeats a presentation sample through edits`);
    seen.add(identity);
  }
  return mapped.sort((a, b) => a.presentationStartUs - b.presentationStartUs || a.sampleIndex - b.sampleIndex);
}

function mappedSample(
  sample: RawSample,
  clippedMediaStart: number,
  clippedMediaEnd: number,
  movieCursor: number,
  editMediaStart: number,
  movieTimescale: number,
  mediaTimescale: number,
): IsoBmffSampleInterval {
  const movieStart = movieCursor + (clippedMediaStart - editMediaStart) * movieTimescale / mediaTimescale;
  const movieEnd = movieCursor + (clippedMediaEnd - editMediaStart) * movieTimescale / mediaTimescale;
  return Object.freeze({
    sampleIndex: sample.sampleIndex,
    decodeStartMediaTicks: sample.decodeStart,
    compositionStartMediaTicks: sample.compositionStart,
    durationMediaTicks: sample.duration,
    presentationStartUs: ticksToUs(movieStart, movieTimescale),
    presentationEndUs: ticksToUs(movieEnd, movieTimescale),
    sync: sample.sync,
  });
}

function codecFromStsd(bytes: Uint8Array, stsd: Box): string | null {
  requireBytes(stsd, 16);
  const entryCount = u32(bytes, stsd.bodyStart + 4);
  if (entryCount === 0) return null;
  const raw = fourcc(bytes, stsd.bodyStart + 12).toLowerCase();
  if (raw === 'avc1' || raw === 'avc3') return 'h264';
  if (raw === 'hvc1' || raw === 'hev1') return 'hevc';
  if (raw === 'mp4a') return 'aac';
  if (raw === 'opus') return 'opus';
  if (raw === 'flac') return 'flac';
  if (raw === '.mp3') return 'mp3';
  return raw || null;
}

function rotationFromTkhd(bytes: Uint8Array, tkhd: Box): 0 | 90 | 180 | 270 | null {
  const offset = tkhd.bodyStart + (fullBoxVersion(bytes, tkhd) === 1 ? 52 : 40);
  if (offset + 36 > tkhd.end) return null;
  const a = fixed16(bytes, offset);
  const b = fixed16(bytes, offset + 4);
  const c = fixed16(bytes, offset + 12);
  const d = fixed16(bytes, offset + 16);
  const close = (actual: number, expected: number) => Math.abs(actual - expected) <= 1 / 65536;
  if (close(a, 1) && close(b, 0) && close(c, 0) && close(d, 1)) return 0;
  if (close(a, 0) && close(b, 1) && close(c, -1) && close(d, 0)) return 90;
  if (close(a, -1) && close(b, 0) && close(c, 0) && close(d, -1)) return 180;
  if (close(a, 0) && close(b, -1) && close(c, 1) && close(d, 0)) return 270;
  return null;
}

function leadingEmptyEditTicks(edits: readonly IsoBmffEdit[]): number {
  let ticks = 0;
  for (const edit of edits) {
    if (edit.mediaTimeTicks !== -1) break;
    ticks += edit.segmentDurationMovieTicks;
  }
  return ticks;
}

function boxes(bytes: Uint8Array, start: number, end: number): Box[] {
  const result: Box[] = [];
  let offset = start;
  while (offset < end) {
    if (offset + 8 > end) throw new IsoProblem('INCOMPLETE', 'ISOBMFF_BOX_HEADER_TRUNCATED', 'box header is truncated', offset);
    let size = u32(bytes, offset);
    const type = fourcc(bytes, offset + 4);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) throw new IsoProblem('INCOMPLETE', 'ISOBMFF_LARGE_SIZE_TRUNCATED', `${type} large-size header is truncated`, offset);
      size = safeU64(bytes, offset + 8, offset);
      header = 16;
    } else if (size === 0) size = end - offset;
    if (size < header || offset + size > end) {
      throw new IsoProblem('INCOMPLETE', 'ISOBMFF_BOX_SIZE_INVALID', `${type} box exceeds its parent`, offset);
    }
    result.push({ type, start: offset, bodyStart: offset + header, end: offset + size });
    offset += size;
  }
  return result;
}

function fullBoxVersion(bytes: Uint8Array, box: Box): number {
  requireBytes(box, 1);
  const version = bytes[box.bodyStart]!;
  if (version !== 0 && version !== 1) throw new IsoProblem('UNSUPPORTED_STRUCTURE', 'ISOBMFF_FULLBOX_VERSION_UNSUPPORTED', `${box.type} version ${version} is unsupported`, box.start);
  return version;
}

function requireBytes(box: Box, bodyBytes: number): void {
  if (box.bodyStart + bodyBytes > box.end) throw new IsoProblem('INCOMPLETE', 'ISOBMFF_BOX_BODY_TRUNCATED', `${box.type} body is truncated`, box.start);
}

function issue(
  state: Exclude<IsoBmffTimelineReadResult['state'], 'OK'>,
  reasonCode: string,
  detail: string,
  offset?: number,
): IsoBmffTimelineReadResult {
  return Object.freeze({ state, reasonCode, detail, ...(offset !== undefined ? { offset } : {}) });
}

function ticksToUs(value: number, timescale: number): number {
  return Math.round(value * 1_000_000 / timescale);
}

function fourcc(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset] ?? 0, bytes[offset + 1] ?? 0, bytes[offset + 2] ?? 0, bytes[offset + 3] ?? 0);
}

function u16(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function i16(bytes: Uint8Array, offset: number): number {
  const value = u16(bytes, offset);
  return value & 0x8000 ? value - 0x1_0000 : value;
}

function u32(bytes: Uint8Array, offset: number): number {
  return ((((bytes[offset] ?? 0) << 24) >>> 0) | ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0)) >>> 0;
}

function i32(bytes: Uint8Array, offset: number): number {
  return u32(bytes, offset) | 0;
}

function fixed16(bytes: Uint8Array, offset: number): number {
  return i32(bytes, offset) / 65536;
}

function safeU64(bytes: Uint8Array, offset: number, problemOffset: number): number {
  let value = 0n;
  for (let index = 0; index < 8; index++) value = (value << 8n) | BigInt(bytes[offset + index] ?? 0);
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new IsoProblem('UNSUPPORTED_STRUCTURE', 'ISOBMFF_INTEGER_TOO_LARGE', '64-bit unsigned integer exceeds safe range', problemOffset);
  return number;
}

function safeI64(bytes: Uint8Array, offset: number, problemOffset: number): number {
  let value = 0n;
  for (let index = 0; index < 8; index++) value = (value << 8n) | BigInt(bytes[offset + index] ?? 0);
  if ((value & (1n << 63n)) !== 0n) value -= 1n << 64n;
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new IsoProblem('UNSUPPORTED_STRUCTURE', 'ISOBMFF_INTEGER_TOO_LARGE', '64-bit signed integer exceeds safe range', problemOffset);
  return number;
}
