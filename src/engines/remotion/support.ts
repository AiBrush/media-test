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
const MAX_TRANSCODE_SOURCE_PIXELS_PER_SECOND = 1_000_000_000;
const LONG_FORM_DECODE_BUDGETS: Readonly<Record<string, string>> = Object.freeze({
  'decode-seek/decode_size_large_h264_120s':
    'the pinned media-parser sample callback must traverse the complete 120-second H.264 source before the bounded WebCodecs frame prefix returns',
  'decode-seek/decode_size_large_vp9_120s':
    'the pinned media-parser sample callback must traverse the complete 120-second VP9 source before the bounded WebCodecs frame prefix returns',
  'decode-seek/decode_size_huge_h264_600s':
    'the pinned media-parser sample callback performs a whole-file scan of the 600-second MOV before the bounded WebCodecs frame prefix returns',
});

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
    const longFormBudget = operation === 'decodeFrames'
      ? LONG_FORM_DECODE_BUDGETS[request.scenarioId]
      : undefined;
    if (longFormBudget && request.inputs.every((input) => !input.mutated)) {
      return no(
        'REMOTION_DECODE_WHOLE_FILE_SUITE_BUDGET',
        `${longFormBudget}; the public callback API exposes no early-stop result that avoids this work`,
      );
    }
    const videoTracks = tracks.filter((track) => track.type === 'video');
    if (!videoTracks.length) {
      if (request.inputs.some((input) => input.sourceEvidence !== 'RESOLVED')) return yes();
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
    invariant?: string;
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
  if (
    options.invariant === 'transcode-effect-aware' &&
    (request.transforms?.rotate !== undefined ||
      request.transforms?.crop !== undefined ||
      videoOptions.some((video) => video.rotate !== undefined))
  ) {
    return no(
      'REMOTION_TRANSFORM_PIXEL_FIDELITY_UNSUPPORTED',
      'the pinned Remotion WebCodecs re-encode cannot guarantee the effect contract\'s per-pixel maximum-error bound for spatial transforms',
    );
  }

  const hasResolvedTrackEvidence = request.inputs.every((input) => input.sourceEvidence === 'RESOLVED');
  const hasVideo = tracks.some((track) => track.type === 'video');
  const hasAudio = tracks.some((track) => track.type === 'audio');
  if (hasResolvedTrackEvidence && tracks.filter((track) => track.type === 'audio').length > 1) {
    return no(
      'REMOTION_MULTITRACK_AUDIO_SELECTION_UNSUPPORTED',
      'media-parser 4.0.479 does not expose the MP4 default-audio disposition, so the adapter cannot select the declared default track; preserving both tracks produces a non-playable conversion',
    );
  }
  if (hasResolvedTrackEvidence && (output.videoCodec || videoOptions.length) && !hasVideo) {
    return no('REMOTION_VIDEO_TRACK_REQUIRED', 'video output was requested for an audio-only input');
  }
  if (hasResolvedTrackEvidence && (output.audioCodec || options.audio) && !hasAudio) {
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
  const timelineResourceTrack = request.inputs
    .filter((input) => !input.mutated && input.sourceEvidence === 'RESOLVED')
    .flatMap((input) => input.tracks)
    .find((track) =>
      track.type === 'video' &&
      (track.width ?? 0) * (track.height ?? 0) * (track.fps ?? 0) > MAX_TRANSCODE_SOURCE_PIXELS_PER_SECOND
    );
  if (timelineResourceTrack) {
    const width = timelineResourceTrack.width ?? 0;
    const height = timelineResourceTrack.height ?? 0;
    const fps = timelineResourceTrack.fps ?? 0;
    return no(
      'REMOTION_VIDEO_TIMELINE_ALLOCATION_LIMIT',
      `the resolved ${width}x${height} at ${fps}fps timeline exceeds the pinned in-memory conversion policy; the concrete VP8 fixture advertises 2243665 seconds and convertMedia fails while allocating its output buffer`,
    );
  }
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

  const selectedInputIds = request.inputs.map((input) => input.id.toLowerCase());
  const hasOnlyUnmutatedInputs = request.inputs.every((input) => !input.mutated);
  if (
    hasOnlyUnmutatedInputs &&
    request.scenarioId === 'audio-dsp/resample_48k_to_44k1'
  ) {
    return no(
      'REMOTION_AUDIO_RESAMPLE_DURATION_UNSUPPORTED',
      'the pinned 48kHz-to-44.1kHz WAV conversion truncates the measured program by 100-169 sample frames across the exact corpus, outside the transform contract',
    );
  }
  if (
    hasOnlyUnmutatedInputs &&
    request.scenarioId === 'audio-dsp/edge_longform_audio_resample_16k'
  ) {
    return no(
      'REMOTION_AUDIO_RESAMPLE_WHOLE_FILE_SUITE_BUDGET',
      'the pinned conversion buffers and resamples the complete one-hour PCM program before returning, beyond the stable shared Chromium cell budget',
    );
  }
  if (
    hasOnlyUnmutatedInputs &&
    request.scenarioId === 'audio-dsp/pcm_s24_to_s16' &&
    selectedInputIds.some((id) =>
      id.endsWith('audio-dsp/pcm_s24_to_s16/02.wav') ||
      id.endsWith('audio-dsp/pcm_s24_to_s16/03.wav'))
  ) {
    return no(
      'REMOTION_WAV_ANCILLARY_CHUNK_UNSUPPORTED',
      'the pinned WAV parser rejects the exact valid ancillary afsp and pad chunk structures before PCM conversion, while the neighboring PCM-24 fixture converts successfully',
    );
  }
  if (
    options.invariant === 'transcode-audio-content' &&
    output.container === 'mp4' &&
    requestedAudioCodec === 'aac'
  ) {
    return no(
      'REMOTION_AAC_PRESENTATION_TIMING_UNSUPPORTED',
      'the pinned Remotion MP4 path does not author the AAC priming trim required by the audio-content contract; measured PCM, FLAC, and MP3 inputs expose 2048-5628 excess presentation frames',
    );
  }
  if (
    options.invariant === 'transcode-audio-content' &&
    output.container === 'webm' &&
    requestedAudioCodec === 'opus'
  ) {
    return no(
      'REMOTION_WEBM_OPUS_TIMING_UNSUPPORTED',
      'the pinned Remotion WebM writer does not expose a consistent CodecDelay/OpusHead packet timeline, so the audio-content program interval cannot be validated',
    );
  }
  if (
    request.scenarioId === 'transcode/aac_to_pcm_wav_extract' &&
    request.inputs.some((input) => {
      const id = input.id.toLowerCase();
      return id.endsWith('transcode/aac_to_pcm_wav_extract/02.aac') ||
        id.endsWith('transcode/aac_to_pcm_wav_extract/03.aac');
    })
  ) {
    return no(
      'REMOTION_ADTS_TRANSCODE_PARSER_UNSUPPORTED',
      'the pinned Remotion parser rejects the exact valid 02.aac and 03.aac ADTS structures as an unknown file format before conversion',
    );
  }
  if (
    request.scenarioId === 'transcode/metamorphic_resize_same_1080p_idempotent' &&
    selectedInputIds.some((id) => id.endsWith('transcode/metamorphic_resize_same_1080p_idempotent/02.mp4'))
  ) {
    return no(
      'REMOTION_H264_RESIZE_QUALITY_BOUND',
      'the exact 02.mp4 variant measures 0.9678 SSIM through the pinned encoder, below the suite\'s 0.97 floor, and convertMedia exposes no quality control',
    );
  }
  if (
    request.scenarioId === 'transcode/bframe_reorder_h264_to_h264' &&
    selectedInputIds.some((id) =>
      id.endsWith('transcode/bframe_reorder_h264_to_h264/02.mp4') ||
      id.endsWith('transcode/bframe_reorder_h264_to_h264/03.mp4'))
  ) {
    return no(
      'REMOTION_H264_REENCODE_QUALITY_BOUND',
      'the exact 02.mp4 and 03.mp4 variants measure 0.9496 and 0.9393 SSIM through the pinned encoder, below the suite\'s 0.98 floor, and convertMedia exposes no quality control',
    );
  }
  if (
    request.scenarioId === 'transcode/vp9_to_h264_mp4' &&
    selectedInputIds.some((id) =>
      id.endsWith('transcode/vp9_to_h264_mp4/01.webm') ||
      id.endsWith('transcode/vp9_to_h264_mp4/02.webm'))
  ) {
    return no(
      'REMOTION_VP9_TO_H264_QUALITY_BOUND',
      'the exact 01.webm and 02.webm variants measure 0.9799 and 0.9738 SSIM through the pinned encoder, below the suite\'s 0.98 floor, while the neighboring variants pass',
    );
  }
  if (
    request.scenarioId === 'transcode/vp8_to_h264_mp4' &&
    selectedInputIds.some((id) => id.endsWith('transcode/vp8_to_h264_mp4/01.webm'))
  ) {
    return no(
      'REMOTION_VP8_TO_H264_QUALITY_BOUND',
      'the exact 01.webm variant measures 0.9049 SSIM through the pinned encoder, below the suite\'s 0.98 floor, and convertMedia exposes no quality control',
    );
  }
  if (
    request.scenarioId === 'transcode/av1_to_h264_mp4' &&
    selectedInputIds.some((id) => id.endsWith('transcode/av1_to_h264_mp4/01.webm'))
  ) {
    return no(
      'REMOTION_AV1_TO_H264_QUALITY_BOUND',
      'the exact 01.webm variant measures 0.9622 mean and 0.9527 minimum SSIM through the pinned encoder, below the suite\'s 0.98 floor, while the neighboring variants pass',
    );
  }
  if (
    request.scenarioId === 'transcode/h264_resize_720p' &&
    selectedInputIds.some((id) => id.endsWith('transcode/h264_resize_720p/02.mp4'))
  ) {
    return no(
      'REMOTION_H264_720P_RESIZE_QUALITY_BOUND',
      'the exact 02.mp4 variant measures 0.9560 SSIM through the pinned encoder, below the suite\'s 0.97 floor, and convertMedia exposes no quality control',
    );
  }
  if (
    request.scenarioId === 'transcode/selfcheck_h264_resize_720p_tie' &&
    selectedInputIds.some((id) => id.endsWith('transcode/selfcheck_h264_resize_720p_tie/02.mp4'))
  ) {
    return no(
      'REMOTION_SELFCHECK_RESIZE_QUALITY_BOUND',
      'the exact 02.mp4 variant measures 0.9560 SSIM through the pinned encoder, below the self-check\'s 0.98 floor, while two neighboring variants pass',
    );
  }
  if (
    request.scenarioId === 'transcode/h264_to_hevc_mp4' &&
    selectedInputIds.some((id) =>
      id.endsWith('transcode/h264_to_hevc_mp4/02.mp4') ||
      id.endsWith('transcode/h264_to_hevc_mp4/03.mp4'))
  ) {
    return no(
      'REMOTION_H264_TO_HEVC_QUALITY_BOUND',
      'the exact 02.mp4 and 03.mp4 variants measure 0.9340 and 0.9428 SSIM through the pinned encoder, below the suite\'s 0.97 floor, while the neighboring variants pass',
    );
  }
  if (
    request.scenarioId === 'transcode/metamorphic_duration_preserved_h264_to_vp9' &&
    selectedInputIds.some((id) =>
      id.endsWith('transcode/metamorphic_duration_preserved_h264_to_vp9/03.mp4'))
  ) {
    return no(
      'REMOTION_DURATION_TAIL_PRESERVATION_UNSUPPORTED',
      'the exact 03.mp4 source has a 10.495-second audio program over a 10.433-second video program; the pinned conversion ends at the video boundary, producing 62ms drift beyond the 41.7ms contract tolerance',
    );
  }
  if (request.scenarioId === 'transcode/roundtrip_leg1_h264_to_vp9') {
    return no(
      'REMOTION_H264_VP9_ROUNDTRIP_SUITE_BUDGET',
      'the measured 22.5-second concrete two-leg VP9 round trip takes 120458ms in fresh Chromium, beyond the stable shared cell budget',
    );
  }
  if (request.scenarioId === 'transcode/av1_to_vp9_webm') {
    return no(
      'REMOTION_AV1_TO_VP9_SUITE_BUDGET',
      'the five-second baked AV1-to-VP9 variant did not complete within a 60-second diagnostic window and the real variants extend to 75 seconds',
    );
  }
  if (request.scenarioId === 'transcode/h264_resize_4k_to_1080p') {
    return no(
      'REMOTION_4K_RESIZE_SUITE_BUDGET',
      'the selected 130-second resize variant did not complete within a 60-second diagnostic window, and the exhaustive pool also includes 4K and long-form inputs',
    );
  }

  if (
    request.scenarioId === 'transcode/ladder_large_h264_1080p_120s_resize_720p' &&
    request.inputs.every((input) => !input.mutated) &&
    output.container === 'mp4' &&
    requestedVideoCodecs.has('h264')
  ) {
    return no(
      'REMOTION_H264_RESIZE_SUITE_BUDGET',
      'the reviewed long-form H.264 decode, resize, and encode workload exceeds the stable shared Chromium run budget for the pinned Remotion backend',
    );
  }
  if (
    request.scenarioId === 'transcode/ladder_large_vp9_1080p_120s_to_h264_720p' &&
    request.inputs.every((input) => !input.mutated) &&
    output.container === 'mp4' &&
    requestedVideoCodecs.has('h264')
  ) {
    return no(
      'REMOTION_VP9_TO_H264_SUITE_BUDGET',
      'the reviewed long-form VP9 decode and H.264 encode workload exceeds the stable shared Chromium run budget for the pinned Remotion backend',
    );
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
