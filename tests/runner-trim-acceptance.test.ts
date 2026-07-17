import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import type {
  CapabilitySet,
  ConcreteOperationRequest,
  FrameSink,
  MediaBytes,
  MediaEngine,
  MediaInput,
  NormalizedMetadata,
} from '../src/core/engine.ts';
import type { ActiveFixtureRuntime } from '../src/core/fixture-integrity.ts';
import type { CodecSupport } from '../src/core/feature-detect.ts';
import { registerEngine, registerScenario } from '../src/core/registry.ts';
// Bun treats a query-bearing import as a distinct module instance. Keep the runner's
// module-local fixture manifest cache private to this fetch-stubbing acceptance harness.
// @ts-ignore -- TypeScript does not resolve Bun's query-bearing module specifiers.
import { runMatrix, runOne, type PixelBehaviorEvidence } from '../src/core/runner.ts?trim-acceptance';
import { defineScenario, type Scenario } from '../src/core/scenario.ts';
import {
  TRIM_AUDIO_CONTENT_INVARIANT,
  TRIM_FEATURE_PROPERTIES_INVARIANT,
  TRIM_NOOP_IDENTITY_INVARIANT,
} from '../src/features/trim/index.ts';

const originalFetch = globalThis.fetch;
const originalVideoEncoder = Object.getOwnPropertyDescriptor(globalThis, 'VideoEncoder');

const pixelPass: PixelBehaviorEvidence = {
  state: 'SUPPORTED',
  reasonCode: 'PIXEL_RGBA_ROUNDTRIP_OK',
  detail: 'trim acceptance supplies deterministic normalized evidence',
};

const codecSupport: CodecSupport = {
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

const assets = new Map<string, Uint8Array>();
const metadata = new Map<string, NormalizedMetadata>();
for (const id of [
  'wav_s16_mono.wav',
  'micro_h264_1frame.mp4',
  'vp9_alpha.webm',
  'h264_rotated90.mp4',
  'h264_multitrack.mp4',
] as const) {
  assets.set(id, Uint8Array.from(readFileSync(new URL(`../fixtures/media/${id}`, import.meta.url))));
  metadata.set(id, JSON.parse(readFileSync(
    new URL(`../fixtures/golden/${id}.meta.json`, import.meta.url),
    'utf8',
  )) as NormalizedMetadata);
}
const acceptanceManifestAssets = (JSON.parse(readFileSync(
  new URL('../fixtures/manifest.json', import.meta.url),
  'utf8',
)) as { assets: Array<Record<string, unknown> & { id: string }> }).assets
  .filter((entry) => assets.has(entry.id));

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalVideoEncoder) Object.defineProperty(globalThis, 'VideoEncoder', originalVideoEncoder);
  else Reflect.deleteProperty(globalThis, 'VideoEncoder');
});

describe('REQ-FEAT-26/28/29 production trim oracle routes', () => {
  test('runOne scores decoded WAV content and rejects a one-sample deletion', async () => {
    installFixtureFetch();
    const scenario = trimScenario({
      id: 'trim/acceptance-audio-content',
      input: 'wav_s16_mono.wav',
      container: 'wav',
      endUs: 10_000_000,
      invariant: TRIM_AUDIO_CONTENT_INVARIANT,
      audioCodec: 'pcm-s16',
    });

    const exact = await runOne(trimEngine(scenario), scenario, 'chromium', codecSupport, {
      pixelBehavior: pixelPass,
    });
    expect(exact.status).toBe('PASS');
    expect(exact.oracleOutcomes).toContainEqual(expect.objectContaining({
      state: 'VERDICT',
      oracle: 'property-invariant',
      verdict: 'PASS',
      reasonCode: 'TRIM_AUDIO_PROGRAM_CONTENT_MATCH',
    }));

    const deleted = await runOne(
      trimEngine(scenario, removeOneWavSample),
      scenario,
      'chromium',
      codecSupport,
      { pixelBehavior: pixelPass },
    );
    expect(deleted.status).toBe('FAIL');
    expect(deleted.oracleOutcomes).toContainEqual(expect.objectContaining({
      state: 'VERDICT',
      oracle: 'property-invariant',
      verdict: 'FAIL',
      reasonCode: 'TRIM_AUDIO_PROGRAM_CONTENT_MISMATCH',
    }));
  });

  test('runOne reaches every feature-labelled production branch', async () => {
    installFixtureFetch();
    const cases: Array<{ scenario: Scenario; decodeWithPlatform?: (media: MediaBytes) => Promise<FrameSink> }> = [
      {
        scenario: trimScenario({
          id: 'trim/vp9_alpha_keyframe_aligned', input: 'vp9_alpha.webm', container: 'webm',
          endUs: 1_000_000, invariant: TRIM_FEATURE_PROPERTIES_INVARIANT, videoCodec: 'vp9',
        }),
        decodeWithPlatform: async () => alphaSink(),
      },
      {
        scenario: trimScenario({
          id: 'trim/h264_rotated_keyframe_aligned', input: 'h264_rotated90.mp4', container: 'mp4',
          endUs: 1_000_000, invariant: TRIM_FEATURE_PROPERTIES_INVARIANT, videoCodec: 'h264',
        }),
        decodeWithPlatform: async () => digestSink(),
      },
      {
        scenario: trimScenario({
          id: 'trim/h264_multitrack_keyframe_aligned', input: 'h264_multitrack.mp4', container: 'mp4',
          endUs: 10_000_000, invariant: TRIM_FEATURE_PROPERTIES_INVARIANT,
          videoCodec: 'h264', audioCodec: 'aac',
        }),
      },
      {
        scenario: trimScenario({
          id: 'trim/h264_open_gop_frame_accurate', input: 'micro_h264_1frame.mp4', container: 'mp4',
          endUs: 1_000_000, invariant: TRIM_FEATURE_PROPERTIES_INVARIANT,
          videoCodec: 'h264', frameAccurate: true,
        }),
        decodeWithPlatform: async () => digestSink(),
      },
      {
        scenario: trimScenario({
          id: 'trim/h264_single_gop_frame_accurate', input: 'micro_h264_1frame.mp4', container: 'mp4',
          endUs: 1, invariant: TRIM_FEATURE_PROPERTIES_INVARIANT,
          videoCodec: 'h264', frameAccurate: true,
        }),
        decodeWithPlatform: async () => digestSink(),
      },
      {
        scenario: trimScenario({
          id: 'trim/h264_subframe_range_frame_accurate', input: 'micro_h264_1frame.mp4', container: 'mp4',
          endUs: 1, invariant: TRIM_FEATURE_PROPERTIES_INVARIANT,
          videoCodec: 'h264', frameAccurate: true,
        }),
        decodeWithPlatform: async () => digestSink(),
      },
    ];

    for (const entry of cases) {
      const result = await runOne(
        trimEngine(entry.scenario),
        entry.scenario,
        'chromium',
        codecSupport,
        {
          pixelBehavior: pixelPass,
          ...(entry.decodeWithPlatform ? { decodeWithPlatform: entry.decodeWithPlatform } : {}),
        },
      );
      expect(result.status, `${entry.scenario.id}: ${JSON.stringify(result.oracleOutcomes)}`).toBe('PASS');
      expect(result.oracleOutcomes).toContainEqual(expect.objectContaining({
        state: 'VERDICT',
        oracle: 'property-invariant',
        verdict: 'PASS',
        reasonCode: 'TRIM_FEATURE_PROPERTIES_PRESERVED',
      }));
    }
  }, 20_000);

  test('runOne no-op identity passes exact semantics and fails malformed/lost content', async () => {
    installFixtureFetch();
    const scenario = trimScenario({
      id: 'trim/h264_noop_full_duration',
      input: 'micro_h264_1frame.mp4',
      container: 'mp4',
      endUs: 1_000_000,
      invariant: TRIM_NOOP_IDENTITY_INVARIANT,
      videoCodec: 'h264',
    });
    const exact = await runOne(trimEngine(scenario), scenario, 'chromium', codecSupport, {
      pixelBehavior: pixelPass,
      decodeWithPlatform: async () => digestSink(),
    });
    expect(exact.status).toBe('PASS');
    expect(exact.oracleOutcomes).toContainEqual(expect.objectContaining({
      state: 'VERDICT',
      oracle: 'property-invariant',
      verdict: 'PASS',
      reasonCode: 'TRIM_NOOP_SEMANTIC_IDENTITY_MATCH',
    }));

    const truncated = await runOne(
      trimEngine(scenario, (bytes) => bytes.subarray(0, Math.max(1, bytes.byteLength - 32))),
      scenario,
      'chromium',
      codecSupport,
      { pixelBehavior: pixelPass, decodeWithPlatform: async () => digestSink() },
    );
    expect(truncated.status).toBe('FAIL');
    expect(truncated.oracleOutcomes[0]).toMatchObject({
      state: 'VERDICT',
      oracle: 'property-invariant',
      verdict: 'FAIL',
    });
  });
});

describe('REQ-FEAT-30 production runMatrix preflight', () => {
  test('copy executes codec-free while an exact missing frame encoder is NA_BROWSER', async () => {
    const engineId = 'trim-preflight-acceptance@1.0.0';
    const copyId = 'trim/acceptance-copy-no-browser-codec';
    const accurateId = 'trim/acceptance-frame-encoder-na';
    const copy = trimScenario({
      id: copyId, input: 'micro_h264_1frame.mp4', container: 'mp4', endUs: 1_000_000,
      videoCodec: 'h264', oracle: 'playback-smoke',
    });
    const accurate = trimScenario({
      id: accurateId, input: 'micro_h264_1frame.mp4', container: 'mp4', endUs: 1_000_000,
      videoCodec: 'h264', frameAccurate: true, oracle: 'playback-smoke',
    });
    let copyRuns = 0;
    let accurateRuns = 0;
    registerEngine(engineId, async () => matrixTrimEngine(engineId, copyId, accurateId, () => {
      copyRuns++;
    }, () => {
      accurateRuns++;
    }));
    registerScenario(copy);
    registerScenario(accurate);
    installFixtureFetch();
    const encoder = function FakeVideoEncoder(): void {};
    Object.defineProperty(encoder, 'isConfigSupported', {
      configurable: true,
      value: async (config: VideoEncoderConfig) => ({ supported: false, config }),
    });
    Object.defineProperty(globalThis, 'VideoEncoder', { configurable: true, writable: true, value: encoder });

    const results = await runMatrix({
      browser: 'chromium',
      engineIds: [engineId],
      scenarioIds: [copyId, accurateId],
      pillar: 'functional',
      rotateMedia: false,
      playbackSmoke: async () => true,
      fixtureIntegrityRuntime: fixtureRuntime,
    });
    expect(results.find((result) => result.scenarioId === copyId)?.status).toBe('PASS');
    const blocked = results.find((result) => result.scenarioId === accurateId);
    expect(blocked?.status).toBe('NA_BROWSER');
    expect(blocked?.reason).toContain('WEB_CODECS_CONFIG_UNSUPPORTED');
    expect(copyRuns).toBe(1);
    expect(accurateRuns).toBe(0);
  });
});

function trimScenario(input: {
  id: string;
  input: string;
  container: string;
  endUs: number;
  invariant?: string;
  videoCodec?: string;
  audioCodec?: string;
  frameAccurate?: boolean;
  oracle?: 'playback-smoke';
}): Scenario {
  return defineScenario({
    id: input.id,
    op: 'trim',
    input: input.input,
    requires: {
      operations: ['trim'],
      containersIn: [input.container],
      containersOut: [input.container],
      ...(input.videoCodec ? { videoCodecs: [input.videoCodec] } : {}),
      ...(input.audioCodec ? { audioCodecs: [input.audioCodec] } : {}),
      features: input.frameAccurate ? ['trim:frame-accurate'] : [],
    },
    options: {
      container: input.container,
      frameAccurate: input.frameAccurate === true,
      range: { startUs: 0, endUs: input.endUs },
      ...(input.invariant ? { invariant: input.invariant } : {}),
    },
    oracles: [input.oracle ?? 'property-invariant'],
    metrics: ['wall'],
  });
}

function trimEngine(scenario: Scenario, mutate?: (bytes: Uint8Array) => Uint8Array): MediaEngine {
  return {
    id: `trim-acceptance-${scenario.id.replaceAll('/', '-')}@1.0.0`,
    capabilities: () => capabilitiesFor(scenario),
    supports: async () => ({ supported: true }),
    trim: async (input) => {
      const bytes = new Uint8Array(await input.arrayBuffer());
      const output = mutate ? mutate(bytes) : bytes;
      const container = (scenario.options as { container: string }).container;
      return { bytes: Uint8Array.from(output), mime: input.mime, container };
    },
  } as MediaEngine;
}

function matrixTrimEngine(
  id: string,
  copyId: string,
  accurateId: string,
  onCopy: () => void,
  onAccurate: () => void,
): MediaEngine {
  const capabilities: CapabilitySet = {
    operations: { trim: true },
    containersIn: ['mp4'],
    containersOut: ['mp4'],
    videoCodecs: ['h264'],
    audioCodecs: [],
    encryption: [],
    features: ['webcodecs:independent', 'trim:keyframe-copy', 'trim:frame-accurate'],
  };
  return {
    id,
    capabilities: () => capabilities,
    supports: async (request: ConcreteOperationRequest) => {
      if (request.scenarioId !== accurateId || request.inputs[0]?.tracks.length === 0) {
        return { supported: true };
      }
      return {
        supported: true,
        browserConfigs: [{
          role: 'video-encoder',
          trackIndex: 0,
          config: { codec: 'avc1.42001e', width: 320, height: 240, bitrate: 500_000, framerate: 1 },
        }],
      };
    },
    trim: async (input: MediaInput, _range, _options, context) => {
      if (context?.request.scenarioId === copyId) onCopy();
      if (context?.request.scenarioId === accurateId) onAccurate();
      return {
        bytes: new Uint8Array(await input.arrayBuffer()),
        mime: input.mime,
        container: 'mp4',
      };
    },
  } as MediaEngine;
}

function capabilitiesFor(scenario: Scenario): CapabilitySet {
  return {
    operations: { trim: true },
    containersIn: [...(scenario.requires.containersIn ?? [])],
    containersOut: [...(scenario.requires.containersOut ?? [])],
    videoCodecs: [...(scenario.requires.videoCodecs ?? [])],
    audioCodecs: [...(scenario.requires.audioCodecs ?? [])],
    encryption: [],
    features: ['webcodecs:independent', ...(scenario.requires.features ?? [])],
  };
}

function digestSink(): FrameSink {
  return { frames: [{ index: 0, ptsUs: 0, sha256: '11'.repeat(32), width: 2, height: 1 }] };
}

function alphaSink(): FrameSink {
  return {
    ...digestSink(),
    getPixels: async () => ({
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([255, 0, 0, 0, 0, 255, 0, 255]),
    } as ImageData),
  };
}

function removeOneWavSample(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let blockAlign = 0;
  let dataHeader = -1;
  let dataSize = 0;
  while (offset + 8 <= bytes.byteLength) {
    const id = new TextDecoder().decode(bytes.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    if (id === 'fmt ' && size >= 16) blockAlign = view.getUint16(offset + 8 + 12, true);
    if (id === 'data') {
      dataHeader = offset;
      dataSize = size;
      break;
    }
    offset += 8 + size + (size & 1);
  }
  if (dataHeader < 0 || blockAlign <= 0 || dataSize < blockAlign) throw new Error('WAV fixture is invalid');
  const removeAt = dataHeader + 8 + dataSize - blockAlign;
  const out = new Uint8Array(bytes.byteLength - blockAlign);
  out.set(bytes.subarray(0, removeAt));
  out.set(bytes.subarray(removeAt + blockAlign), removeAt);
  const outView = new DataView(out.buffer);
  outView.setUint32(4, out.byteLength - 8, true);
  outView.setUint32(dataHeader + 4, dataSize - blockAlign, true);
  return out;
}

function installFixtureFetch(): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/fixtures/media/scenarios/_sources.ndjson')) {
      const rows = [
        'trim/acceptance-copy-no-browser-codec',
        'trim/acceptance-frame-encoder-na',
      ].map((scenarioId) => JSON.stringify({
        scenarioId,
        class: 'SYNTHETIC',
        requires: { container: 'mp4', video: true, videoCodecs: ['h264'], audioCodecs: [] },
        files: [],
      })).join('\n');
      return new Response(rows, { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
    }
    if (url.includes('/fixtures/manifest.json')) {
      return Response.json({
        suiteCorpusVersion: 'trim-acceptance-v1',
        assets: acceptanceManifestAssets,
      });
    }
    if (init?.method === 'HEAD') return new Response(null, { status: 200 });
    const mediaMatch = url.match(/\/fixtures\/media\/([^?#]+)/);
    if (mediaMatch) {
      const logical = decodeURIComponent(mediaMatch[1]!);
      const bytes = assets.get(logical) ?? assets.get(logical.split('/').at(-1) ?? '');
      return bytes ? new Response(Uint8Array.from(bytes), { status: 200 }) : new Response(null, { status: 404 });
    }
    const goldenMatch = url.match(/fixtures\/golden\/(.+)\.meta\.json(?:[?#]|$)/);
    if (goldenMatch) {
      const logical = decodeURIComponent(goldenMatch[1]!);
      const value = metadata.get(logical) ?? metadata.get(logical.split('/').at(-1) ?? '');
      return value ? Response.json(value) : new Response(null, { status: 404 });
    }
    return new Response(null, { status: 404 });
  }) as typeof fetch;
}

const fixtureRuntime = {
  resolveMedia: async () => ({
    state: 'out-of-scope',
    reasonCode: 'FIXTURE_ASSET_OUTSIDE_PUBLICATION_SCOPE',
    detail: 'trim acceptance uses committed local fixture bytes',
  }),
  loadGoldenEvidence: async () => undefined,
} as unknown as ActiveFixtureRuntime;
