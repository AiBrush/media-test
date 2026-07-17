#!/usr/bin/env bun
/**
 * fixtures/bake-scenario-goldens.mjs — bake per-file GOLDENS for the rotated REAL media files
 * (scenario-media-test-update-instructions §7.4). Without these, a scenario that rotates onto a real
 * internet file has no ground truth, so its golden-keyed oracle (golden-metadata / golden-packets)
 * reports NA_ASSET — which is why the probe/demux/metadata matrix is mostly N/A after rotation.
 *
 * THE REFERENCE IS `ffprobe` (an independent, trusted tool) probing the real file AS-IS — NOT a
 * candidate engine such as mediabunny. This only READS the media (R1-compliant, §7.4) and writes each
 * file's own metadata/packet golden. `golden-metadata`/`golden-packets` then compare each real file to
 * its OWN ffprobe truth → real PASS/FAIL instead of N/A.
 *
 * Goldens are written to the NESTED path the runtime loader already fetches:
 *   real file id  = `scenarios/<family>/<name>/NN.ext`   (MediaInput.id under rotation)
 *   loadGolden    → GET fixtures/golden/scenarios/<family>/<name>/NN.ext.meta.json  (Vite serves it)
 * so NO runner/oracle change is needed — the goldens just have to exist.
 *
 * Metadata, packet, and presentation-order placeholder normalization are imported from the same
 * versioned fixture-location-independent module as fixtures/bake.mjs. Identical probe observations
 * therefore produce byte-identical evidence on both bake paths without manual mirroring.
 *
 * FRAME/SSIM DIGESTS are the browser's normalized-RGBA sha256 — ffmpeg CANNOT produce them, so the
 * `--frames` mode here only emits the ffprobe-derived PLACEHOLDER (`<id>.frames.json` with sha256:null,
 * pending:true) that the in-browser WebCodecs pass (scripts/frame-bake.mjs → src/core/frame-bake.ts)
 * later fills. Both entry points call the same shared presentation-order selector, so the browser pass
 * and frame oracles read a nested real-file placeholder byte-identically to a flat one. The final
 * digest is still baked ONLY by the platform instrument, never by a scored candidate engine.
 *
 * Usage:
 *   bun fixtures/bake-scenario-goldens.mjs [--force] [--packets] [--frames] [--family <fam>] [<id-substring> ...]
 *     --force            overwrite existing scenario goldens (default: skip present)
 *     --packets          also bake packets.json for EVERY selected file (default: demux family only)
 *     --frames           FRAMES MODE: emit ffprobe-derived <id>.frames.json PLACEHOLDERS (sha256:null,
 *                        pending:true) for real video-bearing files whose family consumes frame goldens
 *                        (decode-seek/transcode/remux/mux/metadata/performance; encryption is metamorphic
 *                        and needs NO frame golden). Does not write meta/packets. Never clobbers a golden
 *                        the browser pass already filled. The digests themselves are baked by
 *                        scripts/frame-bake.mjs --scenario-frames, not here.
 *     --family <fam>     restrict to one family (e.g. probe, demux, metadata); in --frames mode an
 *                        explicit family overrides the frame-family allowlist (honors operator intent)
 *     <id-substring>     positional filters: only scenarios whose id contains a term
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  DEFAULT_FRAME_READ_COUNT,
  buildGoldenPacketProbeArgs,
  buildGoldenSemanticDecodeArgs,
  buildFramePlaceholder,
  canonicalSha256,
  goldenInputOptions,
  normalizeGoldenPacketEvidence,
  normalizeProbeMetadata,
  parseMappedFrameMd5,
} from './lib/golden-normalization.mjs';
import {
  collectToolPerimeter,
  createGoldenEnvelope,
  createGoldenProvenance,
} from './lib/golden-contract.mjs';
import {
  activeArtifactsForMerge,
  activeAvailabilityForMerge,
  publishGeneration,
  readActiveGenerationIndex,
  stageReadyPublicationRecord,
  stageUnavailablePublicationRecord,
} from './lib/generation-publication.mjs';
import { validatePinnedHlsResourceClosure } from './lib/hls-resource-fixtures.mjs';

const ROOT = join(dirname(new URL(import.meta.url).pathname), '..');
const SOURCES = join(ROOT, 'fixtures/media/scenarios/_sources.ndjson');
const MEDIA_SCENARIOS = join(ROOT, 'fixtures/media/scenarios');
const GOLDEN_DIR = join(ROOT, 'fixtures/golden');
const TOOLCHAIN_LOCK_PATH = join(ROOT, 'fixtures/toolchain.lock.json');
const TOOLCHAIN_LOCK = JSON.parse(readFileSync(TOOLCHAIN_LOCK_PATH, 'utf8'));
const FIXTURE_SOURCE_DATE_EPOCH = process.env.SOURCE_DATE_EPOCH ?? TOOLCHAIN_LOCK.sourceDateEpoch;
const TOOL_PERIMETER = collectToolPerimeter();
TOOL_PERIMETER.declaredLock = {
  sha256: createHash('sha256').update(readFileSync(TOOLCHAIN_LOCK_PATH)).digest('hex'),
  sourceDateEpoch: TOOLCHAIN_LOCK.sourceDateEpoch,
  locale: TOOLCHAIN_LOCK.locale,
  timezone: TOOLCHAIN_LOCK.timezone,
  required: TOOLCHAIN_LOCK.required,
  optional: TOOLCHAIN_LOCK.optional,
};
TOOL_PERIMETER.environment.SOURCE_DATE_EPOCH = String(FIXTURE_SOURCE_DATE_EPOCH);

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opts = { force: false, packets: false, frames: false, family: /** @type {string|null} */ (null), terms: /** @type {string[]} */ ([]) };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--force') opts.force = true;
  else if (a === '--packets') opts.packets = true;
  else if (a === '--frames') opts.frames = true;
  else if (a === '--family') opts.family = argv[++i] ?? null;
  else if (a === '--help' || a === '-h') { console.log('bun fixtures/bake-scenario-goldens.mjs [--force] [--packets] [--frames] [--family <fam>] [<id-substring> ...]'); process.exit(0); }
  else if (a.startsWith('--')) { console.error(`unknown flag ${a}`); process.exit(1); }
  else opts.terms.push(a.trim());
}

// ── ffprobe + shared versioned normalization ─────────────────────────────────────────────────────
function ffprobeJson(args, label) {
  const full = ['-hide_banner', '-loglevel', 'error', '-of', 'json', ...args];
  const res = spawnSync('ffprobe', full, { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (res.status !== 0) {
    throw new Error(`ffprobe failed for ${label}: ${res.stderr || res.error?.message || `exit ${res.status}`}`);
  }
  try {
    return JSON.parse(res.stdout);
  } catch (e) {
    throw new Error(`ffprobe produced non-JSON for ${label}: ${e}`);
  }
}

function goldenInputOpts(assetId) {
  return goldenInputOptions(assetId);
}

function normalizedMetadataFor(assetId, mediaPath) {
  const inOpts = goldenInputOpts(assetId);
  const probe = ffprobeJson([...inOpts, '-show_format', '-show_streams', mediaPath], `${assetId} meta`);
  const frameProbe = ffprobeJson(
    [...inOpts, '-select_streams', 'v', '-show_frames', '-show_entries', 'frame=stream_index,pts_time,best_effort_timestamp_time,key_frame', '-read_intervals', `%+#${DEFAULT_FRAME_READ_COUNT}`, mediaPath],
    `${assetId} cadence`,
  );
  return normalizeScenarioProbeForGolden(probe, frameProbe, assetId);
}

export function normalizeScenarioProbeForGolden(probe, frameProbe, assetId = 'fixture.bin') {
  return normalizeProbeMetadata(probe, { assetId, frameProbe });
}

export function scenarioFramePlaceholderForGolden(assetId, sourceMedia, frameProbe) {
  return buildFramePlaceholder(assetId, sourceMedia, frameProbe);
}

function packetsFor(assetId, mediaPath) {
  const inOpts = goldenInputOpts(assetId);
  const probe = ffprobeJson(buildGoldenPacketProbeArgs(inOpts, mediaPath), `${assetId} packets`);
  const decoded = decodedFrameHashes(assetId, mediaPath, inOpts, probe.streams ?? []);
  return normalizeGoldenPacketEvidence(probe, {
    assetId,
    decodedUnits: decoded.units,
    decoderObservation: decoded.observation,
  });
}

function decodedFrameHashes(assetId, mediaPath, inOpts, inputStreams) {
  const result = spawnSync(
    'ffmpeg',
    buildGoldenSemanticDecodeArgs(inOpts, mediaPath),
    { encoding: 'utf8', maxBuffer: 1 << 28 },
  );
  if (result.status !== 0) {
    if (assetId.endsWith('hls_sample_aes.m3u8')) {
      validatePinnedHlsResourceClosure({ assetId, mediaPath, goldenDir: GOLDEN_DIR });
      return {
        units: [],
        observation: {
          state: 'reference-unavailable',
          reasonCode: 'REFERENCE_DECODER_SAMPLE_AES_UNAVAILABLE',
          detail: 'independent ffmpeg reference decode unavailable for source-bound SAMPLE-AES fixture',
        },
      };
    }
    throw new Error(`ffmpeg semantic decode failed for ${assetId}: ${result.stderr || result.error?.message || `exit ${result.status}`}`);
  }
  return { units: parseMappedFrameMd5(result.stdout, inputStreams), observation: { state: 'validated' } };
}

// ── Frame-digest PLACEHOLDER (browser-filled through the shared selector) ──────────────────────────
//
// Families whose ROTATED real files are scored by a frame-digest golden (decoded-frames-bitexact /
// ssim-psnr) or by seek-accuracy (which resolves its expected PTS from golden frames when no packet
// golden is present). Only these get a `--frames` placeholder by default. Determined by inspecting the
// built battery (src/scenarios/*) for video scenarios using those oracles AND cross-checking that the
// family actually rotates onto real files (has REAL/DERIVED rows in _sources.ndjson):
//   INCLUDED : decode-seek, transcode, remux, mux, metadata, performance
//   EXCLUDED : encryption   → rotates to a METAMORPHIC oracle (media-selection.ts deriveEffective sets
//                             invariant='decrypt-eq-cleartext-decode' + cleartextBaseAsset and DROPS
//                             decrypt-bitexact); it decodes decrypt(x) vs the live cleartext BASE media,
//                             consuming NO frame golden — a placeholder here would be fabricated noise.
//   EXCLUDED : robustness (no REAL rows), streaming-output (baked-only, never rotates), and the
//              audio-only / probe / demux families (no frame-digest oracle on a video track).
// An explicit `--family <fam>` overrides this allowlist (honors operator intent).
const FRAME_ORACLE_FAMILIES = new Set(['decode-seek', 'transcode', 'remux', 'mux', 'metadata', 'performance']);

/** True iff the file carries a decodable video (or still-image) stream — mirrors frameHookFor's hasVideo. */
function hasVideoStream(assetId, mediaPath) {
  const inOpts = goldenInputOpts(assetId);
  const probe = ffprobeJson([...inOpts, '-select_streams', 'v', '-show_entries', 'stream=codec_type', mediaPath], `${assetId} video-probe`);
  return (probe.streams || []).some((s) => s.codec_type === 'video');
}

/**
 * Build the `<id>.frames.json` PLACEHOLDER for a video-bearing real file — the SAME $todo/pending shape
 * shared by fixtures/bake.mjs: resolve best-effort/PTS time, read a bounded decode-order window, sort
 * into presentation order, deduplicate timestamps, and retain the first 12 contiguous observations.
 * Never invents a digest: every sha256 is null and pending stays true until the platform pass.
 */
function framePlaceholderFor(assetId, mediaPath) {
  const source = sourceIdentity(mediaPath);
  const inOpts = goldenInputOpts(assetId);
  let probe = { frames: [] };
  try {
    probe = ffprobeJson(
      [...inOpts, '-select_streams', 'v:0', '-show_frames', '-show_entries', 'frame=stream_index,pts_time,best_effort_timestamp_time,key_frame', '-read_intervals', `%+#${DEFAULT_FRAME_READ_COUNT}`, mediaPath],
      `${assetId} frames-hook`,
    );
  } catch {
    // The shared placeholder turns the empty observation into an explicit producer-failed state.
  }
  return scenarioFramePlaceholderForGolden(assetId, source, probe);
}

function writeJson(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2) + '\n');
}

function sourceIdentity(path) {
  const bytes = readFileSync(path);
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.byteLength,
  };
}

/** Reject local contamination before ffprobe or any publication staging can consume the bytes. */
export function verifyScenarioSourceIdentity(catalogFile, mediaPath, assetId = catalogFile?.file ?? 'unknown') {
  if (!catalogFile || !Number.isSafeInteger(catalogFile.sizeBytes) || catalogFile.sizeBytes < 0 ||
      typeof catalogFile.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(catalogFile.sha256)) {
    throw new TypeError(`${assetId}: SCENARIO_SOURCE_CATALOG_IDENTITY_INVALID`);
  }
  const actualSizeBytes = statSync(mediaPath).size;
  if (actualSizeBytes !== catalogFile.sizeBytes) {
    throw new Error(
      `${assetId}: SCENARIO_SOURCE_SIZE_MISMATCH expected ${catalogFile.sizeBytes}, got ${actualSizeBytes}`,
    );
  }
  const identity = sourceIdentity(mediaPath);
  if (identity.sha256 !== catalogFile.sha256) {
    throw new Error(
      `${assetId}: SCENARIO_SOURCE_DIGEST_MISMATCH expected ${catalogFile.sha256}, got ${identity.sha256}`,
    );
  }
  return identity;
}

function artifactEnvelope(artifactKind, assetId, mediaPath, payload, availability = { state: 'ready' }) {
  const sourceMedia = sourceIdentity(mediaPath);
  const provenance = createGoldenProvenance({
    artifactKind,
    assetId,
    sourceMedia,
    recipe: `fixtures/bake-scenario-goldens.mjs#${artifactKind}`,
    normalizedArguments: {
      assetId,
      sourceSha256: sourceMedia.sha256,
      artifactKind,
      normalizationVersion: payload.schemaVersion ?? null,
    },
    baker: 'media-test/bake-scenario-goldens@1',
    perimeter: TOOL_PERIMETER,
    payload,
    sourceDateEpoch: FIXTURE_SOURCE_DATE_EPOCH,
    browserQualified: false,
  });
  let legacy;
  if (artifactKind === 'metadata') {
    legacy = { ...payload.metadata, metadata: payload.metadata, raw: payload.raw, canonical: payload.canonical };
  } else if (artifactKind === 'packets') {
    legacy = { packets: payload.packets, raw: payload.raw, semantic: payload.semantic, representation: payload.representation };
  } else {
    legacy = {
      $todo:
        'BROWSER-PRODUCED GOLDEN. Real normalized RGBA pixels and timestamp identity are required; ' +
        'run scripts/frame-bake.mjs. Until then frame evidence is pending and routes to NA_ASSET.',
      pending: true,
      pixelNormalizationVersion: payload.pixelNormalizationVersion,
      evidenceState: payload.evidenceState,
      ...(payload.producerFailure ? { producerFailure: payload.producerFailure } : {}),
      frames: payload.frames,
    };
  }
  return createGoldenEnvelope({ artifactKind, assetId, sourceMedia, payload, legacy, provenance, availability });
}

const staged = new Map();
const stagedAvailability = new Map();
const staleDirectRemovals = new Set();
// Scenario files are the selected roots; resources nested below one root are never added here.
const stagedRootAssetIds = new Set();

function stageEnvelope(relativeGoldenPath, document) {
  stagedRootAssetIds.add(document.assetId);
  const logicalPath = `golden/${relativeGoldenPath}`;
  const bytes = `${JSON.stringify(document, null, 2)}\n`;
  stageReadyPublicationRecord(staged, stagedAvailability, {
    logicalPath,
    artifactKind: document.artifactKind,
    bytes,
    sourceMediaSha256: document.sourceMedia.sha256,
    provenanceSha256: canonicalSha256(document.provenance),
    directPath: join(ROOT, 'fixtures', logicalPath),
    document,
  });
}

function stageMedia(assetId, mediaPath, sourceMedia) {
  stagedRootAssetIds.add(assetId);
  const logicalPath = `media/${assetId}`;
  const provenance = {
    schema: 'media-test/media-provenance@1',
    assetId,
    sourceMedia,
    catalog: 'fixtures/media/scenarios/_sources.ndjson',
    recipe: 'fixtures/bake-scenario-goldens.mjs#media',
    baker: 'media-test/bake-scenario-goldens@1',
  };
  stageReadyPublicationRecord(staged, stagedAvailability, {
    logicalPath,
    artifactKind: 'media',
    sourcePath: mediaPath,
    sourceMediaSha256: sourceMedia.sha256,
    provenanceSha256: canonicalSha256(provenance),
    audit: {
      recipe: provenance.recipe,
      bakerVersion: provenance.baker,
      outputArtifactSha256: sourceMedia.sha256,
    },
  });
}

function stageExpectedAbsence(logicalPath, reasonCode, detail) {
  if (logicalPath.startsWith('media/')) stagedRootAssetIds.add(logicalPath.slice('media/'.length));
  stageUnavailablePublicationRecord(staged, stagedAvailability, {
    logicalPath,
    state: 'absent-expected',
    reasonCode,
    detail,
  });
}

function publishStaged() {
  const fixtureRoot = join(ROOT, 'fixtures');
  const replacements = [...new Set([...staged.keys(), ...stagedAvailability.keys()])];
  if (replacements.length === 0) return undefined;
  const additions = [...staged.values()].map(({ directPath: _directPath, document: _document, ...artifact }) => artifact);
  const artifacts = [...activeArtifactsForMerge(fixtureRoot, replacements), ...additions];
  const availability = [
    ...activeAvailabilityForMerge(fixtureRoot, replacements),
    ...stagedAvailability.values(),
  ];
  const activeScope = readActiveGenerationIndex(fixtureRoot)?.publicationScope;
  const publicationScope = activeScope?.mode === 'complete-corpus'
    ? { mode: 'complete-corpus' }
    : {
        mode: 'selected-assets',
        assetIds: [
          ...(activeScope?.mode === 'selected-assets' ? activeScope.assetIds : []),
          ...stagedRootAssetIds,
        ].filter((assetId, index, all) => all.indexOf(assetId) === index).sort(compareCodepoint),
      };
  const published = publishGeneration({
    rootDir: fixtureRoot,
    artifacts,
    availability,
    publicationScope,
    sourceDateEpoch: FIXTURE_SOURCE_DATE_EPOCH,
  });

  // Compatibility mirror. The generation index is authoritative and was renamed last; legacy
  // readers can continue using the familiar path while migration to indexed resolution completes.
  for (const artifact of staged.values()) {
    if (!artifact.directPath || !artifact.document) continue;
    writeJson(artifact.directPath, artifact.document);
  }
  for (const path of staleDirectRemovals) rmSync(path, { force: true });
  return published;
}

function compareCodepoint(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

// ── Main ─────────────────────────────────────────────────────────────────────────────────────────
function loadRows() {
  const text = readFileSync(SOURCES, 'utf8');
  const rows = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    rows.push(JSON.parse(t));
  }
  return rows;
}

function selected(row) {
  if (row.class !== 'REAL' && row.class !== 'DERIVED') return false;
  if (!Array.isArray(row.files) || row.files.length === 0) return false;
  const fam = row.scenarioId.split('/')[0];
  if (opts.family && fam !== opts.family) return false;
  if (opts.terms.length && !opts.terms.some((term) => row.scenarioId.includes(term))) return false;
  return true;
}

/** Is this family eligible for a --frames placeholder? An explicit --family always wins over the allowlist. */
function frameFamilyEligible(fam) {
  return opts.family ? true : FRAME_ORACLE_FAMILIES.has(fam);
}

// ── --frames mode: emit ffprobe frame PLACEHOLDERS (browser pass fills the digests) ─────────────────
function bakeFramesMode(rows) {
  let framesWritten = 0, skippedPresent = 0, skippedFilled = 0, audioSkipped = 0, familySkipped = 0, missing = 0, failed = 0;
  const perFamily = {};
  const failures = [];

  for (const row of rows) {
    const fam = row.scenarioId.split('/')[0];
    if (!frameFamilyEligible(fam)) { familySkipped++; continue; }
    for (const file of row.files) {
      const assetId = `scenarios/${row.scenarioId}/${file.file}`;
      const mediaPath = join(MEDIA_SCENARIOS, row.scenarioId, file.file);
      if (!existsSync(mediaPath)) {
        missing++;
        stageExpectedAbsence(`media/${assetId}`, 'SCENARIO_SOURCE_NOT_ACQUIRED', 'catalogued real/derived source is not present in this checkout');
        continue;
      }
      let sourceMedia;
      try {
        sourceMedia = verifyScenarioSourceIdentity(file, mediaPath, assetId);
      } catch (error) {
        failed++;
        failures.push(`${assetId} source-integrity: ${error.message}`);
        continue;
      }
      stageMedia(assetId, mediaPath, sourceMedia);

      const framesPath = join(GOLDEN_DIR, `${assetId}.frames.json`);
      const ssimPath = join(GOLDEN_DIR, `${assetId}.ssim.json`);
      // Without --force, keep what's on disk (don't clobber browser digests, don't rewrite a pending
      // placeholder). WITH --force, RESET: overwrite whatever is there (filled OR pending) — a forced
      // re-placeholder is an explicit correctness reset (e.g. a golden baked from an unfaithful decode).
      if (existsSync(framesPath) && !opts.force) {
        let prevFilled = false;
        try {
          const prev = JSON.parse(readFileSync(framesPath, 'utf8'));
          prevFilled = Array.isArray(prev.frames) && prev.frames.some((f) => f && f.sha256);
        } catch { /* unparseable → treat as a stale placeholder we may rewrite under --force */ }
        if (prevFilled) { skippedFilled++; continue; }
        skippedPresent++; continue;
      }

      // Audio-only (no video/image stream) → no frame golden, exactly like frameHookFor returning null.
      let hasVideo;
      try {
        hasVideo = hasVideoStream(assetId, mediaPath);
      } catch (e) { failed++; failures.push(`${assetId} video-probe: ${e.message}`); continue; }
      if (!hasVideo) { audioSkipped++; continue; }

      try {
        const placeholder = framePlaceholderFor(assetId, mediaPath);
        const availability = placeholder.evidenceState === 'producer-failed'
          ? { state: 'producer-failed', reasonCode: placeholder.producerFailure?.reasonCode ?? 'FRAME_PLACEHOLDER_EMPTY', detail: placeholder.producerFailure?.detail }
          : { state: 'pending', reasonCode: 'FRAME_PIXELS_NOT_BAKED', detail: 'browser-qualified pixels have not been produced' };
        const envelope = artifactEnvelope('frames', assetId, mediaPath, placeholder, availability);
        stageEnvelope(`${assetId}.frames.json`, envelope);
        // A fresh PENDING placeholder means "not yet baked" → any prior luma-signature side-file is now
        // stale and MUST go: loadGolden reads ssim.json independently of the frames `pending` flag, so a
        // lingering ssim.json would keep ssim-psnr scoring (a FAIL) instead of the honest NA the pending
        // frames golden intends. Removing it makes decodeFrameGoldenGap (runner.ts) resolve to NA_ASSET.
        stageExpectedAbsence(`golden/${assetId}.ssim.json`, 'FRAME_PIXELS_NOT_BAKED', 'SSIM evidence is absent until every expected frame has real pixels');
        staleDirectRemovals.add(ssimPath);
        framesWritten++;
        perFamily[fam] = (perFamily[fam] ?? 0) + 1;
      } catch (e) { failed++; failures.push(`${assetId} frames: ${e.message}`); }
    }
  }

  console.log(`\n═══ scenario real-file FRAME placeholders (browser pass fills digests) ═══`);
  console.log(`  scenarios selected  : ${rows.length}${opts.family ? ` (family=${opts.family})` : ''}${opts.terms.length ? ` (terms=${opts.terms.join(',')})` : ''}`);
  console.log(`  frames.json written : ${framesWritten}`);
  for (const fam of Object.keys(perFamily).sort()) console.log(`      ${fam.padEnd(16)}: ${perFamily[fam]}`);
  console.log(`  skipped (placeholder present): ${skippedPresent}`);
  console.log(`  skipped (browser-filled kept): ${skippedFilled}`);
  console.log(`  skipped (audio-only/no video): ${audioSkipped}`);
  console.log(`  skipped (family not frame-oracle): ${familySkipped}`);
  console.log(`  media missing/skip  : ${missing}`);
  console.log(`  ffprobe failures    : ${failed}`);
  for (const f of failures.slice(0, 20)) console.log(`    ✗ ${f}`);
  if (failures.length > 20) console.log(`    … and ${failures.length - 20} more`);
  console.log(`  NEXT: bun scripts/frame-bake.mjs --scenario-frames --browser chromium --headless --base-url http://localhost:5173`);
  console.log(`═══════════════════════════════════`);
  if (failed > 0) throw new Error(`scenario frame bake had ${failed} unexpected selected failure(s); active generation was not changed`);
  publishStaged();
}

function main() {
  const rows = loadRows().filter(selected);
  if (opts.frames) { bakeFramesMode(rows); return; }

  let metaWritten = 0, packetsWritten = 0, skipped = 0, missing = 0, failed = 0;
  const failures = [];

  for (const row of rows) {
    const fam = row.scenarioId.split('/')[0];
    const bakePackets = opts.packets || fam === 'demux';
    for (const file of row.files) {
      const assetId = `scenarios/${row.scenarioId}/${file.file}`;
      const mediaPath = join(MEDIA_SCENARIOS, row.scenarioId, file.file);
      if (!existsSync(mediaPath)) {
        missing++;
        stageExpectedAbsence(`media/${assetId}`, 'SCENARIO_SOURCE_NOT_ACQUIRED', 'catalogued real/derived source is not present in this checkout');
        continue;
      }
      let sourceMedia;
      try {
        sourceMedia = verifyScenarioSourceIdentity(file, mediaPath, assetId);
      } catch (error) {
        failed++;
        failures.push(`${assetId} source-integrity: ${error.message}`);
        continue;
      }
      stageMedia(assetId, mediaPath, sourceMedia);

      const metaPath = join(GOLDEN_DIR, `${assetId}.meta.json`);
      if (opts.force || !existsSync(metaPath)) {
        try {
          const payload = normalizedMetadataFor(assetId, mediaPath);
          stageEnvelope(`${assetId}.meta.json`, artifactEnvelope('metadata', assetId, mediaPath, payload));
          metaWritten++;
        } catch (e) { failed++; failures.push(`${assetId} meta: ${e.message}`); continue; }
      } else skipped++;

      if (bakePackets) {
        const pktPath = join(GOLDEN_DIR, `${assetId}.packets.json`);
        if (opts.force || !existsSync(pktPath)) {
          try {
            const payload = packetsFor(assetId, mediaPath);
            stageEnvelope(`${assetId}.packets.json`, artifactEnvelope('packets', assetId, mediaPath, payload));
            packetsWritten++;
          }
          catch (e) { failed++; failures.push(`${assetId} packets: ${e.message}`); }
        }
      }
    }
  }

  console.log(`\n═══ scenario real-file goldens ═══`);
  console.log(`  scenarios selected : ${rows.length}${opts.family ? ` (family=${opts.family})` : ''}${opts.terms.length ? ` (terms=${opts.terms.join(',')})` : ''}`);
  console.log(`  meta.json written  : ${metaWritten}`);
  console.log(`  packets.json written: ${packetsWritten}`);
  console.log(`  skipped (present)  : ${skipped}`);
  console.log(`  media missing/skip : ${missing}`);
  console.log(`  ffprobe failures   : ${failed}`);
  for (const f of failures.slice(0, 20)) console.log(`    ✗ ${f}`);
  if (failures.length > 20) console.log(`    … and ${failures.length - 20} more`);
  console.log(`═══════════════════════════════════`);
  if (failed > 0) throw new Error(`scenario golden bake had ${failed} unexpected selected failure(s); active generation was not changed`);
  publishStaged();
}

if (import.meta.main) main();
