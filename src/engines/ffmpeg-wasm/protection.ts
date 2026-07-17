import type { EncryptionScheme } from '../../core/engine.ts';

const ENGINE_ID = 'ffmpeg.wasm@0.12.15';

interface IsoBox {
  start: number;
  end: number;
  bodyStart: number;
  bodyEnd: number;
  type: string;
}

export interface ProtectionInspection {
  protectedTracks: number;
  scheme?: string;
  unsupported?: { reasonCode: string; reason: string };
}

export interface HlsProtectionInspection {
  methods: string[];
}

export type DecryptApplicability =
  | { supported: true }
  | { supported: false; reasonCode: string; reason: string };

export function classifyIsoDecryptApplicability(
  inspection: ProtectionInspection,
  requested: EncryptionScheme,
): DecryptApplicability {
  if (inspection.unsupported) return { supported: false, ...inspection.unsupported };
  if (requested !== 'cenc-ctr') {
    return {
      supported: false,
      reasonCode: 'FFMPEG_DECRYPT_SCHEME_UNSUPPORTED',
      reason: `valid decrypt scheme '${requested}' is not implemented`,
    };
  }
  return { supported: true };
}

export function classifyHlsDecryptApplicability(
  inspection: HlsProtectionInspection,
  requested: EncryptionScheme,
): DecryptApplicability {
  if (requested !== 'hls-aes128') {
    return {
      supported: false,
      reasonCode: requested === 'hls-sample-aes'
        ? 'FFMPEG_HLS_SAMPLE_AES_UNSUPPORTED'
        : 'FFMPEG_DECRYPT_SCHEME_UNSUPPORTED',
      reason: `valid HLS protection scheme '${requested}' is not implemented`,
    };
  }
  const unsupportedMethod = inspection.methods.find((method) => method !== 'AES-128' && method !== 'NONE');
  if (unsupportedMethod !== undefined) {
    return {
      supported: false,
      reasonCode: unsupportedMethod.startsWith('SAMPLE-AES')
        ? 'FFMPEG_HLS_SAMPLE_AES_UNSUPPORTED'
        : 'FFMPEG_HLS_KEY_METHOD_UNSUPPORTED',
      reason: `valid HLS key method '${unsupportedMethod}' is not implemented`,
    };
  }
  return { supported: true };
}

/**
 * Parse enough ISO BMFF protection structure to distinguish a valid unsupported representation
 * from damaged input. Unsupported facts are remembered only after their enclosing boxes have been
 * validated, so a truncated `tenc`/`senc` never gets laundered into NA_ENGINE.
 */
export function inspectIsoBmffProtection(bytes: Uint8Array): ProtectionInspection {
  const roots = boxes(bytes, 0, bytes.byteLength, 'root');
  const moov = requireBox(roots, 'moov', 'root');
  const moovChildren = boxes(bytes, moov.bodyStart, moov.bodyEnd, 'moov');
  const fragmented = roots.some((box) => box.type === 'moof') || moovChildren.some((box) => box.type === 'mvex');
  if (fragmented && !roots.some((box) => box.type === 'moof')) {
    throw new Error(`${ENGINE_ID}: fragmented protected input has no media fragment`);
  }

  let protectedTracks = 0;
  let observedScheme: string | undefined;
  let unsupported: ProtectionInspection['unsupported'];
  const remember = (reasonCode: string, reason: string): void => {
    unsupported ??= { reasonCode, reason };
  };

  for (const trak of moovChildren.filter((box) => box.type === 'trak')) {
    const mdia = requireBox(boxes(bytes, trak.bodyStart, trak.bodyEnd, 'trak'), 'mdia', 'trak');
    const minf = requireBox(boxes(bytes, mdia.bodyStart, mdia.bodyEnd, 'trak/mdia'), 'minf', 'trak/mdia');
    const stbl = requireBox(boxes(bytes, minf.bodyStart, minf.bodyEnd, 'trak/mdia/minf'), 'stbl', 'trak/mdia/minf');
    const stblChildren = boxes(bytes, stbl.bodyStart, stbl.bodyEnd, 'trak/mdia/minf/stbl');
    const stsd = requireBox(stblChildren, 'stsd', 'trak/mdia/minf/stbl');

    for (const entry of sampleEntries(bytes, stsd)) {
      if (entry.type !== 'encv' && entry.type !== 'enca') continue;
      protectedTracks++;
      const entryChildren = boxes(bytes, sampleEntryChildrenStart(bytes, entry), entry.bodyEnd, `${entry.type} sample entry`);
      const sinf = requireBox(entryChildren, 'sinf', `${entry.type} sample entry`);
      const sinfChildren = boxes(bytes, sinf.bodyStart, sinf.bodyEnd, 'sinf');
      const frma = requireBox(sinfChildren, 'frma', 'sinf');
      if (frma.bodyEnd - frma.bodyStart !== 4) throw new Error(`${ENGINE_ID}: malformed original-format box`);
      const schm = requireBox(sinfChildren, 'schm', 'sinf');
      if (schm.bodyEnd - schm.bodyStart < 12) throw new Error(`${ENGINE_ID}: truncated schm protection box`);
      const scheme = ascii(bytes, schm.bodyStart + 4, 4);
      if (!/^[\x20-\x7e]{4}$/.test(scheme)) throw new Error(`${ENGINE_ID}: malformed protection scheme type`);
      if (observedScheme !== undefined && observedScheme !== scheme) {
        remember(
          'FFMPEG_CENC_MIXED_SCHEMES_UNSUPPORTED',
          `multiple protection schemes (${observedScheme}, ${scheme}) are not implemented`,
        );
      }
      observedScheme ??= scheme;

      const schi = requireBox(sinfChildren, 'schi', 'sinf');
      const tenc = requireBox(boxes(bytes, schi.bodyStart, schi.bodyEnd, 'sinf/schi'), 'tenc', 'sinf/schi');
      const tencInfo = inspectTenc(bytes, tenc);

      if (scheme !== 'cenc') {
        remember(
          scheme === 'cbcs' ? 'FFMPEG_CENC_CBCS_UNSUPPORTED' : 'FFMPEG_CENC_SCHEME_UNSUPPORTED',
          `valid '${scheme}' protection is not implemented by the CENC-CTR clear-output path`,
        );
      }
      if (tencInfo.constantIv) {
        remember('FFMPEG_CENC_IV_FORM_UNSUPPORTED', 'valid constant-IV protection is not implemented');
      }
      if (tencInfo.cryptByteBlock !== 0 || tencInfo.skipByteBlock !== 0) {
        remember(
          'FFMPEG_CENC_PATTERN_UNSUPPORTED',
          `valid pattern encryption ${tencInfo.cryptByteBlock}:${tencInfo.skipByteBlock} is not implemented`,
        );
      }

      if (!fragmented) {
        inspectNonFragmentedAuxInfo(bytes, stblChildren, tencInfo.ivSize, remember);
      }
    }
  }

  if (fragmented && protectedTracks > 0) {
    // Validate each fragment's box layout before classifying it as unsupported. Detailed sample
    // ranges remain the decryptor's responsibility for supported nonfragmented input.
    for (const moof of roots.filter((box) => box.type === 'moof')) {
      const moofChildren = boxes(bytes, moof.bodyStart, moof.bodyEnd, 'moof');
      if (!moofChildren.some((box) => box.type === 'traf')) {
        throw new Error(`${ENGINE_ID}: media fragment has no traf`);
      }
      for (const traf of moofChildren.filter((box) => box.type === 'traf')) {
        const trafChildren = boxes(bytes, traf.bodyStart, traf.bodyEnd, 'moof/traf');
        requireBox(trafChildren, 'tfhd', 'moof/traf');
        requireBox(trafChildren, 'trun', 'moof/traf');
        const senc = trafChildren.find((box) => box.type === 'senc');
        const saiz = trafChildren.find((box) => box.type === 'saiz');
        const saio = trafChildren.find((box) => box.type === 'saio');
        if (!senc && !saiz && !saio) throw new Error(`${ENGINE_ID}: protected fragment has no sample encryption info`);
        if (!senc && Boolean(saiz) !== Boolean(saio)) {
          throw new Error(`${ENGINE_ID}: fragmented auxiliary encryption info requires both saiz and saio`);
        }
        if (senc) inspectSenc(bytes, senc, 8, remember);
      }
    }
    remember(
      'FFMPEG_CENC_FRAGMENTED_UNSUPPORTED',
      'valid fragmented CENC is not implemented by the nonfragmented sample-table path',
    );
  }

  return {
    protectedTracks,
    ...(observedScheme !== undefined ? { scheme: observedScheme } : {}),
    ...(unsupported !== undefined ? { unsupported } : {}),
  };
}

/** Syntax-first HLS key inspection used before scheme applicability is decided. */
export function inspectHlsProtection(bytes: Uint8Array): HlsProtectionInspection {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  } catch (error) {
    throw new Error(`${ENGINE_ID}: HLS playlist is not valid UTF-8`, { cause: error });
  }
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines[0] !== '#EXTM3U') throw new Error(`${ENGINE_ID}: malformed HLS playlist (missing #EXTM3U)`);
  const methods = new Set<string>();
  let mediaUriCount = 0;
  for (const line of lines.slice(1)) {
    if (!line.startsWith('#')) mediaUriCount++;
    if (!line.startsWith('#EXT-X-KEY:')) continue;
    const attrs = parseHlsAttributes(line.slice('#EXT-X-KEY:'.length));
    const method = attrs.get('METHOD');
    if (!method) throw new Error(`${ENGINE_ID}: malformed EXT-X-KEY without METHOD`);
    methods.add(method);
    if (method !== 'NONE' && !attrs.get('URI')) {
      throw new Error(`${ENGINE_ID}: malformed EXT-X-KEY without URI`);
    }
    const iv = attrs.get('IV');
    if (iv !== undefined && !/^0[xX][0-9a-fA-F]{32}$/.test(iv)) {
      throw new Error(`${ENGINE_ID}: malformed EXT-X-KEY IV`);
    }
  }
  if (mediaUriCount === 0) throw new Error(`${ENGINE_ID}: HLS media playlist has no segment URI`);
  return { methods: [...methods].sort() };
}

function boxes(bytes: Uint8Array, start: number, end: number, context: string): IsoBox[] {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > bytes.length) {
    throw new Error(`${ENGINE_ID}: invalid ${context} box range`);
  }
  const out: IsoBox[] = [];
  let offset = start;
  while (offset < end) {
    if (offset + 8 > end) throw new Error(`${ENGINE_ID}: truncated ${context} box header`);
    let size = u32(bytes, offset);
    let headerSize = 8;
    const type = ascii(bytes, offset + 4, 4);
    if (size === 1) {
      if (offset + 16 > end) throw new Error(`${ENGINE_ID}: truncated extended ${context} box header`);
      size = u64(bytes, offset + 8);
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < headerSize || offset + size > end) {
      throw new Error(`${ENGINE_ID}: invalid ${context}/${type || '????'} box size`);
    }
    out.push({
      start: offset,
      end: offset + size,
      bodyStart: offset + headerSize,
      bodyEnd: offset + size,
      type,
    });
    offset += size;
  }
  return out;
}

function requireBox(values: IsoBox[], type: string, context: string): IsoBox {
  const value = values.find((box) => box.type === type);
  if (!value) throw new Error(`${ENGINE_ID}: protected input requires ${context}/${type}`);
  return value;
}

function sampleEntries(bytes: Uint8Array, stsd: IsoBox): IsoBox[] {
  if (stsd.bodyEnd - stsd.bodyStart < 8) throw new Error(`${ENGINE_ID}: truncated stsd`);
  const count = u32(bytes, stsd.bodyStart + 4);
  const entries: IsoBox[] = [];
  let offset = stsd.bodyStart + 8;
  for (let index = 0; index < count; index++) {
    if (offset + 8 > stsd.bodyEnd) throw new Error(`${ENGINE_ID}: truncated stsd entry`);
    const size = u32(bytes, offset);
    if (size < 8 || offset + size > stsd.bodyEnd) throw new Error(`${ENGINE_ID}: invalid stsd entry size`);
    entries.push({
      start: offset,
      end: offset + size,
      bodyStart: offset + 8,
      bodyEnd: offset + size,
      type: ascii(bytes, offset + 4, 4),
    });
    offset += size;
  }
  if (offset !== stsd.bodyEnd) throw new Error(`${ENGINE_ID}: stsd entry count/size mismatch`);
  return entries;
}

function sampleEntryChildrenStart(bytes: Uint8Array, entry: IsoBox): number {
  if (entry.type === 'encv') return checkedChildStart(entry, entry.start + 8 + 78);
  if (entry.type === 'enca') {
    if (entry.start + 18 > entry.bodyEnd) throw new Error(`${ENGINE_ID}: truncated encrypted audio sample entry`);
    const version = u16(bytes, entry.start + 16);
    const extra = version === 0 ? 0 : version === 1 ? 16 : version === 2 ? 36 : -1;
    if (extra < 0) throw new Error(`${ENGINE_ID}: invalid encrypted audio sample-entry version ${version}`);
    return checkedChildStart(entry, entry.start + 8 + 28 + extra);
  }
  return entry.bodyStart;
}

function checkedChildStart(entry: IsoBox, start: number): number {
  if (start > entry.bodyEnd) throw new Error(`${ENGINE_ID}: truncated ${entry.type} sample entry`);
  return start;
}

function inspectTenc(bytes: Uint8Array, tenc: IsoBox): {
  ivSize: number;
  cryptByteBlock: number;
  skipByteBlock: number;
  constantIv: boolean;
} {
  if (tenc.bodyEnd - tenc.bodyStart < 24) throw new Error(`${ENGINE_ID}: truncated tenc`);
  const version = bytes[tenc.bodyStart]!;
  if (version > 1) throw new Error(`${ENGINE_ID}: invalid tenc version ${version}`);
  const pattern = bytes[tenc.bodyStart + 5]!;
  const isProtected = bytes[tenc.bodyStart + 6]!;
  const ivSize = bytes[tenc.bodyStart + 7]!;
  if (isProtected !== 1) throw new Error(`${ENGINE_ID}: encrypted sample entry has unprotected tenc`);
  if (ivSize === 0) {
    if (tenc.bodyStart + 25 > tenc.bodyEnd) throw new Error(`${ENGINE_ID}: truncated constant-IV tenc`);
    const constantSize = bytes[tenc.bodyStart + 24]!;
    if (constantSize !== 8 && constantSize !== 16) throw new Error(`${ENGINE_ID}: invalid constant IV size ${constantSize}`);
    if (tenc.bodyStart + 25 + constantSize > tenc.bodyEnd) throw new Error(`${ENGINE_ID}: truncated constant IV`);
  } else if (ivSize !== 8 && ivSize !== 16) {
    throw new Error(`${ENGINE_ID}: invalid per-sample IV size ${ivSize}`);
  }
  return {
    ivSize,
    cryptByteBlock: version === 1 ? pattern >> 4 : 0,
    skipByteBlock: version === 1 ? pattern & 0x0f : 0,
    constantIv: ivSize === 0,
  };
}

function inspectNonFragmentedAuxInfo(
  bytes: Uint8Array,
  stblChildren: IsoBox[],
  ivSize: number,
  remember: (reasonCode: string, reason: string) => void,
): void {
  const senc = stblChildren.find((box) => box.type === 'senc');
  const saiz = stblChildren.find((box) => box.type === 'saiz');
  const saio = stblChildren.find((box) => box.type === 'saio');
  if (!senc) {
    if (Boolean(saiz) !== Boolean(saio)) {
      throw new Error(`${ENGINE_ID}: auxiliary encryption info requires both saiz and saio`);
    }
    if (!saiz || !saio) throw new Error(`${ENGINE_ID}: protected nonfragmented track has no sample encryption info`);
    inspectSaiz(bytes, saiz);
    inspectSaio(bytes, saio);
    remember(
      'FFMPEG_CENC_AUX_INFO_UNSUPPORTED',
      'valid saiz/saio auxiliary encryption info without inline senc is not implemented',
    );
    return;
  }
  inspectSenc(bytes, senc, ivSize, remember);
}

function inspectSenc(
  bytes: Uint8Array,
  senc: IsoBox,
  defaultIvSize: number,
  remember: (reasonCode: string, reason: string) => void,
): void {
  if (senc.bodyEnd - senc.bodyStart < 8) throw new Error(`${ENGINE_ID}: truncated senc`);
  const flags = u24(bytes, senc.bodyStart + 1);
  let offset = senc.bodyStart + 4;
  let ivSize = defaultIvSize;
  if ((flags & 0x01) !== 0) {
    if (offset + 20 > senc.bodyEnd) throw new Error(`${ENGINE_ID}: truncated senc override parameters`);
    ivSize = bytes[offset + 3]!;
    if (ivSize !== 8 && ivSize !== 16) throw new Error(`${ENGINE_ID}: invalid senc override IV size ${ivSize}`);
    offset += 20;
    remember('FFMPEG_CENC_OVERRIDE_UNSUPPORTED', 'valid senc override parameters are not implemented');
  }
  if (offset + 4 > senc.bodyEnd) throw new Error(`${ENGINE_ID}: truncated senc sample count`);
  const count = u32(bytes, offset);
  offset += 4;
  for (let index = 0; index < count; index++) {
    if (offset + ivSize > senc.bodyEnd) throw new Error(`${ENGINE_ID}: truncated senc IV`);
    offset += ivSize;
    if ((flags & 0x02) !== 0) {
      if (offset + 2 > senc.bodyEnd) throw new Error(`${ENGINE_ID}: truncated senc subsample count`);
      const subsamples = u16(bytes, offset);
      offset += 2;
      if (offset + subsamples * 6 > senc.bodyEnd) throw new Error(`${ENGINE_ID}: truncated senc subsample data`);
      offset += subsamples * 6;
    }
  }
  if (offset !== senc.bodyEnd) throw new Error(`${ENGINE_ID}: senc sample count/size mismatch`);
}

function inspectSaiz(bytes: Uint8Array, saiz: IsoBox): void {
  if (saiz.bodyEnd - saiz.bodyStart < 9) throw new Error(`${ENGINE_ID}: truncated saiz`);
  const flags = u24(bytes, saiz.bodyStart + 1);
  let offset = saiz.bodyStart + 4 + ((flags & 1) !== 0 ? 8 : 0);
  if (offset + 5 > saiz.bodyEnd) throw new Error(`${ENGINE_ID}: truncated saiz fields`);
  const defaultSize = bytes[offset]!;
  const count = u32(bytes, offset + 1);
  offset += 5;
  if (defaultSize === 0) offset += count;
  if (offset !== saiz.bodyEnd) throw new Error(`${ENGINE_ID}: saiz sample count/size mismatch`);
}

function inspectSaio(bytes: Uint8Array, saio: IsoBox): void {
  if (saio.bodyEnd - saio.bodyStart < 8) throw new Error(`${ENGINE_ID}: truncated saio`);
  const version = bytes[saio.bodyStart]!;
  const flags = u24(bytes, saio.bodyStart + 1);
  let offset = saio.bodyStart + 4 + ((flags & 1) !== 0 ? 8 : 0);
  if (offset + 4 > saio.bodyEnd) throw new Error(`${ENGINE_ID}: truncated saio count`);
  const count = u32(bytes, offset);
  offset += 4 + count * (version === 0 ? 4 : 8);
  if (offset !== saio.bodyEnd) throw new Error(`${ENGINE_ID}: saio entry count/size mismatch`);
}

function parseHlsAttributes(value: string): Map<string, string> {
  const attrs = new Map<string, string>();
  let offset = 0;
  while (offset < value.length) {
    const keyMatch = /^([A-Z0-9-]+)=/.exec(value.slice(offset));
    if (!keyMatch) throw new Error(`${ENGINE_ID}: malformed EXT-X-KEY attribute list`);
    const key = keyMatch[1]!;
    offset += keyMatch[0].length;
    let item = '';
    if (value[offset] === '"') {
      const end = value.indexOf('"', offset + 1);
      if (end < 0) throw new Error(`${ENGINE_ID}: unterminated EXT-X-KEY quoted value`);
      item = value.slice(offset + 1, end);
      offset = end + 1;
    } else {
      const comma = value.indexOf(',', offset);
      const end = comma < 0 ? value.length : comma;
      item = value.slice(offset, end).trim();
      offset = end;
    }
    if (!item || attrs.has(key)) throw new Error(`${ENGINE_ID}: malformed/duplicate EXT-X-KEY ${key}`);
    attrs.set(key, item);
    if (offset < value.length) {
      if (value[offset] !== ',') throw new Error(`${ENGINE_ID}: malformed EXT-X-KEY separator`);
      offset++;
    }
  }
  return attrs;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = '';
  for (let index = 0; index < length; index++) out += String.fromCharCode(bytes[offset + index]!);
  return out;
}

function u16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function u24(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 16) | (bytes[offset + 1]! << 8) | bytes[offset + 2]!;
}

function u32(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! * 0x1000000 + (bytes[offset + 1]! << 16) + (bytes[offset + 2]! << 8) + bytes[offset + 3]!;
}

function u64(bytes: Uint8Array, offset: number): number {
  const value = u32(bytes, offset) * 0x100000000 + u32(bytes, offset + 4);
  if (!Number.isSafeInteger(value)) throw new Error(`${ENGINE_ID}: box size exceeds safe integer range`);
  return value;
}
