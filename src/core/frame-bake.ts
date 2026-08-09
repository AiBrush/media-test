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
 *     presentation order. Pairing is timestamp-keyed and one-to-one; array position can never relabel
 *     pixels from a different presentation instant.
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

import type { DecodeOptions, FrameDigest, FrameSink, MediaEngine, MediaInput } from './engine.ts';
import { getEngine } from './registry.ts';
import { digestFrame } from './oracles.ts';
import { canonicalizeJson, canonicalJsonSha256 } from './canonical-json.ts';
import { sha256Hex } from './seeded-rng.ts';
import { pairFramesByTimestamp } from './golden-frame-evidence.ts';
import {
  ALPHA_DIGEST_ALGORITHM,
  ALPHA_EVIDENCE_SCHEMA,
  alphaFrameEvidence,
  type AlphaEvidenceArtifact,
  type AlphaFrameEvidence,
} from '../features/decode-seek/alpha.ts';

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
  /** Evidence that the digest/signature came from actual decoded pixels at this exact PTS. */
  pixelProvenance?: FramePixelProvenance;
}

export interface FramePixelProvenance {
  state: 'real-pixels' | 'missing-pixels';
  source: 'FrameSink.getPixels' | 'ImageDecoder' | 'createImageBitmap' | 'unavailable';
  expectedPtsUs: number;
  observedPtsUs?: number;
  pixelNormalizationVersion: typeof PIXEL_NORMALIZATION_VERSION;
  codedDimensions: { width: number | null; height: number | null };
  displayDimensions: { width: number | null; height: number | null };
  colorSpace: { state: 'not-exposed-by-frame-sink' | 'recorded'; value?: Record<string, unknown> };
  crop: { state: 'not-exposed-by-frame-sink' | 'recorded'; value?: Record<string, number> };
  rotation: { state: 'not-exposed-by-frame-sink' | 'recorded'; degrees?: number };
}

export interface FrameBakeSourceIdentity {
  sha256: string;
  sizeBytes: number;
}

export interface FrameBakeRuntimeProvenance {
  browser: {
    family: string;
    version: string;
    executable: string | null;
    userAgent: string;
  };
  platform: {
    os: string;
    arch: string;
    locale: string;
    timezone: string;
  };
  /** Complete locked publication perimeter supplied by the filesystem orchestrator. */
  toolPerimeter: Record<string, unknown>;
  decoderConfiguration: Record<string, unknown>;
  startedAtIso: string;
  finishedAtIso?: string;
}

/** The `fixtures/golden/<id>.frames.json` document (both the $todo placeholder and the filled form). */
export interface GoldenFramesDoc {
  schema?: 'media-test/golden-artifact@1';
  schemaVersion?: '1.0.0';
  artifactKind?: 'frames';
  $todo?: string;
  /** true while digests are unfilled; this pass sets it false ONLY when EVERY listed frame is filled. */
  pending: boolean;
  assetId: string;
  sourceMedia?: FrameBakeSourceIdentity;
  pixelNormalizationVersion?: typeof PIXEL_NORMALIZATION_VERSION;
  availability?: { state: 'ready' | 'pending' | 'producer-failed'; reasonCode?: string; detail?: string };
  provenance?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  frames: GoldenFrameEntry[];
  /** provenance stamp added by this pass (informational; never read by the oracle). */
  bakedBy?: string;
  bakedAtIso?: string;
  /** honest note when the golden could only be PARTIALLY filled (kept pending). */
  bakeNote?: string;
}

/** The `fixtures/golden/<id>.ssim.json` side-file: one downsampled-luma signature per filled frame. */
export interface GoldenSsimDoc {
  schema: 'media-test/golden-artifact@1';
  schemaVersion: '1.0.0';
  artifactKind: 'ssim';
  $note: string;
  assetId: string;
  sourceMedia: FrameBakeSourceIdentity;
  availability: { state: 'ready' };
  provenance: Record<string, unknown>;
  payload: Record<string, unknown>;
  /** square side of each signature (signature length === side*side); consumed via round(sqrt(len)). */
  side: number;
  /** per-frame block-averaged Rec.601 luma signatures (number[][]); oracles.ts parseSsimRef reads this. */
  sigs: number[][];
}

/** Exact timestamp-keyed alpha evidence, independently source-bound and browser-qualified. */
export interface GoldenAlphaDoc {
  schema: 'media-test/golden-artifact@1';
  schemaVersion: '1.0.0';
  artifactKind: 'alpha';
  assetId: string;
  sourceMedia: FrameBakeSourceIdentity;
  pixelNormalizationVersion: typeof PIXEL_NORMALIZATION_VERSION;
  availability: { state: 'ready' };
  provenance: Record<string, unknown>;
  payload: AlphaEvidenceArtifact;
}

// ── Tunables ────────────────────────────────────────────────────────────────────────────────────

/**
 * Downsampled-luma signature side. 16 → 256-value signatures: small enough to commit, large enough to
 * discriminate a correct decode from a wrong/garbled one under the ssim-psnr oracle's global-window
 * `sigSsim`. The oracle derives the side from the signature length (round(sqrt(len))), so any square
 * side is accepted; we pick a single fixed side for every asset so the committed golden is uniform.
 */
const LUMA_SIG_SIDE = 16;
export const PIXEL_NORMALIZATION_VERSION = 'normalized-rgba-tight-top-left-straight-alpha@1' as const;

/**
 * Decode a modest margin of leading frames beyond the golden's listed prefix so the WebCodecs decoder
 * has enough lookahead to emit a STABLE presentation prefix (past any B-frame reorder / DPB flush).
 * Frame digests are CAUSAL — decoding MORE frames never changes an already-emitted presentation frame's
 * pixels — so the first `listed.length` digests are byte-identical for any window ≥ listed + reorder
 * depth. 64 (≫ H.264 max DPB 16 + a 12-frame golden) is ample and ~5× cheaper to bake than a
 * benchmark-sized 300-frame window, yielding identical goldens. (Lowered from 300 so the nested
 * real-media corpus — incl. long/high-fps clips — bakes in a tractable, timeout-free pass.)
 */
const FRAME_BAKE_DECODE_MIN_FRAMES = 64;

/**
 * Tolerance (µs) for matching a golden frame's ffprobe PTS to a platform-decoded frame's PTS — the
 * HONESTY GATE (§0.1/§0.6). golden[i] is filled ONLY from the decoded frame whose PTS equals
 * golden[i].ptsUs (± this). A genuine decode reproduces the container timestamps to within timebase
 * rounding (single-digit µs: WebCodecs VideoFrame.timestamp vs ffprobe round(pts_time*1e6)). When the
 * platform routes through an HTMLVideoElement, frame-bake supplies every listed source PTS and its
 * non-zero origin. The presenter seeks the corresponding zero-based media times, proves each surface
 * with requestVideoFrameCallback, and retains the original source PTS labels. Any route that ignores
 * those anchors still lands outside this tolerance and stays pending rather than relabeling wrong pixels.
 * 1 ms « the smallest genuine inter-frame gap in the corpus (240 fps → 4167 µs), so it can never
 * cross-match an adjacent frame, yet » container-timebase rounding, and « any real sparse-fallback skip.
 */
const PTS_MATCH_TOL_US = 1000;

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
  alphaFile: string;
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
  /** exact alpha-plane side-file, emitted only when explicitly requested and the bake is complete. */
  alphaDoc?: GoldenAlphaDoc;
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
): Promise<DecodedFrameEvidence | null> {
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
        return { digest, image, pixelSource: 'ImageDecoder' };
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
        return { digest, image, pixelSource: 'createImageBitmap' };
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
  force = false,
  runtimeProvenance?: FrameBakeRuntimeProvenance,
  includeAlphaEvidence = false,
): Promise<FrameBakeAssetResult> {
  const framesFile = `${assetId}.frames.json`;
  const ssimFile = `${assetId}.ssim.json`;
  const alphaFile = `${assetId}.alpha.json`;
  const base: Omit<FrameBakeAssetResult, 'status' | 'note'> = {
    assetId,
    framesFile,
    ssimFile,
    alphaFile,
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
  if (alreadyFilled && !force && !includeAlphaEvidence) {
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

  // Bind every browser-qualified artifact to the exact source bytes. A placeholder produced for a
  // different digest is stale evidence and must never be silently relabeled.
  let sourceIdentity: FrameBakeSourceIdentity;
  try {
    const sourceBytes = new Uint8Array(await input.arrayBuffer());
    sourceIdentity = { sha256: sha256Hex(sourceBytes), sizeBytes: sourceBytes.byteLength };
  } catch (err) {
    return {
      ...base,
      status: 'failed',
      note: `source bytes unavailable (${errMsg(err)}) — golden left pending`,
    };
  }
  if (
    placeholder.sourceMedia &&
    (placeholder.sourceMedia.sha256 !== sourceIdentity.sha256 || placeholder.sourceMedia.sizeBytes !== sourceIdentity.sizeBytes)
  ) {
    return {
      ...base,
      status: 'failed',
      note: 'source digest/size differs from the frame placeholder — explicit fixture update + rebake required',
    };
  }

  // Decode → an ordered list of decoded frames (with pixels for the luma signature).
  let decoded: DecodedFrameEvidence[];
  try {
    decoded = await decodeAssetFrames(
      assetId,
      engine,
      input,
      Math.max(listed.length, FRAME_BAKE_DECODE_MIN_FRAMES),
      exactPresentationTimesForFrameBake(listed),
    );
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

  const materialized = materializeFrameEvidence(listed, decoded, PTS_MATCH_TOL_US);
  const { frames: filledFrames, sigs, filledCount } = materialized;
  base.filledFrames = filledCount;

  const complete = filledCount === listed.length;
  const stamp = bakeStamp(runtimeProvenance);
  const runtime = runtimeProvenance ?? defaultRuntimeProvenance(stamp.iso);
  const framesPayload = jsonSafe({
    pixelNormalizationVersion: PIXEL_NORMALIZATION_VERSION,
    decoderAvailability: {
      state: 'available',
      decoder: 'platform-engine',
      configuration: runtime.decoderConfiguration,
    },
    frames: filledFrames,
  });
  const framesProvenance = browserGoldenProvenance('frames', assetId, sourceIdentity, framesPayload, runtime, stamp.iso);
  const framesDoc: GoldenFramesDoc = {
    schema: 'media-test/golden-artifact@1',
    schemaVersion: '1.0.0',
    artifactKind: 'frames',
    ...(placeholder.$todo !== undefined ? { $todo: placeholder.$todo } : {}),
    pending: !complete,
    assetId,
    sourceMedia: sourceIdentity,
    pixelNormalizationVersion: PIXEL_NORMALIZATION_VERSION,
    availability: complete
      ? { state: 'ready' }
      : {
          state: 'pending',
          reasonCode: 'FRAME_PIXELS_OR_TIMESTAMP_MISSING',
          detail: `real pixels matched ${filledCount}/${listed.length} expected presentation timestamps`,
        },
    provenance: framesProvenance,
    payload: framesPayload,
    frames: filledFrames,
    bakedBy: stamp.bakedBy,
    bakedAtIso: stamp.iso,
  };
  if (!complete) {
    framesDoc.bakeNote =
      `PARTIAL: decoded ${filledCount}/${listed.length} listed frames; kept pending so the ` +
      'decoded-frames-bitexact / ssim oracles report NA rather than pass against a partial golden.';
  }

  // Emit the luma-signature side-file ONLY for a COMPLETE golden. loadGolden (oracles.ts) reads ssim.json
  // INDEPENDENTLY of the frames `pending` flag, so a partial ssim would let ssim-psnr keep scoring (a
  // FAIL) instead of the honest NA the pending frames golden intends. A partial asset ships NO ssimDoc →
  // the orchestrator writes no ssim.json (and prunes any stale one) → decodeFrameGoldenGap ⇒ NA_ASSET.
  const ssimDoc: GoldenSsimDoc | undefined = complete
    ? (() => {
        const ssimPayload = jsonSafe({
          pixelNormalizationVersion: PIXEL_NORMALIZATION_VERSION,
          side: LUMA_SIG_SIDE,
          frames: materialized.matches.map((match, index) => ({
            expectedPtsUs: match.expectedPtsUs,
            observedPtsUs: match.observedPtsUs,
            signature: sigs[index],
          })),
          sigs,
        });
        return {
          schema: 'media-test/golden-artifact@1',
          schemaVersion: '1.0.0',
          artifactKind: 'ssim',
          $note:
            'Downsampled Rec.601 luma signatures (block-averaged) of the platform-decoded golden frames, in ' +
            'frames[] order. Consumed by the ssim-psnr oracle (oracles.ts parseSsimRef/sigSsim). Side = ' +
            `${LUMA_SIG_SIDE} → ${LUMA_SIG_SIDE * LUMA_SIG_SIDE}-value signatures.`,
          assetId,
          sourceMedia: sourceIdentity,
          availability: { state: 'ready' as const },
          provenance: browserGoldenProvenance('ssim', assetId, sourceIdentity, ssimPayload, runtime, stamp.iso),
          payload: ssimPayload,
          side: LUMA_SIG_SIDE,
          sigs,
        };
      })()
    : undefined;

  // Alpha is an explicit, strict artifact request. Never infer eligibility from the observed output:
  // if a decoder regression flattens alpha to opaque, publishing that exact output makes the oracle
  // fail rather than silently turning the candidate into NA_ASSET. Like SSIM, partial evidence is never
  // published because it could make an incomplete timeline look authoritative.
  const alphaDoc: GoldenAlphaDoc | undefined = complete && includeAlphaEvidence
    ? (() => {
        const alphaPayload: AlphaEvidenceArtifact = jsonSafe({
          schema: ALPHA_EVIDENCE_SCHEMA,
          assetId,
          sourceSha256: sourceIdentity.sha256,
          algorithm: ALPHA_DIGEST_ALGORITHM,
          frames: materialized.alphaFrames,
        });
        return {
          schema: 'media-test/golden-artifact@1',
          schemaVersion: '1.0.0',
          artifactKind: 'alpha',
          assetId,
          sourceMedia: sourceIdentity,
          pixelNormalizationVersion: PIXEL_NORMALIZATION_VERSION,
          availability: { state: 'ready' as const },
          provenance: browserGoldenProvenance('alpha', assetId, sourceIdentity, alphaPayload, runtime, stamp.iso),
          payload: alphaPayload,
        };
      })()
    : undefined;

  return {
    ...base,
    status: complete ? 'filled' : 'partial',
    note: complete
      ? `digested all ${filledCount} listed frame(s)`
      : `digested ${filledCount}/${listed.length} listed frame(s); golden kept pending (honest, no fabrication)`,
    framesDoc,
    ...(ssimDoc ? { ssimDoc } : {}),
    ...(alphaDoc ? { alphaDoc } : {}),
  };
}

export interface DecodedFrameEvidence {
  digest: FrameDigest;
  /** Absent means the decoder exposed a digest without real source pixels. */
  image?: ImageData;
  pixelSource?: FramePixelProvenance['source'];
}

interface FrameMaterializationResult {
  frames: GoldenFrameEntry[];
  sigs: number[][];
  alphaFrames: AlphaFrameEvidence[];
  filledCount: number;
  matches: Array<{ expectedPtsUs: number; observedPtsUs: number }>;
}

/** Pure honesty gate used by unit tests and the browser pass. Missing pixels can never become SSIM. */
export function materializeFrameEvidence(
  listed: readonly GoldenFrameEntry[],
  decoded: readonly DecodedFrameEvidence[],
  toleranceUs = PTS_MATCH_TOL_US,
): FrameMaterializationResult {
  const pairing = pairFramesByTimestamp(
    listed.map((frame) => ({ ptsUs: frame.ptsUs })),
    decoded.map((frame) => ({ ptsUs: frame.digest.ptsUs })),
    { toleranceUs, unmatchedPolicy: 'require-all-reference' },
  );
  const decodedByExpected = new Map(pairing.pairs.map((pair) => [pair.referenceIndex, decoded[pair.candidateIndex]!]));
  const frames: GoldenFrameEntry[] = [];
  const sigs: number[][] = [];
  const alphaFrames: AlphaFrameEvidence[] = [];
  const matches: Array<{ expectedPtsUs: number; observedPtsUs: number }> = [];
  let filledCount = 0;
  for (let expectedIndex = 0; expectedIndex < listed.length; expectedIndex++) {
    const expected = listed[expectedIndex]!;
    const observed = decodedByExpected.get(expectedIndex);
    const width = observed?.digest.width ?? null;
    const height = observed?.digest.height ?? null;
    const pixelProvenance: FramePixelProvenance = {
      state: observed?.image ? 'real-pixels' : 'missing-pixels',
      source: observed?.image ? observed.pixelSource ?? 'FrameSink.getPixels' : 'unavailable',
      expectedPtsUs: expected.ptsUs,
      ...(observed ? { observedPtsUs: observed.digest.ptsUs } : {}),
      pixelNormalizationVersion: PIXEL_NORMALIZATION_VERSION,
      codedDimensions: { width, height },
      displayDimensions: {
        width: observed?.image?.width ?? width,
        height: observed?.image?.height ?? height,
      },
      colorSpace: { state: 'not-exposed-by-frame-sink' },
      crop: { state: 'not-exposed-by-frame-sink' },
      rotation: { state: 'not-exposed-by-frame-sink' },
    };
    if (!observed?.image) {
      frames.push({
        index: expected.index,
        ptsUs: expected.ptsUs,
        ...(expected.keyframe !== undefined ? { keyframe: expected.keyframe } : {}),
        sha256: null,
        pixelProvenance,
      });
      continue;
    }
    frames.push({
      index: expected.index,
      ptsUs: expected.ptsUs,
      ...(expected.keyframe !== undefined ? { keyframe: expected.keyframe } : {}),
      sha256: observed.digest.sha256,
      ...(observed.digest.width !== undefined ? { width: observed.digest.width } : {}),
      ...(observed.digest.height !== undefined ? { height: observed.digest.height } : {}),
      pixelProvenance,
    });
    sigs.push(downsampleLuma(observed.image, LUMA_SIG_SIDE));
    alphaFrames.push(alphaFrameEvidence(
      expected.ptsUs,
      observed.image.width,
      observed.image.height,
      observed.image.data,
    ));
    matches.push({ expectedPtsUs: expected.ptsUs, observedPtsUs: observed.digest.ptsUs });
    filledCount++;
  }
  return { frames, sigs, alphaFrames, filledCount, matches };
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
  exactPresentationTimes: NonNullable<DecodeOptions['exactPresentationTimes']>,
): Promise<DecodedFrameEvidence[]> {
  if (isImageAsset(assetId)) {
    const one = await decodeImageToFrame(input);
    return one ? [one] : [];
  }

  const sink: FrameSink = await engine.decodeFrames(input, { maxFrames: count, exactPresentationTimes });
  const frames = Array.isArray(sink.frames) ? sink.frames : [];
  const out: DecodedFrameEvidence[] = [];
  const getPixels = typeof sink.getPixels === 'function' ? sink.getPixels.bind(sink) : undefined;
  for (let i = 0; i < frames.length && i < count; i++) {
    const digest = frames[i]!;
    // A digest without pixels is retained only as an explicit missing-pixels observation. It cannot
    // fill the frame golden and can never produce a luma signature.
    let image: ImageData | null = null;
    if (getPixels) {
      try {
        image = await getPixels(i);
      } catch {
        image = null;
      }
    }
    out.push({ digest, ...(image ? { image, pixelSource: 'FrameSink.getPixels' as const } : {}) });
  }
  return out;
}

/**
 * Build the exact source-timeline request carried into platform media-element fallbacks. Frame
 * placeholders list a leading presentation sequence, so the first listed PTS is its timeline origin;
 * retaining that non-zero origin keeps relative HTML media seeks and absolute golden matching honest.
 */
export function exactPresentationTimesForFrameBake(
  listed: readonly Pick<GoldenFrameEntry, 'ptsUs'>[],
): NonNullable<DecodeOptions['exactPresentationTimes']> {
  if (listed.length === 0) throw new Error('frame-bake exact presentation request requires listed frames');
  const timestampsUs = listed.map((frame) => frame.ptsUs);
  let previousPtsUs: number | undefined;
  for (const ptsUs of timestampsUs) {
    if (!Number.isSafeInteger(ptsUs)) {
      throw new Error('frame-bake listed presentation timestamps must be safe integer microseconds');
    }
    if (previousPtsUs !== undefined && ptsUs <= previousPtsUs) {
      throw new Error('frame-bake listed presentation timestamps must be strictly increasing and unique');
    }
    previousPtsUs = ptsUs;
  }
  return { originUs: timestampsUs[0]!, timestampsUs };
}

// ── Top-level pass (decode every pending asset, return the write-back map) ───────────────────────

export interface FrameBakeOptions {
  /** restrict to these asset ids (default: every manifest asset with a frames.json placeholder). */
  assetIds?: string[];
  /** regenerate even when the existing frames golden is already filled. */
  force?: boolean;
  /** Emit exact timestamp-keyed alpha evidence for every explicitly selected asset. */
  includeAlphaEvidence?: boolean;
  /** progress callback (done, total, current asset id). */
  onProgress?: (done: number, total: number, assetId: string) => void;
  /** Exact browser executable/build and host perimeter supplied by the filesystem orchestrator. */
  provenance?: FrameBakeRuntimeProvenance;
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
        result = await bakeAssetFrames(
          id,
          engine,
          opts.force === true,
          opts.provenance,
          opts.includeAlphaEvidence === true,
        );
      } catch (err) {
        result = {
          assetId: id,
          framesFile: `${id}.frames.json`,
          ssimFile: `${id}.ssim.json`,
          alphaFile: `${id}.alpha.json`,
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
        if (result.alphaDoc && result.alphaDoc.payload.frames.length > 0) {
          writes[result.alphaFile] = JSON.stringify(result.alphaDoc, null, 2) + '\n';
        }
      }
    }
    opts.onProgress?.(ids.length, ids.length, '');

    const stamp = bakeStamp(opts.provenance);
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

function defaultRuntimeProvenance(startedAtIso: string): FrameBakeRuntimeProvenance {
  let userAgent = 'browser';
  let locale = 'und';
  let timezone = 'not-exposed';
  let os = 'not-exposed';
  let arch = 'not-exposed';
  try {
    if (typeof navigator !== 'undefined') {
      userAgent = navigator.userAgent || userAgent;
      locale = navigator.language || locale;
      os = navigator.platform || os;
      const navData = (navigator as Navigator & { userAgentData?: { platform?: string; architecture?: string } }).userAgentData;
      os = navData?.platform || os;
      arch = navData?.architecture || arch;
    }
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || timezone;
  } catch {
    /* keep explicit not-exposed values */
  }
  return {
    browser: { family: 'unknown', version: 'unknown', executable: null, userAgent },
    platform: { os, arch, locale, timezone },
    // A browser-only/manual run can still write compatibility evidence, but this deliberately does
    // not impersonate the locked filesystem publication perimeter. Active-generation import rejects
    // it until scripts/frame-bake.mjs supplies the complete toolchain record.
    toolPerimeter: {
      schemaVersion: 'browser-only-unpublishable@1',
      browser: { family: 'unknown', version: 'unknown', executable: null, userAgent },
      platform: { os, arch, locale, timezone },
    },
    decoderConfiguration: {
      engine: PLATFORM_ENGINE_ID,
      framePixelAccess: 'FrameSink.getPixels',
      pixelNormalizationVersion: PIXEL_NORMALIZATION_VERSION,
    },
    startedAtIso,
  };
}

/** Remove `undefined` before canonical hashing; provenance must be strict JSON. */
function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function browserGoldenProvenance(
  artifactKind: 'frames' | 'ssim' | 'alpha',
  assetId: string,
  sourceMedia: FrameBakeSourceIdentity,
  payload: unknown,
  runtime: FrameBakeRuntimeProvenance,
  finishedAtIso: string,
): Record<string, unknown> {
  const normalizedArguments = {
    assetId,
    artifactKind,
    sourceSha256: sourceMedia.sha256,
    sourceSizeBytes: sourceMedia.sizeBytes,
    pixelNormalizationVersion: PIXEL_NORMALIZATION_VERSION,
    browser: runtime.browser,
    browserPlatform: runtime.platform,
    decoderConfiguration: runtime.decoderConfiguration,
  };
  const canonicalPayload = canonicalizeJson(payload);
  return {
    schema: 'media-test/golden-provenance@1',
    schemaVersion: '1.0.0',
    artifactKind,
    assetId,
    sourceMedia,
    buildDefinition: {
      recipe: `src/core/frame-bake.ts#${artifactKind}`,
      normalizedArguments,
      normalizedArgumentsSha256: canonicalJsonSha256(normalizedArguments),
      dependencies: [],
    },
    runDetails: {
      baker: 'media-test/frame-bake@1',
      perimeter: runtime.toolPerimeter,
      startedAtIso: runtime.startedAtIso,
      finishedAtIso: runtime.finishedAtIso ?? finishedAtIso,
      timeMode: 'browser-qualified-wall-clock',
      browserQualified: true,
    },
    outputArtifact: {
      digestScope: 'canonical-payload',
      sha256: sha256Hex(new TextEncoder().encode(canonicalPayload)),
      sizeBytes: new TextEncoder().encode(canonicalPayload).byteLength,
    },
  };
}

/** Provenance stamp (browser build, from the UA) so a committed golden records what produced it. */
function bakeStamp(runtime?: FrameBakeRuntimeProvenance): { bakedBy: string; iso: string } {
  let ua = 'browser';
  try {
    if (runtime?.browser.userAgent) ua = runtime.browser.userAgent;
    else if (typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string') ua = navigator.userAgent;
  } catch {
    /* ignore */
  }
  const browser = runtime ? `${runtime.browser.family} ${runtime.browser.version}` : 'browser';
  return {
    bakedBy: `frame-bake (platform engine) · ${browser} · ${ua}`,
    iso: runtime?.finishedAtIso ?? new Date().toISOString(),
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
