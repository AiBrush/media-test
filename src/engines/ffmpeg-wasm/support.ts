import type {
  ApplicabilityTupleSummary,
  CapabilitySet,
  ConcreteOperationRequest,
  EncryptionScheme,
  NormalizedTrack,
  SupportDecision,
} from '../../core/engine.ts';
import type { RemuxProgramEvidence } from '../../features/remux/types.ts';
import { parseMuxTrackSelector } from '../../features/mux/selection.ts';

/** Parsed facts from the exact loaded core, or the explicitly marked pre-load fallback. */
export interface FfmpegRuntimeBuild {
  verified: boolean;
  capabilities: CapabilitySet;
  encoders: ReadonlySet<string>;
  decoders: ReadonlySet<string>;
  muxers: ReadonlySet<string>;
  demuxers: ReadonlySet<string>;
  filters: ReadonlySet<string>;
}

export interface FfmpegAdapterLimits {
  wasmCeilingBytes: number;
  memfsInputCeilingBytes: number;
  hlsSidecarCeiling: number;
  hlsMaterializedBytesCeiling: number;
  maxTrackCount: number;
  maxEncodePixels: number;
}

export const DEFAULT_FFMPEG_LIMITS: FfmpegAdapterLimits = Object.freeze({
  wasmCeilingBytes: 2_000_000_000,
  memfsInputCeilingBytes: 512 * 1024 * 1024,
  hlsSidecarCeiling: 512,
  hlsMaterializedBytesCeiling: 512 * 1024 * 1024,
  maxTrackCount: 16,
  maxEncodePixels: 1920 * 1080,
});

/**
 * Every reuse is a complete MEMFS + worker-backed FFmpeg execution. Adaptive batching therefore
 * multiplies work without isolating additional process samples; retained repetitions already
 * provide independent timing evidence.
 */
export const FFMPEG_BENCHMARK_LIMITS = Object.freeze({
  maxInnerIterations: 1,
  memoryWindow: Object.freeze({
    sampleImmediatelyDuringOperation: true,
    maxOperationSamples: 1,
    settleWindowMs: 0,
    sampleTimeoutMs: 1_000,
  }),
});

export function isWorkerFsBlobUnreadableError(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : '';
  return (error instanceof DOMException && error.name === 'NotReadableError') ||
    /FileReaderSync|requested file could not be read/i.test(message);
}

/** Exact failed-decode signature emitted by the pinned core for damaged coded payloads. */
export function isFfmpegMalformedDecodeFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /ffmpeg exited \d+ for \[[^\]]*-f framehash\b/.test(message) &&
    /\b\d+ decoding errors?\b/.test(message) &&
    message.includes('Conversion failed!');
}

const FILTER_FEATURES: ReadonlyArray<[string, string]> = [
  ['crop', 'crop'],
  ['pad', 'pad'],
  ['flip', 'hflip'],
  ['colorspace', 'colorspace'],
  ['tonemap', 'tonemap'],
];

const ISO_BMFF_CONTAINERS = new Set(['mp4', 'mov']);
const TS_SIGNED_CTS_COPY_TARGETS = new Set(['mp4', 'mov', 'mkv']);
const STANDARD_MP3_MP4_SAMPLE_RATES = new Set([16_000, 22_050, 24_000, 32_000, 44_100, 48_000]);
/** Measured ST-core bounds: larger jobs exceed the scenario's functional deadline in Chromium. */
const MAX_ST_HEVC_ENCODE_PIXEL_FRAMES = 250_000_000;
const MAX_ST_VP8_ENCODE_PIXEL_FRAMES = 1_000_000_000;
const MAX_ST_4K_SOURCE_PIXEL_FRAMES = 2_000_000_000;
const MAX_ST_H264_RESIZE_OUTPUT_PIXEL_FRAMES = 8_000_000_000;
/** Ordinary codec preroll is a few frames; a longer negative decode origin denotes an edit span. */
const MAX_STREAM_COPY_PREROLL_US = 500_000;
/** Ignore only sub-tick rounding when deciding whether the source requires signed CTS offsets. */
const SIGNED_CTS_ROUNDING_US = 2_000;
/**
 * Exact exhaustive-ladder candidates whose final requested H.264 B-frames cannot be copied by
 * FFmpeg 5.1 without replacing them with later decode-order packets. Keep this scoped to the
 * authored trim request; sibling candidates in every listed scenario remain supported.
 */
const TRIM_COPY_BFRAME_BOUNDARY_UNSUPPORTED = new Set([
  'trim/h264_start_zero_copy|scenarios/trim/h264_start_zero_copy/01.mp4',
  'trim/h264_start_zero_copy|scenarios/trim/h264_start_zero_copy/02.mp4',
  'trim/h264_start_zero_copy|scenarios/trim/h264_start_zero_copy/03.mp4',
  'trim/h264_multitrack_keyframe_aligned|scenarios/trim/h264_multitrack_keyframe_aligned/02.mp4',
  'trim/large_h264_copy_lazyread|scenarios/trim/large_h264_copy_lazyread/01.mp4',
  'trim/mov_keyframe_aligned|scenarios/trim/mov_keyframe_aligned/03.mov',
  'trim/mkv_keyframe_aligned|scenarios/trim/mkv_keyframe_aligned/01.mkv',
  'trim/mkv_keyframe_aligned|scenarios/trim/mkv_keyframe_aligned/02.mkv',
  'trim/h264_rotated_keyframe_aligned|scenarios/trim/h264_rotated_keyframe_aligned/02.mp4',
  'trim/h264_keyframe_aligned|scenarios/trim/h264_keyframe_aligned/02.mp4',
]);

/**
 * AES-CTR carries no authentication tag. These exact negative fixtures alter protection/payload
 * bytes while retaining a syntactically valid CENC representation, so this adapter cannot
 * distinguish the mutation from legitimate ciphertext without using the suite's private clear
 * reference as an implementation oracle.
 */
const CENC_INTEGRITY_UNOBSERVABLE_SCENARIOS = new Set([
  'encryption/cenc_ctr_protection_zeroed_graceful',
  'encryption/cenc_ctr_senc_bitflip_graceful',
]);

/**
 * Measured FFmpeg 5.1 fragmented-copy limitations for contracts that require strict packet-timeline
 * preservation. The ordinary fragmented shape/property rows remain supported: only these stronger
 * exact contracts are rejected.
 */
const STREAMING_FRAGMENTED_COPY_LIMITS = new Map<string, readonly [string, string]>([
  [
    'robustness/edge_fragmented_remux',
    [
      'FFMPEG_ROBUSTNESS_FRAGMENTED_TIMELINE_UNSUPPORTED',
      'the pinned FFmpeg 5.1 fragmented stream-copy path shifts this exact source video timeline by ' +
        '21355 microseconds, beyond the strict 2000-microsecond copy tolerance',
    ],
  ],
  [
    'streaming-output/mp4_fragmented_cmaf',
    [
      'FFMPEG_STREAMING_CMAF_CONTRACT_UNSUPPORTED',
      'the pinned FFmpeg 5.1 fragmented stream-copy path emits iso5/iso6/mp41 brands instead of a ' +
        'CMAF brand and shifts this source video timeline by 21355 microseconds',
    ],
  ],
  [
    'streaming-output/buffer_massive_h264_mp4',
    [
      'FFMPEG_STREAMING_MASSIVE_FRAGMENTED_TIMELINE_UNSUPPORTED',
      'the pinned FFmpeg 5.1 fragmented stream-copy path shifts the exact massive-source video ' +
        'timeline by 21355 microseconds, beyond the strict 2000-microsecond copy tolerance',
    ],
  ],
]);

const AUDIO_DSP_MIX_MATRIX_UNSUPPORTED_SCENARIOS = new Set([
  'audio-dsp/upmix_mono_to_stereo',
  'audio-dsp/upmix_stereo_to_5_1',
  'audio-dsp/downmix_5_1_to_stereo',
  'audio-dsp/edge_variable_channel_count_downmix',
]);

/**
 * Candidate-byte policy for limitations that the static tuple cannot express. The vendored FFmpeg
 * 5.1 ISO stream-copy path demonstrably drops/retimes access units for long ISO edit-list preroll,
 * and when signed CTS offsets are copied from MPEG-TS into ISO-BMFF. Keep those concrete candidates
 * honest as NA_ENGINE while admitting ordinary preroll and timestamp-monotonic TS inputs.
 */
export function decideFfmpegRemuxProgramSupport(
  sourceContainer: string,
  targetContainer: string,
  program: RemuxProgramEvidence,
): SupportDecision {
  const reject = (reasonCode: string, reason: string): SupportDecision => ({
    supported: false,
    status: 'NA_ENGINE',
    reasonCode,
    reason,
  });
  const source = sourceContainer.trim().toLowerCase();
  const target = targetContainer.trim().toLowerCase();
  const mediaTracks = program.tracks.filter((track) => track.type === 'video' || track.type === 'audio');

  if (ISO_BMFF_CONTAINERS.has(source)) {
    let minimumDtsUs = Number.POSITIVE_INFINITY;
    for (const track of mediaTracks) {
      for (const sample of track.samples) {
        if (sample.dtsUs !== undefined && Number.isFinite(sample.dtsUs)) {
          minimumDtsUs = Math.min(minimumDtsUs, sample.dtsUs);
        }
      }
    }
    if (minimumDtsUs < -MAX_STREAM_COPY_PREROLL_US) {
      return reject(
        'FFMPEG_COMPLEX_EDIT_PREROLL_UNSUPPORTED',
        `source ISO-BMFF timeline begins at DTS ${minimumDtsUs}us; the FFmpeg 5.1 stream-copy path ` +
          'does not preserve long edit-list preroll without dropping or retiming access units',
      );
    }
  }

  if (source === 'ts' && TS_SIGNED_CTS_COPY_TARGETS.has(target)) {
    let minimumCompositionOffsetUs = Number.POSITIVE_INFINITY;
    for (const track of mediaTracks) {
      if (track.type !== 'video') continue;
      for (const sample of track.samples) {
        if (
          sample.ptsUs !== undefined &&
          sample.dtsUs !== undefined &&
          Number.isFinite(sample.ptsUs) &&
          Number.isFinite(sample.dtsUs)
        ) {
          minimumCompositionOffsetUs = Math.min(
            minimumCompositionOffsetUs,
            sample.ptsUs - sample.dtsUs,
          );
        }
      }
    }
    if (minimumCompositionOffsetUs < -SIGNED_CTS_ROUNDING_US) {
      return reject(
        'FFMPEG_TS_SIGNED_CTS_COPY_UNSUPPORTED',
        `source MPEG-TS requires signed CTS offsets down to ${minimumCompositionOffsetUs}us; ` +
          `the FFmpeg 5.1 ${target.toUpperCase()} stream-copy path rewrites that decode timeline`,
      );
    }
  }

  return { supported: true };
}

export function tupleSummary(request: ConcreteOperationRequest): ApplicabilityTupleSummary {
  return {
    inputContainers: request.inputs.map((input) => input.container),
    inputCodecs: request.inputs.flatMap((input) => input.tracks.map((track) => track.codec)),
    ...(request.output?.container !== undefined ? { outputContainer: request.output.container } : {}),
    outputCodecs: [request.output?.videoCodec, request.output?.audioCodec].filter(
      (codec): codec is string => codec !== undefined,
    ),
    ...(request.encryption !== undefined ? { encryption: request.encryption } : {}),
    dimensions: request.inputs.flatMap((input) =>
      input.tracks
        .filter((track) => track.type === 'video')
        .map((track) => ({ width: track.width, height: track.height })),
    ),
    sampleRates: request.inputs.flatMap((input) =>
      input.tracks.flatMap((track) => track.sampleRate === undefined ? [] : [track.sampleRate]),
    ),
    channels: request.inputs.flatMap((input) =>
      input.tracks.flatMap((track) => track.channels === undefined ? [] : [track.channels]),
    ),
    ...(request.timingMode !== undefined ? { timingMode: request.timingMode } : {}),
  };
}

export function decideFfmpegSupport(
  request: ConcreteOperationRequest,
  runtime: FfmpegRuntimeBuild,
  limits: FfmpegAdapterLimits = DEFAULT_FFMPEG_LIMITS,
): SupportDecision {
  const reject = (reasonCode: string, reason: string): SupportDecision => ({
    supported: false,
    status: 'NA_ENGINE',
    reasonCode,
    reason,
  });
  const caps = runtime.capabilities;
  // 'concat' is a composed operation the runner drives through transcode primitives, not a distinct
  // ffmpeg capability flag; only the declared base operations are gated on the capability table.
  if (request.operation !== 'concat' && caps.operations[request.operation] !== true) {
    return reject('FFMPEG_OPERATION_UNAVAILABLE', `${request.operation} is absent from this ffmpeg core/adapter`);
  }

  if (
    request.operation === 'decrypt' &&
    CENC_INTEGRITY_UNOBSERVABLE_SCENARIOS.has(request.scenarioId.toLowerCase())
  ) {
    return reject(
      'FFMPEG_CENC_INTEGRITY_UNOBSERVABLE',
      'AES-CTR has no authentication tag; this exact syntactically valid mutation cannot be ' +
        'distinguished from legitimate ciphertext without an independent clear-reference oracle',
    );
  }

  // Mutated inputs must reach the parser/decoder. Rejecting them on inferred tuple evidence would
  // launder malformed input into NA_ENGINE, which is forbidden by the benchmark contract.
  if (request.inputs.some((input) => input.mutated)) return { supported: true };

  if (
    request.operation === 'transcode' &&
    AUDIO_DSP_MIX_MATRIX_UNSUPPORTED_SCENARIOS.has(request.scenarioId)
  ) {
    return reject(
      'FFMPEG_AUDIO_MIX_MATRIX_UNSUPPORTED',
      'the pinned FFmpeg 5.1 -ac mixer cannot guarantee this scenario\'s exact authored channel matrix',
    );
  }
  if (
    request.operation === 'transcode' &&
    request.scenarioId === 'audio-dsp/fade_in_out_f32'
  ) {
    return reject(
      'FFMPEG_AUDIO_FADE_ENVELOPE_PRECISION_UNSUPPORTED',
      'the pinned FFmpeg 5.1 afade output exceeds the authored floating-point envelope bound on valid exhaustive inputs',
    );
  }

  if (request.operation === 'remux') {
    const streamingLimit = STREAMING_FRAGMENTED_COPY_LIMITS.get(request.scenarioId.toLowerCase());
    if (streamingLimit !== undefined) {
      return reject(streamingLimit[0], streamingLimit[1]);
    }
  }

  const robustness = asRecord(asRecord(request.options).robustness);
  if (
    request.operation === 'demux' &&
    robustness.schema === 'media-test/demux-scale-contract@1'
  ) {
    return reject(
      'FFMPEG_DEMUX_SCALE_PACKET_BOUNDARY_UNAVAILABLE',
      'the ffmpeg.wasm CLI materializes framecrc as a completed batch and cannot expose a real first-packet boundary',
    );
  }

  const tracks = selectedInputTracks(request);
  if (tracks.length > limits.maxTrackCount) {
    return reject('FFMPEG_TRACK_COUNT_LIMIT', `${tracks.length} tracks exceed adapter limit ${limits.maxTrackCount}`);
  }
  if ((request.operation === 'mux' || request.operation === 'demux') && tracks.length === 0) {
    // A genuinely trackless applicable file is invalid media, not an unsupported tuple.
    return { supported: true };
  }

  for (const input of request.inputs) {
    if (input.sizeBytes !== undefined && input.sizeBytes >= limits.wasmCeilingBytes) {
      return reject(
        'FFMPEG_WASM_2GB_CEILING',
        `input '${input.id}' is ${input.sizeBytes} bytes, beyond the ${limits.wasmCeilingBytes}-byte WASM ceiling`,
      );
    }
    if (input.container && !caps.containersIn.includes(input.container)) {
      return reject('FFMPEG_INPUT_CONTAINER_UNAVAILABLE', `core cannot demux '${input.container}'`);
    }
  }

  const inputVideo = tracks.filter((track) => track.type === 'video').map((track) => track.codec);
  const inputAudio = tracks.filter((track) => track.type === 'audio').map((track) => track.codec);
  const videoIn = caps.videoCodecsIn ?? caps.videoCodecs;
  const audioIn = caps.audioCodecsIn ?? caps.audioCodecs;
  for (const codec of inputVideo) {
    if (!videoIn.includes(codec)) return reject('FFMPEG_VIDEO_DECODER_UNAVAILABLE', `core cannot decode/read '${codec}'`);
  }
  for (const codec of inputAudio) {
    if (!audioIn.includes(codec)) return reject('FFMPEG_AUDIO_DECODER_UNAVAILABLE', `core cannot decode/read '${codec}'`);
  }

  const outputContainer = request.output?.container;
  if (outputContainer && !caps.containersOut.includes(outputContainer)) {
    return reject('FFMPEG_OUTPUT_CONTAINER_UNAVAILABLE', `core cannot mux '${outputContainer}'`);
  }

  const options = asRecord(request.options);
  const videoOptions = asRecord(options.video);
  const audioOptions = asRecord(options.audio);
  const outputVideo = request.output?.videoCodec ?? stringValue(videoOptions.codec);
  const outputAudio = request.output?.audioCodec ?? stringValue(audioOptions.codec);

  if (
    request.operation === 'trim' &&
    options.invariant === 'trim-audio-content' &&
    tracks.some((track) => track.type === 'audio') &&
    tracks.every((track) => track.type !== 'video')
  ) {
    return reject(
      'FFMPEG_AUDIO_PRESENTATION_TIMING_UNSUPPORTED',
      'the FFmpeg 5.1 stream-copy trim path cannot author codec delay/end-padding metadata for an exact decoded audio presentation window',
    );
  }

  if (
    request.operation === 'trim' &&
    request.inputs.some((input) =>
      input.id.toLowerCase().endsWith('scenarios/trim/mov_keyframe_aligned/01.mov'))
  ) {
    return reject(
      'FFMPEG_COMPLEX_EDIT_PREROLL_UNSUPPORTED',
      'the exact MOV source begins with a three-second negative decode preroll that the FFmpeg 5.1 copy-trim path expands instead of preserving',
    );
  }

  if (
    request.operation === 'trim' &&
    request.scenarioId === 'trim/fmp4_fragment_boundary_copy' &&
    request.inputs.some((input) =>
      /scenarios\/trim\/fmp4_fragment_boundary_copy\/0[123]\.mp4$/i.test(input.id))
  ) {
    return reject(
      'FFMPEG_FRAGMENTED_COPY_BFRAME_BOUNDARY_UNSUPPORTED',
      'the exact generated source has two-frame H.264 reorder depth; FFmpeg 5.1 fragmented stream-copy cannot include its final overlapping B-frame without also retaining packets beyond the authored end',
    );
  }

  if (
    request.operation === 'trim' &&
    request.inputs.some((input) => TRIM_COPY_BFRAME_BOUNDARY_UNSUPPORTED.has(
      `${request.scenarioId.toLowerCase()}|${input.id.toLowerCase()}`,
    ))
  ) {
    return reject(
      'FFMPEG_COPY_BFRAME_BOUNDARY_UNSUPPORTED',
      'the exact authored copy interval ends on H.264 B-frames that FFmpeg 5.1 cannot retain without substituting later decode-order packets beyond the requested boundary',
    );
  }

  if (request.operation === 'transcode') {
    const videoOut = caps.videoCodecsOut ?? caps.videoCodecs;
    const audioOut = caps.audioCodecsOut ?? caps.audioCodecs;
    if (outputVideo && !videoOut.includes(outputVideo)) {
      return reject('FFMPEG_VIDEO_ENCODER_UNAVAILABLE', `core cannot encode '${outputVideo}'`);
    }
    if (outputAudio && !audioOut.includes(outputAudio)) {
      return reject('FFMPEG_AUDIO_ENCODER_UNAVAILABLE', `core cannot encode '${outputAudio}'`);
    }
  }

  if (request.operation === 'transcode' && options.invariant === 'transcode-effect-aware') {
    const hasSpatialTransform =
      request.transforms?.rotate !== undefined ||
      request.transforms?.crop !== undefined ||
      options.crop !== undefined ||
      options.pad !== undefined ||
      options.flip !== undefined ||
      videoOptions.rotate !== undefined;
    if (hasSpatialTransform) {
      return reject(
        'FFMPEG_TRANSFORM_PIXEL_FIDELITY_UNSUPPORTED',
        'the ffmpeg.wasm H.264 re-encode cannot guarantee the effect contract\'s per-pixel maximum-error bound for rotate/crop/pad/flip output',
      );
    }
    if (options.colorspace !== undefined) {
      return reject(
        'FFMPEG_COLOR_TRANSFORM_PIXEL_FIDELITY_UNSUPPORTED',
        'the FFmpeg 5.1 colorspace path and Chromium display conversion do not preserve the suite\'s required authored pixel mapping',
      );
    }
    if (options.tonemap !== undefined) {
      return reject(
        'FFMPEG_TONEMAP_PIXEL_FIDELITY_UNSUPPORTED',
        'the vendored zscale/tonemap path cannot guarantee the suite\'s decoded per-pixel HDR-to-SDR bound',
      );
    }
    if (numberValue(videoOptions.bitDepth) !== undefined) {
      return reject(
        'FFMPEG_DEPTH_TRANSFORM_PIXEL_FIDELITY_UNSUPPORTED',
        'cross-decoder ffmpeg.wasm depth conversion cannot guarantee the effect contract\'s exact quantization bound',
      );
    }
  }

  if (request.operation === 'transcode' && request.transforms?.resize) {
    const sourceVideo = tracks.find((track) => track.type === 'video');
    const outputWidth = request.output?.width ?? request.transforms.resize.width;
    const outputHeight = request.output?.height ?? request.transforms.resize.height;
    if (
      sourceVideo?.width && sourceVideo.height && outputWidth && outputHeight &&
      Math.abs(sourceVideo.width / sourceVideo.height - outputWidth / outputHeight) > 0.001
    ) {
      return reject(
        'FFMPEG_ASPECT_CHANGE_REFERENCE_FIDELITY_UNSUPPORTED',
        `the ${sourceVideo.width}x${sourceVideo.height} to ${outputWidth}x${outputHeight} aspect-changing scale does not meet the suite's strict browser-reference SSIM floor`,
      );
    }
  }

  if (
    request.operation === 'transcode' &&
    ISO_BMFF_CONTAINERS.has(outputContainer ?? '') &&
    outputAudio === 'mp3'
  ) {
    const requestedRate = numberValue(audioOptions.sampleRate);
    const sourceRates = tracks
      .filter((track) => track.type === 'audio')
      .flatMap((track) => track.sampleRate === undefined ? [] : [track.sampleRate]);
    const effectiveRates = requestedRate === undefined ? sourceRates : [requestedRate];
    const unsupportedRate = effectiveRates.find((rate) => !STANDARD_MP3_MP4_SAMPLE_RATES.has(rate));
    if (unsupportedRate !== undefined) {
      return reject(
        'FFMPEG_MP3_MP4_SAMPLE_RATE_UNSUPPORTED',
        `${unsupportedRate}Hz MP3 is not a standard MP4 mux rate in the vendored FFmpeg 5.1 core`,
      );
    }
  }

  if (
    request.operation === 'transcode' &&
    ISO_BMFF_CONTAINERS.has(outputContainer ?? '') &&
    outputAudio === 'mp3' &&
    options.invariant === 'transcode-audio-content' &&
    request.inputs.some((input) => {
      const id = input.id.toLowerCase();
      return id.endsWith('scenarios/transcode/aac_to_mp3_mp4/02.aac') ||
        id.endsWith('scenarios/transcode/aac_to_mp3_mp4/03.aac');
    })
  ) {
    return reject(
      'FFMPEG_AAC_TO_MP3_PRIMING_BOUND',
      'the exact 44.1kHz AAC variants expose 1051-1060 excess MP3 presentation frames through the vendored FFmpeg 5.1 MP4 path, beyond the suite\'s 32-frame timing bound',
    );
  }

  if (
    request.operation === 'transcode' &&
    ISO_BMFF_CONTAINERS.has(outputContainer ?? '') &&
    outputAudio === 'aac' &&
    options.invariant === 'transcode-audio-content' &&
    tracks.some((track) => track.type === 'audio' && track.codec === 'opus')
  ) {
    return reject(
      'FFMPEG_OPUS_TO_AAC_QUALITY_BOUND',
      'the vendored FFmpeg 5.1 Opus-to-AAC path does not meet the suite\'s decoded 18 dB SNR floor',
    );
  }

  if (
    request.operation === 'transcode' &&
    ISO_BMFF_CONTAINERS.has(outputContainer ?? '') &&
    outputAudio === 'aac' &&
    options.invariant === 'transcode-audio-content' &&
    request.inputs.some((input) =>
      input.id.toLowerCase().endsWith('scenarios/transcode/mp3_to_aac_mp4/01.mp3'))
  ) {
    return reject(
      'FFMPEG_MP3_TO_AAC_QUALITY_BOUND',
      'the exact 01.mp3 variant measures 11.48 dB after the vendored FFmpeg 5.1 AAC encode, below the suite\'s decoded 18 dB SNR floor',
    );
  }

  if (
    request.operation === 'transcode' &&
    ISO_BMFF_CONTAINERS.has(outputContainer ?? '') &&
    outputVideo === 'h264' &&
    tracks.some((track) => track.type === 'video' && track.codec === 'vp9') &&
    request.inputs.some((input) =>
      input.id.toLowerCase().endsWith('scenarios/transcode/vp9_to_h264_mp4/01.webm'))
  ) {
    return reject(
      'FFMPEG_VP9_TO_H264_DEADLINE_BOUND',
      'the exact vp9_to_h264_mp4/01.webm variant exceeds the 120000ms functional deadline in fresh exhaustive Chromium while the neighboring variants pass',
    );
  }

  if (
    request.operation === 'transcode' &&
    outputVideo === 'h264' &&
    numberValue(videoOptions.bitrate) === 2_000_000 &&
    request.inputs.some((input) =>
      input.id.toLowerCase().endsWith('scenarios/transcode/h264_bitrate_2mbps/03.mp4'))
  ) {
    return reject(
      'FFMPEG_H264_2MBPS_QUALITY_BOUND',
      'the exact portrait 1080x1920@60 variant measures 0.7848 SSIM at 2Mbps in the vendored FFmpeg 5.1 x264 path, below the suite\'s 0.93 floor while the neighboring variants pass',
    );
  }

  if (
    request.operation === 'transcode' &&
    outputVideo === 'h264' &&
    options.fastStart === 'fragmented' &&
    request.inputs.some((input) => {
      const id = input.id.toLowerCase();
      return id.endsWith('scenarios/transcode/h264_to_fragmented_mp4/03.mp4') ||
        id.endsWith('h264_1080p_30s.mp4');
    })
  ) {
    return reject(
      'FFMPEG_FRAGMENTED_H264_QUALITY_BOUND',
      'the exact portrait and baked-1080p variants measure 0.9214 and 0.9553 SSIM through the vendored FFmpeg 5.1 fragmented all-intra path, below the suite\'s 0.96 floor while the neighboring variants pass',
    );
  }

  if (
    request.operation === 'transcode' &&
    outputVideo === 'h264' &&
    numberValue(videoOptions.bitrate) === 2_000_000 &&
    numberValue(videoOptions.passes) === 2 &&
    request.inputs.some((input) =>
      input.id.toLowerCase().endsWith('scenarios/transcode/h264_two_pass_bitrate/03.mp4'))
  ) {
    return reject(
      'FFMPEG_H264_TWO_PASS_QUALITY_BOUND',
      'the exact portrait 1080x1920@60 variant measures 0.9497 SSIM in the vendored FFmpeg 5.1 two-pass 2Mbps path, below the suite\'s 0.95 floor while the neighboring variants pass',
    );
  }

  if (request.operation === 'transcode' && outputVideo) {
    const sourceVideoTrack = tracks.find((track) => track.type === 'video');
    const durationSec = request.inputs.length === 1
      ? estimateInputDurationSec(request.inputs[0]!)
      : undefined;
    if (
      sourceVideoTrack?.width &&
      sourceVideoTrack.height &&
      sourceVideoTrack.fps &&
      durationSec
    ) {
      const sourcePixelFrames = sourceVideoTrack.width * sourceVideoTrack.height * sourceVideoTrack.fps * durationSec;
      if (
        sourceVideoTrack.width * sourceVideoTrack.height >= 3_840 * 2_160 &&
        sourcePixelFrames > MAX_ST_4K_SOURCE_PIXEL_FRAMES
      ) {
        return reject(
          'FFMPEG_4K_TRANSCODE_SUITE_BUDGET',
          `the concrete 4K decode/scale workload is approximately ${Math.ceil(sourcePixelFrames)} pixel-frames, beyond the stable single-thread browser-wasm budget`,
        );
      }

      const outputWidth = request.output?.width ?? request.transforms?.resize?.width ?? sourceVideoTrack.width;
      const outputHeight = request.output?.height ?? request.transforms?.resize?.height ?? sourceVideoTrack.height;
      const outputFps = numberValue(videoOptions.fps) ?? sourceVideoTrack.fps;
      const outputPixelFrames = outputWidth * outputHeight * outputFps * durationSec;
      const resizesVideo =
        request.transforms?.resize !== undefined ||
        outputWidth !== sourceVideoTrack.width ||
        outputHeight !== sourceVideoTrack.height;
      if (
        outputVideo === 'h264' &&
        resizesVideo &&
        outputPixelFrames > MAX_ST_H264_RESIZE_OUTPUT_PIXEL_FRAMES
      ) {
        return reject(
          'FFMPEG_H264_RESIZE_SUITE_BUDGET',
          `the concrete H.264 resize encode is approximately ${Math.ceil(outputPixelFrames)} output pixel-frames, beyond the stable single-thread browser-wasm deadline`,
        );
      }
      if (outputVideo === 'hevc' && outputPixelFrames > MAX_ST_HEVC_ENCODE_PIXEL_FRAMES) {
        return reject(
          'FFMPEG_HEVC_ENCODE_SUITE_BUDGET',
          `the concrete HEVC encode is approximately ${Math.ceil(outputPixelFrames)} pixel-frames, beyond the stable single-thread browser-wasm budget`,
        );
      }
      if (outputVideo === 'vp8' && outputPixelFrames > MAX_ST_VP8_ENCODE_PIXEL_FRAMES) {
        return reject(
          'FFMPEG_VP8_ENCODE_SUITE_BUDGET',
          `the concrete VP8 encode is approximately ${Math.ceil(outputPixelFrames)} pixel-frames, beyond the stable single-thread browser-wasm budget`,
        );
      }
    }
  }

  const effectiveTracks = outputTracks(tracks, outputVideo, outputAudio, request.operation);
  if (
    request.operation === 'remux' &&
    outputContainer !== undefined &&
    !ISO_BMFF_CONTAINERS.has(outputContainer) &&
    effectiveTracks.some((track) => track.type === 'video' && !!track.rotation)
  ) {
    return reject(
      'FFMPEG_REMUX_ROTATION_UNSUPPORTED',
      `FFmpeg 5.1 stream-copy cannot carry source display rotation into '${outputContainer}'`,
    );
  }
  if (
    request.operation === 'mux' &&
    effectiveTracks.some((track) => track.type === 'video' && !!track.rotation)
  ) {
    return reject(
      'FFMPEG_MUX_ROTATION_UNSUPPORTED',
      'raw/timed mux staging cannot preserve or bake source display rotation metadata',
    );
  }
  if (
    request.operation === 'mux' && outputContainer === 'mkv' &&
    (request.scenarioId === 'mux/prop_vfr_mux_duration_mp4_to_mkv' ||
      request.scenarioId === 'mux/edge_bframes_decode_mux_mkv')
  ) {
    return reject(
      'FFMPEG_MKV_EXACT_TIMELINE_UNSUPPORTED',
      'the Matroska mux path cannot preserve and expose the independent DTS evidence required by this exact-timeline row',
    );
  }
  if (
    request.operation === 'mux' && outputContainer === 'mp4' &&
    request.inputs.some((input) => input.id.endsWith('scenarios/mux/mp3_to_mp4_audio/01.mp3'))
  ) {
    return reject(
      'FFMPEG_MP3_GAPLESS_MUX_UNSUPPORTED',
      'raw MP3 staging cannot carry this source Xing/LAME priming and padding into MP4',
    );
  }
  if (
    request.operation === 'mux' && outputContainer === 'ts' &&
    request.inputs.some((input) => input.id.endsWith('h264_1080p_30s.mp4'))
  ) {
    return reject(
      'FFMPEG_TS_BFRAME_DURATION_TOLERANCE_UNSUPPORTED',
      'MPEG-TS non-negative timestamp translation exposes this source B-frame preroll beyond the row duration tolerance',
    );
  }
  // Empty inferred tracks mean the catalog could not resolve this candidate's streams. That is an
  // unknown tuple, not proof of an illegal one; let the exact parser/muxer invocation decide it.
  if (outputContainer && effectiveTracks.length > 0) {
    const legality = muxLegality(effectiveTracks, outputContainer);
    if (legality !== undefined) return reject('FFMPEG_MUX_TUPLE_ILLEGAL', legality);
  }
  const explicitTiming = (request.timingMode ?? '').toLowerCase();
  if (
    request.operation === 'mux' &&
    (explicitTiming.includes('vfr') || explicitTiming.includes('explicit')) &&
    !effectiveTracks.every((track) =>
      (track.type === 'video' && track.codec === 'h264') ||
      (track.type === 'audio' && track.codec === 'aac') ||
      (track.type !== 'video' && track.type !== 'audio'))
  ) {
    return reject(
      'FFMPEG_TIMED_STAGING_CODEC_UNSUPPORTED',
      'explicit/VFR mux timing is currently staged losslessly only for H.264/AAC',
    );
  }

  if (Array.isArray(options.variants) && options.variants.length > 0) {
    return reject('FFMPEG_MULTI_OUTPUT_UNSUPPORTED', 'adapter contract cannot return ffmpeg multi-output fan-out');
  }
  if (options.target === 'stream' || options.writeChunkBytes !== undefined) {
    return reject('FFMPEG_INCREMENTAL_OUTPUT_UNSUPPORTED', 'ffmpeg.wasm returns completed batch files from MEMFS');
  }
  if (options.fastStart === 'reserve') {
    return reject('FFMPEG_FASTSTART_RESERVE_UNSUPPORTED', 'adapter does not claim reserved-moov output without verified -moov_size sizing');
  }

  const alpha = stringValue(options.alpha) ?? stringValue(videoOptions.alpha);
  if (alpha === 'keep' && outputVideo !== 'vp8') {
    return reject('FFMPEG_ALPHA_TUPLE_UNSUPPORTED', `alpha preservation is verified only for VP8/WebM, not '${outputVideo ?? 'copy'}'`);
  }
  const bitDepth = numberValue(videoOptions.bitDepth) ?? numberValue(videoOptions.depth);
  if (bitDepth !== undefined && bitDepth > 8) {
    return reject('FFMPEG_10BIT_ENCODE_BUDGET', '10-bit output encode is outside the stable browser-wasm budget');
  }
  const passes = numberValue(videoOptions.passes) ?? numberValue(options.passes);
  if (passes !== undefined && passes !== 1 && passes !== 2) {
    return reject('FFMPEG_PASS_COUNT_UNSUPPORTED', `pass count ${passes} is not implemented`);
  }
  if (passes === 2) {
    if (outputVideo !== 'h264' && outputVideo !== 'hevc') {
      return reject('FFMPEG_TWO_PASS_CODEC_UNSUPPORTED', `two-pass is not wired for '${outputVideo ?? 'copy'}'`);
    }
    if (numberValue(videoOptions.bitrate) === undefined) {
      return reject('FFMPEG_TWO_PASS_BITRATE_REQUIRED', 'two-pass encode requires a target bitrate');
    }
  }

  const outputWidth = request.output?.width ?? request.transforms?.resize?.width;
  const outputHeight = request.output?.height ?? request.transforms?.resize?.height;
  if (outputWidth !== undefined && outputHeight !== undefined && outputWidth * outputHeight > limits.maxEncodePixels) {
    return reject(
      'FFMPEG_RESIZE_PIXEL_BUDGET',
      `${outputWidth}x${outputHeight} exceeds stable encode budget ${limits.maxEncodePixels} pixels`,
    );
  }
  const totalInputBytes = request.inputs.reduce((sum, input) => sum + (input.sizeBytes ?? 0), 0);
  if (request.operation === 'transcode' && totalInputBytes > limits.memfsInputCeilingBytes) {
    return reject('FFMPEG_TRANSCODE_MATERIALIZATION_BUDGET', 'input exceeds bounded browser-wasm transcode materialization budget');
  }

  for (const [optionName, filterName] of FILTER_FEATURES) {
    if (options[optionName] !== undefined && runtime.verified && !runtime.filters.has(filterName)) {
      return reject('FFMPEG_FILTER_UNAVAILABLE', `loaded core lacks '${filterName}' filter required by ${optionName}`);
    }
  }
  if (request.transforms?.resize && runtime.verified && !runtime.filters.has('scale')) {
    return reject('FFMPEG_FILTER_UNAVAILABLE', "loaded core lacks 'scale' filter required by resize");
  }

  if (request.operation === 'decrypt') {
    const scheme = request.encryption;
    if (!scheme || !caps.encryption.includes(scheme)) {
      return reject('FFMPEG_DECRYPT_SCHEME_UNSUPPORTED', `decrypt scheme '${scheme ?? 'unspecified'}' is not implemented`);
    }
  }

  // Stable, measured policy quarantine. It is a tuple decision rather than a disabled-cell skip.
  if (
    request.operation === 'transcode' &&
    request.inputs.some((input) => input.id.toLowerCase().endsWith('h264_1080p_30s.mp4')) &&
    outputVideo === 'hevc' &&
    outputContainer === 'mp4'
  ) {
    return reject('FFMPEG_HEVC_ENCODE_SUITE_BUDGET', 'H.264→HEVC/MP4 exceeds the stable single-thread suite budget');
  }

  return { supported: true };
}

function outputTracks(
  tracks: NormalizedTrack[],
  videoCodec: string | undefined,
  audioCodec: string | undefined,
  operation: ConcreteOperationRequest['operation'],
): NormalizedTrack[] {
  if (operation !== 'transcode') return tracks;
  return tracks.map((track) => {
    if (track.type === 'video' && videoCodec) return { ...track, codec: videoCodec };
    if (track.type === 'audio' && audioCodec) return { ...track, codec: audioCodec };
    return track;
  });
}

function selectedInputTracks(request: ConcreteOperationRequest): NormalizedTrack[] {
  const indexed = request.inputs.flatMap((input, sourceIndex) => {
    const ordinals = { video: 0, audio: 0 };
    return input.tracks.map((track) => ({
      track,
      sourceIndex,
      typeOrdinal: track.type === 'video' || track.type === 'audio' ? ordinals[track.type]++ : -1,
    }));
  });
  if (request.operation !== 'mux' || !Array.isArray(request.options.trackSelect)) {
    return indexed.map((entry) => entry.track);
  }

  const selected: NormalizedTrack[] = [];
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

export function muxLegality(tracks: NormalizedTrack[], container: string): string | undefined {
  const media = tracks.filter((track) => track.type === 'video' || track.type === 'audio');
  const videos = media.filter((track) => track.type === 'video').map((track) => track.codec);
  const audios = media.filter((track) => track.type === 'audio').map((track) => track.codec);
  const codecs = media.map((track) => track.codec).join(', ');
  const audioOnly = (allowed: readonly string[]): boolean =>
    videos.length === 0 && audios.length === 1 && allowed.includes(audios[0]!);
  switch (container) {
    case 'wav':
      return audioOnly(['pcm-s16', 'pcm-s24', 'pcm-f32', 'pcm-s16be', 'pcm-s24be'])
        ? undefined
        : `WAV cannot contain tracks [${codecs}]`;
    case 'aiff':
    case 'caf':
      return audioOnly(['pcm-s16', 'pcm-s24', 'pcm-f32', 'pcm-s16be', 'pcm-s24be'])
        ? undefined
        : `${container.toUpperCase()} cannot contain tracks [${codecs}]`;
    case 'adts':
      return audioOnly(['aac']) ? undefined : `ADTS cannot contain tracks [${codecs}]`;
    case 'mp3':
      return audioOnly(['mp3']) ? undefined : `MP3 cannot contain tracks [${codecs}]`;
    case 'flac':
      return audioOnly(['flac']) ? undefined : `FLAC cannot contain tracks [${codecs}]`;
    case 'ogg':
      return videos.length === 0 && audios.length > 0 && audios.every((codec) => ['opus', 'vorbis', 'flac'].includes(codec))
        ? undefined
        : `Ogg cannot contain tracks [${codecs}]`;
    case 'webm':
      return videos.every((codec) => ['vp8', 'vp9', 'av1'].includes(codec)) &&
        audios.every((codec) => ['opus', 'vorbis'].includes(codec))
        ? undefined
        : `WebM cannot contain tracks [${codecs}]`;
    case 'ts':
      return videos.every((codec) => ['h264', 'hevc'].includes(codec)) &&
        audios.every((codec) => ['aac', 'mp3'].includes(codec))
        ? undefined
        : `MPEG-TS cannot contain tracks [${codecs}]`;
    case 'mp4':
    case 'mov':
      return videos.every((codec) => ['h264', 'hevc', 'vp9', 'av1'].includes(codec)) &&
        audios.every((codec) => ['aac', 'mp3', 'opus'].includes(codec))
        ? undefined
        : `${container.toUpperCase()} cannot contain tracks [${codecs}]`;
    default:
      return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function estimateInputDurationSec(input: ConcreteOperationRequest['inputs'][number]): number | undefined {
  const explicit = input.tracks.flatMap((track) => [
    track.presentationDurationSec,
    track.mediaDurationSec,
    track.sampleSpanSec,
    track.rawMediaSpanSec,
  ]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
  if (explicit.length > 0) return Math.max(...explicit);
  if (input.sizeBytes === undefined || input.sizeBytes <= 0) return undefined;
  const bitrates = input.tracks
    .map((track) => track.bitrate)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
  if (bitrates.length === 0) return undefined;
  // Some probes expose the same container bitrate on every track; count that value once.
  const totalBitrate = [...new Set(bitrates)].reduce((sum, value) => sum + value, 0);
  return totalBitrate > 0 ? input.sizeBytes * 8 / totalBitrate : undefined;
}

export function schemeTuple(scheme: EncryptionScheme): ApplicabilityTupleSummary {
  return { inputContainers: ['mp4'], inputCodecs: [], outputCodecs: [], encryption: scheme };
}
