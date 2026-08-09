import { afterEach, describe, expect, test } from 'bun:test';

import type { DecodeOptions, FrameSink, MediaEngine } from '../src/core/engine.ts';
import {
  bakeAssetFrames,
  exactPresentationTimesForFrameBake,
  materializeFrameEvidence,
  type GoldenFrameEntry,
} from '../src/core/frame-bake.ts';
import { exactPresentationAnchorsForVideoElement } from '../src/engines/platform/decode.ts';
import { demuxMp4Video } from '../src/engines/platform/demux-mp4.ts';
import { ALPHA_EVIDENCE_SCHEMA, alphaFrameEvidence } from '../src/features/decode-seek/alpha.ts';
import { sha256Hex } from '../src/core/seeded-rng.ts';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('frame-bake exact presentation requests', () => {
  test('non-zero source PTS is mapped to zero-based media time without losing the source labels', () => {
    const request = exactPresentationTimesForFrameBake(listedFrames(1_421_333));
    expect(request).toEqual({
      originUs: 1_421_333,
      timestampsUs: [1_421_333, 1_454_666, 1_487_999],
    });
    expect(exactPresentationAnchorsForVideoElement({
      maxFrames: 3,
      exactPresentationTimes: request,
    })).toEqual([
      { mediaTimeSec: 0, ptsUs: 1_421_333 },
      { mediaTimeSec: 0.033333, ptsUs: 1_454_666 },
      { mediaTimeSec: 0.066666, ptsUs: 1_487_999 },
    ]);

    const hugeOrigin = 2_243_657_254_000;
    expect(exactPresentationAnchorsForVideoElement({
      exactPresentationTimes: {
        originUs: hugeOrigin,
        timestampsUs: [hugeOrigin, hugeOrigin + 54_688, hugeOrigin + 88_021],
      },
    })).toEqual([
      { mediaTimeSec: 0, ptsUs: hugeOrigin },
      { mediaTimeSec: 0.054688, ptsUs: hugeOrigin + 54_688 },
      { mediaTimeSec: 0.088021, ptsUs: hugeOrigin + 88_021 },
    ]);
  });

  test('duplicate, reversed, unsafe, and pre-origin timestamps fail instead of being normalized', () => {
    expect(() => exactPresentationTimesForFrameBake([
      frame(0, 100), frame(1, 100),
    ])).toThrow('strictly increasing and unique');
    expect(() => exactPresentationTimesForFrameBake([
      frame(0, 100), frame(1, 99),
    ])).toThrow('strictly increasing and unique');
    expect(() => exactPresentationTimesForFrameBake([
      frame(0, Number.MAX_SAFE_INTEGER + 1),
    ])).toThrow('safe integer microseconds');
    expect(() => exactPresentationAnchorsForVideoElement({
      exactPresentationTimes: { originUs: 100, timestampsUs: [99] },
    })).toThrow('precedes origin');
  });

  test('bake forwards every listed PTS while duration-spread evidence remains partial', async () => {
    const listed = listedFrames(1_421_333);
    installFixtureFetch(listed);
    let received: DecodeOptions | undefined;
    const exactEngine = {
      id: 'platform@test',
      async decodeFrames(_input: unknown, opts?: DecodeOptions): Promise<FrameSink> {
        received = opts;
        const timestampsUs = opts?.exactPresentationTimes?.timestampsUs ?? [];
        return pixelSink(timestampsUs);
      },
    } as unknown as MediaEngine;

    const filled = await bakeAssetFrames('asset.mp4', exactEngine, true, undefined, true);
    expect(received).toMatchObject({
      maxFrames: 64,
      exactPresentationTimes: {
        originUs: 1_421_333,
        timestampsUs: [1_421_333, 1_454_666, 1_487_999],
      },
    });
    expect(filled).toMatchObject({ status: 'filled', listedFrames: 3, filledFrames: 3 });
    expect(filled.framesDoc?.frames.map((entry) => entry.pixelProvenance)).toEqual([
      expect.objectContaining({ expectedPtsUs: 1_421_333, observedPtsUs: 1_421_333 }),
      expect.objectContaining({ expectedPtsUs: 1_454_666, observedPtsUs: 1_454_666 }),
      expect.objectContaining({ expectedPtsUs: 1_487_999, observedPtsUs: 1_487_999 }),
    ]);
    expect(filled.alphaDoc).toMatchObject({
      artifactKind: 'alpha',
      assetId: 'asset.mp4',
      sourceMedia: { sha256: sha256Hex(new Uint8Array([0, 1, 2, 3])), sizeBytes: 4 },
      payload: {
        schema: ALPHA_EVIDENCE_SCHEMA,
        assetId: 'asset.mp4',
        sourceSha256: sha256Hex(new Uint8Array([0, 1, 2, 3])),
      },
    });
    expect(filled.alphaDoc?.payload.frames).toEqual([
      alphaFrameEvidence(1_421_333, 2, 2, testImage().data),
      alphaFrameEvidence(1_454_666, 2, 2, testImage().data),
      alphaFrameEvidence(1_487_999, 2, 2, testImage().data),
    ]);

    const zeroBased = listedFrames(0, 12);
    const durationSpread = pixelEvidence(Array.from({ length: 12 }, (_, index) => index * 833_333));
    const partial = materializeFrameEvidence(zeroBased, durationSpread);
    expect(partial.filledCount).toBe(1);
    expect(partial.frames.filter((entry) => entry.sha256 === null)).toHaveLength(11);
  });

  test('an explicit alpha request never emits a partial sidecar', async () => {
    const listed = listedFrames(0);
    installFixtureFetch(listed);
    const partialEngine = {
      id: 'platform@test',
      async decodeFrames(): Promise<FrameSink> {
        return pixelSink([0, 33_333]);
      },
    } as unknown as MediaEngine;

    const partial = await bakeAssetFrames('asset.mp4', partialEngine, true, undefined, true);
    expect(partial).toMatchObject({ status: 'partial', listedFrames: 3, filledFrames: 2 });
    expect(partial.alphaFile).toBe('asset.mp4.alpha.json');
    expect(partial.alphaDoc).toBeUndefined();
    expect(partial.ssimDoc).toBeUndefined();
  });

  test('fragment edit origins preserve all 12 leading H.264 presentation instants', async () => {
    const bytes = new Uint8Array(await Bun.file(
      'fixtures/media/scenarios/decode-seek/decode_h264_first_frames/01.mp4',
    ).arrayBuffer());
    const video = demuxMp4Video(bytes);
    const prefix = video.samples
      .slice()
      .sort((left, right) => left.ptsUs - right.ptsUs)
      .slice(0, 12)
      .map((sample) => sample.ptsUs);
    expect(prefix).toEqual([
      0, 16_667, 33_333, 50_000, 66_667, 83_333,
      100_000, 116_667, 133_333, 150_000, 166_667, 183_333,
    ]);
    expect(video.samples[0]).toMatchObject({ ptsUs: 0, dtsUs: -33_333 });

    const listed = prefix.map((ptsUs, index) => frame(index, ptsUs));
    const formerFragmentTimeline = prefix.map((ptsUs) => ptsUs + 33_333);
    expect(materializeFrameEvidence(listed, pixelEvidence(formerFragmentTimeline)).filledCount).toBe(10);
    expect(materializeFrameEvidence(listed, pixelEvidence(prefix)).filledCount).toBe(12);
  });

  test('hvcC codec identity reverses compatibility flags and retains real constraints', async () => {
    const cases = [
      ['01.mp4', 'hvc1.1.6.L120.90'],
      ['02.mp4', 'hvc1.1.6.L120.90'],
      ['03.mp4', 'hvc1.1.2.L120.80'],
    ] as const;
    for (const [file, expectedCodec] of cases) {
      const bytes = new Uint8Array(await Bun.file(
        `fixtures/media/scenarios/decode-seek/decode_hevc/${file}`,
      ).arrayBuffer());
      expect(demuxMp4Video(bytes).config.codecString).toBe(expectedCodec);
    }
  });
});

function listedFrames(originUs: number, count = 3): GoldenFrameEntry[] {
  return Array.from({ length: count }, (_, index) => frame(index, originUs + index * 33_333));
}

function frame(index: number, ptsUs: number): GoldenFrameEntry {
  return { index, ptsUs, keyframe: index === 0, sha256: null };
}

function pixelSink(timestampsUs: readonly number[]): FrameSink {
  return {
    frames: timestampsUs.map((ptsUs, index) => ({
      index,
      ptsUs,
      sha256: `${index.toString(16)}`.padStart(64, '0'),
      width: 2,
      height: 2,
    })),
    getPixels: async () => testImage(),
  };
}

function pixelEvidence(timestampsUs: readonly number[]) {
  const sink = pixelSink(timestampsUs);
  return sink.frames.map((digest) => ({
    digest,
    image: testImage(),
    pixelSource: 'FrameSink.getPixels' as const,
  }));
}

function testImage(): ImageData {
  return {
    width: 2,
    height: 2,
    data: new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 255, 255,
    ]),
    colorSpace: 'srgb',
  } as ImageData;
}

function installFixtureFetch(listed: GoldenFrameEntry[]): void {
  const source = new Uint8Array([0, 1, 2, 3]);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('fixtures/golden/asset.mp4.frames.json')) {
      return Response.json({ pending: true, assetId: 'asset.mp4', frames: listed });
    }
    if (url.endsWith('fixtures/media/asset.mp4')) {
      if (init?.method === 'HEAD') return new Response(null, { status: 200 });
      return new Response(source, { status: 200, headers: { 'content-type': 'video/mp4' } });
    }
    return new Response(null, { status: 404 });
  }) as typeof fetch;
}
