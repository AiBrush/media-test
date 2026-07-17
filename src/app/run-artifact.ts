/** Immutable run manifests and the single canonical manual/launcher export boundary. */

import type { EnvInfo, CodecSupport } from '../core/feature-detect.ts';
import {
  buildReport,
  canonicalContentHash,
  parseRawRunArtifact,
  RAW_RUN_SCHEMA_ID,
  REPORTING_SCHEMA_VERSION,
  renderReportMarkdown,
  stablePrettyJson,
  validateReportArtifact,
} from '../core/report.ts';
import type { ReportJson } from '../core/report.ts';
import {
  readResultsEnvelope,
  RESULTS_V2_SCHEMA_ID,
} from '../core/result-schema.ts';
import type {
  ResultsEnvelopeV2,
  ScenarioResultV2,
  V1MigrationContext,
} from '../core/result-schema.ts';
import type { Scenario, ScenarioResult } from '../core/scenario.ts';
import type { RegistrationReport } from './register.ts';
import type { FrozenRunConfiguration } from './options.ts';

export const APP_STATUS_MODEL_VERSION = 'media-test/status-model@pass-diff-fail-na-v1' as const;
export const APP_RUN_MANIFEST_SCHEMA = 'media-test/run-manifest@1' as const;
export const APP_CACHE_POLICY_SCHEMA = 'media-test/browser-cache-policy@2' as const;

export type RunCompletionState =
  | 'idle'
  | 'validating'
  | 'running'
  | 'stopping'
  | 'completed'
  | 'completed-partial'
  | 'failed';

export interface CacheHitManifestEntry {
  key: string;
  sourceRunId?: string;
  createdAtIso: string;
  originalOrigin: string;
  originalEnvironment?: unknown;
  validationEpoch: string;
  validBecause: string;
  importedFrom?: string;
}

export interface CacheManifestSnapshot {
  schema: typeof APP_CACHE_POLICY_SCHEMA;
  origin: string;
  available: boolean;
  persistence: 'origin-scoped-best-effort';
  validationEpoch: string;
  expiry: Record<string, string>;
  forcedFresh: boolean;
  entryCount: number;
  invalidatedCount: number;
  hits: readonly CacheHitManifestEntry[];
  lastError?: string;
  estimate?: { usage?: number; quota?: number };
  importProvenance?: { sourceOrigin: string; importedAtIso: string; contentHash: string };
}

export interface SelectedInputManifestEntry {
  scenarioId: string;
  file: string;
  sha256?: string;
  isBaked: boolean;
  candidateCount?: number;
  executedInputDigest?: string;
  eligiblePoolDigest?: string;
}

export interface RunManifest {
  schema: typeof APP_RUN_MANIFEST_SCHEMA;
  manifestDigest: string;
  resultSchema: typeof RESULTS_V2_SCHEMA_ID;
  reportingSchemaVersion: string;
  statusModelVersion: typeof APP_STATUS_MODEL_VERSION;
  runId: string;
  startedAtIso: string;
  endedAtIso?: string;
  completionState: RunCompletionState;
  partialReason?: string;
  suiteVersion: string;
  buildRevision: string;
  browser: {
    family: string;
    build?: string;
    operatorTag: string;
    userAgent: string;
    gpu?: string;
  };
  capabilities: CodecSupport;
  configuration: FrozenRunConfiguration;
  engineInstanceIds: readonly string[];
  engineConfigurations: Readonly<Record<string, unknown>>;
  scenarioDefinitionDigest: string;
  oracleDefinitionDigest: string;
  executionOrderDigest: string;
  expectedCellCount: number;
  observedCellCount: number;
  corpusChecksum?: string;
  selectedInputs: readonly SelectedInputManifestEntry[];
  cache: CacheManifestSnapshot;
  registrationFailures: readonly { kind: 'engine' | 'scenario-family'; id: string; reason: string }[];
}

export interface CanonicalRunArtifact {
  schemaId: typeof RAW_RUN_SCHEMA_ID;
  schemaVersion: typeof REPORTING_SCHEMA_VERSION;
  resultsSchema: typeof RESULTS_V2_SCHEMA_ID;
  runId: string;
  suiteVersion: string;
  generatedAtIso: string;
  contentHash: string;
  manifest: RunManifest;
  registration: RegistrationReport;
  env: EnvInfo;
  support: CodecSupport;
  results: ScenarioResultV2[];
  completionState: RunCompletionState;
  partialReason?: string;
  cacheHitProvenance: readonly CacheHitManifestEntry[];
  launcher?: unknown;
}

export interface CreateManifestInput {
  runId: string;
  startedAtIso: string;
  completionState: RunCompletionState;
  suiteVersion: string;
  buildRevision: string;
  env: EnvInfo;
  support: CodecSupport;
  configuration: FrozenRunConfiguration;
  engineInstanceIds: readonly string[];
  scenarios: readonly Scenario[];
  executionOrder: readonly { engineId: string; scenarioId: string }[];
  cache: CacheManifestSnapshot;
  registration: RegistrationReport;
}

export function createRunManifest(input: CreateManifestInput): RunManifest {
  const scenarioIdentity = input.scenarios.map((scenario) => ({
    id: scenario.id,
    revision: scenario.revision,
    definitionHash: scenario.definitionHash,
  }));
  const oracleIdentity = input.scenarios.map((scenario) => ({
    id: scenario.id,
    oracles: scenario.oracles,
    tolerances: scenario.tolerances ?? null,
  }));
  return freezeManifest({
    schema: APP_RUN_MANIFEST_SCHEMA,
    resultSchema: RESULTS_V2_SCHEMA_ID,
    reportingSchemaVersion: REPORTING_SCHEMA_VERSION,
    statusModelVersion: APP_STATUS_MODEL_VERSION,
    runId: input.runId,
    startedAtIso: input.startedAtIso,
    completionState: input.completionState,
    suiteVersion: input.suiteVersion,
    buildRevision: input.buildRevision,
    browser: {
      family: input.env.browser,
      ...(input.env.version ? { build: input.env.version } : {}),
      operatorTag: input.configuration.browserTag,
      userAgent: input.env.userAgent,
      ...(input.env.gpu ? { gpu: input.env.gpu } : {}),
    },
    capabilities: input.support,
    configuration: input.configuration,
    engineInstanceIds: [...input.engineInstanceIds],
    engineConfigurations: {},
    scenarioDefinitionDigest: canonicalContentHash(scenarioIdentity),
    oracleDefinitionDigest: canonicalContentHash(oracleIdentity),
    executionOrderDigest: canonicalContentHash(input.executionOrder),
    expectedCellCount: input.executionOrder.length,
    observedCellCount: 0,
    selectedInputs: [],
    cache: input.cache,
    registrationFailures: registrationFailures(input.registration),
  });
}

export function finalizeRunManifest(
  base: RunManifest,
  results: readonly ScenarioResult[],
  completionState: RunCompletionState,
  endedAtIso: string,
  cache: CacheManifestSnapshot,
  partialReason?: string,
): RunManifest {
  const engineConfigurations: Record<string, unknown> = {};
  for (const result of results) {
    if (result.env?.configUsed !== undefined) engineConfigurations[result.engineId] = result.env.configUsed;
  }
  const corpusChecksums = [...new Set(results
    .map((result) => result.env?.corpusChecksum)
    .filter((value): value is string => typeof value === 'string' && value.length > 0))].sort();
  const data = {
    ...base,
    endedAtIso,
    completionState,
    ...(completionState === 'completed' ? {} : partialReason ? { partialReason } : {}),
    engineConfigurations,
    observedCellCount: results.length,
    ...(corpusChecksums.length === 1
      ? { corpusChecksum: corpusChecksums[0] }
      : corpusChecksums.length > 1
        ? { corpusChecksum: canonicalContentHash(corpusChecksums) }
        : {}),
    selectedInputs: selectedInputEntries(results),
    cache,
  };
  delete (data as Partial<RunManifest>).manifestDigest;
  if (completionState === 'completed') delete (data as Partial<RunManifest>).partialReason;
  return freezeManifest(data);
}

export interface CreateRunArtifactInput {
  manifest: RunManifest;
  registration: RegistrationReport;
  env: EnvInfo;
  support: CodecSupport;
  results: readonly ScenarioResult[];
  scenarioIdentity?: V1MigrationContext['scenarioIdentity'];
  launcher?: unknown;
}

/**
 * Convert transitional live rows to strict ScenarioResultV2 once, then validate the same single
 * top-level results array through both results@2 and REP raw-run readers before it can be exported.
 */
export function createCanonicalRunArtifact(input: CreateRunArtifactInput): CanonicalRunArtifact {
  const generatedAtIso = input.manifest.endedAtIso ?? new Date().toISOString();
  const strict = strictResultsEnvelope(
    input.results,
    generatedAtIso,
    input.env,
    input.support,
    input.scenarioIdentity,
  );
  const substantive = {
    schemaId: RAW_RUN_SCHEMA_ID,
    schemaVersion: REPORTING_SCHEMA_VERSION,
    resultsSchema: RESULTS_V2_SCHEMA_ID,
    runId: input.manifest.runId,
    suiteVersion: input.manifest.suiteVersion,
    generatedAtIso,
    manifest: input.manifest,
    registration: input.registration,
    env: input.env,
    support: input.support,
    results: strict.results,
    completionState: input.manifest.completionState,
    ...(input.manifest.completionState === 'completed' ? {} : input.manifest.partialReason
      ? { partialReason: input.manifest.partialReason }
      : {}),
    cacheHitProvenance: input.manifest.cache.hits,
  };
  const artifact = {
    ...substantive,
    contentHash: canonicalContentHash(substantive),
    ...(input.launcher !== undefined ? { launcher: input.launcher } : {}),
  };
  return validateCanonicalRunArtifact(artifact);
}

export function validateCanonicalRunArtifact(value: unknown): CanonicalRunArtifact {
  const parsed = parseRawRunArtifact(value);
  const record = value as Record<string, unknown>;
  if (record.resultsSchema !== RESULTS_V2_SCHEMA_ID) throw new Error(`raw run must declare ${RESULTS_V2_SCHEMA_ID}`);
  const strict = readResultsEnvelope({
    schema: RESULTS_V2_SCHEMA_ID,
    generatedAtIso: parsed.generatedAtIso,
    ...(record.env !== undefined ? { env: record.env } : {}),
    ...(record.support !== undefined ? { support: record.support } : {}),
    results: record.results,
  });
  const manifest = validateRunManifest(record.manifest);
  if (manifest.runId !== parsed.runId) throw new Error('raw run has no matching immutable run manifest');
  const completionState = record.completionState;
  if (!isCompletionState(completionState) || completionState !== manifest.completionState) {
    throw new Error('raw run completion state does not match its manifest');
  }
  if (completionState === 'completed' && (record.partialReason !== undefined || manifest.partialReason !== undefined)) {
    throw new Error('a completed run cannot carry a stale partial reason');
  }
  if (completionState === 'completed' && manifest.observedCellCount !== manifest.expectedCellCount) {
    throw new Error('a completed run must account for every expected cell');
  }
  if (completionState !== 'completed' &&
      (typeof record.partialReason !== 'string' || !record.partialReason || record.partialReason !== manifest.partialReason)) {
    throw new Error('a non-complete run must carry one manifest-matching partial reason');
  }
  if (strict.results.length !== manifest.observedCellCount) {
    throw new Error('raw run result count does not match manifest observedCellCount');
  }
  if (record.suiteVersion !== manifest.suiteVersion) throw new Error('raw run suiteVersion does not match its manifest');
  if (record.generatedAtIso !== manifest.endedAtIso) throw new Error('raw run generatedAtIso does not match manifest endedAtIso');
  if (canonicalContentHash(record.support) !== canonicalContentHash(manifest.capabilities)) {
    throw new Error('raw run support snapshot does not match its manifest');
  }
  const cacheHitProvenance = record.cacheHitProvenance;
  if (canonicalContentHash(cacheHitProvenance) !== canonicalContentHash(manifest.cache.hits)) {
    throw new Error('raw run cache-hit provenance does not match its manifest');
  }
  const contentHash = record.contentHash;
  if (typeof contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(contentHash)) {
    throw new Error('raw run contentHash must be a lowercase SHA-256 digest');
  }
  const expectedHash = canonicalContentHash(artifactHashProjection(record));
  if (contentHash !== expectedHash) throw new Error(`raw run contentHash mismatch; expected ${expectedHash}`);
  return deepFreezeJson({
    ...record,
    results: strict.results,
  }) as unknown as CanonicalRunArtifact;
}

export function validateRunManifest(value: unknown): RunManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('run manifest must be an object');
  const manifest = value as Record<string, unknown>;
  if (manifest.schema !== APP_RUN_MANIFEST_SCHEMA) throw new Error(`run manifest must declare ${APP_RUN_MANIFEST_SCHEMA}`);
  if (manifest.resultSchema !== RESULTS_V2_SCHEMA_ID) throw new Error(`run manifest must declare ${RESULTS_V2_SCHEMA_ID}`);
  if (manifest.statusModelVersion !== APP_STATUS_MODEL_VERSION) throw new Error('run manifest status model is unsupported');
  for (const field of [
    'runId', 'startedAtIso', 'suiteVersion', 'buildRevision', 'scenarioDefinitionDigest',
    'oracleDefinitionDigest', 'executionOrderDigest', 'manifestDigest',
  ] as const) {
    if (typeof manifest[field] !== 'string' || !manifest[field]) throw new Error(`run manifest ${field} is missing`);
  }
  if (!Number.isFinite(Date.parse(manifest.startedAtIso as string))) throw new Error('run manifest startedAtIso is invalid');
  if (manifest.endedAtIso !== undefined &&
      (typeof manifest.endedAtIso !== 'string' || !Number.isFinite(Date.parse(manifest.endedAtIso)))) {
    throw new Error('run manifest endedAtIso is invalid');
  }
  if (!isCompletionState(manifest.completionState)) throw new Error('run manifest completion state is invalid');
  for (const field of ['engineInstanceIds', 'selectedInputs', 'registrationFailures'] as const) {
    if (!Array.isArray(manifest[field])) throw new Error(`run manifest ${field} must be an array`);
  }
  for (const field of ['browser', 'capabilities', 'configuration', 'engineConfigurations', 'cache'] as const) {
    if (!manifest[field] || typeof manifest[field] !== 'object' || Array.isArray(manifest[field])) {
      throw new Error(`run manifest ${field} must be an object`);
    }
  }
  for (const field of ['expectedCellCount', 'observedCellCount'] as const) {
    if (!Number.isSafeInteger(manifest[field]) || (manifest[field] as number) < 0) {
      throw new Error(`run manifest ${field} must be a non-negative safe integer`);
    }
  }
  if ((manifest.observedCellCount as number) > (manifest.expectedCellCount as number)) {
    throw new Error('run manifest observedCellCount exceeds expectedCellCount');
  }
  const substantive = { ...manifest };
  delete substantive.manifestDigest;
  const expected = canonicalContentHash(substantive);
  if (manifest.manifestDigest !== expected) throw new Error(`run manifest digest mismatch; expected ${expected}`);
  return deepFreezeJson(manifest) as unknown as RunManifest;
}

export function withLauncherProvenance(
  artifact: CanonicalRunArtifact,
  launcher: unknown,
): CanonicalRunArtifact {
  return validateCanonicalRunArtifact({ ...artifact, launcher });
}

export interface AppReportArtifacts {
  json: ReportJson & { run: AppReportRunSummary };
  jsonText: string;
  markdown: string;
}

export interface AppReportRunSummary {
  runId: string;
  completionState: RunCompletionState;
  resultCount: number;
  corpusChecksum?: string;
  statusCounts: Record<string, number>;
  partialCount: number;
}

/** Build JSON and Markdown from the exact strict rows in the raw artifact, with matching run facts. */
export function buildAppReportArtifacts(artifact: CanonicalRunArtifact): AppReportArtifacts {
  const summary: AppReportRunSummary = {
    runId: artifact.runId,
    completionState: artifact.completionState,
    resultCount: artifact.results.length,
    ...(artifact.manifest.corpusChecksum ? { corpusChecksum: artifact.manifest.corpusChecksum } : {}),
    statusCounts: statusCounts(artifact.results),
    partialCount: artifact.results.filter((result) => result.coverage?.grade === 'partial').length,
  };
  const built = buildReport({
    results: artifact.results,
    suiteVersion: artifact.suiteVersion,
    generatedAtIso: artifact.generatedAtIso,
    contextForResult: () => ({ runId: artifact.runId, observedAtIso: artifact.generatedAtIso }),
  });
  const reportData = { ...built.json, run: summary } as Record<string, unknown>;
  delete reportData.contentHash;
  delete reportData.envelope;
  const json = {
    ...reportData,
    contentHash: canonicalContentHash(reportData),
    envelope: built.json.envelope,
  } as unknown as ReportJson & { run: AppReportRunSummary };
  validateReportArtifact(json);
  const baseMarkdown = renderReportMarkdown(json);
  const runLines = [
    `Run id: \`${summary.runId}\``,
    `Completion: **${summary.completionState}**`,
    `Cells: ${summary.resultCount}`,
    `Corpus checksum: \`${summary.corpusChecksum ?? 'not available'}\``,
    `Status facts: ${Object.entries(summary.statusCounts).map(([status, count]) => `${status} ${count}`).join(', ') || 'none'}`,
    `Partial coverage cells: ${summary.partialCount}`,
  ];
  const firstBreak = baseMarkdown.indexOf('\n\n');
  const markdown = firstBreak >= 0
    ? `${baseMarkdown.slice(0, firstBreak)}\n\n${runLines.join('  \n')}\n${baseMarkdown.slice(firstBreak)}`
    : `${baseMarkdown}\n\n${runLines.join('  \n')}\n`;
  return { json, jsonText: stablePrettyJson(json), markdown };
}

export function strictResultsEnvelope(
  results: readonly ScenarioResult[],
  generatedAtIso: string,
  env?: unknown,
  support?: unknown,
  scenarioIdentity?: V1MigrationContext['scenarioIdentity'],
): ResultsEnvelopeV2 {
  const allV2 = results.every((result) =>
    result.schemaVersion === 2 &&
    typeof result.definitionHash === 'string' &&
    result.instance !== undefined);
  if (allV2) {
    return readResultsEnvelope({
      schema: RESULTS_V2_SCHEMA_ID,
      generatedAtIso,
      ...(env !== undefined ? { env } : {}),
      ...(support !== undefined ? { support } : {}),
      results,
    });
  }

  // Current in-page rows already use typed three-way outcomes but may not yet carry their persisted
  // V2 identity fields. They are not legacy boolean rows and must never be sent through the v1
  // boolean migrator. Re-envelope them once at this writer boundary, then run the strict V2 reader.
  const typedTransitional = results.every((result) => result.oracleOutcomes.every((outcome) =>
    outcome && typeof outcome === 'object' && 'state' in outcome));
  if (typedTransitional) {
    const reenveloped = results.map((result) => reenvelopeTypedResult(result, scenarioIdentity));
    return readResultsEnvelope({
      schema: RESULTS_V2_SCHEMA_ID,
      generatedAtIso,
      ...(env !== undefined ? { env } : {}),
      ...(support !== undefined ? { support } : {}),
      results: reenveloped,
    });
  }

  const envelope = {
    schema: 'media-browser-test/results@1',
    generatedAtIso,
    ...(env !== undefined ? { env } : {}),
    ...(support !== undefined ? { support } : {}),
    results,
  };
  return readResultsEnvelope(envelope, {
    ...(scenarioIdentity ? { scenarioIdentity } : {}),
    inputIdentity: (result) => {
      const selection = result.selection as Record<string, unknown> | undefined;
      const inputVariantId = typeof result.inputVariantId === 'string'
        ? result.inputVariantId
        : typeof selection?.file === 'string'
          ? `selected:${selection.file}`
          : 'selected:baked';
      const inputSha256 = typeof result.inputSha256 === 'string'
        ? result.inputSha256
        : typeof selection?.sha256 === 'string'
          ? selection.sha256
          : undefined;
      return inputSha256 ? { inputVariantId, inputSha256 } : undefined;
    },
  });
}

function reenvelopeTypedResult(
  result: ScenarioResult,
  scenarioIdentity?: V1MigrationContext['scenarioIdentity'],
): ScenarioResultV2 {
  const identity = result.scenarioRevision && result.definitionHash
    ? { revision: result.scenarioRevision, definitionHash: result.definitionHash }
    : scenarioIdentity?.(result.scenarioId);
  if (!identity) throw new Error(`cannot persist ${result.scenarioId}: scenario identity is unavailable`);
  const selection = result.selection;
  const inputVariantId = result.inputVariantId ?? result.instance?.inputVariantId ??
    (selection?.file ? `selected:${selection.file}` : 'selected:baked');
  const inputSha256 = result.inputSha256 ?? result.instance?.inputSha256 ?? selection?.sha256 ??
    (result.exhaustive?.length ? selection?.executedInputDigest : undefined) ?? null;
  const oracleOutcomes = result.oracleOutcomes.map(persistedOracleOutcome);
  const exhaustive = result.exhaustive?.map((entry) => ({
    ...entry,
    oracleOutcomes: entry.oracleOutcomes.map(persistedOracleOutcome),
  }));
  return {
    ...result,
    schemaVersion: 2,
    scenarioRevision: identity.revision,
    definitionHash: identity.definitionHash,
    instance: {
      scenarioId: result.scenarioId,
      scenarioRevision: identity.revision,
      definitionHash: identity.definitionHash,
      inputVariantId,
      inputSha256,
    },
    inputVariantId,
    ...(inputSha256 ? { inputSha256 } : {}),
    oracleOutcomes,
    ...(exhaustive ? { exhaustive } : {}),
  } as ScenarioResultV2;
}

function persistedOracleOutcome(
  outcome: ScenarioResult['oracleOutcomes'][number],
): ScenarioResultV2['oracleOutcomes'][number] {
  // Persistence is a validation boundary, not a place to invent semantic evidence. The strict
  // results@2 reader below will reject any malformed/missing reason code from a live producer.
  return outcome;
}

function selectedInputEntries(results: readonly ScenarioResult[]): SelectedInputManifestEntry[] {
  const entries = new Map<string, SelectedInputManifestEntry>();
  for (const result of results) {
    const selections = result.exhaustive?.length
      ? result.exhaustive.map((file) => file.selection ?? {
          file: file.file,
          sha256: file.sha256,
          isBaked: file.isBaked,
        })
      : result.selection ? [result.selection] : [];
    for (const selection of selections) {
      const entry: SelectedInputManifestEntry = {
        scenarioId: result.scenarioId,
        file: selection.file,
        ...(selection.sha256 ? { sha256: selection.sha256 } : {}),
        isBaked: selection.isBaked,
        ...(selection.candidateCount !== undefined ? { candidateCount: selection.candidateCount } : {}),
        ...(selection.executedInputDigest ? { executedInputDigest: selection.executedInputDigest } : {}),
        ...(selection.eligiblePoolDigest ? { eligiblePoolDigest: selection.eligiblePoolDigest } : {}),
      };
      entries.set(`${entry.scenarioId}\0${entry.file}\0${entry.sha256 ?? ''}`, entry);
    }
  }
  return [...entries.values()].sort((a, b) =>
    a.scenarioId.localeCompare(b.scenarioId) || a.file.localeCompare(b.file) ||
    (a.sha256 ?? '').localeCompare(b.sha256 ?? ''));
}

function registrationFailures(registration: RegistrationReport): RunManifest['registrationFailures'] {
  return [
    ...registration.engines
      .filter((entry) => !entry.ok)
      .map((entry) => ({ kind: 'engine' as const, id: entry.id, reason: entry.reason ?? 'unknown failure' })),
    ...registration.scenarioFamilies
      .filter((entry) => !entry.ok)
      .map((entry) => ({ kind: 'scenario-family' as const, id: entry.family, reason: entry.reason ?? 'unknown failure' })),
  ];
}

function freezeManifest(value: Omit<RunManifest, 'manifestDigest'> | (Partial<RunManifest> & { schema: typeof APP_RUN_MANIFEST_SCHEMA })): RunManifest {
  const data = { ...value } as Record<string, unknown>;
  delete data.manifestDigest;
  return deepFreezeJson({ ...data, manifestDigest: canonicalContentHash(data) }) as unknown as RunManifest;
}

function artifactHashProjection(record: Record<string, unknown>): Record<string, unknown> {
  const projection = { ...record };
  delete projection.contentHash;
  // Launcher provenance is the sole permitted path difference for the same in-page run.
  delete projection.launcher;
  return projection;
}

function isCompletionState(value: unknown): value is RunCompletionState {
  return value === 'idle' || value === 'validating' || value === 'running' || value === 'stopping' ||
    value === 'completed' || value === 'completed-partial' || value === 'failed';
}

function statusCounts(results: readonly ScenarioResult[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const result of results) counts[result.status] = (counts[result.status] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function deepFreezeJson<T>(value: T): T {
  const cloned = JSON.parse(JSON.stringify(value)) as T;
  const freeze = (item: unknown): void => {
    if (!item || typeof item !== 'object' || Object.isFrozen(item)) return;
    Object.freeze(item);
    for (const child of Object.values(item as Record<string, unknown>)) freeze(child);
  };
  freeze(cloned);
  return cloned;
}
