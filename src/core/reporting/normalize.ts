import type { BrowserName } from '../engine.ts';
import type { MetricId, OracleVerdict, ResultStatus, ScenarioResult } from '../scenario.ts';
import {
  streamingCohortProjection,
  type StreamingWorkIdentity,
} from '../../features/streaming-output/comparability.ts';
import { canonicalContentHash, canonicalJson, normalizeJson } from './canonical.ts';
import { metricSortKey, normalizeMetricObservation, summarizeMetricAcrossVariants } from './metrics.ts';
import type {
  CohortDimensions,
  EngineRecord,
  ExpectedCellDefinition,
  ExpectedMatrixDefinition,
  ExpectedVariantDefinition,
  JsonObject,
  MetricAggregation,
  MetricDirection,
  MetricObservation,
  NormalizedObservation,
  ReportingNormalizationContext,
  ReportingPolicy,
  SampleAxis,
  StreamingWorkFacts,
  StreamingWorkMissingField,
  StreamingWorkObservation,
  VariantObservation,
} from './model.ts';
import { DEFAULT_REPORTING_POLICY } from './model.ts';

export const REPORTABLE_METRICS: readonly MetricId[] = [
  'opsPerSec',
  'packetsPerSec',
  'framesPerSec',
  'sampleFramesPerSec',
  'decodeFps',
  'encodeFps',
  'throughputRealtime',
  'seekMs',
  'timeToFirstFrame',
  'timeToFirstByte',
  'bundleSize',
  'loadInit',
  'wall',
  'peakMemory',
  'bytesOut',
  'sourceReads',
  'targetWrites',
  'longtasks',
];

const METRIC_IDS = new Set<string>(REPORTABLE_METRICS);

export function normalizeScenarioResults(
  results: readonly ScenarioResult[],
  contextForResult?: (result: ScenarioResult, index: number) => ReportingNormalizationContext | undefined,
  defaultPolicy: Partial<ReportingPolicy> = {},
): NormalizedObservation[] {
  return results
    .map((result, index) => normalizeScenarioResult(result, contextForResult?.(result, index), defaultPolicy))
    .sort(compareObservations);
}

export function normalizeScenarioResult(
  result: ScenarioResult,
  context: ReportingNormalizationContext = {},
  defaultPolicy: Partial<ReportingPolicy> = {},
): NormalizedObservation {
  const source = result as unknown as Record<string, unknown>;
  const reporting = asRecord(source.reporting) ?? asRecord(source.reportingContext) ?? {};
  const embeddedCohort = asRecord(reporting.cohortDimensions) ?? asRecord(source.cohortDimensions) ?? {};
  const embeddedEngine = asRecord(reporting.engineRecord) ?? asRecord(source.engineRecord) ?? {};
  const policy = normalizePolicy({ ...defaultPolicy, ...context.policy });
  const variants = normalizeVariants(result);
  const validVariantIds = variants
    .filter(isValidVariant)
    .map((variant) => variant.variantId)
    .sort();
  const topMetrics = normalizeTopMetrics(result, variants, validVariantIds);
  const primaryMetric = isMetricId(result.primaryMetric) ? result.primaryMetric : inferPrimaryMetric(topMetrics);
  const streamingWork = normalizeStreamingWorkObservation(result, variants, topMetrics, primaryMetric);
  const evidence = normalizeResultEvidence(source);
  const environment = normalizeJson(result.env ?? {}) as JsonObject;
  const observedAtIso = firstString(context.observedAtIso, source.observedAtIso, result.startedAtIso);
  const runId = firstString(context.runId, source.runId, reporting.runId)
    ?? `run-${canonicalContentHash({
      suiteVersion: result.env?.suiteVersion ?? null,
      browser: result.browser,
      environment,
      selectionSeed: result.selection?.runSeed ?? null,
    })}`;
  const observationId = firstString(source.observationId, reporting.observationId)
    ?? `obs-${canonicalContentHash({ runId, engineId: result.engineId, browser: result.browser, scenarioId: result.scenarioId })}`;
  const engine = normalizeEngineRecord(result, { ...embeddedEngine, ...(context.engineRecord ?? {}) });
  const cohortInput = deriveCohortInput(
    result,
    variants,
    topMetrics,
    primaryMetric,
    policy,
    { ...embeddedCohort, ...(context.cohortDimensions ?? {}) },
    context.artifactSchemaMajor,
    streamingWork,
  );
  const { dimensions: cohortDimensions, missing: cohortMissingDimensions } = completeCohortDimensions(
    cohortInput,
    streamingWork !== undefined,
  );
  const exclusionReasons: string[] = [];
  if (!engine.frameworkVersion || engine.frameworkVersion === 'unknown') exclusionReasons.push('ENGINE_VERSION_MISSING');
  if (!engine.adapterVersion || engine.adapterVersion === 'unknown') exclusionReasons.push('ADAPTER_VERSION_MISSING');
  exclusionReasons.push(...cohortMissingDimensions.map((field) => `COHORT_DIMENSION_MISSING:${field}`));
  if (streamingWork?.conflictFields.length) {
    exclusionReasons.push(...streamingWork.conflictFields.map((field) => `STREAMING_WORK_IDENTITY_CONFLICT:${field}`));
  }
  if (cohortDimensions && primaryMetric) {
    const primary = topMetrics.find((metric) => metric.metric === primaryMetric && metric.state === 'AVAILABLE');
    if (
      primary?.state === 'AVAILABLE'
      && (
        primary.unit !== cohortDimensions.primaryUnit
        || primary.direction !== cohortDimensions.metricDirection
        || primary.sampleAxis !== cohortDimensions.sampleAxis
        || primary.aggregation !== cohortDimensions.aggregation
      )
    ) exclusionReasons.push('COHORT_METRIC_PROTOCOL_MISMATCH');
  }

  const substantive = {
    runId,
    observationId,
    engineId: result.engineId,
    browser: result.browser,
    scenarioId: result.scenarioId,
    family: result.family,
    primaryMetric: primaryMetric ?? null,
    variants,
    metrics: topMetrics,
    environment,
    engine,
    cohortInput,
    ...(streamingWork ? { streamingWork } : {}),
    exclusionReasons: exclusionReasons.slice().sort(),
    evidence: removeVolatileTimestamps(evidence),
  };
  const contentHash = canonicalContentHash(substantive);

  return {
    runId,
    observationId,
    contentHash,
    ...(observedAtIso ? { observedAtIso } : {}),
    engineId: result.engineId,
    browser: result.browser,
    scenarioId: result.scenarioId,
    family: result.family,
    ...(primaryMetric ? { primaryMetric } : {}),
    variants,
    metrics: topMetrics,
    environment,
    engine,
    cohortInput,
    ...(cohortDimensions ? { cohortDimensions } : {}),
    cohortMissingDimensions,
    ...(streamingWork ? { streamingWork } : {}),
    exclusionReasons: [...new Set(exclusionReasons)].sort(),
    evidence,
  };
}

/** Construct the selected matrix before observations are reduced. */
export function deriveExpectedMatrix(
  results: readonly ScenarioResult[],
  explicit?: ExpectedMatrixDefinition,
): ExpectedMatrixDefinition {
  if (explicit) return normalizeExpectedMatrix(explicit);
  const engines = [...new Set(results.map((result) => result.engineId))].sort();
  const browsers = [...new Set(results.map((result) => result.browser))].sort();
  const scenarios = [...new Set(results.map((result) => result.scenarioId))].sort();
  const familyByScenario = new Map<string, string>();
  const variantsByScenarioBrowser = new Map<string, Map<string, ExpectedVariantDefinition>>();
  for (const result of results) {
    familyByScenario.set(result.scenarioId, result.family);
    const key = scenarioBrowserKey(result.browser, result.scenarioId);
    let variants = variantsByScenarioBrowser.get(key);
    if (!variants) {
      variants = new Map();
      variantsByScenarioBrowser.set(key, variants);
    }
    for (const variant of expectedVariantsFromResult(result)) variants.set(variant.variantId, variant);
  }

  const cells: ExpectedCellDefinition[] = [];
  for (const browser of browsers) {
    for (const scenarioId of scenarios) {
      const shared = variantsByScenarioBrowser.get(scenarioBrowserKey(browser, scenarioId));
      const variants = shared && shared.size > 0
        ? [...shared.values()].sort(compareExpectedVariants)
        : [{ variantId: scenarioId, file: scenarioId }];
      for (const engineId of engines) {
        cells.push({
          engineId,
          browser,
          scenarioId,
          family: familyByScenario.get(scenarioId) ?? scenarioId.split('/')[0] ?? 'unknown',
          variants: variants.map((variant) => ({ ...variant })),
        });
      }
    }
  }
  const normalized = cells.sort(compareExpectedCells);
  return { definitionId: `expected-${canonicalContentHash(normalized)}`, cells: normalized };
}

export function normalizeExpectedMatrix(expected: ExpectedMatrixDefinition): ExpectedMatrixDefinition {
  const seenCells = new Set<string>();
  const cells = expected.cells.map((cell) => {
    const cellKey = expectedCellKey(cell.engineId, cell.browser, cell.scenarioId);
    if (seenCells.has(cellKey)) throw new Error(`[EXPECTED_CELL_DUPLICATE] ${cellKey}`);
    seenCells.add(cellKey);
    const seenVariants = new Set<string>();
    const variants = cell.variants.map((variant) => {
      if (!variant.variantId || !variant.file) throw new Error(`[EXPECTED_VARIANT_INVALID] ${cellKey}`);
      if (seenVariants.has(variant.variantId)) {
        throw new Error(`[EXPECTED_VARIANT_DUPLICATE] ${cellKey} ${variant.variantId}`);
      }
      seenVariants.add(variant.variantId);
      return {
        variantId: variant.variantId,
        file: variant.file,
        ...(variant.sha256 ? { sha256: variant.sha256 } : {}),
        ...(variant.isBaked !== undefined ? { isBaked: variant.isBaked } : {}),
      };
    }).sort(compareExpectedVariants);
    if (variants.length === 0) throw new Error(`[EXPECTED_VARIANTS_EMPTY] ${cellKey}`);
    return { ...cell, variants };
  }).sort(compareExpectedCells);
  return { definitionId: expected.definitionId || `expected-${canonicalContentHash(cells)}`, cells };
}

export function expectedCellKey(engineId: string, browser: BrowserName, scenarioId: string): string {
  return `${engineId}\u0000${browser}\u0000${scenarioId}`;
}

export function scenarioBrowserKey(browser: BrowserName, scenarioId: string): string {
  return `${browser}\u0000${scenarioId}`;
}

export function compareObservations(a: NormalizedObservation, b: NormalizedObservation): number {
  return a.browser.localeCompare(b.browser)
    || a.scenarioId.localeCompare(b.scenarioId)
    || a.engineId.localeCompare(b.engineId)
    || a.runId.localeCompare(b.runId)
    || a.observationId.localeCompare(b.observationId)
    || a.contentHash.localeCompare(b.contentHash);
}

function normalizeVariants(result: ScenarioResult): VariantObservation[] {
  const source = result as unknown as Record<string, unknown>;
  const explicit = Array.isArray(source.variants) ? source.variants : Array.isArray(source.variantOutcomes) ? source.variantOutcomes : undefined;
  if (explicit) return explicit.map((variant, index) => normalizeExplicitVariant(variant, result, index)).sort(compareVariants);
  if (Array.isArray(result.exhaustive) && result.exhaustive.length > 0) {
    return result.exhaustive
      .map((variant, index) => normalizeLegacyVariant(variant as unknown as Record<string, unknown>, result, index))
      .sort(compareVariants);
  }
  return [normalizeOrdinaryVariant(result)];
}

function normalizeExplicitVariant(value: unknown, result: ScenarioResult, index: number): VariantObservation {
  const record = asRecord(value) ?? {};
  const file = firstString(record.file, record.variantId, result.selection?.file, result.scenarioId) ?? result.scenarioId;
  const sha256 = firstString(record.sha256);
  const variantId = firstString(record.variantId, record.id) ?? stableVariantId(file, sha256);
  const execution = isExecutionState(record.execution)
    ? record.execution
    : executionAndVerdict(isResultStatus(record.status) ? record.status : result.status).execution;
  const statusVerdict = executionAndVerdict(isResultStatus(record.status) ? record.status : result.status).verdict;
  const explicitVerdict = isOracleVerdict(record.verdict) ? record.verdict : statusVerdict;
  const verdict = execution === 'EXECUTED' ? explicitVerdict : undefined;
  const reason = firstString(record.reason, record.detail);
  const reasonCode = firstString(record.reasonCode) ?? extractReasonCode(reason);
  const oracleOutcomes = normalizeOracleOutcomes(record.oracleOutcomes ?? []);
  const candidateEvidence = normalizeCandidateEvidence(record.candidateEvidence);
  const metrics = normalizeMetricCollection(record.metrics ?? record.bench, {
    sampleAxis: 'iteration',
    validVariantIds: verdict === 'PASS' ? [variantId] : [],
  });
  const evidence = normalizeVariantEvidence(record, index);
  return {
    variantId,
    file,
    ...(sha256 ? { sha256 } : {}),
    ...(typeof record.isBaked === 'boolean' ? { isBaked: record.isBaked } : {}),
    execution,
    ...(verdict ? { verdict } : {}),
    ...(reasonCode ? { reasonCode } : {}),
    ...(reason ? { reason } : {}),
    oracleOutcomes,
    ...(candidateEvidence ? { candidateEvidence } : {}),
    metrics,
    evidence,
  };
}

function normalizeLegacyVariant(
  record: Record<string, unknown>,
  result: ScenarioResult,
  index: number,
): VariantObservation {
  const file = firstString(record.file) ?? `variant-${index}`;
  const sha256 = firstString(record.sha256);
  const variantId = firstString(record.variantId) ?? stableVariantId(file, sha256);
  const status = isResultStatus(record.status) ? record.status : result.status;
  const { execution, verdict } = executionAndVerdict(status);
  const reason = firstString(record.reason);
  const reasonCode = firstString(record.reasonCode) ?? extractReasonCode(reason);
  const candidateEvidence = normalizeCandidateEvidence(record.candidateEvidence);
  return {
    variantId,
    file,
    ...(sha256 ? { sha256 } : {}),
    ...(typeof record.isBaked === 'boolean' ? { isBaked: record.isBaked } : {}),
    execution,
    ...(verdict ? { verdict } : {}),
    ...(reasonCode ? { reasonCode } : {}),
    ...(reason ? { reason } : {}),
    oracleOutcomes: normalizeOracleOutcomes(record.oracleOutcomes ?? []),
    ...(candidateEvidence ? { candidateEvidence } : {}),
    metrics: normalizeMetricCollection(record.metrics ?? record.bench, {
      sampleAxis: 'iteration',
      validVariantIds: verdict === 'PASS' ? [variantId] : [],
    }),
    evidence: normalizeVariantEvidence(record, index),
  };
}

function normalizeOrdinaryVariant(result: ScenarioResult): VariantObservation {
  const file = result.selection?.file ?? result.scenarioId;
  const sha256 = result.selection?.sha256;
  const variantId = stableVariantId(file, sha256);
  const { execution, verdict } = executionAndVerdict(result.status);
  return {
    variantId,
    file,
    ...(sha256 ? { sha256 } : {}),
    ...(result.selection ? { isBaked: result.selection.isBaked } : {}),
    execution,
    ...(verdict ? { verdict } : {}),
    ...(extractReasonCode(result.reason) ? { reasonCode: extractReasonCode(result.reason)! } : {}),
    ...(result.reason ? { reason: result.reason } : {}),
    oracleOutcomes: normalizeOracleOutcomes(result.oracleOutcomes),
    ...(result.candidateEvidence
      ? { candidateEvidence: normalizeJson(result.candidateEvidence) as JsonObject }
      : {}),
    metrics: normalizeMetricCollection(result.bench, {
      sampleAxis: 'iteration',
      validVariantIds: verdict === 'PASS' ? [variantId] : [],
      unavailableReasonCode: result.measurement?.state === 'UNAVAILABLE'
        ? result.measurement.reasonCode
        : undefined,
      unavailableReason: result.measurement?.state === 'UNAVAILABLE'
        ? result.measurement.detail
        : undefined,
    }),
    evidence: normalizeJson({
      file,
      ...(sha256 ? { sha256 } : {}),
      status: result.status,
      ...(result.reason ? { reason: result.reason } : {}),
      oracleOutcomes: normalizeOracleOutcomes(result.oracleOutcomes),
      ...(result.bench ? { bench: result.bench } : {}),
      ...(result.measurement ? { measurement: result.measurement } : {}),
      ...(result.support ? { support: result.support } : {}),
      ...(result.selection ? { selection: result.selection } : {}),
      ...(result.candidateEvidence ? { candidateEvidence: result.candidateEvidence } : {}),
    }) as JsonObject,
  };
}

function normalizeCandidateEvidence(value: unknown): JsonObject | undefined {
  return asRecord(value) ? normalizeJson(value) as JsonObject : undefined;
}

function normalizeTopMetrics(
  result: ScenarioResult,
  variants: readonly VariantObservation[],
  validVariantIds: readonly string[],
): MetricObservation[] {
  const sampleAxis: SampleAxis = variants.length > 1 ? 'file' : 'iteration';
  const metrics = normalizeMetricCollection(result.bench, {
    sampleAxis,
    validVariantIds,
    unavailableReasonCode: result.measurement?.state === 'UNAVAILABLE'
      ? result.measurement.reasonCode
      : undefined,
    unavailableReason: result.measurement?.state === 'UNAVAILABLE'
      ? result.measurement.detail
      : undefined,
  });
  const byMetric = new Map(metrics.map((metric) => [metric.metric, metric]));
  for (const metric of REPORTABLE_METRICS) {
    if (!byMetric.has(metric) && variants.some((variant) => variant.metrics.some((entry) => entry.metric === metric))) {
      byMetric.set(metric, summarizeMetricAcrossVariants(metric, variants));
    }
  }
  if (result.primaryMetric && !byMetric.has(result.primaryMetric)) {
    byMetric.set(
      result.primaryMetric,
      normalizeMetricObservation(result.primaryMetric, undefined, {
        unavailableReasonCode: result.measurement?.state === 'UNAVAILABLE'
          ? result.measurement.reasonCode
          : 'PRIMARY_METRIC_NOT_OBSERVED',
        unavailableReason: result.measurement?.state === 'UNAVAILABLE'
          ? result.measurement.detail
          : undefined,
      }),
    );
  }
  return [...byMetric.values()].sort((a, b) => metricSortKey(a).localeCompare(metricSortKey(b)));
}

function normalizeMetricCollection(
  value: unknown,
  options: Parameters<typeof normalizeMetricObservation>[2],
): MetricObservation[] {
  const output: MetricObservation[] = [];
  if (Array.isArray(value)) {
    for (const raw of value) {
      const record = asRecord(raw);
      if (!record || !isMetricId(record.metric)) continue;
      if (record.state === 'UNAVAILABLE') {
        const normalized = normalizeMetricObservation(record.metric, undefined, {
          unavailableReasonCode: firstString(record.reasonCode) ?? 'METRIC_UNAVAILABLE',
          unavailableReason: firstString(record.reason),
        });
        output.push(normalized);
      } else {
        output.push(normalizeMetricObservation(record.metric, {
          ...record,
          aggregate: record.aggregate ?? record.rankedValue,
        }, options));
      }
    }
  } else {
    const record = asRecord(value);
    if (record) {
      for (const [metric, raw] of Object.entries(record)) {
        if (isMetricId(metric)) output.push(normalizeMetricObservation(metric, raw, options));
      }
    }
  }
  const unique = new Map<string, MetricObservation>();
  for (const metric of output) {
    const previous = unique.get(metric.metric);
    if (previous && canonicalJson(previous) !== canonicalJson(metric)) {
      unique.set(metric.metric, normalizeMetricObservation(metric.metric, undefined, {
        unavailableReasonCode: 'DUPLICATE_METRIC_CONFLICT',
      }));
    } else {
      unique.set(metric.metric, metric);
    }
  }
  return [...unique.values()].sort((a, b) => metricSortKey(a).localeCompare(metricSortKey(b)));
}

function deriveCohortInput(
  result: ScenarioResult,
  variants: readonly VariantObservation[],
  metrics: readonly MetricObservation[],
  primaryMetric: MetricId | undefined,
  policy: ReportingPolicy,
  provided: Record<string, unknown>,
  artifactSchemaMajor?: number,
  streamingWork?: StreamingWorkObservation,
): JsonObject {
  const primary = primaryMetric ? metrics.find((metric) => metric.metric === primaryMetric) : undefined;
  const available = primary?.state === 'AVAILABLE' ? primary : undefined;
  const support = result.support ? normalizeJson(result.support) : undefined;
  const selectedFiles = variants.map((variant) => ({ variantId: variant.variantId, file: variant.file, sha256: variant.sha256 ?? null }));
  const mutationEvidence = mutationSnapshot(result.support);
  const defaults: Record<string, unknown> = {
    artifactSchemaMajor: artifactSchemaMajor ?? 1,
    suiteVersion: result.env?.suiteVersion,
    scenarioId: result.scenarioId,
    oraclePolicyVersion: 'media-test/oracle-outcome@3way-v1',
    browserFamily: result.browser,
    browserBuild: result.env?.browserVersion,
    supportSnapshotHash: support ? canonicalContentHash(support) : undefined,
    powerState: result.env?.acPower === true ? 'AC' : result.env?.acPower === false ? 'BATTERY' : undefined,
    gpuDriver: result.env?.gpu,
    corpusChecksum: result.env?.corpusChecksum,
    selectedFileSetHash: canonicalContentHash(selectedFiles),
    mutationHash: mutationEvidence ? canonicalContentHash(mutationEvidence) : undefined,
    rotationSeed: result.selection?.runSeed,
    primaryMetric,
    primaryUnit: primary?.unit,
    metricDirection: primary?.direction,
    metricNumerator: primaryMetric ? metricRatioDefinition(primaryMetric).numerator : undefined,
    metricDenominator: primaryMetric ? metricRatioDefinition(primaryMetric).denominator : undefined,
    sampleAxis: available?.sampleAxis,
    aggregation: available?.aggregation,
    warmup: available?.warmup,
    requestedIterations: available?.requestedIterations,
    minRankSamples: policy.minRankSamples,
    uncertaintyPolicy: policy.uncertaintyPolicy,
  };
  const protectedStreamingFacts = streamingWork ? {
    fixtureSha256: streamingWork.facts.fixtureSha256,
    resolvedRepresentation: streamingWork.facts.resolvedRepresentation,
    observerPolicy: streamingWork.facts.observerPolicy,
    retainedOutputPolicy: streamingWork.facts.retainedOutputPolicy,
    measurementContract: streamingWork.facts.measurementContract,
    // These existing shared dimensions are part of the same FEAT-89 identity. Persisting them from
    // the measured observation prevents a caller-provided cohort record from laundering a mismatch.
    browserFamily: streamingWork.facts.browser,
    warmup: streamingWork.facts.warmup,
    requestedIterations: streamingWork.facts.iterations,
    primaryMetric: streamingWork.facts.metric,
    primaryUnit: streamingWork.facts.unit,
  } : {};
  return normalizeJson({ ...defaults, ...provided, ...protectedStreamingFacts }) as JsonObject;
}

function completeCohortDimensions(
  input: JsonObject,
  streamingOutput = false,
): { dimensions?: CohortDimensions; missing: string[] } {
  const missing: string[] = [];
  const keys = streamingOutput
    ? [...COHORT_DIMENSION_KEYS, ...STREAMING_COHORT_DIMENSION_KEYS]
    : COHORT_DIMENSION_KEYS;
  for (const key of keys) {
    const value = input[key];
    if (value === undefined || value === null || value === '' || (typeof value === 'number' && !Number.isFinite(value))) {
      missing.push(key);
    }
  }
  if (streamingOutput && typeof input.fixtureSha256 === 'string' && !SHA256_RE.test(input.fixtureSha256)) {
    missing.push('fixtureSha256');
  }
  if (missing.length > 0) return { missing: [...new Set(missing)] };
  return { dimensions: input as unknown as CohortDimensions, missing };
}

function normalizeEngineRecord(result: ScenarioResult, provided: Record<string, unknown>): EngineRecord {
  const at = result.engineId.lastIndexOf('@');
  const suffix = at >= 0 && at < result.engineId.length - 1 ? result.engineId.slice(at + 1) : undefined;
  const frameworkVersion = firstString(provided.frameworkVersion, provided.version, suffix) ?? 'unknown';
  const adapterVersion = firstString(provided.adapterVersion, result.env?.suiteVersion) ?? 'unknown';
  const configUsed = normalizeJson(provided.configUsed ?? result.env?.configUsed ?? null);
  const stable = { engineId: result.engineId, frameworkVersion, adapterVersion, configUsed };
  return { ...stable, recordHash: canonicalContentHash(stable) };
}

function normalizePolicy(input: Partial<ReportingPolicy>): ReportingPolicy {
  const minRankSamples = Number.isInteger(input.minRankSamples) && (input.minRankSamples ?? 0) >= 3
    ? input.minRankSamples!
    : DEFAULT_REPORTING_POLICY.minRankSamples;
  const relativeNoiseFloorPct = typeof input.relativeNoiseFloorPct === 'number'
    && Number.isFinite(input.relativeNoiseFloorPct)
    && input.relativeNoiseFloorPct >= 3
    ? input.relativeNoiseFloorPct
    : DEFAULT_REPORTING_POLICY.relativeNoiseFloorPct;
  return {
    minRankSamples,
    relativeNoiseFloorPct,
    uncertaintyPolicy: firstString(input.uncertaintyPolicy) ?? DEFAULT_REPORTING_POLICY.uncertaintyPolicy,
  };
}

function normalizeResultEvidence(source: Record<string, unknown>): JsonObject {
  const copy: Record<string, unknown> = { ...source };
  if (Array.isArray(copy.oracleOutcomes)) copy.oracleOutcomes = sortJsonArray(copy.oracleOutcomes);
  if (Array.isArray(copy.exhaustive)) {
    copy.exhaustive = copy.exhaustive
      .map((entry, index) => normalizeVariantEvidence(asRecord(entry) ?? { value: entry }, index))
      .sort((a, b) => variantEvidenceKey(a).localeCompare(variantEvidenceKey(b)));
  }
  if (Array.isArray(copy.variants)) {
    copy.variants = copy.variants
      .map((entry, index) => normalizeVariantEvidence(asRecord(entry) ?? { value: entry }, index))
      .sort((a, b) => variantEvidenceKey(a).localeCompare(variantEvidenceKey(b)));
  }
  return normalizeJson(copy) as JsonObject;
}

function normalizeVariantEvidence(record: Record<string, unknown>, index: number): JsonObject {
  const copy: Record<string, unknown> = { ...record };
  if (Array.isArray(copy.oracleOutcomes)) copy.oracleOutcomes = sortJsonArray(copy.oracleOutcomes);
  copy.__sourceIndex = undefined;
  const normalized = normalizeJson(copy) as JsonObject;
  if (!('file' in normalized) && !('variantId' in normalized)) normalized.variantId = `variant-${index}`;
  return normalized;
}

function normalizeOracleOutcomes(value: unknown): JsonValueArray {
  return Array.isArray(value) ? sortJsonArray(value) : [];
}

type JsonValueArray = ReturnType<typeof sortJsonArray>;

function sortJsonArray(values: readonly unknown[]): Array<ReturnType<typeof normalizeJson>> {
  return values.map((value) => normalizeJson(value)).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
}

function expectedVariantsFromResult(result: ScenarioResult): ExpectedVariantDefinition[] {
  return normalizeVariants(result).map((variant) => ({
    variantId: variant.variantId,
    file: variant.file,
    ...(variant.sha256 ? { sha256: variant.sha256 } : {}),
    ...(variant.isBaked !== undefined ? { isBaked: variant.isBaked } : {}),
  }));
}

function executionAndVerdict(status: ResultStatus): { execution: VariantObservation['execution']; verdict?: OracleVerdict } {
  if (status === 'PASS' || status === 'FAIL') {
    return { execution: 'EXECUTED', verdict: status };
  }
  return { execution: status };
}

function inferPrimaryMetric(metrics: readonly MetricObservation[]): MetricId | undefined {
  for (const metric of REPORTABLE_METRICS) {
    if (metrics.some((observation) => observation.metric === metric && observation.state === 'AVAILABLE')) return metric;
  }
  return undefined;
}

function mutationSnapshot(support: ScenarioResult['support']): unknown {
  const request = support?.request;
  if (!request || !Array.isArray(request.inputs)) return undefined;
  return request.inputs.map((input) => ({ id: input.id, mutated: input.mutated }));
}

function metricRatioDefinition(metric: MetricId): { numerator: string; denominator: string } {
  switch (metric) {
    case 'throughputRealtime': return { numerator: 'media duration seconds', denominator: 'wall seconds' };
    case 'decodeFps':
    case 'encodeFps':
    case 'framesPerSec': return { numerator: 'frames', denominator: 'wall seconds' };
    case 'sampleFramesPerSec': return { numerator: 'audio sample frames', denominator: 'wall seconds' };
    case 'opsPerSec': return { numerator: 'operations', denominator: 'wall seconds' };
    case 'packetsPerSec': return { numerator: 'packets', denominator: 'wall seconds' };
    default: return { numerator: metric, denominator: 'operation' };
  }
}

function normalizeStreamingWorkObservation(
  result: ScenarioResult,
  variants: readonly VariantObservation[],
  metrics: readonly MetricObservation[],
  primaryMetric: MetricId | undefined,
): StreamingWorkObservation | undefined {
  if (result.family !== 'streaming-output' && !result.scenarioId.startsWith('streaming-output/')) return undefined;

  const runtimes = streamingRuntimeEvidenceRecords(result);
  const comparabilityRecords = runtimes
    .map((runtime) => asRecord(runtime.comparability))
    .filter((value): value is Record<string, unknown> => value !== undefined);
  const conflicts = new Set<StreamingWorkMissingField>();
  const facts: StreamingWorkFacts = {};

  const fixture = canonicalFixtureSha256(result, variants);
  if (fixture.conflict) conflicts.add('fixtureSha256');
  else if (fixture.value) facts.fixtureSha256 = fixture.value;

  if (typeof result.browser === 'string' && result.browser.trim() !== '') facts.browser = result.browser;

  for (const [sourceField, targetField] of [
    ['resolvedRepresentation', 'resolvedRepresentation'],
    ['observerPolicy', 'observerPolicy'],
    ['retainedOutputPolicy', 'retainedOutputPolicy'],
    ['measurementContract', 'measurementContract'],
  ] as const) {
    const value = uniqueNonEmptyString(comparabilityRecords, sourceField);
    if (value.conflict) conflicts.add(targetField);
    else if (value.value) facts[targetField] = value.value;
  }

  const primary = primaryMetric
    ? metrics.find((metric) => metric.metric === primaryMetric && metric.state === 'AVAILABLE')
    : undefined;
  if (primary?.state === 'AVAILABLE') {
    facts.metric = primary.metric;
    facts.unit = primary.unit;
    facts.warmup = primary.warmup;
    if (primary.requestedIterations !== undefined) facts.iterations = primary.requestedIterations;
  }

  const missingFields = STREAMING_WORK_FIELDS.filter((field) => facts[field] === undefined);
  const conflictFields = [...conflicts].sort(compareStreamingWorkFields);
  let identity: StreamingWorkIdentity | undefined;
  if (missingFields.length === 0 && conflictFields.length === 0) {
    const candidate: StreamingWorkIdentity = {
      engineId: result.engineId,
      browser: facts.browser!,
      fixtureSha256: facts.fixtureSha256!,
      representation: facts.resolvedRepresentation!,
      observerPolicy: facts.observerPolicy!,
      retainedOutputPolicy: facts.retainedOutputPolicy!,
      measurementContract: facts.measurementContract!,
      warmup: facts.warmup!,
      iterations: facts.iterations!,
      metric: facts.metric!,
      unit: facts.unit!,
    };
    // Reuse the feature-owned validator instead of maintaining a second reporting interpretation.
    streamingCohortProjection(candidate);
    identity = Object.freeze(candidate);
  }
  return {
    state: conflictFields.length > 0 ? 'CONFLICT' : missingFields.length > 0 ? 'INCOMPLETE' : 'COMPLETE',
    facts,
    ...(identity ? { identity } : {}),
    missingFields,
    conflictFields,
    sourceCount: runtimes.length,
  };
}

function streamingRuntimeEvidenceRecords(result: ScenarioResult): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  for (const outcome of result.oracleOutcomes) {
    const evidence = asRecord(outcome.evidence);
    if (!evidence) continue;
    addStreamingRuntimeRecord(records, evidence.streamingRuntime);
    if (!Array.isArray(evidence.layers)) continue;
    for (const layer of evidence.layers) {
      const layerEvidence = asRecord(asRecord(layer)?.evidence);
      if (layerEvidence) addStreamingRuntimeRecord(records, layerEvidence.streamingRuntime);
    }
  }
  const unique = new Map(records.map((record) => [canonicalJson(normalizeJson(record)), record]));
  return [...unique.values()];
}

function addStreamingRuntimeRecord(output: Record<string, unknown>[], value: unknown): void {
  const record = asRecord(value);
  if (record?.schema === STREAMING_RUNTIME_RESULT_SCHEMA) output.push(record);
}

function canonicalFixtureSha256(
  result: ScenarioResult,
  variants: readonly VariantObservation[],
): { value?: string; conflict: boolean } {
  const raw = [
    result.inputSha256,
    result.instance?.inputSha256 ?? undefined,
    result.selection?.sha256,
    ...variants.map((variant) => variant.sha256),
  ].filter((value): value is string => value !== undefined);
  if (raw.some((value) => !SHA256_RE.test(value))) return { conflict: true };
  const unique = [...new Set(raw)];
  return unique.length === 1 ? { value: unique[0], conflict: false } : { conflict: unique.length > 1 };
}

function uniqueNonEmptyString(
  records: readonly Record<string, unknown>[],
  field: string,
): { value?: string; conflict: boolean } {
  const raw = records.flatMap((record) => {
    if (!(field in record)) return [];
    return [record[field]];
  });
  if (raw.some((value) => typeof value !== 'string' || value.trim() === '')) return { conflict: true };
  if (raw.length > 0 && raw.length !== records.length) return { conflict: true };
  const unique = [...new Set(raw as string[])];
  return unique.length === 1 ? { value: unique[0], conflict: false } : { conflict: unique.length > 1 };
}

function compareStreamingWorkFields(a: StreamingWorkMissingField, b: StreamingWorkMissingField): number {
  return STREAMING_WORK_FIELDS.indexOf(a) - STREAMING_WORK_FIELDS.indexOf(b);
}

function removeVolatileTimestamps(value: JsonObject): JsonObject {
  const output: JsonObject = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'generatedAtIso' || key === 'startedAtIso' || key === 'observedAtIso') continue;
    output[key] = entry;
  }
  return output;
}

function stableVariantId(file: string, sha256: string | undefined): string {
  return sha256 ? `${file}#${sha256}` : file;
}

function extractReasonCode(reason: string | undefined): string | undefined {
  return reason?.match(/^\[([^\]]+)\]/)?.[1];
}

function isValidVariant(variant: VariantObservation): boolean {
  return variant.execution === 'EXECUTED' && (variant.verdict === 'PASS');
}

function isExecutionState(value: unknown): value is VariantObservation['execution'] {
  return value === 'EXECUTED'
    || value === 'NA_ENGINE'
    || value === 'NA_BROWSER'
    || value === 'NA_ASSET'
    || value === 'ERROR'
    || value === 'SKIPPED';
}

function isOracleVerdict(value: unknown): value is OracleVerdict {
  return value === 'PASS' || value === 'FAIL';
}

function isResultStatus(value: unknown): value is ResultStatus {
  return isOracleVerdict(value)
    || value === 'NA_ENGINE'
    || value === 'NA_BROWSER'
    || value === 'NA_ASSET'
    || value === 'ERROR'
    || value === 'SKIPPED';
}

function isMetricId(value: unknown): value is MetricId {
  return typeof value === 'string' && METRIC_IDS.has(value);
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function compareVariants(a: VariantObservation, b: VariantObservation): number {
  return a.variantId.localeCompare(b.variantId) || canonicalJson(a).localeCompare(canonicalJson(b));
}

function compareExpectedVariants(a: ExpectedVariantDefinition, b: ExpectedVariantDefinition): number {
  return a.variantId.localeCompare(b.variantId) || a.file.localeCompare(b.file) || (a.sha256 ?? '').localeCompare(b.sha256 ?? '');
}

function compareExpectedCells(a: ExpectedCellDefinition, b: ExpectedCellDefinition): number {
  return a.browser.localeCompare(b.browser)
    || a.scenarioId.localeCompare(b.scenarioId)
    || a.engineId.localeCompare(b.engineId);
}

function variantEvidenceKey(value: JsonObject): string {
  return `${String(value.variantId ?? value.file ?? '')}\u0000${String(value.sha256 ?? '')}\u0000${canonicalJson(value)}`;
}

const COHORT_DIMENSION_KEYS: readonly (keyof CohortDimensions)[] = [
  'artifactSchemaMajor',
  'suiteVersion',
  'scenarioId',
  'scenarioDefinitionHash',
  'oraclePolicyVersion',
  'goldenProvenanceVersion',
  'browserFamily',
  'browserBuild',
  'executionRealm',
  'featureFlagsHash',
  'supportSnapshotHash',
  'hostOs',
  'hostArch',
  'cpuClass',
  'gpuDriver',
  'powerState',
  'isolationPolicy',
  'corpusChecksum',
  'selectedFileSetHash',
  'mutationHash',
  'rotationSeed',
  'runSelectionHash',
  'primaryMetric',
  'primaryUnit',
  'metricDirection',
  'metricNumerator',
  'metricDenominator',
  'sampleAxis',
  'aggregation',
  'warmup',
  'requestedIterations',
  'minRankSamples',
  'uncertaintyPolicy',
];

const STREAMING_RUNTIME_RESULT_SCHEMA = 'media-test/streaming-runtime-result@1';
const SHA256_RE = /^[0-9a-f]{64}$/;
const STREAMING_COHORT_DIMENSION_KEYS = [
  'fixtureSha256',
  'resolvedRepresentation',
  'observerPolicy',
  'retainedOutputPolicy',
  'measurementContract',
] as const satisfies readonly (keyof CohortDimensions)[];
const STREAMING_WORK_FIELDS: readonly StreamingWorkMissingField[] = [
  'fixtureSha256',
  'browser',
  'resolvedRepresentation',
  'observerPolicy',
  'retainedOutputPolicy',
  'measurementContract',
  'warmup',
  'iterations',
  'metric',
  'unit',
];
