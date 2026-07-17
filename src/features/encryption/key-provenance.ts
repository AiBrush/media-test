import type { DecryptKey, EncryptionScheme } from '../../core/engine.ts';
import { sha256Hex } from '../../core/seeded-rng.ts';
import {
  encryptionKeyProvenanceFromOptions,
  isAes128Hex,
  isCencIvHex,
  isEncryptionScheme,
  type EncryptionKeyProvenance,
  type HlsEncryptionContract,
  type HlsResourceIndex,
  type ScenarioDecryptKey,
} from './contracts.ts';

export interface AuthoritativeKeyRecord extends DecryptKey {
  readonly assetId: string;
  readonly scheme: EncryptionScheme;
  readonly ivMode?: 'explicit' | 'media-sequence' | 'per-sample' | 'constant';
  /** URI→key map is required when an HLS playlist rotates across more than one key URI. */
  readonly keySet?: Readonly<Record<string, string>>;
}

export interface AuthoritativeHlsKey {
  readonly keyRef: string;
  readonly keyHex: string;
}

export type HlsKeyResourceParityDecision =
  | { readonly state: 'PASS'; readonly keys: readonly AuthoritativeHlsKey[] }
  | {
      readonly state: 'ERROR';
      readonly reasonCode: 'HLS_KEY_RESOURCE_PARITY_MISMATCH';
      readonly detail: string;
    };

export type KeyRecordLoadResult =
  | { readonly state: 'OK'; readonly value: unknown }
  | { readonly state: 'MISSING'; readonly detail: string }
  | { readonly state: 'ERROR'; readonly detail: string };

export type KeyRecordLoader = (url: string) => Promise<KeyRecordLoadResult>;

export type EncryptionKeyPreflightDecision =
  | {
      readonly state: 'READY';
      readonly key: DecryptKey;
      readonly record?: AuthoritativeKeyRecord;
      readonly provenance: EncryptionKeyProvenance;
    }
  | {
      readonly state: 'BLOCKED';
      readonly status: 'NA_ASSET' | 'ERROR';
      readonly reasonCode:
        | 'ENCRYPTION_KEY_PROVENANCE_MISSING'
        | 'ENCRYPTION_KEY_RECORD_MISSING'
        | 'ENCRYPTION_KEY_RECORD_LOAD_ERROR'
        | 'ENCRYPTION_KEY_RECORD_INVALID'
        | 'ENCRYPTION_KEY_PROVENANCE_MISMATCH'
        | 'ENCRYPTION_KEY_NEGATIVE_MUTATION_INVALID';
      readonly detail: string;
    };

/** Strict browser loader. A fetch or parse failure is evidence, never silently treated as parity. */
export const fetchAuthoritativeKeyRecord: KeyRecordLoader = async (url) => {
  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-store' });
  } catch (error) {
    return { state: 'ERROR', detail: `failed to fetch ${url}: ${errorMessage(error)}` };
  }
  if (response.status === 404) return { state: 'MISSING', detail: `${url} returned HTTP 404` };
  if (!response.ok) return { state: 'ERROR', detail: `${url} returned HTTP ${response.status}` };
  try {
    return { state: 'OK', value: await response.json() };
  } catch (error) {
    return { state: 'ERROR', detail: `${url} is not valid JSON: ${errorMessage(error)}` };
  }
};

/**
 * Validate one committed key record without repairing or normalizing it. Lowercase, exact-width
 * fixture material is required so every adapter receives byte-identical key/KID/IV input.
 */
export function parseAuthoritativeKeyRecord(value: unknown): AuthoritativeKeyRecord {
  if (!isRecord(value)) throw new TypeError('key record must be a plain object');
  if (typeof value.assetId !== 'string' || value.assetId.trim() !== value.assetId || !value.assetId) {
    throw new TypeError('key record assetId must be a non-empty canonical string');
  }
  if (!isEncryptionScheme(value.scheme) || value.scheme === 'clearkey') {
    throw new TypeError('key record scheme must name a raw media protection scheme');
  }
  if (!isAes128Hex(value.keyHex)) throw new TypeError('key record keyHex must contain exactly 16 lowercase bytes');

  const cenc = value.scheme === 'cenc-ctr' || value.scheme === 'cenc-cens' || value.scheme === 'cenc-cbcs';
  if (cenc && !isAes128Hex(value.kid)) {
    throw new TypeError('CENC key record kid must contain exactly 16 lowercase bytes');
  }
  if (!cenc && value.kid !== undefined) throw new TypeError('HLS key record must not carry a CENC KID');
  if (value.ivHex !== undefined && !(cenc ? isCencIvHex(value.ivHex) : isAes128Hex(value.ivHex))) {
    throw new TypeError(
      cenc
        ? 'CENC key record ivHex must contain exactly 8 or 16 lowercase bytes'
        : 'HLS key record ivHex must contain exactly 16 lowercase bytes',
    );
  }
  const ivMode = value.ivMode;
  if (ivMode !== undefined &&
      ivMode !== 'explicit' && ivMode !== 'media-sequence' && ivMode !== 'per-sample' && ivMode !== 'constant') {
    throw new TypeError('key record ivMode is unknown');
  }
  if (ivMode === 'explicit' && value.ivHex === undefined) {
    throw new TypeError('explicit-IV key record requires ivHex');
  }
  if (ivMode === 'media-sequence' && value.ivHex !== undefined) {
    throw new TypeError('media-sequence key record must omit ivHex');
  }
  if (!cenc && (ivMode === 'per-sample' || ivMode === 'constant')) {
    throw new TypeError(`HLS key record cannot use CENC IV mode '${ivMode}'`);
  }
  if (cenc && (ivMode === 'explicit' || ivMode === 'media-sequence')) {
    throw new TypeError(`CENC key record cannot use HLS IV mode '${ivMode}'`);
  }
  if (ivMode === 'constant' && (!isAes128Hex(value.ivHex) || value.scheme !== 'cenc-cbcs')) {
    throw new TypeError('constant-IV key record requires cenc-cbcs and exactly 16 IV bytes');
  }
  let keySet: Readonly<Record<string, string>> | undefined;
  if (value.keySet !== undefined) {
    if (cenc || !isRecord(value.keySet) || Object.keys(value.keySet).length === 0) {
      throw new TypeError('key record keySet is a non-empty HLS-only URI-to-key object');
    }
    const parsed: Record<string, string> = {};
    for (const [keyRef, keyHex] of Object.entries(value.keySet)) {
      if (!isCanonicalHlsKeyRef(keyRef) || !isAes128Hex(keyHex)) {
        throw new TypeError('key record keySet requires canonical local URIs and 16-byte lowercase keys');
      }
      parsed[keyRef] = keyHex;
    }
    keySet = Object.freeze(parsed);
  }

  return Object.freeze({
    assetId: value.assetId,
    scheme: value.scheme,
    keyHex: value.keyHex,
    ...(typeof value.kid === 'string' ? { kid: value.kid } : {}),
    ...(typeof value.ivHex === 'string' ? { ivHex: value.ivHex } : {}),
    ...(ivMode !== undefined ? { ivMode } : {}),
    ...(keySet ? { keySet } : {}),
  });
}

/**
 * Blocking, engine-independent preflight. Positive/malformed rows use the authoritative bytes from
 * the loaded record. Deliberate negative mutations are admitted only when they are exactly the
 * declared kind of difference; accidental mirror drift remains a harness ERROR.
 */
export async function preflightEncryptionKey(
  options: unknown,
  load: KeyRecordLoader = fetchAuthoritativeKeyRecord,
): Promise<EncryptionKeyPreflightDecision> {
  const provenance = encryptionKeyProvenanceFromOptions(options);
  const key = scenarioKeyFromOptions(options);
  if (!provenance || !key) {
    return blocked(
      'ERROR',
      'ENCRYPTION_KEY_PROVENANCE_MISSING',
      'decrypt scenario has no versioned key provenance descriptor',
    );
  }

  if (provenance.use === 'clear-input-sentinel') {
    return key.keyHex === '00000000000000000000000000000000' && key.kid === undefined && key.ivHex === undefined
      ? { state: 'READY', key: stripScenarioKey(key), provenance }
      : blocked(
          'ERROR',
          'ENCRYPTION_KEY_PROVENANCE_MISMATCH',
          'clear-input sentinel must be the exact all-zero 128-bit key with no KID/IV',
        );
  }
  if (provenance.use === 'eme-negative') {
    return provenance.keySystem === 'org.w3.clearkey' && provenance.rawDecryptForbidden === true
      ? { state: 'READY', key: stripScenarioKey(key), provenance }
      : blocked(
          'ERROR',
          'ENCRYPTION_KEY_PROVENANCE_MISMATCH',
          'Clear Key negative must explicitly forbid the raw decrypt primitive',
        );
  }

  const sourceRecord = provenance.sourceRecord;
  if (!sourceRecord) {
    return blocked('ERROR', 'ENCRYPTION_KEY_PROVENANCE_MISSING', 'key provenance does not name its authoritative record');
  }
  const loaded = await load(sourceRecord);
  if (loaded.state === 'MISSING') {
    return blocked('NA_ASSET', 'ENCRYPTION_KEY_RECORD_MISSING', loaded.detail);
  }
  if (loaded.state === 'ERROR') {
    return blocked('ERROR', 'ENCRYPTION_KEY_RECORD_LOAD_ERROR', loaded.detail);
  }
  let record: AuthoritativeKeyRecord;
  try {
    record = parseAuthoritativeKeyRecord(loaded.value);
  } catch (error) {
    return blocked('ERROR', 'ENCRYPTION_KEY_RECORD_INVALID', errorMessage(error));
  }
  if (record.assetId !== provenance.assetId) {
    return blocked(
      'ERROR',
      'ENCRYPTION_KEY_PROVENANCE_MISMATCH',
      `record asset '${record.assetId}' does not match provenance '${provenance.assetId}'`,
    );
  }

  if (provenance.hls) {
    try {
      authoritativeHlsKeys(record, provenance.hls);
    } catch (error) {
      return blocked('ERROR', 'ENCRYPTION_KEY_RECORD_INVALID', errorMessage(error));
    }
  }

  const parity = assessDeclaredKey(record, key, provenance);
  if (parity) return parity;
  const authoritativeUse = provenance.use === 'authoritative-positive' || provenance.use === 'malformed-protection';
  return {
    state: 'READY',
    key: authoritativeUse ? stripRecordKey(record) : stripScenarioKey(key),
    record,
    provenance,
  };
}

/** Resolve exact transition-key association; multi-key HLS rows fail closed without `keySet`. */
export function authoritativeHlsKeys(
  record: AuthoritativeKeyRecord,
  contract: HlsEncryptionContract,
): readonly AuthoritativeHlsKey[] {
  if (record.scheme !== 'hls-aes128' && record.scheme !== 'hls-sample-aes') {
    throw new TypeError(`HLS contract cannot use key record scheme '${record.scheme}'`);
  }
  const keyRefs = contract.transitions
    .filter((transition) => transition.method !== 'NONE')
    .map((transition) => transition.keyRef!)
    .filter((keyRef, index, all) => all.indexOf(keyRef) === index);
  if (keyRefs.length === 0) throw new TypeError('HLS contract has no protected key transition');

  if (!record.keySet) {
    if (keyRefs.length !== 1) {
      throw new TypeError(`HLS key rotation requires keySet for ${keyRefs.length} distinct key URIs`);
    }
    return Object.freeze([Object.freeze({ keyRef: keyRefs[0]!, keyHex: record.keyHex })]);
  }
  const declaredRefs = Object.keys(record.keySet);
  if (declaredRefs.length !== keyRefs.length ||
      keyRefs.some((keyRef) => record.keySet?.[keyRef] === undefined) ||
      declaredRefs.some((keyRef) => !keyRefs.includes(keyRef))) {
    throw new TypeError('HLS keySet does not exactly match playlist transition key URIs');
  }
  const keys = keyRefs.map((keyRef) => Object.freeze({ keyRef, keyHex: record.keySet![keyRef]! }));
  if (keys[0]!.keyHex !== record.keyHex) {
    throw new TypeError('HLS key record keyHex must equal the first transition keySet entry');
  }
  return Object.freeze(keys);
}

/** Bind authoritative key bytes to the digest-indexed key sidecars verified by the runner. */
export function assessHlsKeyResourceParity(
  record: AuthoritativeKeyRecord,
  contract: HlsEncryptionContract,
  index: HlsResourceIndex,
): HlsKeyResourceParityDecision {
  let keys: readonly AuthoritativeHlsKey[];
  try {
    keys = authoritativeHlsKeys(record, contract);
  } catch (error) {
    return hlsKeyParityError(errorMessage(error));
  }
  const indexedKeys = index.resources.filter((resource) => resource.role === 'key');
  if (indexedKeys.length !== keys.length) {
    return hlsKeyParityError(
      `resource index declares ${indexedKeys.length} key file(s), authoritative record declares ${keys.length}`,
    );
  }
  for (const key of keys) {
    const resource = indexedKeys.find((candidate) => candidate.uri === key.keyRef);
    if (!resource || resource.sizeBytes !== 16 || sha256Hex(hexBytes(key.keyHex)) !== resource.sha256) {
      return hlsKeyParityError(`key bytes for '${key.keyRef}' do not match the verified resource identity`);
    }
  }
  return Object.freeze({ state: 'PASS', keys });
}

/** Testable execution boundary: a blocked preflight cannot invoke the supplied adapter callback. */
export async function withEncryptionKeyPreflight<T>(
  options: unknown,
  execute: (key: DecryptKey) => Promise<T> | T,
  load: KeyRecordLoader = fetchAuthoritativeKeyRecord,
): Promise<
  | { readonly state: 'EXECUTED'; readonly value: T; readonly preflight: Extract<EncryptionKeyPreflightDecision, { state: 'READY' }> }
  | Extract<EncryptionKeyPreflightDecision, { state: 'BLOCKED' }>
> {
  const preflight = await preflightEncryptionKey(options, load);
  if (preflight.state === 'BLOCKED') return preflight;
  return { state: 'EXECUTED', value: await execute(preflight.key), preflight };
}

function assessDeclaredKey(
  record: AuthoritativeKeyRecord,
  key: ScenarioDecryptKey,
  provenance: EncryptionKeyProvenance,
): Extract<EncryptionKeyPreflightDecision, { state: 'BLOCKED' }> | undefined {
  const exactKey = key.keyHex === record.keyHex;
  const exactKid = key.kid === record.kid;
  const exactIv = key.ivHex === record.ivHex;
  const exactScheme = provenance.scheme === record.scheme;
  const mismatch = (detail: string) =>
    blocked('ERROR', 'ENCRYPTION_KEY_PROVENANCE_MISMATCH', detail);
  const badNegative = (detail: string) =>
    blocked('ERROR', 'ENCRYPTION_KEY_NEGATIVE_MUTATION_INVALID', detail);

  switch (provenance.use) {
    case 'authoritative-positive':
    case 'malformed-protection':
      if (!exactScheme || !exactKey || !exactKid || !exactIv) {
        return mismatch('scenario key/KID/IV/scheme does not exactly match its authoritative record');
      }
      return undefined;
    case 'wrong-key':
      return !exactScheme || exactKey || !isAes128Hex(key.keyHex) || !exactKid || !exactIv
        ? badNegative('wrong-key row must differ only by one valid 128-bit key')
        : undefined;
    case 'wrong-kid':
      return !exactScheme || !exactKey || exactKid || !isAes128Hex(key.kid) || !exactIv
        ? badNegative('wrong-KID row must differ only by one valid 128-bit KID')
        : undefined;
    case 'wrong-iv':
      return !exactScheme || !exactKey || !exactKid || exactIv || !isValidIvForScheme(key.ivHex, record.scheme)
        ? badNegative('wrong-IV row must differ only by one scheme-valid IV')
        : undefined;
    case 'missing-key':
      return !exactScheme || key.keyHex !== '' || !exactKid || !exactIv
        ? badNegative('missing-key row must differ only by an empty key')
        : undefined;
    case 'method-mismatch':
      return exactScheme || !exactKey || !exactKid || !exactIv
        ? badNegative('method-mismatch row must retain key bytes and differ only by requested scheme')
        : undefined;
    case 'clear-input-sentinel':
    case 'eme-negative':
      return mismatch('source-backed parity was unexpectedly requested for a non-source key use');
  }
}

function isValidIvForScheme(value: unknown, scheme: EncryptionScheme): value is string {
  return scheme === 'cenc-ctr' || scheme === 'cenc-cens' || scheme === 'cenc-cbcs'
    ? isCencIvHex(value)
    : isAes128Hex(value);
}

function isCanonicalHlsKeyRef(value: string): boolean {
  if (!value || value.trim() !== value || value.startsWith('/') || value.includes('\\') ||
      value.includes('?') || value.includes('#') || value.includes('%') ||
      /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return false;
  return value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

function hexBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function hlsKeyParityError(detail: string): Extract<HlsKeyResourceParityDecision, { state: 'ERROR' }> {
  return Object.freeze({ state: 'ERROR', reasonCode: 'HLS_KEY_RESOURCE_PARITY_MISMATCH', detail });
}

function scenarioKeyFromOptions(options: unknown): ScenarioDecryptKey | undefined {
  if (!isRecord(options) || !isRecord(options.key)) return undefined;
  const value = options.key;
  if (typeof value.keyHex !== 'string' || !isRecord(value.provenance)) return undefined;
  return value as unknown as ScenarioDecryptKey;
}

function stripRecordKey(record: AuthoritativeKeyRecord): DecryptKey {
  return Object.freeze({
    keyHex: record.keyHex,
    ...(record.kid !== undefined ? { kid: record.kid } : {}),
    ...(record.ivHex !== undefined ? { ivHex: record.ivHex } : {}),
  });
}

function stripScenarioKey(key: ScenarioDecryptKey): DecryptKey {
  return Object.freeze({
    keyHex: key.keyHex,
    ...(key.kid !== undefined ? { kid: key.kid } : {}),
    ...(key.ivHex !== undefined ? { ivHex: key.ivHex } : {}),
  });
}

function blocked(
  status: 'NA_ASSET' | 'ERROR',
  reasonCode: Extract<EncryptionKeyPreflightDecision, { state: 'BLOCKED' }>['reasonCode'],
  detail: string,
): Extract<EncryptionKeyPreflightDecision, { state: 'BLOCKED' }> {
  return Object.freeze({ state: 'BLOCKED', status, reasonCode, detail });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
