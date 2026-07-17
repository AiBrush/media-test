import type { AudioDspOracleOutcome, EndiannessRoundTripEvidence } from './types.ts';
import { decodeNativePcm, readPcmStructure } from './readers.ts';

/** Both legs are observable: the intermediate must really be AIFF/s16be, then final WAV/s16le. */
export function evaluateEndiannessRoundTrip(evidence: EndiannessRoundTripEvidence): AudioDspOracleOutcome {
  const sourceStructure = readPcmStructure(evidence.source);
  const intermediateStructure = readPcmStructure(evidence.intermediate);
  const outputStructure = readPcmStructure(evidence.output);
  const structures = [
    ['source', sourceStructure],
    ['intermediate', intermediateStructure],
    ['output', outputStructure],
  ] as const;
  for (const [name, read] of structures) {
    if (read.state !== 'OK') {
      return {
        state: 'VERDICT', oracle: 'property-invariant', verdict: 'FAIL',
        reasonCode: 'AUDIO_ENDIAN_ROUNDTRIP_LEG_UNREADABLE',
        detail: `${name} ${read.state} [${read.reasonCode}]: ${read.detail}`,
      };
    }
  }
  if (sourceStructure.state !== 'OK' || intermediateStructure.state !== 'OK' || outputStructure.state !== 'OK') {
    throw new Error('unreachable reader state');
  }
  const source = sourceStructure.value;
  const intermediate = intermediateStructure.value;
  const output = outputStructure.value;
  const failures: string[] = [];
  if (source.container !== 'wav' || source.codec !== 'pcm-s16' || source.endianness !== 'little') {
    failures.push(`source must be WAV/pcm-s16/little, got ${source.container}/${source.codec}/${source.endianness}`);
  }
  if ((intermediate.container !== 'aiff' && intermediate.container !== 'aifc') ||
      intermediate.codec !== 'pcm-s16be' || intermediate.endianness !== 'big') {
    failures.push(`leg 1 intermediate must be AIFF/pcm-s16be/big, got ${intermediate.container}/${intermediate.codec}/${intermediate.endianness}`);
  }
  if (output.container !== 'wav' || output.codec !== 'pcm-s16' || output.endianness !== 'little') {
    failures.push(`leg 2 output must be WAV/pcm-s16/little, got ${output.container}/${output.codec}/${output.endianness}`);
  }
  for (const [field, a, b, c] of [
    ['sampleRate', source.sampleRate, intermediate.sampleRate, output.sampleRate],
    ['channels', source.channels, intermediate.channels, output.channels],
    ['sampleFrames', source.sampleFrames, intermediate.sampleFrames, output.sampleFrames],
  ] as const) {
    if (a !== b || a !== c) failures.push(`${field} changed across legs (${a} -> ${b} -> ${c})`);
  }

  const sourceSignal = decodeNativePcm(evidence.source);
  const intermediateSignal = decodeNativePcm(evidence.intermediate);
  const outputSignal = decodeNativePcm(evidence.output);
  for (const [name, read] of [['source', sourceSignal], ['intermediate', intermediateSignal], ['output', outputSignal]] as const) {
    if (read.state !== 'OK') failures.push(`${name} PCM decode ${read.state} [${read.reasonCode}]`);
  }
  let intermediateMismatches = 0;
  let outputMismatches = 0;
  if (sourceSignal.state === 'OK' && intermediateSignal.state === 'OK' && outputSignal.state === 'OK') {
    const count = Math.min(sourceSignal.value.samples.length, intermediateSignal.value.samples.length, outputSignal.value.samples.length);
    for (let i = 0; i < count; i++) {
      if (sourceSignal.value.samples[i] !== intermediateSignal.value.samples[i]) intermediateMismatches++;
      if (sourceSignal.value.samples[i] !== outputSignal.value.samples[i]) outputMismatches++;
    }
    if (intermediateMismatches > 0) failures.push(`leg 1 changed ${intermediateMismatches} normalized sample(s)`);
    if (outputMismatches > 0) failures.push(`round-trip changed ${outputMismatches} normalized sample(s)`);
  }
  const measurements = {
    sourceSampleFrames: source.sampleFrames,
    intermediateSampleFrames: intermediate.sampleFrames,
    outputSampleFrames: output.sampleFrames,
    intermediateMismatches,
    outputMismatches,
    intermediateBigEndianObserved: intermediate.endianness === 'big' ? 1 : 0,
    legCountObserved: 2,
  };
  if (failures.length > 0) {
    return {
      state: 'VERDICT', oracle: 'property-invariant', verdict: 'FAIL',
      reasonCode: 'AUDIO_ENDIAN_ROUNDTRIP_FAILED', detail: failures.join('; '), measurements,
    };
  }
  return {
    state: 'VERDICT', oracle: 'property-invariant', verdict: 'PASS',
    reasonCode: 'AUDIO_ENDIAN_ROUNDTRIP_OBSERVED',
    detail: 'observed WAV/s16le -> AIFF/s16be -> WAV/s16le with identical normalized samples on both legs',
    measurements,
  };
}
