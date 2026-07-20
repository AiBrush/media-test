import { describe, expect, test } from 'bun:test';
import {
  isMaterializedMediaAssetId,
  MATERIALIZED_MEDIA_ASSET_IDS,
  materializedMediaLogicalPath,
  stageMediaPublicationRecordByPolicy,
} from '../fixtures/lib/materialized-media-policy.mjs';

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

  test('routes only policy assets away from immutable generation artifacts', () => {
    const ready = new Map();
    const materialized = new Map();
    const availability = new Map();
    const record = (assetId: string) => ({
      logicalPath: `media/${assetId}`,
      artifactKind: 'media',
      sourcePath: `/fixtures/media/${assetId}`,
      sourceMediaSha256: 'a'.repeat(64),
      provenanceSha256: 'b'.repeat(64),
      audit: {
        recipe: 'test#media',
        bakerVersion: 'test@1',
        outputArtifactSha256: 'a'.repeat(64),
      },
    });

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

    expect(() => stageMediaPublicationRecordByPolicy(
      ready,
      materialized,
      availability,
      massive,
      { ...record(massive), logicalPath: 'media/not-the-asset.mp4' },
    )).toThrow(/does not match its asset id/);
  });
});
