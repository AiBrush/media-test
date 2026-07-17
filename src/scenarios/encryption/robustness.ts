/**
 * src/scenarios/encryption/robustness.ts — malformed-protection graceful-failure cases (§A.16
 * "bit-flipped/fuzzed spans must fail gracefully"). Encryption parsing (senc/saiz/saio/pssh/tenc) is
 * a classic fault surface and is exercised with prebaked malformed CENC fixtures.
 *
 * Each row carries an explicit robustness contract. Only a realm-safe MalformedInputError is an
 * expected clean rejection; NotApplicableError remains NA_ENGINE, an unknown exception is ERROR,
 * timeout/worker failure is FAIL, and returned bytes must pass independent structural/clear-output
 * checks. No prose token contributes to the verdict.
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
import { defineRobustnessContract } from '../robustness/contracts.ts';
import { defineEncryptionNegativeContract } from '../../features/encryption/contracts.ts';

const FUZZ_TIMEOUT_MS = 15_000;

interface DecryptFuzzCase {
  id: string;
  asset: string;
  container: string;
  scheme: EncryptionScheme;
  keyName: keyof typeof GOLDEN_KEYS;
  videoCodecs?: string[];
  audioCodecs?: string[];
  partialOutput?: { minimumDecodedFrames: number };
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
    partialOutput: { minimumDecodedFrames: 1 },
    notes:
      'GRACEFUL: CENC file cut to 60% (mdat truncated mid-fragment) while saiz/saio promise more ' +
      'encrypted bytes than remain. Decrypt must reject/partial cleanly (handled, no fault).',
  },
];

export const encryptionRobustnessScenarios: Scenario[] = FUZZ_CASES.map((c) => {
  const oracles = ['graceful-failure', 'decrypt-bitexact'] as const;
  const robustness = {
    ...defineRobustnessContract('negative', 'media-structure', oracles, FUZZ_TIMEOUT_MS),
    encryption: defineEncryptionNegativeContract({
      expected: 'malformed-protection-rejection',
      returnedOutputOracles: ['decrypt-bitexact', 'reference-reimport'],
      partialOutput: c.partialOutput
        ? {
            allowed: true,
            minimumDecodedFrames: c.partialOutput.minimumDecodedFrames,
            requireTimelinePrefix: true,
          }
        : { allowed: false },
    }),
  };
  return defineScenario({
    id: `encryption/${c.id}`,
    op: 'decrypt',
    input: c.asset,
    options: {
      scheme: c.scheme,
      key: decryptKeyFor(c.keyName, { use: 'malformed-protection' }),
      cleartextAsset: 'cenc_ctr_clear.mp4',
      robustness,
    },
    requires: {
      operations: ['decrypt'],
      containersIn: [c.container],
      encryption: [c.scheme],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
    },
    oracles: [...oracles],
    metrics: ['wall', 'peakMemory'],
    timeoutMs: FUZZ_TIMEOUT_MS,
    notes: c.notes,
  });
});

export default encryptionRobustnessScenarios;
