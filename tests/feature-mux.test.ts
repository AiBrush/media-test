import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { isNotApplicableError } from '../src/core/engine.ts';
import type { CapabilitySet, EncodedTracks, MediaEngine } from '../src/core/engine.ts';
import type { CodecSupport } from '../src/core/feature-detect.ts';
import type { ResolvedInput, VerifiedContent } from '../src/core/media-selection.ts';
import { runOne } from '../src/core/runner.ts';
import type { DisplayFrameEvidence } from '../src/features/decode-seek/index.ts';
import {
  MUX_ADVERTISED_WRITE_TARGETS,
  MUX_ORIENTATION_EVIDENCE_SCHEMA,
  MUX_OUTPUT_MODE_SCHEMA,
  MUX_SPARSE_CO64_ACCEPTANCE_CASE,
  MUX_SPARSE_FIXTURE_SCHEMA,
  MUX_TARGET_CONTRACT_SCHEMA,
  MUX_TIMELINE_SCHEMA,
  MUX_WRITE_TRACE_SCHEMA,
  assessLargeFileAddressing,
  assessMuxExecutionBoundary,
  assessMuxRotation,
  assessMuxTargetSemantics,
  assessMuxTrackSelection,
  compareMuxTimelines,
  createSparseCo64AcceptanceFixture,
  defineMuxRotationPolicy,
  evaluateMuxOutputMode,
  isDeliberatelyIllegalMuxScenario,
  isSparseMuxTargetWriter,
  muxOutputModeContractFromScenario,
  muxRotationPolicyFromScenario,
  muxTargetContractFromScenario,
  muxTimelineEvidenceFromProgram,
  normalizeMuxTrackSelection,
  parseMuxTrackSelector,
  preflightMuxApplicability,
  readMuxOrientation,
  readNeutralMuxTarget,
  validateMuxWriteTrace,
  type MuxCandidateTrackEvidence,
  type MuxDecision,
  type MuxOrientationReadResult,
  type MuxOutputModeContract,
  type MuxSourceTrackEvidence,
  type MuxTimelineEvidence,
  type MuxTimelineSample,
  type MuxWriteTrace,
  type SparseMp4FixtureDescriptor,
  type SparseMuxTargetWriter,
} from '../src/features/mux/index.ts';
import { muxCodecEdgeScenarios } from '../src/scenarios/mux/codec-edges.ts';
import { muxMultiSourceScenarios } from '../src/scenarios/mux/multi-source.ts';
import { muxNegativeScenarios } from '../src/scenarios/mux/negative.ts';
import { muxOutputModeScenarios } from '../src/scenarios/mux/output-modes.ts';
import { muxWriteTargetScenarios } from '../src/scenarios/mux/write-targets.ts';
import { muxSizeLadderScenarios } from '../src/scenarios/mux/size-ladder.ts';
import { muxScenarios } from '../src/scenarios/mux/index.ts';

function bytesAt(path: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`../${path}`, import.meta.url)));
}

function jsonAt<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')) as T;
}

function verdict(decision: MuxDecision): string {
  return decision.state === 'VERDICT' ? decision.verdict : decision.state;
}

describe('REQ-FEAT-12 illegal rejection versus valid tuple applicability', () => {
  test('all four declared-illegal IDs execute and pass only on a clean rejection', () => {
    expect(muxNegativeScenarios).toHaveLength(4);
    for (const scenario of muxNegativeScenarios) {
      expect(isDeliberatelyIllegalMuxScenario(scenario), scenario.id).toBe(true);
      expect(() => preflightMuxApplicability(
        scenario,
        'test-engine',
        { inputContainers: ['mp4'], inputCodecs: ['h264'], outputContainer: 'wav', outputCodecs: ['h264'] },
        { supported: false, reasonCode: 'MUX_TUPLE_UNSUPPORTED' },
      ), scenario.id).not.toThrow();
      expect(assessMuxExecutionBoundary(scenario, {
        state: 'REJECTED', reasonCode: 'ILLEGAL_CONTAINER_CODEC', detail: 'rejected before output',
      })).toMatchObject({ state: 'VERDICT', verdict: 'PASS', reasonCode: 'MUX_ILLEGAL_COMBINATION_REJECTED' });
      expect(assessMuxExecutionBoundary(scenario, {
        state: 'NOT_APPLICABLE', reasonCode: 'MUX_TUPLE_UNSUPPORTED', detail: 'skipped',
      })).toMatchObject({ state: 'VERDICT', verdict: 'FAIL', reasonCode: 'MUX_ILLEGAL_COMBINATION_MISCLASSIFIED_NA' });
      expect(assessMuxExecutionBoundary(scenario, { state: 'RETURNED_OUTPUT', byteLength: 8 })).toMatchObject({
        state: 'VERDICT', verdict: 'FAIL', reasonCode: 'MUX_ILLEGAL_COMBINATION_ACCEPTED',
      });
    }
  });

  test('a valid unsupported tuple throws the shared realm-safe NotApplicableError', () => {
    const scenario = muxScenarios.find((entry) => entry.id === 'mux/h264_aac_to_mkv')!;
    let thrown: unknown;
    try {
      preflightMuxApplicability(
        scenario,
        'tuple-limited-engine',
        { inputContainers: ['mp4'], inputCodecs: ['h264', 'aac'], outputContainer: 'mkv', outputCodecs: ['h264', 'aac'] },
        { supported: false, reasonCode: 'MUX_AV_TO_MKV_UNIMPLEMENTED', detail: 'tokens exist; tuple does not' },
      );
    } catch (error) {
      thrown = error;
    }
    expect(isNotApplicableError(thrown)).toBe(true);
    if (isNotApplicableError(thrown)) {
      expect(thrown.reasonCode).toBe('MUX_AV_TO_MKV_UNIMPLEMENTED');
      expect(thrown.tuple.outputContainer).toBe('mkv');
    }
    expect(assessMuxExecutionBoundary(scenario, { state: 'RETURNED_OUTPUT', byteLength: 100 })).toMatchObject({
      verdict: 'PASS', reasonCode: 'MUX_APPLICABLE_OUTPUT_RETURNED',
    });
  });
});

describe('REQ-FEAT-13 shared selector grammar and semantic multi-source identity', () => {
  const sourceTracks: MuxSourceTrackEvidence[] = [
    {
      sourceIndex: 0, sourceAssetId: 'video-a.mp4', sourceTrackIndex: 0,
      type: 'video', typeOrdinal: 0, codec: 'avc1.640028',
      identities: [{ kind: 'frame-watermark', value: 'watermark-A' }],
    },
    {
      sourceIndex: 0, sourceAssetId: 'video-a.mp4', sourceTrackIndex: 1,
      type: 'audio', typeOrdinal: 0, codec: 'aac',
      identities: [{ kind: 'tone-frequency', value: '440' }],
    },
    {
      sourceIndex: 1, sourceAssetId: 'audio-b.aac', sourceTrackIndex: 0,
      type: 'audio', typeOrdinal: 0, codec: 'mp4a.40.2',
      identities: [{ kind: 'tone-frequency', value: '880' }],
    },
  ];

  test('normalizes source-qualified selectors once and ignores output track order/IDs', () => {
    expect(parseMuxTrackSelector('video:0@12')).toMatchObject({
      type: 'video', typeOrdinal: 0, sourceIndex: 12, canonical: 'video:0@12',
    });
    expect(() => parseMuxTrackSelector('video[0]')).toThrow();
    expect(() => normalizeMuxTrackSelection(sourceTracks, ['video:0', 'audio:0@1'])).toThrow(/must include @SOURCE/);

    const plan = normalizeMuxTrackSelection(sourceTracks, ['video:0@0', 'audio:0@1']);
    const reordered: MuxCandidateTrackEvidence[] = [
      { outputTrackId: 'track-91', type: 'audio', codec: 'aac', identities: [{ kind: 'tone-frequency', value: '880' }] },
      { outputTrackId: 'track-2', type: 'video', codec: 'h264', identities: [{ kind: 'frame-watermark', value: 'watermark-A' }] },
    ];
    expect(assessMuxTrackSelection(plan, reordered)).toMatchObject({
      state: 'VERDICT', verdict: 'PASS', reasonCode: 'MUX_SEMANTIC_TRACK_SELECTION_MATCH',
    });

    const wrongAudio = structuredClone(reordered) as MuxCandidateTrackEvidence[];
    wrongAudio[0] = { ...wrongAudio[0]!, identities: [{ kind: 'tone-frequency', value: '440' }] };
    expect(assessMuxTrackSelection(plan, wrongAudio)).toMatchObject({ verdict: 'FAIL' });
    expect(assessMuxTrackSelection(plan, [...reordered, reordered[0]!])).toMatchObject({
      verdict: 'FAIL', reasonCode: 'MUX_SELECTION_CARDINALITY_MISMATCH',
    });
    expect(() => normalizeMuxTrackSelection(sourceTracks, ['audio:0@1', 'audio:0@1'])).toThrow(/duplicates/);
  });

  test('every registered multi-source assembly carries unambiguous shared selectors', () => {
    const multiSource = [
      ...muxMultiSourceScenarios.filter((scenario) => Array.isArray(scenario.input)),
      muxScenarios.find((scenario) => scenario.id === 'mux/video_plus_audio_to_mp4')!,
    ];
    for (const scenario of multiSource) {
      const selectors = (scenario.options as Record<string, unknown>).trackSelect;
      expect(Array.isArray(selectors), scenario.id).toBe(true);
      for (const selector of selectors as string[]) expect(selector, scenario.id).toMatch(/^(video|audio):\d+@\d+$/);
    }
  });
});

interface PacketGoldenRow {
  trackIndex: number;
  ptsUs: number;
  dtsUs: number;
  keyframe: boolean;
}

function fixtureTimeline(path: string, sampleCount: number): MuxTimelineEvidence {
  const packets = jsonAt<PacketGoldenRow[]>(path).filter((packet) => packet.trackIndex === 0).slice(0, sampleCount);
  const samples: MuxTimelineSample[] = packets.map((packet, index) => {
    const next = packets[index + 1];
    const prior = packets[index - 1];
    const duration = next
      ? next.dtsUs - packet.dtsUs
      : packet.dtsUs - (prior?.dtsUs ?? packet.dtsUs - 33_333);
    return {
      decodeIndex: index,
      pts: packet.ptsUs,
      dts: packet.dtsUs,
      duration,
      keyframe: packet.keyframe,
    };
  });
  return {
    schema: MUX_TIMELINE_SCHEMA,
    tracks: [{ semanticId: 'video-source-0', type: 'video', codec: 'h264', timescale: 1_000_000, samples }],
  };
}

function rescaleTimeline(evidence: MuxTimelineEvidence, timescale: number): MuxTimelineEvidence {
  const convert = (value: number, sourceScale: number): number => Math.round(value * timescale / sourceScale);
  return {
    schema: MUX_TIMELINE_SCHEMA,
    tracks: evidence.tracks.map((track) => ({
      ...track,
      timescale,
      samples: track.samples.map((sample) => ({
        ...sample,
        pts: convert(sample.pts, track.timescale),
        dts: convert(sample.dts, track.timescale),
        duration: convert(sample.duration, track.timescale),
      })),
    })),
  };
}

describe('REQ-FEAT-14 full DTS/PTS/duration/composition/VFR timeline', () => {
  test('B-frame fixture survives exact rational rescaling within one target tick', () => {
    const neutral = readNeutralMuxTarget(bytesAt('fixtures/media/h264_bframes_1080p.mp4'), 'mp4');
    expect(neutral.state).toBe('OK');
    if (neutral.state === 'OK') {
      const built = muxTimelineEvidenceFromProgram(neutral.value);
      expect(built.state).toBe('OK');
      if (built.state === 'OK') {
        expect(compareMuxTimelines(built.value, built.value)).toMatchObject({ verdict: 'PASS' });
      }
    }
    const reference = fixtureTimeline('fixtures/golden/h264_bframes_1080p.mp4.packets.json', 12);
    const candidate = rescaleTimeline(reference, 90_000);
    expect(compareMuxTimelines(reference, candidate)).toMatchObject({
      state: 'VERDICT', verdict: 'PASS', reasonCode: 'MUX_TIMELINE_EQUIVALENT_REPRESENTATION',
    });

    const collapsed = structuredClone(candidate) as MuxTimelineEvidence;
    collapsed.tracks[0]!.samples.forEach((sample) => {
      (sample as { dts: number }).dts = sample.pts;
    });
    expect(compareMuxTimelines(reference, collapsed)).toMatchObject({ verdict: 'FAIL' });
  });

  test('VFR fixture has nonuniform intervals and a cadence/composition mutation fails', () => {
    const reference = fixtureTimeline('fixtures/golden/h264_vfr.mp4.packets.json', 20);
    const sorted = [...reference.tracks[0]!.samples].sort((a, b) => a.pts - b.pts);
    const intervals = sorted.slice(1).map((sample, index) => sample.pts - sorted[index]!.pts);
    expect(new Set(intervals).size).toBeGreaterThan(2);
    const candidate = rescaleTimeline(reference, 90_000);
    (candidate.tracks[0]!.samples[8] as { pts: number }).pts += 4;
    expect(compareMuxTimelines(reference, candidate)).toMatchObject({ verdict: 'FAIL' });
  });
});

describe('REQ-FEAT-15 positioned output modes and fragment internals', () => {
  test('replays exact incremental bytes, rejects one-shot/gap/overlap, and bounds buffering', () => {
    const bytes = concatBytes(
      mp4Box('ftyp', new Uint8Array([0, 0, 0, 0])),
      mp4Box('moov'),
      mp4Box('mdat', new Uint8Array(5_000).fill(0x5a)),
    );
    const trace = appendTrace(bytes, [100, 2_000, bytes.byteLength - 2_100], 512);
    const streamContract: MuxOutputModeContract = {
      schema: MUX_OUTPUT_MODE_SCHEMA,
      mode: 'stream',
      minimumIncrementalBytes: 4_096,
      maximumBufferedBytes: 1_024,
      profile: 'generic-fragmented-mp4',
    };
    expect(validateMuxWriteTrace(trace, bytes, false)).toMatchObject({ verdict: 'PASS' });
    expect(evaluateMuxOutputMode(streamContract, { bytes, trace })).toMatchObject({
      verdict: 'PASS', reasonCode: 'MUX_INCREMENTAL_STREAM_VALID',
    });
    expect(evaluateMuxOutputMode(streamContract, { bytes, trace: appendTrace(bytes, [bytes.byteLength], 512) })).toMatchObject({
      verdict: 'FAIL', reasonCode: 'MUX_STREAM_NOT_INCREMENTAL',
    });
    expect(evaluateMuxOutputMode(streamContract, { bytes, trace: { ...trace, peakBufferedBytes: 2_048 } })).toMatchObject({
      verdict: 'FAIL', reasonCode: 'MUX_STREAM_BUFFER_BOUND_EXCEEDED',
    });
    const mismatch = structuredClone(trace) as MuxWriteTrace;
    const changed = mismatch.writes[1]!.bytes.slice();
    changed[0] ^= 1;
    (mismatch.writes[1] as { bytes: Uint8Array }).bytes = changed;
    expect(validateMuxWriteTrace(mismatch, bytes, false)).toMatchObject({
      verdict: 'FAIL', reasonCode: 'MUX_WRITE_RECONSTRUCTION_MISMATCH',
    });

    const initialHeader = bytes.slice(0, 100);
    initialHeader[28] ^= 0xff;
    const positionedPatch: MuxWriteTrace = {
      schema: MUX_WRITE_TRACE_SCHEMA,
      finalByteLength: bytes.byteLength,
      peakBufferedBytes: 512,
      reservations: [],
      writes: [
        { sequence: 0, atMs: 0, position: 0, bytes: initialHeader, kind: 'append' },
        { sequence: 1, atMs: 1, position: 100, bytes: bytes.slice(100), kind: 'append' },
        { sequence: 2, atMs: 2, position: 28, bytes: bytes.slice(28, 29), kind: 'patch' },
      ],
    };
    expect(validateMuxWriteTrace(positionedPatch, bytes, false)).toMatchObject({
      verdict: 'PASS', reasonCode: 'MUX_WRITE_RECONSTRUCTION_EXACT',
    });
  });

  test('reserve mode proves forward media write followed by an in-range positioned patch', () => {
    const ftyp = mp4Box('ftyp', new Uint8Array([0, 0, 0, 0]));
    const moov = mp4Box('moov', new Uint8Array(64));
    const mdat = mp4Box('mdat', new Uint8Array(5_000));
    const bytes = concatBytes(ftyp, moov, mdat);
    const trace: MuxWriteTrace = {
      schema: MUX_WRITE_TRACE_SCHEMA,
      finalByteLength: bytes.byteLength,
      peakBufferedBytes: 512,
      reservations: [{ sequence: 1, position: ftyp.byteLength, length: moov.byteLength }],
      writes: [
        { sequence: 0, atMs: 0, position: 0, bytes: ftyp, kind: 'append' },
        { sequence: 2, atMs: 1, position: ftyp.byteLength + moov.byteLength, bytes: mdat, kind: 'append' },
        { sequence: 3, atMs: 2, position: ftyp.byteLength, bytes: moov, kind: 'patch' },
      ],
    };
    expect(evaluateMuxOutputMode({
      schema: MUX_OUTPUT_MODE_SCHEMA,
      mode: 'faststart-reserve',
      minimumIncrementalBytes: 4_096,
      profile: 'generic-fragmented-mp4',
    }, { bytes, trace })).toMatchObject({ verdict: 'PASS', reasonCode: 'MUX_FASTSTART_RESERVE_VALID' });

    const outside = structuredClone(trace) as MuxWriteTrace;
    (outside.writes[2] as { position: number }).position = 0;
    expect(validateMuxWriteTrace(outside, bytes, true)).toMatchObject({ verdict: 'FAIL' });
  });

  test('generic fragmented MP4 re-import checks traf/tfdt/trun/addressing internals', () => {
    const bytes = bytesAt('fixtures/media/fragmented_cmaf.mp4');
    expect(evaluateMuxOutputMode({
      schema: MUX_OUTPUT_MODE_SCHEMA,
      mode: 'fragmented-mp4',
      minimumIncrementalBytes: 4_096,
      profile: 'generic-fragmented-mp4',
    }, { bytes })).toMatchObject({
      verdict: 'PASS', reasonCode: 'MUX_GENERIC_FMP4_CONTRACT_MATCH',
      measurements: { fragments: 2, samples: 309 },
    });
    const truncated = bytes.subarray(0, bytes.byteLength - 1);
    expect(evaluateMuxOutputMode({
      schema: MUX_OUTPUT_MODE_SCHEMA,
      mode: 'fragmented-mp4',
      minimumIncrementalBytes: 4_096,
      profile: 'generic-fragmented-mp4',
    }, { bytes: truncated })).toMatchObject({ verdict: 'FAIL' });
  });
});

describe('REQ-FEAT-16 decisive neutral readers for every advertised mux target', () => {
  const fixtures = [
    ['micro_h264_1frame.mp4', 'mp4'],
    ['h264_1080p_5s.mov', 'mov'],
    ['h264_in_mkv.mkv', 'mkv'],
    ['tiny_vp9_360p_2s.webm', 'webm'],
    ['opus.ogg', 'ogg'],
    ['wav_s16.wav', 'wav'],
    ['aac_adts.aac', 'adts'],
    ['mp3_xing.mp3', 'mp3'],
    ['h264_ts.ts', 'ts'],
  ] as const;

  test('all nine targets parse complete media and produce a semantic verdict', () => {
    expect(fixtures.map(([, target]) => target)).toEqual([...MUX_ADVERTISED_WRITE_TARGETS]);
    for (const [file, target] of fixtures) {
      const bytes = bytesAt(`fixtures/media/${file}`);
      const read = readNeutralMuxTarget(bytes, target);
      expect(read.state, file).toBe('OK');
      if (read.state !== 'OK') continue;
      const tracks = read.value.tracks
        .filter((track) => track.type === 'video' || track.type === 'audio')
        .map((track) => ({ type: track.type as 'video' | 'audio', codec: track.codec }));
      expect(assessMuxTargetSemantics(bytes, {
        schema: MUX_TARGET_CONTRACT_SCHEMA,
        container: target,
        tracks,
        durationToleranceUs: 125_000,
      }), file).toMatchObject({ state: 'VERDICT', verdict: 'PASS', reasonCode: 'MUX_TARGET_SEMANTIC_REIMPORT_VALID' });
    }
  });

  test('every registered target maps to a contract; malformed bytes FAIL and reader gaps ERROR', () => {
    const covered = new Set<string>();
    for (const scenario of [...muxWriteTargetScenarios, ...muxScenarios]) {
      const contract = muxTargetContractFromScenario(scenario);
      if (contract) covered.add(contract.container);
      if (!scenario.oracles.includes('graceful-failure') &&
          scenario.id !== MUX_SPARSE_CO64_ACCEPTANCE_CASE.id) {
        expect(scenario.oracles, scenario.id).toContain('reference-reimport');
      }
    }
    expect(covered).toEqual(new Set(MUX_ADVERTISED_WRITE_TARGETS));

    const mp4 = bytesAt('fixtures/media/micro_h264_1frame.mp4');
    expect(assessMuxTargetSemantics(mp4.subarray(0, mp4.byteLength - 1), {
      schema: MUX_TARGET_CONTRACT_SCHEMA,
      container: 'mp4',
      tracks: [{ type: 'video', codec: 'h264' }],
      durationToleranceUs: 125_000,
    })).toMatchObject({ state: 'VERDICT', verdict: 'FAIL', reasonCode: 'MUX_TARGET_BYTES_INVALID' });
    expect(assessMuxTargetSemantics(mp4, {
      schema: MUX_TARGET_CONTRACT_SCHEMA,
      container: 'avi' as 'mp4',
      tracks: [],
      durationToleranceUs: 0,
    })).toMatchObject({ state: 'ERROR', reasonCode: 'MUX_TARGET_READER_COVERAGE_ERROR' });
  });

  test('keep-all target semantics allow dynamic extra tracks while selection proves exact membership', () => {
    const scenario = muxScenarios.find((entry) => entry.id === 'mux/edge_multitrack_keep_all_to_mp4')!;
    const contract = muxTargetContractFromScenario(scenario)!;
    expect(contract).toMatchObject({ allowAdditionalTracks: true });
    expect(contract.tracks).toHaveLength(2);
    expect(assessMuxTargetSemantics(bytesAt('fixtures/media/h264_multitrack.mp4'), contract)).toMatchObject({
      state: 'VERDICT',
      verdict: 'PASS',
      reasonCode: 'MUX_TARGET_SEMANTIC_REIMPORT_VALID',
    });
  });
});

describe('REQ-FEAT-17 generic fragmented MP4 is not mislabeled CMAF', () => {
  test('scenario/contract use a generic profile and a non-CMAF-branded fMP4 is never CMAF PASS', () => {
    expect(muxOutputModeScenarios.some((scenario) => scenario.id === 'mux/mp4_fragmented')).toBe(true);
    expect(muxOutputModeScenarios.some((scenario) => scenario.id.includes('cmaf'))).toBe(false);
    const scenario = muxOutputModeScenarios.find((entry) => entry.id === 'mux/mp4_fragmented')!;
    expect(muxOutputModeContractFromScenario(scenario)).toMatchObject({
      mode: 'fragmented-mp4', profile: 'generic-fragmented-mp4',
    });
    const bytes = bytesAt('fixtures/media/fragmented_cmaf.mp4');
    expect(evaluateMuxOutputMode({
      schema: MUX_OUTPUT_MODE_SCHEMA,
      mode: 'fragmented-mp4', minimumIncrementalBytes: 0, profile: 'generic-fragmented-mp4',
    }, { bytes })).toMatchObject({ verdict: 'PASS', reasonCode: 'MUX_GENERIC_FMP4_CONTRACT_MATCH' });
    expect(evaluateMuxOutputMode({
      schema: MUX_OUTPUT_MODE_SCHEMA,
      mode: 'fragmented-mp4', minimumIncrementalBytes: 0, profile: 'cmaf',
    }, { bytes })).toMatchObject({ verdict: 'FAIL', reasonCode: 'CMAF_BRAND_MISSING' });
  });
});

describe('REQ-FEAT-18 sparse >4 GiB co64 and large-size addressing', () => {
  test('reads authored samples on both sides of 0xffffffff without allocating the virtual extent', () => {
    const descriptor = jsonAt<SparseMp4FixtureDescriptor>('fixtures/golden/mux_sparse_gt4gib.layout.json');
    expect(descriptor.schema).toBe(MUX_SPARSE_FIXTURE_SCHEMA);
    const fixture = createSparseCo64AcceptanceFixture(descriptor);
    expect(MUX_SPARSE_CO64_ACCEPTANCE_CASE).toMatchObject({
      id: 'mux/size_sparse_gt4gib_co64', resourceGate: 'long', virtualFileKind: 'sparse-generated-mp4',
    });
    expect(fixture.source.size).toBeGreaterThan(0xffff_ffffn);
    const result = assessLargeFileAddressing(fixture.source, {
      requireBeyondUint32: true,
      expectedSamplePrefixes: fixture.expectedSamplePrefixes,
      maximumMetadataBytes: 1_024 * 1_024,
    });
    expect(result.decision).toMatchObject({
      state: 'VERDICT', verdict: 'PASS', reasonCode: 'MUX_CO64_LARGE_FILE_ADDRESSING_VALID',
      measurements: { offsetsBelowUint32: 1, offsetsAboveUint32: 1, samplePrefixesVerified: 2, largeSizeBoxes: 1 },
    });
    expect(result.evidence?.stcoOffsets).toEqual([]);
    expect(result.evidence?.co64Offsets).toEqual([4_096n, 4_294_967_552n]);
  });

  test('registered long scenario judges the sparse artifact authored by engine.mux', async () => {
    const scenario = muxSizeLadderScenarios.find((entry) => entry.id === 'mux/size_sparse_gt4gib_co64')!;
    expect(scenario).toBeDefined();
    expect(scenario.requires.features).toContain('mux:sparse-co64');
    expect(scenario.options).toMatchObject({
      invariant: 'mux-large-file-addressing',
      robustness: { muxLargeFile: { resourceGate: 'long', virtualFileKind: 'sparse-generated-mp4' } },
    });

    const descriptor = jsonAt<SparseMp4FixtureDescriptor>('fixtures/golden/mux_sparse_gt4gib.layout.json');
    const inputBytes = new Uint8Array([1, 2, 3, 4]);
    const inputSha = '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a';
    const inputId = String(scenario.input);
    const resolvedInputs: ResolvedInput[] = [{
      id: inputId, urlAssetPath: inputId, sha256: inputSha, sizeBytes: inputBytes.byteLength,
      integrity: 'VERIFIED',
    }];
    const verifiedContents: VerifiedContent[] = [{
      state: 'VERIFIED',
      identity: { logicalPath: inputId, sha256: inputSha, sizeBytes: inputBytes.byteLength },
      bytes: inputBytes,
      actualSha256: inputSha,
      actualSizeBytes: inputBytes.byteLength,
    }];
    const priorFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith(`${inputId}.meta.json`)) {
        return Response.json({
          container: 'mp4', durationSec: 1 / 30,
          tracks: [{ type: 'video', codec: 'h264', width: 16, height: 16, fps: 30 }],
        });
      }
      return new Response(null, { status: 404, statusText: 'Not Found' });
    }) as typeof fetch;

    const codecSupport: CodecSupport = {
      webcodecs: false, videoDecode: {}, videoEncode: {}, audioDecode: {}, audioEncode: {},
      alpha: false, strictRgbaPixels: false, strictGoldenRgba: false, strictSourceRgba: false,
      webgpu: false, measureMemory: false,
    };
    const tracks: EncodedTracks = {
      tracks: [{
        type: 'video', codec: 'h264', timescale: 1_000_000, packetOrdering: 'decode',
        timebase: { numerator: 1, denominator: 1_000_000 },
        framing: 'annexb', accessUnitGrouping: 'one-access-unit-per-chunk',
        parameterSetLocation: 'in-band', width: 16, height: 16,
        chunks: [{
          data: new Uint8Array([0, 0, 1, 0x65]), ptsUs: 0, dtsUs: 0, decodeIndex: 0,
          durationUs: 33_333, keyframe: true,
        }],
      }],
    };
    const run = (declaresSparse: boolean, omitHighSample = false) => {
      const capabilities: CapabilitySet = {
        operations: { demux: true, mux: true }, containersIn: ['mp4'], containersOut: ['mp4'],
        videoCodecs: ['h264'], audioCodecs: [], encryption: [],
        features: declaresSparse ? ['mux:sparse-co64'] : [],
      };
      const engine: MediaEngine = {
        id: `mux-sparse-test-${declaresSparse ? 'yes' : 'no'}@1.0.0`,
        capabilities: () => capabilities,
        async demux() {
          return {
            metadata: { container: 'mp4', durationSec: 1 / 30, tracks: [{ type: 'video', codec: 'h264' }] },
            packets: [],
          };
        },
        prepareMuxTracks: async () => structuredClone(tracks),
        async mux(_tracks, options) {
          if (!isSparseMuxTargetWriter(options.sparseTarget)) {
            throw new Error('runner did not inject the sparse mux target');
          }
          const target: SparseMuxTargetWriter = options.sparseTarget;
          const authored = createSparseCo64AcceptanceFixture(descriptor);
          target.setSize(authored.source.size);
          target.write(0n, authored.source.read(0n, 512));
          for (const [offset, prefix] of authored.expectedSamplePrefixes) {
            if (omitHighSample && offset > 0xffff_ffffn) continue;
            target.write(offset, prefix);
          }
          return {
            bytes: authored.source.read(0n, 32), mime: 'video/mp4', container: 'mp4',
          };
        },
      };
      return runOne(engine, scenario, 'chromium', codecSupport, {
        pillar: 'functional',
        pixelBehavior: { state: 'SUPPORTED', reasonCode: 'PIXEL_RGBA_ROUNDTRIP_OK', detail: 'test' },
        resolvedInputs,
        verifiedContents,
      });
    };

    try {
      const undeclared = await run(false);
      expect(undeclared.status).toBe('NA_ENGINE');

      const passing = await run(true);
      expect(passing.status).toBe('PASS');
      expect(passing.oracleOutcomes).toContainEqual(expect.objectContaining({
        state: 'VERDICT', oracle: 'property-invariant', verdict: 'PASS',
        reasonCode: 'MUX_CO64_LARGE_FILE_ADDRESSING_VALID',
        measurements: expect.objectContaining({
          offsetsBelowUint32: 1, offsetsAboveUint32: 1, samplePrefixesVerified: 2, largeSizeBoxes: 1,
        }),
      }));

      const missingHighSample = await run(true, true);
      expect(missingHighSample.status).toBe('FAIL');
      expect(missingHighSample.oracleOutcomes).toContainEqual(expect.objectContaining({
        state: 'VERDICT', verdict: 'FAIL', reasonCode: 'MUX_SAMPLE_ADDRESS_READBACK_MISMATCH',
      }));
    } finally {
      globalThis.fetch = priorFetch;
    }
  });
});

describe('REQ-FEAT-19 rotation structure plus presentation under an explicit policy', () => {
  const digest = 'ab'.repeat(32);
  const displayedFrames: DisplayFrameEvidence[] = [
    { ptsUs: 0, width: 720, height: 1_280, rgbaSha256: digest },
    { ptsUs: 33_333, width: 720, height: 1_280, rgbaSha256: digest },
  ];

  test('inspects the source matrix and accepts preserve or baked pixels, never drop/double apply', () => {
    const source = readMuxOrientation(bytesAt('fixtures/media/h264_rotated90.mp4'), 'mp4');
    expect(source).toMatchObject({
      state: 'OK',
      value: {
        codedWidth: 1_280, codedHeight: 720, displayWidth: 720, displayHeight: 1_280,
        rotationDegrees: 90, representation: 'isobmff-track-matrix',
      },
    });
    const policy = defineMuxRotationPolicy('preserve-or-bake');
    expect(assessMuxRotation(source, source, displayedFrames, displayedFrames, policy)).toMatchObject({
      verdict: 'PASS', reasonCode: 'MUX_ROTATION_STRUCTURE_AND_PRESENTATION_MATCH',
    });

    const baked = orientation('mov', 720, 1_280, 0, 'none');
    expect(assessMuxRotation(source, baked, displayedFrames, displayedFrames, policy)).toMatchObject({
      verdict: 'PASS', reasonCode: 'MUX_ROTATION_BAKED_PRESENTATION_EQUIVALENT',
    });

    const dropped = orientation('mov', 1_280, 720, 0, 'none');
    expect(assessMuxRotation(source, dropped, displayedFrames, displayedFrames, policy)).toMatchObject({
      verdict: 'FAIL', reasonCode: 'MUX_ROTATION_STRUCTURE_MISMATCH',
    });
    const corruptPresentation = displayedFrames.map((frame, index) => index === 1
      ? { ...frame, rgbaSha256: 'cd'.repeat(32) }
      : frame);
    expect(assessMuxRotation(source, source, displayedFrames, corruptPresentation, policy)).toMatchObject({ verdict: 'FAIL' });
  });

  test('reads Matroska ProjectionPoseRoll and surfaces representation translation as a representation difference', () => {
    const source = readMuxOrientation(bytesAt('fixtures/media/h264_rotated90.mp4'), 'mp4');
    const matroska = readMuxOrientation(orientedMatroska(), 'mkv');
    expect(matroska).toMatchObject({
      state: 'OK', value: { codedWidth: 1_280, codedHeight: 720, rotationDegrees: 90,
        representation: 'matroska-projection-roll' },
    });
    expect(assessMuxRotation(source, matroska, displayedFrames, displayedFrames)).toMatchObject({
      verdict: 'PASS', reasonCode: 'MUX_ROTATION_METADATA_REPRESENTATION_CHANGED',
    });
  });

  test('rotation scenarios declare policy and unverified identity source evidence is NA_ASSET', () => {
    const rotationRows = muxCodecEdgeScenarios.filter((scenario) => scenario.id.includes('rotation'));
    expect(rotationRows).toHaveLength(2);
    for (const scenario of rotationRows) {
      expect(muxRotationPolicyFromScenario(scenario)).toMatchObject({ mode: 'preserve-or-bake' });
    }
    const identitySource = readMuxOrientation(bytesAt('fixtures/media/h264_1080p_5s.mov'), 'mov');
    expect(assessMuxRotation(identitySource, identitySource, displayedFrames, displayedFrames)).toMatchObject({
      state: 'UNAVAILABLE', status: 'NA_ASSET', reasonCode: 'MUX_ROTATION_REFERENCE_UNVERIFIED',
    });
  });
});

function mp4Box(type: string, payload = new Uint8Array()): Uint8Array {
  const out = new Uint8Array(8 + payload.byteLength);
  new DataView(out.buffer).setUint32(0, out.byteLength, false);
  out.set(new TextEncoder().encode(type), 4);
  out.set(payload, 8);
  return out;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.byteLength; }
  return out;
}

function appendTrace(bytes: Uint8Array, sizes: readonly number[], peakBufferedBytes: number): MuxWriteTrace {
  let position = 0;
  return {
    schema: MUX_WRITE_TRACE_SCHEMA,
    finalByteLength: bytes.byteLength,
    peakBufferedBytes,
    reservations: [],
    writes: sizes.map((size, sequence) => {
      const write = {
        sequence,
        atMs: sequence,
        position,
        bytes: bytes.slice(position, position + size),
        kind: 'append' as const,
      };
      position += size;
      return write;
    }),
  };
}

function orientation(
  container: 'mp4' | 'mov' | 'mkv' | 'webm',
  codedWidth: number,
  codedHeight: number,
  rotationDegrees: 0 | 90 | 180 | 270,
  representation: 'isobmff-track-matrix' | 'matroska-projection-roll' | 'none',
): MuxOrientationReadResult {
  const swap = rotationDegrees === 90 || rotationDegrees === 270;
  return {
    state: 'OK',
    value: {
      schema: MUX_ORIENTATION_EVIDENCE_SCHEMA,
      container,
      codedWidth,
      codedHeight,
      displayWidth: swap ? codedHeight : codedWidth,
      displayHeight: swap ? codedWidth : codedHeight,
      rotationDegrees,
      representation,
    },
  };
}

function orientedMatroska(): Uint8Array {
  const uint = (value: number): Uint8Array => value > 0xff
    ? new Uint8Array([value >> 8, value & 0xff])
    : new Uint8Array([value]);
  const float = new Uint8Array(4);
  new DataView(float.buffer).setFloat32(0, 90, false);
  const video = ebml([0xe0], concatBytes(
    ebml([0xb0], uint(1_280)),
    ebml([0xba], uint(720)),
    ebml([0x76, 0x70], ebml([0x76, 0x75], float)),
  ));
  const entry = ebml([0xae], concatBytes(ebml([0x83], uint(1)), video));
  const tracks = ebml([0x16, 0x54, 0xae, 0x6b], entry);
  return ebml([0x18, 0x53, 0x80, 0x67], tracks);
}

function ebml(id: readonly number[], payload: Uint8Array): Uint8Array {
  if (payload.byteLength >= 127) throw new Error('test EBML helper only supports one-byte sizes');
  return concatBytes(new Uint8Array(id), new Uint8Array([0x80 | payload.byteLength]), payload);
}
