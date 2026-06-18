/**
 * src/core/frame-bake.ts — the IN-BROWSER golden frame-digest pass (§5.1/§5.2, bake.mjs `frameHookFor`).
 *
 * WHY THIS EXISTS. The offline bake (fixtures/bake.mjs, ffmpeg/ffprobe) can derive `*.meta.json` and
 * `*.packets.json`, but it CANNOT produce `*.frames.json` digests: a frame digest is the sha256 of the
 * browser's NORMALIZED RGBA buffer (src/engines/platform/digest.ts — tight, top-left, straight-alpha),
 * and ffmpeg's YUV→RGB + a canvas rasterization do not agree byte-for-byte. So the bake emits a clearly
 * marked PLACEHOLDER ( { "$todo": …, "pending": true, frames:[{index,ptsUs,keyframe,sha256:null}] } )
 * and defers the digests to THIS pass, which decodes each corpus asset with the **platform** engine
 * (raw WebCodecs / <video> / ImageDecoder — no library) in a real browser and fills `frames[].sha256`
 * plus a downsampled-luma signature side-file (`*.ssim.json`). It is the producer the golden loader's
 * `pending`-aware reader (oracles.ts `loadGolden`) and bake.mjs's "don't clobber a browser-filled
 * frames golden" check were written for.
 *
 * HONESTY (rule §0.1 / §0.6 — a wrong oracle is WORSE than an honest FAIL).
 *   - We digest ONLY frames the platform engine actually decoded; a frame we could not decode keeps
 *     `sha256: null`. If ANY listed frame is missing (or the asset would not decode at all), the
 *     emitted golden is left `pending: true` (status 'partial' / 'failed') so the decoded-frames-bitexact
 *     / ssim oracles keep reporting NA — never a green oracle against a fabricated/partial golden.
 *   - We never invent a digest, and we never reorder/relabel the golden frame list: the golden's
 *     `index` / `ptsUs` / `keyframe` are authoritative (the oracle matches by index, then golden pts);
 *     we only OVERWRITE the `sha256` field, in golden order, with the engine's decoded-frame digests in
 *     presentation order. (decodeFrames returns frames sorted by pts and re-indexed 0..N-1; we pair
 *     golden[i] ↔ decoded[i].)
 *   - Image negatives (jpeg/png/webp) are decoded via ImageDecoder/createImageBitmap (a still is not a
 *     <video> nor an MP4/WebM the inline demux understands); their single frame is digested the same way.
 *
 * SCOPE / RULES. This module is BROWSER-ONLY and side-effect-free on disk: a browser page cannot write
 * fixtures/. It DECODES + DIGESTS and RETURNS the filled golden payloads (keyed by output filename);
 * the orchestrator that drives the page (the /chrome flow, mirroring how `record-fixture.html` hands a
 * captured asset back) reads the returned payloads and writes them to fixtures/golden/. A `download`
 * helper + a `window.__FRAME_BAKE__` control surface (mirroring app/main.ts's `window.__SUITE__`) let
 * the run be triggered + awaited programmatically. Built-in browser APIs + the platform engine only —
 * nothing heavy is imported here; the platform engine is dynamically constructed via the registry so
 * frame-bake stays out of the suite shell's critical path. ESM `.ts` imports + `import type`, TS strict.
 *
 * ─── SOURCES ────────────────────────────────────────────────────────────────────────────────────
 *   - Golden format + the $todo/pending contract: fixtures/bake.mjs `frameHookFor` (lines ~1207-1247),
 *     and the bake's "don't clobber a browser-filled frames golden" guard (~1380-1400).
 *   - Frame normalization + digest rule: src/engines/platform/digest.ts, mirrored by oracles.ts
 *     `digestFrame`; the golden loader's pending/holey-digest handling: oracles.ts `loadGolden`.
 *   - Luma-signature format consumed by the ssim-psnr oracle: oracles.ts `parseSsimRef` /
 *     `downsampleLuma` / `sigSide` (square side = round(sqrt(len)); Rec.601 block-average).
 *   - Platform decode (WebCodecs + <video> + the helper) is the §5.2 oracle decoder: src/engines/
 *     platform/{adapter,decode,oracle-helpers,raster,digest}.ts.
 *   - WebCodecs / ImageDecoder references: research/dossiers/platform.md (per the platform adapter header).
 */

import type { FrameDigest, FrameSink, MediaEngine, MediaInput } from './engine.ts';
import { getEngine } from './registry.ts';
import { digestFrame } from './oracles.ts';

// ── The golden frame-json shape we read (placeholder) and write (filled) ────────────────────────

/** One entry of a golden `frames[]` list (placeholder has sha256:null; we fill it). */
export interface GoldenFrameEntry {
  index: number;
  ptsUs: number;
  keyframe?: boolean;
  /** sha256 hex of the normalized RGBA buffer; null in the placeholder, filled by this pass. */
  sha256: string | null;
  width?: number;
  height?: number;
}

/** The `fixtures/golden/<id>.frames.json` document (both the $todo placeholder and the filled form). */
export interface GoldenFramesDoc {
  $todo?: string;
  /** true while digests are unfilled; this pass sets it false ONLY when EVERY listed frame is filled. */
  pending: boolean;
  assetId: string;
  frames: GoldenFrameEntry[];
  /** provenance stamp added by this pass (informational; never read by the oracle). */
  bakedBy?: string;
  bakedAtIso?: string;
  /** honest note when the golden could only be PARTIALLY filled (kept pending). */
  bakeNote?: string;
}

/** The `fixtures/golden/<id>.ssim.json` side-file: one downsampled-luma signature per filled frame. */
export interface GoldenSsimDoc {
  $note: string;
  assetId: string;
  /** square side of each signature (signature length === side*side); consumed via round(sqrt(len)). */
  side: number;
  /** per-frame block-averaged Rec.601 luma signatures (number[][]); oracles.ts parseSsimRef reads this. */
  sigs: number[][];
}

// ── Tunables ────────────────────────────────────────────────────────────────────────────────────

/**
 * Downsampled-luma signature side. 16 → 256-value signatures: small enough to commit, large enough to
 * discriminate a correct decode from a wrong/garbled one under the ssim-psnr oracle's global-window
 * `sigSsim`. The oracle derives the side from the signature length (round(sqrt(len))), so any square
 * side is accepted; we pick a single fixed side for every asset so the committed golden is uniform.
 */
const LUMA_SIG_SIDE = 16;

/** Where the static golden lives (served by the dev server's fixturesStatic middleware). */
const GOLDEN_BASE = 'fixtures/golden';
/** Where the static media lives (served raw, Range-capable). */
const MEDIA_BASE = 'fixtures/media';

/** The platform engine's registry id (its factory builds the raw-WebCodecs decoder). */
const PLATFORM_ENGINE_ID = 'platform';

// ── Result types for the per-asset pass ─────────────────────────────────────────────────────────

export type FrameBakeStatus =
  | 'filled' // every listed frame digested → golden written non-pending
  | 'partial' // some frames digested, some not → golden kept pending (honest, no fabrication)
  | 'failed' // asset would not decode / no frames produced → golden untouched-pending
  | 'skipped'; // no placeholder to fill (already baked, or no frames.json), or asset absent

export interface FrameBakeAssetResult {
  assetId: string;
  /** the golden filename relative to fixtures/golden, e.g. 'av1_720p_5s.webm.frames.json' */
  framesFile: string;
  ssimFile: string;
  status: FrameBakeStatus;
  /** count of golden frames listed vs how many this pass actually digested */
  listedFrames: number;
  filledFrames: number;
  /** human-readable note (why partial/failed/skipped). */
  note: string;
  /** the filled golden doc to WRITE BACK (absent for skipped/failed-no-change). */
  framesDoc?: GoldenFramesDoc;
  /** the luma-signature side-file to WRITE BACK (present iff ≥1 frame filled). */
  ssimDoc?: GoldenSsimDoc;
}

export interface FrameBakeReport {
  generatedAtIso: string;
  bakedBy: string;
  /** every asset whose `*.frames.json` placeholder we attempted to fill. */
  assets: FrameBakeAssetResult[];
  /** convenience roll-up the orchestrator prints. */
  summary: { filled: number; partial: number; failed: number; skipped: number };
  /**
   * The write-back map the orchestrator persists: golden filename (relative to fixtures/golden) → the
   * JSON text to write. Includes both `*.frames.json` (for filled/partial) and `*.ssim.json` side-files.
   * Only files with NEW content appear here (a fully-pending/failed asset contributes nothing).
   */
  writes: Record<string, string>;
}

// ── Asset id discovery ───────────────────────────────────────────────────────────────────────────

/**
 * Discover the asset ids that have a `*.frames.json` golden. The dev server serves fixtures statically
 * but offers no directory listing, so we read the canonical id set from the committed manifest
 * (fixtures/manifest.json) — the single source of truth for corpus ids — and keep only those an asset
 * actually carries a frames.json for (probed by a cheap HEAD/GET). Callers may pass an explicit id list
 * to bake a subset (e.g. one asset under test).
 */
async function discoverAssetIds(explicit?: string[]): Promise<string[]> {
  if (explicit && explicit.length) return [...explicit];
  const ids: string[] = [];
  try {
    const res = await fetch(`${MEDIA_BASE}/../manifest.json`, { cache: 'no-store' });
    if (res.ok) {
      const manifest = (await res.json()) as { assets?: Array<{ id?: string }> };
      for (const a of manifest.assets ?? []) {
        if (a && typeof a.id === 'string' && a.id && !a.id.startsWith('$')) ids.push(a.id);
      }
    }
  } catch {
    /* manifest unavailable → empty discovery; caller can still pass explicit ids */
  }
  return ids;
}

// ── Golden IO (read placeholder; the orchestrator writes the filled docs back) ──────────────────

/** Fetch a golden frames.json placeholder for an asset; undefined if absent (404) or unparseable. */
async function fetchFramesPlaceholder(assetId: string): Promise<GoldenFramesDoc | undefined> {
  try {
    const res = await fetch(`${GOLDEN_BASE}/${assetId}.frames.json`, { cache: 'no-store' });
    if (!res.ok) return undefined;
    const doc = (await res.json()) as unknown;
    if (!isObject(doc) || !Array.isArray((doc as { frames?: unknown }).frames)) return undefined;
    return doc as unknown as GoldenFramesDoc;
  } catch {
    return undefined;
  }
}

// ── MediaInput backed by a served static asset (mirrors the runner's input construction) ─────────

/** Build a MediaInput for a corpus asset served at /fixtures/media/<id> (HTTP-Range capable). */
function staticMediaInput(assetId: string): MediaInput {
  const url = `${MEDIA_BASE}/${assetId}`;
  let blobP: Promise<Blob> | undefined;
  const fetchBlob = (): Promise<Blob> => {
    if (!blobP) {
      blobP = fetch(url, { cache: 'no-store' }).then((r) => {
        if (!r.ok) throw new Error(`asset fetch ${assetId}: HTTP ${r.status}`);
        return r.blob();
      });
    }
    return blobP;
  };
  return {
    id: assetId,
    url,
    mime: mimeForAsset(assetId),
    blob: fetchBlob,
    arrayBuffer: async () => {
      const b = await fetchBlob();
      return b.arrayBuffer();
    },
  };
}

// ── The platform decoder (constructed once via the registry) ────────────────────────────────────

/**
 * Construct + init the platform engine via the registry factory. UNTIMED setup (§0.7) — this pass is a
 * bake, not a benchmark, so we simply await init() once and reuse the instance across assets. Throws a
 * clear error if the platform engine is not registered (the page must have run registerAll() first).
 */
async function makePlatformEngine(): Promise<MediaEngine> {
  const reg = getEngine(PLATFORM_ENGINE_ID);
  if (!reg) {
    throw new Error(
      `frame-bake: the '${PLATFORM_ENGINE_ID}' engine is not registered — call registerAll()/registerPlatform() ` +
        'before running the frame-bake pass (it decodes every asset with the platform engine).',
    );
  }
  const engine = await reg.factory();
  if (typeof engine.init === 'function') await engine.init();
  return engine;
}

// ── Image decode path (still images are not <video>/MP4/WebM) ────────────────────────────────────

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif']);

function extOf(assetId: string): string {
  return (assetId.split('.').pop() ?? '').toLowerCase();
}
function isImageAsset(assetId: string): boolean {
  return IMAGE_EXTS.has(extOf(assetId));
}

/**
 * Decode a still image to a single normalized FrameDigest (+ ImageData), via ImageDecoder when present
 * (WebCodecs image path) and falling back to createImageBitmap. Rasterizes to a 2D canvas exactly like
 * the platform raster path so the digest is byte-compatible with golden/other engines. Returns null if
 * the realm cannot decode an image (no DOM canvas + no OffscreenCanvas), so the caller fails honestly.
 */
async function decodeImageToFrame(
  input: MediaInput,
): Promise<{ digest: FrameDigest; image: ImageData } | null> {
  const buf = await input.arrayBuffer();
  const bytes = new Uint8Array(buf);

  // Prefer ImageDecoder (WebCodecs) when available; it gives a VideoFrame we rasterize like any other.
  const ImageDecoderCtor = (globalThis as Record<string, unknown>).ImageDecoder as
    | (new (init: { data: BufferSource; type: string }) => {
        decode(): Promise<{ image: VideoFrame }>;
        close?: () => void;
      })
    | undefined;
  if (typeof ImageDecoderCtor === 'function') {
    let frame: VideoFrame | undefined;
    try {
      const dec = new ImageDecoderCtor({ data: bytes, type: input.mime || mimeForAsset(input.id) });
      const out = await dec.decode();
      frame = out.image;
      const image = imageDataFromCanvasSource(frame, frame.displayWidth || frame.codedWidth, frame.displayHeight || frame.codedHeight);
      if (image) {
        const digest = await digestFrame(image, 0, 0);
        return { digest, image };
      }
    } catch {
      /* fall through to createImageBitmap */
    } finally {
      try {
        frame?.close();
      } catch {
        /* ignore */
      }
    }
  }

  // Fallback: createImageBitmap → canvas.
  if (typeof createImageBitmap === 'function') {
    let bitmap: ImageBitmap | undefined;
    try {
      const blob = new Blob([bytes.slice().buffer], { type: input.mime || mimeForAsset(input.id) });
      bitmap = await createImageBitmap(blob);
      const image = imageDataFromCanvasSource(bitmap, bitmap.width, bitmap.height);
      if (image) {
        const digest = await digestFrame(image, 0, 0);
        return { digest, image };
      }
    } catch {
      /* unreadable image */
    } finally {
      try {
        bitmap?.close();
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

/** Rasterize a CanvasImageSource (VideoFrame / ImageBitmap) to a tight RGBA ImageData via a 2D canvas. */
function imageDataFromCanvasSource(src: CanvasImageSource, width: number, height: number): ImageData | null {
  if (!width || !height || width <= 0 || height <= 0) return null;
  const ctx = make2dContext(width, height);
  if (!ctx) return null;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(src, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

/** A 2D context backed by OffscreenCanvas (page or Worker) or a DOM <canvas> (page only). */
function make2dContext(
  width: number,
  height: number,
): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null {
  if (typeof OffscreenCanvas === 'function') {
    const c = new OffscreenCanvas(width, height);
    const ctx = c.getContext('2d', { alpha: true, willReadFrequently: true });
    if (ctx) return ctx as OffscreenCanvasRenderingContext2D;
  }
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d', { alpha: true, willReadFrequently: true });
    if (ctx) return ctx as CanvasRenderingContext2D;
  }
  return null;
}

// ── The per-asset bake ───────────────────────────────────────────────────────────────────────────

/**
 * Bake ONE asset's golden frame digests. Reads its `*.frames.json` placeholder, decodes the asset with
 * the platform engine (or the image path for still images), digests as many of the listed frames as the
 * engine actually produced (in golden order, presentation order), and returns the filled docs.
 *
 * Decision table (honest, never fabricating):
 *   - no placeholder, or placeholder already filled (no null sha256)             → 'skipped'
 *   - asset would not decode / 0 frames produced                                 → 'failed' (golden untouched)
 *   - fewer decoded frames than listed (or some frames unreadable)               → 'partial' (kept pending)
 *   - every listed frame digested                                                → 'filled' (pending:false)
 */
export async function bakeAssetFrames(
  assetId: string,
  engine: MediaEngine,
): Promise<FrameBakeAssetResult> {
  const framesFile = `${assetId}.frames.json`;
  const ssimFile = `${assetId}.ssim.json`;
  const base: Omit<FrameBakeAssetResult, 'status' | 'note'> = {
    assetId,
    framesFile,
    ssimFile,
    listedFrames: 0,
    filledFrames: 0,
  };

  const placeholder = await fetchFramesPlaceholder(assetId);
  if (!placeholder) {
    return { ...base, status: 'skipped', note: 'no <id>.frames.json golden (audio-only/absent) — nothing to bake' };
  }
  const listed = placeholder.frames ?? [];
  base.listedFrames = listed.length;
  if (listed.length === 0) {
    return { ...base, status: 'skipped', note: 'frames.json lists 0 frames — nothing to digest' };
  }
  // Already baked? (a real, non-null sha256 present on every listed frame and not flagged pending).
  const alreadyFilled =
    placeholder.pending === false && listed.every((f) => typeof f.sha256 === 'string' && f.sha256.length > 0);
  if (alreadyFilled) {
    return { ...base, status: 'skipped', note: 'frames golden already filled (non-pending, all sha256 present)' };
  }

  // Confirm the asset is actually present before decoding (a 'provided'/'captured' asset may be absent).
  const input = staticMediaInput(assetId);
  try {
    const head = await fetch(input.url, { method: 'HEAD', cache: 'no-store' });
    if (!head.ok) {
      return {
        ...base,
        status: 'skipped',
        note: `asset not present at ${input.url} (HTTP ${head.status}) — drop it in + re-bake; golden left pending`,
      };
    }
  } catch {
    // HEAD may be unsupported by the static middleware; fall through and let the decode attempt report.
  }

  // Decode → an ordered list of decoded frames (with pixels for the luma signature).
  let decoded: DecodedFrame[];
  try {
    decoded = await decodeAssetFrames(assetId, engine, input, listed.length);
  } catch (err) {
    return {
      ...base,
      status: 'failed',
      note: `decode failed (${errMsg(err)}) — golden left pending (honest NA, no fabricated digest)`,
    };
  }
  if (decoded.length === 0) {
    return {
      ...base,
      status: 'failed',
      note: 'platform engine produced 0 decodable frames — golden left pending (honest NA)',
    };
  }

  // Pair golden[i] ↔ decoded[i] in order; fill sha256 only where a decoded frame exists. NEVER invent a
  // digest for a frame the engine did not produce — that frame keeps sha256:null and the doc stays pending.
  const filledFrames: GoldenFrameEntry[] = [];
  const sigs: number[][] = [];
  let filledCount = 0;
  for (let i = 0; i < listed.length; i++) {
    const goldenEntry = listed[i]!;
    const dec = decoded[i];
    if (dec) {
      const entry: GoldenFrameEntry = {
        index: goldenEntry.index,
        ptsUs: goldenEntry.ptsUs,
        sha256: dec.digest.sha256,
      };
      if (goldenEntry.keyframe !== undefined) entry.keyframe = goldenEntry.keyframe;
      if (dec.digest.width !== undefined) entry.width = dec.digest.width;
      if (dec.digest.height !== undefined) entry.height = dec.digest.height;
      filledFrames.push(entry);
      sigs.push(downsampleLuma(dec.image, LUMA_SIG_SIDE));
      filledCount++;
    } else {
      // keep the placeholder entry verbatim (sha256 stays null) so the gap is explicit + the doc pending.
      filledFrames.push({ ...goldenEntry, sha256: goldenEntry.sha256 ?? null });
    }
  }
  base.filledFrames = filledCount;

  const complete = filledCount === listed.length;
  const stamp = bakeStamp();
  const framesDoc: GoldenFramesDoc = {
    // Keep the $todo note for provenance, but flip pending only when EVERY frame is filled.
    $todo: placeholder.$todo,
    pending: !complete,
    assetId,
    frames: filledFrames,
    bakedBy: stamp.bakedBy,
    bakedAtIso: stamp.iso,
  };
  if (!complete) {
    framesDoc.bakeNote =
      `PARTIAL: decoded ${filledCount}/${listed.length} listed frames; kept pending so the ` +
      'decoded-frames-bitexact / ssim oracles report NA rather than pass against a partial golden.';
  }

  const ssimDoc: GoldenSsimDoc = {
    $note:
      'Downsampled Rec.601 luma signatures (block-averaged) of the platform-decoded golden frames, in ' +
      'frames[] order. Consumed by the ssim-psnr oracle (oracles.ts parseSsimRef/sigSsim). Side = ' +
      `${LUMA_SIG_SIDE} → ${LUMA_SIG_SIDE * LUMA_SIG_SIDE}-value signatures.`,
    assetId,
    side: LUMA_SIG_SIDE,
    sigs,
  };

  return {
    ...base,
    status: complete ? 'filled' : 'partial',
    note: complete
      ? `digested all ${filledCount} listed frame(s)`
      : `digested ${filledCount}/${listed.length} listed frame(s); golden kept pending (honest, no fabrication)`,
    framesDoc,
    ssimDoc,
  };
}

interface DecodedFrame {
  digest: FrameDigest;
  image: ImageData;
}

/**
 * Decode up to `count` frames of an asset in presentation order, returning {digest,image} per frame.
 * Routes still images to the ImageDecoder/createImageBitmap path and everything else to the platform
 * engine's decodeFrames (WebCodecs via the inline demux, with the engine's own <video> fallback for
 * containers the inline demux can't parse — e.g. MPEG-TS / fragmented MP4 / HLS init segment).
 */
async function decodeAssetFrames(
  assetId: string,
  engine: MediaEngine,
  input: MediaInput,
  count: number,
): Promise<DecodedFrame[]> {
  if (isImageAsset(assetId)) {
    const one = await decodeImageToFrame(input);
    return one ? [one] : [];
  }

  const sink: FrameSink = await engine.decodeFrames(input, { maxFrames: count });
  const frames = Array.isArray(sink.frames) ? sink.frames : [];
  const out: DecodedFrame[] = [];
  const getPixels = typeof sink.getPixels === 'function' ? sink.getPixels.bind(sink) : undefined;
  for (let i = 0; i < frames.length && i < count; i++) {
    const digest = frames[i]!;
    // The luma signature needs pixels. A platform FrameSink retains ImageData (getPixels); if a frame's
    // pixels are unavailable we still keep the digest but cannot emit its signature — fall back to a
    // zero-length sig (the ssim oracle simply gets no evidence for that frame, never a wrong one).
    let image: ImageData | null = null;
    if (getPixels) {
      try {
        image = await getPixels(i);
      } catch {
        image = null;
      }
    }
    out.push({ digest, image: image ?? emptyImage(digest) });
  }
  return out;
}

/** A 1x1 transparent ImageData stand-in when a decoded frame's pixels could not be read (sig → zeros). */
function emptyImage(digest: FrameDigest): ImageData {
  const w = 1;
  const h = 1;
  void digest;
  return new ImageData(new Uint8ClampedArray(w * h * 4), w, h);
}

// ── Top-level pass (decode every pending asset, return the write-back map) ───────────────────────

export interface FrameBakeOptions {
  /** restrict to these asset ids (default: every manifest asset with a frames.json placeholder). */
  assetIds?: string[];
  /** progress callback (done, total, current asset id). */
  onProgress?: (done: number, total: number, assetId: string) => void;
}

/**
 * Run the in-browser frame-bake over every (or the requested) asset and return a report whose `writes`
 * map the orchestrator persists into fixtures/golden/. The page cannot write fixtures itself, so this
 * is a PURE producer: decode → digest → return JSON text. Never throws on a per-asset failure (it is
 * recorded as 'failed'); only a missing platform engine (a setup error) rejects.
 */
export async function runFrameBake(opts: FrameBakeOptions = {}): Promise<FrameBakeReport> {
  const engine = await makePlatformEngine();
  try {
    const ids = await discoverAssetIds(opts.assetIds);
    const assets: FrameBakeAssetResult[] = [];
    const writes: Record<string, string> = {};
    const summary = { filled: 0, partial: 0, failed: 0, skipped: 0 };

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]!;
      opts.onProgress?.(i, ids.length, id);
      let result: FrameBakeAssetResult;
      try {
        result = await bakeAssetFrames(id, engine);
      } catch (err) {
        result = {
          assetId: id,
          framesFile: `${id}.frames.json`,
          ssimFile: `${id}.ssim.json`,
          status: 'failed',
          listedFrames: 0,
          filledFrames: 0,
          note: `unexpected error: ${errMsg(err)}`,
        };
      }
      assets.push(result);
      summary[result.status]++;
      // Only assets we actually filled (or partially filled) contribute write-backs.
      if (result.framesDoc && (result.status === 'filled' || result.status === 'partial')) {
        writes[result.framesFile] = JSON.stringify(result.framesDoc, null, 2) + '\n';
        if (result.ssimDoc && result.ssimDoc.sigs.length > 0) {
          writes[result.ssimFile] = JSON.stringify(result.ssimDoc, null, 2) + '\n';
        }
      }
    }
    opts.onProgress?.(ids.length, ids.length, '');

    const stamp = bakeStamp();
    return {
      generatedAtIso: stamp.iso,
      bakedBy: stamp.bakedBy,
      assets,
      summary,
      writes,
    };
  } finally {
    if (typeof engine.dispose === 'function') {
      try {
        await engine.dispose();
      } catch {
        /* ignore dispose errors — bake already produced its payloads */
      }
    }
  }
}

// ── Browser convenience: download the write-back bundle + a control surface for the orchestrator ─

/**
 * Trigger a browser download of the write-back bundle (one JSON whose keys are golden filenames and
 * whose values are the file text). The orchestrator OR a human can unpack it into fixtures/golden/.
 * Mirrors app/main.ts `downloadResults`. Page main thread only (needs the DOM for the <a> click).
 */
export function downloadFrameBake(report: FrameBakeReport, filename = 'frame-bake.golden.json'): void {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
  const payload = {
    schema: 'media-browser-test/frame-bake@1',
    generatedAtIso: report.generatedAtIso,
    bakedBy: report.bakedBy,
    summary: report.summary,
    assets: report.assets.map((a) => ({
      assetId: a.assetId,
      status: a.status,
      listedFrames: a.listedFrames,
      filledFrames: a.filledFrames,
      note: a.note,
    })),
    /** golden filename → file text; write each under fixtures/golden/. */
    writes: report.writes,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

declare global {
  interface Window {
    /** Control surface mirroring window.__SUITE__, for the /chrome orchestrator to drive the bake. */
    __FRAME_BAKE__?: {
      run(opts?: FrameBakeOptions): Promise<FrameBakeReport>;
      download(report: FrameBakeReport, filename?: string): void;
      ready: true;
    };
    /** set when a bake completes; the orchestrator reads .writes to persist the golden. */
    __FRAME_BAKE_REPORT__?: FrameBakeReport;
    /** simple completion flag the orchestrator can poll. */
    __FRAME_BAKE_DONE__?: boolean;
  }
}

/**
 * Install `window.__FRAME_BAKE__` so the /chrome flow can do:
 *   await window.__FRAME_BAKE__.run()  → returns the report; window.__FRAME_BAKE_REPORT__.writes is
 *   the { goldenFilename: fileText } map to write under fixtures/golden/.
 * Safe to call multiple times + in a non-window realm (no-op without a window). Returns the control.
 */
export function installFrameBakeControl(): Window['__FRAME_BAKE__'] | undefined {
  if (typeof window === 'undefined') return undefined;
  const control = {
    run: async (opts?: FrameBakeOptions): Promise<FrameBakeReport> => {
      window.__FRAME_BAKE_DONE__ = false;
      const report = await runFrameBake(opts);
      window.__FRAME_BAKE_REPORT__ = report;
      window.__FRAME_BAKE_DONE__ = true;
      return report;
    },
    download: downloadFrameBake,
    ready: true as const,
  };
  window.__FRAME_BAKE__ = control;
  return control;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────────────────────────

/**
 * Reduce an ImageData to a side×side mean-luma signature (block-averaged Rec.601), byte-for-byte the
 * same reduction oracles.ts uses (`downsampleLuma`) so a baked signature compares correctly under the
 * ssim-psnr oracle's `sigSsim`. Kept local (oracles.ts does not export it) but intentionally identical.
 */
function downsampleLuma(img: ImageData, side: number): number[] {
  const out = new Array<number>(side * side).fill(0);
  const counts = new Array<number>(side * side).fill(0);
  const d = img.data;
  const { width, height } = img;
  if (width <= 0 || height <= 0) return out;
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

/** Best-effort MIME for a corpus asset id (mirrors vite.config.mjs MIME map + a few audio/video types). */
function mimeForAsset(assetId: string): string {
  const ext = extOf(assetId);
  switch (ext) {
    case 'mp4':
    case 'm4v':
      return 'video/mp4';
    case 'm4a':
      return 'audio/mp4';
    case 'mov':
      return 'video/quicktime';
    case 'mkv':
      return 'video/x-matroska';
    case 'webm':
      return 'video/webm';
    case 'ts':
      return 'video/mp2t';
    case 'm3u8':
      return 'application/vnd.apple.mpegurl';
    case 'wav':
      return 'audio/wav';
    case 'aiff':
    case 'aif':
      return 'audio/aiff';
    case 'mp3':
      return 'audio/mpeg';
    case 'flac':
      return 'audio/flac';
    case 'ogg':
    case 'opus':
      return 'audio/ogg';
    case 'aac':
      return 'audio/aac';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'avif':
      return 'image/avif';
    case 'bmp':
      return 'image/bmp';
    default:
      return 'application/octet-stream';
  }
}

/** Provenance stamp (browser build, from the UA) so a committed golden records what produced it. */
function bakeStamp(): { bakedBy: string; iso: string } {
  let ua = 'browser';
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string') ua = navigator.userAgent;
  } catch {
    /* ignore */
  }
  return { bakedBy: `frame-bake (platform engine) · ${ua}`, iso: new Date().toISOString() };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
