import { describe, expect, test } from 'bun:test';

import {
  METADATA_BAKED_SCENARIO_TARGETS,
  curateMetadataBakedScenarios,
} from '../scripts/curate-metadata-baked-scenarios.mjs';

async function identity(path: string): Promise<{ sha256: string; sizeBytes: number }> {
  const bytes = await Bun.file(path).arrayBuffer();
  const sha256 = new Bun.CryptoHasher('sha256').update(new Uint8Array(bytes)).digest('hex');
  return {
    sha256,
    sizeBytes: bytes.byteLength,
  };
}

describe('metadata baked scenario curation', () => {
  test('authored-rotation mirrors are manifest-bound, complete, and byte-idempotent', async () => {
    const first = curateMetadataBakedScenarios();
    const second = curateMetadataBakedScenarios();

    expect(second).toEqual(first);
    expect(first).toHaveLength(2);
    expect(METADATA_BAKED_SCENARIO_TARGETS.map((target) => target.scenarioId)).toEqual([
      'metadata/rotation_decode_read_h264_rotated90',
      'metadata/rotation_survives_mp4_mkv',
    ]);

    const sourceMedia = await identity('fixtures/media/h264_rotated90.mp4');
    for (const target of METADATA_BAKED_SCENARIO_TARGETS) {
      const report = first.find((item) => item.scenarioId === target.scenarioId);
      expect(report).toMatchObject({
        scenarioId: target.scenarioId,
        assetId: target.assetId,
        state: 'ready',
        media: sourceMedia,
      });
      expect(Object.keys(report!.goldens).sort()).toEqual(['meta', 'packets']);
      expect(await identity(`fixtures/media/scenarios/${target.scenarioId}/${target.assetId}`)).toEqual(sourceMedia);
      for (const kind of ['meta', 'packets'] as const) {
        expect(await identity(`fixtures/golden/scenarios/${target.scenarioId}/${target.assetId}.${kind}.json`))
          .toEqual(await identity(`fixtures/golden/${target.assetId}.${kind}.json`));
      }
    }
  }, 30_000);
});
