import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  normalizeScenarioPacketEvidenceForGolden,
  scenarioPacketEnvelopeForGolden,
} from '../fixtures/bake-scenario-goldens.mjs';
import { canonicalSha256 } from '../fixtures/lib/golden-normalization.mjs';
import {
  auditGeneration,
  publishGeneration,
  writePrevalidatedCompactGoldenSource,
} from '../fixtures/lib/generation-publication.mjs';
import { readCompactGoldenPacketRows } from '../src/core/lossless-json-columnar.ts';

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('scenario massive-candidate golden memory path', () => {
  test('scenario producer streams through publication and remains runtime-decodable and auditable', () => {
    const root = temporaryRoot();
    const assetId = 'scenarios/demux/massive-default/01.mp4';
    const media = Buffer.from('hermetic-scenario-candidate');
    const mediaPath = join(root, '01.mp4');
    writeFileSync(mediaPath, media);

    const probe = packetProbe();
    const payload = normalizeScenarioPacketEvidenceForGolden(probe, {
      assetId,
      // Exercise the massive-candidate branch without constructing a massive fixture.
      compactThreshold: 1,
      decodedUnits: [
        { streamIndex: 0, ptsUs: 0, durationUs: 40_000, sha256: 'a'.repeat(64) },
        { streamIndex: 0, ptsUs: 40_000, durationUs: 40_000, sha256: 'b'.repeat(64) },
      ],
      decoderObservation: { state: 'validated' },
    });
    expect(payload).toMatchObject({
      schema: 'media-test/golden-packets-columnar@1',
      rowCount: 2,
    });
    expect(probe.packets).toEqual([null, null]);
    expect(probe.frames).toEqual([null, null]);

    const envelope = scenarioPacketEnvelopeForGolden(assetId, mediaPath, payload);
    const compactSource = join(root, 'candidate.packets.json');
    const prevalidatedCompactGoldenSource = writePrevalidatedCompactGoldenSource(envelope, compactSource);
    const manifest = {
      $schema: './schemas/fixture-manifest-v1.schema.json',
      suiteCorpusVersion: 'scenario-memory-test',
      assets: [{ id: assetId, source: 'provided', sha256: digest(media), sizeBytes: media.byteLength }],
    };
    const published = publishGeneration({
      rootDir: root,
      sourceDateEpoch: 0,
      publicationScope: { mode: 'selected-assets', assetIds: [assetId] },
      artifacts: [
        {
          logicalPath: `golden/${assetId}.packets.json`,
          artifactKind: 'packets',
          sourcePath: compactSource,
          sourceMediaSha256: digest(media),
          provenanceSha256: canonicalSha256(envelope.provenance),
          prevalidatedCompactGoldenSource,
        },
        rawArtifact('manifest.json', Buffer.from(`${JSON.stringify(manifest)}\n`), 'manifest'),
        rawArtifact(`media/${assetId}`, media, 'media'),
      ],
    });

    expect(auditGeneration(root, published.index)).toMatchObject({ ok: true, checked: 3, issues: [] });
    const document = JSON.parse(readFileSync(
      join(published.generationDirectory, `golden/${assetId}.packets.json`),
      'utf8',
    ));
    expect(readCompactGoldenPacketRows(document.payload)).toEqual([
      expect.objectContaining({ trackIndex: 0, ptsUs: 0, dtsUs: 0, size: 7, keyframe: true }),
      expect.objectContaining({ trackIndex: 0, ptsUs: 40_000, dtsUs: 40_000, size: 9, keyframe: false }),
    ]);
  });

  test('scenario entrypoint keeps massive evidence off buffered/stringified paths', () => {
    const source = readFileSync('fixtures/bake-scenario-goldens.mjs', 'utf8');
    const compactDecision = source.indexOf(
      'preparePacketProbeForNormalization(captured, DEFAULT_COMPACT_PACKET_ROW_THRESHOLD)',
    );
    const streamProbe = source.indexOf('const streamProbe = ffprobeJson(', compactDecision);
    expect(compactDecision).toBeGreaterThanOrEqual(0);
    expect(streamProbe).toBeGreaterThan(compactDecision);
    expect(source).toContain('runStreamingFfprobePacketProbe({');
    expect(source).toContain('packetSource: prepared.packetSource');
    expect(source).toContain('captured.cleanup()');
    expect(source).not.toContain('ffprobeJson(buildGoldenPacketProbeArgs(inOpts, mediaPath)');
    expect(source).toContain('consumeSource: compactStorage');
    expect(source).toContain("stdio: ['ignore', outputFd, 'pipe']");
    expect(source).toContain('iterateMappedFrameMd5Lines(readUtf8LinesSync(outputPath), inputStreams)');
    expect(source).toContain('spoolDecodedUnitSource({');
    expect(source).toContain('decodedEvidence.decoded.cleanup()');
    expect(source).not.toContain('parseMappedFrameMd5(result.stdout, inputStreams)');
    expect(source).toContain('await writePrevalidatedCompactGoldenSource(');
    expect(source).toContain('fileBackedCompactGoldenPacketPayloadIdentity(document.payload).sizeBytes >=');
    expect(source).toContain('COMPRESSED_COMPACT_GOLDEN_THRESHOLD_BYTES');
    expect(source).toContain('copyFileSync(artifact.sourcePath, artifact.directPath)');
    expect(source).not.toContain("createHash('sha256').update(readFileSync(path))");
  });
});

function packetProbe(): any {
  return {
    streams: [{
      index: 0,
      codec_type: 'video',
      codec_name: 'h264',
      codec_tag_string: 'avc1',
      time_base: '1/1000',
      nal_length_size: '4',
    }],
    packets: [
      {
        stream_index: 0, size: '7', pts: '0', dts: '0', duration: '40', flags: 'K__',
        data_hash: `SHA256:${'1'.repeat(64)}`,
      },
      {
        stream_index: 0, size: '9', pts: '40', dts: '40', duration: '40', flags: '___',
        data_hash: `SHA256:${'2'.repeat(64)}`,
      },
    ],
    frames: [
      { stream_index: 0, pts_time: '0', key_frame: 1, pict_type: 'I' },
      { stream_index: 0, pts_time: '0.04', key_frame: 0, pict_type: 'P' },
    ],
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
      recipe: 'tests/fixture-scenario-golden-memory#raw',
      bakerVersion: 'fixture-scenario-memory-test@1',
      outputArtifactSha256: sha256,
    },
  };
}

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'media-test-scenario-memory-'));
  roots.push(root);
  return root;
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
