import { describe, expect, test } from 'bun:test';
import {
  parseCodecNames,
  parseFilters,
  parseFormats,
} from '../src/engines/ffmpeg-wasm/codecs.ts';
import {
  applyObservedFrameCadence,
  containerFromFfmpegLog,
  parseFfprobeFramesJson,
  parseFfprobeJson,
  parseMp3XingDurationSec,
  parseTracksFromLog,
  representationForTracks,
  splitAdtsFrames,
  splitPreparedBytes,
} from '../src/engines/ffmpeg-wasm/evidence.ts';

describe('REQ-ENG-14/17: structured probe and representation evidence', () => {
  test('preserves aliases, rational VFR evidence, edit origin, priming, and HE-AAC tools', () => {
    const parsed = parseFfprobeJson(JSON.stringify({
      format: {
        duration: '10.010000',
        start_time: '-0.021333',
        tags: { title: 'evidence fixture' },
      },
      streams: [
        {
          index: 2,
          codec_type: 'video',
          codec_name: 'h264',
          codec_tag_string: 'avc1',
          width: 1920,
          height: 1080,
          avg_frame_rate: '30000/1001',
          r_frame_rate: '60/1',
          nb_read_frames: '300',
          duration: '10.010000',
          start_time: '-0.021333',
          time_base: '1/90000',
          extradata: '00000000: 0164 001f ffe1 0019',
          tags: { language: 'eng' },
        },
        {
          index: 5,
          codec_type: 'audio',
          codec_name: 'aac',
          codec_tag_string: 'mp4a',
          profile: 'HE-AACv2',
          sample_rate: '48000',
          channels: 2,
          time_base: '1/48000',
          initial_padding: 1024,
          trailing_padding: 211,
          extradata: '00000000: 2b92 08',
        },
      ],
    }), 'mp4');

    expect(parsed.trackIndexes).toEqual([2, 5]);
    expect(parsed.metadata.durationSec).toBe(10.01);
    expect((parsed.metadata as unknown as Record<string, unknown>).presentationStartSec).toBe(-0.021333);
    expect(parsed.metadata.tracks[0]).toMatchObject({
      codec: 'h264', nativeCodecTag: 'avc1', fps: 30000 / 1001,
      fpsProvenance: {
        source: 'average', cadence: 'UNKNOWN', sampleCount: 300, observedIntervalUs: 10_010_000,
        rational: { numerator: 30000, denominator: 1001 },
      },
    });
    expect(parsed.metadata.tracks[1]).toMatchObject({
      codec: 'aac', nativeCodecTag: 'mp4a', sampleRate: 48000, channels: 2,
      sbrPresent: true, psPresent: true, primingSamples: 1024, remainderSamples: 211,
    });
    expect(parsed.timebases.get(2)).toEqual({ numerator: 1, denominator: 90000 });
    expect([...parsed.decoderConfigs.get(2)!]).toEqual([0x01, 0x64, 0x00, 0x1f, 0xff, 0xe1, 0x00, 0x19]);
  });

  test('keeps exact NTSC rational evidence without decimal string guessing', () => {
    const parsed = parseFfprobeJson(JSON.stringify({
      format: { duration: '10.01' },
      streams: [{
        index: 0, codec_type: 'video', codec_name: 'h264', width: 640, height: 360,
        avg_frame_rate: '30000/1001', r_frame_rate: '30000/1001', nb_read_frames: '300', duration: '10.01',
      }],
    }), 'mp4');
    expect(parsed.metadata.tracks[0]!.fpsProvenance).toEqual({
      source: 'average', cadence: 'CFR', sampleCount: 300, observedIntervalUs: 10_010_000,
      rational: { numerator: 30000, denominator: 1001 },
    });
  });

  test('maps non-contiguous source stream indices to normalized representations', () => {
    const metadata = [
      { type: 'video' as const, codec: 'h264', nativeCodecTag: 'avc1', bitrate: null, language: null },
      { type: 'audio' as const, codec: 'aac', nativeCodecTag: 'mp4a', bitrate: null, language: null },
    ];
    const avcC = new Uint8Array([1, 100, 0, 31]);
    const asc = new Uint8Array([0x12, 0x10]);
    const reps = representationForTracks(
      'mp4',
      metadata,
      new Map([[2, avcC], [5, asc]]),
      new Map([[2, { numerator: 1, denominator: 90000 }], [5, { numerator: 1, denominator: 48000 }]]),
      [2, 5],
    );
    expect(reps[0]).toMatchObject({
      trackIndex: 0,
      framing: 'avc',
      parameterSetLocation: 'description',
      descriptionRecord: 'avc-decoder-configuration-record',
      timebase: { numerator: 1, denominator: 90000 },
    });
    expect(reps[0]!.description).not.toBe(avcC);
    expect(reps[1]).toMatchObject({
      trackIndex: 1,
      framing: 'raw',
      descriptionRecord: 'audio-specific-config',
      timebase: { numerator: 1, denominator: 48000 },
    });
  });

  test('distinguishes MP4 configuration records from Annex-B in-band parameter sets', () => {
    const track = [{ type: 'video' as const, codec: 'h264', bitrate: null, language: null }];
    expect(() => representationForTracks('mp4', track, new Map(), new Map())).toThrow('AVCDecoderConfigurationRecord');
    expect(representationForTracks('ts', track, new Map(), new Map())).toEqual([{
      trackIndex: 0,
      packetOrdering: 'decode',
      accessUnitGrouping: 'one-packet-per-chunk',
      framing: 'annexb',
      parameterSetLocation: 'in-band',
    }]);
  });

  test('retains observed negative/VFR PTS and seek candidates from frame JSON', () => {
    const frames = parseFfprobeFramesJson(JSON.stringify({ frames: [
      { best_effort_timestamp_time: '0.041000', pkt_duration_time: '0.041000', key_frame: 0 },
      { best_effort_timestamp_time: '-0.021000', pkt_duration_time: '0.062000', key_frame: 1 },
      { best_effort_timestamp_time: '0.100000', pkt_duration_time: '0.059000', key_frame: 0 },
    ] }));
    expect(frames).toEqual([
      { ptsUs: -21000, durationUs: 62000, keyframe: true },
      { ptsUs: 41000, durationUs: 41000, keyframe: false },
      { ptsUs: 100000, durationUs: 59000, keyframe: false },
    ]);
    expect(frames.find((frame) => frame.ptsUs >= 50_000)?.ptsUs).toBe(100_000);

    const metadata = {
      container: 'mp4',
      durationSec: 0.159,
      tracks: [{
        type: 'video' as const,
        codec: 'h264',
        fps: 30,
        fpsProvenance: {
          source: 'nominal' as const,
          rational: { numerator: 30_000, denominator: 1001 },
        },
        bitrate: null,
        language: null,
      }],
    };
    applyObservedFrameCadence(metadata, frames);
    expect(metadata.tracks[0]!.fpsProvenance).toMatchObject({
      source: 'observed', cadence: 'VFR', sampleCount: 3, observedIntervalUs: 180_000,
      rational: { numerator: 30_000, denominator: 1001 },
    });
  });

  test('does not mistake NTSC timestamp rounding for VFR', () => {
    const metadata = {
      container: 'mp4', durationSec: 0.1001,
      tracks: [{ type: 'video' as const, codec: 'h264', bitrate: null, language: null }],
    };
    applyObservedFrameCadence(metadata, [
      { ptsUs: 0, durationUs: 33_367, keyframe: true },
      { ptsUs: 33_367, durationUs: 33_366, keyframe: false },
      { ptsUs: 66_733, durationUs: 33_367, keyframe: false },
    ]);
    expect(metadata.tracks[0]!.fpsProvenance).toMatchObject({ source: 'observed', cadence: 'CFR' });
  });

  test('splits every prepared packet without losing stream headers or timing cardinality', () => {
    const bytes = Uint8Array.from({ length: 20 }, (_, index) => index);
    const packets = [
      { trackIndex: 0, size: 5, ptsUs: 0, dtsUs: -33_333, durationUs: 33_333, keyframe: true },
      { trackIndex: 0, size: 6, ptsUs: 66_666, dtsUs: 0, durationUs: 33_333, keyframe: false },
      { trackIndex: 0, size: 4, ptsUs: 33_333, dtsUs: 33_333, durationUs: 33_333, keyframe: false },
    ];
    const chunks = splitPreparedBytes(bytes, packets);
    expect(chunks.map((chunk) => chunk.byteLength)).toEqual([10, 6, 4]);
    expect([...concat(chunks)]).toEqual([...bytes]);
    expect(chunks).toHaveLength(packets.length);
  });

  test('splits ADTS by frame headers rather than payload-only packet sizes', () => {
    const frame = (payload: number[]): Uint8Array => {
      const length = payload.length + 7;
      return Uint8Array.of(
        0xff, 0xf1, 0x4c, 0x80 | ((length >>> 11) & 3),
        (length >>> 3) & 0xff, ((length & 7) << 5) | 0x1f, 0xfc, ...payload,
      );
    };
    const first = frame([1, 2, 3]);
    const second = frame([4, 5]);
    expect(splitAdtsFrames(concat([first, second]))).toEqual([first, second]);
    expect(splitAdtsFrames(Uint8Array.of(0xff, 0xf1))).toEqual([]);
  });

  test('rejects malformed structured evidence instead of silently scraping it', () => {
    expect(() => parseFfprobeJson('{', 'mp4')).toThrow('malformed');
    expect(() => parseFfprobeJson('[]', 'mp4')).toThrow('must be an object');
    expect(() => parseFfprobeFramesJson('{"frames":')).toThrow('malformed');
  });
});

describe('REQ-ENG-13/18: exact runtime-build parsers', () => {
  test('parses the loaded core stream prefix with source index and timebase diagnostics', () => {
    const log = [
      "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'op1.in':",
      '  Duration: 00:00:10.50, start: 0.000000, bitrate: 5888 kb/s',
      '  Stream #0:0[0x1](und), 31, 1/60: Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1080x1920, 5723 kb/s, 60 fps, 60 tbr, 60 tbn (default)',
      '  Stream #0:1[0x2](eng), 1, 1/48000: Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 189 kb/s (default)',
      'At least one output file must be specified',
    ].join('\n');

    expect(parseTracksFromLog(log)).toEqual([
      {
        type: 'video', codec: 'h264', bitrate: null, language: null,
        width: 1080, height: 1920, fps: 60, defaultDisposition: true,
      },
      {
        type: 'audio', codec: 'aac', bitrate: null, language: 'eng',
        sampleRate: 48000, channels: 2, defaultDisposition: true,
      },
    ]);
  });

  test('uses observed tbr, PCM rate, display rotation, and demuxer identity', () => {
    const log = [
      "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'mislabeled.webm':",
      '  Stream #0:0, 31, 1/90000: Video: h264, yuv420p, 640x480, 29.97 tbr, 90k tbn',
      '    Side data:',
      '      displaymatrix: rotation of 90.00 degrees',
      '  Stream #0:1: Audio: pcm_s16le, 48000 Hz, stereo, s16, 1536 kb/s (default)',
    ].join('\n');
    expect(containerFromFfmpegLog(log, 'webm')).toBe('mp4');
    expect(parseTracksFromLog(log)).toEqual([
      {
        type: 'video', codec: 'h264', bitrate: null, language: null,
        width: 640, height: 480, fps: 29.97, rotation: 90,
      },
      {
        type: 'audio', codec: 'pcm-s16', bitrate: 1_536_000, language: null,
        sampleRate: 48_000, channels: 2, defaultDisposition: true,
      },
    ]);
  });

  test('derives sample-accurate MP3 duration from Xing frame count and LAME trim', () => {
    const frame = new Uint8Array(417);
    frame.set([0xff, 0xfb, 0x90, 0x64], 0); // MPEG-1 Layer III, 44.1 kHz, stereo
    const xing = 4 + 32;
    frame.set(new TextEncoder().encode('Xing'), xing);
    frame.set([0, 0, 0, 1], xing + 4); // frame-count field present
    frame.set([0, 0, 2, 30], xing + 8); // 542 frames
    const lame = xing + 12;
    frame.set(new TextEncoder().encode('LAME3.100'), lame);
    frame.set([0x24, 0x04, 0xc0], lame + 21); // delay=576, padding=1216
    expect(parseMp3XingDurationSec(frame)).toBeCloseTo(14.1177324263, 9);
    expect(parseMp3XingDurationSec(frame.subarray(0, xing))).toBeNull();
  });

  test('parses codec, format, and filter rows from the loaded core output', () => {
    const codecLog = ['Encoders:', ' ------', ' V..... libx264  H.264', ' A..... aac      AAC'].join('\n');
    const formatLog = ['File formats:', ' --', ' DE mp4      MP4', ' D  hls      HLS', '  E webm     WebM'].join('\n');
    const filterLog = ['Filters:', ' ------', ' ... scale            V->V', ' T.. volume           A->A'].join('\n');
    expect([...parseCodecNames(codecLog)]).toEqual(['libx264', 'aac']);
    const formats = parseFormats(formatLog);
    expect([...formats.demux]).toEqual(['mp4', 'hls']);
    expect([...formats.mux]).toEqual(['mp4', 'webm']);
    expect([...parseFilters(filterLog)]).toEqual(['scale', 'volume']);
  });
});

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}
