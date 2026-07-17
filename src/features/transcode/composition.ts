import {
  isBrowserNotSupportedError,
  isMalformedInputError,
  isNotApplicableError,
  type MediaBytes,
} from '../../core/engine.ts';
import { sha256Hex } from '../../core/seeded-rng.ts';
import { transcodeError, transcodeVerdict, type TranscodeDecision } from './types.ts';

export const TRANSCODE_COMPOSITION_SCHEMA = 'media-test/transcode-composition@1' as const;

export interface TranscodeRoundTripContract {
  readonly schema: typeof TRANSCODE_COMPOSITION_SCHEMA;
  readonly id: string;
  readonly sourceAssetId: string;
  readonly leg1ScenarioId: string;
  readonly leg2ScenarioId: string;
  readonly bindingRole: 'previous-output';
  readonly finalReferenceRole: 'original-source';
}

export interface BoundTranscodeInput {
  readonly schema: typeof TRANSCODE_COMPOSITION_SCHEMA;
  readonly producerScenarioId: string;
  readonly role: 'original-source' | 'previous-output';
  readonly sha256: string;
  readonly byteLength: number;
  readonly mime: string;
  readonly container: string;
  /** Every consumer gets a new owned view; no leg can mutate provenance bytes in place. */
  materialize(): Uint8Array;
}

export interface TranscodeLegExecution {
  readonly output: MediaBytes;
  /** Digest of the exact bytes materialized as the engine input at the adapter boundary. */
  readonly consumedInputSha256: string;
}

export type ExecuteTranscodeLeg = (
  scenarioId: string,
  input: BoundTranscodeInput,
) => Promise<TranscodeLegExecution>;

export interface TranscodeRoundTripEvidence {
  readonly schema: typeof TRANSCODE_COMPOSITION_SCHEMA;
  readonly contractId: string;
  readonly originalSourceSha256: string;
  readonly leg1ConsumedSha256: string;
  readonly leg1OutputSha256: string;
  readonly leg2ConsumedSha256: string;
  readonly finalOutputSha256: string;
  readonly finalReferenceSha256: string;
  readonly leg1Output: MediaBytes;
  readonly finalOutput: MediaBytes;
}

export type TranscodeRoundTripExecutionResult =
  | Readonly<{ state: 'OK'; value: TranscodeRoundTripEvidence }>
  | Readonly<{ state: 'BLOCKED'; decision: TranscodeDecision }>;

export function defineTranscodeRoundTripContract(
  value: Omit<TranscodeRoundTripContract, 'schema' | 'bindingRole' | 'finalReferenceRole'>,
): TranscodeRoundTripContract {
  for (const [name, id] of Object.entries(value)) {
    if (typeof id !== 'string' || !id.trim()) throw new TypeError(`round-trip ${name} is required`);
  }
  if (value.leg1ScenarioId === value.leg2ScenarioId) throw new TypeError('round-trip legs must use distinct scenarios');
  return Object.freeze({
    schema: TRANSCODE_COMPOSITION_SCHEMA,
    ...value,
    bindingRole: 'previous-output' as const,
    finalReferenceRole: 'original-source' as const,
  });
}

/** Execute A->B->A with an exact-byte output binding and an immutable original reference. */
export async function executeTranscodeRoundTrip(
  contract: TranscodeRoundTripContract,
  original: MediaBytes,
  execute: ExecuteTranscodeLeg,
): Promise<TranscodeRoundTripExecutionResult> {
  const originalBound = bindTranscodeInput(contract.sourceAssetId, 'original-source', original);
  let leg1: TranscodeLegExecution;
  try {
    leg1 = await execute(contract.leg1ScenarioId, originalBound);
  } catch (error) {
    if (isNotApplicableError(error) || isBrowserNotSupportedError(error)) throw error;
    if (isMalformedInputError(error)) {
      return blocked(transcodeVerdict(
        'FAIL',
        'TRANSCODE_ROUNDTRIP_SOURCE_REJECTED',
        `leg one rejected the admitted original source [${error.reasonCode}]: ${error.reason}`,
      ));
    }
    return blocked(transcodeError(
      'TRANSCODE_ROUNDTRIP_LEG1_ERROR',
      error instanceof Error ? error.message : String(error),
    ));
  }
  const leg1InputDecision = verifyConsumedBinding(originalBound, leg1.consumedInputSha256, contract.leg1ScenarioId);
  if (leg1InputDecision) return blocked(leg1InputDecision);
  const outputDecision = validateOutput(leg1.output, 'leg one');
  if (outputDecision) return blocked(outputDecision);

  const leg2Bound = bindTranscodeInput(contract.leg1ScenarioId, 'previous-output', leg1.output);
  let leg2: TranscodeLegExecution;
  try {
    leg2 = await execute(contract.leg2ScenarioId, leg2Bound);
  } catch (error) {
    if (isNotApplicableError(error) || isBrowserNotSupportedError(error)) throw error;
    if (isMalformedInputError(error)) {
      return blocked(transcodeVerdict(
        'FAIL',
        'TRANSCODE_ROUNDTRIP_LEG1_OUTPUT_MALFORMED',
        `leg two rejected leg one's admitted output [${error.reasonCode}]: ${error.reason}`,
      ));
    }
    return blocked(transcodeError(
      'TRANSCODE_ROUNDTRIP_LEG2_ERROR',
      error instanceof Error ? error.message : String(error),
    ));
  }
  const leg2InputDecision = verifyConsumedBinding(leg2Bound, leg2.consumedInputSha256, contract.leg2ScenarioId);
  if (leg2InputDecision) return blocked(leg2InputDecision);
  const finalDecision = validateOutput(leg2.output, 'leg two');
  if (finalDecision) return blocked(finalDecision);

  const finalOutputBytes = leg2.output.bytes.slice();
  const leg1OutputBytes = leg1.output.bytes.slice();
  return {
    state: 'OK',
    value: Object.freeze({
      schema: TRANSCODE_COMPOSITION_SCHEMA,
      contractId: contract.id,
      originalSourceSha256: originalBound.sha256,
      leg1ConsumedSha256: normalizeDigest(leg1.consumedInputSha256),
      leg1OutputSha256: leg2Bound.sha256,
      leg2ConsumedSha256: normalizeDigest(leg2.consumedInputSha256),
      finalOutputSha256: sha256Hex(finalOutputBytes),
      finalReferenceSha256: originalBound.sha256,
      leg1Output: Object.freeze({ ...leg1.output, bytes: leg1OutputBytes }),
      finalOutput: Object.freeze({ ...leg2.output, bytes: finalOutputBytes }),
    }),
  };
}

export function bindTranscodeInput(
  producerScenarioId: string,
  role: BoundTranscodeInput['role'],
  media: MediaBytes,
): BoundTranscodeInput {
  const invalid = validateOutput(media, role);
  if (invalid) throw new TypeError(`[${invalid.reasonCode}] ${invalid.detail}`);
  const owned = media.bytes.slice();
  const digest = sha256Hex(owned);
  return Object.freeze({
    schema: TRANSCODE_COMPOSITION_SCHEMA,
    producerScenarioId,
    role,
    sha256: digest,
    byteLength: owned.byteLength,
    mime: media.mime,
    container: media.container,
    materialize: () => owned.slice(),
  });
}

export function verifyConsumedBinding(
  binding: BoundTranscodeInput,
  consumedInputSha256: string,
  consumerScenarioId: string,
): TranscodeDecision | undefined {
  const observed = normalizeDigest(consumedInputSha256);
  if (!/^[0-9a-f]{64}$/.test(observed)) {
    return transcodeError(
      'TRANSCODE_ROUNDTRIP_CONSUMPTION_DIGEST_INVALID',
      `${consumerScenarioId} did not expose a valid adapter-boundary input digest`,
    );
  }
  if (observed !== binding.sha256) {
    return transcodeVerdict(
      'FAIL',
      'TRANSCODE_ROUNDTRIP_OUTPUT_BINDING_MISMATCH',
      `${consumerScenarioId} consumed ${observed}; exact ${binding.role} binding is ${binding.sha256}`,
    );
  }
  return undefined;
}

export function assessTranscodeRoundTripProvenance(
  contract: TranscodeRoundTripContract,
  evidence: TranscodeRoundTripEvidence,
): TranscodeDecision {
  if (evidence.contractId !== contract.id) {
    return transcodeError('TRANSCODE_ROUNDTRIP_CONTRACT_MISMATCH', 'round-trip evidence names a different contract');
  }
  const digests = [
    evidence.originalSourceSha256,
    evidence.leg1ConsumedSha256,
    evidence.leg1OutputSha256,
    evidence.leg2ConsumedSha256,
    evidence.finalOutputSha256,
    evidence.finalReferenceSha256,
  ];
  if (digests.some((digest) => !/^[0-9a-f]{64}$/.test(digest))) {
    return transcodeError('TRANSCODE_ROUNDTRIP_DIGEST_INVALID', 'round-trip evidence contains an invalid digest');
  }
  if (sha256Hex(evidence.leg1Output.bytes) !== evidence.leg1OutputSha256 ||
      sha256Hex(evidence.finalOutput.bytes) !== evidence.finalOutputSha256) {
    return transcodeVerdict(
      'FAIL',
      'TRANSCODE_ROUNDTRIP_EVIDENCE_BYTES_MUTATED',
      'retained leg bytes no longer match their execution-time provenance digests',
    );
  }
  if (evidence.leg1ConsumedSha256 !== evidence.originalSourceSha256 ||
      evidence.leg2ConsumedSha256 !== evidence.leg1OutputSha256) {
    return transcodeVerdict(
      'FAIL',
      'TRANSCODE_ROUNDTRIP_PROVENANCE_MISMATCH',
      'one or more legs did not consume its declared exact-byte binding',
    );
  }
  if (evidence.finalReferenceSha256 !== evidence.originalSourceSha256) {
    return transcodeVerdict(
      'FAIL',
      'TRANSCODE_ROUNDTRIP_REFERENCE_REBOUND',
      'final quality reference is not the immutable original source',
    );
  }
  return transcodeVerdict(
    'PASS',
    'TRANSCODE_ROUNDTRIP_COMPOSED',
    `leg two consumed leg one's exact output ${evidence.leg1OutputSha256}; final reference stayed original`,
    {
      sourceBytes: evidence.leg1Output.bytes.byteLength,
      finalBytes: evidence.finalOutput.bytes.byteLength,
    },
  );
}

function validateOutput(media: MediaBytes, label: string): TranscodeDecision | undefined {
  if (!(media.bytes instanceof Uint8Array) || media.bytes.byteLength === 0 ||
      typeof media.mime !== 'string' || !media.mime.trim() ||
      typeof media.container !== 'string' || !media.container.trim()) {
    return transcodeError(
      'TRANSCODE_ROUNDTRIP_OUTPUT_INVALID',
      `${label} must expose non-empty owned bytes, MIME, and container`,
    );
  }
  return undefined;
}

function blocked(decision: TranscodeDecision): TranscodeRoundTripExecutionResult {
  return { state: 'BLOCKED', decision };
}

function normalizeDigest(value: string): string {
  return value.trim().toLowerCase();
}
