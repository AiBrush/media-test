/** RFC 8785-style JSON canonicalization and synchronous SHA-256 for stable browser identities. */

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/**
 * Canonicalize a JSON value using ECMAScript number/string serialization and UTF-16 key ordering.
 * Non-JSON values, cycles, non-finite numbers, and lone UTF-16 surrogates are rejected rather than
 * assigned a lossy sentinel. This is the subset required by RFC 8785 / I-JSON definitions.
 */
export function canonicalizeJson(value: unknown): string {
  const active = new Set<object>();

  const encode = (item: unknown, path: string): string => {
    if (item === null || typeof item === 'boolean' || typeof item === 'string') {
      if (typeof item === 'string') assertUnicodeScalarString(item, path);
      return JSON.stringify(item);
    }
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new TypeError(`${path}: expected a finite JSON number`);
      return JSON.stringify(item);
    }
    if (typeof item !== 'object') {
      throw new TypeError(`${path}: ${typeof item} is not JSON-safe`);
    }
    if (active.has(item)) throw new TypeError(`${path}: cyclic values are not JSON-safe`);
    active.add(item);
    try {
      if (Array.isArray(item)) {
        return `[${item.map((entry, index) => encode(entry, `${path}[${index}]`)).join(',')}]`;
      }
      if (Object.getPrototypeOf(item) !== Object.prototype) {
        throw new TypeError(`${path}: only plain JSON objects are canonicalizable`);
      }
      const record = item as Record<string, unknown>;
      const keys = Object.keys(record).sort(compareUtf16);
      return `{${keys.map((key) => {
        assertUnicodeScalarString(key, `${path} key`);
        return `${JSON.stringify(key)}:${encode(record[key], `${path}.${key}`)}`;
      }).join(',')}}`;
    } finally {
      active.delete(item);
    }
  };

  return encode(value, '$');
}

export function canonicalJsonSha256(value: unknown): string {
  return sha256Hex(new TextEncoder().encode(canonicalizeJson(value)));
}

/** Small dependency-free SHA-256 implementation usable during synchronous scenario definition. */
export function sha256Hex(bytes: Uint8Array): string {
  const bitLength = bytes.byteLength * 8;
  const paddedLength = Math.ceil((bytes.byteLength + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.byteLength] = 0x80;
  const view = new DataView(padded.buffer);
  const high = Math.floor(bitLength / 0x1_0000_0000);
  const low = bitLength >>> 0;
  view.setUint32(paddedLength - 8, high, false);
  view.setUint32(paddedLength - 4, low, false);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index++) w[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index++) {
      const x = w[index - 15]!;
      const y = w[index - 2]!;
      const s0 = rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3);
      const s1 = rotateRight(y, 17) ^ rotateRight(y, 19) ^ (y >>> 10);
      w[index] = (w[index - 16]! + s0 + w[index - 7]! + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, hh] = h;
    for (let index = 0; index < 64; index++) {
      const sum1 = rotateRight(e!, 6) ^ rotateRight(e!, 11) ^ rotateRight(e!, 25);
      const choice = (e! & f!) ^ (~e! & g!);
      const temp1 = (hh! + sum1 + choice + SHA256_K[index]! + w[index]!) >>> 0;
      const sum0 = rotateRight(a!, 2) ^ rotateRight(a!, 13) ^ rotateRight(a!, 22);
      const majority = (a! & b!) ^ (a! & c!) ^ (b! & c!);
      const temp2 = (sum0 + majority) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d! + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h[0] = (h[0]! + a!) >>> 0;
    h[1] = (h[1]! + b!) >>> 0;
    h[2] = (h[2]! + c!) >>> 0;
    h[3] = (h[3]! + d!) >>> 0;
    h[4] = (h[4]! + e!) >>> 0;
    h[5] = (h[5]! + f!) >>> 0;
    h[6] = (h[6]! + g!) >>> 0;
    h[7] = (h[7]! + hh!) >>> 0;
  }
  return [...h].map((word) => word.toString(16).padStart(8, '0')).join('');
}

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function compareUtf16(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function assertUnicodeScalarString(value: string, path: string): void {
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new TypeError(`${path}: lone high surrogate is not valid I-JSON`);
      }
      index++;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new TypeError(`${path}: lone low surrogate is not valid I-JSON`);
    }
  }
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
