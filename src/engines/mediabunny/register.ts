/**
 * src/engines/mediabunny/register.ts — register the mediabunny engine with the suite registry.
 *
 * mediabunny@1.48.0 is a plain scored candidate (there is no reference engine). `registerMediabunny()`
 * registers it under the 'mediabunny' key. The self-test (§16 / BUILD_INSTRUCTIONS) registers a SECOND
 * mediabunny instance under a different id so the runner can compute Mediabunny-vs-Mediabunny Δ≈0; pass
 * an `id` override for that second registration.
 */

import { registerEngine } from '../../core/registry.ts';
import { MediabunnyEngine } from './adapter.ts';

export interface RegisterMediabunnyOptions {
  /** Override the registered engine id. Defaults to 'mediabunny'. */
  id?: string;
}

/**
 * Register the mediabunny engine. The engine instance reports its own stable, versioned id
 * ('mediabunny@1.48.0'); the registry KEY (used by run filters) defaults to 'mediabunny' but can be
 * overridden — e.g. registering a second instance under 'mediabunny-self' for the Δ≈0 self-test.
 */
export function registerMediabunny(opts?: RegisterMediabunnyOptions): void {
  const id = opts?.id ?? 'mediabunny';
  const resultId = id === 'mediabunny' ? 'mediabunny@1.48.0' : id;
  registerEngine(id, () => new MediabunnyEngine(resultId), { resultId });
}
