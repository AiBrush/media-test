#!/usr/bin/env bun
/** Reproduce HLS encryption boundary fixtures and their exact source-bound resource-closure indices. */

import { createCipheriv, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deterministicFixtureBytes } from './lib/golden-contract.mjs';
import { inspectHlsResourceReferences, parseHlsResourceIndex } from '../src/features/encryption/hls-resource-index.ts';

const FIXTURES = dirname(fileURLToPath(import.meta.url));
const MEDIA = join(FIXTURES, 'media');
const GOLDEN = join(FIXTURES, 'golden');
const MANIFEST = join(FIXTURES, 'manifest.json');
const seed = JSON.parse(readFileSync(join(FIXTURES, 'fixture-seed.json'), 'utf8')).seedHex;
const clearSegments = [0, 1, 2, 3, 4].map((index) => readFileSync(join(MEDIA, `hls_vod_${String(index).padStart(3, '0')}.ts`)));

const BASE_KEYS = {
  seq0: Buffer.from('102132435465768798a9bacbdcedfe0f', 'hex'),
  seq42: Buffer.from('2031425364758697a8b9cadbecfd0e1f', 'hex'),
  rotationA: Buffer.from('30415263748596a7b8c9daebfc0d1e2f', 'hex'),
  rotationB: deterministicFixtureBytes(seed, 'hls_aes128_rotation:key-b', 16),
  methodNone: Buffer.from('405162738495a6b7c8d9eafb0c1d2e3f', 'hex'),
};

// The committed SAMPLE-AES source was produced by Bento4 mp42hls. Copying these exact bytes is
// preferable to pretending full-segment AES-128 is SAMPLE-AES.
copySampleAesFixture();
writeAesVariant({ name: 'hls_aes128_seq0', mediaSequence: 0, keys: [
  { first: 0, method: 'AES-128', uri: 'hls_aes128_seq0.key', bytes: BASE_KEYS.seq0 },
] });
writeAesVariant({ name: 'hls_aes128_seq42', mediaSequence: 42, keys: [
  { first: 42, method: 'AES-128', uri: 'hls_aes128_seq42.key', bytes: BASE_KEYS.seq42 },
] });
writeAesVariant({ name: 'hls_aes128_rotation', mediaSequence: 7, keys: [
  { first: 7, method: 'AES-128', uri: 'hls_aes128_rotation_a.key', bytes: BASE_KEYS.rotationA },
  { first: 9, method: 'AES-128', uri: 'hls_aes128_rotation_b.key', bytes: BASE_KEYS.rotationB },
] });
writeAesVariant({ name: 'hls_aes128_method_none', mediaSequence: 3, keys: [
  { first: 3, method: 'AES-128', uri: 'hls_aes128_method_none.key', bytes: BASE_KEYS.methodNone },
  { first: 5, method: 'NONE' },
] });

for (const name of [
  'hls_aes128', 'hls_sample_aes', 'hls_aes128_seq0', 'hls_aes128_seq42',
  'hls_aes128_rotation', 'hls_aes128_method_none',
]) writeResourceIndex(name);

writeKeyGolden('hls_aes128_seq0', { keyHex: BASE_KEYS.seq0.toString('hex'), scheme: 'hls-aes128' });
writeKeyGolden('hls_aes128_seq42', { keyHex: BASE_KEYS.seq42.toString('hex'), scheme: 'hls-aes128' });
writeKeyGolden('hls_aes128_rotation', {
  keyHex: BASE_KEYS.rotationA.toString('hex'), scheme: 'hls-aes128',
  keySet: {
    'hls_aes128_rotation_a.key': BASE_KEYS.rotationA.toString('hex'),
    'hls_aes128_rotation_b.key': BASE_KEYS.rotationB.toString('hex'),
  },
});
writeKeyGolden('hls_aes128_method_none', { keyHex: BASE_KEYS.methodNone.toString('hex'), scheme: 'hls-aes128' });

updateManifest();
copyScenarioResourceClosures();
console.log('curated six HLS resource indices and four deterministic AES transition fixtures');

function copySampleAesFixture() {
  const source = join(MEDIA, 'scenarios/encryption/hls_sample_aes_decrypt');
  for (const name of ['hls_sample_aes.m3u8', 'hls_sample_aes.key', ...[0, 1, 2, 3, 4].map((i) => `hls_sample_aes_${String(i).padStart(3, '0')}.ts`)]) {
    atomicBytes(join(MEDIA, name), readFileSync(join(source, name)));
  }
}

function writeAesVariant({ name, mediaSequence, keys }) {
  for (const key of keys) if (key.method === 'AES-128') atomicBytes(join(MEDIA, key.uri), key.bytes);
  const lines = [
    '#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:2',
    `#EXT-X-MEDIA-SEQUENCE:${mediaSequence}`, '#EXT-X-PLAYLIST-TYPE:VOD',
  ];
  for (let index = 0; index < clearSegments.length; index++) {
    const sequence = mediaSequence + index;
    const transition = keys.find((entry) => entry.first === sequence);
    if (transition) {
      lines.push(transition.method === 'NONE'
        ? '#EXT-X-KEY:METHOD=NONE'
        : `#EXT-X-KEY:METHOD=AES-128,URI="${transition.uri}"`);
    }
    const active = [...keys].reverse().find((entry) => entry.first <= sequence);
    const segmentName = `${name}_${String(index).padStart(3, '0')}.ts`;
    const bytes = active?.method === 'AES-128'
      ? aesCbcEncrypt(clearSegments[index], active.bytes, sequenceIv(sequence))
      : clearSegments[index];
    atomicBytes(join(MEDIA, segmentName), bytes);
    lines.push('#EXTINF:2.000000,', segmentName);
  }
  lines.push('#EXT-X-ENDLIST');
  atomicText(join(MEDIA, `${name}.m3u8`), `${lines.join('\n')}\n`);
}

function aesCbcEncrypt(bytes, key, iv) {
  const cipher = createCipheriv('aes-128-cbc', key, iv);
  return Buffer.concat([cipher.update(bytes), cipher.final()]);
}

function sequenceIv(sequence) {
  const iv = Buffer.alloc(16);
  iv.writeBigUInt64BE(BigInt(sequence), 8);
  return iv;
}

function writeResourceIndex(name) {
  const playlistPath = join(MEDIA, `${name}.m3u8`);
  const playlistBytes = readFileSync(playlistPath);
  const references = inspectHlsResourceReferences(playlistBytes.toString('utf8'));
  const value = {
    schema: 'media-test/hls-resource-index@1',
    playlist: { assetId: basename(playlistPath), ...identityBytes(playlistBytes) },
    resources: references.map(({ role, uri }) => ({ role, uri, ...identity(join(MEDIA, uri)) })),
  };
  parseHlsResourceIndex(value);
  atomicText(join(GOLDEN, `${name}.m3u8.resources.json`), `${JSON.stringify(value, null, 2)}\n`);
}

function writeKeyGolden(name, values) {
  atomicText(join(GOLDEN, `${name}.m3u8.keys.json`), `${JSON.stringify({
    $note: 'Offline deterministic HLS key contract. Resource bytes are independently bound by the .resources.json index.',
    assetId: `${name}.m3u8`,
    ...values,
  }, null, 2)}\n`);
}

function updateManifest() {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const names = [
    ['hls_sample_aes', 'hls-sample-aes'],
    ['hls_aes128_seq0', 'hls-aes128'],
    ['hls_aes128_seq42', 'hls-aes128'],
    ['hls_aes128_rotation', 'hls-aes128'],
    ['hls_aes128_method_none', 'hls-aes128'],
  ];
  for (const [name, scheme] of names) {
    const id = `${name}.m3u8`;
    const values = identity(join(MEDIA, id));
    const record = {
      id, family: 'mpegts-hls', container: 'hls', codecs: ['h264', 'aac'], source: 'generated',
      sizeBucket: 'tiny',
      genMethod: `fixtures/curate-hls-resource-indices.mjs (${scheme}; source-bound ordered resource closure)`,
      ...values,
      notes: 'Playlist identity only; every key/map/segment is content-addressed by the matching resources.json.',
    };
    const index = manifest.assets.findIndex((entry) => entry.id === id);
    if (index < 0) manifest.assets.push(record);
    else manifest.assets[index] = record;
  }
  atomicText(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
}

function copyScenarioResourceClosures() {
  const targets = new Map([
    ['encryption/hls_aes128_decrypt', 'hls_aes128'],
    ['encryption/hls_aes128_decrypt_eq_cleartext', 'hls_aes128'],
    ['encryption/hls_sample_aes_decrypt', 'hls_sample_aes'],
    ['encryption/hls_aes128_sequence_zero_iv_decrypt', 'hls_aes128_seq0'],
    ['encryption/hls_aes128_sequence_nonzero_iv_decrypt', 'hls_aes128_seq42'],
    ['encryption/hls_aes128_key_rotation_decrypt', 'hls_aes128_rotation'],
    ['encryption/hls_aes128_method_none_transition_decrypt', 'hls_aes128_method_none'],
  ]);
  for (const [scenarioId, name] of targets) {
    const index = JSON.parse(readFileSync(join(GOLDEN, `${name}.m3u8.resources.json`), 'utf8'));
    const destination = join(MEDIA, 'scenarios', scenarioId);
    atomicBytes(join(destination, `${name}.m3u8`), readFileSync(join(MEDIA, `${name}.m3u8`)));
    for (const resource of index.resources) atomicBytes(join(destination, resource.uri), readFileSync(join(MEDIA, resource.uri)));
    const clear = join(MEDIA, 'hls_aes128_clear.mp4');
    if (statSync(clear).isFile()) atomicBytes(join(destination, 'hls_aes128_clear.mp4'), readFileSync(clear));
  }
}

function identity(path) {
  return identityBytes(readFileSync(path));
}

function identityBytes(bytes) {
  return { sha256: createHash('sha256').update(bytes).digest('hex'), sizeBytes: bytes.byteLength };
}

function atomicBytes(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, bytes);
  renameSync(temporary, path);
}

function atomicText(path, text) {
  atomicBytes(path, Buffer.from(text));
}
