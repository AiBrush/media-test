import { streamingUnavailable, streamingVerdict, type StreamingDecision } from './types.ts';

const EBML_ID = 0x1a45dfa3;
const SEGMENT_ID = 0x18538067;
const SEEK_HEAD_ID = 0x114d9b74;
const INFO_ID = 0x1549a966;
const TRACKS_ID = 0x1654ae6b;
const CLUSTER_ID = 0x1f43b675;
const CUES_ID = 0x1c53bb6b;
const TIMECODE_ID = 0xe7;
const DURATION_ID = 0x4489;
const VOID_ID = 0xec;
const CRC32_ID = 0xbf;
const SEGMENT_CHILD_IDS = new Set([
  SEEK_HEAD_ID,
  INFO_ID,
  TRACKS_ID,
  CLUSTER_ID,
  CUES_ID,
  0x1941a469, // Attachments
  0x1043a770, // Chapters
  0x1254c367, // Tags
]);

interface EbmlElementHeader {
  id: number;
  headerBytes: number;
  size: number;
  unknownSize: boolean;
}

export interface LiveWebmEvidence {
  readonly state: 'OK';
  readonly clusterCount: number;
  readonly clusterTimecodes: readonly number[];
  readonly initializationBytes: number;
  readonly totalBytes: number;
  readonly maximumBufferedBytes: number;
  readonly incrementallyConsumed: true;
}

export type LiveWebmReadResult =
  | LiveWebmEvidence
  | {
      readonly state: 'UNSUPPORTED' | 'MALFORMED';
      readonly reasonCode: string;
      readonly detail: string;
      readonly offset?: number;
    };

export interface IncrementalWebmConsumer {
  onInitialization?(bytes: Uint8Array): void | Promise<void>;
  onCluster?(bytes: Uint8Array, index: number, timecode: number): void | Promise<void>;
}

export interface IncrementalLiveWebmOptions {
  readonly maximumElementBytes?: number;
  readonly consumer?: IncrementalWebmConsumer;
}

class WebmMalformed extends Error {
  constructor(readonly reasonCode: string, message: string, readonly offset?: number) {
    super(message);
    this.name = 'WebmMalformed';
  }
}

/**
 * Dependency-free incremental continuous-WebM parser. It awaits each Cluster consumer before
 * accepting the next, making broken backpressure/cluster delivery observable without MSE.
 */
export class IncrementalLiveWebmParser {
  private readonly maximumElementBytes: number;
  private readonly consumer: IncrementalWebmConsumer;
  private pending: Uint8Array = new Uint8Array(0);
  private phase: 'EBML' | 'SEGMENT' | 'CHILDREN' | 'DONE' = 'EBML';
  private absoluteOffset = 0;
  private totalBytes = 0;
  private maximumBufferedBytes = 0;
  private initializationParts: Uint8Array[] = [];
  private initializationBytes = 0;
  private initializationEmitted = false;
  private tracksSeen = false;
  private clusterTimecodes: number[] = [];

  constructor(options: IncrementalLiveWebmOptions = {}) {
    this.maximumElementBytes = positiveInteger(options.maximumElementBytes ?? 16 * 1024 * 1024, 'maximumElementBytes');
    this.consumer = options.consumer ?? {};
  }

  async feed(chunk: Uint8Array): Promise<void> {
    if (this.phase === 'DONE') throw new Error('incremental WebM parser is already finished');
    if (!(chunk instanceof Uint8Array) || chunk.byteLength === 0) return;
    this.totalBytes += chunk.byteLength;
    this.pending = append(this.pending, chunk);
    this.maximumBufferedBytes = Math.max(this.maximumBufferedBytes, this.pending.byteLength);
    if (this.pending.byteLength > this.maximumElementBytes) {
      throw fault(
        'WEBM_INCREMENTAL_ELEMENT_BOUND_EXCEEDED',
        `pending element exceeds ${this.maximumElementBytes} bytes`,
        this.absoluteOffset,
      );
    }
    await this.drain(false);
  }

  async finish(): Promise<LiveWebmEvidence> {
    await this.drain(true);
    if (this.phase === 'EBML') throw fault('WEBM_EBML_HEADER_MISSING', 'stream has no complete EBML header');
    if (this.phase === 'SEGMENT') throw fault('WEBM_SEGMENT_MISSING', 'stream has no continuous Segment');
    if (this.pending.byteLength !== 0) {
      throw fault('WEBM_INCREMENTAL_ELEMENT_INCOMPLETE', `${this.pending.byteLength} trailing byte(s) form an incomplete element`, this.absoluteOffset);
    }
    if (!this.tracksSeen) throw fault('WEBM_TRACKS_MISSING', 'live initialization has no Tracks element');
    if (this.clusterTimecodes.length === 0) throw fault('WEBM_CLUSTER_MISSING', 'live stream has no Cluster');
    if (!this.initializationEmitted) await this.emitInitialization();
    this.phase = 'DONE';
    return Object.freeze({
      state: 'OK' as const,
      clusterCount: this.clusterTimecodes.length,
      clusterTimecodes: Object.freeze([...this.clusterTimecodes]),
      initializationBytes: this.initializationBytes,
      totalBytes: this.totalBytes,
      maximumBufferedBytes: this.maximumBufferedBytes,
      incrementallyConsumed: true as const,
    });
  }

  private async drain(finishing: boolean): Promise<void> {
    for (;;) {
      const header = parseElementHeader(this.pending, 0);
      if (!header) return;
      if (this.phase === 'SEGMENT') {
        if (header.id !== SEGMENT_ID) throw fault('WEBM_SEGMENT_MISSING', 'EBML header is not followed by Segment', this.absoluteOffset);
        if (!header.unknownSize) {
          throw fault('WEBM_LIVE_SEGMENT_SIZE_KNOWN', 'continuous live Segment must use unknown size', this.absoluteOffset);
        }
        const headerBytes = this.consume(header.headerBytes);
        this.initializationParts.push(headerBytes);
        this.phase = 'CHILDREN';
        continue;
      }
      if (header.unknownSize) {
        if (header.id !== CLUSTER_ID) {
          throw fault(
            'WEBM_CHILD_UNKNOWN_SIZE_UNSUPPORTED',
            'only the outer continuous Segment and its media Clusters may use unknown size',
            this.absoluteOffset,
          );
        }
        const total = unknownClusterExtent(this.pending, header, finishing);
        if (total === undefined) return;
        if (total > this.maximumElementBytes) {
          throw fault('WEBM_INCREMENTAL_ELEMENT_BOUND_EXCEEDED', `element size ${total} exceeds bound`, this.absoluteOffset);
        }
        const element = this.consume(total);
        await this.consumeChild(header, element);
        continue;
      }
      const total = header.headerBytes + header.size;
      if (total > this.maximumElementBytes) {
        throw fault('WEBM_INCREMENTAL_ELEMENT_BOUND_EXCEEDED', `element size ${total} exceeds bound`, this.absoluteOffset);
      }
      if (this.pending.byteLength < total) return;
      const element = this.consume(total);
      if (this.phase === 'EBML') {
        if (header.id !== EBML_ID) throw fault('WEBM_EBML_HEADER_MISSING', 'first element is not EBML', 0);
        this.initializationParts.push(element);
        this.phase = 'SEGMENT';
        continue;
      }
      await this.consumeChild(header, element);
    }
  }

  private async consumeChild(header: EbmlElementHeader, element: Uint8Array): Promise<void> {
    const body = element.subarray(header.headerBytes);
    if (header.id === SEEK_HEAD_ID) throw fault('WEBM_LIVE_SEEKHEAD_FORBIDDEN', 'continuous Segment contains SeekHead', this.absoluteOffset - element.byteLength);
    if (header.id === CUES_ID) throw fault('WEBM_LIVE_CUES_FORBIDDEN', 'continuous Segment contains Cues', this.absoluteOffset - element.byteLength);
    if (header.id === INFO_ID && containsElement(body, DURATION_ID)) {
      throw fault('WEBM_LIVE_DURATION_FORBIDDEN', 'continuous Segment Info contains finalized Duration', this.absoluteOffset - element.byteLength);
    }
    if (header.id === TRACKS_ID) {
      if (this.clusterTimecodes.length > 0) throw fault('WEBM_TRACKS_AFTER_CLUSTER', 'Tracks appears after media Clusters');
      this.tracksSeen = true;
    }
    if (header.id === CLUSTER_ID) {
      if (!this.tracksSeen) throw fault('WEBM_CLUSTER_BEFORE_TRACKS', 'Cluster appears before Tracks');
      const timecode = clusterTimecode(body);
      const previous = this.clusterTimecodes.at(-1);
      if (previous !== undefined && timecode < previous) {
        throw fault('WEBM_CLUSTER_TIMECODE_NON_MONOTONIC', `Cluster timecode ${timecode} < ${previous}`);
      }
      if (!this.initializationEmitted) await this.emitInitialization();
      const index = this.clusterTimecodes.length;
      this.clusterTimecodes.push(timecode);
      await this.consumer.onCluster?.(element.slice(), index, timecode);
      return;
    }
    if (this.clusterTimecodes.length > 0 && header.id !== VOID_ID && header.id !== CRC32_ID) {
      throw fault('WEBM_NON_CLUSTER_AFTER_MEDIA', `element 0x${header.id.toString(16)} appears between/after Clusters`);
    }
    this.initializationParts.push(element);
  }

  private async emitInitialization(): Promise<void> {
    const bytes = concatenate(this.initializationParts);
    this.initializationParts = [];
    this.initializationBytes = bytes.byteLength;
    this.initializationEmitted = true;
    await this.consumer.onInitialization?.(bytes);
  }

  private consume(length: number): Uint8Array {
    const out = this.pending.slice(0, length);
    this.pending = this.pending.slice(length);
    this.absoluteOffset += length;
    return out;
  }
}

/**
 * Resolve one unknown-size Cluster at EBML child boundaries. Scanning raw payload bytes for the
 * next four-byte Cluster ID produces false boundaries when a coded block happens to contain that
 * byte sequence; walking the finite Cluster children keeps the boundary aligned and incremental.
 */
function unknownClusterExtent(
  bytes: Uint8Array,
  cluster: EbmlElementHeader,
  finishing: boolean,
): number | undefined {
  let offset = cluster.headerBytes;
  while (offset < bytes.byteLength) {
    const child = parseElementHeader(bytes, offset);
    if (!child) {
      if (finishing) {
        throw fault('WEBM_INCREMENTAL_ELEMENT_INCOMPLETE', 'unknown-size Cluster ends with an incomplete child', offset);
      }
      return undefined;
    }
    if (SEGMENT_CHILD_IDS.has(child.id)) return offset;
    if (child.unknownSize) {
      throw fault('WEBM_CLUSTER_CHILD_UNKNOWN_SIZE_UNSUPPORTED', 'unknown-size Cluster contains an unbounded child', offset);
    }
    const end = offset + child.headerBytes + child.size;
    if (!Number.isSafeInteger(end)) {
      throw fault('WEBM_ELEMENT_EXTENT_UNSAFE', 'Cluster child extent exceeds the safe integer range', offset);
    }
    if (end > bytes.byteLength) {
      if (finishing) {
        throw fault('WEBM_INCREMENTAL_ELEMENT_INCOMPLETE', 'unknown-size Cluster ends with a truncated child', offset);
      }
      return undefined;
    }
    offset = end;
  }
  return finishing ? offset : undefined;
}

export async function inspectLiveWebm(
  bytes: Uint8Array,
  chunkBytes = 1024,
): Promise<LiveWebmReadResult> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    return malformed('WEBM_INPUT_INCOMPLETE', 'input is empty');
  }
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0) throw new TypeError('chunkBytes must be a positive integer');
  const parser = new IncrementalLiveWebmParser();
  try {
    for (let offset = 0; offset < bytes.byteLength; offset += chunkBytes) {
      await parser.feed(bytes.subarray(offset, Math.min(bytes.byteLength, offset + chunkBytes)));
    }
    return await parser.finish();
  } catch (error) {
    if (error instanceof WebmMalformed) return malformed(error.reasonCode, error.message, error.offset);
    return malformed('WEBM_READER_INTERNAL_ERROR', error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  }
}

export async function assessLiveWebm(bytes: Uint8Array, chunkBytes = 1024): Promise<StreamingDecision> {
  const result = await inspectLiveWebm(bytes, chunkBytes);
  if (result.state !== 'OK') return streamingVerdict('FAIL', result.reasonCode, result.detail);
  return streamingVerdict(
    'PASS',
    'WEBM_LIVE_INCREMENTAL_VALID',
    `${result.clusterCount} ordered Cluster(s) consumed incrementally without SeekHead/Cues/Duration`,
    {
      clusters: result.clusterCount,
      initializationBytes: result.initializationBytes,
      maximumBufferedBytes: result.maximumBufferedBytes,
    },
  );
}

export interface LiveWebmAppendEnvironment {
  isTypeSupported(mime: string): boolean;
  appendInitialization(bytes: Uint8Array): Promise<void>;
  appendCluster(bytes: Uint8Array, index: number): Promise<void>;
  finalize(): Promise<void>;
}

export async function probeLiveWebmAppend(
  bytes: Uint8Array,
  mime: string,
  environment: LiveWebmAppendEnvironment,
  chunkBytes = 1024,
): Promise<StreamingDecision> {
  const structural = await inspectLiveWebm(bytes, chunkBytes);
  if (structural.state !== 'OK') return streamingVerdict('FAIL', structural.reasonCode, structural.detail);
  if (!environment.isTypeSupported(mime)) {
    return streamingUnavailable('NA_BROWSER', 'WEBM_MSE_MIME_UNSUPPORTED', `MediaSource does not support ${mime}`);
  }
  let appended = 0;
  const parser = new IncrementalLiveWebmParser({
    consumer: {
      onInitialization: (initialization) => environment.appendInitialization(initialization),
      async onCluster(cluster, index) {
        await environment.appendCluster(cluster, index);
        appended++;
      },
    },
  });
  try {
    for (let offset = 0; offset < bytes.byteLength; offset += chunkBytes) {
      await parser.feed(bytes.subarray(offset, Math.min(bytes.byteLength, offset + chunkBytes)));
    }
    await parser.finish();
    await environment.finalize();
    return streamingVerdict(
      'PASS',
      'WEBM_MSE_APPEND_VALID',
      `MediaSource accepted initialization plus ${appended} Cluster(s) incrementally`,
      { appendedClusters: appended },
    );
  } catch (error) {
    return streamingVerdict(
      'FAIL',
      'WEBM_MSE_APPEND_FAILED',
      error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    );
  }
}

function parseElementHeader(bytes: Uint8Array, offset: number): EbmlElementHeader | undefined {
  const id = readVint(bytes, offset, true);
  if (!id) return undefined;
  const size = readVint(bytes, id.next, false);
  if (!size) return undefined;
  return {
    id: id.value,
    headerBytes: size.next - offset,
    size: size.value,
    unknownSize: size.unknown,
  };
}

function readVint(
  bytes: Uint8Array,
  offset: number,
  keepMarker: boolean,
): { value: number; next: number; unknown: boolean } | undefined {
  const first = bytes[offset];
  if (first === undefined) return undefined;
  let mask = 0x80;
  let length = 1;
  while (length <= 8 && (first & mask) === 0) { mask >>= 1; length++; }
  if (length > 8) throw fault('WEBM_VINT_PREFIX_INVALID', 'EBML vint has no marker bit', offset);
  if (offset + length > bytes.byteLength) return undefined;
  // The all-ones payload is the EBML unknown-size sentinel. Its legal eight-byte form represents
  // 2^56-1, which is intentionally outside Number's safe range; recognize it from the encoded bits
  // before converting the payload to a JavaScript number. Unknown sizes never use `value`.
  const unknown = !keepMarker &&
    (first & (mask - 1)) === mask - 1 &&
    bytes.subarray(offset + 1, offset + length).every((byte) => byte === 0xff);
  if (unknown) return { value: 0, next: offset + length, unknown: true };
  let value = keepMarker ? first : first & (mask - 1);
  for (let index = 1; index < length; index++) value = value * 256 + bytes[offset + index]!;
  if (!Number.isSafeInteger(value)) throw fault('WEBM_VINT_UNSAFE', 'EBML vint exceeds safe integer range', offset);
  return { value, next: offset + length, unknown: false };
}

function containsElement(bytes: Uint8Array, wantedId: number): boolean {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const header = parseElementHeader(bytes, offset);
    if (!header || header.unknownSize || offset + header.headerBytes + header.size > bytes.byteLength) {
      throw fault('WEBM_NESTED_ELEMENT_MALFORMED', 'nested EBML element is truncated', offset);
    }
    if (header.id === wantedId) return true;
    offset += header.headerBytes + header.size;
  }
  return false;
}

function clusterTimecode(body: Uint8Array): number {
  let offset = 0;
  while (offset < body.byteLength) {
    const header = parseElementHeader(body, offset);
    if (!header || header.unknownSize || offset + header.headerBytes + header.size > body.byteLength) {
      throw fault('WEBM_CLUSTER_ELEMENT_MALFORMED', 'Cluster child is truncated', offset);
    }
    if (header.id === TIMECODE_ID) {
      if (header.size < 1 || header.size > 8) throw fault('WEBM_CLUSTER_TIMECODE_INVALID', 'Cluster Timecode width is invalid');
      let value = 0;
      const start = offset + header.headerBytes;
      for (let index = 0; index < header.size; index++) value = value * 256 + body[start + index]!;
      if (!Number.isSafeInteger(value)) throw fault('WEBM_CLUSTER_TIMECODE_UNSAFE', 'Cluster Timecode exceeds safe range');
      return value;
    }
    offset += header.headerBytes + header.size;
  }
  throw fault('WEBM_CLUSTER_TIMECODE_MISSING', 'Cluster has no Timecode');
}

function append(first: Uint8Array, second: Uint8Array): Uint8Array {
  const out = new Uint8Array(first.byteLength + second.byteLength);
  out.set(first);
  out.set(second, first.byteLength);
  return out;
}

function concatenate(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.byteLength; }
  return out;
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${field} must be a positive safe integer`);
  return value;
}

function fault(reasonCode: string, detail: string, offset?: number): WebmMalformed {
  return new WebmMalformed(reasonCode, detail, offset);
}

function malformed(reasonCode: string, detail: string, offset?: number): Exclude<LiveWebmReadResult, LiveWebmEvidence> {
  return Object.freeze({
    state: 'MALFORMED' as const,
    reasonCode,
    detail,
    ...(offset !== undefined ? { offset } : {}),
  });
}
