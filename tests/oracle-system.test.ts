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
  remuxProgramsShareDecodePrefix,
  runOracle,
  validateOracleOutcome,
  type GoldenStore,
  type OracleContext,
} from '../src/core/oracles.ts';
import { readOutputPacketsResult, readOutputStructure } from '../src/core/box-readers.ts';
import { demuxMp4Video } from '../src/engines/platform/demux-mp4.ts';
import { sha256Hex as sha256HexSync } from '../src/core/canonical-json.ts';
import { sha256Hex as rawSha256Hex } from '../src/core/media-selection.ts';
import { defineProbeMetadataFieldPolicy } from '../src/features/probe/index.ts';
import { defineDemuxScaleContract } from '../src/features/demux/index.ts';
import type { RemuxProgramEvidence } from '../src/features/remux/types.ts';
import {
  assessDisplaySpaceEvidence,
  defineDisplayTransform,
  displayEvidenceFromFrameDigests,
} from '../src/features/decode-seek/index.ts';

test('neutral MP4 structure duration does not truncate a complete media timeline behind a short mvhd', async () => {
  const bytes = new Uint8Array(await Bun.file('fixtures/media/cenc_ctr_clear.mp4').arrayBuffer());
  const structure = readOutputStructure(bytes, 'mp4');
  expect(structure?.durationSec).toBeGreaterThan(5);
  expect(structure?.tracks.map((track) => track.type)).toEqual(['video', 'audio']);
});

test('platform reference demux includes a hybrid MP4 progressive prefix and every later fragment', async () => {
  const bytes = new Uint8Array(await Bun.file('fixtures/media/cenc_ctr_clear.mp4').arrayBuffer());
  const video = demuxMp4Video(bytes);
  expect(video.samples).toHaveLength(150);
  expect(video.samples[0]?.ptsUs).toBe(0);
  expect(video.samples.at(-1)?.ptsUs).toBeGreaterThan(4_980_000);
});

test.each([
  ['cenc_ctr.mp4', ['cenc', 'cenc']],
  ['cenc_cbcs.mp4', ['cbcs']],
] as const)('neutral MP4 structure exposes the declared protection scheme for %s', async (name, expected) => {
  const bytes = new Uint8Array(await Bun.file(`fixtures/media/${name}`).arrayBuffer());
  const structure = readOutputStructure(bytes, 'mp4');
  expect(structure?.tracks.map((track) => track.protectionScheme).filter(Boolean)).toEqual([...expected]);
});

test('neutral structure exposes ISO and Matroska default/language facts', async () => {
  const protectedBytes = new Uint8Array(await Bun.file('fixtures/media/cenc_ctr.mp4').arrayBuffer());
  const protectedStructure = readOutputStructure(protectedBytes);
  expect(protectedStructure?.tracks.map((track) => track.defaultDisposition)).toEqual([true, true]);

  const mkvBytes = new Uint8Array(
    await Bun.file('fixtures/media/scenarios/probe/h264_in_mkv/01.mkv').arrayBuffer(),
  );
  const mkvStructure = readOutputStructure(mkvBytes);
  expect(mkvStructure?.tracks.map((track) => [track.language, track.defaultDisposition])).toEqual([
    ['und', true],
    ['eng', true],
  ]);

  const longFormBytes = new Uint8Array(
    await Bun.file('fixtures/media/scenarios/probe/longform_1h_audio/02.mp4').arrayBuffer(),
  );
  const longFormStructure = readOutputStructure(longFormBytes);
  expect(longFormStructure?.tracks.map((track) => [track.type, track.language])).toEqual([
    ['audio', 'eng'],
  ]);

  const rotatedBytes = new Uint8Array(
    await Bun.file('fixtures/media/h264_rotated90.mp4').arrayBuffer(),
  );
  expect(readOutputStructure(rotatedBytes)?.tracks[0]?.rotation).toBe(90);
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

describe('REQ-ORAC-09 executable remux invariants', () => {
  test('decode-prefix equivalence accepts wrapper epoch rebasing but rejects semantic drift', () => {
    const payloads = [
      new Uint8Array([0, 0, 0, 1, 0x65]),
      new Uint8Array([0, 0, 0, 1, 0x41, 1]),
      new Uint8Array([0, 0, 0, 1, 0x41, 2]),
      new Uint8Array([0, 0, 0, 1, 0x41, 3]),
    ];
    const program = (
      container: string,
      ptsUs: readonly number[],
      changedPayloadIndex?: number,
    ): RemuxProgramEvidence => ({
      schema: 'media-test/remux-program@1',
      container,
      byteLength: 1_024,
      tracks: [{
        id: 'video-1',
        type: 'video',
        codec: 'h264',
        codecPrivate: new Uint8Array([1, 100, 0, 31]),
        samples: ptsUs.map((pts, index) => {
          const payload = payloads[index];
          if (payload === undefined) throw new Error(`missing payload ${index}`);
          return {
            payload: changedPayloadIndex === index
              ? new Uint8Array([0, 0, 0, 1, 0x41, 0xff])
              : payload.slice(),
            ptsUs: pts,
            dtsUs: index * 16_683,
            durationUs: 16_683,
            keyframe: index === 0,
            framing: 'length-prefixed',
          };
        }),
      }],
      representation: {},
    });
    const source = program('mp4', [33_367, 66_733, 50_050, 116_783]);
    const rebasedMatroska = program('mkv', [0, 33_000, 17_000, 83_000]);

    expect(remuxProgramsShareDecodePrefix(source, rebasedMatroska, 4)).toBe(true);
    expect(remuxProgramsShareDecodePrefix(
      source,
      program('mkv', [0, 33_000, 19_000, 83_000]),
      4,
    )).toBe(false);
    expect(remuxProgramsShareDecodePrefix(
      source,
      program('mkv', [0, 33_000, 17_000, 83_000], 2),
      4,
    )).toBe(false);
  });

  test('two-leg reference re-import expects the return container', async () => {
    const bytes = new Uint8Array(await Bun.file('fixtures/media/micro_h264_1frame.mp4').arrayBuffer());
    const remuxInput: MediaInput = {
      id: 'micro_h264_1frame.mp4',
      url: '/micro_h264_1frame.mp4',
      mime: 'video/mp4',
      sizeBytes: bytes.byteLength,
      async blob() { return new Blob([bytes.slice()], { type: 'video/mp4' }); },
      async arrayBuffer() { return bytes.slice().buffer as ArrayBuffer; },
    };
    const outcome = await runOracle('reference-reimport', context({
      scenario: scenario('remux', 'reference-reimport', {
        container: 'mkv',
        roundTrip: ['mkv', 'mp4'],
      }),
      input: remuxInput,
      output: { bytes, mime: 'video/mp4', container: 'mp4' },
    }));
    expect(verdict(outcome)).toBe('PASS');
  });

  test('authenticated reference re-import compares ISO samples through fixed ranges only', async () => {
    const bytes = new Uint8Array(
      await Bun.file('fixtures/media/micro_h264_1frame.mp4').arrayBuffer(),
    );
    const chunkSizeBytes = 1024;
    const wholeFileCalls = { count: 0 };
    const physicalRanges: Array<{ start: number; end: number }> = [];
    const remuxInput: MediaInput = {
      id: 'micro_h264_1frame.mp4',
      url: 'https://fixtures.test/micro_h264_1frame.mp4',
      mime: 'video/mp4',
      sizeBytes: bytes.byteLength,
      contentAttestation: {
        schema: 'media-test/url-content-attestation@1',
        logicalPath: 'micro_h264_1frame.mp4',
        sha256: rawSha256Hex(bytes),
        sizeBytes: bytes.byteLength,
        chunkSizeBytes,
        chunkSha256: Array.from(
          { length: Math.ceil(bytes.byteLength / chunkSizeBytes) },
          (_, index) => rawSha256Hex(
            bytes.subarray(index * chunkSizeBytes, (index + 1) * chunkSizeBytes),
          ),
        ),
      },
      async blob() {
        wholeFileCalls.count += 1;
        throw new Error('whole-file blob access forbidden');
      },
      async arrayBuffer() {
        wholeFileCalls.count += 1;
        throw new Error('whole-file byte access forbidden');
      },
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_resource: RequestInfo | URL, init?: RequestInit) => {
      const match = /^bytes=(\d+)-(\d+)$/.exec(
        new Headers(init?.headers).get('Range') ?? '',
      );
      if (!match) return new Response(null, { status: 400 });
      const start = Number(match[1]);
      const end = Number(match[2]);
      physicalRanges.push({ start, end });
      return new Response(bytes.slice(start, end + 1), {
        status: 206,
        headers: { 'Content-Range': `bytes ${start}-${end}/${bytes.byteLength}` },
      });
    }) as typeof fetch;
    try {
      const outcome = await runOracle('reference-reimport', context({
        scenario: scenario('remux', 'reference-reimport', { container: 'mp4' }),
        input: remuxInput,
        output: { bytes: bytes.slice(), mime: 'video/mp4', container: 'mp4' },
      }));
      expect(verdict(outcome)).toBe('PASS');
      expect(wholeFileCalls.count).toBe(0);
      expect(physicalRanges.length).toBeGreaterThan(0);
      expect(
        physicalRanges.every(({ start, end }) => end - start + 1 <= chunkSizeBytes),
      ).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('decode-remux falls back to same-browser source decode when frame cache is pending', async () => {
    const source = new Uint8Array(
      await Bun.file('fixtures/media/micro_h264_1frame.mp4').arrayBuffer(),
    );
    const remuxInput: MediaInput = {
      id: 'source.mp4', url: '/source.mp4', mime: 'video/mp4', sizeBytes: source.byteLength,
      async blob() { return new Blob([source]); },
      async arrayBuffer() { return source.slice().buffer as ArrayBuffer; },
    };
    const decodeCalls: Array<{
      container?: string;
      opts?: {
        maxFrames?: number;
        sampling?: 'prefix' | 'uniform';
        durationHintSec?: number;
        sampleTimesSec?: readonly number[];
      };
    }> = [];
    const outcome = await runOracle('property-invariant', context({
      scenario: scenario('remux', 'property-invariant', {
        container: 'mkv',
        invariant: 'decode(remux(x))==decode(x)',
      }),
      input: remuxInput,
      output: { bytes: new Uint8Array([4, 5, 6]), mime: 'video/x-matroska', container: 'mkv' },
      golden: golden({ container: 'mp4', durationSec: 1, tracks: [] }),
      decodeWithPlatform: async (media, opts) => {
        decodeCalls.push({ container: media.container, opts });
        return { frames: [{ index: 0, ptsUs: 0, sha256: 'ab'.repeat(32) }] };
      },
    }));
    expect(verdict(outcome)).toBe('PASS');
    expect(decodeCalls).toEqual([
      {
        container: 'mp4',
        opts: {
          maxFrames: 1,
          sampling: 'uniform',
          durationHintSec: 1,
          sampleTimesSec: [0.5],
        },
      },
      {
        container: 'mkv',
        opts: {
          maxFrames: 1,
          sampling: 'uniform',
          durationHintSec: 1,
          sampleTimesSec: [0.5],
        },
      },
    ]);
  });

  test('decode-remux uses sequential WebCodecs when both wrappers expose the same decode prefix', async () => {
    const source = new Uint8Array(
      await Bun.file('fixtures/media/micro_h264_1frame.mp4').arrayBuffer(),
    );
    const remuxInput: MediaInput = {
      id: 'source.mp4', url: '/source.mp4', mime: 'video/mp4', sizeBytes: source.byteLength,
      async blob() { return new Blob([source]); },
      async arrayBuffer() { return source.slice().buffer as ArrayBuffer; },
    };
    const decodeCalls: Array<{ container: string; sampling?: 'prefix' | 'uniform' }> = [];
    const outcome = await runOracle('property-invariant', context({
      scenario: scenario('remux', 'property-invariant', {
        container: 'mp4',
        invariant: 'decode(remux(x))==decode(x)',
      }),
      input: remuxInput,
      output: { bytes: source.slice(), mime: 'video/mp4', container: 'mp4' },
      golden: golden({ container: 'mp4', durationSec: 1, tracks: [] }),
      decodeWithPlatform: async (media, options) => {
        decodeCalls.push({ container: media.container, sampling: options?.sampling });
        return { frames: [{ index: 0, ptsUs: 0, sha256: 'ab'.repeat(32) }] };
      },
    }));
    expect(verdict(outcome)).toBe('PASS');
    expect(decodeCalls).toEqual([
      { container: 'mp4', sampling: 'prefix' },
      { container: 'mp4', sampling: 'prefix' },
    ]);
  });

  test('metadata decode-remux uses a same-run source reference even when a frame cache exists', async () => {
    const source = new Uint8Array(
      await Bun.file('fixtures/media/micro_h264_1frame.mp4').arrayBuffer(),
    );
    const remuxInput: MediaInput = {
      id: 'source.mp4', url: '/source.mp4', mime: 'video/mp4', sizeBytes: source.byteLength,
      async blob() { return new Blob([source]); },
      async arrayBuffer() { return source.slice().buffer as ArrayBuffer; },
    };
    const store = golden({ container: 'mp4', durationSec: 1, tracks: [] });
    store.frames = [{ index: 0, ptsUs: 0, sha256: 'cd'.repeat(32) }];
    store.evidence.frames = {
      state: 'OK', value: store.frames, url: 'frames.json', raw: store.frames,
    };
    const remuxScenario = scenario('remux', 'property-invariant', {
      container: 'mkv',
      invariant: 'decode(remux(x))==decode(x)',
    });
    remuxScenario.family = 'metadata';
    const decodeCalls: Array<{ container: string; sampling?: 'prefix' | 'uniform' }> = [];
    const outcome = await runOracle('property-invariant', context({
      scenario: remuxScenario,
      input: remuxInput,
      output: { bytes: new Uint8Array([4, 5, 6]), mime: 'video/x-matroska', container: 'mkv' },
      golden: store,
      decodeWithPlatform: async (media, options) => {
        decodeCalls.push({ container: media.container, sampling: options?.sampling });
        return { frames: [{ index: 0, ptsUs: 0, sha256: 'ab'.repeat(32) }] };
      },
    }));
    expect(verdict(outcome)).toBe('PASS');
    expect(decodeCalls).toEqual([
      { container: 'mp4', sampling: 'prefix' },
      { container: 'mkv', sampling: 'prefix' },
    ]);
  });

  test('ordinary decode-remux bypasses a cached cross-process frame reference', async () => {
    const source = new Uint8Array(
      await Bun.file('fixtures/media/micro_h264_1frame.mp4').arrayBuffer(),
    );
    const remuxInput: MediaInput = {
      id: 'source.mp4', url: '/source.mp4', mime: 'video/mp4', sizeBytes: source.byteLength,
      async blob() { return new Blob([source]); },
      async arrayBuffer() { return source.slice().buffer as ArrayBuffer; },
    };
    const store = golden({ container: 'mp4', durationSec: 1, tracks: [] });
    store.frames = [{ index: 0, ptsUs: 0, sha256: 'cd'.repeat(32) }];
    store.evidence.frames = {
      state: 'OK', value: store.frames, url: 'frames.json', raw: store.frames,
    };
    const remuxScenario = scenario('remux', 'property-invariant', {
      container: 'mp4',
      invariant: 'decode(remux(x))==decode(x)',
    });
    remuxScenario.family = 'decode-seek';
    const decodeCalls: Array<{ container: string; sampling?: 'prefix' | 'uniform' }> = [];
    const outcome = await runOracle('property-invariant', context({
      scenario: remuxScenario,
      input: remuxInput,
      output: { bytes: source.slice(), mime: 'video/mp4', container: 'mp4' },
      golden: store,
      decodeWithPlatform: async (media, options) => {
        decodeCalls.push({ container: media.container, sampling: options?.sampling });
        return { frames: [{ index: 0, ptsUs: 0, sha256: 'ab'.repeat(32) }] };
      },
    }));

    expect(verdict(outcome)).toBe('PASS');
    expect(decodeCalls).toEqual([
      { container: 'mp4', sampling: 'prefix' },
      { container: 'mp4', sampling: 'prefix' },
    ]);
  });

  test('headerless remux duration derives source truth from the neutral packet timeline', async () => {
    const bytes = new Uint8Array(await Bun.file('fixtures/media/recorder_headerless.webm').arrayBuffer());
    const remuxInput: MediaInput = {
      id: 'recorder_headerless.webm', url: '/recorder_headerless.webm', mime: 'video/webm',
      sizeBytes: bytes.byteLength,
      async blob() { return new Blob([bytes.slice()], { type: 'video/webm' }); },
      async arrayBuffer() { return bytes.slice().buffer as ArrayBuffer; },
    };
    const outcome = await runOracle('property-invariant', context({
      scenario: scenario('remux', 'property-invariant', {
        container: 'webm',
        invariant: 'probe-duration',
      }),
      input: remuxInput,
      output: { bytes, mime: 'video/webm', container: 'webm' },
      golden: golden({ container: 'webm', durationSec: null, tracks: [] }),
      decodeWithPlatform: async () => ({
        frames: [
          { index: 0, ptsUs: 0, sha256: '01'.repeat(32) },
          { index: 1, ptsUs: 2_980_000, sha256: '02'.repeat(32) },
        ],
      }),
    }));
    expect(verdict(outcome)).toBe('PASS');
    expect(outcome.measurements).toMatchObject({ goldenDurationSec: 2.98, outDurationSec: 2.98 });
  });
});

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

  test('an implementation label for a golden-unspecified auxiliary track is a representation difference', async () => {
    const unspecified = await compare(
      {
        container: 'mov',
        durationSec: 10,
        tracks: [video('h264'), { type: 'other', codec: 'tmcd' } as any],
      },
      {
        container: 'mov',
        durationSec: 10,
        tracks: [video('h264'), { type: 'other', codec: '' } as any],
      },
    );
    expect(verdict(unspecified)).toBe('PASS');
    expect(unspecified.reasonCode).toBe('ORACLE_REPRESENTATION_DIFF');
    expect(unspecified.detail).toContain("golden-unspecified auxiliary track 'tmcd'");

    const conflicting = await compare(
      {
        container: 'mov',
        durationSec: 10,
        tracks: [video('h264'), { type: 'other', codec: 'text' } as any],
      },
      {
        container: 'mov',
        durationSec: 10,
        tracks: [video('h264'), { type: 'other', codec: 'tmcd' } as any],
      },
    );
    expect(verdict(conflicting)).toBe('FAIL');
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

  test('exact golden packet cadence overrides materially contradictory nominal carrier rates', async () => {
    const want: NormalizedMetadata = {
      container: 'webm', durationSec: 10,
      tracks: [video('vp8', { fps: 1000 })],
    };
    const packets: PacketInfo[] = [0, 33_000, 66_000, 132_000].map((ptsUs, index) => ({
      trackIndex: 0,
      size: 1,
      ptsUs,
      keyframe: index === 0,
    }));
    const observed: NormalizedMetadata = {
      container: 'webm', durationSec: 10,
      tracks: [video('vp8', {
        fps: undefined,
        fpsProvenance: {
          source: 'observed', cadence: 'VFR', sampleCount: 4, observedIntervalUs: 132_000,
          envelope: { minFps: 1_000_000 / 66_000, maxFps: 1_000_000 / 33_000 },
        },
      })],
    };
    const exact = await runOracle('golden-metadata', context({
      metadata: observed,
      golden: golden(want, packets),
    }));
    expect(verdict(exact)).toBe('PASS');
    expect(exact.reasonCode).toBe('ORACLE_REPRESENTATION_DIFF');
    expect(exact.detail).toContain('contradicted by exact packet timeline');

    const moderatePackets: PacketInfo[] = [0, 33_333, 66_667, 100_000].map((ptsUs, index) => ({
      trackIndex: 0, size: 1, ptsUs, keyframe: index === 0,
    }));
    const moderate = await runOracle('golden-metadata', context({
      metadata: {
        container: 'mov', durationSec: 1,
        tracks: [video('h264', {
          fps: undefined,
          fpsProvenance: {
            source: 'observed', cadence: 'CFR', sampleCount: 3, observedIntervalUs: 100_000,
            envelope: { minFps: 29.999, maxFps: 30.001 },
          },
        })],
      },
      golden: golden({ container: 'mov', durationSec: 1, tracks: [video('h264', { fps: 20.5 })] }, moderatePackets),
    }));
    expect(verdict(moderate)).toBe('PASS');
    expect(moderate.detail).toContain('contradicted by exact packet timeline');

    const wrong = await runOracle('golden-metadata', context({
      metadata: {
        ...observed,
        tracks: [video('vp8', {
          fps: undefined,
          fpsProvenance: { source: 'observed', cadence: 'CFR', sampleCount: 60, observedIntervalUs: 1_000_000 },
        })],
      },
      golden: golden(want, packets),
    }));
    expect(verdict(wrong)).toBe('FAIL');
  });

  test('single attached-picture packet normalizes a carrier timebase to its effective program cadence', async () => {
    const durationSec = 5.549;
    const want: NormalizedMetadata = {
      container: 'mkv',
      durationSec,
      tracks: [video('mjpeg', { fps: 90_000 })],
    };
    const packets: PacketInfo[] = [{
      trackIndex: 0,
      size: 30_915,
      ptsUs: 0,
      keyframe: true,
    }];
    const observed: NormalizedMetadata = {
      container: 'mkv',
      durationSec,
      tracks: [video('mjpeg', {
        fps: undefined,
        fpsProvenance: {
          source: 'observed',
          cadence: 'CFR',
          sampleCount: 1,
          observedIntervalUs: durationSec * 1_000_000,
          envelope: { minFps: 1 / durationSec, maxFps: 1 / durationSec },
        },
      })],
    };

    const outcome = await runOracle('golden-metadata', context({
      metadata: observed,
      golden: golden(want, packets),
    }));
    expect(verdict(outcome)).toBe('PASS');
    expect(outcome.reasonCode).toBe('ORACLE_REPRESENTATION_DIFF');
    expect(outcome.detail).toContain('singleton packet cadence is authoritative');
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

  test('typed demux scale mode gates exact rows while treating payload retention as representation-only', async () => {
    const measured: PacketInfo[] = [
      { trackIndex: 0, size: 4, ptsUs: 0, dtsUs: 0, durationUs: 33_333, keyframe: true },
      { trackIndex: 0, size: 3, ptsUs: 33_333, dtsUs: 33_333, durationUs: 33_333, keyframe: false },
    ];
    const committed: PacketInfo[] = measured.map((row, index) => ({
      ...row,
      payloadDigest: String(index + 1).repeat(64),
    }));
    const scaleScenario = scenario('demux', 'golden-packets', {
      invariant: 'demux-scale-budgets',
      robustness: defineDemuxScaleContract('massive'),
    });
    const runScale = (packets: PacketInfo[]) => runOracle('golden-packets', context({
      scenario: scaleScenario,
      demux: { metadata: meta, packets },
      golden: golden(meta, committed),
    }), { seekToleranceUs: 1000 });

    const exact = await runScale(measured);
    expect(verdict(exact)).toBe('PASS');
    expect(exact.reasonCode).toBe('ORACLE_REPRESENTATION_DIFF');
    expect(exact.detail).toContain('scale-mode metadata-only packets');

    const wrong = structuredClone(measured);
    wrong[1]!.size += 1;
    expect(verdict(await runScale(wrong))).toBe('FAIL');
  });

  test('Annex B vs length-prefix and inline vs out-of-band SPS/PPS are DIFF', async () => {
    const want = [packet(annex([0x67, 1], [0x68, 2], [0x65, 0xaa]), { framing: 'annex-b' })];
    const got = [packet(avcc([0x65, 0xaa]), { framing: 'length-prefixed', decoderConfiguration: [1, 2, 3] })];
    const out = await compare(got, want);
    expect(verdict(out)).toBe('PASS');
    expect(out.reasonCode).toBe('ORACLE_REPRESENTATION_DIFF');
  });

  test('canonical adapter framing tokens and independently baked packet digests remain comparable', async () => {
    const h264Payload = avcc([0x65, 0xaa]);
    const canonicalToken = await compare(
      [packet(h264Payload, { framing: 'avc', decoderConfig: [1, 2, 3] })],
      [packet(h264Payload, { framing: 'length-prefixed', decoderConfig: [1, 2, 3] })],
    );
    expect(verdict(canonicalToken)).toBe('PASS');

    const aacMeta: NormalizedMetadata = {
      container: 'mp4', durationSec: 1,
      tracks: [{ type: 'audio', codec: 'aac', sampleRate: 48_000, channels: 2 }],
    };
    const aacPayload = [1, 2, 3, 4];
    const digest = sha256HexSync(Uint8Array.from(aacPayload));
    const measured = [packet(aacPayload, {
      trackIndex: 0, framing: 'raw', payloadDigest: digest, decoderConfig: [0x11, 0x90],
    })];
    const baked = [{
      trackIndex: 0, size: aacPayload.length, ptsUs: 0, dtsUs: 0, keyframe: true,
      framing: 'raw', payloadDigest: digest, decoderConfig: [0x11, 0x90],
    }] as PacketInfo[];
    expect(verdict(await compare(measured, baked, aacMeta, aacMeta))).toBe('PASS');

    const corrupt = structuredClone(measured);
    corrupt[0]!.payload = Uint8Array.from([1, 2, 3, 5]);
    const conflict = await compare(corrupt, baked, aacMeta, aacMeta);
    expect(conflict.state).toBe('ERROR');
    if (conflict.state === 'ERROR') expect(conflict.reasonCode).toBe('ORACLE_PACKET_PAYLOAD_DIGEST_CONFLICT');
  });

  test('explicit AVC length framing cannot be mistaken for an Annex-B prefix', async () => {
    const payload = new Array<number>(403).fill(0x55);
    payload.splice(0, 5, 0x00, 0x00, 0x01, 0x8f, 0x41);
    const framed = packet(payload, { framing: 'avc', nalLengthSize: 4, decoderConfig: [1, 2, 3] });
    expect(verdict(await compare([framed], [{ ...framed, payload: [...payload] }]))).toBe('PASS');
  });

  test('extra measured payload evidence does not change an exact legacy ffprobe-row verdict', async () => {
    const payload = avcc([0x65, 0xaa]);
    const measured = packet(payload, {
      framing: 'avc',
      payloadDigest: sha256HexSync(Uint8Array.from(payload)),
    });
    const legacy = {
      trackIndex: 0,
      size: measured.size,
      ptsUs: measured.ptsUs,
      dtsUs: measured.dtsUs,
      keyframe: measured.keyframe,
    } as PacketInfo;
    expect(verdict(await compare([measured], [legacy]))).toBe('PASS');
    expect(verdict(await compare([{ ...measured, size: measured.size + 1 }], [legacy]))).toBe('FAIL');
  });

  test('DTS-unavailable rows use shared PTS identity order and audio key flags are representational', async () => {
    const audioMeta: NormalizedMetadata = {
      container: 'mkv', durationSec: 1,
      tracks: [{ type: 'audio', codec: 'aac', sampleRate: 48_000, channels: 2 }],
    };
    const payloadA = [1, 2];
    const payloadB = [3, 4, 5];
    const measured = [
      { ...packet(payloadB), trackIndex: 0, ptsUs: 20_000, dtsUs: undefined, keyframe: true },
      { ...packet(payloadA), trackIndex: 0, ptsUs: 0, dtsUs: undefined, keyframe: true },
    ] as PacketInfo[];
    const legacy = [
      { trackIndex: 0, size: payloadA.length, ptsUs: 0, dtsUs: 20_000, keyframe: false },
      { trackIndex: 0, size: payloadB.length, ptsUs: 20_000, dtsUs: 0, keyframe: false },
    ] as PacketInfo[];
    expect(verdict(await compare(measured, legacy, audioMeta, audioMeta))).toBe('PASS');
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
  test('decode SSIM compares only the requested and committed leading-frame window', async () => {
    const first: FrameDigest = { index: 0, ptsUs: 0, sha256: 'ab'.repeat(32) };
    const trailing: FrameDigest = { index: 1, ptsUs: 33_333, sha256: 'cd'.repeat(32) };
    const store = emptyGoldenStore();
    store.frames = [first, trailing];
    const outcome = await runOracle('ssim-psnr', context({
      scenario: scenario('decodeFrames', 'ssim-psnr', { maxFrames: 1 }),
      golden: store,
      frames: { frames: [{ ...first }] },
    }));
    expect(outcome).toMatchObject({ state: 'VERDICT', verdict: 'PASS' });

    const prefixOutcome = await runOracle('ssim-psnr', context({
      scenario: scenario('decodeFrames', 'ssim-psnr', { maxFrames: 4 }),
      golden: store,
      frames: {
        frames: [
          { ...first },
          { ...trailing },
          { index: 2, ptsUs: 66_666, sha256: 'ef'.repeat(32) },
          { index: 3, ptsUs: 99_999, sha256: '01'.repeat(32) },
        ],
      },
    }));
    expect(prefixOutcome).toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
  });

  test('display SSIM replaces duration-spread reference sampling with the exact source prefix', async () => {
    const contract = defineDisplayTransform({
      codedWidth: 1_280,
      codedHeight: 720,
      displayWidth: 720,
      displayHeight: 1_280,
      rotationDegrees: 90,
      flipX: false,
      flipY: false,
    });
    const timestampsUs = Array.from({ length: 12 }, (_, index) => Math.round(index * 1_000_000 / 30));
    const sourceFrames: FrameDigest[] = timestampsUs.map((ptsUs, index) => ({
      index,
      ptsUs,
      sha256: index.toString(16).padStart(2, '0').repeat(32),
      width: 720,
      height: 1_280,
    }));
    const durationSpreadFrames = sourceFrames.map((frame, index) => ({
      ...frame,
      ptsUs: Math.round(index * 10_000_000 / sourceFrames.length),
    }));
    expect(assessDisplaySpaceEvidence(
      displayEvidenceFromFrameDigests(sourceFrames),
      displayEvidenceFromFrameDigests(durationSpreadFrames),
      contract,
    )).toMatchObject({
      verdict: 'FAIL',
      reasonCode: 'DISPLAY_TIMESTAMP_COVERAGE_MISMATCH',
      measurements: {
        candidateFrames: 12,
        referenceFrames: 12,
        matchedFrames: 1,
        unmatchedCandidateFrames: 11,
        unmatchedReferenceFrames: 11,
      },
    });

    const store = golden({
      container: 'mp4',
      durationSec: 10,
      tracks: [{
        type: 'video',
        codec: 'h264',
        width: 1_280,
        height: 720,
        frameTimestampsUs: timestampsUs,
      }],
    });
    store.frames = sourceFrames;
    let requestedExactTimes: unknown;
    const outcome = await runOracle('ssim-psnr', context({
      scenario: scenario('decodeFrames', 'ssim-psnr', {
        maxFrames: 30,
        displayEvidence: contract,
      }),
      golden: store,
      frames: { frames: sourceFrames },
      decodeWithPlatform: async (_media, options) => {
        requestedExactTimes = options?.exactPresentationTimes;
        const requested = options?.exactPresentationTimes?.timestampsUs ?? durationSpreadFrames.map((frame) => frame.ptsUs);
        return {
          frames: requested.map((ptsUs, index) => ({ ...sourceFrames[index]!, ptsUs })),
        };
      },
    }));

    expect(requestedExactTimes).toEqual({ originUs: 0, timestampsUs });
    expect(outcome).toMatchObject({
      state: 'VERDICT',
      verdict: 'PASS',
      reasonCode: 'DISPLAY_SPACE_EVIDENCE_MATCH',
      measurements: { candidateFrames: 12, referenceFrames: 12, matchedFrames: 12 },
    });
  });

  test('display reference keeps a non-zero immutable-source PTS origin', async () => {
    const originUs = 2_000_000;
    const timestampsUs = Array.from({ length: 3 }, (_, index) => originUs + index * 40_000);
    const frames: FrameDigest[] = timestampsUs.map((ptsUs, index) => ({
      index,
      ptsUs,
      sha256: `${index + 1}`.repeat(64),
      width: 2,
      height: 3,
    }));
    const contract = defineDisplayTransform({
      codedWidth: 3,
      codedHeight: 2,
      displayWidth: 2,
      displayHeight: 3,
      rotationDegrees: 90,
      flipX: false,
      flipY: false,
    });
    const store = golden({
      container: 'mp4',
      durationSec: 1,
      tracks: [{ type: 'video', codec: 'h264', frameTimestampsUs: timestampsUs }],
    });
    store.frames = frames;
    let requestedOriginUs: number | undefined;
    const outcome = await runOracle('ssim-psnr', context({
      scenario: scenario('decodeFrames', 'ssim-psnr', { maxFrames: 3, displayEvidence: contract }),
      golden: store,
      frames: { frames },
      decodeWithPlatform: async (_media, options) => {
        requestedOriginUs = options?.exactPresentationTimes?.originUs;
        return { frames: frames.map((frame) => ({ ...frame })) };
      },
    }));

    expect(requestedOriginUs).toBe(originUs);
    expect(outcome).toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
  });

  test('valid browser-unsupported output is NA_BROWSER; truncated supported output is FAIL', async () => {
    const valid = box('moov');
    let unsupportedDecodeCall = 0;
    const unsupported = await runOracle('ssim-psnr', context({
      scenario: scenario('transcode', 'ssim-psnr', { video: { codec: 'hevc' } }),
      output: { bytes: valid, mime: 'video/mp4', container: 'mp4' },
      decodeWithPlatform: async () => {
        if (unsupportedDecodeCall++ === 0) {
          return {
            frames: [{ index: 0, ptsUs: 0, sha256: 'ab'.repeat(32) }],
            getPixels: async () => { throw new Error('not reached'); },
          };
        }
        throw { reasonCode: 'WEB_CODECS_CONFIG_UNSUPPORTED', supported: false };
      },
    }));
    const truncatedBytes = Uint8Array.from([0, 0, 0, 20, 0x6d, 0x6f, 0x6f, 0x76]);
    let truncatedDecodeCall = 0;
    const truncated = await runOracle('ssim-psnr', context({
      scenario: scenario('transcode', 'ssim-psnr'),
      output: { bytes: truncatedBytes, mime: 'video/mp4', container: 'mp4' },
      decodeWithPlatform: async () => {
        if (truncatedDecodeCall++ === 0) {
          return {
            frames: [{ index: 0, ptsUs: 0, sha256: 'ab'.repeat(32) }],
            getPixels: async () => { throw new Error('not reached'); },
          };
        }
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

  test('a mismatched clear-reference timeline is NA_ASSET when output matches primary frame evidence', async () => {
    const primary = [digest(0, 0, 'a'), digest(1, 33_333, 'b'), digest(2, 66_667, 'c')];
    const clear = [digest(0, 0, 'a'), digest(1, 54_688, 'b'), digest(2, 88_021, 'c')];
    const store = emptyGoldenStore();
    store.frames = primary;
    store.evidence.frames = { state: 'OK', value: primary, url: 'primary.frames.json', raw: primary };
    const out = await runOracle('decrypt-bitexact', context({
      scenario: decryptScenario(),
      input: { ...input, id: 'protected.mp4' },
      golden: store,
      output: { bytes: Uint8Array.of(2), mime: 'video/mp4', container: 'mp4' },
      verifiedResources: { 'clear.mp4': Uint8Array.of(1) },
      decodeWithPlatform: async (media) => ({
        frames: media.bytes[0] === 1 ? clear : primary,
      }),
    }));

    expect(out).toMatchObject({
      state: 'UNAVAILABLE',
      status: 'NA_ASSET',
      reasonCode: 'DECRYPT_CLEAR_REFERENCE_PRESENTATION_MISMATCH',
    });
  });

  test('verified protected-source timing localizes a clear-reference asset mismatch without a frame golden', async () => {
    const protectedBytes = new Uint8Array(await Bun.file('fixtures/media/cenc_cbcs.mp4').arrayBuffer());
    const primary = Array.from({ length: 150 }, (_, index) =>
      digest(index, Math.round(index * 1_000_000 / 30), index % 2 === 0 ? 'a' : 'b'));
    const clear = primary.map((frame, index) => ({
      ...frame,
      ptsUs: index === 0 ? 0 : frame.ptsUs + 21_355,
    }));
    const out = await runOracle('decrypt-bitexact', context({
      scenario: decryptScenario(),
      input: {
        ...input,
        id: 'cenc_cbcs.mp4',
        arrayBuffer: async () => protectedBytes.slice().buffer,
      },
      output: { bytes: Uint8Array.of(2), mime: 'video/mp4', container: 'mp4' },
      verifiedResources: { 'clear.mp4': Uint8Array.of(1) },
      decodeWithPlatform: async (media) => ({
        frames: media.bytes[0] === 1 ? clear : primary,
      }),
    }));

    expect(out).toMatchObject({
      state: 'UNAVAILABLE',
      status: 'NA_ASSET',
      reasonCode: 'DECRYPT_CLEAR_REFERENCE_PRESENTATION_MISMATCH',
    });
  });

  test('an explicit protected-source timeline policy composes exact source timing with clear frame identity', async () => {
    const protectedBytes = new Uint8Array(await Bun.file('fixtures/media/cenc_cbcs.mp4').arrayBuffer());
    const primary = Array.from({ length: 150 }, (_, index) =>
      digest(index, Math.round(index * 1_000_000 / 30), index % 2 === 0 ? 'a' : 'b'));
    const clear = primary.map((frame, index) => ({
      ...frame,
      ptsUs: index === 0 ? 0 : frame.ptsUs + 21_355,
    }));
    const policyScenario = decryptScenario();
    policyScenario.options = {
      ...policyScenario.options,
      clearReferenceTimeline: 'protected-source',
    };
    const out = await runOracle('decrypt-bitexact', context({
      scenario: policyScenario,
      input: {
        ...input,
        id: 'cenc_cbcs.mp4',
        arrayBuffer: async () => protectedBytes.slice().buffer,
      },
      output: { bytes: Uint8Array.of(2), mime: 'video/mp4', container: 'mp4' },
      verifiedResources: { 'clear.mp4': Uint8Array.of(1) },
      decodeWithPlatform: async (media) => ({
        frames: media.bytes[0] === 1 ? clear : primary,
      }),
    }));

    expect(out).toMatchObject({
      state: 'VERDICT',
      verdict: 'PASS',
      reasonCode: 'DECRYPT_PROTECTED_TIMELINE_CLEAR_IDENTITY_VALID',
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
