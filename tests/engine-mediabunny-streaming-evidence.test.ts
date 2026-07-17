import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';

import {
  CONCRETE_OPERATION_PROTOCOL,
  type MediaInput,
  type OperationContext,
  type OperationPhase,
  type OperationTelemetry,
} from '../src/core/engine.ts';
import {
  MediabunnyEngine,
  type MediabunnyMediaBytes,
} from '../src/engines/mediabunny/adapter.ts';
import {
  MEDIABUNNY_REASON,
  decideMediabunnySupport,
} from '../src/engines/mediabunny/support.ts';
import {
  readStreamingRuntimeEvidence,
} from '../src/features/streaming-output/runtime.ts';
import {
  assessReserveWriteTrace,
  assessTimeToFirstByte,
  validateSinkTrace,
} from '../src/features/streaming-output/sink-trace.ts';

const MEDIA_ROOT = new URL('../fixtures/media/', import.meta.url);

async function fixture(name = 'micro_h264_1frame.mp4'): Promise<MediaInput> {
  const bytes = new Uint8Array(await readFile(new URL(name, MEDIA_ROOT)));
  return memoryInput(name, bytes);
}

function memoryInput(id: string, bytes: Uint8Array, reads?: { count: number }): MediaInput {
  return {
    id,
    url: `blob:mediabunny-streaming-evidence/${id}`,
    mime: 'video/mp4',
    sizeBytes: bytes.byteLength,
    blob: async () => {
      if (reads) reads.count++;
      return new Blob([bytes.slice()], { type: 'video/mp4' });
    },
    arrayBuffer: async () => {
      if (reads) reads.count++;
      return bytes.slice().buffer as ArrayBuffer;
    },
  };
}

function operationContext(
  options: Record<string, unknown>,
  phase: OperationPhase = 'functional',
): { context: OperationContext; events: OperationTelemetry[] } {
  const events: OperationTelemetry[] = [];
  const container = typeof options.container === 'string' ? options.container : 'mp4';
  const context: OperationContext = {
    signal: new AbortController().signal,
    phase,
    operationStartMs: performance.now(),
    emit: (event) => events.push(event),
    request: {
      protocol: CONCRETE_OPERATION_PROTOCOL,
      scenarioId: 'streaming-output/mediabunny-adapter-evidence',
      operation: 'remux',
      inputs: [{
        id: 'micro_h264_1frame.mp4',
        mime: 'video/mp4',
        container: 'mp4',
        mutated: false,
        tracks: [{ type: 'video', codec: 'h264', width: 320, height: 240, fps: 1 }],
      }],
      output: { container, videoCodec: 'h264' },
      options,
    },
  };
  return { context, events };
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

function requireEvidence(output: MediabunnyMediaBytes) {
  const read = readStreamingRuntimeEvidence(output);
  expect(read.state).toBe('OK');
  if (read.state !== 'OK' || !read.evidence.sinkTrace) {
    throw new Error('expected valid output-attached streaming evidence');
  }
  return { evidence: read.evidence, trace: read.evidence.sinkTrace };
}

describe('Mediabunny production streaming-output evidence boundary', () => {
  for (const phase of ['functional', 'measured'] as const) {
    test(`${phase} StreamTarget exposes absolute real writes and honest full-spool retention`, async () => {
      await withEngine(async (engine) => {
        const options = { container: 'mp4', target: 'stream', fastStart: 'in-memory' };
        const { context } = operationContext(options, phase);
        const output = await engine.remux(await fixture(), options, context) as MediabunnyMediaBytes;
        const { evidence, trace } = requireEvidence(output);

        expect(trace.events[0]).toEqual({
          type: 'operation-start',
          sequence: 0,
          atMs: context.operationStartMs,
        });
        const writes = trace.events.filter((event) => event.type === 'write');
        expect(writes.length).toBeGreaterThan(0);
        expect(writes.every((event) => event.length > 0 && event.atMs >= context.operationStartMs)).toBe(true);
        expect(trace.maximumOutstandingWritePromises).toBe(1);
        expect(trace.maximumQueuedBytes).toBeGreaterThan(0);
        expect(trace.retainedOutputBytes).toBe(output.bytes.buffer.byteLength);
        expect(trace.retainedOutputBytes).toBeGreaterThanOrEqual(output.bytes.byteLength);
        expect(evidence).toMatchObject({
          resolvedRepresentation: 'faststart-in-memory-mp4',
          observerPolicy: 'mediabunny-streamtarget-positioned-spool@1',
          retainedOutputPolicy: 'full-output-positioned-spool',
          measurementContract: 'media-test/streaming-output-measure@1',
        });
        expect(validateSinkTrace(trace, {
          target: 'stream',
          appendOnly: true,
          requireAwaitedBackpressure: true,
        })).toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
        expect(assessTimeToFirstByte(trace)).toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
        const firstWrite = writes[0]!;
        expect(output.firstByteMs).toBe(firstWrite.atMs - context.operationStartMs);
        expect(trace.events.at(-2)?.type).toBe('finalize-complete');
        expect(trace.events.at(-1)?.type).toBe('close');
      });
    });
  }

  test('BufferTarget first byte is the finalized buffer callback, not an internal mux write', async () => {
    await withEngine(async (engine) => {
      const options = { container: 'mp4', target: 'buffer', fastStart: 'in-memory' };
      const { context, events } = operationContext(options);
      const output = await engine.remux(await fixture(), options, context) as MediabunnyMediaBytes;
      const { evidence, trace } = requireEvidence(output);
      const observable = trace.events.find((event) => event.type === 'buffer-observable');
      const finalized = trace.events.find((event) => event.type === 'finalize-complete');
      const firstByte = events.find((event) => event.type === 'first-byte');

      expect(observable).toBeDefined();
      expect(observable?.atMs).toBe(finalized?.atMs);
      expect(observable?.length).toBe(output.bytes.byteLength);
      expect(firstByte?.atMs).toBe(output.firstByteMs);
      expect(output.firstByteMs).toBe((observable?.atMs ?? 0) - context.operationStartMs);
      expect(output.firstByteMs).toBeGreaterThanOrEqual(output.targetTelemetry?.firstNativeWriteMs ?? 0);
      expect(evidence).toMatchObject({
        observerPolicy: 'mediabunny-buffertarget-finalized-buffer@1',
        retainedOutputPolicy: 'full-output-finalized-buffer',
      });
      expect(validateSinkTrace(trace, { target: 'buffer' }))
        .toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
      expect(assessTimeToFirstByte(trace)).toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
    });
  });

  test('reserve mode propagates the requested per-track bound and exposes only observed positioning', async () => {
    await withEngine(async (engine) => {
      const options = {
        container: 'mp4',
        target: 'stream',
        fastStart: 'reserve',
        maximumPacketCount: 1,
      };
      const { context } = operationContext(options);
      const output = await engine.remux(await fixture(), options, context) as MediabunnyMediaBytes;
      const { evidence, trace } = requireEvidence(output);

      expect(evidence.observedPacketCount).toBe(1);
      expect(evidence.reserveCompletion).toBe('COMPLETED');
      expect(output.targetTelemetry).toMatchObject({
        reserveMaximumPacketCount: 1,
        reserveTrackPacketCounts: [1],
      });
      expect(trace.events.filter((event) => event.type === 'reservation')).toHaveLength(1);
      expect(assessReserveWriteTrace(trace, {
        maximumPacketCount: 1,
        observedPacketCount: 1,
        completion: 'COMPLETED',
      })).toMatchObject({ state: 'VERDICT', verdict: 'PASS', reasonCode: 'RESERVE_EXACT_FIT_VALID' });
    });
  });

  test('exact writeChunkBytes is typed NA_ENGINE before source materialization', async () => {
    await withEngine(async (engine) => {
      const bytes = new Uint8Array(await readFile(new URL('micro_h264_1frame.mp4', MEDIA_ROOT)));
      const reads = { count: 0 };
      const input = memoryInput('micro_h264_1frame.mp4', bytes, reads);
      const options = { container: 'ts', target: 'stream', writeChunkBytes: 188 };
      const { context } = operationContext(options);
      context.request.output = { container: 'ts', videoCodec: 'h264' };

      await expect(engine.remux(input, options, context)).rejects.toMatchObject({
        name: 'NotApplicableError',
        reasonCode: MEDIABUNNY_REASON.WRITE_GRANULARITY,
      });
      expect(reads.count).toBe(0);
      expect(decideMediabunnySupport(context.request)).toMatchObject({
        supported: false,
        status: 'NA_ENGINE',
        reasonCode: MEDIABUNNY_REASON.WRITE_GRANULARITY,
      });
    });
  });

  test('malformed streaming option values remain errors rather than applicability misses', () => {
    const malformedChunk = operationContext({
      container: 'ts',
      target: 'stream',
      writeChunkBytes: 0,
    }).context.request;
    const malformedReserve = operationContext({
      container: 'mp4',
      target: 'stream',
      fastStart: 'reserve',
    }).context.request;
    expect(() => decideMediabunnySupport(malformedChunk)).toThrow(TypeError);
    expect(() => decideMediabunnySupport(malformedReserve)).toThrow(TypeError);
  });

  test('reserve overflow is bounded and classified instead of silently changing algorithms', async () => {
    await withEngine(async (engine) => {
      const input = await fixture('video_2x2_h264.mp4');
      const options = {
        container: 'mp4',
        target: 'stream',
        fastStart: 'reserve',
        maximumPacketCount: 1,
      };
      const { context } = operationContext(options);
      await expect(engine.remux(input, options, context)).rejects.toMatchObject({
        name: 'MediabunnyReserveOverflowError',
        message: expect.stringContaining('MEDIABUNNY_RESERVE_PACKET_BOUND_EXCEEDED'),
      });
    });
  });
});
