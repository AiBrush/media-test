import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import {
  PROBE_BAKED_SCENARIO_TARGETS,
  curateProbeBakedScenarios,
} from '../fixtures/curate-probe-baked-scenarios.mjs';

interface Identity {
  sha256: string;
  sizeBytes: number;
}

describe('probe baked scenario curation', () => {
  test('production mirrors are manifest/resource-bound and repeated curation is byte-idempotent', () => {
    const first = curateProbeBakedScenarios();
    const before = snapshotCuratedOutputs();
    const second = curateProbeBakedScenarios();
    const after = snapshotCuratedOutputs();

    expect(second).toEqual(first);
    expect(after).toEqual(before);
    expect(first).toHaveLength(16);

    const manifest = JSON.parse(readFileSync('fixtures/manifest.json', 'utf8')) as {
      assets: Array<{ id: string; sha256?: string; sizeBytes?: number }>;
    };

    for (const target of PROBE_BAKED_SCENARIO_TARGETS) {
      const declared = manifest.assets.find((asset) => asset.id === target.assetId);
      expect(declared, target.assetId).toBeDefined();
      const report = first.find((entry) => entry.assetId === target.assetId)!;
      if (declared!.sha256 === null && declared!.sizeBytes === null) {
        expect(report).toMatchObject({
          scenarioId: target.scenarioId,
          state: 'pending',
          reasonCode: 'PROBE_BAKED_ASSET_NOT_BAKED',
          media: null,
          resources: [],
          goldens: {},
        });
        expect(existsSync(`fixtures/media/${target.assetId}`)).toBe(false);
        expect(existsSync(`fixtures/media/scenarios/${target.scenarioId}/${target.assetId}`)).toBe(false);
        continue;
      }
      expect(report.state).toBe('ready');
      const expected = { sha256: declared!.sha256, sizeBytes: declared!.sizeBytes };
      expect(identity(`fixtures/media/${target.assetId}`), `${target.assetId} source`).toEqual(expected);
      expect(
        identity(`fixtures/media/scenarios/${target.scenarioId}/${target.assetId}`),
        `${target.scenarioId} target`,
      ).toEqual(expected);

      for (const kind of ['meta', 'packets'] as const) {
        const sourcePath = `fixtures/golden/${target.assetId}.${kind}.json`;
        const destinationPath =
          `fixtures/golden/scenarios/${target.scenarioId}/${target.assetId}.${kind}.json`;
        expect(identity(destinationPath), `${target.scenarioId} ${kind}`).toEqual(identity(sourcePath));
        // Large packet goldens have streaming/schema validation in the golden correctness suite.
        // Keep mirror verification bounded instead of materializing both 200+ MiB documents.
        if (statSync(destinationPath).size <= 8 * 1024 * 1024) {
          expect(() => JSON.parse(readFileSync(destinationPath, 'utf8'))).not.toThrow();
        }
      }
    }

    const index = JSON.parse(
      readFileSync('fixtures/golden/hls_aes128.m3u8.resources.json', 'utf8'),
    ) as {
      playlist: { assetId: string; sha256: string; sizeBytes: number };
      resources: Array<{ role: string; uri: string; sha256: string; sizeBytes: number }>;
    };
    expect(identity('fixtures/media/hls_aes128.m3u8')).toEqual({
      sha256: index.playlist.sha256,
      sizeBytes: index.playlist.sizeBytes,
    });

    const fullDirectory = 'fixtures/media/scenarios/probe/hls_aes128';
    expect(readdirSync(fullDirectory).sort()).toEqual([
      index.playlist.assetId,
      ...index.resources.map(({ uri }) => uri),
    ].sort());
    for (const resource of index.resources) {
      const expected = { sha256: resource.sha256, sizeBytes: resource.sizeBytes };
      expect(identity(join('fixtures/media', resource.uri)), `${resource.role} source`).toEqual(expected);
      expect(identity(join(fullDirectory, resource.uri)), `${resource.role} target`).toEqual(expected);
    }

    expect(readdirSync('fixtures/media/scenarios/probe/hls_aes128_playlist_key_free')).toEqual([
      'hls_aes128.m3u8',
    ]);

    for (const [scenarioId, assetId] of [
      ['probe/h264_rotated90', 'h264_rotated90.mp4'],
      ['probe/massive_h264_1080p_2h', 'massive_h264_1080p_2h.mp4'],
      ['probe/perf-extract-metadata-massive', 'massive_h264_1080p_2h.mp4'],
      ['probe/metamorphic-duration-across-containers', 'h264_rotated90.mp4'],
      ['probe/metamorphic-duration-across-containers', 'h264_in_mkv.mkv'],
    ] as const) {
      expect(
        identity(`fixtures/media/scenarios/${scenarioId}/${assetId}`),
        `${scenarioId}/${assetId} refreshed baked member`,
      ).toEqual(identity(`fixtures/media/${assetId}`, `${assetId} flat source`));
    }
  }, 30_000);
});

function snapshotCuratedOutputs(): Record<string, Identity> {
  const snapshot: Record<string, Identity> = {};
  const manifest = JSON.parse(readFileSync('fixtures/manifest.json', 'utf8')) as {
    assets: Array<{ id: string; sha256: string | null; sizeBytes: number | null }>;
  };
  for (const target of PROBE_BAKED_SCENARIO_TARGETS) {
    const declared = manifest.assets.find((asset) => asset.id === target.assetId);
    if (declared?.sha256 === null && declared.sizeBytes === null) continue;
    const media = `fixtures/media/scenarios/${target.scenarioId}/${target.assetId}`;
    snapshot[media] = identity(media);
    for (const kind of ['meta', 'packets'] as const) {
      const golden = `fixtures/golden/scenarios/${target.scenarioId}/${target.assetId}.${kind}.json`;
      snapshot[golden] = identity(golden);
    }
  }
  const index = JSON.parse(
    readFileSync('fixtures/golden/hls_aes128.m3u8.resources.json', 'utf8'),
  ) as { resources: Array<{ uri: string }> };
  for (const resource of index.resources) {
    const path = `fixtures/media/scenarios/probe/hls_aes128/${resource.uri}`;
    snapshot[path] = identity(path);
  }
  return snapshot;
}

function identity(path: string): Identity {
  const before = statSync(path);
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const fd = openSync(path, 'r');
  let sizeBytes = 0;
  try {
    while (true) {
      const bytesRead = readSync(fd, buffer, 0, buffer.byteLength, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      sizeBytes += bytesRead;
    }
  } finally {
    closeSync(fd);
  }
  const after = statSync(path);
  if (
    sizeBytes !== before.size ||
    after.size !== before.size ||
    after.mtimeMs !== before.mtimeMs ||
    after.ctimeMs !== before.ctimeMs ||
    after.ino !== before.ino
  ) {
    throw new Error(`${path}: file changed while hashing`);
  }
  return {
    sha256: hash.digest('hex'),
    sizeBytes,
  };
}
