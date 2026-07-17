import type { RationalTimebase } from '../../core/engine.ts';
import {
  EXTENDED_METADATA_SCHEMA,
  SEMANTIC_TAG_KEYS,
  type ExtendedNormalizedMetadata,
  type ExtendedNormalizedTrack,
  type MetadataChapter,
  type MetadataCoverArt,
  type MetadataTimecode,
  type ScopedMetadataTag,
  type SemanticTagKey,
  trackType,
} from './types.ts';

const MAX_DURATION_SEC = 10 * 365 * 24 * 60 * 60;
const MAX_TRACKS = 256;
const MAX_TAGS = 4_096;
const MAX_TAG_KEY_BYTES = 4_096;
const MAX_TAG_VALUE_BYTES = 1_048_576;
const MAX_CHAPTERS = 100_000;
const MAX_ATTACHMENTS = 10_000;
const MAX_TIMECODES = 10_000;
const MAX_TIMELINE_POINTS = 2_000_000;
const MAX_DIMENSION = 1_048_576;
const MAX_SAMPLE_RATE = 1_536_000;
const MAX_CHANNELS = 256;
const MAX_BITRATE = 10_000_000_000_000;

export interface MetadataSchemaLimits {
  readonly maximumTracks?: number;
  readonly maximumTagEntries?: number;
  readonly maximumTagValueBytes?: number;
}

export type MetadataSchemaValidation =
  | Readonly<{
      state: 'OK';
      value: ExtendedNormalizedMetadata;
      evidence: Readonly<{ trackCount: number; tagCount: number; scopedTagCount: number }>;
    }>
  | Readonly<{
      state: 'INVALID';
      reasonCode: string;
      path: string;
      detail: string;
    }>;

/**
 * Validate the entire public metadata observation before an oracle trusts it. The validator is
 * intentionally stricter than JSON serialization: non-finite values, impossible dimensions,
 * unbounded arrays, malformed scoped references, and inconsistent presentation intervals are all
 * rejected as unsafe evidence.
 */
export function validateExtendedMetadata(
  input: unknown,
  limits: MetadataSchemaLimits = {},
): MetadataSchemaValidation {
  const maximumTracks = boundedLimit(limits.maximumTracks, MAX_TRACKS, 'maximumTracks');
  const maximumTagEntries = boundedLimit(limits.maximumTagEntries, MAX_TAGS, 'maximumTagEntries');
  const maximumTagValueBytes = boundedLimit(
    limits.maximumTagValueBytes,
    MAX_TAG_VALUE_BYTES,
    'maximumTagValueBytes',
  );
  if (typeof maximumTracks !== 'number') return maximumTracks;
  if (typeof maximumTagEntries !== 'number') return maximumTagEntries;
  if (typeof maximumTagValueBytes !== 'number') return maximumTagValueBytes;

  const root = record(input);
  if (!root) return invalid('METADATA_SCHEMA_ROOT_INVALID', '$', 'metadata must be a plain object');
  if (root.schema !== undefined && root.schema !== EXTENDED_METADATA_SCHEMA) {
    return invalid(
      'METADATA_SCHEMA_VERSION_UNSUPPORTED',
      '$.schema',
      `schema must be '${EXTENDED_METADATA_SCHEMA}' when present`,
    );
  }
  if (!nonEmptyString(root.container, 64)) {
    return invalid('METADATA_CONTAINER_INVALID', '$.container', 'container must be a non-empty bounded string');
  }
  const duration = nullableFinite(root.durationSec, 0, MAX_DURATION_SEC);
  if (!duration) {
    return invalid(
      'METADATA_DURATION_INVALID',
      '$.durationSec',
      `durationSec must be null or finite within 0..${MAX_DURATION_SEC}`,
    );
  }
  for (const key of ['presentationDurationSec', 'rawMediaSpanSec'] as const) {
    if (root[key] !== undefined && !finiteRange(root[key], 0, MAX_DURATION_SEC)) {
      return invalid('METADATA_TIMING_INVALID', `$.${key}`, `${key} must be finite and non-negative`);
    }
  }
  if (root.sourceTimebase !== undefined && !validTimebase(root.sourceTimebase)) {
    return invalid('METADATA_TIMEBASE_INVALID', '$.sourceTimebase', 'source timebase must be a positive safe rational');
  }
  if (!Array.isArray(root.tracks) || root.tracks.length > maximumTracks) {
    return invalid(
      'METADATA_TRACKS_INVALID',
      '$.tracks',
      `tracks must be an array with at most ${maximumTracks} entries`,
    );
  }
  for (let index = 0; index < root.tracks.length; index++) {
    const error = validateTrack(root.tracks[index], `$.tracks[${index}]`, maximumTagEntries, maximumTagValueBytes);
    if (error) return error;
  }
  const trackScopedTagCount = root.tracks.reduce(
    (sum: number, track: Record<string, unknown>) => sum + (Array.isArray(track.scopedTags) ? track.scopedTags.length : 0),
    0,
  );

  const tagValidation = validateStringTags(root.tags, '$.tags', maximumTagEntries, maximumTagValueBytes);
  if (tagValidation.error) return tagValidation.error;
  const scopedValidation = validateScopedTags(
    root.scopedTags,
    '$.scopedTags',
    maximumTagEntries,
    maximumTagValueBytes,
  );
  if (scopedValidation.error) return scopedValidation.error;

  const chapters = validateChapters(root.chapters, maximumTagEntries, maximumTagValueBytes);
  if (chapters.error) return chapters.error;
  const coverArt = validateCoverArt(root.coverArt);
  if (coverArt) return coverArt;
  const timecodes = validateTimecodes(root.timecodes);
  if (timecodes) return timecodes;

  return {
    state: 'OK',
    value: input as ExtendedNormalizedMetadata,
    evidence: {
      trackCount: root.tracks.length,
      tagCount: tagValidation.count,
      scopedTagCount: scopedValidation.count + trackScopedTagCount + chapters.scopedTagCount,
    },
  };
}

export function semanticTagKeysInMetadata(metadata: ExtendedNormalizedMetadata): SemanticTagKey[] {
  const found = new Set<SemanticTagKey>();
  const allowed = new Set<string>(SEMANTIC_TAG_KEYS);
  for (const key of Object.keys(metadata.tags ?? {})) {
    if (allowed.has(key)) found.add(key as SemanticTagKey);
  }
  const visit = (tags: readonly ScopedMetadataTag[] | undefined): void => {
    for (const tag of tags ?? []) if (tag.canonicalKey) found.add(tag.canonicalKey);
  };
  visit(metadata.scopedTags);
  for (const track of metadata.tracks) visit(track.scopedTags);
  for (const chapter of metadata.chapters ?? []) visit(chapter.tags);
  return [...found].sort();
}

function validateTrack(
  value: unknown,
  path: string,
  maximumTagEntries: number,
  maximumTagValueBytes: number,
): Extract<MetadataSchemaValidation, { state: 'INVALID' }> | undefined {
  const track = record(value);
  if (!track) return invalid('METADATA_TRACK_INVALID', path, 'track must be a plain object');
  if (!trackType(track.type)) return invalid('METADATA_TRACK_TYPE_INVALID', `${path}.type`, 'track type is invalid');
  if (!nonEmptyString(track.codec, 256)) return invalid('METADATA_TRACK_CODEC_INVALID', `${path}.codec`, 'codec is required');
  for (const key of ['rawCodec', 'canonicalCodec', 'codecRaw', 'codecCanonical', 'nativeCodecTag', 'trackId'] as const) {
    if (track[key] !== undefined && !nonEmptyString(track[key], 1_024)) {
      return invalid('METADATA_TRACK_STRING_INVALID', `${path}.${key}`, `${key} must be a non-empty bounded string`);
    }
  }
  for (const key of ['width', 'height', 'rawWidth', 'rawHeight', 'presentationWidth', 'presentationHeight'] as const) {
    if (track[key] !== undefined && !safeIntegerRange(track[key], 1, MAX_DIMENSION)) {
      return invalid('METADATA_TRACK_DIMENSION_INVALID', `${path}.${key}`, `${key} must be a positive safe integer`);
    }
  }
  for (const [a, b] of [
    ['width', 'height'],
    ['rawWidth', 'rawHeight'],
    ['presentationWidth', 'presentationHeight'],
  ] as const) {
    if ((track[a] === undefined) !== (track[b] === undefined)) {
      return invalid('METADATA_TRACK_DIMENSION_PAIR_INCOMPLETE', path, `${a} and ${b} must be present together`);
    }
  }
  if (track.fps !== undefined && !finiteRange(track.fps, 0, 1_000_000, false)) {
    return invalid('METADATA_TRACK_RATE_INVALID', `${path}.fps`, 'fps must be finite and positive');
  }
  if (track.sampleRate !== undefined && !safeIntegerRange(track.sampleRate, 1, MAX_SAMPLE_RATE)) {
    return invalid('METADATA_TRACK_SAMPLE_RATE_INVALID', `${path}.sampleRate`, 'sample rate is outside the supported bound');
  }
  if (track.channels !== undefined && !safeIntegerRange(track.channels, 1, MAX_CHANNELS)) {
    return invalid('METADATA_TRACK_CHANNELS_INVALID', `${path}.channels`, 'channel count is outside the supported bound');
  }
  if (track.bitrate !== undefined && track.bitrate !== null && !finiteRange(track.bitrate, 0, MAX_BITRATE)) {
    return invalid('METADATA_TRACK_BITRATE_INVALID', `${path}.bitrate`, 'bitrate must be null or finite and non-negative');
  }
  if (track.language !== undefined && track.language !== null && !nonEmptyString(track.language, 128)) {
    return invalid('METADATA_TRACK_LANGUAGE_INVALID', `${path}.language`, 'language must be null or a non-empty bounded string');
  }
  if (track.rotation !== undefined && !Number.isFinite(track.rotation)) {
    return invalid('METADATA_TRACK_ROTATION_INVALID', `${path}.rotation`, 'rotation must be finite');
  }
  if (track.defaultDisposition !== undefined && typeof track.defaultDisposition !== 'boolean') {
    return invalid('METADATA_TRACK_DEFAULT_INVALID', `${path}.defaultDisposition`, 'default disposition must be boolean');
  }
  if (track.rateRational !== undefined && !validRational(track.rateRational)) {
    return invalid('METADATA_TRACK_RATE_RATIONAL_INVALID', `${path}.rateRational`, 'rate rational must be a positive safe rational');
  }
  for (const key of ['sourceTimebase', 'movieTimebase', 'mediaTimebase'] as const) {
    if (track[key] !== undefined && !validTimebase(track[key])) {
      return invalid('METADATA_TRACK_TIMEBASE_INVALID', `${path}.${key}`, `${key} must be a positive safe rational`);
    }
  }
  for (const key of ['rawMediaSpanSec', 'presentationDurationSec'] as const) {
    if (track[key] !== undefined && !finiteRange(track[key], 0, MAX_DURATION_SEC)) {
      return invalid('METADATA_TRACK_TIMING_INVALID', `${path}.${key}`, `${key} must be finite and non-negative`);
    }
  }
  for (const key of ['primingSamples', 'paddingSamples', 'remainderSamples'] as const) {
    if (track[key] !== undefined && !safeIntegerRange(track[key], 0, Number.MAX_SAFE_INTEGER)) {
      return invalid('METADATA_TRACK_PADDING_INVALID', `${path}.${key}`, `${key} must be a non-negative safe integer`);
    }
  }
  if (track.frameTimestampsUs !== undefined) {
    if (!Array.isArray(track.frameTimestampsUs) || track.frameTimestampsUs.length > MAX_TIMELINE_POINTS) {
      return invalid('METADATA_TRACK_TIMESTAMPS_INVALID', `${path}.frameTimestampsUs`, 'frame timestamp evidence is unbounded');
    }
    let previous = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < track.frameTimestampsUs.length; index++) {
      const timestamp = track.frameTimestampsUs[index];
      if (!Number.isFinite(timestamp) || (timestamp as number) <= previous) {
        return invalid(
          'METADATA_TRACK_TIMESTAMPS_INVALID',
          `${path}.frameTimestampsUs[${index}]`,
          'frame timestamps must be finite and strictly increasing',
        );
      }
      previous = timestamp as number;
    }
  }
  if (track.rotationMatrix !== undefined) {
    const matrix = record(track.rotationMatrix);
    if (!matrix || !Array.isArray(matrix.values) || matrix.values.length !== 9 || matrix.values.some((entry) => !Number.isFinite(entry))) {
      return invalid('METADATA_ROTATION_MATRIX_INVALID', `${path}.rotationMatrix`, 'rotation matrix must contain nine finite values');
    }
  }
  if (track.editList !== undefined) {
    if (!Array.isArray(track.editList) || track.editList.length > MAX_TIMELINE_POINTS) {
      return invalid('METADATA_EDIT_LIST_INVALID', `${path}.editList`, 'edit list must be a bounded array');
    }
    for (let index = 0; index < track.editList.length; index++) {
      const edit = record(track.editList[index]);
      if (!edit || !safeIntegerRange(edit.segmentDuration, 0, Number.MAX_SAFE_INTEGER) ||
        !safeIntegerRange(edit.mediaTime, -1, Number.MAX_SAFE_INTEGER) ||
        !safeIntegerRange(edit.mediaRateNumerator, 0, Number.MAX_SAFE_INTEGER) ||
        !safeIntegerRange(edit.mediaRateDenominator, 1, Number.MAX_SAFE_INTEGER) ||
        !safeIntegerRange(edit.movieTimescale, 1, Number.MAX_SAFE_INTEGER) ||
        !safeIntegerRange(edit.mediaTimescale, 1, Number.MAX_SAFE_INTEGER)) {
        return invalid('METADATA_EDIT_LIST_INVALID', `${path}.editList[${index}]`, 'edit-list entry has an invalid timing field');
      }
    }
  }
  const scoped = validateScopedTags(track.scopedTags, `${path}.scopedTags`, maximumTagEntries, maximumTagValueBytes);
  return scoped.error;
}

function validateStringTags(
  value: unknown,
  path: string,
  maximumTagEntries: number,
  maximumTagValueBytes: number,
): { error?: Extract<MetadataSchemaValidation, { state: 'INVALID' }>; count: number } {
  if (value === undefined) return { count: 0 };
  const tags = record(value);
  if (!tags) return { error: invalid('METADATA_TAG_MAP_INVALID', path, 'tags must be a plain string map'), count: 0 };
  const entries = Object.entries(tags);
  if (entries.length > maximumTagEntries) {
    return { error: invalid('METADATA_TAG_COUNT_UNBOUNDED', path, `tag count exceeds ${maximumTagEntries}`), count: entries.length };
  }
  for (const [key, entry] of entries) {
    if (utf8Bytes(key) === 0 || utf8Bytes(key) > MAX_TAG_KEY_BYTES) {
      return { error: invalid('METADATA_TAG_KEY_INVALID', `${path}.${key}`, 'tag key is empty or too large'), count: entries.length };
    }
    if (typeof entry !== 'string' || utf8Bytes(entry) > maximumTagValueBytes) {
      return { error: invalid('METADATA_TAG_VALUE_INVALID', `${path}.${key}`, 'tag value is not a bounded string'), count: entries.length };
    }
  }
  return { count: entries.length };
}

function validateScopedTags(
  value: unknown,
  path: string,
  maximumTagEntries: number,
  maximumTagValueBytes: number,
): { error?: Extract<MetadataSchemaValidation, { state: 'INVALID' }>; count: number } {
  if (value === undefined) return { count: 0 };
  if (!Array.isArray(value) || value.length > maximumTagEntries) {
    return { error: invalid('METADATA_SCOPED_TAGS_INVALID', path, `scoped tags must have at most ${maximumTagEntries} entries`), count: 0 };
  }
  const semantic = new Set<string>(SEMANTIC_TAG_KEYS);
  for (let index = 0; index < value.length; index++) {
    const tag = record(value[index]);
    const itemPath = `${path}[${index}]`;
    if (!tag || !['container', 'track', 'chapter', 'attachment'].includes(String(tag.scope))) {
      return { error: invalid('METADATA_SCOPED_TAG_INVALID', itemPath, 'scoped tag has an invalid scope'), count: value.length };
    }
    if (!nonEmptyString(tag.rawKey, MAX_TAG_KEY_BYTES) || typeof tag.value !== 'string' || utf8Bytes(tag.value) > maximumTagValueBytes) {
      return { error: invalid('METADATA_SCOPED_TAG_INVALID', itemPath, 'scoped tag key/value is invalid'), count: value.length };
    }
    if (tag.canonicalKey !== undefined && !semantic.has(String(tag.canonicalKey))) {
      return { error: invalid('METADATA_SCOPED_TAG_CANONICAL_KEY_INVALID', `${itemPath}.canonicalKey`, 'canonical semantic tag key is invalid'), count: value.length };
    }
    const requiredReference = tag.scope === 'track'
      ? 'trackId'
      : tag.scope === 'chapter'
        ? 'chapterId'
        : tag.scope === 'attachment'
          ? 'attachmentId'
          : undefined;
    if (requiredReference && !nonEmptyString(tag[requiredReference], 1_024)) {
      return { error: invalid('METADATA_SCOPED_TAG_REFERENCE_MISSING', `${itemPath}.${requiredReference}`, `${tag.scope} tag requires ${requiredReference}`), count: value.length };
    }
  }
  return { count: value.length };
}

function validateChapters(
  value: unknown,
  maximumTagEntries: number,
  maximumTagValueBytes: number,
): { error?: Extract<MetadataSchemaValidation, { state: 'INVALID' }>; scopedTagCount: number } {
  if (value === undefined) return { scopedTagCount: 0 };
  if (!Array.isArray(value) || value.length > MAX_CHAPTERS) {
    return { error: invalid('METADATA_CHAPTERS_INVALID', '$.chapters', 'chapters must be a bounded array'), scopedTagCount: 0 };
  }
  let scopedTagCount = 0;
  for (let index = 0; index < value.length; index++) {
    const chapter = record(value[index]) as (Record<string, unknown> & Partial<MetadataChapter>) | undefined;
    const path = `$.chapters[${index}]`;
    if (!chapter || !nonEmptyString(chapter.id, 1_024) || !finiteRange(chapter.startTimeSec, 0, MAX_DURATION_SEC)) {
      return { error: invalid('METADATA_CHAPTER_INVALID', path, 'chapter id/start time is invalid'), scopedTagCount };
    }
    if (chapter.endTimeSec !== undefined &&
      (!finiteRange(chapter.endTimeSec, chapter.startTimeSec, MAX_DURATION_SEC) || chapter.endTimeSec < chapter.startTimeSec)) {
      return { error: invalid('METADATA_CHAPTER_RANGE_INVALID', `${path}.endTimeSec`, 'chapter end precedes its start'), scopedTagCount };
    }
    const scoped = validateScopedTags(chapter.tags, `${path}.tags`, maximumTagEntries, maximumTagValueBytes);
    if (scoped.error) return { error: scoped.error, scopedTagCount };
    scopedTagCount += scoped.count;
  }
  return { scopedTagCount };
}

function validateCoverArt(value: unknown): Extract<MetadataSchemaValidation, { state: 'INVALID' }> | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS) {
    return invalid('METADATA_COVER_ART_INVALID', '$.coverArt', 'cover art must be a bounded array');
  }
  for (let index = 0; index < value.length; index++) {
    const art = record(value[index]) as (Record<string, unknown> & Partial<MetadataCoverArt>) | undefined;
    const path = `$.coverArt[${index}]`;
    if (!art || !nonEmptyString(art.id, 1_024) || !nonEmptyString(art.mime, 256) ||
      !safeIntegerRange(art.byteLength, 0, Number.MAX_SAFE_INTEGER)) {
      return invalid('METADATA_COVER_ART_INVALID', path, 'cover-art identity, MIME, or length is invalid');
    }
    if (art.sha256 !== undefined && (typeof art.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(art.sha256))) {
      return invalid('METADATA_COVER_ART_DIGEST_INVALID', `${path}.sha256`, 'cover-art digest is not SHA-256');
    }
    if ((art.width === undefined) !== (art.height === undefined) ||
      (art.width !== undefined && !safeIntegerRange(art.width, 1, MAX_DIMENSION)) ||
      (art.height !== undefined && !safeIntegerRange(art.height, 1, MAX_DIMENSION))) {
      return invalid('METADATA_COVER_ART_DIMENSIONS_INVALID', path, 'cover-art dimensions must be a complete positive pair');
    }
  }
  return undefined;
}

function validateTimecodes(value: unknown): Extract<MetadataSchemaValidation, { state: 'INVALID' }> | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_TIMECODES) {
    return invalid('METADATA_TIMECODES_INVALID', '$.timecodes', 'timecodes must be a bounded array');
  }
  for (let index = 0; index < value.length; index++) {
    const timecode = record(value[index]) as (Record<string, unknown> & Partial<MetadataTimecode>) | undefined;
    const path = `$.timecodes[${index}]`;
    if (!timecode || !nonEmptyString(timecode.value, 256)) {
      return invalid('METADATA_TIMECODE_INVALID', path, 'timecode value is required');
    }
    if ((timecode.rateNumerator === undefined) !== (timecode.rateDenominator === undefined) ||
      (timecode.rateNumerator !== undefined &&
        !validRational({ numerator: timecode.rateNumerator, denominator: timecode.rateDenominator }))) {
      return invalid('METADATA_TIMECODE_RATE_INVALID', path, 'timecode rate must be a complete positive rational');
    }
  }
  return undefined;
}

function boundedLimit(
  value: number | undefined,
  maximum: number,
  name: string,
): number | Extract<MetadataSchemaValidation, { state: 'INVALID' }> {
  const selected = value ?? maximum;
  return safeIntegerRange(selected, 0, maximum)
    ? selected
    : invalid('METADATA_SCHEMA_LIMIT_INVALID', `limits.${name}`, `${name} must be a safe integer within 0..${maximum}`);
}

function validTimebase(value: unknown): value is RationalTimebase {
  return validRational(value);
}

function validRational(value: unknown): value is { numerator: number; denominator: number } {
  const rational = record(value);
  return !!rational && safeIntegerRange(rational.numerator, 1, Number.MAX_SAFE_INTEGER) &&
    safeIntegerRange(rational.denominator, 1, Number.MAX_SAFE_INTEGER);
}

function nullableFinite(value: unknown, min: number, max: number): boolean {
  return value === null || finiteRange(value, min, max);
}

function finiteRange(value: unknown, min: number, max: number, inclusiveMin = true): value is number {
  return typeof value === 'number' && Number.isFinite(value) &&
    (inclusiveMin ? value >= min : value > min) && value <= max;
}

function safeIntegerRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

function nonEmptyString(value: unknown, maxBytes: number): value is string {
  return typeof value === 'string' && value.length > 0 && utf8Bytes(value) <= maxBytes;
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function record(value: unknown): Record<string, any> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? value as Record<string, any> : undefined;
}

function invalid(
  reasonCode: string,
  path: string,
  detail: string,
): Extract<MetadataSchemaValidation, { state: 'INVALID' }> {
  return { state: 'INVALID', reasonCode, path, detail };
}
