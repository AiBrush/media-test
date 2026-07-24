import { describe, expect, test } from 'bun:test';
import {
  AdapterContractError,
  BrowserNotSupportedError,
  createBrowserNotSupportedError,
  createMalformedInputError,
  createNotApplicableError,
  isBrowserNotSupportedError,
  isMalformedInputError,
  isNotApplicableError,
  validateAdapterResult,
  validateCapabilitySet,
  validateDemuxResult,
  validateEncodedTracks,
  validateFrameSink,
  validateMediaBytes,
  validateNormalizedMetadata,
  validateOperationFinalCounters,
  validateSupportDecision,
  type CapabilitySet,
  type DemuxResult,
  type EncodedTrack,
  type MediaBytes,
  type MediaEngine,
  type NormalizedMetadata,
} from '../src/core/engine.ts';
import type { OracleVerdict } from '../src/core/scenario.ts';

const ENGINE_ID = 'fake-adapter@1.0.0';
const SHA = 'ab'.repeat(32);

describe('REQ-ADP-01/02/03: verdict-neutral evidence and typed applicability channels', () => {
  test('canonical, representationally different, and invalid semantic fixtures are PASS/PASS/FAIL with the representation difference recorded outside the adapter', () => {
    const canonical = demuxFixture('annexb', 100);
    const representationDiff = demuxFixture('avc', 100);
    const semanticallyInvalid = demuxFixture('annexb', 7);

    validateDemuxResult(ENGINE_ID, canonical);
    validateDemuxResult(ENGINE_ID, representationDiff);
    validateDemuxResult(ENGINE_ID, semanticallyInvalid);

    // A representation difference is a PASS, but stays distinguished from an exact match by reasonCode.
    expect(oracleOutcome(canonical)).toEqual({ verdict: 'PASS', reasonCode: 'ORACLE_MATCH' });
    expect(oracleOutcome(representationDiff)).toEqual({ verdict: 'PASS', reasonCode: 'ORACLE_REPRESENTATION_DIFF' });
    expect(oracleOutcome(semanticallyInvalid)).toEqual({ verdict: 'FAIL', reasonCode: 'ORACLE_MISMATCH' });
  });

  test('exact browser misses and framework tuple misses stay structurally distinct for the same codec', () => {
    const tuple = { inputContainers: ['mp4'], inputCodecs: ['h264'], outputCodecs: ['h264'] };
    const engineMiss = createNotApplicableError(
      ENGINE_ID,
      'transcode',
      'framework cannot emit this tuple',
      tuple,
      'FRAMEWORK_TUPLE_UNSUPPORTED',
    );
    const browserMiss = createBrowserNotSupportedError(
      ENGINE_ID,
      'transcode',
      'browser rejected the exact profile',
      tuple,
      'WEB_CODECS_CONFIG_UNSUPPORTED',
      {
        role: 'video-encoder',
        config: { codec: 'avc1.640028', width: 1920, height: 1080, framerate: 30000 / 1001 },
      },
    );

    expect(isNotApplicableError(structuredClone(engineMiss))).toBe(true);
    expect(isBrowserNotSupportedError(structuredClone(browserMiss))).toBe(true);
    expect(isNotApplicableError(browserMiss)).toBe(false);
    expect(isBrowserNotSupportedError(engineMiss)).toBe(false);
    expect(browserMiss).toBeInstanceOf(BrowserNotSupportedError);
    expect(validateSupportDecision(ENGINE_ID, {
      supported: false,
      status: 'NA_BROWSER',
      reasonCode: browserMiss.reasonCode,
      reason: browserMiss.reason,
      browserConfigs: [browserMiss.browserConfig!],
    }).status).toBe('NA_BROWSER');
  });

  test('malformed rejection and unexpected fault are never reclassified by names or prose', () => {
    const malformed = new Error('not supported malformed bytes');
    malformed.name = 'NotApplicableError';
    const crash = new Error('codec unavailable because internal state crashed');
    expect(isNotApplicableError(malformed)).toBe(false);
    expect(isBrowserNotSupportedError(crash)).toBe(false);
  });

  test('typed malformed-media rejection survives direct, cloned, and JSON transport without becoming applicability', () => {
    const malformed = createMalformedInputError(
      ENGINE_ID,
      'demux',
      'parse',
      'the admitted tuple contained a truncated sample table',
      'TRUNCATED_SAMPLE_TABLE',
      'fixture/truncated.mp4',
      new RangeError('box extends beyond input'),
    );

    for (const transported of [
      malformed,
      structuredClone(malformed),
      JSON.parse(JSON.stringify(malformed)) as unknown,
    ]) {
      expect(isMalformedInputError(transported)).toBe(true);
      expect(isNotApplicableError(transported)).toBe(false);
      expect(isBrowserNotSupportedError(transported)).toBe(false);
    }

    expect(isMalformedInputError({ ...structuredClone(malformed), stage: 'execute' })).toBe(false);
    expect(isMalformedInputError({ ...structuredClone(malformed), reasonCode: '' })).toBe(false);
    expect(isMalformedInputError(new TypeError('malformed input'))).toBe(false);
  });
});

describe('REQ-ADP-04: normalized carrier validation', () => {
  test('round-trips every normalized carrier', () => {
    const metadata = metadataFixture();
    const demux = demuxFixture('annexb', 100);
    const bytes = bytesFixture();
    const frames = frameFixture();
    const tracks = { tracks: [encodedTrackFixture('h264', 'annexb')] };

    expect(validateNormalizedMetadata(ENGINE_ID, metadata)).toBe(metadata);
    expect(validateDemuxResult(ENGINE_ID, demux)).toBe(demux);
    expect(validateMediaBytes(ENGINE_ID, bytes)).toBe(bytes);
    expect(validateFrameSink(ENGINE_ID, frames)).toBe(frames);
    expect(validateEncodedTracks(ENGINE_ID, tracks)).toBe(tracks);
    expect(validateAdapterResult(ENGINE_ID, 'probe', metadata)).toBe(metadata);
    expect(validateAdapterResult(ENGINE_ID, 'demux', demux)).toBe(demux);
    expect(validateAdapterResult(ENGINE_ID, 'remux', bytes)).toBe(bytes);
    expect(validateAdapterResult(ENGINE_ID, 'decodeFrames', frames)).toBe(frames);
    expect(validateAdapterResult(ENGINE_ID, 'seek', { landedPtsUs: 0, frame: frames.frames[0] })).toEqual({
      landedPtsUs: 0,
      frame: frames.frames[0],
    });
  });

  test('validates codecs by track type without rejecting legitimate non-AV carrier tracks', () => {
    const timecode: NormalizedMetadata = {
      container: 'mov',
      durationSec: 10,
      tracks: [{ type: 'other', codec: 'tmcd', nativeCodecTag: 'tmcd', codecRaw: 'tmcd' }],
    };
    expect(validateNormalizedMetadata(ENGINE_ID, timecode)).toBe(timecode);

    const subtitle: NormalizedMetadata = {
      container: 'mp4',
      durationSec: 10,
      tracks: [{ type: 'subtitle', codec: 'webvtt', nativeCodecTag: 'wvtt' }],
    };
    expect(validateNormalizedMetadata(ENGINE_ID, subtitle)).toBe(subtitle);

    const videoWithAudioCodec = metadataFixture();
    videoWithAudioCodec.tracks[0]!.codec = 'aac';
    expectContractPath(
      () => validateNormalizedMetadata(ENGINE_ID, videoWithAudioCodec),
      'metadata.tracks[0].codec',
    );

    const audioWithVideoCodec: NormalizedMetadata = {
      container: 'mp4',
      durationSec: 1,
      tracks: [{ type: 'audio', codec: 'h264', sampleRate: 48_000, channels: 2 }],
    };
    expectContractPath(
      () => validateNormalizedMetadata(ENGINE_ID, audioWithVideoCodec),
      'metadata.tracks[0].codec',
    );

    const falseCanonicalTimecode = structuredClone(timecode);
    falseCanonicalTimecode.tracks[0]!.codecCanonical = 'h264';
    expectContractPath(
      () => validateNormalizedMetadata(ENGINE_ID, falseCanonicalTimecode),
      'metadata.tracks[0].codecCanonical',
    );
  });

  const invalidMetadataRows: Array<{ name: string; mutate(value: NormalizedMetadata): void; path: string }> = [
    { name: 'container token', mutate: (value) => { value.container = 'MP4'; }, path: 'metadata.container' },
    { name: 'codec token', mutate: (value) => { value.tracks[0]!.codec = 'avc1.640028'; }, path: 'metadata.tracks[0].codec' },
    { name: 'duration finiteness', mutate: (value) => { value.durationSec = Number.NaN; }, path: 'metadata.durationSec' },
    { name: 'dimension sign', mutate: (value) => { value.tracks[0]!.width = -1; }, path: 'metadata.tracks[0].width' },
    { name: 'rate finiteness', mutate: (value) => { value.tracks[0]!.fps = Infinity; }, path: 'metadata.tracks[0].fps' },
  ];

  for (const row of invalidMetadataRows) {
    test(`names the exact invalid ${row.name} field`, () => {
      const value = metadataFixture();
      row.mutate(value);
      expectContractPath(() => validateNormalizedMetadata(ENGINE_ID, value), row.path);
    });
  }

  test('rejects negative packet size and out-of-range track index at exact paths', () => {
    const negative = demuxFixture('annexb', 100);
    negative.packets[0]!.size = -1;
    expectContractPath(() => validateDemuxResult(ENGINE_ID, negative), 'demux.packets[0].size');

    const badIndex = demuxFixture('annexb', 100);
    badIndex.packets[0]!.trackIndex = 1;
    expectContractPath(() => validateDemuxResult(ENGINE_ID, badIndex), 'demux.packets[0].trackIndex');
  });

  test('accepts absent DTS and validates DTS only when the observer supplies it', () => {
    const absent = demuxFixture('annexb', 100);
    delete absent.packets[0]!.dtsUs;
    expect(validateDemuxResult(ENGINE_ID, absent)).toBe(absent);

    const invalid = demuxFixture('annexb', 100);
    invalid.packets[0]!.dtsUs = Number.NaN;
    expectContractPath(() => validateDemuxResult(ENGINE_ID, invalid), 'demux.packets[0].dtsUs');
  });

  test('validates typed frame-rate provenance and its sampled observation pair', () => {
    const valid = metadataFixture();
    valid.tracks[0]!.fpsProvenance = {
      source: 'average',
      cadence: 'VFR',
      sampleCount: 120,
      observedIntervalUs: 4_004_000,
      rational: { numerator: 30_000, denominator: 1001 },
      envelope: { minFps: 24, maxFps: 60 },
    };
    expect(validateNormalizedMetadata(ENGINE_ID, valid)).toBe(valid);

    const missingInterval = metadataFixture();
    (missingInterval.tracks[0] as unknown as Record<string, unknown>).fpsProvenance = {
      source: 'observed',
      sampleCount: 120,
    };
    expectContractPath(
      () => validateNormalizedMetadata(ENGINE_ID, missingInterval),
      'metadata.tracks[0].fpsProvenance',
    );

    const invertedEnvelope = metadataFixture();
    invertedEnvelope.tracks[0]!.fpsProvenance = {
      source: 'nominal',
      envelope: { minFps: 60, maxFps: 24 },
    };
    expectContractPath(
      () => validateNormalizedMetadata(ENGINE_ID, invertedEnvelope),
      'metadata.tracks[0].fpsProvenance.envelope.maxFps',
    );
  });

  test('rejects inconsistent frame indices', () => {
    const value = frameFixture();
    value.frames.push({ ...value.frames[0]!, index: 7, ptsUs: 33_366 });
    expectContractPath(() => validateFrameSink(ENGINE_ID, value), 'frames.frames[1].index');
  });

  test('rejects empty, non-tight, aliased, detached, and recursive byte outputs', () => {
    expectContractPath(
      () => validateMediaBytes(ENGINE_ID, { bytes: new Uint8Array(), mime: 'video/mp4', container: 'mp4' }),
      'output.bytes',
    );

    const backing = new Uint8Array([0, 1, 2]);
    expectContractPath(
      () => validateMediaBytes(ENGINE_ID, { bytes: backing.subarray(1), mime: 'video/mp4', container: 'mp4' }),
      'output.bytes',
    );

    const shared = new Uint8Array([1]);
    expectContractPath(
      () => validateMediaBytes(ENGINE_ID, {
        bytes: shared,
        mime: 'video/mp4',
        container: 'mp4',
        variants: [{ bytes: shared, mime: 'video/mp4', container: 'mp4' }],
      }),
      'output.variants[0].bytes',
    );

    const detached = new Uint8Array([1, 2, 3]);
    structuredClone(detached, { transfer: [detached.buffer] });
    expectContractPath(
      () => validateMediaBytes(ENGINE_ID, { bytes: detached, mime: 'video/mp4', container: 'mp4' }),
      'output.bytes',
    );

    const cycle = bytesFixture() as MediaBytes & { variants: MediaBytes[] };
    cycle.variants = [cycle];
    expectContractPath(() => validateMediaBytes(ENGINE_ID, cycle), 'output.variants[0]');
  });

  test('allows explicitly permitted empty bytes but still validates ownership and shape', () => {
    const value = { bytes: new Uint8Array(), mime: 'video/mp4', container: 'mp4' };
    expect(validateMediaBytes(ENGINE_ID, value, 'output', { allowEmptyBytes: true })).toBe(value);
  });
});

describe('REQ-ADP-05: explicit coded representation', () => {
  for (const [codec, framing] of [
    ['h264', 'annexb'],
    ['h264', 'avc'],
    ['hevc', 'annexb'],
    ['hevc', 'hevc'],
  ] as const) {
    test(`passes explicit ${codec}/${framing} through prepareMuxTracks/mux without codec-name inference`, async () => {
      const tracks = { tracks: [encodedTrackFixture(codec, framing)] };
      const fakeAdapter = {
        async prepareMuxTracks() { return tracks; },
        async mux(prepared: typeof tracks) {
          validateEncodedTracks(ENGINE_ID, prepared);
          return bytesFixture();
        },
      };
      const prepared = await fakeAdapter.prepareMuxTracks();
      expect(prepared).toBe(tracks);
      expect(validateMediaBytes(ENGINE_ID, await fakeAdapter.mux(prepared)).container).toBe('mp4');
    });
  }

  test('rejects H.264/H.265 tracks before mux authoring when framing is absent or inconsistent', () => {
    const absent = encodedTrackFixture('h264', 'annexb') as EncodedTrack;
    delete absent.framing;
    expectContractPath(() => validateEncodedTracks(ENGINE_ID, { tracks: [absent] }), 'encodedTracks.tracks[0].framing');

    const inconsistent = encodedTrackFixture('hevc', 'hevc');
    inconsistent.descriptionRecord = 'avc-decoder-configuration-record';
    expectContractPath(
      () => validateEncodedTracks(ENGINE_ID, { tracks: [inconsistent] }),
      'encodedTracks.tracks[0].descriptionRecord',
    );
  });

  test('encoded chunks preserve honest missing DTS with explicit decode ordering', () => {
    const track = encodedTrackFixture('h264', 'annexb');
    delete track.chunks[0]!.dtsUs;
    track.packetOrdering = 'decode';
    track.chunks[0]!.decodeIndex = 0;
    expect(validateEncodedTracks(ENGINE_ID, { tracks: [track] }).tracks[0]!.chunks[0]!.dtsUs).toBeUndefined();

    const partial = encodedTrackFixture('h264', 'annexb');
    partial.chunks.push({
      data: new Uint8Array([0, 0, 1, 1]),
      ptsUs: 33_366,
      durationUs: 33_366,
      keyframe: false,
    });
    partial.chunks[0]!.decodeIndex = 0;
    expectContractPath(
      () => validateEncodedTracks(ENGINE_ID, { tracks: [partial] }),
      'encodedTracks.tracks[0].chunks',
    );
  });

  test('encoded chunks validate separately owned alpha access units', () => {
    const track = encodedTrackFixture('h264', 'annexb');
    track.chunks[0]!.alphaData = new Uint8Array([4, 3, 2, 1]);
    expect(validateEncodedTracks(ENGINE_ID, { tracks: [track] }).tracks[0]!.chunks[0]!.alphaData)
      .toEqual(new Uint8Array([4, 3, 2, 1]));

    const aliased = encodedTrackFixture('h264', 'annexb');
    aliased.chunks[0]!.alphaData = aliased.chunks[0]!.data.subarray(0, 1);
    expectContractPath(
      () => validateEncodedTracks(ENGINE_ID, { tracks: [aliased] }),
      'encodedTracks.tracks[0].chunks[0].alphaData',
    );
  });

  test('encoded video rotation is restricted to clockwise cardinal metadata', () => {
    const track = encodedTrackFixture('h264', 'annexb');
    track.rotation = 90;
    expect(validateEncodedTracks(ENGINE_ID, { tracks: [track] }).tracks[0]!.rotation).toBe(90);

    (track as EncodedTrack & { rotation: number }).rotation = 45;
    expectContractPath(
      () => validateEncodedTracks(ENGINE_ID, { tracks: [track] }),
      'encodedTracks.tracks[0].rotation',
    );
  });
});

describe('capability and final-counter boundary checks', () => {
  test('rejects duplicate/directional non-canonical capability tokens and method mismatches', () => {
    const caps = emptyCaps();
    caps.operations.mux = true;
    const engine = { id: ENGINE_ID, capabilities: () => caps } as MediaEngine;
    expectContractPath(() => validateCapabilitySet(engine, caps), 'capabilities.operations.mux');

    const duplicate = emptyCaps();
    duplicate.containersIn = ['mp4', 'mp4'];
    expectContractPath(
      () => validateCapabilitySet({ id: ENGINE_ID, capabilities: () => duplicate } as MediaEngine, duplicate),
      'capabilities.containersIn[1]',
    );
  });

  test('final counters cannot fabricate invalid values', () => {
    expect(validateOperationFinalCounters(ENGINE_ID, { progress: 1, bytesWritten: 4, writeCount: 1 })).toEqual({
      progress: 1,
      bytesWritten: 4,
      writeCount: 1,
    });
    expectContractPath(() => validateOperationFinalCounters(ENGINE_ID, { progress: 2 }), 'telemetry.progress');
  });
});

function metadataFixture(): NormalizedMetadata {
  return {
    container: 'mp4',
    durationSec: 1,
    tracks: [{ type: 'video', codec: 'h264', nativeCodecTag: 'avc1.640028', width: 1920, height: 1080, fps: 30 }],
    tags: { title: 'fixture' },
  };
}

function demuxFixture(framing: 'annexb' | 'avc', size: number): DemuxResult {
  const lengthPrefixed = framing === 'avc';
  return {
    metadata: metadataFixture(),
    packets: [{ trackIndex: 0, size, ptsUs: 0, dtsUs: 0, keyframe: true }],
    packetOrdering: 'decode',
    representations: [{
      trackIndex: 0,
      packetOrdering: 'decode',
      timebase: { numerator: 1, denominator: 90_000 },
      framing,
      accessUnitGrouping: 'one-access-unit-per-chunk',
      parameterSetLocation: lengthPrefixed ? 'description' : 'in-band',
      nativeCodecTag: 'avc1.640028',
      ...(lengthPrefixed
        ? {
            description: new Uint8Array([1, 100, 0, 40]),
            descriptionRecord: 'avc-decoder-configuration-record' as const,
          }
        : {}),
    }],
    telemetry: { packetCount: 1 },
  };
}

function bytesFixture(): MediaBytes {
  return {
    bytes: new Uint8Array([1, 2, 3, 4]),
    mime: 'video/mp4',
    container: 'mp4',
    targetWrites: 1,
    firstByteMs: 0.25,
    telemetry: { bytesWritten: 4, writeCount: 1, firstByteMs: 0.25 },
  };
}

function frameFixture() {
  return {
    frames: [{ index: 0, ptsUs: 0, sha256: SHA, width: 2, height: 2 }],
    telemetry: { decodedFrames: 1, firstFrameMs: 0.5 },
  };
}

function encodedTrackFixture(codec: 'h264' | 'hevc', framing: 'annexb' | 'avc' | 'hevc'): EncodedTrack {
  const lengthPrefixed = framing === 'avc' || framing === 'hevc';
  return {
    type: 'video',
    codec,
    nativeCodecTag: codec === 'h264' ? 'avc1.640028' : 'hvc1.1.6.L93.B0',
    timescale: 90_000,
    packetOrdering: 'decode',
    timebase: { numerator: 1, denominator: 90_000 },
    framing,
    accessUnitGrouping: 'one-access-unit-per-chunk',
    parameterSetLocation: lengthPrefixed ? 'description' : 'in-band',
    ...(lengthPrefixed
      ? {
          description: new Uint8Array([1, 2, 3, 4]),
          descriptionRecord:
            framing === 'avc'
              ? ('avc-decoder-configuration-record' as const)
              : ('hevc-decoder-configuration-record' as const),
        }
      : {}),
    width: 1920,
    height: 1080,
    chunks: [{
      data: new Uint8Array([0, 0, 1, 9]),
      ptsUs: 0,
      dtsUs: 0,
      decodeIndex: 0,
      durationUs: 33_366,
      keyframe: true,
    }],
  };
}

function oracleOutcome(value: DemuxResult): { verdict: OracleVerdict; reasonCode: string } {
  if (value.packets[0]?.size !== 100) return { verdict: 'FAIL', reasonCode: 'ORACLE_MISMATCH' };
  return value.representations?.[0]?.framing === 'annexb'
    ? { verdict: 'PASS', reasonCode: 'ORACLE_MATCH' }
    : { verdict: 'PASS', reasonCode: 'ORACLE_REPRESENTATION_DIFF' };
}

function emptyCaps(): CapabilitySet {
  return {
    operations: {},
    containersIn: [],
    containersOut: [],
    videoCodecs: [],
    audioCodecs: [],
    encryption: [],
    features: [],
  };
}

function expectContractPath(fn: () => unknown, path: string): void {
  try {
    fn();
    throw new Error(`expected AdapterContractError at ${path}`);
  } catch (error) {
    expect(error).toBeInstanceOf(AdapterContractError);
    expect((error as AdapterContractError).fieldPath).toBe(path);
  }
}
