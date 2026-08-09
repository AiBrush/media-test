import { describe, expect, test } from 'bun:test';

import type { OracleOutcome, Scenario } from '../src/core/scenario.ts';
import { Sha256, bytesToLowerHex } from '../src/core/seeded-rng.ts';
import { demuxScenarios } from '../src/scenarios/demux/index.ts';
import { decodeSeekScenarios } from '../src/scenarios/decode-seek/index.ts';
import { metadataScenarios } from '../src/scenarios/metadata/index.ts';
import { performanceScenarios } from '../src/scenarios/performance/index.ts';
import { transcodeScenarios } from '../src/scenarios/transcode/index.ts';
import {
  DECRYPT_METAMORPHIC_INVARIANT,
  ROBUSTNESS_VARIANT_SELECTION_CONTRACT,
  SELECTION_ALGORITHM_ID,
  SELECTION_POLICY_VERSION,
  assessCandidateEligibility,
  assessRobustnessVariantEligibility,
  buildCandidateEvidencePlan,
  buildSelectionManifest,
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
  verifyContentStream,
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

test('fixed-layout audio-DSP rows keep arbitrary same-codec real files out of the pool', () => {
  const fixed = scenario({
    id: 'audio-dsp/downmix_stereo_to_mono',
    family: 'audio-dsp',
    op: 'transcode',
    input: 'baked.wav',
    options: {
      container: 'wav',
      invariant: 'audio-dsp-transform',
      audio: {
        codec: 'pcm-s16',
        channels: 1,
        inputLayout: ['FL', 'FR'],
        outputLayout: ['FC'],
        mixMatrix: [[0.5, 0.5]],
      },
    },
    requires: {
      operations: ['transcode'],
      containersIn: ['wav'],
      containersOut: ['wav'],
      audioCodecs: ['pcm-s16'],
      features: ['downmix'],
    },
    oracles: ['property-invariant'],
  });
  const real = sourceFile('mono.wav', 'same codec but wrong layout', {
    container: 'wav',
    videoCodecs: [],
    audioCodecs: ['pcm-s16'],
  });
  const sourceRow = row([real], {
    scenarioId: fixed.id,
    requires: {
      container: 'wav',
      video: false,
      videoCodecs: [],
      audioCodecs: ['pcm-s16'],
    },
  });
  const selections = candidatesForRun([fixed], new Map([[fixed.id, sourceRow]]));
  expect(selections.get(fixed.id)?.map((selection) => selection.isBaked)).toEqual([true]);
});

test('decode-fps keeps its committed RGBA prefix bound to the baked input', () => {
  const fixed = scenario({
    id: 'performance/decode-fps',
    family: 'performance',
    op: 'decodeFrames',
    input: 'h264_1080p_30s.mp4',
    options: { maxFrames: 12 },
    requires: {
      operations: ['decodeFrames'],
      containersIn: ['mp4'],
      videoCodecs: ['h264'],
      audioCodecs: ['aac'],
      features: ['decode:golden-rgba'],
    },
    oracles: ['decoded-frames-bitexact'],
  });
  const real = sourceFile('01.mp4', 'shape-compatible bytes');
  const sourceRow = row([real], { scenarioId: fixed.id });
  const selections = candidatesForRun([fixed], new Map([[fixed.id, sourceRow]]));
  expect(selections.get(fixed.id)?.map((selection) => selection.isBaked)).toEqual([true]);
});

test('VP9 alpha exhaustive selection retains the baked input and all three curated real sources', async () => {
  const [catalogText, manifestJson] = await Promise.all([
    Bun.file('fixtures/media/scenarios/_sources.ndjson').text(),
    Bun.file('fixtures/manifest.json').json(),
  ]);
  const parsedCatalog = parseScenarioSourceCatalog(catalogText);
  const parsedBaked = parseBakedCorpusManifest(manifestJson);
  if (parsedCatalog.state !== 'VALID' || parsedBaked.state !== 'VALID') {
    throw new Error('VP9 alpha selection fixtures must validate');
  }
  const selectedScenario = decodeSeekScenarios.find((entry) =>
    entry.id === 'decode-seek/decode_vp9_alpha');
  if (!selectedScenario) throw new Error('VP9 alpha decode scenario is missing');
  const pool = findScenarioPool(buildSelectionManifest({
    scenarios: [selectedScenario],
    catalog: parsedCatalog.catalog,
    bakedManifest: parsedBaked.manifest,
  }), selectedScenario.id);
  if (!pool) throw new Error('VP9 alpha candidate pool is missing');

  expect(pool.candidates.map((candidate) => candidate.selectedFile).sort()).toEqual([
    '01.webm',
    '02.webm',
    '03.webm',
    'vp9_alpha.webm',
  ]);
  expect(pool.rejections).toEqual([]);
});

test('rotate-normalize rejects shape-compatible files that do not declare the authored display matrix', () => {
  const fixed = scenario({
    id: 'transcode/h264_rotate_normalize',
    family: 'transcode',
    op: 'transcode',
    input: 'h264_rotated90.mp4',
    options: {
      container: 'mp4',
      video: { codec: 'h264', rotate: 0 },
      invariant: 'transcode-effect-aware',
    },
    requires: {
      operations: ['transcode'],
      containersIn: ['mp4'],
      containersOut: ['mp4'],
      videoCodecs: ['h264'],
      audioCodecs: ['aac'],
      features: ['rotate'],
    },
    oracles: ['ssim-psnr', 'playback-smoke', 'property-invariant'],
  });
  const real = sourceFile('01.mp4', 'shape-compatible but orientation-free bytes');
  const sourceRow = row([real], { scenarioId: fixed.id });
  const manifest = buildSelectionManifest({
    scenarios: [fixed],
    catalog: catalogFromRows([sourceRow]),
    bakedManifest: bakedManifest([{ id: 'h264_rotated90.mp4', contents: 'authored rotated fixture' }]),
  });
  const pool = findScenarioPool(manifest, fixed.id)!;

  expect(pool.candidates.map((candidate) => candidate.kind)).toEqual(['baked']);
  expect(pool.rejections).toContainEqual(expect.objectContaining({
    selectedFile: '01.mp4',
    reasonCode: 'SOURCE_SEMANTICS_FIXTURE_BOUND',
  }));
});

test('metadata fixture-semantic rows are baked-only while the family retains the exact 25-row/76-member pool', async () => {
  const [catalogText, manifestJson] = await Promise.all([
    Bun.file('fixtures/media/scenarios/_sources.ndjson').text(),
    Bun.file('fixtures/manifest.json').json(),
  ]);
  const parsedCatalog = parseScenarioSourceCatalog(catalogText);
  const parsedBaked = parseBakedCorpusManifest(manifestJson);
  if (parsedCatalog.state !== 'VALID') {
    throw new Error(parsedCatalog.issues.map((issue) => issue.detail).join('; '));
  }
  if (parsedBaked.state !== 'VALID') {
    throw new Error(parsedBaked.issues.map((issue) => issue.detail).join('; '));
  }

  const fixtureBound = [
    'metadata/neg_garbled_id3_mp3_probe',
    'metadata/neg_garbled_ilst_mp4_probe',
    'metadata/read_h264_multitrack',
    'metadata/rotation_survives_mp4_mkv',
    'metadata/tracks_attribution_multitrack',
    'metadata/tracks_packet_attribution_multitrack',
  ] as const;
  const manifest = buildSelectionManifest({
    scenarios: metadataScenarios,
    catalog: parsedCatalog.catalog,
    bakedManifest: parsedBaked.manifest,
  });

  expect(metadataScenarios).toHaveLength(25);
  expect(manifest.pools).toHaveLength(25);
  expect(manifest.pools.reduce((sum, pool) => sum + pool.candidates.length, 0)).toBe(76);
  for (const id of fixtureBound) {
    const pool = findScenarioPool(manifest, id);
    expect(pool?.candidates.map((candidate) => candidate.kind), id).toEqual(['baked']);
    expect(pool?.rejections, id).toHaveLength(3);
    expect(pool?.rejections.every((rejection) =>
      rejection.reasonCode === 'SOURCE_SEMANTICS_FIXTURE_BOUND'), id).toBe(true);
  }
});

test('performance workload envelopes produce the exact revision-2 canonical pools', async () => {
  const [catalogText, manifestJson] = await Promise.all([
    Bun.file('fixtures/media/scenarios/_sources.ndjson').text(),
    Bun.file('fixtures/manifest.json').json(),
  ]);
  const parsedCatalog = parseScenarioSourceCatalog(catalogText);
  const parsedBaked = parseBakedCorpusManifest(manifestJson);
  if (parsedCatalog.state !== 'VALID') {
    throw new Error(parsedCatalog.issues.map((issue) => issue.detail).join('; '));
  }
  if (parsedBaked.state !== 'VALID') {
    throw new Error(parsedBaked.issues.map((issue) => issue.detail).join('; '));
  }
  const manifest = buildSelectionManifest({
    scenarios: performanceScenarios,
    catalog: parsedCatalog.catalog,
    bakedManifest: parsedBaked.manifest,
  });

  expect(manifest.pools).toHaveLength(33);
  expect(manifest.pools.reduce((sum, pool) => sum + pool.candidates.length, 0)).toBe(78);
  expect(manifest.pools.reduce((sum, pool) => sum + pool.rejections.length, 0)).toBe(54);
  const poolCounts = manifest.pools.reduce<Record<number, number>>((counts, pool) => {
    counts[pool.candidates.length] = (counts[pool.candidates.length] ?? 0) + 1;
    return counts;
  }, {});
  expect(poolCounts).toEqual({ 1: 16, 2: 3, 4: 14 });

  for (const id of [
    'performance/encode-fps',
    'performance/metamorphic-transcode-idempotent-source-res',
  ]) {
    const pool = findScenarioPool(manifest, id);
    expect(pool?.candidates.map((candidate) => candidate.selectedFile), id)
      .toEqual(['h264_1080p_30s.mp4']);
    expect(pool?.rejections, id).toHaveLength(3);
  }

  for (const pool of manifest.pools.filter((entry) => entry.scenarioId.startsWith('performance/size-ladder-'))) {
    const expectedCandidates = pool.scenarioId.endsWith('-huge') ? 2 : 1;
    expect(pool.candidates, pool.scenarioId).toHaveLength(expectedCandidates);
    expect(pool.rejections.every((rejection) =>
      rejection.reasonCode === 'CANDIDATE_INPUT_CONTRACT_MISMATCH'), pool.scenarioId).toBe(true);
  }
});

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

test('full-range no-op selection admits only candidates with the authored full duration', () => {
  const noop = scenario({
    id: 'trim/noop-selection',
    family: 'trim',
    op: 'trim',
    input: 'baked.webm',
    options: {
      container: 'webm',
      frameAccurate: false,
      range: { startUs: 0, endUs: 10_000_000 },
      invariant: 'trim-noop-semantic-identity',
    },
    tolerances: { durationToleranceSec: 0.05 },
    oracles: ['property-invariant', 'trim-boundaries'],
  });
  const candidate = (name: string, durationSec: number) => sourceFile(name, name, {
    container: 'webm',
    videoCodecs: ['vp9'],
    audioCodecs: ['opus'],
    durationSec,
  });
  const contractRow = (file: SourceFileRecord) => row([file], {
    scenarioId: noop.id,
    requires: {
      container: 'webm',
      video: true,
      videoCodecs: ['vp9'],
      audioCodecs: ['opus'],
    },
  });
  const exact = candidate('exact.webm', 10.03);
  const unrelated = candidate('unrelated.webm', 26.019);
  expect(assessCandidateEligibility(noop, contractRow(exact), exact).eligible).toBe(true);
  const rejected = assessCandidateEligibility(noop, contractRow(unrelated), unrelated);
  expect(rejected.eligible).toBe(false);
  if (!rejected.eligible) {
    expect(rejected.rejection).toMatchObject({ reasonCode: 'CANDIDATE_INPUT_CONTRACT_MISMATCH' });
    expect(rejected.rejection.detail).toContain('full-range no-op contract');
  }
});

test('source envelopes admit arbitrary matching assets at inclusive boundaries and fail closed', () => {
  const candidateEnvelope = {
    minWidth: 1920,
    maxWidth: 1920,
    minHeight: 1080,
    maxHeight: 1080,
    minDurationSec: 108,
    maxDurationSec: 132,
  } as const;
  const boundedScenario = scenario({
    id: 'transcode/source-envelope-contract',
    family: 'transcode',
    op: 'transcode',
    input: 'baked.webm',
    candidateEnvelope,
  });
  const requires: ScenarioSourceRow['requires'] = {
    container: 'webm',
    video: true,
    videoCodecs: ['vp9'],
    audioCodecs: ['opus'],
  };
  const candidate = (name: string, overrides: Partial<SourceFileRecord> = {}) => sourceFile(name, name, {
    container: 'webm',
    videoCodecs: ['vp9'],
    audioCodecs: ['opus'],
    width: 1920,
    height: 1080,
    durationSec: 120,
    ...overrides,
  });
  const eligibility = (file: SourceFileRecord) => assessCandidateEligibility(
    boundedScenario,
    row([file], { scenarioId: boundedScenario.id, requires }),
    file,
  );

  for (const file of [
    candidate('unrelated-lower-bound.webm', { durationSec: 108 }),
    candidate('future-generic-source.webm'),
    candidate('unrelated-upper-bound.webm', { durationSec: 132 }),
  ]) {
    expect(eligibility(file).eligible).toBe(true);
  }

  for (const [file, field] of [
    [candidate('too-narrow.webm', { width: 1919 }), 'width'],
    [candidate('too-wide.webm', { width: 1921 }), 'width'],
    [candidate('too-short.webm', { durationSec: 107.999 }), 'duration'],
    [candidate('too-long.webm', { durationSec: 132.001 }), 'duration'],
    [candidate('unknown-height.webm', { height: null }), 'height'],
    [candidate('unknown-duration.webm', { durationSec: null }), 'duration'],
  ] as const) {
    const result = eligibility(file);
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.rejection.reasonCode).toBe('CANDIDATE_INPUT_CONTRACT_MISMATCH');
      expect(result.rejection.detail).toContain(field);
    }
  }

  const catalogOnly = candidate('catalog-only-bound.webm', { durationSec: 107 });
  const catalogResult = assessCandidateEligibility(
    scenario({ id: 'transcode/catalog-envelope-contract', family: 'transcode', op: 'transcode' }),
    row([catalogOnly], {
      scenarioId: 'transcode/catalog-envelope-contract',
      requires: { ...requires, minDurationSec: 108 },
    }),
    catalogOnly,
  );
  expect(catalogResult).toMatchObject({
    eligible: false,
    rejection: { reasonCode: 'CANDIDATE_INPUT_CONTRACT_MISMATCH' },
  });

  const matching = candidate('cache-envelope-match.webm');
  const matchingRow = row([matching], { scenarioId: boundedScenario.id, requires });
  const candidateCatalog = catalogFromRows([matchingRow]);
  const candidateBaked = bakedManifest([{ id: 'baked.webm', contents: 'same baked bytes' }]);
  const boundedPool = findScenarioPool(buildSelectionManifest({
    scenarios: [boundedScenario], catalog: candidateCatalog, bakedManifest: candidateBaked,
  }), boundedScenario.id)!;
  const unboundedPool = findScenarioPool(buildSelectionManifest({
    scenarios: [{ ...boundedScenario, candidateEnvelope: undefined }],
    catalog: candidateCatalog,
    bakedManifest: candidateBaked,
  }), boundedScenario.id)!;
  expect(boundedPool.candidates.map((entry) => entry.candidateIdentity)).toEqual(
    unboundedPool.candidates.map((entry) => entry.candidateIdentity),
  );
  expect(boundedPool.eligiblePoolDigest).not.toBe(unboundedPool.eligiblePoolDigest);
});

test('tracked large-rung envelopes keep baked when regenerated catalog rows have no bounds', () => {
  const exactLargeEnvelope = {
    minWidth: 1920,
    maxWidth: 1920,
    minHeight: 1080,
    maxHeight: 1080,
    minDurationSec: 108,
    maxDurationSec: 132,
  };
  const currentRungs: Array<{
    scenarioId: string;
    bakedId: string;
    container: string;
    videoCodec: string;
    audioCodec: string;
    files: Array<{ file: string; width: number; height: number; durationSec: number }>;
  }> = [
    {
      scenarioId: 'transcode/ladder_large_h264_1080p_120s_resize_720p',
      bakedId: 'large_h264_1080p_120s.mp4',
      container: 'mp4',
      videoCodec: 'h264',
      audioCodec: 'aac',
      files: [
        { file: '01.mp4', width: 1280, height: 720, durationSec: 129.898333 },
        { file: '02.mp4', width: 3840, height: 2160, durationSec: 23.53 },
        { file: '03.mp4', width: 640, height: 360, durationSec: 180.693333 },
      ],
    },
    {
      scenarioId: 'transcode/ladder_large_vp9_1080p_120s_to_h264_720p',
      bakedId: 'large_vp9_1080p_120s.webm',
      container: 'webm',
      videoCodec: 'vp9',
      audioCodec: 'opus',
      files: [
        { file: '01.webm', width: 1280, height: 720, durationSec: 182.574 },
        { file: '02.webm', width: 960, height: 720, durationSec: 610.248 },
        { file: '03.webm', width: 640, height: 480, durationSec: 1697.261 },
      ],
    },
  ];

  for (const current of currentRungs) {
    const selectedScenario = transcodeScenarios.find((entry) => entry.id === current.scenarioId);
    if (!selectedScenario) throw new Error(`missing tracked scenario '${current.scenarioId}'`);
    expect(selectedScenario).toMatchObject({ revision: 2, candidateEnvelope: exactLargeEnvelope });
    const sourceRow = row(current.files.map((file) => sourceFile(file.file, `current ${file.file}`, {
      container: current.container,
      videoCodecs: [current.videoCodec],
      audioCodecs: [current.audioCodec],
      width: file.width,
      height: file.height,
      durationSec: file.durationSec,
    })), {
      scenarioId: current.scenarioId,
      requires: {
        container: current.container,
        video: true,
        videoCodecs: [current.videoCodec],
        audioCodecs: [current.audioCodec],
      },
    });
    const manifest = buildSelectionManifest({
      scenarios: [selectedScenario],
      catalog: catalogFromRows([sourceRow]),
      bakedManifest: bakedManifest([{ id: current.bakedId, contents: `verified baked ${current.bakedId}` }]),
    });
    const pool = findScenarioPool(manifest, current.scenarioId);
    if (!pool) throw new Error(`missing candidate pool '${current.scenarioId}'`);

    expect(pool.candidates.map((candidate) => ({
      kind: candidate.kind,
      selectedFile: candidate.selectedFile,
    }))).toEqual([{ kind: 'baked', selectedFile: current.bakedId }]);
    expect(pool.rejections.map((rejection) => ({
      selectedFile: rejection.selectedFile,
      reasonCode: rejection.reasonCode,
    }))).toEqual(current.files.map((file) => ({
      selectedFile: file.file,
      reasonCode: 'CANDIDATE_INPUT_CONTRACT_MISMATCH',
    })));
  }
});

test('every tracked demux size row filters real candidates by its independent workload envelope', () => {
  const cases = [
    {
      scenarioId: 'demux/size_micro_micro_h264_1frame', bakedId: 'micro_h264_1frame.mp4',
      container: 'mp4', videoCodec: 'h264', audioCodec: undefined,
      width: 320, height: 240, durationSec: 1,
    },
    {
      scenarioId: 'demux/size_micro_micro_audio_short', bakedId: 'micro_audio_short.m4a',
      container: 'mp4', videoCodec: undefined, audioCodec: 'aac',
      width: undefined, height: undefined, durationSec: 0.125,
    },
    {
      scenarioId: 'demux/size_tiny_tiny_h264_360p_2s', bakedId: 'tiny_h264_360p_2s.mp4',
      container: 'mp4', videoCodec: 'h264', audioCodec: 'aac',
      width: 640, height: 360, durationSec: 2,
    },
    {
      scenarioId: 'demux/size_tiny_tiny_vp9_360p_2s', bakedId: 'tiny_vp9_360p_2s.webm',
      container: 'webm', videoCodec: 'vp9', audioCodec: 'opus',
      width: 640, height: 360, durationSec: 2,
    },
    {
      scenarioId: 'demux/size_large_large_h264_1080p_120s', bakedId: 'large_h264_1080p_120s.mp4',
      container: 'mp4', videoCodec: 'h264', audioCodec: 'aac',
      width: 1920, height: 1080, durationSec: 120,
    },
    {
      scenarioId: 'demux/size_large_large_vp9_1080p_120s', bakedId: 'large_vp9_1080p_120s.webm',
      container: 'webm', videoCodec: 'vp9', audioCodec: 'opus',
      width: 1920, height: 1080, durationSec: 120,
    },
    {
      scenarioId: 'demux/size_huge_huge_h264_1080p_600s', bakedId: 'huge_h264_1080p_600s.mov',
      container: 'mov', videoCodec: 'h264', audioCodec: 'aac',
      width: 1920, height: 1080, durationSec: 600,
    },
    {
      scenarioId: 'demux/size_massive_massive_h264_1080p_2h', bakedId: 'massive_h264_1080p_2h.mp4',
      container: 'mp4', videoCodec: 'h264', audioCodec: 'aac',
      width: 1920, height: 1080, durationSec: 7200,
    },
  ] as const;

  for (const current of cases) {
    const selectedScenario = demuxScenarios.find((entry) => entry.id === current.scenarioId);
    if (!selectedScenario) throw new Error(`missing tracked scenario '${current.scenarioId}'`);
    const exact = sourceFile(`exact-${current.bakedId}`, `exact ${current.bakedId}`, {
      container: current.container,
      videoCodecs: current.videoCodec ? [current.videoCodec] : [],
      audioCodecs: current.audioCodec ? [current.audioCodec] : [],
      ...(current.width !== undefined ? { width: current.width } : {}),
      ...(current.height !== undefined ? { height: current.height } : {}),
      durationSec: current.durationSec,
    });
    const wrongDuration = sourceFile(`wrong-duration-${current.bakedId}`, `wrong ${current.bakedId}`, {
      container: current.container,
      videoCodecs: current.videoCodec ? [current.videoCodec] : [],
      audioCodecs: current.audioCodec ? [current.audioCodec] : [],
      ...(current.width !== undefined ? { width: current.width } : {}),
      ...(current.height !== undefined ? { height: current.height } : {}),
      durationSec: (selectedScenario.candidateEnvelope?.maxDurationSec ?? current.durationSec) + 0.001,
    });
    const files = current.width === undefined
      ? [exact, wrongDuration]
      : [
          exact,
          wrongDuration,
          sourceFile(`wrong-width-${current.bakedId}`, `wrong width ${current.bakedId}`, {
            container: current.container,
            videoCodecs: current.videoCodec ? [current.videoCodec] : [],
            audioCodecs: current.audioCodec ? [current.audioCodec] : [],
            width: current.width + 1,
            height: current.height,
            durationSec: current.durationSec,
          }),
        ];
    const sourceRow = row(files, {
      scenarioId: current.scenarioId,
      requires: {
        container: current.container,
        video: current.videoCodec !== undefined,
        videoCodecs: current.videoCodec ? [current.videoCodec] : [],
        audioCodecs: current.audioCodec ? [current.audioCodec] : [],
      },
    });
    const manifest = buildSelectionManifest({
      scenarios: [selectedScenario],
      catalog: catalogFromRows([sourceRow]),
      bakedManifest: bakedManifest([{
        id: current.bakedId,
        contents: `verified baked ${current.bakedId}`,
      }]),
    });
    const pool = findScenarioPool(manifest, current.scenarioId);
    if (!pool) throw new Error(`missing candidate pool '${current.scenarioId}'`);

    expect(pool.candidates.map((candidate) => candidate.selectedFile).sort()).toEqual(
      [current.bakedId, exact.file].sort(),
    );
    expect(pool.rejections.map((rejection) => rejection.reasonCode)).toEqual(
      Array(files.length - 1).fill('CANDIDATE_INPUT_CONTRACT_MISMATCH'),
    );
  }
});

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

  test('source-envelope requirements are validated as ordered finite ranges', () => {
    const valid = row([sourceFile('01.mp4', 'one')], {
      requires: {
        container: 'mp4',
        video: true,
        videoCodecs: ['h264'],
        audioCodecs: ['aac'],
        minWidth: 1920,
        maxWidth: 1920,
        minHeight: 1080,
        maxHeight: 1080,
        minDurationSec: 108,
        maxDurationSec: 132,
      },
    });
    const parsedValid = parseScenarioSourceCatalog(JSON.stringify(valid));
    expect(parsedValid.state).toBe('VALID');
    if (parsedValid.state === 'VALID') {
      expect(parsedValid.catalog.rows[0]?.requires).toMatchObject(valid.requires);
    }

    const invalid = {
      ...valid,
      requires: {
        ...valid.requires,
        minWidth: 1919.5,
        minDurationSec: 133,
        maxDurationSec: 132,
      },
    };
    const parsedInvalid = parseScenarioSourceCatalog(JSON.stringify(invalid));
    expect(parsedInvalid.state).toBe('INVALID');
    expect(parsedInvalid.issues.map((issue) => issue.reasonCode)).toEqual(expect.arrayContaining([
      'CATALOG_REQUIREMENT_BOUND_INVALID',
      'CATALOG_REQUIREMENT_RANGE_INVALID',
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
  test('incremental SHA-256 matches FIPS vectors and an independent digest across block boundaries', async () => {
    const vectors = [
      ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
      ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
      [
        'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
        '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
      ],
    ] as const;
    for (const [input, expected] of vectors) {
      expect(new Sha256().update(input).hex()).toBe(expected);
    }

    for (const length of [55, 56, 63, 64, 65, 119, 120, 127, 128, 129, 1_087]) {
      const input = Uint8Array.from({ length }, (_, index) => (index * 131 + length) & 0xff);
      const expected = bytesToLowerHex(new Uint8Array(await crypto.subtle.digest('SHA-256', input)));
      const incremental = new Sha256();
      const updateSizes = [1, 63, 7, 64, 65];
      let offset = 0;
      let updateIndex = 0;
      while (offset < input.byteLength) {
        const end = Math.min(input.byteLength, offset + updateSizes[updateIndex % updateSizes.length]!);
        incremental.update(input.subarray(offset, end));
        offset = end;
        updateIndex += 1;
      }
      expect(incremental.hex()).toBe(expected);
    }
  });

  test('stream admission is incremental, non-retained, and preserves an authenticated block map', async () => {
    const expected = bytes('authenticated scale body');
    const identity = {
      logicalPath: 'scenarios/probe/selection/scale.mp4',
      sha256: sha256Hex(expected),
      sizeBytes: expected.byteLength,
    };
    const chunks = [expected.subarray(0, 3), expected.subarray(3, 11), expected.subarray(11)];
    const result = await verifyContentStream(identity, async () => new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks.shift();
        if (chunk) controller.enqueue(chunk);
        else controller.close();
      },
    }), 5);
    expect(result).toMatchObject({
      state: 'VERIFIED_STREAM',
      actualSha256: identity.sha256,
      actualSizeBytes: expected.byteLength,
      chunkSizeBytes: 5,
      retainedBytes: 0,
    });
    if (result.state === 'VERIFIED_STREAM') {
      expect(result.chunkSha256).toHaveLength(Math.ceil(expected.byteLength / 5));
      expect('bytes' in result).toBe(false);
      for (let index = 0; index < result.chunkSha256.length; index++) {
        expect(result.chunkSha256[index]).toBe(sha256Hex(expected.subarray(index * 5, (index + 1) * 5)));
      }
    }

    const corrupt = expected.slice();
    corrupt[7] ^= 0xff;
    const rejected = await verifyContentStream(identity, async () => new Response(corrupt).body!);
    expect(rejected).toMatchObject({ state: 'REJECTED', issue: { reasonCode: 'CORPUS_DIGEST_MISMATCH' } });
  });

  test('non-retained double-hash stream admission has a practical throughput floor', async () => {
    const sizeBytes = 8 * 1024 * 1024;
    const input = Uint8Array.from({ length: sizeBytes }, (_, index) => (index * 17 + 29) & 0xff);
    const identity = {
      logicalPath: 'scenarios/probe/selection/throughput.bin',
      sha256: bytesToLowerHex(new Uint8Array(await crypto.subtle.digest('SHA-256', input))),
      sizeBytes,
    };
    const startedAt = performance.now();
    const result = await verifyContentStream(identity, async () => new ReadableStream<Uint8Array>({
      start(controller) {
        for (let offset = 0; offset < input.byteLength; offset += 256 * 1024) {
          controller.enqueue(input.subarray(offset, Math.min(input.byteLength, offset + 256 * 1024)));
        }
        controller.close();
      },
    }));
    const elapsedMs = Math.max(performance.now() - startedAt, 0.001);
    const throughputMiBPerSec = (sizeBytes / (1024 * 1024)) / (elapsedMs / 1_000);
    expect(result).toMatchObject({ state: 'VERIFIED_STREAM', retainedBytes: 0 });
    // Deliberately loose enough for loaded CI, but strong enough to prevent multi-hour 1 GiB
    // admission regressions in this exact overall+fixed-block double-hash path.
    expect(throughputMiBPerSec).toBeGreaterThan(2);
  });

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
    expect(selectCandidateFromPool(pool)).toMatchObject({
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

describe('REQ-SEL-03/05 order-independent canonical selection, replay, and unique-content identity', () => {
  const files = [sourceFile('01.mp4', 'one'), sourceFile('02.mp4', 'two'), sourceFile('03.mp4', 'three')];

  test('hashing has fixed golden vectors and selection is invariant under every file permutation', () => {
    expect(sha256Hex(new Uint8Array())).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex(bytes('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const picks = new Set<string>();
    for (const order of permutations(files)) {
      const pool = poolFor(order);
      const decision = selectCandidateFromPool(pool);
      expect(decision.state).toBe('SELECTED');
      if (decision.state === 'SELECTED') {
        picks.add(decision.candidate.candidateIdentity);
        expect(decision.replay).toBe('canonical');
      }
    }
    expect([...picks]).toEqual([
      [...poolFor(files).candidates]
        .sort((left, right) => left.candidateIdentity.localeCompare(right.candidateIdentity))[0]!
        .candidateIdentity,
    ]);
  });

  test('adding/removing candidates follows the canonical candidate-identity minimum', () => {
    const base = poolFor(files.slice(0, 2));
    const added = poolFor(files);
    const before = selectCandidateFromPool(base);
    const after = selectCandidateFromPool(added);
    if (before.state !== 'SELECTED' || after.state !== 'SELECTED') throw new Error('unexpected empty pool');
    expect(before.candidate.candidateIdentity).toBe(
      [...base.candidates].sort((a, b) => a.candidateIdentity.localeCompare(b.candidateIdentity))[0]!.candidateIdentity,
    );
    expect(after.candidate.candidateIdentity).toBe(
      [...added.candidates].sort((a, b) => a.candidateIdentity.localeCompare(b.candidateIdentity))[0]!.candidateIdentity,
    );
  });

  test('canonical replay rejects pool drift; recorded full candidate replays explicitly after drift', () => {
    const original = poolFor(files.slice(0, 2));
    const selected = selectCandidateFromPool(original);
    if (selected.state !== 'SELECTED') throw new Error('selection missing');
    const changed = poolFor(files);
    expect(selectCandidateFromPool(changed, {
      expectedPoolDigest: original.eligiblePoolDigest,
    })).toMatchObject({ state: 'POOL_MISMATCH', reasonCode: 'SELECTION_POOL_DIGEST_MISMATCH' });
    const replay = selectCandidateFromPool(changed, {
      expectedPoolDigest: original.eligiblePoolDigest,
      replayCandidate: selected.candidate,
    });
    expect(replay).toMatchObject({ state: 'SELECTED', replay: 'explicit' });
    if (replay.state === 'SELECTED') expect(replay.candidate.candidateIdentity).toBe(selected.candidate.candidateIdentity);
  });

  test('canonical selection discloses the complete equally weighted eligible pool', () => {
    const pool = poolFor(files);
    const decision = selectCandidateFromPool(pool);
    expect(decision).toMatchObject({ state: 'SELECTED', replay: 'canonical', candidateCount: pool.candidates.length });
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

describe('REQ-SEL-06 protected probe DERIVED eligibility', () => {
  const baseSha256 = sha256Hex('protected probe clear base');
  const protectedFile = sourceFile('01.mp4', 'protected probe bytes', {
    keys: {
      keyHex: '00112233445566778899aabbccddeeff',
      kid: '11223344556677889900aabbccddeeff',
      scheme: 'cenc-cbcs',
    },
    cleartextBase: {
      poolPath: '_derived_cleartext/base.mp4',
      sha256: baseSha256,
      sizeBytes: 123,
    },
  });
  protectedFile.evidence = {
    sourceSha256: protectedFile.sha256,
    available: ['SOURCE_GOLDEN', 'CANDIDATE_DECODE'],
    requiredOracles: ['golden-metadata'],
    sufficientOracleSets: [['golden-metadata']],
  };
  const protectedProbe = scenario({
    id: 'probe/cenc-cbcs-selection',
    family: 'probe',
    op: 'probe',
    input: 'cenc-baked.mp4',
    requires: {
      operations: ['probe'],
      containersIn: ['mp4'],
      videoCodecs: ['h264'],
      audioCodecs: ['aac'],
      encryption: ['cenc-cbcs'],
      features: ['metadata:protected-tracks'],
    },
    oracles: ['golden-metadata'],
  });
  const protectedRow = row([protectedFile], {
    scenarioId: protectedProbe.id,
    class: 'DERIVED',
    requires: {
      container: 'mp4',
      video: true,
      videoCodecs: ['h264'],
      audioCodecs: ['aac'],
      encryption: ['cenc-cbcs'],
    },
  });

  test('a source-bound protected probe keeps probe semantics and its metadata oracle', () => {
    const sources = new Map([[protectedProbe.id, protectedRow]]);
    const selections = candidatesForRun([protectedProbe], sources, {
      bakedManifest: bakedManifest([{ id: 'cenc-baked.mp4', contents: 'baked protected bytes' }]),
    }).get(protectedProbe.id)!;
    const derived = selections.find((selection) => !selection.isBaked);
    expect(derived).toBeDefined();
    expect(derived?.effectiveScenario).toMatchObject({
      id: protectedProbe.id,
      op: 'probe',
      input: `scenarios/${protectedProbe.id}/${protectedFile.file}`,
      oracles: ['golden-metadata'],
    });
    expect(derived?.evidencePlan).toMatchObject({
      declaredAvailable: ['CANDIDATE_DECODE', 'SOURCE_GOLDEN'],
      requiredOracles: ['golden-metadata'],
      sufficientOracleSets: [['golden-metadata']],
    });
    expect((derived?.effectiveScenario.options as Record<string, unknown>).invariant).toBeUndefined();
  });

  test('missing decoded evidence, wrong scheme, or malformed key material fails closed', () => {
    const mutations: SourceFileRecord[] = [
      {
        ...protectedFile,
        evidence: {
          ...protectedFile.evidence!,
          available: ['SOURCE_GOLDEN'],
        },
      },
      {
        ...protectedFile,
        keys: { ...protectedFile.keys!, scheme: 'cenc-ctr' },
      },
      {
        ...protectedFile,
        keys: { ...protectedFile.keys!, kid: 'abcd' },
      },
    ];
    for (const file of mutations) {
      const eligibility = assessCandidateEligibility(
        protectedProbe,
        { ...protectedRow, files: [file] },
        file,
      );
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

  test('scenario/oracle contracts invalidate observation keys; current run re-envelopes one observation', () => {
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
        eligiblePoolDigest: sha256Hex('pool'),
        executedInputDigest: base.executedInputDigest,
        candidateCount: 3,
        catalogState: 'ready',
        startedAtIso: '2026-07-16T12:00:00.000Z',
      },
      { observationKey: key, runId: 'original-run', createdAtIso: '2026-07-15T12:00:00.000Z' },
    );
    expect(reused.envelope.eligiblePoolDigest).toBe(sha256Hex('pool'));
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
    const selA = selectForRun([scenario()], sources, { bakedManifest: bakedManifest([{ id: 'baked.mp4', contents: 'baked-v1' }]) }).get('probe/selection')!;
    const selB = selectForRun([scenario()], sources, { bakedManifest: bakedManifest([{ id: 'baked.mp4', contents: 'baked-v2' }]) }).get('probe/selection')!;
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

expect(SELECTION_POLICY_VERSION).toBe('canonical-candidate@1');
expect(SELECTION_ALGORITHM_ID).toBe('candidate-identity-lexicographic-min-v1');
