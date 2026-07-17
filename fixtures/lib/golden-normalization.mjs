/**
 * Versioned, fixture-location-independent golden normalization.
 *
 * Both offline bake entry points import this module. It intentionally contains no filesystem or
 * process access: the same probe JSON always yields the same canonical payload. Raw observations
 * remain alongside canonical semantic views so representation differences are never pre-collapsed.
 */

import { createHash } from 'node:crypto';

export const GOLDEN_NORMALIZATION_VERSION = 'golden-normalization@1';
export const FRAME_PLACEHOLDER_VERSION = 'frame-placeholder@1';
export const PACKET_SEMANTICS_VERSION = 'packet-semantics@1';
export const GOLDEN_METADATA_SCHEMA = 'media-test/golden-metadata@1';
export const GOLDEN_PACKETS_SCHEMA = 'media-test/golden-packets@1';
export const DEFAULT_FRAME_COUNT = 12;
export const DEFAULT_FRAME_READ_COUNT = 60;

const TRACK_TYPE_ORDER = new Map([
  ['video', 0],
  ['audio', 1],
  ['subtitle', 2],
  ['other', 3],
]);

const CODEC_ALIASES = new Map([
  ['h264', 'h264'],
  ['avc', 'h264'],
  ['avc1', 'h264'],
  ['avc3', 'h264'],
  ['v_mpeg4/iso/avc', 'h264'],
  ['hevc', 'hevc'],
  ['h265', 'hevc'],
  ['hvc1', 'hevc'],
  ['hev1', 'hevc'],
  ['v_mpegh/iso/hevc', 'hevc'],
  ['vp8', 'vp8'],
  ['vp08', 'vp8'],
  ['v_vp8', 'vp8'],
  ['vp9', 'vp9'],
  ['vp09', 'vp9'],
  ['v_vp9', 'vp9'],
  ['av1', 'av1'],
  ['av01', 'av1'],
  ['v_av1', 'av1'],
  ['aac', 'aac'],
  ['mp4a', 'aac'],
  ['a_aac', 'aac'],
  ['opus', 'opus'],
  ['a_opus', 'opus'],
  ['vorbis', 'vorbis'],
  ['a_vorbis', 'vorbis'],
  ['mp3', 'mp3'],
  ['.mp3', 'mp3'],
  ['a_mpeg/l3', 'mp3'],
  ['flac', 'flac'],
  ['a_flac', 'flac'],
  ['alac', 'alac'],
  ['pcm_s16le', 'pcm-s16'],
  ['pcm-s16', 'pcm-s16'],
  ['pcm_s24le', 'pcm-s24'],
  ['pcm-s24', 'pcm-s24'],
  ['pcm_f32le', 'pcm-f32'],
  ['pcm-f32', 'pcm-f32'],
  ['pcm_s16be', 'pcm-s16be'],
  ['pcm-s16be', 'pcm-s16be'],
  ['pcm_s24be', 'pcm-s24be'],
  ['pcm-s24be', 'pcm-s24be'],
  ['mjpeg', 'mjpeg'],
  ['mjpa', 'mjpeg'],
  ['mjpb', 'mjpeg'],
  ['jpeg', 'mjpeg'],
  ['png', 'png'],
  ['webp', 'webp'],
]);
const CANONICAL_CODEC_TOKENS = new Set(CODEC_ALIASES.values());

/** Canonical JSON used for recipe and payload identities. */
export function canonicalJson(value) {
  const active = new Set();
  const encode = (item, inArray = false) => {
    if (item === null) return 'null';
    if (typeof item === 'string' || typeof item === 'boolean') return JSON.stringify(item);
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new TypeError('canonicalJson rejects non-finite numbers');
      return JSON.stringify(Object.is(item, -0) ? 0 : item);
    }
    if (item === undefined) {
      if (inArray) throw new TypeError('canonicalJson rejects undefined array entries');
      return undefined;
    }
    if (typeof item !== 'object') throw new TypeError(`canonicalJson rejects ${typeof item}`);
    if (active.has(item)) throw new TypeError('canonicalJson rejects cyclic values');
    active.add(item);
    try {
      if (Array.isArray(item)) return `[${item.map((entry) => encode(entry, true)).join(',')}]`;
      const pairs = [];
      for (const key of Object.keys(item).sort()) {
        const encoded = encode(item[key], false);
        if (encoded !== undefined) pairs.push(`${JSON.stringify(key)}:${encoded}`);
      }
      return `{${pairs.join(',')}}`;
    } finally {
      active.delete(item);
    }
  };
  const encoded = encode(value, false);
  if (encoded === undefined) throw new TypeError('canonicalJson root cannot be undefined');
  return encoded;
}

export function sha256Hex(value) {
  const bytes = typeof value === 'string' ? Buffer.from(value) : Buffer.from(value);
  return createHash('sha256').update(bytes).digest('hex');
}

export function canonicalSha256(value) {
  return sha256Hex(canonicalJson(value));
}

/** Canonicalize WebCodecs strings, sample entries, Matroska CodecIDs, and ffprobe codec names. */
export function canonicalCodecToken(value) {
  const raw = String(value ?? '').trim();
  const lower = raw.toLowerCase();
  const prefix = lower.startsWith('avc1.')
    ? 'avc1'
    : lower.startsWith('avc3.')
      ? 'avc3'
      : lower.startsWith('hvc1.')
        ? 'hvc1'
        : lower.startsWith('hev1.')
          ? 'hev1'
          : lower.startsWith('mp4a.')
            ? 'mp4a'
            : lower;
  return CODEC_ALIASES.get(prefix) ?? lower;
}

/** Prefer byte-signaled format identity. The asset path is only a final fallback. */
export function canonicalContainer(formatName, assetId = '', formatTags = {}) {
  const names = String(formatName ?? '').toLowerCase().split(',').map((entry) => entry.trim());
  const majorBrand = String(formatTags?.major_brand ?? '').trim().toLowerCase();
  if (names.includes('matroska') || names.includes('webm')) {
    return names.includes('webm') ? 'webm' : 'mkv';
  }
  if (names.includes('mov') || names.includes('mp4') || names.includes('m4a') || names.includes('3gp')) {
    return majorBrand === 'qt' || majorBrand === 'qt  ' ? 'mov' : 'mp4';
  }
  const formatAliases = [
    [['mpegts'], 'ts'],
    [['hls', 'applehttp'], 'hls'],
    [['wav'], 'wav'],
    [['aiff'], 'aiff'],
    [['mp3'], 'mp3'],
    [['flac'], 'flac'],
    [['ogg'], 'ogg'],
    [['aac'], 'adts'],
    [['image2', 'jpeg_pipe'], 'jpeg'],
    [['png_pipe'], 'png'],
    [['webp_pipe'], 'webp'],
  ];
  for (const [aliases, canonical] of formatAliases) {
    if (aliases.some((alias) => names.includes(alias))) return canonical;
  }
  const lower = String(assetId).toLowerCase();
  const suffixes = [
    [['.mov'], 'mov'],
    [['.mp4', '.m4a', '.m4v'], 'mp4'],
    [['.mkv'], 'mkv'],
    [['.webm'], 'webm'],
    [['.ts'], 'ts'],
    [['.m3u8'], 'hls'],
    [['.wav'], 'wav'],
    [['.aiff', '.aif'], 'aiff'],
    [['.mp3'], 'mp3'],
    [['.flac'], 'flac'],
    [['.ogg', '.opus'], 'ogg'],
    [['.aac'], 'adts'],
    [['.jpg', '.jpeg'], 'jpeg'],
    [['.png'], 'png'],
    [['.webp'], 'webp'],
  ];
  for (const [extensions, canonical] of suffixes) {
    if (extensions.some((extension) => lower.endsWith(extension))) return canonical;
  }
  return names[0] || 'unknown';
}

export function parseRational(value) {
  if (typeof value !== 'string' || value === '0/0') return undefined;
  const match = /^(-?\d+)\/(\d+)$/.exec(value.trim());
  if (!match) return undefined;
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) return undefined;
  return { numerator, denominator, value: numerator / denominator, raw: `${numerator}/${denominator}` };
}

export function normalizeProbeMetadata(probe, options = {}) {
  const format = isRecord(probe?.format) ? probe.format : {};
  const streams = Array.isArray(probe?.streams) ? probe.streams.filter(isRecord) : [];
  const frameProbe = options.frameProbe ?? probe;
  const timestampsByStream = frameTimestampsByStream(frameProbe);
  const rawTracks = streams.map((stream, index) => rawTrackObservation(stream, index, timestampsByStream));
  const trackViews = rawTracks
    .map((raw) => ({ raw, canonical: canonicalTrackObservation(raw) }))
    .sort((a, b) => compareCanonicalTracks(a.canonical, b.canonical));
  const canonicalTracks = trackViews.map((entry) => entry.canonical);

  const counts = new Map();
  for (const track of canonicalTracks) counts.set(track.type, (counts.get(track.type) ?? 0) + 1);
  const ordinals = new Map();
  for (const track of canonicalTracks) {
    if ((counts.get(track.type) ?? 0) > 1) {
      const ordinal = ordinals.get(track.type) ?? 0;
      track.semanticOrdinal = ordinal;
      ordinals.set(track.type, ordinal + 1);
    }
  }

  const presentationDurationSec = finiteNumber(format.duration);
  const presentationStartSec = finiteNumber(format.start_time);
  const streamDurations = rawTracks.map((track) => track.mediaDurationSec).filter(Number.isFinite);
  const mediaDurationSec = streamDurations.length ? Math.max(...streamDurations) : undefined;
  const sampleSpans = rawTracks.map((track) => track.sampleSpanSec).filter(Number.isFinite);
  const sampleSpanSec = sampleSpans.length ? Math.max(...sampleSpans) : undefined;
  const editListSpanSec = deriveEditListSpan(format, rawTracks, presentationDurationSec);
  const timebaseTicks = rawTracks.map((track) => track.timebaseTickUs).filter(Number.isFinite);
  const timebaseTickUs = timebaseTicks.length ? Math.min(...timebaseTicks) : undefined;
  const container = canonicalContainer(format.format_name, options.assetId, format.tags);
  const durationSec = presentationDurationSec === undefined ? null : round(presentationDurationSec, 9);
  const tags = selectedTags(format.tags);

  const canonical = compact({
    container,
    durationSec,
    presentationDurationSec: roundedOrUndefined(presentationDurationSec, 9),
    presentationStartSec: roundedOrUndefined(presentationStartSec, 9),
    mediaDurationSec: roundedOrUndefined(mediaDurationSec, 9),
    rawMediaSpanSec: roundedOrUndefined(mediaDurationSec, 9),
    sampleSpanSec: roundedOrUndefined(sampleSpanSec, 9),
    editListSpanSec: roundedOrUndefined(editListSpanSec, 9),
    timebaseTickUs: roundedOrUndefined(timebaseTickUs, 6),
    tracks: canonicalTracks.map((track) => compact({ ...track })),
    ...(Object.keys(tags).length ? { tags } : {}),
  });

  // `metadata` is the compatibility/oracle projection. It intentionally carries the raw carrier
  // spellings next to the canonical semantic fields; `canonical` remains representation-free and
  // can therefore be byte-compared across codec aliases and stream-table reorderings.
  const metadata = compact({
    ...canonical,
    tracks: trackViews.map(({ raw, canonical: track }) => compact({
      ...track,
      rawCodec: raw.codecRaw,
      codecRaw: raw.codecRaw,
      nativeCodecTag: raw.codecTag ?? raw.codecId ?? raw.codecName,
      canonicalCodec: track.codec,
      codecCanonical: track.codec,
      streamIndexRaw: raw.streamIndex,
      averageFrameRateRaw: raw.averageFrameRate,
      nominalFrameRateRaw: raw.nominalFrameRate,
      sampleRateObserved: raw.sampleRate,
      channelsObserved: raw.channels,
      timeBaseRaw: raw.timeBase,
    })),
  });

  const raw = {
    format: compact({
      formatName: stringOrUndefined(format.format_name),
      formatLongName: stringOrUndefined(format.format_long_name),
      duration: stringOrNumberOrUndefined(format.duration),
      startTime: stringOrNumberOrUndefined(format.start_time),
      bitRate: stringOrNumberOrUndefined(format.bit_rate),
      size: stringOrNumberOrUndefined(format.size),
      tags: isRecord(format.tags) ? sortedStringRecord(format.tags) : undefined,
    }),
    tracks: rawTracks,
  };

  return {
    schema: GOLDEN_METADATA_SCHEMA,
    schemaVersion: GOLDEN_NORMALIZATION_VERSION,
    raw,
    canonical,
    metadata,
  };
}

function rawTrackObservation(stream, fallbackIndex, timestampsByStream) {
  const index = safeInteger(stream.index) ?? fallbackIndex;
  const type = trackType(stream.codec_type);
  const codecName = stringOrUndefined(stream.codec_name) ?? '';
  const codecTag = meaningfulCodecTag(stream.codec_tag_string);
  const codecId = stringOrUndefined(stream.codec_id);
  const codecRaw = codecTag ?? codecId ?? codecName;
  const average = parseRational(stream.avg_frame_rate);
  const nominal = parseRational(stream.r_frame_rate);
  const timebase = parseRational(stream.time_base);
  const durationTs = finiteNumber(stream.duration_ts);
  const mediaDurationSec = finiteNumber(stream.duration) ??
    (durationTs !== undefined && timebase ? durationTs * timebase.value : undefined);
  const sampleRate = positiveInteger(stream.sample_rate);
  const nbFrames = positiveInteger(stream.nb_frames);
  const sampleSpanSec = type === 'audio' && sampleRate && durationTs !== undefined && timebase
    ? durationTs * timebase.value
    : nbFrames && average?.value
      ? nbFrames / average.value
      : mediaDurationSec;
  const profile = stringOrUndefined(stream.profile);
  const audioObjectType = aacAudioObjectType(profile, [codecName, codecTag, codecId].filter(Boolean).join(' '));
  const frameTimestampsUs = timestampsByStream.get(index) ?? [];
  const cadence = deriveCadence(frameTimestampsUs, average ?? nominal);
  return compact({
    streamIndex: index,
    type,
    codecName,
    codecTag,
    codecId,
    codecRaw,
    codecCanonical: canonicalCodecFromSignals(codecName, codecTag, codecId),
    profile,
    level: finiteNumber(stream.level),
    width: positiveInteger(stream.width),
    height: positiveInteger(stream.height),
    codedWidth: positiveInteger(stream.coded_width),
    codedHeight: positiveInteger(stream.coded_height),
    pixelFormat: stringOrUndefined(stream.pix_fmt),
    colorRange: stringOrUndefined(stream.color_range),
    colorSpace: stringOrUndefined(stream.color_space),
    colorTransfer: stringOrUndefined(stream.color_transfer),
    colorPrimaries: stringOrUndefined(stream.color_primaries),
    averageFrameRate: average?.raw,
    nominalFrameRate: nominal?.raw,
    cadenceMode: cadence.mode,
    frameTimestampsUs,
    sampleRate,
    sampleRateCore: audioObjectType === 5 || audioObjectType === 29 ? sampleRate ? sampleRate / 2 : undefined : sampleRate,
    sampleRateOutput: sampleRate,
    channels: positiveInteger(stream.channels),
    channelsCore: audioObjectType === 29 ? 1 : positiveInteger(stream.channels),
    channelsOutput: positiveInteger(stream.channels),
    channelLayout: stringOrUndefined(stream.channel_layout),
    audioObjectType,
    sbrPresent: audioObjectType === 5 || audioObjectType === 29,
    psPresent: audioObjectType === 29,
    bitRate: finiteNumber(stream.bit_rate),
    language: stringOrUndefined(stream.tags?.language) ?? null,
    timeBase: timebase?.raw,
    timeBaseNumerator: timebase?.numerator,
    timeBaseDenominator: timebase?.denominator,
    timebaseTickUs: timebase ? timebase.value * 1_000_000 : undefined,
    mediaTimescale: timebase?.numerator === 1 ? timebase.denominator : undefined,
    startPts: finiteNumber(stream.start_pts),
    startTimeSec: finiteNumber(stream.start_time),
    durationTs,
    mediaDurationSec: roundedOrUndefined(mediaDurationSec, 9),
    sampleSpanSec: roundedOrUndefined(sampleSpanSec, 9),
    primingSamples: nonNegativeInteger(stream.initial_padding ?? stream.codec_delay),
    remainderSamples: nonNegativeInteger(stream.trailing_padding),
    rotation: rotationOf(stream),
    disposition: isRecord(stream.disposition) ? sortedNumberRecord(stream.disposition) : undefined,
    tags: isRecord(stream.tags) ? sortedStringRecord(stream.tags) : undefined,
  });
}

function canonicalTrackObservation(raw) {
  const rational = parseRational(raw.averageFrameRate) ?? parseRational(raw.nominalFrameRate);
  const cadence = deriveCadence(raw.frameTimestampsUs ?? [], rational);
  const fps = cadence.center ?? rational?.value;
  return compact({
    type: raw.type,
    codec: raw.codecCanonical,
    profile: raw.profile,
    level: raw.level,
    width: raw.width,
    height: raw.height,
    codedWidth: raw.codedWidth,
    codedHeight: raw.codedHeight,
    fps: roundedOrUndefined(fps, 9),
    fpsNumerator: rational?.numerator,
    fpsDenominator: rational?.denominator,
    rateRational: rational ? { numerator: rational.numerator, denominator: rational.denominator } : undefined,
    fpsMin: roundedOrUndefined(cadence.min, 9),
    fpsMax: roundedOrUndefined(cadence.max, 9),
    cadenceMode: cadence.mode,
    cadence: cadence.mode,
    frameTimestampsUs: raw.frameTimestampsUs?.length ? raw.frameTimestampsUs : undefined,
    fpsProvenance: fps === undefined
      ? undefined
      : compact({
          source: raw.frameTimestampsUs?.length > 1 ? 'observed' : 'nominal',
          cadence: cadence.mode,
          rational: rational ? { numerator: rational.numerator, denominator: rational.denominator } : undefined,
          envelope: cadence.min !== undefined && cadence.max !== undefined
            ? { minFps: cadence.min, maxFps: cadence.max }
            : undefined,
          sampleCount: raw.frameTimestampsUs?.length > 1 ? raw.frameTimestampsUs.length - 1 : undefined,
          observedIntervalUs: raw.frameTimestampsUs?.length > 1
            ? raw.frameTimestampsUs.at(-1) - raw.frameTimestampsUs[0]
            : undefined,
        }),
    frameRateEvidence: fps === undefined
      ? undefined
      : compact({
          source: raw.frameTimestampsUs?.length > 1 ? 'observed' : 'nominal',
          cadence: cadence.mode,
          rational: rational ? { numerator: rational.numerator, denominator: rational.denominator } : undefined,
          envelope: cadence.min !== undefined && cadence.max !== undefined
            ? { minFps: cadence.min, maxFps: cadence.max }
            : undefined,
          sampleCount: raw.frameTimestampsUs?.length > 1 ? raw.frameTimestampsUs.length - 1 : undefined,
          observedIntervalUs: raw.frameTimestampsUs?.length > 1
            ? raw.frameTimestampsUs.at(-1) - raw.frameTimestampsUs[0]
            : undefined,
        }),
    rotation: raw.rotation,
    sampleRate: raw.sampleRateOutput ?? raw.sampleRate,
    codedSampleRate: raw.sampleRateCore,
    presentationSampleRate: raw.sampleRateOutput,
    sampleRateCore: raw.sampleRateCore,
    sampleRateOutput: raw.sampleRateOutput,
    channels: raw.channelsOutput ?? raw.channels,
    codedChannels: raw.channelsCore,
    presentationChannels: raw.channelsOutput,
    channelsCore: raw.channelsCore,
    channelsOutput: raw.channelsOutput,
    channelLayout: raw.channelLayout,
    audioObjectType: raw.audioObjectType,
    sbrPresent: raw.sbrPresent,
    psPresent: raw.psPresent,
    bitrate: raw.bitRate ?? null,
    language: raw.language ?? null,
    defaultDisposition: raw.disposition?.default !== undefined ? raw.disposition.default === 1 : undefined,
    disposition: raw.disposition,
    mediaDurationSec: raw.mediaDurationSec,
    rawMediaSpanSec: raw.mediaDurationSec,
    sampleSpanSec: raw.sampleSpanSec,
    presentationDurationSec: raw.mediaDurationSec,
    timebaseTickUs: raw.timebaseTickUs,
    mediaTimescale: raw.mediaTimescale,
    mediaTimebase: raw.timeBaseNumerator !== undefined && raw.timeBaseDenominator !== undefined
      ? { numerator: raw.timeBaseNumerator, denominator: raw.timeBaseDenominator }
      : undefined,
    primingSamples: raw.primingSamples,
    remainderSamples: raw.remainderSamples,
    pixelFormat: raw.pixelFormat,
    colorRange: raw.colorRange,
    colorSpace: raw.colorSpace,
    colorTransfer: raw.colorTransfer,
    colorPrimaries: raw.colorPrimaries,
  });
}

function compareCanonicalTracks(a, b) {
  const order = (TRACK_TYPE_ORDER.get(a.type) ?? 99) - (TRACK_TYPE_ORDER.get(b.type) ?? 99);
  if (order) return order;
  return semanticTrackKey(a).localeCompare(semanticTrackKey(b));
}

function semanticTrackKey(track) {
  return canonicalJson({
    type: track.type,
    codec: track.codec,
    language: track.language ?? '',
    width: track.width ?? 0,
    height: track.height ?? 0,
    sampleRate: track.sampleRate ?? 0,
    channels: track.channels ?? 0,
    profile: track.profile ?? '',
    fpsNumerator: track.fpsNumerator ?? 0,
    fpsDenominator: track.fpsDenominator ?? 0,
  });
}

function frameTimestampsByStream(probe) {
  const map = new Map();
  for (const frame of Array.isArray(probe?.frames) ? probe.frames : []) {
    if (!isRecord(frame)) continue;
    const streamIndex = safeInteger(frame.stream_index) ?? 0;
    const seconds = frameTimeSeconds(frame);
    if (seconds === undefined) continue;
    const list = map.get(streamIndex) ?? [];
    list.push(Math.round(seconds * 1_000_000));
    map.set(streamIndex, list);
  }
  for (const [streamIndex, values] of map) {
    map.set(streamIndex, [...new Set(values)].sort((a, b) => a - b));
  }
  return map;
}

function deriveCadence(timestampsUs, rational) {
  const rates = [];
  for (let index = 1; index < timestampsUs.length; index++) {
    const delta = timestampsUs[index] - timestampsUs[index - 1];
    if (delta > 0) rates.push(1_000_000 / delta);
  }
  if (!rates.length) {
    return compact({
      mode: rational ? 'CFR' : 'UNKNOWN',
      center: rational?.value,
      min: rational?.value,
      max: rational?.value,
    });
  }
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  const center = rates.reduce((sum, value) => sum + value, 0) / rates.length;
  return { mode: max - min > 0.01 ? 'VFR' : 'CFR', center, min, max };
}

/** Shared B-frame/VFR-safe presentation-order placeholder selector. */
export function selectPresentationFramePlaceholders(frameProbe, options = {}) {
  const count = options.count ?? DEFAULT_FRAME_COUNT;
  const streamIndex = options.streamIndex ?? 0;
  const byPts = new Map();
  for (const frame of Array.isArray(frameProbe?.frames) ? frameProbe.frames : []) {
    if (!isRecord(frame)) continue;
    const actualStream = safeInteger(frame.stream_index) ?? 0;
    if (actualStream !== streamIndex) continue;
    const seconds = frameTimeSeconds(frame);
    if (seconds === undefined) continue;
    const ptsUs = Math.round(seconds * 1_000_000);
    const existing = byPts.get(ptsUs);
    const keyframe = frame.key_frame === 1 || frame.key_frame === '1' || frame.pict_type === 'I';
    byPts.set(ptsUs, { ptsUs, keyframe: existing?.keyframe === true || keyframe });
  }
  return [...byPts.values()]
    .sort((a, b) => a.ptsUs - b.ptsUs)
    .slice(0, count)
    .map((entry, index) => ({ index, ...entry, sha256: null }));
}

export function buildFramePlaceholder(assetId, source, frameProbe, options = {}) {
  const frames = selectPresentationFramePlaceholders(frameProbe, options);
  return {
    schema: 'media-test/golden-frames@1',
    schemaVersion: FRAME_PLACEHOLDER_VERSION,
    artifactKind: 'frames',
    assetId,
    sourceMedia: {
      sha256: source.sha256,
      sizeBytes: source.sizeBytes,
    },
    pixelNormalizationVersion: 'normalized-rgba-tight-top-left-straight-alpha@1',
    pending: true,
    evidenceState: frames.length ? 'pending' : 'producer-failed',
    producerFailure: frames.length ? undefined : {
      reasonCode: 'FRAME_PLACEHOLDER_EMPTY',
      detail: 'ffprobe exposed no presentation timestamps for the selected video stream',
    },
    frames,
  };
}

/** Normalize ffprobe stream/packet JSON without treating byte representation as semantic truth. */
export function normalizePacketProbe(probe, options = {}) {
  const streams = Array.isArray(probe?.streams) ? probe.streams.filter(isRecord) : [];
  const packets = Array.isArray(probe?.packets) ? probe.packets.filter(isRecord) : [];
  const decodedUnits = Array.isArray(options.decodedUnits)
    ? options.decodedUnits.filter((unit) => isRecord(unit) && safeInteger(unit.streamIndex) !== undefined &&
      Number.isFinite(unit.ptsUs) && typeof unit.sha256 === 'string')
    : [];
  const decoderObservation = normalizeDecoderObservation(options.decoderObservation, decodedUnits);
  const decodedByTime = new Map(decodedUnits.map((unit) => [`${unit.streamIndex}:${unit.ptsUs}`, unit]));
  const decodedFrameByTime = decodedFrameObservationsByTime(probe);
  const tracks = new Map();
  for (const [fallbackIndex, stream] of streams.entries()) {
    const index = safeInteger(stream.index) ?? fallbackIndex;
    const codec = canonicalCodecFromSignals(stream.codec_name, stream.codec_tag_string, stream.codec_id);
    const codecRaw = meaningfulCodecTag(stream.codec_tag_string) ?? stringOrUndefined(stream.codec_name) ?? '';
    const framing = inferFraming(codec, options.container, stream);
    const decoderConfiguration = bytesFromFfprobeHex(stream.extradata);
    tracks.set(index, {
      index,
      type: trackType(stream.codec_type),
      codec,
      codecRaw,
      framing,
      nalLengthSize: positiveInteger(stream.nal_length_size),
      decoderConfiguration,
      decoderConfigurationDigest: decoderConfiguration?.length ? sha256Hex(decoderConfiguration) : undefined,
      parameterSetLocation: inferParameterSetLocation(codec, codecRaw, framing, decoderConfiguration),
      timebase: parseRational(stream.time_base),
    });
  }

  // Stream indices are representation-local. Give each track a semantic id derived from its type,
  // canonical codec, language and media shape so a legal stream-table reorder cannot change the
  // access-unit truth. A per-key ordinal is used only for genuinely duplicated semantic tracks.
  const semanticTrackIds = new Map();
  const grouped = new Map();
  for (const [index, track] of tracks) {
    const stream = streams.find((entry, fallback) => (safeInteger(entry.index) ?? fallback) === index) ?? {};
    const key = canonicalJson(compact({
      type: track.type,
      codec: track.codec,
      language: stringOrUndefined(stream.tags?.language) ?? null,
      width: positiveInteger(stream.width),
      height: positiveInteger(stream.height),
      sampleRate: positiveInteger(stream.sample_rate),
      channels: positiveInteger(stream.channels),
    }));
    const list = grouped.get(key) ?? [];
    list.push(index);
    grouped.set(key, list);
  }
  for (const [key, indices] of [...grouped].sort(([a], [b]) => a.localeCompare(b))) {
    indices.sort((a, b) => a - b).forEach((index, ordinal) => {
      semanticTrackIds.set(index, indices.length === 1 ? key : `${key}#${ordinal}`);
    });
  }

  const normalizedPackets = packets.map((packet, packetIndex) => {
    const trackIndex = safeInteger(packet.stream_index) ?? 0;
    const track = tracks.get(trackIndex) ?? {
      index: trackIndex,
      type: 'other',
      codec: '',
      codecRaw: '',
      framing: 'raw',
    };
    const ptsUs = timeUs(packet.pts_time) ?? ticksToUs(packet.pts, track.timebase) ?? 0;
    const dtsUs = timeUs(packet.dts_time) ?? ticksToUs(packet.dts, track.timebase);
    const durationUs = timeUs(packet.duration_time) ?? ticksToUs(packet.duration, track.timebase);
    const decoded = decodedByTime.get(`${trackIndex}:${ptsUs}`);
    const payloadDigest = normalizeHash(packet.data_hash);
    const accessUnitId = decoded?.sha256 ? `decoded:${decoded.sha256}` : undefined;
    const keyframe = typeof packet.flags === 'string' && packet.flags.includes('K');
    const logicalTrack = semanticTrackIds.get(trackIndex) ?? `${track.type}:${track.codec}`;
    return compact({
      trackIndex,
      size: nonNegativeInteger(packet.size) ?? 0,
      ptsUs,
      dtsUs,
      durationUs,
      keyframe,
      trackType: track.type,
      codec: track.codec,
      framing: track.framing,
      nalLengthSize: track.nalLengthSize,
      decoderConfig: packetIndex === firstPacketIndexForTrack(packets, trackIndex)
        ? track.decoderConfiguration
        : undefined,
      accessUnitId,
      logicalTrack,
      payloadDigest,
      randomAccessKind: keyframe ? 'random-access' : 'delta',
      parameterSetDigests: track.decoderConfigurationDigest ? [track.decoderConfigurationDigest] : undefined,
      representationFingerprint: compact({
        trackIndex,
        logicalTrack,
        size: nonNegativeInteger(packet.size) ?? 0,
        ptsUs,
        dtsUs,
        durationUs,
        flags: stringOrUndefined(packet.flags),
        position: nonNegativeInteger(packet.pos),
        payloadDigest,
      }),
    });
  });

  // Semantic units are decoded presentation units, not ffprobe packet rows. This is the critical
  // non-collapsing boundary: two legal NAL-grouping representations can have different row counts,
  // sizes and key flags while retaining the same decoded access-unit timeline/content identity.
  const semanticAccessUnits = buildSemanticAccessUnits({
    decodedUnits,
    decodedFrameByTime,
    decoderObservation,
    normalizedPackets,
    semanticTrackIds,
  });

  const representation = {
    tracks: [...tracks.values()].sort((a, b) => a.index - b.index).map((track) => compact({
      trackIndex: track.index,
      type: track.type,
      codecRaw: track.codecRaw,
      codecCanonical: track.codec,
      framing: track.framing,
      nalLengthSize: track.nalLengthSize,
      decoderConfigurationDigest: track.decoderConfigurationDigest,
      parameterSetLocation: track.parameterSetLocation,
    })),
    packets: normalizedPackets.map((packet) => packet.representationFingerprint),
  };

  return {
    schema: GOLDEN_PACKETS_SCHEMA,
    schemaVersion: PACKET_SEMANTICS_VERSION,
    raw: {
      streams: streams.map((stream) => compact({
        index: safeInteger(stream.index),
        codecName: stringOrUndefined(stream.codec_name),
        codecTag: meaningfulCodecTag(stream.codec_tag_string),
        codecType: stringOrUndefined(stream.codec_type),
        timeBase: stringOrUndefined(stream.time_base),
        nalLengthSize: positiveInteger(stream.nal_length_size),
        extradataDigest: normalizeHash(stream.extradata_hash),
      })),
      packets: packets.map((packet) => compact({
        streamIndex: safeInteger(packet.stream_index),
        size: nonNegativeInteger(packet.size),
        pts: stringOrNumberOrUndefined(packet.pts),
        dts: stringOrNumberOrUndefined(packet.dts),
        duration: stringOrNumberOrUndefined(packet.duration),
        ptsTime: stringOrNumberOrUndefined(packet.pts_time),
        dtsTime: stringOrNumberOrUndefined(packet.dts_time),
        durationTime: stringOrNumberOrUndefined(packet.duration_time),
        flags: stringOrUndefined(packet.flags),
        dataHash: normalizeHash(packet.data_hash),
      })),
    },
    semantic: {
      accessUnits: semanticAccessUnits,
      decoder: decoderObservation,
    },
    representation,
    packets: normalizedPackets,
  };
}

/** One shared ffprobe request shape for both the flat and rotated-scenario bake paths. */
export function buildGoldenPacketProbeArgs(inputOptions, mediaPath) {
  return [
    ...inputOptions,
    '-show_format', '-show_streams', '-show_packets', '-show_frames', '-show_data',
    '-show_data_hash', 'sha256',
    '-show_entries',
    'format=format_name,tags:' +
      'stream=index,codec_type,codec_name,codec_tag_string,codec_id,time_base,nal_length_size,' +
      'extradata,extradata_hash,width,height,sample_rate,channels,tags:' +
      'packet=stream_index,size,pts,dts,duration,pts_time,dts_time,duration_time,flags,pos,data_hash:' +
      'frame=stream_index,pts_time,best_effort_timestamp_time,duration_time,key_frame,pict_type',
    mediaPath,
  ];
}

/** One shared independent-decoder request shape for both bake paths. */
export function buildGoldenSemanticDecodeArgs(inputOptions, mediaPath) {
  return [
    '-hide_banner', '-loglevel', 'error',
    ...inputOptions,
    '-i', mediaPath,
    '-map', '0:v?', '-map', '0:a?',
    '-f', 'framemd5', '-hash', 'sha256', '-',
  ];
}

/** Derive packet evidence with the same container decision on both producer entry points. */
export function normalizeGoldenPacketEvidence(probe, options = {}) {
  const metadata = normalizeProbeMetadata(probe, { assetId: options.assetId ?? 'fixture.bin' });
  return normalizePacketProbe(probe, {
    ...options,
    container: metadata.canonical.container,
  });
}

function buildSemanticAccessUnits({
  decodedUnits,
  decodedFrameByTime,
  decoderObservation,
  normalizedPackets,
  semanticTrackIds,
}) {
  const out = [];
  if (decodedUnits.length) {
    for (const decoded of decodedUnits) {
      const trackIndex = decoded.streamIndex;
      const rows = normalizedPackets.filter(
        (packet) => packet.trackIndex === trackIndex && packet.ptsUs === decoded.ptsUs,
      );
      const frame = decodedFrameByTime.get(`${trackIndex}:${decoded.ptsUs}`);
      const keyframe = frame?.keyframe ?? rows.some((packet) => packet.keyframe);
      out.push(compact({
        logicalTrack: semanticTrackIds.get(trackIndex) ?? rows[0]?.logicalTrack ?? `stream:${trackIndex}`,
        ptsUs: decoded.ptsUs,
        dtsUs: minimumFinite(rows.map((packet) => packet.dtsUs)),
        durationUs: decoded.durationUs ?? maximumFinite(rows.map((packet) => packet.durationUs)),
        contentIdentity: `decoded:${decoded.sha256}`,
        randomAccess: keyframe ? 'random-access' : 'delta',
        randomAccessEvidence: {
          source: frame ? 'decoded-frame' : 'packet-signaling',
          pictType: frame?.pictType,
        },
        decodable: decoderObservation.state === 'validated' ? true : undefined,
      }));
    }
  } else {
    const groups = new Map();
    for (const packet of normalizedPackets) {
      const key = `${packet.logicalTrack}\u0000${packet.ptsUs}\u0000${packet.durationUs ?? ''}`;
      const rows = groups.get(key) ?? [];
      rows.push(packet);
      groups.set(key, rows);
    }
    for (const rows of groups.values()) {
      const first = rows[0];
      const identities = [...new Set(rows.map((packet) => packet.accessUnitId ?? packet.payloadDigest).filter(Boolean))];
      const frame = decodedFrameByTime.get(`${first.trackIndex}:${first.ptsUs}`);
      out.push(compact({
        logicalTrack: first.logicalTrack,
        ptsUs: first.ptsUs,
        dtsUs: minimumFinite(rows.map((packet) => packet.dtsUs)),
        durationUs: maximumFinite(rows.map((packet) => packet.durationUs)),
        contentIdentities: identities.length ? identities : undefined,
        randomAccess: (frame?.keyframe ?? rows.some((packet) => packet.keyframe)) ? 'random-access' : 'delta',
        randomAccessEvidence: {
          source: frame ? 'decoded-frame' : 'packet-signaling',
          pictType: frame?.pictType,
        },
      }));
    }
  }
  out.sort((a, b) => a.logicalTrack.localeCompare(b.logicalTrack) || a.ptsUs - b.ptsUs ||
    String(a.contentIdentity ?? '').localeCompare(String(b.contentIdentity ?? '')));
  const ordinals = new Map();
  return out.map((unit) => {
    const ordinal = ordinals.get(unit.logicalTrack) ?? 0;
    ordinals.set(unit.logicalTrack, ordinal + 1);
    return { ...unit, accessUnitIndex: ordinal };
  });
}

function decodedFrameObservationsByTime(probe) {
  const out = new Map();
  for (const frame of Array.isArray(probe?.frames) ? probe.frames : []) {
    if (!isRecord(frame)) continue;
    const streamIndex = safeInteger(frame.stream_index) ?? 0;
    const seconds = frameTimeSeconds(frame);
    if (seconds === undefined) continue;
    const ptsUs = Math.round(seconds * 1_000_000);
    const keyframe = frame.key_frame === 1 || frame.key_frame === '1' || frame.pict_type === 'I';
    out.set(`${streamIndex}:${ptsUs}`, {
      keyframe,
      pictType: stringOrUndefined(frame.pict_type),
    });
  }
  return out;
}

function normalizeDecoderObservation(value, decodedUnits) {
  const fallback = {
    state: decodedUnits.length ? 'validated' : 'not-run',
    decodedUnits: decodedUnits.length,
  };
  if (!isRecord(value)) return fallback;
  const allowed = new Set(['validated', 'not-run', 'reference-unavailable']);
  const state = allowed.has(value.state) ? value.state : fallback.state;
  return compact({
    state,
    decodedUnits: decodedUnits.length,
    reasonCode: state === 'reference-unavailable' ? stringOrUndefined(value.reasonCode) : undefined,
    detail: state === 'reference-unavailable' ? stringOrUndefined(value.detail) : undefined,
  });
}

/** Parse ffmpeg framemd5/streamhash rows into presentation-time semantic identities. */
export function parseFrameMd5(text, timebases = new Map()) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const timebaseMatch = /^#tb\s+(\d+):\s*(-?\d+)\/(\d+)$/i.exec(trimmed);
    if (timebaseMatch) {
      const streamIndex = Number(timebaseMatch[1]);
      const numerator = Number(timebaseMatch[2]);
      const denominator = Number(timebaseMatch[3]);
      if (Number.isSafeInteger(streamIndex) && Number.isSafeInteger(numerator) && Number.isSafeInteger(denominator) && denominator > 0) {
        timebases.set(streamIndex, { numerator, denominator });
      }
      continue;
    }
    if (trimmed.startsWith('#')) continue;
    const parts = trimmed.split(',').map((part) => part.trim());
    if (parts.length < 6) continue;
    const streamIndex = Number(parts[0]);
    const pts = Number(parts[2]);
    const duration = Number(parts[3]);
    const sha256 = String(parts.at(-1)).replace(/^sha256:/i, '').toLowerCase();
    const timebase = timebases.get(streamIndex) ?? { numerator: 1, denominator: 1_000_000 };
    if (!Number.isSafeInteger(streamIndex) || !Number.isFinite(pts) || !/^[0-9a-f]{64}$/.test(sha256)) continue;
    out.push({
      streamIndex,
      ptsUs: Math.round(pts * timebase.numerator / timebase.denominator * 1_000_000),
      durationUs: Number.isFinite(duration)
        ? Math.round(duration * timebase.numerator / timebase.denominator * 1_000_000)
        : undefined,
      sha256,
    });
  }
  return out;
}

/**
 * ffmpeg numbers framemd5 outputs in `-map` order, not input-stream order. Both bake paths map all
 * video streams followed by all audio streams, so remap those output-local indices before joining
 * decoded identities to ffprobe packets. This is what keeps audio-first/video-first sources honest.
 */
export function parseMappedFrameMd5(text, inputStreams) {
  const outputToInput = [
    ...inputStreams.filter((stream) => stream?.codec_type === 'video'),
    ...inputStreams.filter((stream) => stream?.codec_type === 'audio'),
  ].map((stream, fallbackIndex) => safeInteger(stream?.index) ?? fallbackIndex);
  return parseFrameMd5(text).map((unit) => ({
    ...unit,
    streamIndex: outputToInput[unit.streamIndex] ?? unit.streamIndex,
  }));
}

export function goldenInputOptions(assetId) {
  return String(assetId).toLowerCase().endsWith('.m3u8')
    ? ['-allowed_extensions', 'ALL', '-protocol_whitelist', 'file,crypto,data,http,https,tcp,tls']
    : [];
}

function firstPacketIndexForTrack(packets, trackIndex) {
  return packets.findIndex((packet) => (safeInteger(packet.stream_index) ?? 0) === trackIndex);
}

function inferFraming(codec, container, stream) {
  if (codec === 'aac') return String(container).toLowerCase() === 'adts' ? 'adts' : 'raw';
  if (codec !== 'h264' && codec !== 'hevc') return 'raw';
  const containerToken = String(container ?? '').toLowerCase();
  if (containerToken === 'ts' || containerToken === 'mpegts' || stream.is_avc === 'false') return 'annex-b';
  if (positiveInteger(stream.nal_length_size)) return 'length-prefixed';
  const tag = String(stream.codec_tag_string ?? '').toLowerCase();
  if (['avc1', 'avc3', 'hvc1', 'hev1'].includes(tag)) return 'length-prefixed';
  return 'annex-b';
}

function inferParameterSetLocation(codec, rawTag, framing, decoderConfiguration) {
  if (codec !== 'h264' && codec !== 'hevc') return 'not-applicable';
  if (framing === 'annex-b') return 'in-band';
  const tag = String(rawTag).toLowerCase();
  if (tag.startsWith('avc3') || tag.startsWith('hev1')) return decoderConfiguration?.length ? 'in-band-and-description' : 'in-band';
  return decoderConfiguration?.length ? 'description' : 'unknown';
}

function bytesFromFfprobeHex(value) {
  if (typeof value !== 'string') return undefined;
  const bytes = [];
  for (const line of value.split(/\r?\n/)) {
    const afterColon = line.includes(':') ? line.slice(line.indexOf(':') + 1) : line;
    const hexArea = afterColon.split(/\s{2,}/)[0] ?? '';
    const clean = hexArea.replace(/[^0-9a-f]/gi, '');
    for (let index = 0; index + 1 < clean.length; index += 2) bytes.push(Number.parseInt(clean.slice(index, index + 2), 16));
  }
  return bytes.length ? bytes : undefined;
}

function normalizeHash(value) {
  if (typeof value !== 'string') return undefined;
  const hex = value.replace(/^sha256:/i, '').trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(hex) ? hex : undefined;
}

function trackType(value) {
  return value === 'video' || value === 'audio' || value === 'subtitle' ? value : 'other';
}

function meaningfulCodecTag(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed !== '[0][0][0][0]' ? trimmed : undefined;
}

function canonicalCodecFromSignals(...signals) {
  const values = signals
    .map((value) => stringOrUndefined(value))
    .filter((value) => value !== undefined);
  for (const value of values) {
    const canonical = canonicalCodecToken(value);
    if (CANONICAL_CODEC_TOKENS.has(canonical)) return canonical;
  }
  return canonicalCodecToken(values[0] ?? '');
}

function aacAudioObjectType(profile, codecRaw) {
  const value = `${profile ?? ''} ${codecRaw ?? ''}`.toLowerCase();
  if (/he-aac\s*v?2|aac.*(?:hev2|ps)|40\.29/.test(value)) return 29;
  if (/he-aac|sbr|40\.5/.test(value)) return 5;
  if (/aac|mp4a|40\.2/.test(value)) return 2;
  return undefined;
}

function deriveEditListSpan(format, tracks, presentationDuration) {
  if (presentationDuration === undefined) return undefined;
  const start = finiteNumber(format.start_time);
  const media = tracks.map((track) => track.mediaDurationSec).filter(Number.isFinite);
  if ((start !== undefined && Math.abs(start) > 1e-12) || media.some((duration) => Math.abs(duration - presentationDuration) > 1e-9)) {
    return presentationDuration;
  }
  return undefined;
}

function selectedTags(tags) {
  if (!isRecord(tags)) return {};
  const out = {};
  for (const key of ['title', 'artist', 'album', 'comment', 'encoder', 'major_brand']) {
    if (tags[key] !== undefined) out[key] = String(tags[key]);
  }
  return out;
}

function rotationOf(stream) {
  const sideData = Array.isArray(stream.side_data_list) ? stream.side_data_list.find((entry) => isRecord(entry) && finiteNumber(entry.rotation) !== undefined) : undefined;
  const raw = sideData?.rotation ?? stream.tags?.rotate;
  const value = finiteNumber(raw);
  return value === undefined ? undefined : ((Math.round(value) % 360) + 360) % 360;
}

function frameTimeSeconds(frame) {
  for (const key of ['best_effort_timestamp_time', 'pts_time']) {
    const value = finiteNumber(frame[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function timeUs(value) {
  const seconds = finiteNumber(value);
  return seconds === undefined ? undefined : Math.round(seconds * 1_000_000);
}

function ticksToUs(value, timebase) {
  const ticks = finiteNumber(value);
  return ticks === undefined || !timebase
    ? undefined
    : Math.round(ticks * timebase.value * 1_000_000);
}

function minimumFinite(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? Math.min(...finite) : undefined;
}

function maximumFinite(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? Math.max(...finite) : undefined;
}

function compact(value) {
  if (Array.isArray(value)) return value.map(compact);
  if (!isRecord(value)) return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) out[key] = compact(item);
  }
  return out;
}

function sortedStringRecord(value) {
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = String(value[key]);
  return out;
}

function sortedNumberRecord(value) {
  const out = {};
  for (const key of Object.keys(value).sort()) {
    const number = finiteNumber(value[key]);
    if (number !== undefined) out[key] = number;
  }
  return out;
}

function stringOrUndefined(value) {
  return typeof value === 'string' && value.length ? value : undefined;
}

function stringOrNumberOrUndefined(value) {
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '' || value === 'N/A') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function safeInteger(value) {
  const number = finiteNumber(value);
  return number !== undefined && Number.isSafeInteger(number) ? number : undefined;
}

function positiveInteger(value) {
  const number = finiteNumber(value);
  return number !== undefined && Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

function nonNegativeInteger(value) {
  const number = finiteNumber(value);
  return number !== undefined && Number.isSafeInteger(number) && number >= 0 ? number : undefined;
}

function roundedOrUndefined(value, digits) {
  return Number.isFinite(value) ? round(value, digits) : undefined;
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
