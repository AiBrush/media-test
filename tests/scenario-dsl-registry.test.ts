import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { canonicalizeJson, canonicalJsonSha256, sha256Hex } from '../src/core/canonical-json.ts';
import { SCENARIO_DEFINITION_V2_SCHEMA, RESULTS_V2_JSON_SCHEMA } from '../src/core/dsl-schemas.ts';
import { CONCRETE_OPERATION_PROTOCOL } from '../src/core/engine.ts';
import type { ConcreteOperationRequest } from '../src/core/engine.ts';
import {
  __resetRegistry,
  getScenario,
  listScenarios,
  registerScenario,
  registerScenarios,
  ScenarioRegistryCommitError,
} from '../src/core/registry.ts';
import {
  readResultsEnvelope,
  ResultSchemaError,
  validateScenarioOperationEvidence,
  validateScenarioResultV2,
} from '../src/core/result-schema.ts';
import type { ResultsEnvelopeV2, ScenarioResultV2 } from '../src/core/result-schema.ts';
import {
  buildScenarioExpansionSnapshot,
  compareScenarioExpansionSnapshot,
  serializeScenarioExpansionSnapshot,
} from '../src/core/scenario-expansion.ts';
import {
  SCENARIO_FAMILY_MANIFEST,
  loadCanonicalScenarios,
} from '../src/core/scenario-manifest.ts';
import {
  defineScenario,
  deriveWebCodecsConfigs,
  hashScenarioDefinition,
  matchRequirementCombination,
  reduceExhaustiveStatuses,
  registerScenarioMutationHandler,
  scenarioDefinitionProjection,
  unregisterScenarioMutationHandler,
  validateScenarioBattery,
  validateScenarioDefinitionV2,
} from '../src/core/scenario.ts';
import type {
  OracleOutcome,
  RequirementCombination,
  ResultStatus,
  Scenario,
  ScenarioDefinitionV2,
  ScenarioOperationEvidence,
  ScenarioSpec,
} from '../src/core/scenario.ts';
import { allScenarios } from '../src/scenarios/index.ts';

const ROOT = resolve(import.meta.dir, '..');
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const MUTATION_HANDLER = 'test/truncate-tail';

afterEach(() => {
  __resetRegistry();
  unregisterScenarioMutationHandler(MUTATION_HANDLER);
});

function baseSpec(id = 'probe/dsl-base'): ScenarioSpec {
  return {
    id,
    op: 'probe',
    input: 'h264_1080p_30s.mp4',
    requires: { operations: ['probe'], containersIn: ['mp4'] },
    options: {},
    oracles: ['golden-metadata'],
    metrics: [],
  };
}

function cloneDefinition(scenario = defineScenario(baseSpec())): ScenarioDefinitionV2 {
  return structuredClone(scenarioDefinitionProjection(scenario));
}

function isDeepFrozen(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value !== 'object') return true;
  if (seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  return Object.values(value as Record<string, unknown>).every((entry) => isDeepFrozen(entry, seen));
}

const verdicts = {
  pass: {
    state: 'VERDICT', oracle: 'golden-metadata', verdict: 'PASS', reasonCode: 'METADATA_MATCH',
  },
  diff: {
    state: 'VERDICT', oracle: 'golden-metadata', verdict: 'PASS', reasonCode: 'VALID_CODEC_ALIAS',
  },
  fail: {
    state: 'VERDICT', oracle: 'golden-metadata', verdict: 'FAIL', reasonCode: 'METADATA_INVALID',
  },
  browser: {
    state: 'UNAVAILABLE', oracle: 'golden-metadata', status: 'NA_BROWSER',
    reasonCode: 'WEB_CODECS_CONFIG_UNSUPPORTED', detail: 'exact decoder config is unsupported',
  },
  asset: {
    state: 'UNAVAILABLE', oracle: 'golden-metadata', status: 'NA_ASSET',
    reasonCode: 'GOLDEN_NOT_FOUND', detail: 'golden absent',
  },
} satisfies Record<string, OracleOutcome>;

function resultV2(
  status: ResultStatus = 'PASS',
  oracleOutcomes: OracleOutcome[] = [verdicts.pass],
  overrides: Partial<ScenarioResultV2> = {},
): ScenarioResultV2 {
  return {
    schemaVersion: 2,
    engineId: 'dsl-fixture@1.0.0',
    engineVersion: '1.0.0',
    browser: 'chromium',
    scenarioId: 'probe/dsl-result',
    scenarioRevision: 2,
    definitionHash: SHA_A,
    instance: {
      scenarioId: 'probe/dsl-result', scenarioRevision: 2, definitionHash: SHA_A,
      inputVariantId: 'baked', inputSha256: SHA_B,
    },
    inputVariantId: 'baked',
    inputSha256: SHA_B,
    family: 'probe',
    status,
    oracleOutcomes: oracleOutcomes as ScenarioResultV2['oracleOutcomes'],
    measurement: { state: 'NOT_REQUESTED' },
    ...overrides,
  };
}

function envelope(results: ScenarioResultV2[]): ResultsEnvelopeV2 {
  return {
    schema: 'media-browser-test/results@2',
    generatedAtIso: '2026-07-16T12:00:00.000Z',
    results,
  };
}

function bench() {
  return {
    wall: {
      n: 1, warmup: 0, metric: 'wall' as const, median: 1, p95: 1, mad: 0,
      unit: 'ms', samples: [1],
    },
  };
}

describe('REQ-DSL-01: validated immutable ScenarioDefinitionV2', () => {
  test('the complete canonical battery validates with real asset resolution and zero diagnostics', async () => {
    const manifest = await Bun.file(join(ROOT, 'fixtures/manifest.json')).json() as {
      assets: Array<{ id: string }>;
    };
    const manifestAssets = new Set(manifest.assets.map((asset) => asset.id));
    const diagnostics = validateScenarioBattery(allScenarios, {
      assetExists: (assetId, scenarioId) => manifestAssets.has(assetId) ||
        existsSync(join(ROOT, 'fixtures/media/scenarios', scenarioId, assetId)),
    });
    expect(allScenarios.length).toBeGreaterThan(500);
    expect(diagnostics).toEqual([]);
  });

  test('every formerly omitted invariant names the scenario and exact field before registration', () => {
    const fixtures: Array<{
      name: string;
      path: string;
      mutate: (definition: ScenarioDefinitionV2) => void;
      context?: Parameters<typeof validateScenarioDefinitionV2>[1];
    }> = [
      { name: 'unknown family', path: 'family', mutate: (d) => { d.family = 'unknown' as never; } },
      { name: 'empty input', path: 'inputs', mutate: (d) => { d.inputs = []; } },
      { name: 'operation mismatch', path: 'requires.operations', mutate: (d) => { d.op = 'demux'; } },
      {
        name: 'duplicate token', path: 'requires.operations[1]', mutate: (d) => {
          d.requires.operations = ['probe', 'probe'];
          d.requires.allOfTokens.operations = ['probe', 'probe'];
        },
      },
      { name: 'illegal option', path: 'options.illegal', mutate: (d) => { d.options.illegal = true; } },
      {
        name: 'unusable primary metric', path: 'primaryMetric', mutate: (d) => {
          d.primaryMetric = 'wall';
          d.metrics = [];
        },
      },
      { name: 'non-finite tolerance', path: 'tolerances.ssimMin', mutate: (d) => { d.tolerances.ssimMin = Number.NaN; } },
      { name: 'non-positive timeout', path: 'timeoutMs', mutate: (d) => { d.timeoutMs = 0; } },
      {
        name: 'unknown mutation handler', path: 'mutation.mutationId', mutate: (d) => {
          d.id = 'robustness/dsl-invalid-handler';
          d.family = 'robustness';
          d.oracles = ['graceful-failure'];
          d.mutation = { mutationId: 'missing/handler', parameters: {} };
        },
        context: { mutationHandlerExists: () => false },
      },
      {
        name: 'unresolved asset', path: 'inputs[0].assetId', mutate: (d) => {
          d.inputs[0]!.assetId = 'missing.bin';
        },
        context: { assetExists: () => false },
      },
    ];

    const baseline = defineScenario(baseSpec('probe/registry-baseline'));
    registerScenario(baseline);
    for (const fixture of fixtures) {
      const invalid = cloneDefinition();
      fixture.mutate(invalid);
      const diagnostics = validateScenarioDefinitionV2(invalid, fixture.context);
      expect(diagnostics.some((entry) =>
        entry.scenarioId === invalid.id && entry.path === fixture.path,
      ), fixture.name).toBe(true);
      expect(() => registerScenarios([invalid as unknown as Scenario]), fixture.name).toThrow();
      expect(listScenarios().map((scenario) => scenario.id), fixture.name).toEqual([baseline.id]);
    }
  });

  test('definition input is cloned and the committed snapshot is deeply frozen', () => {
    const inputs = [{ assetId: 'h264_1080p_30s.mp4', variantId: 'source' }];
    const options = { invariant: { label: 'original' } };
    const operations: ScenarioSpec['requires']['operations'] = ['probe'];
    const spec: ScenarioSpec = {
      ...baseSpec('probe/immutable-snapshot'), inputs, options, requires: { operations },
    };
    const scenario = defineScenario(spec);
    registerScenario(scenario);

    inputs[0]!.assetId = 'attacker.mp4';
    options.invariant.label = 'mutated';
    operations[0] = 'demux';

    const stored = getScenario(scenario.id)!;
    expect(stored.inputs[0]).toEqual({ assetId: 'h264_1080p_30s.mp4', variantId: 'source' });
    expect(stored.options).toEqual({ invariant: { label: 'original' } });
    expect(stored.requires.operations).toEqual(['probe']);
    expect(Object.isFrozen(stored)).toBe(true);
    expect(Object.isFrozen(stored.options)).toBe(true);
    expect(Object.isFrozen((stored.options as { invariant: object }).invariant)).toBe(true);
  });

  test('declarative mutation handlers resolve only after validation', () => {
    registerScenarioMutationHandler(MUTATION_HANDLER, (bytes, parameters) =>
      bytes.slice(0, Number(parameters.keepBytes)));
    const scenario = defineScenario({
      id: 'robustness/dsl-mutation', family: 'robustness', op: 'probe', input: 'truncated_ftyp.bin',
      options: {}, requires: { operations: ['probe'] }, oracles: ['graceful-failure'], metrics: [],
      mutation: { mutationId: MUTATION_HANDLER, parameters: { keepBytes: 2 } },
    });
    expect(scenario.mutate?.(new Uint8Array([1, 2, 3, 4]))).toEqual(new Uint8Array([1, 2]));
    expect(scenarioDefinitionProjection(scenario).mutation).toEqual({
      mutationId: MUTATION_HANDLER, parameters: { keepBytes: 2 },
    });
  });
});

describe('REQ-DSL-02: tuple alternatives and concrete WebCodecs recipes', () => {
  const combination: RequirementCombination = {
    operation: 'transcode',
    containersIn: ['mp4'],
    containersOut: ['webm'],
    videoCodecsIn: ['h264'],
    audioCodecsIn: ['aac'],
    videoCodecsOut: ['vp9'],
    audioCodecsOut: ['opus'],
    optionConstraints: { container: 'webm' },
    browserRoles: ['video-decoder', 'video-encoder', 'audio-decoder', 'audio-encoder'],
    browserConfigRecipes: [
      { role: 'video-decoder', source: 'selected-input-video' },
      { role: 'video-encoder', source: 'output-video' },
      { role: 'audio-decoder', source: 'selected-input-audio' },
      { role: 'audio-encoder', source: 'output-audio' },
    ],
  };
  const request: ConcreteOperationRequest = {
    protocol: CONCRETE_OPERATION_PROTOCOL,
    scenarioId: 'transcode/dsl-tuple',
    operation: 'transcode',
    inputs: [{
      id: 'source.mp4', mime: 'video/mp4', container: 'mp4', mutated: false,
      tracks: [
        { type: 'video', codec: 'h264', nativeCodecTag: 'avc1.640028', width: 1920, height: 1080 },
        { type: 'audio', codec: 'aac', nativeCodecTag: 'mp4a.40.2', sampleRate: 48_000, channels: 2 },
      ],
    }],
    output: {
      container: 'webm', videoCodec: 'vp9', audioCodec: 'opus', width: 1280, height: 720,
      frameRate: 30, sampleRate: 48_000, channels: 2,
    },
    options: {
      container: 'webm', video: { bitrate: 2_000_000 }, audio: { bitrate: 128_000 },
    },
  };

  test('a complete concrete tuple selects one conjunctive alternative and rejects a cross-product miss', () => {
    const scenario = defineScenario({
      id: 'transcode/dsl-tuple', op: 'transcode', input: 'source.mp4',
      options: { container: 'webm', video: { bitrate: 2_000_000 }, audio: { bitrate: 128_000 } },
      requires: {
        operations: ['transcode'],
        allOfTokens: {
          operations: ['transcode'], containersIn: ['mp4'], containersOut: ['webm'],
          videoCodecsIn: ['h264'], audioCodecsIn: ['aac'], videoCodecsOut: ['vp9'],
          audioCodecsOut: ['opus'],
        },
        anyOfCombinations: [combination],
      },
      oracles: ['ssim-psnr'], metrics: [],
    });
    expect(matchRequirementCombination(scenario.requires, request)).toEqual(combination);
    expect(matchRequirementCombination(scenario.requires, {
      ...request, output: { ...request.output!, videoCodec: 'av1' },
    })).toBeUndefined();
    expect(matchRequirementCombination(scenario.requires, {
      ...request, options: { ...request.options, container: 'mp4' },
    })).toBeUndefined();
  });

  test('recipes derive exact decoder and encoder configs from selected metadata and output options', () => {
    expect(deriveWebCodecsConfigs(combination, request)).toEqual([
      {
        role: 'video-decoder', trackIndex: 0,
        config: { codec: 'avc1.640028', codedWidth: 1920, codedHeight: 1080 },
      },
      {
        role: 'video-encoder', trackIndex: 0,
        config: { codec: 'vp09.00.10.08', width: 1280, height: 720, framerate: 30, bitrate: 2_000_000 },
      },
      {
        role: 'audio-decoder', trackIndex: 1,
        config: { codec: 'mp4a.40.2', sampleRate: 48_000, numberOfChannels: 2 },
      },
      {
        role: 'audio-encoder', trackIndex: 1,
        config: { codec: 'opus', sampleRate: 48_000, numberOfChannels: 2, bitrate: 128_000 },
      },
    ]);
  });

  test('parser-only alternatives derive no browser gate', () => {
    const parserOnly: RequirementCombination = { operation: 'probe', containersIn: ['mp4'] };
    expect(deriveWebCodecsConfigs(parserOnly, { ...request, operation: 'probe' })).toEqual([]);
  });
});

describe('REQ-DSL-03/06: result schema v2 and explicit v1 migration', () => {
  test('PASS results including recorded representation differences are benchmark eligible while FAIL is correctness-gated', () => {
    expect(validateScenarioResultV2(resultV2('PASS', [verdicts.pass], { bench: bench() }))).toEqual([]);
    expect(validateScenarioResultV2(resultV2('PASS', [verdicts.diff], { bench: bench() }))).toEqual([]);
    expect(validateScenarioResultV2(resultV2('FAIL', [verdicts.fail], { bench: bench() }))
      .some((entry) => entry.code === 'BENCH_CORRECTNESS_GATE')).toBe(true);
  });

  test('a valid v2 envelope round-trips as a frozen, typed value', () => {
    const source = envelope([
      resultV2('PASS', [verdicts.diff], {
        executionFingerprint: { schema: 'media-test/scenario-result@3', hash: SHA_B },
        env: {
          suiteVersion: '2', engineId: 'dsl-fixture@1.0.0', browser: 'chromium',
          pixelBehavior: { state: 'SUPPORTED', reasonCode: 'PIXELS_OK', detail: 'RGBA round trip' },
        },
        startedAtIso: '2026-07-16T12:00:00.000Z', durationMs: 12,
      }),
    ]);
    const parsed = readResultsEnvelope(JSON.parse(JSON.stringify(source)));
    expect(parsed).toEqual(source);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.results[0]!.oracleOutcomes)).toBe(true);
  });

  test('malformed and unknown-major inputs fail before consumption', () => {
    expect(() => readResultsEnvelope({ schema: 'media-browser-test/results@9', results: [] }))
      .toThrow(ResultSchemaError);
    const malformed = envelope([resultV2('PASS', [verdicts.fail])]);
    expect(() => readResultsEnvelope(malformed)).toThrow(/reduce to FAIL, not PASS/);
  });

  test('v1 booleans migrate conservatively and never manufacture DIFF', () => {
    const migrated = readResultsEnvelope({
      schema: 'media-browser-test/results@1',
      generatedAtIso: '2026-07-16T12:00:00.000Z',
      results: [
        {
          engineId: 'legacy@1', browser: 'chromium', scenarioId: 'probe/legacy-pass',
          family: 'probe', status: 'PASS',
          oracleOutcomes: [{ oracle: 'golden-metadata', pass: true }],
        },
        {
          engineId: 'legacy@1', browser: 'chromium', scenarioId: 'probe/legacy-fail',
          family: 'probe', status: 'FAIL',
          oracleOutcomes: [{ oracle: 'golden-metadata', pass: false, detail: 'metadata mismatch' }],
        },
        {
          engineId: 'legacy@1', browser: 'chromium', scenarioId: 'probe/legacy-gap',
          family: 'probe', status: 'FAIL',
          oracleOutcomes: [{ oracle: 'golden-metadata', pass: false, detail: 'golden absent for fixture' }],
        },
      ],
    });
    expect(migrated.results.map((result) => result.status)).toEqual(['PASS', 'FAIL', 'NA_ASSET']);
    expect(migrated.results.flatMap((result) => result.oracleOutcomes)
      .some((outcome) => outcome.state === 'VERDICT' && outcome.verdict === 'DIFF')).toBe(false);
    expect(migrated.results.map((result) => result.instance.inputSha256)).toEqual([null, null, null]);
    expect(migrated.migration).toEqual({
      from: 'media-browser-test/results@1', missingInputDigests: 3,
    });
  });

  test('v1 thin exhaustive rows retain each typed status with transparent synthetic evidence', () => {
    const migrated = readResultsEnvelope({
      schema: 'media-browser-test/results@1', generatedAtIso: '2026-07-16T12:00:00.000Z',
      results: [{
        engineId: 'legacy@1', browser: 'chromium', scenarioId: 'probe/legacy-exhaustive',
        family: 'probe', status: 'FAIL',
        oracleOutcomes: [{ oracle: 'golden-metadata', pass: false, detail: 'one input failed' }],
        exhaustive: [
          { file: '01.mp4', isBaked: false, status: 'PASS' },
          { file: '02.mp4', isBaked: false, status: 'FAIL' },
          { file: '03.mp4', isBaked: false, status: 'NA_BROWSER' },
        ],
      }],
    });
    const result = migrated.results[0]!;
    expect(result.status).toBe('FAIL');
    expect(result.exhaustive?.map((entry) => entry.status)).toEqual(['PASS', 'FAIL', 'NA_BROWSER']);
    expect(result.exhaustive?.map((entry) => entry.oracleOutcomes[0]?.state)).toEqual([
      'VERDICT', 'VERDICT', 'UNAVAILABLE',
    ]);
    expect(result.coverage).toEqual(reduceExhaustiveStatuses(['PASS', 'FAIL', 'NA_BROWSER']).coverage);
  });

  test('exhaustive rows and coverage cannot be detached at a v2 read boundary', () => {
    const reduction = reduceExhaustiveStatuses(['PASS']);
    expect(validateScenarioResultV2(resultV2('PASS', [verdicts.pass], {
      coverage: reduction.coverage,
    })).some((entry) => entry.code === 'EXHAUSTIVE_COVERAGE_PAIR')).toBe(true);
  });

  test('operation evidence has a closed disposition and stage vocabulary', () => {
    const valid: ScenarioOperationEvidence = {
      schema: 'media-test/robustness-operation@1', disposition: 'clean-reject', stage: 'operation',
      nativeError: { name: 'MalformedInputError', code: 'MALFORMED_INPUT_REJECTED' },
    };
    expect(validateScenarioOperationEvidence(valid)).toEqual([]);
    expect(validateScenarioOperationEvidence({ ...valid, disposition: 'sort-of-rejected' })
      .some((entry) => entry.code === 'OPERATION_DISPOSITION')).toBe(true);
    expect(validateScenarioOperationEvidence({ ...valid, stage: 'somewhere' })
      .some((entry) => entry.code === 'OPERATION_STAGE')).toBe(true);
    expect(() => readResultsEnvelope(envelope([
      resultV2('PASS', [verdicts.pass], { operationEvidence: { ...valid, stage: 'somewhere' as never } }),
    ]))).toThrow(ResultSchemaError);
  });

  test('typed candidate sufficiency and full selection identities survive the strict v2 boundary', () => {
    const source = resultV2('NA_ASSET', [verdicts.pass], {
      reason: '[EVIDENCE_NO_SUFFICIENT_SET] required golden missing',
      selection: {
        file: '01.mp4', sha256: SHA_A, isBaked: false, candidateCount: 2,
        eligiblePoolDigest: SHA_B, executedInputDigest: 'c'.repeat(64), candidateIdentity: 'd'.repeat(64),
        selectionPolicyVersion: 'canonical-candidate@1',
        selectionAlgorithmId: 'candidate-identity-lexicographic-min-v1',
        evidenceContractDigest: 'f'.repeat(64), catalogState: 'ready',
      },
      candidateEvidence: {
        schema: 'media-test/candidate-evidence-result@1', contractDigest: 'f'.repeat(64),
        status: 'NA_ASSET', reasonCode: 'EVIDENCE_NO_SUFFICIENT_SET',
        required: ['golden-metadata'], applied: ['playback-smoke'],
        unavailable: [{ oracle: 'golden-metadata', status: 'NA_ASSET', reasonCode: 'GOLDEN_NOT_FOUND' }],
        sufficientSurvivorOracles: [], sufficient: false,
      },
      cacheReuse: {
        schema: 'media-test/cache-reuse@1', sourceKey: 'chromium\0engine\0scenario',
        sourceObservationHash: '1'.repeat(64), sourceRunId: 'prior-run',
        createdAtIso: '2026-07-15T12:00:00.000Z', originalOrigin: 'http://127.0.0.1:4173',
        validationEpoch: 'cache-v2', validBecause: 'execution fingerprint matched',
        sourceEnvironment: {
          suiteVersion: '0.1.0', engineId: 'dsl-fixture@1.0.0', browser: 'chromium',
        },
        selectionEnvelope: {
          file: '01.mp4', sha256: SHA_A, isBaked: false, candidateCount: 2,
        },
      },
    });
    const parsed = readResultsEnvelope(envelope([source])).results[0]!;
    expect(parsed.selection).toEqual(source.selection);
    expect(parsed.candidateEvidence).toEqual(source.candidateEvidence);
    expect(parsed.cacheReuse).toEqual(source.cacheReuse);
    expect(validateScenarioResultV2({
      ...source,
      selection: { ...source.selection!, runSeed: 'removed-field' } as never,
    }).some((entry) => entry.code === 'SCHEMA_ADDITIONAL_PROPERTY')).toBe(true);
    expect(validateScenarioResultV2({
      ...source,
      candidateEvidence: { ...source.candidateEvidence!, sufficient: 'yes' },
    }).some((entry) => entry.code === 'CANDIDATE_EVIDENCE_SUFFICIENT')).toBe(true);

    const sufficientEvidence = {
      ...source.candidateEvidence!,
      status: 'PASS' as const,
      reasonCode: 'EVIDENCE_SUFFICIENT_PASS',
      required: ['golden-metadata' as const],
      applied: ['golden-metadata' as const],
      unavailable: [],
      sufficientSurvivorOracles: ['golden-metadata' as const],
      sufficient: true,
    };
    const independentStreamingFailure = resultV2('FAIL', [verdicts.fail], {
      candidateEvidence: sufficientEvidence,
    });
    expect(validateScenarioResultV2(independentStreamingFailure)
      .some((entry) => entry.code === 'CANDIDATE_EVIDENCE_RESULT_MISMATCH')).toBe(false);
    expect(readResultsEnvelope(envelope([independentStreamingFailure])).results[0]?.status).toBe('FAIL');
    expect(validateScenarioResultV2({
      ...independentStreamingFailure,
      status: 'PASS',
    }).some((entry) => entry.code === 'CANDIDATE_EVIDENCE_RESULT_MISMATCH')).toBe(true);
  });
});

describe('REQ-DSL-04: canonical identity', () => {
  test('SHA-256 and RFC-style canonicalization match stable known vectors', () => {
    expect(sha256Hex(new Uint8Array())).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(canonicalizeJson({ z: 1, a: { y: -0, x: 1e-7 } })).toBe(
      '{"a":{"x":1e-7,"y":0},"z":1}');
    expect(canonicalJsonSha256({ b: 2, a: 1 })).toBe(canonicalJsonSha256({ a: 1, b: 2 }));
    expect(() => canonicalizeJson({ invalid: '\ud800' })).toThrow(/lone high surrogate/);
  });

  test('property order is identity-neutral while semantics and revision change the hash', () => {
    const orderedA = defineScenario({
      ...baseSpec('probe/canonical-hash'),
      options: { invariant: { beta: 2, alpha: 1 } },
    });
    const orderedB = defineScenario({
      ...baseSpec('probe/canonical-hash'),
      options: { invariant: { alpha: 1, beta: 2 } },
    });
    const semanticChange = defineScenario({
      ...baseSpec('probe/canonical-hash'),
      options: { invariant: { alpha: 1, beta: 3 } },
    });
    const revisionChange = defineScenario({
      ...baseSpec('probe/canonical-hash'), revision: 2,
      options: { invariant: { alpha: 1, beta: 2 } },
    });
    expect(orderedA.definitionHash).toBe(orderedB.definitionHash);
    expect(semanticChange.definitionHash).not.toBe(orderedA.definitionHash);
    expect(revisionChange.definitionHash).not.toBe(orderedA.definitionHash);
    expect(hashScenarioDefinition(orderedA)).toBe(orderedA.definitionHash);
  });
});

describe('REQ-DSL-05: one canonical manifest and atomic registration', () => {
  test('the complete 592-scenario battery passes the production hash/freeze registration gate', () => {
    expect(allScenarios).toHaveLength(592);
    registerScenarios(allScenarios);
    const registered = listScenarios();
    expect(registered).toHaveLength(592);
    expect(registered.map((scenario) => scenario.id).sort()).toEqual(
      [...allScenarios].map((scenario) => scenario.id).sort(),
    );
    for (const scenario of registered) {
      expect(hashScenarioDefinition(scenarioDefinitionProjection(scenario)), scenario.id)
        .toBe(scenario.definitionHash);
      expect(isDeepFrozen(scenario), scenario.id).toBe(true);
    }
  });

  test('eager and lazy consumers produce byte-identical ordered identities', async () => {
    const lazy = await loadCanonicalScenarios();
    expect(lazy.map(({ id, definitionHash }) => ({ id, definitionHash }))).toEqual(
      allScenarios.map(({ id, definitionHash }) => ({ id, definitionHash })),
    );
    const reversedSourceOrder = await loadCanonicalScenarios([...SCENARIO_FAMILY_MANIFEST].reverse());
    expect(reversedSourceOrder.map(({ id, definitionHash }) => ({ id, definitionHash }))).toEqual(
      lazy.map(({ id, definitionHash }) => ({ id, definitionHash })),
    );
    const robustness = lazy.findIndex((scenario) => scenario.family === 'robustness');
    const performance = lazy.findIndex((scenario) => scenario.family === 'performance');
    expect(robustness).toBeGreaterThanOrEqual(0);
    expect(robustness).toBeLessThan(performance);
  });

  test('an invalid staged member leaves the registry unchanged and a corrected retry succeeds', () => {
    const baseline = defineScenario(baseSpec('probe/atomic-baseline'));
    const validA = defineScenario(baseSpec('probe/atomic-a'));
    const validB = defineScenario(baseSpec('probe/atomic-b'));
    registerScenario(baseline);
    const invalidB = cloneDefinition(validB);
    invalidB.timeoutMs = 0;

    let thrown: unknown;
    try {
      registerScenarios([validA, invalidB as unknown as Scenario]);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ScenarioRegistryCommitError);
    expect(thrown).toMatchObject({ family: 'probe', member: 'probe/atomic-b' });
    expect(listScenarios().map((scenario) => scenario.id)).toEqual([baseline.id]);

    registerScenarios([validA, validB]);
    expect(listScenarios().map((scenario) => scenario.id)).toEqual([
      'probe/atomic-a', 'probe/atomic-b', 'probe/atomic-baseline',
    ]);
  });

  test('a duplicate in one batch is atomic and reports the exact family/member', () => {
    const first = defineScenario(baseSpec('probe/duplicate-member'));
    expect(() => registerScenarios([first, first])).toThrow(/family 'probe'.*member 'probe\/duplicate-member'/);
    expect(listScenarios()).toEqual([]);
  });
});

describe('REQ-DSL-07: explicit input identity and partial coverage', () => {
  const operationEvidence: ScenarioOperationEvidence = {
    schema: 'media-test/robustness-operation@1', disposition: 'clean-reject', stage: 'operation',
    nativeError: { name: 'MalformedInputError', code: 'MALFORMED_INPUT_REJECTED' },
  };

  test('mixed input statuses reduce deterministically with first-class coverage grades', () => {
    const cases: Array<{
      statuses: ResultStatus[];
      status: ResultStatus;
      grade: 'full' | 'partial' | 'none';
      valid: number;
    }> = [
      { statuses: ['PASS', 'FAIL'], status: 'FAIL', grade: 'partial', valid: 1 },
      { statuses: ['PASS', 'PASS'], status: 'PASS', grade: 'full', valid: 2 },
      { statuses: ['PASS', 'NA_ENGINE'], status: 'PASS', grade: 'full', valid: 1 },
      { statuses: ['NA_ENGINE', 'NA_ENGINE'], status: 'NA_ENGINE', grade: 'none', valid: 0 },
      { statuses: ['NA_BROWSER', 'PASS'], status: 'PASS', grade: 'partial', valid: 1 },
      { statuses: ['NA_BROWSER', 'NA_ASSET'], status: 'NA_BROWSER', grade: 'none', valid: 0 },
    ];
    for (const fixture of cases) {
      const forward = reduceExhaustiveStatuses(fixture.statuses);
      const reverse = reduceExhaustiveStatuses([...fixture.statuses].reverse());
      expect(forward).toEqual(reverse);
      expect(forward.status).toBe(fixture.status);
      expect(forward.coverage.grade).toBe(fixture.grade);
      expect(forward.coverage.valid).toBe(fixture.valid);
    }
  });

  test('exhaustive v2 round-trip retains every digest, outcome, availability, and operation evidence', () => {
    const statuses: ResultStatus[] = ['PASS', 'FAIL'];
    const reduction = reduceExhaustiveStatuses(statuses);
    const source = resultV2('FAIL', [verdicts.pass, verdicts.fail], {
      reason: 'coverage partial 1/2; 01.mp4(PASS); 02.mp4(FAIL)',
      exhaustive: [
        {
          file: '01.mp4', sha256: SHA_A, isBaked: false, status: 'PASS',
          oracleOutcomes: [verdicts.pass], measurement: { state: 'NOT_REQUESTED' },
          operationEvidence, executed: true,
        },
        {
          file: '02.mp4', sha256: SHA_B, isBaked: false, status: 'FAIL',
          reason: 'invalid metadata', oracleOutcomes: [verdicts.fail],
          measurement: { state: 'NOT_REQUESTED' }, operationEvidence, executed: true,
        },
      ],
      coverage: reduction.coverage,
    });
    const parsed = readResultsEnvelope(envelope([source]));
    expect(parsed.results[0]!.exhaustive).toEqual(source.exhaustive);
    expect(parsed.results[0]!.coverage).toEqual(reduction.coverage);
    expect(parsed.results[0]!.status).toBe('FAIL');
    expect(parsed.results[0]!.status).not.toBe('ERROR');
    expect(parsed.results[0]!.reason).toContain('01.mp4(PASS)');
    expect(parsed.results[0]!.reason).toContain('02.mp4(FAIL)');
  });

  test('intrinsically unsupported variants preserve full executable coverage at the strict v2 boundary', () => {
    const reduction = reduceExhaustiveStatuses(['PASS', 'NA_ENGINE']);
    const source = resultV2('PASS', [verdicts.pass], {
      reason: 'coverage full 1/1 executable variants; 01.mp4(PASS); attachment.mov(NA_ENGINE)',
      exhaustive: [
        {
          file: '01.mp4', sha256: SHA_A, isBaked: false, status: 'PASS',
          oracleOutcomes: [verdicts.pass], measurement: { state: 'NOT_REQUESTED' },
          operationEvidence, executed: true,
        },
        {
          file: 'attachment.mov', sha256: SHA_B, isBaked: false, status: 'NA_ENGINE',
          reason: '[MEDIABUNNY_TRACK_TYPE_UNSUPPORTED] attachment tracks are outside the demux API',
          oracleOutcomes: [], measurement: { state: 'NOT_REQUESTED' },
          operationEvidence, executed: true,
        },
      ],
      coverage: reduction.coverage,
    });

    const parsed = readResultsEnvelope(envelope([source]));
    expect(parsed.results[0]!.status).toBe('PASS');
    expect(parsed.results[0]!.coverage).toEqual(reduction.coverage);
    expect(parsed.results[0]!.coverage?.grade).toBe('full');
    expect(parsed.results[0]!.coverage?.counts.naEngine).toBe(1);
  });
});

describe('REQ-DSL-08: explicit expansion snapshot', () => {
  test('the committed expansion identity matches and is independent of source array order', async () => {
    const expected = await Bun.file(join(ROOT, 'schemas/scenario-expansion.snapshot.json')).json();
    expect(compareScenarioExpansionSnapshot(expected, allScenarios)).toEqual({ matches: true });
    expect(serializeScenarioExpansionSnapshot(buildScenarioExpansionSnapshot([...allScenarios].reverse())))
      .toBe(serializeScenarioExpansionSnapshot(buildScenarioExpansionSnapshot(allScenarios)));
  });

  test('adding or removing a builder row changes the checked snapshot', async () => {
    const expected = await Bun.file(join(ROOT, 'schemas/scenario-expansion.snapshot.json')).json();
    expect(compareScenarioExpansionSnapshot(expected, allScenarios.slice(1)).matches).toBe(false);
    const added = defineScenario(baseSpec('probe/expansion-added-row'));
    expect(compareScenarioExpansionSnapshot(expected, [...allScenarios, added]).matches).toBe(false);
  });

  test('published Draft 2020-12 schema files exactly match their source constants', async () => {
    const scenarioSchema = await Bun.file(join(ROOT, 'schemas/scenario-definition-v2.schema.json')).json();
    const resultsSchema = await Bun.file(join(ROOT, 'schemas/results-v2.schema.json')).json();
    expect(scenarioSchema).toEqual(SCENARIO_DEFINITION_V2_SCHEMA);
    expect(resultsSchema).toEqual(RESULTS_V2_JSON_SCHEMA);
    expect(scenarioSchema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(resultsSchema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
  });
});
