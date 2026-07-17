import type { BrowserName } from '../engine.ts';
import type { MetricId, OracleVerdict, ScenarioResult } from '../scenario.ts';
import type {
  StreamingComparabilityResult,
  StreamingWorkIdentity,
} from '../../features/streaming-output/comparability.ts';

/** JSON values accepted by reporting artifacts. Non-finite numbers are rejected during normalization. */
export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type ExecutionState =
  | 'EXECUTED'
  | 'NA_ENGINE'
  | 'NA_BROWSER'
  | 'NA_ASSET'
  | 'ERROR'
  | 'SKIPPED';

export type SampleAxis = 'iteration' | 'file';
export type MetricAggregation = 'median' | 'sum' | 'max' | 'ratio-of-sums';
export type MetricDirection = 'higher' | 'lower';

export interface RatioComponent {
  /** Stable input/iteration identity for the paired numerator and denominator. */
  identity: string;
  numerator: number;
  denominator: number;
}

export interface ConfidenceInterval {
  low: number;
  high: number;
  confidence: number;
  method: string;
}

export interface UnavailableMetricObservation {
  state: 'UNAVAILABLE';
  metric: MetricId;
  unit: string;
  direction: MetricDirection;
  reasonCode: string;
  reason?: string;
}

export interface AvailableMetricObservation {
  state: 'AVAILABLE';
  metric: MetricId;
  unit: string;
  direction: MetricDirection;
  sampleAxis: SampleAxis;
  aggregation: MetricAggregation;
  n: number;
  warmup: number;
  requestedIterations?: number;
  samples: number[];
  median: number;
  p95: number;
  mad: number;
  /** The exact value used for ranking. */
  rankedValue: number;
  /** Present when a combined file-set value differs from the sample-distribution median. */
  aggregate?: number;
  /** Paired raw work/time (or other numerator/denominator) components for ratio-of-sums. */
  ratioComponents?: RatioComponent[];
  /** Exact valid input identities represented by the ranked value. */
  validVariantIds: string[];
  empiricalNoisePct: number;
  confidenceInterval: ConfidenceInterval;
}

export type MetricObservation = UnavailableMetricObservation | AvailableMetricObservation;

export interface ExpectedVariantDefinition {
  variantId: string;
  file: string;
  sha256?: string;
  isBaked?: boolean;
}

export interface ExpectedCellDefinition {
  engineId: string;
  browser: BrowserName;
  scenarioId: string;
  family: string;
  variants: ExpectedVariantDefinition[];
}

export interface ExpectedMatrixDefinition {
  /** Stable description of how the selected matrix was constructed. */
  definitionId: string;
  cells: ExpectedCellDefinition[];
}

export interface VariantObservation {
  variantId: string;
  file: string;
  sha256?: string;
  isBaked?: boolean;
  execution: ExecutionState;
  verdict?: OracleVerdict;
  reasonCode?: string;
  reason?: string;
  oracleOutcomes: JsonValue[];
  /** Typed candidate-specific oracle sufficiency; absent only for legacy/unselected observations. */
  candidateEvidence?: JsonObject;
  metrics: MetricObservation[];
  /** Lossless normalized source evidence for this variant. */
  evidence: JsonObject;
}

/**
 * Required comparison dimensions. Engine identity/configuration is kept as a separate candidate record:
 * two observations for the same engine id with different records make the cohort non-comparable.
 */
export interface CohortDimensions {
  artifactSchemaMajor: number;
  suiteVersion: string;
  scenarioId: string;
  scenarioDefinitionHash: string;
  oraclePolicyVersion: string;
  goldenProvenanceVersion: string;
  browserFamily: BrowserName;
  browserBuild: string;
  executionRealm: string;
  featureFlagsHash: string;
  supportSnapshotHash: string;
  hostOs: string;
  hostArch: string;
  cpuClass: string;
  gpuDriver: string;
  powerState: string;
  isolationPolicy: string;
  corpusChecksum: string;
  selectedFileSetHash: string;
  mutationHash: string;
  rotationSeed: string;
  runSelectionHash: string;
  primaryMetric: MetricId;
  primaryUnit: string;
  metricDirection: MetricDirection;
  metricNumerator: string;
  metricDenominator: string;
  sampleAxis: SampleAxis;
  aggregation: MetricAggregation;
  warmup: number;
  requestedIterations: number;
  minRankSamples: number;
  uncertaintyPolicy: string;
  /** Streaming-output-only work identity. These are required for that family and absent otherwise. */
  fixtureSha256?: string;
  resolvedRepresentation?: string;
  observerPolicy?: string;
  retainedOutputPolicy?: string;
  measurementContract?: string;
}

export type StreamingWorkMissingField =
  | 'fixtureSha256'
  | 'browser'
  | 'resolvedRepresentation'
  | 'observerPolicy'
  | 'retainedOutputPolicy'
  | 'measurementContract'
  | 'warmup'
  | 'iterations'
  | 'metric'
  | 'unit';

export interface StreamingWorkFacts {
  fixtureSha256?: string;
  browser?: string;
  resolvedRepresentation?: string;
  observerPolicy?: string;
  retainedOutputPolicy?: string;
  measurementContract?: string;
  warmup?: number;
  iterations?: number;
  metric?: MetricId;
  unit?: string;
}

/** Normalized, validated FEAT-89 facts recovered from persisted oracle evidence. */
export interface StreamingWorkObservation {
  state: 'COMPLETE' | 'INCOMPLETE' | 'CONFLICT';
  facts: StreamingWorkFacts;
  identity?: StreamingWorkIdentity;
  missingFields: StreamingWorkMissingField[];
  conflictFields: StreamingWorkMissingField[];
  sourceCount: number;
}

export interface EngineRecord {
  engineId: string;
  frameworkVersion: string;
  adapterVersion: string;
  configUsed: JsonValue;
  recordHash: string;
}

export interface NormalizedObservation {
  runId: string;
  observationId: string;
  contentHash: string;
  observedAtIso?: string;
  engineId: string;
  browser: BrowserName;
  scenarioId: string;
  family: string;
  primaryMetric?: MetricId;
  variants: VariantObservation[];
  metrics: MetricObservation[];
  environment: JsonObject;
  engine: EngineRecord;
  /** All derived/provided cohort fields, including incomplete records used to explain a split. */
  cohortInput: JsonObject;
  cohortDimensions?: CohortDimensions;
  cohortMissingDimensions: string[];
  /** Present for streaming-output rows even when incomplete, so ranking refusal is auditable. */
  streamingWork?: StreamingWorkObservation;
  exclusionReasons: string[];
  /** Lossless, finite, normalized copy of the complete input ScenarioResult. */
  evidence: JsonObject;
}

export interface StateCounts {
  expected: number;
  observed: number;
  executed: number;
  oracleEvaluable: number;
  valid: number;
  pass: number;
  failed: number;
  errors: number;
  naEngine: number;
  naBrowser: number;
  naAsset: number;
  skipped: number;
  notRun: number;
}

export interface RateSummary {
  numerator: number;
  denominator: number;
  value: number | null;
}

export interface ScoreSummary {
  counts: StateCounts;
  correctness: RateSummary;
  exactMatch: RateSummary;
  expectedCoverage: RateSummary;
}

export type CellGrade = 'NOT_RUN' | 'SKIPPED' | 'NA' | 'FAIL' | 'ERROR' | 'PARTIAL' | 'PASS';

export interface ReducedVariant {
  expected: ExpectedVariantDefinition;
  observed: boolean;
  observation?: VariantObservation;
}

export interface ReducedCell {
  cellId: string;
  engineId: string;
  browser: BrowserName;
  scenarioId: string;
  family: string;
  grade: CellGrade;
  label: string;
  counts: StateCounts;
  summary: ScoreSummary;
  validVariantIds: string[];
  failedVariantIds: string[];
  variants: ReducedVariant[];
  observations: NormalizedObservation[];
  metrics: MetricObservation[];
  exclusionReasons: string[];
}

export type RankEligibilityCode =
  | 'ELIGIBLE'
  | 'NOT_COMPARABLE'
  | 'NO_VALID_COVERAGE'
  | 'NO_COMMON_METRIC'
  | 'METRIC_UNAVAILABLE'
  | 'METRIC_PROTOCOL_MISMATCH'
  | 'VALID_FILE_SET_MISMATCH'
  | 'INSUFFICIENT_SAMPLES'
  | 'DUPLICATE_CONFLICT';

export interface RankedContender {
  engineId: string;
  grade: CellGrade;
  valid: number;
  expected: number;
  validVariantIds: string[];
  metric: MetricId | null;
  observation: MetricObservation | null;
  eligibility: RankEligibilityCode;
  eligibilityReason: string;
}

export interface RankingDecision {
  scenarioId: string;
  browser: BrowserName;
  cohortId: string;
  comparable: boolean;
  primaryMetric: MetricId | null;
  aggregation: MetricAggregation | null;
  unit: string | null;
  sampleAxis: SampleAxis | null;
  winner: string | null;
  winnerValue: number | null;
  runnerUp: string | null;
  runnerUpValue: number | null;
  flag: 'winner' | 'tie' | 'unresolved' | 'none';
  coWinners: string[];
  tieBandPct: number | null;
  intervalRule: string | null;
  contenders: RankedContender[];
  reasons: string[];
}

export interface EngineCohortSummary extends ScoreSummary {
  engineId: string;
  cellCount: number;
}

export interface CohortReport {
  cohortId: string;
  comparable: boolean;
  comparisonLabel: 'COMPARABLE' | 'NOT_COMPARABLE';
  /** Streaming-output-only equivalent-work gate; independent from media correctness. */
  streamingComparability?: StreamingComparabilityResult;
  dimensions: CohortDimensions | null;
  missingDimensions: string[];
  exclusionReasons: string[];
  expectedScenarioIntersection: string[];
  cells: ReducedCell[];
  engineSummaries: EngineCohortSummary[];
  rankings: RankingDecision[];
}

export interface ReportingPolicy {
  minRankSamples: number;
  relativeNoiseFloorPct: number;
  uncertaintyPolicy: string;
}

export const DEFAULT_REPORTING_POLICY: ReportingPolicy = Object.freeze({
  minRankSamples: 3,
  relativeNoiseFloorPct: 3,
  uncertaintyPolicy: 'max(relative-3pct, empirical-mad-band) or overlapping robust-95pct intervals',
});

export interface ReportingNormalizationContext {
  runId?: string;
  observedAtIso?: string;
  cohortDimensions?: Partial<CohortDimensions>;
  engineRecord?: Partial<Omit<EngineRecord, 'recordHash'>>;
  artifactSchemaMajor?: number;
  policy?: Partial<ReportingPolicy>;
}

export interface ReportingPipelineInput {
  results: readonly ScenarioResult[];
  expected?: ExpectedMatrixDefinition;
  generatedAtIso?: string;
  suiteVersion?: string;
  /** Context can be supplied per result without modifying the shared ScenarioResult carrier. */
  contextForResult?: (result: ScenarioResult, index: number) => ReportingNormalizationContext | undefined;
  dedupePolicy?: 'strict' | 'latest';
  policy?: Partial<ReportingPolicy>;
}

export interface DedupeDiscard {
  identity: string;
  keptObservationId: string;
  discardedObservationId: string;
  keptContentHash: string;
  discardedContentHash: string;
  reason: 'IDENTICAL_DUPLICATE' | 'LATEST_POLICY';
}

export interface DedupeResult {
  observations: NormalizedObservation[];
  discarded: DedupeDiscard[];
}
