/**
 * src/scenarios/streaming-output/_shared.ts — shared types + builders for the "streaming-output"
 * family, split out of index.ts so the ttfb / fragmented-faststart / ts-live / size-ladder /
 * metamorphic sub-batteries each live in their own file while emitting IDENTICAL scenario shapes.
 * The family stays a single exported `streamingOutputScenarios` array (index.ts concatenates them);
 * nothing here is registered on its own.
 *
 * ── WHAT THIS FAMILY IS ABOUT ───────────────────────────────────────────────────────────────────
 * It exercises HOW bytes leave the engine — the output SHAPE, independent of the codec work:
 *   buffer vs streaming target, fragmented/CMAF (moof/mdat), fastStart (moov-first / reserve / none),
 *   MPEG-TS tiny writes, headerless/live WebM, and the bounded-peak-memory promise of a stream target
 *   at GB scale. Every case is a lossless `remux` (coded samples copied), so the SHAPE — not the
 *   codec — is what differs.
 *
 * ── CONTRACT-LEVEL CAVEAT (read before adding oracles) ──────────────────────────────────────────
 * The output-shape knobs (`target`, `fragmented`, `fastStart`, `writeChunkBytes`, `maximumPacketCount`)
 * are carried in `options` HERE and the runner forwards the full remux option bag to adapters. That
 * makes declared `fastStart:*` / `fragmented` rows execute the requested mode instead of accidentally
 * validating a plain buffered remux. Streaming target rows are stricter: any case that requests
 * `target:'stream'` or write granularity now requires the explicit `target:writes` feature, so a
 * BufferTarget/MEMFS/full-buffer implementation cannot pass a streaming-output row by merely returning
 * valid bytes. The remaining caveat is OBSERVABILITY: target-write counts, first-byte timing, and
 * bounded stream memory still need CountingTarget/StreamTarget plumbing in adapters and runner metrics.
 * Where a SHAPE property cannot yet be observed, the case is documented with the exact missing hook
 * rather than gated by a placeholder that would silently pass.
 *
 * ── ORACLE TRUTH for an `op:'remux'` scenario (mirrors remux/_shared.ts) ─────────────────────────
 *   - The runner runs ONLY `engine.remux(...)` and exposes the result as `ctx.output`. It never
 *     probes/demuxes the output into ctx.metadata/ctx.demux. So `golden-metadata`/`golden-packets`
 *     ALWAYS report "absent" for a remux op and are NEVER attached here.
 *   - `reference-reimport` re-imports `ctx.output` with the reference engine (mediabunny) and diffs the
 *     packet table (count ±2%, keyframe count) vs golden. It is the STRUCTURAL-INTEGRITY gate and the
 *     ONLY gate that works for shapes a plain <video> / the inline platform demux cannot consume:
 *       • fragmented/CMAF mp4 (moof/mdat) — mediabunny reads fMP4/CMAF (dossier mediabunny.md §A.2),
 *         but the platform inline mp4 demux is progressive-only (engines/platform/demux-mp4.ts: "does
 *         not handle moof/traf") AND a plain <video src=blob> may not play a bare fMP4. So fragmented
 *         cases gate byte validity with reference-reimport and top-level structure with mp4-box-layout;
 *         attaching decode-remux or playback-smoke would risk a FALSE FAIL on a CORRECT fragmented
 *         output (the §0.1 anti-pattern, inverted).
 *       • headerless/live WebM — same reasoning: reference-reimport (+ a probe-duration invariant).
 *       • MPEG-TS — TS is not reliably plain-<video>-playable cross-browser and its duration is
 *         estimate-only; gate on reference-reimport (mediabunny reads MPEG_TS, dossier §A.2).
 *   - `playback-smoke` plays `ctx.output` in a plain `<video>` (engines/platform/oracle-helpers.ts uses
 *     `video.src = blobURL`, NOT MSE). The raw Brave run showed it false-failing even progressive MP4
 *     outputs that reference-reimport proved structurally valid across mediabunny, ffmpeg.wasm, and
 *     mp4box. This family therefore does not attach playback-smoke by default; streaming-output
 *     conformance is gated by reference re-import and property invariants that inspect the bytes.
 *   - `property-invariant` (metamorphic, §11/§A.16): selected by `options.invariant`. Two variants used:
 *       • 'decode(remux(x))==decode(x)' → decodes ctx.output via the platform WebCodecs path and compares
 *         frame digests to golden.frames (== the offline decode of x). VIDEO-ONLY; needs baked
 *         <asset>.frames.json (a `pending` golden ⇒ clean golden-absent FAIL, never a crash). Only used
 *         where the platform inline demux CAN parse the output (progressive mp4 — NOT fragmented).
 *       • 'probe-duration' (token deliberately contains neither "decode" nor "remux" so it routes to the
 *         probe branch — see remux/metamorphic.ts header) → reference-probes ctx.output's duration vs
 *         golden.meta.durationSec. Works for video AND audio AND every output shape; the honest gate
 *         that fastStart/fragmented/stream did not corrupt the reported duration. MP4 fastStart and
 *         fragmented cases also receive mp4-box-layout so the shape itself is checked.
 */

import type { MetricId, OracleId, Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';

/**
 * Metrics every bytes-producing streaming-output case reports. `targetWrites` and `bytesOut` are the
 * SHAPE-relevant I/O counts (write granularity, output size); `peakMemory` is the buffer-vs-stream
 * discriminator at scale. (NOTE: `targetWrites` only becomes non-blank once the runner threads a
 * CountingTarget through the remux op — a core change outside this file. It is requested here so the
 * leaderboard column exists and fills in the moment that lands.)
 */
export const STREAM_METRICS = [
  'wall',
  'throughputRealtime',
  'peakMemory',
  'targetWrites',
  'bytesOut',
  'longtasks',
] as const;

/** Output-shape knobs carried in `options` and forwarded to adapters by the runner. */
export interface OutputShape {
  /** canonical target container */
  container: string;
  /** 'buffer' (whole-blob, BufferTarget) vs 'stream' (incremental StreamTarget) */
  target?: 'buffer' | 'stream';
  /** fMP4 / CMAF: emit moof/mdat fragments (mediabunny IsobmffOutputFormat fastStart:'fragmented') */
  fragmented?: boolean;
  /**
   * fastStart mode for ISOBMFF outputs (dossier mediabunny.md §5 / §A.3):
   *   false        → moov at END (mdat-first) — the default/control
   *   'in-memory'  → moov RELOCATED to front after a buffered second pass (progressive download)
   *   'reserve'    → reserve forward moov space + patch in place (needs maximumPacketCount per track)
   */
  fastStart?: false | 'in-memory' | 'reserve';
  /** TS streaming write granularity: emit in this many-byte chunks (188 = one TS packet) */
  writeChunkBytes?: number;
  /** fastStart:'reserve' bound — per-track packet ceiling the reserved moov is sized for */
  maximumPacketCount?: number;
  /** Matroska/WebM append-only live profile: unknown-size Segment, no SeekHead, no Segment Duration. */
  appendOnly?: boolean;
}

export interface StreamCase {
  /** unique id suffix (namespaced under streaming-output/) */
  id: string;
  /** source asset id (must exist in fixtures/manifest.json) */
  asset: string;
  /** source container token (canonical) */
  from: string;
  /** target container token (canonical) */
  to: string;
  videoCodecs?: string[];
  audioCodecs?: string[];
  /** output-shape options forwarded to the engine (carries container + target/fragmented/fastStart/…) */
  shape: OutputShape;
  /** extra capability features the output mode needs (gated NA_ENGINE if an engine doesn't declare it) */
  features?: string[];
  /** Override the default oracle set. Default: reference-reimport only. */
  oracles?: OracleId[];
  /** the metric the per-case winner is ranked by (§9); defaults to metrics[0] when omitted */
  primaryMetric?: MetricId;
  /** extra metrics appended to STREAM_METRICS for this case (e.g. 'timeToFirstByte') */
  extraMetrics?: MetricId[];
  /** hard wall-clock cap (ms); used to bound very large size-ladder streams. */
  timeoutMs?: number;
  notes?: string;
}

/** Default oracle set for an output-shape byte-validity check. */
const DEFAULT_STREAM_ORACLES: OracleId[] = ['reference-reimport'];

const TARGET_WRITE_FEATURE = 'target:writes';

function mp4LayoutOracleApplies(shape: OutputShape): boolean {
  const container = shape.container.trim().toLowerCase();
  const isIsoBmff = container === 'mp4' || container === 'mov';
  return isIsoBmff && (shape.fragmented === true || shape.fastStart !== undefined);
}

function withMp4LayoutOracle(oracles: OracleId[], shape: OutputShape): OracleId[] {
  if (!mp4LayoutOracleApplies(shape) || oracles.includes('mp4-box-layout')) return oracles;
  return [...oracles, 'mp4-box-layout'];
}

function webmLiveLayoutOracleApplies(shape: OutputShape): boolean {
  const container = shape.container.trim().toLowerCase();
  return (container === 'webm' || container === 'mkv') && shape.appendOnly === true;
}

function withWebmLiveLayoutOracle(oracles: OracleId[], shape: OutputShape): OracleId[] {
  if (!webmLiveLayoutOracleApplies(shape) || oracles.includes('webm-live-layout')) return oracles;
  return [...oracles, 'webm-live-layout'];
}

/** Stable id for a streaming-output case. */
function streamId(c: Pick<StreamCase, 'id'>): string {
  return `streaming-output/${c.id}`;
}

/** Assemble the options bag: container + every defined shape knob (undefined knobs are omitted). */
function shapeOptions(shape: OutputShape, extra?: Record<string, unknown>): Record<string, unknown> {
  const o: Record<string, unknown> = { container: shape.container };
  if (shape.target !== undefined) o.target = shape.target;
  if (shape.fragmented !== undefined) o.fragmented = shape.fragmented;
  if (shape.fastStart !== undefined) o.fastStart = shape.fastStart;
  if (shape.writeChunkBytes !== undefined) o.writeChunkBytes = shape.writeChunkBytes;
  if (shape.maximumPacketCount !== undefined) o.maximumPacketCount = shape.maximumPacketCount;
  if (shape.appendOnly !== undefined) o.appendOnly = shape.appendOnly;
  return extra ? { ...o, ...extra } : o;
}

function shapeFeatures(c: StreamCase | StreamPropertyCase): string[] | undefined {
  const features = [...(c.features ?? [])];
  const shape = c.shape;
  if (shape.target === 'stream' || shape.writeChunkBytes !== undefined) {
    pushUnique(features, TARGET_WRITE_FEATURE);
  }
  if (shape.fragmented === true) {
    pushUnique(features, 'fragmented');
  }
  if (shape.fastStart === false && !features.includes('fastStart:none')) {
    features.push('fastStart:none');
  }
  if (shape.fastStart === 'in-memory') {
    pushUnique(features, 'fastStart:in-memory');
  }
  if (shape.fastStart === 'reserve') {
    pushUnique(features, 'fastStart:reserve');
  }
  if (shape.appendOnly === true) {
    pushUnique(features, 'headerless');
  }
  return features.length ? features : undefined;
}

function pushUnique(list: string[], value: string): void {
  if (!list.includes(value)) list.push(value);
}

/** Build a single streaming-output Scenario from a StreamCase. */
export function buildStream(c: StreamCase): Scenario {
  const metrics: MetricId[] = [...STREAM_METRICS, ...(c.extraMetrics ?? [])];
  const features = shapeFeatures(c);
  const oracles = withWebmLiveLayoutOracle(withMp4LayoutOracle(c.oracles ?? DEFAULT_STREAM_ORACLES, c.shape), c.shape);
  return defineScenario({
    id: streamId(c),
    op: 'remux',
    input: c.asset,
    options: shapeOptions(c.shape),
    requires: {
      operations: ['remux'],
      containersIn: [c.from],
      containersOut: [c.to],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
      ...(features ? { features } : {}),
    },
    oracles,
    metrics,
    ...(c.primaryMetric ? { primaryMetric: c.primaryMetric } : {}),
    ...(c.timeoutMs ? { timeoutMs: c.timeoutMs } : {}),
    ...(c.notes ? { notes: c.notes } : {}),
  });
}

export function buildStreamAll(cases: StreamCase[]): Scenario[] {
  return cases.map(buildStream);
}

// ── Metamorphic / property-invariant streaming cases ────────────────────────────────────────────

export interface StreamPropertyCase {
  /** unique id suffix (namespaced under streaming-output/) */
  id: string;
  /** the invariant token the property-invariant oracle interprets (passed via options.invariant) */
  invariant: string;
  asset: string;
  from: string;
  to: string;
  videoCodecs?: string[];
  audioCodecs?: string[];
  features?: string[];
  /** the output-shape this invariant is proving the property OVER (buffer/stream/fragmented/faststart) */
  shape: OutputShape;
  /** override the default ['property-invariant'] oracle set */
  oracles?: OracleId[];
  tolerances?: Scenario['tolerances'];
  timeoutMs?: number;
  notes?: string;
}

/**
 * Build a metamorphic streaming-output Scenario. The op is still `remux` (so the runner produces
 * `ctx.output`), and `options.invariant` selects the in-browser property the `property-invariant`
 * oracle checks across the chosen output shape:
 *   - 'decode(remux(x))==decode(x)'   → output frame digests must equal golden source-decode digests
 *                                       (gates that the shape change is a lossless sample copy)
 *   - 'probe-duration'                → reference-probed output duration ≈ golden duration
 *                                       (gates that the shape change did not corrupt reported duration)
 * Metrics are kept minimal (the bench value of a metamorphic case is low; correctness is the point).
 */
export function buildStreamProperty(c: StreamPropertyCase): Scenario {
  const features = shapeFeatures(c);
  const oracles = withWebmLiveLayoutOracle(withMp4LayoutOracle(c.oracles ?? ['property-invariant'], c.shape), c.shape);
  return defineScenario({
    id: `streaming-output/${c.id}`,
    op: 'remux',
    input: c.asset,
    options: shapeOptions(c.shape, { invariant: c.invariant }),
    requires: {
      operations: ['remux'],
      containersIn: [c.from],
      containersOut: [c.to],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
      ...(features ? { features } : {}),
    },
    oracles,
    metrics: ['wall', 'peakMemory', 'longtasks'],
    ...(c.tolerances ? { tolerances: c.tolerances } : {}),
    ...(c.timeoutMs ? { timeoutMs: c.timeoutMs } : {}),
    ...(c.notes ? { notes: c.notes } : {}),
  });
}

export function buildStreamPropertyAll(cases: StreamPropertyCase[]): Scenario[] {
  return cases.map(buildStreamProperty);
}
