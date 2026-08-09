import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import {
  METADATA_BAKED_SCENARIO_TARGETS,
  curateMetadataBakedScenarios,
} from '../scripts/curate-metadata-baked-scenarios.mjs';

function identity(path: string): { sha256: string; sizeBytes: number } {
  const bytes = readFileSync(path);
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.byteLength,
  };
}

describe('metadata baked scenario curation', () => {
  test('authored-rotation mirrors are manifest-bound, complete, and byte-idempotent', () => {
    const first = curateMetadataBakedScenarios();
    const second = curateMetadataBakedScenarios();

    expect(second).toEqual(first);
    expect(first).toHaveLength(2);
    expect(METADATA_BAKED_SCENARIO_TARGETS.map((target) => target.scenarioId)).toEqual([
      'metadata/rotation_decode_read_h264_rotated90',
      'metadata/rotation_survives_mp4_mkv',
    ]);

    const sourceMedia = identity('fixtures/media/h264_rotated90.mp4');
    for (const target of METADATA_BAKED_SCENARIO_TARGETS) {
      const report = first.find((item) => item.scenarioId === target.scenarioId);
      expect(report).toMatchObject({
        scenarioId: target.scenarioId,
        assetId: target.assetId,
        state: 'ready',
        media: sourceMedia,
      });
      expect(Object.keys(report!.goldens).sort()).toEqual(['meta', 'packets']);
      expect(identity(`fixtures/media/scenarios/${target.scenarioId}/${target.assetId}`)).toEqual(sourceMedia);
      for (const kind of ['meta', 'packets'] as const) {
        expect(identity(`fixtures/golden/scenarios/${target.scenarioId}/${target.assetId}.${kind}.json`))
          .toEqual(identity(`fixtures/golden/${target.assetId}.${kind}.json`));
      }
    }
  }, 30_000);
});
