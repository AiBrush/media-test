import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as flatBaker from '../fixtures/bake.mjs';
import {
  normalizeScenarioPacketEvidenceForGolden,
} from '../fixtures/bake-scenario-goldens.mjs';
import {
  createGoldenEnvelope,
  createGoldenProvenance,
} from '../fixtures/lib/golden-contract.mjs';
import { inspectCompactGoldenPayloadFile } from '../fixtures/lib/compact-golden-file.mjs';
import {
  PACKET_SEMANTICS_VERSION,
  canonicalJson,
  canonicalSha256,
  normalizeGoldenPacketEvidence,
} from '../fixtures/lib/golden-normalization.mjs';
import { validateCompactGoldenPacketPayload } from '../fixtures/lib/lossless-json-columnar-validator.mjs';
import {
  publishGeneration,
  writePrevalidatedCompactGoldenSource,
} from '../fixtures/lib/generation-publication.mjs';
import { readCompactGoldenPacketRows } from '../src/core/lossless-json-columnar.ts';

const roots: string[] = [];
const contradiction = /zero raw packet rows cannot coexist with decoded(?:\/frame)? semantic evidence/i;

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('zero-packet golden evidence invariant', () => {
  test('shared normalization rejects decoded/frame evidence without a raw packet timeline', () => {
    expect(() => normalizeGoldenPacketEvidence(contradictoryProbe(), contradictoryOptions()))
      .toThrow(contradiction);

    const empty = normalizeGoldenPacketEvidence(emptyProbe(), {
      assetId: 'legitimately-empty.bin',
      decodedUnits: [],
      decoderObservation: { state: 'not-run' },
    });
    expect(empty).toMatchObject({
      packets: [],
      raw: { packets: [] },
      semantic: { accessUnits: [], decoder: { state: 'not-run', decodedUnits: 0 } },
    });
  });

  test('flat baker packet wrapper rejects the same contradictory producer observations', () => {
    const normalizeFlatPacketEvidenceForGolden = (
      flatBaker as Record<string, unknown>
    ).normalizeFlatPacketEvidenceForGolden;
    expect(typeof normalizeFlatPacketEvidenceForGolden).toBe('function');
    expect(() => (normalizeFlatPacketEvidenceForGolden as Function)(
      contradictoryProbe(),
      contradictoryOptions(),
    )).toThrow(contradiction);
  });

  test('scenario baker packet wrapper rejects the same contradictory producer observations', () => {
    expect(() => normalizeScenarioPacketEvidenceForGolden(
      contradictoryProbe(),
      contradictoryOptions(),
    )).toThrow(contradiction);
  });

  test('publication rejects stale ready evidence with semantic units but no raw packets', () => {
    const root = temporaryRoot();
    const media = Buffer.from('stale-zero-packet-source');
    const sourceMedia = { sha256: digest(media), sizeBytes: media.byteLength };
    const payload = staleZeroPacketPayload();
    const provenance = createGoldenProvenance({
      artifactKind: 'packets',
      assetId: 'asset.mp4',
      sourceMedia,
      recipe: 'tests/fixture-zero-packet-evidence#stale-expanded-packets',
      normalizedArguments: { assetId: 'asset.mp4', artifactKind: 'packets' },
      baker: 'fixture-zero-packet-test@1',
      perimeter: recordedPerimeter(),
      payload,
      sourceDateEpoch: 0,
    });
    const envelope = createGoldenEnvelope({
      artifactKind: 'packets',
      assetId: 'asset.mp4',
      sourceMedia,
      payload,
      provenance,
    });
    const manifest = {
      $schema: './schemas/fixture-manifest-v1.schema.json',
      suiteCorpusVersion: 'zero-packet-regression',
      assets: [{ id: 'asset.mp4', source: 'generated', ...sourceMedia }],
    };

    expect(() => publishGeneration({
      rootDir: root,
      publicationScope: { mode: 'selected-assets', assetIds: ['asset.mp4'] },
      sourceDateEpoch: 0,
      artifacts: [
        {
          logicalPath: 'golden/asset.mp4.packets.json',
          artifactKind: 'packets',
          bytes: Buffer.from(`${canonicalJson(envelope)}\n`),
          sourceMediaSha256: sourceMedia.sha256,
          provenanceSha256: canonicalSha256(provenance),
        },
        rawArtifact('manifest.json', Buffer.from(`${JSON.stringify(manifest)}\n`), 'manifest'),
        rawArtifact('media/asset.mp4', media, 'media'),
      ],
    })).toThrow(contradiction);
    expect(existsSync(join(root, 'generation-index.json'))).toBe(false);
  });

  test('compact object, standalone-file, publication, and runtime paths reject the same stale shape', () => {
    const root = temporaryRoot();
    const stale = compactValidatedPayload() as any;
    stale.rowCount = 0;
    const packetsEntry = stale.storage.root.entries.find((entry: any[]) => entry[0] === 'packets');
    packetsEntry[1] = { $type: 'array', values: [] };

    expect(() => validateCompactGoldenPacketPayload(stale)).toThrow(contradiction);
    expect(() => readCompactGoldenPacketRows(stale)).toThrow(contradiction);
    const stalePath = join(root, 'stale-compact-payload.json');
    writeFileSync(stalePath, canonicalJson(stale));
    expect(() => inspectCompactGoldenPayloadFile(stalePath)).toThrow(contradiction);

    const sourceMedia = { sha256: digest('compact-source'), sizeBytes: 14 };
    const provenance = createGoldenProvenance({
      artifactKind: 'packets',
      assetId: 'compact-stale.mp4',
      sourceMedia,
      recipe: 'tests/fixture-zero-packet-evidence#compact-stale',
      normalizedArguments: { assetId: 'compact-stale.mp4', artifactKind: 'packets' },
      baker: 'fixture-zero-packet-test@1',
      perimeter: recordedPerimeter(),
      payload: stale,
      sourceDateEpoch: 0,
    });
    const envelope = createGoldenEnvelope({
      artifactKind: 'packets', assetId: 'compact-stale.mp4', sourceMedia, payload: stale, provenance,
    });
    expect(() => writePrevalidatedCompactGoldenSource(envelope, join(root, 'stale-envelope.json')))
      .toThrow(contradiction);

    const empty = normalizeGoldenPacketEvidence(emptyProbe(), {
      assetId: 'compact-empty.mp4',
      decodedUnits: [],
      decoderObservation: { state: 'not-run' },
      compactStorage: true,
    });
    expect(validateCompactGoldenPacketPayload(empty)).toMatchObject({
      packetRowCount: 0, semanticAccessUnitCount: 0, decodedUnitCount: 0,
    });
    expect(readCompactGoldenPacketRows(empty)).toEqual([]);
    const emptyPath = join(root, 'empty-compact-payload.json');
    writeFileSync(emptyPath, canonicalJson(empty));
    expect(inspectCompactGoldenPayloadFile(emptyPath)).toMatchObject({
      packetRowCount: 0, semanticAccessUnitCount: 0, decodedUnitCount: 0,
    });
  });
});

function compactValidatedPayload(): any {
  const probe = emptyProbe();
  probe.packets = [{
    stream_index: 0, size: '7', pts: '0', dts: '0', duration: '40', flags: 'K__',
  }];
  probe.frames = [{ stream_index: 0, pts_time: '0', key_frame: 1, pict_type: 'I' }];
  return normalizeGoldenPacketEvidence(probe, {
    assetId: 'compact-valid.mp4',
    decodedUnits: [{ streamIndex: 0, ptsUs: 0, durationUs: 40_000, sha256: 'a'.repeat(64) }],
    decoderObservation: { state: 'validated' },
    compactStorage: true,
  });
}

function contradictoryOptions(): any {
  return {
    assetId: 'asset.mp4',
    decodedUnits: [{
      streamIndex: 0,
      ptsUs: 0,
      durationUs: 40_000,
      sha256: 'a'.repeat(64),
    }],
    decoderObservation: { state: 'validated' },
  };
}

function contradictoryProbe(): any {
  return {
    ...emptyProbe(),
    frames: [{ stream_index: 0, pts_time: '0', key_frame: 1, pict_type: 'I' }],
  };
}

function emptyProbe(): any {
  return {
    format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2' },
    streams: [{
      index: 0,
      codec_type: 'video',
      codec_name: 'h264',
      codec_tag_string: 'avc1',
      time_base: '1/1000',
    }],
    packets: [],
    frames: [],
  };
}

/** Literal stale output: setup must remain constructible after the producer starts rejecting it. */
function staleZeroPacketPayload(): any {
  const logicalTrack = canonicalJson({ codec: 'h264', language: null, type: 'video' });
  return {
    schema: 'media-test/golden-packets@1',
    schemaVersion: PACKET_SEMANTICS_VERSION,
    raw: {
      streams: [{
        index: 0,
        codecName: 'h264',
        codecTag: 'avc1',
        codecType: 'video',
        timeBase: '1/1000',
      }],
      packets: [],
    },
    semantic: {
      accessUnits: [{
        logicalTrack,
        ptsUs: 0,
        durationUs: 40_000,
        contentIdentity: `decoded:${'a'.repeat(64)}`,
        randomAccess: 'random-access',
        randomAccessEvidence: { source: 'decoded-frame', pictType: 'I' },
        decodable: true,
        accessUnitIndex: 0,
      }],
      decoder: { state: 'validated', decodedUnits: 1 },
    },
    representation: {
      tracks: [{
        trackIndex: 0,
        type: 'video',
        codecRaw: 'avc1',
        codecCanonical: 'h264',
        framing: 'length-prefixed',
        parameterSetLocation: 'unknown',
      }],
      packets: [],
    },
    packets: [],
  };
}

function rawArtifact(logicalPath: string, bytes: Uint8Array, artifactKind: string): any {
  const sha256 = digest(bytes);
  return {
    logicalPath,
    artifactKind,
    bytes,
    sourceMediaSha256: sha256,
    provenanceSha256: 'c'.repeat(64),
    audit: {
      recipe: 'tests/fixture-zero-packet-evidence#raw',
      bakerVersion: 'fixture-zero-packet-test@1',
      outputArtifactSha256: sha256,
    },
  };
}

function recordedPerimeter(): any {
  const present = (name: string) => ({
    state: 'present', executable: name, versionOutput: `${name} test-version`,
  });
  return {
    schemaVersion: 'tool-perimeter@1',
    tools: {
      bun: present('bun'),
      ffmpeg: present('ffmpeg'),
      ffprobe: present('ffprobe'),
      bento4: { state: 'absent' },
      bento4Hls: { state: 'absent' },
      shakaPackager: { state: 'absent' },
      playwright: { state: 'not-applicable' },
      browser: { state: 'not-applicable' },
    },
    platform: { os: 'test', release: 'test', arch: 'test', locale: 'C', timezone: 'UTC' },
    environment: {
      SOURCE_DATE_EPOCH: '0',
      LANG: 'C',
      LC_ALL: 'C',
      TZ: 'UTC',
      BRAVE_PATH: null,
      FFMPEG_PATH: null,
      FFPROBE_PATH: null,
    },
    declaredLock: {
      sha256: 'd'.repeat(64),
      sourceDateEpoch: 0,
      locale: 'C',
      timezone: 'UTC',
      required: { bun: 'test', ffmpeg: 'test', ffprobe: 'test' },
      optional: {},
    },
  };
}

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'media-test-zero-packet-'));
  roots.push(root);
  return root;
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
