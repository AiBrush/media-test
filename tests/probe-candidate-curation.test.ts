import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import {
  PROBE_EXHAUSTIVE_CANDIDATE_REPAIR,
  buildProbeExhaustiveCandidateRepairs,
  curateProbeExhaustiveCandidates,
} from '../fixtures/curate-probe-exhaustive-candidates.mjs';
import {
  buildSelectionManifest,
  findScenarioPool,
  parseBakedCorpusManifest,
  parseScenarioSourceCatalog,
  scenarioSourceMap,
} from '../src/core/media-selection.ts';
import type { MediaInput } from '../src/core/engine.ts';
import { runOracle } from '../src/core/oracles.ts';
import { MediabunnyEngine } from '../src/engines/mediabunny/adapter.ts';
import { probeScenarios } from '../src/scenarios/probe/index.ts';

const CORRUPT_WEBM_SHA256 = PROBE_EXHAUSTIVE_CANDIDATE_REPAIR.corruptWebmSha256;
const EXTRA_TRACK_MKV_SHA256 = PROBE_EXHAUSTIVE_CANDIDATE_REPAIR.extraTrackMkvSha256;
const MICROLENSING_WEBM_SHA256 = PROBE_EXHAUSTIVE_CANDIDATE_REPAIR.microlensingWebmSha256;
const MDN_WEBM_SHA256 = PROBE_EXHAUSTIVE_CANDIDATE_REPAIR.mdnWebmSha256;

describe('probe exhaustive candidate curation', () => {
  test('malformed WebM is replaced and undeclared-track MKV is excluded without duplicate identities', () => {
    const catalogText = readFileSync('fixtures/media/scenarios/_sources.ndjson', 'utf8');
    const rawRows = catalogText.trim().split(/\r?\n/u).map((line) => JSON.parse(line));
    const repairedRows = buildProbeExhaustiveCandidateRepairs(rawRows);
    expect(buildProbeExhaustiveCandidateRepairs(repairedRows)).toEqual(repairedRows);
    const catalogResult = parseScenarioSourceCatalog(
      `${repairedRows.map((row) => JSON.stringify(row)).join('\n')}\n`,
    );
    expect(catalogResult.state).toBe('VALID');
    if (catalogResult.state !== 'VALID') return;

    const bakedResult = parseBakedCorpusManifest(
      JSON.parse(readFileSync('fixtures/manifest.json', 'utf8')),
    );
    expect(bakedResult.state).toBe('VALID');
    if (bakedResult.state !== 'VALID') return;

    const scenarioIds = [
      'probe/realworld_mdn_flower_webm',
      'probe/vp8_720p_10s',
      'probe/h264_in_mkv',
    ] as const;
    const scenarios = scenarioIds.map((scenarioId) => {
      const scenario = probeScenarios.find((candidate) => candidate.id === scenarioId);
      if (!scenario) throw new Error(`missing scenario ${scenarioId}`);
      return scenario;
    });
    const manifest = buildSelectionManifest({
      scenarios,
      catalog: catalogResult.catalog,
      bakedManifest: bakedResult.manifest,
    });
    const rows = scenarioSourceMap(catalogResult.catalog);

    const realworldRow = rows.get('probe/realworld_mdn_flower_webm')!;
    const vp8Row = rows.get('probe/vp8_720p_10s')!;
    const mkvRow = rows.get('probe/h264_in_mkv')!;
    expect(realworldRow.files.map((file) => file.sha256)).toEqual([
      '42b0dd18035e61cfd6ccf52e5e00b390b2b46c7e5a7179a9b34ce79c2f9f0612',
      MICROLENSING_WEBM_SHA256,
      '4ec46fce5dda5c52ea15cdce66c5c533212dfd29fb84280c729b2218fae7a151',
    ]);
    expect(vp8Row.files.map((file) => file.sha256)).toEqual([
      MICROLENSING_WEBM_SHA256,
      MDN_WEBM_SHA256,
      '4ec46fce5dda5c52ea15cdce66c5c533212dfd29fb84280c729b2218fae7a151',
    ]);
    expect(mkvRow.files.map((file) => file.sha256)).toEqual([
      '8c4e020a1c16b808c5aed8bb2b29805aa7321d4e0269505c8cfd7436c4074202',
      '6909d418dd3a32c2099542e430560033c5a12032a0b79149fb9d6e08492d31c9',
    ]);
    expect([...realworldRow.files, ...vp8Row.files].some((file) => file.sha256 === CORRUPT_WEBM_SHA256)).toBe(false);
    expect(mkvRow.files.some((file) => file.sha256 === EXTRA_TRACK_MKV_SHA256)).toBe(false);
    expect(mkvRow.note).toContain('undeclared MJPEG and other tracks');

    const expectedEligible = Object.entries(PROBE_EXHAUSTIVE_CANDIDATE_REPAIR.eligibleCounts);
    for (const [scenarioId, count] of expectedEligible) {
      const pool = findScenarioPool(manifest, scenarioId)!;
      expect(pool.eligible, scenarioId).toBe(count);
      expect(new Set(pool.candidates.map((candidate) => candidate.contentDigest)).size, scenarioId).toBe(count);
      expect(pool.candidates.some((candidate) =>
        candidate.contentDigest === CORRUPT_WEBM_SHA256 ||
        candidate.contentDigest === EXTRA_TRACK_MKV_SHA256
      ), scenarioId).toBe(false);
    }
  });

  test('replacement bodies and candidate goldens are byte-identical to their verified corpus sources', () => {
    const replacements = [
      {
        targetBase: 'fixtures/media/scenarios/probe/realworld_mdn_flower_webm/02.webm',
        sourceBase: 'fixtures/media/scenarios/probe/vp8_720p_10s/01.webm',
        targetGoldenBase: 'fixtures/golden/scenarios/probe/realworld_mdn_flower_webm/02.webm',
        sourceGoldenBase: 'fixtures/golden/scenarios/probe/vp8_720p_10s/01.webm',
        sha256: MICROLENSING_WEBM_SHA256,
        sizeBytes: 456_765,
        durationSec: 6.063,
      },
      {
        targetBase: 'fixtures/media/scenarios/probe/vp8_720p_10s/02.webm',
        sourceBase: 'fixtures/media/realworld_mdn_flower.webm',
        targetGoldenBase: 'fixtures/golden/scenarios/probe/vp8_720p_10s/02.webm',
        sourceGoldenBase: 'fixtures/golden/realworld_mdn_flower.webm',
        sha256: MDN_WEBM_SHA256,
        sizeBytes: 554_058,
        durationSec: 5.059,
      },
    ] as const;

    for (const replacement of replacements) {
      const targetBytes = readFileSync(replacement.targetBase);
      expect(statSync(replacement.targetBase).size).toBe(replacement.sizeBytes);
      expect(sha256(targetBytes)).toBe(replacement.sha256);
      expect(targetBytes).toEqual(readFileSync(replacement.sourceBase));

      for (const suffix of ['.meta.json', '.packets.json'] as const) {
        const targetGolden = readFileSync(`${replacement.targetGoldenBase}${suffix}`);
        const sourceGolden = readFileSync(`${replacement.sourceGoldenBase}${suffix}`);
        expect(targetGolden).toEqual(sourceGolden);
        expect(() => JSON.parse(targetGolden.toString('utf8'))).not.toThrow();
      }
      const metadata = JSON.parse(
        readFileSync(`${replacement.targetGoldenBase}.meta.json`, 'utf8'),
      ) as { durationSec: number; tracks: Array<{ type: string; codec: string }> };
      expect(metadata.durationSec).toBe(replacement.durationSec);
      expect(metadata.tracks).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'video', codec: 'vp8' }),
        expect.objectContaining({ type: 'audio', codec: 'vorbis' }),
      ]));
      const packets = JSON.parse(
        readFileSync(`${replacement.targetGoldenBase}.packets.json`, 'utf8'),
      ) as unknown[];
      expect(packets.length).toBeGreaterThan(0);
    }
  });

  test('the production curator publishes verified artifacts before an atomic, idempotent catalog update', () => {
    const temporary = mkdtempSync(join(tmpdir(), 'media-test-probe-candidate-curator-'));
    const root = join(temporary, 'checkout');
    const productionCatalogBefore = readFileSync('fixtures/media/scenarios/_sources.ndjson');
    const required = [
      'fixtures/media/scenarios/_sources.ndjson',
      'fixtures/media/scenarios/probe/vp8_720p_10s/01.webm',
      'fixtures/media/realworld_mdn_flower.webm',
      'fixtures/golden/scenarios/probe/vp8_720p_10s/01.webm.meta.json',
      'fixtures/golden/scenarios/probe/vp8_720p_10s/01.webm.packets.json',
      'fixtures/golden/realworld_mdn_flower.webm.meta.json',
      'fixtures/golden/realworld_mdn_flower.webm.packets.json',
    ];
    try {
      for (const source of required) {
        const destination = join(root, source);
        mkdirSync(dirname(destination), { recursive: true });
        copyFileSync(source, destination);
      }

      curateProbeExhaustiveCandidates(root);
      const first = snapshotCuratedCandidateOutputs(root);
      curateProbeExhaustiveCandidates(root);
      expect(snapshotCuratedCandidateOutputs(root)).toEqual(first);
      expect(readFileSync('fixtures/media/scenarios/_sources.ndjson')).toEqual(productionCatalogBefore);

      expect(first['fixtures/media/scenarios/probe/realworld_mdn_flower_webm/02.webm']).toEqual({
        sha256: MICROLENSING_WEBM_SHA256,
        sizeBytes: 456_765,
      });
      expect(first['fixtures/media/scenarios/probe/vp8_720p_10s/02.webm']).toEqual({
        sha256: MDN_WEBM_SHA256,
        sizeBytes: 554_058,
      });
      const catalog = readFileSync(join(root, 'fixtures/media/scenarios/_sources.ndjson'), 'utf8');
      expect(parseScenarioSourceCatalog(catalog).state).toBe('VALID');
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  test('Mediabunny produces passing metadata for both replacements and both retained MKVs', async () => {
    const cases = [
      ['probe/realworld_mdn_flower_webm', '02.webm', 'video/webm'],
      ['probe/vp8_720p_10s', '02.webm', 'video/webm'],
      ['probe/h264_in_mkv', '01.mkv', 'video/x-matroska'],
      ['probe/h264_in_mkv', '02.mkv', 'video/x-matroska'],
    ] as const;
    const engine = new MediabunnyEngine();
    await engine.init();
    try {
      for (const [scenarioId, file, mime] of cases) {
        const bytes = new Uint8Array(readFileSync(`fixtures/media/scenarios/${scenarioId}/${file}`));
        const input: MediaInput = {
          id: file,
          url: `blob:probe-candidate-curation/${scenarioId}/${file}`,
          mime,
          sizeBytes: bytes.byteLength,
          blob: async () => new Blob([bytes.slice()], { type: mime }),
          arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer,
        };
        const scenario = probeScenarios.find((candidate) => candidate.id === scenarioId)!;
        const metadata = await engine.probe(input);
        const golden = JSON.parse(
          readFileSync(`fixtures/golden/scenarios/${scenarioId}/${file}.meta.json`, 'utf8'),
        );
        const outcome = await runOracle('golden-metadata', {
          scenario,
          input,
          engine,
          metadata,
          golden: { meta: golden },
          decodeWithPlatform: async () => ({ frames: [] }),
          playbackSmoke: async () => true,
        });
        expect(outcome, `${scenarioId}/${file}`).toMatchObject({
          state: 'VERDICT',
          verdict: 'PASS',
        });
      }
    } finally {
      await engine.dispose();
    }
  });
});

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function snapshotCuratedCandidateOutputs(root: string): Record<string, { sha256: string; sizeBytes: number }> {
  const paths = [
    'fixtures/media/scenarios/_sources.ndjson',
    'fixtures/media/scenarios/probe/realworld_mdn_flower_webm/02.webm',
    'fixtures/media/scenarios/probe/vp8_720p_10s/02.webm',
    'fixtures/golden/scenarios/probe/realworld_mdn_flower_webm/02.webm.meta.json',
    'fixtures/golden/scenarios/probe/realworld_mdn_flower_webm/02.webm.packets.json',
    'fixtures/golden/scenarios/probe/vp8_720p_10s/02.webm.meta.json',
    'fixtures/golden/scenarios/probe/vp8_720p_10s/02.webm.packets.json',
  ];
  return Object.fromEntries(paths.map((path) => {
    const value = readFileSync(join(root, path));
    return [path, { sha256: sha256(value), sizeBytes: value.byteLength }];
  }));
}
