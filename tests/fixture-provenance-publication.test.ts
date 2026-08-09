import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createGoldenEnvelope,
  createGoldenProvenance,
} from '../fixtures/lib/golden-contract.mjs';
import { canonicalJson, canonicalSha256, normalizePacketProbe } from '../fixtures/lib/golden-normalization.mjs';
import {
  activeArtifactsForMerge,
  auditGeneration,
  publishGeneration,
  validateFixtureSeedDocument,
  validateRecordedToolPerimeter,
  validateToolchainLockDocument,
  writePrevalidatedCompactGoldenSource,
} from '../fixtures/lib/generation-publication.mjs';
import { readGoldenEvidenceBytesV1 } from '../src/core/golden-evidence.ts';
import { readCompactGoldenPacketRows } from '../src/core/lossless-json-columnar.ts';
import {
  inspectCompactGoldenFile,
  isCompactGoldenFile,
  MAX_COMPACT_GOLDEN_SMALL_JSON_BYTES,
} from '../fixtures/lib/compact-golden-file.mjs';

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('REQ-FIX-06 attributable envelope publication', () => {
  test('ready golden evidence may bind to matching materialized-media identity', () => {
    const root = temporaryRoot();
    const media = Buffer.from('materialized-golden-source');
    const envelope = envelopeFor(media, { canonical: { container: 'mp4' } });
    const artifacts = publicationArtifacts(media, envelope)
      .filter((artifact) => artifact.logicalPath !== 'media/asset.mp4');
    const sha256 = digest(media);
    const published = publishGeneration({
      rootDir: root,
      artifacts,
      materializedMedia: [{
        logicalPath: 'media/asset.mp4',
        sha256,
        sizeBytes: media.byteLength,
        provenanceSha256: 'a'.repeat(64),
        audit: {
          recipe: 'tests/fixture-provenance-publication#materialized',
          bakerVersion: 'fixture-provenance-test@1',
          outputArtifactSha256: sha256,
        },
      }],
      publicationScope: { mode: 'selected-assets', assetIds: ['asset.mp4'] },
      sourceDateEpoch: 0,
    });

    expect(auditGeneration(root, published.index)).toMatchObject({
      ok: true,
      issues: [],
      checked: 2,
      materializedDeclared: 1,
      materializedChecked: 0,
    });
  });

  test('compact detection is whitespace-tolerant and scans beyond the bounded fallback size', () => {
    const root = temporaryRoot();
    const whitespacePath = join(root, 'whitespace-compact.json');
    writeFileSync(whitespacePath, '{"schema" \n : \t "media-test/golden-packets-columnar@1"}');
    expect(isCompactGoldenFile(whitespacePath)).toBe(true);

    const lateMarkerPath = join(root, 'late-marker-compact.json');
    const marker = Buffer.from('"logicalSchema" : "media-test/golden-packets@1"');
    const descriptor = openSync(lateMarkerPath, 'w');
    try {
      writeSync(descriptor, marker, 0, marker.length, MAX_COMPACT_GOLDEN_SMALL_JSON_BYTES + 1);
    } finally {
      closeSync(descriptor);
    }
    expect(isCompactGoldenFile(lateMarkerPath)).toBe(true);
  });

  test('selected scope treats byte and prevalidated compact evidence identically before publication', () => {
    const sourceRoot = temporaryRoot();
    const media = Buffer.from('selected-scope-compact-source');
    const sourceMedia = { sha256: digest(media), sizeBytes: media.byteLength };
    const payload = normalizePacketProbe({
      streams: [{ index: 0, codec_type: 'video', codec_name: 'h264', codec_tag_string: 'avc1', time_base: '1/90000' }],
      packets: [{ stream_index: 0, size: '7', pts: '0', dts: '0', duration: '3000', flags: 'K__' }],
      frames: [{ stream_index: 0, pts_time: '0', key_frame: 1, pict_type: 'I' }],
    }, {
      container: 'mp4', compactStorage: true, consumeSource: true,
      decodedUnits: [{ streamIndex: 0, ptsUs: 0, durationUs: 33_333, sha256: 'a'.repeat(64) }],
      decoderObservation: { state: 'validated' },
    });
    const compactFor = (assetId: string) => {
      const provenance = createGoldenProvenance({
        artifactKind: 'packets', assetId, sourceMedia,
        recipe: 'tests/fixture-provenance-publication#selected-scope-compact',
        normalizedArguments: { assetId, kind: 'packets' },
        baker: 'fixture-provenance-test@1', perimeter: recordedPerimeter(), payload, sourceDateEpoch: 0,
      });
      return {
        provenance,
        envelope: createGoldenEnvelope({ artifactKind: 'packets', assetId, sourceMedia, payload, provenance }),
      };
    };
    const selected = compactFor('asset.mp4');
    const outside = compactFor('other.mp4');
    const selectedPath = join(sourceRoot, 'selected.packets.json');
    const outsidePath = join(sourceRoot, 'outside.packets.json');
    const selectedMarker = writePrevalidatedCompactGoldenSource(selected.envelope, selectedPath);
    const outsideMarker = writePrevalidatedCompactGoldenSource(outside.envelope, outsidePath);
    const manifest = {
      $schema: './schemas/fixture-manifest-v1.schema.json', suiteCorpusVersion: 'test',
      assets: [{ id: 'asset.mp4', source: 'generated', ...sourceMedia }],
    };
    const publicationArtifactsFor = (evidence: any) => [
      evidence,
      rawArtifact('manifest.json', Buffer.from(`${JSON.stringify(manifest)}\n`), 'manifest'),
      rawArtifact('media/asset.mp4', media, 'media'),
    ];
    const evidenceArtifact = (assetId: string, provenance: any, input: any) => ({
      logicalPath: `golden/${assetId}.packets.json`, artifactKind: 'packets', ...input,
      sourceMediaSha256: sourceMedia.sha256, provenanceSha256: canonicalSha256(provenance),
    });

    for (const input of [
      { bytes: Buffer.from(`${canonicalJson(outside.envelope)}\n`) },
      { sourcePath: outsidePath, prevalidatedCompactGoldenSource: outsideMarker },
    ]) {
      const root = temporaryRoot();
      expect(() => publishGeneration({
        rootDir: root,
        publicationScope: { mode: 'selected-assets', assetIds: ['asset.mp4'] },
        sourceDateEpoch: 0,
        artifacts: publicationArtifactsFor(evidenceArtifact('other.mp4', outside.provenance, input)),
      })).toThrow(/evidence asset 'other\.mp4' is outside selected-assets scope/);
      expect(Bun.file(join(root, 'generation-index.json')).size).toBe(0);
    }

    for (const input of [
      { bytes: Buffer.from(`${canonicalJson(selected.envelope)}\n`) },
      { sourcePath: selectedPath, prevalidatedCompactGoldenSource: selectedMarker },
    ]) {
      const root = temporaryRoot();
      const published = publishGeneration({
        rootDir: root,
        publicationScope: { mode: 'selected-assets', assetIds: ['asset.mp4'] },
        sourceDateEpoch: 0,
        artifacts: publicationArtifactsFor(evidenceArtifact('asset.mp4', selected.provenance, input)),
      });
      expect(auditGeneration(root, published.index)).toMatchObject({ ok: true, checked: 3, issues: [] });
    }
  });

  test('compact packet producer streams a prevalidated artifact through publication without expansion', async () => {
    const root = temporaryRoot();
    const media = Buffer.from('compact-source');
    const sourceMedia = { sha256: digest(media), sizeBytes: media.byteLength };
    const payload = normalizePacketProbe({
      streams: [{ index: 0, codec_type: 'video', codec_name: 'h264', codec_tag_string: 'avc1', time_base: '1/90000' }],
      packets: [{ stream_index: 0, size: '7', pts: '0', dts: '0', duration: '3000', flags: 'K__', data_hash: `SHA256:${'b'.repeat(64)}` }],
      frames: [{ stream_index: 0, pts_time: '0', key_frame: 1, pict_type: 'I' }],
    }, {
      container: 'mp4', compactStorage: true, consumeSource: true,
      decodedUnits: [{ streamIndex: 0, ptsUs: 0, durationUs: 33_333, sha256: 'a'.repeat(64) }],
      decoderObservation: { state: 'validated' },
    });
    const provenance = createGoldenProvenance({
      artifactKind: 'packets', assetId: 'asset.mp4', sourceMedia,
      recipe: 'tests/fixture-provenance-publication#compact-packets',
      normalizedArguments: { assetId: 'asset.mp4', kind: 'packets' },
      baker: 'fixture-provenance-test@1', perimeter: recordedPerimeter(), payload, sourceDateEpoch: 0,
    });
    const envelope = createGoldenEnvelope({ artifactKind: 'packets', assetId: 'asset.mp4', sourceMedia, payload, provenance });
    const malformedPayload = structuredClone(payload) as any;
    malformedPayload.rowCount += 1;
    const malformedProvenance = createGoldenProvenance({
      artifactKind: 'packets', assetId: 'asset.mp4', sourceMedia,
      recipe: 'tests/fixture-provenance-publication#compact-packets',
      normalizedArguments: { assetId: 'asset.mp4', kind: 'packets' },
      baker: 'fixture-provenance-test@1', perimeter: recordedPerimeter(), payload: malformedPayload, sourceDateEpoch: 0,
    });
    const malformedEnvelope = createGoldenEnvelope({
      artifactKind: 'packets', assetId: 'asset.mp4', sourceMedia,
      payload: malformedPayload, provenance: malformedProvenance,
    });
    expect(() => writePrevalidatedCompactGoldenSource(
      malformedEnvelope,
      join(root, 'malformed-compact-source.json'),
    )).toThrow(/count mismatch/);
    const sourcePath = join(root, 'compact-source.json');
    const prevalidatedCompactGoldenSource = writePrevalidatedCompactGoldenSource(envelope, sourcePath);
    const magicKeyEnvelope = structuredClone(envelope) as any;
    Object.defineProperty(magicKeyEnvelope.provenance, '__proto__', {
      value: { inheritedSchema: 'must-remain-data' }, enumerable: true, configurable: true, writable: true,
    });
    const magicKeyPath = join(root, 'magic-key-compact.json');
    writePrevalidatedCompactGoldenSource(magicKeyEnvelope, magicKeyPath);
    const inspectedMagicKey = inspectCompactGoldenFile(magicKeyPath).envelope.provenance as any;
    expect(Object.getPrototypeOf(inspectedMagicKey)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(inspectedMagicKey, '__proto__')).toBe(true);
    expect(inspectedMagicKey.__proto__).toEqual({ inheritedSchema: 'must-remain-data' });
    const replacementEnvelope = createGoldenEnvelope({
      artifactKind: 'packets', assetId: 'asset.mp4', sourceMedia, payload, provenance,
      availability: { state: 'ready', detail: '\ufffd' },
    });
    const replacementBytes = Buffer.from(`${canonicalJson(replacementEnvelope)}\n`);
    const replacementOffset = replacementBytes.indexOf(Buffer.from('\ufffd'));
    expect(replacementOffset).toBeGreaterThanOrEqual(0);
    const invalidUtf8Bytes = Buffer.concat([
      replacementBytes.subarray(0, replacementOffset),
      Buffer.from([0xff]),
      replacementBytes.subarray(replacementOffset + Buffer.byteLength('\ufffd')),
    ]);
    expect((JSON.parse(new TextDecoder().decode(invalidUtf8Bytes)) as any).availability.detail).toBe('\ufffd');
    const invalidUtf8Path = join(root, 'invalid-utf8-compact.json');
    writeFileSync(invalidUtf8Path, invalidUtf8Bytes);
    expect(() => inspectCompactGoldenFile(invalidUtf8Path)).toThrow(/valid UTF-8/);
    expect(await readGoldenEvidenceBytesV1({
      kind: 'packets',
      reference: {
        logicalPath: 'golden/asset.mp4.packets.json', url: invalidUtf8Path,
        expectedArtifactSha256: digest(invalidUtf8Bytes),
        expectedArtifactSizeBytes: invalidUtf8Bytes.byteLength,
        expectedSourceMediaSha256: sourceMedia.sha256,
      },
      bytes: new Uint8Array(invalidUtf8Bytes),
      actualArtifactSha256: digest(invalidUtf8Bytes),
      parsePayload: readCompactGoldenPacketRows,
    })).toMatchObject({ state: 'schema-invalid', reasonCode: 'GOLDEN_JSON_INVALID' });
    const nonVarintDiskPayload = structuredClone(payload) as any;
    nonVarintDiskPayload.storage.root.entries.find((entry: any[]) => entry[0] === 'raw')[1].entries.push([
      'zzDictionary',
      { $type: 'string-dictionary', indices: { $type: 'array', values: [0] }, values: ['only'] },
    ]);
    const nonVarintDiskProvenance = createGoldenProvenance({
      artifactKind: 'packets', assetId: 'asset.mp4', sourceMedia,
      recipe: 'tests/fixture-provenance-publication#compact-packets',
      normalizedArguments: { assetId: 'asset.mp4', kind: 'packets' },
      baker: 'fixture-provenance-test@1', perimeter: recordedPerimeter(),
      payload: nonVarintDiskPayload, sourceDateEpoch: 0,
    });
    const nonVarintDiskEnvelope = createGoldenEnvelope({
      artifactKind: 'packets', assetId: 'asset.mp4', sourceMedia,
      payload: nonVarintDiskPayload, provenance: nonVarintDiskProvenance,
    });
    const nonVarintDiskPath = join(root, 'non-varint-dictionary.json');
    writeFileSync(nonVarintDiskPath, `${canonicalJson(nonVarintDiskEnvelope)}\n`);
    expect(() => inspectCompactGoldenFile(nonVarintDiskPath)).toThrow(/invalid dictionary indices/);
    const manifest = {
      $schema: './schemas/fixture-manifest-v1.schema.json', suiteCorpusVersion: 'test',
      assets: [{ id: 'asset.mp4', source: 'generated', ...sourceMedia }],
    };
    for (const invalidArtifact of [
      { bytes: invalidUtf8Bytes },
      { sourcePath: invalidUtf8Path },
    ]) {
      expect(() => publishGeneration({
        rootDir: temporaryRoot(),
        publicationScope: { mode: 'selected-assets', assetIds: ['asset.mp4'] },
        sourceDateEpoch: 0,
        artifacts: [
          {
            logicalPath: 'golden/asset.mp4.packets.json', artifactKind: 'packets', ...invalidArtifact,
            sourceMediaSha256: sourceMedia.sha256, provenanceSha256: canonicalSha256(provenance),
          },
          rawArtifact('manifest.json', Buffer.from(`${JSON.stringify(manifest)}\n`), 'manifest'),
          rawArtifact('media/asset.mp4', media, 'media'),
        ],
      })).toThrow(/UTF-8|encoded data|valid UTF-8|Invalid byte sequence/);
    }
    const malformedBytes = Buffer.from(`${canonicalJson(malformedEnvelope)}\n`);
    expect(() => publishGeneration({
      rootDir: temporaryRoot(),
      publicationScope: { mode: 'selected-assets', assetIds: ['asset.mp4'] },
      sourceDateEpoch: 0,
      artifacts: [
        {
          logicalPath: 'golden/asset.mp4.packets.json', artifactKind: 'packets', bytes: malformedBytes,
          sourceMediaSha256: sourceMedia.sha256, provenanceSha256: canonicalSha256(malformedProvenance),
        },
        rawArtifact('manifest.json', Buffer.from(`${JSON.stringify(manifest)}\n`), 'manifest'),
        rawArtifact('media/asset.mp4', media, 'media'),
      ],
    })).toThrow(/count mismatch/);
    const published = publishGeneration({
      rootDir: root,
      publicationScope: { mode: 'selected-assets', assetIds: ['asset.mp4'] },
      sourceDateEpoch: 0,
      artifacts: [
        {
          logicalPath: 'golden/asset.mp4.packets.json', artifactKind: 'packets', sourcePath,
          sourceMediaSha256: sourceMedia.sha256, provenanceSha256: canonicalSha256(provenance),
          prevalidatedCompactGoldenSource,
        },
        rawArtifact('manifest.json', Buffer.from(`${JSON.stringify(manifest)}\n`), 'manifest'),
        rawArtifact('media/asset.mp4', media, 'media'),
      ],
    });
    expect(auditGeneration(root, published.index)).toMatchObject({ ok: true, checked: 3, issues: [] });
    const publishedBytes = readFileSync(join(published.generationDirectory, 'golden/asset.mp4.packets.json'));
    expect(publishedBytes).toEqual(readFileSync(sourcePath));
    const packetIndexEntry = published.index.entries.find(
      (entry: any) => entry.logicalPath === 'golden/asset.mp4.packets.json',
    )!;
    const runtimeEvidence = await readGoldenEvidenceBytesV1({
      kind: 'packets',
      reference: {
        logicalPath: packetIndexEntry.logicalPath,
        url: packetIndexEntry.generationPath,
        generationId: published.index.generationId,
        expectedArtifactSha256: packetIndexEntry.sha256,
        expectedArtifactSizeBytes: packetIndexEntry.sizeBytes,
        expectedSourceMediaSha256: sourceMedia.sha256,
      },
      bytes: new Uint8Array(publishedBytes),
      actualArtifactSha256: packetIndexEntry.sha256,
      parsePayload: readCompactGoldenPacketRows,
    });
    expect(runtimeEvidence).toMatchObject({ state: 'ready', value: { length: 1 } });

    const malformedRuntimeEvidence = await readGoldenEvidenceBytesV1({
      kind: 'packets',
      reference: {
        logicalPath: packetIndexEntry.logicalPath,
        url: packetIndexEntry.generationPath,
        generationId: published.index.generationId,
        expectedArtifactSha256: digest(malformedBytes),
        expectedArtifactSizeBytes: malformedBytes.byteLength,
        expectedSourceMediaSha256: sourceMedia.sha256,
      },
      bytes: new Uint8Array(malformedBytes),
      actualArtifactSha256: digest(malformedBytes),
      parsePayload: readCompactGoldenPacketRows,
    });
    expect(malformedRuntimeEvidence).toMatchObject({ state: 'schema-invalid', reasonCode: 'GOLDEN_PAYLOAD_SCHEMA_INVALID' });

    const carried = activeArtifactsForMerge(root);
    expect(carried.find((artifact: any) => artifact.artifactKind === 'packets'))
      .toHaveProperty('prevalidatedCompactGoldenSource.validator', 'lossless-json-columnar-validator@1');
    const republished = publishGeneration({
      rootDir: root,
      artifacts: carried,
      publicationScope: { mode: 'selected-assets', assetIds: ['asset.mp4'] },
      sourceDateEpoch: 0,
    });
    expect(auditGeneration(root, republished.index)).toMatchObject({ ok: true, checked: 3, issues: [] });

    const malformedAuditIndex = structuredClone(published.index);
    const malformedEntry = malformedAuditIndex.entries.find(
      (entry: any) => entry.logicalPath === 'golden/asset.mp4.packets.json',
    )!;
    writeFileSync(join(root, malformedEntry.generationPath), malformedBytes);
    expect(auditGeneration(root, malformedAuditIndex)).toMatchObject({ ok: false });
    expect(auditGeneration(root, malformedAuditIndex).issues.join('; ')).toMatch(/count mismatch/);
    writeFileSync(join(root, malformedEntry.generationPath), publishedBytes);

    const sourceBeforeRace = readFileSync(sourcePath);
    const racedSource = Buffer.from(sourceBeforeRace);
    racedSource[0] ^= 1;
    const raceRoot = temporaryRoot();
    expect(() => publishGeneration({
      rootDir: raceRoot,
      publicationScope: { mode: 'selected-assets', assetIds: ['asset.mp4'] },
      sourceDateEpoch: 0,
      artifacts: [
        {
          logicalPath: 'golden/asset.mp4.packets.json', artifactKind: 'packets', sourcePath,
          sourceMediaSha256: sourceMedia.sha256, provenanceSha256: canonicalSha256(provenance),
          prevalidatedCompactGoldenSource,
        },
        rawArtifact('manifest.json', Buffer.from(`${JSON.stringify(manifest)}\n`), 'manifest'),
        rawArtifact('media/asset.mp4', media, 'media'),
      ],
      faultInjector(point: { phase: string; logicalPath: string }) {
        if (point.phase === 'before-artifact-write' && point.logicalPath === 'golden/asset.mp4.packets.json') {
          writeFileSync(sourcePath, racedSource);
        }
      },
    })).toThrow(/changed during publication copy/);
    expect(Bun.file(join(raceRoot, 'generation-index.json')).size).toBe(0);
    writeFileSync(sourcePath, sourceBeforeRace);

    appendFileSync(sourcePath, ' ');
    expect(() => publishGeneration({
      rootDir: temporaryRoot(),
      publicationScope: { mode: 'selected-assets', assetIds: ['asset.mp4'] },
      artifacts: [{
        logicalPath: 'golden/asset.mp4.packets.json', artifactKind: 'packets', sourcePath,
        sourceMediaSha256: sourceMedia.sha256, provenanceSha256: canonicalSha256(provenance),
        prevalidatedCompactGoldenSource,
      }],
    })).toThrow(/changed after validation/);
  });

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

  test('runtime, publication, and audit reject the same provenance cross-field mutations', async () => {
    const media = Buffer.from('attributable-source');
    const valid = envelopeFor(media, { canonical: { container: 'mp4' } });
    const cases: Array<[string, (document: any) => void, string]> = [
      [
        'stale normalized-argument digest',
        (document) => { document.provenance.buildDefinition.normalizedArguments.kind = 'packets'; },
        'normalized argument digest does not match normalizedArguments',
      ],
      [
        'noncanonical dependencies',
        (document) => {
          document.provenance.buildDefinition.dependencies = [
            { logicalId: 'z-last', sha256: 'a'.repeat(64), sizeBytes: 2 },
            { logicalId: 'a-first', sha256: 'b'.repeat(64), sizeBytes: 1 },
          ];
        },
        'provenance dependencies must be canonically ordered',
      ],
      [
        'incomplete recorded perimeter',
        (document) => { delete document.provenance.runDetails.perimeter.environment.TZ; },
        'provenance perimeter.environment.TZ must be recorded',
      ],
      [
        'unqualified time mode',
        (document) => { document.provenance.runDetails.timeMode = 'wall-clock'; },
        "provenance timeMode must be 'source-date-epoch' when browserQualified is false",
      ],
      [
        'untyped browser qualification',
        (document) => { document.provenance.runDetails.browserQualified = 'false'; },
        'provenance browserQualified must be boolean',
      ],
      [
        'reversed run timestamps',
        (document) => {
          document.provenance.runDetails.startedAtIso = '2026-01-02T00:00:00.000Z';
          document.provenance.runDetails.finishedAtIso = '2026-01-01T00:00:00.000Z';
        },
        'provenance startedAtIso is after finishedAtIso',
      ],
      [
        'wrong payload digest scope',
        (document) => { document.provenance.outputArtifact.digestScope = 'serialized-envelope'; },
        "provenance outputArtifact.digestScope must be 'canonical-payload'",
      ],
    ];

    for (const [name, mutate, detail] of cases) {
      const document = structuredClone(valid);
      mutate(document);
      const bytes = Buffer.from(`${JSON.stringify(document, null, 2)}\n`);
      const runtime = await readGoldenEvidenceBytesV1({
        kind: 'metadata',
        reference: {
          logicalPath: 'golden/asset.mp4.meta.json',
          url: '/golden/asset.mp4.meta.json',
          expectedArtifactSha256: digest(bytes),
          expectedArtifactSizeBytes: bytes.byteLength,
          expectedSourceMediaSha256: digest(media),
        },
        bytes: new Uint8Array(bytes),
        actualArtifactSha256: digest(bytes),
      });
      expect(runtime, name).toMatchObject({
        state: 'schema-invalid',
        reasonCode: 'GOLDEN_PROVENANCE_INVALID',
      });
      expect(runtime.detail, name).toContain(detail);

      expect(() => publishGeneration({
        rootDir: temporaryRoot(),
        artifacts: publicationArtifacts(media, document),
        publicationScope: { mode: 'selected-assets', assetIds: ['asset.mp4'] },
        sourceDateEpoch: 0,
      }), name).toThrow(detail);

      const auditRoot = temporaryRoot();
      const published = publishGeneration({
        rootDir: auditRoot,
        artifacts: publicationArtifacts(media, valid),
        publicationScope: { mode: 'selected-assets', assetIds: ['asset.mp4'] },
        sourceDateEpoch: 0,
      });
      const evidenceEntry = published.index.entries.find(
        (entry: any) => entry.logicalPath === 'golden/asset.mp4.meta.json',
      )!;
      writeFileSync(join(auditRoot, evidenceEntry.generationPath), bytes);
      const audit = auditGeneration(auditRoot, published.index);
      expect(audit.ok, name).toBe(false);
      expect(audit.issues.join('; '), name).toContain(detail);
    }
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
  }, 30_000);
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
