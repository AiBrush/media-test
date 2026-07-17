import { readPcmStructure } from './readers.ts';
import type {
  AudioReaderResult,
  AudioSampleFrameNumerator,
  AudioThroughputEvidence,
  PcmStructureEvidence,
} from './types.ts';

export function audioSampleFrameNumerator(
  evidence: Pick<PcmStructureEvidence, 'sampleFrames' | 'channels' | 'sampleRate' | 'source'>,
): AudioSampleFrameNumerator {
  if (!Number.isSafeInteger(evidence.sampleFrames) || evidence.sampleFrames < 0) throw new RangeError('sampleFrames must be a non-negative safe integer');
  if (!Number.isSafeInteger(evidence.channels) || evidence.channels <= 0) throw new RangeError('channels must be a positive safe integer');
  const scalarSamples = evidence.sampleFrames * evidence.channels;
  if (!Number.isSafeInteger(scalarSamples)) throw new RangeError('scalar sample count exceeds safe integer range');
  return {
    unit: 'sample-frames',
    sampleFrames: evidence.sampleFrames,
    scalarSamples,
    channels: evidence.channels,
    nativeSampleRate: evidence.sampleRate,
    source: evidence.source,
  };
}

export function audioSampleFrameNumeratorFromBytes(bytes: Uint8Array): AudioReaderResult<AudioSampleFrameNumerator> {
  const read = readPcmStructure(bytes);
  if (read.state !== 'OK') return read;
  return { state: 'OK', value: audioSampleFrameNumerator(read.value), evidence: read.evidence };
}

export function sampleFrameThroughput(
  numerator: AudioSampleFrameNumerator,
  wallMs: number,
  iterations = 1,
): AudioThroughputEvidence {
  if (!Number.isFinite(wallMs) || wallMs <= 0) throw new RangeError('wallMs must be finite and positive');
  if (!Number.isSafeInteger(iterations) || iterations <= 0) throw new RangeError('iterations must be a positive safe integer');
  const totalFrames = numerator.sampleFrames * iterations;
  const totalScalarSamples = numerator.scalarSamples * iterations;
  const wallSec = wallMs / 1000;
  return {
    ...numerator,
    metric: 'sampleFramesPerSec',
    n: iterations,
    iterations,
    wallMs,
    sampleFramesPerSec: totalFrames / wallSec,
    scalarSamplesPerSec: totalScalarSamples / wallSec,
  };
}
