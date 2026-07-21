import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import {
  CONCRETE_OPERATION_PROTOCOL,
  isBrowserNotSupportedError,
  type ConcreteOperationRequest,
  type LifecycleContext,
  type MediaInput,
  type OperationContext,
  type OperationTelemetry,
} from '../src/core/engine.ts';
import {
  WebDemuxerEngine,
  type WebDemuxerEngineDependencies,
} from '../src/engines/web-demuxer/adapter.ts';
import { WebDemuxerPartialDecodeError } from '../src/engines/web-demuxer/temporal.ts';
import type { AVMediaType, AVSeekFlag, WebAVPacket, WebAVStream, WebMediaInfo } from 'web-demuxer';

const originalVideoDecoder = Object.getOwnPropertyDescriptor(globalThis, 'VideoDecoder');
const originalEncodedVideoChunk = Object.getOwnPropertyDescriptor(globalThis, 'EncodedVideoChunk');
const originalVideoFrame = Object.getOwnPropertyDescriptor(globalThis, 'VideoFrame');
const originalImageData = Object.getOwnPropertyDescriptor(globalThis, 'ImageData');

let plan: FakePlan;
let decoderPlan: DecoderPlan;

beforeEach(() => {
  FakeWebDemuxer.instances.length = 0;
  FakeVideoDecoder.supportConfigs.length = 0;
  FakeVideoDecoder.configured.length = 0;
  FakeVideoFrame.closed.length = 0;
  plan = defaultPlan();
  decoderPlan = { outputOrder: 'input' };
});

afterEach(() => {
  restoreGlobal('VideoDecoder', originalVideoDecoder);
  restoreGlobal('EncodedVideoChunk', originalEncodedVideoChunk);
  restoreGlobal('VideoFrame', originalVideoFrame);
  restoreGlobal('ImageData', originalImageData);
});

describe('REQ-ENG-30: observable web-demuxer lifecycle and cancellation', () => {
  test('awaits the public load readiness barrier, shares repeated init, and destroys exactly once', async () => {
    const readiness = deferred<void>();
    plan.readiness = readiness.promise;
    let imports = 0;
    let clock = 0;
    const engine = makeEngine({
      importModule: async () => {
        imports++;
        return fakeModule();
      },
      now: () => ++clock,
    });
    const init = engine.init(lifecycle());
    await tick();
    expect(FakeWebDemuxer.instances).toHaveLength(1);
    expect(FakeWebDemuxer.instances[0]!.loads).toEqual(['data:application/octet-stream;base64,']);
    expect(engine.configUsed.lifecycle.readyCount).toBe(0);
    readiness.resolve();
    await Promise.all([init, engine.init(lifecycle())]);
    expect(imports).toBe(1);
    expect(engine.configUsed.lifecycle).toMatchObject({ initAttempts: 1, readyCount: 1, destroyCount: 0 });
    expect(FakeWebDemuxer.instances[0]!.wasmFilePath).toBe('https://suite.invalid/assets/web-demuxer.wasm');

    await Promise.all([engine.dispose(lifecycle()), engine.dispose(lifecycle())]);
    expect(FakeWebDemuxer.instances[0]!.destroyCalls).toBe(1);
    expect(engine.configUsed.lifecycle.destroyCount).toBe(1);
  });

  test('keeps worker-readable HTTP URLs but transports runner object URLs as Files', async () => {
    const engine = makeEngine();
    await engine.init(lifecycle());

    const httpInput = input();
    await engine.probe(httpInput, operationContext('probe'));

    const objectUrlInput: MediaInput = {
      ...input(),
      url: 'blob:https://suite.invalid/verified-corpus-object',
    };
    await engine.probe(objectUrlInput, operationContext('probe'));

    const loads = FakeWebDemuxer.instances[0]!.loads;
    expect(loads[1]).toBe(httpInput.url);
    expect(loads[2]).toBeInstanceOf(File);
    expect((loads[2] as File).name).toBe(objectUrlInput.id);
    expect((loads[2] as File).type).toBe(objectUrlInput.mime);
    await engine.dispose(lifecycle());
  });

  test('materializes same-origin WASM for the package nested worker in an isolated worker realm', async () => {
    const fetched: string[] = [];
    const engine = makeEngine({
      workerRealm: true,
      fetchWasm: async (url) => {
        fetched.push(url);
        return Uint8Array.of(0x00, 0x61, 0x73, 0x6d);
      },
    });
    await engine.init(lifecycle());
    expect(fetched).toEqual(['https://suite.invalid/assets/web-demuxer.wasm']);
    expect(FakeWebDemuxer.instances[0]?.wasmFilePath).toBe('data:application/wasm;base64,AGFzbQ==');
    expect(engine.configUsed.wasmTransport).toBe('same-origin-materialized-data-url');
    await engine.dispose(lifecycle());
  });

  test('turns package string rejections for malformed probe input into ordinary Errors', async () => {
    plan.mediaInfoError = 'get_media_info failed: undefined';
    const engine = makeEngine();
    await engine.init(lifecycle());
    await expect(engine.probe(input(), operationContext('probe'))).rejects.toThrow(
      'web-demuxer@4.0.0: probe failed: get_media_info failed: undefined',
    );
    await engine.dispose(lifecycle());
  });

  test('turns graceful demux parser rejection into the typed malformed-input channel', async () => {
    plan.mediaInfoError = 'get_media_info failed: undefined';
    const engine = makeEngine();
    await engine.init(lifecycle());
    const context = operationContext('demux');
    const gracefulContext: OperationContext = {
      ...context,
      request: {
        ...context.request,
        options: {
          ...context.request.options,
          robustness: {
            schema: 'media-test/robustness-contract@1',
            inputClass: 'negative',
          },
        },
      },
    };
    await expect(engine.demux(input(), gracefulContext)).rejects.toMatchObject({
      name: 'MalformedInputError',
      reasonCode: 'WEB_DEMUXER_DEMUX_MALFORMED_INPUT_REJECTED',
      operation: 'demux',
      stage: 'parse',
    });
    await engine.dispose(lifecycle());
  });

  test('does not relabel cancellation as malformed input in a graceful probe row', async () => {
    plan.mediaInfoError = abortError('cancel probe');
    const engine = makeEngine();
    await engine.init(lifecycle());
    const context = operationContext('probe');
    const gracefulContext: OperationContext = {
      ...context,
      request: {
        ...context.request,
        options: { ...context.request.options, gracefulAllowOutput: true },
      },
    };
    await expect(engine.probe(input(), gracefulContext)).rejects.toMatchObject({
      name: 'AbortError',
      message: 'cancel probe',
    });
    await engine.dispose(lifecycle());
  });

  test('abort during readiness terminates the worker and cannot publish a late ready transition', async () => {
    const readiness = deferred<void>();
    plan.readiness = readiness.promise;
    const engine = makeEngine();
    const controller = new AbortController();
    const init = engine.init(lifecycle(controller.signal));
    await tick();
    controller.abort(abortError('cancel readiness'));
    await expect(init).rejects.toMatchObject({ name: 'AbortError', message: 'cancel readiness' });
    expect(FakeWebDemuxer.instances[0]!.destroyCalls).toBe(1);
    readiness.resolve();
    await tick();
    expect(engine.configUsed.lifecycle.readyCount).toBe(0);
    expect(engine.configUsed.lifecycle.destroyCount).toBe(1);
    await engine.dispose(lifecycle(controller.signal));
  });

  test('reports cross-origin artifact and teardown failures instead of swallowing them', async () => {
    const crossOrigin = makeEngine({ wasmAssetUrl: 'https://cdn.invalid/web-demuxer.wasm' });
    await expect(crossOrigin.init(lifecycle())).rejects.toThrow('refusing cross-origin WASM URL');
    expect(FakeWebDemuxer.instances).toHaveLength(0);

    const engine = makeEngine();
    await engine.init(lifecycle());
    FakeWebDemuxer.instances[0]!.throwOnDestroy = true;
    await expect(engine.dispose(lifecycle())).rejects.toThrow('destroy failed');
    expect(FakeWebDemuxer.instances[0]!.destroyCalls).toBe(1);
  });

  test('cancels an active packet stream promptly and emits no later packet telemetry', async () => {
    const pendingRead = deferred<void>();
    const readerStarted = deferred<void>();
    let streamCancelled = 0;
    plan.streamFactory = () => new ReadableStream<WebAVPacket>({
      async pull() {
        readerStarted.resolve();
        await pendingRead.promise;
      },
      cancel() {
        streamCancelled++;
        pendingRead.resolve();
      },
    });
    const engine = makeEngine();
    await engine.init(lifecycle());
    const controller = new AbortController();
    const events: OperationTelemetry[] = [];
    const running = engine.demux(input(), operationContext('demux', controller.signal, events));
    await readerStarted.promise;
    controller.abort(abortError('cancel packet read'));
    await expect(running).rejects.toMatchObject({ name: 'AbortError' });
    expect(streamCancelled).toBe(1);
    const countAfterSettlement = events.length;
    await tick();
    expect(events).toHaveLength(countAfterSettlement);
    await engine.dispose(lifecycle(controller.signal));
  });
});

describe('REQ-ENG-26/28/30: exact browser config and temporal decode/seek', () => {
  test('normal demux reports its worker backend, sparse track map, and absent DTS explicitly', async () => {
    const video = stream({ index: 9 });
    const audio = stream({
      index: 3, id: 2, codec_type: 1, codec_type_string: 'audio', codec_name: 'aac',
      codec_string: 'mp4a.40.2', width: 0, height: 0, channels: 2, sample_rate: 48_000,
      extradata: new Uint8Array([0x11, 0x90]), extradata_size: 2,
    });
    plan.info = mediaInfo({ streams: [video, audio], nb_streams: 2 });
    plan.streams = [audio, video];
    plan.packetsByStream = new Map([
      [9, [packet(0, 1)]],
      [3, [{ ...packet(0), data: new Uint8Array([1, 2, 3]), size: 3 }]],
    ]);
    const engine = makeEngine();
    await engine.init(lifecycle());
    const result = await engine.demux(input(), operationContext('demux'));
    expect(result.metadata.tracks.map((track) => [track.type, track.codec])).toEqual([
      ['video', 'h264'], ['audio', 'aac'],
    ]);
    expect(result.packets.map((item) => item.trackIndex)).toEqual([0, 1]);
    expect(result.packets.every((item) => item.dtsUs === undefined)).toBe(true);
    expect(FakeWebDemuxer.instances[0]!.reads.map((item) => item.streamIndex)).toEqual([9, 3]);
    expect((result as unknown as { backendEvidence: object }).backendEvidence).toMatchObject({
      backend: 'worker-ffmpeg-wasm',
      dtsEvidence: 'absent',
      trackIndexMap: { '9': 0, '3': 1 },
      packetCount: 2,
    });
    expect(engine.configUsed.lastDemuxBackend).toBe('worker-ffmpeg-wasm');
    await engine.dispose(lifecycle());
  });

  test('uses the same exact selected-track config for support and configure, then returns lowest PTS N', async () => {
    installWebCodecs();
    plan.packets = [packet(0), packet(0.1), packet(0.2), packet(0.3)];
    decoderPlan.outputOrder = [300_000, 100_000, 200_000, 0];
    const engine = makeEngine();
    await engine.init(lifecycle());
    const events: OperationTelemetry[] = [];
    const sink = await engine.decodeFrames(
      input(),
      { maxFrames: 2 },
      operationContext('decodeFrames', new AbortController().signal, events),
    );
    expect(sink.frames.map((frame) => frame.ptsUs)).toEqual([0, 100_000]);
    expect(FakeVideoDecoder.supportConfigs).toHaveLength(1);
    expect(FakeVideoDecoder.configured).toHaveLength(1);
    expect(FakeVideoDecoder.supportConfigs[0]).toBe(FakeVideoDecoder.configured[0]);
    expect(FakeVideoDecoder.configured[0]).toEqual({
      codec: 'avc1.640028', codedWidth: 1, codedHeight: 1, description: new Uint8Array([1, 2, 3]),
    });
    expect(engine.configUsed.lastDecoderConfig).toEqual(FakeVideoDecoder.configured[0]);
    expect(FakeVideoFrame.closed.sort((a, b) => a - b)).toEqual([0, 100_000, 200_000, 300_000]);
    expect(sink.telemetry).toMatchObject({ decodedFrames: 4 });
    expect(events.filter((event) => event.type === 'decoded-frame-count').at(-1)).toMatchObject({ count: 4 });
    await engine.dispose(lifecycle());
  });

  test('uses the explicitly selected non-primary video stream for config and packet reads', async () => {
    installWebCodecs();
    const primary = stream({ index: 9, id: 1 });
    const secondary = stream({ index: 12, id: 2, codec_string: 'avc1.4d401f', profile: 'Main', level: 31 });
    plan.info = mediaInfo({ streams: [primary, secondary], nb_streams: 2 });
    plan.streams = [primary, secondary];
    plan.config = { ...plan.config, codec: 'avc1.4d401f' };
    plan.packetsByStream = new Map([
      [9, []],
      [12, [packet(0, 1)]],
    ]);
    const selectedRequest: ConcreteOperationRequest = {
      protocol: CONCRETE_OPERATION_PROTOCOL,
      scenarioId: 'web-demuxer-test/decode-secondary-video',
      operation: 'decodeFrames',
      inputs: [{
        id: 'fixture.mp4', mime: 'video/mp4', container: 'mp4', mutated: false,
        tracks: [
          { type: 'video', codec: 'h264', width: 1, height: 1 },
          { type: 'video', codec: 'h264', width: 1, height: 1 },
        ],
      }],
      options: { videoTrackIndex: 1 },
    };
    const context: OperationContext = {
      signal: new AbortController().signal,
      phase: 'functional',
      request: selectedRequest,
      emit: () => undefined,
    };
    const engine = makeEngine();
    await engine.init(lifecycle());
    const sink = await engine.decodeFrames(input(), { maxFrames: 1 }, context);
    expect(sink.frames).toHaveLength(1);
    expect(FakeWebDemuxer.instances[0]!.decoderConfigStreamIndices).toEqual([12]);
    expect(FakeWebDemuxer.instances[0]!.reads[0]?.streamIndex).toBe(12);
    expect(FakeVideoDecoder.supportConfigs[0]).toMatchObject({ codec: 'avc1.4d401f' });
    await engine.dispose(lifecycle());
  });

  test('routes API/config/raster misses to typed NA_BROWSER after parsing the input', async () => {
    const engineWithoutApi = makeEngine();
    await engineWithoutApi.init(lifecycle());
    const missingApi = await capture(engineWithoutApi.decodeFrames(input(), { maxFrames: 1 }, operationContext('decodeFrames')));
    expect(isBrowserNotSupportedError(missingApi)).toBe(true);
    if (isBrowserNotSupportedError(missingApi)) {
      expect(missingApi.reasonCode).toBe('WEB_DEMUXER_BROWSER_API_UNAVAILABLE');
      expect(missingApi.browserConfig).toMatchObject({
        role: 'video-decoder', trackIndex: 0, config: { codec: 'avc1.640028' },
      });
    }

    installWebCodecs();
    decoderPlan.supported = false;
    const unsupported = makeEngine();
    await unsupported.init(lifecycle());
    const configMiss = await capture(unsupported.seek(input(), 0, operationContext('seek')));
    expect(isBrowserNotSupportedError(configMiss)).toBe(true);
    if (isBrowserNotSupportedError(configMiss)) {
      expect(configMiss.reasonCode).toBe('WEB_DEMUXER_VIDEO_DECODER_CONFIG_UNSUPPORTED');
    }

    Reflect.deleteProperty(globalThis, 'VideoFrame');
    decoderPlan.supported = true;
    const noRaster = makeEngine();
    await noRaster.init(lifecycle());
    const rasterMiss = await capture(noRaster.decodeFrames(input(), { maxFrames: 1 }, operationContext('decodeFrames')));
    expect(isBrowserNotSupportedError(rasterMiss)).toBe(true);
    if (isBrowserNotSupportedError(rasterMiss)) {
      expect(rasterMiss.reasonCode).toBe('WEB_DEMUXER_RASTER_UNAVAILABLE');
    }
  });

  test('keeps a malformed package decoder config as an ordinary TypeError', async () => {
    installWebCodecs();
    plan.config = { ...plan.config, codec: '' };
    const engine = makeEngine();
    await engine.init(lifecycle());
    const error = await capture(engine.decodeFrames(input(), { maxFrames: 1 }, operationContext('decodeFrames')));
    expect(error).toBeInstanceOf(TypeError);
    expect(isBrowserNotSupportedError(error)).toBe(false);
    expect(FakeVideoDecoder.supportConfigs).toHaveLength(0);
    await engine.dispose(lifecycle());
  });

  test('surfaces a decoder error after frames as partial failure and closes every frame', async () => {
    installWebCodecs();
    plan.packets = [packet(0), packet(0.1), packet(0.2)];
    decoderPlan.failAfterOutputs = 2;
    const engine = makeEngine();
    await engine.init(lifecycle());
    const error = await capture(engine.decodeFrames(input(), { maxFrames: 3 }, operationContext('decodeFrames')));
    expect(error).toBeInstanceOf(WebDemuxerPartialDecodeError);
    expect(error).toMatchObject({ phase: 'decode', emittedFrames: 2 });
    expect(FakeVideoFrame.closed.sort((a, b) => a - b)).toEqual([0, 100_000]);
    await engine.dispose(lifecycle());
  });

  test('attempts every frame close and reports a cleanup failure as part of settlement', async () => {
    installWebCodecs();
    plan.packets = [packet(0), packet(0.1)];
    decoderPlan.closeErrorTimestamp = 0;
    const engine = makeEngine();
    await engine.init(lifecycle());
    const error = await capture(engine.decodeFrames(input(), { maxFrames: 2 }, operationContext('decodeFrames')));
    expect(error).toBeInstanceOf(AggregateError);
    expect(String(error)).toContain('failed to close 1 decoded frame');
    expect(FakeVideoFrame.closed.sort((a, b) => a - b)).toEqual([0, 100_000]);
    await engine.dispose(lifecycle());
  });

  test('aborts a pending raster readback promptly, closes its frame, and ignores late completion', async () => {
    installWebCodecs();
    const copyGate = deferred<void>();
    const copyStarted = deferred<void>();
    decoderPlan.copyGate = copyGate.promise;
    decoderPlan.copyStarted = copyStarted;
    plan.packets = [packet(0, 1)];
    const engine = makeEngine();
    await engine.init(lifecycle());
    const controller = new AbortController();
    const events: OperationTelemetry[] = [];
    const running = engine.decodeFrames(
      input(), { maxFrames: 1 }, operationContext('decodeFrames', controller.signal, events),
    );
    await copyStarted.promise;
    controller.abort(abortError('cancel raster'));
    await expect(running).rejects.toMatchObject({ name: 'AbortError', message: 'cancel raster' });
    expect(FakeVideoFrame.closed).toEqual([0]);
    const eventsAfterSettlement = events.length;
    copyGate.resolve();
    await tick();
    expect(events).toHaveLength(eventsAfterSettlement);
    await engine.dispose(lifecycle(controller.signal));
  });

  test('seek reads to a real next-GOP boundary beyond 0.75s and lands by sorted real PTS', async () => {
    installWebCodecs();
    plan.info = mediaInfo({ duration: 4 });
    plan.packets = [
      packet(0, 1),
      packet(0.8),
      packet(1.2),
      packet(2, 1),
      packet(2.2),
    ];
    decoderPlan.outputOrder = [2_000_000, 1_200_000, 0, 800_000];
    const engine = makeEngine();
    await engine.init(lifecycle());
    const result = await engine.seek(input(), 1_000_000, operationContext('seek'));
    expect(result.landedPtsUs).toBe(800_000);
    expect(FakeWebDemuxer.instances[0]!.reads[0]).toMatchObject({
      start: 1, end: 5, streamIndex: 9, seekFlag: 1,
    });
    expect(FakeWebDemuxer.instances[0]!.streamCancelCalls).toBe(1);
    expect(FakeVideoFrame.closed.sort((a, b) => a - b)).toEqual([0, 800_000, 1_200_000, 2_000_000]);
    await engine.dispose(lifecycle());
  });
});

interface FakePlan {
  readiness?: Promise<void>;
  mediaInfoError?: unknown;
  info: WebMediaInfo;
  streams: WebAVStream[];
  config: VideoDecoderConfig & { rotation?: number; flip?: boolean };
  packets: WebAVPacket[];
  packetsByStream?: Map<number, WebAVPacket[]>;
  streamFactory?: () => ReadableStream<WebAVPacket>;
}

interface DecoderPlan {
  supported?: boolean;
  supportError?: unknown;
  outputOrder: 'input' | number[];
  failAfterOutputs?: number;
  closeErrorTimestamp?: number;
  copyGate?: Promise<void>;
  copyStarted?: { resolve(value?: void): void };
}

class FakeWebDemuxer {
  static instances: FakeWebDemuxer[] = [];
  readonly wasmFilePath: string;
  readonly loads: Array<File | string> = [];
  readonly reads: Array<{ start?: number; end?: number; streamType?: AVMediaType; streamIndex?: number; seekFlag?: AVSeekFlag }> = [];
  readonly decoderConfigStreamIndices: number[] = [];
  destroyCalls = 0;
  streamCancelCalls = 0;
  throwOnDestroy = false;

  constructor(options?: { wasmFilePath?: string }) {
    this.wasmFilePath = options?.wasmFilePath ?? '';
    FakeWebDemuxer.instances.push(this);
  }

  async load(source: File | string): Promise<void> {
    this.loads.push(source);
    if (this.loads.length === 1) await plan.readiness;
  }

  destroy(): void {
    this.destroyCalls++;
    if (this.throwOnDestroy) throw new Error('destroy failed');
  }

  async getMediaInfo(): Promise<WebMediaInfo> {
    if (plan.mediaInfoError !== undefined) throw plan.mediaInfoError;
    return plan.info;
  }

  async getAVStreams(): Promise<WebAVStream[]> {
    return plan.streams;
  }

  genDecoderConfig(_type?: AVMediaType | 'video', stream?: WebAVStream): VideoDecoderConfig {
    if (stream) this.decoderConfigStreamIndices.push(stream.index);
    return plan.config;
  }

  genEncodedChunk(_type: 'video', value: WebAVPacket): EncodedVideoChunk {
    return { type: value.keyframe ? 'key' : 'delta', timestamp: Math.round(value.timestamp * 1_000_000) } as EncodedVideoChunk;
  }

  readAVPacket(
    start?: number,
    end?: number,
    streamType?: AVMediaType,
    streamIndex?: number,
    seekFlag?: AVSeekFlag,
  ): ReadableStream<WebAVPacket> {
    this.reads.push({ start, end, streamType, streamIndex, seekFlag });
    if (plan.streamFactory) return plan.streamFactory();
    const packets = plan.packetsByStream?.get(streamIndex ?? -1) ?? plan.packets;
    let index = 0;
    return new ReadableStream<WebAVPacket>({
      pull: (controller) => {
        const value = packets[index++];
        if (value) controller.enqueue(value);
        else controller.close();
      },
      cancel: () => {
        this.streamCancelCalls++;
      },
    });
  }
}

class FakeVideoDecoder {
  static supportConfigs: VideoDecoderConfig[] = [];
  static configured: VideoDecoderConfig[] = [];
  state: CodecState = 'unconfigured';
  decodeQueueSize = 0;
  private readonly queued: EncodedVideoChunk[] = [];

  constructor(private readonly callbacks: VideoDecoderInit) {}

  static async isConfigSupported(config: VideoDecoderConfig): Promise<VideoDecoderSupport> {
    this.supportConfigs.push(config);
    if (decoderPlan.supportError !== undefined) throw decoderPlan.supportError;
    return { supported: decoderPlan.supported !== false, config };
  }

  configure(config: VideoDecoderConfig): void {
    FakeVideoDecoder.configured.push(config);
    this.state = 'configured';
  }

  decode(chunk: EncodedVideoChunk): void {
    this.queued.push(chunk);
    this.decodeQueueSize = this.queued.length;
  }

  async flush(): Promise<void> {
    const queued = this.queued.splice(0);
    this.decodeQueueSize = 0;
    const ordered = decoderPlan.outputOrder === 'input'
      ? queued
      : decoderPlan.outputOrder.flatMap((timestamp) => queued.filter((chunk) => chunk.timestamp === timestamp));
    const limit = decoderPlan.failAfterOutputs ?? ordered.length;
    for (const chunk of ordered.slice(0, limit)) {
      this.callbacks.output(new FakeVideoFrame(chunk.timestamp) as unknown as VideoFrame);
    }
    if (decoderPlan.failAfterOutputs !== undefined) {
      const error = new Error('injected decoder failure');
      this.callbacks.error(error);
      throw error;
    }
  }

  close(): void {
    this.state = 'closed';
  }
}

class FakeVideoFrame {
  static closed: number[] = [];
  readonly codedWidth = 1;
  readonly codedHeight = 1;
  readonly displayWidth = 1;
  readonly displayHeight = 1;

  constructor(readonly timestamp: number) {}

  async copyTo(destination: AllowSharedBufferSource): Promise<PlaneLayout[]> {
    decoderPlan.copyStarted?.resolve();
    await decoderPlan.copyGate;
    const bytes = destination instanceof Uint8Array
      ? destination
      : new Uint8Array(ArrayBuffer.isView(destination)
        ? destination.buffer
        : destination as ArrayBuffer);
    bytes.set([this.timestamp & 0xff, 2, 3, 255]);
    return [{ offset: 0, stride: 4 }];
  }

  close(): void {
    FakeVideoFrame.closed.push(this.timestamp);
    if (decoderPlan.closeErrorTimestamp === this.timestamp) throw new Error(`close failed at ${this.timestamp}`);
  }
}

class FakeImageData {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;

  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

function installWebCodecs(): void {
  Object.defineProperty(globalThis, 'VideoDecoder', { configurable: true, writable: true, value: FakeVideoDecoder });
  Object.defineProperty(globalThis, 'EncodedVideoChunk', { configurable: true, writable: true, value: class {} });
  Object.defineProperty(globalThis, 'VideoFrame', { configurable: true, writable: true, value: FakeVideoFrame });
  Object.defineProperty(globalThis, 'ImageData', { configurable: true, writable: true, value: FakeImageData });
}

function makeEngine(overrides: WebDemuxerEngineDependencies = {}): WebDemuxerEngine {
  return new WebDemuxerEngine({
    importModule: async () => fakeModule(),
    wasmAssetUrl: '/assets/web-demuxer.wasm',
    locationHref: 'https://suite.invalid/index.html',
    now: () => performance.now(),
    ...overrides,
  });
}

function fakeModule(): Pick<typeof import('web-demuxer'), 'WebDemuxer'> {
  return { WebDemuxer: FakeWebDemuxer as unknown as typeof import('web-demuxer').WebDemuxer };
}

function defaultPlan(): FakePlan {
  const video = stream();
  return {
    info: mediaInfo({ streams: [video] }),
    streams: [video],
    config: {
      codec: 'avc1.640028', codedWidth: 1, codedHeight: 1,
      description: new Uint8Array([1, 2, 3]), rotation: 90, flip: false,
    },
    packets: [packet(0, 1)],
  };
}

function mediaInfo(overrides: Partial<WebMediaInfo> = {}): WebMediaInfo {
  return {
    format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: 3, start_time: 0,
    bit_rate: '1000', nb_streams: 1, nb_chapters: 0, streams: [stream()],
    ...overrides,
  };
}

function stream(overrides: Partial<WebAVStream> = {}): WebAVStream {
  return {
    index: 9, id: 1, codec_type: 0, codec_type_string: 'video', codec_name: 'h264',
    codec_string: 'avc1.640028', color_primaries: '', color_range: '', color_space: '', color_transfer: '',
    profile: 'High', pix_fmt: 'yuv420p', level: 40, width: 1, height: 1, channels: 0, sample_rate: 0,
    sample_fmt: '', bit_rate: '1000', extradata_size: 3, extradata: new Uint8Array([1, 2, 3]),
    r_frame_rate: '30/1', avg_frame_rate: '30/1', sample_aspect_ratio: '1/1', display_aspect_ratio: '1/1',
    start_time: 0, duration: 3, rotation: 0, flip: false, nb_frames: '90', tags: {},
    ...overrides,
  };
}

function packet(timestampSec: number, keyframe: 0 | 1 = 0): WebAVPacket {
  return {
    keyframe, timestamp: timestampSec, duration: 1 / 30, size: 4,
    data: new Uint8Array([0, 0, 1, keyframe ? 0x65 : 0x41]),
  };
}

function input(): MediaInput {
  const bytes = new Uint8Array([0, 1, 2, 3]);
  return {
    id: 'fixture.mp4', url: 'https://suite.invalid/fixture.mp4', mime: 'video/mp4',
    mutated: false, sizeBytes: bytes.length,
    blob: async () => new Blob([bytes]), arrayBuffer: async () => bytes.slice().buffer,
  };
}

function request(operation: ConcreteOperationRequest['operation']): ConcreteOperationRequest {
  return {
    protocol: CONCRETE_OPERATION_PROTOCOL,
    scenarioId: `web-demuxer-test/${operation}`,
    operation,
    inputs: [{
      id: 'fixture.mp4', mime: 'video/mp4', container: 'mp4', mutated: false,
      tracks: [{ type: 'video', codec: 'h264', width: 1, height: 1 }],
    }],
    options: { videoTrackIndex: 0 },
  };
}

function lifecycle(signal = new AbortController().signal): LifecycleContext {
  return { signal, phase: 'functional', emit: () => undefined };
}

function operationContext(
  operation: ConcreteOperationRequest['operation'],
  signal = new AbortController().signal,
  events: OperationTelemetry[] = [],
): OperationContext {
  return { signal, phase: 'functional', request: request(operation), emit: (event) => events.push(event) };
}

async function capture(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return new Error('expected rejection');
  } catch (error) {
    return error;
  }
}

function deferred<T>(): { promise: Promise<T>; resolve(value?: T): void; reject(error: unknown): void } {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve: (value?: T) => resolve(value as T), reject };
}

function abortError(message: string): DOMException {
  return new DOMException(message, 'AbortError');
}

async function tick(): Promise<void> {
  await new Promise<void>((resolve) => queueMicrotask(resolve));
}

function restoreGlobal(name: string, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else Reflect.deleteProperty(globalThis, name);
}
