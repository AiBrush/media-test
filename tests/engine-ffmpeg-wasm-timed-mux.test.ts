import { describe, expect, test } from 'bun:test';
import type { EncodedTrack } from '../src/core/engine.ts';
import {
  buildTimedMp4,
  canBuildTimedMp4,
  hasImplicitRawDemuxTiming,
  TimedMp4UnsupportedError,
} from '../src/engines/ffmpeg-wasm/timed-mp4.ts';
import { splitAdtsFrames } from '../src/engines/ffmpeg-wasm/evidence.ts';

describe('REQ-ENG-17: route-independent timestamped mux staging', () => {
  test('accepts a shorter terminal PCM packet while requiring a contiguous zero-based sample clock', () => {
    const pcm: EncodedTrack = {
      type: 'audio', codec: 'pcm-s16', timescale: 48_000, packetOrdering: 'decode',
      framing: 'raw', accessUnitGrouping: 'one-packet-per-chunk', parameterSetLocation: 'not-applicable',
      sampleRate: 48_000, channels: 2,
      chunks: [
        { data: new Uint8Array(19_200), ptsUs: 0, dtsUs: 0, durationUs: 100_000, keyframe: true },
        { data: new Uint8Array(19_200), ptsUs: 100_000, dtsUs: 100_000, durationUs: 100_000, keyframe: true },
        { data: new Uint8Array(9_600), ptsUs: 200_000, dtsUs: 200_000, durationUs: 50_000, keyframe: true },
      ],
    };
    expect(hasImplicitRawDemuxTiming(pcm)).toBe(true);
    pcm.chunks[2]!.ptsUs += 10_000;
    expect(hasImplicitRawDemuxTiming(pcm)).toBe(false);
  });

  test('writes exact VFR/B-frame DTS, CTS, durations, sizes, and sync samples into MP4 tables', () => {
    const track = avcTrack();
    const first = buildTimedMp4([track]);
    const second = buildTimedMp4([track]);
    expect(first).toEqual(second);

    const stbl = path(first, ['moov', 'trak', 'mdia', 'minf', 'stbl']);
    const stts = child(first, stbl, 'stts');
    expect(tableRuns(first, stts, false)).toEqual([
      { count: 1, value: 33_333 },
      { count: 1, value: 66_666 },
      { count: 1, value: 33_333 },
    ]);
    const ctts = child(first, stbl, 'ctts');
    expect(first[ctts.bodyStart]).toBe(1);
    expect(tableRuns(first, ctts, true)).toEqual([
      { count: 1, value: 33_333 },
      { count: 1, value: 66_666 },
      { count: 1, value: -33_333 },
    ]);
    const stss = child(first, stbl, 'stss');
    expect(u32(first, stss.bodyStart + 4)).toBe(1);
    expect(u32(first, stss.bodyStart + 8)).toBe(1);
    const stsz = child(first, stbl, 'stsz');
    expect(u32(first, stsz.bodyStart + 8)).toBe(3);
    expect([0, 1, 2].map((index) => u32(first, stsz.bodyStart + 12 + index * 4)))
      .toEqual(track.chunks.map((chunk) => chunk.data.byteLength));
  });

  test('converts Annex-B parameter sets/samples without collapsing chunk cardinality', () => {
    const track = avcTrack();
    track.framing = 'annexb';
    delete track.description;
    delete track.descriptionRecord;
    track.chunks = [
      {
        data: Uint8Array.of(
          0, 0, 0, 1, 0x67, 0x64, 0, 0x1f,
          0, 0, 0, 1, 0x68, 0xee,
          0, 0, 1, 0x65, 0x88,
        ),
        ptsUs: 0, dtsUs: 0, durationUs: 33_333, keyframe: true,
      },
    ];
    const bytes = buildTimedMp4([track]);
    const stbl = path(bytes, ['moov', 'trak', 'mdia', 'minf', 'stbl']);
    const stsd = child(bytes, stbl, 'stsd');
    const avc1 = boxAt(bytes, stsd.bodyStart + 8);
    const avcC = child(bytes, { ...avc1, bodyStart: avc1.bodyStart + 78 }, 'avcC');
    expect([...bytes.slice(avcC.bodyStart, avcC.bodyEnd)]).toContain(0x67);
    const stsz = child(bytes, stbl, 'stsz');
    expect(u32(bytes, stsz.bodyStart + 8)).toBe(1);
  });

  test('keeps one ADTS access unit per chunk and carries AAC alongside video', () => {
    const first = adts(Uint8Array.of(1, 2, 3));
    const second = adts(Uint8Array.of(4, 5));
    const frames = splitAdtsFrames(concat(first, second));
    expect(frames).toEqual([first, second]);
    const audio: EncodedTrack = {
      type: 'audio', codec: 'aac', timescale: 48_000, packetOrdering: 'decode', framing: 'adts',
      accessUnitGrouping: 'one-packet-per-chunk', parameterSetLocation: 'in-band',
      sampleRate: 48_000, channels: 2,
      chunks: frames.map((data, index) => ({
        data,
        ptsUs: index * 21_333,
        dtsUs: index * 21_333,
        durationUs: 21_333,
        keyframe: true,
      })),
    };
    expect(canBuildTimedMp4([avcTrack(), audio])).toBe(true);
    const bytes = buildTimedMp4([avcTrack(), audio]);
    const moov = child(bytes, root(bytes), 'moov');
    expect(children(bytes, moov).filter((box) => box.type === 'trak')).toHaveLength(2);
  });

  test('uses decode order to infer absent DTS without inventing DTS in the public track', () => {
    const track = avcTrack();
    for (const [index, chunk] of track.chunks.entries()) {
      delete chunk.dtsUs;
      chunk.decodeIndex = index;
    }
    const bytes = buildTimedMp4([track]);
    const stbl = path(bytes, ['moov', 'trak', 'mdia', 'minf', 'stbl']);
    expect(tableRuns(bytes, child(bytes, stbl, 'stts'), false)).toHaveLength(3);
    expect(track.chunks.every((chunk) => chunk.dtsUs === undefined)).toBe(true);
  });

  test('rejects timed codecs it cannot stage instead of silently flattening timing', () => {
    const hevc = { ...avcTrack(), codec: 'hevc', framing: 'hevc' } as EncodedTrack;
    expect(canBuildTimedMp4([hevc])).toBe(false);
    expect(() => buildTimedMp4([hevc])).toThrow(TimedMp4UnsupportedError);
  });
});

function avcTrack(): EncodedTrack {
  const avcC = Uint8Array.of(
    1, 0x64, 0, 0x1f, 0xff, 0xe1, 0, 4, 0x67, 0x64, 0, 0x1f, 1, 0, 2, 0x68, 0xee,
  );
  const sample = (nal: number): Uint8Array => Uint8Array.of(0, 0, 0, 2, nal, 0x88);
  return {
    type: 'video', codec: 'h264', timescale: 1_000_000, packetOrdering: 'decode', framing: 'avc',
    accessUnitGrouping: 'one-packet-per-chunk', parameterSetLocation: 'description',
    description: avcC, descriptionRecord: 'avc-decoder-configuration-record', width: 1920, height: 1080,
    chunks: [
      { data: sample(0x65), ptsUs: 33_333, dtsUs: 0, durationUs: 33_333, keyframe: true },
      { data: sample(0x41), ptsUs: 99_999, dtsUs: 33_333, durationUs: 66_666, keyframe: false },
      { data: sample(0x41), ptsUs: 66_666, dtsUs: 99_999, durationUs: 33_333, keyframe: false },
    ],
  };
}

function adts(payload: Uint8Array): Uint8Array {
  const length = payload.byteLength + 7;
  const header = Uint8Array.of(
    0xff, 0xf1, 0x4c,
    0x80 | ((length >>> 11) & 0x03),
    (length >>> 3) & 0xff,
    ((length & 0x07) << 5) | 0x1f,
    0xfc,
  );
  return concat(header, payload);
}

interface Box { start: number; bodyStart: number; bodyEnd: number; type: string }

function root(bytes: Uint8Array): Box {
  return { start: 0, bodyStart: 0, bodyEnd: bytes.length, type: 'root' };
}

function path(bytes: Uint8Array, names: string[]): Box {
  let current = root(bytes);
  for (const name of names) current = child(bytes, current, name);
  return current;
}

function child(bytes: Uint8Array, parent: Box, type: string): Box {
  const found = children(bytes, parent).find((box) => box.type === type);
  if (!found) throw new Error(`missing ${parent.type}/${type}`);
  return found;
}

function children(bytes: Uint8Array, parent: Box): Box[] {
  const out: Box[] = [];
  for (let offset = parent.bodyStart; offset < parent.bodyEnd;) {
    const box = boxAt(bytes, offset);
    out.push(box);
    offset = box.bodyEnd;
  }
  return out;
}

function boxAt(bytes: Uint8Array, offset: number): Box {
  const size = u32(bytes, offset);
  return {
    start: offset,
    bodyStart: offset + 8,
    bodyEnd: offset + size,
    type: new TextDecoder().decode(bytes.slice(offset + 4, offset + 8)),
  };
}

function tableRuns(bytes: Uint8Array, box: Box, signed: boolean): Array<{ count: number; value: number }> {
  const count = u32(bytes, box.bodyStart + 4);
  return Array.from({ length: count }, (_, index) => {
    const offset = box.bodyStart + 8 + index * 8;
    const raw = u32(bytes, offset + 4);
    return { count: u32(bytes, offset), value: signed ? raw | 0 : raw };
  });
}

function u32(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! * 0x1000000 + (bytes[offset + 1]! << 16) + (bytes[offset + 2]! << 8) + bytes[offset + 3]!;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}
