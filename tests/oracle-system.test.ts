import { describe, expect, test } from 'bun:test';
import type {
  FrameDigest,
  MediaInput,
  NormalizedMetadata,
  PacketInfo,
} from '../src/core/engine.ts';
import type { OracleOutcome, Scenario } from '../src/core/scenario.ts';
import {
  emptyGoldenStore,
  matchFramesByPresentationTime,
  runOracle,
  validateOracleOutcome,
  type GoldenStore,
  type OracleContext,
} from '../src/core/oracles.ts';
import { readOutputPacketsResult, readOutputStructure } from '../src/core/box-readers.ts';
import { defineProbeMetadataFieldPolicy } from '../src/features/probe/index.ts';

test('neutral MP4 structure duration does not truncate a complete media timeline behind a short mvhd', async () => {
  const bytes = new Uint8Array(await Bun.file('fixtures/media/cenc_ctr_clear.mp4').arrayBuffer());
  const structure = readOutputStructure(bytes, 'mp4');
  expect(structure?.durationSec).toBeGreaterThan(5);
  expect(structure?.tracks.map((track) => track.type)).toEqual(['video', 'audio']);
});

test.each([
  ['cenc_ctr.mp4', ['cenc', 'cenc']],
  ['cenc_cbcs.mp4', ['cbcs']],
] as const)('neutral MP4 structure exposes the declared protection scheme for %s', async (name, expected) => {
  const bytes = new Uint8Array(await Bun.file(`fixtures/media/${name}`).arrayBuffer());
  const structure = readOutputStructure(bytes, 'mp4');
  expect(structure?.tracks.map((track) => track.protectionScheme).filter(Boolean)).toEqual([...expected]);
});

const input: MediaInput = {
  id: 'fixture.mp4',
  url: '/fixture.mp4',
  mime: 'video/mp4',
  async blob() { return new Blob(); },
  async arrayBuffer() { return new ArrayBuffer(0); },
};

function scenario(op: Scenario['op'], oracle: Scenario['oracles'][number], options?: Record<string, unknown>): Scenario {
  return {
    id: `${op === 'decodeFrames' ? 'decode-seek' : op}/oracle-fixture`,
    family: op === 'decodeFrames' ? 'decode-seek' : op as Scenario['family'],
    op,
    input: input.id,
    ...(options ? { options } : {}),
    requires: { operations: [op] },
    oracles: [oracle],
    metrics: [],
  };
}

function golden(meta?: NormalizedMetadata, packets?: PacketInfo[]): GoldenStore {
  const store = emptyGoldenStore();
  if (meta) {
    store.meta = meta;
    store.evidence.meta = { state: 'OK', value: meta, url: 'meta.json', raw: meta };
  }
  if (packets) {
    store.packets = packets;
    store.evidence.packets = { state: 'OK', value: packets, url: 'packets.json', raw: packets };
  }
  return store;
}

function context(overrides: Partial<OracleContext>): OracleContext {
  return {
    scenario: scenario('probe', 'golden-metadata'),
    input,
    golden: emptyGoldenStore(),
    decodeWithPlatform: async () => ({ frames: [] }),
    playbackSmoke: async () => true,
    ...overrides,
  };
}

function verdict(outcome: OracleOutcome): string {
  return outcome.state === 'VERDICT' ? outcome.verdict : outcome.status ?? outcome.state;
}

describe('REQ-ORAC-01 semantic golden metadata', () => {
  const video = (codec: string, extra: Record<string, unknown> = {}) =>
    ({ type: 'video', codec, width: 1920, height: 1080, fps: 30, ...extra }) as any;
  const audio = (codec: string, rate = 48_000, channels = 2, extra: Record<string, unknown> = {}) =>
    ({ type: 'audio', codec, sampleRate: rate, channels, ...extra }) as any;

  async function compare(got: NormalizedMetadata, want: NormalizedMetadata): Promise<OracleOutcome> {
    return runOracle('golden-metadata', context({
      scenario: scenario('probe', 'golden-metadata'),
      metadata: got,
      golden: golden(want),
    }));
  }

  test.each([
    ['avc1 alias', video('avc1.640028'), video('h264')],
    ['avc3 alias', video('avc3.640028'), video('h264')],
    ['hvc1 alias', video('hvc1.1.6.L93'), video('hevc')],
    ['hev1 alias', video('hev1.1.6.L93'), video('hevc')],
    ['Matroska AVC alias', video('V_MPEG4/ISO/AVC'), video('h264')],
    ['mp4a alias', audio('mp4a.40.2'), audio('aac')],
    ['AV1 RFC 6381 alias', video('av01.0.08M.08'), video('av1')],
    ['VP9 RFC 6381 alias', video('vp09.00.10.08'), video('vp9')],
  ])('%s is correctness-valid but remains a representation DIFF', async (_name, gotTrack, wantTrack) => {
    const out = await compare(
      { container: 'mp4', durationSec: 10, tracks: [gotTrack] },
      { container: 'mp4', durationSec: 10, tracks: [wantTrack] },
    );
    expect(verdict(out)).toBe('PASS');
    expect(out.reasonCode).toBe('ORACLE_REPRESENTATION_DIFF');
    expect(out.detail).toContain('codec alias');
    expect(out.detail).toContain('measuredCodecRaw');
    expect(out.detail).toContain('measuredCodecCanonical');
    expect(out.detail).toContain('minimum total semantic cost within track type');
  });

  test('native codec evidence never overrides the adapter-normalized semantic codec', async () => {
    const out = await compare(
      {
        container: 'adts', durationSec: 1,
        tracks: [audio('aac', 48_000, 2, { nativeCodecTag: '2' })],
      },
      { container: 'adts', durationSec: 1, tracks: [audio('aac')] },
    );
    expect(verdict(out)).toBe('PASS');
    expect(out.reasonCode).toBe('ORACLE_REPRESENTATION_DIFF');
    expect(out.detail).toContain("codec alias '2'→aac");
  });

  test('track ordering and deterministic same-type matching are preserved as DIFF evidence', async () => {
    const got = {
      container: 'mp4', durationSec: 10,
      tracks: [audio('aac', 44_100, 2, { language: 'fr' }), video('h264'), audio('aac', 48_000, 2, { language: 'en' })],
    };
    const want = {
      container: 'mp4', durationSec: 10,
      tracks: [video('h264'), audio('aac', 48_000, 2, { language: 'en' }), audio('aac', 44_100, 2, { language: 'fr' })],
    };
    const out = await compare(got, want);
    expect(verdict(out)).toBe('PASS');
    expect(out.reasonCode).toBe('ORACLE_REPRESENTATION_DIFF');
    expect(out.detail).toContain('logical track reordered');
    expect(out.detail).toContain('measuredIndex');
    expect(out.detail).toContain('goldenIndex');
  });

  test('an explicit media-track policy excludes auxiliary data tracks from semantic and declared-field matching', async () => {
    const got: NormalizedMetadata = {
      container: 'mov', durationSec: 10,
      tracks: [
        video('h264', { language: 'eng' }),
        audio('aac', 48_000, 2, { language: 'eng' }),
      ],
    };
    const want: NormalizedMetadata = {
      container: 'mov', durationSec: 10,
      tracks: [
        video('h264', { language: 'eng' }),
        { type: 'other', codec: '', language: 'eng' } as any,
        audio('aac', 48_000, 2, { language: 'eng' }),
      ],
    };
    const scopedScenario = scenario('probe', 'golden-metadata', {
      metadataTrackTypes: ['video', 'audio'],
      robustness: {
        probe: {
          metadataFieldPolicy: defineProbeMetadataFieldPolicy({ fields: ['track.language'] }),
        },
      },
    });
    const compareScoped = (metadata: NormalizedMetadata) => runOracle('golden-metadata', context({
      scenario: scopedScenario, metadata, golden: golden(want),
    }));
    const out = await compareScoped(got);
    expect(verdict(out)).toBe('PASS');
    expect(out.measurements).toMatchObject({ measuredTracks: 2, goldenTracks: 2, matchedTracks: 2 });
    expect(out.detail).toContain('PROBE_DECLARED_METADATA_FIELDS_MATCH');
    expect(out.detail).not.toContain('declared track fields have 2 matched track(s) for 3 golden track(s)');

    const wrongLanguage = await compareScoped({
      ...got,
      tracks: [got.tracks[0]!, { ...got.tracks[1]!, language: 'fra' }],
    });
    expect(verdict(wrongLanguage)).toBe('FAIL');
    expect(wrongLanguage.detail).toContain("audio measured[1]↔golden[1].language 'fra' vs golden 'eng'");
  });

  test('full semantic and relevant raw agreement remains PASS', async () => {
    const exact = { container: 'mp4', durationSec: 10, tracks: [video('h264'), audio('aac')] };
    expect(verdict(await compare(exact, structuredClone(exact)))).toBe('PASS');
  });

  test('SBR and Parametric Stereo ratios require signaling', async () => {
    const signaledSbr = await compare(
      { container: 'mp4', durationSec: 1, tracks: [audio('mp4a.40.5', 24_000, 2, { sbrPresent: true })] },
      { container: 'mp4', durationSec: 1, tracks: [audio('aac', 48_000, 2, { sbrPresent: true })] },
    );
    const unsignaledSbr = await compare(
      { container: 'mp4', durationSec: 1, tracks: [audio('aac', 24_000, 2)] },
      { container: 'mp4', durationSec: 1, tracks: [audio('aac', 48_000, 2)] },
    );
    const signaledPs = await compare(
      { container: 'mp4', durationSec: 1, tracks: [audio('mp4a.40.29', 48_000, 1, { psPresent: true })] },
      { container: 'mp4', durationSec: 1, tracks: [audio('aac', 48_000, 2, { psPresent: true })] },
    );
    const unsignaledPs = await compare(
      { container: 'mp4', durationSec: 1, tracks: [audio('aac', 48_000, 1)] },
      { container: 'mp4', durationSec: 1, tracks: [audio('aac', 48_000, 2)] },
    );
    expect(verdict(signaledSbr)).toBe('PASS');
    expect(signaledSbr.reasonCode).toBe('ORACLE_REPRESENTATION_DIFF');
    expect(verdict(unsignaledSbr)).toBe('FAIL');
    expect(verdict(signaledPs)).toBe('PASS');
    expect(signaledPs.reasonCode).toBe('ORACLE_REPRESENTATION_DIFF');
    expect(verdict(unsignaledPs)).toBe('FAIL');
  });

  test('typed NTSC derivation and VFR envelopes avoid false failure', async () => {
    const ntsc = await compare(
      {
        container: 'mp4', durationSec: 1,
        tracks: [video('h264', {
          fps: undefined,
          fpsProvenance: { source: 'average', cadence: 'CFR', sampleCount: 30_000, observedIntervalUs: 1_001_000_000 },
        })],
      },
      {
        container: 'mp4', durationSec: 1,
        tracks: [video('h264', {
          fps: undefined,
          fpsProvenance: { source: 'nominal', cadence: 'CFR', rational: { numerator: 30_000, denominator: 1001 } },
        })],
      },
    );
    const vfr = await compare(
      {
        container: 'mp4', durationSec: 1,
        tracks: [video('h264', {
          fps: undefined,
          fpsProvenance: {
            source: 'observed', cadence: 'VFR', sampleCount: 3, observedIntervalUs: 100_000,
            envelope: { minFps: 16.667, maxFps: 25 },
          },
        })],
      },
      {
        container: 'mp4', durationSec: 1,
        tracks: [video('h264', {
          fps: undefined,
          fpsProvenance: {
            source: 'observed', cadence: 'VFR', sampleCount: 3, observedIntervalUs: 100_000,
            envelope: { minFps: 20, maxFps: 25 },
          },
        })],
      },
    );
    expect(verdict(ntsc)).toBe('PASS');
    expect(ntsc.reasonCode).toBe('ORACLE_REPRESENTATION_DIFF');
    expect(verdict(vfr)).not.toBe('FAIL');
  });

  test('legacy rational/timestamp cadence fields remain backward-compatible', async () => {
    const ntsc = await compare(
      { container: 'mp4', durationSec: 1, tracks: [video('h264', { fps: 29.97 })] },
      { container: 'mp4', durationSec: 1, tracks: [video('h264', { fps: undefined, fpsNumerator: 30_000, fpsDenominator: 1001 })] },
    );
    const vfr = await compare(
      { container: 'mp4', durationSec: 1, tracks: [video('h264', { cadenceMode: 'VFR', frameTimestampsUs: [0, 40_000, 100_000] })] },
      { container: 'mp4', durationSec: 1, tracks: [video('h264', { cadenceMode: 'VFR', frameTimestampsUs: [0, 50_000, 100_000] })] },
    );
    expect(verdict(ntsc)).toBe('PASS');
    expect(ntsc.reasonCode).toBe('ORACLE_REPRESENTATION_DIFF');
    expect(verdict(vfr)).not.toBe('FAIL');
  });

  test('edit-list/priming/timescale evidence widens only the documented duration envelope', async () => {
    const legal = await compare(
      {
        container: 'mp4', durationSec: 10.05,
        presentationDurationSec: 10,
        mediaDurationSec: 10.05,
        movieTimescale: 1000,
        tracks: [audio('aac', 48_000, 2, { primingSamples: 1024, remainderSamples: 512 })],
      } as any,
      {
        container: 'mp4', durationSec: 10,
        presentationDurationSec: 10,
        editListSpanSec: 10,
        movieTimescale: 90_000,
        tracks: [audio('aac')],
      } as any,
    );
    const beyond = await compare(
      { container: 'mp4', durationSec: 11, tracks: [audio('aac')] },
      { container: 'mp4', durationSec: 10, tracks: [audio('aac')] },
    );
    expect(verdict(legal)).not.toBe('FAIL');
    expect(verdict(beyond)).toBe('FAIL');
  });

  test('an evidenced raw coded-media duration remains an eligible DIFF, not a widened PASS', async () => {
    const raw = await compare(
      {
        container: 'mp4', durationSec: 10.021333, rawMediaSpanSec: 10.021333,
        tracks: [audio('aac', 48_000, 2, { rawMediaSpanSec: 10.021333 })],
      },
      {
        container: 'mp4', durationSec: 10, presentationDurationSec: 10, rawMediaSpanSec: 10.021333,
        tracks: [audio('aac', 48_000, 2, { presentationDurationSec: 10, rawMediaSpanSec: 10.021333 })],
      },
    );
    expect(verdict(raw)).toBe('PASS');
    expect(raw.reasonCode).toBe('ORACLE_REPRESENTATION_DIFF');
    expect(raw.detail).toContain('raw-media duration view');
  });

  test('missing tracks and wrong canonical codecs fail', async () => {
    const missing = await compare(
      { container: 'mp4', durationSec: 1, tracks: [video('h264')] },
      { container: 'mp4', durationSec: 1, tracks: [video('h264'), audio('aac')] },
    );
    const wrong = await compare(
      { container: 'mp4', durationSec: 1, tracks: [video('vp9')] },
      { container: 'mp4', durationSec: 1, tracks: [video('h264')] },
    );
    expect(verdict(missing)).toBe('FAIL');
    expect(verdict(wrong)).toBe('FAIL');
  });
});

describe('REQ-ORAC-02 semantic packets', () => {
  const meta: NormalizedMetadata = {
    container: 'mp4', durationSec: 1,
    tracks: [{ type: 'video', codec: 'h264', width: 16, height: 16 }],
  };
  const annex = (...nals: number[][]): number[] => nals.flatMap((nal) => [0, 0, 1, ...nal]);
  const avcc = (...nals: number[][]): number[] => nals.flatMap((nal) => [0, 0, 0, nal.length, ...nal]);
  const packet = (payload: number[], extra: Record<string, unknown> = {}) => ({
    trackIndex: 0, size: payload.length, ptsUs: 0, dtsUs: 0, keyframe: true, payload, ...extra,
  }) as any;

  async function compare(got: PacketInfo[], want: PacketInfo[], gotMeta = meta, wantMeta = meta): Promise<OracleOutcome> {
    return runOracle('golden-packets', context({
      scenario: scenario('demux', 'golden-packets'),
      demux: { metadata: gotMeta, packets: got },
      golden: golden(wantMeta, want),
    }), { seekToleranceUs: 1000 });
  }

  test('Annex B vs length-prefix and inline vs out-of-band SPS/PPS are DIFF', async () => {
    const want = [packet(annex([0x67, 1], [0x68, 2], [0x65, 0xaa]), { framing: 'annex-b' })];
    const got = [packet(avcc([0x65, 0xaa]), { framing: 'length-prefixed', decoderConfiguration: [1, 2, 3] })];
    const out = await compare(got, want);
    expect(verdict(out)).toBe('PASS');
    expect(out.reasonCode).toBe('ORACLE_REPRESENTATION_DIFF');
  });

  test('two legal NAL groupings are DIFF', async () => {
    const want = [packet(annex([0x65, 0xaa], [0x61, 0xbb]), { framing: 'annex-b' })];
    const got = [
      packet(avcc([0x65, 0xaa]), { framing: 'length-prefixed', decoderConfiguration: [1] }),
      packet(avcc([0x61, 0xbb]), { framing: 'length-prefixed', decoderConfiguration: [1] }),
    ];
    const out = await compare(got, want);
    expect(verdict(out)).toBe('PASS');
    expect(out.reasonCode).toBe('ORACLE_REPRESENTATION_DIFF');
  });

  test('two packet rows sharing one explicit decoded access-unit identity compare as one semantic unit', async () => {
    const want = [{
      trackIndex: 0, size: 10, ptsUs: 0, dtsUs: 0, keyframe: true,
      accessUnitId: 'decoded-frame-0',
    }] as PacketInfo[];
    const got = [
      {
        trackIndex: 0, size: 4, ptsUs: 0, dtsUs: 0, keyframe: true,
        accessUnitId: 'decoded-frame-0',
      },
      {
        trackIndex: 0, size: 6, ptsUs: 0, dtsUs: 0, keyframe: false,
        accessUnitId: 'decoded-frame-0',
      },
    ] as PacketInfo[];

    const out = await compare(got, want);
    expect(verdict(out)).toBe('PASS');
    expect(out.reasonCode).toBe('ORACLE_REPRESENTATION_DIFF');
    expect(out.detail).toContain('packet count: measured 2 vs golden 1');
    expect(out.detail).toContain('"rowGrouping":[{"ptsUs":0,"rows":2}]');
    expect(out.detail).toContain('"rowGrouping":[{"ptsUs":0,"rows":1}]');
  });

  test('removed/altered VCL and broken random-access dependencies fail', async () => {
    const want = [packet(annex([0x67, 1], [0x68, 2], [0x65, 0xaa], [0x61, 0xbb]), { framing: 'annex-b' })];
    const removed = [packet(avcc([0x65, 0xaa]), { framing: 'length-prefixed', decoderConfiguration: [1] })];
    const altered = [packet(avcc([0x65, 0xcc], [0x61, 0xbb]), { framing: 'length-prefixed', decoderConfiguration: [1] })];
    const noConfig = [packet(avcc([0x65, 0xaa], [0x61, 0xbb]), { framing: 'length-prefixed' })];
    expect(verdict(await compare(removed, want))).toBe('FAIL');
    expect(verdict(await compare(altered, want))).toBe('FAIL');
    expect(verdict(await compare(noConfig, want))).toBe('FAIL');
  });

  test('cadence drift and wrong logical-track assignment fail', async () => {
    const want = [
      packet(annex([0x65, 1]), { framing: 'annex-b' }),
      packet(annex([0x61, 2]), { framing: 'annex-b', ptsUs: 33_333, dtsUs: 33_333, keyframe: false }),
    ];
    const drift = [
      packet(avcc([0x65, 1]), { framing: 'length-prefixed', decoderConfiguration: [1] }),
      packet(avcc([0x61, 2]), { framing: 'length-prefixed', decoderConfiguration: [1], ptsUs: 50_000, dtsUs: 50_000, keyframe: false }),
    ];
    expect(verdict(await compare(drift, want))).toBe('FAIL');

    const twoTrackMeta: NormalizedMetadata = {
      container: 'mp4', durationSec: 1,
      tracks: [{ type: 'video', codec: 'h264' }, { type: 'audio', codec: 'aac' }],
    };
    const goldenPackets = [
      packet(annex([0x65, 1]), { framing: 'annex-b', trackIndex: 0 }),
      packet([0xff, 0xf1, 0, 0, 0, 0, 0, 9], { framing: 'adts', trackIndex: 1 }),
    ];
    const swapped = [
      packet([0xff, 0xf1, 0, 0, 0, 0, 0, 9], { framing: 'adts', trackIndex: 0 }),
      packet(avcc([0x65, 1]), { framing: 'length-prefixed', decoderConfiguration: [1], trackIndex: 1 }),
    ];
    expect(verdict(await compare(swapped, goldenPackets, twoTrackMeta, twoTrackMeta))).toBe('FAIL');
  });

  test('unimplemented semantic normalization is typed ERROR, not guessed FAIL', async () => {
    const other: NormalizedMetadata = { container: 'x', durationSec: 1, tracks: [{ type: 'video', codec: 'mystery' }] };
    const got = [{ trackIndex: 0, size: 2, ptsUs: 0, dtsUs: 0, keyframe: true }] as PacketInfo[];
    const want = [{ trackIndex: 0, size: 3, ptsUs: 0, dtsUs: 0, keyframe: true }] as PacketInfo[];
    const out = await compare(got, want, other, other);
    expect(out.state).toBe('ERROR');
    if (out.state === 'ERROR') expect(out.reasonCode).toBe('ORACLE_PACKET_CODEC_NORMALIZER_UNAVAILABLE');
  });
});

describe('REQ-ORAC-03 presentation timestamp pairing', () => {
  const frames = (pts: number[], durations?: number[]): FrameDigest[] => pts.map((ptsUs, index) => ({
    index, ptsUs, sha256: String(index), ...(durations ? { durationUs: durations[index] } : {}),
  } as any));

  test('fps conversion pairs equal presentation moments despite different frame counts', () => {
    const candidate = frames([0, 66_666, 133_332, 199_998], [66_666, 66_666, 66_666, 66_666]);
    const reference = frames([0, 33_333, 66_666, 99_999, 133_332, 166_665, 199_998, 233_331], new Array(8).fill(33_333));
    const match = matchFramesByPresentationTime(candidate, reference, { durationToleranceUs: 1, timingToleranceUs: 1000 });
    expect(match.complete).toBe(true);
    expect(match.matchedRatio).toBeGreaterThanOrEqual(0.75);
  });

  test('VFR frames are selected by PTS rather than array index', () => {
    const candidate = frames([40_000, 0, 100_000], [60_000, 40_000, 60_000]);
    const reference = frames([0, 40_000, 100_000], [40_000, 60_000, 60_000]);
    const match = matchFramesByPresentationTime(candidate, reference, { durationToleranceUs: 1 });
    expect(match.complete).toBe(true);
    expect(match.pairs.some((pair) => pair.candidateIndex !== pair.referenceIndex)).toBe(true);
    expect(match.pairs.every((pair) => Number.isInteger(pair.candidateIndex))).toBe(true);
  });

  test('missing expected presentation coverage fails', () => {
    const match = matchFramesByPresentationTime(
      frames([0, 40_000], [40_000, 40_000]),
      frames([0, 40_000, 80_000, 120_000], [40_000, 40_000, 40_000, 40_000]),
      { durationToleranceUs: 1000 },
    );
    expect(match.complete).toBe(false);
    expect(match.windowDeltaUs).toBeGreaterThan(1000);
  });
});

describe('REQ-ORAC-04 typed reference decode applicability', () => {
  test('valid browser-unsupported output is NA_BROWSER; truncated supported output is FAIL', async () => {
    const valid = box('moov');
    const unsupported = await runOracle('ssim-psnr', context({
      scenario: scenario('transcode', 'ssim-psnr', { video: { codec: 'hevc' } }),
      output: { bytes: valid, mime: 'video/mp4', container: 'mp4' },
      decodeWithPlatform: async () => { throw { reasonCode: 'WEB_CODECS_CONFIG_UNSUPPORTED', supported: false }; },
    }));
    const truncatedBytes = Uint8Array.from([0, 0, 0, 20, 0x6d, 0x6f, 0x6f, 0x76]);
    const truncated = await runOracle('ssim-psnr', context({
      scenario: scenario('transcode', 'ssim-psnr'),
      output: { bytes: truncatedBytes, mime: 'video/mp4', container: 'mp4' },
      decodeWithPlatform: async () => {
        throw { reasonCode: 'REFERENCE_DECODE_INVALID_BITSTREAM', configSupport: 'SUPPORTED', invalidBitstream: true };
      },
    }));
    expect(unsupported.state).toBe('UNAVAILABLE');
    if (unsupported.state === 'UNAVAILABLE') {
      expect(unsupported.status).toBe('NA_BROWSER');
      expect(unsupported.reasonCode).toBe('WEB_CODECS_CONFIG_UNSUPPORTED');
    }
    expect(verdict(truncated)).toBe('FAIL');
  });
});

describe('REQ-FEAT-53/59 live decrypt oracle integration', () => {
  const digest = (index: number, ptsUs: number, byte: string): FrameDigest => ({
    index,
    ptsUs,
    sha256: byte.repeat(64),
  });
  const decryptScenario = (invariant?: string): Scenario => ({
    ...scenario('decrypt', invariant ? 'property-invariant' : 'decrypt-bitexact', {
      cleartextAsset: 'clear.mp4',
      ...(invariant ? { invariant } : {}),
    }),
    family: 'encryption',
  });

  test('digest-verified clear source is decoded first; browser inability is NA_BROWSER', async () => {
    const calls: number[] = [];
    const out = await runOracle('decrypt-bitexact', context({
      scenario: decryptScenario(),
      output: { bytes: Uint8Array.of(2), mime: 'video/mp4', container: 'mp4' },
      verifiedResources: { 'clear.mp4': Uint8Array.of(1) },
      decodeWithPlatform: async (media) => {
        calls.push(media.bytes[0]!);
        throw { reasonCode: 'WEB_CODECS_CONFIG_UNSUPPORTED', supported: false };
      },
    }));
    expect(calls).toEqual([1]);
    expect(out).toMatchObject({
      state: 'UNAVAILABLE',
      status: 'NA_BROWSER',
      reasonCode: 'WEB_CODECS_CONFIG_UNSUPPORTED',
    });
  });

  test('complete presentation rejects trailing frames and accepts declared timestamp rounding', async () => {
    const reference = [digest(0, 0, 'a'), digest(1, 40_000, 'b')];
    const extra = [...reference, digest(2, 80_000, 'c')];
    const run = (candidate: FrameDigest[]) => runOracle('decrypt-bitexact', context({
      scenario: decryptScenario(),
      output: { bytes: Uint8Array.of(2), mime: 'video/mp4', container: 'mp4' },
      verifiedResources: { 'clear.mp4': Uint8Array.of(1) },
      decodeWithPlatform: async (media) => ({
        frames: media.bytes[0] === 1 ? reference : candidate,
      }),
    }));

    const trailing = await run(extra);
    const rounded = await run([
      digest(0, 500, 'a'),
      digest(1, 40_750, 'b'),
    ]);
    expect(trailing).toMatchObject({
      state: 'VERDICT',
      verdict: 'FAIL',
      reasonCode: 'DECRYPT_FRAME_CARDINALITY_MISMATCH',
    });
    expect(rounded).toMatchObject({
      state: 'VERDICT',
      verdict: 'PASS',
      reasonCode: 'DECRYPT_COMPLETE_PRESENTATION_VALID',
    });
  });

  test('clear-input decrypt is a literal byte-no-op, not a playable rewrap', async () => {
    const source = Uint8Array.of(1, 2, 3, 4);
    const clearInput: MediaInput = {
      ...input,
      async arrayBuffer() { return source.slice().buffer; },
    };
    const run = (output: Uint8Array) => runOracle('property-invariant', context({
      scenario: decryptScenario('decrypt-byte-identity-noop'),
      input: clearInput,
      output: { bytes: output, mime: 'video/mp4', container: 'mp4' },
    }));
    expect(await run(source.slice())).toMatchObject({
      state: 'VERDICT', verdict: 'PASS', reasonCode: 'DECRYPT_BYTE_IDENTITY_PASS',
    });
    expect(await run(Uint8Array.of(1, 2, 3, 5))).toMatchObject({
      state: 'VERDICT', verdict: 'FAIL', reasonCode: 'DECRYPT_BYTE_IDENTITY_FAIL',
    });
  });
});

describe('REQ-ORAC-05 neutral packet readers', () => {
  test('fragmented ISO BMFF truns produce a complete packet table', () => {
    const tkhd = fullBox('tkhd', 0, u32(0), u32(0), u32(1), u32(0));
    const mdhd = fullBox('mdhd', 0, u32(0), u32(0), u32(1000), u32(2000));
    const trak = box('trak', tkhd, box('mdia', mdhd));
    const trex = fullBox('trex', 0, u32(1), u32(1), u32(1000), u32(2), u32(0));
    const moov = box('moov', trak, box('mvex', trex));
    const tfhd = fullBox('tfhd', 0, u32(1));
    const tfdt = fullBox('tfdt', 0, u32(0));
    const trun = fullBox(
      'trun', 0x000f00,
      u32(2),
      u32(1000), u32(2), u32(0), u32(0),
      u32(1000), u32(2), u32(0x0001_0000), u32(0),
    );
    const bytes = concat(box('ftyp', ascii('isom')), moov, box('moof', box('traf', tfhd, tfdt, trun)), box('mdat', Uint8Array.of(1, 2, 3, 4)));
    const read = readOutputPacketsResult(bytes, 'mp4');
    expect(read.state).toBe('OK');
    if (read.state === 'OK') {
      expect(read.value).toHaveLength(2);
      expect(read.value.map((row) => row.ptsUs)).toEqual([0, 1_000_000]);
      expect(read.value.map((row) => row.keyframe)).toEqual([true, false]);
    }
  });

  test('fixed WebM lacing emits every frame and separate decode/presentation order is retained', () => {
    const tracks = ebml([0x16, 0x54, 0xae, 0x6b], ebml([0xae], concat(
      ebml([0xd7], Uint8Array.of(1)),
      ebml([0x83], Uint8Array.of(2)),
      ebml([0x23, 0xe3, 0x83], uintBytes(20_000_000)),
      ebml([0x86], ascii('A_OPUS')),
    )));
    const info = ebml([0x15, 0x49, 0xa9, 0x66], ebml([0x2a, 0xd7, 0xb1], uintBytes(1_000_000)));
    const laced = ebml([0xa3], Uint8Array.from([0x81, 0, 0, 0x84, 1, 1, 2, 3, 4]));
    const cluster = ebml([0x1f, 0x43, 0xb6, 0x75], concat(ebml([0xe7], Uint8Array.of(0)), laced));
    const bytes = concat(ebml([0x1a, 0x45, 0xdf, 0xa3], new Uint8Array()), ebml([0x18, 0x53, 0x80, 0x67], concat(info, tracks, cluster)));
    const read = readOutputPacketsResult(bytes, 'webm');
    expect(read.state).toBe('OK');
    if (read.state === 'OK') {
      expect(read.value.map((row) => row.size)).toEqual([2, 2]);
      expect(read.value.map((row) => row.ptsUs)).toEqual([0, 20_000]);
    }

    const reorderedCluster = ebml([0x1f, 0x43, 0xb6, 0x75], concat(
      ebml([0xe7], Uint8Array.of(0)),
      ebml([0xa3], Uint8Array.from([0x81, 0, 40, 0x80, 1])),
      ebml([0xa3], Uint8Array.from([0x81, 0, 0, 0x80, 2])),
    ));
    const reorderedBytes = concat(
      ebml([0x1a, 0x45, 0xdf, 0xa3], new Uint8Array()),
      ebml([0x18, 0x53, 0x80, 0x67], concat(info, tracks, reorderedCluster)),
    );
    const reordered = readOutputPacketsResult(reorderedBytes, 'webm');
    expect(reordered.state).toBe('OK');
    if (reordered.state === 'OK') {
      expect(reordered.value.map((row) => row.ptsUs)).toEqual([40_000, 0]);
      expect(reordered.value.map((row) => row.dtsUs)).toEqual([0, 20_000]);
    }
  });

  test.each([
    ['Xiph', 0x82, [1, 2, 1, 2, 3, 4]],
    ['EBML', 0x86, [1, 0x82, 1, 2, 3, 4]],
  ])('%s WebM lacing emits a complete table', (_name, flags, laceBody) => {
    const tracks = ebml([0x16, 0x54, 0xae, 0x6b], ebml([0xae], concat(
      ebml([0xd7], Uint8Array.of(1)),
      ebml([0x83], Uint8Array.of(2)),
      ebml([0x23, 0xe3, 0x83], uintBytes(20_000_000)),
      ebml([0x86], ascii('A_OPUS')),
    )));
    const cluster = ebml([0x1f, 0x43, 0xb6, 0x75], concat(
      ebml([0xe7], Uint8Array.of(0)),
      ebml([0xa3], Uint8Array.from([0x81, 0, 0, flags, ...laceBody])),
    ));
    const bytes = concat(
      ebml([0x1a, 0x45, 0xdf, 0xa3], new Uint8Array()),
      ebml([0x18, 0x53, 0x80, 0x67], concat(tracks, cluster)),
    );
    const read = readOutputPacketsResult(bytes, 'webm');
    expect(read.state).toBe('OK');
    if (read.state === 'OK') expect(read.value.map((row) => row.size)).toEqual([2, 2]);
  });

  test('an unsupported lacing shape returns one typed result, never a partial table', () => {
    const tracks = ebml([0x16, 0x54, 0xae, 0x6b], ebml([0xae], concat(
      ebml([0xd7], Uint8Array.of(1)), ebml([0x83], Uint8Array.of(2)), ebml([0x86], ascii('A_OPUS')),
    )));
    const cluster = ebml([0x1f, 0x43, 0xb6, 0x75], concat(
      ebml([0xe7], Uint8Array.of(0)),
      ebml([0xa3], Uint8Array.from([0x81, 0, 0, 0x84, 1, 1, 2, 3, 4])),
    ));
    const bytes = concat(
      ebml([0x1a, 0x45, 0xdf, 0xa3], new Uint8Array()),
      ebml([0x18, 0x53, 0x80, 0x67], concat(tracks, cluster)),
    );
    const read = readOutputPacketsResult(bytes, 'webm');
    expect(read.state).toBe('UNSUPPORTED_STRUCTURE');
    if (read.state !== 'OK') expect(read.reasonCode).toBe('READER_WEBM_LACING_TIMING_UNAVAILABLE');
  });

  test('malformed lacing is MALFORMED, never a partial or unsupported table', () => {
    const tracks = ebml([0x16, 0x54, 0xae, 0x6b], ebml([0xae], concat(
      ebml([0xd7], Uint8Array.of(1)),
      ebml([0x83], Uint8Array.of(2)),
      ebml([0x23, 0xe3, 0x83], uintBytes(20_000_000)),
      ebml([0x86], ascii('A_OPUS')),
    )));
    const cluster = ebml([0x1f, 0x43, 0xb6, 0x75], concat(
      ebml([0xe7], Uint8Array.of(0)),
      ebml([0xa3], Uint8Array.from([0x81, 0, 0, 0x84, 1, 1, 2, 3])),
    ));
    const bytes = concat(
      ebml([0x1a, 0x45, 0xdf, 0xa3], new Uint8Array()),
      ebml([0x18, 0x53, 0x80, 0x67], concat(tracks, cluster)),
    );
    const read = readOutputPacketsResult(bytes, 'webm');
    expect(read.state).toBe('MALFORMED');
    if (read.state !== 'OK') expect(read.reasonCode).toBe('READER_WEBM_LACING_SIZES_MALFORMED');
  });
});

describe('REQ-ORAC-06 typed oracle availability schema', () => {
  test('detail text cannot route status and malformed branches are rejected', () => {
    const a = { state: 'UNAVAILABLE', oracle: 'ssim-psnr', status: 'NA_BROWSER', reasonCode: 'REFERENCE_CODEC_UNSUPPORTED', detail: 'golden absent' };
    const b = { ...a, detail: 'completely rewritten prose' };
    expect(validateOracleOutcome(a).ok).toBe(true);
    expect(validateOracleOutcome(b).ok).toBe(true);
    expect((a as any).status).toBe((b as any).status);
    expect(validateOracleOutcome({ ...a, state: undefined }).ok).toBe(false);
    expect(validateOracleOutcome({ ...a, status: 'NA_ENGINE' }).ok).toBe(false);
    expect(validateOracleOutcome({ ...a, reasonCode: '' }).ok).toBe(false);
  });
});

function u32(value: number): Uint8Array {
  return Uint8Array.of(value >>> 24, value >>> 16 & 255, value >>> 8 & 255, value & 255);
}

function ascii(value: string): Uint8Array {
  return Uint8Array.from(value, (char) => char.charCodeAt(0));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

function box(type: string, ...parts: Uint8Array[]): Uint8Array {
  const body = concat(...parts);
  return concat(u32(body.length + 8), ascii(type), body);
}

function fullBox(type: string, flags: number, ...parts: Uint8Array[]): Uint8Array {
  return box(type, Uint8Array.of(0, flags >>> 16 & 255, flags >>> 8 & 255, flags & 255), ...parts);
}

function ebml(id: number[], body: Uint8Array): Uint8Array {
  if (body.length >= 127) throw new Error('test EBML helper only supports one-byte sizes');
  return concat(Uint8Array.from(id), Uint8Array.of(0x80 | body.length), body);
}

function uintBytes(value: number): Uint8Array {
  const bytes: number[] = [];
  let current = value;
  do { bytes.unshift(current & 255); current = Math.floor(current / 256); } while (current > 0);
  return Uint8Array.from(bytes);
}
