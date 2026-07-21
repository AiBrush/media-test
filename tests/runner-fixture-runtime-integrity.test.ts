import { describe, expect, test } from 'bun:test';

import { canonicalizeJson } from '../src/core/canonical-json.ts';
import type {
  BrowserName,
  CapabilitySet,
  MediaBytes,
  MediaEngine,
  NormalizedMetadata,
} from '../src/core/engine.ts';
import type { CodecSupport } from '../src/core/feature-detect.ts';
import {
  ActiveFixtureRuntime,
  FIXTURE_GENERATION_INDEX_SCHEMA,
  FixtureIntegrityCache,
  type FixtureAvailabilityEntry,
  type FixtureGenerationEntry,
  type FixtureGenerationIndex,
  type FixtureMaterializedMedia,
} from '../src/core/fixture-integrity.ts';
import { runOne, type PixelBehaviorEvidence } from '../src/core/runner.ts';
import { defineScenario } from '../src/core/scenario.ts';
import { sha256Hex } from '../src/core/seeded-rng.ts';

const encoder = new TextEncoder();
const assetId = 'active.mp4';
const indexUrl = 'https://fixture.test/fixtures/generation-index.json';
const fixturesBaseUrl = 'https://fixture.test/fixtures/';
const mediaBytes = new Uint8Array([0, 0, 0, 8, 102, 116, 121, 112]);
const mediaSha256 = sha256Hex(mediaBytes);
const metadata: NormalizedMetadata = { container: 'mp4', durationSec: 1, tracks: [] };

const browser: BrowserName = 'chromium';
const support: CodecSupport = {
  webcodecs: false,
  videoDecode: {},
  videoEncode: {},
  audioDecode: {},
  audioEncode: {},
  alpha: false,
  strictRgbaPixels: false,
  strictGoldenRgba: false,
  strictSourceRgba: false,
  webgpu: false,
  measureMemory: false,
};
const pixelPass: PixelBehaviorEvidence = {
  state: 'SUPPORTED',
  reasonCode: 'PIXEL_RGBA_ROUNDTRIP_OK',
  detail: 'test pixel behavior is available',
};

type EvidenceMode =
  | 'ready'
  | 'tampered'
  | 'malformed-json'
  | 'wrong-schema'
  | 'http-404'
  | 'http-500'
  | 'source-drift'
  | FixtureAvailabilityEntry['state'];

interface EngineCounters {
  preliminaryAndConcreteSupports: number;
  init: number;
  operation: number;
}

interface TestPublication {
  runtime: ActiveFixtureRuntime;
  requestedUrls: string[];
  indexRequests: () => number;
  hashCount: (logicalPath: string) => number;
}

function probeScenario() {
  return defineScenario({
    id: 'probe/active-generation-runtime',
    op: 'probe',
    input: assetId,
    requires: { operations: ['probe'], containersIn: ['mp4'] },
    oracles: ['golden-metadata'],
    metrics: [],
  });
}

function capabilitySet(): CapabilitySet {
  return {
    operations: { probe: true },
    containersIn: ['mp4'],
    containersOut: [],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    encryption: [],
    features: [],
  };
}

function fakeEngine(counters: EngineCounters): MediaEngine {
  const output = (): MediaBytes => ({ bytes: mediaBytes.slice(), mime: 'video/mp4', container: 'mp4' });
  return {
    id: 'fixture-runtime-test@1.0.0',
    capabilities: capabilitySet,
    supports: async () => {
      counters.preliminaryAndConcreteSupports += 1;
      return { supported: true };
    },
    init: async () => {
      counters.init += 1;
    },
    probe: async () => {
      counters.operation += 1;
      return metadata;
    },
    demux: async () => ({ packets: [], tracks: [], ordering: 'decode' }),
    remux: async () => output(),
    transcode: async () => output(),
    decodeFrames: async () => ({ frames: [] }),
    seek: async () => ({ landedPtsUs: 0, frame: { index: 0, ptsUs: 0, sha256: '0'.repeat(64) } }),
    trim: async () => output(),
  };
}

function counters(): EngineCounters {
  return { preliminaryAndConcreteSupports: 0, init: 0, operation: 0 };
}

function flipOneByte(bytes: Uint8Array): Uint8Array {
  const changed = bytes.slice();
  changed[changed.byteLength - 1] = changed[changed.byteLength - 1]! ^ 1;
  return changed;
}

function goldenEnvelope(schema = 'media-test/golden-artifact@1'): Record<string, unknown> {
  const payloadBytes = encoder.encode(canonicalizeJson(metadata));
  const outputArtifact = {
    digestScope: 'canonical-payload',
    sha256: sha256Hex(payloadBytes),
    sizeBytes: payloadBytes.byteLength,
  };
  const sourceMedia = { sha256: mediaSha256, sizeBytes: mediaBytes.byteLength };
  return {
    schema,
    schemaVersion: '1.0.0',
    artifactKind: 'metadata',
    assetId,
    sourceMedia,
    availability: { state: 'ready' },
    provenance: {
      schema: 'media-test/golden-provenance@1',
      schemaVersion: '1.0.0',
      artifactKind: 'metadata',
      assetId,
      sourceMedia,
      buildDefinition: {
        recipe: 'test-metadata',
        normalizedArguments: {},
        normalizedArgumentsSha256: sha256Hex(encoder.encode(canonicalizeJson({}))),
        dependencies: [],
      },
      runDetails: {
        baker: 'runner-fixture-runtime-test@1',
        perimeter: runtimeToolPerimeter(),
        startedAtIso: '2026-01-01T00:00:00.000Z',
        finishedAtIso: '2026-01-01T00:00:00.000Z',
        timeMode: 'source-date-epoch',
        browserQualified: false,
      },
      outputArtifact,
    },
    payload: metadata,
  };
}

function runtimeToolPerimeter(): Record<string, unknown> {
  const present = (name: string) => ({
    state: 'present',
    executable: name,
    versionOutput: `${name} test-version`,
  });
  return {
    schemaVersion: 'tool-perimeter@1',
    tools: {
      bun: present('bun'),
      ffmpeg: present('ffmpeg'),
      ffprobe: present('ffprobe'),
      bento4: { state: 'absent' },
      bento4Hls: { state: 'absent' },
      shakaPackager: { state: 'absent' },
      playwright: { state: 'not-applicable' },
      browser: { state: 'not-applicable' },
    },
    platform: { os: 'test', release: 'test', arch: 'test', locale: 'C', timezone: 'UTC' },
    environment: {
      SOURCE_DATE_EPOCH: '0',
      LANG: 'C',
      LC_ALL: 'C',
      TZ: 'UTC',
      BRAVE_PATH: null,
      FFMPEG_PATH: null,
      FFPROBE_PATH: null,
    },
    declaredLock: {
      sha256: 'd'.repeat(64),
      sourceDateEpoch: 0,
      locale: 'C',
      timezone: 'UTC',
      required: { bun: 'test', ffmpeg: 'test', ffprobe: 'test' },
      optional: {},
    },
  };
}

function buildPublication(options: {
  evidence?: EvidenceMode;
  tamperMedia?: boolean;
  materializedMedia?: 'ready' | 'missing' | 'corrupt';
} = {}): TestPublication {
  const evidence = options.evidence ?? 'ready';
  const manifestBytes = encoder.encode(JSON.stringify({ schema: 'media-test/fixture-manifest@1', assets: [] }));
  const validEvidenceBytes = encoder.encode(JSON.stringify(goldenEnvelope()));
  const indexedEvidenceBytes = evidence === 'malformed-json'
    ? encoder.encode('{')
    : evidence === 'wrong-schema'
      ? encoder.encode(JSON.stringify(goldenEnvelope('media-test/golden-artifact@0')))
      : validEvidenceBytes;
  const indexedEvidenceSourceSha256 = evidence === 'source-drift' ? 'f'.repeat(64) : mediaSha256;
  const zeroSha = '0'.repeat(64);

  const entry = (
    logicalPath: string,
    artifactKind: string,
    bytes: Uint8Array,
    sourceMediaSha256: string,
    provenanceSha256 = zeroSha,
  ): Omit<FixtureGenerationEntry, 'generationPath'> => {
    const digest = sha256Hex(bytes);
    return {
      logicalPath,
      artifactKind,
      sha256: digest,
      sizeBytes: bytes.byteLength,
      sourceMediaSha256,
      provenanceSha256,
      audit: {
        recipe: `test-${artifactKind}`,
        bakerVersion: 'runner-fixture-runtime-test@1',
        outputArtifactSha256: digest,
      },
    };
  };

  const identityEntries: Array<Omit<FixtureGenerationEntry, 'generationPath'>> = [
    entry('manifest.json', 'manifest', manifestBytes, zeroSha),
  ];
  const materializedMedia: FixtureMaterializedMedia[] = [];
  if (options.materializedMedia) {
    materializedMedia.push({
      logicalPath: `media/${assetId}`,
      sha256: mediaSha256,
      sizeBytes: mediaBytes.byteLength,
      provenanceSha256: zeroSha,
      audit: {
        recipe: 'test-materialized-media',
        bakerVersion: 'runner-fixture-runtime-test@1',
        outputArtifactSha256: mediaSha256,
      },
    });
  } else {
    identityEntries.push(entry(`media/${assetId}`, 'media', mediaBytes, mediaSha256));
  }
  const availability: FixtureAvailabilityEntry[] = [];
  if (evidence === 'absent-expected' || evidence === 'pending' || evidence === 'producer-failed') {
    availability.push({
      logicalPath: `golden/${assetId}.meta.json`,
      state: evidence,
      reasonCode: `TEST_${evidence.toUpperCase().replace('-', '_')}`,
      detail: 'typed availability record from the active generation',
    });
  } else {
    const provenance = (goldenEnvelope().provenance ?? {}) as Record<string, unknown>;
    identityEntries.push(entry(
      `golden/${assetId}.meta.json`,
      'metadata',
      indexedEvidenceBytes,
      indexedEvidenceSourceSha256,
      sha256Hex(encoder.encode(canonicalizeJson(provenance))),
    ));
  }
  identityEntries.sort((left, right) => left.logicalPath < right.logicalPath ? -1 : left.logicalPath > right.logicalPath ? 1 : 0);
  availability.sort((left, right) => left.logicalPath < right.logicalPath ? -1 : left.logicalPath > right.logicalPath ? 1 : 0);

  const publicationScope: FixtureGenerationIndex['publicationScope'] = {
    mode: 'selected-assets',
    assetIds: [assetId],
  };
  const generationId = sha256Hex(encoder.encode(canonicalizeJson({
    schema: FIXTURE_GENERATION_INDEX_SCHEMA,
    publicationScope,
    entries: identityEntries,
    materializedMedia,
    availability,
  })));
  const index: FixtureGenerationIndex = {
    schema: FIXTURE_GENERATION_INDEX_SCHEMA,
    schemaVersion: '1.1.0',
    generationId,
    createdAtIso: '2026-01-01T00:00:00.000Z',
    publicationScope,
    entries: identityEntries.map((value) => ({
      ...value,
      generationPath: `generations/${generationId}/${value.logicalPath}`,
    })),
    materializedMedia,
    availability,
  };

  const servedByPath = new Map<string, Uint8Array>([
    ['manifest.json', manifestBytes],
    [`media/${assetId}`, options.tamperMedia ? flipOneByte(mediaBytes) : mediaBytes],
    [`golden/${assetId}.meta.json`, evidence === 'tampered' ? flipOneByte(validEvidenceBytes) : indexedEvidenceBytes],
  ]);
  const requestedUrls: string[] = [];
  let indexRequestCount = 0;
  const hashCounts = new Map<string, number>();
  const integrityCache = new FixtureIntegrityCache({
    hash: (bytes, generationEntry) => {
      hashCounts.set(generationEntry.logicalPath, (hashCounts.get(generationEntry.logicalPath) ?? 0) + 1);
      return sha256Hex(bytes);
    },
  });
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url === indexUrl) {
      indexRequestCount += 1;
      return new Response(JSON.stringify(index), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    const generationEntry = index.entries.find((candidate) => url.endsWith(candidate.generationPath));
    const materializedEntry = index.materializedMedia.find((candidate) => url.endsWith(candidate.logicalPath));
    if (!generationEntry && !materializedEntry) return new Response(null, { status: 404, statusText: 'Not Found' });
    if (materializedEntry) {
      if (options.materializedMedia === 'missing') {
        return new Response(null, { status: 404, statusText: 'Not Found' });
      }
      const body = options.materializedMedia === 'corrupt' ? flipOneByte(mediaBytes) : mediaBytes;
      return new Response(body.slice().buffer, { status: 200 });
    }
    if (generationEntry.logicalPath === `golden/${assetId}.meta.json`) {
      if (evidence === 'http-404') return new Response(null, { status: 404, statusText: 'Not Found' });
      if (evidence === 'http-500') return new Response(null, { status: 500, statusText: 'Injected failure' });
    }
    const body = servedByPath.get(generationEntry.logicalPath);
    return body
      ? new Response(body.slice().buffer, { status: 200 })
      : new Response(null, { status: 404, statusText: 'Not Found' });
  }) as typeof fetch;

  return {
    runtime: new ActiveFixtureRuntime({ indexUrl, fixturesBaseUrl, fetchImpl, integrityCache }),
    requestedUrls,
    indexRequests: () => indexRequestCount,
    hashCount: (logicalPath) => hashCounts.get(logicalPath) ?? 0,
  };
}

describe('REQ-FIX-08/09 active-generation runtime integrity', () => {
  test('calls a receiver-checked fetch implementation with the global object', async () => {
    let observedReceiver: unknown;
    const fetchImpl = function (this: unknown): Promise<Response> {
      observedReceiver = this;
      return Promise.resolve(new Response(null, { status: 500, statusText: 'Injected failure' }));
    } as typeof fetch;
    const runtime = new ActiveFixtureRuntime({ indexUrl, fixturesBaseUrl, fetchImpl });

    const loaded = await runtime.loadIndex();

    expect(observedReceiver).toBe(globalThis);
    expect(loaded).toMatchObject({ state: 'transport-error', reasonCode: 'GENERATION_INDEX_HTTP_ERROR' });
  });

  test('a one-byte media replacement is quarantined before engine lifecycle or oracle execution', async () => {
    const publication = buildPublication({ tamperMedia: true });
    const observed = counters();
    const result = await runOne(fakeEngine(observed), probeScenario(), browser, support, {
      fixtureIntegrityRuntime: publication.runtime,
      pixelBehavior: pixelPass,
    });

    expect(result.status).toBe('NA_ASSET');
    expect(result.reason).toContain('FIXTURE_DIGEST_MISMATCH');
    expect(observed.preliminaryAndConcreteSupports).toBe(1);
    expect(observed.init).toBe(0);
    expect(observed.operation).toBe(0);
    expect(result.oracleOutcomes).toEqual([]);
    expect(publication.requestedUrls.some((url) => url.includes('/fixtures/media/'))).toBe(false);
  });

  test('a one-byte evidence replacement is quarantined before engine lifecycle or oracle execution', async () => {
    const publication = buildPublication({ evidence: 'tampered' });
    const observed = counters();
    const result = await runOne(fakeEngine(observed), probeScenario(), browser, support, {
      fixtureIntegrityRuntime: publication.runtime,
      pixelBehavior: pixelPass,
    });

    expect(result.status).toBe('NA_ASSET');
    expect(result.reason).toContain('FIXTURE_DIGEST_MISMATCH');
    expect(observed.preliminaryAndConcreteSupports).toBe(1);
    expect(observed.init).toBe(0);
    expect(observed.operation).toBe(0);
    expect(result.oracleOutcomes).toEqual([]);
    expect(publication.requestedUrls.some((url) => url.includes('/fixtures/golden/'))).toBe(false);
  });

  test('one run cache loads the index once and hashes each media/evidence identity once', async () => {
    const publication = buildPublication();
    const observed = counters();
    const execute = () => runOne(fakeEngine(observed), probeScenario(), browser, support, {
      fixtureIntegrityRuntime: publication.runtime,
      pixelBehavior: pixelPass,
    });

    const first = await execute();
    const second = await execute();

    expect(first.status).toBe('PASS');
    expect(second.status).toBe('PASS');
    expect(observed.operation).toBe(2);
    expect(publication.indexRequests()).toBe(1);
    expect(publication.hashCount(`media/${assetId}`)).toBe(1);
    expect(publication.hashCount(`golden/${assetId}.meta.json`)).toBe(1);
    expect(publication.requestedUrls.filter((url) => url.includes('/generations/'))).toHaveLength(2);
  });

  test('candidate-boundary release drops byte graphs but preserves the frozen generation index', async () => {
    const publication = buildPublication();
    expect((await publication.runtime.resolveMedia(assetId)).state).toBe('ready');
    expect(await publication.runtime.loadGoldenEvidence(assetId, 'metadata', (payload) => payload)).toBeDefined();
    publication.runtime.releaseMaterializedData();
    expect((await publication.runtime.resolveMedia(assetId)).state).toBe('ready');
    expect(await publication.runtime.loadGoldenEvidence(assetId, 'metadata', (payload) => payload)).toBeDefined();

    expect(publication.indexRequests()).toBe(1);
    expect(publication.hashCount(`media/${assetId}`)).toBe(2);
    expect(publication.hashCount(`golden/${assetId}.meta.json`)).toBe(2);
  });

  test('materialized media is verified from the ignored media path and ready evidence may bind to it', async () => {
    const publication = buildPublication({ materializedMedia: 'ready' });
    const observed = counters();
    const result = await runOne(fakeEngine(observed), probeScenario(), browser, support, {
      fixtureIntegrityRuntime: publication.runtime,
      pixelBehavior: pixelPass,
    });

    expect(result.status).toBe('PASS');
    expect(observed.operation).toBe(1);
    expect(publication.requestedUrls.some((url) => url.endsWith('/fixtures/media/active.mp4'))).toBe(true);
    expect(publication.hashCount(`media/${assetId}`)).toBe(1);
  });

  test('missing materialized media is typed NA_ASSET before engine execution', async () => {
    const publication = buildPublication({ materializedMedia: 'missing' });
    const observed = counters();
    const result = await runOne(fakeEngine(observed), probeScenario(), browser, support, {
      fixtureIntegrityRuntime: publication.runtime,
      pixelBehavior: pixelPass,
    });

    expect(result.status).toBe('NA_ASSET');
    expect(result.reason).toContain('FIXTURE_MEDIA_NOT_MATERIALIZED');
    expect(observed.init).toBe(0);
    expect(observed.operation).toBe(0);
  });

  test('corrupt materialized media is quarantined by its declaration digest', async () => {
    const publication = buildPublication({ materializedMedia: 'corrupt' });
    const observed = counters();
    const result = await runOne(fakeEngine(observed), probeScenario(), browser, support, {
      fixtureIntegrityRuntime: publication.runtime,
      pixelBehavior: pixelPass,
    });

    expect(result.status).toBe('NA_ASSET');
    expect(result.reason).toContain('FIXTURE_DIGEST_MISMATCH');
    expect(observed.init).toBe(0);
    expect(observed.operation).toBe(0);
  });
});

describe('REQ-FIX-11 typed active evidence routing', () => {
  const cases: Array<{
    evidence: EvidenceMode;
    status: 'PASS' | 'NA_ASSET' | 'ERROR';
    reasonCode?: string;
  }> = [
    { evidence: 'absent-expected', status: 'NA_ASSET', reasonCode: 'TEST_ABSENT_EXPECTED' },
    { evidence: 'pending', status: 'NA_ASSET', reasonCode: 'TEST_PENDING' },
    { evidence: 'producer-failed', status: 'NA_ASSET', reasonCode: 'TEST_PRODUCER_FAILED' },
    { evidence: 'source-drift', status: 'NA_ASSET', reasonCode: 'GOLDEN_SOURCE_DIGEST_MISMATCH' },
    { evidence: 'http-404', status: 'ERROR', reasonCode: 'FIXTURE_TRANSPORT_ERROR' },
    { evidence: 'http-500', status: 'ERROR', reasonCode: 'FIXTURE_TRANSPORT_ERROR' },
    { evidence: 'malformed-json', status: 'ERROR', reasonCode: 'GOLDEN_JSON_INVALID' },
    { evidence: 'wrong-schema', status: 'ERROR', reasonCode: 'GOLDEN_SCHEMA_ID_UNSUPPORTED' },
    { evidence: 'ready', status: 'PASS' },
  ];

  for (const fixtureCase of cases) {
    test(`${fixtureCase.evidence} routes to ${fixtureCase.status} without detail-string inference`, async () => {
      const publication = buildPublication({ evidence: fixtureCase.evidence });
      const observed = counters();
      const result = await runOne(fakeEngine(observed), probeScenario(), browser, support, {
        fixtureIntegrityRuntime: publication.runtime,
        pixelBehavior: pixelPass,
      });

      expect(result.status).toBe(fixtureCase.status);
      if (fixtureCase.reasonCode) expect(result.reason).toContain(fixtureCase.reasonCode);
      expect(observed.init).toBe(fixtureCase.status === 'PASS' ? 1 : 0);
      expect(observed.operation).toBe(fixtureCase.status === 'PASS' ? 1 : 0);
      expect(result.oracleOutcomes).toHaveLength(fixtureCase.status === 'PASS' ? 1 : 0);
    });
  }
});
