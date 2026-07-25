/** Runtime results@2 validation, v1 migration, and trust-boundary parsing. */

import { canonicalJsonSha256 } from './canonical-json.ts';
import { reduceExhaustiveStatuses, reduceOracleOutcomes } from './scenario.ts';
import type {
  ExhaustiveCoverage,
  ExhaustiveFileResult,
  MeasurementAvailability,
  MetricId,
  OracleId,
  OracleOutcome,
  ResultSelection,
  ResultStatus,
  ScenarioExecutionFingerprint,
  ScenarioInstance,
  ScenarioOperationEvidence,
  ScenarioResult,
} from './scenario.ts';

export const RESULTS_V2_SCHEMA_ID = 'media-browser-test/results@2' as const;
export const SCENARIO_RESULT_V2_SCHEMA_ID = 'media-browser-test/scenario-result@2' as const;

export type OracleOutcomeV2 =
  | (Extract<OracleOutcome, { state: 'VERDICT' }> & { reasonCode: string })
  | Extract<OracleOutcome, { state: 'UNAVAILABLE' | 'ERROR' }>;

export interface ScenarioResultV2 extends ScenarioResult {
  schemaVersion: 2;
  scenarioRevision: number;
  definitionHash: string;
  instance: ScenarioInstance;
  oracleOutcomes: OracleOutcomeV2[];
}

export interface ResultsEnvelopeV2 {
  schema: typeof RESULTS_V2_SCHEMA_ID;
  generatedAtIso: string;
  env?: unknown;
  support?: unknown;
  results: ScenarioResultV2[];
  migration?: {
    from: 'media-browser-test/results@1';
    missingInputDigests: number;
  };
}

export interface ResultSchemaDiagnostic {
  path: string;
  code: string;
  message: string;
}

export class ResultSchemaError extends Error {
  readonly diagnostics: readonly ResultSchemaDiagnostic[];

  constructor(diagnostics: readonly ResultSchemaDiagnostic[]) {
    const first = diagnostics[0] ?? { path: '$', code: 'RESULT_INVALID', message: 'invalid result' };
    super(`${first.path} [${first.code}]: ${first.message}` +
      (diagnostics.length > 1 ? ` (+${diagnostics.length - 1} more diagnostics)` : ''));
    this.name = 'ResultSchemaError';
    this.diagnostics = diagnostics.map((entry) => ({ ...entry }));
  }
}

export interface V1MigrationContext {
  scenarioIdentity?: (scenarioId: string) => { revision: number; definitionHash: string } | undefined;
  inputIdentity?: (
    result: Readonly<Record<string, unknown>>,
  ) => { inputVariantId: string; inputSha256: string } | undefined;
}

/** Accept v2 directly, migrate v1 explicitly, and reject every unknown major before consumption. */
export function readResultsEnvelope(
  value: unknown,
  migrationContext: V1MigrationContext = {},
): ResultsEnvelopeV2 {
  if (!isRecord(value) || typeof value.schema !== 'string') {
    throw new ResultSchemaError([{ path: '$.schema', code: 'RESULT_SCHEMA', message: 'missing result envelope schema' }]);
  }
  if (value.schema === RESULTS_V2_SCHEMA_ID) return parseResultsEnvelopeV2(value);
  if (value.schema === 'media-browser-test/results@1') {
    return migrateResultsEnvelopeV1(value, migrationContext);
  }
  throw new ResultSchemaError([{
    path: '$.schema', code: 'RESULT_SCHEMA_UNKNOWN',
    message: `unsupported result schema '${value.schema}'`,
  }]);
}

export function parseResultsEnvelopeV2(value: unknown): ResultsEnvelopeV2 {
  const diagnostics = validateResultsEnvelopeV2(value);
  if (diagnostics.length > 0) throw new ResultSchemaError(diagnostics);
  return deepFreeze(cloneJson(value)) as ResultsEnvelopeV2;
}

export function validateResultsEnvelopeV2(value: unknown): ResultSchemaDiagnostic[] {
  const diagnostics: ResultSchemaDiagnostic[] = [];
  const add = diagnosticAppender(diagnostics);
  if (!isRecord(value)) {
    add('$', 'RESULT_ENVELOPE_TYPE', 'must be a plain JSON object');
    return diagnostics;
  }
  rejectUnknown(value, ENVELOPE_KEYS, '$', add);
  if (value.schema !== RESULTS_V2_SCHEMA_ID) {
    add('$.schema', 'RESULT_SCHEMA', `must equal '${RESULTS_V2_SCHEMA_ID}'`);
  }
  if (typeof value.generatedAtIso !== 'string' || !isIsoInstant(value.generatedAtIso)) {
    add('$.generatedAtIso', 'RESULT_GENERATED_AT', 'must be an ISO timestamp');
  }
  if (!Array.isArray(value.results)) {
    add('$.results', 'RESULTS_ARRAY', 'must be an array');
  } else {
    value.results.forEach((result, index) => {
      for (const diagnostic of validateScenarioResultV2(result)) {
        diagnostics.push({ ...diagnostic, path: `$.results[${index}]${stripRoot(diagnostic.path)}` });
      }
    });
  }
  if (value.migration !== undefined) validateMigrationEvidence(value.migration, '$.migration', add);
  validateJson(value.env, '$.env', add);
  validateJson(value.support, '$.support', add);
  return diagnostics;
}

export function parseScenarioResultV2(value: unknown): ScenarioResultV2 {
  const diagnostics = validateScenarioResultV2(value);
  if (diagnostics.length > 0) throw new ResultSchemaError(diagnostics);
  return deepFreeze(cloneJson(value)) as ScenarioResultV2;
}

export function validateScenarioResultV2(value: unknown): ResultSchemaDiagnostic[] {
  const diagnostics: ResultSchemaDiagnostic[] = [];
  const add = diagnosticAppender(diagnostics);
  if (!isRecord(value)) {
    add('$', 'SCENARIO_RESULT_TYPE', 'must be a plain JSON object');
    return diagnostics;
  }
  rejectUnknown(value, RESULT_KEYS, '$', add);
  if (value.schemaVersion !== 2) add('$.schemaVersion', 'SCENARIO_RESULT_VERSION', 'must equal 2');
  requiredString(value.engineId, '$.engineId', add);
  optionalString(value.engineVersion, '$.engineVersion', add);
  if (!BROWSERS.has(value.browser as string)) add('$.browser', 'RESULT_BROWSER', 'must name a supported browser family');
  requiredString(value.scenarioId, '$.scenarioId', add);
  if (!Number.isSafeInteger(value.scenarioRevision) || (value.scenarioRevision as number) < 1) {
    add('$.scenarioRevision', 'RESULT_SCENARIO_REVISION', 'must be a positive safe integer');
  }
  if (typeof value.definitionHash !== 'string' || !DEFINITION_HASH_PATTERN.test(value.definitionHash)) {
    add('$.definitionHash', 'RESULT_DEFINITION_HASH', 'must be a native or legacy canonical definition hash');
  }
  optionalString(value.inputVariantId, '$.inputVariantId', add);
  if (value.inputSha256 !== undefined &&
      (typeof value.inputSha256 !== 'string' || !SHA256_PATTERN.test(value.inputSha256))) {
    add('$.inputSha256', 'RESULT_INPUT_SHA256', 'must be a SHA-256 digest');
  }
  if (!FAMILIES.has(value.family as string)) add('$.family', 'RESULT_FAMILY', 'must name a scenario family');
  if (!STATUSES.has(value.status as ResultStatus)) add('$.status', 'RESULT_STATUS', 'must name a closed result status');
  optionalString(value.reason, '$.reason', add);
  validateScenarioInstance(value.instance, value, '$.instance', add);
  if (isRecord(value.instance)) {
    if (value.inputVariantId !== undefined && value.inputVariantId !== value.instance.inputVariantId) {
      add('$.inputVariantId', 'RESULT_INPUT_VARIANT_MISMATCH', 'must equal instance.inputVariantId');
    }
    if (value.inputSha256 !== undefined && value.inputSha256 !== value.instance.inputSha256) {
      add('$.inputSha256', 'RESULT_INPUT_SHA256_MISMATCH', 'must equal instance.inputSha256');
    }
  }
  validateOutcomes(value.oracleOutcomes, '$.oracleOutcomes', add);
  validateStatusConsistency(value, add);
  validateBench(value.bench, value.status as ResultStatus, '$.bench', add);
  validateMeasurement(value.measurement, value.status as ResultStatus, '$.measurement', add);
  validateSupport(value.support, '$.support', add);
  if (value.operationEvidence !== undefined) {
    validateScenarioOperationEvidence(value.operationEvidence, '$.operationEvidence', add);
  }
  validateCandidateEvidence(value.candidateEvidence, '$.candidateEvidence', add);
  validateCacheReuse(value.cacheReuse, '$.cacheReuse', add);
  validateFingerprint(value.executionFingerprint, '$.executionFingerprint', add);
  validateJson(value.bundleMeasurement, '$.bundleMeasurement', add);
  validateJson(value.decodeProvenance, '$.decodeProvenance', add);
  if (value.primaryMetric !== undefined && !METRICS.has(value.primaryMetric as MetricId)) {
    add('$.primaryMetric', 'RESULT_PRIMARY_METRIC', 'must name a known metric');
  }
  validateSelection(value.selection, '$.selection', add);
  validateExhaustive(value.exhaustive, '$.exhaustive', add);
  validateCoverage(value.coverage, value.exhaustive, '$.coverage', add);
  if ((value.exhaustive === undefined) !== (value.coverage === undefined)) {
    add('$', 'EXHAUSTIVE_COVERAGE_PAIR', 'exhaustive and coverage must either both be present or both be absent');
  }
  validateRunEnv(value.env, '$.env', add);
  if (value.startedAtIso !== undefined &&
      (typeof value.startedAtIso !== 'string' || !isIsoInstant(value.startedAtIso))) {
    add('$.startedAtIso', 'RESULT_STARTED_AT', 'must be an ISO timestamp');
  }
  if (value.durationMs !== undefined && !nonNegativeFinite(value.durationMs)) {
    add('$.durationMs', 'RESULT_DURATION', 'must be a finite non-negative number');
  }
  return diagnostics;
}

export function migrateResultsEnvelopeV1(
  value: unknown,
  context: V1MigrationContext = {},
): ResultsEnvelopeV2 {
  if (!isRecord(value) || value.schema !== 'media-browser-test/results@1' || !Array.isArray(value.results)) {
    throw new ResultSchemaError([{
      path: '$', code: 'V1_RESULT_ENVELOPE',
      message: "expected a 'media-browser-test/results@1' envelope with results[]",
    }]);
  }
  let missingInputDigests = 0;
  const results = value.results.map((entry, index) => {
    const migrated = migrateScenarioResultV1(entry, context);
    if (migrated.instance.inputSha256 === null) missingInputDigests++;
    try {
      return parseScenarioResultV2(migrated);
    } catch (error) {
      if (error instanceof ResultSchemaError) {
        throw new ResultSchemaError(error.diagnostics.map((diagnostic) => ({
          ...diagnostic,
          path: `$.results[${index}]${stripRoot(diagnostic.path)}`,
        })));
      }
      throw error;
    }
  });
  return deepFreeze({
    schema: RESULTS_V2_SCHEMA_ID,
    generatedAtIso: typeof value.generatedAtIso === 'string' && isIsoInstant(value.generatedAtIso)
      ? value.generatedAtIso
      : new Date(0).toISOString(),
    ...(value.env !== undefined ? { env: cloneJson(value.env) } : {}),
    ...(value.support !== undefined ? { support: cloneJson(value.support) } : {}),
    results,
    migration: { from: 'media-browser-test/results@1', missingInputDigests },
  });
}

export function migrateScenarioResultV1(
  value: unknown,
  context: V1MigrationContext = {},
): ScenarioResultV2 {
  if (!isRecord(value)) {
    throw new ResultSchemaError([{ path: '$', code: 'V1_SCENARIO_RESULT', message: 'must be an object' }]);
  }
  const scenarioId = requireLegacyString(value.scenarioId, '$.scenarioId');
  const engineId = requireLegacyString(value.engineId, '$.engineId');
  const browser = requireLegacyString(value.browser, '$.browser');
  const family = typeof value.family === 'string' ? value.family : scenarioId.split('/')[0] ?? '';
  const currentIdentity = context.scenarioIdentity?.(scenarioId);
  const scenarioRevision = validPositiveInteger(value.scenarioRevision)
    ? value.scenarioRevision
    : currentIdentity?.revision ?? 1;
  const definitionHash = typeof value.definitionHash === 'string' && DEFINITION_HASH_PATTERN.test(value.definitionHash)
    ? value.definitionHash
    : currentIdentity?.definitionHash ?? `legacy/${canonicalJsonSha256({ scenarioId, scenarioRevision })}`;
  const providedInput = context.inputIdentity?.(value);
  const selection = isRecord(value.selection) ? value.selection : undefined;
  const inputVariantId = providedInput?.inputVariantId ??
    (typeof value.inputVariantId === 'string' ? value.inputVariantId :
      typeof selection?.file === 'string' ? `legacy:${selection.file}` : 'legacy:baked');
  const inputSha256 = providedInput?.inputSha256 ??
    (typeof value.inputSha256 === 'string' && SHA256_PATTERN.test(value.inputSha256)
      ? value.inputSha256
      : typeof selection?.sha256 === 'string' && SHA256_PATTERN.test(selection.sha256)
        ? selection.sha256
        : null);
  const legacyOutcomes = Array.isArray(value.oracleOutcomes) ? value.oracleOutcomes : [];
  const outcomes = legacyOutcomes.map((outcome, index) => migrateOracleOutcomeV1(outcome, value.status, index));
  const exhaustive = value.exhaustive !== undefined
    ? migrateExhaustiveV1(value.exhaustive, outcomes, value.operationEvidence)
    : undefined;
  const status = exhaustive && exhaustive.length > 0
    ? reduceExhaustiveStatuses(exhaustive.map((entry) => entry.status)).status
    : migrateLegacyStatus(value.status, outcomes);
  const instance: ScenarioInstance = {
    scenarioId,
    scenarioRevision,
    definitionHash,
    inputVariantId,
    inputSha256,
  };
  const result: ScenarioResultV2 = {
    schemaVersion: 2,
    engineId,
    ...(typeof value.engineVersion === 'string'
      ? { engineVersion: value.engineVersion }
      : engineVersionFromId(engineId) ? { engineVersion: engineVersionFromId(engineId) } : {}),
    browser: browser as ScenarioResultV2['browser'],
    scenarioId,
    scenarioRevision,
    definitionHash,
    instance,
    inputVariantId,
    ...(inputSha256 ? { inputSha256 } : {}),
    family: family as ScenarioResultV2['family'],
    status,
    ...(typeof value.reason === 'string' ? { reason: value.reason } : {}),
    oracleOutcomes: outcomes,
    ...((status === 'PASS') && isRecord(value.bench)
      ? { bench: cloneJson(value.bench) as ScenarioResultV2['bench'] }
      : {}),
    ...(value.measurement !== undefined
      ? { measurement: cloneJson(value.measurement) as MeasurementAvailability }
      : {}),
    ...(value.support !== undefined ? { support: cloneJson(value.support) as ScenarioResultV2['support'] } : {}),
    ...(value.operationEvidence !== undefined
      ? { operationEvidence: cloneJson(value.operationEvidence) as ScenarioOperationEvidence }
      : {}),
    ...(validFingerprint(value.executionFingerprint)
      ? { executionFingerprint: cloneJson(value.executionFingerprint) as ScenarioExecutionFingerprint }
      : {}),
    ...(isRecord(value.bundleMeasurement)
      ? { bundleMeasurement: cloneJson(value.bundleMeasurement) as ScenarioResultV2['bundleMeasurement'] }
      : {}),
    ...(typeof value.primaryMetric === 'string' ? { primaryMetric: value.primaryMetric as MetricId } : {}),
    ...(selection ? { selection: cloneJson(selection) as unknown as ResultSelection } : {}),
    ...(exhaustive ? { exhaustive } : {}),
    ...(exhaustive && exhaustive.length > 0
      ? { coverage: reduceExhaustiveStatuses(exhaustive.map((entry) => entry.status)).coverage }
      : {}),
    ...(isRecord(value.env) ? { env: cloneJson(value.env) as unknown as ScenarioResultV2['env'] } : {}),
    ...(typeof value.startedAtIso === 'string' ? { startedAtIso: value.startedAtIso } : {}),
    ...(nonNegativeFinite(value.durationMs) ? { durationMs: value.durationMs } : {}),
  };
  return result;
}

function migrateOracleOutcomeV1(value: unknown, legacyStatus: unknown, index: number): OracleOutcomeV2 {
  if (!isRecord(value) || typeof value.oracle !== 'string') {
    throw new ResultSchemaError([{
      path: `$.oracleOutcomes[${index}]`, code: 'V1_ORACLE_OUTCOME',
      message: 'must contain oracle and boolean pass fields',
    }]);
  }
  const oracle = value.oracle as OracleId;
  const detail = typeof value.detail === 'string' ? value.detail : undefined;
  const measurements = isRecord(value.measurements)
    ? cloneJson(value.measurements) as Record<string, number>
    : undefined;
  if (value.pass === true) {
    return {
      state: 'VERDICT', oracle, verdict: 'PASS', reasonCode: 'LEGACY_V1_PASS',
      ...(detail ? { detail } : {}), ...(measurements ? { measurements } : {}),
    };
  }
  if (value.pass !== false) {
    throw new ResultSchemaError([{
      path: `$.oracleOutcomes[${index}].pass`, code: 'V1_ORACLE_PASS', message: 'must be boolean',
    }]);
  }
  const unavailable = legacyUnavailableStatus(legacyStatus, detail);
  if (unavailable) {
    return {
      state: 'UNAVAILABLE', oracle, status: unavailable,
      reasonCode: unavailable === 'NA_ASSET' ? 'LEGACY_V1_ASSET_UNAVAILABLE' : 'LEGACY_V1_BROWSER_UNAVAILABLE',
      detail: detail ?? 'legacy v1 result proved unavailable evidence',
      ...(measurements ? { measurements } : {}),
    };
  }
  return {
    state: 'VERDICT', oracle, verdict: 'FAIL', reasonCode: 'LEGACY_V1_FALSE_CONSERVATIVE',
    ...(detail ? { detail } : {}), ...(measurements ? { measurements } : {}),
  };
}

function legacyUnavailableStatus(
  legacyStatus: unknown,
  detail: string | undefined,
): 'NA_ASSET' | 'NA_BROWSER' | undefined {
  if (legacyStatus === 'NA_ASSET') return 'NA_ASSET';
  if (legacyStatus === 'NA_BROWSER') return 'NA_BROWSER';
  if (!detail) return undefined;
  const normalized = detail.trim().toLowerCase();
  if (
    normalized.startsWith('golden absent') ||
    normalized.startsWith('golden missing') ||
    normalized.startsWith('packet table unreadable') ||
    normalized.startsWith('asset missing')
  ) return 'NA_ASSET';
  if (
    normalized.startsWith('browser codec unavailable') ||
    normalized.startsWith('webcodecs unavailable')
  ) return 'NA_BROWSER';
  return undefined;
}

function migrateLegacyStatus(status: unknown, outcomes: readonly OracleOutcomeV2[]): ResultStatus {
  if (status === 'NA_ENGINE' || status === 'ERROR' || status === 'SKIPPED') return status;
  if (outcomes.length === 0) {
    if (status === 'NA_BROWSER' || status === 'NA_ASSET') return status;
    return 'ERROR';
  }
  const reduced = reduceOracleOutcomes(outcomes);
  return reduced.status;
}

function migrateExhaustiveV1(
  value: unknown,
  fallbackOutcomes: readonly OracleOutcomeV2[],
  fallbackOperationEvidence: unknown,
): ExhaustiveFileResult[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const row = isRecord(entry) ? entry : {};
    const outcomes = Array.isArray(row.oracleOutcomes)
      ? row.oracleOutcomes.map((outcome, index) => migrateOracleOutcomeV1(outcome, row.status, index))
      : migrateExhaustiveStatusOnlyOutcomes(row.status, fallbackOutcomes);
    const status = migrateLegacyStatus(row.status, outcomes);
    return {
      file: typeof row.file === 'string' ? row.file : '<legacy-unknown>',
      ...(typeof row.sha256 === 'string' ? { sha256: row.sha256 } : {}),
      isBaked: row.isBaked === true,
      status,
      ...(typeof row.reason === 'string' ? { reason: row.reason } : {}),
      oracleOutcomes: [...cloneJson(outcomes)],
      ...(row.measurement !== undefined ? { measurement: cloneJson(row.measurement) as MeasurementAvailability } : {}),
      ...(row.support !== undefined ? { support: cloneJson(row.support) as ScenarioResult['support'] } : {}),
      ...(row.selection !== undefined ? { selection: cloneJson(row.selection) as ResultSelection } : {}),
      ...(row.operationEvidence !== undefined
        ? { operationEvidence: cloneJson(row.operationEvidence) as ScenarioOperationEvidence }
        : fallbackOperationEvidence !== undefined
          ? { operationEvidence: cloneJson(fallbackOperationEvidence) as ScenarioOperationEvidence }
          : {}),
      executed: row.executed !== false,
      ...((status === 'PASS') && isRecord(row.bench)
        ? { bench: cloneJson(row.bench) as ScenarioResult['bench'] }
        : {}),
    };
  });
}

function migrateExhaustiveStatusOnlyOutcomes(
  legacyStatus: unknown,
  fallbackOutcomes: readonly OracleOutcomeV2[],
): OracleOutcomeV2[] {
  if (legacyStatus === 'NA_ENGINE' || legacyStatus === 'SKIPPED') return [];
  const oracle = fallbackOutcomes[0]?.oracle;
  if (!oracle) {
    if (legacyStatus === 'ERROR') return [];
    throw new ResultSchemaError([{
      path: '$.exhaustive[].oracleOutcomes',
      code: 'V1_EXHAUSTIVE_ORACLE_IDENTITY_MISSING',
      message: `cannot migrate legacy exhaustive ${String(legacyStatus)} without an oracle identity`,
    }]);
  }
  if (legacyStatus === 'PASS') {
    return [{ state: 'VERDICT', oracle, verdict: 'PASS', reasonCode: 'LEGACY_V1_EXHAUSTIVE_PASS' }];
  }
  if (legacyStatus === 'FAIL') {
    return [{ state: 'VERDICT', oracle, verdict: 'FAIL', reasonCode: 'LEGACY_V1_EXHAUSTIVE_FAIL' }];
  }
  if (legacyStatus === 'NA_BROWSER' || legacyStatus === 'NA_ASSET') {
    return [{
      state: 'UNAVAILABLE', oracle, status: legacyStatus,
      reasonCode: `LEGACY_V1_EXHAUSTIVE_${legacyStatus}`,
      detail: `legacy exhaustive row was typed ${legacyStatus}`,
    }];
  }
  if (legacyStatus === 'ERROR') {
    return [{
      state: 'ERROR', oracle, reasonCode: 'LEGACY_V1_EXHAUSTIVE_ERROR',
      detail: 'legacy exhaustive row was typed ERROR',
    }];
  }
  throw new ResultSchemaError([{
    path: '$.exhaustive[].status', code: 'V1_EXHAUSTIVE_STATUS',
    message: `unsupported legacy exhaustive status '${String(legacyStatus)}'`,
  }]);
}

function validateScenarioInstance(
  value: unknown,
  result: Record<string, unknown>,
  path: string,
  add: AddDiagnostic,
): void {
  if (!isRecord(value)) {
    add(path, 'SCENARIO_INSTANCE', 'must be a plain object');
    return;
  }
  rejectUnknown(value, INSTANCE_KEYS, path, add);
  requiredString(value.scenarioId, `${path}.scenarioId`, add);
  if (!validPositiveInteger(value.scenarioRevision)) {
    add(`${path}.scenarioRevision`, 'INSTANCE_REVISION', 'must be a positive safe integer');
  }
  if (typeof value.definitionHash !== 'string' || !DEFINITION_HASH_PATTERN.test(value.definitionHash)) {
    add(`${path}.definitionHash`, 'INSTANCE_DEFINITION_HASH', 'must be a native or legacy definition hash');
  }
  requiredString(value.inputVariantId, `${path}.inputVariantId`, add);
  if (value.inputSha256 !== null && (typeof value.inputSha256 !== 'string' || !SHA256_PATTERN.test(value.inputSha256))) {
    add(`${path}.inputSha256`, 'INSTANCE_INPUT_SHA256', 'must be a SHA-256 digest or explicit null for v1 migration');
  }
  if (value.scenarioId !== result.scenarioId) add(`${path}.scenarioId`, 'INSTANCE_ID_MISMATCH', 'must equal result scenarioId');
  if (value.scenarioRevision !== result.scenarioRevision) add(`${path}.scenarioRevision`, 'INSTANCE_REVISION_MISMATCH', 'must equal result scenarioRevision');
  if (value.definitionHash !== result.definitionHash) add(`${path}.definitionHash`, 'INSTANCE_HASH_MISMATCH', 'must equal result definitionHash');
}

function validateOutcomes(value: unknown, path: string, add: AddDiagnostic): void {
  if (!Array.isArray(value)) {
    add(path, 'ORACLE_OUTCOMES', 'must be an array');
    return;
  }
  value.forEach((entry, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      add(itemPath, 'ORACLE_OUTCOME', 'must be a plain object');
      return;
    }
    if (!ORACLES.has(entry.oracle as OracleId)) add(`${itemPath}.oracle`, 'ORACLE_ID', 'must name a known oracle');
    requiredString(entry.reasonCode, `${itemPath}.reasonCode`, add);
    optionalString(entry.detail, `${itemPath}.detail`, add);
    validateMeasurements(entry.measurements, `${itemPath}.measurements`, add);
    if (entry.evidence !== undefined) {
      if (!isRecord(entry.evidence)) add(`${itemPath}.evidence`, 'ORACLE_EVIDENCE', 'must be a plain JSON object');
      else validateJson(entry.evidence, `${itemPath}.evidence`, add);
    }
    if (entry.state === 'VERDICT') {
      rejectUnknown(entry, VERDICT_OUTCOME_KEYS, itemPath, add);
      if (entry.verdict !== 'PASS' && entry.verdict !== 'FAIL') {
        add(`${itemPath}.verdict`, 'ORACLE_VERDICT', 'must be PASS or FAIL');
      }
    } else if (entry.state === 'UNAVAILABLE') {
      rejectUnknown(entry, UNAVAILABLE_OUTCOME_KEYS, itemPath, add);
      if (entry.status !== 'NA_ASSET' && entry.status !== 'NA_BROWSER') {
        add(`${itemPath}.status`, 'ORACLE_UNAVAILABLE_STATUS', 'must be NA_ASSET or NA_BROWSER');
      }
      requiredString(entry.detail, `${itemPath}.detail`, add);
    } else if (entry.state === 'ERROR') {
      rejectUnknown(entry, ERROR_OUTCOME_KEYS, itemPath, add);
      requiredString(entry.detail, `${itemPath}.detail`, add);
    } else {
      add(`${itemPath}.state`, 'ORACLE_OUTCOME_STATE', 'must be VERDICT, UNAVAILABLE, or ERROR');
    }
  });
}

function validateStatusConsistency(value: Record<string, unknown>, add: AddDiagnostic): void {
  if (!STATUSES.has(value.status as ResultStatus) || !Array.isArray(value.oracleOutcomes)) return;
  const status = value.status as ResultStatus;
  const outcomes = value.oracleOutcomes as OracleOutcome[];
  if (Array.isArray(value.exhaustive) && value.exhaustive.length > 0) {
    const statuses = value.exhaustive.flatMap((entry) =>
      isRecord(entry) && STATUSES.has(entry.status as ResultStatus)
        ? [entry.status as ResultStatus]
        : []);
    if (statuses.length === value.exhaustive.length) {
      const reduced = reduceExhaustiveStatuses(statuses);
      if (status !== reduced.status) {
        add('$.status', 'RESULT_EXHAUSTIVE_REDUCTION_MISMATCH',
          `exhaustive input statuses reduce to ${reduced.status}, not ${status}`);
      }
    }
    return;
  }
  if ((status === 'PASS' || status === 'FAIL') && outcomes.length === 0) {
    add('$.oracleOutcomes', 'RESULT_VERDICT_WITHOUT_ORACLE', `${status} requires at least one oracle outcome`);
    return;
  }
  const candidateEvidence = isRecord(value.candidateEvidence) ? value.candidateEvidence : undefined;
  if (candidateEvidence && CANDIDATE_EVIDENCE_STATUSES.has(candidateEvidence.status as string)) {
    const oracleStatus = outcomes.length > 0 ? reduceOracleOutcomes(outcomes).status : 'PASS';
    const expected = oracleStatus === 'PASS'
      ? candidateEvidence.status as ResultStatus
      : oracleStatus;
    if (expected !== status) {
      add('$.status', 'CANDIDATE_EVIDENCE_RESULT_MISMATCH',
        `oracle correctness plus candidate evidence reduce to ${expected}, not ${status}`);
    }
    return;
  }
  if (status === 'NA_ENGINE' || status === 'SKIPPED') {
    if (outcomes.length > 0) add('$.oracleOutcomes', 'PRE_ORACLE_STATUS_OUTCOMES', `${status} must not carry oracle outcomes`);
    return;
  }
  if (outcomes.length === 0) return;
  const reduced = reduceOracleOutcomes(outcomes);
  if (reduced.status !== status) {
    add('$.status', 'RESULT_REDUCTION_MISMATCH', `oracle outcomes reduce to ${reduced.status}, not ${status}`);
  }
}

function validateBench(value: unknown, status: ResultStatus, path: string, add: AddDiagnostic): void {
  if (value === undefined) return;
  if (status !== 'PASS') {
    add(path, 'BENCH_CORRECTNESS_GATE', 'bench is allowed only for PASS');
  }
  if (!isRecord(value)) {
    add(path, 'BENCH_TYPE', 'must be an object');
    return;
  }
  for (const [metric, summary] of Object.entries(value)) {
    if (!METRICS.has(metric as MetricId)) add(`${path}.${metric}`, 'BENCH_METRIC', 'unknown metric');
    if (!isRecord(summary)) {
      add(`${path}.${metric}`, 'BENCH_SUMMARY', 'must be an object');
      continue;
    }
    for (const key of ['n', 'warmup', 'median', 'p95', 'mad'] as const) {
      if (!nonNegativeFinite(summary[key])) add(`${path}.${metric}.${key}`, 'BENCH_NUMBER', 'must be finite and non-negative');
    }
    if (!Array.isArray(summary.samples) || summary.samples.some((sample) => !Number.isFinite(sample))) {
      add(`${path}.${metric}.samples`, 'BENCH_SAMPLES', 'must contain only finite numbers');
    }
    requiredString(summary.metric, `${path}.${metric}.metric`, add);
    requiredString(summary.unit, `${path}.${metric}.unit`, add);
    if (summary.aggregate !== undefined && !Number.isFinite(summary.aggregate)) {
      add(`${path}.${metric}.aggregate`, 'BENCH_AGGREGATE', 'must be finite');
    }
  }
}

function validateMeasurement(value: unknown, status: ResultStatus, path: string, add: AddDiagnostic): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    add(path, 'MEASUREMENT', 'must be an object');
    return;
  }
  if (value.state === 'AVAILABLE') {
    if (status !== 'PASS') {
      add(path, 'MEASUREMENT_CORRECTNESS_GATE', 'available measurement requires PASS');
    }
    if (!Array.isArray(value.metrics) || value.metrics.some((metric) => !METRICS.has(metric as MetricId))) {
      add(`${path}.metrics`, 'MEASUREMENT_METRICS', 'must contain known metrics');
    }
  } else if (value.state === 'UNAVAILABLE') {
    requiredString(value.reasonCode, `${path}.reasonCode`, add);
    requiredString(value.detail, `${path}.detail`, add);
  } else if (value.state !== 'NOT_REQUESTED') {
    add(`${path}.state`, 'MEASUREMENT_STATE', 'must be NOT_REQUESTED, AVAILABLE, or UNAVAILABLE');
  }
}

function validateSupport(value: unknown, path: string, add: AddDiagnostic): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    add(path, 'SUPPORT_EVIDENCE', 'must be an object');
    return;
  }
  validateJson(value, path, add);
}

export function validateScenarioOperationEvidence(
  value: unknown,
  path = '$',
  addExternal?: AddDiagnostic,
): ResultSchemaDiagnostic[] {
  const diagnostics: ResultSchemaDiagnostic[] = [];
  const add = addExternal ?? diagnosticAppender(diagnostics);
  if (!isRecord(value)) {
    add(path, 'OPERATION_EVIDENCE', 'must be a plain object');
    return diagnostics;
  }
  rejectUnknown(value, OPERATION_EVIDENCE_KEYS, path, add);
  if (value.schema !== 'media-test/robustness-operation@1') {
    add(`${path}.schema`, 'OPERATION_EVIDENCE_SCHEMA', "must equal 'media-test/robustness-operation@1'");
  }
  if (!OPERATION_DISPOSITIONS.has(value.disposition as string)) {
    add(`${path}.disposition`, 'OPERATION_DISPOSITION', 'must name a closed robustness disposition');
  }
  if (!OPERATION_STAGES.has(value.stage as string)) {
    add(`${path}.stage`, 'OPERATION_STAGE', 'must name a closed robustness stage');
  }
  if (value.nativeError !== undefined) {
    if (!isRecord(value.nativeError)) add(`${path}.nativeError`, 'NATIVE_ERROR', 'must be an object');
    else {
      rejectUnknown(value.nativeError, NATIVE_ERROR_KEYS, `${path}.nativeError`, add);
      requiredString(value.nativeError.name, `${path}.nativeError.name`, add);
      optionalString(value.nativeError.code, `${path}.nativeError.code`, add);
    }
  }
  if (value.resource !== undefined) {
    if (!isRecord(value.resource)) add(`${path}.resource`, 'RESOURCE_EVIDENCE', 'must be an object');
    else {
      rejectUnknown(value.resource, RESOURCE_KEYS, `${path}.resource`, add);
      if (!RESOURCE_KINDS.has(value.resource.kind as string)) {
        add(`${path}.resource.kind`, 'RESOURCE_KIND', 'must be wall-time, memory, or worker-stall');
      }
      if (value.resource.observed !== undefined && !nonNegativeFinite(value.resource.observed)) {
        add(`${path}.resource.observed`, 'RESOURCE_OBSERVED', 'must be finite and non-negative');
      }
      if (value.resource.limit !== undefined && !nonNegativeFinite(value.resource.limit)) {
        add(`${path}.resource.limit`, 'RESOURCE_LIMIT', 'must be finite and non-negative');
      }
      if (value.resource.unit !== undefined && value.resource.unit !== 'ms' && value.resource.unit !== 'bytes') {
        add(`${path}.resource.unit`, 'RESOURCE_UNIT', 'must be ms or bytes');
      }
    }
  }
  return diagnostics;
}

function validateFingerprint(value: unknown, path: string, add: AddDiagnostic): void {
  if (value === undefined) return;
  if (!validFingerprint(value)) {
    add(path, 'EXECUTION_FINGERPRINT', "must contain schema 'media-test/scenario-result@3' and SHA-256 hash");
  }
}

function validFingerprint(value: unknown): value is ScenarioExecutionFingerprint {
  return isRecord(value) && value.schema === 'media-test/scenario-result@3' &&
    typeof value.hash === 'string' && SHA256_PATTERN.test(value.hash);
}

function validateSelection(value: unknown, path: string, add: AddDiagnostic): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    add(path, 'RESULT_SELECTION', 'must be an object');
    return;
  }
  rejectUnknown(value, SELECTION_KEYS, path, add);
  requiredString(value.file, `${path}.file`, add);
  if (value.sha256 !== undefined && (typeof value.sha256 !== 'string' || !SHA256_PATTERN.test(value.sha256))) {
    add(`${path}.sha256`, 'SELECTION_SHA256', 'must be a SHA-256 digest');
  }
  if (typeof value.isBaked !== 'boolean') add(`${path}.isBaked`, 'SELECTION_BAKED', 'must be boolean');
  optionalString(value.runSeed, `${path}.runSeed`, add);
  if (value.candidateCount !== undefined && !nonNegativeInteger(value.candidateCount)) {
    add(`${path}.candidateCount`, 'SELECTION_CANDIDATES', 'must be a non-negative integer');
  }
  for (const field of ['eligiblePoolDigest', 'executedInputDigest', 'candidateIdentity', 'score', 'evidenceContractDigest'] as const) {
    if (value[field] !== undefined && (typeof value[field] !== 'string' || !SHA256_PATTERN.test(value[field] as string))) {
      add(`${path}.${field}`, 'SELECTION_DIGEST', 'must be a SHA-256 digest');
    }
  }
  optionalString(value.selectionPolicyVersion, `${path}.selectionPolicyVersion`, add);
  optionalString(value.selectionAlgorithmId, `${path}.selectionAlgorithmId`, add);
  if (value.probability !== undefined) {
    if (!isRecord(value.probability)) {
      add(`${path}.probability`, 'SELECTION_PROBABILITY', 'must be an object');
    } else {
      rejectUnknown(value.probability, PROBABILITY_KEYS, `${path}.probability`, add);
      if (value.probability.numerator !== 1) add(`${path}.probability.numerator`, 'SELECTION_PROBABILITY', 'must equal 1');
      if (!validPositiveInteger(value.probability.denominator)) add(`${path}.probability.denominator`, 'SELECTION_PROBABILITY', 'must be positive');
      if (value.probability.weight !== 1) add(`${path}.probability.weight`, 'SELECTION_PROBABILITY', 'must equal 1');
    }
  }
  if (value.catalogState !== undefined && value.catalogState !== 'ready' && value.catalogState !== 'fallback') {
    add(`${path}.catalogState`, 'SELECTION_CATALOG_STATE', "must be 'ready' or 'fallback'");
  }
  if (value.catalogReason !== undefined) {
    if (!isRecord(value.catalogReason)) {
      add(`${path}.catalogReason`, 'SELECTION_CATALOG_REASON', 'must be an object');
    } else {
      rejectUnknown(value.catalogReason, CATALOG_REASON_KEYS, `${path}.catalogReason`, add);
      requiredString(value.catalogReason.reasonCode, `${path}.catalogReason.reasonCode`, add);
      requiredString(value.catalogReason.detail, `${path}.catalogReason.detail`, add);
    }
  }
}

function validateCandidateEvidence(value: unknown, path: string, add: AddDiagnostic): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    add(path, 'CANDIDATE_EVIDENCE', 'must be an object');
    return;
  }
  rejectUnknown(value, CANDIDATE_EVIDENCE_KEYS, path, add);
  if (value.schema !== 'media-test/candidate-evidence-result@1') {
    add(`${path}.schema`, 'CANDIDATE_EVIDENCE_SCHEMA', 'must name candidate-evidence-result@1');
  }
  if (typeof value.contractDigest !== 'string' || !SHA256_PATTERN.test(value.contractDigest)) {
    add(`${path}.contractDigest`, 'CANDIDATE_EVIDENCE_DIGEST', 'must be a SHA-256 digest');
  }
  if (!CANDIDATE_EVIDENCE_STATUSES.has(value.status as string)) {
    add(`${path}.status`, 'CANDIDATE_EVIDENCE_STATUS', 'must be a closed evidence status');
  }
  requiredString(value.reasonCode, `${path}.reasonCode`, add);
  validateOracleIdList(value.required, `${path}.required`, add);
  validateOracleIdList(value.applied, `${path}.applied`, add);
  validateOracleIdList(value.sufficientSurvivorOracles, `${path}.sufficientSurvivorOracles`, add);
  if (!Array.isArray(value.unavailable)) {
    add(`${path}.unavailable`, 'CANDIDATE_EVIDENCE_UNAVAILABLE', 'must be an array');
  } else {
    value.unavailable.forEach((entry, index) => {
      const itemPath = `${path}.unavailable[${index}]`;
      if (!isRecord(entry)) {
        add(itemPath, 'CANDIDATE_EVIDENCE_UNAVAILABLE', 'must be an object');
        return;
      }
      rejectUnknown(entry, CANDIDATE_UNAVAILABLE_KEYS, itemPath, add);
      if (!ORACLES.has(entry.oracle as OracleId)) add(`${itemPath}.oracle`, 'ORACLE_ID', 'must name a known oracle');
      if (entry.status !== 'NA_ASSET' && entry.status !== 'NA_BROWSER') {
        add(`${itemPath}.status`, 'CANDIDATE_EVIDENCE_UNAVAILABLE', 'must be NA_ASSET or NA_BROWSER');
      }
      requiredString(entry.reasonCode, `${itemPath}.reasonCode`, add);
    });
  }
  if (typeof value.sufficient !== 'boolean') add(`${path}.sufficient`, 'CANDIDATE_EVIDENCE_SUFFICIENT', 'must be boolean');
}

function validateCacheReuse(value: unknown, path: string, add: AddDiagnostic): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    add(path, 'CACHE_REUSE', 'must be an object');
    return;
  }
  rejectUnknown(value, CACHE_REUSE_KEYS, path, add);
  if (value.schema !== 'media-test/cache-reuse@1') {
    add(`${path}.schema`, 'CACHE_REUSE_SCHEMA', 'must name cache-reuse@1');
  }
  requiredString(value.sourceKey, `${path}.sourceKey`, add);
  if (typeof value.sourceObservationHash !== 'string' || !SHA256_PATTERN.test(value.sourceObservationHash)) {
    add(`${path}.sourceObservationHash`, 'CACHE_REUSE_OBSERVATION_HASH', 'must be a SHA-256 digest');
  }
  optionalString(value.sourceRunId, `${path}.sourceRunId`, add);
  if (typeof value.createdAtIso !== 'string' || !isIsoInstant(value.createdAtIso)) {
    add(`${path}.createdAtIso`, 'CACHE_REUSE_CREATED_AT', 'must be an ISO timestamp');
  }
  requiredString(value.originalOrigin, `${path}.originalOrigin`, add);
  requiredString(value.validationEpoch, `${path}.validationEpoch`, add);
  requiredString(value.validBecause, `${path}.validBecause`, add);
  optionalString(value.importedFrom, `${path}.importedFrom`, add);
  validateRunEnv(value.sourceEnvironment, `${path}.sourceEnvironment`, add);
  validateSelection(value.selectionEnvelope, `${path}.selectionEnvelope`, add);
}

function validateOracleIdList(value: unknown, path: string, add: AddDiagnostic): void {
  if (!Array.isArray(value)) {
    add(path, 'ORACLE_ID_LIST', 'must be an array');
    return;
  }
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    if (!ORACLES.has(entry as OracleId)) add(`${path}[${index}]`, 'ORACLE_ID', 'must name a known oracle');
    if (typeof entry === 'string' && seen.has(entry)) add(`${path}[${index}]`, 'ORACLE_ID_DUPLICATE', 'must be unique');
    if (typeof entry === 'string') seen.add(entry);
  });
}

function validateExhaustive(value: unknown, path: string, add: AddDiagnostic): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length === 0) {
    add(path, 'EXHAUSTIVE_RESULTS', 'must be a non-empty array');
    return;
  }
  value.forEach((entry, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      add(itemPath, 'EXHAUSTIVE_RESULT', 'must be an object');
      return;
    }
    rejectUnknown(entry, EXHAUSTIVE_KEYS, itemPath, add);
    requiredString(entry.file, `${itemPath}.file`, add);
    if (entry.sha256 !== undefined && (typeof entry.sha256 !== 'string' || !SHA256_PATTERN.test(entry.sha256))) {
      add(`${itemPath}.sha256`, 'EXHAUSTIVE_SHA256', 'must be a SHA-256 digest');
    }
    if (typeof entry.isBaked !== 'boolean') add(`${itemPath}.isBaked`, 'EXHAUSTIVE_BAKED', 'must be boolean');
    if (!STATUSES.has(entry.status as ResultStatus)) add(`${itemPath}.status`, 'EXHAUSTIVE_STATUS', 'must be a result status');
    optionalString(entry.reason, `${itemPath}.reason`, add);
    validateOutcomes(entry.oracleOutcomes, `${itemPath}.oracleOutcomes`, add);
    validateExhaustiveOutcomeConsistency(entry, itemPath, add);
    validateBench(entry.bench, entry.status as ResultStatus, `${itemPath}.bench`, add);
    validateMeasurement(entry.measurement, entry.status as ResultStatus, `${itemPath}.measurement`, add);
    validateSupport(entry.support, `${itemPath}.support`, add);
    validateFingerprint(entry.executionFingerprint, `${itemPath}.executionFingerprint`, add);
    validateSelection(entry.selection, `${itemPath}.selection`, add);
    validateCandidateEvidence(entry.candidateEvidence, `${itemPath}.candidateEvidence`, add);
    validateCacheReuse(entry.cacheReuse, `${itemPath}.cacheReuse`, add);
    if (entry.operationEvidence !== undefined) {
      validateScenarioOperationEvidence(entry.operationEvidence, `${itemPath}.operationEvidence`, add);
    }
    if (typeof entry.executed !== 'boolean') add(`${itemPath}.executed`, 'EXHAUSTIVE_EXECUTED', 'must be boolean');
  });
}

function validateExhaustiveOutcomeConsistency(
  entry: Record<string, unknown>,
  path: string,
  add: AddDiagnostic,
): void {
  if (!STATUSES.has(entry.status as ResultStatus) || !Array.isArray(entry.oracleOutcomes)) return;
  const status = entry.status as ResultStatus;
  const outcomes = entry.oracleOutcomes as OracleOutcome[];
  if ((status === 'PASS' || status === 'FAIL') && outcomes.length === 0) {
    add(`${path}.oracleOutcomes`, 'EXHAUSTIVE_VERDICT_WITHOUT_ORACLE',
      `${status} requires at least one oracle outcome`);
    return;
  }
  const candidateEvidence = isRecord(entry.candidateEvidence) ? entry.candidateEvidence : undefined;
  if (candidateEvidence && CANDIDATE_EVIDENCE_STATUSES.has(candidateEvidence.status as string)) {
    const oracleStatus = outcomes.length > 0 ? reduceOracleOutcomes(outcomes).status : 'PASS';
    const expected = oracleStatus === 'PASS'
      ? candidateEvidence.status as ResultStatus
      : oracleStatus;
    if (expected !== status) {
      add(`${path}.status`, 'EXHAUSTIVE_CANDIDATE_EVIDENCE_RESULT_MISMATCH',
        `oracle correctness plus candidate evidence reduce to ${expected}, not ${status}`);
    }
    return;
  }
  if (status === 'NA_ENGINE' || status === 'SKIPPED') {
    if (outcomes.length > 0) {
      add(`${path}.oracleOutcomes`, 'EXHAUSTIVE_PRE_ORACLE_OUTCOMES',
        `${status} must not carry oracle outcomes`);
    }
    return;
  }
  if (outcomes.length === 0) return;
  const reduced = reduceOracleOutcomes(outcomes);
  if (reduced.status !== status) {
    add(`${path}.status`, 'EXHAUSTIVE_REDUCTION_MISMATCH',
      `oracle outcomes reduce to ${reduced.status}, not ${status}`);
  }
}

function validateCoverage(value: unknown, exhaustive: unknown, path: string, add: AddDiagnostic): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    add(path, 'EXHAUSTIVE_COVERAGE', 'must be an object');
    return;
  }
  rejectUnknown(value, COVERAGE_KEYS, path, add);
  for (const key of ['passed', 'admissible', 'total', 'valid'] as const) {
    if (!nonNegativeInteger(value[key])) add(`${path}.${key}`, 'COVERAGE_COUNT', 'must be a non-negative integer');
  }
  if (value.grade !== 'full' && value.grade !== 'partial' && value.grade !== 'none') {
    add(`${path}.grade`, 'COVERAGE_GRADE', 'must be full, partial, or none');
  }
  if (!isRecord(value.counts)) {
    add(`${path}.counts`, 'COVERAGE_COUNTS', 'must be an object');
    return;
  }
  rejectUnknown(value.counts, COUNT_KEYS, `${path}.counts`, add);
  for (const key of COUNT_KEYS) {
    if (!nonNegativeInteger(value.counts[key])) add(`${path}.counts.${key}`, 'COVERAGE_OUTCOME_COUNT', 'must be a non-negative integer');
  }
  const counts = value.counts;
  const valid = numberOrNaN(counts.pass);
  const admissible = valid + numberOrNaN(counts.fail) + numberOrNaN(counts.error);
  if (valid !== value.valid || value.passed !== value.valid) {
    add(path, 'COVERAGE_VALID_MISMATCH', 'valid/passed must equal pass');
  }
  if (admissible !== value.admissible) add(`${path}.admissible`, 'COVERAGE_ADMISSIBLE_MISMATCH', 'must equal pass + fail + error');
  if (counts.total !== value.total) add(`${path}.total`, 'COVERAGE_TOTAL_MISMATCH', 'must equal counts.total');
  const validCount = typeof value.valid === 'number' ? value.valid : Number.NaN;
  const terminalIntrinsicCoverage =
    validCount > 0 &&
    numberOrNaN(counts.fail) === 0 &&
    numberOrNaN(counts.error) === 0 &&
    numberOrNaN(counts.naBrowser) === 0 &&
    numberOrNaN(counts.naAsset) === 0 &&
    numberOrNaN(counts.skipped) === 0;
  const expectedGrade = terminalIntrinsicCoverage ? 'full' : validCount > 0 ? 'partial' : 'none';
  if (value.grade !== expectedGrade) add(`${path}.grade`, 'COVERAGE_GRADE_MISMATCH', `must be '${expectedGrade}' for these counts`);
  if (Array.isArray(exhaustive)) {
    if (exhaustive.length !== value.total) add(`${path}.total`, 'COVERAGE_FILES_MISMATCH', 'must equal exhaustive.length');
    for (const [status, key] of STATUS_COUNT_KEYS) {
      const actual = exhaustive.filter((entry) => isRecord(entry) && entry.status === status).length;
      if (counts[key] !== actual) add(`${path}.counts.${key}`, 'COVERAGE_STATUS_MISMATCH', `must equal ${actual} exhaustive ${status} rows`);
    }
  }
}

function validateRunEnv(value: unknown, path: string, add: AddDiagnostic): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    add(path, 'RUN_ENV', 'must be an object');
    return;
  }
  requiredString(value.suiteVersion, `${path}.suiteVersion`, add);
  requiredString(value.engineId, `${path}.engineId`, add);
  if (!BROWSERS.has(value.browser as string)) add(`${path}.browser`, 'RUN_ENV_BROWSER', 'must name a browser');
  for (const key of ['browserVersion', 'userAgent', 'gpu', 'corpusChecksum'] as const) {
    optionalString(value[key], `${path}.${key}`, add);
  }
  if (value.acPower !== undefined && typeof value.acPower !== 'boolean') add(`${path}.acPower`, 'RUN_ENV_POWER', 'must be boolean');
  validateJson(value.configUsed, `${path}.configUsed`, add);
  if (value.pixelBehavior !== undefined) {
    if (!isRecord(value.pixelBehavior)) add(`${path}.pixelBehavior`, 'PIXEL_BEHAVIOR', 'must be an object');
    else {
      if (value.pixelBehavior.state !== 'SUPPORTED' && value.pixelBehavior.state !== 'UNSUPPORTED') {
        add(`${path}.pixelBehavior.state`, 'PIXEL_BEHAVIOR_STATE', 'must be SUPPORTED or UNSUPPORTED');
      }
      requiredString(value.pixelBehavior.reasonCode, `${path}.pixelBehavior.reasonCode`, add);
      requiredString(value.pixelBehavior.detail, `${path}.pixelBehavior.detail`, add);
    }
  }
}

function validateMeasurements(value: unknown, path: string, add: AddDiagnostic): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    add(path, 'ORACLE_MEASUREMENTS', 'must be an object');
    return;
  }
  for (const [key, measurement] of Object.entries(value)) {
    if (!Number.isFinite(measurement)) add(`${path}.${key}`, 'ORACLE_MEASUREMENT_FINITE', 'must be finite');
  }
}

function validateMigrationEvidence(value: unknown, path: string, add: AddDiagnostic): void {
  if (!isRecord(value)) {
    add(path, 'MIGRATION_EVIDENCE', 'must be an object');
    return;
  }
  if (value.from !== 'media-browser-test/results@1') add(`${path}.from`, 'MIGRATION_SOURCE', 'must identify results@1');
  if (!nonNegativeInteger(value.missingInputDigests)) add(`${path}.missingInputDigests`, 'MIGRATION_DIGEST_COUNT', 'must be a non-negative integer');
}

function validateJson(value: unknown, path: string, add: AddDiagnostic, active = new Set<object>()): void {
  if (value === undefined || value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) add(path, 'JSON_NUMBER', 'must be finite');
    return;
  }
  if (typeof value !== 'object') {
    add(path, 'JSON_SAFE', `${typeof value} is not JSON-safe`);
    return;
  }
  if (active.has(value)) {
    add(path, 'JSON_CYCLE', 'must not be cyclic');
    return;
  }
  if (!Array.isArray(value) && !isRecord(value)) {
    add(path, 'JSON_OBJECT', 'must be a plain object or array');
    return;
  }
  active.add(value);
  if (Array.isArray(value)) value.forEach((entry, index) => validateJson(entry, `${path}[${index}]`, add, active));
  else for (const [key, entry] of Object.entries(value)) validateJson(entry, `${path}.${key}`, add, active);
  active.delete(value);
}

function rejectUnknown(value: Record<string, unknown>, allowed: ReadonlySet<string>, path: string, add: AddDiagnostic): void {
  for (const key of Object.keys(value)) if (!allowed.has(key)) add(`${path}.${key}`, 'SCHEMA_ADDITIONAL_PROPERTY', `unknown field '${key}'`);
}

function requiredString(value: unknown, path: string, add: AddDiagnostic): void {
  if (typeof value !== 'string' || value.length === 0) add(path, 'REQUIRED_STRING', 'must be a non-empty string');
}

function optionalString(value: unknown, path: string, add: AddDiagnostic): void {
  if (value !== undefined && typeof value !== 'string') add(path, 'OPTIONAL_STRING', 'must be a string');
}

function requireLegacyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ResultSchemaError([{ path, code: 'V1_REQUIRED_STRING', message: 'must be a non-empty string' }]);
  }
  return value;
}

function diagnosticAppender(diagnostics: ResultSchemaDiagnostic[]): AddDiagnostic {
  return (path, code, message) => diagnostics.push({ path, code, message });
}

function stripRoot(path: string): string {
  return path === '$' ? '' : path.startsWith('$.') ? path.slice(1) : path;
}

function isIsoInstant(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function nonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function validPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}

function numberOrNaN(value: unknown): number {
  return typeof value === 'number' ? value : Number.NaN;
}

function engineVersionFromId(id: string): string | undefined {
  const index = id.lastIndexOf('@');
  return index > 0 && index < id.length - 1 ? id.slice(index + 1) : undefined;
}

function cloneJson<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry, seen);
  return Object.freeze(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

type AddDiagnostic = (path: string, code: string, message: string) => void;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const DEFINITION_HASH_PATTERN = /^(?:[a-f0-9]{64}|legacy\/[a-f0-9]{64})$/;
const BROWSERS = new Set(['brave', 'chromium', 'webkit', 'firefox']);
const FAMILIES = new Set([
  'probe', 'demux', 'remux', 'transcode', 'decode-seek', 'trim', 'mux', 'encryption', 'metadata',
  'streaming-output', 'audio-dsp', 'robustness', 'performance',
]);
const STATUSES = new Set<ResultStatus>([
  'PASS', 'FAIL', 'NA_ENGINE', 'NA_BROWSER', 'NA_ASSET', 'ERROR', 'SKIPPED',
]);
const ORACLES = new Set<OracleId>([
  'golden-metadata', 'golden-packets', 'decoded-frames-bitexact', 'decoded-audio-pcm',
  'reference-reimport', 'playback-smoke', 'ssim-psnr', 'mp4-box-layout', 'webm-live-layout',
  'fanout-renditions', 'alpha-plane', 'seek-accuracy', 'trim-boundaries', 'decrypt-bitexact',
  'graceful-failure', 'property-invariant',
]);
const METRICS = new Set<MetricId>([
  'wall', 'throughputRealtime', 'peakMemory', 'sourceReads', 'targetWrites', 'bytesOut', 'longtasks',
  'decodeFps', 'encodeFps', 'opsPerSec', 'packetsPerSec', 'framesPerSec', 'sampleFramesPerSec', 'seekMs',
  'timeToFirstByte', 'timeToFirstFrame', 'loadInit', 'bundleSize',
]);

const ENVELOPE_KEYS = new Set(['schema', 'generatedAtIso', 'env', 'support', 'results', 'migration']);
const RESULT_KEYS = new Set([
  'schemaVersion', 'engineId', 'engineVersion', 'browser', 'scenarioId', 'scenarioRevision',
  'definitionHash', 'instance', 'inputVariantId', 'inputSha256', 'family', 'status', 'reason',
  'oracleOutcomes', 'bench', 'measurement', 'support', 'operationEvidence', 'executionFingerprint',
  'candidateEvidence', 'cacheReuse', 'bundleMeasurement', 'decodeProvenance', 'primaryMetric', 'selection', 'exhaustive', 'coverage', 'env', 'startedAtIso', 'durationMs',
]);
const INSTANCE_KEYS = new Set(['scenarioId', 'scenarioRevision', 'definitionHash', 'inputVariantId', 'inputSha256']);
const VERDICT_OUTCOME_KEYS = new Set(['state', 'oracle', 'verdict', 'reasonCode', 'detail', 'measurements', 'evidence']);
const UNAVAILABLE_OUTCOME_KEYS = new Set(['state', 'oracle', 'status', 'reasonCode', 'detail', 'measurements', 'evidence']);
const ERROR_OUTCOME_KEYS = new Set(['state', 'oracle', 'reasonCode', 'detail', 'measurements', 'evidence']);
const OPERATION_EVIDENCE_KEYS = new Set(['schema', 'disposition', 'stage', 'nativeError', 'resource']);
const CANDIDATE_EVIDENCE_KEYS = new Set([
  'schema', 'contractDigest', 'status', 'reasonCode', 'required', 'applied', 'unavailable',
  'sufficientSurvivorOracles', 'sufficient',
]);
const CANDIDATE_UNAVAILABLE_KEYS = new Set(['oracle', 'status', 'reasonCode']);
const CANDIDATE_EVIDENCE_STATUSES = new Set(['PASS', 'FAIL', 'NA_ASSET', 'NA_BROWSER', 'ERROR']);
const CACHE_REUSE_KEYS = new Set([
  'schema', 'sourceKey', 'sourceObservationHash', 'sourceRunId', 'createdAtIso', 'originalOrigin',
  'validationEpoch', 'validBecause', 'importedFrom', 'sourceEnvironment', 'selectionEnvelope',
]);
const SELECTION_KEYS = new Set([
  'file', 'sha256', 'isBaked', 'runSeed', 'candidateCount', 'eligiblePoolDigest',
  'executedInputDigest', 'candidateIdentity', 'selectionPolicyVersion', 'selectionAlgorithmId',
  'score', 'probability', 'evidenceContractDigest', 'catalogState', 'catalogReason',
]);
const PROBABILITY_KEYS = new Set(['numerator', 'denominator', 'weight']);
const CATALOG_REASON_KEYS = new Set(['reasonCode', 'detail']);
const NATIVE_ERROR_KEYS = new Set(['name', 'code']);
const RESOURCE_KEYS = new Set(['kind', 'observed', 'limit', 'unit']);
const OPERATION_DISPOSITIONS = new Set([
  'returned-validatable-output', 'clean-reject', 'not-applicable', 'browser-unavailable', 'timeout',
  'worker-crash', 'resource-limit', 'harness-error',
]);
const OPERATION_STAGES = new Set(['preflight', 'operation', 'survivor-oracle', 'cleanup']);
const RESOURCE_KINDS = new Set(['wall-time', 'memory', 'worker-stall']);
const EXHAUSTIVE_KEYS = new Set([
  'file', 'sha256', 'isBaked', 'status', 'reason', 'oracleOutcomes', 'measurement', 'support',
  'selection', 'operationEvidence', 'candidateEvidence', 'cacheReuse', 'executionFingerprint', 'executed', 'bench',
]);
const COVERAGE_KEYS = new Set(['passed', 'admissible', 'total', 'valid', 'grade', 'counts']);
const COUNT_KEYS = new Set([
  'pass', 'fail', 'error', 'naEngine', 'naBrowser', 'naAsset', 'skipped', 'total',
]);
const STATUS_COUNT_KEYS = [
  ['PASS', 'pass'], ['FAIL', 'fail'], ['ERROR', 'error'], ['NA_ENGINE', 'naEngine'],
  ['NA_BROWSER', 'naBrowser'], ['NA_ASSET', 'naAsset'], ['SKIPPED', 'skipped'],
] as const satisfies ReadonlyArray<readonly [ResultStatus, keyof ExhaustiveCoverage['counts']]>;
