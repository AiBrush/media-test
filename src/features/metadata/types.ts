import { NORMALIZED_METADATA_SCHEMA } from '../../core/engine.ts';
import type {
  MetadataChapter as CoreMetadataChapter,
  MetadataCoverArt as CoreMetadataCoverArt,
  MetadataEditListEntry as CoreMetadataEditListEntry,
  MetadataTagScope as CoreMetadataTagScope,
  MetadataTimecode as CoreMetadataTimecode,
  NormalizedMetadata,
  NormalizedTrack,
  RotationMatrix as CoreRotationMatrix,
  ScopedMetadataTag as CoreScopedMetadataTag,
  SemanticMetadataTagKey,
  TrackType,
} from '../../core/engine.ts';
import type { OracleOutcome } from '../../core/scenario.ts';

export const EXTENDED_METADATA_SCHEMA = NORMALIZED_METADATA_SCHEMA;
export const METADATA_TAG_CONTRACT_SCHEMA = 'media-test/metadata-tags@1' as const;
export const METADATA_RECOVERY_CONTRACT_SCHEMA = 'media-test/metadata-recovery@1' as const;
export const METADATA_EQUIVALENCE_MATRIX_SCHEMA = 'media-test/metadata-equivalence-matrix@1' as const;

export type SemanticTagKey = SemanticMetadataTagKey;

export const SEMANTIC_TAG_KEYS: readonly SemanticTagKey[] = Object.freeze([
  'title',
  'artist',
  'album',
  'comment',
  'date',
  'genre',
  'trackNumber',
]);

export type MetadataTagScope = CoreMetadataTagScope;
export type ScopedMetadataTag = CoreScopedMetadataTag;
export type MetadataEditListEntry = CoreMetadataEditListEntry;
export type MetadataChapter = CoreMetadataChapter;
export type MetadataCoverArt = CoreMetadataCoverArt;
export type MetadataTimecode = CoreMetadataTimecode;
export type RotationMatrix = CoreRotationMatrix;

/**
 * Metadata evidence that adapters and goldens must be able to retain without flattening away the
 * distinction between coded media, presentation, and carrier representation.
 */
export interface ExtendedNormalizedTrack extends NormalizedTrack {}

export interface ExtendedNormalizedMetadata extends NormalizedMetadata {
  readonly tracks: ExtendedNormalizedTrack[];
}

export type MetadataCarrier = 'mp4' | 'mov' | 'mkv' | 'webm' | 'mp3' | 'flac' | 'ogg' | 'wav' | 'aiff';

export type MetadataReadState =
  | 'OK'
  | 'UNSUPPORTED_FORMAT'
  | 'UNSUPPORTED_STRUCTURE'
  | 'MALFORMED'
  | 'INCOMPLETE';

export interface NeutralMetadataEvidence {
  readonly schema: typeof EXTENDED_METADATA_SCHEMA;
  readonly carrier: MetadataCarrier;
  readonly byteLength: number;
  readonly tags: Readonly<Record<string, string>>;
  readonly scopedTags: readonly ScopedMetadataTag[];
  readonly parsedTagCount: number;
  readonly carrierPaths: readonly string[];
}

export type NeutralMetadataReadResult =
  | Readonly<{ state: 'OK'; value: NeutralMetadataEvidence }>
  | Readonly<{
      state: Exclude<MetadataReadState, 'OK'>;
      reasonCode: string;
      detail: string;
      carrier?: string;
      byteLength: number;
    }>;

export interface MetadataTagContract {
  readonly schema: typeof METADATA_TAG_CONTRACT_SCHEMA;
  readonly mode: 'read-subset' | 'write-reprobe' | 'assert-absence' | 'cross-container-equality';
  readonly carrier: MetadataCarrier;
  readonly requested?: Readonly<Partial<Record<SemanticTagKey, string>>>;
  readonly sourceCarrier?: MetadataCarrier;
  readonly allowAdditionalTechnicalTags: true;
}

export interface MetadataRecoveryContract {
  readonly schema: typeof METADATA_RECOVERY_CONTRACT_SCHEMA;
  readonly corruptRegion: 'id3' | 'mp4-ilst';
  readonly expectedContainer: 'mp3' | 'mp4';
  readonly maximumTracks: number;
  readonly maximumTagEntries: number;
  readonly maximumTagValueBytes: number;
  /** Semantic values originating in the corrupt region may never be reported as trusted recovery. */
  readonly forbiddenSemanticTags: readonly SemanticTagKey[];
}

export type MetadataRecoveryDisposition = 'rejected' | 'returned' | 'timeout' | 'crash';

export interface MetadataRecoveryInput {
  readonly disposition: MetadataRecoveryDisposition;
  readonly contract: MetadataRecoveryContract;
  readonly metadata?: unknown;
  readonly detail?: string;
}

export interface MetadataAssessment {
  readonly outcome: OracleOutcome;
  readonly evidence?: Readonly<Record<string, unknown>>;
}

export interface MetadataEquivalenceCase {
  readonly id: string;
  readonly rule:
    | 'codec-alias'
    | 'track-reorder'
    | 'he-aac-sbr'
    | 'he-aac-ps'
    | 'ntsc-rational'
    | 'vfr-cadence'
    | 'presentation-duration'
    | 'rotation-normalization';
  readonly reference: ExtendedNormalizedMetadata;
  readonly candidate: ExtendedNormalizedMetadata;
  readonly expectedVerdict: 'PASS' | 'DIFF' | 'FAIL';
  readonly neighbor: 'positive' | 'negative';
}

export interface MetadataEquivalenceMatrix {
  readonly schema: typeof METADATA_EQUIVALENCE_MATRIX_SCHEMA;
  readonly source: string;
  readonly cases: readonly MetadataEquivalenceCase[];
  /** Every modeled schema field is named so fixture audits cannot silently lose coverage. */
  readonly modeledFields: readonly string[];
}

export function trackType(value: unknown): value is TrackType {
  return value === 'video' || value === 'audio' || value === 'subtitle' || value === 'other';
}
