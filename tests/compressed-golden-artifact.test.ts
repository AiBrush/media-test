import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  inspectDeterministicCompressedGoldenArtifact,
  writeDeterministicCompressedGoldenArtifact,
} from '../fixtures/lib/compressed-golden-artifact.mjs';
import {
  createGoldenEnvelope,
  createGoldenProvenance,
} from '../fixtures/lib/golden-contract.mjs';
import {
  canonicalJson,
  normalizeGoldenPacketEvidence,
} from '../fixtures/lib/golden-normalization.mjs';
import { validateCompactGoldenPacketPayload } from '../fixtures/lib/lossless-json-columnar-validator.mjs';
import {
  COMPRESSED_GOLDEN_ARTIFACT_SCHEMA,
  COMPRESSED_GOLDEN_ARTIFACT_VERSION,
  decodeCompressedGoldenArtifact,
  validateCompressedGoldenArtifact,
} from '../src/core/compressed-golden-artifact.ts';
import { readGoldenEvidenceBytesV1 } from '../src/core/golden-evidence.ts';
import { readCompactGoldenPacketRows } from '../src/core/lossless-json-columnar.ts';

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('deterministic compressed packet-golden transport', () => {
  test('browser decoder streams directly from decompressed bytes into one fatal UTF-8 decoder', () => {
    const source = readFileSync(
      join(import.meta.dir, '..', 'src', 'core', 'compressed-golden-artifact.ts'),
      'utf8',
    );
    expect(source).toContain("const textDecoder = new TextDecoder('utf-8', { fatal: true });");
    expect(source).toContain('textDecoder.decode(chunk, { stream: true })');
    expect(source).not.toMatch(/Uint8Array\[\]|Array<Uint8Array>/);
    expect(source).not.toContain('concatenateChunks');
    expect(source).not.toContain('.set(chunk');
  });

  test('streams deterministic canonical wrappers and keeps physical and decoded identities separate', async () => {
    const root = temporaryRoot();
    const compact = compactPacketPayload(4_097);
    const sourcePath = join(root, 'compact.json');
    const firstPath = join(root, 'first.wrapper.json');
    const secondPath = join(root, 'second.wrapper.json');
    const decodedPath = join(root, 'decoded.json');
    const source = canonicalJson(compact);
    writeFileSync(sourcePath, source);

    const first = await writeDeterministicCompressedGoldenArtifact({ decodedPath: sourcePath, outputPath: firstPath });
    const second = await writeDeterministicCompressedGoldenArtifact({ decodedPath: sourcePath, outputPath: secondPath });
    const firstBytes = readFileSync(firstPath);
    const secondBytes = readFileSync(secondPath);
    expect(firstBytes.equals(secondBytes)).toBe(true);
    expect(first.wrapperIdentity).toEqual(second.wrapperIdentity);
    expect(first.decodedIdentity).toEqual({ sha256: digest(Buffer.from(source)), sizeBytes: Buffer.byteLength(source) });
    expect(first.wrapperIdentity).toEqual({ sha256: digest(firstBytes), sizeBytes: firstBytes.byteLength });
    expect(first.wrapperIdentity).not.toEqual(first.decodedIdentity);

    const wrapper = JSON.parse(firstBytes.toString('utf8'));
    expect(Object.keys(wrapper)).toEqual([
      'decodedSha256', 'decodedSizeBytes', 'payload', 'schema', 'schemaVersion',
    ]);
    expect(wrapper).toMatchObject({
      decodedSha256: first.decodedIdentity.sha256,
      decodedSizeBytes: first.decodedIdentity.sizeBytes,
      schema: COMPRESSED_GOLDEN_ARTIFACT_SCHEMA,
      schemaVersion: COMPRESSED_GOLDEN_ARTIFACT_VERSION,
    });
    expect(firstBytes.toString('utf8')).toBe(canonicalJson(wrapper));
    expect(Buffer.from(wrapper.payload, 'base64').subarray(0, 10)).toEqual(
      Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0, 0, 0, 0, 0x02, 0xff]),
    );

    const browser = await decodeCompressedGoldenArtifact(wrapper);
    expect(browser.wrapperIdentity).toEqual(first.wrapperIdentity);
    expect(browser.decodedIdentity).toEqual(first.decodedIdentity);
    expect(validateCompactGoldenPacketPayload(browser.value)).toMatchObject({ packetRowCount: 4_097 });
    expect(readCompactGoldenPacketRows(browser.value)).toEqual(readCompactGoldenPacketRows(compact));

    const inspected = await inspectDeterministicCompressedGoldenArtifact({
      path: firstPath,
      decodedOutputPath: decodedPath,
    });
    expect(inspected).toMatchObject({
      wrapperIdentity: first.wrapperIdentity,
      decodedIdentity: first.decodedIdentity,
      gzipSizeBytes: first.gzipSizeBytes,
      descriptor: {
        decodedSha256: first.decodedIdentity.sha256,
        decodedSizeBytes: first.decodedIdentity.sizeBytes,
        schema: COMPRESSED_GOLDEN_ARTIFACT_SCHEMA,
        schemaVersion: COMPRESSED_GOLDEN_ARTIFACT_VERSION,
      },
    });
    const decodedCompact = JSON.parse(readFileSync(decodedPath, 'utf8'));
    expect(validateCompactGoldenPacketPayload(decodedCompact)).toMatchObject({ packetRowCount: 4_097 });
    expect(readCompactGoldenPacketRows(decodedCompact)).toEqual(readCompactGoldenPacketRows(compact));
  });

  test('runtime unwraps a compressed outer-envelope payload while provenance stays logical', async () => {
    const fixture = await writtenFixture();
    const compact = JSON.parse(readFileSync(join(fixture.root, 'source.json'), 'utf8'));
    const sourceMedia = { sha256: 'a'.repeat(64), sizeBytes: 123 };
    const provenance = createGoldenProvenance({
      artifactKind: 'packets',
      assetId: 'compressed-test.mp4',
      sourceMedia,
      recipe: 'tests/compressed-golden-artifact#runtime',
      normalizedArguments: { transport: 'gzip-base64' },
      baker: 'compressed-golden-test@1',
      perimeter: recordedPerimeter(),
      payload: compact,
      payloadIdentity: {
        sha256: fixture.wrapper.decodedSha256,
        sizeBytes: fixture.wrapper.decodedSizeBytes,
      },
      sourceDateEpoch: 0,
    });
    const envelope = createGoldenEnvelope({
      artifactKind: 'packets',
      assetId: 'compressed-test.mp4',
      sourceMedia,
      payload: fixture.wrapper,
      provenance,
    });
    const bytes = Buffer.from(`${canonicalJson(envelope)}\n`);
    const result = await readGoldenEvidenceBytesV1({
      kind: 'packets',
      reference: {
        logicalPath: 'golden/compressed-test.mp4.packets.json',
        url: '/fixtures/golden/compressed-test.mp4.packets.json',
        expectedArtifactSha256: digest(bytes),
        expectedArtifactSizeBytes: bytes.byteLength,
        expectedSourceMediaSha256: sourceMedia.sha256,
      },
      bytes,
      parsePayload: readCompactGoldenPacketRows,
    });

    expect(result).toMatchObject({
      state: 'ready',
      reasonCode: 'GOLDEN_READY',
      value: { length: 128 },
      envelope: { payload: { schema: 'media-test/golden-packets-columnar@1' } },
    });
    expect(result.state === 'ready' && result.envelope.provenance.outputArtifact).toEqual({
      digestScope: 'canonical-payload',
      sha256: fixture.wrapper.decodedSha256,
      sizeBytes: fixture.wrapper.decodedSizeBytes,
    });
  });

  test('strict validation rejects unknown keys, noncanonical base64, header drift, and ceilings', async () => {
    const fixture = await writtenFixture();
    const wrapper = fixture.wrapper;
    expect(() => validateCompressedGoldenArtifact({ ...wrapper, extra: true })).toThrow(/unknown keys/);
    expect(() => validateCompressedGoldenArtifact({ ...wrapper, payload: `${wrapper.payload.slice(0, -1)}\n` }))
      .toThrow(/canonical base64|non-base64|padding/);
    const tailBits = { ...wrapper, payload: 'AB==' };
    expect(() => validateCompressedGoldenArtifact(tailBits)).toThrow(/tail bits/);
    await expect(inspectWrittenMutation(fixture.root, 'tail-bits', tailBits)).rejects.toThrow(/canonical base64/);
    expect(() => validateCompressedGoldenArtifact(wrapper, { maxDecodedSizeBytes: wrapper.decodedSizeBytes - 1 }))
      .toThrow(/decoded size exceeds/);
    expect(() => validateCompressedGoldenArtifact(wrapper, { maxWrapperSizeBytes: fixture.bytes.byteLength }))
      .toThrow(/physical-size ceiling/);

    const changedHeader = Buffer.from(wrapper.payload, 'base64');
    changedHeader[9] = 0x03;
    const nonDeterministic = { ...wrapper, payload: changedHeader.toString('base64') };
    expect(() => validateCompressedGoldenArtifact(nonDeterministic)).toThrow(/deterministic level-9/);
    const headerPath = join(fixture.root, 'header.wrapper.json');
    writeFileSync(headerPath, canonicalJson(nonDeterministic));
    await expect(inspectDeterministicCompressedGoldenArtifact({ path: headerPath }))
      .rejects.toThrow(/deterministic level-9/);

    const prettyPath = join(fixture.root, 'pretty.wrapper.json');
    writeFileSync(prettyPath, JSON.stringify(wrapper, null, 2));
    await expect(inspectDeterministicCompressedGoldenArtifact({ path: prettyPath }))
      .rejects.toThrow(/canonical|bounded contract/);
  });

  test('digest mismatch, corrupt/truncated gzip, and declared-size zip bombs fail closed', async () => {
    const fixture = await writtenFixture();
    const { wrapper, root } = fixture;

    const badDigest = { ...wrapper, decodedSha256: '0'.repeat(64) };
    await expect(decodeCompressedGoldenArtifact(badDigest)).rejects.toThrow(/decoded digest/);
    await expect(inspectWrittenMutation(root, 'digest', badDigest)).rejects.toThrow(/decoded digest/);

    const gzip = Buffer.from(wrapper.payload, 'base64');
    gzip[Math.floor(gzip.byteLength / 2)]! ^= 0x01;
    const corrupt = { ...wrapper, payload: gzip.toString('base64') };
    await expect(decodeCompressedGoldenArtifact(corrupt)).rejects.toThrow(/corrupt|truncated|decoded digest/);
    await expect(inspectWrittenMutation(root, 'corrupt', corrupt)).rejects.toThrow(/corrupt|truncated|decoded digest/);

    const truncatedBytes = Buffer.from(wrapper.payload, 'base64').subarray(0, -8);
    const truncated = { ...wrapper, payload: truncatedBytes.toString('base64') };
    await expect(decodeCompressedGoldenArtifact(truncated)).rejects.toThrow(/corrupt|truncated/);
    await expect(inspectWrittenMutation(root, 'truncated', truncated)).rejects.toThrow(/corrupt|truncated/);

    const zipBombDeclaration = { ...wrapper, decodedSizeBytes: 1 };
    await expect(decodeCompressedGoldenArtifact(zipBombDeclaration)).rejects.toThrow(/expanded beyond/);
    const partial = join(root, 'zip-bomb.decoded.json');
    await expect(inspectWrittenMutation(root, 'zip-bomb', zipBombDeclaration, partial))
      .rejects.toThrow(/configured ceiling/);
    expect(existsSync(partial)).toBe(false);
  });

  test('invalid UTF-8 and noncanonical decoded JSON fail closed', async () => {
    const root = temporaryRoot();
    const invalidUtf8Path = join(root, 'invalid-utf8.json');
    const invalidUtf8WrapperPath = join(root, 'invalid-utf8.wrapper.json');
    writeFileSync(invalidUtf8Path, Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xff, 0x7d]));
    await writeDeterministicCompressedGoldenArtifact({
      decodedPath: invalidUtf8Path,
      outputPath: invalidUtf8WrapperPath,
    });
    const invalidUtf8Wrapper = JSON.parse(readFileSync(invalidUtf8WrapperPath, 'utf8'));
    await expect(decodeCompressedGoldenArtifact(invalidUtf8Wrapper)).rejects.toThrow(/not valid UTF-8/);

    const noncanonicalPath = join(root, 'noncanonical.json');
    const noncanonicalWrapperPath = join(root, 'noncanonical.wrapper.json');
    writeFileSync(noncanonicalPath, '{"z":0,"a":1}');
    await writeDeterministicCompressedGoldenArtifact({
      decodedPath: noncanonicalPath,
      outputPath: noncanonicalWrapperPath,
    });
    const noncanonicalWrapper = JSON.parse(readFileSync(noncanonicalWrapperPath, 'utf8'));
    await expect(decodeCompressedGoldenArtifact(noncanonicalWrapper)).rejects.toThrow(/not canonical JSON/);
  });

  test('writer refuses decoded and physical ceiling breaches without retaining partial output', async () => {
    const root = temporaryRoot();
    const sourcePath = join(root, 'source.json');
    const outputPath = join(root, 'output.json');
    const source = canonicalJson(compactPacketPayload(32));
    writeFileSync(sourcePath, source);
    await expect(writeDeterministicCompressedGoldenArtifact({
      decodedPath: sourcePath,
      outputPath,
      maxDecodedSizeBytes: Buffer.byteLength(source) - 1,
    })).rejects.toThrow(/decoded canonical artifact exceeds/);
    expect(existsSync(outputPath)).toBe(false);

    await expect(writeDeterministicCompressedGoldenArtifact({
      decodedPath: sourcePath,
      outputPath,
      maxWrapperSizeBytes: 64,
    })).rejects.toThrow(/compressed golden wrapper exceeds/);
    expect(existsSync(outputPath)).toBe(false);

    writeFileSync(outputPath, 'preexisting-owner-data');
    await expect(writeDeterministicCompressedGoldenArtifact({ decodedPath: sourcePath, outputPath }))
      .rejects.toThrow();
    expect(readFileSync(outputPath, 'utf8')).toBe('preexisting-owner-data');

    const validPath = join(root, 'valid.wrapper.json');
    await writeDeterministicCompressedGoldenArtifact({ decodedPath: sourcePath, outputPath: validPath });
    const decodedOutputPath = join(root, 'preexisting-decoded.json');
    writeFileSync(decodedOutputPath, 'preexisting-decoded-owner-data');
    await expect(inspectDeterministicCompressedGoldenArtifact({ path: validPath, decodedOutputPath }))
      .rejects.toThrow();
    expect(readFileSync(decodedOutputPath, 'utf8')).toBe('preexisting-decoded-owner-data');
  });
});

async function writtenFixture(): Promise<{
  root: string;
  path: string;
  bytes: Buffer;
  wrapper: any;
}> {
  const root = temporaryRoot();
  const sourcePath = join(root, 'source.json');
  const path = join(root, 'wrapper.json');
  writeFileSync(sourcePath, canonicalJson(compactPacketPayload(128)));
  await writeDeterministicCompressedGoldenArtifact({ decodedPath: sourcePath, outputPath: path });
  const bytes = readFileSync(path);
  return { root, path, bytes, wrapper: JSON.parse(bytes.toString('utf8')) };
}

async function inspectWrittenMutation(root: string, name: string, value: unknown, decodedOutputPath?: string) {
  const path = join(root, `${name}.wrapper.json`);
  writeFileSync(path, canonicalJson(value));
  return inspectDeterministicCompressedGoldenArtifact({ path, ...(decodedOutputPath ? { decodedOutputPath } : {}) });
}

function compactPacketPayload(rowCount: number): unknown {
  const packets = Array.from({ length: rowCount }, (_, index) => ({
    stream_index: 0,
    size: String(7 + index % 3),
    pts: String(index * 3_000),
    dts: String(index * 3_000),
    duration: '3000',
    flags: index % 30 === 0 ? 'K__' : '___',
    data_hash: `SHA256:${index.toString(16).padStart(64, '0')}`,
  }));
  return normalizeGoldenPacketEvidence({
    format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2' },
    streams: [{
      index: 0,
      codec_type: 'video',
      codec_name: 'h264',
      codec_tag_string: 'avc1',
      time_base: '1/90000',
      width: 16,
      height: 16,
    }],
    packets,
    frames: [],
  }, {
    assetId: 'compressed-test.mp4',
    compactStorage: true,
    decodedUnits: [],
    decoderObservation: { state: 'not-run' },
  });
}

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'media-test-compressed-golden-'));
  roots.push(root);
  return root;
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function recordedPerimeter(): unknown {
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
