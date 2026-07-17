import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createGoldenEnvelope,
  createGoldenProvenance,
} from '../fixtures/lib/golden-contract.mjs';
import { canonicalSha256 } from '../fixtures/lib/golden-normalization.mjs';
import {
  auditGeneration,
  publishGeneration,
  validateFixtureSeedDocument,
  validateRecordedToolPerimeter,
  validateToolchainLockDocument,
} from '../fixtures/lib/generation-publication.mjs';

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('REQ-FIX-06 attributable envelope publication', () => {
  test('publication and audit both bind schema, source, recipe, baker, arguments, perimeter, and output digest', () => {
    const root = temporaryRoot();
    const media = Buffer.from('attributable-source');
    const envelope = envelopeFor(media, { canonical: { container: 'mp4' } });
    const published = publishGeneration({
      rootDir: root,
      artifacts: publicationArtifacts(media, envelope),
      publicationScope: { mode: 'selected-assets', assetIds: ['asset.mp4'] },
      sourceDateEpoch: 0,
    });
    const audited = auditGeneration(root, published.index);
    expect(audited).toMatchObject({ ok: true, checked: 3, issues: [] });
    expect(audited.records).toContainEqual(expect.objectContaining({
      logicalPath: 'golden/asset.mp4.meta.json',
      sourceMediaSha256: digest(media),
      recipe: 'tests/fixture-provenance-publication#metadata',
      bakerVersion: 'fixture-provenance-test@1',
      outputArtifactSha256: envelope.provenance.outputArtifact.sha256,
      normalizedArgumentsSha256: envelope.provenance.buildDefinition.normalizedArgumentsSha256,
      resolvedDependencies: [],
      toolchainLockSha256: 'd'.repeat(64),
    }));
  });

  test('unknown-major, cross-field, payload-digest, and incomplete-perimeter documents reject before index publication', () => {
    const media = Buffer.from('attributable-source');
    const valid = envelopeFor(media, { canonical: { container: 'mp4' } });
    const cases: Array<[string, any, string]> = [
      ['unknown-major', { ...valid, schemaVersion: '2.0.0' }, 'schema major 2 is unsupported'],
      ['asset-cross-reference', { ...valid, provenance: { ...valid.provenance, assetId: 'other.mp4' } }, 'provenance assetId does not match envelope'],
      ['payload-digest', { ...valid, payload: { canonical: { container: 'webm' } } }, 'outputArtifact does not match canonical payload bytes'],
      ['perimeter', envelopeFor(media, { canonical: {} }, { ...recordedPerimeter(), tools: {} }), 'perimeter.tools.bun is required'],
    ];
    for (const [name, document, detail] of cases) {
      const root = temporaryRoot();
      expect(() => publishGeneration({
        rootDir: root,
        artifacts: publicationArtifacts(media, document),
        publicationScope: { mode: 'selected-assets', assetIds: ['asset.mp4'] },
      }), name).toThrow(detail);
      expect(Bun.file(join(root, 'generation-index.json')).size, name).toBe(0);
    }
  });
});

describe('REQ-FIX-07 declared perimeter and committed seed', () => {
  test('committed seed and toolchain declarations validate with unknown fields and majors rejected', () => {
    const seed = JSON.parse(readFileSync('fixtures/fixture-seed.json', 'utf8'));
    const toolchain = JSON.parse(readFileSync('fixtures/toolchain.lock.json', 'utf8'));
    expect(validateFixtureSeedDocument(seed)).toEqual([]);
    expect(validateToolchainLockDocument(toolchain)).toEqual([]);
    expect(validateFixtureSeedDocument({ ...seed, schemaVersion: 'media-test/fixture-seed@2' }))
      .toContain('schemaVersion is unknown or unsupported');
    expect(validateToolchainLockDocument({ ...toolchain, surprise: true }))
      .toContain("unknown field 'surprise'");
    expect(validateRecordedToolPerimeter(recordedPerimeter())).toEqual([]);
    expect(validateRecordedToolPerimeter(recordedPerimeter(), { toolchainSha256: '0'.repeat(64) }))
      .toContain('provenance perimeter.declaredLock.sha256 does not match committed toolchain lock');
    expect(validateRecordedToolPerimeter({ ...recordedPerimeter(), environment: { SOURCE_DATE_EPOCH: '0' } }))
      .toContain('provenance perimeter.environment.TZ must be recorded');
  });

  test('the CI audit command resolves every active artifact and exits successfully', () => {
    const result = spawnSync(process.execPath, ['fixtures/audit-generation.mjs', '--json'], {
      cwd: process.cwd(), encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    const audit = JSON.parse(result.stdout);
    const active = JSON.parse(readFileSync('fixtures/generation-index.json', 'utf8'));
    expect(audit).toMatchObject({ ok: true, issues: [], publicationScope: active.publicationScope });
    expect(audit.checked).toBe(active.entries.length);
    expect(audit.records).toContainEqual(expect.objectContaining({
      logicalPath: 'golden/h264_rotated90.mp4.meta.json',
      sourceMediaSha256: 'd536492b202984b92e4f9cbe87d66c35c5c7e0f93a08a515936ea794e990b096',
      recipe: 'fixtures/bake.mjs#metadata',
      bakerVersion: 'media-test/bake@1',
    }));
  });
});

function envelopeFor(media: Uint8Array, payload: unknown, perimeter = recordedPerimeter()): any {
  const sourceMedia = { sha256: digest(media), sizeBytes: media.byteLength };
  const provenance = createGoldenProvenance({
    artifactKind: 'metadata',
    assetId: 'asset.mp4',
    sourceMedia,
    recipe: 'tests/fixture-provenance-publication#metadata',
    normalizedArguments: { assetId: 'asset.mp4', kind: 'metadata' },
    baker: 'fixture-provenance-test@1',
    perimeter,
    payload,
    sourceDateEpoch: 0,
  });
  return createGoldenEnvelope({ artifactKind: 'metadata', assetId: 'asset.mp4', sourceMedia, payload, provenance });
}

function publicationArtifacts(media: Uint8Array, envelope: any): any[] {
  const manifest = {
    $schema: './schemas/fixture-manifest-v1.schema.json',
    suiteCorpusVersion: 'test',
    assets: [{ id: 'asset.mp4', source: 'generated', sha256: digest(media), sizeBytes: media.byteLength }],
  };
  return [
    {
      logicalPath: 'golden/asset.mp4.meta.json', artifactKind: 'metadata',
      bytes: `${JSON.stringify(envelope, null, 2)}\n`, sourceMediaSha256: digest(media),
      provenanceSha256: canonicalSha256(envelope.provenance),
    },
    rawArtifact('manifest.json', Buffer.from(`${JSON.stringify(manifest)}\n`), 'manifest'),
    rawArtifact('media/asset.mp4', media, 'media'),
  ];
}

function rawArtifact(logicalPath: string, bytes: Uint8Array, artifactKind: string): any {
  const sha256 = digest(bytes);
  return {
    logicalPath, artifactKind, bytes, sourceMediaSha256: sha256,
    provenanceSha256: 'a'.repeat(64),
    audit: { recipe: 'tests/fixture-provenance-publication#raw', bakerVersion: 'fixture-provenance-test@1', outputArtifactSha256: sha256 },
  };
}

function recordedPerimeter(): any {
  const present = (name: string) => ({ state: 'present', executable: name, versionOutput: `${name} test-version` });
  return {
    schemaVersion: 'tool-perimeter@1',
    tools: {
      bun: present('bun'), ffmpeg: present('ffmpeg'), ffprobe: present('ffprobe'),
      bento4: { state: 'absent' }, bento4Hls: { state: 'absent' }, shakaPackager: { state: 'absent' },
      playwright: { state: 'not-applicable' }, browser: { state: 'not-applicable' },
    },
    platform: { os: 'test', release: 'test', arch: 'test', locale: 'C', timezone: 'UTC' },
    environment: {
      SOURCE_DATE_EPOCH: '0', LANG: 'C', LC_ALL: 'C', TZ: 'UTC',
      BRAVE_PATH: null, FFMPEG_PATH: null, FFPROBE_PATH: null,
    },
    declaredLock: {
      sha256: 'd'.repeat(64), sourceDateEpoch: 0, locale: 'C', timezone: 'UTC',
      required: { bun: 'test', ffmpeg: 'test', ffprobe: 'test' }, optional: {},
    },
  };
}

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'media-test-provenance-'));
  roots.push(root);
  return root;
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
