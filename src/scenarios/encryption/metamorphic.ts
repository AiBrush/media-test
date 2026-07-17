/**
 * src/scenarios/encryption/metamorphic.ts — property-invariant (metamorphic, §11) decrypt cases.
 *
 * The decrypt analogue of remux's decode(remux(x))==decode(x): a correct decrypt must reproduce the
 * OFFLINE CLEARTEXT. Encrypted assets may name `options.cleartextAsset`, whose committed
 * `<cleartextAsset>.frames.json` was browser-baked from the independent plaintext corpus twin. So:
 *
 *   decrypt(x) frame digests  ==  golden.frames (the offline cleartext decode)
 *
 * is expressed with the `property-invariant` oracle. ORACLE ROUTING (oracles.ts `propertyInvariant`
 * matches by SUBSTRING, testing which.includes('decode')||includes('remux') FIRST): we pass an
 * invariant token that CONTAINS "decode" so it routes to the decode branch, which decodes ctx.output
 * with the platform engine and compares to golden.frames. The human phrasing
 * "decrypt(x)==decode(cleartext)" lives in notes; the routing token is `decode-cleartext-baseline`.
 *
 * `reference-reimport` independently rejects active CENC signaling and missing tracks after a
 * frame-correct decrypt. The clear-input row uses a distinct byte-identity invariant: any rewrap,
 * truncation, or payload change is FAIL, with neutral decode/re-import/playback left as diagnostics.
 */

import type { OracleId, Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';
import type { EncryptionScheme } from '../../core/engine.ts';
import { decryptKeyFor, type GOLDEN_KEYS } from './_shared.ts';
import {
  defineEncryptionKeyProvenance,
  defineHlsEncryptionContract,
  defineScenarioDecryptKey,
  type HlsEncryptionContract,
} from '../../features/encryption/contracts.ts';

// Routes to the oracle's decode branch (contains "decode"); does NOT contain "duration"/"probe".
const DECODE_CLEARTEXT = 'decode-cleartext-baseline';
export const DECRYPT_BYTE_IDENTITY_NOOP = 'decrypt-byte-identity-noop';

interface DecryptMetamorphicCase {
  id: string;
  asset: string;
  container: string;
  /** scheme from the closed union the runner can dispatch */
  scheme: EncryptionScheme;
  /** key-row name in GOLDEN_KEYS; omitted for the clear no-op case (no real key needed) */
  keyName?: keyof typeof GOLDEN_KEYS;
  /** raw key override for the clear no-op (an all-zero key; decrypt of clear media is a no-op) */
  rawKeyHex?: string;
  videoCodecs?: string[];
  audioCodecs?: string[];
  features?: string[];
  cleartextAsset?: string;
  hls?: HlsEncryptionContract;
  oracles?: OracleId[];
  notes: string;
}

const METAMORPHIC_CASES: DecryptMetamorphicCase[] = [
  {
    id: 'cenc_ctr_decrypt_eq_cleartext',
    asset: 'cenc_ctr.mp4',
    container: 'mp4',
    scheme: 'cenc-ctr',
    keyName: 'cenc_ctr',
    cleartextAsset: 'cenc_ctr_clear.mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    features: ['webcrypto:cenc-ctr-clear-output'],
    notes:
      'METAMORPHIC: decrypt(cenc_ctr.mp4) decodes bit-exact to the offline CLEARTEXT (golden frames ' +
      'baked from cenc_ctr_clear.mp4). property-invariant[decode-cleartext-baseline] gates the pixels; ' +
      'reference-reimport gates that the output is a genuinely de-protected, re-parseable container ' +
      '(no leftover sinf/senc breaking the track). Requires feature webcrypto:cenc-ctr-clear-output ' +
      'so engines that can only parse protected-track metadata do not post a false decrypt result. ' +
      'Decrypt analogue of decode(remux(x))==decode(x).',
  },
  {
    id: 'hls_aes128_decrypt_eq_cleartext',
    asset: 'hls_aes128.m3u8',
    container: 'hls',
    scheme: 'hls-aes128',
    keyName: 'hls_aes128',
    cleartextAsset: 'hls_aes128_clear.mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    // HLS output re-import as an MP4/TS via the reference engine is engine-dependent; keep the frame
    // invariant + playback-smoke (decryptable, playable) and drop reference-reimport to avoid an
    // unsound structural gate on a segmented-HLS output the reference may not re-demux as one blob.
    oracles: ['property-invariant', 'playback-smoke'],
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
    notes:
      'METAMORPHIC: decrypt(hls_aes128) full-segment AES-128 decodes bit-exact to the cleartext ' +
      'MP4 reference hls_aes128_clear.mp4. property-invariant[decode-cleartext-baseline] + playback-smoke. ' +
      'The HLS golden carries an explicit ivHex (from #EXT-X-KEY) so the explicit-IV path is what is ' +
      'exercised here.',
  },
  {
    id: 'unencrypted_left_untouched_noop',
    asset: 'h264_1080p_30s.mp4',
    container: 'mp4',
    scheme: 'cenc-ctr',
    rawKeyHex: '00000000000000000000000000000000',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'METAMORPHIC NO-OP (§A.16 leave-unencrypted-untouched): a CLEAR MP4 through decrypt() must ' +
      'reproduce the exact selected source bytes. property-invariant[decrypt-byte-identity-noop] is ' +
      'decisive: metadata-only rewrap, frame loss, or playable wrong content is FAIL. Neutral decode, ' +
      'reference-reimport, and playback remain secondary diagnostics.',
  },
];

const metamorphicScenarios: Scenario[] = METAMORPHIC_CASES.map((c) => {
  const key = c.keyName
    ? decryptKeyFor(c.keyName, {
        use: 'authoritative-positive',
        ...(c.hls ? { hls: c.hls } : {}),
      })
    : defineScenarioDecryptKey(
        { keyHex: c.rawKeyHex ?? '00000000000000000000000000000000' },
        defineEncryptionKeyProvenance({
          assetId: c.asset,
          scheme: c.scheme,
          use: 'clear-input-sentinel',
          rotationPolicy: 'fixed-scenario-semantics',
        }),
      );
  return defineScenario({
    id: `encryption/${c.id}`,
    op: 'decrypt',
    input: c.asset,
    options: {
      scheme: c.scheme,
      key,
      invariant: c.id === 'unencrypted_left_untouched_noop'
        ? DECRYPT_BYTE_IDENTITY_NOOP
        : DECODE_CLEARTEXT,
      ...(c.cleartextAsset ? { cleartextAsset: c.cleartextAsset } : {}),
    },
    requires: {
      operations: ['decrypt'],
      containersIn: [c.container],
      encryption: [c.scheme],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
      ...(c.features ? { features: c.features } : {}),
    },
    oracles: c.oracles ?? ['property-invariant', 'reference-reimport', 'playback-smoke'],
    metrics: ['wall', 'peakMemory', 'longtasks'],
    notes: c.notes,
  });
});

export const encryptionMetamorphicScenarios: Scenario[] = metamorphicScenarios;

export default encryptionMetamorphicScenarios;
