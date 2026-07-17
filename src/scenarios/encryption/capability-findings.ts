/**
 * Typed encryption negative rows. They deliberately bypass the flat scheme token so a decrypt-
 * capable adapter must either reject examined bytes with MalformedInputError or report a concrete
 * runtime tuple miss with NotApplicableError. Authored prose is never verdict evidence.
 */

import type { DecryptKey, EncryptionScheme } from '../../core/engine.ts';
import type { OracleId, Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';
import { defineRobustnessContract } from '../robustness/contracts.ts';
import {
  defineEncryptionKeyProvenance,
  defineEncryptionNegativeContract,
  defineHlsEncryptionContract,
  defineScenarioDecryptKey,
  type EncryptionKeyUse,
  type EncryptionNegativeContract,
  type HlsEncryptionContract,
  type ScenarioDecryptKey,
} from '../../features/encryption/contracts.ts';
import { decryptKeyFor, type GOLDEN_KEYS } from './_shared.ts';

const NEGATIVE_TIMEOUT_MS = 15_000;
const RETURNED_OUTPUT_ORACLES = ['decrypt-bitexact', 'reference-reimport'] as const;

interface EncryptionNegativeCase {
  id: string;
  scheme: EncryptionScheme;
  asset: string;
  container: string;
  key: ScenarioDecryptKey;
  cleartextAsset?: string;
  expected: EncryptionNegativeContract['expected'];
  videoCodecs?: string[];
  audioCodecs?: string[];
  notes: string;
}

function mutatedFixtureKey(
  name: keyof typeof GOLDEN_KEYS,
  use: Extract<EncryptionKeyUse, 'wrong-key' | 'wrong-kid' | 'wrong-iv' | 'missing-key' | 'method-mismatch'>,
  requestedScheme: EncryptionScheme,
  mutation: Partial<DecryptKey>,
  hls?: HlsEncryptionContract,
): ScenarioDecryptKey {
  const base = decryptKeyFor(name, { use, requestedScheme, ...(hls ? { hls } : {}) });
  return Object.freeze({ ...base, ...mutation });
}

const HLS_AES128_EXPLICIT = defineHlsEncryptionContract({
  case: 'aes128-explicit-iv',
  mediaSequence: 0,
  transitions: [{
    firstSequence: 0,
    method: 'AES-128',
    keyRef: 'hls_aes128.key',
    ivMode: 'explicit',
    explicitIvHex: 'c0643a1737869dcf50b7d5daa37b466b',
  }],
  cleartextAsset: 'hls_aes128_clear.mp4',
  resourceIndex: '/fixtures/golden/hls_aes128.m3u8.resources.json',
});

const HLS_METHOD_MISMATCH = defineHlsEncryptionContract({
  case: 'method-mismatch-negative',
  mediaSequence: 0,
  transitions: [{
    firstSequence: 0,
    method: 'AES-128',
    keyRef: 'hls_aes128.key',
    ivMode: 'explicit',
    explicitIvHex: 'c0643a1737869dcf50b7d5daa37b466b',
  }],
  cleartextAsset: 'hls_aes128_clear.mp4',
  resourceIndex: '/fixtures/golden/hls_aes128.m3u8.resources.json',
});

const HLS_SAMPLE_AES_METHOD_MISMATCH = defineHlsEncryptionContract({
  case: 'method-mismatch-negative',
  mediaSequence: 0,
  transitions: [{
    firstSequence: 0,
    method: 'SAMPLE-AES',
    keyRef: 'hls_sample_aes.key',
    ivMode: 'explicit',
    explicitIvHex: '101112131415161718191a1b1c1d1e1f',
  }],
  cleartextAsset: 'hls_aes128_clear.mp4',
  resourceIndex: '/fixtures/golden/hls_sample_aes.m3u8.resources.json',
});

const CAPABILITY_FINDINGS: EncryptionNegativeCase[] = [
  {
    id: 'clearkey_eme_not_raw_decrypt_negative',
    scheme: 'clearkey',
    asset: 'cenc_ctr.mp4',
    container: 'mp4',
    key: defineScenarioDecryptKey(
      { keyHex: '' },
      defineEncryptionKeyProvenance({
        assetId: 'cenc_ctr.mp4',
        scheme: 'clearkey',
        use: 'eme-negative',
        rotationPolicy: 'fixed-scenario-semantics',
        keySystem: 'org.w3.clearkey',
        rawDecryptForbidden: true,
      }),
    ),
    expected: 'raw-clearkey-rejection',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'NEGATIVE CAPABILITY: org.w3.clearkey is an EME key system, not the raw key-provided file ' +
      'decrypt primitive. A runtime tuple miss is NA_ENGINE; an adapter that examines this forbidden ' +
      'raw route must emit a typed rejection. Returned media is FAIL.',
  },
  {
    id: 'cenc_ctr_requested_as_cens_negative',
    scheme: 'cenc-cens',
    asset: 'cenc_ctr.mp4',
    container: 'mp4',
    key: mutatedFixtureKey('cenc_ctr', 'method-mismatch', 'cenc-cens', {}),
    cleartextAsset: 'cenc_ctr_clear.mp4',
    expected: 'method-mismatch-rejection',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'NEGATIVE METHOD SEPARATION: request CENS patterned CTR for a CENC full/subsample CTR fixture. ' +
      'Typed rejection or NA_ENGINE is honest; returning clear output through the wrong method is FAIL.',
  },
  {
    id: 'hls_aes128_requested_as_sample_aes_negative',
    scheme: 'hls-sample-aes',
    asset: 'hls_aes128.m3u8',
    container: 'hls',
    key: mutatedFixtureKey('hls_aes128', 'method-mismatch', 'hls-sample-aes', {}, HLS_METHOD_MISMATCH),
    cleartextAsset: 'hls_aes128_clear.mp4',
    expected: 'method-mismatch-rejection',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'NEGATIVE METHOD SEPARATION: feed an AES-128 whole-segment playlist to SAMPLE-AES. Typed ' +
      'rejection or NA_ENGINE is honest; conflating the methods and returning output is FAIL.',
  },
  {
    id: 'cenc_ctr_wrong_key_negative',
    scheme: 'cenc-ctr',
    asset: 'cenc_ctr.mp4',
    container: 'mp4',
    key: mutatedFixtureKey(
      'cenc_ctr',
      'wrong-key',
      'cenc-ctr',
      { keyHex: 'ffeeddccbbaa99887766554433221100' },
    ),
    cleartextAsset: 'cenc_ctr_clear.mp4',
    expected: 'wrong-key-rejection',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'NEGATIVE KEY ASSOCIATION: valid-width but wrong CENC key. Typed decrypt rejection passes; ' +
      'returned output must independently match the full clear presentation or it fails.',
  },
  {
    id: 'hls_sample_aes_requested_as_aes128_negative',
    scheme: 'hls-aes128',
    asset: 'hls_sample_aes.m3u8',
    container: 'hls',
    key: mutatedFixtureKey(
      'hls_sample_aes',
      'method-mismatch',
      'hls-aes128',
      {},
      HLS_SAMPLE_AES_METHOD_MISMATCH,
    ),
    cleartextAsset: 'hls_aes128_clear.mp4',
    expected: 'method-mismatch-rejection',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'NEGATIVE METHOD SEPARATION: feed a format-specific SAMPLE-AES playlist to the whole-segment ' +
      'AES-128 path. Typed rejection or NA_ENGINE is honest; returned output through the wrong ' +
      'method must satisfy the complete clear reference or FAIL.',
  },
  {
    id: 'cenc_ctr_wrong_kid_negative',
    scheme: 'cenc-ctr',
    asset: 'cenc_ctr.mp4',
    container: 'mp4',
    key: mutatedFixtureKey(
      'cenc_ctr',
      'wrong-kid',
      'cenc-ctr',
      { kid: 'ffeeddccbbaa00998877665544332211' },
    ),
    cleartextAsset: 'cenc_ctr_clear.mp4',
    expected: 'wrong-kid-rejection',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'NEGATIVE KEY ASSOCIATION: correct AES key with a valid-width wrong KID. Adapters must not ' +
      'silently ignore the KID; typed rejection passes and wrong returned media fails.',
  },
  {
    id: 'cenc_ctr_missing_key_negative',
    scheme: 'cenc-ctr',
    asset: 'cenc_ctr.mp4',
    container: 'mp4',
    key: mutatedFixtureKey('cenc_ctr', 'missing-key', 'cenc-ctr', { keyHex: '' }),
    cleartextAsset: 'cenc_ctr_clear.mp4',
    expected: 'missing-key-rejection',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'NEGATIVE KEY ASSOCIATION: CENC input with an explicitly absent raw key. This is malformed ' +
      'request/input evidence, not framework applicability and not an authored prose pass.',
  },
  {
    id: 'hls_aes128_wrong_iv_negative',
    scheme: 'hls-aes128',
    asset: 'hls_aes128.m3u8',
    container: 'hls',
    key: mutatedFixtureKey(
      'hls_aes128',
      'wrong-iv',
      'hls-aes128',
      { ivHex: '3f9bc5e8c8796230af482a255c84b994' },
      HLS_AES128_EXPLICIT,
    ),
    cleartextAsset: 'hls_aes128_clear.mp4',
    expected: 'wrong-iv-rejection',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'NEGATIVE IV ASSOCIATION: correct HLS key with a valid-width wrong explicit IV. Typed crypto ' +
      'rejection passes; returned bytes must match the complete retained clear presentation or fail.',
  },
];

export const encryptionCapabilityFindingScenarios: Scenario[] = CAPABILITY_FINDINGS.map((entry) => {
  const oracles: OracleId[] = ['graceful-failure', 'decrypt-bitexact', 'reference-reimport'];
  const robustness = {
    ...defineRobustnessContract('negative', 'media-structure', oracles, NEGATIVE_TIMEOUT_MS),
    encryption: defineEncryptionNegativeContract({
      expected: entry.expected,
      returnedOutputOracles: [...RETURNED_OUTPUT_ORACLES],
      partialOutput: { allowed: false },
    }),
  };
  return defineScenario({
    id: `encryption/${entry.id}`,
    op: 'decrypt',
    input: entry.asset,
    options: {
      scheme: entry.scheme,
      key: entry.key,
      ...(entry.cleartextAsset ? { cleartextAsset: entry.cleartextAsset } : {}),
      robustness,
    },
    requires: {
      operations: ['decrypt'],
      containersIn: [entry.container],
      // Deliberately omit `encryption`: admitted decrypt adapters must demonstrate typed runtime
      // rejection. A known unsupported tuple remains NA_ENGINE through NotApplicableError.
      ...(entry.videoCodecs ? { videoCodecs: entry.videoCodecs } : {}),
      ...(entry.audioCodecs ? { audioCodecs: entry.audioCodecs } : {}),
    },
    oracles,
    metrics: ['wall'],
    timeoutMs: NEGATIVE_TIMEOUT_MS,
    notes: entry.notes,
  });
});

export default encryptionCapabilityFindingScenarios;
