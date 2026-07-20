/**
 * src/core/seeded-rng.ts — deterministic hashing primitives used by execution ordering and media
 * selection.
 *
 * FNV-1a/mulberry32 remain the legacy execution-order stream. Candidate selection uses the specified
 * SHA-256 HRW contract below, so catalog ordering and unrelated candidate additions cannot shift an
 * existing candidate's score.
 */

/** FNV-1a over the seed string → 32-bit unsigned. Empty seed falls back to a per-call random value. */
export function hashSeed(seed: string): number {
  const text = seed || `${Date.now()}:${Math.random()}`;
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 PRNG: seed (uint32) → deterministic () => float in [0,1). */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// SHA-256 is intentionally implemented here instead of delegating to Web Crypto: selection and cache
// identity are synchronous construction-time contracts, while SubtleCrypto.digest() is asynchronous
// and has no streaming interface. This implementation follows FIPS 180-4, accepts incremental input,
// and uses only specified 32-bit integer operations, so its output is identical in every supported JS
// realm/browser. `hashSeed`/`mulberry32` above remain frozen for legacy execution-order replay only.

const SHA256_INITIAL = new Uint32Array([
  0x6a09e667,
  0xbb67ae85,
  0x3c6ef372,
  0xa54ff53a,
  0x510e527f,
  0x9b05688c,
  0x1f83d9ab,
  0x5be0cd19,
]);

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

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

/** Incremental FIPS 180-4 SHA-256. Instances are single-use after digest(). */
export class Sha256 {
  readonly #state = SHA256_INITIAL.slice();
  readonly #block = new Uint8Array(64);
  readonly #words = new Uint32Array(64);
  #blockLength = 0;
  #totalBytes = 0;
  #finished = false;

  update(value: string | Uint8Array): this {
    if (this.#finished) throw new Error('Sha256: update() after digest()');
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
    if (!(bytes instanceof Uint8Array)) throw new TypeError('Sha256.update expects a string or Uint8Array');
    this.#totalBytes += bytes.byteLength;
    if (!Number.isSafeInteger(this.#totalBytes)) throw new RangeError('Sha256 input exceeds safe byte length');

    let offset = 0;
    if (this.#blockLength > 0) {
      const take = Math.min(64 - this.#blockLength, bytes.byteLength);
      this.#block.set(bytes.subarray(0, take), this.#blockLength);
      this.#blockLength += take;
      offset = take;
      if (this.#blockLength === 64) {
        this.#compress(this.#block, 0);
        this.#blockLength = 0;
      }
    }
    while (offset + 64 <= bytes.byteLength) {
      // Pass the source offset directly. Creating one subarray view per compression block makes a
      // 1 GiB streaming admission allocate ~16.8 million short-lived objects before any adapter is
      // called, despite SHA-256 needing only indexed reads from the original view.
      this.#compress(bytes, offset);
      offset += 64;
    }
    if (offset < bytes.byteLength) {
      this.#block.set(bytes.subarray(offset), 0);
      this.#blockLength = bytes.byteLength - offset;
    }
    return this;
  }

  digest(): Uint8Array {
    if (this.#finished) throw new Error('Sha256: digest() called twice');
    this.#finished = true;

    const used = this.#blockLength;
    this.#block[used] = 0x80;
    this.#block.fill(0, used + 1);
    if (used >= 56) {
      this.#compress(this.#block, 0);
      this.#block.fill(0);
    }
    const bitHigh = Math.floor(this.#totalBytes / 0x20000000) >>> 0;
    const bitLow = (this.#totalBytes * 8) >>> 0;
    writeUint32Be(this.#block, 56, bitHigh);
    writeUint32Be(this.#block, 60, bitLow);
    this.#compress(this.#block, 0);

    const output = new Uint8Array(32);
    for (let i = 0; i < this.#state.length; i++) writeUint32Be(output, i * 4, this.#state[i]!);
    return output;
  }

  hex(): string {
    return bytesToLowerHex(this.digest());
  }

  #compress(block: Uint8Array, blockOffset: number): void {
    const w = this.#words;
    for (let i = 0; i < 16; i++) {
      const offset = blockOffset + i * 4;
      w[i] = (
        (block[offset]! << 24) |
        (block[offset + 1]! << 16) |
        (block[offset + 2]! << 8) |
        block[offset + 3]!
      ) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15]!;
      const y = w[i - 2]!;
      const s0 = rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3);
      const s1 = rotateRight(y, 17) ^ rotateRight(y, 19) ^ (y >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }

    let a = this.#state[0]!;
    let b = this.#state[1]!;
    let c = this.#state[2]!;
    let d = this.#state[3]!;
    let e = this.#state[4]!;
    let f = this.#state[5]!;
    let g = this.#state[6]!;
    let h = this.#state[7]!;
    for (let i = 0; i < 64; i++) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + choice + SHA256_K[i]! + w[i]!) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    this.#state[0] = (this.#state[0]! + a) >>> 0;
    this.#state[1] = (this.#state[1]! + b) >>> 0;
    this.#state[2] = (this.#state[2]! + c) >>> 0;
    this.#state[3] = (this.#state[3]! + d) >>> 0;
    this.#state[4] = (this.#state[4]! + e) >>> 0;
    this.#state[5] = (this.#state[5]! + f) >>> 0;
    this.#state[6] = (this.#state[6]! + g) >>> 0;
    this.#state[7] = (this.#state[7]! + h) >>> 0;
  }
}

/** One-shot SHA-256 over UTF-8 text or exact bytes, returned as lowercase 64-hex. */
export function sha256Hex(value: string | Uint8Array): string {
  return new Sha256().update(value).hex();
}

export function bytesToLowerHex(bytes: Uint8Array): string {
  let output = '';
  for (const byte of bytes) output += byte.toString(16).padStart(2, '0');
  return output;
}

function writeUint32Be(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value >>> 24;
  target[offset + 1] = value >>> 16;
  target[offset + 2] = value >>> 8;
  target[offset + 3] = value;
}
