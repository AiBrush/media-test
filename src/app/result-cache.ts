import type { ScenarioResult } from '../core/scenario.ts';

const DB_NAME = 'media-browser-test-results';
const DB_VERSION = 1;
const STORE = 'results';
const INVALIDATED_PASS_KEYS = new Set([
  'ffmpeg.wasm@0.12.15\u0000transcode/ladder_large_vp9_1080p_120s_to_h264_720p',
  'ffmpeg.wasm@0.12.15\u0000transcode/h264_to_mkv',
  'ffmpeg.wasm@0.12.15\u0000transcode/h264_to_ts',
]);

export interface CachedScenarioResult extends ScenarioResult {
  cached?: true;
}

export interface ResultCache {
  get(engineId: string, scenarioId: string, browser: string): Promise<CachedScenarioResult | undefined>;
  put(result: ScenarioResult): Promise<void>;
}

function cacheKey(engineId: string, scenarioId: string, browser: string): string {
  return `${browser}\u0000${engineId}\u0000${scenarioId}`;
}

function shouldInvalidateCachedResult(result: ScenarioResult): boolean {
  return result.status === 'PASS' && INVALIDATED_PASS_KEYS.has(`${result.engineId}\u0000${result.scenarioId}`);
}

export function isReusableResult(result: ScenarioResult | undefined): result is ScenarioResult {
  return result?.status === 'PASS' || result?.status === 'NA_ENGINE' || result?.status === 'NA_BROWSER' || result?.status === 'NA_ASSET';
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
  };
}
