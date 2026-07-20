import { createHash } from 'node:crypto';

import { describe, expect, test } from 'bun:test';

import { flatProtectedReferenceBindingForGolden } from '../fixtures/bake.mjs';
import { scenarioProtectedReferenceBindingForGolden } from '../fixtures/bake-scenario-goldens.mjs';
import {
  createGoldenProvenance,
} from '../fixtures/lib/golden-contract.mjs';
import {
  canonicalJsonIdentity,
  canonicalSha256,
} from '../fixtures/lib/golden-normalization.mjs';
import { validateGoldenProvenanceCrossFields } from '../fixtures/lib/golden-provenance-validation.mjs';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const KEY_HEX = '00112233445566778899aabbccddeeff';
const KID_HEX = 'ffeeddccbbaa99887766554433221100';

describe('protected reference producer provenance', () => {
  test('flat binding records exact source/base/key identities and the invoked mp4decrypt version', () => {
    const basePerimeter = recordedPerimeter();
    const sourceMedia = { sha256: SHA_A, sizeBytes: 101 };
    const cleartextBase = { sha256: SHA_B, sizeBytes: 97 };
    const binding = flatProtectedReferenceBindingForGolden({
      assetId: 'cenc_ctr.mp4',
      sourceMedia,
      cleartextBase,
      secret: { scheme: 'cenc-ctr', keyHex: KEY_HEX, kid: KID_HEX },
      perimeter: basePerimeter,
      mp4decryptTool: decryptTool(),
    });

    expect(binding.perimeter.tools.bento4).toEqual(decryptTool());
    expect(basePerimeter.tools.bento4).toMatchObject({ executable: 'mp4encrypt' });
    expect(binding.dependencies).toEqual([
      { logicalId: 'fixtures/media/cenc_ctr.mp4', sha256: SHA_A, sizeBytes: 101 },
      { logicalId: 'fixtures/media/cenc_ctr_clear.mp4', sha256: SHA_B, sizeBytes: 97 },
      { logicalId: 'protected-reference/content-key', ...hexIdentity(KEY_HEX) },
      { logicalId: 'protected-reference/key-id', ...hexIdentity(KID_HEX) },
    ]);
    expect(binding.normalizedArguments).toEqual({
      protectedReference: {
        schema: 'media-test/protected-reference@1',
        method: 'mp4decrypt',
        scheme: 'cenc-ctr',
        source: { logicalId: 'fixtures/media/cenc_ctr.mp4', sha256: SHA_A, sizeBytes: 101 },
        cleartextBase: {
          logicalId: 'fixtures/media/cenc_ctr_clear.mp4', sha256: SHA_B, sizeBytes: 97,
        },
        keyIdentity: hexIdentity(KEY_HEX),
        kidIdentity: hexIdentity(KID_HEX),
      },
    });
    const serialized = JSON.stringify(binding);
    expect(serialized).not.toContain(KEY_HEX);
    expect(serialized).not.toContain(KID_HEX);
    expect(serialized).not.toContain('mp4encrypt');

    const provenance = provenanceFor('cenc_ctr.mp4', sourceMedia, binding);
    expect(validateGoldenProvenanceCrossFields(provenance, { canonicalSha256 })).toEqual([]);
    expect(() => flatProtectedReferenceBindingForGolden({
      assetId: 'cenc_ctr.mp4',
      sourceMedia,
      cleartextBase,
      secret: { scheme: 'cenc-ctr', keyHex: KEY_HEX, kid: KID_HEX },
      perimeter: recordedPerimeter(),
      mp4decryptTool: {
        state: 'present', executable: 'mp4encrypt',
        versionOutput: 'MP4 Encrypter - Version 1.7', exitStatus: 1,
      },
    })).toThrow(/must record a present mp4decrypt executable and version/);
  });

  test('scenario binding adds canonical _sources row/input dependencies without leaking secrets', () => {
    const catalogFile = scenarioFile();
    const catalogRow = {
      scenarioId: 'probe/cenc_ctr',
      class: 'DERIVED',
      note: 'protected candidates',
      files: [catalogFile],
    };
    const sourceMedia = { sha256: SHA_A, sizeBytes: 101 };
    const cleartextBase = { sha256: SHA_B, sizeBytes: 97 };
    const binding = scenarioProtectedReferenceBindingForGolden({
      assetId: 'scenarios/probe/cenc_ctr/01.mp4',
      sourceMedia,
      cleartextBase,
      catalogRow,
      catalogFile,
      secret: catalogFile.keys,
      perimeter: recordedPerimeter(),
      mp4decryptTool: decryptTool(),
    });
    const rowIdentity = canonicalJsonIdentity(catalogRow);
    const fileIdentity = canonicalJsonIdentity(catalogFile);

    expect(binding.dependencies).toEqual([
      {
        logicalId: 'fixtures/media/scenarios/_derived_cleartext/base.mp4',
        sha256: SHA_B,
        sizeBytes: 97,
      },
      {
        logicalId: 'fixtures/media/scenarios/_sources.ndjson#probe/cenc_ctr',
        ...rowIdentity,
      },
      {
        logicalId: 'fixtures/media/scenarios/_sources.ndjson#probe/cenc_ctr/01.mp4',
        ...fileIdentity,
      },
      {
        logicalId: 'fixtures/media/scenarios/probe/cenc_ctr/01.mp4',
        sha256: SHA_A,
        sizeBytes: 101,
      },
      { logicalId: 'protected-reference/content-key', ...hexIdentity(KEY_HEX) },
      { logicalId: 'protected-reference/key-id', ...hexIdentity(KID_HEX) },
    ]);
    expect(binding.perimeter.tools.bento4).toEqual(decryptTool());
    const serialized = JSON.stringify(binding);
    expect(serialized).not.toContain(KEY_HEX);
    expect(serialized).not.toContain(KID_HEX);

    const provenance = provenanceFor('scenarios/probe/cenc_ctr/01.mp4', sourceMedia, binding);
    expect(validateGoldenProvenanceCrossFields(provenance, { canonicalSha256 })).toEqual([]);
  });

  test('source, cleartext, key, KID, catalog, and tool-version mutations all change provenance', () => {
    const baseline = scenarioInputs();
    const baselineDigest = scenarioProvenanceDigest(baseline);
    const mutations = [
      (value: any) => { value.sourceMedia.sha256 = '1'.repeat(64); },
      (value: any) => { value.cleartextBase.sha256 = '2'.repeat(64); },
      (value: any) => { value.catalogFile.keys.keyHex = '10'.repeat(16); },
      (value: any) => { value.catalogFile.keys.kid = '20'.repeat(16); },
      (value: any) => { value.catalogRow.note = 'mutated catalog row'; },
      (value: any) => { value.catalogFile.durationSec = 99; },
      (value: any) => { value.mp4decryptTool.versionOutput = 'MP4 Decrypter - Version 9.9'; },
    ];

    const digests = mutations.map((mutate) => {
      const changed = structuredClone(baseline);
      // Keep the row's selected file and the explicit input file as the same consumed object.
      changed.catalogFile = changed.catalogRow.files[0];
      mutate(changed);
      return scenarioProvenanceDigest(changed);
    });
    for (const digest of digests) expect(digest).not.toBe(baselineDigest);
    expect(new Set(digests).size).toBe(digests.length);
  });
});

function scenarioProvenanceDigest(input: ReturnType<typeof scenarioInputs>) {
  const binding = scenarioProtectedReferenceBindingForGolden({
    assetId: 'scenarios/probe/cenc_ctr/01.mp4',
    ...input,
    secret: input.catalogFile.keys,
  });
  return canonicalSha256(provenanceFor(
    'scenarios/probe/cenc_ctr/01.mp4',
    input.sourceMedia,
    binding,
  ));
}

function scenarioInputs() {
  const catalogFile = scenarioFile();
  return {
    sourceMedia: { sha256: SHA_A, sizeBytes: 101 },
    cleartextBase: { sha256: SHA_B, sizeBytes: 97 },
    catalogFile,
    catalogRow: {
      scenarioId: 'probe/cenc_ctr',
      class: 'DERIVED',
      note: 'protected candidates',
      files: [catalogFile],
    },
    perimeter: recordedPerimeter(),
    mp4decryptTool: decryptTool(),
  };
}

function scenarioFile() {
  return {
    file: '01.mp4',
    sha256: SHA_A,
    sizeBytes: 101,
    durationSec: 5,
    cleartextBase: {
      poolPath: '_derived_cleartext/base.mp4',
      sha256: SHA_B,
      sizeBytes: 97,
    },
    keys: { scheme: 'cenc-ctr', keyHex: KEY_HEX, kid: KID_HEX },
  };
}

function provenanceFor(assetId: string, sourceMedia: any, binding: any) {
  return createGoldenProvenance({
    artifactKind: 'metadata',
    assetId,
    sourceMedia,
    recipe: 'tests/protected-reference-provenance#metadata',
    normalizedArguments: {
      assetId,
      artifactKind: 'metadata',
      sourceSha256: sourceMedia.sha256,
      normalizationVersion: 'golden-normalization@1',
      ...binding.normalizedArguments,
    },
    dependencies: binding.dependencies,
    baker: 'protected-reference-test@1',
    perimeter: binding.perimeter,
    payload: { metadata: { container: 'mp4' } },
    sourceDateEpoch: 0,
  });
}

function hexIdentity(hex: string) {
  const bytes = Buffer.from(hex, 'hex');
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.byteLength,
  };
}

function decryptTool() {
  return {
    state: 'present',
    executable: 'mp4decrypt',
    versionOutput: 'MP4 Decrypter - Version 1.7',
    exitStatus: 1,
  };
}

function recordedPerimeter() {
  const absent = { state: 'absent' };
  return {
    schemaVersion: 'tool-perimeter@1',
    tools: {
      bun: { state: 'present', executable: 'bun', versionOutput: '1.3.14' },
      ffmpeg: { state: 'present', executable: 'ffmpeg', versionOutput: 'ffmpeg version 8.1.2' },
      ffprobe: { state: 'present', executable: 'ffprobe', versionOutput: 'ffprobe version 8.1.2' },
      bento4: {
        state: 'present', executable: 'mp4encrypt',
        versionOutput: 'MP4 Encrypter - Version 1.7', exitStatus: 1,
      },
      bento4Hls: absent,
      shakaPackager: absent,
      playwright: absent,
      browser: absent,
    },
    platform: { os: 'test', release: 'test', arch: 'test', locale: 'C.UTF-8', timezone: 'UTC' },
    environment: {
      SOURCE_DATE_EPOCH: '0', LANG: 'C.UTF-8', LC_ALL: null, TZ: 'UTC', BRAVE_PATH: null,
      FFMPEG_PATH: null, FFPROBE_PATH: null,
    },
    declaredLock: {
      sha256: 'd'.repeat(64), sourceDateEpoch: 0, locale: 'C.UTF-8', timezone: 'UTC',
      required: { bun: '1.3.14', ffmpeg: '8.1.2', ffprobe: '8.1.2' },
      optional: { bento4: 'record-if-present' },
    },
  };
}
