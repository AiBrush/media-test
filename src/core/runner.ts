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
 * (`decodeWithPlatform`, `playbackSmoke`) and the reference engine are injected by the caller via
 * `opts` so the registry/app wires the platform engine; if absent, oracles that need them fail
 * with a clear reason (handled in oracles.ts).
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
  TranscodeOptions,
} from './engine.ts';
import type {
  BenchSummary,
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

import { getEngine, getReferenceEngineId, listEngines, listScenarios, getScenario } from './registry.ts';
import type { RegisteredEngine } from './registry.ts';
import { detectCodecSupport, detectEnv } from './feature-detect.ts';
import { Meter } from './measure.ts';
import { DEFAULT_BENCH, metricSampleValue, summarize } from './bench.ts';
import { loadGolden, runOracle } from './oracles.ts';
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
export function negotiate(caps: CapabilitySet, support: CodecSupport, requires: Requires): Negotiation {
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
  for (const ac of requires.audioCodecs ?? []) {
    if (!caps.audioCodecs.includes(ac)) {
      return { ok: false, status: 'NA_ENGINE', reason: `engine does not declare audio codec '${ac}'` };
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

  const requiredVideo = requires.videoCodecs ?? [];
  const requiredAudio = requires.audioCodecs ?? [];

  // Determine whether this scenario asks the browser to configure codecs. Parser-only operations
  // (probe/demux/remux copy) do not need WebCodecs decode support just to read packets/metadata; the
  // old flat gate incorrectly blocked cases like FLAC demux in Chromium. Decode/seek/decrypt need
  // decode support, while transcode/mux additionally need encode support for target codecs.
  const producesEncodedOutput =
    requires.operations.includes('transcode') || requires.operations.includes('mux');
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
    if (producesEncodedOutput) {
      if (!canEncode) {
        return {
          ok: false,
          status: 'NA_BROWSER',
          reason: `browser cannot encode video codec '${vc}' (WebCodecs VideoEncoder.isConfigSupported=false)`,
        };
      }
    } else if (needsDecodeConfig && !canDecode) {
      return {
        ok: false,
        status: 'NA_BROWSER',
        reason: `browser cannot decode video codec '${vc}' (WebCodecs VideoDecoder.isConfigSupported=false)`,
      };
    }
  }

  for (const ac of requiredAudio) {
    const canDecode = support.audioDecode[ac] === true;
    const canEncode = support.audioEncode[ac] === true;
    if (producesEncodedOutput) {
      if (!canEncode) {
        return {
          ok: false,
          status: 'NA_BROWSER',
          reason: `browser cannot encode audio codec '${ac}' (WebCodecs AudioEncoder.isConfigSupported=false)`,
        };
      }
    } else if (needsDecodeConfig && !canDecode) {
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

  return { ok: true };
}

// ── Run options ──────────────────────────────────────────────────────────────────────────────

export interface RunOptions {
  browser: BrowserName;
  engineIds?: string[]; // default: all registered
  scenarioIds?: string[]; // default: all registered
  featureIds?: ScenarioFamily[]; // feature/family-first filter, e.g. probe|demux|remux
  operations?: Operation[]; // optional op-level filter, e.g. demux|remux
  pillar?: 'functional' | 'performance' | 'robustness' | 'all'; // default 'all'
  benchOptions?: BenchOptions;
  onResult?: (r: ScenarioResult) => void;
  onProgress?: (done: number, total: number, label: string) => void;
  /** optional override of the browser-pure oracle hooks; default to the platform engine's helpers */
  decodeWithPlatform?: OracleContext['decodeWithPlatform'];
  playbackSmoke?: OracleContext['playbackSmoke'];
}

/**
 * The injected oracle hooks + reference engine. INTERNAL_API.md types `runOne`'s `opts` as
 * `Partial<RunOptions>`, but the oracle context (oracles.ts) needs the platform-decode /
 * playback-smoke hooks and an optional reference engine. The runner accepts them alongside the
 * public RunOptions so the caller (registry/app) wires the platform engine. This widening is
 * additive — every `Partial<RunOptions>` is assignable to `RunOneOptions`.
 */
export interface RunOneOptions extends Partial<RunOptions> {
  /** injected by caller: decode arbitrary bytes with the platform engine (WebCodecs) → frames */
  decodeWithPlatform?: OracleContext['decodeWithPlatform'];
  /** injected by caller: <video> playback smoke test → resolves true if it plays a few frames */
  playbackSmoke?: OracleContext['playbackSmoke'];
  /** injected by caller: the reference engine instance (for 'reference-reimport' oracle) */
  referenceEngine?: MediaEngine;
  /** environment captured once per run (attached to every result) */
  env?: RunEnv;
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
 * Build a `MediaInput` for a corpus asset served as a static file at `/fixtures/media/<id>`.
 * `blob()`/`arrayBuffer()` fetch lazily and cache; an optional `mutate` (robustness) rewrites the
 * bytes after fetch so the engine is fed corrupted input.
 */
function buildMediaInput(assetId: string, mutate?: (bytes: Uint8Array) => Uint8Array): MediaInput {
  const url = mediaAssetUrl(assetId);
  const mime = mimeForAssetId(assetId);

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
  return s === 'cenc-cbcs' || s === 'hls-aes128' ? s : 'cenc-ctr';
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
      return { output: await engine.remux(input, { container: asContainerOpt(scenario.options) }) };
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
        throw new Error('mux scenario requires options.tracks or engine.prepareMuxTracks()');
      }
      return { output: await engine.mux(tracks, { container: asContainerOpt(scenario.options) }) };
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
    detail.includes('frame-bake must run')
  );
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
    const assetIds = Array.isArray(scenario.input) ? scenario.input : [scenario.input];
    if (assetIds.length === 0) {
      return finalize('ERROR', [], 'scenario declares no input asset');
    }
    for (const assetId of assetIds) {
      const missing = await missingAssetReason(assetId);
      if (missing) return finalize('NA_ASSET', [], missing);
    }

    // 1) Negotiate (declared ∧ runtime) — NA short-circuits, never benched.
    const caps = engine.capabilities();
    const neg = negotiate(caps, support, scenario.requires);
    if (!neg.ok) {
      return finalize(neg.status, [], neg.reason);
    }

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

    // 3) Build MediaInput(s) from the served corpus. Robustness scenarios mutate bytes first.
    const inputs = assetIds.map((id) => buildMediaInput(id, scenario.mutate));
    const primaryInput = inputs[0]!;

    // 4) Graceful-failure path: malformed/degenerate inputs expect clean reject/return within timeout.
    if (usesGracefulFailurePath) {
      return await runRobustness(engine, scenario, primaryInput, finalize, opts);
    }

    // 5) FUNCTIONAL PASS FIRST — execute the op (timeout-guarded), then run all oracles.
    let opResult: OpResult;
    try {
      opResult = await withTimeout(executeOp(engine, scenario, inputs), scenario.timeoutMs);
    } catch (err) {
      if (err instanceof TimeoutError) {
        return finalize('FAIL', [], `timeout: ${err.message}`);
      }
      throw err; // genuine error → caught by outer try as ERROR
    }

    // 6) Assemble OracleContext (inject decode/playback hooks + reference engine + golden).
    const golden: GoldenStore = await loadGolden(primaryInput.id);
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
    const ctx = buildOracleContext(scenario, primaryInput, opResult, golden, opts);

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
    const firstFail = oracleOutcomes.find((o) => !o.pass);
    if (firstFail) {
      if (isGoldenBakeGap(firstFail)) {
        return finalize('NA_ASSET', oracleOutcomes, `oracle '${firstFail.oracle}' unavailable: ${firstFail.detail}`);
      }
      return finalize('FAIL', oracleOutcomes, `oracle '${firstFail.oracle}' failed: ${firstFail.detail ?? 'no detail'}`);
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
        runBench(engine, scenario, inputs, golden, opts?.benchOptions),
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
  opResult: OpResult,
  golden: GoldenStore,
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
    golden,
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
    ...(opts?.referenceEngine ? { referenceEngine: opts.referenceEngine } : {}),
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
  input: MediaInput,
  finalize: (
    status: ScenarioResult['status'],
    oracleOutcomes: OracleOutcome[],
    reason?: string,
    bench?: ScenarioResult['bench'],
  ) => ScenarioResult,
  opts: RunOneOptions | undefined,
): Promise<ScenarioResult> {
  let verdict: RobustnessVerdict;
  let opResult: OpResult | undefined;
  let opError: unknown;

  try {
    opResult = await withTimeout(executeOp(engine, scenario, [input]), scenario.timeoutMs);
    verdict = 'graceful'; // it returned without crashing/hanging; the engine did not blow up
  } catch (err) {
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
  const ctx = buildOracleContext(scenario, input, opResult ?? {}, golden, opts);

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

  const firstFail = oracleOutcomes.find((o) => !o.pass);
  if (firstFail) {
    return finalize(
      'FAIL',
      oracleOutcomes,
      `robustness oracle '${firstFail.oracle}' failed: ${firstFail.detail ?? verdict}`,
    );
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
): Promise<ScenarioResult['bench']> {
  const out: Partial<Record<MetricId, BenchSummary>> = {};

  const warmup = benchOptions?.warmup ?? DEFAULT_BENCH.warmup;
  const iters = benchOptions?.iters ?? DEFAULT_BENCH.iters;
  const observeLongtasks = scenario.metrics.includes('longtasks');

  const runSample = async (): Promise<MetricSample> => {
    // Fresh input per iteration: re-fetch bytes (cache is per-MediaInput, so rebuild).
    const freshInputs = inputs.map((i) => buildMediaInput(i.id, scenario.mutate));
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
    if (opResult.output) ctx.bytesOut = opResult.output.bytes.byteLength;
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
 * Scenarios are filtered by pillar (robustness family vs functional/performance). The reference
 * engine (if registered and distinct) is constructed once and injected for 'reference-reimport'.
 */
export async function runMatrix(opts: RunOptions): Promise<ScenarioResult[]> {
  const pillar = opts.pillar ?? 'all';

  // Resolve engines: requested ids (filtered against the registry) or all registered. Unknown ids
  // must NOT abort the whole run — a single bad --engine arg should warn+skip, never zero out the
  // matrix. Matching is forgiving so short names work: an arg matches a registration when it equals
  // the registration id, equals the engine's `.id`, or is a case-insensitive prefix of either (so
  // `mp4box` → `mp4box.js@0.5.4`, `mediabunny` → `mediabunny@1.48.0`). Exact ids still match.
  const allEngines = listEngines();
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
  const referenceEngineId = getReferenceEngineId();
  const runEnvBase: RunEnv = {
    suiteVersion: SUITE_VERSION,
    engineId: '', // filled per engine below
    browser: opts.browser,
    ...(env.version ? { browserVersion: env.version } : {}),
    ...(env.userAgent ? { userAgent: env.userAgent } : {}),
    ...(env.gpu ? { gpu: env.gpu } : {}),
  };

  const results: ScenarioResult[] = [];
  const total = engineIds.length * scenarios.length;
  let done = 0;

  for (const scenario of scenarios) {
    for (const engineId of engineIds) {
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

      // Build the reference engine for oracles that re-import. When the candidate is the registered
      // reference, reuse that already-initialized instance for the oracle instead of omitting it.
      let referenceEngine: MediaEngine | undefined;
      let disposeReferenceEngine = false;
      if (referenceEngineId === engineId) {
        referenceEngine = engine;
      } else {
        const refReg = getEngine(referenceEngineId);
        if (refReg) {
          try {
            referenceEngine = await refReg.factory();
            if (referenceEngine.init) await referenceEngine.init();
            disposeReferenceEngine = true;
          } catch {
            referenceEngine = undefined; // oracle that needs it will fail with a clear reason
            disposeReferenceEngine = false;
          }
        }
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
        ...(referenceEngine ? { referenceEngine } : {}),
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
      } finally {
        // Dispose the reference engine we spun up for this cell.
        if (disposeReferenceEngine && referenceEngine?.dispose) {
          try {
            await referenceEngine.dispose();
          } catch {
            /* swallow */
          }
        }
      }

      // §9: stamp the case's primary ranking metric so the report ranks winners precisely (it only
      // infers as a fallback). §8.5: record the engine's best-path config into env for reproducibility.
      if (scenario.primaryMetric !== undefined && result.primaryMetric === undefined) {
        result.primaryMetric = scenario.primaryMetric;
      }
      if (engine?.configUsed && result.env) {
        result.env = { ...result.env, configUsed: engine.configUsed };
      }

      results.push(result);
      opts.onResult?.(result);
      done += 1;
      opts.onProgress?.(done, total, label);
    }
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
