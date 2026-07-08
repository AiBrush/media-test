/**
 * src/core/seeded-rng.ts — the ONE deterministic RNG primitive shared by the runner's execution-order
 * shuffle and the per-scenario media-file selection (scenario-media-test-update-instructions §6.2/§10).
 *
 * Extracted verbatim from runner.ts so both callers draw from the identical stream: given the same
 * seed string a run is replayable byte-for-byte (`(runSeed, corpus)` reproducibility). Do not "improve"
 * these — their exact arithmetic is the reproducibility contract.
 */

/** FNV-1a over the seed string → 32-bit unsigned. Empty seed falls back to a per-call random value. */
export function hashSeed(seed: string): number {
  const text = seed || `${Date.now()}:${Math.random()}`;
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 PRNG: seed (uint32) → deterministic () => float in [0,1). */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
