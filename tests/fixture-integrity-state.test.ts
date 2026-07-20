import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  auditGeneration,
  activeMaterializedMediaForMerge,
  normalizeMaterializedMediaPublicationRecord,
  publishGeneration,
  resolveExplicitAssetUpdateScope,
  stageReadyPublicationRecord,
  stageMaterializedMediaPublicationRecord,
  stageUnavailablePublicationRecord,
  validateGenerationIndex,
} from '../fixtures/lib/generation-publication.mjs';
import { verifyScenarioSourceIdentity } from '../fixtures/bake-scenario-goldens.mjs';
import { validateFixtureGenerationIndex } from '../src/core/fixture-integrity.ts';

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('REQ-FIX-08 active generation state is unambiguous and manifest-complete', () => {
  test('entry/availability overlap is rejected before publication and by both index readers', () => {
    const root = temporaryRoot();
    const media = rawArtifact('media/a.bin', Buffer.from('a'), 'media');
    expect(() => publishGeneration({
      rootDir: root,
      artifacts: [media],
      publicationScope: { mode: 'selected-assets', assetIds: ['a.bin'] },
      availability: [{
        logicalPath: media.logicalPath,
        state: 'pending',
        reasonCode: 'CONTRADICTORY_PENDING',
      }],
    })).toThrow("cannot be both an indexed entry and availability");

    const clean = publishGeneration({
      rootDir: root,
      artifacts: [manifestArtifact([{ id: 'a.bin', bytes: Buffer.from('a') }]), media],
      publicationScope: { mode: 'selected-assets', assetIds: ['a.bin'] },
    }).index;
    const contradictory = {
      ...clean,
      availability: [{
        logicalPath: media.logicalPath,
        state: 'pending',
        reasonCode: 'CONTRADICTORY_PENDING',
      }],
    };
    expect(validateGenerationIndex(contradictory)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.stringContaining('cannot be both')]),
    });
    expect(validateFixtureGenerationIndex(contradictory)).toMatchObject({
      ok: false,
      reasonCode: 'GENERATION_INDEX_SCHEMA_INVALID',
      issues: expect.arrayContaining([expect.stringContaining('cannot be both')]),
    });
    const wrongPath = structuredClone(clean);
    wrongPath.entries[0].generationPath = `generations/${clean.generationId}/media/not-the-logical-path.bin`;
    expect(validateGenerationIndex(wrongPath).issues).toContainEqual(expect.stringContaining('generationPath must equal'));
    const wrongIdentity = { ...clean, generationId: 'f'.repeat(64) };
    expect(validateGenerationIndex(wrongIdentity).issues).toContainEqual(expect.stringContaining('generationId does not match'));
  });

  test('a ready staging write clears stale pending state while the inverse contradiction is rejected', () => {
    const staged = new Map<string, unknown>();
    const availability = new Map<string, unknown>([[
      'golden/a.meta.json',
      { logicalPath: 'golden/a.meta.json', state: 'pending', reasonCode: 'WAITING' },
    ]]);
    stageReadyPublicationRecord(staged, availability, {
      logicalPath: 'golden/a.meta.json',
      artifactKind: 'metadata',
    });
    expect(staged.has('golden/a.meta.json')).toBe(true);
    expect(availability.has('golden/a.meta.json')).toBe(false);
    expect(() => stageUnavailablePublicationRecord(staged, availability, {
      logicalPath: 'golden/a.meta.json', state: 'pending', reasonCode: 'STALE_PENDING',
    })).toThrow('already staged ready');
  });

  test('active manifest audit requires each asset to be indexed or covered by typed availability', () => {
    const root = temporaryRoot();
    const readyBytes = Buffer.from('ready-media');
    const readySha = digest(readyBytes);
    const manifest = {
      $schema: './schemas/fixture-manifest-v1.schema.json',
      suiteCorpusVersion: 'test',
      assets: [
        { id: 'ready.bin', source: 'generated', sha256: readySha, sizeBytes: readyBytes.byteLength },
        { id: 'not-acquired.bin', source: 'provided', sha256: null, sizeBytes: null },
      ],
    };
    const complete = publishGeneration({
      rootDir: root,
      artifacts: [
        rawArtifact('manifest.json', Buffer.from(`${JSON.stringify(manifest)}\n`), 'manifest'),
        rawArtifact('media/ready.bin', readyBytes, 'media'),
      ],
      publicationScope: { mode: 'complete-corpus' },
      availability: [{
        logicalPath: 'media/not-acquired.bin',
        state: 'absent-expected',
        reasonCode: 'FIXTURE_MEDIA_NOT_ACQUIRED',
      }],
    });
    expect(auditGeneration(root, complete.index)).toMatchObject({ ok: true, checked: 2, issues: [] });

    expect(() => publishGeneration({
      rootDir: root,
      artifacts: [
        rawArtifact('manifest.json', Buffer.from(`${JSON.stringify(manifest)}\n`), 'manifest'),
        rawArtifact('media/ready.bin', readyBytes, 'media'),
      ],
      publicationScope: { mode: 'complete-corpus' },
    })).toThrow('media/not-acquired.bin: selected asset is neither indexed nor covered by typed availability');
  });

  test('selected scope is canonical/order-independent and cannot masquerade as complete corpus', () => {
    const one = Buffer.from('one');
    const two = Buffer.from('two');
    const manifest = manifestArtifact([{ id: 'one.bin', bytes: one }, { id: 'two.bin', bytes: two }]);
    const artifacts = [manifest, rawArtifact('media/one.bin', one, 'media'), rawArtifact('media/two.bin', two, 'media')];
    const rootA = temporaryRoot();
    const rootB = temporaryRoot();
    const a = publishGeneration({
      rootDir: rootA,
      artifacts,
      publicationScope: { mode: 'selected-assets', assetIds: ['two.bin', 'one.bin'] },
    }).index;
    const b = publishGeneration({
      rootDir: rootB,
      artifacts: [...artifacts].reverse(),
      publicationScope: { mode: 'selected-assets', assetIds: ['one.bin', 'two.bin'] },
    }).index;
    expect(a.publicationScope).toEqual({ mode: 'selected-assets', assetIds: ['one.bin', 'two.bin'] });
    expect(a.generationId).toBe(b.generationId);

    expect(() => publishGeneration({
      rootDir: temporaryRoot(),
      artifacts: [manifest, rawArtifact('media/one.bin', one, 'media')],
      publicationScope: { mode: 'selected-assets', assetIds: ['missing.bin'] },
    })).toThrow("publicationScope asset 'missing.bin' is not declared");
    expect(() => publishGeneration({
      rootDir: temporaryRoot(),
      artifacts: [manifest, rawArtifact('media/one.bin', one, 'media')],
      publicationScope: { mode: 'complete-corpus' },
    })).toThrow('media/two.bin: selected asset is neither indexed');
    expect(() => publishGeneration({
      rootDir: temporaryRoot(),
      artifacts,
      publicationScope: { mode: 'selected-assets', assetIds: ['one.bin'] },
    })).toThrow('media/two.bin: manifest asset is indexed outside selected-assets scope');
    expect(() => publishGeneration({
      rootDir: temporaryRoot(),
      artifacts: [manifest, rawArtifact('media/one.bin', one, 'media')],
    })).toThrow('is required and must be an object');
  });

  test('materialized media is canonical, generation-bound, mergeable, and selected-scope complete', () => {
    const one = Buffer.from('materialized-one');
    const two = Buffer.from('materialized-two');
    const manifest = manifestArtifact([{ id: 'one.bin', bytes: one }, { id: 'two.bin', bytes: two }]);
    const oneRecord = materializedMediaRecord('one.bin', one);
    const twoRecord = materializedMediaRecord('two.bin', two);
    const rootA = temporaryRoot();
    const rootB = temporaryRoot();
    const a = publishGeneration({
      rootDir: rootA,
      artifacts: [manifest],
      materializedMedia: [twoRecord, oneRecord],
      publicationScope: { mode: 'selected-assets', assetIds: ['two.bin', 'one.bin'] },
      sourceDateEpoch: 0,
    }).index;
    const b = publishGeneration({
      rootDir: rootB,
      artifacts: [manifest],
      materializedMedia: [oneRecord, twoRecord],
      publicationScope: { mode: 'selected-assets', assetIds: ['one.bin', 'two.bin'] },
      sourceDateEpoch: 0,
    }).index;

    expect(a.schemaVersion).toBe('1.1.0');
    expect(a.materializedMedia.map((entry: any) => entry.logicalPath)).toEqual([
      'media/one.bin',
      'media/two.bin',
    ]);
    expect(a.generationId).toBe(b.generationId);
    expect(validateGenerationIndex(a)).toMatchObject({ ok: true, issues: [] });
    expect(validateFixtureGenerationIndex(a)).toMatchObject({ ok: true });
    expect(activeMaterializedMediaForMerge(rootA)).toEqual(a.materializedMedia);
    expect(activeMaterializedMediaForMerge(rootA, ['media/one.bin']))
      .toEqual([expect.objectContaining({ logicalPath: 'media/two.bin' })]);
    expect(existsSync(join(rootA, `generations/${a.generationId}/media/one.bin`))).toBe(false);

    const reordered = structuredClone(a);
    reordered.materializedMedia.reverse();
    expect(validateGenerationIndex(reordered).issues)
      .toContain('materializedMedia must be in canonical logicalPath order');
    expect(validateFixtureGenerationIndex(reordered)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        'materializedMedia must be in canonical logicalPath order',
      ]),
    });

    const drifted = structuredClone(a);
    drifted.materializedMedia[0].sha256 = 'f'.repeat(64);
    drifted.materializedMedia[0].audit.outputArtifactSha256 = 'f'.repeat(64);
    expect(validateGenerationIndex(drifted).issues)
      .toContainEqual(expect.stringContaining('generationId does not match'));
    expect(validateFixtureGenerationIndex(drifted)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.stringContaining('generationId does not match')]),
    });
  });

  test('materialized media may be absent during audit, but present corrupt bytes fail closed', () => {
    const root = temporaryRoot();
    const media = Buffer.from('locally-materialized');
    const published = publishGeneration({
      rootDir: root,
      artifacts: [manifestArtifact([{ id: 'external.bin', bytes: media }])],
      materializedMedia: [materializedMediaRecord('external.bin', media)],
      publicationScope: { mode: 'selected-assets', assetIds: ['external.bin'] },
      sourceDateEpoch: 0,
    });

    expect(auditGeneration(root, published.index)).toMatchObject({
      ok: true,
      issues: [],
      checked: 1,
      materializedDeclared: 1,
      materializedChecked: 0,
    });

    const mediaPath = join(root, 'media/external.bin');
    mkdirSync(join(root, 'media'), { recursive: true });
    writeFileSync(mediaPath, 'corrupt');
    expect(auditGeneration(root, published.index)).toMatchObject({
      ok: false,
      materializedDeclared: 1,
      materializedChecked: 1,
      issues: expect.arrayContaining([
        expect.stringContaining('materialized size'),
        expect.stringContaining('materialized digest mismatch'),
      ]),
    });

    writeFileSync(mediaPath, media);
    expect(auditGeneration(root, published.index)).toMatchObject({
      ok: true,
      issues: [],
      materializedChecked: 1,
    });
  });

  test('materialized staging is disjoint and source-backed normalization verifies identity', () => {
    const root = temporaryRoot();
    const mediaPath = join(root, 'large.bin');
    const media = Buffer.from('source-backed-materialized-media');
    writeFileSync(mediaPath, media);
    const record = {
      logicalPath: 'media/large.bin',
      artifactKind: 'media',
      sourcePath: mediaPath,
      sourceMediaSha256: digest(media),
      provenanceSha256: 'a'.repeat(64),
      audit: {
        recipe: 'tests/fixture-integrity-state#materialized',
        bakerVersion: 'fixture-integrity-test@1',
        outputArtifactSha256: digest(media),
      },
    };
    expect(normalizeMaterializedMediaPublicationRecord(record)).toEqual({
      logicalPath: 'media/large.bin',
      sha256: digest(media),
      sizeBytes: media.byteLength,
      provenanceSha256: 'a'.repeat(64),
      audit: record.audit,
    });

    const ready = new Map<string, unknown>();
    const materialized = new Map<string, unknown>();
    const availability = new Map<string, unknown>([[
      'media/large.bin',
      { logicalPath: 'media/large.bin', state: 'pending', reasonCode: 'WAITING' },
    ]]);
    stageMaterializedMediaPublicationRecord(ready, materialized, availability, record);
    expect(materialized.get('media/large.bin')).toMatchObject(record);
    expect(availability.has('media/large.bin')).toBe(false);
    ready.set('media/large.bin', record);
    expect(() => stageMaterializedMediaPublicationRecord(ready, materialized, availability, record))
      .toThrow('already staged ready');
  });
});

describe('REQ-FIX-09 explicit replacement and scenario source identity', () => {
  test('--update must name exact manifest ids and cannot become a global or substring identity bypass', () => {
    const assetIds = ['a.mp4', 'nested/b.webm'];
    expect(resolveExplicitAssetUpdateScope({ explicit: false, selectionTerms: [], assetIds })).toBeUndefined();
    expect(() => resolveExplicitAssetUpdateScope({ explicit: true, selectionTerms: [], assetIds }))
      .toThrow('requires at least one exact asset id');
    expect(() => resolveExplicitAssetUpdateScope({ explicit: true, selectionTerms: ['a'], assetIds }))
      .toThrow("is not an exact manifest asset id");
    expect([...resolveExplicitAssetUpdateScope({
      explicit: true,
      selectionTerms: ['nested/b.webm'],
      assetIds,
    })!]).toEqual(['nested/b.webm']);
  });

  test('scenario bytes must match catalog sha256 and size before bake', () => {
    const root = temporaryRoot();
    const path = join(root, '01.bin');
    const bytes = Buffer.from('scenario-source');
    writeFileSync(path, bytes);
    const catalog = { file: '01.bin', sha256: digest(bytes), sizeBytes: bytes.byteLength };
    expect(verifyScenarioSourceIdentity(catalog, path, 'scenarios/test/01.bin')).toEqual({
      sha256: catalog.sha256,
      sizeBytes: bytes.byteLength,
    });
    expect(() => verifyScenarioSourceIdentity({ ...catalog, sizeBytes: bytes.byteLength + 1 }, path))
      .toThrow('SCENARIO_SOURCE_SIZE_MISMATCH');
    expect(() => verifyScenarioSourceIdentity({ ...catalog, sha256: '0'.repeat(64) }, path))
      .toThrow('SCENARIO_SOURCE_DIGEST_MISMATCH');
  });
});

function rawArtifact(logicalPath: string, bytes: Uint8Array, artifactKind: string) {
  const sha256 = digest(bytes);
  return {
    logicalPath,
    artifactKind,
    bytes,
    sourceMediaSha256: sha256,
    provenanceSha256: 'a'.repeat(64),
    audit: {
      recipe: 'tests/fixture-integrity-state#raw',
      bakerVersion: 'fixture-integrity-test@1',
      outputArtifactSha256: sha256,
    },
  };
}

function materializedMediaRecord(assetId: string, bytes: Uint8Array) {
  const sha256 = digest(bytes);
  return {
    logicalPath: `media/${assetId}`,
    sha256,
    sizeBytes: bytes.byteLength,
    provenanceSha256: 'a'.repeat(64),
    audit: {
      recipe: 'tests/fixture-integrity-state#materialized',
      bakerVersion: 'fixture-integrity-test@1',
      outputArtifactSha256: sha256,
    },
  };
}

function manifestArtifact(assets: Array<{ id: string; bytes: Uint8Array }>) {
  const manifest = {
    $schema: './schemas/fixture-manifest-v1.schema.json',
    suiteCorpusVersion: 'test',
    assets: assets.map(({ id, bytes }) => ({
      id,
      source: 'generated',
      sha256: digest(bytes),
      sizeBytes: bytes.byteLength,
    })),
  };
  return rawArtifact('manifest.json', Buffer.from(`${JSON.stringify(manifest)}\n`), 'manifest');
}

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'media-test-integrity-'));
  roots.push(root);
  return root;
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
