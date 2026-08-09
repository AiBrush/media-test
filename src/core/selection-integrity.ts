/**
 * Runtime validation, canonical identities, and byte-integrity primitives for media selection.
 * This module is deliberately engine-free: callers construct and verify the selection plan before
 * adapter construction, then pass only `VERIFIED` bytes across the engine boundary.
 */

import type { CandidateInputEnvelope, OracleId } from './scenario.ts';
import { Sha256, sha256Hex } from './seeded-rng.ts';

export const CATALOG_SCHEMA_VERSION = 'media-candidate-catalog@1' as const;
export const BAKED_CORPUS_SCHEMA_VERSION = 'baked-corpus@1' as const;
export const SELECTION_POLICY_VERSION = 'canonical-candidate@1' as const;
export const SELECTION_ALGORITHM_ID = 'candidate-identity-lexicographic-min-v1' as const;
export const SELECTION_MANIFEST_SCHEMA_VERSION = 'media-selection-manifest@1' as const;

export type SourceClass = 'REAL' | 'SYNTHETIC' | 'STREAMING' | 'DERIVED';
export type EvidenceNeedKind =
  | 'SOURCE_GOLDEN'
  | 'CANDIDATE_DECODE'
  | 'REFERENCE_REIMPORT'
  | 'METAMORPHIC_PEER'
  | 'BROWSER_CAPABILITY'
  | 'STRUCTURAL_OUTPUT'
  | 'MALFORMED_REJECTION';

export interface CandidateEvidenceDeclaration {
  /** Exact candidate bytes this declaration covers. */
  sourceSha256: string;
  /** Evidence known to be obtainable for this candidate before an engine is called. */
  available: EvidenceNeedKind[];
  /** Any one complete set is enough to render a semantic verdict. */
  sufficientOracleSets: OracleId[][];
  /** Oracles whose absence cannot be rescued by a merely supplemental oracle. */
  requiredOracles?: OracleId[];
  /** Required for a derived CENC candidate. */
  metamorphicSurvivor?: {
    oracle: 'property-invariant';
    invariant: string;
    cleartextBaseSha256: string;
  };
}

export interface CandidateContractDeclaration {
  scenarioId: string;
  /** Full scenario-definition/contract digest supplied by the DSL owner. */
  scenarioContractDigest: string;
  /** Exact candidate bytes to which the contract declaration applies. */
  sourceSha256: string;
  kind?: 'same-contract' | 'robustness-variant';
}

export interface SourceKeyRecord {
  keyHex: string;
  kid?: string;
  ivHex?: string;
  keyUri?: string;
  scheme: string;
  ivMode?: string;
}

export interface CleartextBaseRecord {
  poolPath: string;
  sha256: string;
  sizeBytes?: number;
  provider?: string;
  sourcePageUrl?: string;
  downloadUrl?: string;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
}

/** One normalized real/derived catalog candidate. Unknown fields are rejected by the parser. */
export interface SourceFileRecord {
  file: string;
  container: string;
  videoCodecs: string[];
  audioCodecs: string[];
  sha256: string;
  sizeBytes: number;
  durationSec?: number | null;
  width?: number | null;
  height?: number | null;
  majorBrand?: string | null;
  nativeProperty?: string | null;
  provider?: string;
  sourcePageUrl?: string;
  downloadUrl?: string;
  license?: string;
  poolPath?: string;
  probedWith?: string;
  keys?: SourceKeyRecord;
  cleartextBase?: CleartextBaseRecord;
  derivation?: string;
  hlsFiles?: string[];
  evidence?: CandidateEvidenceDeclaration;
  contract?: CandidateContractDeclaration;
}

export interface ScenarioSourceRequirements extends CandidateInputEnvelope {
  container: string;
  video: boolean;
  videoCodecs: string[];
  audioCodecs: string[];
  encryption?: string[] | null;
}

export interface ScenarioSourceRow {
  scenarioId: string;
  requires: ScenarioSourceRequirements;
  class: SourceClass;
  files: SourceFileRecord[];
  reason?: string;
  note?: string;
}

export interface CatalogIssue {
  severity: 'ERROR' | 'WARNING';
  reasonCode: string;
  detail: string;
  line?: number;
  scenarioId?: string;
  path?: string;
}

export interface ValidatedScenarioSourceCatalog {
  schemaVersion: typeof CATALOG_SCHEMA_VERSION;
  catalogSha256: string;
  rows: readonly ScenarioSourceRow[];
}

export type CatalogValidationResult =
  | { state: 'VALID'; catalog: ValidatedScenarioSourceCatalog; issues: readonly CatalogIssue[] }
  | { state: 'INVALID'; issues: readonly CatalogIssue[]; parsedCatalogSha256?: string };

export interface BakedAssetRecord {
  id: string;
  sha256: string;
  sizeBytes: number;
  source: string;
  family?: string;
  container?: string;
  codecs?: string[];
  sizeBucket?: string;
  declaredExtension?: string;
  expectedSizeBytes?: number;
  sourceUrl?: string;
  acquire?: string;
  genMethod?: string;
  notes?: string;
}

export interface ValidatedBakedCorpusManifest {
  schemaVersion: typeof BAKED_CORPUS_SCHEMA_VERSION;
  corpusVersion: string;
  manifestSha256: string;
  assets: readonly BakedAssetRecord[];
}

export type BakedManifestValidationResult =
  | { state: 'VALID'; manifest: ValidatedBakedCorpusManifest; issues: readonly CatalogIssue[] }
  | { state: 'INVALID'; issues: readonly CatalogIssue[] };

const SOURCE_CLASSES = new Set<SourceClass>(['REAL', 'SYNTHETIC', 'STREAMING', 'DERIVED']);
const SOURCE_ROW_KEYS = new Set(['scenarioId', 'requires', 'class', 'files', 'reason', 'note']);
const REQUIRES_KEYS = new Set([
  'container',
  'video',
  'videoCodecs',
  'audioCodecs',
  'encryption',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  'minDurationSec',
  'maxDurationSec',
]);
const SOURCE_FILE_KEYS = new Set([
  'file',
  'container',
  'videoCodecs',
  'audioCodecs',
  'sha256',
  'sizeBytes',
  'durationSec',
  'width',
  'height',
  'majorBrand',
  'nativeProperty',
  'provider',
  'sourcePageUrl',
  'downloadUrl',
  'license',
  'poolPath',
  'probedWith',
  'keys',
  'cleartextBase',
  'derivation',
  'hlsFiles',
  'evidence',
  'contract',
]);
const KEY_KEYS = new Set(['keyHex', 'kid', 'ivHex', 'keyUri', 'scheme', 'ivMode']);
const BASE_KEYS = new Set([
  'poolPath',
  'sha256',
  'sizeBytes',
  'provider',
  'sourcePageUrl',
  'downloadUrl',
  'width',
  'height',
  'durationSec',
]);
const EVIDENCE_KEYS = new Set([
  'sourceSha256',
  'available',
  'sufficientOracleSets',
  'requiredOracles',
  'metamorphicSurvivor',
]);
const METAMORPHIC_KEYS = new Set(['oracle', 'invariant', 'cleartextBaseSha256']);
const CONTRACT_KEYS = new Set(['scenarioId', 'scenarioContractDigest', 'sourceSha256', 'kind']);
const EVIDENCE_NEEDS = new Set<EvidenceNeedKind>([
  'SOURCE_GOLDEN',
  'CANDIDATE_DECODE',
  'REFERENCE_REIMPORT',
  'METAMORPHIC_PEER',
  'BROWSER_CAPABILITY',
  'STRUCTURAL_OUTPUT',
  'MALFORMED_REJECTION',
]);
const ORACLE_IDS = new Set<OracleId>([
  'golden-metadata',
  'golden-packets',
  'decoded-frames-bitexact',
  'decoded-audio-pcm',
  'reference-reimport',
  'playback-smoke',
  'ssim-psnr',
  'average-bitrate',
  'mp4-box-layout',
  'webm-live-layout',
  'fanout-renditions',
  'alpha-plane',
  'seek-accuracy',
  'trim-boundaries',
  'decrypt-bitexact',
  'graceful-failure',
  'property-invariant',
]);
const LOWER_SHA256 = /^[0-9a-f]{64}$/;
const LOWER_HEX = /^[0-9a-f]+$/;

/** Canonical JSON with lexicographically sorted object keys and strict JSON-domain values. */
export function canonicalJson(value: unknown): string {
  const active = new Set<object>();
  const encode = (item: unknown, inArray: boolean): string | undefined => {
    if (item === null) return 'null';
    if (typeof item === 'string' || typeof item === 'boolean') return JSON.stringify(item);
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new TypeError('canonicalJson rejects non-finite numbers');
      return JSON.stringify(Object.is(item, -0) ? 0 : item);
    }
    if (item === undefined) {
      if (inArray) throw new TypeError('canonicalJson rejects undefined array entries');
      return undefined;
    }
    if (typeof item !== 'object') throw new TypeError(`canonicalJson rejects ${typeof item}`);
    if (active.has(item)) throw new TypeError('canonicalJson rejects cyclic values');
    active.add(item);
    try {
      if (Array.isArray(item)) {
        return `[${item.map((entry) => encode(entry, true)).join(',')}]`;
      }
      const prototype = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError('canonicalJson accepts only arrays and plain objects');
      }
      const record = item as Record<string, unknown>;
      const pairs: string[] = [];
      for (const key of Object.keys(record).sort()) {
        const encoded = encode(record[key], false);
        if (encoded !== undefined) pairs.push(`${JSON.stringify(key)}:${encoded}`);
      }
      return `{${pairs.join(',')}}`;
    } finally {
      active.delete(item);
    }
  };
  const encoded = encode(value, false);
  if (encoded === undefined) throw new TypeError('canonicalJson root cannot be undefined');
  return encoded;
}

export function canonicalSha256(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

/** Recursively freeze a JSON-like selection contract. */
export function deepFreeze<T>(value: T): T {
  const seen = new Set<object>();
  const visit = (item: unknown): void => {
    if (item === null || typeof item !== 'object' || seen.has(item)) return;
    if (ArrayBuffer.isView(item) || item instanceof ArrayBuffer || (typeof Blob !== 'undefined' && item instanceof Blob)) {
      return;
    }
    seen.add(item);
    for (const child of Object.values(item as Record<string, unknown>)) visit(child);
    Object.freeze(item);
  };
  visit(value);
  return value;
}

/** Parse and validate the complete NDJSON catalog. Invalid input never produces a partial catalog. */
export function parseScenarioSourceCatalog(text: string): CatalogValidationResult {
  const issues: CatalogIssue[] = [];
  const rows: ScenarioSourceRow[] = [];
  const rawRows: unknown[] = [];
  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(trimmed) as unknown;
      rawRows.push(raw);
    } catch (error) {
      issues.push(issue('CATALOG_JSON_PARSE', `line ${index + 1}: ${errorMessage(error)}`, { line: index + 1 }));
      continue;
    }
    const row = validateSourceRow(raw, index + 1, issues);
    if (row) rows.push(row);
  }

  const ids = new Map<string, number>();
  for (const row of rows) {
    const previous = ids.get(row.scenarioId);
    if (previous !== undefined) {
      issues.push(issue('CATALOG_DUPLICATE_SCENARIO_ID', `duplicate scenarioId '${row.scenarioId}'`, {
        line: previous,
        scenarioId: row.scenarioId,
      }));
    } else {
      ids.set(row.scenarioId, 1);
    }
    diagnoseCandidateDuplicates(row, issues);
  }

  const sortedIssues = sortIssues(issues);
  if (sortedIssues.some((entry) => entry.severity === 'ERROR')) {
    let parsedCatalogSha256: string | undefined;
    try {
      parsedCatalogSha256 = canonicalSha256(rawRows);
    } catch {
      // Invalid JSON-domain data is already represented by a schema issue.
    }
    return deepFreeze({
      state: 'INVALID',
      issues: sortedIssues,
      ...(parsedCatalogSha256 ? { parsedCatalogSha256 } : {}),
    });
  }

  const normalizedRows = rows
    .map(normalizeSourceRow)
    .sort((a, b) => a.scenarioId.localeCompare(b.scenarioId));
  const catalogSha256 = canonicalSha256({ schemaVersion: CATALOG_SCHEMA_VERSION, rows: normalizedRows });
  return deepFreeze({
    state: 'VALID',
    catalog: {
      schemaVersion: CATALOG_SCHEMA_VERSION,
      catalogSha256,
      rows: normalizedRows,
    },
    issues: sortedIssues,
  });
}

/** Validate fixtures/manifest.json without mutating or depending on its on-disk representation. */
export function parseBakedCorpusManifest(value: unknown): BakedManifestValidationResult {
  const issues: CatalogIssue[] = [];
  if (!isRecord(value)) {
    return deepFreeze({ state: 'INVALID', issues: [issue('BAKED_MANIFEST_NOT_OBJECT', 'baked manifest must be an object')] });
  }
  rejectUnknownKeys(value, new Set(['$schema', 'suiteCorpusVersion', 'assets']), 'baked manifest', issues);
  const corpusVersion = stringField(value, 'suiteCorpusVersion', 'baked manifest', issues);
  const rawAssets = value.assets;
  if (!Array.isArray(rawAssets)) issues.push(issue('BAKED_ASSETS_NOT_ARRAY', 'baked manifest assets must be an array'));
  const assets: BakedAssetRecord[] = [];
  const ids = new Set<string>();
  for (const [index, raw] of (Array.isArray(rawAssets) ? rawAssets : []).entries()) {
    const path = `assets[${index}]`;
    if (!isRecord(raw)) {
      issues.push(issue('BAKED_ASSET_NOT_OBJECT', `${path} must be an object`, { path }));
      continue;
    }
    rejectUnknownKeys(raw, new Set([
      'id', 'family', 'container', 'codecs', 'source', 'sizeBucket', 'genMethod', 'sha256', 'sizeBytes',
      'notes', 'sourceUrl', 'acquire', 'declaredExtension', 'expectedSizeBytes',
    ]), path, issues);
    const id = normalizedPathField(raw, 'id', path, issues);
    const sha256 = shaField(raw, 'sha256', path, issues);
    const sizeBytes = safeSizeField(raw, 'sizeBytes', path, issues);
    const source = stringField(raw, 'source', path, issues);
    if (!id || !sha256 || sizeBytes === undefined || !source) continue;
    if (ids.has(id)) issues.push(issue('BAKED_DUPLICATE_ASSET_ID', `duplicate baked asset id '${id}'`, { path: id }));
    ids.add(id);
    assets.push({
      id,
      sha256,
      sizeBytes,
      source,
      ...optionalStringProps(raw, ['family', 'container', 'sizeBucket', 'declaredExtension', 'sourceUrl', 'acquire', 'genMethod', 'notes'], path, issues),
      ...(raw.expectedSizeBytes === undefined
        ? {}
        : { expectedSizeBytes: optionalSafeSize(raw.expectedSizeBytes, `${path}.expectedSizeBytes`, issues) }),
      ...(raw.codecs === undefined ? {} : { codecs: stringArray(raw.codecs, `${path}.codecs`, issues) }),
    });
  }
  const sorted = sortIssues(issues);
  if (!corpusVersion || sorted.some((entry) => entry.severity === 'ERROR')) {
    return deepFreeze({ state: 'INVALID', issues: sorted });
  }
  const normalizedAssets = assets.sort((a, b) => a.id.localeCompare(b.id));
  const manifestSha256 = canonicalSha256({
    schemaVersion: BAKED_CORPUS_SCHEMA_VERSION,
    corpusVersion,
    assets: normalizedAssets,
  });
  return deepFreeze({
    state: 'VALID',
    manifest: {
      schemaVersion: BAKED_CORPUS_SCHEMA_VERSION,
      corpusVersion,
      manifestSha256,
      assets: normalizedAssets,
    },
    issues: sorted,
  });
}

export function scenarioSourceMap(catalog: ValidatedScenarioSourceCatalog): ReadonlyMap<string, ScenarioSourceRow> {
  return new Map(catalog.rows.map((row) => [row.scenarioId, row] as const));
}

export interface ContentIdentity {
  logicalPath: string;
  sha256: string;
  sizeBytes: number;
}

export interface CorpusIntegrityIssue {
  scope: 'CORPUS';
  status: 'NA_ASSET';
  reasonCode:
    | 'CORPUS_FETCH_FAILED'
    | 'CORPUS_SIZE_MISMATCH'
    | 'CORPUS_DIGEST_MISMATCH'
    | 'CORPUS_NO_VERIFIED_CANDIDATE';
  logicalPath?: string;
  expectedSha256?: string;
  actualSha256?: string;
  expectedSizeBytes?: number;
  actualSizeBytes?: number;
  detail: string;
}

export interface VerifiedContent {
  state: 'VERIFIED';
  identity: ContentIdentity;
  bytes: Uint8Array;
  actualSha256: string;
  actualSizeBytes: number;
}

/**
 * Digest-bound, non-retained content evidence for large immutable URL inputs.
 *
 * `chunkSha256` is an authenticated snapshot of the exact body observed during admission. A URL
 * reader must validate every block it delivers against this map; the overall digest alone is not a
 * license to re-fetch an unguarded mutable URL after preflight.
 */
export interface VerifiedStreamContent {
  state: 'VERIFIED_STREAM';
  identity: ContentIdentity;
  actualSha256: string;
  actualSizeBytes: number;
  chunkSizeBytes: number;
  chunkSha256: readonly string[];
  retainedBytes: 0;
}

export const VERIFIED_STREAM_CHUNK_SIZE_BYTES = 1024 * 1024;

export const CORPUS_DELIVERY_INTEGRITY_ERROR_KIND = 'media-test/corpus-delivery-integrity-error@1' as const;

/** A realm-safe signal that a post-admission range no longer matches the authenticated snapshot. */
export class CorpusDeliveryIntegrityError {
  readonly kind = CORPUS_DELIVERY_INTEGRITY_ERROR_KIND;
  readonly name = 'CorpusDeliveryIntegrityError' as const;
  readonly message: string;

  constructor(
    readonly reasonCode: string,
    readonly logicalPath: string,
    readonly detail: string,
  ) {
    this.message = detail;
  }
}

export function isCorpusDeliveryIntegrityError(value: unknown): value is CorpusDeliveryIntegrityError {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return item.kind === CORPUS_DELIVERY_INTEGRITY_ERROR_KIND &&
    item.name === 'CorpusDeliveryIntegrityError' &&
    typeof item.reasonCode === 'string' && item.reasonCode.length > 0 &&
    typeof item.logicalPath === 'string' && item.logicalPath.length > 0 &&
    typeof item.detail === 'string' && item.detail.length > 0;
}

export interface RejectedContent {
  state: 'REJECTED';
  identity: ContentIdentity;
  issue: CorpusIntegrityIssue;
}

export type ContentVerificationResult = VerifiedContent | RejectedContent;
export type ByteSource = Uint8Array | ArrayBuffer | Blob;
export type StreamSource = ReadableStream<Uint8Array>;

/**
 * Incrementally verify a body while retaining only one fixed-size block and its digest map.
 * The returned block map is later enforced by an adapter-owned range fetcher, closing the TOCTOU
 * gap between admission and URL-backed operation execution.
 */
export async function verifyContentStream(
  identity: ContentIdentity,
  load: () => Promise<StreamSource>,
  chunkSizeBytes = VERIFIED_STREAM_CHUNK_SIZE_BYTES,
): Promise<VerifiedStreamContent | RejectedContent> {
  if (!Number.isSafeInteger(chunkSizeBytes) || chunkSizeBytes <= 0) {
    throw new RangeError('verifyContentStream chunkSizeBytes must be a positive safe integer');
  }
  let stream: StreamSource;
  try {
    stream = await load();
  } catch (error) {
    return deepFreeze({
      state: 'REJECTED',
      identity,
      issue: corpusIssue('CORPUS_FETCH_FAILED', `failed to fetch '${identity.logicalPath}': ${errorMessage(error)}`, identity),
    });
  }

  const overall = new Sha256();
  let chunk = new Sha256();
  let chunkBytes = 0;
  let actualSizeBytes = 0;
  const chunkSha256: string[] = [];
  const reader = stream.getReader();
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const value = next.value;
      if (!(value instanceof Uint8Array)) {
        throw new TypeError('content stream yielded a non-Uint8Array chunk');
      }
      overall.update(value);
      actualSizeBytes += value.byteLength;
      if (!Number.isSafeInteger(actualSizeBytes)) throw new RangeError('content stream exceeds safe byte length');
      let offset = 0;
      while (offset < value.byteLength) {
        const take = Math.min(chunkSizeBytes - chunkBytes, value.byteLength - offset);
        chunk.update(value.subarray(offset, offset + take));
        chunkBytes += take;
        offset += take;
        if (chunkBytes === chunkSizeBytes) {
          chunkSha256.push(chunk.hex());
          chunk = new Sha256();
          chunkBytes = 0;
        }
      }
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    return deepFreeze({
      state: 'REJECTED',
      identity,
      issue: corpusIssue('CORPUS_FETCH_FAILED', `failed to stream '${identity.logicalPath}': ${errorMessage(error)}`, identity),
    });
  } finally {
    reader.releaseLock();
  }
  if (chunkBytes > 0) chunkSha256.push(chunk.hex());

  if (actualSizeBytes !== identity.sizeBytes) {
    return deepFreeze({
      state: 'REJECTED',
      identity,
      issue: {
        ...corpusIssue(
          'CORPUS_SIZE_MISMATCH',
          `size mismatch for '${identity.logicalPath}': expected ${identity.sizeBytes}, got ${actualSizeBytes}`,
          identity,
        ),
        actualSizeBytes,
      },
    });
  }
  const actualSha256 = overall.hex();
  if (actualSha256 !== identity.sha256) {
    return deepFreeze({
      state: 'REJECTED',
      identity,
      issue: {
        ...corpusIssue('CORPUS_DIGEST_MISMATCH', `SHA-256 mismatch for '${identity.logicalPath}'`, identity),
        actualSha256,
        actualSizeBytes,
      },
    });
  }
  return deepFreeze({
    state: 'VERIFIED_STREAM',
    identity: { ...identity },
    actualSha256,
    actualSizeBytes,
    chunkSizeBytes,
    chunkSha256,
    retainedBytes: 0,
  });
}

/** Hash and size-check the exact bytes that the runner will later expose to an adapter. */
export async function verifyContentBytes(
  identity: ContentIdentity,
  load: () => Promise<ByteSource>,
): Promise<ContentVerificationResult> {
  let bytes: Uint8Array;
  try {
    const loaded = await load();
    bytes = loaded instanceof Blob
      ? new Uint8Array(await loaded.arrayBuffer())
      : loaded instanceof Uint8Array
        ? loaded
        : new Uint8Array(loaded);
  } catch (error) {
    return deepFreeze({
      state: 'REJECTED',
      identity,
      issue: corpusIssue('CORPUS_FETCH_FAILED', `failed to fetch '${identity.logicalPath}': ${errorMessage(error)}`, identity),
    });
  }
  if (bytes.byteLength !== identity.sizeBytes) {
    return deepFreeze({
      state: 'REJECTED',
      identity,
      issue: {
        ...corpusIssue(
          'CORPUS_SIZE_MISMATCH',
          `size mismatch for '${identity.logicalPath}': expected ${identity.sizeBytes}, got ${bytes.byteLength}`,
          identity,
        ),
        actualSizeBytes: bytes.byteLength,
      },
    });
  }
  const actualSha256 = sha256Hex(bytes);
  if (actualSha256 !== identity.sha256) {
    return deepFreeze({
      state: 'REJECTED',
      identity,
      issue: {
        ...corpusIssue(
          'CORPUS_DIGEST_MISMATCH',
          `SHA-256 mismatch for '${identity.logicalPath}'`,
          identity,
        ),
        actualSha256,
        actualSizeBytes: bytes.byteLength,
      },
    });
  }
  // Do not freeze a non-empty typed array (ECMAScript forbids it); identity/provenance are frozen and
  // the runner must hand this verified byte view, or copies of it, to every engine.
  const result: VerifiedContent = {
    state: 'VERIFIED',
    identity: deepFreeze({ ...identity }),
    bytes,
    actualSha256,
    actualSizeBytes: bytes.byteLength,
  };
  return Object.freeze(result);
}

/** Verify a candidate's inputs once, de-duplicating engine-independent issues by full identity. */
export async function verifyContentSet(
  identities: readonly ContentIdentity[],
  load: (identity: ContentIdentity) => Promise<ByteSource>,
): Promise<{ verified: readonly VerifiedContent[]; issues: readonly CorpusIntegrityIssue[]; eligible: number }> {
  const cache = new Map<string, Promise<ContentVerificationResult>>();
  const results: ContentVerificationResult[] = [];
  for (const identity of identities) {
    const key = `${identity.logicalPath}\u0000${identity.sha256}\u0000${identity.sizeBytes}`;
    let pending = cache.get(key);
    if (!pending) {
      pending = verifyContentBytes(identity, () => load(identity));
      cache.set(key, pending);
    }
    results.push(await pending);
  }
  const verified = results.filter((result): result is VerifiedContent => result.state === 'VERIFIED');
  const issueByIdentity = new Map<string, CorpusIntegrityIssue>();
  for (const result of results) {
    if (result.state !== 'REJECTED') continue;
    const key = `${result.identity.logicalPath}\u0000${result.identity.sha256}\u0000${result.identity.sizeBytes}`;
    issueByIdentity.set(key, result.issue);
  }
  return deepFreeze({ verified, issues: [...issueByIdentity.values()], eligible: verified.length });
}

export type VerifiedExecutionResult<T> =
  | {
      state: 'VERIFIED';
      eligible: 1;
      verified: readonly VerifiedContent[];
      value: T;
    }
  | {
      state: 'NA_ASSET';
      eligible: 0;
      issues: readonly CorpusIntegrityIssue[];
    };

/**
 * The enforcement boundary used by runner integration: `execute` is unreachable unless every input
 * has been size/digest verified, and it receives the exact verified byte views rather than a new fetch.
 */
export async function withVerifiedContent<T>(
  identities: readonly ContentIdentity[],
  load: (identity: ContentIdentity) => Promise<ByteSource>,
  execute: (verified: readonly VerifiedContent[]) => Promise<T> | T,
): Promise<VerifiedExecutionResult<T>> {
  if (identities.length === 0) {
    return deepFreeze({
      state: 'NA_ASSET',
      eligible: 0,
      issues: [
        {
          scope: 'CORPUS',
          status: 'NA_ASSET',
          reasonCode: 'CORPUS_NO_VERIFIED_CANDIDATE',
          detail: 'candidate declares no input identities',
        },
      ],
    });
  }
  const verification = await verifyContentSet(identities, load);
  if (verification.verified.length !== identities.length) {
    return deepFreeze({ state: 'NA_ASSET', eligible: 0, issues: verification.issues });
  }
  const value = await execute(verification.verified);
  const result: Extract<VerifiedExecutionResult<T>, { state: 'VERIFIED' }> = {
    state: 'VERIFIED',
    eligible: 1,
    verified: verification.verified,
    value,
  };
  return Object.freeze(result);
}

export function contentIdentityDigest(inputs: readonly ContentIdentity[]): string {
  return canonicalSha256({
    schema: 'executed-input@1',
    inputs: inputs.map((input, index) => ({ index, ...input })),
  });
}

export function canonicalSetDigest(identities: readonly ContentIdentity[]): string {
  return canonicalSha256({
    schema: 'executed-input-set@1',
    inputs: [...identities].sort(compareIdentity),
  });
}

export interface ObservationKeyInput {
  engine: { id: string; version?: string; runtimeConfig?: unknown };
  browser: { family: string; version?: string; runtimeConfig?: unknown };
  scenarioContractDigest: string;
  oracleEvidenceContractDigest: string;
  executedInputDigest: string;
  benchmarkConfig: unknown;
}

export function computeObservationKey(input: ObservationKeyInput): string {
  return canonicalSha256({ schema: 'media-observation@1', ...input });
}

export interface SelectionRunEnvelope {
  eligiblePoolDigest: string;
  executedInputDigest: string;
  candidateCount: number;
  catalogState: 'ready' | 'fallback';
  catalogReason?: { reasonCode: string; detail: string };
  startedAtIso: string;
  completedAtIso?: string;
}

export interface ReusedObservation<T> {
  observation: T;
  envelope: SelectionRunEnvelope;
  reusedFrom: { observationKey: string; runId?: string; createdAtIso?: string };
}

/** Re-envelope immutable observation data without retaining stale run selection/timestamps. */
export function reEnvelopeObservation<T>(
  observation: T,
  envelope: SelectionRunEnvelope,
  reusedFrom: ReusedObservation<T>['reusedFrom'],
): ReusedObservation<T> {
  return deepFreeze({ observation, envelope: { ...envelope }, reusedFrom: { ...reusedFrom } });
}

function validateSourceRow(raw: unknown, line: number, issues: CatalogIssue[]): ScenarioSourceRow | undefined {
  const context = `catalog line ${line}`;
  if (!isRecord(raw)) {
    issues.push(issue('CATALOG_ROW_NOT_OBJECT', `${context} must be an object`, { line }));
    return undefined;
  }
  rejectUnknownKeys(raw, SOURCE_ROW_KEYS, context, issues, { line });
  const scenarioId = normalizedPathField(raw, 'scenarioId', context, issues, { line });
  const classValue = raw.class;
  if (typeof classValue !== 'string' || !SOURCE_CLASSES.has(classValue as SourceClass)) {
    issues.push(issue('CATALOG_CLASS_INVALID', `${context}.class is not a known source class`, { line, scenarioId }));
  }
  const requires = validateRequires(raw.requires, context, issues, line, scenarioId);
  if (!Array.isArray(raw.files)) {
    issues.push(issue('CATALOG_FILES_NOT_ARRAY', `${context}.files must be an array`, { line, scenarioId }));
  }
  const files: SourceFileRecord[] = [];
  for (const [index, file] of (Array.isArray(raw.files) ? raw.files : []).entries()) {
    const validated = validateSourceFile(file, `${context}.files[${index}]`, issues, line, scenarioId);
    if (validated) files.push(validated);
  }
  if ((classValue === 'REAL' || classValue === 'DERIVED') && files.length === 0) {
    issues.push(issue('CATALOG_CLASS_REQUIRES_FILES', `${classValue} row '${scenarioId ?? '?'}' must contain files`, {
      line,
      scenarioId,
    }));
  }
  const reason = optionalString(raw.reason, `${context}.reason`, issues, { line, scenarioId });
  const note = optionalString(raw.note, `${context}.note`, issues, { line, scenarioId });
  if (!scenarioId || !requires || !SOURCE_CLASSES.has(classValue as SourceClass)) return undefined;
  for (const file of files) validateFileCoherence(file, requires, context, issues, line, scenarioId);
  return {
    scenarioId,
    requires,
    class: classValue as SourceClass,
    files,
    ...(reason !== undefined ? { reason } : {}),
    ...(note !== undefined ? { note } : {}),
  };
}

function validateRequires(
  raw: unknown,
  context: string,
  issues: CatalogIssue[],
  line: number,
  scenarioId?: string,
): ScenarioSourceRow['requires'] | undefined {
  if (!isRecord(raw)) {
    issues.push(issue('CATALOG_REQUIRES_NOT_OBJECT', `${context}.requires must be an object`, { line, scenarioId }));
    return undefined;
  }
  rejectUnknownKeys(raw, REQUIRES_KEYS, `${context}.requires`, issues, { line, scenarioId });
  const container = normalizedTokenField(raw, 'container', `${context}.requires`, issues, { line, scenarioId });
  const video = raw.video;
  if (typeof video !== 'boolean') {
    issues.push(issue('CATALOG_VIDEO_FLAG_INVALID', `${context}.requires.video must be boolean`, { line, scenarioId }));
  }
  const videoCodecs = normalizedTokenArray(raw.videoCodecs, `${context}.requires.videoCodecs`, issues, { line, scenarioId });
  const audioCodecs = normalizedTokenArray(raw.audioCodecs, `${context}.requires.audioCodecs`, issues, { line, scenarioId });
  const encryption = raw.encryption === undefined || raw.encryption === null
    ? raw.encryption
    : normalizedTokenArray(raw.encryption, `${context}.requires.encryption`, issues, { line, scenarioId });
  const location = { line, scenarioId };
  const minWidth = optionalSourceRequirementBound(raw.minWidth, `${context}.requires.minWidth`, 'dimension', issues, location);
  const maxWidth = optionalSourceRequirementBound(raw.maxWidth, `${context}.requires.maxWidth`, 'dimension', issues, location);
  const minHeight = optionalSourceRequirementBound(raw.minHeight, `${context}.requires.minHeight`, 'dimension', issues, location);
  const maxHeight = optionalSourceRequirementBound(raw.maxHeight, `${context}.requires.maxHeight`, 'dimension', issues, location);
  const minDurationSec = optionalSourceRequirementBound(
    raw.minDurationSec,
    `${context}.requires.minDurationSec`,
    'duration',
    issues,
    location,
  );
  const maxDurationSec = optionalSourceRequirementBound(
    raw.maxDurationSec,
    `${context}.requires.maxDurationSec`,
    'duration',
    issues,
    location,
  );
  validateSourceRequirementRange(minWidth, maxWidth, 'width', `${context}.requires`, issues, location);
  validateSourceRequirementRange(minHeight, maxHeight, 'height', `${context}.requires`, issues, location);
  validateSourceRequirementRange(minDurationSec, maxDurationSec, 'durationSec', `${context}.requires`, issues, location);
  if (!container || typeof video !== 'boolean' || !videoCodecs || !audioCodecs) return undefined;
  if (video && videoCodecs.length === 0) {
    issues.push(issue('CATALOG_VIDEO_CODEC_REQUIRED', `${context}.requires.video=true needs a video codec`, { line, scenarioId }));
  }
  return {
    container,
    video,
    videoCodecs,
    audioCodecs,
    ...(encryption !== undefined ? { encryption } : {}),
    ...(minWidth !== undefined ? { minWidth } : {}),
    ...(maxWidth !== undefined ? { maxWidth } : {}),
    ...(minHeight !== undefined ? { minHeight } : {}),
    ...(maxHeight !== undefined ? { maxHeight } : {}),
    ...(minDurationSec !== undefined ? { minDurationSec } : {}),
    ...(maxDurationSec !== undefined ? { maxDurationSec } : {}),
  };
}

function validateSourceFile(
  raw: unknown,
  context: string,
  issues: CatalogIssue[],
  line: number,
  scenarioId?: string,
): SourceFileRecord | undefined {
  if (!isRecord(raw)) {
    issues.push(issue('CATALOG_FILE_NOT_OBJECT', `${context} must be an object`, { line, scenarioId }));
    return undefined;
  }
  rejectUnknownKeys(raw, SOURCE_FILE_KEYS, context, issues, { line, scenarioId });
  const file = normalizedPathField(raw, 'file', context, issues, { line, scenarioId });
  const container = normalizedTokenField(raw, 'container', context, issues, { line, scenarioId });
  const videoCodecs = normalizedTokenArray(raw.videoCodecs, `${context}.videoCodecs`, issues, { line, scenarioId });
  const audioCodecs = normalizedTokenArray(raw.audioCodecs, `${context}.audioCodecs`, issues, { line, scenarioId });
  const sha256 = shaField(raw, 'sha256', context, issues, { line, scenarioId, path: file });
  const sizeBytes = safeSizeField(raw, 'sizeBytes', context, issues, { line, scenarioId, path: file });
  if (!file || !container || !videoCodecs || !audioCodecs || !sha256 || sizeBytes === undefined) return undefined;
  const output: SourceFileRecord = { file, container, videoCodecs, audioCodecs, sha256, sizeBytes };
  assignNullableFinite(raw, output, ['durationSec', 'width', 'height'], context, issues, { line, scenarioId, path: file });
  assignNullableString(raw, output, ['majorBrand', 'nativeProperty'], context, issues, { line, scenarioId, path: file });
  Object.assign(output, optionalStringProps(
    raw,
    ['provider', 'sourcePageUrl', 'downloadUrl', 'license', 'poolPath', 'probedWith', 'derivation'],
    context,
    issues,
    { line, scenarioId, path: file },
  ));
  if (output.poolPath !== undefined && normalizeRelativePath(output.poolPath) !== output.poolPath) {
    issues.push(issue('CATALOG_PATH_NOT_NORMALIZED', `${context}.poolPath is not a normalized relative path`, {
      line,
      scenarioId,
      path: output.poolPath,
    }));
  }
  if (raw.hlsFiles !== undefined) {
    const hlsFiles = pathArray(raw.hlsFiles, `${context}.hlsFiles`, issues, { line, scenarioId, path: file });
    if (hlsFiles) output.hlsFiles = hlsFiles;
  }
  if (raw.keys !== undefined) {
    const keys = validateKeys(raw.keys, `${context}.keys`, issues, { line, scenarioId, path: file });
    if (keys) output.keys = keys;
  }
  if (raw.cleartextBase !== undefined) {
    const base = validateCleartextBase(raw.cleartextBase, `${context}.cleartextBase`, issues, { line, scenarioId, path: file });
    if (base) output.cleartextBase = base;
  }
  if (raw.evidence !== undefined) {
    const evidence = validateEvidence(raw.evidence, `${context}.evidence`, issues, { line, scenarioId, path: file });
    if (evidence) output.evidence = evidence;
  }
  if (raw.contract !== undefined) {
    const contract = validateContract(raw.contract, `${context}.contract`, issues, { line, scenarioId, path: file });
    if (contract) output.contract = contract;
  }
  return output;
}

function validateKeys(
  raw: unknown,
  context: string,
  issues: CatalogIssue[],
  location: Partial<CatalogIssue>,
): SourceKeyRecord | undefined {
  if (!isRecord(raw)) {
    issues.push(issue('CATALOG_KEYS_NOT_OBJECT', `${context} must be an object`, location));
    return undefined;
  }
  rejectUnknownKeys(raw, KEY_KEYS, context, issues, location);
  const keyHex = lowerHexField(raw, 'keyHex', context, issues, location);
  const scheme = normalizedTokenField(raw, 'scheme', context, issues, location);
  const kid = optionalLowerHex(raw.kid, `${context}.kid`, issues, location);
  const ivHex = optionalLowerHex(raw.ivHex, `${context}.ivHex`, issues, location);
  const keyUri = optionalString(raw.keyUri, `${context}.keyUri`, issues, location);
  const ivMode = optionalString(raw.ivMode, `${context}.ivMode`, issues, location);
  if (!keyHex || !scheme) return undefined;
  return {
    keyHex,
    scheme,
    ...(kid ? { kid } : {}),
    ...(ivHex ? { ivHex } : {}),
    ...(keyUri ? { keyUri } : {}),
    ...(ivMode ? { ivMode } : {}),
  };
}

function validateCleartextBase(
  raw: unknown,
  context: string,
  issues: CatalogIssue[],
  location: Partial<CatalogIssue>,
): CleartextBaseRecord | undefined {
  if (!isRecord(raw)) {
    issues.push(issue('CATALOG_BASE_NOT_OBJECT', `${context} must be an object`, location));
    return undefined;
  }
  rejectUnknownKeys(raw, BASE_KEYS, context, issues, location);
  const poolPath = normalizedPathField(raw, 'poolPath', context, issues, location);
  const sha256 = shaField(raw, 'sha256', context, issues, location);
  if (!poolPath || !sha256) return undefined;
  const output: CleartextBaseRecord = { poolPath, sha256 };
  if (raw.sizeBytes !== undefined) {
    const size = optionalSafeSize(raw.sizeBytes, `${context}.sizeBytes`, issues, location);
    if (size !== undefined) output.sizeBytes = size;
  }
  Object.assign(output, optionalStringProps(raw, ['provider', 'sourcePageUrl', 'downloadUrl'], context, issues, location));
  assignNullableFinite(raw, output, ['width', 'height', 'durationSec'], context, issues, location);
  return output;
}

function validateEvidence(
  raw: unknown,
  context: string,
  issues: CatalogIssue[],
  location: Partial<CatalogIssue>,
): CandidateEvidenceDeclaration | undefined {
  if (!isRecord(raw)) {
    issues.push(issue('CATALOG_EVIDENCE_NOT_OBJECT', `${context} must be an object`, location));
    return undefined;
  }
  rejectUnknownKeys(raw, EVIDENCE_KEYS, context, issues, location);
  const sourceSha256 = shaField(raw, 'sourceSha256', context, issues, location);
  const available = enumArray(raw.available, EVIDENCE_NEEDS, `${context}.available`, issues, location);
  const sufficientOracleSets = oracleSets(raw.sufficientOracleSets, `${context}.sufficientOracleSets`, issues, location);
  const requiredOracles = raw.requiredOracles === undefined
    ? undefined
    : enumArray(raw.requiredOracles, ORACLE_IDS, `${context}.requiredOracles`, issues, location);
  let metamorphicSurvivor: CandidateEvidenceDeclaration['metamorphicSurvivor'];
  if (raw.metamorphicSurvivor !== undefined) {
    if (!isRecord(raw.metamorphicSurvivor)) {
      issues.push(issue('CATALOG_METAMORPHIC_NOT_OBJECT', `${context}.metamorphicSurvivor must be an object`, location));
    } else {
      rejectUnknownKeys(raw.metamorphicSurvivor, METAMORPHIC_KEYS, `${context}.metamorphicSurvivor`, issues, location);
      const oracle = raw.metamorphicSurvivor.oracle;
      const invariant = stringField(raw.metamorphicSurvivor, 'invariant', `${context}.metamorphicSurvivor`, issues, location);
      const cleartextBaseSha256 = shaField(
        raw.metamorphicSurvivor,
        'cleartextBaseSha256',
        `${context}.metamorphicSurvivor`,
        issues,
        location,
      );
      if (oracle !== 'property-invariant') {
        issues.push(issue('CATALOG_METAMORPHIC_ORACLE_INVALID', `${context}.metamorphicSurvivor.oracle must be property-invariant`, location));
      } else if (invariant && cleartextBaseSha256) {
        metamorphicSurvivor = { oracle, invariant, cleartextBaseSha256 };
      }
    }
  }
  if (!sourceSha256 || !available || !sufficientOracleSets) return undefined;
  return {
    sourceSha256,
    available,
    sufficientOracleSets,
    ...(requiredOracles ? { requiredOracles } : {}),
    ...(metamorphicSurvivor ? { metamorphicSurvivor } : {}),
  };
}

function validateContract(
  raw: unknown,
  context: string,
  issues: CatalogIssue[],
  location: Partial<CatalogIssue>,
): CandidateContractDeclaration | undefined {
  if (!isRecord(raw)) {
    issues.push(issue('CATALOG_CONTRACT_NOT_OBJECT', `${context} must be an object`, location));
    return undefined;
  }
  rejectUnknownKeys(raw, CONTRACT_KEYS, context, issues, location);
  const scenarioId = normalizedPathField(raw, 'scenarioId', context, issues, location);
  const scenarioContractDigest = shaField(raw, 'scenarioContractDigest', context, issues, location);
  const sourceSha256 = shaField(raw, 'sourceSha256', context, issues, location);
  const kind = raw.kind;
  if (kind !== undefined && kind !== 'same-contract' && kind !== 'robustness-variant') {
    issues.push(issue('CATALOG_CONTRACT_KIND_INVALID', `${context}.kind is invalid`, location));
  }
  if (!scenarioId || !scenarioContractDigest || !sourceSha256) return undefined;
  return {
    scenarioId,
    scenarioContractDigest,
    sourceSha256,
    ...(kind === 'same-contract' || kind === 'robustness-variant' ? { kind } : {}),
  };
}

function validateFileCoherence(
  file: SourceFileRecord,
  requires: ScenarioSourceRow['requires'],
  context: string,
  issues: CatalogIssue[],
  line: number,
  scenarioId: string,
): void {
  const location = { line, scenarioId, path: file.file };
  if (file.container !== requires.container) {
    issues.push(warning('CATALOG_CONTAINER_INCOHERENT', `${context}: ${file.file} container '${file.container}' does not match '${requires.container}'`, location));
  }
  for (const codec of requires.videoCodecs) {
    if (!file.videoCodecs.includes(codec)) issues.push(warning('CATALOG_VIDEO_CODEC_INCOHERENT', `${file.file} lacks '${codec}'`, location));
  }
  for (const codec of requires.audioCodecs) {
    if (!file.audioCodecs.includes(codec)) issues.push(warning('CATALOG_AUDIO_CODEC_INCOHERENT', `${file.file} lacks '${codec}'`, location));
  }
  if (!requires.video && requires.audioCodecs.length > 0 && file.videoCodecs.length > 0) {
    issues.push(issue('CATALOG_AUDIO_ONLY_HAS_VIDEO', `${file.file} carries video for an audio-only row`, location));
  }
  if (file.evidence && file.evidence.sourceSha256 !== file.sha256) {
    issues.push(issue('CATALOG_EVIDENCE_DIGEST_MISMATCH', `${file.file} evidence covers a different source digest`, location));
  }
  if (file.contract) {
    if (file.contract.sourceSha256 !== file.sha256) {
      issues.push(issue('CATALOG_CONTRACT_DIGEST_MISMATCH', `${file.file} contract covers a different source digest`, location));
    }
    if (file.contract.scenarioId !== scenarioId) {
      issues.push(issue('CATALOG_CONTRACT_SCENARIO_MISMATCH', `${file.file} contract names '${file.contract.scenarioId}'`, location));
    }
  }
}

function diagnoseCandidateDuplicates(row: ScenarioSourceRow, issues: CatalogIssue[]): void {
  const paths = new Set<string>();
  const digests = new Set<string>();
  for (const file of row.files) {
    if (paths.has(file.file)) {
      issues.push(issue('CATALOG_DUPLICATE_FILE_PATH', `duplicate path '${file.file}' in '${row.scenarioId}'`, {
        scenarioId: row.scenarioId,
        path: file.file,
      }));
    }
    paths.add(file.file);
    if (digests.has(file.sha256)) {
      issues.push(issue('CATALOG_DUPLICATE_CONTENT_DIGEST', `duplicate content digest '${file.sha256}' in '${row.scenarioId}'`, {
        scenarioId: row.scenarioId,
        path: file.file,
      }));
    }
    digests.add(file.sha256);
  }
}

function normalizeSourceRow(row: ScenarioSourceRow): ScenarioSourceRow {
  return {
    ...row,
    requires: {
      ...row.requires,
      videoCodecs: [...row.requires.videoCodecs].sort(),
      audioCodecs: [...row.requires.audioCodecs].sort(),
      ...(Array.isArray(row.requires.encryption) ? { encryption: [...row.requires.encryption].sort() } : {}),
    },
    files: row.files
      .map((file) => ({
        ...file,
        videoCodecs: [...file.videoCodecs].sort(),
        audioCodecs: [...file.audioCodecs].sort(),
        ...(file.hlsFiles ? { hlsFiles: [...file.hlsFiles].sort() } : {}),
        ...(file.evidence
          ? {
              evidence: {
                ...file.evidence,
                available: [...file.evidence.available].sort(),
                sufficientOracleSets: file.evidence.sufficientOracleSets
                  .map((set) => [...set].sort())
                  .sort(compareStringArrays),
                ...(file.evidence.requiredOracles
                  ? { requiredOracles: [...file.evidence.requiredOracles].sort() }
                  : {}),
              },
            }
          : {}),
      }))
      .sort((a, b) => a.file.localeCompare(b.file) || a.sha256.localeCompare(b.sha256)),
  };
}

function compareIdentity(a: ContentIdentity, b: ContentIdentity): number {
  return a.logicalPath.localeCompare(b.logicalPath) || a.sha256.localeCompare(b.sha256) || a.sizeBytes - b.sizeBytes;
}

function compareStringArrays(a: readonly string[], b: readonly string[]): number {
  return a.join('\u0000').localeCompare(b.join('\u0000'));
}

function issue(reasonCode: string, detail: string, location: Partial<CatalogIssue> = {}): CatalogIssue {
  return { severity: 'ERROR', reasonCode, detail, ...location };
}

function warning(reasonCode: string, detail: string, location: Partial<CatalogIssue> = {}): CatalogIssue {
  return { severity: 'WARNING', reasonCode, detail, ...location };
}

function corpusIssue(
  reasonCode: CorpusIntegrityIssue['reasonCode'],
  detail: string,
  identity: ContentIdentity,
): CorpusIntegrityIssue {
  return {
    scope: 'CORPUS',
    status: 'NA_ASSET',
    reasonCode,
    detail,
    logicalPath: identity.logicalPath,
    expectedSha256: identity.sha256,
    expectedSizeBytes: identity.sizeBytes,
  };
}

function sortIssues(issues: CatalogIssue[]): CatalogIssue[] {
  return issues.sort((a, b) =>
    (a.scenarioId ?? '').localeCompare(b.scenarioId ?? '') ||
    (a.path ?? '').localeCompare(b.path ?? '') ||
    (a.line ?? 0) - (b.line ?? 0) ||
    a.reasonCode.localeCompare(b.reasonCode) ||
    a.detail.localeCompare(b.detail));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  context: string,
  issues: CatalogIssue[],
  location: Partial<CatalogIssue> = {},
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issues.push(issue('CATALOG_UNKNOWN_FIELD', `${context} has unknown field '${key}'`, location));
  }
}

function stringField(
  value: Record<string, unknown>,
  key: string,
  context: string,
  issues: CatalogIssue[],
  location: Partial<CatalogIssue> = {},
): string | undefined {
  const field = value[key];
  if (typeof field !== 'string' || field.trim().length === 0 || field !== field.trim()) {
    issues.push(issue('CATALOG_STRING_INVALID', `${context}.${key} must be a nonempty trimmed string`, location));
    return undefined;
  }
  return field;
}

function optionalString(
  value: unknown,
  context: string,
  issues: CatalogIssue[],
  location: Partial<CatalogIssue> = {},
): string | undefined {
  if (value === undefined) return undefined;
  if (value === null) {
    issues.push(warning('CATALOG_OPTIONAL_STRING_OMITTED', `${context} is null and was omitted`, location));
    return undefined;
  }
  if (typeof value !== 'string') {
    issues.push(issue('CATALOG_STRING_INVALID', `${context} must be a string`, location));
    return undefined;
  }
  if (value.length === 0) {
    issues.push(warning('CATALOG_OPTIONAL_STRING_OMITTED', `${context} is empty and was omitted`, location));
    return undefined;
  }
  if (value.trim().length === 0 || value !== value.trim()) {
    issues.push(issue('CATALOG_STRING_INVALID', `${context} must be a normalized trimmed string`, location));
    return undefined;
  }
  return value;
}

function optionalStringProps(
  raw: Record<string, unknown>,
  keys: readonly string[],
  context: string,
  issues: CatalogIssue[],
  location: Partial<CatalogIssue> = {},
): Record<string, string> {
  const output: Record<string, string> = {};
  for (const key of keys) {
    const value = optionalString(raw[key], `${context}.${key}`, issues, location);
    if (value !== undefined) output[key] = value;
  }
  return output;
}

function normalizedTokenField(
  value: Record<string, unknown>,
  key: string,
  context: string,
  issues: CatalogIssue[],
  location: Partial<CatalogIssue> = {},
): string | undefined {
  const field = stringField(value, key, context, issues, location);
  if (!field) return undefined;
  const normalized = field.toLowerCase();
  if (field !== normalized || !/^[a-z0-9][a-z0-9._+-]*$/u.test(field)) {
    issues.push(issue('CATALOG_TOKEN_NOT_NORMALIZED', `${context}.${key} must be a normalized lowercase token`, location));
    return undefined;
  }
  return field;
}

function normalizedTokenArray(
  raw: unknown,
  context: string,
  issues: CatalogIssue[],
  location: Partial<CatalogIssue> = {},
): string[] | undefined {
  if (!Array.isArray(raw)) {
    issues.push(issue('CATALOG_TOKEN_ARRAY_INVALID', `${context} must be an array`, location));
    return undefined;
  }
  const output: string[] = [];
  const seen = new Set<string>();
  for (const [index, value] of raw.entries()) {
    if (typeof value !== 'string' || value.length === 0 || value !== value.toLowerCase() || !/^[a-z0-9][a-z0-9._+-]*$/u.test(value)) {
      issues.push(issue('CATALOG_TOKEN_NOT_NORMALIZED', `${context}[${index}] is not a normalized lowercase token`, location));
      continue;
    }
    if (seen.has(value)) issues.push(issue('CATALOG_DUPLICATE_TOKEN', `${context} repeats '${value}'`, location));
    else {
      seen.add(value);
      output.push(value);
    }
  }
  return output;
}

function normalizedPathField(
  value: Record<string, unknown>,
  key: string,
  context: string,
  issues: CatalogIssue[],
  location: Partial<CatalogIssue> = {},
): string | undefined {
  const field = stringField(value, key, context, issues, location);
  if (!field) return undefined;
  if (normalizeRelativePath(field) !== field) {
    issues.push(issue('CATALOG_PATH_NOT_NORMALIZED', `${context}.${key} is not a normalized relative path`, {
      ...location,
      path: field,
    }));
    return undefined;
  }
  return field;
}

export function normalizeRelativePath(path: string): string | undefined {
  if (
    path.length === 0 ||
    path !== path.trim() ||
    path.startsWith('/') ||
    path.endsWith('/') ||
    path.includes('\\') ||
    path.includes('?') ||
    path.includes('#') ||
    path.includes('\u0000')
  ) return undefined;
  const segments = path.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) return undefined;
  try {
    const decoded = decodeURIComponent(path);
    if (decoded.includes('\\') || decoded.startsWith('/') || decoded.split('/').some((segment) => segment === '.' || segment === '..')) {
      return undefined;
    }
  } catch {
    return undefined;
  }
  return segments.join('/');
}

function pathArray(
  raw: unknown,
  context: string,
  issues: CatalogIssue[],
  location: Partial<CatalogIssue>,
): string[] | undefined {
  if (!Array.isArray(raw)) {
    issues.push(issue('CATALOG_PATH_ARRAY_INVALID', `${context} must be an array`, location));
    return undefined;
  }
  const output: string[] = [];
  const seen = new Set<string>();
  for (const [index, value] of raw.entries()) {
    if (typeof value !== 'string' || normalizeRelativePath(value) !== value) {
      issues.push(issue('CATALOG_PATH_NOT_NORMALIZED', `${context}[${index}] is invalid`, location));
      continue;
    }
    if (seen.has(value)) issues.push(issue('CATALOG_DUPLICATE_FILE_PATH', `${context} repeats '${value}'`, location));
    else {
      seen.add(value);
      output.push(value);
    }
  }
  return output;
}

function shaField(
  value: Record<string, unknown>,
  key: string,
  context: string,
  issues: CatalogIssue[],
  location: Partial<CatalogIssue> = {},
): string | undefined {
  const field = value[key];
  if (typeof field !== 'string' || !LOWER_SHA256.test(field)) {
    issues.push(issue('CATALOG_SHA256_INVALID', `${context}.${key} must be lowercase 64-hex SHA-256`, location));
    return undefined;
  }
  return field;
}

function lowerHexField(
  value: Record<string, unknown>,
  key: string,
  context: string,
  issues: CatalogIssue[],
  location: Partial<CatalogIssue>,
): string | undefined {
  const field = value[key];
  if (typeof field !== 'string' || field.length % 2 !== 0 || !LOWER_HEX.test(field)) {
    issues.push(issue('CATALOG_HEX_INVALID', `${context}.${key} must be nonempty lowercase even-length hex`, location));
    return undefined;
  }
  return field;
}

function optionalLowerHex(
  raw: unknown,
  context: string,
  issues: CatalogIssue[],
  location: Partial<CatalogIssue>,
): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string' || raw.length === 0 || raw.length % 2 !== 0 || !LOWER_HEX.test(raw)) {
    issues.push(issue('CATALOG_HEX_INVALID', `${context} must be lowercase even-length hex`, location));
    return undefined;
  }
  return raw;
}

function safeSizeField(
  value: Record<string, unknown>,
  key: string,
  context: string,
  issues: CatalogIssue[],
  location: Partial<CatalogIssue> = {},
): number | undefined {
  return optionalSafeSize(value[key], `${context}.${key}`, issues, location);
}

function optionalSafeSize(
  raw: unknown,
  context: string,
  issues: CatalogIssue[],
  location: Partial<CatalogIssue> = {},
): number | undefined {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 0) {
    issues.push(issue('CATALOG_SIZE_INVALID', `${context} must be a finite nonnegative safe integer`, location));
    return undefined;
  }
  return raw;
}

function optionalSourceRequirementBound(
  raw: unknown,
  context: string,
  kind: 'dimension' | 'duration',
  issues: CatalogIssue[],
  location: Partial<CatalogIssue>,
): number | undefined {
  if (raw === undefined) return undefined;
  const valid = typeof raw === 'number'
    && Number.isFinite(raw)
    && (kind === 'dimension' ? Number.isSafeInteger(raw) && raw > 0 : raw >= 0);
  if (!valid) {
    issues.push(issue(
      'CATALOG_REQUIREMENT_BOUND_INVALID',
      `${context} must be ${kind === 'dimension' ? 'a positive safe integer' : 'finite and nonnegative'}`,
      location,
    ));
    return undefined;
  }
  return raw;
}

function validateSourceRequirementRange(
  min: number | undefined,
  max: number | undefined,
  field: 'width' | 'height' | 'durationSec',
  context: string,
  issues: CatalogIssue[],
  location: Partial<CatalogIssue>,
): void {
  if (min !== undefined && max !== undefined && min > max) {
    issues.push(issue(
      'CATALOG_REQUIREMENT_RANGE_INVALID',
      `${context}.min${field[0]!.toUpperCase()}${field.slice(1)} must not exceed max${field[0]!.toUpperCase()}${field.slice(1)}`,
      location,
    ));
  }
}

function stringArray(raw: unknown, context: string, issues: CatalogIssue[]): string[] {
  if (!Array.isArray(raw)) {
    issues.push(issue('CATALOG_STRING_ARRAY_INVALID', `${context} must be an array`));
    return [];
  }
  const output: string[] = [];
  for (const [index, value] of raw.entries()) {
    if (typeof value !== 'string' || value.length === 0) issues.push(issue('CATALOG_STRING_INVALID', `${context}[${index}] must be a string`));
    else output.push(value);
  }
  return output;
}

function enumArray<T extends string>(
  raw: unknown,
  allowed: ReadonlySet<T>,
  context: string,
  issues: CatalogIssue[],
  location: Partial<CatalogIssue>,
): T[] | undefined {
  if (!Array.isArray(raw)) {
    issues.push(issue('CATALOG_ENUM_ARRAY_INVALID', `${context} must be an array`, location));
    return undefined;
  }
  const output: T[] = [];
  const seen = new Set<T>();
  for (const [index, value] of raw.entries()) {
    if (typeof value !== 'string' || !allowed.has(value as T)) {
      issues.push(issue('CATALOG_ENUM_INVALID', `${context}[${index}] is invalid`, location));
    } else if (seen.has(value as T)) {
      issues.push(issue('CATALOG_DUPLICATE_TOKEN', `${context} repeats '${value}'`, location));
    } else {
      seen.add(value as T);
      output.push(value as T);
    }
  }
  return output;
}

function oracleSets(
  raw: unknown,
  context: string,
  issues: CatalogIssue[],
  location: Partial<CatalogIssue>,
): OracleId[][] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) {
    issues.push(issue('CATALOG_SUFFICIENT_SETS_INVALID', `${context} must be a nonempty array`, location));
    return undefined;
  }
  const output: OracleId[][] = [];
  for (const [index, set] of raw.entries()) {
    const parsed = enumArray(set, ORACLE_IDS, `${context}[${index}]`, issues, location);
    if (parsed && parsed.length > 0) output.push(parsed);
    else issues.push(issue('CATALOG_SUFFICIENT_SET_EMPTY', `${context}[${index}] must not be empty`, location));
  }
  return output;
}

function assignNullableFinite<T extends object>(
  raw: Record<string, unknown>,
  target: T,
  keys: readonly string[],
  context: string,
  issues: CatalogIssue[],
  location: Partial<CatalogIssue>,
): void {
  for (const key of keys) {
    const value = raw[key];
    if (value === undefined) continue;
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
      issues.push(issue('CATALOG_NUMBER_INVALID', `${context}.${key} must be null or finite nonnegative`, location));
      continue;
    }
    (target as Record<string, unknown>)[key] = value;
  }
}

function assignNullableString<T extends object>(
  raw: Record<string, unknown>,
  target: T,
  keys: readonly string[],
  context: string,
  issues: CatalogIssue[],
  location: Partial<CatalogIssue>,
): void {
  for (const key of keys) {
    const value = raw[key];
    if (value === undefined) continue;
    if (value !== null && (typeof value !== 'string' || value.trim().length === 0)) {
      issues.push(issue('CATALOG_STRING_INVALID', `${context}.${key} must be null or nonempty string`, location));
      continue;
    }
    (target as Record<string, unknown>)[key] = value;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
