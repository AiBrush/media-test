import { describe, expect, test } from 'bun:test';

import { createNotApplicableError, isNotApplicableError, type MediaBytes } from '../src/core/engine.ts';
import { sha256Hex } from '../src/core/seeded-rng.ts';
import { transcodeScenarios } from '../src/scenarios/transcode/index.ts';
import {
  TRANSCODE_ABR_CONTRACT,
  TRANSCODE_ROUNDTRIP_CONTRACT,
  admitTranscodeMetrics,
  applyTranscodeTransform,
  assessTranscodeRoundTripProvenance,
  collectAbrRenditionEvidence,
  defineAbrSwitchingContract,
  defineTranscodeMetricAdmissionContract,
  evaluateAbrSwitchability,
  evaluateTranscodeTransform,
  evaluateTranscodedAudioContent,
  executeTranscodeRoundTrip,
  makeTranscodeRateEvidence,
  readTranscodeAudioStructure,
  transcodeAudioContractForScenario,
  transcodeAudioContractScenarioIds,
  transcodeMetricAdmissionContract,
  transcodeTransformContractForScenario,
  transcodeTransformContractScenarioIds,
  transcodeVerdict,
  type AbrRenditionEvidence,
  type AbrRenditionSetDescription,
  type AbrSwitchDecodeEvidence,
  type DecodedAudioSignal,
  type TranscodeAudioContentContract,
  type TranscodePixelFrame,
} from '../src/features/transcode/index.ts';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

describe('transcode exhaustive calibration bounds', () => {
  test('VP9, 2 Mbps AVC, and 1 fps rows expose their measured semantic tolerances', () => {
    const vp9 = transcodeScenarios.find((entry) => entry.id === 'transcode/h264_to_vp9_webm')!;
    const lowBitrate = transcodeScenarios.find((entry) => entry.id === 'transcode/h264_bitrate_2mbps')!;
    const oneFps = transcodeScenarios.find((entry) => entry.id === 'transcode/extreme_fps_1')!;

    expect(vp9.tolerances?.ssimMin).toBe(0.98);
    expect(lowBitrate.tolerances?.ssimMin).toBe(0.93);
    expect(oneFps.tolerances?.durationToleranceSec).toBe(1);
  });
});

describe('REQ-FEAT-20 effect-aware transform oracles', () => {
  test('rotation grades actual pixels and fails a playable/codec-correct no-op', () => {
    const contract = requiredTransform('h264_rotate_180');
    const source = pixelFrame([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 0, 255,
    ], 2, 2);
    const transformed = applyTranscodeTransform(source, contract);
    expect(evaluateTranscodeTransform([source], [transformed], { rotationDegrees: 0 }, contract))
      .toMatchObject({ state: 'VERDICT', verdict: 'PASS', reasonCode: 'TRANSCODE_TRANSFORM_EFFECT_MATCH' });

    expect(evaluateTranscodeTransform([source], [source], { rotationDegrees: 0 }, contract))
      .toMatchObject({ state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_TRANSFORM_EFFECT_NOT_OBSERVED' });
  });

  test('correct pixels cannot hide wrong authored signaling', () => {
    const contract = requiredTransform('h264_rotate_90_dimswap');
    const source = pixelFrame([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 0, 255,
      255, 0, 255, 255, 0, 255, 255, 255,
    ], 2, 3);
    const transformed = applyTranscodeTransform(source, contract);
    expect(evaluateTranscodeTransform([source], [transformed], { rotationDegrees: 90 }, contract))
      .toMatchObject({ state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_TRANSFORM_SIGNALING_MISMATCH' });
    expect(evaluateTranscodeTransform([source], [transformed], {}, contract))
      .toMatchObject({ state: 'UNAVAILABLE', status: 'NA_ASSET', reasonCode: 'TRANSCODE_TRANSFORM_SIGNALING_UNAVAILABLE' });
  });

  test('color, tone-map, and depth requests require both pixels and the full authored signal', () => {
    const color = requiredTransform('h264_colorspace_709_to_2020');
    const source = pixelFrame([
      230, 30, 20, 255, 20, 190, 35, 255,
      25, 40, 220, 255, 190, 130, 15, 255,
    ], 2, 2);
    const colorCandidate = applyTranscodeTransform(source, color);
    const colorSignal = {
      colorPrimaries: 'bt2020', transfer: 'bt2020-10', matrix: 'bt2020-ncl', range: 'limited', bitDepth: 8,
    } as const;
    expect(evaluateTranscodeTransform([source], [colorCandidate], colorSignal, color))
      .toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
    expect(evaluateTranscodeTransform([source], [source], colorSignal, color))
      .toMatchObject({ state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_TRANSFORM_EFFECT_NOT_OBSERVED' });

    const depth = requiredTransform('h264_8bit_to_hevc_10bit');
    const depthCandidate = applyTranscodeTransform(source, depth);
    expect(evaluateTranscodeTransform([source], [depthCandidate], { bitDepth: 10 }, depth))
      .toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
    expect(evaluateTranscodeTransform([source], [source], { bitDepth: 8 }, depth))
      .toMatchObject({ state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_TRANSFORM_SIGNALING_MISMATCH' });

    const tone = requiredTransform('hdr10_to_sdr_tonemap');
    const pqSource = pixelFrame([
      240, 210, 170, 255, 180, 200, 245, 255,
      220, 100, 60, 255, 150, 230, 120, 255,
    ], 2, 2, 10);
    const toneCandidate = applyTranscodeTransform(pqSource, tone);
    expect(evaluateTranscodeTransform([pqSource], [toneCandidate], {
      colorPrimaries: 'bt709', transfer: 'bt709', matrix: 'bt709', range: 'limited', bitDepth: 8,
    }, tone)).toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
  });

  test('every effect row invokes the mandatory family invariant', () => {
    for (const id of transcodeTransformContractScenarioIds()) {
      const scenario = transcodeScenarios.find((entry) => entry.id === id);
      expect(scenario, id).toBeDefined();
      expect(scenario!.oracles, id).toContain('property-invariant');
      expect(optionsOf(scenario!).invariant, id).toBe('transcode-effect-aware');
    }
  });
});

describe('REQ-FEAT-21 decoded audio content and explicit priming', () => {
  test('neutral WAV, FLAC, Ogg Opus, and ISO-BMFF AAC readers expose structural/timeline evidence', async () => {
    const rows = [
      ['wav_s16.wav', 'wav', 'pcm-s16'],
      ['flac_seektable.flac', 'flac', 'flac'],
      ['opus.ogg', 'ogg', 'opus'],
      ['tiny_vp9_360p_2s.webm', 'webm', 'opus'],
      ['gapless_aac.m4a', 'mp4', 'aac'],
    ] as const;
    for (const [file, container, codec] of rows) {
      const bytes = await fixtureBytes(file);
      const result = readTranscodeAudioStructure(bytes, container);
      expect(result.state, file).toBe('OK');
      if (result.state !== 'OK') continue;
      expect(result.value.codec, file).toBe(codec);
      expect(result.value.sampleRate, file).toBeGreaterThan(0);
      expect(result.value.channels, file).toBeGreaterThan(0);
    }
    const opus = readTranscodeAudioStructure(await fixtureBytes('opus.ogg'), 'ogg');
    expect(opus).toMatchObject({ state: 'OK', value: { timeline: { kind: 'opus-ogg' } } });
    if (opus.state === 'OK' && opus.value.timeline?.kind === 'opus-ogg') {
      expect(opus.value.timeline.preSkipFrames).toBeGreaterThan(0);
      expect(opus.value.timeline.codedSampleFrames - opus.value.timeline.preSkipFrames -
        opus.value.timeline.endTrimFrames).toBe(opus.value.timeline.presentationSampleFrames);
    }
    const aac = readTranscodeAudioStructure(await fixtureBytes('gapless_aac.m4a'), 'mp4');
    expect(aac).toMatchObject({ state: 'OK', value: { timeline: { kind: 'aac-isobmff', timingSource: 'edit-list' } } });
    const webm = readTranscodeAudioStructure(await fixtureBytes('tiny_vp9_360p_2s.webm'), 'webm');
    expect(webm).toMatchObject({ state: 'OK', value: { timeline: { kind: 'opus-webm' } } });
    if (webm.state === 'OK' && webm.value.timeline?.kind === 'opus-webm') {
      expect(webm.value.timeline.codedSampleFrames - webm.value.timeline.preSkipFrames -
        webm.value.timeline.endTrimFrames).toBe(webm.value.timeline.presentationSampleFrames);
    }
  });

  test('lossless decoded samples must match after the declared program window', () => {
    const contract: TranscodeAudioContentContract = {
      kind: 'lossless', maximumAbsoluteError: 0, sampleFrameTolerance: 0, requireExplicitTimeline: false,
    };
    const source = audioSignal([0.25, -0.25, 0.5, -0.5], 2, 2);
    const exact = audioSignal([0.25, -0.25, 0.5, -0.5], 2, 2);
    expect(evaluateTranscodedAudioContent(source, exact, contract))
      .toMatchObject({ state: 'VERDICT', verdict: 'PASS', reasonCode: 'TRANSCODE_AUDIO_LOSSLESS_MATCH' });
    const changed = audioSignal([0.25, -0.25, 0.5, -0.4], 2, 2);
    expect(evaluateTranscodedAudioContent(source, changed, contract))
      .toMatchObject({ state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_AUDIO_LOSSLESS_CONTENT_MISMATCH' });

    const browserFlac = requiredAudioContract('wav_to_flac');
    const floatRounded = audioSignal([0.25 + 1 / 65_536, -0.25, 0.5, -0.5], 2, 2);
    expect(evaluateTranscodedAudioContent(source, floatRounded, browserFlac))
      .toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
  });

  test('AAC-to-PCM admits a sparse cross-decoder transient but rejects material corruption', () => {
    const contract = requiredAudioContract('aac_to_pcm_wav_extract');
    const sourceSamples = Array.from({ length: 20_000 }, (_, index) => Math.sin(index / 17) * 0.5);
    const source = audioSignal(sourceSamples, 20_000, 1);
    const equivalentSamples = [...sourceSamples];
    equivalentSamples[10_000]! += 0.08;
    expect(evaluateTranscodedAudioContent(
      source,
      audioSignal(equivalentSamples, 20_000, 1),
      contract,
    )).toMatchObject({
      state: 'VERDICT', verdict: 'PASS', reasonCode: 'TRANSCODE_AUDIO_DECODER_EQUIVALENCE_MATCH',
    });

    const corruptedSamples = [...sourceSamples];
    corruptedSamples[10_000]! += 0.2;
    expect(evaluateTranscodedAudioContent(
      source,
      audioSignal(corruptedSamples, 20_000, 1),
      contract,
    )).toMatchObject({
      state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_AUDIO_DECODER_EQUIVALENCE_MISMATCH',
    });
  });

  test('legitimate AAC priming/remainder is trimmed, while excess/lost samples beyond the model fail', () => {
    const source = audioSignal([0.1, -0.1, 0.4, -0.4, 0.7, -0.7, 0.2, -0.2], 4, 2);
    const timeline = {
      kind: 'aac-isobmff' as const,
      codedSampleFrames: 8,
      primingFrames: 2,
      remainderFrames: 2,
      presentationSampleFrames: 4,
      editListMediaStartFrame: 2,
      timingSource: 'edit-list' as const,
    };
    const candidate = audioSignal([
      0, 0, 0, 0,
      0.1, -0.1, 0.4, -0.4, 0.7, -0.7, 0.2, -0.2,
      0, 0, 0, 0,
    ], 8, 2, 'coded', timeline);
    const contract = requiredAudioContract('wav_to_aac_mp4');
    expect(evaluateTranscodedAudioContent(source, candidate, contract))
      .toMatchObject({ state: 'VERDICT', verdict: 'PASS' });

    const excess = audioSignal([...candidate.samples, 0, 0], 9, 2, 'coded', timeline);
    expect(evaluateTranscodedAudioContent(source, excess, contract))
      .toMatchObject({ state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_AUDIO_CODED_COUNT_MISMATCH' });

    const lost = audioSignal([...candidate.samples].slice(0, -2), 7, 2, 'coded', timeline);
    expect(evaluateTranscodedAudioContent(source, lost, contract))
      .toMatchObject({ state: 'VERDICT', verdict: 'FAIL' });
  });

  test('lossy metric rejects silence/channel destruction and never guesses missing AAC/Opus timing', () => {
    const source = audioSignal([0.8, -0.2, 0.4, -0.7, -0.6, 0.5, 0.2, 0.9], 4, 2);
    const contract = requiredAudioContract('wav_to_aac_mp4');
    const silence = audioSignal(new Array(8).fill(0), 4, 2);
    expect(evaluateTranscodedAudioContent(source, silence, contract))
      .toMatchObject({ state: 'UNAVAILABLE', reasonCode: 'TRANSCODE_AUDIO_TIMELINE_EVIDENCE_MISSING' });

    const wholeProgramContract = { ...contract, requireExplicitTimeline: false };
    expect(evaluateTranscodedAudioContent(source, silence, wholeProgramContract))
      .toMatchObject({ state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_AUDIO_LOSSY_CONTENT_MISMATCH' });
  });

  test('whole-program granule timing trims coded decoder tail padding without hiding truncation', () => {
    const source = audioSignal([0.2, -0.2, 0.4, -0.4], 4, 1);
    const timeline = {
      kind: 'whole-program' as const,
      presentationSampleFrames: 4,
    };
    const contract = requiredAudioContract('wav_to_vorbis_ogg');
    const padded = audioSignal([0.2, -0.2, 0.4, -0.4, 0.75], 5, 1, 'coded', timeline);
    expect(evaluateTranscodedAudioContent(source, padded, contract))
      .toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
    const truncated = audioSignal([0.2, -0.2, 0.4], 3, 1, 'coded', timeline);
    expect(evaluateTranscodedAudioContent(source, truncated, contract))
      .toMatchObject({ state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_AUDIO_DECODED_PROGRAM_TRUNCATED' });
  });

  test('MP3-in-MP4 admits only the documented sub-millisecond sample-time rounding band', () => {
    const source = audioSignal([0.2, -0.2, 0.4, -0.4], 4, 1);
    const contract = requiredAudioContract('wav_to_mp3_mp4');
    const rounded = audioSignal([0.2, -0.2, 0.4, -0.4, ...new Array(16).fill(0)], 20, 1);
    expect(evaluateTranscodedAudioContent(source, rounded, contract))
      .toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
    const excessive = audioSignal([0.2, -0.2, 0.4, -0.4, ...new Array(33).fill(0)], 37, 1);
    expect(evaluateTranscodedAudioContent(source, excessive, contract))
      .toMatchObject({ state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_AUDIO_EXCESS_SAMPLES' });
  });

  test('AAC-in-MP4 admits sub-millisecond edit-list timescale rounding but not coded-frame drift', () => {
    const sourceSamples = Array.from({ length: 64 }, (_, index) => index % 2 === 0 ? 0.25 : -0.25);
    const source = audioSignal(sourceSamples, 64, 1);
    const candidate = (extraFrames: number): DecodedAudioSignal => {
      const sampleFrames = 64 + extraFrames;
      return audioSignal(
        [...sourceSamples, ...new Array(extraFrames).fill(0)],
        sampleFrames,
        1,
        'coded',
        {
          kind: 'aac-isobmff',
          codedSampleFrames: sampleFrames,
          primingFrames: 0,
          remainderFrames: 0,
          presentationSampleFrames: sampleFrames,
          editListMediaStartFrame: 0,
          timingSource: 'edit-list',
        },
      );
    };
    const contract = requiredAudioContract('wav_to_aac_mp4');
    expect(evaluateTranscodedAudioContent(source, candidate(32), contract))
      .toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
    expect(evaluateTranscodedAudioContent(source, candidate(33), contract))
      .toMatchObject({ state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_AUDIO_EXCESS_SAMPLES' });
  });

  test('the muxed stereo-to-mono row scores the declared channel transform, not metadata alone', () => {
    const source = audioSignal([0.8, -0.2, 0.4, -0.6, -0.6, 0.2, 0.2, 0.8], 4, 2);
    const timeline = {
      kind: 'aac-isobmff' as const,
      codedSampleFrames: 4,
      primingFrames: 0,
      remainderFrames: 0,
      presentationSampleFrames: 4,
      editListMediaStartFrame: 0,
      timingSource: 'edit-list' as const,
    };
    const mono = audioSignal([0.3, -0.1, -0.2, 0.5], 4, 1, 'presentation', timeline);
    const contract = requiredAudioContract('av_downmix_stereo_to_mono');
    expect(contract.sampleFrameTolerance).toBe(96);
    expect(evaluateTranscodedAudioContent(source, mono, contract))
      .toMatchObject({ state: 'VERDICT', verdict: 'PASS', reasonCode: 'TRANSCODE_AUDIO_LOSSY_CONTENT_MATCH' });
    const silence = audioSignal([0, 0, 0, 0], 4, 1, 'presentation', timeline);
    expect(evaluateTranscodedAudioContent(source, silence, contract))
      .toMatchObject({ state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_AUDIO_LOSSY_CONTENT_MISMATCH' });

    const longSource = audioSignal(new Array(128).fill([0.8, -0.2]).flat(), 128, 2);
    const candidate = (frames: number) => audioSignal(
      new Array(frames).fill(0.3),
      frames,
      1,
      'presentation',
      { ...timeline, codedSampleFrames: frames, presentationSampleFrames: frames },
    );
    expect(evaluateTranscodedAudioContent(longSource, candidate(48), contract))
      .toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
    expect(evaluateTranscodedAudioContent(longSource, candidate(31), contract))
      .toMatchObject({ state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_AUDIO_LOST_SAMPLES' });
  });

  test('every registered audio-content contract is live on its scenario', () => {
    for (const id of transcodeAudioContractScenarioIds()) {
      const scenario = transcodeScenarios.find((entry) => entry.id === id);
      expect(scenario, id).toBeDefined();
      expect(scenario!.oracles, id).toContain('property-invariant');
      expect(optionsOf(scenario!).invariant, id).toBe('transcode-audio-content');
    }
  });
});

describe('REQ-FEAT-22 ABR renditions form a switchable set', () => {
  const contract = defineAbrSwitchingContract({
    id: 'test-set',
    renditions: [
      { id: 'high', codec: 'h264', width: 1280, height: 720, targetBitrateBps: 2_000_000,
        minimumBitrateRatio: 0.8, maximumBitrateRatio: 1.2 },
      { id: 'low', codec: 'h264', width: 640, height: 360, targetBitrateBps: 1_000_000,
        minimumBitrateRatio: 0.8, maximumBitrateRatio: 1.2 },
    ],
    durationToleranceUs: 1_000,
    alignmentToleranceUs: 1_000,
    requireCommonTimebase: true,
  });
  const description: AbrRenditionSetDescription = {
    kind: 'explicit', id: 'test-set', renditionIds: ['high', 'low'],
    switchPointsUs: [0, 1_000_000], segmentMode: 'random-access',
  };

  test('bitrate, duration, timebase, random access, and bidirectional adjacent switching all gate', () => {
    const evidence = [abrEvidence('high', 1280, 720, 2_000_000), abrEvidence('low', 640, 360, 1_000_000)];
    const switches = abrSwitchEvidence(description);
    expect(evaluateAbrSwitchability(contract, description, evidence, switches))
      .toMatchObject({ state: 'VERDICT', verdict: 'PASS', reasonCode: 'TRANSCODE_ABR_SWITCHABLE_SET' });
    expect(evaluateAbrSwitchability(contract, undefined, evidence))
      .toMatchObject({ state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_ABR_DESCRIPTION_MISSING' });
    expect(evaluateAbrSwitchability(contract, description, evidence))
      .toMatchObject({ state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_ABR_SWITCH_DECODE_EVIDENCE_MISSING' });

    const bitrateWrong = [{ ...evidence[0]!, bitrateBps: 200_000 }, evidence[1]!];
    expect(evaluateAbrSwitchability(contract, description, bitrateWrong, switches))
      .toMatchObject({ state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_ABR_BITRATE_BAND_MISMATCH' });

    const keyframeWrong = [evidence[0]!, {
      ...evidence[1]!,
      samples: evidence[1]!.samples.map((sample, index) => ({ ...sample, keyframe: index === 0 })),
    }];
    expect(evaluateAbrSwitchability(contract, description, keyframeWrong, switches))
      .toMatchObject({ state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_ABR_RANDOM_ACCESS_MISALIGNED' });

    const decodedGap = switches.map((attempt, index) => index === 0
      ? { ...attempt, targetFirstPtsUs: attempt.targetFirstPtsUs + 10_000 }
      : attempt);
    expect(evaluateAbrSwitchability(contract, description, evidence, decodedGap))
      .toMatchObject({ state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_ABR_DECODED_SWITCH_GAP' });
  });

  test('independent quality representation difference remains a valid switchable set', () => {
    const evidence = [
      abrEvidence('high', 1280, 720, 2_000_000),
      { ...abrEvidence('low', 640, 360, 1_000_000),
        quality: transcodeVerdict('PASS', 'ORACLE_REPRESENTATION_DIFF', 'alternate valid encode') },
    ];
    // Under the binary model a representation-different-but-valid rendition is a PASS; the switchable
    // set is not gated by it, so the decisive outcome is the match-style TRANSCODE_ABR_SWITCHABLE_SET.
    expect(evaluateAbrSwitchability(contract, description, evidence, abrSwitchEvidence(description)))
      .toMatchObject({ state: 'VERDICT', verdict: 'PASS', reasonCode: 'TRANSCODE_ABR_SWITCHABLE_SET' });
  });

  test('the actual MP4 collector measures video samples rather than file-count proxies', async () => {
    const bytes = await fixtureBytes('tiny_h264_360p_2s.mp4');
    const result = collectAbrRenditionEvidence(
      'tiny', { bytes, mime: 'video/mp4', container: 'mp4' },
      transcodeVerdict('PASS', 'VALID', 'valid'),
      transcodeVerdict('PASS', 'QUALITY', 'quality'),
    );
    expect(result.state).toBe('OK');
    if (result.state === 'OK') {
      expect(result.value.samples.length).toBeGreaterThan(1);
      expect(result.value.bitrateBps).toBeGreaterThan(0);
      expect(result.value.timebase.denominator).toBeGreaterThan(0);
    }
    expect(TRANSCODE_ABR_CONTRACT.renditions.map((entry) => entry.id)).toEqual(['1080p', '720p', '480p', '360p']);
    const scenario = transcodeScenarios.find((entry) => entry.id === 'transcode/fanout_h264_abr_ladder')!;
    expect(scenario.renditionIds).toEqual(['1080p', '720p', '480p', '360p']);
  });
});

describe('REQ-FEAT-23 real output-bound round trip', () => {
  test('leg two consumes leg one exact bytes and the final reference stays original', async () => {
    const seen = new Map<string, Uint8Array>();
    const result = await executeTranscodeRoundTrip(
      TRANSCODE_ROUNDTRIP_CONTRACT,
      media([1, 2, 3], 'mp4'),
      async (scenarioId, input) => {
        const bytes = input.materialize();
        seen.set(scenarioId, bytes);
        return {
          consumedInputSha256: sha256Hex(bytes),
          output: scenarioId.endsWith('leg1_h264_to_vp9')
            ? media([...bytes, 9], 'webm')
            : media([...bytes, 7], 'mp4'),
        };
      },
    );
    expect(result.state).toBe('OK');
    if (result.state !== 'OK') return;
    expect(seen.get(TRANSCODE_ROUNDTRIP_CONTRACT.leg2ScenarioId)).toEqual(new Uint8Array([1, 2, 3, 9]));
    expect(result.value.leg2ConsumedSha256).toBe(result.value.leg1OutputSha256);
    expect(result.value.finalReferenceSha256).toBe(result.value.originalSourceSha256);
    expect(assessTranscodeRoundTripProvenance(TRANSCODE_ROUNDTRIP_CONTRACT, result.value))
      .toMatchObject({ state: 'VERDICT', verdict: 'PASS', reasonCode: 'TRANSCODE_ROUNDTRIP_COMPOSED' });
  });

  test('perturbing leg one changes leg two source, and a stale fixed input digest fails', async () => {
    const leg2Inputs: string[] = [];
    const run = async (marker: number) => executeTranscodeRoundTrip(
      TRANSCODE_ROUNDTRIP_CONTRACT,
      media([4, 5, 6], 'mp4'),
      async (scenarioId, input) => {
        const bytes = input.materialize();
        if (scenarioId === TRANSCODE_ROUNDTRIP_CONTRACT.leg2ScenarioId) leg2Inputs.push(sha256Hex(bytes));
        return {
          consumedInputSha256: sha256Hex(bytes),
          output: scenarioId === TRANSCODE_ROUNDTRIP_CONTRACT.leg1ScenarioId
            ? media([...bytes, marker], 'webm')
            : media([...bytes, 8], 'mp4'),
        };
      },
    );
    expect((await run(1)).state).toBe('OK');
    expect((await run(2)).state).toBe('OK');
    expect(leg2Inputs[0]).not.toBe(leg2Inputs[1]);

    const stale = await executeTranscodeRoundTrip(
      TRANSCODE_ROUNDTRIP_CONTRACT,
      media([4, 5, 6], 'mp4'),
      async (scenarioId, input) => ({
        consumedInputSha256: scenarioId === TRANSCODE_ROUNDTRIP_CONTRACT.leg2ScenarioId
          ? '0'.repeat(64)
          : input.sha256,
        output: media([7, 8, 9], scenarioId === TRANSCODE_ROUNDTRIP_CONTRACT.leg1ScenarioId ? 'webm' : 'mp4'),
      }),
    );
    expect(stale).toMatchObject({
      state: 'BLOCKED',
      decision: { state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_ROUNDTRIP_OUTPUT_BINDING_MISMATCH' },
    });
  });

  test('a shared applicability miss propagates instead of being relabeled ERROR', async () => {
    let thrown: unknown;
    try {
      await executeTranscodeRoundTrip(
        TRANSCODE_ROUNDTRIP_CONTRACT,
        media([1, 2, 3], 'mp4'),
        async () => {
          throw createNotApplicableError('test-engine', 'transcode', 'tuple unsupported');
        },
      );
    } catch (error) {
      thrown = error;
    }
    expect(isNotApplicableError(thrown)).toBe(true);
  });

  test('leg two declares the composed invariant instead of claiming a fixed stand-in is cumulative', () => {
    const leg2 = transcodeScenarios.find((entry) => entry.id === TRANSCODE_ROUNDTRIP_CONTRACT.leg2ScenarioId)!;
    expect(leg2.oracles).toContain('property-invariant');
    expect(optionsOf(leg2).invariant).toBe('transcode-roundtrip-composed');
  });
});

describe('REQ-FEAT-24 correctness-gated metrics and honest thresholds', () => {
  const passEvidence = [
    { oracle: 'ssim-psnr' as const, state: 'VERDICT' as const, verdict: 'PASS' as const, reasonCode: 'ORACLE_MATCH' },
    { oracle: 'playback-smoke' as const, state: 'VERDICT' as const, verdict: 'PASS' as const, reasonCode: 'ORACLE_MATCH' },
  ];

  test('every admitted rate names observed components and its PASS/DIFF verdict', () => {
    const contract = defineTranscodeMetricAdmissionContract({
      mandatoryOracles: ['ssim-psnr', 'playback-smoke'], allowedDiffs: [], thresholds: [],
    });
    const rate = makeTranscodeRateEvidence({
      metric: 'framesPerSec',
      numerator: { name: 'output presentation frames', value: 60, unit: 'frame', source: 'neutral-output-sample-table' },
      denominator: { name: 'measured operation wall', value: 2, unit: 'second', source: 'monotonic-operation-window' },
      associatedVerdict: 'PASS',
    });
    expect(admitTranscodeMetrics(contract, passEvidence, {}, [rate]))
      .toMatchObject({ state: 'ADMITTED', associatedVerdict: 'PASS', rates: [{ value: 30 }] });

    const estimated = {
      ...rate,
      numerator: { ...rate.numerator, source: 'source nominal fps times golden duration estimate' },
    } as unknown as typeof rate;
    expect(admitTranscodeMetrics(contract, passEvidence, {}, [estimated]))
      .toMatchObject({ state: 'BLOCKED', decision: { state: 'UNAVAILABLE', reasonCode: 'TRANSCODE_RATE_NUMERATOR_ESTIMATED' } });
  });

  test('missing mandatory evidence cannot publish; a representation difference publishes as PASS', () => {
    const contract = defineTranscodeMetricAdmissionContract({
      mandatoryOracles: ['ssim-psnr', 'playback-smoke'], allowedDiffs: [], thresholds: [],
    });
    expect(admitTranscodeMetrics(contract, passEvidence.slice(0, 1), {}, []))
      .toMatchObject({ state: 'BLOCKED', decision: { state: 'UNAVAILABLE', reasonCode: 'TRANSCODE_METRIC_MANDATORY_EVIDENCE_MISSING' } });
    expect(admitTranscodeMetrics(contract, [...passEvidence, passEvidence[0]!], {}, []))
      .toMatchObject({ state: 'BLOCKED', decision: { state: 'ERROR', reasonCode: 'TRANSCODE_METRIC_ORACLE_EVIDENCE_DUPLICATE' } });
    // A representation difference is a PASS that still carries its representation-difference reasonCode,
    // and is admitted for metrics regardless of any allowed-diff declaration under the binary model.
    const diffEvidence = [
      { ...passEvidence[0]!, verdict: 'PASS' as const, reasonCode: 'ORACLE_REPRESENTATION_DIFF' },
      passEvidence[1]!,
    ];
    expect(admitTranscodeMetrics(contract, diffEvidence, {}, []))
      .toMatchObject({ state: 'ADMITTED', associatedVerdict: 'PASS' });

    const allowed = defineTranscodeMetricAdmissionContract({
      mandatoryOracles: ['ssim-psnr', 'playback-smoke'],
      allowedDiffs: [{ oracle: 'ssim-psnr', reasonCodes: ['ORACLE_REPRESENTATION_DIFF'] }],
      thresholds: [],
    });
    expect(admitTranscodeMetrics(allowed, diffEvidence, {}, []))
      .toMatchObject({ state: 'ADMITTED', associatedVerdict: 'PASS' });
  });

  test('changing a gating threshold changes the verdict; advisory thresholds never pretend to gate', () => {
    const contractAt = (value: number, mode: 'gating' | 'advisory' = 'gating') =>
      defineTranscodeMetricAdmissionContract({
        mandatoryOracles: ['ssim-psnr', 'playback-smoke'], allowedDiffs: [],
        thresholds: [{ id: 'ssim', measurement: 'ssimScore', mode, comparator: 'at-least', value }],
      });
    expect(admitTranscodeMetrics(contractAt(0.9), passEvidence, { ssimScore: 0.95 }, []))
      .toMatchObject({ state: 'ADMITTED' });
    expect(admitTranscodeMetrics(contractAt(0.99), passEvidence, { ssimScore: 0.95 }, []))
      .toMatchObject({ state: 'BLOCKED', decision: { state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_GATING_THRESHOLD_FAILED' } });
    expect(admitTranscodeMetrics(contractAt(0.99, 'advisory'), passEvidence, { ssimScore: 0.95 }, []))
      .toMatchObject({ state: 'ADMITTED', advisoryThresholds: [{ id: 'ssim', passed: false }] });
  });

  test('scenario thresholds no longer expose ignored PSNR gates or inferred encode/decode rates', () => {
    expect(transcodeScenarios.some((scenario) => scenario.tolerances.psnrMinDb !== undefined)).toBe(false);
    expect(transcodeScenarios.some((scenario) => scenario.metrics.includes('encodeFps') || scenario.metrics.includes('decodeFps')))
      .toBe(false);
    const contract = transcodeMetricAdmissionContract({ oracles: ['ssim-psnr'], ssimMin: 0.97 });
    expect(contract.thresholds).toEqual([{
      id: 'transcode-ssim-gate', measurement: 'ssimScore', mode: 'gating', comparator: 'at-least', value: 0.97,
    }]);
  });
});

function requiredTransform(id: string) {
  const contract = transcodeTransformContractForScenario(id);
  if (!contract) throw new Error(`missing transform contract ${id}`);
  return contract;
}

function requiredAudioContract(id: string) {
  const contract = transcodeAudioContractForScenario(id);
  if (!contract) throw new Error(`missing audio contract ${id}`);
  return contract;
}

function pixelFrame(
  values: readonly number[],
  width: number,
  height: number,
  bitDepth = 8,
  ptsUs = 0,
): TranscodePixelFrame {
  const data = bitDepth <= 8 ? new Uint8Array(values) : new Uint16Array(values.map((value) => value * 4));
  return { ptsUs, durationUs: 33_333, width, height, bitDepth, data };
}

function audioSignal(
  samples: readonly number[],
  sampleFrames: number,
  channels: number,
  timelineDomain: DecodedAudioSignal['timelineDomain'] = 'presentation',
  timeline?: DecodedAudioSignal['timeline'],
): DecodedAudioSignal {
  return {
    sampleRate: 48_000,
    channels,
    sampleFrames,
    samples: Float64Array.from(samples),
    timelineDomain,
    ...(timeline ? { timeline } : {
      timeline: { kind: 'whole-program' as const, presentationSampleFrames: sampleFrames },
    }),
  };
}

function abrEvidence(
  id: string,
  width: number,
  height: number,
  bitrateBps: number,
): AbrRenditionEvidence {
  const valid = transcodeVerdict('PASS', 'VALID', 'valid');
  return {
    id, codec: 'h264', width, height, bitrateBps, durationUs: 2_000_000,
    timebase: { numerator: 1, denominator: 90_000 },
    samples: [
      { ptsUs: 0, durationUs: 1_000_000, keyframe: true },
      { ptsUs: 1_000_000, durationUs: 1_000_000, keyframe: true },
    ],
    validity: valid,
    quality: valid,
  };
}

function abrSwitchEvidence(description: AbrRenditionSetDescription): AbrSwitchDecodeEvidence[] {
  const decisions = [] as AbrSwitchDecodeEvidence[];
  for (const point of description.switchPointsUs) {
    for (let index = 0; index + 1 < description.renditionIds.length; index++) {
      const high = description.renditionIds[index]!;
      const low = description.renditionIds[index + 1]!;
      for (const [fromId, toId] of [[high, low], [low, high]] as const) {
        decisions.push({
          fromId, toId, switchPointUs: point, sourceLastEndUs: point, targetFirstPtsUs: point,
          decodedTargetFrames: 1,
          decision: transcodeVerdict('PASS', 'TRANSCODE_ABR_SWITCH_DECODED', 'stitched stream decoded'),
        });
      }
    }
  }
  return decisions;
}

function optionsOf(scenario: (typeof transcodeScenarios)[number]): Record<string, unknown> {
  return scenario.options as Record<string, unknown>;
}

function media(values: readonly number[], container: string): MediaBytes {
  return {
    bytes: new Uint8Array(values),
    mime: container === 'webm' ? 'video/webm' : 'video/mp4',
    container,
  };
}

async function fixtureBytes(file: string): Promise<Uint8Array> {
  return new Uint8Array(await Bun.file(`${ROOT}/fixtures/media/${file}`).arrayBuffer());
}
