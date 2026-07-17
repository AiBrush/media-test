/** Crash-safe immutable fixture/golden publication with an atomic active index. */

import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import {
  GENERATION_INDEX_SCHEMA,
  GOLDEN_SCHEMA_VERSION,
  deterministicIso,
  validateFixtureManifest,
  validateGoldenEnvelope,
} from './golden-contract.mjs';
import { canonicalJson, canonicalSha256, sha256Hex } from './golden-normalization.mjs';

const SHA256 = /^[0-9a-f]{64}$/;
const GOLDEN_ARTIFACT_KINDS = new Set([
  'metadata', 'packets', 'frames', 'ssim', 'keys', 'segments', 'availability',
]);

/**
 * Publish exactly one complete generation. Every artifact is written+fsynced below an unpublished
 * staging directory, the immutable generation directory is renamed into place, and the active index
 * is written+fsynced+renamed last. A failure can leave an unreachable immutable directory, never a
 * mixed active view.
 */
export function publishGeneration({
  rootDir,
  artifacts,
  availability = [],
  publicationScope,
  sourceDateEpoch = process.env.SOURCE_DATE_EPOCH,
  indexFilename = 'generation-index.json',
  faultInjector,
}) {
  const root = resolve(rootDir);
  const declarationIssues = [];
  const declarations = auditFixtureDeclarations(root, declarationIssues);
  if (declarationIssues.length) throw new TypeError(`fixture declarations invalid: ${declarationIssues.join('; ')}`);
  const normalized = normalizeArtifacts(artifacts, declarations);
  const normalizedAvailability = normalizeAvailability(availability);
  const normalizedScope = normalizePublicationScope(publicationScope);
  assertDisjointPublicationState(normalized, normalizedAvailability);
  if (normalized.length === 0 && normalizedAvailability.length === 0) {
    throw new TypeError('a generation needs at least one artifact or typed availability record');
  }
  const identityRows = normalized.map((artifact) => ({
    logicalPath: artifact.logicalPath,
    artifactKind: artifact.artifactKind,
    sha256: artifact.sha256,
    sizeBytes: artifact.sizeBytes,
    sourceMediaSha256: artifact.sourceMediaSha256,
    provenanceSha256: artifact.provenanceSha256,
    audit: artifact.audit,
  }));
  assertPublicationScopeCoverage(normalizedScope, normalized, normalizedAvailability);
  const generationId = generationIdentitySha256(identityRows, normalizedAvailability, normalizedScope);
  const generationsDir = join(root, 'generations');
  const finalGeneration = join(generationsDir, generationId);
  const stagingRoot = join(root, '.fixture-staging');
  const staging = join(stagingRoot, `${generationId}-${process.pid}`);
  const indexPath = join(root, indexFilename);
  const indexTemp = join(root, `.${indexFilename}.${process.pid}.tmp`);
  mkdirSync(root, { recursive: true });
  mkdirSync(generationsDir, { recursive: true });
  mkdirSync(stagingRoot, { recursive: true });
  rmSync(staging, { recursive: true, force: true });
  rmSync(indexTemp, { force: true });

  let writeCount = 0;
  const inject = (phase, logicalPath) => {
    faultInjector?.({ phase, logicalPath, writeCount, generationId });
  };

  try {
    if (!existsSync(finalGeneration)) {
      mkdirSync(staging, { recursive: true });
      for (const artifact of normalized) {
        inject('before-artifact-write', artifact.logicalPath);
        const output = safeGenerationPath(staging, artifact.logicalPath);
        mkdirSync(dirname(output), { recursive: true });
        durableWriteArtifact(output, artifact);
        writeCount++;
        inject('after-artifact-write', artifact.logicalPath);
      }
      syncDirectoryTree(staging);
      inject('before-generation-rename');
      renameSync(staging, finalGeneration);
      fsyncDirectory(generationsDir);
      inject('after-generation-rename');
    } else {
      verifyImmutableDirectory(finalGeneration, normalized);
    }

    const index = {
      schema: GENERATION_INDEX_SCHEMA,
      schemaVersion: GOLDEN_SCHEMA_VERSION,
      generationId,
      createdAtIso: deterministicIso(sourceDateEpoch),
      publicationScope: normalizedScope,
      entries: identityRows.map((entry) => ({
        ...entry,
        generationPath: `generations/${generationId}/${entry.logicalPath}`,
      })),
      availability: normalizedAvailability,
    };
    const validation = validateGenerationIndex(index);
    if (!validation.ok) throw new TypeError(`generation index invalid: ${validation.issues.join('; ')}`);
    const indexBytes = Buffer.from(`${JSON.stringify(index, null, 2)}\n`);
    inject('before-index-write', indexFilename);
    durableWrite(indexTemp, indexBytes);
    writeCount++;
    inject('after-index-write', indexFilename);
    inject('before-index-rename', indexFilename);
    renameSync(indexTemp, indexPath);
    fsyncDirectory(root);
    inject('after-index-rename', indexFilename);
    return { index, indexPath, generationDirectory: finalGeneration, writeCount };
  } finally {
    rmSync(staging, { recursive: true, force: true });
    rmSync(indexTemp, { force: true });
  }
}

/** Hash every indexed byte and validate its source/provenance cross-reference. */
export function auditGeneration(rootDir, indexValue) {
  const root = resolve(rootDir);
  const validation = validateGenerationIndex(indexValue);
  const issues = [...validation.issues];
  if (!validation.ok) return { ok: false, issues, checked: 0 };
  const declarations = auditFixtureDeclarations(root, issues);
  let checked = 0;
  const records = [];
  let activeManifest;
  const evidenceAssets = new Map();
  for (const entry of indexValue.entries) {
    let path;
    try {
      path = safeGenerationPath(root, entry.generationPath);
    } catch (error) {
      issues.push(`${entry.logicalPath}: ${error.message}`);
      continue;
    }
    if (!existsSync(path)) {
      issues.push(`${entry.logicalPath}: indexed file is absent`);
      continue;
    }
    const stats = statSync(path);
    if (stats.size !== entry.sizeBytes) issues.push(`${entry.logicalPath}: size ${stats.size} != ${entry.sizeBytes}`);
    const actual = sha256File(path);
    if (actual !== entry.sha256) issues.push(`${entry.logicalPath}: digest mismatch`);
    let document;
    if (/\.json$/i.test(entry.logicalPath) && GOLDEN_ARTIFACT_KINDS.has(entry.artifactKind)) {
      try {
        document = JSON.parse(readFileSync(path, 'utf8'));
      } catch (error) {
        issues.push(`${entry.logicalPath}: JSON parse failed (${error.message})`);
        continue;
      }
      const envelopeIssues = validateIndexedGoldenDocument(document, entry, declarations);
      for (const issue of envelopeIssues) issues.push(`${entry.logicalPath}: ${issue}`);
      if (envelopeIssues.length === 0) evidenceAssets.set(entry.logicalPath, document.assetId);
    } else if (/\.json$/i.test(entry.logicalPath)) {
      try {
        document = JSON.parse(readFileSync(path, 'utf8'));
      } catch (error) {
        issues.push(`${entry.logicalPath}: JSON parse failed (${error.message})`);
        continue;
      }
    }
    if (!GOLDEN_ARTIFACT_KINDS.has(entry.artifactKind) && entry.audit.outputArtifactSha256 !== actual) {
      issues.push(`${entry.logicalPath}: audit output digest does not match committed file bytes`);
    }
    if (entry.logicalPath === 'manifest.json') activeManifest = document;
    records.push({
      logicalPath: entry.logicalPath,
      sourceMediaSha256: entry.sourceMediaSha256,
      recipe: entry.audit.recipe,
      bakerVersion: entry.audit.bakerVersion,
      outputArtifactSha256: entry.audit.outputArtifactSha256,
      committedFileSha256: entry.sha256,
      ...(document?.provenance ? {
        normalizedArgumentsSha256: document.provenance.buildDefinition.normalizedArgumentsSha256,
        resolvedDependencies: document.provenance.buildDefinition.dependencies,
        toolchainLockSha256: document.provenance.runDetails.perimeter.declaredLock.sha256,
      } : {}),
    });
    checked++;
  }
  auditManifestCoverage(indexValue, activeManifest, evidenceAssets, issues);
  return { ok: issues.length === 0, issues, checked, records };
}

export function validateGenerationIndex(value) {
  const issues = [];
  if (!isRecord(value)) return { ok: false, issues: ['index must be an object'] };
  rejectUnknownKeys(value, ['schema', 'schemaVersion', 'generationId', 'createdAtIso', 'publicationScope', 'entries', 'availability'], 'index', issues);
  if (value.schema !== GENERATION_INDEX_SCHEMA) issues.push(`schema must equal '${GENERATION_INDEX_SCHEMA}'`);
  if (!/^1\.\d+\.\d+$/.test(value.schemaVersion ?? '')) issues.push('schemaVersion has unsupported major');
  if (!SHA256.test(value.generationId ?? '')) issues.push('generationId is invalid');
  if (!validIso(value.createdAtIso)) issues.push('createdAtIso is invalid');
  let publicationScope;
  try {
    publicationScope = normalizePublicationScope(value.publicationScope, { requireCanonical: true });
  } catch (error) {
    issues.push(`publicationScope ${error.message}`);
  }
  if (!Array.isArray(value.entries)) issues.push('entries must be an array');
  const paths = new Set();
  let priorEntryPath;
  for (const [index, entry] of (Array.isArray(value.entries) ? value.entries : []).entries()) {
    if (!isRecord(entry)) { issues.push(`entries[${index}] must be an object`); continue; }
    rejectUnknownKeys(entry, ['logicalPath', 'generationPath', 'artifactKind', 'sha256', 'sizeBytes', 'sourceMediaSha256', 'provenanceSha256', 'audit'], `entries[${index}]`, issues);
    for (const field of ['logicalPath', 'generationPath', 'artifactKind']) {
      if (typeof entry[field] !== 'string' || !entry[field]) issues.push(`entries[${index}].${field} is required`);
    }
    try { normalizeLogicalPath(entry.logicalPath); } catch (error) { issues.push(`entries[${index}].logicalPath ${error.message}`); }
    if (paths.has(entry.logicalPath)) issues.push(`duplicate logical path '${entry.logicalPath}'`);
    paths.add(entry.logicalPath);
    if (typeof entry.logicalPath === 'string') {
      if (priorEntryPath !== undefined && compareText(priorEntryPath, entry.logicalPath) > 0) {
        issues.push('entries must be in canonical logicalPath order');
      }
      priorEntryPath = entry.logicalPath;
    }
    for (const field of ['sha256', 'sourceMediaSha256', 'provenanceSha256']) {
      if (!SHA256.test(entry[field] ?? '')) issues.push(`entries[${index}].${field} is invalid`);
    }
    if (!isRecord(entry.audit)) issues.push(`entries[${index}].audit is required`);
    else {
      rejectUnknownKeys(entry.audit, ['recipe', 'bakerVersion', 'outputArtifactSha256'], `entries[${index}].audit`, issues);
      if (typeof entry.audit.recipe !== 'string' || !entry.audit.recipe) issues.push(`entries[${index}].audit.recipe is required`);
      if (typeof entry.audit.bakerVersion !== 'string' || !entry.audit.bakerVersion) issues.push(`entries[${index}].audit.bakerVersion is required`);
      if (!SHA256.test(entry.audit.outputArtifactSha256 ?? '')) issues.push(`entries[${index}].audit.outputArtifactSha256 is invalid`);
    }
    if (!Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes < 0) issues.push(`entries[${index}].sizeBytes is invalid`);
    if (typeof entry.generationPath === 'string' && typeof entry.logicalPath === 'string') {
      const expectedPath = `generations/${value.generationId}/${entry.logicalPath}`;
      if (entry.generationPath !== expectedPath) {
        issues.push(`entries[${index}].generationPath must equal '${expectedPath}'`);
      }
    }
  }
  if (!Array.isArray(value.availability)) issues.push('availability must be an array');
  else {
    try {
      const availability = normalizeAvailability(value.availability);
      if (value.availability.some((entry, index) => entry.logicalPath !== availability[index]?.logicalPath)) {
        issues.push('availability must be in canonical logicalPath order');
      }
      for (const entry of availability) {
        if (paths.has(entry.logicalPath)) {
          issues.push(`logical path '${entry.logicalPath}' cannot be both an indexed entry and availability`);
        }
      }
    } catch (error) {
      issues.push(error.message);
    }
  }
  if (publicationScope && Array.isArray(value.entries) && Array.isArray(value.availability) && SHA256.test(value.generationId ?? '')) {
    try {
      const identityRows = value.entries.map(({ generationPath: _generationPath, ...entry }) => entry);
      const expectedGenerationId = generationIdentitySha256(identityRows, value.availability, publicationScope);
      if (expectedGenerationId !== value.generationId) {
        issues.push(`generationId does not match canonical publication identity (${expectedGenerationId})`);
      }
    } catch (error) {
      issues.push(`generation identity cannot be computed (${error.message})`);
    }
  }
  return { ok: issues.length === 0, issues };
}

/** Normalize the exact corpus slice represented by an immutable generation. There is no fallback. */
export function normalizePublicationScope(value, { requireCanonical = false } = {}) {
  if (!isRecord(value)) throw new TypeError('is required and must be an object');
  const keys = Object.keys(value).sort(compareText);
  if (value.mode === 'complete-corpus') {
    if (keys.length !== 1 || keys[0] !== 'mode') {
      throw new TypeError("complete-corpus permits only the 'mode' field");
    }
    return { mode: 'complete-corpus' };
  }
  if (value.mode !== 'selected-assets') {
    throw new TypeError("mode must be 'complete-corpus' or 'selected-assets'");
  }
  if (keys.length !== 2 || keys[0] !== 'assetIds' || keys[1] !== 'mode') {
    throw new TypeError("selected-assets requires exactly 'mode' and 'assetIds'");
  }
  if (!Array.isArray(value.assetIds) || value.assetIds.length === 0) {
    throw new TypeError('selected-assets.assetIds must be a nonempty array');
  }
  const original = value.assetIds.map((assetId, index) => {
    try {
      return normalizeLogicalPath(assetId);
    } catch (error) {
      throw new TypeError(`selected-assets.assetIds[${index}] ${error.message}`);
    }
  });
  const assetIds = [...new Set(original)].sort(compareText);
  if (assetIds.length !== original.length) throw new TypeError('selected-assets.assetIds must be unique');
  if (requireCanonical && original.some((assetId, index) => assetId !== assetIds[index])) {
    throw new TypeError('selected-assets.assetIds must be in canonical codepoint order');
  }
  return { mode: 'selected-assets', assetIds };
}

function generationIdentitySha256(entries, availability, publicationScope) {
  return canonicalSha256({
    schema: GENERATION_INDEX_SCHEMA,
    publicationScope,
    entries,
    availability,
  });
}

/**
 * Record a newly ready staged artifact. Readiness is authoritative for the logical path, so a stale
 * pending/absent record from an earlier step in the same transaction is removed before publication.
 */
export function stageReadyPublicationRecord(staged, stagedAvailability, record) {
  if (!(staged instanceof Map) || !(stagedAvailability instanceof Map)) {
    throw new TypeError('staged publication state must use Map instances');
  }
  if (!isRecord(record)) throw new TypeError('staged ready record must be an object');
  const logicalPath = normalizeLogicalPath(record.logicalPath);
  stagedAvailability.delete(logicalPath);
  staged.set(logicalPath, { ...record, logicalPath });
}

/** Availability may replace active-generation state, but must not contradict a ready write staged now. */
export function stageUnavailablePublicationRecord(staged, stagedAvailability, record) {
  if (!(staged instanceof Map) || !(stagedAvailability instanceof Map)) {
    throw new TypeError('staged publication state must use Map instances');
  }
  if (!isRecord(record)) throw new TypeError('staged availability record must be an object');
  const logicalPath = normalizeLogicalPath(record.logicalPath);
  if (staged.has(logicalPath)) {
    throw new TypeError(`logical path '${logicalPath}' is already staged ready`);
  }
  stagedAvailability.set(logicalPath, { ...record, logicalPath });
}

/** Existing bytes may be reused only under the active digest+size identity. */
export function assessMediaReuse(path, expected) {
  if (!existsSync(path)) return { state: 'ABSENT', reasonCode: 'FIXTURE_MEDIA_ABSENT' };
  const actualSizeBytes = statSync(path).size;
  if (actualSizeBytes !== expected.sizeBytes) {
    return {
      state: 'REJECTED',
      reasonCode: 'FIXTURE_REUSE_SIZE_MISMATCH',
      expectedSizeBytes: expected.sizeBytes,
      actualSizeBytes,
    };
  }
  const actualSha256 = sha256File(path);
  if (actualSha256 !== expected.sha256) {
    return {
      state: 'REJECTED',
      reasonCode: 'FIXTURE_REUSE_DIGEST_MISMATCH',
      expectedSha256: expected.sha256,
      actualSha256,
      actualSizeBytes,
    };
  }
  return { state: 'REUSABLE', sha256: actualSha256, sizeBytes: actualSizeBytes };
}

/** An intentional replacement is explicit and invalidates every artifact bound to old bytes. */
export function planExplicitAssetUpdate(indexValue, { oldSha256, newSha256, newSizeBytes, explicit }) {
  if (!explicit) {
    return {
      state: 'REJECTED',
      reasonCode: 'FIXTURE_UPDATE_EXPLICIT_FLAG_REQUIRED',
      invalidated: [],
    };
  }
  if (!SHA256.test(oldSha256) || !SHA256.test(newSha256) || !Number.isSafeInteger(newSizeBytes) || newSizeBytes < 0) {
    throw new TypeError('asset update identities are invalid');
  }
  const invalidated = Array.isArray(indexValue?.entries)
    ? indexValue.entries
        .filter((entry) => entry.sourceMediaSha256 === oldSha256)
        .map((entry) => entry.logicalPath)
        .sort()
    : [];
  return {
    state: 'UPDATE_REQUIRED',
    reasonCode: 'FIXTURE_SOURCE_IDENTITY_REPLACED',
    oldSha256,
    newSha256,
    newSizeBytes,
    invalidated,
  };
}

/** `--update` is intentionally exact-id scoped; substring or whole-corpus replacement is forbidden. */
export function resolveExplicitAssetUpdateScope({ explicit, selectionTerms, assetIds }) {
  if (!explicit) return undefined;
  if (!Array.isArray(selectionTerms) || selectionTerms.length === 0) {
    throw new TypeError('explicit fixture update requires at least one exact asset id');
  }
  if (!Array.isArray(assetIds)) throw new TypeError('fixture manifest asset ids must be an array');
  const known = new Set(assetIds.map((id) => normalizeLogicalPath(id)));
  const scope = new Set();
  for (const term of selectionTerms) {
    const id = normalizeLogicalPath(term);
    if (!known.has(id)) {
      throw new TypeError(`explicit fixture update id '${id}' is not an exact manifest asset id`);
    }
    scope.add(id);
  }
  return scope;
}

export function readActiveGenerationIndex(rootDir, indexFilename = 'generation-index.json') {
  const path = join(resolve(rootDir), indexFilename);
  if (!existsSync(path)) return undefined;
  const value = JSON.parse(readFileSync(path, 'utf8'));
  const validation = validateGenerationIndex(value);
  if (!validation.ok) throw new TypeError(`active generation index invalid: ${validation.issues.join('; ')}`);
  return value;
}

/**
 * Carry forward untouched immutable entries when an entry point publishes a selected subset. The
 * caller supplies replacement logical paths; old bytes for those paths are deliberately omitted so
 * no stale dependent evidence can survive an explicit source update.
 */
export function activeArtifactsForMerge(rootDir, replacementLogicalPaths = [], indexFilename = 'generation-index.json') {
  const root = resolve(rootDir);
  const index = readActiveGenerationIndex(root, indexFilename);
  if (!index) return [];
  const replaced = new Set(replacementLogicalPaths.map(normalizeLogicalPath));
  return index.entries
    .filter((entry) => !replaced.has(entry.logicalPath))
    .map((entry) => {
      const path = safeGenerationPath(root, entry.generationPath);
      if (!existsSync(path)) throw new Error(`active generation entry '${entry.logicalPath}' is absent`);
      if (statSync(path).size !== entry.sizeBytes || sha256File(path) !== entry.sha256) {
        throw new Error(`active generation entry '${entry.logicalPath}' failed digest+size verification`);
      }
      return {
        logicalPath: entry.logicalPath,
        artifactKind: entry.artifactKind,
        sourcePath: path,
        sourceMediaSha256: entry.sourceMediaSha256,
        provenanceSha256: entry.provenanceSha256,
        audit: entry.audit,
      };
    });
}

export function activeAvailabilityForMerge(rootDir, replacementLogicalPaths = [], indexFilename = 'generation-index.json') {
  const index = readActiveGenerationIndex(rootDir, indexFilename);
  if (!index) return [];
  const replaced = new Set(replacementLogicalPaths.map(normalizeLogicalPath));
  return index.availability.filter((entry) => !replaced.has(entry.logicalPath));
}

/** Full cross-field validation applied before publication and again during the active audit. */
function validateIndexedGoldenDocument(document, entry, declarations = {}) {
  const issues = [];
  const envelope = validateGoldenEnvelope(document);
  issues.push(...envelope.issues);
  if (!envelope.ok) return issues;
  const provenance = document.provenance;
  if (document.artifactKind !== entry.artifactKind) issues.push('artifactKind does not match index entry');
  if (provenance.artifactKind !== document.artifactKind) issues.push('provenance artifactKind does not match envelope');
  if (provenance.assetId !== document.assetId) issues.push('provenance assetId does not match envelope');
  if (provenance.sourceMedia.sha256 !== document.sourceMedia.sha256 ||
      provenance.sourceMedia.sizeBytes !== document.sourceMedia.sizeBytes) {
    issues.push('provenance sourceMedia does not match envelope');
  }
  if (document.sourceMedia.sha256 !== entry.sourceMediaSha256) issues.push('source digest cross-reference mismatch');
  if (canonicalSha256(provenance.buildDefinition.normalizedArguments) !==
      provenance.buildDefinition.normalizedArgumentsSha256) {
    issues.push('normalized argument digest does not match normalizedArguments');
  }
  const dependencyIssues = validateResolvedDependencies(provenance.buildDefinition.dependencies);
  issues.push(...dependencyIssues);
  const perimeterIssues = validateRecordedToolPerimeter(provenance.runDetails.perimeter, declarations);
  issues.push(...perimeterIssues);
  if (provenance.runDetails.timeMode !== 'source-date-epoch') issues.push("provenance timeMode must be 'source-date-epoch'");
  if (typeof provenance.runDetails.browserQualified !== 'boolean') issues.push('provenance browserQualified must be boolean');
  if (Date.parse(provenance.runDetails.startedAtIso) > Date.parse(provenance.runDetails.finishedAtIso)) {
    issues.push('provenance startedAtIso is after finishedAtIso');
  }
  const canonicalPayload = canonicalJson(document.payload);
  const payloadSha256 = sha256Hex(canonicalPayload);
  const payloadSizeBytes = Buffer.byteLength(canonicalPayload);
  if (provenance.outputArtifact.digestScope !== 'canonical-payload') {
    issues.push("provenance outputArtifact.digestScope must be 'canonical-payload'");
  }
  if (provenance.outputArtifact.sha256 !== payloadSha256 || provenance.outputArtifact.sizeBytes !== payloadSizeBytes) {
    issues.push('provenance outputArtifact does not match canonical payload bytes');
  }
  const provenanceSha256 = sha256Hex(canonicalJson(provenance));
  if (provenanceSha256 !== entry.provenanceSha256) issues.push('provenance digest mismatch');
  if (provenance.buildDefinition.recipe !== entry.audit.recipe ||
      provenance.runDetails.baker !== entry.audit.bakerVersion ||
      provenance.outputArtifact.sha256 !== entry.audit.outputArtifactSha256) {
    issues.push('audit metadata does not match embedded provenance');
  }
  return issues;
}

function validateResolvedDependencies(value) {
  const issues = [];
  if (!Array.isArray(value)) return ['provenance dependencies must be an array'];
  const logicalIds = new Set();
  let prior;
  for (const [index, dependency] of value.entries()) {
    if (!isRecord(dependency)) { issues.push(`provenance dependencies[${index}] must be an object`); continue; }
    if (typeof dependency.logicalId !== 'string' || !dependency.logicalId) {
      issues.push(`provenance dependencies[${index}].logicalId is required`);
    } else {
      if (logicalIds.has(dependency.logicalId)) issues.push(`duplicate provenance dependency '${dependency.logicalId}'`);
      if (prior !== undefined && compareText(prior, dependency.logicalId) > 0) issues.push('provenance dependencies must be canonically ordered');
      logicalIds.add(dependency.logicalId);
      prior = dependency.logicalId;
    }
    if (!SHA256.test(dependency.sha256 ?? '')) issues.push(`provenance dependencies[${index}].sha256 is invalid`);
    if (!Number.isSafeInteger(dependency.sizeBytes) || dependency.sizeBytes < 0) {
      issues.push(`provenance dependencies[${index}].sizeBytes is invalid`);
    }
  }
  return issues;
}

/** Validate that the baker recorded the complete reproducibility perimeter, including absences. */
export function validateRecordedToolPerimeter(value, { toolchainSha256 } = {}) {
  const issues = [];
  if (!isRecord(value)) return ['provenance perimeter must be an object'];
  if (value.schemaVersion !== 'tool-perimeter@1') issues.push("provenance perimeter.schemaVersion must equal 'tool-perimeter@1'");
  if (!isRecord(value.tools)) issues.push('provenance perimeter.tools is required');
  else {
    for (const name of ['bun', 'ffmpeg', 'ffprobe', 'bento4', 'bento4Hls', 'shakaPackager', 'playwright', 'browser']) {
      const tool = value.tools[name];
      if (!isRecord(tool)) { issues.push(`provenance perimeter.tools.${name} is required`); continue; }
      if (!['present', 'absent', 'not-applicable'].includes(tool.state)) {
        issues.push(`provenance perimeter.tools.${name}.state is invalid`);
      }
      if (tool.state === 'present') {
        if (typeof tool.executable !== 'string' || !tool.executable) issues.push(`provenance perimeter.tools.${name}.executable is required`);
        if (typeof tool.versionOutput !== 'string' || !tool.versionOutput) issues.push(`provenance perimeter.tools.${name}.versionOutput is required`);
      }
    }
    for (const name of ['bun', 'ffmpeg', 'ffprobe']) {
      if (value.tools[name]?.state !== 'present') issues.push(`provenance perimeter required tool '${name}' is not recorded present`);
    }
  }
  if (!isRecord(value.platform)) issues.push('provenance perimeter.platform is required');
  else {
    for (const name of ['os', 'release', 'arch', 'locale', 'timezone']) {
      if (typeof value.platform[name] !== 'string' || !value.platform[name]) issues.push(`provenance perimeter.platform.${name} is required`);
    }
  }
  const environmentNames = ['SOURCE_DATE_EPOCH', 'LANG', 'LC_ALL', 'TZ', 'BRAVE_PATH', 'FFMPEG_PATH', 'FFPROBE_PATH'];
  if (!isRecord(value.environment)) issues.push('provenance perimeter.environment is required');
  else {
    for (const name of environmentNames) {
      if (!(name in value.environment)) issues.push(`provenance perimeter.environment.${name} must be recorded`);
      else if (value.environment[name] !== null && typeof value.environment[name] !== 'string') {
        issues.push(`provenance perimeter.environment.${name} must be string or null`);
      }
    }
  }
  if (!isRecord(value.declaredLock)) issues.push('provenance perimeter.declaredLock is required');
  else {
    if (!SHA256.test(value.declaredLock.sha256 ?? '')) issues.push('provenance perimeter.declaredLock.sha256 is invalid');
    if (toolchainSha256 && value.declaredLock.sha256 !== toolchainSha256) {
      issues.push('provenance perimeter.declaredLock.sha256 does not match committed toolchain lock');
    }
    const epoch = value.declaredLock.sourceDateEpoch;
    const validEpoch = (Number.isSafeInteger(epoch) && epoch >= 0) ||
      (typeof epoch === 'string' && /^(0|[1-9]\d*)$/.test(epoch) && Number.isSafeInteger(Number(epoch)));
    if (!validEpoch) {
      issues.push('provenance perimeter.declaredLock.sourceDateEpoch is invalid');
    }
    for (const name of ['locale', 'timezone']) {
      if (typeof value.declaredLock[name] !== 'string' || !value.declaredLock[name]) issues.push(`provenance perimeter.declaredLock.${name} is required`);
    }
    if (!isRecord(value.declaredLock.required)) issues.push('provenance perimeter.declaredLock.required is required');
    else for (const name of ['bun', 'ffmpeg', 'ffprobe']) {
      if (typeof value.declaredLock.required[name] !== 'string' || !value.declaredLock.required[name]) {
        issues.push(`provenance perimeter.declaredLock.required.${name} is required`);
      }
    }
    if (!isRecord(value.declaredLock.optional)) issues.push('provenance perimeter.declaredLock.optional is required');
  }
  return issues;
}

function normalizeArtifacts(artifacts, declarations = {}) {
  if (!Array.isArray(artifacts)) throw new TypeError('artifacts must be an array');
  const paths = new Set();
  const normalized = artifacts.map((artifact, index) => {
    if (!isRecord(artifact)) throw new TypeError(`artifacts[${index}] must be an object`);
    const logicalPath = normalizeLogicalPath(artifact.logicalPath);
    if (paths.has(logicalPath)) throw new TypeError(`duplicate artifact logical path '${logicalPath}'`);
    paths.add(logicalPath);
    const sourcePath = typeof artifact.sourcePath === 'string' ? resolve(artifact.sourcePath) : undefined;
    if (sourcePath && !existsSync(sourcePath)) throw new TypeError(`${logicalPath}: sourcePath is absent`);
    const bytes = sourcePath ? undefined : toBytes(artifact.bytes);
    const sizeBytes = sourcePath ? statSync(sourcePath).size : bytes.byteLength;
    const sha256 = sourcePath ? sha256File(sourcePath) : sha256Hex(bytes);
    const artifactKind = typeof artifact.artifactKind === 'string' && artifact.artifactKind ? artifact.artifactKind : 'unknown';
    if (!SHA256.test(artifact.sourceMediaSha256 ?? '')) throw new TypeError(`${logicalPath}: invalid source media digest`);
    let provenanceSha256 = artifact.provenanceSha256;
    if (!provenanceSha256 && artifact.provenance) provenanceSha256 = sha256Hex(canonicalJson(artifact.provenance));
    if (!SHA256.test(provenanceSha256 ?? '')) throw new TypeError(`${logicalPath}: invalid provenance digest`);
    let embeddedProvenance;
    let embeddedDocument;
    if (GOLDEN_ARTIFACT_KINDS.has(artifactKind)) {
      try {
        embeddedDocument = JSON.parse(sourcePath ? readFileSync(sourcePath, 'utf8') : Buffer.from(bytes).toString('utf8'));
      } catch (error) {
        throw new TypeError(`${logicalPath}: golden JSON parse failed (${error.message})`);
      }
      const validation = validateGoldenEnvelope(embeddedDocument);
      if (!validation.ok) throw new TypeError(`${logicalPath}: ${validation.issues.join('; ')}`);
      embeddedProvenance = embeddedDocument.provenance;
    }
    const audit = normalizeAuditMetadata(artifact.audit, embeddedProvenance, sha256, logicalPath);
    if (!embeddedDocument && audit.outputArtifactSha256 !== sha256) {
      throw new TypeError(`${logicalPath}: raw artifact audit output digest does not match committed bytes`);
    }
    if (embeddedDocument) {
      const documentIssues = validateIndexedGoldenDocument(embeddedDocument, {
        logicalPath,
        artifactKind,
        sourceMediaSha256: artifact.sourceMediaSha256,
        provenanceSha256,
        audit,
      }, declarations);
      if (documentIssues.length) throw new TypeError(`${logicalPath}: ${documentIssues.join('; ')}`);
    }
    return {
      logicalPath,
      artifactKind,
      bytes,
      sourcePath,
      sizeBytes,
      sha256,
      sourceMediaSha256: artifact.sourceMediaSha256,
      provenanceSha256,
      audit,
      ...(embeddedDocument ? { embeddedDocument } : {}),
    };
  });
  return normalized.sort((a, b) => compareText(a.logicalPath, b.logicalPath));
}

function normalizeAuditMetadata(value, embeddedProvenance, outputSha256, logicalPath) {
  const derived = embeddedProvenance
    ? {
        recipe: embeddedProvenance.buildDefinition?.recipe,
        bakerVersion: embeddedProvenance.runDetails?.baker,
        outputArtifactSha256: embeddedProvenance.outputArtifact?.sha256,
      }
    : value;
  if (!isRecord(derived)) throw new TypeError(`${logicalPath}: audit metadata is required`);
  if (typeof derived.recipe !== 'string' || !derived.recipe) throw new TypeError(`${logicalPath}: audit recipe is required`);
  if (typeof derived.bakerVersion !== 'string' || !derived.bakerVersion) throw new TypeError(`${logicalPath}: audit bakerVersion is required`);
  const payloadDigest = derived.outputArtifactSha256 ?? outputSha256;
  if (!SHA256.test(payloadDigest ?? '')) throw new TypeError(`${logicalPath}: audit output artifact digest is invalid`);
  return {
    recipe: derived.recipe,
    bakerVersion: derived.bakerVersion,
    outputArtifactSha256: payloadDigest,
  };
}

function normalizeAvailability(value) {
  if (!Array.isArray(value)) throw new TypeError('availability must be an array');
  const paths = new Set();
  return value.map((entry, index) => {
    if (!isRecord(entry)) throw new TypeError(`availability[${index}] must be an object`);
    const unknown = Object.keys(entry).filter((key) => !['logicalPath', 'state', 'reasonCode', 'detail'].includes(key));
    if (unknown.length) throw new TypeError(`availability[${index}] has unknown field '${unknown[0]}'`);
    const logicalPath = normalizeLogicalPath(entry.logicalPath);
    if (paths.has(logicalPath)) throw new TypeError(`duplicate availability path '${logicalPath}'`);
    paths.add(logicalPath);
    if (!['absent-expected', 'pending', 'producer-failed'].includes(entry.state)) throw new TypeError(`${logicalPath}: invalid availability state`);
    if (typeof entry.reasonCode !== 'string' || !entry.reasonCode) throw new TypeError(`${logicalPath}: reasonCode is required`);
    return {
      logicalPath,
      state: entry.state,
      reasonCode: entry.reasonCode,
      ...(typeof entry.detail === 'string' ? { detail: entry.detail } : {}),
    };
  }).sort((a, b) => compareText(a.logicalPath, b.logicalPath));
}

function assertDisjointPublicationState(artifacts, availability) {
  const readyPaths = new Set(artifacts.map((entry) => entry.logicalPath));
  for (const entry of availability) {
    if (readyPaths.has(entry.logicalPath)) {
      throw new TypeError(`logical path '${entry.logicalPath}' cannot be both an indexed entry and availability`);
    }
  }
}

function assertPublicationScopeCoverage(publicationScope, artifacts, availability) {
  const manifestEntries = artifacts.filter((entry) => entry.logicalPath === 'manifest.json');
  if (manifestEntries.length !== 1) throw new TypeError('publicationScope requires exactly one indexed manifest.json');
  let manifest;
  try {
    const artifact = manifestEntries[0];
    manifest = JSON.parse(artifact.sourcePath
      ? readFileSync(artifact.sourcePath, 'utf8')
      : Buffer.from(artifact.bytes).toString('utf8'));
  } catch (error) {
    throw new TypeError(`manifest.json: JSON parse failed (${error.message})`);
  }
  const evidenceAssets = new Map(
    artifacts
      .filter((entry) => entry.embeddedDocument)
      .map((entry) => [entry.logicalPath, entry.embeddedDocument.assetId]),
  );
  const issues = publicationCoverageIssues(publicationScope, artifacts, availability, manifest, evidenceAssets);
  if (issues.length) throw new TypeError(`publicationScope coverage invalid: ${issues.join('; ')}`);
}

function auditManifestCoverage(indexValue, manifest, evidenceAssets, issues) {
  const manifestEntry = indexValue.entries.find((entry) => entry.logicalPath === 'manifest.json');
  if (!manifestEntry) {
    issues.push('manifest.json: publicationScope requires an indexed fixture manifest');
    return;
  }
  if (!isRecord(manifest)) {
    issues.push('manifest.json: active manifest could not be read');
    return;
  }
  issues.push(...publicationCoverageIssues(
    indexValue.publicationScope,
    indexValue.entries,
    indexValue.availability,
    manifest,
    evidenceAssets,
  ));
}

function publicationCoverageIssues(publicationScope, entries, availability, manifest, evidenceAssets) {
  const issues = [];
  const manifestValidation = validateFixtureManifest(manifest);
  if (!manifestValidation.ok) {
    issues.push(`manifest.json: ${manifestValidation.issues.join('; ')}`);
    return issues;
  }
  const entriesByPath = new Map(entries.map((entry) => [entry.logicalPath, entry]));
  const availabilityByPath = new Map(availability.map((entry) => [entry.logicalPath, entry]));
  const manifestById = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const evidenceAssetIds = new Set(evidenceAssets.values());
  const selectedIds = publicationScope.mode === 'complete-corpus'
    ? new Set(manifestById.keys())
    : new Set(publicationScope.assetIds);

  if (publicationScope.mode === 'selected-assets') {
    for (const assetId of publicationScope.assetIds) {
      if (!manifestById.has(assetId) && !evidenceAssetIds.has(assetId)) {
        issues.push(`publicationScope asset '${assetId}' is not declared by the manifest or indexed evidence`);
      }
    }
  }

  for (const assetId of selectedIds) {
    const logicalPath = `media/${assetId}`;
    const indexed = entriesByPath.get(logicalPath);
    const unavailable = availabilityByPath.get(logicalPath);
    if (!indexed && !unavailable) {
      issues.push(`${logicalPath}: selected asset is neither indexed nor covered by typed availability`);
      continue;
    }
    if (!indexed) {
      const hasReadyEvidence = [...evidenceAssets.values()].includes(assetId);
      if (hasReadyEvidence) issues.push(`${logicalPath}: unavailable media cannot have ready indexed evidence`);
      continue;
    }
    if (indexed.artifactKind !== 'media') issues.push(`${logicalPath}: manifest asset entry kind must be 'media'`);
    const asset = manifestById.get(assetId);
    if (!asset) continue;
    if (!SHA256.test(asset.sha256 ?? '') || !Number.isSafeInteger(asset.sizeBytes) || asset.sizeBytes < 0) {
      issues.push(`${logicalPath}: indexed media requires manifest digest+size identity`);
      continue;
    }
    if (indexed.sha256 !== asset.sha256 || indexed.sourceMediaSha256 !== asset.sha256) {
      issues.push(`${logicalPath}: indexed digest does not match active manifest`);
    }
    if (indexed.sizeBytes !== asset.sizeBytes) {
      issues.push(`${logicalPath}: indexed size ${indexed.sizeBytes} != manifest size ${asset.sizeBytes}`);
    }
  }

  if (publicationScope.mode === 'selected-assets') {
    for (const asset of manifest.assets) {
      if (selectedIds.has(asset.id)) continue;
      const mediaPath = `media/${asset.id}`;
      if (entriesByPath.has(mediaPath) || availabilityByPath.has(mediaPath)) {
        issues.push(`${mediaPath}: manifest asset is indexed outside selected-assets scope`);
      }
    }
    for (const [logicalPath, assetId] of evidenceAssets) {
      if (!selectedIds.has(assetId)) issues.push(`${logicalPath}: evidence asset '${assetId}' is outside selected-assets scope`);
    }
    for (const logicalPath of availabilityByPath.keys()) {
      const assetId = inferEvidenceAssetId(logicalPath);
      if (assetId && (manifestById.has(assetId) || evidenceAssetIds.has(assetId)) && !selectedIds.has(assetId)) {
        issues.push(`${logicalPath}: evidence availability is outside selected-assets scope`);
      }
    }
  }

  for (const [logicalPath, assetId] of evidenceAssets) {
    if (!selectedIds.has(assetId) && publicationScope.mode === 'complete-corpus' && !entriesByPath.has(`media/${assetId}`)) {
      issues.push(`${logicalPath}: evidence asset '${assetId}' has no indexed media in complete-corpus scope`);
      continue;
    }
    const media = entriesByPath.get(`media/${assetId}`);
    const evidence = entriesByPath.get(logicalPath);
    if (media && evidence && evidence.sourceMediaSha256 !== media.sha256) {
      issues.push(`${logicalPath}: evidence source digest does not match media/${assetId}`);
    }
  }
  return issues;
}

function inferEvidenceAssetId(logicalPath) {
  if (!logicalPath.startsWith('golden/')) return undefined;
  const relative = logicalPath.slice('golden/'.length);
  for (const suffix of ['.meta.json', '.packets.json', '.frames.json', '.ssim.json', '.keys.json', '.segments.json', '.resources.json']) {
    if (relative.endsWith(suffix)) return relative.slice(0, -suffix.length);
  }
  return undefined;
}

function auditFixtureDeclarations(root, issues) {
  const seedPath = join(root, 'fixture-seed.json');
  const toolchainPath = join(root, 'toolchain.lock.json');
  const seedPresent = existsSync(seedPath);
  const toolchainPresent = existsSync(toolchainPath);
  if (!seedPresent && !toolchainPresent) return {};
  if (!seedPresent) issues.push('fixture-seed.json: committed deterministic seed declaration is absent');
  if (!toolchainPresent) issues.push('toolchain.lock.json: committed tool/environment declaration is absent');
  let seed;
  let toolchain;
  if (seedPresent) {
    try { seed = JSON.parse(readFileSync(seedPath, 'utf8')); }
    catch (error) { issues.push(`fixture-seed.json: JSON parse failed (${error.message})`); }
  }
  if (toolchainPresent) {
    try { toolchain = JSON.parse(readFileSync(toolchainPath, 'utf8')); }
    catch (error) { issues.push(`toolchain.lock.json: JSON parse failed (${error.message})`); }
  }
  for (const issue of validateFixtureSeedDocument(seed)) issues.push(`fixture-seed.json: ${issue}`);
  for (const issue of validateToolchainLockDocument(toolchain)) issues.push(`toolchain.lock.json: ${issue}`);
  const schemaPaths = [
    ['fixture-seed.json', seed?.$schema],
    ['toolchain.lock.json', toolchain?.$schema],
  ];
  for (const [label, relativeSchema] of schemaPaths) {
    if (typeof relativeSchema !== 'string') continue;
    const schemaPath = resolve(root, relativeSchema);
    if (schemaPath !== root && !schemaPath.startsWith(root + sep)) issues.push(`${label}: schema path escapes fixture root`);
    else if (!existsSync(schemaPath)) issues.push(`${label}: declared schema '${relativeSchema}' is absent`);
  }
  return {
    ...(toolchainPresent ? { toolchainSha256: sha256File(toolchainPath) } : {}),
    ...(seedPresent ? { fixtureSeedSha256: sha256File(seedPath) } : {}),
  };
}

export function validateFixtureSeedDocument(value) {
  const issues = [];
  if (!isRecord(value)) return ['document must be an object'];
  if (value.$schema !== './schemas/fixture-seed-v1.schema.json') issues.push('$schema is not the v1 fixture-seed schema');
  if (value.schemaVersion !== 'media-test/fixture-seed@1') issues.push('schemaVersion is unknown or unsupported');
  if (typeof value.seedId !== 'string' || !value.seedId) issues.push('seedId is required');
  if (!SHA256.test(value.seedHex ?? '')) issues.push('seedHex must be a lowercase 32-byte value');
  if (typeof value.purpose !== 'string' || !value.purpose) issues.push('purpose is required');
  const allowed = new Set(['$schema', 'schemaVersion', 'seedId', 'seedHex', 'purpose']);
  for (const key of Object.keys(value)) if (!allowed.has(key)) issues.push(`unknown field '${key}'`);
  return issues;
}

export function validateToolchainLockDocument(value) {
  const issues = [];
  if (!isRecord(value)) return ['document must be an object'];
  if (value.$schema !== './schemas/toolchain-perimeter-v1.schema.json') issues.push('$schema is not the v1 toolchain schema');
  if (value.schemaVersion !== 'media-test/toolchain-perimeter@1') issues.push('schemaVersion is unknown or unsupported');
  if (!Number.isSafeInteger(value.sourceDateEpoch) || value.sourceDateEpoch < 0) issues.push('sourceDateEpoch is invalid');
  for (const name of ['locale', 'timezone']) {
    if (typeof value[name] !== 'string' || !value[name]) issues.push(`${name} is required`);
  }
  if (!isRecord(value.required)) issues.push('required tool versions are missing');
  else for (const name of ['bun', 'ffmpeg', 'ffprobe']) {
    if (typeof value.required[name] !== 'string' || !value.required[name]) issues.push(`required.${name} is required`);
  }
  if (!isRecord(value.optional)) issues.push('optional tool policy is required');
  const requiredEnvironment = ['SOURCE_DATE_EPOCH', 'LANG', 'LC_ALL', 'TZ', 'BRAVE_PATH', 'FFMPEG_PATH', 'FFPROBE_PATH'];
  if (!Array.isArray(value.environmentVariables)) issues.push('environmentVariables must be an array');
  else {
    const actual = new Set(value.environmentVariables);
    if (actual.size !== value.environmentVariables.length) issues.push('environmentVariables must be unique');
    for (const name of requiredEnvironment) if (!actual.has(name)) issues.push(`environmentVariables must include '${name}'`);
  }
  const allowed = new Set(['$schema', 'schemaVersion', 'sourceDateEpoch', 'locale', 'timezone', 'required', 'optional', 'environmentVariables']);
  for (const key of Object.keys(value)) if (!allowed.has(key)) issues.push(`unknown field '${key}'`);
  return issues;
}

function verifyImmutableDirectory(directory, artifacts) {
  for (const artifact of artifacts) {
    const path = safeGenerationPath(directory, artifact.logicalPath);
    if (!existsSync(path)) throw new Error(`immutable generation is incomplete: '${artifact.logicalPath}' absent`);
    const stats = statSync(path);
    if (stats.size !== artifact.sizeBytes || sha256File(path) !== artifact.sha256) {
      throw new Error(`immutable generation collision for '${artifact.logicalPath}'`);
    }
  }
}

function durableWrite(path, bytes) {
  const fd = openSync(path, 'wx', 0o644);
  try {
    let offset = 0;
    while (offset < bytes.byteLength) offset += writeSync(fd, bytes, offset, bytes.byteLength - offset);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function durableWriteArtifact(path, artifact) {
  if (!artifact.sourcePath) {
    durableWrite(path, artifact.bytes);
    return;
  }
  const sourceFd = openSync(artifact.sourcePath, 'r');
  const targetFd = openSync(path, 'wx', 0o644);
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    for (;;) {
      const count = readSync(sourceFd, buffer, 0, buffer.byteLength, position);
      if (count === 0) break;
      let written = 0;
      while (written < count) written += writeSync(targetFd, buffer, written, count - written);
      position += count;
    }
    fsyncSync(targetFd);
  } finally {
    closeSync(sourceFd);
    closeSync(targetFd);
  }
}

function syncDirectoryTree(directory) {
  // Every file is synchronized by durableWrite. Synchronizing the leaf/root directories makes their
  // directory entries durable before the generation directory is published.
  fsyncDirectory(directory);
}

function fsyncDirectory(directory) {
  let fd;
  try {
    fd = openSync(directory, 'r');
    fsyncSync(fd);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function safeGenerationPath(root, logicalPath) {
  const normalized = normalizeLogicalPath(logicalPath);
  const path = resolve(root, normalized);
  if (path !== root && !path.startsWith(root + sep)) throw new TypeError(`path '${logicalPath}' escapes generation root`);
  return path;
}

function normalizeLogicalPath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.startsWith('/')) throw new TypeError('must be a safe relative path');
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) throw new TypeError('must not contain empty/dot segments');
  return parts.join('/');
}

function toBytes(value) {
  if (typeof value === 'string') return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  throw new TypeError('artifact bytes must be string, Uint8Array, or ArrayBuffer');
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function validIso(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function rejectUnknownKeys(value, allowedKeys, label, issues) {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) if (!allowed.has(key)) issues.push(`${label}.${key} is unknown`);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
