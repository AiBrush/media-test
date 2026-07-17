import { describe, expect, test } from 'bun:test';

import type { OracleOutcome, Scenario } from '../src/core/scenario.ts';
import {
  DECRYPT_METAMORPHIC_INVARIANT,
  ROBUSTNESS_VARIANT_SELECTION_CONTRACT,
  SELECTION_ALGORITHM_ID,
  SELECTION_POLICY_VERSION,
  assessCandidateEligibility,
  assessRobustnessVariantEligibility,
  buildCandidateEvidencePlan,
  buildSelectionManifest,
  candidateScore,
  candidatesForRun,
  computeCorpusChecksum,
  computeEligiblePoolsDigest,
  computeObservationKey,
  evaluateCandidateEvidence,
  exhaustiveSelectionCacheTag,
  findScenarioPool,
  parseBakedCorpusManifest,
  parseScenarioSourceCatalog,
  reEnvelopeObservation,
  selectCandidateFromPool,
  selectForRun,
  selectionCacheTag,
  sha256Hex,
  withVerifiedContent,
  type CandidateEvidenceDeclaration,
  type FrozenSelectionManifest,
  type ScenarioCandidatePool,
  type ScenarioSelection,
  type ScenarioSourceRow,
  type SelectionCandidateManifest,
  type SourceFileRecord,
  type ValidatedBakedCorpusManifest,
  type ValidatedScenarioSourceCatalog,
} from '../src/core/media-selection.ts';

const encoder = new TextEncoder();
const bytes = (text: string): Uint8Array => encoder.encode(text);

function scenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: 'probe/selection',
    family: 'probe',
    op: 'probe',
    input: 'baked.mp4',
    options: {},
    requires: { operations: ['probe'], containersIn: ['mp4'] },
    oracles: ['golden-metadata'],
    metrics: [],
    ...overrides,
  } as Scenario;
}

function sourceFile(name: string, contents: string, overrides: Partial<SourceFileRecord> = {}): SourceFileRecord {
  const data = bytes(contents);
  return {
    file: name,
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    sha256: sha256Hex(data),
    sizeBytes: data.byteLength,
    provider: 'test-provider',
    sourcePageUrl: 'https://example.test/source',
    downloadUrl: `https://example.test/${name}`,
    probedWith: 'test-probe@1',
    ...overrides,
  };
}

function row(files: SourceFileRecord[], overrides: Partial<ScenarioSourceRow> = {}): ScenarioSourceRow {
  return {
    scenarioId: 'probe/selection',
    class: 'REAL',
    requires: {
      container: 'mp4',
      video: true,
      videoCodecs: ['h264'],
      audioCodecs: ['aac'],
    },
    files,
    ...overrides,
  };
}

function catalogFromRows(rows: readonly ScenarioSourceRow[]): ValidatedScenarioSourceCatalog {
  const parsed = parseScenarioSourceCatalog(rows.map((entry) => JSON.stringify(entry)).join('\n'));
  if (parsed.state !== 'VALID') throw new Error(parsed.issues.map((issue) => issue.detail).join('; '));
  return parsed.catalog;
}

function bakedManifest(
  assets: Array<{ id: string; contents: string; source?: string }> = [{ id: 'baked.mp4', contents: 'baked bytes' }],
): ValidatedBakedCorpusManifest {
  const parsed = parseBakedCorpusManifest({
    suiteCorpusVersion: 'test-v1',
    assets: assets.map((asset) => {
      const data = bytes(asset.contents);
      return {
        id: asset.id,
        sha256: sha256Hex(data),
        sizeBytes: data.byteLength,
        source: asset.source ?? 'generated',
        family: 'test',
        container: 'mp4',
        codecs: ['h264', 'aac'],
        sizeBucket: 'micro',
        genMethod: 'test fixture generator@1',
      };
    }),
  });
  if (parsed.state !== 'VALID') throw new Error(parsed.issues.map((issue) => issue.detail).join('; '));
  return parsed.manifest;
}

function manifestFor(
  files: SourceFileRecord[],
  options: {
    scenario?: Scenario;
    row?: ScenarioSourceRow;
    baked?: ValidatedBakedCorpusManifest;
    scenarioContractDigest?: string;
  } = {},
): FrozenSelectionManifest {
  const selectedScenario = options.scenario ?? scenario();
  return buildSelectionManifest({
    scenarios: [selectedScenario],
    catalog: catalogFromRows([options.row ?? row(files)]),
    bakedManifest: options.baked ?? bakedManifest(),
    ...(options.scenarioContractDigest
      ? { scenarioContractDigests: { [selectedScenario.id]: options.scenarioContractDigest } }
      : {}),
  });
}

function poolFor(files: SourceFileRecord[], options: Parameters<typeof manifestFor>[1] = {}): ScenarioCandidatePool {
  const selectedScenario = options.scenario ?? scenario();
  const pool = findScenarioPool(manifestFor(files, { ...options, scenario: selectedScenario }), selectedScenario.id);
  if (!pool) throw new Error('pool missing');
  return pool;
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length < 2) return [[...items]];
  return items.flatMap((head, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((tail) => [head, ...tail]));
}

describe('REQ-SEL-01 canonical validated candidate manifest', () => {
  test('row, file, and object-key order leave catalog/manifest identity unchanged', () => {
    const first = row([sourceFile('01.mp4', 'one'), sourceFile('02.mp4', 'two')]);
    const second = row([sourceFile('03.mp4', 'three')], { scenarioId: 'probe/second' });
    const textA = `${JSON.stringify(first)}\n${JSON.stringify(second)}`;
    const reversedFirst = {
      files: [...first.files].reverse().map((file) => ({
        sizeBytes: file.sizeBytes,
        sha256: file.sha256,
        audioCodecs: file.audioCodecs,
        videoCodecs: file.videoCodecs,
        container: file.container,
        file: file.file,
        probedWith: file.probedWith,
        downloadUrl: file.downloadUrl,
        sourcePageUrl: file.sourcePageUrl,
        provider: file.provider,
      })),
      class: first.class,
      requires: {
        audioCodecs: first.requires.audioCodecs,
        videoCodecs: first.requires.videoCodecs,
        video: first.requires.video,
        container: first.requires.container,
      },
      scenarioId: first.scenarioId,
    };
    const textB = `${JSON.stringify(second)}\n${JSON.stringify(reversedFirst)}`;
    const a = parseScenarioSourceCatalog(textA);
    const b = parseScenarioSourceCatalog(textB);
    expect(a.state).toBe('VALID');
    expect(b.state).toBe('VALID');
    if (a.state !== 'VALID' || b.state !== 'VALID') return;
    expect(a.catalog.catalogSha256).toBe(b.catalog.catalogSha256);

    const manifestA = buildSelectionManifest({ scenarios: [scenario()], catalog: a.catalog, bakedManifest: bakedManifest() });
    const manifestB = buildSelectionManifest({ scenarios: [scenario()], catalog: b.catalog, bakedManifest: bakedManifest() });
    expect(manifestA.manifestDigest).toBe(manifestB.manifestDigest);
    expect(manifestA.pools[0]?.candidates.map((candidate) => candidate.candidateIdentity)).toEqual(
      manifestB.pools[0]?.candidates.map((candidate) => candidate.candidateIdentity),
    );
    expect(Object.isFrozen(manifestA)).toBe(true);
    expect(Object.isFrozen(manifestA.pools[0]?.candidates)).toBe(true);
    expect(() => (manifestA.pools as unknown as unknown[]).push({})).toThrow();
  });

  test('duplicate ids, paths, and in-scenario content digests are stable fatal diagnostics', () => {
    const duplicate = sourceFile('01.mp4', 'same');
    const bad = row([
      duplicate,
      { ...duplicate },
      { ...sourceFile('03.mp4', 'other'), sha256: duplicate.sha256 },
    ]);
    const parsed = parseScenarioSourceCatalog(`${JSON.stringify(bad)}\n${JSON.stringify(bad)}`);
    expect(parsed.state).toBe('INVALID');
    expect(parsed.issues.map((issue) => issue.reasonCode)).toEqual(expect.arrayContaining([
      'CATALOG_DUPLICATE_SCENARIO_ID',
      'CATALOG_DUPLICATE_FILE_PATH',
      'CATALOG_DUPLICATE_CONTENT_DIGEST',
    ]));
  });

  test('malformed class/path/hash/size fields fail rather than collapsing to an empty catalog', () => {
    const malformed = {
      ...row([sourceFile('01.mp4', 'one')]),
      class: 'MYSTERY',
      files: [{
        ...sourceFile('01.mp4', 'one'),
        file: '../escape.mp4',
        sha256: 'ABC',
        sizeBytes: Number.NaN,
        surprise: true,
      }],
    };
    const parsed = parseScenarioSourceCatalog(JSON.stringify(malformed));
    expect(parsed.state).toBe('INVALID');
    expect(parsed.issues.map((issue) => issue.reasonCode)).toEqual(expect.arrayContaining([
      'CATALOG_CLASS_INVALID',
      'CATALOG_PATH_NOT_NORMALIZED',
      'CATALOG_SHA256_INVALID',
      'CATALOG_SIZE_INVALID',
      'CATALOG_UNKNOWN_FIELD',
    ]));
  });

  test('explicit fallback retains its reason and cryptographic baked corpus identity', () => {
    const baked = bakedManifest();
    const manifest = buildSelectionManifest({
      scenarios: [scenario()],
      bakedManifest: baked,
      catalogFallbackReason: { reasonCode: 'CATALOG_HTTP_ERROR', detail: 'HTTP 404' },
    });
    expect(manifest.catalogState).toBe('fallback');
    expect(manifest.catalogReason).toEqual({ reasonCode: 'CATALOG_HTTP_ERROR', detail: 'HTTP 404' });
    expect(manifest.bakedCorpusDigest).toBe(baked.manifestSha256);
    expect(manifest.pools[0]?.eligible).toBe(1);
    expect(manifest.pools[0]?.candidates[0]?.provenance[0]?.entity.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('REQ-SEL-02 exact byte identity before engine use', () => {
  test('an empty verified pool returns eligible=0 without scoring or execution', () => {
    const emptyBaked = bakedManifest([]);
    const emptyCatalog = catalogFromRows([row([], { class: 'SYNTHETIC' })]);
    const manifest = buildSelectionManifest({
      scenarios: [scenario()],
      catalog: emptyCatalog,
      bakedManifest: emptyBaked,
    });
    const pool = manifest.pools[0]!;
    expect(pool.eligible).toBe(0);
    expect(selectCandidateFromPool(pool, { seed: 'must-not-draw' })).toMatchObject({
      state: 'EMPTY',
      eligible: 0,
      issue: { reasonCode: 'CORPUS_NO_VERIFIED_CANDIDATE', status: 'NA_ASSET' },
    });
  });

  test('verified bytes reach the callback, while truncation and replacement never do', async () => {
    const expected = bytes('exact candidate bytes');
    const identity = { logicalPath: 'scenarios/probe/selection/01.mp4', sha256: sha256Hex(expected), sizeBytes: expected.byteLength };
    let engineCalls = 0;
    const valid = await withVerifiedContent([identity], async () => expected, (verified) => {
      engineCalls += 1;
      expect(verified[0]?.bytes).toBe(expected);
      return 'ran';
    });
    expect(valid).toMatchObject({ state: 'VERIFIED', eligible: 1, value: 'ran' });
    expect(engineCalls).toBe(1);

    const truncated = await withVerifiedContent([identity], async () => expected.subarray(0, expected.length - 1), () => {
      engineCalls += 1;
    });
    expect(truncated).toMatchObject({ state: 'NA_ASSET', eligible: 0 });
    if (truncated.state === 'NA_ASSET') expect(truncated.issues[0]?.reasonCode).toBe('CORPUS_SIZE_MISMATCH');

    const replacement = bytes('changed candidate byt');
    expect(replacement.byteLength).toBe(expected.byteLength);
    const replaced = await withVerifiedContent([identity], async () => replacement, () => {
      engineCalls += 1;
    });
    expect(replaced).toMatchObject({ state: 'NA_ASSET', eligible: 0 });
    if (replaced.state === 'NA_ASSET') expect(replaced.issues[0]?.reasonCode).toBe('CORPUS_DIGEST_MISMATCH');
    expect(engineCalls).toBe(1);
  });

  test('one repeated corrupt identity produces one engine-independent corpus issue', async () => {
    const expected = bytes('expected');
    const identity = { logicalPath: 'scenarios/probe/selection/01.mp4', sha256: sha256Hex(expected), sizeBytes: expected.byteLength };
    let fetches = 0;
    const result = await withVerifiedContent([identity, identity], async () => {
      fetches += 1;
      return bytes('replaced');
    }, () => {
      throw new Error('must not execute');
    });
    expect(result.state).toBe('NA_ASSET');
    expect(fetches).toBe(1);
    if (result.state === 'NA_ASSET') expect(result.issues).toHaveLength(1);
  });
});

describe('REQ-SEL-03/05 order-independent HRW scoring, replay, and unique-content fairness', () => {
  const files = [sourceFile('01.mp4', 'one'), sourceFile('02.mp4', 'two'), sourceFile('03.mp4', 'three')];

  test('policy has a fixed golden vector and selection is invariant under every file permutation', () => {
    expect(sha256Hex(new Uint8Array())).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex(bytes('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const digest = files[0]!.sha256;
    expect(candidateScore('golden-seed', 'probe/selection', digest)).toBe(
      '424114bfc523c3af50e7b558fe339938bf23fe376a893fe3916b9cfa6b0e8d92',
    );
    const picks = new Set<string>();
    for (const order of permutations(files)) {
      const pool = poolFor(order);
      const decision = selectCandidateFromPool(pool, { seed: 'permutation-seed' });
      expect(decision.state).toBe('SELECTED');
      if (decision.state === 'SELECTED') picks.add(decision.candidate.contentDigest);
    }
    expect(picks.size).toBe(1);
  });

  test('adding/removing candidates changes a pick only when HRW set membership requires it', () => {
    const base = poolFor(files.slice(0, 2));
    const added = poolFor(files);
    for (let i = 0; i < 500; i++) {
      const seed = `minimal-churn-${i}`;
      const before = selectCandidateFromPool(base, { seed });
      const after = selectCandidateFromPool(added, { seed });
      if (before.state !== 'SELECTED' || after.state !== 'SELECTED') throw new Error('unexpected empty pool');
      if (after.candidate.contentDigest !== files[2]!.sha256) {
        expect(after.candidate.contentDigest).toBe(before.candidate.contentDigest);
      }
    }
  });

  test('seed replay rejects pool drift; recorded full candidate replays explicitly after drift', () => {
    const original = poolFor(files.slice(0, 2));
    const selected = selectCandidateFromPool(original, { seed: 'failing-seed' });
    if (selected.state !== 'SELECTED') throw new Error('selection missing');
    const changed = poolFor(files);
    expect(selectCandidateFromPool(changed, {
      seed: 'failing-seed',
      expectedPoolDigest: original.eligiblePoolDigest,
    })).toMatchObject({ state: 'POOL_MISMATCH', reasonCode: 'SELECTION_POOL_DIGEST_MISMATCH' });
    const replay = selectCandidateFromPool(changed, {
      seed: 'different-seed-is-irrelevant-to-explicit-input',
      expectedPoolDigest: original.eligiblePoolDigest,
      replayCandidate: selected.candidate,
    });
    expect(replay).toMatchObject({ state: 'SELECTED', replay: 'explicit' });
    if (replay.state === 'SELECTED') expect(replay.candidate.candidateIdentity).toBe(selected.candidate.candidateIdentity);
  });

  test('uniform seed sweep stays inside the predeclared 10% band and discloses equal weights', () => {
    const pool = poolFor(files);
    const counts = new Map(pool.candidates.map((candidate) => [candidate.candidateIdentity, 0]));
    const draws = 8_000;
    for (let i = 0; i < draws; i++) {
      const decision = selectCandidateFromPool(pool, { seed: `uniform-${i}` });
      if (decision.state !== 'SELECTED') throw new Error('selection missing');
      counts.set(decision.candidate.candidateIdentity, counts.get(decision.candidate.candidateIdentity)! + 1);
    }
    const expected = draws / pool.candidates.length;
    for (const count of counts.values()) expect(Math.abs(count - expected) / expected).toBeLessThan(0.10);
    expect(pool.candidates.every((candidate) =>
      candidate.probability.numerator === 1 &&
      candidate.probability.denominator === pool.candidates.length &&
      candidate.probability.weight === 1)).toBe(true);
  });

  test('duplicate content is rejected, never admitted as extra probability mass', () => {
    const duplicate = sourceFile('01.mp4', 'same');
    const parsed = parseScenarioSourceCatalog(JSON.stringify(row([duplicate, { ...duplicate, file: '02.mp4' }])));
    expect(parsed.state).toBe('INVALID');
    expect(parsed.issues.some((issue) => issue.reasonCode === 'CATALOG_DUPLICATE_CONTENT_DIGEST')).toBe(true);

    const bakedDuplicatePool = poolFor([sourceFile('01.mp4', 'same as baked')], {
      baked: bakedManifest([{ id: 'baked.mp4', contents: 'same as baked' }]),
    });
    expect(bakedDuplicatePool.eligible).toBe(1);
    expect(bakedDuplicatePool.candidates[0]?.kind).toBe('baked');
    expect(bakedDuplicatePool.rejections).toContainEqual(expect.objectContaining({
      selectedFile: '01.mp4',
      reasonCode: 'CANDIDATE_DUPLICATE_CONTENT',
    }));
  });
});

describe('REQ-SEL-04 typed oracle-evidence sufficiency', () => {
  const selectedScenario = scenario({ oracles: ['golden-metadata', 'playback-smoke'] });
  const sourceSha256 = sha256Hex('source');
  const declaration: CandidateEvidenceDeclaration = {
    sourceSha256,
    available: ['BROWSER_CAPABILITY'],
    requiredOracles: ['golden-metadata'],
    sufficientOracleSets: [['golden-metadata']],
  };
  const plan = buildCandidateEvidencePlan(selectedScenario, sourceSha256, declaration);

  test('required-missing plus weak supplemental PASS is NA_ASSET independent of detail wording/order', () => {
    const outcomes: OracleOutcome[] = [
      { state: 'UNAVAILABLE', oracle: 'golden-metadata', status: 'NA_ASSET', reasonCode: 'GOLDEN_MISSING', detail: 'wording A' },
      { state: 'VERDICT', oracle: 'playback-smoke', verdict: 'PASS', reasonCode: 'PLAYBACK_OK', detail: 'played' },
    ];
    const first = evaluateCandidateEvidence(plan, outcomes);
    const second = evaluateCandidateEvidence(plan, [
      { ...outcomes[1]!, detail: 'completely changed prose' },
      { ...outcomes[0]!, detail: 'wording B' },
    ]);
    expect(first).toMatchObject({ status: 'NA_ASSET', sufficient: false, reasonCode: 'EVIDENCE_NO_SUFFICIENT_SET' });
    expect(second.status).toBe(first.status);
    expect(first.required).toEqual(['golden-metadata']);
    expect(first.applied).toEqual(['playback-smoke']);
    expect(first.unavailable).toEqual([{ oracle: 'golden-metadata', status: 'NA_ASSET', reasonCode: 'GOLDEN_MISSING' }]);
  });

  test('a declared golden-free survivor set carries PASS while unavailable evidence stays visible', () => {
    const survivor = buildCandidateEvidencePlan(selectedScenario, sourceSha256, {
      sourceSha256,
      available: ['BROWSER_CAPABILITY'],
      requiredOracles: ['playback-smoke'],
      sufficientOracleSets: [['playback-smoke']],
    });
    const evaluated = evaluateCandidateEvidence(survivor, [
      { state: 'UNAVAILABLE', oracle: 'golden-metadata', status: 'NA_ASSET', reasonCode: 'GOLDEN_MISSING', detail: 'missing' },
      { state: 'VERDICT', oracle: 'playback-smoke', verdict: 'PASS', reasonCode: 'PLAYBACK_OK' },
    ]);
    expect(evaluated).toMatchObject({ status: 'PASS', sufficient: true, sufficientSurvivorOracles: ['playback-smoke'] });
    expect(evaluated.unavailable).toHaveLength(1);
    expect(plan.contractDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(plan.requirements.find((item) => item.oracle === 'golden-metadata')?.needs[0]).toEqual({
      kind: 'SOURCE_GOLDEN',
      sourceSha256,
    });
  });
});

describe('REQ-SEL-06 fail-closed source/base-bound CENC eligibility', () => {
  const baseSha256 = sha256Hex('clear base');
  const encrypted = sourceFile('01.mp4', 'encrypted', {
    keys: {
      keyHex: '00112233445566778899aabbccddeeff',
      kid: '11223344556677889900aabbccddeeff',
      ivHex: '0102030405060708090a0b0c0d0e0f10',
      scheme: 'cenc-ctr',
    },
    cleartextBase: { poolPath: '_derived_cleartext/base.mp4', sha256: baseSha256 },
  });
  encrypted.evidence = {
    sourceSha256: encrypted.sha256,
    available: ['METAMORPHIC_PEER'],
    requiredOracles: ['property-invariant'],
    sufficientOracleSets: [['property-invariant']],
    metamorphicSurvivor: {
      oracle: 'property-invariant',
      invariant: DECRYPT_METAMORPHIC_INVARIANT,
      cleartextBaseSha256: baseSha256,
    },
  };
  const cencScenario = scenario({
    id: 'encryption/cenc-selection',
    family: 'encryption',
    op: 'decrypt',
    input: 'cenc-baked.mp4',
    options: {
      scheme: 'cenc-ctr',
      key: {
        keyHex: '00112233445566778899aabbccddeeff',
        kid: '11223344556677889900aabbccddeeff',
        provenance: {
          schema: 'media-test/encryption-key-provenance@1',
          sourceRecord: '/fixtures/golden/cenc-baked.mp4.keys.json',
          assetId: 'cenc-baked.mp4',
          scheme: 'cenc-ctr',
          use: 'authoritative-positive',
          rotationPolicy: 'positive-source-equivalence',
        },
      },
      cleartextAsset: 'wrong-baked-base.mp4',
    },
    requires: { operations: ['decrypt'], containersIn: ['mp4'], encryption: ['cenc-ctr'] },
    oracles: ['decrypt-bitexact', 'reference-reimport'],
  });
  const cencRow = row([encrypted], {
    scenarioId: cencScenario.id,
    class: 'DERIVED',
    requires: {
      container: 'mp4',
      video: true,
      videoCodecs: ['h264'],
      audioCodecs: ['aac'],
      encryption: ['cenc-ctr'],
    },
  });

  test('complete candidate runs only its exact metamorphic invariant', () => {
    const sources = new Map([[cencScenario.id, cencRow]]);
    const selections = candidatesForRun([cencScenario], sources, {
      bakedManifest: bakedManifest([{ id: 'cenc-baked.mp4', contents: 'baked encrypted' }]),
    }).get(cencScenario.id)!;
    const real = selections.find((selection) => !selection.isBaked);
    expect(real).toBeDefined();
    expect(real?.effectiveScenario.oracles).toEqual(['property-invariant']);
    expect(real?.effectiveScenario.options).toMatchObject({
      invariant: DECRYPT_METAMORPHIC_INVARIANT,
      cleartextBaseAsset: 'scenarios/_derived_cleartext/base.mp4',
      cleartextBaseSha256: baseSha256,
      candidateSourceSha256: encrypted.sha256,
      key: { keyHex: encrypted.keys?.keyHex, kid: encrypted.keys?.kid },
    });
    expect((real?.effectiveScenario.options as Record<string, unknown>).cleartextAsset).toBeUndefined();
  });

  test('key, base, or evidence mutations are rejected before selection', () => {
    const mutations: SourceFileRecord[] = [
      { ...encrypted, keys: undefined },
      { ...encrypted, cleartextBase: { ...encrypted.cleartextBase!, sha256: sha256Hex('different base') } },
      { ...encrypted, evidence: undefined },
    ];
    for (const file of mutations) {
      const eligibility = assessCandidateEligibility(cencScenario, { ...cencRow, files: [file] }, file);
      expect(eligibility.eligible).toBe(false);
      if (!eligibility.eligible) expect(eligibility.rejection.reasonCode).toMatch(/^CENC_/);
    }
  });
});

describe('REQ-SEL-07 full-digest pool/execution/cache contracts', () => {
  test('prefix collisions and same filename/different bytes cannot share a cache tag', () => {
    const prefix = '0123456789ab';
    const a = `${prefix}${'0'.repeat(52)}`;
    const b = `${prefix}${'f'.repeat(52)}`;
    const selection = (digest: string): ScenarioSelection => ({
      scenarioId: 'probe/selection',
      isBaked: false,
      selectedFile: 'same.mp4',
      selectedSha256: digest,
      resolvedInputs: [],
      effectiveScenario: scenario(),
      candidateCount: 1,
      shapeWarnings: [],
    });
    expect(selectionCacheTag(selection(a))).not.toBe(selectionCacheTag(selection(b)));
    expect(selectionCacheTag(selection(a))).toBe(`sha256:${a}`);
  });

  test('canonical exhaustive set cache survives reorder but changes on member drift', () => {
    const selections = candidatesForRun([scenario()], new Map([['probe/selection', row([
      sourceFile('01.mp4', 'one'),
      sourceFile('02.mp4', 'two'),
    ])]]), { bakedManifest: bakedManifest() }).get('probe/selection')!;
    expect(exhaustiveSelectionCacheTag(selections)).toBe(exhaustiveSelectionCacheTag([...selections].reverse()));
    expect(exhaustiveSelectionCacheTag(selections)).not.toBe(exhaustiveSelectionCacheTag(selections.slice(1)));
  });

  test('scenario/oracle contracts invalidate observation keys; new seed re-envelopes one observation', () => {
    const base = {
      engine: { id: 'engine', version: '1', runtimeConfig: { mode: 'worker' } },
      browser: { family: 'chromium', version: '1' },
      scenarioContractDigest: sha256Hex('scenario-v1'),
      oracleEvidenceContractDigest: sha256Hex('oracle-v1'),
      executedInputDigest: sha256Hex('input'),
      benchmarkConfig: { warmup: 1, iters: 3 },
    };
    const key = computeObservationKey(base);
    expect(computeObservationKey({ ...base, scenarioContractDigest: sha256Hex('scenario-v2') })).not.toBe(key);
    expect(computeObservationKey({ ...base, oracleEvidenceContractDigest: sha256Hex('oracle-v2') })).not.toBe(key);
    const reused = reEnvelopeObservation(
      { status: 'PASS', immutableSemanticResult: true },
      {
        seed: 'new-seed',
        eligiblePoolDigest: sha256Hex('pool'),
        executedInputDigest: base.executedInputDigest,
        candidateCount: 3,
        catalogState: 'ready',
        startedAtIso: '2026-07-16T12:00:00.000Z',
      },
      { observationKey: key, runId: 'original-run', createdAtIso: '2026-07-15T12:00:00.000Z' },
    );
    expect(reused.envelope.seed).toBe('new-seed');
    expect(reused.reusedFrom.observationKey).toBe(key);
  });

  test('baked byte changes alter pool, executed, corpus, and cache identities', () => {
    const emptyCatalog = catalogFromRows([row([] as SourceFileRecord[], { class: 'SYNTHETIC' })]);
    const build = (contents: string) => buildSelectionManifest({
      scenarios: [scenario()],
      catalog: emptyCatalog,
      bakedManifest: bakedManifest([{ id: 'baked.mp4', contents }]),
    });
    const a = build('baked-v1');
    const b = build('baked-v2');
    const poolA = a.pools[0]!;
    const poolB = b.pools[0]!;
    expect(poolA.eligiblePoolDigest).not.toBe(poolB.eligiblePoolDigest);
    expect(poolA.candidates[0]?.contentDigest).not.toBe(poolB.candidates[0]?.contentDigest);
    const sources = new Map([['probe/selection', row([], { class: 'SYNTHETIC' })]]);
    const selA = selectForRun([scenario()], 'seed', sources, { bakedManifest: bakedManifest([{ id: 'baked.mp4', contents: 'baked-v1' }]) }).get('probe/selection')!;
    const selB = selectForRun([scenario()], 'seed', sources, { bakedManifest: bakedManifest([{ id: 'baked.mp4', contents: 'baked-v2' }]) }).get('probe/selection')!;
    expect(selA.executedInputDigest).not.toBe(selB.executedInputDigest);
    expect(selectionCacheTag(selA)).not.toBe(selectionCacheTag(selB));
    expect(computeCorpusChecksum([selA])).not.toBe(computeCorpusChecksum([selB]));
    expect(computeEligiblePoolsDigest([selA])).not.toBe(computeEligiblePoolsDigest([selB]));
  });
});

describe('REQ-SEL-08 property/e2e selection surface and FEAT-76 robustness vector', () => {
  test('candidatesForRun and report JSON retain canonical pool/evidence/rejection identities', () => {
    const files = [sourceFile('01.mp4', 'one'), sourceFile('02.mp4', 'two')];
    const catalog = catalogFromRows([row(files)]);
    const manifest = buildSelectionManifest({ scenarios: [scenario()], catalog, bakedManifest: bakedManifest() });
    const selections = candidatesForRun([scenario()], new Map([[row(files).scenarioId, row(files)]]), {
      bakedManifest: bakedManifest(),
    }).get('probe/selection')!;
    expect(selections).toHaveLength(3);
    expect(selections.every((selection) => selection.evidencePlan && selection.eligiblePoolDigest)).toBe(true);
    const serialized = JSON.parse(JSON.stringify({ manifest, selections })) as {
      manifest: FrozenSelectionManifest;
      selections: ScenarioSelection[];
    };
    expect(serialized.manifest.pools[0]?.eligible).toBe(3);
    expect(serialized.selections[0]?.evidencePlan?.requiredOracles).toEqual(['golden-metadata']);
  });

  test('three eligible robustness variants require exact same-contract, source-bound sufficient evidence', () => {
    const robustnessScenario = scenario({
      id: 'robustness/curated-selection',
      family: 'robustness',
      op: 'probe',
      input: 'robustness-baked.mp4',
      oracles: ['graceful-failure'],
    });
    const scenarioContractDigest = sha256Hex('robustness scenario definition v2');
    const curated = (name: string, contents: string): SourceFileRecord => {
      const file = sourceFile(name, contents);
      return {
        ...file,
        contract: {
          scenarioId: robustnessScenario.id,
          scenarioContractDigest,
          sourceSha256: file.sha256,
          kind: ROBUSTNESS_VARIANT_SELECTION_CONTRACT.contractKind,
        },
        evidence: {
          sourceSha256: file.sha256,
          available: [ROBUSTNESS_VARIANT_SELECTION_CONTRACT.requiredEvidence],
          requiredOracles: ['graceful-failure'],
          sufficientOracleSets: [['graceful-failure']],
        },
      };
    };
    // Baked + two curated variants is the stable three-variant FEAT-76 primitive.
    const files = [curated('01.mp4', 'corrupt-header'), curated('02.mp4', 'truncated-payload')];
    const robustnessRow = row(files, { scenarioId: robustnessScenario.id, class: 'REAL' });
    const manifest = manifestFor(files, {
      scenario: robustnessScenario,
      row: robustnessRow,
      baked: bakedManifest([{ id: 'robustness-baked.mp4', contents: 'baked malformed' }]),
      scenarioContractDigest,
    });
    const pool = findScenarioPool(manifest, robustnessScenario.id)!;
    expect(pool.eligible).toBe(3);
    expect(pool.candidates.map((candidate) => candidate.contentDigest).filter((digest, index, all) => all.indexOf(digest) === index)).toHaveLength(3);
    expect(pool.candidates.every((candidate) => candidate.evidencePlan.sufficientOracleSets.length > 0)).toBe(true);

    const arbitrary = sourceFile('03.mp4', 'arbitrary corruption');
    const rejected = assessRobustnessVariantEligibility(robustnessScenario, arbitrary, scenarioContractDigest);
    expect(rejected).toMatchObject({ eligible: false, rejection: { reasonCode: 'ROBUSTNESS_VARIANT_CONTRACT_MISSING' } });
  });
});

expect(SELECTION_POLICY_VERSION).toBe('hrw-sha256@1');
expect(SELECTION_ALGORITHM_ID).toBe('sha256-max-score-utf8-v1');
