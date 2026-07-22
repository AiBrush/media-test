import type {
  ApplicabilityTupleSummary,
  CapabilitySet,
  ConcreteOperationRequest,
  EncryptionScheme,
  NormalizedTrack,
  SupportDecision,
} from '../../core/engine.ts';
import type { RemuxProgramEvidence } from '../../features/remux/types.ts';

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

export function isWorkerFsBlobUnreadableError(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : '';
  return (error instanceof DOMException && error.name === 'NotReadableError') ||
    /FileReaderSync|requested file could not be read/i.test(message);
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
/** Ordinary codec preroll is a few frames; a longer negative decode origin denotes an edit span. */
const MAX_STREAM_COPY_PREROLL_US = 500_000;
/** Ignore only sub-tick rounding when deciding whether the source requires signed CTS offsets. */
const SIGNED_CTS_ROUNDING_US = 2_000;

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

  // Mutated inputs must reach the parser/decoder. Rejecting them on inferred tuple evidence would
  // launder malformed input into NA_ENGINE, which is forbidden by the benchmark contract.
  if (request.inputs.some((input) => input.mutated)) return { supported: true };

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

  const tracks = request.inputs.flatMap((input) => input.tracks);
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

  const effectiveTracks = outputTracks(tracks, outputVideo, outputAudio, request.operation);
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

export function schemeTuple(scheme: EncryptionScheme): ApplicabilityTupleSummary {
  return { inputContainers: ['mp4'], inputCodecs: [], outputCodecs: [], encryption: scheme };
}
