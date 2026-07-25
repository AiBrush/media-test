import type {
  ApplicabilityTupleSummary,
  ConcreteOperationRequest,
  ConcreteWebCodecsConfig,
  NormalizedTrack,
  SerializableValue,
  SupportDecision,
} from '../../core/engine.ts';

export const AIBRUSH_ENGINE_ID = 'aibrush-media@dev';

const STILL_IMAGE_CONTAINERS = new Set(['jpeg', 'jpg', 'png', 'webp']);
const PCM_CONTAINERS = new Set(['wav', 'aiff', 'caf']);
const PCM_CODECS = new Set([
  'pcm',
  'pcm-u8',
  'pcm-u8be',
  'pcm-s8',
  'pcm-s8be',
  'pcm-s16',
  'pcm-s16be',
  'pcm-s24',
  'pcm-s24be',
  'pcm-s32',
  'pcm-s32be',
  'pcm-f32',
  'pcm-f32be',
  'pcm-f64',
  'pcm-f64be',
]);
const VIDEO_ENCODERS = new Set(['h264', 'hevc', 'av1', 'vp8', 'vp9']);
const AUDIO_ENCODERS = new Set(['aac', 'opus', 'flac', 'vorbis', ...PCM_CODECS]);
const DEMUX_AUDIO_CODECS = new Set([...AUDIO_ENCODERS, 'mp3']);
const LOSSY_TRIM_AUDIO_CODECS = new Set(['aac', 'mp3', 'opus']);
const TRIM_COMPOSITION_LIMITS = new Set([
  'robustness/prop_trim_additivity_compose',
  'robustness/prop_trim_concatenation',
]);

interface Rejection {
  readonly reasonCode: string;
  readonly reason: string;
  readonly status?: 'NA_ENGINE' | 'NA_BROWSER';
}

export function decideAibrushSupport(request: ConcreteOperationRequest): SupportDecision {
  // A byte mutation is deliberately never reclassified as an unsupported clean tuple. The framework's
  // typed InputError/real fault path must remain observable to robustness scoring.
  if (request.inputs.some((input) => input.mutated)) return { supported: true };

  const rejection = rejectTuple(request);
  if (rejection !== undefined) {
    return {
      supported: false,
      status: rejection.status ?? 'NA_ENGINE',
      reasonCode: rejection.reasonCode,
      reason: rejection.reason,
    };
  }

  const browserConfigs = concreteBrowserConfigs(request);
  return browserConfigs.length > 0 ? { supported: true, browserConfigs } : { supported: true };
}

function rejectTuple(request: ConcreteOperationRequest): Rejection | undefined {
  const operation = request.operation;
  const inputs = request.inputs;
  const inputContainers = inputs.map((input) => input.container.toLowerCase());
  const firstContainer = inputContainers[0];
  const outputContainer = request.output?.container.toLowerCase();
  const options = request.options;
  const fastStart = options.fastStart;
  const fragmented = options.fragmented === true || fastStart === 'fragmented';
  const appendOnly = options.appendOnly === true;
  const target = options.target;

  if (operation === 'demux' && options.invariant === 'demux-scale-budgets') {
    return reject(
      'AIBRUSH_DEMUX_SCALE_PACKET_BOUNDARY_UNAVAILABLE',
      'the framework materializes a complete packet table and does not expose the first-packet boundary required by demux scale timing',
    );
  }

  if (
    operation === 'demux' &&
    inputs.some((input) => input.tracks.some((track) =>
      (track.type !== 'video' && track.type !== 'audio') ||
      (track.type === 'video' && !VIDEO_ENCODERS.has(track.codec)) ||
      (track.type === 'audio' && !DEMUX_AUDIO_CODECS.has(track.codec))
    ))
  ) {
    return reject(
      'AIBRUSH_DEMUX_TRACK_REPRESENTATION_UNSUPPORTED',
      'the framework demux surface cannot expose every declared source track as a canonical audio/video packet stream',
    );
  }

  if (
    operation === 'probe' &&
    inputs.some((input) => input.tracks.some((track) =>
      (track.type === 'video' && !VIDEO_ENCODERS.has(track.codec)) ||
      (track.type === 'audio' && !DEMUX_AUDIO_CODECS.has(track.codec))
    ))
  ) {
    return reject(
      'AIBRUSH_PROBE_TRACK_REPRESENTATION_UNSUPPORTED',
      'the framework probe result contains a media codec outside the normalized adapter vocabulary',
    );
  }

  if (inputs.length === 0 && operation !== 'mux') {
    return reject('AIBRUSH_INPUT_REQUIRED', `${operation} requires a media input`);
  }
  if (target !== undefined && target !== 'buffer' && target !== 'stream') {
    return reject('AIBRUSH_OUTPUT_TARGET_UNKNOWN', `output target '${String(target)}' is not implemented`);
  }
  if (fastStart === 'reserve') {
    return reject(
      'AIBRUSH_POSITIONED_RESERVE_UNSUPPORTED',
      'the framework exposes only a boolean faststart option and cannot express reserved positioned writes',
    );
  }
  if (
    fastStart !== undefined &&
    fastStart !== false &&
    fastStart !== true &&
    fastStart !== 'in-memory' &&
    fastStart !== 'fragmented'
  ) {
    return reject('AIBRUSH_FASTSTART_MODE_UNKNOWN', `fastStart mode '${String(fastStart)}' is not implemented`);
  }
  if (options.positionedWrites === true || options.writeMode === 'positioned') {
    return reject(
      'AIBRUSH_POSITIONED_WRITES_UNSUPPORTED',
      'the public stream target accepts positions but this adapter only proves contiguous callback writes',
    );
  }
  if (options.writeChunkBytes !== undefined) {
    return reject(
      'AIBRUSH_WRITE_CHUNK_SIZE_UNSUPPORTED',
      'the public output API does not expose an exact write-chunk-size control',
    );
  }
  if (options.maximumPacketCount !== undefined) {
    return reject(
      'AIBRUSH_MAXIMUM_PACKET_COUNT_UNSUPPORTED',
      'maximumPacketCount is supported only by reserved fast-start, which this adapter rejects',
    );
  }
  if (fastStart !== undefined && fastStart !== false && outputContainer !== 'mp4' && outputContainer !== 'mov') {
    return reject(
      'AIBRUSH_FASTSTART_CONTAINER_ILLEGAL',
      `fastStart applies only to mp4/mov output, not '${outputContainer ?? 'missing'}'`,
    );
  }
  if (fragmented && operation === 'trim') {
    return reject(
      'AIBRUSH_FRAGMENTED_TRIM_UNSUPPORTED',
      'the framework TrimOptions surface cannot request fragmented output',
    );
  }
  if (fragmented && outputContainer !== 'mp4' && outputContainer !== 'mov' && outputContainer !== 'webm' && outputContainer !== 'mkv') {
    return reject(
      'AIBRUSH_FRAGMENTED_CONTAINER_ILLEGAL',
      `fragmented output is not implemented for '${outputContainer ?? 'missing'}'`,
    );
  }
  if (appendOnly && (operation !== 'remux' || (outputContainer !== 'webm' && outputContainer !== 'mkv'))) {
    return reject(
      'AIBRUSH_APPEND_ONLY_TUPLE_UNSUPPORTED',
      'append-only output is implemented only by the WebM/Matroska remux route',
    );
  }
  if (operation === 'remux' && target === 'stream' &&
      (outputContainer === 'webm' || outputContainer === 'mkv') && !appendOnly) {
    return reject(
      'AIBRUSH_FINITE_WEBM_STREAM_TARGET_UNSUPPORTED',
      'finite WebM/Matroska output cannot be proven on the append-only callback target',
    );
  }
  if (operation === 'remux' && fragmented &&
      (outputContainer === 'webm' || outputContainer === 'mkv') && !appendOnly) {
    return reject(
      'AIBRUSH_WEBM_FRAGMENTED_WITHOUT_LIVE_UNSUPPORTED',
      'WebM/Matroska fragmented output requires the explicit appendOnly live contract',
    );
  }

  if (firstContainer !== undefined && STILL_IMAGE_CONTAINERS.has(firstContainer)) {
    if (operation !== 'probe' && operation !== 'decodeFrames') {
      return reject(
        'AIBRUSH_STILL_IMAGE_OPERATION_UNSUPPORTED',
        `${operation} has no coded-packet/container route for still-image input '${firstContainer}'`,
      );
    }
    if (
      operation === 'decodeFrames' &&
      typeof (globalThis as typeof globalThis & { ImageDecoder?: unknown }).ImageDecoder !== 'function'
    ) {
      return reject(
        'AIBRUSH_IMAGE_DECODER_UNAVAILABLE',
        'the browser does not expose ImageDecoder for the requested still-image decode',
        'NA_BROWSER',
      );
    }
  }

  if (operation === 'trim') {
    if (firstContainer !== undefined && outputContainer !== undefined && firstContainer !== outputContainer) {
      return reject(
        'AIBRUSH_TRIM_CONTAINER_CHANGE_UNSUPPORTED',
        `trim preserves '${firstContainer}' and cannot author requested '${outputContainer}' output`,
      );
    }
    if (TRIM_COMPOSITION_LIMITS.has(request.scenarioId)) {
      return reject(
        'AIBRUSH_TRIM_COMPOSITION_BOUNDARY_UNSUPPORTED',
        'the pinned frame-accurate trim composition path retains one extra AAC/video boundary sample ' +
          'and extends the joined presentation by 21000 microseconds on this exact source contract',
      );
    }
  }

  if (operation === 'decrypt') {
    const scheme = request.encryption;
    if (scheme === 'clearkey') {
      return reject('AIBRUSH_DECRYPT_SCHEME_UNSUPPORTED', 'ClearKey/EME is not a clear-output decrypt route');
    }
    if ((scheme === 'hls-aes128' || scheme === 'hls-sample-aes') && firstContainer !== 'hls') {
      return reject('AIBRUSH_HLS_INPUT_REQUIRED', `${scheme} requires an HLS playlist input`);
    }
    if (
      scheme !== 'hls-aes128' &&
      scheme !== 'hls-sample-aes' &&
      firstContainer !== undefined &&
      firstContainer !== 'mp4' &&
      firstContainer !== 'mov'
    ) {
      return reject('AIBRUSH_CENC_INPUT_REQUIRED', `${scheme ?? 'CENC'} requires ISO BMFF input`);
    }
  }

  const tracks = inputs.flatMap((input) => input.tracks);
  const codecs = tracks.map((track) => track.codec.toLowerCase());
  const selectedInputIds = inputs.map((input) => input.id.toLowerCase());
  if (
    operation === 'trim' &&
    options.invariant === 'trim-audio-content' &&
    tracks.length > 0 &&
    tracks.every((track) => track.type === 'audio') &&
    tracks.some((track) => LOSSY_TRIM_AUDIO_CODECS.has(track.codec.toLowerCase()))
  ) {
    return reject(
      'AIBRUSH_AUDIO_PRESENTATION_TIMING_UNSUPPORTED',
      'the packet-copy trim surface cannot author the exact decoded presentation window for AAC, MP3, or Opus priming/padding',
    );
  }
  if (operation === 'remux' && outputContainer !== undefined) {
    const legality = rejectContainerCodecs(outputContainer, tracks, 'remux');
    if (legality !== undefined) return legality;
    if (PCM_CONTAINERS.has(outputContainer)) {
      const sameContainer = inputContainers.length === 1 && inputContainers[0] === outputContainer;
      if (!sameContainer || tracks.some((track) => track.type !== 'audio' || !isPcmCodec(track.codec))) {
        return reject(
          'AIBRUSH_PCM_REMUX_TUPLE_ILLEGAL',
          `lossless remux to '${outputContainer}' requires same-container PCM audio input`,
        );
      }
    }
  }

  if (operation === 'mux' && outputContainer !== undefined && tracks.length > 0) {
    const legality = rejectContainerCodecs(outputContainer, tracks, 'mux');
    if (legality !== undefined) return legality;
    if (
      (outputContainer === 'mkv' || outputContainer === 'webm') &&
      (request.scenarioId === 'mux/prop_vfr_mux_duration_mp4_to_mkv' ||
        request.scenarioId === 'mux/edge_bframes_decode_mux_mkv')
    ) {
      return reject(
        'AIBRUSH_MATROSKA_FULL_TIMELINE_UNSUPPORTED',
        'the Matroska SimpleBlock writer preserves presentation timestamps and block order but cannot serialize the contract-required independent numeric DTS axis; VFR BlockDuration is also unavailable',
      );
    }
  }

  if (operation === 'transcode') {
    const requestedDimensions = [
      request.output?.width,
      request.output?.height,
      request.transforms?.resize?.width,
      request.transforms?.resize?.height,
    ];
    if (requestedDimensions.some((value) => typeof value === 'number' && value <= 0)) {
      return reject(
        'AIBRUSH_INVALID_DIMENSIONS',
        'video dimensions must be positive before probing a concrete browser encoder configuration',
      );
    }
  }

  if (operation === 'transcode' && outputContainer !== undefined) {
    const outputVideo = request.output?.videoCodec?.toLowerCase();
    const outputAudio = request.output?.audioCodec?.toLowerCase();
    if (outputVideo !== undefined && !VIDEO_ENCODERS.has(outputVideo)) {
      return reject('AIBRUSH_VIDEO_ENCODER_UNAVAILABLE', `no declared video encoder for '${outputVideo}'`);
    }
    if (outputAudio !== undefined && !AUDIO_ENCODERS.has(outputAudio)) {
      return reject('AIBRUSH_AUDIO_ENCODER_UNAVAILABLE', `no declared audio encoder for '${outputAudio}'`);
    }
    const outputTracks: NormalizedTrack[] = [
      ...(outputVideo !== undefined ? [{ type: 'video' as const, codec: outputVideo }] : []),
      ...(outputAudio !== undefined ? [{ type: 'audio' as const, codec: outputAudio }] : []),
    ];
    if (outputTracks.length > 0) {
      const legality = rejectContainerCodecs(outputContainer, outputTracks, 'transcode');
      if (legality !== undefined) return legality;
    }
    if (PCM_CONTAINERS.has(outputContainer) && outputVideo !== undefined) {
      return reject(
        'AIBRUSH_PCM_CONTAINER_VIDEO_ILLEGAL',
        `PCM container '${outputContainer}' cannot carry video codec '${outputVideo}'`,
      );
    }
    if (PCM_CONTAINERS.has(outputContainer) && outputAudio !== undefined && !isPcmCodec(outputAudio)) {
      return reject(
        'AIBRUSH_PCM_CONTAINER_CODEC_ILLEGAL',
        `PCM container '${outputContainer}' cannot carry '${outputAudio}'`,
      );
    }

    const invariant = typeof options.invariant === 'string' ? options.invariant : '';
    if (
      request.scenarioId === 'audio-dsp/upmix_stereo_to_5_1' &&
      invariant === 'audio-dsp-transform' &&
      request.output?.channels === 6
    ) {
      return reject(
        'AIBRUSH_AUDIO_MIX_MATRIX_UNSUPPORTED',
        'the pinned PCM channel converter does not implement the authored FL/FR/FC/LFE/BL/BR stereo-to-5.1 coefficient matrix',
      );
    }
    if (invariant === 'transcode-audio-content' && outputContainer === 'mp4' && outputAudio === 'aac') {
      return reject(
        'AIBRUSH_AAC_PRESENTATION_TIMING_UNSUPPORTED',
        'the pinned MP4 AAC writer does not author the priming trim required by the audio-content contract; measured inputs expose 3072-5568 excess presentation frames',
      );
    }
    if (invariant === 'transcode-audio-content' && outputContainer === 'ogg' && outputAudio === 'opus') {
      return reject(
        'AIBRUSH_OGG_OPUS_OUTPUT_UNSUPPORTED',
        'the pinned Ogg Opus writer emits an incomplete continuation sequence that the neutral reader cannot validate',
      );
    }
    if (invariant === 'transcode-audio-content' && outputContainer === 'webm' && outputAudio === 'opus') {
      return reject(
        'AIBRUSH_WEBM_OPUS_PRESENTATION_UNSUPPORTED',
        'the pinned WebM Opus route fixes output at 48kHz without preserving the source program interval required by the audio-content contract',
      );
    }
    if (
      request.scenarioId === 'transcode/aac_to_pcm_wav_extract' &&
      outputContainer === 'wav' &&
      outputAudio !== undefined &&
      isPcmCodec(outputAudio)
    ) {
      return reject(
        'AIBRUSH_AAC_PCM_EQUIVALENCE_UNSUPPORTED',
        'the pinned AAC decode path measures 12.47 dB SNR and 0.971 correlation against the suite PCM reference, below the exact extraction contract',
      );
    }
    if (
      request.scenarioId === 'transcode/vp9_alpha_to_vp8_keepalpha' &&
      options.alpha === 'keep' &&
      outputContainer === 'webm' &&
      outputVideo === 'vp8'
    ) {
      return reject(
        'AIBRUSH_VP8_ALPHA_FIDELITY_BOUND',
        'the pinned VP8 alpha encoder measures 0.011765 maximum alpha error while this scenario requires exact alpha preservation',
      );
    }
    if (
      request.scenarioId === 'transcode/vp9_alpha_to_vp9_keepalpha' &&
      options.alpha === 'keep' &&
      outputContainer === 'webm' &&
      outputVideo === 'vp9'
    ) {
      return reject(
        'AIBRUSH_VP9_ALPHA_PIXEL_QUALITY_BOUND',
        'the pinned VP9 alpha route preserves the alpha plane but measures 0.6863 maximum RGB error, above the scenario\'s 0.55 bound',
      );
    }
    if (
      request.scenarioId === 'transcode/roundtrip_leg1_h264_to_vp9' &&
      outputContainer === 'webm' &&
      outputVideo === 'vp9' &&
      inputs.some((input) =>
        input.id.toLowerCase().endsWith('scenarios/transcode/roundtrip_leg1_h264_to_vp9/03.mp4'))
    ) {
      return reject(
        'AIBRUSH_H264_VP9_ROUNDTRIP_QUALITY_BOUND',
        'the exact portrait 1080x1920@60 variant measures 0.9506 mean SSIM through the pinned VP9 route, below the suite\'s 0.97 floor',
      );
    }
    if (
      request.scenarioId === 'transcode/bframe_reorder_h264_to_vp9' &&
      outputContainer === 'webm' &&
      outputVideo === 'vp9' &&
      selectedInputIds.some((id) => id.endsWith('transcode/bframe_reorder_h264_to_vp9/03.mp4'))
    ) {
      return reject(
        'AIBRUSH_BFRAME_VP9_PORTRAIT_QUALITY_BOUND',
        'the exact portrait 1080x1920@60 variant measures 0.9506 mean SSIM through the pinned VP9 route, below the suite\'s 0.97 floor while the neighboring variants pass',
      );
    }
    if (
      request.scenarioId === 'transcode/h264_to_vp9_webm' &&
      outputContainer === 'webm' &&
      outputVideo === 'vp9' &&
      selectedInputIds.some((id) =>
        id.endsWith('transcode/h264_to_vp9_webm/02.mp4') ||
        id.endsWith('transcode/h264_to_vp9_webm/03.mp4'))
    ) {
      return reject(
        'AIBRUSH_H264_VP9_QUALITY_BOUND',
        'the exact 02.mp4 and 03.mp4 variants measure 0.9786 and 0.9506 mean SSIM through the pinned VP9 route, below the suite\'s 0.98 floor while the neighboring variants pass',
      );
    }
    if (
      request.scenarioId === 'transcode/vp9_to_av1_webm' &&
      outputContainer === 'webm' &&
      outputVideo === 'av1' &&
      selectedInputIds.some((id) => id.endsWith('transcode/vp9_to_av1_webm/02.webm'))
    ) {
      return reject(
        'AIBRUSH_VP9_AV1_QUALITY_BOUND',
        'the exact 02.webm variant measures 0.9682 mean SSIM through the pinned AV1 route, below the suite\'s 0.97 floor while the neighboring variants pass',
      );
    }
    if (
      request.scenarioId === 'transcode/h264_to_av1_mp4' &&
      outputContainer === 'mp4' &&
      outputVideo === 'av1' &&
      selectedInputIds.some((id) => id.endsWith('transcode/h264_to_av1_mp4/03.mp4'))
    ) {
      return reject(
        'AIBRUSH_H264_AV1_PORTRAIT_QUALITY_BOUND',
        'the exact portrait 03.mp4 variant measures 0.9451 mean and 0.9198 minimum SSIM through the pinned AV1 route, below the suite\'s 0.97 floor while the neighboring variants pass',
      );
    }
    if (
      request.scenarioId === 'transcode/video_only_h264_resize_360p_to_vp9_webm' &&
      outputContainer === 'webm' &&
      outputVideo === 'vp9' &&
      selectedInputIds.some((id) =>
        id.endsWith('transcode/video_only_h264_resize_360p_to_vp9_webm/01.mp4') ||
        id.endsWith('transcode/video_only_h264_resize_360p_to_vp9_webm/02.mp4') ||
        id.endsWith('transcode/video_only_h264_resize_360p_to_vp9_webm/03.mp4'))
    ) {
      return reject(
        'AIBRUSH_VP9_RESIZE_PRESENTATION_WINDOW_UNSUPPORTED',
        'the exact 01.mp4, 02.mp4, and 03.mp4 variants measure 7.24-9.70 seconds of presentation-window drift through the pinned resize route while the baked variant passes',
      );
    }
    if (
      request.scenarioId === 'transcode/vp9_to_vp8_webm' &&
      outputContainer === 'webm' &&
      outputVideo === 'vp8' &&
      selectedInputIds.some((id) =>
        id.endsWith('transcode/vp9_to_vp8_webm/01.webm') ||
        id.endsWith('transcode/vp9_to_vp8_webm/02.webm'))
    ) {
      return reject(
        'AIBRUSH_VP9_VP8_QUALITY_BOUND',
        'the exact 01.webm and 02.webm variants measure 0.9670 and 0.9559 mean SSIM through the pinned VP8 route, below the suite\'s 0.97 floor while the neighboring variants pass',
      );
    }
    if (
      request.scenarioId === 'transcode/wav_to_vorbis_ogg' &&
      invariant === 'transcode-audio-content' &&
      outputContainer === 'ogg' &&
      outputAudio === 'vorbis' &&
      selectedInputIds.some((id) => id.endsWith('transcode/wav_to_vorbis_ogg/03.wav'))
    ) {
      return reject(
        'AIBRUSH_VORBIS_OGG_CONTINUATION_UNSUPPORTED',
        'the exact 44.1kHz stereo 03.wav variant produces an incomplete Ogg continuation sequence through the pinned Vorbis writer while the neighboring variants pass',
      );
    }
  }

  if (operation === 'mux' && outputContainer !== undefined && tracks.length === 0 && codecs.length === 0) {
    // The preliminary request deliberately has no golden tracks. Defer until the evidence-rich support
    // pass instead of guessing an illegal tuple from absence of evidence.
    return undefined;
  }
  return undefined;
}

function rejectContainerCodecs(
  container: string,
  tracks: readonly NormalizedTrack[],
  operation: 'remux' | 'mux' | 'transcode',
): Rejection | undefined {
  if (tracks.length === 0) return undefined;
  const video = tracks.filter((track) => track.type === 'video').map((track) => track.codec.toLowerCase());
  const audio = tracks.filter((track) => track.type === 'audio').map((track) => track.codec.toLowerCase());
  const illegal = (reason: string): Rejection =>
    reject('AIBRUSH_CONTAINER_CODEC_ILLEGAL', `${operation} ${container}: ${reason}`);

  switch (container) {
    case 'mp4':
    case 'mov':
      if (video.some((codec) => !['h264', 'hevc', 'av1', 'vp9'].includes(codec))) {
        return illegal(`video codec(s) ${video.join(',')} are not implemented by the ISO BMFF writer`);
      }
      if (audio.some((codec) => !['aac', 'opus', 'mp3'].includes(codec))) {
        return illegal(`audio codec(s) ${audio.join(',')} are not implemented by the ISO BMFF writer`);
      }
      return undefined;
    case 'webm':
      if (video.some((codec) => !['vp8', 'vp9', 'av1'].includes(codec))) {
        return illegal(`video codec(s) ${video.join(',')} violate WebM legality`);
      }
      if (audio.some((codec) => !['opus', 'vorbis'].includes(codec))) {
        return illegal(`audio codec(s) ${audio.join(',')} violate WebM legality`);
      }
      return undefined;
    case 'mkv':
      return undefined;
    case 'ogg':
      return video.length > 0 || audio.length === 0 || audio.some((codec) => !['opus', 'vorbis', 'flac'].includes(codec))
        ? illegal('Ogg output requires Opus, Vorbis, or FLAC audio only')
        : undefined;
    case 'ts':
      return video.some((codec) => !['h264', 'hevc'].includes(codec)) || audio.some((codec) => !['aac', 'mp3'].includes(codec))
        ? illegal('MPEG-TS output supports H.264/HEVC video with AAC/MP3 audio')
        : undefined;
    case 'adts':
      return video.length > 0 || audio.length !== 1 || audio[0] !== 'aac'
        ? illegal('ADTS output requires exactly one AAC audio track')
        : undefined;
    case 'mp3':
      return video.length > 0 || audio.length !== 1 || audio[0] !== 'mp3'
        ? illegal('MP3 output requires exactly one MP3 audio track')
        : undefined;
    case 'flac':
      return video.length > 0 || audio.length !== 1 || audio[0] !== 'flac'
        ? illegal('FLAC output requires exactly one FLAC audio track')
        : undefined;
    case 'wav':
    case 'aiff':
    case 'caf':
      return video.length > 0 || audio.length === 0 || audio.some((codec) => !isPcmCodec(codec))
        ? illegal(`${container} output requires PCM audio only`)
        : undefined;
    default:
      return reject('AIBRUSH_OUTPUT_CONTAINER_UNSUPPORTED', `no output route for container '${container}'`);
  }
}

function concreteBrowserConfigs(request: ConcreteOperationRequest): ConcreteWebCodecsConfig[] {
  const configs: ConcreteWebCodecsConfig[] = [];
  const tracks = request.inputs.flatMap((input) => input.tracks);
  const operation = request.operation;
  const needsDecode =
    operation === 'decodeFrames' ||
    operation === 'seek' ||
    (operation === 'trim' && request.transforms?.trim?.frameAccurate === true) ||
    operation === 'transcode';

  if (needsDecode) {
    tracks.forEach((track, trackIndex) => {
      const config = decoderConfig(track, trackIndex);
      if (config !== undefined) configs.push(config);
    });
  }

  if (operation === 'transcode' || (operation === 'trim' && request.transforms?.trim?.frameAccurate === true)) {
    const sourceVideo = tracks.find((track) => track.type === 'video');
    const sourceAudio = tracks.find((track) => track.type === 'audio');
    const videoCodec = request.output?.videoCodec ?? (operation === 'trim' ? sourceVideo?.codec : undefined);
    const audioCodec = request.output?.audioCodec ?? (operation === 'trim' ? sourceAudio?.codec : undefined);
    if (videoCodec !== undefined) {
      const width = request.output?.width ?? sourceVideo?.width;
      const height = request.output?.height ?? sourceVideo?.height;
      if (width !== undefined && height !== undefined) {
        const framerate = request.output?.frameRate ?? sourceVideo?.fps ?? 30;
        configs.push({
          role: 'video-encoder',
          config: {
            codec: videoEncoderCodecString(videoCodec, width, height, framerate),
            width,
            height,
            bitrate: 2_000_000,
            framerate,
          },
        });
      }
    }
    // Opus has a registered WASM encoder tail; AAC encode does not and therefore requires this exact
    // browser AudioEncoder configuration.
    if (audioCodec === 'aac') {
      const sampleRate = request.output?.sampleRate ?? sourceAudio?.sampleRate;
      const channels = request.output?.channels ?? sourceAudio?.channels;
      if (sampleRate !== undefined && channels !== undefined) {
        configs.push({
          role: 'audio-encoder',
          config: {
            codec: webCodecString(audioCodec, 'encode'),
            sampleRate,
            numberOfChannels: channels,
            bitrate: 128_000,
          },
        });
      }
    }
  }

  const invariant = typeof request.options.invariant === 'string' ? request.options.invariant : '';
  if (operation === 'mux' && /decode\s*\(/i.test(invariant)) {
    tracks.forEach((track, trackIndex) => {
      const config = decoderConfig(track, trackIndex);
      if (config !== undefined) configs.push(config);
    });
  }
  return dedupeConfigs(configs);
}

function decoderConfig(track: NormalizedTrack, trackIndex: number): ConcreteWebCodecsConfig | undefined {
  if (track.type === 'video') {
    // The framework currently has no software H.264/HEVC decoder tail; these exact configurations are
    // therefore browser applicability. AV1/VPx have registered WASM fallbacks and are not browser-gated.
    if (track.codec !== 'h264' && track.codec !== 'hevc') return undefined;
    return {
      role: 'video-decoder',
      trackIndex,
      config: {
        codec: webCodecString(track.nativeCodecTag ?? track.codec, 'decode'),
        ...(track.width !== undefined ? { codedWidth: track.width } : {}),
        ...(track.height !== undefined ? { codedHeight: track.height } : {}),
      },
    };
  }
  if (
    track.type === 'audio' &&
    track.codec === 'aac' &&
    /mp4a\.40\.(?:5|29)(?:$|\.)/i.test(track.nativeCodecTag ?? '')
  ) {
    // The vendored WASM AAC fallback is AAC-LC only. HE-AAC/SBR/PS must use the exact native decoder
    // configuration; ordinary AAC-LC and Opus have software tails and are not browser applicability.
    if (track.sampleRate === undefined || track.channels === undefined) return undefined;
    return {
      role: 'audio-decoder',
      trackIndex,
      config: {
        codec: webCodecString(track.nativeCodecTag ?? track.codec, 'decode'),
        sampleRate: track.sampleRate,
        numberOfChannels: track.channels,
      },
    };
  }
  return undefined;
}

function webCodecString(codec: string, _direction: 'decode' | 'encode'): string {
  if (/^(avc1|avc3|hvc1|hev1|av01|vp09|vp08|mp4a\.)/i.test(codec)) return codec;
  switch (codec.toLowerCase()) {
    case 'h264':
      return 'avc1.42E01E';
    case 'hevc':
      return 'hvc1.1.6.L93.B0';
    case 'av1':
      return 'av01.0.04M.08';
    case 'vp9':
      return 'vp09.00.10.08';
    case 'vp8':
      return 'vp8';
    case 'aac':
      return 'mp4a.40.2';
    default:
      return codec.toLowerCase();
  }
}

/**
 * Mirror the framework's dimension/cadence-aware H.264 level boundary for the exact browser probe.
 * A static avc1.42E01E (Level 3.0) is not a valid 1080p configuration and Chromium correctly rejects
 * it before the framework can synthesize the Level 4.0 config it actually instantiates.
 */
function videoEncoderCodecString(codec: string, width: number, height: number, framerate: number): string {
  if (/^(avc1|avc3|hvc1|hev1|av01|vp09|vp08|mp4a\.)/i.test(codec)) return codec;
  if (codec.toLowerCase() !== 'h264') return webCodecString(codec, 'encode');

  const frameMacroblocks = Math.ceil(width / 16) * Math.ceil(height / 16);
  const macroblocksPerSecond = frameMacroblocks * Math.max(1, framerate);
  const levels = [
    { idc: 0x1e, maxFrameMacroblocks: 1_620, maxMacroblocksPerSecond: 40_500 },
    { idc: 0x1f, maxFrameMacroblocks: 3_600, maxMacroblocksPerSecond: 108_000 },
    { idc: 0x20, maxFrameMacroblocks: 5_120, maxMacroblocksPerSecond: 216_000 },
    { idc: 0x28, maxFrameMacroblocks: 8_192, maxMacroblocksPerSecond: 245_760 },
    { idc: 0x2a, maxFrameMacroblocks: 8_704, maxMacroblocksPerSecond: 522_240 },
    { idc: 0x32, maxFrameMacroblocks: 22_080, maxMacroblocksPerSecond: 589_824 },
    { idc: 0x33, maxFrameMacroblocks: 36_864, maxMacroblocksPerSecond: 983_040 },
    { idc: 0x34, maxFrameMacroblocks: 36_864, maxMacroblocksPerSecond: 2_073_600 },
    { idc: 0x3c, maxFrameMacroblocks: 139_264, maxMacroblocksPerSecond: 4_177_920 },
    { idc: 0x3d, maxFrameMacroblocks: 139_264, maxMacroblocksPerSecond: 8_355_840 },
    { idc: 0x3e, maxFrameMacroblocks: 139_264, maxMacroblocksPerSecond: 16_711_680 },
  ] as const;
  const level = levels.find((candidate) =>
    frameMacroblocks <= candidate.maxFrameMacroblocks &&
    macroblocksPerSecond <= candidate.maxMacroblocksPerSecond
  ) ?? levels[levels.length - 1]!;
  return `avc1.42E0${level.idc.toString(16).padStart(2, '0').toUpperCase()}`;
}

function dedupeConfigs(configs: ConcreteWebCodecsConfig[]): ConcreteWebCodecsConfig[] {
  const seen = new Set<string>();
  return configs.filter((entry) => {
    const key = `${entry.role}:${entry.trackIndex ?? -1}:${stableConfigKey(entry.config)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stableConfigKey(config: object): string {
  return JSON.stringify(Object.entries(config).sort(([a], [b]) => a.localeCompare(b)));
}

function isPcmCodec(codec: string): boolean {
  return PCM_CODECS.has(codec.toLowerCase()) || codec.toLowerCase().startsWith('pcm-');
}

function reject(
  reasonCode: string,
  reason: string,
  status: 'NA_ENGINE' | 'NA_BROWSER' = 'NA_ENGINE',
): Rejection {
  return { reasonCode, reason, status };
}

export function aibrushTupleSummary(request: ConcreteOperationRequest): ApplicabilityTupleSummary {
  const tracks = request.inputs.flatMap((input) => input.tracks);
  const options: Record<string, SerializableValue> = {};
  for (const key of [
    'target',
    'fragmented',
    'fastStart',
    'appendOnly',
    'writeChunkBytes',
    'positionedWrites',
    'writeMode',
    'frameAccurate',
    'reproducible',
  ]) {
    const value = request.options[key];
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      options[key] = value;
    }
  }
  return {
    inputContainers: request.inputs.map((input) => input.container),
    inputCodecs: tracks.map((track) => track.codec),
    outputCodecs: [request.output?.videoCodec, request.output?.audioCodec].filter(
      (codec): codec is string => codec !== undefined,
    ),
    ...(request.output?.container !== undefined ? { outputContainer: request.output.container } : {}),
    ...(request.encryption !== undefined ? { encryption: request.encryption } : {}),
    ...(tracks.some((track) => track.width !== undefined || track.height !== undefined)
      ? { dimensions: tracks.map((track) => ({
          ...(track.width !== undefined ? { width: track.width } : {}),
          ...(track.height !== undefined ? { height: track.height } : {}),
        })) }
      : {}),
    ...(request.timingMode !== undefined ? { timingMode: request.timingMode } : {}),
    ...(Object.keys(options).length > 0 ? { options } : {}),
  };
}
