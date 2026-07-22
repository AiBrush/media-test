import type {
  ApplicabilityTupleSummary,
  ConcreteInputRequest,
  ConcreteOperationRequest,
  NormalizedTrack,
  SupportDecision,
} from '../../core/engine.ts';

export const REMOTION_INPUT_CONTAINERS = [
  'mp4',
  'mov',
  'mkv',
  'webm',
  'ts',
  'hls',
  'wav',
  'mp3',
  'flac',
  'adts',
] as const;

export const REMOTION_OUTPUT_CONTAINERS = ['mp4', 'webm', 'wav'] as const;

const READ_VIDEO_BY_CONTAINER: Readonly<Record<string, readonly string[]>> = {
  mp4: ['h264', 'hevc', 'av1'],
  mov: ['h264', 'hevc'],
  mkv: ['h264', 'hevc', 'vp8', 'vp9', 'av1'],
  webm: ['vp8', 'vp9', 'av1'],
  ts: ['h264', 'hevc'],
  hls: ['h264', 'hevc'],
  wav: [],
  mp3: [],
  flac: [],
  adts: [],
};

const READ_AUDIO_BY_CONTAINER: Readonly<Record<string, readonly string[]>> = {
  mp4: ['aac', 'mp3', 'opus'],
  mov: ['aac', 'mp3', 'pcm-s16', 'pcm-s24'],
  mkv: ['aac', 'opus', 'mp3', 'flac', 'vorbis', 'pcm-s16', 'pcm-s24'],
  webm: ['opus', 'vorbis'],
  ts: ['aac', 'mp3'],
  hls: ['aac', 'mp3'],
  wav: ['pcm-s16', 'pcm-s24'],
  mp3: ['mp3'],
  flac: ['flac'],
  adts: ['aac'],
};

const COPY_VIDEO_BY_CONTAINER: Readonly<Record<string, readonly string[]>> = {
  mp4: ['h264', 'hevc'],
  webm: ['vp8', 'vp9'],
  wav: [],
};

const COPY_AUDIO_BY_CONTAINER: Readonly<Record<string, readonly string[]>> = {
  mp4: ['aac'],
  webm: ['opus'],
  wav: [],
};

const COPY_INPUT_CONTAINERS_BY_OUTPUT: Readonly<Record<string, readonly string[]>> = {
  mp4: ['mp4', 'mov', 'hls'],
  webm: ['mkv', 'webm'],
  wav: [],
};

const ENCODE_VIDEO_BY_CONTAINER: Readonly<Record<string, readonly string[]>> = {
  mp4: ['h264', 'hevc'],
  webm: ['vp8', 'vp9'],
  wav: [],
};

const ENCODE_AUDIO_BY_CONTAINER: Readonly<Record<string, readonly string[]>> = {
  mp4: ['aac'],
  webm: ['opus'],
  wav: ['pcm-s16'],
};

const MAX_BUFFER_WRITER_INPUT_BYTES = 512 * 1024 * 1024;

function isDemuxScaleRequest(request: ConcreteOperationRequest): boolean {
  const robustness = request.options.robustness;
  return request.operation === 'demux'
    && typeof robustness === 'object'
    && robustness !== null
    && (robustness as Record<string, unknown>).schema === 'media-test/demux-scale-contract@1';
}

export function remotionTupleSummary(request: ConcreteOperationRequest): ApplicabilityTupleSummary {
  return {
    inputContainers: request.inputs.map((input) => input.container),
    inputCodecs: request.inputs.flatMap((input) => input.tracks.map((track) => track.codec)),
    ...(request.output?.container ? { outputContainer: request.output.container } : {}),
    outputCodecs: [request.output?.videoCodec, request.output?.audioCodec].filter(
      (codec): codec is string => codec !== undefined,
    ),
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

export function decideRemotionParserSupport(request: ConcreteOperationRequest): SupportDecision {
  if (request.operation !== 'probe' && request.operation !== 'demux') {
    return no('REMOTION_PARSER_OPERATION_UNDECLARED', `media-parser cannot execute ${request.operation}`);
  }
  if (isDemuxScaleRequest(request)) {
    return no(
      'REMOTION_DEMUX_SCALE_PACKET_BOUNDARY_UNAVAILABLE',
      'media-parser 4.0.479 completes its full sample-callback walk before returning and cannot expose the scale contract\'s observable first-packet boundary',
    );
  }
  return decideReadableInputs(request.inputs);
}

export function decideRemotionWebcodecsSupport(request: ConcreteOperationRequest): SupportDecision {
  const operation = request.operation;
  if (!['probe', 'demux', 'decodeFrames', 'seek', 'remux', 'transcode'].includes(operation)) {
    return no('REMOTION_OPERATION_UNDECLARED', `Remotion cannot execute ${operation}`);
  }

  const readable = decideReadableInputs(request.inputs);
  if (!readable.supported) return readable;

  if (operation !== 'remux' && request.inputs.length !== 1) {
    return no('REMOTION_SINGLE_INPUT_ONLY', `${operation} requires exactly one input`);
  }

  if (operation === 'probe' || operation === 'demux') return yes();

  const tracks = request.inputs.flatMap((input) => input.tracks);
  if (operation === 'decodeFrames' || operation === 'seek') {
    const videoTracks = tracks.filter((track) => track.type === 'video');
    if (!videoTracks.length) {
      return no('REMOTION_VIDEO_TRACK_REQUIRED', `${operation} requires a video track`);
    }
    if (!videoTracks.some((track) => ['h264', 'hevc', 'vp8', 'vp9', 'av1'].includes(track.codec))) {
      return no('REMOTION_VIDEO_DECODER_UNIMPLEMENTED', 'no selected video track has a WebCodecs decoder mapping');
    }
    return yes();
  }

  const output = request.output;
  if (!output || !REMOTION_OUTPUT_CONTAINERS.includes(output.container as (typeof REMOTION_OUTPUT_CONTAINERS)[number])) {
    return no('REMOTION_OUTPUT_CONTAINER_UNSUPPORTED', `Remotion cannot write ${output?.container ?? 'an unspecified container'}`);
  }

  const oversized = request.inputs.find(
    (input) => input.sizeBytes !== undefined && input.sizeBytes > MAX_BUFFER_WRITER_INPUT_BYTES,
  );
  if (oversized) {
    return no(
      'REMOTION_BUFFER_WRITER_RESOURCE_LIMIT',
      `input is ${oversized.sizeBytes} bytes, above the adapter's ${MAX_BUFFER_WRITER_INPUT_BYTES}-byte in-memory writer policy`,
    );
  }

  if (operation === 'remux') return decideCopyOnly(output.container, tracks, request.inputs);

  if (request.encryption) {
    return no('REMOTION_ENCRYPTION_UNSUPPORTED', 'Remotion WebCodecs has no encrypted output path');
  }
  if (request.transforms?.frameRate !== undefined || output.frameRate !== undefined) {
    return no('REMOTION_OUTPUT_FPS_UNSUPPORTED', 'convertMedia has no exact output frame-rate option');
  }
  if (request.transforms?.audio?.channels !== undefined || output.channels !== undefined) {
    return no('REMOTION_CHANNEL_REMAP_UNSUPPORTED', 'convertMedia cannot remap audio channel count');
  }

  type VideoRequest = {
    codec?: string;
    bitrate?: number;
    width?: number;
    height?: number;
    fps?: number;
    rotate?: number;
  };
  const options = request.options as {
    video?: VideoRequest;
    audio?: { bitrate?: number; codec?: string; sampleRate?: number; channels?: number };
    variants?: VideoRequest[];
  };
  const explicitVideoOptions = options.variants?.length ? options.variants : options.video ? [options.video] : [];
  const impliedVideoOptions: VideoRequest = {
    width: request.transforms?.resize?.width ?? output.width,
    height: request.transforms?.resize?.height ?? output.height,
    rotate: request.transforms?.rotate,
  };
  const hasImpliedVideoOptions = Object.values(impliedVideoOptions).some((value) => value !== undefined);
  const videoOptions = explicitVideoOptions.length
    ? explicitVideoOptions.map((video) => ({ ...impliedVideoOptions, ...video }))
    : hasImpliedVideoOptions
      ? [impliedVideoOptions]
      : [];
  if (videoOptions.some((video) => video.fps !== undefined)) {
    return no('REMOTION_OUTPUT_FPS_UNSUPPORTED', 'convertMedia has no exact output frame-rate option');
  }
  if (videoOptions.some((video) => video.bitrate !== undefined)) {
    return no('REMOTION_VIDEO_BITRATE_UNSUPPORTED', 'convertMedia does not expose an exact video bitrate option');
  }
  if (options.audio?.channels !== undefined) {
    return no('REMOTION_CHANNEL_REMAP_UNSUPPORTED', 'convertMedia cannot remap audio channel count');
  }
  const requestedSampleRate = options.audio?.sampleRate
    ?? request.transforms?.audio?.sampleRate
    ?? output.sampleRate;
  if (requestedSampleRate !== undefined && requestedSampleRate <= 0) {
    return no('REMOTION_INVALID_SAMPLE_RATE', 'audio sample rate must be positive');
  }
  if (requestedSampleRate !== undefined && output.container !== 'wav') {
    return no(
      'REMOTION_NON_WAV_SAMPLE_RATE_UNSUPPORTED',
      'the pinned browser encoders do not honor non-WAV sample-rate requests exactly',
    );
  }
  if (output.container === 'wav' && videoOptions.length) {
    return no('REMOTION_WAV_VIDEO_OUTPUT_UNSUPPORTED', 'WAV cannot satisfy a requested video output');
  }

  const hasVideo = tracks.some((track) => track.type === 'video');
  const hasAudio = tracks.some((track) => track.type === 'audio');
  if ((output.videoCodec || videoOptions.length) && !hasVideo) {
    return no('REMOTION_VIDEO_TRACK_REQUIRED', 'video output was requested for an audio-only input');
  }
  if ((output.audioCodec || options.audio) && !hasAudio) {
    return no('REMOTION_AUDIO_TRACK_REQUIRED', 'audio output was requested for an input without audio');
  }

  const requestedVideoCodecs = new Set(
    videoOptions
      .map((video) => video.codec)
      .filter((codec): codec is string => codec !== undefined),
  );
  if (output.videoCodec) requestedVideoCodecs.add(output.videoCodec);
  if (!requestedVideoCodecs.size && hasVideo && output.container !== 'wav') {
    const fallback = defaultVideoCodec(output.container);
    if (fallback) requestedVideoCodecs.add(fallback);
  }
  const unsupportedVideoCodec = [...requestedVideoCodecs].find(
    (codec) => !ENCODE_VIDEO_BY_CONTAINER[output.container]?.includes(codec),
  );
  if (unsupportedVideoCodec) {
    return no(
      'REMOTION_VIDEO_ENCODE_TUPLE_UNSUPPORTED',
      `${unsupportedVideoCodec} cannot be encoded into ${output.container}`,
    );
  }
  const requestedAudioCodec = output.audioCodec
    ?? options.audio?.codec
    ?? (hasAudio ? defaultAudioCodec(output.container) : undefined);
  if (requestedAudioCodec && !ENCODE_AUDIO_BY_CONTAINER[output.container]?.includes(requestedAudioCodec)) {
    return no(
      requestedAudioCodec === 'pcm-s24' ? 'REMOTION_PCM_S24_OUTPUT_UNSUPPORTED' : 'REMOTION_AUDIO_ENCODE_TUPLE_UNSUPPORTED',
      `${requestedAudioCodec} cannot be encoded exactly into ${output.container}`,
    );
  }

  const sourceVideo = tracks.find((track) => track.type === 'video');
  for (const video of videoOptions) {
    if ((video.width !== undefined && video.width <= 0) || (video.height !== undefined && video.height <= 0)) {
      return no('REMOTION_INVALID_DIMENSIONS', 'video dimensions must be positive');
    }
    if (video.width !== undefined && video.height !== undefined && sourceVideo?.width && sourceVideo.height) {
      if (sourceVideo.width * video.height !== sourceVideo.height * video.width) {
        return no(
          'REMOTION_RESIZE_BOX_NOT_EXACT',
          'the requested width/height changes aspect ratio, while convertMedia only exposes aspect-preserving box fit',
        );
      }
    }
    const rotate = normalizeRotation(video.rotate ?? request.transforms?.rotate);
    if (output.container === 'mp4' && (rotate === 90 || rotate === 270)) {
      return no('REMOTION_ROTATED_MP4_UNSUPPORTED', 'quarter-turn MP4 output is not reliable in the pinned package');
    }
  }

  return yes();
}

function decideReadableInputs(inputs: readonly ConcreteInputRequest[]): SupportDecision {
  if (!inputs.length) return no('REMOTION_INPUT_REQUIRED', 'the operation requires an input');
  for (const input of inputs) {
    if (!REMOTION_INPUT_CONTAINERS.includes(input.container as (typeof REMOTION_INPUT_CONTAINERS)[number])) {
      return no('REMOTION_INPUT_CONTAINER_UNSUPPORTED', `Remotion cannot parse ${input.container}`);
    }
    for (const track of input.tracks) {
      const allowed = track.type === 'video'
        ? READ_VIDEO_BY_CONTAINER[input.container]
        : track.type === 'audio'
          ? READ_AUDIO_BY_CONTAINER[input.container]
          : undefined;
      if (allowed && !allowed.includes(track.codec)) {
        return no(
          'REMOTION_INPUT_CODEC_TUPLE_UNSUPPORTED',
          `${input.container} track codec ${track.codec} is outside the pinned parser tuple matrix`,
        );
      }
    }
  }
  return yes();
}

function decideCopyOnly(
  outputContainer: string,
  tracks: readonly NormalizedTrack[],
  inputs: readonly ConcreteInputRequest[],
): SupportDecision {
  if (inputs.length !== 1) return no('REMOTION_REMUX_SINGLE_INPUT_ONLY', 'copy-only remux requires one input');
  const inputContainer = inputs[0]!.container;
  if (!COPY_INPUT_CONTAINERS_BY_OUTPUT[outputContainer]?.includes(inputContainer)) {
    return no(
      'REMOTION_REMUX_COPY_INCOMPATIBLE',
      `${inputContainer} tracks cannot be copied by the pinned package into ${outputContainer}`,
    );
  }
  // Empty runner metadata means the concrete track tuple is unresolved, not that the media was
  // proven trackless. Admit compatible wrappers and let parseMedia + canCopyTrack decide from the
  // actual file. A genuinely trackless input still receives REMOTION_REMUX_TRACK_REQUIRED at runtime.
  if (!tracks.length) return yes();
  for (const track of tracks) {
    if (track.type === 'other' || track.type === 'subtitle') {
      return no('REMOTION_REMUX_NON_AV_TRACK_UNSUPPORTED', 'copy-only remux cannot preserve non-audio/video tracks');
    }
    const allowed = track.type === 'video'
      ? COPY_VIDEO_BY_CONTAINER[outputContainer]
      : COPY_AUDIO_BY_CONTAINER[outputContainer];
    if (track.type === 'video' && normalizeRotation(track.rotation) !== 0) {
      return no(
        'REMOTION_REMUX_COPY_INCOMPATIBLE',
        'the pinned copy handler cannot preserve a non-zero source rotation without transformation',
      );
    }
    if (!allowed?.includes(track.codec)) {
      return no(
        'REMOTION_REMUX_COPY_INCOMPATIBLE',
        `${track.type} codec ${track.codec} cannot be copied into ${outputContainer}`,
      );
    }
  }
  return yes();
}

function defaultVideoCodec(container: string): string | undefined {
  return container === 'mp4' ? 'h264' : container === 'webm' ? 'vp8' : undefined;
}

function defaultAudioCodec(container: string): string | undefined {
  return container === 'mp4' ? 'aac' : container === 'webm' ? 'opus' : container === 'wav' ? 'pcm-s16' : undefined;
}

function normalizeRotation(value: number | undefined): number {
  return value === undefined ? 0 : ((value % 360) + 360) % 360;
}

function yes(): SupportDecision {
  return { supported: true };
}

function no(reasonCode: string, reason: string): SupportDecision {
  return { supported: false, status: 'NA_ENGINE', reasonCode, reason };
}
