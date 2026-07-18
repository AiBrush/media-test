import { canonicalContentHash } from '../core/report.ts';
import { readResultsEnvelope, RESULTS_V2_SCHEMA_ID } from '../core/result-schema.ts';
import type { V1MigrationContext } from '../core/result-schema.ts';
import type { ScenarioResult } from '../core/scenario.ts';
import {
  APP_CACHE_POLICY_SCHEMA,
  strictResultsEnvelope,
} from './run-artifact.ts';
import type {
  CacheHitManifestEntry,
  CacheManifestSnapshot,
} from './run-artifact.ts';

const DB_NAME = 'media-browser-test-results';
const DB_VERSION = 2;
const STORE = 'results';
export const CACHE_VALIDATION_EPOCH = '2026-07-16-results-v2-fingerprint-v3-preflight-config';
export const CACHE_EXPORT_SCHEMA = 'media-browser-test/browser-cache-export@2' as const;

const STATUS_TTL_MS: Partial<Record<ScenarioResult['status'], number>> = {
  ERROR: 15 * 60 * 1_000,
  NA_BROWSER: 24 * 60 * 60 * 1_000,
  SKIPPED: 60 * 60 * 1_000,
};

export type CachedScenarioResult = ScenarioResult;

export interface CachedResultRow {
  key: string;
  createdAtIso: string;
  updatedAtIso: string;
  sourceRunId?: string;
  originalOrigin: string;
  validationEpoch: string;
  result: ScenarioResult;
  invalidated: boolean;
  invalidationReason?: string;
  importedFrom?: string;
}

export interface CacheExportBundle {
  schema: typeof CACHE_EXPORT_SCHEMA;
  generatedAtIso: string;
  sourceOrigin: string;
  validationEpoch: string;
  entries: CachedResultRow[];
  contentHash: string;
}

export interface ResultCache {
  /** This cache validates epoch/TTL and is keyed by the complete selected-input contract. */
  readonly exactSelectionReuse: true;
  get(engineId: string, scenarioId: string, browser: string): Promise<CachedScenarioResult | undefined>;
  put(result: ScenarioResult): Promise<void>;
  list(): Promise<CachedResultRow[]>;
  clear(): Promise<number>;
  clearEngine(engineId: string): Promise<number>;
  setRunContext(runId: string | undefined): void;
  snapshot(forcedFresh?: boolean): Promise<CacheManifestSnapshot>;
  exportBundle(): Promise<CacheExportBundle>;
  importBundle(value: unknown, sourceLabel?: string): Promise<number>;
}

export interface LatestCachedRunView {
  sourceRunId?: string;
  updatedAtIso: string;
  results: ScenarioResult[];
}

export interface ResultCacheOptions {
  onWarning?: (message: string) => void;
  now?: () => Date;
  origin?: string;
  scenarioIdentity?: V1MigrationContext['scenarioIdentity'];
}

interface StoredResultRow {
  key: string;
  lookupKey: string;
  createdAtIso: string;
  updatedAtIso: string;
  validationEpoch: string;
  sourceRunId?: string;
  originalOrigin: string;
  importedFrom?: string;
  result: ScenarioResult;
}

interface CacheState {
  lastError?: string;
  hits: CacheHitManifestEntry[];
  importProvenance?: CacheManifestSnapshot['importProvenance'];
}

function lookupKey(engineId: string, scenarioId: string, browser: string): string {
  return `${browser}\u0000${engineId}\u0000${scenarioId}`;
}

function physicalKey(result: ScenarioResult): string {
  const fingerprint = result.executionFingerprint?.hash ?? canonicalContentHash({
    statusModel: 'pass-diff-fail-na-v1',
    engineId: result.engineId,
    browser: result.browser,
    scenarioId: result.scenarioId,
    definitionHash: result.definitionHash ?? null,
    selection: result.selection ?? null,
    bench: result.bench ?? null,
    status: result.status,
  });
  return `${lookupKey(result.engineId, result.scenarioId, result.browser)}\u0000${fingerprint}`;
}

function registeredScenarioId(cacheScenarioId: string): string {
  const separator = cacheScenarioId.indexOf('#');
  if (separator < 0) return cacheScenarioId;
  const cacheTag = cacheScenarioId.slice(separator + 1);
  return cacheTag.startsWith('selection-sha256:') || cacheTag.startsWith('exhaustive:')
    ? cacheScenarioId.slice(0, separator)
    : cacheScenarioId;
}

/**
 * REGRESSION GUARD (see memory: cache-invalidation-exhaustive-fingerprint): this MUST inspect
 * exhaustive[] entries, not just the top level, or every multi-file scenario is wrongly invalidated
 * and reuse silently stops. A reusable row must carry a full execution-manifest fingerprint. For
 * exhaustive (multi-file)
 * scenarios the aggregate has no top-level fingerprint — each per-file entry in `exhaustive[]` carries
 * its own, and that is what the runtime reuse path (cachedResultFromAggregate) matches against. Accept
 * the row when the fingerprint is present at the top level OR on any exhaustive entry.
 */
function hasExecutionFingerprint(result: ScenarioResult): boolean {
  if (result.executionFingerprint?.hash) return true;
  return Array.isArray(result.exhaustive)
    && result.exhaustive.some((entry) => entry.executionFingerprint?.hash);
}

function invalidationReason(row: StoredResultRow, nowMs: number): string | undefined {
  if (row.validationEpoch !== CACHE_VALIDATION_EPOCH) return 'validation epoch changed';
  if (!hasExecutionFingerprint(row.result)) return 'missing full execution-manifest fingerprint';
  const createdMs = Date.parse(row.createdAtIso);
  if (!Number.isFinite(createdMs)) return 'invalid creation timestamp';
  const ttl = STATUS_TTL_MS[row.result.status];
  if (ttl !== undefined && nowMs - createdMs > ttl) return `${row.result.status} expiry elapsed`;
  return undefined;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('failed to open result cache'));
  });
}

export function createResultCache(options: ResultCacheOptions = {}): ResultCache | undefined {
  if (typeof indexedDB === 'undefined') return undefined;
  const state: CacheState = { hits: [] };
  const now = options.now ?? (() => new Date());
  const origin = options.origin ?? currentOrigin();
  let runId: string | undefined;
  let dbPromise: Promise<IDBDatabase> | undefined;
  const warn = (action: string, error: unknown): void => {
    const detail = error instanceof Error ? error.message : String(error);
    const message = `cache unavailable (${action}): ${detail}`;
    state.lastError = message;
    options.onWarning?.(message);
  };
  const db = async (): Promise<IDBDatabase> => {
    try {
      return await (dbPromise ??= openDb());
    } catch (error) {
      dbPromise = undefined;
      warn('open', error);
      throw error;
    }
  };

  const deleteMatching = async (matches: (row: StoredResultRow) => boolean): Promise<number> => {
    try {
      const database = await db();
      return await new Promise((resolve, reject) => {
        const tx = database.transaction(STORE, 'readwrite');
        const req = tx.objectStore(STORE).openCursor();
        let deleted = 0;
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return;
          const row = cursor.value as StoredResultRow;
          if (matches(row)) {
            cursor.delete();
            deleted += 1;
          }
          cursor.continue();
        };
        req.onerror = () => reject(req.error ?? new Error('failed to scan result cache'));
        tx.oncomplete = () => resolve(deleted);
        tx.onerror = () => reject(tx.error ?? new Error('failed to clear result cache'));
      });
    } catch (error) {
      warn('clear', error);
      throw error;
    }
  };

  const api: ResultCache = {
    exactSelectionReuse: true,
    async get(engineId, scenarioId, browser) {
      try {
        const wanted = lookupKey(engineId, scenarioId, browser);
        const rows = await readAllRows(await db());
        const valid = rows
          .filter((row) => row.lookupKey === wanted && invalidationReason(row, now().getTime()) === undefined)
          .sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
        const row = valid[0];
        if (!row) return undefined;
        const sourceObservationHash = row.result.executionFingerprint?.hash ?? canonicalContentHash(row.result);
        const hit: CacheHitManifestEntry = {
          key: row.key,
          ...(row.sourceRunId ? { sourceRunId: row.sourceRunId } : {}),
          createdAtIso: row.createdAtIso,
          originalOrigin: row.originalOrigin,
          ...(row.result.env ? { originalEnvironment: row.result.env } : {}),
          validationEpoch: row.validationEpoch,
          validBecause: 'validation epoch, transient TTL, and full execution fingerprint are current',
          ...(row.importedFrom ? { importedFrom: row.importedFrom } : {}),
        };
        const cacheReuse = {
          schema: 'media-test/cache-reuse@1' as const,
          sourceKey: row.key,
          sourceObservationHash,
          ...(row.sourceRunId ? { sourceRunId: row.sourceRunId } : {}),
          createdAtIso: row.createdAtIso,
          originalOrigin: row.originalOrigin,
          validationEpoch: row.validationEpoch,
          validBecause: hit.validBecause,
          ...(row.importedFrom ? { importedFrom: row.importedFrom } : {}),
          ...(row.result.env ? { sourceEnvironment: row.result.env } : {}),
          ...(row.result.selection ? { selectionEnvelope: row.result.selection } : {}),
        };
        const clean = stripRuntimeCacheReuse(row.result);
        return {
          ...clean,
          cacheReuse,
          ...(clean.exhaustive ? {
            exhaustive: clean.exhaustive.map((entry) => ({ ...entry, cacheReuse })),
          } : {}),
        } as CachedScenarioResult;
      } catch (error) {
        warn('read', error);
        throw error;
      }
    },
    async put(result) {
      try {
        // A lookup is only a candidate. The runner re-probes and fingerprint-checks it before this
        // put boundary, so provenance becomes a manifest hit only when the returned live result
        // still carries cacheReuse here.
        recordConfirmedCacheHits(state, result);
        const storedResult = stripRuntimeCacheReuse(result);
        const database = await db();
        const key = physicalKey(storedResult);
        const existing = await getStored(database, key);
        const instant = now().toISOString();
        await putStored(database, {
          key,
          lookupKey: lookupKey(storedResult.engineId, storedResult.scenarioId, storedResult.browser),
          createdAtIso: existing?.createdAtIso ?? instant,
          updatedAtIso: instant,
          validationEpoch: CACHE_VALIDATION_EPOCH,
          ...(runId ? { sourceRunId: runId } : existing?.sourceRunId ? { sourceRunId: existing.sourceRunId } : {}),
          originalOrigin: existing?.originalOrigin ?? origin,
          ...(existing?.importedFrom ? { importedFrom: existing.importedFrom } : {}),
          result: storedResult,
        });
      } catch (error) {
        warn(errorName(error) === 'QuotaExceededError' ? 'quota exceeded' : 'write', error);
        throw error;
      }
    },
    async list() {
      try {
        const rows = await readAllRows(await db());
        const instant = now().getTime();
        return rows.map((row) => {
          const reason = invalidationReason(row, instant);
          return {
            key: row.key,
            createdAtIso: row.createdAtIso,
            updatedAtIso: row.updatedAtIso,
            ...(row.sourceRunId ? { sourceRunId: row.sourceRunId } : {}),
            originalOrigin: row.originalOrigin,
            validationEpoch: row.validationEpoch,
            result: row.result,
            invalidated: reason !== undefined,
            ...(reason ? { invalidationReason: reason } : {}),
            ...(row.importedFrom ? { importedFrom: row.importedFrom } : {}),
          };
        }).sort((a, b) =>
          a.result.browser.localeCompare(b.result.browser) ||
          a.result.engineId.localeCompare(b.result.engineId) ||
          a.result.scenarioId.localeCompare(b.result.scenarioId) ||
          b.updatedAtIso.localeCompare(a.updatedAtIso));
      } catch (error) {
        warn('list', error);
        throw error;
      }
    },
    async clear() {
      return deleteMatching(() => true);
    },
    async clearEngine(engineId) {
      return deleteMatching((row) => {
        const storedEngineId = row.result.engineId;
        return storedEngineId === engineId || storedEngineId.startsWith(`${engineId}@`);
      });
    },
    setRunContext(nextRunId) {
      runId = nextRunId;
      state.hits = [];
    },
    async snapshot(forcedFresh = false) {
      let entries: CachedResultRow[] = [];
      try {
        // `forcedFresh` is a run policy, not a claim that the origin contains no cache entries.
        // Always report the real entry count so the manifest remains an honest storage snapshot.
        entries = await api.list();
      } catch {
        // The warning has already been recorded. Snapshot construction itself stays total.
      }
      const estimate = await storageEstimate();
      return deepFreeze({
        schema: APP_CACHE_POLICY_SCHEMA,
        origin,
        available: state.lastError === undefined,
        persistence: 'origin-scoped-best-effort',
        validationEpoch: CACHE_VALIDATION_EPOCH,
        expiry: {
          PASS: 'until validation epoch changes',
          DIFF: 'until validation epoch changes',
          FAIL: 'until validation epoch changes',
          NA_ENGINE: 'until validation epoch changes',
          NA_ASSET: 'until validation epoch changes',
          NA_BROWSER: '24 hours or validation epoch change',
          ERROR: '15 minutes or validation epoch change',
          SKIPPED: '1 hour or validation epoch change',
        },
        forcedFresh,
        entryCount: entries.length,
        invalidatedCount: entries.filter((entry) => entry.invalidated).length,
        hits: [...state.hits],
        ...(state.lastError ? { lastError: state.lastError } : {}),
        ...(estimate ? { estimate } : {}),
        ...(state.importProvenance ? { importProvenance: state.importProvenance } : {}),
      });
    },
    async exportBundle() {
      const entries = await api.list();
      const generatedAtIso = now().toISOString();
      // IndexedDB keeps the live runner shape so reuse does not depend on a persistence adapter.
      // The explicit cross-origin bundle is a trust boundary, though, and import deliberately
      // accepts only results@2. Persist every row through the same canonical writer used by raw
      // run export so a bundle produced here is necessarily consumable by the strict importer.
      const strict = strictResultsEnvelope(
        entries.map((entry) => entry.result),
        generatedAtIso,
        undefined,
        undefined,
        options.scenarioIdentity
          ? (cacheScenarioId) => options.scenarioIdentity?.(registeredScenarioId(cacheScenarioId))
          : undefined,
      );
      const persistedEntries = entries.map((entry, index) => ({
        ...entry,
        result: strict.results[index]!,
      }));
      const substantive = {
        schema: CACHE_EXPORT_SCHEMA,
        generatedAtIso,
        sourceOrigin: origin,
        validationEpoch: CACHE_VALIDATION_EPOCH,
        entries: persistedEntries,
      };
      return deepFreeze({ ...substantive, contentHash: canonicalContentHash(substantive) });
    },
    async importBundle(value, sourceLabel = 'user-selected cache bundle') {
      const bundle = validateCacheExportBundle(value);
      if (bundle.validationEpoch !== CACHE_VALIDATION_EPOCH) {
        throw new Error(
          `cache import validation epoch '${bundle.validationEpoch}' does not match '${CACHE_VALIDATION_EPOCH}'`,
        );
      }
      const strict = readResultsEnvelope({
        schema: RESULTS_V2_SCHEMA_ID,
        generatedAtIso: bundle.generatedAtIso,
        results: bundle.entries.map((entry) => entry.result),
      });
      let imported = 0;
      for (let index = 0; index < strict.results.length; index++) {
        const result = strict.results[index]!;
        const source = bundle.entries[index]!;
        const importedResult = stripRuntimeCacheReuse(result);
        const candidate: StoredResultRow = {
          key: physicalKey(importedResult),
          lookupKey: lookupKey(importedResult.engineId, importedResult.scenarioId, importedResult.browser),
          createdAtIso: source.createdAtIso,
          updatedAtIso: source.updatedAtIso,
          validationEpoch: source.validationEpoch,
          ...(source.sourceRunId ? { sourceRunId: source.sourceRunId } : {}),
          originalOrigin: source.originalOrigin || bundle.sourceOrigin,
          result: importedResult,
        };
        if (source.invalidated || invalidationReason(candidate, now().getTime()) !== undefined) continue;
        const database = await db();
        const instant = now().toISOString();
        await putStored(database, {
          key: candidate.key,
          lookupKey: candidate.lookupKey,
          createdAtIso: source.createdAtIso,
          updatedAtIso: instant,
          validationEpoch: CACHE_VALIDATION_EPOCH,
          ...(source.sourceRunId ? { sourceRunId: source.sourceRunId } : {}),
          originalOrigin: source.originalOrigin || bundle.sourceOrigin,
          importedFrom: `${sourceLabel} (${bundle.sourceOrigin})`,
          result: importedResult,
        });
        imported++;
      }
      state.importProvenance = {
        sourceOrigin: bundle.sourceOrigin,
        importedAtIso: now().toISOString(),
        contentHash: bundle.contentHash,
      };
      return imported;
    },
  };
  return api;
}

export function unavailableCacheSnapshot(error = 'IndexedDB is not available'): CacheManifestSnapshot {
  return deepFreeze({
    schema: APP_CACHE_POLICY_SCHEMA,
    origin: currentOrigin(),
    available: false,
    persistence: 'origin-scoped-best-effort',
    validationEpoch: CACHE_VALIDATION_EPOCH,
    expiry: {},
    forcedFresh: true,
    entryCount: 0,
    invalidatedCount: 0,
    hits: [],
    lastError: error,
  });
}

/**
 * Build a display-only view of the most recently written run from the existing result cache.
 *
 * This deliberately does not grant cache reuse: `ResultCache.get()` remains the only path that
 * applies fingerprint/TTL validation before a cached observation can replace live execution. The
 * view merely reconstructs the latest run's visible cells after a reload, including current-epoch
 * rows that are useful as terminal diagnostics but are not semantically reusable.
 */
export function latestCachedRunView(
  entries: readonly CachedResultRow[],
  browser: string,
  registeredScenarioIds: readonly string[],
): LatestCachedRunView | undefined {
  const registered = new Set(registeredScenarioIds);
  const candidates = entries
    .filter((entry) =>
      entry.validationEpoch === CACHE_VALIDATION_EPOCH &&
      entry.result.browser === browser &&
      registered.has(registeredScenarioId(entry.result.scenarioId)) &&
      Number.isFinite(Date.parse(entry.updatedAtIso)))
    .sort((left, right) =>
      right.updatedAtIso.localeCompare(left.updatedAtIso) || right.key.localeCompare(left.key));
  if (candidates.length === 0) return undefined;

  // Rows written during a run already carry sourceRunId. Prefer the newest such group so a page
  // refresh never mixes cells from unrelated runs. Legacy/imported rows without run attribution are
  // still useful as a fallback cache view, deduplicated to the newest observation per logical cell.
  const newestAttributed = candidates.find((entry) => entry.sourceRunId !== undefined);
  const sourceRunId = newestAttributed?.sourceRunId;
  const selected = sourceRunId
    ? candidates.filter((entry) => entry.sourceRunId === sourceRunId)
    : candidates;
  const byCell = new Map<string, CachedResultRow>();
  for (const entry of selected) {
    const scenarioId = registeredScenarioId(entry.result.scenarioId);
    const key = `${entry.result.engineId}\u0000${scenarioId}`;
    if (!byCell.has(key)) byCell.set(key, entry);
  }
  const results = [...byCell.values()]
    .map((entry) => {
      const scenarioId = registeredScenarioId(entry.result.scenarioId);
      return scenarioId === entry.result.scenarioId
        ? entry.result
        : { ...entry.result, scenarioId };
    })
    .sort((left, right) =>
      left.scenarioId.localeCompare(right.scenarioId) || left.engineId.localeCompare(right.engineId));
  if (results.length === 0) return undefined;
  return {
    ...(sourceRunId ? { sourceRunId } : {}),
    updatedAtIso: selected[0]!.updatedAtIso,
    results,
  };
}

export function validateCacheExportBundle(value: unknown): CacheExportBundle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('cache import must be an object');
  const record = value as Record<string, unknown>;
  if (record.schema !== CACHE_EXPORT_SCHEMA) throw new Error(`cache import must declare ${CACHE_EXPORT_SCHEMA}`);
  if (typeof record.generatedAtIso !== 'string' || !Number.isFinite(Date.parse(record.generatedAtIso))) {
    throw new Error('cache import generatedAtIso is invalid');
  }
  if (typeof record.sourceOrigin !== 'string' || !record.sourceOrigin) throw new Error('cache import sourceOrigin is missing');
  if (typeof record.validationEpoch !== 'string' || !record.validationEpoch) {
    throw new Error('cache import validationEpoch is missing');
  }
  if (!Array.isArray(record.entries)) throw new Error('cache import entries must be an array');
  if (typeof record.contentHash !== 'string') throw new Error('cache import contentHash is missing');
  const substantive = { ...record };
  delete substantive.contentHash;
  const expected = canonicalContentHash(substantive);
  if (record.contentHash !== expected) throw new Error(`cache import contentHash mismatch; expected ${expected}`);
  for (const [index, entry] of record.entries.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`cache import entries[${index}] must be an object`);
    }
    const row = entry as Record<string, unknown>;
    for (const field of ['key', 'createdAtIso', 'updatedAtIso', 'originalOrigin', 'validationEpoch'] as const) {
      if (typeof row[field] !== 'string' || !row[field]) {
        throw new Error(`cache import entries[${index}].${field} is missing`);
      }
    }
    if (!Number.isFinite(Date.parse(row.createdAtIso as string)) || !Number.isFinite(Date.parse(row.updatedAtIso as string))) {
      throw new Error(`cache import entries[${index}] has an invalid timestamp`);
    }
    if (typeof row.invalidated !== 'boolean') {
      throw new Error(`cache import entries[${index}].invalidated must be boolean`);
    }
    if (!row.result || typeof row.result !== 'object' || Array.isArray(row.result)) {
      throw new Error(`cache import entries[${index}].result must be an object`);
    }
  }
  return deepFreeze(record) as unknown as CacheExportBundle;
}

function recordConfirmedCacheHits(state: CacheState, result: ScenarioResult): void {
  const reuses = [
    result.cacheReuse,
    ...(result.exhaustive ?? []).map((entry) => entry.cacheReuse),
  ].filter((entry): entry is NonNullable<ScenarioResult['cacheReuse']> => entry !== undefined);
  for (const reuse of reuses) {
    if (state.hits.some((entry) => entry.key === reuse.sourceKey)) continue;
    state.hits.push({
      key: reuse.sourceKey,
      ...(reuse.sourceRunId ? { sourceRunId: reuse.sourceRunId } : {}),
      createdAtIso: reuse.createdAtIso,
      originalOrigin: reuse.originalOrigin,
      ...(reuse.sourceEnvironment ? { originalEnvironment: reuse.sourceEnvironment } : {}),
      validationEpoch: reuse.validationEpoch,
      validBecause: reuse.validBecause,
      ...(reuse.importedFrom ? { importedFrom: reuse.importedFrom } : {}),
    });
  }
}

/** Cache reuse is run provenance, not part of the reusable semantic observation itself. */
function stripRuntimeCacheReuse(result: ScenarioResult): ScenarioResult {
  const clean = { ...result };
  delete clean.cacheReuse;
  if (clean.exhaustive) {
    clean.exhaustive = clean.exhaustive.map((entry) => {
      const file = { ...entry };
      delete file.cacheReuse;
      return file;
    });
  }
  return clean;
}

async function getStored(database: IDBDatabase, key: string): Promise<StoredResultRow | undefined> {
  return await new Promise((resolve, reject) => {
    const tx = database.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as StoredResultRow | undefined);
    req.onerror = () => reject(req.error ?? new Error('failed to read result cache'));
  });
}

async function putStored(database: IDBDatabase, row: StoredResultRow): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('failed to write result cache'));
    tx.onabort = () => reject(tx.error ?? new Error('result cache write aborted'));
  });
}

async function readAllRows(database: IDBDatabase): Promise<StoredResultRow[]> {
  return await new Promise((resolve, reject) => {
    const tx = database.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).openCursor();
    const rows: StoredResultRow[] = [];
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      const value = cursor.value as Partial<StoredResultRow>;
      if (value.result && typeof value.key === 'string') {
        rows.push({
          key: value.key,
          lookupKey: value.lookupKey ?? lookupKey(value.result.engineId, value.result.scenarioId, value.result.browser),
          createdAtIso: value.createdAtIso ?? value.updatedAtIso ?? new Date(0).toISOString(),
          updatedAtIso: value.updatedAtIso ?? value.createdAtIso ?? new Date(0).toISOString(),
          validationEpoch: value.validationEpoch ?? 'legacy',
          ...(value.sourceRunId ? { sourceRunId: value.sourceRunId } : {}),
          originalOrigin: value.originalOrigin ?? 'unknown legacy origin',
          ...(value.importedFrom ? { importedFrom: value.importedFrom } : {}),
          result: value.result,
        });
      }
      cursor.continue();
    };
    req.onerror = () => reject(req.error ?? new Error('failed to list result cache'));
    tx.oncomplete = () => resolve(rows);
    tx.onerror = () => reject(tx.error ?? new Error('failed to list result cache'));
  });
}

async function storageEstimate(): Promise<{ usage?: number; quota?: number } | undefined> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (!estimate) return undefined;
    return {
      ...(typeof estimate.usage === 'number' && Number.isFinite(estimate.usage) ? { usage: estimate.usage } : {}),
      ...(typeof estimate.quota === 'number' && Number.isFinite(estimate.quota) ? { quota: estimate.quota } : {}),
    };
  } catch {
    return undefined;
  }
}

function currentOrigin(): string {
  return typeof location === 'undefined' ? 'unknown-origin' : location.origin;
}

function errorName(error: unknown): string {
  return error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
