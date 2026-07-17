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
 * Family-local contracts live under src/features/metadata: the extended schema retains raw and
 * canonical evidence, the neutral reader understands each supported tag carrier, safe recovery is
 * bounded and semantic, and the committed equivalence matrix pairs every valid normalization with a
 * nearby invalid counterexample. Shared oracle integration consumes those contracts; scenario rows
 * remain engine-neutral.
 */

import type { Scenario } from '../../core/scenario.ts';
import { buildRead, type TagReadCase } from './_shared.ts';
import { metadataRotationTrackScenarios } from './rotation-tracks.ts';
import { metadataWriteRoundtripScenarios } from './write-roundtrip.ts';

// ── READ structural metadata across tag-bearing + coverage containers ─────────────────────────────
// Every case probes the asset and gates the STRUCTURAL metadata via golden-metadata (container,
// duration and logical track evidence). These legacy sources declare no semantic tag subset; tag
// content is asserted by the authored write/readback rows and explicit no-tag rows below.

const TAG_READ_CASES: TagReadCase[] = [
  {
    asset: 'h264_1080p_30s.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'MP4 udta/ilst container (©nam/©ART/©alb/©day/trkn live here). Gates structural metadata; the ' +
      'authored metadata/write_mp4_tags row owns the complete semantic ilst subset.',
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
