/** Browser/Worker-safe versioned golden evidence reader and typed availability contract. */

import {
  canonicalJsonIdentityStreaming,
  canonicalJsonSha256,
  canonicalizeJson,
} from './canonical-json.ts';
import { sha256Hex } from './seeded-rng.ts';
import {
  COMPACT_GOLDEN_PACKETS_SCHEMA,
  validateCompactGoldenPacketPayload,
} from '../../fixtures/lib/lossless-json-columnar-validator.mjs';
import { validateGoldenProvenanceCrossFields } from '../../fixtures/lib/golden-provenance-validation.mjs';
import {
  COMPRESSED_GOLDEN_ARTIFACT_SCHEMA,
  decodeCompressedGoldenArtifact,
} from './compressed-golden-artifact.ts';

export const GOLDEN_ARTIFACT_SCHEMA = 'media-test/golden-artifact@1' as const;
export const GOLDEN_PROVENANCE_SCHEMA = 'media-test/golden-provenance@1' as const;
export const GOLDEN_SCHEMA_MAJOR = 1 as const;

export type GoldenArtifactKind = 'metadata' | 'packets' | 'frames' | 'ssim' | 'alpha' | 'keys' | 'segments' | 'availability';

export interface DigestSubject {
  sha256: string;
  sizeBytes: number;
}

export interface GoldenProvenance {
  schema: typeof GOLDEN_PROVENANCE_SCHEMA;
  schemaVersion: string;
  artifactKind: GoldenArtifactKind;
  assetId: string;
  sourceMedia: DigestSubject;
  buildDefinition: {
    recipe: string;
    normalizedArguments: unknown;
    normalizedArgumentsSha256: string;
    dependencies: Array<{ logicalId: string; sha256: string; sizeBytes: number }>;
  };
  runDetails: {
    baker: string;
    perimeter: Record<string, unknown>;
    startedAtIso: string;
    finishedAtIso: string;
    timeMode: string;
    browserQualified: boolean;
  };
  outputArtifact: DigestSubject & { digestScope: 'canonical-payload' };
}

export interface GoldenArtifactEnvelope<T = unknown> {
  schema: typeof GOLDEN_ARTIFACT_SCHEMA;
  schemaVersion: string;
  artifactKind: GoldenArtifactKind;
  assetId: string;
  sourceMedia: DigestSubject;
  availability: {
    state: 'ready' | 'absent-expected' | 'pending' | 'producer-failed';
    reasonCode?: string;
    detail?: string;
  };
  provenance: GoldenProvenance;
  payload: T;
  [legacyField: string]: unknown;
}

export type GoldenEvidenceState =
  | 'ready'
  | 'absent-expected'
  | 'pending'
  | 'digest-mismatch'
  | 'schema-invalid'
  | 'transport-error'
  | 'producer-failed';

export interface GoldenEvidenceReference {
  logicalPath: string;
  url: string;
  generationId?: string;
  expectedArtifactSha256?: string;
  expectedArtifactSizeBytes?: number;
  expectedSourceMediaSha256?: string;
}

interface EvidenceBase {
  state: GoldenEvidenceState;
  kind: GoldenArtifactKind;
  reasonCode: string;
  detail: string;
  reference: GoldenEvidenceReference;
  provenance?: GoldenProvenance;
}

export type GoldenEvidenceResult<T> =
  | (EvidenceBase & {
      state: 'ready';
      reasonCode: 'GOLDEN_READY';
      envelope: GoldenArtifactEnvelope<T>;
      value: T;
      bytes: Uint8Array;
      actualArtifactSha256: string;
    })
  | (EvidenceBase & {
      state: Exclude<GoldenEvidenceState, 'ready'>;
      expectedSha256?: string;
      actualSha256?: string;
      httpStatus?: number;
    });

export interface LoadGoldenEvidenceOptions<T> {
  kind: GoldenArtifactKind;
  reference: GoldenEvidenceReference;
  parsePayload?: (payload: unknown) => T | undefined;
  fetchImpl?: typeof fetch;
}

export interface GoldenEvidenceProvider {
  load<T>(
    kind: Exclude<GoldenArtifactKind, 'keys' | 'segments' | 'availability'>,
    parsePayload: (payload: unknown) => T | undefined,
  ): Promise<GoldenEvidenceResult<T> | undefined>;
}

export interface ReadGoldenEvidenceBytesOptions<T> {
  kind: GoldenArtifactKind;
  reference: GoldenEvidenceReference;
  bytes: Uint8Array;
  /** Supplied by an integrity cache when these exact bytes have already been hashed. */
  actualArtifactSha256?: string;
  parsePayload?: (payload: unknown) => T | undefined;
}

/** Strict reader: legacy/unversioned and unknown-major documents are never cast into evidence. */
export async function loadGoldenEvidenceV1<T = unknown>(
  options: LoadGoldenEvidenceOptions<T>,
): Promise<GoldenEvidenceResult<T>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = { kind: options.kind, reference: options.reference };
  let response: Response;
  try {
    response = await fetchImpl(options.reference.url, { cache: 'no-store' });
  } catch (error) {
    return unavailable(base, 'transport-error', 'GOLDEN_TRANSPORT_NETWORK', errorMessage(error));
  }
  if (response.status === 404) {
    return unavailable(base, 'absent-expected', 'GOLDEN_ABSENT_EXPECTED', 'indexed golden is absent (HTTP 404)', {
      httpStatus: 404,
    });
  }
  if (!response.ok) {
    return unavailable(base, 'transport-error', 'GOLDEN_TRANSPORT_HTTP', `golden fetch returned HTTP ${response.status}`, {
      httpStatus: response.status,
    });
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    return unavailable(base, 'transport-error', 'GOLDEN_TRANSPORT_BODY', errorMessage(error));
  }
  return readGoldenEvidenceBytesV1({
    kind: options.kind,
    reference: options.reference,
    bytes,
    ...(options.parsePayload ? { parsePayload: options.parsePayload } : {}),
  });
}

/**
 * Strictly validate already-materialized evidence. Callers that verified the active-generation
 * entry pass `actualArtifactSha256`, so repeated consumers do not re-hash the same artifact.
 */
export async function readGoldenEvidenceBytesV1<T = unknown>(
  options: ReadGoldenEvidenceBytesOptions<T>,
): Promise<GoldenEvidenceResult<T>> {
  const base = { kind: options.kind, reference: options.reference };
  const bytes = options.bytes;
  const actualArtifactSha256 = options.actualArtifactSha256 ?? sha256Hex(bytes);
  if (
    options.reference.expectedArtifactSizeBytes !== undefined &&
    options.reference.expectedArtifactSizeBytes !== bytes.byteLength
  ) {
    return unavailable(base, 'digest-mismatch', 'GOLDEN_SIZE_MISMATCH', 'golden byte size differs from the active generation', {
      expectedSha256: options.reference.expectedArtifactSha256,
      actualSha256: actualArtifactSha256,
    });
  }
  if (
    options.reference.expectedArtifactSha256 !== undefined &&
    normalizeHex(options.reference.expectedArtifactSha256) !== actualArtifactSha256
  ) {
    return unavailable(base, 'digest-mismatch', 'GOLDEN_DIGEST_MISMATCH', 'golden bytes differ from the active generation', {
      expectedSha256: options.reference.expectedArtifactSha256,
      actualSha256: actualArtifactSha256,
    });
  }

  let envelope: GoldenArtifactEnvelope;
  {
    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    } catch (error) {
      return unavailable(base, 'schema-invalid', 'GOLDEN_JSON_INVALID', errorMessage(error));
    }
    const validated = validateGoldenArtifactEnvelope(raw, options.kind);
    if (!validated.ok) {
      return unavailable(base, 'schema-invalid', validated.reasonCode, validated.issues.join('; '));
    }
    envelope = validated.envelope;
  }
  const withProvenance = { ...base, provenance: envelope.provenance };
  if (
    options.reference.expectedSourceMediaSha256 !== undefined &&
    normalizeHex(envelope.sourceMedia.sha256) !== normalizeHex(options.reference.expectedSourceMediaSha256)
  ) {
    return unavailable(withProvenance, 'digest-mismatch', 'GOLDEN_SOURCE_DIGEST_MISMATCH', 'golden was produced from different source media', {
      expectedSha256: options.reference.expectedSourceMediaSha256,
      actualSha256: envelope.sourceMedia.sha256,
    });
  }
  let authenticatedCompactIdentity: DigestSubject | undefined;
  const compressedPayload = options.kind === 'packets' && isRecord(envelope.payload) &&
    envelope.payload.schema === COMPRESSED_GOLDEN_ARTIFACT_SCHEMA;
  if (compressedPayload) {
    try {
      const decoded = await decodeCompressedGoldenArtifact(envelope.payload);
      authenticatedCompactIdentity = decoded.decodedIdentity;
      envelope = { ...envelope, payload: decoded.value };
    } catch (error) {
      const detail = errorMessage(error);
      const identityFailure = /decoded (?:digest|size) does not match|expanded beyond/.test(detail);
      return unavailable(
        withProvenance,
        identityFailure ? 'digest-mismatch' : 'schema-invalid',
        identityFailure
          ? 'GOLDEN_COMPRESSED_PAYLOAD_IDENTITY_MISMATCH'
          : 'GOLDEN_COMPRESSED_PAYLOAD_INVALID',
        detail,
      );
    }
  }
  const compactPayload = options.kind === 'packets' && isRecord(envelope.payload) &&
    envelope.payload.schema === COMPACT_GOLDEN_PACKETS_SCHEMA;
  if (compressedPayload && !compactPayload) {
    return unavailable(
      withProvenance,
      'schema-invalid',
      'GOLDEN_COMPRESSED_PAYLOAD_INVALID',
      'compressed packet transport did not decode to the canonical compact packet schema',
    );
  }
  if (compactPayload) {
    try {
      validateCompactGoldenPacketPayload(envelope.payload);
    } catch (error) {
      return unavailable(withProvenance, 'schema-invalid', 'GOLDEN_PAYLOAD_SCHEMA_INVALID', errorMessage(error));
    }
    if (envelope.provenance.outputArtifact.digestScope !== 'canonical-payload') {
      return unavailable(withProvenance, 'schema-invalid', 'GOLDEN_PROVENANCE_INVALID', 'compact payload digest scope is not canonical-payload');
    }
    let payloadIdentity = authenticatedCompactIdentity;
    if (!payloadIdentity) {
      try {
        payloadIdentity = canonicalJsonIdentityStreaming(envelope.payload);
      } catch (error) {
        return unavailable(withProvenance, 'schema-invalid', 'GOLDEN_PAYLOAD_SCHEMA_INVALID', errorMessage(error));
      }
    }
    if (payloadIdentity.sha256 !== normalizeHex(envelope.provenance.outputArtifact.sha256) ||
        payloadIdentity.sizeBytes !== envelope.provenance.outputArtifact.sizeBytes) {
      return unavailable(withProvenance, 'digest-mismatch', 'GOLDEN_PAYLOAD_DIGEST_MISMATCH',
        'streamed canonical compact payload identity does not match provenance', {
          expectedSha256: envelope.provenance.outputArtifact.sha256,
          actualSha256: payloadIdentity.sha256,
        });
    }
  } else {
    let canonicalPayloadBytes;
    try {
      canonicalPayloadBytes = new TextEncoder().encode(canonicalizeJson(envelope.payload));
    } catch (error) {
      return unavailable(withProvenance, 'schema-invalid', 'GOLDEN_PAYLOAD_SCHEMA_INVALID', errorMessage(error));
    }
    const payloadSha256 = sha256Hex(canonicalPayloadBytes);
    if (payloadSha256 !== normalizeHex(envelope.provenance.outputArtifact.sha256) ||
        canonicalPayloadBytes.byteLength !== envelope.provenance.outputArtifact.sizeBytes) {
      return unavailable(withProvenance, 'digest-mismatch', 'GOLDEN_PAYLOAD_DIGEST_MISMATCH', 'canonical payload digest does not match provenance', {
        expectedSha256: envelope.provenance.outputArtifact.sha256,
        actualSha256: payloadSha256,
      });
    }
  }
  if (envelope.availability.state === 'pending') {
    return unavailable(withProvenance, 'pending', envelope.availability.reasonCode ?? 'GOLDEN_PENDING', envelope.availability.detail ?? 'golden production is pending');
  }
  if (envelope.availability.state === 'absent-expected') {
    return unavailable(withProvenance, 'absent-expected', envelope.availability.reasonCode ?? 'GOLDEN_ABSENT_EXPECTED', envelope.availability.detail ?? 'golden is expected to be absent');
  }
  if (envelope.availability.state === 'producer-failed') {
    return unavailable(withProvenance, 'producer-failed', envelope.availability.reasonCode ?? 'GOLDEN_PRODUCER_FAILED', envelope.availability.detail ?? 'golden producer failed');
  }
  const value = options.parsePayload ? options.parsePayload(envelope.payload) : envelope.payload as T;
  if (value === undefined) {
    return unavailable(withProvenance, 'schema-invalid', 'GOLDEN_PAYLOAD_SCHEMA_INVALID', 'artifact payload failed its kind-specific schema');
  }
  return {
    ...withProvenance,
    state: 'ready',
    reasonCode: 'GOLDEN_READY',
    detail: 'versioned golden evidence validated',
    envelope: envelope as GoldenArtifactEnvelope<T>,
    value,
    bytes,
    actualArtifactSha256,
  };
}

/** Build a typed non-ready result from an active index record without fetching unchecked bytes. */
export function unavailableGoldenEvidence<T = unknown>(
  kind: GoldenArtifactKind,
  reference: GoldenEvidenceReference,
  state: Exclude<GoldenEvidenceState, 'ready'>,
  reasonCode: string,
  detail: string,
  extra: {
    expectedSha256?: string;
    actualSha256?: string;
    httpStatus?: number;
    provenance?: GoldenProvenance;
  } = {},
): GoldenEvidenceResult<T> {
  const { provenance, ...rest } = extra;
  return unavailable(
    { kind, reference, ...(provenance ? { provenance } : {}) },
    state,
    reasonCode,
    detail,
    rest,
  );
}

export type GoldenEvidenceExecutionRouting =
  | { execution: 'READY'; reasonCode: 'GOLDEN_READY' }
  | { execution: 'NA_ASSET'; reasonCode: string }
  | { execution: 'ERROR'; reasonCode: string };

/** Typed routing hook for runner integration; human-readable detail is intentionally ignored. */
export function routeGoldenEvidence(result: GoldenEvidenceResult<unknown>): GoldenEvidenceExecutionRouting {
  switch (result.state) {
    case 'ready':
      return { execution: 'READY', reasonCode: 'GOLDEN_READY' };
    case 'absent-expected':
    case 'pending':
    case 'digest-mismatch':
    case 'producer-failed':
      return { execution: 'NA_ASSET', reasonCode: result.reasonCode };
    case 'schema-invalid':
    case 'transport-error':
      return { execution: 'ERROR', reasonCode: result.reasonCode };
  }
}

export type GoldenEnvelopeValidation =
  | { ok: true; envelope: GoldenArtifactEnvelope }
  | { ok: false; reasonCode: string; issues: string[] };

export function validateGoldenArtifactEnvelope(value: unknown, expectedKind?: GoldenArtifactKind): GoldenEnvelopeValidation {
  if (!isRecord(value)) return invalid('GOLDEN_SCHEMA_OBJECT_REQUIRED', 'golden artifact must be an object');
  if (value.schema !== GOLDEN_ARTIFACT_SCHEMA) return invalid('GOLDEN_SCHEMA_ID_UNSUPPORTED', `schema must equal '${GOLDEN_ARTIFACT_SCHEMA}'`);
  const version = parseVersion(value.schemaVersion);
  if (!version || version.major !== GOLDEN_SCHEMA_MAJOR) return invalid('GOLDEN_SCHEMA_MAJOR_UNSUPPORTED', `unsupported schema version '${String(value.schemaVersion)}'`);
  if (!isKind(value.artifactKind)) return invalid('GOLDEN_SCHEMA_KIND_INVALID', 'artifactKind is invalid');
  if (expectedKind !== undefined && value.artifactKind !== expectedKind) return invalid('GOLDEN_SCHEMA_KIND_MISMATCH', `expected '${expectedKind}', got '${String(value.artifactKind)}'`);
  if (typeof value.assetId !== 'string' || !value.assetId) return invalid('GOLDEN_SCHEMA_ASSET_ID_REQUIRED', 'assetId is required');
  if (!isDigestSubject(value.sourceMedia)) return invalid('GOLDEN_SCHEMA_SOURCE_INVALID', 'sourceMedia digest+size is invalid');
  if (!isRecord(value.availability) || !isAvailability(value.availability.state)) return invalid('GOLDEN_SCHEMA_AVAILABILITY_INVALID', 'availability.state is invalid');
  if (!('payload' in value)) return invalid('GOLDEN_SCHEMA_PAYLOAD_REQUIRED', 'payload is required');
  const provenanceIssues = validateProvenance(value.provenance, value.artifactKind, value.assetId, value.sourceMedia);
  if (provenanceIssues.length) return { ok: false, reasonCode: 'GOLDEN_PROVENANCE_INVALID', issues: provenanceIssues };
  return { ok: true, envelope: value as unknown as GoldenArtifactEnvelope };
}

function validateProvenance(value: unknown, kind: GoldenArtifactKind, assetId: string, source: DigestSubject): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ['provenance must be an object'];
  if (value.schema !== GOLDEN_PROVENANCE_SCHEMA) issues.push('provenance schema is unsupported');
  const version = parseVersion(value.schemaVersion);
  if (!version || version.major !== GOLDEN_SCHEMA_MAJOR) issues.push('provenance schema major is unsupported');
  if (value.artifactKind !== kind) issues.push('provenance artifact kind mismatch');
  if (value.assetId !== assetId) issues.push('provenance asset id mismatch');
  if (!isDigestSubject(value.sourceMedia) || value.sourceMedia.sha256 !== source.sha256 || value.sourceMedia.sizeBytes !== source.sizeBytes) {
    issues.push('provenance source identity mismatch');
  }
  if (!isRecord(value.buildDefinition) || typeof value.buildDefinition.recipe !== 'string' || !value.buildDefinition.recipe || !isSha(value.buildDefinition.normalizedArgumentsSha256) || !Array.isArray(value.buildDefinition.dependencies)) {
    issues.push('provenance build definition is incomplete');
  }
  if (!isRecord(value.runDetails) || typeof value.runDetails.baker !== 'string' || !value.runDetails.baker || !isRecord(value.runDetails.perimeter) || !validIso(value.runDetails.startedAtIso) || !validIso(value.runDetails.finishedAtIso)) {
    issues.push('provenance run details are incomplete');
  }
  if (!isDigestSubject(value.outputArtifact)) issues.push('provenance output artifact is invalid');
  issues.push(...validateGoldenProvenanceCrossFields(value, { canonicalSha256: canonicalJsonSha256 }));
  return issues;
}

function unavailable<T>(
  base: { kind: GoldenArtifactKind; reference: GoldenEvidenceReference; provenance?: GoldenProvenance },
  state: Exclude<GoldenEvidenceState, 'ready'>,
  reasonCode: string,
  detail: string,
  extra: Partial<Extract<GoldenEvidenceResult<T>, { state: Exclude<GoldenEvidenceState, 'ready'> }>> = {},
): GoldenEvidenceResult<T> {
  return { ...base, state, reasonCode, detail, ...extra } as GoldenEvidenceResult<T>;
}

function invalid(reasonCode: string, ...issues: string[]): GoldenEnvelopeValidation {
  return { ok: false, reasonCode, issues };
}

function parseVersion(value: unknown): { major: number; minor: number; patch: number } | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  return match ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) } : undefined;
}

function isKind(value: unknown): value is GoldenArtifactKind {
  return value === 'metadata' || value === 'packets' || value === 'frames' || value === 'ssim' || value === 'alpha' || value === 'keys' || value === 'segments' || value === 'availability';
}

function isAvailability(value: unknown): boolean {
  return value === 'ready' || value === 'absent-expected' || value === 'pending' || value === 'producer-failed';
}

function isDigestSubject(value: unknown): value is DigestSubject {
  return isRecord(value) && isSha(value.sha256) && Number.isSafeInteger(value.sizeBytes) && (value.sizeBytes as number) >= 0;
}

function isSha(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function normalizeHex(value: string): string {
  return value.trim().toLowerCase();
}

function validIso(value: unknown): boolean {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
