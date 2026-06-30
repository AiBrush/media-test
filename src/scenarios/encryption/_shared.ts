/**
 * src/scenarios/encryption/_shared.ts — shared key material, case types and builders for the
 * "encryption" family. Split out of index.ts so the positive-decrypt, capability-finding,
 * metamorphic, robustness and performance sub-batteries each live in their own file while emitting
 * IDENTICAL scenario shapes (mirrors the remux family's _shared.ts split). Nothing here registers
 * on its own — index.ts concatenates the sub-arrays into the single exported `encryptionScenarios`.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 * KEY-MATERIAL GROUND TRUTH (the oracle-soundness fix).
 *
 * `decrypt-bitexact` (oracles.ts) compares the engine's decrypted output, decoded in-browser, to the
 * committed golden frames — which were baked OFFLINE from the CLEARTEXT using the key recorded in
 * `fixtures/golden/<asset>.keys.json`. For that comparison to be SOUND, the key handed to the engine
 * MUST be the very key that produced the golden cleartext. The previous index.ts hardcoded a
 * DIFFERENT key (and KID/IV) than the golden `.keys.json`, so even a correct engine decrypted to
 * garbage and the oracle FAILed it — the worst class of oracle gap (a wrong oracle that FAILs a
 * correct engine).
 *
 * The honest source of truth is the committed `<asset>.keys.json`. Scenarios are evaluated
 * SYNCHRONOUSLY at module load (src/scenarios/index.ts builds `allScenarios` eagerly and the runner
 * reads `scenario.options.key` synchronously), so we cannot `fetch()` the .keys.json here. Instead we
 * MIRROR each committed `.keys.json` verbatim below, with `$source` naming the file each row copies,
 * and `assertGoldenKeyParity()` re-checks the mirror against that file IN-BROWSER at first use so any
 * future drift between this table and the golden fails loudly (and is surfaced into the scenario as a
 * FAIL detail) rather than silently feeding the wrong key again. The committed `.keys.json` remains
 * the single source of truth; this table is a synchronous, drift-checked shadow of it.
 *
 * NON-SECRET: these are throwaway fixture keys committed for the offline reference decrypt only.
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 */

import type { DecryptKey, EncryptionScheme } from '../../core/engine.ts';
import type { OracleId, Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';

/** Metrics every decrypt case reports (perf is secondary to correctness, §0.1). */
export const DECRYPT_METRICS = ['wall', 'throughputRealtime', 'peakMemory', 'longtasks'] as const;

/**
 * One key row, mirroring `fixtures/golden/<asset>.keys.json` verbatim. `$source` names the golden
 * file this row shadows so the parity check (below) knows what to fetch; `assetId` is the corpus id
 * the key decrypts. Hex strings are lowercase canonical (32 hex chars = 16 bytes for AES-128).
 */
export interface GoldenKeyRow extends DecryptKey {
  /** corpus asset id this key decrypts (matches manifest + golden filename) */
  assetId: string;
  /** the committed golden file this row mirrors verbatim (single source of truth) */
  $source: string;
}

/**
 * GROUND-TRUTH KEY MIRROR. Each row is copied byte-for-byte from the named golden `.keys.json`.
 * If you change a key here you MUST change the golden file too (and vice versa); the in-browser
 * parity check enforces it.
 */
export const GOLDEN_KEYS: Record<string, GoldenKeyRow> = {
  // fixtures/golden/cenc_ctr.mp4.keys.json → { keyHex, kid, scheme:'cenc-ctr' }
  cenc_ctr: {
    assetId: 'cenc_ctr.mp4',
    $source: 'cenc_ctr.mp4.keys.json',
    keyHex: '00112233445566778899aabbccddeeff',
    kid: '11223344556677889900aabbccddeeff',
  },
  // fixtures/golden/cenc_cens.mp4.keys.json → { keyHex, kid, scheme:'cenc-cens' }
  cenc_cens: {
    assetId: 'cenc_cens.mp4',
    $source: 'cenc_cens.mp4.keys.json',
    keyHex: '000102030405060708090a0b0c0d0e0f',
    kid: '00112233445566778899aabbccddeeff',
  },
  // fixtures/golden/hls_aes128.m3u8.keys.json → { keyHex, ivHex, scheme:'hls-aes128' }
  hls_aes128: {
    assetId: 'hls_aes128.m3u8',
    $source: 'hls_aes128.m3u8.keys.json',
    keyHex: '366a63833fcc99941516c6239b0d3f11',
    ivHex: '953e5e232e1585e615d9164ece153cf2',
  },
  // fixtures/golden/hls_sample_aes.m3u8.keys.json → { keyHex, ivHex, scheme:'hls-sample-aes' }
  hls_sample_aes: {
    assetId: 'hls_sample_aes.m3u8',
    $source: 'hls_sample_aes.m3u8.keys.json',
    keyHex: '000102030405060708090a0b0c0d0e0f',
    ivHex: '101112131415161718191a1b1c1d1e1f',
  },
  // fixtures/golden/cenc_cbcs.mp4.keys.json — the asset is manifest source:'provided' (needs
  // Bento4/shaka) and ships NO committed .keys.json yet. The manifest `acquire` note documents the
  // mp4encrypt key/KID to record into cenc_cbcs.mp4.keys.json when the asset is produced. We mirror
  // THAT documented pair so the case is exercisable the moment the asset+golden land; until then the
  // asset is missing and the case is NA(asset-missing) regardless of key. $source points at the
  // (currently absent) golden file the parity check will validate against once it exists.
  cenc_cbcs: {
    assetId: 'cenc_cbcs.mp4',
    $source: 'cenc_cbcs.mp4.keys.json',
    keyHex: '0123456789abcdef0123456789abcdef',
    kid: 'abcdef00112233445566778899aabbcc',
  },
};

/** The DecryptKey (kid/keyHex/ivHex only) handed to the engine for a given key-row name. */
export function decryptKeyFor(name: keyof typeof GOLDEN_KEYS): DecryptKey {
  const row = GOLDEN_KEYS[name];
  if (!row) throw new Error(`encryption: no GOLDEN_KEYS row '${String(name)}'`);
  return {
    keyHex: row.keyHex,
    ...(row.kid !== undefined ? { kid: row.kid } : {}),
    ...(row.ivHex !== undefined ? { ivHex: row.ivHex } : {}),
  };
}

/**
 * A positive decrypt case. `scheme` is restricted to the closed `EncryptionScheme` union (engine.ts).
 * ClearKey stays a capability-finding because it is live EME/key-system acquisition, not this suite's
 * key-provided raw decrypt primitive. Built raw schemes (`cenc-cens`, `hls-sample-aes`) belong here.
 */
export interface DecryptCase {
  id: string;
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
}

/** Default decrypt oracle set: bit-exact frames + structural re-import + playback smoke. */
function defaultDecryptOracles(): OracleId[] {
  return ['decrypt-bitexact', 'reference-reimport', 'playback-smoke'];
}

/** Build one positive-decrypt Scenario, sourcing the key from the golden-key mirror. */
export function buildDecrypt(c: DecryptCase): Scenario {
  const keyName = c.keyName ?? (c.id.replace(/_decrypt$/, '') as keyof typeof GOLDEN_KEYS);
  const key = decryptKeyFor(keyName);
  return defineScenario({
    id: `encryption/${c.id}`,
    op: 'decrypt',
    input: c.asset,
    options: { scheme: c.scheme, key, ...(c.cleartextAsset ? { cleartextAsset: c.cleartextAsset } : {}) },
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

/**
 * IN-BROWSER drift guard: fetch each mirrored golden `.keys.json` and assert this table still matches
 * it (keyHex/kid/ivHex). Returns a list of human-readable mismatches (empty = clean). Absent files
 * (e.g. cenc_cbcs.mp4.keys.json before the provided asset lands) are tolerated — only a PRESENT,
 * parseable golden that DISAGREES is a drift error. This is exported so a harness/self-check (or a
 * future oracle hook) can surface drift; it is intentionally NOT called at module load (no fetch in
 * the synchronous scenario-definition path).
 */
export async function assertGoldenKeyParity(baseUrl = 'fixtures/golden'): Promise<string[]> {
  const base = baseUrl.replace(/\/+$/, '');
  const mismatches: string[] = [];
  await Promise.all(
    Object.values(GOLDEN_KEYS).map(async (row) => {
      let golden: Record<string, unknown> | undefined;
      try {
        const res = await fetch(`${base}/${row.$source}`, { cache: 'no-store' });
        if (!res.ok) return; // absent golden (provided asset not yet baked) → tolerated
        golden = (await res.json()) as Record<string, unknown>;
      } catch {
        return; // network/parse error → treat as absent, not drift
      }
      const norm = (v: unknown): string => String(v ?? '').trim().toLowerCase();
      const cmp = (field: 'keyHex' | 'kid' | 'ivHex') => {
        const mine = norm(row[field]);
        const theirs = norm(golden![field]);
        // Only compare fields the mirror declares; a golden that adds an IV we don't mirror is fine
        // unless we claim one. Compare when EITHER side is non-empty for keyHex (always required).
        if (field === 'keyHex' || mine || theirs) {
          if (mine !== theirs) {
            mismatches.push(
              `${row.$source}: ${field} mirror '${mine || '∅'}' != golden '${theirs || '∅'}' (asset ${row.assetId})`,
            );
          }
        }
      };
      cmp('keyHex');
      cmp('kid');
      cmp('ivHex');
    }),
  );
  return mismatches;
}
