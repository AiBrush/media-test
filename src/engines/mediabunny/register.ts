/**
 * src/engines/mediabunny/register.ts — register the reference engine with the suite registry.
 *
 * The reference is mediabunny@1.48.0. `registerMediabunny()` registers it (reference=true by
 * default). The self-test (§16 / BUILD_INSTRUCTIONS) registers a SECOND mediabunny instance under a
 * different id (reference=false) so the runner can compute Mediabunny-vs-Mediabunny Δ≈0; pass an
 * `id` override for that second registration.
 */

import { registerEngine } from '../../core/registry.ts';
import { MediabunnyEngine } from './adapter.ts';

export interface RegisterMediabunnyOptions {
  /** Override the registered engine id. Defaults to 'mediabunny'. */
  id?: string;
  /** Whether this registration is the comparison reference. Defaults to true. */
  reference?: boolean;
}

/**
 * Register the mediabunny reference engine. The engine instance reports its own stable, versioned
 * id ('mediabunny@1.48.0'); the registry KEY (used by run filters) defaults to 'mediabunny' but can
 * be overridden — e.g. registering a second instance under 'mediabunny-self' with reference=false
 * for the Δ≈0 self-test.
 */
export function registerMediabunny(opts?: RegisterMediabunnyOptions): void {
  const id = opts?.id ?? 'mediabunny';
  const reference = opts?.reference ?? true;
  registerEngine(id, () => new MediabunnyEngine(id === 'mediabunny' ? 'mediabunny@1.48.0' : id), {
    reference,
  });
}
