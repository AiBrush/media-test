import { describe, expect, test } from 'bun:test';

import {
  BoundedStreamingSink,
  STREAMING_RUNTIME_EVIDENCE_SCHEMA,
  assessStreamingRuntime,
  evaluateStreamingCorrectness,
  readStreamingRuntimeEvidence,
  recognizeStreamingScenarioContract,
  streamingError,
  streamingRuntimeToCoreDisposition,
  streamingUnavailable,
  streamingVerdict,
  type SinkTrace,
} from '../src/features/streaming-output/index.ts';
import { streamingOutputScenarios } from '../src/scenarios/streaming-output/index.ts';

const pass = streamingVerdict('PASS', 'LAYER_PASS', 'independently proven valid');
// A valid alternate representation is a PASS that still records its representation-difference reasonCode.
const diff = streamingVerdict('PASS', 'LEGAL_REPRESENTATION_DIFF', 'valid alternate representation');
const fail = streamingVerdict('FAIL', 'PROVEN_MEDIA_FAILURE', 'independently proven wrong');
const browserUnavailable = streamingUnavailable('NA_BROWSER', 'MSE_MIME_UNSUPPORTED', 'browser has no matching SourceBuffer');
const assetUnavailable = streamingUnavailable('NA_ASSET', 'GOLDEN_EVIDENCE_MISSING', 'semantic golden is absent');
const harnessError = streamingError('HARNESS_CHECK_ERROR', 'check could not execute');

describe('streaming runtime bridge semantic-first reduction', () => {
  test('FAIL survives unavailable evidence, while required missing layers block DIFF/PASS', () => {
    expect(evaluateStreamingCorrectness({
      applicability: pass,
      sinkTrace: fail,
      containerValidity: browserUnavailable,
      mediaSemantics: harnessError,
    })).toMatchObject({ status: 'FAIL', reasonCode: 'PROVEN_MEDIA_FAILURE' });

    expect(evaluateStreamingCorrectness({
      applicability: pass,
      sinkTrace: assetUnavailable,
      containerValidity: diff,
      mediaSemantics: browserUnavailable,
    })).toMatchObject({ status: 'NA_BROWSER', reasonCode: 'MSE_MIME_UNSUPPORTED' });

    expect(evaluateStreamingCorrectness({
      applicability: pass,
      sinkTrace: browserUnavailable,
      containerValidity: harnessError,
      mediaSemantics: pass,
    })).toMatchObject({ status: 'ERROR', reasonCode: 'HARNESS_CHECK_ERROR' });

    expect(evaluateStreamingCorrectness({
      applicability: pass,
      sinkTrace: pass,
      containerValidity: diff,
      mediaSemantics: pass,
    })).toMatchObject({
      status: 'PASS',
      reasonCode: 'STREAMING_CORRECTNESS_VALID',
      // The representation difference is still recorded in the owning layer.
      layers: { 'container-validity': { reasonCode: 'LEGAL_REPRESENTATION_DIFF' } },
    });
  });

  test('only applicability NA_ENGINE short-circuits; downstream NA_ENGINE is invalid', () => {
    expect(evaluateStreamingCorrectness({
      applicability: streamingUnavailable('NA_ENGINE', 'UNSUPPORTED_OUTPUT_MODE', 'tuple rejected'),
      sinkTrace: fail,
      containerValidity: fail,
      mediaSemantics: fail,
    })).toMatchObject({ status: 'NA_ENGINE', reasonCode: 'UNSUPPORTED_OUTPUT_MODE' });

    expect(evaluateStreamingCorrectness({
      applicability: pass,
      sinkTrace: streamingUnavailable('NA_ENGINE', 'OBSERVER_UNSUPPORTED', 'misrouted capability miss'),
      containerValidity: browserUnavailable,
      mediaSemantics: assetUnavailable,
    })).toMatchObject({ status: 'ERROR', reasonCode: 'STREAMING_DOWNSTREAM_NA_ENGINE_INVALID' });

    expect(evaluateStreamingCorrectness({
      applicability: streamingUnavailable('NA_BROWSER', 'BROWSER_MISROUTED', 'not an applicability status'),
      sinkTrace: fail,
      containerValidity: fail,
      mediaSemantics: fail,
    })).toMatchObject({ status: 'ERROR', reasonCode: 'STREAMING_APPLICABILITY_UNAVAILABLE_STATUS_INVALID' });
  });
});

describe('streaming scenario/evidence recognition', () => {
  test('recognizes authored output contracts without claiming unrelated scenarios', () => {
    expect(recognizeStreamingScenarioContract({
      id: 'remux/plain', family: 'remux', op: 'remux', options: { container: 'mp4' },
    })).toEqual({ matched: false });

    expect(recognizeStreamingScenarioContract({
      id: 'streaming-output/mp4_fragmented_cmaf',
      family: 'streaming-output',
      op: 'remux',
      options: { container: 'mp4', target: 'buffer', fragmented: true },
      metrics: ['wall'],
      requires: { features: ['fragmented'] },
    })).toMatchObject({
      matched: true,
      state: 'OK',
      contract: {
        cmaf: true,
        containerValidator: 'fragmented-mp4',
        requiresBrowserAppend: true,
        output: { representation: 'fragmented-mp4' },
      },
    });

    expect(recognizeStreamingScenarioContract({
      id: 'streaming-output/stream_massive_h264_mp4',
      family: 'streaming-output',
      op: 'remux',
      options: { container: 'mp4', target: 'stream', fragmented: false, fastStart: false },
      metrics: ['wall'],
      requires: { features: ['target:writes'] },
    })).toMatchObject({
      matched: true,
      state: 'OK',
      contract: { requiresResolvedRepresentation: true, output: { representation: 'progressive-mp4' } },
    });

    expect(recognizeStreamingScenarioContract({
      id: 'streaming-output/not_remux',
      family: 'streaming-output',
      op: 'transcode',
      options: { container: 'mp4' },
    })).toMatchObject({ matched: true, state: 'ERROR', decision: { reasonCode: 'STREAMING_SCENARIO_CONTRACT_INVALID' } });

    for (const scenario of streamingOutputScenarios) {
      expect(recognizeStreamingScenarioContract(scenario)).toMatchObject({ matched: true, state: 'OK' });
    }
  });

  test('accepts real traces/envelopes and never invents one from scalar counters', async () => {
    const trace = await bufferTrace();
    expect(readStreamingRuntimeEvidence(trace)).toMatchObject({
      state: 'OK', source: 'direct-sink-trace', evidence: { sinkTrace: trace },
    });
    expect(readStreamingRuntimeEvidence({ sinkTrace: trace })).toMatchObject({
      state: 'OK', source: 'output-sink-trace', evidence: { sinkTrace: trace },
    });
    expect(readStreamingRuntimeEvidence({ targetWrites: 1, firstByteMs: 3, telemetry: { writeCount: 1 } })).toMatchObject({
      state: 'ABSENT', reasonCode: 'STREAMING_RUNTIME_EVIDENCE_ABSENT',
    });
    expect(readStreamingRuntimeEvidence({ sinkTrace: { schema: 'media-test/sink-trace@1', events: [] } })).toMatchObject({
      state: 'INVALID', reasonCode: 'STREAMING_SINK_TRACE_SHAPE_INVALID',
    });
    expect(readStreamingRuntimeEvidence({
      schema: STREAMING_RUNTIME_EVIDENCE_SCHEMA,
      sinkTrace: trace,
      resolvedRepresentation: 'progressive-mp4',
      observerPolicy: 'runner-owned-write-observer-v1',
      retainedOutputPolicy: 'bounded-prefix-tail-hash',
      measurementContract: 'streaming-output-v1',
    })).toMatchObject({
      state: 'OK',
      source: 'direct-envelope',
      evidence: { resolvedRepresentation: 'progressive-mp4' },
    });
  });
});

describe('production streaming runtime hook', () => {
  test('centralizes sink, external container, semantic, and core disposition evidence', async () => {
    const trace = await bufferTrace();
    const assessment = await assessStreamingRuntime({
      scenario: progressiveScenario(),
      output: {
        bytes: new Uint8Array([0, 0, 0, 8, 0x66, 0x74, 0x79, 0x70]),
        mime: 'video/mp4',
        container: 'mp4',
        streamingEvidence: { schema: STREAMING_RUNTIME_EVIDENCE_SCHEMA, sinkTrace: trace },
      },
      applicability: pass,
      containerValidity: pass,
      mediaSemantics: diff,
    });
    expect(assessment).toMatchObject({
      handled: true,
      state: 'ASSESSED',
      // The correctness cell is a PASS; the representation difference is recorded in its layer.
      result: {
        status: 'PASS',
        reasonCode: 'STREAMING_CORRECTNESS_VALID',
        layers: { 'media-semantics': { reasonCode: 'LEGAL_REPRESENTATION_DIFF' } },
      },
      evidence: { state: 'OK', source: 'output-envelope' },
      checks: { sinkTrace: [{ verdict: 'PASS' }], containerValidity: [{ verdict: 'PASS' }] },
    });
    const disposition = streamingRuntimeToCoreDisposition(assessment, 'reference-reimport');
    expect(disposition).toMatchObject({
      kind: 'ORACLE_OUTCOME',
      outcome: { state: 'VERDICT', verdict: 'PASS', reasonCode: 'STREAMING_CORRECTNESS_VALID' },
    });
  });

  test('a malformed fragmented container remains FAIL when MSE is unavailable', async () => {
    const assessment = await assessStreamingRuntime({
      scenario: {
        id: 'streaming-output/mp4_fragmented_cmaf',
        family: 'streaming-output',
        op: 'remux',
        options: { container: 'mp4', target: 'buffer', fragmented: true },
        metrics: ['wall'],
        requires: { features: ['fragmented'] },
      },
      output: {
        bytes: new Uint8Array([1, 2, 3, 4]),
        mime: 'video/mp4',
        container: 'mp4',
        streamingEvidence: { schema: STREAMING_RUNTIME_EVIDENCE_SCHEMA, sinkTrace: await bufferTrace() },
      },
      applicability: pass,
      mediaSemantics: assetUnavailable,
      browserAppend: browserUnavailable,
    });
    expect(assessment).toMatchObject({
      handled: true,
      state: 'ASSESSED',
      result: { status: 'FAIL', reasonCode: 'FMP4_INPUT_INCOMPLETE' },
      checks: {
        containerValidity: [
          { state: 'VERDICT', verdict: 'FAIL', reasonCode: 'FMP4_INPUT_INCOMPLETE' },
          { state: 'UNAVAILABLE', status: 'NA_BROWSER' },
        ],
      },
    });
  });

  test('typed applicability remains outside the oracle channel', async () => {
    const assessment = await assessStreamingRuntime({
      scenario: progressiveScenario(),
      applicability: streamingUnavailable('NA_ENGINE', 'UNSUPPORTED_OUTPUT_MODE', 'buffer path unavailable'),
    });
    expect(streamingRuntimeToCoreDisposition(assessment, 'reference-reimport')).toEqual({
      kind: 'NOT_APPLICABLE',
      status: 'NA_ENGINE',
      reasonCode: 'UNSUPPORTED_OUTPUT_MODE',
      detail: expect.any(String),
    });
  });
});

function progressiveScenario(): Record<string, unknown> {
  return {
    id: 'streaming-output/mp4_buffer_target',
    family: 'streaming-output',
    op: 'remux',
    options: { container: 'mp4', target: 'buffer', fastStart: false },
    metrics: ['wall'],
    requires: { features: ['fastStart:none'] },
  };
}

async function bufferTrace(): Promise<SinkTrace> {
  let now = 1;
  const sink = new BoundedStreamingSink({ target: 'buffer', operationStartMs: 0, now: () => now });
  await sink.write(new Uint8Array([1, 2, 3, 4]));
  now = 5;
  return sink.finalize();
}
