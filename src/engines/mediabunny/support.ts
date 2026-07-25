/**
 * Concrete capability and exact WebCodecs configuration planning for Mediabunny 1.48.0.
 *
 * The flat capability declaration remains a coarse discovery index.  This module is the
 * authoritative adapter-owned decision for an actual operation tuple.  It deliberately uses the
 * installed OutputFormat implementation for containability/cardinality instead of duplicating the
 * format table in prose.
 */

import type { AudioCodec, OutputFormat, VideoCodec } from 'mediabunny';
import type {
  ApplicabilityTupleSummary,
  ConcreteOperationRequest,
  ConcreteWebCodecsConfig,
  NormalizedTrack,
  SupportDecision,
  TrackType,
} from '../../core/engine.ts';
import {
  canonicalToMediabunnyAudio,
  canonicalToMediabunnyVideo,
  makeOutputFormat,
} from './codecs.ts';
import { ILLEGAL_MUX_SCENARIO_IDS } from '../../features/mux/boundary.ts';
import { parseMuxTrackSelector } from '../../features/mux/selection.ts';

export const MEDIABUNNY_REASON = {
  CONTAINER: 'MEDIABUNNY_OUTPUT_CONTAINER_UNSUPPORTED',
  CONTAINER_CODEC: 'MEDIABUNNY_CONTAINER_CODEC_UNSUPPORTED',
  TRACK_COUNT: 'MEDIABUNNY_TRACK_COUNT_UNSUPPORTED',
  TRACK_TYPE: 'MEDIABUNNY_TRACK_TYPE_UNSUPPORTED',
  COPY_REQUIRED: 'MEDIABUNNY_COPY_REQUIRED',
  TIMESTAMP_MODE: 'MEDIABUNNY_TIMESTAMP_MODE_UNSUPPORTED',
  TRANSFORM_FORMAT: 'MEDIABUNNY_TRANSFORM_FORMAT_UNSUPPORTED',
  METADATA_FORMAT: 'MEDIABUNNY_METADATA_WRITE_FORMAT_UNSUPPORTED',
  PROTECTION_FORM: 'MEDIABUNNY_PROTECTION_FORM_UNSUPPORTED',
  MISSING_TRACK: 'MEDIABUNNY_REQUESTED_TRACK_MISSING',
  BROWSER_VIDEO_ENCODE: 'MEDIABUNNY_BROWSER_VIDEO_ENCODE_UNSUPPORTED',
  BROWSER_AUDIO_ENCODE: 'MEDIABUNNY_BROWSER_AUDIO_ENCODE_UNSUPPORTED',
  BROWSER_VIDEO_DECODE: 'MEDIABUNNY_BROWSER_VIDEO_DECODE_UNSUPPORTED',
  BROWSER_AUDIO_DECODE: 'MEDIABUNNY_BROWSER_AUDIO_DECODE_UNSUPPORTED',
  OUTPUT_MODE: 'MEDIABUNNY_OUTPUT_MODE_UNSUPPORTED',
  LIVE_WEBM_FINAL_CUES: 'MEDIABUNNY_LIVE_WEBM_FINAL_CUES_UNSUPPORTED',
  WRITE_GRANULARITY: 'MEDIABUNNY_EXACT_WRITE_GRANULARITY_UNSUPPORTED',
  RESERVE_PACKET_BOUND: 'MEDIABUNNY_RESERVE_PACKET_BOUND_UNSUPPORTED',
  AUDIO_PRESENTATION_TIMING: 'MEDIABUNNY_AUDIO_PRESENTATION_TIMING_UNSUPPORTED',
  AUDIO_MIX_MATRIX: 'MEDIABUNNY_AUDIO_MIX_MATRIX_UNSUPPORTED',
  TRANSFORM_PIXEL_FIDELITY: 'MEDIABUNNY_TRANSFORM_PIXEL_FIDELITY_UNSUPPORTED',
  ALPHA_OUTPUT_GEOMETRY: 'MEDIABUNNY_ALPHA_OUTPUT_GEOMETRY_UNSUPPORTED',
  ABR_BITRATE_CONTROL: 'MEDIABUNNY_ABR_BITRATE_CONTROL_UNSUPPORTED',
  OUTPUT_BUFFER_LIMIT: 'MEDIABUNNY_OUTPUT_BUFFER_LIMIT_UNSUPPORTED',
} as const;

const PCM_CODECS = new Set(['pcm-s16', 'pcm-s16be', 'pcm-s24', 'pcm-s24be', 'pcm-s32', 'pcm-s32be', 'pcm-f32', 'pcm-f32be', 'pcm-f64', 'pcm-f64be', 'pcm-u8', 'pcm-s8', 'ulaw', 'alaw']);
const NORMALIZED_METADATA_KEYS = new Set([
  'title', 'description', 'artist', 'album', 'albumArtist', 'trackNumber', 'tracksTotal',
  'discNumber', 'discsTotal', 'genre', 'date', 'lyrics', 'comment',
]);

// Mediabunny BufferTarget starts at 2^16 bytes and doubles its backing ArrayBuffer. Once the final
// extent exceeds 2 GiB, the next allocation is the library's 4 GiB maximum. Chromium cannot
// materialize that allocation in this browser-only runner, and MediaBytes requires the complete
// output as one Uint8Array even when the native target is streamed.
const MAX_SAFE_MATERIALIZED_OUTPUT_BYTES = 2 ** 31;
const DELIBERATELY_ILLEGAL_MUX_IDS = new Set<string>(ILLEGAL_MUX_SCENARIO_IDS);
const FULL_TIMELINE_MUX_IDS = new Set([
  'mux/edge_bframes_decode_mux_mp4',
  'mux/edge_bframes_decode_mux_mkv',
  'mux/prop_vfr_mux_duration_mp4_to_mp4',
  'mux/prop_vfr_mux_duration_mp4_to_mkv',
]);

type ConcreteTrack = Pick<NormalizedTrack, 'type' | 'codec' | 'width' | 'height' | 'sampleRate' | 'channels' | 'rotation'>;

interface ExplicitTrackRecord {
  type?: unknown;
  codec?: unknown;
  width?: unknown;
  height?: unknown;
  sampleRate?: unknown;
  channels?: unknown;
}

export interface MediabunnyVideoEncodePlan {
  canonicalCodec: string;
  codec: VideoCodec;
  width: number;
  height: number;
  bitrate: number;
  frameRate?: number;
  hardwareAcceleration: HardwareAcceleration;
  alpha: 'discard' | 'keep';
  config: VideoEncoderConfig;
}

export interface MediabunnyAudioEncodePlan {
  canonicalCodec: string;
  codec: AudioCodec;
  sampleRate: number;
  channels: number;
  bitrate?: number;
  config?: AudioEncoderConfig;
  native: boolean;
}

type HardwareAcceleration = NonNullable<VideoEncoderConfig['hardwareAcceleration']>;

export function tupleSummary(request: ConcreteOperationRequest): ApplicabilityTupleSummary {
  const tracks = request.inputs.flatMap((input) => input.tracks);
  return {
    inputContainers: request.inputs.map((input) => input.container),
    inputCodecs: tracks.map((track) => track.codec),
    ...(request.output?.container ? { outputContainer: request.output.container } : {}),
    outputCodecs: [request.output?.videoCodec, request.output?.audioCodec].filter((x): x is string => !!x),
    ...(request.encryption ? { encryption: request.encryption } : {}),
    dimensions: tracks
      .filter((track) => track.type === 'video')
      .map((track) => ({ width: track.width, height: track.height })),
    sampleRates: tracks.flatMap((track) => track.sampleRate === undefined ? [] : [track.sampleRate]),
    channels: tracks.flatMap((track) => track.channels === undefined ? [] : [track.channels]),
    ...(request.timingMode ? { timingMode: request.timingMode } : {}),
  };
}

/** Full-tuple decision used by MediabunnyEngine.supports(). */
export function decideMediabunnySupport(request: ConcreteOperationRequest): SupportDecision {
  if (request.operation === 'decrypt') {
    if (request.encryption === 'cenc-ctr') {
      // 1.48.0 can abort below JS on the committed CENC-CTR assertion fixture.  Keep every CTR
      // tuple behind a safe adapter decision until that parser defect is proven fixed.
      return no(MEDIABUNNY_REASON.PROTECTION_FORM, 'Mediabunny 1.48.0 CENC-CTR parsing is not safely executable');
    }
    if (request.encryption && request.encryption !== 'cenc-cbcs' && request.encryption !== 'hls-aes128') {
      return no(MEDIABUNNY_REASON.PROTECTION_FORM, `protection scheme '${request.encryption}' is not supported`);
    }
  }

  if (request.operation === 'demux' || request.operation === 'probe') {
    const unsupportedInputTrack = request.inputs
      .flatMap((input) => input.tracks)
      .find((track) => track.type !== 'video' && track.type !== 'audio');
    if (unsupportedInputTrack) {
      return no(
        MEDIABUNNY_REASON.TRACK_TYPE,
        request.operation === 'probe'
          ? `Mediabunny 1.48.0 Input.getTracks() does not expose '${unsupportedInputTrack.type}' tracks in probe inventory`
          : `Mediabunny 1.48.0 Input.getTracks()/EncodedPacketSink does not expose demux packets for '${unsupportedInputTrack.type}' tracks`,
      );
    }
  }

  if (!request.output) return { supported: true };
  const outputContainer = request.operation === 'decrypt' ? 'mp4' : request.output.container;
  if (!outputContainer) return no(MEDIABUNNY_REASON.CONTAINER, 'an output container is required');
  const target = request.options.target;
  if (target !== undefined && typeof target !== 'string') {
    throw new TypeError('target must be a string output-mode token');
  }
  if (target !== undefined && target !== 'buffer' && target !== 'stream') {
    return no(MEDIABUNNY_REASON.OUTPUT_MODE, `output target '${String(target)}' is not supported`);
  }
  if (request.options.fragmented !== undefined && typeof request.options.fragmented !== 'boolean') {
    throw new TypeError('fragmented must be boolean');
  }
  if (request.options.appendOnly !== undefined && typeof request.options.appendOnly !== 'boolean') {
    throw new TypeError('appendOnly must be boolean');
  }
  if (
    request.options.fastStart !== undefined &&
    request.options.fastStart !== false &&
    request.options.fastStart !== 'in-memory' &&
    request.options.fastStart !== 'reserve' &&
    request.options.fastStart !== 'fragmented'
  ) {
    throw new TypeError("fastStart must be false, 'in-memory', 'reserve', or 'fragmented'");
  }
  if (request.options.fragmented === true && request.options.fastStart !== undefined) {
    return no(MEDIABUNNY_REASON.OUTPUT_MODE, 'fragmented and fastStart modes cannot be requested together');
  }
  if (
    request.operation === 'transcode' &&
    request.options.invariant === 'transcode-audio-content' &&
    (request.output.audioCodec === 'aac' || request.output.audioCodec === 'opus')
  ) {
    return no(
      MEDIABUNNY_REASON.AUDIO_PRESENTATION_TIMING,
      `Mediabunny 1.48.0 cannot author the exact encoder delay/remainder evidence required for '${request.output.audioCodec}' program-window validation`,
    );
  }
  if (
    request.operation === 'transcode' &&
    request.options.invariant === 'audio-dsp-transform' &&
    request.scenarioId === 'audio-dsp/upmix_stereo_to_5_1'
  ) {
    return no(
      MEDIABUNNY_REASON.AUDIO_MIX_MATRIX,
      'Mediabunny 1.48.0 exposes only its fixed stereo-to-5.1 mixer and cannot honor the authored center/surround matrix',
    );
  }
  if (
    request.operation === 'trim' &&
    request.options.frameAccurate !== true &&
    outputContainer === 'mp3' &&
    request.options.invariant === 'trim-audio-content'
  ) {
    return no(
      MEDIABUNNY_REASON.AUDIO_PRESENTATION_TIMING,
      'Mediabunny 1.48.0 cannot author MP3 encoder-delay/padding metadata for an exact decoded trim window',
    );
  }
  if (
    request.operation === 'transcode' &&
    request.options.invariant === 'transcode-effect-aware' &&
    (
      request.transforms?.rotate !== undefined ||
      request.transforms?.crop !== undefined ||
      request.options.crop !== undefined ||
      request.options.pad !== undefined
    )
  ) {
    return no(
      MEDIABUNNY_REASON.TRANSFORM_PIXEL_FIDELITY,
      'Mediabunny 1.48.0 baked rotate/crop/pad uses a lossy WebCodecs re-encode and cannot guarantee the required per-pixel maximum-error bound',
    );
  }
  if (
    request.operation === 'transcode' &&
    request.options.invariant === 'transcode-effect-aware' &&
    request.options.alpha === 'keep'
  ) {
    return no(
      MEDIABUNNY_REASON.ALPHA_OUTPUT_GEOMETRY,
      'Mediabunny 1.48.0 VP9 alpha re-encode does not preserve the requested visible frame geometry in Chromium',
    );
  }
  const sourceVideo = request.inputs.flatMap((input) => input.tracks).find((track) => track.type === 'video');
  if (
    request.operation === 'transcode' &&
    Array.isArray(request.options.variants) &&
    request.options.variants.some((variant) => isRecord(variant) && positiveInt(variant.bitrate) !== undefined) &&
    typeof sourceVideo?.fps === 'number' &&
    sourceVideo.fps > 30
  ) {
    return no(
      MEDIABUNNY_REASON.ABR_BITRATE_CONTROL,
      'Mediabunny 1.48.0 Conversion does not expose WebCodecs bitrateMode and Chromium VBR cannot hold the requested ABR bitrate band for high-frame-rate inputs',
    );
  }
  if (request.options.appendOnly === true && target !== 'stream') {
    return no(MEDIABUNNY_REASON.OUTPUT_MODE, 'append-only output requires an observable stream target');
  }
  if (request.options.appendOnly === true && outputContainer !== 'webm' && outputContainer !== 'mkv') {
    return no(MEDIABUNNY_REASON.OUTPUT_MODE, 'append-only output is supported only for WebM/Matroska');
  }
  if (request.options.appendOnly === true) {
    return no(
      MEDIABUNNY_REASON.LIVE_WEBM_FINAL_CUES,
      'Mediabunny 1.48.0 appendOnly finalization emits a trailing Cues element, while the live WebM contract requires a cue-free continuous Segment',
    );
  }
  if (request.options.writeChunkBytes !== undefined) {
    if (!positiveInt(request.options.writeChunkBytes)) {
      throw new TypeError('writeChunkBytes must be a positive safe integer');
    }
    return no(
      MEDIABUNNY_REASON.WRITE_GRANULARITY,
      'Mediabunny StreamTarget exposes native positioned chunks but cannot guarantee every observer write has the requested exact byte length',
    );
  }
  if (request.options.fastStart === 'reserve') {
    if (request.options.maximumPacketCount !== undefined && !positiveInt(request.options.maximumPacketCount)) {
      throw new TypeError('maximumPacketCount must be a positive safe integer when supplied');
    }
  } else if (request.options.maximumPacketCount !== undefined) {
    if (!positiveInt(request.options.maximumPacketCount)) {
      throw new TypeError('maximumPacketCount must be a positive safe integer');
    }
    throw new TypeError('maximumPacketCount is meaningful only for reserve fast-start');
  }
  const format = makeOutputFormat(
    outputContainer,
    outputOptions(request.options, request.scenarioId === 'streaming-output/mp4_fragmented_cmaf'),
  );
  if (!format) return no(MEDIABUNNY_REASON.CONTAINER, `output container '${outputContainer}' is not supported`);

  // These four rows are executable rejection contracts, not ordinary containability claims. The
  // runner deliberately bypasses tuple preflight for them; keep the adapter's repeated runtime
  // decision aligned so mux() can return a typed malformed-input rejection instead of a false NA.
  if (request.operation === 'mux' && DELIBERATELY_ILLEGAL_MUX_IDS.has(request.scenarioId)) {
    return { supported: true };
  }

  // EncodedPacketSink exposes PTS plus decode sequence but no numeric source DTS. Consequently the
  // packet-source writer cannot retain an input's independent leading composition offset; Matroska
  // also uses a coarser default timecode scale. These complete-timeline rows must stay explicit NA.
  if (request.operation === 'mux' && FULL_TIMELINE_MUX_IDS.has(request.scenarioId)) {
    return no(
      MEDIABUNNY_REASON.TIMESTAMP_MODE,
      'Mediabunny 1.48.0 EncodedPacketSink does not expose the independent source DTS needed by this complete mux-timeline row',
    );
  }

  const unsupportedTag = unsupportedRequestedMetadataTag(request.options);
  if (unsupportedTag) {
    return no(MEDIABUNNY_REASON.METADATA_FORMAT, `normalized metadata tag '${unsupportedTag}' is not supported by this adapter`);
  }
  if (hasRequestedTags(request.options) && outputContainer === 'ts') {
    return no(MEDIABUNNY_REASON.METADATA_FORMAT, 'MPEG-TS metadata writing is not supported by Mediabunny 1.48.0');
  }

  const tracks = concreteTracks(request);
  const hasUnresolvedInputEvidence = request.inputs.some((input) => input.sourceEvidence === 'UNRESOLVED');
  // The runner first asks about a source before its selected bytes/goldens have been resolved. Preserve
  // intrinsic container/option checks above, but defer track-dependent cardinality and containability
  // until the evidence-rich support pass. A resolved empty track list remains a real zero-track tuple.
  const variants = Array.isArray(request.options.variants)
    ? request.options.variants.filter(isRecord)
    : [];
  if (!hasUnresolvedInputEvidence) {
    const estimatedOutputBytes = estimateMaterializedTranscodeBytes(request);
    if (estimatedOutputBytes !== undefined && estimatedOutputBytes > MAX_SAFE_MATERIALIZED_OUTPUT_BYTES) {
      return no(
        MEDIABUNNY_REASON.OUTPUT_BUFFER_LIMIT,
        `the concrete encode plan is estimated to produce ${Math.ceil(estimatedOutputBytes / 2 ** 20)} MiB; `
          + 'Mediabunny BufferTarget would require its 4 GiB backing allocation once the final extent exceeds 2 GiB',
      );
    }
    if (request.operation === 'transcode' && variants.length > 0) {
      const decisions = variants.map((variant) => decideTrackTuple(requestWithVariant(request, variant), format, tracks));
      if (decisions.every((decision) => decision !== undefined)) return decisions[0]!;
    } else {
      const intrinsic = decideTrackTuple(request, format, tracks);
      if (intrinsic) return intrinsic;
    }
  }

  if (request.timingMode === 'timestamped' && !format.supportsTimestampedMediaData) {
    return no(MEDIABUNNY_REASON.TIMESTAMP_MODE, `${outputContainer} cannot preserve timestamped media data`);
  }
  if (request.options.timestamped === true && !format.supportsTimestampedMediaData) {
    return no(MEDIABUNNY_REASON.TIMESTAMP_MODE, `${outputContainer} cannot preserve explicit timestamps`);
  }
  if (
    request.options.alpha === 'keep' &&
    (request.output.videoCodec !== 'vp9' || (outputContainer !== 'webm' && outputContainer !== 'mkv'))
  ) {
    return no(MEDIABUNNY_REASON.TRANSFORM_FORMAT, 'alpha preservation requires a VP9 WebM/Matroska output tuple');
  }

  const browserConfigs = browserConfigsForRequest(request);
  return browserConfigs.length ? { supported: true, browserConfigs } : { supported: true };
}

function estimateMaterializedTranscodeBytes(request: ConcreteOperationRequest): number | undefined {
  if (request.operation !== 'transcode' || request.inputs.length !== 1) return undefined;
  const input = request.inputs[0]!;
  const explicitDurations = input.tracks.flatMap((track) => [
    track.presentationDurationSec,
    track.mediaDurationSec,
    track.sampleSpanSec,
    track.rawMediaSpanSec,
  ]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);

  let durationSec = explicitDurations.length > 0 ? Math.max(...explicitDurations) : undefined;
  if (durationSec === undefined && typeof input.sizeBytes === 'number' && input.sizeBytes > 0) {
    const bitrates = input.tracks
      .map((track) => track.bitrate)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
    if (bitrates.length > 0) {
      // Some normalized probes expose the container bitrate on every track. Count identical values
      // once; genuinely distinct per-track rates are additive.
      const distinctBitrates = [...new Set(bitrates)];
      const sourceBitrate = distinctBitrates.length === 1
        ? distinctBitrates[0]!
        : distinctBitrates.reduce((sum, value) => sum + value, 0);
      durationSec = input.sizeBytes * 8 / sourceBitrate;
    }
  }
  if (durationSec === undefined) return undefined;

  let outputBitrate = 0;
  if (request.output?.videoCodec) {
    const videoPlan = videoEncodePlanForRequest(request);
    if (!videoPlan) return undefined;
    outputBitrate += videoPlan.bitrate;
  }
  if (request.output?.audioCodec) {
    const audioPlan = audioEncodePlanForRequest(request);
    if (!audioPlan?.bitrate) return undefined;
    outputBitrate += audioPlan.bitrate;
  }
  return outputBitrate > 0 ? durationSec * outputBitrate / 8 : undefined;
}

function requestWithVariant(
  request: ConcreteOperationRequest,
  variant: Record<string, unknown>,
): ConcreteOperationRequest {
  const videoCodec = typeof variant.codec === 'string' ? variant.codec : request.output?.videoCodec;
  return {
    ...request,
    output: {
      ...(request.output ?? { container: '' }),
      ...(videoCodec ? { videoCodec } : {}),
      ...(positiveInt(variant.width) ? { width: positiveInt(variant.width) } : {}),
      ...(positiveInt(variant.height) ? { height: positiveInt(variant.height) } : {}),
      ...(positiveNumber(variant.fps) ? { frameRate: positiveNumber(variant.fps) } : {}),
    },
    options: { ...request.options, video: { ...variant }, variants: [] },
  };
}

function decideTrackTuple(
  request: ConcreteOperationRequest,
  format: OutputFormat,
  sourceTracks: ConcreteTrack[],
): SupportDecision | undefined {
  if (request.output?.videoCodec && !sourceTracks.some((track) => track.type === 'video')) {
    return no(MEDIABUNNY_REASON.MISSING_TRACK, 'a video output was requested but no video input track exists');
  }
  if (request.output?.audioCodec && !sourceTracks.some((track) => track.type === 'audio')) {
    return no(MEDIABUNNY_REASON.MISSING_TRACK, 'an audio output was requested but no audio input track exists');
  }
  const tracks = projectOutputTracks(request, sourceTracks);
  if (tracks.length === 0) return no(MEDIABUNNY_REASON.TRACK_COUNT, 'output tuple contains zero tracks');

  const unsupportedType = tracks.find((track) => track.type !== 'video' && track.type !== 'audio');
  if (unsupportedType) {
    return no(MEDIABUNNY_REASON.TRACK_TYPE, `track type '${unsupportedType.type}' is not supported by the encoded-packet path`);
  }

  const limits = format.getSupportedTrackCounts();
  const counts = countTrackTypes(tracks);
  for (const type of ['video', 'audio', 'subtitle'] as const) {
    const count = counts[type];
    const limit = limits[type];
    if (count < limit.min || count > limit.max) {
      return no(MEDIABUNNY_REASON.TRACK_COUNT, `${type} track count ${count} is outside ${limit.min}..${limit.max}`);
    }
  }
  if (tracks.length < limits.total.min || tracks.length > limits.total.max) {
    return no(MEDIABUNNY_REASON.TRACK_COUNT, `total track count ${tracks.length} is outside ${limits.total.min}..${limits.total.max}`);
  }

  const videoCodecs = new Set(format.getSupportedVideoCodecs());
  const audioCodecs = new Set(format.getSupportedAudioCodecs());
  for (const track of tracks) {
    if (track.type === 'video') {
      const codec = canonicalToMediabunnyVideo(track.codec);
      if (!codec || !videoCodecs.has(codec)) {
        return no(MEDIABUNNY_REASON.CONTAINER_CODEC, `${track.codec} cannot be authored in this output container`);
      }
    } else if (track.type === 'audio') {
      const codec = canonicalToMediabunnyAudio(track.codec);
      if (!codec || !audioCodecs.has(codec)) {
        return no(MEDIABUNNY_REASON.CONTAINER_CODEC, `${track.codec} cannot be authored in this output container`);
      }
    }
  }

  if (
    (request.operation === 'remux' || (request.operation === 'trim' && request.transforms?.trim?.frameAccurate === false)) &&
    tracks.some((track, index) => track.codec !== sourceTracks[index]?.codec)
  ) {
    return no(MEDIABUNNY_REASON.COPY_REQUIRED, 'the requested copy operation would change codec essence');
  }

  if (
    !format.supportsVideoRotationMetadata &&
    (request.operation === 'remux' || request.operation === 'mux') &&
    tracks.some((track) => track.type === 'video' && !!track.rotation)
  ) {
    return no(
      MEDIABUNNY_REASON.COPY_REQUIRED,
      `strict ${request.operation} cannot discard or bake source rotation metadata`,
    );
  }
  return undefined;
}

function projectOutputTracks(request: ConcreteOperationRequest, tracks: ConcreteTrack[]): ConcreteTrack[] {
  return tracks.map((track) => {
    if (track.type === 'video' && request.output?.videoCodec) return { ...track, codec: request.output.videoCodec };
    if (track.type === 'audio' && request.output?.audioCodec) return { ...track, codec: request.output.audioCodec };
    return track;
  });
}

function concreteTracks(request: ConcreteOperationRequest): ConcreteTrack[] {
  if (hasExplicitTrackDeclaration(request.options)) return explicitMuxTracks(request.options);

  const indexed = request.inputs.flatMap((input, sourceIndex) => {
    const ordinals = { video: 0, audio: 0 };
    return input.tracks.map((track) => {
      const typeOrdinal = track.type === 'video' || track.type === 'audio'
        ? ordinals[track.type]++
        : -1;
      return { track: { ...track } as ConcreteTrack, sourceIndex, typeOrdinal };
    });
  });
  if (!Array.isArray(request.options.trackSelect)) return indexed.map((entry) => entry.track);

  const selected: ConcreteTrack[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of request.options.trackSelect.entries()) {
    if (typeof raw !== 'string') throw new TypeError(`mux trackSelect[${index}] must be a string`);
    const selector = parseMuxTrackSelector(raw);
    if (request.inputs.length > 1 && selector.sourceIndex === undefined) {
      throw new TypeError('multi-source mux selectors must include @SOURCE');
    }
    const sourceIndex = selector.sourceIndex ?? 0;
    const match = indexed.find((entry) =>
      entry.sourceIndex === sourceIndex &&
      entry.track.type === selector.type &&
      entry.typeOrdinal === selector.typeOrdinal
    );
    if (!match) {
      // The first support pass intentionally precedes selected-asset probing. Defer selector
      // resolution for that source until its concrete track inventory is available.
      if (request.inputs[sourceIndex]?.sourceEvidence === 'UNRESOLVED') continue;
      throw new TypeError(`mux track selector '${selector.canonical}' does not resolve to a source track`);
    }
    const key = `${sourceIndex}:${selector.type}:${selector.typeOrdinal}`;
    if (seen.has(key)) throw new TypeError(`mux track selector '${selector.canonical}' duplicates a selected source track`);
    seen.add(key);
    selected.push(match.track);
  }
  return selected;
}

function hasExplicitTrackDeclaration(options: Readonly<Record<string, unknown>>): boolean {
  return isRecord(options.tracks) && Array.isArray(options.tracks.tracks);
}

function explicitMuxTracks(options: Readonly<Record<string, unknown>>): ConcreteTrack[] {
  const root = isRecord(options.tracks) ? options.tracks : undefined;
  if (!root || !Array.isArray(root.tracks)) return [];
  return root.tracks.map((raw, index): ConcreteTrack => {
    if (!isRecord(raw)) throw new TypeError(`options.tracks.tracks[${index}] must be an object`);
    const record = raw as ExplicitTrackRecord;
    if (typeof record.type !== 'string' || record.type.length === 0) {
      throw new TypeError(`options.tracks.tracks[${index}].type must be a non-empty string`);
    }
    if (typeof record.codec !== 'string' || record.codec.length === 0) {
      throw new TypeError(`options.tracks.tracks[${index}].codec must be a non-empty string`);
    }
    for (const field of ['width', 'height', 'sampleRate', 'channels'] as const) {
      const value = record[field];
      if (value !== undefined && (!Number.isInteger(value) || (value as number) <= 0)) {
        throw new TypeError(`options.tracks.tracks[${index}].${field} must be a positive integer`);
      }
    }
    return {
      type: record.type as TrackType,
      codec: record.codec,
      ...(typeof record.width === 'number' ? { width: record.width } : {}),
      ...(typeof record.height === 'number' ? { height: record.height } : {}),
      ...(typeof record.sampleRate === 'number' ? { sampleRate: record.sampleRate } : {}),
      ...(typeof record.channels === 'number' ? { channels: record.channels } : {}),
    };
  });
}

function countTrackTypes(tracks: ConcreteTrack[]): Record<'video' | 'audio' | 'subtitle', number> {
  const counts = { video: 0, audio: 0, subtitle: 0 };
  for (const track of tracks) {
    if (track.type === 'video' || track.type === 'audio' || track.type === 'subtitle') counts[track.type]++;
  }
  return counts;
}

export function browserConfigsForRequest(request: ConcreteOperationRequest): ConcreteWebCodecsConfig[] {
  if (request.operation !== 'transcode' && !(request.operation === 'trim' && request.transforms?.trim?.frameAccurate)) return [];
  // Fanout support is intentionally evaluated per variant during execution.  Returning all configs
  // here would let one unavailable rung erase supported siblings at runner preflight.
  if (Array.isArray(request.options.variants) && request.options.variants.length > 0) return [];
  // Degenerate dimensions belong to the operation's typed malformed-input path. Do not send a
  // knowingly invalid configuration to WebCodecs during browser applicability preflight: doing so
  // would turn the authored graceful-failure row into a harness ERROR before the adapter can reject
  // the request cleanly.
  const requestedVideo = isRecord(request.options.video) ? request.options.video : undefined;
  if (
    [requestedVideo?.width, requestedVideo?.height, request.output?.width, request.output?.height]
      .some((value) => typeof value === 'number' && value <= 0)
  ) {
    return [];
  }
  const configs: ConcreteWebCodecsConfig[] = [];
  const videoPlan = videoEncodePlanForRequest(request);
  if (videoPlan) configs.push({ role: 'video-encoder', config: videoPlan.config });
  const audioPlan = audioEncodePlanForRequest(request);
  if (audioPlan?.config) configs.push({ role: 'audio-encoder', config: audioPlan.config });
  return configs;
}

export function videoEncodePlanForRequest(
  request: ConcreteOperationRequest,
  override?: Record<string, unknown>,
): MediabunnyVideoEncodePlan | undefined {
  const source = request.inputs.flatMap((input) => input.tracks).find((track) => track.type === 'video');
  const video = override ?? (isRecord(request.options.video) ? request.options.video : undefined);
  const canonicalCodec = typeof video?.codec === 'string'
    ? video.codec
    : request.output?.videoCodec ?? (request.operation === 'trim' ? source?.codec : undefined);
  if (!canonicalCodec) return undefined;
  const codec = canonicalToMediabunnyVideo(canonicalCodec);
  if (!codec) return undefined;
  const explicitWidth = positiveInt(video?.width) ?? positiveInt(request.output?.width);
  const explicitHeight = positiveInt(video?.height) ?? positiveInt(request.output?.height);
  const sourceWidth = source?.width ?? 1280;
  const sourceHeight = source?.height ?? 720;
  const requestedRotation = typeof video?.rotate === 'number' && Number.isFinite(video.rotate)
    ? video.rotate
    : 0;
  const totalRotation = normalizeDegrees((source?.rotation ?? 0) + requestedRotation);
  const naturalWidth = totalRotation % 180 === 0 ? sourceWidth : sourceHeight;
  const naturalHeight = totalRotation % 180 === 0 ? sourceHeight : sourceWidth;
  const width = explicitWidth ?? (explicitHeight
    ? evenDimension(Math.round(explicitHeight * naturalWidth / naturalHeight))
    : naturalWidth);
  const height = explicitHeight ?? (explicitWidth
    ? evenDimension(Math.round(explicitWidth * naturalHeight / naturalWidth))
    : naturalHeight);
  const bitrate = positiveInt(video?.bitrate) ?? defaultVideoBitrate(codec, width, height);
  // Preserve source VFR by leaving the rate unset unless the operation explicitly requests one.
  // Conversion otherwise derives cadence from input timestamps; probing a sampled source FPS here
  // would claim a CFR encoder config which the operation never instantiates.
  const frameRate = positiveNumber(video?.fps) ?? request.output?.frameRate;
  const hardwareAcceleration = hardwareMode(video?.hardwareAcceleration)
    ?? hardwareMode(request.options.hardwareAcceleration)
    ?? 'no-preference';
  const alpha = request.options.alpha === 'keep' ? 'keep' : 'discard';
  const config = mediabunnyVideoEncoderConfig(codec, width, height, bitrate, frameRate, hardwareAcceleration, alpha);
  return { canonicalCodec, codec, width, height, bitrate, ...(frameRate ? { frameRate } : {}), hardwareAcceleration, alpha, config };
}

export function audioEncodePlanForRequest(request: ConcreteOperationRequest): MediabunnyAudioEncodePlan | undefined {
  const source = request.inputs.flatMap((input) => input.tracks).find((track) => track.type === 'audio');
  const audio = isRecord(request.options.audio) ? request.options.audio : undefined;
  const canonicalCodec = typeof audio?.codec === 'string'
    ? audio.codec
    : request.output?.audioCodec ?? (request.operation === 'trim' ? source?.codec : undefined);
  if (!canonicalCodec) return undefined;
  const codec = canonicalToMediabunnyAudio(canonicalCodec);
  if (!codec) return undefined;
  const sampleRate = positiveInt(audio?.sampleRate) ?? request.output?.sampleRate ?? source?.sampleRate ?? 48_000;
  const channels = positiveInt(audio?.channels) ?? request.output?.channels ?? source?.channels ?? 2;
  const bitrate = positiveInt(audio?.bitrate) ?? defaultAudioBitrate(codec);
  const native = PCM_CODECS.has(canonicalCodec);
  const config = native ? undefined : mediabunnyAudioEncoderConfig(codec, sampleRate, channels, bitrate);
  return { canonicalCodec, codec, sampleRate, channels, ...(bitrate ? { bitrate } : {}), ...(config ? { config } : {}), native };
}

export function defaultVideoBitrate(codec: VideoCodec, width: number, height: number): number {
  // Chromium's AV1 encoder needs the larger budget to keep high-motion 1080x1920@60 material above
  // the suite's 0.97 SSIM gate; 37.3 Mb/s was the first verified passing point for that tuple.
  // AVC resize and VP9 cross-codec rows retain a modest quality margin above Chromium's
  // low-density defaults; exhaustive real-asset calibration covers both budgets.
  const efficiency: Record<VideoCodec, number> = { avc: 1.5, hevc: 0.7, vp9: 1.2, av1: 1.8, vp8: 1.1 };
  return Math.max(300_000, Math.round(width * height * 10 * efficiency[codec]));
}

export function defaultAudioBitrate(codec: AudioCodec): number | undefined {
  switch (codec) {
    case 'aac': return 192_000; // Mediabunny QUALITY_HIGH resolves then clamps AAC to 192 kb/s.
    case 'opus':
    case 'vorbis': return 128_000;
    case 'mp3': return 320_000;
    case 'ac3': return 768_000;
    case 'eac3': return 384_000;
    default: return undefined;
  }
}

/** Exact WebCodecs config produced by Mediabunny's public encode-plan rules. */
export function mediabunnyVideoEncoderConfig(
  codec: VideoCodec,
  width: number,
  height: number,
  bitrate: number,
  frameRate: number | undefined,
  hardwareAcceleration: HardwareAcceleration,
  alpha: 'discard' | 'keep',
): VideoEncoderConfig {
  return {
    codec: videoCodecString(codec, width, height, bitrate),
    width,
    height,
    displayWidth: undefined,
    displayHeight: undefined,
    bitrate,
    bitrateMode: undefined,
    framerate: frameRate,
    latencyMode: undefined,
    hardwareAcceleration,
    scalabilityMode: undefined,
    contentHint: undefined,
    ...(codec === 'avc' ? { avc: { format: 'avc' } } : {}),
    ...(codec === 'hevc' ? { hevc: { format: 'hevc' } } : {}),
    // Mediabunny handles alpha as a parallel plane and forces the WebCodecs color encoder to
    // `discard`; the requested alpha policy remains in the Conversion plan above.
    alpha: 'discard',
  } as VideoEncoderConfig;
}

export function mediabunnyAudioEncoderConfig(
  codec: AudioCodec,
  sampleRate: number,
  channels: number,
  bitrate?: number,
): AudioEncoderConfig {
  return {
    codec: audioCodecString(codec, channels, sampleRate),
    sampleRate,
    numberOfChannels: channels,
    bitrate,
    bitrateMode: undefined,
    ...(codec === 'aac' ? { aac: { format: 'aac' } } : {}),
    ...(codec === 'opus' ? { opus: { format: 'opus' } } : {}),
  } as AudioEncoderConfig;
}

function videoCodecString(codec: VideoCodec, width: number, height: number, bitrate: number): string {
  if (codec === 'avc') {
    const macroblocks = Math.ceil(width / 16) * Math.ceil(height / 16);
    const levels = [
      [99, 64_000, 0x0a], [396, 192_000, 0x0b], [396, 384_000, 0x0c],
      [396, 768_000, 0x0d], [396, 2_000_000, 0x14], [792, 4_000_000, 0x15],
      [1620, 4_000_000, 0x16], [1620, 10_000_000, 0x1e], [3600, 14_000_000, 0x1f],
      [5120, 20_000_000, 0x20], [8192, 20_000_000, 0x28], [8192, 50_000_000, 0x29],
      [8704, 50_000_000, 0x2a], [22080, 135_000_000, 0x32], [36864, 240_000_000, 0x33],
      [36864, 240_000_000, 0x34], [139264, 240_000_000, 0x3c],
      [139264, 480_000_000, 0x3d], [139264, 800_000_000, 0x3e],
    ] as const;
    const level = levels.find(([mb, rate]) => macroblocks <= mb && bitrate <= rate)?.[2] ?? 0x3e;
    return `avc1.6400${level.toString(16).padStart(2, '0')}`;
  }
  if (codec === 'hevc') {
    const px = width * height;
    const levels = [
      [36_864, 128_000, 'L30'], [122_880, 1_500_000, 'L60'], [245_760, 3_000_000, 'L63'],
      [552_960, 6_000_000, 'L90'], [983_040, 10_000_000, 'L93'], [2_228_224, 12_000_000, 'L120'],
      [2_228_224, 30_000_000, 'H120'], [2_228_224, 20_000_000, 'L123'], [2_228_224, 50_000_000, 'H123'],
      [8_912_896, 25_000_000, 'L150'], [8_912_896, 100_000_000, 'H150'], [8_912_896, 40_000_000, 'L153'],
      [8_912_896, 160_000_000, 'H153'], [8_912_896, 60_000_000, 'L156'], [8_912_896, 240_000_000, 'H156'],
      [35_651_584, 60_000_000, 'L180'], [35_651_584, 240_000_000, 'H180'], [35_651_584, 120_000_000, 'L183'],
      [35_651_584, 480_000_000, 'H183'], [35_651_584, 240_000_000, 'L186'], [35_651_584, 800_000_000, 'H186'],
    ] as const;
    const level = levels.find(([size, rate]) => px <= size && bitrate <= rate)?.[2] ?? 'H186';
    return `hev1.1.6.${level}.B0`;
  }
  if (codec === 'vp8') return 'vp8';
  const px = width * height;
  if (codec === 'vp9') {
    const levels = [[36_864, 200_000, 10], [73_728, 800_000, 11], [122_880, 1_800_000, 20], [245_760, 3_600_000, 21], [552_960, 7_200_000, 30], [983_040, 12_000_000, 31], [2_228_224, 18_000_000, 40], [2_228_224, 30_000_000, 41], [8_912_896, 60_000_000, 50], [8_912_896, 120_000_000, 51], [8_912_896, 180_000_000, 52], [35_651_584, 180_000_000, 60], [35_651_584, 240_000_000, 61], [35_651_584, 480_000_000, 62]] as const;
    const level = levels.find(([size, rate]) => px <= size && bitrate <= rate)?.[2] ?? 62;
    return `vp09.00.${String(level).padStart(2, '0')}.08`;
  }
  const av1 = [[147_456, 1_500_000, '00M'], [278_784, 3_000_000, '01M'], [665_856, 6_000_000, '04M'], [1_065_024, 10_000_000, '05M'], [2_359_296, 12_000_000, '08M'], [2_359_296, 30_000_000, '08H'], [2_359_296, 20_000_000, '09M'], [2_359_296, 50_000_000, '09H'], [8_912_896, 30_000_000, '12M'], [8_912_896, 100_000_000, '12H'], [8_912_896, 40_000_000, '13M'], [8_912_896, 160_000_000, '13H'], [8_912_896, 60_000_000, '14M'], [8_912_896, 240_000_000, '14H'], [35_651_584, 60_000_000, '15M'], [35_651_584, 240_000_000, '15H'], [35_651_584, 60_000_000, '16M'], [35_651_584, 240_000_000, '16H'], [35_651_584, 100_000_000, '17M'], [35_651_584, 480_000_000, '17H'], [35_651_584, 160_000_000, '18M'], [35_651_584, 800_000_000, '18H'], [35_651_584, 160_000_000, '19M'], [35_651_584, 800_000_000, '19H']] as const;
  const level = av1.find(([size, rate]) => px <= size && bitrate <= rate)?.[2] ?? '19H';
  return `av01.0.${level}.08`;
}

function audioCodecString(codec: AudioCodec, channels: number, sampleRate: number): string {
  if (codec === 'aac') {
    if (channels >= 2 && sampleRate <= 24_000) return 'mp4a.40.29';
    if (sampleRate <= 24_000) return 'mp4a.40.5';
    return 'mp4a.40.2';
  }
  if (codec === 'mp3') return 'mp3';
  if (codec === 'opus' || codec === 'vorbis' || codec === 'flac') return codec;
  if (codec === 'ac3') return 'ac-3';
  if (codec === 'eac3') return 'ec-3';
  return codec;
}

function outputOptions(options: Readonly<Record<string, unknown>>, cmaf = false): {
  fastStart?: false | 'in-memory' | 'reserve' | 'fragmented';
  appendOnly?: boolean;
  cmaf?: boolean;
} | undefined {
  const fastStart = options.fragmented === true
    ? 'fragmented'
    : options.fastStart === false || options.fastStart === 'in-memory' || options.fastStart === 'reserve' || options.fastStart === 'fragmented'
      ? options.fastStart
      : undefined;
  const appendOnly = options.appendOnly === true ? true : undefined;
  const nativeCmaf = cmaf ? true : undefined;
  return fastStart === undefined && appendOnly === undefined && nativeCmaf === undefined ? undefined : {
    ...(fastStart !== undefined ? { fastStart } : {}),
    ...(appendOnly !== undefined ? { appendOnly } : {}),
    ...(nativeCmaf !== undefined ? { cmaf: nativeCmaf } : {}),
  };
}

function hasRequestedTags(options: Readonly<Record<string, unknown>>): boolean {
  return isRecord(options.tags) && Object.keys(options.tags).length > 0;
}

export function unsupportedRequestedMetadataTag(options: Readonly<Record<string, unknown>>): string | undefined {
  if (!isRecord(options.tags)) return undefined;
  return Object.keys(options.tags).find((key) => !NORMALIZED_METADATA_KEYS.has(key));
}

function no(reasonCode: string, reason: string): SupportDecision {
  return { supported: false, status: 'NA_ENGINE', reasonCode, reason };
}

function positiveInt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function hardwareMode(value: unknown): HardwareAcceleration | undefined {
  return value === 'no-preference' || value === 'prefer-hardware' || value === 'prefer-software' ? value : undefined;
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function evenDimension(value: number): number {
  return Math.max(2, Math.ceil(value / 2) * 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
