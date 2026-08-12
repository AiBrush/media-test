import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { muxPreparedWebmChunkTracks } from '@aibrush/media/core';

import type { MediaBytes, MediaInput } from '../src/core/engine.ts';
import {
  buildSelectionManifest,
  parseBakedCorpusManifest,
  parseScenarioSourceCatalog,
} from '../src/core/media-selection.ts';
import type { OracleOutcome } from '../src/core/scenario.ts';
import {
  REMUX_ROUND_TRIP_LEG_ROLE,
  aacAudioSpecificConfigFromEsds,
  aacLcChannelsFromEsds,
  auditRemuxAvailabilityAssertions,
  auditRemuxScenarioAvailability,
  classifyRejectedPartialRemux,
  classifyTimedOutPartialRemux,
  compareStrictRemuxPrograms,
  evaluateStrictStreamCopy,
  executeRemuxRoundTrip,
  normalizeRemuxTrackForTest,
  mp3FrameAudioConfig,
  parseIsoAudioSampleEntryHeader,
  parseIsoVisualSampleEntryHeader,
  readIsoBmffRangeProgram,
  readNeutralRemuxProgram,
  remuxFixtureAvailability,
  remuxRoundTripContractFromOptions,
  validateReturnedPartialRemux,
  type RemuxFixtureManifest,
  type RemuxProgramEvidence,
  type RemuxSampleEvidence,
  type RemuxTrackEvidence,
} from '../src/features/remux/index.ts';
import { remuxScenarios } from '../src/scenarios/remux/index.ts';

function bytesAt(path: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`../${path}`, import.meta.url)));
}

function textAt(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function manifest(): RemuxFixtureManifest {
  return JSON.parse(textAt('fixtures/manifest.json')) as RemuxFixtureManifest;
}

function oracleVerdict(outcome: OracleOutcome): string {
  return outcome.state === 'VERDICT' ? outcome.verdict : outcome.state;
}

function lengthPrefixed(...nals: Uint8Array[]): Uint8Array {
  const length = nals.reduce((sum, nal) => sum + 4 + nal.byteLength, 0);
  const out = new Uint8Array(length);
  const view = new DataView(out.buffer);
  let at = 0;
  for (const nal of nals) {
    view.setUint32(at, nal.byteLength); at += 4;
    out.set(nal, at); at += nal.byteLength;
  }
  return out;
}

function annexB(...nals: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(nals.reduce((sum, nal) => sum + 4 + nal.byteLength, 0));
  let at = 0;
  for (const nal of nals) {
    out.set([0, 0, 0, 1], at); at += 4;
    out.set(nal, at); at += nal.byteLength;
  }
  return out;
}

function avcC(sps: Uint8Array, pps: Uint8Array): Uint8Array {
  const out = new Uint8Array(11 + sps.byteLength + pps.byteLength);
  out.set([1, 0x42, 0, 0x1e, 0xff, 0xe1], 0);
  const view = new DataView(out.buffer);
  view.setUint16(6, sps.byteLength);
  out.set(sps, 8);
  const ppsCount = 8 + sps.byteLength;
  out[ppsCount] = 1;
  view.setUint16(ppsCount + 1, pps.byteLength);
  out.set(pps, ppsCount + 3);
  return out;
}

function sample(payload: Uint8Array, ptsUs: number, dtsUs: number, framing: RemuxSampleEvidence['framing']): RemuxSampleEvidence {
  return { payload, ptsUs, dtsUs, durationUs: 33_367, keyframe: true, framing };
}

function program(container: string, tracks: RemuxTrackEvidence[]): RemuxProgramEvidence {
  const times = tracks.flatMap((track) => track.samples.map((entry) => (entry.ptsUs ?? 0) + (entry.durationUs ?? 0)));
  return {
    schema: 'media-test/remux-program@1', container, byteLength: 1_000,
    ...(times.length ? { durationUs: Math.max(...times) } : {}),
    tracks, representation: {},
  };
}

function audioTrack(id: string, language: string, marker: number): RemuxTrackEvidence {
  return {
    id, type: 'audio', codec: 'aac', language, sampleRate: 48_000, channels: 2,
    samples: [sample(new Uint8Array([marker, 1, 2]), 0, 0, 'raw')],
  };
}

function adtsFrame(payload: Uint8Array, rateIndex = 4, channels = 2): Uint8Array {
  const length = 7 + payload.byteLength;
  const out = new Uint8Array(length);
  out[0] = 0xff; out[1] = 0xf1;
  out[2] = (1 << 6) | (rateIndex << 2) | ((channels >> 2) & 1);
  out[3] = ((channels & 3) << 6) | ((length >> 11) & 3);
  out[4] = (length >> 3) & 0xff;
  out[5] = ((length & 7) << 5) | 0x1f;
  out[6] = 0xfc;
  out.set(payload, 7);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.byteLength; }
  return out;
}

function inputFromBytes(id: string, bytes: Uint8Array): MediaInput {
  return {
    id, url: `memory:${id}`, mime: 'audio/aac', sizeBytes: bytes.byteLength,
    async arrayBuffer(): Promise<ArrayBuffer> { return bytes.slice().buffer as ArrayBuffer; },
    async blob(): Promise<Blob> { return new Blob([bytes.slice().buffer], { type: 'audio/aac' }); },
  };
}

describe('REQ-FEAT-07 strict stream-copy semantic oracle', () => {
  test('Annex-B/AVCC and parameter-set placement are DIFF, while a changed slice is FAIL', () => {
    const sps = new Uint8Array([0x67, 0x42, 0, 0x1e, 0xaa]);
    const pps = new Uint8Array([0x68, 0xce, 0x06]);
    const slice = new Uint8Array([0x65, 0x88, 0x84]);
    const source = program('mp4', [{
      id: 'isobmff:1', type: 'video', codec: 'avc1', width: 640, height: 360,
      codecPrivate: avcC(sps, pps),
      samples: [sample(lengthPrefixed(slice), 0, 0, 'length-prefixed')],
    }]);
    const output = program('ts', [{
      id: 'ts:1:256', type: 'video', codec: 'h264', width: 640, height: 360,
      samples: [sample(annexB(sps, pps, new Uint8Array([9, 0xf0]), slice), 0, 0, 'annexb')],
    }]);
    const lawful = compareStrictRemuxPrograms(source, output, { expectedTargetContainer: 'ts' });
    expect(oracleVerdict(lawful.outcome)).toBe('PASS');
    expect(lawful.outcome.reasonCode).toBe('REMUX_VALID_REPRESENTATION_DIFFERENCE');
    expect(lawful.representationDifferences.join(' ')).toContain('framing');

    const changed = structuredClone(output) as RemuxProgramEvidence;
    const changedPayload = changed.tracks[0]!.samples[0]!.payload.slice();
    changedPayload[changedPayload.length - 1] ^= 1;
    (changed.tracks[0]!.samples[0] as { payload: Uint8Array }).payload = changedPayload;
    expect(oracleVerdict(compareStrictRemuxPrograms(source, changed).outcome)).toBe('FAIL');
  });

  test('matches same-codec tracks by content/language rather than ordinal and rejects a drop', () => {
    const source = program('mp4', [audioTrack('source-1', 'eng', 0x11), audioTrack('source-2', 'fra', 0x22)]);
    const swapped = program('mkv', [audioTrack('target-7', 'fra', 0x22), audioTrack('target-3', 'eng', 0x11)]);
    const result = compareStrictRemuxPrograms(source, swapped);
    expect(oracleVerdict(result.outcome)).toBe('PASS');
    expect(result.outcome.reasonCode).toBe('REMUX_VALID_REPRESENTATION_DIFFERENCE');
    expect(new Set(result.matchedTracks.map((pair) => `${pair.sourceId}:${pair.outputId}`))).toEqual(
      new Set(['source-1:target-3', 'source-2:target-7']),
    );
    expect(oracleVerdict(compareStrictRemuxPrograms(source, program('mkv', [swapped.tracks[0]!])).outcome)).toBe('FAIL');
  });

  test('NTSC/B-frame tick rounding is diagnostic; an actual presentation remap fails', () => {
    const payloads = [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])];
    const make = (id: string, pts: number[], dts: number[]): RemuxTrackEvidence => ({
      id, type: 'video', codec: 'vp9', width: 640, height: 360,
      samples: payloads.map((payload, index) => sample(payload, pts[index]!, dts[index]!, 'raw')),
    });
    const source = program('webm', [make('a', [0, 66_733, 33_367], [0, 33_367, 66_733])]);
    const rounded = program('mkv', [make('b', [0, 67_000, 33_000], [0, 33_000, 67_000])]);
    const roundedResult = compareStrictRemuxPrograms(source, rounded, { tolerance: { timestampUs: 500 } });
    expect(oracleVerdict(roundedResult.outcome)).toBe('PASS');
    expect(roundedResult.outcome.reasonCode).toBe('REMUX_VALID_REPRESENTATION_DIFFERENCE');
    const remapped = program('mkv', [make('b', [0, 33_000, 67_000], [0, 33_000, 67_000])]);
    expect(oracleVerdict(compareStrictRemuxPrograms(source, remapped, { tolerance: { timestampUs: 500 } }).outcome)).toBe('FAIL');
  });

  test('bounds accumulated EBML duration rounding by its target tick and still rejects one bad sample', () => {
    const make = (id: string, rounded: boolean): RemuxTrackEvidence => ({
      id,
      type: 'audio',
      codec: 'aac',
      sampleRate: 48_000,
      channels: 2,
      ...(rounded ? { timescale: 1_000 } : { timescale: 48_000 }),
      samples: Array.from({ length: 200 }, (_, index) => ({
        payload: new Uint8Array([index & 0xff, index >> 8]),
        ptsUs: rounded ? Math.round((index * 21_333) / 1_000) * 1_000 : index * 21_333,
        dtsUs: rounded ? Math.round((index * 21_333) / 1_000) * 1_000 : index * 21_333,
        durationUs: rounded ? 21_000 : 21_333,
        keyframe: true,
        framing: 'raw',
      })),
    });
    const source = program('mp4', [make('source', false)]);
    const output = program('mkv', [make('output', true)]);
    const lawful = compareStrictRemuxPrograms(source, output);
    expect(oracleVerdict(lawful.outcome)).toBe('PASS');
    expect(lawful.representationDifferences.join(' ')).toContain('target-clock tolerance');

    const mutated = structuredClone(output) as RemuxProgramEvidence;
    (mutated.tracks[0]!.samples[20] as { durationUs: number }).durationUs = 24_000;
    expect(oracleVerdict(compareStrictRemuxPrograms(source, mutated).outcome)).toBe('FAIL');
  });

  test('Opus pre-skip clipping and missing Matroska DTS stay representation differences', () => {
    const payloads = [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])];
    const opusTrack = (id: string, pts: number[]): RemuxTrackEvidence => ({
      id, type: 'audio', codec: 'opus', sampleRate: 48_000, channels: 1,
      samples: payloads.map((payload, index) => ({
        payload,
        ptsUs: pts[index]!,
        ...(id === 'ogg' ? { durationUs: 60_000 } : {}),
        keyframe: true,
        framing: id === 'ogg' ? 'ogg-packet' : 'raw',
      })),
    });
    const opus = compareStrictRemuxPrograms(
      { ...program('ogg', [opusTrack('ogg', [-6_500, 53_500, 113_500])]), durationUs: 180_000 },
      { ...program('webm', [opusTrack('webm', [0, 14_000, 74_000])]), durationUs: 180_000 },
    );
    expect(oracleVerdict(opus.outcome)).toBe('PASS');
    expect(opus.representationDifferences.join(' ')).toContain('Opus pre-skip');

    const videoTrack = (id: string, pts: number[], dts?: number[]): RemuxTrackEvidence => ({
      id, type: 'video', codec: 'vp9', width: 640, height: 360,
      samples: payloads.map((payload, index) => ({
        payload,
        ptsUs: pts[index]!,
        ...(dts ? { dtsUs: dts[index]! } : {}),
        durationUs: dts ? [33_003, 33_994, 33_003][index]! : 33_333,
        keyframe: index === 0,
        framing: 'raw',
      })),
    });
    const dtsProvenance = compareStrictRemuxPrograms(
      program('mkv', [videoTrack('mkv', [0, 133_000, 67_000])]),
      program('mp4', [videoTrack('mp4', [0, 133_003, 66_997], [0, 33_003, 66_997])]),
    );
    expect(oracleVerdict(dtsProvenance.outcome)).toBe('PASS');
    expect(dtsProvenance.representationDifferences.join(' ')).toContain('coded-duration provenance');
  });

  test('program duration accepts only evidenced metadata-prefix origin plus one missing terminal interval', () => {
    const xing = new TextEncoder().encode('Xing-metadata-frame');
    const media = [new Uint8Array([1]), new Uint8Array([2])];
    const sourceTrack: RemuxTrackEvidence = {
      id: 'mp3-source', type: 'audio', codec: 'mp3', sampleRate: 48_000, channels: 2,
      samples: [xing, ...media].map((payload, index) => ({
        payload, ptsUs: index * 26_000, dtsUs: index * 26_000, durationUs: 26_000,
        keyframe: true, framing: 'mpeg-audio-frame',
      })),
    };
    const outputTrack: RemuxTrackEvidence = {
      id: 'mkv-output', type: 'audio', codec: 'mp3', sampleRate: 48_000, channels: 2,
      samples: media.map((payload, index) => ({
        payload, ptsUs: index * 26_000, keyframe: true, framing: 'raw',
      })),
    };
    const explained = compareStrictRemuxPrograms(
      { ...program('mp3', [sourceTrack]), durationUs: 78_000 },
      { ...program('mkv', [outputTrack]), durationUs: 26_000 },
    );
    expect(oracleVerdict(explained.outcome)).toBe('PASS');
    expect(explained.representationDifferences.join(' ')).toContain('origin/priming normalization');

    const unexplained = compareStrictRemuxPrograms(
      { ...program('mp3', [sourceTrack]), durationUs: 130_000 },
      { ...program('mkv', [outputTrack]), durationUs: 26_000 },
    );
    expect(oracleVerdict(unexplained.outcome)).toBe('FAIL');
  });

  test('accepts explicit HE-AAC SBR presentation/core rates across an ADTS wrapper only when access units survive', () => {
    const read = readNeutralRemuxProgram(
      bytesAt('fixtures/media/scenarios/remux/micro_audio_short_mp4_to_adts/01.mp4'),
      'mp4',
    );
    expect(read.state).toBe('OK');
    if (read.state !== 'OK') return;
    const sourceTrack = read.value.tracks[0]!;
    expect(aacAudioSpecificConfigFromEsds(sourceTrack.codecPrivate!)).toEqual({
      audioObjectType: 2,
      coreSampleRate: 22_050,
      presentationSampleRate: 44_100,
      channelConfiguration: 2,
      sbrPresent: true,
      psPresent: false,
    });
    const outputTrack: RemuxTrackEvidence = {
      ...sourceTrack,
      id: 'adts:0',
      sampleRate: 22_050,
      timescale: 22_050,
      codecPrivate: undefined,
      samples: sourceTrack.samples.map((entry) => ({ ...entry, framing: 'adts' as const })),
    };
    const output: RemuxProgramEvidence = { ...read.value, container: 'adts', tracks: [outputTrack] };
    const preserved = compareStrictRemuxPrograms(read.value, output);
    expect(oracleVerdict(preserved.outcome)).toBe('PASS');
    expect(preserved.representationDifferences.join(' ')).toContain('HE-AAC SBR');

    const corrupted = structuredClone(output) as RemuxProgramEvidence;
    const payload = corrupted.tracks[0]!.samples[0]!.payload.slice();
    payload[payload.length - 1] ^= 1;
    (corrupted.tracks[0]!.samples[0] as { payload: Uint8Array }).payload = payload;
    expect(oracleVerdict(compareStrictRemuxPrograms(read.value, corrupted).outcome)).toBe('FAIL');
  });

  test('accepts EBML duration rematerialization only when the complete timestamp span survives', () => {
    const read = readNeutralRemuxProgram(
      bytesAt('fixtures/media/scenarios/remux/vp8_720p_10s_webm_to_mkv/02.webm'),
      'webm',
    );
    expect(read.state).toBe('OK');
    if (read.state !== 'OK') return;
    const videoIndex = read.value.tracks.findIndex((track) => track.type === 'video');
    const video = read.value.tracks[videoIndex]!;
    const materialized: RemuxTrackEvidence = {
      ...video,
      id: 'mkv:video',
      samples: video.samples.map((entry, index) => {
        const next = video.samples[index + 1];
        const interval = next?.ptsUs !== undefined && entry.ptsUs !== undefined
          ? next.ptsUs - entry.ptsUs
          : undefined;
        return { ...entry, ...(interval && interval > 0 ? { durationUs: interval } : {}) };
      }),
    };
    const output: RemuxProgramEvidence = {
      ...read.value,
      container: 'mkv',
      tracks: read.value.tracks.map((track, index) => index === videoIndex ? materialized : track),
    };
    const preserved = compareStrictRemuxPrograms(read.value, output);
    expect(oracleVerdict(preserved.outcome)).toBe('PASS');
    expect(preserved.representationDifferences.join(' ')).toContain('duration metadata was rematerialized');

    const stretched = structuredClone(output) as RemuxProgramEvidence;
    (stretched.tracks[videoIndex]!.samples.at(-1) as { durationUs: number }).durationUs = 1_000_000;
    expect(oracleVerdict(compareStrictRemuxPrograms(read.value, stretched).outcome)).toBe('FAIL');
  });
});

describe('REQ-FEAT-08 payload-bearing neutral readers and typed boundaries', () => {
  test('uses codec-native MP3 channel mode instead of contradictory wrapper metadata', () => {
    expect(mp3FrameAudioConfig(Uint8Array.of(0xff, 0xfb, 0x90, 0xc0))).toEqual({
      sampleRate: 44_100,
      channels: 1,
    });
    expect(mp3FrameAudioConfig(Uint8Array.of(0xff, 0xfb, 0x94, 0x00))).toEqual({
      sampleRate: 48_000,
      channels: 2,
    });
  });

  test('reads coded dimensions from the ISO VisualSampleEntry rather than presentation tkhd', () => {
    const body = new Uint8Array(78);
    const view = new DataView(body.buffer);
    view.setUint16(24, 600);
    view.setUint16(26, 448);
    expect(parseIsoVisualSampleEntryHeader(body, 0, body.byteLength)).toEqual({
      headerBytes: 78,
      width: 600,
      height: 448,
    });
  });

  test('reads QuickTime AudioSampleEntry v2 float rate and 32-bit channel fields', () => {
    const body = new Uint8Array(64);
    const view = new DataView(body.buffer);
    view.setUint16(8, 2); // version
    view.setUint16(16, 3); // legacy placeholder: not the channel count
    view.setUint32(24, 1 << 16); // legacy placeholder: not the sample rate
    view.setUint32(28, 72); // size of the version-2-only structure
    view.setFloat64(32, 48_000, false);
    view.setUint32(40, 6);
    expect(parseIsoAudioSampleEntryHeader(body, 0, body.byteLength)).toEqual({
      headerBytes: 64,
      sampleRate: 48_000,
      channels: 6,
    });
  });

  test('AAC-LC AudioSpecificConfig overrides a contradictory legacy sample-entry channel count', () => {
    const esds = new Uint8Array([
      0, 0, 0, 0,
      3, 0x80, 0x80, 0x80, 34, 0, 0, 0,
      4, 0x80, 0x80, 0x80, 20, 0x40, 0x15, 0, 0x18, 0, 0, 0, 0xfa, 0, 0, 0, 0xfa, 0,
      5, 0x80, 0x80, 0x80, 2, 0x11, 0x88,
      6, 0x80, 0x80, 0x80, 1, 2,
    ]);
    expect(aacLcChannelsFromEsds(esds)).toBe(1);
  });

  test('reads every declared ordinary remux source format plus fragmented/live structures', () => {
    const cases = [
      ['micro_h264_1frame.mp4', 'mp4', 'h264'],
      ['h264_1080p_5s.mov', 'mov', 'h264'],
      ['h264_in_mkv.mkv', 'mkv', 'h264'],
      ['tiny_vp9_360p_2s.webm', 'webm', 'vp9'],
      ['h264_ts.ts', 'ts', 'h264'],
      ['ts_discontinuity.ts', 'ts', 'h264'],
      ['aac_adts.aac', 'adts', 'aac'],
      ['mp3_xing.mp3', 'mp3', 'mp3'],
      ['opus.ogg', 'ogg', 'opus'],
      ['flac_seektable.flac', 'flac', 'flac'],
      ['fragmented_cmaf.mp4', 'mp4', 'h264'],
      ['recorder_headerless.webm', 'webm', 'vp8'],
    ] as const;
    for (const [file, container, codec] of cases) {
      const result = readNeutralRemuxProgram(bytesAt(`fixtures/media/${file}`), container);
      expect(result.state, file).toBe('OK');
      if (result.state !== 'OK') continue;
      expect(result.value.tracks.some((track) => track.codec === codec && track.samples.length > 0), file).toBe(true);
      expect(result.evidence.parsedSamples, file).toBeGreaterThan(0);
    }
  });

  test('uses an ISO edit-list presentation span instead of a long terminal coded delta', () => {
    const result = readNeutralRemuxProgram(
      bytesAt('fixtures/media/scenarios/remux/h264_1080p_5s_mov_to_mkv/01.mov'),
      'mov',
    );
    expect(result.state).toBe('OK');
    if (result.state !== 'OK') return;
    expect(result.value.tracks.map((track) => track.samples.length)).toEqual([194, 280]);
    expect(result.value.durationUs).toBe(6_466_710);
    const video = result.value.tracks.find((track) => track.type === 'video')!;
    const terminal = video.samples.at(-1)!;
    expect(terminal.ptsUs! + terminal.durationUs!).toBeGreaterThan(9_000_000);

    const ordinary = readNeutralRemuxProgram(bytesAt('fixtures/media/h264_1080p_30s.mp4'), 'mp4');
    expect(ordinary.state).toBe('OK');
    if (ordinary.state !== 'OK') return;
    // A sub-tolerance edit adjustment does not replace the complete strict-copy coded span.
    expect(ordinary.value.durationUs).toBe(30_021_333);
  });

  test('TS reader preserves concatenated-program PTS epochs and physical ADTS frame spans', () => {
    const result = readNeutralRemuxProgram(bytesAt('fixtures/media/ts_discontinuity.ts'), 'ts');
    expect(result.state).toBe('OK');
    if (result.state !== 'OK') return;
    const video = result.value.tracks.find((track) => track.type === 'video')!;
    const audio = result.value.tracks.find((track) => track.type === 'audio')!;
    expect([video.samples.length, audio.samples.length]).toEqual([120, 190]);
    expect([video.samples[59]!.ptsUs, video.samples[60]!.ptsUs]).toEqual([3_388_000, 600_000_000]);
    expect([audio.samples[94]!.ptsUs, audio.samples[95]!.ptsUs]).toEqual([3_405_333, 599_978_667]);
    expect(audio.samples.every((sample) =>
      sample.sourcePayload?.byteLength === sample.sourceByteLength &&
      sample.sourceByteLength! > sample.payload.byteLength)).toBe(true);

    const splitPes = readNeutralRemuxProgram(
      bytesAt('fixtures/media/scenarios/demux/h264_ts/01.ts'),
      'ts',
    );
    expect(splitPes.state).toBe('OK');
    if (splitPes.state !== 'OK') return;
    const splitVideo = splitPes.value.tracks.find((track) => track.type === 'video')!;
    expect(splitVideo.samples.length).toBe(299);
    expect(splitVideo.samples.slice(0, 3).map((sample) => sample.sourceByteLength)).toEqual([9_815, 814, 595]);
  });

  test('classic QuickTime version-0 ctts uses signed B-frame composition offsets', () => {
    const result = readNeutralRemuxProgram(
      bytesAt('fixtures/media/scenarios/remux/h264_1080p_5s_mov_to_ts/03.mov'),
      'mov',
    );
    expect(result.state).toBe('OK');
    if (result.state !== 'OK') return;
    const video = result.value.tracks.find((track) => track.type === 'video')!;
    expect(video.samples.slice(0, 5).map((sample) => sample.ptsUs)).toEqual([
      0, 133_333, 66_667, 266_667, 200_000,
    ]);
    expect(Math.max(...video.samples.map((sample) => sample.ptsUs ?? 0))).toBeLessThan(70_000_000);
    expect(normalizeRemuxTrackForTest(video)?.parameterSets).toHaveLength(2);
  });

  test('complete EBML block timing overrides a contradictory declared Segment duration', () => {
    const result = readNeutralRemuxProgram(
      bytesAt('fixtures/media/scenarios/remux/vp8_720p_10s_webm_to_mkv/02.webm'),
      'webm',
    );
    expect(result.state).toBe('OK');
    if (result.state !== 'OK') return;
    expect(result.value.tracks.reduce((sum, track) => sum + track.samples.length, 0)).toBe(590);
    expect(result.value.durationUs).toBe(7_777_000);
  });

  test('EBML reader reconstructs constant cadence and CodecDelay-backed B-frame DTS', () => {
    const bytes = muxPreparedWebmChunkTracks({
      container: 'mkv',
      tracks: [
        {
          track: {
            id: 1,
            mediaType: 'video',
            codec: 'vp8',
            durationSec: 0.08,
            config: { codec: 'vp8', codedWidth: 16, codedHeight: 16 },
          },
          chunks: [
            { timestampUs: 0, dtsUs: -67_000, durationUs: 33_000, key: true, data: new Uint8Array([1]) },
            { timestampUs: 99_000, dtsUs: -34_000, durationUs: 34_000, key: false, data: new Uint8Array([2]) },
            { timestampUs: 33_000, dtsUs: 0, durationUs: 32_000, key: false, data: new Uint8Array([3]) },
            { timestampUs: 66_000, dtsUs: 32_000, durationUs: 33_000, key: false, data: new Uint8Array([4]) },
          ],
        },
        {
          track: {
            id: 2,
            mediaType: 'audio',
            codec: 'aac',
            durationSec: 0.08,
            config: { codec: 'mp4a.40.2', sampleRate: 48_000, numberOfChannels: 2 },
          },
          chunks: [0, 21_000, 43_000, 64_000].map((timestampUs, index) => ({
            timestampUs,
            durationUs: 21_333,
            key: true,
            data: new Uint8Array([0x20 + index]),
          })),
        },
      ],
    });
    const result = readNeutralRemuxProgram(bytes, 'mkv');
    expect(result.state).toBe('OK');
    if (result.state !== 'OK') return;
    const video = result.value.tracks.find((track) => track.type === 'video')!;
    expect(video.samples.map((sample) => sample.ptsUs)).toEqual([0, 99_000, 33_000, 66_000]);
    expect(video.samples.map((sample) => sample.dtsUs)).toEqual([-67_000, -34_000, 0, 32_000]);
    expect(video.samples.map((sample) => sample.durationUs)).toEqual([33_000, 34_000, 32_000, 33_000]);
    const audio = result.value.tracks.find((track) => track.type === 'audio')!;
    expect(audio.samples.map((sample) => sample.durationUs)).toEqual([21_000, 22_000, 21_000, 21_000]);
    expect(result.value.durationUs).toBe(80_000);
  });

  test('Ogg EOS granule materializes Opus terminal discard padding', () => {
    const result = readNeutralRemuxProgram(
      bytesAt('fixtures/media/scenarios/remux/opus_ogg_to_mkv/02.ogg'),
      'ogg',
    );
    expect(result.state).toBe('OK');
    if (result.state !== 'OK') return;
    expect(result.value.tracks[0]?.samples).toHaveLength(19);
    expect(result.value.durationUs).toBe(1_106_500);
  });

  test('malformed candidate is FAIL; a reader implementation gap is ERROR, never NA_ASSET', () => {
    const source = bytesAt('fixtures/media/micro_h264_1frame.mp4');
    const truncated = source.subarray(0, source.byteLength - 1);
    const invalid = evaluateStrictStreamCopy(source, 'mp4', truncated, 'mp4');
    expect(oracleVerdict(invalid.outcome)).toBe('FAIL');
    expect(invalid.outcome.reasonCode).toBe('REMUX_OUTPUT_INVALID');

    const unsupported = evaluateStrictStreamCopy(source, 'mp4', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), 'avi');
    expect(unsupported.outcome.state).toBe('ERROR');
    expect(unsupported.outcome.reasonCode).toBe('REMUX_NEUTRAL_FORMAT_UNSUPPORTED');
  });

  test('classic ISO-BMFF range reader retains only tables and exact sample descriptors', async () => {
    const source = bytesAt('fixtures/media/micro_h264_1frame.mp4');
    const whole = readNeutralRemuxProgram(source, 'mp4');
    const ranged = await readIsoBmffRangeProgram({
      size: source.byteLength,
      range: async (start, end) => source.slice(start, end),
    });
    expect(whole.state).toBe('OK');
    expect(ranged.state).toBe('OK');
    if (whole.state !== 'OK' || ranged.state !== 'OK') return;
    expect(ranged.value.byteLength).toBe(source.byteLength);
    expect(ranged.value.durationUs).toBe(whole.value.durationUs);
    expect(ranged.value.tracks.map((track) => ({
      type: track.type,
      codec: track.codec,
      samples: track.samples.length,
    }))).toEqual(whole.value.tracks.map((track) => ({
      type: track.type,
      codec: track.codec,
      samples: track.samples.length,
    })));
    for (let trackIndex = 0; trackIndex < ranged.value.tracks.length; trackIndex++) {
      const rangeTrack = ranged.value.tracks[trackIndex]!;
      const wholeTrack = whole.value.tracks[trackIndex]!;
      for (const sampleIndex of [0, rangeTrack.samples.length - 1]) {
        const descriptor = rangeTrack.samples[sampleIndex]!;
        const payload = source.slice(
          descriptor.fileOffset,
          descriptor.fileOffset + descriptor.byteLength,
        );
        expect(payload).toEqual(wholeTrack.samples[sampleIndex]!.payload);
        expect(descriptor.ptsUs).toBe(wholeTrack.samples[sampleIndex]!.ptsUs);
        expect(descriptor.dtsUs).toBe(wholeTrack.samples[sampleIndex]!.dtsUs);
      }
    }
  });

  test('fragmented ISO-BMFF range reader retains complete lazy sample descriptors', async () => {
    const source = bytesAt('fixtures/media/fragmented_cmaf.mp4');
    const whole = readNeutralRemuxProgram(source, 'mp4');
    let largestRead = 0;
    const ranged = await readIsoBmffRangeProgram({
      size: source.byteLength,
      range: async (start, end) => {
        largestRead = Math.max(largestRead, end - start);
        return source.slice(start, end);
      },
    });
    expect(whole.state).toBe('OK');
    expect(ranged.state).toBe('OK');
    if (whole.state !== 'OK' || ranged.state !== 'OK') return;
    expect(ranged.value.representation.fragmented).toBe(true);
    expect(ranged.value.durationUs).toBe(whole.value.durationUs);
    expect(ranged.value.tracks.map((track) => track.samples.length)).toEqual(
      whole.value.tracks.map((track) => track.samples.length),
    );
    for (let trackIndex = 0; trackIndex < ranged.value.tracks.length; trackIndex++) {
      const rangeTrack = ranged.value.tracks[trackIndex]!;
      const wholeTrack = whole.value.tracks[trackIndex]!;
      for (const sampleIndex of [0, rangeTrack.samples.length - 1]) {
        const descriptor = rangeTrack.samples[sampleIndex]!;
        expect(source.slice(
          descriptor.fileOffset,
          descriptor.fileOffset + descriptor.byteLength,
        )).toEqual(wholeTrack.samples[sampleIndex]!.payload);
        expect(descriptor.ptsUs).toBe(wholeTrack.samples[sampleIndex]!.ptsUs);
        expect(descriptor.dtsUs).toBe(wholeTrack.samples[sampleIndex]!.dtsUs);
      }
    }
    expect(largestRead).toBeLessThan(source.byteLength);
  });

  test('real fixtures are self-identical and payload corruption is never a representation DIFF', () => {
    for (const [file, container] of [
      ['h264_ts.ts', 'ts'], ['aac_adts.aac', 'adts'], ['mp3_xing.mp3', 'mp3'],
      ['opus.ogg', 'ogg'], ['flac_seektable.flac', 'flac'],
    ] as const) {
      const bytes = bytesAt(`fixtures/media/${file}`);
      expect(oracleVerdict(evaluateStrictStreamCopy(bytes, container, bytes, container, { surfaceRepresentationDifferences: false }).outcome), file).toBe('PASS');
    }
    const aac = bytesAt('fixtures/media/aac_adts.aac');
    const changed = aac.slice();
    changed[20] ^= 1;
    expect(oracleVerdict(evaluateStrictStreamCopy(aac, 'adts', changed, 'adts').outcome)).toBe('FAIL');
  });
});

describe('REQ-FEAT-09 executable two-leg round trip', () => {
  test('observes exactly outbound and return calls and retains first-leg evidence', async () => {
    const source = concat(adtsFrame(new Uint8Array([1, 2, 3])), adtsFrame(new Uint8Array([4, 5, 6])));
    const input = inputFromBytes('roundtrip.aac', source);
    const contract = remuxRoundTripContractFromOptions({ container: 'mkv', roundTrip: ['mkv', 'adts'] })!;
    const calls: Array<{ leg: string; container: string; bytes: Uint8Array }> = [];
    const final = await executeRemuxRoundTrip(input, contract, async (legInput, options, leg): Promise<MediaBytes> => {
      const delivered = new Uint8Array(await legInput.arrayBuffer());
      calls.push({ leg, container: options.container, bytes: delivered });
      return {
        bytes: delivered.slice(),
        mime: leg === 'outbound' ? 'video/x-matroska' : 'audio/aac',
        container: options.container,
      };
    });
    expect(calls.map((call) => [call.leg, call.container])).toEqual([['outbound', 'mkv'], ['return', 'adts']]);
    expect(calls[1]!.bytes).toEqual(source);
    expect(final.intermediates?.[0]).toMatchObject({ role: REMUX_ROUND_TRIP_LEG_ROLE, container: 'mkv' });
    expect(oracleVerdict(evaluateStrictStreamCopy(source, 'adts', final.bytes, 'adts', { surfaceRepresentationDifferences: false }).outcome)).toBe('PASS');
  });

  test('a fault injected only on the return leg fails the final property', async () => {
    const source = concat(adtsFrame(new Uint8Array([1, 2, 3])), adtsFrame(new Uint8Array([4, 5, 6])));
    const input = inputFromBytes('roundtrip-fault.aac', source);
    const contract = remuxRoundTripContractFromOptions({ container: 'mkv', roundTrip: ['mkv', 'adts'] })!;
    const final = await executeRemuxRoundTrip(input, contract, async (legInput, options, leg) => {
      const delivered = new Uint8Array(await legInput.arrayBuffer());
      const output = delivered.slice();
      if (leg === 'return') output[10] ^= 1;
      return { bytes: output, mime: 'audio/aac', container: options.container };
    });
    expect(oracleVerdict(evaluateStrictStreamCopy(source, 'adts', final.bytes, 'adts').outcome)).toBe('FAIL');
  });

  test('the registered round-trip row negotiates both wrappers and requires both oracles', () => {
    const scenario = remuxScenarios.find((item) => item.id === 'remux/prop_roundtrip_mp4_mkv_mp4')!;
    expect(scenario.requires.containersOut).toEqual(['mkv', 'mp4']);
    expect(scenario.oracles).toEqual(['property-invariant', 'reference-reimport']);
    expect((scenario.options as Record<string, unknown>).roundTrip).toEqual(['mkv', 'mp4']);
  });
});

describe('REQ-FEAT-10 safe partial remux classifications', () => {
  test('distinguishes clean rejection, valid complete prefix, invalid output, and timeout', async () => {
    expect(classifyRejectedPartialRemux().disposition).toBe('rejected');
    expect(oracleVerdict(classifyRejectedPartialRemux().outcome)).toBe('PASS');
    expect(classifyTimedOutPartialRemux().disposition).toBe('timeout');
    expect(oracleVerdict(classifyTimedOutPartialRemux().outcome)).toBe('FAIL');

    const complete = concat(adtsFrame(new Uint8Array([1, 2, 3])), adtsFrame(new Uint8Array([4, 5, 6])));
    const valid = await validateReturnedPartialRemux({
      outputBytes: complete, outputContainer: 'adts', sourceByteLength: 1_000,
    });
    expect(valid.disposition).toBe('valid-partial');
    expect(oracleVerdict(valid.outcome)).toBe('PASS');
    expect(valid.outcome.reasonCode).toBe('REMUX_PARTIAL_VALID_COMPLETE_PREFIX');

    const incomplete = await validateReturnedPartialRemux({
      outputBytes: complete.subarray(0, complete.byteLength - 1), outputContainer: 'adts', sourceByteLength: 1_000,
    });
    expect(incomplete.disposition).toBe('invalid-output');
    expect(oracleVerdict(incomplete.outcome)).toBe('FAIL');

    const unbounded = await validateReturnedPartialRemux({
      outputBytes: complete, outputContainer: 'adts', sourceByteLength: 1, maxExpansionRatio: 2,
    });
    expect(unbounded.outcome.reasonCode).toBe('REMUX_PARTIAL_OUTPUT_UNBOUNDED');
  });

  test('requires a terminal probe to reach every retained track/sample when supplied', async () => {
    const complete = concat(adtsFrame(new Uint8Array([1, 2, 3])), adtsFrame(new Uint8Array([4, 5, 6])));
    const stoppedEarly = await validateReturnedPartialRemux({
      outputBytes: complete, outputContainer: 'adts', sourceByteLength: 1_000,
      terminalProbe: {
        state: 'PASS', validatedTrackIds: ['adts:0'], decodedThroughPtsUs: 0,
        detail: 'seeded early stop',
      },
    });
    expect(stoppedEarly.disposition).toBe('invalid-output');
    expect(stoppedEarly.outcome.reasonCode).toBe('REMUX_PARTIAL_TERMINAL_SAMPLE_UNREACHED');

    const noReader = await validateReturnedPartialRemux({
      outputBytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), outputContainer: 'avi', sourceByteLength: 100,
    });
    expect(noReader.outcome.state).toBe('ERROR');
    expect(noReader.outcome.reasonCode).toBe('REMUX_NEUTRAL_FORMAT_UNSUPPORTED');
  });

  test('the truncated scenario no longer grants unconditional output presence a PASS', () => {
    const scenario = remuxScenarios.find((item) => item.id === 'remux/neg_truncated_mp4_to_mkv')!;
    const options = scenario.options as Record<string, unknown>;
    expect(options.gracefulAllowOutput).toBeUndefined();
    expect(options.invariant).toBe('safe-partial-output');
    expect(scenario.oracles).toEqual(['graceful-failure', 'property-invariant']);
    expect(options.robustness).toMatchObject({
      schema: 'media-test/robustness-contract@1', inputClass: 'negative', returnedOutputCheck: 'media-structure',
    });
  });
});

describe('REQ-FEAT-11 manifest-derived size-ladder availability', () => {
  test('all four size rows publish revisioned exact workload envelopes', () => {
    const expected = new Map<string, object>([
      ['remux/large_h264_1080p_120s_mp4_to_mkv', {
        minWidth: 1920, maxWidth: 1920, minHeight: 1080, maxHeight: 1080,
        minDurationSec: 108, maxDurationSec: 132,
      }],
      ['remux/large_vp9_1080p_120s_webm_to_mkv', {
        minWidth: 1920, maxWidth: 1920, minHeight: 1080, maxHeight: 1080,
        minDurationSec: 108, maxDurationSec: 132,
      }],
      ['remux/huge_h264_1080p_600s_mov_to_mp4', {
        minWidth: 1920, maxWidth: 1920, minHeight: 1080, maxHeight: 1080,
        minDurationSec: 540, maxDurationSec: 660,
      }],
      ['remux/massive_h264_1080p_2h_mp4_to_mkv', {
        minWidth: 1920, maxWidth: 1920, minHeight: 1080, maxHeight: 1080,
        minDurationSec: 6480, maxDurationSec: 7920,
      }],
    ]);
    const sizeRows = remuxScenarios.filter((scenario) => expected.has(scenario.id));

    expect(sizeRows).toHaveLength(expected.size);
    for (const scenario of sizeRows) {
      expect(scenario.revision, scenario.id).toBe(2);
      expect(scenario.candidateEnvelope, scenario.id).toEqual(expected.get(scenario.id));
      expect(Object.isFrozen(scenario.candidateEnvelope), scenario.id).toBe(true);
    }
  });

  test('size envelopes close the current catalog to the exact 167-member remux pool', () => {
    const catalog = parseScenarioSourceCatalog(textAt('fixtures/media/scenarios/_sources.ndjson'));
    const baked = parseBakedCorpusManifest(JSON.parse(textAt('fixtures/manifest.json')));
    if (catalog.state !== 'VALID' || baked.state !== 'VALID') {
      throw new Error('expected valid committed selection catalogs');
    }
    const selection = buildSelectionManifest({
      scenarios: remuxScenarios,
      catalog: catalog.catalog,
      bakedManifest: baked.manifest,
    });
    expect(selection.pools).toHaveLength(49);
    expect(selection.pools.reduce((total, pool) => total + pool.candidates.length, 0)).toBe(167);

    const expected = new Map<string, { admitted: string[]; rejected: string[] }>([
      ['remux/large_h264_1080p_120s_mp4_to_mkv', {
        admitted: ['large_h264_1080p_120s.mp4'],
        rejected: ['01.mp4', '02.mp4', '03.mp4'],
      }],
      ['remux/large_vp9_1080p_120s_webm_to_mkv', {
        admitted: ['large_vp9_1080p_120s.webm'],
        rejected: ['01.webm', '02.webm', '03.webm'],
      }],
      ['remux/huge_h264_1080p_600s_mov_to_mp4', {
        admitted: ['01.mov', 'huge_h264_1080p_600s.mov'],
        rejected: ['02.mov', '03.mov'],
      }],
      ['remux/massive_h264_1080p_2h_mp4_to_mkv', {
        admitted: ['massive_h264_1080p_2h.mp4'],
        rejected: ['01.mp4', '02.mp4', '03.mp4'],
      }],
    ]);
    for (const [scenarioId, exact] of expected) {
      const pool = selection.pools.find((candidate) => candidate.scenarioId === scenarioId);
      expect(pool?.candidates.map((candidate) => candidate.selectedFile), scenarioId).toEqual(exact.admitted);
      expect(pool?.rejections.map((rejection) => rejection.selectedFile), scenarioId).toEqual(exact.rejected);
      expect(
        pool?.rejections.every((rejection) => rejection.reasonCode === 'CANDIDATE_INPUT_CONTRACT_MISMATCH'),
        scenarioId,
      ).toBe(true);
    }
  });

  test('every one of the 49 remux rows resolves to a concrete manifest identity', () => {
    const source = manifest();
    expect(remuxScenarios).toHaveLength(49);
    expect(auditRemuxScenarioAvailability(remuxScenarios, source)).toEqual([]);
    for (const id of [
      'large_h264_1080p_120s.mp4', 'large_vp9_1080p_120s.webm',
      'huge_h264_1080p_600s.mov', 'massive_h264_1080p_2h.mp4',
    ]) {
      expect(remuxFixtureAvailability(id, source)).toMatchObject({ state: 'BAKED', reasonCode: 'REMUX_MANIFEST_IDENTITY_BAKED' });
    }
  });

  test('a stale null-hash assertion or manifest drift fails the audit', () => {
    const source = manifest();
    expect(auditRemuxAvailabilityAssertions(source, [{
      assetId: 'large_h264_1080p_120s.mp4', expectedState: 'PENDING',
    }])).toMatchObject([{ reasonCode: 'REMUX_AVAILABILITY_ASSERTION_STALE' }]);

    const drifted = structuredClone(source) as { assets: Array<Record<string, unknown>> };
    const target = drifted.assets.find((asset) => asset.id === 'large_h264_1080p_120s.mp4')!;
    target.sha256 = null;
    target.sizeBytes = null;
    expect(auditRemuxScenarioAvailability(remuxScenarios, drifted as unknown as RemuxFixtureManifest)).toContainEqual(
      expect.objectContaining({ assetId: 'large_h264_1080p_120s.mp4', reasonCode: 'REMUX_MANIFEST_IDENTITY_PENDING' }),
    );
    expect(textAt('src/scenarios/remux/size-ladder.ts')).not.toContain('sha256/sizeBytes still null');
  });
});
