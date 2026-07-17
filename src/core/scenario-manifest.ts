/** The single canonical scenario-family order, label, and lazy-loader manifest. */

export interface ScenarioFamilyManifestEntry<F extends string = ScenarioFamily> {
  family: F;
  label: string;
  order: number;
  load: () => Promise<import('./scenario.ts').Scenario[]>;
}

export const SCENARIO_FAMILY_MANIFEST = [
  { family: 'probe', label: 'Probe', order: 0, load: async () => (await import('../scenarios/probe/index.ts')).probeScenarios },
  { family: 'demux', label: 'Demux', order: 1, load: async () => (await import('../scenarios/demux/index.ts')).demuxScenarios },
  { family: 'remux', label: 'Remux', order: 2, load: async () => (await import('../scenarios/remux/index.ts')).remuxScenarios },
  { family: 'transcode', label: 'Transcode', order: 3, load: async () => (await import('../scenarios/transcode/index.ts')).transcodeScenarios },
  { family: 'decode-seek', label: 'Decode + seek', order: 4, load: async () => (await import('../scenarios/decode-seek/index.ts')).decodeSeekScenarios },
  { family: 'trim', label: 'Trim', order: 5, load: async () => (await import('../scenarios/trim/index.ts')).trimScenarios },
  { family: 'mux', label: 'Mux', order: 6, load: async () => (await import('../scenarios/mux/index.ts')).muxScenarios },
  { family: 'encryption', label: 'Encryption', order: 7, load: async () => (await import('../scenarios/encryption/index.ts')).encryptionScenarios },
  { family: 'metadata', label: 'Metadata', order: 8, load: async () => (await import('../scenarios/metadata/index.ts')).metadataScenarios },
  {
    family: 'streaming-output',
    label: 'Streaming output',
    order: 9,
    load: async () => (await import('../scenarios/streaming-output/index.ts')).streamingOutputScenarios,
  },
  { family: 'audio-dsp', label: 'Audio DSP', order: 10, load: async () => (await import('../scenarios/audio-dsp/index.ts')).audioDspScenarios },
  {
    family: 'robustness',
    label: 'Robustness',
    order: 11,
    load: async () => {
      const module = await import('../scenarios/robustness/index.ts');
      return module.robustnessScenarios;
    },
  },
  { family: 'performance', label: 'Performance', order: 12, load: async () => (await import('../scenarios/performance/index.ts')).performanceScenarios },
] as const satisfies readonly ScenarioFamilyManifestEntry<string>[];

export type ScenarioFamily = (typeof SCENARIO_FAMILY_MANIFEST)[number]['family'];

export const SCENARIO_FAMILY_ORDER: ScenarioFamily[] = SCENARIO_FAMILY_MANIFEST.map(
  (entry) => entry.family,
);

export const SCENARIO_FAMILY_LABELS: Record<ScenarioFamily, string> = Object.fromEntries(
  SCENARIO_FAMILY_MANIFEST.map((entry) => [entry.family, entry.label]),
) as Record<ScenarioFamily, string>;

const FAMILY_ORDER = new Map(SCENARIO_FAMILY_MANIFEST.map((entry) => [entry.family, entry.order]));

export function scenarioManifestOrder(family: ScenarioFamily): number {
  return FAMILY_ORDER.get(family) ?? Number.MAX_SAFE_INTEGER;
}

export function compareCanonicalScenarios(
  a: Pick<import('./scenario.ts').Scenario, 'family' | 'order' | 'id'>,
  b: Pick<import('./scenario.ts').Scenario, 'family' | 'order' | 'id'>,
): number {
  return scenarioManifestOrder(a.family) - scenarioManifestOrder(b.family) ||
    a.order - b.order ||
    a.id.localeCompare(b.id);
}

export interface LoadedScenarioFamily {
  manifest: (typeof SCENARIO_FAMILY_MANIFEST)[number];
  scenarios: import('./scenario.ts').Scenario[];
}

export class ScenarioFamilyLoadError extends Error {
  readonly family: ScenarioFamily;

  constructor(family: ScenarioFamily, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`scenario family '${family}' failed to load: ${detail}`, { cause });
    this.name = 'ScenarioFamilyLoadError';
    this.family = family;
  }
}

/** Load every selected family before exposing any member; completion order cannot affect output. */
export async function loadScenarioFamilies(
  manifest: readonly ScenarioFamilyManifestEntry[] = SCENARIO_FAMILY_MANIFEST,
): Promise<LoadedScenarioFamily[]> {
  const loaded = await Promise.all(manifest.map(async (entry) => {
    try {
      const raw = await entry.load();
      const api = await import('./scenario.ts');
      const scenarios = raw.map((scenario) => {
        try {
          const projection = api.scenarioDefinitionProjection(scenario);
          const diagnostics = api.validateScenarioDefinitionV2(projection);
          if (diagnostics.length > 0) throw new api.ScenarioValidationError(diagnostics);
          if (Object.isFrozen(scenario) && scenario.definitionHash === api.hashScenarioDefinition(projection)) {
            return scenario;
          }
        } catch {
          // Re-enter the canonical definition boundary below for a precise validation diagnostic.
        }
        return api.defineScenario(scenario);
      });
      return { manifest: entry, scenarios };
    } catch (error) {
      throw new ScenarioFamilyLoadError(entry.family, error);
    }
  }));
  return loaded.sort((a, b) => a.manifest.order - b.manifest.order) as LoadedScenarioFamily[];
}

export async function loadCanonicalScenarios(
  manifest: readonly ScenarioFamilyManifestEntry[] = SCENARIO_FAMILY_MANIFEST,
): Promise<import('./scenario.ts').Scenario[]> {
  const families = await loadScenarioFamilies(manifest);
  return families.flatMap((family) => family.scenarios).sort(compareCanonicalScenarios);
}
