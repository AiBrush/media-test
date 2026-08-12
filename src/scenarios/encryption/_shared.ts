/**
 * src/scenarios/encryption/_shared.ts — shared key material, case types and builders for the
 * "encryption" family. Split out of index.ts so the positive-decrypt, capability-finding,
 * metamorphic, robustness and performance sub-batteries each live in their own file while emitting
 * IDENTICAL scenario shapes (mirrors the remux family's _shared.ts split). Nothing here registers
 * on its own — index.ts concatenates the sub-arrays into the single exported `encryptionScenarios`.
 *
 * Key material below is only the synchronous scenario descriptor. Before any engine is called, the
 * blocking encryption preflight loads the named committed `.keys.json`, validates its scheme-specific
 * key/KID/IV shape and exact parity, then supplies those authoritative bytes at the adapter boundary.
 * A missing record is NA_ASSET and any mirror/provenance drift is harness ERROR, never engine FAIL.
 *
 * NON-SECRET: these are throwaway fixture keys committed for the offline reference decrypt only.
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 */

import type { DecryptKey, EncryptionScheme } from '../../core/engine.ts';
import type { OracleId, Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';
import {
  defineEncryptionKeyProvenance,
  defineScenarioDecryptKey,
  type EncryptionKeyUse,
  type EncryptionPatternContract,
  type HlsEncryptionContract,
  type ScenarioDecryptKey,
} from '../../features/encryption/contracts.ts';

/** Metrics every decrypt case reports (perf is secondary to correctness, §0.1). */
export const DECRYPT_METRICS = ['wall', 'throughputRealtime', 'peakMemory', 'longtasks'] as const;

/**
 * One key row, mirroring `fixtures/golden/<asset>.keys.json` verbatim. `$source` names the record the
 * blocking preflight fetches; `assetId` is the corpus id the key decrypts. Hex strings are lowercase
 * canonical (32 hex chars = 16 bytes for AES-128).
 */
export interface GoldenKeyRow extends DecryptKey {
  /** corpus asset id this key decrypts (matches manifest + golden filename) */
  assetId: string;
  /** the committed golden file this row mirrors verbatim (single source of truth) */
  $source: string;
  scheme: EncryptionScheme;
}

/**
 * GROUND-TRUTH KEY MIRROR. Each row is copied byte-for-byte from the named golden `.keys.json`.
 * If a mirror differs from its record, the blocking preflight returns harness ERROR before execution.
 */
export const GOLDEN_KEYS: Record<string, GoldenKeyRow> = {
  // fixtures/golden/cenc_ctr.mp4.keys.json → { keyHex, kid, scheme:'cenc-ctr' }
  cenc_ctr: {
    assetId: 'cenc_ctr.mp4',
    $source: 'cenc_ctr.mp4.keys.json',
    keyHex: '00112233445566778899aabbccddeeff',
    kid: '11223344556677889900aabbccddeeff',
    scheme: 'cenc-ctr',
  },
  // fixtures/golden/cenc_cens.mp4.keys.json → { keyHex, kid, scheme:'cenc-cens' }
  cenc_cens: {
    assetId: 'cenc_cens.mp4',
    $source: 'cenc_cens.mp4.keys.json',
    keyHex: '000102030405060708090a0b0c0d0e0f',
    kid: '00112233445566778899aabbccddeeff',
    scheme: 'cenc-cens',
  },
  // fixtures/golden/hls_aes128.m3u8.keys.json → { keyHex, ivHex, scheme:'hls-aes128' }
  hls_aes128: {
    assetId: 'hls_aes128.m3u8',
    $source: 'hls_aes128.m3u8.keys.json',
    keyHex: '26cc7945163ec2b0c6c1bf651431a683',
    ivHex: 'c0643a1737869dcf50b7d5daa37b466b',
    scheme: 'hls-aes128',
  },
  // fixtures/golden/hls_sample_aes.m3u8.keys.json → { keyHex, ivHex, scheme:'hls-sample-aes' }
  hls_sample_aes: {
    assetId: 'hls_sample_aes.m3u8',
    $source: 'hls_sample_aes.m3u8.keys.json',
    keyHex: '000102030405060708090a0b0c0d0e0f',
    ivHex: '101112131415161718191a1b1c1d1e1f',
    scheme: 'hls-sample-aes',
  },
  // fixtures/golden/cenc_cbcs.mp4.keys.json → { keyHex, kid, scheme:'cenc-cbcs' }
  cenc_cbcs: {
    assetId: 'cenc_cbcs.mp4',
    $source: 'cenc_cbcs.mp4.keys.json',
    keyHex: '0123456789abcdef0123456789abcdef',
    kid: 'abcdef00112233445566778899aabbcc',
    scheme: 'cenc-cbcs',
  },
  // The following deterministic records are fixture contracts for REQ-FEAT-57. The fixture owner
  // bakes the named playlists and commits matching .keys.json files; until then strict preflight
  // routes each row to NA_ASSET before any engine is called.
  hls_aes128_seq0: {
    assetId: 'hls_aes128_seq0.m3u8',
    $source: 'hls_aes128_seq0.m3u8.keys.json',
    keyHex: '102132435465768798a9bacbdcedfe0f',
    scheme: 'hls-aes128',
  },
  hls_aes128_seq42: {
    assetId: 'hls_aes128_seq42.m3u8',
    $source: 'hls_aes128_seq42.m3u8.keys.json',
    keyHex: '2031425364758697a8b9cadbecfd0e1f',
    scheme: 'hls-aes128',
  },
  hls_aes128_rotation: {
    assetId: 'hls_aes128_rotation.m3u8',
    $source: 'hls_aes128_rotation.m3u8.keys.json',
    keyHex: '30415263748596a7b8c9daebfc0d1e2f',
    scheme: 'hls-aes128',
  },
  hls_aes128_method_none: {
    assetId: 'hls_aes128_method_none.m3u8',
    $source: 'hls_aes128_method_none.m3u8.keys.json',
    keyHex: '405162738495a6b7c8d9eafb0c1d2e3f',
    scheme: 'hls-aes128',
  },
};

export interface ScenarioKeyOptions {
  use?: EncryptionKeyUse;
  pattern?: EncryptionPatternContract;
  hls?: HlsEncryptionContract;
  requestedScheme?: EncryptionScheme;
}

/** Versioned scenario descriptor; the runner preflight replaces positive mirrors with record bytes. */
export function decryptKeyFor(
  name: keyof typeof GOLDEN_KEYS,
  options: ScenarioKeyOptions = {},
): ScenarioDecryptKey {
  const row = GOLDEN_KEYS[name];
  if (!row) throw new Error(`encryption: no GOLDEN_KEYS row '${String(name)}'`);
  const use = options.use ?? 'authoritative-positive';
  const scheme = options.requestedScheme ?? row.scheme;
  return defineScenarioDecryptKey(
    {
      keyHex: row.keyHex,
      ...(row.kid !== undefined ? { kid: row.kid } : {}),
      ...(row.ivHex !== undefined ? { ivHex: row.ivHex } : {}),
    },
    defineEncryptionKeyProvenance({
      sourceRecord: `/fixtures/golden/${row.$source}`,
      assetId: row.assetId,
      scheme,
      use,
      rotationPolicy: use === 'authoritative-positive'
        ? 'positive-source-equivalence'
        : 'fixed-scenario-semantics',
      ...(options.pattern ? { pattern: options.pattern } : {}),
      ...(options.hls ? { hls: options.hls } : {}),
    }),
  );
}

/**
 * A positive decrypt case. `scheme` is restricted to the closed `EncryptionScheme` union (engine.ts).
 * ClearKey stays a capability-finding because it is live EME/key-system acquisition, not this suite's
 * key-provided raw decrypt primitive. Built raw schemes (`cenc-cens`, `hls-sample-aes`) belong here.
 */
export interface DecryptCase {
  id: string;
  /** Increment when the executable evidence contract changes. */
  revision?: number;
  asset: string;
  container: string;
  scheme: EncryptionScheme;
  /** key-row name in GOLDEN_KEYS (defaults to id with a trailing _decrypt stripped) */
  keyName?: keyof typeof GOLDEN_KEYS;
  videoCodecs?: string[];
  audioCodecs?: string[];
  /**
   * Extra feature gates for decrypt export paths that are narrower than scheme parsing. For example,
   * CENC-CTR clear-sample export is distinct from merely recognizing protected tracks.
   */
  features?: string[];
  /** Optional plaintext corpus asset whose browser-baked frame golden is the decrypt comparison target. */
  cleartextAsset?: string;
  /** Allow the protected source to author timing while the clear reference authors frame identity. */
  clearReferenceTimeline?: 'protected-source';
  /**
   * Override the oracle set. Default: decrypt-bitexact (frame-exact vs offline cleartext golden) +
   * reference-reimport (output re-parses as a real container) + playback-smoke (the de-protected
   * MP4 actually plays). The two structural oracles are the decrypt analogue of the remux secondary
   * gates: a decrypted MP4 that decodes frame-exact but is structurally invalid for <video> is
   * caught by playback-smoke, and a dropped/garbled track shows up in reference-reimport.
   */
  oracles?: OracleId[];
  metrics?: readonly Scenario['metrics'][number][];
  primaryMetric?: Scenario['primaryMetric'];
  timeoutMs?: number;
  notes?: string;
  pattern?: EncryptionPatternContract;
  hls?: HlsEncryptionContract;
}

/** Default decrypt oracle set: bit-exact frames + structural re-import + playback smoke. */
function defaultDecryptOracles(): OracleId[] {
  return ['decrypt-bitexact', 'reference-reimport', 'playback-smoke'];
}

/** Build one positive-decrypt Scenario, sourcing the key from the golden-key mirror. */
export function buildDecrypt(c: DecryptCase): Scenario {
  const keyName = c.keyName ?? (c.id.replace(/_decrypt$/, '') as keyof typeof GOLDEN_KEYS);
  const key = decryptKeyFor(keyName, {
    use: 'authoritative-positive',
    ...(c.pattern ? { pattern: c.pattern } : {}),
    ...(c.hls ? { hls: c.hls } : {}),
  });
  return defineScenario({
    id: `encryption/${c.id}`,
    ...(c.revision ? { revision: c.revision } : {}),
    op: 'decrypt',
    input: c.asset,
    options: {
      scheme: c.scheme,
      key,
      ...(c.cleartextAsset ? { cleartextAsset: c.cleartextAsset } : {}),
      ...(c.clearReferenceTimeline ? { clearReferenceTimeline: c.clearReferenceTimeline } : {}),
    },
    requires: {
      operations: ['decrypt'],
      containersIn: [c.container],
      encryption: [c.scheme],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
      ...(c.features ? { features: c.features } : {}),
    },
    oracles: c.oracles ?? defaultDecryptOracles(),
    metrics: c.metrics ? [...c.metrics] : [...DECRYPT_METRICS],
    ...(c.primaryMetric ? { primaryMetric: c.primaryMetric } : {}),
    ...(c.timeoutMs ? { timeoutMs: c.timeoutMs } : {}),
    ...(c.notes ? { notes: c.notes } : {}),
  });
}

export function buildDecryptAll(cases: DecryptCase[]): Scenario[] {
  return cases.map(buildDecrypt);
}
