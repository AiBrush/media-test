import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import type { InputTrack } from 'mediabunny';

import {
  CONCRETE_OPERATION_PROTOCOL,
  SUPPORTED_CHECKED_SUPPORT_SNAPSHOT,
  isMalformedInputError,
  isNotApplicableError,
  type DemuxResult,
  type EncodedTracks,
  type MediaInput,
  type NormalizedTrack,
} from '../src/core/engine.ts';
import { isCorpusDeliveryIntegrityError, sha256Hex as selectionSha256Hex } from '../src/core/media-selection.ts';
import { HLS_PLAYLIST_ONLY_CONTRACT } from '../src/features/probe/hls.ts';
import {
  canonicalizeSemanticTags,
  readNeutralMetadataTags,
} from '../src/features/metadata/index.ts';
import { evaluateStrictStreamCopy } from '../src/features/remux/strict-copy.ts';
import { inspectTrimAudioContainer } from '../src/features/trim/audio.ts';
import {
  MediabunnyEngine,
  applyObservedAudioPresentationEvidence,
  createMediabunnyAuthenticatedRangeFetch,
  createCencKeyResolver,
  h264PacketKeyframe,
  hlsExplicitIvHexesFromPlaylist,
  hlsKeyMethodsFromPlaylist,
  hlsKeyUrisFromPlaylist,
  normalizeTrack,
  representationForCodec,
  selectMediabunnyCopyTrimChunks,
  type MediabunnyHlsReadTrace,
  type MediabunnyAuthenticatedRangeTrace,
} from '../src/engines/mediabunny/adapter.ts';
import { MEDIABUNNY_REASON } from '../src/engines/mediabunny/support.ts';

const MEDIA_ROOT = new URL('../fixtures/media/', import.meta.url);

async function fixture(name: string): Promise<MediaInput> {
  const bytes = new Uint8Array(await readFile(new URL(name, MEDIA_ROOT)));
  return memoryInput(name, bytes, mimeFor(name));
}

function memoryInput(id: string, bytes: Uint8Array, mime = 'video/mp4'): MediaInput {
  return {
    id,
    url: `blob:mediabunny-test/${id}`,
    mime,
    sizeBytes: bytes.byteLength,
    blob: async () => new Blob([bytes.slice()], { type: mime }),
    arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer,
  };
}

function mimeFor(name: string): string {
  if (name.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl';
  if (name.endsWith('.webm')) return 'video/webm';
  return 'video/mp4';
}

async function withEngine<T>(run: (engine: MediabunnyEngine) => Promise<T>): Promise<T> {
  const engine = new MediabunnyEngine();
  await engine.init();
  try {
    return await run(engine);
  } finally {
    await engine.dispose();
  }
}

function trackMultiset(result: DemuxResult): string[] {
  return result.metadata.tracks.map((track) => `${track.type}:${track.codec}`).sort();
}

function packetEssence(result: DemuxResult): string[][] {
  const tracks: string[][] = result.metadata.tracks.map(() => []);
  for (const packet of result.packets) tracks[packet.trackIndex]?.push(packet.payloadDigest ?? 'missing');
  return tracks;
}

describe('REQ-FEAT-38 authenticated Mediabunny range transport', () => {
  test('validates fixed blocks before delivery and reports physical source bytes', async () => {
    const original = new TextEncoder().encode('authenticated-range-body');
    const chunkSizeBytes = 5;
    const attestation = {
      schema: 'media-test/url-content-attestation@1' as const,
      logicalPath: 'scale.mp4',
      sha256: selectionSha256Hex(original),
      sizeBytes: original.byteLength,
      chunkSizeBytes,
      chunkSha256: Array.from(
        { length: Math.ceil(original.byteLength / chunkSizeBytes) },
        (_, index) => selectionSha256Hex(original.subarray(index * chunkSizeBytes, (index + 1) * chunkSizeBytes)),
      ),
    };
    let served = original.slice();
    const physicalRanges: Array<{ start: number; end: number }> = [];
    const fetchImpl = (async (_resource: RequestInfo | URL, init?: RequestInit) => {
      const header = new Headers(init?.headers).get('Range');
      const match = /^bytes=(\d+)-(\d+)$/.exec(header ?? '');
      if (!match) return new Response(null, { status: 400 });
      const start = Number(match[1]);
      const end = Number(match[2]);
      physicalRanges.push({ start, end });
      return new Response(served.slice(start, end + 1), {
        status: 206,
        headers: { 'Content-Range': `bytes ${start}-${end}/${served.byteLength}` },
      });
    }) as typeof fetch;
    const trace = (): MediabunnyAuthenticatedRangeTrace => ({
      bytesRead: 0,
      rangeRequests: 0,
      blockRequests: 0,
      ranges: [],
    });

    const firstTrace = trace();
    const verifiedFetch = createMediabunnyAuthenticatedRangeFetch(
      'https://fixtures.test/scale.mp4',
      attestation,
      firstTrace,
      fetchImpl,
    );
    const response = await verifiedFetch('https://fixtures.test/scale.mp4', {
      headers: { Range: 'bytes=3-12' },
    });
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(original.slice(3, 13));
    expect(firstTrace).toMatchObject({ rangeRequests: 1, blockRequests: 3, bytesRead: 15 });
    expect(physicalRanges.every(({ start, end }) => end - start + 1 <= chunkSizeBytes)).toBe(true);

    served = original.slice();
    served[6] ^= 0xff;
    const changedTrace = trace();
    const changedFetch = createMediabunnyAuthenticatedRangeFetch(
      'https://fixtures.test/scale.mp4',
      attestation,
      changedTrace,
      fetchImpl,
    );
    const changed = await changedFetch('https://fixtures.test/scale.mp4', {
      headers: { Range: 'bytes=5-9' },
    });
    let thrown: unknown;
    try {
      await changed.arrayBuffer();
    } catch (error) {
      thrown = error;
    }
    expect(isCorpusDeliveryIntegrityError(thrown)).toBe(true);
    if (isCorpusDeliveryIntegrityError(thrown)) {
      expect(thrown.reasonCode).toBe('CORPUS_AUTHENTICATED_RANGE_DIGEST_MISMATCH');
    }
  });

  test('rejects an explicit range whose end precedes its start before fetching source bytes', async () => {
    const bytes = new TextEncoder().encode('range-shape');
    const attestation = {
      schema: 'media-test/url-content-attestation@1' as const,
      logicalPath: 'scale.mp4',
      sha256: selectionSha256Hex(bytes),
      sizeBytes: bytes.byteLength,
      chunkSizeBytes: bytes.byteLength,
      chunkSha256: [selectionSha256Hex(bytes)],
    };
    const trace: MediabunnyAuthenticatedRangeTrace = {
      bytesRead: 0,
      rangeRequests: 0,
      blockRequests: 0,
      ranges: [],
    };
    let sourceFetches = 0;
    const verifiedFetch = createMediabunnyAuthenticatedRangeFetch(
      'https://fixtures.test/scale.mp4',
      attestation,
      trace,
      (async () => {
        sourceFetches += 1;
        return new Response(null, { status: 500 });
      }) as typeof fetch,
    );
    let thrown: unknown;
    try {
      await verifiedFetch('https://fixtures.test/scale.mp4', {
        headers: { Range: 'bytes=7-6' },
      });
    } catch (error) {
      thrown = error;
    }
    expect(isCorpusDeliveryIntegrityError(thrown)).toBe(true);
    if (isCorpusDeliveryIntegrityError(thrown)) {
      expect(thrown.reasonCode).toBe('CORPUS_AUTHENTICATED_RANGE_REQUEST_INVALID');
    }
    expect(sourceFetches).toBe(0);
    expect(trace).toEqual({ bytesRead: 0, rangeRequests: 0, blockRequests: 0, ranges: [] });
  });

  test('scale probe reports UrlSource range mode and authenticated physical-byte telemetry', async () => {
    const source = new Uint8Array(await readFile(new URL('h264_1fps_30s.mp4', MEDIA_ROOT)));
    const chunkSizeBytes = 32 * 1024;
    const attestation = {
      schema: 'media-test/url-content-attestation@1' as const,
      logicalPath: 'h264_1fps_30s.mp4',
      sha256: selectionSha256Hex(source),
      sizeBytes: source.byteLength,
      chunkSizeBytes,
      chunkSha256: Array.from(
        { length: Math.ceil(source.byteLength / chunkSizeBytes) },
        (_, index) => selectionSha256Hex(source.subarray(index * chunkSizeBytes, (index + 1) * chunkSizeBytes)),
      ),
    };
    const originalFetch = globalThis.fetch;
    const physicalRanges: Array<{ start: number; end: number }> = [];
    globalThis.fetch = (async (_resource: RequestInfo | URL, init?: RequestInit) => {
      const match = /^bytes=(\d+)-(\d+)$/.exec(new Headers(init?.headers).get('Range') ?? '');
      if (!match) return new Response(null, { status: 400 });
      const start = Number(match[1]);
      const end = Number(match[2]);
      physicalRanges.push({ start, end });
      return new Response(source.slice(start, end + 1), {
        status: 206,
        headers: { 'Content-Range': `bytes ${start}-${end}/${source.byteLength}` },
      });
    }) as typeof fetch;
    try {
      await withEngine(async (engine) => {
        const input: MediaInput = {
          id: 'h264_1fps_30s.mp4',
          url: 'https://fixtures.test/h264_1fps_30s.mp4',
          mime: 'video/mp4',
          sizeBytes: source.byteLength,
          contentAttestation: attestation,
          blob: async () => { throw new Error('whole-file blob access is forbidden'); },
          arrayBuffer: async () => { throw new Error('whole-file byte access is forbidden'); },
        };
        const controller = new AbortController();
        const metadata = await engine.probe(input, {
          signal: controller.signal,
          phase: 'functional',
          emit: () => undefined,
          checkedSupport: SUPPORTED_CHECKED_SUPPORT_SNAPSHOT,
          request: {
            protocol: CONCRETE_OPERATION_PROTOCOL,
            scenarioId: 'probe/scale-authenticated-range-test',
            operation: 'probe',
            inputs: [{
              id: input.id,
              mime: input.mime,
              container: 'mp4',
              mutated: false,
              tracks: [{ type: 'video', codec: 'h264' }],
            }],
            options: {
              robustness: {
                probe: {
                  schema: 'media-test/probe-scenario-contract@1',
                  probeBudget: {
                    schema: 'media-test/probe-budget@1',
                    scale: 'large',
                    allowedReadModes: ['range'],
                    maxBytesRead: source.byteLength,
                    maxReadFraction: 1,
                    maxPeakMemoryDeltaBytes: 64 * 1024 * 1024,
                  },
                },
              },
            },
          },
        });
        expect(metadata.probeEvidence?.readMode).toBe('range');
        expect(metadata.telemetry?.bytesRead).toBeGreaterThan(0);
        expect(metadata.telemetry?.bytesRead).toBeLessThanOrEqual(source.byteLength);
        expect(metadata.tracks.map((track) => track.language)).toEqual([null]);
        expect(physicalRanges.length).toBeGreaterThan(0);
        expect(physicalRanges.every(({ start, end }) => end - start + 1 <= chunkSizeBytes)).toBe(true);
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('scale MOV probe recovers legacy QuickTime English from the already authenticated prefix', async () => {
    const source = new Uint8Array(await readFile(
      new URL('scenarios/probe/h264_1080p_5s/03.mov', MEDIA_ROOT),
    ));
    const chunkSizeBytes = 1024 * 1024;
    const attestation = {
      schema: 'media-test/url-content-attestation@1' as const,
      logicalPath: 'legacy-language.mov',
      sha256: selectionSha256Hex(source),
      sizeBytes: source.byteLength,
      chunkSizeBytes,
      chunkSha256: Array.from(
        { length: Math.ceil(source.byteLength / chunkSizeBytes) },
        (_, index) => selectionSha256Hex(source.subarray(index * chunkSizeBytes, (index + 1) * chunkSizeBytes)),
      ),
    };
    const originalFetch = globalThis.fetch;
    const physicalRanges: Array<{ start: number; end: number }> = [];
    globalThis.fetch = (async (_resource: RequestInfo | URL, init?: RequestInit) => {
      const match = /^bytes=(\d+)-(\d+)$/.exec(new Headers(init?.headers).get('Range') ?? '');
      if (!match) return new Response(null, { status: 400 });
      const start = Number(match[1]);
      const end = Number(match[2]);
      physicalRanges.push({ start, end });
      return new Response(source.slice(start, end + 1), {
        status: 206,
        headers: { 'Content-Range': `bytes ${start}-${end}/${source.byteLength}` },
      });
    }) as typeof fetch;
    try {
      await withEngine(async (engine) => {
        const input: MediaInput = {
          id: 'legacy-language.mov',
          url: 'https://fixtures.test/legacy-language.mov',
          mime: 'video/quicktime',
          sizeBytes: source.byteLength,
          contentAttestation: attestation,
          blob: async () => { throw new Error('whole-file blob access is forbidden'); },
          arrayBuffer: async () => { throw new Error('whole-file byte access is forbidden'); },
        };
        const controller = new AbortController();
        const metadata = await engine.probe(input, {
          signal: controller.signal,
          phase: 'functional',
          emit: () => undefined,
          checkedSupport: SUPPORTED_CHECKED_SUPPORT_SNAPSHOT,
          request: {
            protocol: CONCRETE_OPERATION_PROTOCOL,
            scenarioId: 'probe/legacy-quicktime-language-range-test',
            operation: 'probe',
            inputs: [{
              id: input.id,
              mime: input.mime,
              container: 'mov',
              mutated: false,
              tracks: [{ type: 'video', codec: 'h264' }, { type: 'audio', codec: 'aac' }],
            }],
            options: {
              robustness: {
                probe: {
                  schema: 'media-test/probe-scenario-contract@1',
                  probeBudget: {
                    schema: 'media-test/probe-budget@1',
                    scale: 'large',
                    allowedReadModes: ['range'],
                    maxBytesRead: source.byteLength,
                    maxReadFraction: 1,
                    maxPeakMemoryDeltaBytes: 64 * 1024 * 1024,
                  },
                },
              },
            },
          },
        });
        expect(metadata.tracks.map((track) => track.language)).toEqual(['eng', 'eng']);
        expect(metadata.probeEvidence?.readMode).toBe('range');
        expect(metadata.telemetry?.bytesRead).toBe(
          physicalRanges.reduce((sum, { start, end }) => sum + end - start + 1, 0),
        );
        expect(physicalRanges.filter(({ start }) => start === 0)).toHaveLength(1);
        expect(physicalRanges.every(({ start, end }) => end - start + 1 <= chunkSizeBytes)).toBe(true);
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

function ptsRegressions(result: DemuxResult, trackIndex = 0): number {
  const pts = result.packets.filter((packet) => packet.trackIndex === trackIndex).map((packet) => packet.ptsUs);
  let count = 0;
  for (let index = 1; index < pts.length; index++) if (pts[index]! < pts[index - 1]!) count++;
  return count;
}

describe('REQ-ENG-03: explicit packet representation and timing evidence', () => {
  test('normalizes coded video dimensions without folding display geometry into metadata', async () => {
    let displayGetterCalls = 0;
    const track = {
      type: 'video',
      isVideoTrack: () => true,
      isAudioTrack: () => false,
      getLanguageCode: async () => 'eng',
      getBitrate: async () => 3_000_000,
      getInternalCodecId: async () => 'avc1.64001f',
      getCodec: async () => 'avc',
      getCodedWidth: async () => 1_280,
      getCodedHeight: async () => 480,
      getDisplayWidth: async () => {
        displayGetterCalls++;
        return 1_280;
      },
      getDisplayHeight: async () => {
        displayGetterCalls++;
        return 481;
      },
      getRotation: async () => 90,
      computePacketStats: async () => ({ averagePacketRate: 30, packetCount: 120 }),
    } as unknown as InputTrack;

    expect(await normalizeTrack(track)).toMatchObject({
      type: 'video',
      codec: 'h264',
      nativeCodecTag: 'avc1.64001f',
      width: 1_280,
      height: 480,
      rotation: 90,
      bitrate: 3_000_000,
      language: 'eng',
      fps: 30,
    });
    expect(displayGetterCalls).toBe(0);
  });

  test('translates only ISO-BMFF quarter-turns into the suite-clockwise convention', async () => {
    const track = (rotation: 0 | 90 | 180 | 270) => ({
      type: 'video',
      isVideoTrack: () => true,
      isAudioTrack: () => false,
      getLanguageCode: async () => 'und',
      getBitrate: async () => null,
      getInternalCodecId: async () => 'avc1',
      getCodec: async () => 'avc',
      getCodedWidth: async () => 1_280,
      getCodedHeight: async () => 720,
      getRotation: async () => rotation,
      computePacketStats: async () => ({ averagePacketRate: 30, packetCount: 120 }),
    }) as unknown as InputTrack;

    expect((await normalizeTrack(track(270), { sourceContainer: 'mp4' })).rotation).toBe(90);
    expect((await normalizeTrack(track(90), { sourceContainer: 'mov' })).rotation).toBe(270);
    expect((await normalizeTrack(track(0), { sourceContainer: 'mp4' })).rotation).toBe(0);
    expect((await normalizeTrack(track(180), { sourceContainer: 'mov' })).rotation).toBe(180);
    expect((await normalizeTrack(track(270), { sourceContainer: 'mkv' })).rotation).toBe(270);
    expect((await normalizeTrack(track(90), { sourceContainer: 'webm' })).rotation).toBe(90);
    expect((await normalizeTrack(track(270))).rotation).toBe(270);
  });

  test('probe reports the baked ISO display matrix as clockwise 90 degrees with coded dimensions', async () => {
    const metadata = await withEngine(async (engine) => engine.probe(await fixture('h264_rotated90.mp4')));
    expect(metadata).toMatchObject({ container: 'mp4', durationSec: 10 });
    expect(metadata.tracks.find((track) => track.type === 'video')).toMatchObject({
        type: 'video',
        codec: 'h264',
        width: 1_280,
        height: 720,
        rotation: 90,
    });
  });

  test('derives declared PCM bitrate from the public sample format', async () => {
    const track = {
      type: 'audio',
      isVideoTrack: () => false,
      isAudioTrack: () => true,
      getLanguageCode: async () => 'und',
      getBitrate: async () => null,
      getInternalCodecId: async () => 1,
      getCodec: async () => 'pcm-s16',
      getSampleRate: async () => 48_000,
      getNumberOfChannels: async () => 2,
    } as unknown as InputTrack;

    expect(await normalizeTrack(track)).toMatchObject({
      type: 'audio',
      codec: 'pcm-s16',
      sampleRate: 48_000,
      channels: 2,
      bitrate: 1_536_000,
      language: null,
    });
  });

  test('normalizes explicit HE-AAC core and presentation views from decoder config', async () => {
    const track = {
      type: 'audio',
      isVideoTrack: () => false,
      isAudioTrack: () => true,
      getLanguageCode: async () => 'und',
      getBitrate: async () => null,
      getInternalCodecId: async () => 'mp4a',
      getCodec: async () => 'aac',
      getSampleRate: async () => 22_050,
      getNumberOfChannels: async () => 2,
      getDecoderConfig: async () => ({
        codec: 'mp4a.40.5',
        sampleRate: 22_050,
        numberOfChannels: 2,
        description: new Uint8Array([0x2b, 0x92, 0x08]),
      }),
    } as unknown as InputTrack;

    expect(await normalizeTrack(track)).toMatchObject({
      codec: 'aac',
      rawCodec: 'mp4a.40.5',
      sampleRate: 44_100,
      channels: 2,
      audioObjectType: 5,
      codedSampleRate: 22_050,
      presentationSampleRate: 44_100,
      sbrPresent: true,
      psPresent: false,
    });
  });

  test('uses decoded output as presentation evidence for implicit HE-AAC Parametric Stereo', () => {
    const track: NormalizedTrack = {
      type: 'audio',
      codec: 'aac',
      sampleRate: 48_000,
      channels: 1,
      codedSampleRate: 24_000,
      presentationSampleRate: 48_000,
      codedChannels: 1,
      presentationChannels: 1,
      sbrPresent: true,
      psPresent: false,
      bitrate: null,
      language: null,
    };

    applyObservedAudioPresentationEvidence(track, {
      sampleRate: 48_000,
      numberOfChannels: 2,
    });

    expect(track).toMatchObject({
      sampleRate: 48_000,
      channels: 2,
      codedSampleRate: 24_000,
      presentationSampleRate: 48_000,
      codedChannels: 1,
      presentationChannels: 2,
      sbrPresent: true,
      psPresent: true,
    });
  });

  test('probe derives VFR cadence from the complete packet timeline when no scale budget applies', async () => {
    const input = await fixture('scenarios/probe/h264_vfr/03.mp4');
    const controller = new AbortController();
    await withEngine(async (engine) => {
      const metadata = await engine.probe(input, {
        signal: controller.signal,
        phase: 'functional',
        emit: () => undefined,
        checkedSupport: SUPPORTED_CHECKED_SUPPORT_SNAPSHOT,
        request: {
          protocol: CONCRETE_OPERATION_PROTOCOL,
          scenarioId: 'probe/h264_vfr',
          operation: 'probe',
          inputs: [{
            id: input.id,
            mime: input.mime,
            container: 'mp4',
            mutated: false,
            tracks: [{ type: 'video', codec: 'h264' }, { type: 'audio', codec: 'aac' }],
          }],
          options: {},
        },
      });
      expect(metadata.tracks[0]?.fps).toBeCloseTo(16.216, 3);
      expect(metadata.tracks[0]?.fpsProvenance).toMatchObject({
        source: 'observed',
        cadence: 'VFR',
      });
      expect(metadata.tracks[0]?.fpsProvenance?.sampleCount).toBeGreaterThan(120);
      expect(metadata.tracks.map((track) => track.language)).toEqual(['eng', 'eng']);
      expect(metadata.tags?.major_brand).toBe('isom');
    });
  });

  test('probe reports ISO movie presentation duration instead of the raw edited media span', async () => {
    const input = await fixture('scenarios/probe/h264_1080p_5s/01.mov');
    const controller = new AbortController();
    await withEngine(async (engine) => {
      const metadata = await engine.probe(input, {
        signal: controller.signal,
        phase: 'functional',
        emit: () => undefined,
        checkedSupport: SUPPORTED_CHECKED_SUPPORT_SNAPSHOT,
        request: {
          protocol: CONCRETE_OPERATION_PROTOCOL,
          scenarioId: 'probe/h264_1080p_5s',
          operation: 'probe',
          inputs: [{
            id: input.id,
            mime: 'video/quicktime',
            container: 'mov',
            mutated: false,
            tracks: [{ type: 'video', codec: 'h264' }, { type: 'audio', codec: 'aac' }],
          }],
          options: {},
        },
      });
      expect(metadata.durationSec).toBeCloseTo(6.46671, 5);
      expect(metadata.presentationDurationSec).toBeCloseTo(6.46671, 5);
    });
  });

  test('probe converts a positive-offset MPEG-TS end timestamp into presentation duration', async () => {
    const input = await fixture('ts_discontinuity.ts');
    await withEngine(async (engine) => {
      const metadata = await engine.probe(input);
      expect(metadata.container).toBe('ts');
      expect(metadata.durationSec).toBeCloseTo(600.605, 3);
      expect(metadata.tracks[0]).toMatchObject({
        type: 'video',
        codec: 'h264',
        fpsProvenance: {
          cadence: 'VFR',
        },
      });
      expect(metadata.tracks[0]?.fpsProvenance?.envelope?.maxFps).toBeCloseTo(30, 3);
    });
  });

  test('maps AVCC/Annex-B, HEVC configuration, and AAC framing without inference ambiguity', () => {
    const avcC = new Uint8Array(8);
    avcC[4] = 0xff;
    expect(representationForCodec('h264', avcC)).toEqual({
      framing: 'avc',
      accessUnitGrouping: 'one-access-unit-per-chunk',
      parameterSetLocation: 'description',
      descriptionRecord: 'avc-decoder-configuration-record',
      nalLengthSize: 4,
    });
    expect(representationForCodec('h264')).toEqual({
      framing: 'annexb',
      accessUnitGrouping: 'one-access-unit-per-chunk',
      parameterSetLocation: 'in-band',
    });

    const hvcC = new Uint8Array(24);
    hvcC[21] = 0xfd;
    expect(representationForCodec('hevc', hvcC)).toMatchObject({
      framing: 'hevc',
      parameterSetLocation: 'description',
      descriptionRecord: 'hevc-decoder-configuration-record',
      nalLengthSize: 2,
    });
    expect(representationForCodec('aac', new Uint8Array([0x12, 0x10]))).toMatchObject({
      framing: 'raw',
      parameterSetLocation: 'description',
      descriptionRecord: 'audio-specific-config',
    });
    expect(representationForCodec('aac')).toMatchObject({ framing: 'adts', parameterSetLocation: 'in-band' });
  });

  test('classifies non-IDR H.264 I/SI slices as keyframes from the coded slice header', () => {
    const avc = (nalHeader: number, sliceHeader: number): Uint8Array =>
      Uint8Array.from([0, 0, 0, 2, nalHeader, sliceHeader]);
    expect(h264PacketKeyframe(avc(0x65, 0xc0), 'avc', 4)).toBe(true); // IDR
    expect(h264PacketKeyframe(avc(0x41, 0xb0), 'avc', 4)).toBe(true); // I slice_type=2
    expect(h264PacketKeyframe(avc(0x41, 0x94), 'avc', 4)).toBe(true); // SI slice_type=4
    expect(h264PacketKeyframe(avc(0x41, 0xc0), 'avc', 4)).toBe(false); // P slice_type=0
    expect(h264PacketKeyframe(Uint8Array.from([0, 0, 1, 0x41, 0xb0]), 'annexb')).toBe(true);
    expect(h264PacketKeyframe(Uint8Array.from([0, 0, 0, 5, 0x41]), 'avc', 4)).toBeUndefined();
  });

  test('demux leaves DTS absent, exposes decode order/config, and reports observed FPS provenance', async () => {
    await withEngine(async (engine) => {
      const source = await engine.demux(await fixture('micro_h264_1frame.mp4'));
      expect(source.packetOrdering).toBe('decode');
      expect(source.packets).toHaveLength(1);
      expect(source.packets.every((packet) => packet.dtsUs === undefined)).toBe(true);
      expect(source.packets[0]).toMatchObject({
        trackType: 'video',
        codec: 'h264',
        framing: 'avc',
        randomAccessKind: 'bitstream-verified-key',
      });
      expect(source.packets[0]?.decoderConfig?.byteLength).toBeGreaterThan(0);
      expect(source.packets[0]?.payload?.byteLength).toBe(source.packets[0]?.size);
      expect(source.representations?.[0]).toMatchObject({
        packetOrdering: 'decode',
        framing: 'avc',
        accessUnitGrouping: 'one-access-unit-per-chunk',
        parameterSetLocation: 'description',
        descriptionRecord: 'avc-decoder-configuration-record',
      });
      expect(source.representations?.[0]?.nativeCodecTag).toMatch(/^avc1\.[0-9a-f]{6}$/i);
      expect(source.metadata.tracks[0]?.fpsProvenance).toMatchObject({
        source: 'observed',
        cadence: 'UNKNOWN',
        sampleCount: 1,
        observedIntervalUs: 1_000_000,
      });
    });
  });

  test('demux applies ISO edit-list presentation membership to coded MOV packets', async () => {
    const input = await fixture('scenarios/demux/h264_1080p_5s/01.mov');
    const controller = new AbortController();
    await withEngine(async (engine) => {
      const result = await engine.demux(input, {
        signal: controller.signal,
        phase: 'functional',
        emit: () => undefined,
        checkedSupport: SUPPORTED_CHECKED_SUPPORT_SNAPSHOT,
        request: {
          protocol: CONCRETE_OPERATION_PROTOCOL,
          scenarioId: 'demux/h264_1080p_5s',
          operation: 'demux',
          inputs: [{
            id: input.id,
            mime: 'video/quicktime',
            container: 'mov',
            mutated: false,
            tracks: [{ type: 'video', codec: 'h264' }, { type: 'audio', codec: 'aac' }],
          }],
          options: {},
        },
      });
      expect(result.packets).toHaveLength(472);
      expect(result.packets.filter((packet) => packet.trackIndex === 0)).toHaveLength(194);
      const audioPackets = result.packets.filter((packet) => packet.trackIndex === 1);
      expect(audioPackets).toHaveLength(278);
      expect(audioPackets.at(-1)?.accessUnitId).toBe('1:277');
      expect(result.metadata.tracks[1]).toMatchObject({
        mediaTimescale: 441_000,
        presentationDurationSec: 6.453696,
        editList: [{
          segmentDuration: 2_846_080,
          mediaTime: 0,
          mediaRateNumerator: 1,
          mediaRateDenominator: 1,
        }],
      });
      expect(result.metadata.tracks[1]?.rawMediaSpanSec).toBeCloseTo(6.501587301587301, 12);
    });
  });

  test('demux reports exact LAME/Xing MP3 presentation duration with priming and padding evidence', async () => {
    const input = await fixture('scenarios/demux/realworld_mdn_trex_mp3/realworld_mdn_trex.mp3');
    const controller = new AbortController();
    await withEngine(async (engine) => {
      const result = await engine.demux(input, {
        signal: controller.signal,
        phase: 'functional',
        emit: () => undefined,
        checkedSupport: SUPPORTED_CHECKED_SUPPORT_SNAPSHOT,
        request: {
          protocol: CONCRETE_OPERATION_PROTOCOL,
          scenarioId: 'demux/realworld_mdn_trex_mp3',
          operation: 'demux',
          inputs: [{
            id: input.id,
            mime: 'audio/mpeg',
            container: 'mp3',
            mutated: false,
            tracks: [{ type: 'audio', codec: 'mp3' }],
          }],
          options: {},
        },
      });
      expect(result.packets).toHaveLength(81);
      expect(result.metadata.durationSec).toBeCloseTo(91_473 / 44_100, 9);
      expect(result.metadata).toMatchObject({
        presentationDurationSec: 91_473 / 44_100,
        rawMediaSpanSec: 93_312 / 44_100,
      });
      expect(result.metadata.tracks[0]).toMatchObject({
        primingSamples: 576,
        paddingSamples: 1_263,
        presentationDurationSec: 91_473 / 44_100,
        rawMediaSpanSec: 93_312 / 44_100,
      });
    });
  });
});

describe('Mediabunny HLS root classification', () => {
  test('playlist-only AES probing reads no key or segment resources', async () => {
    const playlistName = 'hls_aes128.m3u8';
    const bytes = new Uint8Array(await readFile(new URL(playlistName, MEDIA_ROOT)));
    const input = memoryInput(playlistName, bytes, 'application/octet-stream');
    const controller = new AbortController();

    await withEngine(async (engine) => {
      const metadata = await engine.probe(input, {
        signal: controller.signal,
        phase: 'functional',
        emit: () => undefined,
        checkedSupport: SUPPORTED_CHECKED_SUPPORT_SNAPSHOT,
        request: {
          protocol: CONCRETE_OPERATION_PROTOCOL,
          scenarioId: 'probe/hls_aes128_playlist_key_free',
          operation: 'probe',
          inputs: [{
            id: playlistName,
            mime: 'application/vnd.apple.mpegurl',
            container: 'hls',
            mutated: false,
            tracks: [],
          }],
          options: {
            invariant: 'hls-playlist-only-probe',
            robustness: { probe: { probeContract: HLS_PLAYLIST_ONLY_CONTRACT } },
          },
        },
      });
      expect(metadata).toMatchObject({
        container: 'hls',
        durationSec: 10,
        tracks: [],
        protectionScheme: 'hls-aes128',
        probeEvidence: {
          resourceAccesses: [{ role: 'playlist', disposition: 'read' }],
        },
      });
    });
  });

  test('a verified blob URL retains HLS PathedSource handling through its stable .m3u8 id', async () => {
    const playlistName = 'hls_vod.m3u8';
    const names = [
      playlistName,
      ...Array.from({ length: 5 }, (_, index) => `hls_vod_${String(index).padStart(3, '0')}.ts`),
    ];
    const files = new Map<string, Uint8Array>();
    for (const name of names) files.set(name, new Uint8Array(await readFile(new URL(name, MEDIA_ROOT))));
    const originalFetch = globalThis.fetch;
    let rootNetworkReads = 0;
    globalThis.fetch = (async (resource: RequestInfo | URL, init?: RequestInit) => {
      const request = resource instanceof Request ? resource : new Request(resource, init);
      const name = names.find((candidate) => request.url.endsWith(candidate));
      if (!name) return new Response('not found', { status: 404 });
      if (name === playlistName) rootNetworkReads++;
      const bytes = files.get(name)!;
      const range = request.headers.get('range');
      const match = range ? /^bytes=(\d+)-(\d*)$/i.exec(range) : null;
      if (match) {
        const start = Number(match[1]);
        const end = match[2] ? Number(match[2]) : bytes.byteLength - 1;
        const body = bytes.slice(start, end + 1);
        return new Response(body, {
          status: 206,
          headers: {
            'accept-ranges': 'bytes',
            'content-length': String(body.byteLength),
            'content-range': `bytes ${start}-${end}/${bytes.byteLength}`,
          },
        });
      }
      return new Response(bytes.slice(), {
        headers: { 'accept-ranges': 'bytes', 'content-length': String(bytes.byteLength) },
      });
    }) as typeof fetch;
    try {
      const input = memoryInput(playlistName, files.get(playlistName)!, 'application/octet-stream');

      await withEngine(async (engine) => {
        const metadata = await engine.probe(input);
        const sourceTrace = (metadata as typeof metadata & { sourceTrace: MediabunnyHlsReadTrace }).sourceTrace;
        expect(metadata.container).toBe('hls');
        expect(sourceTrace.rootMode).toBe('url');
        expect(sourceTrace.reads.some((read) => read.source === 'network-sidecar')).toBe(true);
      });
      expect(rootNetworkReads).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('REQ-ENG-02/04: strict packet-copy remux and mux contract', () => {
  test('negative remux parser rejection uses the typed graceful-failure channel', async () => {
    await withEngine(async (engine) => {
      const input = memoryInput('zeroed.mp4', new Uint8Array(64), 'video/mp4');
      await expect(engine.remux(input, { container: 'mkv' }, {
        signal: new AbortController().signal,
        phase: 'functional',
        emit: () => undefined,
        checkedSupport: SUPPORTED_CHECKED_SUPPORT_SNAPSHOT,
        request: {
          protocol: CONCRETE_OPERATION_PROTOCOL,
          scenarioId: 'remux/negative-typed-test',
          operation: 'remux',
          inputs: [{
            id: input.id,
            mime: input.mime,
            container: 'mp4',
            mutated: false,
            sourceEvidence: 'UNRESOLVED',
            tracks: [],
          }],
          output: { container: 'mkv' },
          options: {
            container: 'mkv',
            robustness: {
              schema: 'media-test/robustness-contract@1',
              inputClass: 'negative',
              returnedOutputCheck: 'media-structure',
              survivorOracles: ['graceful-failure'],
              timeoutMs: 15_000,
            },
          },
        },
      })).rejects.toMatchObject({
        reasonCode: 'MEDIABUNNY_REMUX_INPUT_MALFORMED',
        operation: 'remux',
      });
    });
  });

  test('one-frame MP4 remux preserves track accounting, codec config, and packet essence exactly', async () => {
    await withEngine(async (engine) => {
      const input = await fixture('micro_h264_1frame.mp4');
      const before = await engine.demux(input);
      const prepared = await engine.prepareMuxTracks([input]);
      expect(prepared.tracks).toHaveLength(before.metadata.tracks.length);
      expect(prepared.tracks[0]).toMatchObject({
        type: 'video',
        codec: 'h264',
        packetOrdering: 'decode',
        framing: 'avc',
        parameterSetLocation: 'description',
        descriptionRecord: 'avc-decoder-configuration-record',
      });
      expect(prepared.tracks[0]?.nativeCodecTag).toMatch(/^avc1\.[0-9a-f]{6}$/i);
      expect(prepared.tracks[0]?.chunks.every((chunk, index) =>
        chunk.dtsUs === undefined && chunk.decodeIndex === index
      )).toBe(true);

      const media = await engine.remux(input, { container: 'mp4' });
      const after = await engine.demux(memoryInput('remuxed-micro.mp4', media.bytes));
      expect(trackMultiset(after)).toEqual(trackMultiset(before));
      expect(packetEssence(after)).toEqual(packetEssence(before));
      expect(after.representations?.[0]?.description).toEqual(before.representations?.[0]?.description);
      expect(media.telemetry).toMatchObject({ bytesWritten: media.bytes.byteLength });
    });
  });

  test('prepared timescales are always safe integers and reserve mux derives its exact packet bound', async () => {
    await withEngine(async (engine) => {
      const mp3 = await engine.prepareMuxTracks([await fixture('mp3_xing.mp3')]);
      expect(mp3.tracks.every((track) => Number.isSafeInteger(track.timescale) && track.timescale > 0)).toBe(true);

      const prepared = await engine.prepareMuxTracks([await fixture('micro_h264_1frame.mp4')]);
      const media = await engine.mux(prepared, {
        container: 'mp4',
        fastStart: 'reserve',
        target: 'stream',
      });
      expect(media.bytes.byteOffset).toBe(0);
      expect(media.bytes.buffer.byteLength).toBe(media.bytes.byteLength);
      expect((media as { targetTelemetry?: { reserveMaximumPacketCount?: number } }).targetTelemetry)
        .toMatchObject({ reserveMaximumPacketCount: 1 });
    });
  });

  test('declared-illegal codec/container and empty-track rows reject through the typed malformed channel', async () => {
    await withEngine(async (engine) => {
      const controller = new AbortController();
      const contextFor = (
        scenarioId: string,
        input: MediaInput,
        container: string,
        tracks: NormalizedTrack[],
      ) => ({
        signal: controller.signal,
        phase: 'functional' as const,
        emit: () => undefined,
        checkedSupport: SUPPORTED_CHECKED_SUPPORT_SNAPSHOT,
        request: {
          protocol: CONCRETE_OPERATION_PROTOCOL,
          scenarioId,
          operation: 'mux' as const,
          inputs: [{
            id: input.id,
            mime: input.mime,
            container: input.id.endsWith('.wav') ? 'wav' : 'mp4',
            mutated: false,
            tracks,
          }],
          output: { container },
          options: { container },
        },
      });

      const h264 = await fixture('micro_h264_1frame.mp4');
      const h264Tracks = await engine.prepareMuxTracks([h264]);
      await expect(engine.mux(
        h264Tracks,
        { container: 'ogg' },
        contextFor('mux/neg_h264_into_ogg_illegal', h264, 'ogg', [
          { type: 'video', codec: 'h264', width: 320, height: 240 },
        ]),
      )).rejects.toMatchObject({ reasonCode: 'MEDIABUNNY_ILLEGAL_MUX_REJECTED' });

      const empty = await fixture('empty_audio.wav');
      const emptyContext = contextFor('mux/neg_zero_tracks_empty_audio_to_mp4', empty, 'mp4', [
        { type: 'audio', codec: 'pcm-s16', sampleRate: 48_000, channels: 2 },
      ]);
      const emptyTracks = await engine.prepareMuxTracks([empty], { container: 'mp4' }, emptyContext);
      expect(emptyTracks.tracks).toHaveLength(1);
      expect(emptyTracks.tracks[0]?.chunks).toHaveLength(0);
      await expect(engine.mux(emptyTracks, { container: 'mp4' }, emptyContext))
        .rejects.toMatchObject({ reasonCode: 'MEDIABUNNY_ILLEGAL_MUX_REJECTED' });
    });
  });

  test('unchanged AAC config and access units make contradictory container facts representational', async () => {
    await withEngine(async (engine) => {
      const bytes = new Uint8Array(await readFile(new URL(
        '../fixtures/media/scenarios/mux/size_tiny_360p_to_mp4/02.mp4',
        import.meta.url,
      )));
      const input = memoryInput('02.mp4', bytes);
      const prepared = await engine.prepareMuxTracks([input]);
      const media = await engine.mux(prepared, { container: 'mp4' });
      expect(evaluateStrictStreamCopy(bytes, 'mp4', media.bytes, 'mp4').outcome).toMatchObject({
        state: 'VERDICT',
        verdict: 'PASS',
        reasonCode: 'REMUX_VALID_REPRESENTATION_DIFFERENCE',
      });
    });
  });

  test('packet-copy trim preserves ISO display rotation without baking or dropping it', async () => {
    await withEngine(async (engine) => {
      const input = await fixture('h264_rotated90.mp4');
      const prepared = await engine.prepareMuxTracks([input]);
      expect(prepared.tracks.find((track) => track.type === 'video')).toMatchObject({
        width: 1_280,
        height: 720,
        rotation: 90,
      });

      const media = await engine.trim(
        input,
        { startUs: 2_000_000, endUs: 7_000_000 },
        { container: 'mp4', frameAccurate: false },
      );
      const metadata = await engine.probe(memoryInput('trimmed-rotated.mp4', media.bytes));
      expect(metadata.tracks.find((track) => track.type === 'video')).toMatchObject({
        width: 1_280,
        height: 720,
        rotation: 90,
      });
    });
  });

  test('VP9 WebM packet-copy trim preserves separately encoded alpha access units', async () => {
    await withEngine(async (engine) => {
      const input = await fixture('vp9_alpha.webm');
      const prepared = await engine.prepareMuxTracks([input]);
      const video = prepared.tracks.find((track) => track.type === 'video');
      expect(video).toBeDefined();
      if (!video) throw new Error('VP9 alpha fixture has no prepared video track');

      const selected = selectMediabunnyCopyTrimChunks(
        video.chunks,
        'video',
        { startUs: 1_000_000, endUs: 3_000_000 },
      );
      const expectedAlpha = selected.flatMap((chunk) =>
        chunk.alphaData ? [selectionSha256Hex(chunk.alphaData)] : []
      );
      expect(expectedAlpha.length).toBeGreaterThan(0);
      expect(selected.find((chunk) => chunk.alphaData)?.alphaData)
        .not.toBe(video.chunks.find((chunk) => chunk.alphaData)?.alphaData);

      const media = await engine.mux(
        { tracks: [{ ...video, chunks: selected }] },
        { container: 'webm' },
      );
      const reparsed = await engine.prepareMuxTracks([
        memoryInput('trimmed-vp9-alpha.webm', media.bytes, 'video/webm'),
      ]);
      const actualAlpha = reparsed.tracks[0]?.chunks.flatMap((chunk) =>
        chunk.alphaData ? [selectionSha256Hex(chunk.alphaData)] : []
      ) ?? [];
      expect(actualAlpha).toEqual(expectedAlpha);
    });
  });

  test('Ogg Opus packet-copy trim preserves payloads while authoring exact pre-roll and end trim', async () => {
    await withEngine(async (engine) => {
      const input = await fixture('opus.ogg');
      const source = await engine.prepareMuxTracks([input]);
      const sourceTrack = source.tracks[0]!;
      const selected = selectMediabunnyCopyTrimChunks(
        sourceTrack.chunks,
        'audio',
        { startUs: 2_000_000, endUs: 7_000_000 },
        { audioPrerollUs: 1_340_000 },
      );
      const expectedPayloads = selected.map((chunk) => selectionSha256Hex(chunk.data));

      const media = await engine.trim(
        input,
        { startUs: 2_000_000, endUs: 7_000_000 },
        { container: 'ogg', frameAccurate: false },
      );
      expect(inspectTrimAudioContainer(media.bytes, 'ogg')).toMatchObject({
        state: 'OK',
        value: {
          codedSampleFrames: 305_280,
          presentationSampleFrames: 240_000,
          primingSampleFrames: 64_632,
          endTrimSampleFrames: 648,
        },
      });
      const reparsed = await engine.prepareMuxTracks([
        memoryInput('trimmed-opus.ogg', media.bytes, 'audio/ogg'),
      ]);
      expect(reparsed.tracks[0]?.chunks.map((chunk) => selectionSha256Hex(chunk.data)))
        .toEqual(expectedPayloads);
    });
  });

  test('a trim range entirely past EOF is a typed boundary rejection, not engine inapplicability', async () => {
    await withEngine(async (engine) => {
      const input = await fixture('micro_h264_1frame.mp4');
      let thrown: unknown;
      try {
        await engine.trim(
          input,
          { startUs: 40_000_000, endUs: 45_000_000 },
          { container: 'mp4', frameAccurate: false },
        );
      } catch (error) {
        thrown = error;
      }
      expect(isMalformedInputError(thrown)).toBe(true);
      expect(thrown).toMatchObject({ reasonCode: 'MEDIABUNNY_TRIM_RANGE_OUTSIDE_MEDIA_REJECTED' });
      expect(isNotApplicableError(thrown)).toBe(false);
    });
  });

  test('copy selection remains stack-safe at the 216k-frame massive rung', () => {
    const payload = new Uint8Array([1]);
    const chunks: EncodedTracks['tracks'][number]['chunks'] = Array.from(
      { length: 216_000 },
      (_, index) => ({
        data: payload,
        ptsUs: Math.round(index * 1_000_000 / 30),
        decodeIndex: index,
        durationUs: Math.round(1_000_000 / 30),
        keyframe: index % 60 === 0,
      }),
    );
    const selected = selectMediabunnyCopyTrimChunks(
      chunks,
      'video',
      { startUs: 3_600_000_000, endUs: 3_660_000_000 },
    );
    expect(selected.length).toBeGreaterThan(1_700);
    expect(selected[0]).toMatchObject({ keyframe: true, decodeIndex: 0 });
    expect(selected.at(-1)!.ptsUs).toBeLessThan(3_660_000_000);
  });

  test('B-frame, VFR, and multitrack MP4 round trips retain content, cadence, and every track', async () => {
    await withEngine(async (engine) => {
      for (const entry of [
        { name: 'h264_bframes_1080p.mp4', cadence: 'CFR', trackCount: 2, reordered: true },
        { name: 'h264_vfr.mp4', cadence: 'VFR', trackCount: 2, reordered: true },
        { name: 'h264_multitrack.mp4', cadence: 'CFR', trackCount: 3, reordered: false },
      ] as const) {
        const input = await fixture(entry.name);
        const before = await engine.demux(input);
        const media = await engine.remux(input, { container: 'mp4' });
        const after = await engine.demux(memoryInput(`roundtrip-${entry.name}`, media.bytes));

        expect(before.metadata.tracks).toHaveLength(entry.trackCount);
        expect(trackMultiset(after)).toEqual(trackMultiset(before));
        expect(packetEssence(after)).toEqual(packetEssence(before));
        expect(before.metadata.tracks[0]?.fpsProvenance?.cadence).toBe(entry.cadence);
        expect(after.metadata.tracks[0]?.fpsProvenance?.cadence).toBe(entry.cadence);
        expect(after.packets.every((packet) => packet.dtsUs === undefined)).toBe(true);
        if (entry.reordered) {
          expect(ptsRegressions(before)).toBeGreaterThan(0);
          expect(ptsRegressions(after)).toBeGreaterThan(0);
        }
      }
    });
  });

  test('a tuple that would require transcode/discard is typed NA_ENGINE before any fallback', async () => {
    await withEngine(async (engine) => {
      await expect(engine.remux(await fixture('micro_h264_1frame.mp4'), { container: 'webm' }))
        .rejects.toMatchObject({
          name: 'NotApplicableError',
          reasonCode: MEDIABUNNY_REASON.CONTAINER_CODEC,
        });
    });
  });

  test('mux rejects zero/unsupported tracks, presentation-order arrays, and missing H.264 config', async () => {
    await withEngine(async (engine) => {
      await expect(engine.mux({ tracks: [] }, { container: 'mp4' })).rejects.toMatchObject({
        reasonCode: MEDIABUNNY_REASON.TRACK_COUNT,
      });
      await expect(engine.mux({
        tracks: [{ type: 'subtitle', codec: 'webvtt', timescale: 1_000, chunks: [] }],
      }, { container: 'mkv' })).rejects.toMatchObject({ reasonCode: MEDIABUNNY_REASON.TRACK_TYPE });

      const missingConfig: EncodedTracks = {
        tracks: [{
          type: 'video',
          codec: 'h264',
          nativeCodecTag: 'avc1.64001f',
          timescale: 90_000,
          packetOrdering: 'decode',
          framing: 'avc',
          parameterSetLocation: 'description',
          accessUnitGrouping: 'one-access-unit-per-chunk',
          chunks: [{ data: new Uint8Array([0, 0, 0, 1]), ptsUs: 0, decodeIndex: 0, durationUs: 33_333, keyframe: true }],
        }],
      };
      await expect(engine.mux(missingConfig, { container: 'mp4' })).rejects.toMatchObject({
        reasonCode: 'MEDIABUNNY_CODEC_CONFIG_REQUIRED',
      });

      const presentationOrder: EncodedTracks = {
        tracks: [{
          ...missingConfig.tracks[0]!,
          packetOrdering: 'presentation',
          description: new Uint8Array([1, 100, 0, 31, 0xff]),
          descriptionRecord: 'avc-decoder-configuration-record',
        }],
      };
      await expect(engine.mux(presentationOrder, { container: 'mp4' })).rejects.toMatchObject({
        reasonCode: MEDIABUNNY_REASON.COPY_REQUIRED,
      });
    });
  });
});

describe('REQ-ENG-05: protected-form and metadata correctness', () => {
  test('probe exposes Mediabunny track disposition through normalized metadata', async () => {
    await withEngine(async (engine) => {
      const metadata = await engine.probe(await fixture('recorder_headerless.webm'));
      expect(metadata.tracks).toHaveLength(1);
      expect(metadata.tracks[0]).toMatchObject({
        type: 'video',
        defaultDisposition: true,
        disposition: { default: true },
      });
    });
  });

  test('CENC-CBCS probe surfaces neutral protection evidence through normalized metadata', async () => {
    await withEngine(async (engine) => {
      const metadata = await engine.probe(await fixture('cenc_cbcs.mp4'));
      expect((metadata as typeof metadata & { protectionScheme?: string }).protectionScheme).toBe('cbcs');
    });
  });

  test('fragmented CENC-CTR scenario probe surfaces neutral protection evidence', async () => {
    await withEngine(async (engine) => {
      const metadata = await engine.probe(await fixture('scenarios/probe/cenc_ctr/01.mp4'));
      expect((metadata as typeof metadata & { protectionScheme?: string }).protectionScheme).toBe('cenc');
    });
  });

  test('an empty PCM container truthfully reports its zero-sample duration', async () => {
    await withEngine(async (engine) => {
      const metadata = await engine.probe(await fixture('empty_audio.wav'));
      expect(metadata.durationSec).toBe(0);
      expect(metadata.tracks).toHaveLength(1);
      expect(metadata.tracks[0]).toMatchObject({ type: 'audio', codec: 'pcm-s16' });
    });
  });

  test('metadata edits round-trip and preserve unrelated normalized tags across a second edit', async () => {
    await withEngine(async (engine) => {
      const input = await fixture('micro_h264_1frame.mp4');
      const titled = await engine.remux(input, { container: 'mp4', tags: { title: 'Mediabunny proof' } });
      const commented = await engine.remux(memoryInput('titled.mp4', titled.bytes), {
        container: 'mp4',
        tags: { comment: 'second edit' },
      });
      const metadata = await engine.probe(memoryInput('commented.mp4', commented.bytes));
      expect(metadata.tags).toMatchObject({ title: 'Mediabunny proof', comment: 'second edit' });

      await expect(engine.remux(input, { container: 'mp4', tags: { unsupportedPrivateKey: 'x' } }))
        .rejects.toMatchObject({ reasonCode: MEDIABUNNY_REASON.METADATA_FORMAT });
      await expect(engine.remux(input, { container: 'mp4', tags: { title: 42 } }))
        .rejects.toBeInstanceOf(TypeError);
    });
  });

  test('an MKV comment edit replaces a pre-existing DESCRIPTION alias', async () => {
    await withEngine(async (engine) => {
      const input = await fixture('scenarios/metadata/write_mkv_tags/01.mkv');
      const comment = 'replacement comment';
      const output = await engine.remux(input, { container: 'mkv', tags: { comment } });
      const read = readNeutralMetadataTags(output.bytes, 'mkv');
      expect(read.state).toBe('OK');
      if (read.state !== 'OK') return;
      const canonical = canonicalizeSemanticTags('mkv', read.value.tags, read.value.scopedTags);
      expect(canonical.conflicts).toEqual([]);
      expect(canonical.semantic.comment).toBe(comment);
    });
  });

  test('the single-key CENC resolver never reuses a key for a different KID', () => {
    const key = new Uint8Array(16).fill(0x5a);
    const kid = 'abcdef00112233445566778899aabbcc';
    const resolved: string[] = [];
    const resolver = createCencKeyResolver(key, kid, (keyId) => resolved.push(keyId));
    expect(resolver({ keyId: kid })).toBe(key);
    expect(resolved).toEqual([kid]);
    let wrong: unknown;
    try {
      resolver({ keyId: '00000000000000000000000000000000' });
    } catch (error) {
      wrong = error;
    }
    expect(wrong).toBeInstanceOf(Error);
    expect(isNotApplicableError(wrong)).toBe(false);
  });

  test('CENC-CBCS never reports ciphertext packet-copy as successful decryption', async () => {
    await withEngine(async (engine) => {
      const input = await fixture('cenc_cbcs.mp4');
      const keyRecord = JSON.parse(
        await readFile(new URL('cenc_cbcs.mp4.keys.json', new URL('../fixtures/golden/', import.meta.url)), 'utf8'),
      ) as { keyHex: string; kid?: string };

      await expect(engine.decrypt(input, {
        keyHex: keyRecord.keyHex,
        ...(keyRecord.kid ? { kid: keyRecord.kid } : {}),
      }, { scheme: 'cenc-cbcs' })).rejects.toMatchObject({
        name: 'NotApplicableError',
        reasonCode: MEDIABUNNY_REASON.PROTECTION_FORM,
      });
    });
  });

  test('CENC-CTR assertion form is safely NA_ENGINE while malformed keys remain input errors', async () => {
    await withEngine(async (engine) => {
      const input = await fixture('micro_h264_1frame.mp4');
      await expect(engine.decrypt(input, {
        kid: '11223344556677889900aabbccddeeff',
        keyHex: '00112233445566778899aabbccddeeff',
      }, { scheme: 'cenc-ctr' })).rejects.toMatchObject({
        name: 'NotApplicableError',
        reasonCode: MEDIABUNNY_REASON.PROTECTION_FORM,
      });
      await expect(engine.decrypt(input, { keyHex: 'not-hex' }, { scheme: 'cenc-ctr' }))
        .rejects.toBeInstanceOf(TypeError);
      let missingKey: unknown;
      try {
        await engine.decrypt(input, { keyHex: '' }, { scheme: 'cenc-ctr' });
      } catch (error) {
        missingKey = error;
      }
      expect(isMalformedInputError(missingKey)).toBe(true);
      expect(missingKey).toMatchObject({ reasonCode: 'MEDIABUNNY_DECRYPT_KEY_MISSING' });
    });
  });

  test('HLS key URI/IV parsing is exact and a wrong supplied IV remains a data error', async () => {
    const playlistBytes = new Uint8Array(await readFile(new URL('hls_aes128.m3u8', MEDIA_ROOT)));
    const playlist = new TextDecoder().decode(playlistBytes);
    expect(hlsKeyUrisFromPlaylist(playlist, 'https://media.test/path/hls_aes128.m3u8')).toEqual(
      new Set(['https://media.test/path/hls_aes128.key']),
    );
    expect(hlsExplicitIvHexesFromPlaylist(playlist)).toEqual(
      new Set(['c0643a1737869dcf50b7d5daa37b466b']),
    );
    expect(hlsKeyMethodsFromPlaylist(playlist)).toEqual(new Set(['AES-128']));

    await withEngine(async (engine) => {
      const input = memoryInput('hls_aes128.m3u8', playlistBytes, 'application/vnd.apple.mpegurl');
      input.url = 'https://media.test/path/hls_aes128.m3u8';
      let wrongIv: unknown;
      try {
        await engine.decrypt(input, {
          keyHex: '26cc7945163ec2b0c6c1bf651431a683',
          ivHex: '00000000000000000000000000000000',
        }, { scheme: 'hls-aes128' });
      } catch (error) {
        wrongIv = error;
      }
      expect(isMalformedInputError(wrongIv)).toBe(true);
      expect(wrongIv).toMatchObject({ reasonCode: 'MEDIABUNNY_HLS_IV_MISMATCH' });
    });
  });

  test('HLS AES-128 rejects SAMPLE-AES before framework parsing and identifies key rotation', async () => {
    const sampleAesBytes = new Uint8Array(await readFile(new URL('hls_sample_aes.m3u8', MEDIA_ROOT)));
    const sampleAes = new TextDecoder().decode(sampleAesBytes);
    expect(hlsKeyMethodsFromPlaylist(sampleAes)).toEqual(new Set(['SAMPLE-AES']));

    await withEngine(async (engine) => {
      const input = memoryInput('hls_sample_aes.m3u8', sampleAesBytes, 'application/vnd.apple.mpegurl');
      let methodMismatch: unknown;
      try {
        await engine.decrypt(input, {
          keyHex: '000102030405060708090a0b0c0d0e0f',
        }, { scheme: 'hls-aes128' });
      } catch (error) {
        methodMismatch = error;
      }
      expect(isMalformedInputError(methodMismatch)).toBe(true);
      expect(methodMismatch).toMatchObject({ reasonCode: 'MEDIABUNNY_HLS_METHOD_MISMATCH' });
    });

    const rotationBytes = new Uint8Array(await readFile(new URL('hls_aes128_rotation.m3u8', MEDIA_ROOT)));
    const rotation = new TextDecoder().decode(rotationBytes);
    expect(hlsKeyUrisFromPlaylist(rotation, 'https://media.test/path/hls_aes128_rotation.m3u8').size).toBe(2);
  });
});
