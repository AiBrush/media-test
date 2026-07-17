import { afterEach, describe, expect, test } from 'bun:test';

import type { FrameSink, MediaBytes, MediaInput } from '../src/core/engine.ts';
import {
  emptyGoldenStore,
  runOracle,
  type OracleContext,
} from '../src/core/oracles.ts';
import { defineScenario, type Scenario } from '../src/core/scenario.ts';
import {
  TRANSCODE_ABR_RENDITION_SET_ROLE,
  readTranscodeAudioStructure,
  readTranscodeTransformSignal,
} from '../src/features/transcode/index.ts';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const originalAudioContext = (globalThis as Record<string, unknown>).AudioContext;

afterEach(() => {
  if (originalAudioContext === undefined) delete (globalThis as Record<string, unknown>).AudioContext;
  else (globalThis as Record<string, unknown>).AudioContext = originalAudioContext;
});

describe('production transcode oracle integration', () => {
  test('REQ-FEAT-20 rotation no-op fails even when output is structurally valid and playable', async () => {
    const bytes = await fixtureBytes('tiny_h264_360p_2s.mp4');
    const sourcePixels = rgba([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 0, 255,
    ], 2, 2);
    const rotatedPixels = rgba([
      255, 255, 0, 255, 0, 0, 255, 255,
      0, 255, 0, 255, 255, 0, 0, 255,
    ], 2, 2);
    const scenario = effectScenario('h264_rotate_180');

    const passOutcome = await runOracle('property-invariant', context({
      scenario,
      sourceBytes: bytes,
      output: media(bytes, 'mp4'),
      sourcePixels,
      candidatePixels: rotatedPixels,
    }));
    expect(passOutcome).toMatchObject({
      state: 'VERDICT',
      verdict: 'PASS',
      reasonCode: 'TRANSCODE_TRANSFORM_EFFECT_MATCH',
    });

    const ignored = await runOracle('property-invariant', context({
      scenario,
      sourceBytes: bytes,
      output: media(bytes, 'mp4'),
      sourcePixels,
      candidatePixels: sourcePixels,
    }));
    expect(ignored).toMatchObject({
      state: 'VERDICT',
      verdict: 'FAIL',
      reasonCode: 'TRANSCODE_TRANSFORM_EFFECT_NOT_OBSERVED',
    });
  });

  test('REQ-FEAT-20 neutral signaling makes colorspace, tone-map, and depth no-ops non-passing', async () => {
    const cases = [
      ['h264_colorspace_709_to_2020', 'realworld_mdn_flower.mp4'],
      ['hdr10_to_sdr_tonemap', 'hdr10_pq_micro_hevc.mp4'],
      ['h264_8bit_to_hevc_10bit', 'tiny_h264_360p_2s.mp4'],
    ] as const;
    const pixels = rgba([
      230, 30, 20, 255, 20, 190, 35, 255,
      25, 40, 220, 255, 190, 130, 15, 255,
    ], 2, 2);
    for (const [id, fixture] of cases) {
      const bytes = await fixtureBytes(fixture);
      const outcome = await runOracle('property-invariant', context({
        scenario: effectScenario(id),
        sourceBytes: bytes,
        output: media(bytes, 'mp4'),
        sourcePixels: pixels,
        candidatePixels: pixels,
      }));
      expect(outcome.state, id).toBe('VERDICT');
      if (outcome.state === 'VERDICT') expect(outcome.verdict, id).toBe('FAIL');
      expect(outcome.reasonCode, id).toBe('TRANSCODE_TRANSFORM_SIGNALING_MISMATCH');
    }

    expect(readTranscodeTransformSignal(
      await fixtureBytes('h264_10bit_1080p_5s.mp4'),
      'mp4',
    )).toMatchObject({ state: 'OK', value: { bitDepth: 10, rotationDegrees: 0 } });
    expect(readTranscodeTransformSignal(
      await fixtureBytes('vp9_alpha.webm'),
      'webm',
    )).toMatchObject({ state: 'OK', value: { alphaMode: 'straight' } });
  });

  test('REQ-FEAT-21 lossless PCM is scored in the property oracle, including excess samples', async () => {
    const exact = wave([0.25, -0.25, 0.5, -0.5], 2, 48_000);
    const changed = wave([0.25, -0.25, 0.5, -0.25], 2, 48_000);
    const excess = wave([0.25, -0.25, 0.5, -0.5, 0.1, -0.1], 2, 48_000);
    const scenario = audioScenario('aac_to_pcm_wav_extract', 'wav', 'pcm-s16');

    const passOutcome = await runOracle('property-invariant', audioContext(scenario, exact, exact, 'wav'));
    expect(passOutcome).toMatchObject({
      state: 'VERDICT', verdict: 'PASS', reasonCode: 'TRANSCODE_AUDIO_LOSSLESS_MATCH',
    });
    const changedOutcome = await runOracle('property-invariant', audioContext(scenario, exact, changed, 'wav'));
    expect(changedOutcome).toMatchObject({
      state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_AUDIO_LOSSLESS_CONTENT_MISMATCH',
    });
    const excessOutcome = await runOracle('property-invariant', audioContext(scenario, exact, excess, 'wav'));
    expect(excessOutcome).toMatchObject({
      state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_AUDIO_EXCESS_SAMPLES',
    });
  });

  test('REQ-FEAT-21 AAC edit-list priming selects the program interval and rejects count drift', async () => {
    const candidateBytes = await fixtureBytes('gapless_aac.m4a');
    const structure = readTranscodeAudioStructure(candidateBytes, 'mp4');
    expect(structure).toMatchObject({
      state: 'OK', value: { timeline: { kind: 'aac-isobmff', timingSource: 'edit-list' } },
    });
    if (structure.state !== 'OK' || !structure.value.sampleFrames) return;
    const { sampleFrames, sampleRate, channels } = structure.value;
    const sourceSamples = patternedSamples(sampleFrames, channels);
    const sourceBytes = wave(sourceSamples, channels, sampleRate);
    const scenario = audioScenario('gapless_pcm_to_aac_priming', 'mp4', 'aac');

    installFakeAudioContext(sourceSamples, sampleFrames, channels, sampleRate);
    const passOutcome = await runOracle(
      'property-invariant',
      audioContext(scenario, sourceBytes, candidateBytes, 'mp4'),
    );
    expect(passOutcome).toMatchObject({
      state: 'VERDICT', verdict: 'PASS', reasonCode: 'TRANSCODE_AUDIO_LOSSY_CONTENT_MATCH',
    });

    installFakeAudioContext(
      [...sourceSamples, ...new Array(channels).fill(0.25)],
      sampleFrames + 1,
      channels,
      sampleRate,
    );
    const drift = await runOracle(
      'property-invariant',
      audioContext(scenario, sourceBytes, candidateBytes, 'mp4'),
    );
    expect(drift).toMatchObject({
      state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_AUDIO_PRESENTATION_COUNT_MISMATCH',
    });
  });

  test('REQ-FEAT-22 four valid files are insufficient without set and switch-decode evidence', async () => {
    const bytes = await fixtureBytes('tiny_h264_360p_2s.mp4');
    const pixels = rgba([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 0, 255,
    ], 2, 2);
    const scenario = abrScenario();
    const variants = new Array(4).fill(undefined).map(() => media(bytes, 'mp4'));
    const output: MediaBytes = { ...variants[0]!, variants };
    const noDescription = await runOracle('fanout-renditions', context({
      scenario,
      sourceBytes: bytes,
      output,
      sourcePixels: pixels,
      candidatePixels: pixels,
    }));
    expect(noDescription).toMatchObject({
      state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_ABR_DESCRIPTION_MISSING',
    });

    const description = new TextEncoder().encode(JSON.stringify({
      kind: 'explicit',
      id: 'h264-main-abr',
      renditionIds: ['1080p', '720p', '480p', '360p'],
      switchPointsUs: [0],
      segmentMode: 'random-access',
    }));
    const explicitOnly: MediaBytes = {
      ...output,
      intermediates: [{
        role: TRANSCODE_ABR_RENDITION_SET_ROLE,
        bytes: description,
        mime: 'application/json',
        container: 'json',
      }],
    };
    const noSwitches = await runOracle('fanout-renditions', context({
      scenario,
      sourceBytes: bytes,
      output: explicitOnly,
      sourcePixels: pixels,
      candidatePixels: pixels,
    }));
    expect(noSwitches).toMatchObject({
      state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_ABR_SWITCH_DECODE_EVIDENCE_MISSING',
    });
  });
});

function effectScenario(id: string): Scenario {
  return defineScenario({
    id: `transcode/${id}`,
    op: 'transcode',
    input: 'source.mp4',
    options: { container: 'mp4', video: { codec: 'h264' }, invariant: 'transcode-effect-aware' },
    requires: { operations: ['transcode'] },
    oracles: ['property-invariant'],
    metrics: ['wall'],
  });
}

function audioScenario(id: string, container: string, codec: string): Scenario {
  return defineScenario({
    id: `transcode/${id}`,
    op: 'transcode',
    input: 'source.wav',
    options: { container, audio: { codec }, invariant: 'transcode-audio-content' },
    requires: { operations: ['transcode'] },
    oracles: ['property-invariant'],
    metrics: ['wall'],
  });
}

function abrScenario(): Scenario {
  return defineScenario({
    id: 'transcode/fanout_h264_abr_ladder',
    op: 'transcode',
    input: 'source.mp4',
    options: {
      container: 'mp4',
      video: { codec: 'h264' },
      variants: [
        { codec: 'h264', width: 1920, height: 1080, bitrate: 5_000_000 },
        { codec: 'h264', width: 1280, height: 720, bitrate: 2_800_000 },
        { codec: 'h264', width: 854, height: 480, bitrate: 1_400_000 },
        { codec: 'h264', width: 640, height: 360, bitrate: 800_000 },
      ],
    },
    requires: { operations: ['transcode'] },
    oracles: ['fanout-renditions'],
    metrics: ['wall'],
    tolerances: { ssimMin: 0.95 },
    renditionIds: ['1080p', '720p', '480p', '360p'],
  });
}

function context(input: {
  scenario: Scenario;
  sourceBytes: Uint8Array;
  output: MediaBytes;
  sourcePixels: ImageData;
  candidatePixels: ImageData;
}): OracleContext {
  const mediaInput = inputFromBytes(input.sourceBytes, input.scenario.input as string, 'video/mp4');
  return {
    scenario: input.scenario,
    input: mediaInput,
    output: input.output,
    golden: emptyGoldenStore(),
    decodeWithPlatform: async (bytes) => sink(
      bytes === input.output || bytes.bytes === input.output.bytes
        ? input.candidatePixels
        : input.sourcePixels,
    ),
    playbackSmoke: async () => true,
  };
}

function audioContext(
  scenario: Scenario,
  source: Uint8Array,
  output: Uint8Array,
  container: string,
): OracleContext {
  return {
    scenario,
    input: inputFromBytes(source, 'source.wav', 'audio/wav'),
    output: media(output, container, container === 'wav' ? 'audio/wav' : 'audio/mp4'),
    golden: emptyGoldenStore(),
    decodeWithPlatform: async () => ({ frames: [] }),
    playbackSmoke: async () => true,
  };
}

function inputFromBytes(bytes: Uint8Array, id: string, mime: string): MediaInput {
  return {
    id,
    url: `memory:${id}`,
    mime,
    sizeBytes: bytes.byteLength,
    blob: async () => new Blob([bytes], { type: mime }),
    arrayBuffer: async () => bytes.slice().buffer,
  };
}

function media(bytes: Uint8Array, container: string, mime = 'video/mp4'): MediaBytes {
  return { bytes, container, mime };
}

function sink(pixels: ImageData): FrameSink {
  return {
    frames: [{ index: 0, ptsUs: 0, sha256: '0'.repeat(64), width: pixels.width, height: pixels.height }],
    getPixels: async () => pixels,
  };
}

function rgba(values: readonly number[], width: number, height: number): ImageData {
  return { data: new Uint8ClampedArray(values), width, height, colorSpace: 'srgb' } as ImageData;
}

function wave(samples: readonly number[], channels: number, sampleRate: number): Uint8Array {
  const frames = samples.length / channels;
  if (!Number.isSafeInteger(frames)) throw new TypeError('WAV samples must contain complete frames');
  const dataBytes = samples.length * 2;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  writeAscii(bytes, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(bytes, 8, 'WAVE');
  writeAscii(bytes, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeAscii(bytes, 36, 'data');
  view.setUint32(40, dataBytes, true);
  samples.forEach((sample, index) => {
    view.setInt16(44 + index * 2, Math.max(-32768, Math.min(32767, Math.round(sample * 32768))), true);
  });
  return bytes;
}

function patternedSamples(frames: number, channels: number): number[] {
  const samples: number[] = [];
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      const raw = ((frame * 29 + channel * 101) % 2048) - 1024;
      samples.push(raw / 32768);
    }
  }
  return samples;
}

function installFakeAudioContext(
  samples: readonly number[],
  frames: number,
  channels: number,
  sampleRate: number,
): void {
  class FakeAudioContext {
    async decodeAudioData(): Promise<AudioBuffer> {
      return {
        length: frames,
        numberOfChannels: channels,
        sampleRate,
        copyFromChannel(destination: Float32Array, channel: number): void {
          for (let frame = 0; frame < frames; frame++) {
            destination[frame] = samples[frame * channels + channel] ?? 0;
          }
        },
      } as AudioBuffer;
    }

    async close(): Promise<void> {}
  }
  (globalThis as Record<string, unknown>).AudioContext = FakeAudioContext;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index++) bytes[offset + index] = value.charCodeAt(index);
}

async function fixtureBytes(file: string): Promise<Uint8Array> {
  return new Uint8Array(await Bun.file(`${ROOT}/fixtures/media/${file}`).arrayBuffer());
}
