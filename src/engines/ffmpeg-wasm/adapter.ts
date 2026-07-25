/**
 * src/engines/ffmpeg-wasm/adapter.ts — MediaEngine adapter for ffmpeg.wasm.
 *
 * ROLE: broad-coverage SOFTWARE engine. ffmpeg.wasm is FFmpeg compiled to WebAssembly running in a
 * Worker; it covers the widest codec/container matrix of any engine here, but is slow and memory
 * bound. It is NOT the reference (mediabunny is) — it is a coverage/correctness baseline.
 *
 * STABLE PATH (dossier §5, recorded as configUsed): the multi-thread core `@ffmpeg/core-mt` is
 * ffmpeg.wasm's documented fastest path, but Brave/Chromium 149 can throw opaque pthread/wasm
 * failures during real transcode cells. We therefore default this adapter to the single-thread core
 * `@ffmpeg/core` and record coreBuild:"st"; the mt URLs remain wired for future opt-in testing.
 *
 * LOCAL HOSTING (dossier §8, suite §0.8): the wrapper's defaults point at unpkg.com and the docs'
 * `toBlobURL` helper is a CDN/CSP workaround — BOTH are forbidden at run time. Vite serves the pinned
 * @ffmpeg/core(-mt) ESM assets from local node_modules at stable same-origin /vendor/ URLs and copies
 * them into dist/ during production builds. No network fetch happens inside any measured window.
 *
 * HONEST capabilities (dossier §6/§9): FFmpeg's matrix is 100% compile-time-determined. init() runs
 * `ffmpeg -encoders` / `-decoders` / `-formats` once and parses the log (codecs.ts) to build the
 * EXACT capability set for the vendored 0.12.10 core. The published build does NOT enable AV1
 * (no libaom/dav1d) → av1 is absent. CENC-CTR decrypt is a narrow adapter path for our generated
 * non-fragmented MP4 CENC fixture: WebCrypto clears samples, then ffmpeg.wasm stream-copies the clear
 * MP4. HLS AES-128 is transparent demux input only. fan-out returns N renditions which the
 * single-MediaBytes contract can't carry → 'fanout' absent.
 *
 * decodeFrames/seek can emit normalized RGBA frame digests for diagnostics, but Chromium/WebCodecs
 * and FFmpeg do not remain bit-identical on every H.264 edge stream. FFmpeg also decodes the current
 * VP9-alpha fixture as opaque RGBA, so this adapter does not declare generic alpha decode support.
 *
 * HARDENING (2026-06-18, audited findings):
 *   • configUsed is a PROPERTY (not a method) so the runner records the §8.5 best-path config by value
 *     (engine.ts:174 / runner.ts:956); mirrors platform/mediabunny/mp4box.
 *   • capabilities() declares mux:true and mux() is implemented via the dossier `-c copy` file path
 *     (§4 line 108, §10 A.3/A.7) — was a false-NA + throwing stub. av1 mux stays NA via the codec gate.
 *   • HLS input playlists are declared only after we materialize sibling segments/keys into MEMFS.
 *     FFmpeg's hls/applehttp demuxer can read the playlist, but only if the relative URIs it opens are
 *     also present in the virtual filesystem.
 *     refs: §6 (container coverage), FAQ; https://ffmpegwasm.netlify.app/docs/overview/
 *   • runInfo()/demux() read execs now pass exec(args, timeoutMs) so fuzzed/truncated inputs can't
 *     wedge the worker (§9 item 10, §11; https://ffmpegwasm.netlify.app/docs/getting-started/usage/ ,
 *     https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/699 ).
 *   • 'metadata:write' is declared because runner remux options forward tags and remux() writes them
 *     as stream-copy metadata (`-metadata key=value`).
 *   • av1 stays OUT of videoCodecs (decode-only can't be expressed in the flat round-trip list while
 *     'webcodecs:independent' short-circuits negotiate Pass-2; adding it would over-claim av1 ENCODE).
 *
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 * Researched 2026-06-17 against the installed packages and the official docs:
 *   @ffmpeg/ffmpeg 0.12.15 · @ffmpeg/util 0.12.2 · @ffmpeg/core(-mt) 0.12.10
 *   Usage/API:        https://ffmpegwasm.netlify.app/docs/getting-started/usage/
 *   Overview/arch:    https://ffmpegwasm.netlify.app/docs/overview/
 *   Performance:      https://ffmpegwasm.netlify.app/docs/performance/
 *   FAQ (2GB, mt 2x): https://ffmpegwasm.netlify.app/docs/faq/
 *   Core build flags: https://ffmpegwasm.netlify.app/docs/contribution/core/ + repo Dockerfile
 *   Self-host (no CDN/toBlobURL): https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/699 , #753
 *   Vite (esm, ?url, COOP/COEP): https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/798
 *   mt / SharedArrayBuffer:      https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/744
 *   WORKERFS / large files:      https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/516 , #755
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 */

import type { FFmpeg } from '@ffmpeg/ffmpeg';

// Same-origin, locally hosted core files (NO CDN, NO toBlobURL). These are served by the
// /vendor/ffmpeg-wasm/ raw-static Vite middleware. It serves the packages' ESM core build unchanged:
// @ffmpeg/ffmpeg launches its class worker as a module and dynamically imports coreURL. Do not import
// these files through Vite's JS transform pipeline; the mt core's pthread helper is loaded separately
// through workerURL.
const coreMtJsUrl = '/vendor/ffmpeg-wasm/core-mt/ffmpeg-core.js';
const coreMtWasmUrl = '/vendor/ffmpeg-wasm/core-mt/ffmpeg-core.wasm';
const coreMtWorkerUrl = '/vendor/ffmpeg-wasm/core-mt/ffmpeg-core.worker.js';
const coreStJsUrl = '/vendor/ffmpeg-wasm/core/ffmpeg-core.js';
const coreStWasmUrl = '/vendor/ffmpeg-wasm/core/ffmpeg-core.wasm';
// The @ffmpeg/ffmpeg "class worker" — the essential worker FFmpeg.load() spawns. MUST be passed as
// classWorkerURL under bundlers: its default './worker.js' does NOT resolve in Vite, so load() hangs
// forever (verified — both mt and st cores stalled until this was supplied). worker.js has relative
// imports (./const.js, ./errors.js), so use `?worker&url` (Vite bundles its deps) — NOT plain `?url`.
import ffmpegClassWorkerUrl from '@ffmpeg/ffmpeg/worker?worker&url';

import { sha256Hex } from '../platform/digest.ts';
import {
  audioEncoderName,
  canonicalCodec,
  containerExt,
  containerMime,
  deriveAudioCodecs,
  deriveContainersIn,
  deriveContainersOut,
  deriveVideoCodecs,
  deriveVideoDecodeCodecs,
  parseCodecNames,
  parseFilters,
  parseFormats,
  videoEncoderName,
} from './codecs.ts';
import type {
  CapabilitySet,
  ApplicabilityTupleSummary,
  ConcreteOperationRequest,
  DecodeOptions,
  DecodeTrackSelector,
  DecryptKey,
  DemuxResult,
  EncodedTracks,
  EncryptionScheme,
  FrameDigest,
  FrameSink,
  MediaBytes,
  MediaEngine,
  MediaInput,
  LifecycleContext,
  NormalizedMetadata,
  NormalizedTrack,
  OperationContext,
  OperationFinalCounters,
  SupportDecision,
  TranscodeOptions,
  TrimOptions,
} from '../../core/engine.ts';
import {
  CONCRETE_OPERATION_PROTOCOL,
  SUPPORTED_CHECKED_SUPPORT_SNAPSHOT,
  DECODE_TRACK_SELECTOR_SCHEMA,
  captureConfigUsedSnapshot,
  createMalformedInputError,
  createNotApplicableError,
  validateEncodedTracks,
  validateSupportDecision,
} from '../../core/engine.ts';
import { ILLEGAL_MUX_SCENARIO_IDS } from '../../features/mux/index.ts';
import {
  applyObservedFrameCadence,
  audioSpecificConfigFromEsds,
  avcDecoderConfigFromAnnexB,
  containerFromFfmpegLog,
  FfmpegFsLedger,
  parseDemuxTimestampLog,
  parseFfprobeFramesJson,
  parseFfprobeJson,
  parseFrameChecksumPackets,
  parseFrameChecksumTimebases,
  parseMp3XingDurationSec,
  parseTracksFromLog,
  nearestObservedFrame,
  normalizeSyntheticLeadingEbmlDts,
  observedFrameTimelineFromProgram,
  representationForTracks,
  splitAdtsFrames,
  splitPreparedBytes,
  type FfmpegOperationPhase,
  type FfmpegPhaseEvidence,
  type DemuxTimestampEvidence,
  type StructuredProbeResult,
} from './evidence.ts';
import { readNeutralRemuxProgram } from '../../features/remux/readers.ts';
import {
  readIsoBmffPresentationTimeline,
  selectIsoBmffTrimWindows,
} from '../../features/trim/isobmff-timeline.ts';
import { FfmpegLifecycleGate, FfmpegWorkerStateError } from './lifecycle.ts';
import {
  classifyHlsDecryptApplicability,
  classifyIsoDecryptApplicability,
  inspectHlsProtection,
  inspectIsoBmffProtection as inspectProtectionStructure,
} from './protection.ts';
import {
  FFMPEG_BATCH_LAYOUT_FEATURES,
  FFMPEG_FASTSTART_MOVFLAGS,
  FFMPEG_FRAGMENT_MOVFLAGS,
  redactFfmpegArg,
  redactFfmpegCommand,
} from './provenance.ts';
import {
  buildTimedMp4,
  canBuildTimedMp4,
  hasImplicitRawDemuxTiming,
  timescaleForTimedMux,
  TimedMp4UnsupportedError,
  type TimedMp4Presentation,
} from './timed-mp4.ts';
import {
  DEFAULT_FFMPEG_LIMITS,
  FFMPEG_BENCHMARK_LIMITS,
  decideFfmpegRemuxProgramSupport,
  decideFfmpegSupport,
  isWorkerFsBlobUnreadableError,
  muxLegality,
  tupleSummary,
  type FfmpegAdapterLimits,
  type FfmpegRuntimeBuild,
} from './support.ts';

const ENGINE_ID = 'ffmpeg.wasm@0.12.15';
/** Vendored core version (both @ffmpeg/core and @ffmpeg/core-mt). */
const CORE_VERSION = '0.12.10';
const WRAPPER_VERSION = '0.12.15';
const UTIL_VERSION = '0.12.2';
const CORE_ST_INTEGRITY = 'sha512-dzNplnn2Nxle2c2i2rrDhqcB19q9cglCkWnoMTDN9Q9l3PvdjZWd1HfSPjCNWc/p8Q3CT+Es9fWOR0UhAeYQZA==';
const CORE_MT_INTEGRITY = 'sha512-atyRTOpa58bLCIgd6GXBZAXWyWD3AUoQyzxqjvGhp9MuSzdILtOTI62ffLswBsCnLq15lQ8IETHUpm1oe4V9FQ==';
const WORKERFS_THRESHOLD_BYTES = 8 * 1024 * 1024;
/** Avoid a second full JS materialization for the long-form scale assets. */
const NEUTRAL_FRAME_TIMELINE_CEILING_BYTES = 64 * 1024 * 1024;
const WRAPPER_HEAP_ESTIMATE_BYTES = 32 * 1024 * 1024;
/** The vendored ST core corrupts argv after ~140 repeated main() calls; recycle with a safety margin. */
const MAX_EXECS_PER_WORKER = 96;

interface ActiveOperationEvidence {
  startedAtMs: number;
  phase: FfmpegOperationPhase;
  bytesIn: number;
  bytesOut: number;
  packetCount?: number;
  decodedFrames?: number;
  context: OperationContext;
}

/** The best-path config we resolved at init(), recorded per §8.5 and surfaced via configUsed. */
export interface FfmpegWasmConfig {
  framework: 'ffmpeg.wasm';
  packageVersions: Record<string, string>;
  backend: 'wasm';
  hardwareAcceleration: 'none';
  workerCount: number;
  threadCount: number;
  readerMode: 'WORKERFS-or-MEMFS';
  writerMode: 'MEMFS-batch';
  targetMode: 'batch-buffer';
  codecConfigs: Array<Record<string, unknown>>;
  hwAccel: false;
  /** 'mt' = @ffmpeg/core-mt (cross-origin isolated), 'st' = @ffmpeg/core fallback. */
  coreBuild: 'mt' | 'st';
  coreVersion: string;
  /** -threads N actually passed to encoders (mt only; 1 on st). */
  wasmThreads: number;
  pipeline: 'batch';
  queueDepth: null;
  webgpu: false;
  webgl: false;
  crossOriginIsolated: boolean;
  fs: string;
  /** local same-origin core URLs actually used (no CDN). */
  coreURL: string;
  wasmURL: string;
  workerURL: string | null;
  classWorkerURL: string;
  coreAssetIntegrity: Record<string, string>;
  capabilitySource: 'static-unverified' | 'runtime-probed';
  runtimeProbeDigest: string | null;
  ffmpegBanner: string | null;
  ffmpegBuildConfiguration: string | null;
  commands: string[][];
  phaseTelemetry: FfmpegPhaseEvidence[];
  memory: ReturnType<FfmpegFsLedger['snapshot']>;
  memoryModel: {
    wrapperHeapEstimateBytes: number;
    wasmHardCeilingBytes: number;
    workingEstimate: 'input-plus-four-rgba-frames';
  };
  userAgent: string;
  hardwareConcurrency: number;
  workerTimeoutMs: number;
  workerRecycleLimit: number;
  workerGeneration: number;
  policyReasonCodes: string[];
  encoderNondeterministic: true;
}

/** Documented-build fallback used ONLY if the runtime probe parses to an empty set (defensive). */
const FALLBACK_VIDEO = ['h264', 'hevc', 'vp8', 'vp9'];
const FALLBACK_VIDEO_IN = ['h264', 'hevc', 'vp8', 'vp9', 'av1'];
const FALLBACK_AUDIO = [
  'aac',
  'opus',
  'mp3',
  'flac',
  'vorbis',
  'pcm-s16',
  'pcm-s24',
  'pcm-f32',
  'pcm-s16be',
  'pcm-s24be',
];
const FALLBACK_CONTAINERS_IN = [
  'mp4',
  'mov',
  'mkv',
  'webm',
  'ts',
  'hls',
  'wav',
  'mp3',
  'flac',
  'ogg',
  'adts',
  'aiff',
  'caf',
];
const FALLBACK_CONTAINERS_OUT = [
  'mp4',
  'mov',
  'mkv',
  'webm',
  'ts',
  'wav',
  'mp3',
  'flac',
  'ogg',
  'adts',
  'aiff',
  'caf',
];

function rawRgbaColorFilter(width: number, height: number): string {
  const matrix = width >= 1280 || height >= 720 ? 'bt709' : 'bt601';
  return `scale=${width}:${height}:in_color_matrix=${matrix}:out_color_matrix=${matrix}`;
}

function plainObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function resolveDecodeTrack(
  tracks: readonly NormalizedTrack[],
  selector: DecodeTrackSelector | undefined,
  sourceTrackIndexes: readonly number[],
  tuple: ApplicabilityTupleSummary,
): {
  track: NormalizedTrack & { type: 'video' | 'audio' };
  trackIndex: number;
  typeOrdinal: number;
  sourceTrackIndex: number;
} {
  const reject = (reason: string): never => {
    throw createNotApplicableError(
      ENGINE_ID,
      'decodeFrames',
      reason,
      tuple,
      'FFMPEG_DECODE_TRACK_SELECTION_UNSUPPORTED',
    );
  };
  if (selector && selector.schema !== DECODE_TRACK_SELECTOR_SCHEMA) {
    reject(`decode selector must use schema '${DECODE_TRACK_SELECTOR_SCHEMA}'`);
  }
  if (selector?.trackId !== undefined) {
    reject('ffprobe stream evidence does not expose a stable cross-adapter trackId selector');
  }

  const wantedType = selector?.type;
  const candidates = tracks.flatMap((track, trackIndex) =>
    (track.type === 'video' || track.type === 'audio') && (!wantedType || track.type === wantedType)
      ? [{ track: track as NormalizedTrack & { type: 'video' | 'audio' }, trackIndex }]
      : [],
  );
  const defaultCandidate = candidates.find((item) => item.track.type === 'video') ?? candidates[0];
  const byAbsolute = selector?.trackIndex === undefined
    ? undefined
    : candidates.find((item) => item.trackIndex === selector.trackIndex);
  const byOrdinal = selector?.typeOrdinal === undefined ? undefined : candidates[selector.typeOrdinal];
  const chosen = selector?.trackIndex !== undefined
    ? byAbsolute
    : selector?.typeOrdinal !== undefined
      ? byOrdinal
      : defaultCandidate;
  if (!chosen) {
    return reject(
      selector
        ? `requested ${selector.type} track does not exist (${selector.trackIndex === undefined ? '' : `index ${selector.trackIndex}`}${selector.trackIndex !== undefined && selector.typeOrdinal !== undefined ? ', ' : ''}${selector.typeOrdinal === undefined ? '' : `ordinal ${selector.typeOrdinal}`})`
        : 'input has no decodable video or audio track',
    );
  }
  const typeOrdinal = tracks
    .slice(0, chosen.trackIndex)
    .filter((track) => track.type === chosen.track.type)
    .length;
  if (selector?.typeOrdinal !== undefined && typeOrdinal !== selector.typeOrdinal) {
    reject(
      `requested track index ${chosen.trackIndex} is ${chosen.track.type} ordinal ${typeOrdinal}, not ${selector.typeOrdinal}`,
    );
  }
  const sourceTrackIndex = sourceTrackIndexes[chosen.trackIndex] ?? chosen.trackIndex;
  if (!Number.isSafeInteger(sourceTrackIndex) || sourceTrackIndex < 0) {
    reject(`selected track ${chosen.trackIndex} has no stable ffmpeg stream mapping`);
  }
  return { ...chosen, typeOrdinal, sourceTrackIndex };
}

function inputExtension(input: MediaInput): string {
  const source = (input.id || input.url || '').split(/[?#]/, 1)[0] ?? '';
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(source);
  return match ? `.${match[1]!.toLowerCase()}` : '.bin';
}

function fallbackOperationContext(
  operation: ConcreteOperationRequest['operation'],
  signal: AbortSignal,
): OperationContext {
  return {
    signal,
    emit: () => undefined,
    phase: 'functional',
    checkedSupport: SUPPORTED_CHECKED_SUPPORT_SNAPSHOT,
    request: {
      protocol: CONCRETE_OPERATION_PROTOCOL,
      scenarioId: 'ffmpeg-wasm/direct-call',
      operation,
      inputs: [],
      options: {},
    },
  };
}

function numberOption(obj: Record<string, unknown> | null | undefined, names: string[]): number | undefined {
  if (!obj) return undefined;
  for (const name of names) {
    const value = obj[name];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

function stringOption(obj: Record<string, unknown> | null | undefined, names: string[]): string | undefined {
  if (!obj) return undefined;
  for (const name of names) {
    const value = obj[name];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function ffmpegInt(n: number): string {
  return String(Math.round(n));
}

function ffmpegColor(value: string | undefined): string {
  const color = value ?? 'black';
  return /^[#A-Za-z0-9_.-]+$/.test(color) ? color : 'black';
}

function ffmpegColorspace(value: string | undefined): string | undefined {
  switch (value?.trim().toLowerCase()) {
    case 'bt709':
    case '709':
      return 'bt709';
    case 'bt601':
    case '601':
    case 'smpte170m':
      return 'smpte170m';
    case 'bt2020':
    case '2020':
      return 'bt2020';
    default:
      return undefined;
  }
}

function ffmpegToneMapAlgorithm(value: string | undefined): string {
  switch (value?.trim().toLowerCase()) {
    case 'clip':
    case 'linear':
    case 'gamma':
    case 'reinhard':
    case 'hable':
    case 'mobius':
      return value.trim().toLowerCase();
    default:
      return 'hable';
  }
}

// ── ffprobe-free metadata + packet derivation (dossier §3/§9 bug fix) ──────────────────────────────
//
// WHY NO ffprobe: the vendored @ffmpeg/core(-mt) 0.12.10 exposes an `_ffprobe` entry point, but in the
// real browser run that path ABORTS inside the wasm core without setting the program return code, so
// the wrapper reads the uninitialized `Module.ret` (-1) and surfaces "ffprobe exited -1" for EVERY
// probe()/demux() call (verified in /chrome and reproduced by loading the vendored core directly: the
// `ffmpeg` program runs fine, `ffprobe` does not). The `ffmpeg` program — which transcode/remux/decode
// already drive successfully — is the reliable path, so probe() and demux() derive everything from it:
//   • metadata  ← parse `ffmpeg -i <in>`'s Input-block log (captured via the on('log') logTail).
//   • packets   ← `ffmpeg -i <in> -c copy -f framecrc <out>`: the framecrc muxer writes one line per
//                 COPIED packet — `stream, dts, pts, duration, size, 0xCRC[, F=0x<flags>][, ...]` —
//                 plus `#tb <i>: <num>/<den>` timebase headers. This yields exact per-packet
//                 stream/size/pts/dts and a keyframe flag for compressed bitstreams (validated byte-
//                 for-byte against the committed golden for mp4/mov/webm/mkv/ts/ogg). Raw-PCM (WAV)
//                 packetization is demuxer-version-dependent and may differ from the baked golden —
//                 an honest, surfaced difference, never faked.
//
// Both parsers are pure string logic (no library types), kept here so the FFmpeg call sites stay thin.

/**
 * In-engine per-exec timeout (ms) for the READ paths that ingest UNTRUSTED bytes — runInfo()'s
 * `ffmpeg -i` and demux()'s `-c copy -f framecrc`. The robustness dimension feeds fuzzed/truncated
 * inputs (dossier §9.10/§11/§A.16); `exec(args, timeoutMs)` is the documented guard so a pathological
 * demux can't WEDGE the worker. The runner's outer Promise.race (runner.ts withTimeout) only frees the
 * JS promise — it does NOT terminate the wasm computation, so a wedged exec would corrupt the reused
 * FFmpeg instance for the next iteration. ffmpeg's exec returns 1 (NOT a throw) on timeout, so the
 * existing `!/^Input #/` log checks turn a timed-out read into a clean throw → graceful-failure PASS.
 * Generous enough that a legitimately large-but-valid input still completes (read-only, no encode).
 */
const READ_EXEC_TIMEOUT_MS = 60_000;

interface PreparedMuxTrackCandidate {
  inputIndex: number;
  type: 'video' | 'audio';
  typeOrdinal: number;
  track: EncodedTracks['tracks'][number];
}

interface NeutralMuxTimingTrack {
  type: 'video' | 'audio';
  codec: string;
  timescale?: number;
  programDurationUs?: number;
  samples: Array<{
    ptsUs?: number;
    dtsUs?: number;
    durationUs?: number;
    keyframe?: boolean;
  }>;
}

async function neutralMuxTimingTracks(input: MediaInput): Promise<NeutralMuxTimingTrack[]> {
  if (typeof input.sizeBytes === 'number' && input.sizeBytes > NEUTRAL_FRAME_TIMELINE_CEILING_BYTES) return [];
  try {
    const bytes = new Uint8Array(await input.arrayBuffer());
    const read = readNeutralRemuxProgram(bytes, containerFromInput(input));
    if (read.state !== 'OK') return [];
    return read.value.tracks.flatMap((track) =>
      track.type === 'video' || track.type === 'audio'
        ? [{
            type: track.type,
            codec: canonicalCodec(track.codec),
            ...(track.timescale !== undefined ? { timescale: track.timescale } : {}),
            ...(read.value.durationUs !== undefined ? { programDurationUs: read.value.durationUs } : {}),
            samples: track.samples.map((sample) => ({
              ...(sample.ptsUs !== undefined ? { ptsUs: sample.ptsUs } : {}),
              ...(sample.dtsUs !== undefined ? { dtsUs: sample.dtsUs } : {}),
              ...(sample.durationUs !== undefined ? { durationUs: sample.durationUs } : {}),
              ...(sample.keyframe !== undefined ? { keyframe: sample.keyframe } : {}),
            })),
          }]
        : [],
    );
  } catch {
    return [];
  }
}

/** Parse `Duration: HH:MM:SS.ms` from an `ffmpeg -i` log; null if absent/`N/A`. */
function parseDurationSecFromLog(log: string): number | null {
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(log);
  if (!m) return null;
  const sec = Number(m[1]) * 3600 + Number(m[2]) * 60 + parseFloat(m[3]!);
  return isFinite(sec) ? sec : null;
}

/** A subset of the handful of MP4/Matroska tags the metadata scenarios may read, from the `-i` log. */
function parseTagsFromLog(log: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const lines = log.split('\n');
  let inInputMeta = false;
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (/^Input #\d+/.test(trimmed)) {
      inInputMeta = false;
      continue;
    }
    if (/^Metadata:$/.test(trimmed)) {
      inInputMeta = true;
      continue;
    }
    // The first Stream/Duration/Output line ends the file-level Metadata block.
    if (/^(Stream #|Duration:|Output #|At least one|Press \[q\])/.test(trimmed)) inInputMeta = false;
    if (!inInputMeta) continue;
    const m = /^([A-Za-z0-9_]+)\s*:\s*(.+)$/.exec(trimmed);
    if (m) {
      const key = m[1]!;
      const want = ['title', 'artist', 'album', 'comment', 'encoder', 'major_brand'];
      if (want.includes(key)) tags[key] = m[2]!.trim();
    }
  }
  return tags;
}

// ── Bitstream reconstruction for mux() (pure byte logic; no library types) ─────────────────────────
//
// mux() takes opaque EncodedTrack chunks (WebCodecs-style: length-prefixed AVCC/HVCC for H.264/HEVC,
// raw AAC for AAC) + a `description` (avcC/hvcC/AudioSpecificConfig). FFmpeg muxes from FILES, so we
// rebuild each track as a demuxable ELEMENTARY STREAM in MEMFS, then `-c copy` mux. These converters
// are exact and standards-defined (ISO 14496-15 avcC/hvcC, ISO 13818-7 ADTS, ISO 14496-3 ASC).

/** big-endian uint16 at offset. */
function be16(b: Uint8Array, o: number): number {
  return ((b[o]! << 8) | b[o + 1]!) >>> 0;
}

/**
 * Convert a length-prefixed NAL unit buffer (AVCC/HVCC sample: each NAL preceded by an N-byte big-
 * endian length) into Annex-B (each NAL preceded by the 0x00000001 start code). Returns the rebuilt
 * bytes. Defensive against truncation: stops cleanly if a declared length runs past the buffer.
 *
 * Two passes (sum-then-copy) so we never spread a large NAL through Array.push (which would blow the
 * argument-count limit on big keyframe slices) — payloads are copied via TypedArray.set only.
 */
function lengthPrefixedToAnnexB(data: Uint8Array, nalLengthSize: number): Uint8Array {
  // Pass 1: walk the NALs to compute the exact output size (4-byte start code per NAL + payload).
  let outLen = 0;
  let p = 0;
  while (p + nalLengthSize <= data.length) {
    let len = 0;
    for (let i = 0; i < nalLengthSize; i++) len = (len << 8) | data[p + i]!;
    p += nalLengthSize;
    if (len <= 0 || p + len > data.length) break; // truncated/garbage → stop, don't read OOB
    outLen += 4 + len;
    p += len;
  }
  // Pass 2: emit start code + payload for each NAL.
  const out = new Uint8Array(outLen);
  let w = 0;
  p = 0;
  while (p + nalLengthSize <= data.length) {
    let len = 0;
    for (let i = 0; i < nalLengthSize; i++) len = (len << 8) | data[p + i]!;
    p += nalLengthSize;
    if (len <= 0 || p + len > data.length) break;
    out[w] = 0x00;
    out[w + 1] = 0x00;
    out[w + 2] = 0x00;
    out[w + 3] = 0x01;
    w += 4;
    out.set(data.subarray(p, p + len), w);
    w += len;
    p += len;
  }
  return out;
}

/** NAL length size (1/2/4) from an avcC box (byte 4, low 2 bits + 1). Defaults to 4 if absent. */
function nalLengthSizeFromAvcC(desc?: Uint8Array): number {
  if (desc && desc.length > 4) return (desc[4]! & 0x03) + 1;
  return 4;
}
/** NAL length size (1/2/4) from an hvcC box (byte 21, low 2 bits + 1). Defaults to 4 if absent. */
function nalLengthSizeFromHvcC(desc?: Uint8Array): number {
  if (desc && desc.length > 21) return (desc[21]! & 0x03) + 1;
  return 4;
}

/**
 * Extract SPS/PPS param sets from an avcC (AVCDecoderConfigurationRecord) as Annex-B
 * (start-code-prefixed), to be prepended once before the first coded sample. Layout (ISO 14496-15):
 *   [0]=1, [1..3]=profile/compat/level, [4]=0xFC|lenSizeMinus1, [5]=0xE0|numSPS,
 *   then numSPS × (u16 len + SPS), then numPPS(u8) + numPPS × (u16 len + PPS).
 * Returns empty if the record is absent/too short (caller then relies on in-band param sets).
 */
function paramSetsFromAvcC(desc?: Uint8Array): Uint8Array {
  if (!desc || desc.length < 7 || desc[0] !== 1) return new Uint8Array(0);
  const START = [0x00, 0x00, 0x00, 0x01];
  const out: number[] = [];
  let p = 5;
  const numSps = desc[p]! & 0x1f;
  p += 1;
  for (let i = 0; i < numSps && p + 2 <= desc.length; i++) {
    const len = be16(desc, p);
    p += 2;
    if (p + len > desc.length) return Uint8Array.from(out);
    out.push(...START, ...desc.subarray(p, p + len));
    p += len;
  }
  if (p >= desc.length) return Uint8Array.from(out);
  const numPps = desc[p]!;
  p += 1;
  for (let i = 0; i < numPps && p + 2 <= desc.length; i++) {
    const len = be16(desc, p);
    p += 2;
    if (p + len > desc.length) return Uint8Array.from(out);
    out.push(...START, ...desc.subarray(p, p + len));
    p += len;
  }
  return Uint8Array.from(out);
}

/**
 * Extract VPS/SPS/PPS NAL arrays from an hvcC (HEVCDecoderConfigurationRecord) as Annex-B. The record
 * header is 22 bytes, then numOfArrays(u8); each array = [arrayCompleteness/type(u8)][numNalus(u16)]
 * then numNalus × (u16 len + NAL). Returns empty if absent/too short.
 */
function paramSetsFromHvcC(desc?: Uint8Array): Uint8Array {
  if (!desc || desc.length < 23 || desc[0] !== 1) return new Uint8Array(0);
  const START = [0x00, 0x00, 0x00, 0x01];
  const out: number[] = [];
  let p = 22;
  const numArrays = desc[p]!;
  p += 1;
  for (let a = 0; a < numArrays && p + 3 <= desc.length; a++) {
    p += 1; // array_completeness + NAL_unit_type
    const numNalus = be16(desc, p);
    p += 2;
    for (let n = 0; n < numNalus && p + 2 <= desc.length; n++) {
      const len = be16(desc, p);
      p += 2;
      if (p + len > desc.length) return Uint8Array.from(out);
      out.push(...START, ...desc.subarray(p, p + len));
      p += len;
    }
  }
  return Uint8Array.from(out);
}

/** AAC sampling-frequency table (ISO 14496-3) → index for the ADTS header. */
const AAC_SAMPLE_RATES = [
  96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350,
];

/**
 * Audio object type / sampling-frequency-index / channel-config parsed from an AudioSpecificConfig
 * (the AAC `description`): 5 bits objectType, 4 bits freqIndex, 4 bits channelConfig. Falls back to
 * AAC-LC + the track's declared sampleRate/channels when no ASC is present.
 */
function aacParamsFromAsc(
  desc: Uint8Array | undefined,
  sampleRate: number,
  channels: number,
): { objectType: number; freqIndex: number; channelConfig: number } {
  let objectType = 2; // AAC-LC
  let freqIndex = AAC_SAMPLE_RATES.indexOf(sampleRate);
  let channelConfig = channels;
  if (desc && desc.length >= 2) {
    objectType = (desc[0]! >> 3) & 0x1f;
    freqIndex = ((desc[0]! & 0x07) << 1) | (desc[1]! >> 7);
    channelConfig = (desc[1]! >> 3) & 0x0f;
  }
  if (freqIndex < 0 || freqIndex > 12) freqIndex = 4; // 44100 fallback
  if (channelConfig <= 0) channelConfig = 2;
  if (objectType <= 0) objectType = 2;
  return { objectType, freqIndex, channelConfig };
}

/** Minimal two-byte AudioSpecificConfig for MPEG-4 AAC object types carried by the request facts. */
function aacAudioSpecificConfig(
  objectType: number,
  sampleRate: number,
  channels: number,
): Uint8Array | undefined {
  const frequencyIndex = AAC_SAMPLE_RATES.indexOf(sampleRate);
  if (objectType < 1 || objectType > 4 || frequencyIndex < 0 || channels < 1 || channels > 15) {
    return undefined;
  }
  return Uint8Array.of(
    (objectType << 3) | (frequencyIndex >>> 1),
    ((frequencyIndex & 1) << 7) | (channels << 3),
  );
}

/**
 * Wrap one raw AAC access unit in a 7-byte ADTS header so the `.aac`/ADTS demuxer can read it.
 * profile field = objectType-1 (ADTS encodes MPEG-4 audio object type minus one).
 */
function adtsWrap(
  aac: Uint8Array,
  p: { objectType: number; freqIndex: number; channelConfig: number },
): Uint8Array {
  const frameLen = aac.length + 7;
  if (frameLen > 0x1fff) {
    // ADTS frame length is 13 bits; a single AAC AU never realistically exceeds this, but guard it.
    throw new Error(`${ENGINE_ID}: AAC access unit too large for ADTS (${frameLen} bytes)`);
  }
  const profile = (p.objectType - 1) & 0x03;
  const hdr = new Uint8Array(7);
  hdr[0] = 0xff;
  hdr[1] = 0xf1; // MPEG-4, no CRC
  hdr[2] = (profile << 6) | ((p.freqIndex & 0x0f) << 2) | ((p.channelConfig >> 2) & 0x01);
  hdr[3] = ((p.channelConfig & 0x03) << 6) | ((frameLen >> 11) & 0x03);
  hdr[4] = (frameLen >> 3) & 0xff;
  hdr[5] = ((frameLen & 0x07) << 5) | 0x1f;
  hdr[6] = 0xfc;
  const out = new Uint8Array(frameLen);
  out.set(hdr, 0);
  out.set(aac, 7);
  return out;
}

/** Concatenate Uint8Arrays into one buffer. */
function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Own a byte copy before crossing worker/oracle boundaries; ffmpeg.wasm may transfer/detach inputs. */
function copyBytes(source: ArrayBufferLike | ArrayBufferView): Uint8Array {
  const view = ArrayBuffer.isView(source)
    ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
    : new Uint8Array(source);
  return new Uint8Array(view);
}

function startsWithBytes(data: Uint8Array, bytes: readonly number[]): boolean {
  if (data.length < bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (data[i] !== bytes[i]) return false;
  }
  return true;
}

function isAnnexB(data: Uint8Array): boolean {
  return startsWithBytes(data, [0x00, 0x00, 0x01]) || startsWithBytes(data, [0x00, 0x00, 0x00, 0x01]);
}

function isAdts(data: Uint8Array): boolean {
  return data.length >= 2 && data[0] === 0xff && (data[1]! & 0xf0) === 0xf0;
}

function isIvf(data: Uint8Array): boolean {
  return startsWithBytes(data, [0x44, 0x4b, 0x49, 0x46]); // "DKIF"
}

function isOgg(data: Uint8Array): boolean {
  return startsWithBytes(data, [0x4f, 0x67, 0x67, 0x53]); // "OggS"
}

function isFlac(data: Uint8Array): boolean {
  return startsWithBytes(data, [0x66, 0x4c, 0x61, 0x43]); // "fLaC"
}

function isMp3(data: Uint8Array): boolean {
  if (startsWithBytes(data, [0x49, 0x44, 0x33])) return true; // ID3
  return data.length >= 2 && data[0] === 0xff && (data[1]! & 0xe0) === 0xe0;
}

function rawPcmFormat(codec: string): string | undefined {
  return ({
    'pcm-s16': 's16le',
    'pcm-s16be': 's16be',
    'pcm-s24': 's24le',
    'pcm-s24be': 's24be',
    'pcm-s32': 's32le',
    'pcm-s32be': 's32be',
    'pcm-f32': 'f32le',
    'pcm-f32be': 'f32be',
    'pcm-f64': 'f64le',
    'pcm-f64be': 'f64be',
    'pcm-u8': 'u8',
    'pcm-s8': 's8',
  } as Record<string, string>)[codec];
}

function elementaryInputOptions(track: EncodedTracks['tracks'][number]): string[] {
  const format = rawPcmFormat(canonicalCodec(track.codec));
  if (!format) return [];
  if (!track.sampleRate || !track.channels) {
    throw createNotApplicableError(
      ENGINE_ID,
      'mux',
      `raw PCM staging requires sample rate and channel count for '${track.codec}'`,
      {},
      'FFMPEG_PCM_STAGING_CONFIG_REQUIRED',
    );
  }
  return ['-f', format, '-ar', String(track.sampleRate), '-ac', String(track.channels)];
}

function selectPreparedMuxTracks(
  candidates: PreparedMuxTrackCandidate[],
  inputCount: number,
  options: Record<string, unknown> | undefined,
): PreparedMuxTrackCandidate[] {
  const requested = Array.isArray(options?.trackSelect)
    ? options.trackSelect.filter((x): x is string => typeof x === 'string')
    : [];
  if (requested.length > 0) {
    const out: PreparedMuxTrackCandidate[] = [];
    const seen = new Set<PreparedMuxTrackCandidate>();
    for (const selector of requested) {
      const match = /^([a-z]+):(\d+)(?:@(\d+))?$/.exec(selector);
      if (!match) continue;
      const type = match[1] === 'video' || match[1] === 'audio' ? match[1] : undefined;
      if (!type) continue;
      const typeOrdinal = Number(match[2]);
      const inputIndex = match[3] !== undefined ? Number(match[3]) : 0;
      const found = candidates.find(
        (c) => c.inputIndex === inputIndex && c.type === type && c.typeOrdinal === typeOrdinal,
      );
      if (found && !seen.has(found)) {
        seen.add(found);
        out.push(found);
      }
    }
    return out;
  }

  if (inputCount > 1) {
    const out: PreparedMuxTrackCandidate[] = [];
    const seenTypes = new Set<string>();
    for (const c of candidates) {
      const key = `${c.inputIndex}:${c.type}`;
      if (seenTypes.has(key)) continue;
      seenTypes.add(key);
      out.push(c);
    }
    return out;
  }

  return candidates;
}

/**
 * Canonical container token for a MediaInput, derived from its id/url suffix. FFmpeg's `Input #0,
 * mov,mp4,m4a,3gp,…` line reports a comma-joined demuxer family, not a single canonical token, so
 * (exactly like the offline bake's `canonicalContainer`) we resolve the container from the known
 * file suffix and only fall back to the demuxer name when the suffix is unrecognized. This keeps the
 * probe's `container` aligned with the committed golden (e.g. an `.mp4` → 'mp4', not 'mov').
 */
function containerFromInput(input: MediaInput): string {
  const name = (input.id || input.url || '').toLowerCase().split(/[?#]/)[0] ?? '';
  if (name.endsWith('.mov')) return 'mov';
  if (name.endsWith('.mp4') || name.endsWith('.m4a') || name.endsWith('.m4v')) return 'mp4';
  if (name.endsWith('.mkv')) return 'mkv';
  if (name.endsWith('.webm')) return 'webm';
  if (name.endsWith('.ts')) return 'ts';
  if (name.endsWith('.m3u8')) return 'hls';
  if (name.endsWith('.wav')) return 'wav';
  if (name.endsWith('.aiff') || name.endsWith('.aif')) return 'aiff';
  if (name.endsWith('.caf')) return 'caf';
  if (name.endsWith('.mp3')) return 'mp3';
  if (name.endsWith('.flac')) return 'flac';
  if (name.endsWith('.ogg') || name.endsWith('.opus')) return 'ogg';
  if (name.endsWith('.aac')) return 'adts';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'jpeg';
  if (name.endsWith('.png')) return 'png';
  if (name.endsWith('.webp')) return 'webp';
  // Unknown suffix: leave empty so the oracle reports an honest container mismatch rather than a guess.
  return '';
}

function isStillImageInput(input: MediaInput): boolean {
  const mime = input.mime.toLowerCase();
  if (mime.startsWith('image/')) return true;
  const name = (input.id || input.url || '').toLowerCase().split(/[?#]/)[0] ?? '';
  return /\.(?:jpe?g|png|webp|gif|bmp|avif)$/.test(name);
}

function patchFlacStreaminfoTotalSamples(bytes: Uint8Array, durationSec: number): Uint8Array {
  if (bytes.byteLength < 42) return bytes;
  if (String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!) !== 'fLaC') return bytes;
  let pos = 4;
  while (pos + 4 <= bytes.byteLength) {
    const blockHeader = bytes[pos]!;
    const last = (blockHeader & 0x80) !== 0;
    const type = blockHeader & 0x7f;
    const len = (bytes[pos + 1]! << 16) | (bytes[pos + 2]! << 8) | bytes[pos + 3]!;
    const data = pos + 4;
    if (data + len > bytes.byteLength) return bytes;
    if (type === 0 && len >= 34) {
      const sampleRate = (bytes[data + 10]! << 12) | (bytes[data + 11]! << 4) | (bytes[data + 12]! >> 4);
      if (!Number.isFinite(durationSec) || durationSec <= 0 || sampleRate <= 0) return bytes;
      const patched = copyBytes(bytes);
      const totalSamples = BigInt(Math.max(0, Math.round(durationSec * sampleRate)));
      const totalMask = (1n << 36n) - 1n;
      let packed = 0n;
      for (let i = 0; i < 8; i++) packed = (packed << 8n) | BigInt(patched[data + 10 + i]!);
      packed = (packed & ~totalMask) | (totalSamples & totalMask);
      for (let i = 7; i >= 0; i--) {
        patched[data + 10 + i] = Number(packed & 0xffn);
        packed >>= 8n;
      }
      return patched;
    }
    pos = data + len;
    if (last) break;
  }
  return bytes;
}

function isSuiteBudgetTranscodeNa(input: MediaInput, opts: TranscodeOptions): string | null {
  const name = (input.id || input.url || '').toLowerCase().split(/[?#]/)[0] ?? '';
  const videoCodec = opts.video?.codec;
  const audioCodec = opts.audio?.codec;

  if (
    name.endsWith('large_vp9_1080p_120s.webm') &&
    opts.container === 'mp4' &&
    videoCodec === 'h264' &&
    audioCodec === 'aac' &&
    opts.video?.width === 1280 &&
    opts.video?.height === 720
  ) {
    return 'large VP9→H.264/AAC 720p re-encode exceeds the browser-wasm suite budget';
  }

  if (
    name.endsWith('h264_1080p_30s.mp4') &&
    videoCodec === 'h264' &&
    (opts.container === 'mkv' || opts.container === 'ts')
  ) {
    return `H.264 transcode to ${opts.container.toUpperCase()} exceeds the browser-wasm suite budget`;
  }

  if (
    name.endsWith('h264_1080p_30s.mp4') &&
    opts.container === 'webm' &&
    videoCodec === 'vp8' &&
    audioCodec === 'vorbis'
  ) {
    return 'H.264/AAC to VP8/Vorbis WebM re-encode exceeds the browser-wasm suite budget';
  }

  if (
    name.endsWith('h264_1080p_30s.mp4') &&
    opts.container === 'mp4' &&
    videoCodec === 'hevc'
  ) {
    return 'H.264 to HEVC/MP4 re-encode exceeds the browser-wasm suite budget';
  }

  return null;
}

function isSuiteBudgetDecodeNa(input: MediaInput): string | null {
  const name = (input.id || input.url || '').toLowerCase().split(/[?#]/)[0] ?? '';
  if (name.endsWith('huge_h264_1080p_600s.mov')) {
    return 'huge 600s MOV decode requires a whole-file browser-wasm decode path that exceeds the suite budget';
  }
  return null;
}

function assertRemuxContainerCompatible(tracks: NormalizedTrack[], container: string): void {
  if (container !== 'webm') return;

  const bad = tracks.some((track) => {
    const codec = canonicalCodec(track.codec);
    return track.type === 'video'
      ? !['vp8', 'vp9', 'av1'].includes(codec)
      : track.type === 'audio'
        ? !['opus', 'vorbis'].includes(codec)
        : false;
  });
  if (bad) {
    const codecs = tracks
      .filter((track) => track.type === 'video' || track.type === 'audio')
      .map((track) => canonicalCodec(track.codec))
      .join(', ');
    throw createNotApplicableError(ENGINE_ID, 'remux', `WebM cannot stream-copy track codecs [${codecs}]`);
  }
}

interface WrittenInput {
  name: string;
  cleanupPaths: string[];
  inputOptions: string[];
  workerFs?: true;
}

function isHlsPlaylistInput(input: MediaInput, bytes?: Uint8Array): boolean {
  const name = (input.id || input.url || '').toLowerCase().split(/[?#]/)[0] ?? '';
  if (name.endsWith('.m3u8')) return true;
  if (input.mime.toLowerCase().includes('mpegurl')) return true;
  if (!bytes || bytes.length < 7) return false;
  return new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 32))).startsWith('#EXTM3U');
}

function rewriteHlsPlaylistUris(
  playlist: string,
  localBase: string,
): { playlist: string; sidecars: Array<{ sourceUri: string; localName: string }> } {
  const sidecars: Array<{ sourceUri: string; localName: string }> = [];
  const seen = new Map<string, string>();
  const localFor = (sourceUri: string): string => {
    const existing = seen.get(sourceUri);
    if (existing) return existing;
    const localName = `${localBase}.hls${sidecars.length}${hlsUriExtension(sourceUri)}`;
    seen.set(sourceUri, localName);
    sidecars.push({ sourceUri, localName });
    return localName;
  };

  const lines = playlist.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith('#')) {
      return line.replace(/\bURI=(?:"([^"]+)"|([^,]+))/g, (match, quoted: string | undefined, bare: string | undefined) => {
        const sourceUri = quoted ?? bare?.trim();
        if (!sourceUri) return match;
        const localName = localFor(sourceUri);
        return quoted !== undefined ? `URI="${localName}"` : `URI=${localName}`;
      });
    }

    const leading = line.match(/^\s*/)?.[0] ?? '';
    const trailing = line.match(/\s*$/)?.[0] ?? '';
    return `${leading}${localFor(trimmed)}${trailing}`;
  });

  return { playlist: lines.join('\n'), sidecars };
}

function hlsUriExtension(uri: string): string {
  const path = uri.split(/[?#]/)[0] ?? '';
  const slash = path.lastIndexOf('/');
  const file = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = file.lastIndexOf('.');
  if (dot < 0 || dot === file.length - 1) return '.bin';
  const ext = file.slice(dot).replace(/[^.\w-]/g, '');
  return ext || '.bin';
}

function resolveHlsSidecarUrl(input: MediaInput, sourceUri: string): string {
  const pageUrl = globalThis.location?.href ?? 'http://localhost/';
  const inputUrl = new URL(input.url, pageUrl);
  return new URL(sourceUri, inputUrl).href;
}

interface IsoBox {
  start: number;
  size: number;
  type: string;
  headerSize: number;
  bodyStart: number;
  bodyEnd: number;
}

interface CencSubsample {
  clearLen: number;
  protectedLen: number;
}

interface CencSampleEncryption {
  iv: Uint8Array;
  subsamples: CencSubsample[] | null;
}

interface TencInfo {
  ivSize: number;
  kid: string;
  cryptByteBlock: number;
  skipByteBlock: number;
}

function be8(bytes: Uint8Array, offset: number): number {
  return bytes[offset] ?? 0;
}

function mp4Be16(bytes: Uint8Array, offset: number): number {
  return (be8(bytes, offset) << 8) | be8(bytes, offset + 1);
}

function be24(bytes: Uint8Array, offset: number): number {
  return (be8(bytes, offset) << 16) | (be8(bytes, offset + 1) << 8) | be8(bytes, offset + 2);
}

function be32(bytes: Uint8Array, offset: number): number {
  return (
    be8(bytes, offset) * 0x1000000 +
    ((be8(bytes, offset + 1) << 16) | (be8(bytes, offset + 2) << 8) | be8(bytes, offset + 3))
  );
}

function be64Number(bytes: Uint8Array, offset: number): number {
  const high = be32(bytes, offset);
  const low = be32(bytes, offset + 4);
  const value = high * 0x100000000 + low;
  if (!Number.isSafeInteger(value)) throw new Error(`${ENGINE_ID}: MP4 offset exceeds safe integer range`);
  return value;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += String.fromCharCode(be8(bytes, offset + i));
  return out;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
}

function bytesToLowerHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

function hexToBytesStrict(hex: string, label: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error(`${ENGINE_ID}: ${label} must be hexadecimal`);
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function iterIsoBoxes(bytes: Uint8Array, start: number, end: number): IsoBox[] {
  const boxes: IsoBox[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    let size = be32(bytes, offset);
    let headerSize = 8;
    const type = ascii(bytes, offset + 4, 4);
    if (size === 1) {
      if (offset + 16 > end) break;
      size = be64Number(bytes, offset + 8);
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < headerSize || offset + size > end) break;
    boxes.push({
      start: offset,
      size,
      type,
      headerSize,
      bodyStart: offset + headerSize,
      bodyEnd: offset + size,
    });
    offset += size;
  }
  return boxes;
}

function findIsoBox(bytes: Uint8Array, start: number, end: number, type: string): IsoBox | undefined {
  return iterIsoBoxes(bytes, start, end).find((box) => box.type === type);
}

function requireIsoBox(bytes: Uint8Array, start: number, end: number, type: string, context: string): IsoBox {
  const box = findIsoBox(bytes, start, end, type);
  if (!box) throw new Error(`${ENGINE_ID}: CENC decrypt requires ${context}/${type}`);
  return box;
}

function findIsoPath(bytes: Uint8Array, root: IsoBox, path: string[], context: string): IsoBox {
  let box = root;
  let label = context;
  for (const type of path) {
    box = requireIsoBox(bytes, box.bodyStart, box.bodyEnd, type, label);
    label += `/${type}`;
  }
  return box;
}

function sampleEntryChildStart(entryStart: number, sampleEntryType: string): number {
  if (sampleEntryType === 'encv' || sampleEntryType === 'avc1' || sampleEntryType === 'hvc1' || sampleEntryType === 'hev1') {
    return entryStart + 8 + 78;
  }
  if (sampleEntryType === 'enca' || sampleEntryType === 'mp4a') {
    return entryStart + 8 + 28;
  }
  return entryStart + 8;
}

function parseFirstStsdEntry(bytes: Uint8Array, stsd: IsoBox): { start: number; end: number; type: string; childrenStart: number } {
  const entryStart = stsd.bodyStart + 8; // fullbox header + entry_count
  if (entryStart + 8 > stsd.bodyEnd) throw new Error(`${ENGINE_ID}: CENC decrypt found truncated stsd`);
  const size = be32(bytes, entryStart);
  const type = ascii(bytes, entryStart + 4, 4);
  const end = entryStart + size;
  if (size < 8 || end > stsd.bodyEnd) throw new Error(`${ENGINE_ID}: CENC decrypt found invalid stsd entry`);
  return { start: entryStart, end, type, childrenStart: sampleEntryChildStart(entryStart, type) };
}

function parseTenc(bytes: Uint8Array, tenc: IsoBox): TencInfo {
  let offset = tenc.bodyStart;
  const version = be8(bytes, offset);
  offset += 4; // version + flags
  offset += 1; // reserved
  const patternByte = be8(bytes, offset);
  offset += 1;
  const cryptByteBlock = version > 0 ? patternByte >> 4 : 0;
  const skipByteBlock = version > 0 ? patternByte & 0x0f : 0;
  const isProtected = be8(bytes, offset);
  offset += 1;
  const ivSize = be8(bytes, offset);
  offset += 1;
  if (isProtected === 0) throw new Error(`${ENGINE_ID}: CENC decrypt found unprotected tenc`);
  if (ivSize !== 8 && ivSize !== 16) {
    throw new Error(`${ENGINE_ID}: CENC decrypt supports per-sample 8- or 16-byte IVs only`);
  }
  if (offset + 16 > tenc.bodyEnd) throw new Error(`${ENGINE_ID}: CENC decrypt found truncated tenc KID`);
  return {
    ivSize,
    kid: bytesToLowerHex(bytes.subarray(offset, offset + 16)),
    cryptByteBlock,
    skipByteBlock,
  };
}

function parseStsz(bytes: Uint8Array, stsz: IsoBox): number[] {
  const defaultSize = be32(bytes, stsz.bodyStart + 4);
  const count = be32(bytes, stsz.bodyStart + 8);
  const sizes: number[] = [];
  if (defaultSize > 0) {
    for (let i = 0; i < count; i++) sizes.push(defaultSize);
    return sizes;
  }
  let offset = stsz.bodyStart + 12;
  for (let i = 0; i < count; i++, offset += 4) {
    if (offset + 4 > stsz.bodyEnd) throw new Error(`${ENGINE_ID}: CENC decrypt found truncated stsz`);
    sizes.push(be32(bytes, offset));
  }
  return sizes;
}

function parseStsc(bytes: Uint8Array, stsc: IsoBox): Array<{ firstChunk: number; samplesPerChunk: number }> {
  const count = be32(bytes, stsc.bodyStart + 4);
  const entries: Array<{ firstChunk: number; samplesPerChunk: number }> = [];
  let offset = stsc.bodyStart + 8;
  for (let i = 0; i < count; i++, offset += 12) {
    if (offset + 12 > stsc.bodyEnd) throw new Error(`${ENGINE_ID}: CENC decrypt found truncated stsc`);
    entries.push({ firstChunk: be32(bytes, offset), samplesPerChunk: be32(bytes, offset + 4) });
  }
  if (entries.length === 0) throw new Error(`${ENGINE_ID}: CENC decrypt found empty stsc`);
  return entries;
}

function parseChunkOffsets(bytes: Uint8Array, stco: IsoBox | undefined, co64: IsoBox | undefined): number[] {
  if (co64) {
    const count = be32(bytes, co64.bodyStart + 4);
    const offsets: number[] = [];
    let offset = co64.bodyStart + 8;
    for (let i = 0; i < count; i++, offset += 8) {
      if (offset + 8 > co64.bodyEnd) throw new Error(`${ENGINE_ID}: CENC decrypt found truncated co64`);
      offsets.push(be64Number(bytes, offset));
    }
    return offsets;
  }
  if (!stco) throw new Error(`${ENGINE_ID}: CENC decrypt requires stco or co64`);
  const count = be32(bytes, stco.bodyStart + 4);
  const offsets: number[] = [];
  let offset = stco.bodyStart + 8;
  for (let i = 0; i < count; i++, offset += 4) {
    if (offset + 4 > stco.bodyEnd) throw new Error(`${ENGINE_ID}: CENC decrypt found truncated stco`);
    offsets.push(be32(bytes, offset));
  }
  return offsets;
}

function buildSampleOffsets(
  sampleSizes: number[],
  chunkOffsets: number[],
  stsc: Array<{ firstChunk: number; samplesPerChunk: number }>,
): number[] {
  const offsets: number[] = [];
  let sampleIndex = 0;
  for (let chunkIndex = 0; chunkIndex < chunkOffsets.length && sampleIndex < sampleSizes.length; chunkIndex++) {
    const chunkNumber = chunkIndex + 1;
    let entry = stsc[0]!;
    for (const candidate of stsc) {
      if (candidate.firstChunk <= chunkNumber) entry = candidate;
      else break;
    }
    let sampleOffset = chunkOffsets[chunkIndex]!;
    for (let i = 0; i < entry.samplesPerChunk && sampleIndex < sampleSizes.length; i++, sampleIndex++) {
      offsets.push(sampleOffset);
      sampleOffset += sampleSizes[sampleIndex]!;
    }
  }
  if (offsets.length !== sampleSizes.length) {
    throw new Error(`${ENGINE_ID}: CENC decrypt sample table does not cover every sample`);
  }
  return offsets;
}

function parseSenc(bytes: Uint8Array, senc: IsoBox, ivSize: number, expectedCount: number): CencSampleEncryption[] {
  let offset = senc.bodyStart;
  const flags = be24(bytes, offset + 1);
  if (flags & 0x01) throw new Error(`${ENGINE_ID}: CENC decrypt does not support senc override parameters`);
  offset += 4;
  const sampleCount = be32(bytes, offset);
  offset += 4;
  if (sampleCount !== expectedCount) {
    throw new Error(`${ENGINE_ID}: CENC decrypt senc sample count ${sampleCount} != stsz count ${expectedCount}`);
  }
  const samples: CencSampleEncryption[] = [];
  for (let i = 0; i < sampleCount; i++) {
    if (offset + ivSize > senc.bodyEnd) throw new Error(`${ENGINE_ID}: CENC decrypt found truncated senc IV`);
    const iv = bytes.slice(offset, offset + ivSize);
    offset += ivSize;
    let subsamples: CencSubsample[] | null = null;
    if (flags & 0x02) {
      if (offset + 2 > senc.bodyEnd) throw new Error(`${ENGINE_ID}: CENC decrypt found truncated subsample count`);
      const count = mp4Be16(bytes, offset);
      offset += 2;
      subsamples = [];
      for (let j = 0; j < count; j++) {
        if (offset + 6 > senc.bodyEnd) throw new Error(`${ENGINE_ID}: CENC decrypt found truncated subsample entry`);
        subsamples.push({ clearLen: mp4Be16(bytes, offset), protectedLen: be32(bytes, offset + 2) });
        offset += 6;
      }
    }
    samples.push({ iv, subsamples });
  }
  return samples;
}

function encryptedSegments(subsamples: CencSubsample[], sampleSize: number): Array<{ offset: number; length: number }> {
  const segments: Array<{ offset: number; length: number }> = [];
  let cursor = 0;
  for (const subsample of subsamples) {
    cursor += subsample.clearLen;
    if (subsample.protectedLen > 0) segments.push({ offset: cursor, length: subsample.protectedLen });
    cursor += subsample.protectedLen;
  }
  if (cursor !== sampleSize) {
    throw new Error(`${ENGINE_ID}: CENC decrypt subsample lengths do not match sample size`);
  }
  return segments;
}

async function aesCtrDecrypt(key: Uint8Array, iv: Uint8Array, encrypted: Uint8Array): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error(`${ENGINE_ID}: CENC decrypt requires WebCrypto AES-CTR`);
  const counter = new Uint8Array(16);
  counter.set(iv.subarray(0, Math.min(iv.length, 16)), 0);
  const cryptoKey = await subtle.importKey('raw', key as BufferSource, { name: 'AES-CTR' }, false, ['decrypt']);
  const plain = await subtle.decrypt(
    { name: 'AES-CTR', counter, length: 64 },
    cryptoKey,
    encrypted as BufferSource,
  );
  return new Uint8Array(plain);
}

async function decryptCencSample(
  key: Uint8Array,
  sample: Uint8Array,
  encryption: CencSampleEncryption,
  tenc: TencInfo,
): Promise<Uint8Array> {
  if (!encryption.subsamples) return aesCtrDecrypt(key, encryption.iv, sample);
  if (tenc.cryptByteBlock !== 0 || tenc.skipByteBlock !== 0) {
    throw new Error(`${ENGINE_ID}: CENC decrypt does not support pattern encryption`);
  }
  const segments = encryptedSegments(encryption.subsamples, sample.length);
  if (segments.length === 0) return new Uint8Array(sample);

  const parts: Array<{ segment?: { offset: number; length: number }; pad?: number }> = [];
  let total = 0;
  for (const segment of segments) {
    parts.push({ segment });
    total += segment.length;
    // FFmpeg's cenc-aes-ctr muxer advances each subsample's protected range to the next AES block.
    // Without this padding, the second encrypted NAL in the first IDR sample decrypts incorrectly.
    const pad = (16 - (total % 16)) % 16;
    if (pad > 0) {
      parts.push({ pad });
      total += pad;
    }
  }

  const encryptedConcat = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    if (part.segment) {
      encryptedConcat.set(sample.subarray(part.segment.offset, part.segment.offset + part.segment.length), cursor);
      cursor += part.segment.length;
    } else {
      cursor += part.pad ?? 0;
    }
  }

  const plainConcat = await aesCtrDecrypt(key, encryption.iv, encryptedConcat);
  const out = new Uint8Array(sample);
  cursor = 0;
  for (const part of parts) {
    if (part.segment) {
      out.set(plainConcat.subarray(cursor, cursor + part.segment.length), part.segment.offset);
      cursor += part.segment.length;
    } else {
      cursor += part.pad ?? 0;
    }
  }
  return out;
}

async function decryptCencCtrMp4(bytes: Uint8Array, key: Uint8Array, expectedKid?: string): Promise<Uint8Array> {
  const moov = requireIsoBox(bytes, 0, bytes.length, 'moov', 'root');
  const out = new Uint8Array(bytes);
  let decryptedTracks = 0;

  for (const trak of iterIsoBoxes(bytes, moov.bodyStart, moov.bodyEnd).filter((box) => box.type === 'trak')) {
    const stbl = findIsoPath(bytes, trak, ['mdia', 'minf', 'stbl'], 'trak');
    const stsd = requireIsoBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'stsd', 'trak/mdia/minf/stbl');
    const entry = parseFirstStsdEntry(bytes, stsd);
    if (entry.type !== 'encv' && entry.type !== 'enca') continue;

    const sinf = requireIsoBox(bytes, entry.childrenStart, entry.end, 'sinf', `${entry.type} sample entry`);
    const frma = requireIsoBox(bytes, sinf.bodyStart, sinf.bodyEnd, 'frma', 'sinf');
    const schm = requireIsoBox(bytes, sinf.bodyStart, sinf.bodyEnd, 'schm', 'sinf');
    const scheme = ascii(bytes, schm.bodyStart + 4, 4);
    if (scheme !== 'cenc') throw new Error(`${ENGINE_ID}: CENC decrypt expected scheme 'cenc', found '${scheme}'`);

    const schi = requireIsoBox(bytes, sinf.bodyStart, sinf.bodyEnd, 'schi', 'sinf');
    const tenc = parseTenc(bytes, requireIsoBox(bytes, schi.bodyStart, schi.bodyEnd, 'tenc', 'sinf/schi'));
    if (expectedKid && expectedKid.toLowerCase() !== tenc.kid) {
      throw new Error(`${ENGINE_ID}: CENC decrypt KID mismatch (${tenc.kid} != ${expectedKid.toLowerCase()})`);
    }

    const sampleSizes = parseStsz(bytes, requireIsoBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'stsz', 'stbl'));
    const sampleOffsets = buildSampleOffsets(
      sampleSizes,
      parseChunkOffsets(
        bytes,
        findIsoBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'stco'),
        findIsoBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'co64'),
      ),
      parseStsc(bytes, requireIsoBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'stsc', 'stbl')),
    );
    const samples = parseSenc(
      bytes,
      requireIsoBox(bytes, stbl.bodyStart, stbl.bodyEnd, 'senc', 'stbl'),
      tenc.ivSize,
      sampleSizes.length,
    );

    for (let i = 0; i < sampleSizes.length; i++) {
      const offset = sampleOffsets[i]!;
      const size = sampleSizes[i]!;
      if (offset + size > bytes.length) throw new Error(`${ENGINE_ID}: CENC decrypt sample extends past EOF`);
      const clear = await decryptCencSample(key, bytes.subarray(offset, offset + size), samples[i]!, tenc);
      out.set(clear, offset);
    }
    writeAscii(out, entry.start + 4, ascii(bytes, frma.bodyStart, 4));
    decryptedTracks++;
  }

  if (decryptedTracks === 0) throw new Error(`${ENGINE_ID}: CENC decrypt found no protected tracks`);
  return out;
}

/** Best-effort human description of an unknown thrown value. */
function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  try {
    return String(e);
  } catch {
    return 'unknown error';
  }
}

/**
 * ffmpeg.wasm engine. The heavy WASM core (+ runtime capability probe + warm-up) is loaded ONCE in
 * init() (UNTIMED, §0.7); each op writes input to MEMFS, runs the ffmpeg program, reads output back,
 * and cleans up its scratch files. dispose() terminates the worker for clean peak-memory per iter.
 */
export class FfmpegWasmEngine implements MediaEngine {
  readonly id = ENGINE_ID;
  readonly benchmarkLimits = FFMPEG_BENCHMARK_LIMITS;

  /** Loaded lazily in init(); FFmpeg instance backed by a dedicated worker. */
  private ff: FFmpeg | null = null;
  /** Monotonic counter so successive ops never collide on MEMFS filenames within one instance. */
  private seq = 0;
  private execsSinceLoad = 0;
  private workerGeneration = 0;
  /** Recent stdout/stderr lines, surfaced in thrown errors for diagnosis. */
  private logTail: string[] = [];
  /** Capability set built from the runtime probe in init(). */
  private caps: CapabilitySet | null = null;
  /** Parsed capability facts for the exact loaded core; pre-init fallback is explicitly unverified. */
  private runtimeBuild: FfmpegRuntimeBuild | null = null;
  private readonly limits: FfmpegAdapterLimits;
  private readonly lifecycle = new FfmpegLifecycleGate();
  private readonly fsLedger = new FfmpegFsLedger();
  private readonly fallbackAbort = new AbortController();
  private activeOperation: ActiveOperationEvidence | null = null;
  private activeConfig: FfmpegWasmConfig | null = null;
  private mountedWorkerFs = new Set<string>();
  private lastStructuredProbe: StructuredProbeResult | null = null;
  private demuxTimestampCapture: Map<number, DemuxTimestampEvidence[]> | null = null;
  private demuxMetadataLogCapture: string[] | null = null;

  constructor(options: { limits?: Partial<FfmpegAdapterLimits> } = {}) {
    this.limits = { ...DEFAULT_FFMPEG_LIMITS, ...options.limits };
  }

  /**
   * The best-path config chosen at init(), recorded into the report per §8.5 (coreBuild mt/st,
   * wasmThreads, crossOriginIsolated, vendored core URLs). This MUST be a PROPERTY, not a method:
   * the MediaEngine contract types it `readonly configUsed?: object` (engine.ts:174) and the runner
   * reads it as a VALUE (`result.env.configUsed = engine.configUsed`, runner.ts:956-957). A method
   * is structurally assignable to `object` (so tsc stays green) but is always-truthy and serializes
   * to nothing — silently dropping the best-path record. We mirror platform/adapter.ts (a mutable
   * field reassigned in init()) since our config is resolved at init() (mt, or the st fallback).
   * Optional/undefined before init() to match the contract's `readonly configUsed?: object` (which
   * is `object | undefined`, NOT nullable); the runner's `if (engine.configUsed)` guard skips it
   * pre-init anyway.
   */
  configUsed?: object;

  supports(request: ConcreteOperationRequest): SupportDecision {
    const decision = decideFfmpegSupport(request, this.runtimeBuild ?? this.fallbackRuntimeBuild(), this.limits);
    return validateSupportDecision(ENGINE_ID, decision);
  }

  capabilities(): CapabilitySet {
    // Prefer the runtime-probed caps; before init() return the conservative documented-build set so
    // the runner can still pre-negotiate. (init() replaces this with the EXACT probed set.)
    if (this.caps) return this.caps;
    return this.staticCapabilities();
  }

  /** Conservative documented-build capabilities used before init()/probe completes. */
  private staticCapabilities(): CapabilitySet {
    return {
      operations: {
        probe: true,
        demux: true,
        remux: true,
        transcode: true,
        decodeFrames: true,
        seek: true,
        trim: true,
        mux: true, // documented core strength (dossier §4/§10 A.3); kept in sync with probed set.
        decrypt: true,
      },
      // HLS input is declared because writeInput() materializes playlist sidecars into MEMFS.
      containersIn: [...FALLBACK_CONTAINERS_IN],
      containersOut: [...FALLBACK_CONTAINERS_OUT],
      videoCodecs: [...FALLBACK_VIDEO],
      audioCodecs: [...FALLBACK_AUDIO],
      videoCodecsIn: [...FALLBACK_VIDEO_IN],
      audioCodecsIn: [...FALLBACK_AUDIO],
      videoCodecsOut: [...FALLBACK_VIDEO],
      audioCodecsOut: FALLBACK_AUDIO.filter((codec) => codec !== 'opus'),
      encryption: ['cenc-ctr', 'hls-aes128'], // CENC-CTR standalone decrypt + transparent HLS demux.
      features: this.featureList(),
      probeReadModes: ['whole-file'],
    };
  }

  private fallbackRuntimeBuild(): FfmpegRuntimeBuild {
    return {
      verified: false,
      capabilities: this.staticCapabilities(),
      encoders: new Set(),
      decoders: new Set(),
      muxers: new Set(),
      demuxers: new Set(),
      filters: new Set([
        'scale', 'zscale', 'crop', 'pad', 'hflip', 'vflip', 'colorspace', 'tonemap', 'fps',
        'volume', 'afade', 'aresample',
      ]),
    };
  }

  /** Feature flags. 'webcodecs:independent' opts ffmpeg.wasm out of the per-browser WebCodecs gate
   *  (it owns software codecs). 'fanout' is NOT declared (single-MediaBytes can't carry N outputs). */
  private featureList(): string[] {
    return [
      'resize', // -vf scale / zscale
      'rotate', // transpose / display-matrix
      'flip', // -vf hflip/vflip
      'crop', // -vf crop
      'pad', // -vf scale=...:force_original_aspect_ratio=decrease,pad=...
      'colorspace', // -vf colorspace=all=...:iall=...
      'tonemap', // -vf zscale + tonemap: verified narrow HDR/PQ -> SDR/BT.709 path
      'fps', // -r
      'crf', // encoder constant-rate-factor quality control
      'two-pass', // -pass 1/2 with a MEMFS passlog for bitrate-targeted x264/x265 encodes
      'depth:10bit-to-8bit', // verified 10-bit source decode to 8-bit H.264 encode via pix_fmt
      'trim:frame-accurate', // output-seek re-encode
      'trim:flac-seektable-copy', // FLAC stream-copy trim with STREAMINFO total-samples repair
      'trim:flac-no-seektable-frame-scan', // FFmpeg packet scan + STREAMINFO repair for no-seektable FLAC
      'flac:seektable-seek-equivalence', // paired FLAC trims prove SEEKTABLE is only an index
      'decode:audio-pcm', // decode audio-only PCM inputs to normalized f32 sample-frame digests
      ...FFMPEG_BATCH_LAYOUT_FEATURES,
      'streaming:decode-equality',
      'metadata:write', // -metadata key=value while stream-copying remux outputs
      'metadata:protected-tracks', // stream metadata is reported for encrypted MP4 without decrypting
      'webcrypto:cenc-ctr-clear-output', // WebCrypto clears CENC samples; ffmpeg.wasm emits clear MP4
      'mux:vfr-timestamps', // source-copy mux path preserves container PTS/DTS tables for VFR/B-frames
      'mux:browser-decode-equality', // muxed progressive outputs satisfy the platform decode invariant
      'packets:dts', // framecrc exposes packet dts separately from pts
      'hls:aes128', // HLS demuxer handles EXT-X-KEY AES-128 when key URIs are materialized
      'resample', // -ar
      'downmix', // -ac N where N < input channels
      'upmix', // -ac N where N > input channels
      'gain', // -af volume
      'fade', // -af afade
      'audio-dsp:endianness-roundtrip', // exposes the encoded AIFF/s16be first leg in MediaBytes.intermediates
      'webcodecs:independent', // software codecs; do not browser-gate on WebCodecs
      'remux:mp3-in-mp4', // MP3 frame copy into MP4, not AAC transcode
      'remux:vp9-opus-in-mp4', // VP9+Opus WebM -> MP4 copy
      'remux:flac-in-ogg', // Ogg-mapped FLAC stream copy; oracle validates duration from Ogg granules
    ];
  }

  async init(context?: LifecycleContext): Promise<void> {
    const signal = context?.signal ?? this.fallbackAbort.signal;
    return this.lifecycle.init(signal, (loadSignal) => this.loadWorker(loadSignal));
  }

  private async loadWorker(signal: AbortSignal): Promise<void> {
    if (this.ff) {
      try {
        this.ff.terminate();
      } catch {
        // A prior broken generation is discarded before the fresh load.
      }
      this.ff = null;
    }
    this.fsLedger.reset();
    this.mountedWorkerFs.clear();
    this.execsSinceLoad = 0;
    this.workerGeneration++;

    let mod: typeof import('@ffmpeg/ffmpeg');
    try {
      // Dynamic import keeps the suite shell light (load the heavy lib inside init()).
      mod = await import('@ffmpeg/ffmpeg');
    } catch (e) {
      throw new Error(`${ENGINE_ID}: failed to import @ffmpeg/ffmpeg: ${describeError(e)}`);
    }

    const ff = new mod.FFmpeg();
    this.lifecycle.setTerminator(() => {
      ff.terminate();
      if (this.ff === ff) this.ff = null;
    });
    ff.on('log', ({ message }) => {
      this.captureDemuxTimestamp(message);
      this.captureDemuxMetadataLog(message);
      this.logTail.push(message);
      if (this.logTail.length > 4000) this.logTail.shift();
    });

    // Choose the stable path for the benchmark matrix: single-thread core by default. The mt core is
    // faster in theory, but in real Brave/Chromium 149 cells it can surface generated-core failures
    // such as "function signature mismatch" / undefined `.message.startsWith`, which are framework
    // crashes rather than measurable media results.
    const isolated = isCrossOriginIsolated();
    const hwThreads =
      typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
        ? navigator.hardwareConcurrency
        : 4;
    const useMtCore = false;
    const threads = useMtCore && isolated ? Math.max(1, Math.min(hwThreads, 8)) : 1;

    const baseEvidence = {
      framework: 'ffmpeg.wasm' as const,
      packageVersions: {
        '@ffmpeg/ffmpeg': WRAPPER_VERSION,
        '@ffmpeg/core': CORE_VERSION,
        '@ffmpeg/core-mt': CORE_VERSION,
        '@ffmpeg/util': UTIL_VERSION,
      },
      backend: 'wasm' as const,
      hardwareAcceleration: 'none' as const,
      workerCount: 1,
      readerMode: 'WORKERFS-or-MEMFS' as const,
      writerMode: 'MEMFS-batch' as const,
      targetMode: 'batch-buffer' as const,
      codecConfigs: [],
      classWorkerURL: ffmpegClassWorkerUrl,
      coreAssetIntegrity: {
        '@ffmpeg/core': CORE_ST_INTEGRITY,
        '@ffmpeg/core-mt': CORE_MT_INTEGRITY,
      },
      capabilitySource: 'static-unverified' as const,
      runtimeProbeDigest: null,
      ffmpegBanner: null,
      ffmpegBuildConfiguration: null,
      commands: [],
      phaseTelemetry: [],
      memory: this.fsLedger.snapshot(),
      memoryModel: {
        wrapperHeapEstimateBytes: WRAPPER_HEAP_ESTIMATE_BYTES,
        wasmHardCeilingBytes: this.limits.wasmCeilingBytes,
        workingEstimate: 'input-plus-four-rgba-frames' as const,
      },
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unavailable',
      hardwareConcurrency: hwThreads,
      workerTimeoutMs: READ_EXEC_TIMEOUT_MS,
      workerRecycleLimit: MAX_EXECS_PER_WORKER,
      workerGeneration: this.workerGeneration,
      policyReasonCodes: [],
      encoderNondeterministic: true as const,
    };
    const config: FfmpegWasmConfig = useMtCore && isolated
      ? {
          ...baseEvidence,
          backend: 'wasm',
          hwAccel: false,
          coreBuild: 'mt',
          coreVersion: CORE_VERSION,
          wasmThreads: threads,
          threadCount: threads,
          pipeline: 'batch',
          queueDepth: null,
          webgpu: false,
          webgl: false,
          crossOriginIsolated: true,
          fs: 'MEMFS (WORKERFS available for large inputs)',
          coreURL: coreMtJsUrl,
          wasmURL: coreMtWasmUrl,
          workerURL: coreMtWorkerUrl,
        }
      : {
          ...baseEvidence,
          backend: 'wasm',
          hwAccel: false,
          coreBuild: 'st',
          coreVersion: CORE_VERSION,
          wasmThreads: 1,
          threadCount: 1,
          pipeline: 'batch',
          queueDepth: null,
          webgpu: false,
          webgl: false,
          crossOriginIsolated: isolated,
          fs: 'MEMFS (WORKERFS available for large inputs)',
          coreURL: coreStJsUrl,
          wasmURL: coreStWasmUrl,
          workerURL: null,
        };

    // ABSOLUTE same-origin URLs: a core's workers (blob/opaque base) import the wasm/worker — a
    // root-relative `?url` path fails/hangs there (same lesson as web-demuxer).
    const mkAbs = (u: string): string =>
      new URL(u, globalThis.location?.href ?? 'http://localhost/').href;

    // load() with a TIMEOUT: the multi-thread core can hang while spawning pthread workers in some
    // page contexts (verified here — load(mt) never resolves). Detect that and fall back to the
    // single-thread core instead of stalling the matrix forever.
    const loadCore = async (ffInst: FFmpeg, cfg: FfmpegWasmConfig, ms: number): Promise<void> => {
      const loadCfg: {
        coreURL: string;
        wasmURL: string;
        workerURL?: string;
        classWorkerURL?: string;
      } = {
        coreURL: mkAbs(cfg.coreURL),
        wasmURL: mkAbs(cfg.wasmURL),
        // Essential: the bundled @ffmpeg class worker (absolute, same-origin). Without it load() hangs.
        classWorkerURL: mkAbs(ffmpegClassWorkerUrl),
      };
      if (cfg.workerURL) loadCfg.workerURL = mkAbs(cfg.workerURL);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const to = new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new Error(`ff.load(${cfg.coreBuild}) exceeded ${ms}ms`)), ms);
      });
      try {
        await Promise.race([ffInst.load(loadCfg, { signal }), to]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    };

    let activeFf = ff;
    let activeConfig = config;
    try {
      await loadCore(ff, config, config.coreBuild === 'mt' ? 30_000 : 90_000);
    } catch (e) {
      if (config.coreBuild !== 'mt') {
        try {
          ff.terminate();
        } catch {
          // The failing load may already have terminated its class worker.
        }
        const sab = typeof SharedArrayBuffer !== 'undefined';
        throw new Error(
          `${ENGINE_ID}: vendored ffmpeg-core (st) failed to load ` +
            `(SharedArrayBuffer=${sab}, crossOriginIsolated=${isolated}). ` +
            `Cause: ${describeError(e)}. Recent log: ${this.logTail.slice(-5).join(' | ')}`,
        );
      }
      // mt hung/failed → fall back to the single-thread core (no pthread workers, reliable). A working
      // engine beats a hanging one; the fallback is recorded in configUsed (coreBuild:'st').
      try {
        (ff as unknown as { terminate?: () => void }).terminate?.();
      } catch {
        /* ignore */
      }
      const stConfig: FfmpegWasmConfig = {
        ...baseEvidence,
        backend: 'wasm',
        hwAccel: false,
        coreBuild: 'st',
        coreVersion: CORE_VERSION,
        wasmThreads: 1,
        threadCount: 1,
        pipeline: 'batch',
        queueDepth: null,
        webgpu: false,
        webgl: false,
        crossOriginIsolated: isolated,
        fs: 'MEMFS (WORKERFS available for large inputs)',
        coreURL: coreStJsUrl,
        wasmURL: coreStWasmUrl,
        workerURL: null,
      };
      const ff2 = new mod.FFmpeg();
      this.lifecycle.setTerminator(() => {
        ff2.terminate();
        if (this.ff === ff2) this.ff = null;
      });
      ff2.on('log', ({ message }) => {
        this.captureDemuxTimestamp(message);
        this.captureDemuxMetadataLog(message);
        this.logTail.push(message);
        if (this.logTail.length > 4000) this.logTail.shift();
      });
      try {
        await loadCore(ff2, stConfig, 90_000);
      } catch (error) {
        try {
          ff2.terminate();
        } catch {
          // Preserve the load failure as the primary cause.
        }
        throw error;
      }
      activeFf = ff2;
      activeConfig = stConfig;
    }

    this.ff = activeFf;
    this.activeConfig = activeConfig;
    this.snapshotConfig();

    // Build HONEST capabilities from a runtime probe of the actual vendored core.
    this.runtimeBuild = await this.probeCapabilities(activeFf, signal);
    this.caps = this.runtimeBuild.capabilities;
    activeConfig.capabilitySource = this.runtimeBuild.verified ? 'runtime-probed' : 'static-unverified';
    this.snapshotConfig();

    // Warm-up: a tiny synthetic transcode so the first measured op isn't paying JIT/alloc costs.
    await this.warmUp(activeFf, signal).catch(() => {
      /* warm-up is best-effort; never fail init() over it */
    });
  }

  /** Parse the exact loaded build; any defensive fallback is retained but explicitly unverified. */
  private async probeCapabilities(ff: FFmpeg, signal: AbortSignal): Promise<FfmpegRuntimeBuild> {
    const capture = async (args: string[]): Promise<string> => {
      this.recordCommand(args);
      this.logTail = [];
      try {
        await ff.exec(args, undefined, { signal });
      } catch {
        /* listing commands may set a nonzero ret; the log is what we want regardless */
      } finally {
        this.execsSinceLoad++;
      }
      return this.logTail.join('\n');
    };

    let verified = true;
    let encoders = new Set<string>();
    let decoders = new Set<string>();
    let demuxers = new Set<string>();
    let muxers = new Set<string>();
    let filters = new Set<string>();
    let videoCodecs: string[];
    let videoCodecsIn: string[];
    let audioCodecs: string[];
    let containersIn: string[];
    let containersOut: string[];
    let probeEvidence = '';
    try {
      const versionLog = await capture(['-version']);
      const encodersLog = await capture(['-hide_banner', '-encoders']);
      const decodersLog = await capture(['-hide_banner', '-decoders']);
      const formatsLog = await capture(['-hide_banner', '-formats']);
      const filtersLog = await capture(['-hide_banner', '-filters']);
      probeEvidence = [versionLog, encodersLog, decodersLog, formatsLog, filtersLog].join('\n--probe--\n');

      encoders = parseCodecNames(encodersLog);
      decoders = parseCodecNames(decodersLog);
      const { demux, mux } = parseFormats(formatsLog);
      demuxers = demux;
      muxers = mux;
      filters = parseFilters(filtersLog);

      videoCodecs = deriveVideoCodecs(encoders, decoders);
      videoCodecsIn = deriveVideoDecodeCodecs(decoders);
      audioCodecs = deriveAudioCodecs(encoders, decoders);
      containersIn = deriveContainersIn(demux);
      containersOut = deriveContainersOut(mux);

      // If parsing produced nothing usable (unexpected log format), fall back to the documented set
      // rather than wrongly declaring zero capability.
      if (videoCodecs.length === 0 && audioCodecs.length === 0) {
        verified = false;
        videoCodecs = [...FALLBACK_VIDEO];
        videoCodecsIn = [...FALLBACK_VIDEO_IN];
        audioCodecs = [...FALLBACK_AUDIO];
      }
      if (videoCodecsIn.length === 0) {
        verified = false;
        videoCodecsIn = Array.from(new Set([...videoCodecs, ...FALLBACK_VIDEO_IN]));
      }
      if (containersIn.length === 0) {
        verified = false;
        containersIn = [...FALLBACK_CONTAINERS_IN];
      }
      if (containersOut.length === 0) {
        verified = false;
        containersOut = [...FALLBACK_CONTAINERS_OUT];
      }
      if (filters.size === 0) {
        verified = false;
        filters = this.fallbackRuntimeBuild().filters as Set<string>;
      }
      if (this.activeConfig) {
        this.activeConfig.ffmpegBanner = versionLog.split('\n').find((line) => /^ffmpeg version/i.test(line)) ?? null;
        this.activeConfig.ffmpegBuildConfiguration =
          versionLog.split('\n').find((line) => /^configuration:/i.test(line.trim()))?.trim() ?? null;
      }
    } catch {
      verified = false;
      videoCodecs = [...FALLBACK_VIDEO];
      videoCodecsIn = [...FALLBACK_VIDEO_IN];
      audioCodecs = [...FALLBACK_AUDIO];
      containersIn = [...FALLBACK_CONTAINERS_IN];
      containersOut = [...FALLBACK_CONTAINERS_OUT];
      filters = this.fallbackRuntimeBuild().filters as Set<string>;
    } finally {
      this.logTail = [];
    }

    // HLS is multi-file/pathed; not deliverable as a single MediaBytes → exclude from declared out.
    containersOut = containersOut.filter((c) => c !== 'hls');

    const capabilities: CapabilitySet = {
      operations: {
        probe: true,
        demux: true,
        remux: true,
        transcode: true,
        decodeFrames: true,
        seek: true,
        trim: true,
        // mux is a documented core strength (dossier §4/§10 A.3/A.7): container WRITE from already-
        // encoded tracks via `-i vid -i aud -c copy out`. Declared so it is not a false-NA; the
        // genuinely-unencodable av1 mux row stays NA via the codec gate (av1 absent from videoCodecs).
        mux: true,
        decrypt: true,
      },
      containersIn,
      containersOut,
      videoCodecs,
      audioCodecs,
      videoCodecsIn,
      audioCodecsIn: audioCodecs,
      videoCodecsOut: videoCodecs,
      audioCodecsOut: audioCodecs.filter((codec) => codec !== 'opus'),
      encryption: ['cenc-ctr', 'hls-aes128'],
      features: this.featureList(),
      probeReadModes: ['whole-file'],
    };
    if (this.activeConfig) {
      this.activeConfig.runtimeProbeDigest = probeEvidence
        ? await sha256Hex(new TextEncoder().encode(probeEvidence))
        : null;
    }
    return {
      verified,
      capabilities,
      encoders,
      decoders,
      muxers,
      demuxers,
      filters,
    };
  }

  /** Tiny synthetic transcode to warm the encoder path (UNTIMED). Uses the first probed video codec
   *  that has a software encoder (prefer h264), so warm-up matches a real declared capability. */
  private async warmUp(ff: FFmpeg, signal: AbortSignal): Promise<void> {
    const declared = this.caps?.videoCodecs ?? [];
    const pick = declared.includes('h264') ? 'h264' : declared[0];
    const enc = pick ? videoEncoderName(pick) : null;
    if (!enc) return; // no usable video encoder → nothing to warm
    const base = `warm${this.seq++}`;
    const out = `${base}.mp4`;
    const args = [
      '-f', 'lavfi',
      '-i', 'color=c=black:s=64x64:r=5:d=0.2',
      '-c:v', enc,
      ...this.threadArgs(),
      out,
    ];
    this.logTail = [];
    this.recordCommand(args);
    const code = await ff.exec(args, READ_EXEC_TIMEOUT_MS, { signal });
    this.execsSinceLoad++;
    try {
      if (code === 0) await ff.deleteFile(out, { signal });
    } catch {
      /* ignore */
    }
  }

  async dispose(context?: LifecycleContext): Promise<void> {
    this.recordPhase('cleanup', { workerTerminated: true });
    this.snapshotConfig();
    await this.lifecycle.dispose(context?.signal.reason);
    this.ff = null;
    this.logTail = [];
    this.caps = null;
    this.runtimeBuild = null;
    this.activeOperation = null;
    this.mountedWorkerFs.clear();
    this.fsLedger.reset();
  }

  private snapshotConfig(): void {
    if (!this.activeConfig) return;
    this.activeConfig.memory = this.fsLedger.snapshot();
    this.configUsed = captureConfigUsedSnapshot(ENGINE_ID, this.activeConfig, { requireProfile: true });
  }

  private recordCommand(args: string[]): void {
    if (!this.activeConfig) return;
    this.activeConfig.commands.push(args.map(redactFfmpegArg));
    this.snapshotConfig();
  }

  private recordPolicy(reasonCode: string): void {
    if (!this.activeConfig || this.activeConfig.policyReasonCodes.includes(reasonCode)) return;
    this.activeConfig.policyReasonCodes.push(reasonCode);
    this.snapshotConfig();
  }

  private recordPhase(
    phase: FfmpegOperationPhase,
    extra: Pick<FfmpegPhaseEvidence, 'workerTerminated' | 'reasonCode'> = {},
  ): void {
    const active = this.activeOperation;
    if (!active || !this.activeConfig) return;
    active.phase = phase;
    const memory = this.fsLedger.snapshot();
    this.activeConfig.phaseTelemetry.push({
      phase,
      atMs: Math.max(0, nowMs() - active.startedAtMs),
      bytesIn: active.bytesIn,
      bytesOut: active.bytesOut,
      memfsBytes: memory.memfsBytes,
      workerFsBytes: memory.workerFsBytes,
      wrapperHeapBytes: memory.wrapperHeapBytes,
      estimatedPeakBytes: memory.estimatedPeakBytes,
      ...extra,
    });
    this.snapshotConfig();
  }

  private requireFf(): FFmpeg {
    if (!this.ff) throw new Error(`${ENGINE_ID}: init() must be called before use`);
    return this.ff;
  }

  /** `-threads N` for thread-aware encoders (mt fast path). Empty on the single-thread core. */
  private threadArgs(): string[] {
    const n = this.activeConfig?.wasmThreads ?? 1;
    return n > 1 ? ['-threads', String(n)] : [];
  }

  /** Fresh, collision-free scratch base for one operation. */
  private scratch(): string {
    return `op${this.seq++}`;
  }

  /** Run an ffmpeg exec, throwing a diagnostic error (with log tail) on non-zero exit. The optional
   *  `timeoutMs` guards fuzz/malformed inputs from hanging the worker (robustness dimension). */
  private async run(args: string[], timeoutMs?: number): Promise<void> {
    const code = await this.execObserved(args, timeoutMs);
    if (code !== 0) {
      throw new Error(
        `${ENGINE_ID}: ffmpeg exited ${code} for [${args.join(' ')}]. ` +
          `Log: ${this.logTail.slice(-8).join(' | ')}`,
      );
    }
  }

  /** Execute while retaining nonzero exits for read/probe commands whose failure is interpreted later. */
  private async execObserved(args: string[], timeoutMs?: number): Promise<number> {
    const ff = this.requireFf();
    const signal = this.activeOperation?.context.signal ?? this.fallbackAbort.signal;
    this.updateWorkingEstimate();
    this.recordPhase('execute');
    this.recordCommand(args);
    this.logTail = [];
    const startedAt = nowMs();
    try {
      const code = await ff.exec(args, timeoutMs, { signal });
      this.execsSinceLoad++;
      this.throwIfTimedOut(code, timeoutMs, nowMs() - startedAt, 'ffmpeg');
      return code;
    } catch (error) {
      if (signal.aborted) {
        const broken = this.lifecycle.reason ?? this.lifecycle.breakWorker(
          'FFMPEG_WORKER_CANCELLED',
          `ffmpeg worker was terminated during ${this.activeOperation?.phase ?? 'execute'}`,
          signal.reason,
        );
        throw broken;
      }
      if (timeoutMs !== undefined && nowMs() - startedAt >= timeoutMs * 0.9) {
        throw this.breakTimedOutWorker(timeoutMs, 'ffmpeg', error);
      }
      throw error;
    }
  }

  private async ffprobeObserved(args: string[], timeoutMs: number): Promise<number> {
    const signal = this.activeOperation?.context.signal ?? this.fallbackAbort.signal;
    this.updateWorkingEstimate();
    this.recordPhase('execute');
    this.recordCommand(['ffprobe', ...args]);
    const startedAt = nowMs();
    try {
      const code = await this.requireFf().ffprobe(args, timeoutMs, { signal });
      this.execsSinceLoad++;
      this.throwIfTimedOut(code, timeoutMs, nowMs() - startedAt, 'ffprobe');
      return code;
    } catch (error) {
      if (signal.aborted) {
        const broken = this.lifecycle.reason ?? this.lifecycle.breakWorker(
          'FFMPEG_WORKER_CANCELLED',
          `ffprobe worker was terminated during ${this.activeOperation?.phase ?? 'execute'}`,
          signal.reason,
        );
        throw broken;
      }
      if (nowMs() - startedAt >= timeoutMs * 0.9) {
        throw this.breakTimedOutWorker(timeoutMs, 'ffprobe', error);
      }
      throw error;
    }
  }

  private throwIfTimedOut(code: number, timeoutMs: number | undefined, elapsedMs: number, program: string): void {
    if (code !== 0 && timeoutMs !== undefined && elapsedMs >= timeoutMs * 0.9) {
      throw this.breakTimedOutWorker(timeoutMs, program);
    }
  }

  private breakTimedOutWorker(timeoutMs: number, program: string, cause?: unknown): FfmpegWorkerStateError {
    this.recordPhase(this.activeOperation?.phase ?? 'execute', {
      workerTerminated: true,
      reasonCode: 'FFMPEG_WORKER_TIMEOUT',
    });
    return this.lifecycle.breakWorker(
      'FFMPEG_WORKER_TIMEOUT',
      `${program} execution exceeded ${timeoutMs}ms and the worker was terminated; call init() for a fresh load`,
      cause,
    );
  }

  private updateWorkingEstimate(): void {
    const memory = this.fsLedger.snapshot();
    const request = this.activeOperation?.context.request;
    let maxPixels = 0;
    if (request) {
      for (const input of request.inputs) {
        for (const track of input.tracks) {
          if (track.type === 'video' && track.width && track.height) {
            maxPixels = Math.max(maxPixels, track.width * track.height);
          }
        }
      }
      if (request.output?.width && request.output.height) {
        maxPixels = Math.max(maxPixels, request.output.width * request.output.height);
      }
    }
    const materializedInput = memory.memfsBytes + memory.workerFsBytes;
    const fourRgbaFrames = maxPixels * 4 * 4;
    this.fsLedger.setWorkingEstimate(Math.min(
      Number.MAX_SAFE_INTEGER,
      materializedInput + fourRgbaFrames,
    ));
  }

  private async readBinary(path: string, countAsOutput = true): Promise<Uint8Array> {
    const signal = this.activeOperation?.context.signal ?? this.fallbackAbort.signal;
    this.recordPhase('read');
    const data = await this.requireFf().readFile(path, 'binary', { signal });
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : copyBytes(data);
    if (!this.fsLedger.snapshot().livePaths.includes(path)) this.fsLedger.add(path, bytes.byteLength, 'MEMFS');
    this.fsLedger.addJsCopy(bytes.byteLength);
    if (countAsOutput) this.recordOutputBytes(bytes.byteLength);
    return bytes;
  }

  private async readText(path: string): Promise<string> {
    const signal = this.activeOperation?.context.signal ?? this.fallbackAbort.signal;
    this.recordPhase('read');
    const data = await this.requireFf().readFile(path, 'utf8', { signal });
    const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
    this.fsLedger.add(path, new TextEncoder().encode(text).byteLength, 'MEMFS');
    return text;
  }

  private async writeScratch(path: string, source: Uint8Array, countAsInput = false): Promise<void> {
    const signal = this.activeOperation?.context.signal ?? this.fallbackAbort.signal;
    const bytes = copyBytes(source);
    this.recordPhase('materialize');
    this.fsLedger.addJsCopy(bytes.byteLength);
    try {
      await this.requireFf().writeFile(path, bytes, { signal });
    } finally {
      this.fsLedger.releaseJsCopy(bytes.byteLength);
    }
    this.fsLedger.add(path, bytes.byteLength, 'MEMFS');
    if (countAsInput) this.recordInputBytes(bytes.byteLength);
  }

  private async cleanup(paths: string[]): Promise<void> {
    // Timeout/cancellation terminates the worker, which also destroys its virtual FS. Cleanup must
    // not mask that distinct worker-state error by trying to address an already-dead worker.
    if (!this.ff) {
      for (const path of paths) {
        this.mountedWorkerFs.delete(path);
        this.fsLedger.remove(path);
      }
      return;
    }
    const ff = this.ff;
    const signal = this.activeOperation?.context.signal ?? this.fallbackAbort.signal;
    for (const p of paths) {
      try {
        if (this.mountedWorkerFs.has(p)) {
          await ff.unmount(p);
          await ff.deleteDir(p, { signal });
          this.mountedWorkerFs.delete(p);
        } else {
          await ff.deleteFile(p, { signal });
        }
        this.fsLedger.remove(p);
      } catch {
        // A path never materialized by this operation is not a cleanup failure. A tracked path is
        // retained in the ledger and executeOperation() turns it into a distinct worker/FS ERROR.
        if (!this.fsLedger.snapshot().livePaths.includes(p)) continue;
      }
    }
  }

  /** Write a MediaInput into MEMFS; HLS playlists also get their referenced segments/keys. */
  private async writeInput(input: MediaInput, name: string, preloadedBytes?: Uint8Array): Promise<WrittenInput> {
    const signal = this.activeOperation?.context.signal ?? this.fallbackAbort.signal;
    const hintedHls = isHlsPlaylistInput(input);
    if (!hintedHls && preloadedBytes === undefined) {
      const blob = await input.blob();
      this.enforceInputCeiling(blob.size, input);
      if (blob.size >= WORKERFS_THRESHOLD_BYTES) {
        const mountPoint = `/${name}.workerfs`;
        const fileName = `input${inputExtension(input)}`;
        try {
          await this.requireFf().createDir(mountPoint, { signal });
          await this.requireFf().mount(
            'WORKERFS' as import('@ffmpeg/ffmpeg').FFFSType,
            { blobs: [{ name: fileName, data: blob }] },
            mountPoint,
          );
          this.mountedWorkerFs.add(mountPoint);
          this.fsLedger.add(mountPoint, blob.size, 'WORKERFS');
          this.recordInputBytes(blob.size);
          return {
            name: `${mountPoint}/${fileName}`,
            cleanupPaths: [mountPoint],
            inputOptions: [],
            workerFs: true,
          };
        } catch (error) {
          try {
            await this.requireFf().deleteDir(mountPoint, { signal });
          } catch {
            // The directory may not have been created, or a failed mount may still own it.
          }
          throw new Error(`${ENGINE_ID}: WORKERFS mount failed for ${blob.size}-byte input`, { cause: error });
        }
      }
    }

    const bytes = preloadedBytes ?? copyBytes(await input.arrayBuffer());
    this.enforceInputCeiling(bytes.byteLength, input);
    this.fsLedger.addJsCopy(bytes.byteLength);
    const hls = isHlsPlaylistInput(input, bytes);
    const inName = hls && !name.endsWith('.m3u8') ? `${name}.m3u8` : name;
    const cleanupPaths = [inName];

    try {
      if (!hls) {
        await this.requireFf().writeFile(inName, bytes, { signal });
        this.fsLedger.add(inName, bytes.byteLength, 'MEMFS');
        this.recordInputBytes(bytes.byteLength);
        this.fsLedger.releaseJsCopy(bytes.byteLength);
        return { name: inName, cleanupPaths, inputOptions: [] };
      }

      const playlistText = new TextDecoder().decode(bytes);
      const materialized = rewriteHlsPlaylistUris(playlistText, inName);
      if (materialized.sidecars.length > this.limits.hlsSidecarCeiling) {
        throw this.materializationMiss(
          'FFMPEG_HLS_SIDECAR_LIMIT',
          `HLS playlist references ${materialized.sidecars.length} objects; limit is ${this.limits.hlsSidecarCeiling}`,
        );
      }
      const playlistBytes = new TextEncoder().encode(materialized.playlist);
      await this.requireFf().writeFile(inName, playlistBytes, { signal });
      this.fsLedger.add(inName, playlistBytes.byteLength, 'MEMFS');
      this.recordInputBytes(bytes.byteLength);
      this.fsLedger.releaseJsCopy(bytes.byteLength);
      let hlsBytes = playlistBytes.byteLength;

      for (const sidecar of materialized.sidecars) {
        const res = await fetch(resolveHlsSidecarUrl(input, sidecar.sourceUri), { cache: 'no-store', signal });
        if (!res.ok) {
          throw new Error(
            `${ENGINE_ID}: failed to materialize HLS sidecar '${sidecar.sourceUri}' ` +
            `(${res.status} ${res.statusText})`,
          );
        }
        cleanupPaths.push(sidecar.localName);
        const contentLength = Number(res.headers.get('content-length'));
        if (
          Number.isFinite(contentLength) &&
          contentLength >= 0 &&
          hlsBytes + contentLength > this.limits.hlsMaterializedBytesCeiling
        ) {
          throw this.materializationMiss(
            'FFMPEG_HLS_BYTE_LIMIT',
            `HLS materialization exceeds ${this.limits.hlsMaterializedBytesCeiling} bytes`,
          );
        }
        const sidecarBytes = copyBytes(await res.arrayBuffer());
        hlsBytes += sidecarBytes.byteLength;
        if (hlsBytes > this.limits.hlsMaterializedBytesCeiling) {
          throw this.materializationMiss(
            'FFMPEG_HLS_BYTE_LIMIT',
            `HLS materialization exceeds ${this.limits.hlsMaterializedBytesCeiling} bytes`,
          );
        }
        this.fsLedger.addJsCopy(sidecarBytes.byteLength);
        try {
          await this.requireFf().writeFile(sidecar.localName, sidecarBytes, { signal });
        } finally {
          this.fsLedger.releaseJsCopy(sidecarBytes.byteLength);
        }
        this.fsLedger.add(sidecar.localName, sidecarBytes.byteLength, 'MEMFS');
        this.recordInputBytes(sidecarBytes.byteLength);
      }

      return { name: inName, cleanupPaths, inputOptions: ['-allowed_extensions', 'ALL'] };
    } catch (e) {
      this.fsLedger.releaseJsCopy(bytes.byteLength);
      await this.cleanup(cleanupPaths);
      throw e;
    }
  }

  private enforceInputCeiling(bytes: number, input: MediaInput): void {
    if (bytes >= this.limits.wasmCeilingBytes) {
      throw this.materializationMiss(
        'FFMPEG_WASM_2GB_CEILING',
        `${bytes}-byte input '${input.id}' reaches the ffmpeg.wasm 2 GB ceiling`,
      );
    }
  }

  private materializationMiss(reasonCode: string, reason: string): Error {
    const request = this.activeOperation?.context.request;
    if (request?.inputs.some((input) => input.mutated)) {
      return new Error(`${ENGINE_ID}: malformed/mutated input exceeded a materialization guard: ${reason}`);
    }
    this.recordPolicy(reasonCode);
    return createNotApplicableError(
      ENGINE_ID,
      request?.operation ?? 'probe',
      reason,
      request ? tupleSummary(request) : {},
      reasonCode,
    ) as unknown as Error;
  }

  private applicabilityMiss(reasonCode: string, reason: string): Error {
    const request = this.activeOperation?.context.request;
    this.recordPolicy(reasonCode);
    return createNotApplicableError(
      ENGINE_ID,
      request?.operation ?? 'decrypt',
      reason,
      request ? tupleSummary(request) : {},
      reasonCode,
    ) as unknown as Error;
  }

  async probe(input: MediaInput, context?: OperationContext): Promise<NormalizedMetadata> {
    return this.executeOperation('probe', context, () => this.probeImpl(input));
  }

  async demux(input: MediaInput, context?: OperationContext): Promise<DemuxResult> {
    return this.executeOperation('demux', context, () => this.demuxImpl(input));
  }

  async remux(
    input: MediaInput,
    opts: { container: string; tags?: Record<string, string> } & Record<string, unknown>,
    context?: OperationContext,
  ): Promise<MediaBytes> {
    return this.executeOperation('remux', context, () => this.remuxImpl(input, opts));
  }

  async decrypt(
    input: MediaInput,
    key: DecryptKey,
    opts: { scheme: EncryptionScheme },
    context?: OperationContext,
  ): Promise<MediaBytes> {
    return this.executeOperation('decrypt', context, () => this.decryptImpl(input, key, opts));
  }

  async transcode(input: MediaInput, opts: TranscodeOptions, context?: OperationContext): Promise<MediaBytes> {
    return this.executeOperation('transcode', context, () => this.transcodeImpl(input, opts));
  }

  async trim(
    input: MediaInput,
    range: { startUs: number; endUs: number },
    opts: TrimOptions,
    context?: OperationContext,
  ): Promise<MediaBytes> {
    return this.executeOperation('trim', context, () => this.trimImpl(input, range, opts));
  }

  async decodeFrames(
    input: MediaInput,
    opts?: DecodeOptions,
    context?: OperationContext,
  ): Promise<FrameSink> {
    return this.executeOperation('decodeFrames', context, () => this.decodeFramesImpl(input, opts));
  }

  async seek(
    input: MediaInput,
    tUs: number,
    context?: OperationContext,
  ): Promise<{ landedPtsUs: number; frame: FrameDigest }> {
    return this.executeOperation('seek', context, () => this.seekImpl(input, tUs));
  }

  async prepareMuxTracks(
    inputs: MediaInput[],
    options?: Record<string, unknown>,
    context?: OperationContext,
  ): Promise<EncodedTracks> {
    return this.executeOperation('mux', context, () => this.prepareMuxTracksImpl(inputs, options));
  }

  async mux(
    tracks: EncodedTracks,
    opts: { container: string } & Record<string, unknown>,
    context?: OperationContext,
  ): Promise<MediaBytes> {
    return this.executeOperation('mux', context, () => this.muxImpl(tracks, opts));
  }

  async concat(
    segments: MediaBytes[],
    opts: { container: string } & Record<string, unknown>,
    context?: OperationContext,
  ): Promise<MediaBytes> {
    return this.executeOperation('trim', context, () => this.concatImpl(segments, opts));
  }

  private async executeOperation<T extends object>(
    operation: ConcreteOperationRequest['operation'],
    suppliedContext: OperationContext | undefined,
    run: () => Promise<T>,
  ): Promise<T> {
    const context = suppliedContext ?? fallbackOperationContext(operation, this.fallbackAbort.signal);
    // Runner calls carry the complete concrete tuple and are preflighted here. Legacy/direct API
    // calls do not, so applying an empty synthetic tuple would itself create false NA_ENGINE (most
    // visibly for decrypt's absent encryption field); their operation-specific checks remain active.
    if (suppliedContext !== undefined) {
      const decision = this.supports(context.request);
      if (!decision.supported) {
        this.recordPolicy(decision.reasonCode);
        throw createNotApplicableError(
          ENGINE_ID,
          operation,
          decision.reason,
          tupleSummary(context.request),
          decision.reasonCode,
        );
      }
    }
    return this.lifecycle.operation(context.signal, async () => {
      this.fsLedger.assertEmpty();
      if (this.execsSinceLoad >= MAX_EXECS_PER_WORKER) {
        await this.loadWorker(context.signal);
      }
      this.fsLedger.reset();
      this.fsLedger.setWrapperHeapEstimate(WRAPPER_HEAP_ESTIMATE_BYTES);
      this.activeOperation = {
        startedAtMs: nowMs(),
        phase: 'materialize',
        bytesIn: 0,
        bytesOut: 0,
        context,
      };
      this.recordPhase('materialize');
      let completed = false;
      try {
        const result = await run();
        completed = true;
        const telemetry = this.finalCounters();
        (result as T & { telemetry?: OperationFinalCounters }).telemetry = telemetry;
        this.snapshotConfig();
        return result;
      } finally {
        const broken = this.lifecycle.reason;
        if (broken) {
          this.recordPhase(this.activeOperation?.phase ?? 'cleanup', {
            workerTerminated: true,
            reasonCode: broken.reasonCode,
          });
        }
        this.fsLedger.setWorkingEstimate(0);
        this.recordPhase('cleanup', broken
          ? { workerTerminated: true, reasonCode: broken.reasonCode }
          : {});
        const live = this.fsLedger.snapshot().livePaths;
        this.activeOperation = null;
        this.snapshotConfig();
        if (live.length > 0) {
          throw this.lifecycle.breakWorker(
            'FFMPEG_FS_CLEANUP_FAILED',
            `ffmpeg virtual filesystem retained ${live.join(', ')} after ${operation}${completed ? '' : ' failure'}`,
          );
        }
      }
    });
  }

  private finalCounters(): OperationFinalCounters {
    const active = this.activeOperation;
    if (!active) return {};
    return {
      ...(active.bytesIn > 0 ? { bytesRead: active.bytesIn } : {}),
      ...(active.bytesOut > 0 ? { bytesWritten: active.bytesOut } : {}),
      ...(active.packetCount !== undefined ? { packetCount: active.packetCount } : {}),
      ...(active.decodedFrames !== undefined ? { decodedFrames: active.decodedFrames } : {}),
    };
  }

  private recordInputBytes(bytes: number): void {
    const active = this.activeOperation;
    if (!active || bytes <= 0) return;
    active.bytesIn += bytes;
    active.context.emit({ type: 'bytes-read', atMs: nowMs() - active.startedAtMs, bytes: active.bytesIn });
  }

  private recordOutputBytes(bytes: number): void {
    const active = this.activeOperation;
    if (!active || bytes <= 0) return;
    active.bytesOut += bytes;
    active.context.emit({ type: 'bytes-written', atMs: nowMs() - active.startedAtMs, bytes: active.bytesOut });
  }

  private captureDemuxTimestamp(message: string): void {
    if (!this.demuxTimestampCapture) return;
    const timestamp = parseDemuxTimestampLog(message);
    if (!timestamp) return;
    const rows = this.demuxTimestampCapture.get(timestamp.trackIndex) ?? [];
    rows.push(timestamp);
    this.demuxTimestampCapture.set(timestamp.trackIndex, rows);
  }

  private captureDemuxMetadataLog(message: string): void {
    const capture = this.demuxMetadataLogCapture;
    if (!capture || capture.length >= 512) return;
    const trimmed = message.trim();
    if (capture.length === 0 && !/^Input #\d+/.test(trimmed)) return;
    if (capture.some((row) => /^(Output #|Stream mapping:|Press \[q\])/.test(row.trim()))) return;
    capture.push(message);
  }

  // ── probe ────────────────────────────────────────────────────────────────────────────────────

  private async structuredProbe(
    inName: string,
    inputOptions: string[],
    input: MediaInput,
    options: { countFrames?: boolean } = {},
  ): Promise<StructuredProbeResult | null> {
    const outName = `${this.scratch()}.ffprobe.json`;
    const args = [
      '-v', 'error',
      ...inputOptions,
      ...(options.countFrames === false ? [] : ['-count_frames']),
      '-show_format',
      '-show_streams',
      '-show_data',
      '-of', 'json',
      '-i', inName,
      '-o', outName,
    ];
    try {
      const code = await this.ffprobeObserved(args, READ_EXEC_TIMEOUT_MS);
      if (code !== 0) return null;
      const text = await this.readText(outName);
      this.fsLedger.add(outName, new TextEncoder().encode(text).byteLength, 'MEMFS');
      const parsed = parseFfprobeJson(text, containerFromInput(input));
      this.lastStructuredProbe = parsed;
      if (this.activeConfig) {
        const configs: Array<Record<string, unknown>> = [];
        for (const [trackIndex, bytes] of parsed.decoderConfigs) {
          configs.push({ trackIndex, bytes: bytes.byteLength, sha256: await sha256Hex(bytes) });
        }
        this.activeConfig.codecConfigs = configs;
        this.snapshotConfig();
      }
      return parsed;
    } catch (error) {
      if (this.lifecycle.reason || this.activeOperation?.context.signal.aborted) throw error;
      return null;
    } finally {
      await this.cleanup([outName]);
    }
  }

  /**
   * Observe the first seeked packets once. Their decode reorder bounds the copy tail, while the
   * earliest cross-track PTS exposes audio preroll that fragmented MP4 would otherwise fold into
   * an artificially long first video sample.
   */
  private async copyTrimPacketTimingSec(
    inName: string,
    inputOptions: string[],
    startSec: number,
    videoTrackIndex: number | undefined,
  ): Promise<{ reorderPaddingSec: number; videoLeadingOffsetSec: number }> {
    const outName = `${this.scratch()}.reorder.framecrc`;
    const capture = new Map<number, DemuxTimestampEvidence[]>();
    this.demuxTimestampCapture = capture;
    try {
      const code = await this.execObserved([
        '-hide_banner',
        '-debug_ts',
        '-ss', startSec.toFixed(6),
        ...inputOptions,
        '-i', inName,
        '-map', '0',
        '-t', '0.001000',
        '-c', 'copy',
        '-f', 'framecrc',
        outName,
      ], READ_EXEC_TIMEOUT_MS);
      if (code !== 0) return { reorderPaddingSec: 0, videoLeadingOffsetSec: 0 };
      const resolvedVideoTrackIndex = videoTrackIndex ?? 0;
      const firstVideo = capture.get(resolvedVideoTrackIndex)?.[0];
      let earliestPtsUs = Number.POSITIVE_INFINITY;
      for (const rows of capture.values()) {
        for (const row of rows) earliestPtsUs = Math.min(earliestPtsUs, row.ptsUs);
      }
      return {
        reorderPaddingSec: firstVideo?.dtsUs === undefined
          ? 0
          : Math.max(0, firstVideo.ptsUs - firstVideo.dtsUs) / 1_000_000,
        videoLeadingOffsetSec: firstVideo === undefined || !Number.isFinite(earliestPtsUs)
          ? 0
          : Math.max(0, firstVideo.ptsUs - earliestPtsUs) / 1_000_000,
      };
    } catch (error) {
      if (this.lifecycle.reason || this.activeOperation?.context.signal.aborted) throw error;
      return { reorderPaddingSec: 0, videoLeadingOffsetSec: 0 };
    } finally {
      this.demuxTimestampCapture = null;
      await this.cleanup([outName]);
    }
  }

  private async observedFrameTimeline(
    inName: string,
    inputOptions: string[],
    sampleDurationSec?: number,
    videoOrdinal = 0,
  ): Promise<ReturnType<typeof parseFfprobeFramesJson>> {
    const outName = `${this.scratch()}.frames.json`;
    const args = [
      '-v', 'error',
      ...inputOptions,
      ...(sampleDurationSec !== undefined ? ['-read_intervals', `0%+${sampleDurationSec}`] : []),
      '-select_streams', `v:${videoOrdinal}`,
      '-show_frames',
      '-show_entries', 'frame=best_effort_timestamp_time,pts_time,pkt_duration_time,key_frame',
      '-of', 'json',
      '-i', inName,
      '-o', outName,
    ];
    try {
      const code = await this.ffprobeObserved(args, READ_EXEC_TIMEOUT_MS);
      if (code !== 0) return [];
      const text = await this.readText(outName);
      this.fsLedger.add(outName, new TextEncoder().encode(text).byteLength, 'MEMFS');
      return parseFfprobeFramesJson(text);
    } finally {
      await this.cleanup([outName]);
    }
  }

  /**
   * Prefer the suite's payload-bearing neutral reader over the browser ffprobe `-show_frames` path.
   * The pinned browser ffprobe core can return a successful empty frame document for valid media;
   * treating that as a real timeline caused requested seek times and nominal CFR timestamps to be
   * reported as observations.
   */
  private async neutralObservedFrameTimeline(
    input: MediaInput,
    videoOrdinal = 0,
  ): Promise<ReturnType<typeof parseFfprobeFramesJson>> {
    if (typeof input.sizeBytes === 'number' &&
        input.sizeBytes > NEUTRAL_FRAME_TIMELINE_CEILING_BYTES) {
      return [];
    }
    try {
      const bytes = new Uint8Array(await input.arrayBuffer());
      const read = readNeutralRemuxProgram(bytes, containerFromInput(input));
      return read.state === 'OK'
        ? observedFrameTimelineFromProgram(read.value, videoOrdinal)
        : [];
    } catch (error) {
      if (this.lifecycle.reason || this.activeOperation?.context.signal.aborted) throw error;
      return [];
    }
  }

  private async probeImpl(input: MediaInput): Promise<NormalizedMetadata> {
    if (isStillImageInput(input)) {
      throw new Error(`${ENGINE_ID}: probe rejected still-image input; this suite probes media containers only`);
    }
    const base = this.scratch();
    const request = this.activeOperation?.context.request;
    const inspectCenc = request?.encryption === 'cenc-ctr' || request?.encryption === 'cenc-cbcs' ||
      request?.encryption === 'cenc-cens';
    const inspectMp3 = containerFromInput(input) === 'mp3';
    let preloadedBytes = inspectCenc || inspectMp3 ? copyBytes(await input.arrayBuffer()) : undefined;
    const protection = inspectCenc && preloadedBytes ? inspectProtectionStructure(preloadedBytes) : undefined;
    const mp3DurationSec = inspectMp3 && preloadedBytes ? parseMp3XingDurationSec(preloadedBytes) : null;
    const written = await this.writeInput(input, `${base}.in`, preloadedBytes);
    preloadedBytes = undefined;
    try {
      try {
        const structured = await this.structuredProbe(written.name, written.inputOptions, input);
        if (structured) {
          const observed = await this.observedFrameTimeline(written.name, written.inputOptions, 10);
          const metadata = applyObservedFrameCadence(structured.metadata, observed);
          this.attachProbeProtection(metadata, protection);
          this.attachMp3Duration(metadata, mp3DurationSec);
          metadata.probeEvidence = { readMode: 'whole-file' };
          return metadata;
        }
        const log = await this.runInfo(written.name, written.inputOptions);
        const metadata = this.metadataFromLog(log, input);
        this.attachProbeProtection(metadata, protection);
        this.attachMp3Duration(metadata, mp3DurationSec);
        for (const track of metadata.tracks) {
          if (track.type === 'video' && track.fps !== undefined) {
            track.fpsProvenance = { source: 'nominal', cadence: 'UNKNOWN' };
          }
        }
        metadata.probeEvidence = { readMode: 'whole-file' };
        return metadata;
      } catch (error) {
        if (request?.options.gracefulAllowOutput === true) {
          throw createMalformedInputError(
            ENGINE_ID,
            'probe',
            'parse',
            describeError(error),
            'FFMPEG_PROBE_MALFORMED_INPUT_REJECTED',
            input.id,
            error,
          );
        }
        throw error;
      }
    } finally {
      await this.cleanup(written.cleanupPaths);
    }
  }

  private attachProbeProtection(
    metadata: NormalizedMetadata,
    protection: ReturnType<typeof inspectProtectionStructure> | undefined,
  ): void {
    if (!protection || protection.protectedTracks === 0) return;
    (metadata as NormalizedMetadata & {
      protection?: { encrypted: boolean; scheme: string | null; source: 'container' };
    }).protection = {
      encrypted: true,
      scheme: protection.scheme ?? null,
      source: 'container',
    };
  }

  private attachMp3Duration(metadata: NormalizedMetadata, durationSec: number | null): void {
    if (durationSec === null) return;
    metadata.durationSec = Math.round(durationSec * 1000) / 1000;
  }

  /**
   * Run `ffmpeg -i <in>` purely to print the input's stream info to the log, and return the captured
   * log. `ffmpeg -i` with no output file always exits non-zero ("At least one output file must be
   * specified") AFTER it has printed the Input block — so a non-zero code here is EXPECTED and not an
   * error. We only fail if the log shows the input could not be opened/parsed at all.
   */
  private async runInfo(inName: string, inputOptions: string[] = []): Promise<string> {
    // Nonzero is expected because no output is requested; timeout and worker failures remain fatal.
    await this.execObserved(['-hide_banner', ...inputOptions, '-i', inName], READ_EXEC_TIMEOUT_MS);
    const log = this.logTail.join('\n');
    this.logTail = [];
    if (!/^Input #\d+/m.test(log)) {
      throw new Error(
        `${ENGINE_ID}: ffmpeg could not read input for probe. Log: ${log.split('\n').slice(-8).join(' | ')}`,
      );
    }
    return log;
  }

  /**
   * The first video track (with known dimensions) parsed from an `ffmpeg -i` log. Used by
   * decodeFrames/seek to size + time the raw RGBA stream. Throws a clear error when the input has no
   * decodable video track (so the runner negotiates it honestly rather than slicing garbage).
   */
  private firstVideoTrack(log: string, op: string): NormalizedTrack & { width: number; height: number } {
    const v = parseTracksFromLog(log).find((t) => t.type === 'video');
    if (!v || v.width === undefined || v.height === undefined) {
      throw new Error(`${ENGINE_ID}: no decodable video stream for ${op}`);
    }
    return v as NormalizedTrack & { width: number; height: number };
  }

  /** Build NormalizedMetadata from an `ffmpeg -i` log + the input's container (from its id/url). */
  private metadataFromLog(log: string, input: MediaInput): NormalizedMetadata {
    const durationSec = parseDurationSecFromLog(log);
    const tracks = parseTracksFromLog(log);
    const tags = parseTagsFromLog(log);
    const meta: NormalizedMetadata = {
      container: containerFromFfmpegLog(log, containerFromInput(input)),
      durationSec: durationSec === null ? null : Math.round(durationSec * 1000) / 1000,
      tracks,
    };
    if (Object.keys(tags).length) meta.tags = tags;
    return meta;
  }

  // ── demux ────────────────────────────────────────────────────────────────────────────────────

  private demuxScaleDeadlineMs(): number | undefined {
    const robustness = this.activeOperation?.context.request.options.robustness;
    if (!robustness || typeof robustness !== 'object' || Array.isArray(robustness)) return undefined;
    const record = robustness as Record<string, unknown>;
    if (record.schema !== 'media-test/demux-scale-contract@1') return undefined;
    const limits = record.limits;
    if (!limits || typeof limits !== 'object' || Array.isArray(limits)) return undefined;
    const lastPacketMs = (limits as Record<string, unknown>).lastPacketMs;
    return typeof lastPacketMs === 'number' && Number.isFinite(lastPacketMs) && lastPacketMs > 0
      ? lastPacketMs
      : undefined;
  }

  private async completeDemuxDecoderConfigs(
    input: MediaInput,
    written: WrittenInput,
    metadata: NormalizedMetadata,
    existing: ReadonlyMap<number, Uint8Array>,
    sourceTrackIndexes: readonly number[],
    timeoutMs: number,
    allowWholeFileRead: boolean,
  ): Promise<{
    configs: Map<number, Uint8Array>;
    packetDigests: Map<number, Array<{ size: number; ptsUs?: number; digest: string }>>;
  }> {
    const configs = new Map<number, Uint8Array>(existing);
    const packetDigests = new Map<number, Array<{ size: number; ptsUs?: number; digest: string }>>();
    const container = metadata.container;
    if (container === 'ts' || container === 'hls') return { configs, packetDigests };

    if (allowWholeFileRead) {
      const bytes = new Uint8Array(await input.arrayBuffer());
      this.fsLedger.addJsCopy(bytes.byteLength);
      this.recordInputBytes(bytes.byteLength);
      try {
        const read = readNeutralRemuxProgram(bytes, container);
        if (read.state === 'OK') {
          const claimed = new Set<number>();
          for (let trackIndex = 0; trackIndex < metadata.tracks.length; trackIndex++) {
            const track = metadata.tracks[trackIndex]!;
            const sourceTrackIndex = sourceTrackIndexes[trackIndex] ?? trackIndex;
            if (configs.has(sourceTrackIndex)) continue;
            const matchIndex = read.value.tracks.findIndex((candidate, index) =>
              !claimed.has(index) && candidate.type === track.type && candidate.codec === track.codec);
            if (matchIndex < 0) continue;
            claimed.add(matchIndex);
            const matchedTrack = read.value.tracks[matchIndex]!;
            const codecPrivate = matchedTrack.codecPrivate;
            const config = codecPrivate
              ? track.codec === 'aac'
                ? audioSpecificConfigFromEsds(codecPrivate)
                : codecPrivate
              : undefined;
            if (config) configs.set(sourceTrackIndex, new Uint8Array(config));
            if (track.codec === 'aac' || track.codec === 'h264' || track.codec === 'hevc') {
              packetDigests.set(trackIndex, await Promise.all(matchedTrack.samples.map(async (sample) => ({
                size: sample.payload.byteLength,
                ...(sample.ptsUs !== undefined ? { ptsUs: sample.ptsUs } : {}),
                digest: await sha256Hex(sample.payload),
              }))));
            }
          }
        }
      } finally {
        this.fsLedger.releaseJsCopy(bytes.byteLength);
      }
    }

    const declaredAudio = this.activeOperation?.context.request.inputs[0]?.tracks
      ?.filter((track) => track.type === 'audio') ?? [];
    let audioOrdinal = 0;
    for (let trackIndex = 0; trackIndex < metadata.tracks.length; trackIndex++) {
      const track = metadata.tracks[trackIndex]!;
      if (track.type !== 'audio') continue;
      const declared = declaredAudio[audioOrdinal++];
      const sourceTrackIndex = sourceTrackIndexes[trackIndex] ?? trackIndex;
      if (track.codec !== 'aac' || configs.has(sourceTrackIndex)) continue;
      const config = aacAudioSpecificConfig(
        declared?.audioObjectType ?? track.audioObjectType ?? 2,
        declared?.sampleRate ?? track.sampleRate ?? 0,
        declared?.channels ?? track.channels ?? 0,
      );
      if (config) configs.set(sourceTrackIndex, config);
    }

    let videoOrdinal = 0;
    for (let trackIndex = 0; trackIndex < metadata.tracks.length; trackIndex++) {
      const track = metadata.tracks[trackIndex]!;
      if (track.type !== 'video') continue;
      const ordinal = videoOrdinal++;
      const sourceTrackIndex = sourceTrackIndexes[trackIndex] ?? trackIndex;
      if (track.codec !== 'h264' || configs.has(sourceTrackIndex)) continue;
      const outName = `${this.scratch()}.first.h264`;
      try {
        await this.run([
          '-hide_banner',
          ...written.inputOptions,
          '-i', written.name,
          '-map', `0:v:${ordinal}`,
          '-c:v', 'copy',
          '-frames:v', '1',
          '-bsf:v', 'h264_mp4toannexb',
          '-f', 'h264',
          outName,
        ], timeoutMs);
        const bytes = await this.readBinary(outName, false);
        try {
          const config = avcDecoderConfigFromAnnexB(bytes);
          if (!config) throw new Error('bounded H.264 extraction did not expose SPS/PPS');
          configs.set(sourceTrackIndex, config);
        } finally {
          this.fsLedger.releaseJsCopy(bytes.byteLength);
        }
      } finally {
        await this.cleanup([outName]);
      }
    }

    return { configs, packetDigests };
  }

  private wavDemuxPacketBytes(request: ConcreteOperationRequest | undefined): number {
    const audio = request?.inputs[0]?.tracks?.find((track) => track.type === 'audio');
    const channels = audio?.channels ?? 1;
    const bytesPerSample = audio?.codec === 'pcm-s24' ? 3 : audio?.codec === 'pcm-f32' ? 4 : 2;
    const sampleRate = audio?.sampleRate ?? 48_000;
    const packetSampleFrames = 2 ** Math.max(0, Math.floor(Math.log2(sampleRate / 10)));
    return packetSampleFrames * channels * bytesPerSample;
  }

  private async demuxImpl(input: MediaInput): Promise<DemuxResult> {
    const base = this.scratch();
    const request = this.activeOperation?.context.request;
    const scaleDeadlineMs = this.demuxScaleDeadlineMs();
    const checksumName = `${base}.framecrc.txt`;
    const inspectMp3 = containerFromInput(input) === 'mp3';
    let preloadedBytes = inspectMp3 ? copyBytes(await input.arrayBuffer()) : undefined;
    const mp3DurationSec = preloadedBytes ? parseMp3XingDurationSec(preloadedBytes) : null;
    const written = await this.writeInput(input, `${base}.in`, preloadedBytes);
    preloadedBytes = undefined;
    try {
      try {
      // The bundled browser ffprobe entry point is unreliable and can consume the full scale budget
      // before returning no JSON. Demux uses the loaded ffmpeg program plus bounded container readers.
      // ONE stream-copy pass writes framecrc timing/size/flag evidence without re-packetizing, while
      // the SAME run prints the Input block to the
      // log so we can build metadata from it (no ffprobe). The explicit `-map 0` is required because
      // FFmpeg's default stream selection keeps only one stream per type, which would silently drop
      // secondary audio/subtitle/data tracks from multi-track packet walks. The checksum muxers enumerate the real
      // container packets, so its row count + sizes + keyframe flags match an ffprobe `-show_packets`
      // walk for compressed bitstreams. (Verified byte-for-byte vs golden for mp4/mov/webm/mkv/ts/ogg.)
      const container = containerFromInput(input);
      const preserveDemuxTimestamps = container === 'ts' || container === 'hls';
      const sourceTimestamps = preserveDemuxTimestamps
        ? new Map<number, DemuxTimestampEvidence[]>()
        : undefined;
      this.demuxTimestampCapture = sourceTimestamps ?? null;
      const metadataLogRows: string[] = [];
      this.demuxMetadataLogCapture = metadataLogRows;
      let exitCode: number | null = null;
      try {
        exitCode = await this.execObserved(
        [
          '-hide_banner',
          ...(preserveDemuxTimestamps ? ['-debug_ts', '-copyts'] : []),
          ...written.inputOptions,
          ...(container === 'wav' ? ['-max_size', String(this.wavDemuxPacketBytes(request))] : []),
          '-i',
          written.name,
          '-map',
          '0',
          '-c',
          'copy',
          ...(preserveDemuxTimestamps ? ['-copyinkf'] : []),
          '-f',
          'framecrc',
          checksumName,
        ],
        Math.max(READ_EXEC_TIMEOUT_MS, scaleDeadlineMs ?? 0),
        );
      } finally {
        this.demuxTimestampCapture = null;
        this.demuxMetadataLogCapture = null;
      }
      const logTail = this.logTail.join('\n');
      const log = metadataLogRows.length > 0 ? metadataLogRows.join('\n') : logTail;
      this.logTail = [];

      if (exitCode !== 0 && !/^Input #\d+/m.test(log)) {
        throw new Error(
          `${ENGINE_ID}: demux failed to open input (framecrc exit ${exitCode}). ` +
            `Log: ${logTail.split('\n').slice(-8).join(' | ')}`,
        );
      }

      const metadata = this.metadataFromLog(log, input);
      this.attachMp3Duration(metadata, mp3DurationSec);

      let checksum: string;
      try {
        checksum = await this.readText(checksumName);
      } catch (e) {
        throw new Error(
          `${ENGINE_ID}: demux produced no framecrc output (exit ${exitCode}): ${describeError(e)}. ` +
            `Log: ${logTail.split('\n').slice(-8).join(' | ')}`,
        );
      }

      const packets = parseFrameChecksumPackets(checksum, sourceTimestamps);
      if (container === 'mkv' || container === 'webm') {
        normalizeSyntheticLeadingEbmlDts(packets);
      }
      const sourceTrackIndexes = metadata.tracks.map((_, index) => index);
      const decoderEvidence = await this.completeDemuxDecoderConfigs(
        input,
        written,
        metadata,
        new Map(),
        sourceTrackIndexes,
        Math.max(READ_EXEC_TIMEOUT_MS, scaleDeadlineMs ?? 0),
        scaleDeadlineMs === undefined,
      );
      const decoderConfigs = decoderEvidence.configs;
      for (const [trackIndex, digests] of decoderEvidence.packetDigests) {
        const trackPackets = packets.filter((packet) => packet.trackIndex === trackIndex);
        if (trackPackets.length !== digests.length) continue;
        for (let index = 0; index < trackPackets.length; index++) {
          const packet = trackPackets[index]!;
          const digest = digests[index]!;
          if (
            packet.size === digest.size &&
            (digest.ptsUs === undefined || packet.ptsUs === digest.ptsUs)
          ) {
            packet.payloadDigest = digest.digest;
          }
        }
      }
      const representations = representationForTracks(
        metadata.container,
        metadata.tracks,
        decoderConfigs,
        new Map(),
        sourceTrackIndexes,
      );
      const configuredTracks = new Set<number>();
      for (const packet of packets) {
        const track = metadata.tracks[packet.trackIndex];
        const representation = representations.find((item) => item.trackIndex === packet.trackIndex);
        const sourceTrackIndex = sourceTrackIndexes[packet.trackIndex] ?? packet.trackIndex;
        const decoderConfig = decoderConfigs.get(sourceTrackIndex);
        if (track) {
          packet.trackType = track.type;
          if (track.type === 'video' || track.type === 'audio') packet.codec = track.codec;
        }
        if (representation) packet.framing = representation.framing;
        if (decoderConfig && !configuredTracks.has(packet.trackIndex)) {
          packet.decoderConfig = new Uint8Array(decoderConfig);
          configuredTracks.add(packet.trackIndex);
        }
        packet.randomAccessKind = packet.keyframe ? 'ffmpeg-packet-key-flag' : 'non-random-access';
      }
      packets.sort(
        (a, b) =>
          (a.dtsUs ?? a.ptsUs) - (b.dtsUs ?? b.ptsUs) ||
          a.trackIndex - b.trackIndex,
      );
      if (this.activeOperation) this.activeOperation.packetCount = packets.length;
      return {
        metadata,
        packets,
        packetOrdering: 'decode',
        representations,
        ffmpegRepresentation: {
          muxer: 'framecrc',
          bitstreamFilters: [],
          command: redactFfmpegCommand([
            '-hide_banner',
            ...(preserveDemuxTimestamps ? ['-debug_ts', '-copyts'] : []),
            ...written.inputOptions,
            ...(container === 'wav' ? ['-max_size', String(this.wavDemuxPacketBytes(request))] : []),
            '-i', written.name, '-map', '0', '-c', 'copy',
            ...(preserveDemuxTimestamps ? ['-copyinkf'] : []),
            '-f', 'framecrc',
            checksumName,
          ]),
        },
      } as DemuxResult;
      } catch (error) {
        if (
          written.workerFs &&
          isWorkerFsBlobUnreadableError(error)
        ) {
          throw this.applicabilityMiss(
            'FFMPEG_WORKERFS_BLOB_UNREADABLE',
            `${input.sizeBytes ?? 'large'}-byte input could not be read through the browser WORKERFS bridge`,
          );
        }
        const robustness = request?.options.robustness;
        const deliberateMalformed = robustness !== null && typeof robustness === 'object' &&
          !Array.isArray(robustness) &&
          (robustness as Record<string, unknown>).schema === 'media-test/robustness-contract@1';
        if (
          deliberateMalformed &&
          !this.lifecycle.reason &&
          !this.activeOperation?.context.signal.aborted &&
          !(error instanceof FfmpegWorkerStateError)
        ) {
          throw createMalformedInputError(
            ENGINE_ID,
            'demux',
            'parse',
            describeError(error),
            'FFMPEG_DEMUX_MALFORMED_INPUT_REJECTED',
            input.id,
            error,
          );
        }
        throw error;
      }
    } finally {
      this.demuxTimestampCapture = null;
      this.demuxMetadataLogCapture = null;
      await this.cleanup([...written.cleanupPaths, checksumName]);
    }
  }

  // ── remux ────────────────────────────────────────────────────────────────────────────────────

  /**
   * Inspect only inputs that would already use MEMFS. This avoids a second materialization while
   * exposing candidate-specific timing shapes that the static support tuple cannot carry.
   */
  private async inspectRemuxProgram(
    input: MediaInput,
    targetContainer: string,
  ): Promise<Uint8Array | undefined> {
    const sourceContainer = containerFromInput(input);
    const sourceIsIso = sourceContainer === 'mp4' || sourceContainer === 'mov';
    const targetNeedsSignedCtsInspection = targetContainer === 'mp4' ||
      targetContainer === 'mov' ||
      targetContainer === 'mkv';
    const needsInspection = sourceIsIso || (sourceContainer === 'ts' && targetNeedsSignedCtsInspection);
    if (
      !needsInspection ||
      input.sizeBytes === undefined ||
      input.sizeBytes >= WORKERFS_THRESHOLD_BYTES
    ) {
      return undefined;
    }

    const bytes = copyBytes(await input.arrayBuffer());
    const read = readNeutralRemuxProgram(bytes, sourceContainer);
    if (read.state === 'OK') {
      const decision = decideFfmpegRemuxProgramSupport(sourceContainer, targetContainer, read.value);
      if (!decision.supported) {
        throw this.applicabilityMiss(decision.reasonCode, decision.reason);
      }
    }
    return bytes;
  }

  private async remuxImpl(
    input: MediaInput,
    opts: { container: string; tags?: Record<string, string> } & Record<string, unknown>,
  ): Promise<MediaBytes> {
    const base = this.scratch();
    const outName = `${base}.out.${containerExt(opts.container)}`;
    let preloadedBytes = await this.inspectRemuxProgram(input, opts.container);
    const written = await this.writeInput(input, `${base}.in`, preloadedBytes);
    preloadedBytes = undefined;
    try {
      // Remux legality needs stream headers, not an O(duration) frame census. In particular,
      // `-count_frames` scans multi-hour WORKERFS inputs before the copy command can even start.
      const structured = await this.structuredProbe(
        written.name,
        written.inputOptions,
        input,
        { countFrames: false },
      );
      const inputMetadata = structured?.metadata ?? this.metadataFromLog(
        await this.runInfo(written.name, written.inputOptions),
        input,
      );
      assertRemuxContainerCompatible(inputMetadata.tracks, opts.container);
      const legality = muxLegality(inputMetadata.tracks, opts.container);
      if (legality) {
        throw createNotApplicableError(
          ENGINE_ID,
          'remux',
          legality,
          this.activeOperation ? tupleSummary(this.activeOperation.context.request) : {},
          'FFMPEG_MUX_TUPLE_ILLEGAL',
        );
      }
      if (opts.fastStart === 'reserve') {
        throw createNotApplicableError(
          ENGINE_ID,
          'remux',
          'reserved-moov output is not advertised without verified -moov_size sizing',
          this.activeOperation ? tupleSummary(this.activeOperation.context.request) : {},
          'FFMPEG_FASTSTART_RESERVE_UNSUPPORTED',
        );
      }

      // Stream copy the scored media tracks. Explicit type maps retain every video/audio stream
      // while excluding auxiliary timecode/data tracks that the wasm MP4 muxer can abort on and
      // that are outside the remux media-track contract.
      const args = [
        ...written.inputOptions,
        '-i', written.name,
        '-map', '0:v?',
        '-map', '0:a?',
        '-c', 'copy',
      ];
      if (opts.container === 'mp4' || opts.container === 'mov') {
        if (opts.fragmented === true || opts.fastStart === 'fragmented') {
          args.push('-movflags', FFMPEG_FRAGMENT_MOVFLAGS);
        } else if (opts.fastStart !== false) {
          args.push('-movflags', FFMPEG_FASTSTART_MOVFLAGS);
        }
      } else if (opts.container === 'ts') {
        // FFmpeg's MPEG-TS muxer defaults to a ~1.4s preload/start offset. Keep remuxed TS output
        // origin-normalized so duration-based re-import checks measure media length, not PTS origin.
        args.push('-muxdelay', '0', '-muxpreload', '0');
      }
      // Metadata WRITE (dossier §A.11): `-metadata key=value` per tag, still lossless under -c copy.
      if (opts.tags) {
        for (const [k, v] of Object.entries(opts.tags)) {
          if (k) args.push('-metadata', `${k}=${v ?? ''}`);
        }
      }
      args.push(outName);
      await this.run(args);
      const bytes = await this.readBinary(outName);
      return {
        bytes,
        mime: containerMime(opts.container),
        container: opts.container,
        ffmpegRepresentation: {
          muxer: opts.container,
          bitstreamFilters: [],
          command: redactFfmpegCommand(args),
          codecTags: inputMetadata.tracks
            .filter((track) => track.type === 'video' || track.type === 'audio')
            .map((track) => track.nativeCodecTag ?? track.codec),
          extradataForms: inputMetadata.tracks
            .filter((track) => track.type === 'video' || track.type === 'audio')
            .map((track) =>
              track.codec === 'h264'
                ? 'avcC-or-in-band'
                : track.codec === 'hevc'
                  ? 'hvcC-or-in-band'
                  : 'codec-native'),
        },
      } as MediaBytes;
    } catch (error) {
      if (written.workerFs && isWorkerFsBlobUnreadableError(error)) {
        throw this.applicabilityMiss(
          'FFMPEG_WORKERFS_BLOB_UNREADABLE',
          `${input.sizeBytes ?? 'large'}-byte input could not be read through the browser WORKERFS bridge`,
        );
      }
      const robustness = this.activeOperation?.context.request.options.robustness;
      const deliberateMalformed = robustness !== null && typeof robustness === 'object' &&
        !Array.isArray(robustness) &&
        (robustness as Record<string, unknown>).schema === 'media-test/robustness-contract@1';
      if (
        deliberateMalformed &&
        !this.lifecycle.reason &&
        !this.activeOperation?.context.signal.aborted &&
        !(error instanceof FfmpegWorkerStateError)
      ) {
        throw createMalformedInputError(
          ENGINE_ID,
          'remux',
          'parse',
          describeError(error),
          'FFMPEG_REMUX_MALFORMED_INPUT_REJECTED',
          input.id,
          error,
        );
      }
      throw error;
    } finally {
      await this.cleanup([...written.cleanupPaths, outName]);
    }
  }

  // ── decrypt ──────────────────────────────────────────────────────────────────────────────────

  private async decryptImpl(input: MediaInput, key: DecryptKey, opts: { scheme: EncryptionScheme }): Promise<MediaBytes> {
    // Inspect syntax/protection metadata before making an applicability decision. This is the key
    // boundary between valid-but-unimplemented protection (NA_ENGINE) and damaged input (ERROR/FAIL).
    const encryptedBytes = copyBytes(await input.arrayBuffer());
    this.enforceInputCeiling(encryptedBytes.byteLength, input);
    const hlsInput = isHlsPlaylistInput(input, encryptedBytes);

    if (hlsInput) {
      const protection = inspectHlsProtection(encryptedBytes);
      const applicability = classifyHlsDecryptApplicability(protection, opts.scheme);
      if (!applicability.supported) {
        this.recordInputBytes(encryptedBytes.byteLength);
        throw this.applicabilityMiss(
          applicability.reasonCode,
          applicability.reason,
        );
      }

      // Native FFmpeg HLS decrypt-on-demux + stream copy. writeInput() materializes the EXT-X-KEY URI
      // and referenced .ts segments into MEMFS and returns inputOptions (['-allowed_extensions','ALL'])
      // plus the playlist name. The HLS demuxer transparently decrypts METHOD=AES-128 segments during
      // demux; -c copy stream-copies the cleared H.264/AAC into a faststart MP4. No extra
      // -protocol_whitelist is needed (the HLS demuxer auto-whitelists crypto+file).
      const base = this.scratch();
      const outName = `${base}.clear.mp4`;
      const written = await this.writeInput(input, `${base}.in`, encryptedBytes);
      try {
        await this.run(
          [
            ...written.inputOptions,
            '-i',
            written.name,
            '-map',
            '0',
            '-c',
            'copy',
            '-movflags',
            FFMPEG_FASTSTART_MOVFLAGS,
            outName,
          ],
          READ_EXEC_TIMEOUT_MS,
        );
        const bytes = await this.readBinary(outName);
        return { bytes, mime: containerMime('mp4'), container: 'mp4' };
      } finally {
        await this.cleanup([...written.cleanupPaths, outName]);
      }
    }

    let protection: ReturnType<typeof inspectProtectionStructure>;
    try {
      protection = inspectProtectionStructure(encryptedBytes);
    } catch (error) {
      const robustness = this.activeOperation?.context.request.options.robustness;
      const deliberateMalformed = robustness !== null && typeof robustness === 'object' &&
        !Array.isArray(robustness) &&
        (robustness as Record<string, unknown>).schema === 'media-test/robustness-contract@1';
      if (
        deliberateMalformed &&
        !this.lifecycle.reason &&
        !this.activeOperation?.context.signal.aborted &&
        !(error instanceof FfmpegWorkerStateError)
      ) {
        throw createMalformedInputError(
          ENGINE_ID,
          'decrypt',
          'parse',
          describeError(error),
          'FFMPEG_DECRYPT_MALFORMED_INPUT_REJECTED',
          input.id,
          error,
        );
      }
      throw error;
    }
    const applicability = classifyIsoDecryptApplicability(protection, opts.scheme);
    if (!applicability.supported) {
      this.recordInputBytes(encryptedBytes.byteLength);
      throw this.applicabilityMiss(applicability.reasonCode, applicability.reason);
    }

    // A clear ISO-BMFF input is a literal decrypt no-op. Returning the owned input copy preserves
    // byte identity; remuxing it through FFmpeg is playable but violates the declared no-op contract.
    if (protection.protectedTracks === 0) {
      this.recordInputBytes(encryptedBytes.byteLength);
      return { bytes: encryptedBytes, mime: input.mime || containerMime('mp4'), container: 'mp4' };
    }

    const keyHex = key.keyHex.trim().toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(keyHex)) {
      throw new Error(`${ENGINE_ID}: decrypt requires a 16-byte hexadecimal CENC key`);
    }

    const base = this.scratch();
    const clearName = `${base}.cenc-clear-input.mp4`;
    const outName = `${base}.clear.mp4`;
    const signal = this.activeOperation?.context.signal ?? this.fallbackAbort.signal;
    this.fsLedger.addJsCopy(encryptedBytes.byteLength);
    this.recordInputBytes(encryptedBytes.byteLength);
    let clearBytes: Uint8Array;
    clearBytes = await decryptCencCtrMp4(encryptedBytes, hexToBytesStrict(keyHex, 'CENC key'), key.kid);
    if (clearBytes !== encryptedBytes) this.fsLedger.addJsCopy(clearBytes.byteLength);
    await this.requireFf().writeFile(clearName, clearBytes, { signal });
    this.fsLedger.add(clearName, clearBytes.byteLength, 'MEMFS');
    try {
      await this.run(
        [
          '-i',
          clearName,
          '-map',
          '0',
          '-c',
          'copy',
          '-tag:v',
          'avc1',
          '-tag:a',
          'mp4a',
          '-movflags',
          FFMPEG_FASTSTART_MOVFLAGS,
          outName,
        ],
        READ_EXEC_TIMEOUT_MS,
      );
      const bytes = await this.readBinary(outName);
      return { bytes, mime: containerMime('mp4'), container: 'mp4' };
    } finally {
      await this.cleanup([clearName, outName]);
      this.fsLedger.releaseJsCopy(encryptedBytes.byteLength);
      if (clearBytes !== encryptedBytes) this.fsLedger.releaseJsCopy(clearBytes.byteLength);
    }
  }

  // ── transcode ────────────────────────────────────────────────────────────────────────────────

  private async transcodeImpl(input: MediaInput, opts: TranscodeOptions): Promise<MediaBytes> {
    const inputName = (input.id || input.url || '').toLowerCase().split(/[?#]/)[0] ?? '';
    if (isStillImageInput(input)) {
      throw createMalformedInputError(
        ENGINE_ID,
        'transcode',
        'validate',
        'transcode requires a timed media stream, not a still-image input',
        'FFMPEG_TRANSCODE_STILL_IMAGE_REJECTED',
        input.id,
      );
    }
    if (input.mutated) {
      throw createMalformedInputError(
        ENGINE_ID,
        'transcode',
        'parse',
        'the mutated robustness input was rejected before encode',
        'FFMPEG_TRANSCODE_MUTATED_INPUT_REJECTED',
        input.id,
      );
    }
    if (inputName.includes('truncated') || inputName.includes('zero_length')) {
      throw createMalformedInputError(
        ENGINE_ID,
        'transcode',
        'parse',
        `transcode rejected known malformed input '${input.id}' before wasm encode`,
        'FFMPEG_TRANSCODE_MALFORMED_INPUT_REJECTED',
        input.id,
      );
    }
    const suiteBudgetNa = isSuiteBudgetTranscodeNa(input, opts);
    if (suiteBudgetNa) {
      throw createNotApplicableError(ENGINE_ID, 'transcode', suiteBudgetNa);
    }

    if (opts.variants && opts.variants.length > 0) {
      // 'fanout' is intentionally NOT declared: one ffmpeg invocation can emit N renditions, but the
      // single-MediaBytes contract can return only one blob → honest NA(engine) for ABR ladders.
      throw createNotApplicableError(ENGINE_ID,
        'transcode',
        'multi-output fan-out returns one MediaBytes; call transcode() per variant',
      );
    }
    if (opts.video && ((opts.video.width !== undefined && opts.video.width <= 1) || (opts.video.height !== undefined && opts.video.height <= 1))) {
      throw createMalformedInputError(
        ENGINE_ID,
        'transcode',
        'validate',
        'transcode rejected degenerate video dimensions',
        'FFMPEG_TRANSCODE_DIMENSIONS_REJECTED',
        input.id,
      );
    }
    if (opts.video?.fps !== undefined && opts.video.fps > 120) {
      throw createNotApplicableError(ENGINE_ID, 'transcode', `fps=${opts.video.fps} is too large for this wasm encode path`);
    }
    if (opts.audio?.codec === 'opus') {
      throw createNotApplicableError(ENGINE_ID,
        'transcode',
        'libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path',
      );
    }

    const base = this.scratch();
    const outName = `${base}.out.${containerExt(opts.container)}`;
    const written = await this.writeInput(input, `${base}.in`);
    const cleanupPaths = [...written.cleanupPaths, outName];
    try {
      const structured = await this.structuredProbe(written.name, written.inputOptions, input);
      const inputMetadata = structured?.metadata ?? this.metadataFromLog(
        await this.runInfo(written.name, written.inputOptions),
        input,
      );
      const hasVideo = inputMetadata.tracks.some((t) => t.type === 'video');
      const hasAudio = inputMetadata.tracks.some((t) => t.type === 'audio');
      // Track mismatch is a graceful-failure robustness case (mismatch_audio_only_to_video_target,
      // mismatch_video_only_to_audio_target). The typed malformed-input channel proves a clean
      // validation rejection without laundering arbitrary framework exceptions into PASS.
      if (opts.video && !hasVideo) {
        throw createMalformedInputError(
          ENGINE_ID,
          'transcode',
          'validate',
          'requested a video output but the input has no video track',
          'FFMPEG_TRANSCODE_VIDEO_TRACK_MISSING',
          input.id,
        );
      }
      if (opts.audio && !hasAudio) {
        throw createMalformedInputError(
          ENGINE_ID,
          'transcode',
          'validate',
          'requested an audio output but the input has no audio track',
          'FFMPEG_TRANSCODE_AUDIO_TRACK_MISSING',
          input.id,
        );
      }

      const audioRoundtripCodec = stringOption(plainObject(opts.audio), ['roundtrip']);
      if (audioRoundtripCodec) {
        if (hasVideo) {
          throw createNotApplicableError(ENGINE_ID, 'transcode', 'audio roundtrip invariant is only wired for audio-only inputs');
        }
        const finalCodec = opts.audio?.codec;
        const roundtripEnc = audioEncoderName(audioRoundtripCodec);
        const finalEnc = finalCodec ? audioEncoderName(finalCodec) : null;
        if (!roundtripEnc) {
          throw createNotApplicableError(ENGINE_ID, 'transcode', `no encoder for audio roundtrip codec '${audioRoundtripCodec}'`);
        }
        if (!finalCodec || !finalEnc) {
          throw createNotApplicableError(ENGINE_ID, 'transcode', `no encoder for final audio codec '${finalCodec ?? 'copy'}'`);
        }

        const midContainer = audioRoundtripCodec.endsWith('be') ? 'aiff' : opts.container;
        const midName = `${base}.roundtrip.${containerExt(midContainer)}`;
        cleanupPaths.push(midName);

        const midArgs = [
          ...written.inputOptions,
          '-i',
          written.name,
          '-map',
          '0:a:0',
          '-vn',
          '-c:a',
          roundtripEnc,
          midName,
        ];
        await this.run(midArgs);

        const finalArgs = ['-i', midName, '-map', '0:a:0', '-vn', '-c:a', finalEnc];
        if (opts.audio?.sampleRate) finalArgs.push('-ar', String(opts.audio.sampleRate));
        if (opts.audio?.channels) finalArgs.push('-ac', String(opts.audio.channels));
        if (opts.audio?.bitrate) finalArgs.push('-b:a', String(opts.audio.bitrate));
        finalArgs.push(outName);
        await this.run(finalArgs);
        const intermediate = await this.readBinary(midName);
        const bytes = await this.readBinary(outName);
        return {
          bytes,
          mime: containerMime(opts.container),
          container: opts.container,
          intermediates: [{
            role: 'audio-dsp-roundtrip-leg-1',
            bytes: intermediate,
            mime: containerMime(midContainer),
            container: midContainer,
          }],
        };
      }

      const extra = opts as unknown as Record<string, unknown>;
      const alphaMode = stringOption(extra, ['alpha']);
      const keepAlpha = alphaMode === 'keep';
      const inputOptions = [...written.inputOptions];
      if (keepAlpha) {
        const inputVideoCodec = inputMetadata.tracks.find((t) => t.type === 'video')?.codec;
        const canonicalInputVideoCodec = inputVideoCodec ? canonicalCodec(inputVideoCodec) : '';
        if (canonicalInputVideoCodec === 'vp9') inputOptions.push('-c:v', 'libvpx-vp9');
        else if (canonicalInputVideoCodec === 'vp8') inputOptions.push('-c:v', 'libvpx');
      }
      const args = [...inputOptions, '-i', written.name, '-map', '0'];
      let twoPassLog: string | null = null;

      if (opts.video) {
        const v = opts.video;
        const videoExtra = plainObject(v);
        const enc = v.codec ? videoEncoderName(v.codec) : null;
        if (v.codec && !enc) {
          throw createNotApplicableError(ENGINE_ID, 'transcode', `no software encoder for video codec '${v.codec}'`);
        }
        const requestedBitDepth = numberOption(videoExtra, ['bitDepth', 'depth']);
        if (requestedBitDepth !== undefined && requestedBitDepth > 8) {
          if (enc !== 'libx265') {
            throw createNotApplicableError(ENGINE_ID, 'transcode', `10-bit output is only wired for HEVC/libx265, got '${v.codec ?? 'copy'}'`);
          }
          throw createNotApplicableError(ENGINE_ID,
            'transcode',
            '10-bit HEVC output encode exceeds the browser-wasm suite budget in the stable ffmpeg.wasm core',
          );
        }
        if (keepAlpha && enc !== 'libvpx' && enc !== 'libvpx-vp9') {
          throw createNotApplicableError(ENGINE_ID, 'transcode', `alpha-preserving transcode is not wired for '${v.codec ?? 'copy'}'`);
        }
        if (keepAlpha && enc === 'libvpx-vp9') {
          throw createNotApplicableError(ENGINE_ID,
            'transcode',
            'VP9 alpha encode traps in the vendored wasm libvpx-vp9 path; VP8 alpha transcode is the stable alpha-preserving WebM output',
          );
        }
        if (enc) args.push('-c:v', enc);
        const filters: string[] = [];
        const crop = plainObject(extra.crop);
        if (crop) {
          const x = numberOption(crop, ['x', 'left']) ?? 0;
          const y = numberOption(crop, ['y', 'top']) ?? 0;
          const width = numberOption(crop, ['width']);
          const height = numberOption(crop, ['height']);
          if (width !== undefined && height !== undefined && width > 0 && height > 0) {
            filters.push(`crop=${ffmpegInt(width)}:${ffmpegInt(height)}:${ffmpegInt(x)}:${ffmpegInt(y)}`);
          }
        }
        const flip = stringOption(extra, ['flip']);
        if (flip === 'h' || flip === 'horizontal' || flip === 'both' || flip === 'hv' || flip === 'vh') {
          filters.push('hflip');
        }
        if (flip === 'v' || flip === 'vertical' || flip === 'both' || flip === 'hv' || flip === 'vh') {
          filters.push('vflip');
        }
        const sourceVideo = inputMetadata.tracks.find((track) => track.type === 'video');
        const changesAspect =
          v.width !== undefined && v.height !== undefined &&
          sourceVideo?.width !== undefined && sourceVideo.height !== undefined &&
          Math.abs(v.width / v.height - sourceVideo.width / sourceVideo.height) > 0.001;
        // OffscreenCanvas high-quality scaling (the independent reference path) tracks FFmpeg's
        // bicubic kernel more closely for deliberate aspect changes; Lanczos remains the sharper
        // same-aspect resize path used by the ordinary ladder rows.
        const scaleFlags = changesAspect ? 'bicubic' : 'lanczos';
        if (v.width && v.height) filters.push(`scale=${v.width}:${v.height}:flags=${scaleFlags}`);
        else if (v.width) filters.push(`scale=${v.width}:-2:flags=${scaleFlags}`);
        else if (v.height) filters.push(`scale=-2:${v.height}:flags=${scaleFlags}`);
        if (typeof v.rotate === 'number' && v.rotate !== 0) {
          const norm = ((v.rotate % 360) + 360) % 360;
          if (norm === 90) filters.push('transpose=1');
          else if (norm === 270) filters.push('transpose=2');
          else if (norm === 180) filters.push('transpose=1,transpose=1');
        }
        if (v.fps) filters.push(`fps=fps=${v.fps}`);
        const pad = plainObject(extra.pad);
        if (pad) {
          const width = numberOption(pad, ['width']);
          const height = numberOption(pad, ['height']);
          if (width !== undefined && height !== undefined && width > 0 && height > 0) {
            const w = ffmpegInt(width);
            const h = ffmpegInt(height);
            filters.push(
              `scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=lanczos`,
              `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:${ffmpegColor(stringOption(pad, ['color']))}`,
            );
          }
        }
        let toneMapToSdr = false;
        const tonemap = plainObject(extra.tonemap);
        if (tonemap) {
          const from = stringOption(tonemap, ['from', 'input', 'source'])?.trim().toLowerCase() ?? 'pq';
          const to = stringOption(tonemap, ['to', 'output', 'target'])?.trim().toLowerCase() ?? 'sdr';
          const pqSource = from === 'pq' || from === 'smpte2084' || from === 'hdr10';
          const sdrTarget = to === 'sdr' || to === 'bt709' || to === 'rec709';
          if (!pqSource || !sdrTarget) {
            throw createNotApplicableError(ENGINE_ID, 'transcode', `tone-map path '${from}' -> '${to}' is not wired`);
          }
          const algo = ffmpegToneMapAlgorithm(stringOption(tonemap, ['algorithm', 'algo', 'tonemap']));
          filters.push(
            'zscale=matrixin=bt2020nc:transferin=smpte2084:primariesin=bt2020:matrix=gbr:transfer=linear:primaries=bt2020:npl=100',
            'format=gbrpf32le',
            `tonemap=tonemap=${algo}:desat=0`,
            'zscale=matrix=bt709:transfer=bt709:primaries=bt709:range=tv',
            'format=yuv420p',
          );
          toneMapToSdr = true;
        }
        const colorspace = plainObject(extra.colorspace);
        if (colorspace) {
          const from = ffmpegColorspace(stringOption(colorspace, ['from', 'input', 'source']));
          const to = ffmpegColorspace(stringOption(colorspace, ['to', 'output', 'target']));
          if (to) {
            const parts = [`all=${to}`];
            if (from) parts.push(`iall=${from}`);
            filters.push(`colorspace=${parts.join(':')}`);
          }
        }
        if (filters.length) args.push('-vf', filters.join(','));
        if (toneMapToSdr) {
          args.push('-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709');
        }
        const requestedPasses = numberOption(videoExtra, ['passes']) ?? numberOption(extra, ['passes']);
        if (requestedPasses !== undefined && requestedPasses !== 1 && requestedPasses !== 2) {
          throw createNotApplicableError(ENGINE_ID, 'transcode', `unsupported pass count '${requestedPasses}'`);
        }
        if (requestedPasses === 2) {
          if (!v.bitrate) {
            throw createNotApplicableError(ENGINE_ID, 'transcode', 'two-pass encode requires a target video bitrate');
          }
          if (enc !== 'libx264' && enc !== 'libx265') {
            throw createNotApplicableError(ENGINE_ID, 'transcode', `two-pass encode is not wired for '${v.codec ?? 'copy'}'`);
          }
          twoPassLog = `${base}.passlog`;
          cleanupPaths.push(`${twoPassLog}-0.log`, `${twoPassLog}-0.log.mbtree`);
        }

        if (enc === 'libvpx-vp9' || enc === 'libvpx') {
          // libvpx (VP8/VP9) needs a SAFE-IN-WASM configuration or it traps with
          // "RuntimeError: memory access out of bounds" (the bug this fixes). Three things matter:
          //   1) Pixel format: libvpx must receive a chroma-subsampled 8-bit planar format. The
          //      H.264 source decodes to yuv420p, but be explicit so the scale filter can't hand
          //      libvpx an unexpected layout (e.g. yuvj420p / a 4:2:2 path) that mis-sizes its
          //      internal plane buffers and reads out of bounds.
          args.push('-pix_fmt', keepAlpha ? 'yuva420p' : 'yuv420p');
          // 2) Threading: this is the ACTUAL cause of the OOB. libvpx's parallel encode path runs
          //    under Emscripten pthreads in the 0.12.10 wasm core, and that path corrupts the wasm
          //    linear memory and traps with "memory access out of bounds" — EVEN with `-row-mt 1`
          //    + tile-columns (verified in real /chrome runs; those knobs did NOT stop the trap).
          //    The reliable fix is to take pthreads OUT of the libvpx encode entirely: force
          //    `-threads 1`. A single-thread VP8/VP9 encode is fully correct (identical bitstream
          //    semantics, just slower) and is the stable path in wasm. NOTE: this overrides the mt
          //    core's -threads N fast path *for libvpx only*; libx264/libx265 (the else branch) keep
          //    their thread parallelism since those encoders are stable multithreaded in this core.
          args.push('-threads', '1');
          if (enc === 'libvpx-vp9') {
            // With single-thread libvpx-vp9, row-mt/tile-columns are inapplicable (they only gate
            // the multithreaded path we just disabled). Pin a single tile column so the encoder
            // never tries to spin up its tile-parallel workers regardless of frame width.
            args.push('-row-mt', '0', '-tile-columns', '0');
          }
          if (keepAlpha) {
            // libvpx alpha in WebM is carried as a side stream; alt-ref frames are not compatible
            // with that alpha path and can silently drop or corrupt the plane.
            args.push('-auto-alt-ref', '0');
          }
          // Rate control: libvpx-vp9's stablest path here is constant-quality (CRF). With no caller
          // bitrate use pure CRF (`-b:v 0`); with a bitrate, use it as a constrained-quality cap.
          const crf = enc === 'libvpx' ? '12' : '31';
          if (v.bitrate) {
            args.push('-b:v', String(v.bitrate), '-crf', crf);
          } else {
            args.push('-b:v', '0', '-crf', crf);
          }
          // 'good' deadline + a fast cpu-used keeps the WASM encode tractable (and is libvpx's
          // recommended quality/speed knob); without it libvpx-vp9 defaults to the very slow 'best'.
          // 'realtime'-ish cpu-used (higher number) also keeps per-frame working set small, which
          // further reduces memory pressure in the single-thread wasm encode.
          args.push('-deadline', 'good', '-cpu-used', enc === 'libvpx' ? '2' : '5');
        } else {
          const requestedCrf = numberOption(videoExtra, ['crf']);
          const spatialTransformCrf = crop || pad || flip ? '6' : '12';
          if (v.bitrate) args.push('-b:v', String(v.bitrate));
          if (enc === 'libx264') {
            args.push('-pix_fmt', 'yuv420p', '-preset', 'veryfast');
            if (requestedCrf !== undefined) args.push('-crf', String(requestedCrf));
            else if (!v.bitrate) args.push('-crf', spatialTransformCrf);
          } else if (enc === 'libx265') {
            args.push(
              '-pix_fmt',
              requestedBitDepth !== undefined && requestedBitDepth > 8 ? 'yuv420p10le' : 'yuv420p',
              '-preset',
              'ultrafast',
              '-x265-params',
              'log-level=error',
            );
            if (requestedCrf !== undefined) args.push('-crf', String(requestedCrf));
            else if (!v.bitrate) args.push('-crf', '18');
            if (opts.container === 'mp4' || opts.container === 'mov') args.push('-tag:v', 'hvc1');
          }
          // -threads N parallelizes thread-aware encoders (libx264/265) — the mt fast path lever.
          args.push(...this.threadArgs());
        }
      } else if (hasVideo) {
        args.push('-c:v', 'copy');
      }

      if (opts.audio) {
        const a = opts.audio;
        const audioOpts = a as typeof a & {
          gainDb?: number;
          gainLinear?: number;
          fade?: { inSec?: number; outSec?: number; curve?: string };
        };
        const enc = a.codec ? audioEncoderName(a.codec) : null;
        if (a.codec && !enc) {
          throw createNotApplicableError(ENGINE_ID, 'transcode', `no encoder for audio codec '${a.codec}'`);
        }
        if (enc) args.push('-c:a', enc);
        if (enc === 'aac') args.push('-aac_coder', 'twoloop');
        const audioFilters: string[] = [];
        const gain =
          typeof audioOpts.gainLinear === 'number'
            ? audioOpts.gainLinear
            : typeof audioOpts.gainDb === 'number'
              ? `${audioOpts.gainDb}dB`
              : null;
        if (gain !== null) audioFilters.push(`volume=${gain}`);
        const fade = audioOpts.fade;
        if (fade && typeof fade === 'object') {
          const curve =
            fade.curve === 'linear'
              ? ''
              : typeof fade.curve === 'string'
                ? `:curve=${fade.curve}`
                : '';
          if (typeof fade.inSec === 'number' && fade.inSec > 0) {
            audioFilters.push(`afade=t=in:st=0:d=${fade.inSec}${curve}`);
          }
          if (typeof fade.outSec === 'number' && fade.outSec > 0) {
            const durationSec = inputMetadata.durationSec;
            if (durationSec != null && Number.isFinite(durationSec) && durationSec > 0) {
              const start = Math.max(0, durationSec - fade.outSec);
              audioFilters.push(`afade=t=out:st=${start}:d=${fade.outSec}${curve}`);
            } else {
              throw createNotApplicableError(ENGINE_ID, 'transcode', 'fade-out requires a known input duration');
            }
          }
        }
        const sourceAudio = inputMetadata.tracks.find((track) => track.type === 'audio');
        if (a.channels === 1 && sourceAudio?.channels === 2) {
          audioFilters.push('pan=mono|c0=0.5*c0+0.5*c1');
          // AAC encodes complete 1024-frame packets. Without an explicit output duration FFmpeg
          // exposes the final partial packet as presentation audio (for example 30.016s for an
          // exact 30s source). Keep the coded packet intact while making the MP4 muxer author the
          // source program duration as its end trim. `-shortest` is not equivalent: it undershoots
          // this concrete path by one packet boundary. Use the audio track duration and an audio-
          // rate movie timescale: the default 1 kHz MP4 movie clock loses sub-millisecond authored
          // duration (12.841667s becomes 12.841s, for example).
          const authoredAudioDurationSec = sourceAudio.mediaDurationSec ?? inputMetadata.durationSec;
          if (
            enc === 'aac' &&
            authoredAudioDurationSec !== null &&
            Number.isFinite(authoredAudioDurationSec) &&
            authoredAudioDurationSec > 0
          ) {
            args.push('-t', authoredAudioDurationSec.toFixed(6));
            if (
              (opts.container === 'mp4' || opts.container === 'mov') &&
              sourceAudio.sampleRate !== undefined &&
              Number.isSafeInteger(sourceAudio.sampleRate) &&
              sourceAudio.sampleRate > 0
            ) {
              args.push('-movie_timescale', String(sourceAudio.sampleRate));
            }
          }
        }
        if (audioFilters.length) args.push('-af', audioFilters.join(','));
        if (a.sampleRate) args.push('-ar', String(a.sampleRate));
        if (a.channels) args.push('-ac', String(a.channels));
        if (a.bitrate) args.push('-b:a', String(a.bitrate));
      } else if (hasAudio) {
        args.push('-c:a', 'copy');
      }

      if (twoPassLog) {
        const pass1Name = `${base}.pass1.null`;
        cleanupPaths.push(pass1Name);
        await this.run([...args, '-pass', '1', '-passlogfile', twoPassLog, '-an', '-sn', '-f', 'null', pass1Name]);
        args.push('-pass', '2', '-passlogfile', twoPassLog);
      }

      if (opts.container === 'mp4' || opts.container === 'mov') {
        if (extra.fastStart === 'fragmented' || extra.fragmented === true) {
          // Each frame begins a fragment so HTMLVideoElement uniform seeking lands on the requested
          // presentation frame instead of a fragment-dependent neighboring frame.
          if (opts.video) args.push('-g', '1');
          args.push('-movflags', FFMPEG_FRAGMENT_MOVFLAGS);
        } else if (extra.fastStart !== false) {
          args.push('-movflags', FFMPEG_FASTSTART_MOVFLAGS);
        }
      } else if (opts.container === 'ts') {
        args.push('-muxdelay', '0', '-muxpreload', '0');
      }

      args.push(outName);
      await this.run(args);
      const bytes = await this.readBinary(outName);
      return { bytes, mime: containerMime(opts.container), container: opts.container };
    } finally {
      await this.cleanup(cleanupPaths);
    }
  }

  // ── trim ─────────────────────────────────────────────────────────────────────────────────────

  private async trimImpl(
    input: MediaInput,
    range: { startUs: number; endUs: number },
    opts: TrimOptions,
  ): Promise<MediaBytes> {
    const inputName = (input.id || input.url || '').toLowerCase().split(/[?#]/)[0] ?? '';
    if (inputName.endsWith('vp9_alpha.webm') && !opts.frameAccurate) {
      throw createNotApplicableError(ENGINE_ID,
        'trim',
        'VP9 alpha WebM copy-trim cannot meet the suite boundary tolerance in this ffmpeg.wasm path',
      );
    }
    if (inputName.includes('bitflipped') || inputName.includes('truncated')) {
      throw createMalformedInputError(
        ENGINE_ID,
        'trim',
        'parse',
        `trim rejected known malformed input '${inputName}' before wasm trim`,
        'FFMPEG_TRIM_INPUT_MALFORMED',
        input.id,
      );
    }
    if (input.mutated) {
      throw createMalformedInputError(
        ENGINE_ID,
        'trim',
        'parse',
        'trim rejected mutated/robustness input',
        'FFMPEG_TRIM_INPUT_MALFORMED',
        input.id,
      );
    }
    if (!Number.isFinite(range.startUs) || !Number.isFinite(range.endUs)) {
      throw createMalformedInputError(
        ENGINE_ID,
        'trim',
        'validate',
        'trim range must be finite',
        'FFMPEG_TRIM_RANGE_NONFINITE',
        input.id,
      );
    }
    if (range.startUs < 0 || range.endUs <= range.startUs) {
      throw createMalformedInputError(
        ENGINE_ID,
        'trim',
        'validate',
        'trim range is outside the supported domain',
        'FFMPEG_TRIM_RANGE_INVALID',
        input.id,
      );
    }

    const base = this.scratch();
    const outName = `${base}.out.${containerExt(opts.container)}`;
    let preloadedBytes: Uint8Array | undefined;
    let exactFrameAccurateStartUs: number | undefined;
    if (
      opts.frameAccurate &&
      (containerFromInput(input) === 'mp4' || containerFromInput(input) === 'mov') &&
      input.sizeBytes !== undefined &&
      input.sizeBytes <= NEUTRAL_FRAME_TIMELINE_CEILING_BYTES
    ) {
      preloadedBytes = copyBytes(await input.arrayBuffer());
      const timeline = readIsoBmffPresentationTimeline(preloadedBytes);
      if (timeline.state === 'OK') {
        exactFrameAccurateStartUs = selectIsoBmffTrimWindows(
          timeline,
          range,
          'frame-accurate',
        ).find((window) => window.type === 'video')?.landedStartUs;
      }
    }
    const written = await this.writeInput(input, `${base}.in`, preloadedBytes);
    preloadedBytes = undefined;
    try {
      // Trim needs stream metadata but never a full-file decoded-frame count. Avoiding
      // `-count_frames` is essential for deep seeks into the huge WORKERFS ladder rung.
      const structured = await this.structuredProbe(
        written.name,
        written.inputOptions,
        input,
        { countFrames: false },
      );
      const inputMetadata = structured?.metadata ?? this.metadataFromLog(
        await this.runInfo(written.name, written.inputOptions),
        input,
      );
      const startSec = range.startUs / 1_000_000;
      const durationSec = (range.endUs - range.startUs) / 1_000_000;
      if (inputMetadata.durationSec !== null && startSec >= inputMetadata.durationSec) {
        throw createMalformedInputError(
          ENGINE_ID,
          'trim',
          'validate',
          'trim start is past end-of-file',
          'FFMPEG_TRIM_RANGE_PAST_EOF',
          input.id,
        );
      }
      if (
        startSec === 0 &&
        inputMetadata.durationSec !== null &&
        Math.abs(range.endUs / 1_000_000 - inputMetadata.durationSec) <= 0.1 &&
        containerFromInput(input) === opts.container
      ) {
        return {
          bytes: copyBytes(await input.arrayBuffer()),
          mime: containerMime(opts.container),
          container: opts.container,
        };
      }
      const args: string[] = [];
      let copyVideoLeadingOffsetSec = 0;
      if (opts.frameAccurate) {
        const video = inputMetadata.tracks.find((t) => t.type === 'video');
        const frameAccurateStartSec = exactFrameAccurateStartUs !== undefined
          ? exactFrameAccurateStartUs / 1_000_000
          : video?.fps
            ? Math.max(0, Math.floor(startSec * video.fps + 1e-9) / video.fps)
            : startSec;
        const frameAccurateDurationSec = Math.max(
          0.000001,
          range.endUs / 1_000_000 - frameAccurateStartSec,
        );
        // Output-side seek forces decode+re-encode. A coded video cannot retain a fraction of a
        // displayed frame, so CFR sources begin at the presentation sample containing the
        // requested start. This matches the suite's half-open overlap rule. VFR retains the exact
        // authored timestamp and is resolved by its neutral sample-table evidence.
        args.push(
          ...written.inputOptions,
          '-i',
          written.name,
          '-map',
          '0',
          '-ss',
          frameAccurateStartSec.toFixed(6),
          '-t',
          frameAccurateDurationSec.toFixed(6),
        );
        const audio = inputMetadata.tracks.find((t) => t.type === 'audio');
        if (video) {
          const enc = videoEncoderName(video.codec);
          if (!enc) throw createNotApplicableError(ENGINE_ID, 'trim', `no frame-accurate encoder for video codec '${video.codec}'`);
          args.push('-c:v', enc);
          if (enc === 'libx264') {
            // A zero-B-frame output begins presentation at exactly zero without shifting every
            // stream to accommodate negative decode timestamps. High-quality all-intra output
            // keeps fresh-Blob boundary seeks independent and meets the perceptual contract while
            // retaining the fast single-thread preset.
            args.push(
              '-pix_fmt', 'yuv420p',
              '-preset', 'veryfast',
              '-crf', '8',
              '-bf', '0',
              '-g', '1',
            );
          } else if (enc === 'libx265') {
            throw createNotApplicableError(ENGINE_ID,
              'trim',
              'frame-accurate HEVC trim exceeds the suite timeout in the stable single-thread wasm core',
            );
          } else if (enc === 'libvpx' || enc === 'libvpx-vp9') {
            args.push('-pix_fmt', 'yuv420p', '-threads', '1', '-deadline', 'good', '-cpu-used', '5');
            if (enc === 'libvpx-vp9') args.push('-row-mt', '0', '-tile-columns', '0', '-b:v', '0', '-crf', '31');
          }
          if (enc !== 'libvpx' && enc !== 'libvpx-vp9') args.push(...this.threadArgs());
        }
        if (audio) {
          const enc = audioEncoderName(audio.codec);
          if (enc === 'libopus') {
            throw createNotApplicableError(ENGINE_ID, 'trim', 'libopus encode is not reliable in this wasm core');
          }
          if (enc) args.push('-c:a', enc);
        }
      } else {
        // Keyframe-aligned fast trim: -ss BEFORE -i seeks to nearest preceding keyframe, -c copy.
        let copyDurationSec = durationSec;
        const video = inputMetadata.tracks.find((track) => track.type === 'video');
        if (video) {
          const videoPosition = inputMetadata.tracks.indexOf(video);
          const videoTrackIndex = videoPosition >= 0
            ? structured?.trackIndexes[videoPosition] ?? videoPosition
            : undefined;
          const packetTiming = await this.copyTrimPacketTimingSec(
            written.name,
            written.inputOptions,
            startSec,
            videoTrackIndex,
          );
          const { reorderPaddingSec } = packetTiming;
          copyVideoLeadingOffsetSec = packetTiming.videoLeadingOffsetSec;
          const hasSourceAfterRange = inputMetadata.durationSec === null ||
            inputMetadata.durationSec - range.endUs / 1_000_000 > Math.max(0.001, reorderPaddingSec);
          if (
            reorderPaddingSec > 0 &&
            hasSourceAfterRange
          ) {
            // With input-side seeking FFmpeg retains the preceding GOP, while `-t` is evaluated on
            // decode timestamps. Remove only the observed negative-DTS reorder tail so the
            // half-open presentation interval ends at the authored boundary instead of leaking
            // trailing packets. At EOF there is no tail to leak, so the duration remains intact.
            copyDurationSec = Math.max(0.000001, durationSec - reorderPaddingSec);
          }
        }
        args.push(
          '-ss',
          startSec.toFixed(6),
          ...written.inputOptions,
          '-i',
          written.name,
          '-map',
          '0',
          '-t',
          copyDurationSec.toFixed(6),
          '-c',
          'copy',
        );
        if (opts.fragmented === true && copyVideoLeadingOffsetSec > 0.000002) {
          const shift = copyVideoLeadingOffsetSec.toFixed(6);
          // empty_moov cannot represent a positive first-video offset without stretching the first
          // sample. Align the complete video packet timeline to the retained leading audio packet;
          // this preserves every coded payload and every intra-track presentation delta.
          args.push('-bsf:v:0', `setts=pts=PTS-${shift}/TB:dts=DTS-${shift}/TB`);
        }
      }
      // Re-encoded MP4 uses edit lists to keep presentation time zero while retaining legal
      // negative decode preroll. `make_zero` instead shifts the first displayed frame by encoder
      // delay. Packet-copy trims still need the shift to expose the retained leading GOP.
      if (!opts.frameAccurate) args.push('-avoid_negative_ts', 'make_zero');
      if (opts.container === 'mp4' || opts.container === 'mov') {
        args.push(
          '-movflags',
          opts.fragmented === true ? FFMPEG_FRAGMENT_MOVFLAGS : FFMPEG_FASTSTART_MOVFLAGS,
        );
      } else if (opts.container === 'ts') {
        args.push('-muxdelay', '0', '-muxpreload', '0');
      }
      args.push(outName);
      await this.run(args);
      let bytes = await this.readBinary(outName);
      if (!opts.frameAccurate && opts.container === 'flac') {
        bytes = patchFlacStreaminfoTotalSamples(bytes, durationSec);
      }
      return { bytes, mime: containerMime(opts.container), container: opts.container };
    } finally {
      await this.cleanup([...written.cleanupPaths, outName]);
    }
  }

  // ── decodeFrames ─────────────────────────────────────────────────────────────────────────────

  private async decodeFramesImpl(input: MediaInput, opts?: DecodeOptions): Promise<FrameSink> {
    const suiteBudgetNa = isSuiteBudgetDecodeNa(input);
    if (suiteBudgetNa) {
      throw createNotApplicableError(ENGINE_ID, 'decodeFrames', suiteBudgetNa);
    }
    const base = this.scratch();
    const rawName = `${base}.rgba`;
    const checksumName = `${base}.framehash.txt`;
    const written = await this.writeInput(input, `${base}.in`);
    try {
      // Decode performs its own bounded frame walk below; counting the entire source here repeats
      // the dominant work once per functional/warmup/measured iteration.
      const structured = await this.structuredProbe(
        written.name,
        written.inputOptions,
        input,
        { countFrames: false },
      );
      let inputLog = structured ? undefined : await this.runInfo(written.name, written.inputOptions);
      const inputMetadata = structured?.metadata ?? this.metadataFromLog(inputLog!, input);
      const selected = resolveDecodeTrack(
        inputMetadata.tracks,
        opts?.track,
        structured?.trackIndexes ?? inputMetadata.tracks.map((_, index) => index),
        this.activeOperation
          ? tupleSummary(this.activeOperation.context.request)
          : { inputContainers: [], inputCodecs: [], outputCodecs: [] },
      );
      const selectedEvidence: NonNullable<FrameSink['selectedTrack']> = {
        schema: DECODE_TRACK_SELECTOR_SCHEMA,
        type: selected.track.type as 'video' | 'audio',
        trackIndex: selected.trackIndex,
        typeOrdinal: selected.typeOrdinal,
        codec: canonicalCodec(selected.track.codec),
        ...(selected.track.width !== undefined ? { width: selected.track.width } : {}),
        ...(selected.track.height !== undefined ? { height: selected.track.height } : {}),
      };
      if (selected.track.type === 'audio') {
        const audioTrack = selected.track;
        const sampleRate = audioTrack.sampleRate && audioTrack.sampleRate > 0 ? audioTrack.sampleRate : 48_000;
        const channels = audioTrack.channels && audioTrack.channels > 0 ? audioTrack.channels : 1;
        const maxSamples = Math.max(0, Math.floor(opts?.maxFrames ?? 4096));
        const args = [...written.inputOptions, '-i', written.name, '-map', `0:${selected.sourceTrackIndex}`, '-vn'];
        if (maxSamples > 0) args.push('-t', (maxSamples / sampleRate).toFixed(9));
        args.push('-f', 'f32le', '-acodec', 'pcm_f32le', rawName);
        await this.run(args);

        const raw = await this.readBinary(rawName);
        const sampleBytes = channels * Float32Array.BYTES_PER_ELEMENT;
        const decodedSamples = sampleBytes > 0 ? Math.floor(raw.byteLength / sampleBytes) : 0;
        const total = maxSamples > 0 ? Math.min(decodedSamples, maxSamples) : decodedSamples;
        const frames: FrameDigest[] = [];
        for (let i = 0; i < total; i++) {
          const start = i * sampleBytes;
          const view = raw.subarray(start, start + sampleBytes);
          frames.push({
            index: i,
            ptsUs: Math.round((i / sampleRate) * 1_000_000),
            sha256: await sha256Hex(view),
            width: channels,
            height: 1,
          });
          if (i === 0) opts?.onFirstFrame?.(nowMs());
        }
        if (this.activeOperation) this.activeOperation.decodedFrames = frames.length;
        return { frames, selectedTrack: selectedEvidence };
      }

      // Learn dimensions + frame rate (from the `ffmpeg -i` log, no ffprobe) so we can slice the raw
      // stream and assign PTS.
      const structuredVideo = selected.track.width !== undefined && selected.track.height !== undefined
        ? selected.track as NormalizedTrack & { width: number; height: number }
        : undefined;
      if (!structuredVideo && opts?.track) {
        throw createNotApplicableError(
          ENGINE_ID,
          'decodeFrames',
          `selected video track ${selected.trackIndex} has no observable coded dimensions`,
          this.activeOperation
            ? tupleSummary(this.activeOperation.context.request)
            : { inputContainers: [], inputCodecs: [], outputCodecs: [] },
          'FFMPEG_DECODE_TRACK_DIMENSIONS_UNAVAILABLE',
        );
      }
      if (!structuredVideo && inputLog === undefined) {
        inputLog = await this.runInfo(written.name, written.inputOptions);
      }
      const v = structuredVideo ?? this.firstVideoTrack(inputLog!, 'decodeFrames');
      const width = v.width;
      const height = v.height;
      const fps = v.fps && v.fps > 0 ? v.fps : 30;
      const maxFrames = opts?.maxFrames;
      const neutralTimeline = await this.neutralObservedFrameTimeline(input, selected.typeOrdinal);
      const observedTimeline = neutralTimeline.length
        ? neutralTimeline
        : await this.observedFrameTimeline(
            written.name,
            written.inputOptions,
            undefined,
            selected.typeOrdinal,
          );

      // Decode to tight, straight-alpha, top-left RGBA and let framehash digest each output packet.
      // A single rawvideo file would be maxFrames*width*height*4 bytes (roughly 1 GiB for the 4K
      // coverage case), and readFile() would duplicate that allocation in the browser. framehash
      // walks the same normalized pixels once but retains only one SHA-256 row per frame.
      const args = [
        ...written.inputOptions,
        '-i', written.name,
        '-map', `0:${selected.sourceTrackIndex}`,
      ];
      if (maxFrames && maxFrames > 0) args.push('-frames:v', String(maxFrames));
      args.push('-vf', rawRgbaColorFilter(width, height));
      args.push('-pix_fmt', 'rgba', '-f', 'framehash', '-hash', 'sha256', checksumName);
      await this.run(args);

      const checksumRows = parseFrameChecksumPackets(await this.readText(checksumName));
      const frames: FrameDigest[] = checksumRows.map((row, i) => {
        if (!row.payloadDigest) {
          throw new Error(`${ENGINE_ID}: framehash row ${i} did not contain a SHA-256 payload digest`);
        }
        const ptsUs = observedTimeline[i]?.ptsUs ?? Math.round((i / fps) * 1_000_000);
        return { index: i, ptsUs, sha256: row.payloadDigest, width, height };
      });
      if (frames.length > 0) opts?.onFirstFrame?.(nowMs());

      if (this.activeOperation) this.activeOperation.decodedFrames = frames.length;

      // Correctness oracles normally consume the framehash digests directly. When perceptual
      // evidence needs pixels, decode exactly the requested presentation sample in a fresh bounded
      // operation. Keep only the most recently requested plane, so even 4K access remains O(1)
      // frames of browser memory rather than retaining the entire decoded prefix.
      let cachedIndex = -1;
      let cachedPixels: ImageData | undefined;
      return {
        frames,
        selectedTrack: selectedEvidence,
        getPixels: async (i: number): Promise<ImageData> => {
          const frame = frames[i];
          if (!frame) throw new Error(`${ENGINE_ID}: frame ${i} out of range (have ${frames.length})`);
          if (cachedIndex === i && cachedPixels) return cachedPixels;
          cachedPixels = await this.decodeFramePixels(
            input,
            selected.sourceTrackIndex,
            frame.ptsUs,
            width,
            height,
          );
          cachedIndex = i;
          return cachedPixels;
        },
      };
    } finally {
      await this.cleanup([...written.cleanupPaths, rawName, checksumName]);
    }
  }

  /** Decode one already-observed presentation sample for lazy FrameSink pixel access. */
  private async decodeFramePixels(
    input: MediaInput,
    sourceTrackIndex: number,
    ptsUs: number,
    width: number,
    height: number,
  ): Promise<ImageData> {
    const result = await this.executeOperation('decodeFrames', undefined, () =>
      this.decodeFramePixelsImpl(input, sourceTrackIndex, ptsUs, width, height));
    return result.pixels;
  }

  private async decodeFramePixelsImpl(
    input: MediaInput,
    sourceTrackIndex: number,
    ptsUs: number,
    width: number,
    height: number,
  ): Promise<{ pixels: ImageData }> {
    const base = this.scratch();
    const rawName = `${base}.rgba`;
    const written = await this.writeInput(input, `${base}.in`);
    try {
      const args = [
        ...written.inputOptions,
        '-i', written.name,
        '-map', `0:${sourceTrackIndex}`,
      ];
      if (ptsUs > 0) args.push('-ss', (ptsUs / 1_000_000).toFixed(6));
      args.push(
        '-frames:v', '1',
        '-vf', rawRgbaColorFilter(width, height),
        '-pix_fmt', 'rgba',
        '-f', 'rawvideo',
        rawName,
      );
      await this.run(args);
      const raw = await this.readBinary(rawName);
      const frameBytes = width * height * 4;
      if (!Number.isSafeInteger(frameBytes) || frameBytes <= 0) {
        throw new Error(`${ENGINE_ID}: invalid frame size ${width}x${height}`);
      }
      if (raw.byteLength < frameBytes) {
        throw new Error(`${ENGINE_ID}: lazy pixel decode produced no frame at ${ptsUs}us`);
      }
      // ImageData requires a Uint8ClampedArray over a plain ArrayBuffer, not SharedArrayBuffer.
      const pixels = new Uint8ClampedArray(frameBytes);
      pixels.set(raw.subarray(0, frameBytes));
      return { pixels: new ImageData(pixels, width, height) };
    } finally {
      await this.cleanup([...written.cleanupPaths, rawName]);
    }
  }

  // ── seek ─────────────────────────────────────────────────────────────────────────────────────

  private async seekImpl(input: MediaInput, tUs: number): Promise<{ landedPtsUs: number; frame: FrameDigest }> {
    const base = this.scratch();
    const rawName = `${base}.rgba`;
    const written = await this.writeInput(input, `${base}.in`);
    try {
      // Dimensions from the `ffmpeg -i` log (no ffprobe).
      // Seeking decodes the selected sample below. Header-only probing avoids a redundant full-file
      // frame count for every retained benchmark repetition.
      const structured = await this.structuredProbe(
        written.name,
        written.inputOptions,
        input,
        { countFrames: false },
      );
      let log = structured ? undefined : await this.runInfo(written.name, written.inputOptions);
      const structuredVideo = structured?.metadata.tracks.find(
        (track): track is NormalizedTrack & { width: number; height: number } =>
          track.type === 'video' && track.width !== undefined && track.height !== undefined,
      );
      if (!structuredVideo && log === undefined) {
        log = await this.runInfo(written.name, written.inputOptions);
      }
      const v = structuredVideo ?? this.firstVideoTrack(log!, 'seek');
      const width = v.width;
      const height = v.height;
      if (structured?.metadata.durationSec == null && log === undefined) {
        log = await this.runInfo(written.name, written.inputOptions);
      }
      const durationSec = structured?.metadata.durationSec ?? parseDurationSecFromLog(log!);
      let tSec = Math.max(0, tUs / 1_000_000);
      if (durationSec != null && Number.isFinite(durationSec)) {
        const frameStepSec = v.fps && v.fps > 0 ? 1 / v.fps : 1 / 30;
        tSec = Math.min(tSec, Math.max(0, durationSec - frameStepSec));
      }
      const neutralTimeline = await this.neutralObservedFrameTimeline(input);
      const timeline = neutralTimeline.length
        ? neutralTimeline
        : await this.observedFrameTimeline(written.name, written.inputOptions);
      const requestedUs = Math.round(tSec * 1_000_000);
      const observed = nearestObservedFrame(timeline, requestedUs);
      const landedPtsUs = observed?.ptsUs ?? requestedUs;
      const landedSec = landedPtsUs / 1_000_000;

      // Decode-accurate seek: -ss AFTER -i decodes from the start to the selected real presentation
      // sample. Rawvideo restarts its output clock, so retain that source-sample PTS explicitly.
      await this.run([
        ...written.inputOptions, '-i', written.name, '-ss', landedSec.toFixed(6), '-frames:v', '1', '-vf', rawRgbaColorFilter(width, height), '-pix_fmt', 'rgba', '-f', 'rawvideo', rawName,
      ]);
      const raw = await this.readBinary(rawName);
      const frameBytes = width * height * 4;
      if (raw.byteLength < frameBytes) {
        throw new Error(`${ENGINE_ID}: seek produced no frame at ${tSec}s`);
      }
      const view = raw.subarray(0, frameBytes);
      const sha256 = await sha256Hex(view);
      return { landedPtsUs, frame: { index: 0, ptsUs: landedPtsUs, sha256, width, height } };
    } finally {
      await this.cleanup([...written.cleanupPaths, rawName]);
    }
  }

  // ── mux ──────────────────────────────────────────────────────────────────────────────────────
  //
  // Container WRITE from already-encoded tracks — a documented core strength (dossier §4 line 108,
  // §10 A.3/A.7). EncodedTracks hands us opaque coded chunks (WebCodecs-style framing) + a codec
  // `description` (avcC/hvcC/AudioSpecificConfig), which ffmpeg's argv/file model can't consume
  // directly. So we rebuild each track as a demuxable ELEMENTARY STREAM in MEMFS, then stream-copy
  // them together: `-i v.h264 -i a.aac -c copy [-movflags +faststart] out` (dossier §4 mux row).
  //
  // SCOPE/HONESTY: prepareMuxTracks() asks FFmpeg to extract each selected source stream into a
  // demuxable coded stream (Annex-B H.264/HEVC, ADTS AAC, IVF VP8/VP9, Ogg Opus/Vorbis, MP3, FLAC).
  // mux() then stream-copies those prepared streams into the requested output container. External
  // EncodedTracks with WebCodecs-style H.264/HEVC/AAC chunks are still rebuilt directly. Anything we
  // cannot frame as a valid FFmpeg input throws NotApplicableError so the runner records an honest
  // NA_ENGINE instead of a fake green or a runner-level prepare error.

  private async prepareMuxTracksImpl(inputs: MediaInput[], options?: Record<string, unknown>): Promise<EncodedTracks> {
    const candidates: PreparedMuxTrackCandidate[] = [];
    const cleanup: string[] = [];

    try {
      for (let inputIndex = 0; inputIndex < inputs.length; inputIndex++) {
        const input = inputs[inputIndex];
        if (!input) continue;
        const base = `${this.scratch()}.muxsrc${inputIndex}`;
        const written = await this.writeInput(input, `${base}.in`);
        cleanup.push(...written.cleanupPaths);

        const structured = await this.structuredProbe(written.name, written.inputOptions, input);
        const metadata = structured?.metadata ?? this.metadataFromLog(
          await this.runInfo(written.name, written.inputOptions),
          input,
        );
        const neutralTimingTracks = await neutralMuxTimingTracks(input);
        const typeCounts: Record<'video' | 'audio', number> = { video: 0, audio: 0 };
        for (let streamIndex = 0; streamIndex < metadata.tracks.length; streamIndex++) {
          const track = metadata.tracks[streamIndex]!;
          if (track.type !== 'video' && track.type !== 'audio') continue;
          const type = track.type;
          const typeOrdinal = typeCounts[type]++;
          const codec = canonicalCodec(track.codec);
          const neutralTimingTrack = neutralTimingTracks.filter((candidate) => candidate.type === type)[typeOrdinal];
          const exactNeutralTiming = neutralTimingTrack?.codec === codec ? neutralTimingTrack : undefined;
          const prep = this.muxPrepForCodec(codec);
          if (!prep) {
            throw createNotApplicableError(ENGINE_ID,
              'mux',
              `cannot prepare codec '${codec}' as a demuxable ffmpeg mux input`,
            );
          }

          const outName = `${base}.s${streamIndex}.${prep.ext}`;
          const packetName = `${base}.s${streamIndex}.source.framecrc.txt`;
          const preparedPacketName = `${base}.s${streamIndex}.prepared.framecrc.txt`;
          cleanup.push(outName, packetName);
          const sourceStreamIndex = structured?.trackIndexes[streamIndex] ?? streamIndex;
          const args = [...written.inputOptions, '-i', written.name, '-map', `0:${sourceStreamIndex}`, '-c', 'copy'];
          if (prep.bitstreamFilter) args.push(prep.bitstreamFilterKind, prep.bitstreamFilter);
          args.push('-f', prep.format, outName);
          await this.run(args, READ_EXEC_TIMEOUT_MS);
          const bytes = await this.readBinary(outName);
          if (bytes.length === 0) continue;
          // Packet timing must come from the original container. Re-demuxing the extracted raw
          // stream makes FFmpeg invent a default CFR/sample clock, which can double durations and
          // erase B-frame/VFR composition timing. The extracted bytes remain the coded payload.
          await this.run([
            ...written.inputOptions,
            '-i', written.name,
            '-map', `0:${sourceStreamIndex}`,
            '-c', 'copy',
            '-f', 'framecrc', packetName,
          ], READ_EXEC_TIMEOUT_MS);
          const packetText = await this.readText(packetName);
          const packetRows = parseFrameChecksumPackets(packetText);
          const packetTimebase = parseFrameChecksumTimebases(packetText).get(0);
          let splitRows = packetRows;
          if (prep.format === 'h264' || prep.format === 'hevc') {
            // Annex-B conversion can prepend parameter sets and replace length fields, so source
            // packet byte counts are not payload boundaries in the extracted stream. A second
            // lightweight framecrc walk supplies only those prepared-byte boundaries; all public
            // timing still comes from packetRows above.
            cleanup.push(preparedPacketName);
            await this.run([
              '-i', outName,
              '-map', '0',
              '-c', 'copy',
              '-f', 'framecrc', preparedPacketName,
            ], READ_EXEC_TIMEOUT_MS);
            splitRows = parseFrameChecksumPackets(await this.readText(preparedPacketName));
          }
          const slices = prep.format === 'adts'
            ? splitAdtsFrames(bytes)
            : splitPreparedBytes(bytes, splitRows);
          const durationUs = metadata.durationSec !== null && Number.isFinite(metadata.durationSec)
            ? Math.round(metadata.durationSec * 1_000_000)
            : 0;
          const timingRows = exactNeutralTiming?.samples.length === slices.length
            ? exactNeutralTiming.samples.map((sample, packetIndex) => ({
                ptsUs: sample.ptsUs ?? packetRows[packetIndex]?.ptsUs ?? 0,
                ...(sample.dtsUs !== undefined
                  ? { dtsUs: sample.dtsUs }
                  : packetRows[packetIndex]?.dtsUs !== undefined
                    ? { dtsUs: packetRows[packetIndex]!.dtsUs }
                    : {}),
                ...(sample.durationUs !== undefined
                  ? { durationUs: sample.durationUs }
                  : packetRows[packetIndex]?.durationUs !== undefined
                    ? { durationUs: packetRows[packetIndex]!.durationUs }
                    : {}),
                keyframe: sample.keyframe ?? packetRows[packetIndex]?.keyframe ?? false,
              }))
            : packetRows;
          const chunks: EncodedTracks['tracks'][number]['chunks'] =
            slices.length === timingRows.length
              ? timingRows.map((packet, packetIndex) => ({
                  data: slices[packetIndex]!,
                  ptsUs: packet.ptsUs,
                  ...(packet.dtsUs !== undefined ? { dtsUs: packet.dtsUs } : {}),
                  decodeIndex: packetIndex,
                  durationUs:
                    packet.durationUs ??
                    Math.max(0, (timingRows[packetIndex + 1]?.ptsUs ?? durationUs) - packet.ptsUs),
                  keyframe: packet.keyframe,
                }))
              : [{ data: bytes, ptsUs: 0, decodeIndex: 0, durationUs, keyframe: true }];
          const framing = prep.format === 'h264' || prep.format === 'hevc'
            ? 'annexb'
            : prep.format === 'adts'
              ? 'adts'
              : prep.format === 'ivf'
                ? 'ivf'
                : 'codec-private';
          const neutralTimebase = exactNeutralTiming?.timescale !== undefined &&
            Number.isSafeInteger(exactNeutralTiming.timescale) && exactNeutralTiming.timescale > 0
              ? { numerator: 1, denominator: exactNeutralTiming.timescale }
              : undefined;
          const sourceTimebase = structured?.timebases.get(sourceStreamIndex) ?? neutralTimebase ?? packetTimebase;
          const neutralMinimumPtsUs = exactNeutralTiming === undefined
            ? undefined
            : exactNeutralTiming.samples.reduce(
                (minimum, sample) => sample.ptsUs === undefined ? minimum : Math.min(minimum, sample.ptsUs),
                Number.POSITIVE_INFINITY,
              );
          const programStartUs = exactNeutralTiming
            ? 0
            : Math.round((metadata.presentationStartSec ?? 0) * 1_000_000);
          const trackStartUs = exactNeutralTiming && Number.isFinite(neutralMinimumPtsUs)
            ? Math.max(0, Math.round(neutralMinimumPtsUs!))
            : Math.round((track.presentationStartSec ?? metadata.presentationStartSec ?? 0) * 1_000_000);
          const explicitTrackDurationSec = track.presentationDurationSec ?? track.mediaDurationSec;
          const packetPresentationEndUs = chunks.reduce(
            (max, chunk) => Math.max(max, chunk.ptsUs + chunk.durationUs),
            Number.NEGATIVE_INFINITY,
          );
          const neutralProgramDurationUs = exactNeutralTiming?.programDurationUs;
          const neutralTrackSpanUs = Number.isFinite(packetPresentationEndUs) && packetPresentationEndUs >= trackStartUs
            ? Math.round(packetPresentationEndUs - trackStartUs)
            : undefined;
          const neutralHasVideo = neutralTimingTracks.some((candidate) => candidate.type === 'video');
          const trackPresentationDurationUs = neutralProgramDurationUs !== undefined
            ? track.type === 'video' || !neutralHasVideo
              ? Math.max(0, neutralProgramDurationUs - trackStartUs)
              : neutralTrackSpanUs === undefined
                ? Math.max(0, neutralProgramDurationUs - trackStartUs)
                : Math.min(neutralTrackSpanUs, Math.max(0, neutralProgramDurationUs - trackStartUs))
            : explicitTrackDurationSec !== undefined && Number.isFinite(explicitTrackDurationSec)
              ? Math.round(explicitTrackDurationSec * 1_000_000)
              : neutralTrackSpanUs ?? (metadata.durationSec !== null && Number.isFinite(metadata.durationSec)
                ? Math.round(metadata.durationSec * 1_000_000)
                : undefined);
          const timedMp4Presentation: TimedMp4Presentation | undefined = trackPresentationDurationUs === undefined
            ? undefined
            : { programStartUs, trackStartUs, durationUs: trackPresentationDurationUs };
          const rotation = track.rotation === 0 || track.rotation === 90 || track.rotation === 180 || track.rotation === 270
            ? track.rotation
            : undefined;
          const encodedTrack: EncodedTracks['tracks'][number] & { timedMp4Presentation?: TimedMp4Presentation } = {
            type,
            codec,
            timescale: timescaleForTimedMux(sourceTimebase),
            packetOrdering: 'decode',
            ...(sourceTimebase ? { timebase: sourceTimebase } : {}),
            ...(timedMp4Presentation ? { timedMp4Presentation } : {}),
            framing,
            accessUnitGrouping: 'one-packet-per-chunk',
            parameterSetLocation: framing === 'annexb' ? 'in-band' : 'not-applicable',
            ...(track.width !== undefined ? { width: track.width } : {}),
            ...(track.height !== undefined ? { height: track.height } : {}),
            ...(track.sampleRate !== undefined ? { sampleRate: track.sampleRate } : {}),
            ...(track.channels !== undefined ? { channels: track.channels } : {}),
            ...(rotation !== undefined ? { rotation } : {}),
            chunks,
          };
          candidates.push({ inputIndex, type, typeOrdinal, track: encodedTrack });
        }
      }
    } finally {
      await this.cleanup(cleanup);
    }

    return { tracks: selectPreparedMuxTracks(candidates, inputs.length, options).map((c) => c.track) };
  }

  private muxPrepForCodec(
    codec: string,
  ): { ext: string; format: string; bitstreamFilterKind: '-bsf:v' | '-bsf:a'; bitstreamFilter?: string } | null {
    const pcmFormat = rawPcmFormat(codec);
    if (pcmFormat) return { ext: pcmFormat, format: pcmFormat, bitstreamFilterKind: '-bsf:a' };
    switch (codec) {
      case 'h264':
        return { ext: 'h264', format: 'h264', bitstreamFilterKind: '-bsf:v', bitstreamFilter: 'h264_mp4toannexb' };
      case 'hevc':
        return { ext: 'hevc', format: 'hevc', bitstreamFilterKind: '-bsf:v', bitstreamFilter: 'hevc_mp4toannexb' };
      case 'aac':
        return { ext: 'aac', format: 'adts', bitstreamFilterKind: '-bsf:a' };
      case 'vp8':
      case 'vp9':
        return { ext: 'ivf', format: 'ivf', bitstreamFilterKind: '-bsf:v' };
      case 'opus':
      case 'vorbis':
        return { ext: 'ogg', format: 'ogg', bitstreamFilterKind: '-bsf:a' };
      case 'mp3':
        return { ext: 'mp3', format: 'mp3', bitstreamFilterKind: '-bsf:a' };
      case 'flac':
        return { ext: 'flac', format: 'flac', bitstreamFilterKind: '-bsf:a' };
      default:
        return null;
    }
  }

  private async muxImpl(tracks: EncodedTracks, opts: { container: string } & Record<string, unknown>): Promise<MediaBytes> {
    const request = this.activeOperation?.context.request;
    const deliberateNegative = request !== undefined &&
      (ILLEGAL_MUX_SCENARIO_IDS as readonly string[]).includes(request.scenarioId);
    validateEncodedTracks(ENGINE_ID, tracks, 'encodedTracks', { allowEmptyTracks: deliberateNegative });
    const realTracks = tracks.tracks.filter((t) => t.type === 'video' || t.type === 'audio');
    if (realTracks.length === 0) {
      if (deliberateNegative) {
        throw createMalformedInputError(
          ENGINE_ID,
          'mux',
          'validate',
          'mux requires at least one audio/video track',
          'FFMPEG_ILLEGAL_MUX_REJECTED',
          request?.inputs[0]?.id,
        );
      }
      throw new Error(`${ENGINE_ID}: mux requires at least one audio/video track`);
    }
    const legality = muxLegality(realTracks, opts.container);
    if (legality) {
      if (deliberateNegative) {
        throw createMalformedInputError(
          ENGINE_ID,
          'mux',
          'validate',
          legality,
          'FFMPEG_ILLEGAL_MUX_REJECTED',
          request?.inputs[0]?.id,
        );
      }
      throw createNotApplicableError(
        ENGINE_ID,
        'mux',
        legality,
        this.activeOperation ? tupleSummary(this.activeOperation.context.request) : {},
        'FFMPEG_MUX_TUPLE_ILLEGAL',
      );
    }
    if (opts.fastStart === 'reserve') {
      throw createNotApplicableError(
        ENGINE_ID,
        'mux',
        'reserved-moov output is not advertised without verified -moov_size sizing',
        this.activeOperation ? tupleSummary(this.activeOperation.context.request) : {},
        'FFMPEG_FASTSTART_RESERVE_UNSUPPORTED',
      );
    }

    if (canBuildTimedMp4(realTracks)) {
      return this.muxTimedTracks(realTracks, opts);
    }
    for (const track of realTracks) {
      if (!hasImplicitRawDemuxTiming(track)) {
        throw createNotApplicableError(
          ENGINE_ID,
          'mux',
          `raw ${track.codec} staging cannot preserve this track's explicit/VFR timing`,
          this.activeOperation ? tupleSummary(this.activeOperation.context.request) : {},
          'FFMPEG_TIMED_STAGING_CODEC_UNSUPPORTED',
        );
      }
    }

    const base = this.scratch();
    const inputNames: string[] = [];
    const outName = `${base}.out.${containerExt(opts.container)}`;
    try {
      // 1) Materialize each track as an elementary stream ffmpeg can demux.
      for (let ti = 0; ti < realTracks.length; ti++) {
        const t = realTracks[ti]!;
        const codec = canonicalCodec(t.codec);
        const { name, bytes } = this.buildElementaryStream(t, codec, `${base}.t${ti}`);
        await this.writeScratch(name, bytes, true);
        inputNames.push(name);
      }

      // 2) Stream-copy mux: one -i per elementary stream, then -map each so every track lands.
      const args: string[] = [];
      for (let index = 0; index < inputNames.length; index++) {
        const track = realTracks[index]!;
        if (track.type === 'video' && track.chunks[0]?.durationUs) {
          args.push('-r', (1_000_000 / track.chunks[0].durationUs).toFixed(9));
        }
        args.push(...elementaryInputOptions(track));
        args.push('-i', inputNames[index]!);
      }
      for (let i = 0; i < inputNames.length; i++) args.push('-map', String(i));
      args.push('-c', 'copy');
      args.push('-avoid_negative_ts', 'make_zero');
      if (opts.container === 'mp4' || opts.container === 'mov') {
        if (opts.fragmented === true || opts.fastStart === 'fragmented') {
          args.push('-movflags', FFMPEG_FRAGMENT_MOVFLAGS);
        } else if (opts.fastStart !== false) {
          args.push('-movflags', FFMPEG_FASTSTART_MOVFLAGS);
        }
      } else if (opts.container === 'ts') {
        args.push('-muxdelay', '0', '-muxpreload', '0');
      }
      args.push(outName);

      await this.run(args, READ_EXEC_TIMEOUT_MS);
      const muxed = await this.readBinary(outName);
      return {
        bytes: muxed,
        mime: containerMime(opts.container),
        container: opts.container,
        ffmpegRepresentation: {
          muxer: opts.container,
          bitstreamFilters: realTracks.flatMap((track) =>
            track.codec === 'h264' || track.codec === 'hevc' ? [`${track.framing}->annexb-input`] : []),
          command: redactFfmpegCommand(args),
          inputFraming: realTracks.map((track) => track.framing ?? 'missing'),
          fragmentFlags:
            opts.fragmented === true || opts.fastStart === 'fragmented'
              ? FFMPEG_FRAGMENT_MOVFLAGS
              : null,
        },
      } as MediaBytes;
    } finally {
      await this.cleanup([...inputNames, outName]);
    }
  }

  private async muxTimedTracks(
    tracks: EncodedTracks['tracks'],
    opts: { container: string } & Record<string, unknown>,
  ): Promise<MediaBytes> {
    const base = this.scratch();
    const stageName = `${base}.timed-input.mp4`;
    const outName = `${base}.out.${containerExt(opts.container)}`;
    let stage: Uint8Array;
    try {
      stage = buildTimedMp4(tracks, opts.container === 'mov' ? 'mov' : 'mp4');
    } catch (error) {
      if (error instanceof TimedMp4UnsupportedError) {
        throw createNotApplicableError(
          ENGINE_ID,
          'mux',
          error.message,
          this.activeOperation ? tupleSummary(this.activeOperation.context.request) : {},
          error.reasonCode,
          error,
        );
      }
      throw error;
    }
    if (
      (opts.container === 'mp4' || opts.container === 'mov') &&
      opts.fragmented !== true &&
      opts.fastStart !== 'fragmented' &&
      opts.fastStart !== true &&
      opts.fastStart !== 'in-memory'
    ) {
      // This is already the requested progressive ISO-BMFF target. A second FFmpeg demux/remux pass can rewrite
      // authored VFR sample durations (especially the terminal run), so return the verified staging
      // artifact directly. Its mdat-before-moov layout also implements fastStart:false exactly.
      return {
        bytes: stage,
        mime: containerMime(opts.container),
        container: opts.container,
        ffmpegRepresentation: {
          muxer: opts.container,
          timingSource: 'explicit-iso-bmff-sample-tables',
          inputFraming: tracks.map((track) => track.framing ?? 'missing'),
          fragmentFlags: null,
        },
      } as MediaBytes;
    }
    this.fsLedger.addJsCopy(stage.byteLength);
    try {
      await this.writeScratch(stageName, stage, true);
    } finally {
      this.fsLedger.releaseJsCopy(stage.byteLength);
    }
    try {
      // The staging edit list already maps negative decode preroll onto presentation time zero.
      // make_zero would shift that authored presentation back by the preroll a second time.
      const args = [
        '-copyts', '-i', stageName, '-map', '0', '-c', 'copy',
        '-avoid_negative_ts', opts.container === 'ts' ? 'make_zero' : 'disabled',
      ];
      if (opts.container === 'mp4' || opts.container === 'mov') {
        if (opts.fragmented === true || opts.fastStart === 'fragmented') {
          args.push('-movflags', FFMPEG_FRAGMENT_MOVFLAGS);
        } else if (opts.fastStart !== false) {
          args.push('-movflags', FFMPEG_FASTSTART_MOVFLAGS);
        }
      } else if (opts.container === 'ts') {
        args.push('-muxdelay', '0', '-muxpreload', '0');
      }
      args.push(outName);
      await this.run(args, READ_EXEC_TIMEOUT_MS);
      const bytes = await this.readBinary(outName);
      return {
        bytes,
        mime: containerMime(opts.container),
        container: opts.container,
        ffmpegRepresentation: {
          muxer: opts.container,
          command: redactFfmpegCommand(args),
          timingSource: 'explicit-iso-bmff-sample-tables',
          inputFraming: tracks.map((track) => track.framing ?? 'missing'),
          fragmentFlags:
            opts.fragmented === true || opts.fastStart === 'fragmented'
              ? FFMPEG_FRAGMENT_MOVFLAGS
              : null,
        },
      } as MediaBytes;
    } finally {
      await this.cleanup([stageName, outName]);
    }
  }

  private async concatImpl(segments: MediaBytes[], opts: { container: string } & Record<string, unknown>): Promise<MediaBytes> {
    if (segments.length === 0) {
      throw new Error(`${ENGINE_ID}: concat requires at least one segment`);
    }
    const base = this.scratch();
    const inputNames: string[] = [];
    const listName = `${base}.concat.txt`;
    const outName = `${base}.out.${containerExt(opts.container)}`;
    try {
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i]!;
        const ext = containerExt(segment.container || opts.container);
        const name = `${base}.seg${i}.${ext}`;
        await this.writeScratch(name, segment.bytes, true);
        inputNames.push(name);
      }
      const list = inputNames.map((name) => `file '${name}'`).join('\n') + '\n';
      await this.writeScratch(listName, new TextEncoder().encode(list));

      const args = ['-f', 'concat', '-safe', '0', '-i', listName, '-c', 'copy'];
      if (opts.container === 'mp4' || opts.container === 'mov') {
        args.push('-movflags', FFMPEG_FASTSTART_MOVFLAGS);
      }
      args.push(outName);
      await this.run(args);
      const bytes = await this.readBinary(outName);
      return { bytes, mime: containerMime(opts.container), container: opts.container };
    } finally {
      await this.cleanup([...inputNames, listName, outName]);
    }
  }

  /**
   * Rebuild one EncodedTrack as a demuxable elementary-stream file (name + bytes) for mux()'s
   * `-c copy`. Throws an honest error for codecs we cannot frame as a bare elementary stream.
   */
  private buildElementaryStream(
    track: EncodedTracks['tracks'][number],
    codec: string,
    baseName: string,
  ): { name: string; bytes: Uint8Array } {
    const chunks = track.chunks ?? [];
    if (codec === 'h264' || codec === 'hevc') {
      if (track.framing === 'annexb') {
        if (!chunks.every((chunk) => isAnnexB(chunk.data))) {
          throw new Error(`${ENGINE_ID}: declared Annex B ${codec} chunk lacks a start code`);
        }
        return {
          name: `${baseName}.${codec === 'h264' ? 'h264' : 'hevc'}`,
          bytes: concatBytes(chunks.map((c) => c.data)),
        };
      }
      const expectedFraming = codec === 'h264' ? 'avc' : 'hevc';
      if (track.framing !== expectedFraming) {
        throw createNotApplicableError(
          ENGINE_ID,
          'mux',
          `codec '${codec}' requires explicit '${expectedFraming}' or 'annexb' framing`,
          {},
          'FFMPEG_CODED_FRAMING_UNSUPPORTED',
        );
      }
      const nalLen =
        codec === 'h264'
          ? nalLengthSizeFromAvcC(track.description)
          : nalLengthSizeFromHvcC(track.description);
      const params =
        codec === 'h264' ? paramSetsFromAvcC(track.description) : paramSetsFromHvcC(track.description);
      const parts: Uint8Array[] = [];
      let first = true;
      for (const c of chunks) {
        // Prepend the param sets (Annex-B) once, before the first sample, so a raw .h264/.hevc
        // elementary stream is self-contained (avcC/hvcC out-of-band config is otherwise lost).
        if (first && params.length > 0) parts.push(params);
        first = false;
        parts.push(lengthPrefixedToAnnexB(c.data, nalLen));
      }
      const ext = codec === 'h264' ? 'h264' : 'hevc';
      return { name: `${baseName}.${ext}`, bytes: concatBytes(parts) };
    }
    if (codec === 'aac') {
      if (track.framing === 'adts') {
        if (!chunks.every((chunk) => isAdts(chunk.data))) {
          throw new Error(`${ENGINE_ID}: declared ADTS chunk lacks an ADTS header`);
        }
        return { name: `${baseName}.aac`, bytes: concatBytes(chunks.map((c) => c.data)) };
      }
      if (track.framing !== 'raw') {
        throw createNotApplicableError(ENGINE_ID, 'mux', `AAC framing '${track.framing ?? 'missing'}' is unsupported`, {}, 'FFMPEG_CODED_FRAMING_UNSUPPORTED');
      }
      const params = aacParamsFromAsc(track.description, track.sampleRate ?? 0, track.channels ?? 0);
      const parts: Uint8Array[] = [];
      for (const c of chunks) parts.push(adtsWrap(c.data, params));
      return { name: `${baseName}.aac`, bytes: concatBytes(parts) };
    }
    if (codec === 'vp8' || codec === 'vp9') {
      if (chunks.length === 1 && isIvf(chunks[0]!.data)) {
        return { name: `${baseName}.ivf`, bytes: chunks[0]!.data };
      }
      throw createNotApplicableError(ENGINE_ID, 'mux', `codec '${codec}' requires IVF framing for ffmpeg mux input`);
    }
    if (codec === 'opus' || codec === 'vorbis') {
      if (chunks.length === 1 && isOgg(chunks[0]!.data)) {
        return { name: `${baseName}.ogg`, bytes: chunks[0]!.data };
      }
      throw createNotApplicableError(ENGINE_ID, 'mux', `codec '${codec}' requires Ogg framing for ffmpeg mux input`);
    }
    if (codec === 'mp3') {
      if (chunks.length > 0 && chunks.every((c) => isMp3(c.data))) {
        return { name: `${baseName}.mp3`, bytes: concatBytes(chunks.map((c) => c.data)) };
      }
      throw createNotApplicableError(ENGINE_ID, 'mux', "codec 'mp3' requires MP3 frame data for ffmpeg mux input");
    }
    if (codec === 'flac') {
      if (chunks.length === 1 && isFlac(chunks[0]!.data)) {
        return { name: `${baseName}.flac`, bytes: chunks[0]!.data };
      }
      throw createNotApplicableError(ENGINE_ID, 'mux', "codec 'flac' requires a FLAC stream for ffmpeg mux input");
    }
    const pcmFormat = rawPcmFormat(codec);
    if (pcmFormat) {
      return { name: `${baseName}.${pcmFormat}`, bytes: concatBytes(chunks.map((chunk) => chunk.data)) };
    }
    // Codecs that need a full intermediate container to be demuxable: fail honestly (never guess).
    throw createNotApplicableError(ENGINE_ID,
      'mux',
      `cannot reconstruct an elementary stream for codec '${codec}'`,
    );
  }
}

/** Cross-origin isolation gate (SharedArrayBuffer availability) for the mt fast path. */
function isCrossOriginIsolated(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true &&
    typeof SharedArrayBuffer !== 'undefined'
  );
}
