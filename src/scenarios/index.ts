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

import { audioDspScenarios } from './audio-dsp/index.ts';
import { decodeSeekScenarios } from './decode-seek/index.ts';
import { demuxScenarios } from './demux/index.ts';
import { encryptionScenarios } from './encryption/index.ts';
import { metadataScenarios } from './metadata/index.ts';
import { muxScenarios } from './mux/index.ts';
import { performanceScenarios } from './performance/index.ts';
import { probeScenarios } from './probe/index.ts';
import { remuxScenarios } from './remux/index.ts';
import { robustnessScenarios } from './robustness/index.ts';
import { streamingOutputScenarios } from './streaming-output/index.ts';
import { transcodeScenarios } from './transcode/index.ts';
import { trimScenarios } from './trim/index.ts';

/** Families in canonical (report) order. */
export const scenariosByFamily: Record<ScenarioFamily, Scenario[]> = {
  probe: probeScenarios,
  demux: demuxScenarios,
  remux: remuxScenarios,
  transcode: transcodeScenarios,
  'decode-seek': decodeSeekScenarios,
  trim: trimScenarios,
  mux: muxScenarios,
  encryption: encryptionScenarios,
  metadata: metadataScenarios,
  'streaming-output': streamingOutputScenarios,
  'audio-dsp': audioDspScenarios,
  robustness: robustnessScenarios,
  performance: performanceScenarios,
};

/** The full battery, flattened in family order. */
export const allScenarios: Scenario[] = Object.values(scenariosByFamily).flat();

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
