import type { Scenario } from '../../core/scenario.ts';
import { readPcmStructure } from '../audio-dsp/readers.ts';
import { readNeutralRemuxProgram } from '../remux/readers.ts';
import type {
  RemuxProgramEvidence,
  RemuxReadResult,
  RemuxSampleEvidence,
  RemuxTrackEvidence,
} from '../remux/types.ts';
import { muxError, muxVerdict, type MuxDecision } from './types.ts';

export const MUX_TARGET_CONTRACT_SCHEMA = 'media-test/mux-target-contract@1' as const;

export const MUX_ADVERTISED_WRITE_TARGETS = Object.freeze([
  'mp4', 'mov', 'mkv', 'webm', 'ogg', 'wav', 'adts', 'mp3', 'ts',
] as const);

export type MuxAdvertisedWriteTarget = (typeof MUX_ADVERTISED_WRITE_TARGETS)[number];

const TARGETS = new Set<string>(MUX_ADVERTISED_WRITE_TARGETS);

export interface MuxExpectedTrack {
  readonly type: 'video' | 'audio';
  readonly codec: string;
  readonly requireCodecPrivate?: boolean;
}

export interface MuxTargetSemanticContract {
  readonly schema: typeof MUX_TARGET_CONTRACT_SCHEMA;
  readonly container: MuxAdvertisedWriteTarget;
  readonly tracks: readonly MuxExpectedTrack[];
  readonly expectedDurationUs?: number;
  readonly durationToleranceUs: number;
}

/** One neutral, typed reader boundary for every target actually advertised by mux scenarios. */
export function readNeutralMuxTarget(bytes: Uint8Array, target: string): RemuxReadResult {
  const container = canonicalContainer(target);
  if (!TARGETS.has(container)) {
    return {
      state: 'UNSUPPORTED_FORMAT',
      reasonCode: 'MUX_TARGET_READER_UNSUPPORTED',
      evidence: { reader: 'mux-target-dispatch', byteLength: bytes?.byteLength ?? 0, containerHint: target },
    };
  }
  if (container !== 'wav') return readNeutralRemuxProgram(bytes, container);
  return readWaveProgram(bytes);
}

/** Build the decisive target-reader contract for ordinary mux scenario definitions. */
export function muxTargetContractFromScenario(
  scenario: Pick<Scenario, 'id' | 'op' | 'options' | 'requires'>,
): MuxTargetSemanticContract | undefined {
  if (scenario.op !== 'mux' || !isRecord(scenario.options) || typeof scenario.options.container !== 'string') return undefined;
  const options: Record<string, unknown> = scenario.options;
  const container = canonicalContainer(options.container as string);
  if (!TARGETS.has(container)) return undefined;
  const selectors = Array.isArray(options.trackSelect)
    ? options.trackSelect.filter((value): value is string => typeof value === 'string')
    : [];
  const video = [...(scenario.requires.videoCodecs ?? [])];
  const audio = [...(scenario.requires.audioCodecs ?? [])];
  const tracks: MuxExpectedTrack[] = [];
  if (scenario.id === 'mux/edge_multitrack_keep_all_to_mp4') {
    tracks.push(
      expectedTrack('video', video[0] ?? 'h264', container),
      expectedTrack('audio', audio[0] ?? 'aac', container),
      expectedTrack('audio', audio[0] ?? 'aac', container),
    );
  } else if (selectors.length > 0) {
    let videoOrdinal = 0;
    let audioOrdinal = 0;
    for (const selector of selectors) {
      const type = /^(video|audio):/.exec(selector)?.[1];
      if (type === 'video') tracks.push(expectedTrack(type, video[videoOrdinal++] ?? video[0] ?? 'unknown', container));
      if (type === 'audio') tracks.push(expectedTrack(type, audio[audioOrdinal++] ?? audio[0] ?? 'unknown', container));
    }
  } else {
    tracks.push(...video.map((codec) => expectedTrack('video', codec, container)));
    tracks.push(...audio.map((codec) => expectedTrack('audio', codec, container)));
  }
  return Object.freeze({
    schema: MUX_TARGET_CONTRACT_SCHEMA,
    container: container as MuxAdvertisedWriteTarget,
    tracks: Object.freeze(tracks),
    durationToleranceUs: 125_000,
  });
}

function expectedTrack(
  type: 'video' | 'audio',
  codec: string,
  container: string,
): MuxExpectedTrack {
  const normalized = canonicalCodec(codec);
  const requireCodecPrivate =
    ((container === 'mp4' || container === 'mov') && (normalized === 'h264' || normalized === 'hevc' || normalized === 'av1')) ||
    ((container === 'mkv' || container === 'webm') &&
      (normalized === 'h264' || normalized === 'hevc' || normalized === 'av1' || normalized === 'aac' ||
       normalized === 'opus' || normalized === 'vorbis' || normalized === 'flac')) ||
    (container === 'ogg' && (normalized === 'opus' || normalized === 'vorbis' || normalized === 'flac'));
  return Object.freeze({ type, codec, ...(requireCodecPrivate ? { requireCodecPrivate: true } : {}) });
}

/** Malformed candidate bytes are FAIL; missing reader implementation is harness ERROR, never NA_ASSET. */
export function assessMuxTargetSemantics(
  bytes: Uint8Array,
  contract: MuxTargetSemanticContract,
): MuxDecision {
  if (contract.schema !== MUX_TARGET_CONTRACT_SCHEMA) {
    return muxError('MUX_TARGET_CONTRACT_SCHEMA_INVALID', 'mux target semantic contract schema is invalid');
  }
  if (!TARGETS.has(canonicalContainer(contract.container))) {
    return muxError(
      'MUX_TARGET_READER_COVERAGE_ERROR',
      `no neutral reader is registered for advertised target '${contract.container}'`,
    );
  }
  const read = readNeutralMuxTarget(bytes, contract.container);
  if (read.state !== 'OK') {
    const detail = `${contract.container} neutral reader ${read.state} [${read.reasonCode}]`;
    return read.state === 'MALFORMED' || read.state === 'INCOMPLETE' || read.state === 'UNSUPPORTED_FORMAT'
      ? muxVerdict('FAIL', 'MUX_TARGET_BYTES_INVALID', detail)
      : muxError('MUX_TARGET_READER_COVERAGE_ERROR', detail);
  }
  const program = read.value;
  const measuredTracks = program.tracks.filter((track) => track.type === 'video' || track.type === 'audio');
  const measurements: Record<string, number> = {
    outputBytes: bytes.byteLength,
    expectedTracks: contract.tracks.length,
    measuredTracks: measuredTracks.length,
    measuredSamples: measuredTracks.reduce((sum, track) => sum + track.samples.length, 0),
  };
  if (canonicalContainer(program.container) !== contract.container) {
    return muxVerdict(
      'FAIL',
      'MUX_TARGET_CONTAINER_MISMATCH',
      `reader detected '${program.container}', expected '${contract.container}'`,
      measurements,
    );
  }
  if (measuredTracks.length !== contract.tracks.length) {
    return muxVerdict(
      'FAIL',
      'MUX_TARGET_TRACK_COUNT_MISMATCH',
      `reader found ${measuredTracks.length} media track(s), expected ${contract.tracks.length}`,
      measurements,
    );
  }
  const unused = new Set(measuredTracks.map((_, index) => index));
  for (const expected of contract.tracks) {
    const matches = [...unused].filter((index) => {
      const got = measuredTracks[index]!;
      return got.type === expected.type && canonicalCodec(got.codec) === canonicalCodec(expected.codec) &&
        (!expected.requireCodecPrivate || !!got.codecPrivate?.byteLength);
    });
    if (matches.length !== 1) {
      return muxVerdict(
        'FAIL',
        'MUX_TARGET_TRACK_SEMANTICS_MISMATCH',
        `expected one ${expected.type}/${canonicalCodec(expected.codec)} track, matched ${matches.length}`,
        measurements,
      );
    }
    const got = measuredTracks[matches[0]!]!;
    if (got.samples.length === 0 || got.samples.some((sample) => sample.payload.byteLength === 0)) {
      return muxVerdict('FAIL', 'MUX_TARGET_MEDIA_MISSING', `${got.id} has no complete coded/PCM samples`, measurements);
    }
    unused.delete(matches[0]!);
  }
  if (contract.expectedDurationUs !== undefined) {
    if (program.durationUs === undefined) {
      return muxVerdict('FAIL', 'MUX_TARGET_DURATION_MISSING', 'neutral reader could not establish output duration', measurements);
    }
    const delta = Math.abs(program.durationUs - contract.expectedDurationUs);
    measurements.durationDeltaUs = delta;
    measurements.durationToleranceUs = contract.durationToleranceUs;
    if (delta > contract.durationToleranceUs) {
      return muxVerdict(
        'FAIL',
        'MUX_TARGET_DURATION_MISMATCH',
        `duration delta ${delta}µs exceeds ${contract.durationToleranceUs}µs`,
        measurements,
      );
    }
  }
  return muxVerdict(
    'PASS',
    'MUX_TARGET_SEMANTIC_REIMPORT_VALID',
    `${contract.container}: ${measuredTracks.length} expected track(s), ` +
      `${measurements.measuredSamples} complete sample(s), structural reader decisive`,
    measurements,
  );
}

function readWaveProgram(bytes: Uint8Array): RemuxReadResult {
  const read = readPcmStructure(bytes, 'wav');
  if (read.state !== 'OK') {
    return {
      state: read.state,
      reasonCode: read.reasonCode,
      evidence: {
        reader: 'mux-wave',
        byteLength: bytes?.byteLength ?? 0,
        containerHint: 'wav',
        detectedContainer: read.evidence.detectedFormat,
        markers: read.evidence.markers,
      },
    };
  }
  const pcm = read.value;
  const samples: RemuxSampleEvidence[] = pcm.dataSpans.map((span, index) => ({
    payload: bytes.subarray(span.offset, span.offset + span.byteLength),
    ptsUs: index === 0 ? 0 : undefined,
    durationUs: index === pcm.dataSpans.length - 1 ? Math.round(pcm.durationSec * 1_000_000) : undefined,
    keyframe: true,
    fileOffset: span.offset,
    framing: 'raw',
  }));
  const track: RemuxTrackEvidence = {
    id: 'wav:0',
    type: 'audio',
    codec: pcm.codec,
    sampleRate: pcm.sampleRate,
    channels: pcm.channels,
    timescale: pcm.sampleRate,
    samples,
  };
  const value: RemuxProgramEvidence = {
    schema: 'media-test/remux-program@1',
    container: 'wav',
    byteLength: bytes.byteLength,
    durationUs: Math.round(pcm.durationSec * 1_000_000),
    tracks: [track],
    representation: {},
  };
  return {
    state: 'OK',
    value,
    evidence: {
      reader: 'mux-wave',
      byteLength: bytes.byteLength,
      containerHint: 'wav',
      detectedContainer: 'wav',
      parsedTracks: 1,
      parsedSamples: samples.length,
      markers: read.evidence.markers,
    },
  };
}

function canonicalContainer(value: string): string {
  const container = value.trim().toLowerCase();
  if (container === 'matroska') return 'mkv';
  if (container === 'quicktime') return 'mov';
  if (container === 'mpegts' || container === 'mpeg-ts') return 'ts';
  return container;
}

function canonicalCodec(value: string): string {
  const codec = value.trim().toLowerCase();
  if (/^(avc1|avc3)(\.|$)/.test(codec)) return 'h264';
  if (/^(hvc1|hev1)(\.|$)/.test(codec)) return 'hevc';
  if (/^mp4a\.40(?:\.|$)/.test(codec)) return 'aac';
  return codec;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
