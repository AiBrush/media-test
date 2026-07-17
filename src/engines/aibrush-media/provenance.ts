import type { AdapterConfigProfile, ImmutableConfigSnapshot, SerializableValue } from '../../core/engine.ts';
import { captureConfigUsedSnapshot } from '../../core/engine.ts';
import { AIBRUSH_ENGINE_ID } from './support.ts';
import { GENERATED_AIBRUSH_VENDOR_PROVENANCE } from './vendor-provenance.generated.ts';

export type AibrushTargetMode = 'framework-default' | 'buffer-materialized' | 'callback-stream';
export type AibrushSourceMode = 'pinned-clean' | 'dirty-dev' | 'unlabeled-dev';

export interface AibrushBundledWasmArtifact {
  /** Package-relative path. Absolute host paths never enter result JSON. */
  readonly path: string;
  readonly sha256: string;
}

export interface AibrushRuntimeWasmObservation {
  /** A URL or emitted basename observed in the browser. It is sanitized before persistence. */
  readonly resource: string;
  readonly sha256: string;
}

export interface AibrushLoadedWasmArtifact {
  /** Canonical package basename: no emitted URL, origin, query, fragment, token, or host path. */
  readonly resource: string;
  readonly bundledPath: string;
  readonly sha256: string;
}

export interface AibrushVendorProvenance {
  readonly formatVersion: 1;
  readonly dependency: string;
  readonly packageVersion: string;
  readonly sourceRevision: string;
  readonly sourceTreeDigest: string;
  readonly dirtyState: 'clean' | 'dirty' | 'unknown';
  readonly buildFlags: readonly string[];
  readonly bundledWasmArtifacts: readonly AibrushBundledWasmArtifact[];
}

export interface AibrushRouteObservation {
  readonly operation: string;
  readonly route: string;
  readonly internalDriver: 'framework-router-unexposed';
  readonly readerMode: string;
  readonly writerMode: string;
  readonly targetMode: AibrushTargetMode;
  readonly peakRetainedBytes: number;
  readonly callbackWriteCount: number;
  readonly codecConfigs?: readonly SerializableValue[];
}

export type AibrushProvenanceErrorCode =
  | 'AIBRUSH_PROVENANCE_UNLABELED'
  | 'AIBRUSH_PROVENANCE_DIRTY'
  | 'AIBRUSH_PROVENANCE_INCOMPLETE'
  | 'AIBRUSH_PACKAGE_VERSION_MISMATCH'
  | 'AIBRUSH_WASM_PROVENANCE_INCOMPLETE'
  | 'AIBRUSH_WASM_RUNTIME_UNKNOWN'
  | 'AIBRUSH_WASM_RUNTIME_DIGEST_MISMATCH'
  | 'AIBRUSH_WASM_RUNTIME_DIGEST_UNAVAILABLE';

export class AibrushProvenanceError extends Error {
  override readonly name = 'AibrushProvenanceError';

  constructor(readonly code: AibrushProvenanceErrorCode, message: string, options?: ErrorOptions) {
    super(`${code}: ${message}`, options);
  }
}

export const UNLABELED_AIBRUSH_PROVENANCE: AibrushVendorProvenance = freezeProvenance({
  formatVersion: 1,
  dependency: 'file:../media',
  packageVersion: '0.0.0',
  sourceRevision: 'UNLABELED_LOCAL_SOURCE',
  sourceTreeDigest: 'UNLABELED_SOURCE_TREE',
  dirtyState: 'unknown',
  buildFlags: [],
  bundledWasmArtifacts: [],
});

/** The immutable sync artifact Vite includes in every aibrush-media adapter bundle. */
export const AIBRUSH_VENDOR_PROVENANCE: AibrushVendorProvenance = freezeProvenance(
  GENERATED_AIBRUSH_VENDOR_PROVENANCE,
);

export class AibrushConfigEvidence {
  #route: AibrushRouteObservation = {
    operation: 'none',
    route: 'not-executed',
    internalDriver: 'framework-router-unexposed',
    readerMode: 'not-executed',
    writerMode: 'not-executed',
    targetMode: 'framework-default',
    peakRetainedBytes: 0,
    callbackWriteCount: 0,
  };
  #loadedWasmArtifacts: readonly AibrushLoadedWasmArtifact[] = Object.freeze([]);
  readonly #provenance: AibrushVendorProvenance;

  constructor(provenance: AibrushVendorProvenance = AIBRUSH_VENDOR_PROVENANCE) {
    this.#provenance = freezeProvenance(provenance);
  }

  setLoadedWasmArtifacts(observations: readonly AibrushRuntimeWasmObservation[]): void {
    this.#loadedWasmArtifacts = bindRuntimeAibrushWasmArtifacts(
      this.#provenance.bundledWasmArtifacts,
      observations,
    );
  }

  assertPackageVersion(actualVersion: string): void {
    if (actualVersion !== this.#provenance.packageVersion) {
      throw new AibrushProvenanceError(
        'AIBRUSH_PACKAGE_VERSION_MISMATCH',
        `generated provenance names package ${this.#provenance.packageVersion}, loaded module reports ${actualVersion}`,
      );
    }
  }

  record(route: AibrushRouteObservation): void {
    this.#route = { ...route, codecConfigs: route.codecConfigs === undefined ? [] : [...route.codecConfigs] };
  }

  snapshot(): ImmutableConfigSnapshot {
    const provenance = this.#provenance;
    const profile: AdapterConfigProfile = {
      framework: '@aibrush/media',
      packageVersions: { '@aibrush/media': provenance.packageVersion },
      backend: this.#route.internalDriver,
      hardwareAcceleration: 'framework-selected-unexposed',
      workerCount: 0,
      threadCount: 1,
      readerMode: this.#route.readerMode,
      writerMode: this.#route.writerMode,
      targetMode: this.#route.targetMode,
      codecConfigs: [...(this.#route.codecConfigs ?? [])],
      operation: this.#route.operation,
      route: this.#route.route,
      peakRetainedBytes: this.#route.peakRetainedBytes,
      callbackWriteCount: this.#route.callbackWriteCount,
      provenance: {
        formatVersion: provenance.formatVersion,
        dependency: provenance.dependency,
        packageVersion: provenance.packageVersion,
        sourceRevision: provenance.sourceRevision,
        sourceTreeDigest: provenance.sourceTreeDigest,
        sourceMode: sourceMode(provenance),
        dirtyState: provenance.dirtyState,
        buildFlags: [...provenance.buildFlags],
        bundledWasmArtifacts: provenance.bundledWasmArtifacts.map((artifact) => ({ ...artifact })),
        loadedWasmArtifacts: this.#loadedWasmArtifacts.map((artifact) => ({ ...artifact })),
      },
    };
    return captureConfigUsedSnapshot(AIBRUSH_ENGINE_ID, profile, { requireProfile: true });
  }

  assertReproducible(): void {
    const provenance = this.#provenance;
    if (
      provenance.dirtyState === 'unknown' ||
      !/^[0-9a-f]{40}$/.test(provenance.sourceRevision)
    ) {
      throw new AibrushProvenanceError(
        'AIBRUSH_PROVENANCE_UNLABELED',
        'reproducible mode requires a labeled full source revision',
      );
    }
    if (provenance.dirtyState === 'dirty') {
      throw new AibrushProvenanceError(
        'AIBRUSH_PROVENANCE_DIRTY',
        'reproducible mode refuses a dirty-development framework build',
      );
    }
    if (!/^[0-9a-f]{64}$/.test(provenance.sourceTreeDigest) || provenance.buildFlags.length === 0) {
      throw new AibrushProvenanceError(
        'AIBRUSH_PROVENANCE_INCOMPLETE',
        'source-tree digest and exact build commands are required',
      );
    }
    assertBundledWasmManifest(provenance.bundledWasmArtifacts);
  }
}

/**
 * Bind browser-observed resources to the sync manifest by emitted name and digest. A matching digest
 * alone is insufficient: this prevents a different runtime asset from being attributed to the vendor.
 */
export function bindRuntimeAibrushWasmArtifacts(
  bundled: readonly AibrushBundledWasmArtifact[],
  observations: readonly AibrushRuntimeWasmObservation[],
): readonly AibrushLoadedWasmArtifact[] {
  const bound = new Map<string, AibrushLoadedWasmArtifact>();
  for (const observation of [...observations].sort(compareRuntimeObservation)) {
    const resource = runtimeResourceName(observation.resource);
    const candidates = bundled.filter((artifact) => runtimeNameMatchesBundled(resource, artifact.path));
    if (candidates.length === 0) {
      throw new AibrushProvenanceError(
        'AIBRUSH_WASM_RUNTIME_UNKNOWN',
        `runtime resource '${resource}' is absent from the generated vendor manifest`,
      );
    }
    const artifact = candidates.find((candidate) => candidate.sha256 === observation.sha256);
    if (artifact === undefined) {
      throw new AibrushProvenanceError(
        'AIBRUSH_WASM_RUNTIME_DIGEST_MISMATCH',
        `runtime resource '${resource}' does not match its persisted SHA-256`,
      );
    }
    const canonicalResource = runtimeResourceName(artifact.path);
    bound.set(artifact.path, Object.freeze({
      resource: canonicalResource,
      bundledPath: artifact.path,
      sha256: observation.sha256,
    }));
  }
  return Object.freeze([...bound.values()]);
}

/** Hash only generated-manifest resources actually present in the current page's resource timeline. */
export async function captureLoadedAibrushWasmArtifacts(
  bundled: readonly AibrushBundledWasmArtifact[],
  signal?: AbortSignal,
): Promise<readonly AibrushRuntimeWasmObservation[]> {
  if (
    typeof performance === 'undefined' ||
    typeof fetch !== 'function' ||
    globalThis.crypto?.subtle === undefined
  ) {
    return [];
  }
  const urls = [...new Set(
    performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((url) => bundled.some((artifact) => runtimeNameMatchesBundled(runtimeResourceName(url), artifact.path))),
  )].sort();
  const observations: AibrushRuntimeWasmObservation[] = [];
  for (const url of urls) {
    signal?.throwIfAborted();
    try {
      const response = await fetch(url, { cache: 'force-cache', ...(signal === undefined ? {} : { signal }) });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const bytes = await response.arrayBuffer();
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      observations.push({ resource: url, sha256: hex(digest) });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new AibrushProvenanceError(
        'AIBRUSH_WASM_RUNTIME_DIGEST_UNAVAILABLE',
        `could not hash runtime resource '${runtimeResourceName(url)}'`,
        { cause: error },
      );
    }
  }
  return observations;
}

function assertBundledWasmManifest(artifacts: readonly AibrushBundledWasmArtifact[]): void {
  if (artifacts.length === 0) {
    throw new AibrushProvenanceError(
      'AIBRUSH_WASM_PROVENANCE_INCOMPLETE',
      'the generated vendor manifest contains no bundled WASM artifacts',
    );
  }
  const paths = new Set<string>();
  for (const artifact of artifacts) {
    if (
      !/^dist\/[A-Za-z0-9._/-]+\.wasm$/.test(artifact.path) ||
      !/^[0-9a-f]{64}$/.test(artifact.sha256) ||
      paths.has(artifact.path)
    ) {
      throw new AibrushProvenanceError(
        'AIBRUSH_WASM_PROVENANCE_INCOMPLETE',
        'bundled WASM paths must be unique package-relative paths with SHA-256 digests',
      );
    }
    paths.add(artifact.path);
  }
}

function sourceMode(provenance: AibrushVendorProvenance): AibrushSourceMode {
  if (provenance.dirtyState === 'clean' && /^[0-9a-f]{40}$/.test(provenance.sourceRevision)) {
    return 'pinned-clean';
  }
  return provenance.dirtyState === 'dirty' ? 'dirty-dev' : 'unlabeled-dev';
}

function freezeProvenance(value: AibrushVendorProvenance): AibrushVendorProvenance {
  return Object.freeze({
    formatVersion: 1,
    dependency: value.dependency,
    packageVersion: value.packageVersion,
    sourceRevision: value.sourceRevision,
    sourceTreeDigest: value.sourceTreeDigest,
    dirtyState: value.dirtyState,
    buildFlags: Object.freeze([...value.buildFlags]),
    bundledWasmArtifacts: Object.freeze(
      [...value.bundledWasmArtifacts]
        .sort((left, right) => compareText(left.path, right.path))
        .map((artifact) => Object.freeze({ ...artifact })),
    ),
  });
}

function runtimeResourceName(value: string): string {
  const withoutFragment = value.split('#', 1)[0] ?? value;
  const withoutQuery = withoutFragment.split('?', 1)[0] ?? withoutFragment;
  const slash = withoutQuery.lastIndexOf('/');
  return withoutQuery.slice(slash + 1);
}

function runtimeNameMatchesBundled(resource: string, bundledPath: string): boolean {
  const basename = runtimeResourceName(bundledPath);
  if (resource === basename) return true;
  const extensionAt = basename.lastIndexOf('.');
  if (extensionAt <= 0) return false;
  const stem = basename.slice(0, extensionAt);
  const extension = basename.slice(extensionAt);
  return resource.startsWith(`${stem}-`) && resource.endsWith(extension);
}

function compareRuntimeObservation(
  left: AibrushRuntimeWasmObservation,
  right: AibrushRuntimeWasmObservation,
): number {
  return compareText(left.resource, right.resource) || compareText(left.sha256, right.sha256);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function hex(bytes: Uint8Array): string {
  let value = '';
  for (const byte of bytes) value += byte.toString(16).padStart(2, '0');
  return value;
}
