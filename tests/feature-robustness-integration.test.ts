import { afterEach, describe, expect, test } from 'bun:test';

import type {
  CapabilitySet,
  ConcreteOperationRequest,
  MediaBytes,
  MediaEngine,
  MediaInput,
  NormalizedMetadata,
  SupportDecision,
} from '../src/core/engine.ts';
import type { ActiveFixtureRuntime } from '../src/core/fixture-integrity.ts';
import { sha256Hex } from '../src/core/media-selection.ts';
import { registerEngine, registerScenario } from '../src/core/registry.ts';
import { buildReport, serializeReportJson } from '../src/core/report.ts';
import { runMatrix } from '../src/core/runner.ts';
import { defineScenario } from '../src/core/scenario.ts';

const encoder = new TextEncoder();
const originalFetch = globalThis.fetch;
const SCENARIO_ID = 'robustness/three-file-production-acceptance';
const BAKED_ID = 'robustness-three-file-pass.mp4';
const REAL_PREFIX = `scenarios/${SCENARIO_ID}`;
const FULL = 'robustness-full-engine@1.0.0';
const PARTIAL = 'robustness-partial-engine@1.0.0';
const MIXED_NA = 'robustness-mixed-na-engine@1.0.0';
const SCENARIO = defineScenario({
  id: SCENARIO_ID,
  op: 'probe',
  input: BAKED_ID,
  options: {},
  requires: { operations: ['probe'], containersIn: ['mp4'] },
  oracles: ['golden-metadata'],
  metrics: [],
  notes: 'Exact three-file production runner/report acceptance for robustness coverage.',
});

const media = new Map<string, Uint8Array>([
  [BAKED_ID, encoder.encode('pass')],
  [`${REAL_PREFIX}/01-semantic-fail.mp4`, encoder.encode('semantic-fail')],
  [`${REAL_PREFIX}/02-unsupported.mp4`, encoder.encode('unsupported')],
]);

const exactMetadata: NormalizedMetadata = {
  container: 'mp4',
  durationSec: 1,
  tracks: [{ type: 'video', codec: 'h264', rawCodec: 'h264', width: 16, height: 16 }],
};

const fixtureRuntime = {
  resolveMedia: async () => ({
    state: 'out-of-scope',
    reasonCode: 'FIXTURE_ASSET_OUTSIDE_PUBLICATION_SCOPE',
    detail: 'robustness integration uses its digest-bound synthetic corpus',
  }),
  loadGoldenEvidence: async () => undefined,
} as unknown as ActiveFixtureRuntime;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('REQ-FEAT-76 / REQ-ENG-31 production three-file robustness acceptance', () => {
  test('runMatrix and both report formats preserve full, partial 1/3, and typed unsupported evidence', async () => {
    registerAcceptanceSurface();
    installCorpusFetch();

    const results = await runMatrix({
      browser: 'chromium',
      engineIds: [FULL, PARTIAL, MIXED_NA],
      scenarioIds: [SCENARIO_ID],
      pillar: 'robustness',
      exhaustiveMedia: true,
      fixtureIntegrityRuntime: fixtureRuntime,
      robustnessWorkerFactory: () => new Worker(
        new URL('./feature-robustness-integration.worker.ts', import.meta.url),
        { type: 'module' },
      ),
    });
    expect(results).toHaveLength(3);

    const full = resultFor(results, FULL);
    expect(full).toMatchObject({ status: 'PASS', coverage: { grade: 'full', valid: 3, total: 3 } });
    expect(full.exhaustive?.map((entry) => entry.status).sort()).toEqual(['PASS', 'PASS', 'PASS']);

    const partial = resultFor(results, PARTIAL);
    expect(partial).toMatchObject({
      status: 'FAIL',
      coverage: { grade: 'partial', valid: 1, admissible: 3, total: 3 },
    });
    expect(partial.exhaustive?.map((entry) => entry.status).sort()).toEqual(['FAIL', 'FAIL', 'PASS']);
    const partialFailures = partial.exhaustive?.filter((entry) => entry.status === 'FAIL') ?? [];
    expect(partialFailures.map((entry) => entry.file).sort()).toEqual([
      '01-semantic-fail.mp4',
      '02-unsupported.mp4',
    ]);
    expect(partialFailures.every((entry) => entry.reason?.includes('duration') === true)).toBe(true);
    expect(partialFailures.every((entry) => entry.oracleOutcomes.some((outcome) =>
      outcome.state === 'VERDICT' && outcome.verdict === 'FAIL'))).toBe(true);

    const mixed = resultFor(results, MIXED_NA);
    expect(mixed).toMatchObject({
      status: 'FAIL',
      coverage: { grade: 'partial', valid: 1, admissible: 2, total: 3 },
    });
    expect(mixed.exhaustive?.map((entry) => entry.status).sort()).toEqual(['FAIL', 'NA_ENGINE', 'PASS']);
    expect(mixed.exhaustive?.find((entry) => entry.status === 'NA_ENGINE')).toMatchObject({
      file: '02-unsupported.mp4',
    });
    expect(mixed.exhaustive?.find((entry) => entry.status === 'NA_ENGINE')?.reason)
      .toContain('[ROBUSTNESS_CONCRETE_TUPLE_UNSUPPORTED]');

    const report = buildReport({ results, generatedAtIso: '2026-07-16T00:00:00.000Z' });
    const parsed = JSON.parse(serializeReportJson(report.json)) as typeof report.json;
    const partialCell = parsed.cohorts.flatMap((cohort) => cohort.cells).find((cell) =>
      cell.engineId === PARTIAL && cell.scenarioId === SCENARIO_ID && cell.grade === 'PARTIAL');
    expect(partialCell).toMatchObject({
      grade: 'PARTIAL',
      counts: { expected: 3, valid: 1, pass: 1, failed: 2 },
    });
    expect(partialCell?.failedVariantIds).toHaveLength(2);
    const mixedObservation = parsed.observations.find((observation) =>
      observation.engineId === MIXED_NA && observation.scenarioId === SCENARIO_ID);
    expect(mixedObservation?.variants.map((variant) => variant.verdict ?? variant.execution).sort()).toEqual([
      'FAIL', 'NA_ENGINE', 'PASS',
    ]);
    expect(report.markdown).toContain('Partial (1/3)');
    expect(report.markdown).toContain('01-semantic-fail.mp4');
    expect(report.markdown).toContain('02-unsupported.mp4');
    expect(report.markdown).toContain('ROBUSTNESS_CONCRETE_TUPLE_UNSUPPORTED');
  });
});

function registerAcceptanceSurface(): void {
  for (const mode of [FULL, PARTIAL, MIXED_NA] as const) {
    registerEngine(mode, async () => acceptanceEngine(mode));
  }
  registerScenario(SCENARIO);
}

function acceptanceEngine(mode: typeof FULL | typeof PARTIAL | typeof MIXED_NA): MediaEngine {
  const bytesOut = (): MediaBytes => ({
    bytes: new Uint8Array([0, 0, 0, 8, 102, 116, 121, 112]),
    mime: 'video/mp4',
    container: 'mp4',
  });
  return {
    id: mode,
    capabilities: (): CapabilitySet => ({
      operations: { probe: true },
      containersIn: ['mp4'],
      containersOut: [],
      videoCodecs: ['h264'],
      audioCodecs: [],
      encryption: [],
      features: ['webcodecs:independent'],
      probeReadModes: ['whole-file'],
    }),
    supports: (request: ConcreteOperationRequest): SupportDecision => {
      if (mode === MIXED_NA && request.inputs[0]?.id.endsWith('02-unsupported.mp4')) {
        return {
          supported: false,
          status: 'NA_ENGINE',
          reasonCode: 'ROBUSTNESS_CONCRETE_TUPLE_UNSUPPORTED',
          reason: 'this concrete valid file tuple is outside the adapter parser surface',
        };
      }
      return { supported: true };
    },
    probe: async (input: MediaInput): Promise<NormalizedMetadata> => {
      const marker = new TextDecoder().decode(await input.arrayBuffer());
      if (mode === FULL || marker === 'pass') return structuredClone(exactMetadata);
      return { ...structuredClone(exactMetadata), durationSec: marker === 'semantic-fail' ? 9 : 10 };
    },
    demux: async () => ({ packets: [], tracks: [], ordering: 'decode' }),
    remux: async () => bytesOut(),
    transcode: async () => bytesOut(),
    decodeFrames: async () => ({ frames: [] }),
    seek: async () => ({ landedPtsUs: 0, frame: { index: 0, ptsUs: 0, sha256: '0'.repeat(64) } }),
    trim: async () => bytesOut(),
  };
}

function installCorpusFetch(): void {
  const sourceFiles = [
    sourceRecord('01-semantic-fail.mp4', media.get(`${REAL_PREFIX}/01-semantic-fail.mp4`)! ),
    sourceRecord('02-unsupported.mp4', media.get(`${REAL_PREFIX}/02-unsupported.mp4`)! ),
  ];
  const catalog = JSON.stringify({
    scenarioId: SCENARIO_ID,
    class: 'REAL',
    requires: { container: 'mp4', video: true, videoCodecs: ['h264'], audioCodecs: [] },
    files: sourceFiles,
  });
  const bakedBytes = media.get(BAKED_ID)!;
  const manifest = {
    suiteCorpusVersion: 'robustness-three-file-v1',
    assets: [{
      id: BAKED_ID,
      sha256: sha256Hex(bakedBytes),
      sizeBytes: bakedBytes.byteLength,
      source: 'generated robustness acceptance fixture',
      family: 'robustness',
      container: 'mp4',
      codecs: ['h264'],
      sizeBucket: 'micro',
      genMethod: 'robustness-three-file-generator@1',
    }],
  };

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/fixtures/media/scenarios/_sources.ndjson')) {
      return new Response(catalog, { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
    }
    if (url.includes('/fixtures/manifest.json')) return Response.json(manifest);
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
    const goldenAt = url.indexOf('fixtures/golden/');
    if (goldenAt >= 0) {
      const logical = url.slice(goldenAt + 'fixtures/golden/'.length).split(/[?#]/, 1)[0]!;
      if (logical.endsWith('.meta.json')) return Response.json(exactMetadata);
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
    provider: 'robustness-acceptance',
    sourcePageUrl: 'https://example.test/robustness-acceptance',
    downloadUrl: `https://example.test/${file}`,
    probedWith: 'robustness-acceptance-probe@1',
    contract: {
      scenarioId: SCENARIO_ID,
      scenarioContractDigest: SCENARIO.definitionHash,
      sourceSha256: sha256Hex(bytes),
      kind: 'robustness-variant',
    },
    evidence: {
      sourceSha256: sha256Hex(bytes),
      available: ['SOURCE_GOLDEN'],
      requiredOracles: ['golden-metadata'],
      sufficientOracleSets: [['golden-metadata']],
    },
  };
}

function resultFor<T extends { engineId: string }>(rows: readonly T[], engineId: string): T {
  const value = rows.find((row) => row.engineId === engineId);
  if (!value) throw new Error(`missing result for ${engineId}`);
  return value;
}
