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
 * WHY ALSO reference-reimport: CENC decrypt only rewrites sample PAYLOADS — an engine could leave the
 * protection signalling (sinf/schm/tenc/senc/saiz/saio/pssh) in place and still decode bit-exact.
 * decode-frame digests cannot see that. reference-reimport re-parses ctx.output with the reference
 * engine; a genuinely de-protected output re-imports as a normal clear container with the expected
 * packet/keyframe table, whereas leftover protection boxes or a mangled track surface as a re-import
 * divergence. (The strongest possible check — "the reference reports encryptionInfo===null on the
 * output", dossier §4.10 "encryption info is null for clear tracks" — is a STRUCTURAL de-protection
 * assertion that needs a new oracle in oracles.ts to read encryptionInfo off a re-probe; that is
 * outside scenario scope and is recorded in the family notes as a core-level oracle gap.)
 *
 * NO-OP IDEMPOTENCE (§A.16 "unencrypted input must be left untouched"): feeding a CLEAR asset through
 * decrypt() must reproduce the source. We gate it with the same decode-cleartext-baseline invariant
 * (output frames == the clear asset's own golden frames) PLUS reference-reimport + playback-smoke.
 * A TRUE byte-identity assertion (output bytes === input bytes) is the spec's literal property but is
 * NOT expressible from scenario scope: nothing in the frozen runner/oracles compares output to input
 * bytes (the dead `expectNoop` option was never read). That byte-equality oracle is a core-level gap,
 * recorded in the family notes; the frame-exact + structural + playback gates are the strongest
 * browser-pure no-op evidence available without editing oracles.ts.
 */

import type { OracleId, Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';
import type { EncryptionScheme } from '../../core/engine.ts';
import { decryptKeyFor, type GOLDEN_KEYS } from './_shared.ts';

// Routes to the oracle's decode branch (contains "decode"); does NOT contain "duration"/"probe".
const DECODE_CLEARTEXT = 'decode-cleartext-baseline';

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
      'reproduce the source. property-invariant[decode-cleartext-baseline] (output frames == the ' +
      'clear asset golden) + reference-reimport + playback-smoke. NOTE: a TRUE byte-identity oracle ' +
      '(output bytes === input bytes) is the spec letter but is NOT expressible from scenario scope ' +
      '(the frozen runner/oracles never compare output-to-input bytes; the old expectNoop option was ' +
      'dead). That byte-equality oracle is a core-level gap; this is the strongest browser-pure no-op ' +
      'evidence without editing oracles.ts.',
  },
];

const metamorphicScenarios: Scenario[] = METAMORPHIC_CASES.map((c) => {
  const key = c.keyName
    ? decryptKeyFor(c.keyName)
    : { keyHex: c.rawKeyHex ?? '00000000000000000000000000000000' };
  return defineScenario({
    id: `encryption/${c.id}`,
    op: 'decrypt',
    input: c.asset,
    options: {
      scheme: c.scheme,
      key,
      invariant: DECODE_CLEARTEXT,
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
