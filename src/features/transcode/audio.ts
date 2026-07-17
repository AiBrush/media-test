import { readOutputStructureResult } from '../../core/box-readers.ts';
import { decodeNativePcm, readPcmStructure } from '../audio-dsp/index.ts';
import { demuxMp4GaplessAudio, demuxMp4Tracks } from '../../engines/platform/demux-mp4.ts';
import { demuxWebmTracks } from '../../engines/platform/demux-webm.ts';
import { readFlacProgram } from '../remux/reader-flac.ts';
import { readOggProgram } from '../remux/reader-ogg.ts';
import {
  transcodeError,
  transcodeUnavailable,
  transcodeVerdict,
  type TranscodeDecision,
} from './types.ts';

export const TRANSCODE_AUDIO_SCHEMA = 'media-test/transcode-audio@1' as const;

export type AudioTimelineEvidence =
  | Readonly<{
      kind: 'whole-program';
      presentationSampleFrames: number;
    }>
  | Readonly<{
      kind: 'aac-isobmff';
      codedSampleFrames: number;
      primingFrames: number;
      remainderFrames: number;
      presentationSampleFrames: number;
      editListMediaStartFrame: number;
      timingSource: 'edit-list' | 'media-timeline';
    }>
  | Readonly<{
      kind: 'opus-ogg';
      codedSampleFrames: number;
      preSkipFrames: number;
      endTrimFrames: number;
      finalGranulePosition: number;
      presentationSampleFrames: number;
    }>
  | Readonly<{
      kind: 'opus-webm';
      codedSampleFrames: number;
      preSkipFrames: number;
      endTrimFrames: number;
      codecDelayNs: number;
      discardPaddingNs: number;
      presentationSampleFrames: number;
    }>;

export interface TranscodeAudioStructure {
  readonly schema: typeof TRANSCODE_AUDIO_SCHEMA;
  readonly container: string;
  readonly codec: string;
  readonly sampleRate: number;
  readonly channels: number;
  readonly sampleFrames?: number;
  readonly timeline?: AudioTimelineEvidence;
  readonly reader: string;
}

export type TranscodeAudioStructureResult =
  | Readonly<{ state: 'OK'; value: TranscodeAudioStructure }>
  | Readonly<{
      state: 'UNSUPPORTED_FORMAT' | 'UNSUPPORTED_STRUCTURE' | 'MALFORMED' | 'INCOMPLETE';
      reasonCode: string;
      detail: string;
    }>;

export interface DecodedAudioSignal {
  readonly sampleRate: number;
  readonly channels: number;
  readonly sampleFrames: number;
  readonly samples: Float64Array;
  /** Whether the decoder exposed coded frames or already applied the authored presentation trim. */
  readonly timelineDomain: 'coded' | 'presentation';
  readonly timeline?: AudioTimelineEvidence;
}

export interface LosslessAudioContract {
  readonly kind: 'lossless';
  readonly maximumAbsoluteError: number;
  readonly sampleFrameTolerance: number;
  readonly requireExplicitTimeline: boolean;
  readonly channelTransform?: 'stereo-to-mono-average';
}

export interface LossyAudioContract {
  readonly kind: 'lossy';
  readonly minimumSnrDb: number;
  readonly maximumRmsError: number;
  readonly minimumChannelCorrelation: number;
  readonly sampleFrameTolerance: number;
  readonly requireExplicitTimeline: boolean;
  readonly channelTransform?: 'stereo-to-mono-average';
}

export type TranscodeAudioContentContract = LosslessAudioContract | LossyAudioContract;

/** Neutral structural coverage for every audio write target used by the transcode family. */
export function readTranscodeAudioStructure(
  bytes: Uint8Array,
  containerHint?: string,
): TranscodeAudioStructureResult {
  const hint = canonicalContainer(containerHint);
  try {
    if (hint === 'wav' || looksLikeWave(bytes)) return readWave(bytes);
    if (hint === 'flac' || ascii(bytes, 0, 4) === 'fLaC') return readFlac(bytes);
    if (hint === 'ogg' || ascii(bytes, 0, 4) === 'OggS') return readOgg(bytes);
    if (hint === 'mp4' || looksLikeIsoBmff(bytes)) return readMp4(bytes);
    if (hint === 'webm' || hint === 'mkv' || looksLikeEbml(bytes)) return readWebm(bytes, hint || 'webm');
    return {
      state: 'UNSUPPORTED_FORMAT',
      reasonCode: 'TRANSCODE_AUDIO_FORMAT_UNSUPPORTED',
      detail: `neutral audio reader does not recognize '${containerHint ?? 'sniffed bytes'}'`,
    };
  } catch (error) {
    return {
      state: 'MALFORMED',
      reasonCode: 'TRANSCODE_AUDIO_PARSE_GUARD',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export function decodedPcmFromContainer(
  bytes: Uint8Array,
  containerHint?: string,
): DecodedAudioSignal | undefined {
  const decoded = decodeNativePcm(bytes, { ...(containerHint ? { containerHint } : {}) });
  if (decoded.state !== 'OK') return undefined;
  return Object.freeze({
    sampleRate: decoded.value.sampleRate,
    channels: decoded.value.channels,
    sampleFrames: decoded.value.decodedSampleFrames,
    samples: decoded.value.samples,
    timelineDomain: 'presentation' as const,
    timeline: {
      kind: 'whole-program' as const,
      presentationSampleFrames: decoded.value.decodedSampleFrames,
    },
  });
}

/** Compare the intended program interval only; undeclared codec delay is never guessed away. */
export function evaluateTranscodedAudioContent(
  source: DecodedAudioSignal,
  candidate: DecodedAudioSignal,
  contract: TranscodeAudioContentContract,
): TranscodeDecision {
  const sourceValidation = validateDecodedSignal(source, 'source');
  if (sourceValidation) return sourceValidation;
  const candidateValidation = validateDecodedSignal(candidate, 'candidate');
  if (candidateValidation) return candidateValidation;
  if (source.sampleRate !== candidate.sampleRate) {
    return transcodeVerdict(
      'FAIL',
      'TRANSCODE_AUDIO_SAMPLE_RATE_MISMATCH',
      `candidate ${candidate.sampleRate}Hz vs source program ${source.sampleRate}Hz`,
    );
  }
  const expectedChannels = contract.channelTransform === 'stereo-to-mono-average' ? 1 : source.channels;
  if (contract.channelTransform === 'stereo-to-mono-average' && source.channels !== 2) {
    return transcodeUnavailable(
      'NA_ASSET',
      'TRANSCODE_AUDIO_DOWNMIX_SOURCE_NOT_STEREO',
      `stereo-to-mono contract received ${source.channels} source channel(s)`,
    );
  }
  if (expectedChannels !== candidate.channels) {
    return transcodeVerdict(
      'FAIL',
      'TRANSCODE_AUDIO_CHANNEL_COUNT_MISMATCH',
      `candidate ${candidate.channels} channel(s) vs expected program ${expectedChannels}`,
    );
  }

  const sourceWindow = presentationWindow(source, false);
  if (sourceWindow.state !== 'OK') return sourceWindow.decision;
  const candidateWindow = presentationWindow(candidate, contract.requireExplicitTimeline);
  if (candidateWindow.state !== 'OK') return candidateWindow.decision;
  const sourceFrames = sourceWindow.endFrame - sourceWindow.startFrame;
  const candidateFrames = candidateWindow.endFrame - candidateWindow.startFrame;
  const frameDelta = candidateFrames - sourceFrames;
  const measurements: Record<string, number> = {
    sourceSampleFrames: sourceFrames,
    candidateSampleFrames: candidateFrames,
    sampleFrameDelta: frameDelta,
    sampleRate: source.sampleRate,
    channels: expectedChannels,
  };
  if (Math.abs(frameDelta) > contract.sampleFrameTolerance) {
    return transcodeVerdict(
      'FAIL',
      frameDelta > 0 ? 'TRANSCODE_AUDIO_EXCESS_SAMPLES' : 'TRANSCODE_AUDIO_LOST_SAMPLES',
      `candidate program interval differs by ${frameDelta} sample frame(s); ` +
        `declared tolerance is ${contract.sampleFrameTolerance}`,
      measurements,
    );
  }

  const comparedFrames = Math.min(sourceFrames, candidateFrames);
  const comparedScalarSamples = comparedFrames * expectedChannels;
  let signalPower = 0;
  let errorPower = 0;
  let maximumAbsoluteError = 0;
  const channelCross = new Float64Array(expectedChannels);
  const channelSourcePower = new Float64Array(expectedChannels);
  const channelCandidatePower = new Float64Array(expectedChannels);
  for (let frame = 0; frame < comparedFrames; frame++) {
    for (let channel = 0; channel < expectedChannels; channel++) {
      const sourceIndex = (sourceWindow.startFrame + frame) * source.channels + channel;
      const candidateIndex = (candidateWindow.startFrame + frame) * candidate.channels + channel;
      const expected = contract.channelTransform === 'stereo-to-mono-average'
        ? (source.samples[sourceIndex]! + source.samples[sourceIndex + 1]!) / 2
        : source.samples[sourceIndex]!;
      const observed = candidate.samples[candidateIndex]!;
      const error = observed - expected;
      signalPower += expected * expected;
      errorPower += error * error;
      maximumAbsoluteError = Math.max(maximumAbsoluteError, Math.abs(error));
      channelCross[channel]! += expected * observed;
      channelSourcePower[channel]! += expected * expected;
      channelCandidatePower[channel]! += observed * observed;
    }
  }
  const rmsError = comparedScalarSamples > 0 ? Math.sqrt(errorPower / comparedScalarSamples) : Number.POSITIVE_INFINITY;
  const snrDb = errorPower === 0
    ? Number.POSITIVE_INFINITY
    : signalPower > 0
      ? 10 * Math.log10(signalPower / errorPower)
      : Number.NEGATIVE_INFINITY;
  const correlations = [...channelCross].map((cross, index) => {
    const denominator = Math.sqrt(channelSourcePower[index]! * channelCandidatePower[index]!);
    return denominator > 0 ? cross / denominator : 0;
  });
  const minimumChannelCorrelation = Math.min(...correlations);
  Object.assign(measurements, {
    comparedSampleFrames: comparedFrames,
    rmsError,
    maximumAbsoluteError,
    snrDb,
    minimumChannelCorrelation,
  });

  if (signalPower === 0) {
    return transcodeUnavailable(
      'NA_ASSET',
      'TRANSCODE_AUDIO_SOURCE_NOT_DISCRIMINATING',
      'source program interval is silent, so content preservation cannot be scored',
      measurements,
    );
  }
  if (contract.kind === 'lossless') {
    return maximumAbsoluteError <= contract.maximumAbsoluteError
      ? transcodeVerdict(
          'PASS',
          'TRANSCODE_AUDIO_LOSSLESS_MATCH',
          `${comparedFrames} sample frame(s) match after explicit presentation trimming`,
          measurements,
        )
      : transcodeVerdict(
          'FAIL',
          'TRANSCODE_AUDIO_LOSSLESS_CONTENT_MISMATCH',
          `maximum decoded-sample error ${maximumAbsoluteError} exceeds ${contract.maximumAbsoluteError}`,
          measurements,
        );
  }
  if (
    snrDb < contract.minimumSnrDb ||
    rmsError > contract.maximumRmsError ||
    minimumChannelCorrelation < contract.minimumChannelCorrelation
  ) {
    return transcodeVerdict(
      'FAIL',
      'TRANSCODE_AUDIO_LOSSY_CONTENT_MISMATCH',
      `decoded program SNR=${formatFinite(snrDb)}dB, RMS error=${formatFinite(rmsError)}, ` +
        `minimum channel correlation=${formatFinite(minimumChannelCorrelation)}; required ` +
        `SNR>=${contract.minimumSnrDb}, RMS<=${contract.maximumRmsError}, ` +
        `correlation>=${contract.minimumChannelCorrelation}`,
      measurements,
    );
  }
  return transcodeVerdict(
    'PASS',
    'TRANSCODE_AUDIO_LOSSY_CONTENT_MATCH',
    `${comparedFrames} sample frame(s) satisfy the documented decoded-error contract after explicit trimming`,
    measurements,
  );
}

function readWave(bytes: Uint8Array): TranscodeAudioStructureResult {
  const result = readPcmStructure(bytes, 'wav');
  if (result.state !== 'OK') {
    return {
      state: result.state,
      reasonCode: result.reasonCode,
      detail: result.detail,
    };
  }
  const value = result.value;
  return ok({
    container: value.container,
    codec: value.codec,
    sampleRate: value.sampleRate,
    channels: value.channels,
    sampleFrames: value.sampleFrames,
    timeline: { kind: 'whole-program', presentationSampleFrames: value.sampleFrames },
    reader: 'audio-dsp/pcm',
  });
}

function readFlac(bytes: Uint8Array): TranscodeAudioStructureResult {
  const result = readFlacProgram(bytes);
  if (result.state !== 'OK') {
    return { state: result.state, reasonCode: result.reasonCode, detail: 'neutral FLAC reader rejected output' };
  }
  const track = result.value.tracks.find((entry) => entry.type === 'audio');
  if (!track?.sampleRate || !track.channels) {
    return {
      state: 'MALFORMED',
      reasonCode: 'TRANSCODE_FLAC_AUDIO_TRACK_MISSING',
      detail: 'FLAC STREAMINFO did not expose a complete audio track',
    };
  }
  const sampleFrames = result.value.durationUs === undefined
    ? undefined
    : Math.round(result.value.durationUs * track.sampleRate / 1_000_000);
  return ok({
    container: 'flac',
    codec: 'flac',
    sampleRate: track.sampleRate,
    channels: track.channels,
    ...(sampleFrames !== undefined ? {
      sampleFrames,
      timeline: { kind: 'whole-program' as const, presentationSampleFrames: sampleFrames },
    } : {}),
    reader: 'remux/flac',
  });
}

function readOgg(bytes: Uint8Array): TranscodeAudioStructureResult {
  const result = readOggProgram(bytes);
  if (result.state !== 'OK') {
    return { state: result.state, reasonCode: result.reasonCode, detail: 'neutral Ogg reader rejected output' };
  }
  const track = result.value.tracks.find((entry) => entry.type === 'audio');
  if (!track?.sampleRate || !track.channels) {
    return {
      state: 'MALFORMED',
      reasonCode: 'TRANSCODE_OGG_AUDIO_TRACK_MISSING',
      detail: 'Ogg logical streams contain no supported audio program',
    };
  }
  if (track.codec === 'opus') {
    const timing = scanOggOpusTiming(bytes, track.id, track.codecPrivate);
    if (!timing) {
      return {
        state: 'UNSUPPORTED_STRUCTURE',
        reasonCode: 'TRANSCODE_OPUS_GRANULE_TIMING_UNAVAILABLE',
        detail: 'Opus packets do not provide a complete pre-skip/final-granule model',
      };
    }
    return ok({
      container: 'ogg', codec: 'opus', sampleRate: 48_000, channels: track.channels,
      sampleFrames: timing.presentationSampleFrames, timeline: timing, reader: 'remux/ogg+opus-granule',
    });
  }
  const sampleFrames = result.value.durationUs === undefined
    ? undefined
    : Math.round(result.value.durationUs * track.sampleRate / 1_000_000);
  return ok({
    container: 'ogg', codec: track.codec, sampleRate: track.sampleRate, channels: track.channels,
    ...(sampleFrames !== undefined ? {
      sampleFrames,
      timeline: { kind: 'whole-program' as const, presentationSampleFrames: sampleFrames },
    } : {}),
    reader: 'remux/ogg',
  });
}

function readMp4(bytes: Uint8Array): TranscodeAudioStructureResult {
  try {
    const track = demuxMp4GaplessAudio(bytes);
    const timing: AudioTimelineEvidence = {
      kind: 'aac-isobmff',
      codedSampleFrames: track.codedSampleFrames,
      primingFrames: track.primingFrames,
      remainderFrames: track.remainderFrames,
      presentationSampleFrames: track.presentationSampleFrames,
      editListMediaStartFrame: track.editListMediaStartFrame,
      timingSource: track.timingSource,
    };
    return ok({
      container: 'mp4', codec: track.config.codec, sampleRate: track.config.sampleRate,
      channels: track.config.channels, sampleFrames: track.presentationSampleFrames,
      timeline: timing, reader: 'platform/mp4-gapless',
    });
  } catch {
    try {
      const audio = demuxMp4Tracks(bytes).find((track) => track.kind === 'audio');
      if (audio) {
        const durationUs = audio.samples.reduce((max, sample) => Math.max(max, sample.ptsUs + sample.durationUs), 0);
        const sampleFrames = Math.round(durationUs * audio.config.sampleRate / 1_000_000);
        return ok({
          container: 'mp4', codec: audio.config.codec, sampleRate: audio.config.sampleRate,
          channels: audio.config.channels, sampleFrames,
          timeline: { kind: 'whole-program', presentationSampleFrames: sampleFrames },
          reader: 'platform/mp4',
        });
      }
    } catch {
      // Typed structure fallback below distinguishes malformed from merely unsupported sample entries.
    }
  }
  const genericEntry = readMp4AudioSampleEntry(bytes);
  if (genericEntry) {
    const structure = readOutputStructureResult(bytes, 'mp4');
    const durationSec = structure.state === 'OK' ? structure.value.durationSec : undefined;
    const sampleFrames = durationSec === undefined ? undefined : Math.round(durationSec * genericEntry.sampleRate);
    return ok({
      container: 'mp4', codec: genericEntry.codec, sampleRate: genericEntry.sampleRate,
      channels: genericEntry.channels,
      ...(sampleFrames !== undefined ? {
        sampleFrames,
        timeline: { kind: 'whole-program' as const, presentationSampleFrames: sampleFrames },
      } : {}),
      reader: 'transcode/mp4-audio-sample-entry',
    });
  }
  return readGenericStructure(bytes, 'mp4');
}

function readWebm(bytes: Uint8Array, container: string): TranscodeAudioStructureResult {
  try {
    const audio = demuxWebmTracks(bytes).find((track) => track.kind === 'audio');
    if (!audio) {
      return {
        state: 'MALFORMED', reasonCode: 'TRANSCODE_WEBM_AUDIO_TRACK_MISSING',
        detail: 'WebM/MKV contains no neutral-reader audio track',
      };
    }
    if (audio.config.codec === 'opus') {
      const timeline = scanWebmOpusTiming(bytes, audio.samples.map((sample) => sample.data));
      if (!timeline) {
        return {
          state: 'UNSUPPORTED_STRUCTURE',
          reasonCode: 'TRANSCODE_WEBM_OPUS_TIMING_UNAVAILABLE',
          detail: 'WebM Opus lacks a consistent CodecDelay/OpusHead packet timeline',
        };
      }
      return ok({
        container, codec: 'opus', sampleRate: 48_000, channels: audio.config.channels,
        sampleFrames: timeline.presentationSampleFrames, timeline,
        reader: 'platform/webm+opus-codec-delay',
      });
    }
    const firstPtsUs = audio.samples.reduce((min, sample) => Math.min(min, sample.ptsUs), Number.POSITIVE_INFINITY);
    const endPtsUs = audio.samples.reduce((max, sample) => Math.max(max, sample.ptsUs + sample.durationUs), 0);
    const durationUs = endPtsUs - firstPtsUs;
    const sampleFrames = Math.round(durationUs * audio.config.sampleRate / 1_000_000);
    return ok({
      container, codec: audio.config.codec, sampleRate: audio.config.sampleRate,
      channels: audio.config.channels, sampleFrames,
      timeline: { kind: 'whole-program', presentationSampleFrames: sampleFrames },
      reader: 'platform/webm',
    });
  } catch {
    return readGenericStructure(bytes, container);
  }
}

function readGenericStructure(bytes: Uint8Array, container: string): TranscodeAudioStructureResult {
  const structure = readOutputStructureResult(bytes, container);
  if (structure.state !== 'OK') {
    return {
      state: structure.state,
      reasonCode: structure.reasonCode,
      detail: `neutral ${container} structure reader rejected output`,
    };
  }
  const audio = structure.value.tracks.find((track) => track.type === 'audio');
  if (!audio?.codec) {
    return {
      state: 'UNSUPPORTED_STRUCTURE',
      reasonCode: 'TRANSCODE_AUDIO_PARAMETERS_UNAVAILABLE',
      detail: `${container} structure is readable but sample-rate/channel evidence is unavailable`,
    };
  }
  return {
    state: 'UNSUPPORTED_STRUCTURE',
    reasonCode: 'TRANSCODE_AUDIO_PARAMETERS_UNAVAILABLE',
    detail: `${container} structure identifies ${audio.codec}, but exposes neither sample rate nor channels`,
  };
}

function scanOggOpusTiming(
  bytes: Uint8Array,
  trackId: string,
  codecPrivate: Uint8Array | undefined,
): Extract<AudioTimelineEvidence, { kind: 'opus-ogg' }> | undefined {
  if (!codecPrivate || ascii(codecPrivate, 0, 8) !== 'OpusHead' || codecPrivate.byteLength < 12) return undefined;
  const serial = Number(trackId.split(':')[1]);
  if (!Number.isSafeInteger(serial)) return undefined;
  const preSkipFrames = u16le(codecPrivate, 10);
  let offset = 0;
  let pending: Uint8Array[] = [];
  let codedSampleFrames = 0;
  let packetIndex = 0;
  let finalGranulePosition: number | undefined;
  while (offset + 27 <= bytes.byteLength) {
    if (ascii(bytes, offset, 4) !== 'OggS') return undefined;
    const pageSerial = u32le(bytes, offset + 14);
    const segments = bytes[offset + 26]!;
    const headerEnd = offset + 27 + segments;
    if (headerEnd > bytes.byteLength) return undefined;
    let bodySize = 0;
    for (let index = 0; index < segments; index++) bodySize += bytes[offset + 27 + index]!;
    const pageEnd = headerEnd + bodySize;
    if (pageEnd > bytes.byteLength) return undefined;
    if (pageSerial === serial) {
      let body = headerEnd;
      for (let index = 0; index < segments; index++) {
        const size = bytes[offset + 27 + index]!;
        pending.push(bytes.subarray(body, body + size));
        body += size;
        if (size < 255) {
          const packet = join(pending);
          if (packetIndex >= 2) {
            const frames = opusPacketSamples(packet);
            if (frames === undefined) return undefined;
            codedSampleFrames += frames;
          }
          packetIndex++;
          pending = [];
        }
      }
      const granule = u64leSafe(bytes, offset + 6);
      if ((bytes[offset + 5]! & 4) !== 0 && granule !== undefined) finalGranulePosition = granule;
    }
    offset = pageEnd;
  }
  if (pending.length || finalGranulePosition === undefined || finalGranulePosition < preSkipFrames) return undefined;
  const presentationSampleFrames = finalGranulePosition - preSkipFrames;
  const endTrimFrames = codedSampleFrames - finalGranulePosition;
  if (presentationSampleFrames <= 0 || endTrimFrames < 0) return undefined;
  return {
    kind: 'opus-ogg', codedSampleFrames, preSkipFrames, endTrimFrames,
    finalGranulePosition, presentationSampleFrames,
  };
}

/** Matroska/WebM Opus uses OpusHead + CodecDelay and optional final DiscardPadding. */
function scanWebmOpusTiming(
  bytes: Uint8Array,
  packets: readonly Uint8Array[],
): Extract<AudioTimelineEvidence, { kind: 'opus-webm' }> | undefined {
  const segment = ebmlChildren(bytes, 0, bytes.byteLength).find((element) => element.id === EBML_ID.Segment);
  if (!segment) return undefined;
  const tracks = ebmlChildren(bytes, segment.bodyStart, segment.bodyEnd)
    .find((element) => element.id === EBML_ID.Tracks);
  if (!tracks) return undefined;

  let trackNumber: number | undefined;
  let codecPrivate: Uint8Array | undefined;
  let codecDelayNs: number | undefined;
  for (const entry of ebmlChildren(bytes, tracks.bodyStart, tracks.bodyEnd)) {
    if (entry.id !== EBML_ID.TrackEntry) continue;
    const fields = ebmlChildren(bytes, entry.bodyStart, entry.bodyEnd);
    const type = fields.find((field) => field.id === EBML_ID.TrackType);
    const codec = fields.find((field) => field.id === EBML_ID.CodecId);
    if (!type || readUnsignedBe(bytes, type.bodyStart, type.bodyEnd) !== 2 ||
        !codec || ascii(bytes, codec.bodyStart, codec.bodyEnd - codec.bodyStart) !== 'A_OPUS') continue;
    const number = fields.find((field) => field.id === EBML_ID.TrackNumber);
    const privateField = fields.find((field) => field.id === EBML_ID.CodecPrivate);
    const delay = fields.find((field) => field.id === EBML_ID.CodecDelay);
    if (!number || !privateField || !delay) return undefined;
    trackNumber = readUnsignedBe(bytes, number.bodyStart, number.bodyEnd);
    codecPrivate = bytes.slice(privateField.bodyStart, privateField.bodyEnd);
    codecDelayNs = readUnsignedBe(bytes, delay.bodyStart, delay.bodyEnd);
    break;
  }
  if (!Number.isSafeInteger(trackNumber) || !codecPrivate || codecPrivate.byteLength < 12 ||
      ascii(codecPrivate, 0, 8) !== 'OpusHead' || !Number.isSafeInteger(codecDelayNs)) return undefined;

  const preSkipFrames = u16le(codecPrivate, 10);
  const delayFrames = Math.round(codecDelayNs! * 48_000 / 1_000_000_000);
  if (Math.abs(delayFrames - preSkipFrames) > 1) return undefined;
  let codedSampleFrames = 0;
  for (const packet of packets) {
    const sampleFrames = opusPacketSamples(packet);
    if (sampleFrames === undefined) return undefined;
    codedSampleFrames += sampleFrames;
  }
  const discardPaddingNs = findWebmDiscardPaddingNs(bytes, segment, trackNumber!);
  if (discardPaddingNs === undefined || discardPaddingNs < 0) return undefined;
  const endTrimFrames = Math.round(discardPaddingNs * 48_000 / 1_000_000_000);
  const presentationSampleFrames = codedSampleFrames - preSkipFrames - endTrimFrames;
  if (presentationSampleFrames <= 0) return undefined;
  return {
    kind: 'opus-webm', codedSampleFrames, preSkipFrames, endTrimFrames,
    codecDelayNs: codecDelayNs!, discardPaddingNs, presentationSampleFrames,
  };
}

interface EbmlElement {
  readonly id: number;
  readonly bodyStart: number;
  readonly bodyEnd: number;
  readonly next: number;
}

const EBML_ID = {
  Segment: 0x18538067,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackNumber: 0xd7,
  TrackType: 0x83,
  CodecId: 0x86,
  CodecPrivate: 0x63a2,
  CodecDelay: 0x56aa,
  Cluster: 0x1f43b675,
  BlockGroup: 0xa0,
  Block: 0xa1,
  DiscardPadding: 0x75a2,
} as const;

function ebmlChildren(bytes: Uint8Array, start: number, end: number): EbmlElement[] {
  const output: EbmlElement[] = [];
  let offset = start;
  while (offset < end) {
    const id = readEbmlVint(bytes, offset, true);
    if (!id) break;
    const size = readEbmlVint(bytes, id.next, false);
    if (!size) break;
    const bodyStart = size.next;
    const bodyEnd = size.unknown ? end : bodyStart + size.value;
    if (bodyStart > end || bodyEnd > end || bodyEnd < bodyStart) break;
    output.push({ id: id.value, bodyStart, bodyEnd, next: bodyEnd });
    if (bodyEnd <= offset) break;
    offset = bodyEnd;
  }
  return output;
}

function readEbmlVint(
  bytes: Uint8Array,
  offset: number,
  keepMarker: boolean,
): { value: number; next: number; unknown: boolean } | undefined {
  const first = bytes[offset];
  if (first === undefined || first === 0) return undefined;
  let marker = 0x80;
  let length = 1;
  while (length <= 8 && (first & marker) === 0) {
    marker >>= 1;
    length++;
  }
  if (length > 8 || offset + length > bytes.byteLength) return undefined;
  let value = keepMarker ? first : first & (marker - 1);
  for (let index = 1; index < length; index++) value = value * 256 + bytes[offset + index]!;
  const maximum = 2 ** (7 * length) - 1;
  return { value, next: offset + length, unknown: !keepMarker && value === maximum };
}

function findWebmDiscardPaddingNs(
  bytes: Uint8Array,
  segment: EbmlElement,
  trackNumber: number,
): number | undefined {
  let finalPadding = 0;
  const visit = (start: number, end: number): boolean => {
    for (const element of ebmlChildren(bytes, start, end)) {
      if (element.id === EBML_ID.BlockGroup) {
        const fields = ebmlChildren(bytes, element.bodyStart, element.bodyEnd);
        const block = fields.find((field) => field.id === EBML_ID.Block);
        const padding = fields.find((field) => field.id === EBML_ID.DiscardPadding);
        if (!block || !padding) continue;
        const blockTrack = readEbmlVint(bytes, block.bodyStart, false);
        if (!blockTrack || blockTrack.value !== trackNumber) continue;
        const value = readSignedBe(bytes, padding.bodyStart, padding.bodyEnd);
        if (!Number.isSafeInteger(value)) return false;
        finalPadding = value;
      } else if (element.id === EBML_ID.Cluster) {
        if (!visit(element.bodyStart, element.bodyEnd)) return false;
      }
    }
    return true;
  };
  return visit(segment.bodyStart, segment.bodyEnd) ? finalPadding : undefined;
}

function readUnsignedBe(bytes: Uint8Array, start: number, end: number): number {
  if (start >= end || end - start > 7) return Number.NaN;
  let value = 0;
  for (let offset = start; offset < end; offset++) value = value * 256 + bytes[offset]!;
  return value;
}

function readSignedBe(bytes: Uint8Array, start: number, end: number): number {
  const unsigned = readUnsignedBe(bytes, start, end);
  if (!Number.isSafeInteger(unsigned)) return Number.NaN;
  const bits = (end - start) * 8;
  const sign = 2 ** (bits - 1);
  return unsigned >= sign ? unsigned - 2 ** bits : unsigned;
}

function presentationWindow(
  signal: DecodedAudioSignal,
  requireExplicitTimeline: boolean,
):
  | { state: 'OK'; startFrame: number; endFrame: number }
  | { state: 'BLOCKED'; decision: TranscodeDecision } {
  const timing = signal.timeline;
  if (!timing || (requireExplicitTimeline && timing.kind === 'whole-program')) {
    return requireExplicitTimeline
      ? {
          state: 'BLOCKED',
          decision: transcodeUnavailable(
            'NA_ASSET',
            'TRANSCODE_AUDIO_TIMELINE_EVIDENCE_MISSING',
            'codec-delay/trim evidence is mandatory for this target; a whole-program count is not AAC/Opus timing evidence',
          ),
        }
      : { state: 'OK', startFrame: 0, endFrame: signal.sampleFrames };
  }
  const presentationFrames = timing.presentationSampleFrames;
  if (!Number.isSafeInteger(presentationFrames) || presentationFrames < 0) {
    return {
      state: 'BLOCKED',
      decision: transcodeError('TRANSCODE_AUDIO_TIMELINE_INVALID', 'presentation sample-frame count is invalid'),
    };
  }
  if (signal.timelineDomain === 'presentation') {
    if (signal.sampleFrames !== presentationFrames) {
      return {
        state: 'BLOCKED',
        decision: transcodeVerdict(
          'FAIL',
          'TRANSCODE_AUDIO_PRESENTATION_COUNT_MISMATCH',
          `decoder emitted ${signal.sampleFrames} presentation frame(s); container declares ${presentationFrames}`,
        ),
      };
    }
    return { state: 'OK', startFrame: 0, endFrame: presentationFrames };
  }
  if (timing.kind !== 'whole-program' && signal.sampleFrames !== timing.codedSampleFrames) {
    return {
      state: 'BLOCKED',
      decision: transcodeVerdict(
        'FAIL',
        'TRANSCODE_AUDIO_CODED_COUNT_MISMATCH',
        `decoder emitted ${signal.sampleFrames} coded frame(s); container timing declares ${timing.codedSampleFrames}`,
      ),
    };
  }
  let startFrame = 0;
  if (timing.kind === 'aac-isobmff') {
    if (timing.primingFrames !== timing.editListMediaStartFrame) {
      return {
        state: 'BLOCKED',
        decision: transcodeError(
          'TRANSCODE_AAC_PRIMING_EDIT_CONFLICT',
          `AAC priming ${timing.primingFrames} != edit-list start ${timing.editListMediaStartFrame}`,
        ),
      };
    }
    if (timing.codedSampleFrames - timing.primingFrames - timing.remainderFrames !== presentationFrames) {
      return {
        state: 'BLOCKED',
        decision: transcodeError('TRANSCODE_AAC_TIMELINE_INCONSISTENT', 'AAC coded/priming/remainder model is inconsistent'),
      };
    }
    startFrame = timing.primingFrames;
  } else if (timing.kind === 'opus-ogg' || timing.kind === 'opus-webm') {
    if (timing.codedSampleFrames - timing.preSkipFrames - timing.endTrimFrames !== presentationFrames ||
        (timing.kind === 'opus-ogg' &&
          timing.finalGranulePosition - timing.preSkipFrames !== presentationFrames)) {
      return {
        state: 'BLOCKED',
        decision: transcodeError('TRANSCODE_OPUS_TIMELINE_INCONSISTENT', 'Opus pre-skip/granule/end-trim model is inconsistent'),
      };
    }
    startFrame = timing.preSkipFrames;
  }
  const endFrame = startFrame + presentationFrames;
  if (endFrame > signal.sampleFrames) {
    return {
      state: 'BLOCKED',
      decision: transcodeVerdict(
        'FAIL',
        'TRANSCODE_AUDIO_DECODED_PROGRAM_TRUNCATED',
        `decoded coded domain ends at ${signal.sampleFrames}; presentation window requires ${endFrame}`,
      ),
    };
  }
  return { state: 'OK', startFrame, endFrame };
}

function validateDecodedSignal(signal: DecodedAudioSignal, label: string): TranscodeDecision | undefined {
  if (!Number.isSafeInteger(signal.sampleRate) || signal.sampleRate <= 0 ||
      !Number.isSafeInteger(signal.channels) || signal.channels <= 0 ||
      !Number.isSafeInteger(signal.sampleFrames) || signal.sampleFrames < 0 ||
      signal.samples.length !== signal.sampleFrames * signal.channels) {
    return transcodeError(
      'TRANSCODE_AUDIO_DECODE_EVIDENCE_INVALID',
      `${label} decoded PCM shape is internally inconsistent`,
    );
  }
  for (let index = 0; index < signal.samples.length; index++) {
    if (!Number.isFinite(signal.samples[index])) {
      return transcodeError(
        'TRANSCODE_AUDIO_DECODE_EVIDENCE_NONFINITE',
        `${label} decoded PCM contains non-finite samples`,
      );
    }
  }
  return undefined;
}

function ok(value: Omit<TranscodeAudioStructure, 'schema'>): TranscodeAudioStructureResult {
  return { state: 'OK', value: Object.freeze({ schema: TRANSCODE_AUDIO_SCHEMA, ...value }) };
}

function opusPacketSamples(packet: Uint8Array): number | undefined {
  if (packet.byteLength < 1) return undefined;
  const toc = packet[0]!;
  const config = toc >> 3;
  let frameSamples: number;
  if (config >= 16) frameSamples = 120 << (config & 3);
  else if (config >= 12) frameSamples = 480 << (config & 1);
  else if ((config & 3) === 3) frameSamples = 2880;
  else frameSamples = 480 << (config & 3);
  const code = toc & 3;
  const frames = code === 0 ? 1 : code === 1 || code === 2 ? 2 : packet.byteLength >= 2 ? packet[1]! & 0x3f : 0;
  const total = frames * frameSamples;
  return frames > 0 && total <= 5760 ? total : undefined;
}

function join(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.byteLength;
  }
  return joined;
}

function u16le(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function u32le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) |
    (bytes[offset + 3]! * 0x1000000)) >>> 0;
}

function u64leSafe(bytes: Uint8Array, offset: number): number | undefined {
  const low = u32le(bytes, offset);
  const high = u32le(bytes, offset + 4);
  const value = high * 0x1_0000_0000 + low;
  return Number.isSafeInteger(value) ? value : undefined;
}

function canonicalContainer(value: string | undefined): string {
  const token = (value ?? '').trim().toLowerCase();
  if (['m4a', 'm4v', 'mov', 'isobmff'].includes(token)) return 'mp4';
  if (token === 'matroska') return 'mkv';
  return token;
}

function looksLikeWave(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE';
}

function looksLikeIsoBmff(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 8 && ['ftyp', 'moov', 'free'].includes(ascii(bytes, 4, 4));
}

function looksLikeEbml(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let output = '';
  for (let index = 0; index < length && offset + index < bytes.byteLength; index++) {
    output += String.fromCharCode(bytes[offset + index]!);
  }
  return output;
}

function formatFinite(value: number): string {
  if (value === Number.POSITIVE_INFINITY) return 'Infinity';
  if (value === Number.NEGATIVE_INFINITY) return '-Infinity';
  return Number.isFinite(value) ? value.toFixed(6) : 'NaN';
}

interface LocalBox {
  type: string;
  bodyStart: number;
  bodyEnd: number;
}

function readMp4AudioSampleEntry(
  bytes: Uint8Array,
): { codec: string; sampleRate: number; channels: number } | undefined {
  const moov = findLocalBox(bytes, 0, bytes.byteLength, 'moov');
  if (!moov) return undefined;
  for (const trak of localBoxes(bytes, moov.bodyStart, moov.bodyEnd)) {
    if (trak.type !== 'trak') continue;
    const mdia = findLocalBox(bytes, trak.bodyStart, trak.bodyEnd, 'mdia');
    if (!mdia) continue;
    const hdlr = findLocalBox(bytes, mdia.bodyStart, mdia.bodyEnd, 'hdlr');
    if (!hdlr || ascii(bytes, hdlr.bodyStart + 8, 4) !== 'soun') continue;
    const minf = findLocalBox(bytes, mdia.bodyStart, mdia.bodyEnd, 'minf');
    const stbl = minf ? findLocalBox(bytes, minf.bodyStart, minf.bodyEnd, 'stbl') : undefined;
    const stsd = stbl ? findLocalBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'stsd') : undefined;
    if (!stsd) continue;
    const entry = localBoxes(bytes, stsd.bodyStart + 8, stsd.bodyEnd)[0];
    if (!entry || entry.bodyStart + 28 > entry.bodyEnd) continue;
    const channels = u16be(bytes, entry.bodyStart + 16);
    const sampleRate = u32be(bytes, entry.bodyStart + 24) >>> 16;
    const codec = mp4AudioCodec(bytes, entry);
    if (codec && channels > 0 && sampleRate > 0) return { codec, sampleRate, channels };
  }
  return undefined;
}

function localBoxes(bytes: Uint8Array, start: number, end: number): LocalBox[] {
  const boxes: LocalBox[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    let size = u32be(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    let header = 8;
    if (size === 1 && offset + 16 <= end) {
      const high = u32be(bytes, offset + 8);
      const low = u32be(bytes, offset + 12);
      const large = high * 0x1_0000_0000 + low;
      if (!Number.isSafeInteger(large)) break;
      size = large;
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < header || offset + size > end) break;
    boxes.push({ type, bodyStart: offset + header, bodyEnd: offset + size });
    offset += size;
  }
  return boxes;
}

function findLocalBox(
  bytes: Uint8Array,
  start: number,
  end: number,
  type: string,
): LocalBox | undefined {
  return localBoxes(bytes, start, end).find((box) => box.type === type);
}

function mp4AudioCodec(bytes: Uint8Array, entry: LocalBox): string | undefined {
  const fourcc = entry.type;
  const token = fourcc.trim().toLowerCase();
  if (token === 'mp4a') {
    const oti = mp4AudioObjectType(bytes, entry);
    if (oti === 0x69 || oti === 0x6b) return 'mp3';
    if (oti === 0x40 || oti === 0x66 || oti === 0x67 || oti === 0x68 || oti === undefined) return 'aac';
    return undefined;
  }
  if (token === '.mp3' || token === 'mp3') return 'mp3';
  if (token === 'opus') return 'opus';
  if (token === 'flac' || fourcc === 'fLaC') return 'flac';
  if (token === 'alac') return 'alac';
  if (token === 'lpcm' || token === 'sowt' || token === 'twos') return 'pcm';
  return undefined;
}

function mp4AudioObjectType(bytes: Uint8Array, entry: LocalBox): number | undefined {
  const version = u16be(bytes, entry.bodyStart + 8);
  const extensionBytes = version === 1 ? 16 : version === 2 ? 36 : 0;
  const childrenStart = entry.bodyStart + 28 + extensionBytes;
  if (childrenStart > entry.bodyEnd) return undefined;
  const esds = localBoxes(bytes, childrenStart, entry.bodyEnd).find((box) => box.type === 'esds');
  if (!esds || esds.bodyStart + 4 >= esds.bodyEnd) return undefined;
  let offset = esds.bodyStart + 4; // FullBox version/flags.
  while (offset < esds.bodyEnd) {
    const tag = bytes[offset++];
    if (tag === undefined) break;
    const length = readMp4DescriptorLength(bytes, offset, esds.bodyEnd);
    if (!length) break;
    offset = length.next;
    if (tag === 0x04) return bytes[offset]; // DecoderConfigDescriptor.objectTypeIndication
    if (tag === 0x03) {
      const bodyEnd = offset + length.value;
      if (offset + 3 > bodyEnd) return undefined;
      const flags = bytes[offset + 2]!;
      offset += 3; // ES_ID + flags.
      if ((flags & 0x80) !== 0) offset += 2;
      if ((flags & 0x40) !== 0) {
        const urlLength = bytes[offset];
        if (urlLength === undefined) return undefined;
        offset += 1 + urlLength;
      }
      if ((flags & 0x20) !== 0) offset += 2;
      if (offset > bodyEnd) return undefined;
      continue;
    }
    offset += length.value;
  }
  return undefined;
}

function readMp4DescriptorLength(
  bytes: Uint8Array,
  offset: number,
  end: number,
): { value: number; next: number } | undefined {
  let value = 0;
  for (let count = 0; count < 4 && offset < end; count++) {
    const byte = bytes[offset++]!;
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return offset + value <= end ? { value, next: offset } : undefined;
  }
  return undefined;
}

function u16be(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function u32be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! * 0x1000000) + (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) + bytes[offset + 3]!) >>> 0;
}
