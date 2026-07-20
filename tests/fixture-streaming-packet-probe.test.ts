import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DEFAULT_COMPACT_PACKET_ROW_THRESHOLD,
  canonicalJson,
  expandCompactGoldenPacketEvidence,
  normalizeGoldenPacketEvidence,
} from '../fixtures/lib/golden-normalization.mjs';
import {
  isFileBackedCompactGoldenPacketPayload,
  spliceFileBackedCompactGoldenPacketPayload,
} from '../fixtures/lib/file-backed-compact-payload.mjs';
import {
  preparePacketProbeForNormalization,
  runStreamingPacketJsonCommand,
} from '../fixtures/lib/streaming-ffprobe-packet-probe.mjs';

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('streaming ffprobe packet capture', () => {
  test('disk-backed packet rows are canonically identical to the legacy array input', () => {
    const root = temporaryRoot();
    const script = childScript(root);
    const captured = runStreamingPacketJsonCommand({
      command: process.execPath,
      args: [script, 'small'],
      label: 'boundary-heavy packet probe',
      temporaryRoot: root,
    });
    const directory = captured.temporaryDirectory;
    try {
      expect(captured.packetCount).toBe(4);
      expect(existsSync(join(directory, 'ffprobe.json'))).toBe(false);
      expect(existsSync(join(directory, 'packets.ndjson'))).toBe(true);

      const materialized = preparePacketProbeForNormalization(captured, 5);
      expect(materialized.compactStorage).toBe(false);
      expect(materialized.probe.packets).toHaveLength(4);
      expect(materialized.probe.format.tags.boundary).toEndWith('é"\\\n');

      const diskBacked = preparePacketProbeForNormalization(captured, 4);
      expect(diskBacked.compactStorage).toBe(true);
      expect(diskBacked.probe).not.toHaveProperty('packets');
      expect([...diskBacked.packetSource.rows()]).toEqual(materialized.probe.packets);

      const options = {
        assetId: 'streaming-parity.mp4',
        decodedUnits: [
          { streamIndex: 0, ptsUs: 0, durationUs: 33_333, sha256: 'a'.repeat(64) },
          { streamIndex: 0, ptsUs: 33_333, durationUs: 33_333, sha256: 'b'.repeat(64) },
          { streamIndex: 1, ptsUs: 0, durationUs: 21_333, sha256: 'c'.repeat(64) },
        ],
        decoderObservation: { state: 'validated' },
        compactStorage: true,
      };
      const arrayPayload = normalizeGoldenPacketEvidence(structuredClone(materialized.probe), options);
      const diskPayload = materializeCompactPayload(normalizeGoldenPacketEvidence(
        { ...captured.probe },
        { ...options, packetSource: captured.packetSource },
      ));

      expect(canonicalJson(diskPayload)).toBe(canonicalJson(arrayPayload));
      const expanded = expandCompactGoldenPacketEvidence(diskPayload) as any;
      expect(expanded.packets).toHaveLength(4);
      expect(expanded.packets[0].decoderConfig).toBeDefined();
      expect(expanded.packets[2].decoderConfig).toBeDefined();
      expect(expanded.raw.packets[3]).toEqual({ streamIndex: 0, size: 13 });

      const changingSource = {
        rowCount: 4,
        *rows() {
          yield* materialized.probe.packets.slice(0, 3);
        },
      };
      expect(() => normalizeGoldenPacketEvidence(
        { ...captured.probe },
        { ...options, packetSource: changingSource },
      )).toThrow(/packetSource row count changed/);
    } finally {
      captured.cleanup();
    }
    expect(existsSync(directory)).toBe(false);
  });

  test('100,001 realistic rows exceed a buffered child cap but remain disk-backed before compaction', () => {
    const root = temporaryRoot();
    const script = childScript(root);
    const packetCount = DEFAULT_COMPACT_PACKET_ROW_THRESHOLD + 1;

    const buffered = spawnSync(process.execPath, [script, 'large', String(packetCount)], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024,
    });
    expect(buffered.error?.code).toBe('ENOBUFS');

    const captured = runStreamingPacketJsonCommand({
      command: process.execPath,
      args: [script, 'large', String(packetCount)],
      label: 'massive packet probe',
      temporaryRoot: root,
    });
    const directory = captured.temporaryDirectory;
    try {
      expect(captured.packetCount).toBe(packetCount);
      const prepared = preparePacketProbeForNormalization(
        captured,
        DEFAULT_COMPACT_PACKET_ROW_THRESHOLD,
      );
      expect(prepared).toMatchObject({ compactStorage: true, packetCount });
      expect(prepared.probe).not.toHaveProperty('packets');
      expect(prepared.packetSource.rowCount).toBe(packetCount);
      expect(existsSync(join(directory, 'ffprobe.json'))).toBe(false);
      expect(existsSync(join(directory, 'packets.ndjson'))).toBe(true);

      const rows = prepared.packetSource.rows();
      expect(rows.next().value).toMatchObject({
        stream_index: 0,
        size: '900',
        pts: '0',
        flags: 'K__',
      });
      rows.return?.();
    } finally {
      captured.cleanup();
    }
    expect(existsSync(directory)).toBe(false);
  }, 30_000);

  test('malformed JSON removes the private spool directory', () => {
    const root = temporaryRoot();
    const script = childScript(root);
    expect(() => runStreamingPacketJsonCommand({
      command: process.execPath,
      args: [script, 'malformed'],
      label: 'malformed packet probe',
      temporaryRoot: root,
    })).toThrow(/unexpected end|separator|expected/);
    expect(readdirSync(root).filter((name) => name.startsWith('media-test-ffprobe-packets-'))).toEqual([]);
  });

  test('an omitted empty packets section retains legacy zero-row semantics', () => {
    const root = temporaryRoot();
    const script = childScript(root);
    const captured = runStreamingPacketJsonCommand({
      command: process.execPath,
      args: [script, 'empty'],
      label: 'empty packet probe',
      temporaryRoot: root,
    });
    try {
      expect(captured.packetCount).toBe(0);
      expect([...captured.packetSource.rows()]).toEqual([]);
      expect(preparePacketProbeForNormalization(captured, 1)).toMatchObject({
        compactStorage: false,
        packetCount: 0,
        probe: { packets: [] },
      });
    } finally {
      captured.cleanup();
    }
  });
});

function materializeCompactPayload(payload: any): any {
  if (!isFileBackedCompactGoldenPacketPayload(payload)) return payload;
  const chunks: Uint8Array[] = [];
  spliceFileBackedCompactGoldenPacketPayload(payload, (bytes) => chunks.push(bytes.slice()));
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'media-test-streaming-packets-'));
  roots.push(root);
  return root;
}

function childScript(root: string): string {
  const path = join(root, 'packet-output.mjs');
  writeFileSync(path, `
import { writeSync } from 'node:fs';

function emit(text) {
  const bytes = Buffer.from(text);
  let offset = 0;
  while (offset < bytes.byteLength) {
    const written = writeSync(1, bytes, offset, bytes.byteLength - offset);
    if (written === 0) throw new Error('stdout write made no progress');
    offset += written;
  }
}

const mode = process.argv[2];
if (mode === 'malformed') {
  emit('{"packets":[{"stream_index":0}');
} else if (mode === 'empty') {
  emit('{"format":{"format_name":"data"},"streams":[]}');
} else if (mode === 'small') {
  const boundary = 'x'.repeat(65_500) + 'é"\\\\\\n';
  emit(JSON.stringify({
    format: {
      format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
      tags: { boundary },
    },
    streams: [
      {
        index: 0,
        codec_type: 'video',
        codec_name: 'h264',
        codec_tag_string: 'avc1',
        time_base: '1/90000',
        nal_length_size: '4',
        extradata: '00000000: 0164001f ffe10004 6764001f 01000268 ee',
        extradata_hash: 'sha256:' + 'f'.repeat(64),
      },
      {
        index: 1,
        codec_type: 'audio',
        codec_name: 'aac',
        codec_tag_string: 'mp4a',
        time_base: '1/48000',
        extradata: '00000000: 1210',
        extradata_hash: 'sha256:' + 'e'.repeat(64),
      },
    ],
    frames: [
      { stream_index: 0, best_effort_timestamp_time: '0', key_frame: 1, pict_type: 'I' },
      { stream_index: 0, best_effort_timestamp_time: '0.033333', key_frame: 0, pict_type: 'P' },
    ],
    packets: [
      {
        stream_index: 0,
        size: '11',
        pts: '0',
        dts: '-3000',
        duration: '3000',
        pts_time: '0',
        dts_time: '-0.033333',
        duration_time: '0.033333',
        flags: 'K__',
        pos: '48',
        data_hash: 'SHA256:' + '1'.repeat(64),
      },
      {
        stream_index: 0,
        size: 12,
        pts: 3000,
        duration: 3000,
        pts_time: '0.033333',
        duration_time: '0.033333',
        flags: '___',
        data_hash: 'sha256:' + '2'.repeat(64),
      },
      {
        stream_index: 1,
        size: '7',
        pts: '0',
        dts: '0',
        duration: '1024',
        flags: 'K__',
        pos: '71',
        data_hash: 'sha256:' + '3'.repeat(64),
      },
      { stream_index: 0, size: '13', note: 'escaped é " \\\\ newline\\n' },
    ],
    programs: [],
  }));
} else if (mode === 'large') {
  const count = Number(process.argv[3]);
  emit('{"format":{"format_name":"mov,mp4,m4a,3gp,3g2,mj2"},"streams":[{"index":0,"codec_type":"video","codec_name":"h264","codec_tag_string":"avc1","time_base":"1/90000","nal_length_size":"4"}],"packets":[');
  let pending = '';
  for (let index = 0; index < count; index++) {
    const ticks = index * 3003;
    const row = {
      stream_index: 0,
      size: String(900 + (index % 401)),
      pts: String(ticks),
      dts: String(ticks - 6006),
      duration: '3003',
      pts_time: (index * 1001 / 30000).toFixed(6),
      dts_time: ((index - 2) * 1001 / 30000).toFixed(6),
      duration_time: '0.033367',
      flags: index % 30 === 0 ? 'K__' : '___',
      pos: String(48 + index * 1024),
      data_hash: 'SHA256:' + (index % 16).toString(16).repeat(64),
    };
    pending += (index ? ',' : '') + JSON.stringify(row);
    if (pending.length >= 64 * 1024) {
      emit(pending);
      pending = '';
    }
  }
  emit(pending + ']}');
} else {
  throw new Error('unknown mode');
}
`);
  return path;
}
