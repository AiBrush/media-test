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
 *   - this file                : positive decrypt (cenc-ctr · cenc-cbcs · hls-aes128), frame-exact +
 *                                structural re-import + playback smoke.
 *   - ./metamorphic.ts         : decrypt(x)==offline-cleartext (property-invariant) + no-op idempotence.
 *   - ./robustness.ts          : malformed-protection fuzz → graceful-failure (§A.16).
 *   - ./performance.ts         : headline TIMED decrypt-throughput (primaryMetric, §A.14/§8.2).
 *   - ./capability-findings.ts : Appendix-B NA rows for schemes OUTSIDE the EncryptionScheme union
 *                                (ClearKey · CENC cens · SAMPLE-AES) — registered + attributed, never
 *                                silently omitted.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 * ORACLE-SOUNDNESS FIXES vs the previous version (all within scenario scope):
 *  1. KEY-MATERIAL DRIFT (the unsound-oracle bug): keys are no longer hardcoded to values that
 *     DISAGREE with the golden ground truth. They come from `_shared.GOLDEN_KEYS`, a drift-checked
 *     mirror of `fixtures/golden/<asset>.keys.json` (see _shared.ts). Feeding the correct key is what
 *     makes `decrypt-bitexact` a SOUND gate instead of one that FAILs a correct engine.
 *  2. Dead `expectNoop`: removed. Nothing in the frozen runner/oracles read it. The no-op property is
 *     now gated by the metamorphic sub-battery (frame-exact + structural + playback). A TRUE
 *     byte-identity oracle (output bytes === input bytes) and a "reference reports encryptionInfo===
 *     null on the output" de-protection oracle are CORE-LEVEL gaps (need new oracles in oracles.ts,
 *     outside this writer's scope) — recorded here so they are not lost.
 *  3. Structural + playback secondary oracles: every positive decrypt case now also runs
 *     reference-reimport + playback-smoke (decrypt analogue of the remux secondary gates), so a
 *     decrypted MP4 that decodes frame-exact but is structurally invalid for <video>, or that leaves
 *     a track mangled, is caught — not only the decoded-frame digests.
 *
 * KNOWN ROUTING TODAY (honest NA, not a silent omission):
 *  - cbcs (cenc_cbcs.mp4) is manifest source:'provided' (needs Bento4/shaka) and ships no committed
 *    golden/keys yet → NA(asset-missing) until baked. The case is registered with the documented
 *    mp4encrypt key (mirrored in _shared) so it lights up the moment the asset+golden land.
 *  - hls-aes128: the mediabunny DOSSIER (§4.10 line 181, A.12) says mediabunny SUPPORTS HLS AES-128,
 *    but the mediabunny ADAPTER declares encryption: ['cenc-ctr','cenc-cbcs'] only (comment: "HLS
 *    AES-128 not exposed as a decrypt primitive in 1.48.0"). That adapter-vs-dossier reconciliation
 *    is the ADAPTER writer's call (engine scope, not scenario scope): if the dossier is right, add
 *    'hls-aes128' to the adapter's capabilities and this case proves an HLS-AES winner; until then it
 *    is correctly NA(engine) for mediabunny. The scenario stays faithful — it declares the requirement
 *    and lets negotiation report the truth.
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 */

import type { Scenario } from '../../core/scenario.ts';
import { buildDecryptAll, type DecryptCase } from './_shared.ts';
import { encryptionMetamorphicScenarios } from './metamorphic.ts';
import { encryptionRobustnessScenarios } from './robustness.ts';
import { encryptionPerformanceScenarios } from './performance.ts';
import { encryptionCapabilityFindingScenarios } from './capability-findings.ts';

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
    id: 'cenc_cbcs_decrypt',
    asset: 'cenc_cbcs.mp4',
    container: 'mp4',
    scheme: 'cenc-cbcs',
    keyName: 'cenc_cbcs',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    // cbcs output re-import structural check is meaningful, but the asset is provided/absent today so
    // the whole case is NA(asset-missing) until baked; keep the full oracle set for when it lands.
    notes:
      'CENC cbcs pattern (subsample AES-CBC, crypt:skip pattern, per-subsample IV). Exercises the ' +
      'pattern-block boundary. Asset is manifest source:provided (Bento4/shaka) → NA(asset-missing) ' +
      'until baked; key/KID mirror the manifest acquire note (record into cenc_cbcs.mp4.keys.json). ' +
      'NOTE: a pattern-SPECIFIC oracle assertion (that the crypt/skip block boundary was honored, not ' +
      'just whole-frame digests) needs a new oracle in oracles.ts — a core-level gap recorded here.',
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
    // HLS is segmented; reference-reimport of a playlist-as-one-blob is not well-defined for every
    // reference engine, so gate frame-exactness + playback only (avoid an unsound structural gate).
    oracles: ['decrypt-bitexact', 'playback-smoke'],
    notes:
      'HLS AES-128 full-segment CBC decrypt. Key + explicit IV from fixtures/golden/hls_aes128.m3u8.' +
      'keys.json (the playlist #EXT-X-KEY carried an explicit IV, so the EXPLICIT-IV path is exercised; ' +
      'the media-sequence-derived-IV default path is a separate variant a future golden without ivHex ' +
      'would cover). decrypt-bitexact vs the offline MP4 cleartext reference hls_aes128_clear.mp4 + ' +
      'playback-smoke. Routes NA(engine) for any ' +
      'engine that does not declare hls-aes128 (see index header: mediabunny adapter-vs-dossier note).',
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
