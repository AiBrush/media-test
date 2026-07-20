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
  DecodeOptions,
  DecryptKey,
  DemuxResult,
  EncodedTracks,
  EncryptionScheme,
  FrameDigest,
  FrameSink,
  MediaBytes,
  MediaEngine,
  MediaInput,
  NormalizedTrack,
  NormalizedMetadata,
  Operation,
  RemuxOptions,
  MuxOptions,
  TranscodeOptions,
  TrimOptions,
  ConcreteOperationRequest,
  ConcreteWebCodecsConfig,
  OperationFinalCounters,
  OperationTelemetry,
  SupportDecision,
  LifecycleContext,
  OperationContext,
  OperationPhase,
  SeekResult,
} from './engine.ts';
import {
  AUTHENTICATED_RANGE_PROBE_FEATURE,
  CONCRETE_OPERATION_PROTOCOL,
  SUPPORTED_CHECKED_SUPPORT_SNAPSHOT,
  AdapterContractError,
  ConfigUsedSnapshots,
  NotApplicableError,
  OperationTelemetryCollector,
  createBrowserNotSupportedError,
  createNotApplicableError,
  isBrowserNotSupportedError,
  isMalformedInputError,
  isNotApplicableError,
  validateAdapterResult,
  validateCapabilitySet,
  validateEncodedTracks,
  validateSupportDecision,
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
  ScenarioOperationEvidence,
  ScenarioResult,
  RunEnv,
} from './scenario.ts';
import { reduceOracleOutcomes } from './scenario.ts';
import type { CodecSupport, EnvInfo } from './feature-detect.ts';
import type { BenchOptions } from './bench.ts';
import type { MeasureContext } from './measure.ts';
import type { GoldenKind, GoldenStore, OracleContext } from './oracles.ts';

import { getEngine, listScoredEngines, listScenarios, getScenario } from './registry.ts';
import type { RegisteredEngine } from './registry.ts';
import { detectCodecSupport, detectEnv, probeWebCodecsConfigs } from './feature-detect.ts';
import {
  DEFAULT_MEMORY_SAMPLE_TIMEOUT_MS,
  Meter,
  measurePeakMemoryWindow,
  userAgentSpecificMemorySampler,
  type MeterEvidence,
  type MemorySampler,
  type MemoryPeakObservation,
  type MemoryWindowOptions,
  type LongTaskObserverEnvironment,
} from './measure.ts';
import {
  DEFAULT_BENCH,
  MetricProtocolError,
  adaptiveBench,
  metricHigherIsBetter,
  metricSampleValue,
  requireFiniteMetricSample,
  summarize,
  summarizeAcrossFiles,
  type AdaptiveBatchRequest,
  type BenchRatioComponent,
} from './bench.ts';
import { emptyGoldenStore, loadGolden, runOracle } from './oracles.ts';
import {
  ActiveFixtureRuntime,
  type ActiveFixtureMediaResult,
} from './fixture-integrity.ts';
import { readOutputPacketsResult, readOutputStructureResult } from './box-readers.ts';
import { disabledCellReason } from './disabled-cells.ts';
// Per-scenario media-file rotation (§6/§10): the ONE seeded RNG shared with media-selection, plus the
// selection API. The runner only decides WHICH file is fetched — it never mutates bytes, softens an
// oracle, or routes a real defect to NA (hard rules R1/R2/R3).
import { mulberry32, hashSeed, sha256Hex } from './seeded-rng.ts';
import {
  loadScenarioSources,
  selectForRun,
  candidatesForRun,
  selectionCacheTag,
  computeCorpusChecksum,
  contentIdentityDigest,
  DECRYPT_METAMORPHIC_INVARIANT,
  evaluateCandidateEvidence,
  isCorpusDeliveryIntegrityError,
  verifyContentStream,
  withVerifiedContent,
} from './media-selection.ts';
import type {
  ContentIdentity,
  CandidateOracleEvidencePlan,
  ResolvedInput,
  ScenarioSelection,
  VerifiedContent,
  VerifiedStreamContent,
} from './media-selection.ts';
// The platform engine IS the browser-pure oracle decoder/player (§8). runMatrix injects these into
// every cell so oracles that decode output / smoke-play it work without the caller wiring them.
import { decodeBytesToFrames, playbackSmoke as platformPlaybackSmoke } from '../engines/platform/oracle-helpers.ts';
import { collectGaplessNativeEvidence } from '../engines/platform/audio-gapless.ts';
import {
  countDecodedPresentationUnits,
  countOutputPresentationUnits,
  inspectOutputPresentation,
  operationEventLatency,
  resolvePresentationDuration,
  sourceReadEvidence,
  type PerformanceEvidence,
  type PresentationDuration,
} from '../features/performance/index.ts';
import {
  assessProbeBudget,
  probeBudgetFromOptions,
  probeBudgetPreflight,
  type ProbeContractAssessment,
} from '../features/probe/index.ts';
import {
  BoundedStreamingSink,
  STREAMING_RUNTIME_EVIDENCE_SCHEMA,
  assessStreamingRuntime,
  probeStreamingBrowserAppend,
  readStreamingRuntimeEvidence,
  readTimeToFirstByteSample,
  recognizeStreamingScenarioContract,
  streamingDecisionFromOracleOutcome,
  streamingError,
  streamingRuntimeToCoreDisposition,
  streamingVerdict,
  type StreamingDecision,
  type StreamingRuntimeEvidence,
} from '../features/streaming-output/index.ts';
import { canonicalJsonSha256 } from './canonical-json.ts';
import {
  decideRobustnessDisposition,
  defineRobustnessContract,
  robustnessContractFromOptions,
  validateRobustnessReturnedValue,
  type RobustnessExecutionContract,
  type RobustnessOperationEvidence,
  type RobustnessSurvivorCheck,
} from '../scenarios/robustness/contracts.ts';
import {
  ROBUSTNESS_WORKER_PROTOCOL,
  type RobustnessWorkerRequest,
  type RobustnessWorkerResponse,
} from './robustness-worker-protocol.ts';
import {
  preflightEncryptionKey,
  type AuthoritativeKeyRecord,
} from '../features/encryption/key-provenance.ts';
import {
  hlsResourceIndexFromOptions,
  preflightHlsResourceIndex,
  rebindHlsPlaylistResources,
} from '../features/encryption/hls-resource-index.ts';
import { assessDerivedEncryptionRotation } from '../features/encryption/rotation.ts';
import {
  resolveDecryptDuration,
  validateDecryptThroughputSummary,
} from '../features/encryption/throughput.ts';
import {
  encryptionKeyProvenanceFromOptions,
  encryptionNegativeContractFromOptions,
} from '../features/encryption/contracts.ts';
import {
  assessHlsRequestedMethod,
  validateHlsEncryptionContract,
} from '../features/encryption/hls-contract.ts';
import { assessPatternGroundTruth } from '../features/encryption/structural-evidence.ts';
import { audioSampleFrameNumeratorFromBytes } from '../features/audio-dsp/throughput.ts';
import {
  FirstFrameBoundaryRecorder,
  assessDecodeTrackSelection,
  decodeScenarioProvenanceFromOptions,
  decodeTrackSelectorFromOptions,
  executeSeekSequence,
  imageDecoderContractFromOptions,
  materializeDecodeResultProvenance,
  probeImageDecoder,
  seekSequenceContractFromOptions,
  validateFirstFrameSummary,
  type DecodeResultProvenance,
  type FirstFrameBoundaryEvidence,
  type ImageDecoderSupportApi,
  type SeekSequenceObservation,
} from '../features/decode-seek/index.ts';
import {
  executeRemuxRoundTrip,
  remuxRoundTripContractFromOptions,
  type RemuxLeg,
  type RemuxRoundTripContract,
} from '../features/remux/index.ts';
import {
  assessDemuxScale,
  demuxScaleContractFromOptions,
  executeFlacSeektableInvariant,
  validateTruncatedH264WithWebCodecs,
  type DemuxScaleAssessment,
  type DemuxScaleContract,
  type DemuxScaleObservation,
} from '../features/demux/index.ts';
import {
  executeTrimComposition,
  preflightTrimTuple,
  resolveEffectiveTrimInterval,
  trimContractForScenario,
  type TrimCompositionContract,
  type TrimDecision,
  type TrimSemanticPresentation,
} from '../features/trim/index.ts';
import {
  TRANSCODE_ROUNDTRIP_INVARIANT,
  admitTranscodeRuntimeMetrics,
  executeTranscodeRoundTripRuntime,
  makeTranscodeRateEvidence,
  readTranscodeRuntimeInvariant,
  transcodeMetricAdmissionContract,
  type BoundTranscodeInput,
  type TranscodeDecision,
  type TranscodeRateEvidence,
  type TranscodeRoundTripEvidence,
} from '../features/transcode/index.ts';
import {
  assessSparseMuxTarget,
  assessMuxExecutionBoundary,
  createSparseMuxTarget,
  isDeliberatelyIllegalMuxScenario,
  muxLargeFileContractFromOptions,
  parseMuxTrackSelector,
  type MuxDecision,
} from '../features/mux/index.ts';

// ── Negotiation ──────────────────────────────────────────────────────────────────────────────

export type Negotiation =
  | { ok: true }
  | { ok: false; status: 'NA_ENGINE' | 'NA_BROWSER'; reason: string };

/**
 * Stage 1 is engine-only. Run-wide codec tokens are a coarse scheduling index and are deliberately
 * not allowed to produce NA_BROWSER; exact adapter-declared configurations are probed later.
 */
export function negotiateCoarseEngine(caps: CapabilitySet, requires: Requires): Negotiation {
  for (const op of requires.operations) {
    if (!caps.operations[op]) {
      return { ok: false, status: 'NA_ENGINE', reason: `engine does not declare operation '${op}'` };
    }
  }
  for (const container of requires.containersIn ?? []) {
    if (!caps.containersIn.includes(container)) {
      return { ok: false, status: 'NA_ENGINE', reason: `engine does not declare input container '${container}'` };
    }
  }
  for (const container of requires.containersOut ?? []) {
    if (!caps.containersOut.includes(container)) {
      return { ok: false, status: 'NA_ENGINE', reason: `engine does not declare output container '${container}'` };
    }
  }
  for (const codec of requires.videoCodecs ?? []) {
    if (!caps.videoCodecs.includes(codec)) {
      return { ok: false, status: 'NA_ENGINE', reason: `engine does not declare video codec '${codec}'` };
    }
  }
  for (const codec of requires.videoCodecsIn ?? []) {
    if (!codecSet(caps.videoCodecsIn, caps.videoCodecs).includes(codec)) {
      return { ok: false, status: 'NA_ENGINE', reason: `engine does not declare input video codec '${codec}'` };
    }
  }
  for (const codec of requires.videoCodecsOut ?? []) {
    if (!codecSet(caps.videoCodecsOut, caps.videoCodecs).includes(codec)) {
      return { ok: false, status: 'NA_ENGINE', reason: `engine does not declare output video codec '${codec}'` };
    }
  }
  for (const codec of requires.audioCodecs ?? []) {
    if (!caps.audioCodecs.includes(codec)) {
      return { ok: false, status: 'NA_ENGINE', reason: `engine does not declare audio codec '${codec}'` };
    }
  }
  for (const codec of requires.audioCodecsIn ?? []) {
    if (!codecSet(caps.audioCodecsIn, caps.audioCodecs).includes(codec)) {
      return { ok: false, status: 'NA_ENGINE', reason: `engine does not declare input audio codec '${codec}'` };
    }
  }
  for (const codec of requires.audioCodecsOut ?? []) {
    if (!codecSet(caps.audioCodecsOut, caps.audioCodecs).includes(codec)) {
      return { ok: false, status: 'NA_ENGINE', reason: `engine does not declare output audio codec '${codec}'` };
    }
  }
  for (const encryption of requires.encryption ?? []) {
    if (!caps.encryption.includes(encryption)) {
      return { ok: false, status: 'NA_ENGINE', reason: `engine does not declare encryption scheme '${encryption}'` };
    }
  }
  for (const feature of requires.features ?? []) {
    if (!caps.features.includes(feature)) {
      return { ok: false, status: 'NA_ENGINE', reason: `engine does not declare feature '${feature}'` };
    }
  }
  return { ok: true };
}

/** Suite version surfaced into `RunEnv`; kept in sync with package.json. */
const SUITE_VERSION = '0.1.0';

/** Base URL the served corpus lives under (static files; HTTP Range supported). */
const FIXTURES_MEDIA_BASE = '/fixtures/media';
const FIXTURES_MANIFEST_URL = '/fixtures/manifest.json';
const FIXTURES_GENERATION_INDEX_URL = '/fixtures/generation-index.json';
const FIXTURES_BASE_URL = '/fixtures/';

interface FixtureManifestAsset {
  id?: string;
  sha256?: string | null;
  sizeBytes?: number | null;
}

let fixtureManifestPromise: Promise<Map<string, FixtureManifestAsset> | undefined> | undefined;
let fixtureManifestCache: Map<string, FixtureManifestAsset> | undefined;

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
/** @deprecated Browser applicability is now exact-config based; retained only as implementation history. */
function negotiateLegacy(
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

/** Public coarse-index negotiation. Exact browser support is evaluated by evaluateConcreteSupport. */
export function negotiate(
  caps: CapabilitySet,
  _support: CodecSupport,
  requires: Requires,
  _options?: Scenario['options'],
): Negotiation {
  return negotiateCoarseEngine(caps, requires);
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
  /**
   * The store has already applied its persistent validation epoch, status TTL, and exact
   * engine/browser/selection-key policy. A candidate carrying typed cache provenance may therefore
   * be returned before immutable media bodies are downloaded again. Stores that merely memoize
   * results in memory should omit this flag and retain the full fingerprint-preflight path.
   */
  readonly exactSelectionReuse?: true;
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
  /**
   * Exhaustive-mode file boundary. Called with `completed` before a file starts and again after that
   * file resolves (including cached, blocked, and cancellation-skipped variants). The label names
   * the current scenario/engine/file, so callers can distinguish a cancellable inner layer from an
   * in-flight adapter operation that has declared no finer-grained cancellation boundary.
   */
  onFileProgress?: (completed: number, total: number, label: string) => void;
  /** Reuse cached cells regardless of status and write every completed executable cell back to storage. */
  resultReuse?: ResultReuseStore;
  /** Optional cancellation signal. Aborts between cells so in-flight engine cleanup stays orderly. */
  signal?: AbortSignal;
  /** 'audit' executes reviewed suppressions so CI can verify current applicability/defect behavior. */
  disabledPolicy?: 'enforce' | 'audit';
  /** optional override of the browser-pure oracle hooks; default to the platform engine's helpers */
  decodeWithPlatform?: OracleContext['decodeWithPlatform'];
  playbackSmoke?: OracleContext['playbackSmoke'];
  /** Native-rate container/WebCodecs audio evidence; Web Audio is intentionally not accepted. */
  gaplessNativeEvidence?: OracleContext['gaplessNativeEvidence'];
  /** Test/host override for the still-image-specific ImageDecoder support surface. */
  imageDecoderSupportApi?: ImageDecoderSupportApi;
  /** Test/host override; production creates a fresh module Worker for every isolated file. */
  robustnessWorkerFactory?: () => Worker;
  /** Run-lifetime active-generation resolver; production creates one when omitted. */
  fixtureIntegrityRuntime?: ActiveFixtureRuntime;
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
  /** injected by caller: native-rate container timing + WebCodecs audio evidence */
  gaplessNativeEvidence?: OracleContext['gaplessNativeEvidence'];
  /** injected by caller/test: ImageDecoder.isTypeSupported surface */
  imageDecoderSupportApi?: ImageDecoderSupportApi;
  /** environment captured once per run (attached to every result) */
  env?: RunEnv;
  /**
   * Per-scenario rotation (§6.4): the concrete inputs this cell fetches. `id` drives golden/identity
   * (baked ⇒ flat asset id; real ⇒ scenario-dir path that 404s its golden); `urlAssetPath` is the bytes
   * actually fetched. When present, it REPLACES the scenario.input-derived asset list in runOne/runBench.
   */
  resolvedInputs?: ResolvedInput[];
  /** provenance of the rotated pick, stamped onto the result's `selection` field (purely additive). */
  selection?: {
    file: string;
    sha256?: string;
    isBaked: boolean;
    candidateCount?: number;
    eligiblePoolDigest?: string;
    executedInputDigest?: string;
    candidateIdentity?: string;
    selectionPolicyVersion?: string;
    selectionAlgorithmId?: string;
    score?: string;
    probability?: { numerator: 1; denominator: number; weight: 1 };
    evidenceContractDigest?: string;
    catalogState?: 'ready' | 'fallback';
    catalogReason?: { reasonCode: string; detail: string };
  };
  /** Typed sufficient-evidence contract frozen by media selection for this concrete candidate. */
  selectionEvidencePlan?: CandidateOracleEvidencePlan;
  /** Exact bytes verified once at the run boundary, shared across every engine for this candidate. */
  verifiedContents?: readonly VerifiedContent[];
  /** Non-retained authenticated URL snapshot, valid only for bounded unmutated scale probes. */
  verifiedStreamContents?: readonly VerifiedStreamContent[];
  /** Engine-facing key bytes admitted by the source-record parity preflight. Scenario provenance is
   * retained for fingerprints/oracles but is never forwarded through the adapter key object. */
  decryptKeyOverride?: DecryptKey;
  /** the run's selection seed (RunOptions.randomSeed), recorded in the result's selection for replay. */
  runSeed?: string;
  /** Cache candidate is validated only after current engine/browser/asset/golden preflight. */
  cachedResult?: ScenarioResult;
  /** Run-wide executed behavior evidence; direct runOne callers may omit it and execute locally. */
  pixelBehavior?: PixelBehaviorEvidence;
  /** Injected browser memory instrument for deterministic runner conformance tests/host bridges. */
  probeMemorySampler?: ReturnType<typeof userAgentSpecificMemorySampler>;
  /** Measurement-window controls; production callers normally use the audited defaults. */
  probeMemoryWindowOptions?: Parameters<typeof measurePeakMemoryWindow>[2];
  /** Injectable benchmark memory instrument for deterministic protocol tests/host bridges. */
  benchMemorySampler?: PerformanceEvidence<MemorySampler>;
  /** Benchmark-only memory window controls; matrix runs use the audited bounded defaults. */
  benchMemoryWindowOptions?: MemoryWindowOptions;
  /** Injectable only for deterministic scale-contract tests/host bridges; browsers use PerformanceObserver. */
  demuxScaleLongTaskEnvironment?: LongTaskObserverEnvironment;
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

function createRunFixtureIntegrityRuntime(): ActiveFixtureRuntime {
  const base = globalThis.location?.href ?? 'http://localhost/';
  return new ActiveFixtureRuntime({
    indexUrl: new URL(FIXTURES_GENERATION_INDEX_URL, base).href,
    fixturesBaseUrl: new URL(FIXTURES_BASE_URL, base).href,
  });
}

const GOLDEN_KIND_ORDER: readonly GoldenKind[] = ['meta', 'packets', 'frames', 'ssim'];
const goldenLoadCacheByRuntime = new WeakMap<ActiveFixtureRuntime, Map<string, Promise<GoldenStore>>>();

/**
 * Exact committed evidence requested for one scenario. Metadata is always included because the
 * concrete tuple preflight consumes source track/container observations before adapter execution.
 * Complex property invariants deliberately retain the full set unless their operation has a
 * closed, auditable dependency surface.
 */
export function goldenKindsForScenario(scenario: Scenario): readonly GoldenKind[] {
  const kinds = new Set<GoldenKind>(['meta']);
  for (const oracle of scenario.oracles) {
    switch (oracle) {
      case 'golden-packets':
      case 'reference-reimport':
        kinds.add('packets');
        break;
      case 'decoded-frames-bitexact':
      case 'alpha-plane':
      case 'decrypt-bitexact':
        kinds.add('frames');
        break;
      case 'ssim-psnr':
      case 'fanout-renditions':
        kinds.add('frames');
        kinds.add('ssim');
        break;
      case 'seek-accuracy':
      case 'trim-boundaries':
        kinds.add('packets');
        kinds.add('frames');
        break;
      case 'property-invariant':
        if (scenario.op === 'probe') break;
        if (scenario.op === 'demux') {
          kinds.add('packets');
          break;
        }
        for (const kind of GOLDEN_KIND_ORDER) kinds.add(kind);
        break;
      case 'golden-metadata':
      case 'decoded-audio-pcm':
      case 'playback-smoke':
      case 'mp4-box-layout':
      case 'webm-live-layout':
      case 'graceful-failure':
        break;
    }
  }
  return GOLDEN_KIND_ORDER.filter((kind) => kinds.has(kind));
}

function loadGoldenForRun(
  assetId: string,
  runtime?: ActiveFixtureRuntime,
  requestedKinds?: readonly GoldenKind[],
): Promise<GoldenStore> {
  if (!runtime) {
    return requestedKinds
      ? loadGolden(assetId, { requestedKinds })
      : loadGolden(assetId);
  }

  // ActiveFixtureRuntime already freezes indexed artifacts. This adjacent cache also freezes the
  // legacy fallback used by out-of-generation rotated assets, so six engines do not independently
  // fetch and parse the same large JSON sidecar during one run.
  let cache = goldenLoadCacheByRuntime.get(runtime);
  if (!cache) {
    cache = new Map();
    goldenLoadCacheByRuntime.set(runtime, cache);
  }
  const plan = requestedKinds ? GOLDEN_KIND_ORDER.filter((kind) => requestedKinds.includes(kind)) : GOLDEN_KIND_ORDER;
  const cacheKey = `${assetId}\u0000${plan.join(',')}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const pending = loadGolden(assetId, {
    requestedKinds: plan,
    evidenceProvider: {
      load: (kind, parsePayload) => runtime.loadGoldenEvidence(assetId, kind, parsePayload),
    },
  }).catch((error) => {
    cache?.delete(cacheKey);
    throw error;
  });
  cache.set(cacheKey, pending);
  return pending;
}

type IndexedGoldenGate = { status: 'NA_ASSET' | 'ERROR'; reason: string };

/** Required indexed evidence is admitted before operation/oracle execution; detail text is never read. */
function requiredIndexedGoldenGate(scenario: Scenario, golden: GoldenStore): IndexedGoldenGate | undefined {
  const kinds = new Set<'meta' | 'packets' | 'frames' | 'ssim'>();
  if (scenario.oracles.includes('golden-metadata')) kinds.add('meta');
  if (scenario.oracles.includes('golden-packets')) kinds.add('packets');
  if (scenario.oracles.includes('decoded-frames-bitexact')) kinds.add('frames');
  for (const kind of kinds) {
    const evidence = golden.evidence[kind];
    if (evidence.state === 'OK' || !evidence.typedState) continue;
    const status = evidence.typedState === 'schema-invalid' || evidence.typedState === 'transport-error'
      ? 'ERROR'
      : 'NA_ASSET';
    return {
      status,
      reason: `[${evidence.reasonCode}] required ${kind} evidence is ${evidence.typedState}`,
    };
  }
  return undefined;
}

function activeMediaBlock(result: Exclude<ActiveFixtureMediaResult, { state: 'ready' | 'out-of-scope' }>): {
  status: 'NA_ASSET' | 'ERROR';
  reason: string;
} {
  return {
    status: result.execution,
    reason: `[${result.reasonCode}] ${result.detail}`,
  };
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

async function missingAssetReason(assetId: string, signal?: AbortSignal): Promise<string | undefined> {
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
    res = await fetch(url, { method: 'HEAD', cache: 'no-store', ...(signal ? { signal } : {}) });
  } catch (err) {
    return `asset missing: '${assetId}' (${errMessage(err)})`;
  }
  if (res.ok) return undefined;

  if (res.status === 405 || res.status === 501) {
    try {
      const ranged = await fetch(url, {
        cache: 'no-store',
        headers: { Range: 'bytes=0-0' },
        ...(signal ? { signal } : {}),
      });
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
async function resolvedInputMissingReason(resolved: ResolvedInput, signal?: AbortSignal): Promise<string | undefined> {
  const url = mediaAssetUrl(resolved.urlAssetPath);
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store', ...(signal ? { signal } : {}) });
    if (res.status === 404) {
      // Baked candidates retain a scenario-qualified logical identity while their canonical bytes
      // also live at the flat manifest id. Some older bake plans omitted the redundant scenario
      // mirror; admit the manifest path only when that distinct, declared id is actually present.
      if (resolved.id !== resolved.urlAssetPath) {
        const baked = await fetch(mediaAssetUrl(resolved.id), {
          method: 'HEAD',
          cache: 'no-store',
          ...(signal ? { signal } : {}),
        });
        if (baked.ok) return undefined;
      }
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
  signal?: AbortSignal,
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
      cached = fetch(url, signal ? { signal } : undefined).then(async (res) => {
        if (res.status === 404 && urlAssetPath !== undefined && urlAssetPath !== assetId) {
          res = await fetch(mediaAssetUrl(assetId), signal ? { signal } : undefined);
        }
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
    ...(signal ? { signal } : {}),
    ...(sizeBytes !== undefined && mutate === undefined ? { sizeBytes } : {}),
    mutated: typeof mutate === 'function',
    async arrayBuffer(): Promise<ArrayBuffer> {
      return applyMutate(await fetchBytes());
    },
    async blob(): Promise<Blob> {
      return new Blob([await this.arrayBuffer()], { type: mime });
    },
  } as MediaInput;
}

/** Materialize exact digest-verified bytes into every adapter-visible input surface. */
function buildVerifiedMediaInput(
  resolved: ResolvedInput,
  verified: VerifiedContent,
  mutate?: (bytes: Uint8Array) => Uint8Array,
): { input: MediaInput; objectUrl: string } {
  const original = verified.bytes.slice();
  const mutated = mutate ? mutate(original.slice()) : original;
  return buildDeliveredMediaInput(resolved, mutated.slice(), typeof mutate === 'function');
}

function buildDeliveredMediaInput(
  resolved: ResolvedInput,
  delivered: Uint8Array,
  mutated: boolean,
): { input: MediaInput; objectUrl: string } {
  const mime = mimeForAssetId(resolved.id);
  // `delivered` is already an adapter-private copy made by buildVerifiedMediaInput/rebinding. Keep
  // one tight buffer and return that same sealed body to the single adapter invocation; another
  // artifact-sized slice during the measured operation makes the huge/massive memory contract
  // impossible despite no engine-side retention.
  const deliveredBuffer = delivered.byteOffset === 0 && delivered.byteLength === delivered.buffer.byteLength
    ? delivered.buffer as ArrayBuffer
    : delivered.slice().buffer as ArrayBuffer;
  const blob = new Blob([deliveredBuffer], { type: mime });
  if (typeof URL.createObjectURL !== 'function') {
    throw new Error('[VERIFIED_TRANSPORT_UNAVAILABLE] URL.createObjectURL is unavailable');
  }
  const objectUrl = URL.createObjectURL(blob);
  return {
    input: {
      id: resolved.id,
      url: objectUrl,
      mime,
      ...(!mutated ? { sizeBytes: delivered.byteLength } : {}),
      mutated,
      async arrayBuffer(): Promise<ArrayBuffer> {
        return deliveredBuffer;
      },
      async blob(): Promise<Blob> {
        return blob;
      },
    },
    objectUrl,
  };
}

/**
 * Build the only URL-backed transport admitted by the runner. The adapter-facing whole-file methods
 * are intentionally unavailable: the authenticated block map must be consumed through the URL
 * reader's validating fetch seam, never bypassed by a second unguarded full-body fetch.
 */
function buildAttestedStreamMediaInput(
  resolved: ResolvedInput,
  verified: VerifiedStreamContent,
): MediaInput {
  const unavailable = async (): Promise<never> => {
    throw new Error('[ATTESTED_URL_WHOLE_FILE_FORBIDDEN] bounded URL input must use authenticated range transport');
  };
  return {
    id: resolved.id,
    url: mediaAssetUrl(resolved.urlAssetPath),
    mime: mimeForAssetId(resolved.id),
    sizeBytes: verified.actualSizeBytes,
    mutated: false,
    contentAttestation: {
      schema: 'media-test/url-content-attestation@1',
      logicalPath: verified.identity.logicalPath,
      sha256: verified.actualSha256,
      sizeBytes: verified.actualSizeBytes,
      chunkSizeBytes: verified.chunkSizeBytes,
      chunkSha256: verified.chunkSha256,
    },
    arrayBuffer: unavailable,
    blob: unavailable,
  };
}

function boundedProbeStreamTransportEligible(
  scenario: Scenario,
  resolvedInputs: readonly ResolvedInput[],
): boolean {
  if (resolvedInputs.length !== 1) return false;
  const root = resolvedInputs[0]!;
  const scheme = objectOptionRoot(scenario.options).scheme;
  return scenario.op === 'probe' &&
    probeBudgetFromOptions(scenario.options) !== undefined &&
    typeof scenario.mutate !== 'function' &&
    root.transport === undefined &&
    scheme !== 'hls-aes128' &&
    scheme !== 'hls-sample-aes' &&
    hlsResourceIndexFromOptions(scenario.options) === undefined &&
    !/\.m3u8?(?:$|[?#])/i.test(root.id) &&
    !/\.m3u8?(?:$|[?#])/i.test(root.urlAssetPath);
}

/**
 * Demux/probe HLS rows use the same committed closure evidence as encryption rows, but their
 * scenario contract does not carry encryption key provenance. Infer only the conventional baked
 * resource-index URL for a plain corpus asset id; rotated/real paths still need an explicit
 * contract and can never borrow another asset's sidecars.
 */
function hlsClosureOptions(options: unknown, root: ResolvedInput): unknown | undefined {
  if (hlsResourceIndexFromOptions(options)) return options;
  if (
    root.id !== root.urlAssetPath &&
    /^[A-Za-z0-9._-]+\.m3u8$/i.test(root.id)
  ) {
    const existing = recordOption(options) ?? {};
    const robustness = recordOption(existing.robustness) ?? {};
    const probe = recordOption(robustness.probe) ?? {};
    return {
      ...existing,
      robustness: {
        ...robustness,
        probe: {
          ...probe,
          hlsResourceIndex: `/fixtures/golden/${root.id}.resources.json`,
        },
      },
    };
  }
  return undefined;
}

function supportsAuthenticatedRangeProbeTransport(capabilities: CapabilitySet): boolean {
  return capabilities.features.includes(AUTHENTICATED_RANGE_PROBE_FEATURE);
}

/** HLS URL consumers receive a closed object-URL graph: verified sidecar blobs first, then a
 * verified playlist whose exact local references are rebound to those URLs. Transport resources do
 * not inflate the operation input cardinality. */
function buildVerifiedMediaInputs(
  resolvedInputs: readonly ResolvedInput[],
  verifiedContents: readonly VerifiedContent[],
  mutate?: (bytes: Uint8Array) => Uint8Array,
): { inputs: MediaInput[]; objectUrls: string[] } {
  const entries = resolvedInputs.map((resolved, index) => ({ resolved, verified: verifiedContents[index]! }));
  const operationEntries = entries.filter(({ resolved }) => resolved.transport === undefined);
  const transportEntries = entries.filter(({ resolved }) => resolved.transport?.kind === 'hls-resource');
  if (transportEntries.length === 0) {
    const materialized = operationEntries.map(({ resolved, verified }) =>
      buildVerifiedMediaInput(resolved, verified, mutate));
    return {
      inputs: materialized.map((entry) => entry.input),
      objectUrls: materialized.map((entry) => entry.objectUrl),
    };
  }
  const playlists = operationEntries.filter(({ resolved }) =>
    /(?:^|\.)m3u8(?:$|[?#])/i.test(resolved.id) || mimeForAssetId(resolved.id).includes('mpegurl'));
  if (playlists.length !== 1 || operationEntries.length !== 1) {
    throw new Error('[HLS_VERIFIED_TRANSPORT_INVALID] HLS closure requires exactly one playlist operation input');
  }
  const objectUrls: string[] = [];
  try {
    const bindings = transportEntries.map(({ resolved, verified }) => {
      const transport = resolved.transport;
      if (!transport || transport.kind !== 'hls-resource') {
        throw new Error('[HLS_VERIFIED_TRANSPORT_INVALID] non-HLS resource entered playlist binding');
      }
      const blob = new Blob([verified.bytes.slice().buffer], { type: mimeForAssetId(transport.sourceUri) });
      if (typeof URL.createObjectURL !== 'function') {
        throw new Error('[VERIFIED_TRANSPORT_UNAVAILABLE] URL.createObjectURL is unavailable');
      }
      const url = URL.createObjectURL(blob);
      objectUrls.push(url);
      return { role: transport.role, uri: transport.sourceUri, url };
    });
    const playlist = playlists[0]!;
    const original = playlist.verified.bytes.slice();
    const mutatedBytes = mutate ? mutate(original.slice()) : original;
    const rebound = rebindHlsPlaylistResources(mutatedBytes.slice(), bindings);
    const root = buildDeliveredMediaInput(playlist.resolved, rebound, typeof mutate === 'function');
    objectUrls.push(root.objectUrl);
    return { inputs: [root.input], objectUrls };
  } catch (error) {
    for (const objectUrl of objectUrls) URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function resolvedContentIdentities(
  resolvedInputs: readonly ResolvedInput[],
): { identities?: ContentIdentity[]; reason?: string } {
  const identities: ContentIdentity[] = [];
  for (const resolved of resolvedInputs) {
    if (typeof resolved.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(resolved.sha256)) {
      return {
        reason: `[CORPUS_IDENTITY_MISSING] '${resolved.urlAssetPath}' has no full SHA-256`,
      };
    }
    if (!Number.isSafeInteger(resolved.sizeBytes) || Number(resolved.sizeBytes) < 0) {
      return {
        reason: `[CORPUS_IDENTITY_MISSING] '${resolved.urlAssetPath}' has no valid byte size`,
      };
    }
    identities.push({
      logicalPath: resolved.urlAssetPath,
      sha256: resolved.sha256.toLowerCase(),
      sizeBytes: Number(resolved.sizeBytes),
    });
  }
  return { identities };
}

function verifiedContentsMismatch(
  identities: readonly ContentIdentity[],
  contents: readonly VerifiedContent[],
): string | undefined {
  if (contents.length !== identities.length) {
    return `expected ${identities.length} verified inputs, received ${contents.length}`;
  }
  for (let index = 0; index < identities.length; index++) {
    const expected = identities[index]!;
    const actual = contents[index]!;
    if (
      actual.state !== 'VERIFIED' ||
      actual.identity.logicalPath !== expected.logicalPath ||
      actual.identity.sha256 !== expected.sha256 ||
      actual.identity.sizeBytes !== expected.sizeBytes ||
      actual.actualSha256 !== expected.sha256 ||
      actual.actualSizeBytes !== expected.sizeBytes ||
      actual.bytes.byteLength !== expected.sizeBytes
    ) {
      return `verified input ${index} does not match '${expected.logicalPath}' (${expected.sha256}/${expected.sizeBytes})`;
    }
  }
  return undefined;
}

function verifiedStreamContentsMismatch(
  identities: readonly ContentIdentity[],
  contents: readonly VerifiedStreamContent[],
): string | undefined {
  if (contents.length !== identities.length) {
    return `expected ${identities.length} verified stream inputs, received ${contents.length}`;
  }
  for (let index = 0; index < identities.length; index++) {
    const expected = identities[index]!;
    const actual = contents[index]!;
    const expectedChunks = Math.ceil(expected.sizeBytes / actual.chunkSizeBytes);
    if (
      actual.state !== 'VERIFIED_STREAM' ||
      actual.identity.logicalPath !== expected.logicalPath ||
      actual.identity.sha256 !== expected.sha256 ||
      actual.identity.sizeBytes !== expected.sizeBytes ||
      actual.actualSha256 !== expected.sha256 ||
      actual.actualSizeBytes !== expected.sizeBytes ||
      actual.retainedBytes !== 0 ||
      !Number.isSafeInteger(actual.chunkSizeBytes) ||
      actual.chunkSizeBytes <= 0 ||
      actual.chunkSha256.length !== expectedChunks ||
      actual.chunkSha256.some((digest) => !/^[a-f0-9]{64}$/.test(digest))
    ) {
      return `verified stream input ${index} does not match '${expected.logicalPath}' (${expected.sha256}/${expected.sizeBytes})`;
    }
  }
  return undefined;
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

// ── Cancellation + timeout guard ────────────────────────────────────────────────────────────────

class TimeoutError extends Error {
  constructor(ms: number) {
    super(`operation exceeded timeout of ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

class RunCancelledError extends Error {
  readonly reason: unknown;

  constructor(reason: unknown) {
    super(`run cancelled${reason === undefined ? '' : `: ${errMessage(reason)}`}`);
    this.name = 'RunCancelledError';
    this.reason = reason;
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
const DEFAULT_CLEANUP_TIMEOUT_MS = 5_000;

// `measureUserAgentSpecificMemory()` is a high-latency cross-process observation in Chromium.
// Digest-attested scale probes are deliberately bounded, short metadata reads, so one observation
// request started during the operation plus the end point is a credible bounded peak window. Long
// demux/transcode/decode workloads keep measurePeakMemoryWindow's recurring/default-settle policy.
const AUTHENTICATED_SCALE_PROBE_MEMORY_WINDOW: Readonly<MemoryWindowOptions> = Object.freeze({
  sampleIntervalMs: 100,
  settleWindowMs: 0,
  sampleImmediatelyDuringOperation: true,
  maxOperationSamples: 1,
  sampleTimeoutMs: DEFAULT_MEMORY_SAMPLE_TIMEOUT_MS,
});

function cancellableMemoryWindowOptions(
  options: MemoryWindowOptions | undefined,
  cancellation: CancellationScope,
): MemoryWindowOptions {
  return {
    ...(options ?? {}),
    sampleTimeoutMs: options?.sampleTimeoutMs ?? DEFAULT_MEMORY_SAMPLE_TIMEOUT_MS,
    // The scope's memory signal normalizes caller cancellation and hard deadlines into the same
    // typed errors produced by cancellation.run(). Measurement abort must never be relabelled as
    // MEMORY_PROTOCOL_ERROR merely because it happened during baseline/end instrumentation.
    signal: cancellation.memorySignal,
  };
}

interface CancellationScope {
  /** The one composed signal passed to every lifecycle, operation, oracle, fetch, and bench call. */
  signal: AbortSignal;
  /** Same cancellation boundary, with its reason normalized for measurement-only waits. */
  memorySignal: AbortSignal;
  run<T>(task: (signal: AbortSignal) => Promise<T>, timeoutMs?: number): Promise<T>;
  abort(reason?: unknown): void;
  close(): void;
}

/**
 * Compose caller cancellation with a hard cell deadline. Per-stage watchdogs abort the same local
 * controller before rejecting, so cooperative work sees cancellation before the runner advances.
 */
function createCancellationScope(
  callerSignal: AbortSignal | undefined,
  hardDeadlineMs: number,
): CancellationScope {
  const controller = new AbortController();
  const deadline = AbortSignal.timeout(Math.max(1, hardDeadlineMs));
  const sources = callerSignal ? [callerSignal, deadline, controller.signal] : [deadline, controller.signal];
  const signal = AbortSignal.any(sources);
  const memoryController = new AbortController();
  const forwardMemoryAbort = (): void => {
    if (!memoryController.signal.aborted) {
      memoryController.abort(cancellationError(signal.reason, hardDeadlineMs, deadline.aborted));
    }
  };
  signal.addEventListener('abort', forwardMemoryAbort, { once: true });
  if (signal.aborted) forwardMemoryAbort();

  const abort = (reason?: unknown): void => {
    if (!controller.signal.aborted) controller.abort(reason);
  };

  return {
    signal,
    memorySignal: memoryController.signal,
    abort,
    close() {
      signal.removeEventListener('abort', forwardMemoryAbort);
      // Timers/listeners are otherwise owned by each run() call. AbortSignal.timeout is self-cleaning.
    },
    async run<T>(task: (sharedSignal: AbortSignal) => Promise<T>, timeoutMs?: number): Promise<T> {
      const ms = timeoutMs && timeoutMs > 0 ? timeoutMs : DEFAULT_OP_TIMEOUT_MS;
      if (signal.aborted) throw cancellationError(signal.reason, ms, deadline.aborted);

      let timer: ReturnType<typeof setTimeout> | undefined;
      let removeAbort = (): void => undefined;
      const watchdog = new Promise<never>((_, reject) => {
        const onAbort = (): void => reject(cancellationError(signal.reason, ms, deadline.aborted));
        signal.addEventListener('abort', onAbort, { once: true });
        removeAbort = () => signal.removeEventListener('abort', onAbort);
        timer = setTimeout(() => {
          const timeout = new TimeoutError(ms);
          abort(timeout);
          reject(timeout);
        }, ms);
      });
      const operation = Promise.resolve().then(() => task(signal));
      try {
        return await Promise.race([operation, watchdog]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        removeAbort();
        // Observe a late cooperative rejection after the watchdog wins. It must never become an
        // unhandled rejection or mutate the already-finalized result.
        void operation.catch(() => undefined);
      }
    },
  };
}

function cancellationError(reason: unknown, timeoutMs: number, deadlineAborted: boolean): Error {
  if (reason instanceof TimeoutError) return reason;
  if (deadlineAborted) return new TimeoutError(timeoutMs);
  return new RunCancelledError(reason);
}

async function withCleanupDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), timeoutMs);
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    void promise.catch(() => undefined);
  }
}

async function callWithLifecycleContext<T>(
  engineId: string,
  signal: AbortSignal,
  phase: OperationPhase,
  call: (context: LifecycleContext) => Promise<T>,
): Promise<T> {
  const telemetry = new OperationTelemetryCollector(engineId, signal);
  const context: LifecycleContext = { signal, emit: telemetry.emit, phase };
  try {
    const value = await call(context);
    telemetry.close();
    return value;
  } catch (error) {
    try {
      telemetry.close();
    } catch {
      // Preserve the lifecycle/applicability error that caused the unsuccessful call.
    }
    throw error;
  }
}

async function disposeConstructedEngine(
  engine: MediaEngine,
  callerSignal?: AbortSignal,
): Promise<void> {
  if (!engine.dispose) return;
  const scope = createCancellationScope(callerSignal, DEFAULT_CLEANUP_TIMEOUT_MS);
  try {
    await withCleanupDeadline(
      callWithLifecycleContext(
        engine.id,
        scope.signal,
        'cleanup',
        (context) => engine.dispose!(context),
      ),
      DEFAULT_CLEANUP_TIMEOUT_MS,
    );
  } catch {
    // An early-result cleanup failure cannot replace the already-established policy/applicability row.
  } finally {
    scope.close();
  }
}

/**
 * Runner primitive for serializable Worker entry points. A timeout or Stop terminates the Worker
 * immediately, the only hard preemption the web platform offers for synchronous scripts.
 */
export async function runTerminableWorker<Request, Result>(
  createWorker: () => Worker,
  request: Request,
  options: { timeoutMs: number; signal?: AbortSignal },
): Promise<Result> {
  const worker = createWorker();
  const scope = createCancellationScope(options.signal, options.timeoutMs);
  let settled = false;
  try {
    return await scope.run(
      () =>
        new Promise<Result>((resolve, reject) => {
          worker.onmessage = (event: MessageEvent<Result>) => {
            if (settled) return;
            settled = true;
            resolve(event.data);
          };
          worker.onerror = (event: ErrorEvent) => {
            if (settled) return;
            settled = true;
            reject(event.error ?? new Error(event.message));
          };
          worker.postMessage(request);
        }),
      options.timeoutMs,
    );
  } finally {
    settled = true;
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
    scope.close();
  }
}

function scenarioRequiresRobustnessIsolation(scenario: Scenario): boolean {
  return (
    scenario.family === 'robustness' ||
    typeof scenario.mutate === 'function' ||
    scenario.oracles.includes('graceful-failure')
  );
}

function fullSelectionCacheTag(selection: ScenarioSelection): string {
  return `selection-sha256:${canonicalJsonSha256({
    schema: 'media-test/selection-cache-contract@1',
    executedInput: selectionCacheTag(selection),
    eligiblePoolDigest: selection.eligiblePoolDigest ?? null,
    candidateIdentity: selection.candidateIdentity ?? null,
    evidenceContractDigest: selection.evidencePlan?.contractDigest ?? null,
    selectionPolicyVersion: selection.selectionPolicyVersion ?? null,
    selectionAlgorithmId: selection.selectionAlgorithmId ?? null,
  })}`;
}

function restoreLogicalScenarioId(result: ScenarioResult, scenarioId: string): ScenarioResult {
  return {
    ...result,
    scenarioId,
    ...(result.instance ? { instance: { ...result.instance, scenarioId } } : {}),
  };
}

/**
 * A persistent result-cache hit is already bound to the exact selected-input key and has passed the
 * cache's validation epoch/TTL policy. For immutable, digest-declared selections, re-downloading the
 * complete body before accepting that hit defeats the cache (the long-form audio exhaustive set is
 * roughly 800 MB). Keep the strict runOne fingerprint path for untrusted/in-memory stores and for
 * selection types whose complete resource closure is discovered from the body itself.
 */
function exactPersistedSelectionResult(
  cached: ScenarioResult | undefined,
  engineId: string,
  browser: BrowserName,
  scenario: Scenario,
  selection: ScenarioSelection,
  exhaustiveSelections: readonly ScenarioSelection[] | undefined,
  runEnvBase: RunEnv,
  runSeed: string | undefined,
  pillar: RunOptions['pillar'],
  benchOptions: BenchOptions | undefined,
  cacheLookupDurationMs: number,
): ScenarioResult | undefined {
  if (!cached?.cacheReuse || cached.cacheReuse.schema !== 'media-test/cache-reuse@1') return undefined;
  if (
    cached.engineId !== engineId ||
    cached.browser !== browser ||
    cached.family !== scenario.family ||
    !isTypedScenarioResult(cached)
  ) return undefined;

  const selections = exhaustiveSelections && exhaustiveSelections.length > 0
    ? exhaustiveSelections
    : [selection];
  if (!selections.every(selectionAllowsExactPersistedReuse)) return undefined;
  if (!cacheEnvironmentMatches(cached.env, { ...runEnvBase, engineId })) return undefined;
  if (!cacheMeasurementProtocolMatches(cached, scenario, pillar, benchOptions)) return undefined;

  let exhaustive: ScenarioResult['exhaustive'];
  let currentSelection: ScenarioResult['selection'];
  if (exhaustiveSelections && exhaustiveSelections.length > 0) {
    if (!cached.exhaustive || !cachedExhaustiveSetMatches(cached.exhaustive, exhaustiveSelections)) {
      return undefined;
    }
    exhaustive = cached.exhaustive.map((entry) => ({
      ...entry,
      reason: cachedResultReason(entry.reason, entry.status),
      ...(entry.selection
        ? { selection: replaceSelectionRunSeed(entry.selection, runSeed) }
        : {}),
      ...(entry.cacheReuse
        ? { cacheReuse: exactSelectionCacheReuse(entry.cacheReuse) }
        : {}),
    }));
    currentSelection = cached.selection
      ? replaceSelectionRunSeed(cached.selection, runSeed)
      : undefined;
  } else {
    if (cached.exhaustive || !cachedSelectionMatches(selection, cached.selection)) return undefined;
    currentSelection = {
      ...resultSelectionFor(selection),
      ...(runSeed !== undefined ? { runSeed } : {}),
    };
  }

  const result: ScenarioResult = {
    ...restoreLogicalScenarioId(cached, scenario.id),
    engineId,
    browser,
    scenarioId: scenario.id,
    family: scenario.family,
    reason: cachedResultReason(cached.reason, cached.status),
    cacheReuse: exactSelectionCacheReuse(cached.cacheReuse),
    ...(exhaustive ? { exhaustive } : {}),
    ...(currentSelection ? { selection: currentSelection } : {}),
    env: { ...runEnvBase, engineId },
    startedAtIso: new Date().toISOString(),
    durationMs: Math.max(0, cacheLookupDurationMs),
  };
  if (pillar === 'functional') {
    delete result.bench;
    result.measurement = { state: 'NOT_REQUESTED' };
    if (result.exhaustive) {
      result.exhaustive = result.exhaustive.map((entry) => {
        const functional = { ...entry, measurement: { state: 'NOT_REQUESTED' } as const };
        delete functional.bench;
        return functional;
      });
    }
  }
  return result;
}

function selectionAllowsExactPersistedReuse(selection: ScenarioSelection): boolean {
  const scenario = selection.effectiveScenario;
  const options = recordOption(scenario.options);
  const scheme = options?.scheme;
  return (
    scenario.family !== 'robustness' &&
    typeof scenario.mutate !== 'function' &&
    scenario.op !== 'decrypt' &&
    scheme !== 'hls-aes128' &&
    scheme !== 'hls-sample-aes' &&
    hlsResourceIndexFromOptions(scenario.options) === undefined &&
    selection.resolvedInputs.length > 0 &&
    selection.resolvedInputs.every((input) =>
      input.transport === undefined &&
      typeof input.sha256 === 'string' &&
      /^[0-9a-f]{64}$/.test(input.sha256) &&
      Number.isSafeInteger(input.sizeBytes) &&
      Number(input.sizeBytes) >= 0)
  );
}

function cacheEnvironmentMatches(cached: RunEnv | undefined, current: RunEnv): boolean {
  if (!cached) return false;
  const identity = (env: RunEnv): unknown => ({
    suiteVersion: env.suiteVersion,
    engineId: env.engineId,
    browser: env.browser,
    browserVersion: env.browserVersion ?? null,
    userAgent: env.userAgent ?? null,
    corpusChecksum: env.corpusChecksum ?? null,
    pixelBehavior: env.pixelBehavior ?? null,
  });
  return stableCanonicalString(identity(cached)) === stableCanonicalString(identity(current));
}

function cacheMeasurementProtocolMatches(
  cached: ScenarioResult,
  scenario: Scenario,
  pillar: RunOptions['pillar'],
  benchOptions: BenchOptions | undefined,
): boolean {
  const wantsPerformance = (pillar ?? 'all') === 'all' || pillar === 'performance';
  if (!wantsPerformance || scenario.metrics.length === 0) return true;
  const observations = cached.exhaustive ?? [cached];
  for (const observation of observations) {
    if (observation.status !== 'PASS') continue;
    if (observation.measurement?.state !== 'AVAILABLE' || !observation.bench) return false;
    for (const metric of scenario.metrics) {
      const summary = observation.bench[metric];
      if (!summary || !adaptiveTimingProtocolMatches(summary, benchOptions)) return false;
    }
    if (
      scenario.op === 'probe' &&
      probeBudgetFromOptions(scenario.options) !== undefined &&
      scenario.metrics.includes('peakMemory')
    ) {
      const primary = observation.bench[scenario.primaryMetric ?? scenario.metrics[0]!];
      if (!primary || !authenticatedScaleProbeMemoryProtocolMatches(primary)) return false;
    }
  }
  return true;
}

function authenticatedScaleProbeMemoryProtocolMatches(summary: BenchSummary): boolean {
  const evidence = recordOption(summary.protocolEvidence);
  const memory = evidence?.memory;
  if (!Array.isArray(memory) || memory.length !== summary.n) return false;
  return memory.every((value) => {
    const observation = recordOption(value);
    if (
      observation?.schema !== 'media-test/memory-window@1' ||
      observation?.immediateOperationSample !== true ||
      observation.operationSampleLimit !== 1 ||
      observation.settleWindowMs !== 0 ||
      observation.sampleTimeoutMs !== DEFAULT_MEMORY_SAMPLE_TIMEOUT_MS
    ) return false;
    const samples = observation.samples;
    if (!Array.isArray(samples) || samples.length !== 3) return false;
    return samples.map((sample) => recordOption(sample)?.phase).join(',') === 'baseline,operation,end';
  });
}

function adaptiveTimingProtocolMatches(summary: BenchSummary, options: BenchOptions | undefined): boolean {
  const evidence = recordOption(summary.protocolEvidence);
  const timing = recordOption(evidence?.timingProtocol);
  if (timing?.schema !== 'media-test/adaptive-timing@1') return false;
  const warmup = options?.warmup ?? DEFAULT_BENCH.warmup;
  const requested = options?.iters ?? DEFAULT_BENCH.iters;
  const minDurationMs = options?.minDurationMs ?? DEFAULT_BENCH.minDurationMs;
  const minRepetitions = options?.minRepetitions ?? DEFAULT_BENCH.minRepetitions;
  const slowRepetitions = options?.slowRepetitions ?? DEFAULT_BENCH.slowRepetitions;
  const slowOperation = timing.slowOperation === true;
  const measuredCount = Math.max(requested, slowOperation ? slowRepetitions : minRepetitions);
  return (
    timing.warmupCount === warmup &&
    timing.minDurationMs === minDurationMs &&
    timing.measuredCount === measuredCount &&
    summary.warmup === warmup &&
    summary.n === measuredCount
  );
}

function cachedExhaustiveSetMatches(
  cached: readonly ExhaustiveFileResult[],
  selections: readonly ScenarioSelection[],
): boolean {
  if (cached.length !== selections.length) return false;
  const remaining = [...cached];
  for (const selection of selections) {
    const index = remaining.findIndex((entry) =>
      entry.file === selection.selectedFile &&
      entry.isBaked === selection.isBaked &&
      (selection.selectedSha256 === undefined || entry.sha256 === selection.selectedSha256) &&
      cachedSelectionMatches(selection, entry.selection, selections.length));
    if (index < 0) return false;
    remaining.splice(index, 1);
  }
  return remaining.length === 0;
}

function cachedSelectionMatches(
  selection: ScenarioSelection,
  cached: ScenarioResult['selection'] | undefined,
  candidateCount = selection.candidateCount,
): boolean {
  if (!cached) return false;
  const expected = resultSelectionFor(selection, candidateCount);
  // `prepareSelection()` may expand or rebind resolved paths and therefore records a derived
  // executedInputDigest in the per-file result. The persistent physical key was formed from the
  // pre-preparation selection contract and already binds that digest. Match the durable candidate,
  // pool, evidence, and policy identities here instead of incorrectly comparing the two phases.
  return stableCanonicalString({
    file: cached.file,
    sha256: cached.sha256 ?? null,
    isBaked: cached.isBaked,
    candidateCount: cached.candidateCount ?? null,
    eligiblePoolDigest: cached.eligiblePoolDigest ?? null,
    candidateIdentity: cached.candidateIdentity ?? null,
    selectionPolicyVersion: cached.selectionPolicyVersion ?? null,
    selectionAlgorithmId: cached.selectionAlgorithmId ?? null,
    evidenceContractDigest: cached.evidenceContractDigest ?? null,
    catalogState: cached.catalogState ?? null,
    catalogReason: cached.catalogReason ?? null,
  }) === stableCanonicalString({
    file: expected.file,
    sha256: expected.sha256 ?? null,
    isBaked: expected.isBaked,
    candidateCount: expected.candidateCount ?? null,
    eligiblePoolDigest: expected.eligiblePoolDigest ?? null,
    candidateIdentity: expected.candidateIdentity ?? null,
    selectionPolicyVersion: expected.selectionPolicyVersion ?? null,
    selectionAlgorithmId: expected.selectionAlgorithmId ?? null,
    evidenceContractDigest: expected.evidenceContractDigest ?? null,
    catalogState: expected.catalogState ?? null,
    catalogReason: expected.catalogReason ?? null,
  });
}

function replaceSelectionRunSeed(
  selection: NonNullable<ScenarioResult['selection']>,
  runSeed: string | undefined,
): NonNullable<ScenarioResult['selection']> {
  const { runSeed: _priorRunSeed, ...withoutPriorSeed } = selection;
  return {
    ...withoutPriorSeed,
    ...(runSeed !== undefined ? { runSeed } : {}),
  };
}

function exactSelectionCacheReuse(
  reuse: NonNullable<ScenarioResult['cacheReuse']>,
): NonNullable<ScenarioResult['cacheReuse']> {
  return {
    ...reuse,
    validBecause:
      `${reuse.validBecause}; exact immutable selection key and current run environment matched`,
  };
}

function cachedResultReason(reason: string | undefined, status: ScenarioResult['status']): string {
  const clean = reason?.replace(/^(cached:\s*)+/i, '');
  return clean ? `cached: ${clean}` : `cached previous ${status} result`;
}

type PreparedSelection =
  | {
      state: 'VERIFIED';
      verified: readonly VerifiedContent[];
      verifiedStreamContents?: readonly VerifiedStreamContent[];
      resolvedInputs: readonly ResolvedInput[];
      selection: ScenarioSelection;
      decryptKeyOverride?: DecryptKey;
    }
  | { state: 'NA_ASSET'; reason: string }
  | { state: 'ERROR'; reason: string }
  | { state: 'SKIPPED'; reason: string };

interface PrepareSelectionOptions {
  /** Only adapters declaring and enforcing digest-bound range delivery may receive URL attestations. */
  authenticatedStreamTransport?: boolean;
}

type PrepareSelection = (
  selection: ScenarioSelection,
  options?: PrepareSelectionOptions,
) => Promise<PreparedSelection>;

type DerivedDecryptSelectionPreflight =
  | {
      state: 'READY';
      key: DecryptKey;
      cleartextBase: { logicalPath: string; sha256: string; sizeBytes: number };
    }
  | { state: 'BLOCKED'; status: 'NA_ASSET' | 'ERROR'; reason: string };

/** A DERIVED selection is authoritative only as one full source/base/key tuple from the validated
 * catalog. This branch never admits an inline key merely because it has the right width. */
function preflightDerivedDecryptSelection(
  selection: ScenarioSelection,
): DerivedDecryptSelectionPreflight | undefined {
  const scenario = selection.effectiveScenario;
  if (scenario.op !== 'decrypt') return undefined;
  const options = objectOptionRoot(scenario.options);
  if (options.invariant !== DECRYPT_METAMORPHIC_INVARIANT) return undefined;
  const key = isRecord(options.key) ? options.key : undefined;
  const root = selection.resolvedInputs[0];
  const sourceSha256 = options.candidateSourceSha256;
  const cleartextBaseAsset = options.cleartextBaseAsset;
  const cleartextBaseSha256 = options.cleartextBaseSha256;
  const cleartextBaseSizeBytes = options.cleartextBaseSizeBytes;
  const scheme = options.scheme;
  if (
    selection.resolvedInputs.length !== 1 ||
    !root ||
    typeof root.sha256 !== 'string' ||
    typeof sourceSha256 !== 'string' ||
    sourceSha256 !== root.sha256 ||
    typeof cleartextBaseAsset !== 'string' ||
    typeof cleartextBaseSha256 !== 'string' ||
    !Number.isSafeInteger(cleartextBaseSizeBytes) ||
    Number(cleartextBaseSizeBytes) < 0 ||
    !key ||
    typeof key.keyHex !== 'string' ||
    typeof key.kid !== 'string' ||
    (key.ivHex !== undefined && typeof key.ivHex !== 'string') ||
    (scheme !== 'cenc-ctr' && scheme !== 'cenc-cens' && scheme !== 'cenc-cbcs')
  ) {
    return {
      state: 'BLOCKED',
      status: 'NA_ASSET',
      reason: '[DERIVED_CLEARTEXT_BASE_IDENTITY_MISSING] selected source/base/key tuple is incomplete',
    };
  }
  const decision = assessDerivedEncryptionRotation(scenario, {
    sourceId: root.id,
    sourceSha256,
    scheme,
    key: {
      keyHex: key.keyHex,
      kid: key.kid,
      ...(typeof key.ivHex === 'string' ? { ivHex: key.ivHex } : {}),
    },
    cleartextBaseAsset,
    cleartextBaseSha256,
  });
  if (decision.state === 'INELIGIBLE') {
    return { state: 'BLOCKED', status: 'ERROR', reason: `[${decision.reasonCode}] ${decision.detail}` };
  }
  return {
    state: 'READY',
    key: {
      keyHex: key.keyHex,
      kid: key.kid,
      ...(typeof key.ivHex === 'string' ? { ivHex: key.ivHex } : {}),
    },
    cleartextBase: {
      logicalPath: cleartextBaseAsset,
      sha256: cleartextBaseSha256,
      sizeBytes: Number(cleartextBaseSizeBytes),
    },
  };
}

type EncryptionFixtureEvidencePreflight =
  | { state: 'READY' }
  | { state: 'BLOCKED'; reason: string };

/** Validate pattern/HLS ground truth on the exact digest-verified root before an adapter can run.
 * These are corpus-contract checks: drift is a harness ERROR, never an engine correctness FAIL. */
function preflightEncryptionFixtureEvidence(
  scenario: Scenario,
  rootBytes: Uint8Array,
): EncryptionFixtureEvidencePreflight {
  if (scenario.op !== 'decrypt') return { state: 'READY' };
  const provenance = encryptionKeyProvenanceFromOptions(scenario.options);
  if (!provenance) return { state: 'READY' };

  if (provenance.pattern) {
    const pattern = assessPatternGroundTruth(rootBytes, provenance.pattern);
    if (pattern.verdict !== 'PASS') {
      return {
        state: 'BLOCKED',
        reason: `[${pattern.reasonCode}] encrypted fixture does not satisfy its pattern contract: ${pattern.detail}`,
      };
    }
  }

  if (provenance.hls) {
    let playlist: string;
    try {
      playlist = new TextDecoder('utf-8', { fatal: true }).decode(rootBytes);
    } catch (error) {
      return {
        state: 'BLOCKED',
        reason: `[HLS_PLAYLIST_UTF8_INVALID] digest-verified playlist is not valid UTF-8: ${errMessage(error)}`,
      };
    }
    const contract = validateHlsEncryptionContract(playlist, provenance.hls);
    if (contract.state === 'ERROR' || contract.verdict !== 'PASS') {
      return {
        state: 'BLOCKED',
        reason: `[${contract.reasonCode}] HLS fixture does not satisfy its method/IV timeline contract: ${contract.detail}`,
      };
    }
    if (provenance.scheme !== 'hls-aes128' && provenance.scheme !== 'hls-sample-aes') {
      return {
        state: 'BLOCKED',
        reason: `[HLS_REQUESTED_SCHEME_INVALID] HLS provenance carries non-HLS scheme '${provenance.scheme}'`,
      };
    }
    const method = assessHlsRequestedMethod(playlist, provenance.scheme);
    if (method.state === 'ERROR') {
      return { state: 'BLOCKED', reason: `[${method.reasonCode}] ${method.detail}` };
    }
    const mismatchExpected = provenance.use === 'method-mismatch';
    const observedExpectedMismatch = method.verdict === 'FAIL' && method.reasonCode === 'HLS_METHOD_MISMATCH';
    if (mismatchExpected ? !observedExpectedMismatch : method.verdict !== 'PASS') {
      return {
        state: 'BLOCKED',
        reason: mismatchExpected
          ? `[HLS_METHOD_MISMATCH_FIXTURE_DRIFT] negative fixture no longer presents the contracted method mismatch: ${method.detail}`
          : `[${method.reasonCode}] positive HLS fixture method does not match the requested primitive: ${method.detail}`,
      };
    }
  }
  return { state: 'READY' };
}

function selectionPreparationKey(selection: ScenarioSelection): string {
  return fullSelectionCacheTag(selection);
}

function blockedSelectionResult(
  engineId: string,
  browser: BrowserName,
  scenario: Scenario,
  selection: ScenarioSelection,
  prepared: Exclude<PreparedSelection, { state: 'VERIFIED' }>,
  env: RunEnv,
  runSeed?: string,
): ScenarioResult {
  return selectedStatusResult(
    engineId,
    browser,
    scenario,
    selection,
    prepared.state,
    prepared.reason,
    env,
    runSeed,
  );
}

function selectedStatusResult(
  engineId: string,
  browser: BrowserName,
  scenario: Scenario,
  selection: ScenarioSelection,
  status: ScenarioResult['status'],
  reason: string,
  env: RunEnv,
  runSeed?: string,
): ScenarioResult {
  const oracleOutcomes: OracleOutcome[] = [];
  const result: ScenarioResult = {
    engineId,
    browser,
    scenarioId: scenario.id,
    family: scenario.family,
    status,
    oracleOutcomes,
    reason,
    selection: {
      ...resultSelectionFor(selection),
      ...(runSeed !== undefined ? { runSeed } : {}),
    },
    env: { ...env, engineId },
    measurement: { state: 'NOT_REQUESTED' },
  };
  if (status === 'NA_ASSET' && selection.evidencePlan) {
    result.candidateEvidence = candidateEvidenceResult(
      selection.evidencePlan,
      evaluateCandidateEvidence(selection.evidencePlan, oracleOutcomes),
    );
  }
  return result;
}

function matrixSelectionStatusResult(
  engineId: string,
  browser: BrowserName,
  scenario: Scenario,
  status: ScenarioResult['status'],
  reason: string,
  selection: ScenarioSelection,
  exhaustiveSelections: readonly ScenarioSelection[] | undefined,
  env: RunEnv,
  runSeed?: string,
): ScenarioResult {
  if (exhaustiveSelections && exhaustiveSelections.length > 0) {
    return aggregateExhaustive(
      engineId,
      browser,
      scenario,
      exhaustiveSelections.map((candidate) => ({
        sel: candidate,
        result: selectedStatusResult(
          engineId,
          browser,
          candidate.effectiveScenario,
          candidate,
          status,
          reason,
          env,
          runSeed,
        ),
      })),
      env,
      runSeed,
    );
  }
  return selectedStatusResult(engineId, browser, scenario, selection, status, reason, env, runSeed);
}

function resultSelectionFor(
  selection: ScenarioSelection,
  candidateCount = selection.candidateCount,
): NonNullable<RunOneOptions['selection']> {
  return {
    file: selection.selectedFile,
    isBaked: selection.isBaked,
    ...(selection.selectedSha256 ? { sha256: selection.selectedSha256 } : {}),
    ...(candidateCount !== undefined ? { candidateCount } : {}),
    ...(selection.eligiblePoolDigest ? { eligiblePoolDigest: selection.eligiblePoolDigest } : {}),
    ...(selection.executedInputDigest ? { executedInputDigest: selection.executedInputDigest } : {}),
    ...(selection.candidateIdentity ? { candidateIdentity: selection.candidateIdentity } : {}),
    ...(selection.selectionPolicyVersion
      ? { selectionPolicyVersion: selection.selectionPolicyVersion }
      : {}),
    ...(selection.selectionAlgorithmId
      ? { selectionAlgorithmId: selection.selectionAlgorithmId }
      : {}),
    ...(selection.score ? { score: selection.score } : {}),
    ...(selection.probability ? { probability: selection.probability } : {}),
    ...(selection.evidencePlan?.contractDigest
      ? { evidenceContractDigest: selection.evidencePlan.contractDigest }
      : {}),
    ...(selection.catalogState ? { catalogState: selection.catalogState } : {}),
    ...(selection.catalogReason ? { catalogReason: selection.catalogReason } : {}),
  };
}

function candidateEvidenceResult(
  plan: CandidateOracleEvidencePlan,
  evaluation: ReturnType<typeof evaluateCandidateEvidence>,
): NonNullable<ScenarioResult['candidateEvidence']> {
  return {
    schema: 'media-test/candidate-evidence-result@1',
    contractDigest: plan.contractDigest,
    status: evaluation.status,
    reasonCode: evaluation.reasonCode,
    required: evaluation.required,
    applied: evaluation.applied,
    unavailable: evaluation.unavailable,
    sufficientSurvivorOracles: evaluation.sufficientSurvivorOracles,
    sufficient: evaluation.sufficient,
  };
}

/** Matrix-only boundary: one fresh realm per concrete file, with the deadline owned by the parent. */
export async function runRobustnessCellInWorker(
  engineRegistryId: string,
  instanceEngineId: string,
  scenario: Scenario,
  support: CodecSupport,
  opts: RunOptions,
  runOneOpts: RunOneOptions,
): Promise<ScenarioResult> {
  const contract = robustnessContractFromOptions(scenario.options) ?? legacyRobustnessContract(scenario);
  const startedAt = performance.now();
  const startedAtIso = new Date().toISOString();
  const request: RobustnessWorkerRequest = {
    schema: ROBUSTNESS_WORKER_PROTOCOL,
    engineRegistryId,
    scenarioId: scenario.id,
    ...(runOneOpts.selection?.file ? { selectedFile: runOneOpts.selection.file } : {}),
    browser: opts.browser,
    support,
    options: {
      pillar: runOneOpts.pillar ?? 'all',
      env: runOneOpts.env ?? {
        suiteVersion: SUITE_VERSION,
        engineId: instanceEngineId,
        browser: opts.browser,
      },
      ...(runOneOpts.resolvedInputs ? { resolvedInputs: runOneOpts.resolvedInputs } : {}),
      ...(runOneOpts.selection ? { selection: runOneOpts.selection } : {}),
      ...(runOneOpts.selectionEvidencePlan
        ? { selectionEvidencePlan: runOneOpts.selectionEvidencePlan }
        : {}),
      ...(runOneOpts.verifiedContents ? { verifiedContents: runOneOpts.verifiedContents } : {}),
      ...(runOneOpts.decryptKeyOverride ? { decryptKeyOverride: runOneOpts.decryptKeyOverride } : {}),
      ...(runOneOpts.runSeed !== undefined ? { runSeed: runOneOpts.runSeed } : {}),
      pixelBehavior: runOneOpts.pixelBehavior ?? {
        state: 'UNSUPPORTED',
        reasonCode: 'PIXEL_API_UNAVAILABLE',
        detail: 'pixel behavior self-test was unavailable before isolated execution',
      },
      ...(runOneOpts.cachedResult ? { cachedResult: runOneOpts.cachedResult } : {}),
    },
  };
  const baseResult = (): Omit<ScenarioResult, 'status' | 'oracleOutcomes'> => ({
    engineId: instanceEngineId,
    browser: opts.browser,
    scenarioId: scenario.id,
    family: scenario.family,
    startedAtIso,
    durationMs: Math.max(0, performance.now() - startedAt),
    measurement: { state: 'NOT_REQUESTED' },
    ...(runOneOpts.env ? { env: { ...runOneOpts.env, engineId: instanceEngineId } } : {}),
    ...(runOneOpts.selection ? { selection: { ...runOneOpts.selection } } : {}),
  });
  const evidence = (
    disposition: ScenarioOperationEvidence['disposition'],
    error?: unknown,
  ): ScenarioOperationEvidence => ({
    schema: 'media-test/robustness-operation@1',
    disposition,
    stage: 'operation',
    ...(error !== undefined ? { nativeError: nativeErrorIdentity(error) } : {}),
    resource: {
      kind: disposition === 'timeout' ? 'worker-stall' : 'wall-time',
      observed: Math.max(0, performance.now() - startedAt),
      limit: contract.timeoutMs,
      unit: 'ms',
    },
  });
  const createWorker = opts.robustnessWorkerFactory ?? (() =>
    new Worker(new URL('./robustness-cell.worker.ts', import.meta.url), { type: 'module' }));

  try {
    const response = await runTerminableWorker<RobustnessWorkerRequest, RobustnessWorkerResponse>(
      createWorker,
      request,
      { timeoutMs: contract.timeoutMs, ...(opts.signal ? { signal: opts.signal } : {}) },
    );
    if (response.schema !== ROBUSTNESS_WORKER_PROTOCOL) {
      throw new TypeError(`isolated worker returned protocol '${String(response.schema)}'`);
    }
    if (response.state === 'RESULT') return response.result;
    const operationEvidence = evidence('harness-error', response.error);
    return {
      ...baseResult(),
      status: 'ERROR',
      oracleOutcomes: [],
      operationEvidence,
      reason: `isolated harness error: ${response.error.name}: ${response.error.message}`,
    };
  } catch (error) {
    if (error instanceof RunCancelledError) {
      return {
        ...baseResult(),
        status: 'SKIPPED',
        oracleOutcomes: [],
        reason: `[RUN_CANCELLED] ${error.message}`,
      };
    }
    const timedOut = error instanceof TimeoutError;
    const operationEvidence = evidence(timedOut ? 'timeout' : 'worker-crash', error);
    return {
      ...baseResult(),
      status: 'FAIL',
      oracleOutcomes: [{
        state: 'VERDICT',
        oracle: robustnessOutcomeOracle(scenario),
        verdict: 'FAIL',
        reasonCode: timedOut ? 'ROBUSTNESS_WORKER_TIMEOUT' : 'ROBUSTNESS_WORKER_CRASH',
        detail: timedOut ? 'terminable worker timeout' : `worker crash: ${errMessage(error)}`,
      }],
      operationEvidence,
      reason: timedOut ? 'terminable worker timeout' : `worker crash: ${errMessage(error)}`,
    };
  }
}

function notApplicableError(
  engine: MediaEngine,
  scenario: Scenario,
  inputs: MediaInput[],
  reasonCode: string,
  reason: string,
): NotApplicableError {
  return new NotApplicableError({
    reasonCode,
    operation: scenario.op,
    engineId: engine.id,
    tuple: {
      inputContainers: inputs.map((input) => containerFromInput(input)),
      inputCodecs: [...(scenario.requires.videoCodecsIn ?? scenario.requires.videoCodecs ?? []),
        ...(scenario.requires.audioCodecsIn ?? scenario.requires.audioCodecs ?? [])],
      outputContainer: asContainerOpt(scenario.options),
      outputCodecs: [...(scenario.requires.videoCodecsOut ?? []), ...(scenario.requires.audioCodecsOut ?? [])],
      ...(scenario.requires.encryption?.[0] ? { encryption: scenario.requires.encryption[0] } : {}),
    },
    reason,
  });
}

// ── Operation dispatch ──────────────────────────────────────────────────────────────────────────

/** The shape of an executed functional op, fed into the OracleContext. */
interface OpResult {
  output?: MediaBytes;
  metadata?: NormalizedMetadata;
  probeMetadatas?: Array<{ input: MediaInput; metadata: NormalizedMetadata; golden?: GoldenStore }>;
  demux?: DemuxResult;
  frames?: FrameSink;
  /** Authoritative first-frame callback evidence, independent of adapter terminal counters. */
  firstFrameBoundary?: FirstFrameBoundaryEvidence;
  seek?: SeekResult;
  seekSequence?: SeekSequenceObservation;
  trimComposition?: {
    contract: TrimCompositionContract;
    direct: TrimSemanticPresentation;
    concatenated: TrimSemanticPresentation;
  };
  demuxInvariantOutcome?: OracleOutcome;
  /** Verdict over the exact sparse artifact authored through the runner-injected mux target. */
  muxLargeFileOutcome?: OracleOutcome;
  probeBudgetAssessment?: ProbeContractAssessment;
  /** Composed A->B->A provenance verdict produced at the exact output-binding boundary. */
  transcodeInvariantOutcome?: OracleOutcome;
  /** Runner/adapter-observed streaming boundary; scalar terminal counters are never expanded. */
  streamingRuntimeEvidence?: StreamingRuntimeEvidence;
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
function asTrimOpts(options: Scenario['options']): TrimOptions {
  const o = (options ?? {}) as Record<string, unknown>;
  return {
    container: typeof o['container'] === 'string' ? (o['container'] as string) : 'mp4',
    frameAccurate: o['frameAccurate'] === true,
    ...(o['fragmented'] === true ? { fragmented: true } : {}),
  };
}

function trimCompositionContractFromOptions(
  options: Scenario['options'],
): TrimCompositionContract | undefined {
  const raw = (options ?? {}) as Record<string, unknown>;
  const invariant = typeof raw['invariant'] === 'string' ? raw['invariant'].toLowerCase() : '';
  if (!invariant.includes('trim(a..b)')) return undefined;
  return {
    aUs: Number(raw['a']),
    bUs: Number(raw['b']),
    cUs: Number(raw['c']),
    container: typeof raw['container'] === 'string' ? raw['container'] : 'mp4',
    frameAccurate: raw['frameAccurate'] === true,
  };
}

function mediaIntermediate(role: string, value: MediaBytes): {
  role: string;
  bytes: Uint8Array;
  mime: string;
  container: string;
} {
  return { role, bytes: value.bytes, mime: value.mime, container: value.container };
}

/** Neutral packet/timeline observation for the trim composition seam. Packet byte sizes and
 * keyframe labels are deliberately excluded so a legal representation change cannot become FAIL. */
async function observeTrimSemanticPresentation(value: MediaBytes): Promise<TrimSemanticPresentation> {
  const structure = readOutputStructureResult(value.bytes, value.container);
  if (structure.state !== 'OK') {
    throw new Error(`trim composition structure observation failed [${structure.reasonCode}]`);
  }
  const packets = readOutputPacketsResult(value.bytes, value.container);
  if (packets.state !== 'OK') {
    throw new Error(`trim composition packet observation failed [${packets.reasonCode}]`);
  }
  const originUs = packets.value.length > 0
    ? Math.min(...packets.value.map((packet) => packet.ptsUs))
    : 0;
  const ordinals: Record<string, number> = {};
  const tracks = structure.value.tracks.map((track, trackIndex) => {
    const ordinal = ordinals[track.type] ?? 0;
    ordinals[track.type] = ordinal + 1;
    const rows = packets.value
      .filter((packet) => packet.trackIndex === trackIndex)
      .sort((a, b) => a.ptsUs - b.ptsUs || a.dtsUs - b.dtsUs);
    return {
      identity: `${track.type}:${ordinal}`,
      type: track.type,
      codecCanonical: track.codec ?? 'unknown',
      samples: rows.map((packet, index) => ({
        ptsUs: packet.ptsUs - originUs,
        durationUs: packet.durationUs ?? Math.max(1, (rows[index + 1]?.ptsUs ?? packet.ptsUs + 1) - packet.ptsUs),
        contentDigest: `${track.type}:semantic-presentation-unit`,
      })),
    };
  });
  const packetEndUs = tracks.reduce(
    (end, track) => Math.max(end, ...track.samples.map((sample) => sample.ptsUs + sample.durationUs), 0),
    0,
  );
  return {
    tracks,
    durationUs: structure.value.durationSec !== undefined
      ? Math.round(structure.value.durationSec * 1_000_000)
      : packetEndUs,
    metadata: { container: structure.value.container },
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

function containerFromInput(input: MediaInput): string {
  const mime = input.mime.toLowerCase();
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('matroska')) return 'mkv';
  if (mime.includes('quicktime')) return 'mov';
  if (mime.includes('mpegurl')) return 'hls';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('wave') || mime.includes('wav')) return 'wav';
  const ext = input.id.toLowerCase().match(/\.([a-z0-9]+)(?:$|\?)/)?.[1] ?? '';
  if (ext === 'm4a' || ext === 'm4v') return 'mp4';
  if (ext === 'm3u8') return 'hls';
  if (ext === 'aac') return 'adts';
  return ext;
}

/** Build the versioned concrete tuple after selected-source metadata/golden evidence is available. */
export function buildConcreteOperationRequest(
  scenario: Scenario,
  inputs: MediaInput[],
  goldens: readonly GoldenStore[],
): ConcreteOperationRequest {
  const options = recordOption(scenario.options) ?? {};
  const video = recordOption(options.video);
  const audio = recordOption(options.audio);
  const range = recordOption(options.range);
  const outputContainer = asContainerOpt(scenario.options);
  const output: ConcreteOperationRequest['output'] = {
    container: outputContainer,
    ...(codecOption(options.video) ? { videoCodec: codecOption(options.video) } : {}),
    ...(codecOption(options.audio) ? { audioCodec: codecOption(options.audio) } : {}),
    ...(typeof video?.width === 'number' ? { width: video.width } : {}),
    ...(typeof video?.height === 'number' ? { height: video.height } : {}),
    ...(typeof video?.fps === 'number' ? { frameRate: video.fps } : {}),
    ...(typeof audio?.sampleRate === 'number' ? { sampleRate: audio.sampleRate } : {}),
    ...(typeof audio?.channels === 'number' ? { channels: audio.channels } : {}),
  };
  const transforms: ConcreteOperationRequest['transforms'] = {
    ...((typeof video?.width === 'number' || typeof video?.height === 'number')
      ? { resize: {
          ...(typeof video?.width === 'number' ? { width: video.width } : {}),
          ...(typeof video?.height === 'number' ? { height: video.height } : {}),
        } }
      : {}),
    ...(typeof video?.rotate === 'number' ? { rotate: video.rotate } : {}),
    ...(typeof video?.fps === 'number' ? { frameRate: video.fps } : {}),
    ...((typeof audio?.sampleRate === 'number' || typeof audio?.channels === 'number')
      ? { audio: {
          ...(typeof audio?.sampleRate === 'number' ? { sampleRate: audio.sampleRate } : {}),
          ...(typeof audio?.channels === 'number' ? { channels: audio.channels } : {}),
        } }
      : {}),
    ...(scenario.op === 'trim'
      ? {
          trim: {
            startUs:
              typeof range?.startUs === 'number'
                ? range.startUs
                : asNumberOpt(scenario.options, 'startUs', 0),
            endUs:
              typeof range?.endUs === 'number'
                ? range.endUs
                : asNumberOpt(scenario.options, 'endUs', 0),
            frameAccurate: options.frameAccurate === true,
          },
        }
      : {}),
  };

  return {
    protocol: CONCRETE_OPERATION_PROTOCOL,
    scenarioId: scenario.id,
    operation: scenario.op,
    inputs: inputs.map((input, index) => ({
      id: input.id,
      mime: input.mime,
      container: goldens[index]?.meta?.container ?? containerFromInput(input),
      ...(input.sizeBytes !== undefined ? { sizeBytes: input.sizeBytes } : {}),
      mutated: input.mutated === true,
      sourceEvidence: goldens[index]?.meta ? 'RESOLVED' : 'UNRESOLVED',
      tracks: (goldens[index]?.meta?.tracks ?? []).map((track) => ({ ...track })),
    })),
    ...(operationHasOutput(scenario.op) ? { output } : {}),
    ...(scenario.requires.encryption?.[0] ? { encryption: scenario.requires.encryption[0] } : {}),
    ...(Object.keys(transforms).length > 0 ? { transforms } : {}),
    ...(typeof options.timingMode === 'string' ? { timingMode: options.timingMode } : {}),
    options: cloneRequestOptions(options),
  };
}

function operationHasOutput(operation: Operation): boolean {
  return operation === 'remux' || operation === 'transcode' || operation === 'trim' || operation === 'mux' || operation === 'decrypt';
}

function cloneRequestOptions(options: Record<string, unknown>): Readonly<Record<string, unknown>> {
  try {
    return structuredClone(options) as Record<string, unknown>;
  } catch {
    return { ...options };
  }
}

export interface ConcreteSupportResult {
  decision: SupportDecision;
  browserConfigs: ConcreteWebCodecsConfig[];
  probeStates: Array<{ role: ConcreteWebCodecsConfig['role']; state: 'SUPPORTED' | 'UNSUPPORTED' | 'ERROR'; reasonCode?: string }>;
  blocker?: { status: 'NA_ENGINE' | 'NA_BROWSER' | 'ERROR'; reason: string };
}

/** FEAT-30 production binding for the trim-local mode/tuple preflight contract. */
function runnerTrimPreflightDecision(
  engine: MediaEngine,
  scenario: Scenario,
  request: ConcreteOperationRequest,
  support: ConcreteSupportResult,
): TrimDecision {
  const contract = trimContractForScenario(scenario);
  const configs = support.browserConfigs;
  const assignedConfig = new Set<number>();
  const configTrackIdentity = new Map<number, string>();
  const flattened = request.inputs.flatMap((input) => input.tracks).map((track, trackIndex) => ({ track, trackIndex }));

  const takeConfig = (
    role: ConcreteWebCodecsConfig['role'],
    trackIndex: number,
    identity: string,
  ): ConcreteWebCodecsConfig | undefined => {
    let index = configs.findIndex((config, configIndex) =>
      !assignedConfig.has(configIndex) && config.role === role && config.trackIndex === trackIndex);
    if (index < 0) {
      index = configs.findIndex((config, configIndex) =>
        !assignedConfig.has(configIndex) && config.role === role && config.trackIndex === undefined);
    }
    if (index < 0) return undefined;
    assignedConfig.add(index);
    configTrackIdentity.set(index, identity);
    return configs[index];
  };

  const tracks = flattened.flatMap(({ track, trackIndex }) => {
    if (track.type !== 'video' && track.type !== 'audio') return [];
    const identity = track.trackId ?? `${track.type}:${trackIndex}`;
    const decoderConfig = takeConfig(`${track.type}-decoder`, trackIndex, identity);
    const encoderConfig = takeConfig(`${track.type}-encoder`, trackIndex, identity);
    return [{
      identity,
      type: track.type,
      codec: track.codec,
      ...(decoderConfig ? { decoderConfig } : {}),
      ...(encoderConfig ? { encoderConfig } : {}),
    }];
  });
  const probes = support.probeStates.map((probe, index) => ({
    ...(configTrackIdentity.get(index) ? { trackIdentity: configTrackIdentity.get(index)! } : {}),
    role: probe.role,
    state: probe.state,
    ...(probe.reasonCode ? { reasonCode: probe.reasonCode } : {}),
  }));
  const copyPath = configs.length > 0
    ? 'browser-codec' as const
    : contract.mode === 'copy'
      ? 'packet-copy' as const
      : 'engine-native' as const;
  return preflightTrimTuple({
    engineId: engine.id,
    inputContainer: request.inputs[0]?.container ?? 'unknown',
    outputContainer: request.output?.container ?? contract.container,
    contract,
    tracks,
    copyPath,
    requiredBrowserRoles: configs.map((config) => config.role),
  }, support.decision.supported
    ? { supported: true }
    : {
        supported: false,
        status: support.decision.status,
        reasonCode: support.decision.reasonCode,
        reason: support.decision.reason,
      }, probes).decision;
}

/**
 * The four explicit negative mux rows are conformance checks: an adapter's tuple-level NA must not
 * prevent its mux rejection boundary from executing. Coarse declarations, browser probes, assets,
 * and support-protocol errors are intentionally outside this exception.
 */
function bypassDeliberateIllegalMuxTupleBlocker(
  scenario: Scenario,
  result: ConcreteSupportResult,
): boolean {
  return isDeliberatelyIllegalMuxScenario(scenario) &&
    result.decision.supported === false &&
    result.blocker?.status === 'NA_ENGINE';
}

export function isBenchmarkEligible(status: ScenarioResult['status']): status is 'PASS' {
  return status === 'PASS';
}

export async function evaluateConcreteSupport(
  engine: MediaEngine,
  request: ConcreteOperationRequest,
  options: { probeBrowser?: boolean; context?: LifecycleContext } = {},
): Promise<ConcreteSupportResult> {
  let decision: SupportDecision;
  try {
    const rawDecision: unknown = engine.supports
      ? await engine.supports(request, options.context)
      : { supported: true };
    decision = validateSupportDecision(engine.id, rawDecision);
  } catch (error) {
    if (isNotApplicableError(error) || isBrowserNotSupportedError(error)) throw error;
    return {
      decision: {
        supported: false,
        status: 'NA_ENGINE',
        reasonCode: 'ADAPTER_SUPPORT_DECISION_INVALID',
        reason: 'adapter returned an invalid supports() decision',
      },
      browserConfigs: [],
      probeStates: [],
      blocker: { status: 'ERROR', reason: errMessage(error) },
    };
  }
  const browserConfigs = (decision.browserConfigs ?? []).map((entry) => ({ ...entry }));
  if (!decision.supported) {
    return {
      decision,
      browserConfigs,
      probeStates: [],
      blocker: { status: decision.status, reason: `[${decision.reasonCode}] ${decision.reason}` },
    };
  }
  if (options.probeBrowser === false) return { decision, browserConfigs, probeStates: [] };
  if (browserConfigs.length === 0) return { decision, browserConfigs, probeStates: [] };

  const probed = await probeWebCodecsConfigs(browserConfigs);
  const probeStates = probed.probes.map((probe) => ({
    role: probe.request.role,
    state: probe.state,
    ...(probe.state !== 'SUPPORTED' ? { reasonCode: probe.reasonCode } : {}),
  }));
  const invalid = probed.probes.find((probe) => probe.state === 'ERROR');
  if (invalid && invalid.state === 'ERROR') {
    return {
      decision,
      browserConfigs: probed.probes.map((probe) => probe.checkedConfig),
      probeStates,
      blocker: { status: 'ERROR', reason: `[${invalid.reasonCode}] ${invalid.detail}` },
    };
  }
  const unsupported = probed.probes.find((probe) => probe.state === 'UNSUPPORTED');
  if (unsupported && unsupported.state === 'UNSUPPORTED') {
    return {
      decision,
      browserConfigs: probed.probes.map((probe) => probe.checkedConfig),
      probeStates,
      blocker: { status: 'NA_BROWSER', reason: `[${unsupported.reasonCode}] ${unsupported.detail}` },
    };
  }
  return {
    decision,
    browserConfigs: probed.probes.map((probe) => probe.checkedConfig),
    probeStates,
  };
}

export const EXECUTION_RESULT_SCHEMA = 'media-test/scenario-result@3' as const;
export const ORACLE_MODEL_VERSION = 'media-test/oracle-outcome@3way-v1' as const;

export interface ExecutionFingerprintComponents {
  suiteVersion: string;
  resultSchema: typeof EXECUTION_RESULT_SCHEMA;
  oracleModelVersion: typeof ORACLE_MODEL_VERSION;
  scenarioDefinition: unknown;
  engine: { id: string; config?: unknown; capabilities?: unknown };
  browser: { family: BrowserName; version?: string; userAgent?: string; pixelBehavior?: PixelBehaviorEvidence };
  supportDecision: unknown;
  selectedAssets: Array<{
    id: string;
    sha256?: string;
    sizeBytes?: number;
    transport?: ResolvedInput['transport'];
  }>;
  /**
   * Selection/evidence identity for the observation.  Deliberately excludes the run seed: two
   * seeds that resolve to the same verified bytes may reuse an observation, while a changed pool,
   * candidate, or evidence contract may not retain stale provenance.
   */
  selectionContract?: unknown;
  /** Performance protocol is part of an observation, even when correctness inputs are unchanged. */
  benchmarkProtocol?: unknown;
  corpusChecksum?: string;
  goldenHashes: Array<{ assetId: string; kind: string; sha256: string }>;
}

export interface ExecutionFingerprint {
  schema: typeof EXECUTION_RESULT_SCHEMA;
  hash: string;
}

type FingerprintedScenarioResult = ScenarioResult & { executionFingerprint?: ExecutionFingerprint };

/** Content-address every input that may change correctness/applicability before reusing a result. */
export async function buildExecutionFingerprint(
  components: ExecutionFingerprintComponents,
): Promise<ExecutionFingerprint> {
  const canonical = stableCanonicalString(components);
  const bytes = new TextEncoder().encode(canonical);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return {
    schema: EXECUTION_RESULT_SCHEMA,
    hash: [...digest].map((value) => value.toString(16).padStart(2, '0')).join(''),
  };
}

/** Old boolean rows and rows produced under another fingerprint are always cache misses. */
export function isExecutionFingerprintReusable(
  result: ScenarioResult | undefined,
  expected: ExecutionFingerprint,
): result is ScenarioResult {
  if (!result) return false;
  const fingerprint = (result as FingerprintedScenarioResult).executionFingerprint;
  if (
    fingerprint?.schema !== EXECUTION_RESULT_SCHEMA ||
    fingerprint.hash !== expected.hash ||
    !isTypedScenarioResult(result)
  ) {
    return false;
  }
  return true;
}

function isTypedScenarioResult(result: ScenarioResult): boolean {
  if (!Array.isArray(result.oracleOutcomes)) return false;
  for (const outcome of result.oracleOutcomes as unknown[]) {
    if (!isRecord(outcome) || typeof outcome.oracle !== 'string') return false;
    if (outcome.state === 'VERDICT') {
      if (outcome.verdict !== 'PASS' && outcome.verdict !== 'FAIL') return false;
      continue;
    }
    if (outcome.state === 'UNAVAILABLE') {
      if (
        (outcome.status !== 'NA_ASSET' && outcome.status !== 'NA_BROWSER') ||
        typeof outcome.reasonCode !== 'string'
      ) return false;
      continue;
    }
    if (outcome.state === 'ERROR') {
      if (typeof outcome.reasonCode !== 'string') return false;
      continue;
    }
    return false;
  }
  if (
    (result.status === 'PASS' || result.status === 'FAIL') &&
    result.oracleOutcomes.length === 0
  ) return false;
  return true;
}

function stableCanonicalString(value: unknown): string {
  const active = new Set<object>();
  const encode = (item: unknown): string => {
    if (item === null) return 'null';
    if (item === undefined) return '"<undefined>"';
    if (typeof item === 'string' || typeof item === 'boolean') return JSON.stringify(item);
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) return JSON.stringify(`<number:${String(item)}>`);
      return Object.is(item, -0) ? '0' : String(item);
    }
    if (typeof item === 'bigint') return JSON.stringify(`<bigint:${item.toString()}>`);
    if (typeof item === 'function') return JSON.stringify(`<function:${Function.prototype.toString.call(item)}>`);
    if (item instanceof ArrayBuffer) {
      return `{"$bytes":"${bytesHex(new Uint8Array(item))}"}`;
    }
    if (ArrayBuffer.isView(item)) {
      return `{"$bytes":"${bytesHex(new Uint8Array(item.buffer, item.byteOffset, item.byteLength))}"}`;
    }
    if (Array.isArray(item)) return `[${item.map((entry) => encode(entry)).join(',')}]`;
    if (typeof item !== 'object') return JSON.stringify(`<${typeof item}:${String(item)}>`);
    if (active.has(item)) throw new TypeError('execution fingerprint input contains a cycle');
    active.add(item);
    try {
      if (item instanceof Date) return JSON.stringify(item.toISOString());
      if (item instanceof Set) return `[${[...item].map((entry) => encode(entry)).sort().join(',')}]`;
      if (item instanceof Map) {
        return `{${[...item.entries()]
          .map(([key, entry]) => [encode(key), encode(entry)] as const)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, entry]) => `${key}:${entry}`)
          .join(',')}}`;
      }
      const record = item as Record<string, unknown>;
      return `{${Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${encode(record[key])}`)
        .join(',')}}`;
    } finally {
      active.delete(item);
    }
  };
  return encode(value);
}

function bytesHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function buildCellExecutionFingerprint(
  engine: MediaEngine,
  scenario: Scenario,
  browser: BrowserName,
  opts: RunOneOptions | undefined,
  supportDecision: ScenarioResult['support'],
  pixelBehavior: PixelBehaviorEvidence,
  assetIds: readonly string[],
  goldens: readonly GoldenStore[],
): Promise<ExecutionFingerprint> {
  const selectedInputs = opts?.resolvedInputs?.length
    ? opts.resolvedInputs.map((resolved) => ({ id: resolved.id, resolved }))
    : assetIds.map((id) => ({ id, resolved: undefined }));
  const selectedAssets = selectedInputs.map(({ id, resolved }) => {
    const manifest = fixtureManifestCache?.get(id);
    const sha256 = resolved?.sha256 ?? manifest?.sha256 ?? undefined;
    const sizeBytes = resolved?.sizeBytes ?? manifest?.sizeBytes ?? undefined;
    return {
      id,
      ...(resolved?.transport ? { transport: resolved.transport } : {}),
      ...(sha256 ? { sha256 } : {}),
      ...(sizeBytes !== undefined && sizeBytes !== null ? { sizeBytes } : {}),
    };
  });
  const goldenHashes: ExecutionFingerprintComponents['goldenHashes'] = [];
  for (let index = 0; index < goldens.length; index++) {
    const golden = goldens[index]!;
    for (const [kind, evidence] of Object.entries(golden.evidence)) {
      if (evidence.state === 'OK' && evidence.sha256) {
        goldenHashes.push({ assetId: assetIds[index]!, kind, sha256: evidence.sha256 });
      }
    }
  }
  goldenHashes.sort(
    (a, b) => a.assetId.localeCompare(b.assetId) || a.kind.localeCompare(b.kind) || a.sha256.localeCompare(b.sha256),
  );
  return buildExecutionFingerprint({
    suiteVersion: opts?.env?.suiteVersion ?? SUITE_VERSION,
    resultSchema: EXECUTION_RESULT_SCHEMA,
    oracleModelVersion: ORACLE_MODEL_VERSION,
    scenarioDefinition: scenario,
    engine: {
      id: engine.id,
      ...(engine.configUsed !== undefined ? { config: engine.configUsed } : {}),
      capabilities: engine.capabilities(),
    },
    browser: {
      family: browser,
      ...(opts?.env?.browserVersion ? { version: opts.env.browserVersion } : {}),
      ...(opts?.env?.userAgent ? { userAgent: opts.env.userAgent } : {}),
      pixelBehavior,
    },
    supportDecision,
    selectedAssets,
    ...(opts?.selection || opts?.selectionEvidencePlan
      ? {
          selectionContract: {
            schema: 'media-test/selection-observation@1',
            eligiblePoolDigest: opts.selection?.eligiblePoolDigest ?? null,
            executedInputDigest: opts.selection?.executedInputDigest ?? null,
            candidateIdentity: opts.selection?.candidateIdentity ?? null,
            candidateCount: opts.selection?.candidateCount ?? null,
            selectionPolicyVersion: opts.selection?.selectionPolicyVersion ?? null,
            selectionAlgorithmId: opts.selection?.selectionAlgorithmId ?? null,
            evidenceContractDigest:
              opts.selectionEvidencePlan?.contractDigest ??
              opts.selection?.evidenceContractDigest ??
              null,
            catalogState: opts.selection?.catalogState ?? null,
          },
        }
      : {}),
    benchmarkProtocol: {
      schema: 'media-test/benchmark-protocol@1',
      pillar: opts?.pillar ?? 'all',
      metrics: scenario.metrics,
      primaryMetric: scenario.primaryMetric ?? null,
      warmup: opts?.benchOptions?.warmup ?? DEFAULT_BENCH.warmup,
      iters: opts?.benchOptions?.iters ?? DEFAULT_BENCH.iters,
      noiseBandPct: opts?.benchOptions?.noiseBandPct ?? DEFAULT_BENCH.noiseBandPct,
    },
    ...(opts?.env?.corpusChecksum ? { corpusChecksum: opts.env.corpusChecksum } : {}),
    goldenHashes,
  });
}

/**
 * Execute the engine method for `scenario.op` against `input(s)`, returning the normalized
 * `OpResult`. `mux` consumes pre-encoded tracks; the runner accepts explicit `options.tracks`, or
 * delegates corpus-input-to-track assembly to engines that expose `prepareMuxTracks`.
 */
async function callValidatedAdapter<O extends Operation>(
  engine: MediaEngine,
  operation: O,
  request: ConcreteOperationRequest,
  signal: AbortSignal,
  phase: OperationPhase,
  call: (context: OperationContext) => Promise<unknown>,
  allowEmptyBytes: boolean,
  onTelemetry?: (events: readonly OperationTelemetry[]) => void,
): Promise<ReturnType<typeof validateAdapterResult<O>>> {
  const telemetry = new OperationTelemetryCollector(engine.id, signal);
  const context: OperationContext = {
    signal,
    emit: telemetry.emit,
    phase,
    request,
    checkedSupport: SUPPORTED_CHECKED_SUPPORT_SNAPSHOT,
    operationStartMs: performance.now(),
  };
  try {
    const raw = await call(context);
    const normalized = validateAdapterResult(engine.id, operation, raw, { allowEmptyBytes });
    const events = telemetry.close(finalCountersFromResult(normalized));
    onTelemetry?.(events);
    return normalized as ReturnType<typeof validateAdapterResult<O>>;
  } catch (error) {
    try {
      telemetry.close();
    } catch {
      // The original adapter/applicability/browser error remains decisive on an unsuccessful call.
    }
    throw error;
  }
}

function finalCountersFromResult(value: unknown): OperationFinalCounters | undefined {
  if (isRecord(value) && isRecord(value.telemetry)) {
    return value.telemetry as OperationFinalCounters;
  }
  return undefined;
}

function remuxLegRequest(
  base: ConcreteOperationRequest,
  input: MediaInput,
  contract: RemuxRoundTripContract,
  leg: RemuxLeg,
): ConcreteOperationRequest {
  const target = leg === 'outbound' ? contract.via : contract.backTo;
  const sourceContainer = leg === 'outbound'
    ? base.inputs[0]?.container ?? containerFromInput(input)
    : contract.via;
  const inherited = base.inputs[0];
  return {
    ...base,
    scenarioId: `${base.scenarioId}#remux-${leg}`,
    inputs: [{
      id: input.id,
      mime: input.mime,
      container: sourceContainer,
      ...(input.sizeBytes !== undefined ? { sizeBytes: input.sizeBytes } : {}),
      mutated: input.mutated === true,
      sourceEvidence: inherited?.sourceEvidence ?? 'UNRESOLVED',
      tracks: (inherited?.tracks ?? []).map((track) => ({ ...track })),
    }],
    output: { ...(base.output ?? { container: target }), container: target },
    options: { ...base.options, container: target, roundTripLeg: leg },
  };
}

async function assertNestedRemuxSupport(
  engine: MediaEngine,
  request: ConcreteOperationRequest,
  signal: AbortSignal,
): Promise<void> {
  if (!engine.supports) return;
  const decision = validateSupportDecision(
    engine.id,
    await engine.supports(request, { signal, phase: 'support', emit: () => undefined }),
  );
  if (decision.supported) return;
  throw createNotApplicableError(
    engine.id,
    'remux',
    decision.reason,
    {
      inputContainers: request.inputs.map((item) => item.container),
      inputCodecs: request.inputs.flatMap((item) => item.tracks.map((track) => track.codec)),
      outputContainer: request.output?.container,
      outputCodecs: [request.output?.videoCodec, request.output?.audioCodec].filter(
        (codec): codec is string => codec !== undefined,
      ),
    },
    decision.reasonCode,
  );
}

function transcodeBindingInput(binding: BoundTranscodeInput): {
  input: MediaInput;
  materialized: Uint8Array;
  revoke: () => void;
} {
  if (typeof URL.createObjectURL !== 'function' || typeof URL.revokeObjectURL !== 'function') {
    throw new Error('[TRANSCODE_BINDING_TRANSPORT_UNAVAILABLE] object-URL transport is unavailable');
  }
  const materialized = binding.materialize();
  const blob = new Blob([materialized.slice().buffer], { type: binding.mime });
  const url = URL.createObjectURL(blob);
  return {
    materialized,
    input: {
      id: `${binding.producerScenarioId}#${binding.role}`,
      url,
      mime: binding.mime,
      sizeBytes: materialized.byteLength,
      mutated: false,
      async arrayBuffer(): Promise<ArrayBuffer> {
        return materialized.slice().buffer as ArrayBuffer;
      },
      async blob(): Promise<Blob> {
        return blob;
      },
    },
    revoke: () => URL.revokeObjectURL(url),
  };
}

function inferredTranscodeOutputTracks(
  scenario: Scenario,
  sourceTracks: readonly NormalizedTrack[],
): NormalizedTrack[] {
  const options = recordOption(scenario.options) ?? {};
  const video = recordOption(options.video);
  const audio = recordOption(options.audio);
  const sourceVideo = sourceTracks.find((track) => track.type === 'video');
  const sourceAudio = sourceTracks.find((track) => track.type === 'audio');
  const tracks: NormalizedTrack[] = [];
  const videoCodec = codecOption(options.video);
  if (videoCodec) {
    tracks.push({
      type: 'video',
      codec: videoCodec,
      ...(typeof video?.width === 'number'
        ? { width: video.width }
        : sourceVideo?.width !== undefined
          ? { width: sourceVideo.width }
          : {}),
      ...(typeof video?.height === 'number'
        ? { height: video.height }
        : sourceVideo?.height !== undefined
          ? { height: sourceVideo.height }
          : {}),
      ...(typeof video?.fps === 'number'
        ? { fps: video.fps }
        : sourceVideo?.fps !== undefined
          ? { fps: sourceVideo.fps }
          : {}),
    });
  }
  const audioCodec = codecOption(options.audio);
  if (audioCodec) {
    tracks.push({
      type: 'audio',
      codec: audioCodec,
      ...(typeof audio?.sampleRate === 'number'
        ? { sampleRate: audio.sampleRate }
        : sourceAudio?.sampleRate !== undefined
          ? { sampleRate: sourceAudio.sampleRate }
          : {}),
      ...(typeof audio?.channels === 'number'
        ? { channels: audio.channels }
        : sourceAudio?.channels !== undefined
          ? { channels: sourceAudio.channels }
          : {}),
    });
  }
  return tracks;
}

function observedTranscodeOutputTracks(
  output: MediaBytes,
  fallback: readonly NormalizedTrack[],
): NormalizedTrack[] {
  const structure = readOutputStructureResult(output.bytes, output.container);
  if (structure.state !== 'OK' || structure.value.tracks.length === 0) return [...fallback];
  const usedFallback = new Set<number>();
  return structure.value.tracks.map((track) => {
    const fallbackIndex = fallback.findIndex((candidate, index) =>
      !usedFallback.has(index) && candidate.type === track.type);
    const inherited = fallbackIndex >= 0 ? fallback[fallbackIndex] : undefined;
    if (fallbackIndex >= 0) usedFallback.add(fallbackIndex);
    return {
      type: track.type,
      codec: track.codec ?? inherited?.codec ?? '',
      ...(track.width !== undefined
        ? { width: track.width }
        : inherited?.width !== undefined
          ? { width: inherited.width }
          : {}),
      ...(track.height !== undefined
        ? { height: track.height }
        : inherited?.height !== undefined
          ? { height: inherited.height }
          : {}),
      ...(inherited?.sampleRate !== undefined ? { sampleRate: inherited.sampleRate } : {}),
      ...(inherited?.channels !== undefined ? { channels: inherited.channels } : {}),
    };
  });
}

function transcodeLegRequest(
  scenario: Scenario,
  input: MediaInput,
  sourceContainer: string,
  sourceTracks: readonly NormalizedTrack[],
): ConcreteOperationRequest {
  const golden = emptyGoldenStore();
  golden.meta = {
    container: sourceContainer,
    durationSec: null,
    tracks: sourceTracks.map((track) => ({ ...track })),
  };
  return buildConcreteOperationRequest(scenario, [input], [golden]);
}

function concreteTranscodeTuple(request: ConcreteOperationRequest): {
  inputContainers: string[];
  inputCodecs: string[];
  outputContainer?: string;
  outputCodecs: string[];
} {
  return {
    inputContainers: request.inputs.map((item) => item.container),
    inputCodecs: request.inputs.flatMap((item) => item.tracks.map((track) => track.codec)),
    ...(request.output?.container !== undefined ? { outputContainer: request.output.container } : {}),
    outputCodecs: [request.output?.videoCodec, request.output?.audioCodec].filter(
      (codec): codec is string => codec !== undefined,
    ),
  };
}

const nestedTranscodeSupportCache = new WeakMap<MediaEngine, Map<string, Promise<void>>>();

async function assertNestedTranscodeSupport(
  engine: MediaEngine,
  request: ConcreteOperationRequest,
  signal: AbortSignal,
): Promise<void> {
  let engineCache = nestedTranscodeSupportCache.get(engine);
  if (!engineCache) {
    engineCache = new Map();
    nestedTranscodeSupportCache.set(engine, engineCache);
  }
  const cacheKey = stableCanonicalString({
    scenarioId: request.scenarioId,
    operation: request.operation,
    inputs: request.inputs.map((item) => ({ container: item.container, tracks: item.tracks })),
    output: request.output,
    transforms: request.transforms,
    timingMode: request.timingMode,
    options: request.options,
  });
  const cached = engineCache.get(cacheKey);
  if (cached) return cached;
  const pending = evaluateNestedTranscodeSupport(engine, request, signal);
  engineCache.set(cacheKey, pending);
  return pending;
}

async function evaluateNestedTranscodeSupport(
  engine: MediaEngine,
  request: ConcreteOperationRequest,
  signal: AbortSignal,
): Promise<void> {
  const support = await evaluateConcreteSupport(engine, request, {
    context: { signal, phase: 'support', emit: () => undefined },
  });
  if (!support.blocker) return;

  let reasonCode = 'TRANSCODE_NESTED_SUPPORT_ERROR';
  if (!support.decision.supported) reasonCode = support.decision.reasonCode;
  else reasonCode = support.probeStates.find((probe) => probe.state !== 'SUPPORTED')?.reasonCode ?? reasonCode;
  if (support.blocker.status === 'ERROR') {
    throw new Error(`[${reasonCode}] ${support.blocker.reason}`);
  }
  const tuple = concreteTranscodeTuple(request);
  if (support.blocker.status === 'NA_BROWSER') {
    const blockedProbeIndex = support.probeStates.findIndex((probe) => probe.state === 'UNSUPPORTED');
    throw createBrowserNotSupportedError(
      engine.id,
      'transcode',
      support.blocker.reason,
      tuple,
      reasonCode,
      blockedProbeIndex >= 0 ? support.browserConfigs[blockedProbeIndex] : undefined,
    );
  }
  throw createNotApplicableError(
    engine.id,
    'transcode',
    support.blocker.reason,
    tuple,
    reasonCode,
  );
}

function transcodeRoundTripJsonEvidence(
  evidence: TranscodeRoundTripEvidence | undefined,
): OracleOutcome['evidence'] | undefined {
  if (!evidence) return undefined;
  return {
    transcodeRoundTrip: {
      schema: evidence.schema,
      contractId: evidence.contractId,
      originalSourceSha256: evidence.originalSourceSha256,
      leg1ConsumedSha256: evidence.leg1ConsumedSha256,
      leg1OutputSha256: evidence.leg1OutputSha256,
      leg2ConsumedSha256: evidence.leg2ConsumedSha256,
      finalOutputSha256: evidence.finalOutputSha256,
      finalReferenceSha256: evidence.finalReferenceSha256,
      leg1OutputBytes: evidence.leg1Output.bytes.byteLength,
      finalOutputBytes: evidence.finalOutput.bytes.byteLength,
    },
  };
}

function transcodeDecisionOracleOutcome(
  decision: TranscodeDecision,
  evidence?: TranscodeRoundTripEvidence,
): OracleOutcome {
  const common = {
    oracle: 'property-invariant' as const,
    reasonCode: decision.reasonCode,
    detail: decision.detail,
    ...(decision.measurements ? { measurements: { ...decision.measurements } } : {}),
    ...(transcodeRoundTripJsonEvidence(evidence)
      ? { evidence: transcodeRoundTripJsonEvidence(evidence)! }
      : {}),
  };
  if (decision.state === 'VERDICT') {
    return { state: 'VERDICT', verdict: decision.verdict, ...common };
  }
  if (decision.state === 'UNAVAILABLE') {
    return { state: 'UNAVAILABLE', status: decision.status, ...common };
  }
  return { state: 'ERROR', ...common };
}

async function executeComposedTranscodeRoundTrip(
  engine: MediaEngine,
  input: MediaInput,
  request: ConcreteOperationRequest,
  signal: AbortSignal,
  phase: OperationPhase,
  allowEmptyBytes: boolean,
): Promise<OpResult> {
  const original = {
    bytes: new Uint8Array(await input.arrayBuffer()),
    mime: input.mime,
    container: request.inputs[0]?.container ?? containerFromInput(input),
  };
  let nextSourceTracks = request.inputs[0]?.tracks.map((track) => ({ ...track })) ?? [];
  const runtime = await executeTranscodeRoundTripRuntime({
    original,
    execute: async (scenarioId, binding) => {
      const legScenario = getScenario(scenarioId);
      if (!legScenario || legScenario.op !== 'transcode') {
        throw new Error(`registered transcode composition leg '${scenarioId}' is unavailable`);
      }
      const delivered = transcodeBindingInput(binding);
      try {
        const legRequest = transcodeLegRequest(
          legScenario,
          delivered.input,
          binding.container,
          nextSourceTracks,
        );
        await assertNestedTranscodeSupport(engine, legRequest, signal);
        const output = await callValidatedAdapter(
          engine,
          'transcode',
          legRequest,
          signal,
          phase,
          (context) => engine.transcode(delivered.input, asTranscodeOpts(legScenario.options), context),
          allowEmptyBytes,
        );
        const inferred = inferredTranscodeOutputTracks(legScenario, nextSourceTracks);
        nextSourceTracks = observedTranscodeOutputTracks(output, inferred);
        return { output, consumedInputSha256: binding.sha256 };
      } finally {
        delivered.revoke();
      }
    },
  });

  const transcodeInvariantOutcome = transcodeDecisionOracleOutcome(
    runtime.decision,
    runtime.evidence,
  );
  if (!runtime.evidence) return { transcodeInvariantOutcome };
  const finalOutput: MediaBytes = {
    ...runtime.evidence.finalOutput,
    intermediates: [
      ...(runtime.evidence.finalOutput.intermediates ?? []),
      mediaIntermediate('transcode-roundtrip-leg1', runtime.evidence.leg1Output),
    ],
  };
  return { output: finalOutput, transcodeInvariantOutcome };
}

async function executeOp(
  engine: MediaEngine,
  scenario: Scenario,
  inputs: MediaInput[],
  request: ConcreteOperationRequest,
  signal: AbortSignal,
  phase: OperationPhase,
  observers?: { onDemuxTelemetry?: (events: readonly OperationTelemetry[]) => void },
): Promise<OpResult> {
  const op: Operation = scenario.op;
  const input = inputs[0]!;
  const allowEmptyBytes = recordOption(scenario.options)?.allowEmptyBytes === true;
  switch (op) {
    case 'probe': {
      if (inputs.length === 1) {
        return {
          metadata: await callValidatedAdapter(
            engine,
            'probe',
            request,
            signal,
            phase,
            (context) => engine.probe(input, context),
            allowEmptyBytes,
          ),
        };
      }
      const probeMetadatas: Array<{ input: MediaInput; metadata: NormalizedMetadata }> = [];
      for (const probeInput of inputs) {
        probeMetadatas.push({
          input: probeInput,
          metadata: await callValidatedAdapter(
            engine,
            'probe',
            request,
            signal,
            phase,
            (context) => engine.probe(probeInput, context),
            allowEmptyBytes,
          ),
        });
      }
      return { metadata: probeMetadatas[0]?.metadata, probeMetadatas };
    }
    case 'demux': {
      const invariant = readStringOption(scenario.options, ['invariant']);
      if (invariant === 'demux-flac-index-invariance') {
        const observation = await executeFlacSeektableInvariant(
          inputs,
          (invariantInput) => callValidatedAdapter(
            engine,
            'demux',
            request,
            signal,
            phase,
            (context) => engine.demux(invariantInput, context),
            allowEmptyBytes,
          ),
          scenario.tolerances?.seekToleranceUs,
        );
        return {
          demux: observation.withSeektable,
          demuxInvariantOutcome: observation.outcome,
        };
      }
      return {
        demux: await callValidatedAdapter(
          engine,
          'demux',
          request,
          signal,
          phase,
          (context) => engine.demux(input, context),
          allowEmptyBytes,
          observers?.onDemuxTelemetry,
        ),
      };
    }
    case 'remux': {
      const operationStartMs = performance.now();
      const roundTrip = remuxRoundTripContractFromOptions(scenario.options);
      if (!roundTrip) {
        const output = await callValidatedAdapter(
          engine,
          'remux',
          request,
          signal,
          phase,
          (context) => engine.remux(input, asRemuxOpts(scenario.options), context),
          allowEmptyBytes,
        );
        const streamingRuntimeEvidence = await observeStreamingRuntimeEvidence(
          scenario,
          output,
          operationStartMs,
          phase,
        );
        return {
          output,
          ...(streamingRuntimeEvidence ? { streamingRuntimeEvidence } : {}),
        };
      }
      const output = await executeRemuxRoundTrip(input, roundTrip, async (legInput, options, leg) => {
          const legRequest = remuxLegRequest(request, legInput, roundTrip, leg);
          await assertNestedRemuxSupport(engine, legRequest, signal);
          return callValidatedAdapter(
            engine,
            'remux',
            legRequest,
            signal,
            phase,
            (context) => engine.remux(legInput, options, context),
            allowEmptyBytes,
          );
        });
      const streamingRuntimeEvidence = await observeStreamingRuntimeEvidence(
        scenario,
        output,
        operationStartMs,
        phase,
      );
      return {
        output,
        ...(streamingRuntimeEvidence ? { streamingRuntimeEvidence } : {}),
      };
    }
    case 'transcode': {
      if (readTranscodeRuntimeInvariant(scenario.options) === TRANSCODE_ROUNDTRIP_INVARIANT) {
        return executeComposedTranscodeRoundTrip(
          engine,
          input,
          request,
          signal,
          phase,
          allowEmptyBytes,
        );
      }
      return {
        output: await callValidatedAdapter(
          engine,
          'transcode',
          request,
          signal,
          phase,
          (context) => engine.transcode(input, asTranscodeOpts(scenario.options), context),
          allowEmptyBytes,
        ),
      };
    }
    case 'decodeFrames': {
      const maxFrames = asMaxFrames(scenario.options);
      const track = decodeTrackSelectorFromOptions(scenario.options);
      const startedAtMs = performance.now();
      const firstFrame = new FirstFrameBoundaryRecorder(startedAtMs);
      const decodeOptions: DecodeOptions = {
        ...(maxFrames !== undefined ? { maxFrames } : {}),
        ...(track ? { track } : {}),
        onFirstFrame: (atMs) => firstFrame.delivered(atMs),
      };
      const frames = await callValidatedAdapter(
        engine,
        'decodeFrames',
        request,
        signal,
        phase,
        (context) => engine.decodeFrames(input, decodeOptions, context),
        allowEmptyBytes,
      );
      return {
        frames,
        ...(firstFrame.evidence() ? { firstFrameBoundary: firstFrame.evidence()! } : {}),
      };
    }
    case 'seek': {
      const contract = seekSequenceContractFromOptions(scenario.options);
      if (!contract) {
        return {
          seek: await callValidatedAdapter(
            engine,
            'seek',
            request,
            signal,
            phase,
            (context) => engine.seek(input, asNumberOpt(scenario.options, 'tUs', 0), context),
            allowEmptyBytes,
          ),
        };
      }
      const sequence = await executeSeekSequence(
        (targetUs) => callValidatedAdapter(
          engine,
          'seek',
          request,
          signal,
          phase,
          (context) => engine.seek(input, targetUs, context),
          allowEmptyBytes,
        ),
        contract,
      );
      const final = sequence.steps.at(-1);
      if (!final) throw new Error('seek sequence produced no final observation');
      return {
        seek: {
          landedPtsUs: final.landedPtsUs,
          frame: final.frame,
          ...(final.telemetry ? { telemetry: final.telemetry } : {}),
        },
        seekSequence: sequence,
      };
    }
    case 'trim': {
      const compositionContract = trimCompositionContractFromOptions(scenario.options);
      if (!compositionContract) {
        return {
          output: await callValidatedAdapter(
            engine,
            'trim',
            request,
            signal,
            phase,
            (context) => engine.trim(
              input,
              asTrimRange(scenario.options),
              asTrimOpts(scenario.options),
              context,
            ),
            allowEmptyBytes,
          ),
        };
      }
      if (!engine.concat) {
        throw createNotApplicableError(
          engine.id,
          'trim',
          'adapter does not expose the concat leg required by trim composition',
          {
            inputContainers: request.inputs.map((entry) => entry.container),
            outputContainer: compositionContract.container,
            timingMode: compositionContract.frameAccurate ? 'frame-accurate' : 'copy',
            options: { composition: true },
          },
          'TRIM_COMPOSITION_CONCAT_UNSUPPORTED',
        );
      }
      const observation = await executeTrimComposition({
        source: input,
        contract: compositionContract,
        trim: (source, range, options) => callValidatedAdapter(
          engine,
          'trim',
          request,
          signal,
          phase,
          (context) => engine.trim(source, range, options, context),
          allowEmptyBytes,
        ),
        concat: (segments, options) => callValidatedAdapter(
          engine,
          'trim',
          request,
          signal,
          phase,
          (context) => engine.concat!([...segments], options, context),
          allowEmptyBytes,
        ),
        observe: observeTrimSemanticPresentation,
      });
      const output: MediaBytes = {
        ...observation.concatenated,
        intermediates: [
          ...(observation.concatenated.intermediates ?? []),
          mediaIntermediate('trim-composition-left', observation.left),
          mediaIntermediate('trim-composition-right', observation.right),
          mediaIntermediate('trim-composition-direct', observation.direct),
        ],
      };
      return {
        output,
        trimComposition: {
          contract: compositionContract,
          direct: observation.directPresentation,
          concatenated: observation.concatenatedPresentation,
        },
      };
    }
    case 'mux': {
      if (!engine.mux) throw new Error("engine.mux is not implemented (capability declared but method missing)");
      const declaredOptions = canonicalMuxDispatchOptions(scenario.options, inputs.length);
      const largeFileContract = muxLargeFileContractFromOptions(scenario.options);
      const sparseTarget = largeFileContract ? createSparseMuxTarget() : undefined;
      const options = sparseTarget
        ? { ...declaredOptions, sparseTarget }
        : declaredOptions;
      const allowEmptyTracks = isDeliberatelyIllegalMuxScenario(scenario);
      let tracks = (scenario.options as { tracks?: EncodedTracks } | undefined)?.tracks;
      if (!tracks && engine.prepareMuxTracks) {
        const telemetry = new OperationTelemetryCollector(engine.id, signal);
        const context: OperationContext = {
          signal,
          emit: telemetry.emit,
          phase,
          request,
          checkedSupport: SUPPORTED_CHECKED_SUPPORT_SNAPSHOT,
          operationStartMs: performance.now(),
        };
        try {
          tracks = validateEncodedTracks(
            engine.id,
            await engine.prepareMuxTracks(inputs, options, context),
            'encodedTracks',
            { allowEmptyTracks },
          );
          telemetry.close(finalCountersFromResult(tracks));
        } catch (error) {
          try {
            telemetry.close();
          } catch {
            /* preserve the original error */
          }
          throw error;
        }
      } else if (tracks) {
        tracks = validateEncodedTracks(engine.id, tracks, 'encodedTracks', { allowEmptyTracks });
      }
      if (!tracks) {
        throw notApplicableError(
          engine,
          scenario,
          inputs,
          'MUX_TRACK_SOURCE_UNAVAILABLE',
          'mux scenario requires options.tracks or engine.prepareMuxTracks()',
        );
      }
      const output = await callValidatedAdapter(
          engine,
          'mux',
          request,
          signal,
          phase,
          (context) => engine.mux!(tracks!, asMuxOpts(options), context),
          allowEmptyBytes,
        );
      return {
        output,
        ...(sparseTarget && largeFileContract
          ? {
              muxLargeFileOutcome: muxDecisionOracleOutcome(
                'property-invariant',
                assessSparseMuxTarget(sparseTarget, largeFileContract).decision,
              ),
            }
          : {}),
      };
    }
    case 'decrypt': {
      if (!engine.decrypt) throw new Error("engine.decrypt is not implemented (capability declared but method missing)");
      return {
        output: await callValidatedAdapter(
          engine,
          'decrypt',
          request,
          signal,
          phase,
          (context) => engine.decrypt!(
            input,
            asDecryptKey(scenario.options),
            { scheme: asEncryptionScheme(scenario.options) },
            context,
          ),
          allowEmptyBytes,
        ),
      };
    }
    default: {
      // Exhaustiveness guard: if a new Operation is added, this fails to compile.
      const _never: never = op;
      throw new Error(`unsupported operation: ${String(_never)}`);
    }
  }
}

/**
 * Preserve adapter-owned stream traces. For a buffer target, the runner itself is the observer: the
 * complete buffer becomes externally visible only after the adapter call resolves, so one
 * runner-timestamped buffer observation is real evidence rather than reconstructed telemetry.
 */
async function observeStreamingRuntimeEvidence(
  scenario: Scenario,
  output: MediaBytes,
  operationStartMs: number,
  phase: OperationPhase,
): Promise<StreamingRuntimeEvidence | undefined> {
  const recognition = recognizeStreamingScenarioContract(scenario);
  if (!recognition.matched || recognition.state !== 'OK') return undefined;

  const adapterEvidence = readStreamingRuntimeEvidence(output);
  if (adapterEvidence.state === 'OK') return adapterEvidence.evidence;
  if (recognition.contract.output.target === 'stream') return undefined;

  const sink = new BoundedStreamingSink({
    target: 'buffer',
    operationStartMs,
    now: () => performance.now(),
  });
  await sink.write(output.bytes);
  const boundedTrace = await sink.finalize();
  const sinkTrace = Object.freeze({
    ...boundedTrace,
    // The returned MediaBytes remains live through oracle/metric consumption. State that actual
    // retention instead of claiming the bounded prefix/tail owned by the observation helper.
    maximumQueuedBytes: Math.max(boundedTrace.maximumQueuedBytes, output.bytes.byteLength),
    retainedOutputBytes: output.bytes.byteLength,
  });
  return Object.freeze({
    schema: STREAMING_RUNTIME_EVIDENCE_SCHEMA,
    sinkTrace,
    resolvedRepresentation: recognition.contract.output.representation,
    observerPolicy: 'runner-owned-buffer-observer-v1',
    retainedOutputPolicy: phase === 'functional'
      ? 'functional-materialized-output'
      : 'measurement-materialized-output',
    measurementContract: 'streaming-output-v1',
  });
}

/**
 * Join feature-specific sink/container checks to the already executed semantic oracle layer. The
 * combined outcome embeds every original decision and becomes the one top-level streaming verdict,
 * preventing an unrelated sibling PASS from masking a required-layer ERROR.
 */
async function assessStreamingOracleBoundary(
  scenario: Scenario,
  opResult: OpResult,
  outcomes: readonly OracleOutcome[],
  signal: AbortSignal,
): Promise<OracleOutcome | undefined> {
  const recognition = recognizeStreamingScenarioContract(scenario);
  if (!recognition.matched) return undefined;

  const containerOutcome = outcomes.find((outcome) =>
    outcome.oracle === 'mp4-box-layout' || outcome.oracle === 'webm-live-layout') ??
    outcomes.find((outcome) => outcome.oracle === 'reference-reimport');
  const semanticCandidates = outcomes.filter((outcome) =>
    outcome.oracle !== 'mp4-box-layout' && outcome.oracle !== 'webm-live-layout');
  const semanticReduction = semanticCandidates.length > 0
    ? reduceOracleOutcomes(semanticCandidates)
    : undefined;
  const mediaSemantics: StreamingDecision = semanticReduction?.decisive
    ? streamingDecisionFromOracleOutcome(semanticReduction.decisive)
    : streamingError(
        'STREAMING_MEDIA_SEMANTICS_EVIDENCE_MISSING',
        'no executed semantic oracle was available for the streaming-output cell',
      );
  const browserAppend = recognition.state === 'OK' && recognition.contract.requiresBrowserAppend && opResult.output
    ? await probeStreamingBrowserAppend({
        bytes: opResult.output.bytes,
        mime: opResult.output.mime,
        representation: recognition.contract.output.representation,
        cmaf: recognition.contract.cmaf,
        signal,
      })
    : undefined;
  const assessment = await assessStreamingRuntime({
    scenario,
    output: opResult.output,
    runtimeEvidence: opResult.streamingRuntimeEvidence,
    applicability: streamingVerdict(
      'PASS',
      'STREAMING_TUPLE_APPLICABLE',
      'coarse and concrete adapter support accepted the complete operation tuple',
    ),
    mediaSemantics,
    ...(containerOutcome
      ? { containerValidity: streamingDecisionFromOracleOutcome(containerOutcome) }
      : {}),
    ...(browserAppend ? { browserAppend } : {}),
  });
  const disposition = streamingRuntimeToCoreDisposition(assessment, 'property-invariant');
  if (disposition.kind === 'IGNORED') return undefined;
  if (disposition.kind === 'ORACLE_OUTCOME') return disposition.outcome;
  return {
    state: 'ERROR',
    oracle: 'property-invariant',
    reasonCode: 'STREAMING_APPLICABILITY_CHANNEL_INVALID',
    detail: `${disposition.reasonCode}: ${disposition.detail}`,
  };
}

/** Parse the one shared selector grammar once before any adapter sees mux options. */
function canonicalMuxDispatchOptions(options: Scenario['options'], inputCount: number): Record<string, unknown> {
  const normalized = { ...((options ?? {}) as Record<string, unknown>) };
  if (!Array.isArray(normalized.trackSelect)) return normalized;
  const selectors = normalized.trackSelect.map((value, index) => {
    if (typeof value !== 'string') throw new TypeError(`mux trackSelect[${index}] must be a string`);
    return parseMuxTrackSelector(value);
  });
  if (inputCount > 1 && selectors.some((selector) => selector.sourceIndex === undefined)) {
    throw new TypeError('multi-source mux selectors must include @SOURCE');
  }
  const canonical = selectors.map((selector) => selector.canonical);
  if (new Set(canonical).size !== canonical.length) throw new TypeError('mux trackSelect duplicates a selected source track');
  normalized.trackSelect = canonical;
  return normalized;
}

// ── Bench measurement context per op ─────────────────────────────────────────────────────────────

/** Best-effort media duration (sec) for throughput×realtime, from golden meta then probe result. */
function mediaSecFromContext(
  golden: GoldenStore,
  opResult: OpResult,
  scenario: Scenario,
): number | undefined {
  const goldenDur = golden.meta?.durationSec;
  const probedDur = opResult.metadata?.durationSec;
  if (scenario.op === 'decrypt') {
    const selected = objectOptionRoot(scenario.options).selectedDurationSec;
    const duration = resolveDecryptDuration({
      ...(typeof selected === 'number' ? { selectedCatalogDurationSec: selected } : {}),
      ...(typeof goldenDur === 'number' ? { bakedGoldenDurationSec: goldenDur } : {}),
      ...(typeof probedDur === 'number' ? { neutralProbeDurationSec: probedDur } : {}),
      selectedIsBaked: typeof selected !== 'number',
    });
    return duration.state === 'READY' ? duration.durationSec : undefined;
  }
  if (typeof goldenDur === 'number' && goldenDur > 0) return goldenDur;
  if (typeof probedDur === 'number' && probedDur > 0) return probedDur;
  return undefined;
}

function decodeFrameGoldenGap(
  scenario: Scenario,
  golden: GoldenStore,
): { status: 'NA_ASSET' | 'ERROR'; reason: string } | null {
  if (scenario.op !== 'decodeFrames') return null;
  if (!scenario.oracles.some((oracle) => oracle === 'ssim-psnr' || oracle === 'decoded-frames-bitexact')) {
    return null;
  }
  const hasFrames = (golden.frames?.length ?? 0) > 0;
  const hasSsimRef = (golden.ssimRef?.length ?? 0) > 0;
  if (hasFrames || hasSsimRef) return null;
  const blocked = [golden.evidence.frames, golden.evidence.ssim];
  const failure = blocked.find((item) => item.state !== 'MISSING' && item.state !== 'PENDING');
  if (failure && failure.state !== 'OK') {
    const unavailable =
      failure.state === 'DIGEST_MISMATCH' ||
      failure.state === 'PRODUCER_FAILED' ||
      failure.typedState === 'absent-expected' ||
      failure.typedState === 'pending' ||
      failure.typedState === 'digest-mismatch' ||
      failure.typedState === 'producer-failed';
    return {
      status: unavailable ? 'NA_ASSET' : 'ERROR',
      reason: `[${failure.reasonCode}] decodeFrames golden evidence is ${failure.state}`,
    };
  }
  if (failure?.state === 'OK') {
    return { status: 'ERROR', reason: 'decodeFrames committed golden evidence is empty' };
  }
  return {
    status: 'NA_ASSET',
    reason: 'decodeFrames oracle unavailable: committed frame evidence is missing or pending',
  };
}

export type PixelBehaviorEvidence =
  | {
      state: 'SUPPORTED';
      reasonCode: 'PIXEL_RGBA_ROUNDTRIP_OK';
      detail: string;
    }
  | {
      state: 'UNSUPPORTED';
      reasonCode: 'PIXEL_API_UNAVAILABLE' | 'PIXEL_RGBA_ROUNDTRIP_MISMATCH' | 'PIXEL_SELF_TEST_FAILED';
      detail: string;
    };

/**
 * Execute the behavior needed by strict pixel oracles. No browser-family/UA branch is consulted:
 * identical behavior receives an identical decision in Chromium, WebKit, Firefox, and Workers.
 */
export async function runPixelBehaviorSelfTest(): Promise<PixelBehaviorEvidence> {
  if (typeof VideoFrame !== 'function') {
    return {
      state: 'UNSUPPORTED',
      reasonCode: 'PIXEL_API_UNAVAILABLE',
      detail: 'VideoFrame is unavailable for an RGBA copy round trip',
    };
  }
  const expected = new Uint8Array([
    255, 0, 0, 255,
    0, 255, 0, 128,
    0, 0, 255, 64,
    17, 31, 47, 0,
  ]);
  let frame: VideoFrame | undefined;
  try {
    frame = new VideoFrame(expected, {
      format: 'RGBA',
      codedWidth: 2,
      codedHeight: 2,
      timestamp: 0,
    });
    const size = frame.allocationSize({ format: 'RGBA' });
    const actual = new Uint8Array(size);
    await frame.copyTo(actual, { format: 'RGBA' });
    if (actual.byteLength !== expected.byteLength || actual.some((value, index) => value !== expected[index])) {
      return {
        state: 'UNSUPPORTED',
        reasonCode: 'PIXEL_RGBA_ROUNDTRIP_MISMATCH',
        detail: `VideoFrame RGBA copy changed the focused 2x2 pattern (${actual.byteLength} vs ${expected.byteLength} bytes)`,
      };
    }
    return {
      state: 'SUPPORTED',
      reasonCode: 'PIXEL_RGBA_ROUNDTRIP_OK',
      detail: 'VideoFrame preserved the focused RGBA pattern byte-for-byte',
    };
  } catch (error) {
    return {
      state: 'UNSUPPORTED',
      reasonCode: 'PIXEL_SELF_TEST_FAILED',
      detail: `executed VideoFrame RGBA self-test failed: ${errMessage(error)}`,
    };
  } finally {
    frame?.close();
  }
}

function decodeFrameStrictRgbaGap(scenario: Scenario, pixel: PixelBehaviorEvidence): string | null {
  if (pixel.state === 'SUPPORTED') return null;
  if (scenario.op !== 'decodeFrames') return null;
  if (!scenario.oracles.some((oracle) => oracle === 'ssim-psnr' || oracle === 'decoded-frames-bitexact')) {
    return null;
  }
  return `[${pixel.reasonCode}] ${pixel.detail}`;
}

async function strictPixelBrowserGap(
  scenario: Scenario,
  pixel: PixelBehaviorEvidence,
  primaryAssetId: string,
  primaryGolden: GoldenStore,
  browser: BrowserName,
  fixtureIntegrityRuntime?: ActiveFixtureRuntime,
): Promise<string | null> {
  if (
    scenarioUsesReferencePixels(scenario) &&
    (scenario.oracles.includes('ssim-psnr') || scenario.oracles.includes('fanout-renditions'))
  ) {
    if (pixel.state !== 'SUPPORTED') {
      return `[${pixel.reasonCode}] ${pixel.detail}`;
    }
  }

  if (pixel.state === 'SUPPORTED') return null;

  const primaryHasSsim = (primaryGolden.ssimRef?.length ?? 0) > 0;
  const primaryHasFrames = (primaryGolden.frames?.length ?? 0) > 0;
  const usesGoldenSsim =
    scenario.oracles.includes('ssim-psnr') || scenario.oracles.includes('fanout-renditions');
  if (usesGoldenSsim && (primaryHasSsim || primaryHasFrames)) {
    return `[${pixel.reasonCode}] ${pixel.detail}`;
  }

  if (scenario.oracles.includes('decoded-frames-bitexact') && primaryHasFrames) {
    return `[${pixel.reasonCode}] ${pixel.detail}`;
  }

  if (scenario.oracles.includes('decrypt-bitexact')) {
    const golden = await loadFrameComparisonGoldenForScenario(
      scenario,
      primaryAssetId,
      primaryGolden,
      browser,
      fixtureIntegrityRuntime,
    );
    if ((golden.frames?.length ?? 0) > 0) {
      return `[${pixel.reasonCode}] ${pixel.detail}`;
    }
  }

  if (scenario.oracles.includes('property-invariant') && propertyInvariantUsesDecodeFrames(scenario)) {
    const golden = await loadFrameComparisonGoldenForScenario(
      scenario,
      primaryAssetId,
      primaryGolden,
      browser,
      fixtureIntegrityRuntime,
    );
    if ((golden.frames?.length ?? 0) > 0) {
      return `[${pixel.reasonCode}] ${pixel.detail}`;
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
  fixtureIntegrityRuntime?: ActiveFixtureRuntime,
): Promise<GoldenStore> {
  const assetId = readStringOption(scenario.options, [
    'cleartextAsset',
    'cleartextAssetId',
    'goldenAsset',
    'goldenAssetId',
  ]) ?? primaryAssetId;
  if (browser !== 'chromium' && browser !== 'brave') {
    const browserGolden = await loadGoldenForRun(`${assetId}.${browser}`, fixtureIntegrityRuntime, ['frames']);
    if ((browserGolden.frames?.length ?? 0) > 0) return browserGolden;
  }
  if (assetId === primaryAssetId) return primaryGolden;
  return loadGoldenForRun(assetId, fixtureIntegrityRuntime, ['frames']);
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
  pixelBehavior: PixelBehaviorEvidence,
  fixtureIntegrityRuntime: ActiveFixtureRuntime,
  prepareSelection: PrepareSelection,
  cachedAggregate?: ScenarioResult,
): Promise<ScenarioResult> {
  // The aggregate result MUST carry the engine's INSTANCE id (engine.id) — the same id runOne stamps on
  // every non-exhaustive result and the same id the UI lays its columns out with. Using the registry
  // `engineId` here (e.g. 'ffmpeg-wasm' vs the instance 'ffmpeg.wasm@0.12.15') left the cell unmatched,
  // so it never filled and the running-spinner stuck on it. Captured before runOne disposes firstEngine.
  const instanceId = firstEngine.id ?? engineId;
  const isolateFiles = scenarioRequiresRobustnessIsolation(scenario);
  if (isolateFiles) await disposeConstructedEngine(firstEngine, opts.signal);
  let firstEngineAvailable = !isolateFiles;

  const perFile: Array<{ sel: ScenarioSelection; result: ScenarioResult }> = [];
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]!;
    const fileLabel = `${scenario.id} / ${instanceId} / ${candidate.selectedFile}`;
    opts.onFileProgress?.(i, candidates.length, fileLabel);
    try {
      if (opts.signal?.aborted) {
        perFile.push({
          sel: candidate,
          result: {
            engineId: instanceId,
            browser: opts.browser,
            scenarioId: scenario.id,
            family: scenario.family,
            status: 'SKIPPED',
            oracleOutcomes: [],
            reason: '[RUN_CANCELLED_BEFORE_VARIANT] input identity retained but not executed',
            measurement: { state: 'NOT_REQUESTED' },
            env: { ...runEnvBase, engineId: instanceId },
          },
        });
        continue;
      }
      // Verify only the candidate that is about to execute. Keeping preparation inside this serial
      // file loop bounds live corpus bytes to one exhaustive variant instead of retaining the whole
      // candidate set (or, worse, the whole run) before the first result can be produced.
      const prepared = await prepareSelection(candidate);
      if (prepared.state !== 'VERIFIED') {
        perFile.push({
          sel: candidate,
          result: blockedSelectionResult(
            instanceId,
            opts.browser,
            candidate.effectiveScenario,
            candidate,
            prepared,
            runEnvBase,
            opts.randomSeed,
          ),
        });
        continue;
      }
      const sel = prepared.selection;
      const cachedResult = cachedExhaustiveVariant(cachedAggregate, sel, instanceId, opts.browser, scenario);
      if (isolateFiles) {
        const runOneOpts: RunOneOptions = {
          browser: opts.browser,
          pillar,
          env: { ...runEnvBase, engineId },
          resolvedInputs: [...prepared.resolvedInputs],
          selection: resultSelectionFor(sel, candidates.length),
          ...(sel.evidencePlan ? { selectionEvidencePlan: sel.evidencePlan } : {}),
          ...(opts.randomSeed !== undefined ? { runSeed: opts.randomSeed } : {}),
          ...(opts.signal ? { signal: opts.signal } : {}),
          pixelBehavior,
          ...(prepared.verifiedStreamContents
            ? { verifiedStreamContents: prepared.verifiedStreamContents }
            : { verifiedContents: prepared.verified }),
          ...(prepared.decryptKeyOverride ? { decryptKeyOverride: prepared.decryptKeyOverride } : {}),
          ...(cachedResult ? { cachedResult } : {}),
        };
        const result = await runRobustnessCellInWorker(
          engineId,
          instanceId,
          sel.effectiveScenario,
          support,
          opts,
          runOneOpts,
        );
        perFile.push({ sel, result });
        continue;
      }
      let engine: MediaEngine;
      try {
        if (firstEngineAvailable) {
          firstEngineAvailable = false;
          engine = firstEngine;
        } else {
          engine = await reg.factory();
        }
      } catch (error) {
        perFile.push({
          sel,
          result: {
            engineId: instanceId,
            browser: opts.browser,
            scenarioId: scenario.id,
            family: scenario.family,
            status: 'ERROR',
            oracleOutcomes: [],
            reason: `failed to construct engine for variant: ${errMessage(error)}`,
            measurement: { state: 'NOT_REQUESTED' },
            env: { ...runEnvBase, engineId: instanceId },
          },
        });
        continue;
      }
      const runOneOpts: RunOneOptions = {
        browser: opts.browser,
        pillar,
        env: { ...runEnvBase, engineId },
        decodeWithPlatform: opts.decodeWithPlatform ?? decodeBytesToFrames,
        playbackSmoke: opts.playbackSmoke ?? platformPlaybackSmoke,
        gaplessNativeEvidence: opts.gaplessNativeEvidence ?? collectGaplessNativeEvidence,
        ...(opts.benchOptions ? { benchOptions: opts.benchOptions } : {}),
        resolvedInputs: [...prepared.resolvedInputs],
        selection: resultSelectionFor(sel, candidates.length),
        ...(sel.evidencePlan ? { selectionEvidencePlan: sel.evidencePlan } : {}),
        ...(opts.randomSeed !== undefined ? { runSeed: opts.randomSeed } : {}),
        ...(opts.signal ? { signal: opts.signal } : {}),
        pixelBehavior,
        fixtureIntegrityRuntime,
        ...(prepared.verifiedStreamContents
          ? { verifiedStreamContents: prepared.verifiedStreamContents }
          : { verifiedContents: prepared.verified }),
        ...(prepared.decryptKeyOverride ? { decryptKeyOverride: prepared.decryptKeyOverride } : {}),
        ...(cachedResult ? { cachedResult } : {}),
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
    } finally {
      opts.onFileProgress?.(i + 1, candidates.length, fileLabel);
    }
  }

  if (firstEngineAvailable) await disposeConstructedEngine(firstEngine, opts.signal);

  return aggregateExhaustive(instanceId, opts.browser, scenario, perFile, runEnvBase, opts.randomSeed);
}

function cachedExhaustiveVariant(
  aggregate: ScenarioResult | undefined,
  selection: ScenarioSelection,
  engineId: string,
  browser: BrowserName,
  scenario: Scenario,
): ScenarioResult | undefined {
  const row = aggregate?.exhaustive?.find((entry) => {
    if (entry.file !== selection.selectedFile || entry.isBaked !== selection.isBaked) return false;
    if (selection.selectedSha256 && entry.sha256 !== selection.selectedSha256) return false;
    const expectedDigest = selection.executedInputDigest;
    return !expectedDigest || !entry.selection?.executedInputDigest ||
      entry.selection.executedInputDigest === expectedDigest;
  });
  if (!row?.executionFingerprint) return undefined;
  return {
    engineId,
    browser,
    scenarioId: scenario.id,
    family: scenario.family,
    status: row.status,
    oracleOutcomes: row.oracleOutcomes,
    ...(row.reason ? { reason: row.reason } : {}),
    ...(row.bench ? { bench: row.bench } : {}),
    ...(row.measurement ? { measurement: row.measurement } : {}),
    ...(row.support ? { support: row.support } : {}),
    ...(row.selection ? { selection: row.selection } : {}),
    ...(row.operationEvidence ? { operationEvidence: row.operationEvidence } : {}),
    ...(row.candidateEvidence ? { candidateEvidence: row.candidateEvidence } : {}),
    ...(row.cacheReuse ? { cacheReuse: row.cacheReuse } : {}),
    executionFingerprint: row.executionFingerprint,
    ...(aggregate?.env ? { env: aggregate.env } : {}),
    ...(aggregate?.primaryMetric ? { primaryMetric: aggregate.primaryMetric } : {}),
  };
}

export interface ExhaustiveOutcomeCounts {
  pass: number;
  fail: number;
  error: number;
  naEngine: number;
  naBrowser: number;
  naAsset: number;
  skipped: number;
  total: number;
}

export interface ExhaustiveReduction {
  status: ScenarioResult['status'];
  grade: 'full' | 'partial' | 'none';
  valid: number;
  counts: ExhaustiveOutcomeCounts;
}

/** Pure, order-independent exhaustive precedence and coverage grade. */
export function reduceExhaustiveStatuses(
  statuses: readonly ScenarioResult['status'][],
): ExhaustiveReduction {
  const count = (status: ScenarioResult['status']): number => statuses.filter((item) => item === status).length;
  const counts: ExhaustiveOutcomeCounts = {
    pass: count('PASS'),
    fail: count('FAIL'),
    error: count('ERROR'),
    naEngine: count('NA_ENGINE'),
    naBrowser: count('NA_BROWSER'),
    naAsset: count('NA_ASSET'),
    skipped: count('SKIPPED'),
    total: statuses.length,
  };
  const valid = counts.pass;
  const grade: ExhaustiveReduction['grade'] =
    statuses.length > 0 && valid === statuses.length ? 'full' : valid > 0 ? 'partial' : 'none';
  // Executed variants: wrong output outranks harness inability, then a correctness-valid result.
  const status: ScenarioResult['status'] =
    counts.fail > 0
      ? 'FAIL'
      : counts.error > 0
        ? 'ERROR'
        : counts.pass > 0
            ? 'PASS'
            // No variant executed. Pick the deterministic pre-execution blocker precedence.
            : counts.naEngine > 0
              ? 'NA_ENGINE'
              : counts.naBrowser > 0
                ? 'NA_BROWSER'
                : counts.naAsset > 0
                  ? 'NA_ASSET'
                  : 'SKIPPED';
  return { status, grade, valid, counts };
}

/**
 * Aggregate per-file results into ONE cell (§6.2/§9). CORRECTNESS = logical AND: any admissible
 * FAIL/ERROR ⇒ the cell FAILs/ERRORs and names the offending file(s) (a FAIL is NEVER averaged into a
 * pass); all admissible PASS ⇒ PASS; no admissible file (all NA_*) ⇒ carry the NA kind. PERFORMANCE =
 * for a correctness-valid aggregate, summarizeAcrossFiles per metric — `.aggregate` COMBINES the
 * passing files (SUM for additive cost metrics, MAX for peakMemory, MEDIAN for rate metrics) while
 * `.samples` keeps the per-file spread. A FAIL/ERROR aggregate publishes no headline benchmark;
 * each passing member's numbers remain in `exhaustive[]`. `coverage` records
 * passed/admissible/total so winners rank coverage-first. The `exhaustive[]` array preserves every
 * file's verdict + numbers so the spread is visible and a FAIL traces to its bytes.
 */
export function aggregateExhaustive(
  engineId: string,
  browser: BrowserName,
  scenario: Scenario,
  perFile: Array<{ sel: ScenarioSelection; result: ScenarioResult }>,
  runEnvBase: RunEnv,
  runSeed: string | undefined,
): ScenarioResult {
  type DetailedFile = ExhaustiveFileResult & {
    oracleOutcomes: OracleOutcome[];
    measurement?: ScenarioResult['measurement'];
    support?: ScenarioResult['support'];
    selection?: ScenarioResult['selection'];
    executed: boolean;
  };
  const files: DetailedFile[] = perFile.map(({ sel, result }) => ({
    file: sel.selectedFile,
    ...(sel.selectedSha256 ? { sha256: sel.selectedSha256 } : {}),
    isBaked: sel.isBaked,
    status: result.status,
    ...(result.reason ? { reason: result.reason } : {}),
    ...(result.bench ? { bench: result.bench } : {}),
    oracleOutcomes: result.oracleOutcomes,
    ...(result.measurement ? { measurement: result.measurement } : {}),
    ...(result.support ? { support: result.support } : {}),
    ...(result.executionFingerprint ? { executionFingerprint: result.executionFingerprint } : {}),
    ...(result.selection ? { selection: result.selection } : {}),
    ...(result.operationEvidence ? { operationEvidence: result.operationEvidence } : {}),
    ...(result.candidateEvidence ? { candidateEvidence: result.candidateEvidence } : {}),
    ...(result.cacheReuse ? { cacheReuse: result.cacheReuse } : {}),
    executed: !(
      result.status === 'SKIPPED' &&
      result.reason?.includes('[RUN_CANCELLED_BEFORE_VARIANT]') === true
    ),
  }));
  const reduction = reduceExhaustiveStatuses(perFile.map((entry) => entry.result.status));
  const executed = perFile.filter((entry) =>
    entry.result.status === 'PASS' ||
    entry.result.status === 'FAIL' ||
    entry.result.status === 'ERROR'
  );
  const valid = perFile.filter((entry) => entry.result.status === 'PASS');
  const decisive = perFile
    .filter((entry) => entry.result.status === reduction.status)
    .sort((a, b) => a.sel.selectedFile.localeCompare(b.sel.selectedFile));
  const allOutcomes = perFile.flatMap((entry) => entry.result.oracleOutcomes);
  const aggregateBench = aggregateBenchAcrossFiles(valid.map((entry) => entry.result.bench));
  const measuredDurations = perFile
    .map((entry) => entry.result.durationMs)
    .filter((duration): duration is number =>
      typeof duration === 'number' && Number.isFinite(duration) && duration >= 0);
  // Exhaustive variants execute serially. Preserve their summed cell cost as the functional fallback
  // when a long-form/failed/partially-covered cell has no admissible benchmark summary. Previously the
  // aggregate discarded every per-file duration, leaving the live matrix with only PASS/FAIL/Partial.
  const durationMs = measuredDurations.length > 0
    ? measuredDurations.reduce((total, duration) => total + duration, 0)
    : undefined;
  const unavailableMeasurement = valid.find((entry) => entry.result.measurement?.state === 'UNAVAILABLE');
  const measuredMetrics = new Set<MetricId>();
  for (const entry of valid) {
    if (entry.result.measurement?.state === 'AVAILABLE') {
      for (const metric of entry.result.measurement.metrics) measuredMetrics.add(metric);
    }
  }
  const hasMemberPerformanceEvidence = aggregateBench !== undefined || valid.some((entry) =>
    entry.result.measurement?.state === 'AVAILABLE' ||
    entry.result.measurement?.state === 'UNAVAILABLE');
  const measurement: ScenarioResult['measurement'] =
    reduction.status !== 'PASS' && hasMemberPerformanceEvidence
      ? {
          state: 'UNAVAILABLE',
          reasonCode: 'EXHAUSTIVE_CORRECTNESS_GATE',
          detail:
            `aggregate status ${reduction.status} is not benchmark-eligible; ` +
            'passing-member measurements remain in exhaustive[]',
        }
      : unavailableMeasurement
        ? {
            state: 'UNAVAILABLE',
            reasonCode: 'EXHAUSTIVE_MEASUREMENT_PARTIAL',
            detail: `${unavailableMeasurement.sel.selectedFile}: ${
              unavailableMeasurement.result.measurement?.state === 'UNAVAILABLE'
                ? unavailableMeasurement.result.measurement.detail
                : 'measurement unavailable'
            }`,
          }
        : measuredMetrics.size > 0
          ? { state: 'AVAILABLE', metrics: [...measuredMetrics].sort() }
          : { state: 'NOT_REQUESTED' };

  const coverage = {
    // Legacy names remain populated for existing consumers; valid is PASS (correctness is binary).
    passed: reduction.valid,
    admissible: executed.length,
    total: reduction.counts.total,
    valid: reduction.valid,
    grade: reduction.grade,
    counts: reduction.counts,
  };

  const selectionIdentities = perFile.map(({ sel }) => ({
    candidateIdentity: sel.candidateIdentity ?? null,
    executedInputDigest: sel.executedInputDigest ?? sel.selectedSha256 ?? null,
    evidenceContractDigest: sel.evidencePlan?.contractDigest ?? null,
  })).sort((a, b) => stableCanonicalString(a).localeCompare(stableCanonicalString(b)));
  const firstSelection = perFile[0]?.sel;
  const aggregateSelection: NonNullable<ScenarioResult['selection']> = {
    file: `${perFile.length} files (exhaustive)`,
    isBaked: files.length > 0 && files.every((f) => f.isBaked),
    ...(runSeed !== undefined ? { runSeed } : {}),
    candidateCount: perFile.length,
    ...(firstSelection?.eligiblePoolDigest
      ? { eligiblePoolDigest: firstSelection.eligiblePoolDigest }
      : {}),
    executedInputDigest: canonicalJsonSha256({
      schema: 'media-test/exhaustive-executed-input@1',
      inputs: selectionIdentities.map((identity) => identity.executedInputDigest),
    }),
    candidateIdentity: canonicalJsonSha256({
      schema: 'media-test/exhaustive-candidates@1',
      candidates: selectionIdentities.map((identity) => identity.candidateIdentity),
    }),
    ...(firstSelection?.selectionPolicyVersion
      ? { selectionPolicyVersion: firstSelection.selectionPolicyVersion }
      : {}),
    ...(firstSelection?.selectionAlgorithmId
      ? { selectionAlgorithmId: firstSelection.selectionAlgorithmId }
      : {}),
    evidenceContractDigest: canonicalJsonSha256({
      schema: 'media-test/exhaustive-evidence-contracts@1',
      contracts: selectionIdentities.map((identity) => identity.evidenceContractDigest),
    }),
    ...(firstSelection?.catalogState ? { catalogState: firstSelection.catalogState } : {}),
    ...(firstSelection?.catalogReason ? { catalogReason: firstSelection.catalogReason } : {}),
  };

  const base: Omit<ScenarioResult, 'status' | 'oracleOutcomes'> = {
    engineId,
    browser,
    scenarioId: scenario.id,
    family: scenario.family,
    exhaustive: files as ExhaustiveFileResult[],
    // §6.2 coverage: how many candidate files this engine was actually scored over. `passed` are the
    // files eligible for bench.<metric>.aggregate when the cell itself PASSes;
    // `admissible` = PASS+FAIL+ERROR (real signal); `total` = every candidate offered. The report
    // ranks winners coverage-FIRST (higher passed wins).
    coverage: coverage as ScenarioResult['coverage'],
    // Representative provenance: this cell spanned N files (per-file detail is in `exhaustive`).
    selection: aggregateSelection,
    env: { ...runEnvBase, engineId },
    measurement,
    ...(perFile[0]?.result.startedAtIso ? { startedAtIso: perFile[0].result.startedAtIso } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(perFile[0]?.result.primaryMetric ? { primaryMetric: perFile[0].result.primaryMetric } : {}),
  };
  const diagnostics = decisive
    .map((entry) => `${entry.sel.selectedFile}(${entry.result.status})${entry.result.reason ? `: ${entry.result.reason}` : ''}`)
    .join('; ');
  return {
    ...base,
    status: reduction.status,
    oracleOutcomes: allOutcomes,
    reason:
      `coverage ${reduction.grade} ${reduction.valid}/${reduction.counts.total}; ` +
      (diagnostics || 'no executed variant produced a decisive diagnostic'),
    ...(reduction.status === 'PASS' && aggregateBench ? { bench: aggregateBench } : {}),
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
  let supportEvidence: ScenarioResult['support'];
  // The reusable observation key is frozen after all current preflight gates and before functional
  // execution. Adapter configUsed commonly gains operation counters/telemetry later; those facts
  // remain truthful env evidence but must not replace the key that a future preflight can compute.
  let executionFingerprint: ExecutionFingerprint | undefined;
  let pixelBehavior: PixelBehaviorEvidence = opts?.pixelBehavior ?? {
    state: 'UNSUPPORTED',
    reasonCode: 'PIXEL_API_UNAVAILABLE',
    detail: 'pixel behavior self-test has not run',
  };
  let lastFinalized: FingerprintedScenarioResult | undefined;
  let candidateEvidence: ScenarioResult['candidateEvidence'];
  let decodeProvenance: DecodeResultProvenance | undefined;
  const configSnapshots = new ConfigUsedSnapshots(engine.id);
  let measuredPhaseStarted = false;
  const verifiedObjectUrls: string[] = [];
  const operationTimeoutMs = scenario.timeoutMs && scenario.timeoutMs > 0
    ? scenario.timeoutMs
    : DEFAULT_OP_TIMEOUT_MS;
  const hardDeadlineMs =
    DEFAULT_INIT_TIMEOUT_MS +
    operationTimeoutMs * (scenario.oracles.length + 2) +
    (wantsPerformance ? DEFAULT_BENCH_TIMEOUT_MS : 0) +
    DEFAULT_CLEANUP_TIMEOUT_MS;
  const cancellation = createCancellationScope(opts?.signal, hardDeadlineMs);
  const fixtureIntegrityRuntime = opts?.fixtureIntegrityRuntime;
  const operationScenario = scenario.op === 'decrypt' && opts?.decryptKeyOverride
    ? {
        ...scenario,
        options: {
          ...(recordOption(scenario.options) ?? {}),
          key: { ...opts.decryptKeyOverride },
        },
      }
    : scenario;
  const requestedGoldenKinds = goldenKindsForScenario(operationScenario);

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
            ...(opts.selection.eligiblePoolDigest
              ? { eligiblePoolDigest: opts.selection.eligiblePoolDigest }
              : {}),
            ...(opts.selection.executedInputDigest
              ? { executedInputDigest: opts.selection.executedInputDigest }
              : {}),
            ...(opts.selection.candidateIdentity
              ? { candidateIdentity: opts.selection.candidateIdentity }
              : {}),
            ...(opts.selection.selectionPolicyVersion
              ? { selectionPolicyVersion: opts.selection.selectionPolicyVersion }
              : {}),
            ...(opts.selection.selectionAlgorithmId
              ? { selectionAlgorithmId: opts.selection.selectionAlgorithmId }
              : {}),
            ...(opts.selection.score ? { score: opts.selection.score } : {}),
            ...(opts.selection.probability ? { probability: opts.selection.probability } : {}),
            ...(opts.selection.evidenceContractDigest
              ? { evidenceContractDigest: opts.selection.evidenceContractDigest }
              : {}),
            ...(opts.selection.catalogState ? { catalogState: opts.selection.catalogState } : {}),
            ...(opts.selection.catalogReason ? { catalogReason: opts.selection.catalogReason } : {}),
          },
        }
      : {}),
  };

  const finalize = (
    status: ScenarioResult['status'],
    oracleOutcomes: OracleOutcome[],
    reason?: string,
    bench?: ScenarioResult['bench'],
    measurement?: ScenarioResult['measurement'],
  ): ScenarioResult => {
    const result: FingerprintedScenarioResult = {
      ...base,
      status,
      oracleOutcomes,
      ...(reason !== undefined ? { reason } : {}),
      ...(bench !== undefined ? { bench } : {}),
      ...(measurement !== undefined ? { measurement } : {}),
      ...(supportEvidence !== undefined ? { support: supportEvidence } : {}),
      ...(executionFingerprint !== undefined ? { executionFingerprint } : {}),
      ...(candidateEvidence ? { candidateEvidence } : {}),
      ...(decodeProvenance ? { decodeProvenance } : {}),
      durationMs: Date.now() - startedAt,
    };
    lastFinalized = result;
    return result;
  };

  try {
    // §6.4: when the caller passed rotated resolvedInputs, THEY are authoritative — `id` drives golden
    // (baked flat id resolves; real scenario-dir path 404s) and later `urlAssetPath` drives the bytes.
    // Without them we fall back to the scenario's own baked-by-flat-id input(s).
    const resolvedInputs = opts?.resolvedInputs;
    const operationResolvedInputs = resolvedInputs?.filter((resolved) => resolved.transport === undefined);
    const assetIds =
      operationResolvedInputs && operationResolvedInputs.length > 0
        ? operationResolvedInputs.map((r) => r.id)
        : Array.isArray(scenario.input)
          ? scenario.input
          : [scenario.input];
    if (assetIds.length === 0) {
      return finalize('ERROR', [], 'scenario declares no input asset');
    }
    const activeMediaByLogicalPath = new Map<
      string,
      Extract<ActiveFixtureMediaResult, { state: 'ready' }>
    >();

    // 1) Coarse engine declarations are the first applicability stage. Browser and asset state may
    // never hide an engine that did not even declare the requested operation/shape.
    const caps = validateCapabilitySet(engine, engine.capabilities());
    const neg = negotiateCoarseEngine(caps, scenario.requires);
    if (!neg.ok) {
      return finalize(neg.status, [], neg.reason);
    }

    const probeBudget = probeBudgetFromOptions(scenario.options);
    if (probeBudget && scenario.op !== 'probe') {
      return finalize('ERROR', [], '[PROBE_BUDGET_OPERATION_INVALID] probe budget is attached to a non-probe scenario');
    }
    // Budget applicability must run before verified bytes become Blobs/object URLs and before init.
    // Load at most the small identity manifest here; never touch the media body for this gate.
    if (
      probeBudget &&
      operationResolvedInputs?.[0]?.sizeBytes === undefined &&
      !opts?.verifiedContents?.[0] &&
      !opts?.verifiedStreamContents?.[0]
    ) {
      await fixtureManifestById();
    }
    let probeInputSize = probeBudget
      ? operationResolvedInputs?.[0]?.sizeBytes ??
        opts?.verifiedContents?.find((entry) =>
          entry.identity.logicalPath === (operationResolvedInputs?.[0]?.urlAssetPath ?? assetIds[0]))?.actualSizeBytes ??
        opts?.verifiedStreamContents?.find((entry) =>
          entry.identity.logicalPath === (operationResolvedInputs?.[0]?.urlAssetPath ?? assetIds[0]))?.actualSizeBytes ??
        fixtureManifestCache?.get(assetIds[0]!)?.sizeBytes ??
        undefined
      : undefined;
    const probeMemorySampler = probeBudget
      ? opts?.probeMemorySampler ?? userAgentSpecificMemorySampler()
      : undefined;
    const demuxScaleRequested = readStringOption(scenario.options, ['invariant']) === 'demux-scale-budgets';
    const demuxScaleContract = demuxScaleContractFromOptions(scenario.options);
    if (demuxScaleRequested && !demuxScaleContract) {
      return finalize('ERROR', [], '[DEMUX_SCALE_CONTRACT_MISSING] scale scenario has no valid budget contract');
    }
    if (demuxScaleContract && (scenario.op !== 'demux' || !scenario.oracles.includes('property-invariant'))) {
      return finalize(
        'ERROR',
        [],
        '[DEMUX_SCALE_CONTRACT_ROUTE_INVALID] demux scale contracts require op=demux and property-invariant',
      );
    }
    const demuxScaleMemorySampler = demuxScaleContract
      ? opts?.probeMemorySampler ?? userAgentSpecificMemorySampler()
      : undefined;
    if (demuxScaleMemorySampler?.state === 'UNAVAILABLE') {
      return finalize(
        demuxScaleMemorySampler.status,
        [],
        `[${demuxScaleMemorySampler.reasonCode}] ${demuxScaleMemorySampler.reason}`,
      );
    }
    if (demuxScaleContract) {
      const injected = opts?.demuxScaleLongTaskEnvironment;
      if (injected && Array.isArray(injected.supportedEntryTypes) &&
          !injected.supportedEntryTypes.includes('longtask')) {
        return finalize(
          'NA_BROWSER',
          [],
          "[LONGTASK_ENTRY_TYPE_UNSUPPORTED] PerformanceObserver does not support the 'longtask' entry type",
        );
      }
      if (!injected) {
        try {
          preflightLongTaskMeasurement(true);
        } catch (error) {
          if (error instanceof MeasurementProtocolUnavailable) {
            return finalize(error.status, [], `[${error.reasonCode}] ${error.message}`);
          }
          throw error;
        }
      }
    }

    // Build lazy inputs without touching the network. A tuple-negative supports() decision can now
    // win before browser/asset blockers, while malformed bytes remain uninspected and cannot be
    // over-broadly relabelled as unsupported. When the matrix parent already retained verified
    // content, seal the adapter-visible transport to those exact bytes before supports(): neither a
    // URL-reading supports() implementation nor the operation may re-fetch mutable corpus state.
    let inputs =
      operationResolvedInputs && operationResolvedInputs.length > 0
        ? operationResolvedInputs.map((resolved) =>
            buildMediaInput(
              resolved.id,
              scenario.mutate,
              resolved.urlAssetPath,
              resolved.sizeBytes,
              cancellation.signal,
            ),
          )
        : assetIds.map((id) => buildMediaInput(id, scenario.mutate, undefined, undefined, cancellation.signal));
    let primaryInput = inputs[0]!;
    if (probeBudget) {
      const readModePreflight = probeBudgetPreflight(
        probeBudget,
        Number.isSafeInteger(probeInputSize) ? Number(probeInputSize) : 0,
        caps.probeReadModes ?? ['whole-file'],
      );
      if (!readModePreflight.supported) {
        const error = notApplicableError(
          engine,
          scenario,
          inputs,
          readModePreflight.reasonCode,
          readModePreflight.detail,
        );
        return finalize('NA_ENGINE', [], applicabilityReason(error));
      }
      if (probeMemorySampler?.state === 'UNAVAILABLE') {
        return finalize(
          probeMemorySampler.status,
          [],
          `[${probeMemorySampler.reasonCode}] ${probeMemorySampler.reason}`,
        );
      }
    }
    let materializedVerifiedContents = false;
    if (opts?.verifiedContents && opts.verifiedStreamContents) {
      return finalize('ERROR', [], '[CORPUS_VERIFIED_TRANSPORT_AMBIGUOUS] retained and stream verification were both supplied');
    }
    if (resolvedInputs && resolvedInputs.length > 0 && opts?.verifiedStreamContents) {
      if (!boundedProbeStreamTransportEligible(scenario, resolvedInputs)) {
        return finalize(
          'ERROR',
          [],
          '[CORPUS_STREAM_TRANSPORT_FORBIDDEN] authenticated URL transport is limited to unmutated single-file scale probes',
        );
      }
      if (!supportsAuthenticatedRangeProbeTransport(caps)) {
        return finalize(
          'ERROR',
          [],
          `[CORPUS_STREAM_TRANSPORT_ADAPTER_UNAUTHENTICATED] adapter must declare '${AUTHENTICATED_RANGE_PROBE_FEATURE}' before receiving a digest-bound URL`,
        );
      }
      const declared = resolvedContentIdentities(resolvedInputs);
      if (!declared.identities) {
        return finalize('NA_ASSET', [], declared.reason ?? '[CORPUS_IDENTITY_MISSING] invalid identity');
      }
      const mismatch = verifiedStreamContentsMismatch(declared.identities, opts.verifiedStreamContents);
      if (mismatch) return finalize('NA_ASSET', [], `[CORPUS_VERIFIED_STREAM_MISMATCH] ${mismatch}`);
      inputs = [buildAttestedStreamMediaInput(resolvedInputs[0]!, opts.verifiedStreamContents[0]!)];
      primaryInput = inputs[0]!;
      materializedVerifiedContents = true;
    } else if (resolvedInputs && resolvedInputs.length > 0 && opts?.verifiedContents) {
      const declared = resolvedContentIdentities(resolvedInputs);
      if (!declared.identities) {
        return finalize('NA_ASSET', [], declared.reason ?? '[CORPUS_IDENTITY_MISSING] invalid identity');
      }
      const mismatch = verifiedContentsMismatch(declared.identities, opts.verifiedContents);
      if (mismatch) return finalize('NA_ASSET', [], `[CORPUS_VERIFIED_CONTENT_MISMATCH] ${mismatch}`);
      const materialized = buildVerifiedMediaInputs(resolvedInputs, opts.verifiedContents, scenario.mutate);
      inputs = materialized.inputs;
      verifiedObjectUrls.push(...materialized.objectUrls);
      primaryInput = inputs[0]!;
      materializedVerifiedContents = true;
    }
    const preliminaryGoldens = assetIds.map(() => emptyGoldenStore());
    const preliminaryRequest = buildConcreteOperationRequest(operationScenario, inputs, preliminaryGoldens);
    const preliminary = await cancellation.run(
      (signal) => callWithLifecycleContext(
        engine.id,
        signal,
        'support',
        (context) => evaluateConcreteSupport(engine, preliminaryRequest, {
          context,
        }),
      ),
      operationTimeoutMs,
    );
    if (preliminary.blocker && !bypassDeliberateIllegalMuxTupleBlocker(scenario, preliminary)) {
      supportEvidence = {
        request: preliminaryRequest,
        decision: preliminary.decision.supported
          ? { supported: true }
          : {
              supported: false,
              status: preliminary.decision.status,
              reasonCode: preliminary.decision.reasonCode,
              reason: preliminary.decision.reason,
            },
        browserConfigs: preliminary.browserConfigs,
        probes: preliminary.probeStates,
      };
      return finalize(preliminary.blocker.status, [], preliminary.blocker.reason);
    }

    // 2) Browser behavior/configuration. The strict-pixel decision is executed and contains no UA
    // branch. Exact codec configs are probed again immediately before operation dispatch below.
    pixelBehavior = opts?.pixelBehavior ?? await runPixelBehaviorSelfTest();
    const strictRgbaGap = decodeFrameStrictRgbaGap(scenario, pixelBehavior);
    if (strictRgbaGap) return finalize('NA_BROWSER', [], strictRgbaGap);
    const stillImageContract = imageDecoderContractFromOptions(scenario.options);
    if (stillImageContract) {
      const imageProbe = await cancellation.run(
        () => probeImageDecoder(stillImageContract, opts?.imageDecoderSupportApi),
        operationTimeoutMs,
      );
      if (imageProbe.state === 'UNAVAILABLE') {
        return finalize(imageProbe.status, [], `[${imageProbe.reasonCode}] ${imageProbe.detail}`);
      }
      if (imageProbe.state === 'ERROR') {
        return finalize('ERROR', [], `[${imageProbe.reasonCode}] ${imageProbe.detail}`);
      }
    }

    if (fixtureIntegrityRuntime && !materializedVerifiedContents) {
      const bindings: Array<{
        assetId: string;
        logicalPath: string;
        declaredSha256?: string;
        declaredSizeBytes?: number;
      }> = operationResolvedInputs && operationResolvedInputs.length > 0
        ? operationResolvedInputs.map((resolved) => ({
            assetId: resolved.id,
            logicalPath: resolved.urlAssetPath,
            declaredSha256: resolved.sha256,
            declaredSizeBytes: resolved.sizeBytes,
          }))
        : assetIds.map((assetId) => ({ assetId, logicalPath: assetId }));
      for (const binding of bindings) {
        const active = await cancellation.run(
          () => fixtureIntegrityRuntime.resolveMedia(binding.assetId),
          DEFAULT_INIT_TIMEOUT_MS,
        );
        if (active.state === 'out-of-scope') continue;
        if (active.state !== 'ready') {
          const blocked = activeMediaBlock(active);
          return finalize(blocked.status, [], blocked.reason);
        }
        if (
          binding.declaredSha256 !== undefined &&
          binding.declaredSha256.toLowerCase() !== active.actualSha256
        ) {
          return finalize(
            'NA_ASSET',
            [],
            `[FIXTURE_SELECTED_DIGEST_MISMATCH] '${binding.assetId}' selected identity differs from the active generation`,
          );
        }
        if (
          binding.declaredSizeBytes !== undefined &&
          binding.declaredSizeBytes !== active.bytes.byteLength
        ) {
          return finalize(
            'NA_ASSET',
            [],
            `[FIXTURE_SELECTED_SIZE_MISMATCH] '${binding.assetId}' selected size differs from the active generation`,
          );
        }
        activeMediaByLogicalPath.set(binding.logicalPath, active);
      }
    }

    // 3) Asset/evidence preflight is intentionally after engine + browser applicability.
    // Rotated real files are absent from the baked manifest, so they use a definitive HEAD 404 only.
    if (resolvedInputs && resolvedInputs.length > 0) {
      if (!materializedVerifiedContents) {
        for (const resolved of resolvedInputs) {
          if (activeMediaByLogicalPath.has(resolved.urlAssetPath)) continue;
          const missing = await cancellation.run(
            (signal) => resolvedInputMissingReason(resolved, signal),
            operationTimeoutMs,
          );
          if (missing) return finalize('NA_ASSET', [], `[ASSET_MISSING] ${missing}`);
        }
      }
    } else {
      for (const assetId of assetIds) {
        if (activeMediaByLogicalPath.has(assetId)) continue;
        const missing = await cancellation.run(
          (signal) => missingAssetReason(assetId, signal),
          operationTimeoutMs,
        );
        if (missing) return finalize('NA_ASSET', [], `[ASSET_MISSING] ${missing}`);
      }
    }

    if ((!resolvedInputs || resolvedInputs.length === 0) && activeMediaByLogicalPath.size > 0) {
      inputs = inputs.map((input, index) => {
        const assetId = assetIds[index]!;
        const active = activeMediaByLogicalPath.get(assetId);
        if (!active) return input;
        const resolved: ResolvedInput = {
          id: assetId,
          urlAssetPath: assetId,
          sha256: active.actualSha256,
          sizeBytes: active.bytes.byteLength,
          integrity: 'VERIFIED',
        };
        const delivered = buildVerifiedMediaInput(
          resolved,
          {
            state: 'VERIFIED',
            identity: {
              logicalPath: assetId,
              sha256: active.actualSha256,
              sizeBytes: active.bytes.byteLength,
            },
            bytes: active.bytes,
            actualSha256: active.actualSha256,
            actualSizeBytes: active.bytes.byteLength,
          },
          scenario.mutate,
        );
        verifiedObjectUrls.push(delivered.objectUrl);
        return delivered.input;
      });
      primaryInput = inputs[0]!;
    }

    // The selected catalog identity is a pre-engine execution gate, not report-only metadata. Hash
    // the exact full body once, then build every input surface from those verified bytes so a TOCTOU
    // refetch cannot reach a candidate after eligibility was established.
    if (resolvedInputs && resolvedInputs.length > 0 && !materializedVerifiedContents) {
      const declared = resolvedContentIdentities(resolvedInputs);
      if (!declared.identities) {
        return finalize('NA_ASSET', [], declared.reason ?? '[CORPUS_IDENTITY_MISSING] invalid identity');
      }
      let verifiedContents: readonly VerifiedContent[];
      const verified = await cancellation.run(
        () => withVerifiedContent(
          declared.identities!,
          async (identity) => {
            const active = activeMediaByLogicalPath.get(identity.logicalPath);
            if (active) return active.bytes;
            const response = await fetch(mediaAssetUrl(identity.logicalPath), {
              cache: 'no-store',
              signal: cancellation.signal,
            });
            if (!response.ok) {
              throw new Error(`${response.status} ${response.statusText}`);
            }
            return response.arrayBuffer();
          },
          async (content) => content,
        ),
        DEFAULT_INIT_TIMEOUT_MS,
      );
      if (verified.state === 'NA_ASSET') {
        const reason = verified.issues
          .map((issue) => `[${issue.reasonCode}] ${issue.detail}`)
          .sort()
          .join('; ');
        return finalize('NA_ASSET', [], reason || '[CORPUS_NO_VERIFIED_CANDIDATE] no verified bytes');
      }
      verifiedContents = verified.verified;
      const materialized = buildVerifiedMediaInputs(resolvedInputs, verifiedContents, scenario.mutate);
      inputs = materialized.inputs;
      verifiedObjectUrls.push(...materialized.objectUrls);
      primaryInput = inputs[0]!;
    }
    if (probeBudget) {
      probeInputSize = primaryInput.sizeBytes ?? probeInputSize;
      if (!Number.isSafeInteger(probeInputSize) || Number(probeInputSize) <= 0) {
        return finalize('ERROR', [], '[PROBE_INPUT_SIZE_INVALID] bounded probe needs a verified positive input size');
      }
    }
    const declaredDecodeProvenance = decodeScenarioProvenanceFromOptions(scenario.options);
    if (declaredDecodeProvenance) {
      const selectedResolved = operationResolvedInputs?.[0];
      const manifestEntry = fixtureManifestCache?.get(assetIds[0]!);
      const admission = materializeDecodeResultProvenance(declaredDecodeProvenance, {
        id: primaryInput.id,
        sizeBytes: selectedResolved?.sizeBytes ?? primaryInput.sizeBytes ?? manifestEntry?.sizeBytes ?? undefined,
        sha256: selectedResolved?.sha256 ?? manifestEntry?.sha256 ?? undefined,
      });
      if (admission.state === 'ERROR') {
        return finalize('ERROR', [], `[${admission.reasonCode}] ${admission.detail}`);
      }
      decodeProvenance = admission.value;
    }
    let golden: GoldenStore | undefined;
    if (scenario.op === 'decodeFrames') {
      golden = await cancellation.run(
        () => loadGoldenForRun(assetIds[0]!, fixtureIntegrityRuntime, requestedGoldenKinds),
        operationTimeoutMs,
      );
      const goldenGap = decodeFrameGoldenGap(scenario, golden);
      if (goldenGap) return finalize(goldenGap.status, [], goldenGap.reason);
    }
    if (
      pixelBehavior.state !== 'SUPPORTED' &&
      scenarioMayUseStrictPixelOracle(scenario)
    ) {
      golden ??= await cancellation.run(
        () => loadGoldenForRun(assetIds[0]!, fixtureIntegrityRuntime, requestedGoldenKinds),
        operationTimeoutMs,
      );
      const pixelGap = await strictPixelBrowserGap(
        scenario,
        pixelBehavior,
        assetIds[0]!,
        golden,
        browser,
        fixtureIntegrityRuntime,
      );
      if (pixelGap) return finalize('NA_BROWSER', [], pixelGap);
    }

    // Required evidence is an input to correctness, so admit the active generation before any
    // candidate lifecycle hook. The typed preliminary applicability check has already run, but a
    // stale/tampered/invalid sidecar must never reach init, operation dispatch, or an oracle.
    const tupleGoldens = await cancellation.run(
      () => Promise.all(
        assetIds.map(async (assetId, index) =>
          index === 0 && golden
            ? golden
            : loadGoldenForRun(assetId, fixtureIntegrityRuntime, requestedGoldenKinds)),
      ),
      operationTimeoutMs,
    );
    golden ??= tupleGoldens[0] ?? emptyGoldenStore();
    const indexedGoldenGate = requiredIndexedGoldenGate(scenario, golden);
    if (indexedGoldenGate) {
      return finalize(indexedGoldenGate.status, [], indexedGoldenGate.reason);
    }

    // 4) init() brackets expensive setup (excluded from measured timing). Timeout aborts the shared
    // signal before the watchdog returns, so framework cleanup begins before the next cell.
    //    hanging WASM compile/instantiate (e.g. ffmpeg-wasm) becomes a clean ERROR, not a matrix stall.
    if (engine.init) {
      try {
        await cancellation.run(
          (signal) => callWithLifecycleContext(
            engine.id,
            signal,
            'functional',
            (context) => engine.init!(context),
          ),
          DEFAULT_INIT_TIMEOUT_MS,
        );
      } catch (err) {
        if (err instanceof TimeoutError) return finalize('ERROR', [], `init timeout: ${err.message}`);
        if (err instanceof RunCancelledError) return finalize('SKIPPED', [], `[RUN_CANCELLED] ${err.message}`);
        throw err;
      }
    }

    // 5) Full-tuple adapter decision + exact WebCodecs probes. Static tokens above remain only the
    // cheap pre-index. The exact configs returned here are cloned, probed, and persisted verbatim.
    const concreteRequest = buildConcreteOperationRequest(operationScenario, inputs, tupleGoldens);
    const concrete = await cancellation.run(
      (signal) => callWithLifecycleContext(
        engine.id,
        signal,
        'support',
        (context) => evaluateConcreteSupport(engine, concreteRequest, { context }),
      ),
      operationTimeoutMs,
    );
    supportEvidence = {
      request: concreteRequest,
      decision: concrete.decision.supported
        ? { supported: true }
        : {
            supported: false,
            status: concrete.decision.status,
            reasonCode: concrete.decision.reasonCode,
            reason: concrete.decision.reason,
          },
      browserConfigs: concrete.browserConfigs,
      probes: concrete.probeStates,
    };
    if (scenario.op === 'trim') {
      // An invalid support protocol/probe is a harness/adapter ERROR. All normal tuple and exact
      // config decisions pass through the trim-local ownership split below.
      if (concrete.blocker?.status === 'ERROR') {
        return finalize('ERROR', [], concrete.blocker.reason);
      }
      let trimPreflight: TrimDecision;
      try {
        trimPreflight = runnerTrimPreflightDecision(engine, scenario, concreteRequest, concrete);
      } catch (error) {
        if (isNotApplicableError(error)) {
          return finalize('NA_ENGINE', [], applicabilityReason(error));
        }
        throw error;
      }
      if (trimPreflight.state === 'UNAVAILABLE') {
        return finalize(
          trimPreflight.status,
          [],
          `[${trimPreflight.reasonCode}] ${trimPreflight.detail}`,
        );
      }
      if (trimPreflight.state === 'ERROR') {
        return finalize('ERROR', [], `[${trimPreflight.reasonCode}] ${trimPreflight.detail}`);
      }
      if (trimPreflight.verdict === 'FAIL') {
        return finalize('ERROR', [], `[${trimPreflight.reasonCode}] ${trimPreflight.detail}`);
      }
    }
    if (concrete.blocker && !bypassDeliberateIllegalMuxTupleBlocker(scenario, concrete)) {
      return finalize(concrete.blocker.status, [], concrete.blocker.reason);
    }

    // Cache lookup may have happened earlier, but reuse is permitted only now: current policy,
    // coarse/concrete engine support, executed browser behavior/config probes, assets, and golden
    // evidence have all been rerun and folded into the content address.
    executionFingerprint = await buildCellExecutionFingerprint(
      engine,
      scenario,
      browser,
      opts,
      supportEvidence,
      pixelBehavior,
      assetIds,
      tupleGoldens,
    );
    if (isExecutionFingerprintReusable(opts?.cachedResult, executionFingerprint)) {
      const cachedReason = opts.cachedResult.reason?.replace(/^(cached:\s*)+/i, '');
      const cached: FingerprintedScenarioResult = {
        ...opts.cachedResult,
        // Semantic evidence is reusable; the run envelope is not.  Current selection/environment/
        // timestamps always replace the stored row so cache hits never describe the prior run.
        ...base,
        support: supportEvidence,
        executionFingerprint,
        reason: cachedReason ? `cached: ${cachedReason}` : `cached previous ${opts.cachedResult.status} result`,
        durationMs: Date.now() - startedAt,
      };
      lastFinalized = cached;
      return cached;
    }

    // 6) Graceful-failure path: malformed/degenerate inputs expect clean reject/return within timeout.
    if (usesGracefulFailurePath) {
      const robustnessResult = await runRobustness(
        engine,
        operationScenario,
        inputs,
        concreteRequest,
        finalize,
        opts,
        cancellation,
      );
      if (opts?.selectionEvidencePlan && robustnessResult.oracleOutcomes.length > 0) {
        robustnessResult.candidateEvidence = candidateEvidenceResult(
          opts.selectionEvidencePlan,
          evaluateCandidateEvidence(opts.selectionEvidencePlan, robustnessResult.oracleOutcomes),
        );
      }
      if (engine.configUsed !== undefined) configSnapshots.capture('functional', engine.configUsed);
      return robustnessResult;
    }

    // 7) FUNCTIONAL PASS FIRST — execute the op (timeout-guarded), then run all oracles.
    let opResult: OpResult;
    try {
      let demuxTelemetryEvents: readonly OperationTelemetry[] | undefined;
      const executeFunctional = () => cancellation.run(
        () => executeOp(
          engine,
          operationScenario,
          inputs,
          concreteRequest,
          cancellation.signal,
          'functional',
          demuxScaleContract
            ? { onDemuxTelemetry: (events) => { demuxTelemetryEvents = events; } }
            : undefined,
        ),
        scenario.timeoutMs,
      );
      if (demuxScaleContract && demuxScaleMemorySampler?.state === 'AVAILABLE') {
        const meter = new Meter({
          observeLongtasks: true,
          ...(opts?.demuxScaleLongTaskEnvironment
            ? { longTaskEnvironment: opts.demuxScaleLongTaskEnvironment }
            : {}),
        });
        const timed = async () => {
          meter.begin();
          try {
            const result = await executeFunctional();
            await meter.end();
            return result;
          } catch (error) {
            await meter.end().catch(() => undefined);
            throw error;
          }
        };
        const observed = await measurePeakMemoryWindow(
          timed,
          demuxScaleMemorySampler,
          cancellableMemoryWindowOptions(opts?.probeMemoryWindowOptions, cancellation),
        );
        if (observed.state === 'UNAVAILABLE') {
          return finalize(observed.status, [], `[${observed.reasonCode}] ${observed.reason}`);
        }
        opResult = observed.value.result;
        const assessment = assessFunctionalDemuxScale(
          demuxScaleContract,
          primaryInput,
          opResult,
          demuxTelemetryEvents,
          observed.value.memory,
          meter.evidence(),
        );
        if (assessment.state === 'UNAVAILABLE') {
          return finalize(
            assessment.status,
            [],
            `[${assessment.reasonCode}] ${assessment.detail}`,
          );
        }
        opResult.demuxInvariantOutcome = demuxScaleOracleOutcome(assessment);
      } else if (probeBudget && probeMemorySampler?.state === 'AVAILABLE') {
        const observed = await measurePeakMemoryWindow(
          executeFunctional,
          probeMemorySampler,
          cancellableMemoryWindowOptions(
            opts?.probeMemoryWindowOptions ?? (
              primaryInput.contentAttestation && supportsAuthenticatedRangeProbeTransport(caps)
                ? { ...AUTHENTICATED_SCALE_PROBE_MEMORY_WINDOW }
                : undefined
            ),
            cancellation,
          ),
        );
        if (observed.state === 'UNAVAILABLE') {
          return finalize(
            observed.status,
            [],
            `[${observed.reasonCode}] ${observed.reason}`,
          );
        }
        opResult = observed.value.result;
        const metadata = opResult.metadata ?? opResult.probeMetadatas?.[0]?.metadata;
        opResult.probeBudgetAssessment = assessProbeBudget(probeBudget, {
          inputSizeBytes: Number(probeInputSize),
          readMode: metadata?.probeEvidence?.readMode,
          bytesRead: metadata?.telemetry?.bytesRead,
          peakMemoryDeltaBytes: observed.value.memory.deltaBytes,
        });
      } else {
        opResult = await executeFunctional();
      }
    } catch (err) {
      if (err instanceof TimeoutError) {
        return finalize('FAIL', [], `timeout: ${err.message}`);
      }
      if (err instanceof RunCancelledError) {
        return finalize('SKIPPED', [], `[RUN_CANCELLED] ${err.message}`);
      }
      if (isNotApplicableError(err)) {
        return finalize('NA_ENGINE', [], errMessage(err));
      }
      if (isBrowserNotSupportedError(err)) {
        return finalize('NA_BROWSER', [], browserApplicabilityReason(err));
      }
      if (isCorpusDeliveryIntegrityError(err)) {
        return finalize('NA_ASSET', [], `[${err.reasonCode}] ${err.detail}`);
      }
      if (
        err instanceof AdapterContractError &&
        readStringOption(scenario.options, ['invariant']) === 'probe-headerless-sane-duration' &&
        err.fieldPath.endsWith('.durationSec')
      ) {
        const outcome: OracleOutcome = {
          state: 'VERDICT',
          oracle: 'property-invariant',
          verdict: 'FAIL',
          reasonCode: 'PROBE_HEADERLESS_DURATION_INVALID',
          detail: `adapter returned an invalid optional headerless duration: ${err.message}`,
        };
        return finalize('FAIL', [outcome], `[${outcome.reasonCode}] ${outcome.detail}`);
      }
      throw err; // genuine error → caught by outer try as ERROR
    }
    if (engine.configUsed !== undefined) configSnapshots.capture('functional', engine.configUsed);

    // 6) Assemble OracleContext (inject decode/playback hooks + reference engine + golden).
    golden ??= await loadGoldenForRun(primaryInput.id, fixtureIntegrityRuntime, requestedGoldenKinds);
    if (opResult.probeMetadatas?.length) {
      opResult = {
        ...opResult,
        probeMetadatas: await Promise.all(
          opResult.probeMetadatas.map(async (entry) => ({
            ...entry,
            golden: await loadGoldenForRun(entry.input.id, fixtureIntegrityRuntime, requestedGoldenKinds),
          })),
        ),
      };
    }
    const ctx = buildOracleContext(scenario, primaryInput, inputs, opResult, golden, engine, opts);

    // 7) Run every declared oracle and reduce through the order-independent typed contract.
    const oracleOutcomes: OracleOutcome[] = [];
    for (const oracle of scenario.oracles) {
      try {
        if (oracle === 'property-invariant' && opResult.transcodeInvariantOutcome) {
          oracleOutcomes.push(opResult.transcodeInvariantOutcome);
          continue;
        }
        oracleOutcomes.push(
          await cancellation.run(
            () => runOracle(oracle, ctx, scenario.tolerances),
            scenario.timeoutMs,
          ),
        );
      } catch (err) {
        if (isNotApplicableError(err)) {
          return finalize('NA_ENGINE', oracleOutcomes, applicabilityReason(err));
        }
        if (isBrowserNotSupportedError(err)) {
          return finalize('NA_BROWSER', oracleOutcomes, browserApplicabilityReason(err));
        }
        if (err instanceof RunCancelledError) {
          return finalize('SKIPPED', oracleOutcomes, `[RUN_CANCELLED] ${err.message}`);
        }
        oracleOutcomes.push({
          state: 'ERROR',
          oracle,
          reasonCode: err instanceof TimeoutError ? 'ORACLE_TIMEOUT' : 'ORACLE_EXECUTION_ERROR',
          detail: err instanceof TimeoutError ? `timeout: ${err.message}` : errMessage(err),
        });
      }
    }
    const streamingOutcome = await assessStreamingOracleBoundary(
      scenario,
      opResult,
      oracleOutcomes,
      cancellation.signal,
    );
    if (streamingOutcome) {
      // The combined four-layer outcome is the streaming family correctness boundary. Its evidence
      // retains each original semantic/container check; leaving sibling PASS outcomes at top level
      // would let the generic semantic-first reducer mask a mandatory sink ERROR.
      oracleOutcomes.splice(0, oracleOutcomes.length, streamingOutcome);
    }
    const reduction = reduceOracleOutcomes(oracleOutcomes);
    const evidenceEvaluation = opts?.selectionEvidencePlan
      ? evaluateCandidateEvidence(opts.selectionEvidencePlan, oracleOutcomes)
      : undefined;
    candidateEvidence = opts?.selectionEvidencePlan && evidenceEvaluation
      ? candidateEvidenceResult(opts.selectionEvidencePlan, evidenceEvaluation)
      : undefined;
    const reducedStatus = evidenceEvaluation?.status ?? reduction.status;
    if (!isBenchmarkEligible(reducedStatus)) {
      return finalize(
        reducedStatus,
        oracleOutcomes,
        evidenceEvaluation
          ? `${evidenceEvaluation.reasonCode}: sufficient=${evidenceEvaluation.sufficient}; ` +
            `applied=${evidenceEvaluation.applied.join(',') || 'none'}`
          : reduction.detail,
      );
    }
    const correctnessStatus = reducedStatus;

    // 8) PASS and DIFF are correctness-valid. Measurement availability is orthogonal.
    if (!wantsPerformance || scenario.metrics.length === 0) {
      return finalize(correctnessStatus, oracleOutcomes, undefined, undefined, { state: 'NOT_REQUESTED' });
    }
    if (operationScenario.op === 'transcode') {
      const admission = transcodeMetricAdmissionFor(operationScenario, oracleOutcomes, []);
      if (admission.state === 'BLOCKED') {
        const decision = admission.decision;
        if (decision.state === 'VERDICT' && decision.verdict === 'FAIL') {
          const failedOutcomes = transcodeMetricFailureOutcomes(oracleOutcomes, decision);
          return finalize(
            'FAIL',
            failedOutcomes,
            `[${decision.reasonCode}] ${decision.detail}`,
            undefined,
            { state: 'UNAVAILABLE', reasonCode: decision.reasonCode, detail: decision.detail },
          );
        }
        return finalize(
          correctnessStatus,
          oracleOutcomes,
          undefined,
          undefined,
          { state: 'UNAVAILABLE', reasonCode: decision.reasonCode, detail: decision.detail },
        );
      }
    }
    let benchResult: ScenarioResult['bench'];
    measuredPhaseStarted = true;
    try {
      benchResult = await cancellation.run(
        () => runBench(
          engine,
          operationScenario,
          inputs,
          golden,
          opts?.benchOptions,
          concreteRequest,
          cancellation,
          opts?.resolvedInputs,
          opts?.benchMemorySampler,
          opts?.benchMemoryWindowOptions ?? (
            probeBudget &&
            primaryInput.contentAttestation &&
            supportsAuthenticatedRangeProbeTransport(caps)
              ? { ...AUTHENTICATED_SCALE_PROBE_MEMORY_WINDOW }
              : undefined
          ),
        ),
        DEFAULT_BENCH_TIMEOUT_MS,
      );
    } catch (err) {
      if (isNotApplicableError(err)) {
        return finalize('NA_ENGINE', oracleOutcomes, applicabilityReason(err));
      }
      if (isBrowserNotSupportedError(err)) {
        return finalize('NA_BROWSER', oracleOutcomes, browserApplicabilityReason(err));
      }
      if (isCorpusDeliveryIntegrityError(err)) {
        return finalize('NA_ASSET', oracleOutcomes, `[${err.reasonCode}] ${err.detail}`);
      }
      if (err instanceof TimeoutError) {
        return finalize(
          correctnessStatus,
          oracleOutcomes,
          undefined,
          undefined,
          { state: 'UNAVAILABLE', reasonCode: 'BENCH_TIMEOUT', detail: err.message },
        );
      }
      if (err instanceof RunCancelledError) {
        // Correctness and candidate-evidence reduction already completed before measurement began.
        // A run-level stop at this point cancels only the optional benchmark; relabelling the row
        // SKIPPED would contradict its retained PASS evidence and make the result unwritable.
        return finalize(
          correctnessStatus,
          oracleOutcomes,
          undefined,
          undefined,
          {
            state: 'UNAVAILABLE',
            reasonCode: 'BENCH_CANCELLED',
            detail: `[RUN_CANCELLED] ${err.message}`,
          },
        );
      }
      if (err instanceof MeasurementProtocolUnavailable || err instanceof MetricProtocolError) {
        return finalize(
          correctnessStatus,
          oracleOutcomes,
          undefined,
          undefined,
          {
            state: 'UNAVAILABLE',
            reasonCode: err.reasonCode,
            detail: err instanceof MeasurementProtocolUnavailable
              ? `[${err.status}] ${err.message}`
              : err.message,
          },
        );
      }
      return finalize(
        correctnessStatus,
        oracleOutcomes,
        undefined,
        undefined,
        { state: 'UNAVAILABLE', reasonCode: 'BENCH_ERROR', detail: errMessage(err) },
      );
    }
    if (engine.configUsed !== undefined) configSnapshots.capture('measured', engine.configUsed);
    if (operationScenario.op === 'transcode') {
      const rates = transcodeRatesFromBench(benchResult, correctnessStatus);
      const admission = transcodeMetricAdmissionFor(operationScenario, oracleOutcomes, rates);
      if (admission.state === 'BLOCKED') {
        return finalize(
          correctnessStatus,
          oracleOutcomes,
          undefined,
          undefined,
          {
            state: 'UNAVAILABLE',
            reasonCode: admission.decision.reasonCode,
            detail: admission.decision.detail,
          },
        );
      }
      benchResult = attachTranscodeRates(benchResult, admission.rates);
    }
    if (operationScenario.op === 'decrypt' && operationScenario.primaryMetric === 'throughputRealtime') {
      const admission = validateDecryptThroughputSummary(
        benchResult?.throughputRealtime,
        opts?.benchOptions?.iters ?? DEFAULT_BENCH.iters,
      );
      if (admission.state === 'ERROR') {
        return finalize(
          correctnessStatus,
          oracleOutcomes,
          undefined,
          undefined,
          { state: 'UNAVAILABLE', reasonCode: admission.reasonCode, detail: admission.detail },
        );
      }
    }
    return finalize(
      correctnessStatus,
      oracleOutcomes,
      undefined,
      benchResult,
      { state: 'AVAILABLE', metrics: Object.keys(benchResult ?? {}) as MetricId[] },
    );
  } catch (err) {
    if (isNotApplicableError(err)) {
      return finalize('NA_ENGINE', [], applicabilityReason(err));
    }
    if (isBrowserNotSupportedError(err)) {
      return finalize('NA_BROWSER', [], browserApplicabilityReason(err));
    }
    if (isCorpusDeliveryIntegrityError(err)) {
      return finalize('NA_ASSET', [], `[${err.reasonCode}] ${err.detail}`);
    }
    if (err instanceof AdapterContractError) {
      return finalize('ERROR', [], errMessage(err));
    }
    if (err instanceof RunCancelledError) {
      return finalize('SKIPPED', [], `[RUN_CANCELLED] ${err.message}`);
    }
    return finalize('ERROR', [], errMessage(err));
  } finally {
    // Capture validated immutable phase snapshots before disposal can erase fallback/backend state.
    try {
      if (engine.configUsed !== undefined) {
        if (configSnapshots.functional === undefined) {
          configSnapshots.capture('functional', engine.configUsed);
        }
        if (measuredPhaseStarted && configSnapshots.measured === undefined) {
          configSnapshots.capture('measured', engine.configUsed);
        }
      }
      const captured = configSnapshots.toJSON();
      if (lastFinalized && (captured.functional !== undefined || captured.measured !== undefined)) {
        lastFinalized.env = {
          ...(lastFinalized.env ?? {
            suiteVersion: SUITE_VERSION,
            engineId: engine.id,
            browser,
          }),
          configUsed: captured,
        };
      }
    } catch (error) {
      if (lastFinalized) {
        lastFinalized.status = 'ERROR';
        lastFinalized.reason = errMessage(error);
        delete lastFinalized.bench;
        lastFinalized.measurement = {
          state: 'UNAVAILABLE',
          reasonCode: 'CONFIG_SNAPSHOT_INVALID',
          detail: errMessage(error),
        };
      }
    }
    // Do not rebuild executionFingerprint here. configUsed now includes post-operation counters,
    // fallback observations, and cleanup state that a future run cannot know at its cache preflight.
    // The immutable functional/measured snapshots above preserve that evidence independently.
    if (engine.dispose) {
      try {
        await withCleanupDeadline(
          callWithLifecycleContext(
            engine.id,
            cancellation.signal,
            'cleanup',
            (context) => engine.dispose!(context),
          ),
          DEFAULT_CLEANUP_TIMEOUT_MS,
        );
      } catch {
        // dispose failures must not mask the result; swallow.
      }
    }
    for (const objectUrl of verifiedObjectUrls) URL.revokeObjectURL(objectUrl);
    cancellation.close();
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
  const gaplessNativeEvidence = opts?.gaplessNativeEvidence ?? collectGaplessNativeEvidence;
  const requestedDecodeTrack = decodeTrackSelectorFromOptions(scenario.options);
  const decodeTrackSelection = requestedDecodeTrack && opResult.frames
    ? assessDecodeTrackSelection(requestedDecodeTrack, opResult.frames.selectedTrack, opResult.frames.frames)
    : undefined;
  const oracleMetadata = opResult.metadata ?? opResult.demux?.metadata;

  const verifiedResources: Record<string, Uint8Array> = {};
  if (opts?.resolvedInputs && opts.verifiedContents) {
    for (let index = 0; index < opts.resolvedInputs.length; index++) {
      const resolved = opts.resolvedInputs[index]!;
      if (resolved.transport?.kind === 'oracle-resource') {
        verifiedResources[resolved.transport.sourceUri] = opts.verifiedContents[index]!.bytes.slice();
      }
    }
  }

  return {
    scenario,
    input,
    inputs,
    engine,
    golden,
    ...(opts?.fixtureIntegrityRuntime
      ? {
          goldenLoader: (assetId: string) => loadGoldenForRun(
            assetId,
            opts.fixtureIntegrityRuntime,
            goldenKindsForScenario(scenario),
          ),
        }
      : {}),
    ...(Object.keys(verifiedResources).length > 0 ? { verifiedResources } : {}),
    ...(opts?.browser !== undefined ? { browser: opts.browser } : {}),
    decodeWithPlatform,
    playbackSmoke,
    gaplessNativeEvidence,
    ...(opResult.output ? { output: opResult.output } : {}),
    ...(oracleMetadata ? { metadata: oracleMetadata } : {}),
    ...(oracleMetadata?.probeEvidence?.resourceAccesses
      ? { probeResourceAccesses: oracleMetadata.probeEvidence.resourceAccesses }
      : {}),
    ...(opResult.probeMetadatas?.length
      ? { probeMetadatas: opResult.probeMetadatas as OracleContext['probeMetadatas'] }
      : {}),
    ...(opResult.demux ? { demux: opResult.demux } : {}),
    ...(opResult.frames ? { frames: opResult.frames } : {}),
    ...(opResult.trimComposition ? { trimComposition: opResult.trimComposition } : {}),
    ...(opResult.demuxInvariantOutcome ? { demuxInvariantOutcome: opResult.demuxInvariantOutcome } : {}),
    ...(opResult.muxLargeFileOutcome ? { muxLargeFileOutcome: opResult.muxLargeFileOutcome } : {}),
    ...(opResult.probeBudgetAssessment ? { probeBudgetAssessment: opResult.probeBudgetAssessment } : {}),
    ...(opResult.seek ? { seek: opResult.seek } : {}),
    ...(opResult.seekSequence ? { seekSequence: opResult.seekSequence } : {}),
    ...(decodeTrackSelection ? { decodeTrackSelection } : {}),
  };
}

function assessFunctionalDemuxScale(
  contract: DemuxScaleContract,
  input: MediaInput,
  opResult: OpResult,
  events: readonly OperationTelemetry[] | undefined,
  memory: MemoryPeakObservation,
  meter: MeterEvidence,
): DemuxScaleAssessment {
  const longtasks = meter.longtasks;
  if (longtasks.state === 'UNAVAILABLE') {
    return longtasks.status === 'NA_BROWSER'
      ? {
          state: 'UNAVAILABLE',
          status: 'NA_BROWSER',
          reasonCode: longtasks.reasonCode,
          detail: longtasks.reason,
          missingFields: ['longestLongTaskMs', 'totalLongTaskMs'],
        }
      : { state: 'ERROR', reasonCode: longtasks.reasonCode, detail: longtasks.reason };
  }
  if (longtasks.state !== 'AVAILABLE') {
    return {
      state: 'ERROR',
      reasonCode: 'DEMUX_SCALE_LONGTASK_EVIDENCE_NOT_REQUESTED',
      detail: 'scale operation did not retain an active long-task observation window',
    };
  }
  const demux = opResult.demux;
  if (!demux) {
    return {
      state: 'ERROR',
      reasonCode: 'DEMUX_SCALE_RESULT_MISSING',
      detail: 'scale operation did not return a normalized demux result',
    };
  }
  const readEvents = (events ?? []).filter(
    (event): event is Extract<OperationTelemetry, { type: 'bytes-read' }> => event.type === 'bytes-read',
  );
  const packetEvents = (events ?? []).filter(
    (event): event is Extract<OperationTelemetry, { type: 'progress' }> =>
      event.type === 'progress' && event.determinate === false,
  );
  const finalReadBytes = demux.telemetry?.bytesRead ?? readEvents.at(-1)?.bytes;
  // Distinguish physical source reads (`bytes-read`) from packet-yield boundaries (indeterminate
  // `progress`). Retain the legacy one-read-event-per-packet shape for older adapters.
  const expectedBoundaryEvents = Math.min(2, demux.packets.length);
  const explicitPacketBoundaryTrace = demux.packets.length > 0 && packetEvents.length === expectedBoundaryEvents;
  const legacyPacketBoundaryTrace = demux.packets.length > 0 && readEvents.length === demux.packets.length;
  const packetBoundaryEvents = explicitPacketBoundaryTrace ? packetEvents : readEvents;
  const observation: DemuxScaleObservation = {
    schema: 'media-test/demux-scale-observation@1',
    assetBytes: input.sizeBytes ?? 0,
    peakMemoryDeltaBytes: memory.deltaBytes,
    ...(readEvents.length > 0 ? { sourceReadCalls: readEvents.length } : {}),
    ...(finalReadBytes !== undefined ? { sourceBytesRead: finalReadBytes } : {}),
    longestLongTaskMs: longtasks.value.longestDurationMs,
    totalLongTaskMs: longtasks.value.totalDurationMs,
    ...(explicitPacketBoundaryTrace || legacyPacketBoundaryTrace
      ? {
          firstPacketMs: packetBoundaryEvents[0]!.atMs,
          lastPacketMs: packetBoundaryEvents.at(-1)!.atMs,
        }
      : {}),
  };
  return assessDemuxScale(contract, observation);
}

function demuxScaleOracleOutcome(
  assessment: Exclude<DemuxScaleAssessment, { state: 'UNAVAILABLE' }>,
): OracleOutcome {
  if (assessment.state === 'ERROR') {
    return {
      state: 'ERROR',
      oracle: 'property-invariant',
      reasonCode: assessment.reasonCode,
      detail: assessment.detail,
    };
  }
  return {
    state: 'VERDICT',
    oracle: 'property-invariant',
    verdict: assessment.state,
    reasonCode: assessment.reasonCode,
    detail: assessment.detail,
    measurements: { ...assessment.measurements },
  };
}

function muxDecisionOracleOutcome(oracle: OracleOutcome['oracle'], decision: MuxDecision): OracleOutcome {
  if (decision.state === 'VERDICT') {
    return {
      state: 'VERDICT',
      oracle,
      verdict: decision.verdict,
      reasonCode: decision.reasonCode,
      detail: decision.detail,
      ...(decision.measurements ? { measurements: { ...decision.measurements } } : {}),
    };
  }
  if (decision.state === 'UNAVAILABLE') {
    return {
      state: 'UNAVAILABLE',
      oracle,
      status: decision.status,
      reasonCode: decision.reasonCode,
      detail: decision.detail,
    };
  }
  return {
    state: 'ERROR',
    oracle,
    reasonCode: decision.reasonCode,
    detail: decision.detail,
  };
}

/** Execute an explicit robustness contract. Applicability, operation disposition, survivor
 * validity, and oracle verdict are independent decisions; none is inferred from exception prose. */
async function runRobustness(
  engine: MediaEngine,
  scenario: Scenario,
  inputs: MediaInput[],
  request: ConcreteOperationRequest,
  finalize: (
    status: ScenarioResult['status'],
    oracleOutcomes: OracleOutcome[],
    reason?: string,
    bench?: ScenarioResult['bench'],
  ) => ScenarioResult,
  opts: RunOneOptions | undefined,
  cancellation: CancellationScope,
): Promise<ScenarioResult> {
  const input = inputs[0]!;
  const contract = robustnessContractFromOptions(scenario.options) ?? legacyRobustnessContract(scenario);
  const wallStarted = performance.now();
  let opResult: OpResult | undefined;

  const finish = (
    evidence: RobustnessOperationEvidence,
    status: ScenarioResult['status'],
    outcomes: OracleOutcome[],
    reason?: string,
  ): ScenarioResult => {
    const result = finalize(status, outcomes, reason);
    result.operationEvidence = evidence;
    return result;
  };

  const operationEvidence = (
    disposition: RobustnessOperationEvidence['disposition'],
    stage: RobustnessOperationEvidence['stage'],
    error?: unknown,
    resourceKind: NonNullable<RobustnessOperationEvidence['resource']>['kind'] = 'wall-time',
  ): RobustnessOperationEvidence => ({
    schema: 'media-test/robustness-operation@1',
    disposition,
    stage,
    ...(error !== undefined ? { nativeError: nativeErrorIdentity(error) } : {}),
    resource: {
      kind: resourceKind,
      observed: Math.max(0, performance.now() - wallStarted),
      limit: contract.timeoutMs,
      unit: 'ms',
    },
  });

  try {
    opResult = await cancellation.run(
      () => executeOp(engine, scenario, inputs, request, cancellation.signal, 'functional'),
      contract.timeoutMs,
    );
  } catch (err) {
    if (isNotApplicableError(err)) {
      if (isDeliberatelyIllegalMuxScenario(scenario)) {
        const outcome = muxDecisionOracleOutcome('graceful-failure', assessMuxExecutionBoundary(scenario, {
          state: 'NOT_APPLICABLE',
          reasonCode: err.reasonCode,
          detail: err.reason,
        }));
        return finish(
          operationEvidence('not-applicable', 'operation', err),
          outcome.state === 'VERDICT' ? outcome.verdict : 'ERROR',
          [outcome],
          outcome.detail,
        );
      }
      return finish(
        operationEvidence('not-applicable', 'operation', err),
        'NA_ENGINE',
        [],
        applicabilityReason(err),
      );
    }
    if (isBrowserNotSupportedError(err)) {
      return finish(
        operationEvidence('browser-unavailable', 'operation', err),
        'NA_BROWSER',
        [],
        browserApplicabilityReason(err),
      );
    }
    if (err instanceof TimeoutError) {
      if (isDeliberatelyIllegalMuxScenario(scenario)) {
        const outcome = muxDecisionOracleOutcome('graceful-failure', assessMuxExecutionBoundary(scenario, {
          state: 'TIMEOUT',
          timeoutMs: contract.timeoutMs,
        }));
        return finish(
          operationEvidence('timeout', 'operation', err, 'worker-stall'),
          outcome.state === 'VERDICT' ? outcome.verdict : 'ERROR',
          [outcome],
          outcome.detail,
        );
      }
      return finish(
        operationEvidence('timeout', 'operation', err, 'worker-stall'),
        'FAIL',
        [{
          state: 'VERDICT',
          oracle: robustnessOutcomeOracle(scenario),
          verdict: 'FAIL',
          reasonCode: 'ROBUSTNESS_OPERATION_TIMEOUT',
          detail: 'operation timeout',
        }],
        'timeout',
      );
    }
    if (err instanceof RunCancelledError) {
      return finalize('SKIPPED', [], `[RUN_CANCELLED] ${err.message}`);
    }
    if (isMalformedInputError(err)) {
      const evidence = operationEvidence('clean-reject', 'operation', err);
      if (isDeliberatelyIllegalMuxScenario(scenario)) {
        const outcome = muxDecisionOracleOutcome('graceful-failure', assessMuxExecutionBoundary(scenario, {
          state: 'REJECTED',
          reasonCode: err.reasonCode,
          detail: err.reason,
        }));
        return finish(
          evidence,
          outcome.state === 'VERDICT' ? outcome.verdict : 'ERROR',
          [outcome],
          outcome.detail,
        );
      }
      const decision = decideRobustnessDisposition(contract, evidence);
      const status = decision.status ?? 'ERROR';
      const verdict = status === 'PASS' ? 'PASS' : 'FAIL';
      return finish(
        evidence,
        status,
        [{
          state: 'VERDICT',
          oracle: robustnessOutcomeOracle(scenario),
          verdict,
          reasonCode: decision.reasonCode,
          detail: `${decision.reasonCode}: ${err.reason}`,
        }],
        `${decision.reasonCode}: ${err.reason}`,
      );
    }
    // Contract violations and programming/unclassified framework exceptions are harness errors.
    // A negative row does not grant an adapter permission to relabel every exception as expected.
    return finish(
      operationEvidence('harness-error', 'operation', err),
      'ERROR',
      [],
      err instanceof AdapterContractError
        ? `adapter contract violation: ${errMessage(err)}`
        : `unclassified operation error: ${errMessage(err)}`,
    );
  }

  if (isDeliberatelyIllegalMuxScenario(scenario)) {
    const byteLength = opResult?.output?.bytes.byteLength ?? 0;
    const outcome = muxDecisionOracleOutcome('graceful-failure', assessMuxExecutionBoundary(scenario, {
      state: 'RETURNED_OUTPUT',
      byteLength,
    }));
    return finish(
      operationEvidence('returned-validatable-output', 'survivor-oracle'),
      outcome.state === 'VERDICT' ? outcome.verdict : 'ERROR',
      [outcome],
      outcome.detail,
    );
  }

  const requestedGoldenKinds = goldenKindsForScenario(scenario);
  const golden: GoldenStore = await loadGoldenForRun(
    input.id,
    opts?.fixtureIntegrityRuntime,
    requestedGoldenKinds,
  )
    .catch(() => emptyGoldenStore());
  let robustnessOpResult = opResult ?? {};
  if (robustnessOpResult.probeMetadatas?.length) {
    robustnessOpResult = {
      ...robustnessOpResult,
      probeMetadatas: await Promise.all(
        robustnessOpResult.probeMetadatas.map(async (entry) => ({
          ...entry,
          golden: await loadGoldenForRun(
            entry.input.id,
            opts?.fixtureIntegrityRuntime,
            requestedGoldenKinds,
          )
            .catch(() => emptyGoldenStore()),
        })),
      ),
    };
  }

  const returnedEvidence = operationEvidence('returned-validatable-output', 'survivor-oracle');
  const disposition = decideRobustnessDisposition(contract, returnedEvidence);
  if (!disposition.needsSurvivorOracle) {
    return finish(
      returnedEvidence,
      disposition.status ?? 'ERROR',
      [],
      disposition.reasonCode,
    );
  }
  const survivor = validateRobustnessReturnedValue(contract, robustnessOpResult, {
    seekPolicy: readStringOption(scenario.options, ['seekPolicy']),
    goldenPackets: golden.packets,
    seekToleranceUs: scenario.tolerances?.seekToleranceUs,
  });
  if (survivor.state !== 'PASS') {
    const evidence = operationEvidence('returned-validatable-output', 'survivor-oracle');
    if (survivor.state === 'ERROR') {
      return finish(evidence, 'ERROR', [{
        state: 'ERROR',
        oracle: robustnessOutcomeOracle(scenario),
        reasonCode: survivor.reasonCode,
        detail: survivor.detail,
      }], survivor.detail);
    }
    return finish(evidence, 'FAIL', [{
      state: 'VERDICT',
      oracle: robustnessOutcomeOracle(scenario),
      verdict: 'FAIL',
      reasonCode: survivor.reasonCode,
      detail: `${survivor.reasonCode}: ${survivor.detail}`,
    }], survivor.detail);
  }

  if (scenario.id === 'demux/graceful_truncated_h264' && robustnessOpResult.demux) {
    try {
      const partial = await cancellation.run(
        () => validateTruncatedH264WithWebCodecs(robustnessOpResult.demux!),
        contract.timeoutMs,
      );
      const outcomes = [partial.outcome];
      const reduced = reduceOracleOutcomes(outcomes);
      return finish(
        returnedEvidence,
        reduced.status,
        outcomes,
        `${partial.outcome.reasonCode}: ${partial.outcome.detail}`,
      );
    } catch (error) {
      if (error instanceof TimeoutError) {
        const outcome: OracleOutcome = {
          state: 'VERDICT',
          oracle: 'graceful-failure',
          verdict: 'FAIL',
          reasonCode: 'DEMUX_PARTIAL_NEUTRAL_PROBE_TIMEOUT',
          detail: 'neutral validation of the returned H.264 prefix timed out',
        };
        return finish(
          operationEvidence('timeout', 'survivor-oracle', error, 'worker-stall'),
          'FAIL',
          [outcome],
          outcome.detail,
        );
      }
      const outcome: OracleOutcome = {
        state: 'ERROR',
        oracle: 'graceful-failure',
        reasonCode: 'DEMUX_PARTIAL_NEUTRAL_PROBE_ERROR',
        detail: errMessage(error),
      };
      return finish(returnedEvidence, 'ERROR', [outcome], outcome.detail);
    }
  }

  const encryptionNegative = encryptionNegativeContractFromOptions(scenario.options);
  if (encryptionNegative && !encryptionNegative.partialOutput.allowed) {
    const evidence = operationEvidence('returned-validatable-output', 'survivor-oracle');
    const detail =
      `${encryptionNegative.expected} requires a clean typed rejection; returned media is not an allowed survivor`;
    return finish(evidence, 'FAIL', [{
      state: 'VERDICT',
      oracle: robustnessOutcomeOracle(scenario),
      verdict: 'FAIL',
      reasonCode: 'ENCRYPTION_NEGATIVE_OUTPUT_FORBIDDEN',
      detail,
    }], detail);
  }

  const ctx = buildOracleContext(scenario, input, inputs, robustnessOpResult, golden, engine, opts);

  const oracleOutcomes: OracleOutcome[] = [];
  // For negative/boundary rows the explicit survivor check replaces the old unconditional
  // graceful-failure oracle. Hard-valid rows continue through their substantive declared oracles.
  if (contract.inputClass !== 'hard-valid' && scenario.oracles.includes('graceful-failure')) {
    oracleOutcomes.push({
      state: 'VERDICT',
      oracle: 'graceful-failure',
      verdict: 'PASS',
      reasonCode: survivor.reasonCode,
      detail: `${survivor.reasonCode}: ${survivor.detail}`,
    });
  }
  const substantiveOracles = [...new Set([
    ...scenario.oracles,
    ...(encryptionNegative?.partialOutput.allowed ? encryptionNegative.returnedOutputOracles : []),
  ])].filter((oracle) => !(oracle === 'graceful-failure' && contract.inputClass !== 'hard-valid'));
  for (const oracle of substantiveOracles) {
    try {
      oracleOutcomes.push(
        await cancellation.run(
          () => runOracle(oracle, ctx, scenario.tolerances),
          contract.timeoutMs,
        ),
      );
    } catch (err) {
      if (isNotApplicableError(err)) {
        return finish(
          operationEvidence('not-applicable', 'survivor-oracle', err),
          'NA_ENGINE',
          oracleOutcomes,
          applicabilityReason(err),
        );
      }
      if (isBrowserNotSupportedError(err)) {
        return finish(
          operationEvidence('browser-unavailable', 'survivor-oracle', err),
          'NA_BROWSER',
          oracleOutcomes,
          browserApplicabilityReason(err),
        );
      }
      if (err instanceof RunCancelledError) {
        return finalize('SKIPPED', oracleOutcomes, `[RUN_CANCELLED] ${err.message}`);
      }
      if (err instanceof TimeoutError) {
        const timedOut = {
          state: 'VERDICT',
          oracle,
          verdict: 'FAIL',
          reasonCode: 'ROBUSTNESS_SURVIVOR_TIMEOUT',
          detail: 'survivor oracle timeout',
        } satisfies OracleOutcome;
        return finish(
          operationEvidence('timeout', 'survivor-oracle', err, 'worker-stall'),
          'FAIL',
          [...oracleOutcomes, timedOut],
          'survivor oracle timeout',
        );
      }
      oracleOutcomes.push({
        state: 'ERROR',
        oracle,
        reasonCode: 'ORACLE_EXECUTION_ERROR',
        detail: errMessage(err),
      });
    }
  }

  const reduction = reduceOracleOutcomes(oracleOutcomes);
  const evidenceEvaluation = opts?.selectionEvidencePlan
    ? evaluateCandidateEvidence(opts.selectionEvidencePlan, oracleOutcomes)
    : undefined;
  const reducedStatus = evidenceEvaluation?.status ?? reduction.status;
  if (!isBenchmarkEligible(reducedStatus)) {
    return finish(
      returnedEvidence,
      reducedStatus,
      oracleOutcomes,
      evidenceEvaluation
        ? `${evidenceEvaluation.reasonCode}: sufficient=${evidenceEvaluation.sufficient}`
        : reduction.detail,
    );
  }
  return finish(returnedEvidence, reducedStatus, oracleOutcomes);
}

function legacyRobustnessContract(scenario: Scenario): RobustnessExecutionContract {
  const returnedOutputCheck: RobustnessSurvivorCheck =
    scenario.op === 'probe'
      ? 'probe-structure'
      : scenario.op === 'demux'
        ? 'packet-structure'
        : scenario.op === 'decodeFrames'
          ? 'frame-coverage'
          : scenario.op === 'seek'
            ? 'seek-clamp'
            : 'media-structure';
  const inputClass = readStringOption(scenario.options, ['seekPolicy'])
    ? 'boundary'
    : scenario.oracles.includes('graceful-failure') || typeof scenario.mutate === 'function'
      ? 'negative'
      : 'hard-valid';
  return defineRobustnessContract(
    inputClass,
    returnedOutputCheck,
    scenario.oracles,
    scenario.timeoutMs && scenario.timeoutMs > 0 ? scenario.timeoutMs : DEFAULT_OP_TIMEOUT_MS,
  );
}

function robustnessOutcomeOracle(scenario: Scenario): OracleOutcome['oracle'] {
  return scenario.oracles.includes('graceful-failure')
    ? 'graceful-failure'
    : scenario.oracles[0] ?? 'property-invariant';
}

function nativeErrorIdentity(error: unknown): { name: string; code?: string } {
  if (error !== null && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const name = typeof record.name === 'string' && record.name ? record.name : error.constructor?.name;
    const codeValue = typeof record.code === 'string' || typeof record.code === 'number'
      ? String(record.code)
      : typeof record.reasonCode === 'string'
        ? record.reasonCode
        : undefined;
    return {
      name: name || 'UnknownError',
      ...(codeValue ? { code: codeValue } : {}),
    };
  }
  return { name: typeof error };
}

function transcodeMetricAdmissionFor(
  scenario: Scenario,
  outcomes: readonly OracleOutcome[],
  rates: readonly TranscodeRateEvidence[],
) {
  return admitTranscodeRuntimeMetrics({
    contract: transcodeMetricAdmissionContract({
      oracles: scenario.oracles,
      ...(scenario.oracles.includes('ssim-psnr') && scenario.tolerances?.ssimMin !== undefined
        ? { ssimMin: scenario.tolerances.ssimMin }
        : {}),
    }),
    outcomes,
    rates,
  });
}

function transcodeMetricFailureOutcomes(
  outcomes: readonly OracleOutcome[],
  decision: Extract<TranscodeDecision, { state: 'VERDICT' }>,
): OracleOutcome[] {
  const index = outcomes.findIndex((outcome) => outcome.oracle === 'ssim-psnr');
  if (index < 0) return [...outcomes];
  return outcomes.map((outcome, outcomeIndex) => outcomeIndex === index
    ? {
        state: 'VERDICT',
        oracle: outcome.oracle,
        verdict: 'FAIL',
        reasonCode: decision.reasonCode,
        detail: decision.detail,
        ...(decision.measurements ? { measurements: { ...decision.measurements } } : {}),
        ...(outcome.evidence ? { evidence: outcome.evidence } : {}),
      }
    : outcome);
}

function transcodeRateNumeratorIdentity(metric: MetricId): {
  name: string;
  unit: string;
  source: TranscodeRateEvidence['numerator']['source'];
} | undefined {
  switch (metric) {
    case 'throughputRealtime':
      return {
        name: 'neutral output presentation duration',
        unit: 'second',
        source: 'neutral-output-presentation-timeline',
      };
    case 'decodeFps':
      return { name: 'decoded frame sink frames', unit: 'frame', source: 'decoded-frame-sink' };
    case 'encodeFps':
    case 'framesPerSec':
      return {
        name: 'neutral output presentation frames',
        unit: 'frame',
        source: 'neutral-output-sample-table',
      };
    case 'sampleFramesPerSec':
      return {
        name: 'neutral output audio presentation sample frames',
        unit: 'sample-frame',
        source: 'neutral-output-audio-timeline',
      };
    case 'packetsPerSec':
      return { name: 'neutral output packet table packets', unit: 'packet', source: 'neutral-output-packet-table' };
    case 'opsPerSec':
      return { name: 'measured operations', unit: 'operation', source: 'measured-operation-count' };
    default:
      return undefined;
  }
}

function transcodeRatesFromBench(
  bench: ScenarioResult['bench'],
  associatedVerdict: 'PASS',
): TranscodeRateEvidence[] {
  const rates: TranscodeRateEvidence[] = [];
  for (const [metricName, summary] of Object.entries(bench ?? {})) {
    const metric = metricName as MetricId;
    const identity = transcodeRateNumeratorIdentity(metric);
    if (!identity) continue;
    for (const component of summary?.ratioComponents ?? []) {
      rates.push(makeTranscodeRateEvidence({
        metric,
        numerator: {
          name: `${identity.name} (${component.identity})`,
          value: component.numerator,
          unit: identity.unit,
          source: identity.source,
        },
        denominator: {
          name: `monotonic operation window (${component.identity})`,
          value: component.denominator,
          unit: 'second',
          source: 'monotonic-operation-window',
        },
        associatedVerdict,
      }));
    }
  }
  return rates;
}

function attachTranscodeRates(
  bench: ScenarioResult['bench'],
  rates: readonly TranscodeRateEvidence[],
): ScenarioResult['bench'] {
  if (!bench) return bench;
  const out: ScenarioResult['bench'] = {};
  for (const [metricName, summary] of Object.entries(bench)) {
    const metric = metricName as MetricId;
    if (!summary) continue;
    const metricRates = rates.filter((rate) => rate.metric === metric);
    out[metric] = {
      ...summary,
      protocolEvidence: {
        ...(summary.protocolEvidence ?? {}),
        ...(metricRates.length > 0
          ? { transcodeRateEvidence: metricRates.map((rate) => ({ ...rate })) }
          : {}),
      },
    };
  }
  return out;
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
  request: ConcreteOperationRequest,
  cancellation: CancellationScope,
  resolvedInputs?: ResolvedInput[],
  memorySamplerEvidence?: PerformanceEvidence<MemorySampler>,
  memoryWindowOptions?: MemoryWindowOptions,
): Promise<ScenarioResult['bench']> {
  const primaryMetric = scenario.primaryMetric ?? scenario.metrics[0];
  if (!primaryMetric) return {};

  // Instruments whose absence is knowable before work starts must never run the operation and then
  // manufacture zero. Correctness remains PASS/DIFF; the caller records typed measurement absence.
  if (scenario.metrics.includes('bundleSize')) {
    throw new MeasurementProtocolUnavailable(
      'NA_ASSET', 'BUNDLE_COMPONENT_MAP_MISSING',
      'complete JS/WASM/worker/codec-core bundle evidence must be joined before report construction',
    );
  }
  if (scenario.metrics.includes('sourceReads')) {
    requirePerformanceEvidence(sourceReadEvidence({}), 'sourceReads');
  }
  preflightLongTaskMeasurement(scenario.metrics.includes('longtasks'));
  const memorySampler = scenario.metrics.includes('peakMemory')
    ? requirePerformanceEvidence(memorySamplerEvidence ?? userAgentSpecificMemorySampler(), 'peakMemory')
    : undefined;

  const measured: BenchBatchEvidence[] = [];
  const resourceOrLatency = scenario.metrics.some((metric) =>
    metric === 'peakMemory' || metric === 'timeToFirstByte' || metric === 'timeToFirstFrame' || metric === 'loadInit');
  const protocolOptions: BenchOptions = {
    ...(benchOptions ?? {}),
    ...(resourceOrLatency ? { maxInnerIterations: 1 } : {}),
  };
  const adaptive = await adaptiveBench(
    primaryMetric,
    async (batch) => {
      const evidence = await runBenchBatch(
        engine,
        scenario,
        inputs,
        golden,
        request,
        cancellation,
        batch,
        resolvedInputs,
        // Warmup and calibration samples are intentionally discarded by adaptiveBench. Running the
        // expensive cross-process memory API around those phases multiplies overhead without adding
        // evidence. Every retained repetition below still owns an independent bounded window.
        batch.phase === 'measured' ? memorySampler : undefined,
        memoryWindowOptions,
      );
      if (batch.phase === 'measured') measured.push(evidence);
      return evidence.sample;
    },
    protocolOptions,
  );

  const out: Partial<Record<MetricId, BenchSummary>> = {};
  for (const metric of scenario.metrics) {
    const values = measured.map((entry, index) => requireFiniteMetricSample(metric, entry.sample, index));
    const ratioComponents = measured
      .map((entry) => entry.ratios[metric])
      .filter((entry): entry is BenchRatioComponent => entry !== undefined);
    if (metricHigherIsBetter(metric) && ratioComponents.length !== measured.length) {
      throw new MeasurementProtocolUnavailable(
        'ERROR', 'METRIC_RATIO_EVIDENCE_INCOMPLETE',
        `${metric} retained ${ratioComponents.length}/${measured.length} numerator/denominator components`,
      );
    }
    const base = metric === primaryMetric
      ? adaptive.summary
      : {
          ...summarize(metric, values, adaptive.protocol.warmupCount),
          sampleAxis: 'iteration' as const,
          aggregation: 'median' as const,
          requestedIterations: adaptive.protocol.measuredCount,
          timerResolutionMs: adaptive.protocol.timerResolutionMs,
        };
    const durationFacts = measured
      .map((entry) => entry.duration)
      .filter((entry): entry is PresentationDuration => entry !== undefined);
    const summary: BenchSummary = {
      ...base,
      ...(ratioComponents.length > 0 ? { ratioComponents } : {}),
      protocolEvidence: {
        schema: 'media-test/performance-measurement-evidence@1',
        timingProtocol: adaptive.protocol,
        rawSamples: adaptive.rawSamples,
        presentationDurations: durationFacts,
        presentationUnitSources: measured.flatMap((entry) => entry.presentationUnitSources),
        longtasks: measured.map((entry) => entry.meter.longtasks),
        memory: measured.map((entry) => entry.memory ?? null),
      },
    };
    if (metric === 'timeToFirstFrame') {
      const admission = validateFirstFrameSummary(summary, measured.length);
      if (admission.state === 'ERROR') {
        throw new MeasurementProtocolUnavailable('ERROR', admission.reasonCode, admission.detail);
      }
    }
    out[metric] = summary;
  }
  return out;
}

class MeasurementProtocolUnavailable extends Error {
  constructor(
    readonly status: 'NA_ENGINE' | 'NA_BROWSER' | 'NA_ASSET' | 'ERROR',
    readonly reasonCode: string,
    detail: string,
  ) {
    super(detail);
    this.name = 'MeasurementProtocolUnavailable';
  }
}

interface BenchBatchEvidence {
  sample: MetricSample;
  ratios: Partial<Record<MetricId, BenchRatioComponent>>;
  duration?: PresentationDuration;
  presentationUnitSources: string[];
  meter: MeterEvidence;
  memory?: MemoryPeakObservation;
}

async function runBenchBatch(
  engine: MediaEngine,
  scenario: Scenario,
  inputs: MediaInput[],
  golden: GoldenStore,
  request: ConcreteOperationRequest,
  cancellation: CancellationScope,
  batch: AdaptiveBatchRequest,
  resolvedInputs: ResolvedInput[] | undefined,
  memorySampler: MemorySampler | undefined,
  memoryWindowOptions: MemoryWindowOptions | undefined,
): Promise<BenchBatchEvidence> {
  const meter = new Meter({ observeLongtasks: scenario.metrics.includes('longtasks') });
  const ctx: MeasureContext = { ops: 0 };
  let duration: PresentationDuration | undefined;
  const presentationUnitSources: string[] = [];
  let firstByteTotal = 0;
  let firstByteCount = 0;
  let firstFrameTotal = 0;
  let firstFrameCount = 0;

  const timed = async (): Promise<{ sample: MetricSample; meter: MeterEvidence }> => {
    meter.begin();
    for (let inner = 0; inner < batch.innerIterations; inner++) {
      const freshInputs = resolvedInputs && resolvedInputs.length > 0
        ? inputs
        : inputs.map((input) => buildMediaInput(
            input.id, scenario.mutate, undefined, undefined, cancellation.signal,
          ));
      const opResult = await cancellation.run(
        () => executeOp(
          engine,
          scenario,
          freshInputs,
          request,
          cancellation.signal,
          batch.phase === 'measured' ? 'measured' : 'warmup',
        ),
        scenario.timeoutMs,
      );
      ctx.ops = (ctx.ops ?? 0) + 1;
      const telemetry = operationTelemetry(opResult);

      if (opResult.output) {
        ctx.bytesOut = (ctx.bytesOut ?? 0) + outputByteLength(opResult.output);
        const writes = observedTargetWrites(opResult.output, telemetry);
        if (writes !== undefined) ctx.targetWrites = (ctx.targetWrites ?? 0) + writes;
        if (scenario.metrics.includes('targetWrites') && writes === undefined) {
          throw new MeasurementProtocolUnavailable(
            'NA_ENGINE', 'TARGET_WRITE_EVIDENCE_UNAVAILABLE',
            'adapter returned no observable output-target write count',
          );
        }
      }

      if (opResult.demux) {
        const packets = opResult.demux.packets.length;
        if (telemetry?.packetCount !== undefined && telemetry.packetCount !== packets) {
          throw new MeasurementProtocolUnavailable(
            'ERROR', 'PACKET_COUNTER_MISMATCH',
            `adapter reported ${telemetry.packetCount} packets but the returned table contains ${packets}`,
          );
        }
        ctx.packets = (ctx.packets ?? 0) + packets;
      }
      if (opResult.seek) {
        ctx.seeks = (ctx.seeks ?? 0) + (opResult.seekSequence?.steps.length ?? 1);
      }

      if (scenario.metrics.includes('decodeFps') || (scenario.metrics.includes('framesPerSec') && opResult.frames)) {
        const counted = requirePerformanceEvidence(
          countDecodedPresentationUnits(opResult.frames?.frames, telemetry),
          'decoded presentation units',
        );
        ctx.decodedFrames = (ctx.decodedFrames ?? 0) + counted.count;
        if (opResult.frames) ctx.frames = (ctx.frames ?? 0) + counted.count;
        presentationUnitSources.push(`decoded:${counted.source}`);
      }

      if (opResult.output && (scenario.metrics.includes('encodeFps') || scenario.metrics.includes('framesPerSec'))) {
        const counted = requirePerformanceEvidence(
          countOutputPresentationUnits(opResult.output),
          'encoded presentation units',
        );
        ctx.encodedFrames = (ctx.encodedFrames ?? 0) + counted.count;
        ctx.frames = (ctx.frames ?? 0) + counted.count;
        presentationUnitSources.push(`encoded:${counted.source}`);
      }

      if (scenario.metrics.includes('sampleFramesPerSec')) {
        if (!opResult.output) {
          throw new MeasurementProtocolUnavailable(
            'ERROR', 'AUDIO_SAMPLE_FRAME_NUMERATOR_UNAVAILABLE',
            'sample-frame throughput requires neutral byte-readable audio output',
          );
        }
        const numerator = audioSampleFrameNumeratorFromBytes(opResult.output.bytes);
        if (numerator.state !== 'OK') {
          throw new MeasurementProtocolUnavailable(
            'ERROR', 'AUDIO_SAMPLE_FRAME_NUMERATOR_UNAVAILABLE',
            `[${numerator.reasonCode}] ${numerator.detail}`,
          );
        }
        ctx.sampleFrames = (ctx.sampleFrames ?? 0) + numerator.value.sampleFrames;
        presentationUnitSources.push(`audio:${numerator.value.source}`);
      }

      if (scenario.metrics.includes('throughputRealtime')) {
        const observed = requirePerformanceEvidence(
          benchmarkPresentationDuration(golden, opResult, scenario),
          'presentation duration',
        );
        if (duration && (duration.basis !== observed.basis || duration.policy !== observed.policy)) {
          throw new MeasurementProtocolUnavailable(
            'ERROR', 'PRESENTATION_DURATION_BASIS_CHANGED',
            'duration basis/policy changed within one calibrated batch',
          );
        }
        duration = duration
          ? { ...duration, durationUs: duration.durationUs + observed.durationUs, durationSec: duration.durationSec + observed.durationSec }
          : { ...observed };
      }

      if (scenario.metrics.includes('timeToFirstByte')) {
        if (scenario.family === 'streaming-output') {
          const evidence = opResult.streamingRuntimeEvidence;
          const sample = readTimeToFirstByteSample(evidence?.sinkTrace);
          if (!sample.available) {
            throw new MeasurementProtocolUnavailable(
              'ERROR',
              sample.reasonCode,
              `timeToFirstByte: ${sample.detail}`,
            );
          }
          firstByteTotal += sample.timeToFirstByteMs;
        } else {
          const event = requirePerformanceEvidence(
            operationEventLatency('first-byte', telemetry),
            'timeToFirstByte',
          );
          firstByteTotal += event.milliseconds;
        }
        firstByteCount += 1;
      }
      if (scenario.metrics.includes('timeToFirstFrame')) {
        const boundary = opResult.firstFrameBoundary;
        if (!boundary) {
          throw new MeasurementProtocolUnavailable(
            'ERROR', 'FIRST_FRAME_SAMPLE_MISSING',
            'decode adapter did not invoke DecodeOptions.onFirstFrame at the frame-sink boundary',
          );
        }
        if (boundary.deliveredFrames !== 1) {
          throw new MeasurementProtocolUnavailable(
            'ERROR', 'FIRST_FRAME_CALLBACK_CARDINALITY',
            `DecodeOptions.onFirstFrame fired ${boundary.deliveredFrames} times; expected exactly once`,
          );
        }
        firstFrameTotal += boundary.firstFrameMs;
        firstFrameCount += 1;
      }
    }
    if (duration) {
      ctx.mediaDuration = {
        durationUs: duration.durationUs,
        basis: duration.basis,
        policy: duration.policy,
      };
    }
    if (firstByteCount > 0) ctx.firstByteMs = firstByteTotal / firstByteCount;
    if (firstFrameCount > 0) ctx.firstFrameMs = firstFrameTotal / firstFrameCount;
    const sample = await meter.end(ctx);
    return { sample, meter: meter.evidence() };
  };

  let timedResult: { sample: MetricSample; meter: MeterEvidence };
  let memory: MemoryPeakObservation | undefined;
  if (memorySampler) {
    const window = requirePerformanceEvidence(
      await measurePeakMemoryWindow(
        timed,
        { state: 'AVAILABLE', value: memorySampler },
        cancellableMemoryWindowOptions(memoryWindowOptions, cancellation),
      ),
      'peakMemory',
    );
    timedResult = window.result;
    memory = window.memory;
    timedResult.sample.peakMemoryBytes = memory.maximumBytes;
  } else {
    timedResult = await timed();
  }

  const longtasks = timedResult.meter.longtasks;
  if (scenario.metrics.includes('longtasks') && longtasks.state !== 'AVAILABLE') {
    if (longtasks.state === 'UNAVAILABLE') {
      throw new MeasurementProtocolUnavailable(
        longtasks.status, longtasks.reasonCode, longtasks.reason,
      );
    }
    throw new MeasurementProtocolUnavailable(
      'ERROR', 'LONGTASK_EVIDENCE_UNAVAILABLE', 'long-task metric was requested but no observer evidence was retained',
    );
  }

  const sample = normalizeBatchCosts(timedResult.sample, batch.innerIterations);
  const ratios = rateRatioComponents(ctx, sample.batchWallMs!, batch);
  return {
    sample,
    ratios,
    ...(duration ? { duration } : {}),
    presentationUnitSources,
    meter: timedResult.meter,
    ...(memory ? { memory } : {}),
  };
}

function requirePerformanceEvidence<T>(evidence: PerformanceEvidence<T>, label: string): T {
  if (evidence.state === 'AVAILABLE') return evidence.value;
  throw new MeasurementProtocolUnavailable(
    evidence.status,
    evidence.reasonCode,
    `${label}: ${evidence.reason}`,
  );
}

function preflightLongTaskMeasurement(requested: boolean): void {
  if (!requested) return;
  if (typeof PerformanceObserver !== 'function') {
    throw new MeasurementProtocolUnavailable(
      'NA_BROWSER', 'LONGTASK_OBSERVER_UNAVAILABLE', 'PerformanceObserver is unavailable in this realm',
    );
  }
  const supported = (PerformanceObserver as typeof PerformanceObserver & { supportedEntryTypes?: readonly string[] }).supportedEntryTypes;
  if (Array.isArray(supported) && !supported.includes('longtask')) {
    throw new MeasurementProtocolUnavailable(
      'NA_BROWSER', 'LONGTASK_ENTRY_TYPE_UNSUPPORTED', "PerformanceObserver does not support the 'longtask' entry type",
    );
  }
}

function operationTelemetry(result: OpResult): OperationFinalCounters | undefined {
  return result.output?.telemetry
    ?? result.frames?.telemetry
    ?? result.demux?.telemetry
    ?? result.metadata?.telemetry
    ?? (result.seek as { telemetry?: OperationFinalCounters } | undefined)?.telemetry
    ?? result.probeMetadatas?.[0]?.metadata.telemetry;
}

function observedTargetWrites(output: MediaBytes, telemetry: OperationFinalCounters | undefined): number | undefined {
  const legacy = output.targetWrites;
  const counted = telemetry?.writeCount;
  if (legacy !== undefined && counted !== undefined && legacy !== counted) {
    throw new MeasurementProtocolUnavailable(
      'ERROR', 'TARGET_WRITE_COUNTER_MISMATCH',
      `output reported ${legacy} writes but final telemetry reported ${counted}`,
    );
  }
  return counted ?? legacy;
}

function outputByteLength(output: MediaBytes): number {
  return output.variants?.length
    ? output.variants.reduce((sum, variant) => sum + variant.bytes.byteLength, 0)
    : output.bytes.byteLength;
}

function benchmarkPresentationDuration(
  golden: GoldenStore,
  result: OpResult,
  scenario: Scenario,
): PerformanceEvidence<PresentationDuration> {
  const sourceSec = mediaSecFromContext(golden, result, scenario);
  const rational = golden.meta?.tracks.find((track) => track.type === 'video')?.fpsProvenance?.rational;
  if (scenario.op === 'trim') {
    const range = asTrimRange(scenario.options);
    const presentedDurationUs = sourceSec !== undefined
      ? Math.max(1, Math.round(sourceSec * 1_000_000))
      : range.endUs;
    let processedIntervalUs: number;
    try {
      processedIntervalUs = resolveEffectiveTrimInterval(range, presentedDurationUs).effectiveDurationUs;
    } catch {
      processedIntervalUs = Math.max(0, Math.min(range.endUs, presentedDurationUs) - range.startUs);
    }
    return resolvePresentationDuration(
      'processed-interval',
      { processedIntervalUs },
      'requested effective trim presentation interval',
    );
  }
  if (scenario.op === 'decrypt') {
    return resolvePresentationDuration(
      'source-presentation',
      {
        ...(sourceSec !== undefined ? { sourcePresentationUs: sourceSec * 1_000_000 } : {}),
        ...(rational ? { sourceRational: rational } : {}),
      },
      'digest-verified selected encrypted source presentation duration',
    );
  }
  if (result.output) return inspectOutputPresentation(result.output).duration;
  return resolvePresentationDuration(
    'source-presentation',
    {
      ...(sourceSec !== undefined ? { sourcePresentationUs: sourceSec * 1_000_000 } : {}),
      ...(rational ? { sourceRational: rational } : {}),
    },
    'digest-verified source presentation timeline',
  );
}

function normalizeBatchCosts(sample: MetricSample, innerIterations: number): MetricSample {
  const batchWallMs = sample.wallMs;
  if (batchWallMs === undefined || !Number.isFinite(batchWallMs) || batchWallMs <= 0) {
    throw new MeasurementProtocolUnavailable('ERROR', 'BENCH_BATCH_WALL_INVALID', 'batch wall must be finite and positive');
  }
  const normalized: MetricSample = {
    ...sample,
    batchWallMs,
    wallMs: batchWallMs / innerIterations,
  };
  for (const field of ['sourceReads', 'targetWrites', 'bytesOut', 'longtaskMs'] as const) {
    const value = normalized[field];
    if (value !== undefined) normalized[field] = value / innerIterations;
  }
  return normalized;
}

function rateRatioComponents(
  ctx: MeasureContext,
  batchWallMs: number,
  batch: AdaptiveBatchRequest,
): Partial<Record<MetricId, BenchRatioComponent>> {
  const denominator = batchWallMs / 1000;
  const identity = `${batch.phase}:${batch.repetition}`;
  const component = (numerator: number | undefined): BenchRatioComponent | undefined =>
    numerator !== undefined ? { identity, numerator, denominator } : undefined;
  return {
    ...(component(ctx.mediaDuration ? ctx.mediaDuration.durationUs / 1_000_000 : undefined)
      ? { throughputRealtime: component(ctx.mediaDuration ? ctx.mediaDuration.durationUs / 1_000_000 : undefined)! }
      : {}),
    ...(component(ctx.decodedFrames) ? { decodeFps: component(ctx.decodedFrames)! } : {}),
    ...(component(ctx.encodedFrames) ? { encodeFps: component(ctx.encodedFrames)! } : {}),
    ...(component(ctx.ops) ? { opsPerSec: component(ctx.ops)! } : {}),
    ...(component(ctx.packets) ? { packetsPerSec: component(ctx.packets)! } : {}),
    ...(component(ctx.frames) ? { framesPerSec: component(ctx.frames)! } : {}),
    ...(component(ctx.sampleFrames) ? { sampleFramesPerSec: component(ctx.sampleFrames)! } : {}),
  };
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

  // Detect environment, coarse codec index, and the executed strict-pixel behavior once per run.
  const [env, support, pixelBehavior]: [EnvInfo, CodecSupport, PixelBehaviorEvidence] = await Promise.all([
    detectEnv(),
    detectCodecSupport(),
    runPixelBehaviorSelfTest(),
  ]);
  // Downstream legacy consumers may still read these fields. Their value is now the executed
  // behavior result, never a user-agent-family allow/deny table.
  const strictPixels = pixelBehavior.state === 'SUPPORTED';
  support.strictRgbaPixels = strictPixels;
  support.strictGoldenRgba = strictPixels;
  support.strictSourceRgba = strictPixels;

  // Build the run env (attached to every result) once.
  const runEnvBase: RunEnv = {
    suiteVersion: SUITE_VERSION,
    engineId: '', // filled per engine below
    browser: opts.browser,
    ...(env.version ? { browserVersion: env.version } : {}),
    ...(env.userAgent ? { userAgent: env.userAgent } : {}),
    ...(env.gpu ? { gpu: env.gpu } : {}),
  };
  (runEnvBase as RunEnv & { pixelBehavior: PixelBehaviorEvidence }).pixelBehavior = pixelBehavior;

  const results: ScenarioResult[] = [];
  const scenarioById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  const fixtureIntegrityRuntime = opts.fixtureIntegrityRuntime ?? createRunFixtureIntegrityRuntime();
  const integrityMirrorPaths = new Map<string, string[]>();

  // §6/§10 Per-scenario media-file rotation: pick ONE input per scenario for THIS run (seeded on
  // randomSeed, reproducible), shared by every engine so a run replays from (runSeed, corpus). A
  // selection-subsystem failure NEVER executes an unverified fallback — every expected cell is retained
  // as NA_ASSET with one shared corpus diagnostic. corpusChecksum makes the picked corpus visible in every result's env; §6.3
  // shape warnings surface corpus bugs instead of hiding them (a dropped real file is a corpus bug,
  // never an engine NA).
  const rotate = opts.rotateMedia ?? true;
  const exhaustive = opts.exhaustiveMedia === true;
  let selections = new Map<string, ScenarioSelection>();
  let selectionFailureReason: string | undefined;
  // Exhaustive mode (§6.2): every scenario's FULL ordered candidate list (baked + all real files), run
  // per-file and aggregated. Empty ⇒ fall back to the single-selection path (baked-only per scenario).
  let exhaustiveCandidates = new Map<string, ScenarioSelection[]>();
  try {
    const mediaSources = await loadScenarioSources();
    for (const [scenarioId, row] of mediaSources) {
      for (const file of row.files) {
        const paths = integrityMirrorPaths.get(file.sha256) ?? [];
        const scenarioPath = `scenarios/${scenarioId}/${file.file}`;
        if (!paths.includes(scenarioPath)) paths.push(scenarioPath);
        if (file.poolPath && !paths.includes(file.poolPath)) paths.push(file.poolPath);
        integrityMirrorPaths.set(file.sha256, paths);
      }
    }
    const scenarioContractDigests = new Map(
      scenarios.map((scenario) => [scenario.id, scenario.definitionHash] as const),
    );
    selections = selectForRun(scenarios, opts.randomSeed ?? '', mediaSources, {
      rotate,
      scenarioContractDigests,
    });
    if (exhaustive) {
      exhaustiveCandidates = candidatesForRun(scenarios, mediaSources, {
        rotate,
        scenarioContractDigests,
      });
    }
    for (const sel of selections.values()) {
      for (const warning of sel.shapeWarnings) {
        console.warn(`media-selection [${sel.scenarioId}]: ${warning}`);
      }
    }
  } catch (err) {
    selectionFailureReason = `[CORPUS_SELECTION_UNAVAILABLE] ${errMessage(err)}`;
    console.warn(`media-selection: ${selectionFailureReason}; no unverified fallback will execute`);
    selections = new Map();
    exhaustiveCandidates = new Map();
  }

  // Content verification is demand-driven. These maps contain only work that is currently in flight;
  // settled byte buffers are deliberately not cached at run scope. A full exhaustive catalog can be
  // tens of GiB, so retaining successful preparations would make the runner's memory proportional to
  // the corpus and prevent the first matrix cell from ever starting. Engine-independent blocks and
  // the frozen resolved identity graph are metadata-only and are safe to retain for fairness.
  const inFlightByteLoads = new Map<string, Promise<ArrayBuffer>>();
  const inFlightPreparations = new Map<string, Promise<PreparedSelection>>();
  const blockedPreparations = new Map<
    string,
    Exclude<PreparedSelection, { state: 'VERIFIED' | 'SKIPPED' }>
  >();
  const preparedSelectionContracts = new Map<string, ScenarioSelection>();
  const reportedCorpusIssues = new Set<string>();
  const verifyResolvedInputs = async (
    resolvedInputs: readonly ResolvedInput[],
  ): Promise<
    | { state: 'VERIFIED'; verified: readonly VerifiedContent[] }
    | { state: 'NA_ASSET'; reason: string }
    | { state: 'ERROR'; reason: string }
    | { state: 'SKIPPED'; reason: string }
  > => {
    if (opts.signal?.aborted) {
      return { state: 'SKIPPED', reason: '[RUN_CANCELLED] content verification cancelled' };
    }
    const declared = resolvedContentIdentities(resolvedInputs);
    if (!declared.identities) {
      return { state: 'NA_ASSET', reason: declared.reason ?? '[CORPUS_IDENTITY_MISSING] invalid identity' };
    }
    const activeBytes = new Map<string, Uint8Array>();
    const resolvedByLogicalPath = new Map(resolvedInputs.map((resolved) => [resolved.urlAssetPath, resolved]));
    for (const resolved of resolvedInputs) {
      const activeAssetId = resolved.id.includes(':') ? resolved.urlAssetPath : resolved.id;
      const active = await fixtureIntegrityRuntime.resolveMedia(activeAssetId);
      if (active.state === 'out-of-scope') continue;
      if (active.state !== 'ready') {
        const blocked = activeMediaBlock(active);
        return { state: blocked.status, reason: blocked.reason };
      }
      if (
        resolved.sha256 !== undefined &&
        resolved.sha256.toLowerCase() !== active.actualSha256
      ) {
        // A scenario-local robustness mirror may intentionally contain already-mutated bytes while
        // the catalog identity names the original source. Do not admit it, but allow the exact SHA
        // mirror search below to find another local copy of the declared content.
        continue;
      }
      if (resolved.sizeBytes !== undefined && resolved.sizeBytes !== active.bytes.byteLength) {
        continue;
      }
      activeBytes.set(resolved.urlAssetPath, active.bytes);
    }
    const result = await withVerifiedContent(
      declared.identities,
      async (identity) => {
        const active = activeBytes.get(identity.logicalPath);
        if (active) return active;
        const identityKey = `${identity.logicalPath}\u0000${identity.sha256}\u0000${identity.sizeBytes}`;
        let load = inFlightByteLoads.get(identityKey);
        if (!load) {
          let tracked!: Promise<ArrayBuffer>;
          tracked = fetch(mediaAssetUrl(identity.logicalPath), {
            cache: 'no-store',
            ...(opts.signal ? { signal: opts.signal } : {}),
          }).then(async (response) => {
            const resolved = resolvedByLogicalPath.get(identity.logicalPath);
            if (
              response.status === 404 &&
              resolved !== undefined &&
              resolved.id !== resolved.urlAssetPath
            ) {
              response = await fetch(mediaAssetUrl(resolved.id), {
                cache: 'no-store',
                ...(opts.signal ? { signal: opts.signal } : {}),
              });
            }
            if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
            let bytes = new Uint8Array(await response.arrayBuffer());
            // Scenario mirrors are a delivery optimization, not an authority. A stale mirror may
            // exist (so a 404-only fallback is insufficient); retry the flat baked asset and let the
            // outer integrity gate accept it only when the declared SHA/size match exactly.
            if (
              resolved !== undefined &&
              resolved.id !== resolved.urlAssetPath &&
              (bytes.byteLength !== identity.sizeBytes || sha256Hex(bytes) !== identity.sha256)
            ) {
              const fallback = await fetch(mediaAssetUrl(resolved.id), {
                cache: 'no-store',
                ...(opts.signal ? { signal: opts.signal } : {}),
              });
              if (!fallback.ok) throw new Error(`${fallback.status} ${fallback.statusText}`);
              bytes = new Uint8Array(await fallback.arrayBuffer());
            }
            if (bytes.byteLength !== identity.sizeBytes || sha256Hex(bytes) !== identity.sha256) {
              const mirrors = integrityMirrorPaths.get(identity.sha256) ?? [];
              for (const logicalPath of mirrors) {
                if (logicalPath === identity.logicalPath || logicalPath === resolved?.id) continue;
                const mirror = await fetch(mediaAssetUrl(logicalPath), {
                  cache: 'no-store',
                  ...(opts.signal ? { signal: opts.signal } : {}),
                });
                if (!mirror.ok) continue;
                const candidate = new Uint8Array(await mirror.arrayBuffer());
                if (candidate.byteLength === identity.sizeBytes && sha256Hex(candidate) === identity.sha256) {
                  bytes = candidate;
                  break;
                }
              }
            }
            return bytes.buffer;
          }).finally(() => {
            if (inFlightByteLoads.get(identityKey) === tracked) {
              inFlightByteLoads.delete(identityKey);
            }
          });
          inFlightByteLoads.set(identityKey, tracked);
          load = tracked;
        }
        return load;
      },
      async (verified) => verified,
    );
    if (opts.signal?.aborted) {
      return { state: 'SKIPPED', reason: '[RUN_CANCELLED] content verification cancelled' };
    }
    if (result.state === 'VERIFIED') return { state: 'VERIFIED', verified: result.verified };
    return {
      state: 'NA_ASSET',
      reason: result.issues
        .map((issue) => `[${issue.reasonCode}] ${issue.detail}`)
        .sort()
        .join('; ') || '[CORPUS_NO_VERIFIED_CANDIDATE] no verified bytes',
    };
  };
  const verifyResolvedInputStreams = async (
    resolvedInputs: readonly ResolvedInput[],
  ): Promise<
    | {
        state: 'VERIFIED';
        verified: readonly VerifiedContent[];
        verifiedStreamContents: readonly VerifiedStreamContent[];
      }
    | { state: 'NA_ASSET'; reason: string }
    | { state: 'ERROR'; reason: string }
    | { state: 'SKIPPED'; reason: string }
  > => {
    if (opts.signal?.aborted) {
      return { state: 'SKIPPED', reason: '[RUN_CANCELLED] content verification cancelled' };
    }
    const declared = resolvedContentIdentities(resolvedInputs);
    if (!declared.identities) {
      return { state: 'NA_ASSET', reason: declared.reason ?? '[CORPUS_IDENTITY_MISSING] invalid identity' };
    }
    if (declared.identities.length !== 1) {
      return {
        state: 'ERROR',
        reason: '[CORPUS_STREAM_TRANSPORT_CARDINALITY] authenticated URL transport requires exactly one input',
      };
    }
    const identity = declared.identities[0]!;
    const result = await verifyContentStream(identity, async () => {
      const response = await fetch(mediaAssetUrl(identity.logicalPath), {
        cache: 'no-store',
        ...(opts.signal ? { signal: opts.signal } : {}),
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      if (!response.body) throw new Error('response has no readable body');
      return response.body;
    });
    if (opts.signal?.aborted) {
      return { state: 'SKIPPED', reason: '[RUN_CANCELLED] content verification cancelled' };
    }
    if (result.state === 'VERIFIED_STREAM') {
      return { state: 'VERIFIED', verified: [], verifiedStreamContents: [result] };
    }
    return {
      state: 'NA_ASSET',
      reason: `[${result.issue.reasonCode}] ${result.issue.detail}`,
    };
  };
  const prepareSelection = (
    selection: ScenarioSelection,
    prepareOptions: PrepareSelectionOptions = {},
  ): Promise<PreparedSelection> => {
    const useStreamTransport = prepareOptions.authenticatedStreamTransport === true &&
      boundedProbeStreamTransportEligible(selection.effectiveScenario, selection.resolvedInputs);
    // Transport mode is part of preparation identity: retained bytes and an authenticated URL are
    // different adapter-visible contracts and must never share an in-flight or blocked result.
    const selectionKey = `${selectionPreparationKey(selection)}\u0000transport:${
      useStreamTransport ? AUTHENTICATED_RANGE_PROBE_FEATURE : 'retained-bytes'
    }`;
    const blocked = blockedPreparations.get(selectionKey);
    if (blocked) return Promise.resolve(blocked);
    const inFlight = inFlightPreparations.get(selectionKey);
    if (inFlight) return inFlight;
    const pending = (async (): Promise<PreparedSelection> => {
      if (opts.signal?.aborted) return { state: 'SKIPPED', reason: '[RUN_CANCELLED] content verification cancelled' };
      let decryptKeyOverride: DecryptKey | undefined;
      let authoritativeKeyRecord: AuthoritativeKeyRecord | undefined;
      let derivedCleartextBase: Extract<DerivedDecryptSelectionPreflight, { state: 'READY' }>['cleartextBase'] | undefined;
      if (selection.effectiveScenario.op === 'decrypt') {
        const derived = preflightDerivedDecryptSelection(selection);
        if (derived?.state === 'BLOCKED') {
          return { state: derived.status, reason: derived.reason };
        }
        if (derived?.state === 'READY') {
          decryptKeyOverride = derived.key;
          derivedCleartextBase = derived.cleartextBase;
        } else {
          const keyPreflight = await preflightEncryptionKey(selection.effectiveScenario.options);
          if (keyPreflight.state === 'BLOCKED') {
            return {
              state: keyPreflight.status,
              reason: `[${keyPreflight.reasonCode}] ${keyPreflight.detail}`,
            };
          }
          decryptKeyOverride = keyPreflight.key;
          authoritativeKeyRecord = keyPreflight.record;
        }
      }
      const rootVerification = useStreamTransport
        ? await verifyResolvedInputStreams(selection.resolvedInputs)
        : await verifyResolvedInputs(selection.resolvedInputs);
      if (rootVerification.state !== 'VERIFIED') return rootVerification;

      const retainedRoot = rootVerification.verified[0];
      const encryptionFixtureEvidence = retainedRoot
        ? preflightEncryptionFixtureEvidence(selection.effectiveScenario, retainedRoot.bytes)
        : { state: 'READY' as const };
      if (encryptionFixtureEvidence.state === 'BLOCKED') {
        return { state: 'ERROR', reason: encryptionFixtureEvidence.reason };
      }

      let resolvedInputs: ResolvedInput[] = selection.resolvedInputs.map((resolved) => ({
        ...resolved,
        integrity: 'VERIFIED',
      }));
      let verified: readonly VerifiedContent[] = rootVerification.verified;
      const verifiedStreamContents: readonly VerifiedStreamContent[] | undefined =
        'verifiedStreamContents' in rootVerification && Array.isArray(rootVerification.verifiedStreamContents)
          ? rootVerification.verifiedStreamContents as readonly VerifiedStreamContent[]
          : undefined;
      if (derivedCleartextBase) {
        const baseInput: ResolvedInput = {
          id: `cleartext-base:${derivedCleartextBase.logicalPath}`,
          urlAssetPath: derivedCleartextBase.logicalPath,
          sha256: derivedCleartextBase.sha256,
          sizeBytes: derivedCleartextBase.sizeBytes,
          integrity: 'DECLARED',
          transport: {
            kind: 'oracle-resource',
            role: 'cleartext-base',
            sourceUri: derivedCleartextBase.logicalPath,
          },
        };
        const baseVerification = await verifyResolvedInputs([baseInput]);
        if (baseVerification.state !== 'VERIFIED') return baseVerification;
        resolvedInputs.push({ ...baseInput, integrity: 'VERIFIED' });
        verified = [...verified, ...baseVerification.verified];
      } else if (selection.effectiveScenario.op === 'decrypt') {
        const cleartextAsset = readStringOption(selection.effectiveScenario.options, [
          'cleartextBaseAsset',
          'cleartextAsset',
          'cleartextAssetId',
          'goldenAsset',
          'goldenAssetId',
        ]);
        if (cleartextAsset) {
          const manifest = await fixtureManifestById();
          if (!manifest) {
            return {
              state: 'NA_ASSET',
              reason: '[CORPUS_MANIFEST_UNAVAILABLE] cannot bind decrypt clear-reference identity',
            };
          }
          const entry = manifest.get(cleartextAsset);
          if (
            !entry ||
            typeof entry.sha256 !== 'string' ||
            !/^[0-9a-f]{64}$/.test(entry.sha256) ||
            !Number.isSafeInteger(entry.sizeBytes) ||
            Number(entry.sizeBytes) < 0
          ) {
            return {
              state: 'NA_ASSET',
              reason: `[DECRYPT_CLEAR_REFERENCE_IDENTITY_MISSING] '${cleartextAsset}' lacks a complete manifest SHA/size identity`,
            };
          }
          const baseInput: ResolvedInput = {
            id: `cleartext-base:${cleartextAsset}`,
            urlAssetPath: cleartextAsset,
            sha256: entry.sha256,
            sizeBytes: Number(entry.sizeBytes),
            integrity: 'DECLARED',
            transport: {
              kind: 'oracle-resource',
              role: 'cleartext-base',
              sourceUri: cleartextAsset,
            },
          };
          const baseVerification = await verifyResolvedInputs([baseInput]);
          if (baseVerification.state !== 'VERIFIED') return baseVerification;
          resolvedInputs.push({ ...baseInput, integrity: 'VERIFIED' });
          verified = [...verified, ...baseVerification.verified];
        }
      }
      const scheme = recordOption(selection.effectiveScenario.options)?.scheme;
      const selectedRoot = selection.resolvedInputs.length === 1
        ? selection.resolvedInputs[0]
        : undefined;
      const hlsOptions = selectedRoot
        ? hlsClosureOptions(selection.effectiveScenario.options, selectedRoot)
        : undefined;
      const hlsContract = hlsOptions ? hlsResourceIndexFromOptions(hlsOptions) : undefined;
      if (scheme === 'hls-aes128' || scheme === 'hls-sample-aes' || hlsContract !== undefined) {
        if (selection.resolvedInputs.length !== 1) {
          return {
            state: 'ERROR',
            reason: '[HLS_RESOURCE_ROOT_INVALID] HLS closure requires exactly one selected playlist root',
          };
        }
        const root = selection.resolvedInputs[0]!;
        if (!root.sha256 || root.sizeBytes === undefined) {
          return { state: 'NA_ASSET', reason: '[HLS_RESOURCE_ROOT_IDENTITY_MISSING] playlist identity is incomplete' };
        }
        const closure = await preflightHlsResourceIndex(
          hlsOptions ?? selection.effectiveScenario.options,
          {
            assetId: root.id,
            logicalPath: root.urlAssetPath,
            sha256: root.sha256,
            sizeBytes: root.sizeBytes,
          },
          rootVerification.verified[0]!.bytes,
          async (url) => {
            try {
              const response = await fetch(url, {
                cache: 'no-store',
                ...(opts.signal ? { signal: opts.signal } : {}),
              });
              if (response.status === 404) return { state: 'MISSING', detail: `${url} returned HTTP 404` };
              if (!response.ok) return { state: 'ERROR', detail: `${url} returned HTTP ${response.status}` };
              try {
                return { state: 'OK', value: await response.json() };
              } catch (error) {
                return { state: 'ERROR', detail: `${url} is not valid JSON: ${errMessage(error)}` };
              }
            } catch (error) {
              return { state: 'ERROR', detail: `failed to fetch ${url}: ${errMessage(error)}` };
            }
          },
          authoritativeKeyRecord,
        );
        if (closure.state === 'BLOCKED') {
          return { state: closure.status, reason: `[${closure.reasonCode}] ${closure.detail}` };
        }
        const sidecars: ResolvedInput[] = closure.resources.map((resource) => ({
          id: resource.uri,
          urlAssetPath: resource.logicalPath,
          sha256: resource.sha256,
          sizeBytes: resource.sizeBytes,
          integrity: 'DECLARED',
          transport: {
            kind: 'hls-resource',
            role: resource.role,
            sourceUri: resource.uri,
          },
        }));
        const sidecarVerification = await verifyResolvedInputs(sidecars);
        if (sidecarVerification.state !== 'VERIFIED') return sidecarVerification;
        resolvedInputs = [
          ...resolvedInputs,
          ...sidecars.map((sidecar) => ({ ...sidecar, integrity: 'VERIFIED' as const })),
        ];
        verified = [...verified, ...sidecarVerification.verified];
      }

      const identities = resolvedContentIdentities(resolvedInputs).identities!;
      const preparedSelection: ScenarioSelection = {
        ...selection,
        resolvedInputs,
        selectedPath: resolvedInputs.map((resolved) => resolved.urlAssetPath).join('+'),
        executedInputDigest: contentIdentityDigest(identities),
      };
      return {
        state: 'VERIFIED',
        verified,
        ...(verifiedStreamContents ? { verifiedStreamContents } : {}),
        resolvedInputs,
        selection: preparedSelection,
        ...(decryptKeyOverride ? { decryptKeyOverride } : {}),
      };
    })();
    let indexed!: Promise<PreparedSelection>;
    indexed = pending.then((prepared): PreparedSelection => {
      if (prepared.state === 'VERIFIED') {
        const frozen = preparedSelectionContracts.get(selectionKey);
        if (frozen && selectionPreparationKey(frozen) !== selectionPreparationKey(prepared.selection)) {
          const changed = {
            state: 'NA_ASSET' as const,
            reason:
              '[CORPUS_SELECTION_CHANGED_DURING_RUN] the digest-bound resolved input graph changed between engine cells',
          };
          blockedPreparations.set(selectionKey, changed);
          if (!reportedCorpusIssues.has(selectionKey)) {
            reportedCorpusIssues.add(selectionKey);
            console.warn(`media-selection corpus [${selection.scenarioId}]: ${changed.reason}`);
          }
          return changed;
        }
        if (!frozen) preparedSelectionContracts.set(selectionKey, prepared.selection);
      } else if (prepared.state !== 'SKIPPED') {
        blockedPreparations.set(selectionKey, prepared);
      }
      if (
        prepared.state !== 'VERIFIED' &&
        prepared.state !== 'SKIPPED' &&
        !reportedCorpusIssues.has(selectionKey)
      ) {
        reportedCorpusIssues.add(selectionKey);
        console.warn(`media-selection corpus [${selection.scenarioId}]: ${prepared.reason}`);
      }
      return prepared;
    }).finally(() => {
      if (inFlightPreparations.get(selectionKey) === indexed) {
        inFlightPreparations.delete(selectionKey);
      }
    });
    inFlightPreparations.set(selectionKey, indexed);
    return indexed;
  };

  // The frozen candidate manifest already carries full SHA/size identities, so the corpus checksum
  // does not require downloading any media body. Expanded dependencies (for example HLS sidecars)
  // are added to the prepared selection and to the per-observation execution fingerprint on demand.
  runEnvBase.corpusChecksum = exhaustive
    ? computeCorpusChecksum([...exhaustiveCandidates.values()].flat())
    : computeCorpusChecksum(selections.values());
  if (!selectionFailureReason) {
    const picked = [...selections.values()];
    const rotatedReal = picked.filter((selection) => !selection.isBaked).length;
    const bakedCount = picked.length - rotatedReal;
    const exhaustiveFiles = exhaustive
      ? [...exhaustiveCandidates.values()].reduce((count, candidates) => count + candidates.length, 0)
      : 0;
    console.info(
      `media-selection: ${selections.size} scenarios — ${rotatedReal} rotated-real, ${bakedCount} baked ` +
        `(rotate=${rotate}, exhaustive=${exhaustive}${exhaustive ? ` [${exhaustiveFiles} file-runs]` : ''}, ` +
        `seed='${opts.randomSeed ?? ''}', corpus=${runEnvBase.corpusChecksum})`,
    );
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
    const exhaustiveList = exhaustive
      ? (exhaustiveCandidates.get(scenario.id) ?? (selection ? [selection] : []))
      : undefined;
    const reg = getEngine(engineId);
    if (!reg) {
      // Unknown engine id: surface as ERROR cells rather than throwing the whole matrix.
      const r: ScenarioResult = selection
        ? matrixSelectionStatusResult(
            engineId,
            opts.browser,
            scenario,
            'ERROR',
            `unknown engine id: ${engineId}`,
            selection,
            exhaustiveList,
            runEnvBase,
            opts.randomSeed,
          )
        : {
            engineId,
            browser: opts.browser,
            scenarioId: scenario.id,
            family: scenario.family,
            status: 'ERROR',
            oracleOutcomes: [],
            reason: `unknown engine id: ${engineId}`,
            env: { ...runEnvBase, engineId },
          };
      if (scenario.primaryMetric !== undefined) r.primaryMetric = scenario.primaryMetric;
      await opts.resultReuse?.put(r).catch(() => undefined);
      results.push(r);
      opts.onResult?.(r);
      done += 1;
      opts.onProgress?.(done, total, `${scenario.id} / ${engineId}`);
      continue;
    }
    if (selectionFailureReason || !selection) {
      const blocked: ScenarioResult = {
        engineId,
        browser: opts.browser,
        scenarioId: scenario.id,
        family: scenario.family,
        status: 'NA_ASSET',
        oracleOutcomes: [],
        reason: selectionFailureReason ?? '[CORPUS_NO_VERIFIED_CANDIDATE] scenario has no selected candidate',
        measurement: { state: 'NOT_REQUESTED' },
        env: { ...runEnvBase, engineId },
        ...(scenario.primaryMetric ? { primaryMetric: scenario.primaryMetric } : {}),
      };
      await opts.resultReuse?.put(blocked).catch(() => undefined);
      results.push(blocked);
      opts.onResult?.(blocked);
      done += 1;
      opts.onProgress?.(done, total, `${scenario.id} / ${engineId} (no verified candidate)`);
      continue;
    }

      const label = `${scenario.id} / ${engineId}`;
      // Fresh engine per (engine, scenario) cell → clean memory (§10.2).
      let engine: MediaEngine | undefined;
      let result: ScenarioResult;
      try {
        engine = await reg.factory();
      } catch (err) {
        result = matrixSelectionStatusResult(
          engineId,
          opts.browser,
          scenario,
          'ERROR',
          `failed to construct engine: ${errMessage(err)}`,
          selection,
          exhaustiveList,
          runEnvBase,
          opts.randomSeed,
        );
        if (scenario.primaryMetric !== undefined) result.primaryMetric = scenario.primaryMetric;
        await opts.resultReuse?.put(result).catch(() => undefined);
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
        disabledCellReason(engine.id, scenario.id, opts.disabledPolicy, opts.browser) ??
        disabledCellReason(engineId, scenario.id, opts.disabledPolicy, opts.browser);
      if (disabledReason) {
        await disposeConstructedEngine(engine, opts.signal);
        result = matrixSelectionStatusResult(
          engine.id,
          opts.browser,
          scenario,
          'SKIPPED',
          disabledReason,
          selection,
          exhaustiveList,
          runEnvBase,
          opts.randomSeed,
        );
        if (scenario.primaryMetric !== undefined) result.primaryMetric = scenario.primaryMetric;
        await opts.resultReuse?.put(result).catch(() => undefined);
        results.push(result);
        opts.onResult?.(result);
        done += 1;
        opts.onProgress?.(done, total, `${scenario.id} / ${engine.id} (skipped)`);
        continue;
      }

      // §10 STALE-PASS guard: fold the selected input(s) into the reuse key so a run that picked a
      // DIFFERENT file — or, in exhaustive mode, a different candidate SET — can never reuse a prior PASS
      // validated against other bytes. Non-exhaustive → the single pick's `selectionCacheTag` ('baked' or
      // the sha prefix). Exhaustive → `exhaustive:<n>:<tag,tag,…>` over the FULL ordered candidate list, so
      // the aggregate PASS is reused ONLY when EVERY file in the set is unchanged (honest: a single-file
      // PASS is never enough to satisfy an all-files audit). The store keys `put` off result.scenarioId, so
      // we stamp the composite key onto the STORED copy only (via withCacheKey) and restore the true
      // scenarioId on the cache-hit read path — live results always carry the real id.
      const cacheTag =
        exhaustiveList && exhaustiveList.length > 0
          ? `exhaustive:${exhaustiveList.length}:${exhaustiveList.map(fullSelectionCacheTag).sort().join(',')}`
          : selection
            ? fullSelectionCacheTag(selection)
            : undefined;
      let cacheScenarioKey = cacheTag ? `${scenario.id}#${cacheTag}` : scenario.id;
      const withCacheKey = (r: ScenarioResult): ScenarioResult =>
        cacheScenarioKey === scenario.id ? r : { ...r, scenarioId: cacheScenarioKey };

      // Read a candidate keyed by the selected input(s). The validated persistent cache may satisfy
      // an exact immutable selection below; every other store/candidate continues through runOne,
      // which reruns current tuple/browser/asset/golden preflight and validates the fingerprint.
      // Old boolean rows and stale cached NAs therefore cannot bypass changed support evidence.
      const cacheLookupStartedAt = performance.now();
      let cachedCandidate = await opts.resultReuse
        ?.get(engine.id, cacheScenarioKey, opts.browser)
        .catch(() => undefined);
      const cacheLookupDurationMs = performance.now() - cacheLookupStartedAt;

      let validatedCapabilities: CapabilitySet;
      try {
        validatedCapabilities = validateCapabilitySet(engine, engine.capabilities());
      } catch (error) {
        result = matrixSelectionStatusResult(
          engine.id,
          opts.browser,
          scenario,
          'ERROR',
          errMessage(error),
          selection,
          exhaustiveList,
          runEnvBase,
          opts.randomSeed,
        );
        if (scenario.primaryMetric !== undefined) result.primaryMetric = scenario.primaryMetric;
        await disposeConstructedEngine(engine, opts.signal);
        await opts.resultReuse?.put(withCacheKey(result)).catch(() => undefined);
        results.push(result);
        opts.onResult?.(result);
        done += 1;
        opts.onProgress?.(done, total, label);
        continue;
      }
      const preNeg = negotiateCoarseEngine(validatedCapabilities, scenario.requires);
      if (!preNeg.ok) {
        result = matrixSelectionStatusResult(
          engine.id,
          opts.browser,
          scenario,
          preNeg.status,
          preNeg.reason,
          selection,
          exhaustiveList,
          runEnvBase,
          opts.randomSeed,
        );
        if (scenario.primaryMetric !== undefined) result.primaryMetric = scenario.primaryMetric;
        await disposeConstructedEngine(engine, opts.signal);
        await opts.resultReuse?.put(withCacheKey(result)).catch(() => undefined);
        results.push(result);
        opts.onResult?.(result);
        done += 1;
        opts.onProgress?.(done, total, label);
        continue;
      }

      // Scale-probe read-mode applicability is capability-only and must precede content
      // preparation. In exhaustive mode a candidate set can span many GiB; fetching and hashing
      // every body before returning the already-known whole-file-only NA_ENGINE is both wasteful and
      // capable of exhausting the browser. Preserve the selected identities in the aggregate while
      // deciding the cell from declared adapter read modes alone.
      const matrixProbeBudget = probeBudgetFromOptions(scenario.options);
      const authenticatedStreamTransport = supportsAuthenticatedRangeProbeTransport(
        validatedCapabilities,
      );
      if (matrixProbeBudget) {
        const budgetSelections = exhaustiveList && exhaustiveList.length > 0
          ? exhaustiveList
          : [selection];
        const inputSizeBytes = Math.max(
          0,
          ...budgetSelections.map((candidate) => {
            const size = candidate.resolvedInputs[0]?.sizeBytes;
            return Number.isSafeInteger(size) && Number(size) >= 0 ? Number(size) : 0;
          }),
        );
        const budgetPreflight = probeBudgetPreflight(
          matrixProbeBudget,
          inputSizeBytes,
          validatedCapabilities.probeReadModes ?? ['whole-file'],
        );
        const transportFailure = !budgetPreflight.supported
          ? { reasonCode: budgetPreflight.reasonCode, detail: budgetPreflight.detail }
          : !authenticatedStreamTransport
            ? {
                reasonCode: 'PROBE_AUTHENTICATED_RANGE_TRANSPORT_UNAVAILABLE',
                detail:
                  `adapter declares a bounded probe read mode but not '${AUTHENTICATED_RANGE_PROBE_FEATURE}', so URL blocks cannot be bound to the admitted corpus digest`,
              }
            : undefined;
        if (transportFailure) {
          result = matrixSelectionStatusResult(
            engine.id,
            opts.browser,
            scenario,
            'NA_ENGINE',
            `[${transportFailure.reasonCode}] ${transportFailure.detail}`,
            selection,
            exhaustiveList,
            runEnvBase,
            opts.randomSeed,
          );
          if (scenario.primaryMetric !== undefined) result.primaryMetric = scenario.primaryMetric;
          await disposeConstructedEngine(engine, opts.signal);
          await opts.resultReuse?.put(withCacheKey(result)).catch(() => undefined);
          results.push(result);
          opts.onResult?.(result);
          if (exhaustiveList && exhaustiveList.length > 0) {
            opts.onFileProgress?.(
              exhaustiveList.length,
              exhaustiveList.length,
              `${scenario.id} / ${engine.id} / bounded-read preflight`,
            );
          }
          done += 1;
          opts.onProgress?.(done, total, `${label} (bounded-read NA_ENGINE)`);
          continue;
        }
      }

      // The browser's persistent result cache has already validated its epoch/TTL and looked up the
      // exact immutable input (or exhaustive input-set) key. Honor that hit before downloading and
      // hashing the same large bodies again. Generic/in-memory stores omit exactSelectionReuse and
      // continue through runOne's full current-fingerprint preflight below.
      const exactCachedResult = opts.resultReuse?.exactSelectionReuse === true
        ? exactPersistedSelectionResult(
            cachedCandidate ? restoreLogicalScenarioId(cachedCandidate, scenario.id) : undefined,
            engine.id,
            opts.browser,
            scenario,
            selection,
            exhaustiveList,
            runEnvBase,
            opts.randomSeed,
            opts.pillar,
            opts.benchOptions,
            cacheLookupDurationMs,
          )
        : undefined;
      if (exactCachedResult) {
        result = exactCachedResult;
        if (scenario.primaryMetric !== undefined && result.primaryMetric === undefined) {
          result.primaryMetric = scenario.primaryMetric;
        }
        await disposeConstructedEngine(engine, opts.signal);
        await opts.resultReuse?.put(withCacheKey(result)).catch(() => undefined);
        results.push(result);
        opts.onResult?.(result);
        if (exhaustiveList && exhaustiveList.length > 0) {
          opts.onFileProgress?.(
            exhaustiveList.length,
            exhaustiveList.length,
            `${scenario.id} / ${engine.id} / cached exact selection set`,
          );
        }
        done += 1;
        opts.onProgress?.(done, total, `${label} (cached)`);
        continue;
      }

      // §6.2 EXHAUSTIVE: run EVERY candidate file for this cell (same order for every engine) and
      // aggregate — cell PASSes only if ALL files pass; bench combines across passing files (sum/max/
      // median per metric). `engine` (constructed + negotiated OK) is reused for file 0; fresh engines
      // for the rest (runOne inits+disposes each). Bypasses the single-file path.
      if (exhaustive) {
        const list = exhaustiveList ?? [];
        if (list.length > 0) {
          try {
            result = await runExhaustiveCell(
              engine,
              engineId,
              reg,
              list,
              scenario,
              opts,
              support,
              runEnvBase,
              pillar,
              pixelBehavior,
              fixtureIntegrityRuntime,
              (candidate) => prepareSelection(candidate, { authenticatedStreamTransport }),
              cachedCandidate ? restoreLogicalScenarioId(cachedCandidate, scenario.id) : undefined,
            );
          } catch (error) {
            // One failed preparation/aggregation boundary is one ERROR cell, never a reason to abandon
            // every later scenario in the matrix. runOne is total, but the surrounding exhaustive
            // orchestration performs additional fetch, verification, construction, and aggregation work.
            await disposeConstructedEngine(engine, opts.signal);
            result = matrixSelectionStatusResult(
              engine.id,
              opts.browser,
              scenario,
              'ERROR',
              `[EXHAUSTIVE_CELL_ERROR] ${errMessage(error)}`,
              selection,
              list,
              runEnvBase,
              opts.randomSeed,
            );
          }
          if (scenario.primaryMetric !== undefined && result.primaryMetric === undefined) {
            result.primaryMetric = scenario.primaryMetric;
          }
          // Persist the aggregate under the SET-encoded key so a later run with the identical candidate
          // set can reuse the result instead of re-running every file.
          await opts.resultReuse?.put(withCacheKey(result)).catch(() => undefined);
          results.push(result);
          opts.onResult?.(result);
          done += 1;
          opts.onProgress?.(done, total, `${label} (exhaustive ×${list.length})`);
          continue;
        }
        // list empty ⇒ selection subsystem unavailable ⇒ fall through to the normal single (baked) path.
      }

      // Capability and disabled-policy gates deliberately precede content acquisition: an engine that
      // cannot execute the tuple must report NA_ENGINE without downloading an otherwise valid asset.
      // Successful preparation is held only for this one runOne call and becomes collectible as soon
      // as the cell completes.
      let prepared: PreparedSelection;
      try {
        prepared = await prepareSelection(selection, { authenticatedStreamTransport });
      } catch (error) {
        // Content preparation sits outside runOne. Keep an unexpected fetch/hash/preflight exception
        // local to this cell so the matrix advances instead of marking all following rows "Not run".
        result = selectedStatusResult(
          engine.id,
          opts.browser,
          scenario,
          selection,
          'ERROR',
          `[CELL_PREPARATION_ERROR] ${errMessage(error)}`,
          runEnvBase,
          opts.randomSeed,
        );
        if (scenario.primaryMetric !== undefined) result.primaryMetric = scenario.primaryMetric;
        await disposeConstructedEngine(engine, opts.signal);
        await opts.resultReuse?.put(withCacheKey(result)).catch(() => undefined);
        results.push(result);
        opts.onResult?.(result);
        done += 1;
        opts.onProgress?.(done, total, `${scenario.id} / ${engine.id} (preparation error)`);
        continue;
      }
      if (prepared.state !== 'VERIFIED') {
        result = blockedSelectionResult(
          engine.id,
          opts.browser,
          scenario,
          selection,
          prepared,
          runEnvBase,
          opts.randomSeed,
        );
        if (scenario.primaryMetric !== undefined) result.primaryMetric = scenario.primaryMetric;
        await disposeConstructedEngine(engine, opts.signal);
        await opts.resultReuse?.put(withCacheKey(result)).catch(() => undefined);
        results.push(result);
        opts.onResult?.(result);
        done += 1;
        opts.onProgress?.(done, total, `${scenario.id} / ${engine.id} (corpus unavailable)`);
        continue;
      }
      const executionSelection = prepared.selection;
      const executionScenario = executionSelection.effectiveScenario;
      const executionCacheScenarioKey = `${scenario.id}#${fullSelectionCacheTag(executionSelection)}`;
      if (executionCacheScenarioKey !== cacheScenarioKey) {
        cacheScenarioKey = executionCacheScenarioKey;
        cachedCandidate = await opts.resultReuse
          ?.get(engine.id, cacheScenarioKey, opts.browser)
          .catch(() => undefined);
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
        gaplessNativeEvidence: opts.gaplessNativeEvidence ?? collectGaplessNativeEvidence,
        ...(opts.benchOptions ? { benchOptions: opts.benchOptions } : {}),
        // §6/§10: hand runOne the rotated pick so it fetches the right bytes, records provenance, and
        // keys the reuse cache per file. Absent selection ⇒ omitted ⇒ today's baked-by-flat-id path.
        resolvedInputs: [...prepared.resolvedInputs],
        selection: resultSelectionFor(executionSelection),
        ...(executionSelection.evidencePlan
          ? { selectionEvidencePlan: executionSelection.evidencePlan }
          : {}),
        ...(prepared.verifiedStreamContents
          ? { verifiedStreamContents: prepared.verifiedStreamContents }
          : { verifiedContents: prepared.verified }),
        ...(prepared.decryptKeyOverride ? { decryptKeyOverride: prepared.decryptKeyOverride } : {}),
        ...(opts.randomSeed !== undefined ? { runSeed: opts.randomSeed } : {}),
        ...(opts.signal ? { signal: opts.signal } : {}),
        pixelBehavior,
        fixtureIntegrityRuntime,
        ...(cachedCandidate
          ? { cachedResult: restoreLogicalScenarioId(cachedCandidate, scenario.id) }
          : {}),
      };

      try {
        if (scenarioRequiresRobustnessIsolation(scenario)) {
          const instanceEngineId = engine.id;
          await disposeConstructedEngine(engine, opts.signal);
          result = await runRobustnessCellInWorker(
            engineId,
            instanceEngineId,
            executionScenario,
            support,
            opts,
            runOneOpts,
          );
        } else {
          result = await runOne(engine, executionScenario, opts.browser, support, runOneOpts);
        }
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
      // runOne snapshots configUsed before disposal; never read disposed mutable adapter state here.

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
  if (isNotApplicableError(err)) return applicabilityReason(err);
  if (isBrowserNotSupportedError(err)) return browserApplicabilityReason(err);
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function applicabilityReason(err: unknown): string {
  if (!isNotApplicableError(err)) return errMessage(err);
  return `[${err.reasonCode}] ${err.engineId}.${err.operation}: ${err.reason}`;
}

function browserApplicabilityReason(err: unknown): string {
  if (!isBrowserNotSupportedError(err)) return errMessage(err);
  return `[${err.reasonCode}] ${err.engineId}.${err.operation}: ${err.reason}`;
}
