import { afterEach, describe, expect, test } from 'bun:test';

import type {
  BrowserName,
  CapabilitySet,
  ConcreteWebCodecsConfig,
  MediaBytes,
  MediaEngine,
  MediaInput,
  NormalizedMetadata,
} from '../src/core/engine.ts';
import {
  AUTHENTICATED_RANGE_INPUT_FEATURE,
  AUTHENTICATED_RANGE_PROBE_FEATURE,
  createMalformedInputError,
  createNotApplicableError,
} from '../src/core/engine.ts';
import {
  buildExecutionFingerprint,
  EXECUTION_RESULT_SCHEMA,
  isBenchmarkEligible,
  isExecutionFingerprintReusable,
  ORACLE_MODEL_VERSION,
  aggregateExhaustive,
  buildExecutionOrder,
  reduceExhaustiveStatuses,
  runOne,
  runPixelBehaviorSelfTest,
  runRobustnessCellInWorker,
  runTerminableWorker,
} from '../src/core/runner.ts';
import type { ExecutionFingerprintComponents, PixelBehaviorEvidence } from '../src/core/runner.ts';
import { defineScenario } from '../src/core/scenario.ts';
import type { OracleOutcome, Scenario, ScenarioResult } from '../src/core/scenario.ts';
import {
  CorpusDeliveryIntegrityError,
  buildCandidateEvidencePlan,
  sha256Hex,
} from '../src/core/media-selection.ts';
import type {
  CandidateOracleEvidencePlan,
  ResolvedInput,
  ScenarioSelection,
  VerifiedContent,
  VerifiedStreamContent,
} from '../src/core/media-selection.ts';
import type { CodecSupport } from '../src/core/feature-detect.ts';
import { validateScenarioResultV2 } from '../src/core/result-schema.ts';
import {
  auditDisabledCells,
  disabledCellReason,
  reviewedDisabledCells,
  reviewedForcedTimeoutCells,
} from '../src/core/disabled-cells.ts';
import { RemotionMediaParserEngine } from '../src/engines/remotion-media-parser/adapter.ts';

const originalFetch = globalThis.fetch;
const changedGlobals = new Map<string, PropertyDescriptor | undefined>();

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [name, descriptor] of changedGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  changedGlobals.clear();
});

const browser: BrowserName = 'chromium';
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

const pixelPass: PixelBehaviorEvidence = {
  state: 'SUPPORTED',
  reasonCode: 'PIXEL_RGBA_ROUNDTRIP_OK',
  detail: 'test behavior passed',
};

function installCorpusFetch(options: { missingAsset?: boolean } = {}): { calls: string[] } {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    if (url.includes('/fixtures/manifest.json')) return new Response(null, { status: 404 });
    if (init?.method === 'HEAD') {
      return new Response(null, { status: options.missingAsset ? 404 : 200, statusText: options.missingAsset ? 'Not Found' : 'OK' });
    }
    if (url.includes('fixtures/golden/')) return new Response(null, { status: 404 });
    return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
  }) as typeof fetch;
  return { calls };
}

function setGlobal(name: string, value: unknown): void {
  if (!changedGlobals.has(name)) changedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

function caps(operation: keyof CapabilitySet['operations']): CapabilitySet {
  return {
    operations: { [operation]: true },
    containersIn: ['mp4'],
    containersOut: ['mp4'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    encryption: [],
    features: ['webcodecs:independent'],
  };
}

function bytes(): MediaBytes {
  return { bytes: new Uint8Array([0, 0, 0, 8, 102, 116, 121, 112]), mime: 'video/mp4', container: 'mp4' };
}

function baseEngine(
  operation: keyof CapabilitySet['operations'],
  overrides: Partial<MediaEngine> = {},
): MediaEngine {
  const metadata: NormalizedMetadata = { container: 'mp4', durationSec: 1, tracks: [] };
  return {
    id: 'runner-fake@1.0.0',
    capabilities: () => caps(operation),
    probe: async () => metadata,
    demux: async () => ({ packets: [], tracks: [], ordering: 'decode' }),
    remux: async () => bytes(),
    transcode: async () => bytes(),
    decodeFrames: async () => ({ frames: [] }),
    seek: async () => ({
      landedPtsUs: 0,
      frame: { index: 0, ptsUs: 0, sha256: '00'.repeat(32) },
    }),
    trim: async () => bytes(),
    ...overrides,
  };
}

function remuxScenario(id = 'remux/runner-test'): Scenario {
  return defineScenario({
    id,
    op: 'remux',
    input: 'input.mp4',
    requires: { operations: ['remux'], containersIn: ['mp4'], containersOut: ['mp4'] },
    options: { container: 'mp4' },
    oracles: ['playback-smoke'],
    metrics: [],
  });
}

function streamingScenario(target: 'buffer' | 'stream'): Scenario {
  return defineScenario({
    id: `streaming-output/runner-${target}-contract`,
    op: 'remux',
    input: 'input.mp4',
    requires: {
      operations: ['remux'],
      containersIn: ['mp4'],
      containersOut: ['mp4'],
      features: [target === 'stream' ? 'target:writes' : 'fastStart:none'],
    },
    options: { container: 'mp4', target, fastStart: false },
    oracles: ['playback-smoke', 'mp4-box-layout'],
    metrics: [],
  });
}

function streamingMp4Bytes(): MediaBytes {
  const box = (type: string): Uint8Array => {
    const out = new Uint8Array(8);
    new DataView(out.buffer).setUint32(0, 8);
    out.set([...type].map((char) => char.charCodeAt(0)), 4);
    return out;
  };
  const parts = [box('ftyp'), box('mdat'), box('moov')];
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return { bytes, mime: 'video/mp4', container: 'mp4' };
}

const probeBytes = new Uint8Array([1, 2, 3, 4]);
const probeSha256 = '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a';

function verifiedProbeInput(): { resolvedInputs: ResolvedInput[]; verifiedContents: VerifiedContent[] } {
  const resolvedInputs: ResolvedInput[] = [{
    id: 'input.mp4',
    urlAssetPath: 'input.mp4',
    sha256: probeSha256,
    sizeBytes: probeBytes.byteLength,
    integrity: 'VERIFIED',
  }];
  return {
    resolvedInputs,
    verifiedContents: [{
      state: 'VERIFIED',
      identity: { logicalPath: 'input.mp4', sha256: probeSha256, sizeBytes: probeBytes.byteLength },
      bytes: probeBytes,
      actualSha256: probeSha256,
      actualSizeBytes: probeBytes.byteLength,
    }],
  };
}

function streamVerifiedProbeInput(): {
  resolvedInputs: ResolvedInput[];
  verifiedStreamContents: VerifiedStreamContent[];
} {
  const resolvedInputs: ResolvedInput[] = [{
    id: 'input.mp4',
    urlAssetPath: 'input.mp4',
    sha256: probeSha256,
    sizeBytes: probeBytes.byteLength,
    integrity: 'VERIFIED',
  }];
  return {
    resolvedInputs,
    verifiedStreamContents: [{
      state: 'VERIFIED_STREAM',
      identity: { logicalPath: 'input.mp4', sha256: probeSha256, sizeBytes: probeBytes.byteLength },
      actualSha256: probeSha256,
      actualSizeBytes: probeBytes.byteLength,
      chunkSizeBytes: probeBytes.byteLength,
      chunkSha256: [probeSha256],
      retainedBytes: 0,
    }],
  };
}

const LARGE_AUTHENTICATED_INPUT_BYTES = 256 * 1024 * 1024 + 1;
const largeInputSha256 = 'ab'.repeat(32);

function streamVerifiedLargeInput(
  sizeBytes = LARGE_AUTHENTICATED_INPUT_BYTES,
): {
  resolvedInputs: ResolvedInput[];
  verifiedStreamContents: VerifiedStreamContent[];
} {
  const identity = {
    logicalPath: 'large-input.mp4',
    sha256: largeInputSha256,
    sizeBytes,
  };
  return {
    resolvedInputs: [{
      id: 'large-input.mp4',
      urlAssetPath: identity.logicalPath,
      sha256: identity.sha256,
      sizeBytes,
      integrity: 'VERIFIED',
    }],
    verifiedStreamContents: [{
      state: 'VERIFIED_STREAM',
      identity,
      actualSha256: identity.sha256,
      actualSizeBytes: sizeBytes,
      chunkSizeBytes: sizeBytes,
      chunkSha256: [identity.sha256],
      retainedBytes: 0,
    }],
  };
}

function boundedProbeScenario(id = 'probe/runner-budget'): Scenario {
  return defineScenario({
    id,
    op: 'probe',
    input: 'input.mp4',
    requires: { operations: ['probe'], containersIn: ['mp4'] },
    options: {
      robustness: {
        probe: {
          schema: 'media-test/probe-scenario-contract@1',
          probeBudget: {
            schema: 'media-test/probe-budget@1',
            scale: 'large',
            allowedReadModes: ['range'],
            maxBytesRead: 4,
            maxReadFraction: 1,
            maxPeakMemoryDeltaBytes: 100,
          },
        },
      },
    },
    oracles: ['golden-metadata'],
    metrics: [],
  });
}

function installProbeGoldenFetch(): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('blob:')) return originalFetch(input, init);
    if (url.endsWith('fixtures/golden/input.mp4.meta.json')) {
      return Response.json({ container: 'mp4', durationSec: 1, tracks: [] });
    }
    return new Response(null, { status: 404, statusText: 'Not Found' });
  }) as typeof fetch;
}

const probeMemoryOptions = {
  probeMemorySampler: {
    state: 'AVAILABLE' as const,
    value: { api: 'measureUserAgentSpecificMemory' as const, sample: async () => 100 },
  },
  probeMemoryWindowOptions: { sampleIntervalMs: 1, settleWindowMs: 0 },
};

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length < 2) return [[...items]];
  return items.flatMap((head, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((tail) => [head, ...tail]),
  );
}

describe('REQ-FEAT-80/86 production streaming runner boundary', () => {
  test('buffer observability is runner-timestamped and persisted as JSON-safe four-layer evidence', async () => {
    installCorpusFetch();
    const result = await runOne(
      baseEngine('remux', {
        capabilities: () => ({
          ...caps('remux'),
          features: ['webcodecs:independent', 'fastStart:none', 'target:writes'],
        }),
        remux: async () => streamingMp4Bytes(),
      }),
      streamingScenario('buffer'),
      browser,
      support,
      { pixelBehavior: pixelPass, playbackSmoke: async () => true },
    );

    expect(result.status).toBe('PASS');
    const combined = result.oracleOutcomes.find((outcome) => outcome.evidence?.streamingRuntime !== undefined);
    expect(combined).toMatchObject({
      state: 'VERDICT',
      verdict: 'PASS',
      reasonCode: 'STREAMING_CORRECTNESS_VALID',
      evidence: {
        streamingRuntime: {
          schema: 'media-test/streaming-runtime-result@1',
          state: 'ASSESSED',
          evidence: {
            state: 'OK',
            evidence: {
              observerPolicy: 'runner-owned-buffer-observer-v1',
              sinkTrace: { target: 'buffer' },
            },
          },
        },
      },
    });
    const serialized = JSON.stringify(combined?.evidence);
    expect(serialized).not.toContain('Uint8Array');
    expect(JSON.parse(serialized)).toBeObject();
  });

  test('a stream scalar counter cannot masquerade as a positioned write trace', async () => {
    installCorpusFetch();
    const output = streamingMp4Bytes();
    const result = await runOne(
      baseEngine('remux', {
        capabilities: () => ({
          ...caps('remux'),
          features: ['webcodecs:independent', 'fastStart:none', 'target:writes'],
        }),
        remux: async () => ({
          ...output,
          targetWrites: 1,
          firstByteMs: 0,
          telemetry: { bytesWritten: output.bytes.byteLength, writeCount: 1, firstByteMs: 0 },
        }),
      }),
      streamingScenario('stream'),
      browser,
      support,
      { pixelBehavior: pixelPass, playbackSmoke: async () => true },
    );

    expect(result.status).toBe('ERROR');
    expect(result.oracleOutcomes).toContainEqual(expect.objectContaining({
      state: 'ERROR',
      oracle: 'property-invariant',
      reasonCode: 'STREAMING_RUNTIME_EVIDENCE_ABSENT',
    }));
  });

  test('combined streaming evidence preserves the authored candidate-oracle sufficiency plan', async () => {
    installCorpusFetch();
    const sourceSha256 = '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a';
    const evidencePlan: CandidateOracleEvidencePlan = {
      schemaVersion: 'candidate-oracle-evidence@1',
      sourceSha256,
      requirements: [
        {
          oracle: 'mp4-box-layout',
          role: 'REQUIRED',
          needs: [{ kind: 'STRUCTURAL_OUTPUT' }],
        },
        {
          oracle: 'playback-smoke',
          role: 'REQUIRED',
          needs: [{ kind: 'BROWSER_CAPABILITY' }],
        },
      ],
      requiredOracles: ['mp4-box-layout', 'playback-smoke'],
      sufficientOracleSets: [['mp4-box-layout', 'playback-smoke']],
      declaredAvailable: ['BROWSER_CAPABILITY', 'STRUCTURAL_OUTPUT'],
      contractDigest: '66'.repeat(32),
    };
    const result = await runOne(
      baseEngine('remux', {
        capabilities: () => ({
          ...caps('remux'),
          features: ['webcodecs:independent', 'fastStart:none', 'target:writes'],
        }),
        remux: async () => streamingMp4Bytes(),
      }),
      streamingScenario('buffer'),
      browser,
      support,
      {
        pixelBehavior: pixelPass,
        playbackSmoke: async () => true,
        selectionEvidencePlan: evidencePlan,
      },
    );

    expect(result.status).toBe('PASS');
    expect(result.oracleOutcomes).toEqual([
      expect.objectContaining({
        state: 'VERDICT',
        oracle: 'property-invariant',
        verdict: 'PASS',
        reasonCode: 'STREAMING_CORRECTNESS_VALID',
      }),
    ]);
    expect(result.candidateEvidence).toMatchObject({
      status: 'PASS',
      applied: ['mp4-box-layout', 'playback-smoke'],
      sufficientSurvivorOracles: ['mp4-box-layout', 'playback-smoke'],
      sufficient: true,
    });
  });
});

describe('REQ-RUN-01/02/04 staged concrete applicability', () => {
  test('all coarse tokens true but a negative tuple returns NA_ENGINE before asset/oracle/bench', async () => {
    const fetchState = installCorpusFetch();
    let operations = 0;
    const engine = baseEngine('remux', {
      supports: async () => ({
        supported: false,
        status: 'NA_ENGINE',
        reasonCode: 'FAKE_CONTAINER_CODEC_CROSS_PRODUCT',
        reason: 'H.264 cannot be authored in this concrete target mode',
      }),
      remux: async () => {
        operations += 1;
        return bytes();
      },
    });
    const result = await runOne(engine, remuxScenario(), browser, support, {
      pillar: 'performance',
      pixelBehavior: pixelPass,
      playbackSmoke: async () => true,
    });
    expect(result.status).toBe('NA_ENGINE');
    expect(result.reason).toContain('FAKE_CONTAINER_CODEC_CROSS_PRODUCT');
    expect(operations).toBe(0);
    expect(fetchState.calls.some((call) => call.startsWith('HEAD '))).toBe(false);
    expect(result.oracleOutcomes).toEqual([]);
    expect(result.bench).toBeUndefined();
  });

  test('only typed malformed-input rejection passes a negative contract; programming errors remain ERROR', async () => {
    installCorpusFetch();
    const rejecting = baseEngine('remux', {
      supports: async () => ({ supported: true }),
      remux: async () => {
        throw createMalformedInputError(
          'runner-fake@1.0.0',
          'remux',
          'parse',
          'malformed input rejected',
          'TRUNCATED_MEDIA',
          'input.mp4',
        );
      },
    });
    const robustness = defineScenario({
      id: 'robustness/runner-malformed',
      op: 'remux',
      input: 'input.mp4',
      requires: { operations: ['remux'] },
      options: {
        container: 'mp4',
        robustness: {
          schema: 'media-test/robustness-contract@1',
          inputClass: 'negative',
          returnedOutputCheck: 'media-structure',
          survivorOracles: ['graceful-failure'],
          timeoutMs: 15_000,
        },
      },
      mutate: (value) => value,
      oracles: ['graceful-failure'],
      metrics: [],
    });
    const graceful = await runOne(rejecting, robustness, browser, support, { pixelBehavior: pixelPass });
    expect(graceful.status).toBe('PASS');
    expect(graceful.oracleOutcomes[0]).toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
    expect(graceful.operationEvidence).toMatchObject({
      disposition: 'clean-reject',
      stage: 'operation',
      nativeError: { name: 'MalformedInputError', code: 'TRUNCATED_MEDIA' },
    });

    const safePartialOrReject = defineScenario({
      ...robustness,
      id: 'remux/runner-safe-partial-or-reject',
      family: 'remux',
      options: {
        container: 'mp4',
        robustness: {
          schema: 'media-test/robustness-contract@1',
          inputClass: 'negative',
          returnedOutputCheck: 'media-structure',
          survivorOracles: ['graceful-failure', 'property-invariant'],
          timeoutMs: 15_000,
        },
      },
      oracles: ['graceful-failure', 'property-invariant'],
    });
    const conditionalPlan = buildCandidateEvidencePlan(
      safePartialOrReject,
      'ab'.repeat(32),
    );
    expect(conditionalPlan.requiredOracles).toEqual([]);
    expect(conditionalPlan.sufficientOracleSets).toEqual([
      ['graceful-failure'],
      ['property-invariant'],
    ]);
    const conditional = await runOne(
      baseEngine('remux', {
        supports: async () => ({ supported: true }),
        remux: rejecting.remux,
      }),
      safePartialOrReject,
      browser,
      support,
      {
        pixelBehavior: pixelPass,
        selectionEvidencePlan: conditionalPlan,
      },
    );
    expect(conditional.status).toBe('PASS');
    expect(conditional.candidateEvidence).toMatchObject({
      status: 'PASS',
      applied: ['graceful-failure'],
      unavailable: [{
        oracle: 'property-invariant',
        status: 'NA_ASSET',
        reasonCode: 'EVIDENCE_OUTCOME_MISSING',
      }],
      sufficientSurvivorOracles: ['graceful-failure'],
      sufficient: true,
    });

    const programmingFault = baseEngine('remux', {
      supports: async () => ({ supported: true }),
      remux: async () => {
        throw new TypeError('adapter accessed an undefined field');
      },
    });
    const unexpected = await runOne(programmingFault, robustness, browser, support, {
      pixelBehavior: pixelPass,
    });
    expect(unexpected.status).toBe('ERROR');
    expect(unexpected.operationEvidence).toMatchObject({
      disposition: 'harness-error',
      nativeError: { name: 'TypeError' },
    });

    const crashing = baseEngine('remux', {
      supports: async () => ({ supported: true }),
      remux: async () => {
        throw new Error('injected adapter crash');
      },
    });
    const crash = await runOne(crashing, remuxScenario('remux/runner-crash'), browser, support, {
      pixelBehavior: pixelPass,
      playbackSmoke: async () => true,
    });
    expect(crash.status).toBe('ERROR');
    expect(crash.reason).toContain('injected adapter crash');
  });

  test('exact false config wins over a missing asset; post-positive EncodingError remains ERROR', async () => {
    const exact: ConcreteWebCodecsConfig = {
      role: 'video-encoder',
      config: {
        codec: 'avc1.640034',
        width: 3840,
        height: 2160,
        bitrate: 22_000_000,
        framerate: 60,
        hardwareAcceleration: 'prefer-hardware',
      },
    };
    const encoder = function MockVideoEncoder(): void {};
    Object.defineProperty(encoder, 'isConfigSupported', {
      configurable: true,
      value: async () => ({ supported: false }),
    });
    setGlobal('VideoEncoder', encoder);
    installCorpusFetch({ missingAsset: true });
    let ran = 0;
    const unsupported = baseEngine('transcode', {
      supports: async () => ({ supported: true, browserConfigs: [exact] }),
      transcode: async () => {
        ran += 1;
        return bytes();
      },
    });
    const scenario = defineScenario({
      id: 'transcode/runner-exact-config',
      op: 'transcode',
      input: 'input.mp4',
      requires: { operations: ['transcode'] },
      options: { container: 'mp4', video: { codec: 'h264', width: 3840, height: 2160, bitrate: 22_000_000 } },
      oracles: ['playback-smoke'],
      metrics: [],
    });
    const blocked = await runOne(unsupported, scenario, browser, support, {
      pixelBehavior: pixelPass,
      playbackSmoke: async () => true,
    });
    expect(blocked.status).toBe('NA_BROWSER');
    expect(ran).toBe(0);
    expect(blocked.support?.browserConfigs[0]).toEqual(exact);

    Object.defineProperty(encoder, 'isConfigSupported', { configurable: true, value: async () => ({ supported: true }) });
    installCorpusFetch();
    const executionFailure = baseEngine('transcode', {
      supports: async () => ({ supported: true, browserConfigs: [exact] }),
      transcode: async () => {
        const error = new Error('encoder failed after configure');
        error.name = 'EncodingError';
        throw error;
      },
    });
    const failed = await runOne(executionFailure, scenario, browser, support, {
      pixelBehavior: pixelPass,
      playbackSmoke: async () => true,
    });
    expect(failed.status).toBe('ERROR');
    expect(failed.reason).toContain('encoder failed after configure');
  });

  test('selected bytes are size+SHA verified before operation and URL readers see the verified body', async () => {
    installCorpusFetch();
    let operations = 0;
    let observedUrl = '';
    let observedBytes: number[] = [];
    const engine = baseEngine('remux', {
      supports: async () => ({ supported: true }),
      remux: async (input) => {
        operations += 1;
        observedUrl = input.url;
        observedBytes = [...new Uint8Array(await input.arrayBuffer())];
        return bytes();
      },
    });
    const resolved = [{
      id: 'input.mp4',
      urlAssetPath: 'scenarios/remux/runner-test/01.mp4',
      sha256: '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a',
      sizeBytes: 4,
    }];
    const valid = await runOne(engine, remuxScenario(), browser, support, {
      pixelBehavior: pixelPass,
      playbackSmoke: async () => true,
      resolvedInputs: resolved,
    });
    expect(valid.status).toBe('PASS');
    expect(operations).toBe(1);
    expect(observedBytes).toEqual([1, 2, 3, 4]);
    expect(observedUrl.startsWith('blob:')).toBe(true);

    operations = 0;
    const tampered = await runOne(
      baseEngine('remux', {
        supports: async () => ({ supported: true }),
        remux: async () => {
          operations += 1;
          return bytes();
        },
      }),
      remuxScenario(),
      browser,
      support,
      {
        pixelBehavior: pixelPass,
        playbackSmoke: async () => true,
        resolvedInputs: [{ ...resolved[0]!, sha256: '00'.repeat(32) }],
      },
    );
    expect(tampered.status).toBe('NA_ASSET');
    expect(tampered.reason).toContain('CORPUS_DIGEST_MISMATCH');
    expect(operations).toBe(0);
  });

  test('validated decrypt-key overrides are the only key bytes visible to support and operation adapters', async () => {
    installCorpusFetch();
    const admitted = { keyHex: '11'.repeat(16), kid: '22'.repeat(16), ivHex: '33'.repeat(8) };
    let supportKey: unknown;
    let operationKey: unknown;
    const engine = baseEngine('decrypt', {
      supports: async (request) => {
        supportKey = (request.options as { key?: unknown }).key;
        return { supported: true };
      },
      decrypt: async (_input, key) => {
        operationKey = key;
        return bytes();
      },
    });
    const scenario = defineScenario({
      id: 'encryption/runner-key-boundary',
      op: 'decrypt',
      input: 'input.mp4',
      requires: { operations: ['decrypt'] },
      options: {
        scheme: 'cenc-ctr',
        key: {
          keyHex: 'aa'.repeat(16),
          kid: 'bb'.repeat(16),
          provenance: { schema: 'must-not-cross-adapter-boundary' },
        },
      },
      oracles: ['playback-smoke'],
      metrics: [],
    });
    const result = await runOne(engine, scenario, browser, support, {
      pixelBehavior: pixelPass,
      playbackSmoke: async () => true,
      decryptKeyOverride: admitted,
    });
    expect(result.status).toBe('PASS');
    expect(supportKey).toEqual(admitted);
    expect(operationKey).toEqual(admitted);
    expect((supportKey as Record<string, unknown>).provenance).toBeUndefined();
    expect((operationKey as Record<string, unknown>).provenance).toBeUndefined();
  });

  test('verified HLS execution seals the complete sidecar graph behind rebound object URLs', async () => {
    const encode = (value: string): Uint8Array => new TextEncoder().encode(value);
    const playlistBytes = encode([
      '#EXTM3U',
      '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"',
      '#EXT-X-MAP:URI="init.mp4"',
      '#EXTINF:1,',
      'segment.ts',
      '#EXT-X-ENDLIST',
      '',
    ].join('\n'));
    const resources = [
      { id: 'key.bin', path: 'hls/key.bin', role: 'key' as const, bytes: new Uint8Array(16).fill(0x11) },
      { id: 'init.mp4', path: 'hls/init.mp4', role: 'map' as const, bytes: encode('verified-init') },
      { id: 'segment.ts', path: 'hls/segment.ts', role: 'segment' as const, bytes: encode('verified-segment') },
    ];
    const root: ResolvedInput = {
      id: 'playlist.m3u8',
      urlAssetPath: 'hls/playlist.m3u8',
      sha256: sha256Hex(playlistBytes),
      sizeBytes: playlistBytes.byteLength,
      integrity: 'VERIFIED',
    };
    const sidecars: ResolvedInput[] = resources.map((resource) => ({
      id: resource.id,
      urlAssetPath: resource.path,
      sha256: sha256Hex(resource.bytes),
      sizeBytes: resource.bytes.byteLength,
      integrity: 'VERIFIED',
      transport: { kind: 'hls-resource', role: resource.role, sourceUri: resource.id },
    }));
    const resolvedInputs = [root, ...sidecars];
    const verifiedContents: VerifiedContent[] = [playlistBytes, ...resources.map((resource) => resource.bytes)]
      .map((value, index) => ({
        state: 'VERIFIED',
        identity: {
          logicalPath: resolvedInputs[index]!.urlAssetPath,
          sha256: resolvedInputs[index]!.sha256!,
          sizeBytes: value.byteLength,
        },
        bytes: value,
        actualSha256: resolvedInputs[index]!.sha256!,
        actualSizeBytes: value.byteLength,
      }));

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('blob:')) return originalFetch(input, init);
      return new Response(null, { status: 404, statusText: 'Not Found' });
    }) as typeof fetch;

    let operationInputs = 0;
    let reboundPlaylist = '';
    const observedSidecars: number[][] = [];
    const engine = baseEngine('decrypt', {
      supports: async (request) => {
        operationInputs = request.inputs.length;
        return { supported: true };
      },
      decrypt: async (input) => {
        reboundPlaylist = await (await fetch(input.url)).text();
        const urls = reboundPlaylist.match(/blob:[^"\r\n,]+/g) ?? [];
        for (const url of urls) observedSidecars.push([...new Uint8Array(await (await fetch(url)).arrayBuffer())]);
        return bytes();
      },
    });
    const scenario = defineScenario({
      id: 'encryption/runner-hls-closure',
      op: 'decrypt',
      input: 'playlist.m3u8',
      requires: { operations: ['decrypt'] },
      options: { scheme: 'hls-aes128', key: { keyHex: '11'.repeat(16) } },
      oracles: ['playback-smoke'],
      metrics: [],
    });
    const result = await runOne(engine, scenario, browser, support, {
      pixelBehavior: pixelPass,
      playbackSmoke: async () => true,
      resolvedInputs,
      verifiedContents,
      decryptKeyOverride: { keyHex: '11'.repeat(16) },
    });

    expect(result.status).toBe('PASS');
    expect(operationInputs).toBe(1);
    expect(reboundPlaylist).not.toContain('key.bin');
    expect(reboundPlaylist).not.toContain('init.mp4');
    expect(reboundPlaylist).not.toContain('segment.ts');
    expect(observedSidecars).toEqual(resources.map((resource) => [...resource.bytes]));
    expect(result.executionFingerprint).toBeDefined();
  });

  test('typed evidence sufficiency prevents a weak pass and preserves the full selection contract', async () => {
    installCorpusFetch();
    let operations = 0;
    const sourceSha256 = '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a';
    const evidencePlan: CandidateOracleEvidencePlan = {
      schemaVersion: 'candidate-oracle-evidence@1',
      sourceSha256,
      requirements: [
        {
          oracle: 'golden-metadata',
          role: 'REQUIRED',
          needs: [{ kind: 'SOURCE_GOLDEN', sourceSha256 }],
        },
        {
          oracle: 'playback-smoke',
          role: 'SUPPLEMENTAL',
          needs: [{ kind: 'BROWSER_CAPABILITY' }],
        },
      ],
      requiredOracles: ['golden-metadata'],
      sufficientOracleSets: [['golden-metadata']],
      declaredAvailable: ['BROWSER_CAPABILITY'],
      contractDigest: '44'.repeat(32),
    };
    const result = await runOne(
      baseEngine('remux', {
        supports: async () => ({ supported: true }),
        remux: async () => {
          operations += 1;
          return bytes();
        },
      }),
      remuxScenario('remux/typed-evidence'),
      browser,
      support,
      {
        pixelBehavior: pixelPass,
        playbackSmoke: async () => true,
        selectionEvidencePlan: evidencePlan,
        selection: {
          file: '01.mp4',
          sha256: sourceSha256,
          isBaked: false,
          candidateCount: 3,
          eligiblePoolDigest: '11'.repeat(32),
          executedInputDigest: '22'.repeat(32),
          candidateIdentity: '33'.repeat(32),
          selectionPolicyVersion: 'canonical-candidate@1',
          selectionAlgorithmId: 'candidate-identity-lexicographic-min-v1',
          evidenceContractDigest: evidencePlan.contractDigest,
          catalogState: 'ready',
        },
      },
    );
    expect(operations).toBe(1);
    expect(result.status).toBe('NA_ASSET');
    expect(result.reason).toContain('EVIDENCE_NO_SUFFICIENT_SET');
    expect(result.candidateEvidence).toMatchObject({
      schema: 'media-test/candidate-evidence-result@1',
      contractDigest: evidencePlan.contractDigest,
      status: 'NA_ASSET',
      required: ['golden-metadata'],
      applied: ['playback-smoke'],
      unavailable: [{
        oracle: 'golden-metadata',
        status: 'NA_ASSET',
        reasonCode: 'EVIDENCE_OUTCOME_MISSING',
      }],
      sufficientSurvivorOracles: [],
      sufficient: false,
    });
    expect(result.selection).toMatchObject({
      file: '01.mp4',
      eligiblePoolDigest: '11'.repeat(32),
      executedInputDigest: '22'.repeat(32),
      candidateIdentity: '33'.repeat(32),
      evidenceContractDigest: evidencePlan.contractDigest,
    });
    expect(result.bench).toBeUndefined();
  });
});

describe('REQ-FEAT-36/38 probe runtime contracts', () => {
  test('a whole-file-only engine is NA_ENGINE before supports, init, materialization, or operation', async () => {
    let fetches = 0;
    let supportsCalls = 0;
    let initCalls = 0;
    let probeCalls = 0;
    globalThis.fetch = (async () => {
      fetches += 1;
      return new Response(null, { status: 500 });
    }) as typeof fetch;
    const engine = baseEngine('probe', {
      capabilities: () => ({ ...caps('probe'), probeReadModes: ['whole-file'] }),
      supports: async () => {
        supportsCalls += 1;
        return { supported: true };
      },
      init: async () => { initCalls += 1; },
      probe: async () => {
        probeCalls += 1;
        return { container: 'mp4', durationSec: 1, tracks: [] };
      },
    });
    const result = await runOne(engine, boundedProbeScenario(), browser, support, {
      pixelBehavior: pixelPass,
      ...verifiedProbeInput(),
      ...probeMemoryOptions,
    });
    expect(result.status).toBe('NA_ENGINE');
    expect(result.reason).toContain('PROBE_BOUNDED_READ_MODE_UNAVAILABLE');
    expect({ fetches, supportsCalls, initCalls, probeCalls }).toEqual({
      fetches: 0,
      supportsCalls: 0,
      initCalls: 0,
      probeCalls: 0,
    });
  });

  test('Remotion range/progressive declarations stay sealed and cannot receive a URL attestation', async () => {
    let supportsCalls = 0;
    let probeCalls = 0;
    let observedInput: MediaInput | undefined;
    const remotionCapabilities = new RemotionMediaParserEngine().capabilities();
    expect(remotionCapabilities.probeReadModes).toEqual(['range', 'progressive']);
    expect(remotionCapabilities.features).not.toContain(AUTHENTICATED_RANGE_PROBE_FEATURE);
    const engine = baseEngine('probe', {
      id: 'remotion-media-parser@4.0.479',
      capabilities: () => remotionCapabilities,
      supports: async () => {
        supportsCalls += 1;
        return { supported: true };
      },
      probe: async (input) => {
        probeCalls += 1;
        observedInput = input;
        expect(input.url.startsWith('blob:')).toBe(true);
        expect(input.contentAttestation).toBeUndefined();
        expect(new Uint8Array(await input.arrayBuffer())).toEqual(probeBytes);
        return {
          container: 'mp4', durationSec: 1, tracks: [],
          telemetry: { bytesRead: probeBytes.byteLength }, probeEvidence: { readMode: 'whole-file' },
        };
      },
    });
    const result = await runOne(engine, boundedProbeScenario(), browser, support, {
      pixelBehavior: pixelPass,
      ...streamVerifiedProbeInput(),
      ...probeMemoryOptions,
    });
    expect(result).toMatchObject({
      status: 'ERROR',
      reason: expect.stringContaining('CORPUS_STREAM_TRANSPORT_ADAPTER_UNAUTHENTICATED'),
    });
    expect({ supportsCalls, probeCalls }).toEqual({ supportsCalls: 0, probeCalls: 0 });

    installProbeGoldenFetch();
    const sealed = await runOne(engine, boundedProbeScenario(), browser, support, {
      pixelBehavior: pixelPass,
      ...verifiedProbeInput(),
      ...probeMemoryOptions,
    });
    expect(sealed.status).toBe('FAIL');
    expect(sealed.reason).toContain('PROBE_READ_MODE_CONTRACT_VIOLATION');
    expect(observedInput?.url.startsWith('blob:')).toBe(true);
    expect(observedInput?.contentAttestation).toBeUndefined();
    expect({ supportsCalls, probeCalls }).toEqual({ supportsCalls: 2, probeCalls: 1 });
  });

  test('authenticated URL delivery admits bounded probes and large immutable operations only', async () => {
    installProbeGoldenFetch();
    let observedInput: MediaInput | undefined;
    const engine = baseEngine('probe', {
      capabilities: () => ({
        ...caps('probe'),
        features: [...caps('probe').features, AUTHENTICATED_RANGE_PROBE_FEATURE],
        probeReadModes: ['range', 'whole-file'],
      }),
      supports: async () => ({ supported: true }),
      probe: async (input) => {
        observedInput = input;
        expect(input.url).toBe('http://localhost/fixtures/media/input.mp4');
        expect(input.url.startsWith('blob:')).toBe(false);
        expect(input.contentAttestation).toMatchObject({
          logicalPath: 'input.mp4',
          sha256: probeSha256,
          sizeBytes: probeBytes.byteLength,
        });
        await expect(input.arrayBuffer()).rejects.toThrow('ATTESTED_URL_WHOLE_FILE_FORBIDDEN');
        return {
          container: 'mp4', durationSec: 1, tracks: [],
          telemetry: { bytesRead: 2 }, probeEvidence: { readMode: 'range' },
        };
      },
    });
    const accepted = await runOne(engine, boundedProbeScenario(), browser, support, {
      pixelBehavior: pixelPass,
      ...streamVerifiedProbeInput(),
      ...probeMemoryOptions,
    });
    expect(accepted.status).toBe('PASS');
    expect(observedInput?.contentAttestation?.sha256).toBe(probeSha256);

    let observedLargeInput: MediaInput | undefined;
    const largeRemux = await runOne(baseEngine('remux', {
      capabilities: () => ({
        ...caps('remux'),
        features: [...caps('remux').features, AUTHENTICATED_RANGE_INPUT_FEATURE],
      }),
      supports: async () => ({ supported: true }),
      remux: async (input) => {
        observedLargeInput = input;
        expect(input.url).toBe('http://localhost/fixtures/media/large-input.mp4');
        expect(input.contentAttestation).toMatchObject({
          sha256: largeInputSha256,
          sizeBytes: LARGE_AUTHENTICATED_INPUT_BYTES,
        });
        await expect(input.blob()).rejects.toThrow('ATTESTED_URL_WHOLE_FILE_FORBIDDEN');
        return bytes();
      },
    }), remuxScenario('remux/large-authenticated-range'), browser, support, {
      pixelBehavior: pixelPass,
      playbackSmoke: async () => true,
      ...streamVerifiedLargeInput(),
    });
    expect(largeRemux.status).toBe('PASS');
    expect(observedLargeInput?.contentAttestation?.sha256).toBe(largeInputSha256);

    let unauthenticatedLargeCalls = 0;
    const unauthenticatedLarge = await runOne(baseEngine('remux', {
      capabilities: () => ({
        ...caps('remux'),
        features: [...caps('remux').features, AUTHENTICATED_RANGE_PROBE_FEATURE],
      }),
      remux: async () => {
        unauthenticatedLargeCalls += 1;
        return bytes();
      },
    }), remuxScenario('remux/large-authenticated-range-missing-capability'), browser, support, {
      pixelBehavior: pixelPass,
      playbackSmoke: async () => true,
      ...streamVerifiedLargeInput(),
    });
    expect(unauthenticatedLarge).toMatchObject({
      status: 'ERROR',
      reason: expect.stringContaining(AUTHENTICATED_RANGE_INPUT_FEATURE),
    });
    expect(unauthenticatedLargeCalls).toBe(0);

    let nonScaleCalls = 0;
    const nonScale = await runOne(baseEngine('probe', {
      capabilities: () => ({
        ...caps('probe'),
        features: [...caps('probe').features, AUTHENTICATED_RANGE_PROBE_FEATURE],
        probeReadModes: ['range', 'whole-file'],
      }),
      probe: async () => {
        nonScaleCalls += 1;
        return { container: 'mp4', durationSec: 1, tracks: [] };
      },
    }), defineScenario({
      id: 'probe/non-scale-stream-forbidden',
      op: 'probe',
      input: 'input.mp4',
      requires: { operations: ['probe'], containersIn: ['mp4'] },
      options: {},
      oracles: ['golden-metadata'],
      metrics: [],
    }), browser, support, {
      pixelBehavior: pixelPass,
      ...streamVerifiedProbeInput(),
    });
    expect(nonScale).toMatchObject({
      status: 'ERROR',
      reason: expect.stringContaining('CORPUS_STREAM_TRANSPORT_FORBIDDEN'),
    });
    expect(nonScaleCalls).toBe(0);

    const mutatedScale = {
      ...boundedProbeScenario('probe/mutated-scale-stream-forbidden'),
      mutate: (value: Uint8Array) => value.slice(),
    } as Scenario;
    const mutated = await runOne(baseEngine('probe', {
      capabilities: () => ({
        ...caps('probe'),
        features: [...caps('probe').features, AUTHENTICATED_RANGE_PROBE_FEATURE],
        probeReadModes: ['range', 'whole-file'],
      }),
      probe: async () => {
        nonScaleCalls += 1;
        return { container: 'mp4', durationSec: 1, tracks: [] };
      },
    }), mutatedScale, browser, support, {
      pixelBehavior: pixelPass,
      ...streamVerifiedProbeInput(),
      ...probeMemoryOptions,
    });
    expect(mutated).toMatchObject({
      status: 'ERROR',
      reason: expect.stringContaining('CORPUS_STREAM_TRANSPORT_FORBIDDEN'),
    });
    expect(nonScaleCalls).toBe(0);
  });

  test('post-attestation delivery drift remains a corpus NA_ASSET', async () => {
    installProbeGoldenFetch();
    const result = await runOne(baseEngine('probe', {
      capabilities: () => ({
        ...caps('probe'),
        features: [...caps('probe').features, AUTHENTICATED_RANGE_PROBE_FEATURE],
        probeReadModes: ['range'],
      }),
      supports: async () => ({ supported: true }),
      probe: async () => {
        throw new CorpusDeliveryIntegrityError(
          'CORPUS_AUTHENTICATED_RANGE_DIGEST_MISMATCH',
          'input.mp4',
          'authenticated block changed after admission',
        );
      },
    }), boundedProbeScenario(), browser, support, {
      pixelBehavior: pixelPass,
      ...streamVerifiedProbeInput(),
      ...probeMemoryOptions,
    });
    expect(result).toMatchObject({
      status: 'NA_ASSET',
      reason: expect.stringContaining('CORPUS_AUTHENTICATED_RANGE_DIGEST_MISMATCH'),
    });
  });

  test('bounded runtime telemetry is persisted; exceeded and missing evidence are FAIL and ERROR', async () => {
    const run = async (metadata: NormalizedMetadata): Promise<ScenarioResult> => {
      installProbeGoldenFetch();
      return runOne(baseEngine('probe', {
        capabilities: () => ({ ...caps('probe'), probeReadModes: ['range'] }),
        supports: async () => ({ supported: true }),
        probe: async () => metadata,
      }), boundedProbeScenario(), browser, support, {
        pixelBehavior: pixelPass,
        ...verifiedProbeInput(),
        ...probeMemoryOptions,
      });
    };

    const valid = await run({
      container: 'mp4', durationSec: 1, tracks: [],
      telemetry: { bytesRead: 2 }, probeEvidence: { readMode: 'range' },
    });
    expect(valid.status).toBe('PASS');
    expect(valid.oracleOutcomes[0]).toMatchObject({
      state: 'VERDICT',
      evidence: { layers: [{ reasonCode: 'PROBE_SCALE_BUDGET_MET' }] },
    });

    const exceeded = await run({
      container: 'mp4', durationSec: 1, tracks: [],
      telemetry: { bytesRead: 5 }, probeEvidence: { readMode: 'range' },
    });
    expect(exceeded.status).toBe('FAIL');
    expect(exceeded.oracleOutcomes[0]).toMatchObject({
      state: 'VERDICT', verdict: 'FAIL', reasonCode: 'PROBE_SCALE_BUDGET_EXCEEDED',
    });

    const missing = await run({ container: 'mp4', durationSec: 1, tracks: [], telemetry: { bytesRead: 2 } });
    expect(missing.status).toBe('ERROR');
    expect(missing.oracleOutcomes[0]).toMatchObject({
      state: 'ERROR', reasonCode: 'PROBE_READ_MODE_EVIDENCE_MISSING',
    });
  });

  test('dynamic bounded-path NotApplicableError survives the memory window as NA_ENGINE', async () => {
    installProbeGoldenFetch();
    const engine = baseEngine('probe', {
      capabilities: () => ({ ...caps('probe'), probeReadModes: ['range'] }),
      supports: async () => ({ supported: true }),
      probe: async () => {
        throw createNotApplicableError(
          'runner-fake@1.0.0',
          'probe',
          'required fields force a full scan',
          { inputContainers: ['mp4'], options: { practicalReadMode: 'whole-file' } },
          'PROBE_BOUNDED_FULL_SCAN_UNSUPPORTED',
        );
      },
    });
    const result = await runOne(engine, boundedProbeScenario(), browser, support, {
      pixelBehavior: pixelPass,
      ...verifiedProbeInput(),
      ...probeMemoryOptions,
    });
    expect(result.status).toBe('NA_ENGINE');
    expect(result.reason).toContain('PROBE_BOUNDED_FULL_SCAN_UNSUPPORTED');
    expect(result.reason).not.toContain('MEMORY_PROTOCOL_ERROR');
  });

  test('cancellation during a wedged memory baseline is SKIPPED and never starts the operation', async () => {
    installProbeGoldenFetch();
    const controller = new AbortController();
    let baselineRequested!: () => void;
    const baselineStarted = new Promise<void>((resolve) => { baselineRequested = resolve; });
    let probeCalls = 0;
    const engine = baseEngine('probe', {
      capabilities: () => ({ ...caps('probe'), probeReadModes: ['range'] }),
      supports: async () => ({ supported: true }),
      probe: async () => {
        probeCalls += 1;
        return { container: 'mp4', durationSec: 1, tracks: [] };
      },
    });
    const running = runOne(engine, boundedProbeScenario('probe/runner-memory-baseline-cancel'), browser, support, {
      signal: controller.signal,
      pixelBehavior: pixelPass,
      ...verifiedProbeInput(),
      probeMemorySampler: {
        state: 'AVAILABLE',
        value: {
          api: 'measureUserAgentSpecificMemory',
          sample: () => {
            baselineRequested();
            return new Promise<number>(() => undefined);
          },
        },
      },
      probeMemoryWindowOptions: { settleWindowMs: 0, sampleTimeoutMs: 50 },
    });
    await baselineStarted;
    controller.abort(new Error('Stop'));
    const result = await running;
    expect(result.status).toBe('SKIPPED');
    expect(String(result.reason ?? '')).toContain('[RUN_CANCELLED]');
    expect(String(result.reason ?? '')).toContain('Stop');
    expect(String(result.reason ?? '')).not.toContain('MEMORY_PROTOCOL_ERROR');
    expect(probeCalls).toBe(0);
  });

  test('headerless null is valid while NaN, infinity, negative, and excessive finite durations are FAIL', async () => {
    installCorpusFetch();
    const scenario = defineScenario({
      id: 'probe/runner-headerless-duration',
      op: 'probe',
      input: 'input.mp4',
      requires: { operations: ['probe'], containersIn: ['mp4'] },
      options: {
        invariant: 'probe-headerless-sane-duration',
        robustness: {
          probe: {
            schema: 'media-test/probe-scenario-contract@1',
            probeContract: {
              schema: 'media-test/probe-headerless-duration@1',
              allowUnknown: true,
              contentSpanSec: 2.98,
              tailAndRoundingAllowanceSec: 0.5,
            },
          },
        },
      },
      oracles: ['property-invariant'],
      metrics: [],
    });
    const execute = (durationSec: number | null) => runOne(baseEngine('probe', {
      supports: async () => ({ supported: true }),
      probe: async () => ({ container: 'mp4', durationSec, tracks: [] }),
    }), scenario, browser, support, { pixelBehavior: pixelPass });

    expect((await execute(null)).status).toBe('PASS');
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, -1, 99]) {
      const result = await execute(invalid);
      expect(result.status).toBe('FAIL');
      expect(result.oracleOutcomes[0]).toMatchObject({ state: 'VERDICT', verdict: 'FAIL' });
    }
  });
});

describe('REQ-RUN-03 three-way performance admission', () => {
  test('PASS is benchmark eligible, all other statuses are not', () => {
    expect(isBenchmarkEligible('PASS')).toBe(true);
    for (const status of ['FAIL', 'ERROR', 'NA_ENGINE', 'NA_BROWSER', 'NA_ASSET', 'SKIPPED'] as const) {
      expect(isBenchmarkEligible(status)).toBe(false);
    }
  });

  test('a functional operation timeout is a typed, writable FAIL verdict', async () => {
    installCorpusFetch();
    const engine = baseEngine('remux', {
      supports: async () => ({ supported: true }),
      remux: async () => new Promise<MediaBytes>(() => undefined),
    });
    const scenario = defineScenario({
      ...remuxScenario('remux/runner-operation-timeout'),
      timeoutMs: 20,
    });
    const result = await runOne(engine, scenario, browser, support, {
      pixelBehavior: pixelPass,
      playbackSmoke: async () => true,
    });
    expect(result.status).toBe('FAIL');
    expect(result.oracleOutcomes).toEqual([expect.objectContaining({
      state: 'VERDICT',
      oracle: 'playback-smoke',
      verdict: 'FAIL',
      reasonCode: 'OPERATION_TIMEOUT',
    })]);

    const inputSha256 = 'ab'.repeat(32);
    const inputVariantId = 'selected:input.mp4';
    expect(validateScenarioResultV2({
      ...result,
      schemaVersion: 2,
      scenarioRevision: scenario.revision,
      definitionHash: scenario.definitionHash,
      inputVariantId,
      inputSha256,
      instance: {
        scenarioId: scenario.id,
        scenarioRevision: scenario.revision,
        definitionHash: scenario.definitionHash,
        inputVariantId,
        inputSha256,
      },
    })).toEqual([]);
  });

  test('a benchmark exception preserves the prior correctness PASS with unavailable measurement', async () => {
    installCorpusFetch();
    let calls = 0;
    const engine = baseEngine('remux', {
      supports: async () => ({ supported: true }),
      remux: async () => {
        calls += 1;
        if (calls > 1) throw new Error('measurement backend failed');
        return bytes();
      },
    });
    const scenario = defineScenario({
      ...remuxScenario('remux/runner-bench-error'),
      metrics: ['wall'],
    });
    const result = await runOne(engine, scenario, browser, support, {
      pillar: 'performance',
      benchOptions: { warmup: 0, iters: 1 },
      pixelBehavior: pixelPass,
      playbackSmoke: async () => true,
    });
    expect(result.status).toBe('PASS');
    expect(result.bench).toBeUndefined();
    expect(result.measurement).toMatchObject({ state: 'UNAVAILABLE', reasonCode: 'BENCH_ERROR' });
  });

  test('run cancellation during measurement preserves completed candidate correctness and a writable row', async () => {
    installCorpusFetch();
    const controller = new AbortController();
    let calls = 0;
    const engine = baseEngine('remux', {
      supports: async () => ({ supported: true }),
      remux: async () => {
        calls += 1;
        if (calls > 1) {
          controller.abort(new Error('run deadline elapsed'));
          return new Promise<MediaBytes>(() => undefined);
        }
        return bytes();
      },
    });
    const scenario = defineScenario({
      ...remuxScenario('remux/runner-bench-cancelled-after-correctness'),
      metrics: ['wall'],
    });
    const sourceSha256 = 'ab'.repeat(32);
    const evidencePlan: CandidateOracleEvidencePlan = {
      schemaVersion: 'candidate-oracle-evidence@1',
      sourceSha256,
      requirements: [{
        oracle: 'playback-smoke',
        role: 'REQUIRED',
        needs: [{ kind: 'BROWSER_CAPABILITY' }],
      }],
      requiredOracles: ['playback-smoke'],
      sufficientOracleSets: [['playback-smoke']],
      declaredAvailable: ['BROWSER_CAPABILITY'],
      contractDigest: 'cd'.repeat(32),
    };
    const result = await runOne(engine, scenario, browser, support, {
      signal: controller.signal,
      pillar: 'performance',
      benchOptions: { warmup: 0, iters: 1 },
      pixelBehavior: pixelPass,
      playbackSmoke: async () => true,
      selectionEvidencePlan: evidencePlan,
    });

    expect(calls).toBe(2);
    expect(result.status).toBe('PASS');
    expect(result.candidateEvidence).toMatchObject({
      status: 'PASS',
      reasonCode: 'EVIDENCE_SUFFICIENT_PASS',
      sufficient: true,
    });
    expect(result.measurement).toEqual({
      state: 'UNAVAILABLE',
      reasonCode: 'BENCH_CANCELLED',
      detail: expect.stringContaining('run deadline elapsed'),
    });
    expect(result.measurement?.state === 'UNAVAILABLE' ? result.measurement.detail : '')
      .toStartWith('[RUN_CANCELLED]');

    const inputVariantId = 'selected:input.mp4';
    const serialized = {
      ...result,
      schemaVersion: 2,
      scenarioRevision: scenario.revision,
      definitionHash: scenario.definitionHash,
      inputVariantId,
      inputSha256: sourceSha256,
      instance: {
        scenarioId: scenario.id,
        scenarioRevision: scenario.revision,
        definitionHash: scenario.definitionHash,
        inputVariantId,
        inputSha256: sourceSha256,
      },
    };
    expect(validateScenarioResultV2(serialized)).toEqual([]);
  });

  test('adaptive output rates use neutral presentation units and retain ratio/basis evidence', async () => {
    installCorpusFetch();
    const fixture = new Uint8Array(await Bun.file('fixtures/media/tiny_h264_360p_2s.mp4').arrayBuffer());
    const output: MediaBytes = { bytes: fixture, mime: 'video/mp4', container: 'mp4' };
    const engine = baseEngine('transcode', {
      supports: async () => ({ supported: true }),
      transcode: async () => ({ ...output, bytes: output.bytes.slice() }),
    });
    const scenario = defineScenario({
      id: 'performance/runner-observed-units',
      op: 'transcode',
      input: 'input.mp4',
      requires: { operations: ['transcode'], containersIn: ['mp4'], containersOut: ['mp4'] },
      options: { container: 'mp4' },
      oracles: ['playback-smoke'],
      metrics: ['framesPerSec', 'encodeFps', 'throughputRealtime', 'wall'],
      primaryMetric: 'framesPerSec',
    });
    const result = await runOne(engine, scenario, browser, support, {
      pillar: 'performance',
      benchOptions: { warmup: 0, iters: 1, minDurationMs: 100, maxInnerIterations: 1 },
      pixelBehavior: pixelPass,
      playbackSmoke: async () => true,
    });
    expect(result.status).toBe('PASS');
    expect(result.measurement).toMatchObject({ state: 'AVAILABLE' });
    expect(result.bench?.framesPerSec?.n).toBeGreaterThanOrEqual(5);
    expect(result.bench?.framesPerSec?.ratioComponents?.length).toBe(result.bench?.framesPerSec?.n);
    expect(result.bench?.framesPerSec?.protocolEvidence?.schema)
      .toBe('media-test/performance-measurement-evidence@1');
    const durations = result.bench?.framesPerSec?.protocolEvidence?.presentationDurations as
      | Array<{ basis?: string }>
      | undefined;
    expect(durations?.length).toBe(result.bench?.framesPerSec?.n);
    expect(durations?.every((entry) => entry.basis === 'output-presentation')).toBe(true);
    const rates = result.bench?.framesPerSec?.protocolEvidence?.transcodeRateEvidence as
      | Array<{
          associatedVerdict?: string;
          numerator?: { name?: string; source?: string; value?: number };
          denominator?: { name?: string; source?: string; value?: number };
          value?: number;
        }>
      | undefined;
    expect(rates?.length).toBe(result.bench?.framesPerSec?.n);
    expect(rates?.every((rate) =>
      rate.associatedVerdict === 'PASS' &&
      rate.numerator?.source === 'neutral-output-sample-table' &&
      rate.denominator?.source === 'monotonic-operation-window' &&
      Number.isFinite(rate.numerator?.value) &&
      Number.isFinite(rate.denominator?.value) &&
      Number.isFinite(rate.value))).toBe(true);
    expect(result.bench?.wall?.samples.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
  });

  test('adapter benchmark limits cap adaptive inner-loop reuse', async () => {
    installCorpusFetch();
    const engine = baseEngine('remux', {
      benchmarkLimits: { maxInnerIterations: 2 },
      supports: async () => ({ supported: true }),
    });
    const scenario = defineScenario({
      ...remuxScenario('performance/runner-adapter-inner-cap'),
      metrics: ['wall'],
      primaryMetric: 'wall',
    });
    const result = await runOne(engine, scenario, browser, support, {
      pillar: 'performance',
      benchOptions: { warmup: 0, iters: 1, minDurationMs: 100, maxInnerIterations: 64 },
      pixelBehavior: pixelPass,
      playbackSmoke: async () => true,
    });
    const timing = result.bench?.wall?.protocolEvidence?.timingProtocol as
      | { innerIterations?: number }
      | undefined;
    expect(result.status).toBe('PASS');
    expect(timing?.innerIterations).toBe(2);
  });

  test('adapter memory-window limits bound expensive worker-backed sampling', async () => {
    installCorpusFetch();
    let samplerCalls = 0;
    const engine = baseEngine('remux', {
      benchmarkLimits: {
        maxInnerIterations: 2,
        memoryWindow: {
          sampleImmediatelyDuringOperation: true,
          maxOperationSamples: 1,
          settleWindowMs: 0,
        },
      },
      supports: async () => ({ supported: true }),
    });
    const scenario = defineScenario({
      ...remuxScenario('performance/runner-adapter-memory-window'),
      metrics: ['wall', 'peakMemory'],
      primaryMetric: 'wall',
    });
    const result = await runOne(engine, scenario, browser, support, {
      pillar: 'performance',
      benchOptions: {
        warmup: 0,
        iters: 5,
        minDurationMs: 100,
        maxInnerIterations: 1,
      },
      benchMemorySampler: {
        state: 'AVAILABLE',
        value: {
          api: 'measureUserAgentSpecificMemory',
          sample: async () => 4_000 + ++samplerCalls,
        },
      },
      pixelBehavior: pixelPass,
      playbackSmoke: async () => true,
    });
    const memory = result.bench?.wall?.protocolEvidence?.memory as Array<{
      immediateOperationSample: boolean;
      operationSampleLimit: number | null;
      settleWindowMs: number;
      samples: Array<{ phase: string }>;
    }> | undefined;
    expect(result.status).toBe('PASS');
    expect(result.measurement).toMatchObject({ state: 'AVAILABLE' });
    expect(memory).toHaveLength(5);
    expect(memory?.every((entry) =>
      entry.immediateOperationSample === true &&
      entry.operationSampleLimit === 1 &&
      entry.settleWindowMs === 0 &&
      entry.samples.map((sample) => sample.phase).join(',') === 'baseline,operation,end'
    )).toBe(true);
    expect(samplerCalls).toBe(15);
  });

  test('external runtime errors are sanitized to valid I-JSON strings', async () => {
    installCorpusFetch();
    const engine = baseEngine('remux', {
      supports: async () => ({ supported: true }),
      remux: async () => { throw new Error('worker argv contains \ud800 corruption'); },
    });
    const result = await runOne(engine, remuxScenario('remux/runner-invalid-utf16-error'), browser, support, {
      pixelBehavior: pixelPass,
      playbackSmoke: async () => true,
    });
    expect(result.status).toBe('ERROR');
    expect(result.reason).toContain('worker argv contains � corruption');
    expect([...(result.reason ?? '')].some((character) => {
      const code = character.charCodeAt(0);
      return code >= 0xd800 && code <= 0xdfff;
    })).toBe(false);
  });

  test('unsupported peak-memory preflight preserves correctness and does not rerun the operation', async () => {
    installCorpusFetch();
    let calls = 0;
    const engine = baseEngine('remux', {
      supports: async () => ({ supported: true }),
      remux: async () => {
        calls += 1;
        return bytes();
      },
    });
    const scenario = defineScenario({
      ...remuxScenario('performance/runner-memory-preflight'),
      metrics: ['peakMemory'],
      primaryMetric: 'peakMemory',
    });
    const result = await runOne(engine, scenario, browser, support, {
      pillar: 'performance',
      pixelBehavior: pixelPass,
      playbackSmoke: async () => true,
    });
    expect(result.status).toBe('PASS');
    expect(result.measurement).toMatchObject({ state: 'UNAVAILABLE', reasonCode: 'MEMORY_API_UNSUPPORTED' });
    expect(calls).toBe(1);
  });

  test('authenticated scale-probe memory sampling instruments only retained independent repetitions', async () => {
    installProbeGoldenFetch();
    let operationCalls = 0;
    let samplerCalls = 0;
    const engine = baseEngine('probe', {
      capabilities: () => ({
        ...caps('probe'),
        features: [...caps('probe').features, AUTHENTICATED_RANGE_PROBE_FEATURE],
        probeReadModes: ['range'],
      }),
      supports: async () => ({ supported: true }),
      probe: async () => {
        operationCalls += 1;
        return {
          container: 'mp4', durationSec: 1, tracks: [],
          telemetry: { bytesRead: 2 }, probeEvidence: { readMode: 'range' },
        };
      },
    });
    const scenario = defineScenario({
      ...boundedProbeScenario('probe/runner-bounded-memory-window'),
      metrics: ['wall', 'peakMemory'],
      primaryMetric: 'wall',
    });
    const result = await runOne(engine, scenario, browser, support, {
      pillar: 'performance',
      benchOptions: {
        warmup: 2,
        iters: 1,
        minDurationMs: 100,
        maxInnerIterations: 1,
        slowRepetitions: 5,
      },
      benchMemorySampler: {
        state: 'AVAILABLE',
        value: {
          api: 'measureUserAgentSpecificMemory',
          sample: async () => 1_000 + ++samplerCalls,
        },
      },
      pixelBehavior: pixelPass,
      ...streamVerifiedProbeInput(),
      ...probeMemoryOptions,
    });
    expect(result.status).toBe('PASS');
    expect(result.measurement).toMatchObject({ state: 'AVAILABLE' });
    expect(result.bench?.wall?.n).toBe(5);
    // 1 functional + 2 discarded warmups + 1 discarded calibration + 5 measured operations.
    expect(operationCalls).toBe(9);
    // Exactly baseline + immediate in-operation + end for each retained repetition. The discarded
    // warmup/calibration phases invoke no memory API calls.
    expect(samplerCalls).toBe(15);
    const memory = result.bench?.wall?.protocolEvidence?.memory as Array<{
      baselineBytes: number;
      immediateOperationSample: boolean;
      operationSampleLimit: number | null;
      settleWindowMs: number;
      samples: Array<{ phase: string }>;
    }> | undefined;
    expect(memory).toHaveLength(5);
    expect(memory?.map((entry) => entry.baselineBytes)).toEqual([1_001, 1_004, 1_007, 1_010, 1_013]);
    expect(memory?.every((entry) =>
      entry.immediateOperationSample === true &&
      entry.operationSampleLimit === 1 &&
      entry.settleWindowMs === 0 &&
      entry.samples.map((sample) => sample.phase).join(',') === 'baseline,operation,end'
    )).toBe(true);
  });

  test('non-probe peak-memory batches retain recurring operation samples and the default settle window', async () => {
    installCorpusFetch();
    let operationCalls = 0;
    let samplerCalls = 0;
    let memoryInstrumentationStarted = false;
    let operationSleeps = 0;
    let finishMeasuredOperation: (() => void) | undefined;
    const engine = baseEngine('remux', {
      supports: async () => ({ supported: true }),
      remux: async () => {
        operationCalls += 1;
        if (!memoryInstrumentationStarted) return bytes();
        operationSleeps = 0;
        return new Promise<MediaBytes>((resolve) => {
          finishMeasuredOperation = () => {
            finishMeasuredOperation = undefined;
            resolve(bytes());
          };
        });
      },
    });
    const scenario = defineScenario({
      ...remuxScenario('performance/runner-generic-memory-window'),
      metrics: ['wall', 'peakMemory'],
      primaryMetric: 'wall',
    });
    const result = await runOne(engine, scenario, browser, support, {
      pillar: 'performance',
      benchOptions: { warmup: 0, iters: 5, minDurationMs: 100, maxInnerIterations: 1 },
      benchMemorySampler: {
        state: 'AVAILABLE',
        value: {
          api: 'measureUserAgentSpecificMemory',
          sample: async () => {
            memoryInstrumentationStarted = true;
            return 2_000 + ++samplerCalls;
          },
        },
      },
      benchMemoryWindowOptions: {
        // Preserve production's 100 ms interval and 500 ms settle defaults while making this
        // deterministic test instantaneous. The third interval releases each measured operation.
        sleep: async () => {
          if (finishMeasuredOperation && ++operationSleeps === 3) finishMeasuredOperation();
          await Promise.resolve();
        },
      },
      pixelBehavior: pixelPass,
      playbackSmoke: async () => true,
    });
    expect(result.status).toBe('PASS');
    expect(result.bench?.wall?.n).toBe(5);
    expect(operationCalls).toBe(7); // functional + calibration + five measured repetitions
    const memory = result.bench?.wall?.protocolEvidence?.memory as Array<{
      immediateOperationSample: boolean;
      operationSampleLimit: number | null;
      settleWindowMs: number;
      sampleIntervalMs: number;
      samples: Array<{ phase: string }>;
    }> | undefined;
    expect(memory).toHaveLength(5);
    expect(memory?.every((entry) => {
      const phases = entry.samples.map((sample) => sample.phase);
      return entry.immediateOperationSample === false &&
        entry.operationSampleLimit === null &&
        entry.settleWindowMs === 500 &&
        entry.sampleIntervalMs === 100 &&
        phases[0] === 'baseline' &&
        phases.filter((phase) => phase === 'operation').length >= 2 &&
        phases.filter((phase) => phase === 'end').length === 1 &&
        phases.filter((phase) => phase === 'settle').length === 5;
    })).toBe(true);
    expect(samplerCalls).toBe(memory?.reduce((sum, entry) => sum + entry.samples.length, 0));
  });
});

describe('REQ-RUN-05 deterministic exhaustive coverage', () => {
  const statuses = ['PASS', 'FAIL', 'FAIL'] as const;

  test('execution order is always deterministic and scenario-major', () => {
    expect(buildExecutionOrder(['engine-b', 'engine-a'], ['scenario/2', 'scenario/1'])).toEqual([
      { engineId: 'engine-b', scenarioId: 'scenario/2' },
      { engineId: 'engine-a', scenarioId: 'scenario/2' },
      { engineId: 'engine-b', scenarioId: 'scenario/1' },
      { engineId: 'engine-a', scenarioId: 'scenario/1' },
    ]);
  });

  test('status permutations preserve FAIL + partial 1/3', () => {
    for (const order of permutations(statuses)) {
      expect(reduceExhaustiveStatuses(order)).toMatchObject({
        status: 'FAIL',
        grade: 'partial',
        valid: 1,
        counts: { pass: 1, fail: 2, total: 3 },
      });
    }
    expect(reduceExhaustiveStatuses(['PASS', 'PASS', 'PASS'])).toMatchObject({
      status: 'PASS',
      grade: 'full',
      valid: 3,
    });
    expect(reduceExhaustiveStatuses(['PASS', 'ERROR', 'ERROR'])).toMatchObject({
      status: 'ERROR',
      grade: 'partial',
      valid: 1,
    });
  });

  test('aggregate preserves full per-file oracle evidence and both failing identities', () => {
    const scenario = remuxScenario('remux/runner-exhaustive');
    const makeSelection = (file: string): ScenarioSelection => ({
      scenarioId: scenario.id,
      isBaked: file === '01.mp4',
      selectedFile: file,
      selectedSha256: file.slice(0, 2).repeat(32),
      resolvedInputs: [{ id: file, urlAssetPath: file, sha256: file.slice(0, 2).repeat(32) }],
      effectiveScenario: scenario,
      candidateCount: 3,
      shapeWarnings: [],
    });
    const makeOutcome = (status: 'PASS' | 'FAIL', file: string): OracleOutcome => ({
      state: 'VERDICT',
      oracle: 'playback-smoke',
      verdict: status,
      reasonCode: status === 'PASS' ? 'PLAYBACK_SUCCEEDED' : 'PLAYBACK_FAILED',
      detail: file,
    });
    const makeResult = (status: 'PASS' | 'FAIL', file: string): ScenarioResult => ({
      engineId: 'runner-fake@1.0.0',
      browser,
      scenarioId: scenario.id,
      family: scenario.family,
      status,
      oracleOutcomes: [makeOutcome(status, file)],
      executionFingerprint: {
        schema: EXECUTION_RESULT_SCHEMA,
        hash: (status === 'PASS' ? 'a' : file === '02.mp4' ? 'b' : 'c').repeat(64),
      },
      durationMs: file === '01.mp4' ? 10 : file === '02.mp4' ? 20 : 30,
      ...(status === 'PASS'
        ? {
            bench: {
              wall: {
                n: 1,
                warmup: 0,
                metric: 'wall',
                median: 10,
                p95: 10,
                mad: 0,
                unit: 'ms',
                samples: [10],
              },
            },
            measurement: { state: 'AVAILABLE' as const, metrics: ['wall' as const] },
          }
        : { measurement: { state: 'NOT_REQUESTED' as const } }),
      ...(status === 'FAIL' ? { reason: `${file} mismatch` } : {}),
    });
    const aggregate = aggregateExhaustive(
      'runner-fake@1.0.0',
      browser,
      scenario,
      [
        { sel: makeSelection('01.mp4'), result: makeResult('PASS', '01.mp4') },
        { sel: makeSelection('02.mp4'), result: makeResult('FAIL', '02.mp4') },
        { sel: makeSelection('03.mp4'), result: makeResult('FAIL', '03.mp4') },
      ],
      { suiteVersion: 'test', engineId: 'runner-fake@1.0.0', browser },
    );
    expect(aggregate.status).toBe('FAIL');
    expect(aggregate.coverage).toMatchObject({ valid: 1, total: 3, grade: 'partial' });
    expect(aggregate.bench).toBeUndefined();
    expect(aggregate.measurement).toEqual({
      state: 'UNAVAILABLE',
      reasonCode: 'EXHAUSTIVE_CORRECTNESS_GATE',
      detail: 'aggregate status FAIL is not benchmark-eligible; passing-member measurements remain in exhaustive[]',
    });
    expect(aggregate.reason).toContain('02.mp4(FAIL)');
    expect(aggregate.reason).toContain('03.mp4(FAIL)');
    expect(aggregate.exhaustive?.[0]?.bench?.wall?.median).toBe(10);
    expect(aggregate.exhaustive?.[0]?.measurement).toEqual({ state: 'AVAILABLE', metrics: ['wall'] });
    expect((aggregate.exhaustive?.[1] as unknown as { oracleOutcomes: OracleOutcome[] }).oracleOutcomes[0]).toMatchObject({
      state: 'VERDICT',
      verdict: 'FAIL',
      detail: '02.mp4',
    });
    expect(aggregate.exhaustive?.map((entry) => entry.executionFingerprint?.hash[0])).toEqual(['a', 'b', 'c']);
    expect(aggregate.durationMs).toBe(60);

    const aggregateInputSha256 = aggregate.selection?.executedInputDigest;
    if (!aggregateInputSha256) throw new Error('missing aggregate input identity');
    const inputVariantId = 'exhaustive:runner-test';
    expect(validateScenarioResultV2({
      ...aggregate,
      schemaVersion: 2,
      scenarioRevision: scenario.revision,
      definitionHash: scenario.definitionHash,
      inputVariantId,
      inputSha256: aggregateInputSha256,
      instance: {
        scenarioId: scenario.id,
        scenarioRevision: scenario.revision,
        definitionHash: scenario.definitionHash,
        inputVariantId,
        inputSha256: aggregateInputSha256,
      },
    })).toEqual([]);

    const passingAggregate = aggregateExhaustive(
      'runner-fake@1.0.0',
      browser,
      scenario,
      [{ sel: makeSelection('01.mp4'), result: makeResult('PASS', '01.mp4') }],
      { suiteVersion: 'test', engineId: 'runner-fake@1.0.0', browser },
    );
    expect(passingAggregate.status).toBe('PASS');
    expect(passingAggregate.bench?.wall).toMatchObject({ aggregate: 10, samples: [10] });
    expect(passingAggregate.measurement).toEqual({ state: 'AVAILABLE', metrics: ['wall'] });
  });
});

describe('REQ-RUN-06 cancellation and hard Worker isolation', () => {
  test('timeout aborts the one shared signal, cleanup completes, and resource activity stops', async () => {
    installCorpusFetch();
    const signals = new Set<AbortSignal>();
    let ticks = 0;
    let interval: ReturnType<typeof setInterval> | undefined;
    let disposed = false;
    const engine = baseEngine('remux', {
      supports: async (_request, context) => {
        if (context) signals.add(context.signal);
        return { supported: true };
      },
      init: async (context) => {
        if (context) signals.add(context.signal);
      },
      remux: async (_input, _options, context) => {
        if (!context) throw new Error('missing operation context');
        signals.add(context.signal);
        interval = setInterval(() => {
          ticks += 1;
        }, 1);
        await new Promise<void>((_resolve, reject) => {
          context.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true });
        });
        return bytes();
      },
      dispose: async (context) => {
        if (context) signals.add(context.signal);
        if (interval) clearInterval(interval);
        disposed = true;
      },
    });
    const scenario = defineScenario({
      ...remuxScenario('remux/runner-timeout'),
      timeoutMs: 20,
    });
    const result = await runOne(engine, scenario, browser, support, {
      pixelBehavior: pixelPass,
      playbackSmoke: async () => true,
    });
    const atReturn = ticks;
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(result.status).toBe('FAIL');
    expect(result.reason).toContain('timeout');
    expect(signals.size).toBe(1);
    expect([...signals][0]?.aborted).toBe(true);
    expect(disposed).toBe(true);
    expect(ticks).toBe(atReturn);
  });

  test('a synchronous infinite-loop Worker is terminated and a subsequent Worker runs', async () => {
    const create = () => new Worker(new URL('./runner-infinite.worker.ts', import.meta.url), { type: 'module' });
    await expect(
      runTerminableWorker(create, { mode: 'loop' as const }, { timeoutMs: 20 }),
    ).rejects.toMatchObject({ name: 'TimeoutError' });
    await expect(
      runTerminableWorker(create, { mode: 'echo' as const, value: 'next-cell' }, { timeoutMs: 1_000 }),
    ).resolves.toBe('next-cell');
  });

  test('the matrix isolation boundary keeps timeout, crash, and resource-limit evidence distinct', async () => {
    const create = () => new Worker(new URL('./runner-robustness.worker.ts', import.meta.url), { type: 'module' });
    const scenario = (suffix: string, timeoutMs: number) => defineScenario({
      id: `robustness/isolation-${suffix}`,
      op: 'remux',
      input: 'input.mp4',
      requires: { operations: ['remux'] },
      options: {
        container: 'mp4',
        robustness: {
          schema: 'media-test/robustness-contract@1',
          inputClass: 'negative',
          returnedOutputCheck: 'media-structure',
          survivorOracles: ['graceful-failure'],
          timeoutMs,
        },
      },
      oracles: ['graceful-failure'],
      metrics: [],
      timeoutMs,
    });
    const execute = (suffix: string, timeoutMs: number) => runRobustnessCellInWorker(
      'isolated-fake',
      'isolated-fake@1',
      scenario(suffix, timeoutMs),
      support,
      { browser, pillar: 'robustness', robustnessWorkerFactory: create },
      {
        browser,
        pillar: 'robustness',
        env: { suiteVersion: 'test', engineId: 'isolated-fake@1', browser },
        pixelBehavior: pixelPass,
      },
    );

    const timeout = await execute('timeout', 20);
    expect(timeout.status).toBe('FAIL');
    expect(timeout.operationEvidence).toMatchObject({
      disposition: 'timeout',
      resource: { kind: 'worker-stall', limit: 20, unit: 'ms' },
    });

    const crash = await execute('crash', 1_000);
    expect(crash.status).toBe('FAIL');
    expect(crash.operationEvidence).toMatchObject({ disposition: 'worker-crash' });

    const resource = await execute('resource', 1_000);
    expect(resource.status).toBe('FAIL');
    expect(resource.operationEvidence).toEqual({
      schema: 'media-test/robustness-operation@1',
      disposition: 'resource-limit',
      stage: 'operation',
      resource: { kind: 'memory', observed: 65, limit: 64, unit: 'bytes' },
    });

    const next = await execute('next', 1_000);
    expect(next.status).toBe('PASS');
    expect(next.operationEvidence?.disposition).toBe('returned-validatable-output');
  });
});

describe('REQ-RUN-07 reviewed suppression audit', () => {
  test('all retained entries are live, owned, evidenced, and non-orphaned', () => {
    const cells = reviewedDisabledCells();
    const forced = reviewedForcedTimeoutCells();
    const issues = auditDisabledCells({
      engineIds: ['remotion'],
      scenarioIds: [...cells, ...forced].map((cell) => cell.scenarioId),
      now: new Date('2026-07-16T00:00:00.000Z'),
    });
    expect(issues).toEqual([]);
    for (const cell of [...cells, ...forced]) {
      expect(cell.owner).not.toBe('');
      expect(cell.issue).not.toBe('');
      expect(cell.evidence).not.toBe('');
      expect(cell.retestCondition).not.toBe('');
      expect(cell.workerIsolationReason).not.toBe('');
    }
  });

  test('tuple/defect hiding rows were removed and audit mode executes reviewed rows', () => {
    expect(reviewedForcedTimeoutCells()).toEqual([]);
    expect(reviewedDisabledCells()).toEqual([]);
    expect(disabledCellReason('web-demuxer@4.0.0', 'robustness/edge_ts_pts_wraparound_demux')).toBeUndefined();
    expect(disabledCellReason('mediabunny@1.48.0', 'probe/cenc_ctr')).toBeUndefined();
    expect(disabledCellReason('remotion@4.0.479', 'demux/graceful_mp4_header_destroyed')).toBeUndefined();
    expect(disabledCellReason('remotion@4.0.479', 'streaming-output/buffer_massive_h264_mp4')).toBeUndefined();
    expect(disabledCellReason(
      'remotion@4.0.479',
      'performance/size-ladder-iterate-packets-huge',
      'enforce',
    )).toBeUndefined();
  });
});

describe('REQ-RUN-08 content-addressed reuse', () => {
  const components: ExecutionFingerprintComponents = {
    suiteVersion: '1.2.3',
    resultSchema: EXECUTION_RESULT_SCHEMA,
    oracleModelVersion: ORACLE_MODEL_VERSION,
    scenarioDefinition: { id: 'remux/fingerprint', revision: 2, tolerance: 0.01 },
    engine: { id: 'runner-fake@1.0.0', config: { backend: 'worker' }, capabilities: { remux: true } },
    browser: { family: browser, version: '130.0', pixelBehavior: pixelPass },
    supportDecision: { supported: true, browserConfigs: [{ codec: 'avc1.640028' }] },
    selectedAssets: [{ id: 'input.mp4', sha256: '11'.repeat(32), sizeBytes: 42 }],
    selectionContract: {
      eligiblePoolDigest: '77'.repeat(32),
      executedInputDigest: '11'.repeat(32),
      evidenceContractDigest: '88'.repeat(32),
    },
    benchmarkProtocol: { pillar: 'all', warmup: 1, iters: 3, noiseBandPct: 3 },
    corpusChecksum: '22'.repeat(32),
    goldenHashes: [{ assetId: 'input.mp4', kind: 'meta', sha256: '33'.repeat(32) }],
  };

  test('each required component independently changes the fingerprint; unchanged rows hit', async () => {
    const base = await buildExecutionFingerprint(components);
    const mutations: ExecutionFingerprintComponents[] = [
      { ...components, suiteVersion: '1.2.4' },
      { ...components, scenarioDefinition: { id: 'remux/fingerprint', revision: 3 } },
      { ...components, engine: { ...components.engine, config: { backend: 'main' } } },
      { ...components, browser: { ...components.browser, version: '131.0' } },
      { ...components, supportDecision: { supported: false, status: 'NA_BROWSER' } },
      { ...components, selectedAssets: [{ ...components.selectedAssets[0]!, sha256: '44'.repeat(32) }] },
      { ...components, selectionContract: { ...components.selectionContract as object, evidenceContractDigest: '99'.repeat(32) } },
      { ...components, benchmarkProtocol: { pillar: 'all', warmup: 0, iters: 3, noiseBandPct: 3 } },
      { ...components, corpusChecksum: '55'.repeat(32) },
      { ...components, goldenHashes: [{ ...components.goldenHashes[0]!, sha256: '66'.repeat(32) }] },
    ];
    for (const mutation of mutations) {
      expect((await buildExecutionFingerprint(mutation)).hash).not.toBe(base.hash);
    }
    const typed: ScenarioResult & { executionFingerprint: typeof base } = {
      engineId: 'runner-fake@1.0.0',
      browser,
      scenarioId: 'remux/fingerprint',
      family: 'remux',
      status: 'PASS',
      oracleOutcomes: [{ state: 'VERDICT', oracle: 'playback-smoke', verdict: 'PASS' }],
      executionFingerprint: base,
    };
    expect(isExecutionFingerprintReusable(typed, base)).toBe(true);
    expect(isExecutionFingerprintReusable(typed, await buildExecutionFingerprint(mutations[0]!))).toBe(false);
    const legacy = { ...typed, oracleOutcomes: [{ oracle: 'playback-smoke', pass: true }] } as unknown as ScenarioResult;
    expect(isExecutionFingerprintReusable(legacy, base)).toBe(false);
  });

  test('an unchanged run reuses only after current preflight and skips operation execution', async () => {
    installCorpusFetch();
    let operations = 0;
    const makeEngine = () => baseEngine('remux', {
      supports: async () => ({ supported: true }),
      remux: async () => {
        operations += 1;
        return bytes();
      },
    });
    const scenario = remuxScenario('remux/runner-cache-hit');
    const selection = {
      file: '01.mp4', sha256: '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a',
      isBaked: false, candidateCount: 2, eligiblePoolDigest: '11'.repeat(32),
      executedInputDigest: '22'.repeat(32), candidateIdentity: '33'.repeat(32),
      selectionPolicyVersion: 'canonical-candidate@1',
      selectionAlgorithmId: 'candidate-identity-lexicographic-min-v1',
      evidenceContractDigest: '44'.repeat(32), catalogState: 'ready' as const,
    };
    const env = {
      suiteVersion: '0.1.0',
      engineId: 'runner-fake@1.0.0',
      browser,
      corpusChecksum: 'source-subset',
    } as const;
    const currentEnv = { ...env, corpusChecksum: 'current-superset' } as const;
    const first = await runOne(makeEngine(), scenario, browser, support, {
      pixelBehavior: pixelPass,
      playbackSmoke: async () => true,
      selection,
      env,
    });
    expect(first.status).toBe('PASS');
    expect(operations).toBe(1);
    const second = await runOne(makeEngine(), scenario, browser, support, {
      pixelBehavior: pixelPass,
      playbackSmoke: async () => true,
      selection,
      env: currentEnv,
      cachedResult: {
        ...first,
        cacheReuse: {
          schema: 'media-test/cache-reuse@1',
          sourceKey: 'chromium\0runner-fake@1.0.0\0remux/runner-cache-hit',
          sourceObservationHash: first.executionFingerprint!.hash,
          sourceRunId: 'old-run',
          createdAtIso: '2026-07-15T12:00:00.000Z',
          originalOrigin: 'http://127.0.0.1:4173',
          validationEpoch: 'cache-v2',
          validBecause: 'execution fingerprint matched after current preflight',
          sourceEnvironment: env,
          selectionEnvelope: first.selection,
        },
      },
    });
    expect(second.status).toBe('PASS');
    expect(second.reason).toContain('cached');
    expect(operations).toBe(1);
    expect(second.selection).not.toHaveProperty('runSeed');
    expect(second.selection?.eligiblePoolDigest).toBe(selection.eligiblePoolDigest);
    expect(second.env).toEqual(currentEnv);
    expect(second.cacheReuse?.sourceRunId).toBe('old-run');
    expect(second.cacheReuse?.selectionEnvelope).not.toHaveProperty('runSeed');
  });

  test('phase-mutable post-operation config remains evidence without poisoning preflight reuse', async () => {
    installCorpusFetch();
    let operations = 0;
    const makeEngine = (): MediaEngine => {
      let config: Record<string, unknown> = {
        backend: 'pure-js',
        phase: 'preflight',
        inputBytes: 0,
      };
      const engine = baseEngine('remux', {
        supports: async () => ({ supported: true }),
        remux: async () => {
          operations += 1;
          config = { ...config, phase: 'functional', inputBytes: 8, writeCount: 1 };
          return bytes();
        },
        dispose: async () => {
          config = { ...config, phase: 'disposed', cleanupComplete: true };
        },
      });
      Object.defineProperty(engine, 'configUsed', {
        configurable: true,
        enumerable: true,
        get: () => config,
      });
      return engine;
    };
    const scenario = remuxScenario('remux/phase-mutable-cache-hit');
    const env = { suiteVersion: '0.1.0', engineId: 'runner-fake@1.0.0', browser } as const;
    const options = {
      pixelBehavior: pixelPass,
      playbackSmoke: async () => true,
      env,
    };

    const first = await runOne(makeEngine(), scenario, browser, support, options);
    expect(first.status).toBe('PASS');
    expect(first.env?.configUsed).toMatchObject({
      functional: { phase: 'functional', inputBytes: 8, writeCount: 1 },
    });
    expect(operations).toBe(1);

    const second = await runOne(makeEngine(), scenario, browser, support, {
      ...options,
      cachedResult: {
        ...first,
        cacheReuse: {
          schema: 'media-test/cache-reuse@1',
          sourceKey: 'phase-mutable-row',
          sourceObservationHash: first.executionFingerprint!.hash,
          sourceRunId: 'phase-source-run',
          createdAtIso: '2026-07-16T12:00:00.000Z',
          originalOrigin: 'http://127.0.0.1:4173',
          validationEpoch: 'cache-v3',
          validBecause: 'stable preflight observation key matched',
          sourceEnvironment: first.env,
        },
      },
    });

    expect(second.status).toBe('PASS');
    expect(second.reason).toContain('cached');
    expect(second.executionFingerprint).toEqual(first.executionFingerprint);
    expect(second.cacheReuse?.sourceRunId).toBe('phase-source-run');
    expect(second.cacheReuse?.sourceEnvironment?.configUsed).toMatchObject({
      functional: { phase: 'functional', inputBytes: 8, writeCount: 1 },
    });
    expect(second.env?.configUsed).toMatchObject({ functional: { phase: 'preflight', inputBytes: 0 } });
    expect(operations).toBe(1);
  });
});

describe('REQ-RUN-09 executed pixel behavior', () => {
  test('eligibility follows RGBA round-trip behavior, not browser identity', async () => {
    class MockVideoFrame {
      private readonly source: Uint8Array;
      constructor(source: AllowSharedBufferSource) {
        this.source = new Uint8Array(
          ArrayBuffer.isView(source)
            ? source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength)
            : source.slice(0),
        );
      }
      allocationSize(): number {
        return this.source.byteLength;
      }
      async copyTo(destination: AllowSharedBufferSource): Promise<PlaneLayout[]> {
        new Uint8Array(
          ArrayBuffer.isView(destination) ? destination.buffer : destination,
          ArrayBuffer.isView(destination) ? destination.byteOffset : 0,
          ArrayBuffer.isView(destination) ? destination.byteLength : destination.byteLength,
        ).set(this.source);
        return [];
      }
      close(): void {}
    }
    setGlobal('VideoFrame', MockVideoFrame);
    expect(await runPixelBehaviorSelfTest()).toMatchObject({
      state: 'SUPPORTED',
      reasonCode: 'PIXEL_RGBA_ROUNDTRIP_OK',
    });

    class CorruptVideoFrame extends MockVideoFrame {
      override async copyTo(destination: AllowSharedBufferSource): Promise<PlaneLayout[]> {
        const layouts = await super.copyTo(destination);
        const bytes = new Uint8Array(
          ArrayBuffer.isView(destination) ? destination.buffer : destination,
          ArrayBuffer.isView(destination) ? destination.byteOffset : 0,
          ArrayBuffer.isView(destination) ? destination.byteLength : destination.byteLength,
        );
        bytes[0] = 0;
        return layouts;
      }
    }
    setGlobal('VideoFrame', CorruptVideoFrame);
    expect(await runPixelBehaviorSelfTest()).toMatchObject({
      state: 'UNSUPPORTED',
      reasonCode: 'PIXEL_RGBA_ROUNDTRIP_MISMATCH',
    });
  });
});
