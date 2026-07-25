import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import * as mediabunny from 'mediabunny';

import {
  CONCRETE_OPERATION_PROTOCOL,
  SUPPORTED_CHECKED_SUPPORT_SNAPSHOT,
  isMalformedInputError,
  validateOperationTelemetry,
  type ConcreteOperationRequest,
  type MediaInput,
  type OperationContext,
  type OperationTelemetry,
  type TranscodeVideoOptions,
} from '../src/core/engine.ts';
import {
  MediabunnyEngine,
  isMediabunnyMalformedParseFailure,
  materializeTightRgbaVideoSample,
  mediabunnyAbrIntermediates,
  needsTightAvcFrameMaterialization,
  runConversion,
  type MediabunnyMediaBytes,
} from '../src/engines/mediabunny/adapter.ts';
import {
  MEDIABUNNY_REASON,
  browserConfigsForRequest,
  decideMediabunnySupport,
  videoEncodePlanForRequest,
} from '../src/engines/mediabunny/support.ts';
import {
  TRANSCODE_ABR_RENDITION_SET_ROLE,
  transcodeAbrSwitchRole,
} from '../src/features/transcode/abr.ts';
import { TRANSCODE_ABR_CONTRACT } from '../src/features/transcode/contracts.ts';

function request(options: Record<string, unknown>): ConcreteOperationRequest {
  return {
    protocol: CONCRETE_OPERATION_PROTOCOL,
    scenarioId: 'transcode/mediabunny-repair-test',
    operation: 'transcode',
    inputs: [{
      id: 'source.mp4',
      mime: 'video/mp4',
      container: 'mp4',
      mutated: false,
      sourceEvidence: 'RESOLVED',
      tracks: [{ type: 'video', codec: 'h264', width: 320, height: 240, fps: 30 }],
    }],
    output: { container: 'mp4', videoCodec: 'h264' },
    options,
  };
}

function context(
  operationRequest: ConcreteOperationRequest,
  events: OperationTelemetry[] = [],
  operationStartMs = performance.now(),
): OperationContext {
  return {
    signal: new AbortController().signal,
    emit: (event) => events.push(event),
    phase: 'functional',
    request: operationRequest,
    checkedSupport: SUPPORTED_CHECKED_SUPPORT_SNAPSHOT,
    operationStartMs,
  };
}

function memoryInput(id: string, bytes: Uint8Array, mime = 'video/mp4'): MediaInput {
  return {
    id,
    url: `blob:mediabunny-transcode-repair/${id}`,
    mime,
    sizeBytes: bytes.byteLength,
    blob: async () => new Blob([bytes.slice()], { type: mime }),
    arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer,
  };
}

function negativeRequest(
  operation: 'demux' | 'decodeFrames',
  id: string,
  container: string,
  mime: string,
): ConcreteOperationRequest {
  return {
    protocol: CONCRETE_OPERATION_PROTOCOL,
    scenarioId: `robustness/${id}`,
    operation,
    inputs: [{
      id,
      mime,
      container,
      mutated: false,
      sourceEvidence: 'RESOLVED',
      tracks: [{ type: 'video', codec: 'h264', width: 320, height: 240, fps: 30 }],
    }],
    options: {
      ...(operation === 'decodeFrames' ? { maxFrames: 60 } : {}),
      gracefulAllowOutput: true,
      robustness: {
        schema: 'media-test/robustness-contract@1',
        inputClass: 'negative',
        returnedOutputCheck: operation === 'demux' ? 'packet-structure' : 'frame-coverage',
        survivorOracles: ['graceful-failure'],
        timeoutMs: 60_000,
      },
    },
  };
}

describe('Mediabunny transcode boundary repairs', () => {
  test('quarter-turn encode plans use post-rotation dimensions', () => {
    const rotate = request({ container: 'mp4', video: { codec: 'h264', rotate: 90 } });
    rotate.inputs[0]!.tracks[0] = {
      ...rotate.inputs[0]!.tracks[0]!,
      width: 1920,
      height: 1080,
    };
    expect(videoEncodePlanForRequest(rotate)).toMatchObject({ width: 1080, height: 1920 });

    rotate.options = { container: 'mp4', video: { codec: 'h264', rotate: 270, width: 720 } };
    rotate.output = { container: 'mp4', videoCodec: 'h264', width: 720 };
    expect(videoEncodePlanForRequest(rotate)).toMatchObject({ width: 720, height: 1280 });
  });

  test('default AV1 plan carries the verified high-motion quality budget', () => {
    const operationRequest = request({ container: 'mp4', video: { codec: 'av1' } });
    operationRequest.inputs[0]!.tracks[0] = {
      ...operationRequest.inputs[0]!.tracks[0]!,
      width: 1080,
      height: 1920,
      fps: 60,
    };
    operationRequest.output = { container: 'mp4', videoCodec: 'av1' };
    expect(videoEncodePlanForRequest(operationRequest)).toMatchObject({
      codec: 'av1',
      width: 1080,
      height: 1920,
      bitrate: 37_324_800,
    });
  });

  test('default AVC and VP9 plans carry strict perceptual-gate quality budgets', () => {
    const avcRequest = request({ container: 'mp4', video: { codec: 'h264', width: 1280, height: 720 } });
    expect(videoEncodePlanForRequest(avcRequest)).toMatchObject({
      codec: 'avc', width: 1280, height: 720, bitrate: 13_824_000,
    });

    const vp9Request = request({ container: 'webm', video: { codec: 'vp9' } });
    vp9Request.inputs[0]!.tracks[0] = {
      ...vp9Request.inputs[0]!.tracks[0]!, width: 1080, height: 1920, fps: 60,
    };
    vp9Request.output = { container: 'webm', videoCodec: 'vp9' };
    expect(videoEncodePlanForRequest(vp9Request)).toMatchObject({
      codec: 'vp9', width: 1080, height: 1920, bitrate: 24_883_200,
    });
  });

  test('exact lossy-audio presentation contracts negotiate intrinsic NA_ENGINE', () => {
    const operationRequest = request({
      container: 'mp4',
      audio: { codec: 'aac', bitrate: 192_000 },
      invariant: 'transcode-audio-content',
    });
    operationRequest.inputs[0]!.tracks = [{
      type: 'audio', codec: 'pcm-s16', sampleRate: 48_000, channels: 2,
    }];
    operationRequest.output = { container: 'mp4', audioCodec: 'aac' };
    expect(decideMediabunnySupport(operationRequest)).toMatchObject({
      supported: false,
      status: 'NA_ENGINE',
      reasonCode: MEDIABUNNY_REASON.AUDIO_PRESENTATION_TIMING,
    });
  });

  test('baked geometry rows requiring a strict per-pixel bound negotiate intrinsic NA_ENGINE', () => {
    const operationRequest = request({
      container: 'mp4',
      video: { codec: 'h264', rotate: 90 },
      invariant: 'transcode-effect-aware',
    });
    operationRequest.transforms = { rotate: 90 };
    expect(decideMediabunnySupport(operationRequest)).toMatchObject({
      supported: false,
      status: 'NA_ENGINE',
      reasonCode: MEDIABUNNY_REASON.TRANSFORM_PIXEL_FIDELITY,
    });

    const padRequest = request({
      container: 'mp4',
      video: { codec: 'h264' },
      pad: { width: 1920, height: 1080 },
      invariant: 'transcode-effect-aware',
    });
    expect(decideMediabunnySupport(padRequest)).toMatchObject({
      supported: false,
      status: 'NA_ENGINE',
      reasonCode: MEDIABUNNY_REASON.TRANSFORM_PIXEL_FIDELITY,
    });
  });

  test('high-frame-rate bitrate-controlled fanout negotiates intrinsic NA_ENGINE', () => {
    const operationRequest = request({
      container: 'mp4',
      video: { codec: 'h264' },
      variants: [{ codec: 'h264', width: 1920, height: 1080, bitrate: 5_000_000 }],
    });
    operationRequest.inputs[0]!.tracks[0] = {
      ...operationRequest.inputs[0]!.tracks[0]!, width: 1080, height: 1920, fps: 60,
    };
    expect(decideMediabunnySupport(operationRequest)).toMatchObject({
      supported: false,
      status: 'NA_ENGINE',
      reasonCode: MEDIABUNNY_REASON.ABR_BITRATE_CONTROL,
    });
  });

  test('full-buffer transcodes reject only concrete plans that require a 4 GiB backing allocation', () => {
    const operationRequest = request({
      container: 'mp4',
      video: { codec: 'h264', width: 1280, height: 720 },
      audio: { codec: 'aac' },
    });
    operationRequest.output = {
      container: 'mp4',
      videoCodec: 'h264',
      audioCodec: 'aac',
      width: 1280,
      height: 720,
    };
    operationRequest.inputs[0] = {
      ...operationRequest.inputs[0]!,
      id: 'long-vp9.webm',
      mime: 'video/webm',
      container: 'webm',
      sizeBytes: 115_712_029,
      tracks: [
        { type: 'video', codec: 'vp9', width: 640, height: 480, fps: 25, bitrate: 545_405 },
        { type: 'audio', codec: 'opus', sampleRate: 48_000, channels: 2, bitrate: 545_405 },
      ],
    };
    expect(decideMediabunnySupport(operationRequest)).toMatchObject({
      supported: false,
      status: 'NA_ENGINE',
      reasonCode: MEDIABUNNY_REASON.OUTPUT_BUFFER_LIMIT,
      reason: expect.stringContaining('4 GiB backing allocation'),
    });

    operationRequest.inputs[0] = {
      ...operationRequest.inputs[0]!,
      id: 'near-boundary-vp9.webm',
      sizeBytes: 113_982_390,
      tracks: operationRequest.inputs[0]!.tracks.map((track) => ({ ...track, bitrate: 1_494_243 })),
    };
    expect(decideMediabunnySupport(operationRequest)).toMatchObject({ supported: true });
  });

  test('VP9 alpha re-encode with exact visible geometry negotiates intrinsic NA_ENGINE', () => {
    const operationRequest = request({
      container: 'webm',
      video: { codec: 'vp9', width: 320, height: 240 },
      alpha: 'keep',
      invariant: 'transcode-effect-aware',
    });
    operationRequest.output = { container: 'webm', videoCodec: 'vp9', width: 320, height: 240 };
    expect(decideMediabunnySupport(operationRequest)).toMatchObject({
      supported: false,
      status: 'NA_ENGINE',
      reasonCode: MEDIABUNNY_REASON.ALPHA_OUTPUT_GEOMETRY,
    });
  });

  test('non-four-aligned AVC frames are materialized into a tight RGBA layout', async () => {
    expect(needsTightAvcFrameMaterialization('avc', 854)).toBe(true);
    expect(needsTightAvcFrameMaterialization('avc', 856)).toBe(false);
    expect(needsTightAvcFrameMaterialization('vp9', 854)).toBe(false);

    const padded = new Uint8Array([
      1, 2, 3, 4, 5, 6, 7, 8, 99, 99, 99, 99,
      9, 10, 11, 12, 13, 14, 15, 16, 99, 99, 99, 99,
    ]);
    const source = new mediabunny.VideoSample(padded, {
      format: 'RGBA',
      codedWidth: 2,
      codedHeight: 2,
      timestamp: 1.25,
      duration: 0.5,
      layout: [{ offset: 0, stride: 12 }],
    });
    const tight = await materializeTightRgbaVideoSample(mediabunny, source);
    try {
      const copied = new Uint8Array(16);
      await tight.copyTo(copied, { format: 'RGBA' });
      expect([...copied]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
      expect(tight).toMatchObject({
        format: 'RGBA',
        codedWidth: 2,
        codedHeight: 2,
        timestamp: 1.25,
        duration: 0.5,
      });
    } finally {
      source.close();
      tight.close();
    }
  });

  test('conversion progress uses the operation origin and returns the exact terminal value', async () => {
    const events: OperationTelemetry[] = [];
    const operationRequest = request({ container: 'mp4', video: { codec: 'h264' } });
    const conversion: {
      isValid: boolean;
      discardedTracks: never[];
      onProgress?: (progress: number) => void;
      execute(): Promise<void>;
      cancel(): Promise<void>;
    } = {
      isValid: true,
      discardedTracks: [],
      async execute() {
        this.onProgress?.(0.25);
        this.onProgress?.(1);
      },
      async cancel() {},
    };
    const media = await runConversion(
      { Conversion: { init: async () => conversion } } as never,
      { output: { target: {} } } as never,
      'mp4',
      {
        target: {} as never,
        markFinalizeStart() {},
        async mediaBytes(): Promise<MediabunnyMediaBytes> {
          return {
            bytes: new Uint8Array([1, 2, 3]),
            mime: 'video/mp4',
            container: 'mp4',
            telemetry: { bytesWritten: 3 },
          };
        },
        async cancel() {},
      },
      context(operationRequest, events, performance.now() - 1_000),
    );

    expect(events.map((event) => event.type)).toEqual(['progress', 'progress']);
    expect(events[0]?.atMs).toBeGreaterThan(900);
    expect(media.telemetry?.progress).toBe(1);
    expect(() => validateOperationTelemetry('mediabunny@1.48.0', events, media.telemetry)).not.toThrow();
  });

  test('degenerate dimensions bypass invalid WebCodecs preflight and reject as malformed input', async () => {
    const operationRequest = request({
      container: 'mp4',
      video: { codec: 'h264', width: 0, height: 0 },
    });
    operationRequest.output = { ...operationRequest.output!, width: 0, height: 0 };
    expect(browserConfigsForRequest(operationRequest)).toEqual([]);

    const engine = new MediabunnyEngine();
    await engine.init();
    try {
      let caught: unknown;
      try {
        await engine.transcode(
          memoryInput('source.mp4', new Uint8Array([0])),
          { container: 'mp4', video: { codec: 'h264', width: 0, height: 0 } },
          context(operationRequest),
        );
      } catch (error) {
        caught = error;
      }
      expect(isMalformedInputError(caught)).toBe(true);
      expect(caught).toMatchObject({ reasonCode: 'MEDIABUNNY_TRANSCODE_DIMENSIONS_INVALID' });
    } finally {
      await engine.dispose();
    }
  });

  test('unrecognizable transcode bytes use the typed malformed-input channel', async () => {
    const bytes = new Uint8Array(await readFile(new URL('../fixtures/media/image.png', import.meta.url)));
    const operationRequest = request({ container: 'mp4', video: { codec: 'h264' } });
    operationRequest.inputs = [{
      id: 'image.png',
      mime: 'image/png',
      container: 'png',
      mutated: false,
      sourceEvidence: 'UNRESOLVED',
      tracks: [],
    }];
    const engine = new MediabunnyEngine();
    await engine.init();
    try {
      let caught: unknown;
      try {
        await engine.transcode(
          memoryInput('image.png', bytes, 'image/png'),
          { container: 'mp4', video: { codec: 'h264' } },
          context(operationRequest),
        );
      } catch (error) {
        caught = error;
      }
      expect(isMalformedInputError(caught)).toBe(true);
      expect(caught).toMatchObject({ reasonCode: 'MEDIABUNNY_TRANSCODE_INPUT_MALFORMED' });
    } finally {
      await engine.dispose();
    }
  });

  test('declared empty and malformed WAV rows use the typed graceful-failure channel', async () => {
    const engine = new MediabunnyEngine();
    await engine.init();
    try {
      for (const name of ['empty_audio.wav', 'wav_fmt_corrupt.wav']) {
        const bytes = new Uint8Array(
          await readFile(new URL(`../fixtures/media/${name}`, import.meta.url)),
        );
        const operationRequest: ConcreteOperationRequest = {
          protocol: CONCRETE_OPERATION_PROTOCOL,
          scenarioId: `audio-dsp/${name}`,
          operation: 'transcode',
          inputs: [{
            id: name,
            mime: 'audio/wav',
            container: 'wav',
            mutated: false,
            sourceEvidence: 'RESOLVED',
            tracks: [{ type: 'audio', codec: 'pcm-s16', sampleRate: 48_000, channels: 2 }],
          }],
          output: { container: 'wav', audioCodec: 'pcm-s16' },
          options: {
            container: 'wav',
            audio: { codec: 'pcm-s16', sampleRate: 44_100 },
            ...(name === 'empty_audio.wav' ? { gracefulAllowOutput: true } : {}),
            robustness: {
              schema: 'media-test/robustness-contract@1',
              inputClass: name === 'empty_audio.wav' ? 'boundary' : 'negative',
              returnedOutputCheck: 'media-structure',
              survivorOracles: ['graceful-failure'],
              timeoutMs: 15_000,
            },
          },
        };
        let caught: unknown;
        try {
          await engine.transcode(
            memoryInput(name, bytes, 'audio/wav'),
            operationRequest.options as never,
            context(operationRequest),
          );
        } catch (error) {
          caught = error;
        }
        expect(isMalformedInputError(caught)).toBe(true);
        expect(caught).toMatchObject({ reasonCode: 'MEDIABUNNY_TRANSCODE_INPUT_MALFORMED' });
      }

      const name = 'wav_header_truncated.wav';
      const bytes = new Uint8Array(
        await readFile(new URL(`../fixtures/media/${name}`, import.meta.url)),
      );
      const operationRequest: ConcreteOperationRequest = {
        protocol: CONCRETE_OPERATION_PROTOCOL,
        scenarioId: 'audio-dsp/fuzz_wav_header_truncated_probe',
        operation: 'probe',
        inputs: [{
          id: name,
          mime: 'audio/wav',
          container: 'wav',
          mutated: false,
          sourceEvidence: 'RESOLVED',
          tracks: [{ type: 'audio', codec: 'pcm-s16', sampleRate: 48_000, channels: 2 }],
        }],
        options: {
          robustness: {
            schema: 'media-test/robustness-contract@1',
            inputClass: 'negative',
            returnedOutputCheck: 'probe-structure',
            survivorOracles: ['graceful-failure'],
            timeoutMs: 15_000,
          },
        },
      };
      let caught: unknown;
      try {
        await engine.probe(
          memoryInput(name, bytes, 'audio/wav'),
          context(operationRequest),
        );
      } catch (error) {
        caught = error;
      }
      expect(isMalformedInputError(caught)).toBe(true);
      expect(caught).toMatchObject({ reasonCode: 'MEDIABUNNY_PROBE_INPUT_MALFORMED' });
    } finally {
      await engine.dispose();
    }
  });

  test('known malformed demux/decode framework errors use the typed rejection channel', async () => {
    expect(isMediabunnyMalformedParseFailure(
      new Error('Decoding error.'),
      mediabunny.UnsupportedInputFormatError,
    )).toBe(true);
    expect(isMediabunnyMalformedParseFailure(
      new Error('Invalid TS packet sync byte. Likely an internal bug, please report this file.'),
      mediabunny.UnsupportedInputFormatError,
    )).toBe(true);
    expect(isMediabunnyMalformedParseFailure(
      new Error('Assertion failed.'),
      mediabunny.UnsupportedInputFormatError,
    )).toBe(true);
    const cases = [
      {
        id: 'fuzz_ts_zeroed_spans.ts',
        operation: 'demux' as const,
        container: 'ts',
        mime: 'video/mp2t',
        reasonCode: 'MEDIABUNNY_DEMUX_INPUT_MALFORMED',
      },
      {
        id: 'fuzz_encrypted_mp4_ciphertext.mp4',
        operation: 'decodeFrames' as const,
        container: 'mp4',
        mime: 'video/mp4',
        reasonCode: 'MEDIABUNNY_DECODE_INPUT_MALFORMED',
      },
    ];
    const engine = new MediabunnyEngine();
    await engine.init();
    try {
      for (const testCase of cases) {
        const bytes = new Uint8Array(
          await readFile(new URL(`../fixtures/media/${testCase.id}`, import.meta.url)),
        );
        const operationRequest = negativeRequest(
          testCase.operation,
          testCase.id,
          testCase.container,
          testCase.mime,
        );
        let caught: unknown;
        try {
          const input = memoryInput(testCase.id, bytes, testCase.mime);
          if (testCase.operation === 'demux') {
            await engine.demux(input, context(operationRequest));
          } else {
            await engine.decodeFrames(input, { maxFrames: 60 }, context(operationRequest));
          }
        } catch (error) {
          caught = error;
        }
        expect(
          isMalformedInputError(caught),
          `${testCase.id}: ${caught instanceof Error ? `${caught.name}: ${caught.message}` : JSON.stringify(caught)}`,
        ).toBe(true);
        expect(caught).toMatchObject({ reasonCode: testCase.reasonCode });
      }
    } finally {
      await engine.dispose();
    }
  });

  test('exact ABR ladder exposes a description and every adjacent bidirectional switch artifact', () => {
    const variants: TranscodeVideoOptions[] = TRANSCODE_ABR_CONTRACT.renditions.map((rendition) => ({
      codec: rendition.codec,
      width: rendition.width,
      height: rendition.height,
      bitrate: rendition.targetBitrateBps,
    }));
    const outputs: MediabunnyMediaBytes[] = variants.map((_, index) => ({
      bytes: new Uint8Array([index + 1]),
      mime: 'video/mp4',
      container: 'mp4',
    }));
    const artifacts = mediabunnyAbrIntermediates(variants, outputs);
    expect(artifacts).toHaveLength(7);
    const description = artifacts?.find((artifact) => artifact.role === TRANSCODE_ABR_RENDITION_SET_ROLE);
    expect(JSON.parse(new TextDecoder().decode(description?.bytes))).toEqual({
      kind: 'explicit',
      id: TRANSCODE_ABR_CONTRACT.id,
      renditionIds: TRANSCODE_ABR_CONTRACT.renditions.map((rendition) => rendition.id),
      switchPointsUs: [0],
      segmentMode: 'random-access',
    });
    for (let index = 0; index + 1 < TRANSCODE_ABR_CONTRACT.renditions.length; index++) {
      const high = TRANSCODE_ABR_CONTRACT.renditions[index]!;
      const low = TRANSCODE_ABR_CONTRACT.renditions[index + 1]!;
      expect(artifacts?.find((artifact) => artifact.role === transcodeAbrSwitchRole(high.id, low.id, 0))?.bytes)
        .toEqual(outputs[index + 1]?.bytes);
      expect(artifacts?.find((artifact) => artifact.role === transcodeAbrSwitchRole(low.id, high.id, 0))?.bytes)
        .toEqual(outputs[index]?.bytes);
    }
  });
});
