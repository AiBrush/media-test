import type { DecryptKey, EncryptionScheme } from '../../core/engine.ts';
import type { Scenario } from '../../core/scenario.ts';
import {
  isAes128Hex,
  isCencIvHex,
  encryptionKeyProvenanceFromOptions,
  isPositiveSourceEquivalenceScenario,
} from './contracts.ts';

export interface DerivedCencCandidateContract {
  readonly sourceId: string;
  readonly sourceSha256: string;
  readonly scheme: 'cenc-ctr' | 'cenc-cens' | 'cenc-cbcs';
  readonly key: DecryptKey;
  readonly cleartextBaseAsset: string;
  readonly cleartextBaseSha256: string;
}

export type DerivedRotationDecision =
  | { readonly state: 'ELIGIBLE'; readonly reasonCode: 'DERIVED_POSITIVE_SOURCE_EQUIVALENCE' }
  | {
      readonly state: 'INELIGIBLE';
      readonly reasonCode:
        | 'DERIVED_ROTATION_SCENARIO_NOT_POSITIVE'
        | 'DERIVED_ROTATION_KEY_INVALID'
        | 'DERIVED_ROTATION_DIGEST_INVALID'
        | 'DERIVED_ROTATION_SCHEME_INVALID';
      readonly detail: string;
    };

/** Fail-closed gate consumed before media-selection rewrites any scenario definition. */
export function assessDerivedEncryptionRotation(
  scenario: Pick<Scenario, 'op' | 'options' | 'oracles'>,
  candidate: DerivedCencCandidateContract,
): DerivedRotationDecision {
  if (!isPositiveSourceEquivalenceScenario(scenario)) {
    return ineligible(
      'DERIVED_ROTATION_SCENARIO_NOT_POSITIVE',
      'DERIVED CENC rotation is restricted to explicitly marked positive source-equivalence rows',
    );
  }
  const provenance = encryptionKeyProvenanceFromOptions(scenario.options);
  if (!provenance || !isRawCencScheme(provenance.scheme)) {
    return ineligible(
      'DERIVED_ROTATION_SCENARIO_NOT_POSITIVE',
      'DERIVED CENC rotation requires a positive CENC-in-MP4 source-equivalence scenario',
    );
  }
  if (!isRawCencScheme(candidate.scheme)) {
    return ineligible('DERIVED_ROTATION_SCHEME_INVALID', `scheme '${candidate.scheme}' is not rotatable CENC-in-MP4`);
  }
  if (!isAes128Hex(candidate.key.keyHex) || !isAes128Hex(candidate.key.kid) ||
      (candidate.key.ivHex !== undefined && !isCencIvHex(candidate.key.ivHex))) {
    return ineligible(
      'DERIVED_ROTATION_KEY_INVALID',
      'candidate key/KID must be 128-bit and its CENC IV, when present, must be 64-bit or 128-bit lowercase hex',
    );
  }
  if (!isSha256(candidate.sourceSha256) || !isSha256(candidate.cleartextBaseSha256)) {
    return ineligible('DERIVED_ROTATION_DIGEST_INVALID', 'candidate source/base must be bound by full lowercase SHA-256');
  }
  if (!candidate.sourceId || !candidate.cleartextBaseAsset) {
    return ineligible('DERIVED_ROTATION_DIGEST_INVALID', 'candidate source/base identity is missing');
  }
  return Object.freeze({ state: 'ELIGIBLE', reasonCode: 'DERIVED_POSITIVE_SOURCE_EQUIVALENCE' });
}

function isRawCencScheme(value: EncryptionScheme): value is 'cenc-ctr' | 'cenc-cens' | 'cenc-cbcs' {
  return value === 'cenc-ctr' || value === 'cenc-cens' || value === 'cenc-cbcs';
}

function isSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

function ineligible(
  reasonCode: Extract<DerivedRotationDecision, { state: 'INELIGIBLE' }>['reasonCode'],
  detail: string,
): Extract<DerivedRotationDecision, { state: 'INELIGIBLE' }> {
  return Object.freeze({ state: 'INELIGIBLE', reasonCode, detail });
}
