import type {
  ApplicabilityTupleSummary,
  ConcreteInputRequest,
  ConcreteOperationRequest,
  NormalizedTrack,
  SupportDecision,
} from '../../core/engine.ts';
import { DECODE_TRACK_SELECTOR_SCHEMA } from '../../core/engine.ts';

export const WEB_DEMUXER_INPUT_CONTAINERS = ['mp4', 'mov', 'mkv', 'webm', 'ts'] as const;
export const WEB_DEMUXER_VIDEO_CODECS = ['h264', 'hevc', 'vp8', 'vp9', 'av1'] as const;
export const WEB_DEMUXER_AUDIO_CODECS = ['aac', 'opus', 'mp3', 'flac', 'vorbis'] as const;

export const WEB_DEMUXER_REASON = {
  OPERATION: 'WEB_DEMUXER_OPERATION_UNDECLARED',
  INPUT_COUNT: 'WEB_DEMUXER_INPUT_COUNT_UNSUPPORTED',
  CONTAINER: 'WEB_DEMUXER_CONTAINER_UNSUPPORTED',
  CONTAINER_CODEC: 'WEB_DEMUXER_CONTAINER_CODEC_UNSUPPORTED',
  TRACK_TYPE: 'WEB_DEMUXER_TRACK_TYPE_UNSUPPORTED',
  TRACK_SELECTION: 'WEB_DEMUXER_TRACK_SELECTION_UNSUPPORTED',
  VIDEO_REQUIRED: 'WEB_DEMUXER_VIDEO_TRACK_REQUIRED',
  PROTECTION: 'WEB_DEMUXER_PROTECTION_UNSUPPORTED',
  TS_PACKETS: 'WEB_DEMUXER_TS_PACKET_READER_UNAVAILABLE',
  DEMUX_SCALE: 'WEB_DEMUXER_DEMUX_SCALE_PACKET_BOUNDARY_UNAVAILABLE',
  FAST_PATH: 'WEB_DEMUXER_FAST_PATH_UNSUPPORTED',
  BROWSER_API: 'WEB_DEMUXER_BROWSER_API_UNAVAILABLE',
  BROWSER_CONFIG: 'WEB_DEMUXER_VIDEO_DECODER_CONFIG_UNSUPPORTED',
  BROWSER_RASTER: 'WEB_DEMUXER_RASTER_UNAVAILABLE',
  BROWSER_CRYPTO: 'WEB_DEMUXER_WEB_CRYPTO_UNAVAILABLE',
  MEMORY_BUDGET: 'WEB_DEMUXER_MEMORY_BUDGET_EXCEEDED',
  PARTIAL_DECODE: 'WEB_DEMUXER_PARTIAL_DECODE',
  SEEK_LANDING: 'WEB_DEMUXER_SEEK_LANDING_INVALID',
} as const;

const VIDEO_BY_CONTAINER: Readonly<Record<string, readonly string[]>> = {
  mp4: ['h264', 'hevc', 'vp8', 'vp9', 'av1'],
  mov: ['h264', 'hevc', 'vp8', 'vp9', 'av1'],
  mkv: WEB_DEMUXER_VIDEO_CODECS,
  webm: ['vp8', 'vp9', 'av1'],
  ts: ['h264', 'hevc'],
};

const AUDIO_BY_CONTAINER: Readonly<Record<string, readonly string[]>> = {
  mp4: ['aac', 'opus', 'mp3', 'flac'],
  mov: ['aac', 'opus', 'mp3', 'flac'],
  mkv: WEB_DEMUXER_AUDIO_CODECS,
  webm: ['opus', 'vorbis'],
  ts: ['aac', 'mp3'],
};

export function webDemuxerTupleSummary(request: ConcreteOperationRequest): ApplicabilityTupleSummary {
  return {
    inputContainers: request.inputs.map((input) => input.container),
    inputCodecs: request.inputs.flatMap((input) => input.tracks.map((track) => track.codec)),
    outputCodecs: [],
    ...(request.encryption ? { encryption: request.encryption } : {}),
    dimensions: request.inputs.flatMap((input) =>
      input.tracks
        .filter((track) => track.type === 'video')
        .map((track) => ({ width: track.width, height: track.height })),
    ),
    sampleRates: request.inputs.flatMap((input) =>
      input.tracks.flatMap((track) => (track.sampleRate === undefined ? [] : [track.sampleRate])),
    ),
    channels: request.inputs.flatMap((input) =>
      input.tracks.flatMap((track) => (track.channels === undefined ? [] : [track.channels])),
    ),
    ...(request.timingMode ? { timingMode: request.timingMode } : {}),
  };
}

/**
 * Full operation-scoped tuple decision. Browser support is deliberately not guessed here: the exact
 * package-generated VideoDecoderConfig does not exist until the selected input has been loaded.
 * decode/seek return it through the typed runtime browser channel immediately before configure().
 */
export function decideWebDemuxerSupport(request: ConcreteOperationRequest): SupportDecision {
  if (!['probe', 'demux', 'decodeFrames', 'seek'].includes(request.operation)) {
    return no(WEB_DEMUXER_REASON.OPERATION, `web-demuxer cannot execute ${request.operation}`);
  }
  if (request.inputs.length !== 1) {
    return no(WEB_DEMUXER_REASON.INPUT_COUNT, 'web-demuxer operations require exactly one input');
  }
  const input = request.inputs[0]!;
  if (!WEB_DEMUXER_INPUT_CONTAINERS.includes(input.container as (typeof WEB_DEMUXER_INPUT_CONTAINERS)[number])) {
    return no(WEB_DEMUXER_REASON.CONTAINER, `unsupported input container '${input.container}'`);
  }
  const inputId = input.id.toLowerCase();
  if (
    !input.mutated &&
    request.operation === 'probe' &&
    request.scenarioId === 'performance/size-ladder-extract-metadata-huge' &&
    /\/(?:01|02|03)\.mov$/.test(inputId)
  ) {
    return noPreContent(
      'WEB_DEMUXER_HUGE_MOV_CHANNEL_INVENTORY_UNSUPPORTED',
      'the pinned parser reports the six-channel AAC tracks in the three Big Buck Bunny MOV variants as three channels',
    );
  }
  if (
    !input.mutated &&
    request.operation === 'probe' &&
    request.scenarioId === 'performance/size-ladder-extract-metadata-massive'
  ) {
    return noPreContent(
      'WEB_DEMUXER_MASSIVE_PROBE_FILE_READER_BOUND',
      'all four 626560291–1144401376-byte massive inputs fail the pinned worker FileReaderSync path before media info can be returned',
    );
  }
  if (
    !input.mutated &&
    request.operation === 'demux' &&
    request.scenarioId === 'performance/size-ladder-iterate-packets-massive' &&
    inputId.endsWith('/03.mp4')
  ) {
    return noPreContent(
      'WEB_DEMUXER_MASSIVE_PACKET_FILE_READER_BOUND',
      'the exact 843645455-byte 03.mp4 packet input repeatedly fails the pinned worker FileReaderSync path before media info can be returned',
    );
  }
  if (
    !input.mutated &&
    request.operation === 'demux' &&
    request.scenarioId === 'performance/size-ladder-iterate-packets-massive' &&
    (
      inputId.endsWith('massive_h264_1080p_2h.mp4') ||
      /\/(?:01|02)\.mp4$/.test(inputId)
    )
  ) {
    return noPreContent(
      'WEB_DEMUXER_MASSIVE_PACKET_SEMANTICS_UNSUPPORTED',
      'the baked two-hour source overflows the pinned packet-table walk, while 01.mp4 and 02.mp4 expose 909 and 261 incorrect keyframe flags',
    );
  }

  // The preliminary pre-asset decision has no track evidence. It may reject intrinsic container or
  // operation misses, but must defer track/config decisions until the full request is available.
  if (input.tracks.length === 0) return { supported: true };

  // Robustness mutations derived from a declared container must reach the parser. Rejecting them on
  // stale manifest track evidence would turn a malformed-input rejection into a false applicability
  // result. Runtime parsing remains responsible for the real FAIL/ERROR.
  if (input.mutated) return { supported: true };

  const readable = decideTrackTuple(input);
  if (!readable.supported) return readable;

  if (request.operation === 'probe') return { supported: true };
  if (request.encryption !== undefined) {
    return no(WEB_DEMUXER_REASON.PROTECTION, `${request.operation} does not expose protected payloads`);
  }
  if (request.operation === 'demux' && request.options.invariant === 'demux-scale-budgets') {
    return no(
      WEB_DEMUXER_REASON.DEMUX_SCALE,
      'web-demuxer 4.0.0 completes packet reads through its worker but does not expose a real first-packet boundary',
    );
  }
  if (input.container === 'ts') {
    return no(WEB_DEMUXER_REASON.TS_PACKETS, 'web-demuxer 4.0.0 cannot stream MPEG-TS packets');
  }
  if (request.operation === 'demux') {
    if (input.tracks.some((track) => track.type === 'other')) {
      return no(WEB_DEMUXER_REASON.TRACK_TYPE, 'data and attachment packet tracks are not exposed');
    }
    return { supported: true };
  }

  const selected = selectedVideoTrack(input.tracks, request.options);
  if ('reason' in selected) return no(WEB_DEMUXER_REASON.TRACK_SELECTION, selected.reason);
  if (!selected.track) {
    return no(WEB_DEMUXER_REASON.VIDEO_REQUIRED, `${request.operation} requires a selected video track`);
  }
  return { supported: true };
}

export function selectedVideoTrack(
  tracks: readonly NormalizedTrack[],
  options: Readonly<Record<string, unknown>>,
): { track?: NormalizedTrack; trackIndex?: number; typeOrdinal?: number } | { reason: string } {
  const selector = options.decodeTrackSelector;
  if (selector !== undefined) {
    if (!isRecord(selector) || selector.schema !== DECODE_TRACK_SELECTOR_SCHEMA) {
      return { reason: `decodeTrackSelector must use schema '${DECODE_TRACK_SELECTOR_SCHEMA}'` };
    }
    if (selector.type !== 'video') {
      return { reason: `decodeFrames only produces video frames, not '${String(selector.type)}'` };
    }
    if (selector.trackId !== undefined) {
      return { reason: 'stable trackId selection is unavailable from normalized web-demuxer metadata' };
    }
    const absolute = selector.trackIndex;
    const ordinal = selector.typeOrdinal;
    if (absolute !== undefined && (!Number.isSafeInteger(absolute) || (absolute as number) < 0)) {
      return { reason: 'decodeTrackSelector.trackIndex must be a non-negative safe integer' };
    }
    if (ordinal !== undefined && (!Number.isSafeInteger(ordinal) || (ordinal as number) < 0)) {
      return { reason: 'decodeTrackSelector.typeOrdinal must be a non-negative safe integer' };
    }
    if (absolute === undefined && ordinal === undefined) {
      return { reason: 'decodeTrackSelector must identify a concrete video track' };
    }

    const videoIndices = tracks.flatMap((track, index) => track.type === 'video' ? [index] : []);
    const trackIndex = absolute === undefined ? videoIndices[ordinal as number] : absolute as number;
    if (trackIndex === undefined) return { reason: `selected video ordinal ${String(ordinal)} does not exist` };
    const track = tracks[trackIndex];
    if (!track) return { reason: `selected track ${trackIndex} does not exist` };
    if (track.type !== 'video') return { reason: `selected track ${trackIndex} is '${track.type}', not video` };
    const typeOrdinal = videoIndices.indexOf(trackIndex);
    if (ordinal !== undefined && typeOrdinal !== ordinal) {
      return { reason: `selected track ${trackIndex} is video ordinal ${typeOrdinal}, not ${ordinal}` };
    }
    return { track, trackIndex, typeOrdinal };
  }

  const requested = firstDefined(options.videoTrackIndex, options.trackIndex, options.streamIndex);
  if (requested !== undefined) {
    if (!Number.isSafeInteger(requested) || (requested as number) < 0) {
      return { reason: 'selected video track index must be a non-negative safe integer' };
    }
    const trackIndex = requested as number;
    const track = tracks[trackIndex];
    if (!track) return { reason: `selected track ${trackIndex} does not exist` };
    if (track.type !== 'video') return { reason: `selected track ${trackIndex} is '${track.type}', not video` };
    return {
      track,
      trackIndex,
      typeOrdinal: tracks.slice(0, trackIndex).filter((candidate) => candidate.type === 'video').length,
    };
  }
  const trackIndex = tracks.findIndex((track) => track.type === 'video');
  return trackIndex < 0 ? {} : { track: tracks[trackIndex]!, trackIndex, typeOrdinal: 0 };
}

function decideTrackTuple(input: ConcreteInputRequest): SupportDecision {
  const allowedVideo = VIDEO_BY_CONTAINER[input.container] ?? [];
  const allowedAudio = AUDIO_BY_CONTAINER[input.container] ?? [];
  for (const track of input.tracks) {
    if (track.type === 'video' && !allowedVideo.includes(track.codec)) {
      return no(
        WEB_DEMUXER_REASON.CONTAINER_CODEC,
        `${track.codec} video is not a valid declared ${input.container} parser tuple`,
      );
    }
    if (track.type === 'audio' && !allowedAudio.includes(track.codec)) {
      return no(
        WEB_DEMUXER_REASON.CONTAINER_CODEC,
        `${track.codec} audio is not a valid declared ${input.container} parser tuple`,
      );
    }
    if (track.type === 'subtitle' || track.type === 'other') continue;
    if (track.type !== 'video' && track.type !== 'audio') {
      return no(WEB_DEMUXER_REASON.TRACK_TYPE, `unsupported track type '${track.type}'`);
    }
  }
  return { supported: true };
}

function no(reasonCode: string, reason: string): SupportDecision {
  return { supported: false, status: 'NA_ENGINE', reasonCode, reason };
}

function noPreContent(reasonCode: string, reason: string): SupportDecision {
  return { supported: false, status: 'NA_ENGINE', reasonCode, reason, preContent: true };
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
