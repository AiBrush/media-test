import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';

import type { NormalizedTrack } from '../src/core/engine.ts';
import {
  HLS_PLAYLIST_ONLY_PROBE_SCHEMA,
  HLS_PROTECTED_SEGMENT_PROBE_SCHEMA,
  PROBE_COVERAGE_DECISIONS,
  PROBE_HEADERLESS_DURATION_SCHEMA,
  PROBE_SCALE_BUDGETS,
  assessCrossContainerProbeDuration,
  assessDeclaredMetadataFields,
  assessHeaderlessProbeDuration,
  assessHlsPlaylistOnlyProbe,
  assessHlsPlaylistOnlyResourceAccess,
  assessHlsProtectedSegmentResourceAccess,
  assessProbeBudget,
  assessProbeWrapperEquivalence,
  auditProbeCoverageDecisions,
  defineProbeMetadataFieldPolicy,
  headerlessDurationContractFromOptions,
  hlsProbeContractFromOptions,
  metadataFieldPolicyFromOptions,
  parseProbeWrapperEquivalenceEvidence,
  probeBudgetFromOptions,
  probeBudgetPreflight,
  readHlsPlaylistProbeEvidence,
  type ProbeMetadataObservation,
} from '../src/features/probe/index.ts';
import { probeScenarios } from '../src/scenarios/probe/index.ts';

function jsonAt(path: string): unknown {
  return JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')) as unknown;
}

function textAt(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function scenario(id: string) {
  return probeScenarios.find((entry) => entry.id === id)!;
}

function observation(overrides: Partial<ProbeMetadataObservation> = {}): ProbeMetadataObservation {
  return {
    container: 'mp4',
    durationSec: 10,
    tracks: [{
      type: 'video', codec: 'h264', width: 1280, height: 720, fps: 30,
      rotation: 90, bitrate: 3_000_000, language: 'eng',
    }],
    tags: { title: 'probe-title', major_brand: 'isom' },
    protection: { encrypted: true, scheme: 'cenc', source: 'container' },
    ...overrides,
  };
}

function verdictOf(value: ReturnType<typeof assessDeclaredMetadataFields>): string {
  return value.state === 'VERDICT' ? value.verdict : value.state;
}

describe('REQ-FEAT-34 declared metadata fields', () => {
  const policy = defineProbeMetadataFieldPolicy({
    fields: [
      'duration-nullability',
      'track.rotation',
      'track.bitrate',
      'track.language',
      'tags',
      'protection.scheme',
    ],
    tagKeys: ['title'],
    protectionSchemes: ['cenc'],
    bitrateRelativeTolerance: 0.01,
  });

  test('an exact observation passes and a legal raw rotation spelling is a representation difference', () => {
    const golden = observation();
    expect(assessDeclaredMetadataFields(observation(), golden, policy)).toMatchObject({
      state: 'VERDICT', verdict: 'PASS', reasonCode: 'PROBE_DECLARED_METADATA_FIELDS_MATCH',
    });
    const equivalent = observation({ tracks: [{ ...golden.tracks[0]!, rotation: -270 }] });
    // Feature-internal ProbeContractVerdict retains a 'DIFF' representation-difference classification;
    // it maps to a PASS OracleVerdict at the probeAssessmentOutcome boundary. The reasonCode is what
    // distinguishes it from an exact match and survives into the correctness outcome.
    expect(assessDeclaredMetadataFields(equivalent, golden, policy)).toMatchObject({
      state: 'VERDICT', verdict: 'DIFF', reasonCode: 'PROBE_DECLARED_METADATA_REPRESENTATION_DIFFERENCE',
    });
  });

  test('mutating every golden-backed declared field independently fails', () => {
    const golden = observation();
    const mutations: ProbeMetadataObservation[] = [
      observation({ tracks: [{ ...golden.tracks[0]!, rotation: 180 }] }),
      observation({ tracks: [{ ...golden.tracks[0]!, bitrate: 2_000_000 }] }),
      observation({ tracks: [{ ...golden.tracks[0]!, language: 'fra' }] }),
      observation({ tags: { title: 'changed' } }),
      observation({ protection: { encrypted: true, scheme: 'cbcs', source: 'container' } }),
      observation({ durationSec: null }),
    ];
    for (const measured of mutations) {
      expect(verdictOf(assessDeclaredMetadataFields(measured, golden, policy))).toBe('FAIL');
    }
    expect(verdictOf(assessDeclaredMetadataFields(
      observation({ durationSec: 1 }),
      observation({ durationSec: null }),
      defineProbeMetadataFieldPolicy({ fields: ['duration-nullability'] }),
    ))).toBe('FAIL');
  });

  test('omitting undeclared optional fields does not false-fail', () => {
    const measured = observation({
      tracks: [{ type: 'video', codec: 'h264', width: 1280, height: 720 }],
      tags: undefined,
      protection: undefined,
    });
    expect(assessDeclaredMetadataFields(
      measured,
      observation(),
      defineProbeMetadataFieldPolicy({ fields: ['duration-nullability'] }),
    )).toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
  });

  test('registered scenarios carry explicit policies for rotation, language, bitrate, tags, protection and nullability', () => {
    for (const id of [
      'probe/h264_rotated90',
      'probe/big_buck_bunny_1080p_h264',
      'probe/wav_s16',
      'probe/h264_1080p_30s',
      'probe/cenc_ctr',
      'probe/empty-audio-wav',
    ]) {
      expect(metadataFieldPolicyFromOptions(scenario(id).options)?.fields.length).toBeGreaterThan(0);
    }
  });
});

describe('REQ-FEAT-35 real cross-container duration property', () => {
  test('committed wrappers have identical elementary-stream hashes in different containers', () => {
    const evidence = parseProbeWrapperEquivalenceEvidence(
      jsonAt('fixtures/golden/probe-duration-equivalent-wrappers.json'),
    );
    expect(evidence).toBeDefined();
    expect(assessProbeWrapperEquivalence(evidence!)).toMatchObject({
      state: 'VERDICT', verdict: 'PASS', reasonCode: 'PROBE_WRAPPERS_CONTENT_EQUIVALENT',
    });
  });

  test('records per-input golden deltas and the maximum direct wrapper delta', () => {
    const assessed = assessCrossContainerProbeDuration([
      { assetId: 'a.mp4', container: 'mp4', durationSec: 10, goldenDurationSec: 10, toleranceSec: 0.05 },
      { assetId: 'a.mkv', container: 'mkv', durationSec: 10.021, goldenDurationSec: 10.021, toleranceSec: 0.05 },
    ]);
    expect(assessed).toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
    expect(assessed.state === 'VERDICT' && assessed.measurements?.maximumCrossWrapperDeltaSec).toBeCloseTo(0.021, 8);
    expect(assessed.state === 'VERDICT' && assessed.measurements?.['goldenDeltaSec:a.mp4']).toBe(0);
  });

  test('shifting one wrapper fails the direct comparison as well as its unchanged golden', () => {
    expect(assessCrossContainerProbeDuration([
      { assetId: 'a.mp4', container: 'mp4', durationSec: 10, goldenDurationSec: 10, toleranceSec: 0.05 },
      { assetId: 'a.mkv', container: 'mkv', durationSec: 10.5, goldenDurationSec: 10.021, toleranceSec: 0.05 },
    ])).toMatchObject({
      state: 'VERDICT', verdict: 'FAIL', reasonCode: 'PROBE_CROSS_WRAPPER_DURATION_MISMATCH',
    });
  });

  test('scenario uses the proven 10-second MP4/Matroska pair', () => {
    const item = scenario('probe/metamorphic-duration-across-containers');
    expect(item.input).toEqual(['h264_rotated90.mp4', 'h264_in_mkv.mkv']);
    expect((item.options as Record<string, unknown>).invariant).toBe('probe-duration-cross-wrapper');
  });
});

describe('REQ-FEAT-36 headerless sane duration', () => {
  test('null and bounded finite estimates are valid, with finite a representation difference', () => {
    expect(assessHeaderlessProbeDuration(null)).toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
    // Feature-internal ProbeContractVerdict retains a 'DIFF' representation-difference classification;
    // it maps to a PASS OracleVerdict at the probeAssessmentOutcome boundary, with the reasonCode kept.
    expect(assessHeaderlessProbeDuration(3)).toMatchObject({
      state: 'VERDICT', verdict: 'DIFF', reasonCode: 'PROBE_HEADERLESS_DURATION_FINITE_ESTIMATE',
    });
  });

  test('NaN, negative, infinity and out-of-bound durations fail', () => {
    for (const value of [Number.NaN, -0.001, Number.POSITIVE_INFINITY, 3.481]) {
      expect(assessHeaderlessProbeDuration(value)).toMatchObject({ state: 'VERDICT', verdict: 'FAIL' });
    }
  });

  test('registered row explicitly declares unknown-duration policy and content-derived bound', () => {
    const contract = headerlessDurationContractFromOptions(
      scenario('probe/metamorphic-recorder-headerless-sane-duration').options,
    );
    expect(contract).toMatchObject({
      schema: PROBE_HEADERLESS_DURATION_SCHEMA,
      allowUnknown: true,
      contentSpanSec: 2.98,
      tailAndRoundingAllowanceSec: 0.5,
    });
  });
});

describe('REQ-FEAT-37 AES-128 HLS key-free honesty', () => {
  const playlist = textAt('fixtures/media/hls_aes128.m3u8');

  test('playlist reader derives only EXTINF duration and EXT-X-KEY protection', () => {
    expect(readHlsPlaylistProbeEvidence(playlist)).toMatchObject({
      state: 'OK',
      value: { durationSec: 10, segmentCount: 5, encrypted: true, methods: ['AES-128'] },
    });
    expect(assessHlsPlaylistOnlyProbe({
      container: 'hls',
      durationSec: 10,
      tracks: [{ type: 'video', codec: 'deliberately-not-asserted' }],
      protection: { encrypted: true, scheme: 'hls-aes128', source: 'playlist' },
    }, playlist)).toMatchObject({
      state: 'VERDICT', verdict: 'PASS', reasonCode: 'HLS_PLAYLIST_ONLY_PROBE_MATCH',
    });
  });

  test('key denial leaves playlist-only PASS but makes protected track probing NA_ASSET', () => {
    const trace = [
      { role: 'playlist', uri: 'hls_aes128.m3u8', disposition: 'read' },
      { role: 'key', uri: 'hls_aes128.key', disposition: 'denied' },
    ] as const;
    expect(assessHlsPlaylistOnlyResourceAccess(trace)).toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
    expect(assessHlsProtectedSegmentResourceAccess(trace)).toMatchObject({
      state: 'UNAVAILABLE', status: 'NA_ASSET', reasonCode: 'HLS_PROTECTED_SEGMENT_KEY_DENIED',
    });
  });

  test('track-detail contract requires both a key and protected segment read', () => {
    expect(assessHlsProtectedSegmentResourceAccess([
      { role: 'playlist', uri: 'hls_aes128.m3u8', disposition: 'read' },
      { role: 'key', uri: 'hls_aes128.key', disposition: 'read' },
      { role: 'segment', uri: 'hls_aes128_000.ts', disposition: 'read' },
    ])).toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
    expect(assessHlsProtectedSegmentResourceAccess([
      { role: 'key', uri: 'hls_aes128.key', disposition: 'read' },
      { role: 'segment', uri: 'hls_aes128_000.ts', disposition: 'read' },
    ])).toMatchObject({ state: 'ERROR', reasonCode: 'HLS_PROTECTED_SEGMENT_PLAYLIST_TRACE_MISSING' });
    expect(assessHlsPlaylistOnlyResourceAccess([])).toMatchObject({
      state: 'ERROR', reasonCode: 'HLS_PLAYLIST_RESOURCE_TRACE_MISSING',
    });
  });

  test('scenario battery splits key-free and protected-segment observations', () => {
    const keyFree = scenario('probe/hls_aes128_playlist_key_free');
    const protectedRow = scenario('probe/hls_aes128');
    expect(keyFree.requires.videoCodecs ?? keyFree.requires.videoCodecsIn).toBeUndefined();
    expect(hlsProbeContractFromOptions(keyFree.options)?.schema).toBe(HLS_PLAYLIST_ONLY_PROBE_SCHEMA);
    expect(protectedRow.requires.videoCodecs).toEqual(['h264']);
    expect(hlsProbeContractFromOptions(protectedRow.options)?.schema).toBe(HLS_PROTECTED_SEGMENT_PROBE_SCHEMA);
  });
});

describe('REQ-FEAT-38 bounded scale probing', () => {
  test('an adapter without range/progressive mode is inapplicable before allocation', () => {
    expect(probeBudgetPreflight(PROBE_SCALE_BUDGETS.massive, 1_400_000_000, ['whole-file'])).toMatchObject({
      supported: false,
      reasonCode: 'PROBE_BOUNDED_READ_MODE_UNAVAILABLE',
      tuple: { scale: 'massive', inputSizeBytes: 1_400_000_000 },
    });
  });

  test('bounded telemetry passes while bulk reads, memory growth and missing telemetry do not', () => {
    const valid = {
      inputSizeBytes: 1_400_000_000,
      readMode: 'range' as const,
      bytesRead: 8 * 1024 * 1024,
      peakMemoryDeltaBytes: 24 * 1024 * 1024,
    };
    expect(assessProbeBudget(PROBE_SCALE_BUDGETS.massive, valid)).toMatchObject({
      state: 'VERDICT', verdict: 'PASS', reasonCode: 'PROBE_SCALE_BUDGET_MET',
    });
    expect(assessProbeBudget(PROBE_SCALE_BUDGETS.massive, { ...valid, bytesRead: 100 * 1024 * 1024 })).toMatchObject({
      state: 'VERDICT', verdict: 'FAIL', reasonCode: 'PROBE_SCALE_BUDGET_EXCEEDED',
    });
    expect(assessProbeBudget(PROBE_SCALE_BUDGETS.massive, { ...valid, peakMemoryDeltaBytes: 200 * 1024 * 1024 })).toMatchObject({
      state: 'VERDICT', verdict: 'FAIL', reasonCode: 'PROBE_SCALE_BUDGET_EXCEEDED',
    });
    expect(assessProbeBudget(PROBE_SCALE_BUDGETS.massive, {
      inputSizeBytes: valid.inputSizeBytes,
      readMode: 'range',
      peakMemoryDeltaBytes: valid.peakMemoryDeltaBytes,
    })).toMatchObject({ state: 'ERROR', reasonCode: 'PROBE_SOURCE_READ_TELEMETRY_MISSING' });
  });

  test('large through massive scenario rows declare budgets and peak-memory measurement', () => {
    for (const id of [
      'probe/large_h264_1080p_120s',
      'probe/large_vp9_1080p_120s',
      'probe/huge_h264_1080p_600s',
      'probe/huge_vp9_1080p_240s',
      'probe/massive_h264_1080p_2h',
      'probe/massive_vp9_1080p_2h',
      'probe/perf-extract-metadata-large',
      'probe/perf-extract-metadata-huge',
      'probe/perf-extract-metadata-massive',
    ]) {
      const item = scenario(id);
      expect(probeBudgetFromOptions(item.options)).toBeDefined();
      expect(item.metrics).toContain('peakMemory');
    }
  });
});

describe('REQ-FEAT-39 executable coverage decisions', () => {
  test('every historical gap is a present scenario+golden or a versioned OUT_OF_SCOPE decision', () => {
    const ids = new Set(probeScenarios.map((entry) => entry.id));
    const audit = auditProbeCoverageDecisions(PROBE_COVERAGE_DECISIONS, {
      scenarioExists: (id) => ids.has(id),
      assetExists: (id) => existsSync(new URL(`../fixtures/media/${id}`, import.meta.url)),
      goldenExists: (id) => existsSync(new URL(`../fixtures/golden/${id}`, import.meta.url)),
    });
    expect(audit).toMatchObject({
      state: 'VERDICT', verdict: 'PASS', reasonCode: 'PROBE_COVERAGE_DECISIONS_COMPLETE',
    });
  });

  test('registered coverage rows point only to existing assets with metadata goldens', () => {
    for (const decision of PROBE_COVERAGE_DECISIONS.decisions) {
      if (decision.status !== 'SCENARIO') continue;
      expect(existsSync(new URL(`../fixtures/media/${decision.assetId}`, import.meta.url))).toBeTrue();
      expect(existsSync(new URL(`../fixtures/golden/${decision.goldenId}`, import.meta.url))).toBeTrue();
    }
  });
});
