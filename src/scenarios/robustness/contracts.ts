import type { OracleId, ResultStatus } from '../../core/scenario.ts';
import type {
  DemuxResult,
  FrameSink,
  MediaBytes,
  NormalizedMetadata,
  PacketInfo,
} from '../../core/engine.ts';
import { readOutputStructureResult } from '../../core/box-readers.ts';
import { readPcmStructure } from '../../features/audio-dsp/readers.ts';
import { inspectTrimAudioContainer } from '../../features/trim/audio.ts';

/**
 * The operation outcome is independent from the semantic oracle verdict.  In particular, an
 * ordinary adapter exception is not automatically a successful malformed-input rejection, and a
 * returned partial is not automatically valid.
 */
export type RobustnessOperationDisposition =
  | 'returned-validatable-output'
  | 'clean-reject'
  | 'not-applicable'
  | 'browser-unavailable'
  | 'timeout'
  | 'worker-crash'
  | 'resource-limit'
  | 'harness-error';

export type RobustnessInputClass = 'hard-valid' | 'negative' | 'boundary';

export type RobustnessSurvivorCheck =
  | 'probe-structure'
  | 'packet-structure'
  | 'frame-coverage'
  | 'media-structure'
  | 'seek-clamp';

export interface RobustnessExecutionContract {
  readonly schema: 'media-test/robustness-contract@1';
  readonly inputClass: RobustnessInputClass;
  /** A returned result must satisfy this check before an oracle may call it PASS or DIFF. */
  readonly returnedOutputCheck: RobustnessSurvivorCheck;
  /** Substantive oracles that remain decisive after the structural survivor check. */
  readonly survivorOracles: readonly OracleId[];
  readonly timeoutMs: number;
}

export interface RobustnessOperationEvidence {
  readonly schema: 'media-test/robustness-operation@1';
  readonly disposition: RobustnessOperationDisposition;
  readonly stage: 'preflight' | 'operation' | 'survivor-oracle' | 'cleanup';
  readonly nativeError?: Readonly<{
    name: string;
    code?: string;
  }>;
  readonly resource?: Readonly<{
    kind: 'wall-time' | 'memory' | 'worker-stall';
    observed?: number;
    limit?: number;
    unit?: 'ms' | 'bytes';
  }>;
}

export interface RobustnessDispositionDecision {
  readonly status?: ResultStatus;
  readonly needsSurvivorOracle: boolean;
  readonly reasonCode:
    | 'ROBUSTNESS_OUTPUT_REQUIRES_SURVIVOR'
    | 'ROBUSTNESS_NEGATIVE_CLEAN_REJECT'
    | 'ROBUSTNESS_BOUNDARY_CLEAN_REJECT'
    | 'ROBUSTNESS_VALID_INPUT_REJECTED'
    | 'ROBUSTNESS_NOT_APPLICABLE'
    | 'ROBUSTNESS_BROWSER_UNAVAILABLE'
    | 'ROBUSTNESS_TIMEOUT'
    | 'ROBUSTNESS_WORKER_CRASH'
    | 'ROBUSTNESS_RESOURCE_LIMIT'
    | 'ROBUSTNESS_HARNESS_ERROR';
}

export interface RobustnessReturnedValue {
  readonly output?: MediaBytes;
  readonly metadata?: NormalizedMetadata;
  readonly demux?: DemuxResult;
  readonly frames?: FrameSink;
  readonly seek?: Readonly<{ landedPtsUs: number }>;
}

export type RobustnessSurvivorDecision =
  | Readonly<{ state: 'PASS'; reasonCode: string; detail: string }>
  | Readonly<{ state: 'FAIL'; reasonCode: string; detail: string }>
  | Readonly<{ state: 'ERROR'; reasonCode: string; detail: string }>;

export function defineRobustnessContract(
  inputClass: RobustnessInputClass,
  returnedOutputCheck: RobustnessSurvivorCheck,
  survivorOracles: readonly OracleId[],
  timeoutMs: number,
): RobustnessExecutionContract {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('robustness timeoutMs must be a positive safe integer');
  }
  if (survivorOracles.length === 0) {
    throw new TypeError('robustness contract requires at least one survivor oracle');
  }
  return Object.freeze({
    schema: 'media-test/robustness-contract@1',
    inputClass,
    returnedOutputCheck,
    survivorOracles: Object.freeze([...survivorOracles]),
    timeoutMs,
  });
}

/** Pure policy used by the runner integration and acceptance tests. */
export function decideRobustnessDisposition(
  contract: RobustnessExecutionContract,
  evidence: RobustnessOperationEvidence,
): RobustnessDispositionDecision {
  switch (evidence.disposition) {
    case 'returned-validatable-output':
      return {
        needsSurvivorOracle: true,
        reasonCode: 'ROBUSTNESS_OUTPUT_REQUIRES_SURVIVOR',
      };
    case 'clean-reject':
      if (contract.inputClass === 'negative') {
        return {
          status: 'PASS',
          needsSurvivorOracle: false,
          reasonCode: 'ROBUSTNESS_NEGATIVE_CLEAN_REJECT',
        };
      }
      if (contract.inputClass === 'boundary') {
        return {
          status: 'PASS',
          needsSurvivorOracle: false,
          reasonCode: 'ROBUSTNESS_BOUNDARY_CLEAN_REJECT',
        };
      }
      return {
        status: 'FAIL',
        needsSurvivorOracle: false,
        reasonCode: 'ROBUSTNESS_VALID_INPUT_REJECTED',
      };
    case 'not-applicable':
      return {
        status: 'NA_ENGINE',
        needsSurvivorOracle: false,
        reasonCode: 'ROBUSTNESS_NOT_APPLICABLE',
      };
    case 'browser-unavailable':
      return {
        status: 'NA_BROWSER',
        needsSurvivorOracle: false,
        reasonCode: 'ROBUSTNESS_BROWSER_UNAVAILABLE',
      };
    case 'timeout':
      return {
        status: 'FAIL',
        needsSurvivorOracle: false,
        reasonCode: 'ROBUSTNESS_TIMEOUT',
      };
    case 'worker-crash':
      return {
        status: 'FAIL',
        needsSurvivorOracle: false,
        reasonCode: 'ROBUSTNESS_WORKER_CRASH',
      };
    case 'resource-limit':
      return {
        status: 'FAIL',
        needsSurvivorOracle: false,
        reasonCode: 'ROBUSTNESS_RESOURCE_LIMIT',
      };
    case 'harness-error':
      return {
        status: 'ERROR',
        needsSurvivorOracle: false,
        reasonCode: 'ROBUSTNESS_HARNESS_ERROR',
      };
  }
}

/**
 * Structural survivor gate for negative/boundary rows that returned something. Adapter-result
 * schema validation runs before this function; this gate establishes that there is non-empty,
 * independently inspectable evidence rather than treating any object as a successful partial.
 */
export function validateRobustnessReturnedValue(
  contract: RobustnessExecutionContract,
  value: RobustnessReturnedValue,
  options: Readonly<{
    seekPolicy?: string;
    goldenPackets?: readonly PacketInfo[];
    goldenMetadata?: NormalizedMetadata;
    seekToleranceUs?: number;
  }> = {},
): RobustnessSurvivorDecision {
  switch (contract.returnedOutputCheck) {
    case 'probe-structure': {
      const metadata = value.metadata;
      if (!metadata) {
        return {
          state: 'FAIL',
          reasonCode: 'ROBUSTNESS_PROBE_OUTPUT_MISSING',
          detail: 'probe returned without normalized metadata',
        };
      }
      const hasObservation =
        metadata.tracks.length > 0 ||
        (metadata.durationSec !== null && Number.isFinite(metadata.durationSec));
      return hasObservation
        ? {
            state: 'PASS',
            reasonCode: 'ROBUSTNESS_PROBE_OUTPUT_STRUCTURAL',
            detail: `normalized probe evidence is inspectable (${metadata.tracks.length} track(s))`,
          }
        : {
            state: 'FAIL',
            reasonCode: 'ROBUSTNESS_PROBE_OUTPUT_EMPTY',
            detail: 'probe returned an empty/indeterminate metadata shell',
          };
    }
    case 'packet-structure': {
      const packets = value.demux?.packets ?? [];
      return packets.length > 0
        ? {
            state: 'PASS',
            reasonCode: 'ROBUSTNESS_PACKET_PARTIAL_STRUCTURAL',
            detail: `demux returned ${packets.length} validated packet(s)`,
          }
        : {
            state: 'FAIL',
            reasonCode: 'ROBUSTNESS_PACKET_PARTIAL_EMPTY',
            detail: 'demux returned no structurally valid packet survivor',
          };
    }
    case 'frame-coverage': {
      const frames = value.frames?.frames ?? [];
      return frames.length > 0
        ? {
            state: 'PASS',
            reasonCode: 'ROBUSTNESS_FRAME_PARTIAL_STRUCTURAL',
            detail: `decode returned ${frames.length} validated frame(s)`,
          }
        : {
            state: 'FAIL',
            reasonCode: 'ROBUSTNESS_FRAME_PARTIAL_EMPTY',
            detail: 'decode returned no structurally valid frame survivor',
          };
    }
    case 'media-structure': {
      const output = value.output;
      if (!output || output.bytes.byteLength === 0) {
        return {
          state: 'FAIL',
          reasonCode: 'ROBUSTNESS_MEDIA_PARTIAL_EMPTY',
          detail: 'byte-producing operation returned no bytes',
        };
      }
      const read = readOutputStructureResult(output.bytes, output.container);
      if (read.state === 'OK') {
        return {
          state: 'PASS',
          reasonCode: 'ROBUSTNESS_MEDIA_PARTIAL_STRUCTURAL',
          detail: `neutral reader accepted ${output.container} structure`,
        };
      }
      if (read.state === 'UNSUPPORTED_FORMAT') {
        const pcm = readPcmStructure(output.bytes, output.container);
        if (pcm.state === 'OK') {
          return {
            state: 'PASS',
            reasonCode: 'ROBUSTNESS_MEDIA_PARTIAL_STRUCTURAL',
            detail: `neutral PCM reader accepted ${output.container} structure`,
          };
        }
        if (pcm.state === 'MALFORMED' || pcm.state === 'INCOMPLETE') {
          return {
            state: 'FAIL',
            reasonCode: pcm.reasonCode,
            detail: `returned ${output.container} bytes are ${pcm.state.toLowerCase()}`,
          };
        }
        if (pcm.state === 'UNSUPPORTED_FORMAT') {
          const audio = inspectTrimAudioContainer(output.bytes, output.container);
          if (audio.state === 'OK') {
            return {
              state: 'PASS',
              reasonCode: 'ROBUSTNESS_MEDIA_PARTIAL_STRUCTURAL',
              detail: `neutral audio reader accepted ${output.container} structure`,
            };
          }
          if (audio.state === 'MALFORMED' || audio.state === 'INCOMPLETE') {
            return {
              state: 'FAIL',
              reasonCode: audio.reasonCode,
              detail: `returned ${output.container} bytes are ${audio.state.toLowerCase()}`,
            };
          }
        }
      }
      if (read.state === 'MALFORMED' || read.state === 'INCOMPLETE') {
        return {
          state: 'FAIL',
          reasonCode: read.reasonCode,
          detail: `returned ${output.container} bytes are ${read.state.toLowerCase()}`,
        };
      }
      return {
        state: 'ERROR',
        reasonCode: read.reasonCode,
        detail: `no neutral structural survivor exists for ${output.container}`,
      };
    }
    case 'seek-clamp': {
      const landedPtsUs = value.seek?.landedPtsUs;
      if (landedPtsUs === undefined || !Number.isFinite(landedPtsUs)) {
        return {
          state: 'FAIL',
          reasonCode: 'ROBUSTNESS_SEEK_LANDING_MISSING',
          detail: 'seek returned without a finite landing timestamp',
        };
      }
      const tracks = options.goldenMetadata?.tracks ?? [];
      const preferredTrackIndex = tracks.findIndex((track) => track.type === 'video');
      const fallbackTrackIndex = tracks.findIndex((track) => track.type === 'audio');
      const targetTrackIndex = preferredTrackIndex >= 0
        ? preferredTrackIndex
        : fallbackTrackIndex >= 0
          ? fallbackTrackIndex
          : undefined;
      const points = (options.goldenPackets ?? [])
        .filter((packet) => targetTrackIndex === undefined || packet.trackIndex === targetTrackIndex)
        .map((packet) => packet.ptsUs)
        .filter(Number.isFinite);
      if (points.length === 0) {
        return {
          state: 'ERROR',
          reasonCode: 'ROBUSTNESS_SEEK_REFERENCE_UNAVAILABLE',
          detail: 'seek clamp cannot be checked without committed packet timing',
        };
      }
      const expected = options.seekPolicy === 'first-frame-or-clean-reject'
        ? Math.min(...points)
        : options.seekPolicy === 'last-frame-or-clean-reject'
          ? Math.max(...points)
          : undefined;
      if (expected === undefined) {
        return {
          state: 'ERROR',
          reasonCode: 'ROBUSTNESS_SEEK_POLICY_INVALID',
          detail: `unknown seek survivor policy '${options.seekPolicy ?? ''}'`,
        };
      }
      const toleranceUs = options.seekToleranceUs ?? 1_000;
      const deltaUs = Math.abs(landedPtsUs - expected);
      return deltaUs <= toleranceUs
        ? {
            state: 'PASS',
            reasonCode: 'ROBUSTNESS_SEEK_CLAMP_VALID',
            detail: `seek landed ${deltaUs}us from the allowed boundary`,
          }
        : {
            state: 'FAIL',
            reasonCode: 'ROBUSTNESS_SEEK_CLAMP_INVALID',
            detail: `seek landed ${landedPtsUs}us, expected ${expected}us +/- ${toleranceUs}us`,
          };
    }
  }
}

export function robustnessContractFromOptions(
  options: unknown,
): RobustnessExecutionContract | undefined {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return undefined;
  const value = (options as Record<string, unknown>).robustness;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (record.schema !== 'media-test/robustness-contract@1') return undefined;
  if (!['hard-valid', 'negative', 'boundary'].includes(String(record.inputClass))) return undefined;
  if (![
    'probe-structure',
    'packet-structure',
    'frame-coverage',
    'media-structure',
    'seek-clamp',
  ].includes(String(record.returnedOutputCheck))) return undefined;
  if (!Array.isArray(record.survivorOracles) || record.survivorOracles.length === 0) return undefined;
  if (!record.survivorOracles.every((entry) => typeof entry === 'string' && entry.length > 0)) return undefined;
  if (!Number.isSafeInteger(record.timeoutMs) || Number(record.timeoutMs) <= 0) return undefined;
  return value as RobustnessExecutionContract;
}
