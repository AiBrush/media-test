/**
 * src/engines/platform/digest.ts — frame normalization + sha256 digest, byte-for-byte compatible
 * with `oracles.ts`'s rule so platform-produced digests are comparable to golden / other engines.
 *
 * Normalization rule (mirrors engine.ts §62-74 and INTERNAL_API.md §oracles "digestFrame"):
 *   - TIGHT RGBA: 4 bytes/pixel, row stride === width*4 (no padding).
 *   - TOP-LEFT origin: row 0 is the top of the image (ImageData is already top-left; VideoFrame and
 *     WebGL/canvas reads are normalized to this).
 *   - PREMULTIPLY-OFF: straight (un-premultiplied) alpha. ImageData from a 2D canvas is already
 *     straight-alpha; VideoFrame copyTo with RGBA + canvas drawImage both yield straight alpha.
 *   - sha256 hex of that exact RGBA byte buffer (via crypto.subtle.digest('SHA-256')).
 *
 * This module is realm-agnostic (page or Worker): it only touches crypto.subtle and plain buffers.
 */

import type { FrameDigest } from '../../core/engine.ts';

/** Lowercase hex of a hash buffer. */
function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += (bytes[i] as number).toString(16).padStart(2, '0');
  }
  return out;
}

/**
 * sha256 hex of a tight RGBA byte buffer. The buffer MUST already be normalized (tight, top-left,
 * straight alpha) — callers obtain such a buffer from {@link tightRgbaFromImageData}.
 */
export async function sha256Hex(rgba: Uint8Array): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('crypto.subtle unavailable: cannot compute frame digest in this realm');
  }
  // Copy into a fresh, exactly-sized ArrayBuffer-backed Uint8Array so we (a) never hash beyond the
  // tight region and (b) never pass a SharedArrayBuffer-backed view (crypto.subtle wants ArrayBuffer).
  const tight = new Uint8Array(rgba.length);
  tight.set(rgba);
  const hash = await crypto.subtle.digest('SHA-256', tight.buffer);
  return toHex(hash);
}

/**
 * Extract a tight (stride === width*4) RGBA buffer from an ImageData. ImageData is always tight and
 * top-left straight-alpha, so this is a copy that drops any backing-store slack. Returns the exact
 * bytes the digest is computed over.
 */
export function tightRgbaFromImageData(img: ImageData): Uint8Array {
  const expected = img.width * img.height * 4;
  // ImageData.data is a Uint8ClampedArray that is already tight; copy into a plain Uint8Array view
  // of exactly the expected length (defensive against any over-allocated backing store).
  const src = img.data;
  if (src.length === expected) {
    return new Uint8Array(src.buffer, src.byteOffset, expected).slice();
  }
  const out = new Uint8Array(expected);
  out.set(src.subarray(0, expected));
  return out;
}

/**
 * Compute a {@link FrameDigest} from an ImageData. Mirrors oracles.ts `digestFrame(img, index,
 * ptsUs)`: sha256 hex of the tight RGBA buffer, carrying index/pts/width/height.
 */
export async function digestImageData(img: ImageData, index: number, ptsUs: number): Promise<FrameDigest> {
  const rgba = tightRgbaFromImageData(img);
  const sha256 = await sha256Hex(rgba);
  return { index, ptsUs, sha256, width: img.width, height: img.height };
}
