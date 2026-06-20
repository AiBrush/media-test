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
 *  - `reference-reimport` (oracles.ts referenceReimport): re-imports `ctx.output` with the reference
 *    engine and diffs the packet table vs `ctx.golden.packets`. CRITICAL CAVEAT for mux: golden is
 *    keyed on the SOURCE asset id (runner loadGolden(primaryInput.id)). For a SAME-container or
 *    same-NAL-framing target (mp4↔mov, the source's own container) the source packet count/keyframe
 *    count is a faithful reference. For a CROSS-CONTAINER target that legitimately reframes the
 *    bitstream (MP4→TS Annex-B/PES, →MKV SimpleBlock lacing, ctts regeneration) the COUNT and even the
 *    keyframe COUNT can shift, so the `withinRel(...,0.02,1)` count gate + EXACT keyframe-count gate can
 *    FALSE-FAIL a correct mux. We therefore attach `reference-reimport` ONLY where the source golden is
 *    a faithful packet reference for the target (no reframing): mp4/mov targets of an mp4/mov source,
 *    and same-container identity-ish writes. For reframing targets we rely on
 *    `property-invariant:probe-duration` (container-agnostic) instead of a packet-count gate keyed on a
 *    mismatched golden. This is the explicit fix for the dossier's "golden keyed on source, mismatched
 *    to a cross-container mux target" oracle gap — we do not let a count gate keyed on the wrong
 *    reference either FALSE-FAIL a correct engine or (worse) mask a real bug.
 *
 *  - `playback-smoke` (oracles.ts playbackSmoke): plays `ctx.output` in a plain `<video>`. The raw
 *    Brave run showed this is not a reliable mux-family structural gate: outputs that reference-reimport
 *    and duration-probe correctly still failed to advance in `<video>` after being authored by mux().
 *    Audio-only outputs also fail the "advance a video element" premise outright. We therefore do NOT
 *    attach playback-smoke by default for mux cases. Browser-playback coverage belongs to targeted
 *    scenarios with a playback oracle designed for the output shape; mux conformance is gated here by
 *    reference re-import where faithful and by probe-duration everywhere.
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
 *  - `graceful-failure` (oracles.ts gracefulFailure): only meaningful when the runner routes the case
 *    through `runRobustness`, which gates on `family==='robustness' || typeof scenario.mutate ===
 *    'function'`. A mux-family negative case therefore carries a deterministic `mutate` (identity for an
 *    already-degenerate input, or a corruptor) so the engine is fed the bytes and must reject CLEANLY
 *    within the timeout — PASS on a throw/reject (no output), FAIL on a crash/hang/timeout or on output
 *    emitted from clearly-illegal input. Same mechanism the demux/remux negative files use.
 */

import type { MetricId, OracleId, Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';

// ── Canonical invariant tokens (substring-matched by oracles.ts propertyInvariant) ───────────────

/** decode(mux(x)) == decode(x): packed coded samples must decode to identical pixels (VIDEO-only). */
export const DECODE_MUX = 'decode(mux(x))==decode(x)';
/** probe(mux(x)).dur ≈ probe(x).dur: duration survives the container change (VIDEO+AUDIO, x-container). */
export const PROBE_DUR = 'probe(mux(x)).dur≈probe(x).dur';

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

// ── Container classification (drives the default oracle set) ─────────────────────────────────────

/**
 * Targets that DO NOT reframe an mp4/mov source's coded samples, so the SOURCE golden packet table is a
 * faithful reference for `reference-reimport`. mp4 and mov share ISO-BMFF length-prefixed (AVCC) NAL
 * framing and the same sample model, so an mp4/mov→mp4/mov mux preserves packet count + keyframe count.
 * Anything that re-laces/re-frames (mkv SimpleBlock, ts Annex-B/PES, webm clusters, elementary streams)
 * is NOT faithful to a source-keyed golden and must NOT be count-gated.
 */
const FAITHFUL_REIMPORT_TARGETS = new Set(['mp4', 'mov']);

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
   * Override the default oracle set. Default is derived from the target container:
   *   - reference-reimport is included ONLY for FAITHFUL_REIMPORT_TARGETS of an ISO-BMFF source
   *     (source golden is a faithful packet reference); see _shared.ts header.
   *   - every case keeps property-invariant:probe-duration (container-agnostic structural gate).
   */
  oracles?: OracleId[];
  /** hard wall-clock cap (ms); bounds large/long size-ladder muxes. */
  timeoutMs?: number;
  /** robustness routing: a mutate makes the runner feed bytes through runRobustness (negative cases). */
  mutate?: (bytes: Uint8Array) => Uint8Array;
  notes?: string;
}

/**
 * Default oracle set for a mux cell. We deliberately ALWAYS include the container-agnostic
 * probe-duration property-invariant (the faithful cross-container gate), and add reference-reimport
 * only where the source golden is a faithful packet reference (no reframing). We do not attach
 * playback-smoke here; see the header for why plain `<video>` smoke is too brittle for mux outputs.
 */
function defaultOracles(c: MuxCase): OracleId[] {
  const sourceIsIsoBmff = c.containersIn.every((cc) => cc === 'mp4' || cc === 'mov');
  const hasTrackSelection = Array.isArray(c.extraOptions?.trackSelect);
  const isSingleSource = !Array.isArray(c.input);
  const oracles: OracleId[] = [];
  if (isSingleSource && !hasTrackSelection && sourceIsIsoBmff && FAITHFUL_REIMPORT_TARGETS.has(c.to)) {
    oracles.push('reference-reimport');
  }
  // probe-duration: works for video AND audio, and is invariant under the container change — the one
  // gate that is always faithful regardless of source/target reframing.
  oracles.push('property-invariant');
  return oracles;
}

/** The single source of truth for the options object: container + invariant + any write-shape knobs. */
function muxOptions(c: MuxCase): Record<string, unknown> {
  // probe-duration is the default property-invariant; an explicit invariant in extraOptions wins.
  return { container: c.to, invariant: PROBE_DUR, ...(c.extraOptions ?? {}) };
}

/** Build a single mux Scenario from a MuxCase. */
export function buildMux(c: MuxCase): Scenario {
  const oracles = c.oracles ?? defaultOracles(c);
  const metrics = (c.metrics ?? MUX_METRICS) as readonly MetricId[];
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
      ...(c.features ? { features: c.features } : {}),
    },
    oracles,
    metrics: [...metrics],
    ...(c.primaryMetric ? { primaryMetric: c.primaryMetric } : {}),
    ...(c.tolerances ? { tolerances: c.tolerances } : {}),
    ...(c.mutate ? { mutate: c.mutate } : {}),
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
  /** default: ['property-invariant']; pass extra (e.g. add reference-reimport for track survival) */
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
      ...(c.features ? { features: c.features } : {}),
    },
    oracles: c.oracles ?? ['property-invariant'],
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
  /** source asset whose demuxed tracks (or mutated bytes) feed the muxer */
  input: string | string[];
  containersIn: string[];
  /** target container (often an ILLEGAL one for the source codec — must be rejected) */
  to: string;
  videoCodecs?: string[];
  audioCodecs?: string[];
  features?: string[];
  extraOptions?: Record<string, unknown>;
  /**
   * Required: a mutate routes the case through runRobustness so `graceful-failure` is meaningful.
   * Use identityBytes() for an "illegal codec/container" or "zero-track" case where the INPUT is valid
   * but the requested mux is impossible — the engine must still reject cleanly within the timeout.
   */
  mutate: (bytes: Uint8Array) => Uint8Array;
  timeoutMs?: number;
  notes: string;
}

/** Identity passthrough — makes `scenario.mutate` truthy (→ robustness/graceful path) without altering
 *  the bytes. Used for negatives where the INPUT is valid but the requested mux is illegal/impossible. */
export function identityBytes(): (bytes: Uint8Array) => Uint8Array {
  return (bytes) => bytes;
}

/** Zero the entire buffer — models an empty / all-zero source whose demux yields no codable tracks. */
export function zeroOutAll(): (bytes: Uint8Array) => Uint8Array {
  return (bytes) => new Uint8Array(bytes.length);
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
    mutate: c.mutate,
    ...(c.timeoutMs ? { timeoutMs: c.timeoutMs } : {}),
    notes: c.notes,
  });
}

export function buildMuxNegativeAll(cases: MuxNegativeCase[]): Scenario[] {
  return cases.map(buildMuxNegative);
}
