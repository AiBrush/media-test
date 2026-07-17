/** Complete, versioned transfer-cost evidence for build-time bundle measurements. */

import { canonicalContentHash } from '../../core/reporting/canonical.ts';
import { available, unavailable, type PerformanceEvidence } from './contracts.ts';

export const PERFORMANCE_BUNDLE_SCHEMA = 'media-test/performance-bundle-components@1' as const;

export type BundleComponentKind =
  | 'javascript-minified-gzip'
  | 'runtime-wasm'
  | 'worker'
  | 'codec-core';

export const REQUIRED_BUNDLE_COMPONENTS: readonly BundleComponentKind[] = Object.freeze([
  'javascript-minified-gzip',
  'runtime-wasm',
  'worker',
  'codec-core',
]);

export interface BundleTransferComponent {
  kind: BundleComponentKind;
  transferBytes: number;
  files: Array<{ path: string; sha256: string; transferBytes: number }>;
  compression: { algorithm: string; options: Record<string, string | number | boolean | null> };
}

export interface MeasuredBundleComponents {
  state: 'MEASURED';
  engineId: string;
  engineVersion: string;
  sourceContentHash: string;
  toolchainContentHash: string;
  components: BundleTransferComponent[];
  transferTotalBytes: number;
}

export interface UnavailableBundleComponents {
  state: 'UNAVAILABLE';
  engineId: string;
  engineVersion: string;
  sourceContentHash: string;
  toolchainContentHash: string;
  reasonCode: string;
  reason: string;
}

export type BundleComponentsRecord = MeasuredBundleComponents | UnavailableBundleComponents;

export interface BundleComponentsArtifact {
  schema: typeof PERFORMANCE_BUNDLE_SCHEMA;
  artifactId: string;
  contentHash: string;
  records: BundleComponentsRecord[];
}

export interface BundleComponentsExpectation {
  engineId: string;
  engineVersion: string;
  sourceContentHash: string;
  toolchainContentHash: string;
}

export interface JoinedBundleComponents {
  artifactHash: string;
  engineId: string;
  engineVersion: string;
  components: BundleTransferComponent[];
  transferTotalBytes: number;
  joinedBeforeReport: true;
}

export function createBundleComponentsArtifact(input: {
  artifactId: string;
  records: BundleComponentsRecord[];
}): BundleComponentsArtifact {
  const artifactId = requireText(input.artifactId, 'artifactId');
  const records = input.records.map(validateRecord).sort(compareRecords);
  const identities = new Set<string>();
  for (const record of records) {
    const identity = `${record.engineId}\u0000${record.engineVersion}`;
    if (identities.has(identity)) throw new TypeError(`[BUNDLE_COMPONENT_DUPLICATE] ${identity}`);
    identities.add(identity);
  }
  const base = { schema: PERFORMANCE_BUNDLE_SCHEMA, artifactId, records };
  return { ...base, contentHash: canonicalContentHash(base) };
}

export function joinBundleComponents(
  artifact: BundleComponentsArtifact,
  expectation: BundleComponentsExpectation,
): PerformanceEvidence<JoinedBundleComponents> {
  const normalized = createBundleComponentsArtifact({
    artifactId: artifact.artifactId,
    records: artifact.records,
  });
  if (artifact.schema !== PERFORMANCE_BUNDLE_SCHEMA || artifact.contentHash !== normalized.contentHash) {
    return unavailable('ERROR', 'BUNDLE_COMPONENT_ARTIFACT_INVALID', 'bundle component artifact schema or content hash is invalid');
  }
  const records = normalized.records.filter((record) =>
    record.engineId === expectation.engineId && record.engineVersion === expectation.engineVersion);
  if (records.length === 0) {
    return unavailable('NA_ASSET', 'BUNDLE_COMPONENT_MAP_MISSING', `no component map exists for ${expectation.engineId}@${expectation.engineVersion}`);
  }
  if (records.length !== 1) {
    return unavailable('ERROR', 'BUNDLE_COMPONENT_MAP_AMBIGUOUS', 'more than one exact component record matched');
  }
  const record = records[0]!;
  if (record.sourceContentHash !== expectation.sourceContentHash) {
    return unavailable('NA_ASSET', 'BUNDLE_COMPONENT_SOURCE_STALE', 'component map source hash does not match the current adapter entry');
  }
  if (record.toolchainContentHash !== expectation.toolchainContentHash) {
    return unavailable('NA_ASSET', 'BUNDLE_COMPONENT_TOOLCHAIN_STALE', 'component map toolchain hash does not match this report cohort');
  }
  if (record.state === 'UNAVAILABLE') {
    return unavailable('NA_ASSET', record.reasonCode, record.reason);
  }
  return available({
    artifactHash: normalized.contentHash,
    engineId: record.engineId,
    engineVersion: record.engineVersion,
    components: record.components.map(cloneComponent),
    transferTotalBytes: record.transferTotalBytes,
    joinedBeforeReport: true,
  });
}

/** The exact build input consumed by both live and offline report constructors. */
export interface PrejoinedBundleMetricInput {
  state: 'AVAILABLE';
  metric: 'bundleSize';
  unit: 'byte';
  value: number;
  components: BundleTransferComponent[];
  artifactHash: string;
  joinedBeforeReport: true;
}

export function bundleMetricInput(
  evidence: PerformanceEvidence<JoinedBundleComponents>,
): PerformanceEvidence<PrejoinedBundleMetricInput> {
  if (evidence.state === 'UNAVAILABLE') return evidence;
  return available({
    state: 'AVAILABLE',
    metric: 'bundleSize',
    unit: 'byte',
    value: evidence.value.transferTotalBytes,
    components: evidence.value.components.map(cloneComponent),
    artifactHash: evidence.value.artifactHash,
    joinedBeforeReport: true,
  });
}

function validateRecord(record: BundleComponentsRecord): BundleComponentsRecord {
  const base = {
    engineId: requireText(record.engineId, 'engineId'),
    engineVersion: requireText(record.engineVersion, 'engineVersion'),
    sourceContentHash: requireDigest(record.sourceContentHash, 'sourceContentHash'),
    toolchainContentHash: requireDigest(record.toolchainContentHash, 'toolchainContentHash'),
  };
  if (record.state === 'UNAVAILABLE') {
    return {
      state: 'UNAVAILABLE',
      ...base,
      reasonCode: requireText(record.reasonCode, 'reasonCode'),
      reason: requireText(record.reason, 'reason'),
    };
  }
  if (record.state !== 'MEASURED') throw new TypeError('[BUNDLE_COMPONENT_STATE_INVALID] state must be MEASURED or UNAVAILABLE');
  const components = record.components.map(validateComponent).sort((a, b) =>
    REQUIRED_BUNDLE_COMPONENTS.indexOf(a.kind) - REQUIRED_BUNDLE_COMPONENTS.indexOf(b.kind));
  const kinds = new Set(components.map((component) => component.kind));
  for (const kind of REQUIRED_BUNDLE_COMPONENTS) {
    if (!kinds.has(kind)) throw new TypeError(`[BUNDLE_COMPONENT_MISSING] ${kind}`);
  }
  if (kinds.size !== REQUIRED_BUNDLE_COMPONENTS.length || components.length !== kinds.size) {
    throw new TypeError('[BUNDLE_COMPONENT_DUPLICATE] every required component kind must occur exactly once');
  }
  const total = components.reduce((sum, component) => sum + component.transferBytes, 0);
  if (!Number.isSafeInteger(record.transferTotalBytes) || record.transferTotalBytes < 0 || record.transferTotalBytes !== total) {
    throw new TypeError(`[BUNDLE_TRANSFER_TOTAL_MISMATCH] declared ${record.transferTotalBytes}; component sum ${total}`);
  }
  return { state: 'MEASURED', ...base, components, transferTotalBytes: total };
}

function validateComponent(component: BundleTransferComponent): BundleTransferComponent {
  if (!REQUIRED_BUNDLE_COMPONENTS.includes(component.kind)) throw new TypeError(`[BUNDLE_COMPONENT_KIND_INVALID] ${String(component.kind)}`);
  if (!Number.isSafeInteger(component.transferBytes) || component.transferBytes < 0) {
    throw new TypeError(`[BUNDLE_COMPONENT_BYTES_INVALID] ${component.kind}`);
  }
  const files = component.files.map((file) => ({
    path: requireText(file.path, `${component.kind}.path`),
    sha256: requireDigest(file.sha256, `${component.kind}.sha256`),
    transferBytes: requireBytes(file.transferBytes, `${component.kind}.transferBytes`),
  })).sort((a, b) => a.path.localeCompare(b.path));
  const paths = new Set(files.map((file) => file.path));
  if (paths.size !== files.length) throw new TypeError(`[BUNDLE_COMPONENT_FILE_DUPLICATE] ${component.kind}`);
  const fileTotal = files.reduce((sum, file) => sum + file.transferBytes, 0);
  if (fileTotal !== component.transferBytes) {
    throw new TypeError(`[BUNDLE_COMPONENT_FILE_TOTAL_MISMATCH] ${component.kind}: ${fileTotal} != ${component.transferBytes}`);
  }
  return {
    kind: component.kind,
    transferBytes: component.transferBytes,
    files,
    compression: {
      algorithm: requireText(component.compression.algorithm, `${component.kind}.compression.algorithm`),
      options: { ...component.compression.options },
    },
  };
}

function cloneComponent(component: BundleTransferComponent): BundleTransferComponent {
  return {
    ...component,
    files: component.files.map((file) => ({ ...file })),
    compression: { algorithm: component.compression.algorithm, options: { ...component.compression.options } },
  };
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`[BUNDLE_COMPONENT_INVALID] ${field} must be non-empty`);
  return value;
}

function requireDigest(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) throw new TypeError(`[BUNDLE_COMPONENT_INVALID] ${field} must be lowercase sha256`);
  return value;
}

function requireBytes(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new TypeError(`[BUNDLE_COMPONENT_INVALID] ${field} must be non-negative safe integer bytes`);
  return value as number;
}

function compareRecords(a: BundleComponentsRecord, b: BundleComponentsRecord): number {
  return a.engineId.localeCompare(b.engineId) || a.engineVersion.localeCompare(b.engineVersion);
}
