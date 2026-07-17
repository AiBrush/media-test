/**
 * src/scenarios/encryption/index.ts — Pillar 1, family "encryption" (entry point).
 *
 * Decrypt protected media and prove the result is byte/frame-exact against an OFFLINE reference
 * decrypt. The family is split into sub-batteries (mirroring the remux family layout); this file owns
 * the POSITIVE decrypt cases and concatenates every sub-battery into the single exported
 * `encryptionScenarios` array (kept SYNCHRONOUS — src/scenarios/index.ts builds the full battery
 * eagerly and the runner reads scenario.options synchronously).
 *
 * SUB-BATTERIES:
 *   - this file                : positive decrypt (cenc-ctr · cenc-cens · cenc-cbcs · hls-aes128 ·
 *                                hls-sample-aes), frame-exact + structural re-import + playback smoke.
 *   - ./metamorphic.ts         : decrypt(x)==offline-cleartext (property-invariant) + no-op idempotence.
 *   - ./robustness.ts          : malformed-protection fuzz → graceful-failure (§A.16).
 *   - ./performance.ts         : headline TIMED decrypt-throughput (primaryMetric, §A.14/§8.2).
 *   - ./capability-findings.ts : Appendix-B NA rows for live EME/key acquisition (ClearKey) —
 *                                registered + attributed, never silently omitted.
 *
 * Key parity, structural clear-output evidence, complete frame cardinality, method/pattern
 * contracts, and byte-no-op equality are executable gates. Fixture availability and engine/browser
 * applicability come from typed preflight evidence rather than comments in this module.
 */

import type { Scenario } from '../../core/scenario.ts';
import { buildDecryptAll, type DecryptCase } from './_shared.ts';
import { encryptionMetamorphicScenarios } from './metamorphic.ts';
import { encryptionRobustnessScenarios } from './robustness.ts';
import { encryptionPerformanceScenarios } from './performance.ts';
import { encryptionCapabilityFindingScenarios } from './capability-findings.ts';
import {
  defineHlsEncryptionContract,
  definePatternContract,
} from '../../features/encryption/contracts.ts';

const CENS_PATTERN = definePatternContract({
  scheme: 'cenc-cens',
  cipherMode: 'AES-CTR',
  cryptByteBlock: 1,
  skipByteBlock: 9,
  ivRule: 'per-sample',
  ivSize: 16,
  boundaryVectorId: 'cens-avc-nal-crypt1-skip9-v1',
  boundarySubsamples: [{ clearBytes: 902, protectedBytes: 57_168 }],
  fixtureBoundaryVectors: [
    { sampleCount: 150, firstBoundarySubsamples: [{ clearBytes: 902, protectedBytes: 57_168 }] },
    { sampleCount: 329, firstBoundarySubsamples: [{ clearBytes: 875, protectedBytes: 259_376 }] },
    { sampleCount: 161, firstBoundarySubsamples: [{ clearBytes: 906, protectedBytes: 47_344 }] },
  ],
});

const CBCS_PATTERN = definePatternContract({
  scheme: 'cenc-cbcs',
  cipherMode: 'AES-CBC',
  cryptByteBlock: 1,
  skipByteBlock: 9,
  ivRule: 'constant',
  ivSize: 16,
  boundaryVectorId: 'cbcs-avc-nal-crypt1-skip9-v1',
  boundarySubsamples: [{ clearBytes: 816, protectedBytes: 57_254 }],
  fixtureBoundaryVectors: [
    { sampleCount: 150, firstBoundarySubsamples: [{ clearBytes: 816, protectedBytes: 57_254 }] },
    { sampleCount: 329, firstBoundarySubsamples: [{ clearBytes: 786, protectedBytes: 259_465 }] },
    { sampleCount: 161, firstBoundarySubsamples: [{ clearBytes: 816, protectedBytes: 47_434 }] },
    // The baked non-fragmented Bento4 fixture uses an implicit constant-IV whole-sample map.
    { sampleCount: 150, firstBoundarySubsamples: [{ clearBytes: 0, protectedBytes: 24_654 }] },
  ],
});

// ── Positive decrypt cases (frame-exact + structural re-import + playback smoke) ─────────────────

const DECRYPT_CASES: DecryptCase[] = [
  {
    id: 'cenc_ctr_decrypt',
    asset: 'cenc_ctr.mp4',
    container: 'mp4',
    scheme: 'cenc-ctr',
    keyName: 'cenc_ctr',
    cleartextAsset: 'cenc_ctr_clear.mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    features: ['webcrypto:cenc-ctr-clear-output'],
    notes:
      'CENC AES-CTR full-sample encryption. Decrypted frames bit-exact vs the offline-decrypt golden; ' +
      'reference-reimport proves the output is a re-parseable de-protected container; playback-smoke ' +
      'proves it plays. Requires feature webcrypto:cenc-ctr-clear-output because recognizing CENC ' +
      'track metadata is not enough: the engine must clear samples as bytes before correctness ' +
      'or throughput is admissible. Key/KID from fixtures/golden/cenc_ctr.mp4.keys.json (the offline ' +
      'ground truth); frame goldens come from the independent plaintext fixture cenc_ctr_clear.mp4.',
  },
  {
    id: 'cenc_cens_decrypt',
    asset: 'cenc_cens.mp4',
    container: 'mp4',
    scheme: 'cenc-cens',
    keyName: 'cenc_cens',
    cleartextAsset: 'cenc_ctr_clear.mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    pattern: CENS_PATTERN,
    notes:
      'CENC cens patterned AES-CTR encryption (crypt:skip 1:9) over the H.264 video samples. ' +
      'Decrypt output must decode bit-exact to the independent clear MP4 twin cenc_ctr_clear.mp4; ' +
      'reference-reimport and playback-smoke prove the result is a normal de-protected MP4, not just ' +
      'clear frames inside a protected wrapper. Key/KID from fixtures/golden/cenc_cens.mp4.keys.json.',
  },
  {
    id: 'cenc_cbcs_decrypt',
    asset: 'cenc_cbcs.mp4',
    container: 'mp4',
    scheme: 'cenc-cbcs',
    keyName: 'cenc_cbcs',
    cleartextAsset: 'cenc_ctr_clear.mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    pattern: CBCS_PATTERN,
    notes:
      'CENC cbcs pattern (subsample AES-CBC, crypt:skip pattern, per-subsample IV). Exercises the ' +
      'pattern-block boundary. The committed Bento4 artifact, key record, packet table, and frame ' +
      'evidence are authoritative; pattern contract cbcs-avc-nal-crypt1-skip9-v1 localizes wrong ' +
      'scheme, IV, crypt:skip, or subsample handling.',
  },
  {
    id: 'hls_aes128_decrypt',
    asset: 'hls_aes128.m3u8',
    container: 'hls',
    scheme: 'hls-aes128',
    keyName: 'hls_aes128',
    cleartextAsset: 'hls_aes128_clear.mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    hls: defineHlsEncryptionContract({
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
    }),
    // HLS is segmented; reference-reimport of a playlist-as-one-blob is not well-defined for every
    // reference engine, so gate frame-exactness + playback only (avoid an unsound structural gate).
    oracles: ['decrypt-bitexact', 'playback-smoke'],
    notes:
      'HLS AES-128 full-segment CBC decrypt. Key + explicit IV from fixtures/golden/hls_aes128.m3u8.' +
      'keys.json (the playlist #EXT-X-KEY carried an explicit IV, so the EXPLICIT-IV path is exercised; ' +
      'the media-sequence-derived-IV branches are separate matrix rows below). decrypt-bitexact vs ' +
      'the offline MP4 cleartext reference hls_aes128_clear.mp4 + ' +
      'playback-smoke. Routes NA(engine) for any ' +
      'engine that does not support the concrete hls-aes128 tuple.',
  },
  {
    id: 'hls_sample_aes_decrypt',
    asset: 'hls_sample_aes.m3u8',
    container: 'hls',
    scheme: 'hls-sample-aes',
    keyName: 'hls_sample_aes',
    cleartextAsset: 'hls_aes128_clear.mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    hls: defineHlsEncryptionContract({
      case: 'sample-aes',
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
    }),
    oracles: ['decrypt-bitexact', 'playback-smoke'],
    notes:
      'HLS SAMPLE-AES key-provided decrypt over five real MPEG-TS VOD segments. The segments are ' +
      'partial-sample encrypted (H.264/AAC sample blocks), not full-segment AES-128; decrypt-bitexact ' +
      'compares decoded frames to the clear MP4 reference hls_aes128_clear.mp4 and playback-smoke ' +
      'proves the adapter returns browser-playable MP4 bytes. Key/IV from ' +
      'fixtures/golden/hls_sample_aes.m3u8.keys.json.',
  },
  {
    id: 'hls_aes128_sequence_zero_iv_decrypt',
    asset: 'hls_aes128_seq0.m3u8',
    container: 'hls',
    scheme: 'hls-aes128',
    keyName: 'hls_aes128_seq0',
    cleartextAsset: 'hls_aes128_clear.mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    oracles: ['decrypt-bitexact', 'playback-smoke'],
    hls: defineHlsEncryptionContract({
      case: 'aes128-sequence-zero',
      mediaSequence: 0,
      transitions: [{
        firstSequence: 0,
        method: 'AES-128',
        keyRef: 'hls_aes128_seq0.key',
        ivMode: 'media-sequence',
      }],
      cleartextAsset: 'hls_aes128_clear.mp4',
      resourceIndex: '/fixtures/golden/hls_aes128_seq0.m3u8.resources.json',
    }),
    notes:
      'HLS AES-128 with IV omitted at MEDIA-SEQUENCE 0. The IV is the 128-bit big-endian segment ' +
      'sequence number; output is compared with the retained clear source.',
  },
  {
    id: 'hls_aes128_sequence_nonzero_iv_decrypt',
    asset: 'hls_aes128_seq42.m3u8',
    container: 'hls',
    scheme: 'hls-aes128',
    keyName: 'hls_aes128_seq42',
    cleartextAsset: 'hls_aes128_clear.mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    oracles: ['decrypt-bitexact', 'playback-smoke'],
    hls: defineHlsEncryptionContract({
      case: 'aes128-sequence-nonzero',
      mediaSequence: 42,
      transitions: [{
        firstSequence: 42,
        method: 'AES-128',
        keyRef: 'hls_aes128_seq42.key',
        ivMode: 'media-sequence',
      }],
      cleartextAsset: 'hls_aes128_clear.mp4',
      resourceIndex: '/fixtures/golden/hls_aes128_seq42.m3u8.resources.json',
    }),
    notes:
      'HLS AES-128 with IV omitted at MEDIA-SEQUENCE 42. Every segment derives its own 128-bit ' +
      'big-endian IV; using zero or one static IV fails the retained-clear comparison.',
  },
  {
    id: 'hls_aes128_key_rotation_decrypt',
    asset: 'hls_aes128_rotation.m3u8',
    container: 'hls',
    scheme: 'hls-aes128',
    keyName: 'hls_aes128_rotation',
    cleartextAsset: 'hls_aes128_clear.mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    oracles: ['decrypt-bitexact', 'playback-smoke'],
    hls: defineHlsEncryptionContract({
      case: 'aes128-key-rotation',
      mediaSequence: 7,
      transitions: [
        { firstSequence: 7, method: 'AES-128', keyRef: 'hls_aes128_rotation_a.key', ivMode: 'media-sequence' },
        { firstSequence: 9, method: 'AES-128', keyRef: 'hls_aes128_rotation_b.key', ivMode: 'media-sequence' },
      ],
      cleartextAsset: 'hls_aes128_clear.mp4',
      resourceIndex: '/fixtures/golden/hls_aes128_rotation.m3u8.resources.json',
    }),
    notes:
      'HLS AES-128 key rotation at sequence 9. Both source-bound 128-bit keys and sequence-derived ' +
      'IVs must be honored; output is compared with the retained clear source.',
  },
  {
    id: 'hls_aes128_method_none_transition_decrypt',
    asset: 'hls_aes128_method_none.m3u8',
    container: 'hls',
    scheme: 'hls-aes128',
    keyName: 'hls_aes128_method_none',
    cleartextAsset: 'hls_aes128_clear.mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    oracles: ['decrypt-bitexact', 'playback-smoke'],
    hls: defineHlsEncryptionContract({
      case: 'aes128-method-none-transition',
      mediaSequence: 3,
      transitions: [
        { firstSequence: 3, method: 'AES-128', keyRef: 'hls_aes128_method_none.key', ivMode: 'media-sequence' },
        { firstSequence: 5, method: 'NONE' },
      ],
      cleartextAsset: 'hls_aes128_clear.mp4',
      resourceIndex: '/fixtures/golden/hls_aes128_method_none.m3u8.resources.json',
    }),
    notes:
      'HLS AES-128 to METHOD=NONE transition. Encrypted prefix segments use sequence-derived IVs; ' +
      'clear suffix segments must not be decrypted a second time.',
  },
];

const positiveDecryptScenarios: Scenario[] = buildDecryptAll(DECRYPT_CASES);

// ── Family export: positives + metamorphic + robustness + performance + capability findings ──────

export const encryptionScenarios: Scenario[] = [
  ...positiveDecryptScenarios,
  ...encryptionMetamorphicScenarios,
  ...encryptionRobustnessScenarios,
  ...encryptionPerformanceScenarios,
  ...encryptionCapabilityFindingScenarios,
];

export default encryptionScenarios;
