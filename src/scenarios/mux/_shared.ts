/**
 * src/scenarios/mux/_shared.ts — shared types + builders for the "mux" family.
 *
 * Split out of index.ts (mirroring src/scenarios/remux/_shared.ts) so the write-target, multi-source,
 * codec-edge, size-ladder, output-mode, metamorphic and negative sub-batteries each live in their own
 * file while emitting IDENTICAL scenario shapes. The family stays a single exported `muxScenarios`
 * array (index.ts concatenates the sub-files); nothing here is registered on its own.
 *
 * WHAT "mux" IS (vs remux). The engine's `mux(tracks, {container})` PACKS already-encoded EncodedTracks
 * into a container — the coded samples are COPIED verbatim, only the container/sample-table/index is
 * authored. The runner obtains the EncodedTracks by demuxing the named `input` asset(s) via the same
 * engine, then calls `mux()` (runner.ts executeOp case 'mux'). So a mux scenario names a SOURCE asset
 * (or a list, to assemble tracks from >1 source) exactly like the legacy 7 cases, and forwards the
 * target container + any write-shape knobs in `options`. We never synthesize EncodedTracks at
 * definition time — they only exist after a runtime demux of the corpus.
 *
 * ORACLE TRUTH (why each case carries the oracles it does — verified against src/core/{oracles,runner}.ts):
 *
 *  - For an `op:'mux'` scenario the runner ONLY runs `engine.mux(...)` and exposes the result as
 *    `ctx.output` (executeOp → `{ output }`). It does NOT probe/demux the output into `ctx.metadata`
 *    or `ctx.demux`. Therefore, EXACTLY like the remux family:
 *      • `golden-metadata` reads `ctx.metadata` → ALWAYS "no probe metadata on ctx.metadata" for a mux
 *        op. NOT a valid mux gate; never attached.
 *      • `golden-packets`  reads `ctx.demux` → same; never attached.
 *    The only oracles that actually OBSERVE a mux output are the four below.
 *
 *  - `reference-reimport` (oracles.ts referenceReimport): the mux branch uses neutral readers for the
 *    requested target, semantic track identity/timeline evidence, and three-way verdicts. It is attached
 *    to every non-negative mux row. Legal Annex-B/AVCC, lacing, page, interleave, or timebase changes may
 *    be DIFF; missing/malformed/mistimed media is FAIL. It never compares a cross-container output to a
 *    source-keyed packet serialization.
 *
 *  - `playback-smoke` (oracles.ts playbackSmoke): plays `ctx.output` in a plain `<video>`. The raw
 *    Brave run showed this is not a reliable mux-family structural gate: outputs that reference-reimport
 *    and duration-probe correctly still failed to advance in `<video>` after being authored by mux().
 *    Audio-only outputs also fail the "advance a video element" premise outright. We therefore do NOT
 *    attach playback-smoke by default for mux cases. Browser-playback coverage belongs to targeted
 *    scenarios with a playback oracle designed for the output shape; mux conformance is gated here by
 *    semantic reference re-import and by probe-duration everywhere.
 *
 *  - `property-invariant` (oracles.ts propertyInvariant; `options.invariant` selects the branch):
 *      • PROBE_DUR ('probe…dur') reference-probes the output duration and compares to
 *        `ctx.golden.meta.durationSec`. Duration is INVARIANT across the container change, so this is
 *        the SAFE cross-container / audio gate that does NOT suffer the packet-count reframing problem.
 *        This is the canonical "demux(mux(x)) ≈ x" / "probe(mux(x)).dur ≈ probe(x).dur" check the
 *        dossier asks for, expressed through the already-implemented oracle.
 *      • DECODE_MUX ('decode…') decodes `ctx.output` and compares frame digests to `ctx.golden.frames`
 *        (= the offline decode of x). VIDEO-ONLY; needs a baked `<asset>.frames.json`. The source
 *        frame goldens are `$todo` placeholders today, so these cases resolve to a clean "no golden
 *        frames" FAIL until the bake fills them — the SAME honest posture the remux metamorphic file
 *        already takes (wired now so the cell lines up the moment frames are baked). decode(mux(x)) must
 *        equal decode(x) because mux copies coded samples; this is the strongest mux video gate.
 *
 *  - `graceful-failure` (oracles.ts gracefulFailure): negative mux cases point at concrete malformed
 *    fixture files. The runner routes those cases through the robustness path via the oracle and the
 *    engine must reject CLEANLY within the timeout, or safely return partial output only when the
 *    case explicitly allows it.
 */

import type { MetricId, OracleId, Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';

// ── Canonical invariant tokens (substring-matched by oracles.ts propertyInvariant) ───────────────

/** decode(mux(x)) == decode(x): packed coded samples must decode to identical pixels (VIDEO-only). */
export const DECODE_MUX = 'decode(mux(x))==decode(x)';
/** probe(mux(x)).dur ≈ probe(x).dur: duration survives the container change (VIDEO+AUDIO, x-container). */
export const PROBE_DUR = 'probe(mux(x)).dur≈probe(x).dur';
const MUX_BROWSER_DECODE_FEATURE = 'mux:browser-decode-equality';
const MUX_TARGET_WRITE_FEATURE = 'target:writes';

// ── Metric sets ──────────────────────────────────────────────────────────────────────────────────

/** Metrics every bytes-producing mux case reports (perf is secondary to correctness here). */
export const MUX_METRICS = [
  'wall',
  'throughputRealtime',
  'peakMemory',
  'targetWrites',
  'longtasks',
] as const;

/** Output-shape (streaming/fragmented/fastStart) mux cases also count target writes + bytes out. */
export const MUX_STREAM_METRICS = [
  'wall',
  'throughputRealtime',
  'peakMemory',
  'targetWrites',
  'bytesOut',
  'longtasks',
] as const;

function mp4LayoutOracleApplies(container: string, options?: Record<string, unknown>): boolean {
  const target = container.trim().toLowerCase();
  const isIsoBmff = target === 'mp4' || target === 'mov';
  return (
    isIsoBmff &&
    (options?.fragmented === true || options?.fastStart === false || typeof options?.fastStart === 'string')
  );
}

function withMp4LayoutOracle(oracles: OracleId[], container: string, options?: Record<string, unknown>): OracleId[] {
  if (!mp4LayoutOracleApplies(container, options) || oracles.includes('mp4-box-layout')) return oracles;
  return [...oracles, 'mp4-box-layout'];
}

function muxFeatures(c: Pick<MuxCase, 'features' | 'extraOptions'>): string[] | undefined {
  const features = [...(c.features ?? [])];
  const opts = c.extraOptions ?? {};
  if (opts.target === 'stream' || opts.writeChunkBytes !== undefined) pushUnique(features, MUX_TARGET_WRITE_FEATURE);
  if (opts.fragmented === true) pushUnique(features, 'fragmented');
  if (opts.fastStart === false) pushUnique(features, 'fastStart:none');
  if (opts.fastStart === 'in-memory') pushUnique(features, 'fastStart:in-memory');
  if (opts.fastStart === 'reserve') pushUnique(features, 'fastStart:reserve');
  return features.length ? features : undefined;
}

function pushUnique(list: string[], value: string): void {
  if (!list.includes(value)) list.push(value);
}

// ── Mux case model + builder ─────────────────────────────────────────────────────────────────────

export interface MuxCase {
  /** stable id suffix (namespaced under mux/) */
  id: string;
  /** source asset(s) the runner demuxes to obtain EncodedTracks (must exist in fixtures/manifest.json) */
  input: string | string[];
  /** source container(s) — for negotiation */
  containersIn: string[];
  /** target container to mux into */
  to: string;
  videoCodecs?: string[];
  audioCodecs?: string[];
  /** extra features the write mode needs (e.g. 'fragmented','fastStart:reserve') — gated in negotiation */
  features?: string[];
  /** extra option keys merged into options (e.g. fastStart, fragmented, target, writeChunkBytes) */
  extraOptions?: Record<string, unknown>;
  /** override metrics (default MUX_METRICS) */
  metrics?: readonly MetricId[];
  /** override the per-case ranking metric (§9) — set on perf-axis cases */
  primaryMetric?: MetricId;
  /** Per-case oracle tolerances, e.g. cross-source mux duration rounding. */
  tolerances?: Scenario['tolerances'];
  /**
   * Override the default oracle set. Every ordinary row defaults to neutral semantic re-import plus
   * property-invariant:probe-duration; output-mode rows add their structural layout oracle.
   */
  oracles?: OracleId[];
  /** hard wall-clock cap (ms); bounds large/long size-ladder muxes. */
  timeoutMs?: number;
  notes?: string;
}

/**
 * Default oracle set for a mux cell. Neutral semantic re-import is decisive for every advertised
 * target and probe-duration remains an independent container-agnostic invariant.
 */
function defaultOracles(): OracleId[] {
  return ['reference-reimport', 'property-invariant'];
}

/** The single source of truth for the options object: container + invariant + any write-shape knobs. */
function muxOptions(c: MuxCase): Record<string, unknown> {
  // probe-duration is the default property-invariant; an explicit invariant in extraOptions wins.
  return { container: c.to, invariant: PROBE_DUR, ...(c.extraOptions ?? {}) };
}

/** Build a single mux Scenario from a MuxCase. */
export function buildMux(c: MuxCase): Scenario {
  const oracles = withMp4LayoutOracle(c.oracles ?? defaultOracles(), c.to, c.extraOptions);
  const metrics = (c.metrics ?? MUX_METRICS) as readonly MetricId[];
  const features = muxFeatures(c);
  return defineScenario({
    id: `mux/${c.id}`,
    op: 'mux',
    input: c.input,
    options: muxOptions(c),
    requires: {
      // mux needs demux (to get the tracks) + mux (to pack them).
      operations: ['demux', 'mux'],
      containersIn: c.containersIn,
      containersOut: [c.to],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
      ...(features ? { features } : {}),
    },
    oracles,
    metrics: [...metrics],
    ...(c.primaryMetric ? { primaryMetric: c.primaryMetric } : {}),
    ...(c.tolerances ? { tolerances: c.tolerances } : {}),
    ...(c.timeoutMs ? { timeoutMs: c.timeoutMs } : {}),
    ...(c.notes ? { notes: c.notes } : {}),
  });
}

export function buildMuxAll(cases: MuxCase[]): Scenario[] {
  return cases.map(buildMux);
}

// ── Metamorphic / property-invariant mux builder ─────────────────────────────────────────────────

export interface MuxPropertyCase {
  id: string;
  /** the invariant token the property-invariant oracle interprets (DECODE_MUX | PROBE_DUR) */
  invariant: string;
  input: string | string[];
  containersIn: string[];
  to: string;
  videoCodecs?: string[];
  audioCodecs?: string[];
  features?: string[];
  extraOptions?: Record<string, unknown>;
  /** default: semantic reference-reimport + the requested property invariant */
  oracles?: OracleId[];
  tolerances?: Scenario['tolerances'];
  timeoutMs?: number;
  notes?: string;
}

/**
 * Build a metamorphic mux Scenario. The op is `mux` (runner produces `ctx.output`), and
 * `options.invariant` selects the in-browser property the `property-invariant` oracle checks:
 *   - DECODE_MUX  → output frame digests must equal golden source-decode digests (VIDEO; needs frames).
 *   - PROBE_DUR   → reference-probed output duration ≈ golden source duration (VIDEO+AUDIO).
 */
export function buildMuxProperty(c: MuxPropertyCase): Scenario {
  const requestedOracles = c.oracles ?? ['property-invariant'];
  const semanticOracles = requestedOracles.includes('reference-reimport')
    ? requestedOracles
    : [...requestedOracles, 'reference-reimport' as const];
  const oracles = withMp4LayoutOracle(semanticOracles, c.to, c.extraOptions);
  const features = [...(c.features ?? [])];
  if (c.invariant === DECODE_MUX && !features.includes(MUX_BROWSER_DECODE_FEATURE)) {
    features.push(MUX_BROWSER_DECODE_FEATURE);
  }
  return defineScenario({
    id: `mux/${c.id}`,
    op: 'mux',
    input: c.input,
    options: { container: c.to, invariant: c.invariant, ...(c.extraOptions ?? {}) },
    requires: {
      operations: ['demux', 'mux'],
      containersIn: c.containersIn,
      containersOut: [c.to],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
      ...(features.length ? { features } : {}),
    },
    oracles,
    metrics: ['wall', 'peakMemory', 'longtasks'],
    ...(c.tolerances ? { tolerances: c.tolerances } : {}),
    ...(c.timeoutMs ? { timeoutMs: c.timeoutMs } : {}),
    ...(c.notes ? { notes: c.notes } : {}),
  });
}

export function buildMuxPropertyAll(cases: MuxPropertyCase[]): Scenario[] {
  return cases.map(buildMuxProperty);
}

// ── Negative / graceful-failure mux builder ──────────────────────────────────────────────────────

export interface MuxNegativeCase {
  id: string;
  /** source asset whose demuxed tracks feed the muxer */
  input: string | string[];
  containersIn: string[];
  /** target container (often an ILLEGAL one for the source codec — must be rejected) */
  to: string;
  videoCodecs?: string[];
  audioCodecs?: string[];
  features?: string[];
  extraOptions?: Record<string, unknown>;
  timeoutMs?: number;
  notes: string;
}

export function buildMuxNegative(c: MuxNegativeCase): Scenario {
  return defineScenario({
    id: `mux/${c.id}`,
    op: 'mux',
    input: c.input,
    options: { container: c.to, ...(c.extraOptions ?? {}) },
    requires: {
      operations: ['demux', 'mux'],
      containersIn: c.containersIn,
      containersOut: [c.to],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
      ...(c.features ? { features: c.features } : {}),
    },
    oracles: ['graceful-failure'],
    metrics: ['wall', 'peakMemory'],
    ...(c.timeoutMs ? { timeoutMs: c.timeoutMs } : {}),
    notes: c.notes,
  });
}

export function buildMuxNegativeAll(cases: MuxNegativeCase[]): Scenario[] {
  return cases.map(buildMuxNegative);
}
