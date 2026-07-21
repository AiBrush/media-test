import { describe, expect, test } from 'bun:test';
import {
  CONCRETE_OPERATION_PROTOCOL,
  type CapabilitySet,
  type ConcreteOperationRequest,
  type NormalizedTrack,
} from '../src/core/engine.ts';
import {
  DEFAULT_FFMPEG_LIMITS,
  decideFfmpegSupport,
  muxLegality,
  tupleSummary,
  type FfmpegRuntimeBuild,
} from '../src/engines/ffmpeg-wasm/support.ts';

const VIDEO = ['h264', 'hevc', 'vp8', 'vp9'];
const AUDIO = ['aac', 'opus', 'mp3', 'flac', 'vorbis', 'pcm-s16', 'pcm-s24', 'pcm-f32', 'pcm-s16be', 'pcm-s24be'];
const IN = ['mp4', 'mov', 'mkv', 'webm', 'ts', 'hls', 'wav', 'mp3', 'flac', 'ogg', 'adts', 'aiff', 'caf'];
const OUT = IN.filter((container) => container !== 'hls');

const CAPS: CapabilitySet = {
  operations: {
    probe: true,
    demux: true,
    remux: true,
    transcode: true,
    decodeFrames: true,
    seek: true,
    trim: true,
    mux: true,
    decrypt: true,
  },
  containersIn: IN,
  containersOut: OUT,
  videoCodecs: VIDEO,
  audioCodecs: AUDIO,
  videoCodecsIn: VIDEO,
  audioCodecsIn: AUDIO,
  videoCodecsOut: VIDEO,
  audioCodecsOut: AUDIO.filter((codec) => codec !== 'opus'),
  encryption: ['cenc-ctr', 'hls-aes128'],
  features: ['resize', 'two-pass', 'fragmented'],
};

const RUNTIME: FfmpegRuntimeBuild = {
  verified: true,
  capabilities: CAPS,
  encoders: new Set(['libx264', 'libx265', 'libvpx', 'libvpx-vp9', 'aac', 'libmp3lame', 'flac', 'libvorbis']),
  decoders: new Set(['h264', 'hevc', 'vp8', 'vp9', 'aac', 'opus', 'mp3', 'flac', 'vorbis']),
  muxers: new Set(OUT),
  demuxers: new Set(IN),
  filters: new Set(['scale', 'crop', 'pad', 'hflip', 'colorspace', 'tonemap']),
};

describe('REQ-ENG-13: ffmpeg tuple capability', () => {
  test('marks the static fallback unverified while retaining explicit runtime facts', () => {
    const fallback: FfmpegRuntimeBuild = { ...RUNTIME, verified: false };
    expect(fallback.verified).toBe(false);
    expect(RUNTIME.verified).toBe(true);
    expect(RUNTIME.encoders.has('libx264')).toBe(true);
    expect(RUNTIME.filters.has('scale')).toBe(true);
  });

  test('admits a positive smoke tuple for every advertised input container', () => {
    const tracksByContainer: Record<string, NormalizedTrack[]> = {
      mp4: av('h264', 'aac'), mov: av('h264', 'aac'), mkv: av('h264', 'aac'),
      webm: av('vp9', 'opus'), ts: av('h264', 'aac'), hls: av('h264', 'aac'),
      wav: [audio('pcm-s16')], mp3: [audio('mp3')], flac: [audio('flac')],
      ogg: [audio('opus')], adts: [audio('aac')], aiff: [audio('pcm-s16be')], caf: [audio('pcm-f32')],
    };
    for (const container of CAPS.containersIn) {
      const decision = decideFfmpegSupport(request('probe', container, tracksByContainer[container]!), RUNTIME);
      expect(decision, container).toEqual({ supported: true });
    }
  });

  test('admits a legal positive smoke tuple for every advertised output container', () => {
    const outputByContainer: Record<string, { tracks: NormalizedTrack[]; videoCodec?: string; audioCodec?: string }> = {
      mp4: { tracks: av('h264', 'aac'), videoCodec: 'h264', audioCodec: 'aac' },
      mov: { tracks: av('h264', 'aac'), videoCodec: 'h264', audioCodec: 'aac' },
      mkv: { tracks: av('h264', 'aac'), videoCodec: 'h264', audioCodec: 'aac' },
      webm: { tracks: av('vp9', 'vorbis'), videoCodec: 'vp9', audioCodec: 'vorbis' },
      ts: { tracks: av('h264', 'aac'), videoCodec: 'h264', audioCodec: 'aac' },
      wav: { tracks: [audio('pcm-s16')], audioCodec: 'pcm-s16' },
      mp3: { tracks: [audio('mp3')], audioCodec: 'mp3' },
      flac: { tracks: [audio('flac')], audioCodec: 'flac' },
      ogg: { tracks: [audio('vorbis')], audioCodec: 'vorbis' },
      adts: { tracks: [audio('aac')], audioCodec: 'aac' },
      aiff: { tracks: [audio('pcm-s16be')], audioCodec: 'pcm-s16be' },
      caf: { tracks: [audio('pcm-f32')], audioCodec: 'pcm-f32' },
    };
    for (const container of CAPS.containersOut) {
      const row = outputByContainer[container]!;
      const decision = decideFfmpegSupport(
        request('transcode', sourceContainer(row.tracks), row.tracks, {
          output: {
            container,
            ...(row.videoCodec ? { videoCodec: row.videoCodec } : {}),
            ...(row.audioCodec ? { audioCodec: row.audioCodec } : {}),
          },
          options: {
            ...(row.videoCodec ? { video: { codec: row.videoCodec } } : {}),
            ...(row.audioCodec ? { audio: { codec: row.audioCodec } } : {}),
          },
        }),
        RUNTIME,
      );
      expect(decision, container).toEqual({ supported: true });
    }
  });

  test('rejects negative container/codec tuples with stable reason codes', () => {
    expect(reason(request('probe', 'gif', [video('h264')]))).toBe('FFMPEG_INPUT_CONTAINER_UNAVAILABLE');
    expect(reason(request('probe', 'mp4', [video('av1')]))).toBe('FFMPEG_VIDEO_DECODER_UNAVAILABLE');
    expect(reason(request('probe', 'mp4', [audio('ac3')]))).toBe('FFMPEG_AUDIO_DECODER_UNAVAILABLE');
    expect(reason(request('transcode', 'mp4', av('h264', 'aac'), {
      output: { container: 'gif', videoCodec: 'h264' },
    }))).toBe('FFMPEG_OUTPUT_CONTAINER_UNAVAILABLE');
    expect(reason(request('transcode', 'mp4', av('h264', 'aac'), {
      output: { container: 'mp4', videoCodec: 'av1', audioCodec: 'aac' },
    }))).toBe('FFMPEG_VIDEO_ENCODER_UNAVAILABLE');
  });

  test('classifies the enumerated budget/alpha/two-pass/mux/decrypt misses as NA_ENGINE', () => {
    const rows: Array<[string, ConcreteOperationRequest, string]> = [
      ['H.264→HEVC', request('transcode', 'mp4', av('h264', 'aac'), {
        id: 'h264_1080p_30s.mp4', output: { container: 'mp4', videoCodec: 'hevc', audioCodec: 'aac' },
      }), 'FFMPEG_HEVC_ENCODE_SUITE_BUDGET'],
      ['AV1→H.264', request('transcode', 'mp4', av('av1', 'aac'), {
        output: { container: 'mp4', videoCodec: 'h264', audioCodec: 'aac' },
      }), 'FFMPEG_VIDEO_DECODER_UNAVAILABLE'],
      ['resize', request('transcode', 'mp4', av('h264', 'aac'), {
        output: { container: 'mp4', videoCodec: 'h264', width: 3840, height: 2160 },
      }), 'FFMPEG_RESIZE_PIXEL_BUDGET'],
      ['alpha', request('transcode', 'webm', av('vp9', 'vorbis'), {
        output: { container: 'webm', videoCodec: 'vp9', audioCodec: 'vorbis' },
        options: { alpha: 'keep' },
      }), 'FFMPEG_ALPHA_TUPLE_UNSUPPORTED'],
      ['two-pass', request('transcode', 'webm', av('vp9', 'vorbis'), {
        output: { container: 'webm', videoCodec: 'vp9', audioCodec: 'vorbis' },
        options: { video: { codec: 'vp9', bitrate: 1_000_000, passes: 2 } },
      }), 'FFMPEG_TWO_PASS_CODEC_UNSUPPORTED'],
      ['mux legality', request('mux', 'mp4', av('h264', 'aac'), {
        output: { container: 'webm' },
      }), 'FFMPEG_MUX_TUPLE_ILLEGAL'],
      ['decrypt', request('decrypt', 'mp4', av('h264', 'aac'), {
        encryption: 'cenc-cbcs',
      }), 'FFMPEG_DECRYPT_SCHEME_UNSUPPORTED'],
    ];
    for (const [name, tuple, expected] of rows) expect(reason(tuple), name).toBe(expected);
  });

  test('does not launder mutated/invalid bytes into a tuple miss', () => {
    const malformed = request('transcode', 'gif', av('av1', 'ac3'), {
      mutated: true,
      output: { container: 'gif', videoCodec: 'av1', audioCodec: 'ac3' },
    });
    expect(decideFfmpegSupport(malformed, RUNTIME)).toEqual({ supported: true });
  });

  test('declares typed demux scale rows NA when packet-yield latency is unobservable', () => {
    expect(reason(request('demux', 'mp4', av('h264', 'aac'), {
      options: {
        robustness: {
          schema: 'media-test/demux-scale-contract@1',
          bucket: 'large',
          limits: { firstPacketMs: 10_000, lastPacketMs: 600_000 },
        },
      },
    }))).toBe('FFMPEG_DEMUX_SCALE_PACKET_BOUNDARY_UNAVAILABLE');
  });

  test('retains the full rejected tuple summary', () => {
    const tuple = request('transcode', 'mp4', av('h264', 'aac'), {
      output: { container: 'webm', videoCodec: 'vp9', audioCodec: 'vorbis', width: 640, height: 360 },
      timingMode: 'vfr',
    });
    expect(tupleSummary(tuple)).toEqual({
      inputContainers: ['mp4'],
      inputCodecs: ['h264', 'aac'],
      outputContainer: 'webm',
      outputCodecs: ['vp9', 'vorbis'],
      dimensions: [{ width: 1920, height: 1080 }],
      sampleRates: [48_000],
      channels: [2],
      timingMode: 'vfr',
    });
  });
});

describe('REQ-ENG-13 mux legality matrix', () => {
  test('accepts legal representation tuples and rejects negative cross-products', () => {
    expect(muxLegality(av('h264', 'aac'), 'mp4')).toBeUndefined();
    expect(muxLegality(av('vp9', 'opus'), 'webm')).toBeUndefined();
    expect(muxLegality([audio('pcm-s24')], 'wav')).toBeUndefined();
    expect(muxLegality(av('h264', 'aac'), 'webm')).toContain('WebM');
    expect(muxLegality([video('vp9')], 'ts')).toContain('MPEG-TS');
    expect(muxLegality([audio('aac')], 'wav')).toContain('WAV');
  });
});

function request(
  operation: ConcreteOperationRequest['operation'],
  container: string,
  tracks: NormalizedTrack[],
  overrides: {
    id?: string;
    mutated?: boolean;
    output?: ConcreteOperationRequest['output'];
    encryption?: ConcreteOperationRequest['encryption'];
    timingMode?: string;
    options?: Record<string, unknown>;
  } = {},
): ConcreteOperationRequest {
  return {
    protocol: CONCRETE_OPERATION_PROTOCOL,
    scenarioId: `ffmpeg-test/${operation}`,
    operation,
    inputs: [{
      id: overrides.id ?? `fixture.${container}`,
      mime: 'application/octet-stream',
      container,
      mutated: overrides.mutated ?? false,
      tracks,
      sizeBytes: 1_024,
    }],
    ...(overrides.output ? { output: overrides.output } : {}),
    ...(overrides.encryption ? { encryption: overrides.encryption } : {}),
    ...(overrides.timingMode ? { timingMode: overrides.timingMode } : {}),
    options: overrides.options ?? {},
  };
}

function reason(tuple: ConcreteOperationRequest): string {
  const decision = decideFfmpegSupport(tuple, RUNTIME, DEFAULT_FFMPEG_LIMITS);
  expect(decision.supported).toBe(false);
  return decision.supported ? '' : decision.reasonCode;
}

function video(codec: string): NormalizedTrack {
  return { type: 'video', codec, width: 1920, height: 1080, fps: 30, bitrate: null, language: null };
}

function audio(codec: string): NormalizedTrack {
  return { type: 'audio', codec, sampleRate: 48_000, channels: 2, bitrate: null, language: null };
}

function av(videoCodec: string, audioCodec: string): NormalizedTrack[] {
  return [video(videoCodec), audio(audioCodec)];
}

function sourceContainer(tracks: NormalizedTrack[]): string {
  const codec = tracks[0]?.codec;
  if (codec?.startsWith('pcm-')) return 'wav';
  if (codec === 'mp3' || codec === 'flac') return codec;
  if (codec === 'opus' || codec === 'vorbis') return 'ogg';
  return 'mp4';
}
