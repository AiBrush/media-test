/**
 * src/scenarios/encryption/index.ts — Pillar 1, family "encryption".
 *
 * Decrypt protected media and prove the result is byte/frame-exact against an offline reference
 * decrypt via `decrypt-bitexact` (decode the cleartext output in-browser, compare frame digests to
 * golden). Three schemes are exercised: CENC AES-CTR (cenc_ctr), CENC AES-CBC subsample (cenc_cbcs),
 * and HLS AES-128 (hls_aes128). The decryption key + scheme are carried in `options` (test keys are
 * baked alongside the corpus; the golden was produced with the same key offline).
 *
 * A negative scenario asserts that feeding an UNENCRYPTED input through the decrypt path leaves the
 * bytes untouched (idempotent / no-op) — an engine must not corrupt clear media when asked to
 * "decrypt" it.
 */

import type { EncryptionScheme } from '../../core/engine.ts';
import type { Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';

/**
 * Test keys for the baked encrypted corpus. These are non-secret fixture keys committed for the
 * offline reference decrypt; they exist only so the in-browser decrypt can be compared to golden.
 */
const FIXTURE_KEYS: Record<string, { kid?: string; keyHex: string; ivHex?: string }> = {
  cenc_ctr: {
    kid: '00112233445566778899aabbccddeeff',
    keyHex: '000102030405060708090a0b0c0d0e0f',
  },
  cenc_cbcs: {
    kid: '00112233445566778899aabbccddeeff',
    keyHex: '000102030405060708090a0b0c0d0e0f',
  },
  hls_aes128: {
    keyHex: '0123456789abcdef0123456789abcdef',
    ivHex: '00000000000000000000000000000000',
  },
};

interface EncryptionCase {
  id: string;
  asset: string;
  container: string;
  scheme: EncryptionScheme;
  videoCodecs?: string[];
  audioCodecs?: string[];
  notes?: string;
}

const ENCRYPTION_CASES: EncryptionCase[] = [
  {
    id: 'cenc_ctr_decrypt',
    asset: 'cenc_ctr.mp4',
    container: 'mp4',
    scheme: 'cenc-ctr',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'CENC AES-CTR full-sample encryption; decrypted frames bit-exact vs offline-decrypt golden.',
  },
  {
    id: 'cenc_cbcs_decrypt',
    asset: 'cenc_cbcs.mp4',
    container: 'mp4',
    scheme: 'cenc-cbcs',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'CENC cbcs pattern (subsample AES-CBC, 1:9 crypt:skip); exercises pattern-block boundaries.',
  },
  {
    id: 'hls_aes128_decrypt',
    asset: 'hls_aes128.m3u8',
    container: 'hls',
    scheme: 'hls-aes128',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'HLS AES-128 full-segment CBC decrypt; key+IV from the playlist/fixture; per-segment IV.',
  },
];

const decryptScenarios: Scenario[] = ENCRYPTION_CASES.map((c) => {
  const keyName = c.id.replace(/_decrypt$/, '');
  const key = FIXTURE_KEYS[keyName];
  return defineScenario({
    id: `encryption/${c.id}`,
    op: 'decrypt',
    input: c.asset,
    options: { scheme: c.scheme, key },
    requires: {
      operations: ['decrypt'],
      containersIn: [c.container],
      encryption: [c.scheme],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
    },
    oracles: ['decrypt-bitexact'],
    metrics: ['wall', 'throughputRealtime', 'peakMemory', 'longtasks'],
    ...(c.notes ? { notes: c.notes } : {}),
  });
});

/**
 * Negative: ask the decrypt path to process an UNENCRYPTED file. The expected behavior is a no-op —
 * the cleartext output must decode to the exact same frames as the input (bit-exact), proving the
 * engine doesn't mangle clear media. We reuse `decrypt-bitexact` against the *plain* asset's golden.
 */
const untouchedScenario: Scenario = defineScenario({
  id: 'encryption/unencrypted_left_untouched',
  op: 'decrypt',
  input: 'h264_1080p_30s.mp4',
  // No real key material; scheme declared so negotiation routes through the decrypt path.
  options: { scheme: 'cenc-ctr', key: { keyHex: '00000000000000000000000000000000' }, expectNoop: true },
  requires: {
    operations: ['decrypt'],
    containersIn: ['mp4'],
    encryption: ['cenc-ctr'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
  },
  oracles: ['decrypt-bitexact'],
  metrics: ['wall'],
  notes: 'Unencrypted input through decrypt() must be a no-op: output decodes bit-exact to the source.',
});

export const encryptionScenarios: Scenario[] = [...decryptScenarios, untouchedScenario];

export default encryptionScenarios;
