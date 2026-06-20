/**
 * src/scenarios/encryption/performance.ts — the headline TIMED decrypt-throughput case (§A.14 / §8.2:
 * a timed 'decrypt' case reporting decode fps / wall). The rest of the family reports wall/throughput
 * as secondary metrics, but there was no headline decrypt-throughput row analogous to the per-op
 * sweep; this adds one with an explicit `primaryMetric` so the §9 leaderboard ranks engines by it.
 *
 * primaryMetric = 'throughputRealtime' (decrypt wall vs media duration, higher-is-better), matching
 * how the remux/mux size-ladder perf cells express throughput. The runner derives the realtime factor
 * from golden meta durationSec (cenc_ctr.mp4.meta.json: 5.021s) ÷ measured wall.
 *
 * CORRECTNESS GATES THE NUMBER (§0.1): the case carries `decrypt-bitexact`, so the runner benches ONLY
 * after the decrypt PASSes frame-exact vs the offline cleartext golden. A fast-but-wrong decrypt
 * cannot post a throughput number. The key is sourced from the golden-key mirror (the same sound key
 * the functional case uses), never a hardcoded literal.
 */

import type { Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';
import { decryptKeyFor } from './_shared.ts';

const PERF_TIMEOUT_MS = 60_000;

const decryptThroughput: Scenario = defineScenario({
  id: 'encryption/perf_cenc_ctr_decrypt_throughput',
  op: 'decrypt',
  input: 'cenc_ctr.mp4',
  options: { scheme: 'cenc-ctr', key: decryptKeyFor('cenc_ctr') },
  requires: {
    operations: ['decrypt'],
    containersIn: ['mp4'],
    encryption: ['cenc-ctr'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    features: ['encryption:cenc-ctr-clear-output'],
  },
  // decrypt-bitexact is the correctness gate; throughputRealtime is the ranked headline.
  oracles: ['decrypt-bitexact'],
  metrics: ['throughputRealtime', 'wall', 'peakMemory', 'longtasks'],
  primaryMetric: 'throughputRealtime',
  timeoutMs: PERF_TIMEOUT_MS,
  notes:
    'HEADLINE TIMED DECRYPT (§A.14/§8.2): CENC AES-CTR decrypt throughput. primaryMetric=' +
    'throughputRealtime (decrypt wall vs 5.021s media duration, higher-is-better); ranked per §9. ' +
    'Correctness (decrypt-bitexact vs offline cleartext golden) gates the bench — no green oracle, ' +
    'no admissible number. Requires feature encryption:cenc-ctr-clear-output so an engine must first ' +
    'declare clear-sample export for CENC-CTR before this performance cell can run.',
});

export const encryptionPerformanceScenarios: Scenario[] = [decryptThroughput];

export default encryptionPerformanceScenarios;
