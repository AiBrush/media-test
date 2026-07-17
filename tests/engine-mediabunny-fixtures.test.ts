import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';

import {
  isNotApplicableError,
  type DemuxResult,
  type EncodedTracks,
  type MediaInput,
} from '../src/core/engine.ts';
import {
  MediabunnyEngine,
  createCencKeyResolver,
  hlsExplicitIvHexesFromPlaylist,
  hlsKeyUrisFromPlaylist,
  representationForCodec,
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

function ptsRegressions(result: DemuxResult, trackIndex = 0): number {
  const pts = result.packets.filter((packet) => packet.trackIndex === trackIndex).map((packet) => packet.ptsUs);
  let count = 0;
  for (let index = 1; index < pts.length; index++) if (pts[index]! < pts[index - 1]!) count++;
  return count;
}

describe('REQ-ENG-03: explicit packet representation and timing evidence', () => {
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
});

describe('REQ-ENG-02/04: strict packet-copy remux and mux contract', () => {
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

    await withEngine(async (engine) => {
      const input = memoryInput('hls_aes128.m3u8', playlistBytes, 'application/vnd.apple.mpegurl');
      input.url = 'https://media.test/path/hls_aes128.m3u8';
      await expect(engine.decrypt(input, {
        keyHex: '26cc7945163ec2b0c6c1bf651431a683',
        ivHex: '00000000000000000000000000000000',
      }, { scheme: 'hls-aes128' })).rejects.toBeInstanceOf(Error);
    });
  });
});
