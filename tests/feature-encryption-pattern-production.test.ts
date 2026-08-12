import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  createNotApplicableError,
  isNotApplicableError,
  type BrowserName,
  type CapabilitySet,
  type MediaBytes,
  type MediaEngine,
  type NormalizedMetadata,
} from '../src/core/engine.ts';
import type { CodecSupport } from '../src/core/feature-detect.ts';
import type { ResolvedInput, VerifiedContent } from '../src/core/media-selection.ts';
import { sha256Hex } from '../src/core/seeded-rng.ts';
import { runOne, type PixelBehaviorEvidence } from '../src/core/runner.ts';
import { defineScenario, type Scenario } from '../src/core/scenario.ts';
import {
  assessPatternGroundTruth,
  encryptionKeyProvenanceFromOptions,
  inspectPatternBoundaryEvidence,
  type EncryptionPatternContract,
} from '../src/features/encryption/index.ts';
import { encryptionScenarios } from '../src/scenarios/encryption/index.ts';
import { demuxMp4Video } from '../src/engines/platform/demux-mp4.ts';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function bytesAt(path: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`../${path}`, import.meta.url)));
}

function scenario(id: string): Scenario {
  const found = encryptionScenarios.find((entry) => entry.id === `encryption/${id}`);
  if (!found) throw new Error(`missing encryption scenario ${id}`);
  return found;
}

function patternOf(id: string): EncryptionPatternContract {
  const pattern = encryptionKeyProvenanceFromOptions(scenario(id).options)?.pattern;
  if (!pattern) throw new Error(`missing encryption pattern ${id}`);
  return pattern;
}

function findTypeOffset(bytes: Uint8Array, type: string): number {
  const encoded = new TextEncoder().encode(type);
  outer: for (let offset = 4; offset + encoded.length <= bytes.byteLength; offset++) {
    for (let index = 0; index < encoded.length; index++) {
      if (bytes[offset + index] !== encoded[index]) continue outer;
    }
    return offset;
  }
  throw new Error(`box type ${type} not found`);
}

function mutateFirstTenc(
  bytes: Uint8Array,
  mutation: { pattern?: number; ivSize?: number },
): Uint8Array {
  const out = bytes.slice();
  const typeOffset = findTypeOffset(out, 'tenc');
  if (mutation.pattern !== undefined) out[typeOffset + 9] = mutation.pattern;
  if (mutation.ivSize !== undefined) out[typeOffset + 11] = mutation.ivSize;
  return out;
}

function mutateFirstScheme(bytes: Uint8Array, scheme: 'cens' | 'cbcs'): Uint8Array {
  const out = bytes.slice();
  const typeOffset = findTypeOffset(out, 'schm');
  out.set(new TextEncoder().encode(scheme), typeOffset + 8);
  return out;
}

function decrementFirstCensClearSpan(bytes: Uint8Array): Uint8Array {
  const out = bytes.slice();
  const typeOffset = findTypeOffset(out, 'senc');
  const bodyStart = typeOffset + 4;
  const flags = (out[bodyStart + 1]! << 16) | (out[bodyStart + 2]! << 8) | out[bodyStart + 3]!;
  if ((flags & 2) === 0) throw new Error('first senc does not carry subsample encryption');
  const firstClearBytesOffset = bodyStart + 8 + 16 + 2; // header/count + per-sample IV + subsample_count
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  view.setUint16(firstClearBytesOffset, view.getUint16(firstClearBytesOffset) - 1);
  return out;
}

function shiftFirstCensBoundary(bytes: Uint8Array): Uint8Array {
  const out = bytes.slice();
  const typeOffset = findTypeOffset(out, 'senc');
  const firstClearBytesOffset = typeOffset + 4 + 8 + 16 + 2;
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  view.setUint16(firstClearBytesOffset, view.getUint16(firstClearBytesOffset) - 1);
  view.setUint32(firstClearBytesOffset + 2, view.getUint32(firstClearBytesOffset + 2) + 1);
  return out;
}

describe('REQ-FEAT-56 production CENS/CBCS pattern-boundary evidence', () => {
  const cens = patternOf('cenc_cens_decrypt');
  const cbcs = patternOf('cenc_cbcs_decrypt');
  const canonicalCensBytes = bytesAt('fixtures/media/cenc_cens.mp4');
  const censBytes = bytesAt('fixtures/media/scenarios/encryption/cenc_cens_decrypt/01.mp4');
  const cens02Bytes = bytesAt('fixtures/media/scenarios/encryption/cenc_cens_decrypt/02.mp4');
  const cens03Bytes = bytesAt('fixtures/media/scenarios/encryption/cenc_cens_decrypt/03.mp4');
  const cens01ClearBytes = bytesAt(
    'fixtures/media/scenarios/_derived_cleartext/0cd83d944a6ca7822b4a8306cecc60a36e859b041f6702c6a1ad9ead78924451.mp4',
  );
  const cens02ClearBytes = bytesAt(
    'fixtures/media/scenarios/_derived_cleartext/f9c534ebc1e69ee30c7bc1c364bcd5b92f9d20f8ef07d8d5c5f2773eb4277b99.mp4',
  );
  const cens03ClearBytes = bytesAt(
    'fixtures/media/scenarios/_derived_cleartext/baf03cd8ba8258e83f66da335ee16f657de0a2ae79e6ac771b134bb74d7c3714.mp4',
  );
  const cbcsBytes = bytesAt('fixtures/media/scenarios/encryption/cenc_cbcs_decrypt/01.mp4');

  test('real traf/trun/senc maps prove encrypted↔clear transitions for both schemes', () => {
    for (const [bytes, expected, firstSpan, sampleCount] of [
      [canonicalCensBytes, cens, { clearBytes: 734, protectedBytes: 23_920 }, 150],
      [censBytes, cens, { clearBytes: 902, protectedBytes: 57_168 }, 150],
      [cens02Bytes, cens, { clearBytes: 875, protectedBytes: 259_376 }, 329],
      [cens03Bytes, cens, { clearBytes: 906, protectedBytes: 47_344 }, 161],
      [cbcsBytes, cbcs, { clearBytes: 816, protectedBytes: 57_254 }, 150],
    ] as const) {
      const evidence = inspectPatternBoundaryEvidence(bytes, expected);
      expect(evidence).toMatchObject({
        state: 'OK',
        scheme: expected.scheme,
        trackId: 1,
        sampleCount,
        explicitSubsampleCount: sampleCount,
        implicitWholeSampleCount: 0,
        firstBoundarySubsamples: [firstSpan],
      });
      if (evidence.state !== 'OK') throw new Error(evidence.detail);
      expect(evidence.encryptedBlocks).toBeGreaterThan(0);
      expect(evidence.clearPatternBlocks).toBeGreaterThan(0);
      expect(evidence.encryptedToClearTransitions).toBeGreaterThan(0);
      expect(evidence.clearToEncryptedTransitions).toBeGreaterThan(0);
      expect(assessPatternGroundTruth(bytes, expected)).toMatchObject({
        verdict: 'PASS',
        reasonCode: 'PATTERN_GROUND_TRUTH_MATCH',
      });
    }
  });

  test('the baked constant-IV CBCS form derives an honest implicit whole-sample map', () => {
    const evidence = inspectPatternBoundaryEvidence(bytesAt('fixtures/media/cenc_cbcs.mp4'), cbcs);
    expect(evidence).toMatchObject({
      state: 'OK',
      scheme: 'cenc-cbcs',
      sampleCount: 150,
      explicitSubsampleCount: 0,
      implicitWholeSampleCount: 150,
      firstBoundarySubsamples: [{ clearBytes: 0, protectedBytes: 24_654 }],
    });
    expect(assessPatternGroundTruth(bytesAt('fixtures/media/cenc_cbcs.mp4'), cbcs).verdict).toBe('PASS');
  });

  test('progressive clear bases and equivalent fragmented CENS rotations share one PTS origin', () => {
    for (const [fragmented, progressive] of [
      [censBytes, cens01ClearBytes],
      [cens02Bytes, cens02ClearBytes],
      [cens03Bytes, cens03ClearBytes],
    ] as const) {
      const got = demuxMp4Video(fragmented).samples;
      const want = demuxMp4Video(progressive).samples;
      expect(got).toHaveLength(want.length);
      expect(got.map(({ ptsUs }) => ptsUs)).toEqual(want.map(({ ptsUs }) => ptsUs));
    }
  });

  test('scheme, whole-sample, crypt:skip, IV, and off-by-one span mutations fail locally', () => {
    const mutations: Array<readonly [Uint8Array, EncryptionPatternContract, string]> = [
      [mutateFirstScheme(censBytes, 'cbcs'), cens, 'PATTERN_SCHEME_MISMATCH'],
      [censBytes, cbcs, 'PATTERN_SCHEME_MISMATCH'],
      [mutateFirstTenc(censBytes, { pattern: 0x10 }), cens, 'PATTERN_BLOCK_PATTERN_MISMATCH'],
      [mutateFirstTenc(censBytes, { pattern: 0x29 }), cens, 'PATTERN_BLOCK_PATTERN_MISMATCH'],
      [mutateFirstTenc(censBytes, { pattern: 0x18 }), cens, 'PATTERN_BLOCK_PATTERN_MISMATCH'],
      [mutateFirstTenc(censBytes, { ivSize: 8 }), cens, 'PATTERN_IV_RULE_MISMATCH'],
      [decrementFirstCensClearSpan(censBytes), cens, 'PATTERN_SAMPLE_SPAN_SIZE_MISMATCH'],
      [shiftFirstCensBoundary(censBytes), cens, 'PATTERN_BOUNDARY_VECTOR_MISMATCH'],
    ];
    for (const [bytes, expected, reasonCode] of mutations) {
      expect(assessPatternGroundTruth(bytes, expected)).toMatchObject({ verdict: 'FAIL', reasonCode });
    }
    expect(inspectPatternBoundaryEvidence(decrementFirstCensClearSpan(censBytes), cens)).toMatchObject({
      state: 'MALFORMED',
      reasonCode: 'PATTERN_SAMPLE_SPAN_SIZE_MISMATCH',
    });
  });
});

const browser: BrowserName = 'chromium';
const support: CodecSupport = {
  webcodecs: false,
  videoDecode: {},
  videoEncode: {},
  audioDecode: {},
  audioEncode: {},
  alpha: false,
  strictRgbaPixels: false,
  strictGoldenRgba: false,
  strictSourceRgba: false,
  webgpu: false,
  measureMemory: false,
};
const pixelPass: PixelBehaviorEvidence = {
  state: 'SUPPORTED',
  reasonCode: 'PIXEL_RGBA_ROUNDTRIP_OK',
  detail: 'test behavior passed',
};

function capabilities(encryption: CapabilitySet['encryption']): CapabilitySet {
  return {
    operations: { decrypt: true },
    containersIn: ['mp4'],
    containersOut: ['mp4'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    encryption,
    features: ['webcodecs:independent'],
  };
}

function engine(
  output: MediaBytes | Error | ReturnType<typeof createNotApplicableError>,
  encryption: CapabilitySet['encryption'] = ['cenc-cbcs'],
): MediaEngine {
  const metadata: NormalizedMetadata = { container: 'mp4', durationSec: 1, tracks: [] };
  return {
    id: 'pattern-production-test@1.0.0',
    capabilities: () => capabilities(encryption),
    supports: async () => ({ supported: true }),
    probe: async () => metadata,
    demux: async () => ({ metadata, packets: [], tracks: [], ordering: 'decode' }),
    remux: async () => { throw new Error('unexpected remux'); },
    transcode: async () => { throw new Error('unexpected transcode'); },
    decodeFrames: async () => ({ frames: [] }),
    seek: async () => ({ landedPtsUs: 0, frame: { index: 0, ptsUs: 0, sha256: '00'.repeat(32) } }),
    trim: async () => { throw new Error('unexpected trim'); },
    decrypt: async () => {
      if (output instanceof Error || isNotApplicableError(output)) throw output;
      return output;
    },
  };
}

function verifiedInputs(
  root: Uint8Array,
  clear: Uint8Array,
): { resolvedInputs: ResolvedInput[]; verifiedContents: VerifiedContent[] } {
  const entries = [
    {
      resolved: {
        id: 'pattern-input.mp4',
        urlAssetPath: 'pattern-input.mp4',
        sha256: sha256Hex(root),
        sizeBytes: root.byteLength,
        integrity: 'VERIFIED' as const,
      },
      bytes: root,
    },
    {
      resolved: {
        id: 'cleartext-base:clear-reference.mp4',
        urlAssetPath: 'clear-reference.mp4',
        sha256: sha256Hex(clear),
        sizeBytes: clear.byteLength,
        integrity: 'VERIFIED' as const,
        transport: {
          kind: 'oracle-resource' as const,
          role: 'cleartext-base' as const,
          sourceUri: 'clear-reference.mp4',
        },
      },
      bytes: clear,
    },
  ];
  return {
    resolvedInputs: entries.map((entry) => entry.resolved),
    verifiedContents: entries.map((entry) => ({
      state: 'VERIFIED',
      identity: {
        logicalPath: entry.resolved.urlAssetPath,
        sha256: entry.resolved.sha256,
        sizeBytes: entry.resolved.sizeBytes,
      },
      bytes: entry.bytes,
      actualSha256: entry.resolved.sha256,
      actualSizeBytes: entry.resolved.sizeBytes,
    })),
  };
}

describe('REQ-FEAT-56 production verdict and applicability routing', () => {
  const protectedBytes = bytesAt('fixtures/media/scenarios/encryption/cenc_cbcs_decrypt/01.mp4');
  const clearBytes = bytesAt(
    'fixtures/media/scenarios/_derived_cleartext/0cd83d944a6ca7822b4a8306cecc60a36e859b041f6702c6a1ad9ead78924451.mp4',
  );
  const inputs = verifiedInputs(protectedBytes, clearBytes);
  const source = scenario('cenc_cbcs_decrypt');
  const productionScenario = defineScenario({
    id: 'encryption/cenc-cbcs-pattern-production-routing',
    op: 'decrypt',
    input: 'pattern-input.mp4',
    options: {
      ...(source.options as Record<string, unknown>),
      cleartextAsset: 'clear-reference.mp4',
    },
    requires: source.requires,
    oracles: ['reference-reimport'],
    metrics: [],
  });

  const run = (candidate: MediaEngine) => runOne(candidate, productionScenario, browser, support, {
    ...inputs,
    decryptKeyOverride: { keyHex: 'aa'.repeat(16), kid: 'bb'.repeat(16) },
    pixelBehavior: pixelPass,
    pillar: 'correctness',
  });

  test('clear output passes, protected output fails, and unsupported tuples remain NA_ENGINE', async () => {
    globalThis.fetch = (async () =>
      new Response(null, { status: 404, statusText: 'Not Found' })) as typeof fetch;
    const clearOutput: MediaBytes = { bytes: clearBytes, mime: 'video/mp4', container: 'mp4' };
    const protectedOutput: MediaBytes = { bytes: protectedBytes, mime: 'video/mp4', container: 'mp4' };

    const pass = await run(engine(clearOutput));
    expect(pass.status).toBe('PASS');
    expect(pass.oracleOutcomes).toContainEqual(expect.objectContaining({
      verdict: 'PASS',
      reasonCode: 'DECRYPT_CLEAR_STRUCTURE_VALID',
    }));

    const fail = await run(engine(protectedOutput));
    expect(fail.status).toBe('FAIL');
    expect(fail.oracleOutcomes).toContainEqual(expect.objectContaining({
      verdict: 'FAIL',
      reasonCode: 'DECRYPT_ACTIVE_PROTECTION_REMAINS',
    }));

    const undeclared = await run(engine(clearOutput, []));
    expect(undeclared).toMatchObject({ status: 'NA_ENGINE' });
    expect(undeclared.reason).toContain("encryption scheme 'cenc-cbcs'");

    const runtimeUnsupported = await run(engine(createNotApplicableError(
      'pattern-production-test@1.0.0',
      'decrypt',
      'CBCS pattern form is not implemented by this engine',
      { encryption: ['cenc-cbcs'] },
      'CENC_CBCS_PATTERN_UNSUPPORTED',
    )));
    expect(runtimeUnsupported).toMatchObject({ status: 'NA_ENGINE' });
    expect(runtimeUnsupported.reason).toContain('CENC_CBCS_PATTERN_UNSUPPORTED');
  });
});
