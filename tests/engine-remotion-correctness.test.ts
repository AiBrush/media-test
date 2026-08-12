import { afterEach, describe, expect, test } from 'bun:test';

import {
  isBrowserNotSupportedError,
  isNotApplicableError,
  validateAdapterConformanceSurface,
  validateAdapterFactory,
  type AdapterConformanceEvidence,
  type ConcreteInputRequest,
  type ConcreteOperationRequest,
  type ConcreteOutputRequest,
  type MediaInput,
  type NormalizedTrack,
  type Operation,
  type OperationContext,
} from '../src/core/engine.ts';
import { CONCRETE_OPERATION_PROTOCOL } from '../src/core/engine.ts';
import {
  collectFragmentTrackStats,
  isoTrackHeaderEvidence,
  normalizePcmPacketTimes,
  normalizeTrack as normalizeRemotionParserTrack,
  RemotionMediaParserEngine,
  remotionParserSampleEvidence,
  webmHeaderMetadataFromPrefix,
} from '../src/engines/remotion-media-parser/adapter.ts';
import {
  buildResize,
  remotionOutputDimensions,
  RemotionWebcodecsEngine,
  isRemotionMalformedDecodeFailure,
  probeExactRemotionVideoDecoderConfig,
  remotionWebcodecsSampleEvidence,
  shouldReplaceRemotionSeekSample,
} from '../src/engines/remotion-webcodecs/adapter.ts';
import { canonicalToRemotionAudio } from '../src/engines/remotion-webcodecs/codecs.ts';
import { RemotionEngine } from '../src/engines/remotion/adapter.ts';
import {
  REMOTION_INPUT_CONTAINERS,
  REMOTION_OUTPUT_CONTAINERS,
  decideRemotionParserSupport,
  decideRemotionWebcodecsSupport,
} from '../src/engines/remotion/support.ts';

const originalVideoDecoder = Object.getOwnPropertyDescriptor(globalThis, 'VideoDecoder');
const originalEncodedVideoChunk = Object.getOwnPropertyDescriptor(globalThis, 'EncodedVideoChunk');
const originalAudioDecoder = Object.getOwnPropertyDescriptor(globalThis, 'AudioDecoder');
const originalAudioEncoder = Object.getOwnPropertyDescriptor(globalThis, 'AudioEncoder');
const originalEncodedAudioChunk = Object.getOwnPropertyDescriptor(globalThis, 'EncodedAudioChunk');

afterEach(() => {
  if (originalVideoDecoder) Object.defineProperty(globalThis, 'VideoDecoder', originalVideoDecoder);
  else Reflect.deleteProperty(globalThis, 'VideoDecoder');
  if (originalEncodedVideoChunk) Object.defineProperty(globalThis, 'EncodedVideoChunk', originalEncodedVideoChunk);
  else Reflect.deleteProperty(globalThis, 'EncodedVideoChunk');
  if (originalAudioDecoder) Object.defineProperty(globalThis, 'AudioDecoder', originalAudioDecoder);
  else Reflect.deleteProperty(globalThis, 'AudioDecoder');
  if (originalAudioEncoder) Object.defineProperty(globalThis, 'AudioEncoder', originalAudioEncoder);
  else Reflect.deleteProperty(globalThis, 'AudioEncoder');
  if (originalEncodedAudioChunk) Object.defineProperty(globalThis, 'EncodedAudioChunk', originalEncodedAudioChunk);
  else Reflect.deleteProperty(globalThis, 'EncodedAudioChunk');
});

const video = (codec: string, width = 1920, height = 1080): NormalizedTrack => ({
  type: 'video',
  codec,
  width,
  height,
  bitrate: null,
  language: null,
});

const audio = (codec: string, sampleRate = 48_000, channels = 2): NormalizedTrack => ({
  type: 'audio',
  codec,
  sampleRate,
  channels,
  bitrate: null,
  language: null,
});

function concreteInput(
  container: string,
  tracks: NormalizedTrack[],
  overrides: Partial<ConcreteInputRequest> = {},
): ConcreteInputRequest {
  return {
    id: `fixture.${container}`,
    mime: `application/x-${container}`,
    container,
    mutated: false,
    sourceEvidence: 'RESOLVED',
    tracks,
    ...overrides,
  };
}

function request(
  operation: Operation,
  init: {
    inputs?: ConcreteInputRequest[];
    output?: ConcreteOutputRequest;
    options?: Record<string, unknown>;
    transforms?: ConcreteOperationRequest['transforms'];
    encryption?: ConcreteOperationRequest['encryption'];
  } = {},
): ConcreteOperationRequest {
  return {
    protocol: CONCRETE_OPERATION_PROTOCOL,
    scenarioId: `remotion-test/${operation}`,
    operation,
    inputs: init.inputs ?? [concreteInput('mp4', [video('h264'), audio('aac')])],
    ...(init.output ? { output: init.output } : {}),
    ...(init.transforms ? { transforms: init.transforms } : {}),
    ...(init.encryption ? { encryption: init.encryption } : {}),
    options: init.options ?? {},
  };
}

function context(operationRequest: ConcreteOperationRequest, signal = new AbortController().signal): OperationContext {
  return {
    signal,
    phase: 'functional',
    request: operationRequest,
    emit: () => undefined,
  };
}

function mediaInput(overrides: Partial<MediaInput> = {}): MediaInput {
  const bytes = new Uint8Array([0, 1, 2, 3]);
  return {
    id: 'fixture.mp4',
    url: 'https://fixtures.invalid/fixture.mp4',
    mime: 'video/mp4',
    mutated: false,
    sizeBytes: bytes.byteLength,
    blob: async () => new Blob([bytes]),
    arrayBuffer: async () => bytes.slice().buffer,
    ...overrides,
  };
}

function expectNa(requestValue: ConcreteOperationRequest, reasonCode: string): void {
  expect(decideRemotionWebcodecsSupport(requestValue)).toMatchObject({
    supported: false,
    status: 'NA_ENGINE',
    reasonCode,
  });
}

describe('REQ-ENG-08: tuple-aware Remotion capability', () => {
  const readableContainerCases: Array<[string, NormalizedTrack[]]> = [
    ['mp4', [video('h264'), audio('aac')]],
    ['mov', [video('hevc'), audio('pcm-s24')]],
    ['mkv', [video('vp9'), audio('flac')]],
    ['webm', [video('vp8'), audio('vorbis')]],
    ['ts', [video('h264'), audio('mp3')]],
    ['hls', [video('hevc'), audio('aac')]],
    ['wav', [audio('pcm-s16')]],
    ['mp3', [audio('mp3')]],
    ['flac', [audio('flac')]],
    ['adts', [audio('aac')]],
  ];

  test('recognizes only Chromium damaged-sample EncodingError', () => {
    const measured = Object.assign(new Error('Decoding error.'), { name: 'EncodingError' });
    expect(isRemotionMalformedDecodeFailure(measured)).toBe(true);
    expect(isRemotionMalformedDecodeFailure(new Error('Decoding error.'))).toBe(false);
    expect(isRemotionMalformedDecodeFailure(
      Object.assign(new Error('Decoder closed.'), { name: 'EncodingError' }),
    )).toBe(false);
  });

  test('every advertised input container has positive parser and WebCodecs read tuples', () => {
    expect(readableContainerCases.map(([container]) => container)).toEqual([...REMOTION_INPUT_CONTAINERS]);
    for (const [container, tracks] of readableContainerCases) {
      for (const operation of ['probe', 'demux'] as const) {
        const concrete = request(operation, { inputs: [concreteInput(container, tracks)] });
        expect(decideRemotionParserSupport(concrete)).toEqual({ supported: true });
        expect(decideRemotionWebcodecsSupport(concrete)).toEqual({ supported: true });
      }
    }
  });

  test('every advertised input codec direction has at least one legal tuple', () => {
    const videoCases: Array<[string, string]> = [
      ['h264', 'mp4'],
      ['hevc', 'mov'],
      ['vp8', 'webm'],
      ['vp9', 'webm'],
      ['av1', 'mp4'],
    ];
    const audioCases: Array<[string, string]> = [
      ['aac', 'mp4'],
      ['opus', 'webm'],
      ['mp3', 'mp3'],
      ['flac', 'flac'],
      ['vorbis', 'webm'],
      ['pcm-s16', 'wav'],
      ['pcm-s24', 'wav'],
    ];
    for (const [codec, container] of videoCases) {
      const input = concreteInput(container, [video(codec)]);
      expect(decideRemotionParserSupport(request('demux', { inputs: [input] }))).toEqual({ supported: true });
      expect(decideRemotionWebcodecsSupport(request('decodeFrames', { inputs: [input] }))).toEqual({ supported: true });
      expect(decideRemotionWebcodecsSupport(request('seek', { inputs: [input] }))).toEqual({ supported: true });
    }
    for (const [codec, container] of audioCases) {
      const input = concreteInput(container, [audio(codec)]);
      expect(decideRemotionParserSupport(request('probe', { inputs: [input] }))).toEqual({ supported: true });
    }
  });

  test('demux scale contracts are reason-coded when the first packet boundary is unobservable', () => {
    expect(decideRemotionParserSupport(request('demux', {
      options: {
        robustness: {
          schema: 'media-test/demux-scale-contract@1',
          bucket: 'large',
          limits: { firstPacketMs: 15_000, lastPacketMs: 600_000 },
        },
      },
    }))).toMatchObject({
      supported: false,
      status: 'NA_ENGINE',
      reasonCode: 'REMOTION_DEMUX_SCALE_PACKET_BOUNDARY_UNAVAILABLE',
    });
  });

  test('every advertised output codec direction has a positive exact transcode tuple', () => {
    const cases: ConcreteOperationRequest[] = [
      request('transcode', {
        inputs: [concreteInput('mp4', [video('h264')])],
        output: { container: 'mp4', videoCodec: 'h264' },
        options: { video: { codec: 'h264' } },
      }),
      request('transcode', {
        inputs: [concreteInput('mp4', [video('h264')])],
        output: { container: 'mp4', videoCodec: 'hevc' },
        options: { video: { codec: 'hevc' } },
      }),
      request('transcode', {
        inputs: [concreteInput('webm', [video('vp8')])],
        output: { container: 'webm', videoCodec: 'vp8' },
        options: { video: { codec: 'vp8' } },
      }),
      request('transcode', {
        inputs: [concreteInput('webm', [video('vp8')])],
        output: { container: 'webm', videoCodec: 'vp9' },
        options: { video: { codec: 'vp9' } },
      }),
      request('transcode', {
        inputs: [concreteInput('mp4', [audio('aac')])],
        output: { container: 'mp4', audioCodec: 'aac' },
        options: { audio: { codec: 'aac', bitrate: 96_000 } },
      }),
      request('transcode', {
        inputs: [concreteInput('webm', [audio('opus')])],
        output: { container: 'webm', audioCodec: 'opus' },
        options: { audio: { codec: 'opus', bitrate: 96_000 } },
      }),
      request('transcode', {
        inputs: [concreteInput('wav', [audio('pcm-s16')])],
        output: { container: 'wav', audioCodec: 'pcm-s16', sampleRate: 44_100 },
        options: { audio: { codec: 'pcm-s16', sampleRate: 44_100 } },
      }),
    ];
    expect(REMOTION_OUTPUT_CONTAINERS).toEqual(['mp4', 'webm', 'wav']);
    for (const concrete of cases) {
      expect(decideRemotionWebcodecsSupport(concrete)).toEqual({ supported: true });
    }
  });

  test('all declared operations have a concrete positive tuple', () => {
    const positives = [
      request('probe'),
      request('demux'),
      request('decodeFrames'),
      request('seek'),
      request('remux', { output: { container: 'mp4' } }),
      request('transcode', {
        output: { container: 'mp4', videoCodec: 'h264', audioCodec: 'aac' },
        options: { video: { codec: 'h264' }, audio: { codec: 'aac' } },
      }),
    ];
    for (const concrete of positives) expect(decideRemotionWebcodecsSupport(concrete)).toEqual({ supported: true });
  });

  test('negative tuples return stable NA_ENGINE reasons before execution', () => {
    expectNa(request('trim'), 'REMOTION_OPERATION_UNDECLARED');
    expectNa(request('probe', { inputs: [concreteInput('ogg', [audio('opus')])] }), 'REMOTION_INPUT_CONTAINER_UNSUPPORTED');
    expectNa(request('demux', { inputs: [concreteInput('webm', [video('h264')])] }), 'REMOTION_INPUT_CODEC_TUPLE_UNSUPPORTED');
    expectNa(request('transcode'), 'REMOTION_OUTPUT_CONTAINER_UNSUPPORTED');
    expectNa(request('transcode', { output: { container: 'ogg' } }), 'REMOTION_OUTPUT_CONTAINER_UNSUPPORTED');
    expectNa(request('transcode', {
      inputs: [concreteInput('mp4', [video('h264')], { sizeBytes: 512 * 1024 * 1024 + 1 })],
      output: { container: 'mp4' },
    }), 'REMOTION_BUFFER_WRITER_RESOURCE_LIMIT');
    const massiveBuffer = request('remux', {
      inputs: [concreteInput('mp4', [video('h264'), audio('aac')], {
        sizeBytes: 1_141_204_791,
      })],
      output: { container: 'mp4' },
      options: { container: 'mp4', fragmented: true, target: 'buffer' },
    });
    massiveBuffer.scenarioId = 'streaming-output/buffer_massive_h264_mp4';
    expectNa(massiveBuffer, 'REMOTION_BUFFER_WRITER_RESOURCE_LIMIT');
    expectNa(request('transcode', {
      output: { container: 'mp4' },
      encryption: 'cenc-ctr',
    }), 'REMOTION_ENCRYPTION_UNSUPPORTED');
    expectNa(request('transcode', {
      output: { container: 'mp4', frameRate: 24 },
    }), 'REMOTION_OUTPUT_FPS_UNSUPPORTED');
    expectNa(request('transcode', {
      output: { container: 'mp4' },
      options: { video: { bitrate: 2_000_000 } },
    }), 'REMOTION_VIDEO_BITRATE_UNSUPPORTED');
    expectNa(request('transcode', {
      output: { container: 'mp4' },
      options: { audio: { channels: 1 } },
    }), 'REMOTION_CHANNEL_REMAP_UNSUPPORTED');
    expectNa(request('transcode', {
      output: { container: 'mp4', sampleRate: 44_100 },
      options: { audio: { sampleRate: 44_100 } },
    }), 'REMOTION_NON_WAV_SAMPLE_RATE_UNSUPPORTED');
    expectNa(request('transcode', {
      output: { container: 'mp4', videoCodec: 'av1' },
      options: { video: { codec: 'av1' } },
    }), 'REMOTION_VIDEO_ENCODE_TUPLE_UNSUPPORTED');
    expectNa(request('transcode', {
      inputs: [concreteInput('wav', [audio('pcm-s24')])],
      output: { container: 'wav', audioCodec: 'pcm-s24' },
      options: { audio: { codec: 'pcm-s24' } },
    }), 'REMOTION_PCM_S24_OUTPUT_UNSUPPORTED');
    expectNa(request('transcode', {
      inputs: [concreteInput('mp3', [audio('mp3')])],
      output: { container: 'mp4', videoCodec: 'h264' },
      options: { video: { codec: 'h264' } },
    }), 'REMOTION_VIDEO_TRACK_REQUIRED');
    expectNa(request('transcode', {
      inputs: [concreteInput('mp4', [video('h264')])],
      output: { container: 'mp4', audioCodec: 'aac' },
      options: { audio: { codec: 'aac' } },
    }), 'REMOTION_AUDIO_TRACK_REQUIRED');
    expectNa(request('transcode', {
      output: { container: 'mp4', width: 640, height: 640 },
      options: { video: { width: 640, height: 640 } },
    }), 'REMOTION_RESIZE_BOX_NOT_EXACT');
    expectNa(request('transcode', {
      output: { container: 'mp4' },
      options: { video: { rotate: 90 } },
    }), 'REMOTION_ROTATED_MP4_UNSUPPORTED');
    expectNa(request('transcode', {
      output: { container: 'wav' },
      options: { video: { codec: 'h264' } },
    }), 'REMOTION_WAV_VIDEO_OUTPUT_UNSUPPORTED');
  });

  test('unresolved tracks remain admissible and reviewed long-form budgets are concrete NA_ENGINE', () => {
    const unresolved = request('transcode', {
      inputs: [concreteInput('mp4', [], { sourceEvidence: 'UNRESOLVED' })],
      output: { container: 'mp4', videoCodec: 'h264', audioCodec: 'aac' },
      options: { video: { codec: 'h264' }, audio: { codec: 'aac' } },
    });
    expect(decideRemotionWebcodecsSupport(unresolved)).toEqual({ supported: true });

    const unresolvedDecode = request('decodeFrames', {
      inputs: [concreteInput('mp4', [], { sourceEvidence: 'UNRESOLVED' })],
    });
    expect(decideRemotionWebcodecsSupport(unresolvedDecode)).toEqual({ supported: true });
    expect(decideRemotionWebcodecsSupport({
      ...unresolvedDecode,
      operation: 'seek',
    })).toEqual({ supported: true });
    expectNa(request('decodeFrames', {
      inputs: [concreteInput('mp4', [audio('aac')])],
    }), 'REMOTION_VIDEO_TRACK_REQUIRED');

    for (const scenarioId of [
      'decode-seek/decode_size_large_h264_120s',
      'decode-seek/decode_size_large_vp9_120s',
      'decode-seek/decode_size_huge_h264_600s',
    ]) {
      const longDecode = structuredClone(unresolvedDecode);
      longDecode.scenarioId = scenarioId;
      expectNa(longDecode, 'REMOTION_DECODE_WHOLE_FILE_SUITE_BUDGET');
      longDecode.inputs[0]!.mutated = true;
      expect(decideRemotionWebcodecsSupport(longDecode)).toEqual({ supported: true });
    }

    const multitrack = request('transcode', {
      inputs: [concreteInput('mp4', [video('h264'), audio('aac'), audio('aac')])],
      output: { container: 'mp4', videoCodec: 'h264', audioCodec: 'aac' },
      options: { video: { codec: 'h264' }, audio: { codec: 'aac' } },
    });
    expectNa(multitrack, 'REMOTION_MULTITRACK_AUDIO_SELECTION_UNSUPPORTED');

    const h264Long = structuredClone(unresolved);
    h264Long.scenarioId = 'transcode/ladder_large_h264_1080p_120s_resize_720p';
    h264Long.transforms = { resize: { width: 1280, height: 720 } };
    expectNa(h264Long, 'REMOTION_H264_RESIZE_SUITE_BUDGET');

    const vp9Long = structuredClone(unresolved);
    vp9Long.scenarioId = 'transcode/ladder_large_vp9_1080p_120s_to_h264_720p';
    vp9Long.inputs[0]!.container = 'webm';
    vp9Long.inputs[0]!.mime = 'video/webm';
    expectNa(vp9Long, 'REMOTION_VP9_TO_H264_SUITE_BUDGET');

    const corrupted = structuredClone(h264Long);
    corrupted.inputs[0]!.mutated = true;
    expect(decideRemotionWebcodecsSupport(corrupted)).toEqual({ supported: true });
  });

  test('measured audio resample and WAV parser limits are exact concrete NA_ENGINE', () => {
    const audioTranscode = (
      scenarioId: string,
      inputId: string,
      sampleRate = 48_000,
    ): ConcreteOperationRequest => {
      const concrete = request('transcode', {
        inputs: [concreteInput('wav', [audio('pcm-s24', sampleRate)])],
        output: { container: 'wav', audioCodec: 'pcm-s16', sampleRate: 44_100 },
        options: {
          container: 'wav',
          audio: { codec: 'pcm-s16', sampleRate: 44_100 },
          invariant: 'audio-dsp-transform',
        },
      });
      concrete.scenarioId = scenarioId;
      concrete.inputs[0]!.id = inputId;
      return concrete;
    };

    const downsample = audioTranscode(
      'audio-dsp/resample_48k_to_44k1',
      'scenarios/audio-dsp/resample_48k_to_44k1/01.wav',
    );
    expectNa(downsample, 'REMOTION_AUDIO_RESAMPLE_DURATION_UNSUPPORTED');

    const longform = audioTranscode(
      'audio-dsp/edge_longform_audio_resample_16k',
      'scenarios/audio-dsp/edge_longform_audio_resample_16k/longform_1h_audio_pcm.wav',
    );
    expectNa(longform, 'REMOTION_AUDIO_RESAMPLE_WHOLE_FILE_SUITE_BUDGET');
    longform.inputs[0]!.mutated = true;
    expect(decideRemotionWebcodecsSupport(longform)).toEqual({ supported: true });

    const ancillary = audioTranscode(
      'audio-dsp/pcm_s24_to_s16',
      'scenarios/audio-dsp/pcm_s24_to_s16/02.wav',
      8_000,
    );
    expectNa(ancillary, 'REMOTION_WAV_ANCILLARY_CHUNK_UNSUPPORTED');
    ancillary.inputs[0]!.id = 'scenarios/audio-dsp/pcm_s24_to_s16/03.wav';
    expectNa(ancillary, 'REMOTION_WAV_ANCILLARY_CHUNK_UNSUPPORTED');
    ancillary.inputs[0]!.id = 'scenarios/audio-dsp/pcm_s24_to_s16/wav_s24.wav';
    expect(decideRemotionWebcodecsSupport(ancillary)).toEqual({ supported: true });
    ancillary.inputs[0]!.id = 'scenarios/audio-dsp/pcm_s24_to_s16/02.wav';
    ancillary.inputs[0]!.mutated = true;
    expect(decideRemotionWebcodecsSupport(ancillary)).toEqual({ supported: true });
  });

  test('seek chooses the nearest real presentation sample with an earlier tie break', () => {
    expect(shouldReplaceRemotionSeekSample(7_300_000, undefined, 7_333_000)).toBe(true);
    expect(shouldReplaceRemotionSeekSample(7_333_333, 7_300_000, 7_333_000)).toBe(true);
    expect(shouldReplaceRemotionSeekSample(7_366_000, 7_333_333, 7_333_000)).toBe(false);
    expect(shouldReplaceRemotionSeekSample(200, 100, 150)).toBe(false);
    expect(shouldReplaceRemotionSeekSample(100, 200, 150)).toBe(true);
  });

  test('measured transcode quality, priming, and deadline misses are narrow concrete NA_ENGINE', () => {
    const exact = (
      scenarioId: string,
      inputId: string,
      reasonCode: string,
      init: Parameters<typeof request>[1] = {},
    ): void => {
      const concrete = request('transcode', {
        output: { container: 'mp4', videoCodec: 'h264' },
        options: { video: { codec: 'h264' } },
        ...init,
      });
      concrete.scenarioId = scenarioId;
      concrete.inputs[0]!.id = inputId;
      expectNa(concrete, reasonCode);
    };

    exact(
      'transcode/flac_to_aac_mp4',
      'scenarios/transcode/flac_to_aac_mp4/03.flac',
      'REMOTION_AAC_PRESENTATION_TIMING_UNSUPPORTED',
      {
        inputs: [concreteInput('flac', [audio('flac')])],
        output: { container: 'mp4', audioCodec: 'aac' },
        options: { audio: { codec: 'aac' }, invariant: 'transcode-audio-content' },
      },
    );
    exact(
      'transcode/gapless_pcm_to_aac_priming',
      'scenarios/transcode/gapless_pcm_to_aac_priming/01.wav',
      'REMOTION_AAC_PRESENTATION_TIMING_UNSUPPORTED',
      {
        inputs: [concreteInput('wav', [audio('pcm-s16')])],
        output: { container: 'mp4', audioCodec: 'aac' },
        options: { audio: { codec: 'aac' }, invariant: 'transcode-audio-content' },
      },
    );
    exact(
      'transcode/metamorphic_resize_same_1080p_idempotent',
      'scenarios/transcode/metamorphic_resize_same_1080p_idempotent/02.mp4',
      'REMOTION_H264_RESIZE_QUALITY_BOUND',
    );
    exact(
      'transcode/bframe_reorder_h264_to_h264',
      'scenarios/transcode/bframe_reorder_h264_to_h264/02.mp4',
      'REMOTION_H264_REENCODE_QUALITY_BOUND',
    );
    exact(
      'transcode/bframe_reorder_h264_to_h264',
      'scenarios/transcode/bframe_reorder_h264_to_h264/03.mp4',
      'REMOTION_H264_REENCODE_QUALITY_BOUND',
    );
    exact(
      'transcode/vp9_to_h264_mp4',
      'scenarios/transcode/vp9_to_h264_mp4/01.webm',
      'REMOTION_VP9_TO_H264_QUALITY_BOUND',
      {
        inputs: [concreteInput('webm', [video('vp9'), audio('opus')])],
        output: { container: 'mp4', videoCodec: 'h264', audioCodec: 'aac' },
        options: { video: { codec: 'h264' }, audio: { codec: 'aac' } },
      },
    );
    exact(
      'transcode/vp8_to_h264_mp4',
      'scenarios/transcode/vp8_to_h264_mp4/01.webm',
      'REMOTION_VP8_TO_H264_QUALITY_BOUND',
      { inputs: [concreteInput('webm', [video('vp8'), audio('vorbis')])] },
    );
    exact(
      'transcode/vp8_to_h264_mp4',
      'scenarios/transcode/vp8_to_h264_mp4/02.webm',
      'REMOTION_VIDEO_TIMELINE_ALLOCATION_LIMIT',
      {
        inputs: [concreteInput('webm', [{ ...video('vp8'), fps: 1000 }, audio('vorbis')])],
      },
    );
    exact(
      'transcode/av1_to_h264_mp4',
      'scenarios/transcode/av1_to_h264_mp4/01.webm',
      'REMOTION_AV1_TO_H264_QUALITY_BOUND',
      {
        inputs: [concreteInput('webm', [video('av1'), audio('opus')])],
        output: { container: 'mp4', videoCodec: 'h264', audioCodec: 'aac' },
        options: { video: { codec: 'h264' }, audio: { codec: 'aac' } },
      },
    );
    exact(
      'transcode/aac_to_opus_webm',
      'scenarios/transcode/aac_to_opus_webm/02.aac',
      'REMOTION_WEBM_OPUS_TIMING_UNSUPPORTED',
      {
        inputs: [concreteInput('adts', [audio('aac')])],
        output: { container: 'webm', audioCodec: 'opus' },
        options: { audio: { codec: 'opus' }, invariant: 'transcode-audio-content' },
      },
    );
    exact(
      'transcode/mp3_to_aac_mp4',
      'scenarios/transcode/mp3_to_aac_mp4/01.mp3',
      'REMOTION_AAC_PRESENTATION_TIMING_UNSUPPORTED',
      {
        inputs: [concreteInput('mp3', [audio('mp3', 44_100)])],
        output: { container: 'mp4', audioCodec: 'aac' },
        options: { audio: { codec: 'aac' }, invariant: 'transcode-audio-content' },
      },
    );
    exact(
      'transcode/flac_to_opus_webm',
      'scenarios/transcode/flac_to_opus_webm/03.flac',
      'REMOTION_WEBM_OPUS_TIMING_UNSUPPORTED',
      {
        inputs: [concreteInput('flac', [audio('flac')])],
        output: { container: 'webm', audioCodec: 'opus' },
        options: { audio: { codec: 'opus' }, invariant: 'transcode-audio-content' },
      },
    );
    exact(
      'transcode/aac_to_pcm_wav_extract',
      'scenarios/transcode/aac_to_pcm_wav_extract/02.aac',
      'REMOTION_ADTS_TRANSCODE_PARSER_UNSUPPORTED',
      {
        inputs: [concreteInput('adts', [audio('aac')])],
        output: { container: 'wav', audioCodec: 'pcm-s16' },
        options: { audio: { codec: 'pcm-s16' }, invariant: 'transcode-audio-content' },
      },
    );
    exact(
      'transcode/h264_resize_720p',
      'scenarios/transcode/h264_resize_720p/02.mp4',
      'REMOTION_H264_720P_RESIZE_QUALITY_BOUND',
    );
    exact(
      'transcode/selfcheck_h264_resize_720p_tie',
      'scenarios/transcode/selfcheck_h264_resize_720p_tie/02.mp4',
      'REMOTION_SELFCHECK_RESIZE_QUALITY_BOUND',
    );
    exact(
      'transcode/h264_to_hevc_mp4',
      'scenarios/transcode/h264_to_hevc_mp4/02.mp4',
      'REMOTION_H264_TO_HEVC_QUALITY_BOUND',
      {
        output: { container: 'mp4', videoCodec: 'hevc' },
        options: { video: { codec: 'hevc' } },
      },
    );
    exact(
      'transcode/h264_to_hevc_mp4',
      'scenarios/transcode/h264_to_hevc_mp4/03.mp4',
      'REMOTION_H264_TO_HEVC_QUALITY_BOUND',
      {
        output: { container: 'mp4', videoCodec: 'hevc' },
        options: { video: { codec: 'hevc' } },
      },
    );
    exact(
      'transcode/metamorphic_duration_preserved_h264_to_vp9',
      'scenarios/transcode/metamorphic_duration_preserved_h264_to_vp9/03.mp4',
      'REMOTION_DURATION_TAIL_PRESERVATION_UNSUPPORTED',
      {
        inputs: [concreteInput('mp4', [video('h264'), audio('aac')])],
        output: { container: 'webm', videoCodec: 'vp9', audioCodec: 'opus' },
        options: { video: { codec: 'vp9' }, audio: { codec: 'opus' }, invariant: 'probe-duration' },
      },
    );
    exact(
      'transcode/roundtrip_leg1_h264_to_vp9',
      'scenarios/transcode/roundtrip_leg1_h264_to_vp9/02.mp4',
      'REMOTION_H264_VP9_ROUNDTRIP_SUITE_BUDGET',
    );
    exact(
      'transcode/av1_to_vp9_webm',
      'av1_720p_5s.webm',
      'REMOTION_AV1_TO_VP9_SUITE_BUDGET',
      {
        inputs: [concreteInput('webm', [video('av1'), audio('opus')])],
        output: { container: 'webm', videoCodec: 'vp9', audioCodec: 'opus' },
        options: { video: { codec: 'vp9' }, audio: { codec: 'opus' } },
      },
    );
    exact(
      'transcode/h264_resize_4k_to_1080p',
      'scenarios/transcode/h264_resize_4k_to_1080p/01.mp4',
      'REMOTION_4K_RESIZE_SUITE_BUDGET',
    );

    const neighboring = request('transcode', {
      inputs: [concreteInput('mp4', [video('h264'), audio('aac')])],
      output: { container: 'mp4', videoCodec: 'h264' },
      options: { video: { codec: 'h264' } },
    });
    neighboring.scenarioId = 'transcode/bframe_reorder_h264_to_h264';
    neighboring.inputs[0]!.id = 'scenarios/transcode/bframe_reorder_h264_to_h264/01.mp4';
    expect(decideRemotionWebcodecsSupport(neighboring)).toEqual({ supported: true });

    const normalVp8 = request('transcode', {
      inputs: [concreteInput('webm', [{ ...video('vp8'), fps: 30 }, audio('vorbis')])],
      output: { container: 'mp4', videoCodec: 'h264', audioCodec: 'aac' },
      options: { video: { codec: 'h264' }, audio: { codec: 'aac' } },
    });
    expect(decideRemotionWebcodecsSupport(normalVp8)).toEqual({ supported: true });

    const durationNeighbor = request('transcode', {
      inputs: [concreteInput('mp4', [video('h264'), audio('aac')], {
        id: 'scenarios/transcode/metamorphic_duration_preserved_h264_to_vp9/01.mp4',
      })],
      output: { container: 'webm', videoCodec: 'vp9', audioCodec: 'opus' },
      options: { video: { codec: 'vp9' }, audio: { codec: 'opus' }, invariant: 'probe-duration' },
    });
    durationNeighbor.scenarioId = 'transcode/metamorphic_duration_preserved_h264_to_vp9';
    expect(decideRemotionWebcodecsSupport(durationNeighbor)).toEqual({ supported: true });
  });

  test('renaming the same concrete bytes cannot change support and corrupted bytes are not laundered into NA', () => {
    const base = request('demux', {
      inputs: [concreteInput('webm', [video('vp9'), audio('opus')], {
        id: 'recorder-headerless.webm',
        mime: 'video/webm',
        mutated: true,
      })],
    });
    const renamed = structuredClone(base);
    renamed.inputs[0]!.id = 'unrelated-name.bin';
    renamed.inputs[0]!.mime = 'application/octet-stream';
    expect(decideRemotionParserSupport(base)).toEqual(decideRemotionParserSupport(renamed));
    expect(decideRemotionWebcodecsSupport(base)).toEqual(decideRemotionWebcodecsSupport(renamed));
    expect(decideRemotionParserSupport(base)).toEqual({ supported: true });
  });
});

describe('REQ-ENG-09: copy-only remux', () => {
  test('uses a chunked reader over digest-verified object-URL bytes and keeps HTTP on webReader', async () => {
    const engine = new RemotionWebcodecsEngine();
    installPrivateWebcodecsLib(engine);
    const bytes = new Uint8Array([1, 2, 3, 4]);
    let fullBodyReads = 0;
    const input = mediaInput({
      url: 'blob:http://127.0.0.1:5151/verified-fixture',
      blob: async () => { throw new Error('Blob path must not be used'); },
      arrayBuffer: async () => {
        fullBodyReads++;
        return bytes.buffer;
      },
    });
    const objectOptions = await (engine as any).sourceOptions(input);
    await (engine as any).sourceOptions(input);
    expect(objectOptions.src).toBe(input.url);
    expect(objectOptions.reader).toBeDefined();
    expect(fullBodyReads).toBe(1);

    const read = await objectOptions.reader.read({ range: [1, 2] });
    const first = await read.reader.reader.read();
    const done = await read.reader.reader.read();
    expect(Array.from(first.value ?? [])).toEqual([2, 3]);
    expect(done.done).toBe(true);
    expect(read).toMatchObject({
      contentLength: 4,
      contentType: 'video/mp4',
      name: 'fixture.mp4',
      supportsContentRange: true,
      needsContentRange: true,
    });
    expect(engine.configUsed).toMatchObject({
      readerMode: 'verified-buffer',
      sourceReader: 'verified-buffer',
    });

    const httpOptions = await (engine as any).sourceOptions(mediaInput());
    expect(httpOptions.src).toBe('https://fixtures.invalid/fixture.mp4');
    expect(httpOptions.reader).toBeDefined();
    expect(engine.configUsed).toMatchObject({ readerMode: 'webReader', sourceReader: 'webReader' });
  });

  test('compatible MP4/WebM and multi-audio tuples pass; cross-copy and WAV tuples are NA_ENGINE', () => {
    const compatible = [
      request('remux', {
        inputs: [concreteInput('mp4', [video('h264'), audio('aac')])],
        output: { container: 'mp4' },
      }),
      request('remux', {
        inputs: [concreteInput('webm', [video('vp9'), audio('opus')])],
        output: { container: 'webm' },
      }),
      request('remux', {
        inputs: [concreteInput('mp4', [video('h264'), audio('aac'), audio('aac', 44_100)])],
        output: { container: 'mp4' },
      }),
    ];
    for (const concrete of compatible) expect(decideRemotionWebcodecsSupport(concrete)).toEqual({ supported: true });

    expect(decideRemotionWebcodecsSupport(request('remux', {
      inputs: [concreteInput('mov', [])],
      output: { container: 'mp4' },
    }))).toEqual({ supported: true });

    expectNa(request('remux', {
      inputs: [concreteInput('mp4', [video('h264'), audio('aac')])],
      output: { container: 'webm' },
    }), 'REMOTION_REMUX_COPY_INCOMPATIBLE');
    expectNa(request('remux', {
      inputs: [concreteInput('wav', [audio('pcm-s16')])],
      output: { container: 'wav' },
    }), 'REMOTION_REMUX_COPY_INCOMPATIBLE');
    expectNa(request('remux', {
      inputs: [concreteInput('ts', [])],
      output: { container: 'mp4' },
    }), 'REMOTION_REMUX_COPY_INCOMPATIBLE');
    expectNa(request('remux', {
      inputs: [concreteInput('mp4', [video('h264')]), concreteInput('mp4', [audio('aac')])],
      output: { container: 'mp4' },
    }), 'REMOTION_REMUX_SINGLE_INPUT_ONLY');
  });

  test('runtime preflight asks copy eligibility for every track and records copy-only decisions', async () => {
    const tracks = [fakeVideoTrack(1), fakeAudioTrack(2), fakeAudioTrack(3)];
    const calls: number[] = [];
    const engine = new RemotionWebcodecsEngine();
    installPrivateWebcodecsLib(engine, {
      tracks,
      canCopyVideoTrack: ({ inputTrack }: { inputTrack: { trackId: number } }) => {
        calls.push(inputTrack.trackId);
        return true;
      },
      canCopyAudioTrack: ({ inputCodec }: { inputCodec: string }) => {
        const track = tracks.find((candidate) => candidate.codecEnum === inputCodec && !calls.includes(candidate.trackId));
        if (track) calls.push(track.trackId);
        return true;
      },
    });
    const operationRequest = request('remux', {
      inputs: [concreteInput('mp4', [video('h264'), audio('aac'), audio('aac')])],
      output: { container: 'mp4' },
    });
    const handlers = await (engine as any).copyOnlyTrackHandlers(
      mediaInput(),
      'mp4',
      context(operationRequest),
    );
    expect(handlers.onVideoTrack({ track: tracks[0], canCopyTrack: true })).toEqual({ type: 'copy' });
    expect(handlers.onAudioTrack({ track: tracks[1], canCopyTrack: true })).toEqual({ type: 'copy' });
    expect(handlers.onAudioTrack({ track: tracks[2], canCopyTrack: true })).toEqual({ type: 'copy' });
    expect(calls).toEqual([1, 2, 3]);
    expect(engine.configUsed.trackDecisions).toEqual([
      { trackId: 1, type: 'video', decision: 'copy' },
      { trackId: 2, type: 'audio', decision: 'copy' },
      { trackId: 3, type: 'audio', decision: 'copy' },
    ]);
    expect(engine.configUsed.cleanupComplete).toBe(true);
  });

  test('runtime copy rejection is typed NA before conversion can write', async () => {
    const engine = new RemotionWebcodecsEngine();
    installPrivateWebcodecsLib(engine, {
      tracks: [fakeAudioTrack(9)],
      canCopyAudioTrack: () => false,
    });
    let thrown: unknown;
    try {
      await (engine as any).copyOnlyTrackHandlers(
        mediaInput(),
        'wav',
        context(request('remux', {
          inputs: [concreteInput('wav', [audio('pcm-s16')])],
          output: { container: 'wav' },
        })),
      );
    } catch (error) {
      thrown = error;
    }
    expect(isNotApplicableError(thrown)).toBe(true);
    expect(thrown).toMatchObject({ reasonCode: 'REMOTION_REMUX_COPY_INCOMPATIBLE' });
    expect(engine.configUsed.trackDecisions).toEqual([
      { trackId: 9, type: 'audio', decision: 'reject', reasonCode: 'REMOTION_REMUX_COPY_INCOMPATIBLE' },
    ]);
    expect(engine.configUsed.outputBytes).toBe(0);
  });

  test('rejects an ISO copy when the pinned parser extracts an incomplete coded-sample table', async () => {
    const bytes = new Uint8Array(await Bun.file(
      'fixtures/media/scenarios/remux/h264_1080p_5s_mov_to_mp4/02.mov',
    ).arrayBuffer());
    const blob = new Blob([bytes], { type: 'video/quicktime' });
    const input = mediaInput({
      id: '02.mov',
      url: 'blob:http://127.0.0.1:5151/remotion-incomplete-aac',
      mime: 'video/quicktime',
      sizeBytes: bytes.byteLength,
      blob: async () => blob,
      arrayBuffer: async () => bytes.buffer,
    });
    const engine = new RemotionWebcodecsEngine();
    await engine.init();
    let thrown: unknown;
    try {
      await (engine as any).copyOnlyTrackHandlers(
        input,
        'mp4',
        context(request('remux', {
          inputs: [concreteInput('mov', [])],
          output: { container: 'mp4' },
        })),
      );
    } catch (error) {
      thrown = error;
    } finally {
      await engine.dispose();
    }
    expect(isNotApplicableError(thrown)).toBe(true);
    expect(thrown).toMatchObject({ reasonCode: 'REMOTION_REMUX_SAMPLE_EXTRACTION_INCOMPLETE' });
    expect((thrown as Error).message).toContain('1/1755 coded samples');
  });
});

describe('REQ-ENG-10: raw representation-aware packet evidence', () => {
  test('both children preserve raw fractional PTS/DTS/duration, payload, AVCC config, and NAL width', () => {
    const description = new Uint8Array([1, 100, 0, 40, 0xff, 0xaa]);
    const track = fakeVideoTrack(4, description);
    const data = new Uint8Array([0, 0, 0, 2, 0x65, 0x88]);
    const sample = {
      data,
      timestamp: 1_000.25,
      decodingTimestamp: 900.5,
      duration: 33_366.75,
      type: 'key',
    } as any;
    const parser = remotionParserSampleEvidence(sample, 7, track as any);
    const webcodecs = remotionWebcodecsSampleEvidence(sample, track as any);

    for (const packet of [parser, webcodecs]) {
      expect(packet).toMatchObject({
        size: 6,
        ptsUs: 1_000.25,
        dtsUs: 900.5,
        durationUs: 33_366.75,
        keyframe: true,
        trackType: 'video',
        codec: 'h264',
        framing: 'avc',
        nalLengthSize: 4,
      });
      expect(packet.payload).toEqual(data);
      expect(packet.decoderConfig).toEqual(description);
      expect(packet.payload).not.toBe(data);
      expect(packet.decoderConfig).not.toBe(description);
    }
  });

  test('Annex-B byte counts are untouched and absent DTS is never substituted with PTS', () => {
    const track = fakeVideoTrack(1, undefined);
    const bytes = new Uint8Array([0, 0, 0, 1, 9, 0xf0, 0]);
    const sample = { data: bytes, timestamp: 42.5, duration: 10.25, type: 'delta' } as any;
    const packet = remotionParserSampleEvidence(sample, 0, track as any);
    expect(packet.size).toBe(bytes.byteLength);
    expect(packet.payload).toEqual(bytes);
    expect(packet.framing).toBe('annexb');
    expect(packet.ptsUs).toBe(42.5);
    expect('dtsUs' in packet).toBe(false);
  });

  test('duplicate AAC timestamps remain duplicate raw observations instead of being reconstructed', () => {
    const track = fakeAudioTrack(2);
    const first = remotionParserSampleEvidence({
      data: new Uint8Array([0xff, 0xf1, 1]),
      timestamp: 0,
      duration: 21_333.333,
      type: 'key',
    } as any, 0, track as any);
    const second = remotionParserSampleEvidence({
      data: new Uint8Array([0xff, 0xf1, 2]),
      timestamp: 0,
      duration: 21_333.333,
      type: 'key',
    } as any, 0, track as any);
    expect([first.ptsUs, second.ptsUs]).toEqual([0, 0]);
    expect(first.framing).toBe('adts');
    expect('dtsUs' in first).toBe(false);
  });
});

describe('probe container-evidence normalization', () => {
  test('Matroska defaults, ISO language, and fragmented timing remain byte-derived', async () => {
    const webmBytes = new Uint8Array(
      await Bun.file('fixtures/media/recorder_headerless.webm').arrayBuffer(),
    );
    const webm = webmHeaderMetadataFromPrefix(webmBytes.subarray(0, 64 * 1024), 'webm');
    expect(webm?.tracks[0]).toMatchObject({
      type: 'video',
      language: 'eng',
      defaultDisposition: true,
    });

    const languageBytes = new Uint8Array(
      await Bun.file('fixtures/media/scenarios/probe/h264_vfr/01.mp4').arrayBuffer(),
    );
    expect([...isoTrackHeaderEvidence(languageBytes)]).toMatchObject([
      [1, { language: 'eng', defaultDisposition: true }],
      [2, { language: 'eng', defaultDisposition: true }],
    ]);

    const alternateBytes = new Uint8Array(
      await Bun.file('fixtures/media/h264_multitrack.mp4').arrayBuffer(),
    );
    expect([...isoTrackHeaderEvidence(alternateBytes)].map(([, track]) => track.defaultDisposition))
      .toEqual([true, true, false]);

    const fragmentedBytes = new Uint8Array(
      await Bun.file('fixtures/media/fragmented_cmaf.mp4').arrayBuffer(),
    );
    expect([...collectFragmentTrackStats(fragmentedBytes)]).toEqual([
      [1, { sampleCount: 120, maxEnd: 61_768 }],
      [2, { sampleCount: 189, maxEnd: 193_024 }],
    ]);
  });

  test('probe tracks use coded raster, clockwise rotation, and exact PCM bitrate', () => {
    expect(normalizeRemotionParserTrack({
      type: 'video',
      trackId: 1,
      originalTimescale: 1_000,
      codec: 'vp09.00.10.08',
      codecEnum: 'vp9',
      width: 427,
      height: 240,
      codedWidth: 426,
      codedHeight: 240,
      rotation: 270,
      fps: 25,
    } as any, null, null)).toMatchObject({
      type: 'video',
      codec: 'vp9',
      width: 426,
      height: 240,
      rotation: 270,
    });

    expect(normalizeRemotionParserTrack({
      type: 'audio',
      trackId: 2,
      originalTimescale: 48_000,
      codec: 'pcm-s16',
      codecEnum: 'pcm-s16',
      sampleRate: 48_000,
      numberOfChannels: 2,
    } as any, null, null)).toMatchObject({
      type: 'audio',
      codec: 'pcm-s16',
      bitrate: 1_536_000,
    });

    expect(normalizeRemotionParserTrack({
      type: 'audio',
      trackId: 3,
      originalTimescale: 24_000,
      codec: 'mp4a.40.02',
      codecEnum: 'aac',
      sampleRate: 24_000,
      numberOfChannels: 1,
      description: new Uint8Array([0x13, 0x08, 0x56, 0xe5, 0x98]),
    } as any, null, null)).toMatchObject({
      type: 'audio',
      codec: 'aac',
      sampleRate: 48_000,
      codedSampleRate: 24_000,
      presentationSampleRate: 48_000,
      sbrPresent: true,
    });

    const implicitStereo = normalizeRemotionParserTrack({
      type: 'audio',
      trackId: 4,
      originalTimescale: 24_000,
      codec: 'mp4a.40.05',
      codecEnum: 'aac',
      sampleRate: 24_000,
      numberOfChannels: 2,
      description: new Uint8Array([0x13, 0x08, 0x56, 0xe5, 0x98]),
    } as any, null, null);
    expect(implicitStereo).toMatchObject({
      type: 'audio',
      codec: 'aac',
      channels: 2,
      codedChannels: 1,
      sbrPresent: true,
      psPresent: false,
    });
    expect(implicitStereo).not.toHaveProperty('presentationChannels');
  });
});

describe('demux packet-time normalization', () => {
  test('derives WAV PCM timestamps from byte-complete frames independent of callback chunking', () => {
    const packets = [
      { trackIndex: 0, size: 24_576, ptsUs: 0, durationUs: 2_000_000, keyframe: true },
      { trackIndex: 0, size: 12_288, ptsUs: 9_000_000, durationUs: 2_000_000, keyframe: true },
    ];
    const metadata = normalizePcmPacketTimes({
      container: 'wav',
      durationSec: 11,
      tracks: [audio('pcm-s24', 48_000, 2)],
    }, packets, 'wav');
    expect(metadata.durationSec).toBeCloseTo(0.128, 9);
    expect(packets.map((packet) => packet.ptsUs)).toEqual([0, 85_333.33333333333]);
    expect(packets.map((packet) => packet.durationUs)).toEqual([85_333.33333333333, 42_666.666666666664]);
  });
});

describe('REQ-ENG-08/11: exact browser config and output options', () => {
  test('exact decoder config is cloned, probed, and returned unchanged instead of using browser normalization', async () => {
    let observed: VideoDecoderConfig | undefined;
    installVideoDecoderProbe(async (config) => {
      observed = config;
      return { supported: true, config: { codec: 'browser-normalized-away-from-request' } };
    });
    const description = new Uint8Array([1, 2, 3, 4]);
    const exact: VideoDecoderConfig = {
      codec: 'avc1.640028',
      codedWidth: 1920,
      codedHeight: 1080,
      description,
      colorSpace: { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false },
    };
    const supported = await probeExactRemotionVideoDecoderConfig(exact, 3, 'decodeFrames', request('decodeFrames'));
    expect(observed).toEqual(exact);
    expect(observed).not.toBe(exact);
    expect(supported).toEqual(exact);
    expect(supported.codec).toBe('avc1.640028');
    description[0] = 99;
    expect(new Uint8Array(supported.description as ArrayBufferView)[0]).toBe(1);
  });

  test('browser absence/rejection is typed NA_BROWSER while malformed config TypeError stays ERROR', async () => {
    installVideoDecoderProbe(async (config) => ({ supported: false, config }));
    let unsupported: unknown;
    try {
      await probeExactRemotionVideoDecoderConfig({ codec: 'avc1.640028' }, 0, 'seek', request('seek'));
    } catch (error) {
      unsupported = error;
    }
    expect(isBrowserNotSupportedError(unsupported)).toBe(true);
    expect(unsupported).toMatchObject({
      reasonCode: 'REMOTION_VIDEO_DECODER_CONFIG_UNSUPPORTED',
      operation: 'seek',
      browserConfig: { role: 'video-decoder', trackIndex: 0 },
    });

    const malformed = new TypeError('invalid codec grammar');
    installVideoDecoderProbe(async () => { throw malformed; });
    let thrown: unknown;
    try {
      await probeExactRemotionVideoDecoderConfig({ codec: '?' }, 0, 'decodeFrames', request('decodeFrames'));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBe(malformed);
    expect(isBrowserNotSupportedError(thrown)).toBe(false);

    Reflect.deleteProperty(globalThis, 'VideoDecoder');
    await expect(
      probeExactRemotionVideoDecoderConfig({ codec: 'avc1.640028' }, 0, 'decodeFrames', request('decodeFrames')),
    ).rejects.toMatchObject({
      reasonCode: 'REMOTION_VIDEO_DECODER_API_UNAVAILABLE',
    });
  });

  test('PCM mapping cannot silently narrow 24-bit or float requests to PCM-16', () => {
    expect(canonicalToRemotionAudio('pcm-s16')).toBe('wav');
    expect(canonicalToRemotionAudio('pcm-s24')).toBeNull();
    expect(canonicalToRemotionAudio('pcm-f32')).toBeNull();
  });

  test('exact resize boxes preserve requested dimensions while aspect changes and absent tracks are NA_ENGINE', () => {
    const downscale = buildResize({ width: 640, height: 360 });
    const upscale = buildResize({ width: 3840, height: 2160 });
    expect(downscale).toEqual({ mode: 'width', width: 640 });
    expect(upscale).toEqual({ mode: 'width', width: 3840 });
    expect(remotionOutputDimensions(1920, 1080, downscale, 0, true)).toEqual({ width: 640, height: 360 });
    expect(remotionOutputDimensions(1920, 1080, upscale, 0, true)).toEqual({ width: 3840, height: 2160 });

    expect(decideRemotionWebcodecsSupport(request('transcode', {
      inputs: [concreteInput('mp4', [video('h264', 1920, 1080)])],
      output: { container: 'mp4', videoCodec: 'h264', width: 640, height: 360 },
      options: { video: { codec: 'h264', width: 640, height: 360 } },
    }))).toEqual({ supported: true });
    expectNa(request('transcode', {
      inputs: [concreteInput('mp4', [video('h264', 1920, 1080)])],
      output: { container: 'mp4', videoCodec: 'h264', width: 640, height: 640 },
      options: { video: { codec: 'h264', width: 640, height: 640 } },
    }), 'REMOTION_RESIZE_BOX_NOT_EXACT');
    expectNa(request('transcode', {
      inputs: [concreteInput('mp3', [audio('mp3')])],
      output: { container: 'mp4', videoCodec: 'h264' },
      options: { video: { codec: 'h264' } },
    }), 'REMOTION_VIDEO_TRACK_REQUIRED');
    expectNa(request('transcode', {
      inputs: [concreteInput('mp4', [video('h264')])],
      output: { container: 'mp4', audioCodec: 'aac' },
      options: { audio: { codec: 'aac' } },
    }), 'REMOTION_AUDIO_TRACK_REQUIRED');
  });

  test('multi-rendition requests execute every rung and retain each exact output', async () => {
    const engine = new RemotionWebcodecsEngine();
    const widths: number[] = [];
    (engine as any).transcodeSingle = async (
      _input: MediaInput,
      opts: { video?: { width?: number } },
    ) => {
      const width = opts.video?.width ?? 0;
      widths.push(width);
      return {
        bytes: new Uint8Array([width / 10]),
        mime: 'video/mp4',
        container: 'mp4',
      };
    };
    const output = await (engine as any).transcodeImpl(
      mediaInput(),
      { container: 'mp4', variants: [{ width: 640 }, { width: 320 }] },
      context(request('transcode', {
        output: { container: 'mp4', videoCodec: 'h264' },
        options: { variants: [{ width: 640 }, { width: 320 }] },
      })),
    );
    expect(widths).toEqual([640, 320]);
    expect(output.bytes).toEqual(new Uint8Array([64]));
    expect(output.variants.map((variant: { bytes: Uint8Array }) => variant.bytes)).toEqual([
      new Uint8Array([64]),
      new Uint8Array([32]),
    ]);
  });

  test('empty-audio graceful transcode rejects before Remotion can emit non-finite progress', async () => {
    const engine = new RemotionWebcodecsEngine();
    const operationRequest = request('transcode', {
      inputs: [concreteInput('wav', [audio('pcm-s16')])],
      output: { container: 'wav', audioCodec: 'pcm-s16' },
      options: {
        container: 'wav',
        audio: { codec: 'pcm-s16' },
        gracefulAllowOutput: true,
      },
    });
    operationRequest.scenarioId = 'audio-dsp/edge_empty_audio_transcode';
    const operationContext = context(operationRequest);
    await engine.init(operationContext);
    let conversionCalls = 0;
    installPrivateWebcodecsLib(engine, {
      convertMedia: async () => {
        conversionCalls++;
        throw new Error('conversion must not start for the empty-audio contract');
      },
    });
    try {
      await expect(engine.transcode(
        mediaInput({ id: 'empty_audio.wav', mime: 'audio/wav' }),
        { container: 'wav', audio: { codec: 'pcm-s16' } },
        operationContext,
      )).rejects.toMatchObject({
        reasonCode: 'REMOTION_TRANSCODE_EMPTY_AUDIO_REJECTED',
        stage: 'parse',
        inputId: 'empty_audio.wav',
      });
    } finally {
      await engine.dispose(operationContext);
    }
    expect(conversionCalls).toBe(0);
  });

  test('audio bitrate is forwarded and exact decoder/encoder configs are recorded', async () => {
    const observedEncoderConfigs: AudioEncoderConfig[] = [];
    installAudioConfigProbes(observedEncoderConfigs);
    let frameworkBitrate = 0;
    const engine = new RemotionWebcodecsEngine();
    installPrivateWebcodecsLib(engine, {
      canReencodeAudioTrack: (options) => {
        frameworkBitrate = options.bitrate;
        return true;
      },
    });
    const handlers = (engine as any).reencodeTrackHandlers(
      'mp4',
      undefined,
      'aac',
      undefined,
      undefined,
      { container: 'mp4', audio: { codec: 'aac', bitrate: 96_000 } },
      context(request('transcode', {
        inputs: [concreteInput('mp4', [audio('aac')])],
        output: { container: 'mp4', audioCodec: 'aac' },
        options: { audio: { codec: 'aac', bitrate: 96_000 } },
      })),
    );
    const track = { ...fakeAudioTrack(5), codec: 'mp4a.40.2' };
    expect(await handlers.onAudioTrack({ track, canCopyTrack: false, defaultAudioCodec: 'aac' })).toEqual({
      type: 'reencode',
      audioCodec: 'aac',
      bitrate: 96_000,
      sampleRate: null,
    });
    expect(frameworkBitrate).toBe(96_000);
    expect(observedEncoderConfigs[0]).toMatchObject({
      codec: 'mp4a.40.02',
      bitrate: 96_000,
      sampleRate: 48_000,
      numberOfChannels: 2,
    });
    expect(engine.configUsed.codecConfigs).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'audio-decoder', trackId: 5, supported: true }),
      expect.objectContaining({ role: 'audio-encoder', trackId: 5, supported: true }),
    ]));
  });

  test('primary-track decode creates one decoder, surfaces flush cause, and closes it', async () => {
    const tracks = [fakeVideoTrack(11), { ...fakeVideoTrack(22), codec: 'vp09.00.10.08', codecEnum: 'vp9' }];
    const flushFailure = new Error('injected decoder flush failure');
    let decoderTrack: VideoDecoderConfig | undefined;
    let created = 0;
    let closed = 0;
    installVideoDecoderProbe(
      async (config) => ({ supported: true, config }),
      {
        onConstruct: () => { created++; },
        onConfigure: (config) => { decoderTrack = config; },
        flush: async () => { throw flushFailure; },
        onClose: () => { closed++; },
      },
    );
    const engine = new RemotionWebcodecsEngine();
    installPrivateWebcodecsLib(engine, {
      tracks,
      invokeTrackCallbacks: true,
    });
    let thrown: unknown;
    try {
      await (engine as any).decodeFramesImpl(
        mediaInput(),
        { maxFrames: 1 },
        context(request('decodeFrames', { inputs: [concreteInput('mp4', [video('h264'), video('vp9')])] })),
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBe(flushFailure);
    expect(created).toBe(1);
    expect(decoderTrack?.codec).toBe('avc1.640028');
    expect(closed).toBe(1);
    expect(engine.configUsed.selectedTrackIds).toEqual([11]);
    expect(engine.configUsed.activeDecoders).toBe(0);
    expect(engine.configUsed.activeFrames).toBe(0);
    expect(engine.configUsed.cleanupComplete).toBe(true);
  });
});

describe('REQ-ENG-12: lifecycle, worker isolation, cleanup, telemetry, conformance', () => {
  test('mutated Blob parsing runs only through the worker or fails ordinarily without main-thread retry', async () => {
    const operationRequest = request('demux', {
      inputs: [concreteInput('webm', [video('vp9')], { mutated: true })],
    });
    const engine = new RemotionMediaParserEngine();
    (engine as any).parsePath = 'worker';
    (engine as any).workerParse = async () => ({ marker: 'worker-result' });
    const result = await (engine as any).runParse(
      { src: new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])]) },
      'full-parse(demux)',
      context(operationRequest),
    );
    expect(result).toEqual({ marker: 'worker-result' });
    expect(engine.configUsed).toMatchObject({
      parsePath: 'worker',
      readerMode: 'blob',
      worker: true,
      workerCount: 1,
      activeControllers: 0,
      cleanupComplete: true,
    });

    (engine as any).parsePath = 'main-thread';
    (engine as any).workerParse = null;
    let thrown: unknown;
    try {
      await (engine as any).runParse(
        { src: new Blob([new Uint8Array([0])]) },
        'full-parse(demux)',
        context(operationRequest),
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe('REMOTION_MUTATED_WORKER_ISOLATION_UNAVAILABLE');
    expect(isNotApplicableError(thrown)).toBe(false);
    expect(engine.configUsed.activeControllers).toBe(0);
    expect(engine.configUsed.cleanupComplete).toBe(true);
  });

  test('parse cancellation aborts the retained media-parser controller and settles promptly', async () => {
    const abort = new AbortController();
    const reason = new DOMException('parse cancelled', 'AbortError');
    let workerReady!: () => void;
    const ready = new Promise<void>((resolve) => { workerReady = resolve; });
    const engine = new RemotionMediaParserEngine();
    (engine as any).parsePath = 'worker';
    (engine as any).workerParse = async (options: any) => new Promise((_resolve, reject) => {
      workerReady();
      options.controller._internals.signal.addEventListener('abort', () => {
        reject(options.controller._internals.signal.reason);
      }, { once: true });
    });
    const running = (engine as any).runParse(
      { src: new Blob([new Uint8Array([1])]) },
      'full-parse(demux)',
      context(request('demux', {
        inputs: [concreteInput('webm', [video('vp9')], { mutated: true })],
      }), abort.signal),
    );
    await ready;
    abort.abort(reason);
    await expect(Promise.race([
      running,
      new Promise((_, reject) => setTimeout(() => reject(new Error('parse abort did not settle')), 250)),
    ])).rejects.toBe(reason);
    expect(engine.configUsed).toMatchObject({ activeControllers: 0, cleanupComplete: true });
  });

  for (const operation of ['decodeFrames', 'seek'] as const) {
    test(`${operation} cancellation closes the isolated decoder and settles promptly`, async () => {
      const abort = new AbortController();
      const reason = new DOMException(`${operation} cancelled`, 'AbortError');
      let flushReady!: () => void;
      const ready = new Promise<void>((resolve) => { flushReady = resolve; });
      let rejectFlush!: (reason: unknown) => void;
      installVideoDecoderProbe(
        async (config) => ({ supported: true, config }),
        {
          flush: async () => new Promise<void>((_resolve, reject) => {
            rejectFlush = reject;
            flushReady();
          }),
          onClose: () => rejectFlush?.(reason),
        },
      );
      const engine = new RemotionWebcodecsEngine();
      installPrivateWebcodecsLib(engine, {
        tracks: [fakeVideoTrack(1)],
        invokeTrackCallbacks: true,
      });
      const operationContext = context(request(operation), abort.signal);
      const running = operation === 'decodeFrames'
        ? (engine as any).decodeFramesImpl(mediaInput(), { maxFrames: 1 }, operationContext)
        : (engine as any).seekImpl(mediaInput(), 500_000, operationContext);
      await ready;
      abort.abort(reason);
      await expect(Promise.race([
        running,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`${operation} abort did not settle`)), 250)),
      ])).rejects.toBe(reason);
      expect(engine.configUsed).toMatchObject({
        activeControllers: 0,
        activeDecoders: 0,
        activeFrames: 0,
        cleanupComplete: true,
      });
    });
  }

  test('forced save failure still removes the writer buffer and exposes complete cleanup telemetry', async () => {
    const saveFailure = new Error('injected save failure');
    let removed = 0;
    const engine = new RemotionWebcodecsEngine();
    installPrivateWebcodecsLib(engine, {
      convertMedia: async () => ({
        finalState: finalConvertState(),
        save: async () => { throw saveFailure; },
        remove: async () => { removed++; },
      }),
    });
    let thrown: unknown;
    try {
      await (engine as any).convert(
        mediaInput(),
        { container: 'mp4' },
        context(request('transcode', { output: { container: 'mp4' } })),
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBe(saveFailure);
    expect(removed).toBe(1);
    expect(engine.configUsed).toMatchObject({
      outputBytes: 0,
      activeControllers: 0,
      activeWriterBuffers: 0,
      cleanupComplete: true,
    });
  });

  test('returns direct writer bytes without a save-time Blob copy', async () => {
    let saveCalls = 0;
    const engine = new RemotionWebcodecsEngine();
    installPrivateWebcodecsLib(engine, {
      convertMedia: async (options) => {
        const output = await options.writer.createContent({
          filename: 'output.mp4',
          mimeType: 'video/mp4',
          logLevel: 'error',
        });
        await output.write(new Uint8Array([0, 2, 3]));
        await output.updateDataAt(0, new Uint8Array([1]));
        await output.finish();
        return {
          finalState: finalConvertState(3),
          save: async () => {
            saveCalls++;
            throw new Error('save() must not be called for a captured direct buffer');
          },
          remove: () => output.remove(),
        };
      },
    });
    const result = await (engine as any).convert(
      mediaInput({ sizeBytes: 256 * 1024 * 1024 }),
      { container: 'mp4' },
      context(request('transcode', { output: { container: 'mp4' } })),
    );
    expect(result.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(saveCalls).toBe(0);
    expect(engine.configUsed).toMatchObject({
      writerMode: 'directArrayBufferWriter',
      outputBytes: 3,
      cleanupComplete: true,
    });
  });

  test('forced remove failure is surfaced after all owned resources are released', async () => {
    const removeFailure = new Error('injected remove failure');
    const engine = new RemotionWebcodecsEngine();
    installPrivateWebcodecsLib(engine, {
      convertMedia: async () => ({
        finalState: finalConvertState(1),
        save: async () => new Blob([new Uint8Array([1])]),
        remove: async () => { throw removeFailure; },
      }),
    });
    await expect((engine as any).convert(
      mediaInput(),
      { container: 'mp4' },
      context(request('transcode', { output: { container: 'mp4' } })),
    )).rejects.toBe(removeFailure);
    expect(engine.configUsed).toMatchObject({
      outputBytes: 1,
      activeControllers: 0,
      activeWriterBuffers: 0,
      cleanupComplete: false,
    });
  });

  test('abort reaches an active conversion controller and settles promptly with no retained buffer', async () => {
    const abort = new AbortController();
    const abortReason = new DOMException('cancelled by test', 'AbortError');
    let controllerReady!: () => void;
    const ready = new Promise<void>((resolve) => { controllerReady = resolve; });
    let rejectConvert!: (reason: unknown) => void;
    const engine = new RemotionWebcodecsEngine();
    installPrivateWebcodecsLib(engine, {
      controller: {
        abort: (reason?: unknown) => rejectConvert?.(reason),
      },
      convertMedia: async () => {
        controllerReady();
        return new Promise((_resolve, reject) => { rejectConvert = reject; });
      },
    });
    const running = (engine as any).convert(
      mediaInput(),
      { container: 'mp4' },
      context(request('transcode', { output: { container: 'mp4' } }), abort.signal),
    );
    await ready;
    abort.abort(abortReason);
    await expect(Promise.race([
      running,
      new Promise((_, reject) => setTimeout(() => reject(new Error('abort did not settle')), 250)),
    ])).rejects.toBe(abortReason);
    expect(engine.configUsed).toMatchObject({
      activeControllers: 0,
      activeWriterBuffers: 0,
      cleanupComplete: true,
    });
  });

  test('success records actual output facts and removes the writer buffer', async () => {
    const events: unknown[] = [];
    let removed = 0;
    const engine = new RemotionWebcodecsEngine();
    installPrivateWebcodecsLib(engine, {
      convertMedia: async (options) => {
        options.onProgress?.({ overallProgress: 0.75, decodedVideoFrames: 2, encodedVideoFrames: 1 });
        options.onProgress?.({ overallProgress: 1.04, decodedVideoFrames: 3, encodedVideoFrames: 3 });
        return {
          finalState: finalConvertState(3),
          save: async () => new Blob([new Uint8Array([1, 2, 3])]),
          remove: async () => { removed++; },
        };
      },
    });
    const operationRequest = request('transcode', { output: { container: 'mp4' } });
    const result = await (engine as any).convert(
      mediaInput(),
      { container: 'mp4' },
      { ...context(operationRequest), emit: (event: unknown) => events.push(event) },
    );
    expect(result).toMatchObject({
      container: 'mp4',
      targetWrites: 1,
      telemetry: { progress: 1, bytesWritten: 3, writeCount: 1 },
    });
    expect(result.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(removed).toBe(1);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'first-byte' }),
      expect.objectContaining({ type: 'bytes-written', bytes: 3 }),
      expect.objectContaining({ type: 'write-count', count: 1 }),
      expect.objectContaining({ type: 'progress', determinate: true, value: 1 }),
    ]));
    expect(engine.configUsed).toMatchObject({
      parsePath: 'main-thread',
      sourceReader: 'webReader',
      outputBytes: 3,
      activeControllers: 0,
      activeWriterBuffers: 0,
      cleanupComplete: true,
    });
  });

  test('composite config is a factual immutable profile and all declared ops carry conformance proofs', async () => {
    const engine = new RemotionEngine();
    expect(engine.benchmarkLimits).toEqual({
      maxInnerIterations: 1,
      memoryWindow: {
        sampleImmediatelyDuringOperation: true,
        maxOperationSamples: 1,
        settleWindowMs: 0,
        sampleTimeoutMs: 5_000,
      },
    });
    const snapshot = engine.configUsed;
    expect(snapshot).toMatchObject({
      framework: 'remotion',
      backend: 'none',
      workerCount: 0,
      operationBackend: 'none',
      mediaParser: { parsePath: 'main-thread', readerMode: 'not-selected' },
      webcodecs: { parsePath: 'not-selected', sourceReader: 'not-selected' },
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.mediaParser)).toBe(true);
    expect(() => { (snapshot as any).backend = 'fiction'; }).toThrow();

    const evidence: AdapterConformanceEvidence = {
      operations: Object.fromEntries(
        ['probe', 'demux', 'decodeFrames', 'seek', 'remux', 'transcode'].map((operation) => [
          operation,
          ['positive', 'negative-tuple', 'lifecycle', 'normalized-result', 'cancellation'] as const,
        ]),
      ),
    };
    expect(() => validateAdapterConformanceSurface(engine, evidence)).not.toThrow();
    const [first, second] = await validateAdapterFactory(() => new RemotionEngine(), evidence);
    expect(first).not.toBe(second);
    expect(first.id).toBe(second.id);
    expect(first.capabilities()).toEqual(second.capabilities());
    expect(first.configUsed).toEqual(second.configUsed);
  });
});

function installVideoDecoderProbe(
  probe: (config: VideoDecoderConfig) => Promise<{ supported: boolean; config: VideoDecoderConfig }>,
  hooks: {
    onConstruct?: () => void;
    onConfigure?: (config: VideoDecoderConfig) => void;
    flush?: () => Promise<void>;
    onClose?: () => void;
  } = {},
): void {
  class VideoDecoderMock {
    static isConfigSupported = probe;
    state: CodecState = 'unconfigured';
    decodeQueueSize = 0;

    constructor(_init: VideoDecoderInit) {
      hooks.onConstruct?.();
    }

    configure(config: VideoDecoderConfig): void {
      hooks.onConfigure?.(config);
      this.state = 'configured';
    }

    decode(_chunk: EncodedVideoChunk): void {}

    async flush(): Promise<void> {
      await hooks.flush?.();
    }

    close(): void {
      if (this.state === 'closed') return;
      this.state = 'closed';
      hooks.onClose?.();
    }

    addEventListener(): void {}
    removeEventListener(): void {}
  }
  Object.defineProperty(globalThis, 'VideoDecoder', {
    configurable: true,
    writable: true,
    value: VideoDecoderMock,
  });
  Object.defineProperty(globalThis, 'EncodedVideoChunk', {
    configurable: true,
    writable: true,
    value: class EncodedVideoChunkMock {
      constructor(_init: EncodedVideoChunkInit) {}
    },
  });
}

function installAudioConfigProbes(observedEncoderConfigs: AudioEncoderConfig[]): void {
  class AudioDecoderMock {
    static async isConfigSupported(config: AudioDecoderConfig): Promise<AudioDecoderSupport> {
      return { supported: true, config };
    }
  }
  class AudioEncoderMock {
    static async isConfigSupported(config: AudioEncoderConfig): Promise<AudioEncoderSupport> {
      observedEncoderConfigs.push(structuredClone(config));
      return { supported: true, config };
    }
  }
  Object.defineProperty(globalThis, 'AudioDecoder', {
    configurable: true,
    writable: true,
    value: AudioDecoderMock,
  });
  Object.defineProperty(globalThis, 'AudioEncoder', {
    configurable: true,
    writable: true,
    value: AudioEncoderMock,
  });
  Object.defineProperty(globalThis, 'EncodedAudioChunk', {
    configurable: true,
    writable: true,
    value: class EncodedAudioChunkMock {},
  });
}

function fakeVideoTrack(trackId: number, description?: Uint8Array): any {
  return {
    type: 'video',
    trackId,
    codecEnum: 'h264',
    codec: 'avc1.640028',
    codedWidth: 1920,
    codedHeight: 1080,
    width: 1920,
    height: 1080,
    fps: 30,
    colorSpace: {},
    description,
  };
}

function fakeAudioTrack(trackId: number): any {
  return {
    type: 'audio',
    trackId,
    codecEnum: 'aac',
    codec: 'aac',
    sampleRate: 48_000,
    numberOfChannels: 2,
    description: undefined,
  };
}

function installPrivateWebcodecsLib(
  engine: RemotionWebcodecsEngine,
  overrides: {
    tracks?: any[];
    canCopyVideoTrack?: (options: any) => boolean;
    canCopyAudioTrack?: (options: any) => boolean;
    canReencodeAudioTrack?: (options: any) => boolean | Promise<boolean>;
    canReencodeVideoTrack?: (options: any) => boolean | Promise<boolean>;
    createVideoDecoder?: (options: any) => Promise<any>;
    invokeTrackCallbacks?: boolean;
    convertMedia?: (options: any) => Promise<any>;
    controller?: { abort(reason?: unknown): void };
  } = {},
): void {
  const tracks = overrides.tracks ?? [];
  const controller = overrides.controller ?? { abort: () => undefined };
  const parseController = { abort: () => undefined, seek: () => undefined };
  const parseMedia = async (options: any): Promise<any> => {
    if (overrides.invokeTrackCallbacks && options.onVideoTrack) {
      for (const track of tracks.filter((candidate) => candidate.type === 'video')) {
        await options.onVideoTrack({ track });
      }
    }
    if (overrides.invokeTrackCallbacks && options.onAudioTrack) {
      for (const track of tracks.filter((candidate) => candidate.type === 'audio')) {
        await options.onAudioTrack({ track });
      }
    }
    return {
      container: 'mp4',
      durationInSeconds: 1,
      fps: 30,
      tracks,
      metadata: [],
    };
  };
  (engine as any).lib = {
    wc: {
      webcodecsController: () => controller,
      canCopyVideoTrack: overrides.canCopyVideoTrack ?? (() => true),
      canCopyAudioTrack: overrides.canCopyAudioTrack ?? (() => true),
      canReencodeAudioTrack: overrides.canReencodeAudioTrack ?? (() => true),
      canReencodeVideoTrack: overrides.canReencodeVideoTrack ?? (() => true),
      createVideoDecoder: overrides.createVideoDecoder ?? (async () => ({
        decode: async () => undefined,
        flush: async () => undefined,
        close: () => undefined,
        waitForQueueToBeLessThan: async () => undefined,
      })),
      convertMedia: overrides.convertMedia ?? (async () => ({
        finalState: finalConvertState(),
        save: async () => new Blob(),
        remove: async () => undefined,
      })),
    },
    bufferWriter: {},
    mp: {
      mediaParserController: () => parseController,
      parseMedia,
    },
    webReader: () => undefined,
  };
}

function finalConvertState(bytesWritten = 0): Record<string, number> {
  return {
    decodedVideoFrames: 0,
    decodedAudioFrames: 0,
    encodedVideoFrames: 0,
    encodedAudioFrames: 0,
    bytesWritten,
    millisecondsWritten: 1_000,
    expectedOutputDurationInMs: 1_000,
    overallProgress: 1,
  };
}

describe('performance evidence boundaries', () => {
  test('former suppressions and exact metadata misses are pre-content NA_ENGINE', () => {
    const packet = request('demux');
    packet.scenarioId = 'performance/size-ladder-iterate-packets-huge';
    expect(decideRemotionParserSupport(packet)).toMatchObject({
      supported: false,
      reasonCode: 'REMOTION_PERFORMANCE_PACKET_SUITE_BUDGET',
      preContent: true,
    });

    const huge = request('probe', {
      inputs: [concreteInput('mov', [], {
        id: 'scenarios/performance/size-ladder-extract-metadata-huge/01.mov',
        sourceEvidence: 'UNRESOLVED',
      })],
    });
    huge.scenarioId = 'performance/size-ladder-extract-metadata-huge';
    expect(decideRemotionParserSupport(huge)).toMatchObject({
      supported: false,
      reasonCode: 'REMOTION_HUGE_MOV_CHANNEL_INVENTORY_UNSUPPORTED',
      preContent: true,
    });

    const massive = request('probe', {
      inputs: [concreteInput('mp4', [], {
        id: 'scenarios/performance/size-ladder-extract-metadata-massive/01.mp4',
        sourceEvidence: 'UNRESOLVED',
      })],
    });
    massive.scenarioId = 'performance/size-ladder-extract-metadata-massive';
    expect(decideRemotionParserSupport(massive)).toMatchObject({
      supported: false,
      reasonCode: 'REMOTION_MASSIVE_METADATA_BLOB_BOUND',
      preContent: true,
    });
    massive.inputs[0]!.id = 'scenarios/performance/size-ladder-extract-metadata-massive/03.mp4';
    expect(decideRemotionParserSupport(massive)).toMatchObject({
      supported: false,
      reasonCode: 'REMOTION_MASSIVE_METADATA_INVENTORY_UNSUPPORTED',
      preContent: true,
    });
  });
});
