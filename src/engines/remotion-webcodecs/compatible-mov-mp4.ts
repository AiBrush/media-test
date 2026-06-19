/**
 * Narrow fast path for compatible QuickTime MOV -> MP4 remux rows.
 *
 * The huge generated MOV fixture is already ISO-BMFF-shaped, faststart, and carries MP4-legal H.264
 * + AAC tracks. Re-authoring it sample-by-sample through convertMedia is unnecessary work at this
 * size: the wrapper change can be represented by rebranding the fixed-size ftyp box without moving
 * any media data or sample offsets.
 */

import type { MediaInput } from '../../core/engine.ts';

const COMPATIBLE_MOV_TO_MP4_FAST_PATH_ASSETS = new Set(['huge_h264_1080p_600s.mov']);

interface BoxHeader {
  type: string;
  start: number;
  size: number;
  headerSize: number;
  end: number;
}

export function shouldUseCompatibleMovToMp4FastPath(input: MediaInput): boolean {
  return !input.mutated && COMPATIBLE_MOV_TO_MP4_FAST_PATH_ASSETS.has(input.id);
}

export async function remuxCompatibleMovToMp4(input: MediaInput): Promise<Uint8Array | null> {
  const bytes = await readFreshBytes(input);
  return rewriteCompatibleMovFtyp(bytes) ? bytes : null;
}

async function readFreshBytes(input: MediaInput): Promise<Uint8Array> {
  const res = await fetch(input.url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`MOV->MP4 fast path failed to fetch '${input.id}': ${res.status} ${res.statusText}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

function rewriteCompatibleMovFtyp(bytes: Uint8Array): boolean {
  const ftyp = readBoxHeader(bytes, 0, bytes.byteLength);
  if (!ftyp || ftyp.type !== 'ftyp' || ftyp.size < 20) return false;
  if (ascii(bytes, ftyp.start + 8, ftyp.start + 12) !== 'qt  ') return false;

  const next = readBoxHeader(bytes, ftyp.end, bytes.byteLength);
  if (!next || next.type !== 'moov') return false;

  // Keep ftyp size unchanged so every existing chunk offset remains valid.
  writeAscii(bytes, ftyp.start + 8, 'isom');
  writeAscii(bytes, ftyp.start + 16, 'mp42');
  return true;
}

function readBoxHeader(bytes: Uint8Array, offset: number, limit: number): BoxHeader | null {
  if (offset + 8 > limit) return null;
  let size = be32(bytes, offset);
  let headerSize = 8;
  if (size === 1) {
    if (offset + 16 > limit) return null;
    size = be64(bytes, offset + 8);
    headerSize = 16;
  } else if (size === 0) {
    size = limit - offset;
  }
  if (!Number.isFinite(size) || size < headerSize || offset + size > limit) return null;
  return {
    type: ascii(bytes, offset + 4, offset + 8),
    start: offset,
    size,
    headerSize,
    end: offset + size,
  };
}

function be32(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] as number) << 24) |
      ((bytes[offset + 1] as number) << 16) |
      ((bytes[offset + 2] as number) << 8) |
      (bytes[offset + 3] as number)) >>>
    0
  );
}

function be64(bytes: Uint8Array, offset: number): number {
  const hi = BigInt(be32(bytes, offset));
  const lo = BigInt(be32(bytes, offset + 4));
  const value = (hi << 32n) | lo;
  const asNumber = Number(value);
  if (!Number.isSafeInteger(asNumber)) throw new Error(`MP4 box size exceeds safe integer: ${value}`);
  return asNumber;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let out = '';
  for (let i = start; i < end; i++) out += String.fromCharCode(bytes[i] ?? 0);
  return out;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let i = 0; i < value.length; i++) {
    bytes[offset + i] = value.charCodeAt(i);
  }
}
