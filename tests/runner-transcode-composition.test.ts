import { afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type {
  BrowserName,
  CapabilitySet,
  MediaBytes,
  MediaEngine,
  NormalizedMetadata,
} from '../src/core/engine.ts';
import type { CodecSupport } from '../src/core/feature-detect.ts';
import { getScenario, registerScenarios } from '../src/core/registry.ts';
import { runOne, type PixelBehaviorEvidence } from '../src/core/runner.ts';
import { defineScenario } from '../src/core/scenario.ts';
import { TRANSCODE_ROUNDTRIP_CONTRACT } from '../src/features/transcode/index.ts';
import { transcodeScenarios } from '../src/scenarios/transcode/index.ts';

const originalFetch = globalThis.fetch;
const browser: BrowserName = 'chromium';
const pixelPass: PixelBehaviorEvidence = {
  state: 'SUPPORTED',
  reasonCode: 'PIXEL_RGBA_ROUNDTRIP_OK',
  detail: 'test behavior passed',
};
const support: CodecSupport = {
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
};

beforeAll(() => {
  if (getScenario(TRANSCODE_ROUNDTRIP_CONTRACT.leg1ScenarioId)) return;
  registerScenarios(transcodeScenarios.filter((scenario) =>
    scenario.id === TRANSCODE_ROUNDTRIP_CONTRACT.leg1ScenarioId ||
    scenario.id === TRANSCODE_ROUNDTRIP_CONTRACT.leg2ScenarioId));
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function installInput(bytes: Uint8Array): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/fixtures/manifest.json')) return new Response(null, { status: 404 });
    if (init?.method === 'HEAD') return new Response(null, { status: 200 });
    if (url.includes('fixtures/golden/')) return new Response(null, { status: 404 });
    return new Response(bytes.slice(), { status: 200 });
  }) as typeof fetch;
}

function capabilities(): CapabilitySet {
  return {
    operations: { transcode: true },
    containersIn: ['mp4', 'webm'],
    containersOut: ['mp4', 'webm'],
    videoCodecs: ['h264', 'vp9'],
    audioCodecs: ['aac', 'opus'],
    encryption: [],
    features: ['webcodecs:independent'],
  };
}

function composedScenario() {
  return defineScenario({
    id: 'transcode/runner-composed-byte-binding',
    op: 'transcode',
    input: 'h264_1080p_30s.mp4',
    requires: {
      operations: ['transcode'],
      containersIn: ['mp4'],
      containersOut: ['mp4'],
      videoCodecs: ['h264'],
      audioCodecs: ['aac'],
    },
    options: {
      container: 'mp4',
      video: { codec: 'h264' },
      audio: { codec: 'aac' },
      invariant: 'transcode-roundtrip-composed',
    },
    oracles: ['property-invariant'],
    metrics: [],
  });
}

function fakeEngine(input: {
  supports?: MediaEngine['supports'];
  onTranscode: (scenarioId: string, bytes: Uint8Array) => MediaBytes;
}): MediaEngine {
  const metadata: NormalizedMetadata = { container: 'mp4', durationSec: 1, tracks: [] };
  return {
    id: 'transcode-composition-fake@1.0.0',
    capabilities,
    ...(input.supports ? { supports: input.supports } : { supports: async () => ({ supported: true }) }),
    probe: async () => metadata,
    demux: async () => ({ metadata, packets: [] }),
    remux: async () => media([1], 'mp4'),
    transcode: async (source, _options, context) => input.onTranscode(
      context?.request.scenarioId ?? '<missing>',
      new Uint8Array(await source.arrayBuffer()),
    ),
    decodeFrames: async () => ({ frames: [] }),
    seek: async () => ({
      landedPtsUs: 0,
      frame: { index: 0, ptsUs: 0, sha256: '00'.repeat(32) },
    }),
    trim: async () => media([1], 'mp4'),
  };
}

describe('REQ-FEAT-23 production composed transcode boundary', () => {
  test('leg two consumes leg one exact bytes and persisted provenance retains the original reference', async () => {
    installInput(new Uint8Array([1, 2, 3, 4]));
    const calls: Array<{ scenarioId: string; bytes: number[] }> = [];
    const supportRequests: string[] = [];
    const engine = fakeEngine({
      supports: async (request) => {
        supportRequests.push(request.scenarioId);
        return { supported: true };
      },
      onTranscode: (scenarioId, source) => {
        calls.push({ scenarioId, bytes: [...source] });
        return scenarioId === TRANSCODE_ROUNDTRIP_CONTRACT.leg1ScenarioId
          ? media([...source, 9], 'webm')
          : media([...source, 7], 'mp4');
      },
    });

    const result = await runOne(engine, composedScenario(), browser, support, {
      pillar: 'functional',
      pixelBehavior: pixelPass,
    });

    expect(result.status).toBe('PASS');
    expect(calls).toEqual([
      { scenarioId: TRANSCODE_ROUNDTRIP_CONTRACT.leg1ScenarioId, bytes: [1, 2, 3, 4] },
      { scenarioId: TRANSCODE_ROUNDTRIP_CONTRACT.leg2ScenarioId, bytes: [1, 2, 3, 4, 9] },
    ]);
    expect(supportRequests).toContain(TRANSCODE_ROUNDTRIP_CONTRACT.leg1ScenarioId);
    expect(supportRequests).toContain(TRANSCODE_ROUNDTRIP_CONTRACT.leg2ScenarioId);
    expect(result.oracleOutcomes).toContainEqual(expect.objectContaining({
      state: 'VERDICT',
      oracle: 'property-invariant',
      verdict: 'PASS',
      reasonCode: 'TRANSCODE_ROUNDTRIP_COMPOSED',
      evidence: {
        transcodeRoundTrip: expect.objectContaining({
          schema: 'media-test/transcode-composition@1',
          leg1OutputBytes: 5,
          finalOutputBytes: 6,
        }),
      },
    }));
    const evidence = result.oracleOutcomes[0]?.evidence?.transcodeRoundTrip as Record<string, unknown>;
    expect(evidence.leg2ConsumedSha256).toBe(evidence.leg1OutputSha256);
    expect(evidence.finalReferenceSha256).toBe(evidence.originalSourceSha256);
  });

  test('a nested unsupported leg is NA_ENGINE and never executes as FAIL or ERROR', async () => {
    installInput(new Uint8Array([5, 6, 7, 8]));
    const calls: string[] = [];
    const engine = fakeEngine({
      supports: async (request) => request.scenarioId === TRANSCODE_ROUNDTRIP_CONTRACT.leg2ScenarioId
        ? {
            supported: false,
            status: 'NA_ENGINE',
            reasonCode: 'FAKE_VP9_TO_H264_UNSUPPORTED',
            reason: 'nested tuple is unsupported',
          }
        : { supported: true },
      onTranscode: (scenarioId, source) => {
        calls.push(scenarioId);
        return media([...source, 9], 'webm');
      },
    });

    const result = await runOne(engine, composedScenario(), browser, support, {
      pillar: 'functional',
      pixelBehavior: pixelPass,
    });

    expect(result.status).toBe('NA_ENGINE');
    expect(result.reason).toContain('FAKE_VP9_TO_H264_UNSUPPORTED');
    expect(calls).toEqual([TRANSCODE_ROUNDTRIP_CONTRACT.leg1ScenarioId]);
  });
});

function media(values: readonly number[], container: 'mp4' | 'webm'): MediaBytes {
  return {
    bytes: new Uint8Array(values),
    mime: container === 'mp4' ? 'video/mp4' : 'video/webm',
    container,
  };
}
