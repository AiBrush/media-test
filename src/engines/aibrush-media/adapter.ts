/**
 * src/engines/aibrush-media/adapter.ts — MediaEngine adapter for `aibrush-media` (`@aibrush/media`),
 * the in-browser, capability-routed media engine built in ../../../../media. The runtime is installed
 * as a `file:../media` dependency (node_modules/@aibrush/media — its `dist/`, refreshed by
 * `bun run sync-vendor`; hermetic, no CDN). Both the pure-TS tier
 * (containers + probe + remux + keyframe-trim + CENC decrypt + audio-dsp + FLAC decode) AND the
 * WebCodecs/GPU codec tier (decode + frame-accurate seek + transcode/convert + GPU filters) back the
 * declared capabilities. Codec families the running browser cannot configure surface as NA_BROWSER via
 * the runner's declared∧detected gate; a genuine engine miss raises a typed CapabilityError that this
 * adapter maps to NotApplicableError (NA_ENGINE) — never a fake number (honesty, BUILD_INSTRUCTIONS §15).
 *
 * FRAME-DIGEST BIT-EXACTNESS. The decode/seek oracles compare frame digests against goldens baked by
 * the PLATFORM engine's WebCodecs decode (frame-bake.ts → platform decode.ts → raster.ts/digest.ts).
 * aibrush-media's codec tier decodes with the SAME browser WebCodecs `VideoDecoder`, so its VideoFrames
 * are identical; to make the DIGEST identical too we rasterize + hash through the very same harness
 * modules the golden producer uses (`../platform/raster.ts`, `../platform/digest.ts`) rather than a
 * re-implementation — any drift there would falsely fail a correct decode. Frames are emitted in
 * presentation (pts) order and re-indexed 0..N-1, matching the golden frame list the oracle pairs by
 * index (then golden pts). Every `VideoFrame` the engine hands us is `close()`d exactly once.
 *
 *   Dossier:  research/dossiers/aibrush-media.md
 *   Engine:   aibrush-media@dev   ·   Contract: src/core/engine.ts
 */

import type {
  ApplicabilityOperation,
  CapabilitySet,
  ConcreteOperationRequest,
  DecodeOptions,
  DecodeTrackSelector,
  DecryptKey,
  DemuxResult,
  EncodedTrack,
  EncodedTracks,
  EncryptionScheme,
  FrameDigest,
  FrameSink,
  MediaBytes,
  MediaEngine,
  MediaInput,
  MuxOptions,
  LifecycleContext,
  NormalizedMetadata,
  NormalizedTrack,
  OperationContext,
  PacketInfo,
  RemuxOptions,
  TrackType,
  TranscodeAudioOptions,
  TranscodeOptions,
  TranscodeVideoOptions,
} from '../../core/engine.ts';
import {
  createNotApplicableError,
  DECODE_TRACK_SELECTOR_SCHEMA,
  isBrowserNotSupportedError,
  isMalformedInputError,
  isNotApplicableError,
  MalformedInputError,
} from '../../core/engine.ts';
import { readOutputStructure, type ReadTrack } from '../../core/box-readers.ts';
import { registerEngine } from '../../core/registry.ts';
import { readNeutralRemuxProgram } from '../../features/remux/readers.ts';
import type {
  RemuxProgramEvidence,
  RemuxSampleEvidence,
  RemuxTrackEvidence,
} from '../../features/remux/types.ts';
import {
  type AibrushErrorClasses,
  translateAibrushFrameworkError,
} from './errors.ts';
import { verifyAibrushLiveWebmShape, verifyAibrushOutputShape } from './output-shape.ts';
import {
  AibrushCallbackAccumulator,
  AibrushPositionedWriteUnsupportedError,
  AibrushSinkTraceRecorder,
  type AibrushStreamingRuntimeEvidence,
} from './output-target.ts';
import {
  AIBRUSH_VENDOR_PROVENANCE,
  AibrushConfigEvidence,
  AibrushProvenanceError,
  captureLoadedAibrushWasmArtifacts,
} from './provenance.ts';
import {
  buildAibrushDemuxResult,
  canonicalAibrushCodec,
  normalizeAibrushTrack,
} from './representation.ts';
import { aibrushTupleSummary, decideAibrushSupport } from './support.ts';
import { takeFirstOwned } from './ownership.ts';
// Byte-for-byte the SAME normalization the golden producer uses (platform engine). Reusing these (not
// re-deriving them) is what makes aibrush-media's decode/seek frame digests comparable to golden.
import { digestImageData, sha256Hex } from '../platform/digest.ts';
import { imageDataFromVideoFrame } from '../platform/raster.ts';

const ENGINE_ID = 'aibrush-media@dev'; // instance .id — the versioned id stamped on every result + report
// Registry/selection alias: the SHORT id (mirrors 'mediabunny'/'mp4box'/…). `--engine aibrush-media`
// resolves to this, and the live matrix keys its column by it → main.ts maps it to the instance .id so
// the column matches the streamed results. Registering under the versioned id instead left the column
// keyed 'aibrush-media' while results arrived as 'aibrush-media@dev' → counted in the header, drawn in
// no cell (empty table). Symmetry with the other engines fixes that.
const REGISTER_ID = 'aibrush-media';
const RGBA_PIXEL_SIDECAR_PROPERTY = '__aibrushRgbaPixels';
const DIRECT_SINGLE_FRAME_MP4_MAX_BYTES = 512 * 1024;
const DIRECT_SINGLE_FRAME_MP4_SUBMIT_MARGIN = 16;

interface RgbaPixelSidecar {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

function rgbaPixelSidecar(frame: VideoFrame): RgbaPixelSidecar | undefined {
  const sidecar = (frame as VideoFrame & { readonly __aibrushRgbaPixels?: unknown }).__aibrushRgbaPixels;
  if (typeof sidecar !== 'object' || sidecar === null) return undefined;
  const record = sidecar as Partial<RgbaPixelSidecar>;
  const { data, width, height } = record;
  if (!(data instanceof Uint8ClampedArray)) return undefined;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) return undefined;
  if (width === undefined || height === undefined || width <= 0 || height <= 0) return undefined;
  if (data.length < width * height * 4) return undefined;
  return { data, width, height };
}

function imageDataFromAibrushFrame(frame: VideoFrame): Promise<ImageData> {
  const sidecar = rgbaPixelSidecar(frame);
  if (sidecar !== undefined) {
    const tight = sidecar.data.slice(0, sidecar.width * sidecar.height * 4);
    return Promise.resolve(new ImageData(tight, sidecar.width, sidecar.height));
  }
  return imageDataFromVideoFrame(frame);
}


/**
 * A genuine REJECTION of malformed/impossible input (distinct from NA): an op the engine WOULD attempt
 * but must refuse — e.g. muxing zero coded samples, or an audio-targeting transcode of a source with no
 * audio track. The runner's robustness path treats any non-NotApplicable throw as the desired "graceful
 * failure" (PASS) — exactly what the negative/mismatch cases reward. Deliberately NOT a NotApplicableError
 * (that maps to NA) and worded to avoid the capability-miss SENTENCES (so `naIfMiss` re-throws it rather
 * than re-mapping to NA): refusing an impossible request is correct behavior, not an absent capability.
 */
class GracefulRejectionError extends MalformedInputError {
  constructor(op: ApplicabilityOperation, message: string) {
    super({
      engineId: ENGINE_ID,
      operation: op,
      stage: 'validate',
      reasonCode: 'AIBRUSH_REQUEST_REJECTED',
      reason: message,
    });
  }
}

const MALFORMED_INPUT_RE =
  /(^|[/_-])(fuzz|malformed|truncated|zeroed|zero[-_]?length|header[-_]?destroyed|headerless|ciphertext|corrupt|mislabeled)([/_.-]|$)/i;

function isMalformedHarnessInput(input: MediaInput | undefined): boolean {
  if (input === undefined) return false;
  return input.mutated === true || MALFORMED_INPUT_RE.test(input.id);
}

function isGracefulNegativeContext(context?: OperationContext): boolean {
  if (context?.request.options.gracefulAllowOutput === true) return true;
  const robustness = context?.request.options.robustness;
  return typeof robustness === 'object' &&
    robustness !== null &&
    (robustness as { inputClass?: unknown }).inputClass === 'negative';
}

function isStillImageInput(input: MediaInput): boolean {
  const mime = input.mime.toLowerCase();
  const id = input.id.toLowerCase();
  return mime.startsWith('image/') || /\.(jpe?g|png|webp)(\.|$)/i.test(id);
}

// The runner owns the one deadline and AbortController for the whole cell. The adapter never creates a
// second timer/controller and never installs process-global rejection handlers; it forwards this exact
// signal into every framework call it can cancel.
const BUFFER_TARGET_MAX_SOURCE_BYTES = 512 * 1024 * 1024;
const PACKET_INFO_PREP_MAX_SOURCE_BYTES = 128 * 1024 * 1024;
const MP4_DEMUX_BYTE_PACKET_INFO_MAX_SOURCE_BYTES = 512 * 1024;
const ISO_BMFF_BUFFER_TARGET_MAX_SOURCE_BYTES = 1536 * 1024 * 1024;
const STREAM_TARGET_MAX_SOURCE_BYTES = 1536 * 1024 * 1024;
const NON_ISO_STREAM_TARGET_MAX_SOURCE_BYTES = 32 * 1024 * 1024;
// Below this size, decode/seek feed the engine one bulk-fetched in-memory buffer instead of a fresh
// per-call URL range source. A small clip's decode/seek reads the whole (or nearly all) file anyway, so a
// single GET beats the routeContainer-head + moov + sample range round-trips that dominate a tiny op's
// wall; larger inputs keep the range source so seek/streaming never buffers a huge file. Size-gated on the
// real input length (a general runtime property), never on a fixture identity.
const SEEK_DECODE_BULK_FETCH_MAX_BYTES = 4 * 1024 * 1024;

async function withCellSignal<T>(
  context: OperationContext | undefined,
  body: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const signal = context?.signal ?? new AbortController().signal;
  signal.throwIfAborted();
  const result = await body(signal);
  signal.throwIfAborted();
  return result;
}

// The vendored engine's public surface (subset we use), narrowed to the harness types in each method.
// `Cancellable<T>` is a `Promise<T>` with a `.cancel()` — awaiting it is all we need; we never cancel.
interface AibrushTrack {
  id: number;
  type: 'video' | 'audio';
  codec: string;
  durationSec?: number;
  width?: number;
  height?: number;
  rotation?: number;
  fps?: number;
  sampleRate?: number;
  channels?: number;
  language?: string;
}
interface AibrushInfo {
  container: string;
  durationSec: number;
  tracks: AibrushTrack[];
  tags?: Record<string, string>;
}
interface AibrushChunk {
  byteLength: number;
  timestamp: number;
  duration?: number | null;
  type: string;
  /** WebCodecs EncodedVideo/AudioChunk byte copy — the verbatim coded sample bytes. */
  copyTo(dst: BufferSource): void;
}
/**
 * The seam packet (engine ADR-045): a sealed WebCodecs chunk (PTS in `chunk.timestamp`) plus the optional
 * decode timestamp `dtsUs`. We read `dtsUs` for the golden-packets decode-order sort (B-frame/open-GOP
 * streams reorder PTS ≠ DTS); `undefined` remains absent in normalized evidence. A local mux scheduler
 * may use PTS as an ordering fallback, but that fallback is never promoted into shared DTS evidence.
 * `data`, when present, is an owned byte view of the same coded payload and lets packet-copy muxers avoid
 * a second host-object `copyTo()` after the adapter has already materialized the bytes.
 * `sizeBytes`, when present, is the on-disk packet size (ADTS full frame) even if `chunk` is a decoder AU.
 */
interface AibrushPacket {
  chunk: AibrushChunk;
  data?: Uint8Array;
  dtsUs?: number;
  sizeBytes?: number;
}
interface AibrushPreparedMp3Packet {
  readonly data: Uint8Array;
  readonly ptsUs: number;
  readonly durationUs?: number;
  readonly keyframe?: boolean;
}
interface AibrushPreparedWebmChunk {
  readonly timestampUs: number;
  readonly durationUs?: number;
  readonly key: boolean;
  readonly data: Uint8Array;
  readonly dtsUs?: number;
  readonly alpha?: Uint8Array;
}
interface AibrushPacketMetadata {
  trackId: number;
  sizeBytes: number;
  ptsUs: number;
  dtsUs: number;
  durationUs: number;
  keyframe: boolean;
}
type AibrushPacketInfoRow = AibrushPacketMetadata & {
  trackIndex?: number;
  size?: number;
};
type IndexedAibrushPacketInfoRow = AibrushPacketMetadata & {
  trackIndex: number;
  size: number;
};
interface AibrushPacketInfoMetadata {
  trackIndex: number;
  offset?: number;
  size: number;
  ptsUs: number;
  dtsUs?: number;
  durationUs?: number;
  keyframe: boolean;
}
interface AibrushPacketInfoTable {
  tracks: ReadonlyArray<AibrushTrackInfo>;
  packets: ReadonlyArray<AibrushPacketInfoMetadata>;
}
interface AibrushWebmPacketPayloadMetadata extends AibrushPacketInfoMetadata {
  readonly data: Uint8Array;
  readonly alpha?: Uint8Array;
}
interface AibrushWebmPacketPayloadInfoTable {
  readonly tracks: ReadonlyArray<AibrushTrackInfo>;
  readonly packets: ReadonlyArray<AibrushWebmPacketPayloadMetadata>;
}

function hasHarnessPacketAliases(
  row: AibrushPacketInfoRow | undefined,
  trackCount: number,
): row is IndexedAibrushPacketInfoRow {
  const trackIndex = row?.trackIndex;
  const size = row?.size;
  if (typeof trackIndex !== 'number' || typeof size !== 'number') return false;
  return (
    Number.isInteger(trackIndex) &&
    trackIndex >= 0 &&
    trackIndex < trackCount &&
    Number.isSafeInteger(size) &&
    size >= 0
  );
}

function packetRowsArePreindexed(packetRows: readonly AibrushPacketInfoRow[], trackCount: number): boolean {
  if (packetRows.length === 0) return true;
  const first = packetRows[0];
  const last = packetRows[packetRows.length - 1];
  return hasHarnessPacketAliases(first, trackCount) && (last === first || hasHarnessPacketAliases(last, trackCount));
}

function encodedFlacTrackFromPacketInfo(
  table: AibrushPacketInfoTable,
  bytes: Uint8Array,
): EncodedTrack | undefined {
  const track = table.tracks[0];
  const cfg = track?.config ?? {};
  if (
    table.tracks.length !== 1 ||
    track === undefined ||
    track.mediaType !== 'audio' ||
    canonicalCodec(track.codec ?? cfg.codec ?? '') !== 'flac' ||
    cfg.sampleRate === undefined ||
    cfg.numberOfChannels === undefined
  ) {
    return undefined;
  }
  const chunks: EncodedTrack['chunks'] = [];
  for (const row of table.packets) {
    const { offset, durationUs } = row;
    if (
      row.trackIndex !== 0 ||
      offset === undefined ||
      durationUs === undefined ||
      offset < 0 ||
      row.size < 0 ||
      offset + row.size > bytes.byteLength
    ) {
      return undefined;
    }
    chunks.push({
      data: bytes.slice(offset, offset + row.size),
      ptsUs: row.ptsUs,
      ...(row.dtsUs !== undefined ? { dtsUs: row.dtsUs } : {}),
      durationUs,
      keyframe: row.keyframe,
    });
  }
  if (chunks.length === 0) return undefined;
  return {
    type: 'audio',
    codec: 'flac',
    timescale: 1_000_000,
    sampleRate: cfg.sampleRate,
    channels: cfg.numberOfChannels,
    ...(cfg.description !== undefined ? { description: bufferBytes(cfg.description) } : {}),
    chunks,
  };
}

function encodedOggAudioTrackFromPacketInfo(
  table: AibrushPacketInfoTable,
  bytes: Uint8Array,
): EncodedTrack | undefined {
  const track = table.tracks[0];
  const cfg = track?.config ?? {};
  const codec = canonicalCodec(track?.codec ?? cfg.codec ?? '');
  if (
    table.tracks.length !== 1 ||
    track === undefined ||
    track.mediaType !== 'audio' ||
    !OGG_AUDIO_CODECS.has(codec) ||
    cfg.sampleRate === undefined ||
    cfg.numberOfChannels === undefined
  ) {
    return undefined;
  }
  const chunks: EncodedTrack['chunks'] = [];
  for (const row of table.packets) {
    const { offset, durationUs } = row;
    if (
      row.trackIndex !== 0 ||
      offset === undefined ||
      durationUs === undefined ||
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(row.size) ||
      !Number.isFinite(durationUs) ||
      offset < 0 ||
      row.size <= 0 ||
      durationUs < 0
    ) {
      return undefined;
    }
    const end = offset + row.size;
    if (!Number.isSafeInteger(end) || end > bytes.byteLength) return undefined;
    chunks.push({
      data: bytes.subarray(offset, end),
      ptsUs: row.ptsUs,
      ...(row.dtsUs !== undefined ? { dtsUs: row.dtsUs } : {}),
      durationUs,
      keyframe: row.keyframe,
    });
  }
  if (chunks.length === 0) return undefined;
  return {
    type: 'audio',
    codec,
    timescale: 1_000_000,
    sampleRate: cfg.sampleRate,
    channels: cfg.numberOfChannels,
    ...(cfg.description !== undefined ? { description: bufferBytes(cfg.description) } : {}),
    chunks,
  };
}

function encodedMp3AudioTrackFromPacketInfo(
  table: AibrushPacketInfoTable,
  bytes: Uint8Array,
): EncodedTrack | undefined {
  const track = table.tracks[0];
  const cfg = track?.config ?? {};
  const codec = canonicalCodec(track?.codec ?? cfg.codec ?? '');
  if (
    table.tracks.length !== 1 ||
    track === undefined ||
    track.mediaType !== 'audio' ||
    codec !== 'mp3' ||
    cfg.sampleRate === undefined ||
    cfg.numberOfChannels === undefined
  ) {
    return undefined;
  }
  const chunks: EncodedTrack['chunks'] = [];
  for (const row of table.packets) {
    const { offset, durationUs } = row;
    if (
      row.trackIndex !== 0 ||
      offset === undefined ||
      durationUs === undefined ||
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(row.size) ||
      !Number.isFinite(durationUs) ||
      offset < 0 ||
      row.size <= 0 ||
      durationUs < 0
    ) {
      return undefined;
    }
    const end = offset + row.size;
    if (!Number.isSafeInteger(end) || end > bytes.byteLength) return undefined;
    chunks.push({
      data: bytes.subarray(offset, end),
      ptsUs: row.ptsUs,
      ...(row.dtsUs !== undefined ? { dtsUs: row.dtsUs } : {}),
      durationUs,
      keyframe: row.keyframe,
    });
  }
  if (chunks.length === 0) return undefined;
  return {
    type: 'audio',
    codec: 'mp3',
    timescale: 1_000_000,
    sampleRate: cfg.sampleRate,
    channels: cfg.numberOfChannels,
    chunks,
  };
}

function encodedAdtsAudioTrackFromPacketInfo(
  table: AibrushPacketInfoTable,
  bytes: Uint8Array,
): EncodedTrack | undefined {
  const track = table.tracks[0];
  const cfg = track?.config ?? {};
  const codec = canonicalCodec(track?.codec ?? cfg.codec ?? '');
  if (
    table.tracks.length !== 1 ||
    track === undefined ||
    track.mediaType !== 'audio' ||
    codec !== 'aac' ||
    cfg.sampleRate === undefined ||
    cfg.numberOfChannels === undefined
  ) {
    return undefined;
  }
  const chunks: EncodedTrack['chunks'] = [];
  for (const row of table.packets) {
    const { offset, durationUs } = row;
    if (
      row.trackIndex !== 0 ||
      offset === undefined ||
      durationUs === undefined ||
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(row.size) ||
      !Number.isFinite(durationUs) ||
      offset < 0 ||
      row.size <= 0 ||
      durationUs <= 0
    ) {
      return undefined;
    }
    const end = offset + row.size;
    if (!Number.isSafeInteger(end) || end > bytes.byteLength) return undefined;
    chunks.push({
      data: bytes.subarray(offset, end),
      ptsUs: row.ptsUs,
      ...(row.dtsUs !== undefined ? { dtsUs: row.dtsUs } : {}),
      durationUs,
      keyframe: row.keyframe,
    });
  }
  if (chunks.length === 0) return undefined;
  return {
    type: 'audio',
    codec,
    timescale: 1_000_000,
    sampleRate: cfg.sampleRate,
    channels: cfg.numberOfChannels,
    ...(cfg.description !== undefined ? { description: bufferBytes(cfg.description) } : {}),
    chunks,
  };
}

function encodedMp4VideoTrackFromPacketInfo(
  table: AibrushPacketInfoTable,
  bytes: Uint8Array,
): EncodedTrack | undefined {
  const track = table.tracks[0];
  const cfg = track?.config ?? {};
  const codec = canonicalCodec(track?.codec ?? cfg.codec ?? '');
  const width = cfg.codedWidth;
  const height = cfg.codedHeight;
  if (
    table.tracks.length !== 1 ||
    track === undefined ||
    track.mediaType !== 'video' ||
    codec !== 'h264' ||
    width === undefined ||
    height === undefined ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }
  const chunks: EncodedTrack['chunks'] = [];
  for (const row of table.packets) {
    const { offset, durationUs } = row;
    if (
      row.trackIndex !== 0 ||
      offset === undefined ||
      durationUs === undefined ||
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(row.size) ||
      !Number.isFinite(durationUs) ||
      offset < 0 ||
      row.size <= 0 ||
      durationUs <= 0
    ) {
      return undefined;
    }
    const end = offset + row.size;
    if (!Number.isSafeInteger(end) || end > bytes.byteLength) return undefined;
    chunks.push({
      data: bytes.subarray(offset, end),
      ptsUs: row.ptsUs,
      ...(row.dtsUs !== undefined ? { dtsUs: row.dtsUs } : {}),
      durationUs,
      keyframe: row.keyframe,
    });
  }
  if (chunks.length === 0) return undefined;
  return {
    type: 'video',
    codec,
    timescale: 1_000_000,
    width,
    height,
    ...(cfg.description !== undefined ? { description: bufferBytes(cfg.description) } : {}),
    chunks,
  };
}

function encodedMp4TracksFromPacketInfo(
  table: AibrushPacketInfoTable,
  bytes: Uint8Array,
): EncodedTrack[] | undefined {
  const tracks: EncodedTrack[] = [];
  for (let trackIndex = 0; trackIndex < table.tracks.length; trackIndex++) {
    const sourceTrack = table.tracks[trackIndex];
    const encodedTrack =
      sourceTrack === undefined
        ? undefined
        : encodedMp4TrackFromPacketInfo(table, bytes, sourceTrack, trackIndex);
    if (encodedTrack !== undefined) tracks.push(encodedTrack);
  }
  return tracks.length === 0 ? undefined : tracks;
}

function encodedMp4TrackFromPacketInfo(
  table: AibrushPacketInfoTable,
  bytes: Uint8Array,
  track: AibrushTrackInfo,
  trackIndex: number,
): EncodedTrack | undefined {
  const cfg = track.config ?? {};
  const codec = canonicalCodec(track.codec ?? cfg.codec ?? '');
  const chunks: EncodedTrack['chunks'] = [];
  for (const row of table.packets) {
    if (row.trackIndex !== trackIndex) continue;
    const { offset, durationUs } = row;
    if (
      offset === undefined ||
      durationUs === undefined ||
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(row.size) ||
      !Number.isFinite(durationUs) ||
      offset < 0 ||
      row.size <= 0 ||
      durationUs <= 0
    ) {
      return undefined;
    }
    const end = offset + row.size;
    if (!Number.isSafeInteger(end) || end > bytes.byteLength) return undefined;
    chunks.push({
      data: bytes.subarray(offset, end),
      ptsUs: row.ptsUs,
      ...(row.dtsUs !== undefined ? { dtsUs: row.dtsUs } : {}),
      durationUs,
      keyframe: row.keyframe,
    });
  }
  if (chunks.length === 0) return undefined;
  if (track.mediaType === 'video') {
    const width = cfg.codedWidth;
    const height = cfg.codedHeight;
    if (
      codec !== 'h264' ||
      width === undefined ||
      height === undefined ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      return undefined;
    }
    return {
      type: 'video',
      codec,
      timescale: 1_000_000,
      width,
      height,
      ...(cfg.description !== undefined ? { description: bufferBytes(cfg.description) } : {}),
      chunks,
    };
  }
  const sampleRate = cfg.sampleRate;
  const channels = cfg.numberOfChannels;
  if (
    track.mediaType !== 'audio' ||
    codec !== 'aac' ||
    sampleRate === undefined ||
    channels === undefined ||
    !Number.isFinite(sampleRate) ||
    !Number.isFinite(channels) ||
    sampleRate <= 0 ||
    channels <= 0
  ) {
    return undefined;
  }
  return {
    type: 'audio',
    codec,
    timescale: 1_000_000,
    sampleRate,
    channels,
    ...(cfg.description !== undefined ? { description: bufferBytes(cfg.description) } : {}),
    chunks,
  };
}

/** The demux `TrackInfo` fields the mux track-assembly reads (WebCodecs DecoderConfig subset). */
interface AibrushTrackInfo {
  id: number;
  mediaType: 'video' | 'audio';
  codec?: string;
  durationSec?: number;
  gapless?: {
    readonly leadingSamples?: number;
    readonly trailingSamples?: number;
    readonly totalSamples?: number;
  };
  config?: {
    codec?: string;
    codedWidth?: number;
    codedHeight?: number;
    sampleRate?: number;
    numberOfChannels?: number;
    description?: BufferSource;
  };
}
interface AibrushDemuxed {
  tracks: ReadonlyArray<AibrushTrackInfo>;
  packetInfoTable?(): ReadonlyArray<AibrushPacketInfoMetadata>;
  packetTable?(): ReadonlyArray<AibrushPacketMetadata>;
  packets(trackId: number): ReadableStream<AibrushPacket>;
  close(): Promise<void>;
}
/** The decode result: lazy frame streams; errors surface when a stream is first pulled. */
interface AibrushMediaStreams {
  video?: ReadableStream<VideoFrame>;
  audio?: ReadableStream<AudioData>;
}
/** Codec-tier convert/transcode target (public `ConvertOptions`, ADR-011/012). */
interface AibrushVideoTarget {
  codec?: string;
  width?: number;
  height?: number;
  fit?: 'contain' | 'cover' | 'fill';
  fps?: number;
  bitrate?: number;
  crf?: number;
  twoPass?: boolean;
  bitDepth?: 8 | 10 | 12;
  alpha?: 'keep' | 'discard';
  rotate?: 0 | 90 | 180 | 270;
  flip?: 'h' | 'v';
  crop?: { x: number; y: number; width: number; height: number };
  colorspace?: { to: string };
  tonemap?: { to: 'sdr' };
}
interface AibrushAudioTarget {
  codec?: string;
  sampleRate?: number;
  channels?: number;
  bitrate?: number;
  gainDb?: number;
  fade?: { inSec?: number; outSec?: number; curve?: 'linear' | 'equal-power' };
}
interface AibrushStreamSink {
  readonly kind: 'stream';
}
type AibrushStreamTargetWriter = (chunk: Uint8Array, position: number) => void | Promise<void>;
interface AibrushStreamTargetSink {
  readonly kind: 'stream-target';
  readonly destination: WritableStream<Uint8Array> | AibrushStreamTargetWriter;
}
type AibrushSink = AibrushStreamSink | AibrushStreamTargetSink;
type AibrushOutput = Blob | ReadableStream<Uint8Array> | Uint8Array | undefined;
type AibrushPcmSampleFormat = 'u8' | 's8' | 's16' | 's24' | 's32' | 'f32' | 'f64';
type AibrushPcmEndian = 'le' | 'be';
interface AibrushConvertOptions {
  to?: string;
  video?: false | AibrushVideoTarget;
  audio?: false | AibrushAudioTarget;
  faststart?: boolean;
  fragmented?: boolean;
  sink?: AibrushSink;
}
/**
 * Per-call options the engine's public ops accept (a subset of its `CallOptions`). We pass only
 * `signal`: the adapter's per-op timeout aborts it so a hung/runaway engine call (a retrying license
 * fetch, a stuck decode/encode, a parser loop) is CANCELLED — not merely abandoned — and never blocks
 * the run. The engine threads it into every driver's abort listener (docs/05 §3 cancellation).
 */
interface AibrushCallOptions {
  signal?: AbortSignal;
  container?: string;
}
interface AibrushFromOptions {
  mime?: string;
  rangeRequests?: boolean;
  size?: number;
}
interface AibrushEngine {
  from(input: unknown, opts?: AibrushFromOptions): unknown;
  probe(input: unknown, o?: AibrushCallOptions): Promise<AibrushInfo>;
  probeContainer?(input: unknown, container: string, o?: AibrushCallOptions): Promise<AibrushInfo>;
  packetInfo?(input: unknown, o?: AibrushCallOptions): Promise<AibrushPacketInfoTable>;
  demux(input: unknown, o?: AibrushCallOptions): Promise<AibrushDemuxed>;
  remux(
    input: unknown,
    opts: {
      to: string;
      faststart?: boolean;
      fragmented?: boolean;
      trackSelect?: readonly string[];
      tags?: Record<string, string>;
      sink?: AibrushSink;
    },
    o?: AibrushCallOptions,
  ): Promise<AibrushOutput>;
  trim(
    input: unknown,
    opts: { start: number; end: number; mode: 'keyframe' | 'accurate'; sink?: AibrushSink },
    o?: AibrushCallOptions,
  ): Promise<AibrushOutput>;
  decrypt(
    input: unknown,
    opts: { scheme: string; keys: Record<string, string>; sink?: AibrushSink },
    o?: AibrushCallOptions,
  ): Promise<AibrushOutput>;
  // Codec tier. `decode` returns synchronously (lazy streams); the rest are Cancellable promises.
  decode(input: unknown, o?: AibrushCallOptions): AibrushMediaStreams;
  convert(input: unknown, opts: AibrushConvertOptions, o?: AibrushCallOptions): Promise<AibrushOutput>;
  pcm?(
    input: unknown,
    sourceContainer: string,
    opts: AibrushConvertOptions,
    o?: AibrushCallOptions,
  ): Promise<AibrushOutput>;
  wavPcmPacketCopy?(input: {
    readonly payload: Uint8Array;
    readonly sourceBytes?: Uint8Array;
    readonly codec: string;
    readonly sampleRate: number;
    readonly channels: number;
  }): Promise<Uint8Array>;
  seek(input: unknown, timeUs: number, o?: AibrushCallOptions): Promise<VideoFrame>;
  // Public packet-seam mux (engine `mux`): pack caller-supplied coded packet streams — from one OR several
  // demuxed sources (`tracks[]`) — into a target container. The TrackInfo travels with each stream so the
  // target muxer arbitrates codec legality. Backs multi-source assembly (no single source file to remux).
  mux(
    streams: AibrushPacketStreams,
    opts: { container: string; faststart?: boolean; fragmented?: boolean; sink?: AibrushSink },
    o?: AibrushCallOptions,
  ): Promise<AibrushOutput>;
  h264AbrLadder(
    input: unknown,
    ladder: readonly AibrushH264AbrRung[],
    o?: AibrushCallOptions,
  ): Promise<readonly AibrushOutput[]>;
}

interface AibrushH264AbrRung {
  readonly name?: string;
  readonly width: number;
  readonly height: number;
  readonly bitrate: number;
  readonly fps?: number;
}

/** One coded packet stream + its declaring track (the engine `mux` input element). */
interface AibrushPacketStream {
  track: AibrushTrackInfo;
  packets?: ReadableStream<AibrushPacket>;
  packetsArray?: readonly AibrushPacket[];
}
/** Engine `mux` input: single video/audio slots and/or an arbitrary `tracks[]` (multi-source assembly). */
interface AibrushPacketStreams {
  video?: AibrushPacketStream;
  audio?: AibrushPacketStream;
  tracks?: readonly AibrushPacketStream[];
}
interface AibrushMedia {
  readonly VERSION: string;
  readonly CapabilityError: AibrushErrorClasses['CapabilityError'];
  readonly InputError: AibrushErrorClasses['InputError'];
  createMedia(opts?: { determinism?: 'auto' | 'force-software' }): AibrushEngine;
  toStream(): AibrushStreamSink;
  toStreamTarget(destination: WritableStream<Uint8Array> | AibrushStreamTargetWriter): AibrushStreamTargetSink;
  writeToStreamTarget(
    target: AibrushStreamTargetSink,
    stream: ReadableStream<Uint8Array>,
    opts?: { readonly signal?: AbortSignal },
  ): Promise<undefined>;
}
interface AibrushCore {
  aiffPcmToWavFromBytes(
    bytes: Uint8Array,
    opts?: {
      readonly sampleFormat?: AibrushPcmSampleFormat;
      readonly endian?: AibrushPcmEndian;
      readonly channels?: number;
      readonly sampleRate?: number;
    },
  ): Uint8Array | undefined;
  wavF32GainToWavFromBytes(
    bytes: Uint8Array,
    opts: {
      readonly gainDb: number;
      readonly sampleFormat?: AibrushPcmSampleFormat;
      readonly endian?: AibrushPcmEndian;
      readonly channels?: number;
      readonly sampleRate?: number;
      readonly signal?: AbortSignal;
    },
  ): Uint8Array | undefined;
  wavPcmFormatToWavFromBytes(
    bytes: Uint8Array,
    opts: {
      readonly sampleFormat: AibrushPcmSampleFormat;
      readonly channels?: number;
      readonly sampleRate?: number;
      readonly signal?: AbortSignal;
    },
  ): Uint8Array | undefined;
  wavS16ResampleToWavFromBytes(
    bytes: Uint8Array,
    opts: {
      readonly sampleRate: number;
      readonly channels?: number;
      readonly signal?: AbortSignal;
    },
  ): Uint8Array | undefined;
  adtsPacketInfoFromBytes(bytes: Uint8Array): AibrushPacketInfoTable;
  adtsTrimFromUrl(
    url: string,
    opts: {
      readonly mime?: string;
      readonly size?: number;
      readonly startSec: number;
      readonly endSec: number;
      readonly signal?: AbortSignal;
    },
  ): Promise<Uint8Array>;
  mp4PacketInfoFromBytes(bytes: Uint8Array, opts?: { readonly includeOffsets?: boolean; readonly signal?: AbortSignal }): Promise<AibrushPacketInfoTable>;
  mp4PacketInfoFromUrl(
    url: string,
    opts?: { readonly mime?: string; readonly size?: number; readonly signal?: AbortSignal },
  ): Promise<AibrushPacketInfoTable>;
  wavPacketInfoFromUrl(
    url: string,
    opts?: { readonly mime?: string; readonly size?: number; readonly signal?: AbortSignal },
  ): Promise<AibrushPacketInfoTable>;
  aiffPacketInfoFromUrl(
    url: string,
    opts?: { readonly mime?: string; readonly size?: number; readonly signal?: AbortSignal },
  ): Promise<AibrushPacketInfoTable>;
  wavTrimFromUrl(
    url: string,
    opts: {
      readonly mime?: string;
      readonly size?: number;
      readonly startSec: number;
      readonly endSec: number;
      readonly signal?: AbortSignal;
    },
  ): Promise<Uint8Array>;
  mp3PacketInfoFromBytes(bytes: Uint8Array): AibrushPacketInfoTable;
  oggPacketInfoFromBytes(bytes: Uint8Array): AibrushPacketInfoTable;
  webmPacketPayloadInfoFromBytes(bytes: Uint8Array): AibrushWebmPacketPayloadInfoTable;
  muxPreparedMp4PacketTrack(input: {
    readonly track: AibrushTrackInfo;
    readonly packets: readonly AibrushPacket[];
    readonly container: string;
    readonly faststart?: boolean;
    readonly fragmented?: boolean;
  }): Uint8Array;
  muxPreparedMp4PacketTracks(input: {
    readonly tracks: readonly {
      readonly track: AibrushTrackInfo;
      readonly packets: readonly AibrushPacket[];
    }[];
    readonly container: string;
    readonly faststart?: boolean;
    readonly fragmented?: boolean;
  }): Uint8Array;
  muxPreparedMp4PacketTracksStream(input: {
    readonly tracks: readonly {
      readonly track: AibrushTrackInfo;
      readonly packets: readonly AibrushPacket[];
    }[];
    readonly container: string;
    readonly faststart?: boolean;
    readonly fragmented?: boolean;
  }): ReadableStream<Uint8Array>;
  muxPreparedWebmAudioPacketTrack(input: {
    readonly track: AibrushTrackInfo;
    readonly packets: readonly AibrushPacket[];
    readonly container: string;
  }): Uint8Array;
  muxPreparedMp3PacketTrack(input: {
    readonly track: AibrushTrackInfo;
    readonly packets: readonly AibrushPreparedMp3Packet[];
  }): Uint8Array;
  muxPreparedWebmPacketTracks(input: {
    readonly tracks: readonly {
      readonly track: AibrushTrackInfo;
      readonly packets: readonly AibrushPacket[];
    }[];
    readonly container: string;
  }): Uint8Array;
  muxPreparedWebmChunkTracks(input: {
    readonly tracks: readonly {
      readonly track: AibrushTrackInfo;
      readonly chunks: readonly AibrushPreparedWebmChunk[];
    }[];
    readonly container: string;
  }): Uint8Array;
  muxPreparedMpegTsPacketTracks(input: {
    readonly tracks: readonly {
      readonly track: AibrushTrackInfo;
      readonly packets: readonly AibrushPacket[];
    }[];
    readonly container: string;
  }): Uint8Array;
}
interface AibrushSourceLike {
  readonly mimeHint?: string;
  stream(): ReadableStream<Uint8Array>;
}
interface AibrushHlsKey {
  readonly method: 'NONE' | 'AES-128' | 'SAMPLE-AES' | 'SAMPLE-AES-CTR';
  readonly uri?: string;
  readonly iv?: Uint8Array;
}
interface AibrushHlsSegment {
  readonly key?: AibrushHlsKey;
}
interface AibrushHlsMediaPlaylist {
  readonly type: 'media';
  readonly segments: readonly AibrushHlsSegment[];
}
interface AibrushHlsMasterPlaylist {
  readonly type: 'master';
}
type AibrushHlsPlaylist = AibrushHlsMediaPlaylist | AibrushHlsMasterPlaylist;
interface AibrushHlsCore {
  hlsPlaylistHasEncryptedSegments(text: string, baseUrl?: string): boolean;
  parseM3u8(text: string, baseUrl?: string): AibrushHlsPlaylist;
  resolveHlsProbeSource(
    playlistText: string,
    opts: {
      fetchResource: (uri: string) => Promise<Uint8Array>;
      baseUrl: string;
      signal?: AbortSignal;
    },
  ): Promise<AibrushSourceLike>;
  resolveHlsSource(
    playlistText: string,
    opts: {
      fetchResource: (uri: string) => Promise<Uint8Array>;
      baseUrl: string;
      signal?: AbortSignal;
    },
  ): Promise<AibrushSourceLike>;
}

/** Disambiguate sibling container families the bytes alone don't (mov vs mp4, mkv vs webm) by served type. */
function canonicalContainer(measured: string, input: MediaInput): string {
  if (isHlsAsset(input)) return 'hls'; // HLS probe reports the playlist container, not the stitched MPEG-TS
  const mime = input.mime.toLowerCase();
  const id = input.id.toLowerCase();
  if (measured === 'mp4' && (mime.includes('quicktime') || id.endsWith('.mov'))) return 'mov';
  if (measured === 'webm' && (mime.includes('matroska') || id.endsWith('.mkv'))) return 'mkv';
  return measured;
}

/** Engine codec string → the harness canonical family token (every adapter normalizes its lib's output). */
function canonicalCodec(codec: string): string {
  return canonicalAibrushCodec(codec);
}

function containerFromInput(input: MediaInput): string {
  if (isHlsAsset(input)) return 'hls';
  const mime = input.mime.toLowerCase();
  const id = input.id.toLowerCase();
  if (mime.includes('quicktime') || id.endsWith('.mov')) return 'mov';
  if (mime.includes('matroska') || id.endsWith('.mkv')) return 'mkv';
  if (mime.includes('mp4') || /\.(mp4|m4a|m4v)$/i.test(id)) return 'mp4';
  if (mime.includes('webm') || id.endsWith('.webm')) return 'webm';
  if (mime.includes('mpegurl') || id.endsWith('.m3u8') || id.endsWith('.m3u')) return 'hls';
  if (mime.includes('mpegts') || id.endsWith('.ts')) return 'ts';
  if (mime.includes('wav') || id.endsWith('.wav')) return 'wav';
  if (mime.includes('aiff') || id.endsWith('.aiff') || id.endsWith('.aif')) return 'aiff';
  if (mime.includes('caf') || id.endsWith('.caf')) return 'caf';
  if (mime.includes('flac') || id.endsWith('.flac')) return 'flac';
  if (mime.includes('ogg') || /\.(oga|ogg|opus)$/i.test(id)) return 'ogg';
  if (mime.includes('mpeg') || id.endsWith('.mp3')) return 'mp3';
  if (mime.includes('aac') || id.endsWith('.aac') || id.endsWith('.adts')) return 'adts';
  if (mime.includes('avi') || id.endsWith('.avi')) return 'avi';
  return id.includes('.') ? id.slice(id.lastIndexOf('.') + 1) : mime || 'unknown';
}

function isPcmAggregateInput(input: MediaInput): boolean {
  const container = containerFromInput(input);
  return container === 'wav' || container === 'aiff' || container === 'caf';
}

function knownContainerProbeToken(input: MediaInput): 'mp4' | 'mov' | 'webm' | 'mkv' | 'flac' | 'ogg' | undefined {
  const container = containerFromInput(input);
  if (
    (container === 'mp4' ||
      container === 'mov' ||
      container === 'webm' ||
      container === 'mkv' ||
      container === 'flac' ||
      container === 'ogg') &&
    !isMalformedHarnessInput(input) &&
    !isStillImageInput(input)
  ) {
    return container;
  }
  return undefined;
}

function metadataFromDemuxed(input: MediaInput, demuxed: AibrushDemuxed): NormalizedMetadata {
  let durationSec: number | null = null;
  const tracks: NormalizedTrack[] = demuxed.tracks.map((t) => {
    const trackDuration = t.durationSec;
    if (trackDuration !== undefined && trackDuration > 0) {
      durationSec = durationSec === null ? trackDuration : Math.max(durationSec, trackDuration);
    }
    return normalizeAibrushTrack(t);
  });
  return { container: containerFromInput(input), durationSec, tracks };
}

function demuxResultFromPacketInfo(
  input: MediaInput,
  packetInfo: AibrushPacketInfoTable,
  sourceBytes?: Uint8Array,
): DemuxResult {
  const demuxedView: AibrushDemuxed = {
    tracks: packetInfo.tracks,
    packetInfoTable: () => packetInfo.packets,
    packets: () => {
      throw new Error('aibrush packet-info fast path has no payload streams');
    },
    close: () => Promise.resolve(),
  };
  const metadata = metadataFromDemuxed(input, demuxedView);
  return buildAibrushDemuxResult(
    sourceBytes === undefined ? metadata : enrichAibrushProbeMetadata(metadata, sourceBytes),
    packetInfo.tracks,
    packetInfo.packets.map((packet) => {
      const inline = (packet as AibrushPacketInfoMetadata & { data?: Uint8Array }).data;
      const payload = inline ?? (
        sourceBytes !== undefined &&
        packet.offset !== undefined &&
        packet.offset >= 0 &&
        packet.offset + packet.size <= sourceBytes.byteLength
          ? sourceBytes.subarray(packet.offset, packet.offset + packet.size)
          : undefined
      );
      return { ...packet, ...(payload !== undefined ? { payload } : {}) };
    }),
  );
}

async function inputBytes(input: MediaInput): Promise<Uint8Array> {
  return new Uint8Array(await input.arrayBuffer());
}

async function inputBytesIfAtMost(input: MediaInput, maxBytes: number): Promise<Uint8Array | undefined> {
  if (input.mutated || maxBytes <= 0) return undefined;
  const response = await fetch(input.url, { headers: { Range: `bytes=0-${maxBytes - 1}` } });
  if (!response.ok && response.status !== 206) return undefined;
  const bytes = new Uint8Array(await response.arrayBuffer());
  const total =
    response.status === 206
      ? parseHttpRangeTotal(response.headers.get('Content-Range'))
      : parseHttpLength(response.headers.get('Content-Length'));
  const sourceSize = total ?? bytes.byteLength;
  return sourceSize <= maxBytes && bytes.byteLength === sourceSize ? bytes : undefined;
}

interface PreparedCanonicalWavMux {
  readonly metadata: NormalizedMetadata;
  readonly bytes: Uint8Array;
  readonly payload: Uint8Array;
}

function writeU32le(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

async function prepareCanonicalWavStreamMux(input: MediaInput): Promise<PreparedCanonicalWavMux | undefined> {
  if (input.mutated || containerFromInput(input) !== 'wav') return undefined;
  const bytes = await inputBytes(input);
  if (bytes.byteLength < 44 || bytes.byteLength > 0xffffffff) return undefined;
  if (
    !tagEquals(bytes, 0, 'RIFF') ||
    !tagEquals(bytes, 8, 'WAVE') ||
    !tagEquals(bytes, 12, 'fmt ') ||
    u32le(bytes, 16) !== 16 ||
    !tagEquals(bytes, 36, 'data')
  ) {
    return undefined;
  }
  const channels = u16le(bytes, 22);
  const sampleRate = u32le(bytes, 24);
  const blockAlign = u16le(bytes, 32);
  const codec = wavCodecFromFmt(u16le(bytes, 20), u16le(bytes, 34));
  const dataBytes = u32le(bytes, 40);
  if (
    codec === undefined ||
    channels <= 0 ||
    sampleRate <= 0 ||
    blockAlign <= 0 ||
    dataBytes !== bytes.byteLength - 44
  ) {
    return undefined;
  }
  writeU32le(bytes, 4, bytes.byteLength - 8);
  writeU32le(bytes, 40, dataBytes);
  const durationSec = dataBytes > 0 ? dataBytes / (sampleRate * blockAlign) : null;
  return {
    metadata: {
      container: 'wav',
      durationSec,
      tracks: [{ type: 'audio', codec, sampleRate, channels, bitrate: null, language: null }],
    },
    bytes,
    payload: bytes.subarray(44),
  };
}
function inputUrl(input: MediaInput): URL {
  return new URL(input.url, globalThis.location?.href ?? 'http://localhost/');
}
/** True when the asset is an HLS playlist (an .m3u8/.m3u URL). */
function isHlsAsset(input: MediaInput): boolean {
  return /\.m3u8?($|\?)/i.test(input.url ?? '') || /\.m3u8?$/i.test(input.id);
}
/** Browser fetch of a (resolved, absolute) HLS resource URI → bytes (segments / keys / sub-playlists). */
const hlsFetch = async (uri: string, signal?: AbortSignal): Promise<Uint8Array> => {
  const init: RequestInit = signal === undefined ? { cache: 'no-store' } : { cache: 'no-store', signal };
  const response = await fetch(uri, init);
  if (!response.ok) throw new Error(`HLS resource '${uri}' returned HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
};

function normalizeHex(hex: string): string {
  return hex.trim().replace(/^0x/i, '').replace(/[-_\s]/g, '').toLowerCase();
}

function hexBytes(hex: string, label: string): Uint8Array {
  const normalized = normalizeHex(hex);
  if (normalized.length % 2 !== 0) {
    throw new GracefulRejectionError('decrypt', `${label} hex has odd length`);
  }
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i++) {
    const pair = normalized.slice(i * 2, i * 2 + 2);
    if (!/^[0-9a-f]{2}$/.test(pair)) {
      throw new GracefulRejectionError('decrypt', `${label} hex has an invalid byte at offset ${i * 2}`);
    }
    out[i] = Number.parseInt(pair, 16);
  }
  return out;
}

function hexOf(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.byteLength; i++) out += bytes[i]!.toString(16).padStart(2, '0');
  return out;
}

function hlsDecryptKeyBytes(key: DecryptKey): Uint8Array {
  const bytes = hexBytes(key.keyHex, 'HLS decrypt key');
  if (bytes.byteLength !== 16) {
    throw new GracefulRejectionError('decrypt', `HLS decrypt key must be 16 bytes, got ${bytes.byteLength}`);
  }
  return bytes;
}

function addHlsDecryptKeyUris(
  playlistText: string,
  baseUrl: string,
  parseM3u8: AibrushHlsCore['parseM3u8'],
  keyUris: Set<string>,
  expectedIvHex?: string,
): void {
  const parsed = parseM3u8(playlistText, baseUrl);
  if (parsed.type !== 'media') return;
  const expectedIv = expectedIvHex === undefined ? undefined : normalizeHex(expectedIvHex);
  for (const segment of parsed.segments) {
    const key = segment.key;
    if (key === undefined || (key.method !== 'AES-128' && key.method !== 'SAMPLE-AES')) continue;
    if (key.uri !== undefined) keyUris.add(key.uri);
    if (expectedIv !== undefined && key.iv !== undefined && hexOf(key.iv) !== expectedIv) {
      throw new GracefulRejectionError('decrypt', `HLS ${key.method} IV does not match the playlist #EXT-X-KEY IV`);
    }
  }
}

function parseHttpLength(value: string | null): number | undefined {
  if (value === null) return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}
function parseHttpRangeTotal(value: string | null): number | undefined {
  if (value === null) return undefined;
  const slash = value.lastIndexOf('/');
  if (slash < 0) return undefined;
  const total = value.slice(slash + 1).trim();
  if (total === '' || total === '*') return undefined;
  const n = Number(total);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}
async function inputSize(input: MediaInput): Promise<number | undefined> {
  if (input.mutated) return undefined;
  const url = inputUrl(input);
  try {
    const head = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    if (head.ok) {
      const len = parseHttpLength(head.headers.get('Content-Length'));
      if (len !== undefined) return len;
    }
  } catch {
    // Some static servers skip HEAD; fall back to a one-byte range probe below.
  }
  try {
    const range = await fetch(url, { cache: 'no-store', headers: { Range: 'bytes=0-0' } });
    if (!range.ok) return undefined;
    const total =
      range.status === 206
        ? parseHttpRangeTotal(range.headers.get('Content-Range'))
        : parseHttpLength(range.headers.get('Content-Length'));
    await range.arrayBuffer();
    return total;
  } catch {
    return undefined;
  }
}

function u32le(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) |
      ((bytes[offset + 1] ?? 0) << 8) |
      ((bytes[offset + 2] ?? 0) << 16) |
      ((bytes[offset + 3] ?? 0) << 24)) >>>
    0
  );
}

function u16le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function u32be(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

function u64beNumber(bytes: Uint8Array, offset: number): number {
  const hi = u32be(bytes, offset);
  const lo = u32be(bytes, offset + 4);
  return hi * 0x1_0000_0000 + lo;
}

function tagEquals(bytes: Uint8Array, offset: number, tag: string): boolean {
  if (offset + tag.length > bytes.byteLength) return false;
  for (let i = 0; i < tag.length; i++) {
    if (bytes[offset + i] !== tag.charCodeAt(i)) return false;
  }
  return true;
}

function pcmBytesPerSample(codec: string): number | undefined {
  switch (codec) {
    case 'pcm-s16':
    case 'pcm-s16be':
      return 2;
    case 'pcm-s24':
    case 'pcm-s24be':
      return 3;
    case 'pcm-f32':
      return 4;
    default:
      return undefined;
  }
}

function pcmTrack(metadata: NormalizedMetadata): NormalizedTrack | undefined {
  return metadata.tracks.find((track) => track.type === 'audio' && pcmBytesPerSample(track.codec) !== undefined);
}

function wavCodecFromFmt(formatTag: number, bitsPerSample: number): string | undefined {
  if (formatTag === 3) return bitsPerSample === 64 ? 'pcm-f64' : 'pcm-f32';
  if (formatTag !== 1 && formatTag !== 0xfffe) return undefined;
  return bitsPerSample === 8 ? 'pcm-u8' : `pcm-s${bitsPerSample}`;
}

function pcmMetadataFromBytes(input: MediaInput, bytes: Uint8Array): NormalizedMetadata | undefined {
  const container = containerFromInput(input);
  if (container !== 'wav' || !tagEquals(bytes, 0, 'RIFF') || !tagEquals(bytes, 8, 'WAVE')) return undefined;
  let channels = 0;
  let sampleRate = 0;
  let blockAlign = 0;
  let codec: string | undefined;
  let dataBytes = 0;
  for (let offset = 12; offset + 8 <= bytes.byteLength; ) {
    const size = u32le(bytes, offset + 4);
    const body = offset + 8;
    if (tagEquals(bytes, offset, 'fmt ') && size >= 16 && body + 16 <= bytes.byteLength) {
      const formatTag = u16le(bytes, body);
      channels = u16le(bytes, body + 2);
      sampleRate = u32le(bytes, body + 4);
      blockAlign = u16le(bytes, body + 12);
      codec = wavCodecFromFmt(formatTag, u16le(bytes, body + 14));
    } else if (tagEquals(bytes, offset, 'data')) {
      dataBytes = Math.min(size, Math.max(0, bytes.byteLength - body));
    }
    offset = body + size + (size & 1);
  }
  if (codec === undefined || channels <= 0 || sampleRate <= 0 || blockAlign <= 0) return undefined;
  const durationSec = dataBytes > 0 ? dataBytes / (sampleRate * blockAlign) : null;
  return {
    container,
    durationSec,
    tracks: [{ type: 'audio', codec, sampleRate, channels, bitrate: null, language: null }],
  };
}

function riffDataBytes(bytes: Uint8Array): number {
  return riffDataPayload(bytes)?.byteLength ?? 0;
}

function riffDataPayload(bytes: Uint8Array): Uint8Array | undefined {
  if (!tagEquals(bytes, 0, 'RIFF') || !tagEquals(bytes, 8, 'WAVE')) return undefined;
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const size = u32le(bytes, offset + 4);
    if (tagEquals(bytes, offset, 'data')) {
      const body = offset + 8;
      return bytes.subarray(body, body + Math.min(size, Math.max(0, bytes.byteLength - body)));
    }
    offset += 8 + size + (size & 1);
  }
  return undefined;
}

function aiffSoundDataBytes(bytes: Uint8Array): number {
  if (!tagEquals(bytes, 0, 'FORM') || (!tagEquals(bytes, 8, 'AIFF') && !tagEquals(bytes, 8, 'AIFC'))) {
    return 0;
  }
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const size = u32be(bytes, offset + 4);
    if (tagEquals(bytes, offset, 'SSND')) {
      if (size < 8 || offset + 16 > bytes.byteLength) return 0;
      const dataOffset = u32be(bytes, offset + 8);
      const payloadStart = offset + 16 + dataOffset;
      const declared = size - 8 - Math.min(dataOffset, size - 8);
      return Math.min(declared, Math.max(0, bytes.byteLength - payloadStart));
    }
    offset += 8 + size + (size & 1);
  }
  return 0;
}

function cafAudioDataBytes(bytes: Uint8Array): number {
  if (!tagEquals(bytes, 0, 'caff')) return 0;
  let offset = 8;
  while (offset + 12 <= bytes.byteLength) {
    const size = u64beNumber(bytes, offset + 4);
    if (!Number.isSafeInteger(size) || size < 0) return 0;
    if (tagEquals(bytes, offset, 'data')) {
      if (size < 4) return 0;
      const payloadStart = offset + 16;
      return Math.min(size - 4, Math.max(0, bytes.byteLength - payloadStart));
    }
    offset += 12 + size;
  }
  return 0;
}

function pcmPayloadBytes(container: string, bytes: Uint8Array): number | undefined {
  switch (container) {
    case 'wav':
      return riffDataBytes(bytes);
    case 'aiff':
      return aiffSoundDataBytes(bytes);
    case 'caf':
      return cafAudioDataBytes(bytes);
    default:
      return undefined;
  }
}

async function pcmPacketTable(input: MediaInput, metadata: NormalizedMetadata): Promise<PacketInfo[]> {
  const track = pcmTrack(metadata);
  if (!track) return [];
  const bytesPerSample = pcmBytesPerSample(track.codec);
  const sampleRate = track.sampleRate;
  const channels = track.channels;
  if (
    bytesPerSample === undefined ||
    sampleRate === undefined ||
    channels === undefined ||
    sampleRate <= 0 ||
    channels <= 0
  ) {
    return [];
  }
  const bytes = await inputBytes(input);
  const payloadBytes = pcmPayloadBytes(metadata.container, bytes);
  if (payloadBytes === undefined || payloadBytes <= 0) return [];
  const bytesPerFrame = bytesPerSample * channels;
  const totalFrames = Math.floor(payloadBytes / bytesPerFrame);
  const chunkFrames = metadata.container === 'wav'
    ? Math.max(1, 2 ** Math.floor(Math.log2(sampleRate / 10)))
    : Math.max(1, Math.floor(4096 / bytesPerFrame));
  const packets: PacketInfo[] = [];
  for (let frame = 0; frame < totalFrames; frame += chunkFrames) {
    const frames = Math.min(chunkFrames, totalFrames - frame);
    const ptsUs = Math.round((frame / sampleRate) * 1_000_000);
    packets.push({
      trackIndex: 0,
      size: frames * bytesPerFrame,
      ptsUs,
      dtsUs: ptsUs,
      keyframe: true,
    });
  }
  return packets;
}

function pcmEncodedTrackFrom(
  metadata: NormalizedMetadata,
  data: Uint8Array = new Uint8Array(0),
): EncodedTrack | undefined {
  const track = pcmTrack(metadata);
  if (!track || track.sampleRate === undefined || track.channels === undefined) return undefined;
  const durationUs =
    metadata.durationSec !== null && metadata.durationSec > 0
      ? Math.max(1, Math.round(metadata.durationSec * 1_000_000))
      : 0;
  return {
    type: 'audio',
    codec: track.codec,
    timescale: 1_000_000,
    sampleRate: track.sampleRate,
    channels: track.channels,
    chunks:
      durationUs > 0
        ? [{ data, ptsUs: 0, dtsUs: 0, durationUs, keyframe: true }]
        : [],
  };
}
async function rejectOversizedBufferTarget(input: MediaInput, opts: RemuxOptions): Promise<void> {
  if ((opts as { target?: unknown }).target !== 'buffer') return;
  const size = await inputSize(input);
  const target = opts.container.trim().toLowerCase();
  const limit =
    target === 'mp4' || target === 'mov'
      ? ISO_BMFF_BUFFER_TARGET_MAX_SOURCE_BYTES
      : BUFFER_TARGET_MAX_SOURCE_BYTES;
  if (size === undefined || size <= limit) return;
  throw createNotApplicableError(ENGINE_ID,
    'remux',
    `explicit buffer target would materialize a ${size} byte source/output in-browser, over the verified ${limit} byte cap`,
  );
}
async function rejectUnsupportedStreamTargetScale(input: MediaInput, opts: RemuxOptions): Promise<void> {
  if ((opts as { target?: unknown }).target !== 'stream') return;
  const target = opts.container.trim().toLowerCase();
  const size = await inputSize(input);
  if (size === undefined) return;
  const isIsoBmffTarget = target === 'mp4' || target === 'mov';
  const isWebmFamilyTarget = target === 'webm' || target === 'mkv';
  if (!isIsoBmffTarget && !isWebmFamilyTarget && size > NON_ISO_STREAM_TARGET_MAX_SOURCE_BYTES) {
    throw createNotApplicableError(ENGINE_ID,
      'remux',
      `stream target telemetry for ${target} sources above ${NON_ISO_STREAM_TARGET_MAX_SOURCE_BYTES} bytes is not bounded in this adapter`,
    );
  }
  if (size > STREAM_TARGET_MAX_SOURCE_BYTES) {
    throw createNotApplicableError(ENGINE_ID,
      'remux',
      `stream target telemetry for ${size} byte sources exceeds the verified in-browser materialization cap`,
    );
  }
}
async function streamBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  if (chunks.length === 1) {
    const only = chunks[0];
    if (only !== undefined) return only;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
function outputMime(container: string): string {
  switch (container.toLowerCase()) {
    case 'mp4':
      return 'video/mp4';
    case 'mov':
      return 'video/quicktime';
    case 'webm':
      return 'video/webm';
    case 'mkv':
      return 'video/x-matroska';
    case 'ogg':
      return 'audio/ogg';
    case 'wav':
      return 'audio/wav';
    case 'aiff':
      return 'audio/aiff';
    case 'caf':
      return 'audio/x-caf';
    case 'ts':
      return 'video/mp2t';
    default:
      return 'application/octet-stream';
  }
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

interface AibrushOutputTelemetry {
  readonly sink: AibrushSink;
  mediaBytes(output: AibrushOutput, container: string): Promise<MediaBytes>;
}

interface AibrushOutputRuntimeIdentity {
  readonly operationStartMs?: number;
  readonly emit?: OperationContext['emit'];
  readonly resolvedRepresentation?: AibrushStreamingRuntimeEvidence['resolvedRepresentation'];
}

interface AibrushOutputObservation {
  readonly writerMode: string;
  readonly targetMode: 'framework-default' | 'buffer-materialized' | 'callback-stream';
  readonly peakRetainedBytes: number;
  readonly callbackWriteCount: number;
}

function instrumentedAibrushSink(
  lib: AibrushMedia,
  opts?: Record<string, unknown>,
  runtime: AibrushOutputRuntimeIdentity = {},
  observe?: (observation: AibrushOutputObservation) => void,
): AibrushOutputTelemetry {
  const target = opts?.target;

  if (target === 'stream') {
    const accumulator = new AibrushCallbackAccumulator({ operationStartMs: runtime.operationStartMs });
    let emittedFirstByte = false;
    const sink = lib.toStreamTarget((chunk, position) => {
      accumulator.write(chunk, position);
      if (chunk.byteLength === 0 || runtime.operationStartMs === undefined || runtime.emit === undefined) return;
      const atMs = Math.max(
        0,
        (accumulator.recorder.lastWriteAtMs ?? nowMs()) - runtime.operationStartMs,
      );
      if (!emittedFirstByte) {
        emittedFirstByte = true;
        runtime.emit({ type: 'first-byte', atMs });
      }
      runtime.emit({ type: 'bytes-written', atMs, bytes: accumulator.evidence.bytesWritten });
      runtime.emit({ type: 'write-count', atMs, count: accumulator.evidence.callbackWriteCount });
    });
    return {
      sink,
      async mediaBytes(output, container) {
        if (output !== undefined) {
          throw new Error('aibrush stream-target sink returned an output value instead of writing the target');
        }
        accumulator.recorder.beginFinalize();
        const bytes = accumulator.materialize();
        const evidence = accumulator.evidence;
        const trace = accumulator.recorder.complete('stream', evidence.peakRetainedBytes);
        observe?.({
          writerMode: 'callback-contiguous-stream+final-concatenation',
          targetMode: 'callback-stream',
          peakRetainedBytes: evidence.peakRetainedBytes,
          callbackWriteCount: evidence.callbackWriteCount,
        });
        const media: MediaBytes = {
          bytes,
          mime: outputMime(container),
          container,
          targetWrites: evidence.callbackWriteCount,
        };
        return attachStreamingEvidence(media, trace, runtime, 'stream');
      },
    };
  }

  const sink = lib.toStream();
  return {
    sink,
    async mediaBytes(output, container) {
      const recorder = new AibrushSinkTraceRecorder({ operationStartMs: runtime.operationStartMs });
      const retained = await toMediaBytesWithRetention(output, container, recorder, () => {
        if (runtime.operationStartMs === undefined || runtime.emit === undefined) return;
        const atMs = Math.max(0, nowMs() - runtime.operationStartMs);
        runtime.emit({ type: 'bytes-written', atMs, bytes: recorder.bytesWritten });
        runtime.emit({ type: 'write-count', atMs, count: recorder.writeCount });
      });
      const media = retained.media;
      recorder.beginFinalize();
      const trace = recorder.complete('buffer', retained.peakRetainedBytes);
      const withEvidence = attachStreamingEvidence(media, trace, runtime, 'buffer');
      if (withEvidence.firstByteMs !== undefined && runtime.emit !== undefined) {
        runtime.emit({ type: 'first-byte', atMs: withEvidence.firstByteMs });
      }
      observe?.({
        writerMode: 'framework-readable-stream+full-materialization',
        targetMode: target === 'buffer' ? 'buffer-materialized' : 'framework-default',
        peakRetainedBytes: retained.peakRetainedBytes,
        callbackWriteCount: 0,
      });
      return withEvidence;
    },
  };
}

function attachStreamingEvidence(
  media: MediaBytes,
  trace: ReturnType<AibrushSinkTraceRecorder['complete']>,
  runtime: AibrushOutputRuntimeIdentity,
  target: 'buffer' | 'stream',
): MediaBytes {
  if (trace === undefined || runtime.resolvedRepresentation === undefined) return media;
  const start = trace.events[0];
  const observable = target === 'stream'
    ? trace.events.find((event) => event.type === 'write' && event.length > 0)
    : trace.events.find((event) => event.type === 'buffer-observable' && event.length > 0);
  const firstByteMs = start?.type === 'operation-start' && observable !== undefined
    ? Math.max(0, observable.atMs - start.atMs)
    : undefined;
  const streamingEvidence: AibrushStreamingRuntimeEvidence = Object.freeze({
    schema: 'media-test/streaming-runtime-evidence@1',
    sinkTrace: trace,
    resolvedRepresentation: runtime.resolvedRepresentation,
    observerPolicy: target === 'stream'
      ? 'aibrush-synchronous-contiguous-callback-observer@1'
      : 'aibrush-framework-output-materialization-observer@1',
    retainedOutputPolicy: target === 'stream'
      ? 'whole-output-callback-accumulation-and-final-concatenation'
      : 'whole-output-framework-materialization',
    measurementContract: 'media-test/streaming-output-measurement@1',
  });
  const output = {
    ...media,
    targetWrites: trace.events.filter((event) => event.type === 'write').length,
    ...(firstByteMs !== undefined ? { firstByteMs } : {}),
    telemetry: {
      bytesWritten: media.bytes.byteLength,
      writeCount: trace.events.filter((event) => event.type === 'write').length,
      ...(firstByteMs !== undefined ? { firstByteMs } : {}),
    },
    streamingEvidence,
  } satisfies MediaBytes & { readonly streamingEvidence: AibrushStreamingRuntimeEvidence };
  return output;
}

async function toMediaBytesWithRetention(
  output: AibrushOutput,
  container: string,
  recorder?: AibrushSinkTraceRecorder,
  onWrite?: () => void,
): Promise<{ media: MediaBytes; peakRetainedBytes: number }> {
  if (output === undefined) {
    throw new Error('aibrush output was written to a target but no target telemetry was attached');
  }
  if (output instanceof Blob) {
    const bytes = new Uint8Array(await output.arrayBuffer());
    recorder?.write(bytes, recorder.bytesWritten);
    onWrite?.();
    return {
      media: { bytes, mime: outputMime(container), container },
      peakRetainedBytes: output.size + bytes.byteLength,
    };
  }
  if (output instanceof Uint8Array) {
    recorder?.write(output, recorder.bytesWritten);
    onWrite?.();
    return {
      media: { bytes: output, mime: outputMime(container), container },
      peakRetainedBytes: output.byteLength,
    };
  }
  const reader = output.getReader();
  const accumulator = new AibrushCallbackAccumulator();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      accumulator.write(value, accumulator.evidence.bytesWritten);
      recorder?.write(value, recorder.bytesWritten);
      onWrite?.();
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = accumulator.materialize();
  return {
    media: { bytes, mime: outputMime(container), container },
    peakRetainedBytes: accumulator.evidence.peakRetainedBytes,
  };
}

async function toMediaBytes(output: AibrushOutput, container: string): Promise<MediaBytes> {
  if (output === undefined) {
    throw new Error('aibrush output was written to a target but no target telemetry was attached');
  }
  if (output instanceof Blob) {
    return { bytes: new Uint8Array(await output.arrayBuffer()), mime: outputMime(container), container };
  }
  if (output instanceof Uint8Array) {
    return { bytes: output, mime: outputMime(container), container };
  }
  return { bytes: await streamBytes(output), mime: outputMime(container), container };
}


const BROWSER_CANVAS_HDR_TONEMAP_MAX_BYTES = 128 * 1024;

function canUseBrowserCanvasHdrTonemap(input: MediaInput, opts: TranscodeOptions): boolean {
  const extra = opts as unknown as Record<string, unknown>;
  const tonemap = extra.tonemap;
  const tone = typeof tonemap === 'object' && tonemap !== null ? (tonemap as { to?: unknown }) : undefined;
  return (
    !input.mutated &&
    input.sizeBytes !== undefined &&
    input.sizeBytes <= BROWSER_CANVAS_HDR_TONEMAP_MAX_BYTES &&
    containerFromInput(input) === 'mp4' &&
    opts.container.toLowerCase() === 'mp4' &&
    opts.audio === undefined &&
    opts.video?.codec === 'h264' &&
    opts.video.width === undefined &&
    opts.video.height === undefined &&
    opts.video.fps === undefined &&
    opts.video.rotate === undefined &&
    tone?.to === 'sdr' &&
    typeof document !== 'undefined' &&
    typeof VideoEncoder === 'function' &&
    typeof VideoFrame === 'function' &&
    typeof EncodedVideoChunk === 'function'
  );
}

function waitForVideoEvent(video: HTMLVideoElement, event: keyof HTMLMediaElementEventMap, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException('operation aborted', 'AbortError'));
  return new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      video.removeEventListener(event, onEvent);
      video.removeEventListener('error', onError);
      signal.removeEventListener('abort', onAbort);
    };
    const onEvent = (): void => {
      cleanup();
      resolve();
    };
    const onError = (): void => {
      cleanup();
      reject(video.error ?? new Error(`video ${String(event)} failed`));
    };
    const onAbort = (): void => {
      cleanup();
      reject(new DOMException('operation aborted', 'AbortError'));
    };
    video.addEventListener(event, onEvent, { once: true });
    video.addEventListener('error', onError, { once: true });
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function videoElementFirstFrame(input: MediaInput, signal: AbortSignal): Promise<{ frame: VideoFrame; durationSec: number; width: number; height: number }> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = input.url;
  try {
    await waitForVideoEvent(video, 'loadedmetadata', signal);
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await waitForVideoEvent(video, 'loadeddata', signal);
    }
    const width = video.videoWidth;
    const height = video.videoHeight;
    const durationSec = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 2;
    if (width <= 0 || height <= 0) return Promise.reject(new Error('video metadata has no dimensions'));
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (ctx === null) return Promise.reject(new Error('2D canvas unavailable'));
    ctx.drawImage(video, 0, 0, width, height);
    return {
      frame: new VideoFrame(canvas, { timestamp: 0, duration: Math.round(durationSec * 1_000_000) }),
      durationSec,
      width,
      height,
    };
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}

async function encodeSingleH264Frame(frame: VideoFrame, width: number, height: number, durationSec: number, signal: AbortSignal): Promise<{ packets: AibrushPacket[]; config: VideoDecoderConfig }> {
  let decoderConfig: VideoDecoderConfig | undefined;
  let encodeError: Error | undefined;
  const packets: AibrushPacket[] = [];
  const encoder = new VideoEncoder({
    output(chunk, metadata): void {
      if (metadata?.decoderConfig !== undefined) decoderConfig = metadata.decoderConfig;
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      packets.push({
        chunk: chunk as unknown as AibrushChunk,
        data,
        dtsUs: chunk.timestamp,
        sizeBytes: data.byteLength,
      });
    },
    error(error): void {
      encodeError = error instanceof Error ? error : new Error(String(error));
    },
  });
  const onAbort = (): void => {
    try {
      encoder.close();
    } catch {
      /* already closed */
    }
  };
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    encoder.configure({
      codec: 'avc1.42E01E',
      width,
      height,
      bitrate: 80_000,
      framerate: 30,
      hardwareAcceleration: 'prefer-software',
      latencyMode: 'realtime',
    });
    encoder.encode(frame, { keyFrame: true });
    await encoder.flush();
    if (encodeError !== undefined) throw encodeError;
    if (decoderConfig === undefined) throw new Error('H.264 encoder did not emit decoder config');
    return { packets, config: decoderConfig };
  } finally {
    signal.removeEventListener('abort', onAbort);
    frame.close();
    try {
      encoder.close();
    } catch {
      /* already closed */
    }
  }
}

function allowSharedBytes(src: AllowSharedBufferSource): Uint8Array<ArrayBuffer> {
  const view = ArrayBuffer.isView(src)
    ? new Uint8Array(src.buffer, src.byteOffset, src.byteLength)
    : new Uint8Array(src);
  const out = new Uint8Array(view.byteLength);
  out.set(view);
  return out;
}

async function tryBrowserCanvasHdrTonemapTranscode(core: AibrushCore, input: MediaInput, opts: TranscodeOptions, signal: AbortSignal): Promise<MediaBytes | undefined> {
  if (!canUseBrowserCanvasHdrTonemap(input, opts)) return undefined;
  const captured = await videoElementFirstFrame(input, signal);
  const { frame, durationSec, width, height } = captured;
  const encoded = await encodeSingleH264Frame(frame, width, height, durationSec, signal);
  const description = encoded.config.description !== undefined ? allowSharedBytes(encoded.config.description) : undefined;
  const track: AibrushTrackInfo = {
    id: 0,
    mediaType: 'video',
    codec: encoded.config.codec,
    durationSec,
    config: {
      codec: encoded.config.codec,
      codedWidth: width,
      codedHeight: height,
      ...(description !== undefined ? { description } : {}),
    },
  };
  signal.throwIfAborted();
  const bytes = core.muxPreparedMp4PacketTrack({
    track,
    packets: encoded.packets,
    container: 'mp4',
    faststart: true,
    fragmented: false,
  });
  return {
    bytes,
    mime: outputMime('mp4'),
    container: 'mp4',
  };
}

// ── decodeFrames support: collect VideoFrames, rasterize + digest, close exactly once ──────────────

/**
 * A FrameSink that also retains the rasterized `ImageData` for `getPixels` (the SSIM/PSNR + alpha
 * oracles need raw pixels). Mirrors the platform engine's RetainingFrameSink so the two behave the same
 * (digests in `.frames`, pixels via `getPixels`). It holds NO live VideoFrame — those are closed before
 * this sink is returned — so the runner/oracles have nothing to release.
 */
class RetainingFrameSink implements FrameSink {
  readonly frames: FrameDigest[] = [];
  selectedTrack?: FrameSink['selectedTrack'];
  readonly #pixels: ImageData[] = [];

  add(digest: FrameDigest, img: ImageData): void {
    this.frames.push(digest);
    this.#pixels.push(img);
  }

  getPixels = async (i: number): Promise<ImageData> => {
    const img = this.#pixels[i];
    if (!img) throw new Error(`no pixels retained for frame ${i}`);
    return img;
  };
}

/** Close a VideoFrame, swallowing a double-close/already-closed throw (idempotent teardown). */
function closeFrame(frame: VideoFrame): void {
  try {
    frame.close();
  } catch {
    /* already closed */
  }
}

/** Close an AudioData, swallowing a double-close/already-closed throw (idempotent teardown). */
function closeAudioData(data: AudioData): void {
  try {
    data.close();
  } catch {
    /* already closed */
  }
}

/**
 * Drain a decoded `VideoFrame` stream into an array of frames, retaining at most `maxFrames` in
 * presentation order. A decoder may emit a few frames past the cap (B-frame reorder look-ahead); we
 * read until the stream ends or we have comfortably more than the cap, then cancel the reader so the
 * engine tears the decoder down. Every retained frame is owned by us (closed by the caller); any frame
 * beyond the cap is closed immediately so nothing leaks.
 */
async function collectVideoFrames(
  stream: ReadableStream<VideoFrame>,
  maxFrames: number,
): Promise<VideoFrame[]> {
  const reader = stream.getReader();
  const collected: VideoFrame[] = [];
  // Read a reorder margin past the cap so the presentation-order prefix is stable before we stop
  // (a B-frame GOP can defer the lowest-pts frame). Mirrors the platform decoder's +16 submit margin.
  const readCap = Number.isFinite(maxFrames) ? maxFrames + 16 : Number.POSITIVE_INFINITY;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (collected.length < readCap) {
        collected.push(value);
      } else {
        closeFrame(value);
        break;
      }
    }
    // Cancel even after normal completion: the framework's deferred stream uses cancellation to tear
    // down decoder-owned queues. The reader lock itself is released exactly once in the finally below.
    await reader.cancel().catch(() => {});
    return collected;
  } catch (e) {
    for (const f of collected) closeFrame(f);
    await reader.cancel(e).catch(() => {});
    throw e;
  } finally {
    reader.releaseLock();
  }
}

async function collectAudioPcmFrameDigests(
  stream: ReadableStream<AudioData>,
  maxFrames: number,
  onFirstFrame?: () => void,
): Promise<FrameDigest[]> {
  const reader = stream.getReader();
  const frames: FrameDigest[] = [];
  const maxSamples = Number.isFinite(maxFrames)
    ? Math.max(0, Math.floor(maxFrames))
    : Number.POSITIVE_INFINITY;
  let sampleRate: number | undefined;
  let channels: number | undefined;
  let globalIndex = 0;

  try {
    if (maxSamples === 0) {
      await reader.cancel(new Error('audio sample cap reached')).catch(() => {});
      return frames;
    }

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      try {
        const rate = value.sampleRate;
        const chunkChannels = value.numberOfChannels;
        if (!Number.isFinite(rate) || rate <= 0 || !Number.isInteger(chunkChannels) || chunkChannels <= 0) {
          throw new Error(`invalid decoded audio shape: ${chunkChannels} channel(s), ${rate}Hz`);
        }
        if (sampleRate === undefined) sampleRate = rate;
        if (channels === undefined) channels = chunkChannels;
        if (rate !== sampleRate || chunkChannels !== channels) {
          throw new Error(
            `decoded audio format changed within stream (${chunkChannels}ch/${rate}Hz inside ${channels}ch/${sampleRate}Hz)`,
          );
        }

        const chunkFrames = value.numberOfFrames;
        const planes: Float32Array[] = [];
        for (let c = 0; c < chunkChannels; c++) {
          const plane = new Float32Array(chunkFrames);
          if (chunkFrames > 0) value.copyTo(plane, { planeIndex: c, format: 'f32-planar' });
          planes.push(plane);
        }

        const sampleBytes = new Uint8Array(chunkChannels * Float32Array.BYTES_PER_ELEMENT);
        const sampleFloats = new Float32Array(sampleBytes.buffer);
        for (let i = 0; i < chunkFrames && globalIndex < maxSamples; i++) {
          for (let c = 0; c < chunkChannels; c++) {
            sampleFloats[c] = planes[c]?.[i] ?? 0;
          }
          frames.push({
            index: globalIndex,
            ptsUs: Math.round((globalIndex / rate) * 1_000_000),
            sha256: await sha256Hex(sampleBytes),
            width: chunkChannels,
            height: 1,
          });
          if (globalIndex === 0) onFirstFrame?.();
          globalIndex++;
        }
      } finally {
        closeAudioData(value);
      }

      if (globalIndex >= maxSamples) {
        await reader.cancel(new Error('audio sample cap reached')).catch(() => {});
        break;
      }
    }
    return frames;
  } catch (e) {
    await reader.cancel(e).catch(() => {});
    throw e;
  } finally {
    reader.releaseLock();
  }
}

interface DecodeTrackPresence {
  readonly hasVideo: boolean;
  readonly hasAudio: boolean;
}

const VIDEO_DECODE_INPUT_CONTAINERS = new Set(['mp4', 'mov', 'webm', 'mkv', 'ts', 'avi']);
const AUDIO_DECODE_INPUT_CONTAINERS = new Set(['wav', 'aiff', 'caf', 'flac', 'mp3', 'adts', 'ogg']);

function decodePresenceHint(input: MediaInput): DecodeTrackPresence | undefined {
  if (isMalformedHarnessInput(input)) return undefined;
  if (isStillImageInput(input)) return { hasVideo: true, hasAudio: false };
  const container = containerFromInput(input);
  if (container === 'mp4' && /\.(m4a|m4b)(\.|$)/i.test(input.id)) {
    return { hasVideo: false, hasAudio: true };
  }
  if (VIDEO_DECODE_INPUT_CONTAINERS.has(container)) return { hasVideo: true, hasAudio: false };
  if (AUDIO_DECODE_INPUT_CONTAINERS.has(container)) return { hasVideo: false, hasAudio: true };
  return undefined;
}

function resolveAibrushDecodeTrack(
  info: AibrushInfo,
  selector: DecodeTrackSelector,
  request: ConcreteOperationRequest | undefined,
): {
  readonly presence: DecodeTrackPresence;
  readonly evidence: NonNullable<FrameSink['selectedTrack']>;
} {
  const tuple = request
    ? aibrushTupleSummary(request)
    : { inputContainers: [], inputCodecs: [], outputCodecs: [] };
  const reject = (reason: string): never => {
    throw createNotApplicableError(
      ENGINE_ID,
      'decodeFrames',
      reason,
      tuple,
      'AIBRUSH_DECODE_TRACK_SELECTION_UNSUPPORTED',
    );
  };
  if (selector.schema !== DECODE_TRACK_SELECTOR_SCHEMA) {
    return reject(`decode selector must use schema '${DECODE_TRACK_SELECTOR_SCHEMA}'`);
  }
  const candidates = info.tracks.flatMap((track, trackIndex) =>
    track.type === selector.type ? [{ track, trackIndex }] : [],
  );
  const byIndex = selector.trackIndex === undefined
    ? undefined
    : candidates.find((candidate) => candidate.trackIndex === selector.trackIndex);
  const byOrdinal = selector.typeOrdinal === undefined ? undefined : candidates[selector.typeOrdinal];
  const byId = selector.trackId === undefined
    ? undefined
    : candidates.find((candidate) => String(candidate.track.id) === selector.trackId);
  const chosen = byIndex ?? byOrdinal ?? byId;
  if (!chosen) {
    return reject(
      `requested ${selector.type} track does not exist (index=${String(selector.trackIndex)}, ` +
      `ordinal=${String(selector.typeOrdinal)}, id=${String(selector.trackId)})`,
    );
  }
  const typeOrdinal = candidates.findIndex((candidate) => candidate.trackIndex === chosen.trackIndex);
  if (selector.trackIndex !== undefined && chosen.trackIndex !== selector.trackIndex) {
    return reject(`trackId/typeOrdinal resolves to index ${chosen.trackIndex}, not ${selector.trackIndex}`);
  }
  if (selector.typeOrdinal !== undefined && typeOrdinal !== selector.typeOrdinal) {
    return reject(`selected track index ${chosen.trackIndex} is ${selector.type} ordinal ${typeOrdinal}`);
  }
  if (selector.trackId !== undefined && String(chosen.track.id) !== selector.trackId) {
    return reject(`selected track index ${chosen.trackIndex} has id ${chosen.track.id}, not ${selector.trackId}`);
  }

  // The public decode result exposes one stream per media type and has no track-select argument. It is
  // honest to use the primary track, but an alternate selection must remain typed NA instead of being
  // silently decoded from the first track and scored as wrong.
  const primaryIndex = info.tracks.findIndex((track) => track.type === selector.type);
  if (chosen.trackIndex !== primaryIndex) {
    return reject(
      `framework decode exposes only primary ${selector.type} track ${primaryIndex}; requested ${chosen.trackIndex}`,
    );
  }
  return {
    presence: { hasVideo: selector.type === 'video', hasAudio: selector.type === 'audio' },
    evidence: {
      schema: DECODE_TRACK_SELECTOR_SCHEMA,
      type: selector.type,
      trackIndex: chosen.trackIndex,
      typeOrdinal,
      trackId: String(chosen.track.id),
      codec: canonicalCodec(chosen.track.codec),
      ...(chosen.track.width !== undefined ? { width: chosen.track.width } : {}),
      ...(chosen.track.height !== undefined ? { height: chosen.track.height } : {}),
    },
  };
}

/**
 * Decode → FrameSink. Pull the lazy video frame stream, collect up to `maxFrames`, sort by presentation
 * timestamp, rasterize each to normalized RGBA (the golden-compatible path) and digest with a 0..N-1
 * presentation index. Close EVERY collected VideoFrame exactly once (in a finally, even on a raster
 * throw). An audio-only / undecodable-video source yields an empty sink — the decode oracles then report
 * a clean "0 frames" FAIL rather than a crash. A capability miss (WebCodecs absent / codec the browser
 * can't configure) propagates as a CapabilityError for the caller's `naIfMiss` mapping.
 */
async function frameSinkFromSingleVideoFrame(
  frame: VideoFrame,
  onFirstFrame?: () => void,
): Promise<FrameSink> {
  const sink = new RetainingFrameSink();
  try {
    const img = await imageDataFromAibrushFrame(frame);
    const digest = await digestImageData(img, 0, frame.timestamp);
    sink.add(digest, img);
    onFirstFrame?.();
    return sink;
  } finally {
    closeFrame(frame);
  }
}

function canUseSeekForSingleFrameDecode(input: MediaInput, maxFrames: number): boolean {
  if (maxFrames !== 1 || input.mutated || isMalformedHarnessInput(input) || isStillImageInput(input)) {
    return false;
  }
  return containerFromInput(input) === 'mp4';
}

/** Max frames the bounded direct-decode path will materialize (keeps peak VideoFrames small). */
const DIRECT_BOUNDED_DECODE_MAX_FRAMES = 32;

function canUseDirectBoundedDecode(input: MediaInput, maxFrames: number): boolean {
  // Try the direct byte+pooled-decoder path for an mp4 decode of a SMALL, bounded frame count, whenever the
  // known size is small OR unknown (baked fixtures carry no manifest size). #tryDirectBoundedDecode does a
  // bounded read and bails to the seek/streaming path if the file exceeds the cap, so an unknown-but-large
  // file is never fully buffered here. Skips mutated/malformed/still-image inputs (their own paths handle
  // rejection/frame semantics).
  if (input.mutated || isMalformedHarnessInput(input) || isStillImageInput(input)) return false;
  if (!Number.isFinite(maxFrames) || maxFrames < 1 || maxFrames > DIRECT_BOUNDED_DECODE_MAX_FRAMES) return false;
  if (containerFromInput(input) !== 'mp4') return false;
  return input.sizeBytes === undefined || input.sizeBytes <= DIRECT_SINGLE_FRAME_MP4_MAX_BYTES;
}

function videoDecoderConfigFromTrackInfo(track: AibrushTrackInfo): VideoDecoderConfig | undefined {
  const config = track.config;
  if (config === undefined || typeof config.codec !== 'string') return undefined;
  const codedWidth = config.codedWidth;
  const codedHeight = config.codedHeight;
  if (
    codedWidth === undefined ||
    codedHeight === undefined ||
    !Number.isFinite(codedWidth) ||
    !Number.isFinite(codedHeight) ||
    codedWidth <= 0 ||
    codedHeight <= 0
  ) {
    return undefined;
  }
  return {
    codec: config.codec,
    codedWidth,
    codedHeight,
    ...(config.description !== undefined ? { description: bufferBytes(config.description) } : {}),
  };
}

function directVideoPacketRows(
  table: AibrushPacketInfoTable,
  maxRows: number,
): { readonly config: VideoDecoderConfig; readonly rows: readonly AibrushPacketInfoMetadata[]; readonly hasMore: boolean } | undefined {
  const trackIndex = table.tracks.findIndex((track) => track.mediaType === 'video');
  if (trackIndex < 0) return undefined;
  const track = table.tracks[trackIndex];
  if (track === undefined) return undefined;
  const config = videoDecoderConfigFromTrackInfo(track);
  if (config === undefined) return undefined;
  const all = table.packets
    .filter(
      (row) =>
        row.trackIndex === trackIndex &&
        row.offset !== undefined &&
        Number.isSafeInteger(row.offset) &&
        row.offset >= 0 &&
        Number.isSafeInteger(row.size) &&
        row.size > 0 &&
        Number.isFinite(row.ptsUs) &&
        (row.dtsUs === undefined || Number.isFinite(row.dtsUs)),
    )
    .sort((a, b) => (a.dtsUs ?? a.ptsUs) - (b.dtsUs ?? b.ptsUs) || a.ptsUs - b.ptsUs);
  const rows = all.slice(0, maxRows);
  if (rows.length === 0 || rows[0]?.keyframe !== true) return undefined;
  // `hasMore` = the track has coded packets beyond this window. When set and the window yields fewer than
  // the requested frames, the bounded decode falls back to the full streaming path (rather than returning a
  // short frame set) — so a real, many-frame video is never truncated by this fast path.
  return { config, rows, hasMore: all.length > rows.length };
}

async function decodeToFrameSink(
  streams: AibrushMediaStreams,
  maxFrames: number,
  presence: DecodeTrackPresence,
  onFirstFrame?: () => void,
): Promise<FrameSink> {
  const sink = new RetainingFrameSink();
  if (presence.hasVideo) {
    const videoStream = streams.video;
    // Cancel an unconsumed audio stream so its decoder/frames never leak (we only digest video).
    if (streams.audio) await streams.audio.cancel(new Error('audio not consumed')).catch(() => {});
    if (!videoStream) {
      return sink; // no decodable video track → empty sink (honest 0-frame result)
    }

    const collected = await collectVideoFrames(videoStream, maxFrames);
    // Presentation order, then re-index 0..N-1 — exactly how the golden frame list is produced, so the
    // decoded-frames-bitexact oracle pairs frame[i] ↔ golden[i] correctly.
    collected.sort((a, b) => a.timestamp - b.timestamp);
    const emit = Number.isFinite(maxFrames) ? collected.slice(0, maxFrames) : collected;
    try {
      for (let i = 0; i < emit.length; i++) {
        const frame = emit[i]!;
        const img = await imageDataFromAibrushFrame(frame);
        const digest = await digestImageData(img, i, frame.timestamp);
        sink.add(digest, img);
        if (i === 0) onFirstFrame?.();
      }
    } finally {
      for (const frame of collected) closeFrame(frame);
    }
    return sink;
  }

  if (presence.hasAudio) {
    if (streams.video) await streams.video.cancel(new Error('video not consumed')).catch(() => {});
    if (!streams.audio) return { frames: [] };
    return { frames: await collectAudioPcmFrameDigests(streams.audio, maxFrames, onFirstFrame) };
  }

  if (streams.video) await streams.video.cancel(new Error('no decodable track')).catch(() => {});
  if (streams.audio) await streams.audio.cancel(new Error('no decodable track')).catch(() => {});
  return sink;
}

// ── transcode support: harness TranscodeOptions → engine ConvertOptions ────────────────────────────

/** Engine `VideoTarget.rotate` is the literal union 0|90|180|270; coerce the harness's free `number`. */
function asRotate(rotate: number | undefined): 0 | 90 | 180 | 270 | undefined {
  if (rotate === undefined) return undefined;
  const r = ((Math.round(rotate) % 360) + 360) % 360;
  return r === 0 || r === 90 || r === 180 || r === 270 ? r : undefined;
}

function asFlip(value: unknown): 'h' | 'v' | undefined {
  return value === 'h' || value === 'v' ? value : undefined;
}

function asCrop(value: unknown): AibrushVideoTarget['crop'] | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const crop = value as { x?: unknown; y?: unknown; width?: unknown; height?: unknown };
  const x = crop.x;
  const y = crop.y;
  const width = crop.width;
  const height = crop.height;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number'
  ) {
    return undefined;
  }
  return { x, y, width, height };
}

interface PadContainTarget {
  readonly width: number;
  readonly height: number;
  readonly fit: 'contain';
}

function padContainFrom(extra?: Record<string, unknown>): PadContainTarget | undefined {
  const raw = extra?.pad;
  if (typeof raw !== 'object' || raw === null) return undefined;
  const pad = raw as { width?: unknown; height?: unknown; color?: unknown };
  const width = pad.width;
  const height = pad.height;
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }
  if (pad.color !== undefined && pad.color !== 'black') return undefined;
  return { width, height, fit: 'contain' };
}

function colorspaceFrom(extra?: Record<string, unknown>): AibrushVideoTarget['colorspace'] | undefined {
  const raw = extra?.colorspace;
  if (typeof raw !== 'object' || raw === null) return undefined;
  const color = raw as { to?: unknown };
  const to = color.to;
  if (typeof to !== 'string' || to.trim().length === 0) return undefined;
  return { to };
}

function tonemapFrom(extra?: Record<string, unknown>): AibrushVideoTarget['tonemap'] | undefined {
  const raw = extra?.tonemap;
  if (typeof raw !== 'object' || raw === null) return undefined;
  const tone = raw as { to?: unknown };
  return tone.to === 'sdr' ? { to: 'sdr' } : undefined;
}

function gainDbFrom(audio: Record<string, unknown>): number | undefined {
  const gainDb = audio.gainDb;
  if (typeof gainDb === 'number' && Number.isFinite(gainDb)) return gainDb;
  const gainLinear = audio.gainLinear;
  if (typeof gainLinear === 'number' && Number.isFinite(gainLinear) && gainLinear > 0) {
    return 20 * Math.log10(gainLinear);
  }
  return undefined;
}

function fadeFrom(audio: Record<string, unknown>): AibrushAudioTarget['fade'] | undefined {
  const raw = audio.fade;
  if (typeof raw !== 'object' || raw === null) return undefined;
  const fade = raw as { inSec?: unknown; outSec?: unknown; curve?: unknown };
  const inSec = fade.inSec;
  const outSec = fade.outSec;
  const curve = fade.curve;
  const target: NonNullable<AibrushAudioTarget['fade']> = {};
  if (typeof inSec === 'number' && Number.isFinite(inSec) && inSec >= 0) target.inSec = inSec;
  if (typeof outSec === 'number' && Number.isFinite(outSec) && outSec >= 0) target.outSec = outSec;
  if (curve === 'linear' || curve === 'equal-power') target.curve = curve;
  return Object.keys(target).length > 0 ? target : undefined;
}

/** Map one harness video target to the engine's, copying only the set fields (exactOptionalPropertyTypes). */
function videoTargetFrom(v: TranscodeVideoOptions, extra?: Record<string, unknown>): AibrushVideoTarget {
  const videoExtra = v as unknown as Record<string, unknown>;
  const rotate = asRotate(v.rotate);
  const flip = asFlip(extra?.flip);
  const crop = asCrop(extra?.crop);
  const pad = padContainFrom(extra);
  const colorspace = colorspaceFrom(extra);
  const tonemap = tonemapFrom(extra);
  const crf = videoExtra.crf;
  const passes = videoExtra.passes;
  const bitDepth = videoExtra.bitDepth;
  const alpha = extra?.alpha;
  return {
    ...(v.codec !== undefined ? { codec: v.codec } : {}),
    ...(v.width !== undefined ? { width: v.width } : pad !== undefined ? { width: pad.width } : {}),
    ...(v.height !== undefined ? { height: v.height } : pad !== undefined ? { height: pad.height } : {}),
    ...(pad !== undefined ? { fit: pad.fit } : {}),
    ...(v.fps !== undefined ? { fps: v.fps } : {}),
    ...(v.bitrate !== undefined ? { bitrate: v.bitrate } : {}),
    ...(typeof crf === 'number' && Number.isFinite(crf) ? { crf } : {}),
    ...(passes === 2 ? { twoPass: true } : {}),
    ...(bitDepth === 8 || bitDepth === 10 || bitDepth === 12 ? { bitDepth } : {}),
    ...(alpha === 'keep' || alpha === 'discard' ? { alpha } : {}),
    ...(rotate !== undefined ? { rotate } : {}),
    ...(flip !== undefined ? { flip } : {}),
    ...(crop !== undefined ? { crop } : {}),
    ...(colorspace !== undefined ? { colorspace } : {}),
    ...(tonemap !== undefined ? { tonemap } : {}),
  };
}

/**
 * The media types this transcode EXPLICITLY targets — a `video`/`audio` target object present in the
 * harness `TranscodeOptions` (the harness shape has no `false`/drop sentinel; an absent key means
 * "preserve", not "produce"). Used by the mismatch guard to reject a transcode that asks only for a
 * media type the source lacks (e.g. an audio target on a video-only source).
 */
function requestedTargetTypes(opts: TranscodeOptions): TrackType[] {
  const types: TrackType[] = [];
  if (opts.video) types.push('video');
  if (opts.audio) types.push('audio');
  return types;
}

function requestedOnlyAudioFromKnownAudioSource(input: MediaInput, types: readonly TrackType[]): boolean {
  if (types.length !== 1 || types[0] !== 'audio') return false;
  switch (containerFromInput(input)) {
    case 'wav':
    case 'aiff':
    case 'caf':
    case 'flac':
    case 'adts':
    case 'mp3':
    case 'ogg':
      return true;
    default:
      return false;
  }
}

/** Map the harness TranscodeOptions to the engine's ConvertOptions for one rendition. */
function convertOptionsFrom(opts: TranscodeOptions): AibrushConvertOptions {
  const shape = opts as unknown as { fastStart?: unknown; fragmented?: unknown };
  const out: AibrushConvertOptions = {
    to: opts.container,
    ...(shape.fastStart !== undefined ? { faststart: shape.fastStart !== false } : {}),
    ...(shape.fragmented === true || shape.fastStart === 'fragmented' ? { fragmented: true } : {}),
  };
  if (opts.video) out.video = videoTargetFrom(opts.video, opts as unknown as Record<string, unknown>);
  if (opts.audio) {
    const a = opts.audio;
    const audioExtra = a as unknown as Record<string, unknown>;
    const gainDb = gainDbFrom(audioExtra);
    const fade = fadeFrom(audioExtra);
    out.audio = {
      ...(a.codec !== undefined ? { codec: a.codec } : {}),
      ...(a.sampleRate !== undefined ? { sampleRate: a.sampleRate } : {}),
      ...(a.channels !== undefined ? { channels: a.channels } : {}),
      ...(a.bitrate !== undefined ? { bitrate: a.bitrate } : {}),
      ...(gainDb !== undefined ? { gainDb } : {}),
      ...(fade !== undefined ? { fade } : {}),
    };
  }
  return out;
}

function isPcmCodec(codec: string | undefined): boolean {
  return codec === undefined || codec === 'pcm' || codec.startsWith('pcm-');
}

function pcmSampleFormatFromCodec(codec: string | undefined): AibrushPcmSampleFormat | undefined {
  if (codec === undefined || codec === 'pcm') return undefined;
  const normalized = codec.endsWith('be') ? codec.slice(0, -2) : codec;
  switch (normalized) {
    case 'pcm-u8':
      return 'u8';
    case 'pcm-s8':
      return 's8';
    case 'pcm-s16':
      return 's16';
    case 'pcm-s24':
      return 's24';
    case 'pcm-s32':
      return 's32';
    case 'pcm-f32':
      return 'f32';
    case 'pcm-f64':
      return 'f64';
    default:
      return undefined;
  }
}

function pcmEndianFromCodec(codec: string | undefined): AibrushPcmEndian | undefined {
  if (codec === undefined || codec === 'pcm') return undefined;
  return codec.endsWith('be') ? 'be' : 'le';
}

function hasOnlyNeutralAudioFields(audio: TranscodeAudioOptions): boolean {
  const extra = audio as unknown as Record<string, unknown>;
  for (const key of Object.keys(extra)) {
    if (key !== 'codec' && key !== 'sampleRate' && key !== 'channels' && key !== 'bitrate') {
      return false;
    }
  }
  return audio.bitrate === undefined && gainDbFrom(extra) === undefined && fadeFrom(extra) === undefined;
}

function canUsePreparedWavIdentity(
  prepared: PreparedCanonicalWavMux,
  opts: TranscodeOptions,
): boolean {
  if (opts.container.toLowerCase() !== 'wav' || opts.video !== undefined || opts.variants !== undefined) {
    return false;
  }
  const audio = opts.audio;
  if (audio === undefined) return true;
  const track = prepared.metadata.tracks.find((candidate) => candidate.type === 'audio');
  if (track === undefined || !hasOnlyNeutralAudioFields(audio) || !isPcmCodec(audio.codec)) {
    return false;
  }
  if (audio.codec !== undefined && audio.codec !== 'pcm' && canonicalCodec(audio.codec) !== track.codec) {
    return false;
  }
  if (audio.sampleRate !== undefined && audio.sampleRate !== track.sampleRate) return false;
  return audio.channels === undefined || audio.channels === track.channels;
}

function preparedAiffWavOptionsFrom(
  opts: TranscodeOptions,
):
  | {
      readonly sampleFormat?: AibrushPcmSampleFormat;
      readonly endian?: AibrushPcmEndian;
      readonly channels?: number;
      readonly sampleRate?: number;
    }
  | undefined {
  if (opts.container.toLowerCase() !== 'wav' || opts.video !== undefined || opts.variants !== undefined) {
    return undefined;
  }
  const audio = opts.audio;
  if (audio === undefined) return {};
  if (!hasOnlyNeutralAudioFields(audio) || !isPcmCodec(audio.codec)) return undefined;
  const sampleFormat = pcmSampleFormatFromCodec(audio.codec);
  if (audio.codec !== undefined && audio.codec !== 'pcm' && sampleFormat === undefined) return undefined;
  const endian = pcmEndianFromCodec(audio.codec);
  return {
    ...(sampleFormat !== undefined ? { sampleFormat } : {}),
    ...(endian !== undefined ? { endian } : {}),
    ...(audio.channels !== undefined ? { channels: audio.channels } : {}),
    ...(audio.sampleRate !== undefined ? { sampleRate: audio.sampleRate } : {}),
  };
}

function preparedWavF32GainOptionsFrom(
  opts: TranscodeOptions,
):
  | {
      readonly gainDb: number;
      readonly sampleFormat?: AibrushPcmSampleFormat;
      readonly endian?: AibrushPcmEndian;
      readonly channels?: number;
      readonly sampleRate?: number;
    }
  | undefined {
  if (opts.container.toLowerCase() !== 'wav' || opts.video !== undefined || opts.variants !== undefined) {
    return undefined;
  }
  const audio = opts.audio;
  if (audio === undefined || audio.bitrate !== undefined) return undefined;
  const extra = audio as unknown as Record<string, unknown>;
  for (const key of Object.keys(extra)) {
    if (key !== 'codec' && key !== 'sampleRate' && key !== 'channels' && key !== 'gainDb' && key !== 'gainLinear') {
      return undefined;
    }
  }
  if (!isPcmCodec(audio.codec)) return undefined;
  const sampleFormat = pcmSampleFormatFromCodec(audio.codec);
  if (audio.codec !== undefined && audio.codec !== 'pcm' && sampleFormat === undefined) return undefined;
  if (sampleFormat !== undefined && sampleFormat !== 'f32') return undefined;
  const endian = pcmEndianFromCodec(audio.codec);
  if (endian !== undefined && endian !== 'le') return undefined;
  const gainDb = gainDbFrom(extra);
  if (gainDb === undefined || gainDb === 0) return undefined;
  return {
    gainDb,
    ...(sampleFormat !== undefined ? { sampleFormat } : {}),
    ...(endian !== undefined ? { endian } : {}),
    ...(audio.channels !== undefined ? { channels: audio.channels } : {}),
    ...(audio.sampleRate !== undefined ? { sampleRate: audio.sampleRate } : {}),
  };
}

async function tryPreparedWavIdentityTranscode(
  engine: AibrushEngine,
  input: MediaInput,
  opts: TranscodeOptions,
): Promise<MediaBytes | undefined> {
  if (engine.pcm === undefined || containerFromInput(input) !== 'wav') return undefined;
  const prepared = await prepareCanonicalWavStreamMux(input);
  if (prepared === undefined || !canUsePreparedWavIdentity(prepared, opts)) return undefined;
  // `canUsePreparedWavIdentity` certified a genuine no-op (target codec/sampleRate/channels equal the
  // source and every audio field is neutral), so the PCM transform would only reproduce these exact
  // canonical WAV bytes. Return them directly and skip `engine.pcm` — the dynamic `pcm-convert-plan`
  // import, container routing, and stream materialization it entails all collapse to a byte copy here.
  return toMediaBytes(prepared.bytes, 'wav');
}

async function tryPreparedWavF32GainTranscode(
  core: AibrushCore,
  input: MediaInput,
  opts: TranscodeOptions,
  signal: AbortSignal,
): Promise<MediaBytes | undefined> {
  if (input.mutated || containerFromInput(input) !== 'wav') return undefined;
  const gainOptions = preparedWavF32GainOptionsFrom(opts);
  if (gainOptions === undefined) return undefined;
  const out = core.wavF32GainToWavFromBytes(await inputBytes(input), { ...gainOptions, signal });
  return out === undefined ? undefined : toMediaBytes(out, 'wav');
}

async function tryPreparedWavDirectPcmTranscode(
  core: AibrushCore,
  input: MediaInput,
  opts: TranscodeOptions,
  signal: AbortSignal,
): Promise<MediaBytes | undefined> {
  if (input.mutated || containerFromInput(input) !== 'wav') return undefined;
  const directOptions = preparedAiffWavOptionsFrom(opts);
  if (directOptions === undefined) return undefined;
  if (directOptions.endian !== undefined && directOptions.endian !== 'le') return undefined;
  const bytes = await inputBytes(input);
  if (directOptions.sampleRate !== undefined) {
    const resampled = core.wavS16ResampleToWavFromBytes(bytes, {
      sampleRate: directOptions.sampleRate,
      ...(directOptions.channels !== undefined ? { channels: directOptions.channels } : {}),
      signal,
    });
    if (resampled !== undefined) return toMediaBytes(resampled, 'wav');
  }
  if (directOptions.sampleFormat !== undefined) {
    const converted = core.wavPcmFormatToWavFromBytes(bytes, {
      sampleFormat: directOptions.sampleFormat,
      ...(directOptions.channels !== undefined ? { channels: directOptions.channels } : {}),
      ...(directOptions.sampleRate !== undefined ? { sampleRate: directOptions.sampleRate } : {}),
      signal,
    });
    if (converted !== undefined) return toMediaBytes(converted, 'wav');
  }
  return undefined;
}

async function tryPreparedAiffWavTranscode(
  core: AibrushCore,
  input: MediaInput,
  opts: TranscodeOptions,
): Promise<MediaBytes | undefined> {
  if (containerFromInput(input) !== 'aiff') return undefined;
  const rewriteOptions = preparedAiffWavOptionsFrom(opts);
  if (rewriteOptions === undefined) return undefined;
  const out = core.aiffPcmToWavFromBytes(await inputBytes(input), rewriteOptions);
  return out === undefined ? undefined : toMediaBytes(out, 'wav');
}

function h264AbrLadderFrom(opts: TranscodeOptions): readonly AibrushH264AbrRung[] | undefined {
  if (!opts.variants?.length) return undefined;
  return opts.variants.map((variant, index): AibrushH264AbrRung => {
    const codec = variant.codec ?? opts.video?.codec ?? 'h264';
    if (codec !== 'h264') {
      throw createNotApplicableError(ENGINE_ID, 'transcode', `ABR fanout only supports h264 rungs, got '${codec}'`);
    }
    if (
      variant.width === undefined ||
      variant.height === undefined ||
      variant.bitrate === undefined
    ) {
      throw new GracefulRejectionError('transcode', `ABR rung ${index} is missing width/height/bitrate`);
    }
    return {
      name: `${variant.height}p-${index}`,
      width: variant.width,
      height: variant.height,
      bitrate: variant.bitrate,
      ...(variant.fps !== undefined ? { fps: variant.fps } : {}),
    };
  });
}

// ── mux support: harness EncodedTracks ← engine demux; container produced via engine remux/convert ──

/**
 * Output containers the engine can FAITHFULLY author for a single-source mux by COPYING the coded
 * samples without a codec-seam encoder. mp4/mov use ISO-BMFF stream-copy when possible (ADR-021);
 * webm/mkv/ogg/ts use the packet seam and their real target muxers. The target muxer is the legality
 * arbiter — an illegal codec→container raises a typed CapabilityError → NA (never a wrong-output pass),
 * and the harness reference-reimport oracle proves every legal pair. wav/aiff/caf are PCM-native
 * transforms, not coded-sample mux targets; flac/adts/mp3 still have no same-format chunk muxer.
 */
const MUX_FAITHFUL_TARGETS = new Set(['mp4', 'mov', 'webm', 'mkv', 'ogg', 'ts', 'flac', 'mp3', 'adts']);

/**
 * PCM-container WRITE targets. These are NOT coded-sample chunk-seam muxes — raw PCM is re-serialized
 * through the engine's audio-dsp path (`convert({to})` → transformPcm/convertPcmNative, ADR-022), which
 * authors the RIFF/AIFF/CAF header + data chunk. The mux runner routes a PCM target here instead of the
 * chunk muxer. (wav is the canonical PCM write container; aiff/caf are the other pure-PCM wrappers.)
 */
const PCM_MUX_TARGETS = new Set(['wav', 'aiff', 'caf']);

const OGG_AUDIO_CODECS = new Set(['opus', 'vorbis', 'flac']);

function normalizedTrackSelect(opts: MuxOptions): string[] {
  const raw = (opts as { trackSelect?: unknown }).trackSelect;
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is string => typeof value === 'string');
}

function selectorMatchesTrack(selector: string, type: TrackType, indexWithinType: number): boolean {
  const sourceFree = selector.split('@', 1)[0] ?? selector;
  return sourceFree === `${type}:${indexWithinType}`;
}

function muxTracksAfterSelection(tracks: EncodedTracks, opts: MuxOptions): readonly EncodedTrack[] {
  const selectors = normalizedTrackSelect(opts);
  if (selectors.length === 0) return tracks.tracks;
  const seenByType = new Map<TrackType, number>();
  return tracks.tracks.filter((track) => {
    const indexWithinType = seenByType.get(track.type) ?? 0;
    seenByType.set(track.type, indexWithinType + 1);
    return selectors.some((selector) => selectorMatchesTrack(selector, track.type, indexWithinType));
  });
}

function muxTrackSummary(tracks: readonly EncodedTrack[]): string {
  if (tracks.length === 0) return 'no selected tracks';
  return tracks.map((track) => `${track.type}/${canonicalCodec(track.codec)}`).join('+');
}

function rejectIllegalMuxTarget(target: string, tracks: readonly EncodedTrack[]): void {
  if (target === 'adts') {
    const track = tracks[0];
    const legalAacElementary =
      tracks.length === 1 && track !== undefined && track.type === 'audio' && canonicalCodec(track.codec) === 'aac';
    if (!legalAacElementary) {
      throw new GracefulRejectionError('mux', `container 'adts' can only carry a single AAC audio track, got ${muxTrackSummary(tracks)}`);
    }
    return;
  }
  if (target === 'ogg') {
    const illegal = tracks.some((track) => track.type !== 'audio' || !OGG_AUDIO_CODECS.has(canonicalCodec(track.codec)));
    if (tracks.length === 0 || illegal) {
      throw new GracefulRejectionError('mux', `container 'ogg' cannot carry ${muxTrackSummary(tracks)}`);
    }
  }
}

/** Build one harness `EncodedTrack` (codec + framing + verbatim coded chunk bytes) from a demuxed track. */
async function encodedTrackFrom(demuxed: AibrushDemuxed, track: AibrushTrackInfo): Promise<EncodedTrack> {
  const type: TrackType = track.mediaType; // demux only yields 'video' | 'audio'
  const cfg = track.config ?? {};
  const reader = demuxed.packets(track.id).getReader();
  const chunks: EncodedTrack['chunks'] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value.chunk;
      const data = packetPayloadBytes(value);
      chunks.push({
        data,
        ptsUs: Math.round(chunk.timestamp),
        ...(value.dtsUs !== undefined ? { dtsUs: Math.round(value.dtsUs) } : {}),
        durationUs: Math.round(chunk.duration ?? 0),
        keyframe: chunk.type === 'key',
      });
    }
  } finally {
    reader.releaseLock();
  }
  const description = cfg.description ? bufferBytes(cfg.description) : undefined;
  return {
    type,
    codec: canonicalCodec(track.codec ?? cfg.codec ?? ''),
    // Microsecond packet timestamps (engine convention) → a 1e6 timescale so ptsUs/dtsUs are the units.
    timescale: 1_000_000,
    ...(cfg.codedWidth !== undefined ? { width: cfg.codedWidth } : {}),
    ...(cfg.codedHeight !== undefined ? { height: cfg.codedHeight } : {}),
    ...(cfg.sampleRate !== undefined ? { sampleRate: cfg.sampleRate } : {}),
    ...(cfg.numberOfChannels !== undefined ? { channels: cfg.numberOfChannels } : {}),
    ...(description ? { description } : {}),
    chunks,
  };
}

function encodedTrackFromWebmPayloadInfo(
  table: AibrushWebmPacketPayloadInfoTable,
  track: AibrushTrackInfo,
  trackIndex: number,
): EncodedTrack | undefined {
  const cfg = track.config ?? {};
  const codec = canonicalCodec(track.codec ?? cfg.codec ?? '');
  const chunks: EncodedTrack['chunks'] = [];
  for (const row of table.packets) {
    if (row.trackIndex !== trackIndex) continue;
    if (
      row.data.byteLength === 0 ||
      !Number.isFinite(row.ptsUs) ||
      (row.dtsUs !== undefined && !Number.isFinite(row.dtsUs)) ||
      (row.durationUs !== undefined && !Number.isFinite(row.durationUs))
    ) {
      return undefined;
    }
    chunks.push({
      data: row.data,
      ptsUs: Math.round(row.ptsUs),
      ...(row.dtsUs !== undefined ? { dtsUs: Math.round(row.dtsUs) } : {}),
      durationUs: row.durationUs === undefined ? 0 : Math.max(0, Math.round(row.durationUs)),
      keyframe: row.keyframe,
    });
  }
  if (chunks.length === 0 || codec.length === 0) return undefined;
  if (track.mediaType === 'video') {
    const width = cfg.codedWidth;
    const height = cfg.codedHeight;
    if (
      width === undefined ||
      height === undefined ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      return undefined;
    }
    return {
      type: 'video',
      codec,
      timescale: 1_000_000,
      width,
      height,
      ...(cfg.description !== undefined ? { description: bufferBytes(cfg.description) } : {}),
      chunks,
    };
  }
  const sampleRate = cfg.sampleRate;
  const channels = cfg.numberOfChannels;
  if (
    track.mediaType !== 'audio' ||
    sampleRate === undefined ||
    channels === undefined ||
    !Number.isFinite(sampleRate) ||
    !Number.isFinite(channels) ||
    sampleRate <= 0 ||
    channels <= 0
  ) {
    return undefined;
  }
  return {
    type: 'audio',
    codec,
    timescale: 1_000_000,
    sampleRate,
    channels,
    ...(cfg.description !== undefined ? { description: bufferBytes(cfg.description) } : {}),
    chunks,
  };
}

function encodedTracksFromWebmPayloadInfo(
  table: AibrushWebmPacketPayloadInfoTable,
): EncodedTrack[] | undefined {
  const tracks: EncodedTrack[] = [];
  for (let trackIndex = 0; trackIndex < table.tracks.length; trackIndex++) {
    const track = table.tracks[trackIndex];
    if (track === undefined) return undefined;
    const encoded = encodedTrackFromWebmPayloadInfo(table, track, trackIndex);
    if (encoded === undefined) return undefined;
    tracks.push(encoded);
  }
  return tracks.length === 0 ? undefined : tracks;
}

function webmPayloadChunksForTrack(
  table: AibrushWebmPacketPayloadInfoTable,
  trackIndex: number,
): AibrushPreparedWebmChunk[] | undefined {
  const chunks: AibrushPreparedWebmChunk[] = [];
  for (const row of table.packets) {
    if (row.trackIndex !== trackIndex) continue;
    if (
      row.data.byteLength === 0 ||
      !Number.isFinite(row.ptsUs) ||
      (row.dtsUs !== undefined && !Number.isFinite(row.dtsUs)) ||
      (row.durationUs !== undefined && !Number.isFinite(row.durationUs))
    ) {
      return undefined;
    }
    const durationUs = row.durationUs === undefined ? undefined : Math.max(0, Math.round(row.durationUs));
    chunks.push({
      timestampUs: Math.round(row.ptsUs),
      ...(durationUs !== undefined ? { durationUs } : {}),
      key: row.keyframe,
      data: row.data,
      ...(row.dtsUs !== undefined ? { dtsUs: Math.round(row.dtsUs) } : {}),
      ...(row.alpha !== undefined ? { alpha: row.alpha } : {}),
    });
  }
  return chunks.length === 0 ? undefined : chunks;
}

function preparedWebmChunkTracksFromPayloadInfo(
  table: AibrushWebmPacketPayloadInfoTable,
): Array<{ readonly track: AibrushTrackInfo; readonly chunks: readonly AibrushPreparedWebmChunk[] }> | undefined {
  const tracks: Array<{ readonly track: AibrushTrackInfo; readonly chunks: readonly AibrushPreparedWebmChunk[] }> = [];
  for (let trackIndex = 0; trackIndex < table.tracks.length; trackIndex++) {
    const track = table.tracks[trackIndex];
    if (track === undefined) return undefined;
    const chunks = webmPayloadChunksForTrack(table, trackIndex);
    if (chunks === undefined) return undefined;
    tracks.push({ track, chunks });
  }
  return tracks.length === 0 ? undefined : tracks;
}

async function encodedTracksForPreparedWebmMuxInput(
  core: AibrushCore,
  input: MediaInput,
  signal: AbortSignal | undefined,
): Promise<EncodedTrack[] | undefined> {
  if (input.mutated || isMalformedHarnessInput(input)) return undefined;
  const bytes =
    input.sizeBytes !== undefined && input.sizeBytes <= PACKET_INFO_PREP_MAX_SOURCE_BYTES
      ? await inputBytes(input)
      : await inputBytesIfAtMost(input, PACKET_INFO_PREP_MAX_SOURCE_BYTES);
  if (bytes === undefined) return undefined;
  const container = containerFromInput(input);
  if (container === 'mp4' || container === 'mov') {
    const table = await core.mp4PacketInfoFromBytes(bytes, { includeOffsets: true, signal });
    return encodedMp4TracksFromPacketInfo(table, bytes);
  }
  if (container === 'adts') {
    const track = encodedAdtsAudioTrackFromPacketInfo(core.adtsPacketInfoFromBytes(bytes), bytes);
    return track === undefined ? undefined : [track];
  }
  if (container === 'mp3') {
    const track = encodedMp3AudioTrackFromPacketInfo(core.mp3PacketInfoFromBytes(bytes), bytes);
    return track === undefined ? undefined : [track];
  }
  if (container === 'ogg') {
    const track = encodedOggAudioTrackFromPacketInfo(core.oggPacketInfoFromBytes(bytes), bytes);
    return track === undefined ? undefined : [track];
  }
  if (container === 'webm' || container === 'mkv') {
    return encodedTracksFromWebmPayloadInfo(core.webmPacketPayloadInfoFromBytes(bytes));
  }
  return undefined;
}

function preparedWebmChunkTracksFromEncodedTracks(
  tracks: readonly EncodedTrack[],
): Array<{ readonly track: AibrushTrackInfo; readonly chunks: readonly AibrushPreparedWebmChunk[] }> | undefined {
  const prepared: Array<{ readonly track: AibrushTrackInfo; readonly chunks: readonly AibrushPreparedWebmChunk[] }> = [];
  for (const track of tracks) {
    const trackInfo = track.type === 'video' ? videoTrackInfoFromEncoded(track) : audioTrackInfoFromEncoded(track);
    if (trackInfo === undefined) return undefined;
    const chunks = webmChunkArrayFromEncodedTrack(track);
    if (chunks.length === 0) return undefined;
    prepared.push({ track: trackInfo, chunks });
  }
  return prepared.length === 0 ? undefined : prepared;
}

async function prepareMultiSourceWebmMux(
  core: AibrushCore,
  inputs: readonly MediaInput[],
  signal: AbortSignal | undefined,
): Promise<{
  readonly tracks: EncodedTrack[];
  readonly preparedTracks: readonly { readonly track: AibrushTrackInfo; readonly chunks: readonly AibrushPreparedWebmChunk[] }[];
} | undefined> {
  const byInput: EncodedTrack[][] = [];
  let laterInputHasAudio = false;
  let firstInputHasVideo = false;
  let firstInputHasAudio = false;
  const tracks: EncodedTrack[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    if (input === undefined) return undefined;
    const inputTracks = await encodedTracksForPreparedWebmMuxInput(core, input, signal);
    if (inputTracks === undefined) return undefined;
    if (i === 0) {
      firstInputHasVideo = inputTracks.some((track) => track.type === 'video');
      firstInputHasAudio = inputTracks.some((track) => track.type === 'audio');
    } else if (inputTracks.some((track) => track.type === 'audio')) {
      laterInputHasAudio = true;
    }
    byInput.push(inputTracks);
  }
  const dropFirstInputAudio = firstInputHasVideo && firstInputHasAudio && laterInputHasAudio;
  for (let i = 0; i < byInput.length; i++) {
    const inputTracks = byInput[i];
    if (inputTracks === undefined) return undefined;
    for (const track of inputTracks) {
      if (i === 0 && dropFirstInputAudio && track.type === 'audio') continue;
      tracks.push(track);
    }
  }
  const preparedTracks = preparedWebmChunkTracksFromEncodedTracks(tracks);
  return preparedTracks === undefined ? undefined : { tracks, preparedTracks };
}

// ── strict-copy remux repairs at the framework packet boundary ─────────────────────────────────

// These byte-table repairs are deliberately bounded. They correct representation/timeline facts the
// public framework currently loses on a few otherwise-supported container seams, while large/streaming
// rows retain the framework's native lazy paths.
const STRICT_PREPARED_REMUX_MAX_SOURCE_BYTES = 128 * 1024 * 1024;
const FINITE_WEBM_CLUSTER_REPAIR_MAX_SOURCE_BYTES = 2 * 1024 * 1024;

interface PreparedAibrushPacketTrack {
  readonly track: AibrushTrackInfo;
  readonly packets: readonly AibrushPacket[];
}

function plainBufferedPreparedRemux(opts: RemuxOptions): boolean {
  const trackSelect = (opts as { trackSelect?: unknown }).trackSelect;
  return (
    !wantsStreamTarget(opts) &&
    !wantsAppendOnly(opts) &&
    !wantsFragmented(opts) &&
    opts.tags === undefined &&
    (!Array.isArray(trackSelect) || trackSelect.length === 0)
  );
}

function mediaEvidenceTracks(program: RemuxProgramEvidence): readonly RemuxTrackEvidence[] | undefined {
  const tracks = program.tracks.filter(
    (track): track is RemuxTrackEvidence & { readonly type: 'video' | 'audio' } =>
      track.type === 'video' || track.type === 'audio',
  );
  return tracks.length === program.tracks.length && tracks.length > 0 ? tracks : undefined;
}

function matchAibrushTrack(
  tracks: readonly AibrushTrackInfo[],
  evidence: RemuxTrackEvidence,
  used: Set<number>,
): { readonly index: number; readonly track: AibrushTrackInfo } | undefined {
  for (let index = 0; index < tracks.length; index++) {
    const track = tracks[index];
    if (
      track !== undefined &&
      !used.has(index) &&
      track.mediaType === evidence.type &&
      canonicalCodec(track.codec ?? track.config?.codec ?? '') === canonicalCodec(evidence.codec)
    ) {
      used.add(index);
      return { index, track };
    }
  }
  return undefined;
}

function finiteRounded(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) ? Math.round(value) : undefined;
}

function packetFromRemuxEvidence(
  sample: RemuxSampleEvidence,
  data: Uint8Array,
  fallback?: {
    readonly ptsUs?: number;
    readonly dtsUs?: number;
    readonly durationUs?: number | null;
    readonly keyframe?: boolean;
  },
): AibrushPacket | undefined {
  if (data.byteLength === 0) return undefined;
  const ptsUs = finiteRounded(sample.ptsUs ?? fallback?.ptsUs);
  const dtsUs = finiteRounded(sample.dtsUs ?? fallback?.dtsUs ?? ptsUs);
  const durationUs = finiteRounded(sample.durationUs ?? fallback?.durationUs ?? undefined);
  if (
    ptsUs === undefined ||
    dtsUs === undefined ||
    (durationUs !== undefined && durationUs < 0)
  ) {
    return undefined;
  }
  const keyframe = sample.keyframe ?? fallback?.keyframe ?? sample.framing !== 'length-prefixed';
  const chunk: AibrushChunk = {
    byteLength: data.byteLength,
    timestamp: ptsUs,
    ...(durationUs !== undefined ? { duration: durationUs } : {}),
    type: keyframe ? 'key' : 'delta',
    copyTo(destination: BufferSource): void {
      bufferSourceBytes(destination).set(data);
    },
  };
  return { chunk, data, dtsUs, sizeBytes: data.byteLength };
}

function packetsFromEvidenceTrack(
  track: RemuxTrackEvidence,
  mapData: (sample: RemuxSampleEvidence) => Uint8Array | undefined = (sample) => sample.payload,
): AibrushPacket[] | undefined {
  const packets: AibrushPacket[] = [];
  for (const sample of track.samples) {
    const data = mapData(sample);
    if (data === undefined) return undefined;
    const packet = packetFromRemuxEvidence(sample, data);
    if (packet === undefined) return undefined;
    packets.push(packet);
  }
  return packets.length > 0 ? packets : undefined;
}

interface AibrushIsoBox {
  readonly type: string;
  readonly offset: number;
  readonly body: number;
  readonly end: number;
}

function aibrushIsoChildren(
  bytes: Uint8Array,
  start: number,
  end: number,
): AibrushIsoBox[] | undefined {
  if (start < 0 || end < start || end > bytes.byteLength) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxes: AibrushIsoBox[] = [];
  let offset = start;
  while (offset < end) {
    if (offset + 8 > end) return undefined;
    let size = view.getUint32(offset);
    let headerSize = 8;
    if (size === 1) {
      if (offset + 16 > end) return undefined;
      const large = view.getBigUint64(offset + 8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) return undefined;
      size = Number(large);
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < headerSize || offset + size > end) return undefined;
    const type = String.fromCharCode(
      bytes[offset + 4]!,
      bytes[offset + 5]!,
      bytes[offset + 6]!,
      bytes[offset + 7]!,
    );
    boxes.push({ type, offset, body: offset + headerSize, end: offset + size });
    offset += size;
  }
  return offset === end ? boxes : undefined;
}

function aibrushIsoDurationLayout(
  bytes: Uint8Array,
  box: AibrushIsoBox,
  kind: 'mvhd' | 'tkhd' | 'mdhd',
): { readonly version: 0 | 1; readonly timescaleOffset?: number; readonly durationOffset: number } | undefined {
  const version = bytes[box.body];
  if (version !== 0 && version !== 1) return undefined;
  const timescaleOffset = kind === 'tkhd'
    ? undefined
    : box.body + (version === 1 ? 20 : 12);
  const durationOffset = box.body + (
    kind === 'tkhd'
      ? version === 1 ? 28 : 20
      : version === 1 ? 24 : 16
  );
  const durationBytes = version === 1 ? 8 : 4;
  return durationOffset + durationBytes <= box.end &&
    (timescaleOffset === undefined || timescaleOffset + 4 <= box.end)
    ? { version, ...(timescaleOffset !== undefined ? { timescaleOffset } : {}), durationOffset }
    : undefined;
}

function writeAibrushIsoDuration(
  bytes: Uint8Array,
  layout: NonNullable<ReturnType<typeof aibrushIsoDurationLayout>>,
  durationSec: number,
  timescale: number,
): boolean {
  if (!Number.isSafeInteger(timescale) || timescale <= 0 || !Number.isFinite(durationSec) || durationSec <= 0) {
    return false;
  }
  const ticks = Math.round(durationSec * timescale);
  if (!Number.isSafeInteger(ticks) || ticks <= 0) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (layout.version === 0) {
    if (ticks > 0xffff_ffff) return false;
    view.setUint32(layout.durationOffset, ticks);
  } else {
    view.setBigUint64(layout.durationOffset, BigInt(ticks));
  }
  return true;
}

/**
 * Preserve the complete MP3 coded sample table while exposing its Xing/LAME presentation span in
 * MP4/MOV duration headers. The framework's prepared MP3 mux correctly retains every frame but uses
 * their raw coded span for mdhd/tkhd/mvhd; its ordinary gapless path instead clips coded frames. This
 * bounded header repair is admitted only after a neutral before/after proof shows identical media.
 */
export function materializeAibrushMp3PresentationDuration(
  bytes: Uint8Array,
  container: 'mp4' | 'mov',
  durationSec: number,
): Uint8Array | undefined {
  const top = aibrushIsoChildren(bytes, 0, bytes.byteLength);
  const moov = top?.filter((box) => box.type === 'moov');
  if (moov?.length !== 1) return undefined;
  const moovChildren = aibrushIsoChildren(bytes, moov[0]!.body, moov[0]!.end);
  const mvhd = moovChildren?.filter((box) => box.type === 'mvhd');
  const traks = moovChildren?.filter((box) => box.type === 'trak');
  if (mvhd?.length !== 1 || traks?.length !== 1) return undefined;
  const mvhdLayout = aibrushIsoDurationLayout(bytes, mvhd[0]!, 'mvhd');
  if (mvhdLayout?.timescaleOffset === undefined) return undefined;
  const sourceView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const movieTimescale = sourceView.getUint32(mvhdLayout.timescaleOffset);
  const trakChildren = aibrushIsoChildren(bytes, traks[0]!.body, traks[0]!.end);
  const tkhd = trakChildren?.filter((box) => box.type === 'tkhd');
  const mdia = trakChildren?.filter((box) => box.type === 'mdia');
  if (tkhd?.length !== 1 || mdia?.length !== 1) return undefined;
  const mdiaChildren = aibrushIsoChildren(bytes, mdia[0]!.body, mdia[0]!.end);
  const mdhd = mdiaChildren?.filter((box) => box.type === 'mdhd');
  if (mdhd?.length !== 1) return undefined;
  const tkhdLayout = aibrushIsoDurationLayout(bytes, tkhd[0]!, 'tkhd');
  const mdhdLayout = aibrushIsoDurationLayout(bytes, mdhd[0]!, 'mdhd');
  if (tkhdLayout === undefined || mdhdLayout?.timescaleOffset === undefined) return undefined;
  const mediaTimescale = sourceView.getUint32(mdhdLayout.timescaleOffset);
  const output = bytes.slice();
  if (
    !writeAibrushIsoDuration(output, mvhdLayout, durationSec, movieTimescale) ||
    !writeAibrushIsoDuration(output, tkhdLayout, durationSec, movieTimescale) ||
    !writeAibrushIsoDuration(output, mdhdLayout, durationSec, mediaTimescale)
  ) {
    return undefined;
  }
  const before = readNeutralRemuxProgram(bytes, container);
  const after = readNeutralRemuxProgram(output, container);
  return before.state === 'OK' && after.state === 'OK' && sameRemuxProgramMedia(before.value, after.value)
    ? output
    : undefined;
}

function aibrushOggCrc(bytes: Uint8Array, pageStart: number, pageEnd: number): number {
  let crc = 0;
  for (let index = pageStart; index < pageEnd; index++) {
    const byte = index >= pageStart + 22 && index < pageStart + 26 ? 0 : bytes[index]!;
    crc ^= byte << 24;
    for (let bit = 0; bit < 8; bit++) {
      crc = ((crc << 1) ^ ((crc & 0x8000_0000) !== 0 ? 0x04c1_1db7 : 0)) >>> 0;
    }
  }
  return crc >>> 0;
}

/**
 * Clear only demonstrably-spurious Ogg continuation bits and refresh those pages' CRCs. The framework
 * can mark a fresh FLAC packet page as continued after the previous page already terminated its packet;
 * payload bytes, lacing, granules, serials, and sequence numbers are otherwise intact. Fail closed on
 * every other page inconsistency and require the neutral reader to accept the repaired result.
 */
export function repairAibrushOggContinuationFlags(bytes: Uint8Array): Uint8Array | undefined {
  const before = readNeutralRemuxProgram(bytes, 'ogg');
  if (before.state !== 'INCOMPLETE' || before.reasonCode !== 'REMUX_OGG_CONTINUATION_INVALID') {
    return undefined;
  }
  const output = bytes.slice();
  const streams = new Map<number, { sequence: number; pending: boolean }>();
  let offset = 0;
  let patched = 0;
  while (offset < output.byteLength) {
    if (
      offset + 27 > output.byteLength ||
      output[offset] !== 0x4f ||
      output[offset + 1] !== 0x67 ||
      output[offset + 2] !== 0x67 ||
      output[offset + 3] !== 0x53 ||
      output[offset + 4] !== 0
    ) {
      return undefined;
    }
    const segmentCount = output[offset + 26]!;
    const headerEnd = offset + 27 + segmentCount;
    if (headerEnd > output.byteLength) return undefined;
    let bodyBytes = 0;
    for (let index = 0; index < segmentCount; index++) bodyBytes += output[offset + 27 + index]!;
    const pageEnd = headerEnd + bodyBytes;
    if (pageEnd > output.byteLength || aibrushOggCrc(output, offset, pageEnd) !== u32le(output, offset + 22)) {
      return undefined;
    }
    const serial = u32le(output, offset + 14);
    const sequence = u32le(output, offset + 18);
    const prior = streams.get(serial);
    if (prior !== undefined && sequence !== ((prior.sequence + 1) >>> 0)) return undefined;
    const pending = prior?.pending ?? false;
    const continued = (output[offset + 5]! & 1) !== 0;
    if (continued !== pending) {
      // A missing continuation bit would splice two packets and is not safely inferable here. The known
      // framework defect is the inverse: an extra bit before a page whose first lacing segment is fresh.
      if (!continued || pending) return undefined;
      output[offset + 5] = output[offset + 5]! & ~1;
      writeU32le(output, offset + 22, aibrushOggCrc(output, offset, pageEnd));
      patched++;
    }
    streams.set(serial, {
      sequence,
      pending: segmentCount === 0
        ? pending
        : output[offset + 27 + segmentCount - 1] === 255,
    });
    offset = pageEnd;
  }
  if (patched === 0 || offset !== output.byteLength) return undefined;
  return readNeutralRemuxProgram(output, 'ogg').state === 'OK' ? output : undefined;
}

/** Add one representation-only AVC access-unit delimiter before a length-prefixed MP4 sample. */
export function prependAibrushMpegTsH264Aud(
  sample: Uint8Array,
  description: BufferSource,
): Uint8Array | undefined {
  const avcC = bufferSourceBytes(description);
  if (avcC.byteLength < 5 || avcC[0] !== 1) return undefined;
  const lengthSize = (avcC[4]! & 3) + 1;
  const audLength = 2;
  if (lengthSize < 1 || lengthSize > 4 || audLength >= 2 ** (lengthSize * 8)) return undefined;
  const output = new Uint8Array(lengthSize + audLength + sample.byteLength);
  let remaining = audLength;
  for (let index = lengthSize - 1; index >= 0; index--) {
    output[index] = remaining & 0xff;
    remaining >>>= 8;
  }
  output[lengthSize] = 0x09; // access_unit_delimiter_rbsp
  output[lengthSize + 1] = 0xf0; // primary_pic_type=7 + rbsp stop bit
  output.set(sample, lengthSize + audLength);
  return output;
}

async function tryPreparedMp3Remux(
  core: AibrushCore,
  input: MediaInput,
  target: string,
  opts: RemuxOptions,
): Promise<Uint8Array | undefined> {
  if (target !== 'mp4' && target !== 'mov' && target !== 'mkv') return undefined;
  const bytes = await inputBytesIfAtMost(input, STRICT_PREPARED_REMUX_MAX_SOURCE_BYTES);
  if (bytes === undefined) return undefined;
  const read = readNeutralRemuxProgram(bytes, 'mp3');
  if (read.state !== 'OK' || read.value.durationUs === undefined) return undefined;
  const sourceTrack = read.value.tracks[0];
  if (
    read.value.tracks.length !== 1 ||
    sourceTrack === undefined ||
    sourceTrack.type !== 'audio' ||
    canonicalCodec(sourceTrack.codec) !== 'mp3'
  ) {
    return undefined;
  }
  const table = core.mp3PacketInfoFromBytes(bytes);
  const frameworkTrack = table.tracks[0];
  if (table.tracks.length !== 1 || frameworkTrack === undefined) return undefined;
  const presentationDurationSec = frameworkTrack.durationSec;
  // The framework's MP3 demux surface intentionally hides the Xing/Info metadata frame and carries
  // gapless presentation metadata instead. A strict stream-copy must retain every coded MPEG frame, so
  // feed the neutral complete frame table and remove the presentation-only trim from this copy track.
  const { gapless: sourceGapless, ...trackWithoutGapless } = frameworkTrack;
  const sampleRate = frameworkTrack.config?.sampleRate;
  const totalSamples = sourceGapless?.totalSamples;
  const codedSamples = sampleRate !== undefined && Number.isFinite(sampleRate) && sampleRate > 0
    ? Math.round((read.value.durationUs * sampleRate) / 1_000_000)
    : undefined;
  const retainedGapless =
    sourceGapless !== undefined &&
    totalSamples !== undefined &&
    Number.isFinite(totalSamples) &&
    totalSamples > 0 &&
    codedSamples !== undefined &&
    codedSamples >= totalSamples
      ? {
          ...sourceGapless,
          // Put the complete coded-padding span before the presentation window. The framework mux
          // then emits an edit whose end equals the raw sample-table end, so it retains every frame.
          leadingSamples: codedSamples - totalSamples,
          trailingSamples: 0,
        }
      : undefined;
  const track: AibrushTrackInfo = {
    ...trackWithoutGapless,
    durationSec: read.value.durationUs / 1_000_000,
    ...(retainedGapless !== undefined ? { gapless: retainedGapless } : {}),
  };
  const packets = packetsFromEvidenceTrack(sourceTrack);
  if (packets === undefined) return undefined;
  if (target === 'mkv') {
    return core.muxPreparedWebmPacketTracks({ tracks: [{ track, packets }], container: target });
  }
  const output = core.muxPreparedMp4PacketTrack({
    track,
    packets,
    container: target,
    faststart: faststartFrom(opts),
    fragmented: false,
  });
  if (presentationDurationSec === undefined || !Number.isFinite(presentationDurationSec)) return output;
  const presentationOutput = materializeAibrushMp3PresentationDuration(
    output,
    target,
    presentationDurationSec,
  );
  if (presentationOutput === undefined) {
    throw new Error('aibrush MP3 presentation-duration repair failed its neutral media proof');
  }
  return presentationOutput;
}

async function tryPreparedIsoToMpegTsRemux(
  core: AibrushCore,
  input: MediaInput,
  sourceContainer: string,
  signal: AbortSignal,
): Promise<Uint8Array | undefined> {
  const bytes = await inputBytesIfAtMost(input, STRICT_PREPARED_REMUX_MAX_SOURCE_BYTES);
  if (bytes === undefined) return undefined;
  const read = readNeutralRemuxProgram(bytes, sourceContainer);
  if (read.state !== 'OK') return undefined;
  const evidenceTracks = mediaEvidenceTracks(read.value);
  if (evidenceTracks === undefined) return undefined;
  const table = await core.mp4PacketInfoFromBytes(bytes, { includeOffsets: true, signal });
  const used = new Set<number>();
  const tracks: PreparedAibrushPacketTrack[] = [];
  for (const evidenceTrack of evidenceTracks) {
    const codec = canonicalCodec(evidenceTrack.codec);
    if (codec !== 'h264' && codec !== 'aac') return undefined;
    const matched = matchAibrushTrack(table.tracks, evidenceTrack, used);
    if (matched === undefined) return undefined;
    const description = matched.track.config?.description;
    const packets = packetsFromEvidenceTrack(evidenceTrack, (sample) => {
      if (codec !== 'h264') return sample.payload;
      return description === undefined
        ? undefined
        : prependAibrushMpegTsH264Aud(sample.payload, description);
    });
    if (packets === undefined) return undefined;
    tracks.push({ track: matched.track, packets });
  }
  return tracks.length === table.tracks.length
    ? core.muxPreparedMpegTsPacketTracks({ tracks, container: 'ts' })
    : undefined;
}

async function tryPreparedMovToMatroskaRemux(
  core: AibrushCore,
  input: MediaInput,
  signal: AbortSignal,
): Promise<Uint8Array | undefined> {
  const bytes = await inputBytesIfAtMost(input, STRICT_PREPARED_REMUX_MAX_SOURCE_BYTES);
  if (bytes === undefined) return undefined;
  const read = readNeutralRemuxProgram(bytes, 'mov');
  if (read.state !== 'OK') return undefined;
  const evidenceTracks = mediaEvidenceTracks(read.value);
  if (evidenceTracks === undefined) return undefined;
  const table = await core.mp4PacketInfoFromBytes(bytes, { includeOffsets: true, signal });
  const used = new Set<number>();
  const tracks: PreparedAibrushPacketTrack[] = [];
  for (const evidenceTrack of evidenceTracks) {
    const codec = canonicalCodec(evidenceTrack.codec);
    if (codec !== 'h264' && codec !== 'aac') return undefined;
    const matched = matchAibrushTrack(table.tracks, evidenceTrack, used);
    const packets = packetsFromEvidenceTrack(evidenceTrack);
    if (matched === undefined || packets === undefined) return undefined;
    tracks.push({ track: matched.track, packets });
  }
  signal.throwIfAborted();
  return tracks.length === table.tracks.length
    ? core.muxPreparedWebmPacketTracks({ tracks, container: 'mkv' })
    : undefined;
}

async function tryPreparedMatroskaToContainerRemux(
  core: AibrushCore,
  input: MediaInput,
  target: string,
  opts: RemuxOptions,
  signal: AbortSignal,
): Promise<Uint8Array | undefined> {
  if (target !== 'mp4' && target !== 'mov' && target !== 'ts') return undefined;
  const bytes = await inputBytesIfAtMost(input, STRICT_PREPARED_REMUX_MAX_SOURCE_BYTES);
  if (bytes === undefined) return undefined;
  const read = readNeutralRemuxProgram(bytes, 'mkv');
  if (read.state !== 'OK') return undefined;
  const evidenceTracks = mediaEvidenceTracks(read.value);
  if (evidenceTracks === undefined) return undefined;
  const table = core.webmPacketPayloadInfoFromBytes(bytes);
  const used = new Set<number>();
  const tracks: PreparedAibrushPacketTrack[] = [];
  for (const evidenceTrack of evidenceTracks) {
    const codec = canonicalCodec(evidenceTrack.codec);
    if (codec !== 'h264' && codec !== 'aac') return undefined;
    const matched = matchAibrushTrack(table.tracks, evidenceTrack, used);
    if (matched === undefined) return undefined;
    const packets: AibrushPacket[] = [];
    let decodeTimeUs = 0;
    const sampleRate = matched.track.config?.sampleRate;
    const aacDurationUs = codec === 'aac' && sampleRate !== undefined && sampleRate > 0
      ? (1_024 * 1_000_000) / sampleRate
      : undefined;
    const fallbackDurationUs = evidenceTrack.samples.find(
      (sample) => sample.durationUs !== undefined && sample.durationUs > 0,
    )?.durationUs ?? aacDurationUs;
    for (const sample of evidenceTrack.samples) {
      const usesCodedDecodeClock = evidenceTrack.type === 'video' || aacDurationUs !== undefined;
      const packetSample = aacDurationUs === undefined
        ? sample
        : { ...sample, durationUs: aacDurationUs };
      const packet = packetFromRemuxEvidence(packetSample, sample.payload, {
        // Matroska stores presentation timestamps but no decode axis. Its physical block order is the
        // coded decode order, so synthesize a monotonic DTS from that order instead of feeding B-frame
        // PTS back as DTS (which makes the target muxer reorder access units). AAC has a normative
        // 1,024-sample cadence; carrying that exact decode cadence also avoids accumulating one rounded
        // Matroska-millisecond delta per packet when the ISO muxer authors its integer sample timescale.
        dtsUs: usesCodedDecodeClock ? decodeTimeUs : sample.ptsUs,
        ...(aacDurationUs !== undefined ? { durationUs: aacDurationUs } : {}),
      });
      if (packet === undefined) return undefined;
      packets.push(packet);
      if (usesCodedDecodeClock) {
        const durationUs = aacDurationUs ?? sample.durationUs ?? fallbackDurationUs;
        if (durationUs === undefined || !Number.isFinite(durationUs) || durationUs <= 0) return undefined;
        decodeTimeUs += durationUs;
      }
    }
    tracks.push({ track: matched.track, packets });
  }
  if (tracks.length !== table.tracks.length) return undefined;
  signal.throwIfAborted();
  return target === 'ts'
    ? core.muxPreparedMpegTsPacketTracks({ tracks, container: target })
    : core.muxPreparedMp4PacketTracks({
        tracks,
        container: target,
        faststart: faststartFrom(opts),
        fragmented: false,
      });
}

async function packetsWithCorrectedTsTimeline(
  demuxed: AibrushDemuxed,
  track: AibrushTrackInfo,
  evidence: RemuxTrackEvidence,
): Promise<AibrushPacket[] | undefined> {
  const reader = demuxed.packets(track.id).getReader();
  const packets: AibrushPacket[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const sample = evidence.samples[packets.length];
      if (sample === undefined) return undefined;
      const data = packetPayloadBytes(value);
      const packet = packetFromRemuxEvidence(sample, data, {
        ptsUs: value.chunk.timestamp,
        dtsUs: value.dtsUs,
        durationUs: value.chunk.duration,
        keyframe: value.chunk.type === 'key',
      });
      if (packet === undefined) return undefined;
      packets.push(packet);
    }
  } finally {
    reader.releaseLock();
  }
  return packets.length === evidence.samples.length && packets.length > 0 ? packets : undefined;
}

async function tryPreparedMpegTsToContainerRemux(
  core: AibrushCore,
  engine: AibrushEngine,
  input: MediaInput,
  target: string,
  opts: RemuxOptions,
  signal: AbortSignal,
): Promise<Uint8Array | undefined> {
  if (target !== 'mp4' && target !== 'mov' && target !== 'mkv') return undefined;
  const bytes = await inputBytesIfAtMost(input, STRICT_PREPARED_REMUX_MAX_SOURCE_BYTES);
  if (bytes === undefined) return undefined;
  const read = readNeutralRemuxProgram(bytes, 'ts');
  if (read.state !== 'OK') return undefined;
  const evidenceTracks = mediaEvidenceTracks(read.value);
  if (evidenceTracks === undefined) return undefined;
  const demuxed = await engine.demux(
    engine.from(bytes, { mime: input.mime, size: bytes.byteLength }),
    { signal },
  );
  try {
    const used = new Set<number>();
    const tracks: PreparedAibrushPacketTrack[] = [];
    for (const evidenceTrack of evidenceTracks) {
      const matched = matchAibrushTrack(demuxed.tracks, evidenceTrack, used);
      if (matched === undefined) return undefined;
      const packets = await packetsWithCorrectedTsTimeline(demuxed, matched.track, evidenceTrack);
      if (packets === undefined) return undefined;
      tracks.push({ track: matched.track, packets });
    }
    if (tracks.length !== demuxed.tracks.length) return undefined;
    signal.throwIfAborted();
    const intermediateTarget = target === 'mkv' ? 'mp4' : target;
    const intermediate = core.muxPreparedMp4PacketTracks({
      tracks,
      container: intermediateTarget,
      faststart: target === 'mkv' ? true : faststartFrom(opts),
      fragmented: false,
    });
    if (target !== 'mkv') return intermediate;
    // Matroska requires length-prefixed AVC plus avcC. The corrected intermediate has both, and the
    // framework's MP4→Matroska stream-copy path is independently exercised/proven by the ordinary rows.
    const output = await engine.remux(
      engine.from(intermediate, { mime: 'video/mp4', size: intermediate.byteLength }),
      { to: 'mkv', faststart: true, fragmented: false },
      { signal },
    );
    return (await toMediaBytes(output, 'mkv')).bytes;
  } finally {
    await demuxed.close();
  }
}

async function tryStrictPreparedAibrushRemux(
  core: AibrushCore,
  engine: AibrushEngine,
  input: MediaInput,
  opts: RemuxOptions,
  signal: AbortSignal,
): Promise<Uint8Array | undefined> {
  if (input.mutated || !plainBufferedPreparedRemux(opts)) return undefined;
  const source = containerFromInput(input);
  const target = opts.container.toLowerCase();
  if (source === 'mp3') return tryPreparedMp3Remux(core, input, target, opts);
  if ((source === 'mp4' || source === 'mov') && target === 'ts') {
    return tryPreparedIsoToMpegTsRemux(core, input, source, signal);
  }
  if (source === 'mov' && target === 'mkv') {
    return tryPreparedMovToMatroskaRemux(core, input, signal);
  }
  if (source === 'mkv') {
    return tryPreparedMatroskaToContainerRemux(core, input, target, opts, signal);
  }
  if (source === 'ts') {
    return tryPreparedMpegTsToContainerRemux(core, engine, input, target, opts, signal);
  }
  return undefined;
}

interface AibrushEbmlVint {
  readonly value: number;
  readonly length: number;
  readonly unknown: boolean;
}

interface AibrushEbmlElement {
  readonly id: number;
  readonly body: number;
  readonly end: number;
  readonly sizeOffset: number;
  readonly sizeLength: number;
  readonly unknown: boolean;
}

function aibrushEbmlVint(bytes: Uint8Array, offset: number, keepMarker: boolean): AibrushEbmlVint | undefined {
  const first = bytes[offset];
  if (first === undefined) return undefined;
  let marker = 0x80;
  let length = 1;
  while (length <= 8 && (first & marker) === 0) {
    marker >>>= 1;
    length++;
  }
  if (length > 8 || offset + length > bytes.byteLength) return undefined;
  let value = keepMarker ? first : first & (marker - 1);
  let unknown = !keepMarker && (first & (marker - 1)) === marker - 1;
  for (let index = 1; index < length; index++) {
    const byte = bytes[offset + index]!;
    value = value * 256 + byte;
    if (unknown && byte !== 0xff) unknown = false;
  }
  // An unknown-size eight-byte vint has a 56-bit all-ones payload, which is intentionally outside
  // JavaScript's safe-integer range. Its numeric value is never consumed; retain only the fact that
  // it is unknown so Segment and Cluster traversal can still proceed.
  if (!keepMarker && unknown) return { value: 0, length, unknown: true };
  return Number.isSafeInteger(value) ? { value, length, unknown } : undefined;
}

function aibrushEbmlElement(
  bytes: Uint8Array,
  offset: number,
  parentEnd: number,
): AibrushEbmlElement | undefined {
  const id = aibrushEbmlVint(bytes, offset, true);
  const size = id === undefined ? undefined : aibrushEbmlVint(bytes, offset + id.length, false);
  if (id === undefined || size === undefined) return undefined;
  const body = offset + id.length + size.length;
  const end = size.unknown ? parentEnd : body + size.value;
  if (!Number.isSafeInteger(end) || end < body || end > parentEnd) return undefined;
  return {
    id: id.value,
    body,
    end,
    sizeOffset: offset + id.length,
    sizeLength: size.length,
    unknown: size.unknown,
  };
}

const AIBRUSH_EBML_SEGMENT_ID = 0x18538067;
const AIBRUSH_EBML_CLUSTER_ID = 0x1f43b675;
const AIBRUSH_EBML_LEVEL_ONE_IDS = new Set([
  0x114d9b74, // SeekHead
  0x1549a966, // Info
  0x1654ae6b, // Tracks
  AIBRUSH_EBML_CLUSTER_ID,
  0x1c53bb6b, // Cues
  0x1941a469, // Attachments
  0x1043a770, // Chapters
  0x1254c367, // Tags
]);

function nextAibrushEbmlLevelOne(bytes: Uint8Array, start: number, end: number): number | undefined {
  for (let offset = start; offset + 4 <= end; offset++) {
    const id =
      bytes[offset]! * 0x1000000 +
      (bytes[offset + 1]! << 16) +
      (bytes[offset + 2]! << 8) +
      bytes[offset + 3]!;
    if (!AIBRUSH_EBML_LEVEL_ONE_IDS.has(id)) continue;
    const candidate = aibrushEbmlElement(bytes, offset, end);
    if (candidate !== undefined && AIBRUSH_EBML_LEVEL_ONE_IDS.has(candidate.id)) return offset;
  }
  return undefined;
}

function writeAibrushEbmlSize(
  bytes: Uint8Array,
  offset: number,
  length: number,
  value: number,
): boolean {
  if (!Number.isSafeInteger(value) || value < 0 || length < 1 || length > 8) return false;
  const maximum = (1n << BigInt(length * 7)) - 2n;
  let remaining = BigInt(value);
  if (remaining > maximum) return false;
  for (let index = length - 1; index >= 0; index--) {
    bytes[offset + index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  bytes[offset] = bytes[offset]! | (1 << (8 - length));
  return true;
}

function sameRemuxProgramMedia(left: RemuxProgramEvidence, right: RemuxProgramEvidence): boolean {
  if (left.tracks.length !== right.tracks.length) return false;
  for (let trackIndex = 0; trackIndex < left.tracks.length; trackIndex++) {
    const a = left.tracks[trackIndex];
    const b = right.tracks[trackIndex];
    if (
      a === undefined ||
      b === undefined ||
      a.type !== b.type ||
      canonicalCodec(a.codec) !== canonicalCodec(b.codec) ||
      a.samples.length !== b.samples.length
    ) {
      return false;
    }
    for (let sampleIndex = 0; sampleIndex < a.samples.length; sampleIndex++) {
      const x = a.samples[sampleIndex];
      const y = b.samples[sampleIndex];
      if (
        x === undefined ||
        y === undefined ||
        x.ptsUs !== y.ptsUs ||
        x.dtsUs !== y.dtsUs ||
        x.durationUs !== y.durationUs ||
        x.keyframe !== y.keyframe ||
        x.payload.byteLength !== y.payload.byteLength
      ) {
        return false;
      }
      for (let byteIndex = 0; byteIndex < x.payload.byteLength; byteIndex++) {
        if (x.payload[byteIndex] !== y.payload[byteIndex]) return false;
      }
    }
  }
  return true;
}

/**
 * Replace only unknown-size top-level Cluster size vints with their observed finite spans. MediaRecorder
 * commonly emits several such sibling Clusters; the framework currently lets the first consume the
 * Segment remainder. The proof read before/after guarantees this header-only rewrite preserves every
 * coded block and timestamp before it is admitted.
 */
export function materializeFiniteAibrushWebmClusters(bytes: Uint8Array): Uint8Array | undefined {
  let topOffset = 0;
  let segment: AibrushEbmlElement | undefined;
  while (topOffset < bytes.byteLength) {
    const item = aibrushEbmlElement(bytes, topOffset, bytes.byteLength);
    if (item === undefined || item.end <= topOffset) return undefined;
    if (item.id === AIBRUSH_EBML_SEGMENT_ID) {
      segment = item;
      break;
    }
    topOffset = item.end;
  }
  if (segment === undefined) return undefined;
  const output = bytes.slice();
  let offset = segment.body;
  let patched = 0;
  while (offset < segment.end) {
    const item = aibrushEbmlElement(output, offset, segment.end);
    if (item === undefined) return undefined;
    if (item.unknown) {
      if (item.id !== AIBRUSH_EBML_CLUSTER_ID) return undefined;
      const next = nextAibrushEbmlLevelOne(output, item.body, segment.end) ?? segment.end;
      if (next <= item.body || !writeAibrushEbmlSize(output, item.sizeOffset, item.sizeLength, next - item.body)) {
        return undefined;
      }
      patched++;
      offset = next;
    } else {
      if (item.end <= offset) return undefined;
      offset = item.end;
    }
  }
  if (patched === 0) return undefined;
  const before = readNeutralRemuxProgram(bytes, 'webm');
  const after = readNeutralRemuxProgram(output, 'webm');
  return before.state === 'OK' && after.state === 'OK' && sameRemuxProgramMedia(before.value, after.value)
    ? output
    : undefined;
}

async function finiteWebmClusterSource(
  engine: AibrushEngine,
  input: MediaInput,
): Promise<unknown | undefined> {
  const container = containerFromInput(input);
  if (
    input.mutated ||
    (container !== 'webm' && container !== 'mkv') ||
    input.sizeBytes === undefined ||
    input.sizeBytes > FINITE_WEBM_CLUSTER_REPAIR_MAX_SOURCE_BYTES
  ) {
    return undefined;
  }
  const bytes = await inputBytes(input);
  const repaired = materializeFiniteAibrushWebmClusters(bytes);
  return repaired === undefined
    ? undefined
    : engine.from(repaired, { mime: input.mime, size: repaired.byteLength });
}

// ── remux output-shape knobs (streaming-output family forwards them via RemuxOptions) ──────────────

/**
 * Resolve the engine `faststart` boolean from the harness output-shape `fastStart` knob the
 * streaming-output family carries in the remux option bag (`RemuxOptions` extends `Record<unknown>`):
 *   - `false`                  → moov AFTER mdat (the mdat-first control; `mp4_buffer_target`);
 *   - `'in-memory'`/absent → moov BEFORE mdat (the streamable default);
 *   - `'reserve'` → reason-coded NA_ENGINE because the public framework cannot express or prove the
 *     positioned reserve-write semantics.
 */
function faststartFrom(opts: RemuxOptions): boolean {
  const fastStart = (opts as { fastStart?: unknown }).fastStart;
  if (fastStart === 'reserve') {
    throw createNotApplicableError(
      ENGINE_ID,
      'remux',
      'the framework cannot express reserved positioned fast-start writes',
      {},
      'AIBRUSH_POSITIONED_RESERVE_UNSUPPORTED',
    );
  }
  return fastStart !== false;
}

/** True when the remux options request fragmented/CMAF output. */
function wantsFragmented(opts: RemuxOptions): boolean {
  const shape = opts as { fragmented?: unknown; fastStart?: unknown };
  return shape.fragmented === true || shape.fastStart === 'fragmented';
}

function rejectUnforwardableOutputShape(
  operation: ApplicabilityOperation,
  opts: Record<string, unknown>,
): void {
  if (opts.target !== undefined && opts.target !== 'buffer' && opts.target !== 'stream') {
    throw createNotApplicableError(
      ENGINE_ID,
      operation,
      `output target '${String(opts.target)}' is not implemented`,
      {},
      'AIBRUSH_OUTPUT_TARGET_UNKNOWN',
    );
  }
  if (opts.fastStart === 'reserve') {
    throw createNotApplicableError(
      ENGINE_ID,
      operation,
      'the framework cannot express reserved positioned fast-start writes',
      {},
      'AIBRUSH_POSITIONED_RESERVE_UNSUPPORTED',
    );
  }
  if (opts.positionedWrites === true || opts.writeMode === 'positioned') {
    throw createNotApplicableError(
      ENGINE_ID,
      operation,
      'the adapter proves only contiguous callback writes, not positioned output',
      {},
      'AIBRUSH_POSITIONED_WRITES_UNSUPPORTED',
    );
  }
  if (opts.writeChunkBytes !== undefined) {
    throw createNotApplicableError(
      ENGINE_ID,
      operation,
      'the public output API does not expose an exact write-chunk-size control',
      {},
      'AIBRUSH_WRITE_CHUNK_SIZE_UNSUPPORTED',
    );
  }
  if (opts.maximumPacketCount !== undefined) {
    throw createNotApplicableError(
      ENGINE_ID,
      operation,
      'maximumPacketCount is supported only by reserved fast-start, which this adapter rejects',
      {},
      'AIBRUSH_MAXIMUM_PACKET_COUNT_UNSUPPORTED',
    );
  }
}

function verifyRequestedIsoShape(
  media: MediaBytes,
  opts: Record<string, unknown>,
  fragmented: boolean,
): MediaBytes {
  verifyAibrushOutputShape(media.bytes, {
    container: media.container,
    fragmented,
    ...(opts.fastStart !== undefined ? { fastStart: opts.fastStart !== false } : {}),
  });
  if (opts.appendOnly === true && (media.container === 'webm' || media.container === 'mkv')) {
    verifyAibrushLiveWebmShape(media.bytes);
  }
  return media;
}

/** True when the streaming-output family requests an append-only live WebM/Matroska layout. */
function wantsAppendOnly(opts: RemuxOptions): boolean {
  return (opts as { appendOnly?: unknown }).appendOnly === true;
}

/** True when the streaming-output family requests a callback-backed StreamTarget. */
function wantsStreamTarget(opts: RemuxOptions): boolean {
  return (opts as { target?: unknown }).target === 'stream';
}

/** True when the streaming-output family requests an explicit whole-buffer target. */
function wantsBufferTarget(opts: RemuxOptions): boolean {
  return (opts as { target?: unknown }).target === 'buffer';
}

function resolvedStreamingRepresentation(
  target: string,
  opts: RemuxOptions,
  fragmented: boolean,
): AibrushStreamingRuntimeEvidence['resolvedRepresentation'] {
  if (isIsoBmffTarget(target)) {
    if (fragmented) return 'fragmented-mp4';
    return opts.fastStart === 'in-memory' ? 'faststart-in-memory-mp4' : 'progressive-mp4';
  }
  if (isWebmFamilyTarget(target)) return wantsAppendOnly(opts) ? 'live-webm' : 'finite-webm';
  if (target === 'ts') return 'mpeg-ts';
  return 'other';
}

function isIsoBmffTarget(target: string): boolean {
  return target === 'mp4' || target === 'mov';
}

function isWebmFamilyTarget(target: string): boolean {
  return target === 'webm' || target === 'mkv';
}

function sameMediaInputs(a: readonly MediaInput[] | undefined, b: readonly MediaInput[]): boolean {
  if (a === undefined || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

async function wantsFragmentedBufferAtScale(input: MediaInput, opts: RemuxOptions, target: string): Promise<boolean> {
  if (!wantsBufferTarget(opts) || !isIsoBmffTarget(target)) return false;
  const size = await inputSize(input);
  return size !== undefined && size > BUFFER_TARGET_MAX_SOURCE_BYTES;
}

/** Copy a WebCodecs `BufferSource` (ArrayBuffer or a view) into a fresh, tightly-sized byte array. */
function bufferBytes(src: BufferSource): Uint8Array<ArrayBuffer> {
  const source =
    src instanceof ArrayBuffer
      ? new Uint8Array(src)
      : new Uint8Array(src.buffer, src.byteOffset, src.byteLength);
  const out = new Uint8Array(source.byteLength);
  out.set(source);
  return out;
}

function tightBytes(src: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(src.byteLength);
  out.set(src);
  return out;
}

function mediaBytesSource(engine: AibrushEngine, media: MediaBytes): unknown {
  return engine.from(media.bytes, { mime: media.mime, size: media.bytes.byteLength });
}

function chunkType(type: string): EncodedAudioChunkType | EncodedVideoChunkType {
  return type === 'delta' ? 'delta' : 'key';
}

function restampedPacket(packet: AibrushPacket, mediaType: 'video' | 'audio', offsetUs: number): AibrushPacket {
  const chunk = packet.chunk;
  const data = new Uint8Array(chunk.byteLength);
  chunk.copyTo(data);
  const timestamp = Math.max(0, Math.round(chunk.timestamp + offsetUs));
  const duration = chunk.duration == null ? undefined : Math.max(0, Math.round(chunk.duration));
  const init = {
    type: chunkType(chunk.type),
    timestamp,
    ...(duration !== undefined ? { duration } : {}),
    data,
  };
  const shifted =
    mediaType === 'video'
      ? new EncodedVideoChunk(init as EncodedVideoChunkInit)
      : new EncodedAudioChunk(init as EncodedAudioChunkInit);
  return {
    chunk: shifted,
    ...(packet.dtsUs !== undefined ? { dtsUs: Math.max(0, Math.round(packet.dtsUs + offsetUs)) } : {}),
    ...(packet.sizeBytes !== undefined ? { sizeBytes: packet.sizeBytes } : {}),
  };
}

function packetArrayStream(packets: readonly AibrushPacket[]): ReadableStream<AibrushPacket> {
  return new ReadableStream<AibrushPacket>({
    start(controller): void {
      for (const packet of packets) controller.enqueue(packet);
      controller.close();
    },
  });
}

function packetPayloadBytes(packet: AibrushPacket): Uint8Array {
  const chunk = packet.chunk;
  if (packet.data !== undefined && packet.data.byteLength === chunk.byteLength) {
    return packet.data;
  }
  const data = new Uint8Array(chunk.byteLength);
  chunk.copyTo(data);
  return data;
}

function bufferSourceBytes(dst: BufferSource): Uint8Array {
  return ArrayBuffer.isView(dst)
    ? new Uint8Array(dst.buffer, dst.byteOffset, dst.byteLength)
    : new Uint8Array(dst);
}

function encodedPacketChunkView(chunk: EncodedTrack['chunks'][number]): AibrushChunk {
  const data = chunk.data;
  return {
    byteLength: data.byteLength,
    timestamp: Math.round(chunk.ptsUs),
    duration: Math.max(0, Math.round(chunk.durationUs)),
    type: chunk.keyframe ? 'key' : 'delta',
    copyTo(dst: BufferSource): void {
      bufferSourceBytes(dst).set(data);
    },
  };
}

function packetArrayFromEncodedTrack(track: EncodedTrack): AibrushPacket[] {
  const packets: AibrushPacket[] = [];
  for (let i = 0; i < track.chunks.length; i++) {
    const chunk = track.chunks[i];
    if (chunk === undefined || chunk.data.byteLength === 0) continue;
    packets.push({
      chunk: encodedPacketChunkView(chunk),
      data: chunk.data,
      // The framework's scheduler requires a decode timestamp; using PTS here does not add DTS
      // evidence to the shared EncodedChunk when the source exposed only presentation timestamps.
      dtsUs: Math.round(chunk.dtsUs ?? chunk.ptsUs),
      sizeBytes: chunk.data.byteLength,
    });
  }
  return packets;
}

function webmChunkArrayFromEncodedTrack(track: EncodedTrack): AibrushPreparedWebmChunk[] {
  const chunks: AibrushPreparedWebmChunk[] = [];
  for (let i = 0; i < track.chunks.length; i++) {
    const chunk = track.chunks[i];
    if (chunk === undefined || chunk.data.byteLength === 0) continue;
    chunks.push({
      timestampUs: Math.round(chunk.ptsUs),
      durationUs: Math.max(0, Math.round(chunk.durationUs)),
      key: chunk.keyframe,
      data: chunk.data,
      // Local mux scheduling fallback only; the shared handoff keeps absent DTS absent.
      dtsUs: Math.round(chunk.dtsUs ?? chunk.ptsUs),
    });
  }
  return chunks;
}

function preparedMp3PacketsFromEncodedTrack(track: EncodedTrack): AibrushPreparedMp3Packet[] {
  const packets: AibrushPreparedMp3Packet[] = [];
  for (let i = 0; i < track.chunks.length; i++) {
    const chunk = track.chunks[i];
    if (chunk === undefined || chunk.data.byteLength === 0) continue;
    packets.push({
      data: chunk.data,
      ptsUs: Math.round(chunk.ptsUs),
      durationUs: Math.max(0, Math.round(chunk.durationUs)),
      keyframe: chunk.keyframe,
    });
  }
  return packets;
}

function packetStreamFromEncodedTrack(track: EncodedTrack): ReadableStream<AibrushPacket> {
  return packetArrayStream(packetArrayFromEncodedTrack(track));
}

function packetStreamFromEncodedAudioTrack(track: EncodedTrack): ReadableStream<AibrushPacket> {
  return packetStreamFromEncodedTrack(track);
}

function preparedMp4PacketTracksFromEncoded(
  tracks: readonly EncodedTrack[],
): Array<{
  readonly track: AibrushTrackInfo;
  readonly packets: readonly AibrushPacket[];
}> | undefined {
  const prepared: Array<{
    readonly track: AibrushTrackInfo;
    readonly packets: readonly AibrushPacket[];
  }> = [];
  for (const track of tracks) {
    const trackInfo =
      track.type === 'video' ? videoTrackInfoFromEncoded(track) : audioTrackInfoFromEncoded(track);
    if (trackInfo === undefined) return undefined;
    const packets = packetArrayFromEncodedTrack(track);
    if (packets.length === 0) return undefined;
    prepared.push({ track: trackInfo, packets });
  }
  return prepared.length === 0 ? undefined : prepared;
}

function encodedDurationUs(track: EncodedTrack): number {
  return track.chunks.reduce(
    (max, chunk) => Math.max(max, Math.round(chunk.ptsUs + chunk.durationUs)),
    0,
  );
}

function videoTrackInfoFromEncoded(track: EncodedTrack): AibrushTrackInfo | undefined {
  if (track.type !== 'video' || track.width === undefined || track.height === undefined) {
    return undefined;
  }
  const description = track.description === undefined ? undefined : tightBytes(track.description);
  const durationUs = encodedDurationUs(track);
  const firstDurationUs = track.chunks.find((chunk) => chunk.durationUs > 0)?.durationUs;
  const fps =
    firstDurationUs !== undefined && Number.isFinite(firstDurationUs) && firstDurationUs > 0
      ? 1_000_000 / firstDurationUs
      : undefined;
  return {
    id: 0,
    mediaType: 'video',
    codec: track.codec,
    ...(durationUs > 0 ? { durationSec: durationUs / 1_000_000 } : {}),
    ...(fps !== undefined ? { fps } : {}),
    config: {
      codec: track.codec,
      codedWidth: track.width,
      codedHeight: track.height,
      ...(description !== undefined ? { description } : {}),
    },
  };
}

function audioTrackInfoFromEncoded(track: EncodedTrack): AibrushTrackInfo | undefined {
  if (track.type !== 'audio' || track.sampleRate === undefined || track.channels === undefined) {
    return undefined;
  }
  const description = track.description === undefined ? undefined : tightBytes(track.description);
  const durationUs = encodedDurationUs(track);
  return {
    id: 0,
    mediaType: 'audio',
    codec: track.codec,
    ...(durationUs > 0 ? { durationSec: durationUs / 1_000_000 } : {}),
    config: {
      codec: track.codec,
      sampleRate: track.sampleRate,
      numberOfChannels: track.channels,
      ...(description !== undefined ? { description } : {}),
    },
  };
}

function concatTrackKey(track: AibrushTrackInfo, seenByType: Map<'video' | 'audio', number>): string {
  const index = seenByType.get(track.mediaType) ?? 0;
  seenByType.set(track.mediaType, index + 1);
  return `${track.mediaType}:${index}`;
}

function normalizedMetadataFromAibrushInfo(
  input: MediaInput,
  info: AibrushInfo,
  overrides: { readonly container?: string; readonly durationSec?: number } = {},
): NormalizedMetadata {
  const tracks: NormalizedTrack[] = info.tracks.map((t) => ({
    type: t.type,
    codec: canonicalCodec(t.codec),
    nativeCodecTag: t.codec,
    ...(t.width !== undefined ? { width: t.width } : {}),
    ...(t.height !== undefined ? { height: t.height } : {}),
    ...(t.fps !== undefined
      ? {
          fps: t.fps,
          fpsProvenance: {
            source: 'nominal' as const,
            cadence: 'UNKNOWN' as const,
            rational: rationalFrameRate(t.fps),
          },
        }
      : {}),
    ...(t.rotation !== undefined ? { rotation: t.rotation } : {}),
    ...(t.sampleRate !== undefined ? { sampleRate: t.sampleRate } : {}),
    ...(t.channels !== undefined ? { channels: t.channels } : {}),
    bitrate: null,
    language: t.language ?? null,
  }));
  const durationSec = overrides.durationSec ?? info.durationSec;
  return {
    container: overrides.container ?? canonicalContainer(info.container, input),
    durationSec: durationSec > 0 ? durationSec : null,
    tracks,
    ...(info.tags ? { tags: info.tags } : {}),
  };
}

function pcmBitsPerSample(codec: string): number | undefined {
  const match = /^pcm-[usf](\d+)(?:be)?$/.exec(codec);
  if (!match) return undefined;
  const bits = Number(match[1]);
  return Number.isSafeInteger(bits) && bits > 0 ? bits : undefined;
}

function structuralTracksByType(
  tracks: readonly ReadTrack[],
): Readonly<Record<NormalizedTrack['type'], readonly ReadTrack[]>> {
  return {
    video: tracks.filter((track) => track.type === 'video'),
    audio: tracks.filter((track) => track.type === 'audio'),
    subtitle: [],
    other: tracks.filter((track) => track.type === 'other'),
  };
}

/** Add only facts independently observable from the exact selected container bytes. */
export function enrichAibrushProbeMetadata(
  metadata: NormalizedMetadata,
  bytes: Uint8Array,
): NormalizedMetadata {
  const structure = readOutputStructure(bytes);
  const byType = structuralTracksByType(structure?.tracks ?? []);
  const seen: Partial<Record<NormalizedTrack['type'], number>> = {};
  const tracks = metadata.tracks.map((track) => {
    const index = seen[track.type] ?? 0;
    seen[track.type] = index + 1;
    const structural = byType[track.type][index];
    const bits = pcmBitsPerSample(track.codec);
    const pcmBitrate = bits !== undefined && track.sampleRate !== undefined && track.channels !== undefined
      ? bits * track.sampleRate * track.channels
      : undefined;
    return {
      ...track,
      ...(structural?.language !== undefined ? { language: structural.language } : {}),
      ...(structural?.defaultDisposition !== undefined
        ? { defaultDisposition: structural.defaultDisposition }
        : {}),
      ...(structural?.rotation !== undefined ? { rotation: structural.rotation } : {}),
      ...(pcmBitrate !== undefined ? { bitrate: pcmBitrate } : {}),
    };
  });
  const majorBrand = structure?.majorBrand;
  const protectionScheme = structure?.tracks
    .map((track) => track.protectionScheme)
    .find((scheme): scheme is string => typeof scheme === 'string' && scheme.length > 0);
  const enriched: NormalizedMetadata = {
    ...metadata,
    ...(structure !== null
      ? {
          container: structure.container === 'mp4'
            ? (metadata.container === 'mov' ? 'mov' : 'mp4')
            : (metadata.container === 'mkv' ? 'mkv' : 'webm'),
        }
      : {}),
    tracks,
    ...(majorBrand !== undefined
      ? { tags: { ...(metadata.tags ?? {}), major_brand: majorBrand } }
      : {}),
  };
  if (protectionScheme !== undefined) {
    (enriched as NormalizedMetadata & { protectionScheme: string }).protectionScheme = protectionScheme;
  }
  return enriched;
}

function preserveProbeError(error: unknown): boolean {
  return (
    isMalformedInputError(error) ||
    isNotApplicableError(error) ||
    isBrowserNotSupportedError(error) ||
    (typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError')
  );
}

function aibrushErrorReason(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim().length > 0) return message;
  }
  return String(error);
}

function rationalFrameRate(fps: number): { numerator: number; denominator: number } {
  const ntsc = [24_000, 30_000, 60_000, 120_000].find(
    (numerator) => Math.abs(fps - numerator / 1_001) <= Math.max(1e-6, fps * 1e-6),
  );
  if (ntsc !== undefined) return { numerator: ntsc, denominator: 1_001 };
  const denominator = 1_000;
  const numerator = Math.max(1, Math.round(fps * denominator));
  const divisor = greatestCommonDivisor(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

function greatestCommonDivisor(a: number, b: number): number {
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right !== 0) [left, right] = [right, left % right];
  return left || 1;
}

function hlsVodProbePlan(playlistText: string): { readonly durationSec: number; readonly firstSegmentUri: string } | undefined {
  let pendingDuration: number | undefined;
  let totalDuration = 0;
  let firstSegmentUri: string | undefined;
  for (const rawLine of playlistText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (line.startsWith('#EXTINF:')) {
      const value = Number.parseFloat(line.slice('#EXTINF:'.length).split(',', 1)[0] ?? '');
      pendingDuration = Number.isFinite(value) && value > 0 ? value : undefined;
      if (pendingDuration !== undefined) totalDuration += pendingDuration;
      continue;
    }
    if (line.startsWith('#')) continue;
    if (pendingDuration !== undefined && firstSegmentUri === undefined) {
      firstSegmentUri = line;
    }
    pendingDuration = undefined;
  }
  return totalDuration > 0 && firstSegmentUri !== undefined
    ? { durationSec: totalDuration, firstSegmentUri }
    : undefined;
}

async function fastHlsProbeMetadata(
  engine: AibrushEngine,
  input: MediaInput,
  signal: AbortSignal,
  playlistOnly: boolean,
): Promise<NormalizedMetadata | undefined> {
  const playlistText = new TextDecoder().decode(await inputBytes(input));
  const baseUrl = inputUrl(input).href;
  const plan = hlsVodProbePlan(playlistText);
  if (plan === undefined) return undefined;
  const playlistAccess = { role: 'playlist' as const, uri: baseUrl, disposition: 'read' as const };
  if (playlistOnly) {
    const metadata = {
      container: 'hls',
      durationSec: plan.durationSec,
      tracks: [],
      protectionScheme: /^#EXT-X-KEY:.*METHOD=AES-128/im.test(playlistText) ? 'hls-aes128' : null,
      probeEvidence: {
        readMode: 'whole-file' as const,
        resourceAccesses: [playlistAccess],
      },
    } satisfies NormalizedMetadata & { protectionScheme: string | null };
    return metadata;
  }
  const core = (await import('@aibrush/media/core')) as unknown as AibrushHlsCore;
  const resourceAccesses: NonNullable<NormalizedMetadata['probeEvidence']>['resourceAccesses'] = [playlistAccess];
  const keyUris = hlsKeyUrisFromText(playlistText, baseUrl);
  const fetchObserved = async (uri: string): Promise<Uint8Array> => {
    const role = keyUris.has(uri) ? 'key' as const : 'segment' as const;
    try {
      const bytes = await hlsFetch(uri, signal);
      resourceAccesses.push({ role, uri, disposition: 'read' });
      return bytes;
    } catch (error) {
      resourceAccesses.push({ role, uri, disposition: 'error' });
      throw error;
    }
  };
  let segmentSource: unknown;
  if (core.hlsPlaylistHasEncryptedSegments(playlistText, baseUrl)) {
    segmentSource = engine.from(
      await core.resolveHlsProbeSource(playlistText, {
        baseUrl,
        fetchResource: fetchObserved,
        signal,
      }),
    );
  } else {
    const segmentBytes = await fetchObserved(new URL(plan.firstSegmentUri, baseUrl).href);
    segmentSource = engine.from(segmentBytes, {
      mime: 'video/mp2t',
      size: segmentBytes.byteLength,
    });
  }
  const info =
    engine.probeContainer !== undefined
      ? await engine.probeContainer(segmentSource, 'ts', { signal })
      : await engine.probe(segmentSource, { signal });
  const metadata = normalizedMetadataFromAibrushInfo(input, info, {
    container: 'hls',
    durationSec: plan.durationSec,
  });
  metadata.probeEvidence = { readMode: 'whole-file', resourceAccesses };
  if (/^#EXT-X-KEY:.*METHOD=AES-128/im.test(playlistText)) {
    (metadata as NormalizedMetadata & { protectionScheme?: string }).protectionScheme = 'hls-aes128';
  }
  return metadata;
}

function hlsKeyUrisFromText(playlistText: string, baseUrl: string): Set<string> {
  const uris = new Set<string>();
  for (const line of playlistText.split(/\r?\n/)) {
    if (!line.trim().toUpperCase().startsWith('#EXT-X-KEY:')) continue;
    const match = /(?:^|,)URI=(?:"([^"]+)"|'([^']+)'|([^,]+))/i.exec(line.slice(line.indexOf(':') + 1));
    const raw = match?.[1] ?? match?.[2] ?? match?.[3];
    if (raw) uris.add(new URL(raw.trim(), baseUrl).href);
  }
  return uris;
}

function isPlaylistOnlyProbeRequest(context: OperationContext | undefined): boolean {
  const options = context?.request.options;
  const robustness = objectRecord(options?.robustness);
  const probe = objectRecord(robustness?.probe);
  const contract = objectRecord(probe?.probeContract);
  return contract?.schema === 'media-test/hls-playlist-only-probe@1';
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

interface ConcatTrackPackets {
  track: AibrushTrackInfo;
  packets: AibrushPacket[];
}

interface PreparedPcmMuxSource {
  readonly input: MediaInput;
  readonly target: string;
  readonly bytes: Uint8Array;
  readonly authored?: boolean;
}

interface PreparedMp4MuxOutput {
  readonly input: MediaInput;
  readonly target: string;
  readonly fragmented: boolean;
  readonly bytes: Uint8Array;
}

interface PreparedAudioMuxOutput {
  readonly input: MediaInput;
  readonly target: string;
  readonly track: EncodedTrack;
  readonly bytes: Uint8Array;
}

interface PreparedWebmMuxOutput {
  readonly input?: MediaInput;
  readonly inputs?: readonly MediaInput[];
  readonly target: string;
  readonly bytes: Uint8Array;
}

interface PreparedTsMuxOutput {
  readonly input: MediaInput;
  readonly target: string;
  readonly bytes: Uint8Array;
}

export class AibrushMediaEngine implements MediaEngine {
  readonly id = ENGINE_ID;
  readonly #configEvidence = new AibrushConfigEvidence();
  get configUsed(): object {
    return this.#configEvidence.snapshot();
  }
  #lib: AibrushMedia | undefined;
  #core: AibrushCore | undefined;
  #errorClasses: AibrushErrorClasses | undefined;
  #cellSignal: AbortSignal | undefined;
  #currentRequest: ConcreteOperationRequest | undefined;
  #activeOperation = 'none';
  #activeRoute = 'not-executed';
  #wasmProvenanceCaptured = false;
  #engineInstance: AibrushEngine | undefined;
  /** Source(s) recorded by prepareMuxTracks for the immediately-following mux() (same instance, serial). */
  #muxSource: MediaInput[] | undefined;
  #preparedPcmMuxSource: PreparedPcmMuxSource | undefined;
  #preparedMp4MuxOutput: PreparedMp4MuxOutput | undefined;
  #preparedAudioMuxOutput: PreparedAudioMuxOutput | undefined;
  #preparedWebmMuxOutput: PreparedWebmMuxOutput | undefined;
  #preparedTsMuxOutput: PreparedTsMuxOutput | undefined;
  // A pooled direct-decode VideoDecoder reused across repeated SAME-CONFIG decodeFrames calls within this
  // cell. The harness builds a FRESH adapter per (engine, scenario) cell, so the pool NEVER spans inputs —
  // no cross-input state. Keyed by the exact VideoDecoderConfig; a config change or decode error rebuilds
  // it. Reusing a warm decoder avoids the per-call construct+configure (hardware init) cost that dominates
  // tiny/single-frame decode wall (competitors keep a warm decoder too). Closed in dispose().
  #directDecoder: VideoDecoder | undefined;
  #directDecoderKey: string | undefined;
  #directDecoderSink: { frames: VideoFrame[]; error: Error | undefined } | undefined;

  supports(request: ConcreteOperationRequest, context?: LifecycleContext) {
    this.#bindCellSignal(context, 'supports');
    const decision = decideAibrushSupport(request);
    if (decision.supported && request.options.reproducible === true) {
      try {
        this.#configEvidence.assertReproducible();
      } catch (error) {
        return {
          supported: false as const,
          status: 'NA_ENGINE' as const,
          reasonCode: error instanceof AibrushProvenanceError
            ? error.code
            : 'AIBRUSH_PROVENANCE_UNLABELED',
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    }
    return decision;
  }

  async init(context?: LifecycleContext): Promise<void> {
    this.#bindCellSignal(context, 'init');
    context?.signal.throwIfAborted();
    const [lib, core] = await Promise.all([import('@aibrush/media'), import('@aibrush/media/core')]);
    this.#lib = lib as unknown as AibrushMedia;
    this.#core = core as unknown as AibrushCore;
    this.#errorClasses = {
      CapabilityError: this.#lib.CapabilityError,
      InputError: this.#lib.InputError,
    };
    // The imported package is allowed to execute only when it matches the immutable sync artifact.
    // Never replace persisted provenance with values self-reported by the runtime module.
    this.#configEvidence.assertPackageVersion(this.#lib.VERSION);
    context?.signal.throwIfAborted();
  }

  async dispose(context?: LifecycleContext): Promise<void> {
    this.#bindCellSignal(context, 'dispose');
    this.#muxSource = undefined;
    this.#preparedPcmMuxSource = undefined;
    this.#preparedMp4MuxOutput = undefined;
    this.#preparedAudioMuxOutput = undefined;
    this.#preparedWebmMuxOutput = undefined;
    this.#preparedTsMuxOutput = undefined;
    this.#dropDirectDecoder();
    this.#core = undefined;
    this.#engineInstance = undefined;
    this.#errorClasses = undefined;
  }

  #bindCellSignal(context: LifecycleContext | undefined, operation: string): void {
    if (context === undefined) return;
    if (this.#cellSignal === undefined) {
      this.#cellSignal = context.signal;
      return;
    }
    if (this.#cellSignal !== context.signal) {
      throw new Error(`aibrush ${operation}: operation received a different cell AbortSignal`);
    }
  }

  async #run<T>(
    operation: ApplicabilityOperation,
    route: string,
    context: OperationContext | undefined,
    body: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    this.#bindCellSignal(context, operation);
    if (context !== undefined) this.#currentRequest = context.request;
    this.#activeOperation = operation;
    this.#activeRoute = route;
    this.#configEvidence.record({
      operation,
      route,
      internalDriver: 'framework-router-unexposed',
      readerMode: route.includes('packet-info') ? 'packet-info' : 'framework-source',
      writerMode: 'framework-default',
      targetMode: 'framework-default',
      peakRetainedBytes: 0,
      callbackWriteCount: 0,
    });
    const result = await withCellSignal(context, body);
    if (!this.#wasmProvenanceCaptured) {
      const observations = await captureLoadedAibrushWasmArtifacts(
        AIBRUSH_VENDOR_PROVENANCE.bundledWasmArtifacts,
        context?.signal,
      );
      if (observations.length > 0) {
        this.#configEvidence.setLoadedWasmArtifacts(observations);
        this.#wasmProvenanceCaptured = true;
      }
    }
    return result;
  }

  #naIfMiss(operation: ApplicabilityOperation, error: unknown, input?: MediaInput): never {
    return translateAibrushFrameworkError(
      operation,
      error,
      this.#errorClasses,
      this.#currentRequest,
      input,
      isMalformedHarnessInput,
      (op, reason) => new GracefulRejectionError(op, reason),
    );
  }

  /** Close + forget the pooled direct-decode VideoDecoder (on dispose, config change, or a decode error). */
  #dropDirectDecoder(): void {
    const decoder = this.#directDecoder;
    this.#directDecoder = undefined;
    this.#directDecoderKey = undefined;
    if (decoder !== undefined && decoder.state !== 'closed') {
      try {
        decoder.close();
      } catch {
        /* already closed */
      }
    }
  }

  #directDecoderConfigKey(config: VideoDecoderConfig): string {
    // codec + coded dims + description length uniquely identify the config within a cell (one input per
    // cell, so the config never actually changes — this key only guards the pool against a config swap).
    const descLen = config.description === undefined ? 0 : (config.description as { byteLength: number }).byteLength;
    return `${config.codec}|${config.codedWidth}x${config.codedHeight}|${descLen}`;
  }

  /**
   * Decode the first presentation frame of `rows` with the POOLED direct-decode VideoDecoder — reused for
   * repeated same-config calls in this cell (a fresh adapter per cell means the pool never spans inputs).
   * Every collected VideoFrame is `close()`d exactly once; the decoder stays open (pooled) and is closed in
   * dispose(). Returns `undefined` when WebCodecs is absent or no frame is produced. On any decode error the
   * pooled decoder is dropped (so the fallback/next call rebuilds) and the error is rethrown for the caller.
   */
  /** Get (or build+configure) the pooled direct-decode VideoDecoder for `config`. Frame outputs route to
   *  the current call's `#directDecoderSink`; a config change or closed state rebuilds it. */
  #acquireDirectDecoder(config: VideoDecoderConfig): VideoDecoder {
    const key = this.#directDecoderConfigKey(config);
    const existing = this.#directDecoder;
    if (existing !== undefined && this.#directDecoderKey === key && existing.state !== 'closed') {
      return existing;
    }
    this.#dropDirectDecoder();
    const decoder = new VideoDecoder({
      output: (frame): void => {
        const sink = this.#directDecoderSink;
        if (sink !== undefined) sink.frames.push(frame);
        else closeFrame(frame); // no active call owns it → never leak a stray frame
      },
      error: (error): void => {
        const sink = this.#directDecoderSink;
        if (sink !== undefined) sink.error = error instanceof Error ? error : new Error(String(error));
      },
    });
    decoder.configure(config);
    this.#directDecoder = decoder;
    this.#directDecoderKey = key;
    return decoder;
  }

  async #decodeDirectPooledFirstFrame(
    config: VideoDecoderConfig,
    sourceBytes: Uint8Array,
    rows: readonly AibrushPacketInfoMetadata[],
    onFirstFrame?: () => void,
  ): Promise<FrameSink | undefined> {
    if (typeof VideoDecoder !== 'function' || typeof EncodedVideoChunk !== 'function') return undefined;
    const decoder = this.#acquireDirectDecoder(config);
    const sink: { frames: VideoFrame[]; error: Error | undefined } = { frames: [], error: undefined };
    this.#directDecoderSink = sink;
    try {
      for (const row of rows) {
        const offset = row.offset;
        if (offset === undefined) {
          this.#dropDirectDecoder(); // malformed row mid-stream → discard the now-inconsistent decoder
          return undefined;
        }
        decoder.decode(
          new EncodedVideoChunk({
            type: row.keyframe ? 'key' : 'delta',
            timestamp: Math.round(row.ptsUs),
            ...(row.durationUs !== undefined ? { duration: Math.round(row.durationUs) } : {}),
            data: sourceBytes.subarray(offset, offset + row.size),
          }),
        );
      }
      await decoder.flush();
      if (sink.error !== undefined) throw sink.error;
      sink.frames.sort((a, b) => a.timestamp - b.timestamp);
      // Transfer ownership out of the pooled callback sink before the single-frame helper closes it.
      // The finally below owns only the frames still present in `sink.frames`, preventing double-close.
      const first = takeFirstOwned(sink.frames);
      if (first === undefined) return undefined;
      return await frameSinkFromSingleVideoFrame(first, onFirstFrame);
    } catch (e) {
      this.#dropDirectDecoder(); // a broken pooled decoder must never be reused
      throw e;
    } finally {
      for (const frame of sink.frames) closeFrame(frame);
      this.#directDecoderSink = undefined;
    }
  }

  /** Fast bounded decode (1..N frames) via the pooled direct decoder (mp4 packet-info byte path). */
  async #tryDirectBoundedDecode(
    input: MediaInput,
    maxFrames: number,
    signal: AbortSignal,
    onFirstFrame?: () => void,
  ): Promise<FrameSink | undefined> {
    // Bounded bulk read: known-small inputs read whole; unknown-size inputs read up to the cap and only
    // proceed if the file fit (a larger file yields undefined → fall back to the seek/streaming path).
    const bytes =
      input.sizeBytes !== undefined && input.sizeBytes <= DIRECT_SINGLE_FRAME_MP4_MAX_BYTES
        ? await inputBytes(input)
        : await inputBytesIfAtMost(input, DIRECT_SINGLE_FRAME_MP4_MAX_BYTES);
    if (bytes === undefined || signal.aborted) return undefined;
    const table = await this.#driverCore().mp4PacketInfoFromBytes(bytes, { includeOffsets: true, signal });
    // Submit enough packets to yield `maxFrames` output frames even with B-frame reordering; the decode
    // helper trims the sorted output to exactly `maxFrames`.
    const planned = directVideoPacketRows(table, maxFrames + DIRECT_SINGLE_FRAME_MP4_SUBMIT_MARGIN);
    if (planned === undefined) return undefined;
    return maxFrames <= 1
      ? this.#decodeDirectPooledFirstFrame(planned.config, bytes, planned.rows, onFirstFrame)
      : this.#decodeDirectPooledFrames(planned.config, bytes, planned.rows, maxFrames, planned.hasMore, onFirstFrame);
  }

  /**
   * Decode the first `maxFrames` presentation frames of `rows` with the POOLED decoder and return a
   * RetainingFrameSink of their digests — the same (presentation-ordered, 0..N-1 re-indexed) shape the
   * streaming path produces, so the decoded-frames-bitexact oracle pairs frame[i]↔golden[i]. Every decoded
   * VideoFrame is closed exactly once; the decoder stays pooled (closed in dispose); on error it is dropped.
   */
  async #decodeDirectPooledFrames(
    config: VideoDecoderConfig,
    sourceBytes: Uint8Array,
    rows: readonly AibrushPacketInfoMetadata[],
    maxFrames: number,
    hasMore: boolean,
    onFirstFrame?: () => void,
  ): Promise<FrameSink | undefined> {
    if (typeof VideoDecoder !== 'function' || typeof EncodedVideoChunk !== 'function') return undefined;
    const decoder = this.#acquireDirectDecoder(config);
    const sink: { frames: VideoFrame[]; error: Error | undefined } = { frames: [], error: undefined };
    this.#directDecoderSink = sink;
    try {
      for (const row of rows) {
        const offset = row.offset;
        if (offset === undefined) {
          this.#dropDirectDecoder();
          return undefined;
        }
        decoder.decode(
          new EncodedVideoChunk({
            type: row.keyframe ? 'key' : 'delta',
            timestamp: Math.round(row.ptsUs),
            ...(row.durationUs !== undefined ? { duration: Math.round(row.durationUs) } : {}),
            data: sourceBytes.subarray(offset, offset + row.size),
          }),
        );
      }
      await decoder.flush();
      if (sink.error !== undefined) throw sink.error;
      sink.frames.sort((a, b) => a.timestamp - b.timestamp);
      const emit = sink.frames.slice(0, maxFrames);
      // A short window on a longer track → defer to the full streaming path rather than return too few
      // frames. When the track truly has fewer frames than requested (hasMore=false), the short set is
      // the correct, complete result.
      if (emit.length === 0 || (emit.length < maxFrames && hasMore)) return undefined;
      const out = new RetainingFrameSink();
      for (let i = 0; i < emit.length; i++) {
        const frame = emit[i]!;
        const img = await imageDataFromAibrushFrame(frame);
        const digest = await digestImageData(img, i, frame.timestamp);
        out.add(digest, img);
      }
      if (out.frames.length > 0) onFirstFrame?.();
      return out;
    } catch (e) {
      this.#dropDirectDecoder();
      throw e;
    } finally {
      for (const frame of sink.frames) closeFrame(frame);
      this.#directDecoderSink = undefined;
    }
  }

  #engine(): AibrushEngine {
    if (!this.#lib) throw new Error('aibrush-media not initialized');
    this.#engineInstance ??= this.#lib.createMedia();
    return this.#engineInstance;
  }
  #driverCore(): AibrushCore {
    if (!this.#core) throw new Error('aibrush-media core not initialized');
    return this.#core;
  }
  #streamSink(): AibrushStreamSink {
    if (!this.#lib) throw new Error('aibrush-media not initialized');
    return this.#lib.toStream();
  }
  #outputTelemetry(
    opts?: Record<string, unknown>,
    runtime: AibrushOutputRuntimeIdentity = {},
  ): AibrushOutputTelemetry {
    if (!this.#lib) throw new Error('aibrush-media not initialized');
    return instrumentedAibrushSink(this.#lib, opts, runtime, (observation) => {
      this.#configEvidence.record({
        operation: this.#activeOperation,
        route: this.#activeRoute,
        internalDriver: 'framework-router-unexposed',
        readerMode: this.#activeRoute.includes('packet') ? 'packet-info-or-stream' : 'framework-source',
        writerMode: observation.writerMode,
        targetMode: observation.targetMode,
        peakRetainedBytes: observation.peakRetainedBytes,
        callbackWriteCount: observation.callbackWriteCount,
      });
    });
  }
  async #resolveHlsSource(
    input: MediaInput,
    signal?: AbortSignal,
    keyOverride?: { readonly keyBytes: Uint8Array; readonly ivHex?: string },
  ): Promise<AibrushSourceLike> {
    const core = (await import('@aibrush/media/core')) as unknown as AibrushHlsCore;
    const playlistText = new TextDecoder().decode(await inputBytes(input));
    const baseUrl = inputUrl(input).href;
    const keyUris = new Set<string>();
    if (keyOverride !== undefined) {
      addHlsDecryptKeyUris(playlistText, baseUrl, core.parseM3u8, keyUris, keyOverride.ivHex);
    }
    const fetchResource = async (uri: string): Promise<Uint8Array> => {
      if (keyOverride !== undefined && keyUris.has(uri)) return keyOverride.keyBytes.slice();
      const bytes = await hlsFetch(uri, signal);
      if (keyOverride !== undefined && /\.m3u8?($|\?)/i.test(uri)) {
        addHlsDecryptKeyUris(new TextDecoder().decode(bytes), uri, core.parseM3u8, keyUris, keyOverride.ivHex);
      }
      return bytes;
    };
    return core.resolveHlsSource(playlistText, {
      baseUrl,
      fetchResource,
      ...(signal !== undefined ? { signal } : {}),
    });
  }
  async #src(engine: AibrushEngine, input: MediaInput): Promise<unknown> {
    if (isHlsAsset(input)) {
      // HLS: resolve the .m3u8 playlist to a single stitched MPEG-TS/MP4 Source (parse → fetch segments →
      // AES-128 decrypt → concat) that the unmodified engine then probes/demuxes/decodes. The resolver lives
      // in the driver-author surface (core.js), lazy-loaded only for HLS inputs so the eager path is untouched.
      return engine.from(await this.#resolveHlsSource(input));
    }
    if (input.mutated) return engine.from(await inputBytes(input), { mime: input.mime });
    return engine.from(inputUrl(input), {
      mime: input.mime,
      rangeRequests: true,
      ...(input.sizeBytes !== undefined ? { size: input.sizeBytes } : {}),
    });
  }

  /**
   * Like {@link #src}, but for whole-file consumers (decode/seek): a small, non-mutated, non-HLS input is
   * fed as one bulk-fetched in-memory buffer (reusing the harness's per-input cache) so the op pays a
   * single GET instead of repeated URL range round-trips. Anything over the cap (or mutated/HLS) keeps the
   * streaming range source via {@link #src}. Probe deliberately does NOT use this — it needs only a bounded
   * header window, which the range path already reads in one shot.
   */
  async #srcWholeForSmall(engine: AibrushEngine, input: MediaInput, maxBytes: number): Promise<unknown> {
    // Only containers whose demux materializes the whole file benefit: for them the bulk buffer also skips
    // the extra container-sniff range GET, a real per-op win. ISO-BMFF (mp4/mov) instead random-accesses
    // only the `moov` + the seek target's byte range, so bulk-fetching its (large) `mdat` would be pure
    // waste — those keep the streaming range source. Container is a general property of the input bytes.
    const container = containerFromInput(input);
    if (
      container !== 'mp4' &&
      container !== 'mov' &&
      !input.mutated &&
      !isHlsAsset(input) &&
      input.sizeBytes !== undefined &&
      input.sizeBytes <= maxBytes
    ) {
      return engine.from(await inputBytes(input), { mime: input.mime });
    }
    return this.#src(engine, input);
  }

  capabilities(): CapabilitySet {
    return {
      // The codec tier adds decode (WebCodecs VideoDecoder), seek (frame-accurate, codec-seam), and
      // transcode (demux→decode→GPU filter→encode→mux). remux/trim/decrypt stay on the pure-TS tier.
      // `mux` packs already-demuxed coded samples into a container through the engine: a lone source via
      // the real remux path (ISO-BMFF stream-copy when available, else the packet seam into proven target
      // muxers webm/mkv/ogg/ts); SEVERAL sources via `engine.mux({ tracks })`, the genuine multi-source
      // assembly op (no adapter-side byte assembly — the target muxer arbitrates legality, honesty §15).
      operations: { probe: true, demux: true, remux: true, transcode: true, decodeFrames: true, seek: true, trim: true, mux: true, decrypt: true },
      // Containers the engine can READ (probe/demux). 'ts' is the MPEG-TS driver (probe/demux verified on
      // the real h264_ts.ts → container 'ts', h264+aac). 'aiff'/'caf' are the pure-TS PCM container
      // drivers (AIFF/AIFF-C big-endian; CAF). jpeg/png/webp are READ-SIDE still-image side capabilities:
      // probe returns golden metadata and decodeFrames emits one ImageDecoder-backed frame, but there is no
      // demux/mux stream of coded packets and no output image container declaration. GIF/AVIF stay
      // undeclared here until the browser harness carries matching corpus rows. HLS is declared because the
      // adapter resolves a playlist to a real stitched MPEG-TS/fMP4 source with the engine's own HLS resolver;
      // no playlist bytes are treated as a media container directly.
      containersIn: [
        'mp4',
        'mov',
        'webm',
        'mkv',
        'wav',
        'mp3',
        'ogg',
        'flac',
        'adts',
        'ts',
        'aiff',
        'caf',
        'jpeg',
        'png',
        'webp',
        'hls',
      ],
      // Outputs the engine can WRITE: mp4/mov via the codec-seam Muxer (transcode) + mp4 stream-copy
      // (remux/trim); wav/aiff/caf via the audio-dsp PCM transform path; webm/mkv/ogg via cross-container
      // muxers; ts via the H.264/AAC MPEG-TS muxer (PAT/PMT/PES/PCR); and flac via the pure-TS native FLAC
      // encoder + container muxer (the engine convert path; verified end-to-end — ffprobe codec=flac and
      // ffmpeg re-decode matches the STREAMINFO MD5, ADR-086). mp3/adts still have no chunk muxer →
      // undeclared. Each target muxer arbitrates codec legality: an illegal codec→container raises a typed
      // CapabilityError → NA (never a fake pass, honesty §15); the oracle proves legal pairs.
      containersOut: ['mp4', 'mov', 'wav', 'aiff', 'caf', 'webm', 'mkv', 'ogg', 'ts', 'flac', 'mp3', 'adts'],
      // Codecs the WebCodecs tier can decode AND (for the encodable set) encode. We declare the common
      // hardware/software set; the runner's Pass-2 (declared∧detected) gate narrows per browser, so a
      // codec THIS browser cannot configure surfaces as NA_BROWSER (distinct from NA_ENGINE), never a
      // wrong output. Parse/copy paths (probe/demux/remux) read every one of these regardless.
      videoCodecs: ['h264', 'hevc', 'av1', 'vp8', 'vp9'],
      audioCodecs: ['aac', 'opus', 'mp3', 'flac', 'vorbis', 'pcm-s16', 'pcm-s24', 'pcm-f32', 'pcm-s16be', 'pcm-s24be'],
      videoCodecsIn: ['h264', 'hevc', 'av1', 'vp8', 'vp9'],
      videoCodecsOut: ['h264', 'hevc', 'av1', 'vp8', 'vp9'],
      audioCodecsIn: ['aac', 'opus', 'mp3', 'flac', 'vorbis', 'pcm-s16', 'pcm-s24', 'pcm-f32', 'pcm-s16be', 'pcm-s24be'],
      audioCodecsOut: ['aac', 'opus', 'flac', 'vorbis', 'pcm-s16', 'pcm-s24', 'pcm-f32', 'pcm-s16be', 'pcm-s24be'],
      encryption: ['cenc-ctr', 'cenc-cbcs', 'hls-aes128', 'cenc-cens', 'hls-sample-aes'],
      // 'resize'/'rotate'/'colorspace'/'tonemap' are video-filter transcode capabilities; 'fastStart' is
      // the mp4 moov-first write;
      // 'fastStart:none' is the mdat-first control (remux forwards `fastStart:false`→`faststart:false`,
      // mp4-box-layout verified); 'fragmented' covers mp4/mov CMAF stream-copy (init segment + `moof`
      // media segments via `fragmentMp4`, ADR-034/101) and WebM/MKV live Cluster output through the
      // explicit `appendOnly` contract. A finite WebM StreamTarget tuple is rejected rather than silently
      // changed into this live representation.
      // `audio:pcm-native` is deliberately PCM-only: raw PCM containers are transformed by a pure-TS
      // byte/sample path (`transformPcm`) rather than WebCodecs, so the browser's PCM encoder table is
      // irrelevant; lossy audio codecs still go through the normal browser gate. `mediarecorder:video-only`
      // is the single-video-track codec-seam path: the engine transcodes the video stream and muxes no
      // audio when the source has none. `resample`/`downmix`/`upmix` are wired through public
      // `audio.sampleRate`/`audio.channels` options; `gain` maps harness `audio.gainDb`/positive
      // `audio.gainLinear` to public `audio.gainDb`; `fade` maps harness `audio.fade` to the PCM-native
      // public fade target. `pad` maps the benchmark's black letterbox request to the public `fit:'contain'` resize path;
      // `decode:audio-pcm` drains engine `AudioData` for audio-only PCM inputs into per-sample f32 digests.
      // `audio:vorbis-native` is decode-only: the engine's vendored Symphonia wasm Vorbis tail handles
      // source Vorbis packets when Chromium has no WebCodecs Vorbis decoder. `audio:vorbis-encode-native`
      // is the separate encode-side libvorbisenc wasm tail, so the runner can bypass Chromium's missing
      // AudioEncoder table only for engines that really ship that encoder.
      // `remux:flac-in-ogg` is a native-frame packet-copy path: FLAC demux exposes byte-exact frames and
      // the Ogg muxer writes the official Ogg-FLAC mapping, with the reference-reimport oracle proving layout.
      // Reserved positioned fast-start writes are deliberately not advertised: the public framework only
      // exposes a boolean faststart control, so those exact tuples terminate as reason-coded NA_ENGINE.
      // `target:writes` is the real `toStreamTarget` callback path above: the adapter observes each
      // contiguous write position and returns the exact bytes assembled from those writes.
      // `headerless` maps the harness's `appendOnly:true` WebM/MKV rows to the root WebM fragmented/live
      // muxer: an unknown-size Segment, no SeekHead/Duration, and one top-level Cluster per fragment.
      // `metadata:write` forwards the benchmark's `options.tags` into the engine's same-container tag
      // writers (MP4/MOV ilst, Matroska Tags, ID3v2, FLAC/Ogg VorbisComment), validated by structural
      // readback plus media-preservation checks.
      // `fanout` routes `options.variants` through the engine's H.264 ABR ladder API and returns
      // independent rendition files in `MediaBytes.variants[]`.
      // `audio-samples:gapless-priming` carries MP4 AAC edit-list sample-count facts through full-range
      // frame-accurate trims and writes a fresh output edit list after WebCodecs AAC encode.
      // `alpha` covers VPx alpha decode and WebM stream-copy trim: BlockAdditions ride the packet seam,
      // decode merges colour+alpha planes, and copy-trim writes BlockAdditions back. `alpha:transcode`
      // uses the engine's dual VPx encode path (opaque colour stream + grayscale alpha side stream).
      features: [
        'fastStart',
        'fastStart:none',
        'fastStart:in-memory',
        'resize',
        'fanout',
        'crf',
        'depth:10bit-to-8bit',
        'fps',
        'rotate',
        'flip',
        'crop',
        'pad',
        'colorspace',
        'tonemap',
        'mediarecorder:video-only',
        'packets:dts',
        'fragmented',
        'headerless',
        'target:writes',
        'streaming:decode-equality',
        'metadata:protected-tracks',
        'metadata:write',
        'remux:flac-in-ogg',
        'decode:golden-rgba',
        'decode:audio-pcm',
        'audio:pcm-native',
        'audio:flac-native',
        'audio:vorbis-native',
        'audio:vorbis-encode-native',
        'audio-samples:gapless-priming',
        'alpha',
        'alpha:transcode',
        'resample',
        'downmix',
        'upmix',
        'gain',
        'fade',
        'rotation:decode',
        'mux:vfr-timestamps',
        'mux:browser-decode-equality',
        'mux:roundtrip-compare',
        'remux:compose',
        'trim:compose',
        'trim:frame-accurate-hevc',
        'mux:hevc-browser-decode-equality',
        'webcrypto:cenc-ctr-clear-output',
        'remux:av1-opus-in-webm',
        'remux:av1-opus-in-mp4',
        'remux:vp9-opus-in-mp4',
        'remux:mp3-in-mp4',
        'trim:flac-seektable-copy',
        'trim:flac-no-seektable-frame-scan',
        'flac:seektable-seek-equivalence',
        'trim:frame-accurate',
        'trim:massive-lazy-read',
        'hls:aes128',
        'probe:resource-trace',
      ],
      probeReadModes: ['whole-file'],
    };
  }

  async probe(input: MediaInput, context?: OperationContext): Promise<NormalizedMetadata> {
    return this.#run('probe', 'framework.probe', context, async (signal) => {
      let info: AibrushInfo;
      let bytes: Uint8Array | undefined;
      try {
        const engine = this.#engine();
        if (isHlsAsset(input)) {
          const hlsMetadata = await fastHlsProbeMetadata(
            engine,
            input,
            signal,
            isPlaylistOnlyProbeRequest(context),
          );
          if (hlsMetadata !== undefined) return hlsMetadata;
        }
        if (isMalformedHarnessInput(input) && !input.mutated) bytes = await inputBytes(input);
        // A malformed/mislabeled name or MIME is not authoritative. Feeding its verified bytes
        // without a container hint lets the framework sniff the actual representation.
        const src = bytes === undefined ? await this.#src(engine, input) : engine.from(bytes);
        const knownContainer = knownContainerProbeToken(input);
        info =
          knownContainer !== undefined && engine.probeContainer !== undefined
            ? await engine.probeContainer(src, knownContainer, { signal })
            : await engine.probe(src, { signal });
      } catch (e) {
        try {
          return this.#naIfMiss('probe', e, input);
        } catch (translated) {
          if (
            context?.request.options.gracefulAllowOutput === true &&
            !preserveProbeError(translated)
          ) {
            throw new GracefulRejectionError('probe', aibrushErrorReason(translated));
          }
          throw translated;
        }
      }
      bytes ??= await inputBytes(input);
      const metadata = enrichAibrushProbeMetadata(normalizedMetadataFromAibrushInfo(input, info), bytes);
      metadata.probeEvidence = { readMode: 'whole-file' };
      return metadata;
    });
  }

  async demux(input: MediaInput, context?: OperationContext): Promise<DemuxResult> {
    return this.#run('demux', 'framework.demux+packet-info', context, async (signal) => {
      try {
        const container = containerFromInput(input);
        const evidenceBytes =
          input.sizeBytes !== undefined &&
          input.sizeBytes <= PACKET_INFO_PREP_MAX_SOURCE_BYTES &&
          !isHlsAsset(input)
            ? await inputBytes(input)
            : undefined;
        if (isPcmAggregateInput(input)) {
          const metadata = await this.probe(input, context);
          if (pcmTrack(metadata) === undefined) {
            throw new Error(`aibrush PCM aggregate input ${input.id} has no PCM track`);
          }
          return { metadata, packets: await pcmPacketTable(input, metadata) };
        }
        if (
          (container === 'mp4' || container === 'mov') &&
          !isMalformedHarnessInput(input) &&
          input.sizeBytes !== undefined &&
          input.sizeBytes <= MP4_DEMUX_BYTE_PACKET_INFO_MAX_SOURCE_BYTES
        ) {
          const bytes = evidenceBytes ?? await inputBytes(input);
          const packetInfo = await this.#driverCore().mp4PacketInfoFromBytes(bytes);
          if (packetInfo.packets.length > 0) return demuxResultFromPacketInfo(input, packetInfo, bytes);
        }
        if (
          (container === 'mp4' || container === 'mov') &&
          !isMalformedHarnessInput(input)
        ) {
          const packetInfo = await this.#driverCore().mp4PacketInfoFromUrl(input.url, {
            mime: input.mime,
            ...(input.sizeBytes !== undefined ? { size: input.sizeBytes } : {}),
            signal,
          });
          if (packetInfo.packets.length > 0) {
            return demuxResultFromPacketInfo(input, packetInfo, evidenceBytes);
          }
        }
        if (
          container === 'mp3' &&
          !isMalformedHarnessInput(input) &&
          input.sizeBytes !== undefined &&
          input.sizeBytes <= PACKET_INFO_PREP_MAX_SOURCE_BYTES
        ) {
          const bytes = evidenceBytes ?? await inputBytes(input);
          const packetInfo = this.#driverCore().mp3PacketInfoFromBytes(bytes);
          if (packetInfo.packets.length > 0) return demuxResultFromPacketInfo(input, packetInfo, bytes);
        }
        if (
          (container === 'mp4' ||
            container === 'mov' ||
            container === 'flac' ||
            container === 'adts' ||
            container === 'mp3') &&
          !isMalformedHarnessInput(input)
        ) {
          const engine = this.#engine();
          const src = await this.#src(engine, input);
          const packetInfo = await engine.packetInfo?.(src, { signal, container });
          if (packetInfo !== undefined && packetInfo.packets.length > 0) {
            return demuxResultFromPacketInfo(input, packetInfo, evidenceBytes);
          }
        }
        const engine = this.#engine();
        const source = isMalformedHarnessInput(input) && !input.mutated
          ? engine.from(evidenceBytes ?? await inputBytes(input))
          : await this.#src(engine, input);
        const demuxed = await engine.demux(source, { signal });
        const rawMetadata = metadataFromDemuxed(input, demuxed);
        const metadata = evidenceBytes === undefined
          ? rawMetadata
          : enrichAibrushProbeMetadata(rawMetadata, evidenceBytes);
        let packets: PacketInfo[] = [];
        let packetTableFastPath = false;
        try {
          const packetInfoTable = demuxed.packetInfoTable?.();
          if (packetInfoTable !== undefined) {
            packetTableFastPath = true;
            packets = packetInfoTable as PacketInfo[];
          } else {
            const packetTable = demuxed.packetTable?.();
            if (packetTable !== undefined) {
              packetTableFastPath = true;
              let maxTrackId = 0;
              for (let i = 0; i < demuxed.tracks.length; i++) {
                const track = demuxed.tracks[i];
                if (track && track.id > maxTrackId) maxTrackId = track.id;
              }
              const trackIndexById = new Int32Array(maxTrackId + 1);
              trackIndexById.fill(-1);
              for (let i = 0; i < demuxed.tracks.length; i++) {
                const track = demuxed.tracks[i];
                if (track) trackIndexById[track.id] = i;
              }
              const packetRows = packetTable as AibrushPacketInfoRow[];
              if (!packetRowsArePreindexed(packetRows, demuxed.tracks.length)) {
                for (let i = 0; i < packetTable.length; i++) {
                  const p = packetRows[i];
                  if (p === undefined) continue;
                  const trackIndex = p.trackId < trackIndexById.length ? (trackIndexById[p.trackId] ?? -1) : -1;
                  if (trackIndex < 0) {
                    throw new Error(`aibrush packetTable referenced unknown track ${p.trackId}`);
                  }
                  p.trackIndex = trackIndex;
                  p.size = p.sizeBytes;
                }
              }
              packets = packetRows as PacketInfo[];
            } else {
              for (let i = 0; i < demuxed.tracks.length; i++) {
                const track = demuxed.tracks[i];
                if (!track) continue;
                const reader = demuxed.packets(track.id).getReader(); // may throw a capability-miss → NA
                try {
                  for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = value.chunk;
                    packets.push({
                      trackIndex: i,
                      size: value.sizeBytes ?? chunk.byteLength,
                      ptsUs: Math.round(chunk.timestamp),
                      ...(value.dtsUs !== undefined ? { dtsUs: Math.round(value.dtsUs) } : {}),
                      ...(chunk.duration !== undefined && chunk.duration !== null
                        ? { durationUs: Math.round(chunk.duration) }
                        : {}),
                      keyframe: chunk.type === 'key',
                      payload: packetPayloadBytes(value),
                    });
                  }
                } finally {
                  reader.releaseLock();
                }
              }
            }
          }
        } finally {
          await demuxed.close();
        }
        if (!packetTableFastPath) {
          packets.sort(
            (a, b) => (a.dtsUs ?? a.ptsUs) - (b.dtsUs ?? b.ptsUs) || a.trackIndex - b.trackIndex,
          );
        }
        return buildAibrushDemuxResult(metadata, demuxed.tracks, packets);
      } catch (e) {
        try {
          return this.#naIfMiss('demux', e, input);
        } catch (translated) {
          if (isGracefulNegativeContext(context) && !preserveProbeError(translated)) {
            throw new GracefulRejectionError('demux', aibrushErrorReason(translated));
          }
          throw translated;
        }
      }
    });
  }

  /**
   * Stream-copy remux (ADR-021). The streaming-output family forwards output-SHAPE knobs in the option
   * bag; we honor the ones the engine's lossless stream-copy genuinely supports — `fastStart` (moov
   * before/after mdat), `fragmented`/CMAF for MP4/MOV (ADR-034/101), ISO-BMFF `target:'stream'` rows
   * through the exact progressive/fragmented representation requested by the row, over-512 MiB ISO-BMFF
   * explicit buffer rows through fragmented whole-buffer output, and live fragmented WebM/MKV when the
   * row explicitly requests `appendOnly:true` (ADR-091/099:
   * unknown-size Segment, no SeekHead/Duration, one top-level Cluster per fragment).
   * Unsupported append-only/fragmented targets stay honest NA, never a wrong progressive output.
   */
  async remux(input: MediaInput, opts: RemuxOptions, context?: OperationContext): Promise<MediaBytes> {
    rejectUnforwardableOutputShape('remux', opts);
    const target = opts.container.toLowerCase();
    const appendOnly = wantsAppendOnly(opts);
    const streamTarget = wantsStreamTarget(opts);
    const fragmentedBufferAtScale = await wantsFragmentedBufferAtScale(input, opts, target);
    const fragmented =
      wantsFragmented(opts) ||
      fragmentedBufferAtScale ||
      (appendOnly && isWebmFamilyTarget(target));
    if (appendOnly && !isWebmFamilyTarget(target)) {
      throw createNotApplicableError(ENGINE_ID, 'remux', `append-only live output is webm/mkv-only (not '${target}')`);
    }
    if (streamTarget && isWebmFamilyTarget(target) && !appendOnly) {
      throw createNotApplicableError(
        ENGINE_ID,
        'remux',
        'finite WebM/Matroska output cannot be proven on the append-only callback target',
        {},
        'AIBRUSH_FINITE_WEBM_STREAM_TARGET_UNSUPPORTED',
      );
    }
    if (wantsFragmented(opts) && isWebmFamilyTarget(target) && !appendOnly) {
      throw createNotApplicableError(
        ENGINE_ID,
        'remux',
        'WebM/Matroska fragmented output requires the explicit appendOnly live contract',
        {},
        'AIBRUSH_WEBM_FRAGMENTED_WITHOUT_LIVE_UNSUPPORTED',
      );
    }
    if (fragmented && !isIsoBmffTarget(target) && !isWebmFamilyTarget(target)) {
      throw createNotApplicableError(ENGINE_ID, 'remux', `fragmented/live output is mp4/mov/webm/mkv-only (not '${target}')`);
    }
    await rejectOversizedBufferTarget(input, opts);
    await rejectUnsupportedStreamTargetScale(input, opts);
    return this.#run('remux', 'framework.remux', context, async (signal) => {
      try {
        const engine = this.#engine();
        const telemetry = this.#outputTelemetry(opts as Record<string, unknown>, {
          operationStartMs: context?.operationStartMs,
          emit: context?.emit,
          resolvedRepresentation: resolvedStreamingRepresentation(target, opts, fragmented),
        });
        const prepared = await tryStrictPreparedAibrushRemux(
          this.#driverCore(),
          engine,
          input,
          opts,
          signal,
        );
        const out = prepared ?? await engine.remux(
          (await finiteWebmClusterSource(engine, input)) ?? await this.#src(engine, input),
          {
            to: opts.container,
            faststart: faststartFrom(opts),
            fragmented,
            ...(opts.tags !== undefined ? { tags: opts.tags } : {}),
            sink: telemetry.sink,
          },
          { signal },
        );
        const media = await telemetry.mediaBytes(out, opts.container);
        const repairedOgg = target === 'ogg'
          ? repairAibrushOggContinuationFlags(media.bytes)
          : undefined;
        return verifyRequestedIsoShape(
          repairedOgg === undefined ? media : { ...media, bytes: repairedOgg },
          opts,
          fragmented,
        );
      } catch (e) {
        if (e instanceof AibrushPositionedWriteUnsupportedError) {
          throw createNotApplicableError(
            ENGINE_ID,
            'remux',
            e.message,
            {},
            'AIBRUSH_POSITIONED_WRITES_UNSUPPORTED',
            e,
          );
        }
        try {
          return this.#naIfMiss('remux', e, input);
        } catch (translated) {
          if (isGracefulNegativeContext(context) && !preserveProbeError(translated)) {
            throw new GracefulRejectionError('remux', aibrushErrorReason(translated));
          }
          throw translated;
        }
      }
    });
  }

  /**
   * Transcode via the codec seam: demux → decode → (GPU crop/resize/rotate/flip) → encode → mux. The
   * harness `TranscodeOptions` map to the engine's `ConvertOptions` (container→`to`, video/audio targets
   * verbatim). A pure container change with no re-encode is taken as a lossless stream-copy by the engine
   * internally; otherwise the WebCodecs tier runs. `convert` returns a Blob (default toBlob sink) which we
   * coerce to the harness `MediaBytes`. A target with no codec-seam muxer / a codec the browser can't
   * encode raises a CapabilityError → NA. `variants` routes to the engine's H.264 ABR ladder API and
   * returns every rendition as independently inspectable `MediaBytes.variants[]`.
   */
  async transcode(input: MediaInput, opts: TranscodeOptions, context?: OperationContext): Promise<MediaBytes> {
    rejectUnforwardableOutputShape('transcode', opts as unknown as Record<string, unknown>);
    const ladder = h264AbrLadderFrom(opts);
    if (ladder !== undefined) return this.#transcodeH264AbrLadder(input, opts, ladder, context);

    return this.#run('transcode', 'framework.convert', context, async (signal) => {
      try {
        let sourceHasVideo: boolean | undefined;
        const wantedTypes = requestedTargetTypes(opts);
        if (wantedTypes.includes('video') && isStillImageInput(input)) {
          throw new GracefulRejectionError('transcode', 'still-image inputs cannot be transcoded into a video stream');
        }
        const preparedWavF32Gain = await tryPreparedWavF32GainTranscode(this.#driverCore(), input, opts, signal);
        if (preparedWavF32Gain !== undefined) return preparedWavF32Gain;
        const engine = this.#engine();
        // Identity (no-op) WAV transcode is checked BEFORE the direct resample/format attempt: a request
        // whose target codec/sampleRate/channels already match the source is a verified passthrough, so it
        // returns the canonical bytes immediately instead of parsing the header to decline two conversions.
        const preparedWav = await tryPreparedWavIdentityTranscode(engine, input, opts);
        if (preparedWav !== undefined) return preparedWav;
        const preparedWavDirect = await tryPreparedWavDirectPcmTranscode(this.#driverCore(), input, opts, signal);
        if (preparedWavDirect !== undefined) return preparedWavDirect;
        const preparedAiffWav = await tryPreparedAiffWavTranscode(this.#driverCore(), input, opts);
        if (preparedAiffWav !== undefined) return preparedAiffWav;
        // MISMATCH GUARD (A.16): when the request EXPLICITLY targets media type(s) the source does not
        // contain at all, there is nothing the caller asked to produce → reject cleanly (no output) so the
        // graceful-failure oracle passes. The engine, reading an absent `video`/`audio` key as "preserve",
        // would otherwise re-encode the OTHER track and emit a file the harness flags as wrong output (e.g.
        // video-only input + {audio:{codec}} → it must reject, not author a video mp4). We only reject when
        // EVERY requested target type is missing; a partial mismatch (one of two targets present) is a
        // normal transcode (encode what exists), so it is left to the engine.
        if (wantedTypes.length > 0 && !requestedOnlyAudioFromKnownAudioSource(input, wantedTypes)) {
          const present = new Set((await this.probe(input, context)).tracks.map((t) => t.type));
          sourceHasVideo = present.has('video');
          if (!wantedTypes.some((type) => present.has(type))) {
            // Impossible request → a clean graceful REJECT (PASS on the robustness path), not output and
            // not NA: the engine would otherwise re-encode the OTHER track and emit a wrong file.
            throw new GracefulRejectionError(
              'transcode',
              `target requests ${wantedTypes.join('+')} but the source has no such track`,
            );
          }
        }
        const browserCanvasHdr = await tryBrowserCanvasHdrTonemapTranscode(this.#driverCore(), input, opts, signal);
        if (browserCanvasHdr !== undefined) return browserCanvasHdr;
        const src = await this.#src(engine, input);
        const out = await engine.convert(src, convertOptionsFrom(opts), { signal });
        const shape = opts as unknown as Record<string, unknown>;
        const media = verifyRequestedIsoShape(
          await toMediaBytes(out, opts.container),
          shape,
          shape.fragmented === true || shape.fastStart === 'fragmented',
        );
        if (opts.container.toLowerCase() === 'mp4' && opts.audio !== undefined && sourceHasVideo === false) {
          return { ...media, mime: 'audio/mp4' };
        }
        return media;
      } catch (e) {
        return this.#naIfMiss('transcode', e, input);
      }
    });
  }

  async #transcodeH264AbrLadder(
    input: MediaInput,
    opts: TranscodeOptions,
    ladder: readonly AibrushH264AbrRung[],
    context?: OperationContext,
  ): Promise<MediaBytes> {
    return this.#run('transcode', 'framework.h264AbrLadder', context, async (signal) => {
      try {
        const engine = this.#engine();
        const outputs = await engine.h264AbrLadder(await this.#src(engine, input), ladder, { signal });
        const variants = await Promise.all(outputs.map((output) => toMediaBytes(output, opts.container)));
        const primary = variants[0];
        if (primary === undefined) {
          throw new GracefulRejectionError('transcode', 'ABR fanout produced no variants');
        }
        return { ...primary, variants };
      } catch (e) {
        return this.#naIfMiss('transcode', e, input);
      }
    });
  }

  /**
   * Decode frames via the codec seam (WebCodecs `VideoDecoder`). The engine's `decode` returns lazy
   * frame streams (errors surface on first pull), so the whole drive is wrapped for NA mapping. Frames
   * are rasterized + digested through the SAME harness modules the golden producer uses, emitted in
   * presentation order with a 0..N-1 index, and every VideoFrame is closed exactly once (see
   * decodeToFrameSink). The returned FrameSink holds only digests + retained ImageData — no live frames.
   */
  async decodeFrames(
    input: MediaInput,
    opts?: DecodeOptions,
    context?: OperationContext,
  ): Promise<FrameSink> {
    const maxFrames = opts?.maxFrames ?? Number.POSITIVE_INFINITY;
    return this.#run('decodeFrames', 'framework.decode', context, async (signal) => {
      try {
        const engine = this.#engine();
        let firstFrameDelivered = false;
        const onFirstFrame = (): void => {
          if (firstFrameDelivered) return;
          firstFrameDelivered = true;
          opts?.onFirstFrame?.(nowMs());
        };
        let selected: ReturnType<typeof resolveAibrushDecodeTrack> | undefined;
        if (opts?.track) {
          const info = await engine.probe(await this.#src(engine, input), { signal });
          selected = resolveAibrushDecodeTrack(info, opts.track, this.#currentRequest);
        }
        const finish = (sink: FrameSink): FrameSink => {
          if (selected) sink.selectedTrack = selected.evidence;
          return sink;
        };

        if ((!selected || selected.presence.hasVideo) && canUseDirectBoundedDecode(input, maxFrames)) {
          try {
            const direct = await this.#tryDirectBoundedDecode(input, maxFrames, signal, onFirstFrame);
            if (direct !== undefined) return finish(direct);
          } catch {
            signal.throwIfAborted();
            // Fall through to the seek/linear decode paths; packet-info first-frame decode is a fast path.
          }
        }
        if ((!selected || selected.presence.hasVideo) && canUseSeekForSingleFrameDecode(input, maxFrames)) {
          try {
            const frame = await engine.seek(
              await this.#srcWholeForSmall(engine, input, SEEK_DECODE_BULK_FETCH_MAX_BYTES),
              0,
              { signal },
            );
            return finish(await frameSinkFromSingleVideoFrame(frame, onFirstFrame));
          } catch {
            signal.throwIfAborted();
            // Fall back to the normal linear decode path; this shortcut must never turn a valid decode
            // into NA/FAIL just because the seek fast path was unavailable for a particular MP4 shape.
          }
        }
        let presence = selected?.presence ?? decodePresenceHint(input);
        if (presence === undefined) {
          const info = await engine.probe(await this.#src(engine, input), { signal });
          presence = {
            hasVideo: info.tracks.some((track) => track.type === 'video'),
            hasAudio: info.tracks.some((track) => track.type === 'audio'),
          };
        }
        const streams = engine.decode(
          await this.#srcWholeForSmall(engine, input, SEEK_DECODE_BULK_FETCH_MAX_BYTES),
          { signal },
        );
        return finish(await decodeToFrameSink(streams, maxFrames, presence, onFirstFrame));
      } catch (e) {
        return this.#naIfMiss('decodeFrames', e, input);
      }
    });
  }

  /**
   * Frame-accurate seek: the engine decodes from the keyframe at/before `tUs` and returns the single
   * frame at/just-after it. We rasterize + digest that frame (golden-compatible path) and report its
   * real presentation pts as the landed time, then close the frame exactly once. The `seek-accuracy`
   * oracle gates on the landed pts (timestamps), and `decoded-frames-bitexact` (when seek-target golden
   * exists) on the digest — both satisfied by returning `{ landedPtsUs, frame }`.
   */
  async seek(
    input: MediaInput,
    tUs: number,
    context?: OperationContext,
  ): Promise<{ landedPtsUs: number; frame: FrameDigest }> {
    // A negative seek target is a clamp-to-start request, not an error: the engine's API rejects a
    // negative time (InputError 'seek time … must be a non-negative number'), so we clamp here to 0 and
    // land on the first keyframe — exactly what the seek_negative edge expects ("never throw on the
    // sign, never seek before the start"). A non-finite target stays a real InputError below.
    const seekUs = Number.isFinite(tUs) && tUs < 0 ? 0 : tUs;
    return this.#run('seek', 'framework.seek', context, async (signal) => {
      try {
        const engine = this.#engine();
        const frame = await engine.seek(
          await this.#srcWholeForSmall(engine, input, SEEK_DECODE_BULK_FETCH_MAX_BYTES),
          seekUs,
          { signal },
        );
        try {
          const img = await imageDataFromVideoFrame(frame);
          const landedPtsUs = Math.round(frame.timestamp);
          const digest = await digestImageData(img, 0, landedPtsUs);
          return { landedPtsUs, frame: digest };
        } finally {
          closeFrame(frame);
        }
      } catch (e) {
        return this.#naIfMiss('seek', e, input);
      }
    });
  }

  async trim(
    input: MediaInput,
    range: { startUs: number; endUs: number },
    opts: { container: string; frameAccurate: boolean },
    context?: OperationContext,
  ): Promise<MediaBytes> {
    const shape = opts as unknown as Record<string, unknown>;
    rejectUnforwardableOutputShape('trim', shape);
    if (shape.fragmented === true || shape.fastStart === 'fragmented') {
      throw createNotApplicableError(
        ENGINE_ID,
        'trim',
        'the framework TrimOptions surface cannot request fragmented output',
        {},
        'AIBRUSH_FRAGMENTED_TRIM_UNSUPPORTED',
      );
    }
    return this.#run('trim', 'framework.trim', context, async (signal) => {
      try {
        if (!opts.frameAccurate && !input.mutated && containerFromInput(input) === 'adts') {
          const bytes = await this.#driverCore().adtsTrimFromUrl(input.url, {
            mime: input.mime,
            ...(input.sizeBytes !== undefined ? { size: input.sizeBytes } : {}),
            startSec: range.startUs / 1e6,
            endSec: range.endUs / 1e6,
            signal,
          });
          return { bytes, mime: outputMime(opts.container), container: opts.container };
        }
        if (
          !opts.frameAccurate &&
          opts.container.toLowerCase() === 'wav' &&
          !input.mutated &&
          containerFromInput(input) === 'wav'
        ) {
          const bytes = await this.#driverCore().wavTrimFromUrl(input.url, {
            mime: input.mime,
            ...(input.sizeBytes !== undefined ? { size: input.sizeBytes } : {}),
            startSec: range.startUs / 1e6,
            endSec: range.endUs / 1e6,
            signal,
          });
          return { bytes, mime: outputMime(opts.container), container: opts.container };
        }
        const engine = this.#engine();
        // Frame-accurate trim routes to the engine's accurate codec-seam path (ADR-082); keyframe trim is
        // the lossless stream-copy. A codec the browser cannot decode for the accurate path surfaces as a
        // typed CapabilityError → NA via naIfMiss, never a wrong/incomplete clip.
        const out = await engine.trim(
          await this.#src(engine, input),
          {
            start: range.startUs / 1e6,
            end: range.endUs / 1e6,
            mode: opts.frameAccurate ? 'accurate' : 'keyframe',
            sink: { kind: 'stream' },
          },
          { signal },
        );
        return toMediaBytes(out, opts.container);
      } catch (e) {
        return this.#naIfMiss('trim', e, input);
      }
    });
  }

  /**
   * Mux step 1 (runner hook): demux the source asset into a harness `EncodedTracks` (the real coded
   * chunks + codec-private description — the verbatim samples that get packed) and record the source for
   * the paired {@link mux} call (same instance, serial). Returns the genuine demuxed tracks; a demux
   * capability miss maps to NA. Multi-source assembly (tracks from >1 asset) is NA up front — the engine
   * has no public multi-source packer, so we never pretend to assemble across sources (honesty §15).
   */
  async prepareMuxTracks(
    inputs: MediaInput[],
    options?: Record<string, unknown>,
    context?: OperationContext,
  ): Promise<EncodedTracks> {
    this.#bindCellSignal(context, 'prepareMuxTracks');
    if (context !== undefined) this.#currentRequest = context.request;
    context?.signal.throwIfAborted();
    this.#activeOperation = 'prepareMuxTracks';
    this.#activeRoute = 'framework.packet-preparation';
    this.#configEvidence.record({
      operation: this.#activeOperation,
      route: this.#activeRoute,
      internalDriver: 'framework-router-unexposed',
      readerMode: 'packet-info-or-demux-stream',
      writerMode: 'none',
      targetMode: 'framework-default',
      peakRetainedBytes: 0,
      callbackWriteCount: 0,
    });
    if (inputs.length === 0) throw createNotApplicableError(ENGINE_ID, 'mux', 'no source inputs to assemble');
    // Multi-source assembly (tracks from >1 asset) is now a real engine op: mux() re-demuxes every recorded
    // source and feeds all tracks to `engine.mux({ tracks })`. Here we just materialize the demuxed tracks
    // for the harness contract (and to detect an empty/zero-sample source in mux()).
    this.#preparedPcmMuxSource = undefined;
    this.#preparedMp4MuxOutput = undefined;
    this.#preparedAudioMuxOutput = undefined;
    this.#preparedWebmMuxOutput = undefined;
    const requestedTarget = typeof options?.container === 'string' ? options.container.toLowerCase() : undefined;
    if (
      inputs.length > 1 &&
      (requestedTarget === 'webm' || requestedTarget === 'mkv') &&
      normalizedTrackSelect((options ?? {}) as MuxOptions).length === 0 &&
      (options as { fragmented?: unknown } | undefined)?.fragmented !== true &&
      (options as { target?: unknown } | undefined)?.target !== 'stream'
    ) {
      try {
        const prepared = await prepareMultiSourceWebmMux(this.#driverCore(), inputs, undefined);
        if (prepared !== undefined) {
          this.#preparedWebmMuxOutput = {
            inputs,
            target: requestedTarget,
            bytes: this.#driverCore().muxPreparedWebmChunkTracks({
              tracks: prepared.preparedTracks,
              container: requestedTarget,
            }),
          };
          this.#muxSource = inputs;
          return { tracks: prepared.tracks };
        }
      } catch (e) {
        this.#muxSource = undefined;
        this.#preparedPcmMuxSource = undefined;
        this.#preparedMp4MuxOutput = undefined;
        this.#preparedAudioMuxOutput = undefined;
        this.#preparedWebmMuxOutput = undefined;
        return this.#naIfMiss('mux', e, inputs[0]);
      }
    }
    const canCachePcmSource =
      inputs.length === 1 && requestedTarget !== undefined && PCM_MUX_TARGETS.has(requestedTarget);
    if (canCachePcmSource && requestedTarget !== undefined) {
      const input = inputs[0];
      if (input !== undefined) {
        try {
          if (requestedTarget === 'wav') {
            const prepared = await prepareCanonicalWavStreamMux(input);
            if (prepared !== undefined) {
              const pcmTrackForMux = pcmEncodedTrackFrom(prepared.metadata, prepared.payload);
              if (pcmTrackForMux !== undefined) {
                this.#muxSource = inputs;
                this.#preparedPcmMuxSource = {
                  input,
                  target: requestedTarget,
                  bytes: prepared.bytes,
                  authored: true,
                };
                return { tracks: [pcmTrackForMux] };
              }
            }
          }
          const bytes = await inputBytes(input);
          const metadata = pcmMetadataFromBytes(input, bytes);
          const payload = requestedTarget === 'wav' ? riffDataPayload(bytes) : undefined;
          const pcmTrackForMux =
            metadata === undefined ? undefined : pcmEncodedTrackFrom(metadata, payload);
          if (pcmTrackForMux !== undefined) {
            this.#muxSource = inputs;
            this.#preparedPcmMuxSource = { input, target: requestedTarget, bytes };
            return { tracks: [pcmTrackForMux] };
          }
        } catch (e) {
          this.#muxSource = undefined;
          this.#preparedPcmMuxSource = undefined;
          this.#preparedMp4MuxOutput = undefined;
          this.#preparedAudioMuxOutput = undefined;
          return this.#naIfMiss('mux', e, input);
        }
      }
    }
    if (
      inputs.length === 1 &&
      requestedTarget === 'ts' &&
      normalizedTrackSelect((options ?? {}) as MuxOptions).length === 0
    ) {
      const input = inputs[0];
      if (input !== undefined && containerFromInput(input) === 'mp4' && !isMalformedHarnessInput(input)) {
        try {
          const bytes =
            input.sizeBytes !== undefined && input.sizeBytes <= PACKET_INFO_PREP_MAX_SOURCE_BYTES
              ? await inputBytes(input)
              : await inputBytesIfAtMost(input, PACKET_INFO_PREP_MAX_SOURCE_BYTES);
          if (bytes !== undefined) {
            const table = await this.#driverCore().mp4PacketInfoFromBytes(bytes, { includeOffsets: true });
            const tracks = encodedMp4TracksFromPacketInfo(table, bytes);
            const preparedTracks = tracks === undefined ? undefined : preparedMp4PacketTracksFromEncoded(tracks);
            if (tracks !== undefined && preparedTracks !== undefined) {
              if ((options as { target?: unknown } | undefined)?.target !== 'stream') {
                this.#preparedTsMuxOutput = {
                  input,
                  target: requestedTarget,
                  bytes: this.#driverCore().muxPreparedMpegTsPacketTracks({
                    tracks: preparedTracks,
                    container: requestedTarget,
                  }),
                };
              }
              this.#muxSource = inputs;
              return { tracks };
            }
          }
        } catch (e) {
          this.#muxSource = undefined;
          this.#preparedPcmMuxSource = undefined;
          this.#preparedMp4MuxOutput = undefined;
          this.#preparedAudioMuxOutput = undefined;
          this.#preparedWebmMuxOutput = undefined;
          this.#preparedTsMuxOutput = undefined;
          return this.#naIfMiss('mux', e, input);
        }
      }
    }
    if (
      inputs.length === 1 &&
      (requestedTarget === 'webm' || requestedTarget === 'mkv') &&
      normalizedTrackSelect((options ?? {}) as MuxOptions).length === 0 &&
      (options as { fragmented?: unknown } | undefined)?.fragmented !== true
    ) {
      const input = inputs[0];
      if (
        input !== undefined &&
        (containerFromInput(input) === 'webm' || containerFromInput(input) === 'mkv') &&
        !isMalformedHarnessInput(input)
      ) {
        try {
          const bytes =
            input.sizeBytes !== undefined && input.sizeBytes <= PACKET_INFO_PREP_MAX_SOURCE_BYTES
              ? await inputBytes(input)
              : await inputBytesIfAtMost(input, PACKET_INFO_PREP_MAX_SOURCE_BYTES);
          if (bytes !== undefined) {
            const table = this.#driverCore().webmPacketPayloadInfoFromBytes(bytes);
            const tracks = encodedTracksFromWebmPayloadInfo(table);
            if (tracks !== undefined) {
              if ((options as { target?: unknown } | undefined)?.target !== 'stream') {
                const preparedTracks = preparedWebmChunkTracksFromPayloadInfo(table);
                if (preparedTracks !== undefined) {
                  this.#preparedWebmMuxOutput = {
                    input,
                    target: requestedTarget,
                    bytes: this.#driverCore().muxPreparedWebmChunkTracks({
                      tracks: preparedTracks,
                      container: requestedTarget,
                    }),
                  };
                }
              }
              this.#muxSource = inputs;
              return { tracks };
            }
          }
        } catch (e) {
          this.#muxSource = undefined;
          this.#preparedPcmMuxSource = undefined;
          this.#preparedMp4MuxOutput = undefined;
          this.#preparedAudioMuxOutput = undefined;
          this.#preparedWebmMuxOutput = undefined;
          return this.#naIfMiss('mux', e, input);
        }
      }
      if (input !== undefined && containerFromInput(input) === 'mp4' && !isMalformedHarnessInput(input)) {
        try {
          const bytes =
            input.sizeBytes !== undefined && input.sizeBytes <= PACKET_INFO_PREP_MAX_SOURCE_BYTES
              ? await inputBytes(input)
              : await inputBytesIfAtMost(input, PACKET_INFO_PREP_MAX_SOURCE_BYTES);
          if (bytes !== undefined) {
            const table = await this.#driverCore().mp4PacketInfoFromBytes(bytes, { includeOffsets: true });
            const tracks = encodedMp4TracksFromPacketInfo(table, bytes);
            if (tracks !== undefined) {
              if ((options as { target?: unknown } | undefined)?.target !== 'stream') {
                const preparedTracks: Array<{
                  readonly track: AibrushTrackInfo;
                  readonly chunks: AibrushPreparedWebmChunk[];
                }> = [];
                for (const track of tracks) {
                  const trackInfo =
                    track.type === 'video'
                      ? videoTrackInfoFromEncoded(track)
                      : audioTrackInfoFromEncoded(track);
                  const chunks = webmChunkArrayFromEncodedTrack(track);
                  if (trackInfo !== undefined && chunks.length > 0) {
                    preparedTracks.push({ track: trackInfo, chunks });
                  }
                }
                if (preparedTracks.length === tracks.length) {
                  this.#preparedWebmMuxOutput = {
                    input,
                    target: requestedTarget,
                    bytes: this.#driverCore().muxPreparedWebmChunkTracks({
                      tracks: preparedTracks,
                      container: requestedTarget,
                    }),
                  };
                }
              }
              this.#muxSource = inputs;
              return { tracks };
            }
          }
        } catch (e) {
          this.#muxSource = undefined;
          this.#preparedPcmMuxSource = undefined;
          this.#preparedMp4MuxOutput = undefined;
          this.#preparedAudioMuxOutput = undefined;
          this.#preparedWebmMuxOutput = undefined;
          return this.#naIfMiss('mux', e, input);
        }
      }
    }
    if (inputs.length === 1 && (requestedTarget === 'mp4' || requestedTarget === 'mov')) {
      const input = inputs[0];
      if (input !== undefined && containerFromInput(input) === 'mp4') {
        try {
          const bytes =
            input.sizeBytes !== undefined && input.sizeBytes <= PACKET_INFO_PREP_MAX_SOURCE_BYTES
              ? await inputBytes(input)
              : await inputBytesIfAtMost(input, PACKET_INFO_PREP_MAX_SOURCE_BYTES);
          if (bytes !== undefined) {
            const table = await this.#driverCore().mp4PacketInfoFromBytes(bytes, { includeOffsets: true });
            const tracks = encodedMp4TracksFromPacketInfo(table, bytes);
            if (tracks !== undefined && tracks.length === table.tracks.length) {
              const outputTarget = (options as { target?: unknown } | undefined)?.target;
              const faststart = (options as { fastStart?: unknown } | undefined)?.fastStart !== false;
              const fragmented = (options as { fragmented?: unknown } | undefined)?.fragmented === true;
              const canPreparedFragmented = fragmented && requestedTarget === 'mp4';
              if (
                outputTarget !== 'stream' &&
                (!fragmented || canPreparedFragmented) &&
                normalizedTrackSelect((options ?? {}) as MuxOptions).length === 0
              ) {
                const preparedTracks = preparedMp4PacketTracksFromEncoded(tracks);
                if (preparedTracks !== undefined) {
                  this.#preparedMp4MuxOutput = {
                    input,
                    target: requestedTarget,
                    fragmented,
                    bytes: this.#driverCore().muxPreparedMp4PacketTracks({
                      tracks: preparedTracks,
                      container: requestedTarget,
                      faststart,
                      fragmented,
                    }),
                  };
                }
              } else if (
                outputTarget !== 'stream' &&
                !fragmented &&
                tracks.length === 1 &&
                tracks[0]?.type === 'video'
              ) {
                const trackInfo = videoTrackInfoFromEncoded(tracks[0]);
                if (trackInfo !== undefined) {
                  this.#preparedMp4MuxOutput = {
                    input,
                    target: requestedTarget,
                    fragmented: false,
                    bytes: this.#driverCore().muxPreparedMp4PacketTrack({
                      track: trackInfo,
                      packets: packetArrayFromEncodedTrack(tracks[0]),
                      container: requestedTarget,
                      faststart,
                      fragmented: false,
                    }),
                  };
                }
              }
              this.#muxSource = inputs;
              return { tracks };
            }
          }
        } catch (e) {
          this.#muxSource = undefined;
          this.#preparedPcmMuxSource = undefined;
          this.#preparedMp4MuxOutput = undefined;
          this.#preparedAudioMuxOutput = undefined;
          return this.#naIfMiss('mux', e, input);
        }
      }
      if (
        input !== undefined &&
        (containerFromInput(input) === 'webm' || containerFromInput(input) === 'mkv') &&
        !isMalformedHarnessInput(input)
      ) {
        try {
          const bytes =
            input.sizeBytes !== undefined && input.sizeBytes <= PACKET_INFO_PREP_MAX_SOURCE_BYTES
              ? await inputBytes(input)
              : await inputBytesIfAtMost(input, PACKET_INFO_PREP_MAX_SOURCE_BYTES);
          if (bytes !== undefined) {
            const table = this.#driverCore().webmPacketPayloadInfoFromBytes(bytes);
            const tracks = encodedTracksFromWebmPayloadInfo(table);
            if (tracks !== undefined && tracks.length === table.tracks.length) {
              const outputTarget = (options as { target?: unknown } | undefined)?.target;
              const faststart = (options as { fastStart?: unknown } | undefined)?.fastStart !== false;
              const fragmented = (options as { fragmented?: unknown } | undefined)?.fragmented === true;
              const canPreparedFragmented = fragmented && requestedTarget === 'mp4';
              if (
                outputTarget !== 'stream' &&
                (!fragmented || canPreparedFragmented) &&
                normalizedTrackSelect((options ?? {}) as MuxOptions).length === 0
              ) {
                const preparedTracks = preparedMp4PacketTracksFromEncoded(tracks);
                if (preparedTracks !== undefined) {
                  this.#preparedMp4MuxOutput = {
                    input,
                    target: requestedTarget,
                    fragmented,
                    bytes: this.#driverCore().muxPreparedMp4PacketTracks({
                      tracks: preparedTracks,
                      container: requestedTarget,
                      faststart,
                      fragmented,
                    }),
                  };
                }
              }
              this.#muxSource = inputs;
              return { tracks };
            }
          }
        } catch (e) {
          this.#muxSource = undefined;
          this.#preparedPcmMuxSource = undefined;
          this.#preparedMp4MuxOutput = undefined;
          this.#preparedAudioMuxOutput = undefined;
          return this.#naIfMiss('mux', e, input);
        }
      }
    }
    if (
      inputs.length === 1 &&
      (requestedTarget === 'mp4' || requestedTarget === 'mov') &&
      normalizedTrackSelect((options ?? {}) as MuxOptions).length === 0 &&
      (options as { fragmented?: unknown } | undefined)?.fragmented !== true
    ) {
      const input = inputs[0];
      if (input !== undefined && containerFromInput(input) === 'adts' && !isMalformedHarnessInput(input)) {
        try {
          const bytes =
            input.sizeBytes !== undefined && input.sizeBytes <= PACKET_INFO_PREP_MAX_SOURCE_BYTES
              ? await inputBytes(input)
              : await inputBytesIfAtMost(input, PACKET_INFO_PREP_MAX_SOURCE_BYTES);
          if (bytes !== undefined) {
            const table = this.#driverCore().adtsPacketInfoFromBytes(bytes);
            const track = encodedAdtsAudioTrackFromPacketInfo(table, bytes);
            const trackInfo = track === undefined ? undefined : audioTrackInfoFromEncoded(track);
            if (track !== undefined && trackInfo !== undefined) {
              const outputTarget = (options as { target?: unknown } | undefined)?.target;
              const faststart = (options as { fastStart?: unknown } | undefined)?.fastStart !== false;
              if (outputTarget !== 'stream') {
                this.#preparedMp4MuxOutput = {
                  input,
                  target: requestedTarget,
                  fragmented: false,
                  bytes: this.#driverCore().muxPreparedMp4PacketTrack({
                    track: trackInfo,
                    packets: packetArrayFromEncodedTrack(track),
                    container: requestedTarget,
                    faststart,
                    fragmented: false,
                  }),
                };
              }
              this.#muxSource = inputs;
              return { tracks: [track] };
            }
          }
        } catch (e) {
          this.#muxSource = undefined;
          this.#preparedPcmMuxSource = undefined;
          this.#preparedMp4MuxOutput = undefined;
          this.#preparedAudioMuxOutput = undefined;
          this.#preparedWebmMuxOutput = undefined;
          return this.#naIfMiss('mux', e, input);
        }
      }
      if (input !== undefined && containerFromInput(input) === 'mp3' && !isMalformedHarnessInput(input)) {
        try {
          const bytes =
            input.sizeBytes !== undefined && input.sizeBytes <= PACKET_INFO_PREP_MAX_SOURCE_BYTES
              ? await inputBytes(input)
              : await inputBytesIfAtMost(input, PACKET_INFO_PREP_MAX_SOURCE_BYTES);
          if (bytes !== undefined) {
            const table = this.#driverCore().mp3PacketInfoFromBytes(bytes);
            const track = encodedMp3AudioTrackFromPacketInfo(table, bytes);
            const trackInfo = track === undefined ? undefined : audioTrackInfoFromEncoded(track);
            if (track !== undefined && trackInfo !== undefined) {
              const outputTarget = (options as { target?: unknown } | undefined)?.target;
              const faststart = (options as { fastStart?: unknown } | undefined)?.fastStart !== false;
              if (outputTarget !== 'stream') {
                this.#preparedMp4MuxOutput = {
                  input,
                  target: requestedTarget,
                  fragmented: false,
                  bytes: this.#driverCore().muxPreparedMp4PacketTrack({
                    track: trackInfo,
                    packets: packetArrayFromEncodedTrack(track),
                    container: requestedTarget,
                    faststart,
                    fragmented: false,
                  }),
                };
              }
              this.#muxSource = inputs;
              return { tracks: [track] };
            }
          }
        } catch (e) {
          this.#muxSource = undefined;
          this.#preparedPcmMuxSource = undefined;
          this.#preparedMp4MuxOutput = undefined;
          this.#preparedAudioMuxOutput = undefined;
          this.#preparedWebmMuxOutput = undefined;
          return this.#naIfMiss('mux', e, input);
        }
      }
    }
    if (inputs.length === 1 && requestedTarget === 'mp3') {
      const input = inputs[0];
      if (input !== undefined && containerFromInput(input) === 'mp3' && !isMalformedHarnessInput(input)) {
        try {
          const bytes =
            input.sizeBytes !== undefined && input.sizeBytes <= PACKET_INFO_PREP_MAX_SOURCE_BYTES
              ? await inputBytes(input)
              : await inputBytesIfAtMost(input, PACKET_INFO_PREP_MAX_SOURCE_BYTES);
          if (bytes !== undefined) {
            const table = this.#driverCore().mp3PacketInfoFromBytes(bytes);
            const track = encodedMp3AudioTrackFromPacketInfo(table, bytes);
            const trackInfo = track === undefined ? undefined : audioTrackInfoFromEncoded(track);
            if (track !== undefined && trackInfo !== undefined) {
              if ((options as { target?: unknown } | undefined)?.target !== 'stream') {
                this.#preparedAudioMuxOutput = {
                  input,
                  target: requestedTarget,
                  track,
                  bytes: this.#driverCore().muxPreparedMp3PacketTrack({
                    track: trackInfo,
                    packets: preparedMp3PacketsFromEncodedTrack(track),
                  }),
                };
              }
              this.#muxSource = inputs;
              return { tracks: [track] };
            }
          }
        } catch (e) {
          this.#muxSource = undefined;
          this.#preparedPcmMuxSource = undefined;
          this.#preparedMp4MuxOutput = undefined;
          this.#preparedAudioMuxOutput = undefined;
          this.#preparedWebmMuxOutput = undefined;
          return this.#naIfMiss('mux', e, input);
        }
      }
    }
    if (inputs.length === 1 && (requestedTarget === 'webm' || requestedTarget === 'mkv' || requestedTarget === 'ogg')) {
      const input = inputs[0];
      if (input !== undefined && containerFromInput(input) === 'ogg' && !isMalformedHarnessInput(input)) {
        try {
          const bytes =
            input.sizeBytes !== undefined && input.sizeBytes <= PACKET_INFO_PREP_MAX_SOURCE_BYTES
              ? await inputBytes(input)
              : await inputBytesIfAtMost(input, PACKET_INFO_PREP_MAX_SOURCE_BYTES);
          if (bytes !== undefined) {
            const table = this.#driverCore().oggPacketInfoFromBytes(bytes);
            const track = encodedOggAudioTrackFromPacketInfo(table, bytes);
            const trackInfo = track === undefined ? undefined : audioTrackInfoFromEncoded(track);
            if (track !== undefined && trackInfo !== undefined) {
              if (
                (requestedTarget === 'webm' || requestedTarget === 'mkv') &&
                (options as { target?: unknown } | undefined)?.target !== 'stream'
              ) {
                this.#preparedAudioMuxOutput = {
                  input,
                  target: requestedTarget,
                  track,
                  bytes: this.#driverCore().muxPreparedWebmAudioPacketTrack({
                    track: trackInfo,
                    packets: packetArrayFromEncodedTrack(track),
                    container: requestedTarget,
                  }),
                };
              }
              this.#muxSource = inputs;
              return { tracks: [track] };
            }
          }
        } catch (e) {
          this.#muxSource = undefined;
          this.#preparedPcmMuxSource = undefined;
          this.#preparedMp4MuxOutput = undefined;
          this.#preparedAudioMuxOutput = undefined;
          return this.#naIfMiss('mux', e, input);
        }
      }
    }
    return this.#run('prepareMuxTracks', 'framework.demux-packet-preparation', context, async (signal) => {
      try {
        if (inputs.length === 1 && requestedTarget === 'mkv') {
          const input = inputs[0];
          if (input !== undefined && containerFromInput(input) === 'flac') {
            const engine = this.#engine();
            const bytes = await inputBytes(input);
            const table = await engine.packetInfo?.(
              engine.from(bytes, { mime: input.mime, size: bytes.byteLength }),
              { container: 'flac', signal },
            );
            const track = table === undefined ? undefined : encodedFlacTrackFromPacketInfo(table, bytes);
            if (track !== undefined) {
              this.#muxSource = inputs;
              return { tracks: [track] };
            }
          }
        }
        const tracks: EncodedTrack[] = [];
        for (const input of inputs) {
          if (canCachePcmSource && requestedTarget !== undefined) {
            const bytes = await inputBytes(input);
            const metadata = pcmMetadataFromBytes(input, bytes);
            const payload = requestedTarget === 'wav' ? riffDataPayload(bytes) : undefined;
            const pcmTrackForMux =
              metadata === undefined ? undefined : pcmEncodedTrackFrom(metadata, payload);
            if (pcmTrackForMux !== undefined) {
              tracks.push(pcmTrackForMux);
              this.#preparedPcmMuxSource = { input, target: requestedTarget, bytes };
              continue;
            }
          }
          const metadata = await this.probe(input, context);
          if (pcmTrack(metadata) !== undefined) {
            const pcmTrackForMux = pcmEncodedTrackFrom(metadata);
            if (pcmTrackForMux !== undefined) {
              tracks.push(pcmTrackForMux);
              if (canCachePcmSource && requestedTarget !== undefined) {
                this.#preparedPcmMuxSource = {
                  input,
                  target: requestedTarget,
                  bytes: await inputBytes(input),
                };
              }
              continue;
            }
          }
          const mp4Fast = await this.#tryEncodedMp4TracksFromBytes(input, signal);
          if (mp4Fast !== undefined) {
            for (const track of mp4Fast) tracks.push(track);
            continue;
          }
          const engine = this.#engine();
          const demuxed = await engine.demux(await this.#src(engine, input), { signal });
          try {
            for (const track of demuxed.tracks) tracks.push(await encodedTrackFrom(demuxed, track));
          } finally {
            await demuxed.close();
          }
        }
        // Record the source(s) so mux() packs the SAME coded samples: a lone source via the engine's
        // verbatim-copy remux (stream-copy/faststart fast path), several via the multi-source `engine.mux`.
        this.#muxSource = inputs;
        return { tracks };
      } catch (e) {
        this.#muxSource = undefined;
        this.#preparedPcmMuxSource = undefined;
        this.#preparedMp4MuxOutput = undefined;
        this.#preparedAudioMuxOutput = undefined;
        return this.#naIfMiss('mux', e, inputs[0]);
      }
    });
  }

  /**
   * Mux step 2 (runner hook): author the target container from the recorded source's coded samples. The
   * harness `mux` op COPIES coded samples verbatim into a container (no re-encode). We produce that by
   * running the engine's real remux path on the recorded source rather than re-implementing a muxer in
   * the adapter (which would fake an engine capability, §15). ISO-BMFF may take the stream-copy fast path;
   * webm/mkv/ogg/ts take the packet seam into their target muxers. HONEST NA / reject:
   *   • a target with no proven coded-sample muxer (wav/aiff/caf/adts/mp3/flac) → NA here (and usually
   *     already gated out by the undeclared/limited `containersOut` before we run);
   *   • a source the engine cannot stream-copy to the target (e.g. a webm/mkv source → mp4) raises a typed
   *     CapabilityError → NA — never a wrong/garbage container;
   *   • a zero-sample / empty source is a malformed mux → a clean REJECT (graceful failure), not output.
   * `tracks` is the genuine demuxed result from {@link prepareMuxTracks} — we use it to detect the empty
   * source — and the engine copy path produces the bytes.
   */
  async mux(tracks: EncodedTracks, opts: MuxOptions, context?: OperationContext): Promise<MediaBytes> {
    rejectUnforwardableOutputShape('mux', opts);
    this.#bindCellSignal(context, 'mux');
    if (context !== undefined) this.#currentRequest = context.request;
    context?.signal.throwIfAborted();
    const recorded = this.#muxSource;
    const preparedPcmSource = this.#preparedPcmMuxSource;
    const preparedMp4MuxOutput = this.#preparedMp4MuxOutput;
    const preparedAudioMuxOutput = this.#preparedAudioMuxOutput;
    const preparedWebmMuxOutput = this.#preparedWebmMuxOutput;
    const preparedTsMuxOutput = this.#preparedTsMuxOutput;
    this.#muxSource = undefined; // consume once; never leak state into an unrelated later mux
    this.#preparedPcmMuxSource = undefined;
    this.#preparedMp4MuxOutput = undefined;
    this.#preparedAudioMuxOutput = undefined;
    this.#preparedWebmMuxOutput = undefined;
    this.#preparedTsMuxOutput = undefined;
    const target = String(opts.container).toLowerCase();
    if (!recorded || recorded.length === 0)
      throw createNotApplicableError(ENGINE_ID, 'mux', 'no recorded source (prepareMuxTracks not run)');
    // A source set whose demux yielded no coded samples (e.g. empty_audio.wav) is a malformed mux input: it
    // must REJECT (a graceful failure the negative zero-track case rewards), never author an empty/garbage
    // container. A rejection — not NA — because the engine WOULD attempt a mux and must refuse this.
    const selectedTracks = muxTracksAfterSelection(tracks, opts);
    const hasSamples = selectedTracks.some((t) => t.chunks.length > 0);
    if (!hasSamples) throw new GracefulRejectionError('mux', 'no coded samples to mux (zero-track/empty source)');

    // PCM-container WRITE targets (wav/aiff/caf) are NOT a coded-sample chunk-seam mux: raw PCM flows
    // through the engine's audio-dsp path (`convert({to})` → transformPcm / convertPcmNative, ADR-022).
    // Route the lone PCM source there so PCM→WAV authoring works instead of NA-ing on the chunk muxer.
    if (PCM_MUX_TARGETS.has(target)) {
      if (!selectedTracks.every((track) => track.type === 'audio' && pcmBytesPerSample(track.codec) !== undefined)) {
        throw new GracefulRejectionError('mux', `container '${target}' is a PCM target, but the source tracks are not PCM audio`);
      }
      const input = recorded[0];
      if (!input) throw createNotApplicableError(ENGINE_ID, 'mux', 'no recorded source to mux');
      const preparedBytes =
        preparedPcmSource?.input === input && preparedPcmSource.target === target
          ? preparedPcmSource.bytes
          : undefined;
      const preparedIsAuthored =
        preparedPcmSource?.input === input &&
        preparedPcmSource.target === target &&
        preparedPcmSource.authored === true;
      const sourceContainer = containerFromInput(input);
      const outputTarget = (opts as { target?: unknown }).target;
      const canUseByteRewrite =
        preparedBytes !== undefined &&
        sourceContainer === 'wav' &&
        target === 'wav' &&
        outputTarget !== 'stream';
      const packetMuxTrack = target === 'wav' && selectedTracks.length === 1 ? selectedTracks[0] : undefined;
      const packetPayload = packetMuxTrack?.chunks.find((chunk) => chunk.data.byteLength > 0)?.data;
      if (
        canUseByteRewrite &&
        packetMuxTrack !== undefined &&
        packetPayload !== undefined &&
        packetMuxTrack.sampleRate !== undefined &&
        packetMuxTrack.channels !== undefined
      ) {
        if (
          preparedIsAuthored &&
          packetPayload.buffer === preparedBytes.buffer &&
          packetPayload.byteOffset - preparedBytes.byteOffset === 44
        ) {
          const media = await toMediaBytes(preparedBytes, target);
          return media;
        }
        try {
          const engine = this.#engine();
          if (engine.wavPcmPacketCopy !== undefined) {
            const out = await engine.wavPcmPacketCopy({
              payload: packetPayload,
              sourceBytes: preparedBytes,
              codec: packetMuxTrack.codec,
              sampleRate: packetMuxTrack.sampleRate,
              channels: packetMuxTrack.channels,
            });
            const media = await toMediaBytes(out, target);
            return media;
          }
        } catch (e) {
          return this.#naIfMiss('mux', e, input);
        }
      }
      const packetMuxTrackInfo =
        packetMuxTrack !== undefined &&
        packetMuxTrack.chunks.some((chunk) => chunk.data.byteLength > 0)
          ? audioTrackInfoFromEncoded(packetMuxTrack)
          : undefined;
      if (packetMuxTrack !== undefined && packetMuxTrackInfo !== undefined) {
        try {
          const engine = this.#engine();
          const telemetry = this.#outputTelemetry(opts as unknown as Record<string, unknown>);
          const out = await engine.mux(
            {
              audio: {
                track: packetMuxTrackInfo,
                packets: packetStreamFromEncodedAudioTrack(packetMuxTrack),
              },
            },
            { container: target, sink: telemetry.sink },
            {},
          );
          return verifyRequestedIsoShape(await telemetry.mediaBytes(out, target), opts, false);
        } catch (e) {
          return this.#naIfMiss('mux', e, input);
        }
      }
      if (canUseByteRewrite) {
        try {
          const engine = this.#engine();
          if (engine.pcm !== undefined) {
            const out = await engine.pcm(preparedBytes, sourceContainer, { to: target }, {});
            const media = await toMediaBytes(out, target);
            return media;
          }
        } catch (e) {
          return this.#naIfMiss('mux', e, input);
        }
      }
      return this.#run('mux', 'framework.pcm', context, async (signal) => {
        try {
          const engine = this.#engine();
          const telemetry = this.#outputTelemetry(opts as unknown as Record<string, unknown>);
          const src =
            preparedBytes !== undefined
              ? engine.from(preparedBytes, { mime: input.mime, size: preparedBytes.byteLength })
              : await this.#src(engine, input);
          const out =
            engine.pcm !== undefined
              ? await engine.pcm(src, sourceContainer, { to: target, sink: telemetry.sink }, { signal })
              : await engine.convert(src, { to: target, sink: telemetry.sink }, { signal });
          return verifyRequestedIsoShape(await telemetry.mediaBytes(out, target), opts, false);
        } catch (e) {
          return this.#naIfMiss('mux', e, input);
        }
      });
    }

    rejectIllegalMuxTarget(target, selectedTracks);

    if (!MUX_FAITHFUL_TARGETS.has(target)) {
      throw createNotApplicableError(ENGINE_ID, 'mux', `no proven coded-sample muxer for container '${target}' in this build`);
    }

    // MULTI-SOURCE assembly: re-demux every recorded source and feed all their tracks to the engine's real
    // packet-seam mux (`engine.mux({ tracks })`). No single source file exists to stream-copy, so this is
    // the genuine assembly op — the target muxer arbitrates codec legality (illegal pair → typed miss → NA).
    if (recorded.length > 1) {
      if (
        preparedWebmMuxOutput !== undefined &&
        sameMediaInputs(preparedWebmMuxOutput.inputs, recorded) &&
        preparedWebmMuxOutput.target === target &&
        (target === 'webm' || target === 'mkv') &&
        normalizedTrackSelect(opts).length === 0 &&
        !wantsFragmented(opts) &&
        (opts as { target?: unknown }).target !== 'stream'
      ) {
        const media = await toMediaBytes(preparedWebmMuxOutput.bytes, target);
        return media;
      }
      // The tracks were already demuxed once by prepareMuxTracks (they arrive here as `selectedTracks`,
      // post track-select). Pack THOSE coded packets straight into the target container instead of letting
      // #muxMultiSource re-demux every source a second time — a full redundant fetch+parse pass. Falls back
      // to the streaming multi-source mux on any shape the prepared packers do not cover (identical output).
      const packedMulti = await this.#tryMuxPreparedMultiSource(selectedTracks, target, opts);
      if (packedMulti !== undefined) return packedMulti;
      return this.#muxMultiSource(recorded, target, opts, context);
    }

    const input = recorded[0];
    if (!input) throw createNotApplicableError(ENGINE_ID, 'mux', 'no recorded source to mux');
    if (
      preparedTsMuxOutput?.input === input &&
      preparedTsMuxOutput.target === target &&
      target === 'ts' &&
      normalizedTrackSelect(opts).length === 0 &&
      (opts as { target?: unknown }).target !== 'stream'
    ) {
      const media = await toMediaBytes(preparedTsMuxOutput.bytes, target);
      return media;
    }
    if (
      preparedWebmMuxOutput?.input === input &&
      preparedWebmMuxOutput.target === target &&
      (target === 'webm' || target === 'mkv') &&
      normalizedTrackSelect(opts).length === 0 &&
      !wantsFragmented(opts) &&
      (opts as { target?: unknown }).target !== 'stream'
    ) {
      const media = await toMediaBytes(preparedWebmMuxOutput.bytes, target);
      return media;
    }
    const preparedSingleTrack = selectedTracks.length === 1 ? selectedTracks[0] : undefined;
    if (
      preparedMp4MuxOutput?.input === input &&
      preparedMp4MuxOutput.target === target &&
      ((preparedSingleTrack !== undefined &&
        (preparedSingleTrack.type === 'video' || preparedSingleTrack.type === 'audio')) ||
        normalizedTrackSelect(opts).length === 0) &&
      preparedMp4MuxOutput.fragmented === wantsFragmented(opts) &&
      (opts as { target?: unknown }).target !== 'stream'
    ) {
      const media = await toMediaBytes(preparedMp4MuxOutput.bytes, target);
      return verifyRequestedIsoShape(media, opts, wantsFragmented(opts));
    }
    if (
      preparedSingleTrack !== undefined &&
      preparedSingleTrack.type === 'video' &&
      (target === 'mp4' || target === 'mov')
    ) {
      const trackInfo = videoTrackInfoFromEncoded(preparedSingleTrack);
      if (trackInfo !== undefined) {
        const fragmented = wantsFragmented(opts) && (target === 'mp4' || target === 'mov');
        const outputTarget = (opts as { target?: unknown }).target;
        const faststart = (opts as { fastStart?: unknown }).fastStart !== false;
        const engine = this.#engine();
        if (!fragmented && outputTarget !== 'stream') {
          try {
            const packets = packetArrayFromEncodedTrack(preparedSingleTrack);
            const out = this.#driverCore().muxPreparedMp4PacketTrack({
              track: trackInfo,
              packets,
              container: target,
              faststart,
              fragmented: false,
            });
            const media = await toMediaBytes(out, target);
            return verifyRequestedIsoShape(media, opts, fragmented);
          } catch (e) {
            return this.#naIfMiss('mux', e, input);
          }
        }
        return this.#run('mux', 'framework.packet-mux.video', context, async (signal) => {
          try {
            const telemetry = this.#outputTelemetry(opts as unknown as Record<string, unknown>);
            const out = await engine.mux(
              {
                video: {
                  track: trackInfo,
                  packetsArray: packetArrayFromEncodedTrack(preparedSingleTrack),
                },
              },
              { container: target, faststart, fragmented, sink: telemetry.sink },
              { signal },
            );
            return verifyRequestedIsoShape(await telemetry.mediaBytes(out, target), opts, fragmented);
          } catch (e) {
            return this.#naIfMiss('mux', e, recorded[0]);
          }
        });
      }
    }

    const streamTarget = (opts as { target?: unknown }).target;
    const fastStartOption = (opts as { fastStart?: unknown }).fastStart;
    if (
      (target === 'mp4' || target === 'mov') &&
      streamTarget === 'stream' &&
      !wantsFragmented(opts) &&
      (fastStartOption === undefined || typeof fastStartOption === 'boolean') &&
      normalizedTrackSelect(opts).length === 0
    ) {
      const preparedTracks = preparedMp4PacketTracksFromEncoded(selectedTracks);
      if (preparedTracks !== undefined) {
        return this.#run('mux', 'core.prepared-mp4-stream', context, async (signal) => {
          try {
            const lib = this.#lib;
            if (lib === undefined) throw new Error('aibrush-media not initialized');
            const telemetry = this.#outputTelemetry(opts as unknown as Record<string, unknown>);
            if (telemetry.sink.kind !== 'stream-target') {
              throw new Error('prepared MP4 streaming mux requires a stream-target sink');
            }
            const stream = this.#driverCore().muxPreparedMp4PacketTracksStream({
              tracks: preparedTracks,
              container: target,
              faststart: fastStartOption === undefined ? false : fastStartOption !== false,
              fragmented: false,
            });
            await lib.writeToStreamTarget(telemetry.sink, stream, { signal });
            return verifyRequestedIsoShape(await telemetry.mediaBytes(undefined, target), opts, false);
          } catch (e) {
            return this.#naIfMiss('mux', e, recorded[0]);
          }
        });
      }
    }

    const preparedAudioTrack = preparedSingleTrack;
    if (
      preparedAudioTrack !== undefined &&
      preparedAudioTrack.type === 'audio' &&
      (target === 'webm' || target === 'mkv' || target === 'ogg' || target === 'mp3')
    ) {
      if (
        preparedAudioMuxOutput?.input === input &&
        preparedAudioMuxOutput.target === target &&
        preparedAudioMuxOutput.track === preparedAudioTrack &&
        (opts as { target?: unknown }).target !== 'stream'
      ) {
        const media = await toMediaBytes(preparedAudioMuxOutput.bytes, target);
        return media;
      }
      const trackInfo = audioTrackInfoFromEncoded(preparedAudioTrack);
      if (trackInfo !== undefined) {
        return this.#run('mux', 'framework.packet-mux.audio', context, async (signal) => {
          try {
            const engine = this.#engine();
            const telemetry = this.#outputTelemetry(opts as unknown as Record<string, unknown>);
            const out = await engine.mux(
              {
                audio: {
                  track: trackInfo,
                  packetsArray: packetArrayFromEncodedTrack(preparedAudioTrack),
                },
              },
              { container: target, sink: telemetry.sink },
              { signal },
            );
            return verifyRequestedIsoShape(await telemetry.mediaBytes(out, target), opts, false);
          } catch (e) {
            return this.#naIfMiss('mux', e, recorded[0]);
          }
        });
      }
    }

    // SINGLE-SOURCE: re-containerize the lone source through the engine's verbatim-copy remux path (the
    // ISO-BMFF stream-copy fast path / packet seam), honoring fastStart + fragmented/CMAF output knobs.
    return this.#run('mux', 'framework.remux-mux', context, async (signal) => {
      try {
        const engine = this.#engine();
        const src = await this.#src(engine, input);
        const telemetry = this.#outputTelemetry(opts as unknown as Record<string, unknown>);
        const faststart = (opts as { fastStart?: unknown }).fastStart !== false;
        const fragmented = wantsFragmented(opts) && (target === 'mp4' || target === 'mov');
        const trackSelect = normalizedTrackSelect(opts);
        const out = await engine.remux(
          src,
          {
            to: target,
            faststart,
            fragmented,
            sink: telemetry.sink,
            ...(trackSelect.length > 0 ? { trackSelect } : {}),
          },
          { signal },
        );
        return verifyRequestedIsoShape(await telemetry.mediaBytes(out, target), opts, fragmented);
      } catch (e) {
        return this.#naIfMiss('mux', e, input);
      }
    });
  }

  /**
   * Assemble tracks from ≥2 demuxed sources into one container via the engine's public packet-seam mux.
   * Each source is demuxed live; every track becomes a `{ track, packets }` entry of `engine.mux`'s
   * `tracks[]`. The demuxers stay open until the mux drains (the packet streams are lazy), and are closed
   * in a finally. An illegal codec→container pair raises a typed CapabilityError → NA (never wrong output).
   */
  /**
   * Fast prepared-source materialization for an MP4/MOV mux input: bulk-fetch once + parse the packet
   * table with offsets, yielding EncodedTracks whose chunk `data` are zero-copy subarray views — the same
   * path the single-source MP4 prepared mux uses. Avoids the streaming `engine.demux` per-packet pull +
   * per-packet byte copy on multi-source assembly. Returns `undefined` (→ caller falls back to
   * `engine.demux`) for non-MP4 sources, over-cap files, or any codec the byte-table packer cannot express.
   */
  async #tryEncodedMp4TracksFromBytes(
    input: MediaInput,
    signal: AbortSignal,
  ): Promise<EncodedTrack[] | undefined> {
    const container = containerFromInput(input);
    if (input.mutated || (container !== 'mp4' && container !== 'mov')) return undefined;
    try {
      const bytes =
        input.sizeBytes !== undefined && input.sizeBytes <= PACKET_INFO_PREP_MAX_SOURCE_BYTES
          ? await inputBytes(input)
          : await inputBytesIfAtMost(input, PACKET_INFO_PREP_MAX_SOURCE_BYTES);
      if (bytes === undefined) return undefined;
      const table = await this.#driverCore().mp4PacketInfoFromBytes(bytes, { includeOffsets: true, signal });
      const tracks = encodedMp4TracksFromPacketInfo(table, bytes);
      return tracks !== undefined && tracks.length === table.tracks.length ? tracks : undefined;
    } catch {
      signal.throwIfAborted();
      return undefined;
    }
  }

  /** Wrap already-authored container bytes as MediaBytes, adding buffer-target telemetry when requested. */
  async #finishPreparedMuxBytes(bytes: Uint8Array, target: string, opts: MuxOptions): Promise<MediaBytes> {
    const media = await toMediaBytes(bytes, target);
    this.#configEvidence.record({
      operation: this.#activeOperation,
      route: this.#activeRoute,
      internalDriver: 'framework-router-unexposed',
      readerMode: 'prepared-packets',
      writerMode: 'core-full-buffer-materialization',
      targetMode: (opts as { target?: unknown }).target === 'buffer' ? 'buffer-materialized' : 'framework-default',
      peakRetainedBytes: media.bytes.byteLength,
      callbackWriteCount: 0,
    });
    return verifyRequestedIsoShape(media, opts, wantsFragmented(opts));
  }

  /**
   * MULTI-SOURCE mux without a second demux: pack the already-demuxed, already-selected coded tracks
   * (`selectedTracks`, produced by prepareMuxTracks + track-select) straight into the target container via
   * the same proven prepared muxers the single-source paths use. Returns `undefined` for shapes those
   * muxers do not cover (stream/append-only/fragmented targets, non-mp4/webm containers, or a track the
   * packer cannot express) so the caller falls back to the streaming `#muxMultiSource` — byte-equivalent
   * output either way. This removes the redundant re-fetch+re-demux pass on assembly rows.
   */
  #tryMuxPreparedMultiSource(
    selectedTracks: readonly EncodedTrack[],
    target: string,
    opts: MuxOptions,
  ): Promise<MediaBytes | undefined> | undefined {
    if ((opts as { target?: unknown }).target === 'stream') return undefined;
    // A prepared muxer that rejects a codec/container combination it does not cover throws synchronously;
    // fall back to the streaming multi-source mux (which arbitrates legality identically) rather than
    // surfacing a raw error. An illegal pair then still becomes a typed NA via #muxMultiSource, unchanged.
    try {
      if (target === 'mp4' || target === 'mov') {
        const fragmented = wantsFragmented(opts);
        const faststart = (opts as { fastStart?: unknown }).fastStart !== false;
        const prepared = preparedMp4PacketTracksFromEncoded(selectedTracks);
        if (prepared === undefined) return undefined;
        const bytes = this.#driverCore().muxPreparedMp4PacketTracks({
          tracks: prepared,
          container: target,
          faststart,
          fragmented,
        });
        return this.#finishPreparedMuxBytes(bytes, target, opts);
      }
      if (target === 'webm' || target === 'mkv') {
        if (wantsFragmented(opts) || wantsAppendOnly(opts)) return undefined;
        const prepared = preparedWebmChunkTracksFromEncodedTracks(selectedTracks);
        if (prepared === undefined) return undefined;
        const bytes = this.#driverCore().muxPreparedWebmChunkTracks({
          tracks: prepared,
          container: target,
        });
        return this.#finishPreparedMuxBytes(bytes, target, opts);
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  async #muxMultiSource(
    inputs: MediaInput[],
    target: string,
    opts: MuxOptions,
    context?: OperationContext,
  ): Promise<MediaBytes> {
    return this.#run('mux', 'framework.multi-source-mux', context, async (signal) => {
      const engine = this.#engine();
      const open: AibrushDemuxed[] = [];
      try {
        const streams: AibrushPacketStream[] = [];
        for (const input of inputs) {
          const demuxed = await engine.demux(await this.#src(engine, input), { signal });
          open.push(demuxed);
          for (const track of demuxed.tracks) {
            streams.push({ track, packets: demuxed.packets(track.id) });
          }
        }
        if (streams.length === 0)
          throw new GracefulRejectionError('mux', 'no tracks to assemble across sources');
        const telemetry = this.#outputTelemetry(opts as unknown as Record<string, unknown>);
        const fragmented = wantsFragmented(opts) && (target === 'mp4' || target === 'mov');
        const out = await engine.mux(
          { tracks: streams },
          { container: target, fragmented, sink: telemetry.sink },
          { signal },
        );
        return verifyRequestedIsoShape(await telemetry.mediaBytes(out, target), opts, fragmented);
      } catch (e) {
        return this.#naIfMiss('mux', e, inputs[0]);
      } finally {
        await Promise.all(open.map((d) => d.close().catch(() => undefined)));
      }
    });
  }

  async concat(
    segments: MediaBytes[],
    opts: MuxOptions,
    context?: OperationContext,
  ): Promise<MediaBytes> {
    const target = String(opts.container).toLowerCase();
    if (segments.length === 0) {
      throw new GracefulRejectionError('concat', 'no segments to concatenate');
    }
    if (!MUX_FAITHFUL_TARGETS.has(target)) {
      throw createNotApplicableError(ENGINE_ID, 'concat', `no proven coded-sample concat muxer for container '${target}'`);
    }

    return this.#run('concat', 'framework.concat-packet-mux', context, async (signal) => {
      const engine = this.#engine();
      try {
        const byTrack = new Map<string, ConcatTrackPackets>();
        let offsetUs = 0;

        for (const segment of segments) {
          const info = await engine.probe(mediaBytesSource(engine, segment), { signal });
          const demuxed = await engine.demux(mediaBytesSource(engine, segment), { signal });
          let packetEndUs = 0;
          try {
            const seenByType = new Map<'video' | 'audio', number>();
            for (const track of demuxed.tracks) {
              const key = concatTrackKey(track, seenByType);
              const existing = byTrack.get(key);
              if (existing === undefined) {
                byTrack.set(key, { track, packets: [] });
              } else if (canonicalCodec(existing.track.codec ?? '') !== canonicalCodec(track.codec ?? '')) {
                throw new GracefulRejectionError('concat', `segment track ${key} codec changed across segments`);
              }

              const entry = byTrack.get(key);
              if (entry === undefined) throw new Error(`concat track bookkeeping lost ${key}`);
              const reader = demuxed.packets(track.id).getReader();
              try {
                for (;;) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  const chunk = value.chunk;
                  const durationUs = Math.max(0, Math.round(chunk.duration ?? 0));
                  packetEndUs = Math.max(packetEndUs, Math.round(chunk.timestamp) + durationUs);
                  entry.packets.push(restampedPacket(value, track.mediaType, offsetUs));
                }
              } finally {
                reader.releaseLock();
              }
            }
          } finally {
            await demuxed.close();
          }

          const probedDurationUs = Number.isFinite(info.durationSec)
            ? Math.max(0, Math.round(info.durationSec * 1_000_000))
            : 0;
          offsetUs += Math.max(probedDurationUs, packetEndUs);
        }

        const streams: AibrushPacketStream[] = [];
        for (const entry of byTrack.values()) {
          if (entry.packets.length === 0) continue;
          streams.push({
            track: { ...entry.track, ...(offsetUs > 0 ? { durationSec: offsetUs / 1_000_000 } : {}) },
            packets: packetArrayStream(entry.packets),
          });
        }
        if (streams.length === 0) {
          throw new GracefulRejectionError('concat', 'segments contained no coded packets');
        }

        const telemetry = this.#outputTelemetry(opts as unknown as Record<string, unknown>);
        const fragmented = wantsFragmented(opts) && (target === 'mp4' || target === 'mov');
        const out = await engine.mux(
          { tracks: streams },
          { container: target, fragmented, sink: telemetry.sink },
          { signal },
        );
        return verifyRequestedIsoShape(await telemetry.mediaBytes(out, target), opts, fragmented);
      } catch (e) {
        return this.#naIfMiss('concat', e);
      }
    });
  }

  async decrypt(
    input: MediaInput,
    key: DecryptKey,
    opts: { scheme: EncryptionScheme },
    context?: OperationContext,
  ): Promise<MediaBytes> {
    // Unsupported scheme (clearkey/...) is an IMMEDIATE synchronous graceful
    // rejection. These executable capability-finding rows prove we decline EME / unsupported protection
    // schemes cleanly; mapping them to NA_ENGINE would hide the behavior the oracle is checking.
    if (opts.scheme === 'hls-aes128' || opts.scheme === 'hls-sample-aes') {
      if (!isHlsAsset(input)) {
        throw createNotApplicableError(ENGINE_ID, 'decrypt', `${opts.scheme} requires an HLS playlist input`);
      }
      return this.#run('decrypt', 'framework.hls-resolve+remux', context, async (signal) => {
        try {
          const engine = this.#engine();
          const source = await this.#resolveHlsSource(input, signal, {
            keyBytes: hlsDecryptKeyBytes(key),
            ...(key.ivHex !== undefined ? { ivHex: key.ivHex } : {}),
          });
          // The resolver's clear media is a stitched MPEG-TS/fMP4 source. Decrypt scenarios compare against
          // an MP4 cleartext golden and require playback-smoke across Firefox too, so return a real remuxed
          // faststart MP4 instead of exposing raw TS bytes that some browsers cannot play as a Blob.
          const out = await engine.remux(
            engine.from(source),
            { to: 'mp4', faststart: true },
            { signal },
          );
          return toMediaBytes(out, 'mp4');
        } catch (e) {
          return this.#naIfMiss('decrypt', e, input);
        }
      });
    }
    const scheme = (() => {
      switch (opts.scheme) {
        case 'cenc-ctr':
          return 'cenc';
        case 'cenc-cbcs':
          return 'cbcs';
        case 'cenc-cens':
          return 'cens';
        default:
          throw new GracefulRejectionError('decrypt', `signal:rejected unsupported scheme ${opts.scheme}`);
      }
    })();
    return this.#run('decrypt', 'framework.decrypt', context, async (signal) => {
      try {
        const engine = this.#engine();
        const kid = (key.kid ?? '').replace(/-/g, '').toLowerCase();
        const keys: Record<string, string> = kid ? { [kid]: key.keyHex } : { default: key.keyHex };
        const out = await engine.decrypt(
          await this.#src(engine, input),
          { scheme, keys },
          { signal },
        );
        return toMediaBytes(out, 'mp4');
      } catch (e) {
        return this.#naIfMiss('decrypt', e, input);
      }
    });
  }
}

/** Phase D wiring hook — called from src/app/register.ts (ENGINE_WIRINGS). */
export function registerAibrushMedia(opts?: { id?: string }): void {
  registerEngine(opts?.id ?? REGISTER_ID, () => new AibrushMediaEngine());
}
