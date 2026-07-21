/**
 * src/core/scenario.ts — the engine-independent test/benchmark case model + defineScenario(),
 * plus the result/verdict types the runner and report share.
 *
 * A Scenario NEVER names a library. It declares (operation, input asset, options,
 * required-capabilities, oracles, metrics). The runner negotiates it against each engine × browser.
 *
 * TERMINOLOGY: a "Scenario" here IS the spec's "case" (test-instructions.md §6–§9). The codebase
 * uses `Scenario`/`scenarios/` as the authoritative internal term; "case" in the spec and report
 * prose refers to the same thing. We deliberately did NOT rename to `cases/` — it is pure churn.
 */

import type {
  BrowserName,
  ConcreteOperationRequest,
  ConcreteWebCodecsConfig,
  EncryptionScheme,
  Operation,
  TranscodeOptions,
} from './engine.ts';
import { canonicalJsonSha256 } from './canonical-json.ts';
import type { JsonObject, JsonValue } from './canonical-json.ts';
import {
  SCENARIO_FAMILY_LABELS,
  SCENARIO_FAMILY_MANIFEST,
  SCENARIO_FAMILY_ORDER,
} from './scenario-manifest.ts';
import type { ScenarioFamily } from './scenario-manifest.ts';

export {
  SCENARIO_FAMILY_LABELS,
  SCENARIO_FAMILY_MANIFEST,
  SCENARIO_FAMILY_ORDER,
} from './scenario-manifest.ts';
export type { ScenarioFamily } from './scenario-manifest.ts';

// ── Capability requirements a scenario declares (matched against an engine's CapabilitySet) ──

export interface Requires {
  operations: Operation[];
  containersIn?: string[];
  containersOut?: string[];
  videoCodecs?: string[];
  audioCodecs?: string[];
  /** Input/read-side codec requirements. Falls back to videoCodecs/audioCodecs unless specified. */
  videoCodecsIn?: string[];
  audioCodecsIn?: string[];
  /** Output/write-side codec requirements. Falls back to videoCodecs/audioCodecs unless specified. */
  videoCodecsOut?: string[];
  audioCodecsOut?: string[];
  encryption?: EncryptionScheme[];
  features?: string[];
  /** Canonical atomic-token index retained alongside the concrete alternative clauses. */
  allOfTokens?: RequirementTokens;
  /** Disjunction of supported paths; fields within one entry are conjunctive. */
  anyOfCombinations?: RequirementCombination[];
}

export interface RequirementTokens {
  operations: Operation[];
  containersIn?: string[];
  containersOut?: string[];
  videoCodecs?: string[];
  audioCodecs?: string[];
  videoCodecsIn?: string[];
  audioCodecsIn?: string[];
  videoCodecsOut?: string[];
  audioCodecsOut?: string[];
  encryption?: EncryptionScheme[];
  features?: string[];
}

export type BrowserCodecRole = ConcreteWebCodecsConfig['role'];

export type WebCodecsConfigRecipe =
  | { role: 'video-decoder'; source: 'selected-input-video'; trackIndex?: number }
  | { role: 'audio-decoder'; source: 'selected-input-audio'; trackIndex?: number }
  | { role: 'video-encoder'; source: 'output-video'; trackIndex?: number }
  | { role: 'audio-encoder'; source: 'output-audio'; trackIndex?: number };

export interface RequirementCombination {
  operation: Operation;
  containersIn?: string[];
  containersOut?: string[];
  videoCodecsIn?: string[];
  audioCodecsIn?: string[];
  videoCodecsOut?: string[];
  audioCodecsOut?: string[];
  encryption?: EncryptionScheme[];
  features?: string[];
  optionConstraints?: JsonObject;
  browserRoles?: BrowserCodecRole[];
  browserConfigRecipes?: WebCodecsConfigRecipe[];
}

export interface NormalizedRequires extends Requires {
  allOfTokens: RequirementTokens;
  anyOfCombinations: RequirementCombination[];
}

// ── Oracle + metric vocabularies (see oracles.ts / measure.ts) ──

export type OracleId =
  | 'golden-metadata' // probe vs golden/<asset>.meta.json
  | 'golden-packets' // demux vs golden/<asset>.packets.json
  | 'decoded-frames-bitexact' // decode output in-browser vs golden frame digests
  | 'decoded-audio-pcm' // audio decode output vs browser-decoded PCM sample digests
  | 'reference-reimport' // re-import engine output with the reference engine; compare packet tables
  | 'playback-smoke' // <video> can play the output
  | 'ssim-psnr' // decode output → SSIM+PSNR vs reference frames (lossy ops)
  | 'mp4-box-layout' // MP4/MOV top-level box order/fragment structure for output-shape rows
  | 'webm-live-layout' // WebM/MKV live/append-only layout: unknown-size Segment, no SeekHead/Duration
  | 'fanout-renditions' // multi-rendition transcode output: count, dimensions, playback, and SSIM
  | 'alpha-plane' // alpha channel compared separately
  | 'seek-accuracy' // seek lands on expected keyframe / within tolerance
  | 'trim-boundaries' // out duration ≈ requested; boundary frames only with trim-range golden
  | 'decrypt-bitexact' // decoded frames bit-exact vs golden (offline reference decrypt)
  | 'graceful-failure' // malformed input → throw/reject within timeout, no crash/hang/OOM
  | 'property-invariant'; // metamorphic invariant computed in-browser (§11)

export type MetricId =
  | 'wall'
  | 'throughputRealtime'
  | 'peakMemory'
  | 'sourceReads'
  | 'targetWrites'
  | 'bytesOut'
  | 'longtasks'
  | 'decodeFps'
  | 'encodeFps'
  // ── headline benchmarks (§8.1 / §A.14), higher-is-better ──
  | 'opsPerSec' // extract-metadata: repeated probe → ops/s
  | 'packetsPerSec' // iterate-video-packets: demux → packets/s
  | 'framesPerSec' // convert/transcode throughput (distinct from decode/encode fps)
  | 'sampleFramesPerSec' // audio throughput in presentation sample frames/s (never scalar samples)
  // ── latency / cost metrics (§8.3 / §A.14), lower-is-better ──
  | 'seekMs' // ms per seek
  | 'timeToFirstByte' // ms to first output byte
  | 'timeToFirstFrame' // ms to first decoded/rendered frame
  | 'loadInit' // ms to init() (load+compile+warmup) — reported separately per §0.7, NEVER folded into op timing
  | 'bundleSize'; // kB min+gzip — the one build-time metric

export interface ScenarioFeatureGroup {
  id: ScenarioFamily;
  label: string;
  scenarios: Scenario[];
}

export function scenarioAssetIds(scenario: Pick<ScenarioSpec, 'input'>): string[] {
  return Array.isArray(scenario.input) ? scenario.input : [scenario.input];
}

export function groupScenariosByFeature(scenarios: Scenario[]): ScenarioFeatureGroup[] {
  const byFamily = new Map<ScenarioFamily, Scenario[]>();
  for (const scenario of scenarios) {
    const items = byFamily.get(scenario.family);
    if (items) items.push(scenario);
    else byFamily.set(scenario.family, [scenario]);
  }
  return SCENARIO_FAMILY_ORDER.filter((family) => byFamily.has(family)).map((family) => ({
    id: family,
    label: SCENARIO_FAMILY_LABELS[family],
    scenarios: byFamily.get(family) ?? [],
  }));
}

/** Per-oracle tunables (e.g. SSIM/PSNR floors, duration tolerance) overriding defaults. */
export interface OracleTolerances {
  ssimMin?: number;
  psnrMinDb?: number;
  durationToleranceSec?: number;
  fpsTolerance?: number;
  seekToleranceUs?: number;
}

export interface ScenarioInputDefinition {
  assetId: string;
  /** Stable identity for this declared input position; never overloaded with the scenario id. */
  variantId: string;
  role?: string;
}

export interface ScenarioMutationSpec {
  mutationId: string;
  parameters: JsonObject;
}

export type ScenarioMutationHandler = (
  bytes: Uint8Array,
  parameters: Readonly<JsonObject>,
) => Uint8Array;

/** Canonical JSON-only definition used for validation, hashing, snapshots, and persistence. */
export interface ScenarioDefinitionV2 {
  schemaVersion: 2;
  id: string;
  revision: number;
  family: ScenarioFamily;
  order: number;
  op: Operation;
  inputs: ScenarioInputDefinition[];
  options: JsonObject;
  requires: NormalizedRequires;
  oracles: OracleId[];
  metrics: MetricId[];
  primaryMetric?: MetricId;
  tolerances: OracleTolerances;
  timeoutMs: number;
  notes: string;
  mutation?: ScenarioMutationSpec;
  inputVariantIds: string[];
  renditionIds: string[];
}

export interface ScenarioSpec {
  /** stable id, namespaced by family, e.g. 'remux/h264_mp4_to_mkv' */
  id: string;
  schemaVersion?: 2;
  revision?: number;
  family?: ScenarioFamily;
  order?: number;
  op: Operation;
  /** corpus asset id (manifest.json), or list for multi-input ops (mux) */
  input: string | string[];
  /** V2 JSON-only input declaration. Legacy callers may continue to supply `input`. */
  inputs?: ScenarioInputDefinition[];
  /** operation options forwarded to the engine method (container/transcode/trim/decrypt args) */
  options?: TranscodeOptions | { container?: string } | Record<string, unknown>;
  requires: Requires;
  oracles: OracleId[];
  metrics: MetricId[];
  /**
   * The metric the per-case WINNER is ranked by (§9). Defaults to metrics[0] when omitted. This is
   * the single number the leaderboard compares across engines for this case (e.g. 'opsPerSec' for
   * extract-metadata, 'packetsPerSec' for iterate-packets, 'bundleSize' for the bundle case).
   */
  primaryMetric?: MetricId;
  tolerances?: OracleTolerances;
  /** Declarative mutation resolved only after the complete definition has validated. */
  mutation?: ScenarioMutationSpec;
  /** @deprecated Compatibility bridge for pre-V2 tests; new definitions must use `mutation`. */
  mutate?: (bytes: Uint8Array) => Uint8Array;
  inputVariantIds?: string[];
  renditionIds?: string[];
  /** hard wall-clock cap (ms) for the operation in a Worker; exceeding it ⇒ timeout result */
  timeoutMs?: number;
  notes?: string;
}

export interface Scenario extends ScenarioSpec {
  schemaVersion: 2;
  revision: number;
  family: ScenarioFamily;
  order: number;
  inputs: ScenarioInputDefinition[];
  requires: NormalizedRequires;
  tolerances: OracleTolerances;
  timeoutMs: number;
  notes: string;
  inputVariantIds: string[];
  renditionIds: string[];
  definitionHash: string;
}

/** Derive family from the id's namespace prefix (e.g. 'remux/...' → 'remux'). */
function familyFromId(id: string): string {
  return id.split('/')[0] ?? '';
}

const mutationHandlers = new Map<string, ScenarioMutationHandler>();

export function registerScenarioMutationHandler(id: string, handler: ScenarioMutationHandler): void {
  if (!HANDLER_ID_PATTERN.test(id)) throw new TypeError(`mutation handler id is invalid: ${JSON.stringify(id)}`);
  if (mutationHandlers.has(id)) throw new Error(`mutation handler already registered: ${id}`);
  mutationHandlers.set(id, handler);
}

export function unregisterScenarioMutationHandler(id: string): void {
  mutationHandlers.delete(id);
}

/** Define, validate, hash, clone, and deep-freeze one engine-independent scenario. */
export function defineScenario(spec: ScenarioSpec): Scenario {
  const legacyMutate = typeof spec.mutate === 'function' ? spec.mutate : undefined;
  const definition = normalizeScenarioDefinition(spec, legacyMutate);
  assertValidScenarioDefinition(definition, {
    mutationHandlerExists: (id) => id.startsWith('legacy-inline/') || mutationHandlers.has(id),
  });
  const definitionHash = hashScenarioDefinition(definition);
  const resolvedMutation = legacyMutate ??
    (definition.mutation ? mutationHandlers.get(definition.mutation.mutationId) : undefined);
  const input = definition.inputs.length === 1
    ? definition.inputs[0]!.assetId
    : definition.inputs.map((entry) => entry.assetId);
  const runtime: Scenario = {
    ...definition,
    definitionHash,
    input,
    options: definition.options,
    ...(definition.mutation ? { mutation: definition.mutation } : {}),
    ...(resolvedMutation
      ? {
          mutate: (bytes: Uint8Array) =>
            resolvedMutation(bytes, definition.mutation?.parameters ?? {}),
        }
      : {}),
  };
  return deepFreeze(runtime);
}

export interface ScenarioValidationDiagnostic {
  scenarioId: string;
  path: string;
  code: string;
  message: string;
}

export interface ScenarioValidationContext {
  assetExists?: (assetId: string, scenarioId: string) => boolean;
  mutationHandlerExists?: (mutationId: string) => boolean;
}

export class ScenarioValidationError extends Error {
  readonly diagnostics: readonly ScenarioValidationDiagnostic[];

  constructor(diagnostics: readonly ScenarioValidationDiagnostic[]) {
    const first = diagnostics[0] ?? {
      scenarioId: '<unknown>', path: '$', code: 'SCENARIO_INVALID', message: 'invalid scenario',
    };
    super(
      `${first.scenarioId} at ${first.path} [${first.code}]: ${first.message}` +
        (diagnostics.length > 1 ? ` (+${diagnostics.length - 1} more diagnostics)` : ''),
    );
    this.name = 'ScenarioValidationError';
    this.diagnostics = diagnostics.map((entry) => ({ ...entry }));
  }
}

export function assertValidScenarioDefinition(
  value: unknown,
  context: ScenarioValidationContext = {},
): asserts value is ScenarioDefinitionV2 {
  const diagnostics = validateScenarioDefinitionV2(value, context);
  if (diagnostics.length > 0) throw new ScenarioValidationError(diagnostics);
}

/** Structural JSON-Schema-equivalent checks followed by cross-field semantic validation. */
export function validateScenarioDefinitionV2(
  value: unknown,
  context: ScenarioValidationContext = {},
): ScenarioValidationDiagnostic[] {
  const diagnostics: ScenarioValidationDiagnostic[] = [];
  const source = isPlainRecord(value) ? value : undefined;
  const scenarioId = typeof source?.id === 'string' && source.id ? source.id : '<unknown>';
  const add = (path: string, code: string, message: string): void => {
    diagnostics.push({ scenarioId, path, code, message });
  };
  if (!source) {
    add('$', 'SCENARIO_TYPE', 'definition must be a plain JSON object');
    return diagnostics;
  }

  rejectUnknownKeys(source, ROOT_DEFINITION_KEYS, '$', add);
  if (source.schemaVersion !== 2) add('schemaVersion', 'SCHEMA_VERSION', 'must equal 2');
  if (typeof source.id !== 'string' || !SCENARIO_ID_PATTERN.test(source.id)) {
    add('id', 'SCENARIO_ID', "must match the stable 'family/name' id syntax");
  }
  if (!Number.isSafeInteger(source.revision) || (source.revision as number) < 1) {
    add('revision', 'SCENARIO_REVISION', 'must be a positive safe integer');
  }
  if (!FAMILY_IDS.has(source.family as ScenarioFamily)) {
    add('family', 'SCENARIO_FAMILY', `unknown scenario family ${JSON.stringify(source.family)}`);
  }
  if (!Number.isSafeInteger(source.order) || (source.order as number) < 0) {
    add('order', 'SCENARIO_ORDER', 'must be a non-negative safe integer');
  }
  if (!OPERATION_IDS.has(source.op as Operation)) {
    add('op', 'SCENARIO_OPERATION', `unknown operation ${JSON.stringify(source.op)}`);
  }

  validateInputs(source.inputs, scenarioId, context, add);
  validateOptions(source.op, source.options, add);
  validateRequires(source.requires, source.op, add);
  validateIdArray(source.oracles, 'oracles', ORACLE_IDS, true, add);
  validateIdArray(source.metrics, 'metrics', METRIC_IDS, false, add);
  validateIdArray(source.inputVariantIds, 'inputVariantIds', undefined, true, add);
  validateIdArray(source.renditionIds, 'renditionIds', undefined, false, add);
  validateTolerances(source.tolerances, add);
  if (!Number.isFinite(source.timeoutMs) || (source.timeoutMs as number) <= 0) {
    add('timeoutMs', 'SCENARIO_TIMEOUT', 'must be a finite number greater than zero');
  }
  if (typeof source.notes !== 'string') add('notes', 'SCENARIO_NOTES', 'must be a string');

  const prefix = typeof source.id === 'string' ? familyFromId(source.id) : '';
  if (typeof source.family === 'string' && prefix && source.family !== prefix) {
    add('family', 'FAMILY_ID_MISMATCH', `must equal id prefix '${prefix}'`);
  }
  const requires = isPlainRecord(source.requires) ? source.requires : undefined;
  const operations = Array.isArray(requires?.operations) ? requires.operations : [];
  if (typeof source.op === 'string' && !operations.includes(source.op)) {
    add('requires.operations', 'OPERATION_REQUIREMENT_MISMATCH', `must include scenario op '${source.op}'`);
  }
  const combinations = Array.isArray(requires?.anyOfCombinations) ? requires.anyOfCombinations : [];
  if (typeof source.op === 'string' && !combinations.some((entry) => isPlainRecord(entry) && entry.operation === source.op)) {
    add(
      'requires.anyOfCombinations',
      'COMBINATION_OPERATION_MISMATCH',
      `must contain an alternative for scenario op '${source.op}'`,
    );
  }
  if (source.primaryMetric !== undefined) {
    if (!METRIC_IDS.has(source.primaryMetric as MetricId)) {
      add('primaryMetric', 'PRIMARY_METRIC_UNKNOWN', 'must name a registered metric handler');
    } else if (!Array.isArray(source.metrics) || !source.metrics.includes(source.primaryMetric)) {
      add('primaryMetric', 'PRIMARY_METRIC_ABSENT', 'must be present in metrics');
    }
  }
  if (OPERATION_IDS.has(source.op as Operation)) {
    for (const [index, oracle] of arrayEntries(source.oracles)) {
      if (ORACLE_IDS.has(oracle as OracleId) && !ORACLES_BY_OPERATION[source.op as Operation].has(oracle as OracleId)) {
        add(`oracles[${index}]`, 'ORACLE_OPERATION_MISMATCH', `'${oracle}' is not applicable to '${source.op}'`);
      }
    }
    for (const [index, metric] of arrayEntries(source.metrics)) {
      if (METRIC_IDS.has(metric as MetricId) && !METRICS_BY_OPERATION[source.op as Operation].has(metric as MetricId)) {
        add(`metrics[${index}]`, 'METRIC_OPERATION_MISMATCH', `'${metric}' is not applicable to '${source.op}'`);
      }
    }
  }
  validateMutation(source, context, add);
  return diagnostics;
}

export function hashScenarioDefinition(
  definition: ScenarioDefinitionV2 | Scenario,
): string {
  return canonicalJsonSha256(scenarioDefinitionProjection(definition));
}

/** Strip runtime aliases/handlers so definition identity is JSON-only and order-independent. */
export function scenarioDefinitionProjection(
  definition: ScenarioDefinitionV2 | Scenario,
): ScenarioDefinitionV2 {
  return cloneDefinitionValue({
    schemaVersion: definition.schemaVersion,
    id: definition.id,
    revision: definition.revision,
    family: definition.family,
    order: definition.order,
    op: definition.op,
    inputs: definition.inputs,
    options: definition.options ?? {},
    requires: definition.requires,
    oracles: definition.oracles,
    metrics: definition.metrics,
    ...(definition.primaryMetric !== undefined ? { primaryMetric: definition.primaryMetric } : {}),
    tolerances: definition.tolerances,
    timeoutMs: definition.timeoutMs,
    notes: definition.notes,
    ...(definition.mutation ? { mutation: definition.mutation } : {}),
    inputVariantIds: definition.inputVariantIds,
    renditionIds: definition.renditionIds,
  }) as unknown as ScenarioDefinitionV2;
}

export function validateScenarioBattery(
  scenarios: readonly (ScenarioDefinitionV2 | Scenario)[],
  context: ScenarioValidationContext = {},
): ScenarioValidationDiagnostic[] {
  return scenarios.flatMap((scenario) =>
    validateScenarioDefinitionV2(scenarioDefinitionProjection(scenario), context));
}

/** Return the first declared alternative matching the complete request tuple. */
export function matchRequirementCombination(
  requires: Pick<NormalizedRequires, 'anyOfCombinations'>,
  request: ConcreteOperationRequest,
): RequirementCombination | undefined {
  return requires.anyOfCombinations.find((combination) => combinationMatches(combination, request));
}

/** Derive the exact WebCodecs configs requested by one selected implementation alternative. */
export function deriveWebCodecsConfigs(
  combination: RequirementCombination,
  request: ConcreteOperationRequest,
): ConcreteWebCodecsConfig[] {
  const recipes = combination.browserConfigRecipes ?? [];
  if (recipes.length === 0) return [];
  return recipes.map((recipe) => deriveWebCodecsConfig(recipe, request));
}

function normalizeScenarioDefinition(
  spec: ScenarioSpec,
  legacyMutate?: (bytes: Uint8Array) => Uint8Array,
): ScenarioDefinitionV2 {
  const rawInputs = spec.inputs !== undefined
    ? spec.inputs
    : (Array.isArray(spec.input) ? spec.input : [spec.input]).map((assetId, index) => ({
        assetId,
        variantId: `input-${index + 1}`,
      }));
  const options = cloneDefinitionValue(spec.options ?? {}) as JsonObject;
  const mutation = spec.mutation
    ? cloneDefinitionValue(spec.mutation) as ScenarioMutationSpec
    : legacyMutate
      ? {
          mutationId: `legacy-inline/${canonicalJsonSha256({
            source: Function.prototype.toString.call(legacyMutate),
          })}`,
          parameters: {},
        }
      : undefined;
  const renditionIds = spec.renditionIds ?? deriveRenditionIds(options);
  const definition = {
    schemaVersion: spec.schemaVersion ?? 2,
    id: spec.id,
    revision: spec.revision ?? 1,
    family: spec.family ?? familyFromId(spec.id),
    order: spec.order ?? 0,
    op: spec.op,
    inputs: cloneDefinitionValue(rawInputs),
    options,
    requires: normalizeRequires(spec.requires, spec.op),
    oracles: cloneDefinitionValue(spec.oracles),
    metrics: cloneDefinitionValue(spec.metrics),
    ...(spec.primaryMetric !== undefined ? { primaryMetric: spec.primaryMetric } : {}),
    tolerances: cloneDefinitionValue(spec.tolerances ?? {}),
    timeoutMs: spec.timeoutMs ?? DEFAULT_SCENARIO_TIMEOUT_MS,
    notes: spec.notes ?? '',
    ...(mutation ? { mutation } : {}),
    inputVariantIds: cloneDefinitionValue(spec.inputVariantIds ?? ['baked']),
    renditionIds: cloneDefinitionValue(renditionIds),
  };
  return definition as ScenarioDefinitionV2;
}

function normalizeRequires(source: Requires, operation: Operation): NormalizedRequires {
  const record = (source ?? {}) as Requires;
  const tokensSource = record.allOfTokens ?? {
    operations: record.operations ?? [],
    ...(record.containersIn ? { containersIn: record.containersIn } : {}),
    ...(record.containersOut ? { containersOut: record.containersOut } : {}),
    ...(record.videoCodecs ? { videoCodecs: record.videoCodecs } : {}),
    ...(record.audioCodecs ? { audioCodecs: record.audioCodecs } : {}),
    ...(record.videoCodecsIn ? { videoCodecsIn: record.videoCodecsIn } : {}),
    ...(record.audioCodecsIn ? { audioCodecsIn: record.audioCodecsIn } : {}),
    ...(record.videoCodecsOut ? { videoCodecsOut: record.videoCodecsOut } : {}),
    ...(record.audioCodecsOut ? { audioCodecsOut: record.audioCodecsOut } : {}),
    ...(record.encryption ? { encryption: record.encryption } : {}),
    ...(record.features ? { features: record.features } : {}),
  };
  const tokens = cloneDefinitionValue(tokensSource) as RequirementTokens;
  const combinations = record.anyOfCombinations ?? [{
    operation,
    ...(tokens.containersIn ? { containersIn: tokens.containersIn } : {}),
    ...(tokens.containersOut ? { containersOut: tokens.containersOut } : {}),
    ...((tokens.videoCodecsIn ?? tokens.videoCodecs)
      ? { videoCodecsIn: tokens.videoCodecsIn ?? tokens.videoCodecs }
      : {}),
    ...((tokens.audioCodecsIn ?? tokens.audioCodecs)
      ? { audioCodecsIn: tokens.audioCodecsIn ?? tokens.audioCodecs }
      : {}),
    ...(operationHasEncodedOutput(operation) && (tokens.videoCodecsOut ?? tokens.videoCodecs)
      ? { videoCodecsOut: tokens.videoCodecsOut ?? tokens.videoCodecs }
      : {}),
    ...(operationHasEncodedOutput(operation) && (tokens.audioCodecsOut ?? tokens.audioCodecs)
      ? { audioCodecsOut: tokens.audioCodecsOut ?? tokens.audioCodecs }
      : {}),
    ...(tokens.encryption ? { encryption: tokens.encryption } : {}),
    ...(tokens.features ? { features: tokens.features } : {}),
  } satisfies RequirementCombination];
  return cloneDefinitionValue({
    operations: record.operations ?? tokens.operations,
    ...(record.containersIn ?? tokens.containersIn
      ? { containersIn: record.containersIn ?? tokens.containersIn }
      : {}),
    ...(record.containersOut ?? tokens.containersOut
      ? { containersOut: record.containersOut ?? tokens.containersOut }
      : {}),
    ...(record.videoCodecs ?? tokens.videoCodecs
      ? { videoCodecs: record.videoCodecs ?? tokens.videoCodecs }
      : {}),
    ...(record.audioCodecs ?? tokens.audioCodecs
      ? { audioCodecs: record.audioCodecs ?? tokens.audioCodecs }
      : {}),
    ...(record.videoCodecsIn ?? tokens.videoCodecsIn
      ? { videoCodecsIn: record.videoCodecsIn ?? tokens.videoCodecsIn }
      : {}),
    ...(record.audioCodecsIn ?? tokens.audioCodecsIn
      ? { audioCodecsIn: record.audioCodecsIn ?? tokens.audioCodecsIn }
      : {}),
    ...(record.videoCodecsOut ?? tokens.videoCodecsOut
      ? { videoCodecsOut: record.videoCodecsOut ?? tokens.videoCodecsOut }
      : {}),
    ...(record.audioCodecsOut ?? tokens.audioCodecsOut
      ? { audioCodecsOut: record.audioCodecsOut ?? tokens.audioCodecsOut }
      : {}),
    ...(record.encryption ?? tokens.encryption
      ? { encryption: record.encryption ?? tokens.encryption }
      : {}),
    ...(record.features ?? tokens.features
      ? { features: record.features ?? tokens.features }
      : {}),
    allOfTokens: tokens,
    anyOfCombinations: combinations,
  }) as NormalizedRequires;
}

function validateInputs(
  value: unknown,
  scenarioId: string,
  context: ScenarioValidationContext,
  add: AddDiagnostic,
): void {
  if (!Array.isArray(value) || value.length === 0) {
    add('inputs', 'SCENARIO_INPUTS', 'must be a non-empty array');
    return;
  }
  const variants = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const path = `inputs[${index}]`;
    if (!isPlainRecord(entry)) {
      add(path, 'SCENARIO_INPUT', 'must be a plain object');
      continue;
    }
    rejectUnknownKeys(entry, INPUT_KEYS, path, add);
    if (typeof entry.assetId !== 'string' || entry.assetId.trim().length === 0) {
      add(`${path}.assetId`, 'ASSET_ID', 'must be a non-empty asset id');
    } else if (context.assetExists && !context.assetExists(entry.assetId, scenarioId)) {
      add(`${path}.assetId`, 'ASSET_NOT_FOUND', `asset '${entry.assetId}' does not resolve`);
    }
    if (typeof entry.variantId !== 'string' || !VARIANT_ID_PATTERN.test(entry.variantId)) {
      add(`${path}.variantId`, 'INPUT_VARIANT_ID', 'must be a stable non-empty variant id');
    } else if (variants.has(entry.variantId)) {
      add(`${path}.variantId`, 'DUPLICATE_INPUT_VARIANT', `duplicate variant id '${entry.variantId}'`);
    } else variants.add(entry.variantId);
    if (entry.role !== undefined && (typeof entry.role !== 'string' || entry.role.trim().length === 0)) {
      add(`${path}.role`, 'INPUT_ROLE', 'must be a non-empty string');
    }
  }
}

function validateOptions(operation: unknown, value: unknown, add: AddDiagnostic): void {
  if (!isPlainRecord(value)) {
    add('options', 'SCENARIO_OPTIONS', 'must be a plain JSON object');
    return;
  }
  validateJsonValue(value, 'options', add);
  if (!OPERATION_IDS.has(operation as Operation)) return;
  rejectUnknownKeys(value, OPTION_KEYS[operation as Operation], 'options', add, 'ILLEGAL_OPERATION_OPTION');
  if (OUTPUT_CONTAINER_OPERATIONS.has(operation as Operation) &&
      (typeof value.container !== 'string' || value.container.trim().length === 0)) {
    add('options.container', 'OUTPUT_CONTAINER_REQUIRED', `operation '${operation}' requires a container`);
  }
  if (operation === 'decodeFrames' && (!Number.isSafeInteger(value.maxFrames) || (value.maxFrames as number) <= 0)) {
    add('options.maxFrames', 'DECODE_FRAME_LIMIT', 'must be a positive safe integer');
  }
  if (operation === 'seek' && !Number.isFinite(value.tUs)) {
    add('options.tUs', 'SEEK_TARGET', 'must be a finite timestamp');
  }
  if (operation === 'decrypt') {
    if (typeof value.scheme !== 'string') add('options.scheme', 'DECRYPT_SCHEME', 'must be a scheme string');
    if (!isPlainRecord(value.key)) add('options.key', 'DECRYPT_KEY', 'must be a key descriptor object');
  }
}

function validateRequires(value: unknown, operation: unknown, add: AddDiagnostic): void {
  if (!isPlainRecord(value)) {
    add('requires', 'SCENARIO_REQUIRES', 'must be a plain object');
    return;
  }
  rejectUnknownKeys(value, REQUIREMENT_KEYS, 'requires', add);
  for (const [key, vocabulary] of REQUIREMENT_VOCABULARIES) {
    validateTokenArray(value[key], `requires.${key}`, vocabulary, key === 'operations', add);
  }
  if (!isPlainRecord(value.allOfTokens)) {
    add('requires.allOfTokens', 'REQUIREMENT_TOKENS', 'must be a plain object');
  } else {
    rejectUnknownKeys(value.allOfTokens, TOKEN_KEYS, 'requires.allOfTokens', add);
    for (const [key, vocabulary] of REQUIREMENT_VOCABULARIES) {
      validateTokenArray(
        value.allOfTokens[key],
        `requires.allOfTokens.${key}`,
        vocabulary,
        key === 'operations',
        add,
      );
      if (Array.isArray(value[key]) && Array.isArray(value.allOfTokens[key]) &&
          !sameJson(value[key], value.allOfTokens[key])) {
        add(
          `requires.allOfTokens.${key}`,
          'ATOMIC_TOKEN_MISMATCH',
          `must equal the compatibility token array requires.${key}`,
        );
      }
    }
  }
  if (!Array.isArray(value.anyOfCombinations) || value.anyOfCombinations.length === 0) {
    add('requires.anyOfCombinations', 'REQUIREMENT_COMBINATIONS', 'must be a non-empty array');
    return;
  }
  value.anyOfCombinations.forEach((entry, index) => validateCombination(entry, index, operation, add));
}

function validateCombination(entry: unknown, index: number, scenarioOperation: unknown, add: AddDiagnostic): void {
  const path = `requires.anyOfCombinations[${index}]`;
  if (!isPlainRecord(entry)) {
    add(path, 'REQUIREMENT_COMBINATION', 'must be a plain object');
    return;
  }
  rejectUnknownKeys(entry, COMBINATION_KEYS, path, add);
  if (!OPERATION_IDS.has(entry.operation as Operation)) {
    add(`${path}.operation`, 'COMBINATION_OPERATION', 'must name a known operation');
  }
  for (const [key, vocabulary] of COMBINATION_VOCABULARIES) {
    validateTokenArray(entry[key], `${path}.${key}`, vocabulary, false, add);
  }
  if (entry.optionConstraints !== undefined) {
    if (!isPlainRecord(entry.optionConstraints)) {
      add(`${path}.optionConstraints`, 'OPTION_CONSTRAINTS', 'must be a plain JSON object');
    } else {
      validateJsonValue(entry.optionConstraints, `${path}.optionConstraints`, add);
      if (OPERATION_IDS.has(scenarioOperation as Operation)) {
        rejectUnknownKeys(
          entry.optionConstraints,
          OPTION_KEYS[scenarioOperation as Operation],
          `${path}.optionConstraints`,
          add,
          'ILLEGAL_OPTION_CONSTRAINT',
        );
      }
    }
  }
  validateTokenArray(entry.browserRoles, `${path}.browserRoles`, BROWSER_ROLES, false, add);
  if (entry.browserConfigRecipes !== undefined) {
    if (!Array.isArray(entry.browserConfigRecipes)) {
      add(`${path}.browserConfigRecipes`, 'BROWSER_CONFIG_RECIPES', 'must be an array');
    } else {
      entry.browserConfigRecipes.forEach((recipe, recipeIndex) => {
        const recipePath = `${path}.browserConfigRecipes[${recipeIndex}]`;
        if (!isPlainRecord(recipe)) {
          add(recipePath, 'BROWSER_CONFIG_RECIPE', 'must be a plain object');
          return;
        }
        rejectUnknownKeys(recipe, RECIPE_KEYS, recipePath, add);
        if (!BROWSER_ROLES.has(recipe.role as BrowserCodecRole)) {
          add(`${recipePath}.role`, 'BROWSER_ROLE', 'must name a WebCodecs role');
        }
        if (!RECIPE_SOURCES.has(recipe.source as WebCodecsConfigRecipe['source'])) {
          add(`${recipePath}.source`, 'BROWSER_CONFIG_SOURCE', 'must name a supported config source');
        }
        if (recipe.trackIndex !== undefined &&
            (!Number.isSafeInteger(recipe.trackIndex) || (recipe.trackIndex as number) < 0)) {
          add(`${recipePath}.trackIndex`, 'BROWSER_CONFIG_TRACK', 'must be a non-negative safe integer');
        }
        if (Array.isArray(entry.browserRoles) && !entry.browserRoles.includes(recipe.role)) {
          add(`${recipePath}.role`, 'BROWSER_ROLE_UNDECLARED', 'must also appear in browserRoles');
        }
      });
    }
  }
}

function validateTolerances(value: unknown, add: AddDiagnostic): void {
  if (!isPlainRecord(value)) {
    add('tolerances', 'SCENARIO_TOLERANCES', 'must be a plain object');
    return;
  }
  rejectUnknownKeys(value, TOLERANCE_KEYS, 'tolerances', add);
  for (const key of TOLERANCE_KEYS) {
    const entry = value[key];
    if (entry === undefined) continue;
    if (typeof entry !== 'number' || !Number.isFinite(entry)) {
      add(`tolerances.${key}`, 'TOLERANCE_FINITE', 'must be a finite number');
      continue;
    }
    if (entry < 0 || (key === 'ssimMin' && entry > 1)) {
      add(`tolerances.${key}`, 'TOLERANCE_RANGE', key === 'ssimMin' ? 'must be within [0, 1]' : 'must be non-negative');
    }
  }
}

function validateMutation(source: Record<string, unknown>, context: ScenarioValidationContext, add: AddDiagnostic): void {
  if (source.mutation === undefined) return;
  if (!isPlainRecord(source.mutation)) {
    add('mutation', 'SCENARIO_MUTATION', 'must be a declarative mutation object');
    return;
  }
  rejectUnknownKeys(source.mutation, MUTATION_KEYS, 'mutation', add);
  const id = source.mutation.mutationId;
  if (typeof id !== 'string' || !HANDLER_ID_PATTERN.test(id)) {
    add('mutation.mutationId', 'MUTATION_ID', 'must be a stable handler id');
  } else if (context.mutationHandlerExists && !context.mutationHandlerExists(id)) {
    add('mutation.mutationId', 'MUTATION_HANDLER_UNKNOWN', `unknown mutation handler '${id}'`);
  }
  if (!isPlainRecord(source.mutation.parameters)) {
    add('mutation.parameters', 'MUTATION_PARAMETERS', 'must be a plain JSON object');
  } else validateJsonValue(source.mutation.parameters, 'mutation.parameters', add);
  const negativePath = source.family === 'robustness' ||
    (typeof source.id === 'string' && NEGATIVE_SCENARIO_PATTERN.test(source.id)) ||
    (Array.isArray(source.oracles) && source.oracles.includes('graceful-failure'));
  if (!negativePath) {
    add('mutation', 'MUTATION_SCOPE', 'mutations are confined to negative/robustness scenarios');
  }
}

function validateIdArray(
  value: unknown,
  path: string,
  vocabulary: ReadonlySet<string> | undefined,
  nonEmpty: boolean,
  add: AddDiagnostic,
): void {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)) {
    add(path, 'SCENARIO_ARRAY', `must be ${nonEmpty ? 'a non-empty' : 'an'} array`);
    return;
  }
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      add(`${path}[${index}]`, 'SCENARIO_TOKEN', 'must be a non-empty string');
    } else if (vocabulary && !vocabulary.has(entry)) {
      add(`${path}[${index}]`, 'SCENARIO_HANDLER_UNKNOWN', `unknown handler/token '${entry}'`);
    } else if (seen.has(entry)) {
      add(`${path}[${index}]`, 'DUPLICATE_TOKEN', `duplicate token '${entry}'`);
    } else seen.add(entry);
  }
}

function validateTokenArray(
  value: unknown,
  path: string,
  vocabulary: ReadonlySet<string>,
  required: boolean,
  add: AddDiagnostic,
): void {
  if (value === undefined && !required) return;
  validateIdArray(value, path, vocabulary, required, add);
}

function validateJsonValue(value: unknown, path: string, add: AddDiagnostic, active = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) add(path, 'JSON_NUMBER_FINITE', 'must be a finite JSON number');
    return;
  }
  if (typeof value !== 'object') {
    add(path, 'JSON_SAFE', `${typeof value} is not JSON-safe`);
    return;
  }
  if (active.has(value)) {
    add(path, 'JSON_CYCLE', 'cyclic values are not JSON-safe');
    return;
  }
  if (!Array.isArray(value) && !isPlainRecord(value)) {
    add(path, 'JSON_OBJECT', 'must be a plain JSON object or array');
    return;
  }
  active.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateJsonValue(entry, `${path}[${index}]`, add, active));
  } else {
    for (const [key, entry] of Object.entries(value)) validateJsonValue(entry, `${path}.${key}`, add, active);
  }
  active.delete(value);
}

function combinationMatches(combination: RequirementCombination, request: ConcreteOperationRequest): boolean {
  if (combination.operation !== request.operation) return false;
  const inputContainers = request.inputs.map((input) => input.container);
  const inputVideo = request.inputs.flatMap((input) => input.tracks.filter((track) => track.type === 'video').map((track) => track.codec));
  const inputAudio = request.inputs.flatMap((input) => input.tracks.filter((track) => track.type === 'audio').map((track) => track.codec));
  if (!containsEvery(combination.containersIn, inputContainers)) return false;
  if (!containsEvery(combination.videoCodecsIn, inputVideo)) return false;
  if (!containsEvery(combination.audioCodecsIn, inputAudio)) return false;
  if (combination.containersOut &&
      (!request.output || !combination.containersOut.includes(request.output.container))) return false;
  if (combination.videoCodecsOut &&
      (!request.output?.videoCodec || !combination.videoCodecsOut.includes(request.output.videoCodec))) return false;
  if (combination.audioCodecsOut &&
      (!request.output?.audioCodec || !combination.audioCodecsOut.includes(request.output.audioCodec))) return false;
  if (combination.encryption &&
      (!request.encryption || !combination.encryption.includes(request.encryption))) return false;
  if (combination.optionConstraints && !recordContains(request.options, combination.optionConstraints)) return false;
  return true;
}

function deriveWebCodecsConfig(
  recipe: WebCodecsConfigRecipe,
  request: ConcreteOperationRequest,
): ConcreteWebCodecsConfig {
  const selected = selectTrack(request, recipe.role.startsWith('video') ? 'video' : 'audio', recipe.trackIndex);
  switch (recipe.role) {
    case 'video-decoder': {
      if (!selected || selected.track.type !== 'video') throw configDerivationError(recipe, 'selected video input metadata is absent');
      const width = positiveNumber(selected.track.width, 'codedWidth', recipe);
      const height = positiveNumber(selected.track.height, 'codedHeight', recipe);
      return {
        role: recipe.role,
        trackIndex: selected.index,
        config: { codec: webCodecsCodec(selected.track.nativeCodecTag ?? selected.track.codec), codedWidth: width, codedHeight: height },
      };
    }
    case 'audio-decoder': {
      if (!selected || selected.track.type !== 'audio') throw configDerivationError(recipe, 'selected audio input metadata is absent');
      return {
        role: recipe.role,
        trackIndex: selected.index,
        config: {
          codec: webCodecsCodec(selected.track.nativeCodecTag ?? selected.track.codec),
          sampleRate: positiveNumber(selected.track.sampleRate, 'sampleRate', recipe),
          numberOfChannels: positiveNumber(selected.track.channels, 'numberOfChannels', recipe),
        },
      };
    }
    case 'video-encoder': {
      const inputVideo = selected?.track.type === 'video' ? selected.track : undefined;
      const width = positiveNumber(request.output?.width ?? inputVideo?.width, 'width', recipe);
      const height = positiveNumber(request.output?.height ?? inputVideo?.height, 'height', recipe);
      if (!request.output?.videoCodec) throw configDerivationError(recipe, 'output video codec is absent');
      const videoOptions = isPlainRecord(request.options.video) ? request.options.video : undefined;
      return {
        role: recipe.role,
        ...(selected ? { trackIndex: selected.index } : {}),
        config: {
          codec: webCodecsCodec(request.output.videoCodec), width, height,
          ...(request.output.frameRate ? { framerate: request.output.frameRate } : {}),
          ...(typeof videoOptions?.bitrate === 'number' ? { bitrate: videoOptions.bitrate } : {}),
        },
      };
    }
    case 'audio-encoder': {
      const inputAudio = selected?.track.type === 'audio' ? selected.track : undefined;
      if (!request.output?.audioCodec) throw configDerivationError(recipe, 'output audio codec is absent');
      const audioOptions = isPlainRecord(request.options.audio) ? request.options.audio : undefined;
      return {
        role: recipe.role,
        ...(selected ? { trackIndex: selected.index } : {}),
        config: {
          codec: webCodecsCodec(request.output.audioCodec),
          sampleRate: positiveNumber(request.output.sampleRate ?? inputAudio?.sampleRate, 'sampleRate', recipe),
          numberOfChannels: positiveNumber(request.output.channels ?? inputAudio?.channels, 'numberOfChannels', recipe),
          ...(typeof audioOptions?.bitrate === 'number' ? { bitrate: audioOptions.bitrate } : {}),
        },
      };
    }
  }
}

function selectTrack(
  request: ConcreteOperationRequest,
  type: 'video' | 'audio',
  selectedIndex: number | undefined,
): { track: ConcreteOperationRequest['inputs'][number]['tracks'][number]; index: number } | undefined {
  const tracks = request.inputs.flatMap((input) => input.tracks).map((track, index) => ({ track, index }));
  if (selectedIndex !== undefined) {
    const selected = tracks[selectedIndex];
    return selected?.track.type === type ? selected : undefined;
  }
  return tracks.find((entry) => entry.track.type === type);
}

function configDerivationError(recipe: WebCodecsConfigRecipe, detail: string): TypeError {
  return new TypeError(`cannot derive ${recipe.role} config from ${recipe.source}: ${detail}`);
}

function positiveNumber(value: unknown, field: string, recipe: WebCodecsConfigRecipe): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw configDerivationError(recipe, `${field} is not a positive finite number`);
  }
  return value;
}

function webCodecsCodec(token: string): string {
  const normalized = token.trim().toLowerCase();
  if (normalized.includes('.')) return token;
  return WEB_CODECS_CODEC_DEFAULTS[normalized] ?? token;
}

function deriveRenditionIds(options: JsonObject): string[] {
  const variants = options.variants;
  if (!Array.isArray(variants)) return [];
  return variants.map((variant, index) =>
    isPlainRecord(variant) && typeof variant.renditionId === 'string' && variant.renditionId
      ? variant.renditionId
      : `rendition-${index + 1}`);
}

function operationHasEncodedOutput(operation: Operation): boolean {
  return operation === 'remux' || operation === 'transcode' || operation === 'trim' || operation === 'mux';
}

function containsEvery(declared: readonly string[] | undefined, actual: readonly string[]): boolean {
  return !declared || actual.every((token) => declared.includes(token));
}

function recordContains(actual: Readonly<Record<string, unknown>>, expected: JsonObject): boolean {
  return Object.entries(expected).every(([key, value]) => {
    const candidate = actual[key];
    return isPlainRecord(value) && isPlainRecord(candidate)
      ? recordContains(candidate, value)
      : sameJson(candidate, value);
  });
}

function sameJson(a: unknown, b: unknown): boolean {
  try {
    return canonicalJsonSha256(a) === canonicalJsonSha256(b);
  } catch {
    return false;
  }
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  add: AddDiagnostic,
  code = 'SCHEMA_ADDITIONAL_PROPERTY',
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) add(path === '$' ? key : `${path}.${key}`, code, `unknown field '${key}'`);
  }
}

function cloneDefinitionValue<T>(value: T, seen = new Map<object, unknown>()): T {
  if (value === null || typeof value !== 'object') return value;
  const existing = seen.get(value);
  if (existing !== undefined) return existing as T;
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    seen.set(value, out);
    for (const entry of value) out.push(cloneDefinitionValue(entry, seen));
    return out as T;
  }
  const out: Record<string, unknown> = {};
  seen.set(value, out);
  for (const [key, entry] of Object.entries(value)) out[key] = cloneDefinitionValue(entry, seen);
  return out as T;
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry, seen);
  return Object.freeze(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function arrayEntries(value: unknown): Array<[number, unknown]> {
  return Array.isArray(value) ? [...value.entries()] : [];
}

type AddDiagnostic = (path: string, code: string, message: string) => void;

const DEFAULT_SCENARIO_TIMEOUT_MS = 120_000;
const SCENARIO_ID_PATTERN = /^[a-z0-9][a-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const VARIANT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/+-]*$/;
const HANDLER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const NEGATIVE_SCENARIO_PATTERN = /\/(?:negative|malformed|corrupt|fuzz|truncat|destroy|invalid|empty|graceful)/i;
const FAMILY_IDS = new Set<ScenarioFamily>(SCENARIO_FAMILY_MANIFEST.map((entry) => entry.family));
const OPERATION_IDS = new Set<Operation>([
  'probe', 'demux', 'remux', 'transcode', 'decodeFrames', 'seek', 'trim', 'mux', 'decrypt',
]);
const ORACLE_IDS = new Set<OracleId>([
  'golden-metadata', 'golden-packets', 'decoded-frames-bitexact', 'decoded-audio-pcm',
  'reference-reimport', 'playback-smoke', 'ssim-psnr', 'mp4-box-layout', 'webm-live-layout',
  'fanout-renditions', 'alpha-plane', 'seek-accuracy', 'trim-boundaries', 'decrypt-bitexact',
  'graceful-failure', 'property-invariant',
]);
const METRIC_IDS = new Set<MetricId>([
  'wall', 'throughputRealtime', 'peakMemory', 'sourceReads', 'targetWrites', 'bytesOut', 'longtasks',
  'decodeFps', 'encodeFps', 'opsPerSec', 'packetsPerSec', 'framesPerSec', 'sampleFramesPerSec', 'seekMs',
  'timeToFirstByte', 'timeToFirstFrame', 'loadInit', 'bundleSize',
]);
const CONTAINERS = new Set([
  'adts', 'aiff', 'caf', 'flac', 'hls', 'jpeg', 'mkv', 'mov', 'mp3', 'mp4', 'ogg', 'png',
  'ts', 'wav', 'webm', 'webp',
]);
const VIDEO_CODECS = new Set(['av1', 'h264', 'hevc', 'vp8', 'vp9']);
const AUDIO_CODECS = new Set([
  'aac', 'flac', 'mp3', 'opus', 'pcm-f32', 'pcm-s16', 'pcm-s16be', 'pcm-s24', 'pcm-s24be', 'vorbis',
]);
const ENCRYPTION_SCHEMES = new Set<EncryptionScheme>([
  'cenc-ctr', 'cenc-cbcs', 'hls-aes128', 'clearkey', 'cenc-cens', 'hls-sample-aes',
]);
const FEATURES = new Set([
  'alpha', 'alpha:transcode', 'audio-dsp:endianness-roundtrip', 'audio-samples:gapless-priming', 'colorspace', 'crf', 'crop',
  'decode:audio-pcm', 'decode:golden-rgba', 'depth:10bit-output', 'depth:10bit-to-8bit', 'downmix',
  'fade', 'fanout', 'fastStart:in-memory', 'fastStart:none', 'fastStart:reserve',
  'flac:seektable-seek-equivalence', 'flip', 'fps', 'fragmented', 'gain', 'headerless', 'hls:aes128',
  'mediarecorder:video-only', 'metadata:protected-tracks', 'metadata:write', 'probe:resource-trace',
  'mux:browser-decode-equality', 'mux:hevc-browser-decode-equality', 'mux:roundtrip-compare', 'mux:sparse-co64',
  'mux:vfr-timestamps', 'packets:dts', 'pad', 'remux:av1-opus-in-mp4', 'remux:av1-opus-in-webm',
  'remux:compose', 'remux:flac-in-ogg', 'remux:mp3-in-mp4', 'remux:vp9-opus-in-mp4', 'resample',
  'resize', 'rotate', 'rotation:decode', 'streaming:decode-equality', 'target:writes', 'tonemap',
  'trim:compose', 'trim:flac-no-seektable-frame-scan', 'trim:flac-seektable-copy',
  'trim:frame-accurate', 'trim:frame-accurate-hevc', 'trim:massive-lazy-read', 'two-pass', 'upmix',
  'webcrypto:cenc-ctr-clear-output',
]);
const BROWSER_ROLES = new Set<BrowserCodecRole>([
  'video-decoder', 'video-encoder', 'audio-decoder', 'audio-encoder',
]);
const RECIPE_SOURCES = new Set<WebCodecsConfigRecipe['source']>([
  'selected-input-video', 'selected-input-audio', 'output-video', 'output-audio',
]);

const ROOT_DEFINITION_KEYS = new Set([
  'schemaVersion', 'id', 'revision', 'family', 'order', 'op', 'inputs', 'options', 'requires',
  'oracles', 'metrics', 'primaryMetric', 'tolerances', 'timeoutMs', 'notes', 'mutation',
  'inputVariantIds', 'renditionIds',
]);
const INPUT_KEYS = new Set(['assetId', 'variantId', 'role']);
const MUTATION_KEYS = new Set(['mutationId', 'parameters']);
const TOLERANCE_KEYS = new Set<keyof OracleTolerances>([
  'ssimMin', 'psnrMinDb', 'durationToleranceSec', 'fpsTolerance', 'seekToleranceUs',
]);
const TOKEN_KEYS = new Set([
  'operations', 'containersIn', 'containersOut', 'videoCodecs', 'audioCodecs', 'videoCodecsIn',
  'audioCodecsIn', 'videoCodecsOut', 'audioCodecsOut', 'encryption', 'features',
]);
const REQUIREMENT_KEYS = new Set([...TOKEN_KEYS, 'allOfTokens', 'anyOfCombinations']);
const COMBINATION_KEYS = new Set([
  'operation', 'containersIn', 'containersOut', 'videoCodecsIn', 'audioCodecsIn', 'videoCodecsOut',
  'audioCodecsOut', 'encryption', 'features', 'optionConstraints', 'browserRoles',
  'browserConfigRecipes',
]);
const RECIPE_KEYS = new Set(['role', 'source', 'trackIndex']);
const REQUIREMENT_VOCABULARIES = [
  ['operations', OPERATION_IDS], ['containersIn', CONTAINERS], ['containersOut', CONTAINERS],
  ['videoCodecs', VIDEO_CODECS], ['audioCodecs', AUDIO_CODECS], ['videoCodecsIn', VIDEO_CODECS],
  ['audioCodecsIn', AUDIO_CODECS], ['videoCodecsOut', VIDEO_CODECS], ['audioCodecsOut', AUDIO_CODECS],
  ['encryption', ENCRYPTION_SCHEMES], ['features', FEATURES],
] as const;
const COMBINATION_VOCABULARIES = [
  ['containersIn', CONTAINERS], ['containersOut', CONTAINERS], ['videoCodecsIn', VIDEO_CODECS],
  ['audioCodecsIn', AUDIO_CODECS], ['videoCodecsOut', VIDEO_CODECS], ['audioCodecsOut', AUDIO_CODECS],
  ['encryption', ENCRYPTION_SCHEMES], ['features', FEATURES],
] as const;

const OPTION_KEYS: Record<Operation, ReadonlySet<string>> = {
  probe: new Set(['gracefulAllowOutput', 'invariant', 'metadataTrackTypes', 'property', 'robustness']),
  demux: new Set(['gracefulAllowOutput', 'invariant', 'robustness']),
  remux: new Set(['appendOnly', 'container', 'durationUs', 'fastStart', 'fragmented', 'gracefulAllowOutput', 'invariant', 'maximumPacketCount', 'robustness', 'roundTrip', 'tags', 'target', 'targetUs', 'writeChunkBytes']),
  transcode: new Set(['alpha', 'audio', 'colorspace', 'container', 'crop', 'fastStart', 'flip', 'gracefulAllowOutput', 'invariant', 'pad', 'robustness', 'tonemap', 'variants', 'video']),
  decodeFrames: new Set([
    'alphaEvidence', 'decodeProvenance', 'decodeTrackSelector', 'displayEvidence',
    'gracefulAllowOutput', 'imageDecoder', 'invariant', 'maxFrames', 'robustness', 'selectTrackType',
  ]),
  seek: new Set(['expectKeyframe', 'invariant', 'priorSeekUs', 'robustness', 'seekEdge', 'seekPolicy', 'tUs']),
  trim: new Set(['a', 'b', 'c', 'container', 'endUs', 'fragmented', 'frameAccurate', 'gracefulAllowOutput', 'invariant', 'range', 'robustness', 'startUs']),
  mux: new Set(['container', 'fastStart', 'fragmented', 'invariant', 'robustness', 'swapAudioFrom', 'target', 'trackSelect']),
  decrypt: new Set(['cleartextAsset', 'invariant', 'key', 'robustness', 'scheme']),
};
const OUTPUT_CONTAINER_OPERATIONS = new Set<Operation>(['remux', 'transcode', 'trim', 'mux']);

const ORACLES_BY_OPERATION: Record<Operation, ReadonlySet<OracleId>> = {
  probe: new Set(['golden-metadata', 'graceful-failure', 'property-invariant']),
  demux: new Set(['golden-metadata', 'golden-packets', 'graceful-failure', 'property-invariant']),
  remux: new Set(['graceful-failure', 'mp4-box-layout', 'playback-smoke', 'property-invariant', 'reference-reimport', 'webm-live-layout']),
  transcode: new Set(['alpha-plane', 'fanout-renditions', 'graceful-failure', 'playback-smoke', 'property-invariant', 'ssim-psnr']),
  decodeFrames: new Set(['alpha-plane', 'decoded-audio-pcm', 'decoded-frames-bitexact', 'graceful-failure', 'property-invariant', 'ssim-psnr']),
  seek: new Set(['graceful-failure', 'property-invariant', 'seek-accuracy']),
  trim: new Set(['graceful-failure', 'playback-smoke', 'property-invariant', 'reference-reimport', 'trim-boundaries']),
  mux: new Set(['graceful-failure', 'mp4-box-layout', 'property-invariant', 'reference-reimport']),
  decrypt: new Set(['decrypt-bitexact', 'graceful-failure', 'playback-smoke', 'property-invariant', 'reference-reimport']),
};
const METRICS_BY_OPERATION: Record<Operation, ReadonlySet<MetricId>> = {
  probe: new Set(['bundleSize', 'longtasks', 'opsPerSec', 'peakMemory', 'wall']),
  demux: new Set(['longtasks', 'packetsPerSec', 'peakMemory', 'sourceReads', 'throughputRealtime', 'wall']),
  remux: new Set(['bytesOut', 'longtasks', 'peakMemory', 'sourceReads', 'targetWrites', 'throughputRealtime', 'timeToFirstByte', 'wall']),
  transcode: new Set(['decodeFps', 'encodeFps', 'framesPerSec', 'sampleFramesPerSec', 'longtasks', 'peakMemory', 'throughputRealtime', 'wall']),
  decodeFrames: new Set(['decodeFps', 'framesPerSec', 'sampleFramesPerSec', 'longtasks', 'peakMemory', 'timeToFirstFrame', 'wall']),
  seek: new Set(['longtasks', 'peakMemory', 'seekMs', 'wall']),
  trim: new Set(['longtasks', 'peakMemory', 'sourceReads', 'targetWrites', 'throughputRealtime', 'wall']),
  mux: new Set(['bytesOut', 'longtasks', 'peakMemory', 'targetWrites', 'throughputRealtime', 'wall']),
  decrypt: new Set(['longtasks', 'peakMemory', 'throughputRealtime', 'wall']),
};

const WEB_CODECS_CODEC_DEFAULTS: Record<string, string> = {
  h264: 'avc1.640028', hevc: 'hvc1.1.6.L93.B0', vp8: 'vp8', vp9: 'vp09.00.10.08',
  av1: 'av01.0.08M.08', aac: 'mp4a.40.2', opus: 'opus', mp3: 'mp3', flac: 'flac', vorbis: 'vorbis',
};

// ── Result types (produced by runner.ts, consumed by report.ts) ──

/**
 * NA is split: NA_ENGINE (engine did not declare the capability), NA_BROWSER (browser lacks the
 * WebCodecs codec / API), and NA_ASSET (the corpus asset is intentionally absent/unbaked).
 * These must never be collapsed in machine-readable results (anti-pattern §15).
 */
// Correctness is binary: a semantically-correct output is PASS, a wrong output is FAIL. A
// representationally-different-but-correct result (codec spelling, estimate-only duration, logical
// track reordering, …) is a PASS — the difference is recorded in the outcome detail, never a verdict.
export type OracleVerdict = 'PASS' | 'FAIL';
export type OracleUnavailableStatus = 'NA_ASSET' | 'NA_BROWSER';

/**
 * One oracle's complete, serializable result. Applicability and harness failures deliberately do
 * not share the verdict channel: unavailable evidence cannot be mistaken for wrong media, and an
 * oracle implementation throw cannot be persisted as a semantic FAIL.
 */
export type OracleOutcome =
  | {
      state: 'VERDICT';
      oracle: OracleId;
      verdict: OracleVerdict;
      /** Stable machine-readable semantic reason; prose never controls verdict routing. */
      reasonCode: string;
      detail?: string;
      /** structured measurements an oracle produced (e.g. { ssim: 0.994, psnrDb: 42.1 }) */
      measurements?: Record<string, number>;
      /** JSON-safe, non-numeric protocol/trace evidence retained for audit and replay. */
      evidence?: JsonObject;
    }
  | {
      state: 'UNAVAILABLE';
      oracle: OracleId;
      status: OracleUnavailableStatus;
      /** stable machine-readable reason; human prose must never control result routing */
      reasonCode: string;
      detail: string;
      measurements?: Record<string, number>;
      evidence?: JsonObject;
    }
  | {
      state: 'ERROR';
      oracle: OracleId;
      /** stable machine-readable harness/oracle failure reason */
      reasonCode: string;
      detail: string;
      measurements?: Record<string, number>;
      evidence?: JsonObject;
    };

export type ResultStatus =
  | OracleVerdict
  | 'NA_ENGINE'
  | 'NA_BROWSER'
  | 'NA_ASSET'
  | 'ERROR'
  | 'SKIPPED';

export type OracleReductionStatus = OracleVerdict | OracleUnavailableStatus | 'ERROR';

export interface OracleReduction {
  status: OracleReductionStatus;
  /** Stable summary code for the reduction itself. Per-oracle reasons remain on the outcomes. */
  reasonCode: string;
  detail: string;
  /** Deterministically selected only for diagnostics; it never makes reduction order-dependent. */
  decisive?: OracleOutcome;
}

/**
 * Reduce a cell's oracle outcomes without depending on declaration or completion order.
 *
 * Precedence is semantic first (FAIL > PASS). Only when no oracle produced a substantive
 * verdict can a harness ERROR win, followed by NA_BROWSER and then NA_ASSET. NA_ENGINE is excluded
 * by construction: it is an adapter/operation decision made before oracle reduction.
 */
export function reduceOracleOutcomes(outcomes: readonly OracleOutcome[]): OracleReduction {
  const sorted = [...outcomes].sort((a, b) => oracleOutcomeSortKey(a).localeCompare(oracleOutcomeSortKey(b)));
  const verdict = (value: OracleVerdict): OracleOutcome | undefined =>
    sorted.find((outcome) => outcome.state === 'VERDICT' && outcome.verdict === value);

  const fail = verdict('FAIL');
  if (fail) return reduced('FAIL', 'ORACLE_VERDICT_FAIL', fail);
  const pass = verdict('PASS');
  if (pass) return reduced('PASS', 'ORACLE_VERDICT_PASS', pass);

  const error = sorted.find((outcome) => outcome.state === 'ERROR');
  if (error) return reduced('ERROR', 'ORACLE_HARNESS_ERROR', error);
  const browser = sorted.find(
    (outcome) => outcome.state === 'UNAVAILABLE' && outcome.status === 'NA_BROWSER',
  );
  if (browser) return reduced('NA_BROWSER', 'ORACLE_ALL_UNAVAILABLE_BROWSER', browser);
  const asset = sorted.find(
    (outcome) => outcome.state === 'UNAVAILABLE' && outcome.status === 'NA_ASSET',
  );
  if (asset) return reduced('NA_ASSET', 'ORACLE_ALL_UNAVAILABLE_ASSET', asset);

  return {
    status: 'ERROR',
    reasonCode: 'ORACLE_NO_OUTCOMES',
    detail: 'oracle reduction received no outcomes',
  };
}

function reduced(
  status: OracleReductionStatus,
  reasonCode: string,
  decisive: OracleOutcome,
): OracleReduction {
  const suffix = oracleOutcomeDetail(decisive);
  return {
    status,
    reasonCode,
    detail: `oracle '${decisive.oracle}' ${suffix}`,
    decisive,
  };
}

function oracleOutcomeDetail(outcome: OracleOutcome): string {
  if (outcome.state === 'VERDICT') {
    return `${outcome.verdict}${outcome.detail ? `: ${outcome.detail}` : ''}`;
  }
  return `${outcome.state === 'ERROR' ? 'errored' : `unavailable (${outcome.status})`} ` +
    `[${outcome.reasonCode}]: ${outcome.detail}`;
}

function oracleOutcomeSortKey(outcome: OracleOutcome): string {
  const state =
    outcome.state === 'VERDICT'
      ? `0:${outcome.verdict}`
      : outcome.state === 'ERROR'
        ? `1:${outcome.reasonCode}`
        : `2:${outcome.status}:${outcome.reasonCode}`;
  return `${outcome.oracle}\u0000${state}\u0000${outcome.detail ?? ''}`;
}

/** A single timing/resource sample from one measured iteration (see measure.ts). */
export interface MetricSample {
  wallMs?: number;
  /** Actual calibrated batch wall when `wallMs` is normalized per completed operation. */
  batchWallMs?: number;
  throughputRealtime?: number;
  peakMemoryBytes?: number | null;
  sourceReads?: number;
  targetWrites?: number;
  bytesOut?: number;
  longtaskMs?: number;
  decodeFps?: number;
  encodeFps?: number;
  // headline (higher-is-better)
  opsPerSec?: number;
  packetsPerSec?: number;
  framesPerSec?: number;
  sampleFramesPerSec?: number;
  // latency / cost (lower-is-better)
  seekMs?: number;
  timeToFirstByteMs?: number;
  timeToFirstFrameMs?: number;
  loadInitMs?: number; // set by the runner OUTSIDE the timed op window (§0.7), not by the Meter
  bundleSizeKb?: number; // set from the offline per-engine build, not measured at run time
}

/** Aggregated bench statistics over the measured iterations (see bench.ts). */
export interface BenchSummary {
  n: number;
  warmup: number;
  metric: MetricId;
  median: number;
  p95: number;
  mad: number;
  unit: string;
  samples: number[];
  /**
   * Exhaustive-mode (§6.2) representative value COMBINING this metric across every per-file sample:
   * additive lower-is-better cost metrics (wall, I/O counts, bytesOut, latency) SUM to a total cost;
   * peakMemory takes the MAX (a peak is not additive); higher-is-better RATE metrics (ops/s, fps,
   * packets/s, x-realtime) take the MEDIAN (summing rates is meaningless). `samples` holds the
   * per-file values and `n` their count. Absent in single-file mode (there the single `median` IS the
   * value). Fair to compare across engines ONLY when both were combined over the SAME file set — the
   * runner enforces this via coverage-first ranking (ScenarioResult.coverage).
   */
  aggregate?: number;
  /** Exact numerator/denominator observations behind rate samples. */
  ratioComponents?: Array<{ identity: string; numerator: number; denominator: number }>;
  sampleAxis?: 'iteration' | 'file';
  aggregation?: 'median' | 'max' | 'sum' | 'ratio-of-sums';
  requestedIterations?: number;
  timerResolutionMs?: number | null;
  /** JSON-safe protocol and instrument evidence retained alongside the numeric summary. */
  protocolEvidence?: Record<string, unknown>;
}

/** Measurement is orthogonal to the already-established correctness/applicability status. */
export type MeasurementAvailability =
  | { state: 'NOT_REQUESTED' }
  | { state: 'AVAILABLE'; metrics: MetricId[] }
  | { state: 'UNAVAILABLE'; reasonCode: string; detail: string };

export interface SupportEvidence {
  request: ConcreteOperationRequest;
  decision: {
    supported: boolean;
    status?: 'NA_ENGINE' | 'NA_BROWSER';
    reasonCode?: string;
    reason?: string;
  };
  /** Exact cloned configurations supplied to WebCodecs isConfigSupported(). */
  browserConfigs: ConcreteWebCodecsConfig[];
  probes: Array<{
    role: ConcreteWebCodecsConfig['role'];
    state: 'SUPPORTED' | 'UNSUPPORTED' | 'ERROR';
    reasonCode?: string;
  }>;
}

export interface ScenarioInstance {
  scenarioId: string;
  scenarioRevision: number;
  definitionHash: string;
  inputVariantId: string;
  /** Null is reserved for explicitly migrated v1 rows whose bytes were never content-addressed. */
  inputSha256: string | null;
}

export interface ScenarioExecutionFingerprint {
  schema: 'media-test/scenario-result@3';
  hash: string;
}

/** Structurally mirrors the robustness feature contract without importing feature code into core. */
export interface ScenarioOperationEvidence {
  schema: 'media-test/robustness-operation@1';
  disposition:
    | 'returned-validatable-output'
    | 'clean-reject'
    | 'not-applicable'
    | 'browser-unavailable'
    | 'timeout'
    | 'worker-crash'
    | 'resource-limit'
    | 'harness-error';
  stage: 'preflight' | 'operation' | 'survivor-oracle' | 'cleanup';
  nativeError?: { name: string; code?: string };
  resource?: {
    kind: 'wall-time' | 'memory' | 'worker-stall';
    observed?: number;
    limit?: number;
    unit?: 'ms' | 'bytes';
  };
}

/**
 * Candidate-specific oracle sufficiency, preserved independently from the cell verdict.  This is
 * the typed replacement for inferring evidence availability from human-readable oracle details.
 */
export interface CandidateEvidenceResult {
  schema: 'media-test/candidate-evidence-result@1';
  contractDigest: string;
  status: 'PASS' | 'FAIL' | 'NA_ASSET' | 'NA_BROWSER' | 'ERROR';
  reasonCode: string;
  required: readonly OracleId[];
  applied: readonly OracleId[];
  unavailable: readonly {
    oracle: OracleId;
    status: 'NA_ASSET' | 'NA_BROWSER';
    reasonCode: string;
  }[];
  sufficientSurvivorOracles: readonly OracleId[];
  sufficient: boolean;
}

/** Provenance for a content-addressed observation reused under the current run envelope. */
export interface CacheReuseEvidence {
  schema: 'media-test/cache-reuse@1';
  sourceKey: string;
  sourceObservationHash: string;
  sourceRunId?: string;
  createdAtIso: string;
  originalOrigin: string;
  validationEpoch: string;
  validBecause: string;
  importedFrom?: string;
  sourceEnvironment?: RunEnv;
  selectionEnvelope?: ResultSelection;
}

export interface ExhaustiveOutcomeCounts {
  pass: number;
  fail: number;
  error: number;
  naEngine: number;
  naBrowser: number;
  naAsset: number;
  skipped: number;
  total: number;
}

export interface ExhaustiveCoverage {
  passed: number;
  admissible: number;
  total: number;
  valid: number;
  grade: 'full' | 'partial' | 'none';
  counts: ExhaustiveOutcomeCounts;
}

export interface ExhaustiveStatusReduction {
  status: ResultStatus;
  coverage: ExhaustiveCoverage;
}

/**
 * Reduce per-input statuses without depending on input order. Semantic verdicts retain the same
 * FAIL > PASS precedence as oracle reduction; ERROR is considered only after a real FAIL.
 * Applicability kinds are used only when no input produced a correctness-valid or failing signal.
 */
export function reduceExhaustiveStatuses(
  statuses: readonly ResultStatus[],
): ExhaustiveStatusReduction {
  const count = (status: ResultStatus): number => statuses.filter((entry) => entry === status).length;
  const counts: ExhaustiveOutcomeCounts = {
    pass: count('PASS'),
    fail: count('FAIL'),
    error: count('ERROR'),
    naEngine: count('NA_ENGINE'),
    naBrowser: count('NA_BROWSER'),
    naAsset: count('NA_ASSET'),
    skipped: count('SKIPPED'),
    total: statuses.length,
  };
  const valid = counts.pass;
  const admissible = valid + counts.fail + counts.error;
  const terminalIntrinsicCoverage =
    counts.pass > 0 &&
    counts.fail === 0 &&
    counts.error === 0 &&
    counts.naBrowser === 0 &&
    counts.naAsset === 0 &&
    counts.skipped === 0;
  const grade: ExhaustiveCoverage['grade'] =
    terminalIntrinsicCoverage ? 'full' : valid > 0 ? 'partial' : 'none';
  const status: ResultStatus =
    counts.fail > 0 ? 'FAIL' :
    counts.error > 0 ? 'ERROR' :
    counts.pass > 0 ? 'PASS' :
    counts.naEngine > 0 ? 'NA_ENGINE' :
    counts.naBrowser > 0 ? 'NA_BROWSER' :
    counts.naAsset > 0 ? 'NA_ASSET' :
    'SKIPPED';
  return {
    status,
    coverage: { passed: valid, admissible, total: counts.total, valid, grade, counts },
  };
}

export interface ScenarioResult {
  /** Persisted result model version; live transitional rows may omit until serialization. */
  schemaVersion?: 2;
  engineId: string;
  engineVersion?: string;
  browser: BrowserName;
  scenarioId: string;
  scenarioRevision?: number;
  definitionHash?: string;
  instance?: ScenarioInstance;
  inputVariantId?: string;
  inputSha256?: string;
  family: ScenarioFamily;
  status: ResultStatus;
  /** for NA / FAIL / ERROR: the reason (which capability/codec, which oracle, the error) */
  reason?: string;
  oracleOutcomes: OracleOutcome[];
  /** per-metric aggregated stats; present only for correctness-valid PASS/DIFF cells */
  bench?: Partial<Record<MetricId, BenchSummary>>;
  /** Benchmark failure/timeout never overwrites a PASS/DIFF correctness verdict. */
  measurement?: MeasurementAvailability;
  /** Concrete tuple + exact browser-config evidence used for applicability. */
  support?: SupportEvidence;
  /** Typed operation disposition for robustness/negative rows. */
  operationEvidence?: ScenarioOperationEvidence;
  /** Typed required/applied/unavailable/sufficient evidence for the selected candidate. */
  candidateEvidence?: CandidateEvidenceResult;
  /** Source observation provenance when this row was reused from the persistent cache. */
  cacheReuse?: CacheReuseEvidence;
  /** Content-addressed runner execution identity. */
  executionFingerprint?: ScenarioExecutionFingerprint;
  /** Offline bundle artifact join evidence supplied by the reporting subsystem. */
  bundleMeasurement?: {
    artifactHash: string;
    measurement?: unknown;
    state?: 'UNAVAILABLE';
    reasonCode?: string;
    reason?: string;
  };
  /** Structured decode size-axis/source identity; never reconstructed from a scenario id. */
  decodeProvenance?: {
    schema: 'media-test/decode-provenance@1';
    assetId: string;
    sizeBucket: 'empty' | 'micro' | 'tiny' | 'small' | 'medium' | 'large' | 'huge';
    resolution: Readonly<{ width: number; height: number }>;
    codec: string;
    heavyBake: boolean;
    selectedAssetId: string;
    actualInputBytes: number;
    inputSha256?: string;
  };
  /**
   * The scenario's primary ranking metric (§9), copied by the runner from ScenarioSpec.primaryMetric
   * so report.ts can rank winners without re-reading the scenario registry. Optional: report.ts falls
   * back to inferring it from the bench keys when absent.
   */
  primaryMetric?: MetricId;
  /**
   * Per-scenario file rotation provenance (scenario-media-test-update-instructions §10). Records which
   * input file this cell was actually run against so a result is reproducible from (runSeed, corpus)
   * and a FAIL on a rotated real file is traceable to the exact bytes. Purely additive — NOT consumed
   * by isAdmissible/scoring. Absent on legacy results (falls back to the scenario's baked input).
   */
  selection?: ResultSelection;
  /**
   * Exhaustive-mode (§6.2) per-file sub-results: present when the scenario was run against EVERY
   * candidate file (baked + all shape-passing real files) in one run, in the same order for every
   * engine. The top-level `status` is the AND of these (PASS only if EVERY file passed; any FAIL/ERROR
   * makes the scenario FAIL and names the offending file). When the aggregate itself PASSes,
   * `bench.<metric>.aggregate` COMBINES its passing files (sum of cost for time/IO metrics, MAX for
   * peak memory, median for rate metrics, §9) while `.samples` keeps each file's value. A FAIL/ERROR
   * aggregate has no headline benchmark; this array still preserves every passing file's individual
   * numbers so the spread is visible and a failure is traceable to its bytes. See `coverage` for how
   * many files were scored (winner ranking is coverage-first).
   */
  exhaustive?: ExhaustiveFileResult[];
  /**
   * Exhaustive-mode (§6.2) file coverage: how many candidate files this engine was actually scored
   * over. `passed` = files that PASSed (eligible for `bench.<metric>.aggregate` when the cell PASSes);
   * `admissible` = PASS+FAIL+ERROR (files that produced a real signal); `total` = all candidate files
   * offered. The per-case WINNER is ranked coverage-FIRST (higher `passed` wins) THEN by the aggregate
   * number, so an engine that skips the hard files (NA on them) can never out-rank one that handled
   * them all. Absent in single-file mode.
   */
  coverage?: ExhaustiveCoverage;
  /** environment captured at run time (browser build, GPU string, suite/engine versions) */
  env?: RunEnv;
  startedAtIso?: string;
  durationMs?: number;
}

/** One file's verdict + numbers within an exhaustive-mode cell (§6.2). */
export interface ExhaustiveFileResult {
  /** the file this sub-result ran against: baked flat asset id, or a real download 'NN.ext'. */
  file: string;
  sha256?: string;
  isBaked: boolean;
  status: ResultStatus;
  reason?: string;
  oracleOutcomes: OracleOutcome[];
  measurement?: MeasurementAvailability;
  support?: SupportEvidence;
  executionFingerprint?: ScenarioExecutionFingerprint;
  selection?: ResultSelection;
  operationEvidence?: ScenarioOperationEvidence;
  candidateEvidence?: CandidateEvidenceResult;
  cacheReuse?: CacheReuseEvidence;
  executed: boolean;
  /** this file's own bench (present only when this file PASSed — correctness gates the number). */
  bench?: Partial<Record<MetricId, BenchSummary>>;
}

/**
 * Which input file a result cell was run against under per-scenario file rotation (§6/§10).
 * `isBaked` distinguishes the golden-backed baked fixture (full oracle set) from a rotated real
 * download (survivor oracles only; golden-keyed oracles → NA_ASSET). Every rotating cell in one run
 * shares the same `runSeed`, so the pick is replayable.
 */
export interface ResultSelection {
  /** on-disk file name actually fed to the engine: baked flat asset id, or a real download 'NN.ext'. */
  file: string;
  /** sha256 of the selected file (from _sources.ndjson for real files / manifest for baked, when known). */
  sha256?: string;
  /** true ⇒ the golden-backed baked fixture was selected; false ⇒ a rotated real internet file. */
  isBaked: boolean;
  /** the run's selection seed (RunOptions.randomSeed), so (runSeed, corpus) replays the pick byte-for-byte. */
  runSeed?: string;
  /** total candidate files considered for this scenario this run (baked + shape-passing real files). */
  candidateCount?: number;
  /** Full canonical identity of the eligible candidate pool used for fairness/replay. */
  eligiblePoolDigest?: string;
  /** Full canonical digest over the exact ordered input identities delivered to the engine. */
  executedInputDigest?: string;
  /** Durable candidate-manifest identity, independent of source row order. */
  candidateIdentity?: string;
  selectionPolicyVersion?: string;
  selectionAlgorithmId?: string;
  /** Full HRW score used for the selected candidate. */
  score?: string;
  probability?: { numerator: 1; denominator: number; weight: 1 };
  /** Typed oracle evidence-plan contract included in cache/replay identity. */
  evidenceContractDigest?: string;
  catalogState?: 'ready' | 'fallback';
  catalogReason?: { reasonCode: string; detail: string };
}

export interface RunEnv {
  suiteVersion: string;
  engineId: string;
  browser: BrowserName;
  browserVersion?: string;
  userAgent?: string;
  gpu?: string;
  corpusChecksum?: string;
  acPower?: boolean;
  pixelBehavior?: {
    state: 'SUPPORTED' | 'UNSUPPORTED';
    reasonCode: string;
    detail: string;
  };
  /** §8.5: the engine's best-path config (engine.configUsed), recorded so a number is reproducible. */
  configUsed?: object;
}
