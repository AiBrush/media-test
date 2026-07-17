import { describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  GOLDEN_METADATA_SCHEMA,
  GOLDEN_NORMALIZATION_VERSION,
  GOLDEN_PACKETS_SCHEMA,
  PACKET_SEMANTICS_VERSION,
  buildGoldenPacketProbeArgs,
  buildGoldenSemanticDecodeArgs,
  canonicalJson,
  normalizeGoldenPacketEvidence,
  normalizeProbeMetadata,
  parseMappedFrameMd5,
  selectPresentationFramePlaceholders,
} from '../fixtures/lib/golden-normalization.mjs';
import {
  BENTO4_CBCS_IV_LABEL,
  buildBento4CbcsEncryptionArgs,
  flatFramePlaceholderForGolden,
  normalizeFlatProbeForGolden,
} from '../fixtures/bake.mjs';
import {
  normalizeScenarioProbeForGolden,
  scenarioFramePlaceholderForGolden,
} from '../fixtures/bake-scenario-goldens.mjs';

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

  test('both production entrypoints call the shared packet/decode builders and contain no local normalizer copy', () => {
    const flatSource = readFileSync('fixtures/bake.mjs', 'utf8');
    const scenarioSource = readFileSync('fixtures/bake-scenario-goldens.mjs', 'utf8');
    for (const source of [flatSource, scenarioSource]) {
      expect(source).toContain('buildGoldenPacketProbeArgs(inOpts, mediaPath)');
      expect(source).toContain('buildGoldenSemanticDecodeArgs(inOpts, mediaPath)');
      expect(source).toContain('normalizeGoldenPacketEvidence(probe');
      expect(source).toContain('parseMappedFrameMd5(result.stdout, inputStreams)');
      expect(source).toContain('publicationScope,');
      expect(source).toContain("activeScope?.mode === 'complete-corpus'");
      expect(source).toContain('stagedRootAssetIds');
      expect(source).not.toMatch(/function\s+canonicalCodec\s*\(/);
      expect(source).not.toMatch(/function\s+parseFps\s*\(/);
    }

    expect(buildGoldenPacketProbeArgs([], 'input.mp4')).toContain('-show_frames');
    expect(buildGoldenSemanticDecodeArgs([], 'input.mp4')).toEqual(expect.arrayContaining([
      '-map', '0:v?', '-map', '0:a?', '-f', 'framemd5', '-hash', 'sha256', '-',
    ]));
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
  test('Bento4 CBCS uses a committed-seed IV, retains key/KID, and never emits the random token', () => {
    const seed = JSON.parse(readFileSync('fixtures/fixture-seed.json', 'utf8')).seedHex as string;
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
    expect(readFileSync('fixtures/bake.mjs', 'utf8')).not.toContain(`1:\${keyHex}:random`);
  });

  test('scripts/bake-fixtures.sh exports the lock perimeter before invoking the bake', () => {
    const lock = JSON.parse(readFileSync('fixtures/toolchain.lock.json', 'utf8')) as {
      sourceDateEpoch: number; locale: string; timezone: string;
    };
    const scriptSource = readFileSync('scripts/bake-fixtures.sh', 'utf8');
    expect(scriptSource).toContain('Bun.file("fixtures/toolchain.lock.json")');
    expect(scriptSource.indexOf('SOURCE_DATE_EPOCH|LANG|LC_ALL|TZ'))
      .toBeLessThan(scriptSource.indexOf('exec bun fixtures/bake.mjs'));

    const root = mkdtempSync(join(tmpdir(), 'media-test-pinned-bake-'));
    try {
      const fakeBin = join(root, 'bin');
      mkdirSync(fakeBin, { recursive: true });
      const bunPath = join(fakeBin, 'bun');
      writeFileSync(bunPath, `#!/bin/sh
if [ "$1" = "-e" ]; then
  printf '%s\\n' 'SOURCE_DATE_EPOCH=${lock.sourceDateEpoch}' 'LANG=${lock.locale}' 'LC_ALL=${lock.locale}' 'TZ=${lock.timezone}'
  exit 0
fi
printf 'PINNED:%s|%s|%s|%s\\n' "$SOURCE_DATE_EPOCH" "$LANG" "$LC_ALL" "$TZ"
`);
      for (const name of ['bun', 'ffmpeg', 'ffprobe']) {
        const path = join(fakeBin, name);
        if (name !== 'bun') writeFileSync(path, '#!/bin/sh\nexit 0\n');
        chmodSync(path, 0o755);
      }
      const result = spawnSync('/bin/bash', ['scripts/bake-fixtures.sh', '--help'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${fakeBin}:/usr/bin:/bin`,
          SOURCE_DATE_EPOCH: '1', LANG: 'C', LC_ALL: 'C', TZ: 'Europe/Stockholm',
        },
      });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain(
        `PINNED:${lock.sourceDateEpoch}|${lock.locale}|${lock.locale}|${lock.timezone}`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
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
