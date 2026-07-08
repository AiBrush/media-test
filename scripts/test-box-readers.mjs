#!/usr/bin/env node
/**
 * scripts/test-box-readers.mjs — validation for src/core/box-readers.ts.
 * Run: `node scripts/test-box-readers.mjs`  (Node ≥ 22 strips the imported .ts types automatically).
 *
 * The whole point is to PROVE codec-token parity with the golden so the no-engine oracle never
 * false-FAILs. It runs four sections:
 *
 *   [1] On-disk parity vs the real corpus catalog (fixtures/media/scenarios/_sources.ndjson):
 *       for every baked mp4/mov/webm/mkv file (deduped by sha256) it parses the real bytes and
 *       asserts container family, track presence, per-track codec-token parity (every NON-NULL
 *       reader codec must be one the catalog declares for that track), and duration within
 *       max(0.5s, one-frame). A reader codec the catalog does not list = MISMATCH (a false-FAIL).
 *   [2] Exact per-track parity vs committed golden *.meta.json for any canonical asset whose bytes
 *       are baked at fixtures/media/<assetId> (strongest proof: exact codec STRINGS).
 *   [3] Synthetic minimal MP4 + WebM byte buffers with known tracks/duration (always runs, so the
 *       parser is proven even when the corpus is gitignored/unbaked).
 *   [4] Never-throw fuzzing on garbage / truncated / empty inputs.
 *
 * If the on-disk corpus is absent, sections [1]/[2] LOG that on-disk golden-parity was skipped and
 * the run still passes on [3]/[4]. Exit code is non-zero only on a real MISMATCH.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  readOutputStructure,
  readMp4Structure,
  readWebmStructure,
  canonicalCodecToken,
} from '../src/core/box-readers.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MEDIA = path.join(ROOT, 'fixtures', 'media');
const SCEN = path.join(MEDIA, 'scenarios');
const NDJSON = path.join(SCEN, '_sources.ndjson');
const GOLDEN = path.join(ROOT, 'fixtures', 'golden');

const HEAD_CAP = 24 * 1024 * 1024; // captures ftyp+moov (faststart) and EBML Info/Tracks.
const TAIL_CAP = 24 * 1024 * 1024; // fallback for a non-faststart MP4 (moov at EOF).
const ONE_FRAME_SEC = 1 / 24;
const DUR_TOL = Math.max(0.5, ONE_FRAME_SEC);

const MP4_FAMILY = new Set(['mp4', 'mov', 'm4a', 'm4v', 'm4b', 'qt', '3gp']);
const WEBM_FAMILY = new Set(['webm', 'mkv', 'mka', 'mks', 'matroska']);
function containerFamily(c) {
  const s = String(c || '').toLowerCase();
  if (WEBM_FAMILY.has(s)) return 'webm';
  if (MP4_FAMILY.has(s)) return 'mp4';
  return s;
}

// ── tiny report framework ────────────────────────────────────────────────────────────────────────
let hardFail = 0;
const mismatches = [];
function mismatch(section, id, detail) {
  hardFail++;
  mismatches.push(`  MISMATCH [${section}] ${id}: ${detail}`);
}
function assertEq(section, id, got, want, label) {
  if (got !== want) mismatch(section, id, `${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
}

// ── slice readers ────────────────────────────────────────────────────────────────────────────────
function readSlice(file, start, length) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(length);
    const n = fs.readSync(fd, buf, 0, length, start);
    return new Uint8Array(buf.buffer, buf.byteOffset, n);
  } finally {
    fs.closeSync(fd);
  }
}

/** Parse an on-disk media file with a bounded head read + a tail-moov fallback for non-faststart MP4. */
function parseFile(file, size, family) {
  const head = readSlice(file, 0, Math.min(size, HEAD_CAP));
  let res = readOutputStructure(head, family);
  if (family === 'mp4' && (!res || res.tracks.length === 0) && size > HEAD_CAP) {
    const tail = readSlice(file, Math.max(0, size - TAIL_CAP), Math.min(size, TAIL_CAP));
    const moovAt = findLastMoov(tail);
    if (moovAt >= 0) {
      const alt = readMp4Structure(tail.subarray(moovAt));
      if (alt && alt.tracks.length) res = alt;
    }
  }
  return res;
}

/** Locate the start (the 4-byte size field) of the last top-level `moov` box within a slice. */
function findLastMoov(bytes) {
  const M = [0x6d, 0x6f, 0x6f, 0x76]; // 'moov'
  for (let i = bytes.length - 4; i >= 4; i--) {
    if (bytes[i] === M[0] && bytes[i + 1] === M[1] && bytes[i + 2] === M[2] && bytes[i + 3] === M[3]) {
      return i - 4; // include the preceding 4-byte size so readBoxes sees a proper box.
    }
  }
  return -1;
}

// ── section [1]: on-disk parity vs _sources.ndjson ────────────────────────────────────────────────
function section1() {
  console.log('\n[1] On-disk parity vs fixtures/media/scenarios/_sources.ndjson');
  if (!fs.existsSync(NDJSON)) {
    console.log('    SKIPPED — _sources.ndjson not found (corpus gitignored/unbaked).');
    return { tested: 0, skipped: true };
  }
  const rows = fs
    .readFileSync(NDJSON, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  // Dedupe by sha256 → one representative on-disk path per unique file.
  const bySha = new Map();
  for (const row of rows) {
    const sid = row.scenarioId;
    for (const f of row.files || []) {
      if (!MP4_FAMILY.has(String(f.container).toLowerCase()) && !WEBM_FAMILY.has(String(f.container).toLowerCase())) continue;
      const cands = [path.join(SCEN, sid, f.file)];
      if (f.poolPath) cands.push(path.join(SCEN, f.poolPath));
      const found = cands.find((c) => fs.existsSync(c));
      if (!found) continue;
      const key = f.sha256 || found;
      if (!bySha.has(key)) bySha.set(key, { file: found, rec: f });
    }
  }

  if (bySha.size === 0) {
    console.log('    SKIPPED — no baked mp4/mov/webm/mkv bytes on disk.');
    return { tested: 0, skipped: true };
  }

  let tested = 0;
  let durChecked = 0;
  let durSkipped = 0;
  let codecMatched = 0;
  let codecSkippedNull = 0;
  const byContainer = {};

  for (const { file, rec } of bySha.values()) {
    const size = fs.statSync(file).size;
    const family = containerFamily(rec.container);
    const rel = path.relative(ROOT, file);
    let st;
    try {
      st = parseFile(file, size, family);
    } catch (e) {
      mismatch('1', rel, `reader THREW: ${e?.message || e}`); // must never happen
      continue;
    }
    if (!st) {
      mismatch('1', rel, `reader returned null for a valid ${rec.container} file`);
      continue;
    }
    tested++;
    byContainer[rec.container] = (byContainer[rec.container] || 0) + 1;

    // container family
    assertEq('1', rel, st.container, family, 'container family');

    const vTracks = st.tracks.filter((t) => t.type === 'video');
    const aTracks = st.tracks.filter((t) => t.type === 'audio');
    const declV = new Set(rec.videoCodecs || []);
    const declA = new Set(rec.audioCodecs || []);

    // presence
    if (declV.size > 0 && vTracks.length === 0) mismatch('1', rel, `expected video track(s) [${[...declV]}], reader found none`);
    if (declA.size > 0 && aTracks.length === 0) mismatch('1', rel, `expected audio track(s) [${[...declA]}], reader found none`);

    // codec-token parity — every NON-NULL reader codec must be declared for that track type.
    for (const t of vTracks) {
      if (t.codec == null) {
        codecSkippedNull++;
        continue;
      }
      if (!declV.has(t.codec)) mismatch('1', rel, `video codec '${t.codec}' NOT in declared [${[...declV]}] (false-FAIL risk)`);
      else codecMatched++;
    }
    for (const t of aTracks) {
      if (t.codec == null) {
        codecSkippedNull++;
        continue;
      }
      if (!declA.has(t.codec)) mismatch('1', rel, `audio codec '${t.codec}' NOT in declared [${[...declA]}] (false-FAIL risk)`);
      else codecMatched++;
    }

    // duration within max(0.5s, one-frame)
    const want = rec.durationSec;
    if (typeof want === 'number' && want > 0 && typeof st.durationSec === 'number') {
      durChecked++;
      const delta = Math.abs(st.durationSec - want);
      if (delta > DUR_TOL) mismatch('1', rel, `duration ${st.durationSec.toFixed(3)}s vs catalog ${want.toFixed(3)}s (Δ ${delta.toFixed(3)}s > ${DUR_TOL}s)`);
    } else {
      durSkipped++;
    }
  }

  console.log(`    tested ${tested} unique file(s): ${JSON.stringify(byContainer)}`);
  console.log(`    codec tokens: ${codecMatched} matched declared, ${codecSkippedNull} returned null (safely skipped)`);
  console.log(`    duration: ${durChecked} checked, ${durSkipped} skipped (no reader/catalog duration)`);
  return { tested, skipped: false };
}

// ── section [2]: exact per-track parity vs committed golden *.meta.json ────────────────────────────
function section2() {
  console.log('\n[2] Exact per-track parity vs committed golden *.meta.json (baked canonical assets)');
  if (!fs.existsSync(GOLDEN)) {
    console.log('    SKIPPED — fixtures/golden not found.');
    return { tested: 0 };
  }
  const metas = fs.readdirSync(GOLDEN).filter((n) => n.endsWith('.meta.json'));
  let tested = 0;
  for (const metaName of metas) {
    let meta;
    try {
      meta = JSON.parse(fs.readFileSync(path.join(GOLDEN, metaName), 'utf8'));
    } catch {
      continue;
    }
    if (containerFamily(meta.container) !== 'mp4' && containerFamily(meta.container) !== 'webm') continue;
    const asset = metaName.slice(0, -'.meta.json'.length); // e.g. h264_10bit_1080p_5s.mp4
    const media = path.join(MEDIA, asset);
    if (!fs.existsSync(media)) continue;

    const size = fs.statSync(media).size;
    const st = parseFile(media, size, containerFamily(meta.container));
    if (!st) {
      mismatch('2', asset, `reader returned null for baked ${meta.container} asset`);
      continue;
    }
    tested++;
    assertEq('2', asset, st.container, containerFamily(meta.container), 'container family');

    // Every reader video/audio track's non-null codec must EXACTLY equal a golden track codec of the
    // same type (this proves the returned strings are drawn verbatim from the golden vocabulary).
    const goldV = (meta.tracks || []).filter((t) => t.type === 'video').map((t) => t.codec);
    const goldA = (meta.tracks || []).filter((t) => t.type === 'audio').map((t) => t.codec);
    for (const t of st.tracks) {
      if (t.type === 'video' && t.codec != null && !goldV.includes(t.codec)) mismatch('2', asset, `video codec '${t.codec}' not in golden ${JSON.stringify(goldV)}`);
      if (t.type === 'audio' && t.codec != null && !goldA.includes(t.codec)) mismatch('2', asset, `audio codec '${t.codec}' not in golden ${JSON.stringify(goldA)}`);
    }

    // presence of the golden's video/audio tracks
    if (goldV.length && !st.tracks.some((t) => t.type === 'video')) mismatch('2', asset, 'golden has video, reader found none');
    if (goldA.length && !st.tracks.some((t) => t.type === 'audio')) mismatch('2', asset, 'golden has audio, reader found none');

    // duration
    if (typeof meta.durationSec === 'number' && meta.durationSec > 0 && typeof st.durationSec === 'number') {
      const delta = Math.abs(st.durationSec - meta.durationSec);
      if (delta > DUR_TOL) mismatch('2', asset, `duration ${st.durationSec.toFixed(3)}s vs golden ${meta.durationSec.toFixed(3)}s (Δ ${delta.toFixed(3)}s)`);
    }
    console.log(`    ok — ${asset}: reader ${JSON.stringify(compact(st))} vs golden tracks ${JSON.stringify((meta.tracks || []).map((t) => `${t.type}:${t.codec}`))}`);
  }
  if (tested === 0) console.log('    SKIPPED — no canonical asset bytes baked on disk (media gitignored).');
  return { tested };
}
function compact(st) {
  return {
    c: st.container,
    d: st.durationSec != null ? Number(st.durationSec.toFixed(3)) : null,
    t: st.tracks.map((t) => `${t.type}:${t.codec}${t.width ? `:${t.width}x${t.height}` : ''}`),
  };
}

// ── section [3]: synthetic buffers (always) ───────────────────────────────────────────────────────
const enc = new TextEncoder();
function cat(arrs) {
  let len = 0;
  for (const a of arrs) len += a.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}
function u32be(n) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0);
  return b;
}
function u16be(n) {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n & 0xffff);
  return b;
}
function zeros(n) {
  return new Uint8Array(n);
}
function mp4box(type, ...parts) {
  const payload = cat(parts);
  return cat([u32be(8 + payload.length), enc.encode(type), payload]);
}

function buildSyntheticMp4() {
  // mvhd: timescale=1000, duration=5000 → 5.0s
  const mvhd = mp4box('mvhd', cat([u32be(0), u32be(0), u32be(0), u32be(1000), u32be(5000), zeros(80)]));

  const hdlr = (kind) => mp4box('hdlr', cat([u32be(0), u32be(0), enc.encode(kind), zeros(12)]));

  // VisualSampleEntry with width=1920,height=1080 at seBody+24/+26
  const avc1 = mp4box(
    'avc1',
    cat([zeros(6), u16be(1), zeros(16), u16be(1920), u16be(1080), u32be(0x00480000), u32be(0x00480000), u32be(0), u16be(1), zeros(32), u16be(24), u16be(0xffff)]),
  );
  const videoStsd = mp4box('stsd', cat([u32be(0), u32be(1), avc1]));
  const videoTkhd = mp4box(
    'tkhd',
    cat([u32be(0), u32be(0), u32be(0), u32be(1), u32be(0), u32be(5000), zeros(8), u16be(0), u16be(0), u16be(0), u16be(0), zeros(36), u32be(1920 << 16), u32be(1080 << 16)]),
  );
  const videoTrak = mp4box('trak', videoTkhd, mp4box('mdia', hdlr('vide'), mp4box('minf', mp4box('stbl', videoStsd))));

  const mp4a = mp4box('mp4a', cat([zeros(6), u16be(1), zeros(8), u16be(2), u16be(16), u16be(0), u16be(0), u32be(48000 << 16)]));
  const audioStsd = mp4box('stsd', cat([u32be(0), u32be(1), mp4a]));
  const audioTkhd = mp4box(
    'tkhd',
    cat([u32be(0), u32be(0), u32be(0), u32be(2), u32be(0), u32be(5000), zeros(8), u16be(0), u16be(0), u16be(0), u16be(0), zeros(36), u32be(0), u32be(0)]),
  );
  const audioTrak = mp4box('trak', audioTkhd, mp4box('mdia', hdlr('soun'), mp4box('minf', mp4box('stbl', audioStsd))));

  const moov = mp4box('moov', mvhd, videoTrak, audioTrak);
  const ftyp = mp4box('ftyp', cat([enc.encode('isom'), u32be(0x200), enc.encode('isomiso2avc1mp41')]));
  return cat([ftyp, moov]);
}

// minimal EBML writer
const EID = {
  Header: [0x1a, 0x45, 0xdf, 0xa3],
  DocType: [0x42, 0x82],
  Segment: [0x18, 0x53, 0x80, 0x67],
  Info: [0x15, 0x49, 0xa9, 0x66],
  TimecodeScale: [0x2a, 0xd7, 0xb1],
  Duration: [0x44, 0x89],
  Tracks: [0x16, 0x54, 0xae, 0x6b],
  TrackEntry: [0xae],
  TrackType: [0x83],
  CodecID: [0x86],
  Video: [0xe0],
  PixelWidth: [0xb0],
  PixelHeight: [0xba],
};
function ebmlSize(n) {
  let L = 1;
  while (L < 8 && n >= Math.pow(2, 7 * L) - 1) L++;
  const b = new Uint8Array(L);
  let v = n;
  for (let i = L - 1; i >= 0; i--) {
    b[i] = v & 0xff;
    v = Math.floor(v / 256);
  }
  b[0] |= 0x80 >> (L - 1);
  return b;
}
function el(idArr, payload) {
  const id = new Uint8Array(idArr);
  return cat([id, ebmlSize(payload.length), payload]);
}
function uintBytes(n) {
  if (n === 0) return new Uint8Array([0]);
  const tmp = [];
  let v = n;
  while (v > 0) {
    tmp.unshift(v & 0xff);
    v = Math.floor(v / 256);
  }
  return new Uint8Array(tmp);
}
function f32be(f) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setFloat32(0, f);
  return b;
}
function buildSyntheticWebm() {
  const header = el(EID.Header, el(EID.DocType, enc.encode('webm')));
  const info = el(EID.Info, cat([el(EID.TimecodeScale, uintBytes(1000000)), el(EID.Duration, f32be(5000))]));
  const video = el(
    EID.TrackEntry,
    cat([el(EID.TrackType, new Uint8Array([1])), el(EID.CodecID, enc.encode('V_VP9')), el(EID.Video, cat([el(EID.PixelWidth, uintBytes(640)), el(EID.PixelHeight, uintBytes(480))]))]),
  );
  const audio = el(EID.TrackEntry, cat([el(EID.TrackType, new Uint8Array([2])), el(EID.CodecID, enc.encode('A_OPUS'))]));
  const tracks = el(EID.Tracks, cat([video, audio]));
  const segment = el(EID.Segment, cat([info, tracks]));
  return cat([header, segment]);
}

function section3() {
  console.log('\n[3] Synthetic minimal buffers (parser proof, always runs)');

  const mp4 = buildSyntheticMp4();
  const m = readOutputStructure(mp4);
  if (!m) mismatch('3', 'synthetic.mp4', 'reader returned null');
  else {
    assertEq('3', 'synthetic.mp4', m.container, 'mp4', 'container');
    assertEq('3', 'synthetic.mp4', m.tracks.length, 2, 'track count');
    assertEq('3', 'synthetic.mp4', m.durationSec, 5, 'durationSec');
    const v = m.tracks.find((t) => t.type === 'video');
    const a = m.tracks.find((t) => t.type === 'audio');
    assertEq('3', 'synthetic.mp4', v?.codec, 'h264', 'video codec');
    assertEq('3', 'synthetic.mp4', v?.width, 1920, 'video width');
    assertEq('3', 'synthetic.mp4', v?.height, 1080, 'video height');
    assertEq('3', 'synthetic.mp4', a?.codec, 'aac', 'audio codec');
    console.log(`    ok — synthetic.mp4 → ${JSON.stringify(compact(m))}`);
  }

  const webm = buildSyntheticWebm();
  const w = readOutputStructure(webm);
  if (!w) mismatch('3', 'synthetic.webm', 'reader returned null');
  else {
    assertEq('3', 'synthetic.webm', w.container, 'webm', 'container');
    assertEq('3', 'synthetic.webm', w.tracks.length, 2, 'track count');
    assertEq('3', 'synthetic.webm', w.durationSec, 5, 'durationSec');
    const v = w.tracks.find((t) => t.type === 'video');
    const a = w.tracks.find((t) => t.type === 'audio');
    assertEq('3', 'synthetic.webm', v?.codec, 'vp9', 'video codec');
    assertEq('3', 'synthetic.webm', v?.width, 640, 'video width');
    assertEq('3', 'synthetic.webm', v?.height, 480, 'video height');
    assertEq('3', 'synthetic.webm', a?.codec, 'opus', 'audio codec');
    console.log(`    ok — synthetic.webm → ${JSON.stringify(compact(w))}`);
  }

  // dispatch: hints + explicit readers
  assertEq('3', 'dispatch', readOutputStructure(mp4, 'video/mp4')?.container, 'mp4', 'hint mp4');
  assertEq('3', 'dispatch', readOutputStructure(webm, 'audio/webm')?.container, 'webm', 'hint webm');
  assertEq('3', 'dispatch', readMp4Structure(webm), null, 'mp4 reader rejects webm');
  assertEq('3', 'dispatch', readWebmStructure(mp4), null, 'webm reader rejects mp4');

  // canonicalCodecToken spot checks (the exact golden vocabulary)
  const tokenCases = [
    ['avc1', 'h264'], ['avc3', 'h264'], ['hev1', 'hevc'], ['hvc1', 'hevc'], ['vp09', 'vp9'],
    ['av01', 'av1'], ['mp4a', 'aac'], ['alac', 'alac'], ['Opus', 'opus'], ['fLaC', 'flac'],
    ['V_VP9', 'vp9'], ['V_VP8', 'vp8'], ['V_AV1', 'av1'], ['V_MPEG4/ISO/AVC', 'h264'],
    ['V_MPEGH/ISO/HEVC', 'hevc'], ['A_OPUS', 'opus'], ['A_VORBIS', 'vorbis'],
    ['A_AAC', 'aac'], ['A_AAC/MPEG4/LC', 'aac'], ['A_FLAC', 'flac'], ['A_MPEG/L3', 'mp3'],
    ['V_MJPEG', 'mjpeg'],
    // MUST be null (unmappable / would risk a false-FAIL against the golden vocabulary):
    ['ac-3', null], ['ec-3', null], ['twos', null], ['sowt', null], ['lpcm', null],
    ['in24', null], ['fl32', null], ['A_PCM/INT/LIT', null], ['A_MPEG/L2', null],
    ['tmcd', null], ['', null],
  ];
  for (const [raw, want] of tokenCases) assertEq('3', 'canonicalCodecToken', canonicalCodecToken(raw), want, `token(${JSON.stringify(raw)})`);
  console.log(`    ok — ${tokenCases.length} canonicalCodecToken cases (H.265→'hevc', PCM/AC-3→null)`);
}

// ── section [4]: never-throw fuzzing ──────────────────────────────────────────────────────────────
function section4() {
  console.log('\n[4] Never-throw on garbage / truncated / empty inputs');
  const cases = [
    new Uint8Array(0),
    new Uint8Array([0]),
    new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), // EBML magic only, nothing after
    new Uint8Array([0, 0, 0, 0x10, 0x6d, 0x6f, 0x6f, 0x76]), // 'moov' claiming 16 bytes, only 8 present
    new Uint8Array([0, 0, 0, 1, 0x6d, 0x6f, 0x6f, 0x76, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]), // 64-bit size overflow
    Uint8Array.from({ length: 4096 }, (_, i) => (i * 131 + 7) & 0xff), // pseudo-random noise
    buildSyntheticMp4().subarray(0, 40), // truncated valid MP4
    buildSyntheticWebm().subarray(0, 12), // truncated valid WebM
  ];
  let ok = 0;
  for (let i = 0; i < cases.length; i++) {
    try {
      const a = readOutputStructure(cases[i]);
      const b = readMp4Structure(cases[i]);
      const c = readWebmStructure(cases[i]);
      void a;
      void b;
      void c;
      ok++;
    } catch (e) {
      mismatch('4', `fuzz#${i}`, `THREW: ${e?.message || e}`);
    }
  }
  console.log(`    ok — ${ok}/${cases.length} inputs handled without throwing`);
}

// ── main ──────────────────────────────────────────────────────────────────────────────────────────
console.log('box-readers validation — proving codec-token parity so the no-engine oracle never false-FAILs');
const s1 = section1();
const s2 = section2();
section3();
section4();

console.log('\n────────────────────────────────────────────────────────');
if (s1.skipped && s2.tested === 0) {
  console.log('NOTE: on-disk golden-parity validation was SKIPPED (corpus media gitignored/unbaked);');
  console.log('      parser correctness still proven by synthetic buffers [3] + fuzzing [4].');
} else {
  console.log(`on-disk parity: [1] ${s1.tested} corpus file(s), [2] ${s2.tested} canonical asset(s)`);
}
if (hardFail === 0) {
  console.log('RESULT: ALL CHECKS PASSED — 0 mismatches. Reader codec tokens are golden-parity safe.');
  process.exit(0);
} else {
  console.log(`RESULT: ${hardFail} MISMATCH(es):`);
  for (const m of mismatches.slice(0, 40)) console.log(m);
  if (mismatches.length > 40) console.log(`  … and ${mismatches.length - 40} more`);
  process.exit(1);
}
