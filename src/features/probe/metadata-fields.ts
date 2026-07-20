import { canonicalCodecToken } from '../../core/box-readers.ts';
import type { NormalizedTrack } from '../../core/engine.ts';
import { contractError, verdict, type ProbeContractAssessment, type ProbeMetadataObservation } from './types.ts';

export const PROBE_METADATA_FIELD_POLICY_SCHEMA = 'media-test/probe-metadata-field-policy@1' as const;

export type DeclaredProbeMetadataField =
  | 'duration-nullability'
  | 'track.rotation'
  | 'track.bitrate'
  | 'track.language'
  | 'tags'
  | 'protection.scheme';

export interface ProbeMetadataFieldPolicy {
  schema: typeof PROBE_METADATA_FIELD_POLICY_SCHEMA;
  fields: readonly DeclaredProbeMetadataField[];
  /** Only these golden tag keys are part of the correctness contract. */
  tagKeys?: readonly string[];
  /** Expected protection comes from the scenario when a legacy golden cannot carry it yet. */
  protectionSchemes?: readonly string[];
  /** A parser-derived average may differ slightly while representing the same stream bitrate. */
  bitrateRelativeTolerance?: number;
  /** Explicit escape hatch for formats whose duration is intentionally unknowable from the header. */
  allowUnknownDuration?: boolean;
  /** Treat an exact zero-sample duration as equivalent to an unknown duration for an empty asset. */
  zeroDurationEquivalentToUnknown?: boolean;
}

export interface DeclaredTrackPair {
  measuredIndex: number;
  goldenIndex: number;
  measured: NormalizedTrack;
  golden: NormalizedTrack;
}

export function defineProbeMetadataFieldPolicy(
  value: Omit<ProbeMetadataFieldPolicy, 'schema'>,
): ProbeMetadataFieldPolicy {
  const fields = [...new Set(value.fields)];
  const tagKeys = value.tagKeys ? [...new Set(value.tagKeys.map((key) => key.trim()).filter(Boolean))] : undefined;
  const protectionSchemes = value.protectionSchemes
    ? [...new Set(value.protectionSchemes.map(normalizeProtectionScheme).filter(Boolean))]
    : undefined;
  const tolerance = value.bitrateRelativeTolerance ?? 0;
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 1) {
    throw new TypeError('bitrateRelativeTolerance must be finite and between 0 and 1');
  }
  if (fields.includes('tags') && (!tagKeys || tagKeys.length === 0)) {
    throw new TypeError("declaring 'tags' requires at least one tagKeys entry");
  }
  if (fields.includes('protection.scheme') && (!protectionSchemes || protectionSchemes.length === 0)) {
    throw new TypeError("declaring 'protection.scheme' requires protectionSchemes");
  }
  return Object.freeze({
    schema: PROBE_METADATA_FIELD_POLICY_SCHEMA,
    fields: Object.freeze(fields),
    ...(tagKeys ? { tagKeys: Object.freeze(tagKeys) } : {}),
    ...(protectionSchemes ? { protectionSchemes: Object.freeze(protectionSchemes) } : {}),
    ...(value.bitrateRelativeTolerance !== undefined ? { bitrateRelativeTolerance: tolerance } : {}),
    ...(value.allowUnknownDuration !== undefined ? { allowUnknownDuration: value.allowUnknownDuration } : {}),
    ...(value.zeroDurationEquivalentToUnknown !== undefined
      ? { zeroDurationEquivalentToUnknown: value.zeroDurationEquivalentToUnknown }
      : {}),
  });
}

/**
 * Reads the promoted `options.metadataFieldPolicy` spelling and the scenario-local compatibility
 * envelope used while the shared DSL is being upgraded.
 */
export function metadataFieldPolicyFromOptions(options: unknown): ProbeMetadataFieldPolicy | undefined {
  if (!isRecord(options)) return undefined;
  const direct = options.metadataFieldPolicy;
  const robustness = isRecord(options.robustness) ? options.robustness : undefined;
  const probe = isRecord(robustness?.probe) ? robustness.probe : undefined;
  return parseProbeMetadataFieldPolicy(direct ?? probe?.metadataFieldPolicy);
}

export function parseProbeMetadataFieldPolicy(value: unknown): ProbeMetadataFieldPolicy | undefined {
  if (!isRecord(value) || value.schema !== PROBE_METADATA_FIELD_POLICY_SCHEMA || !Array.isArray(value.fields)) {
    return undefined;
  }
  const allowed = new Set<DeclaredProbeMetadataField>([
    'duration-nullability',
    'track.rotation',
    'track.bitrate',
    'track.language',
    'tags',
    'protection.scheme',
  ]);
  const fields = value.fields.filter((field): field is DeclaredProbeMetadataField =>
    typeof field === 'string' && allowed.has(field as DeclaredProbeMetadataField));
  if (fields.length !== value.fields.length) return undefined;
  try {
    return defineProbeMetadataFieldPolicy({
      fields,
      ...(Array.isArray(value.tagKeys) && value.tagKeys.every((entry) => typeof entry === 'string')
        ? { tagKeys: value.tagKeys as string[] }
        : {}),
      ...(Array.isArray(value.protectionSchemes) && value.protectionSchemes.every((entry) => typeof entry === 'string')
        ? { protectionSchemes: value.protectionSchemes as string[] }
        : {}),
      ...(typeof value.bitrateRelativeTolerance === 'number'
        ? { bitrateRelativeTolerance: value.bitrateRelativeTolerance }
        : {}),
      ...(typeof value.allowUnknownDuration === 'boolean'
        ? { allowUnknownDuration: value.allowUnknownDuration }
        : {}),
      ...(typeof value.zeroDurationEquivalentToUnknown === 'boolean'
        ? { zeroDurationEquivalentToUnknown: value.zeroDurationEquivalentToUnknown }
        : {}),
    });
  } catch {
    return undefined;
  }
}

export function assessDeclaredMetadataFields(
  measured: ProbeMetadataObservation,
  golden: ProbeMetadataObservation,
  policy: ProbeMetadataFieldPolicy,
  suppliedPairs?: readonly DeclaredTrackPair[],
): ProbeContractAssessment {
  if (policy.schema !== PROBE_METADATA_FIELD_POLICY_SCHEMA) {
    return contractError('PROBE_METADATA_POLICY_SCHEMA_INVALID', 'metadata field policy has an unsupported schema');
  }

  const failures: string[] = [];
  const differences: string[] = [];
  const evidence: Record<string, unknown> = { policy, fields: {} };
  const fieldsEvidence = evidence.fields as Record<string, unknown>;

  if (policy.fields.includes('duration-nullability')) {
    const gotNull = measured.durationSec == null;
    const wantNull = golden.durationSec == null;
    const zeroUnknownEquivalent = policy.zeroDurationEquivalentToUnknown === true &&
      wantNull && measured.durationSec === 0;
    fieldsEvidence.durationNullability = {
      measured: gotNull ? 'null' : 'finite',
      golden: wantNull ? 'null' : 'finite',
      measuredDurationSec: measured.durationSec,
      goldenDurationSec: golden.durationSec,
      zeroUnknownEquivalent,
    };
    if (gotNull !== wantNull && !zeroUnknownEquivalent && !policy.allowUnknownDuration) {
      failures.push(`duration nullability measured ${gotNull ? 'null' : 'finite'} vs golden ${wantNull ? 'null' : 'finite'}`);
    } else if (zeroUnknownEquivalent) {
      differences.push('duration 0s and unknown duration are equivalent for the declared empty asset');
    }
  }

  const needsTrackFields = policy.fields.some((field) => field.startsWith('track.'));
  const pairs = suppliedPairs ? [...suppliedPairs] : matchTracksForDeclaredFields(measured.tracks, golden.tracks);
  if (needsTrackFields && pairs.length < golden.tracks.length) {
    failures.push(`declared track fields have ${pairs.length} matched track(s) for ${golden.tracks.length} golden track(s)`);
  }
  const trackEvidence: Array<Record<string, unknown>> = [];
  for (const pair of pairs) {
    const prefix = `${pair.golden.type} measured[${pair.measuredIndex}]↔golden[${pair.goldenIndex}]`;
    const item: Record<string, unknown> = {
      measuredIndex: pair.measuredIndex,
      goldenIndex: pair.goldenIndex,
      type: pair.golden.type,
      codec: canonicalCodec(pair.golden.codec),
    };

    if (policy.fields.includes('track.rotation') && pair.golden.rotation != null) {
      item.rotation = { measured: pair.measured.rotation ?? null, golden: pair.golden.rotation };
      if (pair.measured.rotation == null) {
        failures.push(`${prefix}.rotation is absent vs golden ${pair.golden.rotation}°`);
      } else if (canonicalRotation(pair.measured.rotation) !== canonicalRotation(pair.golden.rotation)) {
        failures.push(`${prefix}.rotation ${pair.measured.rotation}° vs golden ${pair.golden.rotation}°`);
      } else if (pair.measured.rotation !== pair.golden.rotation) {
        differences.push(`${prefix}.rotation raw ${pair.measured.rotation}° vs ${pair.golden.rotation}°`);
      }
    }

    if (policy.fields.includes('track.language') && pair.golden.language != null) {
      item.language = { measured: pair.measured.language ?? null, golden: pair.golden.language };
      if (pair.measured.language == null) {
        failures.push(`${prefix}.language is absent vs golden '${pair.golden.language}'`);
      } else if (normalizeLanguage(pair.measured.language) !== normalizeLanguage(pair.golden.language)) {
        failures.push(`${prefix}.language '${pair.measured.language}' vs golden '${pair.golden.language}'`);
      } else if (pair.measured.language !== pair.golden.language) {
        differences.push(`${prefix}.language raw '${pair.measured.language}' vs '${pair.golden.language}'`);
      }
    }

    if (policy.fields.includes('track.bitrate') && pair.golden.bitrate != null) {
      item.bitrate = { measured: pair.measured.bitrate ?? null, golden: pair.golden.bitrate };
      if (pair.measured.bitrate == null || !Number.isFinite(pair.measured.bitrate)) {
        failures.push(`${prefix}.bitrate is absent vs golden ${pair.golden.bitrate}`);
      } else {
        const delta = Math.abs(pair.measured.bitrate - pair.golden.bitrate);
        const allowed = Math.abs(pair.golden.bitrate) * (policy.bitrateRelativeTolerance ?? 0);
        if (delta > allowed) {
          failures.push(`${prefix}.bitrate ${pair.measured.bitrate} vs golden ${pair.golden.bitrate} (Δ ${delta} > ${allowed})`);
        } else if (delta > 0) {
          differences.push(`${prefix}.bitrate ${pair.measured.bitrate} vs ${pair.golden.bitrate} within declared band`);
        }
      }
    }
    trackEvidence.push(item);
  }
  if (needsTrackFields) fieldsEvidence.tracks = trackEvidence;

  if (policy.fields.includes('tags')) {
    const tags: Record<string, unknown> = {};
    for (const key of policy.tagKeys ?? []) {
      const expected = golden.tags?.[key];
      const actual = measured.tags?.[key];
      tags[key] = { measured: actual ?? null, golden: expected ?? null };
      if (expected === undefined) {
        return contractError(
          'PROBE_DECLARED_TAG_GOLDEN_MISSING',
          `scenario declares tag '${key}', but its golden carries no such tag`,
          evidence,
        );
      }
      if (actual === undefined) failures.push(`tag '${key}' is absent vs golden '${expected}'`);
      else if (actual !== expected) failures.push(`tag '${key}' measured '${actual}' vs golden '${expected}'`);
    }
    fieldsEvidence.tags = tags;
  }

  if (policy.fields.includes('protection.scheme')) {
    const actual = protectionSchemes(measured);
    const expected = [...(policy.protectionSchemes ?? [])].map(normalizeProtectionScheme).filter(Boolean);
    fieldsEvidence.protection = { measured: actual, expected };
    for (const scheme of expected) {
      if (!actual.includes(scheme)) failures.push(`protection scheme '${scheme}' is not present (measured: ${actual.join(', ') || 'none'})`);
    }
  }

  if (failures.length) {
    return verdict('FAIL', 'PROBE_DECLARED_METADATA_FIELD_MISMATCH', failures.join('; '), undefined, evidence);
  }
  if (differences.length) {
    return verdict('DIFF', 'PROBE_DECLARED_METADATA_REPRESENTATION_DIFFERENCE', differences.join('; '), undefined, evidence);
  }
  return verdict(
    'PASS',
    'PROBE_DECLARED_METADATA_FIELDS_MATCH',
    `${policy.fields.length} declared metadata field policy item(s) match`,
    undefined,
    evidence,
  );
}

function matchTracksForDeclaredFields(
  measured: readonly NormalizedTrack[],
  golden: readonly NormalizedTrack[],
): DeclaredTrackPair[] {
  const unused = new Set(measured.map((_, index) => index));
  const pairs: DeclaredTrackPair[] = [];
  for (let goldenIndex = 0; goldenIndex < golden.length; goldenIndex++) {
    const expected = golden[goldenIndex]!;
    const candidates = [...unused]
      .map((measuredIndex) => ({
        measuredIndex,
        track: measured[measuredIndex]!,
        cost: declaredTrackCost(measured[measuredIndex]!, expected),
      }))
      .filter((candidate) => candidate.track.type === expected.type && candidate.cost < 1_000)
      .sort((a, b) => a.cost - b.cost || a.measuredIndex - b.measuredIndex);
    const selected = candidates[0];
    if (!selected) continue;
    unused.delete(selected.measuredIndex);
    pairs.push({
      measuredIndex: selected.measuredIndex,
      goldenIndex,
      measured: selected.track,
      golden: expected,
    });
  }
  return pairs;
}

function declaredTrackCost(measured: NormalizedTrack, golden: NormalizedTrack): number {
  if (measured.type !== golden.type) return 10_000;
  if (canonicalCodec(measured.codec) !== canonicalCodec(golden.codec)) return 1_000;
  let cost = 0;
  for (const key of ['width', 'height', 'sampleRate', 'channels'] as const) {
    if (golden[key] != null && measured[key] !== golden[key]) cost += 10;
  }
  if (golden.language != null && measured.language != null && normalizeLanguage(golden.language) !== normalizeLanguage(measured.language)) {
    cost += 2;
  }
  return cost;
}

function canonicalCodec(value: string): string {
  return canonicalCodecToken(value) ?? value.trim().toLowerCase();
}

function canonicalRotation(value: number): number {
  const normalized = ((value % 360) + 360) % 360;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function normalizeLanguage(value: string): string {
  return value.trim().toLowerCase().replaceAll('_', '-');
}

function normalizeProtectionScheme(value: string): string {
  const normalized = value.trim().toLowerCase().replaceAll('_', '-');
  if (normalized === 'cenc-ctr' || normalized === 'aes-ctr') return 'cenc';
  if (normalized === 'aes-128' || normalized === 'hls-aes-128') return 'hls-aes128';
  return normalized;
}

function protectionSchemes(metadata: ProbeMetadataObservation): string[] {
  const values: string[] = [];
  if (typeof metadata.protectionScheme === 'string') values.push(metadata.protectionScheme);
  const top = metadata.protection;
  if (Array.isArray(top)) {
    for (const entry of top) if (entry && typeof entry.scheme === 'string') values.push(entry.scheme);
  } else if (top) {
    const entry = top as ProbeMetadataObservation['protection'] & { scheme?: unknown };
    if (typeof entry.scheme === 'string') values.push(entry.scheme);
  }
  for (const track of metadata.tracks as ProbeMetadataObservation['tracks'] & Array<{ protection?: unknown; protectionScheme?: unknown }>) {
    if (typeof track.protectionScheme === 'string') values.push(track.protectionScheme);
    if (isRecord(track.protection) && typeof track.protection.scheme === 'string') values.push(track.protection.scheme);
  }
  return [...new Set(values.map(normalizeProtectionScheme).filter(Boolean))];
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
