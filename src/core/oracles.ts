/**
 * src/core/oracles.ts — browser-pure correctness oracles (§8). THE conformance gate.
 *
 * "No green correctness oracle → no admissible benchmark." Every oracle here validates only an
 * engine's OBSERVABLE output (bytes/metadata/frames in → out), using ONLY:
 *   - the browser itself (crypto.subtle, ImageData, OffscreenCanvas — all guarded),
 *   - committed golden JSON baked offline by INDEPENDENT tools (ffprobe/ffmpeg/Bento4),
 *   - injected platform decode/playback helpers (ctx.decodeWithPlatform / ctx.playbackSmoke),
 *   - the reference engine (ctx.referenceEngine) for re-import checks.
 *
 * This module imports NO adapter and NO heavy library. It is dependency-free apart from the pure
 * type contracts in engine.ts / scenario.ts. It runs in page or Worker contexts alike.
 *
 * Golden file format (consumer contract — the offline bake must emit these under
 * `fixtures/golden/<assetId>.<kind>.json`; absent files tolerated as 404 → undefined):
 *   - <id>.meta.json    : NormalizedMetadata            (or { metadata } / { meta } wrapper)
 *   - <id>.packets.json : PacketInfo[]                  (or { packets } wrapper)
 *   - <id>.frames.json  : FrameDigest[]                 (or { frames } wrapper)
 *   - <id>.ssim.json    : number[][] downsampled luma   (or { ssimRef } / { sigs } / [{ sig }] )
 * Each reader tolerates either the bare value or a single-key wrapper object, because the bake
 * author's exact envelope is not yet committed; shape mismatches surface as oracle FAIL detail.
 */

import type {
  DemuxResult,
  FrameDigest,
  FrameSink,
  MediaBytes,
  MediaInput,
  NormalizedMetadata,
  NormalizedTrack,
} from './engine.ts';
import type { MediaEngine, PacketInfo } from './engine.ts';
import type { OracleId, OracleOutcome, OracleTolerances, Scenario } from './scenario.ts';

// ── Golden store ──────────────────────────────────────────────────────────────────────────────

export interface GoldenStore {
  meta?: NormalizedMetadata;
  packets?: PacketInfo[];
  frames?: FrameDigest[]; // golden decoded-frame digests
  ssimRef?: number[][]; // downsampled luma signatures per reference frame (for ssim-psnr)
  raw?: Record<string, unknown>;
}

/**
 * Fetch the committed golden artifacts for an asset. Tolerates 404 (artifact absent → field
 * undefined) and any non-OK status; only a present, parseable JSON populates a field. Never throws
 * on a missing file — a scenario may legitimately have only a subset of golden kinds.
 */
export async function loadGolden(assetId: string, baseUrl = 'fixtures/golden'): Promise<GoldenStore> {
  const base = baseUrl.replace(/\/+$/, '');
  const url = (kind: string) => `${base}/${assetId}.${kind}.json`;

  const [metaRaw, packetsRaw, framesRaw, ssimRaw] = await Promise.all([
    fetchJson(url('meta')),
    fetchJson(url('packets')),
    fetchJson(url('frames')),
    fetchJson(url('ssim')),
  ]);

  const store: GoldenStore = {};
  const raw: Record<string, unknown> = {};

  if (metaRaw !== undefined) {
    raw.meta = metaRaw;
    const meta = unwrap(metaRaw, ['metadata', 'meta']);
    if (isObject(meta)) store.meta = meta as unknown as NormalizedMetadata;
  }
  if (packetsRaw !== undefined) {
    raw.packets = packetsRaw;
    const packets = unwrap(packetsRaw, ['packets']);
    if (Array.isArray(packets)) store.packets = packets as PacketInfo[];
  }
  if (framesRaw !== undefined) {
    raw.frames = framesRaw;
    const frames = unwrap(framesRaw, ['frames']);
    if (Array.isArray(frames)) store.frames = frames as FrameDigest[];
  }
  if (ssimRaw !== undefined) {
    raw.ssim = ssimRaw;
    store.ssimRef = parseSsimRef(ssimRaw);
  }

  if (Object.keys(raw).length) store.raw = raw;
  return store;
}

async function fetchJson(u: string): Promise<unknown | undefined> {
  try {
    const res = await fetch(u, { cache: 'no-store' });
    if (!res.ok) return undefined; // 404 and any other non-OK → absent
    return (await res.json()) as unknown;
  } catch {
    // network error / parse error → treat as absent rather than failing the whole oracle run
    return undefined;
  }
}

/** Accept either a bare value or a single-key wrapper object ({ packets: [...] } etc.). */
function unwrap(value: unknown, keys: string[]): unknown {
  if (isObject(value)) {
    for (const k of keys) {
      if (k in value) return (value as Record<string, unknown>)[k];
    }
  }
  return value;
}

/**
 * Normalize the ssim golden into number[][]. Accept:
 *   - number[][] directly
 *   - { ssimRef | sigs | luma: number[][] }
 *   - Array<{ sig | luma: number[] }>   (per-frame objects)
 */
function parseSsimRef(value: unknown): number[][] | undefined {
  const v = unwrap(value, ['ssimRef', 'sigs', 'luma', 'frames']);
  if (!Array.isArray(v)) return undefined;
  if (v.length === 0) return [];
  const first = v[0];
  if (Array.isArray(first)) {
    return (v as unknown[][]).map((row) => row.map((n) => Number(n)));
  }
  if (isObject(first)) {
    const out: number[][] = [];
    for (const item of v as Record<string, unknown>[]) {
      const sig = item.sig ?? item.luma ?? item.signature;
      if (Array.isArray(sig)) out.push(sig.map((n) => Number(n)));
    }
    return out;
  }
  return undefined;
}

// ── Tolerances ───────────────────────────────────────────────────────────────────────────────

/**
 * durationToleranceSec ≈ 1 frame @ 24 fps = 1/24 ≈ 0.0417s. We use the conventional "±1 frame"
 * budget at the slowest common cinematic rate so a single-frame off-by-one in container duration is
 * not flagged; scenarios with higher fps may tighten this via per-scenario tolerances.
 * seekToleranceUs = 1000µs (1ms). ssimMin/psnrMinDb from §8 (0.99 / 40 dB).
 */
export const DEFAULT_TOLERANCES: Required<OracleTolerances> = {
  ssimMin: 0.99,
  psnrMinDb: 40,
  durationToleranceSec: 1 / 24, // ≈ 0.0417s (≈ 1 frame @ 24 fps)
  seekToleranceUs: 1000,
};

function withDefaults(tol?: OracleTolerances): Required<OracleTolerances> {
  return {
    ssimMin: tol?.ssimMin ?? DEFAULT_TOLERANCES.ssimMin,
    psnrMinDb: tol?.psnrMinDb ?? DEFAULT_TOLERANCES.psnrMinDb,
    durationToleranceSec: tol?.durationToleranceSec ?? DEFAULT_TOLERANCES.durationToleranceSec,
    seekToleranceUs: tol?.seekToleranceUs ?? DEFAULT_TOLERANCES.seekToleranceUs,
  };
}

// ── Oracle context ───────────────────────────────────────────────────────────────────────────

export interface OracleContext {
  scenario: Scenario;
  input: MediaInput;
  output?: MediaBytes; // bytes-producing ops
  metadata?: NormalizedMetadata; // probe
  demux?: DemuxResult; // demux
  frames?: FrameSink; // decodeFrames
  seek?: { landedPtsUs: number; frame: FrameDigest };
  golden: GoldenStore;
  referenceEngine?: MediaEngine; // for 'reference-reimport'
  /** injected by runner: decode arbitrary bytes with the platform engine (WebCodecs) → frames */
  decodeWithPlatform: (bytes: MediaBytes, opts?: { maxFrames?: number }) => Promise<FrameSink>;
  /** injected by runner: <video> playback smoke test → resolves true if it plays a few frames */
  playbackSmoke: (bytes: MediaBytes) => Promise<boolean>;
}

// ── Dispatch ─────────────────────────────────────────────────────────────────────────────────

/**
 * Dispatch on OracleId. Each branch returns an OracleOutcome whose `detail` explains WHY on failure
 * (measured vs expected) and whose `measurements` carries any numeric evidence. Any thrown error is
 * caught and reported as a non-passing outcome — an oracle must never crash the runner. (The lone
 * exception in spirit: 'graceful-failure', which INVERTS the meaning of "threw".)
 */
export async function runOracle(
  oracle: OracleId,
  ctx: OracleContext,
  tol?: OracleTolerances,
): Promise<OracleOutcome> {
  const t = withDefaults(tol);
  try {
    switch (oracle) {
      case 'golden-metadata':
        return goldenMetadata(ctx, t);
      case 'golden-packets':
        return goldenPackets(ctx, t);
      case 'decoded-frames-bitexact':
        return decodedFramesBitexact(ctx);
      case 'reference-reimport':
        return referenceReimport(ctx);
      case 'playback-smoke':
        return playbackSmoke(ctx);
      case 'ssim-psnr':
        return ssimPsnr(ctx, t);
      case 'alpha-plane':
        return alphaPlane(ctx);
      case 'seek-accuracy':
        return seekAccuracy(ctx, t);
      case 'trim-boundaries':
        return trimBoundaries(ctx, t);
      case 'decrypt-bitexact':
        return decryptBitexact(ctx);
      case 'graceful-failure':
        return gracefulFailure(ctx, t);
      case 'property-invariant':
        return propertyInvariant(ctx, t);
      default:
        return fail(oracle, `unknown oracle id '${String(oracle)}'`);
    }
  } catch (err) {
    // graceful-failure treats a throw differently; let it own the catch.
    if (oracle === 'graceful-failure') {
      return pass(oracle, `operation threw/rejected as required: ${errMsg(err)}`);
    }
    return fail(oracle, `oracle threw: ${errMsg(err)}`);
  }
}

// ── golden-metadata ──────────────────────────────────────────────────────────────────────────

function goldenMetadata(ctx: OracleContext, t: Required<OracleTolerances>): OracleOutcome {
  const oracle: OracleId = 'golden-metadata';
  const got = ctx.metadata;
  const want = ctx.golden.meta;
  if (!got) return fail(oracle, 'no probe metadata on ctx.metadata');
  if (!want) return fail(oracle, 'no golden meta (fixtures/golden/<id>.meta.json absent)');

  const diffs: string[] = [];
  const measurements: Record<string, number> = {};

  // container
  if (normStr(got.container) !== normStr(want.container)) {
    diffs.push(`container: measured '${got.container}' vs golden '${want.container}'`);
  }

  // duration within ±tolerance (only when both present)
  if (got.durationSec != null && want.durationSec != null) {
    const d = Math.abs(got.durationSec - want.durationSec);
    measurements.durationDeltaSec = d;
    if (d > t.durationToleranceSec) {
      diffs.push(
        `duration: measured ${got.durationSec.toFixed(4)}s vs golden ${want.durationSec.toFixed(
          4,
        )}s (Δ ${d.toFixed(4)}s > tol ${t.durationToleranceSec.toFixed(4)}s)`,
      );
    }
  } else if (want.durationSec != null && got.durationSec == null) {
    diffs.push(`duration: measured null vs golden ${want.durationSec}s`);
  }

  // per-track codec/dims/fps/sampleRate/channels — match golden tracks positionally by type order
  const goldTracks = want.tracks ?? [];
  const gotTracks = got.tracks ?? [];
  if (gotTracks.length !== goldTracks.length) {
    diffs.push(`track count: measured ${gotTracks.length} vs golden ${goldTracks.length}`);
  }
  const n = Math.min(gotTracks.length, goldTracks.length);
  for (let i = 0; i < n; i++) {
    const a = gotTracks[i]!;
    const b = goldTracks[i]!;
    diffs.push(...compareTrack(i, a, b));
  }

  if (diffs.length) return fail(oracle, diffs.join('; '), measurements);
  return pass(oracle, `metadata matches golden (${gotTracks.length} track(s))`, measurements);
}

function compareTrack(i: number, a: NormalizedTrack, b: NormalizedTrack): string[] {
  const d: string[] = [];
  const p = `track[${i}]`;
  if (a.type !== b.type) d.push(`${p}.type: '${a.type}' vs '${b.type}'`);
  if (normStr(a.codec) !== normStr(b.codec)) d.push(`${p}.codec: '${a.codec}' vs '${b.codec}'`);
  // dims (video)
  if (b.width != null && a.width !== b.width) d.push(`${p}.width: ${a.width} vs ${b.width}`);
  if (b.height != null && a.height !== b.height) d.push(`${p}.height: ${a.height} vs ${b.height}`);
  // fps with small fractional tolerance (29.97 vs 30000/1001 rounding)
  if (b.fps != null && a.fps != null && Math.abs(a.fps - b.fps) > 0.05) {
    d.push(`${p}.fps: ${a.fps} vs ${b.fps}`);
  } else if (b.fps != null && a.fps == null) {
    d.push(`${p}.fps: null vs ${b.fps}`);
  }
  // audio
  if (b.sampleRate != null && a.sampleRate !== b.sampleRate) {
    d.push(`${p}.sampleRate: ${a.sampleRate} vs ${b.sampleRate}`);
  }
  if (b.channels != null && a.channels !== b.channels) {
    d.push(`${p}.channels: ${a.channels} vs ${b.channels}`);
  }
  return d;
}

// ── golden-packets ───────────────────────────────────────────────────────────────────────────

function goldenPackets(ctx: OracleContext, t: Required<OracleTolerances>): OracleOutcome {
  const oracle: OracleId = 'golden-packets';
  const got = ctx.demux?.packets;
  const want = ctx.golden.packets;
  if (!got) return fail(oracle, 'no demux packets on ctx.demux.packets');
  if (!want) return fail(oracle, 'no golden packets (fixtures/golden/<id>.packets.json absent)');

  const diffs: string[] = [];
  const measurements: Record<string, number> = {
    measuredCount: got.length,
    goldenCount: want.length,
  };

  if (got.length !== want.length) {
    diffs.push(`packet count: measured ${got.length} vs golden ${want.length}`);
  }

  // trackIndex layout: the multiset of track indices must match
  const gotLayout = trackLayout(got);
  const wantLayout = trackLayout(want);
  if (!sameLayout(gotLayout, wantLayout)) {
    diffs.push(
      `trackIndex layout: measured ${JSON.stringify(gotLayout)} vs golden ${JSON.stringify(
        wantLayout,
      )}`,
    );
  }

  // ORDER-INDEPENDENT, PER-TRACK comparison. Golden (ffprobe) lists packets interleaved by dts across
  // tracks; an engine may yield them grouped per-track. So group BOTH sides by trackIndex, sort each
  // group by dts then pts, and compare position-by-position within the track. Sizes + keyframe flags
  // must match exactly. Timestamps are compared offset-tolerantly: a CONSTANT per-track origin shift
  // (ffprobe exposes raw container priming / edit-list pts, e.g. -21333µs, while an engine may apply
  // the edit list and start at 0) is allowed; a VARYING residual is a real inter-packet timing error.
  const tsTolUs = t.seekToleranceUs; // reuse 1ms as the "small" packet ts tolerance
  const byTrack = (ps: PacketInfo[]): Map<number, PacketInfo[]> => {
    const m = new Map<number, PacketInfo[]>();
    for (const p of ps) {
      let g = m.get(p.trackIndex);
      if (!g) {
        g = [];
        m.set(p.trackIndex, g);
      }
      g.push(p);
    }
    for (const g of m.values()) g.sort((x, y) => x.dtsUs - y.dtsUs || x.ptsUs - y.ptsUs);
    return m;
  };
  const gotByTrack = byTrack(got);
  const wantByTrack = byTrack(want);

  let sizeMismatch = 0;
  let kfMismatch = 0;
  let ptsDrift = 0;
  let dtsDrift = 0;
  let comparedTracks = 0;
  let maxPtsDriftUs = 0;
  for (const [trackIndex, wantTrack] of wantByTrack) {
    const gotTrack = gotByTrack.get(trackIndex) ?? [];
    const m = Math.min(gotTrack.length, wantTrack.length);
    if (m === 0) continue;
    comparedTracks++;
    // Per-track constant offset, taken from the first aligned packet (origin alignment).
    const ptsOffset = gotTrack[0]!.ptsUs - wantTrack[0]!.ptsUs;
    const dtsOffset = gotTrack[0]!.dtsUs - wantTrack[0]!.dtsUs;
    for (let i = 0; i < m; i++) {
      const a = gotTrack[i]!;
      const b = wantTrack[i]!;
      if (a.size !== b.size) sizeMismatch++;
      if (!!a.keyframe !== !!b.keyframe) kfMismatch++;
      const ptsResid = Math.abs(a.ptsUs - b.ptsUs - ptsOffset);
      const dtsResid = Math.abs(a.dtsUs - b.dtsUs - dtsOffset);
      if (ptsResid > maxPtsDriftUs) maxPtsDriftUs = ptsResid;
      if (ptsResid > tsTolUs) ptsDrift++;
      if (dtsResid > tsTolUs) dtsDrift++;
    }
  }
  measurements.comparedTracks = comparedTracks;
  measurements.maxPtsDriftUs = maxPtsDriftUs;
  if (sizeMismatch) diffs.push(`${sizeMismatch} packets had a size mismatch`);
  if (kfMismatch) diffs.push(`${kfMismatch} packets had a keyframe-flag mismatch`);
  if (ptsDrift) diffs.push(`${ptsDrift} packets pts drift beyond ±${tsTolUs}µs after per-track origin alignment`);
  if (dtsDrift) diffs.push(`${dtsDrift} packets dts drift beyond ±${tsTolUs}µs after per-track origin alignment`);

  if (diffs.length) return fail(oracle, diffs.join('; '), measurements);
  return pass(oracle, `packet table matches golden (${got.length} packets)`, measurements);
}

function trackLayout(pkts: Array<{ trackIndex: number }>): Record<number, number> {
  const m: Record<number, number> = {};
  for (const p of pkts) m[p.trackIndex] = (m[p.trackIndex] ?? 0) + 1;
  return m;
}
function sameLayout(a: Record<number, number>, b: Record<number, number>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if ((a[Number(k)] ?? 0) !== (b[Number(k)] ?? 0)) return false;
  }
  return true;
}

// ── decoded-frames-bitexact ──────────────────────────────────────────────────────────────────

async function decodedFramesBitexact(ctx: OracleContext): Promise<OracleOutcome> {
  const oracle: OracleId = 'decoded-frames-bitexact';
  if (!ctx.output) return fail(oracle, 'no ctx.output bytes to decode');
  const want = ctx.golden.frames;
  if (!want || !want.length) {
    return fail(oracle, 'no golden frame digests (fixtures/golden/<id>.frames.json absent/empty)');
  }
  const sink = await ctx.decodeWithPlatform(ctx.output, { maxFrames: want.length });
  return compareDigests(oracle, sink.frames, want);
}

/** Compare a decoded sink's digests against golden digests, matched by index (then ptsUs fallback). */
function compareDigests(
  oracle: OracleId,
  got: FrameDigest[],
  want: FrameDigest[],
): OracleOutcome {
  const measurements: Record<string, number> = {
    measuredFrames: got.length,
    goldenFrames: want.length,
  };
  if (!got.length) return fail(oracle, 'platform decode produced 0 frames', measurements);

  const byIndex = new Map<number, FrameDigest>();
  for (const f of got) byIndex.set(f.index, f);

  const diffs: string[] = [];
  let compared = 0;
  let mismatches = 0;
  for (const w of want) {
    const g = byIndex.get(w.index) ?? matchByPts(got, w.ptsUs);
    if (!g) {
      diffs.push(`frame index ${w.index} (pts ${w.ptsUs}µs) missing from decode`);
      continue;
    }
    compared++;
    if (normHex(g.sha256) !== normHex(w.sha256)) {
      mismatches++;
      if (diffs.length < 6) {
        diffs.push(
          `frame ${w.index}: sha256 ${shortHex(g.sha256)} vs golden ${shortHex(w.sha256)}`,
        );
      }
    }
  }
  measurements.comparedFrames = compared;
  measurements.mismatchedFrames = mismatches;

  if (compared === 0) return fail(oracle, `no overlapping frames to compare; ${diffs.join('; ')}`, measurements);
  if (mismatches > 0 || diffs.length) {
    return fail(oracle, `${mismatches}/${compared} frame digests differ; ${diffs.join('; ')}`, measurements);
  }
  return pass(oracle, `${compared} frame digest(s) bit-exact vs golden`, measurements);
}

function matchByPts(got: FrameDigest[], ptsUs: number): FrameDigest | undefined {
  let best: FrameDigest | undefined;
  let bestD = Infinity;
  for (const f of got) {
    const d = Math.abs(f.ptsUs - ptsUs);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  // only accept a pts match if within ~half a frame at 24fps (~21ms); otherwise treat as missing
  return bestD <= 21000 ? best : undefined;
}

// ── reference-reimport ───────────────────────────────────────────────────────────────────────

async function referenceReimport(ctx: OracleContext): Promise<OracleOutcome> {
  const oracle: OracleId = 'reference-reimport';
  if (!ctx.output) return fail(oracle, 'no ctx.output bytes to re-import');
  if (!ctx.referenceEngine) return fail(oracle, 'no ctx.referenceEngine injected');

  const reInput = bytesToInput(ctx.output, ctx.input.id + '.reimport');
  let demux: DemuxResult;
  try {
    demux = await ctx.referenceEngine.demux(reInput);
  } catch (err) {
    return fail(oracle, `reference engine failed to demux engine output: ${errMsg(err)}`);
  }
  const pkts = demux.packets ?? [];
  const measurements: Record<string, number> = {
    reimportPackets: pkts.length,
    reimportKeyframes: pkts.filter((p) => p.keyframe).length,
  };
  if (pkts.length === 0) {
    return fail(oracle, 'reference re-import produced an empty packet table', measurements);
  }
  // Consistency check vs golden packet count/keyframes when available (otherwise just "round-trips").
  const want = ctx.golden.packets;
  if (want && want.length) {
    const goldKf = want.filter((p) => p.keyframe).length;
    const diffs: string[] = [];
    // counts may differ slightly after remux (e.g. edit lists); flag only large divergence
    if (!withinRel(pkts.length, want.length, 0.02, 1)) {
      diffs.push(`packet count: reimport ${pkts.length} vs golden ${want.length}`);
    }
    if (measurements.reimportKeyframes !== goldKf) {
      diffs.push(`keyframes: reimport ${measurements.reimportKeyframes} vs golden ${goldKf}`);
    }
    if (diffs.length) return fail(oracle, diffs.join('; '), measurements);
  }
  return pass(
    oracle,
    `reference re-imported engine output: ${pkts.length} packets, ${measurements.reimportKeyframes} keyframes`,
    measurements,
  );
}

// ── playback-smoke ───────────────────────────────────────────────────────────────────────────

async function playbackSmoke(ctx: OracleContext): Promise<OracleOutcome> {
  const oracle: OracleId = 'playback-smoke';
  if (!ctx.output) return fail(oracle, 'no ctx.output bytes for playback');
  const ok = await ctx.playbackSmoke(ctx.output);
  if (ok) return pass(oracle, '<video> played a few frames of the output');
  return fail(oracle, '<video> playback did not advance / failed to play the output');
}

// ── ssim-psnr ────────────────────────────────────────────────────────────────────────────────

async function ssimPsnr(ctx: OracleContext, t: Required<OracleTolerances>): Promise<OracleOutcome> {
  const oracle: OracleId = 'ssim-psnr';
  if (!ctx.output) return fail(oracle, 'no ctx.output bytes to decode for SSIM/PSNR');

  const golden = ctx.golden;
  const want = golden.frames;
  const refSigs = golden.ssimRef;
  if ((!want || !want.length) && (!refSigs || !refSigs.length)) {
    return fail(oracle, 'no golden reference frames/sigs for SSIM/PSNR (frames.json + ssim.json absent)');
  }

  const maxFrames = Math.max(want?.length ?? 0, refSigs?.length ?? 0) || undefined;
  const sink = await ctx.decodeWithPlatform(ctx.output, { maxFrames });
  if (!sink.frames.length) return fail(oracle, 'platform decode produced 0 frames');

  // Pair candidate frames with golden references by index. Two modes:
  //  (A) full-pixel SSIM/PSNR when getPixels is available AND golden ships pixels (not committed
  //      here — golden never carries raw media), so in practice we use:
  //  (B) downsampled-luma-signature SSIM (global) when ssim.json provides per-frame luma sigs, and
  //      digest equality as the PSNR proxy (Infinity if the normalized RGBA digest matches → the
  //      frame is identical → PSNR is +∞; otherwise we cannot compute true RGB PSNR without golden
  //      pixels, so we report the per-frame SSIM and fall back to digest-equality for the PSNR gate).
  const pairs = Math.min(
    sink.frames.length,
    want?.length ?? refSigs?.length ?? sink.frames.length,
  );
  if (pairs === 0) return fail(oracle, 'no paired frames to compare');

  let ssimSum = 0;
  let ssimCount = 0;
  let minSsim = 1;
  let exactCount = 0;
  const havePixels = typeof sink.getPixels === 'function';

  for (let i = 0; i < pairs; i++) {
    const cand = sink.frames[i]!;
    // digest equality → identical normalized frame → SSIM 1 / PSNR ∞
    if (want && want[i] && normHex(cand.sha256) === normHex(want[i]!.sha256)) {
      exactCount++;
      ssimSum += 1;
      ssimCount++;
      continue;
    }
    // SSIM via downsampled luma signature if golden provides one and we can derive ours
    if (refSigs && refSigs[i] && havePixels) {
      const px = await sink.getPixels!(i);
      const candSig = downsampleLuma(px, sigSide(refSigs[i]!.length));
      const s = sigSsim(candSig, refSigs[i]!);
      ssimSum += s;
      ssimCount++;
      if (s < minSsim) minSsim = s;
    } else if (refSigs && refSigs[i] && !havePixels) {
      // cannot derive a candidate luma sig without pixels; this pair contributes no SSIM evidence
    }
  }

  const measurements: Record<string, number> = {
    pairs,
    exactFrames: exactCount,
    ssimMean: ssimCount ? ssimSum / ssimCount : 0,
    ssimMin: ssimCount ? minSsim : 0,
  };

  // PSNR: true RGB PSNR requires golden raw pixels (never committed). When every paired frame is
  // digest-identical we report Infinity; otherwise PSNR is reported as unavailable and the gate
  // rests on SSIM. We still surface a measured PSNR when pixels are present on BOTH sides — which
  // is not the case for committed golden — so we document the digest-based proxy here.
  if (exactCount === pairs) {
    measurements.psnrDb = Number.POSITIVE_INFINITY;
    return pass(
      oracle,
      `all ${pairs} paired frames digest-identical (SSIM=1, PSNR=∞)`,
      finiteOnly(measurements),
    );
  }

  if (ssimCount === 0) {
    return fail(
      oracle,
      `cannot compute SSIM: golden ssim sigs ${
        refSigs ? 'present' : 'absent'
      } and decode getPixels ${havePixels ? 'present' : 'absent'} (need both, or digest match)`,
      finiteOnly(measurements),
    );
  }

  const ssimMean = ssimSum / ssimCount;
  const ssimPass = minSsim >= t.ssimMin; // gate on the worst frame, not the mean
  // PSNR gate: without golden pixels we accept when SSIM passes (documented limitation) and mark
  // psnr as not-measured; if the runner injects a pixel-bearing golden in future, replace below.
  const detail = ssimPass
    ? `SSIM min ${minSsim.toFixed(4)} ≥ ${t.ssimMin} (mean ${ssimMean.toFixed(4)}) over ${ssimCount} frame(s); PSNR via golden pixels unavailable (digest proxy: ${exactCount}/${pairs} exact)`
    : `SSIM min ${minSsim.toFixed(4)} < ${t.ssimMin} (mean ${ssimMean.toFixed(4)}); ${exactCount}/${pairs} frames digest-exact`;

  return ssimPass
    ? pass(oracle, detail, finiteOnly(measurements))
    : fail(oracle, detail, finiteOnly(measurements));
}

// ── alpha-plane ──────────────────────────────────────────────────────────────────────────────

async function alphaPlane(ctx: OracleContext): Promise<OracleOutcome> {
  const oracle: OracleId = 'alpha-plane';
  if (!ctx.output) return fail(oracle, 'no ctx.output bytes to decode for alpha comparison');

  // Compare the alpha channel separately from color. We need candidate pixels (from platform decode)
  // and a golden reference. Golden carries frame digests; a dedicated alpha digest is encoded by
  // digestFrame over the alpha-only plane when the bake emits one (frames[i].sha256 of the alpha
  // image). Absent golden pixels, we verify alpha presence + that decoded frames have a non-trivial
  // alpha channel, and bit-exact alpha via the frame digest when the golden was baked alpha-only.
  const want = ctx.golden.frames;
  const sink = await ctx.decodeWithPlatform(ctx.output, { maxFrames: want?.length });
  if (!sink.frames.length) return fail(oracle, 'platform decode produced 0 frames');
  if (typeof sink.getPixels !== 'function') {
    return fail(oracle, 'decode sink did not expose getPixels; cannot inspect alpha plane');
  }

  let maxMeanAbsDiff = 0;
  let framesWithAlpha = 0;
  const pairs = Math.min(sink.frames.length, want?.length ?? sink.frames.length);
  const measurements: Record<string, number> = { pairs };

  for (let i = 0; i < pairs; i++) {
    const px = await sink.getPixels(i);
    const alpha = extractAlpha(px);
    if (alpha.nonOpaque) framesWithAlpha++;

    // If golden ships a per-frame alpha digest (sha256 of the alpha-as-grayscale RGBA), compare it.
    const w = want?.[i];
    if (w) {
      const alphaDigest = await sha256Hex(alpha.asRgbaBuffer);
      if (normHex(alphaDigest) === normHex(w.sha256)) {
        // exact alpha match → meanAbsDiff 0 for this frame
        continue;
      }
      // not a digest match → we can only bound the diff if golden had pixels (it does not),
      // so record that this frame's alpha digest diverged from golden.
      maxMeanAbsDiff = Math.max(maxMeanAbsDiff, 1); // sentinel: digest differs
    }
  }

  measurements.framesWithAlpha = framesWithAlpha;
  measurements.maxAlphaMeanAbsDiff = maxMeanAbsDiff;

  if (framesWithAlpha === 0) {
    return fail(oracle, `no frame exposed a non-opaque alpha channel over ${pairs} frame(s)`, measurements);
  }
  if (want && maxMeanAbsDiff > 0) {
    return fail(
      oracle,
      `alpha plane diverged from golden on at least one frame (digest mismatch)`,
      measurements,
    );
  }
  return pass(
    oracle,
    `alpha plane present on ${framesWithAlpha}/${pairs} frame(s)` +
      (want ? ' and bit-exact vs golden' : ' (no golden alpha to compare; presence verified)'),
    measurements,
  );
}

// ── seek-accuracy ────────────────────────────────────────────────────────────────────────────

function seekAccuracy(ctx: OracleContext, t: Required<OracleTolerances>): OracleOutcome {
  const oracle: OracleId = 'seek-accuracy';
  const seek = ctx.seek;
  if (!seek) return fail(oracle, 'no ctx.seek result (landedPtsUs/frame)');

  // Expected landing pts: from scenario options.tUs/targetUs, else from the seek frame's golden.
  const requestedUs = readNumberOption(ctx.scenario.options, ['tUs', 'targetUs', 'timeUs', 'atUs']);
  const measurements: Record<string, number> = { landedPtsUs: seek.landedPtsUs };

  // Find the expected keyframe in golden: the latest keyframe at or before the requested time.
  const want = ctx.golden;
  let expectedFrame: FrameDigest | undefined;
  let expectedPtsUs: number | undefined;

  if (requestedUs != null && want.packets && want.packets.length) {
    const kf = keyframeAtOrBefore(want.packets, requestedUs);
    if (kf) {
      expectedPtsUs = kf.ptsUs;
      expectedFrame = (want.frames ?? []).find((f) => Math.abs(f.ptsUs - kf.ptsUs) <= 1000);
    }
  }
  // Fallback: golden seek frame matching landed pts.
  if (!expectedFrame && want.frames) {
    expectedFrame = want.frames.find((f) => Math.abs(f.ptsUs - seek.landedPtsUs) <= t.seekToleranceUs);
    if (expectedFrame) expectedPtsUs = expectedFrame.ptsUs;
  }

  const diffs: string[] = [];

  if (expectedPtsUs != null) {
    const d = Math.abs(seek.landedPtsUs - expectedPtsUs);
    measurements.seekDeltaUs = d;
    measurements.expectedPtsUs = expectedPtsUs;
    if (d > t.seekToleranceUs) {
      diffs.push(
        `landed ${seek.landedPtsUs}µs vs expected keyframe ${expectedPtsUs}µs (Δ ${d}µs > ${t.seekToleranceUs}µs)`,
      );
    }
  } else if (requestedUs != null) {
    diffs.push('could not resolve expected keyframe from golden packets/frames');
  }

  // frame digest must match golden for the landed frame
  if (expectedFrame) {
    if (normHex(seek.frame.sha256) !== normHex(expectedFrame.sha256)) {
      diffs.push(
        `landed frame sha256 ${shortHex(seek.frame.sha256)} vs golden ${shortHex(expectedFrame.sha256)}`,
      );
    }
  } else if (want.frames && want.frames.length) {
    diffs.push('no golden frame matched the landed pts for digest comparison');
  }

  if (diffs.length) return fail(oracle, diffs.join('; '), measurements);
  return pass(oracle, `seek landed on expected keyframe within ${t.seekToleranceUs}µs, frame digest matches`, measurements);
}

function keyframeAtOrBefore(pkts: PacketInfo[], tUs: number): PacketInfo | undefined {
  let best: PacketInfo | undefined;
  for (const p of pkts) {
    if (p.keyframe && p.ptsUs <= tUs && (!best || p.ptsUs > best.ptsUs)) best = p;
  }
  // if nothing at-or-before, the earliest keyframe is the expected landing (seek before first KF)
  if (!best) {
    for (const p of pkts) {
      if (p.keyframe && (!best || p.ptsUs < best.ptsUs)) best = p;
    }
  }
  return best;
}

// ── trim-boundaries ──────────────────────────────────────────────────────────────────────────

async function trimBoundaries(ctx: OracleContext, t: Required<OracleTolerances>): Promise<OracleOutcome> {
  const oracle: OracleId = 'trim-boundaries';
  if (!ctx.output) return fail(oracle, 'no ctx.output bytes from trim');

  // Requested duration from scenario.options.range { startUs, endUs }.
  const range = readRange(ctx.scenario.options);
  const diffs: string[] = [];
  const measurements: Record<string, number> = {};

  // Probe the trimmed output via the reference engine if available (browser-pure: reference engine
  // is a browser library), else decode and use frame pts span as a duration proxy.
  let outDurationSec: number | undefined;
  if (ctx.referenceEngine) {
    try {
      const meta = await ctx.referenceEngine.probe(bytesToInput(ctx.output, ctx.input.id + '.trim'));
      if (meta.durationSec != null) outDurationSec = meta.durationSec;
    } catch {
      /* fall through to frame-span proxy */
    }
  }

  const sink = await ctx.decodeWithPlatform(ctx.output, { maxFrames: 4096 });
  if (outDurationSec == null && sink.frames.length >= 2) {
    const first = sink.frames[0]!.ptsUs;
    const last = sink.frames[sink.frames.length - 1]!.ptsUs;
    outDurationSec = (last - first) / 1e6;
  }

  if (range && outDurationSec != null) {
    const requestedSec = (range.endUs - range.startUs) / 1e6;
    const d = Math.abs(outDurationSec - requestedSec);
    measurements.outDurationSec = outDurationSec;
    measurements.requestedDurationSec = requestedSec;
    measurements.durationDeltaSec = d;
    if (d > t.durationToleranceSec) {
      diffs.push(
        `duration: out ${outDurationSec.toFixed(4)}s vs requested ${requestedSec.toFixed(
          4,
        )}s (Δ ${d.toFixed(4)}s > ${t.durationToleranceSec.toFixed(4)}s)`,
      );
    }
  } else if (outDurationSec == null) {
    diffs.push('could not determine output duration (no reference probe, <2 decoded frames)');
  }

  // Boundary frame digests vs golden: first and last decoded frames must match golden boundaries.
  const want = ctx.golden.frames;
  if (want && want.length && sink.frames.length) {
    const firstGot = sink.frames[0]!;
    const lastGot = sink.frames[sink.frames.length - 1]!;
    const firstWant = want[0]!;
    const lastWant = want[want.length - 1]!;
    if (normHex(firstGot.sha256) !== normHex(firstWant.sha256)) {
      diffs.push(`start boundary frame ${shortHex(firstGot.sha256)} vs golden ${shortHex(firstWant.sha256)}`);
    }
    if (normHex(lastGot.sha256) !== normHex(lastWant.sha256)) {
      diffs.push(`end boundary frame ${shortHex(lastGot.sha256)} vs golden ${shortHex(lastWant.sha256)}`);
    }
  }

  if (diffs.length) return fail(oracle, diffs.join('; '), measurements);
  return pass(oracle, 'trim duration within tolerance and boundary frames match golden', measurements);
}

function readRange(options: unknown): { startUs: number; endUs: number } | undefined {
  if (!isObject(options)) return undefined;
  const r = (options as Record<string, unknown>).range ?? options;
  if (!isObject(r)) return undefined;
  const startUs = Number((r as Record<string, unknown>).startUs);
  const endUs = Number((r as Record<string, unknown>).endUs);
  if (Number.isFinite(startUs) && Number.isFinite(endUs)) return { startUs, endUs };
  return undefined;
}

// ── decrypt-bitexact ─────────────────────────────────────────────────────────────────────────

async function decryptBitexact(ctx: OracleContext): Promise<OracleOutcome> {
  const oracle: OracleId = 'decrypt-bitexact';
  if (!ctx.output) return fail(oracle, 'no ctx.output (decrypted) bytes to decode');
  const want = ctx.golden.frames;
  if (!want || !want.length) {
    return fail(oracle, 'no golden frame digests for decrypt comparison (frames.json absent)');
  }
  const sink = await ctx.decodeWithPlatform(ctx.output, { maxFrames: want.length });
  const out = compareDigests(oracle, sink.frames, want);
  // Re-label the detail to the decrypt context while preserving pass/fail + measurements.
  return { ...out, oracle };
}

// ── graceful-failure ─────────────────────────────────────────────────────────────────────────

/**
 * PASS iff the operation already threw/rejected (handled cleanly within the timeout, no
 * crash/hang/OOM). The runner signals this via the scenario notes / a marker on ctx.scenario.notes
 * or by leaving ctx.output undefined together with a recorded error. We read the signal:
 *   - ctx.scenario.notes containing a status token: 'graceful' | 'threw' | 'rejected' | 'error' →
 *     PASS;  'crash' | 'hang' | 'timeout' | 'oom' → FAIL.
 *   - else: if the op produced NO output for a robustness/malformed scenario, infer it failed
 *     gracefully (the runner caught the throw and routed here) → PASS; if it produced output for a
 *     known-malformed input, that is suspicious → FAIL ("did not reject malformed input").
 */
function gracefulFailure(ctx: OracleContext, _t: Required<OracleTolerances>): OracleOutcome {
  const oracle: OracleId = 'graceful-failure';
  const notes = (ctx.scenario.notes ?? '').toLowerCase();

  const badTokens = ['crash', 'hang', 'timeout', 'oom', 'out-of-memory'];
  for (const tok of badTokens) {
    if (notes.includes(tok)) {
      return fail(oracle, `runner reported '${tok}' on malformed input (not graceful)`);
    }
  }
  const goodTokens = ['graceful', 'threw', 'rejected', 'rejection', 'errored', 'handled'];
  for (const tok of goodTokens) {
    if (notes.includes(tok)) {
      return pass(oracle, `malformed input handled gracefully (signal: '${tok}')`);
    }
  }

  // No explicit signal: infer from output presence for a robustness/malformed scenario.
  const isRobustness = ctx.scenario.family === 'robustness' || !!ctx.scenario.mutate;
  if (isRobustness) {
    if (!ctx.output && !ctx.metadata && !ctx.demux && !ctx.frames) {
      return pass(oracle, 'operation produced no output and did not crash/hang → handled gracefully');
    }
    return fail(
      oracle,
      'operation produced output from malformed/mutated input (expected a clean throw/reject)',
    );
  }
  return fail(
    oracle,
    'graceful-failure has no runner signal (ctx.scenario.notes) and scenario is not robustness/mutated',
  );
}

// ── property-invariant (metamorphic, §11) ──────────────────────────────────────────────────────

/**
 * Compute a metamorphic invariant in-browser using the injected helpers + frame digests. The
 * specific invariant is selected by scenario.options.invariant (or notes):
 *   - 'decode-remux'     : decode(remux(x)) == decode(x)            (frame digests equal)
 *   - 'probe-duration'   : probe durations equal across containers  (golden meta vs out via reference probe)
 *   - 'trim-concat'      : trim(a..b) ++ trim(b..c) ≈ trim(a..c)    (boundary digests / duration equal)
 * For the cross-frame digest invariants we compare the engine output (ctx.output) decoded by the
 * platform against the golden decode of the source (golden.frames) — that golden IS decode(x) baked
 * offline, so decode(remux(x)) == decode(x) reduces to "output frames == golden frames".
 */
async function propertyInvariant(ctx: OracleContext, t: Required<OracleTolerances>): Promise<OracleOutcome> {
  const oracle: OracleId = 'property-invariant';
  const which = (readStringOption(ctx.scenario.options, ['invariant', 'property']) ??
    inferInvariant(ctx.scenario)).toLowerCase();

  if (which.includes('decode') || which.includes('remux')) {
    // decode(remux(x)) == decode(x): output frame digests must equal golden source-decode digests.
    if (!ctx.output) return fail(oracle, `[${which}] no ctx.output to decode`);
    const want = ctx.golden.frames;
    if (!want || !want.length) {
      return fail(oracle, `[${which}] no golden frames = decode(x) to compare against`);
    }
    const sink = await ctx.decodeWithPlatform(ctx.output, { maxFrames: want.length });
    const out = compareDigests(oracle, sink.frames, want);
    return {
      ...out,
      detail: `[invariant decode(remux(x))==decode(x)] ${out.detail ?? ''}`.trim(),
    };
  }

  if (which.includes('duration') || which.includes('probe')) {
    // probe(out).dur ≈ probe(x).dur (golden) across containers.
    if (!ctx.output) return fail(oracle, `[${which}] no ctx.output to probe`);
    const goldenDur = ctx.golden.meta?.durationSec ?? ctx.metadata?.durationSec ?? null;
    if (goldenDur == null) return fail(oracle, `[${which}] no golden/source duration to compare`);
    let outDur: number | null = null;
    if (ctx.referenceEngine) {
      try {
        const meta = await ctx.referenceEngine.probe(bytesToInput(ctx.output, ctx.input.id + '.inv'));
        outDur = meta.durationSec;
      } catch (err) {
        return fail(oracle, `[${which}] reference probe of output failed: ${errMsg(err)}`);
      }
    } else {
      return fail(oracle, `[${which}] no reference engine to probe output duration`);
    }
    if (outDur == null) return fail(oracle, `[${which}] output probe returned null duration`);
    const d = Math.abs(outDur - goldenDur);
    const measurements = { outDurationSec: outDur, goldenDurationSec: goldenDur, deltaSec: d };
    if (d > t.durationToleranceSec) {
      return fail(
        oracle,
        `[invariant probe(out).dur≈probe(x).dur] out ${outDur.toFixed(4)}s vs ${goldenDur.toFixed(
          4,
        )}s (Δ ${d.toFixed(4)}s > ${t.durationToleranceSec.toFixed(4)}s)`,
        measurements,
      );
    }
    return pass(
      oracle,
      `[invariant probe duration across containers] Δ ${d.toFixed(4)}s ≤ ${t.durationToleranceSec.toFixed(4)}s`,
      measurements,
    );
  }

  if (which.includes('trim') || which.includes('concat')) {
    // trim(a..b)++trim(b..c) ≈ trim(a..c): compare output decode to golden (the baked a..c decode).
    if (!ctx.output) return fail(oracle, `[${which}] no ctx.output to decode`);
    const want = ctx.golden.frames;
    if (!want || !want.length) return fail(oracle, `[${which}] no golden frames for trim-concat`);
    const sink = await ctx.decodeWithPlatform(ctx.output, { maxFrames: want.length });
    const out = compareDigests(oracle, sink.frames, want);
    return { ...out, detail: `[invariant trim concat ≈ direct trim] ${out.detail ?? ''}`.trim() };
  }

  return fail(oracle, `unknown property-invariant '${which}' (expected decode-remux | probe-duration | trim-concat)`);
}

function inferInvariant(s: Scenario): string {
  if (s.op === 'remux') return 'decode-remux';
  if (s.op === 'trim') return 'trim-concat';
  if (s.op === 'probe') return 'probe-duration';
  return 'decode-remux';
}

// ── digestFrame / SSIM / PSNR (pure pixel utilities) ───────────────────────────────────────────

/**
 * Normalize an ImageData to a tight, top-left-origin, non-premultiplied RGBA buffer and return its
 * sha256 hex. "Tight" = the RGBA bytes packed row-major with stride === width*4 (ImageData already
 * guarantees this; we copy to a fresh buffer so any view offset/stride is dropped). We do NOT alter
 * channel values: ImageData is canonically straight (non-premultiplied) alpha in the browser, so
 * the bytes are used as-is. This makes the digest engine-independent: any engine that yields the
 * same visible pixels yields the same hash.
 */
export async function digestFrame(img: ImageData, index: number, ptsUs: number): Promise<FrameDigest> {
  const tight = tightRgba(img);
  const sha256 = await sha256Hex(tight);
  return { index, ptsUs, sha256, width: img.width, height: img.height };
}

/** Copy ImageData pixels into a fresh tight RGBA Uint8Array (drops any backing-buffer offset). */
function tightRgba(img: ImageData): Uint8Array {
  const src = img.data; // Uint8ClampedArray, length = width*height*4, row-major, straight alpha
  const out = new Uint8Array(img.width * img.height * 4);
  out.set(src.subarray(0, out.length));
  return out;
}

/**
 * Luma SSIM in [0,1]. We use 8×8 non-overlapping windows (Wang et al. 2004 constants C1/C2 for an
 * 8-bit dynamic range) and average the per-window SSIM (MSSIM). Windows are computed on the luma
 * plane (Rec.601: Y = 0.299R + 0.587G + 0.114B). If the two images differ in size we resize-compare
 * on the overlapping top-left region (and penalize the size mismatch by clamping the score down).
 * Choice rationale: 8×8 windowed MSSIM is the standard structural metric and is robust to small
 * global luminance/contrast shifts that bit-exact digests would over-reject for lossy transcode.
 */
export function ssim(a: ImageData, b: ImageData): number {
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  if (w === 0 || h === 0) return 0;
  const ya = lumaPlane(a, w, h);
  const yb = lumaPlane(b, w, h);

  const L = 255;
  const C1 = (0.01 * L) ** 2;
  const C2 = (0.03 * L) ** 2;
  const win = 8;

  let sum = 0;
  let count = 0;
  for (let by = 0; by + win <= h; by += win) {
    for (let bx = 0; bx + win <= w; bx += win) {
      let sa = 0,
        sb = 0,
        saa = 0,
        sbb = 0,
        sab = 0;
      const nWin = win * win;
      for (let y = 0; y < win; y++) {
        const row = (by + y) * w + bx;
        for (let x = 0; x < win; x++) {
          const va = ya[row + x]!;
          const vb = yb[row + x]!;
          sa += va;
          sb += vb;
          saa += va * va;
          sbb += vb * vb;
          sab += va * vb;
        }
      }
      const ma = sa / nWin;
      const mb = sb / nWin;
      const va = saa / nWin - ma * ma;
      const vb = sbb / nWin - mb * mb;
      const cov = sab / nWin - ma * mb;
      const s = ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      sum += s;
      count++;
    }
  }
  if (count === 0) {
    // images smaller than one window: fall back to a single global window
    return globalSsim(ya, yb, C1, C2);
  }
  let score = sum / count;
  // penalize size mismatch (compared region was a crop)
  if (a.width !== b.width || a.height !== b.height) {
    const areaRatio = (w * h) / Math.max(a.width * a.height, b.width * b.height);
    score *= areaRatio;
  }
  return clamp01(score);
}

function globalSsim(ya: Float64Array, yb: Float64Array, C1: number, C2: number): number {
  const n = ya.length;
  let sa = 0,
    sb = 0,
    saa = 0,
    sbb = 0,
    sab = 0;
  for (let i = 0; i < n; i++) {
    sa += ya[i]!;
    sb += yb[i]!;
    saa += ya[i]! * ya[i]!;
    sbb += yb[i]! * yb[i]!;
    sab += ya[i]! * yb[i]!;
  }
  const ma = sa / n,
    mb = sb / n;
  const va = saa / n - ma * ma,
    vb = sbb / n - mb * mb,
    cov = sab / n - ma * mb;
  const s = ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
  return clamp01(s);
}

/**
 * PSNR in dB over the RGB channels (alpha excluded). MSE is the mean squared error across R,G,B of
 * the overlapping top-left region. Returns +Infinity for identical images (MSE === 0).
 */
export function psnrDb(a: ImageData, b: ImageData): number {
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  if (w === 0 || h === 0) return 0;
  const da = a.data;
  const db = b.data;
  const aw = a.width;
  const bw = b.width;
  let se = 0;
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ia = (y * aw + x) * 4;
      const ib = (y * bw + x) * 4;
      for (let c = 0; c < 3; c++) {
        const diff = da[ia + c]! - db[ib + c]!;
        se += diff * diff;
        n++;
      }
    }
  }
  if (n === 0) return 0;
  const mse = se / n;
  if (mse === 0) return Number.POSITIVE_INFINITY;
  return 10 * Math.log10((255 * 255) / mse);
}

function lumaPlane(img: ImageData, w: number, h: number): Float64Array {
  const out = new Float64Array(w * h);
  const d = img.data;
  const iw = img.width;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * iw + x) * 4;
      out[y * w + x] = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
    }
  }
  return out;
}

// ── downsampled-luma signature helpers (for ssim.json comparison) ──────────────────────────────

/** Reduce ImageData to a side×side mean-luma signature (block-averaged). */
function downsampleLuma(img: ImageData, side: number): number[] {
  const out = new Array<number>(side * side).fill(0);
  const counts = new Array<number>(side * side).fill(0);
  const d = img.data;
  const { width, height } = img;
  for (let y = 0; y < height; y++) {
    const sy = Math.min(side - 1, Math.floor((y / height) * side));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(side - 1, Math.floor((x / width) * side));
      const i = (y * width + x) * 4;
      const luma = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
      const o = sy * side + sx;
      out[o]! += luma;
      counts[o]! += 1;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = counts[i] ? out[i]! / counts[i]! : 0;
  return out;
}

/** Square side length implied by a flat signature array (assumes square). */
function sigSide(len: number): number {
  const s = Math.round(Math.sqrt(len));
  return s > 0 ? s : 1;
}

/** Global SSIM between two equal-length luma signatures (treated as one window). */
function sigSsim(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  const L = 255;
  const C1 = (0.01 * L) ** 2;
  const C2 = (0.03 * L) ** 2;
  let sa = 0,
    sb = 0,
    saa = 0,
    sbb = 0,
    sab = 0;
  for (let i = 0; i < n; i++) {
    sa += a[i]!;
    sb += b[i]!;
    saa += a[i]! * a[i]!;
    sbb += b[i]! * b[i]!;
    sab += a[i]! * b[i]!;
  }
  const ma = sa / n,
    mb = sb / n;
  const va = saa / n - ma * ma,
    vb = sbb / n - mb * mb,
    cov = sab / n - ma * mb;
  const s = ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
  return clamp01(s);
}

// ── alpha extraction ───────────────────────────────────────────────────────────────────────────

interface AlphaInfo {
  /** the alpha channel rendered as a grayscale RGBA buffer (A→R=G=B, A=255) for digesting */
  asRgbaBuffer: Uint8Array;
  /** true if any pixel has alpha < 255 (i.e. a meaningful alpha plane exists) */
  nonOpaque: boolean;
}
function extractAlpha(img: ImageData): AlphaInfo {
  const d = img.data;
  const px = img.width * img.height;
  const out = new Uint8Array(px * 4);
  let nonOpaque = false;
  for (let p = 0; p < px; p++) {
    const a = d[p * 4 + 3]!;
    if (a !== 255) nonOpaque = true;
    out[p * 4] = a;
    out[p * 4 + 1] = a;
    out[p * 4 + 2] = a;
    out[p * 4 + 3] = 255;
  }
  return { asRgbaBuffer: out, nonOpaque };
}

// ── small shared helpers ───────────────────────────────────────────────────────────────────────

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('crypto.subtle unavailable; cannot compute sha256 (browser/Worker required)');
  }
  // Copy into a fresh, standalone ArrayBuffer-backed view: guarantees a plain ArrayBuffer (never a
  // SharedArrayBuffer) and drops any byteOffset, satisfying BufferSource across TS lib variants.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy);
  const view = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < view.length; i++) hex += view[i]!.toString(16).padStart(2, '0');
  return hex;
}

/** Build a minimal MediaInput backed by in-memory bytes (for reference re-import / probe). */
function bytesToInput(out: MediaBytes, id: string): MediaInput {
  const bytes = out.bytes;
  // Fresh standalone copy → guaranteed plain ArrayBuffer (never SharedArrayBuffer), no view offset.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const ab = copy.buffer;
  const blob = new Blob([ab], { type: out.mime });
  const url = typeof URL !== 'undefined' && 'createObjectURL' in URL ? URL.createObjectURL(blob) : '';
  return {
    id,
    url,
    mime: out.mime,
    blob: async () => blob,
    arrayBuffer: async () => ab,
  };
}

function pass(oracle: OracleId, detail: string, measurements?: Record<string, number>): OracleOutcome {
  return measurements ? { oracle, pass: true, detail, measurements } : { oracle, pass: true, detail };
}
function fail(oracle: OracleId, detail: string, measurements?: Record<string, number>): OracleOutcome {
  return measurements ? { oracle, pass: false, detail, measurements } : { oracle, pass: false, detail };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function normStr(s: string | undefined | null): string {
  return (s ?? '').trim().toLowerCase();
}
function normHex(h: string): string {
  return h.trim().toLowerCase();
}
function shortHex(h: string): string {
  const n = normHex(h);
  return n.length > 12 ? `${n.slice(0, 8)}…${n.slice(-4)}` : n;
}
function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
function withinRel(a: number, b: number, relTol: number, absTol: number): boolean {
  const diff = Math.abs(a - b);
  return diff <= absTol || diff <= relTol * Math.max(Math.abs(a), Math.abs(b));
}
/** Drop non-finite measurement values (Infinity/NaN) so a measurements bag stays JSON-clean. */
function finiteOnly(m: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(m)) if (Number.isFinite(v)) out[k] = v;
  return out;
}

function readNumberOption(options: unknown, keys: string[]): number | undefined {
  if (!isObject(options)) return undefined;
  for (const k of keys) {
    const v = options[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && Number.isFinite(Number(v))) return Number(v);
  }
  return undefined;
}
function readStringOption(options: unknown, keys: string[]): string | undefined {
  if (!isObject(options)) return undefined;
  for (const k of keys) {
    const v = options[k];
    if (typeof v === 'string' && v.length) return v;
  }
  return undefined;
}
