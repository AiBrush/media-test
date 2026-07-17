import { compareCanonicalScenarios } from './scenario-manifest.ts';
import type { Scenario } from './scenario.ts';

export const SCENARIO_EXPANSION_SNAPSHOT_SCHEMA = 'media-test/scenario-expansion@1' as const;

export interface ScenarioExpansionSnapshotEntry {
  id: string;
  revision: number;
  definitionHash: string;
  inputVariantIds: string[];
  renditionIds: string[];
}

export interface ScenarioExpansionSnapshot {
  schema: typeof SCENARIO_EXPANSION_SNAPSHOT_SCHEMA;
  scenarios: ScenarioExpansionSnapshotEntry[];
}

export function buildScenarioExpansionSnapshot(
  scenarios: readonly Scenario[],
): ScenarioExpansionSnapshot {
  const ordered = [...scenarios].sort(compareCanonicalScenarios);
  const ids = new Set<string>();
  const scenariosSnapshot = ordered.map((scenario) => {
    if (ids.has(scenario.id)) throw new Error(`duplicate scenario expansion id: ${scenario.id}`);
    ids.add(scenario.id);
    assertUnique(scenario.inputVariantIds, `${scenario.id}.inputVariantIds`);
    assertUnique(scenario.renditionIds, `${scenario.id}.renditionIds`);
    return Object.freeze({
      id: scenario.id,
      revision: scenario.revision,
      definitionHash: scenario.definitionHash,
      inputVariantIds: Object.freeze([...scenario.inputVariantIds]) as unknown as string[],
      renditionIds: Object.freeze([...scenario.renditionIds]) as unknown as string[],
    });
  });
  return Object.freeze({
    schema: SCENARIO_EXPANSION_SNAPSHOT_SCHEMA,
    scenarios: Object.freeze(scenariosSnapshot) as unknown as ScenarioExpansionSnapshotEntry[],
  });
}

/** Stable checked-file representation; source import order cannot affect these bytes. */
export function serializeScenarioExpansionSnapshot(snapshot: ScenarioExpansionSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

export function compareScenarioExpansionSnapshot(
  expected: ScenarioExpansionSnapshot,
  scenarios: readonly Scenario[],
): { matches: true } | { matches: false; expected: string; actual: string } {
  const expectedText = serializeScenarioExpansionSnapshot(expected);
  const actualText = serializeScenarioExpansionSnapshot(buildScenarioExpansionSnapshot(scenarios));
  return expectedText === actualText
    ? { matches: true }
    : { matches: false, expected: expectedText, actual: actualText };
}

function assertUnique(values: readonly string[], path: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`duplicate expansion identity at ${path}: ${value}`);
    seen.add(value);
  }
}
