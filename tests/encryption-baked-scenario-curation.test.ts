import { createHash } from 'node:crypto';
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import {
  ENCRYPTION_BAKED_SCENARIO_TARGETS,
  curateEncryptionBakedScenarios,
} from '../scripts/curate-encryption-baked-scenarios.mjs';
import { encryptionScenarios } from '../src/scenarios/encryption/index.ts';
import {
  assessPatternGroundTruth,
  encryptionKeyProvenanceFromOptions,
  inspectIsoBmffEncryption,
  inspectPatternBoundaryEvidence,
} from '../src/features/encryption/index.ts';

interface Identity {
  sha256: string;
  sizeBytes: number;
}

describe('live encryption baked scenario curation', () => {
  test('all live IDs have manifest/physical parity', () => {
    const first = curateEncryptionBakedScenarios();
    const before = snapshotReadyOutputs(first);
    const second = curateEncryptionBakedScenarios();
    const after = snapshotReadyOutputs(second);

    expect(second).toEqual(first);
    expect(after).toEqual(before);
    expect(ENCRYPTION_BAKED_SCENARIO_TARGETS).toHaveLength(24);
    expect(ENCRYPTION_BAKED_SCENARIO_TARGETS.map(({ scenarioId }) => scenarioId)).toEqual(
      encryptionScenarios.map(({ id }) => id),
    );
    expect(first.filter(({ state }) => state === 'ready')).toHaveLength(24);
    expect(first.filter(({ state }) => state === 'pending')).toEqual([]);

    const manifest = JSON.parse(readFileSync('fixtures/manifest.json', 'utf8')) as {
      assets: Array<{ id: string; sha256: string | null; sizeBytes: number | null }>;
    };
    for (const target of ENCRYPTION_BAKED_SCENARIO_TARGETS) {
      const report = first.find((entry) => entry.scenarioId === target.scenarioId)!;
      const declared = manifest.assets.find((asset) => asset.id === target.assetId);
      if (report.state === 'pending') {
        expect(declared === undefined || (declared.sha256 === null && declared.sizeBytes === null)).toBe(true);
        expect(existsSync(`fixtures/media/${target.assetId}`)).toBe(false);
        continue;
      }

      const expected = { sha256: declared?.sha256, sizeBytes: declared?.sizeBytes };
      expect(expected.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(Number.isSafeInteger(expected.sizeBytes)).toBe(true);
      expect(report.media).toEqual(expected);
      expect(identity(`fixtures/media/${target.assetId}`), `${target.assetId} root`).toEqual(expected);
      expect(
        identity(`fixtures/media/scenarios/${target.scenarioId}/${target.assetId}`),
        `${target.scenarioId} baked mirror`,
      ).toEqual(expected);

      if (target.resourceIndex !== undefined) {
        const index = JSON.parse(readFileSync(target.resourceIndex.slice(1), 'utf8')) as {
          playlist: { assetId: string; sha256: string; sizeBytes: number };
          resources: Array<{ role: string; uri: string; sha256: string; sizeBytes: number }>;
        };
        expect(index.playlist).toEqual({ assetId: target.assetId, ...expected });
        expect(report.resources).toEqual(index.resources);
        for (const resource of index.resources) {
          const resourceIdentity = { sha256: resource.sha256, sizeBytes: resource.sizeBytes };
          expect(identity(join('fixtures/media', resource.uri))).toEqual(resourceIdentity);
          expect(
            identity(join('fixtures/media/scenarios', target.scenarioId, resource.uri)),
          ).toEqual(resourceIdentity);
        }
      } else {
        expect(report.resources).toEqual([]);
      }
    }
  }, 30_000);

  test('the canonical CENS asset protects both tracks with the authored pattern contract', () => {
    const bytes = new Uint8Array(readFileSync('fixtures/media/cenc_cens.mp4'));
    const evidence = inspectIsoBmffEncryption(bytes);
    expect(evidence.state).toBe('OK');
    if (evidence.state !== 'OK') return;

    const video = evidence.tracks.find((track) => track.type === 'video');
    const audio = evidence.tracks.find((track) => track.type === 'audio');
    expect(evidence.tracks).toHaveLength(2);
    expect(video).toEqual(expect.objectContaining({
      scheme: 'cens',
      protected: true,
      defaultKid: '00112233445566778899aabbccddeeff',
      cryptByteBlock: 1,
      skipByteBlock: 9,
    }));
    expect(audio).toEqual(expect.objectContaining({
      scheme: 'cens',
      protected: true,
      defaultKid: '00112233445566778899aabbccddeeff',
      cryptByteBlock: 0,
      skipByteBlock: 0,
    }));

    const scenario = encryptionScenarios.find(({ id }) => id === 'encryption/cenc_cens_decrypt');
    const pattern = encryptionKeyProvenanceFromOptions(scenario?.options)?.pattern;
    expect(pattern).toBeDefined();
    if (!pattern) return;
    expect(inspectPatternBoundaryEvidence(bytes, pattern)).toMatchObject({
      state: 'OK',
      scheme: 'cenc-cens',
      trackId: 1,
      sampleCount: 150,
      explicitSubsampleCount: 150,
      implicitWholeSampleCount: 0,
      firstBoundarySubsamples: [{ clearBytes: 734, protectedBytes: 23_920 }],
    });
    expect(assessPatternGroundTruth(bytes, pattern)).toMatchObject({
      verdict: 'PASS',
      reasonCode: 'PATTERN_GROUND_TRUTH_MATCH',
    });
  });
});

function snapshotReadyOutputs(
  reports: ReadonlyArray<{
    scenarioId: string;
    assetId: string;
    state: string;
    resources: ReadonlyArray<{ uri: string }>;
  }>,
): Record<string, Identity> {
  const snapshot: Record<string, Identity> = {};
  for (const report of reports) {
    if (report.state !== 'ready') continue;
    const media = `fixtures/media/scenarios/${report.scenarioId}/${report.assetId}`;
    snapshot[media] = identity(media);
    for (const resource of report.resources) {
      const path = `fixtures/media/scenarios/${report.scenarioId}/${resource.uri}`;
      snapshot[path] = identity(path);
    }
  }
  return snapshot;
}

function identity(path: string, label = path): Identity {
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
    throw new Error(`${label}: file changed while hashing`);
  }
  return { sha256: hash.digest('hex'), sizeBytes };
}
