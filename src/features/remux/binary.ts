export const MAX_REMUX_TRACKS = 256;
export const MAX_REMUX_SAMPLES = 50_000_000;

export function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = '';
  const end = Math.min(bytes.byteLength, start + length);
  for (let i = start; i < end; i++) out += String.fromCharCode(bytes[i]!);
  return out;
}

export function u16be(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

export function u24be(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! * 0x10000) + (bytes[offset + 1]! << 8) + bytes[offset + 2]!;
}

export function u32be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! * 0x1000000) +
    (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) +
    bytes[offset + 3]!) >>> 0;
}

export function u64beSafe(bytes: Uint8Array, offset: number): number | undefined {
  const high = u32be(bytes, offset);
  const low = u32be(bytes, offset + 4);
  const value = high * 0x1_0000_0000 + low;
  return Number.isSafeInteger(value) ? value : undefined;
}

export function i16be(bytes: Uint8Array, offset: number): number {
  const value = u16be(bytes, offset);
  return value & 0x8000 ? value - 0x1_0000 : value;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function canonicalContainer(value: string | undefined): string {
  const token = (value ?? '').trim().toLowerCase();
  if (token === 'm4a' || token === 'm4v' || token === 'isobmff') return 'mp4';
  if (token === 'matroska') return 'mkv';
  if (token === 'mpegts' || token === 'mpeg-ts' || token === 'm2ts') return 'ts';
  if (token === 'aac') return 'adts';
  return token;
}

export function canonicalCodec(value: string): string {
  const token = value.trim().toLowerCase().replace(/\0+$/g, '');
  if (['avc1', 'avc3', 'v_mpeg4/iso/avc', 'v_avc'].includes(token)) return 'h264';
  if (['hvc1', 'hev1', 'hvc2', 'hev2', 'v_mpegh/iso/hevc', 'v_hevc'].includes(token)) return 'hevc';
  if (['vp08', 'v_vp8'].includes(token)) return 'vp8';
  if (['vp09', 'v_vp9'].includes(token)) return 'vp9';
  if (['av01', 'v_av1'].includes(token)) return 'av1';
  if (['mp4a', 'a_aac'].includes(token)) return 'aac';
  if (['opus', 'a_opus'].includes(token)) return 'opus';
  if (['vorbis', 'a_vorbis'].includes(token)) return 'vorbis';
  if (['flac', 'a_flac'].includes(token)) return 'flac';
  if (['.mp3', 'mp3', 'a_mpeg/l3'].includes(token)) return 'mp3';
  return token;
}

export function safeSlice(bytes: Uint8Array, start: number, end: number): Uint8Array | undefined {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > bytes.byteLength) {
    return undefined;
  }
  return bytes.subarray(start, end);
}

export function sumSafe(values: readonly number[]): number | undefined {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0 || total > Number.MAX_SAFE_INTEGER - value) return undefined;
    total += value;
  }
  return total;
}

export function finitePositive(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}
