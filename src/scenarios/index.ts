/**
 * src/scenarios/index.ts — the full engine-independent scenario battery.
 *
 * Imports every family's Scenario[] and exposes:
 *  - `allScenarios`: the flattened, de-duplicated list across all 12 families.
 *  - `scenariosByFamily`: grouped for the report / UI.
 *  - `registerAllScenarios()`: registers the whole battery into the shared registry (registry.ts),
 *    which is what the runner enumerates.
 *
 * Scenarios are pure declarations — no engine references, no measurement, no DOM. The same battery
 * runs against every registered engine × browser; capability negotiation (runner.ts) decides
 * PASS/FAIL vs NA per cell.
 */

import { registerScenarios } from '../core/registry.ts';
import type { Scenario, ScenarioFamily } from '../core/scenario.ts';
import {
  compareCanonicalScenarios,
  loadScenarioFamilies,
} from '../core/scenario-manifest.ts';

const loadedFamilies = await loadScenarioFamilies();

/** Families in the one canonical manifest order, regardless of module completion order. */
export const scenariosByFamily: Record<ScenarioFamily, Scenario[]> = Object.fromEntries(
  loadedFamilies.map(({ manifest, scenarios }) => [
    manifest.family,
    [...scenarios].sort(compareCanonicalScenarios),
  ]),
) as Record<ScenarioFamily, Scenario[]>;

/** The full battery, flattened in family order. */
export const allScenarios: Scenario[] = loadedFamilies
  .flatMap(({ scenarios }) => scenarios)
  .sort(compareCanonicalScenarios);

/**
 * Guard against accidental duplicate ids across families (registry.registerScenario throws on a
 * dupe, but this surfaces the collision at import time with the offending id rather than a generic
 * "already registered" at registration).
 */
function assertUniqueIds(list: Scenario[]): void {
  const seen = new Set<string>();
  for (const s of list) {
    if (seen.has(s.id)) {
      throw new Error(`Duplicate scenario id across families: ${s.id}`);
    }
    seen.add(s.id);
  }
}

assertUniqueIds(allScenarios);

/** Register the entire battery into the shared registry. Idempotency is the registry's concern. */
export function registerAllScenarios(): void {
  registerScenarios(allScenarios);
}

export default allScenarios;
