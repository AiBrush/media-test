import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  readBrowserFrameEvidencePair,
  validateBrowserFrameEvidencePair,
} from '../fixtures/lib/browser-frame-publication.mjs';
import {
  admittedScenarioAssetIdsFromSelectionManifest,
  planScenarioPublicationScope,
} from '../fixtures/bake-scenario-goldens.mjs';
import { canonicalSha256 } from '../fixtures/lib/golden-normalization.mjs';
import {
  auditGeneration,
  publishGeneration,
} from '../fixtures/lib/generation-publication.mjs';
import {
  PIXEL_NORMALIZATION_VERSION,
  browserGoldenProvenance,
} from '../src/core/frame-bake.ts';
import { readGoldenEvidenceBytesV1 } from '../src/core/golden-evidence.ts';
import { ActiveFixtureRuntime } from '../src/core/fixture-integrity.ts';
import {
  ALPHA_DIGEST_ALGORITHM,
  ALPHA_EVIDENCE_SCHEMA,
  alphaFrameEvidence,
  parseAlphaEvidenceArtifact,
} from '../src/features/decode-seek/alpha.ts';
import {
  buildSelectionManifest,
  parseBakedCorpusManifest,
  parseScenarioSourceCatalog,
} from '../src/core/media-selection.ts';
import { decodeSeekScenarios } from '../src/scenarios/decode-seek/index.ts';

const roots: string[] = [];
afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('browser frame evidence active-generation publication', () => {
  test('same-row envelope rejection cannot widen selected publication scope', () => {
    const catalogResult = parseScenarioSourceCatalog(
      readFileSync('fixtures/media/scenarios/_sources.ndjson', 'utf8'),
    );
    if (catalogResult.state !== 'VALID') throw new Error('scenario source catalog must validate');
    const bakedResult = parseBakedCorpusManifest(JSON.parse(readFileSync('fixtures/manifest.json', 'utf8')));
    if (bakedResult.state !== 'VALID') throw new Error('fixture manifest must validate');
    const scenario = decodeSeekScenarios.find((entry) =>
      entry.id === 'decode-seek/decode_size_tiny_h264_360p');
    if (!scenario) throw new Error('bounded decode scenario is missing');
    const selection = buildSelectionManifest({
      scenarios: [scenario],
      catalog: catalogResult.catalog,
      bakedManifest: bakedResult.manifest,
    });
    const admitted = admittedScenarioAssetIdsFromSelectionManifest(selection);
    const accepted = 'scenarios/decode-seek/decode_size_tiny_h264_360p/03.mp4';
    const rejected = 'scenarios/decode-seek/decode_size_tiny_h264_360p/01.mp4';
    expect(admitted).toContain(accepted);
    expect(admitted).not.toContain(rejected);

    const plan = planScenarioPublicationScope({
      activeScope: { mode: 'selected-assets', assetIds: ['scenarios/mux/already-safe/01.mp4'] },
      stagedArtifactAssetIds: [accepted, rejected],
      stagedMediaAssetIds: [accepted, rejected],
      manifestAssetIds: [],
      admittedScenarioAssetIds: admitted,
    });
    expect(plan).toEqual({
      publicationScope: {
        mode: 'selected-assets',
        assetIds: [accepted, 'scenarios/mux/already-safe/01.mp4'],
      },
      publishableStagedMediaAssetIds: [accepted],
    });
  });

  test('a flat baked alpha bundle validates, publishes atomically, and resolves through the active runtime', async () => {
    const pair = browserPair('vp9_alpha.webm');
    expect(validateBrowserFrameEvidencePair({ ...pair, requireAlpha: true })).toMatchObject({
      framesDocument: { artifactKind: 'frames' },
      ssimDocument: { artifactKind: 'ssim' },
      alphaDocument: { artifactKind: 'alpha' },
    });

    const framesBytes = Buffer.from(`${JSON.stringify(pair.framesDocument, null, 2)}\n`);
    const runtime = await readGoldenEvidenceBytesV1({
      kind: 'frames',
      reference: {
        logicalPath: `golden/${pair.assetId}.frames.json`,
        url: `/golden/${pair.assetId}.frames.json`,
        expectedArtifactSha256: digest(framesBytes),
        expectedArtifactSizeBytes: framesBytes.byteLength,
        expectedSourceMediaSha256: pair.sourceMedia.sha256,
      },
      bytes: new Uint8Array(framesBytes),
      actualArtifactSha256: digest(framesBytes),
    });
    expect(runtime).toMatchObject({ state: 'ready', kind: 'frames' });

    const alphaBytes = Buffer.from(`${JSON.stringify(pair.alphaDocument, null, 2)}\n`);
    const alphaRuntime = await readGoldenEvidenceBytesV1({
      kind: 'alpha',
      reference: {
        logicalPath: 'golden/vp9_alpha.webm.alpha.json',
        url: '/golden/vp9_alpha.webm.alpha.json',
        expectedArtifactSha256: digest(alphaBytes),
        expectedArtifactSizeBytes: alphaBytes.byteLength,
        expectedSourceMediaSha256: pair.sourceMedia.sha256,
      },
      bytes: new Uint8Array(alphaBytes),
      actualArtifactSha256: digest(alphaBytes),
      parsePayload: parseAlphaEvidenceArtifact,
    });
    expect(alphaRuntime).toMatchObject({ state: 'ready', kind: 'alpha' });

    const root = temporaryRoot();
    const media = pair.sourceBytes;
    const manifest = {
      $schema: './schemas/fixture-manifest-v1.schema.json',
      suiteCorpusVersion: 'browser-frame-test',
      assets: [{ id: pair.assetId, source: 'generated', ...pair.sourceMedia }],
    };
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    const published = publishGeneration({
      rootDir: root,
      publicationScope: { mode: 'selected-assets', assetIds: [pair.assetId] },
      sourceDateEpoch: 0,
      artifacts: [
        goldenRecord(`golden/${pair.assetId}.frames.json`, pair.framesDocument),
        goldenRecord(`golden/${pair.assetId}.ssim.json`, pair.ssimDocument),
        goldenRecord(`golden/${pair.assetId}.alpha.json`, pair.alphaDocument),
        rawRecord(`media/${pair.assetId}`, media, 'media'),
        rawRecord('manifest.json', manifestBytes, 'manifest'),
      ],
    });
    expect(auditGeneration(root, published.index)).toMatchObject({ ok: true, issues: [], checked: 5 });

    const indexUrl = 'https://fixture.test/fixtures/generation-index.json';
    const fixturesBaseUrl = 'https://fixture.test/fixtures/';
    const active = new ActiveFixtureRuntime({
      indexUrl,
      fixturesBaseUrl,
      fetchImpl: (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === indexUrl) return Response.json(published.index);
        const entry = published.index.entries.find((candidate) =>
          url === new URL(candidate.generationPath, fixturesBaseUrl).href);
        if (!entry) return new Response(null, { status: 404 });
        return new Response(readFileSync(join(root, entry.generationPath)), { status: 200 });
      }) as typeof fetch,
    });
    expect(await active.resolveMedia(pair.assetId)).toMatchObject({ state: 'ready' });
    expect(await active.loadGoldenEvidence(pair.assetId, 'alpha', parseAlphaEvidenceArtifact)).toMatchObject({
      state: 'ready',
      value: { assetId: 'vp9_alpha.webm', sourceSha256: pair.sourceMedia.sha256 },
    });
  });

  test('required alpha evidence fails closed on absence and payload drift', () => {
    const pair = browserPair('vp9_alpha.webm');
    expect(() => validateBrowserFrameEvidencePair({
      ...pair,
      alphaDocument: undefined,
      requireAlpha: true,
    })).toThrow('no independently baked alpha document');

    const wrongSource = replaceAlphaPayload(pair, {
      ...pair.alphaDocument.payload,
      sourceSha256: '0'.repeat(64),
    });
    expect(() => validateBrowserFrameEvidencePair({
      ...pair,
      alphaDocument: wrongSource,
      requireAlpha: true,
    })).toThrow('payload source identity does not match selected media');

    const wrongPts = replaceAlphaPayload(pair, {
      ...pair.alphaDocument.payload,
      frames: [{ ...pair.alphaDocument.payload.frames[0], ptsUs: 1 }],
    });
    expect(() => validateBrowserFrameEvidencePair({
      ...pair,
      alphaDocument: wrongPts,
      requireAlpha: true,
    })).toThrow('timestamp/dimensions[0] do not match frames evidence');
  });

  test('source drift and browser time-mode drift reject before staging', () => {
    const pair = browserPair();
    expect(() => validateBrowserFrameEvidencePair({
      ...pair,
      sourceMedia: { ...pair.sourceMedia, sha256: '0'.repeat(64) },
    })).toThrow('source identity does not match selected media');

    const drifted = structuredClone(pair);
    drifted.framesDocument.provenance.runDetails.timeMode = 'source-date-epoch';
    expect(() => validateBrowserFrameEvidencePair(drifted)).toThrow(
      "timeMode must be 'browser-qualified-wall-clock' when browserQualified is true",
    );
  });

  test('legacy filled evidence is preserved as compatibility data but never promoted', () => {
    const root = temporaryRoot();
    const framesPath = join(root, 'asset.mp4.frames.json');
    const ssimPath = join(root, 'asset.mp4.ssim.json');
    writeFileSync(framesPath, JSON.stringify({
      pending: false,
      assetId: 'asset.mp4',
      frames: [{ index: 0, ptsUs: 0, sha256: 'a'.repeat(64) }],
    }));
    expect(readBrowserFrameEvidencePair({
      framesPath,
      ssimPath,
      assetId: 'asset.mp4',
      sourceMedia: browserPair().sourceMedia,
      toolchainSha256: 'd'.repeat(64),
    })).toEqual({ state: 'legacy' });
  });
});

function browserPair(assetId = 'asset.mp4'): any {
  const sourceBytes = Buffer.from('browser-frame-source');
  const sourceMedia = { sha256: digest(sourceBytes), sizeBytes: sourceBytes.byteLength };
  const frame = {
    index: 0,
    ptsUs: 0,
    sha256: 'a'.repeat(64),
    width: 2,
    height: 2,
    pixelProvenance: {
      state: 'real-pixels',
      source: 'FrameSink.getPixels',
      expectedPtsUs: 0,
      observedPtsUs: 0,
      pixelNormalizationVersion: PIXEL_NORMALIZATION_VERSION,
      codedDimensions: { width: 2, height: 2 },
      displayDimensions: { width: 2, height: 2 },
      colorSpace: { state: 'not-exposed-by-frame-sink' },
      crop: { state: 'not-exposed-by-frame-sink' },
      rotation: { state: 'not-exposed-by-frame-sink' },
    },
  };
  const framesPayload = {
    pixelNormalizationVersion: PIXEL_NORMALIZATION_VERSION,
    decoderAvailability: { state: 'available', decoder: 'platform-engine', configuration: { codec: 'h264' } },
    frames: [frame],
  };
  const ssimPayload = {
    pixelNormalizationVersion: PIXEL_NORMALIZATION_VERSION,
    side: 1,
    frames: [{ expectedPtsUs: 0, observedPtsUs: 0, signature: [23] }],
    sigs: [[23]],
  };
  const runtime = {
    browser: {
      family: 'chromium', version: 'test', executable: 'playwright:chromium', userAgent: 'test browser',
    },
    platform: { os: 'test-browser', arch: 'test', locale: 'C', timezone: 'UTC' },
    toolPerimeter: recordedPerimeter(),
    decoderConfiguration: {
      engine: 'platform', framePixelAccess: 'FrameSink.getPixels',
      pixelNormalizationVersion: PIXEL_NORMALIZATION_VERSION,
    },
    startedAtIso: '2026-01-01T00:00:00.000Z',
    finishedAtIso: '2026-01-01T00:00:01.000Z',
  };
  const framesDocument = {
    schema: 'media-test/golden-artifact@1', schemaVersion: '1.0.0', artifactKind: 'frames',
    pending: false, assetId, sourceMedia,
    pixelNormalizationVersion: PIXEL_NORMALIZATION_VERSION,
    availability: { state: 'ready' },
    provenance: browserGoldenProvenance('frames', assetId, sourceMedia, framesPayload, runtime, runtime.finishedAtIso),
    payload: framesPayload,
    frames: [frame],
  };
  const ssimDocument = {
    schema: 'media-test/golden-artifact@1', schemaVersion: '1.0.0', artifactKind: 'ssim',
    assetId, sourceMedia, availability: { state: 'ready' },
    provenance: browserGoldenProvenance('ssim', assetId, sourceMedia, ssimPayload, runtime, runtime.finishedAtIso),
    payload: ssimPayload, side: 1, sigs: [[23]],
  };
  const alphaPayload = {
    schema: ALPHA_EVIDENCE_SCHEMA,
    assetId,
    sourceSha256: sourceMedia.sha256,
    algorithm: ALPHA_DIGEST_ALGORITHM,
    frames: [alphaFrameEvidence(0, 2, 2, new Uint8Array([
      1, 2, 3, 0, 1, 2, 3, 64,
      1, 2, 3, 128, 1, 2, 3, 254,
    ]))],
  };
  const alphaDocument = {
    schema: 'media-test/golden-artifact@1', schemaVersion: '1.0.0', artifactKind: 'alpha',
    assetId, sourceMedia, pixelNormalizationVersion: PIXEL_NORMALIZATION_VERSION,
    availability: { state: 'ready' },
    provenance: browserGoldenProvenance('alpha', assetId, sourceMedia, alphaPayload, runtime, runtime.finishedAtIso),
    payload: alphaPayload,
  };
  return {
    framesDocument,
    ssimDocument,
    alphaDocument,
    assetId,
    sourceBytes,
    sourceMedia,
    runtime,
    toolchainSha256: 'd'.repeat(64),
  };
}

function replaceAlphaPayload(pair: any, payload: any): any {
  return {
    ...pair.alphaDocument,
    payload,
    provenance: browserGoldenProvenance(
      'alpha',
      pair.assetId,
      pair.sourceMedia,
      payload,
      pair.runtime,
      pair.runtime.finishedAtIso,
    ),
  };
}

function recordedPerimeter(): any {
  const present = (name: string) => ({ state: 'present', executable: name, versionOutput: `${name} test` });
  return {
    schemaVersion: 'tool-perimeter@1',
    tools: {
      bun: present('bun'), ffmpeg: present('ffmpeg'), ffprobe: present('ffprobe'),
      bento4: { state: 'absent' }, bento4Hls: { state: 'absent' }, shakaPackager: { state: 'absent' },
      playwright: present('playwright'), browser: present('browser'),
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

function goldenRecord(logicalPath: string, document: any): any {
  return {
    logicalPath,
    artifactKind: document.artifactKind,
    bytes: Buffer.from(`${JSON.stringify(document, null, 2)}\n`),
    sourceMediaSha256: document.sourceMedia.sha256,
    provenanceSha256: canonicalSha256(document.provenance),
    audit: {
      recipe: document.provenance.buildDefinition.recipe,
      bakerVersion: document.provenance.runDetails.baker,
      outputArtifactSha256: document.provenance.outputArtifact.sha256,
    },
  };
}

function rawRecord(logicalPath: string, bytes: Uint8Array, artifactKind: string): any {
  const sha256 = digest(bytes);
  return {
    logicalPath, artifactKind, bytes, sourceMediaSha256: sha256, provenanceSha256: 'e'.repeat(64),
    audit: {
      recipe: 'tests/browser-frame-publication#raw',
      bakerVersion: 'browser-frame-publication-test@1',
      outputArtifactSha256: sha256,
    },
  };
}

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'media-test-browser-frame-'));
  roots.push(root);
  return root;
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
