import { afterEach, describe, expect, test } from 'bun:test';
import * as mediabunny from 'mediabunny';
import { readFile } from 'node:fs/promises';

import {
  AUTHENTICATED_RANGE_PROBE_FEATURE,
  CONCRETE_OPERATION_PROTOCOL,
  isBrowserNotSupportedError,
  type ConcreteOperationRequest,
  type MediaInput,
  type NormalizedTrack,
  type Operation,
} from '../src/core/engine.ts';
import { evaluateConcreteSupport } from '../src/core/runner.ts';
import { MediabunnyEngine } from '../src/engines/mediabunny/adapter.ts';
import {
  MEDIABUNNY_REASON,
  audioEncodePlanForRequest,
  decideMediabunnySupport,
  mediabunnyVideoEncoderConfig,
  videoEncodePlanForRequest,
} from '../src/engines/mediabunny/support.ts';

const savedGlobals = new Map<string, PropertyDescriptor | undefined>();

afterEach(() => {
  for (const [name, descriptor] of savedGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  savedGlobals.clear();
});

function installCodecProbe(
  name: 'VideoEncoder' | 'AudioEncoder' | 'VideoDecoder' | 'AudioDecoder',
  probe: (config: unknown) => Promise<{ supported: boolean; config?: unknown }>,
): void {
  if (!savedGlobals.has(name)) savedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  const constructor = function MockCodec(): void {};
  Object.defineProperty(constructor, 'isConfigSupported', { value: probe });
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: constructor });
}

interface RequestOptions {
  operation?: Operation;
  outputContainer: string;
  tracks?: NormalizedTrack[];
  videoCodec?: string;
  audioCodec?: string;
  timingMode?: string;
  encryption?: ConcreteOperationRequest['encryption'];
  options?: Record<string, unknown>;
}

function request({
  operation = 'mux',
  outputContainer,
  tracks = [],
  videoCodec,
  audioCodec,
  timingMode,
  encryption,
  options = {},
}: RequestOptions): ConcreteOperationRequest {
  return {
    protocol: CONCRETE_OPERATION_PROTOCOL,
    scenarioId: `mediabunny-test/${operation}/${outputContainer}`,
    operation,
    inputs: [{
      id: 'source',
      mime: 'video/mp4',
      container: 'mp4',
      mutated: false,
      tracks,
    }],
    output: {
      container: outputContainer,
      ...(videoCodec ? { videoCodec } : {}),
      ...(audioCodec ? { audioCodec } : {}),
    },
    ...(timingMode ? { timingMode } : {}),
    ...(encryption ? { encryption } : {}),
    options,
  };
}

const VIDEO: NormalizedTrack = { type: 'video', codec: 'h264', width: 640, height: 360, fps: 30 };
const AUDIO: NormalizedTrack = { type: 'audio', codec: 'aac', sampleRate: 48_000, channels: 2 };

async function fixtureInput(name: string, mime = 'video/mp4'): Promise<MediaInput> {
  const bytes = new Uint8Array(await readFile(new URL(`../fixtures/media/${name}`, import.meta.url)));
  return {
    id: name,
    url: `blob:mediabunny-support/${name}`,
    mime,
    sizeBytes: bytes.byteLength,
    blob: async () => new Blob([bytes.slice()], { type: mime }),
    arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer,
  };
}

describe('REQ-ENG-01: full Mediabunny output tuple capability', () => {
  test('declares authenticated range transport only alongside bounded probe modes', () => {
    const capabilities = new MediabunnyEngine().capabilities();
    expect(capabilities.features).toContain(AUTHENTICATED_RANGE_PROBE_FEATURE);
    expect(capabilities.probeReadModes).toEqual(['range', 'whole-file']);
  });

  const positiveRows: Array<{ container: string; tracks: NormalizedTrack[]; videoCodec?: string; audioCodec?: string }> = [
    { container: 'mp4', tracks: [VIDEO, AUDIO], videoCodec: 'h264', audioCodec: 'aac' },
    { container: 'mov', tracks: [VIDEO, AUDIO], videoCodec: 'h264', audioCodec: 'aac' },
    { container: 'mkv', tracks: [VIDEO, AUDIO], videoCodec: 'h264', audioCodec: 'aac' },
    { container: 'webm', tracks: [VIDEO, AUDIO], videoCodec: 'vp9', audioCodec: 'opus' },
    { container: 'ts', tracks: [VIDEO, AUDIO], videoCodec: 'h264', audioCodec: 'aac' },
    { container: 'wav', tracks: [{ type: 'audio', codec: 'pcm-s16', sampleRate: 48_000, channels: 2 }], audioCodec: 'pcm-s16' },
    { container: 'mp3', tracks: [{ type: 'audio', codec: 'mp3', sampleRate: 44_100, channels: 2 }], audioCodec: 'mp3' },
    { container: 'flac', tracks: [{ type: 'audio', codec: 'flac', sampleRate: 48_000, channels: 2 }], audioCodec: 'flac' },
    { container: 'ogg', tracks: [{ type: 'audio', codec: 'opus', sampleRate: 48_000, channels: 2 }], audioCodec: 'opus' },
    { container: 'adts', tracks: [AUDIO], audioCodec: 'aac' },
  ];

  for (const row of positiveRows) {
    test(`accepts the installed ${row.container} codec/track tuple`, () => {
      expect(decideMediabunnySupport(request({
        outputContainer: row.container,
        tracks: row.tracks,
        ...(row.videoCodec ? { videoCodec: row.videoCodec } : {}),
        ...(row.audioCodec ? { audioCodec: row.audioCodec } : {}),
      }))).toMatchObject({ supported: true });
    });
  }

  const negativeRows: Array<{ name: string; value: ConcreteOperationRequest; reasonCode: string }> = [
    {
      name: 'illegal H.264-in-WebM cross-product',
      value: request({ outputContainer: 'webm', tracks: [VIDEO], videoCodec: 'h264' }),
      reasonCode: MEDIABUNNY_REASON.CONTAINER_CODEC,
    },
    {
      name: 'explicit zero-track output',
      value: request({ outputContainer: 'mp4', options: { tracks: { tracks: [] } } }),
      reasonCode: MEDIABUNNY_REASON.TRACK_COUNT,
    },
    {
      name: 'excess WAV audio tracks',
      value: request({
        outputContainer: 'wav',
        tracks: [
          { type: 'audio', codec: 'pcm-s16', sampleRate: 48_000, channels: 2 },
          { type: 'audio', codec: 'pcm-s16', sampleRate: 48_000, channels: 2 },
        ],
      }),
      reasonCode: MEDIABUNNY_REASON.TRACK_COUNT,
    },
    {
      name: 'subtitle track',
      value: request({ outputContainer: 'mkv', tracks: [{ type: 'subtitle', codec: 'webvtt' }] }),
      reasonCode: MEDIABUNNY_REASON.TRACK_TYPE,
    },
    {
      name: 'other track',
      value: request({ outputContainer: 'mp4', tracks: [{ type: 'other', codec: 'timecode' }] }),
      reasonCode: MEDIABUNNY_REASON.TRACK_TYPE,
    },
    {
      name: 'explicit timestamps in WAV',
      value: request({
        outputContainer: 'wav',
        tracks: [{ type: 'audio', codec: 'pcm-s16', sampleRate: 48_000, channels: 2 }],
        timingMode: 'timestamped',
      }),
      reasonCode: MEDIABUNNY_REASON.TIMESTAMP_MODE,
    },
    {
      name: 'metadata in MPEG-TS',
      value: request({ outputContainer: 'ts', tracks: [VIDEO], options: { tags: { title: 'unsupported' } } }),
      reasonCode: MEDIABUNNY_REASON.METADATA_FORMAT,
    },
    {
      name: 'unknown normalized metadata key',
      value: request({ outputContainer: 'mp4', tracks: [VIDEO], options: { tags: { privateKey: 'x' } } }),
      reasonCode: MEDIABUNNY_REASON.METADATA_FORMAT,
    },
    {
      name: 'alpha outside VP9 WebM/Matroska',
      value: request({
        operation: 'transcode',
        outputContainer: 'mp4',
        tracks: [VIDEO],
        videoCodec: 'vp9',
        options: { alpha: 'keep', video: { codec: 'vp9' } },
      }),
      reasonCode: MEDIABUNNY_REASON.TRANSFORM_FORMAT,
    },
    {
      name: 'requested missing video track',
      value: request({ outputContainer: 'mp4', tracks: [AUDIO], videoCodec: 'h264', audioCodec: 'aac' }),
      reasonCode: MEDIABUNNY_REASON.MISSING_TRACK,
    },
    {
      name: 'copy request that changes essence',
      value: request({ operation: 'remux', outputContainer: 'mp4', tracks: [VIDEO], videoCodec: 'hevc' }),
      reasonCode: MEDIABUNNY_REASON.COPY_REQUIRED,
    },
    {
      name: 'guarded CENC-CTR protection form',
      value: request({ operation: 'decrypt', outputContainer: 'mp4', tracks: [VIDEO], encryption: 'cenc-ctr' }),
      reasonCode: MEDIABUNNY_REASON.PROTECTION_FORM,
    },
  ];

  for (const row of negativeRows) {
    test(`rejects ${row.name} as intrinsic NA_ENGINE`, () => {
      expect(decideMediabunnySupport(row.value)).toMatchObject({
        supported: false,
        status: 'NA_ENGINE',
        reasonCode: row.reasonCode,
      });
    });
  }

  test('admits the independently verified fragmented CENC-CTR metadata probe', () => {
    const value = request({
      operation: 'probe',
      outputContainer: '',
      tracks: [VIDEO],
      options: {
        robustness: {
          probe: {
            metadataFieldPolicy: { protectionSchemes: ['cenc'] },
          },
        },
      },
    });
    delete value.output;
    expect(decideMediabunnySupport(value)).toEqual({ supported: true });
  });

  test('demux admits A/V inputs but declares unexposed auxiliary tracks intrinsic NA_ENGINE', () => {
    const av = request({ operation: 'demux', outputContainer: '', tracks: [VIDEO, AUDIO] });
    delete av.output;
    expect(decideMediabunnySupport(av)).toEqual({ supported: true });

    const auxiliary = request({
      operation: 'demux',
      outputContainer: '',
      tracks: [VIDEO, AUDIO, { type: 'other', codec: 'timecode' }],
    });
    delete auxiliary.output;
    expect(decideMediabunnySupport(auxiliary)).toMatchObject({
      supported: false,
      status: 'NA_ENGINE',
      reasonCode: MEDIABUNNY_REASON.TRACK_TYPE,
      reason: expect.stringContaining('Input.getTracks()/EncodedPacketSink'),
    });
  });

  test('defers track-dependent remux checks until selected-source evidence resolves', () => {
    const preliminary = request({ operation: 'remux', outputContainer: 'mkv', tracks: [] });
    const unresolved: ConcreteOperationRequest = {
      ...preliminary,
      inputs: preliminary.inputs.map((input) => ({ ...input, sourceEvidence: 'UNRESOLVED' as const })),
    };
    expect(decideMediabunnySupport(unresolved)).toEqual({ supported: true });
    expect(decideMediabunnySupport(preliminary)).toMatchObject({
      supported: false,
      status: 'NA_ENGINE',
      reasonCode: MEDIABUNNY_REASON.TRACK_COUNT,
    });
  });

  test('one unsupported fanout rung does not erase a supported sibling', () => {
    const decision = decideMediabunnySupport(request({
      operation: 'transcode',
      outputContainer: 'webm',
      tracks: [VIDEO],
      videoCodec: 'vp9',
      options: {
        video: { codec: 'vp9', width: 640, height: 360 },
        variants: [
          { codec: 'h264', width: 640, height: 360 },
          { codec: 'vp9', width: 320, height: 180 },
        ],
      },
    }));
    expect(decision).toEqual({ supported: true });
  });
});

describe('REQ-ENG-01/04: exact WebCodecs configuration boundary', () => {
  test('runner routes intrinsic misses to NA_ENGINE without probing the browser', async () => {
    let calls = 0;
    installCodecProbe('VideoEncoder', async () => {
      calls++;
      return { supported: false };
    });
    const result = await evaluateConcreteSupport(
      new MediabunnyEngine(),
      request({
        operation: 'transcode',
        outputContainer: 'webm',
        tracks: [VIDEO],
        videoCodec: 'h264',
        options: { video: { codec: 'h264', width: 854, height: 480 } },
      }),
    );
    expect(result.blocker?.status).toBe('NA_ENGINE');
    expect(calls).toBe(0);
  });

  test('runner routes exact dynamic encoder absence to NA_BROWSER', async () => {
    const checked: unknown[] = [];
    installCodecProbe('VideoEncoder', async (config) => {
      checked.push(config);
      return { supported: false, config };
    });
    const concrete = request({
      operation: 'transcode',
      outputContainer: 'mp4',
      tracks: [VIDEO],
      videoCodec: 'h264',
      options: { video: { codec: 'h264', width: 854, height: 480, bitrate: 2_345_678, fps: 29.97 } },
    });
    const result = await evaluateConcreteSupport(new MediabunnyEngine(), concrete);
    expect(result.blocker?.status).toBe('NA_BROWSER');
    expect(result.probeStates).toEqual([{
      role: 'video-encoder',
      state: 'UNSUPPORTED',
      reasonCode: 'WEB_CODECS_CONFIG_UNSUPPORTED',
    }]);
    expect(checked).toEqual([videoEncodePlanForRequest(concrete)?.config]);
  });

  test('malformed browser configs remain ERROR rather than applicability', async () => {
    installCodecProbe('VideoEncoder', async () => { throw new TypeError('malformed'); });
    const result = await evaluateConcreteSupport(new MediabunnyEngine(), request({
      operation: 'transcode',
      outputContainer: 'mp4',
      tracks: [VIDEO],
      videoCodec: 'h264',
      options: { video: { codec: 'h264', width: 852, height: 480, bitrate: 2_345_679 } },
    }));
    expect(result.blocker?.status).toBe('ERROR');
    expect(result.probeStates[0]?.reasonCode).toBe('WEB_CODECS_INVALID_CONFIG');
  });

  test('adapter plans the exact config Mediabunny passes to browser video support', async () => {
    let observed: unknown;
    installCodecProbe('VideoEncoder', async (config) => {
      observed = config;
      return { supported: true, config };
    });
    const concrete = request({
      operation: 'transcode',
      outputContainer: 'mp4',
      tracks: [VIDEO],
      videoCodec: 'h264',
      options: {
        hardwareAcceleration: 'prefer-software',
        video: { codec: 'h264', width: 642, height: 358, bitrate: 1_234_567, fps: 29.97 },
      },
    });
    const plan = videoEncodePlanForRequest(concrete)!;
    expect(await mediabunny.canEncodeVideo(plan.codec, {
      width: plan.width,
      height: plan.height,
      bitrate: plan.bitrate,
      framerate: plan.frameRate,
      hardwareAcceleration: plan.hardwareAcceleration,
      alpha: plan.alpha,
    })).toBe(true);
    expect(observed).toEqual(plan.config);
    expect(plan.config.framerate).toBe(29.97);
  });

  test('exact profile/level generation matches Mediabunny for every video codec and high-level edges', async () => {
    const observed: unknown[] = [];
    installCodecProbe('VideoEncoder', async (config) => {
      observed.push(config);
      return { supported: true, config };
    });
    const rows = [
      { codec: 'avc', width: 5000, height: 3000, bitrate: 200_000_000 },
      { codec: 'hevc', width: 644, height: 362, bitrate: 2_100_001 },
      { codec: 'vp8', width: 646, height: 364, bitrate: 2_100_002 },
      { codec: 'vp9', width: 648, height: 366, bitrate: 2_100_003 },
      { codec: 'av1', width: 5000, height: 3000, bitrate: 50_000_000 },
    ] as const;
    for (const row of rows) {
      expect(await mediabunny.canEncodeVideo(row.codec, {
        width: row.width,
        height: row.height,
        bitrate: row.bitrate,
        hardwareAcceleration: 'no-preference',
      })).toBe(true);
    }
    expect(observed).toEqual(rows.map((row) => mediabunnyVideoEncoderConfig(
      row.codec,
      row.width,
      row.height,
      row.bitrate,
      undefined,
      'no-preference',
      'discard',
    )));
  });

  test('adapter plans exact audio rate/channel/profile configs including HE-AAC forms', async () => {
    let observed: unknown;
    installCodecProbe('AudioEncoder', async (config) => {
      observed = config;
      return { supported: true, config };
    });
    const concrete = request({
      operation: 'transcode',
      outputContainer: 'mp4',
      tracks: [AUDIO],
      audioCodec: 'aac',
      options: { audio: { codec: 'aac', sampleRate: 16_000, channels: 2, bitrate: 173_000 } },
    });
    const plan = audioEncodePlanForRequest(concrete)!;
    expect(await mediabunny.canEncodeAudio(plan.codec, {
      sampleRate: plan.sampleRate,
      numberOfChannels: plan.channels,
      bitrate: plan.bitrate,
    })).toBe(true);
    expect(observed).toEqual(plan.config);
    expect(plan.config?.codec).toBe('mp4a.40.29');

    const mono = audioEncodePlanForRequest(request({
      operation: 'transcode',
      outputContainer: 'mp4',
      tracks: [AUDIO],
      audioCodec: 'aac',
      options: { audio: { codec: 'aac', sampleRate: 16_000, channels: 1, bitrate: 96_000 } },
    }));
    expect(mono?.config?.codec).toBe('mp4a.40.5');
  });

  test('sampled input FPS is evidence only and is not invented as a CFR encoder setting', () => {
    const concrete = request({
      operation: 'transcode',
      outputContainer: 'mp4',
      tracks: [{
        ...VIDEO,
        fps: 30000 / 1001,
        fpsProvenance: { source: 'average', cadence: 'VFR', sampleCount: 120, observedIntervalUs: 4_100_000 },
      }],
      videoCodec: 'h264',
      options: { video: { codec: 'h264', width: 640, height: 360, bitrate: 1_500_000 } },
    });
    expect(videoEncodePlanForRequest(concrete)?.config.framerate).toBeUndefined();
  });

  test('runtime video and audio decoder misses carry exact typed NA_BROWSER evidence', async () => {
    const videoConfigs: unknown[] = [];
    installCodecProbe('VideoDecoder', async (config) => {
      videoConfigs.push(config);
      return { supported: false, config };
    });
    installCodecProbe('AudioDecoder', async (config) => ({ supported: false, config }));

    const engine = new MediabunnyEngine();
    await engine.init();
    videoConfigs.length = 0; // exclude broad untimed init warmups
    try {
      let videoError: unknown;
      try {
        await engine.decodeFrames(await fixtureInput('micro_h264_1frame.mp4'), { maxFrames: 1 });
      } catch (error) {
        videoError = error;
      }
      expect(isBrowserNotSupportedError(videoError)).toBe(true);
      expect(videoError).toMatchObject({
        reasonCode: MEDIABUNNY_REASON.BROWSER_VIDEO_DECODE,
        browserConfig: {
          role: 'video-decoder',
          config: { codec: 'avc1.64100b', codedWidth: 320, codedHeight: 240 },
        },
      });
      expect(videoConfigs).toHaveLength(2); // unique no-preference + prefer-software configs

      let audioError: unknown;
      try {
        await engine.decodeFrames(await fixtureInput('aac_audio_only.m4a', 'audio/mp4'), { maxFrames: 1 });
      } catch (error) {
        audioError = error;
      }
      expect(isBrowserNotSupportedError(audioError)).toBe(true);
      expect(audioError).toMatchObject({
        reasonCode: MEDIABUNNY_REASON.BROWSER_AUDIO_DECODE,
        browserConfig: {
          role: 'audio-decoder',
          config: { codec: 'mp4a.40.2', sampleRate: 48_000, numberOfChannels: 2 },
        },
      });
    } finally {
      await engine.dispose();
    }
  });

  test('runtime encoder misses remain typed with exact generated video and HE-AAC configs', async () => {
    installCodecProbe('VideoDecoder', async (config) => ({ supported: true, config }));
    installCodecProbe('AudioDecoder', async (config) => ({ supported: true, config }));
    installCodecProbe('VideoEncoder', async (config) => ({ supported: false, config }));
    installCodecProbe('AudioEncoder', async (config) => ({ supported: false, config }));

    const engine = new MediabunnyEngine();
    await engine.init();
    try {
      let videoError: unknown;
      try {
        await engine.transcode(await fixtureInput('video_2x2_h264.mp4'), {
          container: 'mp4',
          video: { codec: 'h264', width: 316, height: 236, bitrate: 1_111_111, fps: 24 },
        });
      } catch (error) {
        videoError = error;
      }
      expect(isBrowserNotSupportedError(videoError)).toBe(true);
      expect(videoError).toMatchObject({
        reasonCode: MEDIABUNNY_REASON.BROWSER_VIDEO_ENCODE,
        browserConfig: {
          role: 'video-encoder',
          config: { codec: expect.stringMatching(/^avc1\./), width: 316, height: 236, bitrate: 1_111_111, framerate: 24 },
        },
      });

      let audioError: unknown;
      try {
        await engine.transcode(await fixtureInput('micro_audio_short.m4a', 'audio/mp4'), {
          container: 'mp4',
          audio: { codec: 'aac', sampleRate: 16_000, channels: 2, bitrate: 173_001 },
        });
      } catch (error) {
        audioError = error;
      }
      expect(isBrowserNotSupportedError(audioError)).toBe(true);
      expect(audioError).toMatchObject({
        reasonCode: MEDIABUNNY_REASON.BROWSER_AUDIO_ENCODE,
        browserConfig: {
          role: 'audio-encoder',
          config: { codec: 'mp4a.40.29', sampleRate: 16_000, numberOfChannels: 2, bitrate: 173_001 },
        },
      });
    } finally {
      await engine.dispose();
    }
  });
});
