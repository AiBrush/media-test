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
  } = {},
): ConcreteOperationRequest {
  return {
    protocol: CONCRETE_OPERATION_PROTOCOL,
    scenarioId: `aibrush-test/${operation}`,
    operation,
    inputs: [{
      id: `fixture.${inputContainer}`,
      mime: inputContainer === 'jpeg' || inputContainer === 'png' ? `image/${inputContainer}` : 'application/octet-stream',
      container: inputContainer,
      mutated: overrides.mutated ?? false,
      tracks,
      sizeBytes: 1_024,
    }],
    ...(overrides.outputContainer !== undefined
      ? { output: {
          container: overrides.outputContainer,
          ...(overrides.videoCodec !== undefined ? { videoCodec: overrides.videoCodec } : {}),
          ...(overrides.audioCodec !== undefined ? { audioCodec: overrides.audioCodec } : {}),
        } }
      : {}),
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
