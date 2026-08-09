import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isMaterializedMediaAssetId,
  MATERIALIZED_MEDIA_ASSET_IDS,
  MATERIALIZED_MEDIA_MIN_BYTES,
  materializedMediaLogicalPath,
  stageMediaPublicationRecordByPolicy,
} from '../fixtures/lib/materialized-media-policy.mjs';

const temporaryRoots: string[] = [];
afterEach(() => {
  while (temporaryRoots.length > 0) rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
});

describe('materialized media bake policy', () => {
  test('contains exactly the two long-form root assets', () => {
    expect(MATERIALIZED_MEDIA_ASSET_IDS).toEqual([
      'massive_h264_1080p_2h.mp4',
      'massive_vp9_1080p_2h.webm',
    ]);
    expect(Object.isFrozen(MATERIALIZED_MEDIA_ASSET_IDS)).toBe(true);
  });

  test('matches exact asset ids without admitting scenario paths or substrings', () => {
    for (const assetId of MATERIALIZED_MEDIA_ASSET_IDS) {
      expect(isMaterializedMediaAssetId(assetId)).toBe(true);
      expect(materializedMediaLogicalPath(assetId)).toBe(`media/${assetId}`);
    }

    for (const assetId of [
      'h264_1080p_30s.mp4',
      'massive_h264_1080p_2h.mp4.backup',
      'scenarios/probe/massive_h264_1080p_2h.mp4',
      'scenarios/probe/massive_vp9_1080p_2h.webm',
    ]) {
      expect(isMaterializedMediaAssetId(assetId)).toBe(false);
      expect(materializedMediaLogicalPath(assetId)).toBeUndefined();
    }
  });

  test('routes legacy policy assets and every regular-blob-ceiling media source away from immutable storage', () => {
    const ready = new Map();
    const materialized = new Map();
    const availability = new Map();
    const root = mkdtempSync(join(tmpdir(), 'media-test-materialized-policy-'));
    temporaryRoots.push(root);
    let sourceIndex = 0;
    const record = (assetId: string, sizeBytes = 1) => {
      const sourcePath = join(root, `${sourceIndex++}.bin`);
      writeFileSync(sourcePath, '');
      truncateSync(sourcePath, sizeBytes);
      return {
        logicalPath: `media/${assetId}`,
        artifactKind: 'media',
        sourcePath,
        sizeBytes,
        sourceMediaSha256: 'a'.repeat(64),
        provenanceSha256: 'b'.repeat(64),
        audit: {
          recipe: 'test#media',
          bakerVersion: 'test@1',
          outputArtifactSha256: 'a'.repeat(64),
        },
      };
    };

    const massive = MATERIALIZED_MEDIA_ASSET_IDS[0]!;
    expect(stageMediaPublicationRecordByPolicy(
      ready, materialized, availability, massive, record(massive),
    )).toBe('materialized');
    expect(materialized.has(`media/${massive}`)).toBe(true);
    expect(ready.has(`media/${massive}`)).toBe(false);

    const ordinary = 'h264_1080p_30s.mp4';
    expect(stageMediaPublicationRecordByPolicy(
      ready, materialized, availability, ordinary, record(ordinary),
    )).toBe('immutable');
    expect(ready.has(`media/${ordinary}`)).toBe(true);
    expect(materialized.has(`media/${ordinary}`)).toBe(false);

    const nestedLarge = 'scenarios/decode-seek/ordinary-row/02.mp4';
    expect(stageMediaPublicationRecordByPolicy(
      ready,
      materialized,
      availability,
      nestedLarge,
      record(nestedLarge, MATERIALIZED_MEDIA_MIN_BYTES),
    )).toBe('materialized');
    expect(materialized.has(`media/${nestedLarge}`)).toBe(true);
    expect(ready.has(`media/${nestedLarge}`)).toBe(false);

    const nestedBelowCeiling = 'scenarios/decode-seek/ordinary-row/03.mp4';
    expect(stageMediaPublicationRecordByPolicy(
      ready,
      materialized,
      availability,
      nestedBelowCeiling,
      record(nestedBelowCeiling, MATERIALIZED_MEDIA_MIN_BYTES - 1),
    )).toBe('immutable');
    expect(ready.has(`media/${nestedBelowCeiling}`)).toBe(true);
    expect(materialized.has(`media/${nestedBelowCeiling}`)).toBe(false);

    const drifted = record('scenarios/decode-seek/ordinary-row/drifted.mp4', 1);
    truncateSync(drifted.sourcePath, 2);
    expect(() => stageMediaPublicationRecordByPolicy(
      ready,
      materialized,
      availability,
      'scenarios/decode-seek/ordinary-row/drifted.mp4',
      drifted,
    )).toThrow(/sizeBytes does not match sourcePath/);

    expect(() => stageMediaPublicationRecordByPolicy(
      ready,
      materialized,
      availability,
      massive,
      { ...record(massive), logicalPath: 'media/not-the-asset.mp4' },
    )).toThrow(/does not match its asset id/);
  });
});
