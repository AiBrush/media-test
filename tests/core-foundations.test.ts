import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  CONCRETE_OPERATION_PROTOCOL,
  createNotApplicableError,
  isNotApplicableError,
  serializeNotApplicableError,
} from '../src/core/engine.ts';
import type {
  ConcreteOperationRequest,
  ConcreteWebCodecsConfig,
  MediaEngine,
  MediaInput,
  NormalizedMetadata,
} from '../src/core/engine.ts';
import { probeWebCodecsConfig } from '../src/core/feature-detect.ts';
import { readOutputPacketsResult, readOutputStructureResult } from '../src/core/box-readers.ts';
import { emptyGoldenStore, loadGolden, runOracle } from '../src/core/oracles.ts';
import type { GoldenStore, OracleContext } from '../src/core/oracles.ts';
import { evaluateConcreteSupport, goldenKindsForScenario } from '../src/core/runner.ts';
import { defineScenario, reduceOracleOutcomes } from '../src/core/scenario.ts';
import type { OracleOutcome } from '../src/core/scenario.ts';

const originalWebCodecsDescriptors = new Map<string, PropertyDescriptor | undefined>();

afterEach(() => {
  for (const [name, descriptor] of originalWebCodecsDescriptors) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  originalWebCodecsDescriptors.clear();
});

function installWebCodecsConstructor(
  name: 'VideoDecoder' | 'VideoEncoder' | 'AudioDecoder' | 'AudioEncoder',
  implementation: (config: unknown) => Promise<{ supported?: boolean }>,
): void {
  if (!originalWebCodecsDescriptors.has(name)) {
    originalWebCodecsDescriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  }
  const constructor = function MockWebCodecsConstructor(): void {};
  Object.defineProperty(constructor, 'isConfigSupported', { value: implementation });
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: constructor });
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  const out: T[][] = [];
  for (let index = 0; index < items.length; index++) {
    const head = items[index]!;
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const tail of permutations(rest)) out.push([head, ...tail]);
  }
  return out;
}

const outcomes = {
  pass: { state: 'VERDICT', oracle: 'golden-metadata', verdict: 'PASS', detail: 'valid' },
  diff: { state: 'VERDICT', oracle: 'golden-packets', verdict: 'PASS', reasonCode: 'ORACLE_REPRESENTATION_DIFF', detail: 'valid representation' },
  fail: { state: 'VERDICT', oracle: 'playback-smoke', verdict: 'FAIL', detail: 'invalid output' },
  error: { state: 'ERROR', oracle: 'ssim-psnr', reasonCode: 'ORACLE_THROW', detail: 'harness broke' },
  browser: {
    state: 'UNAVAILABLE',
    oracle: 'decoded-frames-bitexact',
    status: 'NA_BROWSER',
    reasonCode: 'WEB_CODECS_CONFIG_UNSUPPORTED',
    detail: 'codec unavailable',
  },
  asset: {
    state: 'UNAVAILABLE',
    oracle: 'decrypt-bitexact',
    status: 'NA_ASSET',
    reasonCode: 'GOLDEN_NOT_FOUND',
    detail: 'golden absent',
  },
} satisfies Record<string, OracleOutcome>;

describe('REQ-CORE-01: three-way oracle outcomes and reducer', () => {
  const matrix: Array<{ rows: OracleOutcome[]; expected: string }> = [
    { rows: [outcomes.pass, outcomes.asset], expected: 'PASS' },
    { rows: [outcomes.diff, outcomes.pass, outcomes.browser], expected: 'PASS' },
    { rows: [outcomes.fail, outcomes.diff, outcomes.pass, outcomes.error], expected: 'FAIL' },
    { rows: [outcomes.error, outcomes.browser, outcomes.asset], expected: 'ERROR' },
    { rows: [outcomes.browser, outcomes.asset], expected: 'NA_BROWSER' },
    { rows: [outcomes.asset], expected: 'NA_ASSET' },
  ];

  for (const [caseIndex, entry] of matrix.entries()) {
    test(`reducer matrix row ${caseIndex + 1} is order-independent`, () => {
      const reductions = permutations(entry.rows).map((rows) => reduceOracleOutcomes(rows));
      expect(new Set(reductions.map((result) => result.status))).toEqual(new Set([entry.expected]));
      expect(new Set(reductions.map((result) => result.detail))).toHaveLength(1);
    });
  }

  test('empty outcome sets are explicit harness errors', () => {
    expect(reduceOracleOutcomes([])).toEqual({
      status: 'ERROR',
      reasonCode: 'ORACLE_NO_OUTCOMES',
      detail: 'oracle reduction received no outcomes',
    });
  });

  test('DIFF and unavailable evidence survive JSON round trips', () => {
    const source = [outcomes.diff, outcomes.browser, outcomes.asset];
    const roundTripped = JSON.parse(JSON.stringify(source)) as OracleOutcome[];
    expect(roundTripped).toEqual(source);
    expect(reduceOracleOutcomes(roundTripped).status).toBe('PASS');
  });

  test('human detail text cannot change typed routing', () => {
    const disguised: OracleOutcome[] = [
      { ...outcomes.pass, detail: 'FAIL ERROR NA_BROWSER golden absent' },
      { ...outcomes.error, detail: 'PASS' },
    ];
    expect(reduceOracleOutcomes(disguised).status).toBe('PASS');
  });

  test('a thrown oracle dependency is ERROR rather than a false verdict', async () => {
    const context = oracleContext(emptyGoldenStore(), { container: 'mp4', durationSec: 1, tracks: [] });
    context.scenario = defineScenario({
      id: 'remux/thrown-oracle',
      op: 'remux',
      input: 'source.mp4',
      requires: { operations: ['remux'] },
      options: { container: 'mp4' },
      oracles: ['playback-smoke'],
      metrics: [],
    });
    context.output = { bytes: new Uint8Array([1]), mime: 'video/mp4', container: 'mp4' };
    context.playbackSmoke = async () => {
      throw new Error('injected oracle crash');
    };
    expect(await runOracle('playback-smoke', context)).toMatchObject({
      state: 'ERROR',
      reasonCode: 'ORACLE_THROW',
    });
  });
});

describe('REQ-CORE-02: shared realm-safe applicability protocol', () => {
  test('structured clone and JSON preserve the complete structural identity', () => {
    const error = createNotApplicableError(
      'engine@1',
      'transcode',
      'the concrete codec/profile tuple is unsupported',
      {
        inputContainers: ['mp4'],
        inputCodecs: ['hevc'],
        outputContainer: 'webm',
        outputCodecs: ['av1'],
        dimensions: [{ width: 3840, height: 2160 }],
      },
      'ENGINE_NEGATIVE_TUPLE',
      new Error('vendor cause'),
    );

    const cloned = structuredClone(error);
    const json = JSON.parse(JSON.stringify(error));
    expect(isNotApplicableError(cloned)).toBe(true);
    expect(isNotApplicableError(json)).toBe(true);
    expect(serializeNotApplicableError(cloned)).toMatchObject({
      reasonCode: 'ENGINE_NEGATIVE_TUPLE',
      operation: 'transcode',
      engineId: 'engine@1',
      tuple: {
        inputContainers: ['mp4'],
        inputCodecs: ['hevc'],
        outputContainer: 'webm',
        outputCodecs: ['av1'],
      },
      reason: 'the concrete codec/profile tuple is unsupported',
    });
  });

  test('a Worker round trip preserves structural applicability recognition', async () => {
    const error = createNotApplicableError(
      'engine@worker',
      'decodeFrames',
      'decoder config unsupported',
      { inputContainers: ['mp4'], inputCodecs: ['hevc'], outputCodecs: [] },
      'ENGINE_DECODER_TUPLE_UNSUPPORTED',
    );
    const worker = new Worker(new URL('./not-applicable-echo.worker.ts', import.meta.url), { type: 'module' });
    try {
      const echoed = await new Promise<unknown>((resolve, reject) => {
        worker.onmessage = (event) => resolve(event.data);
        worker.onerror = (event) => reject(event.error ?? new Error(event.message));
        worker.postMessage(error);
      });
      expect(isNotApplicableError(echoed)).toBe(true);
      expect(echoed).toMatchObject({
        reasonCode: 'ENGINE_DECODER_TUPLE_UNSUPPORTED',
        engineId: 'engine@worker',
        operation: 'decodeFrames',
      });
    } finally {
      worker.terminate();
    }
  });

  test('names and messages alone never classify an ordinary error as not-applicable', () => {
    const native = new Error('NotApplicableError: unsupported codec');
    native.name = 'NotApplicableError';
    expect(isNotApplicableError(native)).toBe(false);
    expect(isNotApplicableError({ name: 'NotApplicableError', message: 'capability miss' })).toBe(false);
  });

  test('oracle secondary calls rethrow typed NA but score ordinary execution rejection as FAIL', async () => {
    const trimNa = createNotApplicableError('engine@1', 'trim', 'trim tuple unsupported');
    const trimNaContext = trimInvariantContext(async () => {
      throw trimNa;
    });
    let thrown: unknown;
    try {
      await runOracle('property-invariant', trimNaContext);
    } catch (error) {
      thrown = error;
    }
    expect(isNotApplicableError(thrown)).toBe(true);
    expect(thrown).toMatchObject({ reason: 'trim tuple unsupported' });

    const concatNa = createNotApplicableError('engine@1', 'concat', 'concat tuple unsupported');
    const concatNaContext = trimInvariantContext(
      async () => ({ bytes: new Uint8Array([1]), mime: 'video/mp4', container: 'mp4' }),
      async () => {
        throw concatNa;
      },
    );
    thrown = undefined;
    try {
      await runOracle('property-invariant', concatNaContext);
    } catch (error) {
      thrown = error;
    }
    expect(isNotApplicableError(thrown)).toBe(true);
    expect(thrown).toMatchObject({ operation: 'concat', reason: 'concat tuple unsupported' });

    const rejectedContext = trimInvariantContext(async () => {
      throw new Error('malformed media rejected');
    });
    const outcome = await runOracle('property-invariant', rejectedContext);
    expect(outcome).toMatchObject({ state: 'VERDICT', verdict: 'FAIL' });
  });
});

describe('REQ-CORE-03: concrete tuples and exact WebCodecs probes', () => {
  const exactConfig: ConcreteWebCodecsConfig = {
    role: 'video-decoder',
    trackIndex: 2,
    config: {
      codec: 'avc1.640034',
      codedWidth: 3840,
      codedHeight: 2160,
      description: new Uint8Array([1, 100, 0, 52]),
      hardwareAcceleration: 'prefer-hardware',
    },
  };

  test('passes the exact cloned profile/dimensions/description config and records it', async () => {
    let seen: unknown;
    installWebCodecsConstructor('VideoDecoder', async (config) => {
      seen = config;
      return { supported: true };
    });
    const result = await probeWebCodecsConfig(exactConfig);
    expect(result.state).toBe('SUPPORTED');
    expect(seen).toEqual(exactConfig.config);
    expect(seen).not.toBe(exactConfig.config);
    expect(result.checkedConfig).toEqual(exactConfig);
  });

  test('maps false and NotSupportedError to browser NA, and TypeError to ERROR', async () => {
    installWebCodecsConstructor('VideoDecoder', async () => ({ supported: false }));
    expect(await probeWebCodecsConfig(exactConfig)).toMatchObject({
      state: 'UNSUPPORTED',
      reasonCode: 'WEB_CODECS_CONFIG_UNSUPPORTED',
    });

    installWebCodecsConstructor('VideoDecoder', async () => {
      throw { name: 'NotSupportedError', message: 'not available' };
    });
    expect(await probeWebCodecsConfig(exactConfig)).toMatchObject({
      state: 'UNSUPPORTED',
      reasonCode: 'WEB_CODECS_CONFIG_UNSUPPORTED',
    });

    installWebCodecsConstructor('VideoDecoder', async () => {
      throw new TypeError('invalid dimensions');
    });
    expect(await probeWebCodecsConfig(exactConfig)).toMatchObject({
      state: 'ERROR',
      reasonCode: 'WEB_CODECS_INVALID_CONFIG',
    });
  });

  test('negative tuple matrix keeps engine, browser, config, and supported paths distinct', async () => {
    const request = concreteRequest();
    const engineNo = fakeEngine(() => ({
      supported: false,
      status: 'NA_ENGINE',
      reasonCode: 'ENGINE_TUPLE_UNSUPPORTED',
      reason: 'container/codec pair unsupported',
    }));
    expect(await evaluateConcreteSupport(engineNo, request)).toMatchObject({
      blocker: { status: 'NA_ENGINE' },
    });

    installWebCodecsConstructor('VideoDecoder', async () => ({ supported: false }));
    const browserNo = fakeEngine(() => ({ supported: true, browserConfigs: [exactConfig] }));
    expect(await evaluateConcreteSupport(browserNo, request)).toMatchObject({
      blocker: { status: 'NA_BROWSER' },
      browserConfigs: [exactConfig],
    });

    installWebCodecsConstructor('VideoDecoder', async () => {
      throw new TypeError('bad adapter config');
    });
    expect(await evaluateConcreteSupport(browserNo, request)).toMatchObject({
      blocker: { status: 'ERROR' },
    });

    installWebCodecsConstructor('VideoDecoder', async () => ({ supported: true }));
    const supported = await evaluateConcreteSupport(browserNo, request);
    expect(supported.blocker).toBeUndefined();
    expect(supported.browserConfigs).toEqual([exactConfig]);
    expect(supported.probeStates).toEqual([{ role: 'video-decoder', state: 'SUPPORTED' }]);
  });
});

describe('REQ-CORE-04: typed golden and neutral-reader evidence', () => {
  test('a metadata-only evidence plan performs no packet/frame/SSIM fetches', async () => {
    const requested: string[] = [];
    await withMockFetch((url) => {
      requested.push(url);
      return Response.json(validGoldenForUrl(url));
    }, async () => {
      const planned = goldenKindsForScenario(defineScenario({
        id: 'probe/metadata-only-plan',
        op: 'probe',
        input: 'asset.mp4',
        requires: { operations: ['probe'] },
        oracles: ['golden-metadata'],
        metrics: [],
      }));
      expect(planned).toEqual(['meta']);

      const golden = await loadGolden('asset', { requestedKinds: planned });
      expect(golden.meta?.container).toBe('mp4');
      expect(golden.evidence.packets).toMatchObject({
        state: 'NOT_REQUESTED',
        reasonCode: 'GOLDEN_EVIDENCE_NOT_REQUESTED',
      });
    });

    expect(requested).toEqual(['fixtures/golden/asset.meta.json']);
  });

  test('a robustness seek-clamp survivor plan includes committed packet timing', () => {
    const planned = goldenKindsForScenario(defineScenario({
      id: 'robustness/seek-boundary-plan',
      op: 'seek',
      input: 'asset.mp4',
      options: {
        tUs: -1,
        robustness: {
          schema: 'media-test/robustness-contract@1',
          inputClass: 'boundary',
          returnedOutputCheck: 'seek-clamp',
          survivorOracles: ['graceful-failure'],
          timeoutMs: 15_000,
        },
      },
      requires: { operations: ['seek'] },
      oracles: ['graceful-failure'],
      metrics: [],
    }));

    expect(planned).toEqual(['meta', 'packets']);
  });

  test('an oracle accessing evidence omitted by its plan is a harness ERROR, not NA_ASSET', async () => {
    await withMockFetch((url) => Response.json(validGoldenForUrl(url)), async () => {
      const planned = await loadGolden('asset', { requestedKinds: [] });
      const outcome = await runOracle('golden-metadata', oracleContext(
        planned,
        { container: 'mp4', durationSec: 1, tracks: [] },
      ));
      expect(outcome).toMatchObject({
        state: 'ERROR',
        reasonCode: 'GOLDEN_EVIDENCE_NOT_REQUESTED',
      });
    });
  });

  test('golden fetch matrix distinguishes missing, HTTP, parse, schema, digest, pending, and valid', async () => {
    await withMockFetch(() => new Response('', { status: 404 }), async () => {
      expect((await loadGolden('asset')).evidence.meta.state).toBe('MISSING');
    });
    await withMockFetch(() => new Response('', { status: 500 }), async () => {
      expect((await loadGolden('asset')).evidence.meta.state).toBe('HTTP_ERROR');
    });
    await withMockFetch(() => new Response('{', { status: 200 }), async () => {
      expect((await loadGolden('asset')).evidence.meta.state).toBe('PARSE_ERROR');
    });
    await withMockFetch(() => Response.json({ unexpected: true }), async () => {
      expect((await loadGolden('asset')).evidence.meta.state).toBe('SCHEMA_ERROR');
    });
    await withMockFetch(() => Response.json(validGoldenForUrl('asset.meta.json')), async () => {
      expect(
        (await loadGolden('asset', { expectedDigests: { meta: '00'.repeat(32) } })).evidence.meta.state,
      ).toBe('DIGEST_MISMATCH');
    });
    await withMockFetch(() => Response.json({ pending: true }), async () => {
      expect((await loadGolden('asset')).evidence.meta.state).toBe('PENDING');
    });
    await withMockFetch((url) => Response.json(validGoldenForUrl(url)), async () => {
      const golden = await loadGolden('asset');
      expect(Object.values(golden.evidence).map((entry) => entry.state)).toEqual(['OK', 'OK', 'OK', 'OK']);
      expect(golden.meta?.container).toBe('mp4');
      expect(golden.packets).toHaveLength(1);
      expect(golden.frames).toHaveLength(1);
      expect(golden.ssimRef).toEqual([[0.25, 0.75]]);
    });
  });

  test('reader states distinguish incomplete, unsupported format, malformed, and unsupported structure', () => {
    expect(readOutputStructureResult(new Uint8Array())).toMatchObject({ state: 'INCOMPLETE' });
    expect(readOutputStructureResult(new Uint8Array(16).fill(0x7f))).toMatchObject({
      state: 'UNSUPPORTED_FORMAT',
    });
    expect(readOutputStructureResult(box('ftyp', new TextEncoder().encode('isom0000')), 'mp4')).toMatchObject({
      state: 'MALFORMED',
    });

    const fragmented = concatBytes(
      box('ftyp', new TextEncoder().encode('isom0000')),
      box('moov', box('mvex', new Uint8Array())),
      box('moof', new Uint8Array()),
    );
    expect(readOutputPacketsResult(fragmented, 'mp4')).toMatchObject({
      state: 'UNSUPPORTED_STRUCTURE',
      reasonCode: 'READER_ISOBMFF_FRAGMENTED_UNIMPLEMENTED',
      evidence: { detectedFormat: 'mp4', markers: ['fragmented-isobmff'] },
    });
  });

  test('missing golden is NA_ASSET, corrupt evidence is ERROR, and malformed candidate output is FAIL', async () => {
    const metadata: NormalizedMetadata = { container: 'mp4', durationSec: 1, tracks: [] };
    const missing = emptyGoldenStore();
    const missingOutcome = await runOracle('golden-metadata', oracleContext(missing, metadata));
    expect(missingOutcome).toMatchObject({ state: 'UNAVAILABLE', status: 'NA_ASSET' });

    const corrupt = emptyGoldenStore();
    corrupt.evidence.meta = {
      state: 'SCHEMA_ERROR',
      reasonCode: 'GOLDEN_SCHEMA_ERROR',
      url: '/bad.meta.json',
    };
    const corruptOutcome = await runOracle('golden-metadata', oracleContext(corrupt, metadata));
    expect(corruptOutcome).toMatchObject({ state: 'ERROR', reasonCode: 'GOLDEN_SCHEMA_ERROR' });

    const valid = validMetaStore(metadata);
    const malformed = oracleContext(valid, metadata);
    malformed.scenario = defineScenario({
      id: 'remux/malformed-candidate',
      op: 'remux',
      input: 'source.mp4',
      options: { container: 'mp4' },
      requires: { operations: ['remux'] },
      oracles: ['reference-reimport'],
      metrics: [],
    });
    malformed.input = mediaInput(fixtureBytes('micro_h264_1frame.mp4'));
    malformed.output = {
      bytes: box('ftyp', new TextEncoder().encode('isom0000')),
      mime: 'video/mp4',
      container: 'mp4',
    };
    const malformedOutcome = await runOracle('reference-reimport', malformed);
    expect(malformedOutcome).toMatchObject({
      state: 'VERDICT',
      verdict: 'FAIL',
      reasonCode: 'REMUX_OUTPUT_INVALID',
    });

    const invalidSource = oracleContext(valid, metadata);
    invalidSource.scenario = malformed.scenario;
    invalidSource.output = {
      bytes: fixtureBytes('micro_h264_1frame.mp4'),
      mime: 'video/mp4',
      container: 'mp4',
    };
    expect(await runOracle('reference-reimport', invalidSource)).toMatchObject({
      state: 'ERROR',
      reasonCode: 'REMUX_SOURCE_EVIDENCE_INVALID',
    });
  });
});

function concreteRequest(): ConcreteOperationRequest {
  return {
    protocol: CONCRETE_OPERATION_PROTOCOL,
    scenarioId: 'transcode/negative-tuple',
    operation: 'transcode',
    inputs: [
      {
        id: 'source.mp4',
        mime: 'video/mp4',
        container: 'mp4',
        mutated: false,
        tracks: [{ type: 'video', codec: 'hevc', width: 3840, height: 2160 }],
      },
    ],
    output: { container: 'webm', videoCodec: 'av1', width: 3840, height: 2160 },
    options: {},
  };
}

function fakeEngine(supports: NonNullable<MediaEngine['supports']>): MediaEngine {
  return { id: 'fake@1', supports } as unknown as MediaEngine;
}

function mediaInput(bytes = new Uint8Array([1, 2, 3])): MediaInput {
  return {
    id: 'source.mp4',
    url: '/source.mp4',
    mime: 'video/mp4',
    blob: async () => new Blob([bytes]),
    arrayBuffer: async () => bytes.slice().buffer,
  };
}

function trimInvariantContext(
  trim: MediaEngine['trim'],
  concat: NonNullable<MediaEngine['concat']> = async () => ({
    bytes: new Uint8Array(),
    mime: 'video/mp4',
    container: 'mp4',
  }),
): OracleContext {
  const scenario = defineScenario({
    id: 'trim/composition',
    op: 'trim',
    input: 'source.mp4',
    options: { invariant: 'trim-concat', a: 0, b: 1_000_000, c: 2_000_000, container: 'mp4' },
    requires: { operations: ['trim'] },
    oracles: ['property-invariant'],
    metrics: [],
  });
  const input = mediaInput();
  const engine = {
    id: 'engine@1',
    trim,
    concat,
  } as unknown as MediaEngine;
  return {
    scenario,
    input,
    engine,
    golden: emptyGoldenStore(),
    decodeWithPlatform: async () => ({ frames: [] }),
    playbackSmoke: async () => false,
  };
}

function fixtureBytes(file: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`../fixtures/media/${file}`, import.meta.url)));
}

function oracleContext(golden: GoldenStore, metadata: NormalizedMetadata): OracleContext {
  return {
    scenario: defineScenario({
      id: 'probe/evidence',
      op: 'probe',
      input: 'source.mp4',
      requires: { operations: ['probe'] },
      oracles: ['golden-metadata'],
      metrics: [],
    }),
    input: mediaInput(),
    metadata,
    golden,
    decodeWithPlatform: async () => ({ frames: [] }),
    playbackSmoke: async () => false,
  };
}

function validMetaStore(metadata: NormalizedMetadata): GoldenStore {
  const store = emptyGoldenStore();
  store.meta = metadata;
  store.evidence.meta = { state: 'OK', value: metadata, url: '/meta.json', raw: metadata };
  return store;
}

async function withMockFetch<T>(
  response: (url: string) => Response,
  body: () => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => response(String(input))) as typeof fetch;
  try {
    return await body();
  } finally {
    globalThis.fetch = original;
  }
}

function validGoldenForUrl(url: string): unknown {
  if (url.includes('.meta.json')) return { container: 'mp4', durationSec: 1, tracks: [] };
  if (url.includes('.packets.json')) {
    return [{ trackIndex: 0, size: 12, ptsUs: 0, dtsUs: 0, keyframe: true }];
  }
  if (url.includes('.frames.json')) return [{ index: 0, ptsUs: 0, sha256: 'ab'.repeat(32) }];
  return [[0.25, 0.75]];
}

function box(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.byteLength);
  new DataView(out.buffer).setUint32(0, out.byteLength);
  for (let index = 0; index < 4; index++) out[4 + index] = type.charCodeAt(index);
  out.set(payload, 8);
  return out;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}
