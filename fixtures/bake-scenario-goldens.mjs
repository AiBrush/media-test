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
 * Frame/SSIM goldens (decode-seek/decrypt) are NOT produced here — those require the in-browser
 * WebCodecs decoder (scripts/frame-bake.mjs), a heavier separate pass.
 *
 * Usage:
 *   bun fixtures/bake-scenario-goldens.mjs [--force] [--packets] [--family <fam>] [<id-substring> ...]
 *     --force            overwrite existing scenario goldens (default: skip present)
 *     --packets          also bake packets.json for EVERY selected file (default: demux family only)
 *     --family <fam>     restrict to one family (e.g. probe, demux, metadata)
 *     <id-substring>     positional filters: only scenarios whose id contains a term
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(new URL(import.meta.url).pathname), '..');
const SOURCES = join(ROOT, 'fixtures/media/scenarios/_sources.ndjson');
const MEDIA_SCENARIOS = join(ROOT, 'fixtures/media/scenarios');
const GOLDEN_DIR = join(ROOT, 'fixtures/golden');

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opts = { force: false, packets: false, family: /** @type {string|null} */ (null), terms: /** @type {string[]} */ ([]) };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--force') opts.force = true;
  else if (a === '--packets') opts.packets = true;
  else if (a === '--family') opts.family = argv[++i] ?? null;
  else if (a === '--help' || a === '-h') { console.log('bun fixtures/bake-scenario-goldens.mjs [--force] [--packets] [--family <fam>] [<id-substring> ...]'); process.exit(0); }
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

function main() {
  const rows = loadRows().filter(selected);
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
