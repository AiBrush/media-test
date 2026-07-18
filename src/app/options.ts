/** Canonical UI/launcher run-option contract. Keep shell help aligned with RUN_OPTION_DEFINITIONS. */

import type { BrowserName, Operation } from '../core/engine.ts';
import type { ScenarioFamily } from '../core/scenario.ts';

export const RUN_OPTION_LIMITS = Object.freeze({
  warmup: Object.freeze({ min: 0, max: 20, default: 1 }),
  iters: Object.freeze({ min: 1, max: 50, default: 1 }),
  // A full 592-row, multi-engine, exhaustive suite legitimately exceeds 30 minutes before the
  // long-form audio rows finish. Keep a bounded safety deadline, but make the default a full day.
  timeoutMs: Object.freeze({ min: 1_000, max: 86_400_000, default: 86_400_000 }),
});

export const RUN_OPTION_DEFINITIONS = Object.freeze([
  Object.freeze({ cli: '--browser', field: 'browser', value: 'brave|chromium|webkit|firefox', repeatable: false }),
  Object.freeze({ cli: '--engine', field: 'engineIds', value: 'id', repeatable: true }),
  Object.freeze({ cli: '--feature', field: 'featureIds', value: 'id', repeatable: true }),
  Object.freeze({ cli: '--operation', field: 'operations', value: 'op', repeatable: true }),
  Object.freeze({ cli: '--scenario', field: 'scenarioIds', value: 'id', repeatable: true }),
  Object.freeze({ cli: '--pillar', field: 'pillar', value: 'functional|performance|robustness|all', repeatable: false }),
  Object.freeze({ cli: '--warmup', field: 'warmup', value: '0..20', repeatable: false }),
  Object.freeze({ cli: '--iters', field: 'iters', value: '1..50', repeatable: false }),
  Object.freeze({ cli: '--timeout-ms', field: 'timeoutMs', value: '1000..86400000', repeatable: false }),
  Object.freeze({ cli: '--random-seed', field: 'randomSeed', value: 'text', repeatable: false }),
  Object.freeze({ cli: '--exhaustive', field: 'exhaustiveMedia', value: 'boolean', repeatable: false }),
  Object.freeze({ cli: '--no-reuse', field: 'reuseData', value: 'false', repeatable: false }),
] as const);

export type RunPillar = 'functional' | 'performance' | 'robustness' | 'all';
const BROWSER_VALUES = new Set<BrowserName>(['brave', 'chromium', 'webkit', 'firefox']);
const PILLAR_VALUES = new Set<RunPillar>(['functional', 'performance', 'robustness', 'all']);

/** Shared filter accepted by the browser control surface and forwarded by launch.mjs. */
export interface SuiteRunFilter {
  engineIds?: string[];
  featureIds?: ScenarioFamily[];
  scenarioIds?: string[];
  operations?: Operation[];
  pillar?: RunPillar;
  browser?: BrowserName;
  /** UI provenance for auto-detect versus an explicitly tagged launcher browser. */
  browserTag?: BrowserName | 'auto';
  warmup?: number;
  iters?: number;
  timeoutMs?: number;
  reuseData?: boolean;
  /** Backward-compatible alias; normalized immediately and never exported. */
  reuseSuccessful?: boolean;
  randomizeOrder?: boolean;
  randomSeed?: string;
  exhaustiveMedia?: boolean;
}

export interface FrozenRunConfiguration {
  browser: BrowserName;
  browserTag: BrowserName | 'auto';
  engineIds: readonly string[];
  featureIds: readonly ScenarioFamily[];
  scenarioIds: readonly string[];
  operations: readonly Operation[];
  pillar: RunPillar;
  warmup: number;
  iters: number;
  timeoutMs: number;
  reuseData: boolean;
  randomizeOrder: boolean;
  randomSeed: string;
  exhaustiveMedia: boolean;
  mediaMode: 'seeded-single' | 'exhaustive';
}

export interface RunFilterDefaults {
  browser: BrowserName;
  browserTag?: BrowserName | 'auto';
  engineIds: readonly string[];
  featureIds: readonly ScenarioFamily[];
  scenarioIds: readonly string[];
  operations?: readonly Operation[];
  seedFactory?: () => string;
}

export class RunOptionValidationError extends Error {
  readonly field: 'engines' | 'scenarios' | 'warmup' | 'iters' | 'timeout' | 'seed' | 'browser' | 'pillar';
  readonly fieldsetId: string;

  constructor(
    field: RunOptionValidationError['field'],
    message: string,
    fieldsetId: string,
  ) {
    super(message);
    this.name = 'RunOptionValidationError';
    this.field = field;
    this.fieldsetId = fieldsetId;
  }
}

/** Validate, normalize, clone, and deeply freeze the exact configuration a run will execute. */
export function freezeRunConfiguration(
  filter: SuiteRunFilter,
  defaults: RunFilterDefaults,
): FrozenRunConfiguration {
  const engineIds = filter.engineIds === undefined ? [...defaults.engineIds] : uniqueStrings(filter.engineIds);
  if (engineIds.length === 0) {
    throw new RunOptionValidationError('engines', 'Select at least one engine.', 'engines-fs');
  }

  // Sort the selected scenarios alphabetically so both the rendered matrix rows AND the scenario-major
  // execution order share one order: with "Randomize next test row" off, the run fills the table
  // top-to-bottom starting from the first row instead of leading with the probe/ family.
  const scenarioIds = (filter.scenarioIds === undefined ? [...defaults.scenarioIds] : uniqueStrings(filter.scenarioIds))
    .slice()
    .sort((a, b) => a.localeCompare(b));
  if (scenarioIds.length === 0) {
    throw new RunOptionValidationError('scenarios', 'Select at least one scenario.', 'scenarios-fs');
  }

  const featureIds = filter.featureIds === undefined
    ? [...defaults.featureIds]
    : uniqueStrings(filter.featureIds) as ScenarioFamily[];
  const operations = filter.operations === undefined
    ? [...(defaults.operations ?? [])]
    : uniqueStrings(filter.operations) as Operation[];
  const warmup = boundedInteger(filter.warmup ?? RUN_OPTION_LIMITS.warmup.default, 'warmup');
  const iters = boundedInteger(filter.iters ?? RUN_OPTION_LIMITS.iters.default, 'iters');
  const timeoutMs = boundedInteger(filter.timeoutMs ?? RUN_OPTION_LIMITS.timeoutMs.default, 'timeoutMs');
  const randomSeed = (filter.randomSeed ?? defaults.seedFactory?.() ?? '').trim();
  if (!randomSeed) {
    throw new RunOptionValidationError('seed', 'Enter a non-empty replay seed.', 'options-fs');
  }
  const exhaustiveMedia = filter.exhaustiveMedia === true;
  const browser = filter.browser ?? defaults.browser;
  if (!BROWSER_VALUES.has(browser)) {
    throw new RunOptionValidationError('browser', 'Choose a supported browser value.', 'options-fs');
  }
  const browserTag = filter.browserTag ?? defaults.browserTag ?? 'auto';
  if (browserTag !== 'auto' && !BROWSER_VALUES.has(browserTag)) {
    throw new RunOptionValidationError('browser', 'Choose auto or a supported browser tag.', 'options-fs');
  }
  const pillar = filter.pillar ?? 'all';
  if (!PILLAR_VALUES.has(pillar)) {
    throw new RunOptionValidationError('pillar', 'Choose functional, performance, robustness, or all.', 'options-fs');
  }
  return deepFreeze({
    browser,
    browserTag,
    engineIds,
    featureIds,
    scenarioIds,
    operations,
    pillar,
    warmup,
    iters,
    timeoutMs,
    reuseData: filter.reuseData ?? filter.reuseSuccessful ?? true,
    randomizeOrder: filter.randomizeOrder ?? true,
    randomSeed,
    exhaustiveMedia,
    mediaMode: exhaustiveMedia ? 'exhaustive' : 'seeded-single',
  });
}

function boundedInteger(value: number, field: 'warmup' | 'iters' | 'timeoutMs'): number {
  const limits = RUN_OPTION_LIMITS[field];
  if (!Number.isSafeInteger(value) || value < limits.min || value > limits.max) {
    const label = field === 'timeoutMs' ? 'Timeout' : field === 'iters' ? 'Iterations' : 'Warmup';
    const errorField = field === 'timeoutMs' ? 'timeout' : field;
    throw new RunOptionValidationError(
      errorField,
      `${label} must be an integer from ${limits.min} to ${limits.max}.`,
      'options-fs',
    );
  }
  return value;
}

function uniqueStrings<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean) as T[])];
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
