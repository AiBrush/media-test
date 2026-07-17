import {
  EXTENDED_METADATA_SCHEMA,
  type MetadataCarrier,
  type NeutralMetadataEvidence,
  type NeutralMetadataReadResult,
  type ScopedMetadataTag,
} from './types.ts';

interface RawTag {
  rawKey: string;
  value: string;
  scope?: ScopedMetadataTag['scope'];
  trackId?: string;
  chapterId?: string;
  attachmentId?: string;
  language?: string;
  carrierPath: string;
}

interface Box {
  type: string;
  start: number;
  bodyStart: number;
  end: number;
}

interface EbmlElement {
  id: number;
  start: number;
  bodyStart: number;
  end: number;
}

const textUtf8 = new TextDecoder('utf-8', { fatal: false });
const textUtf8Fatal = new TextDecoder('utf-8', { fatal: true });
const textLatin1 = new TextDecoder('windows-1252', { fatal: false });
const textUtf16Le = new TextDecoder('utf-16le', { fatal: false });
const textUtf16Be = new TextDecoder('utf-16be', { fatal: false });

/**
 * Engine-independent tag-carrier reader. It intentionally reads only authored metadata carriers;
 * media preservation is checked by a separate structural/decode oracle so tag success cannot hide
 * corrupt samples.
 */
export function readNeutralMetadataTags(
  bytes: Uint8Array,
  containerHint?: string,
): NeutralMetadataReadResult {
  const hint = normalizeCarrier(containerHint);
  const carrier = detectCarrier(bytes) ?? hint;
  if (!carrier) {
    return problem('UNSUPPORTED_FORMAT', 'METADATA_CARRIER_UNSUPPORTED', 'metadata carrier is not supported', bytes, containerHint);
  }
  try {
    const parsed = (() => {
      switch (carrier) {
        case 'mp4':
        case 'mov':
          return readIsoBmffTags(bytes);
        case 'mkv':
        case 'webm':
          return readMatroskaTags(bytes);
        case 'mp3':
          return readId3Tags(bytes);
        case 'flac':
          return readFlacTags(bytes);
        case 'ogg':
          return readOggTags(bytes);
        case 'wav':
          return readWavTags(bytes);
        case 'aiff':
          return readAiffTags(bytes);
      }
    })();
    if (!parsed) {
      return problem('UNSUPPORTED_FORMAT', 'METADATA_CARRIER_UNSUPPORTED', `no neutral metadata reader for '${carrier}'`, bytes, carrier);
    }
    if ('state' in parsed) return parsed;
    return ok(carrier, bytes.byteLength, parsed);
  } catch (error) {
    return problem(
      'MALFORMED',
      'METADATA_READER_GUARD',
      `neutral metadata reader rejected malformed bytes: ${message(error)}`,
      bytes,
      carrier,
    );
  }
}

function readIsoBmffTags(bytes: Uint8Array): RawTag[] | NeutralMetadataReadResult {
  if (bytes.byteLength < 8) return incomplete('METADATA_ISOBMFF_HEADER_INCOMPLETE', bytes, 'mp4');
  const roots = boxes(bytes, 0, bytes.byteLength);
  if (!roots || !roots.some((box) => ['ftyp', 'moov', 'moof', 'mdat'].includes(box.type))) {
    return malformed('METADATA_ISOBMFF_BOX_INVALID', bytes, 'mp4');
  }
  const tags: RawTag[] = [];
  for (const moov of roots.filter((box) => box.type === 'moov')) {
    const children = boxes(bytes, moov.bodyStart, moov.end);
    if (!children) return malformed('METADATA_ISOBMFF_MOOV_INVALID', bytes, 'mp4');
    for (const udta of children.filter((box) => box.type === 'udta')) {
      const udtaChildren = boxes(bytes, udta.bodyStart, udta.end);
      if (!udtaChildren) return malformed('METADATA_ISOBMFF_UDTA_INVALID', bytes, 'mp4');
      for (const meta of udtaChildren.filter((box) => box.type === 'meta')) {
        const result = readMp4Meta(bytes, meta, tags);
        if (result) return result;
      }
    }
    for (const meta of children.filter((box) => box.type === 'meta')) {
      const result = readMp4Meta(bytes, meta, tags);
      if (result) return result;
    }
  }
  return tags;
}

function readMp4Meta(
  bytes: Uint8Array,
  meta: Box,
  tags: RawTag[],
): NeutralMetadataReadResult | undefined {
  if (meta.bodyStart + 4 > meta.end) return incomplete('METADATA_MP4_META_INCOMPLETE', bytes, 'mp4');
  const children = boxes(bytes, meta.bodyStart + 4, meta.end);
  if (!children) return malformed('METADATA_MP4_META_CHILD_INVALID', bytes, 'mp4');
  const keys = new Map<number, string>();
  const keysBox = children.find((box) => box.type === 'keys');
  if (keysBox) {
    if (keysBox.bodyStart + 8 > keysBox.end) return incomplete('METADATA_MP4_KEYS_INCOMPLETE', bytes, 'mp4');
    const count = u32(bytes, keysBox.bodyStart + 4);
    let cursor = keysBox.bodyStart + 8;
    for (let index = 1; index <= count; index++) {
      if (cursor + 8 > keysBox.end) return incomplete('METADATA_MP4_KEYS_ENTRY_INCOMPLETE', bytes, 'mp4');
      const size = u32(bytes, cursor);
      if (size < 8 || cursor + size > keysBox.end) return malformed('METADATA_MP4_KEYS_ENTRY_INVALID', bytes, 'mp4');
      keys.set(index, decodeUtf8(bytes.subarray(cursor + 8, cursor + size)));
      cursor += size;
    }
  }
  for (const ilst of children.filter((box) => box.type === 'ilst')) {
    const items = boxes(bytes, ilst.bodyStart, ilst.end);
    if (!items) return malformed('METADATA_MP4_ILST_INVALID', bytes, 'mp4');
    for (const item of items) {
      const numeric = mp4NumericKey(item.type);
      const rawKey = numeric !== undefined ? keys.get(numeric) ?? `mdta:${numeric}` : item.type;
      const dataBoxes = boxes(bytes, item.bodyStart, item.end);
      if (!dataBoxes) return malformed('METADATA_MP4_ILST_ITEM_INVALID', bytes, 'mp4');
      for (const data of dataBoxes.filter((box) => box.type === 'data')) {
        if (data.bodyStart + 8 > data.end) return incomplete('METADATA_MP4_DATA_INCOMPLETE', bytes, 'mp4');
        const dataType = u32(bytes, data.bodyStart) & 0x00ff_ffff;
        const payload = bytes.subarray(data.bodyStart + 8, data.end);
        const value = mp4DataValue(rawKey, payload, dataType);
        if (value !== undefined) tags.push({ rawKey, value, carrierPath: `moov/udta/meta/ilst/${rawKey}/data` });
      }
    }
  }
  return undefined;
}

function readId3Tags(bytes: Uint8Array): RawTag[] | NeutralMetadataReadResult {
  if (bytes.byteLength < 2) return incomplete('METADATA_MP3_HEADER_INCOMPLETE', bytes, 'mp3');
  if (ascii(bytes, 0, 3) !== 'ID3') {
    return looksMp3Frame(bytes, 0) ? [] : malformed('METADATA_MP3_SYNC_INVALID', bytes, 'mp3');
  }
  if (bytes.byteLength < 10) return incomplete('METADATA_ID3_HEADER_INCOMPLETE', bytes, 'mp3');
  const major = bytes[3]!;
  if (major < 2 || major > 4) return { state: 'UNSUPPORTED_STRUCTURE', reasonCode: 'METADATA_ID3_VERSION_UNSUPPORTED', detail: `ID3v2.${major} is unsupported`, carrier: 'mp3', byteLength: bytes.byteLength };
  const payloadLength = synchsafe(bytes, 6);
  if (payloadLength === undefined) return malformed('METADATA_ID3_SIZE_INVALID', bytes, 'mp3');
  const end = 10 + payloadLength;
  if (end > bytes.byteLength) return incomplete('METADATA_ID3_PAYLOAD_INCOMPLETE', bytes, 'mp3');
  let cursor = 10;
  const tags: RawTag[] = [];
  while (cursor < end) {
    const idLength = major === 2 ? 3 : 4;
    const headerLength = major === 2 ? 6 : 10;
    if (cursor + headerLength > end) {
      if (allZero(bytes, cursor, end)) break;
      return incomplete('METADATA_ID3_FRAME_HEADER_INCOMPLETE', bytes, 'mp3');
    }
    const id = ascii(bytes, cursor, idLength);
    if (/^\x00+$/.test(id) || allZero(bytes, cursor, cursor + idLength)) break;
    if (!/^[A-Z0-9]{3,4}$/.test(id)) return malformed('METADATA_ID3_FRAME_ID_INVALID', bytes, 'mp3');
    const size = major === 2
      ? u24(bytes, cursor + 3)
      : major === 4
        ? synchsafe(bytes, cursor + 4)
        : u32(bytes, cursor + 4);
    if (size === undefined || size < 0 || cursor + headerLength + size > end) {
      return incomplete('METADATA_ID3_FRAME_INCOMPLETE', bytes, 'mp3');
    }
    const payload = bytes.subarray(cursor + headerLength, cursor + headerLength + size);
    if (id === 'TXXX' || id === 'TXX') {
      const user = decodeId3UserText(payload);
      if (user) tags.push({ rawKey: `${id}:${user.description}`, value: user.value, carrierPath: `ID3v2.${major}/${id}` });
    } else {
      const value = id === 'COMM' || id === 'COM' ? decodeId3Comment(payload) : id.startsWith('T') ? decodeId3Text(payload) : undefined;
      if (value !== undefined) tags.push({ rawKey: id, value, carrierPath: `ID3v2.${major}/${id}` });
    }
    cursor += headerLength + size;
  }
  return tags;
}

function readFlacTags(bytes: Uint8Array): RawTag[] | NeutralMetadataReadResult {
  if (bytes.byteLength < 4) return incomplete('METADATA_FLAC_HEADER_INCOMPLETE', bytes, 'flac');
  if (ascii(bytes, 0, 4) !== 'fLaC') return malformed('METADATA_FLAC_SIGNATURE_INVALID', bytes, 'flac');
  let cursor = 4;
  let last = false;
  const tags: RawTag[] = [];
  while (!last) {
    if (cursor + 4 > bytes.byteLength) return incomplete('METADATA_FLAC_BLOCK_HEADER_INCOMPLETE', bytes, 'flac');
    last = (bytes[cursor]! & 0x80) !== 0;
    const type = bytes[cursor]! & 0x7f;
    const size = u24(bytes, cursor + 1);
    const body = cursor + 4;
    const end = body + size;
    if (end > bytes.byteLength) return incomplete('METADATA_FLAC_BLOCK_INCOMPLETE', bytes, 'flac');
    if (type === 4) {
      const comments = readVorbisCommentBlock(bytes.subarray(body, end), 0, 'FLAC/VORBIS_COMMENT', 'flac');
      if ('state' in comments) return comments;
      tags.push(...comments);
    }
    cursor = end;
  }
  return tags;
}

function readOggTags(bytes: Uint8Array): RawTag[] | NeutralMetadataReadResult {
  if (bytes.byteLength < 27) return incomplete('METADATA_OGG_HEADER_INCOMPLETE', bytes, 'ogg');
  const packets: Uint8Array[] = [];
  let packetParts: Uint8Array[] = [];
  let packetBytes = 0;
  let cursor = 0;
  while (cursor < bytes.byteLength) {
    if (cursor + 27 > bytes.byteLength) return incomplete('METADATA_OGG_PAGE_HEADER_INCOMPLETE', bytes, 'ogg');
    if (ascii(bytes, cursor, 4) !== 'OggS' || bytes[cursor + 4] !== 0) return malformed('METADATA_OGG_PAGE_INVALID', bytes, 'ogg');
    const segments = bytes[cursor + 26]!;
    if (cursor + 27 + segments > bytes.byteLength) return incomplete('METADATA_OGG_LACING_INCOMPLETE', bytes, 'ogg');
    let dataCursor = cursor + 27 + segments;
    for (let index = 0; index < segments; index++) {
      const size = bytes[cursor + 27 + index]!;
      if (dataCursor + size > bytes.byteLength) return incomplete('METADATA_OGG_PACKET_INCOMPLETE', bytes, 'ogg');
      const part = bytes.subarray(dataCursor, dataCursor + size);
      packetParts.push(part);
      packetBytes += part.byteLength;
      dataCursor += size;
      if (size < 255) {
        const packet = new Uint8Array(packetBytes);
        let offset = 0;
        for (const item of packetParts) {
          packet.set(item, offset);
          offset += item.byteLength;
        }
        packets.push(packet);
        packetParts = [];
        packetBytes = 0;
      }
    }
    cursor = dataCursor;
  }
  if (packetParts.length) return incomplete('METADATA_OGG_PACKET_CONTINUATION_INCOMPLETE', bytes, 'ogg');
  const tags: RawTag[] = [];
  for (const packet of packets) {
    let offset: number | undefined;
    let path = '';
    if (ascii(packet, 0, 8) === 'OpusTags') {
      offset = 8;
      path = 'Ogg/OpusTags';
    } else if (packet[0] === 3 && ascii(packet, 1, 6) === 'vorbis') {
      offset = 7;
      path = 'Ogg/VorbisComment';
    }
    if (offset === undefined) continue;
    const comments = readVorbisCommentBlock(packet, offset, path, 'ogg');
    if ('state' in comments) return comments;
    tags.push(...comments);
  }
  return tags;
}

function readMatroskaTags(bytes: Uint8Array): RawTag[] | NeutralMetadataReadResult {
  if (bytes.byteLength < 4) return incomplete('METADATA_EBML_HEADER_INCOMPLETE', bytes, 'mkv');
  if (bytes[0] !== 0x1a || bytes[1] !== 0x45 || bytes[2] !== 0xdf || bytes[3] !== 0xa3) {
    return malformed('METADATA_EBML_SIGNATURE_INVALID', bytes, 'mkv');
  }
  const roots = ebmlElements(bytes, 0, bytes.byteLength);
  if (!roots) return malformed('METADATA_EBML_ROOT_INVALID', bytes, 'mkv');
  const segment = roots.find((element) => element.id === 0x18538067);
  if (!segment) return incomplete('METADATA_EBML_SEGMENT_MISSING', bytes, 'mkv');
  const segmentChildren = ebmlElements(bytes, segment.bodyStart, segment.end);
  if (!segmentChildren) return malformed('METADATA_EBML_SEGMENT_INVALID', bytes, 'mkv');
  const tags: RawTag[] = [];
  // Segment Info Title is a first-class Matroska metadata carrier (not a SimpleTag). Treat it as the
  // same logical container title while retaining the raw path for representation diagnostics.
  for (const info of segmentChildren.filter((element) => element.id === 0x1549a966)) {
    const children = ebmlElements(bytes, info.bodyStart, info.end);
    if (!children) return malformed('METADATA_MATROSKA_INFO_INVALID', bytes, 'mkv');
    for (const title of children.filter((element) => element.id === 0x7ba9)) {
      tags.push({
        rawKey: 'TITLE',
        value: decodeUtf8(bytes.subarray(title.bodyStart, title.end)),
        scope: 'container',
        carrierPath: 'Matroska/Info/Title',
      });
    }
  }
  for (const tagsElement of segmentChildren.filter((element) => element.id === 0x1254c367)) {
    const tagElements = ebmlElements(bytes, tagsElement.bodyStart, tagsElement.end);
    if (!tagElements) return malformed('METADATA_MATROSKA_TAGS_INVALID', bytes, 'mkv');
    for (const tagElement of tagElements.filter((element) => element.id === 0x7373)) {
      const children = ebmlElements(bytes, tagElement.bodyStart, tagElement.end);
      if (!children) return malformed('METADATA_MATROSKA_TAG_INVALID', bytes, 'mkv');
      const target = matroskaTarget(bytes, children.find((element) => element.id === 0x63c0));
      for (const simple of children.filter((element) => element.id === 0x67c8)) {
        const result = readMatroskaSimpleTag(bytes, simple, target, tags, 'Matroska/Tags/Tag/SimpleTag');
        if (result) return result;
      }
    }
  }
  return tags;
}

function readMatroskaSimpleTag(
  bytes: Uint8Array,
  element: EbmlElement,
  target: Pick<RawTag, 'scope' | 'trackId' | 'chapterId' | 'attachmentId'>,
  tags: RawTag[],
  path: string,
): NeutralMetadataReadResult | undefined {
  const children = ebmlElements(bytes, element.bodyStart, element.end);
  if (!children) return malformed('METADATA_MATROSKA_SIMPLE_TAG_INVALID', bytes, 'mkv');
  const name = children.find((child) => child.id === 0x45a3);
  const value = children.find((child) => child.id === 0x4487);
  const language = children.find((child) => child.id === 0x447a);
  if (name && value) {
    tags.push({
      rawKey: decodeUtf8(bytes.subarray(name.bodyStart, name.end)),
      value: decodeUtf8(bytes.subarray(value.bodyStart, value.end)),
      ...target,
      ...(language ? { language: decodeUtf8(bytes.subarray(language.bodyStart, language.end)) } : {}),
      carrierPath: path,
    });
  }
  for (const nested of children.filter((child) => child.id === 0x67c8)) {
    const result = readMatroskaSimpleTag(bytes, nested, target, tags, `${path}/SimpleTag`);
    if (result) return result;
  }
  return undefined;
}

function readWavTags(bytes: Uint8Array): RawTag[] | NeutralMetadataReadResult {
  if (bytes.byteLength < 12) return incomplete('METADATA_WAV_HEADER_INCOMPLETE', bytes, 'wav');
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WAVE') return malformed('METADATA_WAV_SIGNATURE_INVALID', bytes, 'wav');
  const tags: RawTag[] = [];
  let cursor = 12;
  while (cursor + 8 <= bytes.byteLength) {
    const id = ascii(bytes, cursor, 4);
    const size = u32le(bytes, cursor + 4);
    const body = cursor + 8;
    const end = body + size;
    if (end > bytes.byteLength) return incomplete('METADATA_WAV_CHUNK_INCOMPLETE', bytes, 'wav');
    if (id === 'LIST' && size >= 4 && ascii(bytes, body, 4) === 'INFO') {
      let item = body + 4;
      while (item + 8 <= end) {
        const rawKey = ascii(bytes, item, 4);
        const itemSize = u32le(bytes, item + 4);
        if (item + 8 + itemSize > end) return incomplete('METADATA_WAV_INFO_INCOMPLETE', bytes, 'wav');
        const value = trimNul(decodeUtf8(bytes.subarray(item + 8, item + 8 + itemSize)));
        tags.push({ rawKey, value, carrierPath: `RIFF/LIST/INFO/${rawKey}` });
        item += 8 + itemSize + (itemSize & 1);
      }
    }
    cursor = end + (size & 1);
  }
  return tags;
}

function readAiffTags(bytes: Uint8Array): RawTag[] | NeutralMetadataReadResult {
  if (bytes.byteLength < 12) return incomplete('METADATA_AIFF_HEADER_INCOMPLETE', bytes, 'aiff');
  if (ascii(bytes, 0, 4) !== 'FORM' || !['AIFF', 'AIFC'].includes(ascii(bytes, 8, 4))) {
    return malformed('METADATA_AIFF_SIGNATURE_INVALID', bytes, 'aiff');
  }
  const aliases = new Map([['NAME', 'title'], ['AUTH', 'artist'], ['ANNO', 'comment']]);
  const tags: RawTag[] = [];
  let cursor = 12;
  while (cursor + 8 <= bytes.byteLength) {
    const id = ascii(bytes, cursor, 4);
    const size = u32(bytes, cursor + 4);
    const body = cursor + 8;
    const end = body + size;
    if (end > bytes.byteLength) return incomplete('METADATA_AIFF_CHUNK_INCOMPLETE', bytes, 'aiff');
    if (aliases.has(id)) {
      tags.push({ rawKey: id, value: trimNul(textLatin1.decode(bytes.subarray(body, end))), carrierPath: `FORM/${id}` });
    }
    cursor = end + (size & 1);
  }
  return tags;
}

function readVorbisCommentBlock(
  bytes: Uint8Array,
  start: number,
  carrierPath: string,
  carrier: 'flac' | 'ogg',
): RawTag[] | NeutralMetadataReadResult {
  if (start + 4 > bytes.byteLength) return incomplete('METADATA_VORBIS_VENDOR_INCOMPLETE', bytes, carrier);
  const vendorLength = u32le(bytes, start);
  let cursor = start + 4 + vendorLength;
  if (cursor + 4 > bytes.byteLength) return incomplete('METADATA_VORBIS_COMMENT_COUNT_INCOMPLETE', bytes, carrier);
  const count = u32le(bytes, cursor);
  if (count > 1_000_000) return malformed('METADATA_VORBIS_COMMENT_COUNT_INVALID', bytes, carrier);
  cursor += 4;
  const tags: RawTag[] = [];
  for (let index = 0; index < count; index++) {
    if (cursor + 4 > bytes.byteLength) return incomplete('METADATA_VORBIS_COMMENT_LENGTH_INCOMPLETE', bytes, carrier);
    const size = u32le(bytes, cursor);
    cursor += 4;
    if (cursor + size > bytes.byteLength) return incomplete('METADATA_VORBIS_COMMENT_INCOMPLETE', bytes, carrier);
    const comment = decodeUtf8(bytes.subarray(cursor, cursor + size));
    const equals = comment.indexOf('=');
    if (equals > 0) tags.push({ rawKey: comment.slice(0, equals), value: comment.slice(equals + 1), carrierPath });
    cursor += size;
  }
  return tags;
}

function ok(carrier: MetadataCarrier, byteLength: number, raw: RawTag[]): NeutralMetadataReadResult {
  const scopedTags: ScopedMetadataTag[] = raw.map((tag) => ({
    scope: tag.scope ?? 'container',
    rawKey: tag.rawKey,
    value: tag.value,
    ...(tag.trackId ? { trackId: tag.trackId } : {}),
    ...(tag.chapterId ? { chapterId: tag.chapterId } : {}),
    ...(tag.attachmentId ? { attachmentId: tag.attachmentId } : {}),
    ...(tag.language ? { language: tag.language } : {}),
  }));
  const tags: Record<string, string> = {};
  for (const tag of raw) {
    if (tags[tag.rawKey] === undefined) tags[tag.rawKey] = tag.value;
    else if (tags[tag.rawKey] !== tag.value) tags[`${tag.rawKey}#${Object.keys(tags).length + 1}`] = tag.value;
  }
  const value: NeutralMetadataEvidence = {
    schema: EXTENDED_METADATA_SCHEMA,
    carrier,
    byteLength,
    tags,
    scopedTags,
    parsedTagCount: raw.length,
    carrierPaths: [...new Set(raw.map((tag) => tag.carrierPath))].sort(),
  };
  return { state: 'OK', value };
}

function matroskaTarget(
  bytes: Uint8Array,
  target: EbmlElement | undefined,
): Pick<RawTag, 'scope' | 'trackId' | 'chapterId' | 'attachmentId'> {
  if (!target) return { scope: 'container' };
  const children = ebmlElements(bytes, target.bodyStart, target.end) ?? [];
  const track = children.find((entry) => entry.id === 0x63c5);
  if (track) return { scope: 'track', trackId: String(ebmlUint(bytes, track)) };
  const chapter = children.find((entry) => entry.id === 0x63c4);
  if (chapter) return { scope: 'chapter', chapterId: String(ebmlUint(bytes, chapter)) };
  const attachment = children.find((entry) => entry.id === 0x63c6);
  if (attachment) return { scope: 'attachment', attachmentId: String(ebmlUint(bytes, attachment)) };
  return { scope: 'container' };
}

function mp4DataValue(rawKey: string, payload: Uint8Array, dataType: number): string | undefined {
  if (rawKey === 'trkn' || /track(?:number)?$/i.test(rawKey)) {
    if (payload.byteLength >= 4) {
      const track = (payload[payload.byteLength >= 6 ? 2 : 0]! << 8) | payload[payload.byteLength >= 6 ? 3 : 1]!;
      const total = payload.byteLength >= 6 ? (payload[4]! << 8) | payload[5]! : 0;
      return total > 0 ? `${track}/${total}` : String(track);
    }
  }
  if (dataType === 2) return trimNul(textUtf16Be.decode(payload));
  if (dataType === 1 || dataType === 0) return trimNul(decodeUtf8(payload));
  return undefined;
}

function decodeId3Text(payload: Uint8Array): string | undefined {
  if (payload.byteLength === 0) return '';
  return trimNul(decodeId3String(payload.subarray(1), payload[0]!));
}

function decodeId3Comment(payload: Uint8Array): string | undefined {
  if (payload.byteLength < 4) return undefined;
  const encoding = payload[0]!;
  const content = payload.subarray(4);
  const separator = id3Terminator(content, encoding);
  const valueStart = separator < 0 ? 0 : separator + (encoding === 1 || encoding === 2 ? 2 : 1);
  return trimNul(decodeId3String(content.subarray(valueStart), encoding));
}

function decodeId3UserText(payload: Uint8Array): { description: string; value: string } | undefined {
  if (payload.byteLength < 2) return undefined;
  const encoding = payload[0]!;
  const content = payload.subarray(1);
  const separator = id3Terminator(content, encoding);
  if (separator < 0) return undefined;
  const terminatorBytes = encoding === 1 || encoding === 2 ? 2 : 1;
  return {
    description: trimNul(decodeId3String(content.subarray(0, separator), encoding)),
    value: trimNul(decodeId3String(content.subarray(separator + terminatorBytes), encoding)),
  };
}

function decodeId3String(bytes: Uint8Array, encoding: number): string {
  if (encoding === 0) return textLatin1.decode(bytes);
  if (encoding === 3) return decodeUtf8(bytes);
  if (encoding === 2) return textUtf16Be.decode(bytes);
  if (encoding === 1) {
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return textUtf16Be.decode(bytes.subarray(2));
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return textUtf16Le.decode(bytes.subarray(2));
    return textUtf16Le.decode(bytes);
  }
  return '';
}

function id3Terminator(bytes: Uint8Array, encoding: number): number {
  if (encoding === 1 || encoding === 2) {
    for (let index = 0; index + 1 < bytes.length; index += 2) if (bytes[index] === 0 && bytes[index + 1] === 0) return index;
    return -1;
  }
  return bytes.indexOf(0);
}

function boxes(bytes: Uint8Array, start: number, end: number): Box[] | undefined {
  const out: Box[] = [];
  let cursor = start;
  while (cursor < end) {
    if (cursor + 8 > end) return allZero(bytes, cursor, end) ? out : undefined;
    let size = u32(bytes, cursor);
    const type = fourcc(bytes, cursor + 4);
    let header = 8;
    if (size === 1) {
      if (cursor + 16 > end) return undefined;
      size = u64(bytes, cursor + 8);
      header = 16;
    } else if (size === 0) size = end - cursor;
    if (!Number.isSafeInteger(size) || size < header || cursor + size > end) return undefined;
    out.push({ type, start: cursor, bodyStart: cursor + header, end: cursor + size });
    cursor += size;
  }
  return out;
}

function ebmlElements(bytes: Uint8Array, start: number, end: number): EbmlElement[] | undefined {
  const out: EbmlElement[] = [];
  let cursor = start;
  while (cursor < end) {
    const id = ebmlVint(bytes, cursor, true);
    if (!id) return undefined;
    const size = ebmlVint(bytes, id.next, false);
    if (!size) return undefined;
    const bodyStart = size.next;
    const bodyEnd = size.unknown ? end : bodyStart + size.value;
    if (!Number.isSafeInteger(bodyEnd) || bodyEnd < bodyStart || bodyEnd > end) return undefined;
    out.push({ id: id.value, start: cursor, bodyStart, end: bodyEnd });
    if (bodyEnd <= cursor) return undefined;
    cursor = bodyEnd;
  }
  return out;
}

function ebmlVint(
  bytes: Uint8Array,
  offset: number,
  keepMarker: boolean,
): { value: number; next: number; unknown: boolean } | undefined {
  const first = bytes[offset];
  if (first === undefined || first === 0) return undefined;
  let mask = 0x80;
  let length = 1;
  while (length <= 8 && (first & mask) === 0) {
    mask >>= 1;
    length++;
  }
  if (length > 8 || offset + length > bytes.length) return undefined;
  let value = keepMarker ? first : first & (mask - 1);
  for (let index = 1; index < length; index++) value = value * 256 + bytes[offset + index]!;
  const unknown = !keepMarker && value === 2 ** (7 * length) - 1;
  return { value, next: offset + length, unknown };
}

function ebmlUint(bytes: Uint8Array, element: EbmlElement): number {
  let value = 0;
  for (let cursor = element.bodyStart; cursor < element.end; cursor++) value = value * 256 + bytes[cursor]!;
  return value;
}

function detectCarrier(bytes: Uint8Array): MetadataCarrier | undefined {
  if (bytes.byteLength >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE') return 'wav';
  if (bytes.byteLength >= 12 && ascii(bytes, 0, 4) === 'FORM' && ['AIFF', 'AIFC'].includes(ascii(bytes, 8, 4))) return 'aiff';
  if (bytes.byteLength >= 4 && ascii(bytes, 0, 4) === 'fLaC') return 'flac';
  if (bytes.byteLength >= 4 && ascii(bytes, 0, 4) === 'OggS') return 'ogg';
  if (bytes.byteLength >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'mkv';
  if (bytes.byteLength >= 8 && ['ftyp', 'moov', 'mdat', 'free', 'wide'].includes(ascii(bytes, 4, 4))) return 'mp4';
  if (ascii(bytes, 0, 3) === 'ID3' || looksMp3Frame(bytes, 0)) return 'mp3';
  return undefined;
}

function normalizeCarrier(value: string | undefined): MetadataCarrier | undefined {
  const token = value?.trim().toLowerCase();
  if (token === 'matroska') return 'mkv';
  if (token === 'm4a' || token === 'm4v' || token === 'isobmff') return 'mp4';
  return ['mp4', 'mov', 'mkv', 'webm', 'mp3', 'flac', 'ogg', 'wav', 'aiff'].includes(token ?? '')
    ? token as MetadataCarrier
    : undefined;
}

function looksMp3Frame(bytes: Uint8Array, offset: number): boolean {
  return bytes.byteLength >= offset + 2 && bytes[offset] === 0xff && (bytes[offset + 1]! & 0xe0) === 0xe0 && (bytes[offset + 1]! & 0x06) !== 0;
}

function fourcc(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset] ?? 0, bytes[offset + 1] ?? 0, bytes[offset + 2] ?? 0, bytes[offset + 3] ?? 0);
}

function mp4NumericKey(value: string): number | undefined {
  const codes = [...value].map((char) => char.charCodeAt(0));
  if (codes.length !== 4) return undefined;
  const number = ((codes[0]! << 24) >>> 0) + (codes[1]! << 16) + (codes[2]! << 8) + codes[3]!;
  // Keyed-metadata ilst entries encode the one-based key index as a binary uint32 (normally
  // 00 00 00 nn). High-bit legacy fourccs such as ©nam are ordinary iTunes keys, not indices.
  return codes[0] === 0 && codes[1] === 0 && codes[2] === 0 && codes[3]! > 0 ? number : undefined;
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return textUtf8Fatal.decode(bytes);
  } catch {
    return textUtf8.decode(bytes);
  }
}

function trimNul(value: string): string {
  return value.replace(/\0+$/g, '');
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + length)));
}

function u24(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 16) | (bytes[offset + 1]! << 8) | bytes[offset + 2]!;
}

function u32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! * 0x1_000000) + (bytes[offset + 1]! << 16) + (bytes[offset + 2]! << 8) + bytes[offset + 3]!) >>> 0;
}

function u32le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! + bytes[offset + 1]! * 0x100 + bytes[offset + 2]! * 0x1_0000 + bytes[offset + 3]! * 0x1_000000) >>> 0;
}

function u64(bytes: Uint8Array, offset: number): number {
  return u32(bytes, offset) * 0x1_0000_0000 + u32(bytes, offset + 4);
}

function synchsafe(bytes: Uint8Array, offset: number): number | undefined {
  const values = [bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]];
  if (values.some((value) => value === undefined || ((value as number) & 0x80) !== 0)) return undefined;
  return (values[0]! << 21) | (values[1]! << 14) | (values[2]! << 7) | values[3]!;
}

function allZero(bytes: Uint8Array, start: number, end: number): boolean {
  for (let cursor = start; cursor < end; cursor++) if (bytes[cursor] !== 0) return false;
  return true;
}

function problem(
  state: Exclude<NeutralMetadataReadResult['state'], 'OK'>,
  reasonCode: string,
  detail: string,
  bytes: Uint8Array,
  carrier?: string,
): NeutralMetadataReadResult {
  return { state, reasonCode, detail, byteLength: bytes?.byteLength ?? 0, ...(carrier ? { carrier } : {}) };
}

function incomplete(reasonCode: string, bytes: Uint8Array, carrier: string): NeutralMetadataReadResult {
  return problem('INCOMPLETE', reasonCode, `metadata carrier '${carrier}' is truncated`, bytes, carrier);
}

function malformed(reasonCode: string, bytes: Uint8Array, carrier: string): NeutralMetadataReadResult {
  return problem('MALFORMED', reasonCode, `metadata carrier '${carrier}' is malformed`, bytes, carrier);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
