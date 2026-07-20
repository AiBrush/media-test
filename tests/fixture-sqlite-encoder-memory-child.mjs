/** Fresh-process workload for the isolated SQLite/file-column encoder memory proof. */

import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import {
  createGoldenEnvelope,
  createGoldenProvenance,
} from '../fixtures/lib/golden-contract.mjs';
import { inspectCompactGoldenFile } from '../fixtures/lib/compact-golden-file.mjs';
import {
  disposeFileBackedCompactGoldenPacketPayload,
  fileBackedCompactGoldenPacketPayloadIdentity,
  fileBackedCompactGoldenPacketPayloadSourcePath,
} from '../fixtures/lib/file-backed-compact-payload.mjs';
import { normalizeGoldenPacketEvidence } from '../fixtures/lib/golden-normalization.mjs';
import { writePrevalidatedCompactGoldenSource } from '../fixtures/lib/generation-publication.mjs';
import { validateCompactGoldenPacketPayload } from '../fixtures/lib/lossless-json-columnar-validator.mjs';

const [mode, countText, rootText] = process.argv.slice(2);
const rowCount = Number(countText);
const root = resolve(rootText ?? '');

if ((mode !== 'encode' && mode !== 'e2e') || !Number.isSafeInteger(rowCount) || rowCount <= 0 || !rootText) {
  throw new TypeError('usage: bun fixture-sqlite-encoder-memory-child.mjs <encode|e2e> <positive-count> <temp-root>');
}

const reads = { packets: 0, decodedUnits: 0 };
const packetSource = Object.freeze({
  rowCount,
  rows() {
    reads.packets++;
    return packetRows(rowCount);
  },
});
const decodedUnitSource = Object.freeze({
  rowCount,
  rows() {
    reads.decodedUnits++;
    return decodedUnits(rowCount);
  },
});

if (typeof Bun !== 'undefined' && typeof Bun.gc === 'function') Bun.gc(true);
await Promise.resolve();
const beforeEncoderMemoryUsage = process.memoryUsage();
const startedAt = performance.now();
const payload = normalizeGoldenPacketEvidence(probe(), {
  assetId: 'memory-proof.mp4',
  packetSource,
  decodedUnitSource,
  decoderObservation: { state: 'validated' },
  compactStorage: true,
  compactTemporaryRoot: root,
});
const encoderElapsedMs = performance.now() - startedAt;
const encoderMaxRssBytes = process.resourceUsage().maxRSS;
const immediateEncoderMemoryUsage = process.memoryUsage();
if (typeof Bun !== 'undefined' && typeof Bun.gc === 'function') Bun.gc(true);
await Promise.resolve();
const postGcEncoderMemoryUsage = process.memoryUsage();
const encoderRssBytes = immediateEncoderMemoryUsage.rss;
const payloadIdentity = fileBackedCompactGoldenPacketPayloadIdentity(payload);
const payloadPath = fileBackedCompactGoldenPacketPayloadSourcePath(payload);
const privateDirectory = dirname(payloadPath);
const privateDirectoryMode = statSync(privateDirectory).mode & 0o777;

assert(dirname(privateDirectory) === root, 'encoder private directory escaped the supplied root');
assert(basename(privateDirectory).startsWith('media-test-compact-columns-'), 'encoder temp prefix is not private');
assert((statSync(payloadPath).mode & 0o777) === 0o600, 'encoder payload file is not mode 0600');
assert((privateDirectoryMode & 0o077) === 0, 'encoder temp directory permits group/other access');
assert(privateEncoderDirectories().length === 1, 'encoder did not retain exactly one descriptor-owned temp root');
assert(reads.packets === 1 && reads.decodedUnits === 1, 'source timelines were not consumed in one pass');

if (mode === 'encode') {
  disposeFileBackedCompactGoldenPacketPayload(payload);
  assert(!existsSync(privateDirectory), 'descriptor disposal retained the encoder temp root');
  assert(privateEncoderDirectories().length === 0, 'encoder temp root leaked after disposal');
  process.stdout.write(`${JSON.stringify({
    mode,
    rowCount,
    encoderElapsedMs,
    encoderMaxRssBytes,
    encoderRssBytes,
    beforeEncoderMemoryUsage,
    immediateEncoderMemoryUsage,
    postGcEncoderMemoryUsage,
    payloadIdentity,
    reads,
    privateDirectoryMode,
    privateDirectoriesAfterCleanup: 0,
  })}\n`);
} else {
  const mediaPath = join(root, 'memory-proof.mp4');
  const media = Buffer.from('isolated-memory-proof-media');
  writeFileSync(mediaPath, media, { mode: 0o600 });
  const sourceMedia = { sha256: sha256(media), sizeBytes: media.byteLength };
  const provenance = createGoldenProvenance({
    artifactKind: 'packets',
    assetId: 'memory-proof.mp4',
    sourceMedia,
    recipe: 'tests/fixture-sqlite-encoder-memory-child.mjs#e2e',
    normalizedArguments: { assetId: 'memory-proof.mp4', artifactKind: 'packets', rowCount },
    baker: 'fixture-sqlite-memory-proof@1',
    perimeter: recordedPerimeter(),
    payload,
    payloadIdentity,
    sourceDateEpoch: 0,
  });
  const envelope = createGoldenEnvelope({
    artifactKind: 'packets',
    assetId: 'memory-proof.mp4',
    sourceMedia,
    payload,
    provenance,
  });
  const artifactPath = join(root, 'memory-proof.packets.json');
  const marker = writePrevalidatedCompactGoldenSource(envelope, artifactPath);
  assert(!existsSync(privateDirectory), 'prevalidated envelope splice retained the encoder temp root');
  assert(privateEncoderDirectories().length === 0, 'encoder temp root leaked after envelope splice');

  const inspection = inspectCompactGoldenFile(artifactPath);
  assert(inspection.packetRowCount === rowCount, 'disk inspector packet count mismatch');
  assert(inspection.semanticAccessUnitCount === rowCount, 'disk inspector semantic count mismatch');
  assert(inspection.decodedUnitCount === rowCount, 'disk inspector decoded count mismatch');
  assert(inspection.payloadSha256 === payloadIdentity.sha256, 'disk inspector payload digest mismatch');
  assert(inspection.payloadSizeBytes === payloadIdentity.sizeBytes, 'disk inspector payload size mismatch');

  // This deliberately validates the compact object graph only. It never calls the runtime row
  // reader or full logical expander, so no 100,001-row runtime array is constructed.
  const document = JSON.parse(readFileSync(artifactPath, 'utf8'));
  const validation = validateCompactGoldenPacketPayload(document.payload);
  assert(validation.packetRowCount === rowCount, 'object validator packet count mismatch');
  assert(validation.semanticAccessUnitCount === rowCount, 'object validator semantic count mismatch');
  assert(validation.decodedUnitCount === rowCount, 'object validator decoded count mismatch');
  const artifactSizeBytes = statSync(artifactPath).size;
  const endToEndMaxRssBytes = process.resourceUsage().maxRSS;

  rmSync(artifactPath, { force: true });
  rmSync(mediaPath, { force: true });
  assert(readdirSync(root).length === 0, 'end-to-end child retained private or artifact files');
  process.stdout.write(`${JSON.stringify({
    mode,
    rowCount,
    encoderElapsedMs,
    encoderMaxRssBytes,
    encoderRssBytes,
    beforeEncoderMemoryUsage,
    immediateEncoderMemoryUsage,
    postGcEncoderMemoryUsage,
    endToEndMaxRssBytes,
    payloadIdentity,
    artifactSizeBytes,
    marker: {
      artifactSha256: marker.artifactSha256,
      artifactSizeBytes: marker.artifactSizeBytes,
      payloadSha256: marker.payloadSha256,
      payloadSizeBytes: marker.payloadSizeBytes,
    },
    inspection: {
      packetRowCount: inspection.packetRowCount,
      semanticAccessUnitCount: inspection.semanticAccessUnitCount,
      decodedUnitCount: inspection.decodedUnitCount,
    },
    validation,
    reads,
    privateDirectoryMode,
    privateDirectoriesAfterCleanup: 0,
  })}\n`);
}

function* packetRows(count) {
  for (let index = 0; index < count; index++) {
    const ticks = index * 40;
    yield {
      stream_index: 0,
      size: String(700 + (index % 37)),
      pts: String(ticks),
      dts: String(ticks),
      duration: '40',
      flags: index % 30 === 0 ? 'K__' : '___',
      pos: String(index * 1_024),
      data_hash: `SHA256:${hex64(index + 1)}`,
    };
  }
}

function* decodedUnits(count) {
  for (let index = 0; index < count; index++) {
    yield {
      streamIndex: 0,
      ptsUs: index * 40_000,
      durationUs: 40_000,
      sha256: hex64(index + 10_000_000),
    };
  }
}

function probe() {
  return {
    format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2' },
    streams: [{
      index: 0,
      codec_type: 'video',
      codec_name: 'h264',
      codec_tag_string: 'avc1',
      time_base: '1/1000',
      width: 320,
      height: 180,
      nal_length_size: '4',
      extradata: '00000000: 0164001f ffe10004 6764001f 01000268 ee',
    }],
    frames: [
      { stream_index: 0, pts_time: '0', key_frame: 1, pict_type: 'I' },
      { stream_index: 0, pts_time: '0.04', key_frame: 0, pict_type: 'P' },
    ],
  };
}

function hex64(value) {
  return value.toString(16).padStart(64, '0');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function privateEncoderDirectories() {
  return readdirSync(root).filter((name) => name.startsWith('media-test-compact-columns-'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function recordedPerimeter() {
  const present = (name) => ({ state: 'present', executable: name, versionOutput: `${name} test-version` });
  return {
    schemaVersion: 'tool-perimeter@1',
    tools: {
      bun: present('bun'),
      ffmpeg: present('ffmpeg'),
      ffprobe: present('ffprobe'),
      bento4: { state: 'absent' },
      bento4Hls: { state: 'absent' },
      shakaPackager: { state: 'absent' },
      playwright: { state: 'not-applicable' },
      browser: { state: 'not-applicable' },
    },
    platform: { os: 'test', release: 'test', arch: 'test', locale: 'C', timezone: 'UTC' },
    environment: {
      SOURCE_DATE_EPOCH: '0', LANG: 'C', LC_ALL: 'C', TZ: 'UTC',
      BRAVE_PATH: null, FFMPEG_PATH: null, FFPROBE_PATH: null,
    },
    declaredLock: {
      sha256: 'd'.repeat(64), sourceDateEpoch: 0, locale: 'C', timezone: 'UTC',
      required: { bun: 'test', ffmpeg: 'test', ffprobe: 'test' }, optional: {},
    },
  };
}
