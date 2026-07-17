import { afterEach, describe, expect, test } from 'bun:test';

import type { CapabilitySet, MediaBytes, MediaEngine } from '../src/core/engine.ts';
import type { ActiveFixtureRuntime } from '../src/core/fixture-integrity.ts';
import { sha256Hex } from '../src/core/media-selection.ts';
import { registerEngine, registerScenario } from '../src/core/registry.ts';
import { runMatrix } from '../src/core/runner.ts';
import { defineScenario } from '../src/core/scenario.ts';

const originalFetch = globalThis.fetch;
const encoder = new TextEncoder();

const fixtureRuntime = {
  resolveMedia: async () => ({
    state: 'out-of-scope',
    reasonCode: 'FIXTURE_ASSET_OUTSIDE_PUBLICATION_SCOPE',
    detail: 'runner corpus streaming regression uses its own digest-bound catalog',
  }),
  loadGoldenEvidence: async () => undefined,
} as unknown as ActiveFixtureRuntime;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('runner demand-driven corpus preparation regression', () => {
  test('does not request a later scenario body before the first scenario emits its result', async () => {
    const engineId = 'runner-lazy-scenarios@1.0.0';
    const firstId = 'remux/lazy-corpus-first';
    const laterId = 'remux/lazy-corpus-later';
    const firstAsset = 'lazy-first.mp4';
    const laterAsset = 'lazy-later.mp4';
    const firstBytes = encoder.encode('first-body');
    const laterBytes = encoder.encode('later-body');
    const events: string[] = [];

    registerEngine(engineId, async () => remuxEngine(engineId));
    registerScenario(remuxScenario(firstId, firstAsset));
    registerScenario(remuxScenario(laterId, laterAsset));

    installCorpusFetch({
      rows: [
        sourceRow(firstId, 'first-real.mp4', encoder.encode('first-real')),
        sourceRow(laterId, 'later-real.mp4', encoder.encode('later-real')),
      ],
      manifestAssets: [
        manifestAsset(firstAsset, firstBytes),
        manifestAsset(laterAsset, laterBytes),
      ],
      bodies: new Map([
        [`scenarios/${firstId}/${firstAsset}`, firstBytes],
        [`scenarios/${laterId}/${laterAsset}`, laterBytes],
      ]),
      onMediaBody: (logicalPath) => events.push(`fetch:${logicalPath}`),
    });

    const results = await runMatrix({
      browser: 'chromium',
      engineIds: [engineId],
      scenarioIds: [firstId, laterId],
      pillar: 'functional',
      rotateMedia: false,
      fixtureIntegrityRuntime: fixtureRuntime,
      playbackSmoke: async () => true,
      onResult: (result) => events.push(`result:${result.scenarioId}`),
    });

    expect(results.map((result) => result.status)).toEqual(['PASS', 'PASS']);
    const firstFetch = events.indexOf(`fetch:scenarios/${firstId}/${firstAsset}`);
    const firstResult = events.indexOf(`result:${firstId}`);
    const laterFetch = events.indexOf(`fetch:scenarios/${laterId}/${laterAsset}`);
    expect(firstFetch).toBeGreaterThanOrEqual(0);
    expect(firstResult).toBeGreaterThan(firstFetch);
    expect(laterFetch).toBeGreaterThan(firstResult);
  });

  test('fetches exhaustive candidates one at a time and waits for each operation to finish', async () => {
    const engineId = 'runner-serial-exhaustive@1.0.0';
    const scenarioId = 'remux/serial-exhaustive-corpus';
    const bakedAsset = 'serial-baked.mp4';
    const mediaBodies = new Map<string, Uint8Array>([
      [`scenarios/${scenarioId}/${bakedAsset}`, encoder.encode('serial-baked')],
      [`scenarios/${scenarioId}/01-real.mp4`, encoder.encode('serial-real-one')],
      [`scenarios/${scenarioId}/02-real.mp4`, encoder.encode('serial-real-two')],
    ]);
    const fetchedBodies: string[] = [];
    const operationStarted = [deferred(), deferred(), deferred()];
    const releaseOperation = [deferred(), deferred(), deferred()];
    let operationCalls = 0;

    registerEngine(engineId, async () => remuxEngine(engineId, async () => {
      const index = operationCalls++;
      operationStarted[index]?.resolve();
      await releaseOperation[index]?.promise;
      return outputBytes();
    }));
    registerScenario(remuxScenario(scenarioId, bakedAsset));
    installCorpusFetch({
      rows: [{
        scenarioId,
        class: 'REAL',
        requires: { container: 'mp4', video: true, videoCodecs: ['h264'], audioCodecs: [] },
        files: [
          sourceFile('01-real.mp4', mediaBodies.get(`scenarios/${scenarioId}/01-real.mp4`)!),
          sourceFile('02-real.mp4', mediaBodies.get(`scenarios/${scenarioId}/02-real.mp4`)!),
        ],
      }],
      manifestAssets: [manifestAsset(bakedAsset, mediaBodies.get(`scenarios/${scenarioId}/${bakedAsset}`)!)],
      bodies: mediaBodies,
      onMediaBody: (logicalPath) => fetchedBodies.push(logicalPath),
    });

    const running = runMatrix({
      browser: 'chromium',
      engineIds: [engineId],
      scenarioIds: [scenarioId],
      pillar: 'functional',
      exhaustiveMedia: true,
      fixtureIntegrityRuntime: fixtureRuntime,
      playbackSmoke: async () => true,
    });

    let assertionError: unknown;
    try {
      await operationStarted[0]!.promise;
      expect(fetchedBodies).toHaveLength(1);

      releaseOperation[0]!.resolve();
      await operationStarted[1]!.promise;
      expect(fetchedBodies).toHaveLength(2);

      releaseOperation[1]!.resolve();
      await operationStarted[2]!.promise;
      expect(fetchedBodies).toHaveLength(3);
    } catch (error) {
      assertionError = error;
    } finally {
      for (const gate of releaseOperation) gate.resolve();
    }

    const results = await running;
    if (assertionError) throw assertionError;
    expect(operationCalls).toBe(3);
    expect(new Set(fetchedBodies).size).toBe(3);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      status: 'PASS',
      coverage: { grade: 'full', valid: 3, total: 3 },
    });
  });

  test('memoizes a same-size digest rejection across engines without invoking an adapter operation', async () => {
    const firstEngine = 'runner-stable-asset-block-a@1.0.0';
    const secondEngine = 'runner-stable-asset-block-b@1.0.0';
    const scenarioId = 'remux/stable-corpus-digest-block';
    const assetId = 'stable-digest.mp4';
    const declaredBytes = encoder.encode('declared');
    const replacedBytes = encoder.encode('replaced');
    const logicalPath = `scenarios/${scenarioId}/${assetId}`;
    let factories = 0;
    let operations = 0;
    let mediaFetches = 0;

    for (const engineId of [firstEngine, secondEngine]) {
      registerEngine(engineId, async () => {
        factories += 1;
        return remuxEngine(engineId, async () => {
          operations += 1;
          return outputBytes();
        });
      });
    }
    registerScenario(remuxScenario(scenarioId, assetId));
    installCorpusFetch({
      rows: [sourceRow(scenarioId, 'unused-real.mp4', encoder.encode('unused-real'))],
      manifestAssets: [manifestAsset(assetId, declaredBytes)],
      bodies: new Map([[logicalPath, replacedBytes]]),
      onMediaBody: () => {
        mediaFetches += 1;
      },
    });

    const results = await runMatrix({
      browser: 'chromium',
      engineIds: [firstEngine, secondEngine],
      scenarioIds: [scenarioId],
      pillar: 'functional',
      rotateMedia: false,
      fixtureIntegrityRuntime: fixtureRuntime,
      playbackSmoke: async () => true,
    });

    expect(declaredBytes.byteLength).toBe(replacedBytes.byteLength);
    expect(results.map((result) => result.status)).toEqual(['NA_ASSET', 'NA_ASSET']);
    expect(results.every((result) => result.reason?.includes('CORPUS_DIGEST_MISMATCH') === true)).toBe(true);
    expect(new Set(results.map((result) => result.reason)).size).toBe(1);
    expect(factories).toBeGreaterThanOrEqual(2);
    expect(mediaFetches).toBe(1);
    expect(operations).toBe(0);
  });
});

function remuxScenario(id: string, input: string) {
  return defineScenario({
    id,
    op: 'remux',
    input,
    options: { container: 'mp4' },
    requires: { operations: ['remux'], containersIn: ['mp4'], containersOut: ['mp4'] },
    oracles: ['playback-smoke'],
    metrics: [],
    notes: 'Demand-driven corpus preparation regression fixture.',
  });
}

function remuxEngine(
  id: string,
  remux: () => Promise<MediaBytes> = async () => outputBytes(),
): MediaEngine {
  return {
    id,
    capabilities: (): CapabilitySet => ({
      operations: { remux: true },
      containersIn: ['mp4'],
      containersOut: ['mp4'],
      videoCodecs: ['h264'],
      audioCodecs: [],
      encryption: [],
      features: ['webcodecs:independent'],
    }),
    probe: async () => ({ container: 'mp4', durationSec: 1, tracks: [] }),
    demux: async () => ({ packets: [], tracks: [], ordering: 'decode' }),
    remux,
    transcode: async () => outputBytes(),
    decodeFrames: async () => ({ frames: [] }),
    seek: async () => ({
      landedPtsUs: 0,
      frame: { index: 0, ptsUs: 0, sha256: '0'.repeat(64) },
    }),
    trim: async () => outputBytes(),
  };
}

function outputBytes(): MediaBytes {
  return {
    bytes: new Uint8Array([0, 0, 0, 8, 102, 116, 121, 112]),
    mime: 'video/mp4',
    container: 'mp4',
  };
}

function manifestAsset(id: string, bytes: Uint8Array): Record<string, unknown> {
  return {
    id,
    sha256: sha256Hex(bytes),
    sizeBytes: bytes.byteLength,
    source: 'runner corpus streaming regression fixture',
    family: 'remux',
    container: 'mp4',
    codecs: ['h264'],
    sizeBucket: 'micro',
    genMethod: 'runner-corpus-streaming-regression@1',
  };
}

function sourceRow(scenarioId: string, file: string, bytes: Uint8Array): Record<string, unknown> {
  return {
    scenarioId,
    class: 'REAL',
    requires: { container: 'mp4', video: true, videoCodecs: ['h264'], audioCodecs: [] },
    files: [sourceFile(file, bytes)],
  };
}

function sourceFile(file: string, bytes: Uint8Array): Record<string, unknown> {
  return {
    file,
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: [],
    sha256: sha256Hex(bytes),
    sizeBytes: bytes.byteLength,
    provider: 'runner-corpus-streaming-regression',
    sourcePageUrl: 'https://example.test/runner-corpus-streaming-regression',
    downloadUrl: `https://example.test/${file}`,
    probedWith: 'runner-corpus-streaming-regression@1',
  };
}

function installCorpusFetch(options: {
  rows: readonly Record<string, unknown>[];
  manifestAssets: readonly Record<string, unknown>[];
  bodies: ReadonlyMap<string, Uint8Array>;
  onMediaBody?: (logicalPath: string) => void;
}): void {
  const catalog = options.rows.map((row) => JSON.stringify(row)).join('\n');
  const manifest = {
    suiteCorpusVersion: 'runner-corpus-streaming-regression-v1',
    assets: options.manifestAssets,
  };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/fixtures/media/scenarios/_sources.ndjson')) {
      return new Response(catalog, {
        status: 200,
        headers: { 'content-type': 'application/x-ndjson' },
      });
    }
    if (url.includes('/fixtures/manifest.json')) return Response.json(manifest);
    const mediaMarker = '/fixtures/media/';
    const mediaAt = url.indexOf(mediaMarker);
    if (mediaAt >= 0) {
      const logicalPath = decodeURIComponent(url.slice(mediaAt + mediaMarker.length).split(/[?#]/, 1)[0]!);
      const body = options.bodies.get(logicalPath);
      if (!body) return new Response(null, { status: 404, statusText: 'Not Found' });
      if (init?.method === 'HEAD') return new Response(null, { status: 200 });
      options.onMediaBody?.(logicalPath);
      return new Response(body.slice(), { status: 200 });
    }
    if (url.includes('/fixtures/golden/')) {
      return new Response(null, { status: 404, statusText: 'Not Found' });
    }
    return new Response(null, { status: 404, statusText: 'Not Found' });
  }) as typeof fetch;
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
