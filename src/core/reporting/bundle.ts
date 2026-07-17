import type { ScenarioResult } from '../scenario.ts';
import { canonicalContentHash, normalizeJson } from './canonical.ts';
import type { AvailableMetricObservation, JsonObject, MetricObservation } from './model.ts';
import {
  BUNDLE_MEASUREMENTS_SCHEMA_ID,
  REPORTING_SCHEMA_VERSION,
  validateBundleMeasurementsArtifactHeader,
} from './schemas.ts';

export interface BundleTool {
  name: string;
  version: string;
}

export interface BundleCompressionDefinition {
  algorithm: string;
  options: JsonObject;
}

export interface BundleMeasurementDefinition {
  bundler: BundleTool;
  runtime: BundleTool;
  target: string;
  treeShake: boolean;
  minify: boolean;
  flags: string[];
  byteUnit: 'byte';
  compression: BundleCompressionDefinition;
}

export interface BundleSourceRecord {
  entry: string;
  imports: string[];
  contentHash: string;
}

interface BundleMeasurementBase {
  engineId: string;
  engineVersion: string;
  aliases: string[];
  source: BundleSourceRecord;
}

export interface MeasuredBundleMeasurement extends BundleMeasurementBase {
  state: 'MEASURED';
  rawBytes: number;
  compressedBytes: number;
  includedFiles: string[];
  excludedRuntimeAssets: string[];
}

export interface UnavailableBundleMeasurement extends BundleMeasurementBase {
  state: 'UNAVAILABLE';
  reasonCode: string;
  reason: string;
}

export type BundleMeasurement = MeasuredBundleMeasurement | UnavailableBundleMeasurement;

export interface BundleMeasurementsArtifact {
  schemaId: string;
  schemaVersion: string;
  artifactId: string;
  contentHash: string;
  measurementDefinition: BundleMeasurementDefinition;
  measurements: BundleMeasurement[];
  evidence: JsonObject;
}

export interface BundleJoinExpectation {
  engineId: string;
  engineVersion: string;
  sourceContentHash: string;
  bundler: BundleTool;
  runtime: BundleTool;
  target: string;
  treeShake: boolean;
  minify: boolean;
  flags: string[];
  compression: BundleCompressionDefinition;
}

export type BundleJoinResult =
  | {
      state: 'JOINED';
      artifactHash: string;
      measurement: MeasuredBundleMeasurement;
      observation: AvailableMetricObservation;
    }
  | {
      state: 'UNAVAILABLE';
      artifactHash: string;
      reasonCode: string;
      reason: string;
      measurement?: BundleMeasurement;
    };

export function parseBundleMeasurementsArtifact(value: unknown): BundleMeasurementsArtifact {
  validateBundleMeasurementsArtifactHeader(value);
  const record = requiredRecord(value, '$');
  const artifactId = requiredString(record.artifactId, '$.artifactId');
  const definition = parseDefinition(record.measurementDefinition, '$.measurementDefinition');
  if (!Array.isArray(record.measurements)) throw new Error('[BUNDLE_ARTIFACT_INVALID] $.measurements must be an array');
  const measurements = record.measurements
    .map((entry, index) => parseMeasurement(entry, `$.measurements[${index}]`))
    .sort((a, b) => a.engineId.localeCompare(b.engineId) || a.engineVersion.localeCompare(b.engineVersion));
  const identities = new Set<string>();
  for (const measurement of measurements) {
    const identity = `${measurement.engineId}\u0000${measurement.engineVersion}`;
    if (identities.has(identity)) throw new Error(`[BUNDLE_MEASUREMENT_DUPLICATE] ${identity}`);
    identities.add(identity);
  }
  const content = {
    schemaId: record.schemaId,
    schemaVersion: record.schemaVersion,
    artifactId,
    measurementDefinition: definition,
    measurements,
  };
  const contentHash = canonicalContentHash(content);
  if (record.contentHash !== undefined && record.contentHash !== contentHash) {
    throw new Error(`[BUNDLE_CONTENT_HASH_MISMATCH] expected ${contentHash}, got ${String(record.contentHash)}`);
  }
  return {
    schemaId: requiredString(record.schemaId, '$.schemaId'),
    schemaVersion: requiredString(record.schemaVersion, '$.schemaVersion'),
    artifactId,
    contentHash,
    measurementDefinition: definition,
    measurements,
    evidence: normalizeJson(record) as JsonObject,
  };
}

export function createBundleMeasurementsArtifact(input: {
  artifactId: string;
  measurementDefinition: BundleMeasurementDefinition;
  measurements: BundleMeasurement[];
}): BundleMeasurementsArtifact {
  const base = {
    schemaId: BUNDLE_MEASUREMENTS_SCHEMA_ID,
    schemaVersion: REPORTING_SCHEMA_VERSION,
    artifactId: input.artifactId,
    measurementDefinition: input.measurementDefinition,
    measurements: input.measurements,
  };
  return parseBundleMeasurementsArtifact(base);
}

export function joinBundleMeasurement(
  artifact: BundleMeasurementsArtifact,
  expectation: BundleJoinExpectation,
): BundleJoinResult {
  const exact = artifact.measurements.filter((measurement) =>
    measurement.engineId === expectation.engineId && measurement.engineVersion === expectation.engineVersion);
  let measurement: BundleMeasurement | undefined;
  if (exact.length === 1) {
    measurement = exact[0];
  } else if (exact.length > 1) {
    return unavailableJoin(artifact, 'AMBIGUOUS_EXACT_ENGINE', 'multiple exact engine records match');
  } else {
    const aliases = artifact.measurements.filter((candidate) =>
      candidate.engineVersion === expectation.engineVersion && candidate.aliases.includes(expectation.engineId));
    if (aliases.length > 1) {
      return unavailableJoin(
        artifact,
        'AMBIGUOUS_ENGINE_ALIAS',
        `${expectation.engineId} is declared by ${aliases.map((candidate) => candidate.engineId).join(', ')}`,
      );
    }
    measurement = aliases[0];
  }
  if (!measurement) return unavailableJoin(artifact, 'BUNDLE_MEASUREMENT_MISSING', 'no exact or declared alias record');
  if (measurement.state === 'UNAVAILABLE') {
    return unavailableJoin(artifact, measurement.reasonCode, measurement.reason, measurement);
  }
  if (measurement.source.contentHash !== expectation.sourceContentHash) {
    return unavailableJoin(
      artifact,
      'STALE_SOURCE_HASH',
      `measured ${measurement.source.contentHash}; current source is ${expectation.sourceContentHash}`,
      measurement,
    );
  }
  const definition = artifact.measurementDefinition;
  const definitionMismatch = firstDefinitionMismatch(definition, expectation);
  if (definitionMismatch) {
    return unavailableJoin(artifact, 'BUNDLE_TOOLCHAIN_MISMATCH', definitionMismatch, measurement);
  }
  const value = measurement.compressedBytes;
  const observation: AvailableMetricObservation = {
    state: 'AVAILABLE',
    metric: 'bundleSize',
    unit: 'byte',
    direction: 'lower',
    sampleAxis: 'iteration',
    aggregation: 'median',
    n: 1,
    warmup: 0,
    requestedIterations: 1,
    samples: [value],
    median: value,
    p95: value,
    mad: 0,
    rankedValue: value,
    validVariantIds: [measurement.engineId],
    empiricalNoisePct: 0,
    confidenceInterval: { low: value, high: value, confidence: 1, method: 'deterministic build output' },
  };
  return { state: 'JOINED', artifactHash: artifact.contentHash, measurement, observation };
}

/**
 * Pure compatibility adapter for the performance/bundle-size ScenarioResult. Missing or stale records
 * replace the legacy n=0 zero with an explicit unavailable measurement marker; source results are cloned.
 */
export function applyBundleArtifactToResults(
  results: readonly ScenarioResult[],
  artifact: BundleMeasurementsArtifact,
  expectationForResult: (result: ScenarioResult) => BundleJoinExpectation | undefined,
): { results: ScenarioResult[]; joins: Record<string, BundleJoinResult> } {
  const joins: Record<string, BundleJoinResult> = {};
  const cloned = results.map((result) => {
    if (result.scenarioId !== 'performance/bundle-size') return result;
    const expectation = expectationForResult(result);
    const key = `${result.engineId}\u0000${result.browser}\u0000${result.scenarioId}`;
    if (!expectation) {
      joins[key] = unavailableJoin(
        artifact,
        'BUNDLE_JOIN_EXPECTATION_MISSING',
        'current source/toolchain provenance was not supplied; stale measurements cannot be joined safely',
      );
      return removeLegacyBundleZero(result, joins[key]!);
    }
    const joined = joinBundleMeasurement(artifact, expectation);
    joins[key] = joined;
    if (joined.state === 'UNAVAILABLE') return removeLegacyBundleZero(result, joined);
    const value = joined.observation.rankedValue;
    return {
      ...result,
      primaryMetric: 'bundleSize' as const,
      bench: {
        ...(result.bench ?? {}),
        bundleSize: {
          n: 1,
          warmup: 0,
          metric: 'bundleSize' as const,
          median: value,
          p95: value,
          mad: 0,
          unit: 'byte',
          samples: [value],
        },
      },
      bundleMeasurement: {
        artifactHash: artifact.contentHash,
        measurement: joined.measurement,
      },
    } as ScenarioResult;
  });
  return { results: cloned, joins };
}

export function bundleJoinMetric(result: BundleJoinResult): MetricObservation {
  return result.state === 'JOINED'
    ? result.observation
    : {
        state: 'UNAVAILABLE',
        metric: 'bundleSize',
        unit: 'byte',
        direction: 'lower',
        reasonCode: result.reasonCode,
        reason: result.reason,
      };
}

function removeLegacyBundleZero(result: ScenarioResult, joined: Extract<BundleJoinResult, { state: 'UNAVAILABLE' }>): ScenarioResult {
  const bench = { ...(result.bench ?? {}) };
  delete bench.bundleSize;
  return {
    ...result,
    ...(Object.keys(bench).length > 0 ? { bench } : { bench: undefined }),
    measurement: { state: 'UNAVAILABLE', reasonCode: joined.reasonCode, detail: joined.reason },
    bundleMeasurement: { artifactHash: joined.artifactHash, state: 'UNAVAILABLE', reasonCode: joined.reasonCode, reason: joined.reason },
  } as ScenarioResult;
}

function parseDefinition(value: unknown, path: string): BundleMeasurementDefinition {
  const record = requiredRecord(value, path);
  const flags = stringArray(record.flags ?? [], `${path}.flags`);
  const compression = requiredRecord(record.compression, `${path}.compression`);
  const options = requiredRecord(compression.options ?? {}, `${path}.compression.options`);
  if (record.byteUnit !== 'byte') throw new Error(`[BUNDLE_ARTIFACT_INVALID] ${path}.byteUnit must be "byte"`);
  return {
    bundler: parseTool(record.bundler, `${path}.bundler`),
    runtime: parseTool(record.runtime, `${path}.runtime`),
    target: requiredString(record.target, `${path}.target`),
    treeShake: requiredBoolean(record.treeShake, `${path}.treeShake`),
    minify: requiredBoolean(record.minify, `${path}.minify`),
    flags: [...new Set(flags)].sort(),
    byteUnit: 'byte',
    compression: {
      algorithm: requiredString(compression.algorithm, `${path}.compression.algorithm`),
      options: normalizeJson(options) as JsonObject,
    },
  };
}

function parseMeasurement(value: unknown, path: string): BundleMeasurement {
  const record = requiredRecord(value, path);
  const base: BundleMeasurementBase = {
    engineId: requiredString(record.engineId, `${path}.engineId`),
    engineVersion: requiredString(record.engineVersion, `${path}.engineVersion`),
    aliases: [...new Set(stringArray(record.aliases ?? [], `${path}.aliases`))].sort(),
    source: parseSource(record.source, `${path}.source`),
  };
  if (record.state === 'MEASURED') {
    return {
      ...base,
      state: 'MEASURED',
      rawBytes: nonNegativeInteger(record.rawBytes, `${path}.rawBytes`),
      compressedBytes: nonNegativeInteger(record.compressedBytes, `${path}.compressedBytes`),
      includedFiles: [...new Set(stringArray(record.includedFiles, `${path}.includedFiles`))].sort(),
      excludedRuntimeAssets: [...new Set(stringArray(record.excludedRuntimeAssets, `${path}.excludedRuntimeAssets`))].sort(),
    };
  }
  if (record.state === 'UNAVAILABLE') {
    if (record.rawBytes !== undefined || record.compressedBytes !== undefined) {
      throw new Error(`[BUNDLE_ARTIFACT_INVALID] ${path}: unavailable measurement cannot contain byte statistics`);
    }
    return {
      ...base,
      state: 'UNAVAILABLE',
      reasonCode: requiredString(record.reasonCode, `${path}.reasonCode`),
      reason: requiredString(record.reason, `${path}.reason`),
    };
  }
  throw new Error(`[BUNDLE_ARTIFACT_INVALID] ${path}.state must be MEASURED or UNAVAILABLE`);
}

function parseSource(value: unknown, path: string): BundleSourceRecord {
  const record = requiredRecord(value, path);
  return {
    entry: requiredString(record.entry, `${path}.entry`),
    imports: [...new Set(stringArray(record.imports, `${path}.imports`))].sort(),
    contentHash: requiredString(record.contentHash, `${path}.contentHash`),
  };
}

function parseTool(value: unknown, path: string): BundleTool {
  const record = requiredRecord(value, path);
  return { name: requiredString(record.name, `${path}.name`), version: requiredString(record.version, `${path}.version`) };
}

function firstDefinitionMismatch(
  definition: BundleMeasurementDefinition,
  expectation: BundleJoinExpectation,
): string | undefined {
  const checks: Array<[string, unknown, unknown]> = [
    ['bundler', definition.bundler, expectation.bundler],
    ['runtime', definition.runtime, expectation.runtime],
    ['target', definition.target, expectation.target],
    ['treeShake', definition.treeShake, expectation.treeShake],
    ['minify', definition.minify, expectation.minify],
    ['flags', definition.flags, [...expectation.flags].sort()],
    ['compression', definition.compression, expectation.compression],
  ];
  const mismatch = checks.find(([, actual, wanted]) => canonicalContentHash(actual) !== canonicalContentHash(wanted));
  return mismatch ? `${mismatch[0]} differs from the validated current build definition` : undefined;
}

function unavailableJoin(
  artifact: BundleMeasurementsArtifact,
  reasonCode: string,
  reason: string,
  measurement?: BundleMeasurement,
): Extract<BundleJoinResult, { state: 'UNAVAILABLE' }> {
  return {
    state: 'UNAVAILABLE',
    artifactHash: artifact.contentHash,
    reasonCode,
    reason,
    ...(measurement ? { measurement } : {}),
  };
}

function requiredRecord(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`[BUNDLE_ARTIFACT_INVALID] ${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`[BUNDLE_ARTIFACT_INVALID] ${path} must be a non-empty string`);
  return value;
}

function requiredBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`[BUNDLE_ARTIFACT_INVALID] ${path} must be boolean`);
  return value;
}

function stringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw new Error(`[BUNDLE_ARTIFACT_INVALID] ${path} must be a string array`);
  }
  return value.slice();
}

function nonNegativeInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`[BUNDLE_ARTIFACT_INVALID] ${path} must be a non-negative integer`);
  return value as number;
}
