/**
 * src/engines/web-demuxer/digest.ts — frame normalization + sha256 digest for the web-demuxer engine.
 *
 * BYTE-FOR-BYTE identical to src/engines/platform/digest.ts and src/engines/mediabunny/digest.ts and
 * the rule documented in INTERNAL_API.md (oracles `digestFrame`) + engine.ts §62-74. Kept
 * self-contained under the web-demuxer dir (this agent's writes are scoped here) so decoded-frame
 * digests are comparable to golden data and to every other engine's digests.
 *
 * Normalization rule:
 *   - TIGHT RGBA: 4 bytes/pixel, row stride === width*4 (no padding).
 *   - TOP-LEFT origin: row 0 is the top of the image.
 *   - PREMULTIPLY-OFF: straight (un-premultiplied) alpha. ImageData from a 2D canvas is already
 *     straight-alpha, top-left.
 *   - sha256 hex of that exact RGBA byte buffer (crypto.subtle.digest('SHA-256')).
 *
 * Realm-agnostic (page or Worker): only touches crypto.subtle and plain buffers.
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
  // Hash a tight copy so we never read beyond the region (offset/length safety) and always pass a
  // plain ArrayBuffer (not SharedArrayBuffer) to crypto.subtle.
  const tight = rgba.slice();
  const hash = await crypto.subtle.digest('SHA-256', tight.buffer as ArrayBuffer);
  return toHex(hash);
}

/**
 * Extract a tight (stride === width*4) RGBA buffer from an ImageData. ImageData is always tight and
 * top-left straight-alpha, so this is a copy that drops any backing-store slack.
 */
export function tightRgbaFromImageData(img: ImageData): Uint8Array {
  const expected = img.width * img.height * 4;
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
export async function digestImageData(
  img: ImageData,
  index: number,
  ptsUs: number,
): Promise<FrameDigest> {
  const rgba = tightRgbaFromImageData(img);
  const sha256 = await sha256Hex(rgba);
  return { index, ptsUs, sha256, width: img.width, height: img.height };
}
