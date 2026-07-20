/** Browser-safe decoder for the baker's lossless long-form packet-evidence storage. */

import { validateCompactGoldenPacketPayload } from '../../fixtures/lib/lossless-json-columnar-validator.mjs';

export const COMPACT_GOLDEN_PACKETS_SCHEMA = 'media-test/golden-packets-columnar@1';
export const COMPACT_GOLDEN_PACKETS_VERSION = 'packet-semantics-columnar@1';
export const LOSSLESS_COLUMNAR_JSON_SCHEMA = 'media-test/lossless-json-columnar@1';
export const LOGICAL_GOLDEN_PACKETS_SCHEMA = 'media-test/golden-packets@1';
export const LOGICAL_GOLDEN_PACKETS_VERSION = 'packet-semantics@1';

type JsonRecord = Record<string, unknown>;

export function expandCompactGoldenPacketPayload(value: unknown): unknown {
  validateCompactGoldenPacketPayload(value);
  assertCompactEnvelope(value);
  const expanded = decodeNode(value.storage.root);
  if (!isRecord(expanded) || expanded.schema !== LOGICAL_GOLDEN_PACKETS_SCHEMA ||
      expanded.schemaVersion !== LOGICAL_GOLDEN_PACKETS_VERSION || !Array.isArray(expanded.packets) ||
      expanded.packets.length !== value.rowCount) {
    throw new TypeError('compact golden-packets payload failed its logical schema/count contract');
  }
  assertExactKeys(expanded, ['schema', 'schemaVersion', 'raw', 'semantic', 'representation', 'packets'],
    'logical golden-packets payload');
  return expanded;
}

/** Decode only the runtime packet table; raw/semantic diagnostic views stay compact in memory. */
export function readCompactGoldenPacketRows(value: unknown): unknown[] {
  validateCompactGoldenPacketPayload(value);
  assertCompactEnvelope(value);
  const root = value.storage.root;
  if (!isRecord(root) || root.$type !== 'object' || !Array.isArray(root.entries)) {
    throw new TypeError('compact golden-packets root is not an encoded object');
  }
  assertExactKeys(root, ['$type', 'entries'], 'compact golden-packets encoded root');
  const expected = new Set(['packets', 'raw', 'representation', 'schema', 'schemaVersion', 'semantic']);
  const entries = new Map<string, unknown>();
  for (const entry of root.entries) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' ||
        !expected.has(entry[0]) || entries.has(entry[0])) {
      throw new TypeError('compact golden-packets root has duplicate or unknown encoded keys');
    }
    entries.set(entry[0], entry[1]);
  }
  if (entries.size !== expected.size || decodeNode(entries.get('schema')) !== LOGICAL_GOLDEN_PACKETS_SCHEMA ||
      decodeNode(entries.get('schemaVersion')) !== LOGICAL_GOLDEN_PACKETS_VERSION) {
    throw new TypeError('compact golden-packets inner schema/version is invalid');
  }
  const packetEntry = entries.get('packets');
  if (!packetEntry) throw new TypeError('compact golden-packets payload has no packet table');
  const packets = decodeNode(packetEntry);
  if (!Array.isArray(packets) || packets.length !== value.rowCount) {
    throw new TypeError('compact golden-packets packet count mismatch');
  }
  return packets;
}

function assertCompactEnvelope(value: unknown): asserts value is JsonRecord & {
  storage: JsonRecord;
  rowCount: number;
} {
  if (!isRecord(value) || value.schema !== COMPACT_GOLDEN_PACKETS_SCHEMA ||
      value.schemaVersion !== COMPACT_GOLDEN_PACKETS_VERSION ||
      value.logicalSchema !== LOGICAL_GOLDEN_PACKETS_SCHEMA ||
      value.logicalSchemaVersion !== LOGICAL_GOLDEN_PACKETS_VERSION ||
      !Number.isSafeInteger(value.rowCount) || (value.rowCount as number) < 0 ||
      !isRecord(value.storage) || value.storage.schema !== LOSSLESS_COLUMNAR_JSON_SCHEMA) {
    throw new TypeError('unsupported compact golden-packets payload');
  }
  assertExactKeys(value, [
    'schema', 'schemaVersion', 'logicalSchema', 'logicalSchemaVersion', 'rowCount', 'storage',
  ], 'compact golden-packets envelope');
  assertExactKeys(value.storage, ['schema', 'root'], 'compact golden-packets storage');
}

function decodeNode(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return value;
  if (!isRecord(value) || typeof value.$type !== 'string') throw new TypeError('invalid lossless columnar node');
  switch (value.$type) {
    case 'negative-zero': return -0;
    case 'object': {
      if (!Array.isArray(value.entries)) throw new TypeError('invalid columnar object entries');
      const out: JsonRecord = {};
      for (const entry of value.entries) {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' ||
            Object.prototype.hasOwnProperty.call(out, entry[0])) {
          throw new TypeError('invalid columnar object entry');
        }
        Object.defineProperty(out, entry[0], {
          value: decodeNode(entry[1]), enumerable: true, configurable: true, writable: true,
        });
      }
      return out;
    }
    case 'array': {
      if (!Array.isArray(value.values)) throw new TypeError('invalid columnar array');
      return value.values.map(decodeNode);
    }
    case 'record-columns': return decodeRecordColumns(value);
    case 'integer-delta-varint': return decodeIntegerDeltas(value);
    case 'string-dictionary': return decodeDictionary(value, true);
    case 'value-dictionary': return decodeDictionary(value, false);
    case 'lower-hex-bytes': return decodeHexStrings(value);
    case 'prefixed-strings': {
      if (typeof value.prefix !== 'string') throw new TypeError('invalid prefixed string column');
      const suffixes = decodeNode(value.suffixes);
      if (!Array.isArray(suffixes) || !suffixes.every((suffix) => typeof suffix === 'string')) {
        throw new TypeError('invalid prefixed string suffixes');
      }
      return suffixes.map((suffix) => (value.prefix as string) + suffix);
    }
    default: throw new TypeError(`unsupported lossless columnar node '${value.$type}'`);
  }
}

function decodeRecordColumns(value: JsonRecord): JsonRecord[] {
  if (!Number.isSafeInteger(value.rowCount) || (value.rowCount as number) < 0 || !Array.isArray(value.columns)) {
    throw new TypeError('invalid record-column dimensions');
  }
  const rowCount = value.rowCount as number;
  const rows: JsonRecord[] = Array.from({ length: rowCount }, () => ({}));
  const keys = new Set<string>();
  for (const unknownColumn of value.columns) {
    if (!isRecord(unknownColumn) || typeof unknownColumn.key !== 'string' || keys.has(unknownColumn.key)) {
      throw new TypeError('invalid record column');
    }
    const column = unknownColumn;
    keys.add(column.key as string);
    const values = decodeNode(column.values);
    if (!Array.isArray(values)) throw new TypeError('record column values must decode to an array');
    const present = column.present === undefined ? undefined : decodeBase64(column.present);
    if (present && present.length !== Math.ceil(rowCount / 8)) throw new TypeError('record column presence length mismatch');
    let valueIndex = 0;
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
      const hasValue = !present || (present[rowIndex >> 3]! & (1 << (rowIndex & 7))) !== 0;
      if (hasValue) {
        Object.defineProperty(rows[rowIndex]!, column.key as string, {
          value: values[valueIndex++], enumerable: true, configurable: true, writable: true,
        });
      }
    }
    if (valueIndex !== values.length) throw new TypeError('record column value count mismatch');
    if (present && rowCount % 8 !== 0) {
      const unusedMask = 0xff << (rowCount % 8);
      if ((present.at(-1)! & unusedMask) !== 0) throw new TypeError('record column has nonzero trailing presence bits');
    }
  }
  return rows;
}

function decodeIntegerDeltas(value: JsonRecord): number[] {
  if (!Number.isSafeInteger(value.count) || (value.count as number) < 0 || typeof value.bytes !== 'string') {
    throw new TypeError('invalid integer delta column');
  }
  const bytes = decodeBase64(value.bytes);
  const out: number[] = [];
  let offset = 0;
  let prior = 0n;
  while (out.length < (value.count as number)) {
    let encoded = 0n;
    let shift = 0n;
    let terminated = false;
    while (offset < bytes.length) {
      const byte = bytes[offset++]!;
      encoded |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) { terminated = true; break; }
      shift += 7n;
      if (shift > 63n) throw new TypeError('integer delta varint exceeds the safe contract');
    }
    if (!terminated) throw new TypeError('truncated integer delta varint');
    const delta = (encoded & 1n) === 0n ? encoded / 2n : -((encoded + 1n) / 2n);
    prior += delta;
    const number = Number(prior);
    if (!Number.isSafeInteger(number)) throw new TypeError('decoded integer exceeds the safe range');
    out.push(number);
  }
  if (offset !== bytes.length) throw new TypeError('integer delta column has trailing bytes');
  return out;
}

function decodeDictionary(value: JsonRecord, strings: boolean): unknown[] {
  const dictionary = strings ? value.values : decodeNode(value.values);
  const indices = decodeNode(value.indices);
  if (!Array.isArray(dictionary) || !Array.isArray(indices) ||
      (strings && !dictionary.every((item) => typeof item === 'string'))) {
    throw new TypeError('invalid lossless dictionary');
  }
  return indices.map((index) => {
    if (!Number.isSafeInteger(index) || (index as number) < 0 || (index as number) >= dictionary.length) {
      throw new TypeError('dictionary index out of range');
    }
    return dictionary[index as number];
  });
}

function decodeHexStrings(value: JsonRecord): string[] {
  if (!Number.isSafeInteger(value.count) || (value.count as number) < 0 ||
      !Number.isSafeInteger(value.width) || (value.width as number) <= 0 || (value.width as number) % 2 !== 0 ||
      typeof value.bytes !== 'string') {
    throw new TypeError('invalid hexadecimal string column');
  }
  const count = value.count as number;
  const width = value.width as number;
  const bytes = decodeBase64(value.bytes);
  if (bytes.length !== count * width / 2) throw new TypeError('hexadecimal string byte count mismatch');
  const out: string[] = [];
  for (let row = 0; row < count; row++) {
    let text = '';
    const start = row * width / 2;
    for (let index = 0; index < width / 2; index++) text += bytes[start + index]!.toString(16).padStart(2, '0');
    out.push(text);
  }
  return out;
}

function decodeBase64(value: unknown): Uint8Array {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new TypeError('invalid canonical base64');
  }
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (encodeBase64(bytes) !== value) throw new TypeError('non-canonical base64');
  return bytes;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunk, bytes.length)));
  }
  return btoa(binary);
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertExactKeys(value: JsonRecord, expected: string[], label: string): void {
  const actual = Object.keys(value).sort(compareCodepoint);
  const wanted = [...expected].sort(compareCodepoint);
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} has missing or unknown keys`);
  }
}

function compareCodepoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
