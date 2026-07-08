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
import type { Scenario } from './scenario.ts';

export interface RegisteredEngine {
  id: string;
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
  opts?: { instrumentOnly?: boolean },
): void {
  if (engines.has(id)) {
    throw new Error(`Engine id already registered: ${id}`);
  }
  engines.set(id, { id, factory, instrumentOnly: opts?.instrumentOnly ?? false });
}

export function registerScenario(scenario: Scenario): void {
  if (scenarios.has(scenario.id)) {
    throw new Error(`Scenario id already registered: ${scenario.id}`);
  }
  scenarios.set(scenario.id, scenario);
}

export function registerScenarios(list: Scenario[]): void {
  for (const s of list) registerScenario(s);
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
