/**
 * src/scenarios/encryption/capability-findings.ts — Appendix B unsupported-capability rows.
 *
 * These rows used to be pure NA capability placeholders. The suite now keeps them executable without
 * pretending the feature is supported: a decrypt-capable engine receives the explicit unsupported
 * scheme token and must reject it cleanly. `graceful-failure` is the correctness gate; returning a
 * decrypted output for one of these rows is suspicious and fails.
 */

import type { Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';
import type { EncryptionScheme } from '../../core/engine.ts';

interface CapabilityFindingCase {
  id: string;
  scheme: EncryptionScheme;
  asset: string;
  container: string;
  videoCodecs?: string[];
  audioCodecs?: string[];
  notes: string;
}

const CAPABILITY_FINDINGS: CapabilityFindingCase[] = [
  {
    id: 'clearkey_decrypt_na',
    scheme: 'clearkey',
    // CENC container shape (ClearKey is an EME key-system over CENC); reuse the cenc_ctr asset purely
    // so a decrypt-capable engine can reject the unsupported EME/DRM path cleanly.
    asset: 'cenc_ctr.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'GRACEFUL signal:rejected. CAPABILITY FINDING (§A.12 ClearKey). ClearKey is EME license-clear-key ' +
      'negotiation, not this suite raw decrypt primitive. A decrypt-capable engine must reject this ' +
      'scheme cleanly; returning output would be an over-claim.',
  },
  {
    id: 'cenc_cens_decrypt_na',
    scheme: 'cenc-cens',
    asset: 'cenc_ctr.mp4', // no 'cens' asset exists; cenc_ctr shape stands in only for input construction
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'GRACEFUL signal:rejected. CAPABILITY FINDING (§A.12 CENC "cens" — AES-CTR pattern encryption, ' +
      'the CTR counterpart to cbcs). No cens corpus asset/golden is present, so this remains an ' +
      'unsupported-scheme rejection row until a real cens asset can move it into the positive decrypt battery.',
  },
  {
    id: 'hls_sample_aes_decrypt_na',
    scheme: 'hls-sample-aes',
    asset: 'hls_aes128.m3u8', // full-segment AES-128 asset; SAMPLE-AES (partial) has no asset
    container: 'hls',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'GRACEFUL signal:rejected. CAPABILITY FINDING (§A.12 SAMPLE-AES). Distinguishes SAMPLE-AES ' +
      '(partial/per-sample AES) from full-segment HLS AES-128. A decrypt-capable HLS engine must ' +
      'reject this unsupported scheme cleanly; returning full-segment AES output would conflate two paths.',
  },
];

export const encryptionCapabilityFindingScenarios: Scenario[] = CAPABILITY_FINDINGS.map((c) =>
  defineScenario({
    id: `encryption/${c.id}`,
    op: 'decrypt',
    input: c.asset,
    options: { scheme: c.scheme, key: { keyHex: '' } },
    requires: {
      operations: ['decrypt'],
      containersIn: [c.container],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
    },
    oracles: ['graceful-failure'],
    metrics: ['wall'],
    notes: c.notes,
  }),
);

export default encryptionCapabilityFindingScenarios;
