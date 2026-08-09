import { afterEach, describe, expect, test } from 'bun:test';

import type { FrameSink, MediaBytes, MediaInput } from '../src/core/engine.ts';
import {
  type OracleContext,
  emptyGoldenStore,
  runOracle,
} from '../src/core/oracles.ts';
import { type Scenario, defineScenario } from '../src/core/scenario.ts';
import {
  TRANSCODE_ABR_RENDITION_SET_ROLE,
  readTranscodeAudioStructure,
  readTranscodeTransformSignal,
  transcodeAbrSwitchRole,
} from '../src/features/transcode/index.ts';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const originalAudioContext = (globalThis as Record<string, unknown>).AudioContext;
/** Real libx264 High-profile avcC whose SPS has VUI timing but no colour description. */
const REAL_LIBX264_AVCC_WITHOUT_COLOR = testHex(
  '0164001fffe1001a6764001facd940d83de5f0110000030001000003003c0f18319601000668ebe3cb22c0fdf8f800',
);

afterEach(() => {
  if (originalAudioContext === undefined) delete (globalThis as Record<string, unknown>).AudioContext;
  else (globalThis as Record<string, unknown>).AudioContext = originalAudioContext;
});

describe('production transcode oracle integration', () => {
  test('multitrack quality evidence is NA_ASSET when the selected source has one audio track', async () => {
    const bytes = await fixtureBytes('tiny_h264_360p_2s.mp4');
    const pixels = rgba([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 0, 255,
    ], 2, 2);
    const scenario = defineScenario({
      id: 'transcode/multitrack_select_default_audio',
      op: 'transcode',
      input: 'source.mp4',
      options: { container: 'mp4', video: { codec: 'h264' }, audio: { codec: 'aac' } },
      requires: { operations: ['transcode'] },
      oracles: ['ssim-psnr'],
      metrics: ['wall'],
    });
    const golden = emptyGoldenStore();
    golden.meta = {
      container: 'mp4',
      durationSec: 1,
      tracks: [
        { type: 'video', codec: 'h264', width: 2, height: 2 },
        { type: 'audio', codec: 'aac', sampleRate: 48_000, channels: 2 },
      ],
    };
    const outcome = await runOracle('ssim-psnr', {
      scenario,
      input: inputFromBytes(bytes, 'source.mp4', 'video/mp4'),
      output: media(bytes, 'mp4'),
      golden,
      decodeWithPlatform: async () => sink(pixels),
      playbackSmoke: async () => true,
    });
    expect(outcome).toMatchObject({
      state: 'UNAVAILABLE',
      status: 'NA_ASSET',
      reasonCode: 'TRANSCODE_MULTITRACK_SOURCE_EVIDENCE_MISSING',
    });
  });

  test('fragmented-MP4 SSIM bypasses a prefix golden and anchors candidate samples to the source', async () => {
    const bytes = await fixtureBytes('tiny_h264_360p_2s.mp4');
    const pixels = rgba([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 0, 255,
    ], 2, 2);
    const scenario = defineScenario({
      id: 'transcode/h264_to_fragmented_mp4',
      op: 'transcode',
      input: 'source.mp4',
      options: { container: 'mp4', video: { codec: 'h264' }, fastStart: 'fragmented' },
      requires: { operations: ['transcode'] },
      oracles: ['ssim-psnr'],
      metrics: ['wall'],
      tolerances: { ssimMin: 0.96 },
    });
    const decodeOptions: Array<{
      sampling?: 'prefix' | 'uniform';
      durationHintSec?: number;
    } | undefined> = [];
    const golden = emptyGoldenStore();
    golden.meta = { container: 'mp4', durationSec: 2, tracks: [] };
    golden.frames = sink(pixels).frames;
    const outcome = await runOracle('ssim-psnr', {
      scenario,
      input: inputFromBytes(bytes, 'source.mp4', 'video/mp4'),
      output: media(bytes, 'mp4'),
      golden,
      decodeWithPlatform: async (_media, options) => {
        decodeOptions.push(options);
        return sink(pixels);
      },
      playbackSmoke: async () => true,
    });
    expect(outcome).toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
    expect(decodeOptions).toEqual([
      { maxFrames: 8, sampling: 'uniform', durationHintSec: 2 },
      { maxFrames: 1, sampling: 'uniform', durationHintSec: 2, sampleTimesSec: [0] },
    ]);
  });

  test('ssim-luma-v1 gates the authored mean at endpoint-inclusive real-PTS anchors', async () => {
    const bytes = await fixtureBytes('tiny_h264_360p_2s.mp4');
    const white = rgba(new Array(2 * 2 * 4).fill(255), 2, 2);
    const black = rgba([
      0, 0, 0, 255, 0, 0, 0, 255,
      0, 0, 0, 255, 0, 0, 0, 255,
    ], 2, 2);
    const scenario = defineScenario({
      id: 'transcode/h264_bitrate_2mbps',
      op: 'transcode',
      input: 'source.mp4',
      options: {
        container: 'mp4',
        video: {
          codec: 'h264', bitrate: 2_000_000,
          maxAverageBitrate: 2_600_000,
          quality: { metric: 'ssim-luma-v1', minimumMean: 0.93, samples: 3 },
        },
      },
      requires: { operations: ['transcode'] },
      oracles: ['ssim-psnr'],
      metrics: ['wall'],
      tolerances: { ssimMin: 0.93 },
    });
    const decodeOptions: unknown[] = [];
    let decodeIndex = 0;
    const outcome = await runOracle('ssim-psnr', {
      scenario,
      input: inputFromBytes(bytes, 'source.mp4', 'video/mp4'),
      output: media(bytes, 'mp4'),
      golden: emptyGoldenStore(),
      decodeWithPlatform: async (_media, options) => {
        decodeOptions.push(options);
        const pts = (options?.sampleTimesSec ?? []).map((timeSec) => Math.round(timeSec * 1_000_000));
        const isCandidate = decodeIndex++ === 1;
        return {
          frames: pts.map((ptsUs, index) => ({
            index, ptsUs, sha256: String(index).repeat(64), width: 2, height: 2,
          })),
          getPixels: async (index) => isCandidate && index === pts.length - 1 ? black : white,
        };
      },
      playbackSmoke: async () => true,
    });
    expect(outcome).toMatchObject({
      state: 'VERDICT', verdict: 'FAIL', measurements: {
        requestedSamples: 3,
        pairs: 3,
        qualityFirstAnchorPtsUs: 0,
        qualityLastAnchorPtsUs: 1_966_667,
      },
    });
    expect(outcome.detail).toContain('endpoint-inclusive real-PTS anchors');
    expect(decodeOptions).toEqual([
      { maxFrames: 3, sampleTimesSec: [0, 0.966667, 1.966667] },
      { maxFrames: 3, sampleTimesSec: [0, 0.966667, 1.966667] },
    ]);
  });

  test('average-bitrate dispatch measures elementary payload for one-pass and two-pass contracts', async () => {
    const bytes = await fixtureBytes('tiny_h264_360p_2s.mp4');
    for (const [scenarioId, passes] of [
      ['transcode/h264_bitrate_2mbps', undefined],
      ['transcode/h264_two_pass_bitrate', 2],
    ] as const) {
      const scenario = defineScenario({
        id: scenarioId,
        op: 'transcode',
        input: 'source.mp4',
        options: {
          container: 'mp4',
          video: { codec: 'h264', bitrate: 2_000_000, ...(passes !== undefined ? { passes } : {}) },
        },
        requires: { operations: ['transcode'] },
        oracles: ['average-bitrate'],
        metrics: ['wall'],
      });
      const outcome = await runOracle('average-bitrate', {
        scenario,
        input: inputFromBytes(bytes, 'source.mp4', 'video/mp4'),
        output: media(bytes, 'mp4'),
        golden: emptyGoldenStore(),
        decodeWithPlatform: async () => ({ frames: [] }),
        playbackSmoke: async () => true,
      });
      expect(outcome, scenarioId).toMatchObject({
        state: 'VERDICT',
        verdict: 'FAIL',
        reasonCode: 'TRANSCODE_AVERAGE_VIDEO_BITRATE_BAND_MISMATCH',
        measurements: {
          videoSamplePayloadBytes: 145_349,
          videoPresentationSpanUs: 2_000_000,
          videoAverageBitrateBps: 581_396,
          videoTargetBitrateBps: 2_000_000,
        },
      });
      expect(outcome.measurements?.videoSamplePayloadBytes, scenarioId).toBeLessThan(
        bytes.byteLength,
      );
    }
  });

  test('REQ-FEAT-20 transcode output metadata reuses strict MPEG-TS program evidence', async () => {
    const bytes = await fixtureBytes('h264_ts.ts');
    const scenario = defineScenario({
      id: 'transcode/h264_to_ts',
      op: 'transcode',
      input: 'source.mp4',
      options: { container: 'ts', video: { codec: 'h264' }, invariant: 'transcode-output-metadata' },
      requires: { operations: ['transcode'] },
      oracles: ['property-invariant'],
      metrics: ['wall'],
    });
    const outcome = await runOracle('property-invariant', {
      scenario,
      input: inputFromBytes(bytes, 'source.mp4', 'video/mp4'),
      output: media(bytes, 'ts', 'video/mp2t'),
      golden: emptyGoldenStore(),
      decodeWithPlatform: async () => ({ frames: [] }),
      playbackSmoke: async () => true,
    });
    expect(outcome).toMatchObject({
      state: 'VERDICT', verdict: 'PASS', reasonCode: 'ORACLE_MATCH',
    });
  });

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
      expect(outcome.reasonCode, id).toBe(
        id === 'hdr10_to_sdr_tonemap'
          ? 'TRANSCODE_TRANSFORM_OUTPUT_CODEC_MISMATCH'
          : 'TRANSCODE_TRANSFORM_SIGNALING_MISMATCH',
      );
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

  test('HDR presentation invariant decodes source and candidate through the same timed presenter path', async () => {
    const source = await fixtureBytes('hdr10_pq_micro_hevc.mp4');
    const bt709 = { primaries: 1, transfer: 1, matrix: 1, fullRange: false } as const;
    const output = media(testH264Mp4('avc1', testAvcC(testAvcSps(bt709)), bt709), 'mp4');
    const pixels = rgba([
      230, 30, 20, 255, 20, 190, 35, 255,
      25, 40, 220, 255, 190, 130, 15, 255,
    ], 2, 2);
    const decodeOptions: unknown[] = [];
    const outcome = await runOracle('property-invariant', {
      scenario: effectScenario('hdr10_to_sdr_tonemap'),
      input: inputFromBytes(source, 'source.mp4', 'video/mp4'),
      output,
      golden: emptyGoldenStore(),
      decodeWithPlatform: async (_bytes, options) => {
        decodeOptions.push(options);
        const pts = options?.presentationColorManaged === true
          ? (options.sampleTimesSec ?? []).map((timeSec) => Math.round(timeSec * 1_000_000))
          : [1_000_000, 1_200_000, 1_400_000];
        return {
          frames: pts.map((ptsUs, index) => ({
            index,
            ptsUs,
            sha256: String(index).repeat(64),
            width: 2,
            height: 2,
          })),
          getPixels: async () => pixels,
          decodedColorSpaces: [{
            primaries: 'bt2020',
            transfer: 'smpte2084',
            matrix: 'bt2020nc',
            fullRange: false,
          }],
        };
      },
      playbackSmoke: async () => true,
    });

    expect(outcome).toMatchObject({
      state: 'VERDICT', verdict: 'PASS', measurements: { maximumTimestampDeltaUs: 0 },
    });
    expect(decodeOptions).toEqual([
      { maxFrames: 8, sampling: 'uniform' },
      { maxFrames: 3, presentationColorManaged: true, sampleTimesSec: [0, 0.2, 0.4] },
      { maxFrames: 3, presentationColorManaged: true, sampleTimesSec: [0, 0.2, 0.4] },
    ]);
  });

  test('REQ-FEAT-20 avc1 color evidence requires matching nclx and every avcC SPS VUI', async () => {
    const bt2020 = { primaries: 9, transfer: 14, matrix: 9, fullRange: false } as const;
    const bt709 = { primaries: 1, transfer: 1, matrix: 1, fullRange: false } as const;
    const sps2020 = testAvcSps(bt2020);
    const sps709 = testAvcSps(bt709);
    const spsWithoutColor = testAvcSps();

    expect(readTranscodeTransformSignal(
      testH264Mp4('avc1', testAvcC(sps2020, sps2020), bt2020),
      'mp4',
    )).toMatchObject({
      state: 'OK',
      value: {
        rotationDegrees: 0,
        colorPrimaries: 'bt2020',
        transfer: 'bt2020-10',
        matrix: 'bt2020-ncl',
        range: 'limited',
        bitDepth: 8,
      },
    });

    // A container-only retag is not color evidence: the elementary SPS must independently agree.
    expect(readTranscodeTransformSignal(
      testH264Mp4('avc1', testAvcC(spsWithoutColor), bt2020),
      'mp4',
    )).toMatchObject({
      state: 'MALFORMED',
      reasonCode: 'TRANSCODE_TRANSFORM_SIGNAL_H264_SPS_COLOR_MISSING',
    });
    expect(readTranscodeTransformSignal(
      testH264Mp4('avc1', REAL_LIBX264_AVCC_WITHOUT_COLOR, bt2020),
      'mp4',
    )).toMatchObject({
      state: 'MALFORMED',
      reasonCode: 'TRANSCODE_TRANSFORM_SIGNAL_H264_SPS_COLOR_MISSING',
    });

    expect(readTranscodeTransformSignal(
      testH264Mp4('avc1', testAvcC(sps709), bt2020),
      'mp4',
    )).toMatchObject({
      state: 'MALFORMED',
      reasonCode: 'TRANSCODE_TRANSFORM_SIGNAL_H264_NCLX_SPS_CONFLICT',
    });
    expect(readTranscodeTransformSignal(
      testH264Mp4('avc1', testAvcC(sps2020, sps709), bt2020),
      'mp4',
    )).toMatchObject({
      state: 'MALFORMED',
      reasonCode: 'TRANSCODE_TRANSFORM_SIGNAL_H264_SPS_COLOR_CONFLICT',
    });
    expect(readTranscodeTransformSignal(
      testH264Mp4('avc1', testAvcC(sps2020, spsWithoutColor), bt2020),
      'mp4',
    )).toMatchObject({
      state: 'MALFORMED',
      reasonCode: 'TRANSCODE_TRANSFORM_SIGNAL_H264_SPS_COLOR_AMBIGUOUS',
    });
    expect(readTranscodeTransformSignal(
      testH264Mp4('avc1', testAvcC(sps2020), bt2020, true),
      'mp4',
    )).toMatchObject({
      state: 'MALFORMED',
      reasonCode: 'TRANSCODE_TRANSFORM_SIGNAL_H264_AVCC_AMBIGUOUS',
    });

    expect(readTranscodeTransformSignal(
      testH264Mp4('avc1', testAvcC(Uint8Array.of(0x67, 0x42, 0x00, 0x1e)), bt2020),
      'mp4',
    )).toMatchObject({
      state: 'INCOMPLETE',
      reasonCode: 'TRANSCODE_TRANSFORM_SIGNAL_CODEC_CONFIG_TRUNCATED',
    });
    expect(readTranscodeTransformSignal(
      testH264Mp4('avc1', Uint8Array.of(1, 66, 0, 30, 0xff, 0xe0, 0), bt2020),
      'mp4',
    )).toMatchObject({
      state: 'MALFORMED',
      reasonCode: 'TRANSCODE_TRANSFORM_SIGNAL_H264_SPS_MISSING',
    });
    expect(readTranscodeTransformSignal(
      testH264Mp4('avc3', testAvcC(sps2020), bt2020),
      'mp4',
    )).toMatchObject({
      state: 'UNSUPPORTED_STRUCTURE',
      reasonCode: 'TRANSCODE_TRANSFORM_SIGNAL_H264_INBAND_PARAMETER_SETS',
    });

    // Keep a real-world SPS regression alongside the generated, syntax-focused records.
    expect(readTranscodeTransformSignal(
      await fixtureBytes('tiny_h264_360p_2s.mp4'),
      'mp4',
    )).toMatchObject({ state: 'OK', value: { rotationDegrees: 0, bitDepth: 8 } });
  });

  test('REQ-FEAT-21 decoded PCM equivalence is scored in the property oracle, including excess samples', async () => {
    const exact = wave([0.25, -0.25, 0.5, -0.5], 2, 48_000);
    const changed = wave([0.25, -0.25, 0.5, -0.25], 2, 48_000);
    const excess = wave([0.25, -0.25, 0.5, -0.5, 0.1, -0.1], 2, 48_000);
    const scenario = audioScenario('aac_to_pcm_wav_extract', 'wav', 'pcm-s16');

    const passOutcome = await runOracle('property-invariant', audioContext(scenario, exact, exact, 'wav'));
    expect(passOutcome).toMatchObject({
      state: 'VERDICT', verdict: 'PASS', reasonCode: 'TRANSCODE_AUDIO_DECODER_EQUIVALENCE_MATCH',
    });
    const changedOutcome = await runOracle('property-invariant', audioContext(scenario, exact, changed, 'wav'));
    expect(changedOutcome).toMatchObject({
      state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_AUDIO_DECODER_EQUIVALENCE_MISMATCH',
    });
    const excessOutcome = await runOracle('property-invariant', audioContext(scenario, exact, excess, 'wav'));
    expect(excessOutcome).toMatchObject({
      state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_AUDIO_EXCESS_SAMPLES',
    });
  });

  test('AAC-to-PCM reports browser reference resampling instead of failing a native-rate candidate', async () => {
    const source = await fixtureBytes('gapless_aac.m4a');
    const output = wave([0.25, -0.25, 0.5, -0.5], 2, 44_100);
    const scenario = audioScenario('aac_to_pcm_wav_extract', 'wav', 'pcm-s16');
    const golden = emptyGoldenStore();
    golden.meta = {
      container: 'mp4',
      durationSec: 1,
      tracks: [{ type: 'audio', codec: 'aac', sampleRate: 44_100, channels: 2 }],
    };
    installFakeAudioContext([0.25, -0.25, 0.5, -0.5], 2, 2, 48_000);
    const outcome = await runOracle('property-invariant', {
      scenario,
      input: inputFromBytes(source, 'source.m4a', 'audio/mp4'),
      output: media(output, 'wav', 'audio/wav'),
      golden,
      decodeWithPlatform: async () => ({ frames: [] }),
      playbackSmoke: async () => true,
    });
    expect(outcome).toMatchObject({
      state: 'UNAVAILABLE',
      status: 'NA_BROWSER',
      reasonCode: 'TRANSCODE_AUDIO_REFERENCE_RESAMPLED',
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

  test('REQ-FEAT-22 scores every ABR rung with its endpoint-inclusive quality contract', async () => {
    const bytes = await fixtureBytes('tiny_h264_360p_2s.mp4');
    const white = rgba(new Array(2 * 2 * 4).fill(255), 2, 2);
    const black = rgba([
      0, 0, 0, 255, 0, 0, 0, 255,
      0, 0, 0, 255, 0, 0, 0, 255,
    ], 2, 2);
    const scenario = abrQualityScenario();
    const renditionIds = ['1080p', '720p', '480p', '360p'] as const;
    const variants = renditionIds.map(() => media(bytes, 'mp4'));
    const description = new TextEncoder().encode(JSON.stringify({
      kind: 'explicit',
      id: 'h264-main-abr',
      renditionIds,
      switchPointsUs: [0],
      segmentMode: 'random-access',
    }));
    const intermediates: NonNullable<MediaBytes['intermediates']>[number][] = [{
      role: TRANSCODE_ABR_RENDITION_SET_ROLE,
      bytes: description,
      mime: 'application/json',
      container: 'json',
    }];
    for (let index = 0; index + 1 < renditionIds.length; index++) {
      const high = renditionIds[index]!;
      const low = renditionIds[index + 1]!;
      intermediates.push(
        {
          role: transcodeAbrSwitchRole(high, low, 0),
          bytes,
          mime: 'video/mp4',
          container: 'mp4',
        },
        {
          role: transcodeAbrSwitchRole(low, high, 0),
          bytes,
          mime: 'video/mp4',
          container: 'mp4',
        },
      );
    }

    const exactDecodeOptions: unknown[] = [];
    let qualityDecodeCalls = 0;
    const outcome = await runOracle('fanout-renditions', {
      scenario,
      input: inputFromBytes(bytes, 'source.mp4', 'video/mp4'),
      output: { ...variants[0]!, variants, intermediates },
      golden: emptyGoldenStore(),
      decodeWithPlatform: async (_media, options) => {
        if (!options?.sampleTimesSec) return sink(white);
        exactDecodeOptions.push(options);
        const call = qualityDecodeCalls++;
        const pts = options.sampleTimesSec.map((timeSec) => Math.round(timeSec * 1_000_000));
        const corruptFirstRenditionEndpoint = call === 1;
        return {
          frames: pts.map((ptsUs, index) => ({
            index,
            ptsUs,
            sha256: String(index).repeat(64),
            width: 2,
            height: 2,
          })),
          getPixels: async (index) =>
            corruptFirstRenditionEndpoint && index === pts.length - 1 ? black : white,
        };
      },
      playbackSmoke: async () => true,
    });

    expect(outcome).toMatchObject({
      state: 'VERDICT',
      verdict: 'FAIL',
      reasonCode: 'ORACLE_MISMATCH',
    });
    expect(outcome.detail).toContain(
      '1080p quality: ssim-luma-v1 endpoint-inclusive real-PTS anchors',
    );
    expect(exactDecodeOptions.slice(0, 2)).toEqual([
      { maxFrames: 3, sampleTimesSec: [0, 0.966667, 1.966667] },
      { maxFrames: 3, sampleTimesSec: [0, 0.966667, 1.966667] },
    ]);
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

function abrQualityScenario(): Scenario {
  const scenario = abrScenario();
  const options = scenario.options as {
    container: 'mp4';
    video: { codec: 'h264' };
    variants: Array<Record<string, unknown>>;
  };
  return defineScenario({
    ...scenario,
    revision: 3,
    options: {
      ...options,
      variants: options.variants.map((variant) => ({
        ...variant,
        maxAverageBitrate: Number(variant.bitrate) * 1.3,
        quality: { metric: 'ssim-luma-v1', minimumMean: 0.95, samples: 3 },
      })),
    },
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

interface TestH273Color {
  readonly primaries: number;
  readonly transfer: number;
  readonly matrix: number;
  readonly fullRange: boolean;
}

/** Independent generated Baseline SPS with an optional complete video_signal_type colour declaration. */
function testAvcSps(color?: TestH273Color): Uint8Array {
  const bits: number[] = [];
  testPushBits(bits, 66, 8); // profile_idc: Baseline
  testPushBits(bits, 0, 8); // constraint flags
  testPushBits(bits, 30, 8); // level_idc
  testPushUe(bits, 0); // seq_parameter_set_id
  testPushUe(bits, 0); // log2_max_frame_num_minus4
  testPushUe(bits, 0); // pic_order_cnt_type
  testPushUe(bits, 0); // log2_max_pic_order_cnt_lsb_minus4
  testPushUe(bits, 1); // max_num_ref_frames
  bits.push(0); // gaps_in_frame_num_value_allowed_flag
  testPushUe(bits, 0); // pic_width_in_mbs_minus1
  testPushUe(bits, 0); // pic_height_in_map_units_minus1
  bits.push(1, 1, 0); // frame_mbs_only, direct_8x8_inference, frame_cropping_present
  if (color === undefined) {
    bits.push(0); // vui_parameters_present_flag
  } else {
    bits.push(1); // vui_parameters_present_flag
    bits.push(0, 0, 1); // aspect ratio, overscan, video_signal_type_present
    testPushBits(bits, 5, 3); // unspecified video_format
    bits.push(color.fullRange ? 1 : 0, 1); // full_range + colour_description_present
    testPushBits(bits, color.primaries, 8);
    testPushBits(bits, color.transfer, 8);
    testPushBits(bits, color.matrix, 8);
    bits.push(0, 0, 0, 0, 0, 0); // chroma location, timing, HRDs, picture structure, restrictions
  }
  bits.push(1); // rbsp_stop_one_bit
  while (bits.length % 8 !== 0) bits.push(0);
  const rbsp = new Uint8Array(bits.length / 8);
  for (let index = 0; index < bits.length; index++) {
    const byteIndex = index >> 3;
    rbsp[byteIndex] = (rbsp[byteIndex] ?? 0) | ((bits[index] ?? 0) << (7 - (index & 7)));
  }
  return Uint8Array.of(0x67, ...testEscapeRbsp(rbsp));
}

function testAvcC(...spsEntries: readonly Uint8Array[]): Uint8Array {
  const first = spsEntries[0];
  if (first === undefined || spsEntries.length > 31) throw new RangeError('test avcC needs 1..31 SPS');
  const fields: Uint8Array[] = [
    Uint8Array.of(1, first[1] ?? 66, first[2] ?? 0, first[3] ?? 30, 0xff, 0xe0 | spsEntries.length),
  ];
  for (const sps of spsEntries) fields.push(testBe16(sps.byteLength), sps);
  const pps = Uint8Array.of(0x68, 0xce, 0x06, 0xe2);
  fields.push(Uint8Array.of(1), testBe16(pps.byteLength), pps);
  return testConcat(...fields);
}

function testH264Mp4(
  sampleEntryType: 'avc1' | 'avc3',
  avcC: Uint8Array,
  nclx?: TestH273Color,
  duplicateAvcC = false,
): Uint8Array {
  const visualHeader = new Uint8Array(78);
  const visualView = new DataView(visualHeader.buffer);
  visualView.setUint16(6, 1, false);
  visualView.setUint16(24, 16, false);
  visualView.setUint16(26, 16, false);
  const config = testIsoBox('avcC', avcC);
  const color = nclx === undefined
    ? new Uint8Array()
    : testIsoBox(
        'colr',
        testAscii('nclx'),
        testBe16(nclx.primaries),
        testBe16(nclx.transfer),
        testBe16(nclx.matrix),
        Uint8Array.of(nclx.fullRange ? 0x80 : 0),
      );
  const entry = testIsoBox(
    sampleEntryType,
    visualHeader,
    config,
    ...(duplicateAvcC ? [config] : []),
    color,
  );
  const stsd = testIsoBox('stsd', new Uint8Array(4), testBe32(1), entry);
  const stts = testIsoBox(
    'stts',
    new Uint8Array(4),
    testBe32(1),
    testBe32(1),
    testBe32(1_000),
  );
  const stsc = testIsoBox(
    'stsc',
    new Uint8Array(4),
    testBe32(1),
    testBe32(1),
    testBe32(1),
    testBe32(1),
  );
  const stsz = testIsoBox('stsz', new Uint8Array(4), testBe32(4), testBe32(1));
  const hdlr = new Uint8Array(12);
  hdlr.set(testAscii('vide'), 8);
  const mdhd = new Uint8Array(24);
  const mdhdView = new DataView(mdhd.buffer);
  mdhdView.setUint32(12, 1_000, false);
  mdhdView.setUint32(16, 1_000, false);
  const tkhd = new Uint8Array(84);
  const tkhdView = new DataView(tkhd.buffer);
  tkhdView.setUint32(12, 1, false);
  tkhdView.setInt32(40, 0x0001_0000, false);
  tkhdView.setInt32(56, 0x0001_0000, false);
  tkhdView.setInt32(72, 0x4000_0000, false);
  tkhdView.setUint32(76, 16 * 65_536, false);
  tkhdView.setUint32(80, 16 * 65_536, false);
  const ftyp = testIsoBox('ftyp', testAscii('isom'), testBe32(0), testAscii('isom'));
  const moovAt = (sampleOffset: number): Uint8Array => testIsoBox(
    'moov',
    testIsoBox(
      'trak',
      testIsoBox('tkhd', tkhd),
      testIsoBox(
        'mdia',
        testIsoBox('mdhd', mdhd),
        testIsoBox('hdlr', hdlr),
        testIsoBox(
          'minf',
          testIsoBox('stbl', stsd, stts, stsc, stsz, testIsoBox(
            'stco',
            new Uint8Array(4),
            testBe32(1),
            testBe32(sampleOffset),
          )),
        ),
      ),
    ),
  );
  const placeholder = moovAt(0);
  const moov = moovAt(ftyp.byteLength + placeholder.byteLength + 8);
  return testConcat(ftyp, moov, testIsoBox('mdat', Uint8Array.of(0, 0, 0, 0)));
}

function testPushBits(bits: number[], value: number, width: number): void {
  for (let shift = width - 1; shift >= 0; shift--) bits.push((value >>> shift) & 1);
}

function testPushUe(bits: number[], value: number): void {
  const encoded = value + 1;
  const width = Math.floor(Math.log2(encoded)) + 1;
  for (let index = 1; index < width; index++) bits.push(0);
  testPushBits(bits, encoded, width);
}

function testEscapeRbsp(rbsp: Uint8Array): Uint8Array {
  const escaped: number[] = [];
  let zeroes = 0;
  for (const byte of rbsp) {
    if (zeroes >= 2 && byte <= 3) {
      escaped.push(3);
      zeroes = 0;
    }
    escaped.push(byte);
    zeroes = byte === 0 ? zeroes + 1 : 0;
  }
  return Uint8Array.from(escaped);
}

function testIsoBox(type: string, ...payloads: readonly Uint8Array[]): Uint8Array {
  const payload = testConcat(...payloads);
  return testConcat(testBe32(payload.byteLength + 8), testAscii(type), payload);
}

function testConcat(...parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function testBe16(value: number): Uint8Array {
  return Uint8Array.of((value >>> 8) & 0xff, value & 0xff);
}

function testBe32(value: number): Uint8Array {
  return Uint8Array.of((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

function testAscii(value: string): Uint8Array {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

function testHex(value: string): Uint8Array {
  return Uint8Array.from(
    Array.from({ length: value.length / 2 }, (_, index) =>
      Number.parseInt(value.slice(index * 2, index * 2 + 2), 16),
    ),
  );
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index++) bytes[offset + index] = value.charCodeAt(index);
}

async function fixtureBytes(file: string): Promise<Uint8Array> {
  return new Uint8Array(await Bun.file(`${ROOT}/fixtures/media/${file}`).arrayBuffer());
}
