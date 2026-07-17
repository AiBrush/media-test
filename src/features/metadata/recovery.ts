import type { OracleOutcome } from '../../core/scenario.ts';
import { metadataVerdict } from './outcome.ts';
import { validateExtendedMetadata } from './schema.ts';
import { canonicalizeSemanticTags } from './tags.ts';
import {
  EXTENDED_METADATA_SCHEMA,
  METADATA_RECOVERY_CONTRACT_SCHEMA,
  SEMANTIC_TAG_KEYS,
  type ExtendedNormalizedMetadata,
  type MetadataRecoveryContract,
  type MetadataRecoveryInput,
  type SemanticTagKey,
} from './types.ts';

export function defineMetadataRecoveryContract(
  value: Omit<MetadataRecoveryContract, 'schema'>,
): MetadataRecoveryContract {
  if (value.corruptRegion === 'id3' && value.expectedContainer !== 'mp3') {
    throw new TypeError('an ID3 recovery contract requires the mp3 container');
  }
  if (value.corruptRegion === 'mp4-ilst' && value.expectedContainer !== 'mp4') {
    throw new TypeError('an ilst recovery contract requires the mp4 container');
  }
  for (const [name, limit, maximum] of [
    ['maximumTracks', value.maximumTracks, 256],
    ['maximumTagEntries', value.maximumTagEntries, 4_096],
    ['maximumTagValueBytes', value.maximumTagValueBytes, 1_048_576],
  ] as const) {
    if (!Number.isSafeInteger(limit) || limit < 0 || limit > maximum) {
      throw new TypeError(`${name} must be a safe integer within 0..${maximum}`);
    }
  }
  if (value.forbiddenSemanticTags.some((key) => !SEMANTIC_TAG_KEYS.includes(key))) {
    throw new TypeError('metadata recovery contract contains an unknown semantic tag key');
  }
  return deepFreeze({
    schema: METADATA_RECOVERY_CONTRACT_SCHEMA,
    ...value,
    forbiddenSemanticTags: [...new Set(value.forbiddenSemanticTags)],
  });
}

export function metadataRecoveryContractFromOptions(options: unknown): MetadataRecoveryContract | undefined {
  const root = record(options);
  const robustness = record(root?.robustness);
  const value = record(robustness?.metadataRecovery);
  if (!value || value.schema !== METADATA_RECOVERY_CONTRACT_SCHEMA) return undefined;
  try {
    return defineMetadataRecoveryContract({
      corruptRegion: value.corruptRegion as MetadataRecoveryContract['corruptRegion'],
      expectedContainer: value.expectedContainer as MetadataRecoveryContract['expectedContainer'],
      maximumTracks: value.maximumTracks as number,
      maximumTagEntries: value.maximumTagEntries as number,
      maximumTagValueBytes: value.maximumTagValueBytes as number,
      forbiddenSemanticTags: value.forbiddenSemanticTags as SemanticTagKey[],
    });
  } catch {
    return undefined;
  }
}

/**
 * A malformed metadata region may be rejected or ignored, but returned evidence earns PASS only
 * after full schema/bounds validation and after proving that no semantic value from the corrupt
 * carrier was promoted as trusted metadata.
 */
export function assessMetadataRecovery(input: MetadataRecoveryInput): OracleOutcome {
  const contract = input.contract;
  if (contract.schema !== METADATA_RECOVERY_CONTRACT_SCHEMA) {
    return {
      state: 'ERROR',
      oracle: 'property-invariant',
      reasonCode: 'METADATA_RECOVERY_CONTRACT_SCHEMA_INVALID',
      detail: 'metadata recovery contract schema is unsupported',
    };
  }
  if (input.disposition === 'rejected') {
    return metadataVerdict(
      'PASS',
      'METADATA_RECOVERY_CLEAN_REJECTION',
      `${contract.corruptRegion} input was cleanly rejected`,
    );
  }
  if (input.disposition === 'timeout' || input.disposition === 'crash') {
    return metadataVerdict(
      'FAIL',
      input.disposition === 'timeout' ? 'METADATA_RECOVERY_TIMEOUT' : 'METADATA_RECOVERY_CRASH',
      input.detail ?? `metadata recovery ended in ${input.disposition}`,
    );
  }
  if (input.metadata === undefined) {
    return metadataVerdict(
      'FAIL',
      'METADATA_RECOVERY_OUTPUT_MISSING',
      'recovery was classified as returned but no metadata observation exists',
    );
  }
  const validated = validateExtendedMetadata(input.metadata, {
    maximumTracks: contract.maximumTracks,
    maximumTagEntries: contract.maximumTagEntries,
    maximumTagValueBytes: contract.maximumTagValueBytes,
  });
  if (validated.state !== 'OK') {
    return metadataVerdict(
      'FAIL',
      'METADATA_RECOVERY_UNSAFE_SCHEMA',
      `${validated.path} [${validated.reasonCode}]: ${validated.detail}`,
    );
  }
  const metadata = validated.value;
  if (metadata.container.trim().toLowerCase() !== contract.expectedContainer) {
    return metadataVerdict(
      'FAIL',
      'METADATA_RECOVERY_CONTAINER_INVALID',
      `recovered container '${metadata.container}' does not match '${contract.expectedContainer}'`,
    );
  }
  if (metadata.tracks.length === 0) {
    return metadataVerdict(
      'FAIL',
      'METADATA_RECOVERY_TRACKS_MISSING',
      'returned recovery has no structurally sane media track',
    );
  }
  const allScoped = [
    ...(metadata.scopedTags ?? []),
    ...metadata.tracks.flatMap((track) => track.scopedTags ?? []),
    ...(metadata.chapters ?? []).flatMap((chapter) => chapter.tags ?? []),
  ];
  const semantic = canonicalizeSemanticTags(
    contract.expectedContainer,
    metadata.tags ?? {},
    allScoped,
  );
  if (semantic.conflicts.length) {
    return metadataVerdict(
      'FAIL',
      'METADATA_RECOVERY_TAG_CONFLICT',
      `corrupt-region recovery exposed conflicting tag values: ${semantic.conflicts.join('; ')}`,
    );
  }
  const forbidden = contract.forbiddenSemanticTags.filter((key) => semantic.semantic[key] !== undefined);
  if (forbidden.length) {
    return metadataVerdict(
      'FAIL',
      'METADATA_RECOVERY_CORRUPT_TAG_TRUSTED',
      `semantic tag(s) from corrupt ${contract.corruptRegion} region were trusted: ${forbidden.join(', ')}`,
      {
        recoveredTracks: metadata.tracks.length,
        semanticTagsFromCorruptRegion: forbidden.length,
      },
    );
  }
  return metadataVerdict(
    'PASS',
    'METADATA_RECOVERY_SANE_PARTIAL',
    `safe partial recovery: ${metadata.tracks.length} track(s), finite bounded structure, corrupt semantic tags absent`,
    {
      recoveredTracks: metadata.tracks.length,
      recoveredTags: validated.evidence.tagCount + validated.evidence.scopedTagCount,
    },
  );
}

export function recoveryMetadata(
  container: 'mp3' | 'mp4',
  tracks: ExtendedNormalizedMetadata['tracks'],
  tags?: Record<string, string>,
): ExtendedNormalizedMetadata {
  return {
    schema: EXTENDED_METADATA_SCHEMA,
    container,
    durationSec: null,
    tracks,
    ...(tags ? { tags } : {}),
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (typeof value !== 'object' || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry, seen);
  return Object.freeze(value);
}
