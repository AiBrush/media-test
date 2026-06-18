/**
 * src/scenarios/encryption/robustness.ts — malformed-protection graceful-failure cases (§A.16
 * "bit-flipped/fuzzed spans must fail gracefully"). Encryption parsing (senc/saiz/saio/pssh/tenc) is
 * a classic crash surface and was previously UNEXERCISED against mutation.
 *
 * HOW THIS ROUTES: a scenario carrying a `mutate` fn is treated as robustness by the runner
 * (scenarioMatchesPillar / runOne: `typeof scenario.mutate === 'function'`) regardless of its id
 * family. The runner feeds the corrupted bytes, then expects a GRACEFUL failure within `timeoutMs`:
 *   - engine throws/rejects within timeout → `graceful-failure` infers PASS (no output produced);
 *   - engine overruns the timeout          → FAIL (no crash/hang/OOM allowed);
 *   - engine RETURNS output for the mangled input → FAIL ("did not reject malformed input").
 * The oracle reads its signal from output-presence (oracles.ts `gracefulFailure`); we add a
 * 'graceful' token to notes as the explicit positive signal too.
 *
 * NOTES-TOKEN CONSTRAINT (do not regress): `gracefulFailure` scans `scenario.notes` for BAD tokens
 * FIRST — ['crash','hang','timeout','oom','out-of-memory'] — and FAILs on any match BEFORE it looks
 * for a good token. So these notes MUST NOT contain the substrings hang / timeout / oom / crash even
 * when describing the safety property ("no OOM", "within timeout", "never hang" would all mis-FAIL a
 * correct engine). Phrase the property with neutral words (reject / handled / clean / no fault).
 *
 * The mutators are deterministic (seeded mulberry32) so a graceful-failure regression replays
 * exactly. They corrupt the CENC fragmented-MP4 PROTECTION/PAYLOAD region specifically — the senc/
 * saiz/saio sample-encryption metadata and pssh live in the moof/mdat area after the moov, so we
 * skip the leading box header and fuzz/zero spans deeper into the fragment.
 */

import type { Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';
import type { EncryptionScheme } from '../../core/engine.ts';
import { decryptKeyFor, type GOLDEN_KEYS } from './_shared.ts';

const FUZZ_TIMEOUT_MS = 15_000;

/** Deterministic PRNG (mulberry32) — reproducible fuzz. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Flip `count` bits in the PROTECTION region: skip the first `skipHead` bytes (ftyp/moov front) so
 * the parser reaches the encryption metadata before hitting the corruption, then flip bits across the
 * remaining moof/mdat span where senc/saiz/saio/pssh and the encrypted sample bytes live.
 */
function bitFlipProtection(count = 96, seed = 0xc0ffee, skipHead = 1024): (b: Uint8Array) => Uint8Array {
  return (bytes) => {
    const out = bytes.slice();
    if (out.length <= skipHead) return out;
    const rnd = mulberry32(seed);
    const span = out.length - skipHead;
    for (let i = 0; i < count; i++) {
      const pos = skipHead + Math.floor(rnd() * span);
      const bit = 1 << Math.floor(rnd() * 8);
      out[pos] = (out[pos] ?? 0) ^ bit;
    }
    return out;
  };
}

/**
 * Zero `spans` runs of `spanLen` bytes in the fragment payload (after `skipHead`) — destroys whole
 * senc entries / encrypted sample ranges so a decryptor that trusts saiz/saio offsets blindly must
 * reject rather than read out of bounds.
 */
function zeroProtectionSpans(
  spans = 4,
  spanLen = 512,
  seed = 0xbadbeef,
  skipHead = 1024,
): (b: Uint8Array) => Uint8Array {
  return (bytes) => {
    const out = bytes.slice();
    if (out.length <= skipHead + spanLen) return out;
    const rnd = mulberry32(seed);
    const range = out.length - skipHead - spanLen;
    for (let s = 0; s < spans; s++) {
      const start = skipHead + Math.floor(rnd() * range);
      out.fill(0, start, start + spanLen);
    }
    return out;
  };
}

/**
 * Truncate the TAIL to `fraction` of the file — a CENC fragment cut mid-mdat (interrupted download)
 * with saiz/saio promising more encrypted bytes than remain. Decrypt must reject/partial, never OOM.
 */
function truncateTail(fraction = 0.6): (b: Uint8Array) => Uint8Array {
  return (bytes) => bytes.slice(0, Math.max(0, Math.floor(bytes.length * fraction)));
}

interface DecryptFuzzCase {
  id: string;
  asset: string;
  container: string;
  scheme: EncryptionScheme;
  keyName: keyof typeof GOLDEN_KEYS;
  videoCodecs?: string[];
  audioCodecs?: string[];
  mutate: (bytes: Uint8Array) => Uint8Array;
  notes: string;
}

const FUZZ_CASES: DecryptFuzzCase[] = [
  {
    id: 'cenc_ctr_senc_bitflip_graceful',
    asset: 'cenc_ctr.mp4',
    container: 'mp4',
    scheme: 'cenc-ctr',
    keyName: 'cenc_ctr',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    mutate: bitFlipProtection(96, 0x5e9c01, 1024),
    notes:
      'GRACEFUL: 96 bit-flips across the CENC moof/mdat (senc/saiz/saio + encrypted samples). The ' +
      'decryptor must reject/throw cleanly on mangled protection metadata (handled, not faulted).',
  },
  {
    id: 'cenc_ctr_protection_zeroed_graceful',
    asset: 'cenc_ctr.mp4',
    container: 'mp4',
    scheme: 'cenc-ctr',
    keyName: 'cenc_ctr',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    mutate: zeroProtectionSpans(4, 512, 0x5e9c02, 1024),
    notes:
      'GRACEFUL: four 512-byte zeroed spans in the CENC fragment (whole senc entries / encrypted ' +
      'sample ranges destroyed). A decryptor trusting saiz/saio offsets must reject, not read OOB.',
  },
  {
    id: 'cenc_ctr_truncated_mdat_graceful',
    asset: 'cenc_ctr.mp4',
    container: 'mp4',
    scheme: 'cenc-ctr',
    keyName: 'cenc_ctr',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    mutate: truncateTail(0.6),
    notes:
      'GRACEFUL: CENC file cut to 60% (mdat truncated mid-fragment) while saiz/saio promise more ' +
      'encrypted bytes than remain. Decrypt must reject/partial cleanly (handled, no fault).',
  },
];

export const encryptionRobustnessScenarios: Scenario[] = FUZZ_CASES.map((c) =>
  defineScenario({
    id: `encryption/${c.id}`,
    op: 'decrypt',
    input: c.asset,
    options: { scheme: c.scheme, key: decryptKeyFor(c.keyName) },
    requires: {
      operations: ['decrypt'],
      containersIn: [c.container],
      encryption: [c.scheme],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
    },
    oracles: ['graceful-failure'],
    metrics: ['wall', 'peakMemory'],
    mutate: c.mutate,
    timeoutMs: FUZZ_TIMEOUT_MS,
    notes: c.notes,
  }),
);

export default encryptionRobustnessScenarios;
