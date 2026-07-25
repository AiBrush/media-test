import type { OracleOutcome } from '../../core/scenario.ts';

export const AUDIO_STRUCTURE_SCHEMA = 'media-test/audio-structure@1' as const;
export const AUDIO_SIGNAL_SCHEMA = 'media-test/audio-signal@1' as const;

export type PcmContainer = 'wav' | 'aiff' | 'aifc' | 'caf';
export type PcmEndianness = 'little' | 'big';
export type PcmSampleKind = 'signed-integer' | 'unsigned-integer' | 'float';
export type AudioEvidenceSource = 'container-pcm-reader' | 'webcodecs-audio-decoder';

export type AudioReaderState =
  | 'OK'
  | 'UNSUPPORTED_FORMAT'
  | 'UNSUPPORTED_STRUCTURE'
  | 'MALFORMED'
  | 'INCOMPLETE';

export interface AudioReaderEvidence {
  reader: 'audio-structure' | 'audio-signal';
  byteLength: number;
  detectedFormat?: PcmContainer;
  markers: string[];
}

export type AudioReaderResult<T> =
  | { state: 'OK'; value: T; evidence: AudioReaderEvidence }
  | {
      state: Exclude<AudioReaderState, 'OK'>;
      reasonCode: string;
      detail: string;
      evidence: AudioReaderEvidence;
    };

export interface PcmDataSpan {
  offset: number;
  byteLength: number;
}

/** Stable, JSON-safe native-rate evidence. Sample payloads live only on DecodedPcmEvidence. */
export interface PcmStructureEvidence {
  schema: typeof AUDIO_STRUCTURE_SCHEMA;
  source: 'container-pcm-reader';
  container: PcmContainer;
  codec: string;
  sampleKind: PcmSampleKind;
  endianness: PcmEndianness;
  storageBitsPerSample: number;
  validBitsPerSample: number;
  sampleRate: number;
  channels: number;
  sampleFrames: number;
  durationSec: number;
  blockAlign: number;
  channelLayout: string[];
  channelLayoutSource: 'explicit-mask' | 'container-tag' | 'inferred-count' | 'unknown';
  channelMask?: number;
  channelLayoutTag?: number;
  dataSpans: PcmDataSpan[];
}

export interface DecodedPcmEvidence extends PcmStructureEvidence {
  signalSchema: typeof AUDIO_SIGNAL_SCHEMA;
  evidenceSource: AudioEvidenceSource;
  /** Number of complete sample frames represented in `samples`. */
  decodedSampleFrames: number;
  /** Interleaved, normalized f64 samples in [-1,1] (float inputs are not silently clipped). */
  samples: Float64Array;
  truncated: boolean;
}

export type AudioDspOracleOutcome = OracleOutcome & { oracle: 'property-invariant' };

export interface StructuralAudioExpectation {
  container: PcmContainer;
  codec: string;
  sampleRate?: number;
  channels?: number;
  channelLayout?: string[];
  durationFrameTolerance?: number;
}

export interface ResampleContract extends StructuralAudioExpectation {
  kind: 'resample';
  probeFrequenciesHz: number[];
  /** Long-form broadband sources may have no material energy at any authored narrow-frequency probe. */
  minimumSpectralBins?: number;
  maxSpectralDeltaDb: number;
  maxRmsDeltaDb: number;
}

export interface ChannelMatrixContract extends StructuralAudioExpectation {
  kind: 'channel-matrix';
  inputLayout: string[];
  outputLayout: string[];
  /** output channel rows × input channel columns. */
  matrix: number[][];
  maxAbsoluteError: number;
  clip: boolean;
}

export interface GainContract extends StructuralAudioExpectation {
  kind: 'gain';
  linearGain: number;
  maxGainDeltaDb: number;
  maxAbsoluteError: number;
}

export interface FadeContract extends StructuralAudioExpectation {
  kind: 'fade';
  curve: 'linear';
  fadeInSec: number;
  fadeOutSec: number;
  maxEnvelopeError: number;
}

export interface SampleFormatContract extends StructuralAudioExpectation {
  kind: 'sample-format';
  policy: {
    dither: 'none' | 'allowed';
    rounding: 'identity' | 'nearest-even' | 'truncate-toward-negative-infinity';
    clipping: 'saturate';
  };
  maxErrorLsb: number;
}

export interface IdentityContract extends StructuralAudioExpectation {
  kind: 'identity';
  maxAbsoluteError: number;
}

export type AudioTransformContract =
  | ResampleContract
  | ChannelMatrixContract
  | GainContract
  | FadeContract
  | SampleFormatContract
  | IdentityContract;

export interface AudioSampleFrameNumerator {
  unit: 'sample-frames';
  sampleFrames: number;
  scalarSamples: number;
  channels: number;
  nativeSampleRate: number;
  source: AudioEvidenceSource;
}

export interface AudioThroughputEvidence extends AudioSampleFrameNumerator {
  metric: 'sampleFramesPerSec';
  /** Measured iteration count; mirrors BenchSummary.n. */
  n: number;
  iterations: number;
  wallMs: number;
  sampleFramesPerSec: number;
  scalarSamplesPerSec: number;
}

export interface GaplessTrackEvidence {
  nativeSampleRate: number;
  codedSampleFrames: number;
  primingFrames: number;
  remainderFrames: number;
  /** Presentation duration after edit-list/timebase mapping. */
  presentationSampleFrames: number;
  editListMediaStartFrame: number;
  /** Frames emitted by the native decoder before applying the container presentation window. */
  rawDecodedSampleFrames: number;
  decodedSampleFrames: number;
  decodedSampleRate: number;
  discardedPrimingFrames: number;
  discardedRemainderFrames: number;
  timingSource: 'edit-list' | 'media-timeline';
}

export interface GaplessNativeEvidence {
  reference: GaplessTrackEvidence;
  candidate: GaplessTrackEvidence;
  /** Count deltas relative to the source presentation, retained by boundary for diagnostics. */
  leadingExtraFrames: number;
  trailingExtraFrames: number;
  evidenceSource: 'container-timing+webcodecs';
}

export type GaplessNativeEvidenceResult =
  | { state: 'OK'; value: GaplessNativeEvidence }
  | { state: 'INVALID'; reasonCode: string; detail: string }
  | {
      state: 'UNAVAILABLE';
      applicability: 'NA_BROWSER' | 'NA_ASSET' | 'ERROR';
      reasonCode: string;
      detail: string;
    };

export interface EndiannessRoundTripEvidence {
  source: Uint8Array;
  intermediate: Uint8Array;
  output: Uint8Array;
}

export interface AudioFixtureManifestRecord {
  id: string;
  sha256?: string | null;
  sizeBytes?: number | null;
  source?: string;
  family?: string;
  container?: string;
  codecs?: string[];
}

export interface AudioScenarioSummary {
  scenarioId: string;
  operation: string;
  assets: Array<{
    id: string;
    declared: boolean;
    available: boolean;
    sha256?: string;
    sizeBytes?: number;
    container?: string;
    codecs?: string[];
  }>;
  requestedTransform: string;
  activeOracles: string[];
  missingEvidence: string[];
  text: string;
}
