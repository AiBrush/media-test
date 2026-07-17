/**
 * src/scenarios/metadata/write-roundtrip.ts — WRITE-tags (re-observed honestly) + tag-edit-must-not-
 * corrupt-media + cross-container consistency + no-tags/empty + malformed-tag-region negatives.
 *
 * Every write carries three independent gates: neutral semantic-tag readback, structural re-import,
 * and media preservation. No-tag probes explicitly reject fabricated semantic values. Malformed
 * ID3/ilst inputs may reject cleanly or return only schema-valid bounded structure with every
 * corrupt-region semantic key absent.
 */

import type { Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';
import {
  SEMANTIC_TAG_KEYS,
  defineMetadataRecoveryContract,
  defineMetadataTagContract,
} from '../../features/metadata/index.ts';
import {
  buildNegative,
  buildProperty,
  buildWrite,
  DECODE_REMUX,
  PROBE_DUR,
  type MetaNegativeCase,
  type MetaPropertyCase,
  type TagWriteCase,
} from './_shared.ts';

// Unicode / boundary-stressing tag values (emoji + CJK title, non-ASCII artist, a >255-byte comment to
// cross the ID3 text-frame size boundary). Neutral readback exercises every value.
const LONG_COMMENT = 'metadata:write roundtrip — '.repeat(12); // ~324 bytes, > the 255-byte ID3 frame edge
export const METADATA_UNICODE_TAGS = {
  title: 'Conformance 🎬 字幕 Clip',
  artist: 'aibrűsh-media-tëst',
  album: 'Suite Vol. 1',
  comment: LONG_COMMENT,
  date: '2026-06-18',
  genre: 'Test',
  trackNumber: '7',
};

// ── WRITE tags then re-observe (reference-reimport + property-invariant) ──────────────────────────

const WRITE_CASES: TagWriteCase[] = [
  {
    id: 'write_mp4_tags',
    asset: 'h264_1080p_30s.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    tags: METADATA_UNICODE_TAGS,
    invariant: DECODE_REMUX,
    notes:
      'Set MP4 ilst tags, re-observe: the output is a valid MP4 (reference-reimport) and the tag-only ' +
      'rewrite did NOT change decoded pixels (decode(remux(x))==decode(x)). A neutral ilst re-probe ' +
      'independently requires the complete requested Unicode semantic subset.',
  },
  {
    id: 'write_mkv_tags',
    asset: 'h264_in_mkv.mkv',
    container: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    tags: METADATA_UNICODE_TAGS,
    invariant: DECODE_REMUX,
    notes:
      'Write Matroska SimpleTag entries, re-observe: valid MKV (reference-reimport) + decoded pixels ' +
      'unchanged (decode(remux(x))==decode(x)). A neutral Matroska SimpleTag re-probe independently ' +
      'requires the requested semantic subset at the correct scope.',
  },
  {
    id: 'write_mp3_id3',
    asset: 'mp3_xing.mp3',
    container: 'mp3',
    audioCodecs: ['mp3'],
    tags: METADATA_UNICODE_TAGS,
    invariant: PROBE_DUR,
    tolerances: { durationToleranceSec: 0.1 },
    notes:
      'Write ID3v2 frames, re-observe: valid MP3 (reference-reimport) + duration materialized from the ' +
      'rewritten stream ≈ source (probe(remux(x)).dur≈probe(x).dur) — the honest audio "samples intact" ' +
      'proxy (no PCM oracle exists). Allows a 100ms container-estimation band because ID3/Xing rewrite ' +
      'paths can materialize one MP3 frame of duration drift without changing the stream. The >255-byte ' +
      'comment crosses the ID3 text-frame boundary.',
  },
  {
    id: 'write_flac_vorbiscomment',
    asset: 'flac_seektable.flac',
    container: 'flac',
    audioCodecs: ['flac'],
    tags: METADATA_UNICODE_TAGS,
    invariant: PROBE_DUR,
    notes:
      'Write FLAC VORBIS_COMMENT, re-observe: valid FLAC (reference-reimport) + duration preserved ' +
      '(probe(remux(x)).dur≈probe(x).dur). Realizes the write_flac note "audio samples must remain ' +
      'bit-identical" as far as a scenario file can (duration proxy; bit-exact PCM needs a PCM oracle).',
  },
  {
    id: 'write_ogg_vorbiscomment',
    asset: 'opus.ogg',
    container: 'ogg',
    audioCodecs: ['opus'],
    tags: METADATA_UNICODE_TAGS,
    invariant: PROBE_DUR,
    notes:
      'Write OGG/Opus VorbisComment header tags, re-observe: valid OGG (reference-reimport) + duration ' +
      'preserved (probe(remux(x)).dur≈probe(x).dur). Adds the Ogg container to the write matrix.',
  },
];

// ── Tag edit must NOT corrupt media — explicit, standalone metamorphic statements ─────────────────
// (Distinct from the write cases above: these assert the no-corruption invariant as the PRIMARY
// property on a plain remux, so even an engine that does NOT declare metadata:write — but whose remux
// preserves the stream — is exercised, and the invariant reads as a first-class deepEdge item.)

const NO_CORRUPT_PROPERTY: MetaPropertyCase[] = [
  {
    id: 'tagedit_no_corrupt_video_mp4_mkv',
    revision: 2,
    invariant: DECODE_REMUX,
    input: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    features: ['metadata:write'],
    tags: METADATA_UNICODE_TAGS,
    metadataTagContract: defineMetadataTagContract({
      mode: 'cross-container-equality',
      sourceCarrier: 'mp4',
      carrier: 'mkv',
      requested: METADATA_UNICODE_TAGS,
    }),
    notes:
      'Tag edit must not corrupt VIDEO: a tag-only rewrite (modeled as a lossless remux) must leave the ' +
      'coded samples untouched — decode(remux(x))==decode(x) (pixels bit-exact). Catches an engine that ' +
      're-encodes or drops frames while editing tags.',
  },
  {
    id: 'tagedit_no_corrupt_audio_flac',
    invariant: PROBE_DUR,
    input: 'flac_seektable.flac',
    from: 'flac',
    to: 'flac',
    audioCodecs: ['flac'],
    notes:
      'Tag edit must not corrupt AUDIO: a FLAC tag rewrite must preserve the audio stream — ' +
      'probe(remux(x)).dur≈probe(x).dur (duration unchanged; the honest no-PCM-oracle proxy for "audio ' +
      'samples bit-identical").',
  },
];

// ── Cross-container tag/normalization consistency (A.16 metamorphic) ──────────────────────────────
// The same logical subset is written MP4→Matroska and mapped back by the neutral reader. Container
// carrier differences are DIFF; lost/changed values are FAIL. Duration/media survival stays separate.

const CROSS_CONTAINER_PROPERTY: MetaPropertyCase[] = [
  {
    id: 'meta_consistent_mp4_to_mkv',
    revision: 2,
    invariant: PROBE_DUR,
    input: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    features: ['metadata:write'],
    tags: METADATA_UNICODE_TAGS,
    metadataTagContract: defineMetadataTagContract({
      mode: 'cross-container-equality',
      sourceCarrier: 'mp4',
      carrier: 'mkv',
      requested: METADATA_UNICODE_TAGS,
    }),
    tolerances: { durationToleranceSec: 0.1 },
    notes:
      'Cross-container metadata consistency (A.16): the same content re-wrapped MP4->MKV must yield a ' +
      'consistent, source-matching probe — probe(remux(x)).dur≈probe(x).dur — while a neutral Matroska ' +
      're-probe maps SimpleTags back to the same requested logical subset. Equal values in a different ' +
      'lossless carrier surface as PASS with a recorded representation difference; altered/lost values FAIL. Allows a 100ms remux duration band.',
  },
];

// ── No-tags / empty input: must read cleanly, never crash or fabricate ────────────────────────────
// An asset with NO semantic tags must probe to sane structure and the metadata-tags-absent contract
// independently rejects any fabricated semantic key.

const noTagsAudioRead: Scenario = defineScenario({
  id: 'metadata/read_no_tags_wav',
  revision: 2,
  op: 'probe',
  input: 'wav_s16.wav',
  requires: {
    operations: ['probe'],
    containersIn: ['wav'],
    audioCodecs: ['pcm-s16'],
  },
  options: {
    invariant: 'metadata-tags-absent',
    robustness: {
      metadataTags: defineMetadataTagContract({ mode: 'assert-absence', carrier: 'wav' }),
    },
  },
  oracles: ['golden-metadata', 'property-invariant'],
  metrics: ['wall'],
  notes:
    'No-tags input (A.16): a bare WAV carries no semantic tags. probe must return a sane metadata ' +
    'object with an empty/absent tag map and the correct structural fields — never null-deref, never ' +
      'fabricate tags. golden-metadata gates container/duration/track and metadata-tags-absent rejects ' +
      'any fabricated semantic key while retaining technical diagnostics.',
});

const noTagsRecorderRead: Scenario = defineScenario({
  id: 'metadata/read_no_tags_recorder_webm',
  revision: 2,
  op: 'probe',
  input: 'recorder_headerless.webm',
  requires: {
    operations: ['probe'],
    containersIn: ['webm'],
    videoCodecs: ['vp8'],
    audioCodecs: ['opus'],
  },
  options: {
    invariant: 'metadata-tags-absent',
    robustness: {
      metadataTags: defineMetadataTagContract({ mode: 'assert-absence', carrier: 'webm' }),
    },
  },
  oracles: ['golden-metadata', 'property-invariant'],
  metrics: ['wall'],
  tolerances: { fpsTolerance: 0.25 },
  timeoutMs: 20_000,
  notes:
    'Headerless MediaRecorder WebM tag read (A.16): a recorder-origin WebM has no Tags element and an ' +
    'unknown/estimated duration. probe must yield an empty tag map and a sane duration (loose ' +
    'recorder-webm duration band) without crashing — the headerless-tag-read edge. Allows ±0.25fps ' +
    'because MediaRecorder/WebM frame cadence is timestamp-estimated rather than a precise header FPS.',
});

// ── Malformed / truncated tag region: probe must fail GRACEFULLY ──────────────────────────────────

const META_NEGATIVE_CASES: MetaNegativeCase[] = [
  {
    id: 'neg_garbled_id3_mp3_probe',
    asset: 'metadata_garbled_id3_mp3.mp3',
    container: 'mp3',
    audioCodecs: ['mp3'],
    gracefulAllowOutput: true,
    recovery: defineMetadataRecoveryContract({
      corruptRegion: 'id3',
      expectedContainer: 'mp3',
      maximumTracks: 16,
      maximumTagEntries: 256,
      maximumTagValueBytes: 65_536,
      forbiddenSemanticTags: SEMANTIC_TAG_KEYS,
    }),
    timeoutMs: 15_000,
    notes:
      'Malformed ID3 tag region (A.16 fuzz): the leading ID3v2/Xing bytes of an MP3 are garbled. probe ' +
      'may reject or recover by ignoring the corrupt tag region and returning safe structural metadata; ' +
      'the required property is GRACEFUL handling of the corrupt head.',
  },
  {
    id: 'neg_garbled_ilst_mp4_probe',
    asset: 'metadata_garbled_ilst_mp4.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    gracefulAllowOutput: true,
    recovery: defineMetadataRecoveryContract({
      corruptRegion: 'mp4-ilst',
      expectedContainer: 'mp4',
      maximumTracks: 64,
      maximumTagEntries: 256,
      maximumTagValueBytes: 65_536,
      forbiddenSemanticTags: SEMANTIC_TAG_KEYS,
    }),
    timeoutMs: 15_000,
    notes:
      'Truncated/garbled ilst region (A.16 fuzz): the leading ftyp/moov bytes of an MP4 (where ' +
      'udta/ilst tags live) are garbled. probe may reject or safely recover from a bogus tag atom size.',
  },
];

export const metadataWriteRoundtripScenarios: Scenario[] = [
  ...WRITE_CASES.map(buildWrite),
  ...NO_CORRUPT_PROPERTY.map(buildProperty),
  ...CROSS_CONTAINER_PROPERTY.map(buildProperty),
  noTagsAudioRead,
  noTagsRecorderRead,
  ...META_NEGATIVE_CASES.map(buildNegative),
];

export default metadataWriteRoundtripScenarios;
