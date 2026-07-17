import type { OracleId, OracleOutcome } from '../../core/scenario.ts';

export function metadataVerdict(
  // Callers may still classify internally as a representational difference; correctness is binary,
  // so a 'DIFF' classification is emitted as a PASS verdict (the difference stays in reasonCode/detail).
  verdict: 'PASS' | 'DIFF' | 'FAIL',
  reasonCode: string,
  detail: string,
  measurements?: Record<string, number>,
  oracle: OracleId = 'property-invariant',
): OracleOutcome {
  return {
    state: 'VERDICT',
    oracle,
    verdict: verdict === 'DIFF' ? 'PASS' : verdict,
    reasonCode,
    detail,
    ...(measurements ? { measurements } : {}),
  };
}

export function metadataError(
  reasonCode: string,
  detail: string,
  oracle: OracleId = 'property-invariant',
): OracleOutcome {
  return { state: 'ERROR', oracle, reasonCode, detail };
}
