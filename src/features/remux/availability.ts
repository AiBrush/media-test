import type { Scenario } from '../../core/scenario.ts';

export interface RemuxManifestAsset {
  readonly id: string;
  readonly sha256?: string | null;
  readonly sizeBytes?: number | null;
  readonly container?: string;
  readonly source?: string;
  readonly sizeBucket?: string;
}

export interface RemuxFixtureManifest {
  readonly assets: readonly RemuxManifestAsset[];
}

export type RemuxAvailabilityState = 'BAKED' | 'PENDING' | 'MISSING' | 'INVALID';

export interface RemuxAvailability {
  readonly assetId: string;
  readonly state: RemuxAvailabilityState;
  readonly reasonCode: string;
  readonly sha256?: string;
  readonly sizeBytes?: number;
  readonly sizeBucket?: string;
}

export interface RemuxAvailabilityAuditIssue {
  readonly scenarioId?: string;
  readonly assetId: string;
  readonly reasonCode: string;
  readonly detail: string;
}

export interface RemuxAvailabilityAssertion {
  readonly assetId: string;
  readonly expectedState: RemuxAvailabilityState;
}

function manifestIndex(manifest: RemuxFixtureManifest): { byId: Map<string, RemuxManifestAsset>; issues: RemuxAvailabilityAuditIssue[] } {
  const byId = new Map<string, RemuxManifestAsset>();
  const issues: RemuxAvailabilityAuditIssue[] = [];
  for (const asset of manifest.assets) {
    if (!asset || typeof asset.id !== 'string' || !asset.id) continue;
    if (byId.has(asset.id)) {
      issues.push({ assetId: asset.id, reasonCode: 'REMUX_MANIFEST_DUPLICATE_ASSET', detail: `duplicate manifest record '${asset.id}'` });
    } else {
      byId.set(asset.id, asset);
    }
  }
  return { byId, issues };
}

export function remuxFixtureAvailability(assetId: string, manifest: RemuxFixtureManifest): RemuxAvailability {
  const record = manifest.assets.find((asset) => asset.id === assetId);
  if (!record) return { assetId, state: 'MISSING', reasonCode: 'REMUX_MANIFEST_ASSET_MISSING' };
  const sha = record.sha256;
  const size = record.sizeBytes;
  if (sha == null || size == null) {
    return { assetId, state: 'PENDING', reasonCode: 'REMUX_MANIFEST_IDENTITY_PENDING', ...(record.sizeBucket ? { sizeBucket: record.sizeBucket } : {}) };
  }
  if (!/^[0-9a-f]{64}$/.test(sha) || !Number.isSafeInteger(size) || size < 0) {
    return { assetId, state: 'INVALID', reasonCode: 'REMUX_MANIFEST_IDENTITY_INVALID', ...(record.sizeBucket ? { sizeBucket: record.sizeBucket } : {}) };
  }
  return {
    assetId, state: 'BAKED', reasonCode: 'REMUX_MANIFEST_IDENTITY_BAKED',
    sha256: sha, sizeBytes: size, ...(record.sizeBucket ? { sizeBucket: record.sizeBucket } : {}),
  };
}

/** CI-facing audit: scenario availability is derived from manifest identity, never source comments. */
export function auditRemuxScenarioAvailability(
  scenarios: readonly Scenario[],
  manifest: RemuxFixtureManifest,
): RemuxAvailabilityAuditIssue[] {
  const indexed = manifestIndex(manifest);
  const issues = [...indexed.issues];
  for (const scenario of scenarios) {
    if (scenario.family !== 'remux') continue;
    for (const input of scenario.inputs) {
      const availability = remuxFixtureAvailability(input.assetId, manifest);
      if (availability.state !== 'BAKED') {
        issues.push({
          scenarioId: scenario.id,
          assetId: input.assetId,
          reasonCode: availability.reasonCode,
          detail: `${scenario.id} input '${input.assetId}' is ${availability.state.toLowerCase()} in the canonical manifest`,
        });
      }
    }
  }
  return issues;
}

/** Fails stale prose/data assertions such as "hash is null" once the manifest says BAKED. */
export function auditRemuxAvailabilityAssertions(
  manifest: RemuxFixtureManifest,
  assertions: readonly RemuxAvailabilityAssertion[],
): RemuxAvailabilityAuditIssue[] {
  return assertions.flatMap((assertion) => {
    const actual = remuxFixtureAvailability(assertion.assetId, manifest);
    return actual.state === assertion.expectedState
      ? []
      : [{
          assetId: assertion.assetId,
          reasonCode: 'REMUX_AVAILABILITY_ASSERTION_STALE',
          detail: `availability assertion says ${assertion.expectedState}, manifest says ${actual.state}`,
        }];
  });
}

export function remuxAvailabilitySummary(assetId: string, manifest: RemuxFixtureManifest): string {
  const value = remuxFixtureAvailability(assetId, manifest);
  return value.state === 'BAKED'
    ? `${value.sizeBucket ?? 'unbucketed'}; ${value.sizeBytes} bytes; sha256 ${value.sha256}`
    : `${value.state.toLowerCase()} [${value.reasonCode}]`;
}
