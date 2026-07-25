import { describe, expect, test } from 'bun:test';

import { robustnessScenarios } from '../src/scenarios/robustness/index.ts';
import { emptyGoldenStore, runOracle } from '../src/core/oracles.ts';
import type { MediaEngine, MediaInput, NormalizedMetadata } from '../src/core/engine.ts';
import { runTerminableWorker } from '../src/core/runner.ts';
import {
  ROBUSTNESS_WORKER_PROTOCOL,
  type RobustnessWorkerRequest,
  type RobustnessWorkerResponse,
} from '../src/core/robustness-worker-protocol.ts';
import {
  decideRobustnessDisposition,
  defineRobustnessContract,
  robustnessContractFromOptions,
  validateRobustnessReturnedValue,
  type RobustnessOperationDisposition,
  type RobustnessOperationEvidence,
} from '../src/scenarios/robustness/contracts.ts';

function evidence(disposition: RobustnessOperationDisposition): RobustnessOperationEvidence {
  return {
    schema: 'media-test/robustness-operation@1',
    disposition,
    stage: disposition === 'harness-error' ? 'cleanup' : 'operation',
  };
}

function memoryInput(id: string, bytes = new Uint8Array([1])): MediaInput {
  const tight = bytes.slice();
  return {
    id,
    url: `memory://${id}`,
    mime: id.endsWith('.webm') ? 'video/webm' : 'video/mp4',
    sizeBytes: tight.byteLength,
    async arrayBuffer() { return tight.slice().buffer as ArrayBuffer; },
    async blob() { return new Blob([tight.slice().buffer]); },
  };
}

function probeMeta(container: string, durationSec: number): NormalizedMetadata {
  return {
    container,
    durationSec,
    tracks: [{ type: 'video', codec: container === 'webm' ? 'vp8' : 'h264' }],
  };
}

describe('REQ-FEAT-77: structured disposition and survivor contracts', () => {
  const hardValid = defineRobustnessContract(
    'hard-valid',
    'packet-structure',
    ['golden-packets'],
    15_000,
  );
  const negative = defineRobustnessContract(
    'negative',
    'packet-structure',
    ['graceful-failure'],
    15_000,
  );
  const boundary = defineRobustnessContract(
    'boundary',
    'seek-clamp',
    ['graceful-failure'],
    15_000,
  );

  test('clean rejection passes only negative/boundary rows, never hard-valid media', () => {
    expect(decideRobustnessDisposition(negative, evidence('clean-reject'))).toEqual({
      status: 'PASS',
      needsSurvivorOracle: false,
      reasonCode: 'ROBUSTNESS_NEGATIVE_CLEAN_REJECT',
    });
    expect(decideRobustnessDisposition(boundary, evidence('clean-reject')).status).toBe('PASS');
    expect(decideRobustnessDisposition(hardValid, evidence('clean-reject'))).toEqual({
      status: 'FAIL',
      needsSurvivorOracle: false,
      reasonCode: 'ROBUSTNESS_VALID_INPUT_REJECTED',
    });
  });

  test('returned output never passes from presence alone', () => {
    expect(decideRobustnessDisposition(negative, evidence('returned-validatable-output'))).toEqual({
      needsSurvivorOracle: true,
      reasonCode: 'ROBUSTNESS_OUTPUT_REQUIRES_SURVIVOR',
    });
  });

  test('safe partials require inspectable structure; empty and garbage partials fail', async () => {
    expect(validateRobustnessReturnedValue(negative, {
      demux: {
        metadata: { container: 'mp4', durationSec: 1, tracks: [] },
        packets: [{ trackIndex: 0, size: 4, ptsUs: 0, keyframe: true }],
      },
    }).state).toBe('PASS');
    expect(validateRobustnessReturnedValue(negative, {
      demux: {
        metadata: { container: 'mp4', durationSec: null, tracks: [] },
        packets: [],
      },
    })).toMatchObject({ state: 'FAIL', reasonCode: 'ROBUSTNESS_PACKET_PARTIAL_EMPTY' });

    const mediaContract = defineRobustnessContract(
      'negative',
      'media-structure',
      ['graceful-failure'],
      15_000,
    );
    expect(validateRobustnessReturnedValue(mediaContract, {
      output: {
        bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
        container: 'mp4',
        mime: 'video/mp4',
      },
    }).state).toBe('FAIL');
    const realBytes = new Uint8Array(
      await Bun.file('fixtures/media/tiny_h264_360p_2s.mp4').arrayBuffer(),
    );
    expect(validateRobustnessReturnedValue(mediaContract, {
      output: { bytes: realBytes, container: 'mp4', mime: 'video/mp4' },
    }).state).toBe('PASS');
    const pcmBytes = new Uint8Array(
      await Bun.file('fixtures/media/wav_s24.wav').arrayBuffer(),
    );
    expect(validateRobustnessReturnedValue(mediaContract, {
      output: { bytes: pcmBytes, container: 'wav', mime: 'audio/wav' },
    })).toMatchObject({
      state: 'PASS',
      reasonCode: 'ROBUSTNESS_MEDIA_PARTIAL_STRUCTURAL',
    });
  });

  test('a returned boundary seek must land on the declared first/last timestamp', () => {
    const packets = [
      { trackIndex: 0, size: 4, ptsUs: 1_000, keyframe: true },
      { trackIndex: 0, size: 4, ptsUs: 9_000, keyframe: false },
      { trackIndex: 1, size: 4, ptsUs: -2_000, keyframe: true },
      { trackIndex: 1, size: 4, ptsUs: 12_000, keyframe: true },
    ];
    const goldenMetadata = {
      container: 'mp4',
      durationSec: 0.01,
      tracks: [
        { type: 'video' as const, codec: 'h264' },
        { type: 'audio' as const, codec: 'aac' },
      ],
    };
    expect(validateRobustnessReturnedValue(boundary, { seek: { landedPtsUs: 1_000 } }, {
      seekPolicy: 'first-frame-or-clean-reject',
      goldenPackets: packets,
      goldenMetadata,
    }).state).toBe('PASS');
    expect(validateRobustnessReturnedValue(boundary, { seek: { landedPtsUs: 9_000 } }, {
      seekPolicy: 'last-frame-or-clean-reject',
      goldenPackets: packets,
      goldenMetadata,
    }).state).toBe('PASS');
    expect(validateRobustnessReturnedValue(boundary, { seek: { landedPtsUs: 12_000 } }, {
      seekPolicy: 'last-frame-or-clean-reject',
      goldenPackets: packets,
      goldenMetadata,
    })).toMatchObject({ state: 'FAIL', reasonCode: 'ROBUSTNESS_SEEK_CLAMP_INVALID' });
  });

  test.each([
    ['not-applicable', 'NA_ENGINE', 'ROBUSTNESS_NOT_APPLICABLE'],
    ['browser-unavailable', 'NA_BROWSER', 'ROBUSTNESS_BROWSER_UNAVAILABLE'],
    ['timeout', 'FAIL', 'ROBUSTNESS_TIMEOUT'],
    ['worker-crash', 'FAIL', 'ROBUSTNESS_WORKER_CRASH'],
    ['resource-limit', 'FAIL', 'ROBUSTNESS_RESOURCE_LIMIT'],
    ['harness-error', 'ERROR', 'ROBUSTNESS_HARNESS_ERROR'],
  ] as const)('%s has an independent typed status', (disposition, status, reasonCode) => {
    expect(decideRobustnessDisposition(negative, evidence(disposition))).toEqual({
      status,
      needsSurvivorOracle: false,
      reasonCode,
    });
  });

  test('every registered robustness row declares a validated immutable execution contract', () => {
    expect(robustnessScenarios.length).toBeGreaterThan(0);
    for (const scenario of robustnessScenarios) {
      const contract = robustnessContractFromOptions(scenario.options);
      expect(contract, scenario.id).toBeDefined();
      expect(Object.isFrozen(contract), scenario.id).toBe(true);
      expect(Object.isFrozen(contract?.survivorOracles), scenario.id).toBe(true);
      expect(contract?.timeoutMs, scenario.id).toBe(scenario.timeoutMs);
    }
  });
});

describe('REQ-FEAT-78: production Worker isolation and resource evidence', () => {
  test('the real robustness worker measures and enforces its memory ceiling', async () => {
    const scenario = robustnessScenarios.find((entry) => entry.id === 'robustness/edge_video_only_micro_probe');
    expect(scenario).toBeDefined();
    if (!scenario) return;
    const bytes = new Uint8Array(await Bun.file('fixtures/media/micro_h264_1frame.mp4').arrayBuffer());
    const sha256 = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
    const request: RobustnessWorkerRequest = {
      schema: ROBUSTNESS_WORKER_PROTOCOL,
      engineRegistryId: 'platform',
      scenarioId: scenario.id,
      browser: 'chromium',
      support: {
        webcodecs: false,
        videoDecode: {},
        videoEncode: {},
        audioDecode: {},
        audioEncode: {},
        alpha: false,
        strictRgbaPixels: false,
        strictGoldenRgba: false,
        strictSourceRgba: false,
        webgpu: false,
        measureMemory: false,
      },
      options: {
        pillar: 'robustness',
        env: {
          suiteVersion: 'feature-robustness-test',
          engineId: 'platform@worker-test',
          browser: 'chromium',
        },
        resolvedInputs: [{
          id: 'micro_h264_1frame.mp4',
          urlAssetPath: 'micro_h264_1frame.mp4',
          sha256,
          sizeBytes: bytes.byteLength,
          integrity: 'VERIFIED',
        }],
        verifiedContents: [{
          state: 'VERIFIED',
          identity: { logicalPath: 'micro_h264_1frame.mp4', sha256, sizeBytes: bytes.byteLength },
          bytes,
          actualSha256: sha256,
          actualSizeBytes: bytes.byteLength,
        }],
        pixelBehavior: {
          state: 'UNSUPPORTED',
          reasonCode: 'PIXEL_API_UNAVAILABLE',
          detail: 'probe-only production Worker test does not require pixel behavior',
        },
        resourceLimits: { memoryDeltaBytes: 1, sampleIntervalMs: 1 },
      },
    };
    const response = await runTerminableWorker<RobustnessWorkerRequest, RobustnessWorkerResponse>(
      () => new Worker(new URL('../src/core/robustness-cell.worker.ts', import.meta.url), { type: 'module' }),
      request,
      { timeoutMs: 30_000 },
    );
    expect(response.state).toBe('RESULT');
    if (response.state !== 'RESULT') return;
    expect(response.result.status).toBe('FAIL');
    expect(response.result.operationEvidence).toMatchObject({
      disposition: 'resource-limit',
      stage: 'cleanup',
      resource: { kind: 'memory', limit: 1, unit: 'bytes' },
    });
    expect(response.result.operationEvidence?.resource?.observed).toBeGreaterThan(1);
    expect(response.result.oracleOutcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        state: 'VERDICT',
        verdict: 'FAIL',
        reasonCode: 'ROBUSTNESS_RESOURCE_LIMIT',
      }),
    ]));
    expect(response.result.reason).toContain('ROBUSTNESS_RESOURCE_LIMIT');
  }, 30_000);

  test('one real correctness execution records wall/peak memory and explicit Worker longtask unavailability', async () => {
    const scenario = robustnessScenarios.find((entry) =>
      entry.id === 'robustness/prop_duration_consistent_across_containers');
    expect(scenario).toBeDefined();
    if (!scenario) return;
    const ids = ['realworld_mdn_flower.mp4', 'realworld_mdn_flower.webm'] as const;
    const contents = await Promise.all(ids.map(async (id) => {
      const bytes = new Uint8Array(await Bun.file(`fixtures/media/${id}`).arrayBuffer());
      const sha256 = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
      return { id, bytes, sha256 };
    }));
    const request: RobustnessWorkerRequest = {
      schema: ROBUSTNESS_WORKER_PROTOCOL,
      engineRegistryId: 'mediabunny',
      scenarioId: scenario.id,
      browser: 'chromium',
      support: {
        webcodecs: false,
        videoDecode: {},
        videoEncode: {},
        audioDecode: {},
        audioEncode: {},
        alpha: false,
        strictRgbaPixels: false,
        strictGoldenRgba: false,
        strictSourceRgba: false,
        webgpu: false,
        measureMemory: false,
      },
      options: {
        pillar: 'robustness',
        env: {
          suiteVersion: 'feature-robustness-test',
          engineId: 'mediabunny@1.48.0',
          browser: 'chromium',
        },
        resolvedInputs: contents.map(({ id, bytes, sha256 }) => ({
          id,
          urlAssetPath: id,
          sha256,
          sizeBytes: bytes.byteLength,
          integrity: 'VERIFIED' as const,
        })),
        verifiedContents: contents.map(({ id, bytes, sha256 }) => ({
          state: 'VERIFIED' as const,
          identity: { logicalPath: id, sha256, sizeBytes: bytes.byteLength },
          bytes,
          actualSha256: sha256,
          actualSizeBytes: bytes.byteLength,
        })),
        pixelBehavior: {
          state: 'UNSUPPORTED',
          reasonCode: 'PIXEL_API_UNAVAILABLE',
          detail: 'probe-only production Worker test does not require pixel behavior',
        },
        resourceLimits: { memoryDeltaBytes: 1024 * 1024 * 1024, sampleIntervalMs: 1 },
      },
    };
    const response = await runTerminableWorker<RobustnessWorkerRequest, RobustnessWorkerResponse>(
      () => new Worker(new URL('../src/core/robustness-cell.worker.ts', import.meta.url), { type: 'module' }),
      request,
      { timeoutMs: 30_000 },
    );
    expect(response.state).toBe('RESULT');
    if (response.state !== 'RESULT') return;
    expect(['PASS']).toContain(response.result.status);
    expect(response.result.measurement).toMatchObject({
      state: 'AVAILABLE', metrics: expect.arrayContaining(['wall', 'peakMemory']),
    });
    expect(response.result.bench?.wall).toMatchObject({
      n: 1,
      warmup: 0,
      samples: [expect.any(Number)],
      protocolEvidence: {
        correctnessExecutions: 1,
        benchmarkLoop: false,
        robustnessResources: {
          schema: 'media-test/robustness-resources@1',
          wallTime: { state: 'AVAILABLE', source: 'worker-performance-clock' },
          memory: { state: 'AVAILABLE', source: 'bun-process-rss' },
          longtasks: {
            state: 'UNAVAILABLE',
            status: 'NA_BROWSER',
            reasonCode: 'ROBUSTNESS_LONGTASK_WORKER_SCOPE_UNAVAILABLE',
          },
        },
      },
    });
    expect(response.result.bench?.peakMemory?.n).toBe(1);
  }, 30_000);
});

describe('REQ-FEAT-79: labels are literal executable rows', () => {
  const byId = new Map(robustnessScenarios.map((scenario) => [scenario.id, scenario]));

  test('still-image probes and moving-video negatives are separate', () => {
    for (const format of ['jpeg', 'png', 'webp']) {
      const positive = byId.get(`robustness/image_${format}_probe`);
      const negative = byId.get(`robustness/image_${format}_decode_video_negative`);
      expect(positive?.op).toBe('probe');
      expect(positive?.oracles).toEqual(['golden-metadata']);
      expect(negative?.op).toBe('decodeFrames');
      expect(negative?.oracles).toEqual(['graceful-failure']);
      expect(robustnessContractFromOptions(negative?.options)?.inputClass).toBe('negative');
    }
  });

  test('the TS PTS-wraparound row really demuxes and forms a packet verdict', () => {
    const scenario = byId.get('robustness/edge_ts_pts_wraparound_demux');
    expect(scenario?.op).toBe('demux');
    expect(scenario?.oracles).toEqual(['golden-packets']);
    expect(scenario?.tolerances?.fpsTolerance).toBeUndefined();
  });

  test('cross-container duration compares matched renditions of one program', () => {
    const scenario = byId.get('robustness/prop_duration_consistent_across_containers');
    expect(scenario?.input).toEqual([
      'realworld_mdn_flower.mp4',
      'realworld_mdn_flower.webm',
    ]);
    expect(scenario?.requires.containersIn).toEqual(['mp4', 'webm']);
  });

  test('double-remux declares the required second-leg composition capability', () => {
    const scenario = byId.get('robustness/prop_double_remux_stable');
    expect(scenario?.options).toMatchObject({
      invariant: 'remux(remux(x))==remux(x)',
    });
    expect(scenario?.requires.features).toContain('remux:compose');
  });

  test('cross-container duration fails when only the measured matched rendition differs', async () => {
    const scenario = byId.get('robustness/prop_duration_consistent_across_containers')!;
    const mp4 = memoryInput('matched.mp4');
    const webm = memoryInput('matched.webm');
    const outcome = await runOracle('property-invariant', {
      scenario,
      input: mp4,
      inputs: [mp4, webm],
      metadata: probeMeta('mp4', 10),
      probeMetadatas: [
        { input: mp4, metadata: probeMeta('mp4', 10), golden: emptyGoldenStore() },
        { input: webm, metadata: probeMeta('webm', 15), golden: emptyGoldenStore() },
      ],
      golden: emptyGoldenStore(),
      decodeWithPlatform: async () => ({ frames: [] }),
      playbackSmoke: async () => true,
    });
    expect(outcome).toMatchObject({ state: 'VERDICT', verdict: 'FAIL' });
    expect(outcome.detail).toContain('direct');
  });

  test('double-remux fails when only the second leg is structurally corrupted', async () => {
    const scenario = byId.get('robustness/prop_double_remux_stable')!;
    const firstBytes = new Uint8Array(
      await Bun.file('fixtures/media/tiny_h264_360p_2s.mp4').arrayBuffer(),
    );
    let calls = 0;
    const engine = {
      id: 'mutation-engine@1',
      capabilities: () => ({ operations: {} }),
      async remux() {
        calls += 1;
        return {
          bytes: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]),
          container: 'mp4',
          mime: 'video/mp4',
        };
      },
    } as unknown as MediaEngine;
    const input = memoryInput('source.mp4', firstBytes);
    const outcome = await runOracle('property-invariant', {
      scenario,
      input,
      engine,
      output: { bytes: firstBytes, container: 'mp4', mime: 'video/mp4' },
      golden: emptyGoldenStore(),
      decodeWithPlatform: async () => ({ frames: [] }),
      playbackSmoke: async () => true,
    });
    expect(calls).toBe(1);
    expect(outcome).toMatchObject({ state: 'VERDICT', verdict: 'FAIL' });
    expect(outcome.detail).toContain('second remux');
  });

  test('out-of-range seek rows carry an explicit landing-or-reject policy', () => {
    expect(byId.get('robustness/edge_seek_negative')?.options).toMatchObject({
      seekPolicy: 'first-frame-or-clean-reject',
    });
    expect(byId.get('robustness/edge_seek_past_eof')?.options).toMatchObject({
      seekPolicy: 'last-frame-or-clean-reject',
    });
  });

  test('CBCS boundary decrypt identifies its retained cleartext twin', () => {
    expect(byId.get('robustness/edge_cbcs_boundary_decrypt')?.options).toMatchObject({
      scheme: 'cenc-cbcs',
      cleartextAsset: 'cenc_ctr_clear.mp4',
      clearReferenceTimeline: 'protected-source',
    });
  });
});
