import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import {
  CONCRETE_OPERATION_PROTOCOL,
  validateOperationTelemetry,
  type ConcreteOperationRequest,
  type MediaInput,
  type NormalizedTrack,
  type OperationTelemetry,
} from '../src/core/engine.ts';
import {
  readStreamingRuntimeEvidence,
  STREAMING_RUNTIME_EVIDENCE_SCHEMA,
} from '../src/features/streaming-output/runtime.ts';
import {
  assessReserveWriteTrace,
  readTimeToFirstByteSample,
  validateSinkTrace,
} from '../src/features/streaming-output/sink-trace.ts';
import { assessLiveWebm } from '../src/features/streaming-output/live-webm.ts';
import { validateMuxWriteTrace } from '../src/features/mux/output-mode.ts';
import {
  assessSparseMuxTarget,
  createSparseMuxTarget,
  MUX_SPARSE_CO64_ACCEPTANCE_CASE,
} from '../src/features/mux/large-file.ts';
import {
  AibrushCallbackAccumulator,
  AibrushSinkTraceRecorder,
  type AibrushStreamingRuntimeEvidence,
} from '../src/engines/aibrush-media/output-target.ts';
import {
  AibrushMediaEngine,
  publishAibrushMultipartStreamArtifact,
} from '../src/engines/aibrush-media/adapter.ts';
import {
  verifyAibrushLiveWebmShape,
  verifyAibrushOutputShape,
} from '../src/engines/aibrush-media/output-shape.ts';
import { decideAibrushSupport } from '../src/engines/aibrush-media/support.ts';

const VIDEO: NormalizedTrack = { type: 'video', codec: 'h264', width: 1_920, height: 1_080 };
const AUDIO: NormalizedTrack = { type: 'audio', codec: 'aac', sampleRate: 48_000, channels: 2 };

describe('aibrush-media streaming-output production boundary', () => {
  test('records genuine absolute callback writes and reports full-output concatenation retention', () => {
    let now = 101;
    const accumulator = new AibrushCallbackAccumulator({ operationStartMs: 100, now: () => now });
    accumulator.write(new Uint8Array([1, 2]), 0);
    now = 102;
    accumulator.write(new Uint8Array([3]), 2);
    now = 105;
    accumulator.recorder.beginFinalize();
    const bytes = accumulator.materialize();
    now = 106;
    const trace = accumulator.recorder.complete('stream', accumulator.evidence.peakRetainedBytes)!;

    expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(trace.events).toEqual([
      { type: 'operation-start', sequence: 0, atMs: 100 },
      { type: 'write', sequence: 1, atMs: 101, position: 0, length: 2, cumulativeUniqueBytes: 2, outstandingWritePromises: 1 },
      { type: 'write', sequence: 2, atMs: 102, position: 2, length: 1, cumulativeUniqueBytes: 3, outstandingWritePromises: 1 },
      { type: 'finalize-start', sequence: 3, atMs: 105 },
      { type: 'finalize-complete', sequence: 4, atMs: 106 },
      { type: 'close', sequence: 5, atMs: 106 },
    ]);
    expect(trace).toMatchObject({
      totalUniqueBytes: 3,
      nativeWriteBytes: 3,
      maximumOutstandingWritePromises: 1,
      maximumQueuedBytes: 2,
      // Callback chunks (3) and final contiguous bytes (3) coexist during materialization.
      retainedOutputBytes: 6,
      validationPrefix: new Uint8Array([1, 2, 3]),
      validationTail: new Uint8Array([1, 2, 3]),
    });
    expect(validateSinkTrace(trace, {
      target: 'stream', appendOnly: true, requireAwaitedBackpressure: true, requireNonEmpty: true,
    })).toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
    expect(readTimeToFirstByteSample(trace)).toMatchObject({
      available: true,
      operationStartMs: 100,
      firstObservableByteMs: 101,
      finalizeMs: 106,
      timeToFirstByteMs: 1,
    });
  });

  test('reconstructs positioned writes and proves one forward reservation followed by a patch', () => {
    let now = 1;
    const accumulator = new AibrushCallbackAccumulator({
      operationStartMs: 0,
      now: () => now++,
      maximumPacketCount: 4,
    });
    accumulator.write(new Uint8Array([1, 2]), 0);
    accumulator.write(new Uint8Array([7, 8]), 6);
    accumulator.write(new Uint8Array([3, 4, 5, 6]), 2);
    accumulator.recorder.beginFinalize();
    const bytes = accumulator.materialize();
    const trace = accumulator.recorder.complete(
      'stream',
      accumulator.evidence.peakRetainedBytes,
      bytes,
    )!;

    expect(bytes).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(trace.events).toEqual([
      { type: 'operation-start', sequence: 0, atMs: 0 },
      { type: 'write', sequence: 1, atMs: 1, position: 0, length: 2, cumulativeUniqueBytes: 2, outstandingWritePromises: 1 },
      { type: 'reservation', sequence: 2, atMs: 2, position: 2, length: 4, maximumPacketCount: 4 },
      { type: 'write', sequence: 3, atMs: 3, position: 6, length: 2, cumulativeUniqueBytes: 4, outstandingWritePromises: 1 },
      { type: 'write', sequence: 4, atMs: 4, position: 2, length: 4, cumulativeUniqueBytes: 8, outstandingWritePromises: 1 },
      { type: 'finalize-start', sequence: 5, atMs: 5 },
      { type: 'finalize-complete', sequence: 6, atMs: 6 },
      { type: 'close', sequence: 7, atMs: 7 },
    ]);
    expect(validateSinkTrace(trace, {
      target: 'stream', appendOnly: false, requireAwaitedBackpressure: true,
    })).toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
    expect(assessReserveWriteTrace(trace, {
      maximumPacketCount: 4,
      observedPacketCount: 2,
      completion: 'COMPLETED',
    })).toMatchObject({ state: 'VERDICT', verdict: 'PASS', reasonCode: 'RESERVE_UNDERFILL_VALID' });
  });

  test('buffer observability occurs only at finalize and survives the runtime evidence reader', () => {
    let now = 51;
    const recorder = new AibrushSinkTraceRecorder({ operationStartMs: 50, now: () => now });
    recorder.write(new Uint8Array([0xaa, 0xbb]), 0);
    now = 60;
    recorder.beginFinalize();
    now = 61;
    const trace = recorder.complete('buffer', 2)!;
    const streamingEvidence: AibrushStreamingRuntimeEvidence = {
      schema: STREAMING_RUNTIME_EVIDENCE_SCHEMA,
      sinkTrace: trace,
      resolvedRepresentation: 'fragmented-mp4',
      observerPolicy: 'aibrush-framework-output-materialization-observer@1',
      retainedOutputPolicy: 'whole-output-framework-materialization',
      measurementContract: 'media-test/streaming-output-measurement@1',
    };

    expect(trace.events.filter((event) => event.type === 'buffer-observable')).toEqual([
      { type: 'buffer-observable', sequence: 3, atMs: 61, length: 2 },
    ]);
    expect(readTimeToFirstByteSample(trace)).toMatchObject({
      available: true,
      target: 'buffer',
      timeToFirstByteMs: 11,
      firstObservableByteMs: 61,
    });
    expect(readStreamingRuntimeEvidence({
      bytes: new Uint8Array([0xaa, 0xbb]),
      mime: 'video/mp4',
      container: 'mp4',
      streamingEvidence,
    })).toMatchObject({
      state: 'OK',
      source: 'output-envelope',
      evidence: {
        resolvedRepresentation: 'fragmented-mp4',
        retainedOutputPolicy: 'whole-output-framework-materialization',
      },
    });
  });

  test('publishes owned stream parts through bounded exact ranges without a contiguous output copy', async () => {
    let now = 1;
    const recorder = new AibrushSinkTraceRecorder({ operationStartMs: 0, now: () => now++ });
    const chunks = [
      new Uint8Array([0, 1, 2]),
      new Uint8Array([3]),
      new Uint8Array([4, 5, 6, 7]),
    ];
    const output = new ReadableStream<Uint8Array>({
      start(controller): void {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    });

    const published = await publishAibrushMultipartStreamArtifact(output, 'mp4', recorder);
    expect(published.media.bytes).toEqual(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(published.media.artifact?.byteLength).toBe(8);
    expect(await published.media.artifact?.range(2, 7)).toEqual(new Uint8Array([2, 3, 4, 5, 6]));
    expect(await published.media.artifact?.range(-10, 99)).toEqual(
      new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]),
    );
    expect(published.peakRetainedBytes).toBeGreaterThanOrEqual(8);

    const trace = recorder.complete('buffer', published.peakRetainedBytes)!;
    expect(trace).toMatchObject({
      totalUniqueBytes: 8,
      nativeWriteBytes: 8,
      validationPrefix: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]),
      validationTail: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]),
    });
  });

  test('omits a trace when no runner-owned origin exists instead of inventing an adapter clock', () => {
    const recorder = new AibrushSinkTraceRecorder();
    recorder.write(new Uint8Array([1]), 0);
    recorder.beginFinalize();
    expect(recorder.complete('stream', 1)).toBeUndefined();
  });

  test('live WebM verifier recognizes the unknown-size sentinel before numeric safety checks', () => {
    const ebml = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x80]);
    const unknownSegment = new Uint8Array([0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
    const cluster = new Uint8Array([0x1f, 0x43, 0xb6, 0x75, 0x80]);
    const live = joinBytes(ebml, unknownSegment, cluster);
    expect(verifyAibrushLiveWebmShape(live)).toMatchObject({ clusterCount: 1, segmentOffset: ebml.byteLength });

    const cues = new Uint8Array([0x1c, 0x53, 0xbb, 0x6b, 0x80]);
    expect(() => verifyAibrushLiveWebmShape(joinBytes(ebml, unknownSegment, cues, cluster)))
      .toThrow('forbidden Cues');
    const durationInfo = new Uint8Array([0x15, 0x49, 0xa9, 0x66, 0x83, 0x44, 0x89, 0x80]);
    expect(() => verifyAibrushLiveWebmShape(joinBytes(ebml, unknownSegment, durationInfo, cluster)))
      .toThrow('forbidden finalized Duration');
  });

  test('rejects unhonored sink modes in tuple preflight with stable NA_ENGINE reasons', () => {
    const rows: Array<[Record<string, unknown>, string, string]> = [
      [{ target: 'buffer', fastStart: 'reserve', maximumPacketCount: 4_096 }, 'mp4', 'AIBRUSH_POSITIONED_RESERVE_REQUIRES_STREAM_TARGET'],
      [{ target: 'buffer', positionedWrites: true }, 'mp4', 'AIBRUSH_POSITIONED_WRITES_REQUIRE_STREAM_TARGET'],
      [{ target: 'buffer', fragmented: true, appendOnly: false }, 'webm', 'AIBRUSH_WEBM_FRAGMENTED_WITHOUT_LIVE_UNSUPPORTED'],
    ];
    for (const [options, container, reasonCode] of rows) {
      expect(decideAibrushSupport(remuxRequest(container, options))).toMatchObject({
        supported: false,
        status: 'NA_ENGINE',
        reasonCode,
      });
    }
  });

  test('admits exact writes, positioned reserve, and both finite and live WebM stream tuples', () => {
    expect(decideAibrushSupport(remuxRequest('ts', {
      target: 'stream', writeChunkBytes: 188,
    }))).toEqual({ supported: true });
    expect(decideAibrushSupport(remuxRequest('mp4', {
      target: 'stream', fragmented: false, fastStart: false,
    }))).toEqual({ supported: true });
    expect(decideAibrushSupport(remuxRequest('mp4', {
      target: 'stream', fastStart: 'reserve', maximumPacketCount: 4_096,
    }))).toEqual({ supported: true });
    expect(decideAibrushSupport(remuxRequest('webm', {
      target: 'stream', appendOnly: false,
    }, [
      { type: 'video', codec: 'vp9' },
      { type: 'audio', codec: 'opus' },
    ]))).toEqual({ supported: true });
    expect(decideAibrushSupport(remuxRequest('webm', {
      target: 'stream', appendOnly: true,
    }, [
      { type: 'video', codec: 'vp9' },
      { type: 'audio', codec: 'opus' },
    ]))).toEqual({ supported: true });
  });

  test('real TS callback remux forwards exact packet-sized write shaping', async () => {
    const bytes = new Uint8Array(await readFile(new URL('../fixtures/media/h264_ts.ts', import.meta.url)));
    const input: MediaInput = {
      id: 'h264_ts.ts',
      url: 'https://fixtures.invalid/h264_ts.ts',
      mime: 'video/mp2t',
      sizeBytes: bytes.byteLength,
      mutated: true,
      blob: () => Promise.resolve(new Blob([bytes])),
      arrayBuffer: () => Promise.resolve(bytes.slice().buffer),
    };
    const controller = new AbortController();
    const request = remuxRequest('ts', { target: 'stream', writeChunkBytes: 188 });
    const engine = new AibrushMediaEngine();
    const lifecycle = {
      signal: controller.signal,
      phase: 'functional' as const,
      emit: () => undefined,
    };
    await engine.init(lifecycle);
    try {
      const output = await engine.remux(input, {
        container: 'ts', target: 'stream', writeChunkBytes: 188,
      } as Parameters<AibrushMediaEngine['remux']>[1], {
        ...lifecycle,
        request,
        operationStartMs: performance.now(),
      });
      const evidence = readStreamingRuntimeEvidence(output);
      const trace = evidence.state === 'OK' ? evidence.evidence.sinkTrace : undefined;
      expect(trace && validateSinkTrace(trace, {
        target: 'stream',
        appendOnly: true,
        writeChunkBytes: 188,
        requireAwaitedBackpressure: true,
        requireNonEmpty: true,
      })).toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
      expect(trace?.events
        .filter((event) => event.type === 'write')
        .every((event) => event.length === 188)).toBe(true);
      expect(output.bytes.byteLength % 188).toBe(0);
    } finally {
      await engine.dispose(lifecycle);
    }
  });

  test('real reserved MP4 remux forwards the packet bound and exposes a forward patch trace', async () => {
    const bytes = new Uint8Array(await readFile(new URL('../fixtures/media/micro_h264_1frame.mp4', import.meta.url)));
    const input = inMemoryInput('micro_h264_1frame.mp4', 'video/mp4', bytes);
    const controller = new AbortController();
    const request = remuxRequest('mp4', {
      target: 'stream', fastStart: 'reserve', maximumPacketCount: 16,
    }, [VIDEO]);
    const engine = new AibrushMediaEngine();
    const lifecycle = {
      signal: controller.signal,
      phase: 'functional' as const,
      emit: () => undefined,
    };
    await engine.init(lifecycle);
    try {
      const output = await engine.remux(input, {
        container: 'mp4',
        target: 'stream',
        fastStart: 'reserve',
        maximumPacketCount: 16,
      } as Parameters<AibrushMediaEngine['remux']>[1], {
        ...lifecycle,
        request,
        operationStartMs: performance.now(),
      });
      const evidence = readStreamingRuntimeEvidence(output);
      expect(evidence).toMatchObject({
        state: 'OK',
        evidence: {
          resolvedRepresentation: 'faststart-reserve-mp4',
          observedPacketCount: 1,
          reserveCompletion: 'COMPLETED',
        },
      });
      const trace = evidence.state === 'OK' ? evidence.evidence.sinkTrace : undefined;
      expect(trace && validateSinkTrace(trace, {
        target: 'stream', appendOnly: false, requireAwaitedBackpressure: true,
      })).toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
      expect(trace && assessReserveWriteTrace(trace, {
        maximumPacketCount: 16,
        observedPacketCount: 1,
        completion: 'COMPLETED',
      })).toMatchObject({ state: 'VERDICT', verdict: 'PASS', reasonCode: 'RESERVE_UNDERFILL_VALID' });
      expect(verifyAibrushOutputShape(output.bytes, {
        container: 'mp4', fragmented: false, fastStart: true,
      })).toMatchObject({ kind: 'progressive-faststart' });
    } finally {
      await engine.dispose(lifecycle);
    }
  });

  test('real reserved MP4 mux retains its positioned reservation and patch evidence', async () => {
    const bytes = new Uint8Array(await readFile(new URL('../fixtures/media/tiny_h264_360p_2s.mp4', import.meta.url)));
    const input = inMemoryInput('tiny_h264_360p_2s.mp4', 'video/mp4', bytes);
    const controller = new AbortController();
    const request: ConcreteOperationRequest = {
      ...remuxRequest('mp4', {
        target: 'stream', fastStart: 'reserve', maximumPacketCount: 4_096,
      }, [VIDEO, AUDIO]),
      scenarioId: 'mux/aibrush-reserve-boundary-test',
      operation: 'mux',
    };
    const engine = new AibrushMediaEngine();
    const lifecycle = {
      signal: controller.signal,
      phase: 'functional' as const,
      emit: () => undefined,
    };
    const context = {
      ...lifecycle,
      request,
      operationStartMs: performance.now(),
    };
    await engine.init(lifecycle);
    try {
      const tracks = await engine.prepareMuxTracks([input], { container: 'mp4' }, context);
      const output = await engine.mux(tracks, {
        container: 'mp4',
        target: 'stream',
        fastStart: 'reserve',
        maximumPacketCount: 4_096,
      }, context);
      expect(output.muxWriteTrace).toBeDefined();
      expect(output.muxWriteTrace && validateMuxWriteTrace(
        output.muxWriteTrace,
        output.bytes,
        true,
      )).toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
      expect(output.muxWriteTrace?.reservations).toHaveLength(1);
      expect(output.muxWriteTrace?.writes.some((write) => write.kind === 'patch')).toBe(true);
    } finally {
      await engine.dispose(lifecycle);
    }
  });

  test('real sparse MP4 mux authors source-bound packets through co64 and rejects prefix drift', async () => {
    const bytes = new Uint8Array(
      await readFile(new URL('../fixtures/media/tiny_h264_360p_2s.mp4', import.meta.url)),
    );
    const input = inMemoryInput('tiny_h264_360p_2s.mp4', 'video/mp4', bytes);
    const baseContract = MUX_SPARSE_CO64_ACCEPTANCE_CASE.contract;

    const run = async (prefixHex: string) => {
      const contract = {
        ...baseContract,
        expectedSamples: [
          { ...baseContract.expectedSamples[0]!, prefixHex },
          baseContract.expectedSamples[1]!,
        ],
      };
      const sparseTarget = createSparseMuxTarget();
      const controller = new AbortController();
      const options = {
        container: 'mp4',
        trackSelect: ['video:0'],
        sparseTarget,
        robustness: { muxLargeFile: contract },
      };
      const request: ConcreteOperationRequest = {
        ...remuxRequest('mp4', options, [
          { type: 'video', codec: 'h264', width: 640, height: 360 },
          { type: 'audio', codec: 'aac', sampleRate: 44_100, channels: 2 },
        ]),
        scenarioId: 'mux/source-bound-sparse-co64',
        operation: 'mux',
      };
      const lifecycle = {
        signal: controller.signal,
        phase: 'functional' as const,
        emit: () => undefined,
      };
      const context = { ...lifecycle, request, operationStartMs: performance.now() };
      const engine = new AibrushMediaEngine();
      await engine.init(lifecycle);
      try {
        const tracks = await engine.prepareMuxTracks([input], options, context);
        const output = await engine.mux(tracks, options, context);
        return { output, target: sparseTarget, contract };
      } finally {
        await engine.dispose(lifecycle);
      }
    };

    const passing = await run(baseContract.expectedSamples[0]!.prefixHex);
    expect(passing.output.bytes.byteLength).toBeLessThan(4_096);
    expect(assessSparseMuxTarget(passing.target, passing.contract).decision).toMatchObject({
      state: 'VERDICT',
      verdict: 'PASS',
      reasonCode: 'MUX_CO64_LARGE_FILE_ADDRESSING_VALID',
      measurements: {
        offsetsBelowUint32: 1,
        offsetsAboveUint32: 1,
        samplePrefixesVerified: 2,
        largeSizeBoxes: 1,
      },
    });

    await expect(run(`ff${baseContract.expectedSamples[0]!.prefixHex.slice(2)}`)).rejects.toThrow(
      /source packet 0 does not match/,
    );
  });

  test('real finite WebM remux publishes incrementally observed valid final bytes', async () => {
    const bytes = new Uint8Array(await readFile(new URL('../fixtures/media/tiny_vp9_360p_2s.webm', import.meta.url)));
    const input = inMemoryInput('tiny_vp9_360p_2s.webm', 'video/webm', bytes);
    const controller = new AbortController();
    const request = remuxRequest('webm', { target: 'stream', appendOnly: false }, [
      { type: 'video', codec: 'vp9' }, { type: 'audio', codec: 'opus' },
    ]);
    const engine = new AibrushMediaEngine();
    const lifecycle = {
      signal: controller.signal,
      phase: 'functional' as const,
      emit: () => undefined,
    };
    await engine.init(lifecycle);
    try {
      const output = await engine.remux(input, {
        container: 'webm', target: 'stream', appendOnly: false,
      } as Parameters<AibrushMediaEngine['remux']>[1], {
        ...lifecycle,
        request,
        operationStartMs: performance.now(),
      });
      const evidence = readStreamingRuntimeEvidence(output);
      expect(evidence).toMatchObject({
        state: 'OK',
        evidence: { resolvedRepresentation: 'finite-webm' },
      });
      const trace = evidence.state === 'OK' ? evidence.evidence.sinkTrace : undefined;
      expect(trace && validateSinkTrace(trace, {
        target: 'stream', appendOnly: false, requireAwaitedBackpressure: true,
      })).toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
      const writes = trace?.events.filter((event) => event.type === 'write') ?? [];
      expect(writes.length).toBeGreaterThan(0);
      expect(output.bytes.subarray(0, 4)).toEqual(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]));
    } finally {
      await engine.dispose(lifecycle);
    }
  });

  test('real progressive callback remux attaches trace evidence and matching operation telemetry', async () => {
    const bytes = new Uint8Array(await readFile(new URL('../fixtures/media/micro_h264_1frame.mp4', import.meta.url)));
    const input: MediaInput = {
      id: 'micro_h264_1frame.mp4',
      url: 'https://fixtures.invalid/micro_h264_1frame.mp4',
      mime: 'video/mp4',
      sizeBytes: bytes.byteLength,
      // Force this integration check through deterministic bytes rather than a network range source.
      mutated: true,
      blob: () => Promise.resolve(new Blob([bytes])),
      arrayBuffer: () => Promise.resolve(bytes.slice().buffer),
    };
    const controller = new AbortController();
    const events: OperationTelemetry[] = [];
    const request = remuxRequest('mp4', { target: 'stream', fragmented: false, fastStart: false });
    const engine = new AibrushMediaEngine();
    const lifecycle = {
      signal: controller.signal,
      phase: 'functional' as const,
      emit: (event: OperationTelemetry) => events.push(event),
    };
    await engine.init(lifecycle);
    try {
      const output = await engine.remux(input, {
        container: 'mp4', target: 'stream', fragmented: false, fastStart: false,
      } as Parameters<AibrushMediaEngine['remux']>[1], {
        ...lifecycle,
        request,
        operationStartMs: performance.now(),
      });
      const evidence = readStreamingRuntimeEvidence(output);
      expect(evidence).toMatchObject({
        state: 'OK',
        source: 'output-envelope',
        evidence: {
          resolvedRepresentation: 'progressive-mp4',
          retainedOutputPolicy: 'whole-output-callback-write-retention-and-final-reconstruction',
        },
      });
      expect(output.telemetry).toMatchObject({
        bytesWritten: output.bytes.byteLength,
        writeCount: output.targetWrites,
        firstByteMs: output.firstByteMs,
      });
      expect(events.filter((event) => event.type === 'first-byte')).toHaveLength(1);
      expect(events.at(-1)).toMatchObject({ type: 'write-count', count: output.targetWrites });
      expect(() => validateOperationTelemetry('aibrush-media@dev', events, output.telemetry))
        .not.toThrow();
      const trace = evidence.state === 'OK' ? evidence.evidence.sinkTrace : undefined;
      expect(trace && validateSinkTrace(trace, {
        target: 'stream', appendOnly: true, requireAwaitedBackpressure: true, requireNonEmpty: true,
      })).toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
      // Full bytes are intentionally retained today; this adapter must never label this path bounded.
      expect(trace?.retainedOutputBytes).toBeGreaterThanOrEqual(output.bytes.byteLength);
    } finally {
      await engine.dispose(lifecycle);
    }
  });

  test('real fragmented buffer remux timestamps first observability at finalize', async () => {
    const bytes = new Uint8Array(await readFile(new URL('../fixtures/media/micro_h264_1frame.mp4', import.meta.url)));
    const input: MediaInput = {
      id: 'micro_h264_1frame.mp4',
      url: 'https://fixtures.invalid/micro_h264_1frame.mp4',
      mime: 'video/mp4',
      sizeBytes: bytes.byteLength,
      mutated: true,
      blob: () => Promise.resolve(new Blob([bytes])),
      arrayBuffer: () => Promise.resolve(bytes.slice().buffer),
    };
    const controller = new AbortController();
    const events: OperationTelemetry[] = [];
    const request = remuxRequest('mp4', { target: 'buffer', fragmented: true });
    const engine = new AibrushMediaEngine();
    const lifecycle = {
      signal: controller.signal,
      phase: 'functional' as const,
      emit: (event: OperationTelemetry) => events.push(event),
    };
    await engine.init(lifecycle);
    try {
      const output = await engine.remux(input, {
        container: 'mp4', target: 'buffer', fragmented: true,
      } as Parameters<AibrushMediaEngine['remux']>[1], {
        ...lifecycle,
        request,
        operationStartMs: performance.now(),
      });
      const evidence = readStreamingRuntimeEvidence(output);
      expect(evidence).toMatchObject({
        state: 'OK',
        evidence: {
          resolvedRepresentation: 'fragmented-mp4',
          retainedOutputPolicy: 'whole-output-framework-materialization',
        },
      });
      const trace = evidence.state === 'OK' ? evidence.evidence.sinkTrace : undefined;
      expect(trace && validateSinkTrace(trace, { target: 'buffer', requireNonEmpty: true }))
        .toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
      const sample = readTimeToFirstByteSample(trace);
      expect(sample).toMatchObject({ available: true, target: 'buffer' });
      if (sample.available) expect(sample.firstObservableByteMs).toBe(sample.finalizeMs);
      expect(events.filter((event) => event.type === 'first-byte')).toHaveLength(1);
      expect(() => validateOperationTelemetry('aibrush-media@dev', events, output.telemetry))
        .not.toThrow();
      expect(trace?.retainedOutputBytes).toBeGreaterThanOrEqual(output.bytes.byteLength);
    } finally {
      await engine.dispose(lifecycle);
    }
  });

  test('real append-only WebM callback output resolves as live and satisfies the live shape verifier', async () => {
    const restoreChunks = installEncodedChunkShims();
    const bytes = new Uint8Array(await readFile(new URL('../fixtures/media/tiny_vp9_360p_2s.webm', import.meta.url)));
    const input: MediaInput = {
      id: 'tiny_vp9_360p_2s.webm',
      url: 'https://fixtures.invalid/tiny_vp9_360p_2s.webm',
      mime: 'video/webm',
      sizeBytes: bytes.byteLength,
      mutated: true,
      blob: () => Promise.resolve(new Blob([bytes])),
      arrayBuffer: () => Promise.resolve(bytes.slice().buffer),
    };
    const controller = new AbortController();
    const events: OperationTelemetry[] = [];
    const request = remuxRequest('webm', { target: 'stream', appendOnly: true }, [
      { type: 'video', codec: 'vp9' }, { type: 'audio', codec: 'opus' },
    ]);
    const engine = new AibrushMediaEngine();
    const lifecycle = {
      signal: controller.signal,
      phase: 'functional' as const,
      emit: (event: OperationTelemetry) => events.push(event),
    };
    await engine.init(lifecycle);
    try {
      const output = await engine.remux(input, {
        container: 'webm', target: 'stream', appendOnly: true,
      } as Parameters<AibrushMediaEngine['remux']>[1], {
        ...lifecycle,
        request,
        operationStartMs: performance.now(),
      });
      const evidence = readStreamingRuntimeEvidence(output);
      expect(evidence).toMatchObject({
        state: 'OK',
        evidence: { resolvedRepresentation: 'live-webm' },
      });
      const trace = evidence.state === 'OK' ? evidence.evidence.sinkTrace : undefined;
      expect(trace && validateSinkTrace(trace, {
        target: 'stream', appendOnly: true, requireAwaitedBackpressure: true, requireNonEmpty: true,
      })).toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
      expect(verifyAibrushLiveWebmShape(output.bytes)).toMatchObject({ clusterCount: expect.any(Number) });
      expect(await assessLiveWebm(output.bytes)).toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
      expect(trace?.retainedOutputBytes).toBeGreaterThanOrEqual(output.bytes.byteLength);
    } finally {
      await engine.dispose(lifecycle);
      restoreChunks();
    }
  });
});

/** Bun has no WebCodecs; the live WebM stream copy only needs the chunk constructors' data contract. */
class TestEncodedChunk {
  readonly type: string;
  readonly timestamp: number;
  readonly duration: number | null;
  readonly byteLength: number;
  readonly #data: Uint8Array;
  constructor(init: { type: string; timestamp: number; duration?: number | null; data: BufferSource }) {
    this.type = init.type;
    this.timestamp = init.timestamp;
    this.duration = init.duration ?? null;
    const d = init.data;
    this.#data = ArrayBuffer.isView(d)
      ? new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength))
      : new Uint8Array((d as ArrayBuffer).slice(0));
    this.byteLength = this.#data.byteLength;
  }
  copyTo(destination: ArrayBuffer | ArrayBufferView): void {
    const view = ArrayBuffer.isView(destination)
      ? new Uint8Array(destination.buffer, destination.byteOffset, destination.byteLength)
      : new Uint8Array(destination);
    view.set(this.#data);
  }
}

function installEncodedChunkShims(): () => void {
  const previous = {
    video: Object.getOwnPropertyDescriptor(globalThis, 'EncodedVideoChunk'),
    audio: Object.getOwnPropertyDescriptor(globalThis, 'EncodedAudioChunk'),
  };
  Object.defineProperty(globalThis, 'EncodedVideoChunk', { configurable: true, writable: true, value: TestEncodedChunk });
  Object.defineProperty(globalThis, 'EncodedAudioChunk', { configurable: true, writable: true, value: TestEncodedChunk });
  return () => {
    for (const [key, descriptor] of [['EncodedVideoChunk', previous.video], ['EncodedAudioChunk', previous.audio]] as const) {
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, key);
      else Object.defineProperty(globalThis, key, descriptor);
    }
  };
}

function remuxRequest(
  outputContainer: string,
  options: Record<string, unknown>,
  tracks: NormalizedTrack[] = [VIDEO, AUDIO],
): ConcreteOperationRequest {
  return {
    protocol: CONCRETE_OPERATION_PROTOCOL,
    scenarioId: 'streaming-output/aibrush-boundary-test',
    operation: 'remux',
    inputs: [{
      id: 'source.mp4',
      mime: 'video/mp4',
      container: tracks[0]?.codec === 'vp9' ? 'webm' : 'mp4',
      mutated: false,
      tracks,
      sizeBytes: 1_024,
    }],
    output: { container: outputContainer },
    options,
  };
}

function inMemoryInput(id: string, mime: string, bytes: Uint8Array): MediaInput {
  return {
    id,
    url: `https://fixtures.invalid/${id}`,
    mime,
    sizeBytes: bytes.byteLength,
    mutated: true,
    blob: () => Promise.resolve(new Blob([bytes])),
    arrayBuffer: () => Promise.resolve(bytes.slice().buffer),
  };
}

function joinBytes(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}
