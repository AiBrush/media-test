/**
 * src/core/registry.ts — engine + scenario registration.
 *
 * Engines register a FACTORY (not an instance) so the runner can build a fresh engine per
 * Worker/iteration (clean memory, §10.2). Scenarios register as immutable Scenario objects.
 * The reference engine id is pinned here (default mediabunny); Δ-vs-reference is computed against it.
 */

import type { EngineFactory } from './engine.ts';
import type { Scenario } from './scenario.ts';

export interface RegisteredEngine {
  id: string;
  factory: EngineFactory;
  /** if true, this is the comparison reference (Δ baseline). Exactly one should be the reference. */
  reference?: boolean;
}

const engines = new Map<string, RegisteredEngine>();
const scenarios = new Map<string, Scenario>();

/** Default reference engine id; overridable via setReferenceEngine(). */
let referenceEngineId = 'mediabunny';

export function registerEngine(id: string, factory: EngineFactory, opts?: { reference?: boolean }): void {
  if (engines.has(id)) {
    throw new Error(`Engine id already registered: ${id}`);
  }
  engines.set(id, { id, factory, reference: opts?.reference ?? false });
  if (opts?.reference) referenceEngineId = id;
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

export function listEngines(): RegisteredEngine[] {
  return [...engines.values()];
}

export function getScenario(id: string): Scenario | undefined {
  return scenarios.get(id);
}

export function listScenarios(): Scenario[] {
  return [...scenarios.values()];
}

export function setReferenceEngine(id: string): void {
  if (!engines.has(id)) throw new Error(`Cannot set unknown engine as reference: ${id}`);
  referenceEngineId = id;
}

export function getReferenceEngineId(): string {
  return referenceEngineId;
}

/** Test-only: clear the registries (used by the self-test harness and unit tests). */
export function __resetRegistry(): void {
  engines.clear();
  scenarios.clear();
  referenceEngineId = 'mediabunny';
}
