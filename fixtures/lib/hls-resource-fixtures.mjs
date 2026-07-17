/** Shared offline validation for the committed HLS playlist resource closures. */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import {
  inspectHlsResourceReferences,
  parseHlsResourceIndex,
} from '../../src/features/encryption/hls-resource-index.ts';

export const HLS_RESOURCE_FIXTURE_IDS = Object.freeze([
  'hls_aes128.m3u8',
  'hls_sample_aes.m3u8',
  'hls_aes128_seq0.m3u8',
  'hls_aes128_seq42.m3u8',
  'hls_aes128_rotation.m3u8',
  'hls_aes128_method_none.m3u8',
]);

export function identityBytes(bytes) {
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.byteLength,
  };
}

/**
 * Prove that a playlist, its committed index, and every referenced local sidecar agree exactly.
 * This is deliberately the same strict parser used by runtime preflight; offline fallback decisions
 * must never call a corrupt SAMPLE-AES fixture merely "decoder unavailable".
 */
export function validatePinnedHlsResourceClosure({ assetId, mediaPath, goldenDir }) {
  const rootAssetId = basename(assetId);
  if (!HLS_RESOURCE_FIXTURE_IDS.includes(rootAssetId)) {
    throw new TypeError(`'${rootAssetId}' is not a pinned HLS resource fixture`);
  }
  const playlistBytes = readFileSync(mediaPath);
  const indexPath = join(goldenDir, `${rootAssetId}.resources.json`);
  const index = parseHlsResourceIndex(JSON.parse(readFileSync(indexPath, 'utf8')));
  const playlistIdentity = identityBytes(playlistBytes);
  if (index.playlist.assetId !== rootAssetId ||
      index.playlist.sha256 !== playlistIdentity.sha256 ||
      index.playlist.sizeBytes !== playlistIdentity.sizeBytes) {
    throw new Error(`${rootAssetId}: resource index does not bind the selected playlist bytes`);
  }
  const references = inspectHlsResourceReferences(playlistBytes.toString('utf8'));
  if (references.length !== index.resources.length) {
    throw new Error(`${rootAssetId}: resource index closure cardinality mismatch`);
  }
  for (let position = 0; position < references.length; position++) {
    const reference = references[position];
    const resource = index.resources[position];
    if (reference.role !== resource.role || reference.uri !== resource.uri) {
      throw new Error(`${rootAssetId}: resource index order mismatch at ${position}`);
    }
    const actual = identityBytes(readFileSync(join(dirname(mediaPath), resource.uri)));
    if (actual.sha256 !== resource.sha256 || actual.sizeBytes !== resource.sizeBytes) {
      throw new Error(`${rootAssetId}: resource '${resource.uri}' digest/size mismatch`);
    }
  }
  return index;
}
