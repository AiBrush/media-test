import { afterEach, describe, expect, test } from 'bun:test';
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DEFAULT_DECODED_UNIT_MATERIALIZATION_LIMIT,
  canonicalJson,
  canonicalJsonIdentity,
  iterateMappedFrameMd5Lines,
  normalizeGoldenPacketEvidence,
} from '../fixtures/lib/golden-normalization.mjs';
import {
  fileBackedCompactGoldenPacketPayloadIdentity,
  spliceFileBackedCompactGoldenPacketPayload,
} from '../fixtures/lib/file-backed-compact-payload.mjs';
import {
  prepareDecodedUnitsForNormalization,
  spoolDecodedUnitSource,
} from '../fixtures/lib/streaming-decoded-unit-source.mjs';

const roots: string[] = [];

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('streaming decoded-unit source', () => {
  test('small array and re-readable source inputs produce identical semantic evidence', () => {
    const root = temporaryRoot();
    const captured = spoolDecodedUnitSource({
      units: iterateMappedFrameMd5Lines(frameMd5Lines(), inputStreams()),
      label: 'array/source parity',
      temporaryRoot: root,
    });
    const directory = captured.temporaryDirectory;
    try {
      expect(captured.decodedUnitCount).toBe(2);
      expect(statSync(captured.rowsPath).mode & 0o777).toBe(0o600);
      const firstRead = [...captured.decodedUnitSource.rows()];
      expect([...captured.decodedUnitSource.rows()]).toEqual(firstRead);
      expect(firstRead.map((unit) => unit.streamIndex)).toEqual([0, 1]);

      const materialized = prepareDecodedUnitsForNormalization(captured);
      const options = {
        assetId: 'decoded-source-parity.mp4',
        decoderObservation: { state: 'validated' },
      };
      const arrayPayload = normalizeGoldenPacketEvidence(structuredClone(packetProbe()), {
        ...options,
        decodedUnits: materialized.decodedUnits,
      });
      const sourcePayload = normalizeGoldenPacketEvidence(structuredClone(packetProbe()), {
        ...options,
        decodedUnitSource: captured.decodedUnitSource,
      });

      expect(canonicalJson(sourcePayload)).toBe(canonicalJson(arrayPayload));
      expect((sourcePayload as any).semantic.decoder).toEqual({ state: 'validated', decodedUnits: 2 });
      expect((sourcePayload as any).semantic.accessUnits).toHaveLength(2);
    } finally {
      captured.cleanup();
    }
    expect(existsSync(directory)).toBe(false);
    expect(() => [...captured.decodedUnitSource.rows()]).toThrow(/closed/);
  });

  test('the fixed small-materialization cap keeps larger timelines disk-backed', () => {
    const root = temporaryRoot();
    const count = DEFAULT_DECODED_UNIT_MATERIALIZATION_LIMIT + 1;
    const captured = spoolDecodedUnitSource({
      units: generatedUnits(count),
      label: 'materialization cap',
      temporaryRoot: root,
    });
    try {
      const prepared = prepareDecodedUnitsForNormalization(captured);
      expect(prepared).toMatchObject({ decodedUnitCount: count });
      expect(prepared).toHaveProperty('decodedUnitSource', captured.decodedUnitSource);
      expect(prepared).not.toHaveProperty('decodedUnits');
    } finally {
      captured.cleanup();
    }
  });

  test('a small packet array plus 4,097 decoded units auto-promotes to file-column storage', () => {
    const root = temporaryRoot();
    const count = DEFAULT_DECODED_UNIT_MATERIALIZATION_LIMIT + 1;
    const captured = spoolDecodedUnitSource({
      units: generatedUnits(count),
      label: 'mixed packet/decoded thresholds',
      temporaryRoot: root,
    });
    try {
      const expectedProbe = packetProbe();
      expectedProbe.packets = expectedProbe.packets.slice(0, 1);
      const expected = normalizeGoldenPacketEvidence(structuredClone(expectedProbe), {
        assetId: 'mixed-thresholds.mp4',
        decodedUnits: [...generatedUnits(count)],
        decoderObservation: { state: 'validated' },
        compactStorage: true,
      });
      const payload = normalizeGoldenPacketEvidence(structuredClone(expectedProbe), {
        assetId: 'mixed-thresholds.mp4',
        decodedUnitSource: captured.decodedUnitSource,
        decoderObservation: { state: 'validated' },
        compactStorage: false,
        compactTemporaryRoot: root,
      }) as any;

      expect(fileBackedCompactGoldenPacketPayloadIdentity(payload)).toEqual(canonicalJsonIdentity(expected));
      const chunks: Uint8Array[] = [];
      spliceFileBackedCompactGoldenPacketPayload(payload, (bytes) => chunks.push(Buffer.from(bytes)));
      expect(Buffer.concat(chunks).toString('utf8')).toBe(canonicalJson(expected));
      expect(readdirSync(root).filter((name) => name.startsWith('media-test-compact-columns-'))).toEqual([]);
    } finally {
      captured.cleanup();
    }
  });

  test('malformed rows and changed counts fail closed, and every spool is removable', () => {
    const root = temporaryRoot();
    expect(() => spoolDecodedUnitSource({
      units: [decodedUnit(0), { ...decodedUnit(1), sha256: 'not-a-hash' }],
      label: 'malformed producer',
      temporaryRoot: root,
    })).toThrow(/invalid decoded unit/);
    expect(decodedSpoolDirectories(root)).toEqual([]);

    const malformed = spoolDecodedUnitSource({
      units: [decodedUnit(0)],
      label: 'malformed disk row',
      temporaryRoot: root,
    });
    writeFileSync(malformed.rowsPath, '{broken json}\n');
    expect(() => [...malformed.decodedUnitSource.rows()]).toThrow();
    malformed.cleanup();
    expect(existsSync(malformed.temporaryDirectory)).toBe(false);

    const oversized = spoolDecodedUnitSource({
      units: [decodedUnit(0)],
      label: 'oversized complete row',
      temporaryRoot: root,
    });
    const oversizedLine = `${JSON.stringify({ ...decodedUnit(0), padding: 'x'.repeat(5_000) })}\n`;
    writeFileSync(oversized.rowsPath, oversizedLine);
    expect(() => [...oversized.decodedUnitSource.rows()]).toThrow(/oversized row/);
    oversized.cleanup();

    const splitOversized = spoolDecodedUnitSource({
      units: [decodedUnit(0)],
      label: 'split oversized complete row',
      temporaryRoot: root,
    });
    writeFileSync(splitOversized.rowsPath, `${'\n'.repeat((64 * 1024) - 2_000)}${oversizedLine}`);
    expect(() => [...splitOversized.decodedUnitSource.rows()]).toThrow(/oversized row/);
    splitOversized.cleanup();

    const unterminatedOversized = spoolDecodedUnitSource({
      units: [decodedUnit(0)],
      label: 'unterminated oversized row',
      temporaryRoot: root,
    });
    writeFileSync(unterminatedOversized.rowsPath, oversizedLine.trimEnd());
    expect(() => [...unterminatedOversized.decodedUnitSource.rows()]).toThrow(/oversized row/);
    unterminatedOversized.cleanup();

    const changed = spoolDecodedUnitSource({
      units: [decodedUnit(0)],
      label: 'changed count',
      temporaryRoot: root,
    });
    appendFileSync(changed.rowsPath, `${JSON.stringify(decodedUnit(1))}\n`);
    expect(() => [...changed.decodedUnitSource.rows()]).toThrow(/changed row count/);
    changed.cleanup();
    changed.cleanup();
    expect(existsSync(changed.temporaryDirectory)).toBe(false);
    expect(decodedSpoolDirectories(root)).toEqual([]);
  });
});

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'media-test-decoded-source-test-'));
  roots.push(root);
  return root;
}

function decodedSpoolDirectories(root: string): string[] {
  return readdirSync(root).filter((name) => name.startsWith('media-test-decoded-units-'));
}

function* generatedUnits(count: number): Generator<any> {
  for (let index = 0; index < count; index++) yield decodedUnit(index);
}

function decodedUnit(index: number): any {
  return {
    streamIndex: index % 2,
    ptsUs: index * 1_000,
    durationUs: 1_000,
    sha256: (index + 1).toString(16).padStart(64, '0'),
  };
}

function frameMd5Lines(): string[] {
  return [
    '#tb 0: 1/1000',
    `0, 0, 0, 40, 0, ${'a'.repeat(64)}`,
    '#tb 1: 1/48000',
    `1, 0, 0, 1024, 0, ${'b'.repeat(64)}`,
  ];
}

function inputStreams(): any[] {
  return [
    { index: 1, codec_type: 'audio' },
    { index: 0, codec_type: 'video' },
  ];
}

function packetProbe(): any {
  return {
    format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2' },
    streams: [
      { index: 1, codec_type: 'audio', codec_name: 'aac', time_base: '1/48000' },
      { index: 0, codec_type: 'video', codec_name: 'h264', codec_tag_string: 'avc1', time_base: '1/1000' },
    ],
    packets: [
      { stream_index: 0, pts: '0', dts: '0', duration: '40', size: '9', flags: 'K__' },
      { stream_index: 1, pts: '0', dts: '0', duration: '1024', size: '7', flags: 'K__' },
    ],
    frames: [{ stream_index: 0, pts_time: '0', duration_time: '0.04', key_frame: 1, pict_type: 'I' }],
  };
}
