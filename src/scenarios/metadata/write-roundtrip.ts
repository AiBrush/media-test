/**
 * src/scenarios/metadata/write-roundtrip.ts — WRITE-tags (re-observed honestly) + tag-edit-must-not-
 * corrupt-media + cross-container consistency + no-tags/empty + malformed-tag-region negatives.
 *
 * This file REPLACES the family's previous 4 write cases (which attached `golden-metadata` to a
 * remux op — a guaranteed FAIL for a plumbing reason, masking that no tag was ever written; see
 * _shared.ts ORACLE TRUTH §2). Every case here carries an oracle that ACTUALLY observes the output.
 *
 * WHAT IS — and IS NOT — realizable from a scenario file (honest scope, §0):
 *  - REALIZABLE: "a tag-bearing rewrite produces a valid container that did NOT corrupt the media."
 *    Gated by reference-reimport (parseable container) + property-invariant (decode/duration
 *    unchanged). This DIRECTLY realizes the deepEdge "tag-write must not corrupt media" and the
 *    write_flac note "audio samples must remain bit-identical" (proxied by duration for audio, since
 *    no PCM oracle exists; decode-pixel-exact for video).
 *  - NOT REALIZABLE here: reading the WRITTEN tag CONTENT back and asserting tags ⊇ T. The runner
 *    forwards options.tags, but no oracle re-probes a remux output and compares a tag map. That needs
 *    oracle + model work. We keep options.tags on each case and record the gap in index.ts. We do NOT
 *    attach an oracle that pretends to check it.
 */

import type { Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';
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
// cross the ID3 text-frame size boundary). Carried on the write cases so a future readback oracle
// exercises UTF-8 round-trip; today they document the intent and ride along in options.tags.
const LONG_COMMENT = 'metadata:write roundtrip — '.repeat(12); // ~324 bytes, > the 255-byte ID3 frame edge
const UNICODE_TAGS = {
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
    tags: UNICODE_TAGS,
    invariant: DECODE_REMUX,
    notes:
      'Set MP4 ilst tags, re-observe: the output is a valid MP4 (reference-reimport) and the tag-only ' +
      'rewrite did NOT change decoded pixels (decode(remux(x))==decode(x)). Tag CONTENT readback is ' +
      'not gated yet because no oracle re-probes ctx.output tags — see index.ts oracleGaps.',
  },
  {
    id: 'write_mkv_tags',
    asset: 'h264_in_mkv.mkv',
    container: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    tags: UNICODE_TAGS,
    invariant: DECODE_REMUX,
    notes:
      'Write Matroska SimpleTag entries, re-observe: valid MKV (reference-reimport) + decoded pixels ' +
      'unchanged (decode(remux(x))==decode(x)). Tag-content readback not gated (see index.ts).',
  },
  {
    id: 'write_mp3_id3',
    asset: 'mp3_xing.mp3',
    container: 'mp3',
    audioCodecs: ['mp3'],
    tags: UNICODE_TAGS,
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
    tags: UNICODE_TAGS,
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
    tags: UNICODE_TAGS,
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
    invariant: DECODE_REMUX,
    input: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
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
// True cross-container tag-SET equality needs a tag-readback oracle (absent). The expressible
// invariant is that the same logical content, re-wrapped to another container, yields a consistent
// (precise, source-matching) probe — i.e. the metadata layer is container-independent for the
// properties the oracle CAN read (duration). Gated by probe(remux(x)).dur≈probe(x).dur.

const CROSS_CONTAINER_PROPERTY: MetaPropertyCase[] = [
  {
    id: 'meta_consistent_mp4_to_mkv',
    invariant: PROBE_DUR,
    input: 'h264_1080p_30s.mp4',
    from: 'mp4',
    to: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    tolerances: { durationToleranceSec: 0.1 },
    notes:
      'Cross-container metadata consistency (A.16): the same content re-wrapped MP4->MKV must yield a ' +
      'consistent, source-matching probe — probe(remux(x)).dur≈probe(x).dur — proving the metadata ' +
      'layer is container-independent for the properties the oracle can read. Allows a 100ms remux ' +
      'duration band for audio/video block rounding while preserving the no-large-drift gate. Full ' +
      'semantic-tag-set equality across containers needs a tag-readback oracle (see index.ts oracleGaps).',
  },
];

// ── No-tags / empty input: must read cleanly, never crash or fabricate ────────────────────────────
// An asset with NO semantic tags must probe to a sane metadata object (empty/absent tag map), never
// null-deref. golden-metadata gates the structural side; the absence of a tag assertion is correct
// (there is nothing to assert, and the oracle does not read tags anyway).

const noTagsAudioRead: Scenario = defineScenario({
  id: 'metadata/read_no_tags_wav',
  op: 'probe',
  input: 'wav_s16.wav',
  requires: {
    operations: ['probe'],
    containersIn: ['wav'],
    audioCodecs: ['pcm-s16'],
  },
  oracles: ['golden-metadata'],
  metrics: ['wall'],
  notes:
    'No-tags input (A.16): a bare WAV carries no semantic tags. probe must return a sane metadata ' +
    'object with an empty/absent tag map and the correct structural fields — never null-deref, never ' +
    'fabricate tags. golden-metadata gates container/duration/track (pcm-s16, sr, ch); there is no tag ' +
    'content to assert (and the oracle does not read tags).',
});

const noTagsRecorderRead: Scenario = defineScenario({
  id: 'metadata/read_no_tags_recorder_webm',
  op: 'probe',
  input: 'recorder_headerless.webm',
  requires: {
    operations: ['probe'],
    containersIn: ['webm'],
    videoCodecs: ['vp8'],
    audioCodecs: ['opus'],
  },
  oracles: ['golden-metadata'],
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
