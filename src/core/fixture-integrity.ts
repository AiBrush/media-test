/** Runtime active-generation resolution and once-per-cache-lifetime byte integrity checks. */

import { sha256Hex } from './seeded-rng.ts';
import { canonicalizeJson } from './canonical-json.ts';
import {
  readGoldenEvidenceBytesV1,
  unavailableGoldenEvidence,
  type GoldenArtifactKind,
  type GoldenEvidenceResult,
  type GoldenEvidenceReference,
} from './golden-evidence.ts';

export const FIXTURE_GENERATION_INDEX_SCHEMA = 'media-test/fixture-generation-index@1' as const;

export interface FixtureGenerationEntry {
  logicalPath: string;
  generationPath: string;
  artifactKind: string;
  sha256: string;
  sizeBytes: number;
  sourceMediaSha256: string;
  provenanceSha256: string;
  audit: {
    recipe: string;
    bakerVersion: string;
    outputArtifactSha256: string;
  };
}

/** Digest-bound media served from ignored `/fixtures/media/`, not copied into a generation. */
export interface FixtureMaterializedMedia {
  logicalPath: string;
  sha256: string;
  sizeBytes: number;
  provenanceSha256: string;
  audit: {
    recipe: string;
    bakerVersion: string;
    outputArtifactSha256: string;
  };
}

export interface FixtureAvailabilityEntry {
  logicalPath: string;
  state: 'absent-expected' | 'pending' | 'producer-failed';
  reasonCode: string;
  detail?: string;
}

export interface FixtureGenerationIndex {
  schema: typeof FIXTURE_GENERATION_INDEX_SCHEMA;
  schemaVersion: string;
  generationId: string;
  createdAtIso: string;
  publicationScope:
    | { mode: 'complete-corpus' }
    | { mode: 'selected-assets'; assetIds: string[] };
  entries: FixtureGenerationEntry[];
  materializedMedia: FixtureMaterializedMedia[];
  availability: FixtureAvailabilityEntry[];
}

export type GenerationIndexLoadResult =
  | { state: 'ready'; index: FixtureGenerationIndex }
  | { state: 'schema-invalid' | 'transport-error'; reasonCode: string; detail: string; httpStatus?: number };

export async function loadFixtureGenerationIndex(
  url = 'fixtures/generation-index.json',
  fetchImpl: typeof fetch = fetch,
): Promise<GenerationIndexLoadResult> {
  let response: Response;
  try {
    response = await fetchImpl(url, { cache: 'no-store' });
  } catch (error) {
    return { state: 'transport-error', reasonCode: 'GENERATION_INDEX_NETWORK_ERROR', detail: errorMessage(error) };
  }
  if (!response.ok) return { state: 'transport-error', reasonCode: 'GENERATION_INDEX_HTTP_ERROR', detail: `HTTP ${response.status}`, httpStatus: response.status };
  let value: unknown;
  try {
    value = await response.json() as unknown;
  } catch (error) {
    return { state: 'schema-invalid', reasonCode: 'GENERATION_INDEX_JSON_INVALID', detail: errorMessage(error) };
  }
  const validation = validateFixtureGenerationIndex(value);
  return validation.ok
    ? { state: 'ready', index: validation.index }
    : { state: 'schema-invalid', reasonCode: validation.reasonCode, detail: validation.issues.join('; ') };
}

export type FixtureGenerationValidation =
  | { ok: true; index: FixtureGenerationIndex }
  | { ok: false; reasonCode: string; issues: string[] };

export function validateFixtureGenerationIndex(value: unknown): FixtureGenerationValidation {
  const issues: string[] = [];
  if (!isRecord(value)) return { ok: false, reasonCode: 'GENERATION_INDEX_OBJECT_REQUIRED', issues: ['index must be an object'] };
  const topFields = new Set([
    'schema', 'schemaVersion', 'generationId', 'createdAtIso', 'publicationScope',
    'entries', 'materializedMedia', 'availability',
  ]);
  for (const field of Object.keys(value)) if (!topFields.has(field)) issues.push(`index has unknown field '${field}'`);
  if (value.schema !== FIXTURE_GENERATION_INDEX_SCHEMA) issues.push('index schema is unsupported');
  if (!/^1\.\d+\.\d+$/.test(typeof value.schemaVersion === 'string' ? value.schemaVersion : '')) issues.push('index schema major is unsupported');
  if (!isSha(value.generationId)) issues.push('generationId is invalid');
  if (typeof value.createdAtIso !== 'string' || !Number.isFinite(Date.parse(value.createdAtIso))) issues.push('createdAtIso is invalid');
  if (!Array.isArray(value.entries)) issues.push('entries must be an array');
  if (!Array.isArray(value.availability)) issues.push('availability must be an array');
  const hasMaterializedMedia = Object.prototype.hasOwnProperty.call(value, 'materializedMedia');
  if (hasMaterializedMedia && !Array.isArray(value.materializedMedia)) {
    issues.push('materializedMedia must be an array');
  }
  const publicationScope = validatePublicationScope(value.publicationScope, issues);
  const paths = new Set<string>();
  const entryFields = new Set(['logicalPath', 'generationPath', 'artifactKind', 'sha256', 'sizeBytes', 'sourceMediaSha256', 'provenanceSha256', 'audit']);
  for (const [index, entry] of (Array.isArray(value.entries) ? value.entries : []).entries()) {
    if (!isRecord(entry)) { issues.push(`entries[${index}] must be an object`); continue; }
    for (const field of Object.keys(entry)) if (!entryFields.has(field)) issues.push(`entries[${index}] has unknown field '${field}'`);
    if (!safePath(entry.logicalPath) || !safePath(entry.generationPath)) issues.push(`entries[${index}] paths are invalid`);
    if (typeof entry.logicalPath === 'string' && paths.has(entry.logicalPath)) issues.push(`duplicate logical path '${entry.logicalPath}'`);
    if (typeof entry.logicalPath === 'string') paths.add(entry.logicalPath);
    if (
      typeof entry.logicalPath === 'string' &&
      typeof entry.generationPath === 'string' &&
      entry.generationPath !== `generations/${String(value.generationId)}/${entry.logicalPath}`
    ) issues.push(`entries[${index}].generationPath is not the exact active-generation path`);
    for (const field of ['sha256', 'sourceMediaSha256', 'provenanceSha256']) if (!isSha(entry[field])) issues.push(`entries[${index}].${field} is invalid`);
    if (!Number.isSafeInteger(entry.sizeBytes) || (entry.sizeBytes as number) < 0) issues.push(`entries[${index}].sizeBytes is invalid`);
    if (typeof entry.artifactKind !== 'string' || !entry.artifactKind) issues.push(`entries[${index}].artifactKind is invalid`);
    if (!isRecord(entry.audit)) issues.push(`entries[${index}].audit is invalid`);
    else {
      const auditFields = new Set(['recipe', 'bakerVersion', 'outputArtifactSha256']);
      for (const field of Object.keys(entry.audit)) if (!auditFields.has(field)) issues.push(`entries[${index}].audit has unknown field '${field}'`);
      if (typeof entry.audit.recipe !== 'string' || !entry.audit.recipe) issues.push(`entries[${index}].audit.recipe is invalid`);
      if (typeof entry.audit.bakerVersion !== 'string' || !entry.audit.bakerVersion) issues.push(`entries[${index}].audit.bakerVersion is invalid`);
      if (!isSha(entry.audit.outputArtifactSha256)) issues.push(`entries[${index}].audit.outputArtifactSha256 is invalid`);
    }
  }
  if (Array.isArray(value.entries)) {
    const sorted = [...value.entries].sort((left, right) =>
      compareCodePoints(isRecord(left) && typeof left.logicalPath === 'string' ? left.logicalPath : '', isRecord(right) && typeof right.logicalPath === 'string' ? right.logicalPath : ''));
    if (value.entries.some((entry, index) => entry !== sorted[index])) issues.push('entries must be in canonical logicalPath order');
  }
  const materializedMedia: FixtureMaterializedMedia[] = [];
  const materializedPaths = new Set<string>();
  const materializedFields = new Set(['logicalPath', 'sha256', 'sizeBytes', 'provenanceSha256', 'audit']);
  for (const [index, entry] of (
    Array.isArray(value.materializedMedia) ? value.materializedMedia : []
  ).entries()) {
    if (!isRecord(entry)) {
      issues.push(`materializedMedia[${index}] must be an object`);
      continue;
    }
    for (const field of Object.keys(entry)) {
      if (!materializedFields.has(field)) issues.push(`materializedMedia[${index}] has unknown field '${field}'`);
    }
    if (!safePath(entry.logicalPath) || typeof entry.logicalPath !== 'string' ||
        !entry.logicalPath.startsWith('media/')) {
      issues.push(`materializedMedia[${index}].logicalPath is not a canonical media path`);
    } else {
      if (materializedPaths.has(entry.logicalPath)) {
        issues.push(`duplicate materialized media path '${entry.logicalPath}'`);
      }
      materializedPaths.add(entry.logicalPath);
      if (paths.has(entry.logicalPath)) {
        issues.push(`logical path '${entry.logicalPath}' cannot be both an indexed entry and materialized media`);
      }
    }
    if (!isSha(entry.sha256)) issues.push(`materializedMedia[${index}].sha256 is invalid`);
    if (!Number.isSafeInteger(entry.sizeBytes) || Number(entry.sizeBytes) < 0) {
      issues.push(`materializedMedia[${index}].sizeBytes is invalid`);
    }
    if (!isSha(entry.provenanceSha256)) {
      issues.push(`materializedMedia[${index}].provenanceSha256 is invalid`);
    }
    if (!isRecord(entry.audit)) {
      issues.push(`materializedMedia[${index}].audit is invalid`);
    } else {
      const auditFields = new Set(['recipe', 'bakerVersion', 'outputArtifactSha256']);
      for (const field of Object.keys(entry.audit)) {
        if (!auditFields.has(field)) issues.push(`materializedMedia[${index}].audit has unknown field '${field}'`);
      }
      if (typeof entry.audit.recipe !== 'string' || !entry.audit.recipe) {
        issues.push(`materializedMedia[${index}].audit.recipe is invalid`);
      }
      if (typeof entry.audit.bakerVersion !== 'string' || !entry.audit.bakerVersion) {
        issues.push(`materializedMedia[${index}].audit.bakerVersion is invalid`);
      }
      if (!isSha(entry.audit.outputArtifactSha256)) {
        issues.push(`materializedMedia[${index}].audit.outputArtifactSha256 is invalid`);
      } else if (isSha(entry.sha256) && entry.audit.outputArtifactSha256 !== entry.sha256) {
        issues.push(`materializedMedia[${index}].audit output digest does not match materialized bytes`);
      }
    }
    materializedMedia.push(entry as unknown as FixtureMaterializedMedia);
  }
  if (Array.isArray(value.materializedMedia)) {
    const sorted = [...value.materializedMedia].sort((left, right) =>
      compareCodePoints(
        isRecord(left) && typeof left.logicalPath === 'string' ? left.logicalPath : '',
        isRecord(right) && typeof right.logicalPath === 'string' ? right.logicalPath : '',
      ));
    if (value.materializedMedia.some((entry, index) => entry !== sorted[index])) {
      issues.push('materializedMedia must be in canonical logicalPath order');
    }
  }
  const availabilityPaths = new Set<string>();
  const availabilityFields = new Set(['logicalPath', 'state', 'reasonCode', 'detail']);
  for (const [index, entry] of (Array.isArray(value.availability) ? value.availability : []).entries()) {
    if (!isRecord(entry) || !safePath(entry.logicalPath) || !['absent-expected', 'pending', 'producer-failed'].includes(String(entry.state)) || typeof entry.reasonCode !== 'string') {
      issues.push(`availability[${index}] is invalid`);
      continue;
    }
    for (const field of Object.keys(entry)) if (!availabilityFields.has(field)) issues.push(`availability[${index}] has unknown field '${field}'`);
    if (availabilityPaths.has(entry.logicalPath)) {
      issues.push(`duplicate availability path '${entry.logicalPath}'`);
    }
    availabilityPaths.add(entry.logicalPath);
    if (paths.has(entry.logicalPath)) {
      issues.push(`logical path '${entry.logicalPath}' cannot be both an indexed entry and availability`);
    }
    if (materializedPaths.has(entry.logicalPath)) {
      issues.push(`logical path '${entry.logicalPath}' cannot be both materialized media and availability`);
    }
  }
  if (Array.isArray(value.availability)) {
    const sorted = [...value.availability].sort((left, right) =>
      compareCodePoints(isRecord(left) && typeof left.logicalPath === 'string' ? left.logicalPath : '', isRecord(right) && typeof right.logicalPath === 'string' ? right.logicalPath : ''));
    if (value.availability.some((entry, index) => entry !== sorted[index])) issues.push('availability must be in canonical logicalPath order');
  }
  if (!paths.has('manifest.json')) issues.push("active generation must index 'manifest.json'");
  if (publicationScope?.mode === 'selected-assets') {
    const selected = new Set(publicationScope.assetIds);
    for (const [index, entry] of (Array.isArray(value.entries) ? value.entries : []).entries()) {
      if (!isRecord(entry) || entry.logicalPath === 'manifest.json') continue;
      const assetId = logicalPathAssetId(entry.logicalPath, typeof entry.artifactKind === 'string' ? entry.artifactKind : undefined);
      if (!assetId) issues.push(`entries[${index}] is not a canonical selected-asset path`);
      else if (!selected.has(assetId)) issues.push(`entries[${index}] asset '${assetId}' is outside selected publication scope`);
    }
    for (const [index, entry] of (Array.isArray(value.availability) ? value.availability : []).entries()) {
      if (!isRecord(entry)) continue;
      const assetId = logicalPathAssetId(entry.logicalPath);
      if (!assetId) issues.push(`availability[${index}] is not a canonical selected-asset path`);
      else if (!selected.has(assetId)) issues.push(`availability[${index}] asset '${assetId}' is outside selected publication scope`);
    }
    for (const [index, entry] of materializedMedia.entries()) {
      const assetId = logicalPathAssetId(entry.logicalPath, 'media');
      if (!assetId) issues.push(`materializedMedia[${index}] is not a canonical selected-asset path`);
      else if (!selected.has(assetId)) {
        issues.push(`materializedMedia[${index}] asset '${assetId}' is outside selected publication scope`);
      }
    }
    for (const assetId of publicationScope.assetIds) {
      const mediaPath = `media/${assetId}`;
      if (!paths.has(mediaPath) && !materializedPaths.has(mediaPath) && !availabilityPaths.has(mediaPath)) {
        issues.push(`${mediaPath}: selected asset is neither indexed nor covered by typed availability`);
      }
    }
  }
  if (publicationScope && Array.isArray(value.entries) && Array.isArray(value.availability) && isSha(value.generationId)) {
    try {
      const identityEntries = value.entries.map((entry) => {
        if (!isRecord(entry)) return entry;
        const { generationPath: _generationPath, ...identity } = entry;
        return identity;
      });
      const expectedGenerationId = sha256Hex(new TextEncoder().encode(canonicalizeJson({
        schema: FIXTURE_GENERATION_INDEX_SCHEMA,
        publicationScope,
        entries: identityEntries,
        ...(hasMaterializedMedia ? { materializedMedia } : {}),
        availability: value.availability,
      })));
      if (expectedGenerationId !== value.generationId) {
        issues.push(`generationId does not match canonical publication identity (${expectedGenerationId})`);
      }
    } catch (error) {
      issues.push(`generation identity cannot be computed (${errorMessage(error)})`);
    }
  }
  return issues.length
    ? { ok: false, reasonCode: 'GENERATION_INDEX_SCHEMA_INVALID', issues }
    : {
        ok: true,
        index: {
          ...(value as unknown as Omit<FixtureGenerationIndex, 'materializedMedia'>),
          materializedMedia,
        },
      };
}

export function resolveFixtureGenerationEntry(
  index: FixtureGenerationIndex,
  logicalPath: string,
): FixtureGenerationEntry | FixtureAvailabilityEntry | undefined {
  return index.entries.find((entry) => entry.logicalPath === logicalPath) ??
    index.availability.find((entry) => entry.logicalPath === logicalPath);
}

export function resolveFixtureMaterializedMedia(
  index: FixtureGenerationIndex,
  logicalPath: string,
): FixtureMaterializedMedia | undefined {
  return index.materializedMedia.find((entry) => entry.logicalPath === logicalPath);
}

export type FixtureIntegrityResult =
  | { state: 'verified'; entry: FixtureGenerationEntry; bytes: Uint8Array; actualSha256: string; cacheHit: boolean }
  | {
      state: 'quarantined';
      execution: 'NA_ASSET';
      reasonCode:
        | 'FIXTURE_SIZE_MISMATCH'
        | 'FIXTURE_DIGEST_MISMATCH'
        | 'FIXTURE_FETCH_FAILED'
        | 'FIXTURE_MEDIA_NOT_MATERIALIZED';
      entry: FixtureGenerationEntry;
      expectedSha256: string;
      actualSha256?: string;
      expectedSizeBytes: number;
      actualSizeBytes?: number;
      detail: string;
    }
  | {
      state: 'error';
      execution: 'ERROR';
      reasonCode: 'FIXTURE_TRANSPORT_ERROR';
      entry: FixtureGenerationEntry;
      detail: string;
    };

export interface FixtureIntegrityCacheOptions {
  /** Test/host instrumentation; production uses the shared realm-safe SHA-256 implementation. */
  hash?: (bytes: Uint8Array, entry: FixtureGenerationEntry) => string;
}

class MaterializedMediaMissingError extends Error {}

/** One instance is one integrity-cache lifetime. Every distinct indexed identity is hashed once. */
export class FixtureIntegrityCache {
  readonly #cache = new Map<string, Promise<FixtureIntegrityResult>>();
  readonly #hash: (bytes: Uint8Array, entry: FixtureGenerationEntry) => string;

  constructor(options: FixtureIntegrityCacheOptions = {}) {
    this.#hash = options.hash ?? ((bytes) => sha256Hex(bytes));
  }

  verify(
    entry: FixtureGenerationEntry,
    load: (generationPath: string) => Promise<Uint8Array | ArrayBuffer | Blob>,
  ): Promise<FixtureIntegrityResult> {
    const key = `${entry.generationPath}\0${entry.sha256}\0${entry.sizeBytes}`;
    const existing = this.#cache.get(key);
    if (existing) return existing.then((result) => result.state === 'verified' ? { ...result, cacheHit: true } : result);
    const pending = this.#verifyUncached(entry, load);
    this.#cache.set(key, pending);
    return pending;
  }

  clear(): void {
    this.#cache.clear();
  }

  async #verifyUncached(
    entry: FixtureGenerationEntry,
    load: (generationPath: string) => Promise<Uint8Array | ArrayBuffer | Blob>,
  ): Promise<FixtureIntegrityResult> {
    let bytes: Uint8Array;
    try {
      const loaded = await load(entry.generationPath);
      bytes = loaded instanceof Blob
        ? new Uint8Array(await loaded.arrayBuffer())
        : loaded instanceof Uint8Array
          ? loaded
          : new Uint8Array(loaded);
    } catch (error) {
      if (error instanceof MaterializedMediaMissingError) {
        return {
          state: 'quarantined',
          execution: 'NA_ASSET',
          reasonCode: 'FIXTURE_MEDIA_NOT_MATERIALIZED',
          entry,
          expectedSha256: entry.sha256,
          expectedSizeBytes: entry.sizeBytes,
          detail: error.message,
        };
      }
      return {
        state: 'error', execution: 'ERROR', reasonCode: 'FIXTURE_TRANSPORT_ERROR', entry,
        detail: errorMessage(error),
      };
    }
    if (bytes.byteLength !== entry.sizeBytes) {
      return {
        state: 'quarantined', execution: 'NA_ASSET', reasonCode: 'FIXTURE_SIZE_MISMATCH', entry,
        expectedSha256: entry.sha256, expectedSizeBytes: entry.sizeBytes, actualSizeBytes: bytes.byteLength,
        detail: `expected ${entry.sizeBytes} bytes, got ${bytes.byteLength}`,
      };
    }
    const actualSha256 = this.#hash(bytes, entry);
    if (actualSha256 !== entry.sha256) {
      return {
        state: 'quarantined', execution: 'NA_ASSET', reasonCode: 'FIXTURE_DIGEST_MISMATCH', entry,
        expectedSha256: entry.sha256, actualSha256, expectedSizeBytes: entry.sizeBytes, actualSizeBytes: bytes.byteLength,
        detail: 'active-generation byte digest mismatch',
      };
    }
    return { state: 'verified', entry, bytes, actualSha256, cacheHit: false };
  }
}

export type ActiveFixtureMediaResult =
  | {
      state: 'ready';
      index: FixtureGenerationIndex;
      entry: FixtureGenerationEntry;
      bytes: Uint8Array;
      actualSha256: string;
      cacheHit: boolean;
    }
  | {
      state: 'unavailable';
      execution: 'NA_ASSET';
      reasonCode: string;
      detail: string;
      availabilityState?: FixtureAvailabilityEntry['state'] | 'digest-mismatch';
    }
  | { state: 'error'; execution: 'ERROR'; reasonCode: string; detail: string; httpStatus?: number }
  | { state: 'out-of-scope'; reasonCode: 'FIXTURE_ASSET_OUTSIDE_PUBLICATION_SCOPE'; detail: string };

export interface ActiveFixtureRuntimeOptions {
  indexUrl?: string;
  fixturesBaseUrl?: string;
  fetchImpl?: typeof fetch;
  integrityCache?: FixtureIntegrityCache;
}

/**
 * One instance is one run/cache lifetime. It snapshots the active index once, resolves only immutable
 * generation paths, and retains verified bytes so engines/oracles cannot observe flat-path drift.
 */
export class ActiveFixtureRuntime {
  readonly #indexUrl: string;
  readonly #fixturesBaseUrl: string;
  readonly #fetch: typeof fetch;
  readonly #integrity: FixtureIntegrityCache;
  #index?: Promise<GenerationIndexLoadResult>;
  #manifest?: Promise<ActiveManifestResult>;
  readonly #media = new Map<string, Promise<ActiveFixtureMediaResult>>();
  readonly #evidence = new Map<string, Promise<GoldenEvidenceResult<unknown>>>();

  constructor(options: ActiveFixtureRuntimeOptions = {}) {
    this.#indexUrl = options.indexUrl ?? 'fixtures/generation-index.json';
    this.#fixturesBaseUrl = options.fixturesBaseUrl ?? fixtureBaseFromIndexUrl(this.#indexUrl);
    // Window.fetch performs a Web-IDL receiver check in browsers. Storing it and later invoking it as
    // `this.#fetch(...)` would otherwise bind `this` to ActiveFixtureRuntime and throw
    // "Illegal invocation" before any fixture request is made.
    this.#fetch = (options.fetchImpl ?? globalThis.fetch).bind(globalThis);
    this.#integrity = options.integrityCache ?? new FixtureIntegrityCache();
  }

  loadIndex(): Promise<GenerationIndexLoadResult> {
    this.#index ??= loadFixtureGenerationIndex(this.#indexUrl, this.#fetch);
    return this.#index;
  }

  resolveMedia(assetId: string): Promise<ActiveFixtureMediaResult> {
    const existing = this.#media.get(assetId);
    if (existing) return existing;
    const pending = this.#resolveMediaUncached(assetId);
    this.#media.set(assetId, pending);
    return pending;
  }

  async loadGoldenEvidence<T>(
    assetId: string,
    kind: Exclude<GoldenArtifactKind, 'keys' | 'segments' | 'availability'>,
    parsePayload: (payload: unknown) => T | undefined,
  ): Promise<GoldenEvidenceResult<T> | undefined> {
    const media = await this.resolveMedia(assetId);
    if (media.state === 'out-of-scope') return undefined;
    const logicalPath = goldenLogicalPath(assetId, kind);
    const reference = (entry?: FixtureGenerationEntry): GoldenEvidenceReference => ({
      logicalPath,
      url: entry ? this.#generationUrl(entry.generationPath) : logicalPath,
      ...(media.state === 'ready'
        ? { generationId: media.index.generationId, expectedSourceMediaSha256: media.actualSha256 }
        : {}),
      ...(entry
        ? { expectedArtifactSha256: entry.sha256, expectedArtifactSizeBytes: entry.sizeBytes }
        : {}),
    });
    if (media.state === 'error') {
      return unavailableGoldenEvidence(kind, reference(), 'transport-error', media.reasonCode, media.detail, {
        ...(media.httpStatus !== undefined ? { httpStatus: media.httpStatus } : {}),
      });
    }
    if (media.state === 'unavailable') {
      return unavailableGoldenEvidence(
        kind,
        reference(),
        media.availabilityState === 'pending'
          ? 'pending'
          : media.availabilityState === 'producer-failed'
            ? 'producer-failed'
            : media.availabilityState === 'absent-expected'
              ? 'absent-expected'
              : 'digest-mismatch',
        media.reasonCode,
        media.detail,
      );
    }

    const cacheKey = `${media.index.generationId}\0${logicalPath}\0${kind}`;
    const cached = this.#evidence.get(cacheKey);
    if (cached) return cached as Promise<GoldenEvidenceResult<T>>;
    const pending = this.#loadGoldenEvidenceUncached(media, logicalPath, kind, parsePayload);
    this.#evidence.set(cacheKey, pending as Promise<GoldenEvidenceResult<unknown>>);
    return pending;
  }

  /** A new explicit fixture update starts a new cache lifetime. */
  clear(): void {
    this.#index = undefined;
    this.#manifest = undefined;
    this.#media.clear();
    this.#evidence.clear();
    this.#integrity.clear();
  }

  /**
   * Release verified media/evidence byte graphs while preserving the run's frozen generation index.
   * Exhaustive mode calls this at each candidate boundary so memory is proportional to one variant,
   * not to every decoded packet golden and media body seen earlier in the run.
   */
  releaseMaterializedData(): void {
    this.#media.clear();
    this.#evidence.clear();
    this.#integrity.clear();
  }

  async #resolveMediaUncached(assetId: string): Promise<ActiveFixtureMediaResult> {
    if (!safeAssetId(assetId)) {
      return { state: 'error', execution: 'ERROR', reasonCode: 'FIXTURE_ASSET_ID_INVALID', detail: `'${assetId}' is not a safe canonical asset id` };
    }
    const loaded = await this.loadIndex();
    if (loaded.state !== 'ready') {
      return {
        state: 'error', execution: 'ERROR', reasonCode: loaded.reasonCode, detail: loaded.detail,
        ...(loaded.httpStatus !== undefined ? { httpStatus: loaded.httpStatus } : {}),
      };
    }
    const index = loaded.index;
    const mediaPath = `media/${assetId}`;
    let inScope = index.publicationScope.mode === 'selected-assets'
      ? index.publicationScope.assetIds.includes(assetId)
      : resolveFixtureGenerationEntry(index, mediaPath) !== undefined ||
        resolveFixtureMaterializedMedia(index, mediaPath) !== undefined;
    if (!inScope && index.publicationScope.mode === 'complete-corpus') {
      const manifest = await this.#loadManifest(index);
      if (manifest.state !== 'ready') return manifest.result;
      inScope = manifest.assets.has(assetId);
    }
    if (!inScope) {
      return {
        state: 'out-of-scope',
        reasonCode: 'FIXTURE_ASSET_OUTSIDE_PUBLICATION_SCOPE',
        detail: `'${assetId}' is outside active ${index.publicationScope.mode} scope`,
      };
    }

    const indexedRecord = resolveFixtureGenerationEntry(index, mediaPath);
    const materializedRecord = resolveFixtureMaterializedMedia(index, mediaPath);
    if (!indexedRecord && !materializedRecord) {
      return { state: 'error', execution: 'ERROR', reasonCode: 'FIXTURE_MEDIA_INDEX_RECORD_MISSING', detail: `${mediaPath} is in scope but has no ready/availability record` };
    }
    if (indexedRecord && 'state' in indexedRecord) return availabilityAsMediaResult(indexedRecord);
    const record = indexedRecord ?? materializedMediaAsGenerationEntry(materializedRecord!);
    if (record.artifactKind !== 'media') {
      return { state: 'error', execution: 'ERROR', reasonCode: 'FIXTURE_MEDIA_KIND_INVALID', detail: `${mediaPath} is indexed as '${record.artifactKind}'` };
    }
    const verified = await this.#verify(record, materializedRecord !== undefined);
    if (verified.state === 'error') {
      return { state: 'error', execution: 'ERROR', reasonCode: verified.reasonCode, detail: verified.detail };
    }
    if (verified.state === 'quarantined') {
      return {
        state: 'unavailable', execution: 'NA_ASSET', reasonCode: verified.reasonCode, detail: verified.detail,
        availabilityState: 'digest-mismatch',
      };
    }
    if (record.sourceMediaSha256 !== verified.actualSha256) {
      return {
        state: 'unavailable', execution: 'NA_ASSET', reasonCode: 'FIXTURE_SOURCE_DIGEST_MISMATCH',
        detail: `${mediaPath} source-media digest does not match its verified bytes`, availabilityState: 'digest-mismatch',
      };
    }
    if (index.publicationScope.mode === 'complete-corpus') {
      const manifest = await this.#loadManifest(index);
      if (manifest.state !== 'ready') return manifest.result;
      const declared = manifest.assets.get(assetId);
      if (declared && (declared.sha256 !== verified.actualSha256 || declared.sizeBytes !== verified.bytes.byteLength)) {
        return {
          state: 'unavailable', execution: 'NA_ASSET', reasonCode: 'FIXTURE_MANIFEST_IDENTITY_MISMATCH',
          detail: `${mediaPath} does not match the active manifest identity`, availabilityState: 'digest-mismatch',
        };
      }
    }
    return { state: 'ready', index, entry: record, bytes: verified.bytes, actualSha256: verified.actualSha256, cacheHit: verified.cacheHit };
  }

  async #loadGoldenEvidenceUncached<T>(
    media: Extract<ActiveFixtureMediaResult, { state: 'ready' }>,
    logicalPath: string,
    kind: Exclude<GoldenArtifactKind, 'keys' | 'segments' | 'availability'>,
    parsePayload: (payload: unknown) => T | undefined,
  ): Promise<GoldenEvidenceResult<T>> {
    const record = resolveFixtureGenerationEntry(media.index, logicalPath);
    if (!record) {
      return unavailableGoldenEvidence(
        kind,
        { logicalPath, url: logicalPath, generationId: media.index.generationId, expectedSourceMediaSha256: media.actualSha256 },
        'absent-expected',
        'GOLDEN_NOT_IN_ACTIVE_GENERATION',
        'this exact evidence kind is not published by the active generation',
      );
    }
    if ('state' in record) {
      return unavailableGoldenEvidence(
        kind,
        { logicalPath, url: logicalPath, generationId: media.index.generationId, expectedSourceMediaSha256: media.actualSha256 },
        record.state,
        record.reasonCode,
        record.detail ?? `active generation records '${record.state}'`,
      );
    }
    const reference: GoldenEvidenceReference = {
      logicalPath,
      url: this.#generationUrl(record.generationPath),
      generationId: media.index.generationId,
      expectedArtifactSha256: record.sha256,
      expectedArtifactSizeBytes: record.sizeBytes,
      expectedSourceMediaSha256: media.actualSha256,
    };
    if (record.artifactKind !== kind) {
      return unavailableGoldenEvidence(kind, reference, 'schema-invalid', 'GOLDEN_INDEX_KIND_MISMATCH', `active index kind '${record.artifactKind}' does not match '${kind}'`);
    }
    if (record.sourceMediaSha256 !== media.actualSha256) {
      return unavailableGoldenEvidence(kind, reference, 'digest-mismatch', 'GOLDEN_SOURCE_DIGEST_MISMATCH', 'indexed evidence depends on a different source-media digest', {
        expectedSha256: media.actualSha256,
        actualSha256: record.sourceMediaSha256,
      });
    }
    const verified = await this.#verify(record);
    if (verified.state === 'error') {
      return unavailableGoldenEvidence(kind, reference, 'transport-error', verified.reasonCode, verified.detail);
    }
    if (verified.state === 'quarantined') {
      return unavailableGoldenEvidence(kind, reference, 'digest-mismatch', verified.reasonCode, verified.detail, {
        expectedSha256: record.sha256,
        ...(verified.actualSha256 ? { actualSha256: verified.actualSha256 } : {}),
      });
    }
    return readGoldenEvidenceBytesV1({
      kind,
      reference,
      bytes: verified.bytes,
      actualArtifactSha256: verified.actualSha256,
      parsePayload,
    });
  }

  #verify(entry: FixtureGenerationEntry, materialized = false): Promise<FixtureIntegrityResult> {
    return this.#integrity.verify(entry, async (generationPath) => {
      const response = await this.#fetch(this.#generationUrl(generationPath), { cache: 'no-store' });
      if (!response.ok) {
        if (materialized && response.status === 404) {
          throw new MaterializedMediaMissingError(
            `${entry.logicalPath} is declared by the active generation but is not materialized locally`,
          );
        }
        throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
      }
      return response.arrayBuffer();
    });
  }

  #generationUrl(generationPath: string): string {
    return joinUrl(this.#fixturesBaseUrl, generationPath);
  }

  #loadManifest(index: FixtureGenerationIndex): Promise<ActiveManifestResult> {
    this.#manifest ??= this.#loadManifestUncached(index);
    return this.#manifest;
  }

  async #loadManifestUncached(index: FixtureGenerationIndex): Promise<ActiveManifestResult> {
    const record = resolveFixtureGenerationEntry(index, 'manifest.json');
    if (!record || 'state' in record || record.artifactKind !== 'manifest') {
      return manifestError('GENERATION_MANIFEST_RECORD_INVALID', 'active generation has no ready manifest entry');
    }
    const verified = await this.#verify(record);
    if (verified.state === 'error') return manifestError(verified.reasonCode, verified.detail);
    if (verified.state === 'quarantined') return manifestUnavailable(verified.reasonCode, verified.detail);
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder().decode(verified.bytes)) as unknown;
    } catch (error) {
      return manifestError('GENERATION_MANIFEST_JSON_INVALID', errorMessage(error));
    }
    if (!isRecord(value) || !Array.isArray(value.assets)) {
      return manifestError('GENERATION_MANIFEST_SCHEMA_INVALID', 'active manifest must contain assets[]');
    }
    const assets = new Map<string, { sha256: string; sizeBytes: number }>();
    for (const [position, asset] of value.assets.entries()) {
      if (!isRecord(asset) || !safeAssetId(asset.id)) {
        return manifestError('GENERATION_MANIFEST_SCHEMA_INVALID', `assets[${position}].id is invalid`);
      }
      if (asset.sha256 === null && asset.sizeBytes === null) continue;
      if (!isSha(asset.sha256) || !Number.isSafeInteger(asset.sizeBytes) || Number(asset.sizeBytes) < 0) {
        return manifestError('GENERATION_MANIFEST_SCHEMA_INVALID', `assets[${position}] identity is invalid`);
      }
      assets.set(asset.id, { sha256: asset.sha256, sizeBytes: Number(asset.sizeBytes) });
      if (!resolveFixtureGenerationEntry(index, `media/${asset.id}`) &&
          !resolveFixtureMaterializedMedia(index, `media/${asset.id}`)) {
        return manifestError('GENERATION_MANIFEST_COVERAGE_INVALID', `media/${asset.id} is neither ready nor typed unavailable`);
      }
    }
    return { state: 'ready', assets };
  }
}

type ActiveManifestResult =
  | { state: 'ready'; assets: Map<string, { sha256: string; sizeBytes: number }> }
  | { state: 'blocked'; result: Extract<ActiveFixtureMediaResult, { state: 'unavailable' | 'error' }> };

function validatePublicationScope(
  value: unknown,
  issues: string[],
): FixtureGenerationIndex['publicationScope'] | undefined {
  if (!isRecord(value)) {
    issues.push('publicationScope must be an object');
    return undefined;
  }
  if (value.mode === 'complete-corpus') {
    if (Object.keys(value).some((key) => key !== 'mode')) {
      issues.push("complete-corpus publicationScope may contain only 'mode'");
    }
    return { mode: 'complete-corpus' };
  }
  if (value.mode !== 'selected-assets') {
    issues.push("publicationScope.mode must be 'complete-corpus' or 'selected-assets'");
    return undefined;
  }
  if (Object.keys(value).some((key) => key !== 'mode' && key !== 'assetIds')) {
    issues.push("selected-assets publicationScope may contain only 'mode' and 'assetIds'");
  }
  if (!Array.isArray(value.assetIds) || value.assetIds.length === 0) {
    issues.push('selected-assets publicationScope.assetIds must be a non-empty array');
    return undefined;
  }
  const assetIds: string[] = [];
  const seen = new Set<string>();
  for (const [index, assetId] of value.assetIds.entries()) {
    if (!safeAssetId(assetId)) {
      issues.push(`publicationScope.assetIds[${index}] is not a safe canonical asset id`);
      continue;
    }
    if (seen.has(assetId)) issues.push(`publicationScope.assetIds contains duplicate '${assetId}'`);
    seen.add(assetId);
    assetIds.push(assetId);
  }
  const sorted = [...assetIds].sort(compareCodePoints);
  if (assetIds.some((assetId, index) => assetId !== sorted[index])) {
    issues.push('publicationScope.assetIds must be codepoint-sorted');
  }
  return { mode: 'selected-assets', assetIds };
}

function logicalPathAssetId(logicalPath: unknown, artifactKind?: string): string | undefined {
  if (typeof logicalPath !== 'string') return undefined;
  if (logicalPath.startsWith('media/')) {
    const assetId = logicalPath.slice('media/'.length);
    return safeAssetId(assetId) ? assetId : undefined;
  }
  if (!logicalPath.startsWith('golden/')) return undefined;
  const relative = logicalPath.slice('golden/'.length);
  const suffixByKind: Record<string, string> = {
    metadata: '.meta.json',
    packets: '.packets.json',
    frames: '.frames.json',
    ssim: '.ssim.json',
    alpha: '.alpha.json',
    keys: '.keys.json',
    segments: '.segments.json',
  };
  const suffixes = artifactKind && suffixByKind[artifactKind]
    ? [suffixByKind[artifactKind]]
    : Object.values(suffixByKind);
  const suffix = suffixes.find((candidate) => relative.endsWith(candidate));
  if (!suffix) return undefined;
  const assetId = relative.slice(0, -suffix.length);
  return safeAssetId(assetId) ? assetId : undefined;
}

function goldenLogicalPath(
  assetId: string,
  kind: Exclude<GoldenArtifactKind, 'keys' | 'segments' | 'availability'>,
): string {
  const suffix = kind === 'metadata' ? 'meta' : kind;
  return `golden/${assetId}.${suffix}.json`;
}

function materializedMediaAsGenerationEntry(
  declaration: FixtureMaterializedMedia,
): FixtureGenerationEntry {
  return {
    logicalPath: declaration.logicalPath,
    generationPath: declaration.logicalPath,
    artifactKind: 'media',
    sha256: declaration.sha256,
    sizeBytes: declaration.sizeBytes,
    sourceMediaSha256: declaration.sha256,
    provenanceSha256: declaration.provenanceSha256,
    audit: declaration.audit,
  };
}

function availabilityAsMediaResult(record: FixtureAvailabilityEntry): Extract<ActiveFixtureMediaResult, { state: 'unavailable' }> {
  return {
    state: 'unavailable',
    execution: 'NA_ASSET',
    reasonCode: record.reasonCode,
    detail: record.detail ?? `active generation records '${record.state}'`,
    availabilityState: record.state,
  };
}

function manifestError(reasonCode: string, detail: string): ActiveManifestResult {
  return { state: 'blocked', result: { state: 'error', execution: 'ERROR', reasonCode, detail } };
}

function manifestUnavailable(reasonCode: string, detail: string): ActiveManifestResult {
  return {
    state: 'blocked',
    result: { state: 'unavailable', execution: 'NA_ASSET', reasonCode, detail, availabilityState: 'digest-mismatch' },
  };
}

function fixtureBaseFromIndexUrl(indexUrl: string): string {
  const clean = indexUrl.split(/[?#]/, 1)[0]!;
  const slash = clean.lastIndexOf('/');
  return slash < 0 ? '' : clean.slice(0, slash + 1);
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path}`;
}

function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left, (character) => character.codePointAt(0)!);
  const b = Array.from(right, (character) => character.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return a.length - b.length;
}

function safeAssetId(value: unknown): value is string {
  return safePath(value) && value !== 'manifest.json' && !value.startsWith('media/') && !value.startsWith('golden/');
}

function safePath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.includes('\\') && !value.split('/').some((part) => !part || part === '.' || part === '..');
}

function isSha(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
