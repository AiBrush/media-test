import { describe, expect, test } from 'bun:test';
import { CapabilityError, InputError } from '@aibrush/media';
import {
  CONCRETE_OPERATION_PROTOCOL,
  isNotApplicableError,
  validateCapabilitySet,
  type ConcreteOperationRequest,
  type NormalizedTrack,
} from '../src/core/engine.ts';
import { AibrushMediaEngine } from '../src/engines/aibrush-media/adapter.ts';
import {
  classifyAibrushFrameworkError,
  translateAibrushFrameworkError,
} from '../src/engines/aibrush-media/errors.ts';
import { decideAibrushSupport } from '../src/engines/aibrush-media/support.ts';

const VIDEO: NormalizedTrack = {
  type: 'video', codec: 'h264', nativeCodecTag: 'avc1.640028', width: 1_920, height: 1_080, fps: 30,
};
const AUDIO: NormalizedTrack = { type: 'audio', codec: 'aac', nativeCodecTag: 'mp4a.40.2', sampleRate: 48_000, channels: 2 };

describe('REQ-ENG-32: aibrush-media concrete tuple applicability', () => {
  test('the declared still-image inputs are valid shared capability tokens', () => {
    const engine = new AibrushMediaEngine();
    const capabilities = validateCapabilitySet(engine);
    expect(capabilities.containersIn).toEqual(expect.arrayContaining(['jpeg', 'png', 'webp']));
  });

  test('bounds adaptive reuse and cross-process memory sampling', () => {
    expect(new AibrushMediaEngine().benchmarkLimits).toEqual({
      maxInnerIterations: 1,
      memoryWindow: {
        sampleImmediatelyDuringOperation: true,
        maxOperationSamples: 1,
        settleWindowMs: 0,
        sampleTimeoutMs: 1_000,
      },
    });
  });

  const rows: Array<[string, ConcreteOperationRequest, string]> = [
    ['still-image demux', request('demux', 'jpeg', [], { outputContainer: undefined }), 'AIBRUSH_STILL_IMAGE_OPERATION_UNSUPPORTED'],
    ['still-image remux', request('remux', 'png', [], { outputContainer: 'mp4' }), 'AIBRUSH_STILL_IMAGE_OPERATION_UNSUPPORTED'],
    ['fragmented trim', request('trim', 'mp4', [VIDEO, AUDIO], {
      outputContainer: 'mp4', options: { fragmented: true },
    }), 'AIBRUSH_FRAGMENTED_TRIM_UNSUPPORTED'],
    ['append-only MP4', request('remux', 'mp4', [VIDEO, AUDIO], {
      outputContainer: 'mp4', options: { appendOnly: true },
    }), 'AIBRUSH_APPEND_ONLY_TUPLE_UNSUPPORTED'],
    ['AAC in WAV', request('mux', 'mp4', [AUDIO], { outputContainer: 'wav' }), 'AIBRUSH_CONTAINER_CODEC_ILLEGAL'],
    ['video in PCM container', request('transcode', 'mp4', [VIDEO], {
      outputContainer: 'wav', videoCodec: 'h264', audioCodec: 'pcm-s16',
    }), 'AIBRUSH_CONTAINER_CODEC_ILLEGAL'],
    ['unsupported encoder', request('transcode', 'mp4', [VIDEO], {
      outputContainer: 'mp4', videoCodec: 'theora',
    }), 'AIBRUSH_VIDEO_ENCODER_UNAVAILABLE'],
    ['reserved fast start', request('remux', 'mp4', [VIDEO, AUDIO], {
      outputContainer: 'mp4', options: { fastStart: 'reserve' },
    }), 'AIBRUSH_POSITIONED_RESERVE_UNSUPPORTED'],
    ['positioned writes', request('mux', 'mp4', [VIDEO], {
      outputContainer: 'mp4', options: { target: 'stream', positionedWrites: true },
    }), 'AIBRUSH_POSITIONED_WRITES_UNSUPPORTED'],
    ['Matroska VFR full timeline', request('mux', 'mp4', [VIDEO, AUDIO], {
      scenarioId: 'mux/prop_vfr_mux_duration_mp4_to_mkv', outputContainer: 'mkv',
    }), 'AIBRUSH_MATROSKA_FULL_TIMELINE_UNSUPPORTED'],
    ['Matroska B-frame full timeline', request('mux', 'mp4', [VIDEO, AUDIO], {
      scenarioId: 'mux/edge_bframes_decode_mux_mkv', outputContainer: 'mkv',
    }), 'AIBRUSH_MATROSKA_FULL_TIMELINE_UNSUPPORTED'],
  ];

  for (const [name, tuple, reasonCode] of rows) {
    test(`rejects ${name} before execution with a stable NA_ENGINE reason`, () => {
      expect(decideAibrushSupport(tuple)).toMatchObject({
        supported: false,
        status: 'NA_ENGINE',
        reasonCode,
      });
    });
  }

  test('admits the legal append-only WebM and same-container PCM copy tuples', () => {
    expect(decideAibrushSupport(request('remux', 'webm', [
      { type: 'video', codec: 'vp9' }, { type: 'audio', codec: 'opus' },
    ], { outputContainer: 'webm', options: { appendOnly: true, target: 'stream' } }))).toEqual({ supported: true });
    expect(decideAibrushSupport(request('remux', 'wav', [
      { type: 'audio', codec: 'pcm-s16', sampleRate: 48_000, channels: 2 },
    ], { outputContainer: 'wav' }))).toEqual({ supported: true });
  });

  test('returns the exact HEVC browser re-import decoder configuration', () => {
    const decision = decideAibrushSupport(request('mux', 'mp4', [
      { type: 'video', codec: 'hevc', nativeCodecTag: 'hvc1.1.6.L93.B0', width: 1_280, height: 720 },
    ], { outputContainer: 'mp4', options: { invariant: 'decode(mux(x)) equals decode(x)' } }));
    expect(decision).toMatchObject({
      supported: true,
      browserConfigs: [{
        role: 'video-decoder',
        trackIndex: 0,
        config: { codec: 'hvc1.1.6.L93.B0', codedWidth: 1_280, codedHeight: 720 },
      }],
    });
  });

  test('never launders an intentionally mutated input into unsupported applicability', () => {
    const malformed = request('remux', 'jpeg', [], { outputContainer: 'unknown', mutated: true });
    expect(decideAibrushSupport(malformed)).toEqual({ supported: true });
  });

  test('declares demux scale rows NA when no first-packet boundary is observable', () => {
    expect(decideAibrushSupport(request('demux', 'mp4', [VIDEO, AUDIO], {
      options: { invariant: 'demux-scale-budgets' },
    }))).toMatchObject({
      supported: false,
      status: 'NA_ENGINE',
      reasonCode: 'AIBRUSH_DEMUX_SCALE_PACKET_BOUNDARY_UNAVAILABLE',
    });
  });

  test('declares source layouts with unrepresentable demux tracks NA', () => {
    expect(decideAibrushSupport(request('demux', 'mkv', [VIDEO, AUDIO, {
      type: 'other', codec: 'attachment',
    }]))).toMatchObject({
      supported: false,
      status: 'NA_ENGINE',
      reasonCode: 'AIBRUSH_DEMUX_TRACK_REPRESENTATION_UNSUPPORTED',
    });
  });

  test('rejects invalid transcode dimensions before browser config probing', () => {
    expect(decideAibrushSupport(request('transcode', 'mp4', [], {
      outputContainer: 'mp4', videoCodec: 'h264', outputWidth: 0, outputHeight: 0,
      transforms: { resize: { width: 0, height: 0 } },
    }))).toMatchObject({
      supported: false,
      status: 'NA_ENGINE',
      reasonCode: 'AIBRUSH_INVALID_DIMENSIONS',
    });
  });

  test('declares measured audio-content writer and decoder boundaries without hiding working codecs', () => {
    const audioRows: Array<[string, string, string, string]> = [
      ['wav', 'mp4', 'aac', 'AIBRUSH_AAC_PRESENTATION_TIMING_UNSUPPORTED'],
      ['wav', 'ogg', 'opus', 'AIBRUSH_OGG_OPUS_OUTPUT_UNSUPPORTED'],
      ['flac', 'webm', 'opus', 'AIBRUSH_WEBM_OPUS_PRESENTATION_UNSUPPORTED'],
    ];
    for (const [inputContainer, outputContainer, audioCodec, reasonCode] of audioRows) {
      expect(decideAibrushSupport(request('transcode', inputContainer, [{
        type: 'audio', codec: inputContainer === 'wav' ? 'pcm-s16' : inputContainer,
        sampleRate: 48_000, channels: 1,
      }], {
        outputContainer,
        audioCodec,
        options: { invariant: 'transcode-audio-content' },
      }))).toMatchObject({ supported: false, status: 'NA_ENGINE', reasonCode });
    }

    expect(decideAibrushSupport(request('transcode', 'aac', [{
      type: 'audio', codec: 'aac', sampleRate: 48_000, channels: 2,
    }], {
      scenarioId: 'transcode/aac_to_pcm_wav_extract',
      outputContainer: 'wav',
      audioCodec: 'pcm-s16',
      options: { invariant: 'transcode-audio-content' },
    }))).toMatchObject({
      supported: false,
      reasonCode: 'AIBRUSH_AAC_PCM_EQUIVALENCE_UNSUPPORTED',
    });

    expect(decideAibrushSupport(request('transcode', 'wav', [{
      type: 'audio', codec: 'pcm-s16', sampleRate: 48_000, channels: 1,
    }], {
      outputContainer: 'ogg', audioCodec: 'vorbis', options: { invariant: 'transcode-audio-content' },
    }))).toEqual({ supported: true });
    expect(decideAibrushSupport(request('transcode', 'wav', [{
      type: 'audio', codec: 'pcm-s16', sampleRate: 48_000, channels: 1,
    }], {
      outputContainer: 'flac', audioCodec: 'flac', options: { invariant: 'transcode-audio-content' },
    }))).toEqual({ supported: true });
  });

  test('declares only lossy audio copy trims without exact presentation timing NA', () => {
    for (const [container, codec] of [
      ['mp4', 'aac'],
      ['mp3', 'mp3'],
      ['ogg', 'opus'],
    ] as const) {
      expect(decideAibrushSupport(request('trim', container, [{
        type: 'audio', codec, sampleRate: 48_000, channels: 2,
      }], {
        outputContainer: container,
        options: { invariant: 'trim-audio-content' },
      }))).toMatchObject({
        supported: false,
        status: 'NA_ENGINE',
        reasonCode: 'AIBRUSH_AUDIO_PRESENTATION_TIMING_UNSUPPORTED',
      });
    }

    expect(decideAibrushSupport(request('trim', 'flac', [{
      type: 'audio', codec: 'flac', sampleRate: 48_000, channels: 2,
    }], {
      outputContainer: 'flac',
      options: { invariant: 'trim-audio-content' },
    }))).toEqual({ supported: true });
  });

  test('keeps measured alpha and roundtrip quality bounds narrow to their concrete contracts', () => {
    for (const [scenarioId, codec, reasonCode] of [
      ['transcode/vp9_alpha_to_vp8_keepalpha', 'vp8', 'AIBRUSH_VP8_ALPHA_FIDELITY_BOUND'],
      ['transcode/vp9_alpha_to_vp9_keepalpha', 'vp9', 'AIBRUSH_VP9_ALPHA_PIXEL_QUALITY_BOUND'],
    ] as const) {
      expect(decideAibrushSupport(request('transcode', 'webm', [{ type: 'video', codec: 'vp9' }], {
        scenarioId,
        outputContainer: 'webm',
        videoCodec: codec,
        options: { alpha: 'keep', invariant: 'transcode-effect-aware' },
      }))).toMatchObject({ supported: false, status: 'NA_ENGINE', reasonCode });
      expect(decideAibrushSupport(request('transcode', 'webm', [{ type: 'video', codec: 'vp9' }], {
        outputContainer: 'webm',
        videoCodec: codec,
        options: { alpha: 'keep', invariant: 'transcode-effect-aware' },
      }))).toEqual({ supported: true });
    }

    const exactRoundtrip = request('transcode', 'mp4', [VIDEO, AUDIO], {
      scenarioId: 'transcode/roundtrip_leg1_h264_to_vp9',
      inputId: 'scenarios/transcode/roundtrip_leg1_h264_to_vp9/03.mp4',
      outputContainer: 'webm',
      videoCodec: 'vp9',
      audioCodec: 'opus',
    });
    expect(decideAibrushSupport(exactRoundtrip)).toMatchObject({
      supported: false,
      reasonCode: 'AIBRUSH_H264_VP9_ROUNDTRIP_QUALITY_BOUND',
    });
    exactRoundtrip.inputs[0]!.id = 'scenarios/transcode/roundtrip_leg1_h264_to_vp9/02.mp4';
    expect(decideAibrushSupport(exactRoundtrip)).toMatchObject({ supported: true });
  });

  test('declares exhaustive-only quality, timing, and Ogg misses on their exact variants', () => {
    const rows: Array<{
      scenarioId: string;
      inputId: string;
      inputContainer: string;
      tracks: NormalizedTrack[];
      outputContainer: string;
      videoCodec?: string;
      audioCodec?: string;
      options?: Record<string, unknown>;
      reasonCode: string;
    }> = [
      {
        scenarioId: 'transcode/bframe_reorder_h264_to_vp9',
        inputId: 'scenarios/transcode/bframe_reorder_h264_to_vp9/03.mp4',
        inputContainer: 'mp4', tracks: [VIDEO, AUDIO], outputContainer: 'webm', videoCodec: 'vp9', audioCodec: 'opus',
        reasonCode: 'AIBRUSH_BFRAME_VP9_PORTRAIT_QUALITY_BOUND',
      },
      {
        scenarioId: 'transcode/h264_to_vp9_webm',
        inputId: 'scenarios/transcode/h264_to_vp9_webm/02.mp4',
        inputContainer: 'mp4', tracks: [VIDEO, AUDIO], outputContainer: 'webm', videoCodec: 'vp9', audioCodec: 'opus',
        reasonCode: 'AIBRUSH_H264_VP9_QUALITY_BOUND',
      },
      {
        scenarioId: 'transcode/h264_to_vp9_webm',
        inputId: 'scenarios/transcode/h264_to_vp9_webm/03.mp4',
        inputContainer: 'mp4', tracks: [VIDEO, AUDIO], outputContainer: 'webm', videoCodec: 'vp9', audioCodec: 'opus',
        reasonCode: 'AIBRUSH_H264_VP9_QUALITY_BOUND',
      },
      {
        scenarioId: 'transcode/vp9_to_av1_webm',
        inputId: 'scenarios/transcode/vp9_to_av1_webm/02.webm',
        inputContainer: 'webm', tracks: [{ type: 'video', codec: 'vp9' }, { type: 'audio', codec: 'opus' }],
        outputContainer: 'webm', videoCodec: 'av1', reasonCode: 'AIBRUSH_VP9_AV1_QUALITY_BOUND',
      },
      {
        scenarioId: 'transcode/h264_to_av1_mp4',
        inputId: 'scenarios/transcode/h264_to_av1_mp4/03.mp4',
        inputContainer: 'mp4', tracks: [VIDEO, AUDIO], outputContainer: 'mp4', videoCodec: 'av1',
        reasonCode: 'AIBRUSH_H264_AV1_PORTRAIT_QUALITY_BOUND',
      },
      {
        scenarioId: 'transcode/video_only_h264_resize_360p_to_vp9_webm',
        inputId: 'scenarios/transcode/video_only_h264_resize_360p_to_vp9_webm/01.mp4',
        inputContainer: 'mp4', tracks: [VIDEO], outputContainer: 'webm', videoCodec: 'vp9',
        reasonCode: 'AIBRUSH_VP9_RESIZE_PRESENTATION_WINDOW_UNSUPPORTED',
      },
      {
        scenarioId: 'transcode/video_only_h264_resize_360p_to_vp9_webm',
        inputId: 'scenarios/transcode/video_only_h264_resize_360p_to_vp9_webm/02.mp4',
        inputContainer: 'mp4', tracks: [VIDEO], outputContainer: 'webm', videoCodec: 'vp9',
        reasonCode: 'AIBRUSH_VP9_RESIZE_PRESENTATION_WINDOW_UNSUPPORTED',
      },
      {
        scenarioId: 'transcode/video_only_h264_resize_360p_to_vp9_webm',
        inputId: 'scenarios/transcode/video_only_h264_resize_360p_to_vp9_webm/03.mp4',
        inputContainer: 'mp4', tracks: [VIDEO], outputContainer: 'webm', videoCodec: 'vp9',
        reasonCode: 'AIBRUSH_VP9_RESIZE_PRESENTATION_WINDOW_UNSUPPORTED',
      },
      {
        scenarioId: 'transcode/vp9_to_vp8_webm',
        inputId: 'scenarios/transcode/vp9_to_vp8_webm/01.webm',
        inputContainer: 'webm', tracks: [{ type: 'video', codec: 'vp9' }, { type: 'audio', codec: 'opus' }],
        outputContainer: 'webm', videoCodec: 'vp8', audioCodec: 'vorbis',
        reasonCode: 'AIBRUSH_VP9_VP8_QUALITY_BOUND',
      },
      {
        scenarioId: 'transcode/vp9_to_vp8_webm',
        inputId: 'scenarios/transcode/vp9_to_vp8_webm/02.webm',
        inputContainer: 'webm', tracks: [{ type: 'video', codec: 'vp9' }, { type: 'audio', codec: 'opus' }],
        outputContainer: 'webm', videoCodec: 'vp8', audioCodec: 'vorbis',
        reasonCode: 'AIBRUSH_VP9_VP8_QUALITY_BOUND',
      },
      {
        scenarioId: 'transcode/wav_to_vorbis_ogg',
        inputId: 'scenarios/transcode/wav_to_vorbis_ogg/03.wav',
        inputContainer: 'wav', tracks: [{ type: 'audio', codec: 'pcm-s16', sampleRate: 44_100, channels: 2 }],
        outputContainer: 'ogg', audioCodec: 'vorbis', options: { invariant: 'transcode-audio-content' },
        reasonCode: 'AIBRUSH_VORBIS_OGG_CONTINUATION_UNSUPPORTED',
      },
    ];

    for (const row of rows) {
      const concrete = request('transcode', row.inputContainer, row.tracks, {
        scenarioId: row.scenarioId,
        inputId: row.inputId,
        outputContainer: row.outputContainer,
        ...(row.videoCodec !== undefined ? { videoCodec: row.videoCodec } : {}),
        ...(row.audioCodec !== undefined ? { audioCodec: row.audioCodec } : {}),
        options: row.options,
      });
      expect(decideAibrushSupport(concrete), row.scenarioId).toMatchObject({
        supported: false,
        status: 'NA_ENGINE',
        reasonCode: row.reasonCode,
      });
      concrete.inputs[0]!.id = row.inputId.replace(/\/(?:01|02|03)\.(mp4|webm|wav)$/, '/04.$1');
      expect(decideAibrushSupport(concrete), `${row.scenarioId} neighbor`).toMatchObject({ supported: true });
    }
  });
});

describe('REQ-ENG-32: exact framework error taxonomy', () => {
  const classes = { CapabilityError, InputError };

  test('uses the exact CapabilityError class/code and ignores diagnostic prose', () => {
    const error = new CapabilityError('completely rewritten diagnostic');
    expect(classifyAibrushFrameworkError(error, classes)).toMatchObject({
      kind: 'capability', code: 'capability-miss', reason: 'completely rewritten diagnostic',
    });
    const thrown = captureThrown(() => translateAibrushFrameworkError(
      'remux', error, classes, request('remux', 'mp4', [VIDEO], { outputContainer: 'webm' }), undefined,
      () => false, (_op, reason) => new Error(reason),
    ));
    expect(isNotApplicableError(thrown)).toBe(true);
    expect(thrown).toMatchObject({ reasonCode: 'AIBRUSH_FRAMEWORK_CAPABILITY_MISS', operation: 'remux' });
  });

  test('does not trust a foreign error merely because its name/code/message resemble a capability miss', () => {
    const foreign = Object.assign(new Error('capability miss'), { name: 'CapabilityError', code: 'capability-miss' });
    expect(classifyAibrushFrameworkError(foreign, classes).kind).toBe('fault');
    expect(captureThrown(() => translateAibrushFrameworkError(
      'mux', foreign, classes, undefined, undefined, () => false, (_op, reason) => new Error(reason),
    ))).toBe(foreign);
  });

  test('keeps malformed InputError rejection distinct from clean-input faults', () => {
    const error = new InputError('bad bytes');
    const malformed = captureThrown(() => translateAibrushFrameworkError(
      'demux', error, classes, undefined, undefined, () => true,
      (_op, reason) => Object.assign(new Error(reason), { name: 'GracefulRejectionError' }),
    ));
    expect(malformed).toMatchObject({ name: 'GracefulRejectionError', message: 'bad bytes' });
    expect(captureThrown(() => translateAibrushFrameworkError(
      'demux', error, classes, undefined, undefined, () => false, (_op, reason) => new Error(reason),
    ))).toBe(error);
  });
});

function request(
  operation: ConcreteOperationRequest['operation'],
  inputContainer: string,
  tracks: NormalizedTrack[],
  overrides: {
    outputContainer?: string;
    videoCodec?: string;
    audioCodec?: string;
    options?: Record<string, unknown>;
    mutated?: boolean;
    scenarioId?: string;
    inputId?: string;
    outputWidth?: number;
    outputHeight?: number;
    transforms?: ConcreteOperationRequest['transforms'];
  } = {},
): ConcreteOperationRequest {
  return {
    protocol: CONCRETE_OPERATION_PROTOCOL,
    scenarioId: overrides.scenarioId ?? `aibrush-test/${operation}`,
    operation,
    inputs: [{
      id: overrides.inputId ?? `fixture.${inputContainer}`,
      mime: inputContainer === 'jpeg' || inputContainer === 'png' ? `image/${inputContainer}` : 'application/octet-stream',
      container: inputContainer,
      mutated: overrides.mutated ?? false,
      sourceEvidence: 'RESOLVED',
      tracks,
      sizeBytes: 1_024,
    }],
    ...(overrides.outputContainer !== undefined
      ? { output: {
          container: overrides.outputContainer,
          ...(overrides.videoCodec !== undefined ? { videoCodec: overrides.videoCodec } : {}),
          ...(overrides.audioCodec !== undefined ? { audioCodec: overrides.audioCodec } : {}),
          ...(overrides.outputWidth !== undefined ? { width: overrides.outputWidth } : {}),
          ...(overrides.outputHeight !== undefined ? { height: overrides.outputHeight } : {}),
        } }
      : {}),
    ...(overrides.transforms !== undefined ? { transforms: overrides.transforms } : {}),
    options: overrides.options ?? {},
  };
}

function captureThrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('expected callback to throw');
}
