import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  MalformedInputError,
  isMalformedInputError,
  type DecryptKey,
  type FrameDigest,
} from '../src/core/engine.ts';
import {
  reduceExhaustiveStatuses,
  type BenchSummary,
  type ResultStatus,
  type Scenario,
} from '../src/core/scenario.ts';
import { sha256Hex } from '../src/core/seeded-rng.ts';
import { assessCandidateEligibility } from '../src/core/media-selection.ts';
import { parseScenarioSourceCatalog } from '../src/core/selection-integrity.ts';
import {
  decideRobustnessDisposition,
  robustnessContractFromOptions,
  validateRobustnessReturnedValue,
} from '../src/scenarios/robustness/contracts.ts';
import {
  ENCRYPTION_KEY_PROVENANCE_SCHEMA,
  HLS_RESOURCE_INDEX_SCHEMA,
  assessClearDecryptStructure,
  assessDerivedEncryptionRotation,
  assessHlsRequestedMethod,
  assessHlsKeyResourceParity,
  assessPatternBoundaryObservation,
  assessPatternGroundTruth,
  compareCompleteDecryptPresentation,
  compareDecryptNoopBytes,
  decryptRealtimeFactor,
  encryptionKeyProvenanceFromOptions,
  encryptionNegativeContractFromOptions,
  hlsMediaSequenceIv,
  hlsResourceIndexFromOptions,
  inspectHlsResourceReferences,
  inspectIsoBmffEncryption,
  isPositiveSourceEquivalenceScenario,
  parseAuthoritativeKeyRecord,
  parseHlsResourceIndex,
  preflightEncryptionKey,
  preflightHlsResourceIndex,
  rebindHlsPlaylistResources,
  resolveDecryptDuration,
  validateDecryptThroughputSummary,
  validateHlsEncryptionContract,
  withEncryptionKeyPreflight,
  type DerivedCencCandidateContract,
  type EncryptionKeyProvenance,
  type EncryptionPatternContract,
  type HlsEncryptionContract,
  type HlsResourceIdentity,
  type HlsResourceIndex,
  type KeyRecordLoader,
} from '../src/features/encryption/index.ts';
import { DECRYPT_BYTE_IDENTITY_NOOP } from '../src/scenarios/encryption/metamorphic.ts';
import { encryptionScenarios } from '../src/scenarios/encryption/index.ts';

const textEncoder = new TextEncoder();

function bytesAt(path: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`../${path}`, import.meta.url)));
}

function textAt(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function jsonAt(path: string): unknown {
  return JSON.parse(textAt(path)) as unknown;
}

function scenario(id: string): Scenario {
  const value = encryptionScenarios.find((entry) => entry.id === `encryption/${id}`);
  if (!value) throw new Error(`missing encryption scenario ${id}`);
  return value;
}

function optionsOf(value: Scenario): Record<string, unknown> {
  return value.options as Record<string, unknown>;
}

function provenanceOf(value: Scenario): EncryptionKeyProvenance {
  const provenance = encryptionKeyProvenanceFromOptions(value.options);
  if (!provenance) throw new Error(`${value.id} has no encryption provenance`);
  return provenance;
}

function patternOf(id: string): EncryptionPatternContract {
  const pattern = provenanceOf(scenario(id)).pattern;
  if (!pattern) throw new Error(`${id} has no pattern contract`);
  return pattern;
}

function hlsOf(id: string): HlsEncryptionContract {
  const hls = provenanceOf(scenario(id)).hls;
  if (!hls) throw new Error(`${id} has no HLS contract`);
  return hls;
}

const keyRecordLoader: KeyRecordLoader = async (url) => {
  const file = url.split('/').at(-1);
  if (!file) return { state: 'ERROR', detail: `invalid key URL ${url}` };
  try {
    return { state: 'OK', value: jsonAt(`fixtures/golden/${file}`) };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === 'ENOENT'
      ? { state: 'MISSING', detail: `${url} is absent` }
      : { state: 'ERROR', detail: String(error) };
  }
};

function cloneOptionsWithKey(value: Scenario, mutation: Partial<DecryptKey>): Record<string, unknown> {
  const options = optionsOf(value);
  return {
    ...options,
    key: {
      ...(options.key as Record<string, unknown>),
      ...mutation,
    },
  };
}

function appendBytes(first: Uint8Array, second: Uint8Array): Uint8Array {
  const out = new Uint8Array(first.byteLength + second.byteLength);
  out.set(first);
  out.set(second, first.byteLength);
  return out;
}

function inertPsshBox(): Uint8Array {
  // FullBox header + common 16-byte SystemID + zero data_size.
  const bytes = new Uint8Array(32);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 32);
  bytes.set(textEncoder.encode('pssh'), 4);
  view.setUint32(28, 0);
  return bytes;
}

function emptyCencSaizBox(): Uint8Array {
  const bytes = new Uint8Array(25);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, bytes.byteLength);
  bytes.set(textEncoder.encode('saiz'), 4);
  bytes[11] = 1; // flags: auxiliary_info_type/parameter are present
  bytes.set(textEncoder.encode('cenc'), 12);
  // type parameter = 0, default_sample_info_size = 0, sample_count = 0
  return bytes;
}

function frame(index: number, ptsUs: number, digest = `${index}`.padStart(64, '0')): FrameDigest {
  return { index, ptsUs, sha256: digest };
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length < 2) return [[...items]];
  return items.flatMap((head, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((tail) => [head, ...tail]));
}

describe('REQ-FEAT-52 key/IV provenance blocking parity preflight', () => {
  test('the corrected HLS record supplies identical authoritative bytes to every invocation', async () => {
    const value = scenario('hls_aes128_decrypt');
    const observed: DecryptKey[] = [];
    for (let iteration = 0; iteration < 3; iteration++) {
      const result = await withEncryptionKeyPreflight(
        value.options,
        (key) => {
          observed.push(key);
          return key.keyHex;
        },
        keyRecordLoader,
      );
      expect(result.state).toBe('EXECUTED');
    }
    expect(observed).toEqual([
      {
        keyHex: '26cc7945163ec2b0c6c1bf651431a683',
        ivHex: 'c0643a1737869dcf50b7d5daa37b466b',
      },
      {
        keyHex: '26cc7945163ec2b0c6c1bf651431a683',
        ivHex: 'c0643a1737869dcf50b7d5daa37b466b',
      },
      {
        keyHex: '26cc7945163ec2b0c6c1bf651431a683',
        ivHex: 'c0643a1737869dcf50b7d5daa37b466b',
      },
    ]);
  });

  test('mirror drift and invalid records block before the adapter callback', async () => {
    const value = scenario('hls_aes128_decrypt');
    let calls = 0;
    const drifted = cloneOptionsWithKey(value, { keyHex: '00000000000000000000000000000000' });
    const mismatch = await withEncryptionKeyPreflight(
      drifted,
      () => {
        calls++;
        return 'unreachable';
      },
      keyRecordLoader,
    );
    expect(mismatch).toMatchObject({
      state: 'BLOCKED',
      status: 'ERROR',
      reasonCode: 'ENCRYPTION_KEY_PROVENANCE_MISMATCH',
    });
    expect(calls).toBe(0);

    const missing = await preflightEncryptionKey(value.options, async () => ({
      state: 'MISSING',
      detail: 'deliberately absent',
    }));
    expect(missing).toMatchObject({
      state: 'BLOCKED',
      status: 'NA_ASSET',
      reasonCode: 'ENCRYPTION_KEY_RECORD_MISSING',
    });

    const invalid = await preflightEncryptionKey(value.options, async () => ({
      state: 'OK',
      value: { assetId: 'hls_aes128.m3u8', scheme: 'hls-aes128', keyHex: 'ABC' },
    }));
    expect(invalid).toMatchObject({
      state: 'BLOCKED',
      status: 'ERROR',
      reasonCode: 'ENCRYPTION_KEY_RECORD_INVALID',
    });
  });

  test('negative mutations must differ only in their declared field', async () => {
    const wrongKey = scenario('cenc_ctr_wrong_key_negative');
    const ready = await preflightEncryptionKey(wrongKey.options, keyRecordLoader);
    expect(ready).toMatchObject({ state: 'READY' });

    const accidentallyDrifted = cloneOptionsWithKey(wrongKey, {
      kid: 'ffeeddccbbaa00998877665544332211',
    });
    const blocked = await preflightEncryptionKey(accidentallyDrifted, keyRecordLoader);
    expect(blocked).toMatchObject({
      state: 'BLOCKED',
      status: 'ERROR',
      reasonCode: 'ENCRYPTION_KEY_NEGATIVE_MUTATION_INVALID',
    });

    for (const id of [
      'cenc_ctr_wrong_kid_negative',
      'cenc_ctr_missing_key_negative',
      'hls_aes128_wrong_iv_negative',
      'hls_aes128_requested_as_sample_aes_negative',
      'hls_sample_aes_requested_as_aes128_negative',
    ]) {
      expect(await preflightEncryptionKey(scenario(id).options, keyRecordLoader)).toMatchObject({ state: 'READY' });
    }
  });

  test('record parsing enforces scheme-specific key, KID, and IV widths', () => {
    const cenc = parseAuthoritativeKeyRecord({
      assetId: 'derived.mp4',
      scheme: 'cenc-cens',
      keyHex: '00'.repeat(16),
      kid: '11'.repeat(16),
      ivHex: '22'.repeat(8),
      ivMode: 'per-sample',
    });
    expect(cenc.ivHex).toBe('22'.repeat(8));
    expect(() => parseAuthoritativeKeyRecord({
      assetId: 'playlist.m3u8',
      scheme: 'hls-aes128',
      keyHex: '00'.repeat(16),
      ivHex: '22'.repeat(8),
      ivMode: 'explicit',
    })).toThrow('exactly 16');
    expect(() => parseAuthoritativeKeyRecord({
      assetId: 'derived.mp4',
      scheme: 'cenc-cbcs',
      keyHex: '00'.repeat(16),
      kid: '11'.repeat(16),
      ivHex: '22'.repeat(8),
      ivMode: 'constant',
    })).toThrow('constant-IV');
  });

  test('rotated HLS requires the exact authoritative URI-to-key set', async () => {
    const value = scenario('hls_aes128_key_rotation_decrypt');
    const ready = await preflightEncryptionKey(value.options, keyRecordLoader);
    expect(ready).toMatchObject({ state: 'READY' });
    if (ready.state !== 'READY' || !ready.record) throw new Error('rotation key record did not load');
    expect(ready.record.keySet).toEqual({
      'hls_aes128_rotation_a.key': '30415263748596a7b8c9daebfc0d1e2f',
      'hls_aes128_rotation_b.key': '9c112268473bca794e089601b8f8f5d8',
    });
    const index = parseHlsResourceIndex(jsonAt('fixtures/golden/hls_aes128_rotation.m3u8.resources.json'));
    expect(assessHlsKeyResourceParity(ready.record, hlsOf('hls_aes128_key_rotation_decrypt'), index))
      .toMatchObject({ state: 'PASS' });

    const recordWithoutSet = {
      ...(jsonAt('fixtures/golden/hls_aes128_rotation.m3u8.keys.json') as Record<string, unknown>),
    };
    delete recordWithoutSet.keySet;
    expect(await preflightEncryptionKey(value.options, async () => ({ state: 'OK', value: recordWithoutSet })))
      .toMatchObject({ state: 'BLOCKED', reasonCode: 'ENCRYPTION_KEY_RECORD_INVALID' });

    const wrongSecond = parseAuthoritativeKeyRecord({
      ...(jsonAt('fixtures/golden/hls_aes128_rotation.m3u8.keys.json') as Record<string, unknown>),
      keySet: {
        'hls_aes128_rotation_a.key': '30415263748596a7b8c9daebfc0d1e2f',
        'hls_aes128_rotation_b.key': '00'.repeat(16),
      },
    });
    expect(assessHlsKeyResourceParity(wrongSecond, hlsOf('hls_aes128_key_rotation_decrypt'), index))
      .toMatchObject({ state: 'ERROR', reasonCode: 'HLS_KEY_RESOURCE_PARITY_MISMATCH' });
  });
});

describe('REQ-FEAT-53 structural clear output and complete presentation', () => {
  const clear = bytesAt('fixtures/media/cenc_ctr_clear.mp4');
  const protectedCbcs = bytesAt('fixtures/media/cenc_cbcs.mp4');

  test('normal clear, active protection, dropped track, and inert pssh classify PASS/FAIL/FAIL/PASS', () => {
    expect(assessClearDecryptStructure(clear, ['video', 'audio']).verdict).toBe('PASS');
    expect(assessClearDecryptStructure(protectedCbcs, ['video', 'audio'])).toMatchObject({
      verdict: 'FAIL',
      reasonCode: 'DECRYPT_ACTIVE_PROTECTION_REMAINS',
    });
    expect(assessClearDecryptStructure(clear, ['video'])).toMatchObject({
      verdict: 'FAIL',
      reasonCode: 'DECRYPT_TRACK_CARDINALITY_MISMATCH',
    });
    // Inert PSSH retained is a PASS, distinguished from an exact clear output by its reasonCode.
    expect(assessClearDecryptStructure(appendBytes(clear, inertPsshBox()), ['video', 'audio'])).toMatchObject({
      verdict: 'PASS',
      reasonCode: 'DECRYPT_INERT_PSSH_RETAINED',
    });
    expect(assessClearDecryptStructure(appendBytes(clear, emptyCencSaizBox()), ['video', 'audio'])).toMatchObject({
      verdict: 'FAIL',
      reasonCode: 'DECRYPT_ACTIVE_PROTECTION_REMAINS',
    });
  });

  test('missing/extra/wrong frames fail while legal timestamp rounding passes', () => {
    const reference = [frame(0, 0), frame(1, 33_367), frame(2, 66_733)];
    const rounded = [frame(0, 500), frame(1, 33_000), frame(2, 67_000)];
    expect(compareCompleteDecryptPresentation(rounded, reference, { timestampToleranceUs: 1_000 }).verdict).toBe('PASS');
    expect(compareCompleteDecryptPresentation(rounded.slice(0, 2), reference)).toMatchObject({
      verdict: 'FAIL',
      reasonCode: 'DECRYPT_FRAME_CARDINALITY_MISMATCH',
    });
    expect(compareCompleteDecryptPresentation([...rounded, frame(3, 100_000)], reference)).toMatchObject({
      verdict: 'FAIL',
      reasonCode: 'DECRYPT_FRAME_CARDINALITY_MISMATCH',
    });
    expect(compareCompleteDecryptPresentation(
      [rounded[0]!, { ...rounded[1]!, sha256: 'f'.repeat(64) }, rounded[2]!],
      reference,
    )).toMatchObject({ verdict: 'FAIL', reasonCode: 'DECRYPT_FRAME_DIGEST_MISMATCH' });
  });

  test('safe partial output is accepted only with an explicit minimum prefix contract', () => {
    const reference = [frame(0, 0), frame(1, 10_000), frame(2, 20_000)];
    expect(compareCompleteDecryptPresentation(reference.slice(0, 2), reference).verdict).toBe('FAIL');
    expect(compareCompleteDecryptPresentation(reference.slice(0, 2), reference, {
      partialPrefix: { minimumFrames: 2 },
    })).toMatchObject({ verdict: 'PASS', reasonCode: 'DECRYPT_SAFE_PARTIAL_PREFIX_VALID' });
    expect(compareCompleteDecryptPresentation(reference.slice(0, 1), reference, {
      partialPrefix: { minimumFrames: 2 },
    }).verdict).toBe('FAIL');
  });
});

describe('REQ-FEAT-54 DERIVED rotation is positive-source-equivalence only', () => {
  const catalog = parseScenarioSourceCatalog(textAt('fixtures/media/scenarios/_sources.ndjson'));
  if (catalog.state !== 'VALID') throw new Error('scenario source catalog is invalid');
  const censRow = catalog.catalog.rows.find((row) => row.scenarioId === 'encryption/cenc_cens_decrypt');
  if (!censRow) throw new Error('CENS source row is missing');
  const positive = scenario('cenc_cens_decrypt');
  const candidates: DerivedCencCandidateContract[] = censRow.files.map((file) => ({
    sourceId: file.file,
    sourceSha256: file.sha256,
    scheme: file.keys!.scheme as 'cenc-cens',
    key: file.keys! as DecryptKey,
    cleartextBaseAsset: file.cleartextBase!.poolPath,
    cleartextBaseSha256: file.cleartextBase!.sha256,
  }));

  test('all three CENS candidates are source/base-bound and fully eligible with distinct 64-bit IVs', () => {
    expect(provenanceOf(positive).schema).toBe(ENCRYPTION_KEY_PROVENANCE_SCHEMA);
    expect(isPositiveSourceEquivalenceScenario(positive)).toBe(true);
    expect(candidates).toHaveLength(3);
    expect(new Set(candidates.map(({ key }) => key.ivHex)).size).toBe(3);
    for (const [index, candidate] of candidates.entries()) {
      expect(candidate.key.ivHex).toMatch(/^[0-9a-f]{16}$/);
      expect(assessDerivedEncryptionRotation(positive, candidate)).toMatchObject({ state: 'ELIGIBLE' });
      expect(assessCandidateEligibility(positive, censRow, censRow.files[index]!)).toMatchObject({
        eligible: true,
        evidencePlan: {
          requiredOracles: ['property-invariant'],
          sufficientOracleSets: [['property-invariant']],
        },
      });
    }
  });

  test('every negative/no-op row is immutable and ineligible', () => {
    const rows = encryptionScenarios.filter((entry) =>
      entry.id.includes('_negative') || entry.id.endsWith('unencrypted_left_untouched_noop'));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const before = JSON.stringify({ scheme: optionsOf(row).scheme, oracles: row.oracles, options: row.options });
      expect(isPositiveSourceEquivalenceScenario(row)).toBe(false);
      expect(assessDerivedEncryptionRotation(row, candidates[0]!)).toMatchObject({
        state: 'INELIGIBLE',
        reasonCode: 'DERIVED_ROTATION_SCENARIO_NOT_POSITIVE',
      });
      expect(JSON.stringify({ scheme: optionsOf(row).scheme, oracles: row.oracles, options: row.options })).toBe(before);
    }
  });

  test('candidate key and digest association fail closed', () => {
    expect(assessDerivedEncryptionRotation(positive, {
      ...candidates[0]!,
      key: { ...candidates[0]!.key, keyHex: 'bad' },
    })).toMatchObject({ state: 'INELIGIBLE', reasonCode: 'DERIVED_ROTATION_KEY_INVALID' });
    expect(assessDerivedEncryptionRotation(positive, {
      ...candidates[0]!,
      sourceSha256: '0'.repeat(63),
    })).toMatchObject({ state: 'INELIGIBLE', reasonCode: 'DERIVED_ROTATION_DIGEST_INVALID' });
    expect(assessDerivedEncryptionRotation(scenario('hls_aes128_decrypt'), candidates[0]!)).toMatchObject({
      state: 'INELIGIBLE',
      reasonCode: 'DERIVED_ROTATION_SCENARIO_NOT_POSITIVE',
    });
  });
});

describe('REQ-FEAT-55 typed negative rejection and partial coverage', () => {
  const negativeRows = encryptionScenarios.filter((entry) =>
    entry.oracles.includes('graceful-failure'));

  test('every encryption negative has typed contracts and no authored success marker', () => {
    expect(negativeRows.length).toBeGreaterThanOrEqual(10);
    for (const row of negativeRows) {
      expect(row.notes).not.toMatch(/signal\s*[:=]/i);
      expect(robustnessContractFromOptions(row.options)).toMatchObject({
        schema: 'media-test/robustness-contract@1',
        inputClass: 'negative',
      });
      expect(encryptionNegativeContractFromOptions(row.options)).toMatchObject({
        schema: 'media-test/encryption-negative@1',
      });
    }
  });

  test('typed rejection, unsafe return, harness error, and timeout remain distinct', () => {
    const contract = robustnessContractFromOptions(negativeRows[0]!.options)!;
    const rejected = new MalformedInputError({
      reasonCode: 'CENC_PROTECTION_INVALID',
      operation: 'decrypt',
      engineId: 'fake@1',
      stage: 'decrypt',
      reason: 'invalid senc offset',
    });
    expect(isMalformedInputError(rejected)).toBe(true);
    expect(isMalformedInputError(structuredClone(rejected.toJSON()))).toBe(true);
    expect(isMalformedInputError(new Error('initialization exploded'))).toBe(false);
    expect(decideRobustnessDisposition(contract, {
      schema: 'media-test/robustness-operation@1',
      disposition: 'clean-reject',
      stage: 'operation',
    })).toMatchObject({ status: 'PASS' });
    expect(decideRobustnessDisposition(contract, {
      schema: 'media-test/robustness-operation@1',
      disposition: 'harness-error',
      stage: 'operation',
    })).toMatchObject({ status: 'ERROR' });
    expect(decideRobustnessDisposition(contract, {
      schema: 'media-test/robustness-operation@1',
      disposition: 'timeout',
      stage: 'operation',
    })).toMatchObject({ status: 'FAIL' });
    expect(validateRobustnessReturnedValue(contract, {
      output: { bytes: new Uint8Array([1, 2, 3]), container: 'mp4' },
    }).state).toBe('FAIL');
  });

  test('PASS/FAIL/ERROR preserves each count and reports partial coverage in every ordering', () => {
    for (const ordering of permutations<ResultStatus>(['PASS', 'FAIL', 'ERROR'])) {
      const reduced = reduceExhaustiveStatuses(ordering);
      expect(reduced.status).toBe('FAIL');
      expect(reduced.coverage.grade).toBe('partial');
      expect(reduced.coverage.valid).toBe(1);
      expect(reduced.coverage.counts).toMatchObject({ pass: 1, fail: 1, error: 1, total: 3 });
    }
    expect(reduceExhaustiveStatuses(['PASS', 'ERROR', 'ERROR'])).toMatchObject({
      status: 'ERROR',
      coverage: { grade: 'partial', valid: 1, counts: { pass: 1, error: 2, total: 3 } },
    });
  });

  test('only the declared truncated fixture permits a checked partial prefix', () => {
    const allowed = negativeRows.filter((row) =>
      encryptionNegativeContractFromOptions(row.options)?.partialOutput.allowed === true);
    expect(allowed.map((row) => row.id)).toEqual(['encryption/cenc_ctr_truncated_mdat_graceful']);
    const partial = encryptionNegativeContractFromOptions(allowed[0]!.options)!.partialOutput;
    expect(partial).toMatchObject({ allowed: true, minimumDecodedFrames: 1, requireTimelinePrefix: true });
  });
});

describe('REQ-FEAT-56 CENS/CBCS scheme, pattern, IV, and boundary coverage', () => {
  const cens = patternOf('cenc_cens_decrypt');
  const cbcs = patternOf('cenc_cbcs_decrypt');

  test('real CENS and CBCS artifacts expose the declared 1:9 pattern ground truth', () => {
    const censBytes = bytesAt('fixtures/media/scenarios/encryption/cenc_cens_decrypt/01.mp4');
    const cbcsBytes = bytesAt('fixtures/media/cenc_cbcs.mp4');
    expect(assessPatternGroundTruth(censBytes, cens)).toMatchObject({ verdict: 'PASS' });
    expect(assessPatternGroundTruth(cbcsBytes, cbcs)).toMatchObject({ verdict: 'PASS' });
    const evidence = inspectIsoBmffEncryption(cbcsBytes);
    expect(evidence.state).toBe('OK');
    if (evidence.state === 'OK') {
      expect(evidence.tracks.find((track) => track.type === 'video')).toMatchObject({
        scheme: 'cbcs',
        cryptByteBlock: 1,
        skipByteBlock: 9,
        ivSize: 16,
      });
    }
    expect(scenario('cenc_cbcs_decrypt')).toMatchObject({
      revision: 2,
      options: { clearReferenceTimeline: 'protected-source' },
    });
  });

  test('wrong algorithm, whole-sample, off-by-one pattern/IV, and subsample offsets localize FAIL', () => {
    const exact = {
      scheme: cbcs.scheme,
      cryptByteBlock: cbcs.cryptByteBlock,
      skipByteBlock: cbcs.skipByteBlock,
      ivSize: cbcs.ivSize,
      subsamples: cbcs.boundarySubsamples,
    } as const;
    expect(assessPatternBoundaryObservation(cbcs, exact).verdict).toBe('PASS');
    for (const mutation of [
      { ...exact, scheme: 'cenc-cens' as const },
      { ...exact, cryptByteBlock: 0 },
      { ...exact, cryptByteBlock: 2 },
      { ...exact, skipByteBlock: 8 },
      { ...exact, ivSize: 8 },
      { ...exact, subsamples: [{ clearBytes: 4, protectedBytes: 156 }] },
    ]) {
      expect(assessPatternBoundaryObservation(cbcs, mutation)).toMatchObject({
        verdict: 'FAIL',
        reasonCode: 'PATTERN_BOUNDARY_VECTOR_MISMATCH',
      });
    }
  });
});

describe('REQ-FEAT-57 complete HLS method, IV, transition, and sidecar matrix', () => {
  const playlists: Record<string, string> = {
    hls_aes128_decrypt: textAt('fixtures/media/hls_aes128.m3u8'),
    hls_sample_aes_decrypt: textAt(
      'fixtures/media/scenarios/encryption/hls_sample_aes_decrypt/hls_sample_aes.m3u8',
    ),
    hls_aes128_sequence_zero_iv_decrypt: textAt('fixtures/media/hls_aes128_seq0.m3u8'),
    hls_aes128_sequence_nonzero_iv_decrypt: textAt('fixtures/media/hls_aes128_seq42.m3u8'),
    hls_aes128_key_rotation_decrypt: textAt('fixtures/media/hls_aes128_rotation.m3u8'),
    hls_aes128_method_none_transition_decrypt: textAt('fixtures/media/hls_aes128_method_none.m3u8'),
  };

  test('all six positive method/IV branches match their exact timeline contracts', () => {
    expect(hlsMediaSequenceIv(0)).toBe('0'.repeat(32));
    expect(hlsMediaSequenceIv(42)).toBe('0000000000000000000000000000002a');
    for (const [id, playlist] of Object.entries(playlists)) {
      expect(validateHlsEncryptionContract(playlist, hlsOf(id))).toMatchObject({
        state: 'VERDICT',
        verdict: 'PASS',
      });
      expect(hlsResourceIndexFromOptions(scenario(id).options)).toMatch(
        /^\/fixtures\/golden\/.+\.resources\.json$/,
      );
    }
  });

  test('AES-128 and SAMPLE-AES cannot pass through each other', () => {
    expect(assessHlsRequestedMethod(playlists.hls_aes128_decrypt!, 'hls-sample-aes')).toMatchObject({
      verdict: 'FAIL',
      reasonCode: 'HLS_METHOD_MISMATCH',
    });
    expect(assessHlsRequestedMethod(playlists.hls_sample_aes_decrypt!, 'hls-aes128')).toMatchObject({
      verdict: 'FAIL',
      reasonCode: 'HLS_METHOD_MISMATCH',
    });
    expect(scenario('hls_aes128_requested_as_sample_aes_negative')).toBeDefined();
    expect(scenario('hls_sample_aes_requested_as_aes128_negative')).toBeDefined();
  });

  test('wrong sequence IV and transition method produce localized FAIL', () => {
    const wrongExplicit = playlists.hls_aes128_sequence_nonzero_iv_decrypt!
      .replace('URI="hls_aes128_seq42.key"', 'URI="hls_aes128_seq42.key",IV=0x00000000000000000000000000000000');
    expect(validateHlsEncryptionContract(wrongExplicit, hlsOf('hls_aes128_sequence_nonzero_iv_decrypt')))
      .toMatchObject({ verdict: 'FAIL', reasonCode: 'HLS_KEY_TRANSITION_MISMATCH' });
    const wrongNone = playlists.hls_aes128_method_none_transition_decrypt!
      .replace('#EXT-X-KEY:METHOD=NONE', '#EXT-X-KEY:METHOD=AES-128,URI="hls_aes128_method_none.key"');
    expect(validateHlsEncryptionContract(wrongNone, hlsOf('hls_aes128_method_none_transition_decrypt')))
      .toMatchObject({ verdict: 'FAIL', reasonCode: 'HLS_KEY_TRANSITION_MISMATCH' });
  });

  test('resource index source-binds every key/map/segment before URL execution', async () => {
    const playlistBytes = bytesAt('fixtures/media/hls_aes128.m3u8');
    const references = inspectHlsResourceReferences(new TextDecoder().decode(playlistBytes));
    const resources: HlsResourceIdentity[] = references.map((reference) => {
      const bytes = bytesAt(`fixtures/media/${reference.uri}`);
      return { ...reference, sha256: sha256Hex(bytes), sizeBytes: bytes.byteLength };
    });
    const index: HlsResourceIndex = {
      schema: HLS_RESOURCE_INDEX_SCHEMA,
      playlist: {
        assetId: 'hls_aes128.m3u8',
        sha256: sha256Hex(playlistBytes),
        sizeBytes: playlistBytes.byteLength,
      },
      resources,
    };
    expect(parseHlsResourceIndex(index)).toEqual(index);
    const root = {
      assetId: 'hls_aes128.m3u8',
      logicalPath: 'fixtures/media/scenarios/encryption/hls_aes128_decrypt/hls_aes128.m3u8',
      sha256: sha256Hex(playlistBytes),
      sizeBytes: playlistBytes.byteLength,
    };
    const ready = await preflightHlsResourceIndex(
      scenario('hls_aes128_decrypt').options,
      root,
      playlistBytes,
      async () => ({ state: 'OK', value: index }),
    );
    expect(ready).toMatchObject({ state: 'READY' });
    if (ready.state === 'READY') {
      expect(ready.resources).toHaveLength(6);
      expect(ready.resources[0]).toMatchObject({
        role: 'key',
        uri: 'hls_aes128.key',
        sizeBytes: 16,
        logicalPath: 'fixtures/media/scenarios/encryption/hls_aes128_decrypt/hls_aes128.key',
      });
      expect(ready.resources.slice(1).every((entry) => entry.role === 'segment')).toBe(true);
    }

    const missing = await preflightHlsResourceIndex(
      scenario('hls_aes128_decrypt').options,
      root,
      playlistBytes,
      async () => ({ state: 'MISSING', detail: 'not baked' }),
    );
    expect(missing).toMatchObject({ state: 'BLOCKED', status: 'NA_ASSET' });

    const incomplete = { ...index, resources: index.resources.slice(0, -1) };
    const invalidClosure = await preflightHlsResourceIndex(
      scenario('hls_aes128_decrypt').options,
      root,
      playlistBytes,
      async () => ({ state: 'OK', value: incomplete }),
    );
    expect(invalidClosure).toMatchObject({
      state: 'BLOCKED',
      status: 'ERROR',
      reasonCode: 'HLS_RESOURCE_CLOSURE_MISMATCH',
    });
  });

  test('every committed matrix resource index exactly closes its playlist', async () => {
    const cases = [
      ['hls_aes128_decrypt', 'hls_aes128.m3u8'],
      ['hls_sample_aes_decrypt', 'hls_sample_aes.m3u8'],
      ['hls_aes128_sequence_zero_iv_decrypt', 'hls_aes128_seq0.m3u8'],
      ['hls_aes128_sequence_nonzero_iv_decrypt', 'hls_aes128_seq42.m3u8'],
      ['hls_aes128_key_rotation_decrypt', 'hls_aes128_rotation.m3u8'],
      ['hls_aes128_method_none_transition_decrypt', 'hls_aes128_method_none.m3u8'],
    ] as const;
    for (const [scenarioId, assetId] of cases) {
      const mediaPath = assetId === 'hls_sample_aes.m3u8'
        ? `fixtures/media/scenarios/encryption/hls_sample_aes_decrypt/${assetId}`
        : `fixtures/media/${assetId}`;
      const playlistBytes = bytesAt(mediaPath);
      const index = parseHlsResourceIndex(jsonAt(`fixtures/golden/${assetId}.resources.json`));
      const keyRecord = parseAuthoritativeKeyRecord(jsonAt(`fixtures/golden/${assetId}.keys.json`));
      const result = await preflightHlsResourceIndex(
        scenario(scenarioId).options,
        {
          assetId,
          logicalPath: mediaPath,
          sha256: sha256Hex(playlistBytes),
          sizeBytes: playlistBytes.byteLength,
        },
        playlistBytes,
        async () => ({ state: 'OK', value: index }),
        keyRecord,
      );
      expect(result).toMatchObject({ state: 'READY' });
    }
  });

  test('resource discovery includes map and rotated keys once, in first-reference order', () => {
    const playlist = [
      '#EXTM3U',
      '#EXT-X-KEY:METHOD=AES-128,URI="first.key"',
      '#EXT-X-MAP:URI="init.mp4"',
      '#EXTINF:1,',
      'one.m4s',
      '#EXT-X-KEY:METHOD=AES-128,URI="second.key"',
      '#EXTINF:1,',
      'two.m4s',
      '#EXT-X-KEY:METHOD=NONE',
      '#EXTINF:1,',
      'clear.m4s',
    ].join('\n');
    expect(inspectHlsResourceReferences(playlist)).toEqual([
      { role: 'key', uri: 'first.key' },
      { role: 'map', uri: 'init.mp4' },
      { role: 'segment', uri: 'one.m4s' },
      { role: 'key', uri: 'second.key' },
      { role: 'segment', uri: 'two.m4s' },
      { role: 'segment', uri: 'clear.m4s' },
    ]);
    expect(() => inspectHlsResourceReferences(playlist.replace('one.m4s', '../one.m4s'))).toThrow('unsafe');
  });

  test('verified playlist rebinding seals every exact URI while preserving syntax', () => {
    const source = [
      '#EXTM3U',
      '#EXT-X-KEY:METHOD=AES-128, URI = "first.key",IV=0x00000000000000000000000000000000',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="100@0"',
      '#EXTINF:1.000,kept comment',
      'one.m4s',
      '#EXTINF:1.000,',
      'one.m4s',
      '#EXT-X-KEY:METHOD=NONE',
      '#EXTINF:1.000,',
      'clear.m4s',
      '',
    ].join('\r\n');
    const input = textEncoder.encode(source);
    const before = input.slice();
    const bindings = [
      { role: 'segment' as const, uri: 'clear.m4s', url: 'blob:https://fixture.test/clear' },
      { role: 'map' as const, uri: 'init.mp4', url: 'blob:https://fixture.test/init' },
      { role: 'key' as const, uri: 'first.key', url: 'blob:https://fixture.test/key' },
      { role: 'segment' as const, uri: 'one.m4s', url: 'blob:https://fixture.test/one' },
    ];
    const output = new TextDecoder().decode(rebindHlsPlaylistResources(input, bindings));
    expect(input).toEqual(before);
    expect(output).toContain(
      '#EXT-X-KEY:METHOD=AES-128, URI = "blob:https://fixture.test/key",IV=0x00000000000000000000000000000000',
    );
    expect(output).toContain('#EXT-X-MAP:URI="blob:https://fixture.test/init",BYTERANGE="100@0"');
    expect(output.match(/blob:https:\/\/fixture\.test\/one/g)).toHaveLength(2);
    expect(output).toContain('#EXT-X-KEY:METHOD=NONE\r\n');
    expect(output.split('\r\n')).toHaveLength(source.split('\r\n').length);
    expect(output.replace(/blob:https:\/\/fixture\.test\/(?:key|init|one|clear)/g, '<URL>'))
      .toContain('#EXTINF:1.000,kept comment');
  });

  test('playlist rebinding rejects missing, extra, duplicate, wrong-role, and relative mappings', () => {
    const input = textEncoder.encode([
      '#EXTM3U',
      '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"',
      '#EXTINF:1,',
      'segment.ts',
    ].join('\n'));
    const exact = [
      { role: 'key' as const, uri: 'key.bin', url: 'blob:https://fixture.test/key' },
      { role: 'segment' as const, uri: 'segment.ts', url: 'blob:https://fixture.test/segment' },
    ];
    expect(() => rebindHlsPlaylistResources(input, exact.slice(0, 1))).toThrow('cardinality');
    expect(() => rebindHlsPlaylistResources(input, [
      ...exact,
      { role: 'segment', uri: 'extra.ts', url: 'blob:https://fixture.test/extra' },
    ])).toThrow('cardinality');
    expect(() => rebindHlsPlaylistResources(input, [exact[0]!, exact[0]!])).toThrow('duplicate');
    expect(() => rebindHlsPlaylistResources(input, [
      exact[0]!,
      { ...exact[1]!, role: 'map' as const },
    ])).toThrow('missing');
    expect(() => rebindHlsPlaylistResources(input, [
      exact[0]!,
      { ...exact[1]!, url: '../mutable/segment.ts' },
    ])).toThrow('absolute URL');
  });
});

describe('REQ-FEAT-58 Clear Key is a precise EME-vs-raw negative', () => {
  test('the finding names org.w3.clearkey and forbids raw decrypt without claiming scheme support', () => {
    const value = scenario('clearkey_eme_not_raw_decrypt_negative');
    const provenance = provenanceOf(value);
    const negative = encryptionNegativeContractFromOptions(value.options);
    expect(provenance).toMatchObject({
      use: 'eme-negative',
      keySystem: 'org.w3.clearkey',
      rawDecryptForbidden: true,
      rotationPolicy: 'fixed-scenario-semantics',
    });
    expect(negative).toMatchObject({ expected: 'raw-clearkey-rejection' });
    expect(value.id).not.toMatch(/_na$/);
    expect(value.requires.encryption).toBeUndefined();
    expect(isPositiveSourceEquivalenceScenario(value)).toBe(false);
  });
});

describe('REQ-FEAT-59 literal byte identity for clear-input decrypt no-op', () => {
  test('identity passes; metadata rewrap, frame loss, and wrong playable bytes fail', () => {
    const input = textEncoder.encode('ftyp....moov....mdat:frame0:frame1');
    expect(compareDecryptNoopBytes(input, input.slice())).toMatchObject({
      verdict: 'PASS',
      reasonCode: 'DECRYPT_BYTE_IDENTITY_PASS',
    });
    const metadataRewrap = appendBytes(input, inertPsshBox());
    const frameLoss = input.slice(0, input.byteLength - ':frame1'.length);
    const wrongPlayable = input.slice();
    wrongPlayable[wrongPlayable.byteLength - 1] ^= 0xff;
    for (const output of [metadataRewrap, frameLoss, wrongPlayable]) {
      expect(compareDecryptNoopBytes(input, output)).toMatchObject({
        verdict: 'FAIL',
        reasonCode: 'DECRYPT_BYTE_IDENTITY_FAIL',
      });
    }
  });

  test('the no-op scenario is fixed-semantics and selects the byte comparator invariant', () => {
    const value = scenario('unencrypted_left_untouched_noop');
    expect(optionsOf(value).invariant).toBe(DECRYPT_BYTE_IDENTITY_NOOP);
    expect(provenanceOf(value)).toMatchObject({
      use: 'clear-input-sentinel',
      rotationPolicy: 'fixed-scenario-semantics',
    });
    expect(isPositiveSourceEquivalenceScenario(value)).toBe(false);
  });
});

describe('REQ-FEAT-60 exact selected duration for decrypt throughput', () => {
  const sourceRows = textAt('fixtures/media/scenarios/_sources.ndjson')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const perfRow = sourceRows.find((row) =>
    row.scenarioId === 'encryption/perf_cenc_ctr_decrypt_throughput') as {
      files: Array<{ file: string; cleartextBase: { durationSec: number } }>;
    };

  test('baked and all three DERIVED candidates retain their exact positive numerator', () => {
    const bakedDuration = (jsonAt('fixtures/golden/cenc_ctr.mp4.meta.json') as { durationSec: number }).durationSec;
    const baked = resolveDecryptDuration({
      selectedIsBaked: true,
      bakedGoldenDurationSec: bakedDuration,
    });
    expect(baked).toMatchObject({ state: 'READY', durationSec: bakedDuration, source: 'baked-golden' });
    expect(perfRow.files).toHaveLength(3);
    for (const file of perfRow.files) {
      const selected = resolveDecryptDuration({
        selectedIsBaked: false,
        selectedCatalogDurationSec: file.cleartextBase.durationSec,
        bakedGoldenDurationSec: bakedDuration,
      });
      expect(selected).toMatchObject({
        state: 'READY',
        durationSec: file.cleartextBase.durationSec,
        source: 'selected-catalog',
      });
      if (selected.state === 'READY') {
        const factor = decryptRealtimeFactor(selected.durationSec, 500);
        expect(factor.state).toBe('READY');
        if (factor.state === 'READY') expect(Number.isFinite(factor.realtime) && factor.realtime > 0).toBe(true);
      }
    }
    expect(resolveDecryptDuration({
      selectedIsBaked: false,
      bakedGoldenDurationSec: bakedDuration,
    })).toMatchObject({ state: 'UNAVAILABLE', status: 'NA_ASSET' });
    expect(resolveDecryptDuration({
      selectedIsBaked: false,
      selectedCatalogDurationSec: 0,
      neutralProbeDurationSec: 5,
    })).toMatchObject({ state: 'UNAVAILABLE', status: 'ERROR', reasonCode: 'DECRYPT_DURATION_INVALID' });
    expect(decryptRealtimeFactor(Number.MAX_VALUE, Number.MIN_VALUE)).toMatchObject({ state: 'ERROR' });
  });

  test('ranking requires every requested finite positive measured iteration', () => {
    const summary: BenchSummary = {
      n: 3,
      warmup: 1,
      metric: 'throughputRealtime',
      median: 10,
      p95: 12,
      mad: 1,
      unit: 'x',
      samples: [9, 10, 12],
    };
    expect(validateDecryptThroughputSummary(summary, 3)).toMatchObject({ state: 'READY', realtime: 10 });
    expect(validateDecryptThroughputSummary({ ...summary, n: 0, samples: [] }, 3)).toMatchObject({
      state: 'ERROR',
      reasonCode: 'DECRYPT_THROUGHPUT_SAMPLE_COUNT_INVALID',
    });
    expect(validateDecryptThroughputSummary({ ...summary, samples: [9, Number.NaN, 12] }, 3)).toMatchObject({
      state: 'ERROR',
      reasonCode: 'DECRYPT_THROUGHPUT_SAMPLE_COUNT_INVALID',
    });
    expect(validateDecryptThroughputSummary({ ...summary, p95: Number.POSITIVE_INFINITY }, 3)).toMatchObject({
      state: 'ERROR',
      reasonCode: 'DECRYPT_THROUGHPUT_SAMPLE_COUNT_INVALID',
    });
    expect(optionsOf(scenario('perf_cenc_ctr_decrypt_throughput')).invariant)
      .toBe('decrypt-throughput-selected-duration');
  });
});
