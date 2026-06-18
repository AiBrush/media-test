/**
 * src/scenarios/metadata/index.ts — Pillar 1, family "metadata" (A.11 metadata/tags read+write,
 * A.16 metadata edge/metamorphic). Composed from focused sub-batteries:
 *
 *   - this file              : READ structural metadata (probe → golden-metadata) across every
 *                              tag-bearing container, plus container-coverage reads (MOV ≠ mp4-udta,
 *                              AIFF, big-ilst-intent MP4).
 *   - ./rotation-tracks.ts   : rotation as a REAL assertion (observable decoded effect + survival
 *                              across a remux) and multi-track positional attribution (probe + demux).
 *   - ./write-roundtrip.ts   : WRITE tags then re-observe honestly (reference-reimport +
 *                              property-invariant), tag-edit-must-not-corrupt-media, cross-container
 *                              consistency, no-tags/empty reads, malformed-tag-region negatives.
 *   - ./_shared.ts           : the builders + the authoritative ORACLE TRUTH comment.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * HONEST SCOPE — what the family CANNOT verify today, and why (so a number is never a vanity green).
 * These are oracle/model/runner gaps OUTSIDE a scenario writer's reach (oracles.ts / engine.ts /
 * runner.ts are off-limits); the cases here gate every property that IS expressible and document the
 * rest rather than attaching a fake oracle:
 *
 *   • TAG CONTENT (read): `golden-metadata` (compareTrack) never compares `tags`. A read case can
 *     gate container/duration/track-layout/codec/dims/fps/sr/ch — NOT a title/artist/comment value.
 *     Closing it needs (a) a tag-bearing corpus with semantic-key golden and (b) a SUBSET/semantic
 *     tag comparison in goldenMetadata (case/whitespace-normalized, ignoring container artifacts like
 *     major_brand/encoder).
 *   • TAG CONTENT (write→readback): the runner forwards only {container} to engine.remux and never
 *     re-probes the output, so options.tags never reaches an engine and no tag map is read back. A
 *     genuine `probe(writeTags(x,T)).tags ⊇ T` needs runner forwarding + re-probe + a tags-roundtrip
 *     oracle. We keep options.tags on every write case (future-proof + self-documenting) and gate the
 *     write with reference-reimport + property-invariant (valid container, media uncorrupted).
 *   • ROTATION VALUE: compareTrack never compares `track.rotation`, and there are no 180/270/-90
 *     rotated assets. We gate rotation by its OBSERVABLE DECODED EFFECT (decode read + survival), the
 *     only path expressible from a scenario file; a `rotation==90 ∧ width/height un-swapped` assertion
 *     needs a compareTrack edit + corpus.
 *   • LANGUAGE per-track VALUE: compareTrack never compares `track.language`; all golden languages are
 *     'und'/null; no distinct-language (eng/fra/jpn) asset exists. We gate positional track
 *     ATTRIBUTION (order/codec/index) instead; distinct-language proof needs all three.
 *   • CHAPTERS / EDIT-LISTS / COVER-ART / TIMECODE: `NormalizedMetadata`/`NormalizedTrack` have no
 *     fields for them and no oracle reads them — UNVERIFIABLE until the model + golden + an oracle
 *     gain the fields. No fabricated case is added (a case with no real gate is worse than an honest
 *     absence, §0.1).
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

import type { Scenario } from '../../core/scenario.ts';
import { buildRead, type TagReadCase } from './_shared.ts';
import { metadataRotationTrackScenarios } from './rotation-tracks.ts';
import { metadataWriteRoundtripScenarios } from './write-roundtrip.ts';

// ── READ structural metadata across tag-bearing + coverage containers ─────────────────────────────
// Every case probes the asset and gates the STRUCTURAL metadata via golden-metadata (container,
// duration, per-track type/codec/dims/fps/sr/ch). Tag CONTENT is NOT asserted (see HONEST SCOPE).

const TAG_READ_CASES: TagReadCase[] = [
  {
    asset: 'h264_1080p_30s.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'MP4 udta/ilst container (©nam/©ART/©alb/©day/trkn live here). Gates the structural metadata; ' +
      'the full ilst tag SET would need a tag-readback oracle (see HONEST SCOPE).',
  },
  {
    asset: 'h264_1080p_5s.mov',
    container: 'mov',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'QuickTime MOV — a DISTINCT tag carrier from mp4 udta (MOV uses its own moov/udta layout). ' +
      'Closes the "no MOV read distinct from mp4 udta" container gap (structural gate).',
  },
  {
    asset: 'h264_multitrack.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'Multi-track MP4 read: structural per-track metadata on all 3 tracks. Per-track LANGUAGE values ' +
      'are not gatable (compareTrack ignores language; golden is all und) — see HONEST SCOPE; positional ' +
      'attribution is gated by metadata/tracks_attribution_multitrack.',
  },
  {
    asset: 'h264_in_mkv.mkv',
    container: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'Matroska Tags element (SimpleTag name/value) — structural gate.',
  },
  {
    asset: 'vp9_1080p_10s.webm',
    container: 'webm',
    videoCodecs: ['vp9'],
    audioCodecs: ['opus'],
    notes: 'WebM Tags element — structural gate.',
  },
  {
    asset: 'pcm_s16be.aiff',
    container: 'aiff',
    audioCodecs: ['pcm-s16be'],
    notes:
      'AIFF (big-endian PCM) — closes the "no AIFF read" container gap. Honestly NA on engines that do ' +
      "not declare the 'aiff' container; PASS (structural) on those that do.",
  },
  {
    asset: 'mp3_xing.mp3',
    container: 'mp3',
    audioCodecs: ['mp3'],
    notes: 'ID3v2 frames (TIT2/TPE1/...) container — structural gate (duration STRICT: Xing frame count).',
  },
  {
    asset: 'flac_seektable.flac',
    container: 'flac',
    audioCodecs: ['flac'],
    notes: 'FLAC VORBIS_COMMENT block (TITLE/ARTIST/...) container — structural gate.',
  },
  {
    asset: 'opus.ogg',
    container: 'ogg',
    audioCodecs: ['opus'],
    notes: 'OGG/Opus VorbisComment header container — structural gate.',
  },
];

const readScenarios: Scenario[] = TAG_READ_CASES.map(buildRead);

export const metadataScenarios: Scenario[] = [
  ...readScenarios,
  ...metadataRotationTrackScenarios,
  ...metadataWriteRoundtripScenarios,
];

export default metadataScenarios;
