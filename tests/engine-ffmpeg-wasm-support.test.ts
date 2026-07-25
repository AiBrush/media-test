import { describe, expect, test } from 'bun:test';
import {
  CONCRETE_OPERATION_PROTOCOL,
  type CapabilitySet,
  type ConcreteOperationRequest,
  type NormalizedTrack,
} from '../src/core/engine.ts';
import {
  DEFAULT_FFMPEG_LIMITS,
  FFMPEG_BENCHMARK_LIMITS,
  decideFfmpegRemuxProgramSupport,
  decideFfmpegSupport,
  isFfmpegMalformedDecodeFailure,
  muxLegality,
  tupleSummary,
  type FfmpegRuntimeBuild,
} from '../src/engines/ffmpeg-wasm/support.ts';
import type { RemuxProgramEvidence } from '../src/features/remux/types.ts';

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
  test('bounds adaptive reuse and cross-process memory sampling', () => {
    expect(FFMPEG_BENCHMARK_LIMITS).toEqual({
      maxInnerIterations: 1,
      memoryWindow: {
        sampleImmediatelyDuringOperation: true,
        maxOperationSamples: 1,
        settleWindowMs: 0,
        sampleTimeoutMs: 1_000,
      },
    });
  });

  test('recognizes only the pinned damaged-payload decode signature', () => {
    const measured = new Error(
      'ffmpeg.wasm@0.12.15: ffmpeg exited 69 for [-i op1.in -frames:v 30 -f framehash ' +
      '-hash sha256 op1.framehash.txt]. Log: 1 frames successfully decoded, 131 decoding errors | ' +
      'Conversion failed! | Aborted()',
    );
    expect(isFfmpegMalformedDecodeFailure(measured)).toBe(true);
    expect(isFfmpegMalformedDecodeFailure(new Error('Conversion failed!'))).toBe(false);
    expect(isFfmpegMalformedDecodeFailure(new DOMException('cancelled', 'AbortError'))).toBe(false);
  });

  test('classifies only the measured robustness fragmented-copy contract', () => {
    const measured = request('remux', 'mp4', av('h264', 'aac'), {
      output: { container: 'mp4' },
      options: { container: 'mp4', fragmented: true },
    });
    measured.scenarioId = 'robustness/edge_fragmented_remux';
    expect(reason(measured)).toBe('FFMPEG_ROBUSTNESS_FRAGMENTED_TIMELINE_UNSUPPORTED');

    const sibling = request('remux', 'mp4', av('h264', 'aac'), {
      output: { container: 'mp4' },
      options: { container: 'mp4', fragmented: true },
    });
    sibling.scenarioId = 'robustness/edge_faststart_reserve_remux';
    expect(decideFfmpegSupport(sibling, RUNTIME)).toEqual({ supported: true });
  });

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

  test('keeps exact trim presentation limits concrete and candidate-scoped', () => {
    expect(reason(request('trim', 'mp3', [audio('mp3')], {
      output: { container: 'mp3' },
      options: { invariant: 'trim-audio-content' },
    }))).toBe('FFMPEG_AUDIO_PRESENTATION_TIMING_UNSUPPORTED');
    expect(reason(request('trim', 'mov', av('h264', 'aac'), {
      id: 'scenarios/trim/mov_keyframe_aligned/01.mov',
      output: { container: 'mov' },
    }))).toBe('FFMPEG_COMPLEX_EDIT_PREROLL_UNSUPPORTED');
    const fragmented = request('trim', 'mp4', av('h264', 'aac'), {
      id: 'scenarios/trim/fmp4_fragment_boundary_copy/01.mp4',
      output: { container: 'mp4' },
    });
    fragmented.scenarioId = 'trim/fmp4_fragment_boundary_copy';
    expect(reason(fragmented)).toBe('FFMPEG_FRAGMENTED_COPY_BFRAME_BOUNDARY_UNSUPPORTED');
    const boundaryMisses = [
      ['trim/h264_start_zero_copy', 'scenarios/trim/h264_start_zero_copy/01.mp4'],
      ['trim/h264_start_zero_copy', 'scenarios/trim/h264_start_zero_copy/02.mp4'],
      ['trim/h264_start_zero_copy', 'scenarios/trim/h264_start_zero_copy/03.mp4'],
      ['trim/h264_multitrack_keyframe_aligned', 'scenarios/trim/h264_multitrack_keyframe_aligned/02.mp4'],
      ['trim/large_h264_copy_lazyread', 'scenarios/trim/large_h264_copy_lazyread/01.mp4'],
      ['trim/mov_keyframe_aligned', 'scenarios/trim/mov_keyframe_aligned/03.mov'],
      ['trim/mkv_keyframe_aligned', 'scenarios/trim/mkv_keyframe_aligned/01.mkv'],
      ['trim/mkv_keyframe_aligned', 'scenarios/trim/mkv_keyframe_aligned/02.mkv'],
      ['trim/h264_rotated_keyframe_aligned', 'scenarios/trim/h264_rotated_keyframe_aligned/02.mp4'],
      ['trim/h264_keyframe_aligned', 'scenarios/trim/h264_keyframe_aligned/02.mp4'],
    ] as const;
    for (const [scenarioId, id] of boundaryMisses) {
      const tuple = request('trim', id.endsWith('.mkv') ? 'mkv' : id.endsWith('.mov') ? 'mov' : 'mp4', av('h264', 'aac'), {
        id,
        output: { container: id.endsWith('.mkv') ? 'mkv' : id.endsWith('.mov') ? 'mov' : 'mp4' },
      });
      tuple.scenarioId = scenarioId;
      expect(reason(tuple), `${scenarioId}/${id}`).toBe('FFMPEG_COPY_BFRAME_BOUNDARY_UNSUPPORTED');
    }
    const supportedSibling = request('trim', 'mp4', av('h264', 'aac'), {
      id: 'scenarios/trim/h264_keyframe_aligned/01.mp4',
      output: { container: 'mp4' },
    });
    supportedSibling.scenarioId = 'trim/h264_keyframe_aligned';
    expect(decideFfmpegSupport(supportedSibling, RUNTIME)).toEqual({ supported: true });
  });

  test('classifies only the two measured strict fragmented streaming contracts', () => {
    const cmaf = request('remux', 'mp4', av('h264', 'aac'), {
      id: 'h264_1080p_30s.mp4',
      output: { container: 'mp4' },
      options: { container: 'mp4', fragmented: true, target: 'buffer' },
    });
    cmaf.scenarioId = 'streaming-output/mp4_fragmented_cmaf';
    expect(reason(cmaf)).toBe('FFMPEG_STREAMING_CMAF_CONTRACT_UNSUPPORTED');

    const massive = request('remux', 'mp4', av('h264', 'aac'), {
      id: 'massive_h264_1080p_2h.mp4',
      sizeBytes: 1_141_204_791,
      output: { container: 'mp4' },
      options: { container: 'mp4', fragmented: true, target: 'buffer' },
    });
    massive.scenarioId = 'streaming-output/buffer_massive_h264_mp4';
    expect(reason(massive)).toBe('FFMPEG_STREAMING_MASSIVE_FRAGMENTED_TIMELINE_UNSUPPORTED');

    const supportedSibling = request('remux', 'mp4', av('h264', 'aac'), {
      id: 'h264_1080p_30s.mp4',
      output: { container: 'mp4' },
      options: { container: 'mp4', fragmented: true, target: 'buffer' },
    });
    supportedSibling.scenarioId = 'streaming-output/prop_probe_dur_fragmented_shape';
    expect(decideFfmpegSupport(supportedSibling, RUNTIME)).toEqual({ supported: true });

    cmaf.inputs[0]!.mutated = true;
    expect(decideFfmpegSupport(cmaf, RUNTIME)).toEqual({ supported: true });
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

  test('keeps strict effect-aware transforms honest when the wasm re-encode misses their pixel bound', () => {
    expect(reason(request('transcode', 'mp4', av('h264', 'aac'), {
      output: { container: 'mp4', videoCodec: 'h264' },
      options: {
        video: { codec: 'h264', rotate: 90 },
        invariant: 'transcode-effect-aware',
      },
    }))).toBe('FFMPEG_TRANSFORM_PIXEL_FIDELITY_UNSUPPORTED');
    expect(reason(request('transcode', 'mp4', av('h264', 'aac'), {
      output: { container: 'mp4', videoCodec: 'h264' },
      options: {
        video: { codec: 'h264' },
        colorspace: { from: 'bt709', to: 'bt2020' },
        invariant: 'transcode-effect-aware',
      },
    }))).toBe('FFMPEG_COLOR_TRANSFORM_PIXEL_FIDELITY_UNSUPPORTED');
    expect(reason(request('transcode', 'mp4', av('h264', 'aac'), {
      output: { container: 'mp4', videoCodec: 'h264' },
      options: {
        video: { codec: 'h264', bitDepth: 8 },
        invariant: 'transcode-effect-aware',
      },
    }))).toBe('FFMPEG_DEPTH_TRANSFORM_PIXEL_FIDELITY_UNSUPPORTED');
  });

  test('declares measured audio-DSP matrix and fade precision limits without hiding supported stereo downmix', () => {
    const matrixRows = [
      'audio-dsp/upmix_mono_to_stereo',
      'audio-dsp/upmix_stereo_to_5_1',
      'audio-dsp/downmix_5_1_to_stereo',
      'audio-dsp/edge_variable_channel_count_downmix',
    ];
    for (const scenarioId of matrixRows) {
      const tuple = request('transcode', 'wav', [audio('pcm-s16')], {
        output: { container: 'wav', audioCodec: 'pcm-s16' },
        options: { audio: { codec: 'pcm-s16', channels: 2 } },
      });
      tuple.scenarioId = scenarioId;
      expect(reason(tuple), scenarioId).toBe('FFMPEG_AUDIO_MIX_MATRIX_UNSUPPORTED');
    }

    const fade = request('transcode', 'wav', [audio('pcm-f32')], {
      output: { container: 'wav', audioCodec: 'pcm-f32' },
      options: { audio: { codec: 'pcm-f32', fade: { inSec: 1, outSec: 1, curve: 'linear' } } },
    });
    fade.scenarioId = 'audio-dsp/fade_in_out_f32';
    expect(reason(fade)).toBe('FFMPEG_AUDIO_FADE_ENVELOPE_PRECISION_UNSUPPORTED');

    const supported = request('transcode', 'wav', [audio('pcm-s16')], {
      output: { container: 'wav', audioCodec: 'pcm-s16' },
      options: { audio: { codec: 'pcm-s16', channels: 1 } },
    });
    supported.scenarioId = 'audio-dsp/downmix_stereo_to_mono';
    expect(decideFfmpegSupport(supported, RUNTIME)).toEqual({ supported: true });
  });

  test('classifies concrete ST-core deadline and MP3-in-MP4 limits before execution', () => {
    expect(reason(request('transcode', 'mp4', [
      { ...video('h264'), width: 1080, height: 1920, fps: 60 },
      audio('aac'),
    ], {
      output: { container: 'mp4', videoCodec: 'h264', width: 1280, height: 720 },
      transforms: { resize: { width: 1280, height: 720 } },
      options: { video: { codec: 'h264', width: 1280, height: 720 } },
    }))).toBe('FFMPEG_ASPECT_CHANGE_REFERENCE_FIDELITY_UNSUPPORTED');

    expect(reason(request('transcode', 'webm', [
      { ...video('vp9'), width: 1080, height: 720, fps: 20, bitrate: 502_538 },
      { ...audio('opus'), bitrate: 502_538 },
    ], {
      sizeBytes: 14_077_804,
      output: { container: 'webm', videoCodec: 'vp8', audioCodec: 'vorbis' },
      options: { video: { codec: 'vp8' }, audio: { codec: 'vorbis' } },
    }))).toBe('FFMPEG_VP8_ENCODE_SUITE_BUDGET');

    expect(reason(request('transcode', 'mp4', [
      { ...video('h264'), width: 960, height: 540, fps: 30, bitrate: 1_639_712 },
      { ...audio('aac'), bitrate: 253_374 },
    ], {
      sizeBytes: 5_339_207,
      output: { container: 'mp4', videoCodec: 'hevc' },
      options: { video: { codec: 'hevc' } },
    }))).toBe('FFMPEG_HEVC_ENCODE_SUITE_BUDGET');

    expect(reason(request('transcode', 'mp4', [
      { ...video('h264'), width: 3840, height: 2160, fps: 29.97, bitrate: 25_052_646 },
      { ...audio('aac'), bitrate: 253_374 },
    ], {
      sizeBytes: 74_425_089,
      output: { container: 'mp4', videoCodec: 'h264', width: 1920, height: 1080 },
      options: { video: { codec: 'h264', width: 1920, height: 1080 } },
    }))).toBe('FFMPEG_4K_TRANSCODE_SUITE_BUDGET');

    expect(reason(request('transcode', 'mp4', [
      { ...video('h264'), width: 1280, height: 720, fps: 29.97, bitrate: 1_518_771 },
      { ...audio('aac'), bitrate: 253_374 },
    ], {
      sizeBytes: 28_852_252,
      output: { container: 'mp4', videoCodec: 'h264', width: 1920, height: 1080 },
      transforms: { resize: { width: 1920, height: 1080 } },
      options: { video: { codec: 'h264', width: 1920, height: 1080 } },
    }))).toBe('FFMPEG_H264_RESIZE_SUITE_BUDGET');

    expect(decideFfmpegSupport(request('transcode', 'mp4', [
      { ...video('h264'), width: 1280, height: 720, fps: 29.97, bitrate: 1_518_771 },
      { ...audio('aac'), bitrate: 253_374 },
    ], {
      sizeBytes: 5_000_000,
      output: { container: 'mp4', videoCodec: 'h264', width: 1920, height: 1080 },
      transforms: { resize: { width: 1920, height: 1080 } },
      options: { video: { codec: 'h264', width: 1920, height: 1080 } },
    }), RUNTIME)).toEqual({ supported: true });

    expect(reason(request('transcode', 'adts', [
      { ...audio('aac'), sampleRate: 11_025 },
    ], {
      output: { container: 'mp4', audioCodec: 'mp3' },
      options: { audio: { codec: 'mp3' } },
    }))).toBe('FFMPEG_MP3_MP4_SAMPLE_RATE_UNSUPPORTED');

    for (const file of ['02.aac', '03.aac']) {
      expect(reason(request('transcode', 'adts', [
        { ...audio('aac'), sampleRate: 44_100 },
      ], {
        id: `scenarios/transcode/aac_to_mp3_mp4/${file}`,
        output: { container: 'mp4', audioCodec: 'mp3' },
        options: { audio: { codec: 'mp3', bitrate: 192_000 }, invariant: 'transcode-audio-content' },
      })), file).toBe('FFMPEG_AAC_TO_MP3_PRIMING_BOUND');
    }
    expect(decideFfmpegSupport(request('transcode', 'adts', [
      { ...audio('aac'), sampleRate: 48_000 },
    ], {
      id: 'aac_adts.aac',
      output: { container: 'mp4', audioCodec: 'mp3' },
      options: { audio: { codec: 'mp3', bitrate: 192_000 }, invariant: 'transcode-audio-content' },
    }), RUNTIME)).toEqual({ supported: true });

    expect(reason(request('transcode', 'ogg', [audio('opus')], {
      output: { container: 'mp4', audioCodec: 'aac' },
      options: { audio: { codec: 'aac', bitrate: 192_000 }, invariant: 'transcode-audio-content' },
    }))).toBe('FFMPEG_OPUS_TO_AAC_QUALITY_BOUND');

    expect(decideFfmpegSupport(request('transcode', 'webm', av('vp9', 'opus'), {
      output: { container: 'mp4', videoCodec: 'h264', audioCodec: 'aac' },
      options: { video: { codec: 'h264' }, audio: { codec: 'aac' } },
    }), RUNTIME)).toEqual({ supported: true });

    expect(reason(request('transcode', 'webm', av('vp9', 'opus'), {
      id: 'scenarios/transcode/vp9_to_h264_mp4/01.webm',
      sizeBytes: 12_890_769,
      output: { container: 'mp4', videoCodec: 'h264', audioCodec: 'aac' },
      options: { video: { codec: 'h264' }, audio: { codec: 'aac' } },
    }))).toBe('FFMPEG_VP9_TO_H264_DEADLINE_BOUND');

    expect(decideFfmpegSupport(request('transcode', 'webm', av('vp9', 'opus'), {
      id: 'scenarios/transcode/vp9_to_h264_mp4/02.webm',
      sizeBytes: 13_970_881,
      output: { container: 'mp4', videoCodec: 'h264', audioCodec: 'aac' },
      options: { video: { codec: 'h264' }, audio: { codec: 'aac' } },
    }), RUNTIME)).toEqual({ supported: true });

    expect(reason(request('transcode', 'mp4', [
      { ...video('h264'), width: 1080, height: 1920, fps: 60, bitrate: 5_723_914 },
      { ...audio('aac'), bitrate: 189_393 },
    ], {
      id: 'scenarios/transcode/h264_bitrate_2mbps/03.mp4',
      output: { container: 'mp4', videoCodec: 'h264' },
      options: { video: { codec: 'h264', bitrate: 2_000_000 } },
    }))).toBe('FFMPEG_H264_2MBPS_QUALITY_BOUND');
    expect(decideFfmpegSupport(request('transcode', 'mp4', [
      { ...video('h264'), width: 960, height: 540, fps: 30, bitrate: 1_639_712 },
      { ...audio('aac'), bitrate: 253_374 },
    ], {
      id: 'scenarios/transcode/h264_bitrate_2mbps/02.mp4',
      output: { container: 'mp4', videoCodec: 'h264' },
      options: { video: { codec: 'h264', bitrate: 2_000_000 } },
    }), RUNTIME)).toEqual({ supported: true });

    for (const id of [
      'scenarios/transcode/h264_to_fragmented_mp4/03.mp4',
      'h264_1080p_30s.mp4',
    ]) {
      expect(reason(request('transcode', 'mp4', av('h264', 'aac'), {
        id,
        output: { container: 'mp4', videoCodec: 'h264' },
        options: { video: { codec: 'h264' }, fastStart: 'fragmented' },
      })), id).toBe('FFMPEG_FRAGMENTED_H264_QUALITY_BOUND');
    }
    expect(decideFfmpegSupport(request('transcode', 'mp4', av('h264', 'aac'), {
      id: 'scenarios/transcode/h264_to_fragmented_mp4/02.mp4',
      output: { container: 'mp4', videoCodec: 'h264' },
      options: { video: { codec: 'h264' }, fastStart: 'fragmented' },
    }), RUNTIME)).toEqual({ supported: true });

    expect(reason(request('transcode', 'mp4', [
      { ...video('h264'), width: 1080, height: 1920, fps: 60, bitrate: 5_723_914 },
      { ...audio('aac'), bitrate: 189_393 },
    ], {
      id: 'scenarios/transcode/h264_two_pass_bitrate/03.mp4',
      output: { container: 'mp4', videoCodec: 'h264' },
      options: { video: { codec: 'h264', bitrate: 2_000_000, passes: 2 } },
    }))).toBe('FFMPEG_H264_TWO_PASS_QUALITY_BOUND');
    expect(decideFfmpegSupport(request('transcode', 'mp4', [
      { ...video('h264'), width: 960, height: 540, fps: 30, bitrate: 1_639_712 },
      { ...audio('aac'), bitrate: 253_374 },
    ], {
      id: 'scenarios/transcode/h264_two_pass_bitrate/02.mp4',
      output: { container: 'mp4', videoCodec: 'h264' },
      options: { video: { codec: 'h264', bitrate: 2_000_000, passes: 2 } },
    }), RUNTIME)).toEqual({ supported: true });

    expect(reason(request('transcode', 'mp3', [audio('mp3')], {
      id: 'scenarios/transcode/mp3_to_aac_mp4/01.mp3',
      output: { container: 'mp4', audioCodec: 'aac' },
      options: { audio: { codec: 'aac', bitrate: 192_000 }, invariant: 'transcode-audio-content' },
    }))).toBe('FFMPEG_MP3_TO_AAC_QUALITY_BOUND');
    expect(decideFfmpegSupport(request('transcode', 'mp3', [audio('mp3')], {
      id: 'scenarios/transcode/mp3_to_aac_mp4/02.mp3',
      output: { container: 'mp4', audioCodec: 'aac' },
      options: { audio: { codec: 'aac', bitrate: 192_000 }, invariant: 'transcode-audio-content' },
    }), RUNTIME)).toEqual({ supported: true });
  });

  test('does not launder mutated/invalid bytes into a tuple miss', () => {
    const malformed = request('transcode', 'gif', av('av1', 'ac3'), {
      mutated: true,
      output: { container: 'gif', videoCodec: 'av1', audioCodec: 'ac3' },
    });
    expect(decideFfmpegSupport(malformed, RUNTIME)).toEqual({ supported: true });
  });

  test('declares exact unauthenticated CENC integrity mutations unobservable', () => {
    for (const scenarioId of [
      'encryption/cenc_ctr_protection_zeroed_graceful',
      'encryption/cenc_ctr_senc_bitflip_graceful',
    ]) {
      const tuple = request('decrypt', 'mp4', [], { encryption: 'cenc-ctr' });
      tuple.scenarioId = scenarioId;
      expect(reason(tuple)).toBe('FFMPEG_CENC_INTEGRITY_UNOBSERVABLE');
    }

    const positive = request('decrypt', 'mp4', av('h264', 'aac'), { encryption: 'cenc-ctr' });
    positive.scenarioId = 'encryption/cenc_ctr_decrypt';
    expect(decideFfmpegSupport(positive, RUNTIME)).toEqual({ supported: true });
  });

  test('executes unresolved remux tuples instead of treating absent track facts as illegality', () => {
    const unresolved = request('remux', 'flac', [], {
      output: { container: 'ogg' },
    });
    expect(decideFfmpegSupport(unresolved, RUNTIME)).toEqual({ supported: true });
  });

  test('applies mux selectors before legality and defers unresolved source inventories', () => {
    expect(decideFfmpegSupport(request('mux', 'webm', av('vp8', 'vorbis'), {
      output: { container: 'ogg' },
      options: { trackSelect: ['audio:0'] },
    }), RUNTIME)).toEqual({ supported: true });

    const unresolved = request('mux', 'webm', [], {
      output: { container: 'ogg' },
      options: { trackSelect: ['audio:0'] },
    });
    unresolved.inputs[0]!.sourceEvidence = 'UNRESOLVED';
    expect(decideFfmpegSupport(unresolved, RUNTIME)).toEqual({ supported: true });
  });

  test('declares source rotation unsupported before raw mux staging can drop it', () => {
    expect(reason(request('mux', 'mp4', [{ ...video('h264'), rotation: 90 }, audio('aac')], {
      output: { container: 'mov' },
    }))).toBe('FFMPEG_MUX_ROTATION_UNSUPPORTED');
  });

  test('declares source rotation unsupported when remuxing to a carrier that drops it', () => {
    const rotated = [{ ...video('h264'), rotation: 90 }, audio('aac')];
    expect(reason(request('remux', 'mp4', rotated, {
      output: { container: 'mkv' },
    }))).toBe('FFMPEG_REMUX_ROTATION_UNSUPPORTED');
    expect(decideFfmpegSupport(request('remux', 'mp4', rotated, {
      output: { container: 'mov' },
    }), RUNTIME)).toEqual({ supported: true });
  });

  test('declares exact Matroska timelines and candidate-scoped MP3 gapless metadata unsupported', () => {
    const vfrMkv = request('mux', 'mp4', av('h264', 'aac'), { output: { container: 'mkv' } });
    vfrMkv.scenarioId = 'mux/prop_vfr_mux_duration_mp4_to_mkv';
    expect(reason(vfrMkv)).toBe('FFMPEG_MKV_EXACT_TIMELINE_UNSUPPORTED');

    const mp3 = request('mux', 'mp3', [audio('mp3')], {
      id: 'scenarios/mux/mp3_to_mp4_audio/01.mp3',
      output: { container: 'mp4' },
    });
    mp3.scenarioId = 'mux/mp3_to_mp4_audio';
    expect(reason(mp3)).toBe('FFMPEG_MP3_GAPLESS_MUX_UNSUPPORTED');

    const tsPreroll = request('mux', 'mp4', av('h264', 'aac'), {
      id: 'h264_1080p_30s.mp4',
      output: { container: 'ts' },
    });
    tsPreroll.scenarioId = 'mux/h264_aac_to_ts';
    expect(reason(tsPreroll)).toBe('FFMPEG_TS_BFRAME_DURATION_TOLERANCE_UNSUPPORTED');
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

  test('classifies only the concrete remux timelines the FFmpeg 5.1 copy path cannot preserve', () => {
    const longEdit = remuxProgram('mov', [
      { ptsUs: 0, dtsUs: -3_000_000 },
      { ptsUs: 33_333, dtsUs: -2_966_667 },
    ]);
    const ordinaryPreroll = remuxProgram('mov', [
      { ptsUs: 0, dtsUs: -66_667 },
      { ptsUs: 33_333, dtsUs: -33_334 },
    ]);
    const signedTs = remuxProgram('ts', [
      { ptsUs: 10_000_000, dtsUs: 10_000_000 },
      { ptsUs: 10_033_333, dtsUs: 10_066_667 },
    ]);
    const monotonicTs = remuxProgram('ts', [
      { ptsUs: 1_400_000, dtsUs: 1_400_000 },
      { ptsUs: 1_433_333, dtsUs: 1_433_333 },
    ]);

    expect(remuxProgramReason('mov', 'mp4', longEdit)).toBe('FFMPEG_COMPLEX_EDIT_PREROLL_UNSUPPORTED');
    expect(decideFfmpegRemuxProgramSupport('mov', 'mp4', ordinaryPreroll)).toEqual({ supported: true });
    expect(remuxProgramReason('ts', 'mov', signedTs)).toBe('FFMPEG_TS_SIGNED_CTS_COPY_UNSUPPORTED');
    expect(remuxProgramReason('ts', 'mkv', signedTs)).toBe('FFMPEG_TS_SIGNED_CTS_COPY_UNSUPPORTED');
    expect(decideFfmpegRemuxProgramSupport('ts', 'ts', signedTs)).toEqual({ supported: true });
    expect(decideFfmpegRemuxProgramSupport('ts', 'mp4', monotonicTs)).toEqual({ supported: true });
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
    sizeBytes?: number;
    output?: ConcreteOperationRequest['output'];
    transforms?: ConcreteOperationRequest['transforms'];
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
      sizeBytes: overrides.sizeBytes ?? 1_024,
    }],
    ...(overrides.output ? { output: overrides.output } : {}),
    ...(overrides.transforms ? { transforms: overrides.transforms } : {}),
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

function remuxProgram(
  container: string,
  timestamps: Array<{ ptsUs: number; dtsUs: number }>,
): RemuxProgramEvidence {
  return {
    schema: 'media-test/remux-program@1',
    container,
    byteLength: 1_024,
    tracks: [{
      id: `${container}:video`,
      type: 'video',
      codec: 'h264',
      samples: timestamps.map((timestamp, index) => ({
        ...timestamp,
        durationUs: 33_333,
        keyframe: index === 0,
        payload: Uint8Array.of(index),
        framing: container === 'ts' ? 'annexb' : 'length-prefixed',
      })),
    }],
    representation: {},
  };
}

function remuxProgramReason(
  sourceContainer: string,
  targetContainer: string,
  program: RemuxProgramEvidence,
): string {
  const decision = decideFfmpegRemuxProgramSupport(sourceContainer, targetContainer, program);
  expect(decision.supported).toBe(false);
  return decision.supported ? '' : decision.reasonCode;
}

describe('performance evidence boundaries', () => {
  test('massive probe and exact remux misses are pre-content decisions', () => {
    const massive = request('probe', 'mp4', []);
    massive.scenarioId = 'performance/size-ladder-extract-metadata-massive';
    massive.inputs[0]!.id = 'massive_h264_1080p_2h.mp4';
    expect(decideFfmpegSupport(massive, RUNTIME)).toMatchObject({
      supported: false,
      reasonCode: 'FFMPEG_MASSIVE_PROBE_SUITE_BUDGET',
      preContent: true,
    });

    const huge = request('probe', 'mov', [], {
      id: 'huge_h264_1080p_600s.mov',
      sizeBytes: 447_748_594,
    });
    huge.scenarioId = 'performance/size-ladder-extract-metadata-huge';
    expect(decideFfmpegSupport(huge, RUNTIME)).toMatchObject({
      supported: false,
      reasonCode: 'FFMPEG_HUGE_PROBE_WORKER_BUDGET',
      preContent: true,
    });
    huge.inputs[0]!.id = 'scenarios/performance/size-ladder-extract-metadata-huge/03.mov';
    expect(decideFfmpegSupport(huge, RUNTIME)).toEqual({ supported: true });

    const remux = request('remux', 'mp4', av('h264', 'aac'), {
      id: 'scenarios/performance/metamorphic-decode-remux/01.mp4',
      output: { container: 'mkv' },
    });
    remux.scenarioId = 'performance/metamorphic-decode-remux';
    expect(decideFfmpegSupport(remux, RUNTIME)).toMatchObject({
      supported: false,
      reasonCode: 'FFMPEG_PERFORMANCE_REMUX_PIXEL_IDENTITY_UNSUPPORTED',
      preContent: true,
    });
    remux.inputs[0]!.id = 'scenarios/performance/metamorphic-decode-remux/02.mp4';
    expect(decideFfmpegSupport(remux, RUNTIME)).toEqual({ supported: true });
  });
});
