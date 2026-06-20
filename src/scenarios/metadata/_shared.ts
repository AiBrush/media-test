/**
 * src/scenarios/metadata/_shared.ts — shared types + builders for the "metadata" family.
 *
 * Split out so the family's sub-batteries (read, write-roundtrip, rotation, track-selection,
 * negatives, metamorphic) each live in their own file while emitting IDENTICAL scenario shapes. The
 * family stays a single exported `metadataScenarios` array (index.ts concatenates them); nothing here
 * is registered on its own.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ORACLE TRUTH for the metadata family (verified against src/core/{oracles,runner,engine}.ts — read
 * before adding ANY case so a scenario never claims a gate the harness cannot actually enforce):
 *
 * 1. `golden-metadata` (oracles.ts goldenMetadata + compareTrack, ~lines 345-431) compares ONLY:
 *      container, durationSec (±tolerance), and per-track {type, codec, width, height, fps,
 *      sampleRate, channels} matched POSITIONALLY by golden track order.
 *    It does NOT compare `tags`, `track.rotation`, `track.language`, or `track.bitrate`. Therefore a
 *    `read_*` PROBE case gates the STRUCTURAL metadata (container/duration/track layout/codec/dims/
 *    fps/sr/ch) honestly — but it can NOT gate tag CONTENT, a rotation VALUE, or a language VALUE.
 *    Attaching `golden-metadata` and CLAIMING it verifies tags/rotation/language would be an
 *    over-claim (§0 honest-capabilities). We attach it only for what it truly checks and document the
 *    residual gap in `notes`.
 *
 * 2. The runner's `op:'remux'` dispatch (runner.ts executeOp, ~line 433) calls
 *    `engine.remux(input, { container })` and exposes the bytes as `ctx.output`. It forwards ONLY
 *    `{ container }` — `options.tags` is DROPPED — and it does NOT re-probe the output into
 *    `ctx.metadata`. Consequently for a remux op:
 *      • `golden-metadata` reads `ctx.metadata` → ALWAYS "no probe metadata on ctx.metadata" → FAIL
 *        for a PLUMBING reason, masking whether any tag was written. So `golden-metadata` is NEVER a
 *        valid remux gate and is never attached to a write case.
 *      • The desired tags cannot reach the engine through the runner today, so a genuine
 *        write→readback of tag CONTENT is NOT realizable from a scenario file alone (it needs a
 *        runner that forwards options.tags + re-probes, and an oracle that compares the tag map —
 *        both outside the scenario writer's scope). We keep `options.tags` on the scenario (so a
 *        future runner/oracle reads it, and the intent is self-documenting) and gate the write with
 *        the oracles that DO observe a remux output: `reference-reimport` (the output is a real,
 *        parseable container) + `property-invariant` (the tag rewrite must NOT corrupt media —
 *        decode(remux(x))==decode(x) for video, probe(remux(x)).dur≈probe(x).dur for audio).
 *
 * 3. `property-invariant` (oracles.ts propertyInvariant) computes a metamorphic invariant IN-BROWSER
 *    from `ctx.output` and selects the branch by SUBSTRING of `options.invariant`:
 *      • token contains 'decode' OR 'remux'  → decode-remux: decode(ctx.output) frame digests must
 *        equal golden.frames (== the offline decode of x). VIDEO-ONLY + needs `<asset>.frames.json`.
 *      • token contains 'duration' OR 'probe' (and NEITHER 'decode' NOR 'remux') → probe-duration:
 *        reference-probed output duration ≈ golden duration. Works for VIDEO and AUDIO.
 *      Routing trap (mirrors remux/metamorphic.ts): a human token like 'probe(remux(x)).dur' contains
 *      'remux' and MISROUTES to decode-remux. Use the bare tokens DECODE_REMUX / PROBE_DUR below and
 *      put human phrasing in `notes`.
 *
 * 4. Rotation: the reference engine (mediabunny adapter normalizeTrack) sets
 *    `rotation = getRotation()||0` and its decode path (CanvasSink/VideoSample.draw) BAKES rotation
 *    into the decoded RGBA. So golden frames for a rotated asset are baked rotation-APPLIED, and
 *    decode(x)==decode(remux(x)) catches a dropped/garbled display matrix (a demuxer that lost the
 *    matrix, or one that baked rotation into width/height instead of exposing it, changes the decoded
 *    presentation → frame-digest mismatch). This is the ONLY rotation gate expressible from a
 *    scenario file today; a rotation-VALUE-via-probe gate would require compareTrack to compare
 *    `rotation` (an oracles.ts edit, out of scope).
 *
 * 5. Chapters / edit-lists / cover-art / timecode: `NormalizedMetadata`/`NormalizedTrack` (engine.ts)
 *    have NO fields for these, and no oracle reads them. They are UNVERIFIABLE from a scenario file
 *    until the model + golden + an oracle gain the fields. We deliberately do NOT add fabricated
 *    cases for them (a case with no real gate is worse than an honest absence, §0.1); the gap is
 *    recorded in index.ts so the model owner can close it.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

import type { OracleId, OracleTolerances, Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';

// Property-invariant tokens (see ORACLE TRUTH §3 — bare, routing-safe tokens; human phrasing → notes).
export const DECODE_REMUX = 'decode(remux(x))==decode(x)'; // routes to decode-remux (contains 'decode')
export const PROBE_DUR = 'probe-duration'; // routes to probe-duration (contains 'probe', no 'decode'/'remux')

// ── READ tags / structural metadata ──────────────────────────────────────────────────────────────

export interface TagReadCase {
  asset: string;
  container: string;
  videoCodecs?: string[];
  audioCodecs?: string[];
  notes?: string;
}

/** Build a READ scenario: probe the asset, gate STRUCTURAL metadata via golden-metadata (ORACLE §1). */
export function buildRead(c: TagReadCase): Scenario {
  return defineScenario({
    id: `metadata/read_${c.asset.replace(/\.[^.]+$/, '')}`,
    op: 'probe',
    input: c.asset,
    requires: {
      operations: ['probe'],
      containersIn: [c.container],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
    },
    oracles: ['golden-metadata'],
    metrics: ['wall'],
    ...(c.notes ? { notes: c.notes } : {}),
  });
}

// ── WRITE tags then re-observe the output (honest gate per ORACLE §2) ─────────────────────────────

export interface TagWriteCase {
  /** unique id suffix (namespaced under metadata/) */
  id: string;
  asset: string;
  container: string;
  videoCodecs?: string[];
  audioCodecs?: string[];
  /**
   * Tags to set on the output. Carried in `options.tags` so a future runner that forwards them (and
   * an oracle that re-probes + compares the tag map) activates a genuine write→readback. With the
   * current runner these are not delivered (ORACLE §2); the case still gates that the rewrite is a
   * valid container that did NOT corrupt media (via the oracles below).
   */
  tags: Record<string, string>;
  /**
   * Invariant for the "must not corrupt media" gate: DECODE_REMUX for video assets (decoded pixels
   * unchanged by a tag-only rewrite), PROBE_DUR for audio-only assets (no PCM oracle exists, so
   * duration materialized from the re-wrapped stream is the honest sample-fidelity proxy).
   */
  invariant: typeof DECODE_REMUX | typeof PROBE_DUR;
  /** Optional per-case oracle tolerances for container-estimation edges. */
  tolerances?: OracleTolerances;
  notes?: string;
}

/**
 * Build a WRITE-tags scenario. op:'remux' (the runner produces ctx.output). The oracles are the ones
 * that ACTUALLY observe a remux output (ORACLE §2):
 *   - reference-reimport : the tag-bearing output is a real, parseable container the reference reads.
 *   - property-invariant : the tag rewrite must not corrupt media (decode/duration invariant).
 * NOTE: `golden-metadata` is intentionally NOT attached (it always FAILs on a remux op for a
 * plumbing reason and cannot see tag content). `metadata:write` is required so only engines that
 * declare the feature run it; everyone else gets a clean NA_ENGINE.
 */
export function buildWrite(c: TagWriteCase): Scenario {
  return defineScenario({
    id: `metadata/${c.id}`,
    op: 'remux',
    input: c.asset,
    options: { container: c.container, tags: c.tags, invariant: c.invariant },
    requires: {
      operations: ['remux', 'probe'],
      containersIn: [c.container],
      containersOut: [c.container],
      features: ['metadata:write'],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
    },
    oracles: ['reference-reimport', 'property-invariant'],
    metrics: ['wall', 'targetWrites'],
    ...(c.tolerances ? { tolerances: c.tolerances } : {}),
    ...(c.notes ? { notes: c.notes } : {}),
  });
}

// ── Metamorphic / property-invariant metadata cases (rotation survival, cross-container, etc.) ────

export interface MetaPropertyCase {
  /** unique id suffix (namespaced under metadata/) */
  id: string;
  /** invariant token the property-invariant oracle interprets (use DECODE_REMUX / PROBE_DUR) */
  invariant: typeof DECODE_REMUX | typeof PROBE_DUR;
  input: string;
  from: string;
  to: string;
  videoCodecs?: string[];
  audioCodecs?: string[];
  features?: string[];
  /** Optional per-case oracle tolerances for container-estimation edges. */
  tolerances?: OracleTolerances;
  /** override the default ['property-invariant'] oracle set (e.g. add reference-reimport) */
  oracles?: OracleId[];
  timeoutMs?: number;
  notes?: string;
}

/** Build a metamorphic metadata Scenario (op:'remux' → ctx.output; property-invariant gates it). */
export function buildProperty(c: MetaPropertyCase): Scenario {
  return defineScenario({
    id: `metadata/${c.id}`,
    op: 'remux',
    input: c.input,
    options: { container: c.to, invariant: c.invariant },
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
    ...(c.tolerances ? { tolerances: c.tolerances } : {}),
    ...(c.timeoutMs ? { timeoutMs: c.timeoutMs } : {}),
    ...(c.notes ? { notes: c.notes } : {}),
  });
}

// ── Direct decode-read cases (read a property by its OBSERVABLE decoded effect) ───────────────────

export interface DecodeReadCase {
  /** unique id suffix (namespaced under metadata/) */
  id: string;
  asset: string;
  container: string;
  videoCodecs?: string[];
  /** Optional feature tokens for decoded-presentation properties (for example rotation:decode). */
  features?: string[];
  /** how many frames to decode + digest-compare against golden */
  maxFrames: number;
  timeoutMs?: number;
  notes?: string;
}

/**
 * Build a decodeFrames scenario gated by `decoded-frames-bitexact`. Used to read a metadata property
 * by the pixels it produces (e.g. rotation: golden frames are baked rotation-applied by the reference
 * decoder, so a demuxer that drops the display matrix — or bakes it into width/height — yields a
 * different decoded image → digest mismatch). VIDEO-ONLY; needs a baked `<asset>.frames.json`.
 */
export function buildDecodeRead(c: DecodeReadCase): Scenario {
  return defineScenario({
    id: `metadata/${c.id}`,
    op: 'decodeFrames',
    input: c.asset,
    options: { maxFrames: c.maxFrames },
    requires: {
      operations: ['decodeFrames'],
      containersIn: [c.container],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.features ? { features: c.features } : {}),
    },
    oracles: ['decoded-frames-bitexact'],
    metrics: ['wall'],
    ...(c.timeoutMs ? { timeoutMs: c.timeoutMs } : {}),
    ...(c.notes ? { notes: c.notes } : {}),
  });
}

// ── Negative / malformed tag-region cases (graceful-failure) ──────────────────────────────────────

export interface MetaNegativeCase {
  /** unique id suffix (namespaced under metadata/) */
  id: string;
  /** valid base asset to corrupt before probing */
  asset: string;
  container: string;
  videoCodecs?: string[];
  audioCodecs?: string[];
  /** byte mutation that garbles/truncates the tag/metadata region */
  mutate: (bytes: Uint8Array) => Uint8Array;
  /**
   * Some parsers safely recover from malformed tag regions by ignoring the corrupt tag and returning
   * structural stream metadata. For those cases the robustness property is "no fault", not
   * "mandatory reject".
   */
  gracefulAllowOutput?: boolean;
  timeoutMs?: number;
  notes: string;
}

/**
 * Build a negative metadata Scenario. A `mutate` fn classifies the case into the robustness PILLAR
 * and routes it through runner.runRobustness, which expects engine.probe to throw/reject within the
 * timeout. `graceful-failure` PASSes iff no output was produced (clean reject) — FAILs on hang/timeout
 * or on metadata emitted from a clearly-corrupt tag region.
 */
export function buildNegative(c: MetaNegativeCase): Scenario {
  return defineScenario({
    id: `metadata/${c.id}`,
    op: 'probe',
    input: c.asset,
    requires: {
      operations: ['probe'],
      containersIn: [c.container],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
    },
    oracles: ['graceful-failure'],
    metrics: ['wall', 'peakMemory'],
    mutate: c.mutate,
    ...(c.gracefulAllowOutput ? { options: { gracefulAllowOutput: true } } : {}),
    ...(c.timeoutMs ? { timeoutMs: c.timeoutMs } : {}),
    notes: c.notes,
  });
}
