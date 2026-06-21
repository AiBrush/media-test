import type { ScenarioResult } from '../core/scenario.ts';

const DB_NAME = 'media-browser-test-results';
const DB_VERSION = 1;
const STORE = 'results';
const INVALIDATED_PASS_KEYS = new Set([
  'ffmpeg.wasm@0.12.15\u0000transcode/ladder_large_vp9_1080p_120s_to_h264_720p',
  'ffmpeg.wasm@0.12.15\u0000transcode/h264_to_mkv',
  'ffmpeg.wasm@0.12.15\u0000transcode/h264_to_ts',
  'ffmpeg.wasm@0.12.15\u0000transcode/h264_to_hevc_mp4',
  'ffmpeg.wasm@0.12.15\u0000transcode/h264_to_vp8_webm',
  'ffmpeg.wasm@0.12.15\u0000transcode/vp9_alpha_to_vp9_keepalpha',
  'ffmpeg.wasm@0.12.15\u0000trim/vp9_alpha_keyframe_aligned',
]);

export interface CachedScenarioResult extends ScenarioResult {
  cached?: true;
}

export interface CachedResultRow {
  key: string;
  updatedAtIso?: string;
  result: ScenarioResult;
  invalidated: boolean;
}

export interface ResultCache {
  get(engineId: string, scenarioId: string, browser: string): Promise<CachedScenarioResult | undefined>;
  put(result: ScenarioResult): Promise<void>;
  list(): Promise<CachedResultRow[]>;
}

interface StoredResultRow {
  key?: unknown;
  updatedAtIso?: string;
  result?: ScenarioResult;
}

function cacheKey(engineId: string, scenarioId: string, browser: string): string {
  return `${browser}\u0000${engineId}\u0000${scenarioId}`;
}

function shouldInvalidateCachedResult(result: ScenarioResult): boolean {
  return result.status === 'PASS' && INVALIDATED_PASS_KEYS.has(`${result.engineId}\u0000${result.scenarioId}`);
}

export function isReusableResult(result: ScenarioResult | undefined): result is ScenarioResult {
  return result?.status === 'PASS';
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

export function createResultCache(): ResultCache | undefined {
  if (typeof indexedDB === 'undefined') return undefined;
  let dbPromise: Promise<IDBDatabase> | undefined;
  const db = () => (dbPromise ??= openDb());

  return {
    async get(engineId, scenarioId, browser) {
      const key = cacheKey(engineId, scenarioId, browser);
      const database = await db();
      return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => {
          const row = req.result as { result?: ScenarioResult } | undefined;
          if (!row?.result || shouldInvalidateCachedResult(row.result)) {
            resolve(undefined);
            return;
          }
          resolve({ ...row.result, cached: true });
        };
        req.onerror = () => reject(req.error ?? new Error('failed to read result cache'));
      });
    },
    async put(result) {
      const database = await db();
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({
          key: cacheKey(result.engineId, result.scenarioId, result.browser),
          updatedAtIso: new Date().toISOString(),
          result,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('failed to write result cache'));
      });
    },
    async list() {
      const database = await db();
      const rows = await new Promise<CachedResultRow[]>((resolve, reject) => {
        const tx = database.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).openCursor();
        const out: CachedResultRow[] = [];
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return;
          const row = cursor.value as StoredResultRow;
          if (row?.result) {
            out.push({
              key: typeof row.key === 'string' ? row.key : String(cursor.key),
              updatedAtIso: row.updatedAtIso,
              result: row.result,
              invalidated: shouldInvalidateCachedResult(row.result),
            });
          }
          cursor.continue();
        };
        req.onerror = () => reject(req.error ?? new Error('failed to list result cache'));
        tx.oncomplete = () => resolve(out);
        tx.onerror = () => reject(tx.error ?? new Error('failed to list result cache'));
      });
      return rows.sort(
        (a, b) =>
          a.result.browser.localeCompare(b.result.browser) ||
          a.result.engineId.localeCompare(b.result.engineId) ||
          a.result.scenarioId.localeCompare(b.result.scenarioId),
      );
    },
  };
}
