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
 * The normalization helpers below are COPIED VERBATIM from fixtures/bake.mjs so the output is
 * byte-for-byte the same shape the baked-fixture goldens use (and `golden-metadata` expects). If you
 * change canonicalization in bake.mjs, mirror it here.
 *
 * FRAME/SSIM DIGESTS are the browser's normalized-RGBA sha256 — ffmpeg CANNOT produce them, so the
 * `--frames` mode here only emits the ffprobe-derived PLACEHOLDER (`<id>.frames.json` with sha256:null,
 * pending:true) that the in-browser WebCodecs pass (scripts/frame-bake.mjs → src/core/frame-bake.ts)
 * later fills. The placeholder shape is COPIED VERBATIM from fixtures/bake.mjs `frameHookFor` (the flat
 * corpus's producer) so the browser pass + the decoded-frames-bitexact / ssim-psnr / seek-accuracy
 * oracles read a nested real-file golden byte-identically to a flat one. The final digest is still
 * baked ONLY by the platform instrument, never by a scored candidate engine.
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
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(new URL(import.meta.url).pathname), '..');
const SOURCES = join(ROOT, 'fixtures/media/scenarios/_sources.ndjson');
const MEDIA_SCENARIOS = join(ROOT, 'fixtures/media/scenarios');
const GOLDEN_DIR = join(ROOT, 'fixtures/golden');

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

// ── ffprobe + normalization (VERBATIM from fixtures/bake.mjs) ─────────────────────────────────────
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

function canonicalCodec(name) {
  const n = (name || '').toLowerCase();
  const map = {
    h264: 'h264', hevc: 'hevc', h265: 'hevc', vp8: 'vp8', vp9: 'vp9', av1: 'av1',
    aac: 'aac', opus: 'opus', mp3: 'mp3', flac: 'flac', vorbis: 'vorbis',
    pcm_s16le: 'pcm-s16', pcm_s24le: 'pcm-s24', pcm_f32le: 'pcm-f32',
    pcm_s16be: 'pcm-s16be', pcm_s24be: 'pcm-s24be',
    mjpeg: 'mjpeg', png: 'png', webp: 'webp',
  };
  return map[n] ?? n;
}

function canonicalContainer(formatName, assetId) {
  const lower = assetId.toLowerCase();
  if (lower === 'mislabeled_h264.webm') return 'mp4';
  if (lower.endsWith('.mov')) return 'mov';
  if (lower.endsWith('.mp4') || lower.endsWith('.m4a') || lower.endsWith('.m4v')) return 'mp4';
  if (lower.endsWith('.mkv')) return 'mkv';
  if (lower.endsWith('.webm')) return 'webm';
  if (lower.endsWith('.ts')) return 'ts';
  if (lower.endsWith('.m3u8')) return 'hls';
  if (lower.endsWith('.wav')) return 'wav';
  if (lower.endsWith('.aiff') || lower.endsWith('.aif')) return 'aiff';
  if (lower.endsWith('.mp3')) return 'mp3';
  if (lower.endsWith('.flac')) return 'flac';
  if (lower.endsWith('.ogg') || lower.endsWith('.opus')) return 'ogg';
  if (lower.endsWith('.aac')) return 'adts';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'jpeg';
  if (lower.endsWith('.png')) return 'png';
  if (lower.endsWith('.webp')) return 'webp';
  return (formatName || '').split(',')[0] || 'unknown';
}

function parseFps(stream) {
  const r = stream.avg_frame_rate && stream.avg_frame_rate !== '0/0' ? stream.avg_frame_rate : stream.r_frame_rate;
  if (!r || r === '0/0') return undefined;
  const [num, den] = r.split('/').map(Number);
  if (!den) return undefined;
  const fps = num / den;
  return Number.isFinite(fps) ? Math.round(fps * 1000) / 1000 : undefined;
}

function rotationOf(stream) {
  const sd = (stream.side_data_list || []).find((s) => typeof s.rotation === 'number');
  if (sd) return ((Math.round(sd.rotation) % 360) + 360) % 360;
  const tagRot = stream.tags?.rotate;
  if (tagRot != null) return ((parseInt(tagRot, 10) % 360) + 360) % 360;
  return undefined;
}

function goldenInputOpts(assetId) {
  if (assetId.toLowerCase().endsWith('.m3u8')) {
    return ['-allowed_extensions', 'ALL', '-protocol_whitelist', 'file,crypto,data,http,https,tcp,tls'];
  }
  return [];
}

function normalizedMetadataFor(assetId, mediaPath) {
  const inOpts = goldenInputOpts(assetId);
  const probe = ffprobeJson([...inOpts, '-show_format', '-show_streams', mediaPath], `${assetId} meta`);
  const fmt = probe.format || {};
  const streams = probe.streams || [];
  const tracks = streams.map((s) => {
    const type = s.codec_type === 'video' ? 'video' : s.codec_type === 'audio' ? 'audio' : s.codec_type === 'subtitle' ? 'subtitle' : 'other';
    const track = { type, codec: canonicalCodec(s.codec_name) };
    if (s.width) track.width = s.width;
    if (s.height) track.height = s.height;
    const fps = parseFps(s);
    if (type === 'video' && fps !== undefined) track.fps = fps;
    const rot = rotationOf(s);
    if (rot !== undefined && rot !== 0) track.rotation = rot;
    if (s.sample_rate) track.sampleRate = Number(s.sample_rate);
    if (s.channels) track.channels = s.channels;
    const br = s.bit_rate ? Number(s.bit_rate) : fmt.bit_rate ? Number(fmt.bit_rate) : null;
    track.bitrate = Number.isFinite(br) ? br : null;
    track.language = s.tags?.language ?? null;
    return track;
  });
  const durRaw = fmt.duration != null ? Number(fmt.duration) : NaN;
  const durationSec = Number.isFinite(durRaw) ? Math.round(durRaw * 1000) / 1000 : null;
  const meta = { container: canonicalContainer(fmt.format_name, assetId), durationSec, tracks };
  const tagKeys = ['title', 'artist', 'album', 'comment', 'encoder', 'major_brand'];
  const tags = {};
  for (const k of tagKeys) if (fmt.tags?.[k]) tags[k] = String(fmt.tags[k]);
  if (Object.keys(tags).length) meta.tags = tags;
  return meta;
}

function packetsFor(assetId, mediaPath) {
  const inOpts = goldenInputOpts(assetId);
  const probe = ffprobeJson([...inOpts, '-show_packets', '-show_entries', 'packet=stream_index,size,pts_time,dts_time,flags', mediaPath], `${assetId} packets`);
  const pkts = probe.packets || [];
  return pkts.map((p) => {
    const ptsUs = p.pts_time != null && p.pts_time !== 'N/A' ? Math.round(Number(p.pts_time) * 1e6) : 0;
    const dtsUs = p.dts_time != null && p.dts_time !== 'N/A' ? Math.round(Number(p.dts_time) * 1e6) : ptsUs;
    const keyframe = typeof p.flags === 'string' ? p.flags.includes('K') : false;
    return { trackIndex: Number(p.stream_index) || 0, size: Number(p.size) || 0, ptsUs, dtsUs, keyframe };
  });
}

// ── Frame-digest PLACEHOLDER (browser-filled) ─────────────────────────────────────────────────────
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

/** Resolve a frame's presentation time in seconds: best_effort_timestamp_time, else pts_time; null if neither. */
function frameTimeSec(f) {
  for (const k of ['best_effort_timestamp_time', 'pts_time']) {
    const v = f[k];
    if (v != null && v !== 'N/A') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

/** How many presentation frames the golden lists (matches the flat corpus's 12-frame convention). */
const FRAME_COUNT = 12;
/**
 * How many DECODE-order frames to read before selecting. `-read_intervals %+#N` reads the first N frames
 * in DECODE (coded) order; for B-frame content the first FRAME_COUNT *presentation* frames can be spread
 * across MORE than FRAME_COUNT decoded frames (a later-decoded B-frame carries an earlier PTS). Reading a
 * generous multiple (past any realistic reorder depth), sorting by PTS, and taking the first FRAME_COUNT
 * yields the true CONTIGUOUS first-FRAME_COUNT presentation frames — so golden[i].ptsUs === presentation
 * frame i, which is REQUIRED: the browser pass fills golden[i] from the decoded frame AT golden[i].ptsUs
 * and the oracle matches by that index. (The old `%+#12` grabbed 12 DECODE frames and, after sorting,
 * DROPPED the reordered B-frame at the tail while KEEPING a later P-frame — a non-contiguous gap, e.g.
 * [0…166667,200000] missing 183333 — which mislabels the tail golden entry.)
 */
const FRAME_READ_COUNT = 60;

/**
 * Build the `<id>.frames.json` PLACEHOLDER for a video-bearing real file — the SAME $todo/pending shape
 * fixtures/bake.mjs `frameHookFor` emits for the flat corpus (so the browser pass + oracles read it
 * byte-identically), with robustness refinements the nested corpus needs: (1) resolve each frame's time
 * from best_effort_timestamp_time (falling back to pts_time) so VFR/edge frames that carry only a
 * best-effort stamp are not dropped; (2) read FRAME_READ_COUNT decoded frames, sort into presentation
 * (PTS) order, and take the first CONTIGUOUS FRAME_COUNT — never a decode-order gap (see FRAME_READ_COUNT).
 * Never invents a digest: every sha256 is null and pending stays true until the platform pass.
 */
function framePlaceholderFor(assetId, mediaPath) {
  let entries = [];
  try {
    const inOpts = goldenInputOpts(assetId);
    const probe = ffprobeJson(
      [...inOpts, '-select_streams', 'v:0', '-show_frames', '-show_entries', 'frame=pts_time,best_effort_timestamp_time,key_frame', '-read_intervals', `%+#${FRAME_READ_COUNT}`, mediaPath],
      `${assetId} frames-hook`,
    );
    entries = (probe.frames || [])
      .map((f) => {
        const t = frameTimeSec(f);
        return t == null ? null : { ptsUs: Math.round(t * 1e6), keyframe: f.key_frame === 1 || f.key_frame === '1' };
      })
      .filter((e) => e !== null)
      .sort((a, b) => a.ptsUs - b.ptsUs)
      .slice(0, FRAME_COUNT); // first CONTIGUOUS presentation frames (0..FRAME_COUNT-1)
  } catch {
    entries = [];
  }
  return {
    $todo:
      'BROWSER-PRODUCED GOLDEN. These frame digests are sha256 of the normalized RGBA buffer ' +
      '(src/engines/platform/digest.ts) decoded in a real browser — ffmpeg cannot produce them. ' +
      'Run the suite frame-bake pass (decode this asset with the platform engine, digestFrame each ' +
      'listed pts, and write the sha256 into `frames[].sha256`) then commit. Until then `frames` is ' +
      'a placeholder and the decoded-frames-bitexact oracle for this asset should report NA/skip.',
    pending: true,
    assetId,
    frames: entries.map((p, index) => ({ index, ptsUs: p.ptsUs, keyframe: p.keyframe, sha256: null })),
  };
}

function writeJson(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2) + '\n');
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
      if (!existsSync(mediaPath)) { missing++; continue; }

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
        writeJson(framesPath, framePlaceholderFor(assetId, mediaPath));
        // A fresh PENDING placeholder means "not yet baked" → any prior luma-signature side-file is now
        // stale and MUST go: loadGolden reads ssim.json independently of the frames `pending` flag, so a
        // lingering ssim.json would keep ssim-psnr scoring (a FAIL) instead of the honest NA the pending
        // frames golden intends. Removing it makes decodeFrameGoldenGap (runner.ts) resolve to NA_ASSET.
        rmSync(ssimPath, { force: true });
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
      if (!existsSync(mediaPath)) { missing++; continue; }

      const metaPath = join(GOLDEN_DIR, `${assetId}.meta.json`);
      if (opts.force || !existsSync(metaPath)) {
        try {
          writeJson(metaPath, normalizedMetadataFor(assetId, mediaPath));
          metaWritten++;
        } catch (e) { failed++; failures.push(`${assetId} meta: ${e.message}`); continue; }
      } else skipped++;

      if (bakePackets) {
        const pktPath = join(GOLDEN_DIR, `${assetId}.packets.json`);
        if (opts.force || !existsSync(pktPath)) {
          try { writeJson(pktPath, packetsFor(assetId, mediaPath)); packetsWritten++; }
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
}

main();
