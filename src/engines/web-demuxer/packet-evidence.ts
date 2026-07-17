import type {
  CodecDescriptionRecord,
  CodedChunkFraming,
  DemuxTrackRepresentation,
  FrameRateProvenance,
  NormalizedTrack,
  PacketInfo,
  ParameterSetLocation,
  TrackType,
} from '../../core/engine.ts';
import type { WebAVPacket, WebAVStream } from 'web-demuxer';

import { sha256Hex } from './digest.ts';

export interface RationalValue {
  numerator: number;
  denominator: number;
  value: number;
}

export interface TrackPacketEvidenceAccumulator {
  trackIndex: number;
  trackType: TrackType;
  codec: string;
  nativeCodecTag?: string;
  description?: Uint8Array;
  framing?: CodedChunkFraming;
  nalLengthSize?: number;
  sawInlineParameterSets: boolean;
  packetCount: number;
}

export function parseFfmpegRational(value: string | undefined): RationalValue | undefined {
  if (!value) return undefined;
  const [rawNumerator, rawDenominator] = value.trim().split('/');
  const numerator = Number(rawNumerator);
  const denominator = rawDenominator === undefined ? 1 : Number(rawDenominator);
  if (
    !Number.isSafeInteger(numerator) ||
    !Number.isSafeInteger(denominator) ||
    numerator <= 0 ||
    denominator <= 0
  ) {
    return undefined;
  }
  return { numerator, denominator, value: numerator / denominator };
}

/** Truthful FPS value plus typed provenance from FFmpeg's average/nominal stream observations. */
export function frameRateFromStream(
  stream: Pick<WebAVStream, 'avg_frame_rate' | 'r_frame_rate' | 'nb_frames' | 'duration'>,
): { fps: number; provenance: FrameRateProvenance } | undefined {
  const average = parseFfmpegRational(stream.avg_frame_rate);
  const nominal = parseFfmpegRational(stream.r_frame_rate);
  const sampleCount = Number(stream.nb_frames);
  const durationUs = Math.round(Number(stream.duration) * 1_000_000);
  const cadence = average && nominal
    ? Math.abs(average.value - nominal.value) <= Math.max(0.001, nominal.value * 0.001)
      ? 'CFR'
      : 'VFR'
    : 'UNKNOWN';
  const envelope = average && nominal
    ? { minFps: Math.min(average.value, nominal.value), maxFps: Math.max(average.value, nominal.value) }
    : undefined;

  if (average && Number.isSafeInteger(sampleCount) && sampleCount > 0 && durationUs > 0) {
    const fps = (sampleCount * 1_000_000) / durationUs;
    return {
      fps,
      provenance: {
        source: 'average',
        sampleCount,
        observedIntervalUs: durationUs,
        rational: { numerator: average.numerator, denominator: average.denominator },
        cadence,
        ...(envelope ? { envelope } : {}),
      },
    };
  }
  const reported = average ?? nominal;
  if (!reported) return undefined;
  return {
    fps: reported.value,
    provenance: {
      source: 'nominal',
      rational: { numerator: reported.numerator, denominator: reported.denominator },
      cadence,
      ...(envelope ? { envelope } : {}),
    },
  };
}

export function createTrackEvidenceAccumulator(
  trackIndex: number,
  trackType: TrackType,
  codec: string,
  stream: Pick<WebAVStream, 'codec_string' | 'extradata'>,
): TrackPacketEvidenceAccumulator {
  const description = stream.extradata?.byteLength ? stream.extradata.slice() : undefined;
  return {
    trackIndex,
    trackType,
    codec,
    ...(stream.codec_string ? { nativeCodecTag: stream.codec_string } : {}),
    ...(description ? { description } : {}),
    sawInlineParameterSets: false,
    packetCount: 0,
  };
}

/** Convert one package packet without fabricating DTS or retaining its potentially large payload. */
export async function packetEvidenceFromWebPacket(
  packet: WebAVPacket,
  accumulator: TrackPacketEvidenceAccumulator,
  signal?: AbortSignal,
): Promise<PacketInfo> {
  throwIfAborted(signal);
  const payload = packet.data instanceof Uint8Array ? packet.data : new Uint8Array(packet.data);
  const representation = detectCodedRepresentation(accumulator.codec, payload, accumulator.description);
  if (representation.framing !== undefined) {
    if (accumulator.framing !== undefined && accumulator.framing !== representation.framing) {
      throw new Error(
        `web-demuxer packet framing changed within track ${accumulator.trackIndex}: ` +
        `${accumulator.framing} -> ${representation.framing}`,
      );
    }
    accumulator.framing = representation.framing;
  }
  if (representation.nalLengthSize !== undefined) accumulator.nalLengthSize = representation.nalLengthSize;
  accumulator.sawInlineParameterSets ||= representation.hasParameterSets;
  accumulator.packetCount++;

  const semanticBytes = representation.primaryUnits.length
    ? canonicalUnitBytes(representation.primaryUnits)
    : payload;
  const accessUnitId = await stableDigestIdentity(semanticBytes, signal);
  const payloadDigest = await optionalSha256(payload, signal);
  const ptsUs = Math.round(packet.timestamp * 1_000_000);
  const durationUs = Number.isFinite(packet.duration) && packet.duration >= 0
    ? Math.round(packet.duration * 1_000_000)
    : undefined;

  return {
    trackIndex: accumulator.trackIndex,
    trackType: accumulator.trackType,
    codec: accumulator.codec,
    size: packet.size,
    ptsUs,
    ...(durationUs !== undefined ? { durationUs } : {}),
    keyframe: representation.randomAccess ?? packet.keyframe === 1,
    accessUnitId,
    ...(payloadDigest ? { payloadDigest } : {}),
    ...(representation.framing ? { framing: representation.framing } : {}),
    ...(representation.nalLengthSize !== undefined ? { nalLengthSize: representation.nalLengthSize } : {}),
    randomAccessKind: representation.randomAccessKind ?? (packet.keyframe === 1 ? 'container-sync' : 'non-sync'),
  };
}

export function finishTrackRepresentation(
  accumulator: TrackPacketEvidenceAccumulator,
): DemuxTrackRepresentation | undefined {
  if (accumulator.packetCount === 0) return undefined;
  const framing = accumulator.framing ?? defaultFraming(accumulator.codec, accumulator.description);
  if (framing === undefined) return undefined;
  const hasDescription = (accumulator.description?.byteLength ?? 0) > 0;
  const parameterSetLocation: ParameterSetLocation =
    accumulator.codec === 'h264' || accumulator.codec === 'hevc'
      ? hasDescription && accumulator.sawInlineParameterSets
        ? 'both'
        : hasDescription
          ? 'description'
          : accumulator.sawInlineParameterSets
            ? 'in-band'
            : 'not-applicable'
      : 'not-applicable';
  const descriptionRecord = descriptionRecordFor(accumulator.codec, framing, hasDescription);
  return {
    trackIndex: accumulator.trackIndex,
    packetOrdering: 'presentation',
    framing,
    accessUnitGrouping:
      accumulator.codec === 'h264' || accumulator.codec === 'hevc'
        ? 'one-access-unit-per-chunk'
        : 'one-packet-per-chunk',
    parameterSetLocation,
    ...(accumulator.nativeCodecTag ? { nativeCodecTag: accumulator.nativeCodecTag } : {}),
    ...(accumulator.description ? { description: accumulator.description.slice() } : {}),
    ...(descriptionRecord ? { descriptionRecord } : {}),
  };
}

export function mergeNormalizedStreams(
  primary: readonly WebAVStream[],
  supplemental: readonly WebAVStream[],
): WebAVStream[] {
  const supplementalByIndex = new Map(supplemental.map((stream) => [stream.index, stream]));
  const seen = new Set<number>();
  const merged = primary.map((stream) => {
    seen.add(stream.index);
    const extra = supplementalByIndex.get(stream.index);
    return extra ? { ...extra, ...stream, extradata: stream.extradata?.byteLength ? stream.extradata : extra.extradata } : stream;
  });
  for (const stream of supplemental) if (!seen.has(stream.index)) merged.push(stream);
  return merged;
}

export function streamIndexToTrackIndex(streams: readonly Pick<WebAVStream, 'index'>[]): Map<number, number> {
  const out = new Map<number, number>();
  streams.forEach((stream, trackIndex) => {
    if (out.has(stream.index)) throw new Error(`web-demuxer returned duplicate stream index ${stream.index}`);
    out.set(stream.index, trackIndex);
  });
  return out;
}

export function applyFrameRateEvidence(track: NormalizedTrack, stream: WebAVStream): NormalizedTrack {
  if (track.type !== 'video') return track;
  const evidence = frameRateFromStream(stream);
  return evidence ? { ...track, fps: evidence.fps, fpsProvenance: evidence.provenance } : track;
}

interface DetectedRepresentation {
  framing?: CodedChunkFraming;
  nalLengthSize?: number;
  primaryUnits: Uint8Array[];
  hasParameterSets: boolean;
  randomAccess?: boolean;
  randomAccessKind?: string;
}

export function detectCodedRepresentation(
  codec: string,
  payload: Uint8Array,
  description?: Uint8Array,
): DetectedRepresentation {
  if (codec !== 'h264' && codec !== 'hevc') {
    return {
      framing: codec === 'aac' && looksLikeAdts(payload) ? 'adts' : 'raw',
      primaryUnits: codec === 'aac' && looksLikeAdts(payload) ? [stripAdts(payload)] : [payload],
      hasParameterSets: false,
      randomAccess: codec === 'aac' ? true : undefined,
    };
  }
  const annexB = splitAnnexB(payload);
  const descriptionNalLength = nalLengthSizeFromDescription(codec, description);
  const lengthSize = descriptionNalLength ?? findValidNalLengthSize(payload);
  const units = annexB ?? (lengthSize ? splitLengthPrefixed(payload, lengthSize) : undefined);
  if (!units) throw new Error(`${codec} packet has neither valid Annex-B nor length-prefixed framing`);
  const types = units.filter((unit) => unit.byteLength > 0).map((unit) => nalType(codec, unit));
  const isParameter = (type: number): boolean =>
    codec === 'h264' ? type === 7 || type === 8 : type === 32 || type === 33 || type === 34;
  const isPrimary = (type: number): boolean => codec === 'h264' ? type >= 1 && type <= 5 : type >= 0 && type <= 31;
  const randomAccess = codec === 'h264'
    ? types.includes(5)
    : types.some((type) => type >= 16 && type <= 23);
  return {
    framing: annexB ? 'annexb' : codec === 'h264' ? 'avc' : 'hevc',
    ...(!annexB && lengthSize ? { nalLengthSize: lengthSize } : {}),
    primaryUnits: units.filter((unit) => isPrimary(nalType(codec, unit))),
    hasParameterSets: units.some((unit) => isParameter(nalType(codec, unit))),
    randomAccess,
    randomAccessKind: randomAccess ? (codec === 'h264' ? 'idr' : 'irap') : 'non-sync',
  };
}

function nalLengthSizeFromDescription(codec: string, description?: Uint8Array): number | undefined {
  if (!description?.byteLength || description[0] !== 1) return undefined;
  const index = codec === 'h264' ? 4 : 21;
  const value = description[index];
  return value === undefined ? undefined : (value & 0x03) + 1;
}

function findValidNalLengthSize(payload: Uint8Array): number | undefined {
  for (const width of [4, 2, 1] as const) if (splitLengthPrefixed(payload, width)) return width;
  return undefined;
}

function splitLengthPrefixed(payload: Uint8Array, width: number): Uint8Array[] | undefined {
  const units: Uint8Array[] = [];
  let offset = 0;
  while (offset + width <= payload.byteLength) {
    let length = 0;
    for (let index = 0; index < width; index++) length = length * 256 + payload[offset + index]!;
    offset += width;
    if (length <= 0 || offset + length > payload.byteLength) return undefined;
    units.push(payload.subarray(offset, offset + length));
    offset += length;
  }
  return offset === payload.byteLength && units.length ? units : undefined;
}

function splitAnnexB(payload: Uint8Array): Uint8Array[] | undefined {
  const starts: Array<{ prefix: number; payload: number }> = [];
  for (let index = 0; index + 3 <= payload.byteLength; index++) {
    if (payload[index] !== 0 || payload[index + 1] !== 0) continue;
    if (payload[index + 2] === 1) starts.push({ prefix: index, payload: index + 3 });
    else if (payload[index + 2] === 0 && payload[index + 3] === 1) starts.push({ prefix: index, payload: index + 4 });
  }
  if (!starts.length || starts[0]!.prefix !== 0) return undefined;
  return starts.map((start, index) => payload.subarray(start.payload, starts[index + 1]?.prefix ?? payload.byteLength));
}

function nalType(codec: string, unit: Uint8Array): number {
  const first = unit[0] ?? 0;
  return codec === 'h264' ? first & 0x1f : (first >> 1) & 0x3f;
}

function looksLikeAdts(payload: Uint8Array): boolean {
  return payload.byteLength >= 7 && payload[0] === 0xff && (payload[1]! & 0xf6) === 0xf0;
}

function stripAdts(payload: Uint8Array): Uint8Array {
  const header = (payload[1]! & 0x01) === 0 ? 9 : 7;
  return payload.byteLength > header ? payload.subarray(header) : new Uint8Array();
}

function canonicalUnitBytes(units: readonly Uint8Array[]): Uint8Array {
  const length = units.reduce((sum, unit) => sum + 4 + unit.byteLength, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const unit of units) {
    const size = unit.byteLength;
    out[offset] = (size >>> 24) & 0xff;
    out[offset + 1] = (size >>> 16) & 0xff;
    out[offset + 2] = (size >>> 8) & 0xff;
    out[offset + 3] = size & 0xff;
    out.set(unit, offset + 4);
    offset += 4 + size;
  }
  return out;
}

async function stableDigestIdentity(bytes: Uint8Array, signal?: AbortSignal): Promise<string> {
  const digest = await optionalSha256(bytes, signal);
  return digest ? `sha256:${digest}` : `fnv1a64:${fnv1a64(bytes)}`;
}

async function optionalSha256(bytes: Uint8Array, signal?: AbortSignal): Promise<string | undefined> {
  throwIfAborted(signal);
  if (typeof globalThis.crypto?.subtle?.digest !== 'function') return undefined;
  return sha256Hex(bytes, signal);
}

function fnv1a64(bytes: Uint8Array): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function defaultFraming(codec: string, description?: Uint8Array): CodedChunkFraming | undefined {
  if (codec === 'h264') return description?.[0] === 1 ? 'avc' : undefined;
  if (codec === 'hevc') return description?.[0] === 1 ? 'hevc' : undefined;
  if (codec === 'aac') return 'raw';
  if (codec) return 'raw';
  return undefined;
}

function descriptionRecordFor(
  codec: string,
  framing: CodedChunkFraming,
  hasDescription: boolean,
): CodecDescriptionRecord | undefined {
  if (!hasDescription) return undefined;
  if (codec === 'h264' && framing === 'avc') return 'avc-decoder-configuration-record';
  if (codec === 'hevc' && framing === 'hevc') return 'hevc-decoder-configuration-record';
  if (codec === 'aac') return 'audio-specific-config';
  return 'codec-private';
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new DOMException('operation aborted', 'AbortError');
}
