import { describe, expect, test } from 'bun:test';

import type { MediaBytes } from '../src/core/engine.ts';
import type { OracleOutcome } from '../src/core/scenario.ts';
import { sha256Hex } from '../src/core/seeded-rng.ts';
import {
  TRANSCODE_AUDIO_CONTENT_INVARIANT,
  TRANSCODE_EFFECT_INVARIANT,
  TRANSCODE_ROUNDTRIP_CONTRACT,
  TRANSCODE_ROUNDTRIP_INVARIANT,
  admitTranscodeRuntimeMetrics,
  applyTranscodeTransform,
  defineTranscodeMetricAdmissionContract,
  evaluateTranscodeRuntimeInvariant,
  executeTranscodeRoundTripRuntime,
  isTranscodeRuntimeInvariant,
  makeTranscodeRateEvidence,
  readTranscodeRuntimeInvariant,
  transcodeDecisionToLayerOutcome,
  transcodeError,
  transcodeMetricRuntimeEvidenceFromOracleOutcomes,
  transcodeTransformContractForScenario,
  transcodeUnavailable,
  transcodeVerdict,
  type DecodedAudioSignal,
  type TranscodeDecision,
  type TranscodePixelFrame,
} from '../src/features/transcode/index.ts';

describe('transcode production runtime bridge', () => {
  test('maps PASS/DIFF/FAIL, unavailable, and error decisions without collapsing channels', () => {
    const decisions: readonly [TranscodeDecision, string, string | undefined][] = [
      [transcodeVerdict('PASS', 'PASS_REASON', 'pass', { score: 1 }), 'VERDICT', 'PASS'],
      // A representation difference is a PASS under the binary model; its reasonCode is preserved.
      [transcodeVerdict('PASS', 'REPRESENTATION_DIFF_REASON', 'representation difference'), 'VERDICT', 'PASS'],
      [transcodeVerdict('FAIL', 'FAIL_REASON', 'fail'), 'VERDICT', 'FAIL'],
      [transcodeUnavailable('NA_BROWSER', 'BROWSER_REASON', 'unavailable'), 'UNAVAILABLE', 'NA_BROWSER'],
      [transcodeError('ERROR_REASON', 'error'), 'ERROR', undefined],
    ];

    for (const [decision, state, discriminator] of decisions) {
      const outcome = transcodeDecisionToLayerOutcome('property-invariant', decision);
      expect(outcome.layer).toBe('property-invariant');
      expect(outcome.state).toBe(state);
      if (outcome.state === 'VERDICT') expect(outcome.verdict).toBe(discriminator);
      if (outcome.state === 'UNAVAILABLE') expect(outcome.status).toBe(discriminator);
      expect(outcome.reasonCode).toBe(decision.reasonCode);
      expect(Object.isFrozen(outcome)).toBe(true);
      if (outcome.measurements) expect(Object.isFrozen(outcome.measurements)).toBe(true);
    }
  });

  test('recognizes only the exact three family invariant tokens', () => {
    for (const token of [
      TRANSCODE_EFFECT_INVARIANT,
      TRANSCODE_AUDIO_CONTENT_INVARIANT,
      TRANSCODE_ROUNDTRIP_INVARIANT,
    ]) {
      expect(isTranscodeRuntimeInvariant(token)).toBe(true);
      expect(readTranscodeRuntimeInvariant({ invariant: token })).toBe(token);
    }
    for (const value of [
      'TRANSCODE-EFFECT-AWARE',
      ' transcode-effect-aware',
      'transcode-effect-aware ',
      'transcode-effect',
      'transcode-output-metadata',
      null,
      1,
    ]) {
      expect(isTranscodeRuntimeInvariant(value), String(value)).toBe(false);
      expect(readTranscodeRuntimeInvariant({ invariant: value }), String(value)).toBeUndefined();
    }
    expect(readTranscodeRuntimeInvariant('transcode-effect-aware')).toBeUndefined();
  });

  test('dispatches effect and audio requests through their registered contracts', () => {
    const transformContract = transcodeTransformContractForScenario('transcode/h264_rotate_180');
    if (!transformContract) throw new Error('missing focused transform contract');
    const source = pixelFrame([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 0, 255,
    ]);
    const candidate = applyTranscodeTransform(source, transformContract);
    expect(evaluateTranscodeRuntimeInvariant({
      invariant: TRANSCODE_EFFECT_INVARIANT,
      scenarioId: 'transcode/h264_rotate_180',
      sourceFrames: [source],
      candidateFrames: [candidate],
      signal: { rotationDegrees: 0 },
    })).toMatchObject({ state: 'VERDICT', verdict: 'PASS', reasonCode: 'TRANSCODE_TRANSFORM_EFFECT_MATCH' });

    const audio = audioSignal([0.2, -0.3, 0.8, -0.6]);
    expect(evaluateTranscodeRuntimeInvariant({
      invariant: TRANSCODE_AUDIO_CONTENT_INVARIANT,
      scenarioId: 'transcode/wav_to_flac',
      source: audio,
      candidate: audio,
    })).toMatchObject({ state: 'VERDICT', verdict: 'PASS', reasonCode: 'TRANSCODE_AUDIO_LOSSLESS_MATCH' });

    expect(evaluateTranscodeRuntimeInvariant({
      invariant: TRANSCODE_EFFECT_INVARIANT,
      scenarioId: 'transcode/not-registered',
      sourceFrames: [source],
      candidateFrames: [source],
      signal: {},
    })).toMatchObject({ state: 'ERROR', reasonCode: 'TRANSCODE_TRANSFORM_CONTRACT_NOT_REGISTERED' });
  });

  test('two-leg runtime orchestration proves exact input binding and immutable provenance', async () => {
    const consumed = new Map<string, Uint8Array>();
    const result = await executeTranscodeRoundTripRuntime({
      original: media([1, 2, 3], 'mp4'),
      execute: async (scenarioId, input) => {
        const bytes = input.materialize();
        consumed.set(scenarioId, bytes);
        return {
          consumedInputSha256: sha256Hex(bytes),
          output: scenarioId === TRANSCODE_ROUNDTRIP_CONTRACT.leg1ScenarioId
            ? media([...bytes, 9], 'webm')
            : media([...bytes, 7], 'mp4'),
        };
      },
    });

    expect(result.state).toBe('OK');
    if (result.state !== 'OK') return;
    expect(consumed.get(TRANSCODE_ROUNDTRIP_CONTRACT.leg2ScenarioId))
      .toEqual(new Uint8Array([1, 2, 3, 9]));
    expect(result.evidence.leg2ConsumedSha256).toBe(result.evidence.leg1OutputSha256);
    expect(result.evidence.finalReferenceSha256).toBe(result.evidence.originalSourceSha256);
    expect(result.outcome).toMatchObject({
      layer: 'property-invariant',
      state: 'VERDICT',
      verdict: 'PASS',
      reasonCode: 'TRANSCODE_ROUNDTRIP_COMPOSED',
    });
  });

  test('two-leg runtime rejects a stale/fixed leg-two input digest as FAIL', async () => {
    const result = await executeTranscodeRoundTripRuntime({
      original: media([4, 5, 6], 'mp4'),
      execute: async (scenarioId, input) => ({
        consumedInputSha256: scenarioId === TRANSCODE_ROUNDTRIP_CONTRACT.leg2ScenarioId
          ? '0'.repeat(64)
          : input.sha256,
        output: media(
          [7, 8, 9],
          scenarioId === TRANSCODE_ROUNDTRIP_CONTRACT.leg1ScenarioId ? 'webm' : 'mp4',
        ),
      }),
    });
    expect(result).toMatchObject({
      state: 'BLOCKED',
      outcome: {
        state: 'VERDICT',
        verdict: 'FAIL',
        reasonCode: 'TRANSCODE_ROUNDTRIP_OUTPUT_BINDING_MISMATCH',
      },
    });
  });

  test('converts typed oracle evidence into honest metric inputs and admits a representation difference', () => {
    const outcomes: OracleOutcome[] = [
      {
        oracle: 'ssim-psnr',
        state: 'VERDICT',
        verdict: 'PASS',
        reasonCode: 'ORACLE_REPRESENTATION_DIFF',
        detail: 'alternate legal representation',
        measurements: { ssimMean: 0.98, ssimMin: 0.91 },
      },
      {
        oracle: 'playback-smoke',
        state: 'VERDICT',
        verdict: 'PASS',
        reasonCode: 'ORACLE_MATCH',
        measurements: { decodedFrames: 60 },
      },
    ];
    const converted = transcodeMetricRuntimeEvidenceFromOracleOutcomes(outcomes);
    expect(converted.oracleEvidence).toHaveLength(2);
    expect(converted.measurements.ssimScore).toBe(0.98);
    expect(converted.measurements['ssim-psnr.ssimMean']).toBe(0.98);
    expect(Object.isFrozen(converted.oracleEvidence)).toBe(true);
    expect(Object.isFrozen(converted.measurements)).toBe(true);

    const contract = defineTranscodeMetricAdmissionContract({
      mandatoryOracles: ['ssim-psnr', 'playback-smoke'],
      allowedDiffs: [{ oracle: 'ssim-psnr', reasonCodes: ['ORACLE_REPRESENTATION_DIFF'] }],
      thresholds: [{
        id: 'ssim-gate', measurement: 'ssimScore', mode: 'gating', comparator: 'at-least', value: 0.97,
      }],
    });
    const rate = makeTranscodeRateEvidence({
      metric: 'framesPerSec',
      numerator: {
        name: 'output presentation frames', value: 60, unit: 'frame', source: 'neutral-output-sample-table',
      },
      denominator: {
        name: 'measured operation wall', value: 2, unit: 'second', source: 'monotonic-operation-window',
      },
      associatedVerdict: 'PASS',
    });
    expect(admitTranscodeRuntimeMetrics({ contract, outcomes, rates: [rate] }))
      .toMatchObject({ state: 'ADMITTED', associatedVerdict: 'PASS', rates: [{ value: 30 }] });
  });

  test('metric bridge preserves FAIL, unavailable, and ERROR instead of publishing rates', () => {
    const contract = defineTranscodeMetricAdmissionContract({
      mandatoryOracles: ['ssim-psnr'], allowedDiffs: [], thresholds: [],
    });
    const rows: readonly [OracleOutcome, string, string | undefined][] = [
      [{
        oracle: 'ssim-psnr', state: 'VERDICT', verdict: 'FAIL',
        reasonCode: 'QUALITY_FAIL', detail: 'wrong pixels',
      }, 'VERDICT', 'FAIL'],
      [{
        oracle: 'ssim-psnr', state: 'UNAVAILABLE', status: 'NA_BROWSER',
        reasonCode: 'REFERENCE_UNAVAILABLE', detail: 'unsupported reference decoder',
      }, 'UNAVAILABLE', 'NA_BROWSER'],
      [{
        oracle: 'ssim-psnr', state: 'ERROR',
        reasonCode: 'ORACLE_BUG', detail: 'harness failure',
      }, 'ERROR', undefined],
    ];
    for (const [outcome, state, discriminator] of rows) {
      const admission = admitTranscodeRuntimeMetrics({ contract, outcomes: [outcome], rates: [] });
      expect(admission.state).toBe('BLOCKED');
      if (admission.state !== 'BLOCKED') continue;
      expect(admission.decision.state).toBe(state);
      if (admission.decision.state === 'VERDICT') expect(admission.decision.verdict).toBe(discriminator);
      if (admission.decision.state === 'UNAVAILABLE') expect(admission.decision.status).toBe(discriminator);
    }
  });

  test('committed-golden SSIM conversion uses its typed minimum-frame gate statistic', () => {
    const converted = transcodeMetricRuntimeEvidenceFromOracleOutcomes([{
      oracle: 'ssim-psnr',
      state: 'VERDICT',
      verdict: 'PASS',
      reasonCode: 'ORACLE_MATCH',
      measurements: { exactFrames: 2, ssimMean: 0.99, ssimMin: 0.975 },
    }]);
    expect(converted.measurements.ssimScore).toBe(0.975);
  });

  test('metric evidence conversion and failure precedence are independent of outcome order', () => {
    const pass: OracleOutcome = {
      oracle: 'playback-smoke', state: 'VERDICT', verdict: 'PASS',
      reasonCode: 'PLAYBACK_OK', measurements: { shared: 1 },
    };
    const error: OracleOutcome = {
      oracle: 'ssim-psnr', state: 'ERROR', reasonCode: 'HARNESS_ERROR', detail: 'reader bug',
      measurements: { shared: 2, score: 0.9 },
    };
    const fail: OracleOutcome = {
      oracle: 'ssim-psnr', state: 'VERDICT', verdict: 'FAIL', reasonCode: 'PIXELS_WRONG',
      detail: 'wrong program', measurements: { shared: 3, score: 0.1 },
    };
    const forward = transcodeMetricRuntimeEvidenceFromOracleOutcomes([pass, error, fail]);
    const reverse = transcodeMetricRuntimeEvidenceFromOracleOutcomes([fail, error, pass]);
    expect(forward.measurements).toEqual(reverse.measurements);
    expect(forward.measurements.shared).toBeUndefined();
    expect(forward.measurements['ssim-psnr.score']).toBeUndefined();

    const contract = defineTranscodeMetricAdmissionContract({
      mandatoryOracles: ['playback-smoke'], allowedDiffs: [], thresholds: [],
    });
    for (const outcomes of [[pass, error, fail], [fail, error, pass]]) {
      expect(admitTranscodeRuntimeMetrics({ contract, outcomes, rates: [] }))
        .toMatchObject({
          state: 'BLOCKED',
          decision: { state: 'VERDICT', verdict: 'FAIL', reasonCode: 'PIXELS_WRONG' },
        });
    }
  });
});

function pixelFrame(values: readonly number[]): TranscodePixelFrame {
  return {
    ptsUs: 0,
    durationUs: 33_333,
    width: 2,
    height: 2,
    bitDepth: 8,
    data: new Uint8Array(values),
  };
}

function audioSignal(samples: readonly number[]): DecodedAudioSignal {
  return {
    sampleRate: 48_000,
    channels: 2,
    sampleFrames: samples.length / 2,
    samples: Float64Array.from(samples),
    timelineDomain: 'presentation',
    timeline: { kind: 'whole-program', presentationSampleFrames: samples.length / 2 },
  };
}

function media(values: readonly number[], container: string): MediaBytes {
  return {
    bytes: new Uint8Array(values),
    mime: container === 'webm' ? 'video/webm' : 'video/mp4',
    container,
  };
}
