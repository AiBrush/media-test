import { muxVerdict, type MuxDecision } from './types.ts';

export const MUX_SPARSE_FIXTURE_SCHEMA = 'media-test/mux-sparse-mp4@1' as const;
export const MUX_LARGE_FILE_CONTRACT_SCHEMA = 'media-test/mux-large-file-contract@1' as const;
export const MUX_SPARSE_TARGET_SCHEMA = 'media-test/mux-sparse-target@1' as const;
export const UINT32_ADDRESS_LIMIT = 0xffff_ffffn;
export const MUX_SPARSE_CO64_ACCEPTANCE_CASE = Object.freeze({
  id: 'mux/size_sparse_gt4gib_co64',
  resourceGate: 'long',
  fixtureDescriptor: 'fixtures/golden/mux_sparse_gt4gib.layout.json',
  virtualFileKind: 'sparse-generated-mp4',
  contract: defineMuxLargeFileContract({
    schema: MUX_SPARSE_FIXTURE_SCHEMA,
    fileSize: '4294975488',
    sampleOffsets: ['4096', '4294967552'],
    samplePrefixesHex: ['00000165a1b2c3d4', '00000141d4c3b2a1'],
  }),
} as const);

export interface SparseByteSource {
  readonly size: bigint;
  read(offset: bigint, length: number): Uint8Array;
}

export interface SparseMp4FixtureDescriptor {
  readonly schema: typeof MUX_SPARSE_FIXTURE_SCHEMA;
  readonly fileSize: string;
  readonly sampleOffsets: readonly string[];
  readonly samplePrefixesHex: readonly string[];
}

/** JSON-safe scenario contract. Big offsets remain decimal strings across registry/Worker cloning. */
export interface MuxLargeFileAddressingContract {
  readonly schema: typeof MUX_LARGE_FILE_CONTRACT_SCHEMA;
  readonly resourceGate: 'long';
  readonly virtualFileKind: 'sparse-generated-mp4';
  readonly minimumFileSize: string;
  readonly maximumMetadataBytes: number;
  readonly expectedSamples: readonly Readonly<{ offset: string; prefixHex: string }>[];
}

/** Runtime-only sparse target injected by the runner into MuxOptions for a declaring adapter. */
export interface SparseMuxTargetWriter {
  readonly schema: typeof MUX_SPARSE_TARGET_SCHEMA;
  setSize(size: string | bigint): void;
  write(position: string | bigint, bytes: Uint8Array): void;
}

export interface LargeFileAddressingEvidence {
  readonly schema: 'media-test/mux-large-file-evidence@1';
  readonly fileSize: bigint;
  readonly topLevelBoxes: readonly Readonly<{ type: string; start: bigint; end: bigint; largeSize: boolean }>[];
  readonly stcoOffsets: readonly bigint[];
  readonly co64Offsets: readonly bigint[];
  readonly offsetsBelowUint32: number;
  readonly offsetsAboveUint32: number;
  readonly samplePrefixesVerified: number;
}

export interface LargeFileAddressingAssessment {
  readonly decision: MuxDecision;
  readonly evidence?: LargeFileAddressingEvidence;
}

export interface LargeFileAddressingContract {
  readonly requireBeyondUint32: boolean;
  readonly expectedSamplePrefixes?: ReadonlyMap<bigint, Uint8Array>;
  readonly maximumMetadataBytes?: number;
}

export function defineMuxLargeFileContract(
  descriptor: SparseMp4FixtureDescriptor,
): MuxLargeFileAddressingContract {
  if (descriptor.schema !== MUX_SPARSE_FIXTURE_SCHEMA ||
      descriptor.sampleOffsets.length !== descriptor.samplePrefixesHex.length ||
      descriptor.sampleOffsets.length < 2) {
    throw new TypeError('sparse mux fixture descriptor is invalid');
  }
  const fileSize = decimalBigInt(descriptor.fileSize, 'fileSize');
  const samples = descriptor.sampleOffsets.map((offset, index) => ({
    offset: decimalBigInt(offset, 'sampleOffset').toString(),
    prefixHex: bytesHex(hexBytes(descriptor.samplePrefixesHex[index]!)),
  }));
  if (fileSize <= UINT32_ADDRESS_LIMIT ||
      !samples.some((sample) => BigInt(sample.offset) <= UINT32_ADDRESS_LIMIT) ||
      !samples.some((sample) => BigInt(sample.offset) > UINT32_ADDRESS_LIMIT)) {
    throw new TypeError('sparse mux contract must address samples on both sides of 0xffffffff');
  }
  return deepFreeze({
    schema: MUX_LARGE_FILE_CONTRACT_SCHEMA,
    resourceGate: 'long' as const,
    virtualFileKind: 'sparse-generated-mp4' as const,
    minimumFileSize: fileSize.toString(),
    maximumMetadataBytes: 1024 * 1024,
    expectedSamples: samples,
  });
}

/** Read only the exact nested contract; malformed declarations never silently weaken the gate. */
export function muxLargeFileContractFromOptions(
  options: unknown,
): MuxLargeFileAddressingContract | undefined {
  if (!isRecord(options) || !isRecord(options.robustness) ||
      !isRecord(options.robustness.muxLargeFile)) return undefined;
  const value = options.robustness.muxLargeFile;
  if (value.schema !== MUX_LARGE_FILE_CONTRACT_SCHEMA || value.resourceGate !== 'long' ||
      value.virtualFileKind !== 'sparse-generated-mp4' ||
      typeof value.minimumFileSize !== 'string' ||
      !Number.isSafeInteger(value.maximumMetadataBytes) || Number(value.maximumMetadataBytes) <= 0 ||
      !Array.isArray(value.expectedSamples) || value.expectedSamples.length < 2) return undefined;
  try {
    const fileSize = decimalBigInt(value.minimumFileSize, 'minimumFileSize');
    const samples = value.expectedSamples.map((entry, index) => {
      if (!isRecord(entry) || typeof entry.offset !== 'string' || typeof entry.prefixHex !== 'string') {
        throw new TypeError(`expectedSamples[${index}] is invalid`);
      }
      return { offset: decimalBigInt(entry.offset, 'sampleOffset'), prefix: hexBytes(entry.prefixHex) };
    });
    if (fileSize <= UINT32_ADDRESS_LIMIT ||
        !samples.some((sample) => sample.offset <= UINT32_ADDRESS_LIMIT) ||
        !samples.some((sample) => sample.offset > UINT32_ADDRESS_LIMIT)) return undefined;
  } catch {
    return undefined;
  }
  return value as unknown as MuxLargeFileAddressingContract;
}

/** Sparse target implementation used at the real mux boundary; holes never allocate. */
export class SparseMuxTarget implements SparseMuxTargetWriter {
  readonly schema = MUX_SPARSE_TARGET_SCHEMA;
  private fileSize: bigint | undefined;
  private readonly segments: Array<{ offset: bigint; bytes: Uint8Array }> = [];

  setSize(size: string | bigint): void {
    const parsed = typeof size === 'bigint' ? size : decimalBigInt(size, 'sparse target size');
    if (parsed <= 0n) throw new RangeError('sparse target size must be positive');
    if (this.segments.some((segment) => segment.offset + BigInt(segment.bytes.byteLength) > parsed)) {
      throw new RangeError('sparse target size would truncate an authored segment');
    }
    this.fileSize = parsed;
  }

  write(position: string | bigint, bytes: Uint8Array): void {
    const offset = typeof position === 'bigint' ? position : decimalBigInt(position, 'sparse write position');
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
      throw new TypeError('sparse target writes must contain bytes');
    }
    if (offset < 0n || (this.fileSize !== undefined && offset + BigInt(bytes.byteLength) > this.fileSize)) {
      throw new RangeError('sparse target write lies outside its declared extent');
    }
    this.segments.push({ offset, bytes: bytes.slice() });
  }

  source(): SparseByteSource {
    if (this.fileSize === undefined) throw new TypeError('sparse mux target did not declare a final size');
    if (this.segments.length === 0) throw new TypeError('sparse mux target contains no authored segments');
    return new SegmentedSparseByteSource(this.fileSize, this.segments);
  }
}

export function createSparseMuxTarget(): SparseMuxTarget {
  return new SparseMuxTarget();
}

export function isSparseMuxTargetWriter(value: unknown): value is SparseMuxTargetWriter {
  return isRecord(value) && value.schema === MUX_SPARSE_TARGET_SCHEMA &&
    typeof value.setSize === 'function' && typeof value.write === 'function';
}

/** Validate the exact sparse artifact a candidate authored through the runner-injected target. */
export function assessSparseMuxTarget(
  target: SparseMuxTarget,
  contract: MuxLargeFileAddressingContract,
): LargeFileAddressingAssessment {
  try {
    const source = target.source();
    const minimumFileSize = decimalBigInt(contract.minimumFileSize, 'minimumFileSize');
    if (source.size < minimumFileSize) {
      return {
        decision: muxVerdict(
          'FAIL',
          'MUX_LARGE_FILE_EXTENT_TOO_SMALL',
          `candidate extent ${source.size} is below required ${minimumFileSize}`,
        ),
      };
    }
    const expectedSamplePrefixes = new Map<bigint, Uint8Array>(
      contract.expectedSamples.map((sample) => [
        decimalBigInt(sample.offset, 'sampleOffset'),
        hexBytes(sample.prefixHex),
      ]),
    );
    return assessLargeFileAddressing(source, {
      requireBeyondUint32: true,
      expectedSamplePrefixes,
      maximumMetadataBytes: contract.maximumMetadataBytes,
    });
  } catch (error) {
    return {
      decision: muxVerdict(
        'FAIL',
        'MUX_SPARSE_TARGET_INCOMPLETE',
        error instanceof Error ? error.message : String(error),
      ),
    };
  }
}

/**
 * Inspect a virtual/sparse MP4 without allocating or Number-coercing its >4 GiB address space.
 * Both 64-bit box sizes and co64 table entries remain bigint until bounded metadata reads occur.
 */
export function assessLargeFileAddressing(
  source: SparseByteSource,
  contract: LargeFileAddressingContract = { requireBeyondUint32: true },
): LargeFileAddressingAssessment {
  const maximumMetadataBytes = contract.maximumMetadataBytes ?? 16 * 1024 * 1024;
  if (source.size <= 0n || !Number.isSafeInteger(maximumMetadataBytes) || maximumMetadataBytes <= 0) {
    return { decision: muxVerdict('FAIL', 'MUX_SPARSE_SOURCE_INVALID', 'sparse source size/metadata bound is invalid') };
  }
  try {
    const topLevelBoxes = readTopLevelBoxes(source);
    const moov = topLevelBoxes.find((box) => box.type === 'moov');
    const mdats = topLevelBoxes.filter((box) => box.type === 'mdat');
    if (!moov || mdats.length === 0) {
      return { decision: muxVerdict('FAIL', 'MUX_LARGE_MP4_MOVIE_MEDIA_MISSING', 'sparse MP4 requires moov and mdat') };
    }
    const moovLength = moov.end - moov.bodyStart;
    if (moovLength > BigInt(maximumMetadataBytes) || moovLength > BigInt(Number.MAX_SAFE_INTEGER)) {
      return { decision: muxVerdict('FAIL', 'MUX_LARGE_MP4_METADATA_UNBOUNDED', `moov payload ${moovLength} exceeds parser bound`) };
    }
    const moovBytes = source.read(moov.bodyStart, Number(moovLength));
    if (moovBytes.byteLength !== Number(moovLength)) throw new SparseReadError('MUX_SPARSE_READ_INCOMPLETE', 'moov read is incomplete');
    const offsets = readChunkOffsetTables(moovBytes);
    if (offsets.stco.length + offsets.co64.length === 0) {
      return { decision: muxVerdict('FAIL', 'MUX_MP4_CHUNK_OFFSETS_MISSING', 'moov contains neither stco nor co64') };
    }
    const all = [...offsets.stco, ...offsets.co64];
    for (const offset of all) {
      if (offset < 0n || offset >= source.size) {
        return { decision: muxVerdict('FAIL', 'MUX_CHUNK_OFFSET_OUT_OF_RANGE', `chunk offset ${offset} is outside file size ${source.size}`) };
      }
      if (!mdats.some((mdat) => offset >= mdat.bodyStart && offset < mdat.end)) {
        return { decision: muxVerdict('FAIL', 'MUX_CHUNK_OFFSET_OUTSIDE_MEDIA', `chunk offset ${offset} does not address mdat payload`) };
      }
    }
    const above = all.filter((offset) => offset > UINT32_ADDRESS_LIMIT);
    const below = all.filter((offset) => offset <= UINT32_ADDRESS_LIMIT);
    if (contract.requireBeyondUint32 && above.length === 0) {
      return { decision: muxVerdict('FAIL', 'MUX_CO64_BOUNDARY_NOT_EXERCISED', 'no media offset crosses 0xffffffff') };
    }
    if (offsets.stco.some((offset) => offset > UINT32_ADDRESS_LIMIT)) {
      return { decision: muxVerdict('FAIL', 'MUX_STCO_OFFSET_TRUNCATED', '32-bit stco carried an out-of-range offset') };
    }
    if (above.length > 0 && offsets.co64.length === 0) {
      return { decision: muxVerdict('FAIL', 'MUX_CO64_REQUIRED', 'media beyond 0xffffffff was not addressed through co64') };
    }

    let verified = 0;
    for (const [offset, prefix] of contract.expectedSamplePrefixes ?? []) {
      if (!all.includes(offset)) {
        return { decision: muxVerdict('FAIL', 'MUX_EXPECTED_SAMPLE_OFFSET_MISSING', `expected sample offset ${offset} is absent`) };
      }
      const got = source.read(offset, prefix.byteLength);
      if (!bytesEqual(got, prefix)) {
        return { decision: muxVerdict('FAIL', 'MUX_SAMPLE_ADDRESS_READBACK_MISMATCH', `sample readback failed at ${offset}`) };
      }
      verified++;
    }
    const evidence: LargeFileAddressingEvidence = Object.freeze({
      schema: 'media-test/mux-large-file-evidence@1' as const,
      fileSize: source.size,
      topLevelBoxes: Object.freeze(topLevelBoxes.map((box) => Object.freeze({
        type: box.type, start: box.start, end: box.end, largeSize: box.largeSize,
      }))),
      stcoOffsets: Object.freeze(offsets.stco),
      co64Offsets: Object.freeze(offsets.co64),
      offsetsBelowUint32: below.length,
      offsetsAboveUint32: above.length,
      samplePrefixesVerified: verified,
    });
    return {
      decision: muxVerdict(
        'PASS',
        'MUX_CO64_LARGE_FILE_ADDRESSING_VALID',
        `${all.length} offset(s), ${above.length} beyond 0xffffffff, ${verified} sample readback(s), no wrap/truncation`,
        {
          offsets: all.length,
          offsetsBelowUint32: below.length,
          offsetsAboveUint32: above.length,
          samplePrefixesVerified: verified,
          largeSizeBoxes: topLevelBoxes.filter((box) => box.largeSize).length,
        },
      ),
      evidence,
    };
  } catch (error) {
    const reasonCode = error instanceof SparseReadError ? error.reasonCode : 'MUX_LARGE_FILE_READER_ERROR';
    const detail = error instanceof Error ? error.message : String(error);
    return { decision: muxVerdict('FAIL', reasonCode, detail) };
  }
}

/** Deterministic >4 GiB acceptance fixture backed only by its authored non-zero segments. */
export function createSparseCo64AcceptanceFixture(descriptor: SparseMp4FixtureDescriptor): {
  source: SparseByteSource;
  expectedSamplePrefixes: ReadonlyMap<bigint, Uint8Array>;
} {
  if (descriptor.schema !== MUX_SPARSE_FIXTURE_SCHEMA ||
      descriptor.sampleOffsets.length !== descriptor.samplePrefixesHex.length ||
      descriptor.sampleOffsets.length < 2) {
    throw new TypeError('sparse mux fixture descriptor is invalid');
  }
  const fileSize = decimalBigInt(descriptor.fileSize, 'fileSize');
  const offsets = descriptor.sampleOffsets.map((value) => decimalBigInt(value, 'sampleOffset'));
  const prefixes = descriptor.samplePrefixesHex.map(hexBytes);
  if (fileSize <= UINT32_ADDRESS_LIMIT || !offsets.some((offset) => offset <= UINT32_ADDRESS_LIMIT) ||
      !offsets.some((offset) => offset > UINT32_ADDRESS_LIMIT)) {
    throw new TypeError('sparse mux fixture must address samples on both sides of 0xffffffff');
  }
  const co64 = fullBox('co64', concat([u32(offsets.length), ...offsets.map(u64)]));
  const stbl = box('stbl', co64);
  const minf = box('minf', stbl);
  const mdia = box('mdia', minf);
  const trak = box('trak', mdia);
  const moov = box('moov', trak);
  const ftyp = box('ftyp', asciiBytes('isom\0\0\0\0isomiso6'));
  const mdatStart = BigInt(ftyp.byteLength + moov.byteLength);
  const mdatSize = fileSize - mdatStart;
  if (mdatSize <= 16n || offsets.some((offset) => offset < mdatStart + 16n || offset >= fileSize)) {
    throw new TypeError('sparse fixture sample offsets are outside its mdat payload');
  }
  const mdatHeader = concat([u32(1), asciiBytes('mdat'), u64(mdatSize)]);
  const prefix = concat([ftyp, moov, mdatHeader]);
  const segments: Array<{ offset: bigint; bytes: Uint8Array }> = [{ offset: 0n, bytes: prefix }];
  const expectedSamplePrefixes = new Map<bigint, Uint8Array>();
  for (let index = 0; index < offsets.length; index++) {
    segments.push({ offset: offsets[index]!, bytes: prefixes[index]! });
    expectedSamplePrefixes.set(offsets[index]!, prefixes[index]!);
  }
  return {
    source: new SegmentedSparseByteSource(fileSize, segments),
    expectedSamplePrefixes,
  };
}

export class SegmentedSparseByteSource implements SparseByteSource {
  readonly size: bigint;
  private readonly segments: readonly Readonly<{ offset: bigint; bytes: Uint8Array }>[];

  constructor(size: bigint, segments: readonly Readonly<{ offset: bigint; bytes: Uint8Array }>[]) {
    if (size <= 0n) throw new TypeError('sparse byte source size must be positive');
    for (const segment of segments) {
      if (segment.offset < 0n || segment.offset + BigInt(segment.bytes.byteLength) > size) {
        throw new RangeError('sparse segment lies outside source extent');
      }
    }
    this.size = size;
    this.segments = Object.freeze(segments.map((segment) => Object.freeze({
      offset: segment.offset, bytes: segment.bytes.slice(),
    })));
  }

  read(offset: bigint, length: number): Uint8Array {
    if (offset < 0n || !Number.isSafeInteger(length) || length < 0 || offset + BigInt(length) > this.size) {
      throw new RangeError(`sparse read ${offset}+${length} is outside ${this.size}`);
    }
    const out = new Uint8Array(length);
    const end = offset + BigInt(length);
    for (const segment of this.segments) {
      const segmentEnd = segment.offset + BigInt(segment.bytes.byteLength);
      const overlapStart = segment.offset > offset ? segment.offset : offset;
      const overlapEnd = segmentEnd < end ? segmentEnd : end;
      if (overlapStart >= overlapEnd) continue;
      const sourceStart = Number(overlapStart - segment.offset);
      const targetStart = Number(overlapStart - offset);
      const count = Number(overlapEnd - overlapStart);
      out.set(segment.bytes.subarray(sourceStart, sourceStart + count), targetStart);
    }
    return out;
  }
}

interface SparseBox {
  type: string;
  start: bigint;
  bodyStart: bigint;
  end: bigint;
  largeSize: boolean;
}

function readTopLevelBoxes(source: SparseByteSource): SparseBox[] {
  const boxes: SparseBox[] = [];
  let offset = 0n;
  while (offset < source.size) {
    const first = source.read(offset, Number(source.size - offset < 16n ? source.size - offset : 16n));
    if (first.byteLength < 8) throw new SparseReadError('MUX_MP4_BOX_HEADER_INCOMPLETE', `box header truncated at ${offset}`);
    const size32 = readU32(first, 0);
    const type = ascii(first, 4, 4);
    if (!/^[A-Za-z0-9 ]{4}$/.test(type)) throw new SparseReadError('MUX_MP4_BOX_TYPE_INVALID', `invalid box type at ${offset}`);
    const largeSize = size32 === 1;
    const header = largeSize ? 16n : 8n;
    let size = size32 === 0 ? source.size - offset : BigInt(size32);
    if (largeSize) {
      if (first.byteLength < 16) throw new SparseReadError('MUX_MP4_LARGE_SIZE_INCOMPLETE', `large size missing at ${offset}`);
      size = readU64(first, 8);
    }
    if (size < header || offset + size > source.size) {
      throw new SparseReadError('MUX_MP4_BOX_SIZE_INVALID', `${type} size ${size} at ${offset} exceeds ${source.size}`);
    }
    boxes.push({ type, start: offset, bodyStart: offset + header, end: offset + size, largeSize });
    offset += size;
  }
  return boxes;
}

function readChunkOffsetTables(bytes: Uint8Array): { stco: bigint[]; co64: bigint[] } {
  const stco: bigint[] = [];
  const co64: bigint[] = [];
  const containers = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl']);
  const visit = (start: number, end: number): void => {
    let offset = start;
    while (offset < end) {
      if (offset + 8 > end) throw new SparseReadError('MUX_MP4_METADATA_BOX_INCOMPLETE', `metadata box truncated at ${offset}`);
      const size = readU32(bytes, offset);
      const type = ascii(bytes, offset + 4, 4);
      if (size < 8 || offset + size > end) throw new SparseReadError('MUX_MP4_METADATA_BOX_SIZE_INVALID', `${type} size invalid at ${offset}`);
      if (type === 'stco' || type === 'co64') {
        if (offset + 16 > offset + size) throw new SparseReadError('MUX_MP4_OFFSET_TABLE_INCOMPLETE', `${type} header incomplete`);
        const count = readU32(bytes, offset + 12);
        const width = type === 'co64' ? 8 : 4;
        if (count > 10_000_000 || offset + 16 + count * width !== offset + size) {
          throw new SparseReadError('MUX_MP4_OFFSET_TABLE_SIZE_INVALID', `${type} count/size mismatch`);
        }
        for (let index = 0; index < count; index++) {
          const at = offset + 16 + index * width;
          (type === 'co64' ? co64 : stco).push(type === 'co64' ? readU64(bytes, at) : BigInt(readU32(bytes, at)));
        }
      } else if (containers.has(type)) {
        visit(offset + 8, offset + size);
      }
      offset += size;
    }
  };
  visit(0, bytes.byteLength);
  return { stco, co64 };
}

class SparseReadError extends Error {
  constructor(readonly reasonCode: string, message: string) {
    super(message);
    this.name = 'SparseReadError';
  }
}

function box(type: string, payload: Uint8Array): Uint8Array {
  return concat([u32(8 + payload.byteLength), asciiBytes(type), payload]);
}

function fullBox(type: string, payload: Uint8Array): Uint8Array {
  return box(type, concat([u32(0), payload]));
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.byteLength; }
  return out;
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value);
  return out;
}

function u64(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, value);
  return out;
}

function readU32(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.byteLength) throw new SparseReadError('MUX_SPARSE_READ_INCOMPLETE', 'u32 read is incomplete');
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
}

function readU64(bytes: Uint8Array, offset: number): bigint {
  if (offset + 8 > bytes.byteLength) throw new SparseReadError('MUX_SPARSE_READ_INCOMPLETE', 'u64 read is incomplete');
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getBigUint64(0);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = '';
  for (let index = 0; index < length; index++) out += String.fromCharCode(bytes[offset + index] ?? 0);
  return out;
}

function asciiBytes(value: string): Uint8Array {
  return Uint8Array.from(value, (char) => char.charCodeAt(0));
}

function decimalBigInt(value: string, label: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new TypeError(`${label} must be an unsigned decimal bigint`);
  return BigInt(value);
}

function hexBytes(value: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value)) throw new TypeError('sample prefix must be non-empty even-length hex');
  return Uint8Array.from(value.match(/../g)!, (byte) => Number.parseInt(byte, 16));
}

function bytesHex(value: Uint8Array): string {
  return [...value].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze<T extends object>(value: T): T {
  Object.freeze(value);
  for (const item of Object.values(value)) {
    if (item && typeof item === 'object' && !Object.isFrozen(item)) deepFreeze(item);
  }
  return value;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.byteLength === b.byteLength && a.every((value, index) => value === b[index]);
}
