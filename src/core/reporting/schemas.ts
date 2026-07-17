import type { ScenarioResult } from '../scenario.ts';
import { canonicalContentHash, normalizeJson } from './canonical.ts';
import type { ExpectedMatrixDefinition, JsonObject, JsonValue } from './model.ts';

export type ArtifactKind = 'raw-run' | 'normalized-observations' | 'report' | 'bundle-measurements';

export const REPORTING_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema' as const;
export const REPORTING_SCHEMA_VERSION = '1.0.0' as const;
export const REPORTING_SCHEMA_MAJOR = 1 as const;
export const REPORTING_SCHEMA_ROOT = 'https://aibrush.dev/schemas/media-test' as const;

export const RAW_RUN_SCHEMA_ID = `${REPORTING_SCHEMA_ROOT}/raw-run/${REPORTING_SCHEMA_VERSION}` as const;
export const NORMALIZED_OBSERVATIONS_SCHEMA_ID =
  `${REPORTING_SCHEMA_ROOT}/normalized-observations/${REPORTING_SCHEMA_VERSION}` as const;
export const REPORT_SCHEMA_ID = `${REPORTING_SCHEMA_ROOT}/report/${REPORTING_SCHEMA_VERSION}` as const;
export const BUNDLE_MEASUREMENTS_SCHEMA_ID =
  `${REPORTING_SCHEMA_ROOT}/bundle-measurements/${REPORTING_SCHEMA_VERSION}` as const;

const SCHEMA_BASES: Record<ArtifactKind, string> = {
  'raw-run': `${REPORTING_SCHEMA_ROOT}/raw-run`,
  'normalized-observations': `${REPORTING_SCHEMA_ROOT}/normalized-observations`,
  report: `${REPORTING_SCHEMA_ROOT}/report`,
  'bundle-measurements': `${REPORTING_SCHEMA_ROOT}/bundle-measurements`,
};

export interface ArtifactHeader {
  schemaId: string;
  schemaVersion: string;
}

export interface RawRunArtifact extends ArtifactHeader {
  runId: string;
  suiteVersion: string;
  generatedAtIso: string;
  results: ScenarioResult[];
  expected?: ExpectedMatrixDefinition;
  env?: JsonValue;
  support?: JsonValue;
  launcher?: JsonValue;
  /** Original validated envelope, including additive known-major fields. */
  evidence: JsonObject;
}

export class ArtifactValidationError extends Error {
  readonly code:
    | 'ARTIFACT_NOT_OBJECT'
    | 'SCHEMA_ID_MISSING'
    | 'SCHEMA_ID_MISMATCH'
    | 'SCHEMA_VERSION_INVALID'
    | 'SCHEMA_MAJOR_UNSUPPORTED'
    | 'ARTIFACT_INVALID';
  readonly path: string;

  constructor(code: ArtifactValidationError['code'], message: string, path = '$') {
    super(`[${code}] ${path}: ${message}`);
    this.name = 'ArtifactValidationError';
    this.code = code;
    this.path = path;
  }
}

export function schemaIdFor(kind: ArtifactKind, version: string = REPORTING_SCHEMA_VERSION): string {
  return `${SCHEMA_BASES[kind]}/${version}`;
}

/** Validate schema identity/version before any artifact-specific field is consumed. */
export function validateArtifactHeader(value: unknown, kind: ArtifactKind): ArtifactHeader {
  const record = asRecord(value, '$');
  const schemaId = requiredString(record.schemaId, '$.schemaId');
  const schemaVersion = requiredString(record.schemaVersion, '$.schemaVersion');
  const parsed = parseSemanticVersion(schemaVersion);
  if (parsed.major !== REPORTING_SCHEMA_MAJOR) {
    throw new ArtifactValidationError(
      'SCHEMA_MAJOR_UNSUPPORTED',
      `unsupported ${kind} schema major ${parsed.major}; supported major is ${REPORTING_SCHEMA_MAJOR}`,
      '$.schemaVersion',
    );
  }
  const expected = schemaIdFor(kind, schemaVersion);
  if (schemaId !== expected) {
    throw new ArtifactValidationError(
      'SCHEMA_ID_MISMATCH',
      `schemaId must be ${JSON.stringify(expected)} for schemaVersion ${schemaVersion}`,
      '$.schemaId',
    );
  }
  return { schemaId, schemaVersion };
}

/**
 * Validate a browser/launcher raw-run artifact. The old explicit results@1 tag is migrated at this
 * boundary; untagged arrays/objects are rejected instead of being guessed from shape.
 */
export function parseRawRunArtifact(value: unknown): RawRunArtifact {
  const record = asRecord(value, '$');
  const legacy = record.schema === 'media-browser-test/results@1';
  let schemaId: string;
  let schemaVersion: string;
  if (legacy) {
    schemaVersion = REPORTING_SCHEMA_VERSION;
    schemaId = RAW_RUN_SCHEMA_ID;
  } else {
    ({ schemaId, schemaVersion } = validateArtifactHeader(record, 'raw-run'));
  }

  if (!Array.isArray(record.results)) {
    throw new ArtifactValidationError('ARTIFACT_INVALID', 'results must be an array', '$.results');
  }
  const results = record.results.map((result, index) => validateScenarioResult(result, `$.results[${index}]`));
  const generatedAtIso = requiredIsoTimestamp(record.generatedAtIso, '$.generatedAtIso');
  const suiteVersion = legacy
    ? optionalString(record.suiteVersion)
      ?? firstSuiteVersion(results)
      ?? optionalString(asOptionalRecord(record.env)?.suiteVersion)
      ?? 'unknown'
    : requiredString(record.suiteVersion, '$.suiteVersion');
  const expected = record.expected === undefined ? undefined : validateExpectedMatrix(record.expected, '$.expected');
  const evidence = normalizeJson(record) as JsonObject;
  const runId = legacy
    ? optionalString(record.runId) ?? `run-${canonicalContentHash({
        suiteVersion,
        env: record.env ?? null,
        support: record.support ?? null,
        launcher: record.launcher ?? null,
        expected: expected ?? null,
        results,
      })}`
    : requiredString(record.runId, '$.runId');

  return {
    schemaId,
    schemaVersion,
    runId,
    suiteVersion,
    generatedAtIso,
    results,
    ...(expected ? { expected } : {}),
    ...(record.env !== undefined ? { env: normalizeJson(record.env) } : {}),
    ...(record.support !== undefined ? { support: normalizeJson(record.support) } : {}),
    ...(record.launcher !== undefined ? { launcher: normalizeJson(record.launcher) } : {}),
    evidence,
  };
}

/** Artifact writers call this after construction; additive known-major fields remain permitted. */
export function validateReportArtifact(value: unknown): void {
  const record = asRecord(value, '$');
  validateArtifactHeader(record, 'report');
  const contentHash = requiredString(record.contentHash, '$.contentHash');
  if (!/^[0-9a-f]{64}$/.test(contentHash)) {
    throw new ArtifactValidationError('ARTIFACT_INVALID', 'expected a lowercase SHA-256 hex digest', '$.contentHash');
  }
  const envelope = asRecord(record.envelope, '$.envelope');
  requiredIsoTimestamp(envelope.generatedAtIso, '$.envelope.generatedAtIso');
  if (!Array.isArray(record.observations)) {
    throw new ArtifactValidationError('ARTIFACT_INVALID', 'observations must be an array', '$.observations');
  }
  if (!Array.isArray(record.cohorts)) {
    throw new ArtifactValidationError('ARTIFACT_INVALID', 'cohorts must be an array', '$.cohorts');
  }
  normalizeJson(record);
  const canonicalData = { ...record };
  delete canonicalData.contentHash;
  delete canonicalData.envelope;
  const expectedHash = canonicalContentHash(canonicalData);
  if (contentHash !== expectedHash) {
    throw new ArtifactValidationError(
      'ARTIFACT_INVALID',
      `contentHash mismatch; expected ${expectedHash}`,
      '$.contentHash',
    );
  }
}

export function validateNormalizedObservationsArtifact(value: unknown): void {
  const record = asRecord(value, '$');
  validateArtifactHeader(record, 'normalized-observations');
  if (!Array.isArray(record.observations)) {
    throw new ArtifactValidationError('ARTIFACT_INVALID', 'observations must be an array', '$.observations');
  }
  normalizeJson(record);
}

export function validateBundleMeasurementsArtifactHeader(value: unknown): ArtifactHeader {
  return validateArtifactHeader(value, 'bundle-measurements');
}

export function parseSemanticVersion(value: string): { major: number; minor: number; patch: number } {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(value);
  if (!match) {
    throw new ArtifactValidationError(
      'SCHEMA_VERSION_INVALID',
      `expected semantic version, got ${JSON.stringify(value)}`,
      '$.schemaVersion',
    );
  }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function validateScenarioResult(value: unknown, path: string): ScenarioResult {
  const record = asRecord(value, path);
  requiredString(record.engineId, `${path}.engineId`);
  requiredString(record.browser, `${path}.browser`);
  requiredString(record.scenarioId, `${path}.scenarioId`);
  requiredString(record.family, `${path}.family`);
  const status = requiredString(record.status, `${path}.status`);
  if (!RESULT_STATUSES.has(status)) {
    throw new ArtifactValidationError('ARTIFACT_INVALID', `unknown status ${JSON.stringify(status)}`, `${path}.status`);
  }
  if (!Array.isArray(record.oracleOutcomes)) {
    throw new ArtifactValidationError('ARTIFACT_INVALID', 'oracleOutcomes must be an array', `${path}.oracleOutcomes`);
  }
  normalizeJson(record, path);
  return value as ScenarioResult;
}

function validateExpectedMatrix(value: unknown, path: string): ExpectedMatrixDefinition {
  const record = asRecord(value, path);
  const definitionId = requiredString(record.definitionId, `${path}.definitionId`);
  if (!Array.isArray(record.cells)) {
    throw new ArtifactValidationError('ARTIFACT_INVALID', 'cells must be an array', `${path}.cells`);
  }
  if (record.cells.length === 0) {
    throw new ArtifactValidationError('ARTIFACT_INVALID', 'cells must not be empty', `${path}.cells`);
  }
  for (let index = 0; index < record.cells.length; index++) {
    const cellPath = `${path}.cells[${index}]`;
    const cell = asRecord(record.cells[index], cellPath);
    requiredString(cell.engineId, `${cellPath}.engineId`);
    requiredString(cell.browser, `${cellPath}.browser`);
    requiredString(cell.scenarioId, `${cellPath}.scenarioId`);
    requiredString(cell.family, `${cellPath}.family`);
    if (!Array.isArray(cell.variants)) {
      throw new ArtifactValidationError('ARTIFACT_INVALID', 'variants must be an array', `${cellPath}.variants`);
    }
    if (cell.variants.length === 0) {
      throw new ArtifactValidationError('ARTIFACT_INVALID', 'variants must not be empty', `${cellPath}.variants`);
    }
    for (let v = 0; v < cell.variants.length; v++) {
      const variant = asRecord(cell.variants[v], `${cellPath}.variants[${v}]`);
      requiredString(variant.variantId, `${cellPath}.variants[${v}].variantId`);
      requiredString(variant.file, `${cellPath}.variants[${v}].file`);
    }
  }
  normalizeJson(record, path);
  return { definitionId, cells: record.cells as unknown as ExpectedMatrixDefinition['cells'] };
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ArtifactValidationError('ARTIFACT_NOT_OBJECT', 'expected an object', path);
  }
  return value as Record<string, unknown>;
}

function asOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ArtifactValidationError('ARTIFACT_INVALID', 'expected a non-empty string', path);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function requiredIsoTimestamp(value: unknown, path: string): string {
  const text = requiredString(value, path);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(text)) {
    throw new ArtifactValidationError('ARTIFACT_INVALID', 'expected an ISO 8601 date-time', path);
  }
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) {
    throw new ArtifactValidationError('ARTIFACT_INVALID', 'expected an ISO timestamp', path);
  }
  return text;
}

function firstSuiteVersion(results: readonly ScenarioResult[]): string | undefined {
  return results.find((result) => result.env?.suiteVersion)?.env?.suiteVersion;
}

const RESULT_STATUSES = new Set([
  'PASS',
  'FAIL',
  'NA_ENGINE',
  'NA_BROWSER',
  'NA_ASSET',
  'ERROR',
  'SKIPPED',
]);
