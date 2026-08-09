import { describe, expect, test } from 'bun:test';

import { createNotApplicableError, isNotApplicableError, type MediaBytes } from '../src/core/engine.ts';
import { reduceOracleOutcomes, type OracleOutcome } from '../src/core/scenario.ts';
import { sha256Hex } from '../src/core/seeded-rng.ts';
import type { RemuxProgramEvidence, RemuxTrackEvidence } from '../src/features/remux/types.ts';
import { transcodeScenarios } from '../src/scenarios/transcode/index.ts';
import {
  TRANSCODE_ABR_CONTRACT,
  TRANSCODE_H264_2MBPS_AVERAGE_BITRATE_CONTRACT,
  TRANSCODE_ROUNDTRIP_CONTRACT,
  admitTranscodeMetrics,
  applyTranscodeTransform,
  assessTranscodeRoundTripProvenance,
  collectAbrRenditionEvidence,
  collectAverageVideoBitrateEvidence,
  defineAbrSwitchingContract,
  defineAverageVideoBitrateContract,
  defineTranscodeMetricAdmissionContract,
  endpointInclusiveQualitySamplePts,
  evaluateAbrSwitchability,
  evaluateAverageVideoBitrate,
  evaluateOmittedAacPreservation,
  evaluateTranscodeTransform,
  evaluateTranscodeTransformSourceSignal,
  evaluateTranscodedAudioContent,
  executeTranscodeRoundTrip,
  makeTranscodeRateEvidence,
  readTranscodeAudioStructure,
  ssimLumaV1QualityContractFromOptions,
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
  type TranscodeDecision,
} from '../src/features/transcode/index.ts';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

describe('transcode exhaustive calibration bounds', () => {
  test('VP9, 2 Mbps AVC, and 1 fps rows expose their measured semantic tolerances', () => {
    const vp9 = transcodeScenarios.find((entry) => entry.id === 'transcode/h264_to_vp9_webm')!;
    const lowBitrate = transcodeScenarios.find((entry) => entry.id === 'transcode/h264_bitrate_2mbps')!;
    const twoPass = transcodeScenarios.find((entry) => entry.id === 'transcode/h264_two_pass_bitrate')!;
    const oneFps = transcodeScenarios.find((entry) => entry.id === 'transcode/extreme_fps_1')!;

    expect(vp9.tolerances?.ssimMin).toBe(0.98);
    expect(lowBitrate.revision).toBe(4);
    expect(lowBitrate.requires.features).toContain('quality-constrained-rate');
    expect(lowBitrate.options.video).toMatchObject({
      codec: 'h264',
      bitrate: 2_000_000,
      maxAverageBitrate: 2_600_000,
      quality: { metric: 'ssim-luma-v1', minimumMean: 0.93, samples: 8 },
    });
    expect(lowBitrate.tolerances?.ssimMin).toBe(0.93);
    expect(lowBitrate.options.invariant).toBe('transcode-preserve-omitted-aac');
    expect(lowBitrate.oracles).toEqual([
      'ssim-psnr', 'average-bitrate', 'property-invariant', 'playback-smoke',
    ]);
    expect(twoPass.revision).toBe(2);
    expect(twoPass.oracles).toEqual(['ssim-psnr', 'average-bitrate', 'playback-smoke']);
    expect(TRANSCODE_H264_2MBPS_AVERAGE_BITRATE_CONTRACT).toMatchObject({
      targetBitrateBps: 2_000_000,
      minimumBitrateRatio: 0.7,
      maximumBitrateRatio: 1.3,
    });
    expect(oneFps.tolerances?.durationToleranceSec).toBe(1);
  });

  test('rotation SSIM uses the calibrated lossy transform floor across every quarter-turn', () => {
    for (const id of ['h264_rotate_180', 'h264_rotate_90_dimswap', 'h264_rotate_270_dimswap']) {
      expect(transcodeScenarios.find((entry) => entry.id === `transcode/${id}`)?.tolerances?.ssimMin, id)
        .toBe(0.95);
    }
  });
});

describe('ssim-luma-v1 public-contract sampling', () => {
  test('defaults an omitted public sample count to eight', () => {
    expect(ssimLumaV1QualityContractFromOptions({
      video: {
        quality: { metric: 'ssim-luma-v1', minimumMean: 0.95 },
      },
    })).toEqual({ metric: 'ssim-luma-v1', minimumMean: 0.95, samples: 8 });
  });

  test('sorts/deduplicates real PTS and includes both presentation endpoints', () => {
    expect(endpointInclusiveQualitySamplePts([100, 50, 0, 75, 50, 25], 3)).toEqual([0, 50, 100]);
    expect(endpointInclusiveQualitySamplePts(new Float64Array([100, 0, 25, 50, 75]), 5))
      .toEqual([0, 25, 50, 75, 100]);
  });

  test('uses the nearest real midpoint and resolves exact ties toward the earlier PTS', () => {
    expect(endpointInclusiveQualitySamplePts([0, 40, 60, 100], 1)).toEqual([40]);
    expect(endpointInclusiveQualitySamplePts([0, 60, 100], 1)).toEqual([60]);
  });

  test('keeps irregular interior selections unique while retaining a distant last frame', () => {
    expect(endpointInclusiveQualitySamplePts([0, 1, 2, 3, 100], 4)).toEqual([0, 2, 3, 100]);
    expect(endpointInclusiveQualitySamplePts([0, 1, 49, 51, 52, 100], 4))
      .toEqual([0, 49, 52, 100]);
    expect(new Set(endpointInclusiveQualitySamplePts([0, 1, 2, 3, 100], 4)).size).toBe(4);
  });

  test('returns every available real PTS and rejects malformed timestamp/sample requests', () => {
    expect(endpointInclusiveQualitySamplePts([9, 3, 9], 8)).toEqual([3, 9]);
    expect(endpointInclusiveQualitySamplePts([], 8)).toEqual([]);
    expect(() => endpointInclusiveQualitySamplePts([0], 0)).toThrow();
    expect(() => endpointInclusiveQualitySamplePts([-1, 0], 1)).toThrow();
    expect(() => endpointInclusiveQualitySamplePts([0, Number.NaN], 1)).toThrow();
  });
});

describe('omitted AAC preservation', () => {
  test('accepts exact access units/timing and at most one observed container tick of A/V skew', () => {
    expect(evaluateOmittedAacPreservation(omittedAacProgram(), omittedAacProgram()))
      .toMatchObject({
        state: 'VERDICT', verdict: 'PASS', reasonCode: 'TRANSCODE_OMITTED_AAC_PRESERVED',
      });
    expect(evaluateOmittedAacPreservation(
      omittedAacProgram(),
      omittedAacProgram({ shiftAllAudioUs: 1 }),
    )).toMatchObject({
      state: 'VERDICT', verdict: 'PASS', measurements: { containerTickToleranceUs: 1 },
    });
  });

  test('rejects a dropped AAC track', () => {
    expect(evaluateOmittedAacPreservation(
      omittedAacProgram(),
      omittedAacProgram({ dropAudio: true }),
    )).toMatchObject({
      state: 'VERDICT',
      verdict: 'FAIL',
      reasonCode: 'TRANSCODE_OMITTED_AAC_CANDIDATE_TRACK_SHAPE_MISMATCH',
    });
  });

  test('rejects shifted AAC PTS through both normalized timing and A/V boundary evidence', () => {
    expect(evaluateOmittedAacPreservation(
      omittedAacProgram(),
      omittedAacProgram({ shiftMiddleAudioUs: 1 }),
    )).toMatchObject({
      state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_OMITTED_AAC_TIMESTAMP_MISMATCH',
    });
    expect(evaluateOmittedAacPreservation(
      omittedAacProgram(),
      omittedAacProgram({ shiftAllAudioUs: 2 }),
    )).toMatchObject({
      state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_OMITTED_AAC_AV_SKEW_MISMATCH',
    });
  });

  test('rejects altered AAC access-unit payload bytes', () => {
    expect(evaluateOmittedAacPreservation(
      omittedAacProgram(),
      omittedAacProgram({ alterPayload: true }),
    )).toMatchObject({
      state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_OMITTED_AAC_PAYLOAD_MISMATCH',
    });
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

  test('display-matrix normalization preserves already presented pixels and requires identity signaling', () => {
    const contract = requiredTransform('h264_rotate_normalize');
    const displayed = pixelFrame([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 0, 255,
    ], 2, 2);
    expect(evaluateTranscodeTransform([displayed], [displayed], { rotationDegrees: 0 }, contract))
      .toMatchObject({ state: 'VERDICT', verdict: 'PASS', reasonCode: 'TRANSCODE_TRANSFORM_SIGNAL_AND_SHAPE_MATCH' });
    expect(evaluateTranscodeTransform([displayed], [displayed], { rotationDegrees: 90 }, contract))
      .toMatchObject({ state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_TRANSFORM_SIGNALING_MISMATCH' });
  });

  test('lossy geometry admits a bounded extreme tail but rejects a localized dense corruption', () => {
    const contract = requiredTransform('h264_rotate_180');
    const values = new Array<number>(100 * 100 * 4).fill(0);
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 30; x++) {
        const offset = (y * 100 + x) * 4;
        values[offset] = 255;
        values[offset + 3] = 255;
      }
    }
    for (let pixel = 0; pixel < 100 * 100; pixel++) values[pixel * 4 + 3] = 255;
    const source = pixelFrame(values, 100, 100);
    const sparse = applyTranscodeTransform(source, contract);
    sparse.data[2] = 255;
    expect(evaluateTranscodeTransform([source], [sparse], { rotationDegrees: 0 }, contract))
      .toMatchObject({ state: 'VERDICT', verdict: 'PASS', reasonCode: 'TRANSCODE_TRANSFORM_EFFECT_MATCH' });

    const dense = applyTranscodeTransform(source, contract);
    for (let pixel = 0; pixel < 500; pixel++) dense.data[pixel * 4 + 2] = 255;
    expect(evaluateTranscodeTransform([source], [dense], { rotationDegrees: 0 }, contract))
      .toMatchObject({ state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_TRANSFORM_PIXEL_MISMATCH' });
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

  test('letterbox reference scales to contain before padding, including sources larger than the target', () => {
    const contract = requiredTransform('h264_pad_letterbox_4x3_to_16x9');
    const red4x3 = pixelFrame(new Array(4 * 3).fill(undefined).flatMap(() => [255, 0, 0, 255]), 4, 3);
    const smallContract = {
      ...contract,
      steps: [{ kind: 'contain-pad', width: 8, height: 4, placement: 'center', color: [0, 0, 0, 1] }],
    } as typeof contract;
    const contained = applyTranscodeTransform(red4x3, smallContract);

    expect([contained.width, contained.height]).toEqual([8, 4]);
    expect([...contained.data.slice(0, 4)]).toEqual([0, 0, 0, 255]);
    expect([...contained.data.slice(4, 8)]).toEqual([255, 0, 0, 255]);
    expect([...contained.data.slice(7 * 4, 8 * 4)]).toEqual([0, 0, 0, 255]);

    const oversized = pixelFrame(new Array(16 * 9).fill(undefined).flatMap(() => [0, 255, 0, 255]), 16, 9);
    expect(() => applyTranscodeTransform(oversized, smallContract)).not.toThrow();
  });

  test('color conversion preserves normalized sRGB appearance and rejects a raw no-op retag', () => {
    const color = requiredTransform('h264_colorspace_709_to_2020');
    expect(color.minimumEffectCompletionRatio).toBe(0.9);
    // WebCodecs copyTo(RGBA) normalizes both decoded sides to sRGB. These source samples are deliberately
    // inside BT.709 but far from a neutral axis so merely retagging their raw coordinates as BT.2020 is
    // visibly discriminating after the candidate is normalized back to sRGB.
    const source = pixelFrame([144, 248, 64, 255], 1, 1);
    const targetCoordinateReference = applyTranscodeTransform(source, color);
    const colorCandidate = source;
    const colorSignal = {
      colorPrimaries: 'bt2020', transfer: 'bt2020-10', matrix: 'bt2020-ncl', range: 'limited', bitDepth: 8,
    } as const;
    expect(targetCoordinateReference.data).not.toEqual(source.data);
    expect(evaluateTranscodeTransform([source], [colorCandidate], colorSignal, color))
      .toMatchObject({ state: 'VERDICT', verdict: 'PASS', reasonCode: 'TRANSCODE_TRANSFORM_EFFECT_MATCH' });

    // Independently calculate the decoded sRGB appearance of values that were not converted before being
    // tagged BT.2020. The large red collapse proves the oracle does not turn presentation preservation
    // into permission for a signal-only retag.
    const retaggedRgb = normalizedSrgbAfterRawBt2020Retag([144, 248, 64]);
    expect(retaggedRgb).toEqual([0, 255, 0]);
    const rawNoOpRetag = pixelFrame([...retaggedRgb, 255], 1, 1);
    const rawNoOpDecision = evaluateTranscodeTransform([source], [rawNoOpRetag], colorSignal, color);
    expect(rawNoOpDecision).toMatchObject({
      state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_TRANSFORM_EFFECT_NOT_OBSERVED',
    });
    expect(Math.abs(rawNoOpDecision.measurements?.effectCompletionRatio ?? 1)).toBeLessThan(0.03);
    expect(rawNoOpDecision.measurements?.targetCoordinateClosenessRatio).toBeLessThan(0.9);
    expect(evaluateTranscodeTransform([source], [colorCandidate], { ...colorSignal, colorPrimaries: 'bt709' }, color))
      .toMatchObject({ state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_TRANSFORM_SIGNALING_MISMATCH' });

    // A neutral/low-chroma sample is the adversarial boundary: its raw-retag appearance error remains
    // below the broad lossy-codec mean tolerance, but target-coordinate normalization recovers the raw
    // no-op and the independent minimum-observable-effect guard still rejects it.
    const neutral = pixelFrame([128, 128, 128, 255], 1, 1);
    expect(evaluateTranscodeTransform([neutral], [neutral], colorSignal, color))
      .toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
    const neutralRetaggedRgb = normalizedSrgbAfterRawBt2020Retag([128, 128, 128]);
    expect(neutralRetaggedRgb).toEqual([140, 140, 140]);
    const neutralRetag = pixelFrame([...neutralRetaggedRgb, 255], 1, 1);
    const neutralRetagDecision = evaluateTranscodeTransform(
      [neutral],
      [neutralRetag],
      colorSignal,
      color,
    );
    expect(neutralRetagDecision).toMatchObject({
      state: 'VERDICT',
      verdict: 'FAIL',
      reasonCode: 'TRANSCODE_TRANSFORM_EFFECT_NOT_OBSERVED',
    });
    expect(neutralRetagDecision.measurements?.meanAbsoluteError)
      .toBeLessThan(color.tolerance.meanAbsoluteError);
  });

  test('color completion is a strict semantic endpoint invariant, independent of codec-error bounds', () => {
    const color = requiredTransform('h264_colorspace_709_to_2020');
    const sourceRgb = [144, 248, 64] as const;
    const source = pixelFrame([...sourceRgb, 255], 1, 1);
    const signalOnlyRetag = normalizedSrgbAfterRawBt2020Retag(sourceRgb);
    const signal = {
      colorPrimaries: 'bt2020', transfer: 'bt2020-10', matrix: 'bt2020-ncl', range: 'limited', bitDepth: 8,
    } as const;
    const candidateAt = (completion: number): TranscodePixelFrame => {
      const presentation = signalOnlyRetag.map((sample, channel) =>
        Math.round(sample + completion * (sourceRgb[channel]! - sample))) as [number, number, number];
      return pixelFrame([...presentation, 255], 1, 1);
    };

    for (const completion of [0.5, 0.6, 0.75, 0.89]) {
      const decision = evaluateTranscodeTransform([source], [candidateAt(completion)], signal, color);
      expect(decision, String(completion)).toMatchObject({
        state: 'VERDICT',
        verdict: 'FAIL',
        reasonCode: completion === 0.5
          ? 'TRANSCODE_TRANSFORM_EFFECT_NOT_OBSERVED'
          : 'TRANSCODE_TRANSFORM_EFFECT_INCOMPLETE',
      });
      expect(decision.measurements?.effectCompletionRatio, String(completion)).toBeLessThan(0.9);
      expect(decision.measurements?.targetCoordinateClosenessRatio, String(completion)).toBeLessThan(0.9);
    }

    const boundary = evaluateTranscodeTransform([source], [candidateAt(0.9)], signal, color);
    expect(boundary).toMatchObject({
      state: 'VERDICT', verdict: 'PASS', reasonCode: 'TRANSCODE_TRANSFORM_EFFECT_MATCH',
    });
    const observedBoundary = boundary.measurements?.effectCompletionRatio;
    expect(observedBoundary).toBeGreaterThanOrEqual(0.9);
    if (typeof observedBoundary !== 'number' || !Number.isFinite(observedBoundary)) {
      throw new Error('color boundary did not publish a finite completion ratio');
    }
    expect(evaluateTranscodeTransform(
      [source],
      [candidateAt(0.9)],
      signal,
      { ...color, minimumEffectCompletionRatio: observedBoundary },
    )).toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
    expect(evaluateTranscodeTransform(
      [source],
      [candidateAt(0.9)],
      signal,
      { ...color, minimumEffectCompletionRatio: observedBoundary + Number.EPSILON },
    )).toMatchObject({
      state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_TRANSFORM_EFFECT_INCOMPLETE',
    });
  });

  test('color projection admits bounded orthogonal codec noise but rejects orthogonal work and corruption', () => {
    const color = requiredTransform('h264_colorspace_709_to_2020');
    const sourceRgb = [128, 192, 64] as const;
    const noOpRgb = normalizedSrgbAfterRawBt2020Retag(sourceRgb);
    const source = pixelFrame([...sourceRgb, 255], 1, 1);
    const signal = {
      colorPrimaries: 'bt2020', transfer: 'bt2020-10', matrix: 'bt2020-ncl', range: 'limited', bitDepth: 8,
    } as const;
    const axis = sourceRgb.map((sample, channel) => sample - noOpRgb[channel]!) as [number, number, number];
    // [axis.z, 0, -axis.x] has an exact zero dot-product with the authored no-op→source axis.
    const orthogonal = [axis[2], 0, -axis[0]] as const;
    const frameAt = (origin: readonly [number, number, number], scale: number): TranscodePixelFrame =>
      pixelFrame([
        ...origin.map((sample, channel) =>
          Math.max(0, Math.min(255, Math.round(sample + scale * orthogonal[channel]!)))),
        255,
      ], 1, 1);

    const orthogonalOnly = evaluateTranscodeTransform(
      [source], [frameAt(noOpRgb, 1)], signal, color,
    );
    expect(orthogonalOnly).toMatchObject({
      state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_TRANSFORM_EFFECT_INCOMPLETE',
    });
    expect(Math.abs(orthogonalOnly.measurements?.effectCompletionRatio ?? 1)).toBeLessThan(0.03);

    const codecLikeNoise = evaluateTranscodeTransform(
      [source], [frameAt(sourceRgb, 0.25)], signal, color,
    );
    expect(codecLikeNoise).toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
    expect(codecLikeNoise.measurements?.effectCompletionRatio).toBeGreaterThanOrEqual(0.9);
    expect(codecLikeNoise.measurements?.targetCoordinateClosenessRatio).toBeLessThan(0.9);

    const corrupted = evaluateTranscodeTransform(
      [source], [frameAt(sourceRgb, 1.5)], signal, color,
    );
    expect(corrupted.measurements?.effectCompletionRatio).toBeGreaterThanOrEqual(0.9);
    expect(corrupted).toMatchObject({
      state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_TRANSFORM_SEMANTIC_RESIDUAL_EXCESSIVE',
    });
  });

  test('color completion accepts target-coordinate proof when decoded-sRGB projection is noise-dominated', () => {
    const color = requiredTransform('h264_colorspace_709_to_2020');
    const source = pixelFrame([24, 24, 24, 255], 1, 1);
    // Small, non-collinear codec noise suppresses the physical decoded-sRGB projection without moving
    // the independently normalized target coordinates outside their strict error or tail bounds.
    const codecNoisyCandidate = pixelFrame([28, 23, 26, 255], 1, 1);
    const signal = {
      colorPrimaries: 'bt2020', transfer: 'bt2020-10', matrix: 'bt2020-ncl', range: 'limited', bitDepth: 8,
    } as const;
    const decision = evaluateTranscodeTransform([source], [codecNoisyCandidate], signal, color);

    expect(decision).toMatchObject({
      state: 'VERDICT', verdict: 'PASS', reasonCode: 'TRANSCODE_TRANSFORM_EFFECT_MATCH',
    });
    expect(decision.measurements?.targetCoordinateClosenessRatio).toBeGreaterThanOrEqual(0.9);
    expect(decision.measurements?.effectCompletionRatio).toBeLessThan(0.9);
    expect(decision.measurements?.meanSemanticEndpointError)
      .toBeLessThanOrEqual(color.tolerance.meanAbsoluteError);
    expect(decision.measurements?.meanAbsoluteError)
      .toBeLessThanOrEqual(color.tolerance.meanAbsoluteError);
    expect(decision.measurements?.maximumAbsoluteError)
      .toBeLessThanOrEqual(color.tolerance.maxAbsoluteError);
  });

  test('color alternate disposition cannot bypass physical residual, signaling, or a materially bad target mean', () => {
    const color = requiredTransform('h264_colorspace_709_to_2020');
    const source = pixelFrame([8, 80, 104, 255], 1, 1);
    const signal = {
      colorPrimaries: 'bt2020', transfer: 'bt2020-10', matrix: 'bt2020-ncl', range: 'limited', bitDepth: 8,
    } as const;
    const boundedAlternate = pixelFrame([8, 50, 90, 255], 1, 1);
    const alternate = evaluateTranscodeTransform([source], [boundedAlternate], signal, color);
    expect(alternate).toMatchObject({
      state: 'VERDICT', verdict: 'PASS', reasonCode: 'TRANSCODE_TRANSFORM_ALTERNATE_VALID_MAPPING',
    });
    expect(alternate.measurements?.meanSemanticEndpointError)
      .toBeLessThanOrEqual(color.tolerance.meanAbsoluteError);

    expect(evaluateTranscodeTransform(
      [source],
      [boundedAlternate],
      { ...signal, transfer: 'bt709' },
      color,
    )).toMatchObject({
      state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_TRANSFORM_SIGNALING_MISMATCH',
    });

    const corrupted = evaluateTranscodeTransform(
      [source],
      [pixelFrame([255, 0, 255, 255], 1, 1)],
      signal,
      color,
    );
    expect(corrupted).toMatchObject({
      state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_TRANSFORM_SEMANTIC_RESIDUAL_EXCESSIVE',
    });
    expect(corrupted.measurements?.effectCompletionRatio).toBeGreaterThanOrEqual(0.9);
    expect(corrupted.measurements?.meanSemanticEndpointError)
      .toBeGreaterThan(color.tolerance.meanAbsoluteError);
    expect(corrupted.measurements?.meanAbsoluteError).toBeGreaterThan(
      Math.max(
        color.tolerance.meanAbsoluteError * 4,
        (corrupted.measurements?.meanReferenceSourceDelta ?? Number.POSITIVE_INFINITY) * 0.75,
      ),
    );
  });

  test('tone-map and depth requests require both pixels and the full authored signal', () => {
    const source = pixelFrame([
      230, 30, 20, 255, 20, 190, 35, 255,
      25, 40, 220, 255, 190, 130, 15, 255,
    ], 2, 2);

    const depth = requiredTransform('h264_8bit_to_hevc_10bit');
    const depthCandidate = applyTranscodeTransform(source, depth);
    expect(evaluateTranscodeTransform([source], [depthCandidate], { bitDepth: 10 }, depth))
      .toMatchObject({ state: 'VERDICT', verdict: 'PASS', reasonCode: 'TRANSCODE_TRANSFORM_SIGNAL_AND_SHAPE_MATCH' });
    expect(evaluateTranscodeTransform([source], [source], { bitDepth: 8 }, depth))
      .toMatchObject({ state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_TRANSFORM_SIGNALING_MISMATCH' });

    const tone = requiredTransform('hdr10_to_sdr_tonemap');
    const normalizedHdrPresentation = pixelFrame([
      240, 210, 170, 255, 180, 200, 245, 255,
      220, 100, 60, 255, 150, 230, 120, 255,
    ], 2, 2, 10);
    const sourceSignal = {
      colorPrimaries: 'bt2020', transfer: 'pq', matrix: 'bt2020-ncl', range: 'limited', bitDepth: 10,
    } as const;
    const sdrSignal = {
      colorPrimaries: 'bt709', transfer: 'bt709', matrix: 'bt709', range: 'limited', bitDepth: 8,
    } as const;
    expect(evaluateTranscodeTransformSourceSignal(sourceSignal, tone)).toBeUndefined();
    expect(evaluateTranscodeTransformSourceSignal({ ...sourceSignal, transfer: 'bt709' }, tone))
      .toMatchObject({
        state: 'UNAVAILABLE', status: 'NA_ASSET',
        reasonCode: 'TRANSCODE_TRANSFORM_SOURCE_SIGNALING_MISMATCH',
      });
    expect(evaluateTranscodeTransformSourceSignal({ bitDepth: 10 }, tone)).toMatchObject({
      state: 'UNAVAILABLE', status: 'NA_ASSET',
      reasonCode: 'TRANSCODE_TRANSFORM_SOURCE_SIGNALING_UNAVAILABLE',
    });

    // WebCodecs' RGBA readback is already target-sRGB. The tone-map endpoint must preserve that
    // presentation while changing depth/signaling; interpreting these values as PQ a second time is wrong.
    const toneCandidate = applyTranscodeTransform(normalizedHdrPresentation, tone);
    expect(toneCandidate.bitDepth).toBe(8);
    expect([...toneCandidate.data]).toEqual([
      240, 210, 170, 255, 180, 200, 245, 255,
      220, 100, 60, 255, 150, 230, 120, 255,
    ]);
    expect(evaluateTranscodeTransform(
      [normalizedHdrPresentation], [toneCandidate], sdrSignal, tone,
    )).toMatchObject({ state: 'VERDICT', verdict: 'PASS' });

    const wrongPixels = pixelFrame(new Array(4).fill(undefined).flatMap(() => [0, 0, 0, 255]), 2, 2, 8);
    expect(evaluateTranscodeTransform(
      [normalizedHdrPresentation], [wrongPixels], sdrSignal, tone,
    )).toMatchObject({ state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_TRANSFORM_PIXEL_MISMATCH' });
    expect(evaluateTranscodeTransform(
      [normalizedHdrPresentation], [toneCandidate], sourceSignal, tone,
    )).toMatchObject({
      state: 'VERDICT', verdict: 'FAIL', reasonCode: 'TRANSCODE_TRANSFORM_SIGNALING_MISMATCH',
    });

    const anchoredSource = [
      pixelFrame([0, 0, 0, 255], 1, 1, 10, 0),
      pixelFrame([255, 255, 255, 255], 1, 1, 10, 200_000),
      pixelFrame([255, 0, 0, 255], 1, 1, 10, 400_000),
    ];
    const anchoredCandidate = anchoredSource.map((frame) => applyTranscodeTransform(frame, tone));
    const oneFrameShift = anchoredCandidate.map((_, index) => ({
      ...anchoredCandidate[(index + 1) % anchoredCandidate.length]!,
      ptsUs: anchoredCandidate[index]!.ptsUs,
    }));
    expect(evaluateTranscodeTransform(
      anchoredSource,
      oneFrameShift,
      sdrSignal,
      tone,
    )).toMatchObject({
      state: 'VERDICT',
      verdict: 'FAIL',
      reasonCode: 'TRANSCODE_TRANSFORM_PIXEL_MISMATCH',
      measurements: { maximumTimestampDeltaUs: 0 },
    });
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

  test('Opus SNR gate admits the cross-encoder 13.84 dB frontier but rejects a lower neighbor', () => {
    const contract = requiredAudioContract('wav_to_opus_ogg');
    expect(contract).toMatchObject({
      minimumSnrDb: 13.5,
      maximumRmsError: 0.1,
      minimumChannelCorrelation: 0.9,
      sampleFrameTolerance: 0,
      requireExplicitTimeline: true,
    });
    const frames = 4_096;
    const sourceSamples = Array.from(
      { length: frames },
      (_, index) => 0.1 * Math.sin(2 * Math.PI * 17 * index / frames),
    );
    const candidateAtSnr = (snrDb: number): DecodedAudioSignal => {
      const noiseAmplitude = 0.1 / 10 ** (snrDb / 20);
      const samples = sourceSamples.map(
        (sample, index) => sample + noiseAmplitude * Math.sin(2 * Math.PI * 31 * index / frames),
      );
      return audioSignal(samples, frames, 1, 'coded', {
        kind: 'opus-ogg',
        codedSampleFrames: frames,
        preSkipFrames: 0,
        endTrimFrames: 0,
        finalGranulePosition: frames,
        presentationSampleFrames: frames,
      });
    };
    const source = audioSignal(sourceSamples, frames, 1);

    expect(evaluateTranscodedAudioContent(source, candidateAtSnr(13.84), contract)).toMatchObject({
      state: 'VERDICT',
      verdict: 'PASS',
      reasonCode: 'TRANSCODE_AUDIO_LOSSY_CONTENT_MATCH',
      measurements: { sampleFrameDelta: 0 },
    });
    expect(evaluateTranscodedAudioContent(source, candidateAtSnr(13.25), contract)).toMatchObject({
      state: 'VERDICT',
      verdict: 'FAIL',
      reasonCode: 'TRANSCODE_AUDIO_LOSSY_CONTENT_MISMATCH',
    });
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

describe('single-output average video bitrate correctness gate', () => {
  const contract = defineAverageVideoBitrateContract({
    targetBitrateBps: 2_000_000,
    minimumBitrateRatio: 0.7,
    maximumBitrateRatio: 1.3,
  });
  const quality = (verdict: 'PASS' | 'FAIL', ssimMean: number): OracleOutcome => ({
    state: 'VERDICT',
    oracle: 'ssim-psnr',
    verdict,
    reasonCode: verdict === 'PASS' ? 'ORACLE_MATCH' : 'ORACLE_MISMATCH',
    detail: `ssimMean=${ssimMean}`,
    measurements: { ssimMean },
  });
  const playback: OracleOutcome = {
    state: 'VERDICT', oracle: 'playback-smoke', verdict: 'PASS', reasonCode: 'PLAYBACK_OK', detail: 'played',
  };

  test('4 Mbps/high-SSIM fails rate, true-rate/low-SSIM fails quality, and only both pass', () => {
    const fourMbps = averageBitrateOutcome(evaluateAverageVideoBitrate(contract, {
      videoSamplePayloadBytes: 500_000,
      presentationSpanUs: 1_000_000,
      sampleCount: 60,
    }));
    expect(fourMbps).toMatchObject({
      state: 'VERDICT',
      verdict: 'FAIL',
      reasonCode: 'TRANSCODE_AVERAGE_VIDEO_BITRATE_BAND_MISMATCH',
      measurements: { videoAverageBitrateBps: 4_000_000, videoBitrateRatio: 2 },
    });
    expect(reduceOracleOutcomes([fourMbps, quality('PASS', 0.99), playback]).status).toBe('FAIL');

    const twoMbps = averageBitrateOutcome(evaluateAverageVideoBitrate(contract, {
      videoSamplePayloadBytes: 250_000,
      presentationSpanUs: 1_000_000,
      sampleCount: 30,
    }));
    expect(twoMbps).toMatchObject({
      state: 'VERDICT',
      verdict: 'PASS',
      reasonCode: 'TRANSCODE_AVERAGE_VIDEO_BITRATE_MATCH',
      measurements: { videoAverageBitrateBps: 2_000_000, videoBitrateRatio: 1 },
    });
    expect(reduceOracleOutcomes([twoMbps, quality('FAIL', 0.8), playback]).status).toBe('FAIL');
    expect(reduceOracleOutcomes([twoMbps, quality('PASS', 0.95), playback]).status).toBe('PASS');
  });

  test('neutral collection uses video sample payload and presentation span, excluding file overhead', async () => {
    const bytes = await fixtureBytes('tiny_h264_360p_2s.mp4');
    const evidence = collectAverageVideoBitrateEvidence({ bytes, mime: 'video/mp4', container: 'mp4' });
    expect(evidence.state).toBe('OK');
    if (evidence.state !== 'OK') return;
    expect(evidence.value.videoSamplePayloadBytes).toBeGreaterThan(0);
    expect(evidence.value.videoSamplePayloadBytes).toBeLessThan(bytes.byteLength);
    expect(evidence.value.presentationSpanUs).toBeGreaterThan(0);
    expect(evidence.value.sampleCount).toBeGreaterThan(1);

    const measuredBps = evidence.value.videoSamplePayloadBytes * 8 * 1_000_000 /
      evidence.value.presentationSpanUs;
    const centered = defineAverageVideoBitrateContract({
      targetBitrateBps: measuredBps,
      minimumBitrateRatio: 0.7,
      maximumBitrateRatio: 1.3,
    });
    expect(evaluateAverageVideoBitrate(centered, evidence.value)).toMatchObject({
      state: 'VERDICT', verdict: 'PASS',
      measurements: {
        videoSamplePayloadBytes: evidence.value.videoSamplePayloadBytes,
        videoPresentationSpanUs: evidence.value.presentationSpanUs,
        videoAverageBitrateBps: measuredBps,
      },
    });
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

function averageBitrateOutcome(decision: TranscodeDecision): OracleOutcome {
  if (decision.state === 'VERDICT') {
    return { ...decision, oracle: 'average-bitrate' };
  }
  if (decision.state === 'UNAVAILABLE') {
    return { ...decision, oracle: 'average-bitrate' };
  }
  return { ...decision, oracle: 'average-bitrate' };
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
  const data = bitDepth <= 8
    ? new Uint8Array(values)
    : new Uint16Array(values.map((value) => Math.round(value * (2 ** bitDepth - 1) / 255)));
  return { ptsUs, durationUs: 33_333, width, height, bitDepth, data };
}

/**
 * Independent presentation math for a signal-only BT.2020 retag. This deliberately does not import the
 * product or transform-reference matrices: it uses the published D65 linear BT.2020→BT.709 matrix, the
 * BT.2020-10/BT.709 inverse OETF, then the sRGB OETF required by neutral `copyTo(RGBA)` readback.
 */
function normalizedSrgbAfterRawBt2020Retag(
  rgb: readonly [number, number, number],
): [number, number, number] {
  const matrix = [
    [1.660491002108434, -0.58764113878855, -0.072849863319884],
    [-0.124550474521591, 1.13289989712596, -0.008349422604369],
    [-0.018150763354905, -0.100578898008007, 1.11872966136291],
  ] as const;
  const alpha = 1.09929682680944;
  const beta = 0.018053968510807;
  const inverseBt2020 = (encoded: number): number =>
    encoded < 4.5 * beta
      ? encoded / 4.5
      : ((encoded + (alpha - 1)) / alpha) ** (1 / 0.45);
  const srgbOetf = (linear: number): number => {
    const value = Math.max(0, Math.min(1, linear));
    return value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
  };
  const [red, green, blue] = rgb.map((value) => inverseBt2020(value / 255)) as [
    number,
    number,
    number,
  ];
  return matrix.map((row) => Math.round(srgbOetf(
    row[0] * red + row[1] * green + row[2] * blue,
  ) * 255)) as [number, number, number];
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

function omittedAacProgram(options: {
  dropAudio?: boolean;
  shiftAllAudioUs?: number;
  shiftMiddleAudioUs?: number;
  alterPayload?: boolean;
} = {}): RemuxProgramEvidence {
  const sample = (
    payload: readonly number[],
    ptsUs: number,
    durationUs: number,
    keyframe?: boolean,
  ): RemuxTrackEvidence['samples'][number] => ({
    payload: Uint8Array.from(payload), ptsUs, durationUs, framing: 'raw',
    ...(keyframe === undefined ? {} : { keyframe }),
  });
  const video: RemuxTrackEvidence = {
    id: 'video', type: 'video', codec: 'h264', timescale: 1_000_000,
    samples: [sample([0x65], 0, 1_000, true), sample([0x41], 1_000, 1_000, false)],
  };
  const shift = options.shiftAllAudioUs ?? 0;
  const audio: RemuxTrackEvidence = {
    id: 'audio', type: 'audio', codec: 'aac', timescale: 1_000_000,
    samples: [
      sample([1, 2], -100 + shift, 700),
      sample([3, options.alterPayload ? 9 : 4], 600 + shift + (options.shiftMiddleAudioUs ?? 0), 700),
      sample([5], 1_300 + shift, 700),
    ],
  };
  return {
    schema: 'media-test/remux-program@1',
    container: 'mp4',
    byteLength: 100,
    durationUs: 2_000,
    tracks: options.dropAudio ? [video] : [video, audio],
    representation: {},
  };
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
