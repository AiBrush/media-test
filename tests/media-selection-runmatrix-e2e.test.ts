import { afterEach, describe, expect, test } from 'bun:test';

import type {
  CapabilitySet,
  MediaBytes,
  MediaEngine,
  MediaInput,
  NormalizedMetadata,
} from '../src/core/engine.ts';
import {
  AUTHENTICATED_RANGE_INPUT_FEATURE,
  AUTHENTICATED_RANGE_PROBE_FEATURE,
} from '../src/core/engine.ts';
import type { ActiveFixtureRuntime } from '../src/core/fixture-integrity.ts';
import { sha256Hex } from '../src/core/media-selection.ts';
import { registerEngine, registerScenario } from '../src/core/registry.ts';
import { buildReport, serializeReportJson } from '../src/core/report.ts';
import { runMatrix, type ResultReuseStore } from '../src/core/runner.ts';
import { defineScenario, type ScenarioResult } from '../src/core/scenario.ts';

const encoder = new TextEncoder();
const originalFetch = globalThis.fetch;

const ENGINE_REGISTRATION_ID = 'selection-e2e-engine';
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
let mediaBodyFetches = 0;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('REQ-SEL-08 selection -> runMatrix -> cache -> report acceptance', () => {
  test('seeded-single and exhaustive runs preserve PASS/FAIL/NA identities through report JSON', async () => {
    registerAcceptanceSurface();
    installAcceptanceFetch();
    probeCalls = 0;
    mediaBodyFetches = 0;

    const cache = validatedPersistentResultReuseStore();
    const baseOptions = {
      browser: 'chromium' as const,
      engineIds: [ENGINE_REGISTRATION_ID],
      scenarioIds: [SCENARIO_ID],
      pillar: 'all' as const,
      benchOptions: {
        warmup: 1,
        iters: 1,
        minDurationMs: 0.01,
        minRepetitions: 5,
        slowRepetitions: 3,
        maxInnerIterations: 1,
      },
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
    const fetchesAfterFirstExhaustive = mediaBodyFetches;
    const reused = await runMatrix({ ...baseOptions, exhaustiveMedia: true });
    expect(probeCalls).toBe(callsAfterFirstExhaustive);
    expect(mediaBodyFetches).toBe(fetchesAfterFirstExhaustive);
    expect(reused[0]?.cacheReuse?.sourceRunId).toBe('selection-e2e-prior-run');
    expect(reused[0]?.exhaustive?.every((entry) => entry.reason?.startsWith('cached') === true)).toBe(true);
    expect(reused[0]?.selection?.runSeed).toBe(baseOptions.randomSeed);
    expect(reused[0]?.env?.engineId).toBe(ENGINE_ID);

    await runMatrix({
      ...baseOptions,
      exhaustiveMedia: true,
      benchOptions: { ...baseOptions.benchOptions, warmup: 2 },
    });
    expect(mediaBodyFetches).toBeGreaterThan(fetchesAfterFirstExhaustive);
  });

  test('scale-probe preflight blocks seeded and exhaustive whole-file rows before media operations', async () => {
    const engineId = 'selection-scale-preflight-engine@1.0.0';
    const scenarioId = 'probe/selection-scale-preflight';
    const bakedId = 'selection-scale-preflight-baked.mp4';
    const identities = new Map<string, { sha256: string; sizeBytes: number }>([
      [bakedId, { sha256: '0'.repeat(64), sizeBytes: 1_000_000_000 }],
      ['01.mp4', { sha256: '1'.repeat(64), sizeBytes: 1_100_000_000 }],
      ['02.mp4', { sha256: '2'.repeat(64), sizeBytes: 1_200_000_000 }],
      ['03.mp4', { sha256: '3'.repeat(64), sizeBytes: 1_300_000_000 }],
    ]);
    let mediaAssetRequests = 0;
    let goldenRequests = 0;
    let supportsCalls = 0;
    let initCalls = 0;
    let probeCalls = 0;

    registerEngine(engineId, async (): Promise<MediaEngine> => ({
      id: engineId,
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
      supports: async () => {
        supportsCalls += 1;
        return { supported: true };
      },
      init: async () => {
        initCalls += 1;
      },
      probe: async () => {
        probeCalls += 1;
        return structuredClone(exactMetadata);
      },
      demux: async () => ({ packets: [], tracks: [], ordering: 'decode' }),
      remux: async () => ({ bytes: new Uint8Array(), mime: 'video/mp4', container: 'mp4' }),
      transcode: async () => ({ bytes: new Uint8Array(), mime: 'video/mp4', container: 'mp4' }),
      decodeFrames: async () => ({ frames: [] }),
      seek: async () => ({
        landedPtsUs: 0,
        frame: { index: 0, ptsUs: 0, sha256: '0'.repeat(64) },
      }),
      trim: async () => ({ bytes: new Uint8Array(), mime: 'video/mp4', container: 'mp4' }),
    }));
    registerScenario(defineScenario({
      id: scenarioId,
      op: 'probe',
      input: bakedId,
      options: {
        robustness: {
          probe: {
            schema: 'media-test/probe-scenario-contract@1',
            probeBudget: {
              schema: 'media-test/probe-budget@1',
              scale: 'massive',
              allowedReadModes: ['range', 'progressive'],
              maxBytesRead: 32 * 1024 * 1024,
              maxReadFraction: 0.04,
              maxPeakMemoryDeltaBytes: 128 * 1024 * 1024,
            },
          },
        },
      },
      requires: { operations: ['probe'], containersIn: ['mp4'] },
      oracles: ['golden-metadata'],
      metrics: [],
    }));

    const sourceFiles = [...identities.entries()].slice(1).map(([file, identity]) => ({
      file,
      container: 'mp4',
      videoCodecs: ['h264'],
      audioCodecs: [],
      ...identity,
      provider: 'selection-scale-preflight',
      sourcePageUrl: 'https://example.test/selection-scale-preflight',
      downloadUrl: `https://example.test/${file}`,
      probedWith: 'selection-scale-preflight@1',
    }));
    const catalog = JSON.stringify({
      scenarioId,
      class: 'REAL',
      requires: { container: 'mp4', video: true, videoCodecs: ['h264'], audioCodecs: [] },
      files: sourceFiles,
    });
    const bakedIdentity = identities.get(bakedId)!;
    const manifest = {
      suiteCorpusVersion: 'selection-scale-preflight-v1',
      assets: [{
        id: bakedId,
        ...bakedIdentity,
        source: 'declared-only scale preflight fixture',
        family: 'probe',
        container: 'mp4',
        codecs: ['h264'],
        sizeBucket: 'huge',
        genMethod: 'selection-scale-preflight@1',
      }],
    };
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/fixtures/media/scenarios/_sources.ndjson')) {
        return new Response(catalog, { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
      }
      if (url.includes('/fixtures/manifest.json')) return Response.json(manifest);
      if (url.includes('/fixtures/media/')) {
        mediaAssetRequests += 1;
        return new Response(null, { status: 500, statusText: 'media body must not be requested' });
      }
      if (url.includes('/fixtures/golden/')) {
        goldenRequests += 1;
        return new Response(null, { status: 500, statusText: 'golden must not be requested' });
      }
      return new Response(null, { status: 404, statusText: 'Not Found' });
    }) as typeof fetch;

    const baseOptions = {
      browser: 'chromium' as const,
      engineIds: [engineId],
      scenarioIds: [scenarioId],
      pillar: 'all' as const,
      randomSeed: 'selection-scale-preflight-seed-v1',
      fixtureIntegrityRuntime: fakeFixtureRuntime,
    };
    const seeded = await runMatrix({ ...baseOptions, exhaustiveMedia: false });
    expect(seeded).toHaveLength(1);
    expect(seeded[0]).toMatchObject({
      status: 'NA_ENGINE',
      reason: expect.stringContaining('PROBE_BOUNDED_READ_MODE_UNAVAILABLE'),
    });
    expect(identities.get(seeded[0]!.selection!.file)).toMatchObject({
      sha256: seeded[0]!.selection!.sha256,
    });
    expect(seeded[0]?.selection?.candidateIdentity).toHaveLength(64);
    expect({ mediaAssetRequests, goldenRequests, supportsCalls, initCalls, probeCalls }).toEqual({
      mediaAssetRequests: 0,
      goldenRequests: 0,
      supportsCalls: 0,
      initCalls: 0,
      probeCalls: 0,
    });

    const exhaustive = await runMatrix({ ...baseOptions, exhaustiveMedia: true });
    expect(exhaustive).toHaveLength(1);
    expect(exhaustive[0]).toMatchObject({
      status: 'NA_ENGINE',
      reason: expect.stringContaining('PROBE_BOUNDED_READ_MODE_UNAVAILABLE'),
      coverage: { grade: 'none', valid: 0, total: 4, counts: { naEngine: 4, total: 4 } },
      selection: { candidateCount: 4 },
    });
    expect(exhaustive[0]?.selection?.candidateIdentity).toHaveLength(64);
    expect(exhaustive[0]?.selection?.executedInputDigest).toHaveLength(64);
    expect(exhaustive[0]?.exhaustive).toHaveLength(4);
    expect(exhaustive[0]?.exhaustive?.map((entry) => entry.file).sort()).toEqual([...identities.keys()].sort());
    expect(exhaustive[0]?.exhaustive?.every((entry) =>
      entry.status === 'NA_ENGINE' &&
      entry.sha256 === identities.get(entry.file)?.sha256 &&
      entry.selection?.candidateIdentity?.length === 64 &&
      entry.selection?.executedInputDigest?.length === 64
    )).toBe(true);
    expect({ mediaAssetRequests, goldenRequests, supportsCalls, initCalls, probeCalls }).toEqual({
      mediaAssetRequests: 0,
      goldenRequests: 0,
      supportsCalls: 0,
      initCalls: 0,
      probeCalls: 0,
    });
  });

  test('large remux preflight rejects unauthenticated adapters before fetching the media body', async () => {
    const registrationId = 'selection-large-remux-preflight-engine';
    const engineId = `${registrationId}@1.0.0`;
    const scenarioId = 'remux/selection-large-range-preflight';
    const assetId = 'selection-large-range-preflight.mp4';
    let mediaAssetRequests = 0;
    let supportsCalls = 0;
    let initCalls = 0;
    let remuxCalls = 0;

    registerEngine(registrationId, async (): Promise<MediaEngine> => ({
      id: engineId,
      capabilities: (): CapabilitySet => ({
        operations: { remux: true },
        containersIn: ['mp4'],
        containersOut: ['mp4'],
        videoCodecs: ['h264'],
        audioCodecs: [],
        encryption: [],
        features: ['webcodecs:independent'],
      }),
      supports: async () => {
        supportsCalls += 1;
        return { supported: true };
      },
      init: async () => {
        initCalls += 1;
      },
      probe: async () => structuredClone(exactMetadata),
      demux: async () => ({ packets: [], tracks: [], ordering: 'decode' }),
      remux: async () => {
        remuxCalls += 1;
        return { bytes: new Uint8Array(), mime: 'video/mp4', container: 'mp4' };
      },
      transcode: async () => ({ bytes: new Uint8Array(), mime: 'video/mp4', container: 'mp4' }),
      decodeFrames: async () => ({ frames: [] }),
      seek: async () => ({
        landedPtsUs: 0,
        frame: { index: 0, ptsUs: 0, sha256: '0'.repeat(64) },
      }),
      trim: async () => ({ bytes: new Uint8Array(), mime: 'video/mp4', container: 'mp4' }),
    }));
    registerScenario(defineScenario({
      id: scenarioId,
      op: 'remux',
      input: assetId,
      requires: {
        operations: ['remux'],
        containersIn: ['mp4'],
        containersOut: ['mp4'],
      },
      options: { container: 'mp4' },
      oracles: ['playback-smoke'],
      metrics: [],
    }));

    const manifest = {
      suiteCorpusVersion: 'selection-large-remux-preflight-v1',
      assets: [{
        id: assetId,
        sha256: '4'.repeat(64),
        sizeBytes: 512 * 1024 * 1024,
        source: 'declared-only large remux preflight fixture',
        family: 'remux',
        container: 'mp4',
        codecs: ['h264'],
        sizeBucket: 'huge',
        genMethod: 'selection-large-remux-preflight@1',
      }],
    };
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/fixtures/media/scenarios/_sources.ndjson')) {
        return new Response(null, { status: 404, statusText: 'catalog intentionally absent' });
      }
      if (url.includes('/fixtures/manifest.json')) return Response.json(manifest);
      if (url.includes('/fixtures/media/')) {
        mediaAssetRequests += 1;
        return new Response(null, { status: 500, statusText: 'media body must not be requested' });
      }
      return new Response(null, { status: 404, statusText: 'Not Found' });
    }) as typeof fetch;

    const results = await runMatrix({
      browser: 'chromium',
      engineIds: [registrationId],
      scenarioIds: [scenarioId],
      pillar: 'all',
      randomSeed: 'selection-large-remux-preflight-v1',
      rotateMedia: false,
      fixtureIntegrityRuntime: fakeFixtureRuntime,
    });
    expect(results[0]).toMatchObject({
      status: 'NA_ENGINE',
      reason: expect.stringContaining(AUTHENTICATED_RANGE_INPUT_FEATURE),
    });
    expect({ mediaAssetRequests, supportsCalls, initCalls, remuxCalls }).toEqual({
      mediaAssetRequests: 0,
      supportsCalls: 0,
      initCalls: 0,
      remuxCalls: 0,
    });
  });

  test('range-capable scale rows stream-attest once, receive the original URL, and quarantine corruption', async () => {
    const engineId = 'selection-scale-range-engine@1.0.0';
    const unauthenticatedEngineId = 'selection-scale-remotion-like-engine@1.0.0';
    const scenarioId = 'probe/selection-scale-range';
    const assetId = 'selection-scale-range.mp4';
    const logicalPath = `scenarios/${scenarioId}/${assetId}`;
    const admitted = encoder.encode('authenticated-scale-selection');
    const identity = { sha256: sha256Hex(admitted), sizeBytes: admitted.byteLength };
    let served = admitted.slice();
    let bodyFetches = 0;
    let probeCalls = 0;
    let memorySamples = 0;
    let unauthenticatedProbeCalls = 0;
    let observedInput: MediaInput | undefined;

    registerEngine(engineId, async (): Promise<MediaEngine> => ({
      id: engineId,
      capabilities: (): CapabilitySet => ({
        operations: { probe: true },
        containersIn: ['mp4'],
        containersOut: ['mp4'],
        videoCodecs: ['h264'],
        audioCodecs: [],
        encryption: [],
        features: ['webcodecs:independent', AUTHENTICATED_RANGE_PROBE_FEATURE],
        probeReadModes: ['range', 'whole-file'],
      }),
      supports: async () => ({ supported: true }),
      probe: async (input) => {
        probeCalls += 1;
        observedInput = input;
        expect(input.url).toEndWith(`/fixtures/media/${logicalPath}`);
        expect(input.url.startsWith('blob:')).toBe(false);
        expect(input.contentAttestation).toMatchObject({
          logicalPath,
          sha256: identity.sha256,
          sizeBytes: identity.sizeBytes,
        });
        await expect(input.arrayBuffer()).rejects.toThrow('ATTESTED_URL_WHOLE_FILE_FORBIDDEN');
        return {
          container: 'mp4', durationSec: 1, tracks: [],
          telemetry: { bytesRead: 1 }, probeEvidence: { readMode: 'range' },
        };
      },
      demux: async () => ({ packets: [], tracks: [], ordering: 'decode' }),
      remux: async () => ({ bytes: new Uint8Array(), mime: 'video/mp4', container: 'mp4' }),
      transcode: async () => ({ bytes: new Uint8Array(), mime: 'video/mp4', container: 'mp4' }),
      decodeFrames: async () => ({ frames: [] }),
      seek: async () => ({ landedPtsUs: 0, frame: { index: 0, ptsUs: 0, sha256: '0'.repeat(64) } }),
      trim: async () => ({ bytes: new Uint8Array(), mime: 'video/mp4', container: 'mp4' }),
    }));
    registerEngine(unauthenticatedEngineId, async (): Promise<MediaEngine> => ({
      id: unauthenticatedEngineId,
      capabilities: (): CapabilitySet => ({
        operations: { probe: true },
        containersIn: ['mp4'],
        containersOut: ['mp4'],
        videoCodecs: ['h264'],
        audioCodecs: [],
        encryption: [],
        features: ['webcodecs:independent'],
        probeReadModes: ['range', 'progressive'],
      }),
      supports: async () => ({ supported: true }),
      probe: async () => {
        unauthenticatedProbeCalls += 1;
        return {
          container: 'mp4', durationSec: 1, tracks: [],
          telemetry: { bytesRead: 1 }, probeEvidence: { readMode: 'range' },
        };
      },
      demux: async () => ({ packets: [], tracks: [], ordering: 'decode' }),
      remux: async () => ({ bytes: new Uint8Array(), mime: 'video/mp4', container: 'mp4' }),
      transcode: async () => ({ bytes: new Uint8Array(), mime: 'video/mp4', container: 'mp4' }),
      decodeFrames: async () => ({ frames: [] }),
      seek: async () => ({ landedPtsUs: 0, frame: { index: 0, ptsUs: 0, sha256: '0'.repeat(64) } }),
      trim: async () => ({ bytes: new Uint8Array(), mime: 'video/mp4', container: 'mp4' }),
    }));
    registerScenario(defineScenario({
      id: scenarioId,
      op: 'probe',
      input: assetId,
      options: {
        robustness: {
          probe: {
            schema: 'media-test/probe-scenario-contract@1',
            probeBudget: {
              schema: 'media-test/probe-budget@1',
              scale: 'large',
              allowedReadModes: ['range'],
              maxBytesRead: admitted.byteLength,
              maxReadFraction: 1,
              maxPeakMemoryDeltaBytes: 1024,
            },
          },
        },
      },
      requires: { operations: ['probe'], containersIn: ['mp4'] },
      oracles: ['golden-metadata'],
      metrics: ['wall', 'peakMemory'],
    }));

    const manifest = {
      suiteCorpusVersion: 'selection-scale-range-v1',
      assets: [{
        id: assetId,
        ...identity,
        source: 'stream attestation test',
        family: 'probe',
        container: 'mp4',
        codecs: ['h264'],
        sizeBucket: 'large',
        genMethod: 'selection-scale-range@1',
      }],
    };
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/fixtures/media/scenarios/_sources.ndjson')) {
        return new Response(null, { status: 404, statusText: 'catalog intentionally absent' });
      }
      if (url.includes('/fixtures/manifest.json')) return Response.json(manifest);
      if (url.endsWith(`/fixtures/media/${logicalPath}`)) {
        bodyFetches += 1;
        return new Response(served.slice(), { status: 200 });
      }
      if (url.endsWith(`fixtures/golden/${assetId}.meta.json`)) {
        return Response.json({ container: 'mp4', durationSec: 1, tracks: [] });
      }
      return new Response(null, { status: 404, statusText: 'Not Found' });
    }) as typeof fetch;

    const memoryDescriptor = Object.getOwnPropertyDescriptor(performance, 'measureUserAgentSpecificMemory');
    const isolationDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crossOriginIsolated');
    Object.defineProperty(performance, 'measureUserAgentSpecificMemory', {
      configurable: true,
      value: async () => ({ bytes: 100 + ++memorySamples }),
    });
    Object.defineProperty(globalThis, 'crossOriginIsolated', { configurable: true, value: true });
    try {
      const options = {
        browser: 'chromium' as const,
        engineIds: [engineId],
        scenarioIds: [scenarioId],
        pillar: 'performance' as const,
        randomSeed: 'selection-scale-range-seed-v1',
        rotateMedia: false,
        fixtureIntegrityRuntime: fakeFixtureRuntime,
      };
      const rejected = await runMatrix({
        ...options,
        engineIds: [unauthenticatedEngineId],
      });
      expect(rejected[0]).toMatchObject({
        status: 'NA_ENGINE',
        reason: expect.stringContaining('PROBE_AUTHENTICATED_RANGE_TRANSPORT_UNAVAILABLE'),
      });
      expect(bodyFetches).toBe(0);
      expect(unauthenticatedProbeCalls).toBe(0);

      const accepted = await runMatrix(options);
      expect(accepted[0]).toMatchObject({ status: 'PASS' });
      expect(accepted[0]?.measurement).toMatchObject({ state: 'AVAILABLE' });
      expect(accepted[0]?.bench?.wall?.n).toBe(5);
      expect(bodyFetches).toBe(1);
      expect(probeCalls).toBe(8); // functional + warmup + calibration + five measured repetitions
      expect(memorySamples).toBe(18); // 3 functional + 3 × five retained benchmark repetitions
      expect(observedInput?.contentAttestation?.sha256).toBe(identity.sha256);

      served = admitted.slice();
      served[0] ^= 0xff;
      const corrupt = await runMatrix(options);
      expect(corrupt[0]).toMatchObject({
        status: 'NA_ASSET',
        reason: expect.stringContaining('CORPUS_DIGEST_MISMATCH'),
      });
      expect(bodyFetches).toBe(2);
      expect(probeCalls).toBe(8);
      expect(memorySamples).toBe(18);
    } finally {
      if (memoryDescriptor) Object.defineProperty(performance, 'measureUserAgentSpecificMemory', memoryDescriptor);
      else Reflect.deleteProperty(performance, 'measureUserAgentSpecificMemory');
      if (isolationDescriptor) Object.defineProperty(globalThis, 'crossOriginIsolated', isolationDescriptor);
      else Reflect.deleteProperty(globalThis, 'crossOriginIsolated');
    }
  });
});

function registerAcceptanceSurface(): void {
  registerEngine(ENGINE_REGISTRATION_ID, async () => acceptanceEngine());
  registerScenario(defineScenario({
    id: SCENARIO_ID,
    op: 'probe',
    input: BAKED_ID,
    options: {},
    requires: { operations: ['probe'], containersIn: ['mp4'] },
    oracles: ['golden-metadata'],
    metrics: ['wall'],
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
      const body = media.get(assetId);
      if (!body) return new Response(null, { status: 404, statusText: 'Not Found' });
      if (init?.method === 'HEAD') return new Response(null, { status: 200 });
      mediaBodyFetches += 1;
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

function validatedPersistentResultReuseStore(): ResultReuseStore {
  const rows = new Map<string, ScenarioResult>();
  const key = (engineId: string, scenarioId: string, browser: string): string =>
    `${engineId}\u0000${scenarioId}\u0000${browser}`;
  return {
    exactSelectionReuse: true,
    get: async (engineId, scenarioId, browser) => {
      const sourceKey = key(engineId, scenarioId, browser);
      const stored = rows.get(sourceKey);
      if (!stored) return undefined;
      const cacheReuse = {
        schema: 'media-test/cache-reuse@1' as const,
        sourceKey,
        sourceObservationHash:
          stored.executionFingerprint?.hash ??
          stored.exhaustive?.find((entry) => entry.executionFingerprint)?.executionFingerprint?.hash ??
          'a'.repeat(64),
        sourceRunId: 'selection-e2e-prior-run',
        createdAtIso: '2026-07-18T00:00:00.000Z',
        originalOrigin: 'http://127.0.0.1:5151',
        validationEpoch: 'selection-e2e-current',
        validBecause: 'test store admitted the exact selection key and current validation epoch',
        ...(stored.env ? { sourceEnvironment: stored.env } : {}),
        ...(stored.selection ? { selectionEnvelope: stored.selection } : {}),
      };
      return {
        ...structuredClone(stored),
        cacheReuse,
        ...(stored.exhaustive
          ? { exhaustive: stored.exhaustive.map((entry) => ({ ...structuredClone(entry), cacheReuse })) }
          : {}),
      };
    },
    put: async (result) => {
      const stored = structuredClone(result);
      delete stored.cacheReuse;
      if (stored.exhaustive) {
        stored.exhaustive = stored.exhaustive.map((entry) => {
          const clean = { ...entry };
          delete clean.cacheReuse;
          return clean;
        });
      }
      rows.set(key(result.engineId, result.scenarioId, result.browser), stored);
    },
  };
}
