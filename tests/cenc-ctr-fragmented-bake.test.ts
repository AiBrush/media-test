import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import {
  CENC_CTR_FRAGMENTED_ASSET_ID,
  CENC_CTR_FRAGMENTED_MOVFLAGS,
  FLAT_PROTECTED_MP4_ASSET_IDS,
  assertFullAvFrameMd5Equivalent,
  buildBento4CencCtrFragmentedEncryptionArgs,
  cencCtrFragmentedIvLabel,
  flatProtectedReferenceBindingForGolden,
} from '../fixtures/bake.mjs';
import { assertFragmentedCencCtrStructure } from '../src/features/encryption/structural-evidence.ts';
import { encryptionScenarios } from '../src/scenarios/encryption/index.ts';
import { probeScenarios } from '../src/scenarios/probe/index.ts';

const KEY_HEX = '00112233445566778899aabbccddeeff';
const KID_HEX = '11223344556677889900aabbccddeeff';
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const INITIAL_IVS = {
  1: '95be07dd3716f616',
  2: '8ebdb2ab2137664d',
} as const;

describe('probe-owned flat fragmented CENC-CTR fixture', () => {
  test('direct fMP4 authoring feeds strict two-track Bento4 CENC with deterministic 64-bit IVs', () => {
    const seed = JSON.parse(readFileSync('fixtures/fixture-seed.json', 'utf8')).seedHex as string;
    const plan = buildBento4CencCtrFragmentedEncryptionArgs({
      keyHex: KEY_HEX,
      kidHex: KID_HEX,
      seedHex: seed,
      plainPath: '/tmp/direct-fragmented-plain.mp4',
      outputPath: '/tmp/cenc_ctr_fragmented.mp4',
    });

    expect(CENC_CTR_FRAGMENTED_MOVFLAGS).toBe('+frag_keyframe+empty_moov+default_base_moof');
    expect(FLAT_PROTECTED_MP4_ASSET_IDS).toEqual([
      'cenc_ctr.mp4',
      'cenc_ctr_fragmented.mp4',
      'cenc_cens.mp4',
      'cenc_cbcs.mp4',
    ]);
    expect(cencCtrFragmentedIvLabel(1)).toBe('cenc_ctr_fragmented.mp4:bento4:track-1:iv');
    expect(cencCtrFragmentedIvLabel(2)).toBe('cenc_ctr_fragmented.mp4:bento4:track-2:iv');
    expect(plan.ivHexByTrack).toEqual({
      1: '95be07dd3716f616',
      2: '8ebdb2ab2137664d',
    });
    expect(new Set(Object.values(plan.ivHexByTrack)).size).toBe(2);
    expect(Object.values(plan.ivHexByTrack).every((iv) => /^[0-9a-f]{16}$/.test(iv))).toBe(true);
    expect(plan.args).toEqual([
      '--method', 'MPEG-CENC',
      '--strict',
      '--key', `1:${KEY_HEX}:95be07dd3716f616`,
      '--property', `1:KID:${KID_HEX}`,
      '--key', `2:${KEY_HEX}:8ebdb2ab2137664d`,
      '--property', `2:KID:${KID_HEX}`,
      '/tmp/direct-fragmented-plain.mp4',
      '/tmp/cenc_ctr_fragmented.mp4',
    ]);
    const bakeSource = readFileSync('fixtures/bake.mjs', 'utf8');
    const ctrRecipeStart = bakeSource.indexOf('[CENC_CTR_FRAGMENTED_ASSET_ID]: (out) =>');
    const ctrRecipeEnd = bakeSource.indexOf('\n  [CENC_CENS_ASSET_ID]: (out) =>', ctrRecipeStart);
    expect(ctrRecipeStart).toBeGreaterThan(0);
    expect(ctrRecipeEnd).toBeGreaterThan(ctrRecipeStart);
    const ctrRecipeSource = bakeSource.slice(ctrRecipeStart, ctrRecipeEnd);
    expect(ctrRecipeSource).not.toMatch(/spawnSync\(\s*['"]mp4fragment['"]/u);
    expect(ctrRecipeSource).not.toMatch(/['"]mp4fragment['"]\s*,/u);
    const structuralAdmission = bakeSource.indexOf('\n      assertFragmentedCencCtrStructure(');
    expect(structuralAdmission).toBeGreaterThan(bakeSource.indexOf("spawnSync('mp4encrypt'"));
    expect(structuralAdmission).toBeLessThan(bakeSource.indexOf("spawnSync(\n        'mp4decrypt'"));
    expect(structuralAdmission).toBeLessThan(bakeSource.indexOf('copyFileSync(encrypted, out)'));
    expect(() => cencCtrFragmentedIvLabel(3)).toThrow('track must be 1 or 2');
  });

  test('structural admission binds protected tracks, fragments, KID, scheme, and both stored IV domains', () => {
    const valid = fragmentedCencCtrFixture();
    expect(assertFragmentedCencCtrStructure(valid, KID_HEX, INITIAL_IVS, 'flat test')).toMatchObject({
      state: 'OK',
      sampleEncryptionBoxes: 2,
      tracks: [
        { trackId: 1, type: 'video', protected: true, scheme: 'cenc', defaultKid: KID_HEX },
        { trackId: 2, type: 'audio', protected: true, scheme: 'cenc', defaultKid: KID_HEX },
      ],
    });
    expect(() => assertFragmentedCencCtrStructure(
      fragmentedCencCtrFixture({ handlers: { 1: 'soun', 2: 'vide' } }),
      KID_HEX,
      INITIAL_IVS,
      'flat test',
    )).toThrow('expected exactly protected video track 1 and audio track 2');
    expect(() => assertFragmentedCencCtrStructure(
      fragmentedCencCtrFixture({ scheme: 'cbcs' }),
      KID_HEX,
      INITIAL_IVS,
      'flat test',
    )).toThrow('must declare cenc with catalog KID');
    expect(() => assertFragmentedCencCtrStructure(
      fragmentedCencCtrFixture({ kidHex: '22'.repeat(16) }),
      KID_HEX,
      INITIAL_IVS,
      'flat test',
    )).toThrow('must declare cenc with catalog KID');
    expect(() => assertFragmentedCencCtrStructure(
      fragmentedCencCtrFixture({ includeMoof: false }),
      KID_HEX,
      INITIAL_IVS,
      'flat test',
    )).toThrow('contains no top-level moof fragment');
    expect(() => assertFragmentedCencCtrStructure(
      fragmentedCencCtrFixture({ omitSencTrack: 2 }),
      KID_HEX,
      INITIAL_IVS,
      'flat test',
    )).toThrow('fragment track 2 must contain exactly one senc box');
    expect(() => assertFragmentedCencCtrStructure(
      fragmentedCencCtrFixture({ ivHexByTrack: { ...INITIAL_IVS, 1: '00'.repeat(8) } }),
      KID_HEX,
      INITIAL_IVS,
      'flat test',
    )).toThrow('track 1 first sample IV');
    expect(() => assertFragmentedCencCtrStructure(
      fragmentedCencCtrFixture({ extraTopLevelSenc: true }),
      KID_HEX,
      INITIAL_IVS,
      'flat test',
    )).toThrow('sample encryption boxes are not bound to protected tracks 1 and 2');
  });

  test('author-time equivalence requires complete matching video and audio framemd5 evidence', () => {
    const clear = frameMd5();
    expect(assertFullAvFrameMd5Equivalent(clear, clear, CENC_CTR_FRAGMENTED_ASSET_ID)).toMatchObject({
      rowCount: 2,
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(() => assertFullAvFrameMd5Equivalent(
      clear,
      clear.replace('b'.repeat(64), 'c'.repeat(64)),
      CENC_CTR_FRAGMENTED_ASSET_ID,
    )).toThrow('mp4decrypt full A/V framemd5 differs from cenc_ctr_clear.mp4');
    expect(() => assertFullAvFrameMd5Equivalent(
      clear,
      clear.split('\n').filter((line) => !line.startsWith('#tb 1:') && !line.startsWith('1,')).join('\n'),
      CENC_CTR_FRAGMENTED_ASSET_ID,
    )).toThrow('must contain mapped video stream 0 and audio stream 1');
  });

  test('manifest and probe lifecycle-bind the dedicated asset while encryption keeps the legacy asset', () => {
    const manifest = JSON.parse(readFileSync('fixtures/manifest.json', 'utf8')) as {
      assets: Array<Record<string, unknown>>;
    };
    const asset = manifest.assets.find((candidate) => candidate.id === CENC_CTR_FRAGMENTED_ASSET_ID);
    expect(asset).toMatchObject({
      source: 'generated',
      container: 'mp4',
      codecs: ['h264', 'aac'],
    });
    const mediaPath = `fixtures/media/${CENC_CTR_FRAGMENTED_ASSET_ID}`;
    if (existsSync(mediaPath)) {
      const bytes = readFileSync(mediaPath);
      expect(asset).toMatchObject({
        sha256: createHash('sha256').update(bytes).digest('hex'),
        sizeBytes: bytes.byteLength,
      });
    } else {
      expect(asset).toMatchObject({ sha256: null, sizeBytes: null });
    }
    expect(probeScenarios.find((scenario) => scenario.id === 'probe/cenc_ctr')).toMatchObject({
      input: CENC_CTR_FRAGMENTED_ASSET_ID,
    });
    for (const id of [
      'encryption/cenc_ctr_decrypt',
      'encryption/cenc_ctr_decrypt_eq_cleartext',
      'encryption/perf_cenc_ctr_decrypt_throughput',
    ]) {
      expect(encryptionScenarios.find((scenario) => scenario.id === id)?.input, id).toBe('cenc_ctr.mp4');
    }
  });

  test('protected golden provenance binds the new source, clear baseline, key/KID, and mp4decrypt', () => {
    const perimeter = {
      schemaVersion: 'tool-perimeter@1',
      tools: { bento4: { state: 'present', executable: 'mp4encrypt', versionOutput: 'encrypt 1.7' } },
    };
    const binding = flatProtectedReferenceBindingForGolden({
      assetId: CENC_CTR_FRAGMENTED_ASSET_ID,
      sourceMedia: { sha256: SHA_A, sizeBytes: 101 },
      cleartextBase: { sha256: SHA_B, sizeBytes: 97 },
      secret: { scheme: 'cenc-ctr', keyHex: KEY_HEX, kid: KID_HEX },
      perimeter,
      mp4decryptTool: {
        state: 'present',
        executable: 'mp4decrypt',
        versionOutput: 'MP4 Decrypter - Version 1.7',
        exitStatus: 1,
      },
    });
    expect(binding.normalizedArguments.protectedReference).toMatchObject({
      method: 'mp4decrypt',
      scheme: 'cenc-ctr',
      source: {
        logicalId: 'fixtures/media/cenc_ctr_fragmented.mp4',
        sha256: SHA_A,
        sizeBytes: 101,
      },
      cleartextBase: {
        logicalId: 'fixtures/media/cenc_ctr_clear.mp4',
        sha256: SHA_B,
        sizeBytes: 97,
      },
    });
    expect(binding.perimeter.tools.bento4.executable).toBe('mp4decrypt');
    expect(JSON.stringify(binding)).not.toContain(KEY_HEX);
    expect(JSON.stringify(binding)).not.toContain(KID_HEX);
  });
});

function frameMd5(): string {
  return [
    '#format: frame checksums',
    '#hash: SHA256',
    '#tb 0: 1/30',
    '#tb 1: 1/48000',
    `0,          0,          0,        1,      4, ${'a'.repeat(64)}`,
    `1,          0,          0,     1024,   4096, ${'b'.repeat(64)}`,
    '',
  ].join('\n');
}

function fragmentedCencCtrFixture(options: Readonly<{
  kidHex?: string;
  scheme?: string;
  handlers?: Readonly<Record<1 | 2, 'vide' | 'soun'>>;
  ivHexByTrack?: Readonly<Record<1 | 2, string>>;
  includeMoof?: boolean;
  omitSencTrack?: 1 | 2;
  extraTopLevelSenc?: boolean;
}> = {}): Uint8Array {
  const kidHex = options.kidHex ?? KID_HEX;
  const scheme = options.scheme ?? 'cenc';
  const handlers = options.handlers ?? { 1: 'vide', 2: 'soun' };
  const ivHexByTrack = options.ivHexByTrack ?? INITIAL_IVS;
  const moov = isoBox(
    'moov',
    protectedTrack(1, handlers[1], scheme, kidHex),
    protectedTrack(2, handlers[2], scheme, kidHex),
  );
  const fragments = options.includeMoof === false
    ? []
    : [isoBox(
        'moof',
        protectedFragmentTrack(1, ivHexByTrack[1], options.omitSencTrack === 1),
        protectedFragmentTrack(2, ivHexByTrack[2], options.omitSencTrack === 2),
      )];
  const extra = options.extraTopLevelSenc
    ? [sampleEncryptionBox(`${INITIAL_IVS[1]}${'0'.repeat(16)}`)]
    : [];
  return joinBytes([moov, ...fragments, ...extra]);
}

function protectedTrack(trackId: 1 | 2, handler: 'vide' | 'soun', scheme: string, kidHex: string): Uint8Array {
  const tkhdBody = new Uint8Array(16);
  writeUint32(tkhdBody, 12, trackId);
  const handlerBody = joinBytes([new Uint8Array(8), asciiBytes(handler)]);
  const tencBody = new Uint8Array(24);
  tencBody[6] = 1;
  tencBody[7] = 16;
  tencBody.set(hexBytes(kidHex), 8);
  const originalFormat = handler === 'vide' ? 'avc1' : 'mp4a';
  const protectedEntry = handler === 'vide' ? 'encv' : 'enca';
  const sinf = isoBox(
    'sinf',
    isoBox('frma', asciiBytes(originalFormat)),
    isoBox('schm', new Uint8Array(4), asciiBytes(scheme), uint32Bytes(0x0001_0000)),
    isoBox('schi', isoBox('tenc', tencBody)),
  );
  const stsd = isoBox(
    'stsd',
    new Uint8Array(4),
    uint32Bytes(1),
    isoBox(protectedEntry, sinf),
  );
  return isoBox(
    'trak',
    isoBox('tkhd', tkhdBody),
    isoBox(
      'mdia',
      isoBox('hdlr', handlerBody),
      isoBox('minf', isoBox('stbl', stsd)),
    ),
  );
}

function protectedFragmentTrack(trackId: 1 | 2, initialIvHex: string, omitSenc: boolean): Uint8Array {
  return isoBox(
    'traf',
    isoBox('tfhd', new Uint8Array(4), uint32Bytes(trackId)),
    ...(omitSenc ? [] : [sampleEncryptionBox(`${initialIvHex}${'0'.repeat(16)}`)]),
  );
}

function sampleEncryptionBox(firstIvHex: string): Uint8Array {
  return isoBox('senc', new Uint8Array(4), uint32Bytes(1), hexBytes(firstIvHex));
}

function isoBox(type: string, ...parts: readonly Uint8Array[]): Uint8Array {
  const body = joinBytes(parts);
  const bytes = new Uint8Array(8 + body.byteLength);
  writeUint32(bytes, 0, bytes.byteLength);
  bytes.set(asciiBytes(type), 4);
  bytes.set(body, 8);
  return bytes;
}

function joinBytes(parts: readonly Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((size, part) => size + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
}

function asciiBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function hexBytes(value: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})+$/u.test(value)) throw new TypeError(`invalid test hex ${value}`);
  return Uint8Array.from(value.match(/.{2}/gu)!.map((byte) => Number.parseInt(byte, 16)));
}

function uint32Bytes(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  writeUint32(bytes, 0, value);
  return bytes;
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value);
}
