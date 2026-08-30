import { describe, expect, test } from 'bun:test';
import { $ } from 'bun';

import type { ScenarioResult } from '../src/core/scenario.ts';
import {
  BUNDLE_MEASUREMENTS_SCHEMA_ID,
  RAW_RUN_SCHEMA_ID,
  REPORTING_SCHEMA_DIALECT,
  REPORTING_SCHEMA_VERSION,
  createBundleMeasurementsArtifact,
  buildReport,
  joinBundleMeasurement,
  parseRawRunArtifact,
  schemaIdFor,
  validateReportArtifact,
} from '../src/core/report.ts';
import type {
  BundleJoinExpectation,
  BundleMeasurementDefinition,
  BundleMeasurement,
} from '../src/core/report.ts';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

describe('REQ-REP-14: versioned schemas and boundary validation', () => {
  test('all four schema documents declare 2020-12 and canonical versioned ids', async () => {
    const names = ['raw-run', 'normalized-observations', 'report', 'bundle-measurements'];
    for (const name of names) {
      const schema = JSON.parse(await Bun.file(`${ROOT}/schemas/reporting/${name}.schema.json`).text());
      expect(schema.$schema).toBe(REPORTING_SCHEMA_DIALECT);
      expect(schema.$id).toBe(schemaIdFor(name, REPORTING_SCHEMA_VERSION));
      expect(schema.additionalProperties).toBe(true);
    }
  });

  test('unknown majors reject while an additive known-major minor field validates', () => {
    const base = rawArtifact();
    expect(() => parseRawRunArtifact({
      ...base,
      schemaVersion: '2.0.0',
      schemaId: schemaIdFor('raw-run', '2.0.0'),
    })).toThrow('SCHEMA_MAJOR_UNSUPPORTED');
    const additive = parseRawRunArtifact({
      ...base,
      schemaVersion: '1.1.0',
      schemaId: schemaIdFor('raw-run', '1.1.0'),
      additiveMinorField: { preserved: true },
      scenarioDefinitionHashes: { 'probe/example': 'scenario-hash' },
    });
    expect(additive.schemaVersion).toBe('1.1.0');
    expect(additive.evidence.additiveMinorField).toEqual({ preserved: true });
    expect(additive.evidence.suiteVersion).toBe('suite-commit');
    expect(additive.evidence.scenarioDefinitionHashes).toEqual({ 'probe/example': 'scenario-hash' });
  });

  test('untagged arrays and guessed results objects reject; the explicit legacy tag migrates', () => {
    expect(() => parseRawRunArtifact([rawResult()])).toThrow('ARTIFACT_NOT_OBJECT');
    expect(() => parseRawRunArtifact({ generatedAtIso: '2026-01-01T00:00:00Z', results: [rawResult()] })).toThrow('ARTIFACT_INVALID');
    const legacy = parseRawRunArtifact({
      schema: 'media-browser-test/results@1',
      generatedAtIso: '2026-01-01T00:00:00Z',
      results: [rawResult()],
    });
    expect(legacy.schemaId).toBe(RAW_RUN_SCHEMA_ID);
  });

  test('new raw runs require their declared identity and report readers verify canonical hashes', () => {
    const raw = rawArtifact();
    expect(() => parseRawRunArtifact({ ...raw, runId: undefined })).toThrow('$.runId');
    expect(() => parseRawRunArtifact({ ...raw, suiteVersion: undefined })).toThrow('$.suiteVersion');
    expect(() => parseRawRunArtifact({ ...raw, generatedAtIso: 'not-an-iso-date' })).toThrow('ISO 8601');

    const report = buildReport({ results: raw.results, generatedAtIso: raw.generatedAtIso });
    expect(() => validateReportArtifact({ ...report.json, suiteVersion: 'tampered' })).toThrow('contentHash mismatch');
  });
});

describe('REQ-REP-17: provenance-safe bundle measurement joins', () => {
  test('valid finite and legitimate zero join; missing, failed, ambiguous, stale, and changed tools do not', () => {
    const definition = bundleDefinition();
    const measurements: BundleMeasurement[] = [
      measured('valid@1', '1', 1000, 'source-valid'),
      measured('zero@1', '1', 0, 'source-zero'),
      unavailable('failed@1', '1', 'BUILD_FAILED', 'bundler failed'),
      { ...measured('alias-a@1', '1', 10, 'source-alias'), aliases: ['ambiguous@1'] },
      { ...measured('alias-b@1', '1', 11, 'source-alias'), aliases: ['ambiguous@1'] },
    ];
    const artifact = createBundleMeasurementsArtifact({ artifactId: 'bundle-fixture', measurementDefinition: definition, measurements });
    expect(artifact.schemaId).toBe(BUNDLE_MEASUREMENTS_SCHEMA_ID);
    expect(artifact.contentHash).toMatch(/^[0-9a-f]{64}$/);

    const valid = joinBundleMeasurement(artifact, expectation('valid@1', '1', 'source-valid', definition));
    expect(valid).toMatchObject({ state: 'JOINED', observation: { rankedValue: 1000 } });
    const zero = joinBundleMeasurement(artifact, expectation('zero@1', '1', 'source-zero', definition));
    expect(zero).toMatchObject({ state: 'JOINED', observation: { rankedValue: 0 } });
    expect(joinBundleMeasurement(artifact, expectation('missing@1', '1', 'none', definition))).toMatchObject({
      state: 'UNAVAILABLE', reasonCode: 'BUNDLE_MEASUREMENT_MISSING',
    });
    expect(joinBundleMeasurement(artifact, expectation('failed@1', '1', 'source-failed', definition))).toMatchObject({
      state: 'UNAVAILABLE', reasonCode: 'BUILD_FAILED',
    });
    expect(joinBundleMeasurement(artifact, expectation('ambiguous@1', '1', 'source-alias', definition))).toMatchObject({
      state: 'UNAVAILABLE', reasonCode: 'AMBIGUOUS_ENGINE_ALIAS',
    });
    expect(joinBundleMeasurement(artifact, expectation('valid@1', '1', 'stale-source', definition))).toMatchObject({
      state: 'UNAVAILABLE', reasonCode: 'STALE_SOURCE_HASH',
    });
    expect(joinBundleMeasurement(artifact, expectation('valid@1', '1', 'source-valid', {
      ...definition,
      bundler: { ...definition.bundler, version: '999' },
    }))).toMatchObject({ state: 'UNAVAILABLE', reasonCode: 'BUNDLE_TOOLCHAIN_MISMATCH' });
  });

  test('unavailable bundle records cannot smuggle numeric zero statistics', () => {
    const definition = bundleDefinition();
    expect(() => createBundleMeasurementsArtifact({
      artifactId: 'bad',
      measurementDefinition: definition,
      measurements: [{ ...unavailable('bad@1', '1', 'FAIL', 'failed'), compressedBytes: 0 } as unknown as BundleMeasurement],
    })).toThrow('unavailable measurement cannot contain byte statistics');
  });

  test('the offline writer emits deterministic additive measurements of the production artifact graph', async () => {
    const exists = await Bun.file(`${ROOT}/scripts/measure-bundles.mjs`).exists();
    if (!exists) return;
    const dir = (await $`mktemp -d /tmp/media-test-bundle-artifact-XXXXXX`.text()).trim();
    try {
      const firstPath = `${dir}/first.json`;
      const secondPath = `${dir}/second.json`;
      for (const output of [firstPath, secondPath]) {
        const proc = Bun.spawn([
          'bun', `${ROOT}/scripts/measure-bundles.mjs`, '--only', 'aibrush-media', '--out', output, '--json',
        ], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
        expect(await proc.exited).toBe(0);
      }
      const firstRaw = JSON.parse(await Bun.file(firstPath).text());
      const secondRaw = JSON.parse(await Bun.file(secondPath).text());
      const first = createBundleMeasurementsArtifact({ ...firstRaw });
      const second = createBundleMeasurementsArtifact({ ...secondRaw });
      expect(first.contentHash).toBe(second.contentHash);
      expect(firstRaw.contentHash).toBe(secondRaw.contentHash);
      expect(firstRaw.measurements).toEqual(secondRaw.measurements);

      expect(first.measurements).toEqual([expect.objectContaining({
        state: 'MEASURED',
        engineId: 'aibrush-media@dev',
        engineVersion: 'dev',
      })]);
      const measurement = firstRaw.measurements[0];
      expect(measurement.rawBytes).toBeGreaterThan(0);
      expect(measurement.compressedBytes).toBeGreaterThan(0);
      expect(measurement.compressedBytes).toBeLessThanOrEqual(measurement.rawBytes);
      expect(measurement.transferTotalBytes).toBe(measurement.compressedBytes);
      expect(measurement.source.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(measurement.includedFiles.length).toBeGreaterThan(0);
      expect(measurement.excludedRuntimeAssets).toEqual([]);

      expect(measurement.components.map((component: { kind: string }) => component.kind)).toEqual([
        'javascript-minified-gzip',
        'runtime-wasm',
        'worker',
        'codec-core',
      ]);
      for (const component of measurement.components) {
        expect(Number.isFinite(component.rawBytes)).toBe(true);
        expect(Number.isFinite(component.transferBytes)).toBe(true);
        expect(component.rawBytes).toBeGreaterThanOrEqual(0);
        expect(component.transferBytes).toBeGreaterThanOrEqual(0);
        expect(component.compression).toEqual({ algorithm: 'gzip', options: { level: 9 } });
      }
      expect(measurement.components.reduce(
        (sum: number, component: { rawBytes: number }) => sum + component.rawBytes,
        0,
      )).toBe(measurement.rawBytes);
      expect(measurement.components.reduce(
        (sum: number, component: { transferBytes: number }) => sum + component.transferBytes,
        0,
      )).toBe(measurement.compressedBytes);

      expect(first.measurementDefinition).toMatchObject({
        bundler: { name: 'vite', version: expect.any(String) },
        target: 'browser-production-artifacts',
        treeShake: true,
        minify: true,
        flags: expect.arrayContaining(['manifest=true', 'runtime-components=included']),
        byteUnit: 'byte',
        compression: { algorithm: 'gzip', options: { level: 9 } },
      });
    } finally {
      await $`rm -rf ${dir}`.quiet();
    }
  });
});

describe('REQ-REP-10/16: compare and aggregate are identical thin entry points', () => {
  test('the same validated fixture yields the same content hash and counts through both commands', async () => {
    const hasCompare = await Bun.file(`${ROOT}/scripts/compare.mjs`).exists();
    const hasAggregate = await Bun.file(`${ROOT}/scripts/aggregate.mjs`).exists();
    const hasGoal = await Bun.file(`${ROOT}/scripts/goal26-analyze.mjs`).exists();
    if (!hasCompare || !hasAggregate || !hasGoal) return;
    const dir = (await $`mktemp -d /tmp/media-test-report-XXXXXX`.text()).trim();
    try {
      const rawDir = `${dir}/raw`;
      await $`mkdir -p ${rawDir}`.quiet();
      await Bun.write(`${rawDir}/run.json`, JSON.stringify(rawArtifact(), null, 2));
      const compareOut = `${dir}/compare.md`;
      const aggregateOut = `${dir}/aggregate.md`;
      const generated = '2026-01-01T00:00:00.000Z';
      const compare = Bun.spawn([
        'bun', `${ROOT}/scripts/compare.mjs`, '--raw-dir', rawDir, '--out', compareOut,
        '--bundle-measurements', `${dir}/absent.json`, '--generated-at', generated,
      ], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
      expect(await compare.exited).toBe(0);
      const aggregate = Bun.spawn([
        'bun', `${ROOT}/scripts/aggregate.mjs`, '--dirs', rawDir, '--out', aggregateOut,
        '--browser', 'chromium', '--generated-at', generated,
      ], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
      expect(await aggregate.exited).toBe(0);
      const goal = Bun.spawn([
        'bun', `${ROOT}/scripts/goal26-analyze.mjs`, `${rawDir}/run.json`, '--json',
      ], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
      expect(await goal.exited).toBe(0);
      const goalJson = JSON.parse(await new Response(goal.stdout).text());
      const compareJson = JSON.parse(await Bun.file(compareOut.replace(/\.md$/, '.json')).text());
      const aggregateJson = JSON.parse(await Bun.file(aggregateOut.replace(/\.md$/, '.json')).text());
      expect(aggregateJson.contentHash).toBe(compareJson.contentHash);
      expect(aggregateJson.scorecards).toEqual(compareJson.scorecards);
      expect(aggregateJson.cohorts).toEqual(compareJson.cohorts);
      expect(goalJson.reportContentHash).toBe(compareJson.contentHash);
      expect(goalJson.rows.map((row: { scenarioId: string; winner: string | null; flag: string }) => ({
        scenarioId: row.scenarioId,
        winner: row.winner,
        flag: row.flag,
      }))).toEqual(compareJson.cohorts.flatMap((cohort: { rankings: Array<{ scenarioId: string; winner: string | null; flag: string }> }) =>
        cohort.rankings.map((ranking) => ({
          scenarioId: ranking.scenarioId,
          winner: ranking.winner,
          flag: ranking.flag,
        }))));
    } finally {
      await $`rm -rf ${dir}`.quiet();
    }
  });
});

function rawArtifact() {
  return {
    schemaId: RAW_RUN_SCHEMA_ID,
    schemaVersion: REPORTING_SCHEMA_VERSION,
    runId: 'run-fixture',
    suiteVersion: 'suite-commit',
    generatedAtIso: '2026-01-01T00:00:00.000Z',
    results: [rawResult()],
  };
}

function rawResult(): ScenarioResult {
  return {
    engineId: 'engine@1',
    browser: 'chromium',
    scenarioId: 'probe/example',
    family: 'probe',
    status: 'PASS',
    oracleOutcomes: [{
      state: 'VERDICT', oracle: 'golden-metadata', verdict: 'PASS', reasonCode: 'ORACLE_REPRESENTATION_DIFF',
      detail: 'legal representation difference', measurements: { durationDelta: 0 },
    }],
    bench: {
      wall: {
        n: 3, warmup: 1, metric: 'wall', median: 10, p95: 11, mad: 1, unit: 'ms', samples: [9, 10, 11],
      },
    },
    primaryMetric: 'wall',
    env: {
      suiteVersion: 'suite-commit', engineId: 'engine@1', browser: 'chromium', browserVersion: '123',
      gpu: 'gpu', corpusChecksum: 'corpus', acPower: true, configUsed: { mode: 'fixture' },
    },
  };
}

function bundleDefinition(): BundleMeasurementDefinition {
  return {
    bundler: { name: 'Bun.build', version: '1.3.0' },
    runtime: { name: 'bun', version: '1.3.0' },
    target: 'browser/es2022',
    treeShake: true,
    minify: true,
    flags: ['esm'],
    byteUnit: 'byte',
    compression: { algorithm: 'gzip', options: { level: 9 } },
  };
}

function measured(
  engineId: string,
  engineVersion: string,
  compressedBytes: number,
  sourceHash: string,
): BundleMeasurement {
  return {
    state: 'MEASURED',
    engineId,
    engineVersion,
    aliases: [],
    source: { entry: `src/engines/${engineId}/adapter.ts`, imports: ['library'], contentHash: sourceHash },
    rawBytes: compressedBytes * 2,
    compressedBytes,
    includedFiles: ['entry.js'],
    excludedRuntimeAssets: ['worker.wasm'],
  };
}

function unavailable(engineId: string, engineVersion: string, reasonCode: string, reason: string): BundleMeasurement {
  return {
    state: 'UNAVAILABLE',
    engineId,
    engineVersion,
    aliases: [],
    source: { entry: `src/engines/${engineId}/adapter.ts`, imports: ['library'], contentHash: `source-${engineId.split('@')[0]}` },
    reasonCode,
    reason,
  };
}

function expectation(
  engineId: string,
  engineVersion: string,
  sourceContentHash: string,
  definition: BundleMeasurementDefinition,
): BundleJoinExpectation {
  return {
    engineId,
    engineVersion,
    sourceContentHash,
    bundler: definition.bundler,
    runtime: definition.runtime,
    target: definition.target,
    treeShake: definition.treeShake,
    minify: definition.minify,
    flags: definition.flags,
    compression: definition.compression,
  };
}
