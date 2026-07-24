import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';

import {
  CONCRETE_OPERATION_PROTOCOL,
  type MediaInput,
  type OperationContext,
  type OperationTelemetry,
} from '../src/core/engine.ts';
import {
  MEDIABUNNY_CONFIG,
  MediabunnyEngine,
  PositionedByteSpool,
  type MediabunnyHlsReadTrace,
  type MediabunnyMediaBytes,
} from '../src/engines/mediabunny/adapter.ts';
import { PipelineStarvationSampler } from '../src/engines/mediabunny/internal/encoder-starvation.ts';

const MEDIA_ROOT = new URL('../fixtures/media/', import.meta.url);

async function fixture(name = 'micro_h264_1frame.mp4'): Promise<MediaInput> {
  const bytes = new Uint8Array(await readFile(new URL(name, MEDIA_ROOT)));
  return memoryInput(name, bytes);
}

function memoryInput(id: string, bytes: Uint8Array): MediaInput {
  return {
    id,
    url: `blob:mediabunny-stream/${id}`,
    mime: 'video/mp4',
    sizeBytes: bytes.byteLength,
    blob: async () => new Blob([bytes.slice()], { type: 'video/mp4' }),
    arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer,
  };
}

async function withEngine<T>(run: (engine: MediabunnyEngine) => Promise<T>): Promise<T> {
  const engine = new MediabunnyEngine();
  await engine.init();
  try {
    return await run(engine);
  } finally {
    await engine.dispose();
  }
}

function operationContext(signal: AbortSignal, events: OperationTelemetry[]): OperationContext {
  const operationStartMs = performance.now();
  return {
    signal,
    phase: 'functional',
    operationStartMs,
    emit: (event) => events.push(event),
    request: {
      protocol: CONCRETE_OPERATION_PROTOCOL,
      scenarioId: 'mediabunny-test/stream-abort',
      operation: 'remux',
      inputs: [{
        id: 'micro_h264_1frame.mp4',
        mime: 'video/mp4',
        container: 'mp4',
        mutated: false,
        tracks: [{ type: 'video', codec: 'h264', width: 320, height: 240, fps: 1 }],
      }],
      output: { container: 'mp4', videoCodec: 'h264' },
      options: { target: 'stream', fastStart: 'in-memory' },
    },
  };
}

describe('REQ-ENG-06: positioned output, explicit retention, and truthful TTFB', () => {
  test('positioned spool applies overwrites immediately without retaining a chunk list', () => {
    const spool = new PositionedByteSpool();
    spool.write(4, new Uint8Array([5, 6]));
    spool.write(0, new Uint8Array([1, 2, 3, 4]));
    spool.write(2, new Uint8Array([9, 9]));
    const bytes = spool.bytes();
    expect(bytes).toEqual(new Uint8Array([1, 2, 9, 9, 5, 6]));
    expect(bytes.byteOffset).toBe(0);
    expect(bytes.buffer.byteLength).toBe(bytes.byteLength);
    expect(spool.byteLength).toBe(6);
    expect(spool.overwriteCount).toBe(1);
    expect(() => spool.write(-1, new Uint8Array([1]))).toThrow(TypeError);
  });

  test('append-only StreamTarget bytes equal BufferTarget and expose actual native/consumer writes', async () => {
    await withEngine(async (engine) => {
      const input = await fixture();
      const buffered = await engine.remux(input, { container: 'mp4', fastStart: 'in-memory' }) as MediabunnyMediaBytes;
      const streamed = await engine.remux(input, {
        container: 'mp4',
        fastStart: 'in-memory',
        target: 'stream',
      }) as MediabunnyMediaBytes;

      expect(streamed.bytes).toEqual(buffered.bytes);
      expect(streamed.targetTelemetry).toMatchObject({
        targetKind: 'stream',
        appendOnly: true,
        overwriteCount: 0,
        finalExtentBytes: streamed.bytes.byteLength,
        completed: true,
      });
      expect(streamed.targetTelemetry?.writeCount).toBeGreaterThan(0);
      expect(streamed.targetTelemetry?.firstNativeWriteMs).toBeGreaterThanOrEqual(0);
      expect(streamed.targetTelemetry?.firstConsumerByteMs)
        .toBeGreaterThanOrEqual(streamed.targetTelemetry?.firstNativeWriteMs ?? 0);
      expect(streamed.targetTelemetry?.peakQueuedBytes).toBeLessThanOrEqual(streamed.bytes.byteLength);
      // The returned bytes remain a view over the single growable spool allocation (at most 2x
      // geometric slack), rather than an all-chunks collection plus another exact-size assembly.
      expect(streamed.bytes.buffer.byteLength).toBeLessThanOrEqual(streamed.bytes.byteLength * 2);

      expect(buffered.targetTelemetry).toMatchObject({
        targetKind: 'buffer',
        completed: true,
      });
      expect(buffered.firstByteMs).toBeGreaterThanOrEqual(buffered.targetTelemetry?.firstNativeWriteMs ?? 0);
      expect(buffered.targetTelemetry?.finalizeCompleteMs)
        .toBe(buffered.targetTelemetry?.closeMs);
    });
  });

  test('repositioning output reports overwrite facts and still reimports with identical essence', async () => {
    await withEngine(async (engine) => {
      const input = await fixture();
      const before = await engine.demux(input);
      const streamed = await engine.remux(input, { container: 'mp4', target: 'stream' }) as MediabunnyMediaBytes;
      const after = await engine.demux(memoryInput('positioned.mp4', streamed.bytes));
      expect(streamed.targetTelemetry).toMatchObject({ targetKind: 'stream', appendOnly: false, completed: true });
      expect(streamed.targetTelemetry?.overwriteCount).toBeGreaterThan(0);
      expect(after.packets.map((packet) => packet.payloadDigest))
        .toEqual(before.packets.map((packet) => packet.payloadDigest));
    });
  });

  test('target abort terminates the write path and a subsequent operation remains clean', async () => {
    await withEngine(async (engine) => {
      const input = await fixture();
      await expect(engine.remux(input, {
        container: 'mp4',
        target: 'stream',
        targetAbortAfterWrites: 0,
      })).rejects.toMatchObject({ name: 'AbortError' });
      expect((await engine.demux(input)).packets).toHaveLength(1);
    });
  });

  test('shared abort waits for cleanup and produces no post-result telemetry writes', async () => {
    await withEngine(async (engine) => {
      const input = await fixture();
      const abort = new AbortController();
      const events: OperationTelemetry[] = [];
      const operation = engine.remux(input, {
        container: 'mp4',
        target: 'stream',
        fastStart: 'in-memory',
        targetWriteDelayMs: 100,
      }, operationContext(abort.signal, events));
      setTimeout(() => abort.abort(new DOMException('test timeout', 'AbortError')), 5);
      await expect(operation).rejects.toMatchObject({ name: 'AbortError' });
      const terminalCount = events.length;
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(events).toHaveLength(terminalCount);
    });
  });
});

describe('REQ-ENG-06: mutated HLS root byte truth', () => {
  test('mutated playlist bytes are authoritative while only sidecars use the network URL', async () => {
    const names = ['hls_vod.m3u8', 'hls_vod_000.ts', 'hls_vod_001.ts', 'hls_vod_002.ts', 'hls_vod_003.ts', 'hls_vod_004.ts'];
    const files = new Map<string, Uint8Array>();
    for (const name of names) files.set(`/${name}`, new Uint8Array(await readFile(new URL(name, MEDIA_ROOT))));
    let rootNetworkReads = 0;
    let sidecarReads = 0;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (resource: RequestInfo | URL, init?: RequestInit) => {
        const request = resource instanceof Request ? resource : new Request(resource, init);
        const path = new URL(request.url).pathname;
        if (path === '/hls_vod.m3u8') rootNetworkReads++;
        else sidecarReads++;
        const bytes = files.get(path);
        if (!bytes) return new Response('not found', { status: 404 });
        const range = request.headers.get('range');
        const match = range ? /^bytes=(\d+)-(\d*)$/i.exec(range) : null;
        if (match) {
          const start = Number(match[1]);
          const end = match[2] ? Number(match[2]) : bytes.byteLength - 1;
          const body = bytes.slice(start, end + 1);
          return new Response(body, {
            status: 206,
            headers: {
              'accept-ranges': 'bytes',
              'content-length': String(body.byteLength),
              'content-range': `bytes ${start}-${end}/${bytes.byteLength}`,
            },
          });
        }
        return new Response(bytes.slice(), {
          headers: { 'accept-ranges': 'bytes', 'content-length': String(bytes.byteLength) },
        });
    }) as typeof fetch;

    try {
      const mutatedText = [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXT-X-TARGETDURATION:2',
        '#EXT-X-MEDIA-SEQUENCE:0',
        '#EXT-X-PLAYLIST-TYPE:VOD',
        '#EXTINF:2.000000,',
        'hls_vod_000.ts',
        '#EXT-X-ENDLIST',
        '',
      ].join('\n');
      const mutatedBytes = new TextEncoder().encode(mutatedText);
      const input: MediaInput = {
        id: 'mutated-hls-vod.m3u8',
        url: 'https://media.test/hls_vod.m3u8',
        mime: 'application/vnd.apple.mpegurl',
        sizeBytes: mutatedBytes.byteLength,
        mutated: true,
        blob: async () => new Blob([mutatedBytes.slice()]),
        arrayBuffer: async () => mutatedBytes.slice().buffer as ArrayBuffer,
      };
      const expectedDigest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', mutatedBytes))]
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('');

      await withEngine(async (engine) => {
        const metadata = await engine.probe(input) as typeof metadata & { sourceTrace: MediabunnyHlsReadTrace };
        expect(metadata.durationSec).toBeCloseTo(2, 3);
        expect(metadata.sourceTrace).toMatchObject({
          rootMode: 'mutated-buffer',
          rootDigest: expectedDigest,
        });
        expect(metadata.sourceTrace.reads[0]).toMatchObject({ source: 'mutated-root' });
      });
      expect(rootNetworkReads).toBe(0);
      expect(sidecarReads).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('REQ-ENG-07: measured starvation and configuration honesty', () => {
  test('dominant source/output waits and mixed pressure classify distinctly, then reset', () => {
    const sampler = new PipelineStarvationSampler();
    sampler.noteSourceWait(100);
    sampler.noteOutputWait(5);
    expect(sampler.finish().cause).toBe('source');
    expect(sampler.snapshot()).toMatchObject({ cause: 'none', sourceWaitMs: 0, outputWaitMs: 0, samples: 0 });

    sampler.noteSourceWait(5);
    sampler.noteOutputWait(100);
    expect(sampler.finish().cause).toBe('output');

    sampler.noteSourceWait(100);
    sampler.noteOutputWait(50);
    expect(sampler.finish().cause).toBe('mixed');

    sampler.noteQueues(4, 2);
    expect(sampler.finish()).toMatchObject({ cause: 'encoder', maxEncodeQueue: 4, maxDecodeQueue: 2, samples: 1 });
    expect(sampler.snapshot().cause).toBe('none');
  });

  test('real target backpressure is measured per operation and cannot leak into the next one', async () => {
    await withEngine(async (engine) => {
      const input = await fixture();
      const slow = await engine.remux(input, {
        container: 'mp4',
        fastStart: 'in-memory',
        target: 'stream',
        targetWriteDelayMs: 2,
      }) as MediabunnyMediaBytes;
      expect(slow.starvation).toMatchObject({ cause: 'output' });
      expect(slow.starvation?.outputWaitMs).toBeGreaterThan(0);

      const fresh = await engine.remux(input, {
        container: 'mp4',
        fastStart: 'in-memory',
        target: 'stream',
      }) as MediabunnyMediaBytes;
      expect(fresh.starvation).toMatchObject({ cause: 'none', outputWaitMs: 0 });
    });
  });

  test('configUsed states only backed facts and lifecycle remains idempotent', async () => {
    expect(MEDIABUNNY_CONFIG).not.toHaveProperty('queueDepth');
    expect(MEDIABUNNY_CONFIG).not.toHaveProperty('canvasPoolSize');
    expect(MEDIABUNNY_CONFIG).toMatchObject({
      packageVersions: { mediabunny: '1.48.0' },
      pipeline: 'framework-managed; cancellation and target waits observed',
      queueTelemetry: 'operation-scoped measured samples only',
    });

    const engine = new MediabunnyEngine();
    await Promise.all([engine.init(), engine.init()]);
    const snapshot = structuredClone(engine.configUsed);
    await Promise.all([engine.dispose(), engine.dispose()]);
    expect(engine.configUsed).toEqual(snapshot);
    await expect(engine.probe(await fixture())).rejects.toThrow('init() must be awaited');
  });
});
