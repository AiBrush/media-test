/**
 * src/scenarios/remux/_shared.ts — shared types + builders for the remux family.
 *
 * Split out of index.ts so the matrix-completion, audio, size-ladder, metamorphic and negative
 * sub-batteries can each live in their own file while emitting IDENTICAL scenario shapes. The family
 * stays a single exported `remuxScenarios` array (index.ts concatenates them); nothing here is
 * registered on its own.
 *
 * ORACLE TRUTH (why a given case carries the oracles it does — see src/core/{oracles,runner}.ts):
 *
 *  - For an `op:'remux'` scenario the runner ONLY runs `engine.remux(...)` and exposes the result as
 *    `ctx.output` (executeOp → `{ output }`). It does NOT probe/demux the output into `ctx.metadata`
 *    or `ctx.demux`. Therefore:
 *      • `golden-metadata`  reads `ctx.metadata` → ALWAYS "no probe metadata on ctx.metadata" for a
 *                           remux op. It is NOT a valid remux gate and is never attached here.
 *      • `golden-packets`   reads `ctx.demux` → same problem; never attached.
 *    The only oracles that actually OBSERVE a remux output are the four below.
 *
 *  - `decoded-frames-bitexact` is intentionally NOT part of the default remux battery while the
 *    source frame goldens are still browser-bake placeholders. Dedicated property rows attach frame
 *    invariants where the source golden is ready; default remux rows use the structural gate below.
 *
 *  - `reference-reimport` re-imports `ctx.output` with the reference engine and diffs the packet
 *    table (count within 2%, keyframe count) vs golden packets. Works for video AND audio. It is the
 *    structural-integrity gate (the output is a real, parseable container the reference can read).
 *
 *  - `playback-smoke` plays `ctx.output` in a `<video>` element. It is not a universal remux gate
 *    (raw TS/ADTS/audio-only outputs are not reliable `<video>` targets), so default remux rows do
 *    not attach it. Scenario-specific rows may opt in with an explicit oracle override.
 *
 *  - `property-invariant` computes a metamorphic invariant in-browser from `ctx.output` (+ the
 *    reference engine for the probe-duration variant, + golden frames for the decode variant). This
 *    is the only oracle that gates audio remux on a SAMPLE-derived property (duration materialized
 *    from the re-wrapped stream) rather than just structural re-import.
 */

import type { OracleId, Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';

/** Metrics every bytes-producing remux case reports (perf is secondary to correctness here). */
export const REMUX_OUT_METRICS = [
  'wall',
  'throughputRealtime',
  'peakMemory',
  'sourceReads',
  'targetWrites',
  'longtasks',
] as const;

export interface RemuxCase {
  /** source asset id (must exist in fixtures/manifest.json) */
  asset: string;
  /** source container token (canonical) */
  from: string;
  /** target container token (canonical) */
  to: string;
  videoCodecs?: string[];
  audioCodecs?: string[];
  features?: string[];
  /**
   * Override the default oracle set. Defaults:
   *   - every case: reference-reimport. It confirms the output is parseable and preserves media track
   *     semantics without requiring packet counts to survive container repacketization exactly.
   */
  oracles?: OracleId[];
  /** hard wall-clock cap (ms); used to bound very large size-ladder remuxes. */
  timeoutMs?: number;
  notes?: string;
}

/** Stable id for a (source asset, target container) remux cell — matches the legacy index.ts scheme. */
export function remuxId(c: Pick<RemuxCase, 'asset' | 'from' | 'to'>): string {
  return `remux/${c.asset.replace(/\.[^.]+$/, '')}_${c.from}_to_${c.to}`;
}

/** Default oracle set for a remux cell: structural re-import gate; stricter rows opt in explicitly. */
function defaultOracles(c: RemuxCase): OracleId[] {
  void c;
  return ['reference-reimport'];
}

/** Build a single lossless-remux Scenario from a RemuxCase. */
export function buildRemux(c: RemuxCase): Scenario {
  return defineScenario({
    id: remuxId(c),
    op: 'remux',
    input: c.asset,
    options: { container: c.to },
    requires: {
      operations: ['remux'],
      containersIn: [c.from],
      containersOut: [c.to],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
      ...(c.features ? { features: c.features } : {}),
    },
    oracles: c.oracles ?? defaultOracles(c),
    metrics: [...REMUX_OUT_METRICS],
    ...(c.timeoutMs ? { timeoutMs: c.timeoutMs } : {}),
    ...(c.notes ? { notes: c.notes } : {}),
  });
}

export function buildRemuxAll(cases: RemuxCase[]): Scenario[] {
  return cases.map(buildRemux);
}

// ── Metamorphic / property-invariant remux cases ────────────────────────────────────────────────

export interface RemuxPropertyCase {
  /** unique id suffix (namespaced under remux/) */
  id: string;
  /** the invariant token the property-invariant oracle interprets (passed via options.invariant) */
  invariant: string;
  input: string | string[];
  from: string;
  to: string;
  videoCodecs?: string[];
  audioCodecs?: string[];
  features?: string[];
  /** extra option keys merged into options (e.g. round-trip via container, second remux target) */
  extraOptions?: Record<string, unknown>;
  oracles?: OracleId[];
  timeoutMs?: number;
  notes?: string;
}

/**
 * Build a metamorphic remux Scenario. The op is still `remux` (so the runner produces `ctx.output`),
 * and `options.invariant` selects the in-browser property the `property-invariant` oracle checks:
 *   - 'decode(remux(x))==decode(x)'   → output frame digests must equal golden source-decode digests
 *   - 'probe(remux(x)).dur≈probe(x).dur' → reference-probed output duration ≈ golden duration
 *   - round-trip variants reuse 'decode(remux(x))==decode(x)' (the runner re-wraps per extraOptions).
 */
export function buildRemuxProperty(c: RemuxPropertyCase): Scenario {
  return defineScenario({
    id: `remux/${c.id}`,
    op: 'remux',
    input: c.input,
    options: { container: c.to, invariant: c.invariant, ...(c.extraOptions ?? {}) },
    requires: {
      operations: ['remux'],
      containersIn: [c.from],
      containersOut: [c.to],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
      ...(c.features ? { features: c.features } : {}),
    },
    oracles: c.oracles ?? ['property-invariant'],
    metrics: ['wall', 'peakMemory', 'longtasks'],
    ...(c.timeoutMs ? { timeoutMs: c.timeoutMs } : {}),
    ...(c.notes ? { notes: c.notes } : {}),
  });
}

export function buildRemuxPropertyAll(cases: RemuxPropertyCase[]): Scenario[] {
  return cases.map(buildRemuxProperty);
}
