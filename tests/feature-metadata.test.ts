import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  AdapterContractError,
  validateNormalizedMetadata,
  type BrowserName,
  type CapabilitySet,
  type MediaEngine,
  type MediaInput,
  type NormalizedMetadata,
} from '../src/core/engine.ts';
import {
  emptyGoldenStore,
  runOracle,
  type OracleContext,
} from '../src/core/oracles.ts';
import { sha256Hex } from '../src/core/media-selection.ts';
import { runOne, type PixelBehaviorEvidence } from '../src/core/runner.ts';
import type { CodecSupport } from '../src/core/feature-detect.ts';
import type { ResolvedInput, VerifiedContent } from '../src/core/media-selection.ts';
import type { Scenario } from '../src/core/scenario.ts';

import {
  EXTENDED_METADATA_SCHEMA,
  METADATA_EQUIVALENCE_MATRIX_SCHEMA,
  SEMANTIC_TAG_KEYS,
  assessMetadataRecovery,
  assessMetadataTagsFromObservation,
  assessSemanticTagContract,
  auditMetadataEquivalenceMatrix,
  canonicalizeSemanticTags,
  defineMetadataRecoveryContract,
  defineMetadataTagContract,
  metadataRecoveryContractFromOptions,
  metadataTagContractFromOptions,
  parseMetadataEquivalenceMatrix,
  readNeutralMetadataTags,
  reduceRequiredMetadataLayers,
  validateExtendedMetadata,
  verifyMetadataTagsByNeutralReprobe,
  type ExtendedNormalizedMetadata,
  type MetadataCarrier,
  type NeutralMetadataEvidence,
} from '../src/features/metadata/index.ts';
import { metadataScenarios } from '../src/scenarios/metadata/index.ts';
import { METADATA_UNICODE_TAGS } from '../src/scenarios/metadata/write-roundtrip.ts';

const encoder = new TextEncoder();

function scenario(id: string) {
  return metadataScenarios.find((item) => item.id === id)!;
}

function verdict(value: ReturnType<typeof assessMetadataRecovery>): string {
  return value.state === 'VERDICT' ? value.verdict : value.state;
}

function fixtureJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')) as unknown;
}

describe('REQ-FEAT-40 extended normalized metadata schema', () => {
  const complete: ExtendedNormalizedMetadata = {
    schema: EXTENDED_METADATA_SCHEMA,
    container: 'mp4',
    durationSec: 9.5,
    presentationDurationSec: 9.5,
    rawMediaSpanSec: 10,
    sourceTimebase: { numerator: 1, denominator: 1_000 },
    tags: { title: 'Program' },
    scopedTags: [{ scope: 'container', rawKey: '©nam', canonicalKey: 'title', value: 'Program' }],
    chapters: [{
      id: 'chapter-1', startTimeSec: 0, endTimeSec: 9.5, title: 'Intro', language: 'eng',
      tags: [{ scope: 'chapter', chapterId: 'chapter-1', rawKey: 'TITLE', canonicalKey: 'title', value: 'Intro' }],
    }],
    coverArt: [{
      id: 'cover-1', mime: 'image/png', byteLength: 67,
      sha256: '0'.repeat(64), width: 1, height: 1, description: 'cover', language: 'eng',
    }],
    timecodes: [{ trackId: 'v1', value: '00:00:00;00', rateNumerator: 30_000, rateDenominator: 1_001, dropFrame: true }],
    tracks: [{
      type: 'video', codec: 'h264', nativeCodecTag: 'avc1', rawCodec: 'avc1', canonicalCodec: 'h264',
      trackId: 'v1', defaultDisposition: true, disposition: { default: 1 },
      width: 1920, height: 1080, rawWidth: 1920, rawHeight: 1080,
      presentationWidth: 1080, presentationHeight: 1920,
      rotation: 90, rotationMatrix: { values: [0, 1, 0, -1, 0, 0, 0, 0, 1] },
      fps: 29.97002997, rateRational: { numerator: 30_000, denominator: 1_001 }, cadence: 'CFR',
      frameTimestampsUs: [0, 33_367, 66_733],
      sourceTimebase: { numerator: 1, denominator: 90_000 },
      movieTimebase: { numerator: 1, denominator: 1_000 },
      mediaTimebase: { numerator: 1, denominator: 90_000 },
      rawMediaSpanSec: 10, presentationDurationSec: 9.5,
      editList: [{
        segmentDuration: 9_500, mediaTime: 3_000, mediaRateNumerator: 1, mediaRateDenominator: 1,
        movieTimescale: 1_000, mediaTimescale: 90_000,
      }],
      primingSamples: 0, paddingSamples: 0,
      scopedTags: [{ scope: 'track', trackId: 'v1', rawKey: 'LANGUAGE', value: 'eng', language: 'eng' }],
    }],
  };

  test('retains every modeled field with raw and canonical evidence distinct', () => {
    expect(validateExtendedMetadata(complete)).toMatchObject({
      state: 'OK',
      evidence: { trackCount: 1, tagCount: 1, scopedTagCount: 3 },
    });
    expect(complete.tracks[0]).toMatchObject({
      rawCodec: 'avc1', canonicalCodec: 'h264', trackId: 'v1', defaultDisposition: true,
      rawWidth: 1920, presentationWidth: 1080, primingSamples: 0, paddingSamples: 0,
    });
  });

  test('the production adapter boundary retains and validates the promoted fields', () => {
    expect(validateNormalizedMetadata('metadata-test@1', complete)).toBe(complete);
    for (const invalid of [
      { ...complete, schema: 'media-test/normalized-metadata@999' },
      { ...complete, tracks: [{ ...complete.tracks[0]!, frameTimestampsUs: [0, 10, 9] }] },
      { ...complete, tracks: [{ ...complete.tracks[0]!, rotationMatrix: { values: [1, 0] } }] },
      { ...complete, scopedTags: [{ scope: 'track', rawKey: 'TITLE', value: 'x' }] },
      { ...complete, timecodes: [{ value: '00:00:00:00', rateNumerator: 30_000 }] },
    ]) {
      expect(() => validateNormalizedMetadata('metadata-test@1', invalid)).toThrow(AdapterContractError);
    }
  });

  test('rejects non-finite, impossible, unbounded, and inconsistently scoped observations', () => {
    const invalid: unknown[] = [
      { ...complete, durationSec: Number.NaN },
      { ...complete, tracks: [{ ...complete.tracks[0]!, width: -1 }] },
      { ...complete, tracks: [{ ...complete.tracks[0]!, frameTimestampsUs: [0, 10, 9] }] },
      { ...complete, tracks: [{ ...complete.tracks[0]!, sourceTimebase: { numerator: 0, denominator: 1 } }] },
      { ...complete, tracks: [{ ...complete.tracks[0]!, scopedTags: [{ scope: 'track', rawKey: 'TITLE', value: 'x' }] }] },
      { ...complete, coverArt: [{ id: 'x', mime: 'image/png', byteLength: 1, sha256: 'bad' }] },
      { ...complete, chapters: [{ id: 'x', startTimeSec: 5, endTimeSec: 4 }] },
    ];
    for (const value of invalid) expect(validateExtendedMetadata(value).state).toBe('INVALID');
  });

  test('committed equivalence fixture exercises every modeled schema field', () => {
    const matrix = parseMetadataEquivalenceMatrix(fixtureJson('fixtures/golden/metadata-equivalence-classes.json'))!;
    expect(matrix.schema).toBe(METADATA_EQUIVALENCE_MATRIX_SCHEMA);
    expect(matrix.modeledFields).toContain('metadata.chapters');
    expect(matrix.modeledFields).toContain('metadata.coverArt');
    expect(matrix.modeledFields).toContain('metadata.timecodes');
    for (const item of matrix.cases) {
      expect(validateExtendedMetadata(item.reference).state).toBe('OK');
      expect(validateExtendedMetadata(item.candidate).state).toBe('OK');
    }
  });
});

describe('REQ-FEAT-41 semantic tag read/write by neutral re-probe', () => {
  const encodedByCarrier: Record<'mp4' | 'mkv' | 'mp3' | 'flac' | 'ogg', Uint8Array> = {
    mp4: mp4Tags(METADATA_UNICODE_TAGS),
    mkv: matroskaTags(METADATA_UNICODE_TAGS),
    mp3: id3Tags(METADATA_UNICODE_TAGS),
    flac: flacTags(METADATA_UNICODE_TAGS),
    ogg: oggTags(METADATA_UNICODE_TAGS),
  };

  test('reads the Unicode/long-comment subset from every supported write carrier', () => {
    expect(encoder.encode(METADATA_UNICODE_TAGS.comment).byteLength).toBeGreaterThan(255);
    for (const [carrier, bytes] of Object.entries(encodedByCarrier) as Array<[keyof typeof encodedByCarrier, Uint8Array]>) {
      const contract = defineMetadataTagContract({
        mode: 'write-reprobe', carrier, requested: METADATA_UNICODE_TAGS,
      });
      const read = readNeutralMetadataTags(bytes, carrier);
      expect(read.state, carrier).toBe('OK');
      expect(verifyMetadataTagsByNeutralReprobe({ bytes, contract }), carrier).toMatchObject({
        state: 'VERDICT', verdict: 'PASS', reasonCode: 'METADATA_TAG_WRITE_READBACK_MATCH',
      });
    }
  });

  test('lost/altered values and semantically wrong scope fail independently of extra technical tags', () => {
    const evidence = neutralEvidence('mkv', [
      { scope: 'container', rawKey: 'TITLE', value: METADATA_UNICODE_TAGS.title },
      { scope: 'container', rawKey: 'ENCODER', value: 'technical' },
    ]);
    expect(assessSemanticTagContract(defineMetadataTagContract({
      mode: 'read-subset', carrier: 'mkv', requested: { title: METADATA_UNICODE_TAGS.title },
    }), evidence)).toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
    expect(assessSemanticTagContract(defineMetadataTagContract({
      mode: 'read-subset', carrier: 'mkv', requested: { title: 'altered' },
    }), evidence)).toMatchObject({ state: 'VERDICT', verdict: 'FAIL' });
    expect(assessSemanticTagContract(defineMetadataTagContract({
      mode: 'read-subset', carrier: 'mkv', requested: { artist: METADATA_UNICODE_TAGS.artist },
    }), neutralEvidence('mkv', [{ scope: 'track', trackId: '2', rawKey: 'ARTIST', value: METADATA_UNICODE_TAGS.artist }]))).toMatchObject({
      state: 'VERDICT', verdict: 'FAIL', reasonCode: 'METADATA_TAG_SUBSET_MISMATCH',
    });
  });

  test('different lossless carrier is a representation-diff PASS, while NFC-only value spelling is PASS', () => {
    const contract = defineMetadataTagContract({
      mode: 'cross-container-equality', sourceCarrier: 'mp4', carrier: 'mkv', requested: { artist: 'Café' },
    });
    const evidence = neutralEvidence('mkv', [{ scope: 'container', rawKey: 'ARTIST', value: 'Cafe\u0301' }]);
    // Carrier difference is a PASS, but the representation difference stays in the reasonCode.
    expect(assessSemanticTagContract(contract, evidence)).toMatchObject({
      state: 'VERDICT', verdict: 'PASS', reasonCode: 'METADATA_TAG_LOSSLESS_CARRIER_DIFFERENCE',
    });
  });

  test('no-tag inputs reject fabricated semantic tags but allow visible technical tags', () => {
    const contract = defineMetadataTagContract({ mode: 'assert-absence', carrier: 'wav' });
    expect(verifyMetadataTagsByNeutralReprobe({ bytes: wav(), contract })).toMatchObject({
      state: 'VERDICT', verdict: 'PASS', reasonCode: 'METADATA_SEMANTIC_TAGS_ABSENT',
    });
    expect(assessSemanticTagContract(contract, neutralEvidence('wav', [
      { scope: 'container', rawKey: 'INAM', value: 'fabricated' },
    ]))).toMatchObject({ state: 'VERDICT', verdict: 'FAIL', reasonCode: 'METADATA_SEMANTIC_TAG_FABRICATED' });
    expect(assessMetadataTagsFromObservation(contract, {
      container: 'wav', durationSec: 1, tracks: [{ type: 'audio', codec: 'pcm-s16' }], tags: { encoder: 'technical' },
    })).toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
  });

  test('all write/no-tag/cross-container scenarios carry executable neutral contracts', () => {
    const tagRewriteIds = [
      'metadata/write_mp4_tags', 'metadata/write_mkv_tags', 'metadata/write_mp3_id3',
      'metadata/write_flac_vorbiscomment', 'metadata/write_ogg_vorbiscomment',
      'metadata/tagedit_no_corrupt_video_mp4_mkv',
      'metadata/tagedit_no_corrupt_audio_flac',
      'metadata/meta_consistent_mp4_to_mkv',
    ] as const;
    for (const id of [
      ...tagRewriteIds,
      'metadata/read_no_tags_wav', 'metadata/read_no_tags_recorder_webm',
    ] as const) {
      expect(metadataTagContractFromOptions(scenario(id).options), id).toBeDefined();
    }
    for (const id of tagRewriteIds) {
      expect(scenario(id).oracles, id).toContain('reference-reimport');
    }
    expect(metadataTagContractFromOptions(scenario('metadata/write_mp4_tags').options)?.requested?.title)
      .toBe(METADATA_UNICODE_TAGS.title);
    const audioRewrite = scenario('metadata/tagedit_no_corrupt_audio_flac');
    expect(audioRewrite.revision).toBe(2);
    expect(audioRewrite.requires.features).toContain('metadata:write');
    expect((audioRewrite.options as { tags?: Record<string, string> }).tags).toEqual(METADATA_UNICODE_TAGS);
    expect(metadataTagContractFromOptions(audioRewrite.options)).toMatchObject({
      mode: 'write-reprobe', carrier: 'flac', requested: METADATA_UNICODE_TAGS,
    });
    expect(scenario('metadata/tagedit_no_corrupt_video_mp4_mkv').revision).toBe(3);
    expect(scenario('metadata/meta_consistent_mp4_to_mkv').revision).toBe(3);
  });

  test('conflicting aliases fail instead of silently selecting one', () => {
    const canonical = canonicalizeSemanticTags('mp4', {}, [
      { scope: 'container', rawKey: '©nam', value: 'one' },
      { scope: 'container', rawKey: 'com.apple.quicktime.title', value: 'two' },
    ]);
    expect(canonical.conflicts).toHaveLength(1);
  });

  test('maps the common ID3 TXXX:comment carrier without flattening its description', () => {
    expect(canonicalizeSemanticTags('mp3', { 'TXXX:comment': 'kept' }).semantic.comment).toBe('kept');
  });

  test('required tag and media layers are order-independent and cannot mask a reader error', () => {
    const structural = { state: 'VERDICT', oracle: 'reference-reimport', verdict: 'PASS', reasonCode: 'STRUCTURE_OK' } as const;
    const tags = { state: 'VERDICT', oracle: 'reference-reimport', verdict: 'PASS', reasonCode: 'TAGS_CARRIER_DIFF' } as const;
    const error = { state: 'ERROR', oracle: 'reference-reimport', reasonCode: 'TAG_READER_MISSING' } as const;
    expect(reduceRequiredMetadataLayers([structural, tags])).toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
    expect(reduceRequiredMetadataLayers([tags, structural])).toMatchObject({ state: 'VERDICT', verdict: 'PASS' });
    expect(reduceRequiredMetadataLayers([structural, error])).toMatchObject({ state: 'ERROR' });
  });

  test('reference-reimport requires both strict media preservation and neutral tag readback', async () => {
    const requested = { title: 'Production path 🎬' };
    const contract = defineMetadataTagContract({ mode: 'write-reprobe', carrier: 'mp3', requested });
    const frame = mp3Frame();
    const run = (title: string) => runOracle('reference-reimport', oracleContext({
      scenario: metadataOracleScenario('remux', 'reference-reimport', {
        container: 'mp3', robustness: { metadataTags: contract },
      }),
      input: mediaInput('fixture.mp3', frame, 'audio/mpeg'),
      output: {
        bytes: concat(id3Tags({ title }), new Uint8Array(frame.byteLength - 4)),
        mime: 'audio/mpeg', container: 'mp3',
      },
      golden: metadataGolden({
        container: 'mp3', durationSec: 1152 / 44_100,
        tracks: [{ type: 'audio', codec: 'mp3', sampleRate: 44_100, channels: 2 }],
      }),
    }));

    expect(await run(requested.title)).toMatchObject({
      state: 'VERDICT', verdict: 'PASS', reasonCode: 'METADATA_TAG_WRITE_READBACK_MATCH',
    });
    expect(await run('altered')).toMatchObject({
      state: 'VERDICT', verdict: 'FAIL', reasonCode: 'METADATA_TAG_WRITE_READBACK_MISMATCH',
    });
  });
});

describe('REQ-FEAT-42 bounded safe metadata recovery', () => {
  const id3 = defineMetadataRecoveryContract({
    corruptRegion: 'id3', expectedContainer: 'mp3', maximumTracks: 8,
    maximumTagEntries: 32, maximumTagValueBytes: 1024, forbiddenSemanticTags: SEMANTIC_TAG_KEYS,
  });

  test('clean rejection and sane structural recovery pass', () => {
    expect(assessMetadataRecovery({ disposition: 'rejected', contract: id3 })).toMatchObject({
      state: 'VERDICT', verdict: 'PASS', reasonCode: 'METADATA_RECOVERY_CLEAN_REJECTION',
    });
    expect(assessMetadataRecovery({
      disposition: 'returned', contract: id3,
      metadata: { container: 'mp3', durationSec: 1, tracks: [{ type: 'audio', codec: 'mp3', sampleRate: 44100, channels: 2 }], tags: { encoder: 'safe technical observation' } },
    })).toMatchObject({ state: 'VERDICT', verdict: 'PASS', reasonCode: 'METADATA_RECOVERY_SANE_PARTIAL' });
  });

  test('unsafe schema, impossible structure, fabricated corrupt tags, timeout and crash fail', () => {
    const cases = [
      { disposition: 'returned', contract: id3, metadata: { container: 'mp3', durationSec: Number.NaN, tracks: [{ type: 'audio', codec: 'mp3' }] } },
      { disposition: 'returned', contract: id3, metadata: { container: 'mp3', durationSec: -1, tracks: [{ type: 'audio', codec: 'mp3' }] } },
      { disposition: 'returned', contract: id3, metadata: { container: 'mp3', durationSec: 1, tracks: [] } },
      { disposition: 'returned', contract: id3, metadata: { container: 'mp3', durationSec: 1, tracks: [{ type: 'bogus', codec: 'mp3' }] } },
      { disposition: 'returned', contract: id3, metadata: { container: 'mp3', durationSec: 1, tracks: [{ type: 'audio', codec: 'mp3' }], tags: { TIT2: 'tainted title' } } },
      { disposition: 'timeout', contract: id3 },
      { disposition: 'crash', contract: id3 },
    ] as const;
    for (const item of cases) expect(verdict(assessMetadataRecovery(item))).toBe('FAIL');
  });

  test('malformed metadata scenarios attach semantic recovery alongside graceful handling', () => {
    for (const id of ['metadata/neg_garbled_id3_mp3_probe', 'metadata/neg_garbled_ilst_mp4_probe']) {
      const row = scenario(id);
      expect(row.oracles).toEqual(['graceful-failure', 'property-invariant']);
      expect((row.options as Record<string, unknown>).invariant).toBe('metadata-safe-recovery');
      expect(metadataRecoveryContractFromOptions(row.options), id).toBeDefined();
    }
  });

  test('property-invariant executes absence and safe-recovery contracts on production contexts', async () => {
    const noTags = scenario('metadata/read_no_tags_wav');
    const clean = await runOracle('property-invariant', oracleContext({
      scenario: noTags,
      metadata: { container: 'wav', durationSec: 1, tracks: [{ type: 'audio', codec: 'pcm-s16' }] },
    }));
    const fabricated = await runOracle('property-invariant', oracleContext({
      scenario: noTags,
      metadata: {
        container: 'wav', durationSec: 1, tracks: [{ type: 'audio', codec: 'pcm-s16' }],
        tags: { INAM: 'fabricated' },
      },
    }));
    expect(clean).toMatchObject({ state: 'VERDICT', verdict: 'PASS', reasonCode: 'METADATA_SEMANTIC_TAGS_ABSENT' });
    expect(fabricated).toMatchObject({ state: 'VERDICT', verdict: 'FAIL', reasonCode: 'METADATA_SEMANTIC_TAG_FABRICATED' });

    const recovery = scenario('metadata/neg_garbled_id3_mp3_probe');
    const rejected = await runOracle('property-invariant', oracleContext({ scenario: recovery }));
    const sane = await runOracle('property-invariant', oracleContext({
      scenario: recovery,
      metadata: { container: 'mp3', durationSec: 1, tracks: [{ type: 'audio', codec: 'mp3' }] },
    }));
    const tainted = await runOracle('property-invariant', oracleContext({
      scenario: recovery,
      metadata: {
        container: 'mp3', durationSec: 1, tracks: [{ type: 'audio', codec: 'mp3' }],
        tags: { TIT2: 'untrusted' },
      },
    }));
    expect(rejected).toMatchObject({ state: 'VERDICT', verdict: 'PASS', reasonCode: 'METADATA_RECOVERY_CLEAN_REJECTION' });
    expect(sane).toMatchObject({ state: 'VERDICT', verdict: 'PASS', reasonCode: 'METADATA_RECOVERY_SANE_PARTIAL' });
    expect(tainted).toMatchObject({ state: 'VERDICT', verdict: 'FAIL', reasonCode: 'METADATA_RECOVERY_CORRUPT_TAG_TRUSTED' });
  });

  test('runner retains metadata property verdicts instead of passing from operation presence', async () => {
    const row = scenario('metadata/read_no_tags_wav');
    const bytes = Uint8Array.from([1, 2, 3, 4]);
    const digest = await sha256Hex(bytes);
    const resolvedInputs: ResolvedInput[] = [{
      id: 'wav_s16.wav', urlAssetPath: 'wav_s16.wav', sha256: digest,
      sizeBytes: bytes.byteLength, integrity: 'VERIFIED',
    }];
    const verifiedContents: VerifiedContent[] = [{
      state: 'VERIFIED',
      identity: { logicalPath: 'wav_s16.wav', sha256: digest, sizeBytes: bytes.byteLength },
      bytes, actualSha256: digest, actualSizeBytes: bytes.byteLength,
    }];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('fixtures/golden/wav_s16.wav.meta.json')) {
        return Response.json({
          container: 'wav', durationSec: 1,
          tracks: [{ type: 'audio', codec: 'pcm-s16' }],
        });
      }
      return new Response(null, { status: 404, statusText: 'Not Found' });
    }) as typeof fetch;
    try {
      const run = (tags?: Record<string, string>) => runOne(
        metadataProbeEngine({
          container: 'wav', durationSec: 1, tracks: [{ type: 'audio', codec: 'pcm-s16' }],
          ...(tags ? { tags } : {}),
        }),
        row,
        METADATA_TEST_BROWSER,
        METADATA_TEST_SUPPORT,
        { pillar: 'functional', pixelBehavior: METADATA_TEST_PIXELS, resolvedInputs, verifiedContents },
      );
      const clean = await run();
      const fabricated = await run({ INAM: 'fabricated title' });
      expect(clean.status).toBe('PASS');
      expect(clean.oracleOutcomes).toContainEqual(expect.objectContaining({
        oracle: 'property-invariant', state: 'VERDICT', verdict: 'PASS',
        reasonCode: 'METADATA_SEMANTIC_TAGS_ABSENT',
      }));
      expect(fabricated.status).toBe('FAIL');
      expect(fabricated.oracleOutcomes).toContainEqual(expect.objectContaining({
        oracle: 'property-invariant', state: 'VERDICT', verdict: 'FAIL',
        reasonCode: 'METADATA_SEMANTIC_TAG_FABRICATED',
      }));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('REQ-FEAT-43 paired metadata equivalence classes', () => {
  test('every equivalence rule has a positive and negative neighbor with the expected verdict', () => {
    const parsed = parseMetadataEquivalenceMatrix(fixtureJson('fixtures/golden/metadata-equivalence-classes.json'))!;
    const audited = auditMetadataEquivalenceMatrix(parsed);
    expect(audited).toMatchObject({
      state: 'PASS', reasonCode: 'METADATA_EQUIVALENCE_MATRIX_COMPLETE',
    });
    // The raw-vs-presentation case is now a PASS, but the representation difference stays in its reasonCode.
    expect(audited.outcomes.some((item) =>
      item.actual === 'PASS' && item.outcome.reasonCode === 'METADATA_EQUIVALENCE_RAW_PRESENTATION_DIFFERENCE')).toBe(true);
    expect(audited.outcomes.some((item) => item.actual === 'FAIL')).toBe(true);
  });
});

function neutralEvidence(
  carrier: MetadataCarrier,
  scopedTags: NeutralMetadataEvidence['scopedTags'],
): NeutralMetadataEvidence {
  return {
    schema: EXTENDED_METADATA_SCHEMA,
    carrier,
    byteLength: 1,
    tags: Object.fromEntries(scopedTags.map((tag) => [tag.rawKey, tag.value])),
    scopedTags,
    parsedTagCount: scopedTags.length,
    carrierPaths: [],
  };
}

function metadataOracleScenario(
  op: Scenario['op'],
  oracle: Scenario['oracles'][number],
  options?: Record<string, unknown>,
): Scenario {
  return {
    id: 'metadata/production-oracle-test', family: 'metadata', op, input: 'fixture.mp3',
    requires: { operations: [op] }, oracles: [oracle], metrics: [], ...(options ? { options } : {}),
  };
}

function mediaInput(id: string, bytes: Uint8Array, mime: string): MediaInput {
  return {
    id, url: `/${id}`, mime,
    async arrayBuffer() { return bytes.slice().buffer as ArrayBuffer; },
    async blob() { return new Blob([bytes.slice().buffer], { type: mime }); },
  };
}

function metadataGolden(metadata: NormalizedMetadata) {
  const store = emptyGoldenStore();
  store.meta = metadata;
  store.evidence.meta = { state: 'OK', value: metadata, url: 'meta.json', raw: metadata };
  return store;
}

function oracleContext(overrides: Partial<OracleContext>): OracleContext {
  return {
    scenario: metadataOracleScenario('probe', 'property-invariant'),
    input: mediaInput('fixture.mp3', mp3Frame(), 'audio/mpeg'),
    golden: emptyGoldenStore(),
    decodeWithPlatform: async () => ({ frames: [] }),
    playbackSmoke: async () => true,
    ...overrides,
  };
}

function mp3Frame(): Uint8Array {
  const frame = new Uint8Array(417);
  frame.set([0xff, 0xfb, 0x90, 0x64]);
  return frame;
}

const METADATA_TEST_BROWSER: BrowserName = 'chromium';
const METADATA_TEST_SUPPORT: CodecSupport = {
  webcodecs: false,
  videoDecode: {}, videoEncode: {}, audioDecode: {}, audioEncode: {},
  alpha: false, strictRgbaPixels: false, strictGoldenRgba: false, strictSourceRgba: false,
  webgpu: false, measureMemory: false,
};
const METADATA_TEST_PIXELS: PixelBehaviorEvidence = {
  state: 'SUPPORTED', reasonCode: 'PIXEL_RGBA_ROUNDTRIP_OK', detail: 'metadata runner test',
};

function metadataProbeEngine(metadata: NormalizedMetadata): MediaEngine {
  const capabilities: CapabilitySet = {
    operations: { probe: true },
    containersIn: ['wav'], containersOut: [], videoCodecs: [], audioCodecs: ['pcm-s16'],
    encryption: [], features: [],
  };
  return {
    id: 'metadata-test@1.0.0',
    capabilities: () => capabilities,
    supports: async () => ({ supported: true }),
    probe: async () => metadata,
  } as MediaEngine;
}

function mp4Tags(tags: Record<string, string>): Uint8Array {
  const names: Record<string, string> = {
    title: '©nam', artist: '©ART', album: '©alb', comment: '©cmt', date: '©day', genre: '©gen', trackNumber: 'trkn',
  };
  const items = Object.entries(tags).map(([key, value]) => box(names[key]!, box('data', concat(u32be(1), u32be(0), encoder.encode(value)))));
  const meta = box('meta', concat(u32be(0), box('ilst', concat(...items))));
  return concat(box('ftyp', encoder.encode('isom\0\0\0\0isom')), box('moov', box('udta', meta)));
}

function id3Tags(tags: Record<string, string>): Uint8Array {
  const ids: Record<string, string> = {
    title: 'TIT2', artist: 'TPE1', album: 'TALB', comment: 'COMM', date: 'TDRC', genre: 'TCON', trackNumber: 'TRCK',
  };
  const frames = Object.entries(tags).map(([key, value]) => {
    const payload = key === 'comment'
      ? concat(new Uint8Array([3]), encoder.encode('eng'), new Uint8Array([0]), encoder.encode(value))
      : concat(new Uint8Array([3]), encoder.encode(value));
    return concat(encoder.encode(ids[key]!), synchsafe(payload.byteLength), new Uint8Array(2), payload);
  });
  const payload = concat(...frames);
  return concat(encoder.encode('ID3'), new Uint8Array([4, 0, 0]), synchsafe(payload.byteLength), payload, new Uint8Array([0xff, 0xfb, 0x90, 0x64]));
}

function flacTags(tags: Record<string, string>): Uint8Array {
  const comments = vorbisComments(tags);
  return concat(encoder.encode('fLaC'), new Uint8Array([0x84]), u24be(comments.byteLength), comments);
}

function oggTags(tags: Record<string, string>): Uint8Array {
  const packets = [encoder.encode('OpusHead'), concat(encoder.encode('OpusTags'), vorbisComments(tags))];
  const laces: number[] = [];
  const payload: Uint8Array[] = [];
  for (const packet of packets) {
    let cursor = 0;
    while (packet.byteLength - cursor >= 255) {
      laces.push(255);
      payload.push(packet.subarray(cursor, cursor + 255));
      cursor += 255;
    }
    laces.push(packet.byteLength - cursor);
    payload.push(packet.subarray(cursor));
  }
  const header = new Uint8Array(27);
  header.set(encoder.encode('OggS'), 0);
  header[4] = 0;
  header[26] = laces.length;
  return concat(header, new Uint8Array(laces), ...payload);
}

function matroskaTags(tags: Record<string, string>): Uint8Array {
  const names: Record<string, string> = {
    title: 'TITLE', artist: 'ARTIST', album: 'ALBUM', comment: 'COMMENT', date: 'DATE', genre: 'GENRE', trackNumber: 'TRACKNUMBER',
  };
  const simple = Object.entries(tags).map(([key, value]) => ebml(
    '67c8', concat(ebml('45a3', encoder.encode(names[key]!)), ebml('4487', encoder.encode(value))),
  ));
  const tag = ebml('7373', concat(...simple));
  const tagsElement = ebml('1254c367', tag);
  return concat(ebml('1a45dfa3', new Uint8Array()), ebml('18538067', tagsElement));
}

function wav(): Uint8Array {
  return concat(encoder.encode('RIFF'), u32le(4), encoder.encode('WAVE'));
}

function vorbisComments(tags: Record<string, string>): Uint8Array {
  const vendor = encoder.encode('media-test');
  const keys: Record<string, string> = {
    title: 'TITLE', artist: 'ARTIST', album: 'ALBUM', comment: 'COMMENT', date: 'DATE', genre: 'GENRE', trackNumber: 'TRACKNUMBER',
  };
  const comments = Object.entries(tags).map(([key, value]) => encoder.encode(`${keys[key]}=${value}`));
  return concat(u32le(vendor.byteLength), vendor, u32le(comments.length), ...comments.flatMap((comment) => [u32le(comment.byteLength), comment]));
}

function box(type: string, payload: Uint8Array): Uint8Array {
  return concat(u32be(payload.byteLength + 8), fourcc(type), payload);
}

function ebml(id: string, payload: Uint8Array): Uint8Array {
  return concat(hex(id), ebmlSize(payload.byteLength), payload);
}

function ebmlSize(value: number): Uint8Array {
  for (let length = 1; length <= 8; length++) {
    if (value <= 2 ** (7 * length) - 2) {
      const out = new Uint8Array(length);
      let remaining = value;
      for (let index = length - 1; index >= 0; index--) {
        out[index] = remaining & 0xff;
        remaining = Math.floor(remaining / 256);
      }
      out[0]! |= 1 << (8 - length);
      return out;
    }
  }
  throw new Error('EBML payload too large');
}

function fourcc(value: string): Uint8Array {
  return new Uint8Array([...value].map((char) => char.charCodeAt(0)));
}

function hex(value: string): Uint8Array {
  return new Uint8Array(value.match(/../g)!.map((byte) => Number.parseInt(byte, 16)));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function synchsafe(value: number): Uint8Array {
  return new Uint8Array([(value >>> 21) & 0x7f, (value >>> 14) & 0x7f, (value >>> 7) & 0x7f, value & 0x7f]);
}

function u24be(value: number): Uint8Array {
  return new Uint8Array([(value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
}

function u32be(value: number): Uint8Array {
  return new Uint8Array([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
}

function u32le(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
}
