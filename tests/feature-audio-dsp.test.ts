import { describe, expect, test } from 'bun:test';
import {
  audioDspContractForScenario,
  audioDspContractScenarioIds,
  audioSampleFrameNumeratorFromBytes,
  compareNativeRateEvidence,
  decodeNativePcm,
  deriveAudioScenarioSummary,
  evaluateAudioDspTransform,
  evaluateEndiannessRoundTrip,
  evaluateGaplessNativeEvidence,
  readPcmStructure,
  sampleFrameThroughput,
  type AudioTransformContract,
  type GaplessNativeEvidence,
} from '../src/features/audio-dsp/index.ts';
import { audioDspScenarios } from '../src/scenarios/audio-dsp/index.ts';
import { demuxMp4GaplessAudio } from '../src/engines/platform/demux-mp4.ts';

const AUDIO_MEDIA = 'fixtures/media';

describe('REQ-FEAT-62/63 native PCM readers and evidence', () => {
  test('reads RIFF, WAVEFORMATEXTENSIBLE, AIFF and CAF with native shape', async () => {
    const cases = [
      ['wav_s16.wav', 'wav', 'pcm-s16', 48_000, 2, 240_000, 'inferred-count'],
      ['wav_f32.wav', 'wav', 'pcm-f32', 48_000, 2, 240_000, 'inferred-count'],
      ['wav_5_1.wav', 'wav', 'pcm-s16', 48_000, 6, 480_000, 'explicit-mask'],
      ['pcm_s16be.aiff', 'aiff', 'pcm-s16be', 48_000, 2, 240_000, 'inferred-count'],
      ['pcm_s24be.aiff', 'aiff', 'pcm-s24be', 48_000, 2, 240_000, 'inferred-count'],
      ['pcm_s16.caf', 'caf', 'pcm-s16', 48_000, 2, 240_000, 'container-tag'],
    ] as const;
    for (const [file, container, codec, rate, channels, frames, layoutSource] of cases) {
      const bytes = await fixture(file);
      const result = readPcmStructure(bytes);
      expect(result.state).toBe('OK');
      if (result.state !== 'OK') continue;
      expect(result.value).toMatchObject({
        schema: 'media-test/audio-structure@1', source: 'container-pcm-reader',
        container, codec, sampleRate: rate, channels, sampleFrames: frames,
        channelLayoutSource: layoutSource,
      });
      expect(result.value.durationSec).toBe(frames / rate);
      expect(result.value.dataSpans.length).toBeGreaterThan(0);
    }
    const surround = readPcmStructure(await fixture('wav_5_1.wav'));
    expect(surround.state === 'OK' ? surround.value.channelLayout : []).toEqual(['FL', 'FR', 'FC', 'LFE', 'BL', 'BR']);
  });

  test('malformed/truncated PCM is a typed reader result, never a throw or invented NA', () => {
    const truncated = readPcmStructure(new TextEncoder().encode('RIFF'));
    expect(truncated).toMatchObject({ state: 'UNSUPPORTED_FORMAT', reasonCode: 'AUDIO_CONTAINER_UNSUPPORTED' });
    const invalid = wav([[0, 0.1, -0.1]], 48_000, { bits: 16 });
    new DataView(invalid.buffer).setUint32(24, 0, true);
    expect(readPcmStructure(invalid)).toMatchObject({ state: 'MALFORMED', reasonCode: 'AUDIO_SAMPLE_RATE_INVALID' });
  });

  test('native verdict ignores host AudioContext rate and catches a mislabeled/wrong rate', () => {
    const bytes = wav([tone(440, 48_000, 1024)], 48_000, { bits: 16 });
    const read = decodeNativePcm(bytes);
    expect(read.state).toBe('OK');
    if (read.state !== 'OK') return;
    const at441 = compareNativeRateEvidence(read.value, read.value, 44_100);
    const at480 = compareNativeRateEvidence(read.value, read.value, 48_000);
    expect(at441.state === 'VERDICT' ? at441.verdict : '').toBe('PASS');
    expect(at480.state === 'VERDICT' ? at480.verdict : '').toBe('PASS');
    expect(at441.reasonCode).toBe(at480.reasonCode);
    const wrong = { ...read.value, sampleRate: 44_100 };
    const failed = compareNativeRateEvidence(read.value, wrong, 48_000);
    expect(failed.state === 'VERDICT' ? failed.verdict : '').toBe('FAIL');
  });
});

describe('REQ-FEAT-61 transform-specific sample and spectral contracts', () => {
  test('all live conversion rows select the neutral two-layer invariant and an authored contract', () => {
    const ids = [
      'resample_48k_to_44k1', 'resample_44k1_to_48k', 'resample_48k_to_16k',
      'downmix_stereo_to_mono', 'upmix_mono_to_stereo', 'downmix_5_1_to_stereo', 'upmix_stereo_to_5_1',
      'gain_minus6db_s16', 'gain_half_f32', 'fade_in_out_f32',
      'pcm_s16_to_f32', 'pcm_f32_to_s16', 'pcm_s24_to_s16', 'pcm_s24_to_f32',
      'pcm_s16be_to_s16le', 'pcm_s16le_to_s16be', 'pcm_s24be_to_s16le',
    ];
    for (const id of ids) {
      expect(audioDspContractForScenario(`audio-dsp/${id}`)).toBeDefined();
      const scenario = audioDspScenarios.find((item) => item.id === `audio-dsp/${id}`)!;
      expect((scenario.options as Record<string, unknown>).invariant).toBe('audio-dsp-transform');
    }
    expect(audioDspContractScenarioIds().length).toBeGreaterThanOrEqual(ids.length);
  });

  test('alternate valid resampler output is a representation-diff PASS; seeded spectral fault is FAIL', () => {
    const sourceRate = 48_000;
    const outputRate = 16_000;
    const durationSec = 0.25;
    const frequencies = [440, 1_000, 3_000];
    const source = wav([multiTone(frequencies, sourceRate, durationSec)], sourceRate, { bits: 16 });
    // Independently sampled waveform is a lawful alternate representation, not byte identity.
    const output = wav([multiTone(frequencies, outputRate, durationSec)], outputRate, { bits: 16 });
    const contract: AudioTransformContract = {
      kind: 'resample', container: 'wav', codec: 'pcm-s16', sampleRate: outputRate,
      probeFrequenciesHz: frequencies, maxSpectralDeltaDb: 0.35, maxRmsDeltaDb: 0.25,
      durationFrameTolerance: 1,
    };
    const valid = evaluateAudioDspTransform('test/resample', source, output, contract);
    // Alternate representation is a PASS, distinguished from byte identity by its reasonCode.
    expect(valid.state === 'VERDICT' ? valid.verdict : '').toBe('PASS');
    expect(valid.reasonCode).toBe('AUDIO_VALID_REPRESENTATION_DIFFERENCE');

    const fault = wav([new Float64Array(Math.round(outputRate * durationSec))], outputRate, { bits: 16 });
    const invalid = evaluateAudioDspTransform('test/resample', source, fault, contract);
    expect(invalid.state === 'VERDICT' ? invalid.verdict : '').toBe('FAIL');
  });

  test('explicit 5.1 matrix checks every impulse/routing coefficient, tones, clipping, and silence', () => {
    const rate = 48_000;
    const frames = 4_800;
    const sourceChannels = Array.from({ length: 6 }, (_, channel) => {
      const samples = multiTone([220 + channel * 110, 1_000 + channel * 100, 3_000 + channel * 100], rate, frames / rate, 0.01);
      samples[10 + channel * 40] = 0.5; // one isolated impulse in every source channel
      return samples;
    });
    // Exercise clipping explicitly without hiding routing: FL + FC + BL exceed full scale in L.
    sourceChannels[0]![100] = 0.8;
    sourceChannels[2]![100] = 0.8;
    sourceChannels[4]![100] = 0.8;
    // And an authored silent span that must remain silent.
    for (const channel of sourceChannels) channel.fill(0, 200, 240);
    const sourceBytes = wav(sourceChannels, rate, { bits: 16, extensible: true, channelMask: 0x3f });
    const sourceRead = decodeNativePcm(sourceBytes);
    expect(sourceRead.state).toBe('OK');
    if (sourceRead.state !== 'OK') return;
    const matrix = [
      [1, 0, Math.SQRT1_2, 0, Math.SQRT1_2, 0],
      [0, 1, Math.SQRT1_2, 0, 0, Math.SQRT1_2],
    ];
    const mixed = applyMatrix(sourceRead.value.samples, frames, 6, matrix);
    const outputBytes = wav(mixed, rate, { bits: 16 });
    const contract: AudioTransformContract = {
      kind: 'channel-matrix', container: 'wav', codec: 'pcm-s16', channels: 2,
      inputLayout: ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR'], outputLayout: ['FL', 'FR'],
      channelLayout: ['FL', 'FR'], matrix, maxAbsoluteError: 2 / 32768, clip: true,
    };
    const valid = evaluateAudioDspTransform('test/matrix', sourceBytes, outputBytes, contract);
    expect(valid.state === 'VERDICT' ? valid.verdict : '').toBe('PASS');
    expect(valid.state === 'VERDICT' ? valid.measurements?.signalChecks : 0).toBeGreaterThan(frames);

    mixed[0]![10] = 0; // seeded FL impulse routing fault
    const invalid = evaluateAudioDspTransform('test/matrix', sourceBytes, wav(mixed, rate, { bits: 16 }), contract);
    expect(invalid.state === 'VERDICT' ? invalid.verdict : '').toBe('FAIL');
  });

  test('gain, fade and declared quantization each reject one seeded sample-domain fault', () => {
    const rate = 8_000;
    const frames = rate * 2;
    const inputSamples = multiTone([220, 440, 1_000], rate, frames / rate, 0.2);

    const gainSource = wav([inputSamples], rate, { bits: 32, float: true });
    const gainOutputSamples = inputSamples.map((value) => value * 0.5);
    const gainContract: AudioTransformContract = {
      kind: 'gain', container: 'wav', codec: 'pcm-f32', linearGain: 0.5,
      maxGainDeltaDb: 0.001, maxAbsoluteError: 1e-6,
    };
    expect(verdict(evaluateAudioDspTransform('test/gain', gainSource,
      wav([gainOutputSamples], rate, { bits: 32, float: true }), gainContract))).toBe('PASS');
    gainOutputSamples[123] = 0.9;
    expect(verdict(evaluateAudioDspTransform('test/gain-fault', gainSource,
      wav([gainOutputSamples], rate, { bits: 32, float: true }), gainContract))).toBe('FAIL');

    const fadeSource = wav([inputSamples], rate, { bits: 32, float: true });
    const fadeSamples = inputSamples.map((value, frame) => {
      const inFrames = rate;
      const outStart = frames - rate;
      const a = frame < inFrames ? frame / (inFrames - 1) : 1;
      const b = frame >= outStart ? (frames - 1 - frame) / (rate - 1) : 1;
      return value * a * b;
    });
    const fadeContract: AudioTransformContract = {
      kind: 'fade', container: 'wav', codec: 'pcm-f32', curve: 'linear', fadeInSec: 1,
      fadeOutSec: 1, maxEnvelopeError: 2e-5,
    };
    expect(verdict(evaluateAudioDspTransform('test/fade', fadeSource,
      wav([fadeSamples], rate, { bits: 32, float: true }), fadeContract))).toBe('PASS');
    fadeSamples[Math.floor(rate / 2)] += 0.1;
    expect(verdict(evaluateAudioDspTransform('test/fade-fault', fadeSource,
      wav([fadeSamples], rate, { bits: 32, float: true }), fadeContract))).toBe('FAIL');

    const quantSource = wav([inputSamples], rate, { bits: 32, float: true });
    const quantOutput = wav([inputSamples], rate, { bits: 16 });
    const quantContract: AudioTransformContract = {
      kind: 'sample-format', container: 'wav', codec: 'pcm-s16',
      policy: { dither: 'none', rounding: 'nearest-even', clipping: 'saturate' }, maxErrorLsb: 1,
    };
    expect(verdict(evaluateAudioDspTransform('test/quantize', quantSource, quantOutput, quantContract))).toBe('PASS');
    const quantFault = inputSamples.slice();
    quantFault[77] += 0.25;
    expect(verdict(evaluateAudioDspTransform('test/quantize-fault', quantSource,
      wav([quantFault], rate, { bits: 16 }), quantContract))).toBe('FAIL');
  });
});

describe('REQ-FEAT-64 priming-aware native-rate gapless contract', () => {
  test('pinned AAC fixture exposes independent coded/edit-list/priming/remainder facts', async () => {
    const track = demuxMp4GaplessAudio(await fixture('gapless_aac.m4a'));
    expect(track.config).toMatchObject({ codecString: 'mp4a.40.2', audioObjectType: 2, sampleRate: 44_100, channels: 2 });
    expect(track.config.description?.byteLength).toBeGreaterThan(0);
    expect(track).toMatchObject({
      codedSampleFrames: 46_080,
      primingFrames: 1_024,
      remainderFrames: 383,
      presentationSampleFrames: 44_673,
      editListMediaStartFrame: 1_024,
      timingSource: 'edit-list',
    });
  });

  test('independent priming/remainder/edit-list variations report facts; program loss/addition fails', () => {
    const baseTrack = {
      nativeSampleRate: 44_100,
      codedSampleFrames: 46_080,
      primingFrames: 1_024,
      remainderFrames: 383,
      presentationSampleFrames: 44_673,
      editListMediaStartFrame: 1_024,
      rawDecodedSampleFrames: 46_080,
      decodedSampleFrames: 44_673,
      decodedSampleRate: 44_100,
      discardedPrimingFrames: 1_024,
      discardedRemainderFrames: 383,
      timingSource: 'edit-list' as const,
    };
    const base: GaplessNativeEvidence = {
      reference: baseTrack,
      candidate: { ...baseTrack },
      leadingExtraFrames: 0,
      trailingExtraFrames: 0,
      evidenceSource: 'container-timing+webcodecs',
    };
    const variants = [
      base,
      { ...base, candidate: { ...base.candidate, codedSampleFrames: 46_592, rawDecodedSampleFrames: 46_592, primingFrames: 1_536, discardedPrimingFrames: 1_536, editListMediaStartFrame: 1_536 } },
      { ...base, candidate: { ...base.candidate, codedSampleFrames: 46_592, rawDecodedSampleFrames: 46_592, remainderFrames: 895, discardedRemainderFrames: 895 } },
      { ...base, candidate: { ...base.candidate, presentationSampleFrames: 44_674, decodedSampleFrames: 44_674 } }, // one-frame timebase rounding
    ];
    for (const item of variants) {
      const outcome = evaluateGaplessNativeEvidence(item);
      expect(verdict(outcome)).toBe('PASS');
      expect(outcome.state === 'VERDICT' ? outcome.measurements?.primingFrames : undefined).toBe(item.candidate.primingFrames);
      expect(outcome.state === 'VERDICT' ? outcome.measurements?.remainderFrames : undefined).toBe(item.candidate.remainderFrames);
    }
    expect(verdict(evaluateGaplessNativeEvidence({ ...base, candidate: { ...base.candidate, decodedSampleFrames: base.candidate.decodedSampleFrames - 2 } }))).toBe('FAIL');
    expect(verdict(evaluateGaplessNativeEvidence({ ...base, leadingExtraFrames: 2 }))).toBe('FAIL');
  });
});

describe('REQ-FEAT-65 sample-frame throughput', () => {
  test('encode numerators are positive decoded output sample frames and channel-independent', () => {
    const frames = 4_800;
    const stereo = [tone(440, 48_000, frames), tone(440, 48_000, frames)];
    const wavS24 = wav(stereo, 48_000, { bits: 24 });
    const aiffS16 = aiff(stereo, 48_000);
    for (const bytes of [wavS24, aiffS16]) {
      const numerator = audioSampleFrameNumeratorFromBytes(bytes);
      expect(numerator.state).toBe('OK');
      if (numerator.state !== 'OK') continue;
      expect(numerator.value.sampleFrames).toBe(frames);
      const throughput = sampleFrameThroughput(numerator.value, 200, 3);
      expect(throughput.n).toBe(3);
      expect(throughput.sampleFramesPerSec).toBeGreaterThan(0);
      expect(Number.isFinite(throughput.sampleFramesPerSec)).toBe(true);
    }
    const sixChannel = wav(Array.from({ length: 6 }, () => tone(440, 48_000, frames)), 48_000,
      { bits: 16, extensible: true, channelMask: 0x3f });
    const two = audioSampleFrameNumeratorFromBytes(wav(stereo, 48_000, { bits: 16 }));
    const six = audioSampleFrameNumeratorFromBytes(sixChannel);
    expect(two.state === 'OK' ? two.value.sampleFrames : -1).toBe(frames);
    expect(six.state === 'OK' ? six.value.sampleFrames : -1).toBe(frames);
    if (two.state === 'OK' && six.state === 'OK') {
      expect(sampleFrameThroughput(two.value, 100).sampleFramesPerSec)
        .toBe(sampleFrameThroughput(six.value, 100).sampleFramesPerSec);
      expect(six.value.scalarSamples).toBe(two.value.scalarSamples * 3);
    }
  });
});

describe('REQ-FEAT-66 observable endianness round trip', () => {
  test('genuine WAV/s16le -> AIFF/s16be -> WAV/s16le passes; bypassed intermediate fails', () => {
    const channels = [multiTone([440, 1_000], 8_000, 0.1), multiTone([660, 2_000], 8_000, 0.1)];
    const source = wav(channels, 8_000, { bits: 16 });
    const normalized = decodeNativePcm(source);
    expect(normalized.state).toBe('OK');
    if (normalized.state !== 'OK') return;
    const split = deinterleave(normalized.value.samples, normalized.value.channels);
    const intermediate = aiff(split, 8_000);
    const output = wav(split, 8_000, { bits: 16 });
    expect(verdict(evaluateEndiannessRoundTrip({ source, intermediate, output }))).toBe('PASS');
    const bypass = evaluateEndiannessRoundTrip({ source, intermediate: source, output });
    expect(verdict(bypass)).toBe('FAIL');
    expect(bypass.detail).toContain('intermediate must be AIFF/pcm-s16be/big');
  });
});

describe('REQ-FEAT-67 manifest-derived scenario display facts', () => {
  test('summary reports actual operation, asset, transform, oracle and evidence without stale notes', async () => {
    const manifestJson = await Bun.file('fixtures/manifest.json').json() as { assets: Array<Record<string, unknown>> };
    const manifest = manifestJson.assets as never[];
    const caf = audioDspScenarios.find((item) => item.id === 'audio-dsp/caf_container_probe')!;
    const cafSummary = deriveAudioScenarioSummary(caf, manifest);
    expect(cafSummary.operation).toBe('probe');
    expect(cafSummary.assets[0]).toMatchObject({ id: 'pcm_s16.caf', declared: true, available: true });
    expect(cafSummary.activeOracles).toEqual(['golden-metadata']);
    expect(cafSummary.missingEvidence).toEqual([]);
    expect(cafSummary.text).not.toContain('until baked');

    const gapless = audioDspScenarios.find((item) => item.id === 'audio-dsp/edge_gapless_aac_decode')!;
    const gaplessSummary = deriveAudioScenarioSummary(gapless, manifest);
    expect(gaplessSummary.operation).toBe('trim');
    expect(gaplessSummary.requestedTransform).toContain('range=0..1012993us');
    expect(gaplessSummary.activeOracles).toContain('property-invariant');
    expect(gaplessSummary.text).toContain('gapless_aac.m4a (available)');
  });
});

async function fixture(name: string): Promise<Uint8Array> {
  return new Uint8Array(await Bun.file(`${AUDIO_MEDIA}/${name}`).arrayBuffer());
}

function verdict(outcome: { state: string; verdict?: string }): string {
  return outcome.state === 'VERDICT' ? outcome.verdict ?? '' : outcome.state;
}

function tone(frequency: number, sampleRate: number, frames: number, amplitude = 0.25): Float64Array {
  const out = new Float64Array(frames);
  for (let i = 0; i < frames; i++) out[i] = amplitude * Math.sin(2 * Math.PI * frequency * i / sampleRate);
  return out;
}

function multiTone(frequencies: number[], sampleRate: number, durationSec: number, amplitude = 0.12): Float64Array {
  const frames = Math.round(sampleRate * durationSec);
  const out = new Float64Array(frames);
  for (let i = 0; i < frames; i++) {
    for (const frequency of frequencies) out[i] += amplitude * Math.sin(2 * Math.PI * frequency * i / sampleRate);
  }
  return out;
}

function applyMatrix(
  interleaved: Float64Array,
  frames: number,
  inputChannels: number,
  matrix: number[][],
): Float64Array[] {
  return matrix.map((row) => {
    const out = new Float64Array(frames);
    for (let frame = 0; frame < frames; frame++) {
      for (let channel = 0; channel < inputChannels; channel++) {
        out[frame] += interleaved[frame * inputChannels + channel]! * row[channel]!;
      }
      out[frame] = Math.max(-1, Math.min(1, out[frame]!));
    }
    return out;
  });
}

function deinterleave(samples: Float64Array, channels: number): Float64Array[] {
  const frames = samples.length / channels;
  return Array.from({ length: channels }, (_, channel) => {
    const out = new Float64Array(frames);
    for (let frame = 0; frame < frames; frame++) out[frame] = samples[frame * channels + channel]!;
    return out;
  });
}

function wav(
  channels: ArrayLike<ArrayLike<number>>,
  sampleRate: number,
  opts: { bits: 16 | 24 | 32; float?: boolean; extensible?: boolean; channelMask?: number },
): Uint8Array {
  const channelCount = channels.length;
  const frames = channels[0]?.length ?? 0;
  if (!channels.every((channel) => channel.length === frames)) throw new Error('channel length mismatch');
  const bytesPerSample = opts.bits / 8;
  const blockAlign = channelCount * bytesPerSample;
  const fmtSize = opts.extensible ? 40 : 16;
  const dataBytes = frames * blockAlign;
  const total = 12 + 8 + fmtSize + 8 + dataBytes + (dataBytes & 1);
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  text(bytes, 0, 'RIFF');
  view.setUint32(4, total - 8, true);
  text(bytes, 8, 'WAVE');
  text(bytes, 12, 'fmt ');
  view.setUint32(16, fmtSize, true);
  const formatTag = opts.extensible ? 0xfffe : opts.float ? 3 : 1;
  view.setUint16(20, formatTag, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, opts.bits, true);
  if (opts.extensible) {
    view.setUint16(36, 22, true);
    view.setUint16(38, opts.bits, true);
    view.setUint32(40, opts.channelMask ?? 0, true);
    view.setUint16(44, opts.float ? 3 : 1, true);
    view.setUint16(46, 0, true);
    bytes.set([0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71], 48);
  }
  const dataHeader = 20 + fmtSize;
  text(bytes, dataHeader, 'data');
  view.setUint32(dataHeader + 4, dataBytes, true);
  let offset = dataHeader + 8;
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channelCount; channel++) {
      const value = Math.max(-1, Math.min(1, Number(channels[channel]![frame])));
      if (opts.float) view.setFloat32(offset, value, true);
      else if (opts.bits === 16) view.setInt16(offset, quantize(value, 16), true);
      else if (opts.bits === 24) writeInt24(bytes, offset, quantize(value, 24), true);
      else view.setInt32(offset, quantize(value, 32), true);
      offset += bytesPerSample;
    }
  }
  return bytes;
}

function aiff(channels: ArrayLike<ArrayLike<number>>, sampleRate: number): Uint8Array {
  const channelCount = channels.length;
  const frames = channels[0]?.length ?? 0;
  if (!channels.every((channel) => channel.length === frames)) throw new Error('channel length mismatch');
  const dataBytes = frames * channelCount * 2;
  const total = 12 + 8 + 18 + 8 + 8 + dataBytes + (dataBytes & 1);
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  text(bytes, 0, 'FORM');
  view.setUint32(4, total - 8, false);
  text(bytes, 8, 'AIFF');
  text(bytes, 12, 'COMM');
  view.setUint32(16, 18, false);
  view.setUint16(20, channelCount, false);
  view.setUint32(22, frames, false);
  view.setUint16(26, 16, false);
  writeExtended80(view, 28, sampleRate);
  text(bytes, 38, 'SSND');
  view.setUint32(42, dataBytes + 8, false);
  view.setUint32(46, 0, false);
  view.setUint32(50, 0, false);
  let offset = 54;
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channelCount; channel++) {
      view.setInt16(offset, quantize(Number(channels[channel]![frame]), 16), false);
      offset += 2;
    }
  }
  return bytes;
}

function quantize(value: number, bits: number): number {
  const scale = 2 ** (bits - 1);
  return Math.max(-scale, Math.min(scale - 1, Math.round(Math.max(-1, Math.min(1, value)) * scale)));
}

function writeInt24(bytes: Uint8Array, offset: number, signed: number, little: boolean): void {
  const value = signed < 0 ? signed + 0x1000000 : signed;
  if (little) {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
    bytes[offset + 2] = (value >>> 16) & 0xff;
  } else {
    bytes[offset] = (value >>> 16) & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
    bytes[offset + 2] = value & 0xff;
  }
}

function writeExtended80(view: DataView, offset: number, value: number): void {
  const exponent = Math.floor(Math.log2(value));
  const normalized = value / 2 ** exponent;
  const mantissa = BigInt(Math.round(normalized * 2 ** 31)) << 32n;
  view.setUint16(offset, exponent + 16383, false);
  view.setUint32(offset + 2, Number((mantissa >> 32n) & 0xffffffffn), false);
  view.setUint32(offset + 6, Number(mantissa & 0xffffffffn), false);
}

function text(bytes: Uint8Array, offset: number, value: string): void {
  for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
}
