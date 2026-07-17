import type { JsonObject, JsonValue } from './model.ts';

/** Convert an in-memory value to finite, plain JSON while sorting every object key. */
export function normalizeJson(value: unknown, path = '$'): JsonValue {
  const active = new Set<object>();

  const visit = (item: unknown, itemPath: string, inArray: boolean): JsonValue | undefined => {
    if (item === null) return null;
    if (typeof item === 'string') {
      assertValidUnicode(item, itemPath);
      return item;
    }
    if (typeof item === 'boolean') return item;
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new TypeError(`${itemPath}: JSON number must be finite`);
      return Object.is(item, -0) ? 0 : item;
    }
    if (item === undefined) return inArray ? null : undefined;
    if (typeof item === 'bigint' || typeof item === 'function' || typeof item === 'symbol') {
      throw new TypeError(`${itemPath}: ${typeof item} is not JSON-serializable`);
    }
    if (typeof item !== 'object') throw new TypeError(`${itemPath}: unsupported JSON value`);
    if (active.has(item)) throw new TypeError(`${itemPath}: cyclic value is not JSON-serializable`);

    active.add(item);
    try {
      if (item instanceof Date) return item.toISOString();
      if (Array.isArray(item)) {
        return item.map((entry, index) => visit(entry, `${itemPath}[${index}]`, true) ?? null);
      }
      if (item instanceof ArrayBuffer || ArrayBuffer.isView(item)) {
        throw new TypeError(`${itemPath}: binary host values must be projected to hashes before reporting`);
      }
      const record = item as Record<string, unknown>;
      const output: JsonObject = {};
      for (const key of Object.keys(record).sort(compareUtf16)) {
        assertValidUnicode(key, `${itemPath} key`);
        const normalized = visit(record[key], `${itemPath}.${key}`, false);
        if (normalized !== undefined) output[key] = normalized;
      }
      return output;
    } finally {
      active.delete(item);
    }
  };

  const normalized = visit(value, path, false);
  if (normalized === undefined) throw new TypeError(`${path}: root JSON value cannot be undefined`);
  return normalized;
}

/** RFC 8785 / JCS canonical JSON. The input is normalized and finite before serialization. */
export function canonicalJson(value: unknown): string {
  const normalized = normalizeJson(value);
  const encode = (item: JsonValue): string => {
    if (item === null || typeof item === 'boolean' || typeof item === 'number' || typeof item === 'string') {
      return JSON.stringify(item);
    }
    if (Array.isArray(item)) return `[${item.map(encode).join(',')}]`;
    return `{${Object.keys(item)
      .sort(compareUtf16)
      .map((key) => `${JSON.stringify(key)}:${encode(item[key]!)}`)
      .join(',')}}`;
  };
  return encode(normalized);
}

/** Stable pretty JSON for artifacts intended for review; content hashes use canonicalJson instead. */
export function stablePrettyJson(value: unknown): string {
  return `${JSON.stringify(normalizeJson(value), null, 2)}\n`;
}

export function canonicalContentHash(value: unknown): string {
  return sha256Hex(new TextEncoder().encode(canonicalJson(value)));
}

/** Small browser/Worker-safe SHA-256 implementation; avoids a Node-only API and keeps buildReport sync. */
export function sha256Hex(input: Uint8Array): string {
  const constants = SHA256_CONSTANTS;
  const bitLength = input.length * 8;
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(input);
  bytes[input.length] = 0x80;
  const view = new DataView(bytes.buffer);
  const high = Math.floor(bitLength / 0x1_0000_0000);
  const low = bitLength >>> 0;
  view.setUint32(paddedLength - 8, high, false);
  view.setUint32(paddedLength - 4, low, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const words = new Uint32Array(64);

  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const w15 = words[i - 15]!;
      const w2 = words[i - 2]!;
      const s0 = rotateRight(w15, 7) ^ rotateRight(w15, 18) ^ (w15 >>> 3);
      const s1 = rotateRight(w2, 17) ^ rotateRight(w2, 19) ^ (w2 >>> 10);
      words[i] = (words[i - 16]! + s0 + words[i - 7]! + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const t1 = (h + sigma1 + choice + constants[i]! + words[i]!) >>> 0;
      const sigma0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (sigma0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((word) => word.toString(16).padStart(8, '0'))
    .join('');
}

export function compareUtf16(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function assertValidUnicode(value: string, path: string): void {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError(`${path}: lone high surrogate`);
      i++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new TypeError(`${path}: lone low surrogate`);
    }
  }
}

const SHA256_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
  0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
  0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
  0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
  0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
  0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
]);
