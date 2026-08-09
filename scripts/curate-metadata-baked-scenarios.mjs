#!/usr/bin/env bun

/**
 * Refresh the manifest-bound baked mirrors whose metadata contracts depend on the authored 90°
 * display matrix. Browser-qualified decoded-frame publication remains a separate frame-bake step.
 */

import { createHash } from 'node:crypto';
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GOLDEN_KINDS = Object.freeze(['meta', 'packets']);

export const METADATA_BAKED_SCENARIO_TARGETS = Object.freeze([
  Object.freeze({
    scenarioId: 'metadata/rotation_decode_read_h264_rotated90',
    assetId: 'h264_rotated90.mp4',
  }),
  Object.freeze({
    scenarioId: 'metadata/rotation_survives_mp4_mkv',
    assetId: 'h264_rotated90.mp4',
  }),
]);

/** Atomically refresh the two authored-rotation mirrors and their neutral probe goldens. */
export function curateMetadataBakedScenarios(root = ROOT) {
  const manifest = readManifest(root);
  const reports = [];

  for (const target of METADATA_BAKED_SCENARIO_TARGETS) {
    const declared = manifestIdentity(manifest, target.assetId);
    if (declared === undefined) {
      reports.push({
        scenarioId: target.scenarioId,
        assetId: target.assetId,
        state: 'pending',
        reasonCode: 'METADATA_BAKED_ASSET_NOT_BAKED',
        media: null,
        goldens: {},
      });
      continue;
    }

    const sourceMedia = safeResolve(join(root, 'fixtures/media'), target.assetId);
    const targetDirectory = safeResolve(join(root, 'fixtures/media/scenarios'), target.scenarioId);
    const targetMedia = safeResolve(targetDirectory, target.assetId);
    assertIdentity(sourceMedia, declared, `${target.assetId} flat media`);
    atomicCopyVerified(sourceMedia, targetMedia, declared);

    const goldens = {};
    for (const kind of GOLDEN_KINDS) {
      const source = safeResolve(join(root, 'fixtures/golden'), `${target.assetId}.${kind}.json`);
      const destination = safeResolve(
        join(root, 'fixtures/golden/scenarios', target.scenarioId),
        `${target.assetId}.${kind}.json`,
      );
      const expected = identityOf(source);
      atomicCopyVerified(source, destination, expected);
      goldens[kind] = expected;
    }

    reports.push({
      scenarioId: target.scenarioId,
      assetId: target.assetId,
      state: 'ready',
      media: declared,
      goldens,
    });
  }

  return reports;
}

function readManifest(root) {
  const manifestPath = join(root, 'fixtures/manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!manifest || !Array.isArray(manifest.assets)) {
    throw new Error(`${manifestPath}: expected an assets array`);
  }
  return manifest;
}

function manifestIdentity(manifest, assetId) {
  const matches = manifest.assets.filter((asset) => asset?.id === assetId);
  if (matches.length !== 1) {
    throw new Error(`${assetId}: expected exactly one fixtures/manifest.json entry, got ${matches.length}`);
  }
  const [{ sha256, sizeBytes }] = matches;
  if (sha256 === null && sizeBytes === null) return undefined;
  if (!/^[0-9a-f]{64}$/u.test(sha256) || !Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
    throw new Error(`${assetId}: manifest identity must be a digest+size pair or an explicit null pair`);
  }
  return { sha256, sizeBytes };
}

function identityOf(path) {
  const before = statSync(path);
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const fd = openSync(path, 'r');
  let sizeBytes = 0;
  try {
    while (true) {
      const bytesRead = readSync(fd, buffer, 0, buffer.byteLength, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      sizeBytes += bytesRead;
    }
  } finally {
    closeSync(fd);
  }
  const after = statSync(path);
  if (
    sizeBytes !== before.size ||
    after.size !== before.size ||
    after.mtimeMs !== before.mtimeMs ||
    after.ctimeMs !== before.ctimeMs ||
    after.ino !== before.ino
  ) {
    throw new Error(`${path}: file changed while hashing`);
  }
  return { sha256: hash.digest('hex'), sizeBytes };
}

function assertIdentity(path, expected, label = path) {
  const actual = identityOf(path);
  if (actual.sha256 !== expected.sha256 || actual.sizeBytes !== expected.sizeBytes) {
    throw new Error(
      `${label}: expected ${expected.sha256}/${expected.sizeBytes}, got ${actual.sha256}/${actual.sizeBytes}`,
    );
  }
}

let temporaryCounter = 0;
function atomicCopyVerified(source, destination, expected) {
  assertIdentity(source, expected, `${source} source`);
  mkdirSync(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${temporaryCounter++}.tmp`;
  try {
    copyFileSync(source, temporary);
    assertIdentity(temporary, expected, `${destination} temporary copy`);
    renameSync(temporary, destination);
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { force: true });
  }
  assertIdentity(destination, expected, `${destination} curated copy`);
}

function safeResolve(base, child) {
  const normalizedBase = resolve(base);
  const candidate = resolve(normalizedBase, child);
  if (candidate !== normalizedBase && !candidate.startsWith(`${normalizedBase}${sep}`)) {
    throw new Error(`${child}: path escapes ${normalizedBase}`);
  }
  return candidate;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  const reports = curateMetadataBakedScenarios();
  const ready = reports.filter((report) => report.state === 'ready');
  const pending = reports.filter((report) => report.state === 'pending');
  console.log(`curated ${ready.length} manifest-bound baked metadata scenario members; ${pending.length} pending`);
  for (const report of pending) console.log(`${report.scenarioId}: pending (${report.reasonCode})`);
}
