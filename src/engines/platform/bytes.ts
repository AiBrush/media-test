/**
 * src/engines/platform/bytes.ts — big-endian integer readers + fourcc decoding shared by the inline
 * MP4 (ISO-BMFF) and WebM (EBML) demuxers. All readers are bounds-tolerant in the sense that the
 * callers guard ranges; these helpers assume the requested bytes are present.
 */

export function be16(b: Uint8Array, o: number): number {
  return ((b[o] as number) << 8) | (b[o + 1] as number);
}

export function be24(b: Uint8Array, o: number): number {
  return ((b[o] as number) << 16) | ((b[o + 1] as number) << 8) | (b[o + 2] as number);
}

/** 32-bit big-endian, returned as an unsigned JS number (>>> 0). */
export function be32(b: Uint8Array, o: number): number {
  return (
    (((b[o] as number) << 24) |
      ((b[o + 1] as number) << 16) |
      ((b[o + 2] as number) << 8) |
      (b[o + 3] as number)) >>>
    0
  );
}

/** 64-bit big-endian as a BigInt (sizes/offsets can exceed 2^53 in theory; callers Number() it). */
export function be64(b: Uint8Array, o: number): bigint {
  const hi = BigInt(be32(b, o));
  const lo = BigInt(be32(b, o + 4));
  return (hi << 32n) | lo;
}

/** Decode 4 ASCII bytes at offset into a box type string (e.g. 'moov'). */
export function fourcc(b: Uint8Array, o: number): string {
  return String.fromCharCode(b[o] as number, b[o + 1] as number, b[o + 2] as number, b[o + 3] as number);
}

/** A tiny forward cursor over a Uint8Array (used by the EBML reader). */
export class Reader {
  constructor(
    public readonly buf: Uint8Array,
    public pos = 0,
  ) {}

  get remaining(): number {
    return this.buf.length - this.pos;
  }

  u8(): number {
    return this.buf[this.pos++] as number;
  }
}
