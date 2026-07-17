import type { OracleOutcome } from '../../core/scenario.ts';

export type RemuxReaderState =
  | 'OK'
  | 'UNSUPPORTED_FORMAT'
  | 'UNSUPPORTED_STRUCTURE'
  | 'MALFORMED'
  | 'INCOMPLETE';

export type RemuxTrackType = 'video' | 'audio' | 'subtitle' | 'other';

export type RemuxFraming =
  | 'annexb'
  | 'length-prefixed'
  | 'adts'
  | 'raw'
  | 'ogg-packet'
  | 'mpeg-audio-frame'
  | 'flac-frame'
  | 'unknown';

export interface RemuxSampleEvidence {
  /** Complete coded sample bytes; views may reference the reader input and must be treated readonly. */
  readonly payload: Uint8Array;
  readonly ptsUs?: number;
  readonly dtsUs?: number;
  readonly durationUs?: number;
  readonly keyframe?: boolean;
  readonly fileOffset?: number;
  readonly framing: RemuxFraming;
}

export interface RemuxTrackEvidence {
  /** Reader-local identity. It is representation evidence, never a cross-container matching key. */
  readonly id: string;
  readonly type: RemuxTrackType;
  readonly codec: string;
  readonly language?: string;
  readonly role?: string;
  readonly disposition?: string;
  readonly sampleRate?: number;
  readonly channels?: number;
  readonly width?: number;
  readonly height?: number;
  readonly timescale?: number;
  readonly codecPrivate?: Uint8Array;
  readonly samples: readonly RemuxSampleEvidence[];
}

export interface RemuxProgramEvidence {
  readonly schema: 'media-test/remux-program@1';
  readonly container: string;
  readonly byteLength: number;
  readonly durationUs?: number;
  readonly tracks: readonly RemuxTrackEvidence[];
  readonly representation: Readonly<{
    fragmented?: boolean;
    lacing?: boolean;
    unknownSizeSegment?: boolean;
    programCount?: number;
  }>;
}

export interface RemuxReaderEvidence {
  readonly reader: string;
  readonly byteLength: number;
  readonly containerHint?: string;
  readonly detectedContainer?: string;
  readonly parsedTracks?: number;
  readonly parsedSamples?: number;
  readonly markers?: readonly string[];
}

export type RemuxReadResult =
  | Readonly<{ state: 'OK'; value: RemuxProgramEvidence; evidence: RemuxReaderEvidence }>
  | Readonly<{
      state: Exclude<RemuxReaderState, 'OK'>;
      reasonCode: string;
      evidence: RemuxReaderEvidence;
    }>;

export interface StrictRemuxTolerance {
  /** Per-sample timebase conversion/rounding allowance. */
  readonly timestampUs: number;
  /** Complete presentation-span allowance (edit-list/priming policy belongs above this comparator). */
  readonly durationUs: number;
}

export interface StrictRemuxOptions {
  readonly tolerance?: Partial<StrictRemuxTolerance>;
  /** Optional expected target; a wrong returned container is a correctness failure. */
  readonly expectedTargetContainer?: string;
  /**
   * When true, legal wrapper/framing/tick/keyflag differences produce DIFF. When false, they remain
   * diagnostics on PASS. The default is true because the three-way benchmark surfaces them.
   */
  readonly surfaceRepresentationDifferences?: boolean;
}

export interface StrictRemuxComparison {
  readonly outcome: OracleOutcome;
  readonly matchedTracks: ReadonlyArray<Readonly<{ sourceId: string; outputId: string }>>;
  readonly representationDifferences: readonly string[];
}

export type PartialRemuxDisposition =
  | 'rejected'
  | 'valid-partial'
  | 'invalid-output'
  | 'timeout';

export type TerminalSampleProbe =
  | Readonly<{
      state: 'PASS';
      decodedThroughPtsUs?: number;
      validatedTrackIds?: readonly string[];
      detail?: string;
    }>
  | Readonly<{ state: 'FAIL'; reasonCode: string; detail: string }>
  | Readonly<{ state: 'UNAVAILABLE'; reasonCode: string; detail: string }>
  | Readonly<{ state: 'ERROR'; reasonCode: string; detail: string }>;

export interface PartialRemuxAssessment {
  readonly disposition: PartialRemuxDisposition;
  readonly outcome: OracleOutcome;
  readonly program?: RemuxProgramEvidence;
}
