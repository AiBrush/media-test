/**
 * src/core/runner.ts — the orchestration core (§5 negotiation, §0.1 correctness-gates-bench,
 * §10/§11 measurement + robustness).
 *
 * The runner is library-agnostic: it speaks only the `MediaEngine` contract (engine.ts) and the
 * engine-independent `Scenario` model (scenario.ts). Per (engine, scenario, browser) it:
 *   1. NEGOTIATES — declared `CapabilitySet` ∧ runtime `CodecSupport` vs `scenario.requires`.
 *      NA_ENGINE (engine never DECLARED the op/container/codec/feature/encryption) takes strict
 *      precedence over NA_BROWSER (engine declares it, but the browser can't configure the
 *      WebCodecs codec). The two are NEVER collapsed (anti-pattern §15).
 *   2. Runs the FUNCTIONAL operation first (probe/demux/remux/transcode/decodeFrames/seek/trim/
 *      mux/decrypt), assembles an `OracleContext`, runs every declared oracle. PASS iff all green.
 *   3. ONLY if status === PASS and the pillar includes performance, runs `bench()` per requested
 *      metric in fresh measured iterations and attaches `bench`. A FAIL or NA never gets a bench
 *      (§0.1: no green correctness oracle → no admissible benchmark).
 *   4. Enforces `scenario.timeoutMs` via `Promise.race`; for robustness scenarios with `mutate`,
 *      it mutates the input bytes first and expects graceful failure within the timeout.
 *   5. ALWAYS calls `engine.dispose()` in a finally.
 *
 * Everything is wrapped in try/catch → status ERROR with the error message. The oracle hooks
 * (`decodeWithPlatform`, `playbackSmoke`) are injected by the caller via `opts` so the registry/app
 * wires the platform engine; if absent, oracles that need them fail with a clear reason (handled in
 * oracles.ts).
 */

import type {
  BrowserName,
  CapabilitySet,
  DecryptKey,
  DemuxResult,
  EncodedTracks,
  EncryptionScheme,
  FrameDigest,
  FrameSink,
  MediaBytes,
  MediaEngine,
  MediaInput,
  NormalizedMetadata,
  Operation,
  RemuxOptions,
  MuxOptions,
  TranscodeOptions,
} from './engine.ts';
import type {
  BenchSummary,
  ExhaustiveFileResult,
  MetricId,
  MetricSample,
  OracleOutcome,
  Requires,
  Scenario,
  ScenarioFamily,
  ScenarioResult,
  RunEnv,
} from './scenario.ts';
import type { CodecSupport, EnvInfo } from './feature-detect.ts';
import type { BenchOptions } from './bench.ts';
import type { MeasureContext } from './measure.ts';
import type { GoldenStore, OracleContext } from './oracles.ts';

import { getEngine, listScoredEngines, listScenarios, getScenario } from './registry.ts';
import type { RegisteredEngine } from './registry.ts';
import { detectCodecSupport, detectEnv } from './feature-detect.ts';
import { Meter } from './measure.ts';
import { DEFAULT_BENCH, metricSampleValue, summarize, summarizeAcrossFiles } from './bench.ts';
import { loadGolden, runOracle } from './oracles.ts';
import { disabledCellReason } from './disabled-cells.ts';
// Per-scenario media-file rotation (§6/§10): the ONE seeded RNG shared with media-selection, plus the
// selection API. The runner only decides WHICH file is fetched — it never mutates bytes, softens an
// oracle, or routes a real defect to NA (hard rules R1/R2/R3).
import { mulberry32, hashSeed } from './seeded-rng.ts';
import {
  loadScenarioSources,
  selectForRun,
  candidatesForRun,
  selectionCacheTag,
  computeCorpusChecksum,
} from './media-selection.ts';
import type { ResolvedInput, ScenarioSelection } from './media-selection.ts';
// The platform engine IS the browser-pure oracle decoder/player (§8). runMatrix injects these into
// every cell so oracles that decode output / smoke-play it work without the caller wiring them.
import { decodeBytesToFrames, playbackSmoke as platformPlaybackSmoke } from '../engines/platform/oracle-helpers.ts';

// ── Negotiation ──────────────────────────────────────────────────────────────────────────────

export type Negotiation =
  | { ok: true }
  | { ok: false; status: 'NA_ENGINE' | 'NA_BROWSER'; reason: string };

/** Suite version surfaced into `RunEnv`; kept in sync with package.json. */
const SUITE_VERSION = '0.1.0';

/** Base URL the served corpus lives under (static files; HTTP Range supported). */
const FIXTURES_MEDIA_BASE = '/fixtures/media';
const FIXTURES_MANIFEST_URL = '/fixtures/manifest.json';

interface FixtureManifestAsset {
  id?: string;
  sha256?: string | null;
  sizeBytes?: number | null;
}

let fixtureManifestPromise: Promise<Map<string, FixtureManifestAsset> | undefined> | undefined;
let fixtureManifestCache: Map<string, FixtureManifestAsset> | undefined;

/**
 * Map a robustness `mutate` outcome (graceful failure expected) — the runner records `graceful`
 * when the engine throws/rejects within the timeout, `timeout` when it overruns, otherwise FAIL.
 */
type RobustnessVerdict = 'graceful' | 'timeout' | 'crash';

/**
 * Declared caps ∧ runtime support vs scenario.requires. NA_ENGINE (the engine did not DECLARE the
 * capability at all) takes precedence over NA_BROWSER (declared, but the browser cannot configure
 * the relevant WebCodecs codec). The reason names the specific missing capability/codec.
 *
 * We check capabilities in two passes so precedence is unambiguous:
 *   Pass 1 (engine declaration): operations, containersIn/Out, video/audio codecs, encryption,
 *           features. ANY undeclared requirement ⇒ NA_ENGINE immediately.
 *   Pass 2 (browser support): for every video/audio codec the engine DID declare and the scenario
 *           requires, the browser's WebCodecs decode/encode support must confirm it. If WebCodecs
 *           itself is missing, or a required codec is unconfigurable, ⇒ NA_BROWSER.
 */
export function negotiate(
  caps: CapabilitySet,
  support: CodecSupport,
  requires: Requires,
  options?: Scenario['options'],
): Negotiation {
  // ── Pass 1: engine declaration (NA_ENGINE wins) ──
  for (const op of requires.operations) {
    if (!caps.operations[op]) {
      return { ok: false, status: 'NA_ENGINE', reason: `engine does not declare operation '${op}'` };
    }
  }

  for (const c of requires.containersIn ?? []) {
    if (!caps.containersIn.includes(c)) {
      return { ok: false, status: 'NA_ENGINE', reason: `engine does not declare input container '${c}'` };
    }
  }
  for (const c of requires.containersOut ?? []) {
    if (!caps.containersOut.includes(c)) {
      return { ok: false, status: 'NA_ENGINE', reason: `engine does not declare output container '${c}'` };
    }
  }

  for (const vc of requires.videoCodecs ?? []) {
    if (!caps.videoCodecs.includes(vc)) {
      return { ok: false, status: 'NA_ENGINE', reason: `engine does not declare video codec '${vc}'` };
    }
  }
  for (const vc of requires.videoCodecsIn ?? []) {
    if (!codecSet(caps.videoCodecsIn, caps.videoCodecs).includes(vc)) {
      return { ok: false, status: 'NA_ENGINE', reason: `engine does not declare input video codec '${vc}'` };
    }
  }
  for (const vc of requires.videoCodecsOut ?? []) {
    if (!codecSet(caps.videoCodecsOut, caps.videoCodecs).includes(vc)) {
      return { ok: false, status: 'NA_ENGINE', reason: `engine does not declare output video codec '${vc}'` };
    }
  }
  for (const ac of requires.audioCodecs ?? []) {
    if (!caps.audioCodecs.includes(ac)) {
      return { ok: false, status: 'NA_ENGINE', reason: `engine does not declare audio codec '${ac}'` };
    }
  }
  for (const ac of requires.audioCodecsIn ?? []) {
    if (!codecSet(caps.audioCodecsIn, caps.audioCodecs).includes(ac)) {
      return { ok: false, status: 'NA_ENGINE', reason: `engine does not declare input audio codec '${ac}'` };
    }
  }
  for (const ac of requires.audioCodecsOut ?? []) {
    if (!codecSet(caps.audioCodecsOut, caps.audioCodecs).includes(ac)) {
      return { ok: false, status: 'NA_ENGINE', reason: `engine does not declare output audio codec '${ac}'` };
    }
  }

  for (const e of requires.encryption ?? []) {
    if (!caps.encryption.includes(e)) {
      return { ok: false, status: 'NA_ENGINE', reason: `engine does not declare encryption scheme '${e}'` };
    }
  }

  for (const f of requires.features ?? []) {
    if (!caps.features.includes(f)) {
      return { ok: false, status: 'NA_ENGINE', reason: `engine does not declare feature '${f}'` };
    }
  }

  // ── Pass 2: browser runtime support (NA_BROWSER) ──
  // NA_BROWSER means: the engine DECLARED the codec (so pass 1 passed) but the browser cannot
  // configure the WebCodecs codec the scenario exercises. This gate only applies to engines that
  // route codecs through WebCodecs (e.g. mediabunny, platform). Engines that ship their own
  // software codecs (ffmpeg.wasm) or never touch codecs (mp4box demux/probe) declare the honest
  // feature 'webcodecs:independent' to OPT OUT of this gate — they configure nothing in WebCodecs,
  // so the browser's WebCodecs codec table is irrelevant to whether they can run. Without that
  // declared feature, the spec-faithful rule (§5) holds: the browser must be able to configure the
  // codec, else NA_BROWSER (distinct from NA_ENGINE, never collapsed).
  if (caps.features.includes('webcodecs:independent')) {
    return { ok: true };
  }

  const requiredVideo = [...(requires.videoCodecs ?? []), ...(requires.videoCodecsIn ?? []), ...(requires.videoCodecsOut ?? [])];
  const requiredAudio = [...(requires.audioCodecs ?? []), ...(requires.audioCodecsIn ?? []), ...(requires.audioCodecsOut ?? [])];
  const isTranscode = requires.operations.includes('transcode');
  const transcodeTargets = isTranscode ? transcodeTargetCodecs(options) : undefined;

  // Determine whether this scenario asks the browser to configure codecs. Parser-only operations
  // (probe/demux/remux copy) do not need WebCodecs decode support just to read packets/metadata; the
  // old flat gate incorrectly blocked cases like FLAC demux in Chromium. Decode/seek/decrypt need
  // decode support. Only transcode additionally needs ENCODE support, because it constructs a real
  // WebCodecs encoder for the target codecs. mux() is a packet COPY: it writes already-encoded
  // packets verbatim into the output container and never constructs a WebCodecs encoder OR decoder,
  // so it needs neither browser decode nor encode support for the packet codecs (the old gate wrongly
  // produced NA_BROWSER for mediabunny flac/vorbis/mp3/pcm mux cases). mux therefore negotiates on the
  // engine-declared containers/codecs from Pass 1 alone; any container/codec incompatibility still
  // surfaces honestly at mux() runtime (FAIL/ERROR, never a false PASS).
  const producesEncodedOutput =
    requires.operations.includes('transcode');
  const needsDecodeConfig =
    requires.operations.includes('decodeFrames') ||
    requires.operations.includes('seek') ||
    requires.operations.includes('transcode') ||
    requires.operations.includes('trim') ||
    requires.operations.includes('decrypt');
  const needsCodecConfig = (requiredVideo.length > 0 || requiredAudio.length > 0) && (producesEncodedOutput || needsDecodeConfig);

  if (needsCodecConfig && !support.webcodecs) {
    return {
      ok: false,
      status: 'NA_BROWSER',
      reason: 'browser does not expose WebCodecs (VideoDecoder/AudioDecoder unavailable)',
    };
  }

  for (const vc of requiredVideo) {
    const canDecode = support.videoDecode[vc] === true;
    const canEncode = support.videoEncode[vc] === true;
    const needsEncode = isTranscode
      ? transcodeTargets?.video.has(vc) === true
      : producesEncodedOutput;
    const needsDecode = isTranscode
      ? needsTranscodeDecode(vc, requiredVideo, transcodeTargets?.video ?? new Set())
      : needsDecodeConfig && !producesEncodedOutput;
    if (needsEncode) {
      if (!canEncode) {
        return {
          ok: false,
          status: 'NA_BROWSER',
          reason: `browser cannot encode video codec '${vc}' (WebCodecs VideoEncoder.isConfigSupported=false)`,
        };
      }
    }
    if (needsDecode && !canDecode) {
      return {
        ok: false,
        status: 'NA_BROWSER',
        reason: `browser cannot decode video codec '${vc}' (WebCodecs VideoDecoder.isConfigSupported=false)`,
      };
    }
  }

  for (const ac of requiredAudio) {
    // PCM is uncompressed: some engines encode/decode it in software (a trivial byte
    // pack/unpack/endian-swap) entirely independent of WebCodecs. Those engines declare the honest
    // per-codec feature 'audio:pcm-native' (mediabunny, remotion-webcodecs). When set, the browser's
    // WebCodecs AudioEncoder/AudioDecoder table is irrelevant for pcm-* codecs, so we skip the
    // NA_BROWSER gate for them only — non-PCM audio (aac/opus/mp3/flac/vorbis) is still gated exactly
    // as before, and so is PCM on engines that do NOT declare this feature. Correctness remains
    // enforced by the scenario oracles, so skipping the gate here cannot post a false green.
    const pcmNative = caps.features.includes('audio:pcm-native') && ac.startsWith('pcm-');
    // pcm-s16 is the canonical WAV sample format: any engine that declares 'wav' output writes it
    // with its own muxer (a trivial little-endian sample pack), independent of the WebCodecs
    // AudioEncoder table (which exposes no PCM encoder). So the browser ENCODE gate must not apply to
    // a pcm-s16 target when the engine outputs WAV. This is the honest, NARROW counterpart to
    // 'audio:pcm-native' for engines (e.g. remotion-webcodecs) that ship a WAV writer for pcm-s16 but
    // legitimately route other PCM widths (pcm-s24/pcm-f32) through WebCodecs and so cannot claim the
    // blanket token. It suppresses ONLY the encode gate (decode is unaffected) and ONLY for pcm-s16.
    const pcmWavEncode = ac === 'pcm-s16' && caps.containersOut.includes('wav');
    // FLAC is likewise software-native for engines that explicitly declare this narrow feature:
    // aibrush-media parses/decodes FLAC in pure TS and authors FLAC via its pure-TS encoder, so the
    // browser's AudioDecoder/AudioEncoder FLAC table is irrelevant for FLAC only.
    const flacNative = caps.features.includes('audio:flac-native') && ac === 'flac';
    // Vorbis has no Chromium WebCodecs AudioDecoder/AudioEncoder, but engines may ship their own vetted
    // native/wasm Vorbis tails. Keep decode and encode tokens separate so a decode-only tail never
    // suppresses the encode gate by accident.
    const vorbisNativeDecode = caps.features.includes('audio:vorbis-native') && ac === 'vorbis';
    const vorbisNativeEncode = caps.features.includes('audio:vorbis-encode-native') && ac === 'vorbis';
    const canDecode = support.audioDecode[ac] === true;
    const canEncode = support.audioEncode[ac] === true;
    const needsEncode = isTranscode
      ? transcodeTargets?.audio.has(ac) === true
      : producesEncodedOutput;
    const needsDecode = isTranscode
      ? needsTranscodeDecode(ac, requiredAudio, transcodeTargets?.audio ?? new Set())
      : needsDecodeConfig && !producesEncodedOutput;
    if (needsEncode && !pcmNative && !pcmWavEncode && !flacNative && !vorbisNativeEncode) {
      if (!canEncode) {
        return {
          ok: false,
          status: 'NA_BROWSER',
          reason: `browser cannot encode audio codec '${ac}' (WebCodecs AudioEncoder.isConfigSupported=false)`,
        };
      }
    }
    if (needsDecode && !canDecode && !pcmNative && !flacNative && !vorbisNativeDecode) {
      return {
        ok: false,
        status: 'NA_BROWSER',
        reason: `browser cannot decode audio codec '${ac}' (WebCodecs AudioDecoder.isConfigSupported=false)`,
      };
    }
  }

  // Alpha is a browser-gated feature (VP9 alpha etc.): if the scenario requires it and the browser
  // can't honour it, that's NA_BROWSER (the engine already declared it in pass 1).
  if ((requires.features ?? []).includes('alpha') && !support.alpha) {
    return { ok: false, status: 'NA_BROWSER', reason: "browser cannot configure 'alpha' frames" };
  }

  // Strict golden-RGBA decode comparability is also browser-gated: it depends on the current browser's
  // native decode+raster path matching the committed golden frame signatures closely enough for the
  // decode/SSIM oracles. If the platform engine itself cannot satisfy that gate in this browser, any
  // engine that requires the feature must negotiate NA_BROWSER instead of posting misleading pixel FAILs.
  if ((requires.features ?? []).includes('decode:golden-rgba') && !support.strictGoldenRgba) {
    return {
      ok: false,
      status: 'NA_BROWSER',
      reason: "browser cannot provide strict committed-golden RGBA decode comparability",
    };
  }

  return { ok: true };
}

function codecSet(specific: string[] | undefined, fallback: string[]): string[] {
  return specific ?? fallback;
}

function transcodeTargetCodecs(options: Scenario['options'] | undefined): {
  video: Set<string>;
  audio: Set<string>;
} {
  const video = new Set<string>();
  const audio = new Set<string>();
  const opts = recordOption(options);
  if (!opts) return { video, audio };

  const videoCodec = codecOption(opts.video);
  if (videoCodec) video.add(videoCodec);
  const audioCodec = codecOption(opts.audio);
  if (audioCodec) audio.add(audioCodec);

  if (Array.isArray(opts.variants)) {
    for (const variant of opts.variants) {
      const codec = codecOption(variant);
      if (codec) video.add(codec);
    }
  }

  return { video, audio };
}

function needsTranscodeDecode(codec: string, required: string[], targets: Set<string>): boolean {
  if (targets.size === 0 || !targets.has(codec)) return true;
  return required.every((c) => targets.has(c));
}

function recordOption(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

function codecOption(value: unknown): string | undefined {
  const rec = recordOption(value);
  const codec = rec?.codec;
  return typeof codec === 'string' && codec.trim() ? codec.trim().toLowerCase() : undefined;
}

// ── Run options ──────────────────────────────────────────────────────────────────────────────

export interface ResultReuseStore {
  get(engineId: string, scenarioId: string, browser: BrowserName): Promise<ScenarioResult | undefined>;
  put(result: ScenarioResult): Promise<void>;
}

export interface RunOptions {
  browser: BrowserName;
  engineIds?: string[]; // default: all registered
  scenarioIds?: string[]; // default: all registered
  featureIds?: ScenarioFamily[]; // feature/family-first filter, e.g. probe|demux|remux
  operations?: Operation[]; // optional op-level filter, e.g. demux|remux
  pillar?: 'functional' | 'performance' | 'robustness' | 'all'; // default 'all'
  benchOptions?: BenchOptions;
  /** Shuffle the engine/scenario cell queue once at run start. */
  randomizeOrder?: boolean;
  /** Optional seed used when randomizeOrder is enabled, so UI highlighting can mirror the runner. */
  randomSeed?: string;
  /**
   * Per-scenario media-file rotation (§6/§10). true (default) ⇒ pick ONE input per scenario from
   * {baked fixture} ∪ {shape-matching real files}, seeded on randomSeed. false ⇒ force the baked
   * fixture everywhere (baked-canonical audit / debug). Never mutates a file, never softens an oracle.
   */
  rotateMedia?: boolean;
  /**
   * Exhaustive media mode (§6.2). true ⇒ run EVERY candidate file (baked + all shape/duration-passing
   * real files) per scenario, in the same order for every engine, and aggregate: the cell PASSes only
   * if ALL files pass (any file FAIL/ERROR ⇒ cell FAIL, naming the file), and the bench is the MEDIAN
   * across the passing files (+ per-file spread). Default off (one seeded file per run, ~constant time).
   */
  exhaustiveMedia?: boolean;
  onResult?: (r: ScenarioResult) => void;
  onProgress?: (done: number, total: number, label: string) => void;
  /** Reuse cached PASS/NA cells and write every completed cell back to persistent storage. */
  resultReuse?: ResultReuseStore;
  /** Optional cancellation signal. Aborts between cells so in-flight engine cleanup stays orderly. */
  signal?: AbortSignal;
  /** optional override of the browser-pure oracle hooks; default to the platform engine's helpers */
  decodeWithPlatform?: OracleContext['decodeWithPlatform'];
  playbackSmoke?: OracleContext['playbackSmoke'];
}

export interface MatrixCellRef {
  engineId: string;
  scenarioId: string;
}

export function buildExecutionOrder(
  engineIds: string[],
  scenarioIds: string[],
  randomizeOrder = false,
  randomSeed = '',
): MatrixCellRef[] {
  const order: MatrixCellRef[] = [];
  for (const scenarioId of scenarioIds) {
    for (const engineId of engineIds) order.push({ engineId, scenarioId });
  }
  if (randomizeOrder && order.length > 1) shuffleInPlace(order, randomSeed);
  return order;
}

/**
 * The injected oracle hooks. INTERNAL_API.md types `runOne`'s `opts` as `Partial<RunOptions>`, but the
 * oracle context (oracles.ts) needs the platform-decode / playback-smoke hooks. The runner accepts them
 * alongside the public RunOptions so the caller (registry/app) wires the platform engine. This widening
 * is additive — every `Partial<RunOptions>` is assignable to `RunOneOptions`.
 */
export interface RunOneOptions extends Partial<RunOptions> {
  /** injected by caller: decode arbitrary bytes with the platform engine (WebCodecs) → frames */
  decodeWithPlatform?: OracleContext['decodeWithPlatform'];
  /** injected by caller: <video> playback smoke test → resolves true if it plays a few frames */
  playbackSmoke?: OracleContext['playbackSmoke'];
  /** environment captured once per run (attached to every result) */
  env?: RunEnv;
  /**
   * Per-scenario rotation (§6.4): the concrete inputs this cell fetches. `id` drives golden/identity
   * (baked ⇒ flat asset id; real ⇒ scenario-dir path that 404s its golden); `urlAssetPath` is the bytes
   * actually fetched. When present, it REPLACES the scenario.input-derived asset list in runOne/runBench.
   */
  resolvedInputs?: ResolvedInput[];
  /** provenance of the rotated pick, stamped onto the result's `selection` field (purely additive). */
  selection?: { file: string; sha256?: string; isBaked: boolean; candidateCount?: number };
  /** the run's selection seed (RunOptions.randomSeed), recorded in the result's selection for replay. */
  runSeed?: string;
}

// ── MediaInput construction from the served corpus ─────────────────────────────────────────────

/** MIME guess from a corpus asset id's container suffix. Lazy fetch keeps the matrix cheap. */
function mimeForAssetId(id: string): string {
  const lower = id.toLowerCase();
  if (lower.endsWith('.mp4') || lower.endsWith('.m4v') || lower.endsWith('.m4a')) return 'video/mp4';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.mkv')) return 'video/x-matroska';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.ts') || lower.endsWith('.m2ts')) return 'video/mp2t';
  if (lower.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.flac')) return 'audio/flac';
  if (lower.endsWith('.ogg') || lower.endsWith('.opus')) return 'audio/ogg';
  if (lower.endsWith('.aac') || lower.endsWith('.adts')) return 'audio/aac';
  return 'application/octet-stream';
}

/** Absolute URL for a corpus asset served as a static file at `/fixtures/media/<id>`. */
function mediaAssetUrl(assetId: string): string {
  const path = `${FIXTURES_MEDIA_BASE}/${assetId}`;
  return new URL(path, globalThis.location?.href ?? 'http://localhost/').href;
}

async function fixtureManifestById(): Promise<Map<string, FixtureManifestAsset> | undefined> {
  if (!fixtureManifestPromise) {
    fixtureManifestPromise = (async () => {
      try {
        const url = new URL(FIXTURES_MANIFEST_URL, globalThis.location?.href ?? 'http://localhost/').href;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return undefined;
        const manifest = (await res.json()) as { assets?: FixtureManifestAsset[] };
        const byId = new Map<string, FixtureManifestAsset>();
        for (const asset of manifest.assets ?? []) {
          if (typeof asset.id === 'string' && asset.id) byId.set(asset.id, asset);
        }
        fixtureManifestCache = byId;
        return byId;
      } catch {
        return undefined;
      }
    })();
  }
  return fixtureManifestPromise;
}

async function missingAssetReason(assetId: string): Promise<string | undefined> {
  const manifest = await fixtureManifestById();
  if (manifest) {
    const entry = manifest.get(assetId);
    if (!entry) {
      return `asset missing: '${assetId}' (not declared in fixtures/manifest.json)`;
    }
    if (entry.sha256 == null || entry.sizeBytes == null) {
      return `asset missing: '${assetId}' (manifest entry is not baked: sha256/sizeBytes is null)`;
    }
  }

  const url = mediaAssetUrl(assetId);
  let res: Response;
  try {
    res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
  } catch (err) {
    return `asset missing: '${assetId}' (${errMessage(err)})`;
  }
  if (res.ok) return undefined;

  if (res.status === 405 || res.status === 501) {
    try {
      const ranged = await fetch(url, { cache: 'no-store', headers: { Range: 'bytes=0-0' } });
      if (ranged.ok || ranged.status === 206) return undefined;
      return `asset missing: '${assetId}' (${ranged.status} ${ranged.statusText})`;
    } catch (err) {
      return `asset missing: '${assetId}' (${errMessage(err)})`;
    }
  }

  return `asset missing: '${assetId}' (${res.status} ${res.statusText})`;
}

/**
 * Missing-asset preflight for a ROTATED resolved input (§6). Rotated real files live in the on-disk
 * scenario catalog, NOT in fixtures/manifest.json, so the manifest-based `missingAssetReason` would
 * falsely NA_ASSET a perfectly present file. We instead HEAD-check the actual bytes URL (`urlAssetPath`)
 * and route to NA_ASSET ONLY on a definitive 404 ('selected file missing on disk'). Any other status
 * (405/HEAD-unsupported, transient error) is tolerated so a present file NEVER becomes a false NA — a
 * genuine unreadable file still surfaces honestly as ERROR when the op fetches it (R2/R3).
 */
async function resolvedInputMissingReason(resolved: ResolvedInput): Promise<string | undefined> {
  const url = mediaAssetUrl(resolved.urlAssetPath);
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    if (res.status === 404) {
      return `selected file missing on disk: '${resolved.urlAssetPath}' (404 ${res.statusText})`;
    }
  } catch {
    // Network hiccup / HEAD unsupported: do not manufacture an NA. A real read failure surfaces later.
  }
  return undefined;
}

/**
 * Build a `MediaInput` for a corpus asset served as a static file under `/fixtures/media/`.
 * `blob()`/`arrayBuffer()` fetch lazily and cache; an optional `mutate` (robustness) rewrites the
 * bytes after fetch so the engine is fed corrupted input.
 *
 * §6.4 id/url decoupling: `id` stays the golden/identity key (baked ⇒ flat asset id whose golden
 * resolves; real ⇒ scenario-dir path whose golden 404s), while the OPTIONAL `urlAssetPath` overrides
 * ONLY which bytes are fetched. `sizeHint` supplies MediaInput.sizeBytes for rotated real files, which
 * are NOT in fixtures/manifest.json (the manifest still wins for baked ids when present). Both new
 * params are optional, so every existing caller is unaffected.
 */
function buildMediaInput(
  assetId: string,
  mutate?: (bytes: Uint8Array) => Uint8Array,
  urlAssetPath?: string,
  sizeHint?: number,
): MediaInput {
  const url = mediaAssetUrl(urlAssetPath ?? assetId);
  const mime = mimeForAssetId(assetId);
  const manifestSize = fixtureManifestCache?.get(assetId)?.sizeBytes;
  const sizeBytes =
    typeof manifestSize === 'number' && Number.isSafeInteger(manifestSize) && manifestSize >= 0
      ? manifestSize
      : typeof sizeHint === 'number' && Number.isSafeInteger(sizeHint) && sizeHint >= 0
        ? sizeHint
        : undefined;

  let cached: Promise<ArrayBuffer> | undefined;
  const fetchBytes = (): Promise<ArrayBuffer> => {
    if (!cached) {
      cached = fetch(url).then((res) => {
        if (!res.ok) throw new Error(`failed to fetch corpus asset '${assetId}' (${res.status} ${res.statusText})`);
        return res.arrayBuffer();
      });
    }
    return cached;
  };

  const applyMutate = (raw: ArrayBuffer): ArrayBuffer => {
    if (!mutate) return raw;
    const mutated = mutate(new Uint8Array(raw.slice(0)));
    // Return a tight ArrayBuffer view of the mutated bytes.
    return mutated.buffer.byteLength === mutated.byteLength && mutated.byteOffset === 0
      ? (mutated.buffer as ArrayBuffer)
      : (mutated.slice().buffer as ArrayBuffer);
  };

  return {
    id: assetId,
    url,
    mime,
    ...(sizeBytes !== undefined && mutate === undefined ? { sizeBytes } : {}),
    mutated: typeof mutate === 'function',
    async arrayBuffer(): Promise<ArrayBuffer> {
      return applyMutate(await fetchBytes());
    },
    async blob(): Promise<Blob> {
      return new Blob([await this.arrayBuffer()], { type: mime });
    },
  };
}

// ── Pillar gating ──────────────────────────────────────────────────────────────────────────────

/**
 * Decide whether a scenario belongs to the requested pillar. Robustness scenarios live in the
 * `robustness` family (and/or carry a `mutate`); functional/performance scenarios are everything
 * else. 'all' runs everything; 'functional' and 'performance' run the non-robustness families
 * (performance additionally enables the bench step); 'robustness' runs only the robustness family.
 */
function scenarioMatchesPillar(scenario: Scenario, pillar: NonNullable<RunOptions['pillar']>): boolean {
  const usesGracefulFailurePath =
    scenario.family === 'robustness' ||
    typeof scenario.mutate === 'function' ||
    scenario.oracles.includes('graceful-failure');
  switch (pillar) {
    case 'all':
      return true;
    case 'robustness':
      return usesGracefulFailurePath;
    case 'functional':
    case 'performance':
      return !usesGracefulFailurePath;
  }
}

// ── Timeout guard ───────────────────────────────────────────────────────────────────────────────

class TimeoutError extends Error {
  constructor(ms: number) {
    super(`operation exceeded timeout of ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Default timeout caps so a single hanging/pathologically-slow engine can NEVER stall the whole
 * matrix (a genuine hang far exceeds these; a slow-but-working op stays under them). A scenario's
 * own `timeoutMs` overrides the op cap (robustness sets tight ones). Discovered necessary in the
 * first real browser run: ffmpeg-wasm init and mp4box's bench loop hung the matrix with no guard.
 */
const DEFAULT_OP_TIMEOUT_MS = 120_000; // one op call or one oracle
const DEFAULT_INIT_TIMEOUT_MS = 120_000; // engine.init() (WASM compile/instantiate can be slow)
const DEFAULT_BENCH_TIMEOUT_MS = 300_000; // the whole bench (warmup+iters) for one cell

/** Race a promise against `timeoutMs`, defaulting to DEFAULT_OP_TIMEOUT_MS so nothing runs unguarded. */
function withTimeout<T>(p: Promise<T>, timeoutMs: number | undefined): Promise<T> {
  const ms = timeoutMs && timeoutMs > 0 ? timeoutMs : DEFAULT_OP_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  }) as Promise<T>;
}

function isNotApplicableError(err: unknown): boolean {
  return err instanceof Error && err.name === 'NotApplicableError';
}

function notApplicableError(message: string): Error {
  const err = new Error(message);
  err.name = 'NotApplicableError';
  return err;
}

// ── Operation dispatch ──────────────────────────────────────────────────────────────────────────

/** The shape of an executed functional op, fed into the OracleContext. */
interface OpResult {
  output?: MediaBytes;
  metadata?: NormalizedMetadata;
  probeMetadatas?: Array<{ input: MediaInput; metadata: NormalizedMetadata; golden?: GoldenStore }>;
  demux?: DemuxResult;
  frames?: FrameSink;
  seek?: { landedPtsUs: number; frame: FrameDigest };
}

/** Typed accessors over the loosely-typed `scenario.options` so dispatch is total + strict. */
function asContainerOpt(options: Scenario['options']): string {
  const c = (options as { container?: unknown } | undefined)?.container;
  return typeof c === 'string' ? c : 'mp4';
}
function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.entries(value as Record<string, unknown>).every(([, v]) => typeof v === 'string')
  );
}
function asRemuxOpts(options: Scenario['options']): RemuxOptions {
  const raw = (options ?? {}) as Record<string, unknown>;
  const tags = raw['tags'];
  const opts: RemuxOptions = { ...raw, container: asContainerOpt(options) };
  if (isStringRecord(tags)) {
    opts.tags = tags;
  } else {
    delete opts.tags;
  }
  return opts;
}
function asMuxOpts(options: Scenario['options']): MuxOptions {
  const raw = (options ?? {}) as Record<string, unknown>;
  const opts: MuxOptions = { ...raw, container: asContainerOpt(options) };
  delete opts.tracks;
  return opts;
}
function asTranscodeOpts(options: Scenario['options']): TranscodeOptions {
  const o = (options ?? {}) as Partial<TranscodeOptions>;
  return { ...o, container: typeof o.container === 'string' ? o.container : 'mp4' };
}
function asNumberOpt(options: Scenario['options'], key: string, fallback: number): number {
  const v = (options as Record<string, unknown> | undefined)?.[key];
  return typeof v === 'number' ? v : fallback;
}
function asMaxFrames(options: Scenario['options']): number | undefined {
  const v = (options as Record<string, unknown> | undefined)?.['maxFrames'];
  return typeof v === 'number' ? v : undefined;
}
function asTrimRange(options: Scenario['options']): { startUs: number; endUs: number } {
  const o = (options ?? {}) as Record<string, unknown>;
  const range = o['range'] as Record<string, unknown> | undefined;
  const startUs = typeof range?.['startUs'] === 'number' ? (range['startUs'] as number) : asNumberOpt(options, 'startUs', 0);
  const endUs = typeof range?.['endUs'] === 'number' ? (range['endUs'] as number) : asNumberOpt(options, 'endUs', 0);
  return {
    startUs,
    endUs,
  };
}
function asTrimOpts(options: Scenario['options']): { container: string; frameAccurate: boolean } {
  const o = (options ?? {}) as Record<string, unknown>;
  return {
    container: typeof o['container'] === 'string' ? (o['container'] as string) : 'mp4',
    frameAccurate: o['frameAccurate'] === true,
  };
}
function asDecryptKey(options: Scenario['options']): DecryptKey {
  const o = (options as Record<string, unknown> | undefined)?.['key'] as Record<string, unknown> | undefined;
  return {
    keyHex: typeof o?.['keyHex'] === 'string' ? (o['keyHex'] as string) : '',
    ...(typeof o?.['kid'] === 'string' ? { kid: o['kid'] as string } : {}),
    ...(typeof o?.['ivHex'] === 'string' ? { ivHex: o['ivHex'] as string } : {}),
  };
}
function asEncryptionScheme(options: Scenario['options']): EncryptionScheme {
  const s = (options as Record<string, unknown> | undefined)?.['scheme'];
  switch (s) {
    case 'cenc-cbcs':
    case 'hls-aes128':
    case 'clearkey':
    case 'cenc-cens':
    case 'hls-sample-aes':
      return s;
    default:
      return 'cenc-ctr';
  }
}

/**
 * Execute the engine method for `scenario.op` against `input(s)`, returning the normalized
 * `OpResult`. `mux` consumes pre-encoded tracks; the runner accepts explicit `options.tracks`, or
 * delegates corpus-input-to-track assembly to engines that expose `prepareMuxTracks`.
 */
async function executeOp(engine: MediaEngine, scenario: Scenario, inputs: MediaInput[]): Promise<OpResult> {
  const op: Operation = scenario.op;
  const input = inputs[0]!;
  switch (op) {
    case 'probe': {
      if (inputs.length === 1) return { metadata: await engine.probe(input) };
      const probeMetadatas: Array<{ input: MediaInput; metadata: NormalizedMetadata }> = [];
      for (const probeInput of inputs) {
        probeMetadatas.push({ input: probeInput, metadata: await engine.probe(probeInput) });
      }
      return { metadata: probeMetadatas[0]?.metadata, probeMetadatas };
    }
    case 'demux':
      return { demux: await engine.demux(input) };
    case 'remux':
      return { output: await engine.remux(input, asRemuxOpts(scenario.options)) };
    case 'transcode':
      return { output: await engine.transcode(input, asTranscodeOpts(scenario.options)) };
    case 'decodeFrames': {
      const maxFrames = asMaxFrames(scenario.options);
      return { frames: await engine.decodeFrames(input, maxFrames !== undefined ? { maxFrames } : undefined) };
    }
    case 'seek':
      return { seek: await engine.seek(input, asNumberOpt(scenario.options, 'tUs', 0)) };
    case 'trim':
      return { output: await engine.trim(input, asTrimRange(scenario.options), asTrimOpts(scenario.options)) };
    case 'mux': {
      if (!engine.mux) throw new Error("engine.mux is not implemented (capability declared but method missing)");
      const options = (scenario.options ?? {}) as Record<string, unknown>;
      const tracks =
        (scenario.options as { tracks?: EncodedTracks } | undefined)?.tracks ??
        (engine.prepareMuxTracks ? await engine.prepareMuxTracks(inputs, options) : undefined);
      if (!tracks) {
        throw notApplicableError('mux scenario requires options.tracks or engine.prepareMuxTracks()');
      }
      return { output: await engine.mux(tracks, asMuxOpts(scenario.options)) };
    }
    case 'decrypt': {
      if (!engine.decrypt) throw new Error("engine.decrypt is not implemented (capability declared but method missing)");
      return {
        output: await engine.decrypt(input, asDecryptKey(scenario.options), {
          scheme: asEncryptionScheme(scenario.options),
        }),
      };
    }
    default: {
      // Exhaustiveness guard: if a new Operation is added, this fails to compile.
      const _never: never = op;
      throw new Error(`unsupported operation: ${String(_never)}`);
    }
  }
}

// ── Bench measurement context per op ─────────────────────────────────────────────────────────────

/** Best-effort media duration (sec) for throughput×realtime, from golden meta then probe result. */
function mediaSecFromContext(golden: GoldenStore, opResult: OpResult): number | undefined {
  const goldenDur = golden.meta?.durationSec;
  if (typeof goldenDur === 'number' && goldenDur > 0) return goldenDur;
  const probedDur = opResult.metadata?.durationSec;
  if (typeof probedDur === 'number' && probedDur > 0) return probedDur;
  return undefined;
}

function isGoldenBakeGap(outcome: OracleOutcome): boolean {
  const detail = (outcome.detail ?? '').toLowerCase();
  return (
    detail.includes('no golden frame') ||
    detail.includes('golden frames pending') ||
    detail.includes('frame-bake pending') ||
    detail.includes('frame-bake must run') ||
    // Oracles that RETIRE to NA (oracles.ts) on a rotated, golden-less real file emit the canonical
    // substring 'golden absent' so a missing base routes to NA_ASSET, never a FAIL (P0 contract).
    detail.includes('golden absent') ||
    // §11 broadening: a golden-KEYED oracle that fails ONLY because its golden is ABSENT (a rotated,
    // golden-less real file) is honestly NA_ASSET, not FAIL. Each substring below is emitted by
    // oracles.ts EXCLUSIVELY on a missing-golden/absent-base branch — verified to be either an early
    // `return fail(...)` guarded by golden-absence or a mutually-exclusive `else` arm — so it can NEVER
    // be concatenated alongside a real comparison MISMATCH detail (R2: a real defect stays a FAIL). For
    // a BAKED fixture the golden is present, so none of these fire and baked outcomes are unchanged.
    detail.includes('no golden meta') || // goldenMetadata (oracles.ts:603)
    detail.includes('no golden packets') || // goldenPackets (711) + demuxMuxRoundtrip (3449)
    detail.includes('no golden packets for source comparison') || // demuxMuxRoundtrip (3449)
    detail.includes('no golden video packet pts table') || // vfr linear-decode PTS table (3610)
    detail.includes('from golden packets/frames') || // seek-accuracy else-arm (2231)
    detail.includes('could not resolve linear-decode frame pts from golden') || // linear-decode invariant (3542)
    detail.includes('no golden sample rate/duration') || // gapless decoded-sample-count (2920)
    detail.includes('no golden/source duration to compare') || // property-invariant duration (2727/3875)
    detail.includes('metamorphic decrypt: no cleartext base to compare') // DERIVED metamorphic base-absent (2819/2829/2832/2855)
  );
}

function decodeFrameGoldenGap(scenario: Scenario, golden: GoldenStore): string | null {
  if (scenario.op !== 'decodeFrames') return null;
  if (!scenario.oracles.some((oracle) => oracle === 'ssim-psnr' || oracle === 'decoded-frames-bitexact')) {
    return null;
  }
  const hasFrames = (golden.frames?.length ?? 0) > 0;
  const hasSsimRef = (golden.ssimRef?.length ?? 0) > 0;
  if (hasFrames || hasSsimRef) return null;
  return 'decodeFrames oracle unavailable: no golden frame digests/signatures to compare (frame-bake pending)';
}

function decodeFrameStrictRgbaGap(scenario: Scenario, support: CodecSupport): string | null {
  if (support.strictGoldenRgba) return null;
  if (scenario.op !== 'decodeFrames') return null;
  if (!scenario.oracles.some((oracle) => oracle === 'ssim-psnr' || oracle === 'decoded-frames-bitexact')) {
    return null;
  }
  return 'browser cannot provide strict committed-golden RGBA decode comparability';
}

async function strictPixelBrowserGap(
  scenario: Scenario,
  support: CodecSupport,
  primaryAssetId: string,
  primaryGolden: GoldenStore,
  browser: BrowserName,
): Promise<string | null> {
  if (
    scenarioUsesReferencePixels(scenario) &&
    (scenario.oracles.includes('ssim-psnr') || scenario.oracles.includes('fanout-renditions'))
  ) {
    if (!support.strictSourceRgba) {
      return 'browser cannot provide strict source-reference RGBA pixel comparability';
    }
  }

  if (support.strictGoldenRgba) return null;

  const primaryHasSsim = (primaryGolden.ssimRef?.length ?? 0) > 0;
  const primaryHasFrames = (primaryGolden.frames?.length ?? 0) > 0;
  const usesGoldenSsim =
    scenario.oracles.includes('ssim-psnr') || scenario.oracles.includes('fanout-renditions');
  if (usesGoldenSsim && (primaryHasSsim || primaryHasFrames)) {
    return 'browser cannot provide strict committed-golden RGBA decode comparability';
  }

  if (scenario.oracles.includes('decoded-frames-bitexact') && primaryHasFrames) {
    return 'browser cannot provide strict committed-golden RGBA decode comparability';
  }

  if (scenario.oracles.includes('decrypt-bitexact')) {
    const golden = await loadFrameComparisonGoldenForScenario(scenario, primaryAssetId, primaryGolden, browser);
    if ((golden.frames?.length ?? 0) > 0) {
      return 'browser cannot provide strict committed-golden RGBA decode comparability';
    }
  }

  if (scenario.oracles.includes('property-invariant') && propertyInvariantUsesDecodeFrames(scenario)) {
    const golden = await loadFrameComparisonGoldenForScenario(scenario, primaryAssetId, primaryGolden, browser);
    if ((golden.frames?.length ?? 0) > 0) {
      return 'browser cannot provide strict committed-golden RGBA decode comparability';
    }
  }

  return null;
}

function scenarioMayUseStrictPixelOracle(scenario: Scenario): boolean {
  return scenario.oracles.some(
    (oracle) =>
      oracle === 'ssim-psnr' ||
      oracle === 'fanout-renditions' ||
      oracle === 'decoded-frames-bitexact' ||
      oracle === 'decrypt-bitexact' ||
      oracle === 'property-invariant',
  );
}

function playbackSmokeBrowserGap(scenario: Scenario, browser: BrowserName): string | null {
  if (browser !== 'webkit') return null;
  if (!scenario.oracles.includes('playback-smoke')) return null;
  if ((scenario.requires.containersOut ?? []).includes('mkv')) {
    return "browser cannot playback-smoke Matroska/MKV output with a plain <video> element";
  }
  return null;
}

function gaplessSampleCountBrowserGap(scenario: Scenario, browser: BrowserName): string | null {
  if (browser !== 'webkit') return null;
  if (!scenario.oracles.includes('property-invariant')) return null;
  if (!(scenario.requires.features ?? []).includes('audio-samples:gapless-priming')) return null;
  return 'browser cannot provide exact AAC priming/padding decoded sample-count evidence';
}

function scenarioUsesReferencePixels(scenario: Scenario): boolean {
  if (scenario.op !== 'transcode') return false;
  const options = objectOptionRoot(scenario.options);
  return isRecord(options.crop) || isRecord(options.pad) || typeof options.flip === 'string';
}

function propertyInvariantUsesDecodeFrames(scenario: Scenario): boolean {
  const explicit = readStringOption(scenario.options, ['invariant', 'property']);
  const which = (explicit ?? inferInvariantForPreflight(scenario)).toLowerCase();
  if (which.includes('transcode-output') || which.includes('output-metadata')) return false;
  if (which.includes('linear-decode-frame')) return false;
  if (which.includes('pts-strictly-increasing')) return false;
  if (which.includes('vfr-seek-lands-on-true-pts')) return false;
  if (which.includes('demux(mux')) return false;
  if (which.includes('remux(remux')) return false;
  if (which.includes('flac-seek')) return false;
  if (which.includes('gapless')) return false;
  if (which.includes('audio-pcm')) return false;
  return which.includes('decode') || which.includes('remux');
}

function inferInvariantForPreflight(scenario: Scenario): string {
  if (scenario.op === 'remux') return 'decode-remux';
  if (scenario.op === 'trim') return 'trim-concat';
  if (scenario.op === 'probe') return 'probe-duration';
  return 'decode-remux';
}

async function loadFrameComparisonGoldenForScenario(
  scenario: Scenario,
  primaryAssetId: string,
  primaryGolden: GoldenStore,
  browser: BrowserName,
): Promise<GoldenStore> {
  const assetId = readStringOption(scenario.options, [
    'cleartextAsset',
    'cleartextAssetId',
    'goldenAsset',
    'goldenAssetId',
  ]) ?? primaryAssetId;
  if (browser !== 'chromium' && browser !== 'brave') {
    const browserGolden = await loadGolden(`${assetId}.${browser}`);
    if ((browserGolden.frames?.length ?? 0) > 0) return browserGolden;
  }
  if (assetId === primaryAssetId) return primaryGolden;
  return loadGolden(assetId);
}

function readStringOption(options: unknown, keys: string[]): string | undefined {
  const root = objectOptionRoot(options);
  for (const key of keys) {
    const value = root[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function objectOptionRoot(options: unknown): Record<string, unknown> {
  return isRecord(options) ? options : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// ── Exhaustive media mode (§6.2) ───────────────────────────────────────────────────────────────

/**
 * Run one (engine, scenario) cell against EVERY candidate file and aggregate into a single result.
 * `firstEngine` (already constructed + negotiated OK) runs file 0; a FRESH engine is constructed per
 * subsequent file (runOne inits+disposes each). Never caches.
 */
async function runExhaustiveCell(
  firstEngine: MediaEngine,
  engineId: string,
  reg: RegisteredEngine,
  candidates: ScenarioSelection[],
  scenario: Scenario,
  opts: RunOptions,
  support: CodecSupport,
  runEnvBase: RunEnv,
  pillar: NonNullable<RunOptions['pillar']>,
): Promise<ScenarioResult> {
  // The aggregate result MUST carry the engine's INSTANCE id (engine.id) — the same id runOne stamps on
  // every non-exhaustive result and the same id the UI lays its columns out with. Using the registry
  // `engineId` here (e.g. 'ffmpeg-wasm' vs the instance 'ffmpeg.wasm@0.12.15') left the cell unmatched,
  // so it never filled and the running-spinner stuck on it. Captured before runOne disposes firstEngine.
  const instanceId = firstEngine.id ?? engineId;

  const perFile: Array<{ sel: ScenarioSelection; result: ScenarioResult }> = [];
  for (let i = 0; i < candidates.length; i++) {
    if (opts.signal?.aborted) break;
    const sel = candidates[i]!;
    const engine = i === 0 ? firstEngine : await reg.factory();
    const runOneOpts: RunOneOptions = {
      browser: opts.browser,
      pillar,
      env: { ...runEnvBase, engineId },
      decodeWithPlatform: opts.decodeWithPlatform ?? decodeBytesToFrames,
      playbackSmoke: opts.playbackSmoke ?? platformPlaybackSmoke,
      ...(opts.benchOptions ? { benchOptions: opts.benchOptions } : {}),
      resolvedInputs: sel.resolvedInputs,
      selection: {
        file: sel.selectedFile,
        isBaked: sel.isBaked,
        ...(sel.selectedSha256 ? { sha256: sel.selectedSha256 } : {}),
        candidateCount: candidates.length,
      },
      ...(opts.randomSeed !== undefined ? { runSeed: opts.randomSeed } : {}),
    };
    let result: ScenarioResult;
    try {
      result = await runOne(engine, sel.effectiveScenario, opts.browser, support, runOneOpts);
    } catch (err) {
      // runOne is total, but guard anyway; a construct/init failure surfaces as this file's ERROR.
      result = {
        engineId,
        browser: opts.browser,
        scenarioId: scenario.id,
        family: scenario.family,
        status: 'ERROR',
        oracleOutcomes: [],
        reason: errMessage(err),
        env: { ...runEnvBase, engineId },
      };
    }
    perFile.push({ sel, result });
  }

  return aggregateExhaustive(instanceId, opts.browser, scenario, perFile, runEnvBase, opts.randomSeed);
}

/**
 * Aggregate per-file results into ONE cell (§6.2/§9). CORRECTNESS = logical AND: any admissible
 * FAIL/ERROR ⇒ the cell FAILs/ERRORs and names the offending file(s) (a FAIL is NEVER averaged into a
 * pass); all admissible PASS ⇒ PASS; no admissible file (all NA_*) ⇒ carry the NA kind. PERFORMANCE =
 * summarizeAcrossFiles per metric — `.aggregate` COMBINES the passing files (SUM for additive cost
 * metrics, MAX for peakMemory, MEDIAN for rate metrics) while `.samples` keeps the per-file spread.
 * `coverage` records passed/admissible/total so winners rank coverage-first. The `exhaustive[]` array
 * preserves every file's verdict + numbers so the spread is visible and a FAIL traces to its bytes.
 */
function aggregateExhaustive(
  engineId: string,
  browser: BrowserName,
  scenario: Scenario,
  perFile: Array<{ sel: ScenarioSelection; result: ScenarioResult }>,
  runEnvBase: RunEnv,
  runSeed: string | undefined,
): ScenarioResult {
  const files: ExhaustiveFileResult[] = perFile.map(({ sel, result }) => ({
    file: sel.selectedFile,
    ...(sel.selectedSha256 ? { sha256: sel.selectedSha256 } : {}),
    isBaked: sel.isBaked,
    status: result.status,
    ...(result.reason ? { reason: result.reason } : {}),
    ...(result.bench ? { bench: result.bench } : {}),
  }));
  const admissible = perFile.filter(
    (p) => p.result.status === 'PASS' || p.result.status === 'FAIL' || p.result.status === 'ERROR',
  );
  const failures = admissible.filter((p) => p.result.status === 'FAIL' || p.result.status === 'ERROR');
  const passes = admissible.filter((p) => p.result.status === 'PASS');

  const base: Omit<ScenarioResult, 'status' | 'oracleOutcomes'> = {
    engineId,
    browser,
    scenarioId: scenario.id,
    family: scenario.family,
    exhaustive: files,
    // §6.2 coverage: how many candidate files this engine was actually scored over. `passed` are the
    // files combined into bench.<metric>.aggregate; `admissible` = PASS+FAIL+ERROR (real signal);
    // `total` = every candidate offered. The report ranks winners coverage-FIRST (higher passed wins).
    coverage: { passed: passes.length, admissible: admissible.length, total: perFile.length },
    // Representative provenance: this cell spanned N files (per-file detail is in `exhaustive`).
    selection: {
      file: `${perFile.length} files (exhaustive)`,
      isBaked: files.length > 0 && files.every((f) => f.isBaked),
      ...(runSeed !== undefined ? { runSeed } : {}),
      candidateCount: perFile.length,
    },
    env: { ...runEnvBase, engineId },
    ...(perFile[0]?.result.startedAtIso ? { startedAtIso: perFile[0].result.startedAtIso } : {}),
    ...(perFile[0]?.result.primaryMetric ? { primaryMetric: perFile[0].result.primaryMetric } : {}),
  };

  if (failures.length > 0) {
    const anyFail = failures.some((f) => f.result.status === 'FAIL');
    const names = failures.map((f) => `${f.sel.selectedFile}(${f.result.status})`).join(', ');
    return {
      ...base,
      status: anyFail ? 'FAIL' : 'ERROR',
      oracleOutcomes: failures[0]!.result.oracleOutcomes ?? [],
      reason: `${failures.length}/${admissible.length} file(s) failed [${names}]: ${failures[0]!.result.reason ?? 'no detail'}`,
    };
  }
  if (passes.length > 0) {
    const bench = aggregateBenchAcrossFiles(passes.map((p) => p.result.bench));
    return {
      ...base,
      status: 'PASS',
      oracleOutcomes: passes[0]!.result.oracleOutcomes ?? [],
      reason: `all ${passes.length} file(s) passed`,
      ...(bench ? { bench } : {}),
    };
  }
  // No admissible file → all NA_*. Keep the actual NA kind: all-same → that; mixed → prefer NA_ASSET.
  const kinds = new Set(perFile.map((p) => p.result.status));
  const status =
    kinds.size === 1
      ? [...kinds][0]!
      : perFile.some((p) => p.result.status === 'NA_ASSET')
        ? 'NA_ASSET'
        : (perFile[0]?.result.status ?? 'NA_ASSET');
  return {
    ...base,
    status,
    oracleOutcomes: perFile[0]?.result.oracleOutcomes ?? [],
    ...(perFile[0]?.result.reason ? { reason: perFile[0].result.reason } : {}),
  };
}

/**
 * Exhaustive-mode headline bench (§6.2). For every metric the passing files carry, take each passing
 * file's representative value (its `bench[metric].median`) and summarize across files via
 * `summarizeAcrossFiles`: `.aggregate` COMBINES them per metric policy (SUM for additive cost metrics,
 * MAX for peakMemory, MEDIAN for higher-is-better rate metrics), while `.median`/`.p95`/`.mad`/`.samples`
 * describe the per-file SPREAD and `.n` is the file count. Undefined if no passing file carried a number.
 */
function aggregateBenchAcrossFiles(
  benches: Array<ScenarioResult['bench'] | undefined>,
): ScenarioResult['bench'] | undefined {
  const present = benches.filter((b): b is Partial<Record<MetricId, BenchSummary>> => !!b);
  if (present.length === 0) return undefined;
  const metrics = new Set<MetricId>();
  for (const b of present) for (const k of Object.keys(b)) metrics.add(k as MetricId);
  const out: Partial<Record<MetricId, BenchSummary>> = {};
  for (const m of metrics) {
    const values: number[] = [];
    for (const b of present) {
      const s = b[m];
      if (s && typeof s.median === 'number' && Number.isFinite(s.median)) values.push(s.median);
    }
    if (values.length === 0) continue;
    // warmup=0: these per-file medians are already-summarized representatives, not primed iterations.
    out[m] = summarizeAcrossFiles(m, values, 0);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// ── runOne ───────────────────────────────────────────────────────────────────────────────────────

/**
 * Execute one (engine, scenario) cell in the given browser. Builds the MediaInput, negotiates,
 * runs the functional op + oracles, and — only when PASS and the pillar includes performance —
 * benches each requested metric. ALWAYS disposes the engine.
 */
export async function runOne(
  engine: MediaEngine,
  scenario: Scenario,
  browser: BrowserName,
  support: CodecSupport,
  opts?: RunOneOptions,
): Promise<ScenarioResult> {
  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();
  const pillar = opts?.pillar ?? 'all';
  const wantsPerformance = pillar === 'all' || pillar === 'performance';
  const usesGracefulFailurePath =
    scenario.family === 'robustness' ||
    typeof scenario.mutate === 'function' ||
    scenario.oracles.includes('graceful-failure');

  const base: Omit<ScenarioResult, 'status' | 'oracleOutcomes'> = {
    engineId: engine.id,
    browser,
    scenarioId: scenario.id,
    family: scenario.family,
    startedAtIso,
    ...(opts?.env ? { env: opts.env } : {}),
    // §10 provenance: record WHICH file this cell ran against so a result replays from (runSeed, corpus)
    // and a FAIL on a rotated real file traces to the exact bytes. Purely additive — not read by scoring.
    ...(opts?.selection
      ? {
          selection: {
            file: opts.selection.file,
            ...(opts.selection.sha256 ? { sha256: opts.selection.sha256 } : {}),
            isBaked: opts.selection.isBaked,
            ...(opts?.runSeed ? { runSeed: opts.runSeed } : {}),
            ...(opts.selection.candidateCount !== undefined
              ? { candidateCount: opts.selection.candidateCount }
              : {}),
          },
        }
      : {}),
  };

  const finalize = (
    status: ScenarioResult['status'],
    oracleOutcomes: OracleOutcome[],
    reason?: string,
    bench?: ScenarioResult['bench'],
  ): ScenarioResult => ({
    ...base,
    status,
    oracleOutcomes,
    ...(reason !== undefined ? { reason } : {}),
    ...(bench !== undefined ? { bench } : {}),
    durationMs: Date.now() - startedAt,
  });

  try {
    // §6.4: when the caller passed rotated resolvedInputs, THEY are authoritative — `id` drives golden
    // (baked flat id resolves; real scenario-dir path 404s) and later `urlAssetPath` drives the bytes.
    // Without them we fall back to the scenario's own baked-by-flat-id input(s).
    const resolvedInputs = opts?.resolvedInputs;
    const assetIds =
      resolvedInputs && resolvedInputs.length > 0
        ? resolvedInputs.map((r) => r.id)
        : Array.isArray(scenario.input)
          ? scenario.input
          : [scenario.input];
    if (assetIds.length === 0) {
      return finalize('ERROR', [], 'scenario declares no input asset');
    }
    // Missing-asset preflight. Rotated real files aren't in fixtures/manifest.json, so the manifest
    // check must NOT run for them (it would falsely NA a present file); we HEAD-check the on-disk URL
    // instead and NA only on a real 404. The non-rotated/baked-by-flat-id path keeps the manifest check.
    if (resolvedInputs && resolvedInputs.length > 0) {
      for (const resolved of resolvedInputs) {
        const missing = await resolvedInputMissingReason(resolved);
        if (missing) return finalize('NA_ASSET', [], missing);
      }
    } else {
      for (const assetId of assetIds) {
        const missing = await missingAssetReason(assetId);
        if (missing) return finalize('NA_ASSET', [], missing);
      }
    }
    let golden: GoldenStore | undefined;
    if (scenario.op === 'decodeFrames') {
      golden = await loadGolden(assetIds[0]!);
      const goldenGap = decodeFrameGoldenGap(scenario, golden);
      if (goldenGap) return finalize('NA_ASSET', [], goldenGap);
    }

    // 1) Negotiate (declared ∧ runtime) — NA short-circuits, never benched.
    const caps = engine.capabilities();
    const neg = negotiate(caps, support, scenario.requires, scenario.options);
    if (!neg.ok) {
      return finalize(neg.status, [], neg.reason);
    }
    const strictRgbaGap = decodeFrameStrictRgbaGap(scenario, support);
    if (strictRgbaGap) return finalize('NA_BROWSER', [], strictRgbaGap);
    if (
      (!support.strictGoldenRgba || !support.strictSourceRgba) &&
      scenarioMayUseStrictPixelOracle(scenario)
    ) {
      golden ??= await loadGolden(assetIds[0]!);
      const pixelGap = await strictPixelBrowserGap(
        scenario,
        support,
        assetIds[0]!,
        golden,
        browser,
      );
      if (pixelGap) return finalize('NA_BROWSER', [], pixelGap);
    }
    const playbackGap = playbackSmokeBrowserGap(scenario, browser);
    if (playbackGap) return finalize('NA_BROWSER', [], playbackGap);
    const gaplessGap = gaplessSampleCountBrowserGap(scenario, browser);
    if (gaplessGap) return finalize('NA_BROWSER', [], gaplessGap);

    // 2) init() brackets expensive setup (excluded from measured timing). Timeout-guarded so a
    //    hanging WASM compile/instantiate (e.g. ffmpeg-wasm) becomes a clean ERROR, not a matrix stall.
    if (engine.init) {
      try {
        await withTimeout(engine.init(), DEFAULT_INIT_TIMEOUT_MS);
      } catch (err) {
        if (err instanceof TimeoutError) return finalize('ERROR', [], `init timeout: ${err.message}`);
        throw err;
      }
    }

    // 3) Build MediaInput(s) from the served corpus. Robustness scenarios mutate bytes first. Rotated
    //    inputs keep `id` (golden/identity) but fetch `urlAssetPath`, with the real file's size hint.
    const inputs =
      resolvedInputs && resolvedInputs.length > 0
        ? resolvedInputs.map((r) => buildMediaInput(r.id, scenario.mutate, r.urlAssetPath, r.sizeBytes))
        : assetIds.map((id) => buildMediaInput(id, scenario.mutate));
    const primaryInput = inputs[0]!;

    // 4) Graceful-failure path: malformed/degenerate inputs expect clean reject/return within timeout.
    if (usesGracefulFailurePath) {
      return await runRobustness(engine, scenario, inputs, finalize, opts);
    }

    // 5) FUNCTIONAL PASS FIRST — execute the op (timeout-guarded), then run all oracles.
    let opResult: OpResult;
    try {
      opResult = await withTimeout(executeOp(engine, scenario, inputs), scenario.timeoutMs);
    } catch (err) {
      if (err instanceof TimeoutError) {
        return finalize('FAIL', [], `timeout: ${err.message}`);
      }
      if (isNotApplicableError(err)) {
        return finalize('NA_ENGINE', [], errMessage(err));
      }
      throw err; // genuine error → caught by outer try as ERROR
    }

    // 6) Assemble OracleContext (inject decode/playback hooks + reference engine + golden).
    golden ??= await loadGolden(primaryInput.id);
    if (opResult.probeMetadatas?.length) {
      opResult = {
        ...opResult,
        probeMetadatas: await Promise.all(
          opResult.probeMetadatas.map(async (entry) => ({
            ...entry,
            golden: await loadGolden(entry.input.id),
          })),
        ),
      };
    }
    const ctx = buildOracleContext(scenario, primaryInput, inputs, opResult, golden, engine, opts);

    // 7) Run every declared oracle; PASS iff all green, else FAIL with first failure's detail.
    const oracleOutcomes: OracleOutcome[] = [];
    for (const oracle of scenario.oracles) {
      const outcome = await withTimeout(runOracle(oracle, ctx, scenario.tolerances), scenario.timeoutMs).catch(
        (err): OracleOutcome => ({
          oracle,
          pass: false,
          detail: err instanceof TimeoutError ? `timeout: ${err.message}` : errMessage(err),
        }),
      );
      oracleOutcomes.push(outcome);
    }
    // §7 rotation: partition outcomes so a golden-ABSENT gap on a rotated, golden-less real file
    // (NA_ASSET) can neither MASK a real survivor defect (R2 — that would hide a FAIL) nor DISCARD a
    // survivor PASS. Order among oracles must NOT decide the verdict.
    //  1) any real (non-bake-gap) failure is decisive → FAIL (the valuable finding a real file exposed);
    //  2) else if any oracle actually rendered a verdict (passed) → PASS — the survivor oracles carry
    //     the cell; golden-keyed oracles that went NA_ASSET are excluded, not blockers;
    //  3) else EVERY oracle was a golden/asset gap → no admissible signal at all → the cell is itself
    //     NA_ASSET (the "all-NA" case surfaced by the §11.2 guard).
    // For a BAKED fixture there are no bake-gap outcomes, so this reduces to the prior semantics exactly
    // (any fail → FAIL, else PASS).
    const realFail = oracleOutcomes.find((o) => !o.pass && !isGoldenBakeGap(o));
    if (realFail) {
      return finalize('FAIL', oracleOutcomes, `oracle '${realFail.oracle}' failed: ${realFail.detail ?? 'no detail'}`);
    }
    if (!oracleOutcomes.some((o) => o.pass)) {
      // No real failure and nothing passed ⇒ every non-pass was a golden/asset gap ⇒ honest NA_ASSET.
      const gap = oracleOutcomes.find((o) => !o.pass);
      if (gap) {
        return finalize('NA_ASSET', oracleOutcomes, `oracle '${gap.oracle}' unavailable: ${gap.detail}`);
      }
    }

    // 8) PASS. ONLY now, and only if the pillar includes performance, run the bench (§0.1).
    if (!wantsPerformance || scenario.metrics.length === 0) {
      return finalize('PASS', oracleOutcomes);
    }
    // Bench is timeout-guarded: correctness already PASSED, so a hung/too-slow bench records PASS
    // WITHOUT a number (honest — eligible but unmeasured) instead of stalling the matrix forever.
    let benchResult: ScenarioResult['bench'];
    try {
      benchResult = await withTimeout(
        runBench(engine, scenario, inputs, golden, opts?.benchOptions, opts?.resolvedInputs),
        DEFAULT_BENCH_TIMEOUT_MS,
      );
    } catch (err) {
      if (err instanceof TimeoutError) {
        return finalize('PASS', oracleOutcomes, `bench timeout: ${err.message}`);
      }
      throw err;
    }
    return finalize('PASS', oracleOutcomes, undefined, benchResult);
  } catch (err) {
    if (isNotApplicableError(err)) {
      return finalize('NA_ENGINE', [], errMessage(err));
    }
    return finalize('ERROR', [], errMessage(err));
  } finally {
    if (engine.dispose) {
      try {
        await engine.dispose();
      } catch {
        // dispose failures must not mask the result; swallow.
      }
    }
  }
}

/** Build the OracleContext, conditionally attaching only the present pieces (exactOptional off). */
function buildOracleContext(
  scenario: Scenario,
  input: MediaInput,
  inputs: MediaInput[],
  opResult: OpResult,
  golden: GoldenStore,
  engine: MediaEngine,
  opts: RunOneOptions | undefined,
): OracleContext {
  const missingHook =
    (label: string) =>
    async (): Promise<never> => {
      throw new Error(`oracle requires '${label}' hook, which the runner caller did not inject`);
    };

  const decodeWithPlatform =
    opts?.decodeWithPlatform ??
    (missingHook('decodeWithPlatform') as OracleContext['decodeWithPlatform']);
  const playbackSmoke =
    opts?.playbackSmoke ?? (missingHook('playbackSmoke') as OracleContext['playbackSmoke']);

  return {
    scenario,
    input,
    inputs,
    engine,
    golden,
    ...(opts?.browser !== undefined ? { browser: opts.browser } : {}),
    decodeWithPlatform,
    playbackSmoke,
    ...(opResult.output ? { output: opResult.output } : {}),
    ...(opResult.metadata ? { metadata: opResult.metadata } : {}),
    ...(opResult.probeMetadatas?.length
      ? { probeMetadatas: opResult.probeMetadatas as OracleContext['probeMetadatas'] }
      : {}),
    ...(opResult.demux ? { demux: opResult.demux } : {}),
    ...(opResult.frames ? { frames: opResult.frames } : {}),
    ...(opResult.seek ? { seek: opResult.seek } : {}),
  };
}

/**
 * Robustness/graceful-failure execution: feed malformed/degenerate bytes, expect the engine to handle
 * them GRACEFULLY within the timeout — no crash/hang/OOM. Verdict mapping (§11):
 *   - engine throws/rejects within timeout → graceful (the desired behavior). We route to the
 *     oracle with NO output populated; `graceful-failure` infers PASS from output-absence.
 *   - engine overruns the timeout          → timeout → FAIL (no crash/hang/OOM allowed).
 *   - engine RETURNS output for malformed input → we pass the output through; `graceful-failure`
 *     FAILs it ("produced output from malformed/mutated input"). A `property-invariant` oracle may
 *     still accept it (metamorphic scenarios that intentionally produce valid output).
 *
 * The oracle reads its signal from output-presence and `scenario.notes` tokens — the runner does
 * not invent a side channel. We carry the captured throw only for the FAIL reason string.
 */
async function runRobustness(
  engine: MediaEngine,
  scenario: Scenario,
  inputs: MediaInput[],
  finalize: (
    status: ScenarioResult['status'],
    oracleOutcomes: OracleOutcome[],
    reason?: string,
    bench?: ScenarioResult['bench'],
  ) => ScenarioResult,
  opts: RunOneOptions | undefined,
): Promise<ScenarioResult> {
  const input = inputs[0]!;
  let verdict: RobustnessVerdict;
  let opResult: OpResult | undefined;
  let opError: unknown;

  try {
    opResult = await withTimeout(executeOp(engine, scenario, inputs), scenario.timeoutMs);
    verdict = 'graceful'; // it returned without crashing/hanging; the engine did not blow up
  } catch (err) {
    if (isNotApplicableError(err)) {
      return finalize('NA_ENGINE', [], errMessage(err));
    }
    if (err instanceof TimeoutError) {
      verdict = 'timeout';
    } else {
      // A clean throw/reject is the SUCCESS condition for malformed input.
      verdict = 'graceful';
      opError = err;
    }
  }

  if (verdict === 'timeout') {
    return finalize('FAIL', [{ oracle: 'graceful-failure', pass: false, detail: 'timeout' }], 'timeout');
  }

  // The op did not hang. Run declared oracles (typically 'graceful-failure' / 'property-invariant').
  // When the op threw, opResult is undefined → empty output fields → graceful-failure infers PASS.
  // When it returned output, we pass it through → graceful-failure FAILs it as suspicious.
  const golden: GoldenStore = await loadGolden(input.id).catch(() => ({}) as GoldenStore);
  // Multi-input probe scenarios (e.g. robustness/prop_duration_consistent_across_containers) carry a
  // per-entry `golden` that the oracle dereferences; mirror runOne so each probeMetadatas entry has its
  // own golden loaded. Without this the robustness path left `entry.golden` undefined and the
  // probe-duration invariant threw "Cannot read properties of undefined (reading 'meta')".
  let robustnessOpResult = opResult ?? {};
  if (robustnessOpResult.probeMetadatas?.length) {
    robustnessOpResult = {
      ...robustnessOpResult,
      probeMetadatas: await Promise.all(
        robustnessOpResult.probeMetadatas.map(async (entry) => ({
          ...entry,
          golden: await loadGolden(entry.input.id).catch(() => ({}) as GoldenStore),
        })),
      ),
    };
  }
  const ctx = buildOracleContext(scenario, input, inputs, robustnessOpResult, golden, engine, opts);

  const oracleOutcomes: OracleOutcome[] = [];
  for (const oracle of scenario.oracles) {
    const outcome = await withTimeout(runOracle(oracle, ctx, scenario.tolerances), scenario.timeoutMs).catch(
      (err): OracleOutcome => ({
        oracle,
        pass: false,
        detail: err instanceof TimeoutError ? 'timeout' : errMessage(err),
      }),
    );
    oracleOutcomes.push(outcome);
  }

  // Same partition as the functional path: a golden/asset gap must not mask a real defect or discard a
  // survivor verdict. (Robustness is baked-only, so bake-gaps don't arise in practice — kept identical
  // for safety/consistency.) Real failure → FAIL; else all-gap → NA_ASSET; else PASS.
  const realFail = oracleOutcomes.find((o) => !o.pass && !isGoldenBakeGap(o));
  if (realFail) {
    return finalize(
      'FAIL',
      oracleOutcomes,
      `robustness oracle '${realFail.oracle}' failed: ${realFail.detail ?? verdict}`,
    );
  }
  if (!oracleOutcomes.some((o) => o.pass)) {
    const gap = oracleOutcomes.find((o) => !o.pass);
    if (gap) {
      return finalize('NA_ASSET', oracleOutcomes, `oracle '${gap.oracle}' unavailable: ${gap.detail}`);
    }
  }
  // Robustness never benches. Record the graceful-throw detail (if any) as the reason for context.
  const passReason = opError ? `graceful: ${errMessage(opError)}` : undefined;
  return finalize('PASS', oracleOutcomes, passReason);
}

/**
 * Run the benchmark protocol in fresh measured iterations. Each iteration re-builds the input(s)
 * (fresh byte source, clean read counters), re-runs the op under a `Meter`, and yields one
 * `MetricSample` that can contain wall, memory, throughput, packet count, and long-task fields.
 *
 * Important for huge/massive assets: one measured op execution now feeds every requested metric.
 * Running a multi-hour packet walk once per metric made at-scale demux rows multiply their media work
 * by 3+ and could exhaust the whole browser-run timeout before results were saved.
 */
async function runBench(
  engine: MediaEngine,
  scenario: Scenario,
  inputs: MediaInput[],
  golden: GoldenStore,
  benchOptions: BenchOptions | undefined,
  resolvedInputs?: ResolvedInput[],
): Promise<ScenarioResult['bench']> {
  const out: Partial<Record<MetricId, BenchSummary>> = {};

  const warmup = benchOptions?.warmup ?? DEFAULT_BENCH.warmup;
  const iters = benchOptions?.iters ?? DEFAULT_BENCH.iters;
  const observeLongtasks = scenario.metrics.includes('longtasks');

  const runSample = async (): Promise<MetricSample> => {
    // Fresh input per iteration: re-fetch bytes (cache is per-MediaInput, so rebuild). Rotated inputs
    // rebuild from resolvedInputs so the `urlAssetPath`/size overrides persist across bench iterations.
    const freshInputs =
      resolvedInputs && resolvedInputs.length > 0
        ? resolvedInputs.map((r) => buildMediaInput(r.id, scenario.mutate, r.urlAssetPath, r.sizeBytes))
        : inputs.map((i) => buildMediaInput(i.id, scenario.mutate));
    const meter = new Meter({ observeLongtasks });
    meter.begin();
    const opResult = await withTimeout(executeOp(engine, scenario, freshInputs), scenario.timeoutMs);
    const ctx: MeasureContext = {};
    const mediaSec = mediaSecFromContext(golden, opResult);
    if (mediaSec !== undefined) ctx.mediaSec = mediaSec;
    // COUNTS that back the headline per-second metrics (§8.1). Without these the Meter has no
    // numerator and opsPerSec/packetsPerSec/framesPerSec collapse to 0.
    // Every single op execution is one operation -> opsPerSec = 1/wall (e.g. probes/sec).
    ctx.ops = 1;
    if (opResult.output) {
      ctx.bytesOut = opResult.output.variants?.length
        ? opResult.output.variants.reduce((sum, variant) => sum + variant.bytes.byteLength, 0)
        : opResult.output.bytes.byteLength;
      if (opResult.output.targetWrites !== undefined) ctx.targetWrites = opResult.output.targetWrites;
      if (opResult.output.firstByteMs !== undefined) ctx.firstByteMs = opResult.output.firstByteMs;
    }
    if (opResult.demux) ctx.packets = opResult.demux.packets.length;
    if (opResult.seek) ctx.seeks = 1;
    if (opResult.frames) {
      // decodeFrames produced real frames -> decode fps + frames/sec.
      ctx.decodedFrames = opResult.frames.frames.length;
      ctx.frames = opResult.frames.frames.length;
    } else if (opResult.output) {
      // Frame-processing ops that return encoded bytes (transcode/remux/trim) carry no FrameSink;
      // estimate processed frames from golden (fps x duration) so the convert+resize headline
      // reports framesPerSec / encodeFps instead of a silent 0.
      const f = estimatedFrameCount(golden);
      if (f !== undefined) {
        ctx.frames = f;
        ctx.encodedFrames = f;
      }
    }
    return meter.end(ctx);
  };

  for (let i = 0; i < warmup; i++) {
    await runSample();
  }

  const samples: MetricSample[] = [];
  for (let i = 0; i < iters; i++) {
    samples.push(await runSample());
  }

  for (const metric of scenario.metrics) {
    const values = samples
      .map((sample) => metricSampleValue(metric, sample))
      .filter((value) => Number.isFinite(value));
    out[metric] = summarize(metric, values, warmup);
  }

  return out;
}

/** Estimate frames processed from golden metadata (video fps × duration). Used for framesPerSec /
 *  encodeFps on ops that return encoded bytes rather than a FrameSink (transcode/remux/trim). */
function estimatedFrameCount(golden: GoldenStore): number | undefined {
  const meta = golden?.meta;
  if (!meta) return undefined;
  const v = meta.tracks?.find((t) => t.type === 'video' && typeof t.fps === 'number' && t.fps > 0);
  const dur = meta.durationSec;
  if (v && typeof v.fps === 'number' && v.fps > 0 && typeof dur === 'number' && dur > 0) {
    return Math.round(v.fps * dur);
  }
  return undefined;
}

// ── runMatrix ──────────────────────────────────────────────────────────────────────────────────

/**
 * Build engines from registry factories, detect env + support ONCE per run, iterate
 * scenarioIds × engineIds, run each feature/scenario across all engines, fire onResult/onProgress,
 * and collect ScenarioResult[].
 * Scenarios are filtered by pillar (robustness family vs functional/performance).
 */
export async function runMatrix(opts: RunOptions): Promise<ScenarioResult[]> {
  const pillar = opts.pillar ?? 'all';

  // Resolve engines: requested ids (filtered against the registry) or all registered. Unknown ids
  // must NOT abort the whole run — a single bad --engine arg should warn+skip, never zero out the
  // matrix. Matching is forgiving so short names work: an arg matches a registration when it equals
  // the registration id, equals the engine's `.id`, or is a case-insensitive prefix of either (so
  // `mp4box` → `mp4box.js@0.5.4`, `mediabunny` → `mediabunny@1.48.0`). Exact ids still match.
  const allEngines = listScoredEngines();
  const engineIds = opts.engineIds
    ? await resolveEngineIds(opts.engineIds, allEngines)
    : allEngines.map((e) => e.id);
  // Resolve scenarios: requested ids or all registered, then filter by pillar. Unknown scenario ids
  // are WARNED and SKIPPED (not thrown) so the rest of the run proceeds.
  const allScenarios = opts.scenarioIds
    ? opts.scenarioIds.reduce<Scenario[]>((acc, id) => {
        const s = getScenario(id);
        if (!s) {
          console.warn(`runMatrix: unknown scenario id '${id}' — skipping (not in registry)`);
          return acc;
        }
        acc.push(s);
        return acc;
      }, [])
    : listScenarios();
  const featureSet = opts.featureIds?.length ? new Set(opts.featureIds) : undefined;
  const opSet = opts.operations?.length ? new Set(opts.operations) : undefined;
  const scenarios = allScenarios.filter(
    (s) =>
      scenarioMatchesPillar(s, pillar) &&
      (!featureSet || featureSet.has(s.family)) &&
      (!opSet || opSet.has(s.op)),
  );

  // Detect environment + codec support once (per-browser, per-run).
  const [env, support]: [EnvInfo, CodecSupport] = await Promise.all([detectEnv(), detectCodecSupport()]);

  // Build the run env (attached to every result) once.
  const runEnvBase: RunEnv = {
    suiteVersion: SUITE_VERSION,
    engineId: '', // filled per engine below
    browser: opts.browser,
    ...(env.version ? { browserVersion: env.version } : {}),
    ...(env.userAgent ? { userAgent: env.userAgent } : {}),
    ...(env.gpu ? { gpu: env.gpu } : {}),
  };

  const results: ScenarioResult[] = [];
  const scenarioById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));

  // §6/§10 Per-scenario media-file rotation: pick ONE input per scenario for THIS run (seeded on
  // randomSeed, reproducible), shared by every engine so a run replays from (runSeed, corpus). A
  // selection-subsystem failure NEVER nukes the matrix — we warn and fall back to baked-only inputs
  // (today's behavior). corpusChecksum makes the picked corpus visible in every result's env; §6.3
  // shape warnings surface corpus bugs instead of hiding them (a dropped real file is a corpus bug,
  // never an engine NA).
  const rotate = opts.rotateMedia ?? true;
  const exhaustive = opts.exhaustiveMedia === true;
  let selections = new Map<string, ScenarioSelection>();
  // Exhaustive mode (§6.2): every scenario's FULL ordered candidate list (baked + all real files), run
  // per-file and aggregated. Empty ⇒ fall back to the single-selection path (baked-only per scenario).
  let exhaustiveCandidates = new Map<string, ScenarioSelection[]>();
  try {
    const mediaSources = await loadScenarioSources();
    selections = selectForRun(scenarios, opts.randomSeed ?? '', mediaSources, { rotate });
    if (exhaustive) exhaustiveCandidates = candidatesForRun(scenarios, mediaSources, { rotate });
    // corpusChecksum reflects everything actually run: all candidates in exhaustive mode, else the picks.
    runEnvBase.corpusChecksum = exhaustive
      ? computeCorpusChecksum([...exhaustiveCandidates.values()].flat())
      : computeCorpusChecksum(selections.values());
    let rotatedReal = 0;
    let bakedCount = 0;
    for (const sel of selections.values()) {
      if (sel.isBaked) bakedCount += 1;
      else rotatedReal += 1;
      for (const warning of sel.shapeWarnings) {
        console.warn(`media-selection [${sel.scenarioId}]: ${warning}`);
      }
    }
    const exhaustiveFiles = exhaustive ? [...exhaustiveCandidates.values()].reduce((n, c) => n + c.length, 0) : 0;
    console.info(
      `media-selection: ${selections.size} scenarios — ${rotatedReal} rotated-real, ${bakedCount} baked ` +
        `(rotate=${rotate}, exhaustive=${exhaustive}${exhaustive ? ` [${exhaustiveFiles} file-runs]` : ''}, ` +
        `seed='${opts.randomSeed ?? ''}', corpus=${runEnvBase.corpusChecksum})`,
    );
  } catch (err) {
    console.warn(
      `media-selection: selection unavailable (${errMessage(err)}); falling back to baked-only inputs`,
    );
    selections = new Map();
    exhaustiveCandidates = new Map();
  }

  const executionOrder = buildExecutionOrder(
    engineIds,
    scenarios.map((scenario) => scenario.id),
    opts.randomizeOrder === true,
    opts.randomSeed ?? '',
  );
  const total = executionOrder.length;
  let done = 0;

  for (const cell of executionOrder) {
    if (opts.signal?.aborted) break;
    // Use the selection's effectiveScenario downstream (negotiate/disabled/reuse/runOne). Its id/family/
    // requires are UNCHANGED (so those behave identically); only `input` and, for a rotated DERIVED file,
    // `options`/`oracles` differ. Falls back to the registry scenario if selection is unavailable.
    const selection = selections.get(cell.scenarioId);
    const scenario = selection?.effectiveScenario ?? scenarioById.get(cell.scenarioId);
    if (!scenario) continue;
    const engineId = cell.engineId;
    const reg = getEngine(engineId);
    if (!reg) {
      // Unknown engine id: surface as ERROR cells rather than throwing the whole matrix.
      const r: ScenarioResult = {
        engineId,
        browser: opts.browser,
        scenarioId: scenario.id,
        family: scenario.family,
        status: 'ERROR',
        oracleOutcomes: [],
        reason: `unknown engine id: ${engineId}`,
        env: { ...runEnvBase, engineId },
      };
      results.push(r);
      opts.onResult?.(r);
      done += 1;
      opts.onProgress?.(done, total, `${scenario.id} / ${engineId}`);
      continue;
    }

      const label = `${scenario.id} / ${engineId}`;
      // Fresh engine per (engine, scenario) cell → clean memory (§10.2).
      let engine: MediaEngine | undefined;
      let result: ScenarioResult;
      try {
        engine = await reg.factory();
      } catch (err) {
        result = {
          engineId,
          browser: opts.browser,
          scenarioId: scenario.id,
          family: scenario.family,
          status: 'ERROR',
          oracleOutcomes: [],
          reason: `failed to construct engine: ${errMessage(err)}`,
          env: { ...runEnvBase, engineId },
        };
        results.push(result);
        opts.onResult?.(result);
        done += 1;
        opts.onProgress?.(done, total, label);
        continue;
      }

      // Disabled cell? Check AFTER construction so we can match (and label with) the engine's CANONICAL
      // id (engine.id). The registry key (cell.engineId) may be a bare alias — e.g. mediabunny registers
      // under 'mediabunny' while the instance reports 'mediabunny@1.48.0' — so we match disabled-cells.ts
      // entries against EITHER id form, and always label the result with engine.id so a disabled cell
      // never splits the engine's column in the report.
      const disabledReason =
        disabledCellReason(engine.id, scenario.id) ?? disabledCellReason(engineId, scenario.id);
      if (disabledReason) {
        if (engine.dispose) {
          try {
            await engine.dispose();
          } catch {
            // dispose failures must not mask the skip; swallow.
          }
        }
        result = {
          engineId: engine.id,
          browser: opts.browser,
          scenarioId: scenario.id,
          family: scenario.family,
          status: 'SKIPPED',
          oracleOutcomes: [],
          reason: disabledReason,
          env: { ...runEnvBase, engineId: engine.id },
        };
        results.push(result);
        opts.onResult?.(result);
        done += 1;
        opts.onProgress?.(done, total, `${scenario.id} / ${engine.id} (skipped)`);
        continue;
      }

      // §10 STALE-PASS guard: fold the selection tag into the reuse key so a run that picked a DIFFERENT
      // file for this scenario can never reuse a prior PASS validated against other bytes. `selectionCacheTag`
      // is 'baked' for the baked fixture, else the picked file's sha prefix. The store keys `put` off
      // result.scenarioId, so we stamp the composite key onto the STORED copy only (via withCacheKey) and
      // restore the true scenarioId on the cache-hit read path — live results always carry the real id.
      const cacheTag = selection ? selectionCacheTag(selection) : undefined;
      const cacheScenarioKey = cacheTag ? `${scenario.id}#${cacheTag}` : scenario.id;
      const withCacheKey = (r: ScenarioResult): ScenarioResult =>
        cacheScenarioKey === scenario.id ? r : { ...r, scenarioId: cacheScenarioKey };

      const preNeg = negotiate(engine.capabilities(), support, scenario.requires, scenario.options);
      if (!preNeg.ok) {
        result = {
          engineId: engine.id,
          browser: opts.browser,
          scenarioId: scenario.id,
          family: scenario.family,
          status: preNeg.status,
          oracleOutcomes: [],
          reason: preNeg.reason,
          env: { ...runEnvBase, engineId: engine.id },
        };
        if (engine.dispose) {
          try {
            await engine.dispose();
          } catch {
            /* swallow */
          }
        }
        await opts.resultReuse?.put(withCacheKey(result)).catch(() => undefined);
        results.push(result);
        opts.onResult?.(result);
        done += 1;
        opts.onProgress?.(done, total, label);
        continue;
      }

      // Exhaustive mode runs every file fresh (a thorough audit) — never serve a single-file cached PASS.
      const cached = exhaustive
        ? undefined
        : await opts.resultReuse?.get(engine.id, cacheScenarioKey, opts.browser).catch(() => undefined);
      if (cached && cached.status === 'PASS') {
        const cachedReason = cached.reason?.replace(/^(cached:\s*)+/i, '');
        result = {
          ...cached,
          // The stored copy was keyed under the composite `${id}#${tag}`; restore the true scenario id so
          // the live/reported result is never polluted by the cache-key encoding.
          scenarioId: scenario.id,
          reason:
            cachedReason && cachedReason !== 'cached previous PASS result'
              ? `cached: ${cachedReason}`
              : 'cached previous PASS result',
        };
        if (engine.dispose) {
          try {
            await engine.dispose();
          } catch {
            /* swallow */
          }
        }
        results.push(result);
        opts.onResult?.(result);
        done += 1;
        opts.onProgress?.(done, total, `${label} (cached)`);
        continue;
      }

      // §6.2 EXHAUSTIVE: run EVERY candidate file for this cell (same order for every engine) and
      // aggregate — cell PASSes only if ALL files pass; bench combines across passing files (sum/max/
      // median per metric). `engine` (constructed + negotiated OK) is reused for file 0; fresh engines
      // for the rest (runOne inits+disposes each). Bypasses the single-file path.
      if (exhaustive) {
        const list = exhaustiveCandidates.get(scenario.id) ?? (selection ? [selection] : []);
        if (list.length > 0) {
          result = await runExhaustiveCell(engine, engineId, reg, list, scenario, opts, support, runEnvBase, pillar);
          if (scenario.primaryMetric !== undefined && result.primaryMetric === undefined) {
            result.primaryMetric = scenario.primaryMetric;
          }
          results.push(result);
          opts.onResult?.(result);
          done += 1;
          opts.onProgress?.(done, total, `${label} (exhaustive ×${list.length})`);
          continue;
        }
        // list empty ⇒ selection subsystem unavailable ⇒ fall through to the normal single (baked) path.
      }

      const runOneOpts: RunOneOptions = {
        browser: opts.browser,
        pillar,
        env: { ...runEnvBase, engineId },
        // Inject the browser-pure oracle hooks (default to the platform engine's helpers; the caller
        // may override via RunOptions). Without these, decode/playback oracles fail with "hook not
        // injected" when driven through runMatrix.
        decodeWithPlatform: opts.decodeWithPlatform ?? decodeBytesToFrames,
        playbackSmoke: opts.playbackSmoke ?? platformPlaybackSmoke,
        ...(opts.benchOptions ? { benchOptions: opts.benchOptions } : {}),
        // §6/§10: hand runOne the rotated pick so it fetches the right bytes, records provenance, and
        // keys the reuse cache per file. Absent selection ⇒ omitted ⇒ today's baked-by-flat-id path.
        ...(selection?.resolvedInputs ? { resolvedInputs: selection.resolvedInputs } : {}),
        ...(selection
          ? {
              selection: {
                file: selection.selectedFile,
                isBaked: selection.isBaked,
                ...(selection.selectedSha256 ? { sha256: selection.selectedSha256 } : {}),
                ...(selection.candidateCount !== undefined
                  ? { candidateCount: selection.candidateCount }
                  : {}),
              },
            }
          : {}),
        ...(opts.randomSeed !== undefined ? { runSeed: opts.randomSeed } : {}),
      };

      try {
        result = await runOne(engine, scenario, opts.browser, support, runOneOpts);
      } catch (err) {
        // runOne is already total (its own try/catch), but guard the matrix loop anyway.
        result = {
          engineId,
          browser: opts.browser,
          scenarioId: scenario.id,
          family: scenario.family,
          status: 'ERROR',
          oracleOutcomes: [],
          reason: errMessage(err),
          env: { ...runEnvBase, engineId },
        };
      }

      // §9: stamp the case's primary ranking metric so the report ranks winners precisely (it only
      // infers as a fallback). §8.5: record the engine's best-path config into env for reproducibility.
      if (scenario.primaryMetric !== undefined && result.primaryMetric === undefined) {
        result.primaryMetric = scenario.primaryMetric;
      }
      if (engine?.configUsed && result.env) {
        result.env = { ...result.env, configUsed: engine.configUsed };
      }

      await opts.resultReuse?.put(withCacheKey(result)).catch(() => undefined);
      results.push(result);
      opts.onResult?.(result);
      done += 1;
      opts.onProgress?.(done, total, label);
  }

  return results;
}

// ── helpers ────────────────────────────────────────────────────────────────────────────────────

/**
 * Resolve user-supplied engine args against the registry, forgiving short names. An arg matches a
 * registered engine when it equals the registration id or the engine's reported `.id` (exact,
 * case-sensitive first, then case-insensitive), or is a case-insensitive prefix of either — so
 * `mp4box` matches `mp4box@2.3.0` and exact ids like `mediabunny@1.48.0` keep working unchanged.
 *
 * Unknown args are WARNED and SKIPPED (never thrown) so one bad `--engine` does not zero the matrix.
 * Order follows the user's args; duplicates (incl. two args resolving to the same engine) are
 * de-duplicated, preserving first-seen order.
 */
async function resolveEngineIds(requested: string[], registered: RegisteredEngine[]): Promise<string[]> {
  const candidates = await engineIdCandidates(registered);
  const resolved: string[] = [];
  const seen = new Set<string>();
  for (const arg of requested) {
    const match = matchEngineId(arg, candidates);
    if (!match) {
      console.warn(
        `runMatrix: unknown engine id '${arg}' — skipping (no registered engine matches by id or prefix)`,
      );
      continue;
    }
    if (!seen.has(match)) {
      seen.add(match);
      resolved.push(match);
    }
  }
  return resolved;
}

function shuffleInPlace<T>(items: T[], seed: string): void {
  const rand = mulberry32(hashSeed(seed));
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
}

interface EngineIdCandidate {
  registryId: string;
  aliases: string[];
}

async function engineIdCandidates(registered: RegisteredEngine[]): Promise<EngineIdCandidate[]> {
  return Promise.all(
    registered.map(async (e) => {
      const aliases = [e.id];
      try {
        const engine = await e.factory();
        if (engine.id && !aliases.includes(engine.id)) aliases.push(engine.id);
      } catch {
        // If a constructor ever fails, keep the registry id usable; init() will report real failures.
      }
      return { registryId: e.id, aliases };
    }),
  );
}

/** Match one engine arg against registration ids and reported engine ids (exact → ci-exact → ci-prefix). */
function matchEngineId(arg: string, candidates: EngineIdCandidate[]): string | undefined {
  const lower = arg.toLowerCase();
  // Exact (case-sensitive) wins so a precise id is never shadowed by a looser candidate.
  const exact = candidates.find((c) => c.aliases.some((id) => id === arg));
  if (exact) return exact.registryId;
  const ciExact = candidates.find((c) => c.aliases.some((id) => id.toLowerCase() === lower));
  if (ciExact) return ciExact.registryId;
  const prefix = candidates.filter((c) => c.aliases.some((id) => id.toLowerCase().startsWith(lower)));
  if (prefix.length >= 1) {
    if (prefix.length > 1) {
      console.warn(
        `runMatrix: engine arg '${arg}' is an ambiguous prefix (${prefix
          .map((c) => c.aliases.join('|'))
          .join(', ')}) — using '${prefix[0]?.registryId}'`,
      );
    }
    return prefix[0]?.registryId;
  }
  return undefined;
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
