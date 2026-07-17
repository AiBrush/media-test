import { afterEach, describe, expect, test } from 'bun:test';

import type {
  CapabilitySet,
  MediaBytes,
  MediaEngine,
  MediaInput,
  NormalizedMetadata,
} from '../src/core/engine.ts';
import type { ActiveFixtureRuntime } from '../src/core/fixture-integrity.ts';
import { sha256Hex } from '../src/core/media-selection.ts';
import { registerEngine, registerScenario } from '../src/core/registry.ts';
import { buildReport, serializeReportJson } from '../src/core/report.ts';
import { runMatrix, type ResultReuseStore } from '../src/core/runner.ts';
import { defineScenario, type ScenarioResult } from '../src/core/scenario.ts';

const encoder = new TextEncoder();
const originalFetch = globalThis.fetch;

const ENGINE_ID = 'selection-e2e-engine@1.0.0';
const SCENARIO_ID = 'probe/selection-policy-e2e';
const BAKED_ID = 'selection-policy-e2e-baked.mp4';
const REAL_PREFIX = `scenarios/${SCENARIO_ID}`;

const media = new Map<string, Uint8Array>([
  [BAKED_ID, encoder.encode('pass')],
  [`${REAL_PREFIX}/01-diff.mp4`, encoder.encode('diff')],
  [`${REAL_PREFIX}/02-fail.mp4`, encoder.encode('fail')],
  [`${REAL_PREFIX}/03-na.mp4`, encoder.encode('na')],
]);

const exactMetadata: NormalizedMetadata = {
  container: 'mp4',
  durationSec: 1,
  tracks: [{ type: 'video', codec: 'h264', rawCodec: 'h264', width: 16, height: 16 }],
};

const fakeFixtureRuntime = {
  resolveMedia: async () => ({
    state: 'out-of-scope',
    reasonCode: 'FIXTURE_ASSET_OUTSIDE_PUBLICATION_SCOPE',
    detail: 'selection e2e uses its digest-bound synthetic catalog',
  }),
  loadGoldenEvidence: async () => undefined,
} as unknown as ActiveFixtureRuntime;

let probeCalls = 0;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('REQ-SEL-08 selection -> runMatrix -> cache -> report acceptance', () => {
  test('seeded-single and exhaustive runs preserve PASS/FAIL/NA identities through report JSON', async () => {
    registerAcceptanceSurface();
    installAcceptanceFetch();
    probeCalls = 0;

    const cache = memoryResultReuseStore();
    const baseOptions = {
      browser: 'chromium' as const,
      engineIds: [ENGINE_ID],
      scenarioIds: [SCENARIO_ID],
      pillar: 'functional' as const,
      randomSeed: 'selection-policy-e2e-seed-v1',
      resultReuse: cache,
      fixtureIntegrityRuntime: fakeFixtureRuntime,
    };

    const seeded = await runMatrix({ ...baseOptions, exhaustiveMedia: false });
    expect(seeded).toHaveLength(1);
    expect(seeded[0]?.selection).toMatchObject({
      runSeed: baseOptions.randomSeed,
      candidateCount: 4,
      selectionPolicyVersion: 'hrw-sha256@1',
    });
    const seededJson = JSON.parse(serializeReportJson(buildReport({
      results: seeded,
      generatedAtIso: '2026-07-16T00:00:00.000Z',
    }).json)) as ReturnType<typeof buildReport>['json'];
    expect(seededJson.observations).toHaveLength(1);
    expect(seededJson.observations[0]?.variants).toHaveLength(1);
    expect(seededJson.observations[0]?.variants[0]?.file).toBe(seeded[0]?.selection?.file);

    const exhaustive = await runMatrix({ ...baseOptions, exhaustiveMedia: true });
    expect(exhaustive).toHaveLength(1);
    expect(exhaustive[0]).toMatchObject({ status: 'FAIL', coverage: { grade: 'partial', valid: 2, total: 4 } });
    expect(exhaustive[0]?.exhaustive?.map((entry) => entry.status).sort()).toEqual(
      ['PASS', 'FAIL', 'NA_ASSET', 'PASS'].sort(),
    );
    expect(exhaustive[0]?.exhaustive?.every((entry) => entry.sha256?.length === 64)).toBe(true);
    expect(exhaustive[0]?.exhaustive?.every((entry) => entry.oracleOutcomes.length === 1)).toBe(true);

    const report = buildReport({
      results: exhaustive,
      generatedAtIso: '2026-07-16T00:00:00.000Z',
    });
    const serialized = serializeReportJson(report.json);
    const parsed = JSON.parse(serialized) as typeof report.json;
    const observation = parsed.observations[0]!;
    expect(observation.variants.map((variant) => variant.execution).sort()).toEqual(
      ['EXECUTED', 'EXECUTED', 'EXECUTED', 'NA_ASSET'].sort(),
    );
    expect(observation.variants.map((variant) => variant.verdict ?? variant.execution).sort()).toEqual(
      ['PASS', 'PASS', 'FAIL', 'NA_ASSET'].sort(),
    );
    expect(observation.variants.every((variant) => variant.sha256?.length === 64)).toBe(true);
    const cell = parsed.cohorts.flatMap((cohort) => cohort.cells).find((candidate) =>
      candidate.engineId === ENGINE_ID && candidate.scenarioId === SCENARIO_ID);
    expect(cell).toMatchObject({
      grade: 'PARTIAL',
      counts: { expected: 4, valid: 2, pass: 2, failed: 1, naAsset: 1 },
    });
    expect(cell?.failedVariantIds).toHaveLength(1);
    expect(cell?.failedVariantIds.some((identity) => identity.includes('02-fail.mp4#'))).toBe(true);
    expect(observation.variants.find((variant) => variant.file.includes('03-na.mp4'))).toMatchObject({
      execution: 'NA_ASSET',
    });
    expect(report.markdown).toContain('Partial (2/4)');
    expect(report.markdown).toContain('02-fail.mp4');
    expect(report.markdown).toContain('03-na.mp4');

    const callsAfterFirstExhaustive = probeCalls;
    const reused = await runMatrix({ ...baseOptions, exhaustiveMedia: true });
    expect(probeCalls).toBe(callsAfterFirstExhaustive);
    expect(reused[0]?.exhaustive?.every((entry) => entry.reason?.startsWith('cached') === true)).toBe(true);
    expect(reused[0]?.selection?.runSeed).toBe(baseOptions.randomSeed);
  });
});

function registerAcceptanceSurface(): void {
  registerEngine(ENGINE_ID, async () => acceptanceEngine());
  registerScenario(defineScenario({
    id: SCENARIO_ID,
    op: 'probe',
    input: BAKED_ID,
    options: {},
    requires: { operations: ['probe'], containersIn: ['mp4'] },
    oracles: ['golden-metadata'],
    metrics: [],
    notes: 'REQ-SEL-08 real selection/runner/cache/report acceptance surface.',
  }));
}

function acceptanceEngine(): MediaEngine {
  const bytesOut = (): MediaBytes => ({
    bytes: new Uint8Array([0, 0, 0, 8, 102, 116, 121, 112]),
    mime: 'video/mp4',
    container: 'mp4',
  });
  return {
    id: ENGINE_ID,
    capabilities: (): CapabilitySet => ({
      operations: { probe: true },
      containersIn: ['mp4'],
      containersOut: ['mp4'],
      videoCodecs: ['h264'],
      audioCodecs: [],
      encryption: [],
      features: ['webcodecs:independent'],
      probeReadModes: ['whole-file'],
    }),
    probe: async (input: MediaInput): Promise<NormalizedMetadata> => {
      probeCalls += 1;
      const marker = new TextDecoder().decode(await input.arrayBuffer());
      if (marker === 'diff') {
        return { ...exactMetadata, tracks: [{ ...exactMetadata.tracks[0]!, rawCodec: 'avc1' }] };
      }
      if (marker === 'fail') return { ...exactMetadata, durationSec: 9 };
      return structuredClone(exactMetadata);
    },
    demux: async () => ({ packets: [], tracks: [], ordering: 'decode' }),
    remux: async () => bytesOut(),
    transcode: async () => bytesOut(),
    decodeFrames: async () => ({ frames: [] }),
    seek: async () => ({
      landedPtsUs: 0,
      frame: { index: 0, ptsUs: 0, sha256: '0'.repeat(64) },
    }),
    trim: async () => bytesOut(),
  };
}

function installAcceptanceFetch(): void {
  const sourceFiles = [
    sourceRecord('01-diff.mp4', media.get(`${REAL_PREFIX}/01-diff.mp4`)!),
    sourceRecord('02-fail.mp4', media.get(`${REAL_PREFIX}/02-fail.mp4`)!),
    sourceRecord('03-na.mp4', media.get(`${REAL_PREFIX}/03-na.mp4`)!),
  ];
  const catalog = JSON.stringify({
    scenarioId: SCENARIO_ID,
    class: 'REAL',
    requires: { container: 'mp4', video: true, videoCodecs: ['h264'], audioCodecs: [] },
    files: sourceFiles,
  });
  const bakedBytes = media.get(BAKED_ID)!;
  const manifest = {
    suiteCorpusVersion: 'selection-e2e-v1',
    assets: [{
      id: BAKED_ID,
      sha256: sha256Hex(bakedBytes),
      sizeBytes: bakedBytes.byteLength,
      source: 'generated selection acceptance fixture',
      family: 'probe',
      container: 'mp4',
      codecs: ['h264'],
      sizeBucket: 'micro',
      genMethod: 'selection-e2e-generator@1',
    }],
  };

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/fixtures/media/scenarios/_sources.ndjson')) {
      return new Response(catalog, { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
    }
    if (url.includes('/fixtures/manifest.json')) {
      return Response.json(manifest);
    }
    const mediaMarker = '/fixtures/media/';
    const mediaAt = url.indexOf(mediaMarker);
    if (mediaAt >= 0) {
      const assetId = decodeURIComponent(url.slice(mediaAt + mediaMarker.length).split(/[?#]/, 1)[0]!);
      const body = media.get(assetId) ??
        (assetId === `${REAL_PREFIX}/${BAKED_ID}` ? media.get(BAKED_ID) : undefined);
      if (!body) return new Response(null, { status: 404, statusText: 'Not Found' });
      if (init?.method === 'HEAD') return new Response(null, { status: 200 });
      return new Response(body.slice(), { status: 200 });
    }
    const goldenMarker = 'fixtures/golden/';
    const goldenAt = url.indexOf(goldenMarker);
    if (goldenAt >= 0) {
      const logical = url.slice(goldenAt + goldenMarker.length).split(/[?#]/, 1)[0]!;
      if (!logical.endsWith('.meta.json') || logical.includes('03-na.mp4')) {
        return new Response(null, { status: 404, statusText: 'Not Found' });
      }
      return Response.json(exactMetadata);
    }
    return new Response(null, { status: 404, statusText: 'Not Found' });
  }) as typeof fetch;
}

function sourceRecord(file: string, bytes: Uint8Array): Record<string, unknown> {
  return {
    file,
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: [],
    sha256: sha256Hex(bytes),
    sizeBytes: bytes.byteLength,
    provider: 'selection-e2e',
    sourcePageUrl: 'https://example.test/selection-e2e',
    downloadUrl: `https://example.test/${file}`,
    probedWith: 'selection-e2e-probe@1',
  };
}

function memoryResultReuseStore(): ResultReuseStore {
  const rows = new Map<string, ScenarioResult>();
  const key = (engineId: string, scenarioId: string, browser: string): string =>
    `${engineId}\u0000${scenarioId}\u0000${browser}`;
  return {
    get: async (engineId, scenarioId, browser) => rows.get(key(engineId, scenarioId, browser)),
    put: async (result) => {
      rows.set(key(result.engineId, result.scenarioId, result.browser), structuredClone(result));
    },
  };
}
