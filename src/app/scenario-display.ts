import type { Scenario } from '../core/scenario.ts';
import {
  deriveAudioScenarioSummary,
  type AudioFixtureManifestRecord,
} from '../features/audio-dsp/index.ts';
import type { PickerItem } from './ui.ts';

export interface ScenarioDisplayManifest {
  readonly assets: readonly AudioFixtureManifestRecord[];
  readonly missingEvidence: readonly string[];
}

/**
 * Load the public, digest-bearing fixture manifest used by the current browser run. Failure remains
 * visible evidence in every affected audio summary; stale scenario prose is never used as a fallback.
 */
export async function loadScenarioDisplayManifest(
  fetcher: typeof fetch = globalThis.fetch,
): Promise<ScenarioDisplayManifest> {
  try {
    const response = await fetcher('/fixtures/manifest.json', { cache: 'no-store' });
    if (!response.ok) {
      return { assets: [], missingEvidence: [`manifest:http-${response.status}`] };
    }
    const value = await response.json() as unknown;
    if (!isRecord(value) || !Array.isArray(value.assets)) {
      return { assets: [], missingEvidence: ['manifest:schema-invalid'] };
    }
    return {
      assets: value.assets.filter(isAudioFixtureManifestRecord),
      missingEvidence: [],
    };
  } catch (error) {
    return {
      assets: [],
      missingEvidence: [`manifest:load-error:${errorName(error)}`],
    };
  }
}

/** Build picker facts from executable definitions and the fixture manifest, never from stale notes. */
export function buildScenarioPickerItems(
  scenarios: readonly Scenario[],
  manifest: ScenarioDisplayManifest,
): PickerItem[] {
  return scenarios.map((scenario) => ({
    id: scenario.id,
    label: scenario.id,
    title: scenario.family === 'audio-dsp'
      ? deriveAudioScenarioSummary(scenario, manifest.assets, manifest.missingEvidence).text
      : scenario.notes,
  }));
}

function isAudioFixtureManifestRecord(value: unknown): value is AudioFixtureManifestRecord {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.length === 0) return false;
  if (value.sha256 !== undefined && value.sha256 !== null && typeof value.sha256 !== 'string') return false;
  if (value.sizeBytes !== undefined && value.sizeBytes !== null && typeof value.sizeBytes !== 'number') return false;
  if (value.container !== undefined && typeof value.container !== 'string') return false;
  if (value.codecs !== undefined && (!Array.isArray(value.codecs) || !value.codecs.every((entry) => typeof entry === 'string'))) {
    return false;
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function errorName(error: unknown): string {
  return error instanceof Error && error.name ? error.name : 'unknown';
}
