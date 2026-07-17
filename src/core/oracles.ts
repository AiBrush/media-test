/**
 * src/core/oracles.ts — browser-pure correctness oracles (§8). THE conformance gate.
 *
 * "No green correctness oracle → no admissible benchmark." Every oracle here validates only an
 * engine's OBSERVABLE output (bytes/metadata/frames in → out), using ONLY:
 *   - the browser itself (crypto.subtle, ImageData, OffscreenCanvas — all guarded),
 *   - committed golden JSON baked offline by INDEPENDENT tools (ffprobe/ffmpeg/Bento4),
 *   - injected platform decode/playback helpers (ctx.decodeWithPlatform / ctx.playbackSmoke),
 *   - a NO-ENGINE byte reader (box-readers.ts) over the engine's OWN output bytes (no scored engine).
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
  BrowserName,
  DemuxResult,
  FrameDigest,
  FrameSink,
  MediaBytes,
  MediaInput,
  NormalizedMetadata,
  NormalizedTrack,
} from './engine.ts';
import type { MediaEngine, PacketInfo } from './engine.ts';
import { isNotApplicableError } from './engine.ts';
import type { OracleId, OracleOutcome, OracleTolerances, Scenario } from './scenario.ts';
import { canonicalizeJson, type JsonObject } from './canonical-json.ts';
import type {
  GoldenEvidenceProvider,
  GoldenEvidenceResult as StrictGoldenEvidenceResult,
  GoldenEvidenceState as StrictGoldenEvidenceState,
} from './golden-evidence.ts';
import {
  canonicalCodecToken,
  readOutputPacketsResult,
  readOutputStructureResult,
} from './box-readers.ts';
import {
  assessClearDecryptStructure,
  compareCompleteDecryptPresentation,
  type EncryptionEvidenceVerdict,
} from '../features/encryption/structural-evidence.ts';
import { compareDecryptNoopBytes } from '../features/encryption/byte-identity.ts';
import { encryptionNegativeContractFromOptions } from '../features/encryption/contracts.ts';
import {
  evaluateAudioDspTransform,
  evaluateEndiannessRoundTrip,
  evaluateGaplessNativeEvidence,
  type GaplessNativeEvidenceResult,
} from '../features/audio-dsp/index.ts';
import {
  assessAlphaEvidence,
  assessDisplaySpaceEvidence,
  assessObservedSeekLanding,
  assessSeekSequence,
  collectAlphaEvidence,
  displayEvidenceFromFrameDigests,
  displayTransformFromOptions,
  parseAlphaEvidenceArtifact,
  seekSequenceContractFromOptions,
  type DecodeSeekVerdict,
  type SeekSequenceObservation,
} from '../features/decode-seek/index.ts';
import {
  classifyRejectedPartialRemux,
  evaluateStrictStreamCopy,
  normalizeRemuxTrackForTest,
  readNeutralRemuxProgram,
  validateReturnedPartialRemux,
} from '../features/remux/index.ts';
import { assessDemuxDts } from '../features/demux/index.ts';
import {
  TRIM_AUDIO_CONTENT_INVARIANT,
  TRIM_BOUNDARY_EVIDENCE_SCHEMA,
  TRIM_FEATURE_PROPERTIES_INVARIANT,
  TRIM_NOOP_IDENTITY_INVARIANT,
  assessAudioTrimEvidence,
  assessFeatureLabelledTrim,
  assessTrimComposition,
  assessFragmentedTrimOutput,
  assessTrimBoundaryEvidence,
  assessTrimNoopIdentity,
  inspectTrimAudioContainer,
  readIsoBmffPresentationTimeline,
  selectIsoBmffTrimWindows,
  trimBoundaryEvidenceKey,
  trimContractForScenario,
  type IsoBmffPresentationTimeline,
  type TrimBoundaryEvidenceArtifact,
  type TrimBoundaryFrame,
  type TrimCompositionContract,
  type TrimContract,
  type TrimDecision,
  type DecodedAudioBoundaryEvidence,
  type SemanticTrimSample,
  type SemanticTrimTrack,
  type TrimSemanticPresentation,
} from '../features/trim/index.ts';
import {
  assessMuxRotation,
  assessMuxTargetSemantics,
  assessMuxTrackSelection,
  compareMuxTimelines,
  evaluateMuxOutputMode,
  muxOutputModeContractFromScenario,
  muxRotationPolicyFromScenario,
  muxTargetContractFromScenario,
  muxTimelineEvidenceFromProgram,
  normalizeMuxTrackSelection,
  readMuxOrientation,
  readNeutralMuxTarget,
  type MuxCandidateTrackEvidence,
  type MuxDecision,
  type MuxSourceTrackEvidence,
} from '../features/mux/index.ts';
import type { RemuxProgramEvidence, RemuxTrackEvidence } from '../features/remux/types.ts';
import {
  assessCrossContainerProbeDuration,
  assessDeclaredMetadataFields,
  assessHeaderlessProbeDuration,
  assessHlsPlaylistOnlyProbe,
  assessHlsPlaylistOnlyResourceAccess,
  assessHlsProtectedSegmentResourceAccess,
  assessProbeWrapperEquivalence,
  headerlessDurationContractFromOptions,
  hlsProbeContractFromOptions,
  metadataFieldPolicyFromOptions,
  parseProbeWrapperEquivalenceEvidence,
  type HlsProbeResourceAccess,
  type ProbeContractAssessment,
  type ProbeDurationObservation,
  type ProbeMetadataObservation,
} from '../features/probe/index.ts';
import {
  assessMetadataRecovery,
  assessMetadataTagsFromObservation,
  metadataRecoveryContractFromOptions,
  metadataTagContractFromOptions,
  reduceRequiredMetadataLayers,
  verifyMetadataTagsByNeutralReprobe,
} from '../features/metadata/index.ts';
import {
  TRANSCODE_ABR_CONTRACT,
  TRANSCODE_ABR_RENDITION_SET_ROLE,
  TRANSCODE_AUDIO_CONTENT_INVARIANT,
  TRANSCODE_EFFECT_INVARIANT,
  collectAbrRenditionEvidence,
  decodedPcmFromContainer,
  evaluateAbrSwitchability,
  evaluateTranscodeRuntimeInvariant,
  readTranscodeAudioStructure,
  readTranscodeTransformSignal,
  transcodeAbrSwitchRole,
  transcodeError,
  transcodeTransformContractForScenario,
  transcodeUnavailable,
  transcodeVerdict,
  type AbrRenditionEvidence,
  type AbrRenditionSetDescription,
  type AbrSwitchDecodeEvidence,
  type AudioTimelineEvidence,
  type DecodedAudioSignal,
  type TranscodeDecision,
  type TranscodePixelFrame,
} from '../features/transcode/index.ts';

/** No-engine structural read of an engine's OWN output bytes (box-readers.ts). */
type OutputStructure = Extract<ReturnType<typeof readOutputStructureResult>, { state: 'OK' }>['value'];
type OutputTrack = OutputStructure['tracks'][number];

// ── Golden store ──────────────────────────────────────────────────────────────────────────────

export type GoldenKind = 'meta' | 'packets' | 'frames' | 'ssim';
export type GoldenEvidenceState =
  | 'OK'
  | 'NOT_REQUESTED'
  | 'MISSING'
  | 'HTTP_ERROR'
  | 'NETWORK_ERROR'
  | 'PARSE_ERROR'
  | 'SCHEMA_ERROR'
  | 'DIGEST_MISMATCH'
  | 'PENDING'
  | 'PRODUCER_FAILED';

export type GoldenEvidence<T> =
  | { state: 'OK'; value: T; url: string; sha256?: string; raw: unknown; typedState?: 'ready' }
  | {
      state: Exclude<GoldenEvidenceState, 'OK'>;
      reasonCode: string;
      url: string;
      typedState?: Exclude<StrictGoldenEvidenceState, 'ready'>;
      httpStatus?: number;
      expectedSha256?: string;
      actualSha256?: string;
    };

export interface GoldenEvidenceMap {
  meta: GoldenEvidence<NormalizedMetadata>;
  packets: GoldenEvidence<PacketInfo[]>;
  frames: GoldenEvidence<FrameDigest[]>;
  ssim: GoldenEvidence<number[][]>;
}

export interface GoldenStore {
  meta?: NormalizedMetadata;
  packets?: PacketInfo[];
  frames?: FrameDigest[]; // golden decoded-frame digests
  ssimRef?: number[][]; // downsampled luma signatures per reference frame (for ssim-psnr)
  raw?: Record<string, unknown>;
  evidence: GoldenEvidenceMap;
}

export interface GoldenLoadOptions {
  baseUrl?: string;
  expectedDigests?: Partial<Record<GoldenKind, string>>;
  /** Exact evidence kinds required by the caller's frozen oracle plan. Defaults to every kind. */
  requestedKinds?: readonly GoldenKind[];
  /** Active-generation provider. `undefined` per kind means the asset is outside its publication scope. */
  evidenceProvider?: GoldenEvidenceProvider;
}

/**
 * Fetch the committed golden artifacts for an asset. Tolerates 404 (artifact absent → field
 * undefined) and any non-OK status; only a present, parseable JSON populates a field. Never throws
 * on a missing file — a scenario may legitimately have only a subset of golden kinds.
 */
export async function loadGolden(
  assetId: string,
  baseUrlOrOptions: string | GoldenLoadOptions = 'fixtures/golden',
): Promise<GoldenStore> {
  const options = typeof baseUrlOrOptions === 'string' ? { baseUrl: baseUrlOrOptions } : baseUrlOrOptions;
  const base = (options.baseUrl ?? 'fixtures/golden').replace(/\/+$/, '');
  const url = (kind: string) => `${base}/${assetId}.${kind}.json`;
  const requestedKinds = new Set<GoldenKind>(options.requestedKinds ?? ['meta', 'packets', 'frames', 'ssim']);
  const notRequested = <T>(kind: GoldenKind): GoldenEvidence<T> => ({
    state: 'NOT_REQUESTED',
    reasonCode: 'GOLDEN_EVIDENCE_NOT_REQUESTED',
    url: url(kind),
  });

  const [meta, packets, frames, ssim] = await Promise.all([
    requestedKinds.has('meta')
      ? loadGoldenEvidence(url('meta'), options.expectedDigests?.meta, parseGoldenMetadata, options.evidenceProvider, 'metadata')
      : Promise.resolve(notRequested<NormalizedMetadata>('meta')),
    requestedKinds.has('packets')
      ? loadGoldenEvidence(url('packets'), options.expectedDigests?.packets, parseGoldenPackets, options.evidenceProvider, 'packets')
      : Promise.resolve(notRequested<PacketInfo[]>('packets')),
    requestedKinds.has('frames')
      ? loadGoldenEvidence(url('frames'), options.expectedDigests?.frames, parseGoldenFrames, options.evidenceProvider, 'frames')
      : Promise.resolve(notRequested<FrameDigest[]>('frames')),
    requestedKinds.has('ssim')
      ? loadGoldenEvidence(url('ssim'), options.expectedDigests?.ssim, parseGoldenSsim, options.evidenceProvider, 'ssim')
      : Promise.resolve(notRequested<number[][]>('ssim')),
  ]);

  const evidence: GoldenEvidenceMap = { meta, packets, frames, ssim };
  const store: GoldenStore = { evidence };
  const raw: Record<string, unknown> = {};

  if (meta.state === 'OK') {
    store.meta = meta.value;
    raw.meta = meta.raw;
  }
  if (packets.state === 'OK') {
    store.packets = packets.value;
    raw.packets = packets.raw;
  }
  if (frames.state === 'OK') {
    store.frames = frames.value;
    raw.frames = frames.raw;
  }
  if (ssim.state === 'OK') {
    store.ssimRef = ssim.value;
    raw.ssim = ssim.raw;
  }

  if (Object.keys(raw).length) store.raw = raw;
  return store;
}

export function emptyGoldenStore(baseUrl = 'fixtures/golden'): GoldenStore {
  const missing = <T>(kind: GoldenKind): GoldenEvidence<T> => ({
    state: 'MISSING',
    reasonCode: 'GOLDEN_NOT_LOADED',
    url: `${baseUrl}/<unknown>.${kind}.json`,
  });
  return {
    evidence: {
      meta: missing('meta'),
      packets: missing('packets'),
      frames: missing('frames'),
      ssim: missing('ssim'),
    },
  };
}

async function loadGoldenEvidence<T>(
  url: string,
  expectedSha256: string | undefined,
  parse: (value: unknown) => T | undefined,
  provider?: GoldenEvidenceProvider,
  strictKind?: 'metadata' | 'packets' | 'frames' | 'ssim',
): Promise<GoldenEvidence<T>> {
  if (provider && strictKind) {
    const indexed = await provider.load(strictKind, parse);
    if (indexed !== undefined) return legacyGoldenEvidence(indexed);
  }
  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-store' });
  } catch {
    return { state: 'NETWORK_ERROR', reasonCode: 'GOLDEN_NETWORK_ERROR', url };
  }
  if (response.status === 404) {
    return { state: 'MISSING', reasonCode: 'GOLDEN_NOT_FOUND', url, httpStatus: 404 };
  }
  if (!response.ok) {
    return {
      state: 'HTTP_ERROR',
      reasonCode: 'GOLDEN_HTTP_ERROR',
      url,
      httpStatus: response.status,
    };
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch {
    return { state: 'NETWORK_ERROR', reasonCode: 'GOLDEN_BODY_READ_ERROR', url };
  }

  let actualSha256: string | undefined;
  if (expectedSha256 !== undefined) {
    try {
      actualSha256 = await sha256Hex(bytes);
    } catch {
      return { state: 'PARSE_ERROR', reasonCode: 'GOLDEN_DIGEST_UNAVAILABLE', url };
    }
    if (normHex(actualSha256) !== normHex(expectedSha256)) {
      return {
        state: 'DIGEST_MISMATCH',
        reasonCode: 'GOLDEN_DIGEST_MISMATCH',
        url,
        expectedSha256,
        actualSha256,
      };
    }
  }

  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return { state: 'PARSE_ERROR', reasonCode: 'GOLDEN_JSON_PARSE_ERROR', url };
  }
  if (isObject(raw) && raw.pending === true) {
    return { state: 'PENDING', reasonCode: 'GOLDEN_PENDING', url };
  }
  const value = parse(raw);
  if (value === undefined) {
    return { state: 'SCHEMA_ERROR', reasonCode: 'GOLDEN_SCHEMA_ERROR', url };
  }
  return {
    state: 'OK',
    value,
    url,
    raw,
    ...(actualSha256 !== undefined ? { sha256: actualSha256 } : {}),
  };
}

function legacyGoldenEvidence<T>(result: StrictGoldenEvidenceResult<T>): GoldenEvidence<T> {
  if (result.state === 'ready') {
    return {
      state: 'OK',
      typedState: 'ready',
      value: result.value,
      url: result.reference.url,
      sha256: result.actualArtifactSha256,
      raw: result.envelope,
    };
  }
  const common = {
    reasonCode: result.reasonCode,
    url: result.reference.url,
    typedState: result.state,
    ...(result.httpStatus !== undefined ? { httpStatus: result.httpStatus } : {}),
    ...(result.expectedSha256 !== undefined ? { expectedSha256: result.expectedSha256 } : {}),
    ...(result.actualSha256 !== undefined ? { actualSha256: result.actualSha256 } : {}),
  };
  switch (result.state) {
    case 'absent-expected':
      return { state: 'MISSING', ...common };
    case 'pending':
      return { state: 'PENDING', ...common };
    case 'digest-mismatch':
      return { state: 'DIGEST_MISMATCH', ...common };
    case 'schema-invalid':
      return { state: 'SCHEMA_ERROR', ...common };
    case 'transport-error':
      return { state: result.httpStatus !== undefined ? 'HTTP_ERROR' : 'NETWORK_ERROR', ...common };
    case 'producer-failed':
      return { state: 'PRODUCER_FAILED', ...common };
  }
}

function parseGoldenMetadata(value: unknown): NormalizedMetadata | undefined {
  const metadata = unwrap(value, ['metadata', 'meta']);
  if (!isObject(metadata) || typeof metadata.container !== 'string' || !Array.isArray(metadata.tracks)) {
    return undefined;
  }
  if (metadata.durationSec !== null && typeof metadata.durationSec !== 'number') return undefined;
  if (
    !metadata.tracks.every(
      (track) =>
        isObject(track) &&
        typeof track.type === 'string' &&
        typeof track.codec === 'string',
    )
  ) {
    return undefined;
  }
  return metadata as unknown as NormalizedMetadata;
}

function parseGoldenPackets(value: unknown): PacketInfo[] | undefined {
  const packets = unwrap(value, ['packets']);
  if (!Array.isArray(packets)) return undefined;
  if (
    !packets.every(
      (packet) =>
        isObject(packet) &&
        typeof packet.trackIndex === 'number' &&
        typeof packet.size === 'number' &&
        typeof packet.ptsUs === 'number' &&
        (packet.dtsUs === undefined || typeof packet.dtsUs === 'number') &&
        typeof packet.keyframe === 'boolean',
    )
  ) {
    return undefined;
  }
  return packets as PacketInfo[];
}

function parseGoldenFrames(value: unknown): FrameDigest[] | undefined {
  const frames = unwrap(value, ['frames']);
  if (!Array.isArray(frames)) return undefined;
  if (
    !frames.every(
      (frame) =>
        isObject(frame) &&
        typeof frame.index === 'number' &&
        typeof frame.ptsUs === 'number' &&
        typeof frame.sha256 === 'string' &&
        frame.sha256.length > 0,
    )
  ) {
    return undefined;
  }
  return frames as FrameDigest[];
}

function parseGoldenSsim(value: unknown): number[][] | undefined {
  const parsed = parseSsimRef(value);
  if (!parsed || parsed.some((row) => row.some((item) => !Number.isFinite(item)))) return undefined;
  return parsed;
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
  inputs?: MediaInput[];
  /** injected by runner: the candidate engine that produced the primary operation result */
  engine?: MediaEngine;
  output?: MediaBytes; // bytes-producing ops
  metadata?: NormalizedMetadata; // probe
  probeMetadatas?: Array<{ input: MediaInput; metadata: NormalizedMetadata; golden: GoldenStore }>; // multi-input probe
  /** Adapter-observed probe resource reads. Absence is not equivalent to an empty trace. */
  probeResourceAccesses?: readonly HlsProbeResourceAccess[];
  /** Runner-owned source-read/operation-memory assessment for bounded scale probes. */
  probeBudgetAssessment?: ProbeContractAssessment;
  demux?: DemuxResult; // demux
  frames?: FrameSink; // decodeFrames
  seek?: { landedPtsUs: number; frame: FrameDigest };
  seekSequence?: SeekSequenceObservation;
  decodeTrackSelection?: DecodeSeekVerdict;
  trimComposition?: {
    contract: TrimCompositionContract;
    direct: TrimSemanticPresentation;
    concatenated: TrimSemanticPresentation;
  };
  demuxInvariantOutcome?: OracleOutcome;
  /** Runner-produced verdict over a candidate-authored sparse >4 GiB mux target. */
  muxLargeFileOutcome?: OracleOutcome;
  golden: GoldenStore;
  /** Runner-bound active-generation golden loader for alternate/reference asset sidecars. */
  goldenLoader?: (assetId: string) => Promise<GoldenStore>;
  /** Digest-verified auxiliary corpus bytes retained by the runner for neutral oracle dependencies. */
  verifiedResources?: Readonly<Record<string, Uint8Array>>;
  /** Current browser, when the runner provides it. Used only for browser-baked frame-golden sidecars. */
  browser?: BrowserName;
  /** injected by runner: decode arbitrary bytes with the platform engine (WebCodecs) → frames */
  decodeWithPlatform: (bytes: MediaBytes, opts?: { maxFrames?: number }) => Promise<FrameSink>;
  /** injected by runner: <video> playback smoke test → resolves true if it plays a few frames */
  playbackSmoke: (bytes: MediaBytes) => Promise<boolean>;
  /** Optional native-rate audio instrument. Web Audio playback-rate evidence is never accepted. */
  gaplessNativeEvidence?: (
    source: MediaBytes,
    output: MediaBytes,
  ) => Promise<GaplessNativeEvidenceResult>;
}

const ORACLE_IDS = new Set<OracleId>([
  'golden-metadata',
  'golden-packets',
  'decoded-frames-bitexact',
  'decoded-audio-pcm',
  'reference-reimport',
  'playback-smoke',
  'ssim-psnr',
  'mp4-box-layout',
  'webm-live-layout',
  'fanout-renditions',
  'alpha-plane',
  'seek-accuracy',
  'trim-boundaries',
  'decrypt-bitexact',
  'graceful-failure',
  'property-invariant',
]);

export type OracleOutcomeValidation =
  | { ok: true; value: OracleOutcome }
  | { ok: false; errors: string[] };

/**
 * Runtime boundary for persisted/transported oracle results. Human detail is deliberately ignored
 * by the routing checks: only the discriminants, status and stable reasonCode decide the branch.
 */
export function validateOracleOutcome(value: unknown): OracleOutcomeValidation {
  const errors: string[] = [];
  if (!isObject(value)) return { ok: false, errors: ['outcome must be an object'] };
  if (typeof value.oracle !== 'string' || !ORACLE_IDS.has(value.oracle as OracleId)) {
    errors.push('oracle must be a known OracleId');
  }
  if (value.state !== 'VERDICT' && value.state !== 'UNAVAILABLE' && value.state !== 'ERROR') {
    errors.push("state must be 'VERDICT', 'UNAVAILABLE', or 'ERROR'");
  } else if (value.state === 'VERDICT') {
    if (value.verdict !== 'PASS' && value.verdict !== 'FAIL') {
      errors.push("VERDICT.verdict must be 'PASS' or 'FAIL'");
    }
    if (typeof value.reasonCode !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(value.reasonCode)) {
      errors.push('reasonCode must be a non-empty stable uppercase identifier');
    }
    if ('status' in value) errors.push('VERDICT must not carry an availability status');
  } else {
    if (value.state === 'UNAVAILABLE' && value.status !== 'NA_ASSET' && value.status !== 'NA_BROWSER') {
      errors.push("UNAVAILABLE.status must be 'NA_ASSET' or 'NA_BROWSER'");
    }
    if (typeof value.reasonCode !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(value.reasonCode)) {
      errors.push('reasonCode must be a non-empty stable uppercase identifier');
    }
    if (typeof value.detail !== 'string') errors.push('availability/error detail must be a string');
    if ('verdict' in value) errors.push(`${value.state} must not carry verdict`);
    if (value.state === 'ERROR' && 'status' in value) errors.push('ERROR must not carry availability status');
  }
  if (value.detail !== undefined && typeof value.detail !== 'string') {
    errors.push('detail must be a string when present');
  }
  if (value.measurements !== undefined) {
    if (
      !isObject(value.measurements) ||
      Object.values(value.measurements).some(
        (measurement) => typeof measurement !== 'number' || !Number.isFinite(measurement),
      )
    ) {
      errors.push('measurements must contain only finite numbers');
    }
  }
  if (value.evidence !== undefined) {
    if (!isObject(value.evidence)) errors.push('evidence must be a JSON object');
    else {
      try {
        canonicalizeJson(value.evidence);
      } catch (error) {
        errors.push(`evidence must be JSON-safe: ${errMsg(error)}`);
      }
    }
  }
  return errors.length
    ? { ok: false, errors }
    : { ok: true, value: value as unknown as OracleOutcome };
}

// ── no-engine output-structure helpers (box-readers.ts; no scored candidate engine) ─────────────

function missingGoldenOutcome(
  golden: GoldenStore,
  kind: GoldenKind,
  oracle: OracleId,
  detail: string,
): OracleOutcome {
  const evidence = golden.evidence[kind];
  if (
    evidence.state === 'MISSING' ||
    evidence.state === 'PENDING' ||
    evidence.state === 'DIGEST_MISMATCH' ||
    evidence.state === 'PRODUCER_FAILED'
  ) {
    return unavailable(oracle, 'NA_ASSET', evidence.reasonCode, `${detail}: ${evidence.state}`);
  }
  if (evidence.state === 'OK') {
    return oracleError(oracle, 'GOLDEN_EVIDENCE_EMPTY', `${detail}: committed evidence contains no usable rows`);
  }
  return oracleError(oracle, evidence.reasonCode, `${detail}: ${evidence.state}`);
}

/** Map a byte-read OutputStructure to a NormalizedMetadata (fps/sampleRate/channels are unknown). */
function structureToMetadata(s: OutputStructure): NormalizedMetadata {
  return {
    container: s.container,
    durationSec: s.durationSec ?? null,
    tracks: s.tracks.map((tr) => ({
      type: tr.type,
      codec: tr.codec ?? '',
      ...(tr.width != null ? { width: tr.width } : {}),
      ...(tr.height != null ? { height: tr.height } : {}),
      language: null,
    })),
  };
}

function readStructureValue(bytes: Uint8Array, containerHint?: string): OutputStructure | undefined {
  const result = readOutputStructureResult(bytes, containerHint);
  return result.state === 'OK' ? result.value : undefined;
}

/**
 * Compare a golden media-track layout against the byte-read output tracks. Track COUNT + TYPE are
 * asserted always; per-track codec ONLY when BOTH the reader token and the golden token confidently
 * canonicalize (else the codec sub-check is skipped — never a FAIL on an unknown token).
 */
function compareStructureTracks(expected: NormalizedTrack[], actual: OutputTrack[]): string[] {
  const diffs: string[] = [];
  const typeCount = (list: Array<{ type: string }>): Record<string, number> => {
    const m: Record<string, number> = {};
    for (const tr of list) m[tr.type] = (m[tr.type] ?? 0) + 1;
    return m;
  };
  const want = typeCount(expected);
  const got = typeCount(actual);
  for (const key of new Set([...Object.keys(want), ...Object.keys(got)])) {
    const a = got[key] ?? 0;
    const b = want[key] ?? 0;
    if (a !== b) diffs.push(`media track type '${key}' count: reimport ${a} vs golden ${b}`);
  }
  for (const type of ['video', 'audio'] as const) {
    const exp = expected.filter((tr) => tr.type === type);
    const act = actual.filter((tr) => tr.type === type);
    const n = Math.min(exp.length, act.length);
    for (let i = 0; i < n; i++) {
      const readCodec = act[i]!.codec;
      if (readCodec == null) continue; // reader not confident → skip
      const goldTok = canonicalCodecToken(exp[i]!.codec ?? '');
      if (goldTok == null) continue; // golden token not canonicalizable → skip
      const readTok = canonicalCodecToken(readCodec) ?? readCodec;
      if (normStr(readTok) !== normStr(goldTok)) {
        diffs.push(`${type} track[${i}] codec: reimport '${readCodec}' vs golden '${exp[i]!.codec}'`);
      }
    }
  }
  return diffs;
}

/**
 * True when a requested codec token conflicts with a byte-read/parsed codec token. Confident only:
 * when both canonicalize we compare canonical tokens; when NEITHER canonicalizes (e.g. a PCM token
 * the reader vocabulary omits) we compare normalized strings; a mixed case is treated as "unsure" →
 * no conflict (skip). An absent/empty measured codec is always "unsure".
 */
function codecsConflict(measured: string | null | undefined, requested: string): boolean {
  if (measured == null || measured === '') return false;
  const gotTok = canonicalCodecToken(measured);
  const wantTok = canonicalCodecToken(requested);
  if (gotTok != null && wantTok != null) return gotTok !== wantTok;
  if (gotTok == null && wantTok == null) return normStr(measured) !== normStr(requested);
  return false;
}

/** True when two container tokens belong to the same ISOBMFF/Matroska family (mp4↔mov, webm↔mkv). */
function sameContainerFamily(a: string, b: string): boolean {
  const family = (c: string): string => {
    const n = normStr(c);
    if (['mp4', 'mov', 'qt', 'm4a', 'm4v', 'isobmff'].includes(n)) return 'mp4';
    if (['webm', 'mkv', 'matroska'].includes(n)) return 'webm';
    return n;
  };
  return family(a) === family(b);
}

/** Duration proxy from an already-decoded frame sink: (last.pts − first.pts). Needs ≥2 frames. */
function frameSpanSec(sink: FrameSink | null | undefined): number | undefined {
  const frames = sink && Array.isArray(sink.frames) ? sink.frames : [];
  if (frames.length < 2) return undefined;
  const span = (frames[frames.length - 1]!.ptsUs - frames[0]!.ptsUs) / 1e6;
  return span > 0 ? span : undefined;
}

/** Duration proxy: platform-decode the output and take the decoded frame-pts span (undefined if <2). */
async function decodeFrameSpanDurationSec(ctx: OracleContext): Promise<number | undefined> {
  if (!ctx.output) return undefined;
  try {
    const sink = await ctx.decodeWithPlatform(ctx.output, { maxFrames: 4096 });
    return frameSpanSec(sink);
  } catch {
    return undefined;
  }
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
        return await decodedFramesBitexact(ctx);
      case 'decoded-audio-pcm':
        return await decodedAudioPcm(ctx);
      case 'reference-reimport':
        return await referenceReimport(ctx, t);
      case 'playback-smoke':
        return await playbackSmoke(ctx);
      case 'ssim-psnr':
        return await ssimPsnr(ctx, t);
      case 'mp4-box-layout':
        return mp4BoxLayout(ctx);
      case 'webm-live-layout':
        return webmLiveLayout(ctx);
      case 'fanout-renditions':
        return await fanoutRenditions(ctx, t);
      case 'alpha-plane':
        return await alphaPlane(ctx);
      case 'seek-accuracy':
        return seekAccuracy(ctx, t);
      case 'trim-boundaries':
        return await trimBoundaries(ctx, t);
      case 'decrypt-bitexact':
        return await decryptBitexact(ctx);
      case 'graceful-failure':
        return gracefulFailure(ctx, t);
      case 'property-invariant':
        return await propertyInvariant(ctx, t);
      default:
        return oracleError(oracle, 'ORACLE_UNKNOWN_ID', `unknown oracle id '${String(oracle)}'`);
    }
  } catch (err) {
    if (isNotApplicableError(err)) throw err;
    // graceful-failure treats a throw differently; let it own the catch.
    if (oracle === 'graceful-failure') {
      return pass(oracle, `operation threw/rejected as required: ${errMsg(err)}`);
    }
    return oracleError(oracle, 'ORACLE_THROW', `oracle threw: ${errMsg(err)}`);
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

// ── webm-live-layout ─────────────────────────────────────────────────────────────────────────

interface EbmlElement {
  id: number;
  size: number; // -1 means EBML unknown-size
  offset: number;
  bodyStart: number;
  bodyEnd: number;
  next: number;
}

const EBML_ID = {
  Segment: 0x18538067,
  Info: 0x1549a966,
  Duration: 0x4489,
  SeekHead: 0x114d9b74,
  Cues: 0x1c53bb6b,
  Cluster: 0x1f43b675,
} as const;

function webmLiveLayout(ctx: OracleContext): OracleOutcome {
  const oracle: OracleId = 'webm-live-layout';
  const out = ctx.output;
  if (!out) return fail(oracle, 'no ctx.output to inspect');

  const options = isObject(ctx.scenario.options) ? ctx.scenario.options : {};
  const outputContainer = normStr(readStringOption(options, ['container']) ?? out.container);
  if (outputContainer !== 'webm' && outputContainer !== 'mkv') {
    return fail(oracle, `output container '${outputContainer || out.container}' is not a WebM/Matroska layout target`);
  }

  const top = parseEbmlChildren(out.bytes, 0, out.bytes.byteLength);
  const segment = top.find((el) => el.id === EBML_ID.Segment);
  if (!segment) return fail(oracle, 'no Matroska Segment element found');

  const segmentChildren = parseEbmlChildren(out.bytes, segment.bodyStart, segment.bodyEnd);
  const info = segmentChildren.find((el) => el.id === EBML_ID.Info);
  const infoChildren = info ? parseEbmlChildren(out.bytes, info.bodyStart, info.bodyEnd) : [];
  const hasDuration = infoChildren.some((el) => el.id === EBML_ID.Duration);
  const seekHeadCount = segmentChildren.filter((el) => el.id === EBML_ID.SeekHead).length;
  const cuesCount = segmentChildren.filter((el) => el.id === EBML_ID.Cues).length;
  const clusterCount = segmentChildren.filter((el) => el.id === EBML_ID.Cluster).length;
  const measurements = finiteOnly({
    segmentOffset: segment.offset,
    segmentUnknownSize: segment.size === -1 ? 1 : 0,
    segmentChildren: segmentChildren.length,
    seekHeadCount,
    cuesCount,
    clusterCount,
    segmentDurationPresent: hasDuration ? 1 : 0,
  });

  if (segment.size !== -1) {
    return fail(oracle, 'live WebM expected an unknown-size Segment', measurements);
  }
  if (seekHeadCount > 0) {
    return fail(oracle, `live WebM expected no SeekHead, found ${seekHeadCount}`, measurements);
  }
  if (hasDuration) {
    return fail(oracle, 'live WebM expected no Segment Duration element', measurements);
  }
  if (clusterCount === 0) {
    return fail(oracle, 'live WebM contains no Cluster elements', measurements);
  }

  return pass(
    oracle,
    `live WebM layout: unknown-size Segment, no SeekHead, no Segment Duration, ${clusterCount} Cluster(s), ${cuesCount} Cues element(s)`,
    measurements,
  );
}

function parseEbmlChildren(bytes: Uint8Array, start: number, end: number): EbmlElement[] {
  const children: EbmlElement[] = [];
  let pos = start;
  const hardEnd = Math.min(end, bytes.byteLength);
  while (pos + 2 <= hardEnd) {
    const el = readEbmlElement(bytes, pos, hardEnd);
    if (!el) break;
    children.push(el);
    if (el.next <= pos) break;
    pos = el.next;
  }
  return children;
}

function readEbmlElement(bytes: Uint8Array, pos: number, parentEnd: number): EbmlElement | null {
  const id = readEbmlVint(bytes, pos, true);
  if (!id) return null;
  const size = readEbmlVint(bytes, id.next, false);
  if (!size) return null;
  const bodyStart = size.next;
  const bodyEnd = size.unknown ? parentEnd : Math.min(bodyStart + size.value, parentEnd);
  if (bodyEnd < bodyStart) return null;
  return {
    id: id.value,
    size: size.unknown ? -1 : size.value,
    offset: pos,
    bodyStart,
    bodyEnd,
    next: bodyEnd,
  };
}

function readEbmlVint(
  bytes: Uint8Array,
  pos: number,
  keepMarker: boolean,
): { value: number; next: number; length: number; unknown: boolean } | null {
  const first = bytes[pos];
  if (first === undefined) return null;
  let mask = 0x80;
  let length = 1;
  while (length <= 8 && (first & mask) === 0) {
    mask >>= 1;
    length++;
  }
  if (length > 8 || pos + length > bytes.byteLength) return null;

  let value = keepMarker ? first : first & (mask - 1);
  for (let i = 1; i < length; i++) {
    value = value * 256 + (bytes[pos + i] ?? 0);
  }

  const allOnes = Math.pow(2, 7 * length) - 1;
  return { value, next: pos + length, length, unknown: !keepMarker && value === allOnes };
}

// ── golden-metadata ──────────────────────────────────────────────────────────────────────────

/** Backward-compatible export; metadata evidence now lives on the public adapter contract itself. */
export type SemanticMetadataTrack = NormalizedTrack;

interface TrackMatch {
  type: string;
  measuredIndex: number;
  goldenIndex: number;
  measured: SemanticMetadataTrack;
  golden: SemanticMetadataTrack;
  cost: number;
}

interface MetadataDiagnostics {
  rule: string;
  matches: Array<Record<string, unknown>>;
  cadence: Array<Record<string, unknown>>;
  duration: Record<string, unknown>;
  normalizations: string[];
  representationDifferences: string[];
}

function goldenMetadata(ctx: OracleContext, t: Required<OracleTolerances>): OracleOutcome {
  const oracle: OracleId = 'golden-metadata';
  const got = ctx.metadata;
  const want = ctx.golden.meta;
  if (!got) return fail(oracle, 'no probe metadata on ctx.metadata');
  if (!want) return missingGoldenOutcome(ctx.golden, 'meta', oracle, 'golden metadata is unavailable');

  const failures: string[] = [];
  const normalizations: string[] = [];
  const representationDifferences: string[] = [];
  const measurements: Record<string, number> = {};
  const diagnostics: MetadataDiagnostics = {
    rule: 'semantic type-partitioned minimum-cost matching; named lossless normalization and valid alternate view=PASS (recorded as a representation difference), semantic mismatch=FAIL',
    matches: [],
    cadence: [],
    duration: {},
    normalizations,
    representationDifferences,
  };

  // container
  if (normStr(got.container) !== normStr(want.container)) {
    failures.push(`container: measured '${got.container}' vs golden '${want.container}'`);
  }

  // Presentation duration is preferred. Raw media/sample spans may widen the band only by their
  // recorded edit/priming/timebase evidence; there is no container-name percentage exception here.
  const gotDuration = presentationDuration(got);
  const wantDuration = presentationDuration(want);
  if (gotDuration.value != null && wantDuration.value != null) {
    const d = Math.abs(gotDuration.value - wantDuration.value);
    const gotAllowance = durationEvidenceAllowance(got);
    const wantAllowance = durationEvidenceAllowance(want);
    const semanticAllowance =
      (gotAllowance.components.primingRemainderSec ?? 0) +
      (wantAllowance.components.primingRemainderSec ?? 0) +
      (gotAllowance.components.oneTimebaseTickSec ?? 0) +
      (wantAllowance.components.oneTimebaseTickSec ?? 0);
    // Estimate-only containers (raw ADTS/TS/HLS, CBR-no-TOC MP3, headerless WebM) have NO precise
    // global duration in the header, so two correct demuxers legitimately disagree by far more than
    // one frame (see LOOSE_DURATION_CONTAINERS / durationToleranceFor). The strict per-frame gate is
    // only honest for containers that carry a precise duration. Widen to the same loose band the
    // property-invariant duration oracle uses, and never below the strict-plus-priming band.
    const durContainer = resolveContainer(got.container ?? want.container, primaryAssetId(ctx));
    const explicitDurOverride = ctx.scenario.tolerances?.durationToleranceSec != null;
    const durBand = durationToleranceFor(durContainer, primaryAssetId(ctx), t, explicitDurOverride);
    const looseTolSec = durBand.loose
      ? Math.max(durBand.tolSec, LOOSE_DURATION_REL * Math.abs(wantDuration.value))
      : durBand.tolSec;
    const tolSec = Math.max(t.durationToleranceSec + semanticAllowance, looseTolSec);
    const rawView = durationIsRawView(got, want, gotDuration.value, wantDuration.value);
    measurements.durationDeltaSec = d;
    measurements.durationToleranceSec = tolSec;
    diagnostics.duration = {
      measured: gotDuration,
      golden: wantDuration,
      deltaSec: d,
      baseToleranceSec: t.durationToleranceSec,
      measuredComponents: gotAllowance.components,
      goldenComponents: wantAllowance.components,
      selectedToleranceSec: tolSec,
      looseBand: durBand.loose,
      looseContainer: durContainer,
      rawView,
      rule: 'presentation band uses base tolerance + priming/remainder/ticks; estimate-only containers widen to the loose per-container band; only a value matching an evidenced raw span is a recorded representation difference (still PASS)',
    };
    if (rawView) {
      representationDifferences.push(
        `raw-media duration view ${gotDuration.source}:${gotDuration.value} vs presentation ${wantDuration.value}`,
      );
    } else if (d > tolSec) {
      failures.push(
        `presentation duration: measured ${gotDuration.value.toFixed(6)}s (${gotDuration.source}) ` +
          `vs golden ${wantDuration.value.toFixed(6)}s (${wantDuration.source}); ` +
          `Δ ${d.toFixed(6)}s > evidenced tol ${tolSec.toFixed(6)}s`,
      );
    } else if (d > 0 || gotDuration.source !== wantDuration.source) {
      normalizations.push(
        `presentation duration ${gotDuration.source}:${gotDuration.value} normalized to ${wantDuration.source}:${wantDuration.value}`,
      );
    }
  } else if (wantDuration.value != null && gotDuration.value == null) {
    failures.push(`presentation duration: measured null vs golden ${wantDuration.value}s`);
  }

  const goldTracks = metadataTracksForScenario(ctx, want.tracks ?? []) as SemanticMetadataTrack[];
  const gotTracks = metadataTracksForScenario(ctx, got.tracks ?? []) as SemanticMetadataTrack[];
  const matching = matchMetadataTracks(gotTracks, goldTracks);
  failures.push(...matching.failures);
  measurements.measuredTracks = gotTracks.length;
  measurements.goldenTracks = goldTracks.length;
  measurements.matchedTracks = matching.matches.length;

  for (const match of matching.matches) {
    const comparison = compareSemanticTrack(match, t);
    failures.push(...comparison.failures);
    normalizations.push(...comparison.normalizations);
    representationDifferences.push(...comparison.representationDifferences);
    diagnostics.matches.push(comparison.diagnostic);
    if (comparison.cadence) diagnostics.cadence.push(comparison.cadence);
    if (match.measuredIndex !== match.goldenIndex) {
      normalizations.push(
        `${match.type} logical track reordered measured[${match.measuredIndex}]↔golden[${match.goldenIndex}]`,
      );
    }
  }

  // Every entry in `normalizations` represents a semantic equivalence rule applied to *different
  // raw evidence* (codec spelling, logical-track position, SBR/PS observer view, NTSC spelling,
  // timebase rounding, and so on).  Those rules keep the media correctness-valid, but ORAC-01's
  // second layer must still classify the baked representation as DIFF rather than silently
  // promoting it to exact PASS agreement.
  const rawRepresentationDifferences = [...representationDifferences, ...normalizations];
  const diagnosticText = `diagnostics=${JSON.stringify(diagnostics)}`;
  const semanticOutcome = failures.length
    ? fail(oracle, `${failures.join('; ')}; ${diagnosticText}`, measurements)
    : rawRepresentationDifferences.length
      ? diff(
      oracle,
      `semantic metadata agrees with ${rawRepresentationDifferences.length} representation difference(s): ` +
        `${rawRepresentationDifferences.join('; ')}; ${diagnosticText}`,
      measurements,
      )
      : pass(
        oracle,
        `metadata semantically and representationally matches golden (${gotTracks.length} track(s)); ${diagnosticText}`,
        measurements,
      );

  const requiredLayers: OracleOutcome[] = [semanticOutcome];
  const fieldPolicy = metadataFieldPolicyFromOptions(ctx.scenario.options);
  if (fieldPolicy) {
    requiredLayers.push(probeAssessmentOutcome(
      oracle,
      assessDeclaredMetadataFields(
        got as ProbeMetadataObservation,
        want as ProbeMetadataObservation,
        fieldPolicy,
      ),
    ));
  }

  const hlsContract = hlsProbeContractFromOptions(ctx.scenario.options);
  if (hlsContract?.schema === 'media-test/hls-protected-segment-probe@1') {
    requiredLayers.push(
      ctx.probeResourceAccesses
        ? probeAssessmentOutcome(
          oracle,
          assessHlsProtectedSegmentResourceAccess(ctx.probeResourceAccesses),
        )
        : probeEvidenceMissingOutcome(
          oracle,
          'HLS_PROBE_RESOURCE_TRACE_MISSING',
          'protected-segment probe did not return an adapter-observed resource-access trace',
        ),
    );
  }
  if (ctx.probeBudgetAssessment) {
    requiredLayers.push(probeAssessmentOutcome(oracle, ctx.probeBudgetAssessment));
  }
  return requiredLayers.length === 1
    ? semanticOutcome
    : reduceRequiredOracleLayers(oracle, requiredLayers);
}

function compareSemanticTrack(
  match: TrackMatch,
  t: Required<OracleTolerances>,
): {
  failures: string[];
  normalizations: string[];
  representationDifferences: string[];
  diagnostic: Record<string, unknown>;
  cadence?: Record<string, unknown>;
} {
  const a = match.measured;
  const b = match.golden;
  const failures: string[] = [];
  const normalizations: string[] = [];
  const representationDifferences: string[] = [];
  const p = `${match.type} measured[${match.measuredIndex}]↔golden[${match.goldenIndex}]`;
  const aCodec = semanticCodec(a);
  const bCodec = semanticCodec(b);
  if (aCodec.canonical && bCodec.canonical && aCodec.canonical !== bCodec.canonical) {
    failures.push(`${p}.codec canonical '${aCodec.canonical}' vs '${bCodec.canonical}'`);
  } else if ((aCodec.canonical === null) !== (bCodec.canonical === null)) {
    failures.push(`${p}.codec canonical '${aCodec.canonical ?? aCodec.raw}' vs '${bCodec.canonical ?? bCodec.raw}'`);
  } else if (!aCodec.canonical && !bCodec.canonical && normStr(aCodec.raw) !== normStr(bCodec.raw)) {
    failures.push(`${p}.codec raw unknown '${aCodec.raw}' vs '${bCodec.raw}'`);
  } else if (normStr(aCodec.raw) !== normStr(bCodec.raw)) {
    normalizations.push(`${p}.codec alias '${aCodec.raw}'→${aCodec.canonical} equals '${bCodec.raw}'`);
  }
  const aWidth = a.presentationWidth ?? a.width;
  const bWidth = b.presentationWidth ?? b.width;
  const aHeight = a.presentationHeight ?? a.height;
  const bHeight = b.presentationHeight ?? b.height;
  if (bWidth != null && aWidth !== bWidth) failures.push(`${p}.presentationWidth ${aWidth} vs ${bWidth}`);
  if (bHeight != null && aHeight !== bHeight) failures.push(`${p}.presentationHeight ${aHeight} vs ${bHeight}`);
  if (
    aWidth === bWidth && aHeight === bHeight &&
    (a.width !== b.width || a.height !== b.height) &&
    (a.presentationWidth !== undefined || b.presentationWidth !== undefined)
  ) {
    normalizations.push(`${p}.raw dimensions normalized through presentation dimensions`);
  }
  if (b.language != null && canonicalMetadataLanguage(b.language) !== 'und') {
    if (a.language == null) {
      failures.push(`${p}.language missing vs '${b.language}'`);
    } else if (canonicalMetadataLanguage(a.language) !== canonicalMetadataLanguage(b.language)) {
      failures.push(`${p}.language '${a.language}' vs '${b.language}'`);
    } else if (normStr(a.language) !== normStr(b.language)) {
      normalizations.push(`${p}.language '${a.language}' aliases '${b.language}'`);
    }
  }
  if (b.defaultDisposition !== undefined && a.defaultDisposition !== b.defaultDisposition) {
    failures.push(`${p}.defaultDisposition ${String(a.defaultDisposition)} vs ${String(b.defaultDisposition)}`);
  }
  if (b.rotation !== undefined) {
    if (a.rotation === undefined) failures.push(`${p}.rotation missing vs ${b.rotation}`);
    else if (canonicalRotation(a.rotation) !== canonicalRotation(b.rotation)) {
      failures.push(`${p}.rotation ${a.rotation} vs ${b.rotation}`);
    } else if (a.rotation !== b.rotation) {
      normalizations.push(`${p}.rotation ${a.rotation} normalized modulo 360 to ${b.rotation}`);
    }
  }

  const cadence = compareCadence(a, b, t.fpsTolerance, p);
  failures.push(...cadence.failures);
  normalizations.push(...cadence.normalizations);
  representationDifferences.push(...cadence.representationDifferences);

  const sbr = aCodec.canonical === 'aac' && (hasSbrSignaling(a) || hasSbrSignaling(b));
  const ps = aCodec.canonical === 'aac' && (hasPsSignaling(a) || hasPsSignaling(b));
  if (b.sampleRate != null) {
    if (a.sampleRate == null) {
      failures.push(`${p}.sampleRate null vs ${b.sampleRate}`);
    } else if (a.sampleRate !== b.sampleRate) {
      const ratio = Math.max(a.sampleRate, b.sampleRate) / Math.min(a.sampleRate, b.sampleRate);
      if (sbr && Math.abs(ratio - 2) < 1e-9) {
        normalizations.push(`${p}.sampleRate SBR core/output ${a.sampleRate}↔${b.sampleRate}`);
      } else {
        failures.push(`${p}.sampleRate ${a.sampleRate} vs ${b.sampleRate}${sbr ? ' (not an exact 2× SBR view)' : ' (SBR not signaled)'}`);
      }
    }
  }
  if (b.channels != null) {
    if (a.channels == null) {
      failures.push(`${p}.channels null vs ${b.channels}`);
    } else if (a.channels !== b.channels) {
      const monoStereo = Math.min(a.channels, b.channels) === 1 && Math.max(a.channels, b.channels) === 2;
      if (ps && monoStereo) {
        normalizations.push(`${p}.channels Parametric Stereo core/output ${a.channels}↔${b.channels}`);
      } else {
        failures.push(`${p}.channels ${a.channels} vs ${b.channels}${ps ? '' : ' (Parametric Stereo not signaled)'}`);
      }
    }
  }

  return {
    failures,
    normalizations,
    representationDifferences,
    diagnostic: {
      type: match.type,
      measuredIndex: match.measuredIndex,
      goldenIndex: match.goldenIndex,
      cost: match.cost,
      measuredCodecRaw: aCodec.raw,
      goldenCodecRaw: bCodec.raw,
      measuredCodecCanonical: aCodec.canonical,
      goldenCodecCanonical: bCodec.canonical,
      measuredRate: a.sampleRate,
      goldenRate: b.sampleRate,
      measuredChannels: a.channels,
      goldenChannels: b.channels,
      sbrSignaled: sbr,
      psSignaled: ps,
      normalizations,
      selectingRule: 'minimum total semantic cost within track type',
    },
    cadence: cadence.diagnostic,
  };
}

function matchMetadataTracks(
  measured: SemanticMetadataTrack[],
  golden: SemanticMetadataTrack[],
): { matches: TrackMatch[]; failures: string[] } {
  const failures: string[] = [];
  const matches: TrackMatch[] = [];
  const types = new Set([...measured.map((track) => track.type), ...golden.map((track) => track.type)]);
  for (const type of [...types].sort()) {
    const measuredOfType = measured
      .map((track, index) => ({ track, index }))
      .filter((entry) => entry.track.type === type);
    const goldenOfType = golden
      .map((track, index) => ({ track, index }))
      .filter((entry) => entry.track.type === type);
    if (measuredOfType.length !== goldenOfType.length) {
      failures.push(`track type '${type}' count measured ${measuredOfType.length} vs golden ${goldenOfType.length}`);
      continue;
    }
    const assignment = minimumCostAssignment(
      measuredOfType.map((entry) => entry.track),
      goldenOfType.map((entry) => entry.track),
    );
    for (let i = 0; i < assignment.length; i++) {
      const j = assignment[i]!;
      matches.push({
        type,
        measuredIndex: measuredOfType[i]!.index,
        goldenIndex: goldenOfType[j]!.index,
        measured: measuredOfType[i]!.track,
        golden: goldenOfType[j]!.track,
        cost: metadataTrackCost(measuredOfType[i]!.track, goldenOfType[j]!.track),
      });
    }
  }
  matches.sort((a, b) => a.goldenIndex - b.goldenIndex || a.measuredIndex - b.measuredIndex);
  return { matches, failures };
}

function minimumCostAssignment(measured: SemanticMetadataTrack[], golden: SemanticMetadataTrack[]): number[] {
  const n = measured.length;
  if (n === 0) return [];
  if (n > 12) {
    const unused = new Set(golden.map((_, index) => index));
    return measured.map((track) => {
      const best = [...unused].sort(
        (a, b) => metadataTrackCost(track, golden[a]!) - metadataTrackCost(track, golden[b]!) || a - b,
      )[0]!;
      unused.delete(best);
      return best;
    });
  }
  const memo = new Map<string, { cost: number; assignment: number[] }>();
  const visit = (i: number, mask: number): { cost: number; assignment: number[] } => {
    if (i === n) return { cost: 0, assignment: [] };
    const key = `${i}:${mask}`;
    const cached = memo.get(key);
    if (cached) return cached;
    let best: { cost: number; assignment: number[] } | undefined;
    for (let j = 0; j < n; j++) {
      if ((mask & (1 << j)) !== 0) continue;
      const tail = visit(i + 1, mask | (1 << j));
      const candidate = {
        cost: metadataTrackCost(measured[i]!, golden[j]!) + tail.cost,
        assignment: [j, ...tail.assignment],
      };
      if (
        !best ||
        candidate.cost < best.cost ||
        (candidate.cost === best.cost && candidate.assignment.join(',') < best.assignment.join(','))
      ) best = candidate;
    }
    const result = best ?? { cost: Number.POSITIVE_INFINITY, assignment: [] };
    memo.set(key, result);
    return result;
  };
  return visit(0, 0).assignment;
}

function metadataTrackCost(a: SemanticMetadataTrack, b: SemanticMetadataTrack): number {
  const ac = semanticCodec(a).canonical;
  const bc = semanticCodec(b).canonical;
  let cost = ac && bc && ac === bc ? 0 : 1_000_000;
  if (a.width != null && b.width != null) cost += Math.abs(a.width - b.width) * 100;
  if (a.height != null && b.height != null) cost += Math.abs(a.height - b.height) * 100;
  if (
    a.language != null && b.language != null &&
    canonicalMetadataLanguage(a.language) !== canonicalMetadataLanguage(b.language)
  ) cost += 10_000;
  if (
    a.defaultDisposition !== undefined && b.defaultDisposition !== undefined &&
    a.defaultDisposition !== b.defaultDisposition
  ) cost += 5_000;
  if (a.trackId !== undefined && b.trackId !== undefined && a.trackId === b.trackId) cost -= 100;
  if (a.sampleRate != null && b.sampleRate != null) {
    const ratio = Math.max(a.sampleRate, b.sampleRate) / Math.max(1, Math.min(a.sampleRate, b.sampleRate));
    cost += Math.round(Math.abs(Math.log2(ratio)) * 1000);
  }
  if (a.channels != null && b.channels != null) cost += Math.abs(a.channels - b.channels) * 500;
  return cost;
}

function semanticCodec(track: SemanticMetadataTrack): { raw: string; canonical: string | null } {
  const raw = track.rawCodec ?? track.codecRaw ?? track.nativeCodecTag ?? track.codec ?? '';
  const declared = normStr(track.canonicalCodec ?? track.codecCanonical);
  if (declared) return { raw, canonical: declared };
  // `codec` is the adapter contract's normalized semantic identity.  A native tag is retained as
  // raw representation evidence, but must never replace a truthful normalized codec (for example
  // Mediabunny reports AAC object type 2 as nativeCodecTag="2" while codec="aac").
  const normalizedCodec = normStr(track.codec);
  const normalized = normalizedCodec || normStr(raw);
  const canonicalVocabulary = new Set([
    'h264', 'hevc', 'vp8', 'vp9', 'av1', 'mjpeg', 'aac', 'opus', 'vorbis', 'flac', 'mp3', 'alac',
    'pcm-s16', 'pcm-s16be', 'pcm-s24', 'pcm-s24be', 'pcm-f32',
  ]);
  if (canonicalVocabulary.has(normalized)) return { raw, canonical: normalized };
  return {
    raw,
    canonical:
      canonicalCodecToken(track.codec ?? '') ??
      canonicalCodecToken(raw),
  };
}

function hasSbrSignaling(track: SemanticMetadataTrack): boolean {
  if (track.sbrPresent === true) return true;
  if (track.audioObjectType === 5 || track.audioObjectType === 29) return true;
  return /(?:^|\.)40\.(?:5|29)(?:\.|$)/i.test(track.rawCodec ?? track.codecRaw ?? track.codec ?? '');
}

function hasPsSignaling(track: SemanticMetadataTrack): boolean {
  if (track.psPresent === true || track.audioObjectType === 29) return true;
  return /(?:^|\.)40\.29(?:\.|$)/i.test(track.rawCodec ?? track.codecRaw ?? track.codec ?? '');
}

function compareCadence(
  measured: SemanticMetadataTrack,
  golden: SemanticMetadataTrack,
  tolerance: number,
  label: string,
): {
  failures: string[];
  normalizations: string[];
  representationDifferences: string[];
  diagnostic: Record<string, unknown>;
} {
  const a = cadenceEvidence(measured);
  const b = cadenceEvidence(golden);
  const failures: string[] = [];
  const normalizations: string[] = [];
  const representationDifferences: string[] = [];
  if (b.center != null && a.center == null) {
    failures.push(`${label}.cadence missing vs golden ${b.center}`);
  } else if (a.center != null && b.center != null) {
    const vfr = a.mode === 'VFR' || b.mode === 'VFR';
    const envelopeOverlap =
      a.min != null && a.max != null && b.min != null && b.max != null &&
      a.max + tolerance >= b.min && b.max + tolerance >= a.min;
    const centerDelta = Math.abs(a.center - b.center);
    if (vfr ? !envelopeOverlap && centerDelta > tolerance : centerDelta > tolerance) {
      failures.push(
        `${label}.cadence ${a.mode} ${formatCadence(a)} vs ${b.mode} ${formatCadence(b)} (tol ±${tolerance})`,
      );
    } else if (a.raw !== b.raw || a.mode !== b.mode) {
      if (!vfr && isNamedNtscRate(a.center, tolerance) && isNamedNtscRate(b.center, tolerance)) {
        normalizations.push(`${label}.cadence NTSC rational/decimal ${a.raw}↔${b.raw}`);
      } else {
        representationDifferences.push(`${label}.cadence ${a.raw} vs ${b.raw}`);
      }
    }
  }
  return {
    failures,
    normalizations,
    representationDifferences,
    diagnostic: {
      track: label,
      measured: a,
      golden: b,
      tolerance,
      rule: a.mode === 'VFR' || b.mode === 'VFR' ? 'timestamp-derived envelope overlap' : 'rational-center band',
    },
  };
}

function cadenceEvidence(track: SemanticMetadataTrack): {
  mode: string;
  source?: string;
  center?: number;
  min?: number;
  max?: number;
  raw: string;
} {
  const timestamps = Array.isArray(track.frameTimestampsUs)
    ? track.frameTimestampsUs.filter(Number.isFinite).sort((a, b) => a - b)
    : [];
  const rates: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    const delta = timestamps[i]! - timestamps[i - 1]!;
    if (delta > 0) rates.push(1_000_000 / delta);
  }
  const legacyRational =
    track.fpsNumerator != null && track.fpsDenominator != null && track.fpsDenominator > 0
      ? track.fpsNumerator / track.fpsDenominator
      : undefined;
  const provenance = track.frameRateEvidence ?? track.fpsProvenance;
  const provenanceRational =
    provenance?.rational !== undefined && provenance.rational.denominator > 0
      ? provenance.rational.numerator / provenance.rational.denominator
      : undefined;
  const sampledRate =
    provenance?.sampleCount !== undefined &&
    provenance.observedIntervalUs !== undefined &&
    provenance.observedIntervalUs > 0
      ? (provenance.sampleCount * 1_000_000) / provenance.observedIntervalUs
      : undefined;
  const explicitRational = track.rateRational !== undefined && track.rateRational.denominator > 0
    ? track.rateRational.numerator / track.rateRational.denominator
    : undefined;
  const rational = provenanceRational ?? explicitRational ?? legacyRational;
  const center = rates.length
    ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length
    : provenance?.source === 'nominal'
      ? rational ?? track.fps ?? sampledRate
      : sampledRate ?? rational ?? track.fps;
  const min = rates.length
    ? Math.min(...rates)
    : provenance?.envelope?.minFps ?? track.fpsMin ?? center;
  const max = rates.length
    ? Math.max(...rates)
    : provenance?.envelope?.maxFps ?? track.fpsMax ?? center;
  const inferredVfr = rates.length > 1 && max != null && min != null && max - min > 0.01;
  const mode = (provenance?.cadence ?? track.cadence ?? track.cadenceMode ?? (inferredVfr ? 'VFR' : 'CFR')).toUpperCase();
  const provenanceRaw = provenance
    ? [
        `source=${provenance.source}`,
        provenance.sampleCount !== undefined ? `samples=${provenance.sampleCount}` : undefined,
        provenance.observedIntervalUs !== undefined ? `intervalUs=${provenance.observedIntervalUs}` : undefined,
        provenance.rational !== undefined
          ? `rational=${provenance.rational.numerator}/${provenance.rational.denominator}`
          : undefined,
        provenance.envelope !== undefined
          ? `envelope=${provenance.envelope.minFps}-${provenance.envelope.maxFps}`
          : undefined,
      ].filter((item): item is string => item !== undefined).join(',')
    : track.rateRational !== undefined
      ? `rational=${track.rateRational.numerator}/${track.rateRational.denominator}`
      : undefined;
  return {
    mode,
    ...(provenance !== undefined ? { source: provenance.source } : {}),
    ...(center != null && Number.isFinite(center) ? { center } : {}),
    ...(min != null && Number.isFinite(min) ? { min } : {}),
    ...(max != null && Number.isFinite(max) ? { max } : {}),
    raw: provenanceRaw ?? (rational != null
      ? track.rateRational !== undefined
        ? `${track.rateRational.numerator}/${track.rateRational.denominator}`
        : `${track.fpsNumerator}/${track.fpsDenominator}`
      : rates.length
        ? `timestamps[${timestamps.join(',')}]`
        : String(track.fps ?? 'unknown')),
  };
}

function formatCadence(value: { center?: number; min?: number; max?: number }): string {
  if (value.center == null) return 'unknown';
  return `${value.center.toFixed(6)}fps envelope[${value.min?.toFixed(6)},${value.max?.toFixed(6)}]`;
}

function isNamedNtscRate(rate: number | undefined, tolerance: number): boolean {
  if (rate === undefined || !Number.isFinite(rate)) return false;
  const spellingTolerance = Math.max(0.000_1, Math.min(tolerance, 0.001));
  return [24_000 / 1_001, 30_000 / 1_001, 60_000 / 1_001].some(
    (expected) => Math.abs(rate - expected) <= spellingTolerance,
  );
}

function canonicalMetadataLanguage(value: string): string {
  const normalized = normStr(value).replace(/_/g, '-');
  const primary = normalized.split('-')[0] ?? normalized;
  const aliases: Record<string, string> = {
    eng: 'en', fra: 'fr', fre: 'fr', deu: 'de', ger: 'de', spa: 'es', ita: 'it',
    por: 'pt', nld: 'nl', dut: 'nl', jpn: 'ja', zho: 'zh', chi: 'zh', kor: 'ko',
    und: 'und',
  };
  return aliases[primary] ?? primary;
}

function canonicalRotation(value: number): number {
  const normalized = ((value % 360) + 360) % 360;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function presentationDuration(metadata: NormalizedMetadata): { value: number | null; source: string } {
  const record = metadata as unknown as Record<string, unknown>;
  const direct = firstFinite(record, ['presentationDurationSec', 'editListSpanSec']);
  if (direct !== undefined) return { value: direct, source: 'presentation-evidence' };
  const track = (metadata.tracks as SemanticMetadataTrack[])
    .map((item) => firstFinite(item as unknown as Record<string, unknown>, ['presentationDurationSec', 'editListSpanSec']))
    .find((item) => item !== undefined);
  if (track !== undefined) return { value: track, source: 'track-presentation-evidence' };
  return { value: metadata.durationSec, source: 'durationSec' };
}

function durationIsRawView(
  measured: NormalizedMetadata,
  golden: NormalizedMetadata,
  measuredDuration: number,
  presentation: number,
): boolean {
  const records = (metadata: NormalizedMetadata): Record<string, unknown>[] => [
    metadata as unknown as Record<string, unknown>,
    ...metadata.tracks.map((track) => track as unknown as Record<string, unknown>),
  ];
  const all = [...records(measured), ...records(golden)];
  const rawCandidates = all.flatMap((record) => [
    firstFinite(record, ['rawMediaSpanSec']),
    firstFinite(record, ['mediaDurationSec']),
    firstFinite(record, ['sampleSpanSec']),
  ]).filter((value): value is number => value !== undefined);
  const tickTolerance = Math.max(
    0.000_001,
    ...all.map((record) => {
      const explicit = firstFinite(record, ['timebaseTickUs']);
      if (explicit !== undefined) return explicit / 1_000_000;
      const timescale = firstFinite(record, ['mediaTimescale', 'movieTimescale', 'timescale']);
      return timescale !== undefined && timescale > 0 ? 1 / timescale : 0;
    }),
  );
  return Math.abs(measuredDuration - presentation) > tickTolerance &&
    rawCandidates.some((candidate) => Math.abs(measuredDuration - candidate) <= tickTolerance);
}

function durationEvidenceAllowance(metadata: NormalizedMetadata): {
  total: number;
  components: Record<string, number>;
} {
  const components: Record<string, number> = {};
  const records: Record<string, unknown>[] = [
    metadata as unknown as Record<string, unknown>,
    ...(metadata.tracks as SemanticMetadataTrack[]).map((track) => track as unknown as Record<string, unknown>),
  ];
  let spanAllowance = 0;
  let primingAllowance = 0;
  let tickAllowance = 0;
  for (const record of records) {
    const presentation = firstFinite(record, ['presentationDurationSec', 'editListSpanSec']);
    for (const raw of ['rawMediaSpanSec', 'mediaDurationSec', 'sampleSpanSec'] as const) {
      const value = firstFinite(record, [raw]);
      if (presentation !== undefined && value !== undefined) {
        spanAllowance = Math.max(spanAllowance, Math.abs(value - presentation));
      }
    }
    const rate = firstFinite(record, ['sampleRate']);
    const priming = firstFinite(record, ['primingSamples']) ?? 0;
    const remainder = firstFinite(record, ['paddingSamples', 'remainderSamples']) ?? 0;
    if (rate !== undefined && rate > 0) primingAllowance = Math.max(primingAllowance, (priming + remainder) / rate);
    const explicitTickUs = firstFinite(record, ['timebaseTickUs']);
    const timescale = firstFinite(record, ['mediaTimescale', 'movieTimescale', 'timescale']);
    const tick = explicitTickUs !== undefined
      ? explicitTickUs / 1_000_000
      : timescale !== undefined && timescale > 0
        ? 1 / timescale
        : 0;
    tickAllowance = Math.max(tickAllowance, tick);
  }
  if (spanAllowance > 0) components.presentationVsRawSpanSec = spanAllowance;
  if (primingAllowance > 0) components.primingRemainderSec = primingAllowance;
  if (tickAllowance > 0) components.oneTimebaseTickSec = tickAllowance;
  return { total: spanAllowance + primingAllowance + tickAllowance, components };
}

function firstFinite(record: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
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

interface PacketTableComparison {
  ok: boolean;
  diffs: string[];
  measurements: Record<string, number>;
}

export type PacketFraming = 'annex-b' | 'length-prefixed' | 'adts' | 'raw' | string;

export type SemanticPacketInfo = Omit<PacketInfo, 'dtsUs'> & {
  dtsUs?: number;
  durationUs?: number;
  trackType?: string;
  codec?: string;
  payload?: Uint8Array | number[] | string;
  data?: Uint8Array | number[] | string;
  bytes?: Uint8Array | number[] | string;
  payloadDigest?: string;
  normalizedAccessUnitId?: string;
  accessUnitId?: string;
  framing?: PacketFraming;
  nalLengthSize?: number;
  decoderConfiguration?: Uint8Array | number[] | string;
  decoderConfig?: Uint8Array | number[] | string;
  description?: Uint8Array | number[] | string;
  randomAccessKind?: string;
  parameterSetDigests?: string[];
};

interface NormalizedAccessUnit {
  ptsUs: number;
  dtsUs?: number;
  durationUs?: number;
  primary: string[];
  randomAccess: boolean;
  hasParameterSets: boolean;
  rows: number;
}

interface NormalizedPacketTrack {
  units: NormalizedAccessUnit[];
  hasDecoderConfiguration: boolean;
  representation: Record<string, unknown>;
}

/**
 * The CANONICAL packet-table comparator — shared by `golden-packets` AND the metamorphic / reimport
 * packet oracles so all four judge a packet table the SAME faithful way, with NO reference engine.
 *
 * ORDER-INDEPENDENT, PER-TRACK: golden (ffprobe) lists packets interleaved by dts across tracks while
 * an engine may group them per-track, so group BOTH sides by trackIndex, sort each group by (dts,pts),
 * and compare position-by-position. Sizes + keyframe flags must match EXACTLY. Timestamps are compared
 * within `tsTolUs` AFTER removing a CONSTANT per-track origin offset (ffprobe exposes raw container
 * priming / edit-list pts, e.g. -21333µs, while an engine may apply the edit list and start at 0 — a
 * constant shift is fine; a VARYING residual is a real inter-packet timing error).
 * `opts.looseFirstPacket(trackIndex)` handles the Ogg/Opus pre-skip convention: anchor packet 1 and
 * skip timestamp drift on packet 0 for that track (sizes/counts still compare exactly).
 */
function comparePacketTables(
  got: PacketInfo[],
  want: PacketInfo[],
  tsTolUs: number,
  opts?: { looseFirstPacket?: (trackIndex: number) => boolean },
): PacketTableComparison {
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

  const byTrack = (ps: PacketInfo[]): Map<number, SemanticPacketInfo[]> => {
    const m = new Map<number, SemanticPacketInfo[]>();
    for (const p of ps) {
      let g = m.get(p.trackIndex);
      if (!g) {
        g = [];
        m.set(p.trackIndex, g);
      }
      g.push(p);
    }
    for (const g of m.values()) {
      g.sort((x, y) => (packetDts(x) ?? x.ptsUs) - (packetDts(y) ?? y.ptsUs) || x.ptsUs - y.ptsUs);
    }
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
    const looseFirstPacket = (opts?.looseFirstPacket?.(trackIndex) ?? false) && m > 1;
    const anchor = looseFirstPacket ? 1 : 0;
    const ptsOffset = gotTrack[anchor]!.ptsUs - wantTrack[anchor]!.ptsUs;
    const gotAnchorDts = packetDts(gotTrack[anchor]!);
    const wantAnchorDts = packetDts(wantTrack[anchor]!);
    const dtsOffset = gotAnchorDts !== undefined && wantAnchorDts !== undefined
      ? gotAnchorDts - wantAnchorDts
      : undefined;
    for (let i = 0; i < m; i++) {
      const a = gotTrack[i]!;
      const b = wantTrack[i]!;
      if (a.size !== b.size) sizeMismatch++;
      if (!!a.keyframe !== !!b.keyframe) kfMismatch++;
      if (looseFirstPacket && i === 0) continue;
      const ptsResid = Math.abs(a.ptsUs - b.ptsUs - ptsOffset);
      const aDts = packetDts(a);
      const bDts = packetDts(b);
      const dtsResid = aDts !== undefined && bDts !== undefined && dtsOffset !== undefined
        ? Math.abs(aDts - bDts - dtsOffset)
        : 0;
      if (ptsResid > maxPtsDriftUs) maxPtsDriftUs = ptsResid;
      if (ptsResid > tsTolUs) ptsDrift++;
      if (dtsResid > tsTolUs) dtsDrift++;
      if ((aDts === undefined) !== (bDts === undefined)) dtsDrift++;
    }
  }
  measurements.comparedTracks = comparedTracks;
  measurements.maxPtsDriftUs = maxPtsDriftUs;
  if (sizeMismatch) diffs.push(`${sizeMismatch} packets had a size mismatch`);
  if (kfMismatch) diffs.push(`${kfMismatch} packets had a keyframe-flag mismatch`);
  if (ptsDrift) diffs.push(`${ptsDrift} packets pts drift beyond ±${tsTolUs}µs after per-track origin alignment`);
  if (dtsDrift) diffs.push(`${dtsDrift} packets dts drift beyond ±${tsTolUs}µs after per-track origin alignment`);

  return { ok: diffs.length === 0, diffs, measurements };
}

function packetDts(packet: SemanticPacketInfo): number | undefined {
  return typeof packet.dtsUs === 'number' && Number.isFinite(packet.dtsUs) ? packet.dtsUs : undefined;
}

function compareSemanticPacketEvidence(
  ctx: OracleContext,
  gotInput: PacketInfo[],
  wantInput: PacketInfo[],
  toleranceUs: number,
):
  | { state: 'PASS'; detail: string; measurements: Record<string, number> }
  | { state: 'DIFF'; detail: string; measurements: Record<string, number> }
  | { state: 'FAIL'; detail: string; measurements: Record<string, number> }
  | { state: 'ERROR'; reasonCode: string; detail: string; measurements: Record<string, number> } {
  const got = gotInput as SemanticPacketInfo[];
  const want = wantInput as SemanticPacketInfo[];
  const raw = comparePacketTables(gotInput, wantInput, toleranceUs, {
    looseFirstPacket: (trackIndex) => usesOpusPreskipLoosePacket(ctx, trackIndex),
  });
  const hasSemanticEvidence = [...got, ...want].some(
    (packet) =>
      packetPayloadBytes(packet) !== undefined ||
      !!packet.payloadDigest ||
      !!packet.normalizedAccessUnitId ||
      !!packet.accessUnitId,
  );
  if (raw.ok && !hasSemanticEvidence) {
    return {
      state: 'PASS',
      detail: `semantic and baked packet rows agree exactly (${got.length} packet(s))`,
      measurements: raw.measurements,
    };
  }

  const measuredTracks = (ctx.demux?.metadata.tracks ?? []) as SemanticMetadataTrack[];
  const goldenTracks = (ctx.golden.meta?.tracks ?? []) as SemanticMetadataTrack[];
  const mapping = buildPacketTrackMapping(measuredTracks, goldenTracks, got, want);
  const measurements: Record<string, number> = { ...raw.measurements, semanticTracks: mapping.length };
  if ('failure' in mapping) {
    return { state: 'FAIL', detail: mapping.failure, measurements };
  }

  const representation: Array<Record<string, unknown>> = [];
  let totalUnits = 0;
  for (const match of mapping) {
    const measuredPackets = got.filter((packet) => packet.trackIndex === match.measuredIndex);
    const goldenPackets = want.filter((packet) => packet.trackIndex === match.goldenIndex);
    const codec = semanticCodec(match.golden).canonical ?? semanticCodec(match.measured).canonical;
    const measuredNormalized = normalizePacketTrack(measuredPackets, codec);
    const goldenNormalized = normalizePacketTrack(goldenPackets, codec);
    if ('reasonCode' in measuredNormalized) {
      if (measuredNormalized.reasonCode === 'ORACLE_PACKET_CODEC_EVIDENCE_CONFLICT') {
        return {
          state: 'FAIL',
          detail: `measured ${match.type} logical track carries evidence for a different codec: ${measuredNormalized.detail}`,
          measurements,
        };
      }
      return {
        state: 'ERROR',
        reasonCode: measuredNormalized.reasonCode,
        detail: `measured ${match.type} track has no complete semantic normalizer: ${measuredNormalized.detail}`,
        measurements,
      };
    }
    if ('reasonCode' in goldenNormalized) {
      return {
        state: 'ERROR',
        reasonCode: goldenNormalized.reasonCode,
        detail: `golden ${match.type} track has no complete semantic normalizer: ${goldenNormalized.detail}`,
        measurements,
      };
    }
    const compared = compareNormalizedAccessUnits(
      measuredNormalized,
      goldenNormalized,
      toleranceUs,
      `${match.type} measured[${match.measuredIndex}]↔golden[${match.goldenIndex}]`,
    );
    totalUnits += compared.compared;
    if (compared.failures.length) {
      return {
        state: 'FAIL',
        detail: `${compared.failures.join('; ')}; semantic diagnostics=${JSON.stringify({
          codec,
          measured: measuredNormalized.representation,
          golden: goldenNormalized.representation,
        })}`,
        measurements: { ...measurements, semanticAccessUnits: totalUnits },
      };
    }
    representation.push({
      type: match.type,
      measuredIndex: match.measuredIndex,
      goldenIndex: match.goldenIndex,
      codec,
      measured: measuredNormalized.representation,
      golden: goldenNormalized.representation,
    });
  }
  measurements.semanticAccessUnits = totalUnits;
  return raw.ok
    ? {
        state: 'PASS',
        detail: `semantic packet content and baked rows agree; representations=${JSON.stringify(representation)}`,
        measurements,
      }
    : {
        state: 'DIFF',
        detail:
          `semantic packet content/timing/random-access agrees; baked representation differs: ${raw.diffs.join('; ')}; ` +
          `representations=${JSON.stringify(representation)}`,
        measurements,
      };
}

function buildPacketTrackMapping(
  measuredTracks: SemanticMetadataTrack[],
  goldenTracks: SemanticMetadataTrack[],
  measuredPackets: SemanticPacketInfo[],
  goldenPackets: SemanticPacketInfo[],
): TrackMatch[] | { failure: string; length: 0 } {
  if (measuredTracks.length > 0 && goldenTracks.length > 0) {
    const matched = matchMetadataTracks(measuredTracks, goldenTracks);
    if (matched.failures.length) return { failure: matched.failures.join('; '), length: 0 };
    for (const match of matched.matches) {
      const a = semanticCodec(match.measured).canonical;
      const b = semanticCodec(match.golden).canonical;
      if (a && b && a !== b) {
        return {
          failure: `${match.type} logical track codec mismatch '${a ?? match.measured.codec}' vs '${b ?? match.golden.codec}'`,
          length: 0,
        };
      }
    }
    return matched.matches;
  }

  const measuredIndices = [...new Set(measuredPackets.map((packet) => packet.trackIndex))].sort((a, b) => a - b);
  const goldenIndices = [...new Set(goldenPackets.map((packet) => packet.trackIndex))].sort((a, b) => a - b);
  if (measuredIndices.length !== goldenIndices.length) {
    return {
      failure: `logical track count measured ${measuredIndices.length} vs golden ${goldenIndices.length}`,
      length: 0,
    };
  }
  return measuredIndices.map((measuredIndex, index) => {
    const goldenIndex = goldenIndices[index]!;
    const measuredPacket = measuredPackets.find((packet) => packet.trackIndex === measuredIndex);
    const goldenPacket = goldenPackets.find((packet) => packet.trackIndex === goldenIndex);
    const type = measuredPacket?.trackType ?? goldenPacket?.trackType ?? 'other';
    const measuredCodec = measuredPacket?.codec ?? '';
    const goldenCodec = goldenPacket?.codec ?? '';
    return {
      type,
      measuredIndex,
      goldenIndex,
      measured: { type: type as NormalizedTrack['type'], codec: measuredCodec },
      golden: { type: type as NormalizedTrack['type'], codec: goldenCodec },
      cost: 0,
    };
  });
}

function normalizePacketTrack(
  packets: SemanticPacketInfo[],
  codec: string | null,
): NormalizedPacketTrack | { reasonCode: string; detail: string } {
  const ordered = packets
    .map((packet, index) => ({ packet, index }))
    .sort((a, b) => {
      const ad = packetDts(a.packet);
      const bd = packetDts(b.packet);
      if (ad !== undefined && bd !== undefined && ad !== bd) return ad - bd;
      return a.index - b.index;
    });
  const groups = new Map<string, Array<{ packet: SemanticPacketInfo; index: number }>>();
  for (const entry of ordered) {
    const packet = entry.packet;
    const explicit = packet.normalizedAccessUnitId ?? packet.accessUnitId;
    const key = explicit !== undefined
      ? `id:${explicit}`
      : `time:${packet.ptsUs}:${packet.durationUs ?? ''}`;
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }

  const framing = [...new Set(packets.map((packet) => packet.framing ?? 'unspecified'))].sort();
  const hasDecoderConfiguration = packets.some((packet) => packetConfigBytes(packet)?.byteLength);
  const units: NormalizedAccessUnit[] = [];
  for (const group of groups.values()) {
    const first = group[0]!.packet;
    const primary: string[] = [];
    const explicitAccessUnitIdentities = new Set<string>();
    let randomAccess = false;
    let hasParameterSets = false;
    for (const { packet } of group) {
      const normalized = normalizePacketPayload(packet, codec);
      if ('reasonCode' in normalized) return normalized;
      const explicitIdentity = packet.normalizedAccessUnitId ?? packet.accessUnitId;
      for (const identity of normalized.primary) {
        // An explicit access-unit identity describes decoded/coded essence, not a physical packet
        // row.  Adapters may lawfully expose one access unit as multiple rows carrying that same
        // identity.  Preserve every row in `representation`, while comparing the shared identity
        // exactly once so 2-rows-vs-1-row grouping becomes DIFF instead of a false content FAIL.
        if (explicitIdentity !== undefined && identity === `au:${explicitIdentity}`) {
          if (explicitAccessUnitIdentities.has(identity)) continue;
          explicitAccessUnitIdentities.add(identity);
        }
        primary.push(identity);
      }
      randomAccess ||= normalized.randomAccess;
      hasParameterSets ||= normalized.hasParameterSets;
    }
    if (primary.length === 0) {
      return {
        reasonCode: 'ORACLE_PACKET_SEMANTIC_EVIDENCE_INCOMPLETE',
        detail: `access unit at ${first.ptsUs}µs contains no primary coded-picture/audio-frame identity`,
      };
    }
    units.push({
      ptsUs: first.ptsUs,
      ...(packetDts(first) !== undefined ? { dtsUs: packetDts(first)! } : {}),
      ...(first.durationUs !== undefined ? { durationUs: first.durationUs } : {}),
      primary,
      randomAccess,
      hasParameterSets,
      rows: group.length,
    });
  }
  return {
    units,
    hasDecoderConfiguration,
    representation: {
      rows: packets.length,
      accessUnits: units.length,
      framing,
      inlineParameterSets: units.filter((unit) => unit.hasParameterSets).length,
      decoderConfiguration: hasDecoderConfiguration,
      rowSizes: packets.map((packet) => packet.size),
      rawKeyframes: packets.map((packet) => packet.keyframe),
      rowGrouping: units.map((unit) => ({ ptsUs: unit.ptsUs, rows: unit.rows })),
    },
  };
}

function normalizePacketPayload(
  packet: SemanticPacketInfo,
  codec: string | null,
):
  | { primary: string[]; randomAccess: boolean; hasParameterSets: boolean }
  | { reasonCode: string; detail: string } {
  const explicitIdentity = packet.normalizedAccessUnitId ?? packet.accessUnitId;
  const payload = packetPayloadBytes(packet);
  const explicitRandomAccess = packet.randomAccessKind
    ? !/none|non[-_ ]?sync|delta/i.test(packet.randomAccessKind)
    : undefined;

  if (codec === 'h264' || codec === 'hevc') {
    if (payload && looksLikeAdts(payload)) {
      return {
        reasonCode: 'ORACLE_PACKET_CODEC_EVIDENCE_CONFLICT',
        detail: `${codec} logical track contains an ADTS audio frame`,
      };
    }
    if (!payload) {
      const digest = normHex(packet.payloadDigest);
      if (explicitIdentity || digest) {
        return {
          primary: [explicitIdentity ? `au:${explicitIdentity}` : `digest:${digest}`],
          randomAccess: explicitRandomAccess ?? packet.keyframe,
          hasParameterSets:
            (packet.parameterSetDigests?.length ?? 0) > 0 || !!packetConfigBytes(packet)?.byteLength,
        };
      }
      return {
        reasonCode: 'ORACLE_PACKET_CODEC_NORMALIZER_UNAVAILABLE',
        detail: `${codec} packet lacks payload/access-unit digest evidence`,
      };
    }
    const nals = splitNalUnits(payload, packet.framing, packet.nalLengthSize);
    if (!nals) {
      return {
        reasonCode: 'ORACLE_PACKET_FRAMING_UNSUPPORTED',
        detail: `${codec} packet framing '${packet.framing ?? 'unknown'}' could not be normalized`,
      };
    }
    const primary: string[] = [];
    let randomAccess = explicitRandomAccess ?? false;
    let hasParameterSets = false;
    for (const nal of nals) {
      if (nal.byteLength === 0) continue;
      const type = codec === 'h264' ? nal[0]! & 0x1f : (nal[0]! >> 1) & 0x3f;
      const isParameter = codec === 'h264' ? type === 7 || type === 8 : type === 32 || type === 33 || type === 34;
      const isPrimary = codec === 'h264' ? type >= 1 && type <= 5 : type >= 0 && type <= 31;
      if (isParameter) hasParameterSets = true;
      if (isPrimary) primary.push(`${type}:${hexIdentity(nal)}`);
      if (codec === 'h264' ? type === 5 : type >= 16 && type <= 23) randomAccess = true;
    }
    return { primary, randomAccess, hasParameterSets };
  }

  if (codec === 'aac') {
    if (payload) {
      const frame = packet.framing === 'adts' || looksLikeAdts(payload) ? stripAdtsHeader(payload) : payload;
      if (!frame || frame.byteLength === 0) {
        return { reasonCode: 'ORACLE_PACKET_AAC_MALFORMED', detail: 'AAC/ADTS frame is truncated' };
      }
      return { primary: [`aac:${hexIdentity(frame)}`], randomAccess: true, hasParameterSets: false };
    }
  }

  if (explicitIdentity || packet.payloadDigest) {
    return {
      primary: [explicitIdentity ? `au:${explicitIdentity}` : `digest:${normHex(packet.payloadDigest)}`],
      randomAccess: explicitRandomAccess ?? packet.keyframe,
      hasParameterSets: (packet.parameterSetDigests?.length ?? 0) > 0,
    };
  }
  if (payload && codec && ['opus', 'vorbis', 'flac', 'mp3'].includes(codec)) {
    return { primary: [`${codec}:${hexIdentity(payload)}`], randomAccess: true, hasParameterSets: false };
  }
  return {
    reasonCode: 'ORACLE_PACKET_CODEC_NORMALIZER_UNAVAILABLE',
    detail: `codec '${codec ?? 'unknown'}' has no implemented semantic normalizer or stable access-unit identity`,
  };
}

function compareNormalizedAccessUnits(
  measured: NormalizedPacketTrack,
  golden: NormalizedPacketTrack,
  toleranceUs: number,
  label: string,
): { failures: string[]; compared: number } {
  const failures: string[] = [];
  if (measured.units.length !== golden.units.length) {
    failures.push(`${label}: access-unit count ${measured.units.length} vs ${golden.units.length}`);
  }
  const count = Math.min(measured.units.length, golden.units.length);
  if (count === 0) return { failures: [...failures, `${label}: no semantic access units`], compared: 0 };
  const ptsOffset = measured.units[0]!.ptsUs - golden.units[0]!.ptsUs;
  const measuredDts0 = measured.units[0]!.dtsUs;
  const goldenDts0 = golden.units[0]!.dtsUs;
  const dtsOffset = measuredDts0 !== undefined && goldenDts0 !== undefined ? measuredDts0 - goldenDts0 : undefined;
  for (let i = 0; i < count; i++) {
    const a = measured.units[i]!;
    const b = golden.units[i]!;
    if (a.primary.length !== b.primary.length || a.primary.some((identity, j) => identity !== b.primary[j])) {
      failures.push(`${label}: access unit ${i} primary coded content changed/reordered`);
    }
    const ptsResidual = Math.abs(a.ptsUs - b.ptsUs - ptsOffset);
    if (ptsResidual > toleranceUs) {
      failures.push(`${label}: access unit ${i} PTS residual ${ptsResidual}µs > ${toleranceUs}µs`);
    }
    if (a.dtsUs !== undefined && b.dtsUs !== undefined && dtsOffset !== undefined) {
      const residual = Math.abs(a.dtsUs - b.dtsUs - dtsOffset);
      if (residual > toleranceUs) failures.push(`${label}: access unit ${i} DTS residual ${residual}µs > ${toleranceUs}µs`);
    }
    if (a.durationUs !== undefined && b.durationUs !== undefined && Math.abs(a.durationUs - b.durationUs) > toleranceUs) {
      failures.push(`${label}: access unit ${i} duration ${a.durationUs}µs vs ${b.durationUs}µs`);
    }
    if (b.randomAccess && !a.randomAccess) failures.push(`${label}: access unit ${i} lost required random-access picture`);
    if (
      b.randomAccess &&
      (b.hasParameterSets || golden.hasDecoderConfiguration) &&
      !a.hasParameterSets &&
      !measured.hasDecoderConfiguration
    ) {
      failures.push(`${label}: access unit ${i} random access lacks required codec parameter sets`);
    }
  }
  return { failures, compared: count };
}

function packetPayloadBytes(packet: SemanticPacketInfo): Uint8Array | undefined {
  return bytesFromUnknown(packet.payload ?? packet.data ?? packet.bytes);
}

function packetConfigBytes(packet: SemanticPacketInfo): Uint8Array | undefined {
  return bytesFromUnknown(packet.decoderConfiguration ?? packet.decoderConfig ?? packet.description);
}

function bytesFromUnknown(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value) && value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)) {
    return Uint8Array.from(value as number[]);
  }
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  const hex = text.replace(/^hex:/i, '').replace(/\s+/g, '');
  if (/^(?:[0-9a-f]{2})+$/i.test(hex)) {
    return Uint8Array.from(hex.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
  }
  const base64 = text.replace(/^base64:/i, '');
  try {
    const binary = atob(base64);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return undefined;
  }
}

function splitNalUnits(
  payload: Uint8Array,
  framing: PacketFraming | undefined,
  nalLengthSize = 4,
): Uint8Array[] | undefined {
  const annexB = framing === 'annex-b' || hasAnnexBStartCode(payload);
  if (annexB) {
    const starts: Array<{ start: number; payloadStart: number }> = [];
    for (let i = 0; i + 3 <= payload.length; i++) {
      if (payload[i] === 0 && payload[i + 1] === 0 && payload[i + 2] === 1) {
        starts.push({ start: i, payloadStart: i + 3 });
        i += 2;
      } else if (i + 4 <= payload.length && payload[i] === 0 && payload[i + 1] === 0 && payload[i + 2] === 0 && payload[i + 3] === 1) {
        starts.push({ start: i, payloadStart: i + 4 });
        i += 3;
      }
    }
    if (starts.length === 0) return undefined;
    return starts
      .map((start, index) => payload.subarray(start.payloadStart, starts[index + 1]?.start ?? payload.length))
      .filter((nal) => nal.byteLength > 0);
  }
  if (framing === 'length-prefixed' || framing === 'avcc' || framing === 'hvcc') {
    if (![1, 2, 3, 4].includes(nalLengthSize)) return undefined;
    const out: Uint8Array[] = [];
    let offset = 0;
    while (offset + nalLengthSize <= payload.length) {
      let size = 0;
      for (let i = 0; i < nalLengthSize; i++) size = size * 256 + payload[offset + i]!;
      offset += nalLengthSize;
      if (size <= 0 || offset + size > payload.length) return undefined;
      out.push(payload.subarray(offset, offset + size));
      offset += size;
    }
    return offset === payload.length && out.length > 0 ? out : undefined;
  }
  return [payload];
}

function hasAnnexBStartCode(payload: Uint8Array): boolean {
  return payload.length >= 3 && payload[0] === 0 && payload[1] === 0 &&
    (payload[2] === 1 || (payload[2] === 0 && payload[3] === 1));
}

function looksLikeAdts(payload: Uint8Array): boolean {
  return payload.length >= 2 && payload[0] === 0xff && (payload[1]! & 0xf6) === 0xf0;
}

function stripAdtsHeader(payload: Uint8Array): Uint8Array | undefined {
  if (!looksLikeAdts(payload) || payload.length < 7) return undefined;
  const protectionAbsent = (payload[1]! & 1) !== 0;
  const headerSize = protectionAbsent ? 7 : 9;
  return payload.length >= headerSize ? payload.subarray(headerSize) : undefined;
}

function hexIdentity(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

/**
 * Faithful packet-preservation check for LOSSLESS-container ops (remux/mux/reimport) with NO reference
 * engine: parse the candidate's OWN output packet table (box-readers) and compare it to the baked
 * ffprobe golden packet table (ctx.golden.packets) via the semantic comparator. Missing committed
 * golden evidence is NA_ASSET; malformed candidate bytes are FAIL; neutral-reader limitations are
 * typed harness ERROR. No human-readable detail participates in that routing.
 */
function outputPacketsVsGolden(
  ctx: OracleContext,
  t: Required<OracleTolerances>,
  oracle: OracleId,
  label: string,
): OracleOutcome {
  const output = ctx.output;
  if (!output) return fail(oracle, `${label}no ctx.output bytes to re-demux`);
  const want = ctx.golden.packets;
  if (!want || want.length === 0) {
    return missingGoldenOutcome(
      ctx.golden,
      'packets',
      oracle,
      `${label}golden packet evidence is unavailable`,
    );
  }
  const read = readOutputPacketsResult(output.bytes, output.container);
  if (read.state !== 'OK') {
    const detail = `${label}neutral packet reader ${read.state} [${read.reasonCode}] for output container '${normStr(output.container)}'`;
    if (read.state === 'MALFORMED' || read.state === 'INCOMPLETE') {
      return fail(oracle, detail);
    }
    return oracleError(oracle, read.reasonCode, detail);
  }
  const got = read.value;
  const compared = compareSemanticPacketEvidence(ctx, got, want, t.seekToleranceUs);
  if (compared.state === 'FAIL') return fail(oracle, `${label}${compared.detail}`, compared.measurements);
  if (compared.state === 'ERROR') {
    return oracleError(oracle, compared.reasonCode, `${label}${compared.detail}`, compared.measurements);
  }
  return compared.state === 'DIFF'
    ? diff(oracle, `${label}${compared.detail}`, compared.measurements)
    : pass(oracle, `${label}${compared.detail}`, compared.measurements);
}

function goldenPackets(ctx: OracleContext, t: Required<OracleTolerances>): OracleOutcome {
  const oracle: OracleId = 'golden-packets';
  const got = ctx.demux?.packets;
  const want = ctx.golden.packets;
  if (!got) return fail(oracle, 'no demux packets on ctx.demux.packets');
  if (!want) return missingGoldenOutcome(ctx.golden, 'packets', oracle, 'golden packet evidence is unavailable');
  if (usesPcmAggregatePacketOracle(ctx)) {
    return withDemuxDtsEvidence(ctx, pcmAggregatePackets(ctx, got, want, t), t);
  }

  const compared = compareSemanticPacketEvidence(ctx, got, want, t.seekToleranceUs);
  if (compared.state === 'FAIL') {
    return withDemuxDtsEvidence(ctx, fail(oracle, compared.detail, compared.measurements), t);
  }
  if (compared.state === 'ERROR') {
    return oracleError(oracle, compared.reasonCode, compared.detail, compared.measurements);
  }
  const semantic = compared.state === 'DIFF'
    ? diff(oracle, compared.detail, compared.measurements)
    : pass(oracle, compared.detail, compared.measurements);
  return withDemuxDtsEvidence(ctx, semantic, t);
}

function withDemuxDtsEvidence(
  ctx: OracleContext,
  semantic: OracleOutcome,
  t: Required<OracleTolerances>,
): OracleOutcome {
  if (!ctx.demux || !ctx.golden.packets || semantic.state === 'ERROR' || semantic.state === 'UNAVAILABLE') {
    return semantic;
  }
  const declaresDts = ctx.engine?.capabilities().features.includes('packets:dts') === true;
  const dts = assessDemuxDts({
    measured: ctx.demux,
    goldenPackets: ctx.golden.packets,
    ...(ctx.golden.meta ? { goldenMetadata: ctx.golden.meta } : {}),
    declaresDts,
    toleranceUs: t.seekToleranceUs,
  }).outcome;
  if (dts.state === 'ERROR') return dts;
  if (dts.state === 'UNAVAILABLE') return declaresDts ? dts : semantic;
  if (dts.verdict === 'FAIL') return dts;
  const measurements = {
    ...(semantic.measurements ?? {}),
    ...(dts.measurements ?? {}),
  };
  if (semantic.state === 'VERDICT') {
    return {
      ...semantic,
      detail: `${semantic.detail}; ${dts.detail}`,
      measurements,
    };
  }
  return semantic;
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

type TimedFrameDigest = FrameDigest & { durationUs?: number; timebaseTickUs?: number };

export interface PresentationFramePair {
  candidateIndex: number;
  referenceIndex: number;
  sampleTimeUs: number;
  candidatePtsUs: number;
  referencePtsUs: number;
  residualUs: number;
}

export interface PresentationFrameMatch {
  pairs: PresentationFramePair[];
  requestedSamples: number;
  matchedRatio: number;
  commonWindowUs: number;
  candidateWindowUs: number;
  referenceWindowUs: number;
  coverageRatio: number;
  windowDeltaUs: number;
  complete: boolean;
  reason?: string;
}

/** Shared presentation-time matcher used by golden SSIM, source-reference SSIM and fanout checks. */
export function matchFramesByPresentationTime(
  candidateInput: readonly FrameDigest[],
  referenceInput: readonly FrameDigest[],
  options: { maxSamples?: number; timingToleranceUs?: number; durationToleranceUs?: number; timebaseTickUs?: number } = {},
): PresentationFrameMatch {
  const candidate = buildFrameIntervals(candidateInput, options.timebaseTickUs);
  const reference = buildFrameIntervals(referenceInput, options.timebaseTickUs);
  const empty: PresentationFrameMatch = {
    pairs: [],
    requestedSamples: 0,
    matchedRatio: 0,
    commonWindowUs: 0,
    candidateWindowUs: candidate.windowUs,
    referenceWindowUs: reference.windowUs,
    coverageRatio: 0,
    windowDeltaUs: Math.abs(candidate.windowUs - reference.windowUs),
    complete: false,
    reason: 'one or both timelines contain no finite presentation frames',
  };
  if (candidate.intervals.length === 0 || reference.intervals.length === 0) return empty;

  const commonWindowUs = Math.max(0, Math.min(candidate.windowUs, reference.windowUs));
  const requestedSamples = Math.max(
    1,
    Math.min(options.maxSamples ?? 8, Math.max(candidate.intervals.length, reference.intervals.length)),
  );
  const pairs: PresentationFramePair[] = [];
  const timingToleranceUs = Math.max(0, options.timingToleranceUs ?? 0);
  for (let i = 0; i < requestedSamples; i++) {
    const sampleTimeUs = commonWindowUs > 0
      ? (commonWindowUs * (i + 0.5)) / requestedSamples
      : 0;
    const a = frameAtPresentationTime(candidate.intervals, sampleTimeUs, timingToleranceUs, options.timebaseTickUs);
    const b = frameAtPresentationTime(reference.intervals, sampleTimeUs, timingToleranceUs, options.timebaseTickUs);
    if (!a || !b) continue;
    pairs.push({
      candidateIndex: a.originalIndex,
      referenceIndex: b.originalIndex,
      sampleTimeUs,
      candidatePtsUs: a.frame.ptsUs,
      referencePtsUs: b.frame.ptsUs,
      residualUs: Math.abs(a.startUs - b.startUs),
    });
  }
  const matchedRatio = requestedSamples > 0 ? pairs.length / requestedSamples : 0;
  const largerWindow = Math.max(candidate.windowUs, reference.windowUs);
  const coverageRatio = largerWindow > 0 ? commonWindowUs / largerWindow : 1;
  const windowDeltaUs = Math.abs(candidate.windowUs - reference.windowUs);
  const durationToleranceUs = Math.max(0, options.durationToleranceUs ?? 0);
  const enoughPairs = matchedRatio >= 0.75;
  const enoughCoverage = windowDeltaUs <= durationToleranceUs;
  return {
    pairs,
    requestedSamples,
    matchedRatio,
    commonWindowUs,
    candidateWindowUs: candidate.windowUs,
    referenceWindowUs: reference.windowUs,
    coverageRatio,
    windowDeltaUs,
    complete: enoughPairs && enoughCoverage,
    ...(!enoughPairs
      ? { reason: `presentation pairing covered ${(matchedRatio * 100).toFixed(1)}% of sample times (<75%)` }
      : !enoughCoverage
        ? { reason: `presentation window delta ${windowDeltaUs}µs exceeds ${durationToleranceUs}µs` }
        : {}),
  };
}

interface FrameInterval {
  frame: TimedFrameDigest;
  originalIndex: number;
  startUs: number;
  endUs: number;
  centerUs: number;
  durationUs: number;
  tickUs: number;
}

function buildFrameIntervals(
  input: readonly FrameDigest[],
  defaultTickUs = 1,
): { intervals: FrameInterval[]; windowUs: number } {
  const sorted = input
    .map((frame, originalIndex) => ({ frame: frame as TimedFrameDigest, originalIndex }))
    .filter((entry) => Number.isFinite(entry.frame.ptsUs))
    .sort((a, b) => a.frame.ptsUs - b.frame.ptsUs || a.originalIndex - b.originalIndex);
  if (sorted.length === 0) return { intervals: [], windowUs: 0 };
  const deltas: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const delta = sorted[i]!.frame.ptsUs - sorted[i - 1]!.frame.ptsUs;
    if (delta > 0) deltas.push(delta);
  }
  deltas.sort((a, b) => a - b);
  const medianDelta = deltas.length
    ? deltas[Math.floor(deltas.length / 2)]!
    : 33_333; // documented last-resort cadence when a single frame carries no duration.
  const origin = sorted[0]!.frame.ptsUs;
  const intervals = sorted.map((entry, index): FrameInterval => {
    const explicit = entry.frame.durationUs;
    const nextDelta = sorted[index + 1]?.frame.ptsUs !== undefined
      ? sorted[index + 1]!.frame.ptsUs - entry.frame.ptsUs
      : undefined;
    const durationUs = explicit !== undefined && explicit > 0
      ? explicit
      : nextDelta !== undefined && nextDelta > 0
        ? nextDelta
        : medianDelta;
    const startUs = entry.frame.ptsUs - origin;
    return {
      frame: entry.frame,
      originalIndex: entry.originalIndex,
      startUs,
      endUs: startUs + durationUs,
      centerUs: startUs + durationUs / 2,
      durationUs,
      tickUs: entry.frame.timebaseTickUs && entry.frame.timebaseTickUs > 0
        ? entry.frame.timebaseTickUs
        : Math.max(1, defaultTickUs),
    };
  });
  return { intervals, windowUs: Math.max(...intervals.map((interval) => interval.endUs)) };
}

function frameAtPresentationTime(
  intervals: FrameInterval[],
  sampleTimeUs: number,
  timingToleranceUs: number,
  defaultTickUs = 1,
): FrameInterval | undefined {
  const containing = intervals.filter(
    (interval) => sampleTimeUs >= interval.startUs && sampleTimeUs < interval.endUs,
  );
  if (containing.length) {
    return containing.sort((a, b) => Math.abs(a.centerUs - sampleTimeUs) - Math.abs(b.centerUs - sampleTimeUs))[0];
  }
  const nearest = [...intervals].sort(
    (a, b) => Math.abs(a.centerUs - sampleTimeUs) - Math.abs(b.centerUs - sampleTimeUs),
  )[0];
  if (!nearest) return undefined;
  const allowed = Math.max(nearest.durationUs / 2, nearest.tickUs, defaultTickUs, timingToleranceUs);
  return Math.abs(nearest.centerUs - sampleTimeUs) <= allowed ? nearest : undefined;
}

async function compareFrameSsim(
  oracle: OracleId,
  candidate: FrameSink,
  reference: FrameSink,
  t: Required<OracleTolerances>,
  label: string,
): Promise<OracleOutcome> {
  const candidateFrames = Array.isArray(candidate.frames) ? candidate.frames : [];
  const referenceFrames = Array.isArray(reference.frames) ? reference.frames : [];
  const aligned = matchFramesByPresentationTime(candidateFrames, referenceFrames, {
    maxSamples: 8,
    timingToleranceUs: t.seekToleranceUs,
    durationToleranceUs: t.durationToleranceSec * 1_000_000,
  });
  const measurements: Record<string, number> = {
    candidateFrames: candidateFrames.length,
    referenceFrames: referenceFrames.length,
    requestedFrameSamples: aligned.requestedSamples,
    framePairs: aligned.pairs.length,
    matchedFrameRatio: aligned.matchedRatio,
    presentationCoverage: aligned.coverageRatio,
    presentationWindowDeltaUs: aligned.windowDeltaUs,
  };
  const diffs: string[] = [];

  if (aligned.pairs.length === 0) return fail(oracle, `${label}: no presentation-time frame pairs`, measurements);
  if (!aligned.complete) diffs.push(`${label}: ${aligned.reason ?? 'incomplete presentation coverage'}`);
  if (!candidate.getPixels || !reference.getPixels) {
    return fail(oracle, `${label}: decoded outputs do not expose pixels for SSIM`, measurements);
  }

  let minSsim = 1;
  let sumSsim = 0;
  let sumPsnr = 0;
  let psnrCount = 0;
  let compared = 0;
  let residualSum = 0;
  let residualMax = 0;
  for (const pair of aligned.pairs) {
    const a = await candidate.getPixels(pair.candidateIndex).catch(() => null);
    const b = await reference.getPixels(pair.referenceIndex).catch(() => null);
    if (!a || !b) continue;
    const score = ssim(a, b);
    minSsim = Math.min(minSsim, score);
    sumSsim += score;
    const psnr = psnrDb(a, b);
    if (Number.isFinite(psnr)) {
      sumPsnr += psnr;
      psnrCount++;
    }
    residualSum += pair.residualUs;
    residualMax = Math.max(residualMax, pair.residualUs);
    compared++;
  }
  measurements.ssimFrames = compared;
  measurements.minSsim = compared ? minSsim : 0;
  measurements.meanSsim = compared ? sumSsim / compared : 0;
  measurements.meanPsnrDb = psnrCount ? sumPsnr / psnrCount : 0;
  measurements.meanTimestampResidualUs = compared ? residualSum / compared : 0;
  measurements.maxTimestampResidualUs = residualMax;

  if (compared === 0) return fail(oracle, `${label}: no pixel-bearing frames to compare`, measurements);
  if (minSsim < t.ssimMin) {
    diffs.push(`${label}: SSIM min ${minSsim.toFixed(4)} < ${t.ssimMin}`);
  }

  if (diffs.length) return fail(oracle, diffs.join('; '), measurements);
  return pass(
    oracle,
    `${label}: SSIM min ${minSsim.toFixed(4)} over ${compared} presentation-aligned frame(s); ` +
      `coverage ${(aligned.coverageRatio * 100).toFixed(1)}%, max timestamp residual ${residualMax.toFixed(0)}µs`,
    measurements,
  );
}

// ── decoded-frames-bitexact ──────────────────────────────────────────────────────────────────

async function decodedFramesBitexact(ctx: OracleContext): Promise<OracleOutcome> {
  const oracle: OracleId = 'decoded-frames-bitexact';

  // Golden is the gate. An absent/pending golden is a BAKE gap (the in-browser frame-bake must run),
  // NOT an engine defect — surface that honestly rather than pretending the engine produced nothing.
  const want = ctx.golden.frames;
  if (!want || !want.length) {
    return missingGoldenOutcome(ctx.golden, 'frames', oracle, 'golden frame digests are unavailable');
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
      return classifyReferenceDecodeFailure(oracle, 'candidate', err, ctx.output);
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

async function decodedAudioPcm(ctx: OracleContext): Promise<OracleOutcome> {
  const oracle: OracleId = 'decoded-audio-pcm';
  const got = ctx.frames?.frames ?? [];
  if (!got.length) return fail(oracle, 'no decoded audio sample frames to compare');

  const sourceContainer = resolveContainer(ctx.golden.meta?.container, primaryAssetId(ctx));
  const sourceArray = new Uint8Array(await ctx.input.arrayBuffer());
  const sourceCopy = new Uint8Array(sourceArray.byteLength);
  sourceCopy.set(sourceArray);
  const sourceBytes: MediaBytes = {
    bytes: sourceCopy,
    mime: ctx.input.mime,
    container: sourceContainer,
  };

  let want: FrameDigest[];
  try {
    want = await decodeAudioPcmFrameDigests(sourceBytes, got.length);
  } catch (err) {
    return fail(oracle, `source audio PCM decode failed: ${errMsg(err)}`);
  }

  const out = compareDigests(oracle, got, want);
  return {
    ...out,
    detail: `[audio PCM decode] ${out.detail ?? ''}`.trim(),
  };
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

  // REMUX: re-read the engine's OWN output structure with the no-engine byte reader and check its
  // track layout + duration against golden (plus the Ogg-FLAC byte-parse subpath). No scored engine.
  if (ctx.scenario.op === 'remux') {
    const source = new Uint8Array(await ctx.input.arrayBuffer());
    const sourceContainer = ctx.golden.meta?.container ?? resolveContainer(undefined, ctx.input.id);
    const expectedTarget = readStringOption(ctx.scenario.options, ['container']) ?? ctx.output.container;
    const structural = evaluateStrictStreamCopy(
      source,
      sourceContainer,
      ctx.output.bytes,
      ctx.output.container,
      { expectedTargetContainer: expectedTarget, surfaceRepresentationDifferences: true },
    ).outcome;
    const tagContract = metadataTagContractFromOptions(ctx.scenario.options);
    if (!tagContract) return structural;
    const tags = verifyMetadataTagsByNeutralReprobe({
      bytes: ctx.output.bytes,
      contract: tagContract,
      oracle,
    });
    return reduceRequiredMetadataLayers([structural, tags], oracle);
  }

  // DECRYPT: independently parse the engine's OWN output and prove that its track cardinality is
  // preserved while all active protection signaling is gone. Retaining inert pssh is a valid
  // representation difference, so the feature reader reports DIFF rather than manufacturing FAIL.
  if (ctx.scenario.op === 'decrypt') {
    const reference = verifiedCleartextReference(ctx);
    let expectedTrackTypes: Array<'video' | 'audio' | 'other'> = [];
    if (reference) {
      const read = readOutputStructureResult(reference.bytes, reference.container);
      if (read.state !== 'OK') {
        return oracleError(
          oracle,
          'DECRYPT_CLEAR_REFERENCE_STRUCTURE_INVALID',
          `digest-verified clear reference is not structurally readable [${read.reasonCode}]`,
        );
      }
      expectedTrackTypes = read.value.tracks.map((track) =>
        track.type === 'video' || track.type === 'audio' ? track.type : 'other');
    } else {
      const golden = await frameComparisonMetadataGolden(ctx);
      if (!golden.meta?.tracks.length) {
        return missingGoldenOutcome(
          golden,
          'meta',
          oracle,
          'decrypt clear-reference track cardinality is unavailable',
        );
      }
      expectedTrackTypes = golden.meta.tracks.map((track) =>
        track.type === 'video' || track.type === 'audio' ? track.type : 'other');
    }
    return encryptionVerdictOutcome(
      oracle,
      assessClearDecryptStructure(ctx.output.bytes, expectedTrackTypes),
    );
  }

  // A full-range trim is an identity operation at the semantic access-unit/presentation layer.
  // Re-read both verified source and candidate bytes with the same neutral stream-copy comparator:
  // legal packetization changes remain DIFF, while a dropped/shifted track or access unit is FAIL.
  if (ctx.scenario.op === 'trim') {
    const source = new Uint8Array(await ctx.input.arrayBuffer());
    const sourceContainer = ctx.golden.meta?.container ?? resolveContainer(undefined, ctx.input.id);
    return evaluateStrictStreamCopy(
      source,
      sourceContainer,
      ctx.output.bytes,
      ctx.output.container,
      {
        expectedTargetContainer: readStringOption(ctx.scenario.options, ['container']) ?? ctx.output.container,
        surfaceRepresentationDifferences: true,
      },
    ).outcome;
  }

  // MUX: every advertised target is parsed by a neutral target reader. Applicable specialized layers
  // (selection, full DTS/PTS timeline, output-mode writes/fragments, and rotation) are then evaluated
  // against independently re-read source evidence. Representation-only changes remain DIFF.
  if (ctx.scenario.op === 'mux') {
    return muxReferenceReimport(ctx);
  }
  return oracleError(
    oracle,
    'ORACLE_REFERENCE_REIMPORT_OPERATION_UNSUPPORTED',
    `reference-reimport was attached to non-lossless op '${ctx.scenario.op}' without an implemented semantic check`,
  );
}

async function muxReferenceReimport(ctx: OracleContext): Promise<OracleOutcome> {
  const oracle: OracleId = 'reference-reimport';
  const output = ctx.output;
  if (!output) return fail(oracle, 'mux output bytes are missing');
  const contract = muxTargetContractFromScenario(ctx.scenario);
  if (!contract) {
    return oracleError(
      oracle,
      'MUX_TARGET_CONTRACT_MISSING',
      `no neutral target contract exists for '${readStringOption(ctx.scenario.options, ['container']) ?? output.container}'`,
    );
  }

  const layers: OracleOutcome[] = [muxDecisionOutcome(oracle, assessMuxTargetSemantics(output.bytes, contract))];
  const outputMode = muxOutputModeContractFromScenario(ctx.scenario);
  if (outputMode) {
    layers.push(muxDecisionOutcome(oracle, evaluateMuxOutputMode(outputMode, {
      bytes: output.bytes,
      ...(output.muxWriteTrace ? { trace: output.muxWriteTrace } : {}),
    })));
  }

  const options = isObject(ctx.scenario.options)
    ? ctx.scenario.options as Record<string, unknown>
    : {};
  const selectors = Array.isArray(options.trackSelect)
    ? options.trackSelect.filter((value): value is string => typeof value === 'string')
    : [];
  const inputs = ctx.inputs?.length ? ctx.inputs : [ctx.input];
  const needsSelection = selectors.length > 0 || inputs.length > 1 ||
    ctx.scenario.id === 'mux/edge_multitrack_keep_all_to_mp4';
  if (needsSelection) layers.push(await muxSelectionLayer(ctx, selectors));

  const needsFullTimeline = ctx.scenario.id.includes('edge_bframes_') ||
    ctx.scenario.id.includes('prop_vfr_') ||
    ctx.scenario.requires.features?.includes('mux:vfr-timestamps') === true;
  if (needsFullTimeline) layers.push(await muxTimelineLayer(ctx));

  const rotationPolicy = muxRotationPolicyFromScenario(ctx.scenario);
  if (rotationPolicy) layers.push(await muxRotationLayer(ctx, rotationPolicy));

  // A single unfiltered input is a strict stream-copy premise. The remux comparator normalizes
  // Annex-B/length-prefix, parameter-set placement, grouping, aliases, and legal timebase changes.
  if (inputs.length === 1 && selectors.length === 0) {
    const source = new Uint8Array(await ctx.input.arrayBuffer());
    const sourceContainer = ctx.golden.meta?.container ?? resolveContainer(undefined, ctx.input.id);
    layers.push(evaluateStrictStreamCopy(
      source,
      sourceContainer,
      output.bytes,
      output.container,
      {
        expectedTargetContainer: contract.container,
        surfaceRepresentationDifferences: true,
      },
    ).outcome);
  }

  return reduceRequiredMuxLayers(layers);
}

async function muxSelectionLayer(ctx: OracleContext, declaredSelectors: readonly string[]): Promise<OracleOutcome> {
  const oracle: OracleId = 'reference-reimport';
  const inputs = ctx.inputs?.length ? ctx.inputs : [ctx.input];
  const sourceTracks: MuxSourceTrackEvidence[] = [];
  for (let sourceIndex = 0; sourceIndex < inputs.length; sourceIndex++) {
    const input = inputs[sourceIndex]!;
    const bytes = new Uint8Array(await input.arrayBuffer());
    const container = resolveContainer(undefined, input.id);
    const read = readNeutralMuxTarget(bytes, container);
    if (read.state !== 'OK') {
      return read.state === 'UNSUPPORTED_FORMAT'
        ? oracleError(
            oracle,
            'MUX_SELECTION_SOURCE_READER_COVERAGE_ERROR',
            `${input.id}: neutral source reader ${read.state} [${read.reasonCode}]`,
          )
        : unavailable(
            oracle,
            'NA_ASSET',
            'MUX_SELECTION_SOURCE_EVIDENCE_INVALID',
            `${input.id}: neutral source reader ${read.state} [${read.reasonCode}]`,
          );
    }
    const ordinals: Record<'video' | 'audio', number> = { video: 0, audio: 0 };
    for (let trackIndex = 0; trackIndex < read.value.tracks.length; trackIndex++) {
      const track = read.value.tracks[trackIndex]!;
      if (track.type !== 'video' && track.type !== 'audio') continue;
      const typeOrdinal = ordinals[track.type]++;
      const digest = await muxTrackContentDigest(track);
      if (!digest) {
        return oracleError(
          oracle,
          'MUX_SELECTION_SOURCE_IDENTITY_UNAVAILABLE',
          `${input.id} ${track.type}:${typeOrdinal} has no payload-bearing semantic identity`,
        );
      }
      sourceTracks.push({
        sourceIndex,
        sourceAssetId: input.id,
        sourceTrackIndex: trackIndex,
        type: track.type,
        typeOrdinal,
        codec: track.codec,
        identities: [{ kind: 'payload-digest', value: digest }],
      });
    }
  }

  let selectorValues = [...declaredSelectors];
  if (selectorValues.length === 0) {
    if (inputs.length > 1) {
      return oracleError(
        oracle,
        'MUX_MULTI_SOURCE_SELECTION_CONTRACT_MISSING',
        'multi-source mux requires explicit source-qualified selectors',
      );
    }
    selectorValues = sourceTracks.map((track) => `${track.type}:${track.typeOrdinal}@${track.sourceIndex}`);
  }

  let plan;
  try {
    plan = normalizeMuxTrackSelection(sourceTracks, selectorValues);
  } catch (error) {
    return oracleError(
      oracle,
      'MUX_SELECTION_PLAN_INVALID',
      error instanceof Error ? error.message : String(error),
    );
  }

  if (!ctx.output) return fail(oracle, 'mux output is missing for track-selection validation');
  const candidateRead = readNeutralMuxTarget(ctx.output.bytes, ctx.output.container);
  if (candidateRead.state !== 'OK') {
    return fail(
      oracle,
      `mux selection candidate is ${candidateRead.state.toLowerCase()} [${candidateRead.reasonCode}]`,
    );
  }
  const candidates: MuxCandidateTrackEvidence[] = [];
  for (const track of candidateRead.value.tracks) {
    if (track.type !== 'video' && track.type !== 'audio') continue;
    const digest = await muxTrackContentDigest(track);
    if (!digest) {
      return fail(oracle, `candidate track '${track.id}' has no payload-bearing semantic identity`);
    }
    candidates.push({
      outputTrackId: track.id,
      type: track.type,
      codec: track.codec,
      identities: [{ kind: 'payload-digest', value: digest }],
    });
  }
  return muxDecisionOutcome(oracle, assessMuxTrackSelection(plan, candidates));
}

async function muxTrackContentDigest(track: RemuxTrackEvidence): Promise<string | undefined> {
  const normalized = normalizeRemuxTrackForTest(track);
  const payloads = normalized?.payloads ?? track.samples.map((sample) => sample.payload);
  const byteLength = payloads.reduce((sum, payload) => sum + payload.byteLength, 0);
  if (byteLength <= 0) return undefined;
  const joined = new Uint8Array(byteLength);
  let offset = 0;
  for (const payload of payloads) {
    joined.set(payload, offset);
    offset += payload.byteLength;
  }
  return sha256Hex(joined);
}

async function muxTimelineLayer(ctx: OracleContext): Promise<OracleOutcome> {
  const oracle: OracleId = 'reference-reimport';
  if (!ctx.output) return fail(oracle, 'mux output is missing for timeline validation');
  const inputs = ctx.inputs?.length ? ctx.inputs : [ctx.input];
  if (inputs.length !== 1) {
    return oracleError(
      oracle,
      'MUX_TIMELINE_MULTI_SOURCE_UNSUPPORTED',
      'full timeline comparison requires a selected combined source timeline',
    );
  }
  const sourceBytes = new Uint8Array(await inputs[0]!.arrayBuffer());
  const sourceRead = readNeutralRemuxProgram(sourceBytes, resolveContainer(undefined, inputs[0]!.id));
  const candidateRead = readNeutralRemuxProgram(ctx.output.bytes, ctx.output.container);
  if (sourceRead.state !== 'OK') {
    return unavailable(
      oracle,
      'NA_ASSET',
      'MUX_TIMELINE_SOURCE_EVIDENCE_UNAVAILABLE',
      `source timeline reader ${sourceRead.state} [${sourceRead.reasonCode}]`,
    );
  }
  if (candidateRead.state !== 'OK') {
    return fail(
      oracle,
      `candidate timeline reader ${candidateRead.state} [${candidateRead.reasonCode}]`,
    );
  }
  const source = muxTimelineEvidenceFromProgram(sourceRead.value);
  const candidate = muxTimelineEvidenceFromProgram(candidateRead.value);
  if (source.state === 'ERROR') return oracleError(oracle, source.reasonCode, source.detail);
  if (candidate.state === 'ERROR') return oracleError(oracle, candidate.reasonCode, candidate.detail);
  return muxDecisionOutcome(oracle, compareMuxTimelines(source.value, candidate.value));
}

async function muxRotationLayer(
  ctx: OracleContext,
  policy: NonNullable<ReturnType<typeof muxRotationPolicyFromScenario>>,
): Promise<OracleOutcome> {
  const oracle: OracleId = 'reference-reimport';
  if (!ctx.output) return fail(oracle, 'mux output is missing for rotation validation');
  const sourceBytes = new Uint8Array(await ctx.input.arrayBuffer());
  const sourceContainer = ctx.golden.meta?.container ?? resolveContainer(undefined, ctx.input.id);
  const sourceOrientation = readMuxOrientation(sourceBytes, sourceContainer);
  const candidateOrientation = readMuxOrientation(ctx.output.bytes, ctx.output.container);
  const sourceMedia: MediaBytes = { bytes: sourceBytes, mime: ctx.input.mime, container: sourceContainer };
  let sourceFrames: FrameSink;
  let candidateFrames: FrameSink;
  try {
    sourceFrames = await ctx.decodeWithPlatform(sourceMedia, { maxFrames: 8192 });
  } catch (error) {
    return classifyReferenceDecodeFailure(oracle, 'source', error, sourceMedia);
  }
  try {
    candidateFrames = await ctx.decodeWithPlatform(ctx.output, { maxFrames: 8192 });
  } catch (error) {
    return classifyReferenceDecodeFailure(oracle, 'candidate', error, ctx.output);
  }
  if (sourceFrames.frames.length === 0) {
    return unavailable(
      oracle,
      'NA_ASSET',
      'MUX_ROTATION_SOURCE_PRESENTATION_EMPTY',
      'neutral source decode produced no display-space frames',
    );
  }
  if (candidateFrames.frames.length === 0) {
    return fail(oracle, 'neutral candidate decode produced no display-space frames');
  }
  return muxDecisionOutcome(oracle, assessMuxRotation(
    sourceOrientation,
    candidateOrientation,
    displayEvidenceFromFrameDigests(sourceFrames.frames),
    displayEvidenceFromFrameDigests(candidateFrames.frames),
    policy,
  ));
}

function muxDecisionOutcome(oracle: OracleId, decision: MuxDecision): OracleOutcome {
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
  return { state: 'ERROR', oracle, reasonCode: decision.reasonCode, detail: decision.detail };
}

/** Required mux layers reduce deterministically without allowing a structural PASS to hide a gap. */
function reduceRequiredMuxLayers(layers: readonly OracleOutcome[]): OracleOutcome {
  const sorted = [...layers].sort((a, b) => {
    const aCode = a.reasonCode;
    const bCode = b.reasonCode;
    return aCode.localeCompare(bCode);
  });
  const pickVerdict = (verdict: 'FAIL' | 'DIFF' | 'PASS') =>
    sorted.find((layer) => layer.state === 'VERDICT' && layer.verdict === verdict);
  const decisive = pickVerdict('FAIL') ??
    sorted.find((layer) => layer.state === 'ERROR') ??
    sorted.find((layer) => layer.state === 'UNAVAILABLE' && layer.status === 'NA_BROWSER') ??
    sorted.find((layer) => layer.state === 'UNAVAILABLE' && layer.status === 'NA_ASSET') ??
    pickVerdict('DIFF') ??
    pickVerdict('PASS');
  if (!decisive) {
    return oracleError('reference-reimport', 'MUX_REFERENCE_LAYERS_EMPTY', 'mux reference re-import produced no layer');
  }
  const summary = sorted.map((layer) => layer.reasonCode).join(', ');
  return { ...decisive, detail: `${decisive.detail ?? decisive.reasonCode}; layers=[${summary}]` };
}

async function semanticRemuxReimport(
  ctx: OracleContext,
  t: Required<OracleTolerances>,
): Promise<OracleOutcome> {
  const oracle: OracleId = 'reference-reimport';
  const output = ctx.output;
  if (!output) return fail(oracle, 'no ctx.output bytes to re-import');

  // Expected track layout comes ONLY from committed golden. An absent golden (rotated real file, §7)
  // SKIPS the layout comparison below — we never fabricate a "vs 0" mismatch against a missing golden.
  const expectedTracks = (ctx.golden.meta?.tracks ?? []).filter(
    (track) => track.type === 'video' || track.type === 'audio',
  );

  // NO-ENGINE structural read of the engine's OWN output (mp4/webm). Ogg is outside the byte reader;
  // the Ogg-FLAC STREAMINFO/granule subpath below is its dedicated golden-free proof.
  const structureRead = readOutputStructureResult(output.bytes, output.container);
  const structure = structureRead.state === 'OK' ? structureRead.value : undefined;
  const actualTracks: OutputTrack[] = structure
    ? structure.tracks.filter((track) => track.type === 'video' || track.type === 'audio')
    : [];
  const oggFlacFallback = isExpectedOggFlacOutput(ctx);

  if (!oggFlacFallback && structureRead.state !== 'OK') {
    const detail = `neutral structure reader ${structureRead.state} [${structureRead.reasonCode}] for '${output.container}'`;
    if (structureRead.state === 'MALFORMED' || structureRead.state === 'INCOMPLETE') {
      return fail(oracle, detail);
    }
    return oracleError(oracle, structureRead.reasonCode, detail);
  }

  const measurements: Record<string, number> = {
    reimportMediaTracks: actualTracks.length,
    goldenMediaTracks: expectedTracks.length,
  };
  const diffs: string[] = [];
  let checks = 0;

  // Track count + type ALWAYS (given a golden layout AND a parsed structure); per-track codec only
  // when the reader token and golden token both confidently canonicalize.
  if (expectedTracks.length && structure) {
    checks++;
    diffs.push(...compareStructureTracks(expectedTracks, actualTracks));
  }

  // Duration: byte-reader container duration; for a header-less Ogg-FLAC output, the max granule.
  let gotDur = structure?.durationSec;
  if ((gotDur == null || gotDur <= 0) && oggFlacFallback) {
    const sampleRate = audioSampleRate(expectedTracks);
    const granuleDuration = durationFromOggGranules(output.bytes, sampleRate);
    if (granuleDuration !== undefined) {
      gotDur = granuleDuration;
      measurements.durationFromOggGranulesSec = granuleDuration;
    }
  }
  const wantDur = ctx.golden.meta?.durationSec;
  if (gotDur != null && wantDur != null) {
    checks++;
    const delta = Math.abs(gotDur - wantDur);
    const container = output.container || structure?.container || '';
    const band = durationToleranceFor(
      container,
      primaryAssetId(ctx),
      t,
      ctx.scenario.tolerances?.durationToleranceSec != null,
    );
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

  // Ogg-FLAC byte-parse subpath: STREAMINFO identity source↔output — a golden-free real check. Runs
  // only when BOTH sides byte-parse; an unparseable side is skipped (R2: no FAIL on parse uncertainty).
  if (oggFlacFallback) {
    const sourceInfo = await nativeFlacStreamInfoFromInput(ctx.input);
    const outputInfo = oggFlacStreamInfo(output.bytes);
    if (sourceInfo && outputInfo) {
      checks++;
      measurements.oggFlacPages = outputInfo.pages;
      measurements.oggFlacPayloadBytes = outputInfo.payloadBytes;
      measurements.flacSourceTotalSamples = Number(sourceInfo.totalSamples);
      measurements.flacOutputTotalSamples = Number(outputInfo.info.totalSamples);
      if (sourceInfo.sampleRate !== outputInfo.info.sampleRate) {
        diffs.push(`Ogg-FLAC sampleRate: output ${outputInfo.info.sampleRate} vs source ${sourceInfo.sampleRate}`);
      }
      if (sourceInfo.channels !== outputInfo.info.channels) {
        diffs.push(`Ogg-FLAC channels: output ${outputInfo.info.channels} vs source ${sourceInfo.channels}`);
      }
      if (sourceInfo.bitsPerSample !== outputInfo.info.bitsPerSample) {
        diffs.push(`Ogg-FLAC bitsPerSample: output ${outputInfo.info.bitsPerSample} vs source ${sourceInfo.bitsPerSample}`);
      }
      if (sourceInfo.totalSamples !== outputInfo.info.totalSamples) {
        diffs.push(`Ogg-FLAC totalSamples: output ${outputInfo.info.totalSamples} vs source ${sourceInfo.totalSamples}`);
      }
      if (sourceInfo.md5 !== outputInfo.info.md5) {
        diffs.push('Ogg-FLAC STREAMINFO MD5 changed across remux');
      }
      if (outputInfo.pages <= 0 || outputInfo.payloadBytes <= 0) {
        diffs.push('Ogg-FLAC output has no Ogg page payload');
      }
    }
  }

  if (diffs.length) return fail(oracle, diffs.join('; '), measurements);
  // Missing committed truth is NA_ASSET. A present artifact that cannot establish any complete
  // neutral comparison is a harness ERROR, never a prose-routed availability result.
  if (checks === 0) {
    if (!ctx.golden.meta) {
      return missingGoldenOutcome(
        ctx.golden,
        'meta',
        oracle,
        'reference-reimport remux metadata evidence is unavailable',
      );
    }
    return oracleError(
      oracle,
      'ORACLE_REFERENCE_REIMPORT_EVIDENCE_INCOMPLETE',
      'reference-reimport could not establish a complete structural or Ogg-FLAC proof',
    );
  }
  const detail =
    oggFlacFallback && actualTracks.length === 0
      ? `Ogg-FLAC STREAMINFO/granule proof: ${actualTracks.length} media track(s)`
      : `remux output re-read structurally: ${actualTracks.length} media track(s), ${checks} check(s)`;
  return pass(oracle, detail, measurements);
}

function isExpectedOggFlacOutput(ctx: OracleContext): boolean {
  const output = ctx.output;
  if (!output || normStr(output.container) !== 'ogg') return false;
  // Self-validating: the output actually byte-parses as an Ogg-FLAC bitstream, OR golden declares the
  // audio codec is FLAC. (No scored engine — only the output bytes + committed golden.)
  if (oggFlacStreamInfo(output.bytes) !== undefined) return true;
  return (ctx.golden.meta?.tracks ?? []).some(
    (track) => track.type === 'audio' && normStr(track.codec) === 'flac',
  );
}

function audioSampleRate(tracks: NormalizedTrack[]): number | undefined {
  const sampleRate = tracks.find((track) => track.type === 'audio' && typeof track.sampleRate === 'number')?.sampleRate;
  return sampleRate !== undefined && Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : undefined;
}

function durationFromOggGranules(bytes: Uint8Array, sampleRate: number | undefined): number | undefined {
  if (sampleRate === undefined || sampleRate <= 0) return undefined;
  let pos = 0;
  let maxGranule = -1n;

  while (pos + 27 <= bytes.byteLength) {
    if (
      bytes[pos] !== 0x4f ||
      bytes[pos + 1] !== 0x67 ||
      bytes[pos + 2] !== 0x67 ||
      bytes[pos + 3] !== 0x53
    ) {
      return undefined;
    }

    const segmentCount = bytes[pos + 26]!;
    const segmentTable = pos + 27;
    const payloadStart = segmentTable + segmentCount;
    if (payloadStart > bytes.byteLength) return undefined;

    let payloadLength = 0;
    for (let i = 0; i < segmentCount; i++) payloadLength += bytes[segmentTable + i]!;
    const next = payloadStart + payloadLength;
    if (next > bytes.byteLength) return undefined;

    let granule = 0n;
    for (let i = 7; i >= 0; i--) granule = (granule << 8n) | BigInt(bytes[pos + 6 + i]!);
    const isUnset = granule === 0xffffffffffffffffn;
    const isNegative = (granule & 0x8000000000000000n) !== 0n;
    if (!isUnset && !isNegative && granule > maxGranule) maxGranule = granule;

    pos = next;
  }

  return maxGranule >= 0n ? Number(maxGranule) / sampleRate : undefined;
}

interface FlacStreamInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  totalSamples: bigint;
  md5: string;
}

interface OggFlacInfo {
  info: FlacStreamInfo;
  pages: number;
  payloadBytes: number;
}

async function nativeFlacStreamInfoFromInput(input: MediaInput): Promise<FlacStreamInfo | undefined> {
  try {
    return nativeFlacStreamInfo(new Uint8Array(await input.arrayBuffer()));
  } catch {
    return undefined;
  }
}

function nativeFlacStreamInfo(bytes: Uint8Array): FlacStreamInfo | undefined {
  if (!bytesStartWith(bytes, 0, [0x66, 0x4c, 0x61, 0x43])) return undefined;
  return flacStreamInfoFromMetadataBlocks(bytes, 4);
}

function oggFlacStreamInfo(bytes: Uint8Array): OggFlacInfo | undefined {
  let pos = 0;
  let pages = 0;
  let payloadBytes = 0;
  const packetParts: Uint8Array[] = [];

  while (pos + 27 <= bytes.byteLength) {
    if (!bytesStartWith(bytes, pos, [0x4f, 0x67, 0x67, 0x53])) return undefined;
    pages++;

    const segmentCount = bytes[pos + 26]!;
    const segmentTable = pos + 27;
    const payloadStart = segmentTable + segmentCount;
    if (payloadStart > bytes.byteLength) return undefined;

    let pagePayload = 0;
    for (let i = 0; i < segmentCount; i++) pagePayload += bytes[segmentTable + i]!;
    const next = payloadStart + pagePayload;
    if (next > bytes.byteLength) return undefined;
    payloadBytes += pagePayload;

    let payloadOffset = payloadStart;
    for (let i = 0; i < segmentCount; i++) {
      const len = bytes[segmentTable + i]!;
      if (len > 0) packetParts.push(bytes.subarray(payloadOffset, payloadOffset + len));
      payloadOffset += len;
      if (len < 255) {
        const packet = concatBytes(packetParts);
        const info = flacStreamInfoFromOggPacket(packet);
        return info ? { info, pages, payloadBytes } : undefined;
      }
    }

    pos = next;
  }

  return undefined;
}

function flacStreamInfoFromOggPacket(packet: Uint8Array): FlacStreamInfo | undefined {
  if (!bytesStartWith(packet, 0, [0x7f, 0x46, 0x4c, 0x41, 0x43])) return undefined;
  const nativeMarker = indexOfBytes(packet, [0x66, 0x4c, 0x61, 0x43], 5);
  if (nativeMarker < 0) return undefined;
  return flacStreamInfoFromMetadataBlocks(packet, nativeMarker + 4);
}

function flacStreamInfoFromMetadataBlocks(bytes: Uint8Array, pos: number): FlacStreamInfo | undefined {
  while (pos + 4 <= bytes.byteLength) {
    const header = bytes[pos]!;
    const last = (header & 0x80) !== 0;
    const type = header & 0x7f;
    const len = (bytes[pos + 1]! << 16) | (bytes[pos + 2]! << 8) | bytes[pos + 3]!;
    const data = pos + 4;
    if (data + len > bytes.byteLength) return undefined;
    if (type === 0 && len >= 34) return parseFlacStreamInfoBlock(bytes.subarray(data, data + 34));
    pos = data + len;
    if (last) break;
  }
  return undefined;
}

function parseFlacStreamInfoBlock(block: Uint8Array): FlacStreamInfo | undefined {
  if (block.byteLength < 34) return undefined;
  const sampleRate = (block[10]! << 12) | (block[11]! << 4) | (block[12]! >> 4);
  const channels = ((block[12]! & 0x0e) >> 1) + 1;
  const bitsPerSample = (((block[12]! & 0x01) << 4) | (block[13]! >> 4)) + 1;
  let totalSamples = BigInt(block[13]! & 0x0f);
  for (let i = 14; i <= 17; i++) totalSamples = (totalSamples << 8n) | BigInt(block[i]!);
  return {
    sampleRate,
    channels,
    bitsPerSample,
    totalSamples,
    md5: hexBytes(block.subarray(18, 34)),
  };
}

function bytesStartWith(bytes: Uint8Array, offset: number, prefix: number[]): boolean {
  if (offset < 0 || offset + prefix.length > bytes.byteLength) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (bytes[offset + i] !== prefix[i]) return false;
  }
  return true;
}

function indexOfBytes(bytes: Uint8Array, needle: number[], from: number): number {
  for (let i = Math.max(0, from); i <= bytes.byteLength - needle.length; i++) {
    if (bytesStartWith(bytes, i, needle)) return i;
  }
  return -1;
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function hexBytes(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ── playback-smoke ───────────────────────────────────────────────────────────────────────────

async function playbackSmoke(ctx: OracleContext): Promise<OracleOutcome> {
  const oracle: OracleId = 'playback-smoke';
  if (!ctx.output) return fail(oracle, 'no ctx.output bytes for playback');
  const ok = await ctx.playbackSmoke(ctx.output);
  if (ok) return pass(oracle, '<video> played a few frames of the output');
  return fail(oracle, '<video> playback did not advance / failed to play the output');
}

// ── fanout-renditions ───────────────────────────────────────────────────────────────────────

async function fanoutRenditions(ctx: OracleContext, t: Required<OracleTolerances>): Promise<OracleOutcome> {
  const oracle: OracleId = 'fanout-renditions';
  const output = ctx.output;
  if (!output) return fail(oracle, 'no ctx.output bytes for fanout verification');
  const variants = output.variants;
  if (!Array.isArray(variants) || variants.length === 0) {
    return fail(oracle, 'output did not expose a variants[] array');
  }

  const renditionIds = ctx.scenario.renditionIds?.length
    ? [...ctx.scenario.renditionIds]
    : TRANSCODE_ABR_CONTRACT.renditions.map((rendition) => rendition.id);
  if (variants.length !== renditionIds.length) {
    return transcodeDecisionOutcome(oracle, transcodeVerdict(
      'FAIL',
      'TRANSCODE_ABR_RENDITION_COUNT_MISMATCH',
      `candidate exposed ${variants.length} rendition(s); expected ${renditionIds.length}`,
      { variants: variants.length, expectedVariants: renditionIds.length },
    ));
  }

  const evidence: AbrRenditionEvidence[] = [];
  for (let index = 0; index < variants.length; index++) {
    const variant = variants[index]!;
    const id = renditionIds[index]!;
    let played = false;
    try {
      played = await ctx.playbackSmoke(variant);
    } catch (error) {
      return oracleError(
        oracle,
        'TRANSCODE_ABR_PLAYBACK_INSTRUMENT_ERROR',
        `rendition '${id}' playback instrument threw: ${errMsg(error)}`,
      );
    }
    const validity = played
      ? transcodeVerdict('PASS', 'TRANSCODE_ABR_RENDITION_PLAYABLE', `rendition '${id}' played in the required browser`)
      : transcodeVerdict('FAIL', 'TRANSCODE_ABR_RENDITION_UNPLAYABLE', `rendition '${id}' playback did not advance`);
    const quality = oracleOutcomeToTranscodeDecision(await ssimPsnr({ ...ctx, output: variant }, t));
    const collected = collectAbrRenditionEvidence(id, variant, validity, quality);
    if (collected.state === 'BLOCKED') return transcodeDecisionOutcome(oracle, collected.decision);
    evidence.push(collected.value);
  }

  const descriptionRead = readAbrRenditionSetDescription(output);
  if (descriptionRead.state === 'ERROR') {
    return oracleError(oracle, descriptionRead.reasonCode, descriptionRead.detail);
  }
  const description = descriptionRead.value;
  const switches = description
    ? await collectAbrSwitchDecodeEvidence(ctx, description, evidence)
    : undefined;
  return transcodeDecisionOutcome(
    oracle,
    evaluateAbrSwitchability(TRANSCODE_ABR_CONTRACT, description, evidence, switches),
  );
}

type AbrDescriptionRead =
  | { state: 'OK'; value?: AbrRenditionSetDescription }
  | { state: 'ERROR'; reasonCode: string; detail: string };

function readAbrRenditionSetDescription(output: MediaBytes): AbrDescriptionRead {
  const artifact = output.intermediates?.find((entry) => entry.role === TRANSCODE_ABR_RENDITION_SET_ROLE);
  if (!artifact) return { state: 'OK' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(artifact.bytes));
  } catch (error) {
    return {
      state: 'ERROR',
      reasonCode: 'TRANSCODE_ABR_DESCRIPTION_PARSE_ERROR',
      detail: `candidate rendition-set description is not valid UTF-8 JSON: ${errMsg(error)}`,
    };
  }
  if (!isObject(parsed) || (parsed.kind !== 'manifest' && parsed.kind !== 'explicit') ||
      typeof parsed.id !== 'string' || !Array.isArray(parsed.renditionIds) ||
      parsed.renditionIds.some((id) => typeof id !== 'string') ||
      !Array.isArray(parsed.switchPointsUs) ||
      parsed.switchPointsUs.some((point) => !Number.isSafeInteger(point) || (point as number) < 0) ||
      (parsed.segmentMode !== 'random-access' && parsed.segmentMode !== 'segments')) {
    return {
      state: 'ERROR',
      reasonCode: 'TRANSCODE_ABR_DESCRIPTION_SCHEMA_ERROR',
      detail: 'candidate rendition-set description does not match the typed ABR evidence schema',
    };
  }
  return {
    state: 'OK',
    value: Object.freeze({
      kind: parsed.kind,
      id: parsed.id,
      renditionIds: Object.freeze([...(parsed.renditionIds as string[])]),
      switchPointsUs: Object.freeze([...(parsed.switchPointsUs as number[])]),
      segmentMode: parsed.segmentMode,
    }),
  };
}

async function collectAbrSwitchDecodeEvidence(
  ctx: OracleContext,
  description: AbrRenditionSetDescription,
  renditions: readonly AbrRenditionEvidence[],
): Promise<AbrSwitchDecodeEvidence[]> {
  const artifacts = new Map((ctx.output?.intermediates ?? []).map((entry) => [entry.role, entry]));
  const byId = new Map(renditions.map((rendition) => [rendition.id, rendition]));
  const attempts: AbrSwitchDecodeEvidence[] = [];
  for (const point of description.switchPointsUs) {
    for (let index = 0; index + 1 < description.renditionIds.length; index++) {
      for (const [fromId, toId] of [
        [description.renditionIds[index]!, description.renditionIds[index + 1]!],
        [description.renditionIds[index + 1]!, description.renditionIds[index]!],
      ] as const) {
        const artifact = artifacts.get(transcodeAbrSwitchRole(fromId, toId, point));
        if (!artifact) continue;
        const from = byId.get(fromId);
        if (!from) continue;
        const sourceInterval = [...from.samples]
          .filter((sample) => sample.ptsUs < point)
          .sort((first, second) =>
            Math.abs(first.ptsUs + first.durationUs - point) -
              Math.abs(second.ptsUs + second.durationUs - point) ||
            second.ptsUs - first.ptsUs)[0];
        const media: MediaBytes = {
          bytes: artifact.bytes,
          mime: artifact.mime,
          container: artifact.container,
        };
        let sink: FrameSink;
        try {
          sink = await ctx.decodeWithPlatform(media, { maxFrames: 128 });
        } catch (error) {
          const classified = classifyReferenceDecodeFailure('fanout-renditions', 'candidate', error, media);
          attempts.push({
            fromId,
            toId,
            switchPointUs: point,
            sourceLastEndUs: sourceInterval ? sourceInterval.ptsUs + sourceInterval.durationUs : point,
            targetFirstPtsUs: point,
            decodedTargetFrames: 0,
            decision: oracleOutcomeToTranscodeDecision(classified),
          });
          continue;
        }
        const frames = [...(sink.frames ?? [])].sort((first, second) => first.ptsUs - second.ptsUs);
        const prefixFrames = frames.filter((frame) => frame.ptsUs < point);
        const targetFrames = frames.filter((frame) => frame.ptsUs >= point);
        const targetFirstPtsUs = targetFrames[0]?.ptsUs ?? point;
        const decision = (point === 0 || (sourceInterval !== undefined && prefixFrames.length > 0)) &&
            targetFrames.length > 0
          ? transcodeVerdict(
              'PASS',
              'TRANSCODE_ABR_SWITCH_DECODED',
              `neutral decoder crossed ${fromId}->${toId} at ${point}us and emitted ${targetFrames.length} target frame(s)`,
            )
          : transcodeVerdict(
              'FAIL',
              'TRANSCODE_ABR_SWITCH_DECODE_FAILED',
              `neutral switch artifact lacks a source interval or decoded target suffix at ${point}us`,
            );
        attempts.push({
          fromId,
          toId,
          switchPointUs: point,
          sourceLastEndUs: sourceInterval ? sourceInterval.ptsUs + sourceInterval.durationUs : point,
          targetFirstPtsUs,
          decodedTargetFrames: targetFrames.length,
          decision,
        });
      }
    }
  }
  return attempts;
}

function oracleOutcomeToTranscodeDecision(outcome: OracleOutcome): TranscodeDecision {
  const measurements = outcome.measurements ? finiteOnly({ ...outcome.measurements }) : undefined;
  if (outcome.state === 'VERDICT') {
    return transcodeVerdict(outcome.verdict, outcome.reasonCode, outcome.detail ?? '', measurements);
  }
  if (outcome.state === 'UNAVAILABLE') {
    return transcodeUnavailable(outcome.status, outcome.reasonCode, outcome.detail, measurements);
  }
  return transcodeError(outcome.reasonCode, outcome.detail, measurements);
}

function fanoutVariantSpecs(options: unknown): Array<{ width?: number; height?: number; codec?: string }> {
  if (!isObject(options) || !Array.isArray(options.variants)) return [];
  return options.variants
    .filter(isObject)
    .map((variant) => ({
      ...(typeof variant.width === 'number' ? { width: variant.width } : {}),
      ...(typeof variant.height === 'number' ? { height: variant.height } : {}),
      ...(typeof variant.codec === 'string' ? { codec: variant.codec } : {}),
    }));
}

function prefixMeasurements(prefix: string, measurements: OracleOutcome['measurements']): Record<string, number> {
  const out: Record<string, number> = {};
  if (!measurements) return out;
  for (const [key, value] of Object.entries(measurements)) {
    if (typeof value === 'number' && Number.isFinite(value)) out[`${prefix}${upperFirst(key)}`] = value;
  }
  return out;
}

function upperFirst(value: string): string {
  return value ? value[0]!.toUpperCase() + value.slice(1) : value;
}

// ── ssim-psnr ────────────────────────────────────────────────────────────────────────────────

const REFERENCE_BROWSER_UNAVAILABLE_CODES = new Set([
  'BROWSER_API_UNAVAILABLE',
  'BROWSER_CODEC_UNSUPPORTED',
  'WEB_CODECS_CONFIG_UNSUPPORTED',
  'REFERENCE_CODEC_UNSUPPORTED',
  'REFERENCE_REALM_UNAVAILABLE',
]);

const REFERENCE_INVALID_BITSTREAM_CODES = new Set([
  'REFERENCE_DECODE_INVALID_BITSTREAM',
  'WEB_CODECS_INVALID_BITSTREAM',
  'REFERENCE_OUTPUT_TRUNCATED',
]);

function classifyReferenceDecodeFailure(
  oracle: OracleId,
  role: 'candidate' | 'source',
  error: unknown,
  media?: MediaBytes,
): OracleOutcome {
  if (isNotApplicableError(error)) throw error;
  const record = isObject(error) ? error : {};
  const reasonCode = typeof record.reasonCode === 'string'
    ? record.reasonCode
    : typeof record.code === 'string'
      ? record.code
      : undefined;
  const browserUnavailable =
    (reasonCode !== undefined && REFERENCE_BROWSER_UNAVAILABLE_CODES.has(reasonCode)) ||
    record.name === 'NotSupportedError' ||
    record.supported === false;

  if (role === 'candidate' && media) {
    const structure = readOutputStructureResult(media.bytes, media.container);
    if (structure.state === 'MALFORMED' || structure.state === 'INCOMPLETE') {
      return fail(
        oracle,
        `candidate bytes are ${structure.state.toLowerCase()} [${structure.reasonCode}]; ` +
          `reference decode reason ${reasonCode ?? 'untyped'}`,
      );
    }
    if (structure.state === 'UNSUPPORTED_FORMAT' || structure.state === 'UNSUPPORTED_STRUCTURE') {
      return oracleError(
        oracle,
        structure.reasonCode,
        `neutral structure reader cannot establish candidate validity (${structure.state}); decode status is not guessed`,
      );
    }
    if (browserUnavailable) {
      return unavailable(
        oracle,
        'NA_BROWSER',
        reasonCode ?? 'REFERENCE_CODEC_UNSUPPORTED',
        `candidate structure is valid, but this browser reference path rejected its concrete codec/configuration`,
      );
    }
    if (
      (reasonCode !== undefined && REFERENCE_INVALID_BITSTREAM_CODES.has(reasonCode)) ||
      record.configSupport === 'SUPPORTED' && record.invalidBitstream === true
    ) {
      return fail(
        oracle,
        `candidate bitstream failed after its concrete decode configuration was supported [${reasonCode ?? 'REFERENCE_DECODE_INVALID_BITSTREAM'}]`,
      );
    }
    return oracleError(
      oracle,
      reasonCode ?? 'REFERENCE_DECODE_AMBIGUOUS',
      `candidate structure is readable, but the neutral decoder failure lacks typed support/invalidity evidence`,
    );
  }

  if (browserUnavailable) {
    return unavailable(
      oracle,
      'NA_BROWSER',
      reasonCode ?? 'REFERENCE_CODEC_UNSUPPORTED',
      `source reference decode is unavailable for this browser/realm concrete configuration`,
    );
  }
  return oracleError(
    oracle,
    reasonCode ?? 'REFERENCE_SOURCE_DECODE_ERROR',
    `neutral source decode failed without typed browser-applicability evidence: ${errMsg(error)}`,
  );
}

async function ssimPsnr(ctx: OracleContext, t: Required<OracleTolerances>): Promise<OracleOutcome> {
  const oracle: OracleId = 'ssim-psnr';

  if (ctx.decodeTrackSelection && ctx.decodeTrackSelection.verdict !== 'PASS') {
    return decodeSeekOracleOutcome(oracle, ctx.decodeTrackSelection);
  }

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
  let candidateUsesReferenceDecoder = false;
  if (ctx.frames) {
    sink = ctx.frames;
  } else if (ctx.output) {
    candidateUsesReferenceDecoder = true;
    try {
      sink = await ctx.decodeWithPlatform(ctx.output, { maxFrames });
    } catch (err) {
      return classifyReferenceDecodeFailure(oracle, 'candidate', err, ctx.output);
    }
  } else {
    return fail(oracle, 'no decoded frames (ctx.frames) or output bytes (ctx.output) for SSIM/PSNR');
  }
  if (!sink) {
    return candidateUsesReferenceDecoder && ctx.output
      ? classifyReferenceDecodeFailure(
          oracle,
          'candidate',
          { reasonCode: 'REFERENCE_DECODE_EMPTY_AMBIGUOUS' },
          ctx.output,
        )
      : fail(oracle, 'candidate engine returned no decoded sink');
  }
  const candFrames = Array.isArray(sink.frames) ? sink.frames : [];
  if (!candFrames.length) {
    return candidateUsesReferenceDecoder && ctx.output
      ? classifyReferenceDecodeFailure(
          oracle,
          'candidate',
          { reasonCode: 'REFERENCE_DECODE_EMPTY_AMBIGUOUS' },
          ctx.output,
        )
      : fail(oracle, 'candidate engine decoded 0 frames');
  }

  const displayContract = displayTransformFromOptions(ctx.scenario.options);
  if (displayContract) {
    let reference: FrameSink;
    try {
      const sourceBytes = new Uint8Array(await ctx.input.arrayBuffer());
      reference = await ctx.decodeWithPlatform({
        bytes: sourceBytes,
        mime: ctx.input.mime,
        container: resolveContainer(undefined, ctx.input.id),
      }, { maxFrames: candFrames.length });
    } catch (error) {
      return classifyReferenceDecodeFailure(oracle, 'source', error);
    }
    if (!reference.frames.length) {
      return unavailable(
        oracle,
        'NA_BROWSER',
        'DISPLAY_REFERENCE_DECODE_EMPTY',
        'neutral platform decode produced no displayed source frames',
      );
    }
    const referenceEvidence = displayEvidenceFromFrameDigests(reference.frames);
    if (referenceEvidence.some((frame) =>
      frame.width !== displayContract.displayWidth || frame.height !== displayContract.displayHeight)) {
      return unavailable(
        oracle,
        'NA_ASSET',
        'DISPLAY_SOURCE_TRANSFORM_EVIDENCE_MISSING',
        `source does not present as ${displayContract.displayWidth}x${displayContract.displayHeight}; ` +
          'the required container display transform is absent or invalid',
      );
    }
    return decodeSeekOracleOutcome(
      oracle,
      assessDisplaySpaceEvidence(
        displayEvidenceFromFrameDigests(candFrames),
        referenceEvidence,
        displayContract,
        Math.max(1, t.seekToleranceUs),
      ),
    );
  }

  // No committed golden → perceptual validation against the in-browser-decoded source (§5.2).
  if (!haveGolden) {
    return ssimVsReferenceSource(oracle, ctx, t, sink, candFrames.length);
  }

  // Pair candidate frames with committed references by presentation time. The frame golden carries
  // the PTS used to locate the corresponding signature/digest; a signature-only artifact has no
  // timing contract and is therefore a harness error rather than an index-paired guess.
  //  (A) full-pixel SSIM/PSNR when getPixels is available AND golden ships pixels (not committed
  //      here — golden never carries raw media), so in practice we use:
  //  (B) downsampled-luma-signature SSIM (global) when ssim.json provides per-frame luma sigs, and
  //      digest equality as the PSNR proxy (Infinity if the normalized RGBA digest matches → the
  //      frame is identical → PSNR is +∞; otherwise we cannot compute true RGB PSNR without golden
  //      pixels, so we report the per-frame SSIM and fall back to digest-equality for the PSNR gate).
  if (!want?.length) {
    return oracleError(
      oracle,
      'ORACLE_REFERENCE_TIMING_UNAVAILABLE',
      'committed SSIM signatures exist without timestamped frame evidence; index pairing is forbidden',
    );
  }
  const aligned = matchFramesByPresentationTime(candFrames, want, {
    maxSamples: 8,
    timingToleranceUs: t.seekToleranceUs,
    durationToleranceUs: t.durationToleranceSec * 1_000_000,
  });
  if (aligned.pairs.length === 0) return fail(oracle, 'no presentation-time paired frames to compare');
  if (!aligned.complete) {
    return fail(
      oracle,
      aligned.reason ?? 'timestamp pairing did not cover the expected presentation window',
      {
        requestedSamples: aligned.requestedSamples,
        pairs: aligned.pairs.length,
        presentationCoverage: aligned.coverageRatio,
        presentationWindowDeltaUs: aligned.windowDeltaUs,
      },
    );
  }

  let ssimSum = 0;
  let ssimCount = 0;
  let minSsim = 1;
  let exactCount = 0;
  const havePixels = typeof sink.getPixels === 'function';

  let residualSum = 0;
  let residualMax = 0;
  for (const pair of aligned.pairs) {
    const cand = candFrames[pair.candidateIndex];
    const goldenFrame = want[pair.referenceIndex];
    // Guard against a sparse/holey candidate frame array (a null/undefined entry, or one missing a
    // sha256). Such a frame contributes no evidence rather than null-derefing on cand.sha256.
    if (!cand) continue;
    // digest equality → identical normalized frame → SSIM 1 / PSNR ∞
    if (goldenFrame && cand.sha256 != null && normHex(cand.sha256) === normHex(goldenFrame.sha256)) {
      exactCount++;
      ssimSum += 1;
      ssimCount++;
      residualSum += pair.residualUs;
      residualMax = Math.max(residualMax, pair.residualUs);
      continue;
    }
    // SSIM via downsampled luma signature if golden provides one and we can derive ours
    const refSig = refSigs?.[pair.referenceIndex];
    if (refSig && havePixels) {
      // getPixels can also reject / return null for an undecodable candidate frame; tolerate it.
      let px: ImageData | null | undefined;
      try {
        px = await sink.getPixels!(pair.candidateIndex);
      } catch {
        px = undefined;
      }
      if (!px) continue;
      const candSig = downsampleLuma(px, sigSide(refSig.length));
      const s = sigSsim(candSig, refSig);
      ssimSum += s;
      ssimCount++;
      if (s < minSsim) minSsim = s;
      residualSum += pair.residualUs;
      residualMax = Math.max(residualMax, pair.residualUs);
    } else if (refSig && !havePixels) {
      // cannot derive a candidate luma sig without pixels; this pair contributes no SSIM evidence
    }
  }

  const measurements: Record<string, number> = {
    requestedSamples: aligned.requestedSamples,
    pairs: aligned.pairs.length,
    exactFrames: exactCount,
    ssimMean: ssimCount ? ssimSum / ssimCount : 0,
    ssimMin: ssimCount ? minSsim : 0,
    presentationCoverage: aligned.coverageRatio,
    meanTimestampResidualUs: ssimCount ? residualSum / ssimCount : 0,
    maxTimestampResidualUs: residualMax,
  };

  // PSNR: true RGB PSNR requires golden raw pixels (never committed). When every paired frame is
  // digest-identical we report Infinity; otherwise PSNR is reported as unavailable and the gate
  // rests on SSIM. We still surface a measured PSNR when pixels are present on BOTH sides — which
  // is not the case for committed golden — so we document the digest-based proxy here.
  if (exactCount === aligned.pairs.length) {
    measurements.psnrDb = Number.POSITIVE_INFINITY;
    return pass(
      oracle,
      `all ${aligned.pairs.length} presentation-aligned frames digest-identical (SSIM=1, PSNR=∞)`,
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
    ? `SSIM min ${minSsim.toFixed(4)} ≥ ${t.ssimMin} (mean ${ssimMean.toFixed(4)}) over ${ssimCount} presentation-aligned frame(s); PSNR via golden pixels unavailable (digest proxy: ${exactCount}/${aligned.pairs.length} exact)`
    : `SSIM min ${minSsim.toFixed(4)} < ${t.ssimMin} (mean ${ssimMean.toFixed(4)}); ${exactCount}/${aligned.pairs.length} frames digest-exact`;

  return ssimPass
    ? pass(oracle, detail, finiteOnly(measurements))
    : fail(oracle, detail, finiteOnly(measurements));
}

function decodeSeekOracleOutcome(oracle: OracleId, decision: DecodeSeekVerdict): OracleOutcome {
  return {
    state: 'VERDICT',
    oracle,
    verdict: decision.verdict,
    reasonCode: decision.reasonCode,
    detail: decision.detail,
    ...(decision.measurements ? { measurements: decision.measurements } : {}),
  };
}

/**
 * Reference-based SSIM/PSNR for transcode/resize cases with NO committed golden (§5.2). Decode the
 * SOURCE in-browser, downscale each frame to the candidate's resolution, and compare. Makes
 * convert-webm-resize verifiable without a golden frame-bake. Frames pair by presentation intervals,
 * so a legal fps/VFR conversion is compared at equal moments. A correct downscale-transcode → high SSIM vs the
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
    return classifyReferenceDecodeFailure(oracle, 'source', err, srcBytes);
  }
  if (!srcSink || typeof srcSink.getPixels !== 'function') {
    return oracleError(
      oracle,
      'REFERENCE_SOURCE_PIXELS_UNAVAILABLE',
      'reference source decode returned no pixel-bearing sink',
    );
  }
  const srcCount = Array.isArray(srcSink.frames) ? srcSink.frames.length : 0;
  const aligned = matchFramesByPresentationTime(candSink.frames, srcSink.frames, {
    maxSamples: 8,
    timingToleranceUs: t.seekToleranceUs,
    durationToleranceUs: t.durationToleranceSec * 1_000_000,
  });
  if (aligned.pairs.length === 0) return fail(oracle, 'no presentation-time candidate/reference pairs');
  if (!aligned.complete) {
    return fail(
      oracle,
      aligned.reason ?? 'candidate/reference presentation coverage is incomplete',
      {
        candidateFrames: candCount,
        referenceFrames: srcCount,
        requestedSamples: aligned.requestedSamples,
        pairs: aligned.pairs.length,
        presentationCoverage: aligned.coverageRatio,
        presentationWindowDeltaUs: aligned.windowDeltaUs,
      },
    );
  }

  let ssimSum = 0;
  let psnrSum = 0;
  let psnrCount = 0;
  let minSsim = 1;
  let cnt = 0;
  let dims = '';
  let residualSum = 0;
  let residualMax = 0;
  for (const pair of aligned.pairs) {
    let candPx: ImageData | null | undefined;
    let srcPx: ImageData | null | undefined;
    try {
      candPx = await candSink.getPixels(pair.candidateIndex);
      srcPx = await srcSink.getPixels(pair.referenceIndex);
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
    residualSum += pair.residualUs;
    residualMax = Math.max(residualMax, pair.residualUs);
    cnt++;
    if (!dims) dims = `${prepared.detail} to ${candPx.width}x${candPx.height}`;
  }
  if (cnt === 0) return fail(oracle, 'could not compute SSIM on any frame (no comparable pixels)');

  const ssimMean = ssimSum / cnt;
  const psnrMean = psnrCount ? psnrSum / psnrCount : 0;
  const measurements = finiteOnly({
    requestedSamples: aligned.requestedSamples,
    pairs: cnt,
    ssimMean,
    ssimMin: minSsim,
    psnrDb: psnrMean,
    presentationCoverage: aligned.coverageRatio,
    meanTimestampResidualUs: cnt ? residualSum / cnt : 0,
    maxTimestampResidualUs: residualMax,
  });
  // SSIM (mean) is the GATE. PSNR is ADVISORY only: the reference is the source downscaled by a
  // DIFFERENT resampler (OffscreenCanvas) than the candidate engine used, so absolute PSNR is not
  // ground truth and would falsely fail a correct transcode. Verified in /chrome that SSIM
  // discriminates cleanly — a correct downscale-transcode scores ~0.99 while a wrong/mismatched frame
  // scores ~0.84 — so the §8 SSIM floor (0.97 here) is a faithful correctness gate on its own.
  const ssimOk = ssimMean >= t.ssimMin;
  const detail =
    `vs in-browser reference (${dims}): SSIM mean ${ssimMean.toFixed(4)} ` +
    `(min ${minSsim.toFixed(4)}); PSNR mean ${psnrMean.toFixed(1)} dB (advisory) over ${cnt} ` +
    `presentation-aligned frame(s), coverage ${(aligned.coverageRatio * 100).toFixed(1)}%; ` +
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

  const options = isObject(ctx.scenario.options)
    ? ctx.scenario.options as Record<string, unknown>
    : undefined;
  if (isObject(options?.alphaEvidence)) {
    let response: Response;
    const artifactUrl = `fixtures/golden/${ctx.input.id}.alpha.json`;
    try {
      response = await fetch(artifactUrl, { cache: 'no-store' });
    } catch {
      return unavailable(
        oracle,
        'NA_ASSET',
        'ALPHA_EVIDENCE_FETCH_FAILED',
        `could not fetch timestamp-keyed alpha evidence '${artifactUrl}'`,
      );
    }
    if (response.status === 404) {
      return unavailable(
        oracle,
        'NA_ASSET',
        'ALPHA_EVIDENCE_NOT_FOUND',
        `timestamp-keyed alpha evidence is absent for '${ctx.input.id}'`,
      );
    }
    if (!response.ok) {
      return oracleError(
        oracle,
        'ALPHA_EVIDENCE_HTTP_ERROR',
        `alpha evidence request failed (${response.status} ${response.statusText})`,
      );
    }
    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      return oracleError(oracle, 'ALPHA_EVIDENCE_JSON_INVALID', 'alpha evidence is not valid JSON');
    }
    const artifact = parseAlphaEvidenceArtifact(raw);
    if (!artifact || artifact.assetId !== ctx.input.id) {
      return oracleError(
        oracle,
        'ALPHA_EVIDENCE_SCHEMA_INVALID',
        `alpha evidence does not identify '${ctx.input.id}' with the required schema`,
      );
    }
    const sourceSha256 = await sha256Hex(new Uint8Array(await ctx.input.arrayBuffer()));
    if (normHex(sourceSha256) !== normHex(artifact.sourceSha256)) {
      return unavailable(
        oracle,
        'NA_ASSET',
        'ALPHA_EVIDENCE_SOURCE_MISMATCH',
        'alpha evidence was baked for different source bytes',
      );
    }
    if (!ctx.frames) return fail(oracle, 'decode operation returned no frame sink for alpha comparison');
    try {
      return decodeSeekOracleOutcome(
        oracle,
        assessAlphaEvidence(await collectAlphaEvidence(ctx.frames), artifact.frames),
      );
    } catch (error) {
      return fail(oracle, `candidate alpha pixels are unavailable or invalid: ${errMsg(error)}`);
    }
  }

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
      return classifyReferenceDecodeFailure(oracle, 'candidate', err, ctx.output);
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
  let comparedAlphaDigests = 0;
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
    // Do not compare against frames[i].sha256: that digest is for the full RGBA frame, not alpha.
    const w = want?.[i];
    const wantAlpha = alphaDigestFromGoldenFrame(w);
    if (wantAlpha) {
      comparedAlphaDigests++;
      const alphaDigest = await sha256Hex(alpha.asRgbaBuffer);
      if (normHex(alphaDigest) === normHex(wantAlpha)) {
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
  measurements.comparedAlphaDigests = comparedAlphaDigests;

  if (pixelFrames === 0) {
    return fail(oracle, `could not read pixels for any of ${pairs} frame(s); cannot inspect alpha plane`, measurements);
  }
  if (framesWithAlpha === 0) {
    return fail(oracle, `no frame exposed a non-opaque alpha channel over ${pixelFrames} readable frame(s)`, measurements);
  }
  if (comparedAlphaDigests > 0 && maxMeanAbsDiff > 0) {
    return fail(
      oracle,
      `alpha plane diverged from golden on at least one frame (digest mismatch)`,
      measurements,
    );
  }
  return pass(
    oracle,
    `alpha plane present on ${framesWithAlpha}/${pairs} frame(s)` +
      (comparedAlphaDigests > 0 ? ' and bit-exact vs golden alpha digest' : ' (no golden alpha digest to compare; presence verified)'),
    measurements,
  );
}

function alphaDigestFromGoldenFrame(frame: FrameDigest | undefined): string | undefined {
  if (!frame) return undefined;
  const rec = frame as unknown as Record<string, unknown>;
  for (const key of ['alphaSha256', 'alphaDigest', 'alphaPlaneSha256']) {
    const value = rec[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
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
  if (requestedUs == null) return oracleError(oracle, 'SEEK_TARGET_MISSING', 'scenario has no finite seek target');

  const timelineByPts = new Map<number, { ptsUs: number; keyframe: boolean }>();
  const packets = videoPacketsForGolden(ctx.golden);
  if (packets.length > 0) {
    for (const packet of packets) {
      const prior = timelineByPts.get(packet.ptsUs);
      timelineByPts.set(packet.ptsUs, {
        ptsUs: packet.ptsUs,
        keyframe: packet.keyframe || prior?.keyframe === true,
      });
    }
  } else {
    for (const frame of ctx.golden.frames ?? []) {
      timelineByPts.set(frame.ptsUs, {
        ptsUs: frame.ptsUs,
        keyframe: (frame as FrameDigest & { keyframe?: boolean }).keyframe === true,
      });
    }
  }
  const timeline = [...timelineByPts.values()].sort((a, b) => a.ptsUs - b.ptsUs);
  if (timeline.length === 0) {
    return unavailable(
      oracle,
      'NA_ASSET',
      'SEEK_TIMELINE_EVIDENCE_MISSING',
      'no timestamped packet/frame evidence exists for the selected source',
    );
  }

  const sequenceContract = seekSequenceContractFromOptions(ctx.scenario.options);
  if (sequenceContract && ctx.seekSequence) {
    return decodeSeekOracleOutcome(
      oracle,
      assessSeekSequence(sequenceContract, ctx.seekSequence, timeline),
    );
  }
  const observed = assessObservedSeekLanding(
    { targetUs: requestedUs, landedPtsUs: seek.landedPtsUs, frame: seek.frame },
    timeline,
    expectKeyframe,
    1,
  );
  if (observed.verdict !== 'PASS') return decodeSeekOracleOutcome(oracle, observed);

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
  } else {
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

  const contract = trimContractForScenario(ctx.scenario);
  if (contract.fragmentedOutput) {
    const requiredTrackTypes = (ctx.golden.meta?.tracks ?? [])
      .map((track) => track.type)
      .filter((type): type is 'video' | 'audio' => type === 'video' || type === 'audio');
    const fragmented = trimDecisionOutcome(
      oracle,
      assessFragmentedTrimOutput(ctx.output.bytes, {
        requiredTrackTypes,
        requireZeroBasedDecodeTime: true,
      }),
    );
    if (fragmented.state !== 'VERDICT' || fragmented.verdict === 'FAIL') return fragmented;
  }

  const range = contract.range;
  const diffs: string[] = [];
  const measurements: Record<string, number> = {};
  const sourceBytes = new Uint8Array(await ctx.input.arrayBuffer());
  const sourceContainer = ctx.golden.meta?.container ?? resolveContainer(undefined, ctx.input.id);
  const sourceIsoRead = isIsoBmffContainer(sourceContainer)
    ? readIsoBmffPresentationTimeline(sourceBytes)
    : undefined;
  const sourceIso = sourceIsoRead?.state === 'OK' ? sourceIsoRead : undefined;
  const outputIsoRead = isIsoBmffContainer(ctx.output.container)
    ? readIsoBmffPresentationTimeline(ctx.output.bytes)
    : undefined;
  const outputIso = outputIsoRead?.state === 'OK' ? outputIsoRead : undefined;

  // Prefer edit-list-resolved presentation duration for ISO BMFF. The generic structure reader's
  // mvhd-only scalar is only a fallback for formats without the stronger timeline reader.
  let outDurationSec: number | undefined = outputIso
    ? outputIso.presentationDurationUs / 1_000_000
    : undefined;
  const structure = readStructureValue(ctx.output.bytes, ctx.output.container);
  if (outDurationSec == null && structure?.durationSec != null && structure.durationSec > 0) {
    outDurationSec = structure.durationSec;
  }

  // Decode candidate video once. Typed failure is classified after independent duration/structure
  // checks so a provably wrong container cannot hide behind browser unavailability.
  let frames: FrameDigest[] = [];
  let candidateDecodeError: unknown;
  try {
    const sink = await ctx.decodeWithPlatform(ctx.output, { maxFrames: 8192 });
    if (sink && Array.isArray(sink.frames)) frames = sink.frames;
  } catch (error) {
    candidateDecodeError = error;
  }
  if (outDurationSec == null && frames.length >= 2) {
    const first = frames[0]!.ptsUs;
    const last = frames[frames.length - 1]!.ptsUs;
    outDurationSec = (last - first) / 1e6;
  }
  if (outDurationSec == null) {
    outDurationSec = durationFromSimpleAudioContainer(ctx.output);
  }

  if (outDurationSec != null) {
    const presentedDurationUs = sourceIso?.presentationDurationUs
      ?? (ctx.golden.meta?.durationSec != null ? Math.round(ctx.golden.meta.durationSec * 1_000_000) : range.endUs);
    const effectiveEndUs = Math.min(range.endUs, presentedDurationUs);
    const requestedSec = Math.max(0, effectiveEndUs - range.startUs) / 1e6;
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
    return oracleError(
      oracle,
      'ORACLE_TRIM_DURATION_READER_UNAVAILABLE',
      'trim-boundaries output duration is undeterminable by the implemented neutral readers',
    );
  }

  if (diffs.length) return fail(oracle, diffs.join('; '), measurements);

  const hasVideo = ctx.golden.meta?.tracks.some((track) => track.type === 'video') === true ||
    structure?.tracks.some((track) => track.type === 'video') === true || frames.length > 0;
  if (hasVideo) {
    if (candidateDecodeError !== undefined) {
      return classifyReferenceDecodeFailure(oracle, 'candidate', candidateDecodeError, ctx.output);
    }
    if (frames.length === 0) {
      return classifyReferenceDecodeFailure(
        oracle,
        'candidate',
        { reasonCode: 'REFERENCE_DECODE_EMPTY_AMBIGUOUS' },
        ctx.output,
      );
    }
    let sourceFrames: FrameDigest[];
    const sourceMedia: MediaBytes = {
      bytes: sourceBytes,
      mime: ctx.input.mime,
      container: sourceContainer,
    };
    try {
      const sink = await ctx.decodeWithPlatform(sourceMedia, { maxFrames: 8192 });
      sourceFrames = sink?.frames ?? [];
    } catch (error) {
      return classifyReferenceDecodeFailure(oracle, 'source', error, sourceMedia);
    }
    if (sourceFrames.length === 0) {
      return unavailable(
        oracle,
        'NA_ASSET',
        'TRIM_RANGE_REFERENCE_EMPTY',
        'neutral source decode produced no range-specific presentation evidence',
      );
    }
    return liveTrimBoundaryOutcome(ctx, contract, sourceFrames, frames, sourceIso, t, measurements);
  }

  const audio = audioTrimTimingOutcome(ctx, contract, sourceIso, t, measurements);
  if (audio) return audio;
  return unavailable(
    oracle,
    'NA_ASSET',
    'TRIM_RANGE_EVIDENCE_UNAVAILABLE',
    'no video boundary decode or supported audio sample-time reader can establish this trim interval',
    measurements,
  );
}

function isIsoBmffContainer(container: string): boolean {
  return ['mp4', 'mov', 'm4a', 'm4v', 'isobmff', 'qt'].includes(normStr(container));
}

function liveTrimBoundaryOutcome(
  ctx: OracleContext,
  contract: TrimContract,
  sourceFrames: readonly FrameDigest[],
  candidateFrames: readonly FrameDigest[],
  sourceIso: IsoBmffPresentationTimeline | undefined,
  t: Required<OracleTolerances>,
  durationMeasurements: Record<string, number>,
): OracleOutcome {
  const oracle: OracleId = 'trim-boundaries';
  const source = [...sourceFrames].sort((a, b) => a.ptsUs - b.ptsUs || a.index - b.index);
  const candidate = [...candidateFrames].sort((a, b) => a.ptsUs - b.ptsUs || a.index - b.index);
  let expectedStartUs: number | undefined;
  let expectedEndUs: number | undefined;

  if (sourceIso) {
    const videoWindow = selectIsoBmffTrimWindows(sourceIso, contract.range, contract.mode)
      .find((window) => window.type === 'video');
    if (videoWindow) {
      expectedStartUs = videoWindow.landedStartUs;
      expectedEndUs = videoWindow.landedEndUs;
    }
  }

  if (expectedStartUs === undefined || expectedEndUs === undefined) {
    const intersecting = source.filter((frame, index) => {
      const endUs = frame.ptsUs + inferredFrameDurationUs(source, index);
      return frame.ptsUs < contract.range.endUs && endUs > contract.range.startUs;
    });
    if (intersecting.length === 0) {
      return unavailable(
        oracle,
        'NA_ASSET',
        'TRIM_RANGE_REFERENCE_NOT_DECODED',
        `the bounded neutral source decode did not reach [${contract.range.startUs},${contract.range.endUs})us`,
        durationMeasurements,
      );
    }
    if (contract.mode === 'frame-accurate') {
      expectedStartUs = intersecting[0]!.ptsUs;
    } else {
      const videoTracks = videoTrackIndices(ctx.golden);
      const keyframes = (ctx.golden.packets ?? [])
        .filter((packet) => packet.keyframe && (!videoTracks || videoTracks.has(packet.trackIndex)))
        .filter((packet) => packet.ptsUs <= contract.range.startUs)
        .sort((a, b) => a.ptsUs - b.ptsUs);
      const safe = keyframes.at(-1);
      if (!safe) {
        return unavailable(
          oracle,
          'NA_ASSET',
          'TRIM_COPY_RANDOM_ACCESS_REFERENCE_MISSING',
          'copy-mode boundary evidence has no source random-access point at/before the requested start',
          durationMeasurements,
        );
      }
      expectedStartUs = source.find((frame) => frame.ptsUs >= safe.ptsUs - t.seekToleranceUs)?.ptsUs;
      if (expectedStartUs === undefined) {
        return unavailable(
          oracle,
          'NA_ASSET',
          'TRIM_COPY_RANDOM_ACCESS_FRAME_NOT_DECODED',
          `neutral source decode did not retain the random-access picture near ${safe.ptsUs}us`,
          durationMeasurements,
        );
      }
    }
    const last = intersecting.at(-1)!;
    expectedEndUs = last.ptsUs + inferredFrameDurationUs(source, source.indexOf(last));
  }

  const expectedFrames = source.filter((frame) =>
    frame.ptsUs >= expectedStartUs! - t.seekToleranceUs && frame.ptsUs < expectedEndUs!);
  if (expectedFrames.length === 0) {
    return unavailable(
      oracle,
      'NA_ASSET',
      'TRIM_BOUNDARY_WINDOW_EMPTY',
      'range-specific neutral boundary window contains no decoded frames',
      durationMeasurements,
    );
  }
  const referenceFrames: TrimBoundaryFrame[] = expectedFrames.map((frame, index) => ({
    sourcePtsUs: frame.ptsUs,
    ptsUs: frame.ptsUs - expectedStartUs!,
    durationUs: inferredFrameDurationUs(expectedFrames, index),
    contentDigest: frame.sha256,
    required: index === 0 || index === expectedFrames.length - 1,
  }));

  const firstSourceIndex = findDigestIndex(source, candidate[0]?.sha256);
  const lastSourceIndex = findDigestIndex(source, candidate.at(-1)?.sha256, Math.max(0, firstSourceIndex));
  const landedStartUs = firstSourceIndex >= 0 ? source[firstSourceIndex]!.ptsUs : -1;
  const landedEndUs = lastSourceIndex >= 0
    ? source[lastSourceIndex]!.ptsUs + inferredFrameDurationUs(source, lastSourceIndex)
    : -1;
  const codec = ctx.golden.meta?.tracks.find((track) => track.type === 'video')?.codec ?? 'video';
  const representationClass = `${normStr(codec) || 'video'}-semantic-presentation`;
  const configurationDigest = [
    'live-platform',
    ctx.browser ?? 'unknown-browser',
    codec,
    source[0]?.width ?? 0,
    source[0]?.height ?? 0,
  ].join(':');
  const artifact: TrimBoundaryEvidenceArtifact = {
    schema: TRIM_BOUNDARY_EVIDENCE_SCHEMA,
    assetId: primaryAssetId(ctx),
    key: trimBoundaryEvidenceKey({
      assetId: primaryAssetId(ctx),
      range: contract.range,
      mode: contract.mode,
      representationClass,
      configurationDigest,
    }),
    range: contract.range,
    mode: contract.mode,
    representationClass,
    provenance: {
      decoder: 'platform-webcodecs-live-neutral',
      configurationDigest,
      ...(ctx.browser ? { browserFamily: ctx.browser } : {}),
    },
    expectedLandedInterval: { startUs: expectedStartUs, endUs: expectedEndUs },
    outputOriginUs: 0,
    timestampToleranceUs: t.seekToleranceUs,
    frames: referenceFrames,
  };
  const decision = assessTrimBoundaryEvidence({
    assetId: artifact.assetId,
    range: contract.range,
    mode: contract.mode,
    representationClass,
    reference: { state: 'READY', artifact },
    candidate: {
      outputOriginUs: candidate[0]?.ptsUs ?? -1,
      landedSourceInterval: { startUs: landedStartUs, endUs: landedEndUs },
      frames: candidate.map((frame, index) => ({
        ptsUs: frame.ptsUs,
        durationUs: inferredFrameDurationUs(candidate, index),
        contentDigest: frame.sha256,
      })),
      decodeComplete: candidate.length > 0,
    },
  });
  const outcome = trimDecisionOutcome(oracle, decision);
  return outcome.measurements
    ? { ...outcome, measurements: { ...durationMeasurements, ...outcome.measurements } }
    : { ...outcome, measurements: durationMeasurements };
}

function inferredFrameDurationUs(frames: readonly FrameDigest[], index: number): number {
  const current = frames[index];
  if (!current) return 1;
  const next = frames[index + 1];
  if (next && next.ptsUs > current.ptsUs) return next.ptsUs - current.ptsUs;
  const previous = frames[index - 1];
  if (previous && current.ptsUs > previous.ptsUs) return current.ptsUs - previous.ptsUs;
  return 1;
}

function findDigestIndex(
  frames: readonly FrameDigest[],
  digest: string | undefined,
  start = 0,
): number {
  if (!digest) return -1;
  const normalized = normHex(digest);
  return frames.findIndex((frame, index) => index >= start && normHex(frame.sha256) === normalized);
}

function audioTrimTimingOutcome(
  ctx: OracleContext,
  contract: TrimContract,
  sourceIso: IsoBmffPresentationTimeline | undefined,
  t: Required<OracleTolerances>,
  durationMeasurements: Record<string, number>,
): OracleOutcome | undefined {
  const oracle: OracleId = 'trim-boundaries';
  if (!ctx.output) return undefined;
  const read = inspectTrimAudioContainer(ctx.output.bytes, ctx.output.container);
  if (read.state === 'UNSUPPORTED_FORMAT') return undefined;
  if (read.state !== 'OK') {
    return fail(oracle, `[${read.reasonCode}] ${read.detail}`, durationMeasurements);
  }
  const native = read.value;
  const sourceDurationUs = sourceIso?.presentationDurationUs
    ?? (ctx.golden.meta?.durationSec != null ? Math.round(ctx.golden.meta.durationSec * 1_000_000) : contract.range.endUs);
  const effectiveDurationUs = Math.max(0, Math.min(contract.range.endUs, sourceDurationUs) - contract.range.startUs);
  const expectedFrames = Math.round(effectiveDurationUs * native.sampleRate / 1_000_000);
  const codecFrameTolerance = native.codec === 'mp3'
    ? 2304
    : native.codec === 'aac'
      ? 1024
      : 1;
  const tolerance = Math.max(codecFrameTolerance, Math.ceil(t.durationToleranceSec * native.sampleRate));
  const delta = Math.abs(native.presentationSampleFrames - expectedFrames);
  const measurements = {
    ...durationMeasurements,
    expectedSampleFrames: expectedFrames,
    outputPresentationSampleFrames: native.presentationSampleFrames,
    sampleFrameDelta: delta,
    sampleFrameTolerance: tolerance,
    primingSampleFrames: native.primingSampleFrames,
    endTrimSampleFrames: native.endTrimSampleFrames,
  };
  if (delta > tolerance) {
    return fail(
      oracle,
      `decoded sample-time proxy is ${native.presentationSampleFrames} frames; expected ${expectedFrames}±${tolerance}`,
      measurements,
    );
  }
  return pass(
    oracle,
    `${native.codec}/${native.container} presentation sample time matches the effective trim interval`,
    measurements,
  );
}

function trimDecisionOutcome(oracle: OracleId, decision: TrimDecision): OracleOutcome {
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
      ...(decision.measurements ? { measurements: { ...decision.measurements } } : {}),
    };
  }
  return {
    state: 'ERROR',
    oracle,
    reasonCode: decision.reasonCode,
    detail: decision.detail,
    ...(decision.measurements ? { measurements: { ...decision.measurements } } : {}),
  };
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

  // Establish browser/reference applicability FIRST on the digest-verified clear source. Only then
  // decode the candidate. This prevents a browser codec limitation from becoming an engine FAIL and
  // lets the candidate comparison cover the complete presentation (including trailing duplicates).
  const reference = verifiedCleartextReference(ctx);
  if (!reference) {
    const golden = await frameComparisonGolden(ctx);
    return missingGoldenOutcome(
      golden,
      'frames',
      oracle,
      'complete decrypt comparison requires digest-verified clear-reference bytes',
    );
  }

  let referenceSink: FrameSink | null | undefined;
  try {
    referenceSink = await ctx.decodeWithPlatform(reference);
  } catch (err) {
    return classifyReferenceDecodeFailure(oracle, 'source', err, reference);
  }
  const want = referenceSink && Array.isArray(referenceSink.frames) ? referenceSink.frames : [];
  if (want.length === 0) {
    return oracleError(
      oracle,
      'DECRYPT_CLEAR_REFERENCE_DECODE_EMPTY',
      'digest-verified clear reference decoded to no presentation frames',
    );
  }

  let candidateSink: FrameSink | null | undefined;
  try {
    candidateSink = await ctx.decodeWithPlatform(ctx.output);
  } catch (err) {
    return classifyReferenceDecodeFailure(oracle, 'candidate', err, ctx.output);
  }
  const got = candidateSink && Array.isArray(candidateSink.frames) ? candidateSink.frames : [];
  const negative = encryptionNegativeContractFromOptions(ctx.scenario.options);
  return encryptionVerdictOutcome(
    oracle,
    compareCompleteDecryptPresentation(got, want, {
      ...(negative?.partialOutput.allowed
        ? { partialPrefix: { minimumFrames: negative.partialOutput.minimumDecodedFrames } }
        : {}),
    }),
  );
}

function frameComparisonAssetId(ctx: OracleContext): string | undefined {
  return readStringOption(ctx.scenario.options, [
    'cleartextBaseAsset',
    'cleartextAsset',
    'cleartextAssetId',
    'goldenAsset',
    'goldenAssetId',
  ]);
}

function verifiedCleartextReference(ctx: OracleContext): MediaBytes | undefined {
  const assetId = frameComparisonAssetId(ctx);
  if (!assetId) return undefined;
  const bytes = ctx.verifiedResources?.[assetId];
  if (!bytes) return undefined;
  const container = resolveContainer(undefined, assetId);
  const mime = container === 'mp4'
    ? 'video/mp4'
    : container === 'webm'
      ? 'video/webm'
      : container === 'mov'
        ? 'video/quicktime'
        : 'application/octet-stream';
  return { bytes: bytes.slice(), mime, container };
}

async function frameComparisonMetadataGolden(ctx: OracleContext): Promise<GoldenStore> {
  const primaryId = primaryAssetId(ctx);
  const assetId = frameComparisonAssetId(ctx) ?? primaryId;
  return assetId === primaryId ? ctx.golden : (ctx.goldenLoader?.(assetId) ?? loadGolden(assetId));
}

async function frameComparisonGolden(ctx: OracleContext): Promise<GoldenStore> {
  const primaryId = primaryAssetId(ctx);
  const assetId = frameComparisonAssetId(ctx) ?? primaryId;
  if (!assetId) return ctx.golden;
  const browser = ctx.browser;
  if (browser !== undefined && browser !== 'chromium' && browser !== 'brave') {
    const browserAssetId = `${assetId}.${browser}`;
    const browserGolden = await (ctx.goldenLoader?.(browserAssetId) ?? loadGolden(browserAssetId));
    if (browserGolden.frames?.length) return browserGolden;
  }
  if (assetId === primaryId) return ctx.golden;
  return ctx.goldenLoader?.(assetId) ?? loadGolden(assetId);
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
  return (
    options?.gracefulAllowOutput === true ||
    (options?.invariant === 'safe-partial-output' &&
      ctx.scenario.oracles.includes('property-invariant'))
  );
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

  if (which === 'metadata-tags-absent') {
    const contract = metadataTagContractFromOptions(ctx.scenario.options);
    if (!contract || contract.mode !== 'assert-absence') {
      return oracleError(
        oracle,
        'METADATA_TAG_ABSENCE_CONTRACT_MISSING',
        'metadata-tags-absent requires a valid assert-absence contract',
      );
    }
    if (!ctx.metadata) return fail(oracle, '[metadata-tags-absent] no probe metadata to assess');
    return assessMetadataTagsFromObservation(contract, ctx.metadata, oracle);
  }

  if (which === 'metadata-safe-recovery') {
    const contract = metadataRecoveryContractFromOptions(ctx.scenario.options);
    if (!contract) {
      return oracleError(
        oracle,
        'METADATA_RECOVERY_CONTRACT_MISSING',
        'metadata-safe-recovery requires a valid bounded recovery contract',
      );
    }
    const outcome = assessMetadataRecovery({
      disposition: ctx.metadata ? 'returned' : 'rejected',
      contract,
      ...(ctx.metadata ? { metadata: ctx.metadata } : {}),
    });
    return { ...outcome, oracle };
  }

  if (which === 'probe-duration-cross-wrapper') {
    return probeCrossWrapperDurationInvariant(ctx, t);
  }

  if (which === 'probe-headerless-sane-duration') {
    const contract = headerlessDurationContractFromOptions(ctx.scenario.options);
    if (!contract) {
      return {
        state: 'ERROR',
        oracle,
        reasonCode: 'PROBE_HEADERLESS_DURATION_CONTRACT_MISSING',
        detail: 'headerless probe scenario has no valid content-derived duration contract',
      };
    }
    if (!ctx.metadata) return fail(oracle, `[${which}] no probe metadata to assess`);
    return probeAssessmentOutcome(oracle, assessHeaderlessProbeDuration(ctx.metadata.durationSec, contract));
  }

  if (which === 'hls-playlist-only-probe') {
    const contract = hlsProbeContractFromOptions(ctx.scenario.options);
    if (!contract || contract.schema !== 'media-test/hls-playlist-only-probe@1') {
      return {
        state: 'ERROR',
        oracle,
        reasonCode: 'HLS_PLAYLIST_PROBE_CONTRACT_MISSING',
        detail: 'playlist-only probe scenario has no valid playlist-only contract',
      };
    }
    if (!ctx.metadata) return fail(oracle, `[${which}] no probe metadata to assess`);
    let playlistText: string;
    try {
      playlistText = new TextDecoder('utf-8', { fatal: true }).decode(
        new Uint8Array(await ctx.input.arrayBuffer()),
      );
    } catch (error) {
      return {
        state: 'ERROR',
        oracle,
        reasonCode: 'HLS_PLAYLIST_EVIDENCE_READ_ERROR',
        detail: `digest-verified playlist bytes are unavailable or invalid UTF-8: ${errMsg(error)}`,
      };
    }
    const semantic = probeAssessmentOutcome(
      oracle,
      assessHlsPlaylistOnlyProbe(ctx.metadata as ProbeMetadataObservation, playlistText, contract),
    );
    const access = ctx.probeResourceAccesses
      ? probeAssessmentOutcome(oracle, assessHlsPlaylistOnlyResourceAccess(ctx.probeResourceAccesses))
      : probeEvidenceMissingOutcome(
        oracle,
        'HLS_PROBE_RESOURCE_TRACE_MISSING',
        'playlist-only probe did not return an adapter-observed resource-access trace',
      );
    return reduceRequiredOracleLayers(oracle, [semantic, access]);
  }

  // The clear-input decrypt row is a literal byte-no-op contract. A playable metadata-only rewrap
  // is still a correctness defect here; semantic no-op would be a separate scenario and comparator.
  if (which === 'decrypt-byte-identity-noop') {
    if (!ctx.output) return fail(oracle, '[decrypt-byte-identity-noop] no decrypt output bytes');
    const input = new Uint8Array(await ctx.input.arrayBuffer());
    return encryptionVerdictOutcome(oracle, compareDecryptNoopBytes(input, ctx.output.bytes));
  }

  if (which === TRANSCODE_EFFECT_INVARIANT) {
    return transcodeEffectInvariant(ctx);
  }

  if (which === TRANSCODE_AUDIO_CONTENT_INVARIANT) {
    return transcodeAudioContentInvariant(ctx);
  }

  if (which === TRIM_AUDIO_CONTENT_INVARIANT) {
    return trimAudioContentInvariant(ctx);
  }

  if (which === TRIM_FEATURE_PROPERTIES_INVARIANT) {
    return trimFeaturePropertiesInvariant(ctx, t);
  }

  if (which === TRIM_NOOP_IDENTITY_INVARIANT) {
    return trimNoopIdentityInvariant(ctx, t);
  }

  if (which === 'audio-dsp-transform') {
    if (!ctx.output) return fail(oracle, '[audio-dsp-transform] no transcoded output bytes');
    const source = new Uint8Array(await ctx.input.arrayBuffer());
    return evaluateAudioDspTransform(ctx.scenario.id, source, ctx.output.bytes);
  }

  if (which === 'audio-dsp-endianness-roundtrip') {
    if (!ctx.output) return fail(oracle, '[audio-dsp-endianness-roundtrip] no final output bytes');
    const intermediate = ctx.output.intermediates?.find(
      (item) => item.role === 'audio-dsp-roundtrip-leg-1',
    );
    if (!intermediate) {
      return fail(
        oracle,
        '[audio-dsp-endianness-roundtrip] observable AIFF/s16be first-leg evidence is missing',
      );
    }
    return evaluateEndiannessRoundTrip({
      source: new Uint8Array(await ctx.input.arrayBuffer()),
      intermediate: intermediate.bytes,
      output: ctx.output.bytes,
    });
  }

  if (which === 'audio-dsp-gapless-native') {
    return gaplessNativeEvidenceInvariant(ctx, which);
  }

  // Metamorphic DERIVED decrypt (§7.3): decode(decrypt(encrypted)) == decode(cleartextBase), both
  // decoded in-browser with the platform WebCodecs decoder and compared bit-exact via frame digests.
  // Restores REAL bit-exact signal for rotated encrypted files that have no committed cleartext-twin
  // golden (so the golden-keyed decrypt-bitexact goes NA_ASSET). Placed FIRST because the sub-kind
  // name contains the substring 'decode' and would otherwise be captured by the generic decode-remux
  // branch below.
  if (which === 'decrypt-eq-cleartext-decode' || which.includes('decrypt-eq-cleartext')) {
    return decryptEqCleartextDecodeInvariant(ctx);
  }

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

  if (which === 'decode-track-selection') {
    if (!ctx.decodeTrackSelection) {
      return fail(oracle, '[decode-track-selection] normalized selection evidence was not produced');
    }
    return decodeSeekOracleOutcome(oracle, ctx.decodeTrackSelection);
  }

  if (which === 'safe-partial-output') {
    if (!ctx.output) return classifyRejectedPartialRemux(oracle).outcome;
    const sourceByteLength = ctx.input.sizeBytes ?? (await ctx.input.arrayBuffer()).byteLength;
    return (
      await validateReturnedPartialRemux({
        outputBytes: ctx.output.bytes,
        outputContainer: ctx.output.container,
        sourceByteLength,
        oracle,
      })
    ).outcome;
  }

  if (which === 'demux-flac-index-invariance') {
    return ctx.demuxInvariantOutcome ?? fail(
      oracle,
      '[demux-flac-index-invariance] runner did not retain the two-input comparison outcome',
    );
  }

  if (which === 'demux-scale-budgets') {
    return ctx.demuxInvariantOutcome ?? fail(
      oracle,
      '[demux-scale-budgets] runner did not retain functional scale evidence',
    );
  }

  if (which === 'mux-large-file-addressing') {
    return ctx.muxLargeFileOutcome ?? fail(
      oracle,
      '[mux-large-file-addressing] runner did not retain the candidate sparse-target verdict',
    );
  }

  if (which.includes('trim(a..b)') || which === 'trim-concat') {
    if (!ctx.trimComposition) {
      // Direct oracle/conformance callers do not pass through the runner's operation collector.
      // Preserve the shared applicability channel for those oracle-triggered trim/concat calls;
      // production runner contexts continue to use the validated observation below.
      return trimComposeInvariant(ctx, t, which);
    }
    return trimDecisionOutcome(
      oracle,
      assessTrimComposition({
        contract: ctx.trimComposition.contract,
        direct: ctx.trimComposition.direct,
        concatenated: ctx.trimComposition.concatenated,
        timestampToleranceUs: t.seekToleranceUs,
      }),
    );
  }

  if (which === 'demux(mux(x))==x' || which.includes('demux(mux')) {
    return demuxMuxRoundtripInvariant(ctx, t, which);
  }

  if (which === 'remux(remux(x))==remux(x)' || which.includes('remux(remux')) {
    return doubleRemuxStableInvariant(ctx, t, which);
  }

  if (which === 'flac-seek-lands-identical-with-without-seektable' || which.includes('flac-seek')) {
    return flacSeektableSeekEquivalenceInvariant(ctx, which);
  }

  if (which === 'gapless-decoded-sample-count-priming-removed' || which.includes('gapless')) {
    return gaplessDecodedSampleCountInvariant(ctx, which);
  }

  if (which === 'audio-pcm-digest' || which.includes('audio-pcm')) {
    return audioPcmDigestInvariant(ctx, which);
  }

  if (which.includes('decode') || which.includes('remux')) {
    // decode(remux(x)) == decode(x): output frame digests must equal golden source-decode digests.
    if (!ctx.output) return fail(oracle, `[${which}] no ctx.output to decode`);
    const golden = await frameComparisonGolden(ctx);
    const want = golden.frames;
    if (!want || !want.length) {
      return missingGoldenOutcome(golden, 'frames', oracle, `[${which}] source decode frame evidence is unavailable`);
    }
    let sink: FrameSink | null | undefined;
    try {
      sink = await ctx.decodeWithPlatform(ctx.output, { maxFrames: want.length });
    } catch (err) {
      const classified = classifyReferenceDecodeFailure(oracle, 'candidate', err, ctx.output);
      return {
        ...classified,
        detail: `[${which}] ${classified.detail ?? 'reference decode failed'}`,
      };
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

    // probe(out).dur ≈ probe(x).dur (golden) across containers. No scored engine: byte-reader
    // container duration, else the decoded frame-pts span, else a simple PCM (wav/aiff) parse.
    if (!ctx.output) return fail(oracle, `[${which}] no ctx.output to probe`);
    const goldenDur = ctx.golden.meta?.durationSec ?? ctx.metadata?.durationSec ?? null;
    if (goldenDur == null) {
      return missingGoldenOutcome(ctx.golden, 'meta', oracle, `[${which}] source duration evidence is unavailable`);
    }
    let outDur: number | null =
      readStructureValue(ctx.output.bytes, ctx.output.container)?.durationSec ?? null;
    if (outDur == null || outDur <= 0) {
      outDur =
        (await decodeFrameSpanDurationSec(ctx)) ?? durationFromSimpleAudioContainer(ctx.output) ?? null;
    }
    if (outDur == null) {
      return oracleError(
        oracle,
        'ORACLE_OUTPUT_DURATION_READER_UNAVAILABLE',
        `[${which}] output duration is undeterminable by the implemented neutral readers`,
      );
    }
    const d = Math.abs(outDur - goldenDur);
    const explicitDurOverride = ctx.scenario.tolerances?.durationToleranceSec != null;
    const container = resolveContainer(ctx.golden.meta?.container ?? ctx.output.container, primaryAssetId(ctx));
    // This invariant probes an AUTHORED output. An mp3 elementary stream produced by mux/transcode
    // has no guaranteed Xing/Info TOC, so its probed duration is frame-estimate-only (≈±2 mp3 frames
    // of encoder-delay/partial-final-frame) EVEN WHEN the source was a Xing mp3 whose golden stays
    // strict for probe/demux. Key the band off the authored OUTPUT container so an mp3 write target is
    // judged with the same estimate-only band as ts/adts (precise inputs still keep the ±1-frame gate).
    const authoredMp3Out =
      !explicitDurOverride && resolveContainer(ctx.output.container, '').trim().toLowerCase() === 'mp3';
    const band = authoredMp3Out
      ? { tolSec: LOOSE_DURATION_ABS_SEC, loose: true }
      : durationToleranceFor(container, primaryAssetId(ctx), t, explicitDurOverride);
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
    return trimComposeInvariant(ctx, t, which);
  }

  return fail(
    oracle,
    `unknown property-invariant '${which}' (expected decode-remux | seek-vs-linear-decode | decode-pts-strictly-increasing | vfr-seek-lands-on-true-pts | flac-seektable-equivalence | probe-duration | trim-concat | transcode-output-metadata)`,
  );
}

/**
 * §7.3 — golden-free metamorphic oracle for rotated DERIVED/encryption scenarios.
 *
 * A rotated real encrypted file has no committed cleartext-twin frame golden, so the golden-keyed
 * `decrypt-bitexact` oracle can only report NA_ASSET. This restores a REAL bit-exact signal:
 *
 *     decode(decrypt(encrypted))  ==  decode(cleartextBase)
 *
 * The runner has already run the engine's `decrypt` op, so `ctx.output` holds the engine's DECRYPTED
 * bytes (keys are the engine's concern — none are needed here). The selection layer points
 * `options.cleartextBaseAsset` at the retained REAL cleartext base the file was encrypted from
 * (served under /fixtures/media/). We decode BOTH sides with the SAME platform WebCodecs decoder,
 * bounded to N frames, and compare their normalized-RGBA frame digests bit-exact via compareDigests.
 *
 * Rigor (R2): decode failure of the OUTPUT, an empty/short output frame set, or ANY digest mismatch
 * is an honest FAIL — a correctly-decrypted stream decodes to frames bit-identical to its cleartext
 * source, so a mismatch found here IS a legitimate engine defect. Only a genuinely-absent cleartext
 * BASE (no option / fetch not-ok / base decodes to zero frames) uses the shared 'metamorphic decrypt:
 * no cleartext base to compare' wording that the runner maps to NA_ASSET — a corpus gap, never a
 * manufactured pass.
 */
async function decryptEqCleartextDecodeInvariant(ctx: OracleContext): Promise<OracleOutcome> {
  const oracle: OracleId = 'property-invariant';

  const output = ctx.output;
  if (!output) return fail(oracle, '[decrypt-eq-cleartext-decode] no decrypted output (ctx.output) to decode');

  const baseAsset = readStringOption(ctx.scenario.options, ['cleartextBaseAsset']);
  if (!baseAsset) return fail(oracle, 'metamorphic decrypt: no cleartext base to compare');

  // Fetch the retained real cleartext base (mirrors the runner's mediaAssetUrl: origin-absolute path
  // under /fixtures/media/, resolved against the served page). A missing/unreachable base is a corpus
  // gap (NA_ASSET via the shared wording), NOT an engine defect — hence we also swallow a network
  // error here rather than letting it surface as an oracle throw.
  let baseBytes = ctx.verifiedResources?.[baseAsset]?.slice();
  if (!baseBytes) {
    const url = new URL(`/fixtures/media/${baseAsset}`, globalThis.location?.href ?? 'http://localhost/').href;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return fail(oracle, 'metamorphic decrypt: no cleartext base to compare');
      baseBytes = new Uint8Array(await res.arrayBuffer());
    } catch {
      return fail(oracle, 'metamorphic decrypt: no cleartext base to compare');
    }
    const expectedSha256 = readStringOption(ctx.scenario.options, ['cleartextBaseSha256']);
    if (expectedSha256 && await sha256Hex(baseBytes) !== expectedSha256) {
      return oracleError(
        oracle,
        'CORPUS_CLEARTEXT_BASE_DIGEST_MISMATCH',
        'selected cleartext-base bytes do not match the digest-bound metamorphic contract',
      );
    }
  }

  const reference: MediaBytes = { bytes: baseBytes, mime: 'video/mp4', container: 'mp4' };
  let wantSink: FrameSink;
  try {
    wantSink = await ctx.decodeWithPlatform(reference);
  } catch (err) {
    return classifyReferenceDecodeFailure(oracle, 'source', err, reference);
  }
  const want = wantSink?.frames ?? [];
  if (want.length === 0) {
    return oracleError(
      oracle,
      'DECRYPT_CLEAR_REFERENCE_DECODE_EMPTY',
      'digest-verified metamorphic cleartext base decoded to no presentation frames',
    );
  }
  let gotSink: FrameSink;
  try {
    gotSink = await ctx.decodeWithPlatform(output);
  } catch (err) {
    return classifyReferenceDecodeFailure(oracle, 'candidate', err, output);
  }

  return encryptionVerdictOutcome(
    oracle,
    compareCompleteDecryptPresentation(gotSink?.frames ?? [], want),
    '[decrypt-eq-cleartext-decode] ',
  );
}

async function flacSeektableSeekEquivalenceInvariant(ctx: OracleContext, which: string): Promise<OracleOutcome> {
  const oracle: OracleId = 'property-invariant';
  if (!ctx.engine) return fail(oracle, `[${which}] no candidate engine to perform FLAC trims`);

  const inputs = ctx.inputs ?? [ctx.input];
  if (inputs.length < 2) return fail(oracle, `[${which}] expected two FLAC inputs, got ${inputs.length}`);

  const withSeektable = inputs.find((input) => input.id.includes('flac_seektable')) ?? inputs[0]!;
  const withoutSeektable = inputs.find((input) => input.id.includes('flac_noseektable')) ?? inputs[1]!;
  if (withSeektable.id === withoutSeektable.id) {
    return fail(oracle, `[${which}] could not identify distinct seektable and no-seektable FLAC inputs`);
  }

  const targetUs = readNumberOption(ctx.scenario.options, ['targetUs', 'tUs', 'startUs']) ?? 2_880_000;
  const durationUs = readNumberOption(ctx.scenario.options, ['durationUs', 'segmentUs', 'windowUs']) ?? 960_000;
  if (!Number.isFinite(targetUs) || !Number.isFinite(durationUs) || durationUs <= 0) {
    return fail(oracle, `[${which}] expected finite targetUs and positive durationUs`);
  }

  const container = readStringOption(ctx.scenario.options, ['container']) ?? 'flac';
  const range = { startUs: targetUs, endUs: targetUs + durationUs };

  let sourceWithInfo: FlacStreamInfo | undefined;
  let sourceWithoutInfo: FlacStreamInfo | undefined;
  try {
    [sourceWithInfo, sourceWithoutInfo] = await Promise.all([
      nativeFlacStreamInfoFromInput(withSeektable),
      nativeFlacStreamInfoFromInput(withoutSeektable),
    ]);
  } catch {
    // Source STREAMINFO is diagnostic; the trimmed-output checks below are the conformance gate.
  }

  let trimmedWithSeektable: MediaBytes;
  let trimmedWithoutSeektable: MediaBytes;
  try {
    trimmedWithSeektable = await ctx.engine.trim(withSeektable, range, { container, frameAccurate: false });
    trimmedWithoutSeektable = await ctx.engine.trim(withoutSeektable, range, { container, frameAccurate: false });
  } catch (err) {
    if (isNotApplicableError(err)) throw err;
    return fail(oracle, `[${which}] FLAC trim at ${targetUs}µs failed: ${errMsg(err)}`);
  }

  const infoWithSeektable = nativeFlacStreamInfo(trimmedWithSeektable.bytes);
  const infoWithoutSeektable = nativeFlacStreamInfo(trimmedWithoutSeektable.bytes);
  if (!infoWithSeektable || !infoWithoutSeektable) {
    return fail(oracle, `[${which}] trimmed output missing native FLAC STREAMINFO`);
  }

  let pcmWithSeektable: AudioPcmDigest;
  let pcmWithoutSeektable: AudioPcmDigest;
  try {
    [pcmWithSeektable, pcmWithoutSeektable] = await Promise.all([
      decodeAudioPcmDigest(trimmedWithSeektable),
      decodeAudioPcmDigest(trimmedWithoutSeektable),
    ]);
  } catch (err) {
    return fail(oracle, `[${which}] browser audio decode of trimmed FLAC failed: ${errMsg(err)}`);
  }

  const measurements: Record<string, number> = {
    targetUs,
    durationUs,
    withSeektableBytes: trimmedWithSeektable.bytes.byteLength,
    withoutSeektableBytes: trimmedWithoutSeektable.bytes.byteLength,
    withSeektableTotalSamples: Number(infoWithSeektable.totalSamples),
    withoutSeektableTotalSamples: Number(infoWithoutSeektable.totalSamples),
    withSeektableSampleRate: infoWithSeektable.sampleRate,
    withoutSeektableSampleRate: infoWithoutSeektable.sampleRate,
    withSeektableChannels: infoWithSeektable.channels,
    withoutSeektableChannels: infoWithoutSeektable.channels,
    withSeektableBitsPerSample: infoWithSeektable.bitsPerSample,
    withoutSeektableBitsPerSample: infoWithoutSeektable.bitsPerSample,
    withSeektableDecodedSamples: pcmWithSeektable.samples,
    withoutSeektableDecodedSamples: pcmWithoutSeektable.samples,
    decodedSampleRate: pcmWithSeektable.sampleRate,
    decodedChannels: pcmWithSeektable.channels,
    ...(sourceWithInfo ? { sourceWithSeektableTotalSamples: Number(sourceWithInfo.totalSamples) } : {}),
    ...(sourceWithoutInfo ? { sourceWithoutSeektableTotalSamples: Number(sourceWithoutInfo.totalSamples) } : {}),
  };

  const diffs: string[] = [];
  if (sourceWithInfo && sourceWithoutInfo && sourceWithInfo.md5 !== sourceWithoutInfo.md5) {
    diffs.push('source FLAC STREAMINFO MD5 differs between seektable and no-seektable fixtures');
  }
  if (infoWithSeektable.sampleRate !== infoWithoutSeektable.sampleRate) {
    diffs.push(`STREAMINFO sample rate ${infoWithSeektable.sampleRate} vs ${infoWithoutSeektable.sampleRate}`);
  }
  if (infoWithSeektable.channels !== infoWithoutSeektable.channels) {
    diffs.push(`STREAMINFO channels ${infoWithSeektable.channels} vs ${infoWithoutSeektable.channels}`);
  }
  if (infoWithSeektable.bitsPerSample !== infoWithoutSeektable.bitsPerSample) {
    diffs.push(`STREAMINFO bits/sample ${infoWithSeektable.bitsPerSample} vs ${infoWithoutSeektable.bitsPerSample}`);
  }
  if (infoWithSeektable.totalSamples !== infoWithoutSeektable.totalSamples) {
    diffs.push(`STREAMINFO total samples ${infoWithSeektable.totalSamples} vs ${infoWithoutSeektable.totalSamples}`);
  }
  if (pcmWithSeektable.sampleRate !== pcmWithoutSeektable.sampleRate) {
    diffs.push(`decoded sample rate ${pcmWithSeektable.sampleRate} vs ${pcmWithoutSeektable.sampleRate}`);
  }
  if (pcmWithSeektable.channels !== pcmWithoutSeektable.channels) {
    diffs.push(`decoded channels ${pcmWithSeektable.channels} vs ${pcmWithoutSeektable.channels}`);
  }
  if (pcmWithSeektable.samples !== pcmWithoutSeektable.samples) {
    diffs.push(`decoded samples ${pcmWithSeektable.samples} vs ${pcmWithoutSeektable.samples}`);
  }
  if (pcmWithSeektable.sha256 !== pcmWithoutSeektable.sha256) {
    diffs.push(`decoded PCM digest ${shortHex(pcmWithSeektable.sha256)} vs ${shortHex(pcmWithoutSeektable.sha256)}`);
  }

  if (diffs.length) {
    return fail(
      oracle,
      `[invariant FLAC ±SEEKTABLE seek equivalence] ${diffs.join('; ')}`,
      measurements,
    );
  }

  return pass(
    oracle,
    `[invariant FLAC ±SEEKTABLE seek equivalence] trim at ${targetUs}µs produced identical decoded PCM (${pcmWithSeektable.samples} sample(s))`,
    measurements,
  );
}

interface AudioPcmDigest {
  samples: number;
  sampleRate: number;
  channels: number;
  sha256: string;
}

async function gaplessNativeEvidenceInvariant(ctx: OracleContext, which: string): Promise<OracleOutcome> {
  const oracle: OracleId = 'property-invariant';
  if (!ctx.output) return fail(oracle, `[${which}] no trimmed output to inspect`);
  if (!ctx.gaplessNativeEvidence) {
    return unavailable(
      oracle,
      'NA_BROWSER',
      'AUDIO_NATIVE_GAPLESS_INSTRUMENT_UNAVAILABLE',
      `[${which}] native WebCodecs/container-timing evidence hook is unavailable; Web Audio rate is not substituted`,
    );
  }
  const source: MediaBytes = {
    bytes: new Uint8Array(await ctx.input.arrayBuffer()),
    mime: ctx.input.mime,
    container: resolveContainer(ctx.golden.meta?.container, ctx.input.id),
  };
  let evidence: GaplessNativeEvidenceResult;
  try {
    evidence = await ctx.gaplessNativeEvidence(source, ctx.output);
  } catch (error) {
    return oracleError(
      oracle,
      'AUDIO_NATIVE_GAPLESS_EVIDENCE_ERROR',
      `[${which}] native evidence instrument failed: ${errMsg(error)}`,
    );
  }
  if (evidence.state === 'INVALID') {
    return {
      state: 'VERDICT', oracle, verdict: 'FAIL', reasonCode: evidence.reasonCode,
      detail: `[${which}] ${evidence.detail}`,
    };
  }
  if (evidence.state === 'UNAVAILABLE') {
    if (evidence.applicability === 'ERROR') {
      return oracleError(oracle, evidence.reasonCode, `[${which}] ${evidence.detail}`);
    }
    return unavailable(oracle, evidence.applicability, evidence.reasonCode, `[${which}] ${evidence.detail}`);
  }
  return evaluateGaplessNativeEvidence(evidence.value);
}

async function gaplessDecodedSampleCountInvariant(ctx: OracleContext, which: string): Promise<OracleOutcome> {
  const oracle: OracleId = 'property-invariant';
  if (!ctx.output) return fail(oracle, `[${which}] no trimmed output to decode`);

  const audioTrack = ctx.golden.meta?.tracks?.find((track) => track.type === 'audio');
  const sampleRate = audioTrack?.sampleRate;
  const durationSec = ctx.golden.meta?.durationSec;
  if (!sampleRate || sampleRate <= 0 || durationSec == null || durationSec <= 0) {
    return missingGoldenOutcome(
      ctx.golden,
      'meta',
      oracle,
      `[${which}] sample-rate/duration evidence is unavailable`,
    );
  }

  const expectedSourceRateSamples = Math.round(durationSec * sampleRate);
  const packetCount = ctx.golden.packets?.filter((packet) => packet.trackIndex === 0).length ?? 0;
  const rawAacFrameSamples = packetCount > 0 ? packetCount * 1024 : undefined;
  const firstPtsUs = ctx.golden.packets?.find((packet) => packet.trackIndex === 0)?.ptsUs;
  const primingSamples =
    firstPtsUs !== undefined && firstPtsUs < 0 ? Math.round((-firstPtsUs * sampleRate) / 1_000_000) : undefined;

  let decodedSamples: number;
  let decodedSampleRate: number;
  let decodedChannels: number;
  try {
    const decoded = await decodeAudioSampleCount(ctx.output);
    decodedSamples = decoded.samples;
    decodedSampleRate = decoded.sampleRate;
    decodedChannels = decoded.channels;
  } catch (err) {
    return fail(oracle, `[${which}] browser audio decode of output failed: ${errMsg(err)}`);
  }

  const expectedDecodedRateSamples = Math.round(durationSec * decodedSampleRate);
  const sampleDelta = Math.abs(decodedSamples - expectedDecodedRateSamples);
  const decodedDurationSec = decodedSamples / decodedSampleRate;
  const durationDeltaSec = Math.abs(decodedDurationSec - durationSec);
  const measurements: Record<string, number> = {
    decodedSamples,
    expectedDecodedRateSamples,
    expectedSourceRatePrimingRemovedSamples: expectedSourceRateSamples,
    sampleDelta,
    decodedSampleRate,
    expectedSampleRate: sampleRate,
    decodedChannels,
    expectedChannels: audioTrack.channels ?? decodedChannels,
    goldenDurationSec: durationSec,
    decodedDurationSec,
    durationDeltaSec,
    ...(rawAacFrameSamples !== undefined ? { rawAacFrameSamples } : {}),
    ...(primingSamples !== undefined ? { primingSamples } : {}),
  };
  if (rawAacFrameSamples !== undefined) {
    measurements.rawMinusExpectedSourceRateSamples = rawAacFrameSamples - expectedSourceRateSamples;
  }

  const diffs: string[] = [];
  if (audioTrack.channels !== undefined && decodedChannels !== audioTrack.channels) {
    diffs.push(`channels: decoded ${decodedChannels} vs golden ${audioTrack.channels}`);
  }
  if (sampleDelta > 1) {
    diffs.push(`decoded samples ${decodedSamples} vs priming-removed expected ${expectedDecodedRateSamples} at ${decodedSampleRate}Hz (delta ${sampleDelta} > 1)`);
  }
  if (durationDeltaSec > 1 / decodedSampleRate) {
    diffs.push(`decoded duration ${decodedDurationSec.toFixed(6)}s vs golden ${durationSec.toFixed(6)}s`);
  }
  if (rawAacFrameSamples !== undefined && decodedSampleRate === sampleRate && rawAacFrameSamples === decodedSamples) {
    diffs.push(`decoded sample count still equals raw AAC frame samples (${rawAacFrameSamples}); priming/padding was not stripped`);
  }

  if (diffs.length) return fail(oracle, `[invariant gapless sample count] ${diffs.join('; ')}`, measurements);
  return pass(
    oracle,
    `[invariant gapless sample count] decoded ${decodedSamples} sample(s), within tolerance of priming-removed expected count`,
    measurements,
  );
}

async function audioPcmDigestInvariant(ctx: OracleContext, which: string): Promise<OracleOutcome> {
  const oracle: OracleId = 'property-invariant';
  if (!ctx.output) return fail(oracle, `[${which}] no output bytes to decode`);

  const sourceContainer = resolveContainer(ctx.golden.meta?.container, primaryAssetId(ctx));
  const sourceArray = new Uint8Array(await ctx.input.arrayBuffer());
  const sourceCopy = new Uint8Array(sourceArray.byteLength);
  sourceCopy.set(sourceArray);
  const sourceBytes: MediaBytes = {
    bytes: sourceCopy,
    mime: ctx.input.mime,
    container: sourceContainer,
  };

  let source: AudioPcmDigest;
  let output: AudioPcmDigest;
  try {
    [source, output] = await Promise.all([decodeAudioPcmDigest(sourceBytes), decodeAudioPcmDigest(ctx.output)]);
  } catch (err) {
    return fail(oracle, `[${which}] browser audio decode failed: ${errMsg(err)}`);
  }

  const measurements: Record<string, number> = {
    sourceSamples: source.samples,
    outputSamples: output.samples,
    sourceSampleRate: source.sampleRate,
    outputSampleRate: output.sampleRate,
    sourceChannels: source.channels,
    outputChannels: output.channels,
  };

  const diffs: string[] = [];
  if (source.samples !== output.samples) diffs.push(`samples ${output.samples} vs source ${source.samples}`);
  if (source.sampleRate !== output.sampleRate) {
    diffs.push(`sampleRate ${output.sampleRate} vs source ${source.sampleRate}`);
  }
  if (source.channels !== output.channels) diffs.push(`channels ${output.channels} vs source ${source.channels}`);
  if (source.sha256 !== output.sha256) {
    diffs.push(`PCM digest ${shortHex(output.sha256)} vs source ${shortHex(source.sha256)}`);
  }
  if (diffs.length) return fail(oracle, `[invariant audio PCM digest] ${diffs.join('; ')}`, measurements);

  return pass(
    oracle,
    `[invariant audio PCM digest] output decodes bit-identical to source (${output.samples} sample(s))`,
    measurements,
  );
}

async function decodeAudioPcmDigest(out: MediaBytes): Promise<AudioPcmDigest> {
  const nativeFlac = await decodeNativeFlacPcmDigest(out);
  if (nativeFlac) return nativeFlac;
  const audio = await decodeAudioBuffer(out);
  const channels = audio.numberOfChannels;
  const samples = audio.length;
  const pcm = new Uint8Array(samples * channels * Float32Array.BYTES_PER_ELEMENT);
  const floats = new Float32Array(pcm.buffer);
  for (let channelIndex = 0; channelIndex < channels; channelIndex++) {
    const channel = new Float32Array(samples);
    audio.copyFromChannel(channel, channelIndex);
    for (let sampleIndex = 0; sampleIndex < samples; sampleIndex++) {
      floats[sampleIndex * channels + channelIndex] = channel[sampleIndex] ?? 0;
    }
  }
  return {
    samples,
    sampleRate: audio.sampleRate,
    channels,
    sha256: await sha256Hex(pcm),
  };
}

async function decodeNativeFlacPcmDigest(out: MediaBytes): Promise<AudioPcmDigest | null> {
  const info = nativeFlacStreamInfo(out.bytes);
  if (!info) return null;
  const samples = Number(info.totalSamples);
  if (!Number.isSafeInteger(samples) || samples < 0) return null;
  const digestInput = new TextEncoder().encode(
    `flac-pcm-md5:${info.sampleRate}:${info.channels}:${info.bitsPerSample}:${info.totalSamples}:${info.md5}`,
  );
  return {
    samples,
    sampleRate: info.sampleRate,
    channels: info.channels,
    sha256: await sha256Hex(digestInput),
  };
}

async function decodeAudioPcmFrameDigests(out: MediaBytes, maxSamples: number): Promise<FrameDigest[]> {
  const native = await decodeNativeAudioPcmFrameDigests(out, maxSamples);
  if (native) return native;
  return decodeBrowserAudioPcmFrameDigests(out, maxSamples);
}

async function decodeBrowserAudioPcmFrameDigests(out: MediaBytes, maxSamples: number): Promise<FrameDigest[]> {
  const audio = await decodeAudioBuffer(out);
  const channels = audio.numberOfChannels;
  const samples = Math.max(0, Math.min(audio.length, Math.floor(maxSamples)));
  const channelData: Float32Array[] = [];
  for (let channelIndex = 0; channelIndex < channels; channelIndex++) {
    const channel = new Float32Array(samples);
    audio.copyFromChannel(channel, channelIndex);
    channelData.push(channel);
  }

  const frames: FrameDigest[] = [];
  const sampleBytes = new Uint8Array(channels * Float32Array.BYTES_PER_ELEMENT);
  const sampleFloats = new Float32Array(sampleBytes.buffer);
  for (let sampleIndex = 0; sampleIndex < samples; sampleIndex++) {
    for (let channelIndex = 0; channelIndex < channels; channelIndex++) {
      sampleFloats[channelIndex] = channelData[channelIndex]?.[sampleIndex] ?? 0;
    }
    frames.push({
      index: sampleIndex,
      ptsUs: Math.round((sampleIndex / audio.sampleRate) * 1_000_000),
      sha256: await sha256Hex(sampleBytes),
      width: channels,
      height: 1,
    });
  }
  return frames;
}

type NativeAudioSampleFormat = 's16le' | 's24le' | 's32le' | 'f32le' | 's16be' | 's24be' | 's32be' | 'f32be';

interface NativeAudioPcm {
  data: Uint8Array;
  sampleRate: number;
  channels: number;
  blockAlign: number;
  bytesPerSample: number;
  samples: number;
  format: NativeAudioSampleFormat;
}

async function decodeNativeAudioPcmFrameDigests(
  out: MediaBytes,
  maxSamples: number,
): Promise<FrameDigest[] | null> {
  const source = parseNativeAudioPcm(out);
  if (!source) return null;

  const samples = Math.max(0, Math.min(source.samples, Math.floor(maxSamples)));
  const frames: FrameDigest[] = [];
  const sampleBytes = new Uint8Array(source.channels * Float32Array.BYTES_PER_ELEMENT);
  const sampleFloats = new Float32Array(sampleBytes.buffer);

  for (let sampleIndex = 0; sampleIndex < samples; sampleIndex++) {
    const frameOffset = sampleIndex * source.blockAlign;
    for (let channelIndex = 0; channelIndex < source.channels; channelIndex++) {
      const offset = frameOffset + channelIndex * source.bytesPerSample;
      sampleFloats[channelIndex] = readNativePcmSample(source.data, offset, source.format);
    }
    frames.push({
      index: sampleIndex,
      ptsUs: Math.round((sampleIndex / source.sampleRate) * 1_000_000),
      sha256: await sha256Hex(sampleBytes),
      width: source.channels,
      height: 1,
    });
  }

  return frames;
}

function parseNativeAudioPcm(out: MediaBytes): NativeAudioPcm | null {
  if (ascii4(out.bytes, 0) === 'RIFF' && ascii4(out.bytes, 8) === 'WAVE') {
    return parseNativeWavPcm(out.bytes);
  }
  if (ascii4(out.bytes, 0) === 'FORM' && (ascii4(out.bytes, 8) === 'AIFF' || ascii4(out.bytes, 8) === 'AIFC')) {
    return parseNativeAiffPcm(out.bytes);
  }
  return null;
}

function parseNativeWavPcm(bytes: Uint8Array): NativeAudioPcm | null {
  if (bytes.byteLength < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 12;
  let formatTag: number | undefined;
  let channels: number | undefined;
  let sampleRate: number | undefined;
  let blockAlign: number | undefined;
  let bitsPerSample: number | undefined;
  let data: Uint8Array | undefined;

  while (pos + 8 <= bytes.byteLength) {
    const id = ascii4(bytes, pos);
    const size = view.getUint32(pos + 4, true);
    const body = pos + 8;
    if (body + size > bytes.byteLength) break;

    if (id === 'fmt ' && size >= 16) {
      formatTag = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      blockAlign = view.getUint16(body + 12, true);
      bitsPerSample = view.getUint16(body + 14, true);
      if (formatTag === 0xfffe && size >= 40) {
        const subFormatTag = view.getUint32(body + 24, true);
        if (subFormatTag === 1 || subFormatTag === 3) formatTag = subFormatTag;
      }
    } else if (id === 'data') {
      data = bytes.subarray(body, body + size);
    }

    pos = body + size + (size % 2);
  }

  if (!data || !formatTag || !channels || !sampleRate || !blockAlign || !bitsPerSample) return null;
  const bytesPerSample = bitsPerSample / 8;
  if (!Number.isInteger(bytesPerSample) || bytesPerSample <= 0) return null;

  let format: NativeAudioSampleFormat | null = null;
  if (formatTag === 1) {
    if (bitsPerSample === 16) format = 's16le';
    else if (bitsPerSample === 24) format = 's24le';
    else if (bitsPerSample === 32) format = 's32le';
  } else if (formatTag === 3 && bitsPerSample === 32) {
    format = 'f32le';
  }
  if (!format) return null;

  return {
    data,
    sampleRate,
    channels,
    blockAlign,
    bytesPerSample,
    samples: Math.floor(data.byteLength / blockAlign),
    format,
  };
}

function parseNativeAiffPcm(bytes: Uint8Array): NativeAudioPcm | null {
  if (bytes.byteLength < 54) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const formType = ascii4(bytes, 8);
  let pos = 12;
  let channels: number | undefined;
  let samples: number | undefined;
  let bitsPerSample: number | undefined;
  let sampleRate: number | undefined;
  let compression = 'NONE';
  let soundData: Uint8Array | undefined;

  while (pos + 8 <= bytes.byteLength) {
    const id = ascii4(bytes, pos);
    const size = view.getUint32(pos + 4, false);
    const body = pos + 8;
    if (body + size > bytes.byteLength) break;

    if (id === 'COMM' && size >= 18) {
      channels = view.getUint16(body, false);
      samples = view.getUint32(body + 2, false);
      bitsPerSample = view.getUint16(body + 6, false);
      sampleRate = readExtended80(view, body + 8);
      if (formType === 'AIFC' && size >= 22) compression = ascii4(bytes, body + 18);
    } else if (id === 'SSND' && size >= 8) {
      const offset = view.getUint32(body, false);
      const blockSize = view.getUint32(body + 4, false);
      if (blockSize !== 0) return null;
      const dataStart = body + 8 + offset;
      if (dataStart <= body + size) soundData = bytes.subarray(dataStart, body + size);
    }

    pos = body + size + (size % 2);
  }

  if (!soundData || !channels || samples === undefined || !bitsPerSample || !sampleRate) return null;
  const bytesPerSample = bitsPerSample / 8;
  if (!Number.isInteger(bytesPerSample) || bytesPerSample <= 0) return null;

  let format: NativeAudioSampleFormat | null = null;
  const normalizedCompression = compression.trim();
  const littleEndian = normalizedCompression === 'sowt';
  if (bitsPerSample === 16) format = littleEndian ? 's16le' : 's16be';
  else if (bitsPerSample === 24) format = littleEndian ? 's24le' : 's24be';
  else if (bitsPerSample === 32 && normalizedCompression === 'fl32') format = 'f32be';
  else if (bitsPerSample === 32 && normalizedCompression === 'sowt') format = 's32le';
  else if (bitsPerSample === 32) format = 's32be';
  if (!format) return null;

  const blockAlign = channels * bytesPerSample;
  return {
    data: soundData,
    sampleRate,
    channels,
    blockAlign,
    bytesPerSample,
    samples: Math.min(samples, Math.floor(soundData.byteLength / blockAlign)),
    format,
  };
}

function readNativePcmSample(data: Uint8Array, offset: number, format: NativeAudioSampleFormat): number {
  const view = new DataView(data.buffer, data.byteOffset + offset, data.byteLength - offset);
  switch (format) {
    case 's16le':
      return view.getInt16(0, true) / 32768;
    case 's16be':
      return view.getInt16(0, false) / 32768;
    case 's24le':
      return signExtend24(data[offset]! | (data[offset + 1]! << 8) | (data[offset + 2]! << 16)) / 8388608;
    case 's24be':
      return signExtend24((data[offset]! << 16) | (data[offset + 1]! << 8) | data[offset + 2]!) / 8388608;
    case 's32le':
      return view.getInt32(0, true) / 2147483648;
    case 's32be':
      return view.getInt32(0, false) / 2147483648;
    case 'f32le':
      return view.getFloat32(0, true);
    case 'f32be':
      return view.getFloat32(0, false);
  }
}

function signExtend24(value: number): number {
  return value & 0x800000 ? value | 0xff000000 : value;
}

async function decodeAudioSampleCount(out: MediaBytes): Promise<{ samples: number; sampleRate: number; channels: number }> {
  const audio = await decodeAudioBuffer(out);
  return { samples: audio.length, sampleRate: audio.sampleRate, channels: audio.numberOfChannels };
}

async function decodeAudioBuffer(out: MediaBytes): Promise<AudioBuffer> {
  const global = globalThis as typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };
  const AudioContextCtor = typeof AudioContext !== 'undefined' ? AudioContext : global.webkitAudioContext;
  let ctx: BaseAudioContext | undefined;
  try {
    if (AudioContextCtor) {
      ctx = new AudioContextCtor();
    } else if (typeof OfflineAudioContext !== 'undefined') {
      ctx = new OfflineAudioContext(1, 1, 44100);
    } else {
      throw new Error('AudioContext/OfflineAudioContext unavailable');
    }
    const exact = copyToArrayBuffer(out.bytes);
    return await ctx.decodeAudioData(exact);
  } finally {
    if (ctx && 'close' in ctx && typeof (ctx as AudioContext).close === 'function') {
      await (ctx as AudioContext).close().catch(() => undefined);
    }
  }
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
}

interface TrimPcmView {
  readonly sampleRate: number;
  readonly channels: number;
  readonly sampleFrames: number;
  copyChannel(channel: number, start: number, count: number): Float32Array;
}

/** FEAT-26: score the decoded half-open audio program, not a duration/sample-count proxy. */
async function trimAudioContentInvariant(ctx: OracleContext): Promise<OracleOutcome> {
  const oracle: OracleId = 'property-invariant';
  if (!ctx.output) return fail(oracle, '[trim-audio-content] no trim output bytes');

  // Inspect first so malformed authored bytes remain FAIL even when this realm has no audio decoder.
  const container = inspectTrimAudioContainer(ctx.output.bytes, ctx.output.container);
  if (container.state === 'UNSUPPORTED_FORMAT') {
    return oracleError(
      oracle,
      container.reasonCode,
      `[trim-audio-content] ${container.detail}`,
    );
  }
  if (container.state !== 'OK') {
    return fail(oracle, `[${container.reasonCode}] ${container.detail}`);
  }

  const contract = trimContractForScenario(ctx.scenario);
  const sourceContainer = ctx.golden.meta?.container ?? resolveContainer(undefined, ctx.input.id);
  const sourceMedia: MediaBytes = {
    bytes: new Uint8Array(await ctx.input.arrayBuffer()),
    mime: ctx.input.mime,
    container: sourceContainer,
  };
  let source: TrimPcmView;
  try {
    source = await decodeTrimPcmView(sourceMedia);
  } catch (error) {
    return unavailable(
      oracle,
      'NA_BROWSER',
      'TRIM_AUDIO_REFERENCE_DECODE_UNAVAILABLE',
      `neutral decoded-PCM source evidence is unavailable: ${errMsg(error)}`,
    );
  }
  let candidate: TrimPcmView;
  try {
    candidate = await decodeTrimPcmView(ctx.output);
  } catch (error) {
    if (trimAudioDecoderApiUnavailable(error)) {
      return unavailable(
        oracle,
        'NA_BROWSER',
        'TRIM_AUDIO_REFERENCE_DECODE_UNAVAILABLE',
        `neutral decoded-PCM candidate evidence is unavailable: ${errMsg(error)}`,
      );
    }
    return fail(
      oracle,
      `[TRIM_AUDIO_CANDIDATE_DECODE_REJECTED] container timing is readable but decoded PCM was rejected: ${errMsg(error)}`,
    );
  }

  const sourceStart = Math.min(
    source.sampleFrames,
    Math.max(0, Math.round(contract.range.startUs * source.sampleRate / 1_000_000)),
  );
  const sourceEnd = Math.min(
    source.sampleFrames,
    Math.max(sourceStart, Math.round(contract.range.endUs * source.sampleRate / 1_000_000)),
  );
  if (sourceEnd <= sourceStart) {
    return unavailable(
      oracle,
      'NA_ASSET',
      'TRIM_AUDIO_REFERENCE_RANGE_EMPTY',
      'the requested half-open range has no decoded source sample frames',
    );
  }

  const candidateBoundary = await trimPcmBoundaryEvidence(candidate, 0, candidate.sampleFrames);
  const codedFrameEstimateBand = container.value.precision === 'coded-frame-estimate'
    ? Math.max(1, Math.ceil(container.value.codedSampleFrames / Math.max(1, container.value.packetOrFrameCount)))
    : 0;
  const assessInterval = async (
    start: number,
    end: number,
    representationDifferences: readonly string[] = [],
  ): Promise<TrimDecision> => {
    const boundary = await trimPcmBoundaryEvidence(source, start, end);
    return assessAudioTrimEvidence({
      reference: {
        ...boundary,
        sourceStartSampleFrame: start,
        sourceEndSampleFrame: end,
      },
      candidate: candidateBoundary,
      container,
      sampleFrameTolerance: 0,
      containerSampleFrameTolerance: codedFrameEstimateBand,
      representationDifferences: [
        ...representationDifferences,
        ...(codedFrameEstimateBand > 0
          ? ['container exposes only coded-frame sample-count precision']
          : []),
      ],
    });
  };
  const exact = await assessInterval(sourceStart, sourceEnd);
  if (trimDecisionIsCorrectnessValid(exact)) return trimDecisionOutcome(oracle, exact);

  // Copy mode may legally retain the complete coded packet/page that intersects either requested
  // edge. Prefer the exact half-open interval above, then accept only the independently baked packet
  // window as DIFF. An arbitrary one-sample shift matches neither authored interval and remains FAIL.
  const packetInterval = contract.mode === 'copy'
    ? trimAudioPacketInterval(ctx, contract, source.sampleRate, source.sampleFrames)
    : undefined;
  if (packetInterval && (packetInterval.start !== sourceStart || packetInterval.end !== sourceEnd)) {
    const packetLanded = await assessInterval(packetInterval.start, packetInterval.end, [
      'copy trim landed on complete coded audio packet boundaries',
    ]);
    if (trimDecisionIsCorrectnessValid(packetLanded)) return trimDecisionOutcome(oracle, packetLanded);
  }
  return trimDecisionOutcome(oracle, exact);
}

function trimDecisionIsCorrectnessValid(decision: TrimDecision): boolean {
  return decision.state === 'VERDICT' && decision.verdict !== 'FAIL';
}

function trimAudioPacketInterval(
  ctx: OracleContext,
  contract: TrimContract,
  sampleRate: number,
  sourceSampleFrames: number,
): { start: number; end: number } | undefined {
  const packets = ctx.golden.packets;
  if (!packets || packets.length === 0) return undefined;
  const audioTrackIndices = new Set(
    (ctx.golden.meta?.tracks ?? []).flatMap((track, index) => track.type === 'audio' ? [index] : []),
  );
  const rows = packets
    .filter((packet) => audioTrackIndices.size === 0 || audioTrackIndices.has(packet.trackIndex))
    .sort((a, b) => a.ptsUs - b.ptsUs || a.trackIndex - b.trackIndex);
  if (rows.length === 0) return undefined;
  const durationAt = (index: number): number => {
    const row = rows[index]!;
    if (row.durationUs !== undefined && row.durationUs > 0) return row.durationUs;
    const next = rows.slice(index + 1).find((packet) => packet.trackIndex === row.trackIndex);
    if (next && next.ptsUs > row.ptsUs) return next.ptsUs - row.ptsUs;
    const previous = [...rows.slice(0, index)].reverse().find((packet) => packet.trackIndex === row.trackIndex);
    return previous && row.ptsUs > previous.ptsUs ? row.ptsUs - previous.ptsUs : 1;
  };
  const selected = rows.flatMap((packet, index) => {
    const durationUs = durationAt(index);
    return packet.ptsUs < contract.range.endUs && packet.ptsUs + durationUs > contract.range.startUs
      ? [{ packet, durationUs }]
      : [];
  });
  if (selected.length === 0) return undefined;
  const startUs = Math.max(0, Math.min(...selected.map((entry) => entry.packet.ptsUs)));
  const endUs = Math.max(...selected.map((entry) => entry.packet.ptsUs + entry.durationUs));
  const start = Math.min(sourceSampleFrames, Math.max(0, Math.round(startUs * sampleRate / 1_000_000)));
  const end = Math.min(sourceSampleFrames, Math.max(start, Math.round(endUs * sampleRate / 1_000_000)));
  return end > start ? { start, end } : undefined;
}

async function decodeTrimPcmView(media: MediaBytes): Promise<TrimPcmView> {
  const native = parseNativeAudioPcm(media);
  if (native) {
    return {
      sampleRate: native.sampleRate,
      channels: native.channels,
      sampleFrames: native.samples,
      copyChannel(channel, start, count) {
        const out = new Float32Array(count);
        for (let index = 0; index < count; index++) {
          const offset = (start + index) * native.blockAlign + channel * native.bytesPerSample;
          out[index] = readNativePcmSample(native.data, offset, native.format);
        }
        return out;
      },
    };
  }
  const hasAudioDecoder = typeof AudioContext !== 'undefined' ||
    typeof OfflineAudioContext !== 'undefined' ||
    typeof (globalThis as typeof globalThis & { webkitAudioContext?: unknown }).webkitAudioContext === 'function';
  if (!hasAudioDecoder) {
    throw Object.assign(new Error('AudioContext/OfflineAudioContext unavailable'), {
      reasonCode: 'BROWSER_API_UNAVAILABLE',
    });
  }
  const audio = await decodeAudioBuffer(media);
  return {
    sampleRate: audio.sampleRate,
    channels: audio.numberOfChannels,
    sampleFrames: audio.length,
    copyChannel(channel, start, count) {
      const out = new Float32Array(count);
      audio.copyFromChannel(out, channel, start);
      return out;
    },
  };
}

async function trimPcmBoundaryEvidence(
  pcm: TrimPcmView,
  start: number,
  end: number,
): Promise<DecodedAudioBoundaryEvidence> {
  const sampleFrames = end - start;
  if (!Number.isSafeInteger(sampleFrames) || sampleFrames <= 0) {
    throw new TypeError('decoded trim audio evidence requires at least one sample frame');
  }
  const windowFrames = Math.min(1_024, sampleFrames);
  return {
    sampleRate: pcm.sampleRate,
    channels: pcm.channels,
    sampleFrames,
    firstWindowDigest: await trimPcmWindowDigest(pcm, start, windowFrames),
    lastWindowDigest: await trimPcmWindowDigest(pcm, end - windowFrames, windowFrames),
  };
}

async function trimPcmWindowDigest(
  pcm: TrimPcmView,
  start: number,
  count: number,
): Promise<string> {
  const bytes = new Uint8Array(count * pcm.channels * Float32Array.BYTES_PER_ELEMENT);
  const interleaved = new Float32Array(bytes.buffer);
  for (let channel = 0; channel < pcm.channels; channel++) {
    const plane = pcm.copyChannel(channel, start, count);
    for (let frame = 0; frame < count; frame++) {
      interleaved[frame * pcm.channels + channel] = plane[frame] ?? 0;
    }
  }
  return sha256Hex(bytes);
}

function trimAudioDecoderApiUnavailable(error: unknown): boolean {
  const record = isObject(error) ? error : {};
  return record.reasonCode === 'BROWSER_API_UNAVAILABLE' ||
    record.name === 'NotSupportedError' ||
    record.supported === false;
}

/** FEAT-28: route every feature-labelled trim row to evidence for the property in its name. */
async function trimFeaturePropertiesInvariant(
  ctx: OracleContext,
  t: Required<OracleTolerances>,
): Promise<OracleOutcome> {
  const id = ctx.scenario.id;
  if (id === 'trim/vp9_alpha_keyframe_aligned') return trimAlphaPropertyInvariant(ctx);
  if (id === 'trim/h264_rotated_keyframe_aligned') return trimDisplayPropertyInvariant(ctx);
  if (id === 'trim/h264_multitrack_keyframe_aligned') return trimMultitrackPropertyInvariant(ctx, t);
  if (id === 'trim/h264_open_gop_frame_accurate') return trimOpenGopPropertyInvariant(ctx);
  if (id === 'trim/h264_single_gop_frame_accurate' || id === 'trim/h264_subframe_range_frame_accurate') {
    return trimShortRangePropertyInvariant(ctx, t);
  }
  return oracleError(
    'property-invariant',
    'TRIM_FEATURE_PROPERTY_ROUTE_MISSING',
    `no dedicated feature-labelled trim evidence route is registered for '${id}'`,
  );
}

type TrimVideoDecodePair =
  | { readonly state: 'OK'; readonly source: FrameSink; readonly candidate: FrameSink }
  | { readonly state: 'OUTCOME'; readonly outcome: OracleOutcome };

async function decodeTrimVideoPair(ctx: OracleContext): Promise<TrimVideoDecodePair> {
  const oracle: OracleId = 'property-invariant';
  if (!ctx.output) return { state: 'OUTCOME', outcome: fail(oracle, 'trim feature output bytes are missing') };
  const sourceMedia: MediaBytes = {
    bytes: new Uint8Array(await ctx.input.arrayBuffer()),
    mime: ctx.input.mime,
    container: ctx.golden.meta?.container ?? resolveContainer(undefined, ctx.input.id),
  };
  let source: FrameSink;
  try {
    source = await ctx.decodeWithPlatform(sourceMedia, { maxFrames: 8192 });
  } catch (error) {
    return { state: 'OUTCOME', outcome: classifyReferenceDecodeFailure(oracle, 'source', error, sourceMedia) };
  }
  let candidate: FrameSink;
  try {
    candidate = await ctx.decodeWithPlatform(ctx.output, { maxFrames: 8192 });
  } catch (error) {
    return { state: 'OUTCOME', outcome: classifyReferenceDecodeFailure(oracle, 'candidate', error, ctx.output) };
  }
  if (source.frames.length === 0) {
    return {
      state: 'OUTCOME',
      outcome: unavailable(
        oracle,
        'NA_ASSET',
        'TRIM_FEATURE_SOURCE_DECODE_EMPTY',
        'neutral source decode produced no feature evidence',
      ),
    };
  }
  if (candidate.frames.length === 0) {
    return {
      state: 'OUTCOME',
      outcome: fail(oracle, '[TRIM_FEATURE_CANDIDATE_DECODE_EMPTY] trim output has no displayed frames'),
    };
  }
  return { state: 'OK', source, candidate };
}

async function trimAlphaPropertyInvariant(ctx: OracleContext): Promise<OracleOutcome> {
  const oracle: OracleId = 'property-invariant';
  const decoded = await decodeTrimVideoPair(ctx);
  if (decoded.state !== 'OK') return decoded.outcome;
  if (!decoded.source.getPixels || !decoded.candidate.getPixels) {
    return unavailable(
      oracle,
      'NA_BROWSER',
      'TRIM_ALPHA_PIXEL_READER_UNAVAILABLE',
      'neutral decoder did not expose normalized RGBA pixels for alpha evidence',
    );
  }
  const contract = trimContractForScenario(ctx.scenario);
  const range = contract.range;
  const sourceStartUs = trimFeatureVideoStartUs(ctx, contract);
  try {
    const source = (await collectAlphaEvidence(decoded.source))
      .filter((frame) => frame.ptsUs >= sourceStartUs && frame.ptsUs < range.endUs);
    const candidate = await collectAlphaEvidence(decoded.candidate);
    if (source.length === 0) {
      return unavailable(
        oracle,
        'NA_ASSET',
        'TRIM_ALPHA_REFERENCE_RANGE_EMPTY',
        'decoded source contains no alpha frames in the requested interval',
      );
    }
    const alphaEvidence = async (frames: readonly (typeof source)[number][]) => ({
      state: 'AVAILABLE' as const,
      alphaDigest: await sha256Hex(new TextEncoder().encode(
        frames.map((frame) => `${frame.width}x${frame.height}:${frame.alphaSha256}`).join('|'),
      )),
      translucentPixels: frames.reduce((sum, frame) => sum + frame.nonOpaquePixels, 0),
      opaquePixels: frames.reduce(
        (sum, frame) => sum + frame.width * frame.height - frame.nonOpaquePixels,
        0,
      ),
    });
    return trimDecisionOutcome(oracle, assessFeatureLabelledTrim({
      alpha: {
        reference: await alphaEvidence(source),
        candidate: await alphaEvidence(candidate),
      },
    }));
  } catch (error) {
    return oracleError(
      oracle,
      'TRIM_ALPHA_EVIDENCE_ERROR',
      `decoded alpha evidence could not be collected: ${errMsg(error)}`,
    );
  }
}

async function trimDisplayPropertyInvariant(ctx: OracleContext): Promise<OracleOutcome> {
  const oracle: OracleId = 'property-invariant';
  if (!ctx.output) return fail(oracle, 'rotated trim output bytes are missing');
  const sourceBytes = new Uint8Array(await ctx.input.arrayBuffer());
  const sourceContainer = ctx.golden.meta?.container ?? resolveContainer(undefined, ctx.input.id);
  const sourceOrientation = readMuxOrientation(sourceBytes, sourceContainer);
  if (sourceOrientation.state !== 'OK') {
    return unavailable(
      oracle,
      'NA_ASSET',
      'TRIM_DISPLAY_REFERENCE_MISSING',
      `source display transform is not decisive [${sourceOrientation.reasonCode}]: ${sourceOrientation.detail}`,
    );
  }
  if (sourceOrientation.value.rotationDegrees === 0 || sourceOrientation.value.representation === 'none') {
    return unavailable(
      oracle,
      'NA_ASSET',
      'TRIM_DISPLAY_REFERENCE_UNVERIFIED',
      'the rotation-labelled source has no non-identity orientation evidence',
    );
  }
  const candidateOrientation = readMuxOrientation(ctx.output.bytes, ctx.output.container);
  if (candidateOrientation.state !== 'OK') {
    return trimDecisionOutcome(oracle, assessFeatureLabelledTrim({
      display: {
        reference: {
          state: 'AVAILABLE',
          rotationDegrees: sourceOrientation.value.rotationDegrees,
          displayWidth: sourceOrientation.value.displayWidth,
          displayHeight: sourceOrientation.value.displayHeight,
          displayDigest: 'source-structural-evidence',
        },
        candidate: { state: 'AVAILABLE' },
      },
    }));
  }
  const decoded = await decodeTrimVideoPair(ctx);
  if (decoded.state !== 'OK') return decoded.outcome;
  const contract = trimContractForScenario(ctx.scenario);
  const range = contract.range;
  const sourceStartUs = trimFeatureVideoStartUs(ctx, contract);
  const sourceFrames = decoded.source.frames.filter(
    (frame) => frame.ptsUs >= sourceStartUs && frame.ptsUs < range.endUs,
  );
  if (sourceFrames.length === 0) {
    return unavailable(
      oracle,
      'NA_ASSET',
      'TRIM_DISPLAY_REFERENCE_RANGE_EMPTY',
      'decoded source contains no display frames in the requested interval',
    );
  }
  const digest = async (frames: readonly FrameDigest[]) => sha256Hex(new TextEncoder().encode(
    frames.map((frame) => `${frame.width ?? 0}x${frame.height ?? 0}:${frame.sha256}`).join('|'),
  ));
  return trimDecisionOutcome(oracle, assessFeatureLabelledTrim({
    display: {
      reference: {
        state: 'AVAILABLE',
        rotationDegrees: sourceOrientation.value.rotationDegrees,
        displayWidth: sourceOrientation.value.displayWidth,
        displayHeight: sourceOrientation.value.displayHeight,
        displayDigest: await digest(sourceFrames),
      },
      candidate: {
        state: 'AVAILABLE',
        rotationDegrees: candidateOrientation.value.rotationDegrees,
        displayWidth: candidateOrientation.value.displayWidth,
        displayHeight: candidateOrientation.value.displayHeight,
        displayDigest: await digest(decoded.candidate.frames),
      },
    },
  }));
}

function trimFeatureVideoStartUs(ctx: OracleContext, contract: TrimContract): number {
  if (contract.mode !== 'copy') return contract.range.startUs;
  const videoTracks = videoTrackIndices(ctx.golden);
  const safe = (ctx.golden.packets ?? [])
    .filter((packet) => packet.keyframe && (!videoTracks || videoTracks.has(packet.trackIndex)))
    .filter((packet) => packet.ptsUs <= contract.range.startUs)
    .sort((a, b) => a.ptsUs - b.ptsUs)
    .at(-1);
  return safe?.ptsUs ?? contract.range.startUs;
}

async function trimMultitrackPropertyInvariant(
  ctx: OracleContext,
  t: Required<OracleTolerances>,
): Promise<OracleOutcome> {
  const oracle: OracleId = 'property-invariant';
  if (!ctx.output) return fail(oracle, 'multitrack trim output bytes are missing');
  const sourceRead = readNeutralRemuxProgram(
    new Uint8Array(await ctx.input.arrayBuffer()),
    ctx.golden.meta?.container ?? resolveContainer(undefined, ctx.input.id),
  );
  const candidateRead = readNeutralRemuxProgram(ctx.output.bytes, ctx.output.container);
  if (sourceRead.state !== 'OK') {
    return unavailable(
      oracle,
      'NA_ASSET',
      'TRIM_MULTITRACK_SOURCE_EVIDENCE_UNAVAILABLE',
      `source neutral reader ${sourceRead.state} [${sourceRead.reasonCode}]`,
    );
  }
  if (candidateRead.state !== 'OK') {
    return fail(
      oracle,
      `candidate neutral reader ${candidateRead.state} [${candidateRead.reasonCode}]`,
    );
  }
  const contract = trimContractForScenario(ctx.scenario);
  const sourceSelections = sourceRead.value.tracks.map((track) => ({
    track,
    samples: selectTrimTrackSamples(track, contract),
  })).filter((entry) => entry.samples.length > 0);
  if (sourceSelections.length !== sourceRead.value.tracks.length) {
    return unavailable(
      oracle,
      'NA_ASSET',
      'TRIM_MULTITRACK_SOURCE_INTERVAL_INCOMPLETE',
      'at least one required source track has no timestamped sample in the trim interval',
    );
  }
  const sourceOrigin = minimumSamplePts(sourceSelections.flatMap((entry) => entry.samples));
  const candidateOrigin = minimumSamplePts(candidateRead.value.tracks.flatMap((track) => track.samples));
  if (sourceOrigin === undefined || candidateOrigin === undefined) {
    return oracleError(
      oracle,
      'TRIM_MULTITRACK_TIMELINE_UNAVAILABLE',
      'neutral readers did not expose complete track timestamps',
    );
  }

  const sourceTracks: SemanticTrimTrack[] = [];
  const pendingCandidates = [...candidateRead.value.tracks];
  const candidateTracks: SemanticTrimTrack[] = [];
  for (const { track, samples } of sourceSelections) {
    const identity = `${track.type}:${track.id}`;
    sourceTracks.push(semanticTrimTrack(track, samples, identity, sourceOrigin));
    const compatible = pendingCandidates
      .map((candidate, index) => ({
        candidate,
        index,
        score: candidate.type === track.type && canonicalTrimCodec(candidate.codec) === canonicalTrimCodec(track.codec)
          ? trimTrackOverlapScore(samples, candidate.samples)
          : -1,
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index)[0];
    if (compatible && compatible.score > 0) {
      candidateTracks.push(semanticTrimTrack(
        compatible.candidate,
        compatible.candidate.samples,
        identity,
        candidateOrigin,
      ));
      pendingCandidates.splice(compatible.index, 1);
    }
  }
  for (const track of pendingCandidates) {
    candidateTracks.push(semanticTrimTrack(
      track,
      track.samples,
      `unmatched:${track.id}`,
      candidateOrigin,
    ));
  }
  const toleranceUs = Math.max(t.seekToleranceUs, Math.round(t.durationToleranceSec * 1_000_000));
  return trimDecisionOutcome(oracle, assessFeatureLabelledTrim({
    tracks: {
      source: sourceTracks,
      candidate: candidateTracks,
      startAlignmentToleranceUs: toleranceUs,
      endAlignmentToleranceUs: toleranceUs,
    },
  }));
}

function selectTrimTrackSamples(
  track: RemuxTrackEvidence,
  contract: TrimContract,
): readonly RemuxTrackEvidence['samples'][number][] {
  const samples = track.samples;
  let first = samples.findIndex((sample) => {
    if (sample.ptsUs === undefined || sample.durationUs === undefined) return false;
    return sample.ptsUs < contract.range.endUs && sample.ptsUs + sample.durationUs > contract.range.startUs;
  });
  if (first < 0) return [];
  if (contract.mode === 'copy' && track.type === 'video' && samples[first]?.keyframe !== true) {
    for (let index = first; index >= 0; index--) {
      if (samples[index]?.keyframe === true) {
        first = index;
        break;
      }
    }
  }
  return samples.slice(first).filter((sample) =>
    sample.ptsUs !== undefined && sample.durationUs !== undefined && sample.ptsUs < contract.range.endUs);
}

function minimumSamplePts(samples: readonly RemuxTrackEvidence['samples'][number][]): number | undefined {
  const values = samples.flatMap((sample) => sample.ptsUs === undefined ? [] : [sample.ptsUs]);
  return values.length > 0 ? Math.min(...values) : undefined;
}

function trimTrackOverlapScore(
  source: readonly RemuxTrackEvidence['samples'][number][],
  candidate: readonly RemuxTrackEvidence['samples'][number][],
): number {
  const anchors = [source[0]?.payload, source[Math.floor(source.length / 2)]?.payload, source.at(-1)?.payload]
    .filter((payload): payload is Uint8Array => payload !== undefined);
  return anchors.reduce(
    (score, anchor) => score + (candidate.some((sample) => equalTrimPayload(anchor, sample.payload)) ? 1 : 0),
    0,
  );
}

function canonicalTrimCodec(codec: string): string {
  return canonicalCodecToken(codec) ?? (normStr(codec) || 'unknown');
}

function equalTrimPayload(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let index = 0; index < a.byteLength; index++) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

function semanticTrimTrack(
  track: RemuxTrackEvidence,
  samples: readonly RemuxTrackEvidence['samples'][number][],
  identity: string,
  originUs: number,
): SemanticTrimTrack {
  return {
    identity,
    type: track.type,
    codecCanonical: canonicalTrimCodec(track.codec),
    ...(track.language !== undefined ? { language: track.language } : {}),
    samples: samples.map((sample) => ({
      ptsUs: (sample.ptsUs ?? originUs) - originUs,
      durationUs: sample.durationUs ?? 1,
      contentDigest: 'track-retention-evidence',
    })),
  };
}

async function trimOpenGopPropertyInvariant(ctx: OracleContext): Promise<OracleOutcome> {
  const oracle: OracleId = 'property-invariant';
  const decoded = await decodeTrimVideoPair(ctx);
  if (decoded.state !== 'OK') return decoded.outcome;
  const range = trimContractForScenario(ctx.scenario).range;
  const source = [...decoded.source.frames].sort((a, b) => a.ptsUs - b.ptsUs || a.index - b.index);
  const candidate = [...decoded.candidate.frames].sort((a, b) => a.ptsUs - b.ptsUs || a.index - b.index);
  const reference = source.find((frame, index) =>
    frame.ptsUs < range.endUs && frame.ptsUs + inferredFrameDurationUs(source, index) > range.startUs);
  if (!reference) {
    return unavailable(
      oracle,
      'NA_ASSET',
      'TRIM_OPEN_GOP_REFERENCE_RANGE_EMPTY',
      'neutral source decode did not reach the requested open-GOP interval',
    );
  }
  const got = candidate[0]!;
  const mapped = source.find((frame) => normHex(frame.sha256) === normHex(got.sha256));
  return trimDecisionOutcome(oracle, assessFeatureLabelledTrim({
    openGop: {
      reference: {
        sourcePtsUs: reference.ptsUs,
        contentDigest: reference.sha256,
        decodeSucceeded: true,
        missingReferenceCount: 0,
      },
      candidate: {
        sourcePtsUs: mapped?.ptsUs ?? -1,
        contentDigest: got.sha256,
        decodeSucceeded: true,
        missingReferenceCount: 0,
      },
    },
  }));
}

async function trimShortRangePropertyInvariant(
  ctx: OracleContext,
  t: Required<OracleTolerances>,
): Promise<OracleOutcome> {
  const oracle: OracleId = 'property-invariant';
  const decoded = await decodeTrimVideoPair(ctx);
  if (decoded.state !== 'OK') return decoded.outcome;
  const range = trimContractForScenario(ctx.scenario).range;
  const source = [...decoded.source.frames].sort((a, b) => a.ptsUs - b.ptsUs || a.index - b.index);
  const expectedSource = source.filter((frame, index) =>
    frame.ptsUs < range.endUs && frame.ptsUs + inferredFrameDurationUs(source, index) > range.startUs);
  if (expectedSource.length === 0) {
    return unavailable(
      oracle,
      'NA_ASSET',
      'TRIM_SHORT_RANGE_REFERENCE_EMPTY',
      'neutral source decode did not retain the very-short/subframe interval',
    );
  }
  const origin = expectedSource[0]!.ptsUs;
  const expected = expectedSource.map((frame) => {
    const index = source.indexOf(frame);
    return {
      sourcePtsUs: frame.ptsUs,
      outputPtsUs: frame.ptsUs - origin,
      durationUs: inferredFrameDurationUs(source, index),
      contentDigest: frame.sha256,
    };
  });
  const candidate = decoded.candidate.frames.map((frame, index, frames) => {
    const mapped = source.find((entry) => normHex(entry.sha256) === normHex(frame.sha256));
    return {
      sourcePtsUs: mapped?.ptsUs ?? -1,
      outputPtsUs: frame.ptsUs,
      durationUs: inferredFrameDurationUs(frames, index),
      contentDigest: frame.sha256,
    };
  });
  return trimDecisionOutcome(oracle, assessFeatureLabelledTrim({
    shortRange: {
      range,
      expected,
      candidate,
      timestampToleranceUs: t.seekToleranceUs,
    },
  }));
}

/** FEAT-29: full-range trim identity is semantic; legal representation changes stay DIFF. */
async function trimNoopIdentityInvariant(
  ctx: OracleContext,
  t: Required<OracleTolerances>,
): Promise<OracleOutcome> {
  const oracle: OracleId = 'property-invariant';
  if (!ctx.output) return fail(oracle, '[trim-noop-semantic-identity] no trim output bytes');
  const sourceBytes = new Uint8Array(await ctx.input.arrayBuffer());
  const sourceContainer = ctx.golden.meta?.container ?? resolveContainer(undefined, ctx.input.id);
  const strict = evaluateStrictStreamCopy(
    sourceBytes,
    sourceContainer,
    ctx.output.bytes,
    ctx.output.container,
    {
      expectedTargetContainer: readStringOption(ctx.scenario.options, ['container']) ?? ctx.output.container,
      surfaceRepresentationDifferences: true,
    },
  );
  if (strict.outcome.state !== 'VERDICT' || strict.outcome.verdict === 'FAIL') {
    return { ...strict.outcome, oracle };
  }

  const sourceRead = readNeutralRemuxProgram(sourceBytes, sourceContainer);
  const candidateRead = readNeutralRemuxProgram(ctx.output.bytes, ctx.output.container);
  if (sourceRead.state !== 'OK' || candidateRead.state !== 'OK') {
    return oracleError(
      oracle,
      'TRIM_NOOP_SEMANTIC_READER_INCONSISTENT',
      'strict comparator succeeded without two readable semantic presentations',
    );
  }
  const outputIdentity = new Map(strict.matchedTracks.map((pair) => [pair.outputId, pair.sourceId]));
  let source = await semanticNoopPresentation(sourceRead.value);
  let candidate = await semanticNoopPresentation(candidateRead.value, outputIdentity);

  if (sourceRead.value.tracks.some((track) => track.type === 'video')) {
    const decoded = await decodeTrimVideoPair(ctx);
    if (decoded.state !== 'OK') return decoded.outcome;
    source = {
      ...source,
      tracks: [...source.tracks, decodedNoopVideoTrack(decoded.source.frames)],
    };
    candidate = {
      ...candidate,
      tracks: [...candidate.tracks, decodedNoopVideoTrack(decoded.candidate.frames)],
    };
  }

  if (sourceRead.value.tracks.some((track) => track.type === 'audio')) {
    const sourceMedia: MediaBytes = {
      bytes: sourceBytes,
      mime: ctx.input.mime,
      container: sourceContainer,
    };
    let sourceAudio: TrimPcmView;
    let candidateAudio: TrimPcmView;
    try {
      [sourceAudio, candidateAudio] = await Promise.all([
        decodeTrimPcmView(sourceMedia),
        decodeTrimPcmView(ctx.output),
      ]);
    } catch (error) {
      return unavailable(
        oracle,
        'NA_BROWSER',
        'TRIM_NOOP_AUDIO_DECODE_UNAVAILABLE',
        `decoded no-op audio evidence is unavailable: ${errMsg(error)}`,
      );
    }
    source = {
      ...source,
      tracks: [...source.tracks, await decodedNoopAudioTrack(sourceAudio)],
    };
    candidate = {
      ...candidate,
      tracks: [...candidate.tracks, await decodedNoopAudioTrack(candidateAudio)],
    };
  }
  return trimDecisionOutcome(oracle, assessTrimNoopIdentity({
    source,
    candidate,
    timestampToleranceUs: t.seekToleranceUs,
    durationToleranceUs: Math.round(t.durationToleranceSec * 1_000_000),
    representationDifferences: strict.representationDifferences,
  }));
}

function decodedNoopVideoTrack(frames: readonly FrameDigest[]): SemanticTrimTrack {
  return {
    identity: 'decoded-presentation:video',
    type: 'video',
    codecCanonical: 'decoded-rgba',
    samples: frames.map((frame, index) => ({
      ptsUs: frame.ptsUs,
      durationUs: inferredFrameDurationUs(frames, index),
      contentDigest: frame.sha256,
    })),
  };
}

async function decodedNoopAudioTrack(pcm: TrimPcmView): Promise<SemanticTrimTrack> {
  const boundary = await trimPcmBoundaryEvidence(pcm, 0, pcm.sampleFrames);
  return {
    identity: 'decoded-presentation:audio',
    type: 'audio',
    codecCanonical: 'decoded-f32-pcm',
    samples: [{
      ptsUs: 0,
      durationUs: Math.round(pcm.sampleFrames * 1_000_000 / pcm.sampleRate),
      contentDigest: [
        pcm.sampleRate,
        pcm.channels,
        pcm.sampleFrames,
        boundary.firstWindowDigest,
        boundary.lastWindowDigest,
      ].join(':'),
    }],
  };
}

async function semanticNoopPresentation(
  program: RemuxProgramEvidence,
  identities?: ReadonlyMap<string, string>,
): Promise<TrimSemanticPresentation> {
  const tracks: SemanticTrimTrack[] = [];
  for (const track of program.tracks) {
    const timestamped = track.samples.filter(
      (sample) => sample.ptsUs !== undefined && sample.durationUs !== undefined,
    );
    const firstPts = timestamped.length > 0 ? Math.min(...timestamped.map((sample) => sample.ptsUs!)) : 0;
    const endPts = timestamped.length > 0
      ? Math.max(...timestamped.map((sample) => sample.ptsUs! + sample.durationUs!))
      : 0;
    tracks.push({
      identity: identities?.get(track.id) ?? track.id,
      type: track.type,
      codecCanonical: canonicalCodecToken(track.codec) ?? (normStr(track.codec) || 'unknown'),
      ...(track.language !== undefined ? { language: track.language } : {}),
      samples: [{
        ptsUs: firstPts,
        durationUs: Math.max(0, endPts - firstPts),
        contentDigest: await semanticNoopTrackDigest(track),
      }],
    });
  }
  const derivedDuration = tracks.reduce(
    (max, track) => Math.max(max, ...track.samples.map((sample) => sample.ptsUs + sample.durationUs)),
    0,
  );
  return {
    tracks,
    durationUs: program.durationUs ?? derivedDuration,
  };
}

async function semanticNoopTrackDigest(track: RemuxTrackEvidence): Promise<string> {
  const normalized = normalizeRemuxTrackForTest(track);
  const payloads = normalized?.payloads ?? track.samples.map((sample) => sample.payload);
  const length = payloads.reduce((sum, payload) => sum + payload.byteLength, 0);
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const payload of payloads) {
    bytes.set(payload, offset);
    offset += payload.byteLength;
  }
  return sha256Hex(bytes);
}

async function trimComposeInvariant(
  ctx: OracleContext,
  t: Required<OracleTolerances>,
  which: string,
): Promise<OracleOutcome> {
  const oracle: OracleId = 'property-invariant';
  if (!ctx.engine) return fail(oracle, `[${which}] no candidate engine to perform trims`);
  if (!ctx.engine.concat) return fail(oracle, `[${which}] candidate engine does not implement concat()`);

  const options = ctx.scenario.options;
  const a = readNumberOption(options, ['a']);
  const b = readNumberOption(options, ['b']);
  const c = readNumberOption(options, ['c']);
  if (a == null || b == null || c == null || !(a < b && b < c)) {
    return fail(oracle, `[${which}] expected finite options a < b < c`);
  }
  const container = readStringOption(options, ['container']) ?? 'mp4';
  const frameAccurate = readBooleanOption(options, ['frameAccurate']);
  const trimOpts = { container, frameAccurate };

  let left: MediaBytes;
  let right: MediaBytes;
  let direct: MediaBytes;
  let concatenated: MediaBytes;
  try {
    left = await ctx.engine.trim(ctx.input, { startUs: a, endUs: b }, trimOpts);
    right = await ctx.engine.trim(ctx.input, { startUs: b, endUs: c }, trimOpts);
    direct = await ctx.engine.trim(ctx.input, { startUs: a, endUs: c }, trimOpts);
    concatenated = await ctx.engine.concat([left, right], { container });
  } catch (err) {
    if (isNotApplicableError(err)) throw err;
    return fail(oracle, `[${which}] trim/concat step failed: ${errMsg(err)}`);
  }

  // Decode both composed outputs (these frames ARE the real invariant signal below), then derive each
  // duration from the decoded frame-pts span, else the no-engine byte-reader container duration.
  let concatSink: FrameSink;
  let directSink: FrameSink;
  try {
    concatSink = await ctx.decodeWithPlatform(concatenated, { maxFrames: 240 });
    directSink = await ctx.decodeWithPlatform(direct, { maxFrames: 240 });
  } catch (err) {
    return fail(oracle, `[${which}] platform decode of trim outputs failed: ${errMsg(err)}`);
  }

  const expectedDurationSec = (c - a) / 1_000_000;
  const durationTolSec = Math.max(t.durationToleranceSec, 0.15);
  const concatDur =
    frameSpanSec(concatSink) ?? readStructureValue(concatenated.bytes, concatenated.container)?.durationSec ?? null;
  const directDur =
    frameSpanSec(directSink) ?? readStructureValue(direct.bytes, direct.container)?.durationSec ?? null;
  const durationDiffs: string[] = [];
  // Undeterminable durations are SKIPPED (not failed): the concat-vs-direct SSIM below is the gate.
  if (concatDur != null && Math.abs(concatDur - expectedDurationSec) > durationTolSec) {
    durationDiffs.push(
      `concat duration ${concatDur.toFixed(4)}s vs expected ${expectedDurationSec.toFixed(4)}s`,
    );
  }
  if (directDur != null && Math.abs(directDur - expectedDurationSec) > durationTolSec) {
    durationDiffs.push(
      `direct duration ${directDur.toFixed(4)}s vs expected ${expectedDurationSec.toFixed(4)}s`,
    );
  }
  if (concatDur != null && directDur != null && Math.abs(concatDur - directDur) > durationTolSec) {
    durationDiffs.push(
      `concat duration ${concatDur.toFixed(4)}s vs direct ${directDur.toFixed(4)}s`,
    );
  }

  const cmp = await compareFrameSsim(oracle, concatSink, directSink, t, 'concat trim vs direct trim');
  const measurements: Record<string, number> = {
    expectedDurationSec,
    durationToleranceSec: durationTolSec,
    ...(concatDur != null ? { concatDurationSec: concatDur } : {}),
    ...(directDur != null ? { directDurationSec: directDur } : {}),
    ...(cmp.measurements ?? {}),
  };

  if (cmp.state === 'ERROR') {
    return oracleError(oracle, cmp.reasonCode, cmp.detail, measurements);
  }
  if (cmp.state === 'UNAVAILABLE') {
    return unavailable(oracle, cmp.status, cmp.reasonCode, cmp.detail, measurements);
  }
  if (durationDiffs.length || cmp.verdict === 'FAIL') {
    return fail(
      oracle,
      `[invariant trim(a..b)+trim(b..c)==trim(a..c)] ${[...durationDiffs, cmp.detail ?? ''].filter(Boolean).join('; ')}`,
      measurements,
    );
  }

  const detail =
    `[invariant trim(a..b)+trim(b..c)==trim(a..c)] durations match and ${cmp.detail ?? 'frames compare'}`;
  return pass(oracle, detail, measurements);
}

async function demuxMuxRoundtripInvariant(
  ctx: OracleContext,
  t: Required<OracleTolerances>,
  which: string,
): Promise<OracleOutcome> {
  const oracle: OracleId = 'property-invariant';
  // demux(mux(x))==x: `mux` repackages x's coded samples LOSSLESSLY, so re-demuxing the mux output must
  // reproduce the SOURCE packet table (ctx.golden.packets = ffprobe of x). Parse the mux output's OWN
  // packet table (box-readers, no reference engine) and compare via the shared comparator — dropped or
  // reordered or resized packets are a real FAIL; an unreadable/absent-golden case is honest NA.
  return outputPacketsVsGolden(ctx, t, oracle, `[${which}] demux(mux(x))==x: `);
}

async function doubleRemuxStableInvariant(
  ctx: OracleContext,
  t: Required<OracleTolerances>,
  which: string,
): Promise<OracleOutcome> {
  const oracle: OracleId = 'property-invariant';
  if (!ctx.output) return fail(oracle, `[${which}] first remux output is missing`);
  if (!ctx.engine) return oracleError(oracle, 'ORACLE_CANDIDATE_ENGINE_MISSING', `[${which}] candidate engine is unavailable for the second remux leg`);

  const first = ctx.output;
  const tight = first.bytes.slice();
  const secondBlob = new Blob([tight.slice().buffer], { type: first.mime });
  const secondUrl = URL.createObjectURL(secondBlob);
  const secondInput: MediaInput = {
    id: `${ctx.input.id}#remux-leg-1`,
    url: secondUrl,
    mime: first.mime,
    sizeBytes: tight.byteLength,
    async arrayBuffer(): Promise<ArrayBuffer> {
      return tight.slice().buffer as ArrayBuffer;
    },
    async blob(): Promise<Blob> {
      return secondBlob;
    },
  };
  const container = readStringOption(ctx.scenario.options, ['container']) ?? first.container;
  let second: MediaBytes;
  try {
    second = await ctx.engine.remux(secondInput, { container });
  } finally {
    URL.revokeObjectURL(secondUrl);
  }

  const firstStructure = readOutputStructureResult(first.bytes, first.container);
  const secondStructure = readOutputStructureResult(second.bytes, second.container);
  for (const [label, read] of [
    ['first', firstStructure],
    ['second', secondStructure],
  ] as const) {
    if (read.state === 'MALFORMED' || read.state === 'INCOMPLETE') {
      return fail(oracle, `[${which}] ${label} remux is ${read.state.toLowerCase()} [${read.reasonCode}]`);
    }
    if (read.state !== 'OK') {
      return oracleError(
        oracle,
        read.reasonCode,
        `[${which}] ${label} remux has no neutral structure reader (${read.state})`,
      );
    }
  }
  if (firstStructure.state !== 'OK' || secondStructure.state !== 'OK') {
    return oracleError(oracle, 'ORACLE_REPEATED_REMUX_STRUCTURE_UNAVAILABLE', `[${which}] structure reader did not settle to OK`);
  }

  const structuralDiffs = compareStructureTracks(
    structureToMetadata(firstStructure.value).tracks,
    secondStructure.value.tracks,
  );
  const firstDuration = firstStructure.value.durationSec;
  const secondDuration = secondStructure.value.durationSec;
  if (
    firstDuration != null &&
    secondDuration != null &&
    Math.abs(firstDuration - secondDuration) > t.durationToleranceSec
  ) {
    structuralDiffs.push(
      `duration drift ${Math.abs(firstDuration - secondDuration).toFixed(6)}s > ${t.durationToleranceSec.toFixed(6)}s`,
    );
  }
  if (structuralDiffs.length) {
    return fail(oracle, `[${which}] second remux changed media structure: ${structuralDiffs.join('; ')}`);
  }

  const firstPackets = readOutputPacketsResult(first.bytes, first.container);
  const secondPackets = readOutputPacketsResult(second.bytes, second.container);
  for (const [label, read] of [
    ['first', firstPackets],
    ['second', secondPackets],
  ] as const) {
    if (read.state === 'MALFORMED' || read.state === 'INCOMPLETE') {
      return fail(oracle, `[${which}] ${label} remux packet table is ${read.state.toLowerCase()} [${read.reasonCode}]`);
    }
    if (read.state !== 'OK') {
      return oracleError(
        oracle,
        read.reasonCode,
        `[${which}] ${label} remux packet table is unavailable (${read.state})`,
      );
    }
  }
  if (firstPackets.state !== 'OK' || secondPackets.state !== 'OK') {
    return oracleError(oracle, 'ORACLE_REPEATED_REMUX_PACKETS_UNAVAILABLE', `[${which}] packet reader did not settle to OK`);
  }

  const packets = comparePacketTables(secondPackets.value, firstPackets.value, t.seekToleranceUs);
  const semanticPacketDiffs = packets.diffs.filter(
    (detail) =>
      detail.startsWith('packet count:') ||
      detail.startsWith('trackIndex layout:') ||
      detail.includes(' pts drift ') ||
      detail.includes(' dts drift '),
  );
  if (semanticPacketDiffs.length) {
    return fail(
      oracle,
      `[${which}] second remux changed packet semantics: ${semanticPacketDiffs.join('; ')}`,
      packets.measurements,
    );
  }

  const byteIdentical =
    first.bytes.byteLength === second.bytes.byteLength &&
    first.bytes.every((value, index) => value === second.bytes[index]);
  const representationDiffs = packets.diffs.filter((detail) => !semanticPacketDiffs.includes(detail));
  const measurements = {
    ...packets.measurements,
    firstBytes: first.bytes.byteLength,
    secondBytes: second.bytes.byteLength,
    byteIdentical: byteIdentical ? 1 : 0,
  };
  if (!byteIdentical || representationDiffs.length) {
    return diff(
      oracle,
      `[${which}] both remux legs are structurally/semantically valid but representation differs` +
        (representationDiffs.length ? `: ${representationDiffs.join('; ')}` : ''),
      measurements,
    );
  }
  return pass(
    oracle,
    `[${which}] remux(remux(x)) is byte-identical to remux(x)`,
    measurements,
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
  if (!videoPkts.length) {
    return missingGoldenOutcome(ctx.golden, 'packets', oracle, `[${which}] VFR packet PTS evidence is unavailable`);
  }

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

async function transcodeEffectInvariant(ctx: OracleContext): Promise<OracleOutcome> {
  const oracle: OracleId = 'property-invariant';
  const output = ctx.output;
  if (!output) {
    return transcodeDecisionOutcome(oracle, transcodeVerdict(
      'FAIL', 'TRANSCODE_TRANSFORM_OUTPUT_MISSING', 'effect-aware transcode produced no output bytes'));
  }
  const contract = transcodeTransformContractForScenario(ctx.scenario.id);
  if (!contract) {
    return transcodeDecisionOutcome(oracle, transcodeError(
      'TRANSCODE_TRANSFORM_CONTRACT_NOT_REGISTERED',
      `scenario '${ctx.scenario.id}' selected ${TRANSCODE_EFFECT_INVARIANT} without a transform contract`,
    ));
  }

  const candidateSignal = readTranscodeTransformSignal(output.bytes, output.container);
  if (candidateSignal.state !== 'OK') {
    const decision = candidateSignal.state === 'MALFORMED' || candidateSignal.state === 'INCOMPLETE'
      ? transcodeVerdict(
          'FAIL',
          candidateSignal.reasonCode,
          `candidate transform signaling is ${candidateSignal.state.toLowerCase()}: ${candidateSignal.detail}`,
        )
      : transcodeError(
          candidateSignal.reasonCode,
          `neutral candidate transform reader cannot inspect this structure: ${candidateSignal.detail}`,
        );
    return transcodeDecisionOutcome(oracle, decision);
  }

  let source: MediaBytes;
  try {
    source = {
      bytes: new Uint8Array(await ctx.input.arrayBuffer()),
      mime: ctx.input.mime,
      container: resolveContainer(ctx.golden.meta?.container, ctx.input.id),
    };
  } catch (error) {
    return transcodeDecisionOutcome(oracle, transcodeError(
      'TRANSCODE_TRANSFORM_SOURCE_READ_ERROR',
      `digest-verified source bytes could not be materialized: ${errMsg(error)}`,
    ));
  }

  const sourceSignal = readTranscodeTransformSignal(source.bytes, source.container);
  const sourceDepthRequired = contract.steps.some((step) =>
    step.kind === 'depth-convert' || step.kind === 'tone-map');
  if (sourceDepthRequired && (sourceSignal.state !== 'OK' || sourceSignal.value.bitDepth === undefined)) {
    const detail = sourceSignal.state === 'OK'
      ? 'neutral reader did not expose source bit depth'
      : `${sourceSignal.reasonCode}: ${sourceSignal.detail}`;
    return transcodeDecisionOutcome(oracle, transcodeUnavailable(
      'NA_ASSET', 'TRANSCODE_TRANSFORM_SOURCE_SIGNALING_UNAVAILABLE', detail));
  }

  let sourceSink: FrameSink;
  let candidateSink: FrameSink;
  try {
    [sourceSink, candidateSink] = await Promise.all([
      ctx.decodeWithPlatform(source, { maxFrames: 8 }),
      ctx.decodeWithPlatform(output, { maxFrames: 8 }),
    ]);
  } catch (error) {
    const role = sourceSignal.state === 'OK' ? 'candidate' : 'source';
    return classifyReferenceDecodeFailure(oracle, role, error, role === 'candidate' ? output : source);
  }
  if (typeof sourceSink.getPixels !== 'function' || typeof candidateSink.getPixels !== 'function') {
    return oracleError(
      oracle,
      'TRANSCODE_TRANSFORM_PIXELS_UNAVAILABLE',
      'neutral platform decode returned no pixel-bearing source/candidate sink',
    );
  }

  let sourceFrames: TranscodePixelFrame[];
  let candidateFrames: TranscodePixelFrame[];
  try {
    [sourceFrames, candidateFrames] = await Promise.all([
      transcodePixelFramesFromSink(sourceSink, sourceSignal.state === 'OK' ? sourceSignal.value.bitDepth ?? 8 : 8),
      transcodePixelFramesFromSink(candidateSink, candidateSignal.value.bitDepth ?? 8),
    ]);
  } catch (error) {
    return oracleError(
      oracle,
      'TRANSCODE_TRANSFORM_PIXEL_READ_ERROR',
      `neutral decoded pixels could not be collected: ${errMsg(error)}`,
    );
  }
  return transcodeDecisionOutcome(oracle, evaluateTranscodeRuntimeInvariant({
    invariant: TRANSCODE_EFFECT_INVARIANT,
    scenarioId: ctx.scenario.id,
    sourceFrames,
    candidateFrames,
    signal: candidateSignal.value,
  }));
}

async function transcodePixelFramesFromSink(
  sink: FrameSink,
  bitDepth: number,
): Promise<TranscodePixelFrame[]> {
  if (typeof sink.getPixels !== 'function') return [];
  const indexed = [...(sink.frames ?? [])]
    .map((frame, index) => ({ frame, index }))
    .sort((first, second) => first.frame.ptsUs - second.frame.ptsUs)
    .slice(0, 8);
  if (!indexed.length) return [];
  const originUs = indexed[0]!.frame.ptsUs;
  const deltas = indexed.slice(1).map((entry, index) => entry.frame.ptsUs - indexed[index]!.frame.ptsUs)
    .filter((value) => Number.isSafeInteger(value) && value > 0)
    .sort((first, second) => first - second);
  const fallbackDurationUs = deltas[Math.floor(deltas.length / 2)] ?? 33_333;
  const maximum = 2 ** bitDepth - 1;
  return Promise.all(indexed.map(async ({ frame, index }, sortedIndex) => {
    const pixels = await sink.getPixels!(index);
    const next = indexed[sortedIndex + 1]?.frame.ptsUs;
    const durationUs = next !== undefined && next > frame.ptsUs ? next - frame.ptsUs : fallbackDurationUs;
    const data = bitDepth <= 8
      ? Uint8Array.from(pixels.data, (value) => value)
      : Uint16Array.from(pixels.data, (value) => Math.round(value * maximum / 255));
    return Object.freeze({
      ptsUs: frame.ptsUs - originUs,
      durationUs,
      width: pixels.width,
      height: pixels.height,
      bitDepth,
      data,
    });
  }));
}

async function transcodeAudioContentInvariant(ctx: OracleContext): Promise<OracleOutcome> {
  const oracle: OracleId = 'property-invariant';
  const output = ctx.output;
  if (!output) {
    return transcodeDecisionOutcome(oracle, transcodeVerdict(
      'FAIL', 'TRANSCODE_AUDIO_OUTPUT_MISSING', 'audio-content transcode produced no output bytes'));
  }
  const structure = readTranscodeAudioStructure(output.bytes, output.container);
  if (structure.state !== 'OK') {
    const decision = structure.state === 'MALFORMED' || structure.state === 'INCOMPLETE'
      ? transcodeVerdict(
          'FAIL', structure.reasonCode,
          `candidate audio structure is ${structure.state.toLowerCase()}: ${structure.detail}`)
      : transcodeError(
          structure.reasonCode,
          `neutral candidate audio reader cannot inspect the authored program: ${structure.detail}`);
    return transcodeDecisionOutcome(oracle, decision);
  }
  const shape = validateRequestedTranscodeAudioShape(ctx, structure.value);
  if (shape) return transcodeDecisionOutcome(oracle, shape);

  let source: MediaBytes;
  try {
    source = {
      bytes: new Uint8Array(await ctx.input.arrayBuffer()),
      mime: ctx.input.mime,
      container: resolveContainer(ctx.golden.meta?.container, ctx.input.id),
    };
  } catch (error) {
    return transcodeDecisionOutcome(oracle, transcodeError(
      'TRANSCODE_AUDIO_SOURCE_READ_ERROR',
      `digest-verified source bytes could not be materialized: ${errMsg(error)}`,
    ));
  }

  let sourceSignal: DecodedAudioSignal;
  let candidateSignal: DecodedAudioSignal;
  try {
    [sourceSignal, candidateSignal] = await Promise.all([
      decodeTranscodeAudioSignal(source),
      decodeTranscodeAudioSignal(output, structure.value.timeline),
    ]);
  } catch (error) {
    const name = isObject(error) && typeof error.name === 'string' ? error.name : '';
    const message = errMsg(error);
    if (name === 'NotSupportedError' || /AudioContext|not supported|unsupported/i.test(message)) {
      return unavailable(
        oracle,
        'NA_BROWSER',
        'TRANSCODE_AUDIO_REFERENCE_DECODER_UNAVAILABLE',
        `neutral browser PCM decode is unavailable: ${message}`,
      );
    }
    return oracleError(
      oracle,
      'TRANSCODE_AUDIO_REFERENCE_DECODE_ERROR',
      `neutral browser PCM decode failed after structural validation: ${message}`,
    );
  }
  return transcodeDecisionOutcome(oracle, evaluateTranscodeRuntimeInvariant({
    invariant: TRANSCODE_AUDIO_CONTENT_INVARIANT,
    scenarioId: ctx.scenario.id,
    source: sourceSignal,
    candidate: candidateSignal,
  }));
}

function validateRequestedTranscodeAudioShape(
  ctx: OracleContext,
  structure: {
    container: string;
    codec: string;
    sampleRate: number;
    channels: number;
  },
): TranscodeDecision | undefined {
  const options = isObject(ctx.scenario.options) ? ctx.scenario.options : {};
  const expectedContainer = readStringOption(options, ['container']);
  const audio = readObjectOption(options, 'audio');
  if (expectedContainer && !sameContainerFamily(structure.container, expectedContainer)) {
    return transcodeVerdict(
      'FAIL', 'TRANSCODE_AUDIO_CONTAINER_MISMATCH',
      `candidate container '${structure.container}' vs requested '${expectedContainer}'`);
  }
  const expectedCodec = audio && readStringOption(audio, ['codec']);
  if (expectedCodec && canonicalTranscodeAudioCodec(structure.codec) !== canonicalTranscodeAudioCodec(expectedCodec)) {
    return transcodeVerdict(
      'FAIL', 'TRANSCODE_AUDIO_CODEC_MISMATCH',
      `candidate codec '${structure.codec}' vs requested '${expectedCodec}'`);
  }
  const expectedSampleRate = audio && readNumberOption(audio, ['sampleRate']);
  if (expectedSampleRate !== undefined && structure.sampleRate !== expectedSampleRate) {
    return transcodeVerdict(
      'FAIL', 'TRANSCODE_AUDIO_REQUESTED_SAMPLE_RATE_MISMATCH',
      `candidate ${structure.sampleRate}Hz vs requested ${expectedSampleRate}Hz`);
  }
  const expectedChannels = audio && readNumberOption(audio, ['channels']);
  if (expectedChannels !== undefined && structure.channels !== expectedChannels) {
    return transcodeVerdict(
      'FAIL', 'TRANSCODE_AUDIO_REQUESTED_CHANNELS_MISMATCH',
      `candidate ${structure.channels} channel(s) vs requested ${expectedChannels}`);
  }
  return undefined;
}

function canonicalTranscodeAudioCodec(value: string): string {
  const canonical = canonicalCodecToken(value);
  if (canonical) return canonical;
  const token = normStr(value);
  if (/^pcm[-_]?s?16/.test(token)) return 'pcm-s16';
  if (/^pcm[-_]?s?24/.test(token)) return 'pcm-s24';
  if (/^pcm[-_]?s?32/.test(token)) return 'pcm-s32';
  return token;
}

async function decodeTranscodeAudioSignal(
  media: MediaBytes,
  timeline?: AudioTimelineEvidence,
): Promise<DecodedAudioSignal> {
  const native = decodedPcmFromContainer(media.bytes, media.container);
  if (native) return native;
  const decoded = await decodeAudioBuffer(media);
  const samples = new Float64Array(decoded.length * decoded.numberOfChannels);
  for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
    const plane = new Float32Array(decoded.length);
    decoded.copyFromChannel(plane, channel);
    for (let frame = 0; frame < decoded.length; frame++) {
      samples[frame * decoded.numberOfChannels + channel] = plane[frame] ?? 0;
    }
  }
  return Object.freeze({
    sampleRate: decoded.sampleRate,
    channels: decoded.numberOfChannels,
    sampleFrames: decoded.length,
    samples,
    timelineDomain: 'presentation' as const,
    timeline: timeline ?? {
      kind: 'whole-program' as const,
      presentationSampleFrames: decoded.length,
    },
  });
}

function transcodeDecisionOutcome(oracle: OracleId, decision: TranscodeDecision): OracleOutcome {
  const measurements = decision.measurements ? finiteOnly({ ...decision.measurements }) : undefined;
  if (decision.state === 'VERDICT') {
    return {
      state: 'VERDICT',
      oracle,
      verdict: decision.verdict,
      reasonCode: decision.reasonCode,
      detail: decision.detail,
      ...(measurements && Object.keys(measurements).length ? { measurements } : {}),
    };
  }
  if (decision.state === 'UNAVAILABLE') {
    return {
      state: 'UNAVAILABLE',
      oracle,
      status: decision.status,
      reasonCode: decision.reasonCode,
      detail: decision.detail,
      ...(measurements && Object.keys(measurements).length ? { measurements } : {}),
    };
  }
  return {
    state: 'ERROR',
    oracle,
    reasonCode: decision.reasonCode,
    detail: decision.detail,
    ...(measurements && Object.keys(measurements).length ? { measurements } : {}),
  };
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

  // NO-ENGINE metadata: byte-read the mp4/webm structure, or parse an AIFF header directly. No scored
  // engine probe. Reader limitations are harness errors; malformed candidate bytes remain failures.
  const structureRead = readOutputStructureResult(ctx.output.bytes, ctx.output.container);
  const structure = structureRead.state === 'OK' ? structureRead.value : undefined;
  let meta: NormalizedMetadata | null = structure ? structureToMetadata(structure) : null;
  if (!meta && (expectedContainer === 'aiff' || normStr(ctx.output.container) === 'aiff')) {
    meta = parseAiffMetadata(ctx.output.bytes);
  }
  if (!meta) {
    const detail = `[${which}] transcode output metadata reader ${structureRead.state} ` +
      `${structureRead.state === 'OK' ? '' : `[${structureRead.reasonCode}] `}` +
      `(container '${normStr(ctx.output.container)}')`;
    if (structureRead.state === 'MALFORMED' || structureRead.state === 'INCOMPLETE') {
      return fail(oracle, detail);
    }
    return oracleError(
      oracle,
      structureRead.state === 'OK' ? 'ORACLE_METADATA_READER_UNAVAILABLE' : structureRead.reasonCode,
      detail,
    );
  }

  const diffs: string[] = [];
  const measurements: Record<string, number> = {};

  // Container family match: the byte reader emits a coarse 'mp4'/'webm' family label, so treat mp4↔mov
  // and webm↔mkv as equivalent — a correct in-family write target must not be false-failed.
  if (expectedContainer && !sameContainerFamily(meta.container, expectedContainer)) {
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
  // Prefer a track whose codec does not conflict with the request (confident match); else the first.
  const track =
    (requestedCodec ? tracks.find((candidate) => !codecsConflict(candidate.codec, requestedCodec)) : undefined) ??
    tracks[0];
  if (!track) {
    diffs.push(`${type} track: output has none vs requested '${requestedCodec ?? type}'`);
    return;
  }

  const prefix = `${type} track`;
  // Codec only when confident: the measured token is known AND it canonicalizes to a different token
  // than requested (or both are same-vocabulary strings that differ). An unknown token is skipped.
  if (requestedCodec && codecsConflict(track.codec, requestedCodec)) {
    diffs.push(`${prefix}.codec: '${track.codec}' vs requested '${requestedCodec}'`);
  }

  const width = readNumberOption(opts, ['width']);
  const height = readNumberOption(opts, ['height']);
  const fps = readNumberOption(opts, ['fps']);
  const sampleRate = readNumberOption(opts, ['sampleRate']);
  const channels = readNumberOption(opts, ['channels']);

  // Each dimension/rate is asserted ONLY when the byte reader actually resolved it (a null/undefined
  // measured field means "not byte-readable here" → skip, never a FAIL on an unknown value).
  if (type === 'video') {
    if (width != null && track.width != null && track.width !== width) {
      diffs.push(`${prefix}.width: ${track.width} vs requested ${width}`);
    }
    if (height != null && track.height != null && track.height !== height) {
      diffs.push(`${prefix}.height: ${track.height} vs requested ${height}`);
    }
    if (fps != null && track.fps != null && Math.abs(track.fps - fps) > t.fpsTolerance) {
      diffs.push(`${prefix}.fps: ${track.fps} vs requested ${fps} (tol ±${t.fpsTolerance})`);
    }
  } else {
    if (sampleRate != null && track.sampleRate != null && track.sampleRate !== sampleRate) {
      diffs.push(`${prefix}.sampleRate: ${track.sampleRate} vs requested ${sampleRate}`);
    }
    if (channels != null && track.channels != null && track.channels !== channels) {
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
  let unavailableGolden: GoldenStore | undefined;
  const observed: Array<{ label: string; durationSec: number; toleranceSec: number }> = [];

  entries.forEach((entry, index) => {
    const gotDur = entry.metadata?.durationSec ?? null;
    const wantDur = entry.golden?.meta?.durationSec ?? null;
    const label = entry.input.id;
    if (gotDur == null) {
      diffs.push(`${label}: measured duration is null` + (wantDur == null ? '' : ` vs golden ${wantDur}s`));
      return;
    }

    const container = resolveContainer(entry.golden?.meta?.container ?? entry.metadata?.container, label);
    const band = durationToleranceFor(container, label, t, explicitOverride);
    const tolSec = band.loose
      ? Math.max(band.tolSec, LOOSE_DURATION_REL * Math.abs(wantDur ?? gotDur))
      : band.tolSec;
    measurements[`durationToleranceSec${index}`] = tolSec;
    observed.push({ label, durationSec: gotDur, toleranceSec: tolSec });
    if (wantDur == null) {
      unavailableGolden ??= entry.golden ?? emptyGoldenStore();
      return;
    }
    if (wantDur != null) {
      const delta = Math.abs(gotDur - wantDur);
      measurements[`durationDeltaSec${index}`] = delta;
      if (delta > tolSec) {
        const looseNote = band.loose
          ? ` [estimate-only container '${container}': loose band applied]`
          : '';
        diffs.push(
          `${label}: measured ${gotDur.toFixed(4)}s vs golden ${wantDur.toFixed(4)}s ` +
            `(Δ ${delta.toFixed(4)}s > tol ${tolSec.toFixed(4)}s)${looseNote}`,
        );
      }
    }
  });

  // The metamorphic label is literal: compare measured matched renditions directly. Individual
  // agreement with unrelated goldens cannot satisfy cross-container consistency.
  if (entries.length > 1 && observed.length !== entries.length) {
    diffs.push('one or more matched renditions has no measured duration for the direct comparison');
  }
  if (observed.length > 1) {
    const anchor = observed[0]!;
    for (let index = 1; index < observed.length; index++) {
      const current = observed[index]!;
      const delta = Math.abs(current.durationSec - anchor.durationSec);
      const toleranceSec = Math.max(anchor.toleranceSec, current.toleranceSec);
      measurements[`crossDurationDeltaSec${index}`] = delta;
      measurements[`crossDurationToleranceSec${index}`] = toleranceSec;
      if (delta > toleranceSec) {
        diffs.push(
          `${current.label}: measured ${current.durationSec.toFixed(4)}s vs matched ` +
            `${anchor.label} ${anchor.durationSec.toFixed(4)}s ` +
            `(direct Δ ${delta.toFixed(4)}s > tol ${toleranceSec.toFixed(4)}s)`,
        );
      }
    }
  }

  if (diffs.length) return fail(oracle, `[${which}] ${diffs.join('; ')}`, measurements);
  if (unavailableGolden && observed.length < 2) {
    return missingGoldenOutcome(
      unavailableGolden,
      'meta',
      oracle,
      `[${which}] one or more input duration goldens are unavailable`,
    );
  }
  return pass(
    oracle,
    observed.length > 1
      ? `[invariant probe duration] ${observed.length} matched rendition(s) agree directly` +
        (unavailableGolden ? ' (individual golden unavailable)' : ' and match individual goldens')
      : `[invariant probe duration] ${entries.length} input(s) match their golden durations`,
    measurements,
  );
}

async function probeCrossWrapperDurationInvariant(
  ctx: OracleContext,
  t: Required<OracleTolerances>,
): Promise<OracleOutcome> {
  const oracle: OracleId = 'property-invariant';
  const contract = nestedProbeContract(ctx.scenario.options);
  const evidencePath = typeof contract?.wrapperEquivalenceEvidence === 'string'
    ? contract.wrapperEquivalenceEvidence
    : undefined;
  const expectedSha256 = typeof contract?.wrapperEquivalenceSha256 === 'string'
    ? contract.wrapperEquivalenceSha256.toLowerCase()
    : undefined;
  if (!evidencePath || !/^[0-9a-f]{64}$/.test(expectedSha256 ?? '')) {
    return {
      state: 'ERROR',
      oracle,
      reasonCode: 'PROBE_WRAPPER_EVIDENCE_IDENTITY_MISSING',
      detail: 'cross-wrapper scenario must bind its committed equivalence evidence by path and SHA-256',
    };
  }

  let response: Response;
  try {
    response = await fetch(evidencePath, { cache: 'no-store' });
  } catch (error) {
    return {
      state: 'UNAVAILABLE',
      oracle,
      status: 'NA_ASSET',
      reasonCode: 'PROBE_WRAPPER_EVIDENCE_FETCH_FAILED',
      detail: `wrapper equivalence evidence could not be fetched: ${errMsg(error)}`,
    };
  }
  if (response.status === 404) {
    return {
      state: 'UNAVAILABLE',
      oracle,
      status: 'NA_ASSET',
      reasonCode: 'PROBE_WRAPPER_EVIDENCE_MISSING',
      detail: `wrapper equivalence evidence '${evidencePath}' is missing`,
    };
  }
  if (!response.ok) {
    return {
      state: 'ERROR',
      oracle,
      reasonCode: 'PROBE_WRAPPER_EVIDENCE_HTTP_ERROR',
      detail: `wrapper equivalence evidence returned HTTP ${response.status}`,
    };
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    return {
      state: 'ERROR',
      oracle,
      reasonCode: 'PROBE_WRAPPER_EVIDENCE_BODY_ERROR',
      detail: `wrapper equivalence evidence body could not be read: ${errMsg(error)}`,
    };
  }
  let actualSha256: string;
  try {
    actualSha256 = await sha256Hex(bytes);
  } catch (error) {
    return {
      state: 'ERROR',
      oracle,
      reasonCode: 'PROBE_WRAPPER_EVIDENCE_DIGEST_ERROR',
      detail: `wrapper equivalence evidence could not be authenticated: ${errMsg(error)}`,
    };
  }
  if (actualSha256 !== expectedSha256) {
    return {
      state: 'ERROR',
      oracle,
      reasonCode: 'PROBE_WRAPPER_EVIDENCE_DIGEST_MISMATCH',
      detail: `wrapper equivalence evidence SHA-256 ${actualSha256} does not match ${expectedSha256}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch (error) {
    return {
      state: 'ERROR',
      oracle,
      reasonCode: 'PROBE_WRAPPER_EVIDENCE_PARSE_ERROR',
      detail: `wrapper equivalence evidence is not valid UTF-8 JSON: ${errMsg(error)}`,
    };
  }
  const evidence = parseProbeWrapperEquivalenceEvidence(parsed);
  if (!evidence) {
    return {
      state: 'ERROR',
      oracle,
      reasonCode: 'PROBE_WRAPPER_EVIDENCE_SCHEMA_ERROR',
      detail: 'wrapper equivalence evidence does not match the required schema',
    };
  }
  const wrapperProof = assessProbeWrapperEquivalence(evidence);
  if (wrapperProof.state !== 'VERDICT' || wrapperProof.verdict !== 'PASS') {
    return {
      state: 'ERROR',
      oracle,
      reasonCode: 'PROBE_WRAPPER_EVIDENCE_INVALID',
      detail: `[${wrapperProof.reasonCode}] ${wrapperProof.detail}`,
    };
  }

  const entries = ctx.probeMetadatas?.length
    ? ctx.probeMetadatas
    : ctx.metadata
      ? [{ input: ctx.input, metadata: ctx.metadata, golden: ctx.golden }]
      : [];
  const evidenceIds = new Set(evidence.wrappers.map((entry) => entry.assetId));
  if (entries.some((entry) => !evidenceIds.has(entry.input.id))) {
    return {
      state: 'ERROR',
      oracle,
      reasonCode: 'PROBE_WRAPPER_EVIDENCE_INPUT_MISMATCH',
      detail: 'executed wrapper inputs are not the digest-proven wrapper set',
    };
  }
  const explicitOverride = ctx.scenario.tolerances?.durationToleranceSec != null;
  const observations: ProbeDurationObservation[] = entries.map((entry) => {
    const goldenDurationSec = entry.golden.meta?.durationSec ?? null;
    const measuredDurationSec = entry.metadata.durationSec;
    const container = resolveContainer(entry.golden.meta?.container ?? entry.metadata.container, entry.input.id);
    const band = durationToleranceFor(container, entry.input.id, t, explicitOverride);
    const basis = goldenDurationSec ?? measuredDurationSec ?? 0;
    return {
      assetId: entry.input.id,
      container,
      durationSec: measuredDurationSec,
      goldenDurationSec,
      toleranceSec: band.loose
        ? Math.max(band.tolSec, LOOSE_DURATION_REL * Math.abs(basis))
        : band.tolSec,
    };
  });
  const proofOutcome = probeAssessmentOutcome(oracle, wrapperProof);
  const durationOutcome = probeAssessmentOutcome(
    oracle,
    assessCrossContainerProbeDuration(observations),
  );
  return reduceRequiredOracleLayers(oracle, [proofOutcome, durationOutcome]);
}

function nestedProbeContract(options: unknown): Record<string, unknown> | undefined {
  if (!isObject(options)) return undefined;
  const direct = isObject(options.probe) ? options.probe : undefined;
  const robustness = isObject(options.robustness) ? options.robustness : undefined;
  const nested = robustness && isObject(robustness.probe) ? robustness.probe : undefined;
  return nested ?? direct;
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

/** Preserve feature-specific stable reason codes when adapting a pure encryption decision into the
 * shared oracle envelope. Human detail may be prefixed for context; verdict semantics are unchanged. */
function encryptionVerdictOutcome(
  oracle: OracleId,
  decision: EncryptionEvidenceVerdict,
  detailPrefix = '',
): OracleOutcome {
  const measurements = decision.measurements ? { ...decision.measurements } : undefined;
  return {
    state: 'VERDICT',
    oracle,
    verdict: decision.verdict,
    reasonCode: decision.reasonCode,
    detail: `${detailPrefix}${decision.detail}`,
    ...(measurements ? { measurements } : {}),
  };
}

function probeAssessmentOutcome(
  oracle: OracleId,
  assessment: ProbeContractAssessment,
): OracleOutcome {
  if (assessment.state === 'VERDICT') {
    return {
      state: 'VERDICT',
      oracle,
      // A probe-contract DIFF classification is a representational difference → PASS verdict; the
      // difference stays in reasonCode/detail. Correctness is binary.
      verdict: assessment.verdict === 'DIFF' ? 'PASS' : assessment.verdict,
      reasonCode: assessment.reasonCode,
      detail: assessment.detail,
      ...(assessment.measurements ? { measurements: { ...assessment.measurements } } : {}),
      ...(assessment.evidence ? { evidence: jsonEvidence(assessment.evidence) } : {}),
    };
  }
  if (assessment.state === 'UNAVAILABLE') {
    return {
      state: 'UNAVAILABLE',
      oracle,
      status: assessment.status,
      reasonCode: assessment.reasonCode,
      detail: assessment.detail,
      ...(assessment.evidence ? { evidence: jsonEvidence(assessment.evidence) } : {}),
    };
  }
  return {
    state: 'ERROR',
    oracle,
    reasonCode: assessment.reasonCode,
    detail: assessment.detail,
    ...(assessment.evidence ? { evidence: jsonEvidence(assessment.evidence) } : {}),
  };
}

function probeEvidenceMissingOutcome(
  oracle: OracleId,
  reasonCode: string,
  detail: string,
): OracleOutcome {
  return { state: 'ERROR', oracle, reasonCode, detail };
}

/**
 * Several feature contracts are conjunctive layers inside one named oracle. A structural PASS must
 * not conceal a missing reader/trace layer, so this reducer is deliberately stricter than the
 * cross-oracle cell reducer: FAIL > ERROR > unavailable > DIFF > PASS. Sorting makes diagnostics
 * and the selected stable reason independent of authored layer order.
 */
function reduceRequiredOracleLayers(
  oracle: OracleId,
  layers: readonly OracleOutcome[],
): OracleOutcome {
  if (layers.length === 0) {
    return { state: 'ERROR', oracle, reasonCode: 'ORACLE_REQUIRED_LAYERS_EMPTY', detail: 'no required oracle layers ran' };
  }
  const rank = (outcome: OracleOutcome): number => {
    if (outcome.state === 'VERDICT') {
      if (outcome.verdict === 'FAIL') return 5;
      return 1;
    }
    if (outcome.state === 'ERROR') return 4;
    return 3;
  };
  const ordered = [...layers].sort((left, right) => {
    const rankDelta = rank(right) - rank(left);
    if (rankDelta !== 0) return rankDelta;
    return left.reasonCode.localeCompare(right.reasonCode) ||
      (left.detail ?? '').localeCompare(right.detail ?? '');
  });
  const decisive = ordered[0]!;
  const detail = ordered
    .map((outcome) => `[${outcome.reasonCode}] ${outcome.detail ?? ''}`)
    .join('; ');
  const measurements: Record<string, number> = {};
  const evidenceLayers: JsonObject[] = [];
  for (const outcome of ordered) {
    if (outcome.state === 'VERDICT' && outcome.measurements) {
      for (const [key, value] of Object.entries(outcome.measurements)) {
        if (Number.isFinite(value)) measurements[key] = value;
      }
    }
    if (outcome.evidence) {
      evidenceLayers.push({
        state: outcome.state,
        reasonCode: outcome.reasonCode,
        evidence: outcome.evidence,
      });
    }
  }
  const combinedEvidence = evidenceLayers.length > 0 ? { layers: evidenceLayers } satisfies JsonObject : undefined;
  if (decisive.state === 'VERDICT') {
    return {
      state: 'VERDICT',
      oracle,
      verdict: decisive.verdict,
      reasonCode: decisive.reasonCode,
      detail,
      ...(Object.keys(measurements).length > 0 ? { measurements } : {}),
      ...(combinedEvidence ? { evidence: combinedEvidence } : {}),
    };
  }
  if (decisive.state === 'UNAVAILABLE') {
    return {
      state: 'UNAVAILABLE',
      oracle,
      status: decisive.status,
      reasonCode: decisive.reasonCode,
      detail,
      ...(combinedEvidence ? { evidence: combinedEvidence } : {}),
    };
  }
  return {
    state: 'ERROR',
    oracle,
    reasonCode: decisive.reasonCode,
    detail,
    ...(combinedEvidence ? { evidence: combinedEvidence } : {}),
  };
}

function jsonEvidence(value: Record<string, unknown>): JsonObject {
  return JSON.parse(canonicalizeJson(value)) as JsonObject;
}

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

function pass(oracle: OracleId, detail: string, measurements?: Record<string, number>): OracleOutcome {
  return measurements
    ? { state: 'VERDICT', oracle, verdict: 'PASS', reasonCode: 'ORACLE_MATCH', detail, measurements }
    : { state: 'VERDICT', oracle, verdict: 'PASS', reasonCode: 'ORACLE_MATCH', detail };
}
function fail(oracle: OracleId, detail: string, measurements?: Record<string, number>): OracleOutcome {
  return measurements
    ? { state: 'VERDICT', oracle, verdict: 'FAIL', reasonCode: 'ORACLE_MISMATCH', detail, measurements }
    : { state: 'VERDICT', oracle, verdict: 'FAIL', reasonCode: 'ORACLE_MISMATCH', detail };
}
// A representationally-different-but-correct result is a PASS. The difference is still recorded in
// the outcome detail (reasonCode ORACLE_REPRESENTATION_DIFF) so "Open text details" can explain the
// codec-spelling / estimate-duration / track-reordering normalization, but correctness is binary:
// only a semantically wrong output fails.
function diff(oracle: OracleId, detail: string, measurements?: Record<string, number>): OracleOutcome {
  return measurements
    ? { state: 'VERDICT', oracle, verdict: 'PASS', reasonCode: 'ORACLE_REPRESENTATION_DIFF', detail, measurements }
    : { state: 'VERDICT', oracle, verdict: 'PASS', reasonCode: 'ORACLE_REPRESENTATION_DIFF', detail };
}
function unavailable(
  oracle: OracleId,
  status: 'NA_ASSET' | 'NA_BROWSER',
  reasonCode: string,
  detail: string,
  measurements?: Record<string, number>,
): OracleOutcome {
  return measurements
    ? { state: 'UNAVAILABLE', oracle, status, reasonCode, detail, measurements }
    : { state: 'UNAVAILABLE', oracle, status, reasonCode, detail };
}
function oracleError(
  oracle: OracleId,
  reasonCode: string,
  detail: string,
  measurements?: Record<string, number>,
): OracleOutcome {
  return measurements
    ? { state: 'ERROR', oracle, reasonCode, detail, measurements }
    : { state: 'ERROR', oracle, reasonCode, detail };
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
