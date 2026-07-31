/**
 * src/core/engine.ts — the MediaEngine contract (§5) + normalized result types + CapabilitySet.
 *
 * AUTHORITATIVE. Every adapter implements `MediaEngine`; the runner/oracles/report consume the
 * result types here. Everything is bytes/blobs/metadata/frames in → bytes/metadata/frames out,
 * async, browser-native. No method exposes a library's internals — only observable behavior is
 * judged. Keep this file dependency-free (pure types) so it can be imported from page, Worker,
 * and bake contexts alike.
 */

export type BrowserName = 'brave' | 'chromium' | 'webkit' | 'firefox';

/** Adapter promises that URL probe reads enforce MediaInput.contentAttestation block-by-block. */
export const AUTHENTICATED_RANGE_PROBE_FEATURE = 'probe:authenticated-range' as const;

/** Adapter promises that large operation inputs enforce MediaInput.contentAttestation block-by-block. */
export const AUTHENTICATED_RANGE_INPUT_FEATURE = 'input:authenticated-range' as const;

/**
 * Authenticated fixed-block snapshot for a large URL input. Adapters may use the URL only through a
 * fetch surface that verifies each delivered block against this map.
 */
export interface MediaInputContentAttestation {
  schema: 'media-test/url-content-attestation@1';
  logicalPath: string;
  sha256: string;
  sizeBytes: number;
  chunkSizeBytes: number;
  chunkSha256: readonly string[];
}

/** A corpus asset, served as a static file (supports HTTP Range). */
export interface MediaInput {
  /** corpus asset id, e.g. 'h264_1080p_30s.mp4' */
  id: string;
  /** served static URL; supports HTTP Range */
  url: string;
  mime: string;
  /** Manifest-declared byte length when known; absent for mutated/in-memory inputs. */
  sizeBytes?: number;
  /** true when robustness logic rewrites bytes before the engine receives them */
  mutated?: boolean;
  /** Present only on unmutated URL transport admitted by incremental full-body hashing. */
  contentAttestation?: MediaInputContentAttestation;
  blob(): Promise<Blob>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type ProbeReadMode = 'range' | 'progressive' | 'whole-file';

export interface ProbeResourceAccessEvidence {
  role: 'playlist' | 'segment' | 'key' | 'other';
  uri: string;
  disposition: 'read' | 'denied' | 'missing' | 'error';
}

/** Adapter-owned facts about how one probe reached its result. Missing evidence is never an empty trace. */
export interface ProbeAdapterEvidence {
  readMode: ProbeReadMode;
  resourceAccesses?: ProbeResourceAccessEvidence[];
}

// ── Adapter operation telemetry ───────────────────────────────────────────────────────────────────────────

/**
 * Cumulative operation-relative telemetry. `atMs` is measured from operation entry and must be
 * monotonic. Count/byte fields are totals (not deltas), which makes callback loss detectable by
 * comparing the last event with the final counters returned alongside the normalized result.
 */
export type OperationTelemetry =
  | { type: 'progress'; atMs: number; determinate: true; value: number }
  | { type: 'progress'; atMs: number; determinate: false }
  | { type: 'bytes-read'; atMs: number; bytes: number }
  | { type: 'bytes-written'; atMs: number; bytes: number }
  | { type: 'write-count'; atMs: number; count: number }
  | { type: 'first-byte'; atMs: number }
  | { type: 'decoded-frame-count'; atMs: number; count: number }
  | { type: 'encoded-frame-count'; atMs: number; count: number }
  | { type: 'first-frame'; atMs: number }
  | { type: 'framework-fallback'; atMs: number; from: string; to: string; reasonCode: string; reason: string };

/** Callback-independent final telemetry returned with an adapter observation. */
export interface OperationFinalCounters {
  progress?: number;
  bytesRead?: number;
  bytesWritten?: number;
  writeCount?: number;
  decodedFrames?: number;
  encodedFrames?: number;
  packetCount?: number;
  firstByteMs?: number;
  firstFrameMs?: number;
  fallback?: { from: string; to: string; reasonCode: string; reason: string };
}

/** Bytes produced by an operation (remux/transcode/trim/mux/decrypt). */
export interface MediaIntermediateBytes {
  /** Stable semantic role, e.g. an observed first leg in a two-leg metamorphic operation. */
  role: string;
  bytes: Uint8Array;
  mime: string;
  container: string;
}

/** Exact positioned-write evidence for mux output-mode correctness. */
export interface MuxPositionedWriteEvidence {
  sequence: number;
  atMs: number;
  position: number;
  bytes: Uint8Array;
  kind: 'append' | 'patch';
}

export interface MuxWriteReservationEvidence {
  sequence: number;
  position: number;
  length: number;
}

export interface MuxWriteTraceEvidence {
  schema: 'media-test/mux-write-trace@1';
  writes: MuxPositionedWriteEvidence[];
  reservations: MuxWriteReservationEvidence[];
  finalByteLength: number;
  peakBufferedBytes: number;
}

export type MediaBytes = {
  bytes: Uint8Array;
  mime: string;
  container: string;
  /** Observable output-target write count, when the adapter can instrument a real target. */
  targetWrites?: number;
  /** Milliseconds from operation entry to the first observable output-target byte. */
  firstByteMs?: number;
  /** Multi-rendition operations such as ABR fanout. Includes the primary rendition as variants[0]. */
  variants?: MediaBytes[];
  /** Observable dependent-operation legs. These are evidence, never counted as final output bytes. */
  intermediates?: MediaIntermediateBytes[];
  /** Final callback-independent counters for this operation/output. */
  telemetry?: OperationFinalCounters;
  /** Functional-phase positioned writes used by mux correctness; absent means no trace was observed. */
  muxWriteTrace?: MuxWriteTraceEvidence;
};

export type TrackType = 'video' | 'audio' | 'subtitle' | 'other';

/** How the normalized `fps` value was obtained. */
export type FrameRateSource = 'nominal' | 'average' | 'observed';

/** Whether the observer found a constant, variable, or indeterminate presentation cadence. */
export type FrameRateCadence = 'CFR' | 'VFR' | 'UNKNOWN';

export interface FrameRateEnvelope {
  minFps: number;
  maxFps: number;
}

export interface RationalFrameRate {
  numerator: number;
  denominator: number;
}

interface FrameRateProvenanceBase {
  source: FrameRateSource;
  cadence?: FrameRateCadence;
  /** Exact frames-per-second rational when the observer exposes one. */
  rational?: RationalFrameRate;
  /** Instantaneous/summary FPS bounds for VFR or sampled observations. */
  envelope?: FrameRateEnvelope;
}

/**
 * Evidence behind `NormalizedTrack.fps`.
 *
 * For `average`/`observed`, the normalized rate is based on
 * `sampleCount * 1_000_000 / observedIntervalUs`. A nominal observer may also retain a sampled
 * cross-check, but it is not required. Keeping this evidence separate prevents a bounded packet
 * sample or a container's nominal rate from being presented as an exact observed cadence.
 */
export type FrameRateProvenance =
  | (FrameRateProvenanceBase & {
      source: 'nominal';
      sampleCount?: number;
      observedIntervalUs?: number;
    })
  | (FrameRateProvenanceBase & {
      source: 'average' | 'observed';
      sampleCount: number;
      observedIntervalUs: number;
    });

export const NORMALIZED_METADATA_SCHEMA = 'media-test/normalized-metadata@2' as const;

export type SemanticMetadataTagKey =
  | 'title'
  | 'artist'
  | 'album'
  | 'comment'
  | 'date'
  | 'genre'
  | 'trackNumber';

export type MetadataTagScope = 'container' | 'track' | 'chapter' | 'attachment';

/** A carrier observation whose raw spelling and logical scope have not been flattened away. */
export interface ScopedMetadataTag {
  readonly scope: MetadataTagScope;
  readonly rawKey: string;
  readonly value: string;
  readonly canonicalKey?: SemanticMetadataTagKey;
  readonly trackId?: string;
  readonly chapterId?: string;
  readonly attachmentId?: string;
  readonly language?: string;
  readonly isDefaultLanguage?: boolean;
}

export interface MetadataEditListEntry {
  readonly segmentDuration: number;
  readonly mediaTime: number;
  readonly mediaRateNumerator: number;
  readonly mediaRateDenominator: number;
  readonly movieTimescale: number;
  readonly mediaTimescale: number;
}

export interface MetadataChapter {
  readonly id: string;
  readonly startTimeSec: number;
  readonly endTimeSec?: number;
  readonly title?: string;
  readonly language?: string;
  readonly tags?: readonly ScopedMetadataTag[];
}

export interface MetadataCoverArt {
  readonly id: string;
  readonly mime: string;
  readonly byteLength: number;
  readonly sha256?: string;
  readonly width?: number;
  readonly height?: number;
  readonly description?: string;
  readonly language?: string;
}

export interface MetadataTimecode {
  readonly trackId?: string;
  readonly value: string;
  readonly rateNumerator?: number;
  readonly rateDenominator?: number;
  readonly dropFrame?: boolean;
}

export interface RotationMatrix {
  /** Row-major 3x3 display matrix before canonical rotation extraction. */
  readonly values: readonly [number, number, number, number, number, number, number, number, number];
}

export interface NormalizedTrack {
  type: TrackType;
  codec: string;
  /** Framework/native codec tag retained only as representation evidence; never used for scoring. */
  nativeCodecTag?: string;
  /** Raw carrier/framework codec spelling retained as evidence. */
  rawCodec?: string;
  /** Canonical benchmark codec identity used for semantic comparison. */
  canonicalCodec?: string;
  /** Transitional adapter/golden spellings retained for compatibility. */
  codecRaw?: string;
  codecCanonical?: string;
  trackId?: string;
  defaultDisposition?: boolean;
  disposition?: Readonly<Record<string, boolean | number>>;
  width?: number;
  height?: number;
  rawWidth?: number;
  rawHeight?: number;
  presentationWidth?: number;
  presentationHeight?: number;
  fps?: number;
  /** Typed derivation evidence for `fps`; legacy scalar-only producers remain valid. */
  fpsProvenance?: FrameRateProvenance;
  rateRational?: RationalFrameRate;
  cadence?: FrameRateCadence;
  frameTimestampsUs?: readonly number[];
  /** Canonical spelling for new adapters; `fpsProvenance` remains the compatibility spelling. */
  frameRateEvidence?: FrameRateProvenance;
  /** Compatibility evidence present in existing adapters and baked goldens. */
  cadenceMode?: FrameRateCadence;
  fpsNumerator?: number;
  fpsDenominator?: number;
  fpsMin?: number;
  fpsMax?: number;
  rotation?: number;
  rotationMatrix?: RotationMatrix;
  sampleRate?: number;
  channels?: number;
  /** Explicit coded/core versus rendered views used only when codec signaling proves equivalence. */
  codedSampleRate?: number;
  presentationSampleRate?: number;
  codedChannels?: number;
  presentationChannels?: number;
  bitrate?: number | null;
  language?: string | null;
  sourceTimebase?: RationalTimebase;
  movieTimebase?: RationalTimebase;
  mediaTimebase?: RationalTimebase;
  rawMediaSpanSec?: number;
  presentationDurationSec?: number;
  presentationStartSec?: number;
  editList?: readonly MetadataEditListEntry[];
  primingSamples?: number;
  paddingSamples?: number;
  remainderSamples?: number;
  audioObjectType?: number;
  sbrPresent?: boolean;
  psPresent?: boolean;
  scopedTags?: readonly ScopedMetadataTag[];
  /** Compatibility timing evidence already emitted by adapters/goldens. */
  timebaseTickUs?: number;
  mediaTimescale?: number;
  movieTimescale?: number;
  mediaDurationSec?: number;
  sampleSpanSec?: number;
  editListSpanSec?: number;
}

export interface NormalizedMetadata {
  schema?: typeof NORMALIZED_METADATA_SCHEMA;
  container: string;
  durationSec: number | null;
  presentationDurationSec?: number;
  rawMediaSpanSec?: number;
  sourceTimebase?: RationalTimebase;
  tracks: NormalizedTrack[];
  tags?: Record<string, string>;
  scopedTags?: readonly ScopedMetadataTag[];
  chapters?: readonly MetadataChapter[];
  coverArt?: readonly MetadataCoverArt[];
  timecodes?: readonly MetadataTimecode[];
  /** Compatibility timing evidence already present in baked metadata. */
  mediaDurationSec?: number;
  sampleSpanSec?: number;
  editListSpanSec?: number;
  timebaseTickUs?: number;
  movieTimescale?: number;
  presentationStartSec?: number;
  telemetry?: OperationFinalCounters;
  probeEvidence?: ProbeAdapterEvidence;
}

export interface PacketInfo {
  trackIndex: number;
  size: number;
  ptsUs: number;
  /** Decode timestamp when the framework/container exposes one. Never substitute PTS when absent. */
  dtsUs?: number;
  durationUs?: number;
  keyframe: boolean;
  /** Optional semantic packet evidence used to compare access units independent of packet grouping. */
  trackType?: TrackType;
  codec?: string;
  payload?: Uint8Array;
  payloadDigest?: string;
  accessUnitId?: string;
  framing?: CodedChunkFraming;
  nalLengthSize?: number;
  decoderConfig?: Uint8Array;
  randomAccessKind?: string;
  parameterSetDigests?: string[];
}

export type PacketOrdering = 'decode' | 'presentation';

export interface RationalTimebase {
  /** Seconds per tick = numerator / denominator. Both values are positive safe integers. */
  numerator: number;
  denominator: number;
}

export type CodedChunkFraming =
  | 'annexb'
  | 'avc'
  | 'hevc'
  | 'obu'
  | 'ivf'
  | 'adts'
  | 'raw'
  | 'codec-private';

export type AccessUnitGrouping =
  | 'one-access-unit-per-chunk'
  | 'one-frame-per-chunk'
  | 'one-packet-per-chunk'
  | 'multiple-access-units-per-chunk';

export type ParameterSetLocation = 'in-band' | 'description' | 'both' | 'not-applicable';

export type CodecDescriptionRecord =
  | 'avc-decoder-configuration-record'
  | 'hevc-decoder-configuration-record'
  | 'audio-specific-config'
  | 'codec-private';

/** Per-track packet representation retained by demuxers for an unambiguous demux→mux handoff. */
export interface DemuxTrackRepresentation {
  trackIndex: number;
  packetOrdering: PacketOrdering;
  timebase?: RationalTimebase;
  framing: CodedChunkFraming;
  accessUnitGrouping: AccessUnitGrouping;
  parameterSetLocation: ParameterSetLocation;
  nativeCodecTag?: string;
  description?: Uint8Array;
  descriptionRecord?: CodecDescriptionRecord;
}

export interface DemuxResult {
  metadata: NormalizedMetadata;
  packets: PacketInfo[];
  /** Packet ordering when uniform across tracks. Track-specific declarations override this value. */
  packetOrdering?: PacketOrdering;
  representations?: DemuxTrackRepresentation[];
  telemetry?: OperationFinalCounters;
}

/**
 * Frames are returned as digests for committed-golden comparison, and optionally as raw pixels for
 * SSIM/PSNR. The sha256 is of the NORMALIZED RGBA buffer (see oracles.ts for the normalization
 * rule: tight RGBA, top-left origin, premultiplied-off) so it is engine-independent.
 */
export interface FrameDigest {
  index: number;
  ptsUs: number;
  /** sha256 hex of normalized RGBA pixels */
  sha256: string;
  width?: number;
  height?: number;
}

export const DECODE_TRACK_SELECTOR_SCHEMA = 'media-test/decode-track-selector@1' as const;

/** A concrete, normalized track identity forwarded unchanged to every decode adapter. */
export interface DecodeTrackSelector {
  readonly schema: typeof DECODE_TRACK_SELECTOR_SCHEMA;
  readonly type: Extract<TrackType, 'video' | 'audio'>;
  /** Absolute normalized metadata/packet track index. */
  readonly trackIndex?: number;
  /** Zero-based ordinal among tracks of the requested media type. */
  readonly typeOrdinal?: number;
  /** Stable framework/container identity when exposed. */
  readonly trackId?: string;
  /** Optional timestamp-keyed proof that the requested track produced the first frame. */
  readonly firstFrameSha256?: string;
}

/** Adapter-owned proof of the concrete track that produced a FrameSink. */
export interface SelectedDecodeTrackEvidence {
  readonly schema: typeof DECODE_TRACK_SELECTOR_SCHEMA;
  readonly type: Extract<TrackType, 'video' | 'audio'>;
  readonly trackIndex: number;
  readonly typeOrdinal: number;
  readonly trackId?: string;
  readonly codec: string;
  readonly width?: number;
  readonly height?: number;
}

export interface DecodeOptions {
  maxFrames?: number;
  track?: DecodeTrackSelector;
  /** Called at the normalized frame-sink delivery boundary with an absolute monotonic timestamp. */
  onFirstFrame?: (atMs: number) => void;
}

export interface FrameSink {
  frames: FrameDigest[];
  /** raw pixels for SSIM/PSNR oracles; may be absent if the engine only produced digests */
  getPixels?(i: number): Promise<ImageData>;
  /** Required whenever DecodeOptions.track requested a concrete track. */
  selectedTrack?: SelectedDecodeTrackEvidence;
  telemetry?: OperationFinalCounters;
}

export interface SeekResult {
  landedPtsUs: number;
  frame: FrameDigest;
  telemetry?: OperationFinalCounters;
}

export type Operation =
  | 'probe'
  | 'demux'
  | 'remux'
  | 'transcode'
  | 'decodeFrames'
  | 'seek'
  | 'trim'
  | 'mux'
  | 'decrypt';

export type EncryptionScheme =
  | 'cenc-ctr'
  | 'cenc-cbcs'
  | 'hls-aes128'
  | 'clearkey'
  | 'cenc-cens'
  | 'hls-sample-aes';

/**
 * What an engine DECLARES it can do. The runner additionally runtime-feature-detects per browser
 * (feature-detect.ts) before running — declared ∧ detected. Codec/container ids are lowercase
 * canonical tokens (see CANONICAL_* below) so engines and scenarios speak the same vocabulary.
 */
export interface CapabilitySet {
  operations: Partial<Record<Operation, boolean>>;
  containersIn: string[]; // e.g. ['mp4','mov','mkv','webm','ts','wav','ogg','flac','mp3','adts','hls']
  containersOut: string[];
  videoCodecs: string[]; // ['h264','hevc','vp8','vp9','av1', ...]
  audioCodecs: string[]; // ['aac','opus','mp3','flac','vorbis','pcm-s16','pcm-s24','pcm-f32', ...]
  /**
   * Optional operation-specific codec declarations. When absent, negotiation falls back to the flat
   * `videoCodecs` / `audioCodecs` sets for backwards compatibility. Use these only when a framework
   * can honestly read/copy/decode a codec but cannot encode it, or vice versa.
   */
  videoCodecsIn?: string[];
  audioCodecsIn?: string[];
  videoCodecsOut?: string[];
  audioCodecsOut?: string[];
  encryption: EncryptionScheme[];
  features: string[]; // 'fragmented','fastStart:reserve','trim:frame-accurate','metadata:write','packets:dts','alpha','resize','rotate', ...
  /** Probe source modes the adapter can actually select for a concrete delivered input. */
  probeReadModes?: ProbeReadMode[];
}

export interface TranscodeVideoOptions {
  codec?: string;
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: number;
  rotate?: number;
}

export interface TranscodeAudioOptions {
  codec?: string;
  sampleRate?: number;
  channels?: number;
  bitrate?: number;
}

export interface TranscodeOptions {
  container: string;
  video?: TranscodeVideoOptions;
  audio?: TranscodeAudioOptions;
  /** fan-out / ABR ladder: one input → N renditions */
  variants?: TranscodeVideoOptions[];
}

/** Encoded, demuxed tracks fed back into a muxer (mux()). Opaque chunk bytes + minimal framing. */
export interface EncodedTrack {
  type: TrackType;
  codec: string;
  /** Framework/native codec tag, kept separate from the canonical semantic codec token. */
  nativeCodecTag?: string;
  timescale: number;
  packetOrdering?: PacketOrdering;
  /** Original framework timebase when one is exposed. */
  timebase?: RationalTimebase;
  /** Explicit coded representation; H.264/H.265 tracks must never be inferred from `codec`. */
  framing?: CodedChunkFraming;
  accessUnitGrouping?: AccessUnitGrouping;
  parameterSetLocation?: ParameterSetLocation;
  width?: number;
  height?: number;
  /** Clockwise display rotation metadata retained by packet-copy paths. */
  rotation?: 0 | 90 | 180 | 270;
  sampleRate?: number;
  channels?: number;
  /** codec private/description data (e.g. avcC/hvcC/esds), if any */
  description?: Uint8Array;
  /** Record carried by `description`; required whenever description is present. */
  descriptionRecord?: CodecDescriptionRecord;
  chunks: EncodedChunk[];
}

export interface EncodedChunk {
  data: Uint8Array;
  /** Separately encoded alpha access unit when the container/codec carries one (for example VP9 WebM). */
  alphaData?: Uint8Array;
  ptsUs: number;
  /** Decode timestamp only when exposed by the source; never synthesize it from PTS. */
  dtsUs?: number;
  /** Explicit zero-based decode sequence when DTS is absent or not the desired ordering key. */
  decodeIndex?: number;
  durationUs: number;
  keyframe: boolean;
}

export interface EncodedTracks {
  tracks: EncodedTrack[];
  telemetry?: OperationFinalCounters;
}

export interface DecryptKey {
  kid?: string;
  keyHex: string;
  ivHex?: string;
}

export interface RemuxOptions extends Record<string, unknown> {
  container: string;
  tags?: Record<string, string>;
}

export interface MuxOptions extends Record<string, unknown> {
  container: string;
}

/** Authored trim output contract forwarded intact to every adapter. */
export interface TrimOptions extends Record<string, unknown> {
  container: string;
  frameAccurate: boolean;
  fragmented?: boolean;
}

// ── Concrete tuple support + applicability protocol ──────────────────────────────────────────

export const CONCRETE_OPERATION_PROTOCOL = 'media-browser-test/concrete-operation@1' as const;
export const CHECKED_SUPPORT_SNAPSHOT_PROTOCOL = 'media-browser-test/checked-support@1' as const;
export const NOT_APPLICABLE_ERROR_KIND = 'media-browser-test/not-applicable@1' as const;
export const BROWSER_NOT_SUPPORTED_ERROR_KIND = 'media-browser-test/browser-not-supported@1' as const;
export const MALFORMED_INPUT_ERROR_KIND = 'media-browser-test/malformed-input@1' as const;

/** Public scenario operations plus the oracle-only composition call that still needs tuple support. */
export type ConcreteRequestOperation = Operation | 'concat';
export type ApplicabilityOperation = ConcreteRequestOperation | 'prepareMuxTracks' | 'init' | 'dispose';

export type SerializablePrimitive = string | number | boolean | null;
export type SerializableValue = SerializablePrimitive | SerializableValue[] | { [key: string]: SerializableValue };

/** Compact, structured tuple evidence persisted on applicability decisions and errors. */
export interface ApplicabilityTupleSummary {
  inputContainers: string[];
  inputCodecs: string[];
  outputContainer?: string;
  outputCodecs: string[];
  encryption?: EncryptionScheme;
  dimensions?: Array<{ width?: number; height?: number }>;
  sampleRates?: number[];
  channels?: number[];
  timingMode?: string;
  options?: { [key: string]: SerializableValue };
}

export interface NotApplicableErrorInit {
  reasonCode: string;
  operation: ApplicabilityOperation;
  engineId: string;
  tuple: ApplicabilityTupleSummary;
  reason: string;
  cause?: unknown;
}

export interface SerializedNotApplicableError {
  readonly kind: typeof NOT_APPLICABLE_ERROR_KIND;
  readonly name: 'NotApplicableError';
  readonly message: string;
  readonly reasonCode: string;
  readonly operation: ApplicabilityOperation;
  readonly engineId: string;
  readonly tuple: ApplicabilityTupleSummary;
  readonly reason: string;
  readonly cause?: SerializableValue;
  readonly stack?: string;
}

export interface BrowserNotSupportedErrorInit {
  reasonCode: string;
  operation: ApplicabilityOperation;
  engineId: string;
  tuple: ApplicabilityTupleSummary;
  reason: string;
  /** Exact browser configuration which failed, when the miss came from WebCodecs. */
  browserConfig?: ConcreteWebCodecsConfig;
  cause?: unknown;
}

export interface SerializedBrowserNotSupportedError {
  readonly kind: typeof BROWSER_NOT_SUPPORTED_ERROR_KIND;
  readonly name: 'BrowserNotSupportedError';
  readonly message: string;
  readonly reasonCode: string;
  readonly operation: ApplicabilityOperation;
  readonly engineId: string;
  readonly tuple: ApplicabilityTupleSummary;
  readonly reason: string;
  readonly browserConfig?: ConcreteWebCodecsConfig;
  readonly cause?: SerializableValue;
  readonly stack?: string;
}

export type MalformedInputStage = 'sniff' | 'parse' | 'decode' | 'decrypt' | 'validate';

export interface MalformedInputErrorInit {
  reasonCode: string;
  operation: ApplicabilityOperation;
  engineId: string;
  stage: MalformedInputStage;
  reason: string;
  inputId?: string;
  cause?: unknown;
}

/**
 * Explicit negative-input rejection. This is not applicability: the tuple was admitted and the
 * implementation examined the bytes, then established an invalid-data condition. Adapters must not
 * wrap programming errors or unclassified framework exceptions in this channel.
 */
export interface SerializedMalformedInputError {
  readonly kind: typeof MALFORMED_INPUT_ERROR_KIND;
  readonly name: 'MalformedInputError';
  readonly message: string;
  readonly reasonCode: string;
  readonly operation: ApplicabilityOperation;
  readonly engineId: string;
  readonly stage: MalformedInputStage;
  readonly reason: string;
  readonly inputId?: string;
  readonly cause?: SerializableValue;
  readonly stack?: string;
}

/**
 * The one adapter-facing runtime applicability object. It is intentionally an Error-shaped plain
 * class rather than a native `Error`: browser structured-clone drops custom fields from native Error
 * objects, while enumerable data fields on this object survive Worker and cross-realm transfer.
 * Callers must recognize it with `isNotApplicableError`, never `instanceof` or message matching.
 */
export class NotApplicableError implements SerializedNotApplicableError {
  readonly kind = NOT_APPLICABLE_ERROR_KIND;
  readonly name = 'NotApplicableError' as const;
  readonly message: string;
  readonly reasonCode: string;
  readonly operation: ApplicabilityOperation;
  readonly engineId: string;
  readonly tuple: ApplicabilityTupleSummary;
  readonly reason: string;
  readonly cause?: SerializableValue;
  readonly stack?: string;

  constructor(init: NotApplicableErrorInit) {
    this.reasonCode = requireNonEmpty(init.reasonCode, 'reasonCode');
    this.operation = init.operation;
    this.engineId = requireNonEmpty(init.engineId, 'engineId');
    this.tuple = cloneTupleSummary(init.tuple);
    this.reason = requireNonEmpty(init.reason, 'reason');
    this.message = this.reason;
    if (init.cause !== undefined) this.cause = serializeCause(init.cause);
    const stack = new Error(this.reason).stack;
    if (stack) this.stack = stack.replace(/^Error:/, `${this.name}:`);
  }

  toJSON(): SerializedNotApplicableError {
    return serializeNotApplicableError(this);
  }
}

/**
 * Realm/Worker-safe browser/API/config applicability channel. This is intentionally distinct from
 * `NotApplicableError`: framework tuple inability is NA_ENGINE; exact browser configuration absence
 * is NA_BROWSER. Neither channel is inferred from message prose.
 */
export class BrowserNotSupportedError implements SerializedBrowserNotSupportedError {
  readonly kind = BROWSER_NOT_SUPPORTED_ERROR_KIND;
  readonly name = 'BrowserNotSupportedError' as const;
  readonly message: string;
  readonly reasonCode: string;
  readonly operation: ApplicabilityOperation;
  readonly engineId: string;
  readonly tuple: ApplicabilityTupleSummary;
  readonly reason: string;
  readonly browserConfig?: ConcreteWebCodecsConfig;
  readonly cause?: SerializableValue;
  readonly stack?: string;

  constructor(init: BrowserNotSupportedErrorInit) {
    this.reasonCode = requireNonEmpty(init.reasonCode, 'reasonCode');
    this.operation = init.operation;
    this.engineId = requireNonEmpty(init.engineId, 'engineId');
    this.tuple = cloneTupleSummary(init.tuple);
    this.reason = requireNonEmpty(init.reason, 'reason');
    this.message = this.reason;
    if (init.browserConfig !== undefined) this.browserConfig = cloneWebCodecsConfig(init.browserConfig);
    if (init.cause !== undefined) this.cause = serializeCause(init.cause);
    const stack = new Error(this.reason).stack;
    if (stack) this.stack = stack.replace(/^Error:/, `${this.name}:`);
  }

  toJSON(): SerializedBrowserNotSupportedError {
    return serializeBrowserNotSupportedError(this);
  }
}

/** Realm/Worker-safe malformed-media rejection channel for negative robustness rows. */
export class MalformedInputError implements SerializedMalformedInputError {
  readonly kind = MALFORMED_INPUT_ERROR_KIND;
  readonly name = 'MalformedInputError' as const;
  readonly message: string;
  readonly reasonCode: string;
  readonly operation: ApplicabilityOperation;
  readonly engineId: string;
  readonly stage: MalformedInputStage;
  readonly reason: string;
  readonly inputId?: string;
  readonly cause?: SerializableValue;
  readonly stack?: string;

  constructor(init: MalformedInputErrorInit) {
    this.reasonCode = requireNonEmpty(init.reasonCode, 'reasonCode');
    this.operation = init.operation;
    this.engineId = requireNonEmpty(init.engineId, 'engineId');
    this.stage = init.stage;
    this.reason = requireNonEmpty(init.reason, 'reason');
    this.message = this.reason;
    if (init.inputId !== undefined) this.inputId = requireNonEmpty(init.inputId, 'inputId');
    if (init.cause !== undefined) this.cause = serializeCause(init.cause);
    const stack = new Error(this.reason).stack;
    if (stack) this.stack = stack.replace(/^Error:/, `${this.name}:`);
  }

  toJSON(): SerializedMalformedInputError {
    return serializeMalformedInputError(this);
  }
}

/** Structural, realm-independent guard for direct, cloned, or Worker-posted errors. */
export function isNotApplicableError(value: unknown): value is SerializedNotApplicableError {
  if (!isRecord(value)) return false;
  return (
    value.kind === NOT_APPLICABLE_ERROR_KIND &&
    value.name === 'NotApplicableError' &&
    typeof value.reasonCode === 'string' &&
    value.reasonCode.length > 0 &&
    typeof value.operation === 'string' &&
    typeof value.engineId === 'string' &&
    value.engineId.length > 0 &&
    typeof value.reason === 'string' &&
    value.reason.length > 0 &&
    isTupleSummary(value.tuple)
  );
}

/** Structural, realm-independent guard for direct, cloned, or Worker-posted browser misses. */
export function isBrowserNotSupportedError(value: unknown): value is SerializedBrowserNotSupportedError {
  if (!isRecord(value)) return false;
  return (
    value.kind === BROWSER_NOT_SUPPORTED_ERROR_KIND &&
    value.name === 'BrowserNotSupportedError' &&
    typeof value.reasonCode === 'string' &&
    value.reasonCode.length > 0 &&
    typeof value.operation === 'string' &&
    typeof value.engineId === 'string' &&
    value.engineId.length > 0 &&
    typeof value.reason === 'string' &&
    value.reason.length > 0 &&
    isTupleSummary(value.tuple)
  );
}

/** Structural, realm-independent guard for direct, cloned, or Worker-posted invalid-data rejects. */
export function isMalformedInputError(value: unknown): value is SerializedMalformedInputError {
  if (!isRecord(value)) return false;
  return (
    value.kind === MALFORMED_INPUT_ERROR_KIND &&
    value.name === 'MalformedInputError' &&
    typeof value.reasonCode === 'string' &&
    value.reasonCode.length > 0 &&
    typeof value.operation === 'string' &&
    typeof value.engineId === 'string' &&
    value.engineId.length > 0 &&
    ['sniff', 'parse', 'decode', 'decrypt', 'validate'].includes(String(value.stage)) &&
    typeof value.reason === 'string' &&
    value.reason.length > 0 &&
    (value.inputId === undefined || (typeof value.inputId === 'string' && value.inputId.length > 0))
  );
}

/** Explicit wire representation for hosts that serialize thrown values themselves. */
export function serializeNotApplicableError(value: SerializedNotApplicableError): SerializedNotApplicableError {
  return {
    kind: NOT_APPLICABLE_ERROR_KIND,
    name: 'NotApplicableError',
    message: value.message,
    reasonCode: value.reasonCode,
    operation: value.operation,
    engineId: value.engineId,
    tuple: cloneTupleSummary(value.tuple),
    reason: value.reason,
    ...(value.cause !== undefined ? { cause: cloneSerializable(value.cause) } : {}),
    ...(value.stack !== undefined ? { stack: value.stack } : {}),
  };
}

export function serializeBrowserNotSupportedError(
  value: SerializedBrowserNotSupportedError,
): SerializedBrowserNotSupportedError {
  return {
    kind: BROWSER_NOT_SUPPORTED_ERROR_KIND,
    name: 'BrowserNotSupportedError',
    message: value.message,
    reasonCode: value.reasonCode,
    operation: value.operation,
    engineId: value.engineId,
    tuple: cloneTupleSummary(value.tuple),
    reason: value.reason,
    ...(value.browserConfig !== undefined
      ? { browserConfig: cloneWebCodecsConfig(value.browserConfig) }
      : {}),
    ...(value.cause !== undefined ? { cause: cloneSerializable(value.cause) } : {}),
    ...(value.stack !== undefined ? { stack: value.stack } : {}),
  };
}

export function serializeMalformedInputError(
  value: SerializedMalformedInputError,
): SerializedMalformedInputError {
  return {
    kind: MALFORMED_INPUT_ERROR_KIND,
    name: 'MalformedInputError',
    message: value.message,
    reasonCode: value.reasonCode,
    operation: value.operation,
    engineId: value.engineId,
    stage: value.stage,
    reason: value.reason,
    ...(value.inputId !== undefined ? { inputId: value.inputId } : {}),
    ...(value.cause !== undefined ? { cause: cloneSerializable(value.cause) } : {}),
    ...(value.stack !== undefined ? { stack: value.stack } : {}),
  };
}

/** Convenience builder for adapter call sites; still returns the single shared protocol class. */
export function createNotApplicableError(
  engineId: string,
  operation: ApplicabilityOperation,
  reason: string,
  tuple: Partial<ApplicabilityTupleSummary> = {},
  reasonCode = 'ENGINE_TUPLE_UNSUPPORTED',
  cause?: unknown,
): NotApplicableError {
  return new NotApplicableError({
    engineId,
    operation,
    reasonCode,
    reason,
    tuple: completeTupleSummary(tuple),
    ...(cause !== undefined ? { cause } : {}),
  });
}

export function createBrowserNotSupportedError(
  engineId: string,
  operation: ApplicabilityOperation,
  reason: string,
  tuple: Partial<ApplicabilityTupleSummary> = {},
  reasonCode = 'BROWSER_CONFIG_UNSUPPORTED',
  browserConfig?: ConcreteWebCodecsConfig,
  cause?: unknown,
): BrowserNotSupportedError {
  return new BrowserNotSupportedError({
    engineId,
    operation,
    reasonCode,
    reason,
    tuple: completeTupleSummary(tuple),
    ...(browserConfig !== undefined ? { browserConfig } : {}),
    ...(cause !== undefined ? { cause } : {}),
  });
}

export function createMalformedInputError(
  engineId: string,
  operation: ApplicabilityOperation,
  stage: MalformedInputStage,
  reason: string,
  reasonCode = 'MALFORMED_INPUT_REJECTED',
  inputId?: string,
  cause?: unknown,
): MalformedInputError {
  return new MalformedInputError({
    engineId,
    operation,
    stage,
    reasonCode,
    reason,
    ...(inputId !== undefined ? { inputId } : {}),
    ...(cause !== undefined ? { cause } : {}),
  });
}

export type ConcreteWebCodecsConfig =
  | { role: 'video-decoder'; trackIndex?: number; config: VideoDecoderConfig }
  | { role: 'video-encoder'; trackIndex?: number; config: VideoEncoderConfig }
  | { role: 'audio-decoder'; trackIndex?: number; config: AudioDecoderConfig }
  | { role: 'audio-encoder'; trackIndex?: number; config: AudioEncoderConfig };

export type SourceEvidenceState = 'UNRESOLVED' | 'RESOLVED';

export interface ConcreteInputRequest {
  id: string;
  mime: string;
  container: string;
  sizeBytes?: number;
  mutated: boolean;
  /**
   * RESOLVED means `tracks` is complete, including the valid known-zero-track case. UNRESOLVED means
   * source inspection has not established track evidence yet; validators require its placeholder
   * `tracks` array to remain empty so it cannot be mistaken for a resolved zero-track asset.
   */
  sourceEvidence: SourceEvidenceState;
  tracks: NormalizedTrack[];
}

export interface ConcreteOutputRequest {
  container: string;
  videoCodec?: string;
  audioCodec?: string;
  width?: number;
  height?: number;
  frameRate?: number;
  sampleRate?: number;
  channels?: number;
}

export interface ConcreteTransformRequest {
  crop?: { x: number; y: number; width: number; height: number };
  resize?: { width?: number; height?: number };
  rotate?: number;
  frameRate?: number;
  trim?: { startUs: number; endUs: number; frameAccurate: boolean };
  audio?: { sampleRate?: number; channels?: number };
}

/** Versioned, complete operation tuple evaluated after selected-source evidence is available. */
export interface ConcreteOperationRequest {
  protocol: typeof CONCRETE_OPERATION_PROTOCOL;
  scenarioId: string;
  operation: ConcreteRequestOperation;
  inputs: ConcreteInputRequest[];
  output?: ConcreteOutputRequest;
  encryption?: EncryptionScheme;
  transforms?: ConcreteTransformRequest;
  timingMode?: string;
  options: Readonly<Record<string, unknown>>;
}

export type OperationPhase = 'support' | 'functional' | 'oracle' | 'warmup' | 'measured' | 'cleanup';

/** Shared lifecycle context. The same signal instance must be used for every call in one cell. */
export interface LifecycleContext {
  signal: AbortSignal;
  emit: (event: OperationTelemetry) => void;
  phase: OperationPhase;
}

export type SupportDecision =
  | {
      supported: true;
      /** Exact configs the adapter will instantiate; the runner probes these immediately before use. */
      browserConfigs?: ConcreteWebCodecsConfig[];
    }
  | {
      supported: false;
      status: 'NA_ENGINE' | 'NA_BROWSER';
      reasonCode: string;
      reason: string;
      /**
       * The decision depends only on the scenario, declared input identity/size/container, and
       * requested output shape. The runner may therefore apply it before downloading the media
       * body. Omit this when track/golden/content evidence is required.
       */
      preContent?: true;
      browserConfigs?: ConcreteWebCodecsConfig[];
    };

export type CheckedSupportDecision =
  | { readonly supported: true }
  | {
      readonly supported: false;
      readonly status: 'NA_ENGINE' | 'NA_BROWSER';
      readonly reasonCode: string;
      readonly reason: string;
    };

export interface CheckedBrowserConfigEvidence {
  /** Stable identity of this exact probe result within the cell execution fingerprint. */
  readonly evidenceId: string;
  readonly checkedConfig: ConcreteWebCodecsConfig;
  readonly state: 'SUPPORTED' | 'UNSUPPORTED' | 'ERROR';
  readonly reasonCode?: string;
}

/**
 * Immutable, structured-clone-safe evidence captured after concrete support and exact browser probes.
 * Execution receives this snapshot rather than reconstructing configurations from codec-family tokens.
 */
export interface CheckedSupportSnapshot {
  readonly protocol: typeof CHECKED_SUPPORT_SNAPSHOT_PROTOCOL;
  /** Stable identity of the adapter decision and ordered browser-check evidence. */
  readonly decisionId: string;
  readonly decision: CheckedSupportDecision;
  readonly browserChecks: readonly CheckedBrowserConfigEvidence[];
}

/** Concrete tuple and cancellation/telemetry bridge supplied to every adapter operation. */
export interface OperationContext extends LifecycleContext {
  request: ConcreteOperationRequest;
  /** Exact support/config evidence checked for this invocation. */
  checkedSupport: CheckedSupportSnapshot;
  /** Absolute monotonic origin captured by the runner immediately before adapter invocation.
   * Optional only for legacy direct adapter calls; scored runner execution always supplies it. */
  operationStartMs?: number;
}

/**
 * The honest checked-support evidence for a direct/internal adapter invocation that is only reached
 * after support has already been established (fallback contexts, internal round-trip legs, and unit
 * harnesses). It records a `supported: true` decision with no browser-config checks; scored runner
 * execution replaces it with the exact probed configs for that cell.
 */
export const SUPPORTED_CHECKED_SUPPORT_SNAPSHOT: CheckedSupportSnapshot = deepFreezeCloneSafe({
  protocol: CHECKED_SUPPORT_SNAPSHOT_PROTOCOL,
  decisionId: 'supported:no-browser-checks',
  decision: { supported: true } as CheckedSupportDecision,
  browserChecks: [] as readonly CheckedBrowserConfigEvidence[],
}) as CheckedSupportSnapshot;

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${field} must be a non-empty string`);
  return normalized;
}

function cloneTupleSummary(tuple: ApplicabilityTupleSummary): ApplicabilityTupleSummary {
  return {
    inputContainers: [...tuple.inputContainers],
    inputCodecs: [...tuple.inputCodecs],
    outputCodecs: [...tuple.outputCodecs],
    ...(tuple.outputContainer !== undefined ? { outputContainer: tuple.outputContainer } : {}),
    ...(tuple.encryption !== undefined ? { encryption: tuple.encryption } : {}),
    ...(tuple.dimensions !== undefined
      ? { dimensions: tuple.dimensions.map((item) => ({ ...item })) }
      : {}),
    ...(tuple.sampleRates !== undefined ? { sampleRates: [...tuple.sampleRates] } : {}),
    ...(tuple.channels !== undefined ? { channels: [...tuple.channels] } : {}),
    ...(tuple.timingMode !== undefined ? { timingMode: tuple.timingMode } : {}),
    ...(tuple.options !== undefined
      ? { options: cloneSerializable(tuple.options) as { [key: string]: SerializableValue } }
      : {}),
  };
}

function completeTupleSummary(tuple: Partial<ApplicabilityTupleSummary>): ApplicabilityTupleSummary {
  return cloneTupleSummary({
    inputContainers: tuple.inputContainers ?? [],
    inputCodecs: tuple.inputCodecs ?? [],
    outputCodecs: tuple.outputCodecs ?? [],
    ...(tuple.outputContainer !== undefined ? { outputContainer: tuple.outputContainer } : {}),
    ...(tuple.encryption !== undefined ? { encryption: tuple.encryption } : {}),
    ...(tuple.dimensions !== undefined ? { dimensions: tuple.dimensions } : {}),
    ...(tuple.sampleRates !== undefined ? { sampleRates: tuple.sampleRates } : {}),
    ...(tuple.channels !== undefined ? { channels: tuple.channels } : {}),
    ...(tuple.timingMode !== undefined ? { timingMode: tuple.timingMode } : {}),
    ...(tuple.options !== undefined ? { options: tuple.options } : {}),
  });
}

function cloneWebCodecsConfig(value: ConcreteWebCodecsConfig): ConcreteWebCodecsConfig {
  try {
    return structuredClone(value) as ConcreteWebCodecsConfig;
  } catch {
    const config = { ...value.config } as typeof value.config;
    const description = (value.config as { description?: AllowSharedBufferSource }).description;
    if (description !== undefined) {
      const bytes = copyBufferSource(description);
      (config as { description?: AllowSharedBufferSource }).description = bytes;
    }
    return { ...value, config } as ConcreteWebCodecsConfig;
  }
}

function isTupleSummary(value: unknown): value is ApplicabilityTupleSummary {
  return (
    isRecord(value) &&
    Array.isArray(value.inputContainers) &&
    value.inputContainers.every((item) => typeof item === 'string') &&
    Array.isArray(value.inputCodecs) &&
    value.inputCodecs.every((item) => typeof item === 'string') &&
    Array.isArray(value.outputCodecs) &&
    value.outputCodecs.every((item) => typeof item === 'string')
  );
}

function serializeCause(value: unknown): SerializableValue {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(value.stack ? { stack: value.stack } : {}),
    };
  }
  try {
    return cloneSerializable(value);
  } catch {
    return { name: 'NonSerializableCause', message: String(value) };
  }
}

function cloneSerializable(value: unknown, seen = new Set<object>()): SerializableValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('non-finite value is not serializable');
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => cloneSerializable(item, seen));
  if (!isRecord(value)) throw new TypeError(`unsupported serializable value: ${typeof value}`);
  if (seen.has(value)) throw new TypeError('cyclic value is not serializable');
  seen.add(value);
  const out: { [key: string]: SerializableValue } = {};
  for (const [key, item] of Object.entries(value)) out[key] = cloneSerializable(item, seen);
  seen.delete(value);
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * The single interface every adapter implements. Optional methods (mux/decrypt) are declared via
 * capabilities(); the runner gates accordingly. init/dispose bracket expensive setup (WASM load,
 * Worker spawn) so it is excluded from measured timing.
 */
export interface MediaEngine {
  /** stable, versioned id, e.g. 'mediabunny@1.48.0', 'ffmpeg.wasm@0.12', 'aibrush-media@dev' */
  readonly id: string;
  capabilities(): CapabilitySet;
  /**
   * The best-path configuration this engine drives (§0.9 / §8.5), recorded into the report so a
   * number is never an apples-to-oranges artifact of a slow API path. Optional + additive: the
   * runner reads it off the instance when present (e.g. { backend:'webgpu', wasmThreads:8 }).
   * Typed as `object` (not Record) so adapters may declare a concrete config interface without an
   * index signature; the runner serializes it for the report.
   */
  readonly configUsed?: object;
  /** Optional safety/protocol limits for runtimes that cannot sustain the generic benchmark loop. */
  readonly benchmarkLimits?: Readonly<{
    maxInnerIterations?: number;
    /**
     * Adapter-owned bounds for the cross-process memory sampler. Worker-backed runtimes may make
     * each `measureUserAgentSpecificMemory()` request expensive; an immediate in-operation sample
     * plus the terminal endpoint remains a real observation without an unbounded settle burst.
     */
    memoryWindow?: Readonly<{
      sampleImmediatelyDuringOperation?: boolean;
      maxOperationSamples?: number;
      settleWindowMs?: number;
      /** Per cross-process sample deadline; timeout remains explicit unavailable evidence. */
      sampleTimeoutMs?: number;
    }>;
  }>;
  /** Full-tuple support decision after selected input evidence is available. Scored adapters must implement it. */
  supports(request: ConcreteOperationRequest, context?: LifecycleContext): SupportDecision | Promise<SupportDecision>;
  init?(context?: LifecycleContext): Promise<void>;
  dispose?(context?: LifecycleContext): Promise<void>;

  probe(input: MediaInput, context?: OperationContext): Promise<NormalizedMetadata>;
  demux(input: MediaInput, context?: OperationContext): Promise<DemuxResult>;
  remux(input: MediaInput, opts: RemuxOptions, context?: OperationContext): Promise<MediaBytes>;
  transcode(input: MediaInput, opts: TranscodeOptions, context?: OperationContext): Promise<MediaBytes>;
  decodeFrames(input: MediaInput, opts?: DecodeOptions, context?: OperationContext): Promise<FrameSink>;
  seek(input: MediaInput, tUs: number, context?: OperationContext): Promise<SeekResult>;
  trim(
    input: MediaInput,
    range: { startUs: number; endUs: number },
    opts: TrimOptions,
    context?: OperationContext,
  ): Promise<MediaBytes>;
  /**
   * Optional runner hook for mux scenarios. Engines that can expose encoded packet bytes may turn one
   * or more corpus inputs into mux-ready tracks; support is still declared exclusively through
   * capabilities().operations.mux and negotiated before this hook is called.
   */
  prepareMuxTracks?(
    inputs: MediaInput[],
    options?: Record<string, unknown>,
    context?: OperationContext,
  ): Promise<EncodedTracks>;
  mux?(tracks: EncodedTracks, opts: MuxOptions, context?: OperationContext): Promise<MediaBytes>;
  /** Optional composition hook for scenarios that must concatenate already-produced media segments. */
  concat?(segments: MediaBytes[], opts: MuxOptions, context?: OperationContext): Promise<MediaBytes>;
  decrypt?(
    input: MediaInput,
    key: DecryptKey,
    opts: { scheme: EncryptionScheme },
    context?: OperationContext,
  ): Promise<MediaBytes>;
}

/** Factory registered in the registry; lets the runner construct a fresh engine per Worker/iter. */
export type EngineFactory = () => MediaEngine | Promise<MediaEngine>;

// ── Canonical vocabularies (single source of truth shared by adapters, scenarios, feature-detect) ──

export const CANONICAL_CONTAINERS = [
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
  'jpeg',
  'png',
  'webp',
] as const;
export type CanonicalContainer = (typeof CANONICAL_CONTAINERS)[number];

export const CANONICAL_VIDEO_CODECS = ['h264', 'hevc', 'vp8', 'vp9', 'av1'] as const;
export type CanonicalVideoCodec = (typeof CANONICAL_VIDEO_CODECS)[number];

export const CANONICAL_AUDIO_CODECS = [
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
] as const;
export type CanonicalAudioCodec = (typeof CANONICAL_AUDIO_CODECS)[number];

// ── Runtime adapter-boundary validation ──────────────────────────────────────────────────────────────────────

export class AdapterContractError extends Error {
  override readonly name = 'AdapterContractError';
  readonly reasonCode: string;
  readonly engineId: string;
  readonly fieldPath: string;

  constructor(engineId: string, fieldPath: string, reason: string, reasonCode = 'ADAPTER_RESULT_INVALID') {
    super(`${engineId}: ${fieldPath}: ${reason}`);
    this.engineId = engineId;
    this.fieldPath = fieldPath;
    this.reasonCode = reasonCode;
  }
}

export interface AdapterResultValidationOptions {
  /** Explicit scenario opt-in for byte-producing operations whose valid result is empty. */
  allowEmptyBytes?: boolean;
  /** Require H.264/H.265 framing and parameter-set declarations. Defaults to true. */
  requireExplicitCodedRepresentation?: boolean;
  /** Deliberate negative mux rows may forward an empty prepared set so mux itself must reject it. */
  allowEmptyTracks?: boolean;
  /** Defensive recursion bound for rendition trees. Defaults to 8. */
  maxVariantDepth?: number;
}

export type AdapterOperationResultMap = {
  probe: NormalizedMetadata;
  demux: DemuxResult;
  remux: MediaBytes;
  transcode: MediaBytes;
  decodeFrames: FrameSink;
  seek: SeekResult;
  trim: MediaBytes;
  mux: MediaBytes;
  decrypt: MediaBytes;
};

/** Validate one raw adapter return before it enters an oracle. Returns the same normalized value. */
export function validateAdapterResult<O extends Operation>(
  engineId: string,
  operation: O,
  value: unknown,
  options: AdapterResultValidationOptions = {},
): AdapterOperationResultMap[O] {
  switch (operation) {
    case 'probe':
      return validateNormalizedMetadata(engineId, value, 'result.metadata') as AdapterOperationResultMap[O];
    case 'demux':
      return validateDemuxResult(engineId, value, 'result.demux', options) as AdapterOperationResultMap[O];
    case 'decodeFrames':
      return validateFrameSink(engineId, value, 'result.frames') as AdapterOperationResultMap[O];
    case 'seek':
      return validateSeekResult(engineId, value, 'result.seek') as AdapterOperationResultMap[O];
    case 'remux':
    case 'transcode':
    case 'trim':
    case 'mux':
    case 'decrypt':
      return validateMediaBytes(engineId, value, 'result.output', options) as AdapterOperationResultMap[O];
  }
}

export function validateNormalizedMetadata(
  engineId: string,
  value: unknown,
  path = 'metadata',
): NormalizedMetadata {
  const record = requireRecord(engineId, path, value);
  if (record.schema !== undefined && record.schema !== NORMALIZED_METADATA_SCHEMA) {
    contractFail(engineId, `${path}.schema`, `must equal '${NORMALIZED_METADATA_SCHEMA}' when present`);
  }
  requireCanonicalContainer(engineId, `${path}.container`, record.container);
  if (record.durationSec !== null) requireFinite(engineId, `${path}.durationSec`, record.durationSec, { min: 0 });
  for (const key of [
    'presentationDurationSec',
    'rawMediaSpanSec',
    'mediaDurationSec',
    'sampleSpanSec',
    'editListSpanSec',
  ] as const) {
    if (record[key] !== undefined) requireFinite(engineId, `${path}.${key}`, record[key], { min: 0 });
  }
  if (record.presentationStartSec !== undefined) {
    requireFinite(engineId, `${path}.presentationStartSec`, record.presentationStartSec);
  }
  if (record.timebaseTickUs !== undefined) {
    requireFinite(engineId, `${path}.timebaseTickUs`, record.timebaseTickUs, { min: Number.MIN_VALUE });
  }
  if (record.movieTimescale !== undefined) {
    requireSafeInteger(engineId, `${path}.movieTimescale`, record.movieTimescale, { min: 1 });
  }
  if (record.sourceTimebase !== undefined) {
    validateMetadataRational(engineId, record.sourceTimebase, `${path}.sourceTimebase`);
  }
  if (!Array.isArray(record.tracks)) contractFail(engineId, `${path}.tracks`, 'must be an array');
  if (record.tracks.length > 256) contractFail(engineId, `${path}.tracks`, 'must contain at most 256 tracks');
  record.tracks.forEach((track, index) => validateNormalizedTrack(engineId, track, `${path}.tracks[${index}]`));
  if (record.tags !== undefined) {
    const tags = requireRecord(engineId, `${path}.tags`, record.tags);
    if (Object.keys(tags).length > 4_096) contractFail(engineId, `${path}.tags`, 'must contain at most 4096 entries');
    for (const [key, item] of Object.entries(tags)) {
      if (!key) contractFail(engineId, `${path}.tags`, 'tag keys must be non-empty');
      if (typeof item !== 'string') contractFail(engineId, `${path}.tags.${key}`, 'must be a string');
      if (key.length > 4_096) contractFail(engineId, `${path}.tags.${key}`, 'tag key is unbounded');
      if (item.length > 1_048_576) contractFail(engineId, `${path}.tags.${key}`, 'tag value is unbounded');
    }
  }
  if (record.scopedTags !== undefined) {
    validateMetadataScopedTags(engineId, record.scopedTags, `${path}.scopedTags`);
  }
  if (record.chapters !== undefined) validateMetadataChapters(engineId, record.chapters, `${path}.chapters`);
  if (record.coverArt !== undefined) validateMetadataCoverArt(engineId, record.coverArt, `${path}.coverArt`);
  if (record.timecodes !== undefined) validateMetadataTimecodes(engineId, record.timecodes, `${path}.timecodes`);
  if (record.telemetry !== undefined) validateOperationFinalCounters(engineId, record.telemetry, `${path}.telemetry`);
  if (record.probeEvidence !== undefined) {
    validateProbeAdapterEvidence(engineId, record.probeEvidence, `${path}.probeEvidence`);
  }
  return value as NormalizedMetadata;
}

export function validateProbeAdapterEvidence(
  engineId: string,
  value: unknown,
  path = 'probeEvidence',
): ProbeAdapterEvidence {
  const record = requireRecord(engineId, path, value);
  if (record.readMode !== 'range' && record.readMode !== 'progressive' && record.readMode !== 'whole-file') {
    contractFail(engineId, `${path}.readMode`, "must be 'range', 'progressive', or 'whole-file'");
  }
  if (record.resourceAccesses !== undefined) {
    if (!Array.isArray(record.resourceAccesses)) {
      contractFail(engineId, `${path}.resourceAccesses`, 'must be an array');
    }
    record.resourceAccesses.forEach((access, index) => {
      const itemPath = `${path}.resourceAccesses[${index}]`;
      const item = requireRecord(engineId, itemPath, access);
      if (item.role !== 'playlist' && item.role !== 'segment' && item.role !== 'key' && item.role !== 'other') {
        contractFail(engineId, `${itemPath}.role`, 'must be a canonical probe resource role');
      }
      requireNonEmptyString(engineId, `${itemPath}.uri`, item.uri);
      if (
        item.disposition !== 'read' &&
        item.disposition !== 'denied' &&
        item.disposition !== 'missing' &&
        item.disposition !== 'error'
      ) {
        contractFail(engineId, `${itemPath}.disposition`, 'must be a canonical resource disposition');
      }
    });
  }
  return value as ProbeAdapterEvidence;
}

export function validateNormalizedTrack(engineId: string, value: unknown, path = 'track'): NormalizedTrack {
  const record = requireRecord(engineId, path, value);
  const type = record.type;
  if (!isTrackType(type)) contractFail(engineId, `${path}.type`, 'must be a canonical track type');
  requireTrackCodec(engineId, `${path}.codec`, record.codec, type);
  if (record.nativeCodecTag !== undefined) {
    requireBoundedCodecToken(engineId, `${path}.nativeCodecTag`, record.nativeCodecTag);
  }
  for (const key of ['rawCodec', 'codecRaw'] as const) {
    if (record[key] !== undefined) requireBoundedCodecToken(engineId, `${path}.${key}`, record[key]);
  }
  if (record.trackId !== undefined) requireNonEmptyString(engineId, `${path}.trackId`, record.trackId);
  for (const key of ['canonicalCodec', 'codecCanonical'] as const) {
    if (record[key] === undefined) continue;
    if (type === 'video') requireCanonicalVideoCodec(engineId, `${path}.${key}`, record[key]);
    else if (type === 'audio') requireCanonicalAudioCodec(engineId, `${path}.${key}`, record[key]);
    else contractFail(engineId, `${path}.${key}`, 'must be omitted for subtitle and other tracks');
  }
  if (record.defaultDisposition !== undefined && typeof record.defaultDisposition !== 'boolean') {
    contractFail(engineId, `${path}.defaultDisposition`, 'must be a boolean');
  }
  if (record.disposition !== undefined) {
    const disposition = requireRecord(engineId, `${path}.disposition`, record.disposition);
    for (const [key, item] of Object.entries(disposition)) {
      if (!key) contractFail(engineId, `${path}.disposition`, 'keys must be non-empty');
      if (typeof item !== 'boolean') requireFinite(engineId, `${path}.disposition.${key}`, item);
    }
  }
  validatePositiveIntegerOptional(engineId, record, path, 'width');
  validatePositiveIntegerOptional(engineId, record, path, 'height');
  for (const key of ['rawWidth', 'rawHeight', 'presentationWidth', 'presentationHeight'] as const) {
    validatePositiveIntegerOptional(engineId, record, path, key);
  }
  validateMetadataPair(engineId, record, path, 'rawWidth', 'rawHeight');
  validateMetadataPair(engineId, record, path, 'presentationWidth', 'presentationHeight');
  validatePositiveFiniteOptional(engineId, record, path, 'fps');
  if (record.fpsProvenance !== undefined) {
    validateFrameRateProvenance(engineId, record.fpsProvenance, `${path}.fpsProvenance`);
  }
  if (record.frameRateEvidence !== undefined) {
    validateFrameRateProvenance(engineId, record.frameRateEvidence, `${path}.frameRateEvidence`);
  }
  if (record.rateRational !== undefined) {
    validateMetadataRational(engineId, record.rateRational, `${path}.rateRational`);
  }
  for (const key of ['cadence', 'cadenceMode'] as const) {
    if (record[key] !== undefined && record[key] !== 'CFR' && record[key] !== 'VFR' && record[key] !== 'UNKNOWN') {
      contractFail(engineId, `${path}.${key}`, "must be 'CFR', 'VFR', or 'UNKNOWN'");
    }
  }
  const hasFpsNumerator = record.fpsNumerator !== undefined;
  const hasFpsDenominator = record.fpsDenominator !== undefined;
  if (hasFpsNumerator !== hasFpsDenominator) {
    contractFail(engineId, path, 'fpsNumerator and fpsDenominator must be present together');
  }
  if (hasFpsNumerator) {
    validateMetadataRational(
      engineId,
      { numerator: record.fpsNumerator, denominator: record.fpsDenominator },
      `${path}.fpsRational`,
    );
  }
  for (const key of ['fpsMin', 'fpsMax'] as const) validatePositiveFiniteOptional(engineId, record, path, key);
  if (typeof record.fpsMin === 'number' && typeof record.fpsMax === 'number' && record.fpsMax < record.fpsMin) {
    contractFail(engineId, `${path}.fpsMax`, 'must be >= fpsMin');
  }
  if (record.frameTimestampsUs !== undefined) {
    if (!Array.isArray(record.frameTimestampsUs) || record.frameTimestampsUs.length > 2_000_000) {
      contractFail(engineId, `${path}.frameTimestampsUs`, 'must be a bounded array');
    }
    let previous = Number.NEGATIVE_INFINITY;
    record.frameTimestampsUs.forEach((timestamp, index) => {
      const current = requireFinite(engineId, `${path}.frameTimestampsUs[${index}]`, timestamp);
      if (current <= previous) {
        contractFail(engineId, `${path}.frameTimestampsUs[${index}]`, 'must be strictly increasing');
      }
      previous = current;
    });
  }
  validateFiniteOptional(engineId, record, path, 'rotation');
  if (record.rotationMatrix !== undefined) {
    const matrix = requireRecord(engineId, `${path}.rotationMatrix`, record.rotationMatrix);
    if (!Array.isArray(matrix.values) || matrix.values.length !== 9) {
      contractFail(engineId, `${path}.rotationMatrix.values`, 'must contain exactly nine values');
    }
    matrix.values.forEach((entry, index) => {
      requireFinite(engineId, `${path}.rotationMatrix.values[${index}]`, entry);
    });
  }
  validatePositiveIntegerOptional(engineId, record, path, 'sampleRate');
  validatePositiveIntegerOptional(engineId, record, path, 'channels');
  for (const key of ['codedSampleRate', 'presentationSampleRate', 'codedChannels', 'presentationChannels'] as const) {
    validatePositiveIntegerOptional(engineId, record, path, key);
  }
  if (record.bitrate !== undefined && record.bitrate !== null) {
    requireFinite(engineId, `${path}.bitrate`, record.bitrate, { min: 0 });
  }
  if (record.language !== undefined && record.language !== null && typeof record.language !== 'string') {
    contractFail(engineId, `${path}.language`, 'must be a string or null');
  }
  for (const key of ['sourceTimebase', 'movieTimebase', 'mediaTimebase'] as const) {
    if (record[key] !== undefined) validateMetadataRational(engineId, record[key], `${path}.${key}`);
  }
  for (const key of [
    'rawMediaSpanSec',
    'presentationDurationSec',
    'mediaDurationSec',
    'sampleSpanSec',
    'editListSpanSec',
  ] as const) {
    if (record[key] !== undefined) requireFinite(engineId, `${path}.${key}`, record[key], { min: 0 });
  }
  if (record.presentationStartSec !== undefined) {
    requireFinite(engineId, `${path}.presentationStartSec`, record.presentationStartSec);
  }
  if (record.timebaseTickUs !== undefined) {
    requireFinite(engineId, `${path}.timebaseTickUs`, record.timebaseTickUs, { min: Number.MIN_VALUE });
  }
  for (const key of ['mediaTimescale', 'movieTimescale'] as const) {
    if (record[key] !== undefined) requireSafeInteger(engineId, `${path}.${key}`, record[key], { min: 1 });
  }
  for (const key of ['primingSamples', 'paddingSamples', 'remainderSamples'] as const) {
    if (record[key] !== undefined) requireSafeInteger(engineId, `${path}.${key}`, record[key], { min: 0 });
  }
  if (record.audioObjectType !== undefined) {
    requireSafeInteger(engineId, `${path}.audioObjectType`, record.audioObjectType, { min: 1, max: 255 });
  }
  for (const key of ['sbrPresent', 'psPresent'] as const) {
    if (record[key] !== undefined && typeof record[key] !== 'boolean') {
      contractFail(engineId, `${path}.${key}`, 'must be a boolean');
    }
  }
  if (record.editList !== undefined) validateMetadataEditList(engineId, record.editList, `${path}.editList`);
  if (record.scopedTags !== undefined) {
    validateMetadataScopedTags(engineId, record.scopedTags, `${path}.scopedTags`);
  }
  return value as unknown as NormalizedTrack;
}

function validateMetadataPair(
  engineId: string,
  record: Record<string, unknown>,
  path: string,
  first: string,
  second: string,
): void {
  if ((record[first] === undefined) !== (record[second] === undefined)) {
    contractFail(engineId, path, `${first} and ${second} must be present together`);
  }
}

function validateMetadataRational(engineId: string, value: unknown, path: string): void {
  const rational = requireRecord(engineId, path, value);
  requireSafeInteger(engineId, `${path}.numerator`, rational.numerator, { min: 1 });
  requireSafeInteger(engineId, `${path}.denominator`, rational.denominator, { min: 1 });
}

function validateMetadataEditList(engineId: string, value: unknown, path: string): void {
  if (!Array.isArray(value) || value.length > 2_000_000) {
    contractFail(engineId, path, 'must be a bounded array');
  }
  value.forEach((entry, index) => {
    const itemPath = `${path}[${index}]`;
    const item = requireRecord(engineId, itemPath, entry);
    requireSafeInteger(engineId, `${itemPath}.segmentDuration`, item.segmentDuration, { min: 0 });
    requireSafeInteger(engineId, `${itemPath}.mediaTime`, item.mediaTime, { min: -1 });
    requireSafeInteger(engineId, `${itemPath}.mediaRateNumerator`, item.mediaRateNumerator, { min: 0 });
    requireSafeInteger(engineId, `${itemPath}.mediaRateDenominator`, item.mediaRateDenominator, { min: 1 });
    requireSafeInteger(engineId, `${itemPath}.movieTimescale`, item.movieTimescale, { min: 1 });
    requireSafeInteger(engineId, `${itemPath}.mediaTimescale`, item.mediaTimescale, { min: 1 });
  });
}

function validateMetadataScopedTags(engineId: string, value: unknown, path: string): void {
  if (!Array.isArray(value) || value.length > 4_096) contractFail(engineId, path, 'must be a bounded array');
  const semanticKeys: readonly string[] = [
    'title', 'artist', 'album', 'comment', 'date', 'genre', 'trackNumber',
  ];
  value.forEach((entry, index) => {
    const itemPath = `${path}[${index}]`;
    const item = requireRecord(engineId, itemPath, entry);
    if (item.scope !== 'container' && item.scope !== 'track' && item.scope !== 'chapter' && item.scope !== 'attachment') {
      contractFail(engineId, `${itemPath}.scope`, 'must be a canonical metadata scope');
    }
    requireNonEmptyString(engineId, `${itemPath}.rawKey`, item.rawKey);
    if (typeof item.value !== 'string') contractFail(engineId, `${itemPath}.value`, 'must be a string');
    if (item.value.length > 1_048_576) contractFail(engineId, `${itemPath}.value`, 'is unbounded');
    if (item.canonicalKey !== undefined && !semanticKeys.includes(String(item.canonicalKey))) {
      contractFail(engineId, `${itemPath}.canonicalKey`, 'must be a canonical semantic tag key');
    }
    const requiredReference = item.scope === 'track'
      ? 'trackId'
      : item.scope === 'chapter'
        ? 'chapterId'
        : item.scope === 'attachment'
          ? 'attachmentId'
          : undefined;
    if (requiredReference !== undefined) {
      requireNonEmptyString(engineId, `${itemPath}.${requiredReference}`, item[requiredReference]);
    }
    for (const key of ['trackId', 'chapterId', 'attachmentId', 'language'] as const) {
      if (item[key] !== undefined) requireNonEmptyString(engineId, `${itemPath}.${key}`, item[key]);
    }
    if (item.isDefaultLanguage !== undefined && typeof item.isDefaultLanguage !== 'boolean') {
      contractFail(engineId, `${itemPath}.isDefaultLanguage`, 'must be a boolean');
    }
  });
}

function validateMetadataChapters(engineId: string, value: unknown, path: string): void {
  if (!Array.isArray(value) || value.length > 100_000) contractFail(engineId, path, 'must be a bounded array');
  value.forEach((entry, index) => {
    const itemPath = `${path}[${index}]`;
    const item = requireRecord(engineId, itemPath, entry);
    requireNonEmptyString(engineId, `${itemPath}.id`, item.id);
    const start = requireFinite(engineId, `${itemPath}.startTimeSec`, item.startTimeSec, { min: 0 });
    if (item.endTimeSec !== undefined) {
      requireFinite(engineId, `${itemPath}.endTimeSec`, item.endTimeSec, { min: start });
    }
    for (const key of ['title', 'language'] as const) {
      if (item[key] !== undefined) requireNonEmptyString(engineId, `${itemPath}.${key}`, item[key]);
    }
    if (item.tags !== undefined) validateMetadataScopedTags(engineId, item.tags, `${itemPath}.tags`);
  });
}

function validateMetadataCoverArt(engineId: string, value: unknown, path: string): void {
  if (!Array.isArray(value) || value.length > 10_000) contractFail(engineId, path, 'must be a bounded array');
  value.forEach((entry, index) => {
    const itemPath = `${path}[${index}]`;
    const item = requireRecord(engineId, itemPath, entry);
    requireNonEmptyString(engineId, `${itemPath}.id`, item.id);
    requireNonEmptyString(engineId, `${itemPath}.mime`, item.mime);
    requireSafeInteger(engineId, `${itemPath}.byteLength`, item.byteLength, { min: 0 });
    if (item.sha256 !== undefined && !isSha256(item.sha256)) {
      contractFail(engineId, `${itemPath}.sha256`, 'must be a SHA-256 hex digest');
    }
    validateMetadataPair(engineId, item, itemPath, 'width', 'height');
    for (const key of ['width', 'height'] as const) validatePositiveIntegerOptional(engineId, item, itemPath, key);
    for (const key of ['description', 'language'] as const) {
      if (item[key] !== undefined) requireNonEmptyString(engineId, `${itemPath}.${key}`, item[key]);
    }
  });
}

function validateMetadataTimecodes(engineId: string, value: unknown, path: string): void {
  if (!Array.isArray(value) || value.length > 10_000) contractFail(engineId, path, 'must be a bounded array');
  value.forEach((entry, index) => {
    const itemPath = `${path}[${index}]`;
    const item = requireRecord(engineId, itemPath, entry);
    requireNonEmptyString(engineId, `${itemPath}.value`, item.value);
    if (item.trackId !== undefined) requireNonEmptyString(engineId, `${itemPath}.trackId`, item.trackId);
    const hasNumerator = item.rateNumerator !== undefined;
    const hasDenominator = item.rateDenominator !== undefined;
    if (hasNumerator !== hasDenominator) contractFail(engineId, itemPath, 'timecode rate must be a complete rational');
    if (hasNumerator) {
      validateMetadataRational(
        engineId,
        { numerator: item.rateNumerator, denominator: item.rateDenominator },
        `${itemPath}.rate`,
      );
    }
    if (item.dropFrame !== undefined && typeof item.dropFrame !== 'boolean') {
      contractFail(engineId, `${itemPath}.dropFrame`, 'must be a boolean');
    }
  });
}

export function validateFrameRateProvenance(
  engineId: string,
  value: unknown,
  path = 'fpsProvenance',
): FrameRateProvenance {
  const record = requireRecord(engineId, path, value);
  if (record.source !== 'nominal' && record.source !== 'average' && record.source !== 'observed') {
    contractFail(engineId, `${path}.source`, "must be 'nominal', 'average', or 'observed'");
  }
  if (
    record.cadence !== undefined &&
    record.cadence !== 'CFR' &&
    record.cadence !== 'VFR' &&
    record.cadence !== 'UNKNOWN'
  ) {
    contractFail(engineId, `${path}.cadence`, "must be 'CFR', 'VFR', or 'UNKNOWN'");
  }

  const hasSampleCount = record.sampleCount !== undefined;
  const hasObservedInterval = record.observedIntervalUs !== undefined;
  if (hasSampleCount !== hasObservedInterval) {
    contractFail(engineId, path, 'sampleCount and observedIntervalUs must be present together');
  }
  if (record.source !== 'nominal' && !hasSampleCount) {
    contractFail(engineId, `${path}.sampleCount`, `is required for ${record.source} frame-rate evidence`);
  }
  if (hasSampleCount) {
    requireSafeInteger(engineId, `${path}.sampleCount`, record.sampleCount, { min: 1 });
    const intervalUs = requireFinite(engineId, `${path}.observedIntervalUs`, record.observedIntervalUs, { min: 0 });
    if (intervalUs === 0) contractFail(engineId, `${path}.observedIntervalUs`, 'must be > 0');
  }

  if (record.rational !== undefined) {
    const rational = requireRecord(engineId, `${path}.rational`, record.rational);
    requireSafeInteger(engineId, `${path}.rational.numerator`, rational.numerator, { min: 1 });
    requireSafeInteger(engineId, `${path}.rational.denominator`, rational.denominator, { min: 1 });
  }
  if (record.envelope !== undefined) {
    const envelope = requireRecord(engineId, `${path}.envelope`, record.envelope);
    const minFps = requireFinite(engineId, `${path}.envelope.minFps`, envelope.minFps, { min: 0 });
    const maxFps = requireFinite(engineId, `${path}.envelope.maxFps`, envelope.maxFps, { min: 0 });
    if (minFps === 0) contractFail(engineId, `${path}.envelope.minFps`, 'must be > 0');
    if (maxFps === 0) contractFail(engineId, `${path}.envelope.maxFps`, 'must be > 0');
    if (maxFps < minFps) contractFail(engineId, `${path}.envelope.maxFps`, 'must be >= minFps');
  }
  return value as FrameRateProvenance;
}

export function validateDemuxResult(
  engineId: string,
  value: unknown,
  path = 'demux',
  options: AdapterResultValidationOptions = {},
): DemuxResult {
  const record = requireRecord(engineId, path, value);
  const metadata = validateNormalizedMetadata(engineId, record.metadata, `${path}.metadata`);
  if (!Array.isArray(record.packets)) contractFail(engineId, `${path}.packets`, 'must be an array');
  const buffers = new Map<ArrayBufferLike, string>();
  record.packets.forEach((packet, index) => {
    const packetPath = `${path}.packets[${index}]`;
    const validated = validatePacketInfo(engineId, packet, metadata.tracks.length, packetPath, buffers);
    const track = metadata.tracks[validated.trackIndex]!;
    if (validated.trackType !== undefined && validated.trackType !== track.type) {
      contractFail(engineId, `${packetPath}.trackType`, `must match metadata track type '${track.type}'`);
    }
    if (validated.codec !== undefined && validated.codec !== track.codec) {
      contractFail(engineId, `${packetPath}.codec`, `must match metadata track codec '${track.codec}'`);
    }
  });
  if (record.packetOrdering !== undefined && !isPacketOrdering(record.packetOrdering)) {
    contractFail(engineId, `${path}.packetOrdering`, "must be 'decode' or 'presentation'");
  }
  if (record.representations !== undefined) {
    if (!Array.isArray(record.representations)) contractFail(engineId, `${path}.representations`, 'must be an array');
    const trackIndexes = new Set<number>();
    record.representations.forEach((representation, index) => {
      const representationPath = `${path}.representations[${index}]`;
      const validated = validateDemuxTrackRepresentation(
        engineId,
        representation,
        metadata,
        representationPath,
        buffers,
        options.requireExplicitCodedRepresentation ?? true,
      );
      if (trackIndexes.has(validated.trackIndex)) {
        contractFail(engineId, `${representationPath}.trackIndex`, 'duplicates an earlier track representation');
      }
      trackIndexes.add(validated.trackIndex);
    });
  }
  if ((options.requireExplicitCodedRepresentation ?? true) && record.packets.length > 0) {
    const requiredTracks = new Set(
      record.packets
        .map((packet) => (packet as PacketInfo).trackIndex)
        .filter((trackIndex) => {
          const codec = metadata.tracks[trackIndex]?.codec;
          return codec === 'h264' || codec === 'hevc';
        }),
    );
    const represented = new Set(
      Array.isArray(record.representations)
        ? record.representations.map((representation) => (representation as DemuxTrackRepresentation).trackIndex)
        : [],
    );
    for (const trackIndex of requiredTracks) {
      if (!represented.has(trackIndex)) {
        contractFail(engineId, `${path}.representations`, `must declare coded representation for H.264/H.265 track ${trackIndex}`);
      }
    }
  }
  if (record.telemetry !== undefined) {
    const telemetry = validateOperationFinalCounters(engineId, record.telemetry, `${path}.telemetry`);
    if (telemetry.packetCount !== undefined && telemetry.packetCount !== record.packets.length) {
      contractFail(engineId, `${path}.telemetry.packetCount`, `must equal packets.length (${record.packets.length})`);
    }
  }
  return value as DemuxResult;
}

export function validatePacketInfo(
  engineId: string,
  value: unknown,
  trackCount: number,
  path = 'packet',
  buffers = new Map<ArrayBufferLike, string>(),
): PacketInfo {
  const record = requireRecord(engineId, path, value);
  requireSafeInteger(engineId, `${path}.trackIndex`, record.trackIndex, { min: 0, max: trackCount - 1 });
  requireSafeInteger(engineId, `${path}.size`, record.size, { min: 0 });
  requireFinite(engineId, `${path}.ptsUs`, record.ptsUs);
  if (record.dtsUs !== undefined) requireFinite(engineId, `${path}.dtsUs`, record.dtsUs);
  if (record.durationUs !== undefined) requireFinite(engineId, `${path}.durationUs`, record.durationUs, { min: 0 });
  if (typeof record.keyframe !== 'boolean') contractFail(engineId, `${path}.keyframe`, 'must be a boolean');
  if (record.trackType !== undefined && !isTrackType(record.trackType)) {
    contractFail(engineId, `${path}.trackType`, 'must be a canonical track type');
  }
  if (record.codec !== undefined) requireCanonicalCodec(engineId, `${path}.codec`, record.codec);
  if (record.payload !== undefined) {
    const payload = requireOwnedBytes(engineId, `${path}.payload`, record.payload, buffers, true);
    if (payload.byteLength !== record.size) {
      contractFail(engineId, `${path}.payload`, `byteLength must equal size (${record.size})`);
    }
  }
  if (record.payloadDigest !== undefined && !isSha256(record.payloadDigest)) {
    contractFail(engineId, `${path}.payloadDigest`, 'must be a 64-character SHA-256 hex digest');
  }
  if (record.accessUnitId !== undefined) requireNonEmptyString(engineId, `${path}.accessUnitId`, record.accessUnitId);
  if (record.framing !== undefined && !isCodedChunkFraming(record.framing)) {
    contractFail(engineId, `${path}.framing`, 'must be an explicit canonical framing value');
  }
  if (record.nalLengthSize !== undefined) requireSafeInteger(engineId, `${path}.nalLengthSize`, record.nalLengthSize, { min: 1, max: 4 });
  if (record.decoderConfig !== undefined) requireOwnedBytes(engineId, `${path}.decoderConfig`, record.decoderConfig, buffers, false);
  if (record.randomAccessKind !== undefined) requireNonEmptyString(engineId, `${path}.randomAccessKind`, record.randomAccessKind);
  if (record.parameterSetDigests !== undefined) {
    if (!Array.isArray(record.parameterSetDigests)) contractFail(engineId, `${path}.parameterSetDigests`, 'must be an array');
    record.parameterSetDigests.forEach((digest, index) => {
      if (!isSha256(digest)) contractFail(engineId, `${path}.parameterSetDigests[${index}]`, 'must be a SHA-256 hex digest');
    });
  }
  return value as unknown as PacketInfo;
}

export function validateFrameSink(engineId: string, value: unknown, path = 'frames'): FrameSink {
  const record = requireRecord(engineId, path, value);
  if (!Array.isArray(record.frames)) contractFail(engineId, `${path}.frames`, 'must be an array');
  record.frames.forEach((frame, index) => {
    const validated = validateFrameDigest(engineId, frame, `${path}.frames[${index}]`);
    if (validated.index !== index) {
      contractFail(engineId, `${path}.frames[${index}].index`, `must equal its stable array index (${index})`);
    }
  });
  if (record.getPixels !== undefined && typeof record.getPixels !== 'function') {
    contractFail(engineId, `${path}.getPixels`, 'must be a function when present');
  }
  if (record.selectedTrack !== undefined) {
    validateSelectedDecodeTrackEvidence(engineId, record.selectedTrack, `${path}.selectedTrack`);
  }
  if (record.telemetry !== undefined) {
    const telemetry = validateOperationFinalCounters(engineId, record.telemetry, `${path}.telemetry`);
    if (telemetry.decodedFrames !== undefined && telemetry.decodedFrames !== record.frames.length) {
      contractFail(engineId, `${path}.telemetry.decodedFrames`, `must equal frames.length (${record.frames.length})`);
    }
  }
  return value as FrameSink;
}

function validateSelectedDecodeTrackEvidence(
  engineId: string,
  value: unknown,
  path: string,
): SelectedDecodeTrackEvidence {
  const record = requireRecord(engineId, path, value);
  if (record.schema !== DECODE_TRACK_SELECTOR_SCHEMA) {
    contractFail(engineId, `${path}.schema`, `must equal '${DECODE_TRACK_SELECTOR_SCHEMA}'`);
  }
  if (record.type !== 'video' && record.type !== 'audio') {
    contractFail(engineId, `${path}.type`, "must be 'video' or 'audio'");
  }
  requireSafeInteger(engineId, `${path}.trackIndex`, record.trackIndex, { min: 0 });
  requireSafeInteger(engineId, `${path}.typeOrdinal`, record.typeOrdinal, { min: 0 });
  if (record.trackId !== undefined) requireNonEmptyString(engineId, `${path}.trackId`, record.trackId);
  requireCanonicalCodec(engineId, `${path}.codec`, record.codec);
  const hasWidth = record.width !== undefined;
  const hasHeight = record.height !== undefined;
  if (hasWidth !== hasHeight) contractFail(engineId, path, 'width and height must be present together');
  if (hasWidth) requireSafeInteger(engineId, `${path}.width`, record.width, { min: 1 });
  if (hasHeight) requireSafeInteger(engineId, `${path}.height`, record.height, { min: 1 });
  return value as SelectedDecodeTrackEvidence;
}

export function validateFrameDigest(engineId: string, value: unknown, path = 'frame'): FrameDigest {
  const record = requireRecord(engineId, path, value);
  requireSafeInteger(engineId, `${path}.index`, record.index, { min: 0 });
  requireFinite(engineId, `${path}.ptsUs`, record.ptsUs);
  if (typeof record.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(record.sha256)) {
    contractFail(engineId, `${path}.sha256`, 'must be a 64-character SHA-256 hex digest');
  }
  const hasWidth = record.width !== undefined;
  const hasHeight = record.height !== undefined;
  if (hasWidth !== hasHeight) contractFail(engineId, path, 'width and height must be present together');
  if (hasWidth) requireSafeInteger(engineId, `${path}.width`, record.width, { min: 1 });
  if (hasHeight) requireSafeInteger(engineId, `${path}.height`, record.height, { min: 1 });
  return value as unknown as FrameDigest;
}

export function validateSeekResult(
  engineId: string,
  value: unknown,
  path = 'seek',
): SeekResult {
  const record = requireRecord(engineId, path, value);
  requireFinite(engineId, `${path}.landedPtsUs`, record.landedPtsUs);
  validateFrameDigest(engineId, record.frame, `${path}.frame`);
  if (record.telemetry !== undefined) validateOperationFinalCounters(engineId, record.telemetry, `${path}.telemetry`);
  return value as SeekResult;
}

export function validateMediaBytes(
  engineId: string,
  value: unknown,
  path = 'output',
  options: AdapterResultValidationOptions = {},
): MediaBytes {
  const buffers = new Map<ArrayBufferLike, string>();
  const objects = new Set<object>();
  validateMediaBytesNode(engineId, value, path, options, buffers, objects, 0);
  return value as MediaBytes;
}

export function validateEncodedTracks(
  engineId: string,
  value: unknown,
  path = 'encodedTracks',
  options: AdapterResultValidationOptions = {},
): EncodedTracks {
  const record = requireRecord(engineId, path, value);
  if (!Array.isArray(record.tracks)) contractFail(engineId, `${path}.tracks`, 'must be an array');
  if (record.tracks.length === 0 && options.allowEmptyTracks !== true) {
    contractFail(engineId, `${path}.tracks`, 'must contain at least one track');
  }
  const buffers = new Map<ArrayBufferLike, string>();
  record.tracks.forEach((track, index) =>
    validateEncodedTrack(
      engineId,
      track,
      `${path}.tracks[${index}]`,
      buffers,
      options.requireExplicitCodedRepresentation ?? true,
    ),
  );
  if (record.telemetry !== undefined) validateOperationFinalCounters(engineId, record.telemetry, `${path}.telemetry`);
  return value as EncodedTracks;
}

export function validateEncodedTrack(
  engineId: string,
  value: unknown,
  path = 'encodedTrack',
  buffers = new Map<ArrayBufferLike, string>(),
  requireExplicitRepresentation = true,
): EncodedTrack {
  const record = requireRecord(engineId, path, value);
  if (!isTrackType(record.type)) contractFail(engineId, `${path}.type`, 'must be a canonical track type');
  const codec = requireCanonicalCodec(engineId, `${path}.codec`, record.codec);
  if (record.nativeCodecTag !== undefined) requireNonEmptyString(engineId, `${path}.nativeCodecTag`, record.nativeCodecTag);
  requireSafeInteger(engineId, `${path}.timescale`, record.timescale, { min: 1 });
  validatePositiveIntegerOptional(engineId, record, path, 'width');
  validatePositiveIntegerOptional(engineId, record, path, 'height');
  if (record.rotation !== undefined && ![0, 90, 180, 270].includes(record.rotation as number)) {
    contractFail(engineId, `${path}.rotation`, 'must be 0, 90, 180, or 270');
  }
  validatePositiveIntegerOptional(engineId, record, path, 'sampleRate');
  validatePositiveIntegerOptional(engineId, record, path, 'channels');
  if (record.packetOrdering !== undefined && !isPacketOrdering(record.packetOrdering)) {
    contractFail(engineId, `${path}.packetOrdering`, "must be 'decode' or 'presentation'");
  }
  if (record.timebase !== undefined) validateRationalTimebase(engineId, record.timebase, `${path}.timebase`);
  validateRepresentationFields(engineId, record, codec, path, requireExplicitRepresentation);
  if (record.description !== undefined) {
    requireOwnedBytes(engineId, `${path}.description`, record.description, buffers, false);
    if (!isCodecDescriptionRecord(record.descriptionRecord)) {
      contractFail(engineId, `${path}.descriptionRecord`, 'must state the record carried by description');
    }
  } else if (record.descriptionRecord !== undefined) {
    contractFail(engineId, `${path}.descriptionRecord`, 'must be absent when description is absent');
  }
  if (!Array.isArray(record.chunks)) contractFail(engineId, `${path}.chunks`, 'must be an array');
  const decodeIndexes = new Set<number>();
  let chunksWithDecodeIndex = 0;
  record.chunks.forEach((chunk, index) => {
    const chunkPath = `${path}.chunks[${index}]`;
    const item = requireRecord(engineId, chunkPath, chunk);
    requireOwnedBytes(engineId, `${chunkPath}.data`, item.data, buffers, false);
    if (item.alphaData !== undefined) {
      requireOwnedBytes(engineId, `${chunkPath}.alphaData`, item.alphaData, buffers, false);
    }
    requireFinite(engineId, `${chunkPath}.ptsUs`, item.ptsUs);
    if (item.dtsUs !== undefined) requireFinite(engineId, `${chunkPath}.dtsUs`, item.dtsUs);
    if (item.decodeIndex !== undefined) {
      const decodeIndex = requireSafeInteger(engineId, `${chunkPath}.decodeIndex`, item.decodeIndex, { min: 0 });
      if (decodeIndexes.has(decodeIndex)) {
        contractFail(engineId, `${chunkPath}.decodeIndex`, `duplicates decode index ${decodeIndex}`);
      }
      if (record.packetOrdering === 'decode' && decodeIndex !== index) {
        contractFail(engineId, `${chunkPath}.decodeIndex`, `must equal array index ${index} for decode-ordered tracks`);
      }
      decodeIndexes.add(decodeIndex);
      chunksWithDecodeIndex++;
    }
    requireFinite(engineId, `${chunkPath}.durationUs`, item.durationUs, { min: 0 });
    if (typeof item.keyframe !== 'boolean') contractFail(engineId, `${chunkPath}.keyframe`, 'must be a boolean');
  });
  if (chunksWithDecodeIndex > 0 && chunksWithDecodeIndex !== record.chunks.length) {
    contractFail(engineId, `${path}.chunks`, 'decodeIndex must be present on every chunk when used');
  }
  if (chunksWithDecodeIndex > 0) {
    for (let index = 0; index < record.chunks.length; index++) {
      if (!decodeIndexes.has(index)) {
        contractFail(engineId, `${path}.chunks`, `decodeIndex sequence must be contiguous from 0 (missing ${index})`);
      }
    }
  }
  return value as unknown as EncodedTrack;
}

function validateMediaBytesNode(
  engineId: string,
  value: unknown,
  path: string,
  options: AdapterResultValidationOptions,
  buffers: Map<ArrayBufferLike, string>,
  objects: Set<object>,
  depth: number,
): number {
  const record = requireRecord(engineId, path, value);
  const maxDepth = options.maxVariantDepth ?? 8;
  if (depth > maxDepth) contractFail(engineId, path, `rendition recursion exceeds max depth ${maxDepth}`);
  if (objects.has(record)) contractFail(engineId, path, 'rendition graph contains a cycle');
  objects.add(record);
  const bytes = requireOwnedBytes(engineId, `${path}.bytes`, record.bytes, buffers, options.allowEmptyBytes === true);
  requireNonEmptyString(engineId, `${path}.mime`, record.mime);
  requireCanonicalContainer(engineId, `${path}.container`, record.container);
  if (record.targetWrites !== undefined) requireSafeInteger(engineId, `${path}.targetWrites`, record.targetWrites, { min: 0 });
  if (record.firstByteMs !== undefined) requireFinite(engineId, `${path}.firstByteMs`, record.firstByteMs, { min: 0 });
  let normalizedBytesWritten = bytes.byteLength;
  if (record.variants !== undefined) {
    if (!Array.isArray(record.variants)) contractFail(engineId, `${path}.variants`, 'must be an array');
    if (record.variants.length === 0) contractFail(engineId, `${path}.variants`, 'must not be empty when present');
    normalizedBytesWritten = record.variants.reduce(
      (total, variant, index) =>
        total + validateMediaBytesNode(engineId, variant, `${path}.variants[${index}]`, options, buffers, objects, depth + 1),
      0,
    );
  }
  if (record.intermediates !== undefined) {
    if (!Array.isArray(record.intermediates)) contractFail(engineId, `${path}.intermediates`, 'must be an array');
    if (record.intermediates.length === 0) contractFail(engineId, `${path}.intermediates`, 'must not be empty when present');
    if (record.intermediates.length > 16) contractFail(engineId, `${path}.intermediates`, 'must contain at most 16 evidence legs');
    const roles = new Set<string>();
    record.intermediates.forEach((intermediate, index) => {
      const itemPath = `${path}.intermediates[${index}]`;
      const item = requireRecord(engineId, itemPath, intermediate);
      const role = requireNonEmptyString(engineId, `${itemPath}.role`, item.role);
      if (roles.has(role)) contractFail(engineId, `${itemPath}.role`, `duplicates role '${role}'`);
      roles.add(role);
      requireOwnedBytes(engineId, `${itemPath}.bytes`, item.bytes, buffers, false);
      requireNonEmptyString(engineId, `${itemPath}.mime`, item.mime);
      requireCanonicalContainer(engineId, `${itemPath}.container`, item.container);
    });
  }
  if (record.telemetry !== undefined) {
    const telemetry = validateOperationFinalCounters(engineId, record.telemetry, `${path}.telemetry`);
    if (telemetry.bytesWritten !== undefined && telemetry.bytesWritten !== normalizedBytesWritten) {
      contractFail(
        engineId,
        `${path}.telemetry.bytesWritten`,
        `must equal normalized output bytes (${normalizedBytesWritten})`,
      );
    }
    if (telemetry.writeCount !== undefined && record.targetWrites !== undefined && telemetry.writeCount !== record.targetWrites) {
      contractFail(engineId, `${path}.telemetry.writeCount`, 'must equal targetWrites');
    }
    if (telemetry.firstByteMs !== undefined && record.firstByteMs !== undefined && telemetry.firstByteMs !== record.firstByteMs) {
      contractFail(engineId, `${path}.telemetry.firstByteMs`, 'must equal firstByteMs');
    }
  }
  if (record.muxWriteTrace !== undefined) {
    validateMuxWriteTraceEvidence(engineId, record.muxWriteTrace, `${path}.muxWriteTrace`, bytes.byteLength, buffers);
  }
  objects.delete(record);
  return normalizedBytesWritten;
}

function validateMuxWriteTraceEvidence(
  engineId: string,
  value: unknown,
  path: string,
  finalByteLength: number,
  buffers: Map<ArrayBufferLike, string>,
): void {
  const record = requireRecord(engineId, path, value);
  if (record.schema !== 'media-test/mux-write-trace@1') {
    contractFail(engineId, `${path}.schema`, "must equal 'media-test/mux-write-trace@1'");
  }
  if (!Array.isArray(record.writes)) contractFail(engineId, `${path}.writes`, 'must be an array');
  if (!Array.isArray(record.reservations)) contractFail(engineId, `${path}.reservations`, 'must be an array');
  const extent = requireSafeInteger(engineId, `${path}.finalByteLength`, record.finalByteLength, { min: 0 });
  if (extent !== finalByteLength) {
    contractFail(engineId, `${path}.finalByteLength`, `must equal output bytes (${finalByteLength})`);
  }
  requireSafeInteger(engineId, `${path}.peakBufferedBytes`, record.peakBufferedBytes, { min: 0 });
  record.writes.forEach((write, index) => {
    const itemPath = `${path}.writes[${index}]`;
    const item = requireRecord(engineId, itemPath, write);
    requireSafeInteger(engineId, `${itemPath}.sequence`, item.sequence, { min: 0 });
    requireFinite(engineId, `${itemPath}.atMs`, item.atMs, { min: 0 });
    requireSafeInteger(engineId, `${itemPath}.position`, item.position, { min: 0 });
    requireOwnedBytes(engineId, `${itemPath}.bytes`, item.bytes, buffers, false);
    if (item.kind !== 'append' && item.kind !== 'patch') {
      contractFail(engineId, `${itemPath}.kind`, "must be 'append' or 'patch'");
    }
  });
  record.reservations.forEach((reservation, index) => {
    const itemPath = `${path}.reservations[${index}]`;
    const item = requireRecord(engineId, itemPath, reservation);
    requireSafeInteger(engineId, `${itemPath}.sequence`, item.sequence, { min: 0 });
    requireSafeInteger(engineId, `${itemPath}.position`, item.position, { min: 0 });
    requireSafeInteger(engineId, `${itemPath}.length`, item.length, { min: 1 });
  });
}

function validateDemuxTrackRepresentation(
  engineId: string,
  value: unknown,
  metadata: NormalizedMetadata,
  path: string,
  buffers: Map<ArrayBufferLike, string>,
  requireExplicitRepresentation: boolean,
): DemuxTrackRepresentation {
  const record = requireRecord(engineId, path, value);
  const trackIndex = requireSafeInteger(engineId, `${path}.trackIndex`, record.trackIndex, {
    min: 0,
    max: metadata.tracks.length - 1,
  });
  if (!isPacketOrdering(record.packetOrdering)) {
    contractFail(engineId, `${path}.packetOrdering`, "must be 'decode' or 'presentation'");
  }
  if (record.timebase !== undefined) validateRationalTimebase(engineId, record.timebase, `${path}.timebase`);
  const codec = metadata.tracks[trackIndex]?.codec;
  if (!codec) contractFail(engineId, `${path}.trackIndex`, 'does not identify a metadata track');
  validateRepresentationFields(engineId, record, codec, path, requireExplicitRepresentation);
  if (record.nativeCodecTag !== undefined) requireNonEmptyString(engineId, `${path}.nativeCodecTag`, record.nativeCodecTag);
  if (record.description !== undefined) {
    requireOwnedBytes(engineId, `${path}.description`, record.description, buffers, false);
    if (!isCodecDescriptionRecord(record.descriptionRecord)) {
      contractFail(engineId, `${path}.descriptionRecord`, 'must state the record carried by description');
    }
  } else if (record.descriptionRecord !== undefined) {
    contractFail(engineId, `${path}.descriptionRecord`, 'must be absent when description is absent');
  }
  return value as unknown as DemuxTrackRepresentation;
}

function validateRepresentationFields(
  engineId: string,
  record: Record<string, unknown>,
  codec: string,
  path: string,
  required: boolean,
): void {
  const isAvcOrHevc = codec === 'h264' || codec === 'hevc';
  if (required && isAvcOrHevc) {
    if (!isCodedChunkFraming(record.framing)) contractFail(engineId, `${path}.framing`, 'is required for H.264/H.265');
    if (!isAccessUnitGrouping(record.accessUnitGrouping)) {
      contractFail(engineId, `${path}.accessUnitGrouping`, 'is required for H.264/H.265');
    }
    if (!isParameterSetLocation(record.parameterSetLocation)) {
      contractFail(engineId, `${path}.parameterSetLocation`, 'is required for H.264/H.265');
    }
  }
  if (record.framing !== undefined && !isCodedChunkFraming(record.framing)) {
    contractFail(engineId, `${path}.framing`, 'must be an explicit canonical framing value');
  }
  if (record.accessUnitGrouping !== undefined && !isAccessUnitGrouping(record.accessUnitGrouping)) {
    contractFail(engineId, `${path}.accessUnitGrouping`, 'must be an explicit canonical grouping value');
  }
  if (record.parameterSetLocation !== undefined && !isParameterSetLocation(record.parameterSetLocation)) {
    contractFail(engineId, `${path}.parameterSetLocation`, 'must be an explicit canonical location value');
  }
  if (codec === 'h264' && record.framing !== undefined && record.framing !== 'annexb' && record.framing !== 'avc') {
    contractFail(engineId, `${path}.framing`, "H.264 framing must be 'annexb' or 'avc'");
  }
  if (codec === 'hevc' && record.framing !== undefined && record.framing !== 'annexb' && record.framing !== 'hevc') {
    contractFail(engineId, `${path}.framing`, "H.265 framing must be 'annexb' or 'hevc'");
  }
  if (record.framing === 'avc' && record.descriptionRecord !== 'avc-decoder-configuration-record') {
    contractFail(engineId, `${path}.descriptionRecord`, "AVC framing requires an AVCDecoderConfigurationRecord");
  }
  if (record.framing === 'hevc' && record.descriptionRecord !== 'hevc-decoder-configuration-record') {
    contractFail(engineId, `${path}.descriptionRecord`, "HEVC framing requires an HEVCDecoderConfigurationRecord");
  }
  if ((record.framing === 'avc' || record.framing === 'hevc') && record.description === undefined) {
    contractFail(engineId, `${path}.description`, 'length-prefixed framing requires owned configuration-record bytes');
  }
  if (record.framing === 'annexb' && record.parameterSetLocation === 'description') {
    contractFail(engineId, `${path}.parameterSetLocation`, 'Annex B parameter sets cannot exist only in description');
  }
}

function validateRationalTimebase(engineId: string, value: unknown, path: string): RationalTimebase {
  const record = requireRecord(engineId, path, value);
  requireSafeInteger(engineId, `${path}.numerator`, record.numerator, { min: 1 });
  requireSafeInteger(engineId, `${path}.denominator`, record.denominator, { min: 1 });
  return value as unknown as RationalTimebase;
}

export function validateOperationFinalCounters(
  engineId: string,
  value: unknown,
  path = 'telemetry',
): OperationFinalCounters {
  const record = requireRecord(engineId, path, value);
  if (record.progress !== undefined) requireFinite(engineId, `${path}.progress`, record.progress, { min: 0, max: 1 });
  for (const key of ['bytesRead', 'bytesWritten', 'writeCount', 'decodedFrames', 'encodedFrames', 'packetCount'] as const) {
    if (record[key] !== undefined) requireSafeInteger(engineId, `${path}.${key}`, record[key], { min: 0 });
  }
  for (const key of ['firstByteMs', 'firstFrameMs'] as const) {
    if (record[key] !== undefined) requireFinite(engineId, `${path}.${key}`, record[key], { min: 0 });
  }
  if (record.fallback !== undefined) {
    const fallback = requireRecord(engineId, `${path}.fallback`, record.fallback);
    requireNonEmptyString(engineId, `${path}.fallback.from`, fallback.from);
    requireNonEmptyString(engineId, `${path}.fallback.to`, fallback.to);
    requireNonEmptyString(engineId, `${path}.fallback.reasonCode`, fallback.reasonCode);
    requireNonEmptyString(engineId, `${path}.fallback.reason`, fallback.reason);
  }
  return value as OperationFinalCounters;
}

function contractFail(engineId: string, path: string, reason: string, reasonCode?: string): never {
  throw new AdapterContractError(engineId, path, reason, reasonCode);
}

function requireRecord(engineId: string, path: string, value: unknown): Record<string, unknown> {
  if (!isRecord(value)) contractFail(engineId, path, 'must be a plain object');
  return value;
}

function requireNonEmptyString(engineId: string, path: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) contractFail(engineId, path, 'must be a non-empty string');
  return value;
}

function requireFinite(
  engineId: string,
  path: string,
  value: unknown,
  bounds: { min?: number; max?: number } = {},
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) contractFail(engineId, path, 'must be a finite number');
  if (bounds.min !== undefined && value < bounds.min) contractFail(engineId, path, `must be >= ${bounds.min}`);
  if (bounds.max !== undefined && value > bounds.max) contractFail(engineId, path, `must be <= ${bounds.max}`);
  return value;
}

function requireSafeInteger(
  engineId: string,
  path: string,
  value: unknown,
  bounds: { min?: number; max?: number } = {},
): number {
  const number = requireFinite(engineId, path, value, bounds);
  if (!Number.isSafeInteger(number)) contractFail(engineId, path, 'must be a safe integer');
  return number;
}

function validateFiniteOptional(
  engineId: string,
  record: Record<string, unknown>,
  path: string,
  key: string,
): void {
  if (record[key] !== undefined) requireFinite(engineId, `${path}.${key}`, record[key]);
}

function validatePositiveFiniteOptional(
  engineId: string,
  record: Record<string, unknown>,
  path: string,
  key: string,
): void {
  if (record[key] !== undefined) requireFinite(engineId, `${path}.${key}`, record[key], { min: Number.MIN_VALUE });
}

function validatePositiveIntegerOptional(
  engineId: string,
  record: Record<string, unknown>,
  path: string,
  key: string,
): void {
  if (record[key] !== undefined) requireSafeInteger(engineId, `${path}.${key}`, record[key], { min: 1 });
}

function requireCanonicalContainer(engineId: string, path: string, value: unknown): CanonicalContainer {
  if (typeof value !== 'string' || !(CANONICAL_CONTAINERS as readonly string[]).includes(value)) {
    contractFail(engineId, path, `must be one of ${CANONICAL_CONTAINERS.join(', ')}`);
  }
  return value as CanonicalContainer;
}

function requireCanonicalCodec(
  engineId: string,
  path: string,
  value: unknown,
): CanonicalVideoCodec | CanonicalAudioCodec {
  const codecs: readonly string[] = [...CANONICAL_VIDEO_CODECS, ...CANONICAL_AUDIO_CODECS];
  if (typeof value !== 'string' || !codecs.includes(value)) {
    contractFail(engineId, path, `must be a canonical codec token (${codecs.join(', ')})`);
  }
  return value as CanonicalVideoCodec | CanonicalAudioCodec;
}

function requireCanonicalVideoCodec(engineId: string, path: string, value: unknown): CanonicalVideoCodec {
  if (typeof value !== 'string' || !(CANONICAL_VIDEO_CODECS as readonly string[]).includes(value)) {
    contractFail(engineId, path, `must be a canonical video codec token (${CANONICAL_VIDEO_CODECS.join(', ')})`);
  }
  return value as CanonicalVideoCodec;
}

function requireCanonicalAudioCodec(engineId: string, path: string, value: unknown): CanonicalAudioCodec {
  if (typeof value !== 'string' || !(CANONICAL_AUDIO_CODECS as readonly string[]).includes(value)) {
    contractFail(engineId, path, `must be a canonical audio codec token (${CANONICAL_AUDIO_CODECS.join(', ')})`);
  }
  return value as CanonicalAudioCodec;
}

function requireBoundedCodecToken(engineId: string, path: string, value: unknown): string {
  const token = requireNonEmptyString(engineId, path, value);
  if (token.length > 256) contractFail(engineId, path, 'must be at most 256 characters');
  return token;
}

function requireTrackCodec(
  engineId: string,
  path: string,
  value: unknown,
  type: TrackType,
): string {
  if (type === 'video') return requireCanonicalVideoCodec(engineId, path, value);
  if (type === 'audio') return requireCanonicalAudioCodec(engineId, path, value);
  // Subtitle/data/timecode vocabularies are container-specific. Preserve their bounded native
  // token rather than misclassifying it as one of the benchmark's audio/video codec families.
  return requireBoundedCodecToken(engineId, path, value);
}

function requireOwnedBytes(
  engineId: string,
  path: string,
  value: unknown,
  buffers: Map<ArrayBufferLike, string>,
  allowEmpty: boolean,
): Uint8Array {
  if (!(value instanceof Uint8Array)) contractFail(engineId, path, 'must be an owned Uint8Array');
  if (!(value.buffer instanceof ArrayBuffer)) contractFail(engineId, path, 'must not use SharedArrayBuffer/native storage');
  if (value.byteOffset !== 0 || value.byteLength !== value.buffer.byteLength) {
    contractFail(engineId, path, 'must be a tight owned buffer, not an aliased view');
  }
  if (!allowEmpty && value.byteLength === 0) contractFail(engineId, path, 'must not be empty');
  const previous = buffers.get(value.buffer);
  if (previous !== undefined) contractFail(engineId, path, `aliases the buffer already owned by ${previous}`);
  buffers.set(value.buffer, path);
  return value;
}

function copyBufferSource(value: unknown): Uint8Array {
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return bytes.slice();
  }
  throw new TypeError('value is not a BufferSource');
}

function isTrackType(value: unknown): value is TrackType {
  return value === 'video' || value === 'audio' || value === 'subtitle' || value === 'other';
}

function isPacketOrdering(value: unknown): value is PacketOrdering {
  return value === 'decode' || value === 'presentation';
}

function isCodedChunkFraming(value: unknown): value is CodedChunkFraming {
  return value === 'annexb' || value === 'avc' || value === 'hevc' || value === 'obu' || value === 'ivf' || value === 'adts' || value === 'raw' || value === 'codec-private';
}

function isAccessUnitGrouping(value: unknown): value is AccessUnitGrouping {
  return value === 'one-access-unit-per-chunk' || value === 'one-frame-per-chunk' || value === 'one-packet-per-chunk' || value === 'multiple-access-units-per-chunk';
}

function isParameterSetLocation(value: unknown): value is ParameterSetLocation {
  return value === 'in-band' || value === 'description' || value === 'both' || value === 'not-applicable';
}

function isCodecDescriptionRecord(value: unknown): value is CodecDescriptionRecord {
  return value === 'avc-decoder-configuration-record' || value === 'hevc-decoder-configuration-record' || value === 'audio-specific-config' || value === 'codec-private';
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

export function validateCapabilitySet(
  engine: Pick<MediaEngine, 'id' | 'capabilities'> & Partial<MediaEngine>,
  value: unknown = engine.capabilities(),
): CapabilitySet {
  const path = 'capabilities';
  const record = requireRecord(engine.id, path, value);
  const operations = requireRecord(engine.id, `${path}.operations`, record.operations);
  const operationTokens: readonly Operation[] = [
    'probe',
    'demux',
    'remux',
    'transcode',
    'decodeFrames',
    'seek',
    'trim',
    'mux',
    'decrypt',
  ];
  for (const [key, declared] of Object.entries(operations)) {
    if (!operationTokens.includes(key as Operation)) contractFail(engine.id, `${path}.operations.${key}`, 'is not a known operation');
    if (typeof declared !== 'boolean') contractFail(engine.id, `${path}.operations.${key}`, 'must be boolean');
  }
  for (const operation of operationTokens) {
    if (operations[operation] === true && typeof (engine as unknown as Record<string, unknown>)[operation] !== 'function') {
      contractFail(engine.id, `${path}.operations.${operation}`, 'is declared but the adapter method is not callable');
    }
  }

  validateTokenArray(engine.id, `${path}.containersIn`, record.containersIn, CANONICAL_CONTAINERS);
  validateTokenArray(engine.id, `${path}.containersOut`, record.containersOut, CANONICAL_CONTAINERS);
  validateTokenArray(engine.id, `${path}.videoCodecs`, record.videoCodecs, CANONICAL_VIDEO_CODECS);
  validateTokenArray(engine.id, `${path}.audioCodecs`, record.audioCodecs, CANONICAL_AUDIO_CODECS);
  if (record.videoCodecsIn !== undefined) validateTokenArray(engine.id, `${path}.videoCodecsIn`, record.videoCodecsIn, CANONICAL_VIDEO_CODECS);
  if (record.videoCodecsOut !== undefined) validateTokenArray(engine.id, `${path}.videoCodecsOut`, record.videoCodecsOut, CANONICAL_VIDEO_CODECS);
  if (record.audioCodecsIn !== undefined) validateTokenArray(engine.id, `${path}.audioCodecsIn`, record.audioCodecsIn, CANONICAL_AUDIO_CODECS);
  if (record.audioCodecsOut !== undefined) validateTokenArray(engine.id, `${path}.audioCodecsOut`, record.audioCodecsOut, CANONICAL_AUDIO_CODECS);
  const encryptionTokens: readonly EncryptionScheme[] = [
    'cenc-ctr',
    'cenc-cbcs',
    'hls-aes128',
    'clearkey',
    'cenc-cens',
    'hls-sample-aes',
  ];
  validateTokenArray(engine.id, `${path}.encryption`, record.encryption, encryptionTokens);
  validateFreeTokenArray(engine.id, `${path}.features`, record.features);
  if (record.probeReadModes !== undefined) {
    validateTokenArray(
      engine.id,
      `${path}.probeReadModes`,
      record.probeReadModes,
      ['range', 'progressive', 'whole-file'] as const,
    );
  }
  return value as CapabilitySet;
}

/** Adapter ids are result identities and therefore must pin a reproducible framework version. */
export function validateAdapterIdentity(engineId: unknown, path = 'engine.id'): string {
  if (typeof engineId !== 'string' || !/^[a-z0-9][a-z0-9._-]*@[^@\s]+$/i.test(engineId)) {
    throw new AdapterContractError(String(engineId), path, "must be a stable versioned id like 'library@1.2.3'", 'ADAPTER_ID_INVALID');
  }
  return engineId;
}

/** Validate the concrete tuple before it crosses the scored adapter support boundary. */
export function validateConcreteOperationRequest(
  engineId: string,
  value: unknown,
  path = 'supports.request',
): ConcreteOperationRequest {
  const record = requireRecord(engineId, path, value);
  if (record.protocol !== CONCRETE_OPERATION_PROTOCOL) {
    contractFail(engineId, `${path}.protocol`, `must equal '${CONCRETE_OPERATION_PROTOCOL}'`);
  }
  requireNonEmptyString(engineId, `${path}.scenarioId`, record.scenarioId);
  const operations: readonly ConcreteRequestOperation[] = [
    'probe', 'demux', 'remux', 'transcode', 'decodeFrames', 'seek', 'trim', 'mux', 'decrypt', 'concat',
  ];
  if (!operations.includes(record.operation as ConcreteRequestOperation)) {
    contractFail(engineId, `${path}.operation`, 'must name a public or oracle-secondary concrete operation');
  }
  if (!Array.isArray(record.inputs)) contractFail(engineId, `${path}.inputs`, 'must be an array');
  record.inputs.forEach((input, index) => {
    const itemPath = `${path}.inputs[${index}]`;
    const item = requireRecord(engineId, itemPath, input);
    requireNonEmptyString(engineId, `${itemPath}.id`, item.id);
    requireNonEmptyString(engineId, `${itemPath}.mime`, item.mime);
    requireNonEmptyString(engineId, `${itemPath}.container`, item.container);
    if (item.sizeBytes !== undefined) requireSafeInteger(engineId, `${itemPath}.sizeBytes`, item.sizeBytes, { min: 0 });
    if (typeof item.mutated !== 'boolean') contractFail(engineId, `${itemPath}.mutated`, 'must be boolean');
    if (item.sourceEvidence !== 'UNRESOLVED' && item.sourceEvidence !== 'RESOLVED') {
      contractFail(engineId, `${itemPath}.sourceEvidence`, "must be 'UNRESOLVED' or 'RESOLVED'");
    }
    if (!Array.isArray(item.tracks)) contractFail(engineId, `${itemPath}.tracks`, 'must be an array');
    if (item.sourceEvidence === 'UNRESOLVED' && item.tracks.length > 0) {
      contractFail(engineId, `${itemPath}.tracks`, 'must be empty while source evidence is UNRESOLVED');
    }
    item.tracks.forEach((track, trackIndex) =>
      validateNormalizedTrack(engineId, track, `${itemPath}.tracks[${trackIndex}]`));
  });
  if (record.output !== undefined) {
    const output = requireRecord(engineId, `${path}.output`, record.output);
    requireNonEmptyString(engineId, `${path}.output.container`, output.container);
    for (const key of ['videoCodec', 'audioCodec'] as const) {
      if (output[key] !== undefined) requireNonEmptyString(engineId, `${path}.output.${key}`, output[key]);
    }
    for (const key of ['width', 'height', 'sampleRate', 'channels'] as const) {
      if (output[key] !== undefined) requireSafeInteger(engineId, `${path}.output.${key}`, output[key], { min: 1 });
    }
    if (output.frameRate !== undefined) requireFinite(engineId, `${path}.output.frameRate`, output.frameRate, { min: Number.MIN_VALUE });
  }
  if (record.timingMode !== undefined) requireNonEmptyString(engineId, `${path}.timingMode`, record.timingMode);
  if (record.transforms !== undefined) cloneStrictJson(engineId, `${path}.transforms`, record.transforms, new Set<object>());
  const options = cloneStrictJson(engineId, `${path}.options`, record.options, new Set<object>());
  if (!isRecord(options)) contractFail(engineId, `${path}.options`, 'must be a plain JSON object');
  return value as ConcreteOperationRequest;
}

export function validateSupportDecision(engineId: string, value: unknown, path = 'supports.result'): SupportDecision {
  const record = requireRecord(engineId, path, value);
  if (record.supported === true) {
    if (record.browserConfigs !== undefined) validateBrowserConfigs(engineId, record.browserConfigs, `${path}.browserConfigs`);
    return value as SupportDecision;
  }
  if (record.supported !== false) contractFail(engineId, `${path}.supported`, 'must be boolean');
  if (record.status !== 'NA_ENGINE' && record.status !== 'NA_BROWSER') {
    contractFail(engineId, `${path}.status`, "must be 'NA_ENGINE' or 'NA_BROWSER'");
  }
  requireNonEmptyString(engineId, `${path}.reasonCode`, record.reasonCode);
  requireNonEmptyString(engineId, `${path}.reason`, record.reason);
  if (record.preContent !== undefined && record.preContent !== true) {
    contractFail(engineId, `${path}.preContent`, 'must be true when present');
  }
  if (record.browserConfigs !== undefined) validateBrowserConfigs(engineId, record.browserConfigs, `${path}.browserConfigs`);
  return value as SupportDecision;
}

/** Clone and freeze the exact support decision/config evidence supplied to execution. */
export function captureCheckedSupportSnapshot(
  engineId: string,
  value: unknown,
  path = 'operationContext.checkedSupport',
): CheckedSupportSnapshot {
  const record = requireRecord(engineId, path, value);
  if (record.protocol !== CHECKED_SUPPORT_SNAPSHOT_PROTOCOL) {
    contractFail(engineId, `${path}.protocol`, `must equal '${CHECKED_SUPPORT_SNAPSHOT_PROTOCOL}'`);
  }
  const decisionId = requireNonEmptyString(engineId, `${path}.decisionId`, record.decisionId);
  const decisionRecord = requireRecord(engineId, `${path}.decision`, record.decision);
  let decision: CheckedSupportDecision;
  if (decisionRecord.supported === true) {
    decision = { supported: true };
  } else {
    if (decisionRecord.supported !== false) contractFail(engineId, `${path}.decision.supported`, 'must be boolean');
    if (decisionRecord.status !== 'NA_ENGINE' && decisionRecord.status !== 'NA_BROWSER') {
      contractFail(engineId, `${path}.decision.status`, "must be 'NA_ENGINE' or 'NA_BROWSER'");
    }
    decision = {
      supported: false,
      status: decisionRecord.status,
      reasonCode: requireNonEmptyString(engineId, `${path}.decision.reasonCode`, decisionRecord.reasonCode),
      reason: requireNonEmptyString(engineId, `${path}.decision.reason`, decisionRecord.reason),
    };
  }
  if (!Array.isArray(record.browserChecks)) contractFail(engineId, `${path}.browserChecks`, 'must be an array');
  const evidenceIds = new Set<string>();
  const browserChecks = record.browserChecks.map((entry, index): CheckedBrowserConfigEvidence => {
    const itemPath = `${path}.browserChecks[${index}]`;
    const item = requireRecord(engineId, itemPath, entry);
    const evidenceId = requireNonEmptyString(engineId, `${itemPath}.evidenceId`, item.evidenceId);
    if (evidenceIds.has(evidenceId)) contractFail(engineId, `${itemPath}.evidenceId`, 'must be unique');
    evidenceIds.add(evidenceId);
    if (item.state !== 'SUPPORTED' && item.state !== 'UNSUPPORTED' && item.state !== 'ERROR') {
      contractFail(engineId, `${itemPath}.state`, 'must be SUPPORTED, UNSUPPORTED, or ERROR');
    }
    if (item.state !== 'SUPPORTED') requireNonEmptyString(engineId, `${itemPath}.reasonCode`, item.reasonCode);
    const [checkedConfig] = validateBrowserConfigs(engineId, [item.checkedConfig], `${itemPath}.checkedConfig`);
    return {
      evidenceId,
      checkedConfig: cloneWebCodecsConfig(checkedConfig!),
      state: item.state,
      ...(item.reasonCode !== undefined
        ? { reasonCode: requireNonEmptyString(engineId, `${itemPath}.reasonCode`, item.reasonCode) }
        : {}),
    };
  });
  return deepFreezeCloneSafe({
    protocol: CHECKED_SUPPORT_SNAPSHOT_PROTOCOL,
    decisionId,
    decision,
    browserChecks,
  }) as CheckedSupportSnapshot;
}

function validateBrowserConfigs(engineId: string, value: unknown, path: string): ConcreteWebCodecsConfig[] {
  if (!Array.isArray(value)) contractFail(engineId, path, 'must be an array');
  value.forEach((entry, index) => {
    const itemPath = `${path}[${index}]`;
    const item = requireRecord(engineId, itemPath, entry);
    if (item.role !== 'video-decoder' && item.role !== 'video-encoder' && item.role !== 'audio-decoder' && item.role !== 'audio-encoder') {
      contractFail(engineId, `${itemPath}.role`, 'must be a concrete WebCodecs role');
    }
    if (item.trackIndex !== undefined) requireSafeInteger(engineId, `${itemPath}.trackIndex`, item.trackIndex, { min: 0 });
    const config = requireRecord(engineId, `${itemPath}.config`, item.config);
    requireNonEmptyString(engineId, `${itemPath}.config.codec`, config.codec);
  });
  return value as ConcreteWebCodecsConfig[];
}

function validateTokenArray<T extends string>(
  engineId: string,
  path: string,
  value: unknown,
  allowed: readonly T[],
): T[] {
  if (!Array.isArray(value)) contractFail(engineId, path, 'must be an array');
  const seen = new Set<string>();
  value.forEach((token, index) => {
    if (typeof token !== 'string' || !allowed.includes(token as T)) {
      contractFail(engineId, `${path}[${index}]`, `must be one of ${allowed.join(', ')}`);
    }
    if (seen.has(token)) contractFail(engineId, `${path}[${index}]`, `duplicates '${token}'`);
    seen.add(token);
  });
  return value as T[];
}

function validateFreeTokenArray(engineId: string, path: string, value: unknown): string[] {
  if (!Array.isArray(value)) contractFail(engineId, path, 'must be an array');
  const seen = new Set<string>();
  value.forEach((token, index) => {
    const normalized = requireNonEmptyString(engineId, `${path}[${index}]`, token);
    if (seen.has(normalized)) contractFail(engineId, `${path}[${index}]`, `duplicates '${normalized}'`);
    seen.add(normalized);
  });
  return value as string[];
}

export function validateOperationTelemetry(
  engineId: string,
  events: readonly OperationTelemetry[],
  final?: OperationFinalCounters,
  path = 'telemetry.events',
  allowMissingFinal = false,
): readonly OperationTelemetry[] {
  const rootPath = path.replace(/\.events$/, '');
  let lastAtMs = -Infinity;
  let lastProgress = -Infinity;
  const cumulative = new Map<OperationTelemetry['type'], number>();
  let firstByteMs: number | undefined;
  let firstFrameMs: number | undefined;
  let fallback: OperationFinalCounters['fallback'];

  events.forEach((event, index) => {
    const eventPath = `${path}[${index}]`;
    const record = requireRecord(engineId, eventPath, event);
    const atMs = requireFinite(engineId, `${eventPath}.atMs`, record.atMs, { min: 0 });
    if (atMs < lastAtMs) contractFail(engineId, `${eventPath}.atMs`, `must be monotonic (previous ${lastAtMs})`);
    lastAtMs = atMs;
    switch (record.type) {
      case 'progress':
        if (record.determinate === true) {
          const progress = requireFinite(engineId, `${eventPath}.value`, record.value, { min: 0, max: 1 });
          if (progress < lastProgress) contractFail(engineId, `${eventPath}.value`, 'determinate progress must be monotonic');
          lastProgress = progress;
        } else if (record.determinate !== false || record.value !== undefined) {
          contractFail(engineId, `${eventPath}.determinate`, 'indeterminate progress must be explicit and carry no value');
        }
        break;
      case 'bytes-read':
        validateCumulativeEvent(engineId, eventPath, record, 'bytes', cumulative, 'bytes-read');
        break;
      case 'bytes-written':
        validateCumulativeEvent(engineId, eventPath, record, 'bytes', cumulative, 'bytes-written');
        break;
      case 'write-count':
        validateCumulativeEvent(engineId, eventPath, record, 'count', cumulative, 'write-count');
        break;
      case 'decoded-frame-count':
        validateCumulativeEvent(engineId, eventPath, record, 'count', cumulative, 'decoded-frame-count');
        break;
      case 'encoded-frame-count':
        validateCumulativeEvent(engineId, eventPath, record, 'count', cumulative, 'encoded-frame-count');
        break;
      case 'first-byte':
        if (firstByteMs !== undefined) contractFail(engineId, eventPath, 'first-byte may be emitted only once');
        firstByteMs = atMs;
        break;
      case 'first-frame':
        if (firstFrameMs !== undefined) contractFail(engineId, eventPath, 'first-frame may be emitted only once');
        firstFrameMs = atMs;
        break;
      case 'framework-fallback':
        requireNonEmptyString(engineId, `${eventPath}.from`, record.from);
        requireNonEmptyString(engineId, `${eventPath}.to`, record.to);
        requireNonEmptyString(engineId, `${eventPath}.reasonCode`, record.reasonCode);
        requireNonEmptyString(engineId, `${eventPath}.reason`, record.reason);
        fallback = {
          from: record.from as string,
          to: record.to as string,
          reasonCode: record.reasonCode as string,
          reason: record.reason as string,
        };
        break;
      default:
        contractFail(engineId, `${eventPath}.type`, 'is not a known telemetry event');
    }
  });

  if (final !== undefined) {
    validateOperationFinalCounters(engineId, final, `${rootPath}.final`);
    compareTerminalCounter(engineId, final.bytesRead, cumulative.get('bytes-read'), 'bytesRead', rootPath);
    compareTerminalCounter(engineId, final.bytesWritten, cumulative.get('bytes-written'), 'bytesWritten', rootPath);
    compareTerminalCounter(engineId, final.writeCount, cumulative.get('write-count'), 'writeCount', rootPath);
    compareTerminalCounter(engineId, final.decodedFrames, cumulative.get('decoded-frame-count'), 'decodedFrames', rootPath);
    compareTerminalCounter(engineId, final.encodedFrames, cumulative.get('encoded-frame-count'), 'encodedFrames', rootPath);
    compareTerminalCounter(engineId, final.firstByteMs, firstByteMs, 'firstByteMs', rootPath);
    compareTerminalCounter(engineId, final.firstFrameMs, firstFrameMs, 'firstFrameMs', rootPath);
    if (lastProgress !== -Infinity && final.progress !== lastProgress) {
      contractFail(engineId, `${rootPath}.final.progress`, `must equal terminal progress event (${lastProgress})`);
    }
    if (fallback !== undefined && !sameFallback(final.fallback, fallback)) {
      contractFail(engineId, `${rootPath}.final.fallback`, 'must equal the final framework-fallback event');
    }
  } else if (events.length > 0 && !allowMissingFinal) {
    contractFail(engineId, `${rootPath}.final`, 'final counters are required when telemetry events were emitted');
  }
  return events;
}

export class OperationTelemetryCollector {
  readonly events: OperationTelemetry[] = [];
  private closed = false;
  private readonly abortListener: () => void;

  constructor(
    private readonly engineId: string,
    readonly signal: AbortSignal,
  ) {
    this.abortListener = () => {
      this.closed = true;
    };
    if (signal.aborted) this.closed = true;
    else signal.addEventListener('abort', this.abortListener, { once: true });
  }

  readonly emit = (event: OperationTelemetry): void => {
    if (this.closed || this.signal.aborted) {
      throw new AdapterContractError(this.engineId, 'telemetry.emit', 'must not emit after abort/close', 'ADAPTER_WORK_AFTER_ABORT');
    }
    // Validate the new event's schema immediately; cumulative/order relationships are validated
    // once over the complete sequence in close(). Revalidating a copied prefix on every emit makes
    // packet-scale telemetry O(n²) without strengthening the final contract.
    validateOperationTelemetry(this.engineId, [event], undefined, 'telemetry.events', true);
    this.events.push(cloneTelemetryEvent(event));
  };

  close(final?: OperationFinalCounters): readonly OperationTelemetry[] {
    this.closed = true;
    this.signal.removeEventListener('abort', this.abortListener);
    validateOperationTelemetry(this.engineId, this.events, final);
    return Object.freeze(this.events.map((event) => Object.freeze({ ...event }))) as readonly OperationTelemetry[];
  }
}

function validateCumulativeEvent(
  engineId: string,
  path: string,
  record: Record<string, unknown>,
  field: 'bytes' | 'count',
  cumulative: Map<OperationTelemetry['type'], number>,
  type: OperationTelemetry['type'],
): void {
  const value = requireSafeInteger(engineId, `${path}.${field}`, record[field], { min: 0 });
  const prior = cumulative.get(type);
  if (prior !== undefined && value < prior) contractFail(engineId, `${path}.${field}`, `must be cumulative (previous ${prior})`);
  cumulative.set(type, value);
}

function compareTerminalCounter(
  engineId: string,
  finalValue: number | undefined,
  eventValue: number | undefined,
  key: string,
  path: string,
): void {
  if (eventValue !== undefined && finalValue !== eventValue) {
    contractFail(engineId, `${path}.final.${key}`, `must equal terminal event value (${eventValue})`);
  }
}

function sameFallback(
  a: OperationFinalCounters['fallback'],
  b: NonNullable<OperationFinalCounters['fallback']>,
): boolean {
  return a?.from === b.from && a.to === b.to && a.reasonCode === b.reasonCode && a.reason === b.reason;
}

function cloneTelemetryEvent(event: OperationTelemetry): OperationTelemetry {
  return { ...event } as OperationTelemetry;
}

// ── Immutable config snapshots ─────────────────────────────────────────────────────────────────────────────────

/** Recommended complete adapter configuration profile used by the strict conformance gate. */
export interface AdapterConfigProfile {
  framework: string;
  packageVersions: Record<string, string>;
  backend: string;
  hardwareAcceleration: string;
  workerCount: number;
  threadCount: number;
  readerMode: string;
  writerMode: string;
  targetMode: string;
  codecConfigs: SerializableValue[];
  fallback?: { from: string; to: string; reasonCode: string; reason: string };
  /** Declare framework encoder nondeterminism; normalized semantic observations remain repeatable. */
  encoderNondeterministic?: boolean;
  [key: string]: unknown;
}

export type ImmutableConfigSnapshot = Readonly<{ [key: string]: SerializableValue }>;

export function captureConfigUsedSnapshot(
  engineId: string,
  value: unknown,
  options: { requireProfile?: boolean; path?: string } = {},
): ImmutableConfigSnapshot {
  const path = options.path ?? 'configUsed';
  const cloned = cloneStrictJson(engineId, path, value, new Set<object>());
  if (!isRecord(cloned)) contractFail(engineId, path, 'must be a JSON object');
  if (options.requireProfile === true) validateConfigProfile(engineId, cloned, path);
  return deepFreezeJson(cloned) as ImmutableConfigSnapshot;
}

export function validateConfigProfile(
  engineId: string,
  value: unknown,
  path = 'configUsed',
): AdapterConfigProfile {
  const record = requireRecord(engineId, path, value);
  for (const key of ['framework', 'backend', 'hardwareAcceleration', 'readerMode', 'writerMode', 'targetMode'] as const) {
    requireNonEmptyString(engineId, `${path}.${key}`, record[key]);
  }
  for (const key of ['workerCount', 'threadCount'] as const) {
    requireSafeInteger(engineId, `${path}.${key}`, record[key], { min: 0 });
  }
  const versions = requireRecord(engineId, `${path}.packageVersions`, record.packageVersions);
  if (Object.keys(versions).length === 0) contractFail(engineId, `${path}.packageVersions`, 'must identify at least one package');
  for (const [name, version] of Object.entries(versions)) {
    requireNonEmptyString(engineId, `${path}.packageVersions.${name}`, version);
  }
  if (!Array.isArray(record.codecConfigs)) contractFail(engineId, `${path}.codecConfigs`, 'must be an array');
  if (record.encoderNondeterministic !== undefined && typeof record.encoderNondeterministic !== 'boolean') {
    contractFail(engineId, `${path}.encoderNondeterministic`, 'must be boolean');
  }
  if (record.fallback !== undefined) validateOperationFinalCounters(engineId, { fallback: record.fallback }, path);
  return value as AdapterConfigProfile;
}

/** Holds separately captured functional/measured snapshots; later source mutations cannot affect it. */
export class ConfigUsedSnapshots {
  functional?: ImmutableConfigSnapshot;
  measured?: ImmutableConfigSnapshot;

  constructor(private readonly engineId: string) {}

  capture(phase: 'functional' | 'measured', value: unknown, requireProfile = false): ImmutableConfigSnapshot {
    const snapshot = captureConfigUsedSnapshot(this.engineId, value, {
      requireProfile,
      path: `configUsed.${phase}`,
    });
    if (phase === 'functional') this.functional = snapshot;
    else this.measured = snapshot;
    return snapshot;
  }

  toJSON(): { functional?: ImmutableConfigSnapshot; measured?: ImmutableConfigSnapshot } {
    return {
      ...(this.functional !== undefined ? { functional: this.functional } : {}),
      ...(this.measured !== undefined ? { measured: this.measured } : {}),
    };
  }
}

function cloneStrictJson(
  engineId: string,
  path: string,
  value: unknown,
  seen: Set<object>,
): SerializableValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) contractFail(engineId, path, 'non-finite numbers are not JSON-serializable');
    return value;
  }
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' || value === undefined) {
    contractFail(engineId, path, `${typeof value} values are not JSON-serializable`);
  }
  if (value instanceof Promise) contractFail(engineId, path, 'promises are not valid configuration evidence');
  if (typeof Node !== 'undefined' && value instanceof Node) contractFail(engineId, path, 'DOM/native objects are not valid configuration evidence');
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    contractFail(engineId, path, 'binary/native objects must be normalized to JSON values');
  }
  if (typeof value !== 'object' || value === null) contractFail(engineId, path, 'is not JSON-serializable');
  if (seen.has(value)) contractFail(engineId, path, 'contains a cycle');
  seen.add(value);

  if (Array.isArray(value)) {
    const out = value.map((item, index) => cloneStrictJson(engineId, `${path}[${index}]`, item, seen));
    seen.delete(value);
    return out;
  }
  if (!isPlainJsonObject(value)) contractFail(engineId, path, 'DOM/native/class instances are not valid configuration evidence');
  const symbols = Object.getOwnPropertySymbols(value);
  if (symbols.length > 0) contractFail(engineId, path, 'symbol-keyed values are not JSON-serializable');
  const out: { [key: string]: SerializableValue } = {};
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable) contractFail(engineId, `${path}.${key}`, 'non-enumerable values are not allowed');
    if (!('value' in descriptor)) contractFail(engineId, `${path}.${key}`, 'accessors are not allowed in config snapshots');
    out[key] = cloneStrictJson(engineId, `${path}.${key}`, descriptor.value, seen);
  }
  seen.delete(value);
  return out;
}

function isPlainJsonObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value) as { constructor?: { name?: string } } | null;
  return prototype === null || prototype.constructor?.name === 'Object';
}

function deepFreezeJson<T extends SerializableValue>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) deepFreezeJson(item);
    Object.freeze(value);
  }
  return value;
}

/**
 * Deep-freeze an already-clone-safe value in place. Unlike `deepFreezeJson`, this does not constrain
 * the value to the JSON `SerializableValue` shape, so it can freeze evidence snapshots that embed
 * structured-clone-safe (but not strictly JSON) members such as WebCodecs config records.
 */
function deepFreezeCloneSafe<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) deepFreezeCloneSafe(item);
    Object.freeze(value);
  }
  return value;
}

// ── Lifecycle and transfer-like native resource ownership ─────────────────────────────────────────────────────

export type AdapterLifecycleState =
  | 'constructed'
  | 'initializing'
  | 'initialized'
  | 'operating'
  | 'disposing'
  | 'disposed';

export interface CleanupDiagnostic {
  resource: string;
  reason: string;
}

interface TrackedResource {
  value: object;
  label: string;
  dispose: (value: object) => void | Promise<void>;
  closed: boolean;
}

/**
 * Instruments transfer-like ownership. Resources are closed at most once, including when explicit
 * release, abort cleanup, and final disposal race with each other.
 */
export class ResourceOwnershipTracker {
  private readonly resources: TrackedResource[] = [];
  private abortCleanup: Promise<CleanupDiagnostic[]> | undefined;
  private unbindAbort: (() => void) | undefined;

  constructor(private readonly engineId: string) {}

  own<T extends object>(
    value: T,
    label: string,
    dispose: (value: T) => void | Promise<void> = inferResourceDisposer as (value: T) => void | Promise<void>,
  ): T {
    if (this.resources.some((entry) => entry.value === value)) {
      throw new AdapterContractError(this.engineId, `resources.${label}`, 'resource is already owned', 'ADAPTER_RESOURCE_ALIASED');
    }
    this.resources.push({
      value,
      label: requireNonEmpty(label, 'resource label'),
      dispose: (resource) => dispose(resource as T),
      closed: false,
    });
    return value;
  }

  async release(value: object): Promise<CleanupDiagnostic | undefined> {
    const entry = this.resources.find((candidate) => candidate.value === value);
    if (!entry) throw new AdapterContractError(this.engineId, 'resources.release', 'resource is not owned', 'ADAPTER_RESOURCE_NOT_OWNED');
    return this.closeEntry(entry);
  }

  bindAbort(signal: AbortSignal): void {
    this.unbindAbort?.();
    const abort = (): void => {
      this.abortCleanup ??= this.disposeAll();
    };
    if (signal.aborted) abort();
    else {
      signal.addEventListener('abort', abort, { once: true });
      this.unbindAbort = () => signal.removeEventListener('abort', abort);
    }
  }

  async waitForAbortCleanup(): Promise<CleanupDiagnostic[]> {
    return (await this.abortCleanup) ?? [];
  }

  async disposeAll(): Promise<CleanupDiagnostic[]> {
    this.unbindAbort?.();
    this.unbindAbort = undefined;
    const diagnostics: CleanupDiagnostic[] = [];
    for (const entry of [...this.resources].reverse()) {
      const diagnostic = await this.closeEntry(entry);
      if (diagnostic) diagnostics.push(diagnostic);
    }
    return diagnostics;
  }

  get activeCount(): number {
    return this.resources.filter((entry) => !entry.closed).length;
  }

  get closeCounts(): Readonly<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const entry of this.resources) out[entry.label] = entry.closed ? 1 : 0;
    return Object.freeze(out);
  }

  assertNoLeaks(): void {
    const active = this.resources.filter((entry) => !entry.closed).map((entry) => entry.label);
    if (active.length > 0) {
      throw new AdapterContractError(this.engineId, 'resources', `unreleased resources: ${active.join(', ')}`, 'ADAPTER_RESOURCE_LEAK');
    }
  }

  private async closeEntry(entry: TrackedResource): Promise<CleanupDiagnostic | undefined> {
    if (entry.closed) return undefined;
    entry.closed = true;
    try {
      await entry.dispose(entry.value);
      return undefined;
    } catch (error) {
      return { resource: entry.label, reason: errorText(error) };
    }
  }
}

/** Serial constructed→initialized→operations→disposed state machine for adapter scaffolds. */
export class AdapterLifecycleController {
  private current: AdapterLifecycleState = 'constructed';
  private initPromise: Promise<void> | undefined;
  private disposePromise: Promise<CleanupDiagnostic[]> | undefined;
  private cellSignal: AbortSignal | undefined;
  readonly cleanupDiagnostics: CleanupDiagnostic[] = [];

  constructor(private readonly engineId: string) {}

  get state(): AdapterLifecycleState {
    return this.current;
  }

  async init(context: LifecycleContext, setup: () => void | Promise<void>): Promise<void> {
    this.bindCellSignal(context.signal, 'init');
    if (this.current === 'disposed' || this.current === 'disposing') this.misuse('init', 'cannot initialize after disposal');
    if (this.current === 'initialized' || this.current === 'operating') return;
    if (this.initPromise) return this.initPromise;
    throwIfAborted(context.signal);
    this.current = 'initializing';
    this.initPromise = Promise.resolve()
      .then(setup)
      .then(() => {
        throwIfAborted(context.signal);
        this.current = 'initialized';
      })
      .catch((error) => {
        this.current = 'constructed';
        this.initPromise = undefined;
        throw error;
      });
    return this.initPromise;
  }

  async operation<T>(
    operation: ApplicabilityOperation,
    context: OperationContext,
    run: () => T | Promise<T>,
    reset: () => void | Promise<void> = () => undefined,
  ): Promise<T> {
    this.bindCellSignal(context.signal, operation);
    if (this.current !== 'initialized') {
      this.misuse(operation, this.current === 'disposed' ? 'cannot run after disposal' : 'requires successful initialization');
    }
    throwIfAborted(context.signal);
    this.current = 'operating';
    try {
      await reset();
      throwIfAborted(context.signal);
      const result = await run();
      throwIfAborted(context.signal);
      return result;
    } finally {
      try {
        await reset();
      } finally {
        if (this.current === 'operating') this.current = 'initialized';
      }
    }
  }

  async dispose(
    _context: LifecycleContext,
    cleanup: () => void | CleanupDiagnostic[] | Promise<void | CleanupDiagnostic[]>,
  ): Promise<CleanupDiagnostic[]> {
    this.bindCellSignal(_context.signal, 'dispose');
    if (this.disposePromise) return this.disposePromise;
    if (this.current === 'disposed') return this.cleanupDiagnostics;
    if (this.current === 'operating') this.misuse('dispose', 'cannot dispose while an operation is active');
    this.current = 'disposing';
    this.disposePromise = Promise.resolve()
      .then(cleanup)
      .then((diagnostics) => {
        if (Array.isArray(diagnostics)) this.cleanupDiagnostics.push(...diagnostics);
        this.current = 'disposed';
        return this.cleanupDiagnostics;
      })
      .catch((error) => {
        this.cleanupDiagnostics.push({ resource: 'adapter.dispose', reason: errorText(error) });
        this.current = 'disposed';
        return this.cleanupDiagnostics;
      });
    return this.disposePromise;
  }

  assertReady(operation: ApplicabilityOperation): void {
    if (this.current !== 'initialized') this.misuse(operation, 'adapter is not initialized');
  }

  private misuse(operation: ApplicabilityOperation, reason: string): never {
    throw new AdapterContractError(
      this.engineId,
      `lifecycle.${operation}`,
      `${reason} (state=${this.current})`,
      'ADAPTER_LIFECYCLE_MISUSE',
    );
  }

  private bindCellSignal(signal: AbortSignal, operation: ApplicabilityOperation): void {
    if (this.cellSignal === undefined) {
      this.cellSignal = signal;
      return;
    }
    if (this.cellSignal !== signal) {
      throw new AdapterContractError(
        this.engineId,
        `lifecycle.${operation}.signal`,
        'every lifecycle and operation call in a cell must receive the same AbortSignal',
        'ADAPTER_SIGNAL_IDENTITY_MISMATCH',
      );
    }
  }
}

function inferResourceDisposer(value: object): void | Promise<void> {
  const candidate = value as {
    close?: () => void | Promise<void>;
    dispose?: () => void | Promise<void>;
    terminate?: () => void;
    cancel?: () => void | Promise<void>;
  };
  if (typeof candidate.close === 'function') return candidate.close();
  if (typeof candidate.dispose === 'function') return candidate.dispose();
  if (typeof candidate.terminate === 'function') return candidate.terminate();
  if (typeof candidate.cancel === 'function') return candidate.cancel();
  throw new TypeError('owned resource exposes no close/dispose/terminate/cancel method');
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  if (signal.reason !== undefined) throw signal.reason;
  throw new DOMException('Operation aborted', 'AbortError');
}

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

// ── Adapter conformance and repeatability helpers ─────────────────────────────────────────────────────────────────

export type OperationConformanceProof =
  | 'positive'
  | 'negative-tuple'
  | 'lifecycle'
  | 'normalized-result'
  | 'cancellation';

export interface AdapterConformanceEvidence {
  operations?: Partial<Record<Operation, readonly OperationConformanceProof[]>>;
}

/**
 * Shared gate used by generated adapters. The all-undeclared baseline needs no operation fixtures;
 * declaring an operation immediately requires the five operation-specific proofs.
 */
export function validateAdapterConformanceSurface(
  engine: MediaEngine,
  evidence: AdapterConformanceEvidence = {},
): void {
  validateAdapterIdentity(engine.id);
  const capabilities = validateCapabilitySet(engine);
  if (engine.configUsed !== undefined) captureConfigUsedSnapshot(engine.id, engine.configUsed, { requireProfile: true });
  const requiredProofs: readonly OperationConformanceProof[] = [
    'positive',
    'negative-tuple',
    'lifecycle',
    'normalized-result',
    'cancellation',
  ];
  for (const [operation, declared] of Object.entries(capabilities.operations) as Array<[Operation, boolean]>) {
    if (!declared) continue;
    const proofs = evidence.operations?.[operation] ?? [];
    for (const proof of requiredProofs) {
      if (!proofs.includes(proof)) {
        contractFail(
          engine.id,
          `conformance.operations.${operation}.${proof}`,
          'proof is required for every declared operation',
          'ADAPTER_CONFORMANCE_EVIDENCE_MISSING',
        );
      }
    }
  }
}

/** Factories must return distinct, repeatable instances with the same stable identity. */
export async function validateAdapterFactory(
  factory: EngineFactory,
  evidence: AdapterConformanceEvidence = {},
): Promise<[MediaEngine, MediaEngine]> {
  const first = await factory();
  const second = await factory();
  if (first === second) {
    throw new AdapterContractError(first.id, 'factory', 'must return a fresh instance', 'ADAPTER_FACTORY_REUSED_INSTANCE');
  }
  if (first.id !== second.id) {
    throw new AdapterContractError(first.id, 'factory.id', 'fresh instances must expose the same id', 'ADAPTER_ID_UNSTABLE');
  }
  validateAdapterConformanceSurface(first, evidence);
  validateAdapterConformanceSurface(second, evidence);
  return [first, second];
}

export interface RepeatableNormalizedObservation {
  metadata?: NormalizedMetadata;
  packets?: PacketInfo[];
  frames?: FrameDigest[];
  applicabilityReasonCode?: string;
  telemetry?: OperationFinalCounters;
  /** Encoded byte equality is not required when this is explicitly declared true in configUsed. */
  encodedBytesSha256?: string;
  encoderNondeterministic?: boolean;
}

export function assertRepeatableNormalizedObservations(
  engineId: string,
  first: RepeatableNormalizedObservation,
  second: RepeatableNormalizedObservation,
): void {
  const left = captureConfigUsedSnapshot(engineId, normalizeRepeatabilityObservation(first), {
    path: 'repeatability.first',
  });
  const right = captureConfigUsedSnapshot(engineId, normalizeRepeatabilityObservation(second), {
    path: 'repeatability.second',
  });
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    throw new AdapterContractError(
      engineId,
      'repeatability',
      'fresh instances produced different normalized observations or ordering',
      'ADAPTER_OBSERVATION_NOT_REPEATABLE',
    );
  }
}

function normalizeRepeatabilityObservation(
  value: RepeatableNormalizedObservation,
): Record<string, SerializableValue> {
  const nondeterministic = value.encoderNondeterministic === true;
  return {
    ...(value.metadata !== undefined
      ? { metadata: value.metadata as unknown as SerializableValue }
      : {}),
    ...(value.packets !== undefined ? { packets: value.packets as unknown as SerializableValue } : {}),
    ...(value.frames !== undefined ? { frames: value.frames as unknown as SerializableValue } : {}),
    ...(value.applicabilityReasonCode !== undefined
      ? { applicabilityReasonCode: value.applicabilityReasonCode }
      : {}),
    ...(value.telemetry !== undefined ? { telemetry: value.telemetry as unknown as SerializableValue } : {}),
    ...(!nondeterministic && value.encodedBytesSha256 !== undefined
      ? { encodedBytesSha256: value.encodedBytesSha256 }
      : {}),
    encoderNondeterministic: nondeterministic,
  };
}
