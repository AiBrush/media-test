import { describe, expect, test } from 'bun:test';
import { $ } from 'bun';

import {
  GOLDEN_METADATA_SCHEMA,
  GOLDEN_NORMALIZATION_VERSION,
  GOLDEN_PACKETS_SCHEMA,
  PACKET_SEMANTICS_VERSION,
  compactGoldenPacketEvidence,
  expandCompactGoldenPacketEvidence,
  buildGoldenFrameProbeArgs,
  buildGoldenPacketProbeArgs,
  buildGoldenStreamDataProbeArgs,
  buildGoldenSemanticDecodeArgs,
  canonicalJson,
  normalizeGoldenPacketEvidence,
  mergeGoldenFrames,
  mergeGoldenStreamData,
  normalizeProbeMetadata,
  parseMappedFrameMd5,
  selectPresentationFramePlaceholders,
} from '../fixtures/lib/golden-normalization.mjs';
import { readCompactGoldenPacketRows } from '../src/core/lossless-json-columnar.ts';
import { loadGolden } from '../src/core/oracles.ts';
import {
  MAX_COLUMNAR_SCALAR_JSON_BYTES,
  validateColumnarNode,
} from '../fixtures/lib/lossless-json-columnar-validator.mjs';
import {
  BENTO4_CBCS_IV_LABEL,
  LEGACY_FFMPEG_CENC_CTR_IDENTITY,
  buildBento4CbcsEncryptionArgs,
  flatFramePlaceholderForGolden,
  flatProtectedReferenceLimitationForGolden,
  normalizeFlatProbeForGolden,
} from '../fixtures/bake.mjs';
import {
  normalizeScenarioProbeForGolden,
  scenarioFramePlaceholderForGolden,
} from '../fixtures/bake-scenario-goldens.mjs';
import {
  PROTECTED_PROBE_DERIVATIONS,
  assertProtectedProbeCandidate,
  buildProtectedProbeCatalogRows,
} from '../fixtures/curate-protected-probe-candidates.mjs';

// Correctness is binary now; a representation difference is a PASS distinguished by its reasonCode.
type OracleView = { verdict: 'PASS' | 'FAIL'; reasonCode: string };

describe('REQ-FIX-05 production-shared versioned normalization', () => {
  test('identical probe JSON and presentation observations are byte-identical through both bake paths', () => {
    const probe = metadataProbe();
    const frames = frameProbe(0, [66_733, 0, 33_367, 33_367, 100_100]);
    const flat = normalizeFlatProbeForGolden(probe, frames, 'same.mp4');
    const scenario = normalizeScenarioProbeForGolden(probe, frames, 'same.mp4');

    expect(JSON.stringify(flat)).toBe(JSON.stringify(scenario));
    expect(flat).toMatchObject({
      schema: GOLDEN_METADATA_SCHEMA,
      schemaVersion: GOLDEN_NORMALIZATION_VERSION,
    });

    const source = { sha256: '1'.repeat(64), sizeBytes: 123 };
    const expectedFrames = selectPresentationFramePlaceholders(frames);
    const flatPlaceholder = flatFramePlaceholderForGolden('same.mp4', source, frames);
    const scenarioPlaceholder = scenarioFramePlaceholderForGolden('same.mp4', source, frames);
    expect(JSON.stringify(flatPlaceholder)).toBe(JSON.stringify(scenarioPlaceholder));
    expect(flatPlaceholder.frames).toEqual(expectedFrames);
    expect(expectedFrames.map((frame: { ptsUs: number }) => frame.ptsUs)).toEqual([
      0, 33_367, 66_733, 100_100,
    ]);
  });

  test('both production entrypoints call the shared packet/decode builders and contain no local normalizer copy', async () => {
    const flatSource = await Bun.file('fixtures/bake.mjs').text();
    const scenarioSource = await Bun.file('fixtures/bake-scenario-goldens.mjs').text();
    const normalizationSource = await Bun.file('fixtures/lib/golden-normalization.mjs').text();
    for (const source of [flatSource, scenarioSource]) {
      expect(source).toContain('buildGoldenPacketProbeArgs(inOpts, mediaPath)');
      expect(source).toContain('runStreamingFfprobePacketProbe({');
      expect(source).toContain('preparePacketProbeForNormalization(captured, DEFAULT_COMPACT_PACKET_ROW_THRESHOLD)');
      expect(source).toContain('captured.cleanup()');
      expect(source).toMatch(/buildGoldenFrameProbeArgs\(/);
      expect(source).toContain('buildGoldenStreamDataProbeArgs(inOpts, mediaPath)');
      expect(source).toContain('mergeGoldenStreamData(prepared.probe, streamProbe)');
      expect(source).toContain('const probe = mergeGoldenFrames(');
      expect(source).toMatch(/buildGoldenSemanticDecodeArgs\(/);
      expect(source).toContain('normalizeGoldenPacketEvidence(probe');
      expect(source).toContain('iterateMappedFrameMd5Lines');
      expect(source).toContain('inputStreams');
      expect(source).toContain('publicationScope,');
      expect(source).toContain("activeScope?.mode === 'complete-corpus'");
      expect(source).toContain('stagedRootAssetIds');
      expect(source).not.toMatch(/function\s+canonicalCodec\s*\(/);
      expect(source).not.toMatch(/function\s+parseFps\s*\(/);
    }
    expect(flatSource).toContain('withDecodedReference(assetId, mediaPath, inOpts');
    expect(flatSource).toContain('compactStorage: prepared.compactStorage');
    expect(flatSource).toContain('packetSource: prepared.packetSource');
    expect(flatSource).not.toContain('ffprobeJson(buildGoldenPacketProbeArgs(inOpts, mediaPath)');
    expect(flatSource).not.toContain('compactGoldenPacketEvidence(packets');
    expect(flatSource).not.toContain("h.update(readFileSync(path))");
    expect(flatSource).toContain('decryptProtectedMp4ForReference(assetId, mediaPath, protectedSecret)');
    expect(flatSource).toContain('flatProtectedReferenceLimitationForMedia(assetId, mediaPath)');
    expect(flatSource).not.toContain("inputOptions: ['-decryption_key', protectedSecret.keyHex]");
    expect(scenarioSource).toContain('withDecodedReference(assetId, mediaPath, catalogFile');
    expect(scenarioSource).toContain("'mp4decrypt'");
    expect(scenarioSource).toContain('representationProbe.streams ?? []');
    expect(scenarioSource).not.toContain("'-decryption_key'");
    expect(scenarioSource).not.toContain("createHash('sha256').update(bytes)");
    expect(normalizationSource).toContain('const firstForTrack = !firstPacketSeen.has(trackIndex)');
    expect(normalizationSource).toContain('packetSource.rows()');
    expect(normalizationSource).toContain('packetRowsByTime.get(`${trackIndex}:${decoded.ptsUs}`)');
    expect(normalizationSource).not.toContain('normalizedPackets.filter(');
    expect(normalizationSource).not.toContain('firstPacketIndexForTrack(');

    expect(buildGoldenPacketProbeArgs([], 'input.mp4')).not.toContain('-show_frames');
    expect(buildGoldenPacketProbeArgs([], 'input.mp4')).not.toContain('-show_data');
    expect(buildGoldenPacketProbeArgs([], 'input.mp4')).toContain('-show_data_hash');
    expect(buildGoldenFrameProbeArgs([], 'input.mp4')).toEqual(expect.arrayContaining([
      '-select_streams', 'v',
      '-show_frames', '-show_entries',
      'frame=stream_index,pts_time,best_effort_timestamp_time,duration_time,key_frame,pict_type',
      '-read_intervals', `%+#76`,
    ]));
    expect(buildGoldenStreamDataProbeArgs([], 'input.mp4')).toEqual(expect.arrayContaining([
      '-show_streams', '-show_data', '-show_data_hash', 'sha256',
    ]));
    expect(buildGoldenSemanticDecodeArgs([], 'input.mp4')).toEqual(expect.arrayContaining([
      '-map', '0:v?', '-map', '0:a?', '-f', 'framemd5', '-hash', 'sha256', '-',
    ]));
  });

  test('protected probe curation reuses three structurally genuine candidates per declared scheme', async () => {
    const rows = (await Bun.file('fixtures/media/scenarios/_sources.ndjson').text()).trim().split(/\r?\n/u).map((line) => JSON.parse(line));
    const replacements = buildProtectedProbeCatalogRows(rows);
    for (const contract of PROTECTED_PROBE_DERIVATIONS) {
      const row = replacements.get(contract.scenarioId)!;
      expect(row).toMatchObject({
        class: 'DERIVED',
        requires: { encryption: [contract.catalogScheme] },
      });
      expect(row.files).toHaveLength(3);
      for (const file of row.files) {
        expect(file.evidence).toMatchObject({
          sourceSha256: file.sha256,
          available: ['SOURCE_GOLDEN', 'CANDIDATE_DECODE'],
          requiredOracles: ['golden-metadata'],
          sufficientOracleSets: [['golden-metadata']],
        });
        if (contract.materialization === 'probe-owned') {
          const published = rows.find((candidate) => candidate.scenarioId === contract.scenarioId);
          expect(row).toEqual(published);
          continue;
        }
        const sourcePath = `fixtures/media/scenarios/${contract.sourceScenarioId}/${file.file}`;
        const evidence = assertProtectedProbeCandidate(
          new Uint8Array(await Bun.file(sourcePath).arrayBuffer()),
          file,
          contract,
        );
        expect(evidence.state).toBe('OK');
        if (evidence.state === 'OK') {
          expect(evidence.tracks.filter((track) => track.protected).map((track) => track.scheme))
            .toEqual(expect.arrayContaining([contract.boxScheme]));
        }
      }
    }
  });

  test('stream-only representation bytes merge without changing packet timeline evidence', () => {
    const packetProbe = {
      streams: [{ index: 0, codec_name: 'h264' }, { index: 1, codec_name: 'aac' }],
      packets: [{ stream_index: 0, pts: 0, data_hash: `SHA256:${'1'.repeat(64)}` }],
    };
    const merged = mergeGoldenStreamData(packetProbe, {
      streams: [{ index: 1, extradata: '00000000: 1210' }, { index: 0, extradata: '00000000: 0164' }],
    });

    expect(merged.packets).toEqual(packetProbe.packets);
    expect(merged.streams).toEqual([
      { index: 0, codec_name: 'h264', extradata: '00000000: 0164' },
      { index: 1, codec_name: 'aac', extradata: '00000000: 1210' },
    ]);
    expect(mergeGoldenFrames(merged, { frames: [{ stream_index: 0, pts_time: '0.0' }] })).toEqual({
      ...merged,
      frames: [{ stream_index: 0, pts_time: '0.0' }],
    });
  });

  test('bounded cadence probing discards only the decoder-flush overread tail', () => {
    const contiguous = Array.from({ length: 75 }, (_, index) => index * 33_367);
    const withFlushTail = [...contiguous, contiguous.at(-1)! + 66_734];
    const normalized = normalizeProbeMetadata(metadataProbe(), {
      assetId: 'flush-tail.mp4',
      frameProbe: frameProbe(0, withFlushTail),
    });

    expect(normalized.canonical.tracks[0]).toMatchObject({ cadenceMode: 'CFR' });
    expect(normalized.canonical.tracks[0].fpsMin).toBeCloseTo(30_000 / 1_001, 3);
    expect(normalized.canonical.tracks[0].fpsMax).toBeCloseTo(30_000 / 1_001, 3);
  });
});

describe('REQ-FIX-01 raw plus canonical multi-view metadata', () => {
  test('codec aliases, video/audio order, and same-type track reorder keep one canonical document but raw representation-diff evidence', () => {
    const baseProbe = metadataProbe();
    const aliasProbe = metadataProbe({ aliases: true, reordered: true });
    const base = normalizeProbeMetadata(baseProbe, {
      assetId: 'flat/same.mp4',
      frameProbe: frameProbe(0, [0, 33_367, 66_733, 100_100]),
    });
    const alternative = normalizeProbeMetadata(aliasProbe, {
      assetId: 'scenarios/family/same.mp4',
      frameProbe: frameProbe(9, [100_100, 0, 66_733, 33_367]),
    });

    expect(base.canonical).toEqual(alternative.canonical);
    expect(base.raw).not.toEqual(alternative.raw);
    expect(viewVerdict(base, base)).toMatchObject({ verdict: 'PASS', reasonCode: 'ORACLE_MATCH' });
    expect(viewVerdict(base, alternative)).toMatchObject({ verdict: 'PASS', reasonCode: 'ORACLE_REPRESENTATION_DIFF' });
    expect(base.metadata.tracks[0]).toMatchObject({
      codec: 'h264', codecRaw: 'avc1', codecCanonical: 'h264',
      rateRational: { numerator: 30_000, denominator: 1_001 },
    });
    expect(alternative.metadata.tracks[0]).toMatchObject({
      codec: 'h264', codecRaw: 'avc3', codecCanonical: 'h264',
    });

    const twoAudio = metadataProbe({ secondAudio: true });
    const reversed = structuredClone(twoAudio);
    reversed.streams = [twoAudio.streams[2], twoAudio.streams[1], twoAudio.streams[0]];
    const firstCanonical = normalizeProbeMetadata(twoAudio, {
      assetId: 'same.mp4', frameProbe: frameProbe(0, [0, 33_367, 66_733]),
    }).canonical;
    const reversedCanonical = normalizeProbeMetadata(reversed, {
      assetId: 'same.mp4', frameProbe: frameProbe(0, [0, 33_367, 66_733]),
    }).canonical;
    expect(reversedCanonical).toEqual(firstCanonical);
    expect(firstCanonical.tracks.filter((track: { type: string }) => track.type === 'audio')
      .map((track: { semanticOrdinal: number }) => track.semanticOrdinal)).toEqual([0, 1]);
  });

  test('HE-AAC v1/v2 expose coded and presentation SBR/PS views while unsignaled AAC cannot borrow them', () => {
    const v1Probe = metadataProbe();
    v1Probe.streams[1] = {
      ...v1Probe.streams[1],
      codec_name: 'mp4a.40.5',
      profile: 'HE-AAC',
      channels: 2,
    };
    const v1 = normalizeProbeMetadata(v1Probe, { assetId: 'heaac-v1.m4a' });
    expect(v1.canonical.tracks[1]).toMatchObject({
      codec: 'aac', audioObjectType: 5, sbrPresent: true, psPresent: false,
      sampleRate: 48_000, codedSampleRate: 24_000, presentationSampleRate: 48_000,
      codedChannels: 2, presentationChannels: 2,
    });

    const v2 = normalizeProbeMetadata(metadataProbe(), { assetId: 'heaac-v2.m4a' });
    expect(v2.canonical.tracks[1]).toMatchObject({
      codec: 'aac', audioObjectType: 29, sbrPresent: true, psPresent: true,
      sampleRate: 48_000, codedSampleRate: 24_000, presentationSampleRate: 48_000,
      channels: 2, codedChannels: 1, presentationChannels: 2,
      primingSamples: 1_024, remainderSamples: 512,
    });

    const lcProbe = metadataProbe();
    lcProbe.streams[1] = {
      ...lcProbe.streams[1],
      codec_name: 'aac', codec_tag_string: 'mp4a', profile: 'LC', sample_rate: '24000', channels: 1,
    };
    const lc = normalizeProbeMetadata(lcProbe, { assetId: 'aac-lc.m4a' });
    expect(lc.canonical.tracks[1]).toMatchObject({
      audioObjectType: 2, sbrPresent: false, psPresent: false,
      codedSampleRate: 24_000, presentationSampleRate: 24_000,
      codedChannels: 1, presentationChannels: 1,
    });
  });

  test('NTSC rational, VFR envelope, edit-list, timebase, and AAC priming remain separate evidence views', () => {
    const probe = metadataProbe();
    probe.format.duration = '9.500000';
    probe.format.start_time = '0.500000';
    const normalized = normalizeProbeMetadata(probe, {
      assetId: 'timeline.mp4',
      frameProbe: frameProbe(0, [0, 33_367, 83_367, 116_734]),
    });
    expect(normalized.canonical).toMatchObject({
      presentationStartSec: 0.5,
      presentationDurationSec: 9.5,
      mediaDurationSec: 10,
      rawMediaSpanSec: 10,
      sampleSpanSec: 10.01,
      editListSpanSec: 9.5,
    });
    expect(normalized.canonical.tracks[0]).toMatchObject({
      fpsNumerator: 30_000,
      fpsDenominator: 1_001,
      rateRational: { numerator: 30_000, denominator: 1_001 },
      cadence: 'VFR',
      mediaTimebase: { numerator: 1, denominator: 90_000 },
    });
    expect(normalized.canonical.tracks[0].fpsMin).toBeLessThan(normalized.canonical.tracks[0].fpsMax);
    expect(normalized.canonical.timebaseTickUs).toBeCloseTo(1_000_000 / 90_000, 6);

    const cfr = normalizeProbeMetadata(metadataProbe(), {
      assetId: 'ntsc.mp4', frameProbe: frameProbe(0, [0, 33_367, 66_733, 100_100]),
    });
    expect(cfr.canonical.tracks[0]).toMatchObject({ cadence: 'CFR', fpsNumerator: 30_000, fpsDenominator: 1_001 });
    expect(cfr.canonical.tracks[0].fps).toBeCloseTo(30_000 / 1_001, 3);
  });

  test.each([
    ['wrong codec', (probe: any) => { probe.streams[0].codec_name = 'vp9'; probe.streams[0].codec_tag_string = 'vp09'; }],
    ['wrong type', (probe: any) => { probe.streams[1].codec_type = 'subtitle'; }],
    ['wrong rate', (probe: any) => { probe.streams[1].sample_rate = '44100'; }],
    ['wrong channels', (probe: any) => { probe.streams[1].channels = 6; }],
    ['wrong timeline', (probe: any) => { probe.format.duration = '7.000000'; }],
  ])('%s changes canonical semantics and remains FAIL evidence', (_name, mutate) => {
    const referenceProbe = metadataProbe();
    const candidateProbe = structuredClone(referenceProbe);
    mutate(candidateProbe);
    const reference = normalizeProbeMetadata(referenceProbe, { assetId: 'same.mp4' });
    const candidate = normalizeProbeMetadata(candidateProbe, { assetId: 'same.mp4' });
    expect(viewVerdict(reference, candidate)).toMatchObject({ verdict: 'FAIL' });
  });
});

describe('REQ-FIX-02/10 semantic access units versus representation fingerprints', () => {
  test('lossless columnar long-form storage round-trips every logical view and runtime packet row', () => {
    const packets = Array.from({ length: 64 }, (_, index) => ({
      stream_index: index % 2,
      size: String(100 + index),
      pts: String(index * 1_024),
      dts: String(index * 1_024 - (index % 3) * 512),
      duration: '1024',
      pts_time: String(index / 30),
      dts_time: String((index * 1_024 - (index % 3) * 512) / 30_720),
      duration_time: String(1 / 30),
      flags: index % 30 === 0 ? 'K__' : '___',
      pos: String(index * 4096),
      data_hash: `SHA256:${index.toString(16).padStart(64, '0')}`,
    }));
    const probe = packetProbe('avc1', 'one-row');
    probe.packets = packets;
    probe.frames = packets.map((packet) => ({
      stream_index: packet.stream_index,
      pts_time: packet.pts_time,
      key_frame: packet.flags.includes('K') ? 1 : 0,
      pict_type: packet.flags.includes('K') ? 'I' : 'P',
    }));
    const decodedUnits = packets.map((packet, index) => ({
      streamIndex: packet.stream_index,
      ptsUs: Math.round(Number(packet.pts_time) * 1_000_000),
      durationUs: 33_333,
      sha256: (index + 1).toString(16).padStart(64, '0'),
    }));
    const logical = normalizeGoldenPacketEvidence(probe, {
      assetId: 'long.mp4', decodedUnits, decoderObservation: { state: 'validated' },
    });
    // JSON text removes the deliberate packets↔representationFingerprint aliases, exercising the
    // destructive tree fast path independently from the alias-preserving fallback below.
    const consumed = JSON.parse(JSON.stringify(logical));
    const compact = compactGoldenPacketEvidence(consumed, { consume: true });
    const repeated = compactGoldenPacketEvidence(structuredClone(logical));
    const expanded = expandCompactGoldenPacketEvidence(compact);

    expect(canonicalJson(repeated)).toBe(canonicalJson(compact));
    expect(canonicalJson(expanded)).toBe(canonicalJson(logical));
    expect(canonicalJson((expanded as any).raw)).toBe(canonicalJson(logical.raw));
    expect(canonicalJson((expanded as any).semantic)).toBe(canonicalJson(logical.semantic));
    expect(canonicalJson((expanded as any).representation)).toBe(canonicalJson(logical.representation));
    expect(canonicalJson((expanded as any).packets)).toBe(canonicalJson(logical.packets));
    expect(canonicalJson(readCompactGoldenPacketRows(compact))).toBe(canonicalJson(logical.packets));
    expect(Object.keys(consumed)).toEqual([]);

    const direct = normalizeGoldenPacketEvidence(structuredClone(probe), {
      assetId: 'long.mp4', decodedUnits: structuredClone(decodedUnits),
      decoderObservation: { state: 'validated' }, compactStorage: true, consumeSource: true,
    });
    const directRepeated = normalizeGoldenPacketEvidence(structuredClone(probe), {
      assetId: 'long.mp4', decodedUnits: structuredClone(decodedUnits),
      decoderObservation: { state: 'validated' }, compactStorage: true, consumeSource: true,
    });
    expect(canonicalJson(directRepeated)).toBe(canonicalJson(direct));
    expect(canonicalJson(expandCompactGoldenPacketEvidence(direct))).toBe(canonicalJson(logical));
  });

  test('consume mode preserves aliased JSON values and rejects cycles before mutation', () => {
    const logical = normalizeGoldenPacketEvidence(packetProbe('avc1', 'one-row'), {
      assetId: 'same.mp4', decodedUnits: decodedUnits(), decoderObservation: { state: 'validated' },
    }) as any;
    const shared = { exact: ['aliased', 7] };
    logical.raw.aliasA = shared;
    logical.raw.aliasB = shared;
    const expected = canonicalJson(logical);
    const compact = compactGoldenPacketEvidence(logical, { consume: true });
    expect(canonicalJson(expandCompactGoldenPacketEvidence(compact))).toBe(expected);
    expect(logical.raw.aliasA).toBe(shared);
    expect(logical.raw.aliasB).toBe(shared);

    const cyclic = normalizeGoldenPacketEvidence(packetProbe('avc1', 'one-row'), {
      assetId: 'same.mp4', decodedUnits: decodedUnits(), decoderObservation: { state: 'validated' },
    }) as any;
    cyclic.raw.cycle = cyclic.raw;
    expect(() => compactGoldenPacketEvidence(cyclic, { consume: true })).toThrow(/cyclic/);
    expect(cyclic.raw.cycle).toBe(cyclic.raw);
  });

  test('lossless columnar mutation is rejected instead of yielding partial packet evidence', () => {
    const logical = normalizeGoldenPacketEvidence(packetProbe('avc1', 'one-row'), {
      assetId: 'same.mp4', decodedUnits: decodedUnits(), decoderObservation: { state: 'validated' },
    });
    const compact = compactGoldenPacketEvidence(structuredClone(logical));
    const wrongCount = structuredClone(compact) as any;
    wrongCount.rowCount += 1;
    expect(() => expandCompactGoldenPacketEvidence(wrongCount)).toThrow(/count contract/);
    expect(() => readCompactGoldenPacketRows(wrongCount)).toThrow(/count mismatch/);

    const wrongLogicalSchema = structuredClone(compact) as any;
    wrongLogicalSchema.logicalSchema = 'media-test/not-packet-evidence@1';
    expect(() => expandCompactGoldenPacketEvidence(wrongLogicalSchema)).toThrow(/unsupported compact/);
    expect(() => readCompactGoldenPacketRows(wrongLogicalSchema)).toThrow(/unsupported compact/);

    const duplicateRoot = structuredClone(compact) as any;
    const packetEntry = duplicateRoot.storage.root.entries.find((entry: any[]) => entry[0] === 'packets');
    duplicateRoot.storage.root.entries.push(structuredClone(packetEntry));
    expect(() => expandCompactGoldenPacketEvidence(duplicateRoot)).toThrow(/duplicate/);
    expect(() => readCompactGoldenPacketRows(duplicateRoot)).toThrow(/duplicate/);

    const unknownRoot = structuredClone(compact) as any;
    unknownRoot.storage.root.entries.push(['surprise', 1]);
    expect(() => expandCompactGoldenPacketEvidence(unknownRoot)).toThrow(/unknown/);
    expect(() => readCompactGoldenPacketRows(unknownRoot)).toThrow(/unknown/);

    const wrongInnerVersion = structuredClone(compact) as any;
    wrongInnerVersion.storage.root.entries.find((entry: any[]) => entry[0] === 'schemaVersion')[1] = 'packet-semantics@2';
    expect(() => expandCompactGoldenPacketEvidence(wrongInnerVersion)).toThrow(/logical schema/);
    expect(() => readCompactGoldenPacketRows(wrongInnerVersion)).toThrow(/inner schema/);

    const unknownOuter = structuredClone(compact) as any;
    unknownOuter.surprise = true;
    expect(() => expandCompactGoldenPacketEvidence(unknownOuter)).toThrow(/unknown keys/);
    expect(() => readCompactGoldenPacketRows(unknownOuter)).toThrow(/unknown keys/);

    const truncated = structuredClone(compact) as any;
    const stack = [truncated.storage.root];
    let delta: any;
    while (stack.length && !delta) {
      const value = stack.pop();
      if (value && typeof value === 'object' && value.$type === 'integer-delta-varint') delta = value;
      else if (Array.isArray(value)) stack.push(...value);
      else if (value && typeof value === 'object') stack.push(...Object.values(value));
    }
    expect(delta).toBeDefined();
    delta.count += 1;
    expect(() => expandCompactGoldenPacketEvidence(truncated)).toThrow(/truncated integer delta varint/);
    expect(() => readCompactGoldenPacketRows(truncated)).toThrow(/truncated integer delta varint/);

    const unknownInnerNode = structuredClone(compact) as any;
    unknownInnerNode.storage.root.surprise = true;
    expect(() => expandCompactGoldenPacketEvidence(unknownInnerNode)).toThrow(/unknown keys/);
    expect(() => readCompactGoldenPacketRows(unknownInnerNode)).toThrow(/unknown keys/);

    const numericPrefixedSuffix = structuredClone(compact) as any;
    const compactPackets = numericPrefixedSuffix.storage.root.entries
      .find((entry: any[]) => entry[0] === 'packets')[1];
    compactPackets.columns[0].values = {
      $type: 'prefixed-strings', prefix: 'prefix-', suffixes: { $type: 'array', values: [1] },
    };
    expect(() => expandCompactGoldenPacketEvidence(numericPrefixedSuffix)).toThrow(/prefixed string suffixes/);
    expect(() => readCompactGoldenPacketRows(numericPrefixedSuffix)).toThrow(/prefixed string suffixes/);

    const allocationTrap = structuredClone(compact) as any;
    allocationTrap.rowCount = Number.MAX_SAFE_INTEGER;
    allocationTrap.storage.root.entries.find((entry: any[]) => entry[0] === 'packets')[1].rowCount =
      Number.MAX_SAFE_INTEGER;
    expect(() => readCompactGoldenPacketRows(allocationTrap)).toThrow(/value count mismatch/);

    const emptyColumnAllocationTrap = structuredClone(compact) as any;
    emptyColumnAllocationTrap.rowCount = 100_000_000;
    emptyColumnAllocationTrap.storage.root.entries.find((entry: any[]) => entry[0] === 'packets')[1] = {
      $type: 'record-columns', rowCount: 100_000_000, columns: [],
    };
    expect(() => readCompactGoldenPacketRows(emptyColumnAllocationTrap)).toThrow(/nonempty record table/);

    const nestedRequiredScalars = structuredClone(compact) as any;
    const nestedPacketColumns = nestedRequiredScalars.storage.root.entries
      .find((entry: any[]) => entry[0] === 'packets')[1].columns;
    for (const key of ['trackIndex', 'size', 'ptsUs', 'keyframe']) {
      const column = nestedPacketColumns.find((candidate: any) => candidate.key === key);
      column.values = {
        $type: 'array',
        values: Array.from({ length: nestedRequiredScalars.rowCount }, () => ({ $type: 'array', values: [1] })),
      };
    }
    expect(() => readCompactGoldenPacketRows(nestedRequiredScalars)).toThrow(/mistyped/);

    const loneSurrogate = structuredClone(compact) as any;
    loneSurrogate.storage.root.entries.find((entry: any[]) => entry[0] === 'raw')[1].entries
      .push(['surrogate', '\ud800']);
    expect(() => expandCompactGoldenPacketEvidence(loneSurrogate)).toThrow(/lone high surrogate/);
    expect(() => readCompactGoldenPacketRows(loneSurrogate)).toThrow(/lone high surrogate/);

    expect(() => validateColumnarNode('x'.repeat(MAX_COLUMNAR_SCALAR_JSON_BYTES + 1)))
      .toThrow(/bounded scalar limit/);

    const magicKeyColumn = structuredClone(compact) as any;
    magicKeyColumn.storage.root.entries.find((entry: any[]) => entry[0] === 'packets')[1].columns.unshift({
      key: '__proto__',
      values: {
        $type: 'array',
        values: Array.from({ length: magicKeyColumn.rowCount }, () => ({
          $type: 'object', entries: [['polluted', true]],
        })),
      },
    });
    const runtimeMagicRows = readCompactGoldenPacketRows(magicKeyColumn) as any[];
    const offlineMagicRows = (expandCompactGoldenPacketEvidence(magicKeyColumn) as any).packets;
    for (const row of [runtimeMagicRows[0], offlineMagicRows[0]]) {
      expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
      expect(Object.prototype.hasOwnProperty.call(row, '__proto__')).toBe(true);
      expect(row.__proto__).toEqual({ polluted: true });
    }
    expect(({} as any).polluted).toBeUndefined();

    const nonVarintDictionary = structuredClone(compact) as any;
    nonVarintDictionary.storage.root.entries.find((entry: any[]) => entry[0] === 'raw')[1].entries.push([
      'zzDictionary',
      { $type: 'string-dictionary', indices: { $type: 'array', values: [0] }, values: ['only'] },
    ]);
    expect(() => expandCompactGoldenPacketEvidence(nonVarintDictionary)).toThrow(/indices must use integer delta/);
    expect(() => readCompactGoldenPacketRows(nonVarintDictionary)).toThrow(/indices must use integer delta/);
  });

  test('direct golden fallback unwraps a compact envelope while small legacy packet arrays remain valid', async () => {
    const logical = normalizeGoldenPacketEvidence(packetProbe('avc1', 'one-row'), {
      assetId: 'same.mp4', decodedUnits: decodedUnits(), decoderObservation: { state: 'validated' },
    });
    const compact = compactGoldenPacketEvidence(structuredClone(logical));
    const envelope = { schema: 'media-test/golden-artifact@1', payload: compact };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => Response.json(envelope)) as typeof fetch;
    try {
      const loaded = await loadGolden('same.mp4', { requestedKinds: ['packets'] });
      expect(loaded.evidence.packets.state).toBe('OK');
      expect(canonicalJson(loaded.packets)).toBe(canonicalJson(logical.packets));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('AVCC, in-band avc3 grouping, and Annex-B are representation-diff PASS with identical decoded semantics', () => {
    const decoded = decodedUnits();
    const avcc = normalizeGoldenPacketEvidence(packetProbe('avc1', 'one-row'), {
      assetId: 'a.mp4', decodedUnits: decoded, decoderObservation: { state: 'validated' },
    });
    const avc3 = normalizeGoldenPacketEvidence(packetProbe('avc3', 'split-idr'), {
      assetId: 'a.mp4', decodedUnits: decoded, decoderObservation: { state: 'validated' },
    });
    const annexB = normalizeGoldenPacketEvidence(packetProbe('annex-b', 'one-row'), {
      assetId: 'a.ts', decodedUnits: decoded, decoderObservation: { state: 'validated' },
    });

    for (const evidence of [avcc, avc3, annexB]) {
      expect(evidence).toMatchObject({
        schema: GOLDEN_PACKETS_SCHEMA,
        schemaVersion: PACKET_SEMANTICS_VERSION,
        semantic: { decoder: { state: 'validated', decodedUnits: 2 } },
      });
      expect(evidence.semantic.accessUnits).toHaveLength(2);
      expect(evidence.semantic.accessUnits.every((unit: { decodable: boolean }) => unit.decodable)).toBe(true);
    }
    expect(avcc.semantic).toEqual(avc3.semantic);
    expect(avcc.semantic).toEqual(annexB.semantic);
    expect(packetVerdict(avcc, avcc)).toMatchObject({ verdict: 'PASS', reasonCode: 'ORACLE_MATCH' });
    expect(packetVerdict(avcc, avc3)).toMatchObject({ verdict: 'PASS', reasonCode: 'ORACLE_REPRESENTATION_DIFF' });
    expect(packetVerdict(avcc, annexB)).toMatchObject({ verdict: 'PASS', reasonCode: 'ORACLE_REPRESENTATION_DIFF' });
    expect(avcc.representation.tracks[0]).toMatchObject({
      framing: 'length-prefixed', parameterSetLocation: 'description',
    });
    expect(avc3.representation.tracks[0]).toMatchObject({
      framing: 'length-prefixed', parameterSetLocation: 'in-band-and-description',
    });
    expect(annexB.representation.tracks[0]).toMatchObject({
      framing: 'annex-b', parameterSetLocation: 'in-band',
    });
    expect(avc3.representation.packets).toHaveLength(3);
    expect(avc3.semantic.accessUnits).toHaveLength(2);
  });

  test('dropped/changed content, broken random access, and invalid cadence remain semantic FAIL evidence', () => {
    const reference = normalizeGoldenPacketEvidence(packetProbe('avc1', 'one-row'), {
      assetId: 'a.mp4', decodedUnits: decodedUnits(), decoderObservation: { state: 'validated' },
    });
    const dropped = normalizeGoldenPacketEvidence(packetProbe('avc1', 'one-row'), {
      assetId: 'a.mp4', decodedUnits: decodedUnits().slice(0, 1), decoderObservation: { state: 'validated' },
    });
    const changedUnits = decodedUnits();
    changedUnits[1] = { ...changedUnits[1], sha256: 'e'.repeat(64) };
    const changed = normalizeGoldenPacketEvidence(packetProbe('avc1', 'one-row'), {
      assetId: 'a.mp4', decodedUnits: changedUnits, decoderObservation: { state: 'validated' },
    });
    const brokenRapProbe = packetProbe('avc1', 'one-row');
    brokenRapProbe.frames[0].key_frame = 0;
    brokenRapProbe.frames[0].pict_type = 'P';
    const brokenRap = normalizeGoldenPacketEvidence(brokenRapProbe, {
      assetId: 'a.mp4', decodedUnits: decodedUnits(), decoderObservation: { state: 'validated' },
    });
    const driftedUnits = decodedUnits();
    driftedUnits[1] = { ...driftedUnits[1], ptsUs: 50_000 };
    const drifted = normalizeGoldenPacketEvidence(packetProbe('avc1', 'one-row'), {
      assetId: 'a.mp4', decodedUnits: driftedUnits, decoderObservation: { state: 'validated' },
    });

    expect(packetVerdict(reference, dropped)).toMatchObject({ verdict: 'FAIL' });
    expect(packetVerdict(reference, changed)).toMatchObject({ verdict: 'FAIL' });
    expect(packetVerdict(reference, brokenRap)).toMatchObject({ verdict: 'FAIL' });
    expect(packetVerdict(reference, drifted)).toMatchObject({ verdict: 'FAIL' });
  });

  test('framemd5 output-local indices are remapped to audio-first input stream indices', () => {
    const text = [
      '#tb 0: 1/1000',
      `0, 0, 0, 40, 1, ${'a'.repeat(64)}`,
      '#tb 1: 1/48000',
      `1, 0, 1024, 1024, 2048, ${'b'.repeat(64)}`,
    ].join('\n');
    const streams = [
      { index: 0, codec_type: 'audio' },
      { index: 1, codec_type: 'video' },
    ];
    expect(parseMappedFrameMd5(text, streams)).toEqual([
      { streamIndex: 1, ptsUs: 0, durationUs: 40_000, sha256: 'a'.repeat(64) },
      { streamIndex: 0, ptsUs: Math.round(1024 / 48_000 * 1_000_000), durationUs: Math.round(1024 / 48_000 * 1_000_000), sha256: 'b'.repeat(64) },
    ]);
  });
});

describe('REQ-FIX-07 deterministic crypto and pinned normal entrypoint', () => {
  test('legacy FFmpeg CENC semantic unavailability is bound to the exact committed source', () => {
    expect(flatProtectedReferenceLimitationForGolden(
      'cenc_ctr.mp4',
      LEGACY_FFMPEG_CENC_CTR_IDENTITY,
    )).toEqual({
      state: 'reference-unavailable',
      reasonCode: 'REFERENCE_DECODER_FFMPEG_CENC_CTR_BENTO4_UNAVAILABLE',
      detail:
        'source-bound non-fragmented FFmpeg CENC-CTR cannot be semantically recovered by the independent Bento4 reference decoder',
    });
    expect(flatProtectedReferenceLimitationForGolden('cenc_ctr.mp4', {
      ...LEGACY_FFMPEG_CENC_CTR_IDENTITY,
      sha256: '0'.repeat(64),
    })).toBeUndefined();
    expect(flatProtectedReferenceLimitationForGolden('cenc_ctr.mp4', {
      ...LEGACY_FFMPEG_CENC_CTR_IDENTITY,
      sizeBytes: LEGACY_FFMPEG_CENC_CTR_IDENTITY.sizeBytes + 1,
    })).toBeUndefined();
    expect(flatProtectedReferenceLimitationForGolden(
      'cenc_cbcs.mp4',
      LEGACY_FFMPEG_CENC_CTR_IDENTITY,
    )).toBeUndefined();
  });

  test('Bento4 CBCS uses a committed-seed IV, retains key/KID, and never emits the random token', async () => {
    const seed = JSON.parse(await Bun.file('fixtures/fixture-seed.json').text()).seedHex as string;
    const changedSeed = `${seed[0] === '0' ? '1' : '0'}${seed.slice(1)}`;
    const input = {
      keyHex: '0123456789abcdef0123456789abcdef',
      kidHex: 'abcdef00112233445566778899aabbcc',
      plainPath: '/tmp/plain.mp4',
      outputPath: '/tmp/encrypted.mp4',
    };
    const first = buildBento4CbcsEncryptionArgs({ ...input, seedHex: seed });
    const repeated = buildBento4CbcsEncryptionArgs({ ...input, seedHex: seed });
    const changed = buildBento4CbcsEncryptionArgs({ ...input, seedHex: changedSeed });

    expect(BENTO4_CBCS_IV_LABEL).toBe('cenc_cbcs.mp4:bento4:track-1:iv');
    expect(first).toEqual(repeated);
    expect(first.ivHex).toHaveLength(32);
    expect(changed.ivHex).not.toBe(first.ivHex);
    expect(first.args.join(' ')).not.toMatch(/\brandom\b/i);
    expect(first.args[first.args.indexOf('--key') + 1]).toBe(`1:${input.keyHex}:${first.ivHex}`);
    expect(first.args[first.args.indexOf('--property') + 1]).toBe(`1:KID:${input.kidHex}`);
    expect(await Bun.file('fixtures/bake.mjs').text()).not.toContain(`1:\${keyHex}:random`);
  });

  test('scripts/bake-fixtures.sh exports the lock perimeter before invoking the bake', async () => {
    const lock = JSON.parse(await Bun.file('fixtures/toolchain.lock.json').text()) as {
      sourceDateEpoch: number; locale: string; timezone: string;
    };
    const scriptSource = await Bun.file('scripts/bake-fixtures.sh').text();
    expect(scriptSource).toContain('Bun.file("fixtures/toolchain.lock.json")');
    expect(scriptSource.indexOf('SOURCE_DATE_EPOCH|LANG|LC_ALL|TZ'))
      .toBeLessThan(scriptSource.indexOf('exec bun fixtures/bake.mjs'));

    const root = (await $`mktemp -d /tmp/media-test-pinned-bake-XXXXXX`.text()).trim();
    try {
      const fakeBin = `${root}/bin`;
      await $`mkdir -p ${fakeBin}`.quiet();
      const bunPath = `${fakeBin}/bun`;
      await Bun.write(bunPath, `#!/bin/sh
if [ "$1" = "-e" ]; then
  printf '%s\\n' 'SOURCE_DATE_EPOCH=${lock.sourceDateEpoch}' 'LANG=${lock.locale}' 'LC_ALL=${lock.locale}' 'TZ=${lock.timezone}'
  exit 0
fi
printf 'PINNED:%s|%s|%s|%s\\n' "$SOURCE_DATE_EPOCH" "$LANG" "$LC_ALL" "$TZ"
`);
      for (const name of ['bun', 'ffmpeg', 'ffprobe']) {
        const path = `${fakeBin}/${name}`;
        if (name !== 'bun') await Bun.write(path, '#!/bin/sh\nexit 0\n');
        await $`chmod 755 ${path}`.quiet();
      }
      const result = Bun.spawnSync(['bash', 'scripts/bake-fixtures.sh', '--help'], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PATH: `${fakeBin}:/usr/bin:/bin`,
          SOURCE_DATE_EPOCH: '1', LANG: 'C', LC_ALL: 'C', TZ: 'Europe/Stockholm',
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      expect(result.exitCode, result.stderr.toString()).toBe(0);
      expect(result.stdout.toString()).toContain(
        `PINNED:${lock.sourceDateEpoch}|${lock.locale}|${lock.locale}|${lock.timezone}`,
      );
    } finally {
      await $`rm -rf ${root}`.quiet();
    }
  });
});

function viewVerdict(reference: any, candidate: any): OracleView {
  if (canonicalJson(reference.canonical) !== canonicalJson(candidate.canonical)) return { verdict: 'FAIL', reasonCode: 'ORACLE_MISMATCH' };
  return canonicalJson(reference.raw) === canonicalJson(candidate.raw)
    ? { verdict: 'PASS', reasonCode: 'ORACLE_MATCH' }
    : { verdict: 'PASS', reasonCode: 'ORACLE_REPRESENTATION_DIFF' };
}

function packetVerdict(reference: any, candidate: any): OracleView {
  if (canonicalJson(reference.semantic) !== canonicalJson(candidate.semantic)) return { verdict: 'FAIL', reasonCode: 'ORACLE_MISMATCH' };
  return canonicalJson(reference.representation) === canonicalJson(candidate.representation)
    ? { verdict: 'PASS', reasonCode: 'ORACLE_MATCH' }
    : { verdict: 'PASS', reasonCode: 'ORACLE_REPRESENTATION_DIFF' };
}

function metadataProbe(options: { aliases?: boolean; reordered?: boolean; secondAudio?: boolean } = {}): any {
  const video = {
    index: options.reordered ? 9 : 0,
    codec_type: 'video',
    codec_name: options.aliases ? 'avc3.640028' : 'h264',
    codec_tag_string: options.aliases ? 'avc3' : 'avc1',
    profile: 'High', level: 40,
    width: 1920, height: 1080, coded_width: 1920, coded_height: 1088,
    avg_frame_rate: '30000/1001', r_frame_rate: '30000/1001', time_base: '1/90000',
    duration: '10.000000', duration_ts: 900_000, nb_frames: '300', bit_rate: '1000000',
  };
  const audio = {
    index: options.reordered ? 7 : 1,
    codec_type: 'audio',
    codec_name: options.aliases ? 'mp4a.40.29' : 'aac',
    codec_tag_string: 'mp4a', profile: 'HE-AACv2', sample_rate: '48000', channels: 2,
    channel_layout: 'stereo', time_base: '1/48000', duration: '10.000000', duration_ts: 480_480,
    initial_padding: 1_024, trailing_padding: 512, bit_rate: '128000', tags: { language: 'eng' },
  };
  const secondAudio = {
    ...audio,
    index: 2,
    codec_name: 'aac',
    profile: 'LC',
    sample_rate: '44100',
    time_base: '1/44100',
    duration_ts: 441_000,
    initial_padding: 0,
    trailing_padding: 0,
    tags: { language: 'fra' },
  };
  const streams = options.secondAudio ? [video, audio, secondAudio] : [video, audio];
  return {
    format: {
      format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
      duration: '10.000000',
      start_time: '0.000000',
      tags: { major_brand: 'isom' },
    },
    streams: options.reordered ? [...streams].reverse() : streams,
  };
}

function frameProbe(streamIndex: number, timesUs: number[]): any {
  return {
    frames: timesUs.map((ptsUs, index) => ({
      stream_index: streamIndex,
      best_effort_timestamp_time: String(ptsUs / 1_000_000),
      key_frame: index === 0 ? 1 : 0,
    })),
  };
}

function decodedUnits(): any[] {
  return [
    { streamIndex: 0, ptsUs: 0, durationUs: 33_333, sha256: 'a'.repeat(64) },
    { streamIndex: 0, ptsUs: 33_333, durationUs: 33_333, sha256: 'b'.repeat(64) },
  ];
}

function packetProbe(
  representation: 'avc1' | 'avc3' | 'annex-b',
  grouping: 'one-row' | 'split-idr',
): any {
  const lengthPrefixed = representation !== 'annex-b';
  const codecTag = representation === 'annex-b' ? 'h264' : representation;
  const packets = grouping === 'split-idr'
    ? [packet(0, 0, 60, true, 'c'), packet(0, 0, 50, false, 'd'), packet(0, 33_333, 90, false, 'e')]
    : [packet(0, 0, 110, true, 'c'), packet(0, 33_333, 90, false, 'e')];
  return {
    format: { format_name: representation === 'annex-b' ? 'mpegts' : 'mov,mp4,m4a,3gp,3g2,mj2' },
    streams: [{
      index: 0,
      codec_type: 'video',
      codec_name: 'h264',
      codec_tag_string: codecTag,
      time_base: '1/90000',
      width: 1920,
      height: 1080,
      nal_length_size: lengthPrefixed ? 4 : undefined,
      extradata: lengthPrefixed ? '00000000: 0164001f ffe10004 6764001f 01000268 ee' : undefined,
      extradata_hash: lengthPrefixed ? `sha256:${'f'.repeat(64)}` : undefined,
    }],
    frames: [
      { stream_index: 0, best_effort_timestamp_time: '0', duration_time: '0.033333', key_frame: 1, pict_type: 'I' },
      { stream_index: 0, best_effort_timestamp_time: '0.033333', duration_time: '0.033333', key_frame: 0, pict_type: 'P' },
    ],
    packets,
  };
}

function packet(streamIndex: number, ptsUs: number, size: number, keyframe: boolean, hashChar: string): any {
  const ticks = Math.round(ptsUs * 90_000 / 1_000_000);
  return {
    stream_index: streamIndex,
    size,
    pts: ticks,
    dts: ticks,
    duration: 3_000,
    pts_time: String(ptsUs / 1_000_000),
    dts_time: String(ptsUs / 1_000_000),
    duration_time: '0.033333',
    flags: keyframe ? 'K_' : '__',
    pos: 100 + ticks,
    data_hash: `sha256:${hashChar.repeat(64)}`,
  };
}
