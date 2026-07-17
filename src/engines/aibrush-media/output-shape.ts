export interface IsoBmffTopLevelBox {
  readonly type: string;
  readonly offset: number;
  readonly size: number;
}

export type AibrushIsoOutputShape =
  | { readonly kind: 'progressive-faststart'; readonly boxes: readonly IsoBmffTopLevelBox[] }
  | { readonly kind: 'progressive-tail-moov'; readonly boxes: readonly IsoBmffTopLevelBox[] }
  | { readonly kind: 'fragmented'; readonly boxes: readonly IsoBmffTopLevelBox[]; readonly fragmentCount: number };

export interface AibrushOutputShapeRequest {
  readonly container: string;
  readonly fragmented: boolean;
  readonly fastStart?: boolean;
}

/** Verify advertised ISO BMFF organization from bytes, not from the option that requested it. */
export function verifyAibrushOutputShape(
  bytes: Uint8Array,
  request: AibrushOutputShapeRequest,
): AibrushIsoOutputShape | undefined {
  const container = request.container.toLowerCase();
  if (container !== 'mp4' && container !== 'mov') return undefined;
  const boxes = parseIsoBmffTopLevelBoxes(bytes);
  const ftyp = boxes.findIndex((box) => box.type === 'ftyp');
  const moov = boxes.findIndex((box) => box.type === 'moov');
  const mdat = boxes.findIndex((box) => box.type === 'mdat');
  const fragmentCount = boxes.filter((box) => box.type === 'moof').length;
  if (ftyp < 0 || moov < 0) throw new Error('aibrush ISO BMFF output is missing the ftyp/moov initialization segment');
  if (request.fragmented) {
    if (fragmentCount === 0 || mdat < 0) {
      throw new Error('aibrush output claimed fragmentation but contains no moof+mdat media fragment');
    }
    if (ftyp > moov) throw new Error('aibrush fragmented output does not begin with ftyp followed by moov');
    return { kind: 'fragmented', boxes, fragmentCount };
  }
  if (mdat < 0) throw new Error('aibrush progressive ISO BMFF output has no mdat');
  if (fragmentCount > 0) throw new Error('aibrush progressive output unexpectedly contains moof fragments');
  if (request.fastStart === true) {
    if (!(ftyp < moov && moov < mdat)) {
      throw new Error('aibrush fast-start output is not organized as ftyp+moov before mdat');
    }
    return { kind: 'progressive-faststart', boxes };
  }
  if (request.fastStart === false && !(ftyp < mdat && mdat < moov)) {
    throw new Error('aibrush non-fast-start output does not place mdat before moov');
  }
  return moov < mdat
    ? { kind: 'progressive-faststart', boxes }
    : { kind: 'progressive-tail-moov', boxes };
}

export function parseIsoBmffTopLevelBoxes(bytes: Uint8Array): IsoBmffTopLevelBox[] {
  const boxes: IsoBmffTopLevelBox[] = [];
  let offset = 0;
  while (offset < bytes.byteLength) {
    if (bytes.byteLength - offset < 8) throw new Error(`truncated ISO BMFF box header at byte ${offset}`);
    let size = u32be(bytes, offset);
    const type = ascii4(bytes, offset + 4);
    let headerSize = 8;
    if (size === 1) {
      if (bytes.byteLength - offset < 16) throw new Error(`truncated extended-size box '${type}' at byte ${offset}`);
      const large = u64be(bytes, offset + 8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`box '${type}' exceeds safe integer size`);
      size = Number(large);
      headerSize = 16;
    } else if (size === 0) {
      size = bytes.byteLength - offset;
    }
    if (size < headerSize || offset + size > bytes.byteLength) {
      throw new Error(`invalid ISO BMFF box '${type}' size ${size} at byte ${offset}`);
    }
    boxes.push({ type, offset, size });
    offset += size;
  }
  return boxes;
}

export interface AibrushLiveWebmShape {
  readonly segmentOffset: number;
  readonly segmentDataOffset: number;
  readonly clusterCount: number;
}

/**
 * Verify the live WebM facts this adapter advertises from authored bytes: an unknown-size Segment,
 * no SeekHead/Cues, no finalized Info/Duration, and at least one ordered Cluster. Unknown-size VINTs
 * are recognized as sentinels before numeric conversion, so the valid eight-byte Segment marker is
 * never mistaken for an unsafe JavaScript integer.
 */
export function verifyAibrushLiveWebmShape(bytes: Uint8Array): AibrushLiveWebmShape {
  const ebml = readEbmlElement(bytes, 0, bytes.byteLength);
  if (ebml.id !== 0x1a45dfa3 || ebml.unknownSize) {
    throw new Error('aibrush live WebM output does not begin with a finite EBML header');
  }
  const segmentOffset = ebml.end;
  const segment = readEbmlElement(bytes, segmentOffset, bytes.byteLength);
  if (segment.id !== 0x18538067) throw new Error('aibrush live WebM output has no Segment after the EBML header');
  if (!segment.unknownSize) throw new Error('aibrush live WebM Segment has a finalized finite size');

  let offset = segment.dataOffset;
  let clusterCount = 0;
  while (offset < bytes.byteLength) {
    const element = readEbmlElement(bytes, offset, bytes.byteLength);
    if (element.id === 0x114d9b74) throw new Error('aibrush live WebM output contains forbidden SeekHead');
    if (element.id === 0x1c53bb6b) throw new Error('aibrush live WebM output contains forbidden Cues');
    if (element.id === 0x1549a966) verifyLiveWebmInfo(bytes, element);
    if (element.id === 0x1f43b675) clusterCount++;
    if (element.unknownSize) {
      // An unknown-size terminal Cluster consumes the rest of this continuous segment.
      if (element.id !== 0x1f43b675) {
        throw new Error(`aibrush live WebM element 0x${element.id.toString(16)} has unsupported unknown size`);
      }
      offset = bytes.byteLength;
    } else {
      offset = element.end;
    }
  }
  if (clusterCount === 0) throw new Error('aibrush live WebM output contains no Cluster');
  return { segmentOffset, segmentDataOffset: segment.dataOffset, clusterCount };
}

interface EbmlElement {
  readonly id: number;
  readonly dataOffset: number;
  readonly end: number;
  readonly unknownSize: boolean;
}

function verifyLiveWebmInfo(bytes: Uint8Array, info: EbmlElement): void {
  if (info.unknownSize) throw new Error('aibrush live WebM Info element has unknown size');
  let offset = info.dataOffset;
  while (offset < info.end) {
    const child = readEbmlElement(bytes, offset, info.end);
    if (child.id === 0x4489) throw new Error('aibrush live WebM output contains forbidden finalized Duration');
    if (child.unknownSize) throw new Error('aibrush live WebM Info child has unknown size');
    offset = child.end;
  }
}

function readEbmlElement(bytes: Uint8Array, offset: number, limit: number): EbmlElement {
  const id = readEbmlVint(bytes, offset, limit, true);
  const size = readEbmlVint(bytes, offset + id.width, limit, false);
  const dataOffset = offset + id.width + size.width;
  if (dataOffset > limit) throw new Error(`truncated EBML element header at byte ${offset}`);
  if (size.unknown) return { id: id.value, dataOffset, end: limit, unknownSize: true };
  const end = dataOffset + size.value;
  if (!Number.isSafeInteger(end) || end > limit) {
    throw new Error(`EBML element 0x${id.value.toString(16)} exceeds its parent bounds`);
  }
  return { id: id.value, dataOffset, end, unknownSize: false };
}

function readEbmlVint(
  bytes: Uint8Array,
  offset: number,
  limit: number,
  identifier: boolean,
): { readonly value: number; readonly width: number; readonly unknown: boolean } {
  if (offset >= limit) throw new Error(`truncated EBML vint at byte ${offset}`);
  const first = bytes[offset]!;
  if (first === 0) throw new Error(`invalid zero-leading EBML vint at byte ${offset}`);
  let mask = 0x80;
  let width = 1;
  while ((first & mask) === 0) {
    mask >>= 1;
    width++;
  }
  if (width > 8 || offset + width > limit) throw new Error(`truncated EBML vint at byte ${offset}`);
  let value = identifier ? first : first & (mask - 1);
  let unknown = !identifier && value === mask - 1;
  for (let index = 1; index < width; index++) {
    const byte = bytes[offset + index]!;
    value = value * 256 + byte;
    unknown = unknown && byte === 0xff;
  }
  if (identifier && width > 4) throw new Error(`invalid ${width}-byte EBML identifier at byte ${offset}`);
  if (!unknown && !Number.isSafeInteger(value)) throw new Error(`EBML vint exceeds safe integer range at byte ${offset}`);
  return { value, width, unknown };
}

function u32be(bytes: Uint8Array, offset: number): number {
  return (((bytes[offset]! << 24) >>> 0) + (bytes[offset + 1]! << 16) + (bytes[offset + 2]! << 8) + bytes[offset + 3]!) >>> 0;
}

function u64be(bytes: Uint8Array, offset: number): bigint {
  return (BigInt(u32be(bytes, offset)) << 32n) | BigInt(u32be(bytes, offset + 4));
}

function ascii4(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!);
}
