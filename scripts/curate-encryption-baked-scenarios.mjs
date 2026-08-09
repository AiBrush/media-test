#!/usr/bin/env bun

/**
 * Materialize the ignored baked mirrors used by every live encryption scenario.
 *
 * Flat manifest-bound media and pinned HLS resource indices are authoritative. This curator only
 * copies those verified bytes into `fixtures/media/scenarios/<live-id>/`; an unmanifested asset is
 * reported as pending and is never copied or accepted as ready. It never derives or synthesizes media.
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

import { hlsResourceIndexFromOptions } from '../src/features/encryption/hls-resource-index.ts';
import { encryptionScenarios } from '../src/scenarios/encryption/index.ts';
import { validatePinnedHlsResourceClosure } from '../fixtures/lib/hls-resource-fixtures.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const ENCRYPTION_BAKED_SCENARIO_TARGETS = Object.freeze(
  encryptionScenarios.flatMap((scenario) => {
    const inputs = Array.isArray(scenario.input) ? scenario.input : [scenario.input];
    return inputs.map((assetId) => Object.freeze({
      scenarioId: scenario.id,
      assetId,
      resourceIndex: hlsResourceIndexFromOptions(scenario.options),
    }));
  }),
);

/** Atomically refresh all verified mirrors and return a stable ready/pending report. */
export function curateEncryptionBakedScenarios(root = ROOT) {
  const manifest = readManifest(root);
  const reports = [];

  for (const target of ENCRYPTION_BAKED_SCENARIO_TARGETS) {
    const targetDirectory = join(root, 'fixtures/media/scenarios', target.scenarioId);
    const targetMedia = safeResolve(targetDirectory, target.assetId);
    const declared = manifestIdentity(manifest, target.assetId);
    if (declared === undefined) {
      reports.push({
        scenarioId: target.scenarioId,
        assetId: target.assetId,
        state: 'pending',
        reasonCode: 'ENCRYPTION_BAKED_ASSET_NOT_MANIFESTED',
        media: null,
        resources: [],
      });
      continue;
    }

    const sourceMedia = safeResolve(join(root, 'fixtures/media'), target.assetId);
    assertIdentity(sourceMedia, declared, `${target.assetId} flat media`);
    atomicCopyVerified(sourceMedia, targetMedia, declared);

    const resources = [];
    if (target.resourceIndex !== undefined) {
      const expectedIndexPath = `/fixtures/golden/${target.assetId}.resources.json`;
      if (target.resourceIndex !== expectedIndexPath) {
        throw new Error(
          `${target.scenarioId}: resource index '${target.resourceIndex}' does not match '${expectedIndexPath}'`,
        );
      }
      const index = validatePinnedHlsResourceClosure({
        assetId: target.assetId,
        mediaPath: sourceMedia,
        goldenDir: join(root, 'fixtures/golden'),
      });
      for (const resource of index.resources) {
        const expected = { sha256: resource.sha256, sizeBytes: resource.sizeBytes };
        const source = safeResolve(join(root, 'fixtures/media'), resource.uri);
        const destination = safeResolve(targetDirectory, resource.uri);
        assertIdentity(source, expected, `${target.assetId} ${resource.role} '${resource.uri}' source`);
        atomicCopyVerified(source, destination, expected);
        resources.push({ role: resource.role, uri: resource.uri, ...expected });
      }
    }
    reports.push({
      scenarioId: target.scenarioId,
      assetId: target.assetId,
      state: 'ready',
      media: declared,
      resources,
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
  if (matches.length === 0) return undefined;
  if (matches.length !== 1) {
    throw new Error(`${assetId}: expected at most one fixtures/manifest.json entry, got ${matches.length}`);
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
    throw new Error(`${child}: resource path escapes ${normalizedBase}`);
  }
  return candidate;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  const reports = curateEncryptionBakedScenarios();
  const ready = reports.filter((report) => report.state === 'ready');
  const pending = reports.filter((report) => report.state === 'pending');
  console.log(`curated ${ready.length} manifest-bound live encryption mirrors; ${pending.length} pending`);
  for (const report of pending) {
    console.log(`${report.scenarioId}: pending (${report.reasonCode})`);
  }
}
