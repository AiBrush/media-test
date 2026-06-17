/**
 * src/scenarios/metadata/index.ts — Pillar 1, family "metadata".
 *
 * Two modes:
 *  - READ tags everywhere: probe each container that carries tags and assert the normalized tag map
 *    (title/artist/comment/rotation/language/etc.) against committed golden via `golden-metadata`.
 *  - WRITE-then-reprobe: where an engine declares the 'metadata:write' feature, set tags on the
 *    output container then re-probe the result and assert the written tags survived. Modeled as a
 *    remux op (the bytes are re-wrapped with new tags, coded samples copied) carrying the desired
 *    tags in options; the `golden-metadata` oracle reads back the re-probed metadata and
 *    `reference-reimport` confirms the container is still well-formed.
 */

import type { Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';

// ── Read tags ─────────────────────────────────────────────────────────────────────────────────

interface TagReadCase {
  asset: string;
  container: string;
  videoCodecs?: string[];
  audioCodecs?: string[];
  notes?: string;
}

const TAG_READ_CASES: TagReadCase[] = [
  {
    asset: 'h264_1080p_30s.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'MP4 udta/ilst tags (©nam/©ART/...) normalized into the tag map.',
  },
  {
    asset: 'h264_rotated90.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'Rotation surfaces as track.rotation, not a tag — guards against conflating the two.',
  },
  {
    asset: 'h264_multitrack.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'Per-track language tags must be reported on the right track.',
  },
  {
    asset: 'h264_in_mkv.mkv',
    container: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'Matroska Tags element (SimpleTag name/value).',
  },
  {
    asset: 'vp9_1080p_10s.webm',
    container: 'webm',
    videoCodecs: ['vp9'],
    audioCodecs: ['opus'],
    notes: 'WebM tags element.',
  },
  {
    asset: 'mp3_xing.mp3',
    container: 'mp3',
    audioCodecs: ['mp3'],
    notes: 'ID3v2 frames (TIT2/TPE1/...) normalized to the tag map.',
  },
  {
    asset: 'flac_seektable.flac',
    container: 'flac',
    audioCodecs: ['flac'],
    notes: 'FLAC VORBIS_COMMENT block (TITLE/ARTIST/...).',
  },
  {
    asset: 'opus.ogg',
    container: 'ogg',
    audioCodecs: ['opus'],
    notes: 'OGG/Opus VorbisComment header tags.',
  },
];

const readScenarios: Scenario[] = TAG_READ_CASES.map((c) =>
  defineScenario({
    id: `metadata/read_${c.asset.replace(/\.[^.]+$/, '')}`,
    op: 'probe',
    input: c.asset,
    requires: {
      operations: ['probe'],
      containersIn: [c.container],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
    },
    oracles: ['golden-metadata'],
    metrics: ['wall'],
    ...(c.notes ? { notes: c.notes } : {}),
  }),
);

// ── Write tags then re-probe ────────────────────────────────────────────────────────────────────

interface TagWriteCase {
  id: string;
  asset: string;
  container: string;
  videoCodecs?: string[];
  audioCodecs?: string[];
  /** tags to set on the output; the re-probe must read these back */
  tags: Record<string, string>;
  notes?: string;
}

const WRITE_TAGS = { title: 'Conformance Suite Clip', artist: 'aibrush-media-test', comment: 'metadata:write roundtrip' };

const TAG_WRITE_CASES: TagWriteCase[] = [
  {
    id: 'write_mp4_tags',
    asset: 'h264_1080p_30s.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    tags: WRITE_TAGS,
    notes: 'Set MP4 ilst tags, re-probe; coded samples untouched (remux), only the tag map changes.',
  },
  {
    id: 'write_mkv_tags',
    asset: 'h264_in_mkv.mkv',
    container: 'mkv',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    tags: WRITE_TAGS,
    notes: 'Write Matroska SimpleTag entries then re-probe.',
  },
  {
    id: 'write_mp3_id3',
    asset: 'mp3_xing.mp3',
    container: 'mp3',
    audioCodecs: ['mp3'],
    tags: WRITE_TAGS,
    notes: 'Write ID3v2 frames then re-probe.',
  },
  {
    id: 'write_flac_vorbiscomment',
    asset: 'flac_seektable.flac',
    container: 'flac',
    audioCodecs: ['flac'],
    tags: WRITE_TAGS,
    notes: 'Write FLAC VORBIS_COMMENT then re-probe; audio samples must remain bit-identical.',
  },
];

const writeScenarios: Scenario[] = TAG_WRITE_CASES.map((c) =>
  defineScenario({
    id: `metadata/${c.id}`,
    op: 'remux',
    input: c.asset,
    options: { container: c.container, tags: c.tags },
    requires: {
      operations: ['remux', 'probe'],
      containersIn: [c.container],
      containersOut: [c.container],
      features: ['metadata:write'],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
    },
    // Re-probe the output and assert the written tags (golden-metadata), and confirm the container
    // is still well-formed (reference-reimport).
    oracles: ['golden-metadata', 'reference-reimport'],
    metrics: ['wall', 'targetWrites'],
    ...(c.notes ? { notes: c.notes } : {}),
  }),
);

export const metadataScenarios: Scenario[] = [...readScenarios, ...writeScenarios];

export default metadataScenarios;
