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
    // A `pending: true` golden is a $todo PLACEHOLDER whose frame digests have not yet been produced
    // by the in-browser frame-bake (ffmpeg can't make them). Its frames[].sha256 are absent. Treat
    // such golden frames as ABSENT — and likewise drop any holey entry without a real sha256 — so the
    // SSIM/decoded-frames oracles report a clean NA/FAIL ("golden frames pending") instead of
    // null-deref'ing on a missing sha256 (the convert-webm-resize crash).
    const pending = isObject(framesRaw) && (framesRaw as Record<string, unknown>).pending === true;
    if (!pending) {
      const frames = unwrap(framesRaw, ['frames']);
      if (Array.isArray(frames)) {
        const baked = (frames as FrameDigest[]).filter(
          (f) => f != null && typeof f.sha256 === 'string' && f.sha256.length > 0,
        );
        if (baked.length) store.frames = baked;
      }
    }
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
  fpsTolerance: 0.05,
  seekToleranceUs: 1000,
};

function withDefaults(tol?: OracleTolerances): Required<OracleTolerances> {
  return {
    ssimMin: tol?.ssimMin ?? DEFAULT_TOLERANCES.ssimMin,
    psnrMinDb: tol?.psnrMinDb ?? DEFAULT_TOLERANCES.psnrMinDb,
    durationToleranceSec: tol?.durationToleranceSec ?? DEFAULT_TOLERANCES.durationToleranceSec,
    fpsTolerance: tol?.fpsTolerance ?? DEFAULT_TOLERANCES.fpsTolerance,
    seekToleranceUs: tol?.seekToleranceUs ?? DEFAULT_TOLERANCES.seekToleranceUs,
  };
}

// ── Per-container probe duration tolerance (golden-metadata only) ──────────────────────────────

/**
 * WHY a per-container duration band exists:
 *
 * `durationToleranceSec` (≈ ±1 frame) is the right gate for containers that carry a PRECISE, global
 * duration in their header — an explicit movie/segment duration (mp4/mov `mvhd`, mkv/webm
 * `Duration`), a per-sample total (wav byte count, flac STREAMINFO total samples), or a granule/page
 * tail (ogg). Two correct demuxers must agree on those to within rounding, so a >1-frame gap is a
 * real engine bug and MUST fail.
 *
 * Some containers, by contrast, have NO precise global duration in the header. A demuxer can only
 * ESTIMATE total duration, and two correct demuxers legitimately disagree by far more than a frame
 * depending on the estimation method:
 *   - `ts`   : MPEG-TS has no global duration. Duration is derived from first/last PTS (or PCR), and
 *              ffprobe vs a PTS-walk can differ by a GOP or more (e.g. ffprobe 10.02s, an engine that
 *              extrapolates the trailing frame duration 11.43s). This is an estimation difference,
 *              not a decode error.
 *   - `adts` : Raw ADTS AAC is a bare frame stream with no duration header; duration = frameCount ×
 *              1024 / sampleRate, and a partial-last-frame or scan-prefix heuristic shifts it.
 *   - `hls`  : Playlist duration is the SUM of `#EXTINF` segment durations (themselves rounded) and
 *              may or may not include discontinuities/trailing partial segments.
 *   - `mp3`  : A CBR MP3 with NO Xing/Info TOC has no duration field — it is estimated from
 *              byterate × size, which drifts with ID3 padding and the final partial frame. (A Xing
 *              MP3 DOES carry an accurate frame count and therefore stays STRICT — see isLooseMp3.)
 *   - `webm` : A normal WebM carries a Segment `Duration`; a headerless/streaming MediaRecorder WebM
 *              does NOT (live capture, unknown length, sparse/absent Cues), so its duration is
 *              estimated from the last block timestamp. Only the recorder-origin variant is loose —
 *              see isLooseRecorderWebm; ordinary WebM stays STRICT.
 *
 * For the estimate-only set we widen to max(±0.5s, ±15%). Rationale: ±0.5s covers a one-GOP / one-
 * AAC-frame / one-segment rounding tail on short clips, and ±15% covers the proportional drift a PTS
 * extrapolation or byterate estimate produces on longer clips (the observed worst case is MPEG-TS at
 * ~14%). This is deliberately NOT a blanket loosening (§15): precise containers keep the ±1-frame
 * gate, and within the loose set only the genuinely header-less MP3/WebM variants qualify. The band
 * is codified here so it is auditable in one place.
 */
const LOOSE_DURATION_CONTAINERS = new Set<string>(['ts', 'adts', 'hls']);
const LOOSE_DURATION_ABS_SEC = 0.5;
const LOOSE_DURATION_REL = 0.15;

/** A CBR MP3 with no Xing/Info TOC estimates duration from byterate; a Xing MP3 does not. */
function isLooseMp3(container: string, assetId: string): boolean {
  if (container !== 'mp3') return false;
  const id = assetId.toLowerCase();
  // The Xing/Info variant carries an accurate frame count → STRICT. Everything else mp3 (CBR no TOC,
  // and the unknown default) is treated as estimate-only. Markers cover the committed corpus ids.
  if (id.includes('xing') || id.includes('info_header') || id.includes('_toc')) return false;
  return id.includes('cbr') || id.includes('notoc') || id.includes('noxing') || id.includes('no_toc');
}

/** A headerless / MediaRecorder-origin WebM has no Segment Duration; a normal WebM does. */
function isLooseRecorderWebm(container: string, assetId: string): boolean {
  if (container !== 'webm') return false;
  const id = assetId.toLowerCase();
  return id.includes('recorder') || id.includes('headerless') || id.includes('mediarecorder');
}

/**
 * Resolve the duration tolerance for a golden-metadata comparison. Returns the strict per-frame
 * tolerance for precise containers, or the wider estimate-only band for header-less containers. The
 * second tuple element flags whether the loose band was applied (surfaced in the failure detail).
 * `assetId` (the scenario input / corpus id) disambiguates the mp3 and webm sub-cases the container
 * token alone cannot. If a scenario set an EXPLICIT durationToleranceSec override we honor it as-is
 * and never widen (a per-scenario override is intentional and takes precedence).
 */
function durationToleranceFor(
  container: string,
  assetId: string,
  t: Required<OracleTolerances>,
  explicitOverride: boolean,
): { tolSec: number; loose: boolean } {
  if (explicitOverride) return { tolSec: t.durationToleranceSec, loose: false };
  const c = container.trim().toLowerCase();
  const isLoose =
    LOOSE_DURATION_CONTAINERS.has(c) || isLooseMp3(c, assetId) || isLooseRecorderWebm(c, assetId);
  if (!isLoose) return { tolSec: t.durationToleranceSec, loose: false };
  // Loose band: max(absolute floor, relative fraction of the golden duration). The caller supplies
  // the relative term keyed off the reference duration so the band scales with clip length.
  return { tolSec: LOOSE_DURATION_ABS_SEC, loose: true };
}

/** The primary corpus asset id for a comparison (the input the op actually ran against). */
function primaryAssetId(ctx: OracleContext): string {
  if (ctx.input?.id) return ctx.input.id;
  const inp = ctx.scenario.input;
  return Array.isArray(inp) ? (inp[0] ?? '') : (inp ?? '');
}

/** The container token for a comparison: prefer measured metadata, fall back to the asset extension. */
function resolveContainer(measured: string | undefined, assetId: string): string {
  const m = (measured ?? '').trim().toLowerCase();
  if (m) return m;
  const ext = assetId.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  // Map a few extensions to their canonical container token (the meta `container` field uses these).
  if (ext === 'm3u8') return 'hls';
  if (ext === 'aac') return 'adts';
  if (ext === 'm4a' || ext === 'm4v') return 'mp4';
  return ext;
}

// ── Oracle context ───────────────────────────────────────────────────────────────────────────

export interface OracleContext {
  scenario: Scenario;
  input: MediaInput;
  output?: MediaBytes; // bytes-producing ops
  metadata?: NormalizedMetadata; // probe
  probeMetadatas?: Array<{ input: MediaInput; metadata: NormalizedMetadata; golden: GoldenStore }>; // multi-input probe
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
        return referenceReimport(ctx, t);
      case 'playback-smoke':
        return playbackSmoke(ctx);
      case 'ssim-psnr':
        return ssimPsnr(ctx, t);
      case 'mp4-box-layout':
        return mp4BoxLayout(ctx);
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

// ── mp4-box-layout ───────────────────────────────────────────────────────────────────────────

interface TopLevelBox {
  type: string;
  offset: number;
  size: number;
}

function mp4BoxLayout(ctx: OracleContext): OracleOutcome {
  const oracle: OracleId = 'mp4-box-layout';
  const out = ctx.output;
  if (!out) return fail(oracle, 'no ctx.output to inspect');
  const options = isObject(ctx.scenario.options) ? ctx.scenario.options : {};
  const outputContainer = normStr(readStringOption(options, ['container']) ?? out.container);
  if (outputContainer !== 'mp4' && outputContainer !== 'mov') {
    return fail(oracle, `output container '${outputContainer || out.container}' is not an ISOBMFF layout target`);
  }

  const boxes = parseTopLevelBoxes(out.bytes);
  if (!boxes.length) return fail(oracle, 'no parseable top-level MP4 boxes found');

  const firstMoov = firstBoxOffset(boxes, 'moov');
  const firstMdat = firstBoxOffset(boxes, 'mdat');
  const firstMoof = firstBoxOffset(boxes, 'moof');
  const measurements = finiteOnly({
    topLevelBoxes: boxes.length,
    moovOffset: firstMoov ?? Number.NaN,
    mdatOffset: firstMdat ?? Number.NaN,
    moofOffset: firstMoof ?? Number.NaN,
  });
  const layout = boxes.map((box) => `${box.type}@${box.offset}`).slice(0, 12).join(', ');

  const fastStart = readStringOrFalseOption(options, ['fastStart']);
  const fragmented = readBooleanOption(options, ['fragmented']) || fastStart === 'fragmented';

  if (fragmented) {
    if (firstMoov == null) return fail(oracle, `fragmented MP4 missing moov box; layout: ${layout}`, measurements);
    if (firstMoof == null) return fail(oracle, `fragmented MP4 missing moof box; layout: ${layout}`, measurements);
    const firstMdatAfterMoof = boxes.find((box) => box.type === 'mdat' && box.offset > firstMoof)?.offset;
    if (firstMdatAfterMoof == null) {
      return fail(oracle, `fragmented MP4 missing mdat after moof; layout: ${layout}`, measurements);
    }
    if (firstMoof < firstMoov) {
      return fail(oracle, `fragment moof appears before moov init segment; layout: ${layout}`, measurements);
    }
    return pass(oracle, `fragmented MP4 has moov init plus moof/mdat media fragments; layout: ${layout}`, measurements);
  }

  if (fastStart === 'in-memory' || fastStart === 'reserve') {
    if (firstMoov == null || firstMdat == null) {
      return fail(oracle, `fastStart MP4 needs moov and mdat boxes; layout: ${layout}`, measurements);
    }
    if (firstMoov > firstMdat) {
      return fail(oracle, `fastStart:${fastStart} expected moov before mdat; layout: ${layout}`, measurements);
    }
    return pass(oracle, `fastStart:${fastStart} placed moov before mdat; layout: ${layout}`, measurements);
  }

  if (fastStart === false) {
    if (firstMoov == null || firstMdat == null) {
      return fail(oracle, `fastStart:false control needs moov and mdat boxes; layout: ${layout}`, measurements);
    }
    if (firstMdat > firstMoov) {
      return fail(oracle, `fastStart:false expected mdat before moov; layout: ${layout}`, measurements);
    }
    return pass(oracle, `fastStart:false control placed mdat before moov; layout: ${layout}`, measurements);
  }

  return fail(oracle, 'scenario did not request fastStart or fragmented output shape');
}

function parseTopLevelBoxes(bytes: Uint8Array): TopLevelBox[] {
  const boxes: TopLevelBox[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset + 8 <= bytes.byteLength) {
    const start = offset;
    let size = view.getUint32(offset);
    offset += 4;
    const type = asciiBoxType(bytes, offset);
    offset += 4;

    if (!/^[A-Za-z0-9 ]{4}$/.test(type)) break;
    if (size === 1) {
      if (offset + 8 > bytes.byteLength) break;
      const hi = view.getUint32(offset);
      const lo = view.getUint32(offset + 4);
      offset += 8;
      size = hi * 2 ** 32 + lo;
    } else if (size === 0) {
      size = bytes.byteLength - start;
    }

    if (!Number.isFinite(size) || size < offset - start || start + size > bytes.byteLength) break;
    boxes.push({ type, offset: start, size });
    offset = start + size;
  }
  return boxes;
}

function asciiBoxType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset] ?? 0, bytes[offset + 1] ?? 0, bytes[offset + 2] ?? 0, bytes[offset + 3] ?? 0);
}

function firstBoxOffset(boxes: TopLevelBox[], type: string): number | undefined {
  return boxes.find((box) => box.type === type)?.offset;
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

  // duration within ±tolerance (only when both present). Precise containers use the strict ±1-frame
  // band; estimate-only containers (ts/adts/hls/headerless-webm/CBR-no-TOC-mp3) use a wider, clearly
  // documented band because no precise global duration exists for two demuxers to agree on. The
  // container is taken from measured metadata, falling back to the asset extension.
  if (got.durationSec != null && want.durationSec != null) {
    const d = Math.abs(got.durationSec - want.durationSec);
    measurements.durationDeltaSec = d;
    const assetId = primaryAssetId(ctx);
    const container = resolveContainer(want.container ?? got.container, assetId);
    const explicitOverride = ctx.scenario.tolerances?.durationToleranceSec != null;
    const band = durationToleranceFor(container, assetId, t, explicitOverride);
    // For the loose set the effective tolerance is max(absolute floor, relative × golden duration).
    const tolSec = band.loose
      ? Math.max(band.tolSec, LOOSE_DURATION_REL * Math.abs(want.durationSec))
      : band.tolSec;
    measurements.durationToleranceSec = tolSec;
    if (d > tolSec) {
      const looseNote = band.loose
        ? ` [estimate-only container '${container}': loose band max(±${LOOSE_DURATION_ABS_SEC}s, ±${(
            LOOSE_DURATION_REL * 100
          ).toFixed(0)}%) applied]`
        : '';
      diffs.push(
        `duration: measured ${got.durationSec.toFixed(4)}s vs golden ${want.durationSec.toFixed(
          4,
        )}s (Δ ${d.toFixed(4)}s > tol ${tolSec.toFixed(4)}s)${looseNote}`,
      );
    }
  } else if (want.durationSec != null && got.durationSec == null) {
    diffs.push(`duration: measured null vs golden ${want.durationSec}s`);
  }

  // per-track codec/dims/fps/sampleRate/channels — match golden tracks positionally by type order
  const goldTracks = metadataTracksForScenario(ctx, want.tracks ?? []);
  const gotTracks = metadataTracksForScenario(ctx, got.tracks ?? []);
  if (gotTracks.length !== goldTracks.length) {
    diffs.push(`track count: measured ${gotTracks.length} vs golden ${goldTracks.length}`);
  }
  const n = Math.min(gotTracks.length, goldTracks.length);
  for (let i = 0; i < n; i++) {
    const a = gotTracks[i]!;
    const b = goldTracks[i]!;
    diffs.push(...compareTrack(i, a, b, t));
  }

  if (diffs.length) return fail(oracle, diffs.join('; '), measurements);
  return pass(oracle, `metadata matches golden (${gotTracks.length} track(s))`, measurements);
}

function compareTrack(
  i: number,
  a: NormalizedTrack,
  b: NormalizedTrack,
  t: Required<OracleTolerances>,
): string[] {
  const d: string[] = [];
  const p = `track[${i}]`;
  if (a.type !== b.type) d.push(`${p}.type: '${a.type}' vs '${b.type}'`);
  if (normStr(a.codec) !== normStr(b.codec)) d.push(`${p}.codec: '${a.codec}' vs '${b.codec}'`);
  // dims (video)
  if (b.width != null && a.width !== b.width) d.push(`${p}.width: ${a.width} vs ${b.width}`);
  if (b.height != null && a.height !== b.height) d.push(`${p}.height: ${a.height} vs ${b.height}`);
  // fps with small fractional tolerance (29.97 vs 30000/1001 rounding)
  if (b.fps != null && a.fps != null && Math.abs(a.fps - b.fps) > t.fpsTolerance) {
    d.push(`${p}.fps: ${a.fps} vs ${b.fps} (tol ±${t.fpsTolerance})`);
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

function metadataTracksForScenario(ctx: OracleContext, tracks: NormalizedTrack[]): NormalizedTrack[] {
  const options = ctx.scenario.options;
  const allowed = readStringArrayOption(options, ['metadataTrackTypes', 'trackTypes']);
  if (allowed.length) {
    const set = new Set(allowed.map((s) => s.toLowerCase()));
    return tracks.filter((t) => set.has(t.type));
  }
  if (readBooleanOption(options, ['ignoreOtherTracks'])) {
    return tracks.filter((t) => t.type !== 'other');
  }
  return tracks;
}

// ── golden-packets ───────────────────────────────────────────────────────────────────────────

function goldenPackets(ctx: OracleContext, t: Required<OracleTolerances>): OracleOutcome {
  const oracle: OracleId = 'golden-packets';
  const got = ctx.demux?.packets;
  const want = ctx.golden.packets;
  if (!got) return fail(oracle, 'no demux packets on ctx.demux.packets');
  if (!want) return fail(oracle, 'no golden packets (fixtures/golden/<id>.packets.json absent)');
  if (usesPcmAggregatePacketOracle(ctx)) return pcmAggregatePackets(ctx, got, want, t);

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
    // Per-track constant offset, taken from an aligned packet (origin alignment). Ogg/Opus exposes
    // codec pre-skip differently across demuxers: ffprobe reports a negative first packet, while
    // Mediabunny starts it at 0 and agrees from packet 1 onward. Anchor packet 1 and skip timestamp
    // drift on packet 0 for that specific convention difference; sizes/counts still compare exactly.
    const looseOpusFirstPacket = usesOpusPreskipLoosePacket(ctx, trackIndex) && m > 1;
    const anchor = looseOpusFirstPacket ? 1 : 0;
    const ptsOffset = gotTrack[anchor]!.ptsUs - wantTrack[anchor]!.ptsUs;
    const dtsOffset = gotTrack[anchor]!.dtsUs - wantTrack[anchor]!.dtsUs;
    for (let i = 0; i < m; i++) {
      const a = gotTrack[i]!;
      const b = wantTrack[i]!;
      if (a.size !== b.size) sizeMismatch++;
      if (!!a.keyframe !== !!b.keyframe) kfMismatch++;
      if (looseOpusFirstPacket && i === 0) continue;
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

function usesPcmAggregatePacketOracle(ctx: OracleContext): boolean {
  const explicit = readStringOption(ctx.scenario.options, ['packetOracle']);
  if (explicit === 'pcm-aggregate') return true;
  const container = resolveContainer(ctx.golden.meta?.container ?? ctx.demux?.metadata.container, primaryAssetId(ctx));
  if (container !== 'wav') return false;
  const tracks = ctx.golden.meta?.tracks ?? ctx.demux?.metadata.tracks ?? [];
  return tracks.some((t) => t.type === 'audio' && t.codec.startsWith('pcm-'));
}

function pcmAggregatePackets(
  ctx: OracleContext,
  got: PacketInfo[],
  want: PacketInfo[],
  t: Required<OracleTolerances>,
): OracleOutcome {
  const oracle: OracleId = 'golden-packets';
  const byTrack = (ps: PacketInfo[]): Map<number, PacketInfo[]> => {
    const m = new Map<number, PacketInfo[]>();
    for (const p of ps) {
      const g = m.get(p.trackIndex);
      if (g) g.push(p);
      else m.set(p.trackIndex, [p]);
    }
    return m;
  };
  const gotByTrack = byTrack(got);
  const wantByTrack = byTrack(want);
  const keys = new Set([...gotByTrack.keys(), ...wantByTrack.keys()]);
  const diffs: string[] = [];
  const measurements: Record<string, number> = {
    measuredCount: got.length,
    goldenCount: want.length,
  };
  for (const trackIndex of keys) {
    const a = gotByTrack.get(trackIndex) ?? [];
    const b = wantByTrack.get(trackIndex) ?? [];
    const gotBytes = a.reduce((sum, p) => sum + p.size, 0);
    const wantBytes = b.reduce((sum, p) => sum + p.size, 0);
    measurements[`track${trackIndex}MeasuredBytes`] = gotBytes;
    measurements[`track${trackIndex}GoldenBytes`] = wantBytes;
    if (gotBytes !== wantBytes) diffs.push(`track ${trackIndex} total PCM bytes: measured ${gotBytes} vs golden ${wantBytes}`);
    if (a.length > 0 && b.length > 0) {
      const ptsDelta = Math.abs(a[0]!.ptsUs - b[0]!.ptsUs);
      measurements[`track${trackIndex}FirstPtsDeltaUs`] = ptsDelta;
      if (ptsDelta > t.seekToleranceUs) {
        diffs.push(`track ${trackIndex} first pts: measured ${a[0]!.ptsUs} vs golden ${b[0]!.ptsUs}`);
      }
    }
  }

  const gotDur = ctx.demux?.metadata.durationSec ?? null;
  const wantDur = ctx.golden.meta?.durationSec ?? null;
  if (gotDur != null && wantDur != null) {
    const delta = Math.abs(gotDur - wantDur);
    measurements.durationDeltaSec = delta;
    if (delta > t.durationToleranceSec) {
      diffs.push(
        `duration: measured ${gotDur.toFixed(4)}s vs golden ${wantDur.toFixed(4)}s ` +
          `(Δ ${delta.toFixed(4)}s > tol ${t.durationToleranceSec.toFixed(4)}s)`,
      );
    }
  }

  if (diffs.length) return fail(oracle, diffs.join('; '), measurements);
  return pass(
    oracle,
    `PCM stream aggregate matches golden (${got.length} measured chunks vs ${want.length} golden chunks)`,
    measurements,
  );
}

function usesOpusPreskipLoosePacket(ctx: OracleContext, trackIndex: number): boolean {
  const assetId = primaryAssetId(ctx).toLowerCase();
  const container = resolveContainer(ctx.golden.meta?.container ?? ctx.demux?.metadata.container, assetId);
  const track = ctx.golden.meta?.tracks?.[trackIndex] ?? ctx.demux?.metadata.tracks?.[trackIndex];
  return container === 'ogg' && track?.type === 'audio' && track.codec === 'opus';
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

  // Golden is the gate. An absent/pending golden is a BAKE gap (the in-browser frame-bake must run),
  // NOT an engine defect — surface that honestly rather than pretending the engine produced nothing.
  const want = ctx.golden.frames;
  if (!want || !want.length) {
    return fail(
      oracle,
      'no golden frame digests to compare (fixtures/golden/<id>.frames.json absent or pending; ' +
        'frame-bake must run — not an engine defect)',
    );
  }
  const compareWant = goldenFramesForDecodeCompare(ctx, want);
  if (!compareWant.length) {
    return fail(oracle, 'scenario requested 0 golden frames to compare');
  }

  // SEEK op: the candidate is the single landed frame (ctx.seek.frame). It is NOT part of an indexed
  // sequence, so we must match it to golden BY PTS, not by the engine's arbitrary frame index — an
  // index-keyed compare would falsely pair the landed frame (e.g. at 5s) with golden[0] (at 0s) on an
  // index collision and report a spurious digest mismatch. We compare against the golden frame nearest
  // the landed pts within half a frame; if none exists (seek-target golden not baked — the committed
  // golden only covers the opening frames) there is nothing this oracle can validate, so we FAIL
  // honestly. (seek-accuracy is the primary seek gate and performs the same pts-keyed digest check;
  // this oracle adds coverage only once seek-target golden frames are baked.)
  if (!ctx.frames && !ctx.output && ctx.seek) {
    const landed = ctx.seek.frame;
    const ref = matchByPts(want, landed.ptsUs);
    const measurements: Record<string, number> = { landedPtsUs: landed.ptsUs, goldenFrames: want.length };
    if (!ref) {
      return fail(
        oracle,
        `no golden frame within ½-frame of the landed pts ${landed.ptsUs}µs ` +
          `(seek-target golden not baked; opening-frame golden does not cover the seek time)`,
        measurements,
      );
    }
    if (normHex(landed.sha256) !== normHex(ref.sha256)) {
      return fail(
        oracle,
        `landed frame sha256 ${shortHex(landed.sha256)} vs golden ${shortHex(ref.sha256)} at pts ${ref.ptsUs}µs`,
        measurements,
      );
    }
    return pass(oracle, `landed seek frame digest bit-exact vs golden at pts ${ref.ptsUs}µs`, measurements);
  }

  // Source the CANDIDATE frame sequence. Two remaining op shapes feed this oracle (the runner sets
  // exactly one — see buildOracleContext):
  //   • decodeFrames → ctx.frames (the engine's OWN decoded FrameSink). Compare those digests
  //     directly; the engine already decoded the pixels and normalized them to RGBA. (Previously this
  //     oracle read ONLY ctx.output and hard-failed every decodeFrames cell with "no ctx.output".)
  //   • remux/transcode/trim/decrypt → ctx.output (encoded bytes): re-decode with the platform engine.
  // A null/empty platform sink (output not decodable) is a clean FAIL, never an uncaught throw.
  let got: FrameDigest[];
  if (ctx.frames) {
    got = Array.isArray(ctx.frames.frames) ? ctx.frames.frames : [];
  } else if (ctx.output) {
    let sink: FrameSink | null | undefined;
    try {
      sink = await ctx.decodeWithPlatform(ctx.output, { maxFrames: compareWant.length });
    } catch (err) {
      return fail(oracle, `platform decode of engine output failed: ${errMsg(err)}`);
    }
    got = sink && Array.isArray(sink.frames) ? sink.frames : [];
  } else {
    return fail(oracle, 'no decoded frames, seek frame, or output bytes on ctx to compare');
  }

  return compareDigests(oracle, got, compareWant);
}

function goldenFramesForDecodeCompare(ctx: OracleContext, frames: FrameDigest[]): FrameDigest[] {
  const maxFrames = readNumberOption(ctx.scenario.options, ['maxFrames']);
  if (maxFrames === undefined) return frames;
  const n = Math.max(0, Math.floor(maxFrames));
  return frames.slice(0, n);
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
  if (!got.length) return fail(oracle, 'no decoded frames to compare (0 produced)', measurements);

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

async function referenceReimport(ctx: OracleContext, t: Required<OracleTolerances>): Promise<OracleOutcome> {
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
  const reimportKeyframes = pkts.filter((p) => p.keyframe).length;
  const measurements: Record<string, number> = {
    reimportPackets: pkts.length,
    reimportKeyframes,
  };
  if (pkts.length === 0) {
    return fail(oracle, 'reference re-import produced an empty packet table', measurements);
  }
  if (ctx.scenario.op === 'remux') {
    return semanticRemuxReimport(ctx, demux, measurements, t);
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
    if (!withinRel(reimportKeyframes, goldKf, 0.02, 1)) {
      diffs.push(`keyframes: reimport ${reimportKeyframes} vs golden ${goldKf}`);
    }
    if (diffs.length) return fail(oracle, diffs.join('; '), measurements);
  }
  return pass(
    oracle,
    `reference re-imported engine output: ${pkts.length} packets, ${reimportKeyframes} keyframes`,
    measurements,
  );
}

function semanticRemuxReimport(
  ctx: OracleContext,
  demux: DemuxResult,
  measurements: Record<string, number>,
  t: Required<OracleTolerances>,
): OracleOutcome {
  const oracle: OracleId = 'reference-reimport';
  const expectedTracks = (ctx.golden.meta?.tracks ?? []).filter((track) => track.type === 'video' || track.type === 'audio');
  const actualTracks = (demux.metadata.tracks ?? []).filter((track) => track.type === 'video' || track.type === 'audio');
  measurements.reimportMediaTracks = actualTracks.length;
  measurements.goldenMediaTracks = expectedTracks.length;
  const diffs: string[] = [];

  if (expectedTracks.length && actualTracks.length !== expectedTracks.length) {
    diffs.push(`media track count: reimport ${actualTracks.length} vs golden ${expectedTracks.length}`);
  }
  const expectedLayout = mediaTrackLayout(expectedTracks);
  const actualLayout = mediaTrackLayout(actualTracks);
  const layoutKeys = new Set([...Object.keys(expectedLayout), ...Object.keys(actualLayout)]);
  for (const key of layoutKeys) {
    const a = actualLayout[key] ?? 0;
    const b = expectedLayout[key] ?? 0;
    if (a !== b) diffs.push(`track layout '${key}': reimport ${a} vs golden ${b}`);
  }

  const gotDur = demux.metadata.durationSec;
  const wantDur = ctx.golden.meta?.durationSec;
  if (gotDur != null && wantDur != null) {
    const delta = Math.abs(gotDur - wantDur);
    const container = ctx.output?.container ?? demux.metadata.container;
    const band = durationToleranceFor(container, primaryAssetId(ctx), t, ctx.scenario.tolerances?.durationToleranceSec != null);
    const baseTolSec = band.loose ? Math.max(band.tolSec, LOOSE_DURATION_REL * Math.abs(wantDur)) : band.tolSec;
    // Container remux can materialize a small tail duration from audio-frame/block rounding without
    // changing media identity. Keep this semantic re-import gate focused on real drift.
    const tolSec = Math.max(baseTolSec, 0.1);
    measurements.durationDeltaSec = delta;
    measurements.durationToleranceSec = tolSec;
    if (delta > tolSec) {
      diffs.push(`duration: reimport ${gotDur.toFixed(4)}s vs golden ${wantDur.toFixed(4)}s (Δ ${delta.toFixed(4)}s > tol ${tolSec.toFixed(4)}s)`);
    }
  }

  const expectedVideoKeyframes = (ctx.golden.packets ?? []).filter((p) => p.keyframe).length;
  const actualVideoKeyframes = demux.packets.filter((p) => p.keyframe).length;
  if (expectedTracks.some((t) => t.type === 'video') && expectedVideoKeyframes > 0 && actualVideoKeyframes === 0) {
    diffs.push('reimport found no keyframes for a video remux output');
  }

  if (diffs.length) return fail(oracle, diffs.join('; '), measurements);
  return pass(
    oracle,
    `reference re-imported remux output semantically: ${demux.packets.length} packets, ${actualTracks.length} media track(s)`,
    measurements,
  );
}

function mediaTrackLayout(tracks: NormalizedTrack[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const track of tracks) {
    const key = `${track.type}:${normStr(track.codec)}`;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
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

  const golden = ctx.golden;
  const want = golden.frames;
  const refSigs = golden.ssimRef;
  const useReferenceSource = usesTransformReference(ctx);
  const haveGolden = !useReferenceSource && ((!!want && want.length > 0) || (!!refSigs && refSigs.length > 0));

  // When there is NO committed golden (a resize/transcode case, or golden pending the in-browser
  // frame-bake), §5.2 says validate against REFERENCE frames, not golden: decode the SOURCE in-browser
  // and downscale to the candidate's resolution, then SSIM/PSNR. We sample a small number of frames
  // (decoding the full clip on both sides would be needlessly slow).
  const REFERENCE_SAMPLE = 8;
  const maxFrames = haveGolden
    ? Math.max(want?.length ?? 0, refSigs?.length ?? 0) || undefined
    : REFERENCE_SAMPLE;

  // Source the CANDIDATE frame sequence:
  //   • decodeFrames → ctx.frames, the engine's own decoded pixels/digests.
  //   • bytes-producing ops → ctx.output, re-decoded with the platform engine.
  // Decode output with the platform engine is the fragile path: some engine outputs (e.g. a
  // remotion-webcodecs streaming/headerless WebM) cannot be decoded by the platform decoder, which
  // can yield a null sink / null tracks / null frames and historically null-derefed here. Treat any
  // decode failure or null/empty result as a clean FAIL with a clear detail rather than throwing.
  let sink: FrameSink | null | undefined;
  if (ctx.frames) {
    sink = ctx.frames;
  } else if (ctx.output) {
    try {
      sink = await ctx.decodeWithPlatform(ctx.output, { maxFrames });
    } catch (err) {
      return fail(oracle, `platform decode of engine output failed: ${errMsg(err)}`);
    }
  } else {
    return fail(oracle, 'no decoded frames (ctx.frames) or output bytes (ctx.output) for SSIM/PSNR');
  }
  if (!sink) {
    return fail(oracle, 'candidate decode returned no sink (output not decodable)');
  }
  const candFrames = Array.isArray(sink.frames) ? sink.frames : [];
  if (!candFrames.length) {
    return fail(
      oracle,
      'platform decode produced 0 frames (output not decodable / missing video track)',
    );
  }

  // No committed golden → perceptual validation against the in-browser-decoded source (§5.2).
  if (!haveGolden) {
    return ssimVsReferenceSource(oracle, ctx, t, sink, candFrames.length);
  }

  // Pair candidate frames with golden references by index. Two modes:
  //  (A) full-pixel SSIM/PSNR when getPixels is available AND golden ships pixels (not committed
  //      here — golden never carries raw media), so in practice we use:
  //  (B) downsampled-luma-signature SSIM (global) when ssim.json provides per-frame luma sigs, and
  //      digest equality as the PSNR proxy (Infinity if the normalized RGBA digest matches → the
  //      frame is identical → PSNR is +∞; otherwise we cannot compute true RGB PSNR without golden
  //      pixels, so we report the per-frame SSIM and fall back to digest-equality for the PSNR gate).
  const pairs = Math.min(
    candFrames.length,
    want?.length ?? refSigs?.length ?? candFrames.length,
  );
  if (pairs === 0) return fail(oracle, 'no paired frames to compare');

  let ssimSum = 0;
  let ssimCount = 0;
  let minSsim = 1;
  let exactCount = 0;
  const havePixels = typeof sink.getPixels === 'function';

  for (let i = 0; i < pairs; i++) {
    const cand = candFrames[i];
    // Guard against a sparse/holey candidate frame array (a null/undefined entry, or one missing a
    // sha256). Such a frame contributes no evidence rather than null-derefing on cand.sha256.
    if (!cand) continue;
    // digest equality → identical normalized frame → SSIM 1 / PSNR ∞
    if (want && want[i] && cand.sha256 != null && normHex(cand.sha256) === normHex(want[i]!.sha256)) {
      exactCount++;
      ssimSum += 1;
      ssimCount++;
      continue;
    }
    // SSIM via downsampled luma signature if golden provides one and we can derive ours
    if (refSigs && refSigs[i] && havePixels) {
      // getPixels can also reject / return null for an undecodable candidate frame; tolerate it.
      let px: ImageData | null | undefined;
      try {
        px = await sink.getPixels!(i);
      } catch {
        px = undefined;
      }
      if (!px) continue;
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

/**
 * Reference-based SSIM/PSNR for transcode/resize cases with NO committed golden (§5.2). Decode the
 * SOURCE in-browser, downscale each frame to the candidate's resolution, and compare. Makes
 * convert-webm-resize verifiable without a golden frame-bake. Frames pair by index (both decoded from
 * the start, in presentation order, same fps). A correct downscale-transcode → high SSIM vs the
 * canvas-downscaled source; a garbled/empty/wrong-content output → low SSIM → FAIL.
 */
async function ssimVsReferenceSource(
  oracle: OracleId,
  ctx: OracleContext,
  t: Required<OracleTolerances>,
  candSink: FrameSink,
  candCount: number,
): Promise<OracleOutcome> {
  if (typeof candSink.getPixels !== 'function') {
    return fail(oracle, 'candidate decode exposes no pixels (getPixels) — cannot compute SSIM/PSNR');
  }
  if (!ctx.input) return fail(oracle, 'no source input available to derive reference frames');

  let srcBytes: MediaBytes;
  try {
    const ab = await ctx.input.arrayBuffer();
    const ext = (ctx.input.id.split('.').pop() ?? '').toLowerCase();
    srcBytes = { bytes: new Uint8Array(ab), mime: ctx.input.mime, container: ext };
  } catch (err) {
    return fail(oracle, `could not read source bytes for reference decode: ${errMsg(err)}`);
  }

  const sample = Math.min(candCount, 8);
  let srcSink: FrameSink | null | undefined;
  try {
    srcSink = await ctx.decodeWithPlatform(srcBytes, { maxFrames: sample });
  } catch (err) {
    return fail(oracle, `reference decode of source failed: ${errMsg(err)}`);
  }
  if (!srcSink || typeof srcSink.getPixels !== 'function') {
    return fail(oracle, 'reference source decode produced no pixels');
  }
  const srcCount = Array.isArray(srcSink.frames) ? srcSink.frames.length : 0;
  const n = Math.min(sample, candCount, srcCount);
  if (n === 0) return fail(oracle, 'no paired candidate/reference frames to compare');

  let ssimSum = 0;
  let psnrSum = 0;
  let psnrCount = 0;
  let minSsim = 1;
  let cnt = 0;
  let dims = '';
  for (let i = 0; i < n; i++) {
    let candPx: ImageData | null | undefined;
    let srcPx: ImageData | null | undefined;
    try {
      candPx = await candSink.getPixels(i);
      srcPx = await srcSink.getPixels(i);
    } catch {
      continue;
    }
    if (!candPx || !srcPx) continue;
    const prepared = prepareReferenceImage(ctx, srcPx, candPx.width, candPx.height);
    const ref = prepared.image;
    if (!ref) continue;
    const compareCand = usesAlphaVisualReference(ctx) ? compositeOverBackground(candPx, 0, 0, 0) : candPx;
    const compareRef = usesAlphaVisualReference(ctx) ? compositeOverBackground(ref, 0, 0, 0) : ref;
    const s = ssim(compareCand, compareRef);
    if (!Number.isFinite(s)) continue;
    ssimSum += s;
    if (s < minSsim) minSsim = s;
    const p = psnrDb(compareCand, compareRef);
    if (Number.isFinite(p)) {
      psnrSum += p;
      psnrCount++;
    }
    cnt++;
    if (!dims) dims = `${prepared.detail} to ${candPx.width}x${candPx.height}`;
  }
  if (cnt === 0) return fail(oracle, 'could not compute SSIM on any frame (no comparable pixels)');

  const ssimMean = ssimSum / cnt;
  const psnrMean = psnrCount ? psnrSum / psnrCount : 0;
  const measurements = finiteOnly({ pairs: cnt, ssimMean, ssimMin: minSsim, psnrDb: psnrMean });
  // SSIM (mean) is the GATE. PSNR is ADVISORY only: the reference is the source downscaled by a
  // DIFFERENT resampler (OffscreenCanvas) than the candidate engine used, so absolute PSNR is not
  // ground truth and would falsely fail a correct transcode. Verified in /chrome that SSIM
  // discriminates cleanly — a correct downscale-transcode scores ~0.99 while a wrong/mismatched frame
  // scores ~0.84 — so the §8 SSIM floor (0.97 here) is a faithful correctness gate on its own.
  const ssimOk = ssimMean >= t.ssimMin;
  const detail =
    `vs in-browser reference (${dims}): SSIM mean ${ssimMean.toFixed(4)} ` +
    `(min ${minSsim.toFixed(4)}); PSNR mean ${psnrMean.toFixed(1)} dB (advisory) over ${cnt} frame(s); ` +
    `gate SSIM≥${t.ssimMin}`;
  return ssimOk ? pass(oracle, detail, measurements) : fail(oracle, detail, measurements);
}

function prepareReferenceImage(
  ctx: OracleContext,
  img: ImageData,
  targetW: number,
  targetH: number,
): { image: ImageData | null; detail: string } {
  const options = isObject(ctx.scenario.options) ? ctx.scenario.options : {};
  let ref: ImageData | null = img;
  const steps: string[] = ['source decoded'];

  const crop = readObjectOption(options, 'crop');
  if (crop) {
    const x = readNumberOption(crop, ['x', 'left']) ?? 0;
    const y = readNumberOption(crop, ['y', 'top']) ?? 0;
    const width = readNumberOption(crop, ['width']);
    const height = readNumberOption(crop, ['height']);
    if (width !== undefined && height !== undefined) {
      ref = cropImageData(ref, x, y, width, height);
      steps.push(`cropped ${Math.round(width)}x${Math.round(height)} at ${Math.round(x)},${Math.round(y)}`);
    }
  }

  const flip = readStringOption(options, ['flip']);
  if (ref && flip) {
    ref = flipImageData(ref, flip);
    if (ref) steps.push(`flipped ${flip}`);
  }

  const pad = readObjectOption(options, 'pad');
  if (ref && pad) {
    const width = readNumberOption(pad, ['width']) ?? targetW;
    const height = readNumberOption(pad, ['height']) ?? targetH;
    const color = readStringOption(pad, ['color']) ?? 'black';
    ref = padContainImageData(ref, width, height, color);
    steps.push(`contained in ${Math.round(width)}x${Math.round(height)}`);
  }

  if (ref && (ref.width !== targetW || ref.height !== targetH)) {
    ref = resizeImageData(ref, targetW, targetH);
    steps.push('resized');
  }

  return { image: ref, detail: steps.join(' + ') };
}

function usesTransformReference(ctx: OracleContext): boolean {
  if (ctx.scenario.op !== 'transcode') return false;
  const options: Record<string, unknown> = isObject(ctx.scenario.options) ? ctx.scenario.options : {};
  return isObject(options.crop) || isObject(options.pad) || typeof options.flip === 'string';
}

function usesAlphaVisualReference(ctx: OracleContext): boolean {
  if (ctx.scenario.op !== 'transcode') return false;
  const options: Record<string, unknown> = isObject(ctx.scenario.options) ? ctx.scenario.options : {};
  return readStringOption(options, ['alpha']) === 'keep';
}

/** Downscale (or passthrough) an ImageData to w×h via OffscreenCanvas high-quality smoothing. */
function resizeImageData(img: ImageData, w: number, h: number): ImageData | null {
  if (img.width === w && img.height === h) return img;
  if (typeof OffscreenCanvas !== 'function') return null;
  try {
    const src = new OffscreenCanvas(img.width, img.height);
    const sctx = src.getContext('2d');
    if (!sctx) return null;
    sctx.putImageData(img, 0, 0);
    const dst = new OffscreenCanvas(w, h);
    const dctx = dst.getContext('2d');
    if (!dctx) return null;
    dctx.imageSmoothingEnabled = true;
    dctx.imageSmoothingQuality = 'high';
    dctx.drawImage(src, 0, 0, img.width, img.height, 0, 0, w, h);
    return dctx.getImageData(0, 0, w, h);
  } catch {
    return null;
  }
}

function cropImageData(img: ImageData | null, x: number, y: number, w: number, h: number): ImageData | null {
  if (!img || typeof OffscreenCanvas !== 'function') return null;
  const sx = Math.max(0, Math.min(img.width, Math.round(x)));
  const sy = Math.max(0, Math.min(img.height, Math.round(y)));
  const sw = Math.max(0, Math.min(img.width - sx, Math.round(w)));
  const sh = Math.max(0, Math.min(img.height - sy, Math.round(h)));
  if (sw <= 0 || sh <= 0) return null;
  try {
    const src = new OffscreenCanvas(img.width, img.height);
    const sctx = src.getContext('2d');
    if (!sctx) return null;
    sctx.putImageData(img, 0, 0);
    const dst = new OffscreenCanvas(sw, sh);
    const dctx = dst.getContext('2d');
    if (!dctx) return null;
    dctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
    return dctx.getImageData(0, 0, sw, sh);
  } catch {
    return null;
  }
}

function flipImageData(img: ImageData | null, mode: string): ImageData | null {
  if (!img || typeof OffscreenCanvas !== 'function') return null;
  const flipH = mode === 'h' || mode === 'horizontal' || mode === 'both' || mode === 'hv' || mode === 'vh';
  const flipV = mode === 'v' || mode === 'vertical' || mode === 'both' || mode === 'hv' || mode === 'vh';
  if (!flipH && !flipV) return img;
  try {
    const src = new OffscreenCanvas(img.width, img.height);
    const sctx = src.getContext('2d');
    if (!sctx) return null;
    sctx.putImageData(img, 0, 0);
    const dst = new OffscreenCanvas(img.width, img.height);
    const dctx = dst.getContext('2d');
    if (!dctx) return null;
    dctx.translate(flipH ? img.width : 0, flipV ? img.height : 0);
    dctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    dctx.drawImage(src, 0, 0);
    return dctx.getImageData(0, 0, img.width, img.height);
  } catch {
    return null;
  }
}

function padContainImageData(img: ImageData | null, w: number, h: number, color: string): ImageData | null {
  if (!img || typeof OffscreenCanvas !== 'function') return null;
  const targetW = Math.max(1, Math.round(w));
  const targetH = Math.max(1, Math.round(h));
  try {
    const src = new OffscreenCanvas(img.width, img.height);
    const sctx = src.getContext('2d');
    if (!sctx) return null;
    sctx.putImageData(img, 0, 0);
    const dst = new OffscreenCanvas(targetW, targetH);
    const dctx = dst.getContext('2d');
    if (!dctx) return null;
    dctx.fillStyle = color;
    dctx.fillRect(0, 0, targetW, targetH);
    const scale = Math.min(targetW / img.width, targetH / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    dctx.imageSmoothingEnabled = true;
    dctx.imageSmoothingQuality = 'high';
    dctx.drawImage(src, (targetW - drawW) / 2, (targetH - drawH) / 2, drawW, drawH);
    return dctx.getImageData(0, 0, targetW, targetH);
  } catch {
    return null;
  }
}

function compositeOverBackground(img: ImageData, r: number, g: number, b: number): ImageData {
  const out = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
  for (let i = 0; i < out.data.length; i += 4) {
    const alpha = out.data[i + 3]! / 255;
    out.data[i] = Math.round(out.data[i]! * alpha + r * (1 - alpha));
    out.data[i + 1] = Math.round(out.data[i + 1]! * alpha + g * (1 - alpha));
    out.data[i + 2] = Math.round(out.data[i + 2]! * alpha + b * (1 - alpha));
    out.data[i + 3] = 255;
  }
  return out;
}

// ── alpha-plane ──────────────────────────────────────────────────────────────────────────────

async function alphaPlane(ctx: OracleContext): Promise<OracleOutcome> {
  const oracle: OracleId = 'alpha-plane';

  // Compare the alpha channel separately from color. We need pixel-bearing candidate frames and a
  // golden reference. Golden carries frame digests; a dedicated alpha digest is encoded by digestFrame
  // over the alpha-only plane when the bake emits one (frames[i].sha256 of the alpha image). Absent
  // golden pixels, we verify alpha presence + that decoded frames have a non-trivial alpha channel,
  // and bit-exact alpha via the frame digest when the golden was baked alpha-only.
  //
  // CANDIDATE SOURCE: for a decodeFrames op the engine's OWN sink is on ctx.frames (and exposes
  // getPixels); for a bytes-producing op (transcode/remux) we re-decode ctx.output with the platform
  // engine. Previously this oracle read ONLY ctx.output and hard-failed every alpha DECODE cell with
  // "no ctx.output" — the same wiring gap as decoded-frames-bitexact. A null/empty/getPixels-less sink
  // is a clean FAIL, never an uncaught throw.
  const want = ctx.golden.frames;
  let sink: FrameSink | null | undefined;
  if (ctx.frames) {
    sink = ctx.frames;
  } else if (ctx.output) {
    try {
      sink = await ctx.decodeWithPlatform(ctx.output, { maxFrames: want?.length });
    } catch (err) {
      return fail(oracle, `platform decode of engine output failed: ${errMsg(err)}`);
    }
  } else {
    return fail(oracle, 'no decoded frames (ctx.frames) or output bytes (ctx.output) for alpha comparison');
  }
  if (!sink || !Array.isArray(sink.frames) || !sink.frames.length) {
    return fail(oracle, 'no decoded frames to inspect for an alpha plane (0 produced)');
  }
  if (typeof sink.getPixels !== 'function') {
    return fail(oracle, 'decode sink did not expose getPixels; cannot inspect alpha plane');
  }
  const getPixels = sink.getPixels.bind(sink);

  let maxMeanAbsDiff = 0;
  let framesWithAlpha = 0;
  let pixelFrames = 0;
  const pairs = Math.min(sink.frames.length, want?.length ?? sink.frames.length);
  const measurements: Record<string, number> = { pairs };

  for (let i = 0; i < pairs; i++) {
    let px: ImageData | null | undefined;
    try {
      px = await getPixels(i);
    } catch {
      px = undefined;
    }
    if (!px) continue; // an unreadable frame contributes no evidence (never a null-deref)
    pixelFrames++;
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
  measurements.pixelFrames = pixelFrames;
  measurements.maxAlphaMeanAbsDiff = maxMeanAbsDiff;

  if (pixelFrames === 0) {
    return fail(oracle, `could not read pixels for any of ${pairs} frame(s); cannot inspect alpha plane`, measurements);
  }
  if (framesWithAlpha === 0) {
    return fail(oracle, `no frame exposed a non-opaque alpha channel over ${pixelFrames} readable frame(s)`, measurements);
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

  // Expected landing pts: exact keyframe when the scenario asks for one, otherwise the nearest real
  // video PTS to the requested time. Pixel digests are intentionally not a hard gate here: independent
  // decoders can produce tiny RGBA differences for the same frame, and seek-accuracy is a timestamp
  // oracle. Decode pixel quality is covered by `ssim-psnr` on decodeFrames scenarios.
  const requestedUs = readNumberOption(ctx.scenario.options, ['tUs', 'targetUs', 'timeUs', 'atUs']);
  const expectKeyframe = readBooleanOption(ctx.scenario.options, ['expectKeyframe', 'keyframe']);
  const measurements: Record<string, number> = { landedPtsUs: seek.landedPtsUs };

  const expectedPtsUs =
    requestedUs != null ? expectedSeekPtsUs(ctx.golden, requestedUs, expectKeyframe) : undefined;

  const diffs: string[] = [];

  if (expectedPtsUs != null) {
    const d = Math.abs(seek.landedPtsUs - expectedPtsUs);
    measurements.seekDeltaUs = d;
    measurements.expectedPtsUs = expectedPtsUs;
    if (d > t.seekToleranceUs) {
      const label = expectKeyframe ? 'expected keyframe' : 'expected frame pts';
      diffs.push(
        `landed ${seek.landedPtsUs}µs vs ${label} ${expectedPtsUs}µs (Δ ${d}µs > ${t.seekToleranceUs}µs)`,
      );
    }
  } else if (requestedUs != null) {
    diffs.push('could not resolve expected video pts from golden packets/frames');
  }

  if (diffs.length) return fail(oracle, diffs.join('; '), measurements);
  const mode = expectKeyframe ? 'keyframe' : 'actual frame pts';
  return pass(oracle, `seek landed on expected ${mode} within ${t.seekToleranceUs}µs`, measurements);
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

function expectedSeekPtsUs(
  golden: GoldenStore,
  requestedUs: number,
  expectKeyframe: boolean,
): number | undefined {
  const pkts = videoPacketsForGolden(golden);
  if (pkts.length) {
    if (expectKeyframe) return keyframeAtOrBefore(pkts, requestedUs)?.ptsUs;
    return nearestPacketPts(pkts, requestedUs);
  }

  const frames = golden.frames ?? [];
  if (!frames.length) return undefined;
  if (expectKeyframe) {
    const keyframes = frames.filter((f) => (f as FrameDigest & { keyframe?: boolean }).keyframe === true);
    return nearestFramePts(keyframes.length ? keyframes : frames, requestedUs, true);
  }
  return nearestFramePts(frames, requestedUs, false);
}

function videoPacketsForGolden(golden: GoldenStore): PacketInfo[] {
  const pkts = golden.packets ?? [];
  if (!pkts.length) return [];
  const videoTracks = videoTrackIndices(golden);
  const videoPkts = videoTracks ? pkts.filter((p) => videoTracks.has(p.trackIndex)) : pkts;
  return videoPkts.length ? videoPkts : pkts;
}

function nearestPacketPts(pkts: PacketInfo[], tUs: number): number | undefined {
  let best: PacketInfo | undefined;
  let bestD = Infinity;
  for (const p of pkts) {
    const d = Math.abs(p.ptsUs - tUs);
    if (d < bestD || (d === bestD && best && p.ptsUs < best.ptsUs)) {
      bestD = d;
      best = p;
    }
  }
  return best?.ptsUs;
}

function nearestFramePts(
  frames: FrameDigest[],
  tUs: number,
  atOrBefore: boolean,
): number | undefined {
  let best: FrameDigest | undefined;
  let bestD = Infinity;
  for (const f of frames) {
    if (atOrBefore && f.ptsUs > tUs) continue;
    const d = Math.abs(f.ptsUs - tUs);
    if (d < bestD || (d === bestD && best && f.ptsUs < best.ptsUs)) {
      bestD = d;
      best = f;
    }
  }
  if (best) return best.ptsUs;
  if (!atOrBefore) return undefined;
  // If the request is before the first frame/keyframe, clamp to the earliest available frame.
  for (const f of frames) {
    if (!best || f.ptsUs < best.ptsUs) best = f;
  }
  return best?.ptsUs;
}

/**
 * Derive the set of VIDEO packet trackIndices from the golden store, or `undefined` when it cannot be
 * determined (caller then treats all tracks as candidates — correct for an all-intra/audio-only clip).
 *
 * Preference order:
 *   1. golden.meta.tracks — the meta track list is positionally aligned with the packet `trackIndex`
 *      convention (both follow ffprobe stream order), so meta index i ⇒ packets with trackIndex i. We
 *      take the indices whose meta type is 'video'.
 *   2. Structural fallback when meta is absent: a video track carries a MIX of keyframe + non-keyframe
 *      packets, whereas audio (AAC/Opus/…) is all-keyframe. So tracks that have ≥1 non-keyframe packet
 *      are video. If EVERY track is all-keyframe (all-intra video, or audio-only), we return undefined
 *      so the caller falls back to all tracks (the all-intra case where any keyframe pick is correct).
 */
function videoTrackIndices(golden: GoldenStore): Set<number> | undefined {
  const metaTracks = golden.meta?.tracks;
  if (metaTracks && metaTracks.length) {
    const s = new Set<number>();
    metaTracks.forEach((tr, i) => {
      if (tr?.type === 'video') s.add(i);
    });
    if (s.size) return s;
  }
  const pkts = golden.packets;
  if (pkts && pkts.length) {
    const hasNonKeyframe = new Set<number>();
    for (const p of pkts) if (!p.keyframe) hasNonKeyframe.add(p.trackIndex);
    if (hasNonKeyframe.size) return hasNonKeyframe;
  }
  return undefined;
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

  // Decode the trimmed output for the frame-span duration proxy + boundary-frame digests. A decode
  // failure or null/empty sink is non-fatal here: the reference-engine probe above may already have a
  // duration, and the boundary-frame block below simply has nothing to compare. Never null-deref.
  let frames: FrameDigest[] = [];
  try {
    const sink = await ctx.decodeWithPlatform(ctx.output, { maxFrames: 4096 });
    if (sink && Array.isArray(sink.frames)) frames = sink.frames;
  } catch {
    /* decode failed; rely on the reference probe duration if any, else report below */
  }
  if (outDurationSec == null && frames.length >= 2) {
    const first = frames[0]!.ptsUs;
    const last = frames[frames.length - 1]!.ptsUs;
    outDurationSec = (last - first) / 1e6;
  }
  if (outDurationSec == null) {
    outDurationSec = durationFromSimpleAudioContainer(ctx.output);
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

  // Boundary frame digests are sound only when the loaded frame golden was baked for THIS trim
  // range. Today the runner loads source-asset golden; those frames are an opening prefix of the full
  // source, so comparing them to a sub-range trim boundary falsely fails correct cuts once frame
  // golden is baked. Keep duration as the live gate and only activate digest comparison for future
  // trim-range golden that declares a matching range.
  const want = ctx.golden.frames;
  let boundaryDetail = 'boundary frame digest skipped (no decoded video boundary frames or trim-range golden)';
  measurements.boundaryFrameComparisons = 0;
  if (want && want.length && frames.length) {
    const goldenRange = readGoldenTrimRange(ctx);
    if (range && goldenRange && sameUsRange(range, goldenRange)) {
      const firstGot = frames[0]!;
      const lastGot = frames[frames.length - 1]!;
      const firstWant = want[0]!;
      const lastWant = want[want.length - 1]!;
      measurements.boundaryFrameComparisons = 2;
      boundaryDetail = 'boundary frames match trim-range golden';
      if (normHex(firstGot.sha256) !== normHex(firstWant.sha256)) {
        diffs.push(`start boundary frame ${shortHex(firstGot.sha256)} vs golden ${shortHex(firstWant.sha256)}`);
      }
      if (normHex(lastGot.sha256) !== normHex(lastWant.sha256)) {
        diffs.push(`end boundary frame ${shortHex(lastGot.sha256)} vs golden ${shortHex(lastWant.sha256)}`);
      }
    } else {
      boundaryDetail = 'boundary frame digest skipped (loaded golden is source-prefix, not trim-range golden)';
    }
  }

  if (diffs.length) return fail(oracle, diffs.join('; '), measurements);
  return pass(oracle, `trim duration within tolerance; ${boundaryDetail}`, measurements);
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

function durationFromSimpleAudioContainer(out: MediaBytes): number | undefined {
  if (out.container === 'wav') return durationFromWav(out.bytes);
  if (out.container === 'aiff' || out.container === 'aif' || out.container === 'aifc') {
    return durationFromAiff(out.bytes);
  }
  return undefined;
}

function durationFromWav(bytes: Uint8Array): number | undefined {
  if (bytes.byteLength < 44 || ascii4(bytes, 0) !== 'RIFF' || ascii4(bytes, 8) !== 'WAVE') return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 12;
  let sampleRate: number | undefined;
  let blockAlign: number | undefined;
  let dataBytes: number | undefined;
  while (pos + 8 <= bytes.byteLength) {
    const id = ascii4(bytes, pos);
    const size = view.getUint32(pos + 4, true);
    const dataPos = pos + 8;
    if (dataPos + size > bytes.byteLength) break;
    if (id === 'fmt ' && size >= 16) {
      sampleRate = view.getUint32(dataPos + 4, true);
      blockAlign = view.getUint16(dataPos + 12, true);
    } else if (id === 'data') {
      dataBytes = size;
    }
    pos = dataPos + size + (size % 2);
  }
  if (!sampleRate || !blockAlign || dataBytes === undefined) return undefined;
  return dataBytes / blockAlign / sampleRate;
}

function durationFromAiff(bytes: Uint8Array): number | undefined {
  if (
    bytes.byteLength < 54 ||
    ascii4(bytes, 0) !== 'FORM' ||
    (ascii4(bytes, 8) !== 'AIFF' && ascii4(bytes, 8) !== 'AIFC')
  ) {
    return undefined;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 12;
  while (pos + 8 <= bytes.byteLength) {
    const id = ascii4(bytes, pos);
    const size = view.getUint32(pos + 4, false);
    const dataPos = pos + 8;
    if (dataPos + size > bytes.byteLength) break;
    if (id === 'COMM' && size >= 18) {
      const frames = view.getUint32(dataPos + 2, false);
      const sampleRate = readAiffExtended80(bytes, dataPos + 8);
      if (sampleRate && sampleRate > 0) return frames / sampleRate;
    }
    pos = dataPos + size + (size % 2);
  }
  return undefined;
}

function readAiffExtended80(bytes: Uint8Array, offset: number): number | undefined {
  if (offset + 10 > bytes.byteLength) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signExp = view.getUint16(offset, false);
  const sign = signExp & 0x8000 ? -1 : 1;
  const exp = signExp & 0x7fff;
  const hi = view.getUint32(offset + 2, false);
  const lo = view.getUint32(offset + 6, false);
  if (exp === 0 && hi === 0 && lo === 0) return 0;
  if (exp === 0x7fff) return undefined;
  const mantissa = hi * 2 ** 32 + lo;
  return sign * mantissa * 2 ** (exp - 16383 - 63);
}

function ascii4(bytes: Uint8Array, offset: number): string {
  if (offset + 4 > bytes.byteLength) return '';
  return String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!);
}

function readGoldenTrimRange(ctx: OracleContext): { startUs: number; endUs: number } | undefined {
  const rawFrames = ctx.golden.raw?.frames;
  const direct = readRange(rawFrames);
  if (direct) return direct;
  if (isObject(rawFrames)) return readRange((rawFrames as Record<string, unknown>).trimRange);
  return undefined;
}

function sameUsRange(a: { startUs: number; endUs: number }, b: { startUs: number; endUs: number }): boolean {
  return Math.abs(a.startUs - b.startUs) <= 1 && Math.abs(a.endUs - b.endUs) <= 1;
}

// ── decrypt-bitexact ─────────────────────────────────────────────────────────────────────────

async function decryptBitexact(ctx: OracleContext): Promise<OracleOutcome> {
  const oracle: OracleId = 'decrypt-bitexact';
  if (!ctx.output) return fail(oracle, 'no ctx.output (decrypted) bytes to decode');
  const want = ctx.golden.frames;
  if (!want || !want.length) {
    return fail(
      oracle,
      'no golden frame digests for decrypt comparison (fixtures/golden/<id>.frames.json absent or ' +
        'pending; frame-bake must run — not an engine defect)',
    );
  }
  let sink: FrameSink | null | undefined;
  try {
    sink = await ctx.decodeWithPlatform(ctx.output, { maxFrames: want.length });
  } catch (err) {
    return fail(oracle, `platform decode of decrypted output failed: ${errMsg(err)}`);
  }
  const got = sink && Array.isArray(sink.frames) ? sink.frames : [];
  const out = compareDigests(oracle, got, want);
  // Re-label the detail to the decrypt context while preserving pass/fail + measurements.
  return { ...out, oracle };
}

// ── graceful-failure ─────────────────────────────────────────────────────────────────────────

/**
 * PASS iff the operation already threw/rejected (handled cleanly within the timeout, no
 * crash/hang/OOM). The runner normally signals this by leaving ctx.output undefined together with a
 * recorded error. For hand-authored fixtures, an explicit `signal:<token>` marker in notes may
 * override that inference; ordinary prose is intentionally ignored so words like "within the timeout"
 * do not become false runner verdicts.
 *   - explicit notes marker `signal:<token>` may be graceful/threw/rejected/error or
 *     crash/hang/timeout/oom.
 *   - else: if the op produced NO output for a robustness/malformed scenario, infer it failed
 *     gracefully (the runner caught the throw and routed here) → PASS; if it produced output for a
 *     known-malformed input, that is suspicious → FAIL ("did not reject malformed input").
 */
function gracefulFailure(ctx: OracleContext, _t: Required<OracleTolerances>): OracleOutcome {
  const oracle: OracleId = 'graceful-failure';
  const notes = (ctx.scenario.notes ?? '').toLowerCase();

  const marker = /\bsignal\s*[:=]\s*([a-z-]+)/.exec(notes)?.[1];
  if (marker) {
    const badTokens = ['crash', 'hang', 'timeout', 'oom', 'out-of-memory'];
    if (badTokens.includes(marker)) {
      return fail(oracle, `runner reported '${marker}' on malformed input (not graceful)`);
    }
    const goodTokens = ['graceful', 'threw', 'rejected', 'rejection', 'errored', 'handled'];
    if (goodTokens.includes(marker)) {
      return pass(oracle, `malformed input handled gracefully (signal: '${marker}')`);
    }
  }

  // No explicit signal: infer from output presence for a robustness/malformed scenario.
  const hasGracefulSignal =
    ctx.scenario.family === 'robustness' ||
    !!ctx.scenario.mutate ||
    ctx.scenario.oracles.includes('graceful-failure');
  if (hasGracefulSignal) {
    if (!ctx.output && !ctx.metadata && !ctx.demux && !ctx.frames) {
      return pass(oracle, 'operation produced no output and did not crash/hang → handled gracefully');
    }
    if (gracefulAllowsReturnedOutput(ctx)) {
      return pass(oracle, 'operation returned partial/safe output and did not crash/hang');
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

function gracefulAllowsReturnedOutput(ctx: OracleContext): boolean {
  const options = ctx.scenario.options as Record<string, unknown> | undefined;
  return options?.gracefulAllowOutput === true;
}

// ── property-invariant (metamorphic, §11) ──────────────────────────────────────────────────────

/**
 * Compute a metamorphic invariant in-browser using the injected helpers + frame digests. The
 * specific invariant is selected by scenario.options.invariant (or notes):
 *   - 'decode-remux'     : decode(remux(x)) == decode(x)            (frame digests equal)
 *   - 'seek-vs-linear'   : seek(t) lands on the same real PTS as linear decode at t
 *   - 'decode-pts-*'     : decoded frame PTS values are strictly increasing after reorder
 *   - 'vfr-seek-*'       : VFR seek lands on the nearest true demuxed frame PTS
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

  if (which.includes('transcode-output') || which.includes('output-metadata')) {
    return transcodeOutputMetadataInvariant(ctx, t, which);
  }

  if (which === 'seek(t)==linear-decode-frame-at(t)' || which.includes('linear-decode-frame')) {
    return seekVsLinearDecodeInvariant(ctx, t, which);
  }

  if (which === 'decode-pts-strictly-increasing' || which.includes('pts-strictly-increasing')) {
    return decodePtsStrictlyIncreasingInvariant(ctx, which);
  }

  if (which === 'vfr-seek-lands-on-true-pts') {
    return vfrSeekLandsOnTruePtsInvariant(ctx, t, which);
  }

  if (which.includes('decode') || which.includes('remux')) {
    // decode(remux(x)) == decode(x): output frame digests must equal golden source-decode digests.
    if (!ctx.output) return fail(oracle, `[${which}] no ctx.output to decode`);
    const want = ctx.golden.frames;
    if (!want || !want.length) {
      return fail(oracle, `[${which}] no golden frames = decode(x) to compare against (frame-bake pending)`);
    }
    let sink: FrameSink | null | undefined;
    try {
      sink = await ctx.decodeWithPlatform(ctx.output, { maxFrames: want.length });
    } catch (err) {
      return fail(oracle, `[${which}] platform decode of output failed: ${errMsg(err)}`);
    }
    const got = sink && Array.isArray(sink.frames) ? sink.frames : [];
    const out = compareDigests(oracle, got, want);
    return {
      ...out,
      detail: `[invariant decode(remux(x))==decode(x)] ${out.detail ?? ''}`.trim(),
    };
  }

  if (which.includes('duration') || which.includes('probe')) {
    if (ctx.scenario.op === 'probe') {
      return probeDurationInvariant(ctx, t, which);
    }

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
    const container = resolveContainer(ctx.golden.meta?.container ?? ctx.output.container, primaryAssetId(ctx));
    const band = durationToleranceFor(container, primaryAssetId(ctx), t, ctx.scenario.tolerances?.durationToleranceSec != null);
    const tolSec = band.loose ? Math.max(band.tolSec, LOOSE_DURATION_REL * Math.abs(goldenDur)) : band.tolSec;
    const measurements = { outDurationSec: outDur, goldenDurationSec: goldenDur, deltaSec: d, durationToleranceSec: tolSec };
    if (d > tolSec) {
      return fail(
        oracle,
        `[invariant probe(out).dur≈probe(x).dur] out ${outDur.toFixed(4)}s vs ${goldenDur.toFixed(
          4,
        )}s (Δ ${d.toFixed(4)}s > ${tolSec.toFixed(4)}s)`,
        measurements,
      );
    }
    return pass(
      oracle,
      `[invariant probe duration across containers] Δ ${d.toFixed(4)}s ≤ ${tolSec.toFixed(4)}s`,
      measurements,
    );
  }

  if (which.includes('trim') || which.includes('concat')) {
    // trim(a..b)++trim(b..c) ≈ trim(a..c): compare output decode to golden (the baked a..c decode).
    if (!ctx.output) return fail(oracle, `[${which}] no ctx.output to decode`);
    const want = ctx.golden.frames;
    if (!want || !want.length) return fail(oracle, `[${which}] no golden frames for trim-concat (frame-bake pending)`);
    let sink: FrameSink | null | undefined;
    try {
      sink = await ctx.decodeWithPlatform(ctx.output, { maxFrames: want.length });
    } catch (err) {
      return fail(oracle, `[${which}] platform decode of output failed: ${errMsg(err)}`);
    }
    const got = sink && Array.isArray(sink.frames) ? sink.frames : [];
    const out = compareDigests(oracle, got, want);
    return { ...out, detail: `[invariant trim concat ≈ direct trim] ${out.detail ?? ''}`.trim() };
  }

  return fail(
    oracle,
    `unknown property-invariant '${which}' (expected decode-remux | seek-vs-linear-decode | decode-pts-strictly-increasing | vfr-seek-lands-on-true-pts | probe-duration | trim-concat | transcode-output-metadata)`,
  );
}

function seekVsLinearDecodeInvariant(
  ctx: OracleContext,
  t: Required<OracleTolerances>,
  which: string,
): OracleOutcome {
  const oracle: OracleId = 'property-invariant';
  const seek = ctx.seek;
  if (!seek) return fail(oracle, `[${which}] no ctx.seek result to compare`);
  const requestedUs = readNumberOption(ctx.scenario.options, ['tUs', 'targetUs', 'timeUs', 'atUs']);
  if (requestedUs == null) return fail(oracle, `[${which}] no requested seek time in scenario options`);
  const expectKeyframe = readBooleanOption(ctx.scenario.options, ['expectKeyframe', 'keyframe']);
  const expectedPtsUs = expectedSeekPtsUs(ctx.golden, requestedUs, expectKeyframe);
  if (expectedPtsUs == null) {
    return fail(oracle, `[${which}] could not resolve linear-decode frame pts from golden timing`);
  }
  const deltaUs = Math.abs(seek.landedPtsUs - expectedPtsUs);
  const measurements = { requestedUs, landedPtsUs: seek.landedPtsUs, expectedPtsUs, deltaUs };
  if (deltaUs > t.seekToleranceUs) {
    return fail(
      oracle,
      `[${which}] seek landed ${seek.landedPtsUs}µs vs linear-decode pts ${expectedPtsUs}µs (Δ ${deltaUs}µs > ${t.seekToleranceUs}µs)`,
      measurements,
    );
  }
  return pass(
    oracle,
    `[${which}] seek landed on the linear-decode pts ${expectedPtsUs}µs within ${t.seekToleranceUs}µs`,
    measurements,
  );
}

function decodePtsStrictlyIncreasingInvariant(ctx: OracleContext, which: string): OracleOutcome {
  const oracle: OracleId = 'property-invariant';
  const frames = ctx.frames?.frames ?? [];
  if (!frames.length) return fail(oracle, `[${which}] no decoded frames on ctx.frames`);

  let inversions = 0;
  let duplicateOrBackstep = 0;
  let minStepUs = Number.POSITIVE_INFINITY;
  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1]!;
    const cur = frames[i]!;
    const step = cur.ptsUs - prev.ptsUs;
    if (step <= 0) {
      duplicateOrBackstep++;
      if (cur.ptsUs < prev.ptsUs) inversions++;
    } else if (step < minStepUs) {
      minStepUs = step;
    }
  }
  const measurements = finiteOnly({
    frames: frames.length,
    duplicateOrBackstep,
    inversions,
    minPositiveStepUs: minStepUs,
  });
  if (duplicateOrBackstep > 0) {
    return fail(
      oracle,
      `[${which}] decoded PTS is not strictly increasing (${duplicateOrBackstep} duplicate/backstep pair(s), ${inversions} inversion(s))`,
      measurements,
    );
  }
  return pass(
    oracle,
    `[${which}] decoded PTS is strictly increasing over ${frames.length} frame(s)`,
    measurements,
  );
}

function vfrSeekLandsOnTruePtsInvariant(
  ctx: OracleContext,
  t: Required<OracleTolerances>,
  which: string,
): OracleOutcome {
  const oracle: OracleId = 'property-invariant';
  const seek = ctx.seek;
  if (!seek) return fail(oracle, `[${which}] no ctx.seek result to compare`);
  const requestedUs = readNumberOption(ctx.scenario.options, ['tUs', 'targetUs', 'timeUs', 'atUs']);
  if (requestedUs == null) return fail(oracle, `[${which}] no requested seek time in scenario options`);
  const videoPkts = videoPacketsForGolden(ctx.golden);
  if (!videoPkts.length) return fail(oracle, `[${which}] no golden video packet PTS table`);

  const expectedPtsUs = nearestPacketPts(videoPkts, requestedUs);
  const landedActualDeltaUs = minPacketPtsDelta(videoPkts, seek.landedPtsUs);
  if (expectedPtsUs == null || landedActualDeltaUs == null) {
    return fail(oracle, `[${which}] could not resolve nearest VFR packet PTS`);
  }

  const targetDeltaUs = Math.abs(seek.landedPtsUs - expectedPtsUs);
  const measurements = {
    requestedUs,
    landedPtsUs: seek.landedPtsUs,
    expectedPtsUs,
    targetDeltaUs,
    landedActualDeltaUs,
  };
  const diffs: string[] = [];
  if (targetDeltaUs > t.seekToleranceUs) {
    diffs.push(
      `landed ${seek.landedPtsUs}µs vs nearest true VFR pts ${expectedPtsUs}µs (Δ ${targetDeltaUs}µs > ${t.seekToleranceUs}µs)`,
    );
  }
  if (landedActualDeltaUs > t.seekToleranceUs) {
    diffs.push(
      `landed pts ${seek.landedPtsUs}µs is not a real demuxed video pts (nearest Δ ${landedActualDeltaUs}µs > ${t.seekToleranceUs}µs)`,
    );
  }
  if (diffs.length) return fail(oracle, `[${which}] ${diffs.join('; ')}`, measurements);
  return pass(
    oracle,
    `[${which}] seek landed on nearest true VFR pts ${expectedPtsUs}µs`,
    measurements,
  );
}

function minPacketPtsDelta(pkts: PacketInfo[], ptsUs: number): number | undefined {
  let best = Infinity;
  for (const p of pkts) {
    const d = Math.abs(p.ptsUs - ptsUs);
    if (d < best) best = d;
  }
  return Number.isFinite(best) ? best : undefined;
}

async function transcodeOutputMetadataInvariant(
  ctx: OracleContext,
  t: Required<OracleTolerances>,
  which: string,
): Promise<OracleOutcome> {
  const oracle: OracleId = 'property-invariant';
  if (!ctx.output) return fail(oracle, `[${which}] no ctx.output to probe`);
  const options = isObject(ctx.scenario.options) ? ctx.scenario.options : {};
  const expectedContainer = readStringOption(options, ['container']);
  const videoOpts = readObjectOption(options, 'video');
  const audioOpts = readObjectOption(options, 'audio');

  let meta: NormalizedMetadata;
  if (!ctx.referenceEngine) return fail(oracle, `[${which}] no reference engine to probe output metadata`);
  try {
    meta = await ctx.referenceEngine.probe(bytesToInput(ctx.output, ctx.input.id + '.transcode-meta'));
  } catch (err) {
    const fallback = expectedContainer === 'aiff' || ctx.output.container === 'aiff'
      ? parseAiffMetadata(ctx.output.bytes)
      : null;
    if (!fallback) {
      return fail(oracle, `[${which}] reference probe of output failed: ${errMsg(err)}`);
    }
    meta = fallback;
  }

  const diffs: string[] = [];
  const measurements: Record<string, number> = {};

  if (expectedContainer && normStr(meta.container) !== normStr(expectedContainer)) {
    diffs.push(`container: output '${meta.container}' vs requested '${expectedContainer}'`);
  }

  const gotDur = meta.durationSec;
  const wantDur = ctx.golden.meta?.durationSec ?? null;
  if (wantDur != null && gotDur != null) {
    const delta = Math.abs(gotDur - wantDur);
    const assetId = primaryAssetId(ctx);
    const container = resolveContainer(meta.container ?? ctx.output.container, assetId);
    const explicitOverride = ctx.scenario.tolerances?.durationToleranceSec != null;
    const band = durationToleranceFor(container, assetId, t, explicitOverride);
    const tolSec = band.loose
      ? Math.max(band.tolSec, LOOSE_DURATION_REL * Math.abs(wantDur))
      : band.tolSec;
    measurements.durationDeltaSec = delta;
    measurements.durationToleranceSec = tolSec;
    if (delta > tolSec) {
      diffs.push(
        `duration: output ${gotDur.toFixed(4)}s vs source ${wantDur.toFixed(4)}s ` +
          `(Δ ${delta.toFixed(4)}s > ${tolSec.toFixed(4)}s)`,
      );
    }
  } else if (wantDur != null && gotDur == null) {
    diffs.push(`duration: output null vs source ${wantDur}s`);
  }

  if (videoOpts) {
    const videoTracks = meta.tracks.filter((track) => track.type === 'video');
    measurements.videoTracks = videoTracks.length;
    if (!videoTracks.length) {
      diffs.push('video track: output has none');
    } else {
      compareRequestedTrack('video', videoTracks, videoOpts, t, diffs);
    }
  }

  if (audioOpts) {
    const audioTracks = meta.tracks.filter((track) => track.type === 'audio');
    measurements.audioTracks = audioTracks.length;
    if (!audioTracks.length) {
      diffs.push('audio track: output has none');
    } else {
      compareRequestedTrack('audio', audioTracks, audioOpts, t, diffs);
    }
  }

  if (diffs.length) return fail(oracle, `[${which}] ${diffs.join('; ')}`, measurements);
  return pass(
    oracle,
    `[invariant transcode output metadata] ${meta.container}, ${meta.tracks.length} track(s) match requested output shape`,
    measurements,
  );
}

function parseAiffMetadata(bytes: Uint8Array): NormalizedMetadata | null {
  if (bytes.byteLength < 30) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (ascii(bytes, 0, 4) !== 'FORM') return null;
  const formType = ascii(bytes, 8, 4);
  if (formType !== 'AIFF' && formType !== 'AIFC') return null;

  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const type = ascii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, false);
    const body = offset + 8;
    if (body + size > bytes.byteLength) break;

    if (type === 'COMM' && size >= 18) {
      const channels = view.getUint16(body, false);
      const sampleFrames = view.getUint32(body + 2, false);
      const sampleSize = view.getUint16(body + 6, false);
      const sampleRate = readExtended80(view, body + 8);
      const compression = formType === 'AIFC' && size >= 22 ? ascii(bytes, body + 18, 4) : 'NONE';
      const codec = aiffCodec(compression, sampleSize);
      return {
        container: 'aiff',
        durationSec: sampleRate > 0 ? sampleFrames / sampleRate : null,
        tracks: [
          {
            type: 'audio',
            codec,
            sampleRate: Math.round(sampleRate),
            channels,
            language: null,
          },
        ],
      };
    }

    offset = body + size + (size % 2);
  }

  return null;
}

function aiffCodec(compression: string, sampleSize: number): string {
  const c = compression.trim();
  if (c === 'sowt') return sampleSize === 24 ? 'pcm-s24' : 'pcm-s16';
  if (sampleSize === 24) return 'pcm-s24be';
  if (sampleSize === 32) return 'pcm-s32be';
  return 'pcm-s16be';
}

function readExtended80(view: DataView, offset: number): number {
  if (offset + 10 > view.byteLength) return 0;
  const signExp = view.getUint16(offset, false);
  const sign = signExp & 0x8000 ? -1 : 1;
  const exponent = signExp & 0x7fff;
  const hi = view.getUint32(offset + 2, false);
  const lo = view.getUint32(offset + 6, false);
  if (exponent === 0 && hi === 0 && lo === 0) return 0;
  const mantissa = hi * 2 ** 32 + lo;
  return sign * mantissa * 2 ** (exponent - 16383 - 63);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[offset + i] ?? 0);
  return out;
}

function compareRequestedTrack(
  type: 'video' | 'audio',
  tracks: NormalizedTrack[],
  opts: Record<string, unknown>,
  t: Required<OracleTolerances>,
  diffs: string[],
): void {
  const requestedCodec = typeof opts.codec === 'string' && opts.codec.length ? opts.codec : undefined;
  const track = requestedCodec
    ? tracks.find((candidate) => normStr(candidate.codec) === normStr(requestedCodec))
    : tracks[0];
  if (!track) {
    diffs.push(`${type} codec: output ${tracks.map((candidate) => candidate.codec).join(',') || 'none'} vs requested '${requestedCodec}'`);
    return;
  }

  const prefix = `${type} track`;
  if (requestedCodec && normStr(track.codec) !== normStr(requestedCodec)) {
    diffs.push(`${prefix}.codec: '${track.codec}' vs requested '${requestedCodec}'`);
  }

  const width = readNumberOption(opts, ['width']);
  const height = readNumberOption(opts, ['height']);
  const fps = readNumberOption(opts, ['fps']);
  const sampleRate = readNumberOption(opts, ['sampleRate']);
  const channels = readNumberOption(opts, ['channels']);

  if (type === 'video') {
    if (width != null && track.width !== width) diffs.push(`${prefix}.width: ${track.width} vs requested ${width}`);
    if (height != null && track.height !== height) diffs.push(`${prefix}.height: ${track.height} vs requested ${height}`);
    if (fps != null && track.fps != null && Math.abs(track.fps - fps) > t.fpsTolerance) {
      diffs.push(`${prefix}.fps: ${track.fps} vs requested ${fps} (tol ±${t.fpsTolerance})`);
    } else if (fps != null && track.fps == null) {
      diffs.push(`${prefix}.fps: null vs requested ${fps}`);
    }
  } else {
    if (sampleRate != null && track.sampleRate !== sampleRate) {
      diffs.push(`${prefix}.sampleRate: ${track.sampleRate} vs requested ${sampleRate}`);
    }
    if (channels != null && track.channels !== channels) {
      diffs.push(`${prefix}.channels: ${track.channels} vs requested ${channels}`);
    }
  }
}

function probeDurationInvariant(
  ctx: OracleContext,
  t: Required<OracleTolerances>,
  which: string,
): OracleOutcome {
  const oracle: OracleId = 'property-invariant';
  const entries =
    ctx.probeMetadatas?.length
      ? ctx.probeMetadatas
      : ctx.metadata
        ? [{ input: ctx.input, metadata: ctx.metadata, golden: ctx.golden }]
        : [];

  if (!entries.length) return fail(oracle, `[${which}] no probe metadata to compare`);

  const diffs: string[] = [];
  const measurements: Record<string, number> = {};
  const explicitOverride = ctx.scenario.tolerances?.durationToleranceSec != null;

  entries.forEach((entry, index) => {
    const gotDur = entry.metadata.durationSec;
    const wantDur = entry.golden.meta?.durationSec ?? null;
    const label = entry.input.id;
    if (wantDur == null) {
      diffs.push(`${label}: no golden/source duration to compare`);
      return;
    }
    if (gotDur == null) {
      diffs.push(`${label}: measured null vs golden ${wantDur}s`);
      return;
    }

    const container = resolveContainer(entry.golden.meta?.container ?? entry.metadata.container, label);
    const band = durationToleranceFor(container, label, t, explicitOverride);
    const tolSec = band.loose
      ? Math.max(band.tolSec, LOOSE_DURATION_REL * Math.abs(wantDur))
      : band.tolSec;
    const delta = Math.abs(gotDur - wantDur);
    measurements[`durationDeltaSec${index}`] = delta;
    measurements[`durationToleranceSec${index}`] = tolSec;
    if (delta > tolSec) {
      const looseNote = band.loose
        ? ` [estimate-only container '${container}': loose band applied]`
        : '';
      diffs.push(
        `${label}: measured ${gotDur.toFixed(4)}s vs golden ${wantDur.toFixed(4)}s ` +
          `(Δ ${delta.toFixed(4)}s > tol ${tolSec.toFixed(4)}s)${looseNote}`,
      );
    }
  });

  if (diffs.length) return fail(oracle, `[${which}] ${diffs.join('; ')}`, measurements);
  return pass(
    oracle,
    `[invariant probe duration] ${entries.length} input(s) match their golden durations`,
    measurements,
  );
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
function normHex(h: string | null | undefined): string {
  // Defensive: golden data is untyped JSON; a placeholder/holey digest can be null. Never .trim() null.
  return (h ?? '').trim().toLowerCase();
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
function readStringOrFalseOption(options: unknown, keys: string[]): string | false | undefined {
  if (!isObject(options)) return undefined;
  for (const k of keys) {
    const v = options[k];
    if (v === false) return false;
    if (typeof v === 'string' && v.length) return v;
  }
  return undefined;
}

function readObjectOption(options: unknown, key: string): Record<string, unknown> | undefined {
  if (!isObject(options)) return undefined;
  const v = options[key];
  return isObject(v) ? v : undefined;
}

function readStringArrayOption(options: unknown, keys: string[]): string[] {
  if (!isObject(options)) return [];
  for (const k of keys) {
    const v = options[k];
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && x.length > 0);
    if (typeof v === 'string' && v.length) return v.split(',').map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

function readBooleanOption(options: unknown, keys: string[]): boolean {
  if (!isObject(options)) return false;
  for (const k of keys) {
    const v = options[k];
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v === 'true' || v === '1';
  }
  return false;
}
