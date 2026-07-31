import {
  MAX_REMUX_SAMPLES,
  MAX_REMUX_TRACKS,
  ascii,
  canonicalCodec,
  i16be,
  safeSlice,
} from './binary.ts';
import type { RemuxProgramEvidence, RemuxReadResult, RemuxSampleEvidence, RemuxTrackEvidence } from './types.ts';

interface Vint {
  value: number;
  length: number;
  unknown: boolean;
}

interface Element {
  id: number;
  start: number;
  body: number;
  end: number;
  unknown: boolean;
}

interface TrackInfo extends Omit<RemuxTrackEvidence, 'samples'> {
  number: number;
  defaultDurationUs?: number;
}

const ID = {
  Segment: 0x18538067,
  Info: 0x1549a966,
  TimecodeScale: 0x2ad7b1,
  Duration: 0x4489,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackNumber: 0xd7,
  TrackUid: 0x73c5,
  TrackType: 0x83,
  CodecId: 0x86,
  CodecPrivate: 0x63a2,
  Language: 0x22b59c,
  LanguageIetf: 0x22b59d,
  Name: 0x536e,
  DefaultDuration: 0x23e383,
  Video: 0xe0,
  PixelWidth: 0xb0,
  PixelHeight: 0xba,
  Audio: 0xe1,
  SamplingFrequency: 0xb5,
  Channels: 0x9f,
  Cluster: 0x1f43b675,
  Timestamp: 0xe7,
  SimpleBlock: 0xa3,
  BlockGroup: 0xa0,
  Block: 0xa1,
  BlockDuration: 0x9b,
  ReferenceBlock: 0xfb,
} as const;

function vint(bytes: Uint8Array, offset: number, keepMarker: boolean): Vint | undefined {
  if (offset >= bytes.byteLength) return undefined;
  const first = bytes[offset]!;
  let mask = 0x80;
  let length = 1;
  while (length <= 8 && (first & mask) === 0) { mask >>= 1; length++; }
  if (length > 8 || offset + length > bytes.byteLength) return undefined;
  const unknown = !keepMarker && (first & (mask - 1)) === mask - 1 &&
    Array.from(bytes.subarray(offset + 1, offset + length)).every((byte) => byte === 0xff);
  if (unknown) return { value: 0, length, unknown: true };
  let value = keepMarker ? first : first & (mask - 1);
  for (let i = 1; i < length; i++) value = value * 256 + bytes[offset + i]!;
  if (!Number.isSafeInteger(value)) return undefined;
  return { value, length, unknown: false };
}

function element(bytes: Uint8Array, offset: number, parentEnd: number): Element | undefined {
  const id = vint(bytes, offset, true);
  if (!id) return undefined;
  const size = vint(bytes, offset + id.length, false);
  if (!size) return undefined;
  const body = offset + id.length + size.length;
  const end = size.unknown ? parentEnd : body + size.value;
  if (end < body || end > parentEnd) return undefined;
  return { id: id.value, start: offset, body, end, unknown: size.unknown };
}

function children(bytes: Uint8Array, start: number, end: number, limit = 5_000_000): Element[] | undefined {
  const out: Element[] = [];
  let offset = start;
  while (offset < end) {
    if (out.length >= limit) return undefined;
    const item = element(bytes, offset, end);
    if (!item || item.end <= offset) return undefined;
    out.push(item);
    offset = item.end;
  }
  return offset === end ? out : undefined;
}

const LEVEL_ONE_IDS = new Set([
  0x114d9b74, // SeekHead
  ID.Info,
  ID.Tracks,
  ID.Cluster,
  0x1c53bb6b, // Cues
  0x1941a469, // Attachments
  0x1043a770, // Chapters
  0x1254c367, // Tags
]);

function unknownClusterEnd(bytes: Uint8Array, start: number, end: number): number | undefined {
  let offset = start;
  while (offset < end) {
    const item = element(bytes, offset, end);
    if (!item) return undefined;
    if (LEVEL_ONE_IDS.has(item.id)) return offset;
    if (item.unknown || item.end <= offset) return undefined;
    offset = item.end;
  }
  return offset;
}

/** Unknown-size clusters end at the next level-1 element, as required by live WebM. */
function segmentChildren(bytes: Uint8Array, segment: Element): Element[] | undefined {
  const out: Element[] = [];
  let offset = segment.body;
  while (offset < segment.end) {
    if (out.length >= 5_000_000) return undefined;
    const item = element(bytes, offset, segment.end);
    if (!item) return undefined;
    if (item.unknown && item.id !== ID.Cluster) return undefined;
    if (item.unknown) {
      const next = unknownClusterEnd(bytes, item.body, segment.end);
      if (next === undefined) return undefined;
      const bounded = { ...item, end: next };
      if (bounded.end <= bounded.body) return undefined;
      out.push(bounded);
      offset = bounded.end;
    } else {
      out.push(item);
      offset = item.end;
    }
  }
  return offset === segment.end ? out : undefined;
}

function uint(bytes: Uint8Array, item: Element): number | undefined {
  const length = item.end - item.body;
  if (length < 1 || length > 8) return undefined;
  let value = 0;
  for (let i = item.body; i < item.end; i++) value = value * 256 + bytes[i]!;
  return Number.isSafeInteger(value) ? value : undefined;
}

function float(bytes: Uint8Array, item: Element): number | undefined {
  const length = item.end - item.body;
  const view = new DataView(bytes.buffer, bytes.byteOffset + item.body, length);
  const value = length === 4 ? view.getFloat32(0) : length === 8 ? view.getFloat64(0) : undefined;
  return value !== undefined && Number.isFinite(value) ? value : undefined;
}

function text(bytes: Uint8Array, item: Element): string {
  return new TextDecoder().decode(bytes.subarray(item.body, item.end)).replace(/\0+$/g, '');
}

function child(items: readonly Element[], id: number): Element | undefined {
  return items.find((item) => item.id === id);
}

function parseTrack(bytes: Uint8Array, entry: Element): TrackInfo | undefined {
  const items = children(bytes, entry.body, entry.end, 10_000);
  if (!items) return undefined;
  const numberEl = child(items, ID.TrackNumber);
  const typeEl = child(items, ID.TrackType);
  const codecEl = child(items, ID.CodecId);
  if (!numberEl || !typeEl || !codecEl) return undefined;
  const number = uint(bytes, numberEl);
  const typeValue = uint(bytes, typeEl);
  if (!number || !typeValue) return undefined;
  const type: TrackInfo['type'] = typeValue === 1 ? 'video' : typeValue === 2 ? 'audio' : typeValue === 17 ? 'subtitle' : 'other';
  const codec = canonicalCodec(text(bytes, codecEl));
  const uid = child(items, ID.TrackUid);
  const languageEl = child(items, ID.LanguageIetf) ?? child(items, ID.Language);
  const roleEl = child(items, ID.Name);
  const privateEl = child(items, ID.CodecPrivate);
  const defaultDuration = child(items, ID.DefaultDuration);
  const video = child(items, ID.Video);
  const audio = child(items, ID.Audio);
  let width: number | undefined;
  let height: number | undefined;
  if (video) {
    const videoItems = children(bytes, video.body, video.end, 100);
    const widthEl = videoItems && child(videoItems, ID.PixelWidth);
    const heightEl = videoItems && child(videoItems, ID.PixelHeight);
    width = widthEl ? uint(bytes, widthEl) : undefined;
    height = heightEl ? uint(bytes, heightEl) : undefined;
  }
  let sampleRate: number | undefined;
  let channels: number | undefined;
  if (audio) {
    const audioItems = children(bytes, audio.body, audio.end, 100);
    const rateEl = audioItems && child(audioItems, ID.SamplingFrequency);
    const channelsEl = audioItems && child(audioItems, ID.Channels);
    sampleRate = rateEl ? float(bytes, rateEl) : undefined;
    channels = channelsEl ? uint(bytes, channelsEl) : undefined;
  }
  const uidValue = uid ? uint(bytes, uid) : undefined;
  const defaultNs = defaultDuration ? uint(bytes, defaultDuration) : undefined;
  const language = languageEl ? text(bytes, languageEl) : undefined;
  return {
    number,
    id: `ebml:${uidValue ?? number}`,
    type,
    codec,
    ...(language && language !== 'und' ? { language } : {}),
    ...(roleEl ? { role: text(bytes, roleEl) } : {}),
    ...(width ? { width } : {}), ...(height ? { height } : {}),
    ...(sampleRate ? { sampleRate } : {}), ...(channels ? { channels } : {}),
    ...(privateEl ? { codecPrivate: bytes.subarray(privateEl.body, privateEl.end) } : {}),
    ...(defaultNs ? { defaultDurationUs: defaultNs / 1000 } : {}),
  };
}

function signedEbml(value: number, length: number): number {
  return value - (2 ** (7 * length - 1) - 1);
}

function lacedFrames(bytes: Uint8Array, start: number, end: number, mode: number): Array<{ start: number; end: number }> | undefined {
  if (mode === 0) return start < end ? [{ start, end }] : undefined;
  if (start >= end) return undefined;
  const count = bytes[start]! + 1;
  if (count < 2 || count > 256) return undefined;
  let at = start + 1;
  const sizes: number[] = [];
  if (mode === 1) {
    for (let frame = 0; frame < count - 1; frame++) {
      let size = 0;
      for (;;) {
        if (at >= end) return undefined;
        const value = bytes[at++]!;
        size += value;
        if (value !== 255) break;
      }
      sizes.push(size);
    }
  } else if (mode === 2) {
    const payload = end - at;
    if (payload % count !== 0) return undefined;
    for (let frame = 0; frame < count - 1; frame++) sizes.push(payload / count);
  } else {
    const first = vint(bytes, at, false);
    if (!first || first.unknown) return undefined;
    sizes.push(first.value);
    at += first.length;
    for (let frame = 1; frame < count - 1; frame++) {
      const delta = vint(bytes, at, false);
      if (!delta || delta.unknown) return undefined;
      const next = sizes[frame - 1]! + signedEbml(delta.value, delta.length);
      if (next < 0) return undefined;
      sizes.push(next);
      at += delta.length;
    }
  }
  const used = sizes.reduce((sum, size) => sum + size, 0);
  const last = end - at - used;
  if (last < 0) return undefined;
  sizes.push(last);
  const spans: Array<{ start: number; end: number }> = [];
  for (const size of sizes) {
    if (size <= 0 || at + size > end) return undefined;
    spans.push({ start: at, end: at + size });
    at += size;
  }
  return at === end ? spans : undefined;
}

function parseBlock(
  bytes: Uint8Array,
  item: Element,
  clusterTimestamp: number,
  timecodeScale: number,
  track: TrackInfo,
  keyframe: boolean | undefined,
  blockDurationTicks?: number,
): RemuxSampleEvidence[] | undefined {
  const trackVint = vint(bytes, item.body, false);
  if (!trackVint || trackVint.unknown || trackVint.value !== track.number) return undefined;
  const header = item.body + trackVint.length;
  if (header + 3 > item.end) return undefined;
  const relative = i16be(bytes, header);
  const flags = bytes[header + 2]!;
  const lacing = (flags >> 1) & 3;
  const frames = lacedFrames(bytes, header + 3, item.end, lacing);
  if (!frames) return undefined;
  const basePtsUs = Math.round(((clusterTimestamp + relative) * timecodeScale) / 1000);
  const totalDurationUs = blockDurationTicks !== undefined
    ? (blockDurationTicks * timecodeScale) / 1000
    : track.defaultDurationUs !== undefined
      ? track.defaultDurationUs * frames.length
      : undefined;
  const eachDurationUs = totalDurationUs !== undefined ? totalDurationUs / frames.length : undefined;
  return frames.map((span, index) => ({
    payload: bytes.subarray(span.start, span.end),
    ptsUs: Math.round(basePtsUs + (eachDurationUs ?? 0) * index),
    ...(eachDurationUs !== undefined ? { durationUs: Math.round(eachDurationUs) } : {}),
    ...(keyframe !== undefined ? { keyframe } : {}),
    fileOffset: span.start,
    framing: track.codec === 'h264' || track.codec === 'hevc' ? 'length-prefixed' : 'raw',
  }));
}

export function readEbmlProgram(bytes: Uint8Array, hint = 'webm'): RemuxReadResult {
  const container = hint.toLowerCase() === 'mkv' || hint.toLowerCase() === 'matroska' ? 'mkv' : 'webm';
  const evidence = { reader: 'ebml-payload', byteLength: bytes?.byteLength ?? 0, detectedContainer: container } as const;
  try {
    if (!bytes || bytes.byteLength < 8) return { state: 'INCOMPLETE', reasonCode: 'REMUX_EBML_INPUT_INCOMPLETE', evidence };
    if (bytes[0] !== 0x1a || bytes[1] !== 0x45 || bytes[2] !== 0xdf || bytes[3] !== 0xa3) {
      return { state: 'MALFORMED', reasonCode: 'REMUX_EBML_HEADER_INVALID', evidence };
    }
    const top = children(bytes, 0, bytes.byteLength, 10_000);
    if (!top) return { state: 'INCOMPLETE', reasonCode: 'REMUX_EBML_ELEMENT_INCOMPLETE', evidence };
    const segment = child(top, ID.Segment);
    if (!segment) return { state: 'MALFORMED', reasonCode: 'REMUX_EBML_SEGMENT_MISSING', evidence };
    const segmentItems = segmentChildren(bytes, segment);
    if (!segmentItems) return { state: 'INCOMPLETE', reasonCode: 'REMUX_EBML_SEGMENT_INCOMPLETE', evidence };
    const info = child(segmentItems, ID.Info);
    const tracksEl = child(segmentItems, ID.Tracks);
    if (!tracksEl) return { state: 'MALFORMED', reasonCode: 'REMUX_EBML_TRACKS_MISSING', evidence };
    let timecodeScale = 1_000_000;
    let declaredDurationUs: number | undefined;
    if (info) {
      const infoItems = children(bytes, info.body, info.end, 1000);
      if (!infoItems) return { state: 'MALFORMED', reasonCode: 'REMUX_EBML_INFO_INVALID', evidence };
      const scaleEl = child(infoItems, ID.TimecodeScale);
      const durationEl = child(infoItems, ID.Duration);
      timecodeScale = scaleEl ? uint(bytes, scaleEl) ?? timecodeScale : timecodeScale;
      const duration = durationEl ? float(bytes, durationEl) : undefined;
      if (duration !== undefined) declaredDurationUs = Math.round((duration * timecodeScale) / 1000);
    }
    const trackItems = children(bytes, tracksEl.body, tracksEl.end, 10_000);
    if (!trackItems) return { state: 'MALFORMED', reasonCode: 'REMUX_EBML_TRACKS_INVALID', evidence };
    const trackInfos = trackItems.filter((item) => item.id === ID.TrackEntry).map((entry) => parseTrack(bytes, entry));
    if (trackInfos.length === 0 || trackInfos.length > MAX_REMUX_TRACKS || trackInfos.some((track) => !track)) {
      return { state: 'MALFORMED', reasonCode: 'REMUX_EBML_TRACK_ENTRY_INVALID', evidence };
    }
    const tracks = trackInfos as TrackInfo[];
    const samples = new Map<number, RemuxSampleEvidence[]>();
    let lacing = false;
    for (const cluster of segmentItems.filter((item) => item.id === ID.Cluster)) {
      const clusterItems = children(bytes, cluster.body, cluster.end);
      if (!clusterItems) return { state: 'INCOMPLETE', reasonCode: 'REMUX_EBML_CLUSTER_INCOMPLETE', evidence };
      const timestampEl = child(clusterItems, ID.Timestamp);
      const clusterTimestamp = timestampEl ? uint(bytes, timestampEl) : undefined;
      if (clusterTimestamp === undefined) return { state: 'MALFORMED', reasonCode: 'REMUX_EBML_CLUSTER_TIMESTAMP_MISSING', evidence };
      for (const item of clusterItems) {
        let block: Element | undefined;
        let keyframe: boolean | undefined;
        let blockDuration: number | undefined;
        if (item.id === ID.SimpleBlock) {
          block = item;
          const trackVint = vint(bytes, block.body, false);
          if (!trackVint || block.body + trackVint.length + 3 > block.end) return { state: 'MALFORMED', reasonCode: 'REMUX_EBML_BLOCK_HEADER_INVALID', evidence };
          keyframe = (bytes[block.body + trackVint.length + 2]! & 0x80) !== 0;
          if (((bytes[block.body + trackVint.length + 2]! >> 1) & 3) !== 0) lacing = true;
        } else if (item.id === ID.BlockGroup) {
          const group = children(bytes, item.body, item.end, 10_000);
          if (!group) return { state: 'MALFORMED', reasonCode: 'REMUX_EBML_BLOCK_GROUP_INVALID', evidence };
          block = child(group, ID.Block);
          keyframe = !child(group, ID.ReferenceBlock);
          const durationEl = child(group, ID.BlockDuration);
          blockDuration = durationEl ? uint(bytes, durationEl) : undefined;
        }
        if (!block) continue;
        const trackVint = vint(bytes, block.body, false);
        const track = trackVint && tracks.find((candidate) => candidate.number === trackVint.value);
        if (!track) return { state: 'MALFORMED', reasonCode: 'REMUX_EBML_BLOCK_TRACK_UNKNOWN', evidence };
        const parsed = parseBlock(bytes, block, clusterTimestamp, timecodeScale, track, keyframe, blockDuration);
        if (!parsed) return { state: 'MALFORMED', reasonCode: 'REMUX_EBML_BLOCK_INVALID', evidence };
        const list = samples.get(track.number) ?? [];
        if (list.length + parsed.length > MAX_REMUX_SAMPLES) return { state: 'MALFORMED', reasonCode: 'REMUX_EBML_SAMPLE_COUNT_EXCESSIVE', evidence };
        list.push(...parsed);
        samples.set(track.number, list);
      }
    }
    if ([...samples.values()].every((list) => list.length === 0)) return { state: 'INCOMPLETE', reasonCode: 'REMUX_EBML_MEDIA_BLOCKS_MISSING', evidence };
    // Matroska/WebM exposes block order and presentation timestamps, but no independent numeric DTS
    // field. Preserve that provenance honestly: do not synthesize DTS=PTS or an invented cadence.
    const outputTracks: RemuxTrackEvidence[] = tracks.map(({ number, defaultDurationUs: _default, ...track }) => ({
      ...track, samples: samples.get(number) ?? [],
    }));
    if (outputTracks.some((track) => track.type === 'video' || track.type === 'audio' ? track.samples.length === 0 : false)) {
      return { state: 'INCOMPLETE', reasonCode: 'REMUX_EBML_TRACK_SAMPLES_MISSING', evidence };
    }
    let minimumPtsUs = Number.POSITIVE_INFINITY;
    let maximumEndUs = Number.NEGATIVE_INFINITY;
    for (const track of outputTracks) {
      for (const sample of track.samples) {
        if (sample.ptsUs === undefined) continue;
        minimumPtsUs = Math.min(minimumPtsUs, sample.ptsUs);
        maximumEndUs = Math.max(maximumEndUs, sample.ptsUs + (sample.durationUs ?? 0));
      }
    }
    const observedDurationUs = Number.isFinite(minimumPtsUs) && Number.isFinite(maximumEndUs)
      ? maximumEndUs - minimumPtsUs
      : undefined;
    let terminalIntervalUs = 0;
    let terminalDurationMissing = false;
    for (const track of outputTracks) {
      const timed = track.samples
        .filter((sample): sample is RemuxSampleEvidence & { ptsUs: number } => sample.ptsUs !== undefined)
        .sort((a, b) => a.ptsUs - b.ptsUs);
      const terminal = timed.at(-1);
      if (terminal && terminal.durationUs === undefined) terminalDurationMissing = true;
      if (timed.length >= 2) {
        terminalIntervalUs = Math.max(
          terminalIntervalUs,
          timed[timed.length - 1]!.ptsUs - timed[timed.length - 2]!.ptsUs,
        );
      }
    }
    const declaredMaterializesTerminalDuration =
      terminalDurationMissing &&
      declaredDurationUs !== undefined &&
      observedDurationUs !== undefined &&
      Math.abs(declaredDurationUs - observedDurationUs) <= Math.max(50_000, terminalIntervalUs) + 1_000;
    // A complete block walk is stronger stream-copy evidence than the optional Segment Duration
    // scalar, which real WebM files can carry stale or deliberately contradictory values for. A
    // nearby declaration can, however, materialize the unavailable duration of a terminal block.
    const durationUs = declaredMaterializesTerminalDuration
      ? declaredDurationUs
      : observedDurationUs !== undefined && observedDurationUs > 0
      ? observedDurationUs
      : declaredDurationUs;
    const parsedSamples = outputTracks.reduce((sum, track) => sum + track.samples.length, 0);
    const value: RemuxProgramEvidence = {
      schema: 'media-test/remux-program@1', container, byteLength: bytes.byteLength,
      ...(durationUs !== undefined ? { durationUs } : {}),
      tracks: outputTracks,
      representation: { lacing, unknownSizeSegment: segment.unknown },
    };
    return { state: 'OK', value, evidence: { ...evidence, parsedTracks: outputTracks.length, parsedSamples } };
  } catch (error) {
    const diagnostic =
      error instanceof Error
        ? `${error.name}: ${error.message}`.slice(0, 240)
        : String(error).slice(0, 240);
    return {
      state: 'MALFORMED',
      reasonCode: 'REMUX_EBML_PARSE_GUARD',
      evidence: { ...evidence, markers: [`guard:${diagnostic}`] },
    };
  }
}
