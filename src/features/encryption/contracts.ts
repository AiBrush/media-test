import type { DecryptKey, EncryptionScheme } from '../../core/engine.ts';
import type { Scenario } from '../../core/scenario.ts';

export const ENCRYPTION_KEY_PROVENANCE_SCHEMA =
  'media-test/encryption-key-provenance@1' as const;
export const ENCRYPTION_NEGATIVE_CONTRACT_SCHEMA =
  'media-test/encryption-negative@1' as const;
export const ENCRYPTION_PATTERN_CONTRACT_SCHEMA =
  'media-test/encryption-pattern@1' as const;
export const HLS_ENCRYPTION_CONTRACT_SCHEMA =
  'media-test/hls-encryption@1' as const;
export const HLS_RESOURCE_INDEX_SCHEMA =
  'media-test/hls-resource-index@1' as const;

export type EncryptionKeyUse =
  | 'authoritative-positive'
  | 'malformed-protection'
  | 'wrong-key'
  | 'wrong-kid'
  | 'wrong-iv'
  | 'missing-key'
  | 'method-mismatch'
  | 'clear-input-sentinel'
  | 'eme-negative';

export type EncryptionRotationPolicy =
  | 'positive-source-equivalence'
  | 'fixed-scenario-semantics';

export interface EncryptionPatternContract {
  readonly schema: typeof ENCRYPTION_PATTERN_CONTRACT_SCHEMA;
  readonly scheme: 'cenc-cens' | 'cenc-cbcs';
  readonly cipherMode: 'AES-CTR' | 'AES-CBC';
  readonly cryptByteBlock: number;
  readonly skipByteBlock: number;
  readonly ivRule: 'per-sample' | 'constant';
  readonly ivSize: 8 | 16;
  readonly requiresSubsampleMap: true;
  readonly boundaryVectorId: string;
  readonly boundarySubsamples: readonly Readonly<{
    clearBytes: number;
    protectedBytes: number;
  }>[];
  /** Digest-bound corpus variants may differ in sample count/shape; each records one exact boundary. */
  readonly fixtureBoundaryVectors?: readonly Readonly<{
    sampleCount: number;
    firstBoundarySubsamples: readonly Readonly<{
      clearBytes: number;
      protectedBytes: number;
    }>[];
  }>[];
}

export type HlsKeyMethod = 'AES-128' | 'SAMPLE-AES' | 'NONE';
export type HlsIvMode = 'explicit' | 'media-sequence';

export interface HlsExpectedTransition {
  readonly firstSequence: number;
  readonly method: HlsKeyMethod;
  readonly keyRef?: string;
  readonly ivMode?: HlsIvMode;
  readonly explicitIvHex?: string;
}

export interface HlsEncryptionContract {
  readonly schema: typeof HLS_ENCRYPTION_CONTRACT_SCHEMA;
  readonly case:
    | 'aes128-explicit-iv'
    | 'aes128-sequence-zero'
    | 'aes128-sequence-nonzero'
    | 'aes128-key-rotation'
    | 'aes128-method-none-transition'
    | 'sample-aes'
    | 'method-mismatch-negative';
  readonly mediaSequence: number;
  readonly transitions: readonly HlsExpectedTransition[];
  readonly cleartextAsset: string;
  /**
   * Digest-bound closure for every URI consumed through the playlist URL.  The runner must load
   * this record and verify its key/map/segment identities before any adapter receives the root URL.
   */
  readonly resourceIndex: string;
}

export type HlsResourceRole = 'key' | 'map' | 'segment';

export interface HlsResourceIdentity {
  readonly role: HlsResourceRole;
  /** Canonical, local URI exactly as authored in the media playlist. */
  readonly uri: string;
  readonly sha256: string;
  readonly sizeBytes: number;
}

/** Committed sidecar-closure record consumed by `preflightHlsResourceIndex()`. */
export interface HlsResourceIndex {
  readonly schema: typeof HLS_RESOURCE_INDEX_SCHEMA;
  readonly playlist: Readonly<{
    readonly assetId: string;
    readonly sha256: string;
    readonly sizeBytes: number;
  }>;
  /** First-reference order, with repeated URIs represented exactly once. */
  readonly resources: readonly HlsResourceIdentity[];
}

export interface EncryptionKeyProvenance {
  readonly schema: typeof ENCRYPTION_KEY_PROVENANCE_SCHEMA;
  /** URL of the committed authoritative record loaded before an engine is scored. */
  readonly sourceRecord?: string;
  readonly assetId: string;
  readonly scheme: EncryptionScheme;
  readonly use: EncryptionKeyUse;
  readonly rotationPolicy: EncryptionRotationPolicy;
  readonly pattern?: EncryptionPatternContract;
  readonly hls?: HlsEncryptionContract;
  /** EME identity is evidence only; it is never handed to MediaEngine.decrypt(). */
  readonly keySystem?: 'org.w3.clearkey';
  readonly rawDecryptForbidden?: true;
}

/** Scenario-only descriptor. The runner strips `provenance` at the adapter boundary. */
export interface ScenarioDecryptKey extends DecryptKey {
  readonly provenance: EncryptionKeyProvenance;
}

export interface EncryptionNegativeContract {
  readonly schema: typeof ENCRYPTION_NEGATIVE_CONTRACT_SCHEMA;
  readonly expected:
    | 'malformed-protection-rejection'
    | 'wrong-key-rejection'
    | 'wrong-kid-rejection'
    | 'wrong-iv-rejection'
    | 'missing-key-rejection'
    | 'method-mismatch-rejection'
    | 'raw-clearkey-rejection';
  /** Returned media must pass every named oracle; a quick arbitrary throw is never success. */
  readonly returnedOutputOracles: readonly ('decrypt-bitexact' | 'reference-reimport')[];
  readonly partialOutput:
    | { readonly allowed: false }
    | {
        readonly allowed: true;
        readonly minimumDecodedFrames: number;
        readonly requireTimelinePrefix: true;
      };
}

export function definePatternContract(
  value: Omit<EncryptionPatternContract, 'schema' | 'requiresSubsampleMap'>,
): EncryptionPatternContract {
  if (!Number.isSafeInteger(value.cryptByteBlock) || value.cryptByteBlock <= 0 || value.cryptByteBlock > 15) {
    throw new TypeError('encryption pattern cryptByteBlock must be within 1..15');
  }
  if (!Number.isSafeInteger(value.skipByteBlock) || value.skipByteBlock < 0 || value.skipByteBlock > 15) {
    throw new TypeError('encryption pattern skipByteBlock must be within 0..15');
  }
  if (!value.boundaryVectorId.trim()) throw new TypeError('encryption pattern boundaryVectorId is required');
  const expectedMode = value.scheme === 'cenc-cens' ? 'AES-CTR' : 'AES-CBC';
  if (value.cipherMode !== expectedMode) {
    throw new TypeError(`${value.scheme} pattern contract requires ${expectedMode}`);
  }
  if (value.boundarySubsamples.length === 0 || value.boundarySubsamples.some((entry) =>
    !Number.isSafeInteger(entry.clearBytes) || entry.clearBytes < 0 ||
    !Number.isSafeInteger(entry.protectedBytes) || entry.protectedBytes <= 0)) {
    throw new TypeError('encryption pattern boundary vector requires valid subsample spans');
  }
  if (value.fixtureBoundaryVectors !== undefined) {
    if (value.fixtureBoundaryVectors.length === 0) {
      throw new TypeError('encryption pattern fixture boundary vectors must not be empty');
    }
    const identities = new Set<string>();
    for (const vector of value.fixtureBoundaryVectors) {
      if (!Number.isSafeInteger(vector.sampleCount) || vector.sampleCount <= 0) {
        throw new TypeError('encryption pattern fixture boundary vector requires a positive sampleCount');
      }
      if (vector.firstBoundarySubsamples.length === 0 || vector.firstBoundarySubsamples.some((entry) =>
        !Number.isSafeInteger(entry.clearBytes) || entry.clearBytes < 0 ||
        !Number.isSafeInteger(entry.protectedBytes) || entry.protectedBytes <= 0)) {
        throw new TypeError('encryption pattern fixture boundary vector requires valid subsample spans');
      }
      const identity = `${vector.sampleCount}:` + vector.firstBoundarySubsamples
        .map((entry) => `${entry.clearBytes}:${entry.protectedBytes}`)
        .join(',');
      if (identities.has(identity)) throw new TypeError('encryption pattern fixture boundary vectors must be unique');
      identities.add(identity);
    }
  }
  return deepFreeze({
    schema: ENCRYPTION_PATTERN_CONTRACT_SCHEMA,
    ...value,
    requiresSubsampleMap: true,
  });
}

export function defineHlsEncryptionContract(
  value: Omit<HlsEncryptionContract, 'schema'>,
): HlsEncryptionContract {
  if (!Number.isSafeInteger(value.mediaSequence) || value.mediaSequence < 0) {
    throw new TypeError('HLS mediaSequence must be a non-negative safe integer');
  }
  if (!value.cleartextAsset.trim()) throw new TypeError('HLS cleartextAsset is required');
  if (!isCanonicalFixtureUrl(value.resourceIndex)) {
    throw new TypeError('HLS resourceIndex must be a canonical /fixtures/golden/*.resources.json URL');
  }
  if (value.transitions.length === 0) throw new TypeError('HLS contract requires at least one transition');
  let last = -1;
  for (const transition of value.transitions) {
    if (!Number.isSafeInteger(transition.firstSequence) || transition.firstSequence < value.mediaSequence) {
      throw new TypeError('HLS transition sequence is outside the playlist timeline');
    }
    if (transition.firstSequence <= last) throw new TypeError('HLS transitions must be strictly ordered');
    last = transition.firstSequence;
    if (transition.method === 'NONE') {
      if (transition.keyRef || transition.ivMode || transition.explicitIvHex) {
        throw new TypeError('METHOD=NONE must not carry key or IV fields');
      }
      continue;
    }
    if (!transition.keyRef?.trim() || !isCanonicalLocalUri(transition.keyRef)) {
      throw new TypeError(`${transition.method} transition requires a canonical local keyRef`);
    }
    if (!transition.ivMode) throw new TypeError(`${transition.method} transition requires ivMode`);
    if (transition.ivMode === 'explicit' && !isAes128Hex(transition.explicitIvHex)) {
      throw new TypeError('explicit HLS IV must contain exactly 16 bytes');
    }
    if (transition.ivMode === 'media-sequence' && transition.explicitIvHex !== undefined) {
      throw new TypeError('media-sequence HLS IV must not carry explicitIvHex');
    }
  }
  const protectedTransitions = value.transitions.filter((transition) => transition.method !== 'NONE');
  const protectedMethods = new Set(protectedTransitions.map((transition) => transition.method));
  if (value.case !== 'method-mismatch-negative') {
    const expectedMethod: HlsKeyMethod = value.case === 'sample-aes' ? 'SAMPLE-AES' : 'AES-128';
    if (protectedMethods.size !== 1 || !protectedMethods.has(expectedMethod)) {
      throw new TypeError(`HLS ${value.case} contract requires ${expectedMethod} protected transitions`);
    }
  }
  if (value.case === 'aes128-explicit-iv' &&
      protectedTransitions.some((transition) => transition.ivMode !== 'explicit')) {
    throw new TypeError('HLS explicit-IV case requires explicit IV transitions');
  }
  if (value.case === 'aes128-sequence-zero' &&
      (value.mediaSequence !== 0 || protectedTransitions.some((transition) => transition.ivMode !== 'media-sequence'))) {
    throw new TypeError('HLS sequence-zero case requires MEDIA-SEQUENCE 0 and derived IVs');
  }
  if (value.case === 'aes128-sequence-nonzero' &&
      (value.mediaSequence === 0 || protectedTransitions.some((transition) => transition.ivMode !== 'media-sequence'))) {
    throw new TypeError('HLS sequence-nonzero case requires nonzero MEDIA-SEQUENCE and derived IVs');
  }
  if (value.case === 'aes128-key-rotation' &&
      new Set(protectedTransitions.map((transition) => transition.keyRef)).size < 2) {
    throw new TypeError('HLS key-rotation case requires at least two distinct key URIs');
  }
  if (value.case === 'aes128-method-none-transition' &&
      !value.transitions.some((transition) => transition.method === 'NONE')) {
    throw new TypeError('HLS METHOD=NONE case requires a NONE transition');
  }
  return deepFreeze({ schema: HLS_ENCRYPTION_CONTRACT_SCHEMA, ...value });
}

export function defineEncryptionKeyProvenance(
  value: Omit<EncryptionKeyProvenance, 'schema'>,
): EncryptionKeyProvenance {
  if (!value.assetId.trim()) throw new TypeError('encryption key provenance assetId is required');
  if (value.use !== 'clear-input-sentinel' && value.use !== 'eme-negative' && !value.sourceRecord?.trim()) {
    throw new TypeError('encryption key provenance sourceRecord is required');
  }
  if (value.use === 'authoritative-positive' && value.rotationPolicy !== 'positive-source-equivalence') {
    throw new TypeError('positive decrypt provenance must opt into positive source equivalence');
  }
  if (value.use !== 'authoritative-positive' && value.rotationPolicy !== 'fixed-scenario-semantics') {
    throw new TypeError('negative/no-op provenance must keep fixed scenario semantics');
  }
  if (value.use === 'eme-negative' && (value.keySystem !== 'org.w3.clearkey' || value.rawDecryptForbidden !== true)) {
    throw new TypeError('Clear Key negative provenance must forbid raw decrypt');
  }
  if (value.use !== 'eme-negative' && (value.keySystem !== undefined || value.rawDecryptForbidden !== undefined)) {
    throw new TypeError('EME-only evidence is forbidden on raw decrypt provenance');
  }
  if (value.pattern && value.pattern.scheme !== value.scheme) {
    throw new TypeError('encryption pattern scheme must match key provenance scheme');
  }
  if (value.hls) {
    if (value.scheme !== 'hls-aes128' && value.scheme !== 'hls-sample-aes') {
      throw new TypeError('HLS contract requires an HLS key provenance scheme');
    }
    if (value.use !== 'method-mismatch') {
      const playlistUsesSampleAes = value.hls.transitions.some((transition) => transition.method === 'SAMPLE-AES');
      const expectedScheme: EncryptionScheme = playlistUsesSampleAes ? 'hls-sample-aes' : 'hls-aes128';
      if (value.scheme !== expectedScheme) throw new TypeError('HLS method must match key provenance scheme');
    }
  }
  return deepFreeze({ schema: ENCRYPTION_KEY_PROVENANCE_SCHEMA, ...value });
}

export function defineEncryptionNegativeContract(
  value: Omit<EncryptionNegativeContract, 'schema'>,
): EncryptionNegativeContract {
  if (value.returnedOutputOracles.length === 0) {
    throw new TypeError('encryption negative contract requires a returned-output oracle');
  }
  if (value.partialOutput.allowed &&
      (!Number.isSafeInteger(value.partialOutput.minimumDecodedFrames) || value.partialOutput.minimumDecodedFrames <= 0)) {
    throw new TypeError('allowed encryption partial output requires a positive minimum frame count');
  }
  return deepFreeze({ schema: ENCRYPTION_NEGATIVE_CONTRACT_SCHEMA, ...value });
}

export function encryptionNegativeContractFromOptions(
  options: unknown,
): EncryptionNegativeContract | undefined {
  if (!isRecord(options) || !isRecord(options.robustness) || !isRecord(options.robustness.encryption)) {
    return undefined;
  }
  return options.robustness.encryption.schema === ENCRYPTION_NEGATIVE_CONTRACT_SCHEMA
    ? options.robustness.encryption as unknown as EncryptionNegativeContract
    : undefined;
}

export function defineScenarioDecryptKey(
  key: DecryptKey,
  provenance: EncryptionKeyProvenance,
): ScenarioDecryptKey {
  return deepFreeze({
    keyHex: key.keyHex,
    ...(key.kid !== undefined ? { kid: key.kid } : {}),
    ...(key.ivHex !== undefined ? { ivHex: key.ivHex } : {}),
    provenance,
  });
}

export function encryptionKeyProvenanceFromOptions(
  options: unknown,
): EncryptionKeyProvenance | undefined {
  if (!isRecord(options) || !isRecord(options.key) || !isRecord(options.key.provenance)) return undefined;
  const value = options.key.provenance;
  if (value.schema !== ENCRYPTION_KEY_PROVENANCE_SCHEMA) return undefined;
  return value as unknown as EncryptionKeyProvenance;
}

/** The exact, type-accessible marker consumed by media-selection's DERIVED eligibility gate. */
export function isPositiveSourceEquivalenceScenario(
  scenario: Pick<Scenario, 'op' | 'options' | 'oracles'>,
): boolean {
  if (scenario.op !== 'decrypt' || scenario.oracles.includes('graceful-failure')) return false;
  const provenance = encryptionKeyProvenanceFromOptions(scenario.options);
  return provenance?.use === 'authoritative-positive' &&
    provenance.rotationPolicy === 'positive-source-equivalence' &&
    provenance.rawDecryptForbidden !== true;
}

export function isAes128Hex(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);
}

/** ISO CENC permits 64-bit or 128-bit per-sample IVs; HLS always uses a 128-bit IV. */
export function isCencIvHex(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[0-9a-f]{16}|[0-9a-f]{32})$/.test(value);
}

export function isSha256Hex(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

export function isEncryptionScheme(value: unknown): value is EncryptionScheme {
  return value === 'cenc-ctr' || value === 'cenc-cbcs' || value === 'cenc-cens' ||
    value === 'hls-aes128' || value === 'hls-sample-aes' || value === 'clearkey';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCanonicalFixtureUrl(value: unknown): value is string {
  return typeof value === 'string' &&
    /^\/fixtures\/golden\/[A-Za-z0-9][A-Za-z0-9._-]*\.resources\.json$/.test(value);
}

function isCanonicalLocalUri(value: string): boolean {
  if (!value || value.trim() !== value || value.startsWith('/') || value.includes('\\') ||
      value.includes('?') || value.includes('#') || value.includes('%') ||
      /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return false;
  return value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (typeof value !== 'object' || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item, seen);
  return Object.freeze(value);
}
