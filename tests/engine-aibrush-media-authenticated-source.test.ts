import { describe, expect, test } from 'bun:test';

import {
  CONCRETE_OPERATION_PROTOCOL,
  type ConcreteOperationRequest,
  type MediaInput,
  type MediaInputContentAttestation,
  type OperationContext,
  type OperationTelemetry,
  SUPPORTED_CHECKED_SUPPORT_SNAPSHOT,
} from '../src/core/engine.ts';
import {
  isCorpusDeliveryIntegrityError,
  sha256Hex,
} from '../src/core/media-selection.ts';
import {
  type AibrushAuthenticatedRangeTrace,
  AibrushMediaEngine,
  createAibrushAuthenticatedSource,
} from '../src/engines/aibrush-media/adapter.ts';

function attestationFor(
  bytes: Uint8Array,
  chunkSizeBytes: number,
): MediaInputContentAttestation {
  return {
    schema: 'media-test/url-content-attestation@1',
    logicalPath: 'large-input.mp4',
    sha256: sha256Hex(bytes),
    sizeBytes: bytes.byteLength,
    chunkSizeBytes,
    chunkSha256: Array.from(
      { length: Math.ceil(bytes.byteLength / chunkSizeBytes) },
      (_, index) => sha256Hex(bytes.subarray(index * chunkSizeBytes, (index + 1) * chunkSizeBytes)),
    ),
  };
}

function inputFor(
  bytes: Uint8Array,
  attestation: MediaInputContentAttestation,
  wholeFileCalls: { count: number },
): MediaInput {
  return {
    id: 'large-input.mp4',
    url: 'https://fixtures.test/large-input.mp4',
    mime: 'video/mp4',
    sizeBytes: bytes.byteLength,
    contentAttestation: attestation,
    async arrayBuffer() {
      wholeFileCalls.count += 1;
      throw new Error('whole-file byte access is forbidden');
    },
    async blob() {
      wholeFileCalls.count += 1;
      throw new Error('whole-file blob access is forbidden');
    },
  };
}

function rangeServer(
  body: () => Uint8Array,
  physicalRanges: Array<{ start: number; end: number }>,
): typeof fetch {
  return (async (_resource: RequestInfo | URL, init?: RequestInit) => {
    const match = /^bytes=(\d+)-(\d+)$/.exec(new Headers(init?.headers).get('Range') ?? '');
    if (!match) return new Response(null, { status: 400 });
    const start = Number(match[1]);
    const end = Number(match[2]);
    physicalRanges.push({ start, end });
    const bytes = body();
    return new Response(bytes.slice(start, end + 1), {
      status: 206,
      headers: { 'Content-Range': `bytes ${start}-${end}/${bytes.byteLength}` },
    });
  }) as typeof fetch;
}

function metadataOnlyFaststartMp4(): Promise<Uint8Array> {
  return Bun.file('fixtures/media/h264_1080p_30s.mp4')
    .slice(0, 128 * 1024)
    .arrayBuffer()
    .then((buffer) => {
      const prefix = new Uint8Array(buffer);
      const view = new DataView(prefix.buffer, prefix.byteOffset, prefix.byteLength);
      let offset = 0;
      while (offset + 8 <= prefix.byteLength) {
        const size = view.getUint32(offset);
        const type = new TextDecoder().decode(prefix.subarray(offset + 4, offset + 8));
        if (type === 'mdat') return prefix.slice(0, offset);
        if (size < 8 || offset + size > prefix.byteLength) break;
        offset += size;
      }
      throw new Error('fast-start MP4 prefix has no bounded mdat boundary');
    });
}

function withLegacyQuickTimeEnglish(source: Uint8Array): Uint8Array {
  const bytes = source.slice();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  bytes.set(new TextEncoder().encode('qt  '), 8);
  const containers = new Set(['moov', 'trak', 'mdia']);
  let patchedLanguages = 0;
  const visit = (start: number, end: number): void => {
    let offset = start;
    while (offset + 8 <= end) {
      const size = view.getUint32(offset);
      if (size < 8 || offset + size > end) return;
      const type = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8));
      if (type === 'mdhd') {
        const version = bytes[offset + 8];
        const languageOffset = offset + (version === 1 ? 40 : 28);
        if (languageOffset + 2 <= offset + size) {
          view.setUint16(languageOffset, 0);
          patchedLanguages += 1;
        }
      } else if (containers.has(type)) {
        visit(offset + 8, offset + size);
      }
      offset += size;
    }
  };
  visit(0, bytes.byteLength);
  if (patchedLanguages !== 2) {
    throw new Error(`expected two media-header languages, patched ${patchedLanguages}`);
  }
  return bytes;
}

function minimalPcmWav(): Uint8Array {
  const bytes = new Uint8Array(46);
  const view = new DataView(bytes.buffer);
  const text = new TextEncoder();
  bytes.set(text.encode('RIFF'), 0);
  view.setUint32(4, bytes.byteLength - 8, true);
  bytes.set(text.encode('WAVEfmt '), 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 48_000, true);
  view.setUint32(28, 96_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  bytes.set(text.encode('data'), 36);
  view.setUint32(40, 2, true);
  return bytes;
}

function probeRequest(input: MediaInput): ConcreteOperationRequest {
  return {
    protocol: CONCRETE_OPERATION_PROTOCOL,
    scenarioId: 'probe/authenticated-range-adapter-integration',
    operation: 'probe',
    inputs: [
      {
        id: input.id,
        mime: input.mime,
        container: 'mov',
        mutated: false,
        sourceEvidence: 'RESOLVED',
        sizeBytes: input.sizeBytes,
        tracks: [
          { type: 'video', codec: 'h264', width: 1_920, height: 1_080, fps: 30 },
          { type: 'audio', codec: 'aac', sampleRate: 48_000, channels: 2 },
        ],
      },
    ],
    options: {},
  };
}

function trimRequest(
  input: MediaInput,
  range: { readonly startUs: number; readonly endUs: number },
): ConcreteOperationRequest {
  return {
    protocol: CONCRETE_OPERATION_PROTOCOL,
    scenarioId: 'trim/authenticated-range-adapter-integration',
    operation: 'trim',
    inputs: [
      {
        id: input.id,
        mime: input.mime,
        container: 'mp4',
        mutated: false,
        sourceEvidence: 'RESOLVED',
        sizeBytes: input.sizeBytes,
        tracks: [
          { type: 'video', codec: 'h264', width: 640, height: 360, fps: 30 },
          { type: 'audio', codec: 'aac', sampleRate: 48_000, channels: 2 },
        ],
      },
    ],
    output: { container: 'mp4', videoCodec: 'h264', audioCodec: 'aac' },
    transforms: {
      trim: { ...range, frameAccurate: false },
    },
    options: {
      container: 'mp4',
      frameAccurate: false,
      range,
    },
  };
}

function probeContext(
  request: ConcreteOperationRequest,
  signal: AbortSignal,
  events: OperationTelemetry[],
): OperationContext {
  return {
    signal,
    phase: 'functional',
    operationStartMs: performance.now(),
    emit: (event) => events.push(event),
    request,
    checkedSupport: SUPPORTED_CHECKED_SUPPORT_SNAPSHOT,
  };
}

function restoreGlobalFetch(descriptor: PropertyDescriptor | undefined): void {
  if (descriptor === undefined) Reflect.deleteProperty(globalThis, 'fetch');
  else Object.defineProperty(globalThis, 'fetch', descriptor);
}

describe('AIBrush authenticated range Source', () => {
  test('routes a small attested WAV through fixed verified blocks instead of its whole-file fast path', async () => {
    const bytes = minimalPcmWav();
    const attestation = attestationFor(bytes, 8);
    const wholeFileCalls = { count: 0 };
    const physicalRanges: Array<{ start: number; end: number }> = [];
    const input: MediaInput = {
      ...inputFor(bytes, attestation, wholeFileCalls),
      id: 'small-attested.wav',
      url: 'https://fixtures.test/small-attested.wav',
      mime: 'audio/wav',
    };
    const request: ConcreteOperationRequest = {
      ...probeRequest(input),
      inputs: [{
        id: input.id,
        mime: input.mime,
        container: 'wav',
        mutated: false,
        sourceEvidence: 'RESOLVED',
        sizeBytes: input.sizeBytes,
        tracks: [{ type: 'audio', codec: 'pcm-s16', sampleRate: 48_000, channels: 1 }],
      }],
    };
    const events: OperationTelemetry[] = [];
    const controller = new AbortController();
    const context = probeContext(request, controller.signal, events);
    const engine = new AibrushMediaEngine();
    const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: rangeServer(() => bytes, physicalRanges),
    });

    try {
      expect(engine.supports(request, context)).toEqual({ supported: true });
      await engine.init(context);
      const metadata = await engine.probe(input, context);

      expect(metadata).toMatchObject({
        container: 'wav',
        tracks: [{ type: 'audio', codec: 'pcm-s16', sampleRate: 48_000, channels: 1 }],
        telemetry: { bytesRead: bytes.byteLength },
        probeEvidence: { readMode: 'range' },
      });
      expect(wholeFileCalls.count).toBe(0);
      expect(physicalRanges).toHaveLength(Math.ceil(bytes.byteLength / attestation.chunkSizeBytes));
    } finally {
      await engine.dispose(context);
      restoreGlobalFetch(fetchDescriptor);
    }
  });

  test('routes a clean attested malformed-named input through verified ranges', async () => {
    const bytes = await metadataOnlyFaststartMp4();
    const attestation = attestationFor(bytes, 4 * 1024);
    const wholeFileCalls = { count: 0 };
    const physicalRanges: Array<{ start: number; end: number }> = [];
    const input: MediaInput = {
      ...inputFor(bytes, attestation, wholeFileCalls),
      id: 'mislabeled-large-input.mp4',
      url: 'https://fixtures.test/mislabeled-large-input.mp4',
    };
    const events: OperationTelemetry[] = [];
    const controller = new AbortController();
    const request = probeRequest(input);
    const context = probeContext(request, controller.signal, events);
    const engine = new AibrushMediaEngine();
    const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: rangeServer(() => bytes, physicalRanges),
    });

    try {
      expect(engine.supports(request, context)).toEqual({ supported: true });
      await engine.init(context);
      const metadata = await engine.probe(input, context);

      expect(metadata.probeEvidence).toEqual({ readMode: 'range' });
      expect(metadata.telemetry?.bytesRead).toBe(bytes.byteLength);
      expect(wholeFileCalls.count).toBe(0);
      expect(physicalRanges.length).toBeGreaterThan(0);
    } finally {
      await engine.dispose(context);
      restoreGlobalFetch(fetchDescriptor);
    }
  });

  test('probes attested QuickTime metadata with bounded physical telemetry and legacy English parity', async () => {
    const bytes = withLegacyQuickTimeEnglish(await metadataOnlyFaststartMp4());
    const attestation = attestationFor(bytes, 4 * 1024);
    const wholeFileCalls = { count: 0 };
    const physicalRanges: Array<{ start: number; end: number }> = [];
    const input: MediaInput = {
      ...inputFor(bytes, attestation, wholeFileCalls),
      id: 'big-buck-bunny-shaped.mov',
      url: 'https://fixtures.test/big-buck-bunny-shaped.mov',
      mime: 'video/quicktime',
    };
    const events: OperationTelemetry[] = [];
    const controller = new AbortController();
    const request = probeRequest(input);
    const context = probeContext(request, controller.signal, events);
    const engine = new AibrushMediaEngine();
    const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: rangeServer(() => bytes, physicalRanges),
    });

    try {
      expect(engine.supports(request, context)).toEqual({ supported: true });
      await engine.init(context);
      const metadata = await engine.probe(input, context);

      expect(metadata).toMatchObject({
        container: 'mov',
        tracks: [
          {
            type: 'video',
            codec: 'h264',
            language: 'eng',
            defaultDisposition: true,
          },
          {
            type: 'audio',
            codec: 'aac',
            language: 'eng',
            defaultDisposition: true,
          },
        ],
        telemetry: { bytesRead: bytes.byteLength },
        probeEvidence: { readMode: 'range' },
      });
      expect(wholeFileCalls.count).toBe(0);
      expect(physicalRanges).toHaveLength(Math.ceil(bytes.byteLength / attestation.chunkSizeBytes));
      expect(
        physicalRanges.reduce((total, range) => total + range.end - range.start + 1, 0),
      ).toBe(bytes.byteLength);
      const byteEvents = events.filter(
        (event): event is Extract<OperationTelemetry, { type: 'bytes-read' }> =>
          event.type === 'bytes-read',
      );
      expect(byteEvents).toHaveLength(physicalRanges.length);
      expect(byteEvents.at(-1)?.bytes).toBe(bytes.byteLength);
      expect(
        byteEvents.every(
          (event, index) =>
            index === 0 || event.bytes > (byteEvents[index - 1]?.bytes ?? Number.POSITIVE_INFINITY),
        ),
      ).toBe(true);
    } finally {
      await engine.dispose(context);
      restoreGlobalFetch(fetchDescriptor);
    }
  });

  test('routes attested copy trim through authenticated #src with bounded physical telemetry', async () => {
    const bytes = new Uint8Array(
      await Bun.file('fixtures/media/tiny_h264_360p_2s.mp4').arrayBuffer(),
    );
    const chunkSizeBytes = 64 * 1024;
    const attestation = attestationFor(bytes, chunkSizeBytes);
    const wholeFileCalls = { count: 0 };
    const physicalRanges: Array<{ start: number; end: number }> = [];
    const input: MediaInput = {
      ...inputFor(bytes, attestation, wholeFileCalls),
      id: 'tiny-h264-attested.mp4',
      url: 'https://fixtures.test/tiny-h264-attested.mp4',
    };
    const range = { startUs: 0, endUs: 1_000_000 };
    const events: OperationTelemetry[] = [];
    const controller = new AbortController();
    const request = trimRequest(input, range);
    const context = probeContext(request, controller.signal, events);
    const engine = new AibrushMediaEngine();
    const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: rangeServer(() => bytes, physicalRanges),
    });

    try {
      expect(engine.supports(request, context)).toEqual({ supported: true });
      await engine.init(context);
      const output = await engine.trim(
        input,
        range,
        { container: 'mp4', frameAccurate: false },
        context,
      );

      expect(output.bytes.byteLength).toBeGreaterThan(0);
      expect(engine.configUsed).toMatchObject({
        operation: 'trim',
        route: 'framework.trim',
      });
      expect(wholeFileCalls.count).toBe(0);
      expect(physicalRanges.length).toBeGreaterThan(0);
      expect(
        physicalRanges.every(({ start, end }) => end - start + 1 <= chunkSizeBytes),
      ).toBe(true);
      const physicalBytes = physicalRanges.reduce(
        (total, { start, end }) => total + end - start + 1,
        0,
      );
      expect(physicalBytes).toBeLessThanOrEqual(bytes.byteLength);
      const byteEvents = events.filter(
        (event): event is Extract<OperationTelemetry, { type: 'bytes-read' }> =>
          event.type === 'bytes-read',
      );
      expect(byteEvents).toHaveLength(physicalRanges.length);
      expect(byteEvents.at(-1)?.bytes).toBe(physicalBytes);
    } finally {
      await engine.dispose(context);
      restoreGlobalFetch(fetchDescriptor);
    }
  });

  test('propagates trim cancellation into an in-flight authenticated block batch', async () => {
    const bytes = new Uint8Array(
      await Bun.file('fixtures/media/tiny_h264_360p_2s.mp4').arrayBuffer(),
    );
    const attestation = attestationFor(bytes, 64 * 1024);
    const wholeFileCalls = { count: 0 };
    const input: MediaInput = {
      ...inputFor(bytes, attestation, wholeFileCalls),
      id: 'tiny-h264-attested-cancel.mp4',
      url: 'https://fixtures.test/tiny-h264-attested-cancel.mp4',
    };
    const range = { startUs: 0, endUs: 1_000_000 };
    const controller = new AbortController();
    const request = trimRequest(input, range);
    const context = probeContext(request, controller.signal, []);
    const engine = new AibrushMediaEngine();
    const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
    const physicalRanges: Array<{ start: number; end: number }> = [];
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const stalledRangeServer = (async (_resource: RequestInfo | URL, init?: RequestInit) => {
      const match = /^bytes=(\d+)-(\d+)$/.exec(new Headers(init?.headers).get('Range') ?? '');
      if (match === null) throw new Error('expected a fixed block range');
      physicalRanges.push({ start: Number(match[1]), end: Number(match[2]) });
      markStarted();
      return await new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        const abort = (): void => reject(signal?.reason ?? new DOMException('cancelled', 'AbortError'));
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted === true) abort();
      });
    }) as typeof fetch;
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: stalledRangeServer,
    });

    try {
      await engine.init(context);
      const pending = engine.trim(
        input,
        range,
        { container: 'mp4', frameAccurate: false },
        context,
      );
      await started;
      controller.abort(new DOMException('cancelled trim', 'AbortError'));
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      expect(wholeFileCalls.count).toBe(0);
      expect(physicalRanges.length).toBeGreaterThan(0);
      expect(physicalRanges.length).toBeLessThanOrEqual(4);
    } finally {
      await engine.dispose();
      restoreGlobalFetch(fetchDescriptor);
    }
  });

  test('verifies fixed blocks before returning a cross-block range without whole-file access', async () => {
    const bytes = new TextEncoder().encode('authenticated-aibrush-range-body');
    const chunkSizeBytes = 5;
    const attestation = attestationFor(bytes, chunkSizeBytes);
    const wholeFileCalls = { count: 0 };
    const physicalRanges: Array<{ start: number; end: number }> = [];
    const trace: AibrushAuthenticatedRangeTrace = {
      bytesRead: 0,
      rangeRequests: 0,
      blockRequests: 0,
    };
    const source = createAibrushAuthenticatedSource(
      inputFor(bytes, attestation, wholeFileCalls),
      rangeServer(() => bytes, physicalRanges),
      trace,
    );

    const result = await source.range(3, 19);
    expect(result).toEqual(bytes.slice(3, 19));
    expect(trace).toEqual({
      bytesRead: 20,
      rangeRequests: 1,
      blockRequests: 4,
    });
    expect(physicalRanges).toEqual([
      { start: 0, end: 4 },
      { start: 5, end: 9 },
      { start: 10, end: 14 },
      { start: 15, end: 19 },
    ]);
    expect(physicalRanges.every(({ start, end }) => end - start + 1 <= chunkSizeBytes)).toBe(true);
    expect(wholeFileCalls.count).toBe(0);
    source.releaseRange?.(result);
    expect(result.byteLength).toBe(0);
    source.releaseRange?.(result);
  });

  test('bounds the verified-block LRU and refetches only an evicted block', async () => {
    const bytes = Uint8Array.from({ length: 20 }, (_, index) => index);
    const attestation = attestationFor(bytes, 1);
    const physicalRanges: Array<{ start: number; end: number }> = [];
    const source = createAibrushAuthenticatedSource(
      inputFor(bytes, attestation, { count: 0 }),
      rangeServer(() => bytes, physicalRanges),
    );

    for (let index = 0; index < 17; index++) {
      source.releaseRange?.(await source.range(index, index + 1));
    }
    expect(physicalRanges).toHaveLength(17);

    source.releaseRange?.(await source.range(16, 17));
    expect(physicalRanges).toHaveLength(17);

    source.releaseRange?.(await source.range(0, 1));
    expect(physicalRanges).toHaveLength(18);
    expect(physicalRanges.at(-1)).toEqual({ start: 0, end: 0 });
  });

  test('bounds cached bytes independently of the entry-count ceiling', async () => {
    const chunkSizeBytes = 1024 * 1024 + 1;
    const bytes = new Uint8Array(chunkSizeBytes * 16);
    const attestation = attestationFor(bytes, chunkSizeBytes);
    const physicalRanges: Array<{ start: number; end: number }> = [];
    const source = createAibrushAuthenticatedSource(
      inputFor(bytes, attestation, { count: 0 }),
      rangeServer(() => bytes, physicalRanges),
    );

    for (let index = 0; index < 16; index++) {
      const start = index * chunkSizeBytes;
      source.releaseRange?.(await source.range(start, start + 1));
    }
    expect(physicalRanges).toHaveLength(16);

    const lastStart = 15 * chunkSizeBytes;
    source.releaseRange?.(await source.range(lastStart, lastStart + 1));
    expect(physicalRanges).toHaveLength(16);

    source.releaseRange?.(await source.range(0, 1));
    expect(physicalRanges).toHaveLength(17);
    expect(physicalRanges.at(-1)).toEqual({ start: 0, end: chunkSizeBytes - 1 });
  });

  test('de-duplicates concurrent reads of the same uncached block', async () => {
    const bytes = new TextEncoder().encode('one-block');
    const attestation = attestationFor(bytes, bytes.byteLength);
    let fetchCalls = 0;
    let respond!: (response: Response) => void;
    const fetchImpl = (async () => {
      fetchCalls += 1;
      return await new Promise<Response>((resolve) => {
        respond = resolve;
      });
    }) as typeof fetch;
    const source = createAibrushAuthenticatedSource(
      inputFor(bytes, attestation, { count: 0 }),
      fetchImpl,
    );

    const first = source.range(0, 1);
    const second = source.range(0, bytes.byteLength);
    const cancelledController = new AbortController();
    const cancelled = source.range(0, 1, cancelledController.signal);
    await Promise.resolve();
    expect(fetchCalls).toBe(1);
    cancelledController.abort(new DOMException('cancelled join', 'AbortError'));
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    respond(new Response(bytes, {
      status: 206,
      headers: { 'Content-Range': `bytes 0-${bytes.byteLength - 1}/${bytes.byteLength}` },
    }));
    const [firstBytes, secondBytes] = await Promise.all([first, second]);
    expect(firstBytes).toEqual(bytes.slice(0, 1));
    expect(secondBytes).toEqual(bytes);
    expect(fetchCalls).toBe(1);
    source.releaseRange?.(firstBytes);
    source.releaseRange?.(secondBytes);
  });

  test('cancels and settles sibling GETs on first batch failure, then clears failed in-flight state', async () => {
    const bytes = Uint8Array.from({ length: 4 }, (_, index) => index);
    const attestation = attestationFor(bytes, 1);
    const started: number[] = [];
    const aborted: number[] = [];
    let failFirstBlock = true;
    const fetchImpl = (async (_resource: RequestInfo | URL, init?: RequestInit) => {
      const match = /^bytes=(\d+)-(\d+)$/.exec(new Headers(init?.headers).get('Range') ?? '');
      if (match === null) throw new Error('expected a fixed block range');
      const start = Number(match[1]);
      started.push(start);
      if (start === 0) {
        if (failFirstBlock) {
          failFirstBlock = false;
          return new Response(bytes.slice(0, 1), { status: 200 });
        }
        return new Response(bytes.slice(0, 1), {
          status: 206,
          headers: { 'Content-Range': `bytes 0-0/${bytes.byteLength}` },
        });
      }
      return await new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        const onAbort = (): void => {
          aborted.push(start);
          reject(signal?.reason ?? new DOMException('aborted', 'AbortError'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted === true) onAbort();
      });
    }) as typeof fetch;
    const source = createAibrushAuthenticatedSource(
      inputFor(bytes, attestation, { count: 0 }),
      fetchImpl,
    );

    await expect(source.range(0, bytes.byteLength)).rejects.toMatchObject({
      reasonCode: 'CORPUS_AUTHENTICATED_RANGE_UNAVAILABLE',
    });
    expect(started).toEqual([0, 1, 2, 3]);
    expect(aborted.sort()).toEqual([1, 2, 3]);

    const retried = await source.range(0, 1);
    expect(retried).toEqual(bytes.slice(0, 1));
    expect(started.filter((index) => index === 0)).toHaveLength(2);
    source.releaseRange?.(retried);
  });

  test('uses the bound operation signal when a framework range call omits its signal', async () => {
    const bytes = Uint8Array.from({ length: 4 }, (_, index) => index);
    const attestation = attestationFor(bytes, 1);
    const operation = new AbortController();
    const fetchImpl = (async (_resource: RequestInfo | URL, init?: RequestInit) => {
      return await new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        const onAbort = (): void => reject(signal?.reason ?? new DOMException('aborted', 'AbortError'));
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted === true) onAbort();
      });
    }) as typeof fetch;
    const source = createAibrushAuthenticatedSource(
      inputFor(bytes, attestation, { count: 0 }),
      fetchImpl,
      undefined,
      undefined,
      false,
      operation.signal,
    );
    const pending = source.range(0, 1);
    await Promise.resolve();
    operation.abort(new DOMException('cancelled', 'AbortError'));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('aborts an in-flight block batch without starting later range requests', async () => {
    const bytes = Uint8Array.from({ length: 12 }, (_, index) => index);
    const attestation = attestationFor(bytes, 1);
    const physicalRanges: Array<{ start: number; end: number }> = [];
    const fetchImpl = (async (_resource: RequestInfo | URL, init?: RequestInit) => {
      const match = /^bytes=(\d+)-(\d+)$/.exec(new Headers(init?.headers).get('Range') ?? '');
      if (match === null) throw new Error('expected a fixed block range');
      physicalRanges.push({ start: Number(match[1]), end: Number(match[2]) });
      return await new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        const onAbort = (): void => reject(signal?.reason ?? new DOMException('aborted', 'AbortError'));
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted === true) onAbort();
      });
    }) as typeof fetch;
    const source = createAibrushAuthenticatedSource(
      inputFor(bytes, attestation, { count: 0 }),
      fetchImpl,
    );
    const controller = new AbortController();
    const pending = source.range(0, bytes.byteLength, controller.signal);
    await Promise.resolve();
    expect(physicalRanges).toHaveLength(4);

    controller.abort(new DOMException('cancelled', 'AbortError'));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    expect(physicalRanges).toHaveLength(4);
  });

  test('quarantines post-admission digest drift', async () => {
    const admitted = new TextEncoder().encode('authenticated-aibrush-range-body');
    const served = admitted.slice();
    served[7] ^= 0xff;
    const attestation = attestationFor(admitted, 5);
    const source = createAibrushAuthenticatedSource(
      inputFor(admitted, attestation, { count: 0 }),
      rangeServer(() => served, []),
    );

    let thrown: unknown;
    try {
      await source.range(5, 10);
    } catch (error) {
      thrown = error;
    }
    expect(isCorpusDeliveryIntegrityError(thrown)).toBe(true);
    if (isCorpusDeliveryIntegrityError(thrown)) {
      expect(thrown.reasonCode).toBe('CORPUS_AUTHENTICATED_RANGE_DIGEST_MISMATCH');
    }
  });

  test('requires exact partial-content status and Content-Range shape', async () => {
    const bytes = new TextEncoder().encode('range-shape');
    const attestation = attestationFor(bytes, bytes.byteLength);
    const input = inputFor(bytes, attestation, { count: 0 });

    const wrongStatus = createAibrushAuthenticatedSource(
      input,
      (async () => new Response(bytes, { status: 200 })) as typeof fetch,
    );
    await expect(wrongStatus.range(0, bytes.byteLength)).rejects.toMatchObject({
      reasonCode: 'CORPUS_AUTHENTICATED_RANGE_UNAVAILABLE',
    });

    const wrongShape = createAibrushAuthenticatedSource(
      input,
      (async () => new Response(bytes, {
        status: 206,
        headers: { 'Content-Range': `bytes 1-${bytes.byteLength}/${bytes.byteLength}` },
      })) as typeof fetch,
    );
    await expect(wrongShape.range(0, bytes.byteLength)).rejects.toMatchObject({
      reasonCode: 'CORPUS_AUTHENTICATED_RANGE_SHAPE_MISMATCH',
    });
  });
});
