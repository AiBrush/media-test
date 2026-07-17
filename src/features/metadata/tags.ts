import type { NormalizedMetadata } from '../../core/engine.ts';
import type { OracleId, OracleOutcome } from '../../core/scenario.ts';
import { metadataError, metadataVerdict } from './outcome.ts';
import { readNeutralMetadataTags } from './neutral-reader.ts';
import {
  METADATA_TAG_CONTRACT_SCHEMA,
  SEMANTIC_TAG_KEYS,
  type MetadataCarrier,
  type MetadataTagContract,
  type NeutralMetadataEvidence,
  type NeutralMetadataReadResult,
  type ScopedMetadataTag,
  type SemanticTagKey,
} from './types.ts';

export interface CanonicalTagObservation {
  readonly semantic: Readonly<Partial<Record<SemanticTagKey, string>>>;
  readonly sources: Readonly<Partial<Record<SemanticTagKey, readonly ScopedMetadataTag[]>>>;
  readonly conflicts: readonly string[];
  readonly technical: readonly ScopedMetadataTag[];
}

export interface VerifyMetadataTagsInput {
  readonly bytes: Uint8Array;
  readonly contract: MetadataTagContract;
  readonly reader?: (bytes: Uint8Array, containerHint?: string) => NeutralMetadataReadResult;
  readonly oracle?: OracleId;
}

export function defineMetadataTagContract(
  value: Omit<MetadataTagContract, 'schema' | 'allowAdditionalTechnicalTags'>,
): MetadataTagContract {
  if (!isCarrier(value.carrier)) throw new TypeError(`unsupported metadata carrier '${String(value.carrier)}'`);
  if (!['read-subset', 'write-reprobe', 'assert-absence', 'cross-container-equality'].includes(value.mode)) {
    throw new TypeError(`unsupported metadata tag mode '${String(value.mode)}'`);
  }
  if ((value.mode === 'read-subset' || value.mode === 'write-reprobe' || value.mode === 'cross-container-equality') &&
    (!value.requested || Object.keys(value.requested).length === 0)) {
    throw new TypeError(`${value.mode} requires at least one requested semantic tag`);
  }
  if (value.sourceCarrier !== undefined && !isCarrier(value.sourceCarrier)) {
    throw new TypeError(`unsupported source metadata carrier '${String(value.sourceCarrier)}'`);
  }
  const requested: Partial<Record<SemanticTagKey, string>> = {};
  for (const [key, item] of Object.entries(value.requested ?? {})) {
    if (!SEMANTIC_TAG_KEYS.includes(key as SemanticTagKey) || typeof item !== 'string') {
      throw new TypeError(`invalid semantic metadata tag '${key}'`);
    }
    requested[key as SemanticTagKey] = item;
  }
  return deepFreeze({
    schema: METADATA_TAG_CONTRACT_SCHEMA,
    ...value,
    ...(Object.keys(requested).length ? { requested } : {}),
    allowAdditionalTechnicalTags: true,
  });
}

/** Read the family-local contract without making the core scenario model import feature code. */
export function metadataTagContractFromOptions(options: unknown): MetadataTagContract | undefined {
  const root = record(options);
  if (!root) return undefined;
  const robustness = record(root.robustness);
  const value = record(robustness?.metadataTags);
  if (!value || value.schema !== METADATA_TAG_CONTRACT_SCHEMA) return undefined;
  try {
    return defineMetadataTagContract({
      mode: value.mode as MetadataTagContract['mode'],
      carrier: value.carrier as MetadataCarrier,
      ...(record(value.requested) ? { requested: value.requested as Partial<Record<SemanticTagKey, string>> } : {}),
      ...(isCarrier(value.sourceCarrier) ? { sourceCarrier: value.sourceCarrier } : {}),
    });
  } catch {
    return undefined;
  }
}

/**
 * Canonicalize only the seven explicitly scored semantic keys. Values are NFC-normalized but keep
 * their case and every whitespace codepoint; carrier-specific key case rules do not leak into values.
 */
export function canonicalizeSemanticTags(
  carrier: MetadataCarrier,
  tags: Readonly<Record<string, string>> = {},
  scopedTags: readonly ScopedMetadataTag[] = [],
): CanonicalTagObservation {
  const raw: ScopedMetadataTag[] = scopedTags.length
    ? [...scopedTags]
    : Object.entries(tags).map(([rawKey, value]) => ({ scope: 'container', rawKey, value }));
  const semantic: Partial<Record<SemanticTagKey, string>> = {};
  const sources: Partial<Record<SemanticTagKey, ScopedMetadataTag[]>> = {};
  const conflicts: string[] = [];
  const technical: ScopedMetadataTag[] = [];
  for (const tag of raw) {
    const key = semanticKey(carrier, tag.rawKey);
    if (!key) {
      technical.push(tag);
      continue;
    }
    const normalized = tag.value.normalize('NFC');
    const list = sources[key] ?? [];
    list.push({ ...tag, canonicalKey: key });
    sources[key] = list;
    const prior = semantic[key];
    if (prior === undefined) semantic[key] = normalized;
    else if (prior !== normalized) {
      conflicts.push(`${key} has conflicting carrier values ${JSON.stringify(prior)} and ${JSON.stringify(normalized)}`);
    }
  }
  return { semantic, sources, conflicts, technical };
}

export function assessSemanticTagContract(
  contract: MetadataTagContract,
  observation: NeutralMetadataEvidence,
): OracleOutcome {
  if (contract.schema !== METADATA_TAG_CONTRACT_SCHEMA) {
    return metadataError('METADATA_TAG_CONTRACT_SCHEMA_INVALID', 'metadata tag contract schema is unsupported');
  }
  if (observation.carrier !== contract.carrier && !sameCarrierFamily(observation.carrier, contract.carrier)) {
    return metadataVerdict(
      'FAIL',
      'METADATA_TAG_CARRIER_MISMATCH',
      `neutral re-probe found '${observation.carrier}', expected '${contract.carrier}'`,
    );
  }
  const canonical = canonicalizeSemanticTags(observation.carrier, observation.tags, observation.scopedTags);
  const measurements = {
    parsedTagCount: observation.parsedTagCount,
    semanticTagCount: Object.keys(canonical.semantic).length,
    technicalTagCount: canonical.technical.length,
  };
  if (canonical.conflicts.length) {
    return metadataVerdict('FAIL', 'METADATA_TAG_CONFLICT', canonical.conflicts.join('; '), measurements);
  }
  if (contract.mode === 'assert-absence') {
    const fabricated = Object.keys(canonical.semantic) as SemanticTagKey[];
    if (fabricated.length) {
      return metadataVerdict(
        'FAIL',
        'METADATA_SEMANTIC_TAG_FABRICATED',
        `no-tag input exposed fabricated semantic key(s): ${fabricated.join(', ')}`,
        measurements,
      );
    }
    return metadataVerdict(
      'PASS',
      'METADATA_SEMANTIC_TAGS_ABSENT',
      `no semantic tags were reported; ${canonical.technical.length} technical tag(s) remain diagnostic`,
      measurements,
    );
  }

  const failures: string[] = [];
  for (const [key, requested] of Object.entries(contract.requested ?? {}) as Array<[SemanticTagKey, string]>) {
    const actual = canonical.semantic[key];
    if (actual === undefined) failures.push(`${key} is absent`);
    else if (actual !== requested.normalize('NFC')) failures.push(`${key}=${JSON.stringify(actual)} vs requested ${JSON.stringify(requested)}`);
    const wrongScope = (canonical.sources[key] ?? []).filter((tag) => tag.scope !== 'container');
    if (actual !== undefined && wrongScope.length === (canonical.sources[key]?.length ?? 0)) {
      failures.push(`${key} exists only at ${wrongScope.map((tag) => tag.scope).join('/')} scope`);
    }
  }
  if (failures.length) {
    return metadataVerdict(
      'FAIL',
      contract.mode === 'write-reprobe' ? 'METADATA_TAG_WRITE_READBACK_MISMATCH' : 'METADATA_TAG_SUBSET_MISMATCH',
      failures.join('; '),
      measurements,
    );
  }
  if (contract.sourceCarrier && !sameCarrierFamily(contract.sourceCarrier, observation.carrier)) {
    return metadataVerdict(
      'DIFF',
      'METADATA_TAG_LOSSLESS_CARRIER_DIFFERENCE',
      `semantic tag subset is equal after ${contract.sourceCarrier}→${observation.carrier} carrier mapping`,
      measurements,
    );
  }
  return metadataVerdict(
    'PASS',
    contract.mode === 'write-reprobe' ? 'METADATA_TAG_WRITE_READBACK_MATCH' : 'METADATA_TAG_SUBSET_MATCH',
    `${Object.keys(contract.requested ?? {}).length} semantic tag(s) match after ${observation.carrier} carrier mapping`,
    measurements,
  );
}

/** Apply the same semantic subset/absence policy to an adapter probe observation. */
export function assessMetadataTagsFromObservation(
  contract: MetadataTagContract,
  metadata: NormalizedMetadata,
  oracle: OracleId = 'property-invariant',
): OracleOutcome {
  const extended = metadata as NormalizedMetadata & { scopedTags?: readonly ScopedMetadataTag[] };
  const outcome = assessSemanticTagContract(contract, {
    schema: 'media-test/normalized-metadata@2',
    carrier: contract.carrier,
    byteLength: 0,
    tags: metadata.tags ?? {},
    scopedTags: extended.scopedTags ?? [],
    parsedTagCount: Object.keys(metadata.tags ?? {}).length + (extended.scopedTags?.length ?? 0),
    carrierPaths: ['adapter-probe-observation'],
  });
  return { ...outcome, oracle };
}

export function verifyMetadataTagsByNeutralReprobe(input: VerifyMetadataTagsInput): OracleOutcome {
  const read = (input.reader ?? readNeutralMetadataTags)(input.bytes, input.contract.carrier);
  const oracle = input.oracle ?? 'property-invariant';
  if (read.state === 'OK') return { ...assessSemanticTagContract(input.contract, read.value), oracle };
  if (read.state === 'MALFORMED' || read.state === 'INCOMPLETE') {
    return { ...metadataVerdict(
      'FAIL',
      read.reasonCode,
      `authored output failed neutral tag re-probe: ${read.detail}`,
      { outputBytes: input.bytes.byteLength },
    ), oracle };
  }
  return { ...metadataError(
    read.reasonCode,
    `neutral tag reader cannot validate '${input.contract.carrier}': ${read.detail}`,
  ), oracle };
}

/**
 * Compose required metadata layers. Unlike the cell reducer, an unavailable/error layer is decisive
 * here even when another required layer passed: a structural PASS cannot claim tag correctness when
 * the neutral tag reader itself was unavailable.
 */
export function reduceRequiredMetadataLayers(
  layers: readonly OracleOutcome[],
  oracle: OracleId = 'reference-reimport',
): OracleOutcome {
  const sorted = [...layers].sort((a, b) => a.reasonCode.localeCompare(b.reasonCode));
  const pickVerdict = (value: 'FAIL' | 'DIFF' | 'PASS') =>
    sorted.find((layer) => layer.state === 'VERDICT' && layer.verdict === value);
  const decisive = pickVerdict('FAIL') ??
    sorted.find((layer) => layer.state === 'ERROR') ??
    sorted.find((layer) => layer.state === 'UNAVAILABLE' && layer.status === 'NA_BROWSER') ??
    sorted.find((layer) => layer.state === 'UNAVAILABLE' && layer.status === 'NA_ASSET') ??
    pickVerdict('DIFF') ??
    pickVerdict('PASS');
  if (!decisive) return metadataError('METADATA_REQUIRED_LAYERS_EMPTY', 'metadata comparison produced no required layer', oracle);
  return {
    ...decisive,
    oracle,
    detail: `${decisive.detail ?? decisive.reasonCode}; layers=[${sorted.map((layer) => layer.reasonCode).join(', ')}]`,
  };
}

function semanticKey(carrier: MetadataCarrier, rawKey: string): SemanticTagKey | undefined {
  const exact = rawKey.replace(/#\d+$/, '');
  if (carrier === 'mp4' || carrier === 'mov') {
    const lower = exact.toLowerCase();
    const mapping: Record<string, SemanticTagKey> = {
      '©nam': 'title', title: 'title', 'com.apple.quicktime.title': 'title',
      '©art': 'artist', artist: 'artist', 'com.apple.quicktime.artist': 'artist',
      '©alb': 'album', album: 'album', 'com.apple.quicktime.album': 'album',
      '©cmt': 'comment', comment: 'comment', 'com.apple.quicktime.comment': 'comment',
      '©day': 'date', date: 'date', year: 'date',
      '©gen': 'genre', gnre: 'genre', genre: 'genre',
      trkn: 'trackNumber', track: 'trackNumber', tracknumber: 'trackNumber',
    };
    return mapping[lower];
  }
  if (carrier === 'mp3') {
    if (/^TXX(?:X)?:COMMENT$/i.test(exact)) return 'comment';
    const mapping: Record<string, SemanticTagKey> = {
      TIT2: 'title', TT2: 'title', TPE1: 'artist', TP1: 'artist', TALB: 'album', TAL: 'album',
      COMM: 'comment', COM: 'comment', TDRC: 'date', TYER: 'date', TYE: 'date',
      TCON: 'genre', TCO: 'genre', TRCK: 'trackNumber', TRK: 'trackNumber',
    };
    return mapping[exact.toUpperCase()];
  }
  if (carrier === 'flac' || carrier === 'ogg' || carrier === 'mkv' || carrier === 'webm') {
    const normalized = exact.toUpperCase().replace(/[-_ ]/g, '');
    const mapping: Record<string, SemanticTagKey> = {
      TITLE: 'title', ARTIST: 'artist', ALBUM: 'album', COMMENT: 'comment', DESCRIPTION: 'comment',
      DATE: 'date', YEAR: 'date', GENRE: 'genre', TRACKNUMBER: 'trackNumber', PARTNUMBER: 'trackNumber', TRACK: 'trackNumber',
    };
    return mapping[normalized];
  }
  if (carrier === 'wav') {
    const mapping: Record<string, SemanticTagKey> = {
      INAM: 'title', IART: 'artist', IPRD: 'album', ICMT: 'comment', ICRD: 'date', IGNR: 'genre', ITRK: 'trackNumber',
    };
    return mapping[exact.toUpperCase()];
  }
  if (carrier === 'aiff') {
    const mapping: Record<string, SemanticTagKey> = { NAME: 'title', AUTH: 'artist', ANNO: 'comment' };
    return mapping[exact.toUpperCase()];
  }
  return undefined;
}

function sameCarrierFamily(a: MetadataCarrier, b: MetadataCarrier): boolean {
  const family = (value: MetadataCarrier): string => {
    if (value === 'mp4' || value === 'mov') return 'isobmff';
    if (value === 'mkv' || value === 'webm') return 'matroska';
    return value;
  };
  return family(a) === family(b);
}

function isCarrier(value: unknown): value is MetadataCarrier {
  return typeof value === 'string' && ['mp4', 'mov', 'mkv', 'webm', 'mp3', 'flac', 'ogg', 'wav', 'aiff'].includes(value);
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
