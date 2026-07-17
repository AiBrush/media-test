/** Native-rate AAC gapless evidence: ISO-BMFF timing plus raw WebCodecs AudioDecoder counts. */

import type { MediaBytes } from '../../core/engine.ts';
import type {
  GaplessNativeEvidenceResult,
  GaplessTrackEvidence,
} from '../../features/audio-dsp/types.ts';
import {
  demuxMp4GaplessAudio,
  type Mp4GaplessAudioTrack,
  UnsupportedMp4Error,
} from './demux-mp4.ts';

interface NativeDecodeCount {
  sampleFrames: number;
  sampleRate: number;
}

/**
 * Compare a digest-verified source and candidate without Web Audio. Container edit-list facts remain
 * separate from decoder output counts, so host AudioContext rate cannot hide lost priming/padding.
 */
export async function collectGaplessNativeEvidence(
  source: MediaBytes,
  candidate: MediaBytes,
): Promise<GaplessNativeEvidenceResult> {
  let referenceTrack: Mp4GaplessAudioTrack;
  try {
    referenceTrack = demuxMp4GaplessAudio(source.bytes);
  } catch (error) {
    return {
      state: 'UNAVAILABLE',
      applicability: 'NA_ASSET',
      reasonCode: 'AUDIO_GAPLESS_REFERENCE_TIMING_UNAVAILABLE',
      detail: `reference AAC timing is unavailable: ${message(error)}`,
    };
  }

  let candidateTrack: Mp4GaplessAudioTrack;
  try {
    candidateTrack = demuxMp4GaplessAudio(candidate.bytes);
  } catch (error) {
    return {
      state: 'INVALID',
      reasonCode: 'AUDIO_GAPLESS_OUTPUT_TIMING_INVALID',
      detail: `candidate AAC timing is malformed or unsupported: ${message(error)}`,
    };
  }

  if (typeof AudioDecoder === 'undefined' || typeof EncodedAudioChunk === 'undefined') {
    return {
      state: 'UNAVAILABLE',
      applicability: 'NA_BROWSER',
      reasonCode: 'AUDIO_DECODER_API_UNAVAILABLE',
      detail: 'WebCodecs AudioDecoder/EncodedAudioChunk is unavailable in this realm',
    };
  }

  const referenceSupport = await supports(referenceTrack).catch((error: unknown) => ({ error }));
  if ('error' in referenceSupport) {
    return {
      state: 'UNAVAILABLE', applicability: 'ERROR', reasonCode: 'AUDIO_DECODER_PROBE_ERROR',
      detail: `reference AudioDecoder.isConfigSupported failed: ${message(referenceSupport.error)}`,
    };
  }
  const candidateSupport = await supports(candidateTrack).catch((error: unknown) => ({ error }));
  if ('error' in candidateSupport) {
    return {
      state: 'UNAVAILABLE', applicability: 'ERROR', reasonCode: 'AUDIO_DECODER_PROBE_ERROR',
      detail: `candidate AudioDecoder.isConfigSupported failed: ${message(candidateSupport.error)}`,
    };
  }
  if (!referenceSupport.supported || !candidateSupport.supported) {
    const missing = !referenceSupport.supported ? 'reference' : 'candidate';
    const track = !referenceSupport.supported ? referenceTrack : candidateTrack;
    return {
      state: 'UNAVAILABLE',
      applicability: 'NA_BROWSER',
      reasonCode: 'AUDIO_DECODER_CONFIG_UNSUPPORTED',
      detail: `browser rejects ${missing} ${track.config.codecString}/${track.config.sampleRate}Hz/${track.config.channels}ch configuration`,
    };
  }

  let referenceDecode: NativeDecodeCount;
  try {
    referenceDecode = await decodeNativeCount(referenceTrack);
  } catch (error) {
    return {
      state: 'UNAVAILABLE',
      applicability: 'NA_ASSET',
      reasonCode: 'AUDIO_GAPLESS_REFERENCE_DECODE_UNAVAILABLE',
      detail: `verified reference did not decode through the supported native configuration: ${message(error)}`,
    };
  }
  let candidateDecode: NativeDecodeCount;
  try {
    candidateDecode = await decodeNativeCount(candidateTrack);
  } catch (error) {
    return {
      state: 'INVALID',
      reasonCode: 'AUDIO_GAPLESS_OUTPUT_DECODE_INVALID',
      detail: `candidate failed after its native decoder configuration was accepted: ${message(error)}`,
    };
  }

  const reference = trackEvidence(referenceTrack, referenceDecode);
  const output = trackEvidence(candidateTrack, candidateDecode);
  const extra = Math.max(0, output.decodedSampleFrames - reference.decodedSampleFrames);
  return {
    state: 'OK',
    value: {
      reference,
      candidate: output,
      leadingExtraFrames: 0,
      trailingExtraFrames: extra,
      evidenceSource: 'container-timing+webcodecs',
    },
  };
}

async function supports(track: Mp4GaplessAudioTrack): Promise<AudioDecoderSupport> {
  return AudioDecoder.isConfigSupported(decoderConfig(track));
}

function decoderConfig(track: Mp4GaplessAudioTrack): AudioDecoderConfig {
  const config: AudioDecoderConfig = {
    codec: track.config.codecString,
    sampleRate: track.config.sampleRate,
    numberOfChannels: track.config.channels,
  };
  if (track.config.description) config.description = track.config.description.slice();
  return config;
}

async function decodeNativeCount(track: Mp4GaplessAudioTrack): Promise<NativeDecodeCount> {
  let sampleFrames = 0;
  let sampleRate = 0;
  let callbackError: DOMException | undefined;
  const decoder = new AudioDecoder({
    output(data) {
      try {
        if (sampleRate !== 0 && data.sampleRate !== sampleRate) {
          callbackError = new DOMException(
            `decoder changed native rate from ${sampleRate} to ${data.sampleRate}`,
            'DataError',
          );
        }
        sampleRate = data.sampleRate;
        sampleFrames += data.numberOfFrames;
      } finally {
        data.close();
      }
    },
    error(error) {
      callbackError = error;
    },
  });
  try {
    decoder.configure(decoderConfig(track));
    for (const sample of track.samples) {
      decoder.decode(new EncodedAudioChunk({
        type: 'key',
        timestamp: sample.ptsUs,
        duration: Math.max(1, sample.durationUs),
        data: sample.data,
      }));
    }
    await decoder.flush();
    if (callbackError) throw callbackError;
  } finally {
    decoder.close();
  }
  if (sampleFrames <= 0 || sampleRate <= 0) throw new Error('native decoder emitted no audio frames');
  return { sampleFrames, sampleRate };
}

function trackEvidence(track: Mp4GaplessAudioTrack, decoded: NativeDecodeCount): GaplessTrackEvidence {
  const discardedPrimingFrames = Math.min(track.primingFrames, decoded.sampleFrames);
  const afterPriming = Math.max(0, decoded.sampleFrames - discardedPrimingFrames);
  const discardedRemainderFrames = Math.min(track.remainderFrames, afterPriming);
  return {
    nativeSampleRate: track.config.sampleRate,
    codedSampleFrames: track.codedSampleFrames,
    primingFrames: track.primingFrames,
    remainderFrames: track.remainderFrames,
    presentationSampleFrames: track.presentationSampleFrames,
    editListMediaStartFrame: track.editListMediaStartFrame,
    rawDecodedSampleFrames: decoded.sampleFrames,
    decodedSampleFrames: decoded.sampleFrames - discardedPrimingFrames - discardedRemainderFrames,
    decodedSampleRate: decoded.sampleRate,
    discardedPrimingFrames,
    discardedRemainderFrames,
    timingSource: track.timingSource,
  };
}

function message(error: unknown): string {
  if (error instanceof UnsupportedMp4Error || error instanceof Error) return error.message;
  return String(error);
}
