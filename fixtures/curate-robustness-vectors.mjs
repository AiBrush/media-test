#!/usr/bin/env bun
/** Reproduce the two FIX acceptance corpora and bind catalog declarations to live DSL/source hashes. */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES = dirname(fileURLToPath(import.meta.url));
const MEDIA = join(FIXTURES, 'media');
const CATALOG = join(MEDIA, 'scenarios/_sources.ndjson');
const ROBUSTNESS_ROOT = join(MEDIA, 'scenarios/robustness');

const { robustnessScenarios } = await import('../src/scenarios/robustness/index.ts');

const fuzzScenario = requiredScenario('robustness/fuzz_mp4_header_truncated_demux');
const matchedScenario = requiredScenario('robustness/prop_duration_consistent_across_containers');
if (JSON.stringify(matchedScenario.input) !== JSON.stringify(['realworld_mdn_flower.mp4', 'realworld_mdn_flower.webm'])) {
  throw new Error('matched-origin scenario inputs drifted; update the curation contract explicitly');
}

const mdnMp4 = join(MEDIA, 'realworld_mdn_flower.mp4');
const mdnWebm = join(MEDIA, 'realworld_mdn_flower.webm');
assertIdentity(mdnMp4, '0cd83d944a6ca7822b4a8306cecc60a36e859b041f6702c6a1ad9ead78924451', 1_128_375);
assertIdentity(mdnWebm, 'c6f8a348953395598a9a73b9bab1676436410797bce9f398f4be1531d6e76dda', 554_058);

const matchedDir = join(ROBUSTNESS_ROOT, 'prop_duration_consistent_across_containers');
atomicBytes(join(matchedDir, 'realworld_mdn_flower.mp4'), readFileSync(mdnMp4));
atomicBytes(join(matchedDir, 'realworld_mdn_flower.webm'), readFileSync(mdnWebm));

const sourceBytes = readFileSync(mdnMp4);
const fuzzDir = join(ROBUSTNESS_ROOT, 'fuzz_mp4_header_truncated_demux');
const variants = [
  { file: '01.mp4', removedPrefixBytes: 128 },
  { file: '02.mp4', removedPrefixBytes: 512 },
].map((variant) => {
  const bytes = sourceBytes.subarray(variant.removedPrefixBytes);
  const path = join(fuzzDir, variant.file);
  atomicBytes(path, bytes);
  return { ...variant, ...identity(path) };
});

const rows = readFileSync(CATALOG, 'utf8').split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
replaceRow(rows, fuzzScenario.id, {
  scenarioId: fuzzScenario.id,
  requires: { container: 'mp4', videoCodecs: ['h264'], audioCodecs: [], video: true, encryption: null },
  class: 'REAL',
  note: 'Baked malformed fixture plus two curated deterministic header-truncation variants derived from pinned MDN CC0 bytes.',
  files: variants.map((variant) => ({
    file: variant.file,
    provider: 'mdn-cc0-curated',
    sourcePageUrl: 'https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Video_codecs',
    downloadUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    license: 'CC0',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: [],
    width: null,
    height: null,
    durationSec: null,
    sizeBytes: variant.sizeBytes,
    sha256: variant.sha256,
    derivation:
      `byte-exact slice of MDN flower.mp4 source sha256=0cd83d944a6ca7822b4a8306cecc60a36e859b041f6702c6a1ad9ead78924451; removed first ${variant.removedPrefixBytes} bytes`,
    probedWith: 'expected malformed rejection; source contract established before deterministic header truncation',
    contract: {
      scenarioId: fuzzScenario.id,
      scenarioContractDigest: fuzzScenario.definitionHash,
      sourceSha256: variant.sha256,
      kind: 'robustness-variant',
    },
    evidence: {
      sourceSha256: variant.sha256,
      available: ['MALFORMED_REJECTION'],
      requiredOracles: ['graceful-failure'],
      sufficientOracleSets: [['graceful-failure']],
    },
  })),
});

replaceRow(rows, matchedScenario.id, {
  scenarioId: matchedScenario.id,
  requires: { container: 'mp4', videoCodecs: ['h264'], audioCodecs: ['aac'], video: true, encryption: null },
  class: 'REAL',
  note: `Matched-origin MDN flower program pair; scenario definition ${matchedScenario.definitionHash}. Multi-input scenarios remain bundle-bound.`,
  files: [
    {
      file: 'realworld_mdn_flower.mp4', provider: 'mdn',
      sourcePageUrl: 'https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Video_codecs',
      downloadUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      license: 'CC0', container: 'mp4', videoCodecs: ['h264'], audioCodecs: ['aac'],
      width: 960, height: 540, durationSec: 5.055, sizeBytes: 1_128_375,
      sha256: '0cd83d944a6ca7822b4a8306cecc60a36e859b041f6702c6a1ad9ead78924451',
      probedWith: 'ffprobe -v error -show_streams -show_format',
    },
    {
      file: 'realworld_mdn_flower.webm', provider: 'mdn',
      sourcePageUrl: 'https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Video_codecs',
      downloadUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm',
      license: 'CC0', container: 'webm', videoCodecs: ['vp8'], audioCodecs: ['vorbis'],
      width: 960, height: 540, durationSec: 5.059, sizeBytes: 554_058,
      sha256: 'c6f8a348953395598a9a73b9bab1676436410797bce9f398f4be1531d6e76dda',
      probedWith: 'ffprobe -v error -show_streams -show_format',
    },
  ],
});

atomicText(CATALOG, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
console.log(`curated robustness vector: baked + ${variants.length} variants; contract=${fuzzScenario.definitionHash}`);
console.log(`matched MDN pair: ${matchedScenario.definitionHash}`);

function requiredScenario(id) {
  const scenario = robustnessScenarios.find((entry) => entry.id === id);
  if (!scenario) throw new Error(`missing scenario '${id}'`);
  return scenario;
}

function replaceRow(rows, scenarioId, replacement) {
  const index = rows.findIndex((row) => row.scenarioId === scenarioId);
  if (index < 0) throw new Error(`catalog has no row for '${scenarioId}'`);
  rows[index] = replacement;
}

function identity(path) {
  const bytes = readFileSync(path);
  return { sha256: createHash('sha256').update(bytes).digest('hex'), sizeBytes: bytes.byteLength };
}

function assertIdentity(path, sha256, sizeBytes) {
  const actual = identity(path);
  if (actual.sha256 !== sha256 || actual.sizeBytes !== sizeBytes) {
    throw new Error(`${path}: expected ${sha256}/${sizeBytes}, got ${actual.sha256}/${actual.sizeBytes}`);
  }
}

function atomicBytes(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, bytes);
  renameSync(temp, path);
}

function atomicText(path, text) {
  atomicBytes(path, Buffer.from(text));
}
