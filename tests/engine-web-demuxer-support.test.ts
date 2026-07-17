import { describe, expect, test } from 'bun:test';

import {
  CONCRETE_OPERATION_PROTOCOL,
  type ConcreteOperationRequest,
  type NormalizedTrack,
} from '../src/core/engine.ts';
import { WebDemuxerEngine } from '../src/engines/web-demuxer/adapter.ts';
import {
  decideWebDemuxerSupport,
  WEB_DEMUXER_REASON,
  webDemuxerTupleSummary,
} from '../src/engines/web-demuxer/support.ts';

const video = (codec: string): NormalizedTrack => ({
  type: 'video', codec, width: 1920, height: 1080, bitrate: null, language: null,
});
const audio = (codec: string): NormalizedTrack => ({
  type: 'audio', codec, sampleRate: 48_000, channels: 2, bitrate: null, language: null,
});

describe('REQ-ENG-26: web-demuxer operation-scoped tuple support', () => {
  test('pins the scored identity, full WASM artifact, and operation-scoped discovery surface', () => {
    const engine = new WebDemuxerEngine();
    expect(engine.id).toBe('web-demuxer@4.0.0');
    expect(engine.configUsed).toMatchObject({
      package: 'web-demuxer@4.0.0',
      lockIntegrity: 'sha512-QFsKe8SNjP6MDtAw2lWfyVmX2wXIpDUT+9p2KHXJb5OPWdhVbjBHcV06tDMXzuU1T6Y1P9TRm9bkeVXEwy0dVw==',
      wasmExport: 'web-demuxer/wasm',
      wasmFlavor: 'full',
      wasmUrlPolicy: 'same-origin',
      readinessBoundary: 'init-load-barrier',
    });
    const capabilities = engine.capabilities();
    expect(capabilities.operations).toEqual({ probe: true, demux: true, seek: true, decodeFrames: true });
    expect(capabilities.features).not.toContain('webcodecs:independent');
    expect(capabilities.containersOut).toEqual([]);
  });

  test('keeps HEVC/AV1 parser cells runnable without making a flat browser claim', () => {
    for (const codec of ['hevc', 'av1']) {
      for (const operation of ['probe', 'demux', 'decodeFrames', 'seek'] as const) {
        expect(decideWebDemuxerSupport(request(operation, 'mp4', [video(codec)])), `${operation}/${codec}`)
          .toEqual({ supported: true });
      }
    }
  });

  test('admits one positive parser tuple for every declared container and codec family', () => {
    const rows: Array<[string, NormalizedTrack[]]> = [
      ['mp4', [video('h264'), audio('aac')]],
      ['mov', [video('hevc'), audio('aac')]],
      ['mkv', [video('h264'), audio('flac')]],
      ['webm', [video('vp9'), audio('opus')]],
      ['ts', [video('h264'), audio('aac')]],
    ];
    for (const [container, tracks] of rows) {
      expect(decideWebDemuxerSupport(request('probe', container, tracks)), container)
        .toEqual({ supported: true });
    }
  });

  test('separates TS probe from every packet-backed operation with one stable reason', () => {
    const tracks = [video('h264'), audio('aac')];
    expect(decideWebDemuxerSupport(request('probe', 'ts', tracks))).toEqual({ supported: true });
    for (const operation of ['demux', 'decodeFrames', 'seek'] as const) {
      expect(decideWebDemuxerSupport(request(operation, 'ts', tracks))).toMatchObject({
        supported: false,
        status: 'NA_ENGINE',
        reasonCode: WEB_DEMUXER_REASON.TS_PACKETS,
      });
    }
  });

  test('decides selected-track, protection, data-track, and invalid cross-product misses', () => {
    expect(reason(request('decodeFrames', 'mp4', [audio('aac')]))).toBe(WEB_DEMUXER_REASON.VIDEO_REQUIRED);
    expect(reason(request('seek', 'mp4', [video('h264'), audio('aac')], {
      options: { videoTrackIndex: 1 },
    }))).toBe(WEB_DEMUXER_REASON.TRACK_SELECTION);
    expect(reason(request('demux', 'mp4', [video('h264'), { type: 'other', codec: 'bin' }])))
      .toBe(WEB_DEMUXER_REASON.TRACK_TYPE);
    expect(reason(request('probe', 'webm', [video('h264')]))).toBe(WEB_DEMUXER_REASON.CONTAINER_CODEC);
    expect(reason(request('probe', 'avi', [video('h264')]))).toBe(WEB_DEMUXER_REASON.CONTAINER);

    const protectedProbe = request('probe', 'mp4', [video('h264')], { encryption: 'cenc-ctr' });
    expect(decideWebDemuxerSupport(protectedProbe)).toEqual({ supported: true });
    for (const operation of ['demux', 'decodeFrames', 'seek'] as const) {
      expect(reason(request(operation, 'mp4', [video('h264')], { encryption: 'cenc-ctr' })))
        .toBe(WEB_DEMUXER_REASON.PROTECTION);
    }
  });

  test('never launders declared-container robustness mutations into NA_ENGINE', () => {
    const malformed = request('decodeFrames', 'ts', [{ type: 'other', codec: 'corrupt' }], {
      mutated: true,
      encryption: 'cenc-cbcs',
      options: { videoTrackIndex: 99 },
    });
    expect(decideWebDemuxerSupport(malformed)).toEqual({ supported: true });
  });

  test('retains the concrete tuple evidence used by typed runtime errors', () => {
    const concrete = request('seek', 'mp4', [video('h264'), audio('aac')], {
      options: { videoTrackIndex: 0 },
      timingMode: 'vfr',
    });
    expect(webDemuxerTupleSummary(concrete)).toEqual({
      inputContainers: ['mp4'],
      inputCodecs: ['h264', 'aac'],
      outputCodecs: [],
      dimensions: [{ width: 1920, height: 1080 }],
      sampleRates: [48_000],
      channels: [2],
      timingMode: 'vfr',
    });
  });
});

function reason(value: ConcreteOperationRequest): string | undefined {
  const decision = decideWebDemuxerSupport(value);
  return decision.supported ? undefined : decision.reasonCode;
}

function request(
  operation: ConcreteOperationRequest['operation'],
  container: string,
  tracks: NormalizedTrack[],
  overrides: {
    mutated?: boolean;
    encryption?: ConcreteOperationRequest['encryption'];
    options?: Record<string, unknown>;
    timingMode?: string;
  } = {},
): ConcreteOperationRequest {
  return {
    protocol: CONCRETE_OPERATION_PROTOCOL,
    scenarioId: `web-demuxer-test/${operation}`,
    operation,
    inputs: [{
      id: `fixture.${container}`,
      mime: 'application/octet-stream',
      container,
      mutated: overrides.mutated ?? false,
      tracks,
      sizeBytes: 1024,
    }],
    ...(overrides.encryption ? { encryption: overrides.encryption } : {}),
    ...(overrides.timingMode ? { timingMode: overrides.timingMode } : {}),
    options: overrides.options ?? {},
  };
}
