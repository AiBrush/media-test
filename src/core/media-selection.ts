/**
 * Validated, content-addressed media selection.
 *
 * The authoritative path is:
 *   load/parse catalog + baked manifest -> buildSelectionManifest -> selectCandidateFromPool ->
 *   verifyContentSet -> engine construction/execution.
 *
 * Compatibility helpers (`selectForRun`, `candidatesForRun`) keep the existing runner callable while
 * exposing the same full-digest/pool/evidence identities for the integration owner to consume.
 */

import type { OracleId, OracleOutcome, Scenario } from './scenario.ts';
import { reduceOracleOutcomes } from './scenario.ts';
import {
  BAKED_CORPUS_SCHEMA_VERSION,
  CATALOG_SCHEMA_VERSION,
  SELECTION_ALGORITHM_ID,
  SELECTION_MANIFEST_SCHEMA_VERSION,
  SELECTION_POLICY_VERSION,
  canonicalSha256,
  contentIdentityDigest,
  deepFreeze,
  normalizeRelativePath,
  parseBakedCorpusManifest,
  parseScenarioSourceCatalog,
  scenarioSourceMap,
  type BakedAssetRecord,
  type CandidateEvidenceDeclaration,
  type CatalogIssue,
  type ContentIdentity,
  type EvidenceNeedKind,
  type ScenarioSourceRow,
  type SourceClass,
  type SourceFileRecord,
  type ValidatedBakedCorpusManifest,
  type ValidatedScenarioSourceCatalog,
} from './selection-integrity.ts';
import { sha256Hex } from './seeded-rng.ts';
import {
  encryptionKeyProvenanceFromOptions,
  isPositiveSourceEquivalenceScenario,
} from '../features/encryption/contracts.ts';
import { assessDerivedEncryptionRotation } from '../features/encryption/rotation.ts';

export * from './selection-integrity.ts';
export { sha256Hex } from './seeded-rng.ts';

export const SOURCES_NDJSON_PATH = '/fixtures/media/scenarios/_sources.ndjson';
export const BAKED_MANIFEST_PATH = '/fixtures/manifest.json';
export const SCENARIOS_URL_PREFIX = 'scenarios';
export const DECRYPT_METAMORPHIC_INVARIANT = 'decrypt-eq-cleartext-decode';
export const ROBUSTNESS_VARIANT_SELECTION_CONTRACT = deepFreeze({
  version: 'robustness-selection-contract@1',
  contractKind: 'robustness-variant',
  requiredEvidence: 'MALFORMED_REJECTION',
  digestBinding: 'scenario+source-sha256',
} as const);

const LOWER_SHA256 = /^[0-9a-f]{64}$/;
const CENC_128_BIT_HEX = /^[0-9a-f]{32}$/;
const CENC_IV_HEX = /^(?:[0-9a-f]{16}|[0-9a-f]{32})$/;
const CENC_MP4_SCHEMES = new Set(['cenc-ctr', 'cenc-cbcs', 'cenc-cens']);
const GOLDEN_ORACLES = new Set<OracleId>([
  'golden-metadata',
  'golden-packets',
  'decoded-frames-bitexact',
  'decoded-audio-pcm',
  'ssim-psnr',
  'fanout-renditions',
  'alpha-plane',
  'seek-accuracy',
  'trim-boundaries',
  'decrypt-bitexact',
]);

export type { ScenarioSourceRow, SourceClass, SourceFileRecord };

export interface ResolvedInput {
  /** Golden/report identity. */
  id: string;
  /** Path below /fixtures/media/ whose exact bytes must be verified. */
  urlAssetPath: string;
  sha256?: string;
  sizeBytes?: number;
  /** Set only after the runner verifies and retains these exact bytes. */
  integrity?: 'DECLARED' | 'VERIFIED' | 'UNVERIFIED';
  /** Digest-bound URL dependency. Transport resources are verified and sealed into the primary
   * playlist but are never presented to an adapter as additional operation inputs. */
  transport?:
    | {
        kind: 'hls-resource';
        role: 'key' | 'map' | 'segment';
        sourceUri: string;
      }
    | {
        kind: 'oracle-resource';
        role: 'cleartext-base';
        sourceUri: string;
      };
}

export interface OracleEvidenceNeed {
  kind: EvidenceNeedKind;
  sourceSha256?: string;
  peerSha256?: string;
}

export interface OracleEvidenceRequirement {
  oracle: OracleId;
  role: 'REQUIRED' | 'SUPPLEMENTAL';
  needs: readonly OracleEvidenceNeed[];
}

export interface CandidateOracleEvidencePlan {
  schemaVersion: 'candidate-oracle-evidence@1';
  sourceSha256: string;
  requirements: readonly OracleEvidenceRequirement[];
  requiredOracles: readonly OracleId[];
  sufficientOracleSets: readonly (readonly OracleId[])[];
  declaredAvailable: readonly EvidenceNeedKind[];
  contractDigest: string;
}

export interface CandidateEvidenceUnavailable {
  oracle: OracleId;
  status: 'NA_ASSET' | 'NA_BROWSER';
  reasonCode: string;
}

export interface CandidateEvidenceEvaluation {
  status: 'PASS' | 'FAIL' | 'NA_ASSET' | 'NA_BROWSER' | 'ERROR';
  reasonCode: string;
  required: readonly OracleId[];
  applied: readonly OracleId[];
  unavailable: readonly CandidateEvidenceUnavailable[];
  sufficientSurvivorOracles: readonly OracleId[];
  sufficient: boolean;
}

export interface CandidateAcquisitionProvenance {
  entity: {
    logicalPath: string;
    sha256: string;
    sizeBytes: number;
    sourceUrl?: string;
    license?: string;
  };
  activity: {
    kind: 'generated' | 'retrieved' | 'derived' | 'provided' | 'unknown';
    provider?: string;
    tool?: string;
    command?: string;
  };
  derivation?: {
    inputSha256: string;
    outputSha256: string;
  };
}

export interface CandidateInputIdentity extends ContentIdentity {
  id: string;
  urlAssetPath: string;
}

export interface SelectionProbability {
  numerator: 1;
  denominator: number;
  weight: 1;
}

export interface SelectionCandidateManifest {
  schemaVersion: 'selection-candidate@1';
  scenarioId: string;
  kind: 'baked' | 'real';
  sourceClass: 'BAKED' | SourceClass;
  selectedFile: string;
  inputs: readonly CandidateInputIdentity[];
  /** Single-file SHA-256, or a full SHA-256 over ordered multi-input identities. */
  contentDigest: string;
  candidateIdentity: string;
  integrity: 'DECLARED' | 'UNVERIFIED';
  probability: SelectionProbability;
  evidencePlan: CandidateOracleEvidencePlan;
  provenance: readonly CandidateAcquisitionProvenance[];
  sourceFile?: SourceFileRecord;
}

export interface CandidateRejection {
  scenarioId: string;
  selectedFile?: string;
  reasonCode: string;
  detail: string;
  status: 'NA_ASSET';
}

export interface ScenarioCandidatePool {
  scenarioId: string;
  eligiblePoolDigest: string;
  candidates: readonly SelectionCandidateManifest[];
  rejections: readonly CandidateRejection[];
  eligible: number;
}

export interface FrozenSelectionManifest {
  schemaVersion: typeof SELECTION_MANIFEST_SCHEMA_VERSION;
  catalogSchemaVersion: typeof CATALOG_SCHEMA_VERSION;
  selectionPolicyVersion: typeof SELECTION_POLICY_VERSION;
  selectionAlgorithmId: typeof SELECTION_ALGORITHM_ID;
  catalogState: 'ready' | 'fallback';
  catalogReason?: { reasonCode: string; detail: string };
  catalogSha256?: string;
  bakedCorpusSchemaVersion: typeof BAKED_CORPUS_SCHEMA_VERSION;
  bakedCorpusVersion: string;
  bakedCorpusDigest: string;
  pools: readonly ScenarioCandidatePool[];
  manifestDigest: string;
}

export interface ScenarioSelection {
  scenarioId: string;
  isBaked: boolean;
  selectedFile: string;
  /** Full logical corpus path (or ordered '+' join for multi-input). */
  selectedPath?: string;
  selectedSha256?: string;
  resolvedInputs: ResolvedInput[];
  effectiveScenario: Scenario;
  candidateCount: number;
  /** Kept for current report/UI compatibility; typed rejections are authoritative. */
  shapeWarnings: string[];
  eligiblePoolDigest?: string;
  executedInputDigest?: string;
  candidateIdentity?: string;
  selectionPolicyVersion?: typeof SELECTION_POLICY_VERSION;
  selectionAlgorithmId?: typeof SELECTION_ALGORITHM_ID;
  score?: string;
  probability?: SelectionProbability;
  evidencePlan?: CandidateOracleEvidencePlan;
  rejections?: readonly CandidateRejection[];
  catalogState?: 'ready' | 'fallback';
  catalogReason?: { reasonCode: string; detail: string };
}

export interface LoadedCatalogMetadata {
  catalogState: 'ready' | 'fallback';
  catalogReason?: { reasonCode: string; detail: string };
  catalog?: ValidatedScenarioSourceCatalog;
  bakedManifest?: ValidatedBakedCorpusManifest;
  issues: readonly CatalogIssue[];
}

/** A Map-compatible, mutation-blocked catalog for legacy callers plus explicit fallback provenance. */
export class LoadedScenarioSources extends Map<string, ScenarioSourceRow> {
  readonly metadata: LoadedCatalogMetadata;
  #sealed = false;

  constructor(entries: readonly (readonly [string, ScenarioSourceRow])[], metadata: LoadedCatalogMetadata) {
    super();
    for (const [key, value] of entries) super.set(key, value);
    this.metadata = deepFreeze(metadata);
    this.#sealed = true;
    Object.freeze(this);
  }

  override set(key: string, value: ScenarioSourceRow): this {
    if (this.#sealed) throw new TypeError('LoadedScenarioSources is immutable');
    return super.set(key, value);
  }

  override delete(key: string): boolean {
    if (this.#sealed) throw new TypeError('LoadedScenarioSources is immutable');
    return super.delete(key);
  }

  override clear(): void {
    if (this.#sealed) throw new TypeError('LoadedScenarioSources is immutable');
    super.clear();
  }
}

export interface LoadScenarioSourcesOptions {
  bakedManifestUrl?: string;
  invalidCatalog?: 'fallback' | 'throw';
}

/**
 * Load and validate both selection catalogs. Missing/invalid source data either throws or returns an
 * explicitly labelled baked-only fallback; it never silently turns malformed metadata into an empty map.
 */
export async function loadScenarioSources(
  url: string = SOURCES_NDJSON_PATH,
  options: LoadScenarioSourcesOptions = {},
): Promise<LoadedScenarioSources> {
  const bakedUrl = options.bakedManifestUrl ?? bakedManifestUrlFor(url);
  const [catalogFetch, bakedFetch] = await Promise.allSettled([fetch(url, { cache: 'no-store' }), fetch(bakedUrl, { cache: 'no-store' })]);

  let bakedManifest: ValidatedBakedCorpusManifest | undefined;
  const issues: CatalogIssue[] = [];
  if (bakedFetch.status === 'fulfilled' && bakedFetch.value.ok) {
    try {
      const parsed = parseBakedCorpusManifest(await bakedFetch.value.json());
      issues.push(...parsed.issues);
      if (parsed.state === 'VALID') bakedManifest = parsed.manifest;
    } catch (error) {
      issues.push(loadIssue('BAKED_MANIFEST_PARSE_FAILED', errorMessage(error)));
    }
  } else {
    const detail = bakedFetch.status === 'rejected'
      ? errorMessage(bakedFetch.reason)
      : `HTTP ${bakedFetch.value.status}`;
    issues.push(loadIssue('BAKED_MANIFEST_LOAD_FAILED', detail));
  }

  let fallbackReason: { reasonCode: string; detail: string } | undefined;
  let catalog: ValidatedScenarioSourceCatalog | undefined;
  if (catalogFetch.status === 'rejected') {
    fallbackReason = { reasonCode: 'CATALOG_FETCH_FAILED', detail: errorMessage(catalogFetch.reason) };
  } else if (!catalogFetch.value.ok) {
    fallbackReason = {
      reasonCode: 'CATALOG_HTTP_ERROR',
      detail: `${url} returned HTTP ${catalogFetch.value.status}`,
    };
  } else {
    try {
      const parsed = parseScenarioSourceCatalog(await catalogFetch.value.text());
      issues.push(...parsed.issues);
      if (parsed.state === 'VALID') catalog = parsed.catalog;
      else {
        fallbackReason = {
          reasonCode: 'CATALOG_SCHEMA_INVALID',
          detail: parsed.issues.map((entry) => `[${entry.reasonCode}] ${entry.detail}`).join('; '),
        };
      }
    } catch (error) {
      fallbackReason = { reasonCode: 'CATALOG_PARSE_FAILED', detail: errorMessage(error) };
    }
  }

  if (!catalog && options.invalidCatalog === 'throw') {
    throw new SelectionPolicyError(
      fallbackReason?.reasonCode ?? 'CATALOG_UNAVAILABLE',
      fallbackReason?.detail ?? 'selection catalog unavailable',
    );
  }
  if (!catalog) {
    const reason = fallbackReason ?? { reasonCode: 'CATALOG_UNAVAILABLE', detail: 'selection catalog unavailable' };
    console.warn(`media-selection: baked-only fallback [${reason.reasonCode}] ${reason.detail}`);
    return new LoadedScenarioSources([], {
      catalogState: 'fallback',
      catalogReason: reason,
      ...(bakedManifest ? { bakedManifest } : {}),
      issues,
    });
  }
  const entries = [...scenarioSourceMap(catalog).entries()];
  return new LoadedScenarioSources(entries, {
    catalogState: 'ready',
    catalog,
    ...(bakedManifest ? { bakedManifest } : {}),
    issues,
  });
}

export interface BuildSelectionManifestOptions {
  scenarios: readonly Scenario[];
  catalog?: ValidatedScenarioSourceCatalog;
  bakedManifest: ValidatedBakedCorpusManifest;
  catalogFallbackReason?: { reasonCode: string; detail: string };
  rotate?: boolean;
  scenarioContractDigests?: ReadonlyMap<string, string> | Readonly<Record<string, string>>;
}

/** Build the canonical, deeply frozen per-run candidate manifest before engine construction. */
export function buildSelectionManifest(options: BuildSelectionManifestOptions): FrozenSelectionManifest {
  const catalogState: 'ready' | 'fallback' = options.catalog ? 'ready' : 'fallback';
  if (!options.catalog && !options.catalogFallbackReason) {
    throw new SelectionPolicyError('CATALOG_FALLBACK_REASON_REQUIRED', 'baked-only fallback requires a structured reason');
  }
  const sourceMap = options.catalog ? scenarioSourceMap(options.catalog) : new Map<string, ScenarioSourceRow>();
  const bakedMap = new Map(options.bakedManifest.assets.map((asset) => [asset.id, asset] as const));
  const pools = [...options.scenarios]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((scenario) => buildScenarioPool(
      scenario,
      sourceMap.get(scenario.id),
      bakedMap,
      {
        rotate: options.rotate,
        catalogState,
        scenarioContractDigest: contractDigestFor(options.scenarioContractDigests, scenario.id),
      },
    ));
  const identity = {
    schemaVersion: SELECTION_MANIFEST_SCHEMA_VERSION,
    catalogSchemaVersion: CATALOG_SCHEMA_VERSION,
    selectionPolicyVersion: SELECTION_POLICY_VERSION,
    selectionAlgorithmId: SELECTION_ALGORITHM_ID,
    catalogState,
    ...(options.catalogFallbackReason ? { catalogReason: options.catalogFallbackReason } : {}),
    ...(options.catalog ? { catalogSha256: options.catalog.catalogSha256 } : {}),
    bakedCorpusSchemaVersion: BAKED_CORPUS_SCHEMA_VERSION,
    bakedCorpusVersion: options.bakedManifest.corpusVersion,
    bakedCorpusDigest: options.bakedManifest.manifestSha256,
    pools,
  };
  return deepFreeze({ ...identity, manifestDigest: canonicalSha256(identity) });
}

interface PoolBuildOptions {
  rotate?: boolean;
  catalogState: 'ready' | 'fallback';
  scenarioContractDigest?: string;
}

function buildScenarioPool(
  scenario: Scenario,
  row: ScenarioSourceRow | undefined,
  bakedAssets: ReadonlyMap<string, BakedAssetRecord>,
  options: PoolBuildOptions,
): ScenarioCandidatePool {
  const rejections: CandidateRejection[] = [];
  const bases: Array<Omit<SelectionCandidateManifest, 'probability'>> = [];
  const baked = createBakedCandidate(scenario, bakedAssets, rejections);
  if (baked) bases.push(baked);

  const policyReason = rotationPolicyReason(scenario, row, options);
  if (policyReason) {
    if (row?.files.length) rejections.push(...row.files.map((file) => rejection(scenario.id, file.file, policyReason.reasonCode, policyReason.detail)));
  } else if (row) {
    // The sampling unit is unique content across the complete scenario pool, including the baked
    // fixture. A real row that repeats baked bytes must not gain a second HRW score/probability slot.
    const seenDigests = new Set(bases.map((candidate) => candidate.contentDigest));
    for (const file of row.files) {
      if (seenDigests.has(file.sha256)) {
        rejections.push(rejection(
          scenario.id,
          file.file,
          'CANDIDATE_DUPLICATE_CONTENT',
          `digest '${file.sha256}' is already one sampling unit`,
        ));
        continue;
      }
      seenDigests.add(file.sha256);
      const eligibility = assessCandidateEligibility(scenario, row, file, options.scenarioContractDigest);
      if (!eligibility.eligible) {
        rejections.push(eligibility.rejection);
        continue;
      }
      bases.push(createRealCandidate(scenario, row, file, eligibility.evidencePlan));
    }
  }

  const sortedBases = bases.sort((a, b) => a.candidateIdentity.localeCompare(b.candidateIdentity));
  const candidates = sortedBases.map((candidate) => ({
    ...candidate,
    probability: { numerator: 1, denominator: sortedBases.length, weight: 1 } as const,
  }));
  const eligiblePoolDigest = computeEligiblePoolDigest(scenario.id, candidates);
  return deepFreeze({
    scenarioId: scenario.id,
    eligiblePoolDigest,
    candidates,
    rejections: rejections.sort(compareRejections),
    eligible: candidates.length,
  });
}

function createBakedCandidate(
  scenario: Scenario,
  bakedAssets: ReadonlyMap<string, BakedAssetRecord>,
  rejections: CandidateRejection[],
): Omit<SelectionCandidateManifest, 'probability'> | undefined {
  const names = inputNames(scenario);
  const inputs: CandidateInputIdentity[] = [];
  const provenance: CandidateAcquisitionProvenance[] = [];
  for (const name of names) {
    const asset = bakedAssets.get(name);
    if (!asset) {
      rejections.push(rejection(scenario.id, name, 'BAKED_ASSET_IDENTITY_MISSING', `baked manifest has no verified '${name}'`));
      return undefined;
    }
    const logicalPath = `${SCENARIOS_URL_PREFIX}/${scenario.id}/${name}`;
    inputs.push({ id: name, urlAssetPath: logicalPath, logicalPath, sha256: asset.sha256, sizeBytes: asset.sizeBytes });
    provenance.push(bakedProvenance(logicalPath, asset));
  }
  const contentDigest = inputs.length === 1 ? inputs[0]!.sha256 : contentIdentityDigest(inputs);
  const evidencePlan = buildCandidateEvidencePlan(scenario, contentDigest);
  return {
    schemaVersion: 'selection-candidate@1',
    scenarioId: scenario.id,
    kind: 'baked',
    sourceClass: 'BAKED',
    selectedFile: names.length === 1 ? names[0]! : names.join('+'),
    inputs,
    contentDigest,
    candidateIdentity: candidateIdentity(scenario.id, inputs),
    integrity: 'DECLARED',
    evidencePlan,
    provenance,
  };
}

function createUnverifiedBakedCandidate(scenario: Scenario): Omit<SelectionCandidateManifest, 'probability'> {
  const names = inputNames(scenario);
  const inputs = names.map((name) => {
    const logicalPath = `${SCENARIOS_URL_PREFIX}/${scenario.id}/${name}`;
    return {
      id: name,
      urlAssetPath: logicalPath,
      logicalPath,
      sha256: sha256Hex(`UNVERIFIED-BAKED\u0000${scenario.id}\u0000${name}`),
      sizeBytes: 0,
    };
  });
  const contentDigest = inputs.length === 1 ? inputs[0]!.sha256 : contentIdentityDigest(inputs);
  return {
    schemaVersion: 'selection-candidate@1',
    scenarioId: scenario.id,
    kind: 'baked',
    sourceClass: 'BAKED',
    selectedFile: names.length === 1 ? names[0]! : names.join('+'),
    inputs,
    contentDigest,
    candidateIdentity: candidateIdentity(scenario.id, inputs),
    integrity: 'UNVERIFIED',
    evidencePlan: buildCandidateEvidencePlan(scenario, contentDigest),
    provenance: inputs.map((input) => ({
      entity: { logicalPath: input.logicalPath, sha256: input.sha256, sizeBytes: 0 },
      activity: { kind: 'unknown' },
    })),
  };
}

function createRealCandidate(
  scenario: Scenario,
  row: ScenarioSourceRow,
  file: SourceFileRecord,
  evidencePlan = buildCandidateEvidencePlan(scenario, file.sha256, file.evidence),
): Omit<SelectionCandidateManifest, 'probability'> {
  const logicalPath = `${SCENARIOS_URL_PREFIX}/${scenario.id}/${file.file}`;
  const input: CandidateInputIdentity = {
    id: logicalPath,
    urlAssetPath: logicalPath,
    logicalPath,
    sha256: file.sha256,
    sizeBytes: file.sizeBytes,
  };
  return {
    schemaVersion: 'selection-candidate@1',
    scenarioId: scenario.id,
    kind: 'real',
    sourceClass: row.class,
    selectedFile: file.file,
    inputs: [input],
    contentDigest: file.sha256,
    candidateIdentity: candidateIdentity(scenario.id, [input]),
    integrity: 'DECLARED',
    evidencePlan,
    provenance: [realProvenance(logicalPath, row, file)],
    sourceFile: file,
  };
}

function rotationPolicyReason(
  scenario: Scenario,
  row: ScenarioSourceRow | undefined,
  options: PoolBuildOptions,
): { reasonCode: string; detail: string } | undefined {
  if (options.rotate === false) return { reasonCode: 'ROTATION_DISABLED', detail: 'rotation is disabled' };
  if (options.catalogState === 'fallback') return { reasonCode: 'CATALOG_FALLBACK_BAKED_ONLY', detail: 'catalog is in baked-only fallback' };
  if (!row) return { reasonCode: 'CATALOG_SCENARIO_ROW_MISSING', detail: 'scenario has no catalog row' };
  if (row.class === 'SYNTHETIC') return { reasonCode: 'SYNTHETIC_ROW_BAKED_ONLY', detail: 'synthetic media is constructed by the fixture contract' };
  if (row.class === 'STREAMING') return { reasonCode: 'STREAMING_ROW_BAKED_ONLY', detail: 'stream graphs are fixture-bound' };
  if (row.files.length === 0) return { reasonCode: 'CATALOG_ROW_EMPTY', detail: 'catalog row has no candidates' };
  if (scenario.family === 'streaming-output') return { reasonCode: 'STREAMING_OUTPUT_BAKED_ONLY', detail: 'streaming-output topology is fixture-bound' };
  if (Array.isArray(scenario.input)) return { reasonCode: 'MULTI_INPUT_BAKED_ONLY', detail: 'no catalog bundle declares this ordered multi-input contract' };
  if (scenario.op === 'seek') return { reasonCode: 'SEEK_TARGET_FIXTURE_BOUND', detail: 'seek target is calibrated to the baked input' };
  if (row.class === 'DERIVED' && !isRotatableCencMp4(row)) {
    return { reasonCode: 'DERIVED_SCHEME_NOT_ROTATABLE', detail: 'derived row is not supported CENC-in-MP4' };
  }
  // Robustness is deliberately not blanket-excluded. Each variant is admitted only by
  // assessRobustnessVariantEligibility below, which requires an exact same-contract declaration.
  return undefined;
}

export type CandidateEligibility =
  | { eligible: true; evidencePlan: CandidateOracleEvidencePlan }
  | { eligible: false; rejection: CandidateRejection };

export function assessCandidateEligibility(
  scenario: Scenario,
  row: ScenarioSourceRow,
  file: SourceFileRecord,
  scenarioContractDigest?: string,
): CandidateEligibility {
  // Derived candidates must fail closed on their key/base/evidence tuple before the generic shape gate;
  // otherwise a missing key would be mislabeled as a codec/shape rejection instead of a CENC gap.
  if (row.class === 'DERIVED') {
    const derived = assessDerivedCencEligibility(scenario, file);
    if (!derived.eligible) return derived;
    const derivedShapeReason = shapeGateReason(file, row.requires, requiredMinDurationSec(scenario));
    return derivedShapeReason
      ? {
          eligible: false,
          rejection: rejection(scenario.id, file.file, 'CANDIDATE_INPUT_CONTRACT_MISMATCH', derivedShapeReason),
        }
      : derived;
  }
  const shapeReason = shapeGateReason(file, row.requires, requiredMinDurationSec(scenario));
  if (shapeReason) {
    return {
      eligible: false,
      rejection: rejection(scenario.id, file.file, 'CANDIDATE_INPUT_CONTRACT_MISMATCH', shapeReason),
    };
  }
  if (scenario.family === 'robustness') {
    return assessRobustnessVariantEligibility(scenario, file, scenarioContractDigest);
  }
  if (file.evidence && file.evidence.sourceSha256 !== file.sha256) {
    return {
      eligible: false,
      rejection: rejection(
        scenario.id,
        file.file,
        'CANDIDATE_EVIDENCE_DIGEST_MISMATCH',
        'candidate evidence declaration covers different source bytes',
      ),
    };
  }
  return { eligible: true, evidencePlan: buildCandidateEvidencePlan(scenario, file.sha256, file.evidence) };
}

/** Stable primitive for FEAT-76: arbitrary robustness bytes cannot enter the sampling pool. */
export function assessRobustnessVariantEligibility(
  scenario: Scenario,
  file: SourceFileRecord,
  scenarioContractDigest?: string,
): CandidateEligibility {
  const reject = (reasonCode: string, detail: string): CandidateEligibility => ({
    eligible: false,
    rejection: rejection(scenario.id, file.file, reasonCode, detail),
  });
  if (!scenarioContractDigest || !LOWER_SHA256.test(scenarioContractDigest)) {
    return reject('ROBUSTNESS_SCENARIO_CONTRACT_MISSING', 'runner/DSL did not supply a full scenario contract digest');
  }
  const contract = file.contract;
  if (!contract) return reject('ROBUSTNESS_VARIANT_CONTRACT_MISSING', 'candidate has no same-contract declaration');
  if (
    contract.kind !== 'robustness-variant' ||
    contract.scenarioId !== scenario.id ||
    contract.scenarioContractDigest !== scenarioContractDigest ||
    contract.sourceSha256 !== file.sha256
  ) {
    return reject('ROBUSTNESS_VARIANT_CONTRACT_MISMATCH', 'candidate contract is not digest-bound to this scenario and source');
  }
  if (!file.evidence || file.evidence.sourceSha256 !== file.sha256) {
    return reject('ROBUSTNESS_VARIANT_EVIDENCE_MISSING', 'candidate has no source-bound evidence declaration');
  }
  const evidencePlan = buildCandidateEvidencePlan(scenario, file.sha256, file.evidence);
  const available = new Set(file.evidence.available);
  const sufficientDeclared = evidencePlan.sufficientOracleSets.some((set) =>
    set.every((oracle) => evidencePlan.requirements
      .find((requirement) => requirement.oracle === oracle)?.needs.every((need) => available.has(need.kind)) === true));
  if (!sufficientDeclared) {
    return reject('ROBUSTNESS_VARIANT_EVIDENCE_INSUFFICIENT', 'declared evidence cannot satisfy any survivor set');
  }
  return { eligible: true, evidencePlan };
}

function assessDerivedCencEligibility(scenario: Scenario, file: SourceFileRecord): CandidateEligibility {
  const reject = (reasonCode: string, detail: string): CandidateEligibility => ({
    eligible: false,
    rejection: rejection(scenario.id, file.file, reasonCode, detail),
  });
  const keys = file.keys;
  if (
    !keys ||
    !CENC_128_BIT_HEX.test(keys.keyHex) ||
    !keys.kid ||
    !CENC_128_BIT_HEX.test(keys.kid) ||
    (keys.ivHex !== undefined && !CENC_IV_HEX.test(keys.ivHex)) ||
    !CENC_MP4_SCHEMES.has(keys.scheme)
  ) {
    return reject('CENC_KEY_MATERIAL_INCOMPLETE', 'CENC candidate needs scheme, keyHex, and kid');
  }
  const base = file.cleartextBase;
  if (!base || normalizeRelativePath(base.poolPath) !== base.poolPath || !LOWER_SHA256.test(base.sha256)) {
    return reject('CENC_CLEARTEXT_BASE_INCOMPLETE', 'CENC candidate needs a normalized base path and full base digest');
  }
  if (isProtectedProbeCencScenario(scenario)) {
    if (!(scenario.requires.encryption ?? []).some((scheme) => scheme === keys.scheme)) {
      return reject(
        'CENC_PROBE_SCHEME_MISMATCH',
        `protected probe candidate declares '${keys.scheme}' outside the scenario scheme contract`,
      );
    }
    const declaration = file.evidence;
    const available = new Set(declaration?.available ?? []);
    if (
      !declaration ||
      declaration.sourceSha256 !== file.sha256 ||
      !available.has('SOURCE_GOLDEN') ||
      !available.has('CANDIDATE_DECODE') ||
      !declaration.requiredOracles?.includes('golden-metadata') ||
      !declaration.sufficientOracleSets.some((set) => set.length === 1 && set[0] === 'golden-metadata')
    ) {
      return reject(
        'CENC_PROBE_EVIDENCE_INCOMPLETE',
        'protected probe candidate needs source-bound metadata and decoded semantic evidence',
      );
    }
    return {
      eligible: true,
      evidencePlan: buildCandidateEvidencePlan(scenario, file.sha256, declaration),
    };
  }
  if (!isPositiveSourceEquivalenceScenario(scenario)) {
    return reject(
      'DERIVED_ROTATION_SCENARIO_NOT_POSITIVE',
      'DERIVED CENC rotation cannot rewrite fixed-semantics or negative scenarios',
    );
  }
  const rotation = assessDerivedEncryptionRotation(scenario, {
    sourceId: file.file,
    sourceSha256: file.sha256,
    scheme: keys.scheme as 'cenc-ctr' | 'cenc-cens' | 'cenc-cbcs',
    key: {
      keyHex: keys.keyHex,
      kid: keys.kid,
      ...(keys.ivHex ? { ivHex: keys.ivHex } : {}),
    },
    cleartextBaseAsset: base.poolPath,
    cleartextBaseSha256: base.sha256,
  });
  if (rotation.state === 'INELIGIBLE') return reject(rotation.reasonCode, rotation.detail);
  const declaration = file.evidence;
  const survivor = declaration?.metamorphicSurvivor;
  if (
    !declaration ||
    declaration.sourceSha256 !== file.sha256 ||
    !survivor ||
    survivor.oracle !== 'property-invariant' ||
    survivor.invariant !== DECRYPT_METAMORPHIC_INVARIANT ||
    survivor.cleartextBaseSha256 !== base.sha256 ||
    !declaration.available.includes('METAMORPHIC_PEER') ||
    !declaration.sufficientOracleSets.some((set) => set.length === 1 && set[0] === 'property-invariant')
  ) {
    return reject('CENC_METAMORPHIC_EVIDENCE_INCOMPLETE', 'CENC candidate lacks its own source/base-bound survivor invariant');
  }
  return { eligible: true, evidencePlan: buildCandidateEvidencePlan(scenario, file.sha256, declaration, ['property-invariant']) };
}

export function buildCandidateEvidencePlan(
  scenario: Scenario,
  sourceSha256: string,
  declaration?: CandidateEvidenceDeclaration,
  forcedOracles?: readonly OracleId[],
): CandidateOracleEvidencePlan {
  const declaredOracles = forcedOracles ? [...forcedOracles] : [...scenario.oracles];
  const declaredSet = new Set(declaredOracles);
  const requiredOracles = declaration?.requiredOracles?.length
    ? declaration.requiredOracles.filter((oracle) => declaredSet.has(oracle))
    : declaredOracles;
  const sufficientOracleSets = declaration?.sufficientOracleSets?.length
    ? declaration.sufficientOracleSets
      .map((set) => [...new Set(set.filter((oracle) => declaredSet.has(oracle)))].sort())
      .filter((set) => set.length > 0)
    : declaredOracles.length > 0
      ? [[...declaredOracles].sort()]
      : [];
  const required = new Set(requiredOracles);
  const requirements = declaredOracles
    .map((oracle): OracleEvidenceRequirement => ({
      oracle,
      role: required.has(oracle) ? 'REQUIRED' : 'SUPPLEMENTAL',
      needs: oracleEvidenceNeeds(oracle, sourceSha256, declaration),
    }))
    .sort((a, b) => a.oracle.localeCompare(b.oracle));
  const identity = {
    schemaVersion: 'candidate-oracle-evidence@1' as const,
    sourceSha256,
    requirements,
    requiredOracles: [...requiredOracles].sort(),
    sufficientOracleSets: sufficientOracleSets.sort(compareOracleSets),
    declaredAvailable: [...(declaration?.available ?? [])].sort(),
  };
  return deepFreeze({ ...identity, contractDigest: canonicalSha256(identity) });
}

function oracleEvidenceNeeds(
  oracle: OracleId,
  sourceSha256: string,
  declaration?: CandidateEvidenceDeclaration,
): OracleEvidenceNeed[] {
  const baseSha = declaration?.metamorphicSurvivor?.cleartextBaseSha256;
  if (oracle === 'reference-reimport') return [{ kind: 'REFERENCE_REIMPORT' }];
  if (oracle === 'playback-smoke') return [{ kind: 'BROWSER_CAPABILITY' }];
  if (oracle === 'mp4-box-layout' || oracle === 'webm-live-layout') return [{ kind: 'STRUCTURAL_OUTPUT' }];
  if (oracle === 'graceful-failure') return [{ kind: 'MALFORMED_REJECTION' }];
  if (oracle === 'property-invariant') {
    return [{ kind: 'METAMORPHIC_PEER', sourceSha256, ...(baseSha ? { peerSha256: baseSha } : {}) }];
  }
  if (GOLDEN_ORACLES.has(oracle)) {
    const needs: OracleEvidenceNeed[] = [{ kind: 'SOURCE_GOLDEN', sourceSha256 }];
    if (
      oracle === 'decoded-frames-bitexact' ||
      oracle === 'decoded-audio-pcm' ||
      oracle === 'ssim-psnr' ||
      oracle === 'fanout-renditions' ||
      oracle === 'alpha-plane' ||
      oracle === 'decrypt-bitexact'
    ) {
      needs.push({ kind: 'CANDIDATE_DECODE' }, { kind: 'BROWSER_CAPABILITY' });
    }
    return needs;
  }
  return [{ kind: 'STRUCTURAL_OUTPUT' }];
}

/** Typed sufficiency reduction; human-readable `detail` text is never inspected. */
export function evaluateCandidateEvidence(
  plan: CandidateOracleEvidencePlan,
  outcomes: readonly OracleOutcome[],
): CandidateEvidenceEvaluation {
  const byOracle = new Map(outcomes.map((outcome) => [outcome.oracle, outcome] as const));
  const applied = plan.requirements
    .filter((requirement) => byOracle.get(requirement.oracle)?.state === 'VERDICT')
    .map((requirement) => requirement.oracle);
  const unavailable: CandidateEvidenceUnavailable[] = [];
  for (const requirement of plan.requirements) {
    const outcome = byOracle.get(requirement.oracle);
    if (outcome?.state === 'UNAVAILABLE') {
      unavailable.push({ oracle: requirement.oracle, status: outcome.status, reasonCode: outcome.reasonCode });
    } else if (!outcome) {
      unavailable.push({ oracle: requirement.oracle, status: 'NA_ASSET', reasonCode: 'EVIDENCE_OUTCOME_MISSING' });
    }
  }
  const sufficientSet = plan.sufficientOracleSets.find((set) =>
    set.every((oracle) => byOracle.get(oracle)?.state === 'VERDICT'));
  const verdictOutcomes = outcomes.filter((outcome) => outcome.state === 'VERDICT');
  const reduction = reduceOracleOutcomes(outcomes);
  const base = {
    required: plan.requiredOracles,
    applied,
    unavailable,
    sufficientSurvivorOracles: sufficientSet ?? [],
    sufficient: sufficientSet !== undefined,
  };
  if (verdictOutcomes.some((outcome) => outcome.verdict === 'FAIL')) {
    return deepFreeze({ ...base, status: 'FAIL', reasonCode: 'EVIDENCE_VERDICT_FAIL' });
  }
  if (outcomes.some((outcome) => outcome.state === 'ERROR')) {
    return deepFreeze({ ...base, status: 'ERROR', reasonCode: 'EVIDENCE_ORACLE_ERROR' });
  }
  if (!sufficientSet) {
    const status = unavailable.length > 0 && unavailable.every((entry) => entry.status === 'NA_BROWSER')
      ? 'NA_BROWSER'
      : 'NA_ASSET';
    return deepFreeze({ ...base, status, reasonCode: 'EVIDENCE_NO_SUFFICIENT_SET' });
  }
  // Correctness is binary: a sufficient, non-failing evidence set is PASS (representational
  // differences are recorded on the underlying oracle outcomes, never as a distinct status).
  void reduction;
  return deepFreeze({ ...base, status: 'PASS', reasonCode: 'EVIDENCE_SUFFICIENT_PASS' });
}

export interface CandidateSelectionRequest {
  seed: string;
  expectedPoolDigest?: string;
  allowPoolDrift?: boolean;
  /** Durable explicit replay. The full recorded candidate snapshot remains usable after catalog drift. */
  replayCandidate?: SelectionCandidateManifest;
}

export interface CandidateReplayKey {
  scenarioId: string;
  candidateIdentity: string;
  inputs: readonly ContentIdentity[];
}

/** Durable replay identity persisted with a failure; it is independent of seed and live pool order. */
export function candidateReplayKey(candidate: SelectionCandidateManifest): CandidateReplayKey {
  return deepFreeze({
    scenarioId: candidate.scenarioId,
    candidateIdentity: candidate.candidateIdentity,
    inputs: candidate.inputs.map(({ logicalPath, sha256, sizeBytes }) => ({ logicalPath, sha256, sizeBytes })),
  });
}

export type CandidateSelectionDecision =
  | {
      state: 'SELECTED';
      candidate: SelectionCandidateManifest;
      score: string;
      seed: string;
      eligiblePoolDigest: string;
      candidateCount: number;
      replay: 'seed' | 'explicit';
    }
  | {
      state: 'EMPTY';
      eligible: 0;
      eligiblePoolDigest: string;
      issue: CandidateRejection;
    }
  | {
      state: 'POOL_MISMATCH';
      expectedPoolDigest: string;
      actualPoolDigest: string;
      reasonCode: 'SELECTION_POOL_DIGEST_MISMATCH';
    };

/** Order-independent highest-random-weight selection using SHA-256 integer comparison. */
export function selectCandidateFromPool(
  pool: ScenarioCandidatePool,
  request: CandidateSelectionRequest,
): CandidateSelectionDecision {
  if (
    request.expectedPoolDigest &&
    request.expectedPoolDigest !== pool.eligiblePoolDigest &&
    request.allowPoolDrift !== true &&
    !request.replayCandidate
  ) {
    return deepFreeze({
      state: 'POOL_MISMATCH',
      expectedPoolDigest: request.expectedPoolDigest,
      actualPoolDigest: pool.eligiblePoolDigest,
      reasonCode: 'SELECTION_POOL_DIGEST_MISMATCH',
    });
  }
  if (request.replayCandidate) {
    validateReplayCandidate(pool.scenarioId, request.replayCandidate);
    return deepFreeze({
      state: 'SELECTED',
      candidate: request.replayCandidate,
      score: candidateScore(request.seed, pool.scenarioId, request.replayCandidate.contentDigest),
      seed: request.seed,
      eligiblePoolDigest: pool.eligiblePoolDigest,
      candidateCount: pool.candidates.length,
      replay: 'explicit',
    });
  }
  if (pool.candidates.length === 0) {
    return deepFreeze({
      state: 'EMPTY',
      eligible: 0,
      eligiblePoolDigest: pool.eligiblePoolDigest,
      issue: rejection(pool.scenarioId, undefined, 'CORPUS_NO_VERIFIED_CANDIDATE', 'candidate pool is empty'),
    });
  }
  let selected = pool.candidates[0]!;
  let selectedScore = candidateScore(request.seed, pool.scenarioId, selected.contentDigest);
  for (let index = 1; index < pool.candidates.length; index++) {
    const candidate = pool.candidates[index]!;
    const score = candidateScore(request.seed, pool.scenarioId, candidate.contentDigest);
    if (score > selectedScore || (score === selectedScore && candidate.candidateIdentity < selected.candidateIdentity)) {
      selected = candidate;
      selectedScore = score;
    }
  }
  return deepFreeze({
    state: 'SELECTED',
    candidate: selected,
    score: selectedScore,
    seed: request.seed,
    eligiblePoolDigest: pool.eligiblePoolDigest,
    candidateCount: pool.candidates.length,
    replay: 'seed',
  });
}

export function candidateScore(seed: string, scenarioId: string, fullCandidateDigest: string): string {
  if (!LOWER_SHA256.test(fullCandidateDigest)) {
    throw new SelectionPolicyError('CANDIDATE_DIGEST_INVALID', 'HRW scoring requires a full lowercase SHA-256');
  }
  return sha256Hex(`${SELECTION_POLICY_VERSION}\u0000${seed}\u0000${scenarioId}\u0000${fullCandidateDigest}`);
}

export function computeEligiblePoolDigest(
  scenarioId: string,
  candidates: readonly Pick<SelectionCandidateManifest, 'candidateIdentity' | 'contentDigest' | 'probability'>[],
): string {
  return canonicalSha256({
    schema: 'eligible-pool@1',
    selectionPolicyVersion: SELECTION_POLICY_VERSION,
    scenarioId,
    candidates: [...candidates]
      .map((candidate) => ({
        candidateIdentity: candidate.candidateIdentity,
        contentDigest: candidate.contentDigest,
        weight: candidate.probability.weight,
      }))
      .sort((a, b) => a.candidateIdentity.localeCompare(b.candidateIdentity)),
  });
}

export function findScenarioPool(manifest: FrozenSelectionManifest, scenarioId: string): ScenarioCandidatePool | undefined {
  return manifest.pools.find((pool) => pool.scenarioId === scenarioId);
}

export interface SelectOptions {
  rotate?: boolean;
  bakedManifest?: ValidatedBakedCorpusManifest;
  scenarioContractDigests?: ReadonlyMap<string, string> | Readonly<Record<string, string>>;
  expectedPoolDigests?: ReadonlyMap<string, string> | Readonly<Record<string, string>>;
  allowPoolDrift?: boolean;
  replayCandidates?: ReadonlyMap<string, SelectionCandidateManifest> | Readonly<Record<string, SelectionCandidateManifest>>;
}

/** Existing runner surface, now backed by order-independent full-digest scoring. */
export function selectForRun(
  scenarios: Scenario[],
  runSeed: string,
  sources: ReadonlyMap<string, ScenarioSourceRow>,
  options: SelectOptions = {},
): Map<string, ScenarioSelection> {
  const out = new Map<string, ScenarioSelection>();
  for (const scenario of scenarios) {
    const pool = compatibilityPool(scenario, sources, options);
    const decision = selectCandidateFromPool(pool, {
      seed: runSeed,
      expectedPoolDigest: valueFor(options.expectedPoolDigests, scenario.id),
      allowPoolDrift: options.allowPoolDrift,
      replayCandidate: valueFor(options.replayCandidates, scenario.id),
    });
    if (decision.state === 'POOL_MISMATCH') {
      throw new SelectionPolicyError(decision.reasonCode, `expected ${decision.expectedPoolDigest}, got ${decision.actualPoolDigest}`);
    }
    if (decision.state === 'EMPTY') continue;
    out.set(scenario.id, makeSelection(scenario, decision.candidate, pool, decision.score, sources));
  }
  return out;
}

/** Exhaustive mode uses the same canonical set, independent of catalog enumeration order. */
export function candidatesForRun(
  scenarios: Scenario[],
  sources: ReadonlyMap<string, ScenarioSourceRow>,
  options: SelectOptions = {},
): Map<string, ScenarioSelection[]> {
  const out = new Map<string, ScenarioSelection[]>();
  for (const scenario of scenarios) {
    const pool = compatibilityPool(scenario, sources, options);
    out.set(scenario.id, pool.candidates.map((candidate) => makeSelection(scenario, candidate, pool, undefined, sources)));
  }
  return out;
}

function compatibilityPool(
  scenario: Scenario,
  sources: ReadonlyMap<string, ScenarioSourceRow>,
  options: SelectOptions,
): ScenarioCandidatePool {
  const loaded = sources instanceof LoadedScenarioSources ? sources : undefined;
  const bakedManifest = options.bakedManifest ?? loaded?.metadata.bakedManifest;
  if (bakedManifest) {
    return buildScenarioPool(
      scenario,
      sources.get(scenario.id),
      new Map(bakedManifest.assets.map((asset) => [asset.id, asset] as const)),
      {
        rotate: options.rotate,
        catalogState: loaded?.metadata.catalogState ?? 'ready',
        scenarioContractDigest: contractDigestFor(options.scenarioContractDigests, scenario.id),
      },
    );
  }
  if (loaded) {
    // A loader-originated catalog without a validated baked manifest must never manufacture a baked
    // identity. Real candidates may remain eligible; otherwise the pool is honestly empty/NA_ASSET.
    return buildScenarioPool(
      scenario,
      sources.get(scenario.id),
      new Map(),
      {
        rotate: options.rotate,
        catalogState: loaded.metadata.catalogState,
        scenarioContractDigest: contractDigestFor(options.scenarioContractDigests, scenario.id),
      },
    );
  }

  // Compatibility-only path for direct unit callers that did not provide the baked manifest. It is
  // visibly UNVERIFIED and cannot satisfy byte-integrity integration; the authoritative builder never
  // creates this placeholder.
  const rejections: CandidateRejection[] = [];
  const bases: Array<Omit<SelectionCandidateManifest, 'probability'>> = [createUnverifiedBakedCandidate(scenario)];
  const row = sources.get(scenario.id);
  const policyReason = rotationPolicyReason(scenario, row, {
    rotate: options.rotate,
    catalogState: 'ready',
    scenarioContractDigest: contractDigestFor(options.scenarioContractDigests, scenario.id),
  });
  if (!policyReason && row) {
    const seen = new Set<string>();
    for (const file of row.files) {
      if (!LOWER_SHA256.test(file.sha256)) {
        rejections.push(rejection(scenario.id, file.file, 'CANDIDATE_DIGEST_INVALID', 'candidate digest must be full lowercase SHA-256'));
        continue;
      }
      if (seen.has(file.sha256)) {
        rejections.push(rejection(scenario.id, file.file, 'CANDIDATE_DUPLICATE_CONTENT', 'duplicate content is one sampling unit'));
        continue;
      }
      seen.add(file.sha256);
      const eligibility = assessCandidateEligibility(
        scenario,
        row,
        file,
        contractDigestFor(options.scenarioContractDigests, scenario.id),
      );
      if (eligibility.eligible) bases.push(createRealCandidate(scenario, row, file, eligibility.evidencePlan));
      else rejections.push(eligibility.rejection);
    }
  }
  const sorted = bases.sort((a, b) => a.candidateIdentity.localeCompare(b.candidateIdentity));
  const candidates = sorted.map((candidate) => ({
    ...candidate,
    probability: { numerator: 1, denominator: sorted.length, weight: 1 } as const,
  }));
  return deepFreeze({
    scenarioId: scenario.id,
    eligiblePoolDigest: computeEligiblePoolDigest(scenario.id, candidates),
    candidates,
    rejections: rejections.sort(compareRejections),
    eligible: candidates.length,
  });
}

function makeSelection(
  scenario: Scenario,
  candidate: SelectionCandidateManifest,
  pool: ScenarioCandidatePool,
  score: string | undefined,
  sources: ReadonlyMap<string, ScenarioSourceRow>,
): ScenarioSelection {
  const isBaked = candidate.kind === 'baked';
  const resolvedInputs = candidate.inputs.map((input): ResolvedInput => ({
    id: input.id,
    urlAssetPath: input.urlAssetPath,
    // Both baked-manifest and catalog candidates are content-addressed declarations. UNVERIFIED is
    // a byte state, not permission to discard the identity needed to verify those bytes.
    sha256: input.sha256,
    sizeBytes: input.sizeBytes,
    integrity: 'DECLARED',
  }));
  const row = sources.get(scenario.id);
  const effectiveScenario = isBaked
    ? { ...scenario }
    : candidate.sourceClass === 'DERIVED' && candidate.sourceFile
      ? isProtectedProbeCencScenario(scenario)
        ? { ...scenario, input: candidate.inputs[0]!.id }
        : deriveCencEffectiveScenario(scenario, candidate.inputs[0]!.id, candidate.sourceFile)
      : { ...scenario, input: candidate.inputs[0]!.id };
  return {
    scenarioId: scenario.id,
    isBaked,
    selectedFile: candidate.selectedFile,
    selectedPath: candidate.inputs.map((input) => input.logicalPath).join('+'),
    selectedSha256: candidate.contentDigest,
    resolvedInputs,
    effectiveScenario,
    candidateCount: pool.candidates.length,
    shapeWarnings: pool.rejections
      .filter((entry) => entry.reasonCode === 'CANDIDATE_INPUT_CONTRACT_MISMATCH')
      .map((entry) => `${entry.scenarioId}: dropped ${entry.selectedFile ?? '?'} (${entry.detail})`),
    eligiblePoolDigest: pool.eligiblePoolDigest,
    executedInputDigest: contentIdentityDigest(candidate.inputs),
    candidateIdentity: candidate.candidateIdentity,
    selectionPolicyVersion: SELECTION_POLICY_VERSION,
    selectionAlgorithmId: SELECTION_ALGORITHM_ID,
    ...(score ? { score } : {}),
    probability: candidate.probability,
    evidencePlan: candidate.evidencePlan,
    rejections: pool.rejections,
    ...(sources instanceof LoadedScenarioSources
      ? {
          catalogState: sources.metadata.catalogState,
          ...(sources.metadata.catalogReason ? { catalogReason: sources.metadata.catalogReason } : {}),
        }
      : {}),
  };
}

function deriveCencEffectiveScenario(scenario: Scenario, id: string, file: SourceFileRecord): Scenario {
  const keys = file.keys!;
  const base = file.cleartextBase!;
  const provenance = encryptionKeyProvenanceFromOptions(scenario.options);
  if (!provenance || !isPositiveSourceEquivalenceScenario(scenario)) {
    throw new SelectionPolicyError(
      'DERIVED_ROTATION_SCENARIO_NOT_POSITIVE',
      `scenario '${scenario.id}' cannot be rewritten to DERIVED CENC input`,
    );
  }
  const options: Record<string, unknown> = {
    ...((scenario.options ?? {}) as Record<string, unknown>),
    scheme: keys.scheme,
    key: {
      keyHex: keys.keyHex,
      kid: keys.kid,
      ...(keys.ivHex ? { ivHex: keys.ivHex } : {}),
      ...(keys.keyUri ? { keyUri: keys.keyUri } : {}),
      // The catalog candidate, not the baked key record, is authoritative for this selected source.
      // Runner preflight revalidates this exact source/base/key tuple before admitting the stripped key.
      provenance: {
        schema: provenance.schema,
        assetId: id,
        scheme: keys.scheme,
        use: 'authoritative-positive',
        rotationPolicy: 'positive-source-equivalence',
      },
    },
    invariant: DECRYPT_METAMORPHIC_INVARIANT,
    cleartextBaseAsset: `${SCENARIOS_URL_PREFIX}/${base.poolPath}`,
    cleartextBaseSha256: base.sha256,
    ...(base.sizeBytes !== undefined ? { cleartextBaseSizeBytes: base.sizeBytes } : {}),
    ...(typeof file.durationSec === 'number' && Number.isFinite(file.durationSec)
      ? { selectedDurationSec: file.durationSec }
      : {}),
    candidateSourceSha256: file.sha256,
  };
  delete options.cleartextAsset;
  delete options.cleartextAssetId;
  delete options.goldenAsset;
  delete options.goldenAssetId;
  // The derived candidate is eligible only for this exact source/base-bound invariant. Supplemental
  // baked-twin oracles are not carried across the selection boundary.
  return { ...scenario, input: id, options, oracles: ['property-invariant'] };
}

/** Full-digest cache tag. Baked and real identities share the same collision-resistant contract. */
export function selectionCacheTag(selection: ScenarioSelection): string {
  const digest = selection.executedInputDigest ?? (
    selection.selectedSha256 && LOWER_SHA256.test(selection.selectedSha256)
      ? selection.selectedSha256
      : canonicalSha256({
          schema: 'unverified-selection@1',
          scenarioId: selection.scenarioId,
          selectedFile: selection.selectedFile,
          selectedSha256: selection.selectedSha256 ?? null,
          isBaked: selection.isBaked,
        })
  );
  return `sha256:${digest}`;
}

export function exhaustiveSelectionCacheTag(selections: readonly ScenarioSelection[]): string {
  return `set-sha256:${canonicalSha256({
    schema: 'exhaustive-selection@1',
    inputs: selections
      .map((selection) => selection.executedInputDigest ?? selectionCacheTag(selection).slice('sha256:'.length))
      .sort(),
  })}`;
}

/** Full canonical digest over exactly executed inputs (legacy name retained for RunEnv compatibility). */
export function computeCorpusChecksum(selections: Iterable<ScenarioSelection>): string {
  const rows = [...selections].map((selection) => ({
    scenarioId: selection.scenarioId,
    executedInputDigest: selection.executedInputDigest ?? selectionCacheTag(selection).slice('sha256:'.length),
  }));
  rows.sort((a, b) => a.scenarioId.localeCompare(b.scenarioId) || a.executedInputDigest.localeCompare(b.executedInputDigest));
  return canonicalSha256({ schema: 'executed-corpus@1', rows });
}

export function computeEligiblePoolsDigest(selections: Iterable<ScenarioSelection>): string {
  const pools = [...selections]
    .map((selection) => ({ scenarioId: selection.scenarioId, eligiblePoolDigest: selection.eligiblePoolDigest ?? '' }))
    .sort((a, b) => a.scenarioId.localeCompare(b.scenarioId));
  return canonicalSha256({ schema: 'eligible-pools@1', pools });
}

export class SelectionPolicyError extends Error {
  readonly reasonCode: string;

  constructor(reasonCode: string, message: string) {
    super(`[${reasonCode}] ${message}`);
    this.name = 'SelectionPolicyError';
    this.reasonCode = reasonCode;
  }
}

function shapeGateReason(
  file: SourceFileRecord,
  requires: ScenarioSourceRow['requires'],
  minDurationSec: number,
): string | undefined {
  if (file.container.toLowerCase() !== requires.container.toLowerCase()) {
    return `container '${file.container}' != required '${requires.container}'`;
  }
  for (const codec of requires.videoCodecs) {
    if (!file.videoCodecs.includes(codec)) return `missing video codec '${codec}'`;
  }
  for (const codec of requires.audioCodecs) {
    if (!file.audioCodecs.includes(codec)) return `missing audio codec '${codec}'`;
  }
  if (!requires.video && requires.audioCodecs.length > 0 && file.videoCodecs.length > 0) {
    return `audio-only scenario but file carries video [${file.videoCodecs.join(', ')}]`;
  }
  if (requires.encryption?.length) {
    if (!file.keys?.scheme || !requires.encryption.includes(file.keys.scheme)) {
      return `encryption scheme '${file.keys?.scheme ?? 'none'}' not in [${requires.encryption.join(', ')}]`;
    }
  }
  if (minDurationSec > 0) {
    const duration = typeof file.durationSec === 'number' && Number.isFinite(file.durationSec)
      ? file.durationSec
      : undefined;
    if (duration === undefined || duration < minDurationSec + 0.02) {
      return `duration ${duration ?? 'unknown'}s too short for ${minDurationSec.toFixed(3)}s target`;
    }
  }
  return undefined;
}

function requiredMinDurationSec(scenario: Scenario): number {
  const options = (scenario.options ?? {}) as Record<string, unknown>;
  const finite = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  if (scenario.op === 'trim') {
    const range = isRecord(options.range) ? options.range : {};
    return Math.max(finite(range.startUs) ?? finite(options.startUs) ?? 0, finite(range.endUs) ?? finite(options.endUs) ?? 0) / 1e6;
  }
  if (scenario.op === 'seek') return Math.max(0, finite(options.tUs) ?? 0) / 1e6;
  return 0;
}

function isRotatableCencMp4(row: ScenarioSourceRow): boolean {
  if (row.requires.container !== 'mp4') return false;
  return row.files.some((file) => file.keys?.scheme !== undefined && CENC_MP4_SCHEMES.has(file.keys.scheme));
}

function isProtectedProbeCencScenario(scenario: Scenario): boolean {
  return scenario.family === 'probe' &&
    scenario.op === 'probe' &&
    (scenario.requires.encryption ?? []).some((scheme) => CENC_MP4_SCHEMES.has(scheme));
}

function candidateIdentity(scenarioId: string, inputs: readonly ContentIdentity[]): string {
  return canonicalSha256({ schema: 'selection-candidate-identity@1', scenarioId, inputs });
}

function validateReplayCandidate(scenarioId: string, candidate: SelectionCandidateManifest): void {
  if (candidate.scenarioId !== scenarioId) {
    throw new SelectionPolicyError('REPLAY_SCENARIO_MISMATCH', `recorded candidate belongs to '${candidate.scenarioId}'`);
  }
  const expectedContentDigest = candidate.inputs.length === 1
    ? candidate.inputs[0]!.sha256
    : contentIdentityDigest(candidate.inputs);
  const { contractDigest, ...evidenceIdentity } = candidate.evidencePlan;
  if (
    !LOWER_SHA256.test(candidate.contentDigest) ||
    candidate.contentDigest !== expectedContentDigest ||
    candidate.candidateIdentity !== candidateIdentity(scenarioId, candidate.inputs) ||
    candidate.evidencePlan.sourceSha256 !== candidate.contentDigest ||
    contractDigest !== canonicalSha256(evidenceIdentity)
  ) {
    throw new SelectionPolicyError('REPLAY_IDENTITY_INVALID', 'recorded candidate identity is not internally coherent');
  }
}

function bakedProvenance(logicalPath: string, asset: BakedAssetRecord): CandidateAcquisitionProvenance {
  const kind = asset.source === 'generated'
    ? 'generated'
    : asset.source === 'fetched' || asset.source === 'captured'
      ? 'retrieved'
      : asset.source === 'provided'
        ? 'provided'
        : 'unknown';
  return deepFreeze({
    entity: {
      logicalPath,
      sha256: asset.sha256,
      sizeBytes: asset.sizeBytes,
      ...(asset.sourceUrl ? { sourceUrl: asset.sourceUrl } : {}),
    },
    activity: {
      kind,
      ...(asset.acquire ? { tool: asset.acquire } : {}),
      ...(asset.genMethod ? { command: asset.genMethod } : {}),
    },
  });
}

function realProvenance(
  logicalPath: string,
  row: ScenarioSourceRow,
  file: SourceFileRecord,
): CandidateAcquisitionProvenance {
  return deepFreeze({
    entity: {
      logicalPath,
      sha256: file.sha256,
      sizeBytes: file.sizeBytes,
      ...(file.downloadUrl ? { sourceUrl: file.downloadUrl } : {}),
      ...(file.license ? { license: file.license } : {}),
    },
    activity: {
      kind: row.class === 'DERIVED' ? 'derived' : 'retrieved',
      ...(file.provider ? { provider: file.provider } : file.cleartextBase?.provider ? { provider: file.cleartextBase.provider } : {}),
      ...(file.probedWith ? { tool: file.probedWith } : {}),
      ...(file.derivation ? { command: file.derivation } : {}),
    },
    ...(file.cleartextBase
      ? { derivation: { inputSha256: file.cleartextBase.sha256, outputSha256: file.sha256 } }
      : {}),
  });
}

function rejection(
  scenarioId: string,
  selectedFile: string | undefined,
  reasonCode: string,
  detail: string,
): CandidateRejection {
  return { scenarioId, ...(selectedFile ? { selectedFile } : {}), reasonCode, detail, status: 'NA_ASSET' };
}

function compareRejections(a: CandidateRejection, b: CandidateRejection): number {
  return (a.selectedFile ?? '').localeCompare(b.selectedFile ?? '') || a.reasonCode.localeCompare(b.reasonCode) || a.detail.localeCompare(b.detail);
}

function compareOracleSets(a: readonly OracleId[], b: readonly OracleId[]): number {
  return a.join('\u0000').localeCompare(b.join('\u0000'));
}

function inputNames(scenario: Scenario): string[] {
  return Array.isArray(scenario.input) ? [...scenario.input] : [scenario.input];
}

function contractDigestFor(
  source: ReadonlyMap<string, string> | Readonly<Record<string, string>> | undefined,
  scenarioId: string,
): string | undefined {
  return valueFor(source, scenarioId);
}

function valueFor<T>(source: ReadonlyMap<string, T> | Readonly<Record<string, T>> | undefined, key: string): T | undefined {
  if (!source) return undefined;
  const maybeMap = source as ReadonlyMap<string, T>;
  if (typeof maybeMap.get === 'function') return maybeMap.get(key);
  return (source as Readonly<Record<string, T>>)[key];
}

function bakedManifestUrlFor(catalogUrl: string): string {
  try {
    const base = new URL(catalogUrl, globalThis.location?.href ?? 'http://localhost/');
    return new URL(BAKED_MANIFEST_PATH, base).href;
  } catch {
    return BAKED_MANIFEST_PATH;
  }
}

function loadIssue(reasonCode: string, detail: string): CatalogIssue {
  return { severity: 'ERROR', reasonCode, detail };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
