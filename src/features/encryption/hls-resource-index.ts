import { sha256Hex } from '../../core/seeded-rng.ts';
import {
  assessHlsKeyResourceParity,
  type AuthoritativeKeyRecord,
} from './key-provenance.ts';
import {
  encryptionKeyProvenanceFromOptions,
  HLS_RESOURCE_INDEX_SCHEMA,
  isSha256Hex,
  type HlsResourceIdentity,
  type HlsResourceIndex,
  type HlsResourceRole,
} from './contracts.ts';

export interface HlsRootIdentity {
  /** Basename/corpus id of the selected playlist, for example `hls_aes128.m3u8`. */
  readonly assetId: string;
  /** Executed selection path; sidecar logical paths are resolved relative to this directory. */
  readonly logicalPath: string;
  readonly sha256: string;
  readonly sizeBytes: number;
}

export interface ResolvedHlsResourceIdentity extends HlsResourceIdentity {
  readonly logicalPath: string;
}

export interface HlsResourceUrlBinding {
  readonly role: HlsResourceRole;
  readonly uri: string;
  /** Absolute verified-content URL, normally an object URL owned by the runner. */
  readonly url: string;
}

export type HlsResourceIndexLoadResult =
  | { readonly state: 'OK'; readonly value: unknown }
  | { readonly state: 'MISSING'; readonly detail: string }
  | { readonly state: 'ERROR'; readonly detail: string };

export type HlsResourceIndexLoader = (url: string) => Promise<HlsResourceIndexLoadResult>;

export type HlsResourceIndexDecision =
  | {
      readonly state: 'READY';
      readonly indexUrl: string;
      readonly index: HlsResourceIndex;
      /** Sidecars only. The already-verified playlist root remains input zero. */
      readonly resources: readonly ResolvedHlsResourceIdentity[];
    }
  | {
      readonly state: 'BLOCKED';
      readonly status: 'NA_ASSET' | 'ERROR';
      readonly reasonCode:
        | 'HLS_RESOURCE_INDEX_CONTRACT_MISSING'
        | 'HLS_RESOURCE_INDEX_MISSING'
        | 'HLS_RESOURCE_INDEX_LOAD_ERROR'
        | 'HLS_RESOURCE_INDEX_INVALID'
        | 'HLS_PLAYLIST_IDENTITY_MISMATCH'
        | 'HLS_RESOURCE_CLOSURE_MISMATCH'
        | 'HLS_KEY_RESOURCE_PARITY_MISMATCH';
      readonly detail: string;
    };

/** Strict browser loader. Missing evidence is NA_ASSET; load/JSON failures are harness ERROR. */
export const fetchHlsResourceIndex: HlsResourceIndexLoader = async (url) => {
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

/** Exact scenario hook consumed by media selection before it constructs HLS URL inputs. */
export function hlsResourceIndexFromOptions(options: unknown): string | undefined {
  const encryptionIndex = encryptionKeyProvenanceFromOptions(options)?.hls?.resourceIndex;
  if (encryptionIndex) return encryptionIndex;
  if (!isRecord(options)) return undefined;
  const robustness = isRecord(options.robustness) ? options.robustness : undefined;
  const probe = isRecord(robustness?.probe) ? robustness.probe : undefined;
  return typeof probe?.hlsResourceIndex === 'string' && probe.hlsResourceIndex.length > 0
    ? probe.hlsResourceIndex
    : undefined;
}

/**
 * Parse a committed `media-test/hls-resource-index@1` record. The format is intentionally small:
 * it binds the playlist root plus every sibling URL consumer to a lower-case SHA-256 and byte size.
 */
export function parseHlsResourceIndex(value: unknown): HlsResourceIndex {
  if (!isRecord(value) || value.schema !== HLS_RESOURCE_INDEX_SCHEMA) {
    throw new TypeError(`HLS resource index schema must be '${HLS_RESOURCE_INDEX_SCHEMA}'`);
  }
  if (!isRecord(value.playlist)) throw new TypeError('HLS resource index playlist must be an object');
  const assetId = canonicalAssetId(value.playlist.assetId, 'playlist.assetId');
  const playlistSha256 = requireSha256(value.playlist.sha256, 'playlist.sha256');
  const playlistSize = requireSize(value.playlist.sizeBytes, 'playlist.sizeBytes', false);
  if (!Array.isArray(value.resources) || value.resources.length === 0) {
    throw new TypeError('HLS resource index resources must be a non-empty array');
  }
  const resources: HlsResourceIdentity[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.resources.length; index++) {
    const entry = value.resources[index];
    if (!isRecord(entry)) throw new TypeError(`resources[${index}] must be an object`);
    const role = requireRole(entry.role, `resources[${index}].role`);
    const uri = canonicalLocalUri(entry.uri, `resources[${index}].uri`);
    if (seen.has(uri)) throw new TypeError(`resources[${index}].uri duplicates '${uri}'`);
    seen.add(uri);
    const sizeBytes = requireSize(entry.sizeBytes, `resources[${index}].sizeBytes`, true);
    if (role === 'key' && sizeBytes !== 16) {
      throw new TypeError(`resources[${index}] AES key must contain exactly 16 bytes`);
    }
    resources.push(Object.freeze({
      role,
      uri,
      sha256: requireSha256(entry.sha256, `resources[${index}].sha256`),
      sizeBytes,
    }));
  }
  return deepFreeze({
    schema: HLS_RESOURCE_INDEX_SCHEMA,
    playlist: { assetId, sha256: playlistSha256, sizeBytes: playlistSize },
    resources,
  });
}

/**
 * Blocking closure preflight. It proves the verified root bytes match the index and that the index
 * enumerates exactly the key/map/segment URIs authored by those bytes, in first-reference order.
 * Returned identities are ready to append to selection `resolvedInputs` for byte verification.
 */
export async function preflightHlsResourceIndex(
  options: unknown,
  root: HlsRootIdentity,
  playlistBytes: Uint8Array,
  load: HlsResourceIndexLoader = fetchHlsResourceIndex,
  authoritativeKeyRecord?: AuthoritativeKeyRecord,
): Promise<HlsResourceIndexDecision> {
  const indexUrl = hlsResourceIndexFromOptions(options);
  if (!indexUrl) {
    return blocked(
      'ERROR',
      'HLS_RESOURCE_INDEX_CONTRACT_MISSING',
      'HLS decrypt scenario has no digest-bound resource-index contract',
    );
  }
  const loaded = await load(indexUrl);
  if (loaded.state === 'MISSING') {
    return blocked('NA_ASSET', 'HLS_RESOURCE_INDEX_MISSING', loaded.detail);
  }
  if (loaded.state === 'ERROR') {
    return blocked('ERROR', 'HLS_RESOURCE_INDEX_LOAD_ERROR', loaded.detail);
  }
  let index: HlsResourceIndex;
  try {
    index = parseHlsResourceIndex(loaded.value);
  } catch (error) {
    return blocked('ERROR', 'HLS_RESOURCE_INDEX_INVALID', errorMessage(error));
  }

  if (!canonicalRootIdentity(root) ||
      root.assetId !== index.playlist.assetId ||
      root.sha256 !== index.playlist.sha256 ||
      root.sizeBytes !== index.playlist.sizeBytes ||
      playlistBytes.byteLength !== root.sizeBytes ||
      sha256Hex(playlistBytes) !== root.sha256) {
    return blocked(
      'ERROR',
      'HLS_PLAYLIST_IDENTITY_MISMATCH',
      `selected playlist '${root.assetId}' does not match its declared root identity`,
    );
  }

  let expected: readonly Pick<HlsResourceIdentity, 'role' | 'uri'>[];
  try {
    expected = inspectHlsResourceReferences(decodePlaylist(playlistBytes));
  } catch (error) {
    return blocked('ERROR', 'HLS_RESOURCE_CLOSURE_MISMATCH', errorMessage(error));
  }
  if (expected.length !== index.resources.length) {
    return blocked(
      'ERROR',
      'HLS_RESOURCE_CLOSURE_MISMATCH',
      `playlist references ${expected.length} unique sidecar(s), index declares ${index.resources.length}`,
    );
  }
  for (let position = 0; position < expected.length; position++) {
    const wanted = expected[position]!;
    const declared = index.resources[position]!;
    if (wanted.role !== declared.role || wanted.uri !== declared.uri) {
      return blocked(
        'ERROR',
        'HLS_RESOURCE_CLOSURE_MISMATCH',
        `sidecar ${position} is ${declared.role}:${declared.uri}, expected ${wanted.role}:${wanted.uri}`,
      );
    }
  }

  const hlsContract = encryptionKeyProvenanceFromOptions(options)?.hls;
  if (authoritativeKeyRecord && hlsContract) {
    const keyParity = assessHlsKeyResourceParity(authoritativeKeyRecord, hlsContract, index);
    if (keyParity.state === 'ERROR') {
      return blocked('ERROR', keyParity.reasonCode, keyParity.detail);
    }
  }

  const directory = logicalDirectory(root.logicalPath);
  return deepFreeze({
    state: 'READY',
    indexUrl,
    index,
    resources: index.resources.map((entry) => ({
      ...entry,
      logicalPath: directory ? `${directory}/${entry.uri}` : entry.uri,
    })),
  });
}

/** Collect exactly the local URI closure relevant to these direct media-playlist scenarios. */
export function inspectHlsResourceReferences(
  playlist: string,
): readonly Pick<HlsResourceIdentity, 'role' | 'uri'>[] {
  if (typeof playlist !== 'string' || !playlist.startsWith('#EXTM3U')) {
    throw new TypeError('HLS playlist must begin with #EXTM3U');
  }
  const lines = playlist.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.some((line) => line.startsWith('#EXT-X-STREAM-INF:') || line.startsWith('#EXT-X-MEDIA:'))) {
    throw new TypeError('HLS encryption fixture must be a direct media playlist, not a master playlist');
  }
  const resources: Array<Pick<HlsResourceIdentity, 'role' | 'uri'>> = [];
  const seen = new Map<string, HlsResourceRole>();
  const remember = (role: HlsResourceRole, rawUri: unknown): void => {
    const uri = canonicalLocalUri(rawUri, `${role} URI`);
    const prior = seen.get(uri);
    if (prior && prior !== role) throw new TypeError(`HLS URI '${uri}' is reused as both ${prior} and ${role}`);
    if (prior) return;
    seen.set(uri, role);
    resources.push(Object.freeze({ role, uri }));
  };

  for (const line of lines) {
    if (line.startsWith('#EXT-X-KEY:')) {
      const attributes = parseAttributeList(line.slice('#EXT-X-KEY:'.length));
      if (attributes.METHOD === 'NONE') {
        if (attributes.URI !== undefined) throw new TypeError('METHOD=NONE must not carry a key URI');
      } else {
        if (attributes.METHOD !== 'AES-128' && attributes.METHOD !== 'SAMPLE-AES') {
          throw new TypeError(`unsupported HLS key METHOD ${JSON.stringify(attributes.METHOD)}`);
        }
        remember('key', unquote(attributes.URI));
      }
      continue;
    }
    if (line.startsWith('#EXT-X-MAP:')) {
      const attributes = parseAttributeList(line.slice('#EXT-X-MAP:'.length));
      remember('map', unquote(attributes.URI));
      continue;
    }
    if (!line.startsWith('#')) remember('segment', line);
  }
  if (!resources.some((entry) => entry.role === 'segment')) {
    throw new TypeError('HLS playlist has no media segment URI');
  }
  return Object.freeze(resources);
}

/**
 * Seal a verified direct media playlist to caller-owned absolute URLs. Only exact URI values are
 * replaced: tag/attribute ordering, quoting style, whitespace, comments, and line endings remain
 * byte-for-byte unchanged. A binding set must be a bijection with the playlist's unique closure.
 */
export function rebindHlsPlaylistResources(
  bytes: Uint8Array,
  bindings: readonly HlsResourceUrlBinding[],
): Uint8Array {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('HLS playlist bytes must be a Uint8Array');
  const playlist = decodePlaylist(bytes);
  const references = inspectHlsResourceReferences(playlist);
  if (!Array.isArray(bindings)) throw new TypeError('HLS resource bindings must be an array');

  const byIdentity = new Map<string, HlsResourceUrlBinding>();
  for (let index = 0; index < bindings.length; index++) {
    const binding = bindings[index];
    if (!isRecord(binding)) throw new TypeError(`HLS resource binding ${index} must be an object`);
    const role = requireRole(binding.role, `bindings[${index}].role`);
    const uri = canonicalLocalUri(binding.uri, `bindings[${index}].uri`);
    const url = requireAbsoluteResourceUrl(binding.url, `bindings[${index}].url`);
    const identity = `${role}\0${uri}`;
    if (byIdentity.has(identity)) throw new TypeError(`duplicate HLS resource binding ${role}:${uri}`);
    byIdentity.set(identity, Object.freeze({ role, uri, url }));
  }
  if (byIdentity.size !== references.length) {
    throw new TypeError(
      `HLS resource binding cardinality ${byIdentity.size} does not equal playlist closure ${references.length}`,
    );
  }
  for (const reference of references) {
    if (!byIdentity.has(`${reference.role}\0${reference.uri}`)) {
      throw new TypeError(`missing HLS resource binding ${reference.role}:${reference.uri}`);
    }
  }

  const replacements = new Map<string, number>();
  const parts = playlist.split(/(\r?\n)/);
  for (let index = 0; index < parts.length; index += 2) {
    const originalLine = parts[index] ?? '';
    const trimmed = originalLine.trim();
    if (!trimmed) continue;
    let rewritten = originalLine;
    if (trimmed.startsWith('#EXT-X-KEY:')) {
      rewritten = rewriteTagUri(originalLine, '#EXT-X-KEY:', 'key', byIdentity, replacements);
    } else if (trimmed.startsWith('#EXT-X-MAP:')) {
      rewritten = rewriteTagUri(originalLine, '#EXT-X-MAP:', 'map', byIdentity, replacements);
    } else if (!trimmed.startsWith('#')) {
      const binding = byIdentity.get(`segment\0${trimmed}`);
      if (!binding) throw new TypeError(`missing HLS resource binding segment:${trimmed}`);
      const start = originalLine.indexOf(trimmed);
      rewritten = `${originalLine.slice(0, start)}${binding.url}${originalLine.slice(start + trimmed.length)}`;
      increment(replacements, `segment\0${trimmed}`);
    }
    parts[index] = rewritten;
  }
  for (const reference of references) {
    const identity = `${reference.role}\0${reference.uri}`;
    if ((replacements.get(identity) ?? 0) === 0) {
      throw new TypeError(`HLS resource binding ${reference.role}:${reference.uri} was not applied`);
    }
  }
  return textEncoder().encode(parts.join(''));
}

function canonicalRootIdentity(root: HlsRootIdentity): boolean {
  return typeof root.assetId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*\.m3u8$/.test(root.assetId) &&
    typeof root.logicalPath === 'string' && root.logicalPath.length > 0 &&
    !/[\u0000-\u001f\u007f]/.test(root.logicalPath) &&
    isSha256Hex(root.sha256) &&
    Number.isSafeInteger(root.sizeBytes) && root.sizeBytes >= 0;
}

function decodePlaylist(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new TypeError(`HLS playlist is not valid UTF-8: ${errorMessage(error)}`);
  }
}

function parseAttributeList(value: string): Record<string, string> {
  const out: Record<string, string> = {};
  let token = '';
  let quoted = false;
  const flush = (): void => {
    if (!token) return;
    const equals = token.indexOf('=');
    if (equals <= 0) throw new TypeError(`malformed HLS attribute ${JSON.stringify(token)}`);
    const key = token.slice(0, equals).trim();
    const item = token.slice(equals + 1).trim();
    if (!key || !item || out[key] !== undefined) {
      throw new TypeError(`malformed or duplicate HLS attribute ${JSON.stringify(token)}`);
    }
    out[key] = item;
    token = '';
  };
  for (const character of value) {
    if (character === '"') quoted = !quoted;
    if (character === ',' && !quoted) flush();
    else token += character;
  }
  if (quoted) throw new TypeError('unterminated quoted HLS attribute');
  flush();
  return out;
}

function rewriteTagUri(
  originalLine: string,
  prefix: '#EXT-X-KEY:' | '#EXT-X-MAP:',
  role: 'key' | 'map',
  bindings: ReadonlyMap<string, HlsResourceUrlBinding>,
  replacements: Map<string, number>,
): string {
  const leading = originalLine.length - originalLine.trimStart().length;
  const tagStart = leading;
  if (!originalLine.slice(tagStart).startsWith(prefix)) return originalLine;
  const attributesStart = tagStart + prefix.length;
  const spans = attributeSpans(originalLine, attributesStart);
  const uriSpans = spans.filter((span) => span.key === 'URI');
  if (uriSpans.length === 0) {
    if (role === 'key') {
      const parsed = parseAttributeList(originalLine.slice(attributesStart).trim());
      if (parsed.METHOD === 'NONE') return originalLine;
    }
    throw new TypeError(`${prefix.slice(1, -1)} requires exactly one URI attribute`);
  }
  if (uriSpans.length !== 1) throw new TypeError(`${prefix.slice(1, -1)} has duplicate URI attributes`);
  const span = uriSpans[0]!;
  const raw = originalLine.slice(span.valueStart, span.valueEnd);
  const quoted = raw.startsWith('"');
  if (quoted !== raw.endsWith('"')) throw new TypeError('malformed quoted HLS URI');
  const uri = canonicalLocalUri(quoted ? raw.slice(1, -1) : raw, `${role} URI`);
  const binding = bindings.get(`${role}\0${uri}`);
  if (!binding) throw new TypeError(`missing HLS resource binding ${role}:${uri}`);
  if (quoted && binding.url.includes('"')) throw new TypeError(`bindings URL for ${role}:${uri} contains a quote`);
  if (!quoted && /[\s,"]/.test(binding.url)) {
    throw new TypeError(`unquoted URI binding for ${role}:${uri} contains an attribute delimiter`);
  }
  increment(replacements, `${role}\0${uri}`);
  const replacement = quoted ? `"${binding.url}"` : binding.url;
  return `${originalLine.slice(0, span.valueStart)}${replacement}${originalLine.slice(span.valueEnd)}`;
}

interface AttributeSpan {
  key: string;
  valueStart: number;
  valueEnd: number;
}

function attributeSpans(line: string, start: number): AttributeSpan[] {
  const spans: AttributeSpan[] = [];
  let tokenStart = start;
  let quoted = false;
  const consume = (end: number): void => {
    let left = tokenStart;
    let right = end;
    while (left < right && /\s/.test(line[left]!)) left++;
    while (right > left && /\s/.test(line[right - 1]!)) right--;
    if (left === right) throw new TypeError('empty HLS attribute');
    const equals = line.indexOf('=', left);
    if (equals < left || equals >= right) throw new TypeError(`malformed HLS attribute ${JSON.stringify(line.slice(left, right))}`);
    const key = line.slice(left, equals).trim();
    let valueStart = equals + 1;
    while (valueStart < right && /\s/.test(line[valueStart]!)) valueStart++;
    if (!key || valueStart === right) throw new TypeError(`malformed HLS attribute ${JSON.stringify(line.slice(left, right))}`);
    spans.push({ key, valueStart, valueEnd: right });
  };
  for (let position = start; position < line.length; position++) {
    const character = line[position]!;
    if (character === '"') quoted = !quoted;
    if (character === ',' && !quoted) {
      consume(position);
      tokenStart = position + 1;
    }
  }
  if (quoted) throw new TypeError('unterminated quoted HLS attribute');
  consume(line.length);
  return spans;
}

function unquote(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value.startsWith('"') !== value.endsWith('"')) throw new TypeError('malformed quoted HLS URI');
  return value.startsWith('"') ? value.slice(1, -1) : value;
}

function canonicalLocalUri(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value || value.trim() !== value) {
    throw new TypeError(`${label} must be a non-empty canonical string`);
  }
  if (value.startsWith('/') || value.includes('\\') || value.includes('?') || value.includes('#') ||
      value.includes('%') || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) {
    throw new TypeError(`${label} must be a query-free local relative URI`);
  }
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new TypeError(`${label} contains an unsafe or non-canonical path segment`);
  }
  return value;
}

function canonicalAssetId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.m3u8$/.test(value)) {
    throw new TypeError(`${label} must be a canonical .m3u8 asset basename`);
  }
  return value;
}

function requireAbsoluteResourceUrl(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value || /[\s"\u0000-\u001f\u007f]/.test(value)) {
    throw new TypeError(`${label} must be a non-empty absolute URL without whitespace, quotes, or control characters`);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(`${label} must be an absolute URL`);
  }
  if (parsed.protocol !== 'blob:' && parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new TypeError(`${label} must use blob, https, or http`);
  }
  return value;
}

function requireRole(value: unknown, label: string): HlsResourceRole {
  if (value !== 'key' && value !== 'map' && value !== 'segment') {
    throw new TypeError(`${label} must be key, map, or segment`);
  }
  return value;
}

function requireSha256(value: unknown, label: string): string {
  if (!isSha256Hex(value)) throw new TypeError(`${label} must be a full lowercase SHA-256`);
  return value;
}

function requireSize(value: unknown, label: string, positive: boolean): number {
  if (!Number.isSafeInteger(value) || Number(value) < (positive ? 1 : 0)) {
    throw new TypeError(`${label} must be a ${positive ? 'positive' : 'non-negative'} safe integer`);
  }
  return Number(value);
}

function logicalDirectory(value: string): string {
  const slash = value.lastIndexOf('/');
  return slash < 0 ? '' : value.slice(0, slash);
}

function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function textEncoder(): TextEncoder {
  return new TextEncoder();
}

function blocked(
  status: 'NA_ASSET' | 'ERROR',
  reasonCode: Extract<HlsResourceIndexDecision, { state: 'BLOCKED' }>['reasonCode'],
  detail: string,
): Extract<HlsResourceIndexDecision, { state: 'BLOCKED' }> {
  return Object.freeze({ state: 'BLOCKED', status, reasonCode, detail });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (typeof value !== 'object' || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item, seen);
  return Object.freeze(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
