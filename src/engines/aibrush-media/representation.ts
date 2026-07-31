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

/** Attach semantic packet evidence without inventing a decode timestamp when the framework omitted it. */
export function buildAibrushDemuxResult(
  metadata: NormalizedMetadata,
  tracks: readonly AibrushObservedTrack[],
  rawPackets: readonly AibrushRawPacket[],
): DemuxResult {
  const packets: PacketInfo[] = rawPackets.map((packet) => {
    const payload = packet.payload?.byteLength === packet.size ? packet.payload : undefined;
    const track = tracks[packet.trackIndex];
    const codec =
      track?.nonMedia === true
        ? undefined
        : track === undefined
          ? metadata.tracks[packet.trackIndex]?.codec
          : canonicalAibrushCodec(track.codec ?? track.config?.codec ?? 'unknown');
    const representation = track === undefined
      ? undefined
      : track.nonMedia === true
        ? undefined
        : representationForAibrushTrack(
            track,
            packet.trackIndex,
            packet.dtsUs === undefined ? 'presentation' : 'decode',
          );
    return {
      trackIndex: packet.trackIndex,
      size: packet.size,
      ptsUs: packet.ptsUs,
      ...(packet.dtsUs !== undefined ? { dtsUs: packet.dtsUs } : {}),
      ...(packet.durationUs !== undefined ? { durationUs: packet.durationUs } : {}),
      keyframe: packet.keyframe,
      ...(track !== undefined
        ? { trackType: (track.nonMedia === true ? 'other' : track.mediaType) as TrackType }
        : {}),
      ...(codec !== undefined ? { codec } : {}),
      ...(payload !== undefined
        // The bytes are the authoritative evidence. Do not also publish a digest derived from the
        // same buffer: an independent oracle must distrust and re-hash that self-assertion anyway.
        // Semantic goldens hash `payload` when required; scalar goldens can skip a redundant
        // full-source digest pass while retaining the exact coded bytes for downstream consumers.
        ? { payload: payload.slice() }
        : {}),
      ...(representation !== undefined ? { framing: representation.framing } : {}),
      ...(track !== undefined && nalLengthSize(track) !== undefined ? { nalLengthSize: nalLengthSize(track) } : {}),
      ...(representation?.description !== undefined ? { decoderConfig: representation.description.slice() } : {}),
      randomAccessKind: packet.keyframe ? 'sync-sample' : 'non-sync-sample',
    };
  });
  const metadataWithCadence = withObservedCadence(metadata, packets);
  const representations = tracks.flatMap((track, trackIndex) => {
    if (track.nonMedia === true) return [];
    const hasDts = packets.some((packet) => packet.trackIndex === trackIndex && packet.dtsUs !== undefined);
    return [representationForAibrushTrack(track, trackIndex, hasDts ? 'decode' : 'presentation')];
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
    metadata: metadataWithCadence,
    packets,
    ...(packetOrdering !== undefined ? { packetOrdering } : {}),
    representations,
  };
}

export function withObservedCadence(metadata: NormalizedMetadata, packets: readonly PacketInfo[]): NormalizedMetadata {
  const tracks = metadata.tracks.map((track, trackIndex): NormalizedTrack => {
    if (track.type !== 'video') return { ...track };
    const videoPackets = packets.filter((packet) => packet.trackIndex === trackIndex);
    if (videoPackets.length === 0) return { ...track };
    const ordered = [...videoPackets].sort((a, b) => a.ptsUs - b.ptsUs);
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
  const bytes = copyBytes(description);
  const codec = canonicalAibrushCodec(track.codec ?? track.config?.codec ?? 'unknown');
  if (codec === 'h264' && bytes.byteLength > 4) return (bytes[4]! & 0x03) + 1;
  if (codec === 'hevc' && bytes.byteLength > 21) return (bytes[21]! & 0x03) + 1;
  return undefined;
}
