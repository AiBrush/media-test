/**
 * src/scenarios/encryption/capability-findings.ts — Appendix B "uncontested / NA" capability rows
 * for the encryption family.
 *
 * Spec §A.12 enumerates "CENC cenc · cbcs · HLS AES-128 · ClearKey · cens · leave-unencrypted-
 * untouched · SAMPLE-AES". Three of those schemes fall OUTSIDE the closed `EncryptionScheme` union
 * in engine.ts (`'cenc-ctr' | 'cenc-cbcs' | 'hls-aes128'`):
 *
 *   - ClearKey        — there is no 'clearkey' token in EncryptionScheme; no engine declares it.
 *   - CENC 'cens'     — AES-CTR pattern encryption (the CTR counterpart to cbcs). The mediabunny
 *                       dossier (§4.10, A.12) states mediabunny supports cenc/cens/cbcs, but 'cens'
 *                       is absent from the union AND there is no 'cens' corpus asset.
 *   - SAMPLE-AES HLS  — partial-segment AES (vs full-segment AES-128). The dossier (§4.10 line 181)
 *                       explicitly notes mediabunny handles AES-128 but NOT SAMPLE-AES.
 *
 * Per Appendix B, an uncontested / NA row MUST still be registered and reported as a capability
 * finding — silently omitting it under-reports the catalog. We CANNOT put an out-of-union token in
 * `requires.encryption` (the runner types it as `EncryptionScheme[]`; it would not compile). The
 * type-safe, honest expression is a required FEATURE token: `requires.features = ['encryption:<x>']`.
 * No adapter declares these feature strings, so the runner's negotiate() returns NA_ENGINE with the
 * precise reason "engine does not declare feature 'encryption:<x>'" — exactly the capability finding
 * Appendix B wants. If/when an engine declares the feature AND a corpus asset is added, the case
 * lights up without any change here.
 *
 * IMPORTANT: these are NOT decrypt-correctness cases (no golden, no real asset) — they are catalog
 * rows whose ONLY job is to make the NA explicit and attributed. We still attach `decrypt-bitexact`
 * as the declared oracle so the shape matches the family; it never runs because negotiation
 * short-circuits to NA before any oracle (oracles only run after a successful negotiate()).
 */

import type { Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';

interface CapabilityFindingCase {
  id: string;
  /** the free-form capability feature token the engine would have to declare (no adapter does) */
  feature: string;
  /** an asset id used only for the MediaInput build; the case is NA before it is ever fetched */
  asset: string;
  container: string;
  videoCodecs?: string[];
  audioCodecs?: string[];
  notes: string;
}

const CAPABILITY_FINDINGS: CapabilityFindingCase[] = [
  {
    id: 'clearkey_decrypt_na',
    feature: 'encryption:clearkey',
    // CENC container shape (ClearKey is an EME key-system over CENC); reuse the cenc_ctr asset purely
    // so the MediaInput is constructible — the case is NA(engine) before the asset is touched.
    asset: 'cenc_ctr.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'CAPABILITY FINDING (§A.12 ClearKey). No engine declares feature "encryption:clearkey" → ' +
      'NA(engine). ClearKey is EME license-clear-key negotiation, NOT a raw decrypt primitive; the ' +
      'mediabunny dossier (§5 line "no ClearKey/EME-DRM license negotiation") confirms it is NA. ' +
      'Registered (not omitted) so Appendix B reports the row attributed, per the uncontested/NA rule.',
  },
  {
    id: 'cenc_cens_decrypt_na',
    feature: 'encryption:cens',
    asset: 'cenc_ctr.mp4', // no 'cens' asset exists; cenc_ctr shape stands in only for input construction
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'CAPABILITY FINDING (§A.12 CENC "cens" — AES-CTR pattern encryption, the CTR counterpart to ' +
      'cbcs). The mediabunny dossier (§4.10 "scheme types cenc (AES-CTR), cens, and cbcs"; A.12 ' +
      '"CENC cenc/cens/cbcs decrypt") states mediabunny SUPPORTS cens, but (1) EncryptionScheme has ' +
      'no "cens" token and (2) there is no cens corpus asset, so it is exercised here as a feature- ' +
      'gated NA(engine) row. To promote to a real decrypt case: add "cens" to the EncryptionScheme ' +
      'union + a cens asset + golden, then move this into the positive decrypt battery.',
  },
  {
    id: 'hls_sample_aes_decrypt_na',
    feature: 'encryption:sample-aes',
    asset: 'hls_aes128.m3u8', // full-segment AES-128 asset; SAMPLE-AES (partial) has no asset
    container: 'hls',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'CAPABILITY FINDING (§A.12 SAMPLE-AES). Distinguishes SAMPLE-AES (partial/per-sample AES) from ' +
      'full-segment HLS AES-128 — the two are otherwise conflated. The mediabunny dossier (§4.10 ' +
      'line 181, §5 "SAMPLE-AES HLS (vs AES-128) is not handled") states SAMPLE-AES is NA. No engine ' +
      'declares feature "encryption:sample-aes" → NA(engine), reported attributed per Appendix B.',
  },
];

export const encryptionCapabilityFindingScenarios: Scenario[] = CAPABILITY_FINDINGS.map((c) =>
  defineScenario({
    id: `encryption/${c.id}`,
    op: 'decrypt',
    input: c.asset,
    // No real key material is meaningful for an NA row; declare the scheme the runner can type
    // (cenc-ctr) only so dispatch is well-formed should negotiation ever pass in a future engine.
    options: { scheme: 'cenc-ctr', key: { keyHex: '' } },
    requires: {
      operations: ['decrypt'],
      containersIn: [c.container],
      // The out-of-union scheme is gated as a FEATURE the engine must declare (no adapter does).
      features: [c.feature],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
    },
    oracles: ['decrypt-bitexact'],
    metrics: ['wall'],
    notes: c.notes,
  }),
);

export default encryptionCapabilityFindingScenarios;
