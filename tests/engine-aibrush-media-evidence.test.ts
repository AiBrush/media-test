import { describe, expect, test } from 'bun:test';
import type { NormalizedMetadata } from '../src/core/engine.ts';
import { enrichAibrushProbeMetadata } from '../src/engines/aibrush-media/adapter.ts';
import {
  buildAibrushDemuxResult,
  normalizeAibrushTrack,
  representationForAibrushTrack,
} from '../src/engines/aibrush-media/representation.ts';

describe('REQ-ENG-33: aibrush-media representation-aware packet evidence', () => {
  test('enriches probe metadata from selected bytes without inventing container facts', async () => {
    const mp4 = new Uint8Array(await Bun.file('fixtures/media/h264_1080p_30s.mp4').arrayBuffer());
    const branded = enrichAibrushProbeMetadata({
      container: 'mp4', durationSec: 30,
      tracks: [{ type: 'video', codec: 'h264' }, { type: 'audio', codec: 'aac' }],
    }, mp4);
    expect(branded.tags?.major_brand).toBe('isom');
    expect(branded.tracks.map((track) => track.language)).toEqual(['und', 'und']);

    const protectedBytes = new Uint8Array(await Bun.file('fixtures/media/cenc_cbcs.mp4').arrayBuffer());
    const protectedMetadata = enrichAibrushProbeMetadata({
      container: 'mp4', durationSec: 5,
      tracks: [{ type: 'video', codec: 'h264' }],
    }, protectedBytes) as NormalizedMetadata & { protectionScheme?: string };
    expect(protectedMetadata.protectionScheme).toBe('cbcs');
    expect(protectedMetadata.tracks[0]?.defaultDisposition).toBe(true);

    const rotatedBytes = new Uint8Array(await Bun.file('fixtures/media/h264_rotated90.mp4').arrayBuffer());
    const rotated = enrichAibrushProbeMetadata({
      container: 'mp4', durationSec: 10,
      tracks: [{ type: 'video', codec: 'h264', rotation: 270 }, { type: 'audio', codec: 'aac' }],
    }, rotatedBytes);
    expect(rotated.tracks[0]?.rotation).toBe(90);

    const pcm = enrichAibrushProbeMetadata({
      container: 'wav', durationSec: 1,
      tracks: [{ type: 'audio', codec: 'pcm-s16', sampleRate: 44_100, channels: 2, bitrate: null }],
    }, new Uint8Array());
    expect(pcm.tracks[0]?.bitrate).toBe(1_411_200);
  });

  test('retains AVC description/framing, semantic payload, and absent DTS without synthesis', () => {
    const description = new Uint8Array([1, 100, 0, 40, 0xff, 0xe1]);
    const track = {
      id: 7,
      mediaType: 'video' as const,
      codec: 'avc1.640028',
      config: { codec: 'avc1.640028', codedWidth: 1_920, codedHeight: 1_080, description },
    };
    const metadata: NormalizedMetadata = { container: 'mp4', durationSec: 1, tracks: [normalizeAibrushTrack(track)] };
    const result = buildAibrushDemuxResult(metadata, [track], [
      { trackIndex: 0, size: 4, ptsUs: 0, durationUs: 40_000, keyframe: true, payload: new Uint8Array([1, 2, 3, 4]) },
      { trackIndex: 0, size: 3, ptsUs: 40_000, durationUs: 40_000, keyframe: false, payload: new Uint8Array([5, 6, 7]) },
    ]);

    expect(result.packetOrdering).toBe('presentation');
    expect(result.representations?.[0]).toMatchObject({
      packetOrdering: 'presentation',
      framing: 'avc',
      parameterSetLocation: 'description',
      descriptionRecord: 'avc-decoder-configuration-record',
      nativeCodecTag: 'avc1.640028',
    });
    expect(result.packets[0]).toMatchObject({
      trackType: 'video', codec: 'h264', framing: 'avc', randomAccessKind: 'sync-sample',
      payload: new Uint8Array([1, 2, 3, 4]),
    });
    expect(result.packets[0]?.dtsUs).toBeUndefined();
    expect(result.metadata.tracks[0]).toMatchObject({
      codec: 'h264', nativeCodecTag: 'avc1.640028', fps: 25,
      fpsProvenance: { source: 'observed', cadence: 'CFR', sampleCount: 2, observedIntervalUs: 80_000 },
    });
  });

  test('distinguishes HEVC in-band parameter sets and exposes VFR cadence envelope', () => {
    const track = { id: 1, mediaType: 'video' as const, codec: 'hev1.1.6.L93.B0', config: { codec: 'hev1.1.6.L93.B0' } };
    expect(representationForAibrushTrack(track, 0, 'decode')).toMatchObject({
      framing: 'annexb', parameterSetLocation: 'in-band', packetOrdering: 'decode',
    });
    const result = buildAibrushDemuxResult(
      { container: 'mkv', durationSec: 0.12, tracks: [normalizeAibrushTrack(track)] },
      [track],
      [
        { trackIndex: 0, size: 1, ptsUs: 0, dtsUs: 0, durationUs: 20_000, keyframe: true },
        { trackIndex: 0, size: 1, ptsUs: 20_000, dtsUs: 10_000, durationUs: 60_000, keyframe: false },
        { trackIndex: 0, size: 1, ptsUs: 80_000, dtsUs: 20_000, durationUs: 40_000, keyframe: false },
      ],
    );
    expect(result.packetOrdering).toBe('decode');
    expect(result.metadata.tracks[0]?.fpsProvenance).toMatchObject({
      source: 'observed', cadence: 'VFR', sampleCount: 3,
      envelope: { minFps: 1_000_000 / 60_000, maxFps: 50 },
    });
  });

  test('keeps HE-AAC/PS native evidence and observed channel count without fabricating reconstruction', () => {
    const audio = normalizeAibrushTrack({
      id: 2,
      mediaType: 'audio',
      codec: 'mp4a.40.29',
      config: { codec: 'mp4a.40.29', sampleRate: 24_000, numberOfChannels: 1, description: new Uint8Array([0x2b, 0x92]) },
    });
    expect(audio).toMatchObject({ codec: 'aac', nativeCodecTag: 'mp4a.40.29', sampleRate: 24_000, channels: 1 });
    expect(representationForAibrushTrack({
      id: 2, mediaType: 'audio', codec: 'mp4a.40.29', config: { description: new Uint8Array([0x2b, 0x92]) },
    }, 1, 'presentation')).toMatchObject({
      trackIndex: 1, framing: 'raw', descriptionRecord: 'audio-specific-config', parameterSetLocation: 'description',
    });
  });

  test('preserves same-type track ordering by explicit trackIndex rather than codec sorting', () => {
    const first = { id: 1, mediaType: 'audio' as const, codec: 'opus', config: { sampleRate: 48_000, numberOfChannels: 2 } };
    const second = { id: 2, mediaType: 'audio' as const, codec: 'aac', config: { sampleRate: 44_100, numberOfChannels: 1 } };
    const result = buildAibrushDemuxResult(
      { container: 'mkv', durationSec: 1, tracks: [normalizeAibrushTrack(first), normalizeAibrushTrack(second)] },
      [first, second],
      [
        { trackIndex: 1, size: 2, ptsUs: 0, keyframe: true },
        { trackIndex: 0, size: 2, ptsUs: 0, keyframe: true },
      ],
    );
    expect(result.metadata.tracks.map((track) => track.codec)).toEqual(['opus', 'aac']);
    expect(result.packets.map((packet) => [packet.trackIndex, packet.codec])).toEqual([[1, 'aac'], [0, 'opus']]);
  });
});
