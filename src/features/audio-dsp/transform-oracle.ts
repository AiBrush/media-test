import type { OracleOutcome } from '../../core/scenario.ts';
import { audioDspContractForScenario } from './contracts.ts';
import { decodeNativePcm, readPcmStructure } from './readers.ts';
import type {
  AudioDspOracleOutcome,
  AudioTransformContract,
  ChannelMatrixContract,
  DecodedPcmEvidence,
  FadeContract,
  GainContract,
  PcmStructureEvidence,
  ResampleContract,
  SampleFormatContract,
} from './types.ts';

const ORACLE = 'property-invariant' as const;
const MAX_SIGNAL_FRAMES = 524_288;
const SILENCE_RMS = 1e-8;

/** Neutral two-layer (container + decoded signal) evaluator for every PCM audio-DSP conversion. */
export function evaluateAudioDspTransform(
  scenarioId: string,
  sourceBytes: Uint8Array,
  outputBytes: Uint8Array,
  explicitContract?: AudioTransformContract,
): AudioDspOracleOutcome {
  const contract = explicitContract ?? audioDspContractForScenario(scenarioId);
  if (!contract) return oracleError('AUDIO_DSP_CONTRACT_MISSING', `no audio-DSP contract for '${scenarioId}'`);

  const sourceStructure = readPcmStructure(sourceBytes);
  if (sourceStructure.state !== 'OK') {
    return oracleError(
      'AUDIO_SOURCE_READER_FAILED',
      `neutral source reader ${sourceStructure.state} [${sourceStructure.reasonCode}]: ${sourceStructure.detail}`,
    );
  }
  const outputStructure = readPcmStructure(outputBytes, contract.container);
  if (outputStructure.state !== 'OK') {
    return fail(
      'AUDIO_OUTPUT_UNREADABLE',
      `candidate output ${outputStructure.state} [${outputStructure.reasonCode}]: ${outputStructure.detail}`,
      { structuralChecks: 1, signalChecks: 0 },
    );
  }

  const structural = compareStructure(sourceStructure.value, outputStructure.value, contract);
  if (structural.failures.length > 0) {
    return fail(
      'AUDIO_STRUCTURE_MISMATCH',
      structural.failures.join('; '),
      { structuralChecks: structural.checks, signalChecks: 0, ...structural.measurements },
    );
  }

  const sourceSignal = decodeNativePcm(sourceBytes, { maxFrames: MAX_SIGNAL_FRAMES });
  const outputSignal = decodeNativePcm(outputBytes, { maxFrames: MAX_SIGNAL_FRAMES });
  if (sourceSignal.state !== 'OK') {
    return oracleError(
      'AUDIO_SOURCE_SIGNAL_READER_FAILED',
      `neutral source signal reader ${sourceSignal.state} [${sourceSignal.reasonCode}]: ${sourceSignal.detail}`,
      { structuralChecks: structural.checks },
    );
  }
  if (outputSignal.state !== 'OK') {
    return fail(
      'AUDIO_OUTPUT_SIGNAL_UNREADABLE',
      `candidate signal reader ${outputSignal.state} [${outputSignal.reasonCode}]: ${outputSignal.detail}`,
      { structuralChecks: structural.checks, signalChecks: 0 },
    );
  }

  const signal = compareSignal(sourceSignal.value, outputSignal.value, contract);
  const measurements = {
    structuralChecks: structural.checks,
    signalChecks: signal.checks,
    sourceNativeSampleRate: sourceSignal.value.sampleRate,
    outputNativeSampleRate: outputSignal.value.sampleRate,
    sourceSampleFrames: sourceSignal.value.sampleFrames,
    outputSampleFrames: outputSignal.value.sampleFrames,
    sourceDecodedEvidenceFrames: sourceSignal.value.decodedSampleFrames,
    outputDecodedEvidenceFrames: outputSignal.value.decodedSampleFrames,
    ...structural.measurements,
    ...signal.measurements,
  };
  if (signal.failures.length > 0) {
    return fail('AUDIO_SIGNAL_CONTRACT_FAILED', signal.failures.join('; '), measurements);
  }

  const diffs = [...structural.representationDifferences, ...signal.representationDifferences];
  if (diffs.length > 0) {
    return diff('AUDIO_VALID_REPRESENTATION_DIFFERENCE', diffs.join('; '), measurements);
  }
  return pass(
    'AUDIO_TRANSFORM_CONTRACT_HOLDS',
    `${contract.kind} passed ${structural.checks} structural and ${signal.checks} signal check(s) at native rate`,
    measurements,
  );
}

function compareStructure(
  source: PcmStructureEvidence,
  output: PcmStructureEvidence,
  contract: AudioTransformContract,
): {
  failures: string[];
  representationDifferences: string[];
  checks: number;
  measurements: Record<string, number>;
} {
  const failures: string[] = [];
  const representationDifferences: string[] = [];
  let checks = 0;
  checks++;
  if (output.container !== contract.container) {
    if (contract.container === 'aiff' && output.container === 'aifc') {
      representationDifferences.push('AIFC is a lawful AIFF-family PCM representation');
    } else failures.push(`container ${output.container} != requested ${contract.container}`);
  }
  checks++;
  if (output.codec !== contract.codec) failures.push(`codec/sample format ${output.codec} != requested ${contract.codec}`);
  const requestedRate = contract.sampleRate ?? source.sampleRate;
  const requestedChannels = contract.channels ?? source.channels;
  checks++;
  if (output.sampleRate !== requestedRate) failures.push(`native sample rate ${output.sampleRate} != requested ${requestedRate}`);
  checks++;
  if (output.channels !== requestedChannels) failures.push(`channel count ${output.channels} != requested ${requestedChannels}`);
  if (contract.channelLayout) {
    checks++;
    if (!sameStringArray(output.channelLayout, contract.channelLayout)) {
      failures.push(`channel layout [${output.channelLayout.join(',')}] != requested [${contract.channelLayout.join(',')}]`);
    }
  }
  checks++;
  const expectedFrames = Math.round(source.sampleFrames * requestedRate / source.sampleRate);
  const frameDelta = Math.abs(output.sampleFrames - expectedFrames);
  const tolerance = contract.durationFrameTolerance ?? 1;
  if (frameDelta > tolerance) {
    failures.push(`sample-frame duration ${output.sampleFrames} != expected ${expectedFrames} (delta ${frameDelta} > ${tolerance})`);
  }
  checks++;
  if (!(output.durationSec >= 0) || !Number.isFinite(output.durationSec)) failures.push('duration is not finite/non-negative');
  return {
    failures,
    representationDifferences,
    checks,
    measurements: {
      expectedOutputSampleFrames: expectedFrames,
      outputSampleFrameDelta: frameDelta,
      durationFrameTolerance: tolerance,
      outputChannels: output.channels,
      outputValidBitsPerSample: output.validBitsPerSample,
      outputStorageBitsPerSample: output.storageBitsPerSample,
    },
  };
}

function compareSignal(
  source: DecodedPcmEvidence,
  output: DecodedPcmEvidence,
  contract: AudioTransformContract,
): {
  failures: string[];
  representationDifferences: string[];
  checks: number;
  measurements: Record<string, number>;
} {
  switch (contract.kind) {
    case 'resample':
      return compareResample(source, output, contract);
    case 'channel-matrix':
      return compareMatrix(source, output, contract);
    case 'gain':
      return compareGain(source, output, contract);
    case 'fade':
      return compareFade(source, output, contract);
    case 'sample-format':
      return compareSampleFormat(source, output, contract);
    case 'identity':
      return compareIdentity(source, output, contract.maxAbsoluteError);
  }
}

function compareResample(
  source: DecodedPcmEvidence,
  output: DecodedPcmEvidence,
  contract: ResampleContract,
): ReturnType<typeof emptyComparison> {
  const result = emptyComparison();
  const channels = Math.min(source.channels, output.channels);
  let maxSpectralDeltaDb = 0;
  let comparedBins = 0;
  let maxRmsDeltaDb = 0;
  let clippedSamples = 0;
  for (let channel = 0; channel < channels; channel++) {
    const sourceRms = channelRms(source, channel);
    const outputRms = channelRms(output, channel);
    result.checks++;
    if (sourceRms <= SILENCE_RMS) {
      if (outputRms > 1e-7) result.failures.push(`channel ${channel} did not preserve silence (RMS ${outputRms})`);
    } else {
      const rmsDeltaDb = Math.abs(amplitudeDb(outputRms / sourceRms));
      maxRmsDeltaDb = Math.max(maxRmsDeltaDb, rmsDeltaDb);
      if (rmsDeltaDb > contract.maxRmsDeltaDb) {
        result.failures.push(`channel ${channel} RMS delta ${rmsDeltaDb.toFixed(3)} dB > ${contract.maxRmsDeltaDb} dB`);
      }
    }
    for (const frequency of contract.probeFrequenciesHz) {
      if (frequency >= Math.min(source.sampleRate, output.sampleRate) * 0.48) continue;
      const a = spectralAmplitude(source, channel, frequency);
      if (a < 1e-5) continue;
      const b = spectralAmplitude(output, channel, frequency);
      const deltaDb = Math.abs(amplitudeDb(Math.max(b, 1e-12) / a));
      maxSpectralDeltaDb = Math.max(maxSpectralDeltaDb, deltaDb);
      comparedBins++;
      result.checks++;
      if (deltaDb > contract.maxSpectralDeltaDb) {
        result.failures.push(`channel ${channel} ${frequency}Hz delta ${deltaDb.toFixed(3)} dB > ${contract.maxSpectralDeltaDb} dB`);
      }
    }
  }
  for (const sample of output.samples) if (!Number.isFinite(sample) || Math.abs(sample) > 1.000001) clippedSamples++;
  result.checks++;
  if (clippedSamples > 0) result.failures.push(`${clippedSamples} non-finite/out-of-range output sample(s)`);
  if (comparedBins === 0 && channels > 0 && channelRms(source, 0) > SILENCE_RMS) {
    result.failures.push('no authored spectral probe had source energy; signal contract is unscored');
  }
  result.measurements = { maxSpectralDeltaDb, maxRmsDeltaDb, comparedSpectralBins: comparedBins, clippedSamples };
  if (result.failures.length === 0) {
    result.representationDifferences.push('resampler-specific waveform is accepted by native-rate spectral/duration tolerances');
  }
  return result;
}

function compareMatrix(
  source: DecodedPcmEvidence,
  output: DecodedPcmEvidence,
  contract: ChannelMatrixContract,
): ReturnType<typeof emptyComparison> {
  const result = emptyComparison();
  if (!sameStringArray(source.channelLayout, contract.inputLayout)) {
    result.failures.push(`input layout [${source.channelLayout.join(',')}] != contract [${contract.inputLayout.join(',')}]`);
    return result;
  }
  if (contract.matrix.length !== output.channels || contract.matrix.some((row) => row.length !== source.channels)) {
    result.failures.push('authored channel matrix dimensions do not match input/output evidence');
    return result;
  }
  const frames = Math.min(source.decodedSampleFrames, output.decodedSampleFrames);
  let maxAbsoluteError = 0;
  let squaredError = 0;
  let scalarCount = 0;
  for (let frame = 0; frame < frames; frame++) {
    for (let outChannel = 0; outChannel < output.channels; outChannel++) {
      let expected = 0;
      const row = contract.matrix[outChannel]!;
      for (let inChannel = 0; inChannel < source.channels; inChannel++) {
        expected += source.samples[frame * source.channels + inChannel]! * row[inChannel]!;
      }
      if (contract.clip) expected = saturate(expected);
      const actual = output.samples[frame * output.channels + outChannel]!;
      const error = Math.abs(actual - expected);
      maxAbsoluteError = Math.max(maxAbsoluteError, error);
      squaredError += error * error;
      scalarCount++;
    }
  }
  result.checks = scalarCount;
  if (maxAbsoluteError > contract.maxAbsoluteError) {
    result.failures.push(`channel matrix max error ${maxAbsoluteError} > ${contract.maxAbsoluteError}`);
  }
  result.measurements = {
    matrixComparedFrames: frames,
    matrixMaxAbsoluteError: maxAbsoluteError,
    matrixRmse: scalarCount ? Math.sqrt(squaredError / scalarCount) : 0,
  };
  return result;
}

function compareGain(
  source: DecodedPcmEvidence,
  output: DecodedPcmEvidence,
  contract: GainContract,
): ReturnType<typeof emptyComparison> {
  const result = emptyComparison();
  const scalarCount = Math.min(source.samples.length, output.samples.length);
  const ratios: number[] = [];
  let maxAbsoluteError = 0;
  for (let i = 0; i < scalarCount; i++) {
    const input = source.samples[i]!;
    const expected = saturate(input * contract.linearGain);
    const actual = output.samples[i]!;
    maxAbsoluteError = Math.max(maxAbsoluteError, Math.abs(actual - expected));
    if (Math.abs(input) > 1e-4 && Math.abs(input) < 0.98) ratios.push(actual / input);
  }
  ratios.sort((a, b) => a - b);
  const achieved = ratios.length ? ratios[Math.floor(ratios.length / 2)]! : 0;
  const gainDeltaDb = achieved > 0 ? Math.abs(amplitudeDb(achieved / contract.linearGain)) : Number.POSITIVE_INFINITY;
  result.checks = scalarCount + 2;
  if (ratios.length === 0) result.failures.push('gain has no non-silent/non-clipped sample evidence');
  if (gainDeltaDb > contract.maxGainDeltaDb) {
    result.failures.push(`achieved gain ${achieved} differs by ${gainDeltaDb.toFixed(4)} dB`);
  }
  if (maxAbsoluteError > contract.maxAbsoluteError) {
    result.failures.push(`gain max sample error ${maxAbsoluteError} > ${contract.maxAbsoluteError}`);
  }
  result.measurements = { achievedLinearGain: achieved, gainDeltaDb, gainMaxAbsoluteError: maxAbsoluteError };
  return result;
}

function compareFade(
  source: DecodedPcmEvidence,
  output: DecodedPcmEvidence,
  contract: FadeContract,
): ReturnType<typeof emptyComparison> {
  const result = emptyComparison();
  const frames = Math.min(source.decodedSampleFrames, output.decodedSampleFrames);
  const fadeInFrames = Math.max(1, Math.round(contract.fadeInSec * source.sampleRate));
  const fadeOutFrames = Math.max(1, Math.round(contract.fadeOutSec * source.sampleRate));
  let maxEnvelopeError = 0;
  let checked = 0;
  for (let frame = 0; frame < frames; frame++) {
    const inGain = frame < fadeInFrames ? frame / Math.max(1, fadeInFrames - 1) : 1;
    const fadeOutStart = source.sampleFrames - fadeOutFrames;
    const outGain = frame >= fadeOutStart
      ? Math.max(0, (source.sampleFrames - 1 - frame) / Math.max(1, fadeOutFrames - 1))
      : 1;
    const gain = inGain * outGain;
    for (let channel = 0; channel < source.channels; channel++) {
      const index = frame * source.channels + channel;
      const expected = source.samples[index]! * gain;
      const error = Math.abs(output.samples[index]! - expected);
      maxEnvelopeError = Math.max(maxEnvelopeError, error);
      checked++;
    }
  }
  result.checks = checked + 4;
  if (maxEnvelopeError > contract.maxEnvelopeError) {
    result.failures.push(`linear fade envelope max error ${maxEnvelopeError} > ${contract.maxEnvelopeError}`);
  }
  result.measurements = { fadeInFrames, fadeOutFrames, fadeMaxEnvelopeError: maxEnvelopeError };
  return result;
}

function compareSampleFormat(
  source: DecodedPcmEvidence,
  output: DecodedPcmEvidence,
  contract: SampleFormatContract,
): ReturnType<typeof emptyComparison> {
  const result = emptyComparison();
  const scalarCount = Math.min(source.samples.length, output.samples.length);
  const lsb = output.sampleKind === 'float' ? 2 ** -23 : 1 / 2 ** (output.validBitsPerSample - 1);
  let maxErrorLsb = 0;
  let changedSamples = 0;
  for (let i = 0; i < scalarCount; i++) {
    const input = source.samples[i]!;
    const expected = expectedQuantized(input, output.validBitsPerSample, contract.policy.rounding);
    const actual = output.samples[i]!;
    const errorLsb = Math.abs(actual - expected) / lsb;
    maxErrorLsb = Math.max(maxErrorLsb, errorLsb);
    if (actual !== expected) changedSamples++;
  }
  result.checks = scalarCount;
  if (maxErrorLsb > contract.maxErrorLsb + 1e-6) {
    result.failures.push(`quantization max error ${maxErrorLsb.toFixed(3)} LSB > ${contract.maxErrorLsb} LSB`);
  } else if (changedSamples > 0 && contract.policy.dither === 'allowed') {
    result.representationDifferences.push(`allowed dither changed ${changedSamples} normalized sample(s)`);
  }
  result.measurements = { quantizationMaxErrorLsb: maxErrorLsb, quantizationChangedSamples: changedSamples };
  return result;
}

function compareIdentity(
  source: DecodedPcmEvidence,
  output: DecodedPcmEvidence,
  tolerance: number,
): ReturnType<typeof emptyComparison> {
  const result = emptyComparison();
  const scalarCount = Math.min(source.samples.length, output.samples.length);
  let maxAbsoluteError = 0;
  let mismatches = 0;
  for (let i = 0; i < scalarCount; i++) {
    const error = Math.abs(source.samples[i]! - output.samples[i]!);
    maxAbsoluteError = Math.max(maxAbsoluteError, error);
    if (error > tolerance) mismatches++;
  }
  result.checks = scalarCount;
  if (mismatches > 0) result.failures.push(`${mismatches} identity sample mismatch(es), max error ${maxAbsoluteError}`);
  result.measurements = { identityMismatches: mismatches, identityMaxAbsoluteError: maxAbsoluteError };
  return result;
}

function channelRms(audio: DecodedPcmEvidence, channel: number): number {
  const frames = Math.min(audio.decodedSampleFrames, audio.sampleRate * 2);
  let sum = 0;
  for (let frame = 0; frame < frames; frame++) {
    const value = audio.samples[frame * audio.channels + channel]!;
    sum += value * value;
  }
  return frames > 0 ? Math.sqrt(sum / frames) : 0;
}

function spectralAmplitude(audio: DecodedPcmEvidence, channel: number, frequency: number): number {
  const frames = Math.min(audio.decodedSampleFrames, Math.round(audio.sampleRate * 2));
  if (frames < 2) return 0;
  let real = 0;
  let imaginary = 0;
  let windowSum = 0;
  for (let frame = 0; frame < frames; frame++) {
    const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * frame) / (frames - 1));
    const phase = (2 * Math.PI * frequency * frame) / audio.sampleRate;
    const value = audio.samples[frame * audio.channels + channel]! * window;
    real += value * Math.cos(phase);
    imaginary -= value * Math.sin(phase);
    windowSum += window;
  }
  return windowSum > 0 ? (2 * Math.hypot(real, imaginary)) / windowSum : 0;
}

function expectedQuantized(
  value: number,
  validBits: number,
  rounding: SampleFormatContract['policy']['rounding'],
): number {
  if (rounding === 'identity') return value;
  const scale = 2 ** (validBits - 1);
  const scaled = saturate(value) * scale;
  const integer = rounding === 'nearest-even' ? roundNearestEven(scaled) : Math.floor(scaled);
  return Math.max(-scale, Math.min(scale - 1, integer)) / scale;
}

function roundNearestEven(value: number): number {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction < 0.5) return floor;
  if (fraction > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

function amplitudeDb(ratio: number): number {
  return 20 * Math.log10(Math.max(ratio, 1e-300));
}

function saturate(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function sameStringArray(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function emptyComparison(): {
  failures: string[];
  representationDifferences: string[];
  checks: number;
  measurements: Record<string, number>;
} {
  return { failures: [], representationDifferences: [], checks: 0, measurements: {} };
}

function verdict(
  value: 'PASS' | 'DIFF' | 'FAIL',
  reasonCode: string,
  detail: string,
  measurements?: Record<string, number>,
): AudioDspOracleOutcome {
  return {
    state: 'VERDICT', oracle: ORACLE, verdict: value === 'DIFF' ? 'PASS' : value, reasonCode, detail,
    ...(measurements ? { measurements } : {}),
  };
}

function pass(reasonCode: string, detail: string, measurements?: Record<string, number>): AudioDspOracleOutcome {
  return verdict('PASS', reasonCode, detail, measurements);
}

function diff(reasonCode: string, detail: string, measurements?: Record<string, number>): AudioDspOracleOutcome {
  return verdict('DIFF', reasonCode, detail, measurements);
}

function fail(reasonCode: string, detail: string, measurements?: Record<string, number>): AudioDspOracleOutcome {
  return verdict('FAIL', reasonCode, detail, measurements);
}

function oracleError(
  reasonCode: string,
  detail: string,
  measurements?: Record<string, number>,
): AudioDspOracleOutcome {
  const outcome: OracleOutcome = {
    state: 'ERROR', oracle: ORACLE, reasonCode, detail, ...(measurements ? { measurements } : {}),
  };
  return outcome as AudioDspOracleOutcome;
}
