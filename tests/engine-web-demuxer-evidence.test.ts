import { afterEach, describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';

import { isNotApplicableError, type MediaInput, type NormalizedMetadata } from '../src/core/engine.ts';
import {
  aacAudioConfigFromAdts,
  aacAudioConfigFromMpegTs,
  withTsAacMetadataFromInput,
} from '../src/engines/web-demuxer/adapter.ts';
import {
  createTrackEvidenceAccumulator,
  finishTrackRepresentation,
  frameRateFromStream,
  mergeNormalizedStreams,
  packetEvidenceFromWebPacket,
  streamIndexToTrackIndex,
} from '../src/engines/web-demuxer/packet-evidence.ts';
import {
  demuxProgressiveMp4SampleTable,
  parseProgressiveMp4SampleTableBytes,
  shouldUseProgressiveMp4SampleTableFastPath,
} from '../src/engines/web-demuxer/mp4-sample-table.ts';
import {
  closeAll,
  retainLowestPts,
  seekGopProgressSatisfied,
  selectSeekLanding,
  sortByPresentationTime,
  WebDemuxerPartialDecodeError,
} from '../src/engines/web-demuxer/temporal.ts';
import { sha256Hex } from '../src/engines/web-demuxer/digest.ts';
import type { WebAVPacket, WebAVStream } from 'web-demuxer';

const originalFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

afterEach(() => {
  if (originalFetch) Object.defineProperty(globalThis, 'fetch', originalFetch);
  if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
});

describe('REQ-ENG-27: representation-aware web-demuxer packet evidence', () => {
  test('leaves DTS absent and gives AVCC/Annex-B equivalent access units one semantic identity', async () => {
    const description = new Uint8Array([1, 100, 0, 40, 0xff]);
    const annexAccumulator = createTrackEvidenceAccumulator(0, 'video', 'h264', stream({
      index: 7, codec_string: 'avc1.640028', extradata: description,
    }));
    const avccAccumulator = createTrackEvidenceAccumulator(0, 'video', 'h264', stream({
      index: 7, codec_string: 'avc1.640028', extradata: description,
    }));
    const annex = packet(new Uint8Array([
      0, 0, 0, 1, 0x67, 0x64, 0,
      0, 0, 0, 1, 0x65, 1, 2, 3,
    ]));
    const avcc = packet(new Uint8Array([
      0, 0, 0, 3, 0x67, 0x64, 0,
      0, 0, 0, 4, 0x65, 1, 2, 3,
    ]));
    const annexEvidence = await packetEvidenceFromWebPacket(annex, annexAccumulator);
    const avccEvidence = await packetEvidenceFromWebPacket(avcc, avccAccumulator);

    expect('dtsUs' in annexEvidence).toBe(false);
    expect(annexEvidence.durationUs).toBe(33_333);
    expect(annexEvidence.accessUnitId).toBe(avccEvidence.accessUnitId);
    expect(annexEvidence.payloadDigest).not.toBe(avccEvidence.payloadDigest);
    expect(annexEvidence.framing).toBe('annexb');
    expect(avccEvidence.framing).toBe('avc');
    expect(finishTrackRepresentation(annexAccumulator)).toMatchObject({
      framing: 'annexb', parameterSetLocation: 'both', accessUnitGrouping: 'one-access-unit-per-chunk',
    });
    expect(finishTrackRepresentation(avccAccumulator)).toMatchObject({
      framing: 'avc', parameterSetLocation: 'both', descriptionRecord: 'avc-decoder-configuration-record',
    });
  });

  test('changes semantic identity for a corrupt slice NAL and preserves real random-access meaning', async () => {
    const first = createTrackEvidenceAccumulator(0, 'video', 'h264', stream());
    const corrupt = createTrackEvidenceAccumulator(0, 'video', 'h264', stream());
    const a = await packetEvidenceFromWebPacket(packet(new Uint8Array([0, 0, 1, 0x65, 1, 2, 3])), first);
    const b = await packetEvidenceFromWebPacket(packet(new Uint8Array([0, 0, 1, 0x65, 1, 9, 3])), corrupt);
    expect(a.accessUnitId).not.toBe(b.accessUnitId);
    expect(a.keyframe).toBe(true);
    expect(a.randomAccessKind).toBe('idr');
  });

  test('normalizes sparse stream indices without assuming dense upstream numbering', () => {
    const primary = [stream({ index: 9, codec_type: 0, codec_type_string: 'video' })];
    const supplemental = [
      stream({ index: 3, codec_type: 1, codec_type_string: 'audio', sample_rate: 48_000 }),
      stream({ index: 9, codec_type: 0, codec_type_string: 'video', width: 1920 }),
    ];
    const merged = mergeNormalizedStreams(primary, supplemental);
    expect(merged.map((item) => item.index)).toEqual([9, 3]);
    expect(streamIndexToTrackIndex(merged)).toEqual(new Map([[9, 0], [3, 1]]));
    expect(() => streamIndexToTrackIndex([stream({ index: 4 }), stream({ index: 4 })])).toThrow('duplicate');
  });

  test('records average versus nominal FPS provenance without presenting a guess as observation', () => {
    expect(frameRateFromStream(stream({
      avg_frame_rate: '30000/1001', r_frame_rate: '30000/1001', nb_frames: '300', duration: 10.01,
    }))).toMatchObject({
      fps: 29.97002997002997,
      provenance: { source: 'average', cadence: 'CFR', sampleCount: 300, observedIntervalUs: 10_010_000 },
    });
    expect(frameRateFromStream(stream({
      avg_frame_rate: '24/1', r_frame_rate: '60/1', nb_frames: 'N/A', duration: 0,
    }))).toMatchObject({
      fps: 24,
      provenance: { source: 'nominal', cadence: 'VFR', envelope: { minFps: 24, maxFps: 60 } },
    });
  });
});

describe('REQ-ENG-27/31: TS ADTS evidence and provenance', () => {
  test('extracts the base ADTS configuration and labels a TS supplement as ADTS-core evidence', async () => {
    const adts = new Uint8Array([0xff, 0xf1, 0x4c, 0x80, 0, 0, 0]); // 48 kHz, stereo
    expect(aacAudioConfigFromAdts(adts)).toEqual({ sampleRate: 48_000, channels: 2 });
    const transport = mpegTsWithAdts(adts);
    expect(aacAudioConfigFromMpegTs(transport)).toEqual({ sampleRate: 48_000, channels: 2 });

    const metadata: NormalizedMetadata = {
      container: 'ts', durationSec: 1,
      tracks: [{ type: 'audio', codec: 'aac', bitrate: null, language: null }],
    };
    const input = memoryInput('edge.ts', transport, true);
    const supplemented = await withTsAacMetadataFromInput(input, metadata);
    expect(supplemented.tracks[0]).toMatchObject({ sampleRate: 48_000, channels: 2 });
    expect(supplemented.tags?.['webDemuxer.audioConfig.0']).toBe('adts-core');
  });

  test('does not force one ADTS header onto multiple ambiguous AAC tracks', async () => {
    const bytes = mpegTsWithAdts(new Uint8Array([0xff, 0xf1, 0x4c, 0x80, 0, 0, 0]));
    const metadata: NormalizedMetadata = {
      container: 'ts', durationSec: 1,
      tracks: [
        { type: 'audio', codec: 'aac' },
        { type: 'audio', codec: 'aac' },
      ],
    };
    expect(await withTsAacMetadataFromInput(memoryInput('multi.ts', bytes, false), metadata)).toBe(metadata);
  });
});

describe('REQ-ENG-28: deterministic temporal helpers', () => {
  test('retains the lowest PTS independently of callback order and closes every rejected frame', () => {
    const closed: number[] = [];
    const retained: Array<{ ptsUs: number; arrivalIndex: number; value: { close(): void } }> = [];
    for (const [arrivalIndex, ptsUs] of [90, 10, 50, 20, 80].entries()) {
      retainLowestPts(retained, {
        ptsUs, arrivalIndex, value: { close: () => closed.push(ptsUs) },
      }, 3);
    }
    expect(sortByPresentationTime(retained).map((item) => item.ptsUs)).toEqual([10, 20, 50]);
    expect(closed.sort((a, b) => a - b)).toEqual([80, 90]);
    closeAll(retained);
    expect(closed.sort((a, b) => a - b)).toEqual([10, 20, 50, 80, 90]);
  });

  test('selects max real PTS <= target, falls forward before zero, and proves demux timing', () => {
    const values = [300, 100, 200].map((ptsUs, arrivalIndex) => ({
      ptsUs, arrivalIndex, value: { close: () => undefined },
    }));
    expect(selectSeekLanding(values, 250, [100, 200, 300])?.ptsUs).toBe(200);
    expect(selectSeekLanding(values, -1, [100, 200, 300])?.ptsUs).toBe(100);
    expect(() => selectSeekLanding(values, 250, [100, 300])).toThrow('absent from submitted');
  });

  test('uses a next-key GOP boundary rather than a fixed time window and exposes partial failure', () => {
    expect(seekGopProgressSatisfied({ type: 'delta', timestamp: 2_000_000 } as EncodedVideoChunk, 1_000_000, true))
      .toBe(false);
    expect(seekGopProgressSatisfied({ type: 'key', timestamp: 5_000_000 } as EncodedVideoChunk, 1_000_000, true))
      .toBe(true);
    expect(new WebDemuxerPartialDecodeError('seek', 3, new Error('truncated'))).toMatchObject({
      name: 'WebDemuxerPartialDecodeError', reasonCode: 'WEB_DEMUXER_PARTIAL_DECODE', emittedFrames: 3,
    });
  });
});

describe('REQ-ENG-30: prompt digest cancellation', () => {
  test('settles on abort without waiting for an uncancellable Web Crypto promise', async () => {
    const gate = deferred<ArrayBuffer>();
    const started = deferred<void>();
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      writable: true,
      value: {
        subtle: {
          digest: async (): Promise<ArrayBuffer> => {
            started.resolve();
            return gate.promise;
          },
        },
      },
    });
    const controller = new AbortController();
    const running = sha256Hex(new Uint8Array([1, 2, 3]), controller.signal);
    await started.promise;
    controller.abort(new DOMException('digest cancelled', 'AbortError'));
    await expect(running).rejects.toMatchObject({ name: 'AbortError', message: 'digest cancelled' });
    gate.resolve(new ArrayBuffer(32));
  });
});

describe('REQ-ENG-29: explicit sample-table backend and payload-range truth', () => {
  test('parses the real medium fixture with backend/config/range/omission provenance', async () => {
    const bytes = new Uint8Array(await readFile('fixtures/media/h264_1080p_30s.mp4'));
    const parsed = parseProgressiveMp4SampleTableBytes(bytes);
    expect(parsed.metadata).toMatchObject({
      container: 'mp4', durationSec: 30,
      tracks: [
        { type: 'video', codec: 'h264', width: 1920, height: 1080, fps: 30 },
        { type: 'audio', codec: 'aac', sampleRate: 48_000, channels: 2 },
      ],
    });
    expect(parsed.packets.length).toBe(2308);
    expect(parsed.packets.every((item) => item.dtsUs !== undefined)).toBe(true);
    expect(parsed.representations).toMatchObject([
      { framing: 'avc', descriptionRecord: 'avc-decoder-configuration-record' },
      { framing: 'raw', descriptionRecord: 'audio-specific-config' },
    ]);
    expect(parsed.backendEvidence).toMatchObject({
      backend: 'iso-bmff-sample-table',
      contract: 'table-with-validated-payload-ranges',
      packetCount: 2308,
      payloadRangeCount: 2308,
      payloadRangesValidated: true,
      payloadBytesRead: false,
      trackIdToIndex: { '1': 0, '2': 1 },
    });
    expect(parsed.backendEvidence.omittedEvidence).toContain('coded-payload-bytes');
    expect(parsed.backendEvidence.peakRetainedBytesEstimate).toBeLessThan(bytes.byteLength);
  });

  test('rejects a chunk offset outside every mdat instead of passing table syntax alone', async () => {
    const bytes = new Uint8Array(await readFile('fixtures/media/h264_1080p_30s.mp4'));
    const broken = bytes.slice();
    const stcoType = findAscii(broken, 'stco');
    expect(stcoType).toBeGreaterThan(0);
    writeU32(broken, stcoType + 12, 0);
    expect(() => parseProgressiveMp4SampleTableBytes(broken)).toThrow('outside every mdat');
  });

  test('range-reads only headers plus moov and reports exact network evidence', async () => {
    const bytes = new Uint8Array(await readFile('fixtures/media/h264_1080p_30s.mp4'));
    let calls = 0;
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (_url: string, init?: RequestInit): Promise<Response> => {
        calls++;
        const range = new Headers(init?.headers).get('range');
        const match = /^bytes=(\d+)-(\d+)$/.exec(range ?? '');
        if (!match) throw new Error(`missing range header: ${range}`);
        const start = Number(match[1]);
        const end = Number(match[2]);
        const body = bytes.slice(start, end + 1);
        return new Response(body as BodyInit, {
          status: 206,
          headers: {
            'content-length': String(body.byteLength),
            'content-range': `bytes ${start}-${end}/${bytes.byteLength}`,
          },
        });
      },
    });
    const events: unknown[] = [];
    const parsed = await demuxProgressiveMp4SampleTable(
      memoryInput('h264_1080p_30s.mp4', bytes, false),
      { emit: (event) => events.push(event) },
    );
    expect(calls).toBe(parsed.backendEvidence.rangeCount);
    expect(parsed.backendEvidence.bytesRead).toBeLessThan(64 * 1024);
    expect(parsed.backendEvidence.moovBytes).toBeGreaterThan(0);
    expect(events).toHaveLength(1);
  });

  test('rejects unhonored ranges and observes a pre-aborted range fetch without starting work', async () => {
    let calls = 0;
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (): Promise<Response> => {
        calls++;
        return new Response(new Uint8Array(64) as BodyInit, {
          status: 200,
          headers: { 'content-length': '64' },
        });
      },
    });
    const bytes = new Uint8Array(1024);
    await expect(demuxProgressiveMp4SampleTable(memoryInput('h264_1080p_30s.mp4', bytes, false)))
      .rejects.toThrow('did not honor MP4 range');
    expect(calls).toBe(1);

    calls = 0;
    const controller = new AbortController();
    controller.abort(new DOMException('range cancelled', 'AbortError'));
    await expect(demuxProgressiveMp4SampleTable(
      memoryInput('h264_1080p_30s.mp4', bytes, false),
      { signal: controller.signal },
    )).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toBe(0);
  });

  test('reason-codes fragmented media and limits fast-path eligibility to exact unmutated ids', async () => {
    const bytes = new Uint8Array(await readFile('fixtures/media/h264_1080p_30s.mp4'));
    const fragmented = bytes.slice();
    fragmented.set(new TextEncoder().encode('moof'), 4);
    try {
      parseProgressiveMp4SampleTableBytes(fragmented);
      throw new Error('expected fragmented input to be rejected');
    } catch (error) {
      expect(isNotApplicableError(error)).toBe(true);
      if (isNotApplicableError(error)) expect(error.reasonCode).toBe('WEB_DEMUXER_FAST_PATH_FRAGMENTED');
    }

    expect(shouldUseProgressiveMp4SampleTableFastPath(memoryInput('h264_1080p_30s.mp4', bytes, false))).toBe(true);
    expect(shouldUseProgressiveMp4SampleTableFastPath(memoryInput('h264_1080p_30s.mp4', bytes, true))).toBe(false);
    expect(shouldUseProgressiveMp4SampleTableFastPath(memoryInput('copy.mp4', bytes, false))).toBe(false);
  });
});

function packet(data: Uint8Array): WebAVPacket {
  return { keyframe: 0, timestamp: 1.25, duration: 0.033333, size: data.byteLength, data };
}

function stream(overrides: Partial<WebAVStream> = {}): WebAVStream {
  return {
    index: 0, id: 1, codec_type: 0, codec_type_string: 'video', codec_name: 'h264',
    codec_string: '', color_primaries: '', color_range: '', color_space: '', color_transfer: '',
    profile: '', pix_fmt: '', level: 0, width: 0, height: 0, channels: 0, sample_rate: 0,
    sample_fmt: '', bit_rate: '', extradata_size: 0, extradata: new Uint8Array(),
    r_frame_rate: '0/0', avg_frame_rate: '0/0', sample_aspect_ratio: '', display_aspect_ratio: '',
    start_time: 0, duration: 0, rotation: 0, flip: false, nb_frames: 'N/A', tags: {},
    ...overrides,
  };
}

function memoryInput(id: string, bytes: Uint8Array, mutated: boolean): MediaInput {
  return {
    id, url: `https://fixtures.invalid/${id}`, mime: 'application/octet-stream', mutated,
    sizeBytes: bytes.byteLength,
    blob: async () => new Blob([bytes]),
    arrayBuffer: async () => bytes.slice().buffer,
  };
}

function mpegTsWithAdts(adts: Uint8Array): Uint8Array {
  const packets = Array.from({ length: 5 }, () => {
    const value = new Uint8Array(188);
    value.fill(0xff);
    value[0] = 0x47;
    value[3] = 0x10;
    return value;
  });
  packets[0]!.set([0x47, 0x40, 0x00, 0x10, 0x00], 0);
  packets[0]!.set([
    0x00, 0xb0, 0x0d, 0x00, 0x01, 0xc1, 0x00, 0x00,
    0x00, 0x01, 0xe1, 0x00, 0, 0, 0, 0,
  ], 5);
  packets[1]!.set([0x47, 0x41, 0x00, 0x10, 0x00], 0);
  packets[1]!.set([
    0x02, 0xb0, 0x12, 0x00, 0x01, 0xc1, 0x00, 0x00,
    0xe1, 0x01, 0xf0, 0x00,
    0x0f, 0xe1, 0x01, 0xf0, 0x00,
    0, 0, 0, 0,
  ], 5);
  packets[2]!.set([0x47, 0x41, 0x01, 0x10], 0);
  packets[2]!.set([0, 0, 1, 0xc0, 0, 0, 0x80, 0, 0], 4);
  packets[2]!.set(adts, 13);
  const out = new Uint8Array(188 * packets.length);
  packets.forEach((value, index) => out.set(value, index * 188));
  return out;
}

function findAscii(bytes: Uint8Array, text: string): number {
  const needle = new TextEncoder().encode(text);
  outer: for (let offset = 0; offset + needle.length <= bytes.length; offset++) {
    for (let index = 0; index < needle.length; index++) {
      if (bytes[offset + index] !== needle[index]) continue outer;
    }
    return offset;
  }
  return -1;
}

function writeU32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function deferred<T>(): { promise: Promise<T>; resolve(value?: T): void; reject(error: unknown): void } {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve: (value?: T) => resolve(value as T), reject };
}
