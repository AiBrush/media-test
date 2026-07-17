/** Offline provenance/envelope contract shared by both fixture bake entry points. */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { arch, platform, release } from 'node:os';
import { canonicalJson, canonicalSha256, sha256Hex } from './golden-normalization.mjs';

export const GOLDEN_ARTIFACT_SCHEMA = 'media-test/golden-artifact@1';
export const GOLDEN_PROVENANCE_SCHEMA = 'media-test/golden-provenance@1';
export const GENERATION_INDEX_SCHEMA = 'media-test/fixture-generation-index@1';
export const AVAILABILITY_RECORD_SCHEMA = 'media-test/fixture-availability@1';
export const GOLDEN_SCHEMA_VERSION = '1.0.0';

export const GOLDEN_ARTIFACT_KINDS = Object.freeze([
  'metadata',
  'packets',
  'frames',
  'ssim',
  'keys',
  'segments',
  'availability',
]);

export const FIXTURE_AVAILABILITY_STATES = Object.freeze([
  'ready',
  'absent-expected',
  'pending',
  'producer-failed',
]);

const SHA256 = /^[0-9a-f]{64}$/;

export function toolVersion(binary, args = ['-version']) {
  const result = spawnSync(binary, args, { encoding: 'utf8' });
  const output = String(result.stdout || result.stderr || '').trim();
  // Several optional media tools print their version banner and usage with exit 1 when invoked
  // without an input. A recorded banner is positive perimeter evidence; spawn ENOENT is not.
  if (result.status !== 0 && !/\bversion\b/i.test(output)) return { state: 'absent' };
  const line = output.split(/\r?\n/)[0]?.trim() || 'unknown';
  return { state: 'present', executable: binary, versionOutput: line, exitStatus: result.status ?? 0 };
}

/** Record every relevant tool/environment input. Values are explicit, never inferred later. */
export function collectToolPerimeter(overrides = {}) {
  const envNames = [
    'SOURCE_DATE_EPOCH',
    'LANG',
    'LC_ALL',
    'TZ',
    'BRAVE_PATH',
    'FFMPEG_PATH',
    'FFPROBE_PATH',
  ];
  const environment = {};
  for (const name of envNames) environment[name] = process.env[name] ?? null;
  const bunVersion = typeof Bun !== 'undefined' ? Bun.version : process.versions.bun ?? null;
  return {
    schemaVersion: 'tool-perimeter@1',
    tools: {
      bun: { state: bunVersion ? 'present' : 'absent', executable: process.execPath, versionOutput: bunVersion },
      ffmpeg: toolVersion(process.env.FFMPEG_PATH || 'ffmpeg'),
      ffprobe: toolVersion(process.env.FFPROBE_PATH || 'ffprobe'),
      bento4: toolVersion('mp4encrypt', []),
      bento4Hls: toolVersion('mp42hls', []),
      shakaPackager: toolVersion(toolAvailable('packager') ? 'packager' : 'shaka-packager', ['--version']),
      playwright: overrides.playwright ?? { state: 'not-applicable' },
      browser: overrides.browser ?? { state: 'not-applicable' },
    },
    platform: {
      os: platform(),
      release: release(),
      arch: arch(),
      locale: process.env.LC_ALL || process.env.LANG || 'unconfigured',
      timezone: process.env.TZ || 'unconfigured',
    },
    environment,
  };
}

function toolAvailable(binary) {
  const command = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(command, [binary], { encoding: 'utf8' }).status === 0;
}

/** Deterministic test-only material derived from the committed seed and a stable label. */
export function deterministicFixtureBytes(seedHex, label, length) {
  if (!SHA256.test(seedHex)) throw new TypeError('fixture seed must be a lowercase 32-byte hex value');
  if (typeof label !== 'string' || !label) throw new TypeError('fixture material label must be non-empty');
  if (!Number.isSafeInteger(length) || length < 0) throw new TypeError('fixture material length must be a non-negative safe integer');
  const chunks = [];
  let produced = 0;
  for (let counter = 0; produced < length; counter++) {
    const hash = createHash('sha256')
      .update(Buffer.from(seedHex, 'hex'))
      .update(Buffer.from('\0media-test-fixture\0'))
      .update(Buffer.from(label))
      .update(Buffer.from(`\0${counter}`))
      .digest();
    chunks.push(hash);
    produced += hash.byteLength;
  }
  return Buffer.concat(chunks).subarray(0, length);
}

export function deterministicIso(sourceDateEpoch = process.env.SOURCE_DATE_EPOCH) {
  const seconds = Number(sourceDateEpoch ?? 0);
  if (!Number.isSafeInteger(seconds) || seconds < 0) {
    throw new TypeError('SOURCE_DATE_EPOCH must be a non-negative integer for reproducible publication');
  }
  return new Date(seconds * 1000).toISOString();
}

export function createGoldenProvenance({
  artifactKind,
  assetId,
  sourceMedia,
  recipe,
  normalizedArguments,
  dependencies = [],
  baker,
  perimeter,
  payload,
  sourceDateEpoch,
  browserQualified = false,
}) {
  const time = deterministicIso(sourceDateEpoch);
  const payloadText = canonicalJson(payload);
  const payloadBytes = Buffer.from(payloadText);
  const provenance = {
    schema: GOLDEN_PROVENANCE_SCHEMA,
    schemaVersion: GOLDEN_SCHEMA_VERSION,
    artifactKind,
    assetId,
    sourceMedia: {
      sha256: sourceMedia.sha256,
      sizeBytes: sourceMedia.sizeBytes,
    },
    buildDefinition: {
      recipe,
      normalizedArguments,
      normalizedArgumentsSha256: canonicalSha256(normalizedArguments),
      dependencies: [...dependencies]
        .map((entry) => ({ logicalId: entry.logicalId, sha256: entry.sha256, sizeBytes: entry.sizeBytes }))
        .sort((a, b) => a.logicalId.localeCompare(b.logicalId)),
    },
    runDetails: {
      baker,
      perimeter,
      startedAtIso: time,
      finishedAtIso: time,
      timeMode: 'source-date-epoch',
      browserQualified,
    },
    outputArtifact: {
      digestScope: 'canonical-payload',
      sha256: sha256Hex(payloadBytes),
      sizeBytes: payloadBytes.byteLength,
    },
  };
  const validation = validateGoldenProvenance(provenance);
  if (!validation.ok) throw new TypeError(validation.issues.join('; '));
  return provenance;
}

/**
 * Wrap a payload without removing its legacy consumer key. Runtime can migrate atomically: old
 * readers unwrap `metadata`/`packets`/`frames`/`sigs`; new readers validate `payload+provenance`.
 */
export function createGoldenEnvelope({
  artifactKind,
  assetId,
  sourceMedia,
  payload,
  legacy = {},
  provenance,
  availability = { state: 'ready' },
}) {
  const envelope = {
    schema: GOLDEN_ARTIFACT_SCHEMA,
    schemaVersion: GOLDEN_SCHEMA_VERSION,
    artifactKind,
    assetId,
    sourceMedia: { sha256: sourceMedia.sha256, sizeBytes: sourceMedia.sizeBytes },
    availability,
    provenance,
    payload,
    ...legacy,
  };
  const validation = validateGoldenEnvelope(envelope);
  if (!validation.ok) throw new TypeError(validation.issues.join('; '));
  return envelope;
}

export function createAvailabilityRecord({ artifactKind, assetId, sourceMedia, state, reasonCode, detail, provenance }) {
  if (!FIXTURE_AVAILABILITY_STATES.includes(state)) throw new TypeError(`unknown fixture availability state '${state}'`);
  return {
    schema: AVAILABILITY_RECORD_SCHEMA,
    schemaVersion: GOLDEN_SCHEMA_VERSION,
    artifactKind,
    assetId,
    sourceMedia,
    state,
    reasonCode,
    detail,
    provenance,
  };
}

export function validateGoldenEnvelope(value) {
  const issues = [];
  if (!isRecord(value)) return { ok: false, issues: ['artifact must be an object'] };
  validateSupportedSchema(value, GOLDEN_ARTIFACT_SCHEMA, issues, 'artifact');
  if (!GOLDEN_ARTIFACT_KINDS.includes(value.artifactKind)) issues.push('artifactKind is unsupported');
  if (typeof value.assetId !== 'string' || !value.assetId) issues.push('assetId is required');
  validateDigestSubject(value.sourceMedia, 'sourceMedia', issues);
  if (!isRecord(value.availability) || !FIXTURE_AVAILABILITY_STATES.includes(value.availability.state)) {
    issues.push('availability.state is invalid');
  }
  if (!('payload' in value)) issues.push('payload is required');
  issues.push(...validateGoldenProvenance(value.provenance).issues);
  return { ok: issues.length === 0, issues };
}

export function validateGoldenProvenance(value) {
  const issues = [];
  if (!isRecord(value)) return { ok: false, issues: ['provenance must be an object'] };
  validateSupportedSchema(value, GOLDEN_PROVENANCE_SCHEMA, issues, 'provenance');
  if (!GOLDEN_ARTIFACT_KINDS.includes(value.artifactKind)) issues.push('provenance.artifactKind is unsupported');
  if (typeof value.assetId !== 'string' || !value.assetId) issues.push('provenance.assetId is required');
  validateDigestSubject(value.sourceMedia, 'provenance.sourceMedia', issues);
  if (!isRecord(value.buildDefinition)) issues.push('provenance.buildDefinition is required');
  else {
    if (typeof value.buildDefinition.recipe !== 'string' || !value.buildDefinition.recipe) issues.push('provenance recipe is required');
    if (!SHA256.test(value.buildDefinition.normalizedArgumentsSha256 ?? '')) issues.push('provenance normalized argument digest is invalid');
    if (!Array.isArray(value.buildDefinition.dependencies)) issues.push('provenance dependencies must be an array');
  }
  if (!isRecord(value.runDetails)) issues.push('provenance.runDetails is required');
  else {
    if (typeof value.runDetails.baker !== 'string' || !value.runDetails.baker) issues.push('provenance baker is required');
    if (!isRecord(value.runDetails.perimeter)) issues.push('provenance perimeter is required');
    if (!validIso(value.runDetails.startedAtIso) || !validIso(value.runDetails.finishedAtIso)) issues.push('provenance start/end timestamps are invalid');
  }
  validateDigestSubject(value.outputArtifact, 'provenance.outputArtifact', issues);
  return { ok: issues.length === 0, issues };
}

export function validateFixtureManifest(value) {
  const issues = [];
  if (!isRecord(value)) return { ok: false, issues: ['manifest must be an object'] };
  if (value.$schema !== './schemas/fixture-manifest-v1.schema.json') issues.push('manifest $schema is not the versioned fixture schema');
  if (typeof value.suiteCorpusVersion !== 'string' || !value.suiteCorpusVersion) issues.push('suiteCorpusVersion is required');
  if (!Array.isArray(value.assets)) issues.push('assets must be an array');
  const ids = new Set();
  for (const [index, asset] of (Array.isArray(value.assets) ? value.assets : []).entries()) {
    if (!isRecord(asset)) { issues.push(`assets[${index}] must be an object`); continue; }
    if (typeof asset.id !== 'string' || !asset.id) issues.push(`assets[${index}].id is required`);
    else if (ids.has(asset.id)) issues.push(`duplicate asset id '${asset.id}'`);
    else ids.add(asset.id);
    if (!['generated', 'fetched', 'provided', 'captured'].includes(asset.source)) issues.push(`assets[${index}].source is invalid`);
    const absent = asset.sha256 === null && asset.sizeBytes === null;
    const ready = SHA256.test(asset.sha256 ?? '') && Number.isSafeInteger(asset.sizeBytes) && asset.sizeBytes >= 0;
    if (!absent && !ready) issues.push(`assets[${index}] must declare digest+size together or explicit null absence`);
  }
  return { ok: issues.length === 0, issues };
}

export function validateSupportedSchema(value, expectedSchema, issues = [], label = 'document') {
  if (!isRecord(value)) { issues.push(`${label} must be an object`); return issues; }
  if (value.schema !== expectedSchema) issues.push(`${label}.schema must equal '${expectedSchema}'`);
  const version = typeof value.schemaVersion === 'string' ? value.schemaVersion : '';
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) issues.push(`${label}.schemaVersion must be semantic version text`);
  else if (Number(match[1]) !== 1) issues.push(`${label} schema major ${match[1]} is unsupported`);
  return issues;
}

function validateDigestSubject(value, label, issues) {
  if (!isRecord(value)) { issues.push(`${label} is required`); return; }
  if (!SHA256.test(value.sha256 ?? '')) issues.push(`${label}.sha256 is invalid`);
  if (!Number.isSafeInteger(value.sizeBytes) || value.sizeBytes < 0) issues.push(`${label}.sizeBytes is invalid`);
}

function validIso(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
