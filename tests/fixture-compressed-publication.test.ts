import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  inspectCompressedCompactGoldenFile,
  inspectCompactGoldenFile,
} from '../fixtures/lib/compact-golden-file.mjs';
import { issueFileBackedCompactGoldenPacketPayload } from '../fixtures/lib/file-backed-compact-payload.mjs';
import { createGoldenEnvelope, createGoldenProvenance } from '../fixtures/lib/golden-contract.mjs';
import { canonicalJson, canonicalJsonIdentity, normalizePacketProbe } from '../fixtures/lib/golden-normalization.mjs';
import {
  activeArtifactsForMerge,
  activeArtifactsForMergeAsync,
  auditGeneration,
  auditGenerationDeep,
  publishGeneration,
  transcodeCompactGoldenSourceForPublication,
  validateGenerationIndex,
  writePrevalidatedCompactGoldenSource,
} from '../fixtures/lib/generation-publication.mjs';

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('compressed outer-envelope compact publication', () => {
  test('writes a file-backed compact payload with separate physical, wrapper, and logical identities', async () => {
    const root = temporaryRoot();
    const payload = compactPayload();
    const issuedRoot = mkdtempSync(join(root, 'media-test-compressed-source-'));
    const payloadPath = join(issuedRoot, 'payload.json');
    writeFileSync(payloadPath, canonicalJson(payload));
    const descriptor = issueFileBackedCompactGoldenPacketPayload({
      sourcePath: payloadPath,
      cleanupPath: issuedRoot,
    });
    const envelope = compactEnvelope(descriptor, payload);
    const outputPath = join(root, 'compressed.packets.json');
    const marker = await writePrevalidatedCompactGoldenSource(envelope, outputPath, {
      compressFileBackedPayload: true,
    });

    const inspected = await inspectCompressedCompactGoldenFile(outputPath);
    expect(marker).toMatchObject({
      artifactSha256: inspected.artifactSha256,
      artifactSizeBytes: inspected.artifactSizeBytes,
      payloadSha256: canonicalJsonIdentity(payload).sha256,
      payloadSizeBytes: canonicalJsonIdentity(payload).sizeBytes,
      payloadTransport: inspected.payloadTransport,
    });
    expect(marker.artifactSha256).not.toBe(marker.payloadTransport.wrapperSha256);
    expect(marker.payloadTransport.wrapperSha256).not.toBe(marker.payloadSha256);
    expect(inspected.envelope.provenance.outputArtifact).toMatchObject({
      digestScope: 'canonical-payload',
      sha256: marker.payloadSha256,
      sizeBytes: marker.payloadSizeBytes,
    });
    expect(JSON.parse(readFileSync(outputPath, 'utf8')).payload).toMatchObject({
      schema: 'media-test/golden-packets-columnar-gzip@1',
      schemaVersion: 'gzip-base64@1',
      decodedSha256: marker.payloadSha256,
      decodedSizeBytes: marker.payloadSizeBytes,
    });
  });

  test('transcodes a validated legacy compact envelope without changing logical identity or provenance', async () => {
    const root = temporaryRoot();
    const payload = compactPayload();
    const envelope = compactEnvelope(payload, payload);
    const legacyPath = join(root, 'legacy.packets.json');
    const legacyMarker = writePrevalidatedCompactGoldenSource(envelope, legacyPath);
    expect(readFileSync(legacyPath)).toEqual(Buffer.from(`${canonicalJson(envelope)}\n`));
    expect(legacyMarker.payloadTransport).toBeUndefined();
    const outputPath = join(root, 'compressed.packets.json');
    const artifact = await transcodeCompactGoldenSourceForPublication({
      sourcePath: legacyPath,
      outputPath,
      logicalPath: 'golden/asset.mp4.packets.json',
    });
    const inspected = await inspectCompressedCompactGoldenFile(outputPath);

    expect(inspectCompactGoldenFile(legacyPath)).toMatchObject({
      payloadSha256: legacyMarker.payloadSha256,
      payloadSizeBytes: legacyMarker.payloadSizeBytes,
    });
    expect(artifact).toMatchObject({
      logicalPath: 'golden/asset.mp4.packets.json',
      artifactKind: 'packets',
      sourcePath: outputPath,
      sourceMediaSha256: envelope.sourceMedia.sha256,
      prevalidatedCompactGoldenSource: {
        artifactSha256: inspected.artifactSha256,
        payloadSha256: legacyMarker.payloadSha256,
        payloadSizeBytes: legacyMarker.payloadSizeBytes,
        payloadTransport: inspected.payloadTransport,
      },
    });
    expect(inspected.envelope.provenance).toEqual(envelope.provenance);
    const ownedBytes = readFileSync(outputPath);
    await expect(transcodeCompactGoldenSourceForPublication({
      sourcePath: legacyPath,
      outputPath,
      logicalPath: 'golden/asset.mp4.packets.json',
    })).rejects.toThrow(/exist|EEXIST/i);
    expect(readFileSync(outputPath)).toEqual(ownedBytes);
  });

  test('fresh compressed writing preserves destinations it does not exclusively own', async () => {
    const root = temporaryRoot();
    const payload = compactPayload();
    const sentinel = Buffer.from('pre-existing-output');

    const exclusiveRoot = mkdtempSync(join(root, 'media-test-exclusive-source-'));
    const exclusivePayloadPath = join(exclusiveRoot, 'payload.json');
    writeFileSync(exclusivePayloadPath, canonicalJson(payload));
    const exclusiveEnvelope = compactEnvelope(issueFileBackedCompactGoldenPacketPayload({
      sourcePath: exclusivePayloadPath,
      cleanupPath: exclusiveRoot,
    }), payload);
    const exclusiveOutput = join(root, 'exclusive-output.json');
    writeFileSync(exclusiveOutput, sentinel);
    await expect(writePrevalidatedCompactGoldenSource(exclusiveEnvelope, exclusiveOutput, {
      compressFileBackedPayload: true,
    })).rejects.toThrow(/exist|EEXIST/i);
    expect(readFileSync(exclusiveOutput)).toEqual(sentinel);

    const failedRoot = mkdtempSync(join(root, 'media-test-pre-outer-failure-'));
    const failedPayloadPath = join(failedRoot, 'payload.json');
    writeFileSync(failedPayloadPath, canonicalJson(payload));
    const failedEnvelope = compactEnvelope(issueFileBackedCompactGoldenPacketPayload({
      sourcePath: failedPayloadPath,
      cleanupPath: failedRoot,
    }), payload);
    writeFileSync(failedPayloadPath, Buffer.concat([readFileSync(failedPayloadPath), Buffer.from(' ')]));
    const failedOutput = join(root, 'pre-outer-output.json');
    writeFileSync(failedOutput, sentinel);
    await expect(writePrevalidatedCompactGoldenSource(failedEnvelope, failedOutput, {
      compressFileBackedPayload: true,
    })).rejects.toThrow(/changed before compressed publication/);
    expect(readFileSync(failedOutput)).toEqual(sentinel);
  });

  test('escaped compressed schema text cannot bypass trusted publication', async () => {
    const prepared = await compressedArtifact(temporaryRoot());
    const escaped = readFileSync(prepared.sourcePath, 'utf8').replace(
      'media-test/golden-packets-columnar-gzip@1',
      'media-test\\/golden-packets-columnar-gzip@1',
    );
    writeFileSync(prepared.sourcePath, escaped);
    const artifacts = publicationArtifacts(prepared);
    const packet = artifacts.find((entry: any) => entry.artifactKind === 'packets');
    delete packet.prevalidatedCompactGoldenSource;
    expect(() => publishGeneration({
      rootDir: temporaryRoot(),
      artifacts,
      publicationScope: { mode: 'selected-assets', assetIds: ['asset.mp4'] },
      sourceDateEpoch: 0,
    })).toThrow(/canonical authenticated deep inspection/);
  });

  test('publishes, deeply audits, and immutably carries a compressed compact artifact', async () => {
    const root = temporaryRoot();
    const sourceRoot = temporaryRoot();
    const prepared = await compressedArtifact(sourceRoot);
    const published = publishGeneration({
      rootDir: root,
      artifacts: publicationArtifacts(prepared),
      publicationScope: { mode: 'selected-assets', assetIds: ['asset.mp4'] },
      sourceDateEpoch: 0,
    });

    expect(auditGeneration(root, published.index)).toMatchObject({ ok: false });
    expect(auditGeneration(root, published.index).issues.join('; ')).toContain('auditGenerationDeep');
    expect(await auditGenerationDeep(root, published.index)).toMatchObject({
      ok: true,
      checked: 3,
      issues: [],
    });
    expect(() => activeArtifactsForMerge(root)).toThrow(/activeArtifactsForMergeAsync/);

    const carried = await activeArtifactsForMergeAsync(root);
    expect(carried.find((entry: any) => entry.artifactKind === 'packets')).toMatchObject({
      prevalidatedCompactGoldenSource: {
        payloadTransport: prepared.marker.payloadTransport,
        payloadSha256: prepared.marker.payloadSha256,
      },
    });
    const republished = publishGeneration({
      rootDir: root,
      artifacts: carried,
      publicationScope: { mode: 'selected-assets', assetIds: ['asset.mp4'] },
      sourceDateEpoch: 0,
    });
    expect(republished.index.generationId).toBe(published.index.generationId);
    expect(republished.writeCount).toBe(1);
    expect(await auditGenerationDeep(root, republished.index)).toMatchObject({ ok: true, checked: 3, issues: [] });
  });

  test.each([
    ['corrupt', (bytes: Buffer) => {
      const document = JSON.parse(bytes.toString('utf8'));
      const index = Math.floor(document.payload.payload.length / 2);
      document.payload.payload = `${document.payload.payload.slice(0, index)}` +
        `${document.payload.payload[index] === 'A' ? 'B' : 'A'}` +
        `${document.payload.payload.slice(index + 1)}`;
      return Buffer.from(`${canonicalJson(document)}\n`);
    }, /structural validation failed/],
    ['truncated', (bytes: Buffer) => bytes.subarray(0, bytes.byteLength - 10),
      /structural validation failed|JSON parse/],
    ['bomb declaration', (bytes: Buffer) => {
      const document = JSON.parse(bytes.toString('utf8'));
      document.payload.decodedSizeBytes = 1;
      return Buffer.from(`${canonicalJson(document)}\n`);
    }, /structural validation failed/],
    ['noncanonical wrapper', (bytes: Buffer) => Buffer.from(
      bytes.toString('utf8').replace('"payload":{', '"payload":{ '),
    ), /structural validation failed/],
    ['escaped compressed schema', (bytes: Buffer) => Buffer.from(
      bytes.toString('utf8').replace(
        'media-test/golden-packets-columnar-gzip@1',
        'media-test\\/golden-packets-columnar-gzip@1',
      ),
    ), /canonical authenticated deep inspection/],
  ])('deep audit fails closed for a %s compressed artifact', async (_name, mutate, expectedIssue) => {
    const root = temporaryRoot();
    const prepared = await compressedArtifact(temporaryRoot());
    const published = publishGeneration({
      rootDir: root,
      artifacts: publicationArtifacts(prepared),
      publicationScope: { mode: 'selected-assets', assetIds: ['asset.mp4'] },
      sourceDateEpoch: 0,
    });
    const entry = published.index.entries.find((candidate: any) => candidate.artifactKind === 'packets')!;
    const path = join(root, entry.generationPath);
    writeFileSync(path, mutate(readFileSync(path)));
    const audited = await auditGenerationDeep(root, published.index);
    expect(audited.ok).toBe(false);
    expect(audited.issues.join('; ')).toMatch(expectedIssue);
  });

  test('rejects every regular publication blob at the 100,000,000-byte boundary', async () => {
    const root = temporaryRoot();
    const sourcePath = join(root, 'oversized.bin');
    writeFileSync(sourcePath, '');
    truncateSync(sourcePath, 100_000_000);
    await expect(inspectCompressedCompactGoldenFile(sourcePath)).rejects.toThrow(/regular-blob ceiling/);
    expect(() => publishGeneration({
      rootDir: root,
      artifacts: [{
        logicalPath: 'oversized.bin',
        artifactKind: 'unknown',
        sourcePath,
        sourceMediaSha256: 'a'.repeat(64),
        provenanceSha256: 'b'.repeat(64),
        audit: {
          recipe: 'tests/fixture-compressed-publication#oversized',
          bakerVersion: 'fixture-compressed-publication@1',
          outputArtifactSha256: 'c'.repeat(64),
        },
      }],
      publicationScope: { mode: 'complete-corpus' },
      sourceDateEpoch: 0,
    })).toThrow(/must be smaller than 100000000 bytes/);

    const small = publishGeneration({
      rootDir: temporaryRoot(),
      artifacts: [rawArtifact('manifest.json', Buffer.from(`${JSON.stringify({
        $schema: './schemas/fixture-manifest-v1.schema.json',
        suiteCorpusVersion: 'test',
        assets: [],
      })}\n`), 'manifest')],
      publicationScope: { mode: 'complete-corpus' },
      sourceDateEpoch: 0,
    });
    const oversizedIndex = structuredClone(small.index);
    oversizedIndex.entries[0].sizeBytes = 100_000_000;
    expect(validateGenerationIndex(oversizedIndex).issues.join('; '))
      .toContain('sizeBytes must be smaller than 100000000');
  });
});

async function compressedArtifact(root: string): Promise<any> {
  const payload = compactPayload();
  const issuedRoot = mkdtempSync(join(root, 'media-test-compressed-source-'));
  const payloadPath = join(issuedRoot, 'payload.json');
  writeFileSync(payloadPath, canonicalJson(payload));
  const descriptor = issueFileBackedCompactGoldenPacketPayload({
    sourcePath: payloadPath,
    cleanupPath: issuedRoot,
  });
  const envelope = compactEnvelope(descriptor, payload);
  const sourcePath = join(root, 'compressed.packets.json');
  const marker = await writePrevalidatedCompactGoldenSource(envelope, sourcePath, {
    compressFileBackedPayload: true,
  });
  return { envelope, sourcePath, marker };
}

function publicationArtifacts(prepared: any): any[] {
  const media = Buffer.from('compressed-publication-source');
  const manifest = {
    $schema: './schemas/fixture-manifest-v1.schema.json',
    suiteCorpusVersion: 'test',
    assets: [{ id: 'asset.mp4', source: 'generated', sha256: digest(media), sizeBytes: media.byteLength }],
  };
  return [
    {
      logicalPath: 'golden/asset.mp4.packets.json',
      artifactKind: 'packets',
      sourcePath: prepared.sourcePath,
      sourceMediaSha256: prepared.envelope.sourceMedia.sha256,
      provenanceSha256: digest(Buffer.from(canonicalJson(prepared.envelope.provenance))),
      prevalidatedCompactGoldenSource: prepared.marker,
    },
    rawArtifact('manifest.json', Buffer.from(`${JSON.stringify(manifest)}\n`), 'manifest'),
    rawArtifact('media/asset.mp4', media, 'media'),
  ];
}

function rawArtifact(logicalPath: string, bytes: Buffer, artifactKind: string): any {
  const sha256 = digest(bytes);
  return {
    logicalPath,
    artifactKind,
    bytes,
    sourceMediaSha256: sha256,
    provenanceSha256: 'a'.repeat(64),
    audit: {
      recipe: 'tests/fixture-compressed-publication#raw',
      bakerVersion: 'fixture-compressed-publication@1',
      outputArtifactSha256: sha256,
    },
  };
}

function compactEnvelope(payload: any, identityPayload: any): any {
  const media = Buffer.from('compressed-publication-source');
  const sourceMedia = { sha256: digest(media), sizeBytes: media.byteLength };
  const provenance = createGoldenProvenance({
    artifactKind: 'packets',
    assetId: 'asset.mp4',
    sourceMedia,
    recipe: 'tests/fixture-compressed-publication#packets',
    normalizedArguments: { assetId: 'asset.mp4', kind: 'packets' },
    baker: 'fixture-compressed-publication@1',
    perimeter: recordedPerimeter(),
    payload: identityPayload,
    sourceDateEpoch: 0,
  });
  return createGoldenEnvelope({
    artifactKind: 'packets',
    assetId: 'asset.mp4',
    sourceMedia,
    payload,
    provenance,
  });
}

function compactPayload(): any {
  return normalizePacketProbe({
    streams: [{
      index: 0,
      codec_type: 'video',
      codec_name: 'h264',
      codec_tag_string: 'avc1',
      time_base: '1/90000',
    }],
    packets: [
      { stream_index: 0, size: '7', pts: '0', dts: '0', duration: '3000', flags: 'K__' },
      { stream_index: 0, size: '9', pts: '3000', dts: '3000', duration: '3000', flags: '___' },
    ],
    frames: [
      { stream_index: 0, pts_time: '0', key_frame: 1, pict_type: 'I' },
      { stream_index: 0, pts_time: '0.033333', key_frame: 0, pict_type: 'P' },
    ],
  }, {
    container: 'mp4',
    compactStorage: true,
    consumeSource: true,
    decodedUnits: [
      { streamIndex: 0, ptsUs: 0, durationUs: 33_333, sha256: 'a'.repeat(64) },
      { streamIndex: 0, ptsUs: 33_333, durationUs: 33_333, sha256: 'b'.repeat(64) },
    ],
    decoderObservation: { state: 'validated' },
  });
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
  const root = mkdtempSync(join(tmpdir(), 'media-test-compressed-publication-'));
  roots.push(root);
  return root;
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
