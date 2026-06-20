/**
 * src/scenarios/encryption/robustness.ts — malformed-protection graceful-failure cases (§A.16
 * "bit-flipped/fuzzed spans must fail gracefully"). Encryption parsing (senc/saiz/saio/pssh/tenc) is
 * a classic fault surface and is exercised with prebaked malformed CENC fixtures.
 *
 * HOW THIS ROUTES: every case carries the graceful-failure oracle. The runner feeds the malformed
 * fixture file, then expects a GRACEFUL failure within `timeoutMs`:
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
 * The fixtures are deterministic products of fixtures/bake.mjs. They corrupt the CENC fragmented-MP4
 * PROTECTION/PAYLOAD region specifically — the senc/saiz/saio sample-encryption metadata and pssh
 * live in the moof/mdat area after the moov, so the generated files preserve the front matter while
 * fuzzing/zeroing/truncating deeper fragment bytes.
 */

import type { Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';
import type { EncryptionScheme } from '../../core/engine.ts';
import { decryptKeyFor, type GOLDEN_KEYS } from './_shared.ts';

const FUZZ_TIMEOUT_MS = 15_000;

interface DecryptFuzzCase {
  id: string;
  asset: string;
  container: string;
  scheme: EncryptionScheme;
  keyName: keyof typeof GOLDEN_KEYS;
  videoCodecs?: string[];
  audioCodecs?: string[];
  notes: string;
}

const FUZZ_CASES: DecryptFuzzCase[] = [
  {
    id: 'cenc_ctr_senc_bitflip_graceful',
    asset: 'cenc_ctr_senc_bitflip.mp4',
    container: 'mp4',
    scheme: 'cenc-ctr',
    keyName: 'cenc_ctr',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'GRACEFUL: 96 bit-flips across the CENC moof/mdat (senc/saiz/saio + encrypted samples). The ' +
      'decryptor must reject/throw cleanly on mangled protection metadata (handled, not faulted).',
  },
  {
    id: 'cenc_ctr_protection_zeroed_graceful',
    asset: 'cenc_ctr_protection_zeroed.mp4',
    container: 'mp4',
    scheme: 'cenc-ctr',
    keyName: 'cenc_ctr',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'GRACEFUL: four 512-byte zeroed spans in the CENC fragment (whole senc entries / encrypted ' +
      'sample ranges destroyed). A decryptor trusting saiz/saio offsets must reject, not read OOB.',
  },
  {
    id: 'cenc_ctr_truncated_mdat_graceful',
    asset: 'cenc_ctr_truncated_mdat.mp4',
    container: 'mp4',
    scheme: 'cenc-ctr',
    keyName: 'cenc_ctr',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
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
    timeoutMs: FUZZ_TIMEOUT_MS,
    notes: c.notes,
  }),
);

export default encryptionRobustnessScenarios;
