import type { AudioTransformContract } from './types.ts';

const ITU_MINUS_3_DB = 0.7071067811865476;
const PCM16_ERROR = 2 / 32768;

/**
 * The scenario contract is deliberately outside adapter options: it grades the output but is never
 * forwarded as a framework knob an adapter could silently ignore. Scenario id + ordinary requested
 * output options select one immutable contract here.
 */
const CONTRACTS: Readonly<Record<string, AudioTransformContract>> = Object.freeze({
  resample_48k_to_44k1: resample(44_100),
  resample_44k1_to_48k: resample(48_000),
  resample_48k_to_16k: resample(16_000),
  edge_longform_audio_resample_16k: resample(16_000, { minimumSpectralBins: 0 }),

  downmix_stereo_to_mono: matrix({
    channels: 1,
    outputLayout: ['FC'],
    inputLayout: ['FL', 'FR'],
    coefficients: [[0.5, 0.5]],
  }),
  upmix_mono_to_stereo: matrix({
    channels: 2,
    outputLayout: ['FL', 'FR'],
    inputLayout: ['FC'],
    coefficients: [[1], [1]],
  }),
  downmix_5_1_to_stereo: matrix({
    channels: 2,
    outputLayout: ['FL', 'FR'],
    inputLayout: ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR'],
    coefficients: [
      [1, 0, ITU_MINUS_3_DB, 0, ITU_MINUS_3_DB, 0],
      [0, 1, ITU_MINUS_3_DB, 0, 0, ITU_MINUS_3_DB],
    ],
  }),
  edge_variable_channel_count_downmix: matrix({
    channels: 2,
    outputLayout: ['FL', 'FR'],
    inputLayout: ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR'],
    coefficients: [
      [1, 0, ITU_MINUS_3_DB, 0, ITU_MINUS_3_DB, 0],
      [0, 1, ITU_MINUS_3_DB, 0, 0, ITU_MINUS_3_DB],
    ],
  }),
  upmix_stereo_to_5_1: matrix({
    channels: 6,
    outputLayout: ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR'],
    inputLayout: ['FL', 'FR'],
    coefficients: [
      [1, 0],
      [0, 1],
      [ITU_MINUS_3_DB, ITU_MINUS_3_DB],
      [0, 0],
      [ITU_MINUS_3_DB, 0],
      [0, ITU_MINUS_3_DB],
    ],
  }),

  gain_minus6db_s16: {
    kind: 'gain', container: 'wav', codec: 'pcm-s16', linearGain: 0.5,
    maxGainDeltaDb: 0.02, maxAbsoluteError: PCM16_ERROR,
  },
  gain_half_f32: {
    kind: 'gain', container: 'wav', codec: 'pcm-f32', linearGain: 0.5,
    maxGainDeltaDb: 0.001, maxAbsoluteError: 1e-6,
  },
  fade_in_out_f32: {
    kind: 'fade', container: 'wav', codec: 'pcm-f32', curve: 'linear',
    fadeInSec: 1, fadeOutSec: 1, maxEnvelopeError: 2e-4,
  },

  pcm_s16_to_f32: sampleFormat('pcm-f32', 'identity', 0.01),
  pcm_f32_to_s16: sampleFormat('pcm-s16', 'nearest-even', 1),
  pcm_s24_to_s16: sampleFormat('pcm-s16', 'truncate-toward-negative-infinity', 1),
  throughput_encode_s24: sampleFormat('pcm-s24', 'nearest-even', 1),
  pcm_s24_to_f32: sampleFormat('pcm-f32', 'identity', 0.01),
  pcm_s16be_to_s16le: sampleFormat('pcm-s16', 'identity', 0),
  pcm_s16le_to_s16be: {
    ...sampleFormat('pcm-s16be', 'identity', 0), container: 'aiff',
  },
  throughput_encode_s16be: {
    ...sampleFormat('pcm-s16be', 'identity', 0), container: 'aiff',
  },
  pcm_s24be_to_s16le: sampleFormat('pcm-s16', 'truncate-toward-negative-infinity', 1),
  meta_idempotent_resample_same_rate: {
    kind: 'identity', container: 'wav', codec: 'pcm-s16', sampleRate: 48_000,
    channels: 2, maxAbsoluteError: 0,
  },
});

export function audioDspContractForScenario(scenarioId: string): AudioTransformContract | undefined {
  const key = scenarioId.startsWith('audio-dsp/') ? scenarioId.slice('audio-dsp/'.length) : scenarioId;
  return CONTRACTS[key];
}

export function audioDspContractScenarioIds(): string[] {
  return Object.keys(CONTRACTS).map((id) => `audio-dsp/${id}`).sort();
}

function resample(
  sampleRate: number,
  policy: { minimumSpectralBins?: number } = {},
): AudioTransformContract {
  return {
    kind: 'resample', container: 'wav', codec: 'pcm-s16', sampleRate,
    probeFrequenciesHz: [220, 440, 1_000, 4_000],
    ...policy,
    maxSpectralDeltaDb: 0.75,
    maxRmsDeltaDb: 0.5,
    durationFrameTolerance: 1,
  };
}

function matrix(input: {
  channels: number;
  inputLayout: string[];
  outputLayout: string[];
  coefficients: number[][];
}): AudioTransformContract {
  return {
    kind: 'channel-matrix', container: 'wav', codec: 'pcm-s16', channels: input.channels,
    channelLayout: input.outputLayout, inputLayout: input.inputLayout,
    outputLayout: input.outputLayout, matrix: input.coefficients,
    maxAbsoluteError: PCM16_ERROR, clip: true,
  };
}

function sampleFormat(
  codec: string,
  rounding: 'identity' | 'nearest-even' | 'truncate-toward-negative-infinity',
  maxErrorLsb: number,
): AudioTransformContract {
  return {
    kind: 'sample-format', container: 'wav', codec,
    policy: { dither: 'none', rounding, clipping: 'saturate' },
    maxErrorLsb,
  };
}
