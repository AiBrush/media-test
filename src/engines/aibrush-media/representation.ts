import type {
  DemuxResult,
  DemuxTrackRepresentation,
  NormalizedMetadata,
  NormalizedTrack,
  PacketInfo,
  TrackType,
} from '../../core/engine.ts';

export interface AibrushObservedTrack {
  readonly id: number;
  readonly mediaType: 'video' | 'audio';
  /** Product TrackInfo uses a nominal mediaType for declared data/timecode tracks. */
  readonly nonMedia?: true;
  readonly codec?: string;
  readonly defaultDisposition?: boolean;
  readonly durationSec?: number;
  readonly language?: string;
  readonly rotation?: number;
  readonly config?: {
    readonly codec?: string;
    readonly codedWidth?: number;
    readonly codedHeight?: number;
    readonly sampleRate?: number;
    readonly numberOfChannels?: number;
    readonly description?: BufferSource;
  };
}

export interface AibrushRawPacket {
  readonly trackIndex: number;
  readonly size: number;
  readonly ptsUs: number;
  readonly dtsUs?: number;
  readonly durationUs?: number;
  readonly keyframe: boolean;
  readonly payload?: Uint8Array;
}

export type AibrushPacketPayloadResolver = (
  packet: AibrushRawPacket,
) => Uint8Array | undefined;

export interface AibrushDemuxResultBuilder {
  /** Normalize one producer batch immediately so the caller can release its raw row objects. */
  addPackets(
    rawPackets: readonly AibrushRawPacket[],
    payloadForPacket?: AibrushPacketPayloadResolver,
  ): void;
  finish(): DemuxResult;
}

export function canonicalAibrushCodec(codec: string): string {
  const normalized = codec.toLowerCase();
  if (normalized.startsWith('avc1') || normalized.startsWith('avc3')) return 'h264';
  if (normalized.startsWith('hvc1') || normalized.startsWith('hev1')) return 'hevc';
  if (normalized.startsWith('av01')) return 'av1';
  if (normalized.startsWith('vp09') || normalized === 'vp9') return 'vp9';
  if (normalized.startsWith('vp08') || normalized === 'vp8') return 'vp8';
  if (normalized.startsWith('mp4a.6')) return 'mp3';
  if (normalized === 'mp4a' || normalized.startsWith('mp4a.')) return 'aac';
  return normalized;
}

export function normalizeAibrushTrack(track: AibrushObservedTrack): NormalizedTrack {
  const declaredCodecTag = track.codec ?? track.config?.codec ?? '';
  const nativeCodecTag = declaredCodecTag.length > 0 ? declaredCodecTag : 'unknown';
  const nonMedia = track.nonMedia === true;
  const normalized: NormalizedTrack = {
    type: nonMedia ? 'other' : track.mediaType,
    codec: nonMedia ? nativeCodecTag : canonicalAibrushCodec(nativeCodecTag),
    ...(declaredCodecTag.length > 0 ? { nativeCodecTag: declaredCodecTag } : {}),
    ...(track.config?.codedWidth !== undefined ? { width: track.config.codedWidth } : {}),
    ...(track.config?.codedHeight !== undefined ? { height: track.config.codedHeight } : {}),
    ...(track.config?.sampleRate !== undefined ? { sampleRate: track.config.sampleRate } : {}),
    ...(track.config?.numberOfChannels !== undefined ? { channels: track.config.numberOfChannels } : {}),
    ...(track.defaultDisposition !== undefined
      ? { defaultDisposition: track.defaultDisposition }
      : {}),
    bitrate: null,
    language: track.language ?? null,
  };
  return normalized;
}

export function representationForAibrushTrack(
  track: AibrushObservedTrack,
  trackIndex: number,
  packetOrdering: 'decode' | 'presentation',
): DemuxTrackRepresentation {
  const nativeCodecTag = track.codec ?? track.config?.codec ?? 'unknown';
  const codec = canonicalAibrushCodec(nativeCodecTag);
  const description = track.config?.description === undefined ? undefined : copyBytes(track.config.description);
  const common = {
    trackIndex,
    packetOrdering,
    nativeCodecTag,
    ...(description !== undefined ? { description } : {}),
  } as const;

  if (codec === 'h264') {
    const inBand = nativeCodecTag.toLowerCase().startsWith('avc3');
    return {
      ...common,
      framing: description === undefined ? 'annexb' : 'avc',
      accessUnitGrouping: 'one-access-unit-per-chunk',
      parameterSetLocation: inBand ? (description ? 'both' : 'in-band') : (description ? 'description' : 'in-band'),
      ...(description ? { descriptionRecord: 'avc-decoder-configuration-record' as const } : {}),
    };
  }
  if (codec === 'hevc') {
    const inBand = nativeCodecTag.toLowerCase().startsWith('hev1');
    return {
      ...common,
      framing: description === undefined ? 'annexb' : 'hevc',
      accessUnitGrouping: 'one-access-unit-per-chunk',
      parameterSetLocation: inBand ? (description ? 'both' : 'in-band') : (description ? 'description' : 'in-band'),
      ...(description ? { descriptionRecord: 'hevc-decoder-configuration-record' as const } : {}),
    };
  }
  if (codec === 'aac') {
    return {
      ...common,
      framing: description === undefined ? 'adts' : 'raw',
      accessUnitGrouping: 'one-access-unit-per-chunk',
      parameterSetLocation: description ? 'description' : 'in-band',
      ...(description ? { descriptionRecord: 'audio-specific-config' as const } : {}),
    };
  }
  return {
    ...common,
    framing: codec === 'av1' ? 'obu' : description === undefined ? 'raw' : 'codec-private',
    accessUnitGrouping: track.mediaType === 'video' ? 'one-frame-per-chunk' : 'one-packet-per-chunk',
    parameterSetLocation: description ? 'description' : 'not-applicable',
    ...(description ? { descriptionRecord: 'codec-private' as const } : {}),
  };
}

/**
 * Incrementally attach semantic packet evidence without retaining producer row objects. Track-level
 * representation facts are computed once, and a fixed decoder configuration is attached only to the
 * first packet of each track; the per-track `representations` entry remains the authoritative handoff.
 */
export function createAibrushDemuxResultBuilder(
  metadata: NormalizedMetadata,
  tracks: readonly AibrushObservedTrack[],
): AibrushDemuxResultBuilder {
  const packets: PacketInfo[] = [];
  const tracksWithDts = new Set<number>();
  const tracksWithDecoderConfig = new Set<number>();
  const trackEvidence = tracks.map((track, trackIndex) => {
    const nonMedia = track.nonMedia === true;
    return {
      trackType: (nonMedia ? 'other' : track.mediaType) as TrackType,
      codec: nonMedia
        ? undefined
        : canonicalAibrushCodec(track.codec ?? track.config?.codec ?? 'unknown'),
      representation: nonMedia
        ? undefined
        : representationForAibrushTrack(track, trackIndex, 'presentation'),
      nalLengthSize: nonMedia ? undefined : nalLengthSize(track),
    };
  });
  let finished = false;

  return {
    addPackets(rawPackets, payloadForPacket): void {
      if (finished) throw new TypeError('cannot add packets after finishing the aibrush demux result');
      for (const packet of rawPackets) {
        if (packet.dtsUs !== undefined) tracksWithDts.add(packet.trackIndex);
        const track = tracks[packet.trackIndex];
        const evidence = trackEvidence[packet.trackIndex];
        const candidatePayload = payloadForPacket?.(packet) ?? packet.payload;
        const payload = candidatePayload?.byteLength === packet.size ? candidatePayload : undefined;
        const decoderConfig =
          evidence?.representation?.description !== undefined &&
          !tracksWithDecoderConfig.has(packet.trackIndex)
            ? evidence.representation.description.slice()
            : undefined;
        if (decoderConfig !== undefined) tracksWithDecoderConfig.add(packet.trackIndex);
        packets.push({
          trackIndex: packet.trackIndex,
          size: packet.size,
          ptsUs: packet.ptsUs,
          ...(packet.dtsUs !== undefined ? { dtsUs: packet.dtsUs } : {}),
          ...(packet.durationUs !== undefined ? { durationUs: packet.durationUs } : {}),
          keyframe: packet.keyframe,
          ...(evidence !== undefined ? { trackType: evidence.trackType } : {}),
          ...(evidence?.codec !== undefined
            ? { codec: evidence.codec }
            : track === undefined && metadata.tracks[packet.trackIndex]?.codec !== undefined
              ? { codec: metadata.tracks[packet.trackIndex]!.codec }
              : {}),
          ...(payload !== undefined
            // The bytes are the authoritative evidence. Do not also publish a digest derived from
            // the same buffer: an independent oracle must distrust and re-hash that self-assertion.
            ? { payload: payload.slice() }
            : {}),
          ...(evidence?.representation !== undefined
            ? { framing: evidence.representation.framing }
            : {}),
          ...(evidence?.nalLengthSize !== undefined
            ? { nalLengthSize: evidence.nalLengthSize }
            : {}),
          ...(decoderConfig !== undefined ? { decoderConfig } : {}),
          randomAccessKind: packet.keyframe ? 'sync-sample' : 'non-sync-sample',
        });
      }
    },
    finish(): DemuxResult {
      if (finished) throw new TypeError('aibrush demux result builder is already finished');
      finished = true;
      const representations = trackEvidence.flatMap((evidence, trackIndex) => {
        const representation = evidence.representation;
        if (representation === undefined) return [];
        const packetOrdering: DemuxTrackRepresentation['packetOrdering'] =
          tracksWithDts.has(trackIndex) ? 'decode' : 'presentation';
        return representation.packetOrdering === packetOrdering
          ? [representation]
          : [{ ...representation, packetOrdering }];
      });
      const packetOrdering =
        representations.length === 0
          ? undefined
          : representations.every((representation) => representation.packetOrdering === 'decode')
            ? 'decode'
            : representations.every(
                  (representation) => representation.packetOrdering === 'presentation',
                )
              ? 'presentation'
              : undefined;
      return {
        metadata: withObservedCadence(metadata, packets),
        packets,
        ...(packetOrdering !== undefined ? { packetOrdering } : {}),
        representations,
      };
    },
  };
}

/** Attach semantic packet evidence without inventing a decode timestamp when the framework omitted it. */
export function buildAibrushDemuxResult(
  metadata: NormalizedMetadata,
  tracks: readonly AibrushObservedTrack[],
  rawPackets: readonly AibrushRawPacket[],
  payloadForPacket?: AibrushPacketPayloadResolver,
): DemuxResult {
  const builder = createAibrushDemuxResultBuilder(metadata, tracks);
  builder.addPackets(rawPackets, payloadForPacket);
  return builder.finish();
}

export function withObservedCadence(metadata: NormalizedMetadata, packets: readonly PacketInfo[]): NormalizedMetadata {
  const tracks = metadata.tracks.map((track, trackIndex): NormalizedTrack => {
    if (track.type !== 'video') return { ...track };
    const ordered = packets
      .filter((packet) => packet.trackIndex === trackIndex)
      .sort((a, b) => a.ptsUs - b.ptsUs);
    if (ordered.length === 0) return { ...track };
    if (ordered.length === 1) {
      const durationUs = ordered[0]!.durationUs;
      if (durationUs === undefined || durationUs <= 0) return { ...track };
      return {
        ...track,
        fps: 1_000_000 / durationUs,
        fpsProvenance: {
          source: 'observed',
          cadence: 'CFR',
          sampleCount: 1,
          observedIntervalUs: durationUs,
          envelope: { minFps: 1_000_000 / durationUs, maxFps: 1_000_000 / durationUs },
        },
      };
    }
    const startUs = ordered[0]!.ptsUs;
    const endUs = ordered.reduce(
      (end, packet) => Math.max(end, packet.ptsUs + Math.max(0, packet.durationUs ?? 0)),
      startUs,
    );
    const observedIntervalUs = endUs - startUs;
    if (!(observedIntervalUs > 0)) return { ...track };
    let intervalCount = 0;
    let intervalSum = 0;
    let minInterval = Number.POSITIVE_INFINITY;
    let maxInterval = Number.NEGATIVE_INFINITY;
    for (let index = 1; index < ordered.length; index++) {
      const interval = ordered[index]!.ptsUs - ordered[index - 1]!.ptsUs;
      if (interval <= 0) continue;
      intervalCount++;
      intervalSum += interval;
      minInterval = Math.min(minInterval, interval);
      maxInterval = Math.max(maxInterval, interval);
    }
    if (intervalCount === 0) {
      return {
        ...track,
        fps: ordered.length * 1_000_000 / observedIntervalUs,
        fpsProvenance: {
          source: 'observed',
          cadence: 'UNKNOWN',
          sampleCount: ordered.length,
          observedIntervalUs,
        },
      };
    }
    const meanInterval = intervalSum / intervalCount;
    const fps = 1_000_000 / meanInterval;
    const cadenceObservedIntervalUs = ordered.length * meanInterval;
    return {
      ...track,
      fps,
      fpsProvenance: {
        source: 'observed',
        cadence: maxInterval - minInterval <= Math.max(2, meanInterval * 0.001) ? 'CFR' : 'VFR',
        sampleCount: ordered.length,
        observedIntervalUs: cadenceObservedIntervalUs,
        envelope: { minFps: 1_000_000 / maxInterval, maxFps: 1_000_000 / minInterval },
      },
    };
  });
  return { ...metadata, tracks };
}

function copyBytes(source: BufferSource): Uint8Array {
  const view = ArrayBuffer.isView(source)
    ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
    : new Uint8Array(source);
  return view.slice();
}

function nalLengthSize(track: AibrushObservedTrack): number | undefined {
  const description = track.config?.description;
  if (description === undefined) return undefined;
  const bytes = ArrayBuffer.isView(description)
    ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength)
    : new Uint8Array(description);
  const codec = canonicalAibrushCodec(track.codec ?? track.config?.codec ?? 'unknown');
  if (codec === 'h264' && bytes.byteLength > 4) return (bytes[4]! & 0x03) + 1;
  if (codec === 'hevc' && bytes.byteLength > 21) return (bytes[21]! & 0x03) + 1;
  return undefined;
}
