import { afterEach, describe, expect, test } from 'bun:test';
import { createDecipheriv, createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  buildFramePlaceholder,
  canonicalJson,
  canonicalSha256,
  normalizePacketProbe,
  normalizeProbeMetadata,
  selectPresentationFramePlaceholders,
} from '../fixtures/lib/golden-normalization.mjs';
import {
  createGoldenEnvelope,
  createGoldenProvenance,
  deterministicFixtureBytes,
  validateFixtureManifest,
  validateGoldenEnvelope,
} from '../fixtures/lib/golden-contract.mjs';
import {
  assessMediaReuse,
  auditGeneration,
  planExplicitAssetUpdate,
  publishGeneration,
  readActiveGenerationIndex,
} from '../fixtures/lib/generation-publication.mjs';
import {
  flatFramePlaceholderForGolden,
  normalizeFlatProbeForGolden,
} from '../fixtures/bake.mjs';
import {
  normalizeScenarioProbeForGolden,
  scenarioFramePlaceholderForGolden,
} from '../fixtures/bake-scenario-goldens.mjs';
import { materializeFrameEvidence } from '../src/core/frame-bake.ts';
import {
  loadGoldenEvidenceV1,
  routeGoldenEvidence,
  validateGoldenArtifactEnvelope,
} from '../src/core/golden-evidence.ts';
import { FixtureIntegrityCache } from '../src/core/fixture-integrity.ts';
import { pairFramesByTimestamp, routeReferenceDecoderEvidence } from '../src/core/golden-frame-evidence.ts';
import { parseScenarioSourceCatalog, scenarioSourceMap } from '../src/core/selection-integrity.ts';
import { assessCandidateEligibility, assessRobustnessVariantEligibility } from '../src/core/media-selection.ts';
import { robustnessScenarios } from '../src/scenarios/robustness/index.ts';
import { encryptionScenarios } from '../src/scenarios/encryption/index.ts';
import { probeScenarios } from '../src/scenarios/probe/index.ts';
import {
  inspectHlsResourceReferences,
  parseHlsResourceIndex,
  preflightHlsResourceIndex,
} from '../src/features/encryption/hls-resource-index.ts';
import { parseAuthoritativeKeyRecord } from '../src/features/encryption/key-provenance.ts';

const temporaryRoots: string[] = [];
const TEST_MEDIA_BYTES = Buffer.from('fixture-source');
afterEach(() => {
  while (temporaryRoots.length) rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
});

describe('REQ-FIX-01/05/10 shared raw+canonical metadata normalization', () => {
  test('flat and scenario paths are byte-identical; aliases/order preserve semantic truth and raw DIFF evidence', () => {
    const first = metadataProbe(false, false);
    const reorderedAliases = metadataProbe(true, true);
    const frames = cadenceFrames([0, 33_367, 66_733, 100_100]);
    const reorderedFrames = cadenceFrames([0, 33_367, 66_733, 100_100], 9);

    const flat = normalizeFlatProbeForGolden(first, frames, 'same.mp4');
    const scenario = normalizeScenarioProbeForGolden(first, frames, 'same.mp4');
    expect(canonicalJson(flat)).toBe(canonicalJson(scenario));

    const aliasView = normalizeProbeMetadata(reorderedAliases, { assetId: 'same.mp4', frameProbe: reorderedFrames });
    expect(aliasView.canonical).toEqual(flat.canonical);
    expect(aliasView.raw).not.toEqual(flat.raw);
    expect(flat.canonical.tracks.map((track: { type: string }) => track.type)).toEqual(['video', 'audio']);
    expect(flat.canonical.tracks[0]).toMatchObject({
      codec: 'h264', fpsNumerator: 30_000, fpsDenominator: 1_001, cadenceMode: 'CFR',
    });
    expect(flat.canonical.tracks[1]).toMatchObject({
      codec: 'aac', audioObjectType: 29, sbrPresent: true, psPresent: true,
      sampleRateCore: 24_000, sampleRateOutput: 48_000, channelsCore: 1, channelsOutput: 2,
      primingSamples: 1_024,
    });
    expect(flat.canonical).toMatchObject({
      presentationDurationSec: 10, mediaDurationSec: 10, sampleSpanSec: 10.01,
    });

    const wrong = structuredClone(first);
    wrong.streams[0].codec_name = 'vp9';
    expect(normalizeProbeMetadata(wrong, { assetId: 'same.mp4', frameProbe: frames }).canonical).not.toEqual(flat.canonical);
  });

  test('VFR bands and edit-list/media/timebase views remain explicit without rounding NTSC away', () => {
    const probe = metadataProbe(false, false);
    probe.format.duration = '9.500000';
    probe.format.start_time = '0.500000';
    const normalized = normalizeProbeMetadata(probe, {
      assetId: 'edit.mp4',
      frameProbe: cadenceFrames([0, 33_367, 83_367, 116_734]),
    });
    expect(normalized.canonical.tracks[0]).toMatchObject({
      fpsNumerator: 30_000, fpsDenominator: 1_001, cadenceMode: 'VFR',
    });
    expect(normalized.canonical.tracks[0].fpsMin).toBeLessThan(normalized.canonical.tracks[0].fpsMax);
    expect(normalized.canonical).toMatchObject({ presentationDurationSec: 9.5, mediaDurationSec: 10, editListSpanSec: 9.5 });
    expect(normalized.canonical.timebaseTickUs).toBeCloseTo(1_000_000 / 90_000, 6);
  });

  test('both bake paths select the same unique presentation-order timestamps through B-frame reorder', () => {
    const source = { sha256: '1'.repeat(64), sizeBytes: 123 };
    const frameProbe = { frames: [
      { stream_index: 0, pts_time: '0.066733', key_frame: 0 },
      { stream_index: 0, best_effort_timestamp_time: '0.000000', key_frame: 1 },
      { stream_index: 0, pts_time: '0.033367', key_frame: 0 },
      { stream_index: 0, pts_time: '0.033367', key_frame: 1 },
    ] };
    const expected = selectPresentationFramePlaceholders(frameProbe);
    expect(flatFramePlaceholderForGolden('same.mp4', source, frameProbe).frames).toEqual(expected);
    expect(scenarioFramePlaceholderForGolden('same.mp4', source, frameProbe).frames).toEqual(expected);
    expect(expected.map((entry: { ptsUs: number }) => entry.ptsUs)).toEqual([0, 33_367, 66_733]);
  });

  test('source PTS stays authoritative when best-effort decoding collapses distinct occurrences', () => {
    const ptsUs = [
      0, 16_666, 33_332, 49_998, 66_664, 83_330,
      99_996, 116_662, 133_327, 149_994, 166_660, 183_326,
    ];
    const frameProbe = {
      frames: ptsUs.map((pts, index) => ({
        stream_index: 0,
        pts_time: (pts / 1_000_000).toFixed(6),
        best_effort_timestamp_time: index >= 10 ? '0.216658' : (pts / 1_000_000).toFixed(6),
        key_frame: 0,
      })),
    };
    const selected = selectPresentationFramePlaceholders(frameProbe);
    expect(selected).toHaveLength(12);
    expect(selected.map((entry: { ptsUs: number }) => entry.ptsUs)).toEqual(ptsUs);
    expect(new Set(selected.map((entry: { ptsUs: number }) => entry.ptsUs)).size).toBe(12);
  });
});

describe('REQ-FIX-02 semantic packets versus representation fingerprints', () => {
  test('AVCC/avc3/Annex-B grouping can DIFF in representation while semantic access units stay equal', () => {
    const decodedUnits = [
      { streamIndex: 0, ptsUs: 0, sha256: 'a'.repeat(64) },
      { streamIndex: 0, ptsUs: 33_333, sha256: 'b'.repeat(64) },
    ];
    const avcc = normalizePacketProbe(packetProbe('avc1', [110, 90]), { decodedUnits, container: 'mp4' });
    const avc3 = normalizePacketProbe(packetProbe('avc3', [130, 70]), { decodedUnits, container: 'mp4' });
    const annexB = normalizePacketProbe(packetProbe('h264', [150, 50]), { decodedUnits, container: 'ts' });
    expect(avcc.semantic).toEqual(avc3.semantic);
    expect(avcc.semantic).toEqual(annexB.semantic);
    expect(avcc.representation).not.toEqual(avc3.representation);
    expect(avcc.representation).not.toEqual(annexB.representation);
    expect(avcc.representation.tracks[0]).toMatchObject({ framing: 'length-prefixed', parameterSetLocation: 'description' });
    expect(annexB.representation.tracks[0]).toMatchObject({ framing: 'annex-b', parameterSetLocation: 'in-band' });

    const dropped = normalizePacketProbe({
      ...packetProbe('avc1', [110, 90]),
      packets: packetProbe('avc1', [110, 90]).packets.slice(0, 1),
    }, { decodedUnits: decodedUnits.slice(0, 1), container: 'mp4' });
    expect(dropped.semantic).not.toEqual(avcc.semantic);

    const unavailable = normalizePacketProbe(packetProbe('avc1', [110, 90]), {
      decodedUnits: [],
      decoderObservation: {
        state: 'reference-unavailable',
        reasonCode: 'REFERENCE_DECODER_SAMPLE_AES_UNAVAILABLE',
      },
      container: 'mp4',
    });
    expect(unavailable.semantic.decoder).toMatchObject({
      state: 'reference-unavailable', decodedUnits: 0,
      reasonCode: 'REFERENCE_DECODER_SAMPLE_AES_UNAVAILABLE',
    });
    expect(unavailable.semantic.accessUnits.every((unit: Record<string, unknown>) => !('decodable' in unit))).toBe(true);
  });
});

describe('REQ-FIX-03/04 browser frame evidence honesty', () => {
  test('digest-only sinks remain pending and can never create a 1x1/all-zero SSIM substitute', () => {
    const listed = [{ index: 0, ptsUs: 0, keyframe: true, sha256: null }];
    const noPixels = materializeFrameEvidence(listed, [{ digest: { index: 0, ptsUs: 0, sha256: 'f'.repeat(64), width: 2, height: 2 } }]);
    expect(noPixels.filledCount).toBe(0);
    expect(noPixels.sigs).toEqual([]);
    expect(noPixels.frames[0]).toMatchObject({ sha256: null, pixelProvenance: { state: 'missing-pixels', source: 'unavailable' } });

    const image = { width: 2, height: 2, data: new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 255, 255,
    ]) } as ImageData;
    const real = materializeFrameEvidence(listed, [{
      digest: { index: 0, ptsUs: 0, sha256: 'f'.repeat(64), width: 2, height: 2 },
      image,
      pixelSource: 'FrameSink.getPixels',
    }]);
    expect(real.filledCount).toBe(1);
    expect(real.sigs).toHaveLength(1);
    expect(real.sigs[0]).toHaveLength(16 * 16);
    expect(real.frames[0]?.pixelProvenance).toMatchObject({ state: 'real-pixels', expectedPtsUs: 0, observedPtsUs: 0 });
  });

  test('maximum-cardinality timestamp pairing is one-to-one under rate transforms and frame drops', () => {
    const trap = pairFramesByTimestamp(
      [{ ptsUs: 0 }, { ptsUs: 6 }],
      [{ ptsUs: 4 }, { ptsUs: 10 }],
      { toleranceUs: 5, unmatchedPolicy: 'require-all-reference' },
    );
    expect(trap.pairs.map((pair) => [pair.referenceIndex, pair.candidateIndex])).toEqual([[0, 0], [1, 1]]);
    expect(new Set(trap.pairs.map((pair) => pair.candidateIndex)).size).toBe(trap.pairs.length);

    const rateChanged = pairFramesByTimestamp(
      [{ ptsUs: 0 }, { ptsUs: 40_000 }, { ptsUs: 80_000 }],
      [{ ptsUs: 0 }, { ptsUs: 20_100 }, { ptsUs: 40_000 }],
      { toleranceUs: 200, transform: { offsetUs: 0, numerator: 1, denominator: 2 }, unmatchedPolicy: 'allow-frame-drop' },
    );
    expect(rateChanged.pairs).toHaveLength(3);
    expect(routeReferenceDecoderEvidence({ state: 'browser-unavailable', reasonCode: 'REFERENCE_CODEC_UNSUPPORTED', configuration: {} }))
      .toEqual({ execution: 'NA_BROWSER', reasonCode: 'REFERENCE_CODEC_UNSUPPORTED' });
  });
});

describe('REQ-FIX-06/07 versioned provenance, schemas and deterministic perimeter inputs', () => {
  test('malformed and unknown-major evidence is rejected before publication/runtime', () => {
    const envelope = validEnvelope('metadata', { canonical: { container: 'mp4', tracks: [] } });
    expect(validateGoldenEnvelope(envelope).ok).toBe(true);
    expect(validateGoldenArtifactEnvelope(envelope, 'metadata').ok).toBe(true);
    expect(validateGoldenEnvelope({ ...envelope, schemaVersion: '2.0.0' }).ok).toBe(false);
    expect(validateGoldenArtifactEnvelope({ ...envelope, schemaVersion: '2.0.0' }, 'metadata')).toMatchObject({
      ok: false, reasonCode: 'GOLDEN_SCHEMA_MAJOR_UNSUPPORTED',
    });
    expect(validateGoldenEnvelope({ ...envelope, provenance: {} }).ok).toBe(false);
    expect(validateFixtureManifest({ $schema: 'not-versioned', suiteCorpusVersion: '1', assets: [] }).ok).toBe(false);
  });

  test('committed seed material is stable, domain-separated, and independent of clock/randomness', () => {
    const seed = JSON.parse(readFileSync('fixtures/fixture-seed.json', 'utf8')).seedHex;
    expect(deterministicFixtureBytes(seed, 'hls:key', 16).toString('hex')).toBe(
      deterministicFixtureBytes(seed, 'hls:key', 16).toString('hex'),
    );
    expect(deterministicFixtureBytes(seed, 'hls:key', 16)).not.toEqual(deterministicFixtureBytes(seed, 'hls:iv', 16));
  });
});

describe('REQ-FIX-08/09 transactional generations, integrity and explicit updates', () => {
  test('fault injection after every publication boundary exposes only a complete previous or new generation', () => {
    const root = temporaryRoot();
    const oldEnvelope = validEnvelope('metadata', { canonical: { value: 'old' } });
    const nextEnvelope = validEnvelope('metadata', { canonical: { value: 'next' } });
    publishGeneration({ rootDir: root, artifacts: generationArtifacts(oldEnvelope), publicationScope: { mode: 'complete-corpus' } });
    const oldGeneration = readActiveGenerationIndex(root)!.generationId;
    publishGeneration({ rootDir: root, artifacts: generationArtifacts(nextEnvelope), publicationScope: { mode: 'complete-corpus' } });
    const nextGeneration = readActiveGenerationIndex(root)!.generationId;
    publishGeneration({ rootDir: root, artifacts: generationArtifacts(oldEnvelope), publicationScope: { mode: 'complete-corpus' } });
    const phases = [
      'before-artifact-write', 'after-artifact-write', 'before-generation-rename', 'after-generation-rename',
      'before-index-write', 'after-index-write', 'before-index-rename', 'after-index-rename',
    ];
    for (const phase of phases) {
      try {
        publishGeneration({
          rootDir: root,
          artifacts: generationArtifacts(nextEnvelope),
          publicationScope: { mode: 'complete-corpus' },
          faultInjector(point: { phase: string }) { if (point.phase === phase) throw new Error(`injected:${phase}`); },
        });
      } catch (error) {
        expect(String(error)).toContain(`injected:${phase}`);
      }
      const active = readActiveGenerationIndex(root)!;
      const audited = auditGeneration(root, active);
      expect(audited).toMatchObject({ ok: true, checked: 3 });
      expect(audited.records).toContainEqual(expect.objectContaining({
        logicalPath: 'golden/a.meta.json',
        sourceMediaSha256: digest(TEST_MEDIA_BYTES),
        recipe: 'test#fixture',
        bakerVersion: 'fixture-test@1',
      }));
      expect([oldGeneration, nextGeneration]).toContain(active.generationId);
      // Restore the known old active index for the next independent fault boundary.
      publishGeneration({ rootDir: root, artifacts: generationArtifacts(oldEnvelope), publicationScope: { mode: 'complete-corpus' } });
    }
  });

  test('reuse requires exact digest+size and a one-byte replacement quarantines/invalidate dependents', async () => {
    const root = temporaryRoot();
    const media = join(root, 'asset.bin');
    writeFileSync(media, Buffer.from('abcd'));
    const expected = { sha256: digest(Buffer.from('abcd')), sizeBytes: 4 };
    expect(assessMediaReuse(media, expected)).toMatchObject({ state: 'REUSABLE' });
    writeFileSync(media, Buffer.from('abce'));
    expect(assessMediaReuse(media, expected)).toMatchObject({ state: 'REJECTED', reasonCode: 'FIXTURE_REUSE_DIGEST_MISMATCH' });

    const index = { entries: [{ logicalPath: 'golden/a.json', sourceMediaSha256: expected.sha256 }] };
    expect(planExplicitAssetUpdate(index, { oldSha256: expected.sha256, newSha256: digest(Buffer.from('abce')), newSizeBytes: 4, explicit: false }))
      .toMatchObject({ state: 'REJECTED', invalidated: [] });
    expect(planExplicitAssetUpdate(index, { oldSha256: expected.sha256, newSha256: digest(Buffer.from('abce')), newSizeBytes: 4, explicit: true }))
      .toMatchObject({ state: 'UPDATE_REQUIRED', invalidated: ['golden/a.json'] });

    const cache = new FixtureIntegrityCache();
    let loads = 0;
    const entry = {
      logicalPath: 'media/a', generationPath: 'generations/x/media/a', artifactKind: 'media',
      sha256: expected.sha256, sizeBytes: 4, sourceMediaSha256: expected.sha256, provenanceSha256: '0'.repeat(64),
    };
    const verified = await cache.verify(entry, async () => { loads++; return new Uint8Array(Buffer.from('abcd')); });
    const cached = await cache.verify(entry, async () => { loads++; return new Uint8Array(Buffer.from('xxxx')); });
    expect(verified).toMatchObject({ state: 'verified', cacheHit: false });
    expect(cached).toMatchObject({ state: 'verified', cacheHit: true });
    expect(loads).toBe(1);
    cache.clear();
    expect(await cache.verify(entry, async () => new Uint8Array(Buffer.from('abce')))).toMatchObject({
      state: 'quarantined', execution: 'NA_ASSET', reasonCode: 'FIXTURE_DIGEST_MISMATCH',
    });
  });
});

describe('REQ-FIX-11 typed evidence states and routing', () => {
  test('404/500/parse/schema/digest/pending/producer/ready use exact states without detail inference', async () => {
    const ready = validEnvelope('metadata', { canonical: { container: 'mp4' } });
    const pending = validEnvelope('metadata', { canonical: {} }, { state: 'pending', reasonCode: 'WAITING' });
    const producer = validEnvelope('metadata', { canonical: {} }, { state: 'producer-failed', reasonCode: 'BAKER_FAILED' });
    const cases = [
      ['404', async () => new Response('', { status: 404 }), 'absent-expected', 'NA_ASSET'],
      ['500', async () => new Response('', { status: 500 }), 'transport-error', 'ERROR'],
      ['parse', async () => new Response('{bad', { status: 200 }), 'schema-invalid', 'ERROR'],
      ['schema', async () => jsonResponse({}), 'schema-invalid', 'ERROR'],
      ['digest', async () => jsonResponse(ready), 'digest-mismatch', 'NA_ASSET', { expectedArtifactSha256: '0'.repeat(64) }],
      ['pending', async () => jsonResponse(pending), 'pending', 'NA_ASSET'],
      ['producer', async () => jsonResponse(producer), 'producer-failed', 'NA_ASSET'],
      ['ready', async () => jsonResponse(ready), 'ready', 'READY'],
    ] as const;
    for (const [name, fetchImpl, state, execution, extra = {}] of cases) {
      const result = await loadGoldenEvidenceV1({
        kind: 'metadata',
        reference: { logicalPath: `golden/${name}.json`, url: `/${name}`, ...extra },
        fetchImpl: fetchImpl as typeof fetch,
      });
      expect(result.state, name).toBe(state);
      expect(routeGoldenEvidence(result).execution, name).toBe(execution);
    }
  });
});

describe('FIX acceptance corpus reality', () => {
  test('REQ-FIX robustness vector is exactly baked+2 and dynamically bound to DSL/source SHA evidence', () => {
    const catalogResult = parseScenarioSourceCatalog(readFileSync('fixtures/media/scenarios/_sources.ndjson', 'utf8'));
    expect(catalogResult.state).toBe('VALID');
    if (catalogResult.state !== 'VALID') return;
    const scenario = robustnessScenarios.find((entry) => entry.id === 'robustness/fuzz_mp4_header_truncated_demux')!;
    const row = scenarioSourceMap(catalogResult.catalog).get(scenario.id)!;
    expect(row.class).toBe('REAL');
    expect(row.files).toHaveLength(2);
    for (const file of row.files) {
      const path = join('fixtures/media/scenarios', scenario.id, file.file);
      expect(statSync(path).size).toBe(file.sizeBytes);
      expect(digest(readFileSync(path))).toBe(file.sha256);
      expect(file.contract).toMatchObject({
        scenarioId: scenario.id, scenarioContractDigest: scenario.definitionHash,
        sourceSha256: file.sha256, kind: 'robustness-variant',
      });
      expect(file.evidence).toMatchObject({
        sourceSha256: file.sha256, available: ['MALFORMED_REJECTION'],
        requiredOracles: ['graceful-failure'], sufficientOracleSets: [['graceful-failure']],
      });
      expect(assessRobustnessVariantEligibility(scenario, file, scenario.definitionHash).eligible).toBe(true);
    }
    expect(1 + row.files.length).toBe(3);
  });

  test('REQ-FIX matched-origin MDN pair exists under the multi-input scenario path with pinned identities', () => {
    const scenario = robustnessScenarios.find((entry) => entry.id === 'robustness/prop_duration_consistent_across_containers')!;
    expect(scenario.input).toEqual(['realworld_mdn_flower.mp4', 'realworld_mdn_flower.webm']);
    const identities = [
      ['realworld_mdn_flower.mp4', 1_128_375, '0cd83d944a6ca7822b4a8306cecc60a36e859b041f6702c6a1ad9ead78924451'],
      ['realworld_mdn_flower.webm', 554_058, 'c6f8a348953395598a9a73b9bab1676436410797bce9f398f4be1531d6e76dda'],
    ] as const;
    for (const [name, sizeBytes, sha256] of identities) {
      const path = join('fixtures/media/scenarios', scenario.id, name);
      expect(statSync(path).size).toBe(sizeBytes);
      expect(digest(readFileSync(path))).toBe(sha256);
    }
  });
});

describe('HLS source-closure fixture integration', () => {
  test('the unencrypted probe playlist has a verified complete segment closure', async () => {
    const name = 'hls_vod';
    const scenario = probeScenarios.find((entry) => entry.id === 'probe/hls_vod')!;
    const playlistBytes = new Uint8Array(readFileSync(`fixtures/media/${name}.m3u8`));
    const rawIndex = JSON.parse(readFileSync(`fixtures/golden/${name}.m3u8.resources.json`, 'utf8'));
    const index = parseHlsResourceIndex(rawIndex);

    expect(index.resources.map((entry) => ({ role: entry.role, uri: entry.uri }))).toEqual(
      inspectHlsResourceReferences(new TextDecoder().decode(playlistBytes)),
    );
    for (const resource of index.resources) {
      const bytes = readFileSync(join('fixtures/media', resource.uri));
      expect({ sha256: digest(bytes), sizeBytes: bytes.byteLength }).toEqual({
        sha256: resource.sha256,
        sizeBytes: resource.sizeBytes,
      });
      const scenarioBytes = readFileSync(join('fixtures/media/scenarios/probe/hls_vod', resource.uri));
      expect({ sha256: digest(scenarioBytes), sizeBytes: scenarioBytes.byteLength }).toEqual({
        sha256: resource.sha256,
        sizeBytes: resource.sizeBytes,
      });
    }
    const scenarioPlaylist = readFileSync('fixtures/media/scenarios/probe/hls_vod/hls_vod.m3u8');
    expect({ sha256: digest(scenarioPlaylist), sizeBytes: scenarioPlaylist.byteLength }).toEqual({
      sha256: index.playlist.sha256,
      sizeBytes: index.playlist.sizeBytes,
    });
    const decision = await preflightHlsResourceIndex(
      scenario.options,
      {
        assetId: `${name}.m3u8`,
        logicalPath: `${name}.m3u8`,
        sha256: digest(playlistBytes),
        sizeBytes: playlistBytes.byteLength,
      },
      playlistBytes,
      async () => ({ state: 'OK', value: rawIndex }),
    );
    expect(decision.state).toBe('READY');
  });

  test('all six resource indices exactly bind playlist/key/segment closure and pass scenario preflight', async () => {
    const cases = [
      ['encryption/hls_aes128_decrypt', 'hls_aes128'],
      ['encryption/hls_sample_aes_decrypt', 'hls_sample_aes'],
      ['encryption/hls_aes128_sequence_zero_iv_decrypt', 'hls_aes128_seq0'],
      ['encryption/hls_aes128_sequence_nonzero_iv_decrypt', 'hls_aes128_seq42'],
      ['encryption/hls_aes128_key_rotation_decrypt', 'hls_aes128_rotation'],
      ['encryption/hls_aes128_method_none_transition_decrypt', 'hls_aes128_method_none'],
    ] as const;
    for (const [scenarioId, name] of cases) {
      const scenario = encryptionScenarios.find((entry) => entry.id === scenarioId)!;
      const playlistPath = join('fixtures/media', `${name}.m3u8`);
      const playlistBytes = new Uint8Array(readFileSync(playlistPath));
      const rawIndex = JSON.parse(readFileSync(join('fixtures/golden', `${name}.m3u8.resources.json`), 'utf8'));
      const index = parseHlsResourceIndex(rawIndex);
      const rawKey = JSON.parse(readFileSync(join('fixtures/golden', `${name}.m3u8.keys.json`), 'utf8'));
      const keyRecord = parseAuthoritativeKeyRecord(rawKey.payload ?? rawKey);
      expect(index.resources.map((entry) => ({ role: entry.role, uri: entry.uri })), name).toEqual(
        inspectHlsResourceReferences(new TextDecoder().decode(playlistBytes)),
      );
      expect(index.playlist, name).toEqual({ assetId: `${name}.m3u8`, sha256: digest(playlistBytes), sizeBytes: playlistBytes.byteLength });
      for (const resource of index.resources) {
        const bytes = readFileSync(join('fixtures/media', resource.uri));
        expect({ sha256: digest(bytes), sizeBytes: bytes.byteLength }, `${name}:${resource.uri}`).toEqual({
          sha256: resource.sha256, sizeBytes: resource.sizeBytes,
        });
        if (resource.role === 'key') expect(resource.sizeBytes).toBe(16);
      }
      const decision = await preflightHlsResourceIndex(
        scenario.options,
        {
          assetId: `${name}.m3u8`, logicalPath: `scenarios/${scenarioId}/${name}.m3u8`,
          sha256: digest(playlistBytes), sizeBytes: playlistBytes.byteLength,
        },
        playlistBytes,
        async () => ({ state: 'OK', value: rawIndex }),
        keyRecord,
      );
      expect(decision.state, name).toBe('READY');
    }
  });

  test('sequence IV, key rotation, and METHOD=NONE media bytes decrypt to the retained clear segments', () => {
    const cases = [
      { name: 'hls_aes128_seq0', start: 0, keys: [[0, '102132435465768798a9bacbdcedfe0f']] },
      { name: 'hls_aes128_seq42', start: 42, keys: [[42, '2031425364758697a8b9cadbecfd0e1f']] },
      {
        name: 'hls_aes128_rotation', start: 7,
        keys: [
          [7, '30415263748596a7b8c9daebfc0d1e2f'],
          [9, readFileSync('fixtures/media/hls_aes128_rotation_b.key').toString('hex')],
        ],
      },
      { name: 'hls_aes128_method_none', start: 3, keys: [[3, '405162738495a6b7c8d9eafb0c1d2e3f'], [5, null]] },
    ] as const;
    for (const fixture of cases) {
      for (let index = 0; index < 5; index++) {
        const sequence = fixture.start + index;
        const active = [...fixture.keys].reverse().find(([first]) => first <= sequence);
        const actual = readFileSync(join('fixtures/media', `${fixture.name}_${String(index).padStart(3, '0')}.ts`));
        const clear = readFileSync(join('fixtures/media', `hls_vod_${String(index).padStart(3, '0')}.ts`));
        const decrypted = active?.[1]
          ? aesCbcDecrypt(actual, Buffer.from(active[1], 'hex'), sequenceIvForTest(sequence))
          : actual;
        expect(digest(decrypted), `${fixture.name}:${index}`).toBe(digest(clear));
      }
    }
    const rotation = parseHlsResourceIndex(JSON.parse(readFileSync('fixtures/golden/hls_aes128_rotation.m3u8.resources.json', 'utf8')));
    expect(rotation.resources.filter((entry) => entry.role === 'key').map((entry) => entry.uri)).toEqual([
      'hls_aes128_rotation_a.key', 'hls_aes128_rotation_b.key',
    ]);
    const methodNone = parseHlsResourceIndex(JSON.parse(readFileSync('fixtures/golden/hls_aes128_method_none.m3u8.resources.json', 'utf8')));
    expect(methodNone.resources.filter((entry) => entry.role === 'key')).toHaveLength(1);
  });

  test('selected 01/02/03 HLS catalog candidates remain fail-closed without candidate-specific indices', () => {
    const parsed = parseScenarioSourceCatalog(readFileSync('fixtures/media/scenarios/_sources.ndjson', 'utf8'));
    expect(parsed.state).toBe('VALID');
    if (parsed.state !== 'VALID') return;
    const scenario = encryptionScenarios.find((entry) => entry.id === 'encryption/hls_aes128_decrypt')!;
    const row = scenarioSourceMap(parsed.catalog).get(scenario.id)!;
    expect(row.files.map((file) => file.file)).toEqual(['01.m3u8', '02.m3u8', '03.m3u8']);
    for (const file of row.files) {
      const eligibility = assessCandidateEligibility(scenario, row, file, scenario.definitionHash);
      expect(eligibility).toMatchObject({ eligible: false });
    }
  });
});

function metadataProbe(reorder: boolean, aliases: boolean): any {
  const video = {
    index: reorder ? 9 : 0, codec_type: 'video', codec_name: aliases ? 'avc1.640028' : 'h264',
    codec_tag_string: aliases ? 'avc3' : 'avc1', profile: 'High', level: 40,
    width: 1920, height: 1080, coded_width: 1920, coded_height: 1088,
    avg_frame_rate: '30000/1001', r_frame_rate: '30000/1001', time_base: '1/90000',
    duration: '10.000000', duration_ts: 900_000, nb_frames: '300', bit_rate: '1000000',
  };
  const audio = {
    index: reorder ? 7 : 1, codec_type: 'audio', codec_name: aliases ? 'mp4a.40.29' : 'aac',
    codec_tag_string: 'mp4a', profile: 'HE-AACv2', sample_rate: '48000', channels: 2,
    channel_layout: 'stereo', time_base: '1/48000', duration: '10.000000', duration_ts: 480_000,
    initial_padding: 1_024, trailing_padding: 512, bit_rate: '128000', tags: { language: 'eng' },
  };
  return {
    format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '10.000000', start_time: '0.000000', tags: { major_brand: 'isom' } },
    streams: reorder ? [audio, video] : [video, audio],
  };
}

function cadenceFrames(timesUs: number[], streamIndex = 0): any {
  return { frames: timesUs.map((ptsUs, index) => ({ stream_index: streamIndex, best_effort_timestamp_time: String(ptsUs / 1_000_000), key_frame: index === 0 ? 1 : 0 })) };
}

function packetProbe(tag: string, sizes: number[]): any {
  return {
    streams: [{
      index: 0, codec_type: 'video', codec_name: 'h264', codec_tag_string: tag,
      nal_length_size: tag === 'h264' ? undefined : 4,
      extradata: tag === 'h264' ? undefined : '00000000: 0164001f ffe10004 6764001f 01000268 ee',
    }],
    packets: sizes.map((size, index) => ({
      stream_index: 0, size, pts_time: String(index / 30), dts_time: String(index / 30),
      duration_time: String(1 / 30), flags: index === 0 ? 'K_' : '__', pos: 100 + index * 200,
      data_hash: `sha256:${index === 0 ? 'c' : 'd'}`.padEnd(71, index === 0 ? 'c' : 'd'),
    })),
  };
}

function validEnvelope(kind: 'metadata' | 'packets' | 'frames' | 'ssim' | 'alpha' | 'keys' | 'segments' | 'availability', payload: unknown, availability = { state: 'ready' }): any {
  const sourceMedia = { sha256: digest(TEST_MEDIA_BYTES), sizeBytes: TEST_MEDIA_BYTES.byteLength };
  const provenance = createGoldenProvenance({
    artifactKind: kind, assetId: 'a.mp4', sourceMedia, recipe: 'test#fixture',
    normalizedArguments: { kind }, baker: 'fixture-test@1', perimeter: testToolPerimeter(), payload,
  });
  return createGoldenEnvelope({ artifactKind: kind, assetId: 'a.mp4', sourceMedia, payload, provenance, availability });
}

function generationArtifacts(envelope: any): any[] {
  const sourceSha256 = digest(TEST_MEDIA_BYTES);
  const manifest = {
    $schema: './schemas/fixture-manifest-v1.schema.json',
    suiteCorpusVersion: 'test',
    assets: [{ id: 'a.mp4', source: 'generated', sha256: sourceSha256, sizeBytes: TEST_MEDIA_BYTES.byteLength }],
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest)}\n`);
  return [
    generationArtifact('golden/a.meta.json', envelope),
    rawGenerationArtifact('manifest.json', manifestBytes, 'manifest'),
    rawGenerationArtifact('media/a.mp4', TEST_MEDIA_BYTES, 'media'),
  ];
}

function rawGenerationArtifact(logicalPath: string, bytes: Uint8Array, artifactKind: string): any {
  const sha256 = digest(bytes);
  return {
    logicalPath,
    artifactKind,
    bytes,
    sourceMediaSha256: sha256,
    provenanceSha256: 'e'.repeat(64),
    audit: {
      recipe: 'test#raw', bakerVersion: 'fixture-test@1', outputArtifactSha256: sha256,
    },
  };
}

function testToolPerimeter(): any {
  const present = (name: string) => ({ state: 'present', executable: name, versionOutput: `${name} test-version` });
  const absent = { state: 'absent' };
  return {
    schemaVersion: 'tool-perimeter@1',
    tools: {
      bun: present('bun'), ffmpeg: present('ffmpeg'), ffprobe: present('ffprobe'),
      bento4: absent, bento4Hls: absent, shakaPackager: absent,
      playwright: { state: 'not-applicable' }, browser: { state: 'not-applicable' },
    },
    platform: { os: 'test', release: 'test', arch: 'test', locale: 'C', timezone: 'UTC' },
    environment: {
      SOURCE_DATE_EPOCH: '0', LANG: 'C', LC_ALL: 'C', TZ: 'UTC',
      BRAVE_PATH: null, FFMPEG_PATH: null, FFPROBE_PATH: null,
    },
    declaredLock: {
      sha256: 'd'.repeat(64), sourceDateEpoch: 0, locale: 'C', timezone: 'UTC',
      required: { bun: 'test', ffmpeg: 'test', ffprobe: 'test' }, optional: {},
    },
  };
}

function generationArtifact(logicalPath: string, envelope: any): any {
  return {
    logicalPath, artifactKind: envelope.artifactKind,
    bytes: `${JSON.stringify(envelope, null, 2)}\n`, sourceMediaSha256: envelope.sourceMedia.sha256,
    provenanceSha256: canonicalSha256(envelope.provenance),
  };
}

function temporaryRoot(): string {
  const path = mkdtempSync(join(tmpdir(), 'media-test-fixture-'));
  temporaryRoots.push(path);
  return path;
}

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function aesCbcDecrypt(value: Uint8Array, key: Uint8Array, iv: Uint8Array): Buffer {
  const decipher = createDecipheriv('aes-128-cbc', key, iv);
  return Buffer.concat([decipher.update(value), decipher.final()]);
}

function sequenceIvForTest(sequence: number): Buffer {
  const iv = Buffer.alloc(16);
  iv.writeBigUInt64BE(BigInt(sequence), 8);
  return iv;
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
}
