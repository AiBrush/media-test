#!/usr/bin/env bun
/** Audit the active immutable fixture generation and its provenance cross-references. */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditGeneration } from './lib/generation-publication.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const indexPath = join(root, 'generation-index.json');
let index;
let readError;
if (existsSync(indexPath)) {
  try {
    index = JSON.parse(readFileSync(indexPath, 'utf8'));
  } catch (error) {
    readError = error instanceof Error ? error.message : String(error);
  }
}
if (!existsSync(indexPath)) {
  console.error('fixture audit failed: fixtures/generation-index.json is absent; run the bake first');
  process.exitCode = 1;
} else if (readError) {
  console.error(`fixture audit failed: generation index JSON is invalid (${readError})`);
  process.exitCode = 1;
} else {
  const result = auditGeneration(root, index);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({
      generationId: index.generationId,
      publicationScope: index.publicationScope,
      ...result,
    }, null, 2));
    if (!result.ok) process.exitCode = 1;
  } else if (result.ok) {
    console.log(`fixture generation ${index.generationId}: ${result.checked} artifact(s) verified`);
    console.log(`scope=${index.publicationScope.mode}${index.publicationScope.assetIds ? ` (${index.publicationScope.assetIds.join(', ')})` : ''}`);
    for (const record of result.records) {
      console.log(
        `${record.logicalPath}\n` +
        `  source=${record.sourceMediaSha256}\n` +
        `  recipe=${record.recipe}\n` +
        `  baker=${record.bakerVersion}\n` +
        `  output=${record.outputArtifactSha256}\n` +
        `  committed=${record.committedFileSha256}` +
        (record.normalizedArgumentsSha256 ? `\n  arguments=${record.normalizedArgumentsSha256}` : '') +
        (record.toolchainLockSha256 ? `\n  toolchain=${record.toolchainLockSha256}` : '') +
        (record.resolvedDependencies?.length ? `\n  dependencies=${JSON.stringify(record.resolvedDependencies)}` : ''),
      );
    }
  } else {
    console.error(`fixture generation ${index.generationId}: audit failed`);
    for (const issue of result.issues) console.error(`  - ${issue}`);
    process.exitCode = 1;
  }
}
