import type {
  DemuxTrackRepresentation,
  FrameRateProvenance,
  NormalizedMetadata,
  NormalizedTrack,
  PacketInfo,
  RationalTimebase,
} from '../../core/engine.ts';
import { canonicalCodec } from './codecs.ts';

export type FfmpegOperationPhase = 'materialize' | 'execute' | 'read' | 'cleanup';

export interface FfmpegPhaseEvidence {
  phase: FfmpegOperationPhase;
  atMs: number;
  bytesIn: number;
  bytesOut: number;
  memfsBytes: number;
  workerFsBytes: number;
  wrapperHeapBytes: number;
  estimatedPeakBytes: number;
  workerTerminated?: boolean;
  reasonCode?: string;
}

export interface FfmpegFsSnapshot {
  memfsBytes: number;
  workerFsBytes: number;
  jsCopyBytes: number;
  wrapperHeapBytes: number;
  workingBytes: number;
  estimatedPeakBytes: number;
  livePaths: string[];
}

/** Deterministic virtual-FS + copy accounting used by runtime telemetry and cleanup conformance. */
export class FfmpegFsLedger {
  private readonly entries = new Map<string, { bytes: number; backend: 'MEMFS' | 'WORKERFS' }>();
  private jsCopyBytes = 0;
  private wrapperHeapBytes = 0;
  private workingBytes = 0;
  private peakBytes = 0;

  add(path: string, bytes: number, backend: 'MEMFS' | 'WORKERFS'): void {
    this.entries.set(path, { bytes: checkedBytes(bytes), backend });
    this.updatePeak();
  }

  remove(path: string): void {
    this.entries.delete(path);
  }

  addJsCopy(bytes: number): void {
    this.jsCopyBytes += checkedBytes(bytes);
    this.updatePeak();
  }

  releaseJsCopy(bytes: number): void {
    this.jsCopyBytes = Math.max(0, this.jsCopyBytes - checkedBytes(bytes));
  }

  setWrapperHeapEstimate(bytes: number): void {
    this.wrapperHeapBytes = checkedBytes(bytes);
    this.updatePeak();
  }

  setWorkingEstimate(bytes: number): void {
    this.workingBytes = checkedBytes(bytes);
    this.updatePeak();
  }

  snapshot(): FfmpegFsSnapshot {
    let memfsBytes = 0;
    let workerFsBytes = 0;
    for (const entry of this.entries.values()) {
      if (entry.backend === 'MEMFS') memfsBytes += entry.bytes;
      else workerFsBytes += entry.bytes;
    }
    return {
      memfsBytes,
      workerFsBytes,
      jsCopyBytes: this.jsCopyBytes,
      wrapperHeapBytes: this.wrapperHeapBytes,
      workingBytes: this.workingBytes,
      estimatedPeakBytes: this.peakBytes,
      livePaths: [...this.entries.keys()].sort(),
    };
  }

  assertEmpty(): void {
    if (this.entries.size > 0) throw new Error(`ffmpeg FS leak: ${[...this.entries.keys()].sort().join(', ')}`);
  }

  reset(): void {
    this.entries.clear();
    this.jsCopyBytes = 0;
    this.wrapperHeapBytes = 0;
    this.workingBytes = 0;
    this.peakBytes = 0;
  }

  private updatePeak(): void {
    let materialized = this.jsCopyBytes + this.wrapperHeapBytes + this.workingBytes;
    for (const entry of this.entries.values()) materialized += entry.bytes;
    this.peakBytes = Math.max(this.peakBytes, materialized);
  }
}

export interface StructuredProbeResult {
  metadata: NormalizedMetadata;
  /** Source stream indices corresponding positionally to normalized `metadata.tracks`. */
  trackIndexes: number[];
  decoderConfigs: Map<number, Uint8Array>;
  timebases: Map<number, RationalTimebase>;
  rawDigestInput: string;
}

/**
 * Parse tracks from the first `Input #` block of an `ffmpeg -i` log. The loaded
 * wasm core includes source-index and timebase diagnostics between the optional
 * language token and the media type (for example `, 31, 1/60`).
 */
export function parseTracksFromLog(log: string): NormalizedTrack[] {
  const tracks: NormalizedTrack[] = [];
  const lines = log.split('\n');
  let inInput = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.replace(/\r$/, '').trim();
    if (/^Input #\d+/.test(trimmed)) {
      inInput = true;
      continue;
    }
    if (/^(Output #|Stream mapping:|Press \[q\]|At least one output|Stream #\d+:\d+ -> )/.test(trimmed)) {
      inInput = false;
    }
    if (!inInput) continue;

    const match = /^Stream #\d+:\d+(?:\[[^\]]*\])?(?:\(([^)]*)\))?(?:,\s*[^:]+)?:\s*(Video|Audio|Subtitle|Data):\s*(.*)$/.exec(trimmed);
    if (!match) continue;
    const language = match[1];
    const kind = match[2]!.toLowerCase();
    const rest = match[3] ?? '';
    const track: NormalizedTrack = {
      type: kind === 'video' ? 'video' : kind === 'audio' ? 'audio' : kind === 'subtitle' ? 'subtitle' : 'other',
      codec: canonicalCodec(rest.trim().split(/[\s,(]/)[0] ?? ''),
      bitrate: null,
      language: language && language !== 'und' ? language : null,
    };
    if (/\(default\)/i.test(rest)) track.defaultDisposition = true;

    if (kind === 'video') {
      const dimensions = /\b(\d{1,5})x(\d{1,5})\b/.exec(rest);
      if (dimensions) {
        track.width = Number(dimensions[1]);
        track.height = Number(dimensions[2]);
      }
      const frameRate = /(\d+(?:\.\d+)?)\s*(?:fps|tbr)\b/.exec(rest);
      if (frameRate) track.fps = Math.round(parseFloat(frameRate[1]!) * 1000) / 1000;
      for (let next = i + 1; next < lines.length; next++) {
        const sideData = lines[next]!.trim();
        if (/^(Stream #|Input #|Output #|At least one)/.test(sideData)) break;
        const rotation = /rotation of\s*(-?\d+(?:\.\d+)?)\s*degrees/.exec(sideData);
        if (rotation) {
          const degrees = parseFloat(rotation[1]!);
          track.rotation = ((degrees % 360) + 360) % 360;
          break;
        }
      }
    } else if (kind === 'audio') {
      const sampleRate = /(\d+)\s*Hz/.exec(rest);
      if (sampleRate) track.sampleRate = Number(sampleRate[1]);
      const channels = channelsFromLayout(rest);
      if (channels !== undefined) track.channels = channels;
      const bitDepth = pcmBitDepth(track.codec);
      if (bitDepth !== undefined && track.sampleRate !== undefined && track.channels !== undefined) {
        track.bitrate = bitDepth * track.sampleRate * track.channels;
      }
    }
    tracks.push(track);
  }
  return tracks;
}

/** Canonicalize the demuxer family FFmpeg actually observed, retaining suffix precision when valid. */
export function containerFromFfmpegLog(log: string, fallback: string): string {
  const match = /^Input #\d+,\s*(.+?),\s+from\s+/m.exec(log);
  if (!match) return fallback;
  const demuxers = new Set(match[1]!.toLowerCase().split(',').map((value) => value.trim()));
  if (demuxers.has('mov') || demuxers.has('mp4')) return fallback === 'mov' || fallback === 'mp4' ? fallback : 'mp4';
  if (demuxers.has('matroska') || demuxers.has('webm')) return fallback === 'mkv' || fallback === 'webm' ? fallback : 'webm';
  if (demuxers.has('mpegts')) return 'ts';
  if (demuxers.has('hls')) return 'hls';
  if (demuxers.has('wav')) return 'wav';
  if (demuxers.has('aiff')) return 'aiff';
  if (demuxers.has('caf')) return 'caf';
  if (demuxers.has('mp3')) return 'mp3';
  if (demuxers.has('flac')) return 'flac';
  if (demuxers.has('ogg')) return 'ogg';
  if (demuxers.has('aac')) return 'adts';
  return fallback;
}

/**
 * Recover presentation duration from an MPEG-1 Layer III Xing/Info + LAME header. FFmpeg's human
 * `-i` log rounds duration to centiseconds, while the header retains frame count and the encoder
 * delay/padding required for sample-accurate presentation length.
 */
export function parseMp3XingDurationSec(bytes: Uint8Array): number | null {
  let frameStart = id3v2End(bytes);
  while (frameStart + 4 <= bytes.byteLength && !isMp3FrameSync(bytes, frameStart)) frameStart++;
  if (frameStart + 4 > bytes.byteLength) return null;

  const b1 = bytes[frameStart + 1]!;
  const b2 = bytes[frameStart + 2]!;
  const b3 = bytes[frameStart + 3]!;
  const versionBits = (b1 >> 3) & 0x03;
  const layerBits = (b1 >> 1) & 0x03;
  if (versionBits === 1 || layerBits !== 1) return null; // reserved version or not Layer III
  const sampleRateIndex = (b2 >> 2) & 0x03;
  if (sampleRateIndex === 3) return null;
  const baseRates = [44_100, 48_000, 32_000] as const;
  const sampleRate = baseRates[sampleRateIndex]! / (versionBits === 3 ? 1 : versionBits === 2 ? 2 : 4);
  const samplesPerFrame = versionBits === 3 ? 1152 : 576;
  const mono = ((b3 >> 6) & 0x03) === 3;
  const sideInfoBytes = versionBits === 3 ? (mono ? 17 : 32) : (mono ? 9 : 17);
  const crcBytes = (b1 & 0x01) === 0 ? 2 : 0;
  const xing = frameStart + 4 + crcBytes + sideInfoBytes;
  if (xing + 12 > bytes.byteLength) return null;
  const marker = String.fromCharCode(bytes[xing]!, bytes[xing + 1]!, bytes[xing + 2]!, bytes[xing + 3]!);
  if (marker !== 'Xing' && marker !== 'Info') return null;

  const flags = readU32Be(bytes, xing + 4);
  let offset = xing + 8;
  if ((flags & 0x01) === 0 || offset + 4 > bytes.byteLength) return null;
  const frameCount = readU32Be(bytes, offset);
  offset += 4;
  if ((flags & 0x02) !== 0) offset += 4;
  if ((flags & 0x04) !== 0) offset += 100;
  if ((flags & 0x08) !== 0) offset += 4;
  if (frameCount === 0 || offset + 24 > bytes.byteLength) return null;

  let delay = 0;
  let padding = 0;
  const encoder = new TextDecoder('ascii').decode(bytes.subarray(offset, Math.min(offset + 9, bytes.byteLength)));
  if (/^(?:LAME|Lavf|Lavc)/.test(encoder) && offset + 24 <= bytes.byteLength) {
    delay = (bytes[offset + 21]! << 4) | (bytes[offset + 22]! >> 4);
    padding = ((bytes[offset + 22]! & 0x0f) << 8) | bytes[offset + 23]!;
  }
  const presentationSamples = frameCount * samplesPerFrame - delay - padding;
  return presentationSamples > 0 ? presentationSamples / sampleRate : null;
}

function id3v2End(bytes: Uint8Array): number {
  if (
    bytes.byteLength < 10 ||
    bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33 ||
    (bytes[6]! | bytes[7]! | bytes[8]! | bytes[9]!) >= 0x80
  ) return 0;
  const size = (bytes[6]! << 21) | (bytes[7]! << 14) | (bytes[8]! << 7) | bytes[9]!;
  const footer = (bytes[5]! & 0x10) !== 0 ? 10 : 0;
  return Math.min(bytes.byteLength, 10 + size + footer);
}

function isMp3FrameSync(bytes: Uint8Array, offset: number): boolean {
  return bytes[offset] === 0xff && (bytes[offset + 1]! & 0xe0) === 0xe0;
}

function readU32Be(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! * 0x1000000 + (bytes[offset + 1]! << 16) + (bytes[offset + 2]! << 8) + bytes[offset + 3]!;
}

function channelsFromLayout(value: string): number | undefined {
  const layout = value.toLowerCase();
  if (/\bstereo\b/.test(layout)) return 2;
  if (/\bmono\b/.test(layout)) return 1;
  if (/\b7\.1\b/.test(layout)) return 8;
  if (/\b6\.1\b/.test(layout)) return 7;
  if (/\b5\.1\b/.test(layout)) return 6;
  if (/\bquad\b/.test(layout)) return 4;
  const channels = /(\d+)\s*channels?/.exec(layout);
  return channels ? Number(channels[1]) : undefined;
}

function pcmBitDepth(codec: string): number | undefined {
  if (codec === 'pcm-s16') return 16;
  if (codec === 'pcm-s24') return 24;
  if (codec === 'pcm-f32') return 32;
  return undefined;
}

export function parseFfprobeJson(text: string, container: string): StructuredProbeResult {
  const root = parseRecord(text, 'ffprobe JSON');
  const format = record(root.format);
  const streams = Array.isArray(root.streams) ? root.streams : [];
  const decoderConfigs = new Map<number, Uint8Array>();
  const timebases = new Map<number, RationalTimebase>();
  const tracks: NormalizedTrack[] = [];
  const trackIndexes: number[] = [];

  for (let fallbackIndex = 0; fallbackIndex < streams.length; fallbackIndex++) {
    const stream = record(streams[fallbackIndex]);
    const type = trackType(stream.codec_type);
    const codecRaw = string(stream.codec_name) ?? 'unknown';
    const codec = canonicalCodec(codecRaw);
    const index = integer(stream.index) ?? fallbackIndex;
    trackIndexes.push(index);
    const track: NormalizedTrack & Record<string, unknown> = {
      type,
      codec,
      ...(string(stream.codec_tag_string) && string(stream.codec_tag_string) !== '[0][0][0][0]'
        ? { nativeCodecTag: string(stream.codec_tag_string)! }
        : {}),
      bitrate: finite(stream.bit_rate) ?? null,
      language: string(record(stream.tags).language) ?? null,
      codecRaw,
    };
    if (type === 'video') {
      const width = integer(stream.width);
      const height = integer(stream.height);
      if (width && width > 0) track.width = width;
      if (height && height > 0) track.height = height;
      const rate = frameRateEvidence(stream);
      if (rate.fps !== undefined) track.fps = rate.fps;
      if (rate.provenance !== undefined) track.fpsProvenance = rate.provenance;
      const rotation = rotationFromStream(stream);
      if (rotation !== undefined) track.rotation = rotation;
    } else if (type === 'audio') {
      const sampleRate = integer(stream.sample_rate);
      const channels = integer(stream.channels);
      if (sampleRate && sampleRate > 0) track.sampleRate = sampleRate;
      if (channels && channels > 0) track.channels = channels;
      const profile = (string(stream.profile) ?? '').toLowerCase();
      if (profile.includes('he-aac')) {
        track.sbrPresent = true;
        if (profile.includes('v2')) track.psPresent = true;
      }
    }
    const timebase = parseRational(string(stream.time_base));
    if (timebase) {
      timebases.set(index, { numerator: timebase.numerator, denominator: timebase.denominator });
      track.timebaseTickUs = (timebase.numerator / timebase.denominator) * 1_000_000;
    }
    const mediaDuration = finite(stream.duration);
    if (mediaDuration !== undefined) track.mediaDurationSec = mediaDuration;
    const startTime = finite(stream.start_time);
    if (startTime !== undefined) track.presentationStartSec = startTime;
    const initialPadding = integer(stream.initial_padding);
    const trailingPadding = integer(stream.trailing_padding);
    if (initialPadding !== undefined) track.primingSamples = initialPadding;
    if (trailingPadding !== undefined) track.remainderSamples = trailingPadding;
    const config = parseFfprobeHexDump(string(stream.extradata));
    if (config && config.byteLength > 0) decoderConfigs.set(index, config);
    tracks.push(track);
  }

  const duration = finite(format.duration);
  const tags = stringMap(record(format.tags));
  const metadata: NormalizedMetadata & Record<string, unknown> = {
    container,
    durationSec: duration ?? null,
    tracks,
    ...(Object.keys(tags).length > 0 ? { tags } : {}),
  };
  const start = finite(format.start_time);
  if (start !== undefined) metadata.presentationStartSec = start;
  return { metadata, trackIndexes, decoderConfigs, timebases, rawDigestInput: text };
}

export interface ObservedFrameTime {
  ptsUs: number;
  durationUs?: number;
  keyframe: boolean;
}

export function parseFfprobeFramesJson(text: string): ObservedFrameTime[] {
  const root = parseRecord(text, 'ffprobe frame JSON');
  const frames = Array.isArray(root.frames) ? root.frames : [];
  const out: ObservedFrameTime[] = [];
  for (const value of frames) {
    const frame = record(value);
    const ptsSec = finite(frame.best_effort_timestamp_time) ?? finite(frame.pts_time) ?? finite(frame.pkt_pts_time);
    if (ptsSec === undefined) continue;
    const durationSec = finite(frame.pkt_duration_time) ?? finite(frame.duration_time);
    out.push({
      ptsUs: Math.round(ptsSec * 1_000_000),
      ...(durationSec !== undefined && durationSec >= 0 ? { durationUs: Math.round(durationSec * 1_000_000) } : {}),
      keyframe: integer(frame.key_frame) === 1,
    });
  }
  return out.sort((a, b) => a.ptsUs - b.ptsUs);
}

/** Replace rate-candidate heuristics with bounded observed presentation cadence when available. */
export function applyObservedFrameCadence(
  metadata: NormalizedMetadata,
  frames: readonly ObservedFrameTime[],
): NormalizedMetadata {
  const track = metadata.tracks.find((item) => item.type === 'video');
  if (!track || frames.length < 2) return metadata;
  const deltas: number[] = [];
  for (let index = 1; index < frames.length; index++) {
    const delta = frames[index]!.ptsUs - frames[index - 1]!.ptsUs;
    if (delta > 0) deltas.push(delta);
  }
  if (deltas.length === 0) return metadata;
  const sorted = [...deltas].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const minDelta = sorted[0]!;
  const maxDelta = sorted.at(-1)!;
  const lastDuration = frames.at(-1)!.durationUs;
  const observedIntervalUs = frames.at(-1)!.ptsUs - frames[0]!.ptsUs +
    (lastDuration !== undefined && lastDuration > 0 ? lastDuration : median);
  if (observedIntervalUs <= 0) return metadata;
  const fps = frames.length * 1_000_000 / observedIntervalUs;
  const toleranceUs = Math.max(2, median * 0.005);
  const cadence = maxDelta - minDelta <= toleranceUs ? 'CFR' : 'VFR';
  track.fps = fps;
  track.fpsProvenance = {
    source: 'observed',
    cadence,
    sampleCount: frames.length,
    observedIntervalUs,
    ...(track.fpsProvenance?.rational ? { rational: track.fpsProvenance.rational } : {}),
    envelope: {
      minFps: 1_000_000 / maxDelta,
      maxFps: 1_000_000 / minDelta,
    },
  };
  return metadata;
}

export function representationForTracks(
  container: string,
  tracks: NormalizedTrack[],
  decoderConfigs: ReadonlyMap<number, Uint8Array>,
  timebases: ReadonlyMap<number, RationalTimebase>,
  sourceTrackIndexes: readonly number[] = tracks.map((_, index) => index),
): DemuxTrackRepresentation[] {
  return tracks.map((track, trackIndex): DemuxTrackRepresentation => {
    const sourceTrackIndex = sourceTrackIndexes[trackIndex] ?? trackIndex;
    const config = decoderConfigs.get(sourceTrackIndex);
    const common = {
      trackIndex,
      packetOrdering: 'decode' as const,
      ...(timebases.get(sourceTrackIndex) ? { timebase: timebases.get(sourceTrackIndex)! } : {}),
      accessUnitGrouping: 'one-packet-per-chunk' as const,
      ...(track.nativeCodecTag ? { nativeCodecTag: track.nativeCodecTag } : {}),
    };
    if (track.codec === 'h264') {
      if (container === 'ts' || container === 'hls') {
        return { ...common, framing: 'annexb', parameterSetLocation: 'in-band' };
      }
      if (!config) throw new Error('structured probe did not expose AVCDecoderConfigurationRecord');
      return {
        ...common,
        framing: 'avc',
        parameterSetLocation: 'description',
        description: new Uint8Array(config),
        descriptionRecord: 'avc-decoder-configuration-record',
      };
    }
    if (track.codec === 'hevc') {
      if (container === 'ts' || container === 'hls') {
        return { ...common, framing: 'annexb', parameterSetLocation: 'in-band' };
      }
      if (!config) throw new Error('structured probe did not expose HEVCDecoderConfigurationRecord');
      return {
        ...common,
        framing: 'hevc',
        parameterSetLocation: 'description',
        description: new Uint8Array(config),
        descriptionRecord: 'hevc-decoder-configuration-record',
      };
    }
    if (track.codec === 'aac') {
      return {
        ...common,
        framing: container === 'adts' || container === 'ts' || container === 'hls' ? 'adts' : 'raw',
        parameterSetLocation: config ? 'description' : 'not-applicable',
        ...(config
          ? { description: new Uint8Array(config), descriptionRecord: 'audio-specific-config' as const }
          : {}),
      };
    }
    return {
      ...common,
      framing: track.codec === 'vp8' || track.codec === 'vp9' ? 'codec-private' : 'raw',
      parameterSetLocation: config ? 'description' : 'not-applicable',
      ...(config
        ? { description: new Uint8Array(config), descriptionRecord: 'codec-private' as const }
        : {}),
    };
  });
}

/** Split an extracted elementary file without losing header bytes; concatenation is byte-identical. */
export function splitPreparedBytes(bytes: Uint8Array, packets: PacketInfo[]): Uint8Array[] {
  if (packets.length === 0) return bytes.byteLength > 0 ? [new Uint8Array(bytes)] : [];
  const payloadTotal = packets.reduce((sum, packet) => sum + packet.size, 0);
  if (payloadTotal > bytes.byteLength) return [new Uint8Array(bytes)];
  const prefix = bytes.byteLength - payloadTotal;
  const out: Uint8Array[] = [];
  let offset = 0;
  for (let index = 0; index < packets.length; index++) {
    const length = packets[index]!.size + (index === 0 ? prefix : 0);
    out.push(bytes.slice(offset, offset + length));
    offset += length;
  }
  if (offset !== bytes.byteLength) return [new Uint8Array(bytes)];
  return out;
}

/** Preserve one complete ADTS frame per chunk; demux packet sizes exclude the 7/9-byte headers. */
export function splitAdtsFrames(bytes: Uint8Array): Uint8Array[] {
  const frames: Uint8Array[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    if (offset + 7 > bytes.length || bytes[offset] !== 0xff || (bytes[offset + 1]! & 0xf6) !== 0xf0) {
      return [];
    }
    const frameLength = ((bytes[offset + 3]! & 0x03) << 11) |
      (bytes[offset + 4]! << 3) |
      (bytes[offset + 5]! >> 5);
    if (frameLength < 7 || offset + frameLength > bytes.length) return [];
    frames.push(bytes.slice(offset, offset + frameLength));
    offset += frameLength;
  }
  return frames;
}

function frameRateEvidence(stream: Record<string, unknown>): {
  fps?: number;
  provenance?: FrameRateProvenance;
} {
  const average = parseRational(string(stream.avg_frame_rate));
  const nominal = parseRational(string(stream.r_frame_rate));
  const sampleCount = integer(stream.nb_read_frames) ?? integer(stream.nb_frames);
  const durationSec = finite(stream.duration);
  if (sampleCount !== undefined && sampleCount > 0 && durationSec !== undefined && durationSec > 0) {
    const fps = sampleCount / durationSec;
    const nominalRate = nominal ? nominal.numerator / nominal.denominator : undefined;
    const averageRate = average ? average.numerator / average.denominator : fps;
    return {
      fps: averageRate,
      provenance: {
        source: 'average',
        cadence:
          nominalRate !== undefined && Math.abs(nominalRate - averageRate) <= 0.01 ? 'CFR' : 'UNKNOWN',
        sampleCount,
        observedIntervalUs: Math.round(durationSec * 1_000_000),
        ...(average ? { rational: average } : {}),
        ...(nominalRate !== undefined && Math.abs(nominalRate - averageRate) > 0.01
          ? { envelope: { minFps: Math.min(averageRate, nominalRate), maxFps: Math.max(averageRate, nominalRate) } }
          : {}),
      },
    };
  }
  const selected = average ?? nominal;
  if (!selected) return {};
  return {
    fps: selected.numerator / selected.denominator,
    provenance: { source: 'nominal', cadence: 'UNKNOWN', rational: selected },
  };
}

function parseRational(value: string | undefined): { numerator: number; denominator: number } | undefined {
  if (!value) return undefined;
  const match = /^(-?\d+)\/(\d+)$/.exec(value.trim());
  if (!match) return undefined;
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || numerator <= 0 || denominator <= 0) {
    return undefined;
  }
  return { numerator, denominator };
}

function parseFfprobeHexDump(value: string | undefined): Uint8Array | undefined {
  if (!value) return undefined;
  const hex = value
    .split(/\r?\n/)
    .map((line) => {
      const match = /^\s*[0-9a-fA-F]+:\s*((?:[0-9a-fA-F]{2,4}\s*)+)/.exec(line);
      return match?.[1]?.replace(/\s/g, '') ?? '';
    })
    .join('');
  if (!hex || hex.length % 2 !== 0) return undefined;
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function rotationFromStream(stream: Record<string, unknown>): number | undefined {
  const tags = record(stream.tags);
  const direct = finite(tags.rotate);
  if (direct !== undefined) return ((direct % 360) + 360) % 360;
  const sideData = Array.isArray(stream.side_data_list) ? stream.side_data_list : [];
  for (const item of sideData) {
    const rotation = finite(record(item).rotation);
    if (rotation !== undefined) return ((rotation % 360) + 360) % 360;
  }
  return undefined;
}

function parseRecord(text: string, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is malformed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 && value !== 'N/A' ? value : undefined;
}

function finite(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function integer(value: unknown): number | undefined {
  const parsed = finite(value);
  return parsed !== undefined && Number.isSafeInteger(parsed) ? parsed : undefined;
}

function trackType(value: unknown): NormalizedTrack['type'] {
  return value === 'video' || value === 'audio' || value === 'subtitle' ? value : 'other';
}

function stringMap(value: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string') out[key] = item;
  }
  return out;
}

function checkedBytes(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`byte count must be a non-negative safe integer, got ${value}`);
  return value;
}
