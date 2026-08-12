/**
 * src/core/registry.ts — engine + scenario registration.
 *
 * Engines register a FACTORY (not an instance) so the runner can build a fresh engine per
 * Worker/iteration (clean memory, §10.2). Scenarios register as immutable Scenario objects.
 *
 * SCORED vs INSTRUMENT engines: most engines COMPETE in the matrix (scored/ranked). An engine
 * registered `instrumentOnly` (e.g. 'platform' — the raw WebCodecs decoder that backs the frame-golden
 * baker and the in-browser decode oracles) stays resolvable via getEngine() but is EXCLUDED from the
 * scored set (listScoredEngines) so it never grades its own output. There is deliberately NO
 * "reference engine": oracles compare against pre-baked golden data (ffprobe) and self-contained byte
 * parsers, never a live candidate — no candidate is ever another candidate's (or its own) judge.
 */

import type { EngineFactory } from './engine.ts';
import {
  assertValidScenarioDefinition,
  hashScenarioDefinition,
  scenarioDefinitionProjection,
} from './scenario.ts';
import type { Scenario } from './scenario.ts';
import { compareCanonicalScenarios } from './scenario-manifest.ts';

export interface RegisteredEngine {
  id: string;
  /**
   * Stable identity stamped on result rows. Registration ids may be short CLI/UI aliases, but a
   * pre-content outcome still belongs to the same versioned cohort as an executed cell.
   */
  resultId?: string;
  factory: EngineFactory;
  /**
   * Instrument-only engines back oracle helpers / golden baking (e.g. the WebCodecs 'platform'
   * decoder) but do NOT compete: excluded from listScoredEngines() so they are never scored/ranked
   * and never appear as a matrix column. Still resolvable via getEngine() for their instrument role.
   */
  instrumentOnly?: boolean;
}

const engines = new Map<string, RegisteredEngine>();
const scenarios = new Map<string, Scenario>();

export function registerEngine(
  id: string,
  factory: EngineFactory,
  opts?: { instrumentOnly?: boolean; resultId?: string },
): void {
  if (engines.has(id)) {
    throw new Error(`Engine id already registered: ${id}`);
  }
  if (opts?.resultId !== undefined && opts.resultId.trim().length === 0) {
    throw new Error(`Engine result id must not be empty: ${id}`);
  }
  engines.set(id, {
    id,
    factory,
    instrumentOnly: opts?.instrumentOnly ?? false,
    ...(opts?.resultId ? { resultId: opts.resultId } : {}),
  });
}

export function registerScenario(scenario: Scenario): void {
  registerScenarios([scenario]);
}

/**
 * Validate and sort a complete staged batch before replacing registry state. A duplicate/invalid
 * member cannot leak a partial family into the live Map, and retrying the corrected batch is safe.
 */
export function registerScenarios(list: readonly Scenario[]): void {
  const incoming = new Map<string, Scenario>();
  for (const candidate of list) {
    const family = typeof candidate?.family === 'string' ? candidate.family : '<unknown>';
    const member = typeof candidate?.id === 'string' ? candidate.id : '<unknown>';
    try {
      const projection = scenarioDefinitionProjection(candidate);
      assertValidScenarioDefinition(projection);
      const expectedHash = hashScenarioDefinition(projection);
      if (candidate.definitionHash !== expectedHash) {
        throw new Error(
          `definitionHash mismatch (expected ${expectedHash}, got ${String(candidate.definitionHash)})`,
        );
      }
      if (!isDeepFrozen(candidate)) {
        throw new Error('scenario snapshot is not deeply frozen; use defineScenario() before registration');
      }
    } catch (error) {
      throw new ScenarioRegistryCommitError(family, member, error);
    }
    if (incoming.has(candidate.id)) {
      throw new ScenarioRegistryCommitError(
        candidate.family,
        candidate.id,
        new Error(`duplicate scenario id inside staged batch: ${candidate.id}`),
      );
    }
    if (scenarios.has(candidate.id)) {
      throw new ScenarioRegistryCommitError(
        candidate.family,
        candidate.id,
        new Error(`scenario id already registered: ${candidate.id}`),
      );
    }
    incoming.set(candidate.id, candidate);
  }

  const ordered = [...scenarios.values(), ...incoming.values()].sort(compareCanonicalScenarios);
  const staged = new Map(ordered.map((scenario) => [scenario.id, scenario]));
  scenarios.clear();
  for (const [id, scenario] of staged) scenarios.set(id, scenario);
}

export class ScenarioRegistryCommitError extends Error {
  readonly family: string;
  readonly member: string;

  constructor(family: string, member: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`scenario registry commit failed at family '${family}', member '${member}': ${detail}`, {
      cause,
    });
    this.name = 'ScenarioRegistryCommitError';
    this.family = family;
    this.member = member;
  }
}

export function getEngine(id: string): RegisteredEngine | undefined {
  return engines.get(id);
}

/** ALL registered engines, including instrument-only ones (used by getEngine callers / true counts). */
export function listEngines(): RegisteredEngine[] {
  return [...engines.values()];
}

/**
 * Engines that COMPETE in the matrix (scored / ranked / columned). Excludes instrument-only engines
 * (e.g. 'platform'); those remain resolvable via getEngine() for the golden-baker + decode oracles but
 * must never be scored against the candidates they help judge. This is the default run set.
 */
export function listScoredEngines(): RegisteredEngine[] {
  return [...engines.values()].filter((e) => !e.instrumentOnly);
}

export function getScenario(id: string): Scenario | undefined {
  return scenarios.get(id);
}

export function listScenarios(): Scenario[] {
  return [...scenarios.values()];
}

/** Test-only: clear the registries (used by the self-test harness and unit tests). */
export function __resetRegistry(): void {
  engines.clear();
  scenarios.clear();
}

function isDeepFrozen(value: unknown, seen = new Set<object>()): boolean {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null || seen.has(value)) {
    return true;
  }
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Object.values(value as Record<string, unknown>).every((entry) => isDeepFrozen(entry, seen));
}
