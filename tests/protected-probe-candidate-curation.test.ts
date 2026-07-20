import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import {
  CENC_CTR_REAUTHOR_OUTPUT_SCENARIO_ID,
  CENC_CTR_REAUTHOR_SCENARIO_ID,
  reauthorCencCtrCandidates,
} from '../fixtures/reauthor-cenc-ctr-candidates.mjs';
import {
  PROTECTED_PROBE_DERIVATIONS,
  assertProtectedProbeCandidate,
  buildProtectedProbeCatalogRows,
  curateProtectedProbeCandidates,
} from '../fixtures/curate-protected-probe-candidates.mjs';

interface CatalogFile {
  file: string;
  sha256: string;
  sizeBytes: number;
  cleartextBase: {
    poolPath: string;
    sha256: string;
    sizeBytes: number;
  };
  keys: {
    scheme: string;
    kid: string;
  };
  evidence: {
    sourceSha256: string;
    available: string[];
    requiredOracles: string[];
    sufficientOracleSets: string[][];
  };
}

interface CatalogRow {
  scenarioId: string;
  class: string;
  files: CatalogFile[];
}

describe('protected probe candidate curation', () => {
  test('published rotations retain coherent identities and declare their cross-engine ownership', () => {
    const rows = readNdjson('fixtures/media/scenarios/_sources.ndjson');
    const generation = JSON.parse(readFileSync('fixtures/generation-index.json', 'utf8')) as {
      entries: Array<{ logicalPath: string; sourceMediaSha256: string; generationPath: string }>;
      availability: Array<{ logicalPath: string; state: string; reasonCode: string }>;
    };
    const allProtectedHashes = new Set<string>();

    for (const contract of PROTECTED_PROBE_DERIVATIONS) {
      const row = rows.find((candidate) => candidate.scenarioId === contract.scenarioId);
      const sourceRow = rows.find((candidate) => candidate.scenarioId === contract.sourceScenarioId);
      expect(row?.class, contract.scenarioId).toBe('DERIVED');
      expect(row?.files, contract.scenarioId).toHaveLength(3);
      expect(sourceRow?.files, contract.sourceScenarioId).toHaveLength(3);

      const hashes = new Set(row!.files.map((file) => file.sha256));
      expect(hashes.size, `${contract.scenarioId} distinct identities`).toBe(3);

      for (const [index, file] of row!.files.entries()) {
        const sourceFile = sourceRow!.files[index]!;
        expect(file.file).toBe(sourceFile.file);
        expect(file.keys.scheme).toBe(contract.catalogScheme);
        expect(file.evidence).toEqual({
          sourceSha256: file.sha256,
          available: ['SOURCE_GOLDEN', 'CANDIDATE_DECODE'],
          requiredOracles: ['golden-metadata'],
          sufficientOracleSets: [['golden-metadata']],
        });

        const sourceBytes = bytes(`fixtures/media/scenarios/${contract.sourceScenarioId}/${file.file}`);
        const targetBytes = bytes(`fixtures/media/scenarios/${contract.scenarioId}/${file.file}`);
        expect(identity(targetBytes)).toEqual({ sha256: file.sha256, sizeBytes: file.sizeBytes });
        if (contract.materialization === 'source-copy') {
          expect(file.sha256).toBe(sourceFile.sha256);
          expect(file.sizeBytes).toBe(sourceFile.sizeBytes);
          expect(targetBytes).toEqual(sourceBytes);
        } else {
          expect(contract).toMatchObject({ materialization: 'probe-owned', requiresFragmented: true });
          expect(buildProtectedProbeCatalogRows(rows).get(contract.scenarioId)).toEqual(row);
        }
        expect(file.sha256).not.toBe(file.cleartextBase.sha256);
        expect(identity(bytes(join('fixtures/media/scenarios', file.cleartextBase.poolPath)))).toEqual({
          sha256: file.cleartextBase.sha256,
          sizeBytes: file.cleartextBase.sizeBytes,
        });

        if (contract.materialization === 'source-copy') {
          const structural = assertProtectedProbeCandidate(targetBytes, file, contract);
          const mediaTracks = structural.tracks.filter(
            (track: { type: string }) => track.type === 'video' || track.type === 'audio',
          );
          expect(mediaTracks.length).toBeGreaterThan(0);
          expect(mediaTracks.every((track: { protected: boolean }) => track.protected)).toBe(true);
          expect(mediaTracks.every((track: { scheme: string }) => track.scheme === contract.boxScheme)).toBe(true);
          expect(mediaTracks.every((track: { defaultKid: string }) => track.defaultKid === file.keys.kid)).toBe(true);
        }

        const logicalMeta = `golden/scenarios/${contract.scenarioId}/${file.file}.meta.json`;
        const golden = JSON.parse(readFileSync(`fixtures/${logicalMeta}`, 'utf8')) as {
          schema: string;
          artifactKind: string;
          assetId: string;
          sourceMedia: { sha256: string; sizeBytes: number };
        };
        expect(golden).toMatchObject({
          schema: 'media-test/golden-artifact@1',
          artifactKind: 'metadata',
          assetId: `scenarios/${contract.scenarioId}/${file.file}`,
          sourceMedia: { sha256: file.sha256, sizeBytes: file.sizeBytes },
        });
        const indexed = generation.entries.find((entry) => entry.logicalPath === logicalMeta);
        expect(indexed?.sourceMediaSha256).toBe(file.sha256);
        expect(identity(bytes(join('fixtures', indexed!.generationPath))).sha256).toBe(
          identity(bytes(`fixtures/${logicalMeta}`)).sha256,
        );

        const logicalPackets = `golden/scenarios/${contract.scenarioId}/${file.file}.packets.json`;
        expect(existsSync(`fixtures/${logicalPackets}`)).toBe(false);
        expect(generation.availability.find((entry) => entry.logicalPath === logicalPackets)).toMatchObject({
          state: 'absent-expected',
          reasonCode: 'PROTECTED_PROBE_PACKET_GOLDEN_OUT_OF_SCOPE',
        });
        allProtectedHashes.add(file.sha256);
      }
    }

    expect(allProtectedHashes.size, 'CTR and CBCS rotations must not collapse onto shared bytes').toBe(6);
  });

  const integrationTest = nativeToolsAvailable() ? test : test.skip;
  integrationTest('a custom root is authored then curated idempotently without crossing ownership', () => {
    const temporary = mkdtempSync(join(tmpdir(), 'media-test-protected-curator-'));
    const root = join(temporary, 'checkout');
    const productionBefore = snapshotCuratedOutputs('.');
    try {
      for (const name of ['_sources.ndjson', '_plan.ndjson', '_progress.ndjson']) {
        copyIntoRoot(root, `fixtures/media/scenarios/${name}`);
      }
      copyIntoRoot(root, 'fixtures/fixture-seed.json');
      const sourceRows = readNdjson('fixtures/media/scenarios/_sources.ndjson');
      for (const contract of PROTECTED_PROBE_DERIVATIONS) {
        const source = sourceRows.find((row) => row.scenarioId === contract.sourceScenarioId)!;
        for (const file of source.files) {
          copyIntoRoot(root, `fixtures/media/scenarios/${contract.sourceScenarioId}/${file.file}`);
          if (contract.sourceScenarioId === CENC_CTR_REAUTHOR_SCENARIO_ID) {
            copyIntoRoot(root, `fixtures/media/scenarios/${file.cleartextBase.poolPath}`);
          }
        }
      }

      for (const contract of PROTECTED_PROBE_DERIVATIONS) {
        const row = sourceRows.find((candidate) => candidate.scenarioId === contract.scenarioId)!;
        for (const file of row.files) {
          copyIntoRoot(root, `fixtures/media/scenarios/${contract.scenarioId}/${file.file}`);
        }
      }
      const immutableInputBefore = snapshotScenarioFiles(root, CENC_CTR_REAUTHOR_SCENARIO_ID);
      reauthorCencCtrCandidates({ root });
      expect(snapshotScenarioFiles(root, CENC_CTR_REAUTHOR_SCENARIO_ID)).toEqual(immutableInputBefore);

      curateProtectedProbeCandidates({ root });
      const first = snapshotCuratedOutputs(root);
      curateProtectedProbeCandidates({ root });
      expect(snapshotCuratedOutputs(root)).toEqual(first);
      expect(snapshotScenarioFiles(root, CENC_CTR_REAUTHOR_SCENARIO_ID)).toEqual(immutableInputBefore);

      const rows = readNdjson(join(root, 'fixtures/media/scenarios/_sources.ndjson'));
      const ctr = rows.find((row) => row.scenarioId === CENC_CTR_REAUTHOR_OUTPUT_SCENARIO_ID)!;
      const contract = PROTECTED_PROBE_DERIVATIONS.find(
        (candidate) => candidate.scenarioId === CENC_CTR_REAUTHOR_OUTPUT_SCENARIO_ID,
      )!;
      for (const file of ctr.files) {
        const target = bytes(join(root, `fixtures/media/scenarios/${contract.scenarioId}/${file.file}`));
        expect(assertProtectedProbeCandidate(target, file, contract).state).toBe('OK');
        expect(target).not.toEqual(
          bytes(join(root, `fixtures/media/scenarios/${contract.sourceScenarioId}/${file.file}`)),
        );
      }

      const corruptPath = join(root, 'fixtures/media/scenarios/probe/cenc_ctr/01.mp4');
      writeFileSync(corruptPath, 'deliberately corrupt probe-owned candidate');
      const corruptSnapshot = snapshotCuratedOutputs(root);
      expect(() => curateProtectedProbeCandidates({ root })).toThrow('source identity mismatch');
      expect(snapshotCuratedOutputs(root)).toEqual(corruptSnapshot);
      expect(snapshotScenarioFiles(root, CENC_CTR_REAUTHOR_SCENARIO_ID)).toEqual(immutableInputBefore);
      expect(snapshotCuratedOutputs('.')).toEqual(productionBefore);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }, 120_000);

  test('incomplete source tuples, clear bytes, and a mismatched KID fail closed', () => {
    const rows = readNdjson('fixtures/media/scenarios/_sources.ndjson');
    const malformed = structuredClone(rows);
    const ctrSource = malformed.find((row) => row.scenarioId === 'encryption/cenc_ctr_decrypt')!;
    ctrSource.files[0]!.keys.scheme = 'cenc-cbcs';
    expect(() => buildProtectedProbeCatalogRows(malformed)).toThrow('incomplete protected derivation tuple');

    const contract = PROTECTED_PROBE_DERIVATIONS.find((item) => item.scenarioId === 'probe/cenc_ctr')!;
    const protectedRow = rows.find((row) => row.scenarioId === contract.scenarioId)!;
    const file = protectedRow.files[0]!;
    const protectedBytes = bytes(`fixtures/media/scenarios/${contract.scenarioId}/${file.file}`);
    expect(() => assertProtectedProbeCandidate(protectedBytes, {
      ...file,
      keys: { ...file.keys, kid: '0'.repeat(32) },
    }, contract)).toThrow('protected tracks do not all declare');

    const clearBytes = bytes(join('fixtures/media/scenarios', file.cleartextBase.poolPath));
    expect(() => assertProtectedProbeCandidate(clearBytes, {
      ...file,
      sha256: file.cleartextBase.sha256,
      sizeBytes: file.cleartextBase.sizeBytes,
    }, contract)).toThrow('protected bytes equal their cleartext base');
  });

  test('catalog construction preserves probe-owned CTR even when source-only fields change', () => {
    const rows = readNdjson('fixtures/media/scenarios/_sources.ndjson');
    const expected = structuredClone(rows.find((row) => row.scenarioId === 'probe/cenc_ctr'));
    const source = rows.find((row) => row.scenarioId === 'encryption/cenc_ctr_decrypt')!;
    source.files[0]!.sha256 = 'a'.repeat(64);
    source.files[0]!.derivation = 'input-only mutation that must not flow into probe ownership';
    expect(buildProtectedProbeCatalogRows(rows).get('probe/cenc_ctr')).toEqual(expected);
  });
});

function readNdjson(path: string): CatalogRow[] {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CatalogRow);
}

function bytes(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

function identity(value: Uint8Array): { sha256: string; sizeBytes: number } {
  return {
    sha256: createHash('sha256').update(value).digest('hex'),
    sizeBytes: value.byteLength,
  };
}

function copyIntoRoot(root: string, relativePath: string): void {
  const destination = join(root, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(relativePath, destination);
}

function nativeToolsAvailable(): boolean {
  return [
    'mp4fragment',
    'mp4extract',
    'mp4edit',
    'mp4encrypt',
    'mp4decrypt',
    process.env.FFPROBE_PATH || 'ffprobe',
    process.env.FFMPEG_PATH || 'ffmpeg',
  ].every((binary) => spawnSync(binary, [], { encoding: 'utf8', maxBuffer: 1 << 20 }).error?.code !== 'ENOENT');
}

function snapshotScenarioFiles(root: string, scenarioId: string): Record<string, ReturnType<typeof identity>> {
  const rows = readNdjson(join(root, 'fixtures/media/scenarios/_sources.ndjson'));
  const row = rows.find((candidate) => candidate.scenarioId === scenarioId)!;
  return Object.fromEntries(row.files.map((file) => [
    file.file,
    identity(bytes(join(root, `fixtures/media/scenarios/${scenarioId}/${file.file}`))),
  ]));
}

function snapshotCuratedOutputs(root: string): Record<string, ReturnType<typeof identity>> {
  const snapshot: Record<string, ReturnType<typeof identity>> = {};
  for (const relativePath of [
    'fixtures/media/scenarios/_sources.ndjson',
    'fixtures/media/scenarios/_plan.ndjson',
    'fixtures/media/scenarios/_progress.ndjson',
  ]) {
    snapshot[relativePath] = identity(bytes(join(root, relativePath)));
  }
  const rows = readNdjson(join(root, 'fixtures/media/scenarios/_sources.ndjson'));
  for (const contract of PROTECTED_PROBE_DERIVATIONS) {
    const row = rows.find((candidate) => candidate.scenarioId === contract.scenarioId)!;
    for (const file of row.files) {
      const relativePath = `fixtures/media/scenarios/${contract.scenarioId}/${file.file}`;
      snapshot[relativePath] = identity(bytes(join(root, relativePath)));
    }
  }
  return snapshot;
}
