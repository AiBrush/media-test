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
  test('all live IDs have manifest/physical parity', async () => {
    const first = curateEncryptionBakedScenarios();
    const before = await snapshotReadyOutputs(first);
    const second = curateEncryptionBakedScenarios();
    const after = await snapshotReadyOutputs(second);

    expect(second).toEqual(first);
    expect(after).toEqual(before);
    expect(ENCRYPTION_BAKED_SCENARIO_TARGETS).toHaveLength(24);
    expect(ENCRYPTION_BAKED_SCENARIO_TARGETS.map(({ scenarioId }) => scenarioId)).toEqual(
      encryptionScenarios.map(({ id }) => id),
    );
    expect(first.filter(({ state }) => state === 'ready')).toHaveLength(24);
    expect(first.filter(({ state }) => state === 'pending')).toEqual([]);

    const manifest = JSON.parse(await Bun.file('fixtures/manifest.json').text()) as {
      assets: Array<{ id: string; sha256: string | null; sizeBytes: number | null }>;
    };
    for (const target of ENCRYPTION_BAKED_SCENARIO_TARGETS) {
      const report = first.find((entry) => entry.scenarioId === target.scenarioId)!;
      const declared = manifest.assets.find((asset) => asset.id === target.assetId);
      if (report.state === 'pending') {
        expect(declared === undefined || (declared.sha256 === null && declared.sizeBytes === null)).toBe(true);
        expect(await Bun.file(`fixtures/media/${target.assetId}`).exists()).toBe(false);
        continue;
      }

      const expected = { sha256: declared?.sha256, sizeBytes: declared?.sizeBytes };
      expect(expected.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(Number.isSafeInteger(expected.sizeBytes)).toBe(true);
      expect(report.media).toEqual(expected);
      expect(await identity(`fixtures/media/${target.assetId}`), `${target.assetId} root`).toEqual(expected);
      expect(
        await identity(`fixtures/media/scenarios/${target.scenarioId}/${target.assetId}`),
        `${target.scenarioId} baked mirror`,
      ).toEqual(expected);

      if (target.resourceIndex !== undefined) {
        const index = JSON.parse(await Bun.file(target.resourceIndex.slice(1)).text()) as {
          playlist: { assetId: string; sha256: string; sizeBytes: number };
          resources: Array<{ role: string; uri: string; sha256: string; sizeBytes: number }>;
        };
        expect(index.playlist).toEqual({ assetId: target.assetId, ...expected });
        expect(report.resources).toEqual(index.resources);
        for (const resource of index.resources) {
          const resourceIdentity = { sha256: resource.sha256, sizeBytes: resource.sizeBytes };
          expect(await identity(`fixtures/media/${resource.uri}`)).toEqual(resourceIdentity);
          expect(
            await identity(`fixtures/media/scenarios/${target.scenarioId}/${resource.uri}`),
          ).toEqual(resourceIdentity);
        }
      } else {
        expect(report.resources).toEqual([]);
      }
    }
  }, 30_000);

  test('the canonical CENS asset protects both tracks with the authored pattern contract', async () => {
    const bytes = new Uint8Array(await Bun.file('fixtures/media/cenc_cens.mp4').arrayBuffer());
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

async function snapshotReadyOutputs(
  reports: ReadonlyArray<{
    scenarioId: string;
    assetId: string;
    state: string;
    resources: ReadonlyArray<{ uri: string }>;
  }>,
): Promise<Record<string, Identity>> {
  const snapshot: Record<string, Identity> = {};
  for (const report of reports) {
    if (report.state !== 'ready') continue;
    const media = `fixtures/media/scenarios/${report.scenarioId}/${report.assetId}`;
    snapshot[media] = await identity(media);
    for (const resource of report.resources) {
      const path = `fixtures/media/scenarios/${report.scenarioId}/${resource.uri}`;
      snapshot[path] = await identity(path);
    }
  }
  return snapshot;
}

async function identity(path: string, label = path): Promise<Identity> {
  const file = Bun.file(path);
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const sha256 = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
  return { sha256, sizeBytes: bytes.byteLength };
}
