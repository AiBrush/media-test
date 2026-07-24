import { describe, expect, test } from 'bun:test';

import {
  materializeFiniteAibrushWebmClusters,
  prependAibrushMpegTsH264Aud,
  repairAibrushOggContinuationFlags,
  selectAibrushCopyTrimSampleIndices,
} from '../src/engines/aibrush-media/adapter.ts';
import { readNeutralRemuxProgram } from '../src/features/remux/readers.ts';

function oggCrc(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0;
  for (let index = start; index < end; index++) {
    const byte = index >= start + 22 && index < start + 26 ? 0 : bytes[index]!;
    crc ^= byte << 24;
    for (let bit = 0; bit < 8; bit++) {
      crc = ((crc << 1) ^ ((crc & 0x8000_0000) !== 0 ? 0x04c1_1db7 : 0)) >>> 0;
    }
  }
  return crc >>> 0;
}

function writeU32le(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function withSpuriousOggContinuation(source: Uint8Array): Uint8Array {
  const bytes = source.slice();
  const pendingBySerial = new Map<number, boolean>();
  let offset = 0;
  while (offset < bytes.byteLength) {
    const segmentCount = bytes[offset + 26]!;
    const headerEnd = offset + 27 + segmentCount;
    let bodyBytes = 0;
    for (let index = 0; index < segmentCount; index++) bodyBytes += bytes[offset + 27 + index]!;
    const pageEnd = headerEnd + bodyBytes;
    const serial = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset + 14, true);
    const pending = pendingBySerial.get(serial) ?? false;
    if (offset > 0 && !pending && (bytes[offset + 5]! & 1) === 0) {
      bytes[offset + 5] = bytes[offset + 5]! | 1;
      writeU32le(bytes, offset + 22, oggCrc(bytes, offset, pageEnd));
      return bytes;
    }
    pendingBySerial.set(
      serial,
      segmentCount === 0 ? pending : bytes[offset + 27 + segmentCount - 1] === 255,
    );
    offset = pageEnd;
  }
  throw new Error('fixture has no fresh Ogg page to corrupt');
}

describe('aibrush-media strict-copy remux boundary repairs', () => {
  test('selects a half-open presentation window and backs video up to its prior keyframe', () => {
    const track = {
      id: 'video:0',
      type: 'video' as const,
      codec: 'h264',
      samples: [
        { payload: new Uint8Array([0]), ptsUs: 1_000_000, dtsUs: 900_000, durationUs: 1_000_000, keyframe: true, framing: 'length-prefixed' as const },
        { payload: new Uint8Array([1]), ptsUs: 2_000_000, dtsUs: 1_900_000, durationUs: 1_000_000, keyframe: false, framing: 'length-prefixed' as const },
        { payload: new Uint8Array([2]), ptsUs: 3_000_000, dtsUs: 2_900_000, durationUs: 1_000_000, keyframe: false, framing: 'length-prefixed' as const },
        { payload: new Uint8Array([3]), ptsUs: 4_000_000, dtsUs: 3_900_000, durationUs: 1_000_000, keyframe: true, framing: 'length-prefixed' as const },
        { payload: new Uint8Array([4]), ptsUs: 5_000_000, dtsUs: 4_900_000, durationUs: 1_000_000, keyframe: false, framing: 'length-prefixed' as const },
      ],
    };

    expect(selectAibrushCopyTrimSampleIndices(track, { startUs: 1_500_000, endUs: 3_500_000 }))
      .toEqual([0, 1, 2, 3]);
    expect(selectAibrushCopyTrimSampleIndices(track, { startUs: 4_000_000, endUs: 4_000_000 }))
      .toEqual([]);

    expect(selectAibrushCopyTrimSampleIndices({
      ...track,
      id: 'audio:0',
      type: 'audio',
      codec: 'opus',
      samples: track.samples.map(({ durationUs: _durationUs, ...sample }) => sample),
    }, { startUs: 1_500_000, endUs: 3_500_000 })).toEqual([1, 2, 3]);
  });

  test('materializes sibling unknown-size WebM clusters without changing coded media', async () => {
    const source = new Uint8Array(
      await Bun.file('fixtures/media/recorder_headerless.webm').arrayBuffer(),
    );
    const repaired = materializeFiniteAibrushWebmClusters(source);

    expect(repaired).toBeDefined();
    expect(repaired).not.toBe(source);
    expect(repaired?.byteLength).toBe(source.byteLength);

    const before = readNeutralRemuxProgram(source, 'webm');
    const after = readNeutralRemuxProgram(repaired!, 'webm');
    expect(before.state).toBe('OK');
    expect(after.state).toBe('OK');
    if (before.state !== 'OK' || after.state !== 'OK') return;

    expect(before.value.durationUs).toBe(2_980_000);
    expect(after.value.durationUs).toBe(before.value.durationUs);
    expect(after.value.tracks.map((track) => track.samples.length)).toEqual([180]);
    expect(after.value.tracks.map((track) => ({
      type: track.type,
      codec: track.codec,
      samples: track.samples.map((sample) => ({
        payload: sample.payload,
        ptsUs: sample.ptsUs,
        dtsUs: sample.dtsUs,
        durationUs: sample.durationUs,
        keyframe: sample.keyframe,
      })),
    }))).toEqual(before.value.tracks.map((track) => ({
      type: track.type,
      codec: track.codec,
      samples: track.samples.map((sample) => ({
        payload: sample.payload,
        ptsUs: sample.ptsUs,
        dtsUs: sample.dtsUs,
        durationUs: sample.durationUs,
        keyframe: sample.keyframe,
      })),
    })));
  });

  test('prefixes a representation-only AVC AUD using the avcC length size', () => {
    const description = new Uint8Array([1, 100, 0, 40, 0xff]);
    const sample = new Uint8Array([0, 0, 0, 3, 0x65, 0x88, 0x84]);

    expect(prependAibrushMpegTsH264Aud(sample, description)).toEqual(
      new Uint8Array([0, 0, 0, 2, 0x09, 0xf0, ...sample]),
    );
    expect(prependAibrushMpegTsH264Aud(sample, new Uint8Array([0, 0, 0, 0, 0xff])))
      .toBeUndefined();
  });

  test('clears only a spurious Ogg continuation flag and restores the page CRC', async () => {
    const source = new Uint8Array(await Bun.file('fixtures/media/opus.ogg').arrayBuffer());
    const broken = withSpuriousOggContinuation(source);
    const before = readNeutralRemuxProgram(broken, 'ogg');
    expect(before.state).toBe('INCOMPLETE');
    if (before.state === 'OK') return;
    expect(before.reasonCode).toBe('REMUX_OGG_CONTINUATION_INVALID');

    const repaired = repairAibrushOggContinuationFlags(broken);
    expect(repaired).toEqual(source);
    expect(readNeutralRemuxProgram(repaired!, 'ogg').state).toBe('OK');
  });
});
