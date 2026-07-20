import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  canonicalJson,
  canonicalJsonIdentity,
  compactGoldenPacketEvidence,
  expandCompactGoldenPacketEvidence,
  normalizeGoldenPacketEvidence,
} from '../fixtures/lib/golden-normalization.mjs';
import {
  scenarioPacketEnvelopeForGolden,
} from '../fixtures/bake-scenario-goldens.mjs';
import { inspectCompactGoldenFile } from '../fixtures/lib/compact-golden-file.mjs';
import {
  fileBackedCompactGoldenPacketPayloadIdentity,
  fileBackedCompactGoldenPacketPayloadSourcePath,
  spliceFileBackedCompactGoldenPacketPayload,
} from '../fixtures/lib/file-backed-compact-payload.mjs';
import { encodeFileBackedCompactPacketPayload } from '../fixtures/lib/sqlite-file-column-compact-encoder.mjs';
import { writePrevalidatedCompactGoldenSource } from '../fixtures/lib/generation-publication.mjs';
import { validateCompactGoldenPacketPayload } from '../fixtures/lib/lossless-json-columnar-validator.mjs';
import { readCompactGoldenPacketRows } from '../src/core/lossless-json-columnar.ts';

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('SQLite file-column compact encoder', () => {
  test('matches the canonical in-memory compact payload for small multi-track evidence', () => {
    const root = temporaryRoot();
    const logical = normalizeGoldenPacketEvidence(packetProbe(), {
      assetId: 'sqlite-parity.mp4',
      decodedUnits: decodedUnits(),
      decoderObservation: { state: 'validated' },
    }) as any;
    const expected = normalizeGoldenPacketEvidence(packetProbe(), {
      assetId: 'sqlite-parity.mp4',
      decodedUnits: decodedUnits(),
      decoderObservation: { state: 'validated' },
      compactStorage: true,
    });
    const payload = encodeFileBackedCompactPacketPayload({
      rowCount: logical.packets.length,
      decoderObservation: logical.semantic.decoder,
      temporaryRoot: root,
      tables: logicalTables(logical),
    });
    const actualIdentity = fileBackedCompactGoldenPacketPayloadIdentity(payload);
    const payloadPath = fileBackedCompactGoldenPacketPayloadSourcePath(payload);
    expect(readdirSync(dirname(payloadPath)).sort()).toEqual(['payload.json']);
    const actualBytes = consumePayloadBytes(payload);
    expect(encoderDirectories(root)).toEqual([]);
    expect(actualBytes).toBe(canonicalJson(expected));
    expect(actualIdentity).toEqual(canonicalJsonIdentity(expected));
    expect(expandCompactGoldenPacketEvidence(JSON.parse(actualBytes))).toEqual(logical);
  });

  test('preserves semantic negative-zero fields and canonical identity through SQLite', () => {
    const root = temporaryRoot();
    const stream = {
      index: 0, codec_type: 'video', codec_name: 'h264', codec_tag_string: 'avc1',
      time_base: '1/1000', width: 16, height: 16,
    };
    const packet = {
      stream_index: 0, size: '1', pts_time: '-0.000000', dts_time: '-0.000000',
      duration_time: '-0.000000', flags: 'K__',
    };
    const unit = { streamIndex: 0, ptsUs: -0, durationUs: -0, sha256: 'a'.repeat(64) };
    const expected = normalizeGoldenPacketEvidence({ streams: [stream], packets: [packet] }, {
      assetId: 'sqlite-negative-zero.mp4',
      decodedUnits: [unit],
      decoderObservation: { state: 'validated' },
      compactStorage: true,
    }) as any;
    const payload = normalizeGoldenPacketEvidence({ streams: [stream] }, {
      assetId: 'sqlite-negative-zero.mp4',
      packetSource: rowSource([packet]),
      decodedUnitSource: rowSource([unit]),
      decoderObservation: { state: 'validated' },
      compactStorage: true,
      compactTemporaryRoot: root,
    }) as any;
    const actualIdentity = fileBackedCompactGoldenPacketPayloadIdentity(payload);
    const actualBytes = consumePayloadBytes(payload);

    expect(actualBytes).toBe(canonicalJson(expected));
    expect(actualIdentity).toEqual(canonicalJsonIdentity(expected));
    const semantic = expandCompactGoldenPacketEvidence(JSON.parse(actualBytes)).semantic.accessUnits[0];
    expect(Object.is(semantic.ptsUs, -0)).toBe(true);
    expect(Object.is(semantic.dtsUs, -0)).toBe(true);
    expect(Object.is(semantic.durationUs, -0)).toBe(true);
  });

  test('uses the legacy 1,024-row sample for structured value dictionaries', () => {
    const root = temporaryRoot();
    const values = Array.from({ length: 4_098 }, (_, index) =>
      index < 1_024 || index >= 3_072 ? ['same'] : [`unique-${index}`]);
    const logical = logicalPayloadWithStructuredValues(values);
    const expected = compactGoldenPacketEvidence(logical) as any;
    const payload = encodeFileBackedCompactPacketPayload({
      rowCount: values.length,
      decoderObservation: logical.semantic.decoder,
      temporaryRoot: root,
      tables: logicalTables(logical),
    });
    const actualIdentity = fileBackedCompactGoldenPacketPayloadIdentity(payload);
    const actualBytes = consumePayloadBytes(payload);

    expect(packetColumn(expected, 'parameterSetDigests').$type).toBe('value-dictionary');
    expect(actualBytes).toBe(canonicalJson(expected));
    expect(actualIdentity).toEqual(canonicalJsonIdentity(expected));
  });

  test('retains the legacy structured dictionary identity for positive and negative zero', () => {
    const root = temporaryRoot();
    const values = Array.from({ length: 16 }, (_, index) => [index % 2 === 0 ? 0 : -0]);
    const logical = logicalPayloadWithStructuredValues(values);
    const expected = compactGoldenPacketEvidence(logical) as any;
    const payload = encodeFileBackedCompactPacketPayload({
      rowCount: values.length,
      decoderObservation: logical.semantic.decoder,
      temporaryRoot: root,
      tables: logicalTables(logical),
    });
    const actualIdentity = fileBackedCompactGoldenPacketPayloadIdentity(payload);
    const actualBytes = consumePayloadBytes(payload);

    const expectedDictionary = packetColumn(expected, 'parameterSetDigests');
    expect(expectedDictionary.$type).toBe('value-dictionary');
    expect(expectedDictionary.values.values).toHaveLength(1);
    expect(actualBytes).toBe(canonicalJson(expected));
    expect(actualIdentity).toEqual(canonicalJsonIdentity(expected));
  });

  test('orders non-BMP record keys with canonical JavaScript UTF-16 ordering', () => {
    const root = temporaryRoot();
    const logical = logicalPayloadWithStructuredValues([['same']]);
    logical.packets[0]['\ue000'] = 'private-use';
    logical.packets[0]['😀'] = 'astral';
    const expected = compactGoldenPacketEvidence(logical) as any;
    const payload = encodeFileBackedCompactPacketPayload({
      rowCount: 1,
      decoderObservation: logical.semantic.decoder,
      temporaryRoot: root,
      tables: logicalTables(logical),
    });
    const actualIdentity = fileBackedCompactGoldenPacketPayloadIdentity(payload);
    const actualBytes = consumePayloadBytes(payload);

    const keys = rootEntry(expected, 'packets').columns.map((column: any) => column.key);
    expect(keys.indexOf('😀')).toBeLessThan(keys.indexOf('\ue000'));
    expect(actualBytes).toBe(canonicalJson(expected));
    expect(actualIdentity).toEqual(canonicalJsonIdentity(expected));
  });

  test('matches duplicate-PTS lookup, aggregation, and semantic ordering exactly', () => {
    const root = temporaryRoot();
    const stream = {
      index: 0, codec_type: 'video', codec_name: 'h264', codec_tag_string: 'avc1',
      time_base: '1/1000', width: 16, height: 16,
    };
    const packets = [
      { stream_index: 0, size: '1', pts: '1', dts: '-1', duration: '3', flags: '___', data_hash: `SHA256:${'1'.repeat(64)}` },
      { stream_index: 0, size: '2', pts: '1', dts: '0', duration: '5', flags: 'K__', data_hash: `SHA256:${'2'.repeat(64)}` },
    ];
    const units = [
      { streamIndex: 0, ptsUs: 1_000, durationUs: 4_000, sha256: 'b'.repeat(64) },
      { streamIndex: 0, ptsUs: 1_000, sha256: 'a'.repeat(64) },
      { streamIndex: 0, ptsUs: 1_000, sha256: 'a'.repeat(64) },
    ];
    const expected = normalizeGoldenPacketEvidence({ streams: [stream], packets }, {
      assetId: 'sqlite-duplicate-pts.mp4',
      decodedUnits: units,
      decoderObservation: { state: 'validated' },
      compactStorage: true,
    });
    const payload = normalizeGoldenPacketEvidence({ streams: [stream] }, {
      assetId: 'sqlite-duplicate-pts.mp4',
      packetSource: rowSource(packets),
      decodedUnitSource: rowSource(units),
      decoderObservation: { state: 'validated' },
      compactStorage: true,
      compactTemporaryRoot: root,
    }) as any;
    const actualIdentity = fileBackedCompactGoldenPacketPayloadIdentity(payload);
    const actualBytes = consumePayloadBytes(payload);

    expect(actualBytes).toBe(canonicalJson(expected));
    expect(actualIdentity).toEqual(canonicalJsonIdentity(expected));
  });

  test('matches packet-derived duplicate grouping and decoded-frame precedence with an empty decoded source', () => {
    const root = temporaryRoot();
    const expectedProbe = packetDerivedProbe();
    const expected = normalizeGoldenPacketEvidence(expectedProbe, {
      assetId: 'sqlite-packet-semantic-empty-decoded.mp4',
      decodedUnits: [],
      decoderObservation: { state: 'not-run' },
      compactStorage: true,
    });
    const sourceProbe = packetDerivedProbe();
    const packets = sourceProbe.packets;
    delete sourceProbe.packets;
    const payload = normalizeGoldenPacketEvidence(sourceProbe, {
      assetId: 'sqlite-packet-semantic-empty-decoded.mp4',
      packetSource: rowSource(packets),
      decodedUnitSource: rowSource([]),
      decoderObservation: { state: 'not-run' },
      compactStorage: true,
      compactTemporaryRoot: root,
    }) as any;
    const actualIdentity = fileBackedCompactGoldenPacketPayloadIdentity(payload);
    expect(encoderDirectories(root)).toHaveLength(1);
    const actualBytes = consumePayloadBytes(payload);

    expect(actualBytes).toBe(canonicalJson(expected));
    expect(actualIdentity).toEqual(canonicalJsonIdentity(expected));
    expect(encoderDirectories(root)).toEqual([]);
    const accessUnits = expandCompactGoldenPacketEvidence(JSON.parse(actualBytes)).semantic.accessUnits;
    expect(accessUnits).toHaveLength(2);
    expect(accessUnits[0]).toMatchObject({
      dtsUs: -40_000,
      randomAccess: 'delta',
      randomAccessEvidence: { source: 'decoded-frame', pictType: 'P' },
      contentIdentities: ['1'.repeat(64), '2'.repeat(64)],
    });
    expect(accessUnits[1]).toMatchObject({
      randomAccess: 'random-access',
      randomAccessEvidence: { source: 'decoded-frame', pictType: 'I' },
      contentIdentities: ['3'.repeat(64)],
    });
  });

  test('matches packet-derived semantics when packetSource has no decoded input option', () => {
    const root = temporaryRoot();
    const observation = {
      state: 'reference-unavailable',
      reasonCode: 'REFERENCE_UNAVAILABLE',
      detail: 'bounded regression',
    };
    const expectedProbe = packetDerivedProbe();
    const expected = normalizeGoldenPacketEvidence(expectedProbe, {
      assetId: 'sqlite-packet-semantic-no-decoded.mp4',
      decoderObservation: observation,
      compactStorage: true,
    });
    const sourceProbe = packetDerivedProbe();
    const packets = sourceProbe.packets;
    delete sourceProbe.packets;
    const payload = normalizeGoldenPacketEvidence(sourceProbe, {
      assetId: 'sqlite-packet-semantic-no-decoded.mp4',
      packetSource: rowSource(packets),
      decoderObservation: observation,
      compactStorage: true,
      compactTemporaryRoot: root,
    }) as any;
    const actualIdentity = fileBackedCompactGoldenPacketPayloadIdentity(payload);
    expect(encoderDirectories(root)).toHaveLength(1);
    const actualBytes = consumePayloadBytes(payload);

    expect(actualBytes).toBe(canonicalJson(expected));
    expect(actualIdentity).toEqual(canonicalJsonIdentity(expected));
    expect(encoderDirectories(root)).toEqual([]);
  });

  test('publishes one canonical empty descriptor and removes its private root on consumption', () => {
    const root = temporaryRoot();
    const expected = normalizeGoldenPacketEvidence({ streams: [], packets: [], frames: [] }, {
      assetId: 'sqlite-zero-packets.mp4',
      decoderObservation: { state: 'not-run' },
      compactStorage: true,
    });
    const payload = normalizeGoldenPacketEvidence({ streams: [], frames: [] }, {
      assetId: 'sqlite-zero-packets.mp4',
      packetSource: rowSource([]),
      decoderObservation: { state: 'not-run' },
      compactStorage: true,
      compactTemporaryRoot: root,
    }) as any;
    const actualIdentity = fileBackedCompactGoldenPacketPayloadIdentity(payload);
    const directories = encoderDirectories(root);
    expect(directories).toHaveLength(1);
    const payloadPath = fileBackedCompactGoldenPacketPayloadSourcePath(payload);
    expect(dirname(payloadPath)).toBe(join(root, directories[0]));
    expect(readdirSync(dirname(payloadPath))).toEqual(['payload.json']);
    const actualBytes = consumePayloadBytes(payload);

    expect(actualBytes).toBe(canonicalJson(expected));
    expect(actualIdentity).toEqual(canonicalJsonIdentity(expected));
    expect(encoderDirectories(root)).toEqual([]);
    expect(() => fileBackedCompactGoldenPacketPayloadIdentity(payload)).toThrow(/already consumed/);
  });

  test('rejects more than the bounded number of semantic logical tracks and cleans up', () => {
    const root = temporaryRoot();
    const packet = { stream_index: 0, size: '1', pts: '0', dts: '0', duration: '1', flags: 'K__' };
    const decodedUnitSource = {
      rowCount: 1_025,
      *rows() {
        for (let index = 0; index < this.rowCount; index++) {
          yield { streamIndex: index, ptsUs: 0, durationUs: 1_000, sha256: hex64(index + 1) };
        }
      },
    };
    const probe = {
      streams: [{
        index: 0, codec_type: 'video', codec_name: 'h264', codec_tag_string: 'avc1',
        time_base: '1/1000', width: 16, height: 16,
      }],
    };

    expect(() => normalizeGoldenPacketEvidence(probe, {
      assetId: 'sqlite-track-limit.mp4',
      packetSource: rowSource([packet]),
      decodedUnitSource,
      decoderObservation: { state: 'validated' },
      compactStorage: true,
      compactTemporaryRoot: root,
    })).toThrow(/1,?024-track disk-encoder limit/);
    expect(encoderDirectories(root)).toEqual([]);
  });

  test('rejects the 1,025th packet track without retaining an unbounded first-track set', () => {
    const root = temporaryRoot();
    const packets = Array.from({ length: 1_025 }, (_, streamIndex) => ({
      stream_index: streamIndex,
      size: '1',
      pts: '0',
      dts: '0',
      duration: '1',
      flags: 'K__',
    }));

    expect(() => normalizeGoldenPacketEvidence({ streams: [] }, {
      assetId: 'sqlite-packet-track-limit.bin',
      packetSource: rowSource(packets),
      decodedUnitSource: rowSource([]),
      decoderObservation: { state: 'not-run' },
      compactStorage: true,
      compactTemporaryRoot: root,
    })).toThrow(/packet source exceeds the 1,?024-track disk-encoder limit/);
    expect(encoderDirectories(root)).toEqual([]);
  });

  test('source dispatch survives descriptor-envelope inspection and runtime decoding', () => {
    const root = temporaryRoot();
    const expected = normalizeGoldenPacketEvidence(packetProbe(), {
      assetId: 'sqlite-source-parity.mp4', decodedUnits: decodedUnits(),
      decoderObservation: { state: 'validated' }, compactStorage: true,
    }) as any;
    const sourceProbe = packetProbe();
    const packetRows = sourceProbe.packets;
    delete sourceProbe.packets;
    const payload = normalizeGoldenPacketEvidence(sourceProbe, {
      assetId: 'sqlite-source-parity.mp4',
      packetSource: rowSource(packetRows),
      decodedUnitSource: rowSource(decodedUnits()),
      decoderObservation: { state: 'validated' },
      compactStorage: true,
      compactTemporaryRoot: root,
    }) as any;
    expect(fileBackedCompactGoldenPacketPayloadIdentity(payload)).toEqual(canonicalJsonIdentity(expected));

    const mediaPath = join(root, 'sqlite-source-parity.mp4');
    writeFileSync(mediaPath, 'sqlite-source-media');
    const envelope = scenarioPacketEnvelopeForGolden('sqlite-source-parity.mp4', mediaPath, payload);
    const artifactPath = join(root, 'artifact.packets.json');
    writePrevalidatedCompactGoldenSource(envelope, artifactPath);
    const inspection = inspectCompactGoldenFile(artifactPath);
    expect(inspection).toMatchObject({
      packetRowCount: 4,
      semanticAccessUnitCount: 4,
      decodedUnitCount: 4,
      payloadSha256: canonicalJsonIdentity(expected).sha256,
      payloadSizeBytes: canonicalJsonIdentity(expected).sizeBytes,
    });
    const document = JSON.parse(readFileSync(artifactPath, 'utf8'));
    expect(validateCompactGoldenPacketPayload(document.payload)).toMatchObject({ packetRowCount: 4 });
    expect(readCompactGoldenPacketRows(document.payload)).toEqual(
      readCompactGoldenPacketRows(expected),
    );
    expect(expandCompactGoldenPacketEvidence(document.payload)).toEqual(
      expandCompactGoldenPacketEvidence(expected),
    );
  });

  test('malformed and count-changing sources fail and remove the private encoder root', () => {
    const root = temporaryRoot();
    const probe = packetProbe();
    const packets = probe.packets;
    delete probe.packets;
    const options = {
      assetId: 'sqlite-source-failure.mp4',
      packetSource: rowSource(packets),
      decodedUnitSource: rowSource([{ ...decodedUnits()[0], sha256: 'bad' }]),
      decoderObservation: { state: 'validated' },
      compactStorage: true,
      compactTemporaryRoot: root,
    };
    expect(() => normalizeGoldenPacketEvidence(probe, options)).toThrow(/invalid decoded unit/);
    expect(encoderDirectories(root)).toEqual([]);

    expect(() => normalizeGoldenPacketEvidence(probe, {
      ...options,
      decodedUnitSource: rowSource(decodedUnits()),
      packetSource: { rowCount: packets.length, *rows() { yield* packets.slice(0, -1); } },
    })).toThrow(/packetSource row count changed/);
    expect(encoderDirectories(root)).toEqual([]);

    expect(() => normalizeGoldenPacketEvidence(probe, {
      ...options,
      decodedUnitSource: { rowCount: decodedUnits().length, *rows() { yield* decodedUnits().slice(0, -1); } },
    })).toThrow(/decodedUnitSource row count changed/);
    expect(encoderDirectories(root)).toEqual([]);
  });
});

function consumePayloadBytes(payload: any): string {
  const chunks: Buffer[] = [];
  spliceFileBackedCompactGoldenPacketPayload(payload, (bytes) => chunks.push(Buffer.from(bytes)));
  return Buffer.concat(chunks).toString('utf8');
}

function logicalPayloadWithStructuredValues(values: any[][]): any {
  const packets = values.map((parameterSetDigests, index) => ({
    trackIndex: 0,
    size: 1,
    ptsUs: index,
    keyframe: false,
    parameterSetDigests,
  }));
  const rawPackets = values.map(() => ({
    streamIndex: 0,
    size: 1,
    pts: 0,
    dts: 0,
    duration: 1,
    ptsTime: '0',
    dtsTime: '0',
    durationTime: '1',
    flags: '___',
    dataHash: 'a'.repeat(64),
  }));
  const representationPackets = values.map((_, index) => ({
    trackIndex: 0,
    logicalTrack: 'track',
    size: 1,
    ptsUs: index,
  }));
  return {
    schema: 'media-test/golden-packets@1',
    schemaVersion: 'packet-semantics@1',
    packets,
    raw: { packets: rawPackets, streams: [] },
    representation: { packets: representationPackets, tracks: [] },
    semantic: { accessUnits: [], decoder: { state: 'not-run', decodedUnits: 0 } },
  };
}

function rootEntry(payload: any, key: string): any {
  return payload.storage.root.entries.find((entry: any[]) => entry[0] === key)?.[1];
}

function packetColumn(payload: any, key: string): any {
  return rootEntry(payload, 'packets').columns.find((column: any) => column.key === key)?.values;
}

function hex64(value: number): string {
  return value.toString(16).padStart(64, '0');
}

function packetDerivedProbe(): any {
  return {
    format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2' },
    streams: [{
      index: 0,
      codec_type: 'video',
      codec_name: 'h264',
      codec_tag_string: 'avc1',
      time_base: '1/1000',
      width: 16,
      height: 16,
    }],
    packets: [
      { stream_index: 0, size: '4', pts: '0', dts: '-40', duration: '40', flags: 'K__', data_hash: `SHA256:${'1'.repeat(64)}` },
      { stream_index: 0, size: '5', pts: '0', dts: '0', duration: '40', flags: '___', data_hash: `SHA256:${'2'.repeat(64)}` },
      { stream_index: 0, size: '6', pts: '40', dts: '40', duration: '40', flags: '___', data_hash: `SHA256:${'3'.repeat(64)}` },
      { stream_index: 0, size: '7', pts: '40', dts: '40', duration: '40', flags: '___', data_hash: `SHA256:${'3'.repeat(64)}` },
    ],
    frames: [
      { stream_index: 0, pts_time: '0', key_frame: 0, pict_type: 'P' },
      { stream_index: 0, pts_time: '0.04', key_frame: 1, pict_type: 'I' },
    ],
  };
}

function rowSource(rows: any[]): any {
  return { rowCount: rows.length, rows: () => rows.values() };
}

function encoderDirectories(root: string): string[] {
  return readdirSync(root).filter((name) => name.startsWith('media-test-compact-columns-'));
}

function logicalTables(logical: any): any {
  return {
    packets: table(logical.packets),
    raw_packets: table(logical.raw.packets, [
      'streamIndex', 'size', 'pts', 'dts', 'duration', 'ptsTime', 'dtsTime', 'durationTime', 'flags', 'dataHash',
    ]),
    raw_streams: table(logical.raw.streams),
    representation_packets: table(logical.representation.packets),
    representation_tracks: table(logical.representation.tracks),
    semantic_access_units: table(logical.semantic.accessUnits),
  };
}

function table(rows: any[], forcedKeys: string[] = []): any {
  return { rowCount: rows.length, forcedKeys, rows: () => rows.values() };
}

function decodedUnits(): any[] {
  return [
    { streamIndex: 0, ptsUs: 0, durationUs: 40_000, sha256: 'a'.repeat(64) },
    { streamIndex: 1, ptsUs: 0, durationUs: 21_333, sha256: 'b'.repeat(64) },
    { streamIndex: 0, ptsUs: 40_000, durationUs: 40_000, sha256: 'c'.repeat(64) },
    { streamIndex: 1, ptsUs: 21_333, durationUs: 21_333, sha256: 'd'.repeat(64) },
  ];
}

function packetProbe(): any {
  return {
    format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2' },
    streams: [
      {
        index: 1, codec_type: 'audio', codec_name: 'aac', codec_tag_string: 'mp4a',
        time_base: '1/48000', sample_rate: '48000', channels: 2,
      },
      {
        index: 0, codec_type: 'video', codec_name: 'h264', codec_tag_string: 'avc1',
        time_base: '1/1000', width: 320, height: 180, nal_length_size: '4',
        extradata: '00000000: 0164001f ffe10004 6764001f 01000268 ee',
      },
    ],
    packets: [
      { stream_index: 0, size: '7', pts: '0', dts: '0', duration: '40', flags: 'K__', data_hash: `SHA256:${'1'.repeat(64)}` },
      { stream_index: 1, size: '5', pts: '0', dts: '0', duration: '1024', flags: 'K__', data_hash: `SHA256:${'2'.repeat(64)}` },
      { stream_index: 0, size: '9', pts: '40', dts: '40', duration: '40', flags: '___', data_hash: `SHA256:${'3'.repeat(64)}` },
      { stream_index: 1, size: '6', pts: '1024', dts: '1024', duration: '1024', flags: '___', data_hash: `SHA256:${'4'.repeat(64)}` },
    ],
    frames: [
      { stream_index: 0, pts_time: '0', key_frame: 1, pict_type: 'I' },
      { stream_index: 0, pts_time: '0.04', key_frame: 0, pict_type: 'P' },
    ],
  };
}

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'media-test-sqlite-columns-test-'));
  roots.push(root);
  return root;
}
