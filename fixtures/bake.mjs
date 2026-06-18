#!/usr/bin/env bun
/**
 * fixtures/bake.mjs — the ONE-TIME, OFFLINE fixture bake (§2, §7).
 * Runtime: bun (run via `bun fixtures/bake.mjs`). ffmpeg/ffprobe binaries are allowed HERE ONLY.
 *
 * This is the ONLY place in the whole project where a native binary (ffmpeg / ffprobe / optional
 * Bento4|shaka) may run. The browser test loop never shells out. The bake:
 *   1. Deterministically GENERATES each corpus asset with ffmpeg from synthetic sources
 *      (testsrc2 / sine), fixed params + `-fflags +bitexact` wherever the muxer honors it.
 *   2. Computes sha256 + sizeBytes and writes them back into fixtures/manifest.json.
 *   3. Bakes GOLDEN ground truth into fixtures/golden/:
 *        - <id>.meta.json    NormalizedMetadata, from `ffprobe -show_format -show_streams`
 *        - <id>.packets.json PacketInfo[], from `ffprobe -show_packets`
 *        - <id>.frames.json  a TODO/hook stub — frame digests are the BROWSER's normalized-RGBA
 *                            sha256 (oracles.ts/digest.ts), NOT something ffmpeg can produce.
 *                            We emit a clearly-marked placeholder so the browser frame pass fills it.
 *
 * Idempotent + re-runnable: an asset whose file already exists with a matching size is skipped
 * unless --force. Assets ffmpeg cannot make in this environment (cbcs, sometimes AES-128 HLS, the
 * MediaRecorder webm) are recorded to a `skipped` list with a reason instead of being faked.
 *
 * Runs under bun (the project uses bun exclusively; node/npm/npx are unavailable). It uses only the
 * node: builtins bun implements (child_process/crypto/fs/path/os/url). Prefer the wrapper
 * `scripts/bake-fixtures.sh`, which invokes `bun fixtures/bake.mjs`.
 *
 * Usage:
 *   bun fixtures/bake.mjs                 # bake everything (slow: ~hours possible w/ longform)
 *   bun fixtures/bake.mjs --subset a,b    # bake only assets whose id matches (substring) a or b
 *   bun fixtures/bake.mjs h264_1080p_30s.mp4 wav_s16.wav   # positional ids == subset
 *   bun fixtures/bake.mjs --skip-longform # bake all but the multi-hour stress asset
 *   bun fixtures/bake.mjs --force         # regenerate even if the file already exists
 *   bun fixtures/bake.mjs --golden-only   # (re)derive golden from existing media; no generation
 *   bun fixtures/bake.mjs --media-only    # generate media + checksums; skip golden
 *   bun fixtures/bake.mjs --quiet
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

// ── Paths ──────────────────────────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = __dirname;
const MEDIA_DIR = join(FIXTURES_DIR, 'media');
const GOLDEN_DIR = join(FIXTURES_DIR, 'golden');
const MANIFEST_PATH = join(FIXTURES_DIR, 'manifest.json');

// ── Determinism knobs ────────────────────────────────────────────────────────────────────────

/** Common ffmpeg flags for reproducible output. -fflags +bitexact + bitexact codec flags strip
 *  encoder version strings / random padding. -map_metadata -1 drops creation_time etc. The set
 *  applies to encoders that honor it (libx264/265/vpx/aac all do); muxers vary, hence per-asset
 *  containers also re-stamp. */
const BITEXACT = ['-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact'];
const NOMETA = ['-map_metadata', '-1'];

// Fixed source seeds: testsrc2 + sine are deterministic by construction (no rng), so the same
// ffmpeg build + same flags → byte-identical output. We pin frame rate + sample rate explicitly.

// ── CLI parsing ────────────────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flags = {
  force: false,
  quiet: false,
  goldenOnly: false,
  mediaOnly: false,
  skipLongform: false,
  subset: /** @type {string[] | null} */ (null),
};
const subsetTerms = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--force') flags.force = true;
  else if (a === '--quiet') flags.quiet = true;
  else if (a === '--golden-only') flags.goldenOnly = true;
  else if (a === '--media-only') flags.mediaOnly = true;
  else if (a === '--skip-longform') flags.skipLongform = true;
  else if (a === '--subset') {
    const next = argv[++i] ?? '';
    for (const t of next.split(',')) if (t.trim()) subsetTerms.push(t.trim());
  } else if (a === '--help' || a === '-h') {
    printHelpAndExit();
  } else if (a.startsWith('--')) {
    console.error(`Unknown flag: ${a}`);
    printHelpAndExit(1);
  } else {
    // Positional: treat as a subset id/substring.
    subsetTerms.push(a.trim());
  }
}
if (subsetTerms.length) flags.subset = subsetTerms;

function printHelpAndExit(code = 0) {
  console.log(
    [
      'fixtures/bake.mjs — offline media + golden bake (binaries allowed here ONLY)',
      '',
      'bun fixtures/bake.mjs [--subset a,b | <id> <id> ...] [--force] [--golden-only]',
      '                      [--media-only] [--skip-longform] [--quiet]',
    ].join('\n'),
  );
  process.exit(code);
}

const log = (...m) => {
  if (!flags.quiet) console.log(...m);
};

// ── Tool discovery (binaries allowed in the bake only) ──────────────────────────────────────────

function toolExists(bin) {
  const probe = spawnSync(bin, ['-version'], { encoding: 'utf8' });
  if (probe.status === 0) return true;
  // metaflac uses --version; mp4encrypt prints usage on no args (status != 0). Fall back to which.
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { encoding: 'utf8' });
  return which.status === 0;
}

const TOOLS = {
  ffmpeg: toolExists('ffmpeg'),
  ffprobe: toolExists('ffprobe'),
  metaflac: toolExists('metaflac'),
  mp4encrypt: toolExists('mp4encrypt'), // Bento4
  packager: toolExists('packager') || toolExists('shaka-packager'), // shaka
};

if (!TOOLS.ffmpeg || !TOOLS.ffprobe) {
  console.error(
    'FATAL: ffmpeg and ffprobe are required for the offline bake and were not found on PATH.\n' +
      'The bake is the only place binaries may run (BUILD_INSTRUCTIONS §1/§7).',
  );
  process.exit(2);
}

function ffmpeg(args, label) {
  // -y overwrite, -nostdin so a background run never blocks on a prompt, -loglevel error to keep
  // the bake quiet unless something breaks.
  const full = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args];
  const res = spawnSync('ffmpeg', full, { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (res.status !== 0) {
    throw new Error(`ffmpeg failed for ${label}: ${res.stderr || res.error?.message || `exit ${res.status}`}`);
  }
}

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

// ── Pinned fetch (offline-once, sha256-verified) ────────────────────────────────────────────────
//
// §0.8: nothing is fetched at RUN time. The bake MAY fetch a pinned, sha256-verified public URL
// (§5.4 `fetched`). We DO NOT do unpinned trust-on-first-use: a download is only accepted if its
// sha256 matches a trusted expected value (from the manifest entry's `sha256`, or an env override
// such as BBB_MOV_SHA256). Without a trusted sha256 we refuse to download and leave the asset for
// the MISSING ASSETS block — an unverifiable blob never silently enters the corpus.
//
// Returns 'ok' on a verified download, or a { skipped, reason } object otherwise (never throws so a
// single un-pinned fetch can't abort the whole bake).
async function fetchPinned(url, outPath, expectedSha256, label) {
  if (!url) return { skipped: true, reason: `${label}: no sourceUrl to fetch from.` };
  if (!expectedSha256) {
    return {
      skipped: true,
      reason:
        `${label}: refusing to download ${url} without a trusted sha256 to verify against ` +
        '(no unpinned trust-on-first-use). Supply the checksum (manifest `sha256` or the documented ' +
        'env override) to enable the pinned fetch, or drop the file in manually (see MISSING ASSETS).',
    };
  }
  let buf;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) return { skipped: true, reason: `${label}: HTTP ${res.status} fetching ${url}` };
    buf = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    return { skipped: true, reason: `${label}: network error fetching ${url}: ${String(e?.message || e)}` };
  }
  const got = createHash('sha256').update(buf).digest('hex');
  if (got !== expectedSha256.toLowerCase()) {
    return {
      skipped: true,
      reason:
        `${label}: sha256 mismatch for ${url} — expected ${expectedSha256}, got ${got}. ` +
        'Refusing to use an unverified download. Update the pinned checksum if you trust this source.',
    };
  }
  writeFileSync(outPath, buf);
  return 'ok';
}

// ── Recipes ──────────────────────────────────────────────────────────────────────────────────
//
// Each recipe is a generator function (id, paths) => 'ok' | { skipped, reason }. It writes the
// media file at paths.out. Returning a `skipped` object records WHY rather than faking the asset.
// Recipes are pure ffmpeg (+ optional metaflac / Bento4 / shaka when present) — never browser work.

const SINE = (freq, secs, rate = 48000, ch = 2) =>
  `sine=frequency=${freq}:sample_rate=${rate}:duration=${secs}` + (ch === 1 ? '' : '');

/** testsrc2 video lavfi source string. */
const TESTSRC = (w, h, fps, secs) => `testsrc2=size=${w}x${h}:rate=${fps}:duration=${secs}`;

/** @type {Record<string, (out: string) => ('ok' | { skipped: true, reason: string, extra?: any })>} */
const RECIPES = {
  // ── Video MP4 / MOV ──────────────────────────────────────────────────────────────────────
  'h264_1080p_30s.mp4': (out) => {
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(1920, 1080, 30, 30),
        '-f', 'lavfi', '-i', SINE(440, 30),
        ...BITEXACT, ...NOMETA,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-g', '60', '-keyint_min', '60',
        '-x264-params', 'scenecut=0:bframes=0', // closed, regular GOP for stable packet tables
        '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
        '-movflags', '+faststart',
        out,
      ],
      'h264_1080p_30s.mp4',
    );
    return 'ok';
  },
  'h264_4k_10s.mp4': (out) => {
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(3840, 2160, 30, 10),
        '-f', 'lavfi', '-i', SINE(440, 10),
        ...BITEXACT, ...NOMETA,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-g', '60', '-keyint_min', '60',
        '-x264-params', 'scenecut=0:bframes=0',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
        '-movflags', '+faststart',
        out,
      ],
      'h264_4k_10s.mp4',
    );
    return 'ok';
  },
  'hevc_1080p_10s.mp4': (out) => {
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(1920, 1080, 30, 10),
        '-f', 'lavfi', '-i', SINE(440, 10),
        ...BITEXACT, ...NOMETA,
        '-c:v', 'libx265', '-pix_fmt', 'yuv420p', '-crf', '24', '-tag:v', 'hvc1',
        '-x265-params', 'log-level=error:keyint=60:min-keyint=60:scenecut=0:bframes=0',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
        '-movflags', '+faststart',
        out,
      ],
      'hevc_1080p_10s.mp4',
    );
    return 'ok';
  },
  'h264_bframes_1080p.mp4': (out) => {
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(1920, 1080, 30, 10),
        '-f', 'lavfi', '-i', SINE(440, 10),
        ...BITEXACT, ...NOMETA,
        // 3 B-frames, open GOP (no forced IDR cadence) → pts != dts reorder for the demux oracle.
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20',
        '-bf', '3', '-x264-params', 'b-adapt=2:open-gop=1:scenecut=40',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
        '-movflags', '+faststart',
        out,
      ],
      'h264_bframes_1080p.mp4',
    );
    return 'ok';
  },
  'h264_vfr.mp4': (out) => {
    // Irregular PTS: a setpts expression that stretches time non-linearly → variable frame spacing.
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(1280, 720, 30, 10),
        '-f', 'lavfi', '-i', SINE(440, 10),
        ...BITEXACT, ...NOMETA,
        '-vf', 'setpts=PTS*(1.0+0.4*sin(N/10))', // wobbling timestamps → VFR
        '-vsync', 'vfr',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
        '-movflags', '+faststart',
        out,
      ],
      'h264_vfr.mp4',
    );
    return 'ok';
  },
  'h264_rotated90.mp4': (out) => {
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(1280, 720, 30, 10),
        '-f', 'lavfi', '-i', SINE(440, 10),
        ...BITEXACT, ...NOMETA,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-g', '60', '-keyint_min', '60',
        '-x264-params', 'scenecut=0:bframes=0',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
        '-metadata:s:v:0', 'rotate=90', // display-matrix rotation
        '-movflags', '+faststart',
        out,
      ],
      'h264_rotated90.mp4',
    );
    return 'ok';
  },
  'h264_multitrack.mp4': (out) => {
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(1280, 720, 30, 10),
        '-f', 'lavfi', '-i', SINE(440, 10),
        '-f', 'lavfi', '-i', SINE(880, 10),
        ...BITEXACT, ...NOMETA,
        '-map', '0:v', '-map', '1:a', '-map', '2:a',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-g', '60', '-keyint_min', '60',
        '-x264-params', 'scenecut=0:bframes=0',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
        '-movflags', '+faststart',
        out,
      ],
      'h264_multitrack.mp4',
    );
    return 'ok';
  },
  'h264_1080p_5s.mov': (out) => {
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(1920, 1080, 30, 5),
        '-f', 'lavfi', '-i', SINE(440, 5),
        ...BITEXACT, ...NOMETA,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-g', '60', '-keyint_min', '60',
        '-x264-params', 'scenecut=0:bframes=0',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
        '-f', 'mov',
        out,
      ],
      'h264_1080p_5s.mov',
    );
    return 'ok';
  },

  // ── Matroska / WebM ────────────────────────────────────────────────────────────────────────
  'vp9_1080p_10s.webm': (out) => {
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(1920, 1080, 30, 10),
        '-f', 'lavfi', '-i', SINE(440, 10),
        ...BITEXACT, ...NOMETA,
        '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p', '-b:v', '0', '-crf', '32',
        '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-g', '60',
        '-c:a', 'libopus', '-b:a', '96k', '-ar', '48000', '-ac', '2',
        '-f', 'webm',
        out,
      ],
      'vp9_1080p_10s.webm',
    );
    return 'ok';
  },
  'vp8_720p_10s.webm': (out) => {
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(1280, 720, 30, 10),
        '-f', 'lavfi', '-i', SINE(440, 10),
        ...BITEXACT, ...NOMETA,
        '-c:v', 'libvpx', '-pix_fmt', 'yuv420p', '-b:v', '1M', '-deadline', 'good', '-cpu-used', '2', '-g', '60',
        '-c:a', 'libvorbis', '-q:a', '4', '-ar', '48000', '-ac', '2',
        '-f', 'webm',
        out,
      ],
      'vp8_720p_10s.webm',
    );
    return 'ok';
  },
  'av1_720p_5s.webm': (out) => {
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(1280, 720, 30, 5),
        '-f', 'lavfi', '-i', SINE(440, 5),
        ...BITEXACT, ...NOMETA,
        '-c:v', 'libsvtav1', '-pix_fmt', 'yuv420p', '-crf', '35', '-preset', '8', '-g', '60',
        '-c:a', 'libopus', '-b:a', '96k', '-ar', '48000', '-ac', '2',
        '-f', 'webm',
        out,
      ],
      'av1_720p_5s.webm',
    );
    return 'ok';
  },
  'vp9_alpha.webm': (out) => {
    // Build a yuva420p source: testsrc2 RGB → add a diagonal alpha ramp via geq, then encode VP9
    // with alpha. libvpx-vp9 carries alpha when -pix_fmt yuva420p and -auto-alt-ref 0.
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(640, 480, 30, 5),
        ...BITEXACT, ...NOMETA,
        '-vf', 'format=yuva420p,geq=r=\'r(X,Y)\':g=\'g(X,Y)\':b=\'b(X,Y)\':a=\'255*X/W\'',
        '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '32',
        '-auto-alt-ref', '0', '-deadline', 'good', '-cpu-used', '4', '-g', '60',
        '-f', 'webm',
        out,
      ],
      'vp9_alpha.webm',
    );
    return 'ok';
  },
  'h264_in_mkv.mkv': (out) => {
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(1280, 720, 30, 10),
        '-f', 'lavfi', '-i', SINE(440, 10),
        ...BITEXACT, ...NOMETA,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-g', '60', '-keyint_min', '60',
        '-x264-params', 'scenecut=0:bframes=0',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
        '-f', 'matroska',
        out,
      ],
      'h264_in_mkv.mkv',
    );
    return 'ok';
  },

  // ── MPEG-TS / HLS ──────────────────────────────────────────────────────────────────────────
  'h264_ts.ts': (out) => {
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(1280, 720, 30, 10),
        '-f', 'lavfi', '-i', SINE(440, 10),
        ...BITEXACT, ...NOMETA,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-g', '30', '-keyint_min', '30',
        '-x264-params', 'scenecut=0:bframes=0',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
        '-bsf:v', 'h264_mp4toannexb',
        '-f', 'mpegts',
        out,
      ],
      'h264_ts.ts',
    );
    return 'ok';
  },
  'hls_vod.m3u8': (out) => {
    // Playlist + sibling .ts segments. The manifest sha256/size are of the .m3u8 itself; segment
    // files live next to it and are listed in the golden notes for the streaming oracle.
    const base = out.replace(/\.m3u8$/, '');
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(1280, 720, 30, 10),
        '-f', 'lavfi', '-i', SINE(440, 10),
        ...BITEXACT, ...NOMETA,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-g', '30', '-keyint_min', '30',
        '-x264-params', 'scenecut=0:bframes=0',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
        '-f', 'hls', '-hls_time', '2', '-hls_playlist_type', 'vod',
        '-hls_segment_filename', `${base}_%03d.ts`,
        out,
      ],
      'hls_vod.m3u8',
    );
    return 'ok';
  },
  'hls_aes128.m3u8': (out) => {
    // ffmpeg 8 supports HLS AES-128 natively via -hls_key_info_file. We generate a key + key_info
    // in a temp dir, point the KEY URI at a relative path the static server can serve.
    const base = out.replace(/\.m3u8$/, '');
    const tmp = mkdtempBake();
    try {
      const keyBytes = randomBytes16();
      const ivBytes = randomBytes16();
      const keyFile = join(MEDIA_DIR, 'hls_aes128.key'); // served alongside the playlist
      writeFileSync(keyFile, keyBytes);
      // key_info_file: line1 = key URI (as referenced in the playlist), line2 = key file path on
      // disk, line3 = IV hex. The URI is relative so the suite's static server resolves it.
      const keyInfo = ['hls_aes128.key', keyFile, toHex(ivBytes)].join('\n') + '\n';
      const keyInfoPath = join(tmp, 'key_info');
      writeFileSync(keyInfoPath, keyInfo);
      ffmpeg(
        [
          '-f', 'lavfi', '-i', TESTSRC(1280, 720, 30, 10),
          '-f', 'lavfi', '-i', SINE(440, 10),
          ...BITEXACT, ...NOMETA,
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-g', '30', '-keyint_min', '30',
          '-x264-params', 'scenecut=0:bframes=0',
          '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
          '-f', 'hls', '-hls_time', '2', '-hls_playlist_type', 'vod',
          '-hls_key_info_file', keyInfoPath,
          '-hls_segment_filename', `${base}_%03d.ts`,
          out,
        ],
        'hls_aes128.m3u8',
      );
      // Stash key + IV so the golden bake can emit them for the decrypt oracle.
      ENC_SECRETS['hls_aes128.m3u8'] = { keyHex: toHex(keyBytes), ivHex: toHex(ivBytes), scheme: 'hls-aes128' };
      return 'ok';
    } catch (e) {
      return { skipped: true, reason: `HLS AES-128 generation failed: ${String(e?.message || e)}` };
    } finally {
      rmSafe(tmp);
    }
  },

  // ── Encrypted MP4 (CENC) ─────────────────────────────────────────────────────────────────────
  'cenc_ctr.mp4': (out) => {
    // cenc-aes-ctr: ffmpeg's mov muxer supports -encryption_scheme cenc-aes-ctr (since ~4.x). We
    // re-encrypt a freshly built fragmented baseline so the asset is self-contained.
    const tmp = mkdtempBake();
    try {
      const plain = join(tmp, 'plain.mp4');
      ffmpeg(
        [
          '-f', 'lavfi', '-i', TESTSRC(1280, 720, 30, 5),
          '-f', 'lavfi', '-i', SINE(440, 5),
          ...BITEXACT, ...NOMETA,
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-g', '60', '-keyint_min', '60',
          '-x264-params', 'scenecut=0:bframes=0',
          '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
          '-movflags', '+faststart+frag_keyframe',
          plain,
        ],
        'cenc_ctr.mp4(plain)',
      );
      const keyHex = '00112233445566778899aabbccddeeff';
      const kidHex = '11223344556677889900aabbccddeeff';
      ffmpeg(
        [
          '-i', plain,
          '-c', 'copy',
          '-encryption_scheme', 'cenc-aes-ctr',
          '-encryption_key', keyHex,
          '-encryption_kid', kidHex,
          '-movflags', '+frag_keyframe+empty_moov',
          out,
        ],
        'cenc_ctr.mp4(encrypt)',
      );
      ENC_SECRETS['cenc_ctr.mp4'] = { keyHex, kid: kidHex, scheme: 'cenc-ctr' };
      return 'ok';
    } catch (e) {
      return {
        skipped: true,
        reason:
          `cenc-aes-ctr encryption failed (${String(e?.message || e)}). ` +
          'This ffmpeg build may lack the cenc encryption muxer option; install one with ' +
          '--enable-gpl + recent libavformat, or use Bento4 mp4encrypt.',
      };
    } finally {
      rmSafe(tmp);
    }
  },
  'cenc_cbcs.mp4': (out) => {
    // cbcs (pattern AES-CBC) is NOT emittable by ffmpeg's encryption_scheme (ctr only). Use Bento4
    // mp4encrypt or shaka packager if present; otherwise SKIP with a precise reason (never fake it).
    if (!TOOLS.mp4encrypt && !TOOLS.packager) {
      return {
        skipped: true,
        reason:
          'cbcs (pattern) encryption requires Bento4 (mp4encrypt --method MPEG-CENC --scheme cbcs) ' +
          'or shaka packager; neither is installed. ffmpeg cannot emit cbcs. Decrypt oracle → NA.',
      };
    }
    const tmp = mkdtempBake();
    try {
      const plain = join(tmp, 'plain.mp4');
      ffmpeg(
        [
          '-f', 'lavfi', '-i', TESTSRC(1280, 720, 30, 5),
          '-f', 'lavfi', '-i', SINE(440, 5),
          ...BITEXACT, ...NOMETA,
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-g', '60', '-keyint_min', '60',
          '-x264-params', 'scenecut=0:bframes=0',
          '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
          '-movflags', '+faststart',
          plain,
        ],
        'cenc_cbcs.mp4(plain)',
      );
      const keyHex = '0123456789abcdef0123456789abcdef';
      const kidHex = 'abcdef00112233445566778899aabbcc';
      if (TOOLS.mp4encrypt) {
        // Bento4 cbcs pattern (1:9 crypt:skip is the common AVC cbcs pattern).
        const res = spawnSync(
          'mp4encrypt',
          [
            '--method', 'MPEG-CENC',
            '--encryption-scheme', 'cbcs',
            '--key', `1:${keyHex}:random`,
            '--property', `1:KID:${kidHex}`,
            plain,
            out,
          ],
          { encoding: 'utf8' },
        );
        if (res.status !== 0) throw new Error(res.stderr || `mp4encrypt exit ${res.status}`);
      } else {
        // shaka packager cbcs.
        const res = spawnSync(
          'packager',
          [
            `input=${plain},stream=video,output=${out}`,
            '--enable_raw_key_encryption',
            '--protection_scheme', 'cbcs',
            '--keys', `label=:key_id=${kidHex}:key=${keyHex}`,
          ],
          { encoding: 'utf8' },
        );
        if (res.status !== 0) throw new Error(res.stderr || `packager exit ${res.status}`);
      }
      ENC_SECRETS['cenc_cbcs.mp4'] = { keyHex, kid: kidHex, scheme: 'cenc-cbcs' };
      return 'ok';
    } catch (e) {
      return { skipped: true, reason: `cbcs encryption failed: ${String(e?.message || e)}` };
    } finally {
      rmSafe(tmp);
    }
  },

  // ── Audio ──────────────────────────────────────────────────────────────────────────────────
  'wav_s16.wav': (out) => {
    ffmpeg(['-f', 'lavfi', '-i', SINE(440, 5), ...BITEXACT, ...NOMETA, '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', '-f', 'wav', out], 'wav_s16.wav');
    return 'ok';
  },
  'wav_s24.wav': (out) => {
    ffmpeg(['-f', 'lavfi', '-i', SINE(440, 5), ...BITEXACT, ...NOMETA, '-c:a', 'pcm_s24le', '-ar', '48000', '-ac', '2', '-f', 'wav', out], 'wav_s24.wav');
    return 'ok';
  },
  'wav_f32.wav': (out) => {
    ffmpeg(['-f', 'lavfi', '-i', SINE(440, 5), ...BITEXACT, ...NOMETA, '-c:a', 'pcm_f32le', '-ar', '48000', '-ac', '2', '-f', 'wav', out], 'wav_f32.wav');
    return 'ok';
  },
  'pcm_s16be.aiff': (out) => {
    // Big-endian 16-bit PCM. RIFF/WAVE cannot carry pcm_s16be ("Codec pcm_s16be not supported in
    // WAVE format" — WAVE is little-endian by construction). AIFF is the natural big-endian PCM
    // container, so the BIG-ENDIAN handling intent (§7) is honored honestly here.
    ffmpeg(['-f', 'lavfi', '-i', SINE(440, 5), ...BITEXACT, ...NOMETA, '-c:a', 'pcm_s16be', '-ar', '48000', '-ac', '2', '-f', 'aiff', out], 'pcm_s16be.aiff');
    return 'ok';
  },
  'mp3_xing.mp3': (out) => {
    // VBR with Xing header (libmp3lame writes Xing/Info for VBR by default).
    ffmpeg(['-f', 'lavfi', '-i', SINE(440, 10, 44100), ...BITEXACT, ...NOMETA, '-c:a', 'libmp3lame', '-q:a', '2', '-ar', '44100', '-ac', '2', '-f', 'mp3', out], 'mp3_xing.mp3');
    return 'ok';
  },
  'mp3_cbr_notoc.mp3': (out) => {
    // CBR, suppress the Xing/Info header so there is no TOC.
    ffmpeg(['-f', 'lavfi', '-i', SINE(440, 10, 44100), ...BITEXACT, ...NOMETA, '-c:a', 'libmp3lame', '-b:a', '128k', '-write_xing', '0', '-ar', '44100', '-ac', '2', '-f', 'mp3', out], 'mp3_cbr_notoc.mp3');
    return 'ok';
  },
  'flac_seektable.flac': (out) => {
    ffmpeg(['-f', 'lavfi', '-i', SINE(440, 10), ...BITEXACT, ...NOMETA, '-c:a', 'flac', '-ar', '48000', '-ac', '2', '-f', 'flac', out], 'flac_seektable.flac');
    // ffmpeg's flac muxer writes a SEEKTABLE by default; if metaflac exists, force a dense one.
    if (TOOLS.metaflac) {
      spawnSync('metaflac', ['--add-seekpoint=1s', out], { encoding: 'utf8' });
    }
    return 'ok';
  },
  'flac_noseektable.flac': (out) => {
    ffmpeg(['-f', 'lavfi', '-i', SINE(440, 10), ...BITEXACT, ...NOMETA, '-c:a', 'flac', '-ar', '48000', '-ac', '2', '-f', 'flac', out], 'flac_noseektable.flac');
    if (TOOLS.metaflac) {
      const res = spawnSync('metaflac', ['--remove', '--block-type=SEEKTABLE', '--dont-use-padding', out], { encoding: 'utf8' });
      if (res.status !== 0) {
        return { skipped: false, reason: '' }; // unreachable; we still return 'ok' below
      }
      return 'ok';
    }
    // No metaflac: ffmpeg writes a SEEKTABLE we cannot strip. Keep the asset but flag the caveat —
    // the seek-without-seektable scenario can still run, the golden notes record the discrepancy.
    NOSEEKTABLE_CAVEAT = true;
    return 'ok';
  },
  'aac_adts.aac': (out) => {
    ffmpeg(['-f', 'lavfi', '-i', SINE(440, 10), ...BITEXACT, ...NOMETA, '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2', '-f', 'adts', out], 'aac_adts.aac');
    return 'ok';
  },
  'opus.ogg': (out) => {
    ffmpeg(['-f', 'lavfi', '-i', SINE(440, 10), ...BITEXACT, ...NOMETA, '-c:a', 'libopus', '-b:a', '96k', '-ar', '48000', '-ac', '2', '-f', 'ogg', out], 'opus.ogg');
    return 'ok';
  },

  // ── Size ladder (§5.3): one rung per bucket, crossing the size axis with the format axis ─────
  // empty: a structurally-valid container with ZERO media (distinct from zero_length.mp4's 0 bytes).
  'empty_audio.wav': (out) => {
    // A valid 44-byte RIFF/WAVE header carrying a 0-length data chunk (the "no samples" edge, distinct
    // from zero_length.mp4's "no bytes"). Written directly — DO NOT use ffmpeg `sine duration=0`:
    // ffmpeg treats duration=0 as INFINITE and generates an unbounded file (it ran away to 88 GB).
    // The canonical header below is deterministic + bit-exact (PCM s16le, 48 kHz, stereo, 0 data bytes).
    const buf = Buffer.alloc(44);
    buf.write('RIFF', 0, 'ascii');
    buf.writeUInt32LE(36, 4); // ChunkSize = 36 + data(0)
    buf.write('WAVE', 8, 'ascii');
    buf.write('fmt ', 12, 'ascii');
    buf.writeUInt32LE(16, 16); // Subchunk1Size (PCM)
    buf.writeUInt16LE(1, 20); // AudioFormat = PCM
    buf.writeUInt16LE(2, 22); // NumChannels = 2
    buf.writeUInt32LE(48000, 24); // SampleRate
    buf.writeUInt32LE(192000, 28); // ByteRate = 48000*2*2
    buf.writeUInt16LE(4, 32); // BlockAlign = 2*2
    buf.writeUInt16LE(16, 34); // BitsPerSample
    buf.write('data', 36, 'ascii');
    buf.writeUInt32LE(0, 40); // Subchunk2Size = 0
    writeFileSync(out, buf);
    return 'ok';
  },
  // micro (~1 KB): single-keyframe MP4 + few-frame audio MP4.
  'micro_h264_1frame.mp4': (out) => {
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(320, 240, 1, 1),
        ...BITEXACT, ...NOMETA,
        '-frames:v', '1',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', '-g', '1', '-keyint_min', '1',
        '-x264-params', 'scenecut=0:bframes=0',
        '-movflags', '+faststart',
        out,
      ],
      'micro_h264_1frame.mp4',
    );
    return 'ok';
  },
  'micro_audio_short.m4a': (out) => {
    ffmpeg(
      ['-f', 'lavfi', '-i', SINE(440, 0.1, 44100, 1), ...BITEXACT, ...NOMETA, '-c:a', 'aac', '-b:a', '32k', '-ar', '44100', '-ac', '1', '-movflags', '+faststart', '-f', 'mp4', out],
      'micro_audio_short.m4a',
    );
    return 'ok';
  },
  // tiny (~100 KB): 360p 2s in both major families so the rung crosses container/codec.
  'tiny_h264_360p_2s.mp4': (out) => {
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(640, 360, 30, 2),
        '-f', 'lavfi', '-i', SINE(440, 2),
        ...BITEXACT, ...NOMETA,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', '-g', '60', '-keyint_min', '60',
        '-x264-params', 'scenecut=0:bframes=0',
        '-c:a', 'aac', '-b:a', '96k', '-ar', '48000', '-ac', '2',
        '-movflags', '+faststart',
        out,
      ],
      'tiny_h264_360p_2s.mp4',
    );
    return 'ok';
  },
  'tiny_vp9_360p_2s.webm': (out) => {
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(640, 360, 30, 2),
        '-f', 'lavfi', '-i', SINE(440, 2),
        ...BITEXACT, ...NOMETA,
        '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p', '-b:v', '0', '-crf', '40',
        '-row-mt', '1', '-deadline', 'good', '-cpu-used', '5', '-g', '60',
        '-c:a', 'libopus', '-b:a', '64k', '-ar', '48000', '-ac', '2',
        '-f', 'webm',
        out,
      ],
      'tiny_vp9_360p_2s.webm',
    );
    return 'ok';
  },
  // large (~100 MB): 120s 1080p in both major families. Slow; gated by --skip-longform.
  'large_h264_1080p_120s.mp4': (out) => {
    if (flags.skipLongform) {
      return { skipped: true, reason: '--skip-longform: large 120s 1080p asset intentionally not generated this run.' };
    }
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(1920, 1080, 30, 120),
        '-f', 'lavfi', '-i', SINE(440, 120),
        ...BITEXACT, ...NOMETA,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-g', '60', '-keyint_min', '60',
        '-preset', 'veryfast', '-x264-params', 'scenecut=0:bframes=0',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
        '-movflags', '+faststart',
        out,
      ],
      'large_h264_1080p_120s.mp4',
    );
    return 'ok';
  },
  'large_vp9_1080p_120s.webm': (out) => {
    if (flags.skipLongform) {
      return { skipped: true, reason: '--skip-longform: large 120s 1080p VP9 asset intentionally not generated this run (VP9 sw encode is very slow).' };
    }
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(1920, 1080, 30, 120),
        '-f', 'lavfi', '-i', SINE(440, 120),
        ...BITEXACT, ...NOMETA,
        '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p', '-b:v', '0', '-crf', '34',
        '-row-mt', '1', '-deadline', 'good', '-cpu-used', '5', '-g', '60',
        '-c:a', 'libopus', '-b:a', '96k', '-ar', '48000', '-ac', '2',
        '-f', 'webm',
        out,
      ],
      'large_vp9_1080p_120s.webm',
    );
    return 'ok';
  },
  // huge (~500-700 MB): the SELF-CONTAINED big-read asset (BigBuckBunny-style 1080p H.264 .mov).
  // Always present after a full bake; deterministic; no network. Slow + large; gated by --skip-longform.
  'huge_h264_1080p_600s.mov': (out) => {
    if (flags.skipLongform) {
      return { skipped: true, reason: '--skip-longform: huge ~600s 1080p .mov big-read asset intentionally not generated this run.' };
    }
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(1920, 1080, 30, 600),
        '-f', 'lavfi', '-i', SINE(440, 600),
        ...BITEXACT, ...NOMETA,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-g', '60', '-keyint_min', '60',
        '-preset', 'veryfast', '-x264-params', 'scenecut=0:bframes=0',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
        '-movflags', '+faststart',
        '-f', 'mov',
        out,
      ],
      'huge_h264_1080p_600s.mov',
    );
    return 'ok';
  },
  // big-read PARITY: the REAL BigBuckBunny1080pH264.mov. provided/pin-then-fetch (see fetchPinned).
  // ffmpeg cannot generate the real content; we only accept a sha256-verified download or a drop-in.
  'big_buck_bunny_1080p_h264.mov': async (out, entry) => {
    // A trusted sha256 may come from the manifest (once recorded) or the BBB_MOV_SHA256 env override.
    const trusted = process.env.BBB_MOV_SHA256 || entry?.sha256 || null;
    if (!trusted) {
      return {
        skipped: true,
        reason:
          'REAL BigBuckBunny1080pH264.mov: no trusted sha256 to verify a download (Mediabunny\'s exact ' +
          '691 MiB benchmark file is unpinned/private). Not auto-fetched. Drop it in manually or set ' +
          'BBB_MOV_SHA256=<sha256-you-trust> to enable the pinned fetch from sourceUrl. See MISSING ASSETS. ' +
          '(The synthetic huge_h264_1080p_600s.mov keeps the huge/big-read rung populated regardless.)',
      };
    }
    const res = await fetchPinned(entry?.sourceUrl, out, trusted, 'big_buck_bunny_1080p_h264.mov');
    return res;
  },

  // ── massive (~1-1.4 GB, multi-hour): lazy-read / streaming / peak-memory / OOM resistance ─────
  'massive_h264_1080p_2h.mp4': (out) => {
    if (flags.skipLongform) {
      return { skipped: true, reason: '--skip-longform: massive 2h 1080p asset intentionally not generated this run.' };
    }
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(1920, 1080, 30, 7200),
        '-f', 'lavfi', '-i', SINE(440, 7200, 48000, 1),
        ...BITEXACT, ...NOMETA,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-b:v', '1200k', '-maxrate', '1400k', '-bufsize', '2400k',
        '-g', '60', '-keyint_min', '60', '-preset', 'veryfast', '-x264-params', 'scenecut=0:bframes=0',
        '-c:a', 'aac', '-b:a', '64k', '-ar', '48000', '-ac', '1',
        '-movflags', '+faststart',
        out,
      ],
      'massive_h264_1080p_2h.mp4',
    );
    return 'ok';
  },

  // ── Recorder-origin (BROWSER capture — never faked) ─────────────────────────────────────────
  'recorder_headerless.webm': (_out) => {
    // A MediaRecorder WebM (cluster-only, no Cues/Duration in the header) cannot be produced by
    // ffmpeg without lying about its provenance. It MUST be captured in a browser via MediaRecorder
    // (canvas.captureStream → MediaRecorder('video/webm')). The bake emits a recorder note + leaves
    // a placeholder mechanism (tools/record-fixture.html, written below) rather than faking it.
    ensureRecorderHelper();
    return {
      skipped: true,
      reason:
        'MediaRecorder-origin headerless WebM requires an in-browser capture. Open ' +
        'fixtures/tools/record-fixture.html in a browser, click Record (~3s), and save the download ' +
        'as fixtures/media/recorder_headerless.webm. Re-run the bake to checksum it. NOT faked by ffmpeg.',
    };
  },

  // ── Stress ───────────────────────────────────────────────────────────────────────────────────
  'longform_1h_audio.m4a': (out) => {
    if (flags.skipLongform) {
      return { skipped: true, reason: '--skip-longform: multi-hour asset intentionally not generated this run.' };
    }
    ffmpeg(
      ['-f', 'lavfi', '-i', SINE(440, 3600, 48000, 1), ...BITEXACT, ...NOMETA, '-c:a', 'aac', '-b:a', '64k', '-ar', '48000', '-ac', '1', '-movflags', '+faststart', '-f', 'mp4', out],
      'longform_1h_audio.m4a',
    );
    return 'ok';
  },
  'zero_length.mp4': (out) => {
    // A genuine 0-byte file. No ffmpeg.
    writeFileSync(out, Buffer.alloc(0));
    return 'ok';
  },
  'truncated_h264.mp4': (out) => {
    const tmp = mkdtempBake();
    try {
      const full = join(tmp, 'full.mp4');
      ffmpeg(
        [
          '-f', 'lavfi', '-i', TESTSRC(640, 480, 30, 5),
          '-f', 'lavfi', '-i', SINE(440, 5),
          ...BITEXACT, ...NOMETA,
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-g', '60', '-keyint_min', '60',
          '-x264-params', 'scenecut=0:bframes=0',
          '-c:a', 'aac', '-b:a', '96k', '-ar', '48000', '-ac', '2',
          // NO faststart: moov at the end, so truncating the tail removes the index → broken file.
          full,
        ],
        'truncated_h264.mp4(full)',
      );
      const bytes = readFileSync(full);
      const cut = Math.floor(bytes.length * 0.6);
      writeFileSync(out, bytes.subarray(0, cut));
      return 'ok';
    } finally {
      rmSafe(tmp);
    }
  },

  // ── Image negatives ──────────────────────────────────────────────────────────────────────────
  'image.jpg': (out) => {
    ffmpeg(['-f', 'lavfi', '-i', TESTSRC(640, 480, 1, 1), ...BITEXACT, '-frames:v', '1', '-f', 'image2', out], 'image.jpg');
    return 'ok';
  },
  'image.png': (out) => {
    ffmpeg(['-f', 'lavfi', '-i', TESTSRC(640, 480, 1, 1), ...BITEXACT, '-frames:v', '1', '-f', 'image2', out], 'image.png');
    return 'ok';
  },
  'image.webp': (out) => {
    ffmpeg(['-f', 'lavfi', '-i', TESTSRC(640, 480, 1, 1), ...BITEXACT, '-frames:v', '1', '-c:v', 'libwebp', '-f', 'image2', out], 'image.webp');
    return 'ok';
  },
};

// ── Intentionally-broken robustness assets ───────────────────────────────────────────────────
//
// These assets are deliberately malformed (zero-length / header-truncated) to exercise the
// graceful-failure oracle. ffprobe failing to read them is the EXPECTED outcome, not a bake error,
// so we skip golden (meta/packets/frames) derivation for them and record a clear "no golden
// (intentionally broken)" note. They keep their checksum + size in the manifest.
const EXPECT_GOLDEN_FAILURE = new Set(['zero_length.mp4', 'truncated_h264.mp4']);

// ── Encryption secret + caveat side-channels (filled by recipes, consumed by golden bake) ────────

/** @type {Record<string, { keyHex: string; kid?: string; ivHex?: string; scheme: string }>} */
const ENC_SECRETS = {};
let NOSEEKTABLE_CAVEAT = false;

// ── Small helpers ────────────────────────────────────────────────────────────────────────────

function toHex(buf) {
  return Buffer.from(buf).toString('hex');
}
function randomBytes16() {
  const b = Buffer.alloc(16);
  // Deterministic-ish but unique per run is fine for fixtures; use crypto for real randomness.
  return Buffer.from(globalThis.crypto?.getRandomValues?.(new Uint8Array(16)) ?? cryptoRandom16(b));
}
function cryptoRandom16() {
  // node:crypto fallback
  return new Uint8Array(createHash('sha256').update(String(Date.now() + Math.random())).digest().subarray(0, 16));
}
function mkdtempBake() {
  const d = join(tmpdir(), `bake-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  mkdirSync(d, { recursive: true });
  return d;
}
function rmSafe(p) {
  try {
    rmSync(p, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

function sha256File(path) {
  const h = createHash('sha256');
  h.update(readFileSync(path));
  return h.digest('hex');
}

// ── Recorder helper page (placeholder capture mechanism, not a fake asset) ──────────────────────

function ensureRecorderHelper() {
  const toolsDir = join(FIXTURES_DIR, 'tools');
  mkdirSync(toolsDir, { recursive: true });
  const helper = join(toolsDir, 'record-fixture.html');
  if (existsSync(helper)) return;
  writeFileSync(
    helper,
    `<!doctype html>
<meta charset="utf-8" />
<title>Record fixtures/media/recorder_headerless.webm</title>
<style>body{font:14px system-ui;margin:2rem;max-width:48rem}button{font-size:1rem;padding:.5rem 1rem}</style>
<h1>Bake the recorder-origin WebM (browser-only)</h1>
<p>This asset is a <b>MediaRecorder</b> capture — a cluster-only WebM with no Cues/Duration in its
header. ffmpeg cannot honestly produce one, so we record it here. Click <b>Record</b>, wait ~3s, then
save the download as <code>fixtures/media/recorder_headerless.webm</code> and re-run
<code>bun fixtures/bake.mjs recorder_headerless.webm</code> to checksum it.</p>
<canvas id="c" width="320" height="240" style="border:1px solid #ccc"></canvas>
<p><button id="rec">Record 3s</button> <span id="status"></span></p>
<script type="module">
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let t = 0;
function draw() {
  t += 1;
  ctx.fillStyle = 'hsl(' + (t % 360) + ' 70% 50%)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.font = '24px monospace';
  ctx.fillText('frame ' + t, 20, 120);
  requestAnimationFrame(draw);
}
draw();
document.getElementById('rec').onclick = async () => {
  const status = document.getElementById('status');
  const stream = canvas.captureStream(30);
  // Add a silent-ish audio track via WebAudio so the WebM has audio+video like a real recording.
  try {
    const ac = new AudioContext();
    const osc = ac.createOscillator(); osc.frequency.value = 440;
    const dst = ac.createMediaStreamDestination(); osc.connect(dst); osc.start();
    dst.stream.getAudioTracks().forEach((a) => stream.addTrack(a));
  } catch {}
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' : 'video/webm';
  const rec = new MediaRecorder(stream, { mimeType: mime });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/webm' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'recorder_headerless.webm';
    a.click();
    status.textContent = 'Saved download. Move it to fixtures/media/ and re-run the bake.';
  };
  rec.start(); // single blob, no timeslice → header-light, non-seekable
  status.textContent = 'recording…';
  setTimeout(() => rec.stop(), 3000);
};
</script>
`,
  );
  log('  · wrote recorder helper → fixtures/tools/record-fixture.html');
}

// ── Golden derivation (ffprobe → NormalizedMetadata + PacketInfo[]) ──────────────────────────────

/** Map an ffprobe codec_name to our canonical token vocabulary (engine.ts CANONICAL_*). */
function canonicalCodec(name) {
  const n = (name || '').toLowerCase();
  const map = {
    h264: 'h264',
    hevc: 'hevc',
    h265: 'hevc',
    vp8: 'vp8',
    vp9: 'vp9',
    av1: 'av1',
    aac: 'aac',
    opus: 'opus',
    mp3: 'mp3',
    flac: 'flac',
    vorbis: 'vorbis',
    pcm_s16le: 'pcm-s16',
    pcm_s24le: 'pcm-s24',
    pcm_f32le: 'pcm-f32',
    pcm_s16be: 'pcm-s16be',
    mjpeg: 'mjpeg',
    png: 'png',
    webp: 'webp',
  };
  return map[n] ?? n;
}

function canonicalContainer(formatName, assetId) {
  // ffprobe format_name is a comma list ("mov,mp4,m4a,3gp,..."). Prefer the asset's known suffix.
  const lower = assetId.toLowerCase();
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
  // Rotation may live in side_data_list (Display Matrix) or tags.rotate.
  const sd = (stream.side_data_list || []).find((s) => typeof s.rotation === 'number');
  if (sd) return ((Math.round(sd.rotation) % 360) + 360) % 360;
  const tagRot = stream.tags?.rotate;
  if (tagRot != null) return ((parseInt(tagRot, 10) % 360) + 360) % 360;
  return undefined;
}

/**
 * Per-asset ffprobe/ffmpeg *input* options for the golden derivation. HLS playlists that reference
 * a sibling AES-128 key file need `-allowed_extensions ALL` (the .key extension is blocked for
 * "security" by default) and `-protocol_whitelist file,crypto,data` so ffprobe will open the key and
 * the encrypted segments. Returned args must precede the input path (they are *input* demux options).
 */
function goldenInputOpts(assetId) {
  if (assetId.toLowerCase().endsWith('.m3u8')) {
    return ['-allowed_extensions', 'ALL', '-protocol_whitelist', 'file,crypto,data,http,https,tcp,tls'];
  }
  return [];
}

/** Build NormalizedMetadata (engine.ts) from ffprobe -show_format -show_streams JSON. */
function normalizedMetadataFor(assetId, mediaPath) {
  const inOpts = goldenInputOpts(assetId);
  const probe = ffprobeJson([...inOpts, '-show_format', '-show_streams', mediaPath], `${assetId} meta`);
  const fmt = probe.format || {};
  const streams = probe.streams || [];

  const tracks = streams.map((s) => {
    const type =
      s.codec_type === 'video' ? 'video' : s.codec_type === 'audio' ? 'audio' : s.codec_type === 'subtitle' ? 'subtitle' : 'other';
    /** @type {any} */
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

  /** @type {any} */
  const meta = {
    container: canonicalContainer(fmt.format_name, assetId),
    durationSec,
    tracks,
  };
  // Carry the handful of tags that the metadata scenarios read.
  const tagKeys = ['title', 'artist', 'album', 'comment', 'encoder', 'major_brand'];
  const tags = {};
  for (const k of tagKeys) if (fmt.tags?.[k]) tags[k] = String(fmt.tags[k]);
  if (Object.keys(tags).length) meta.tags = tags;
  return meta;
}

/** Build PacketInfo[] (engine.ts) from ffprobe -show_packets JSON. Times normalized to integer µs. */
function packetsFor(assetId, mediaPath) {
  const inOpts = goldenInputOpts(assetId);
  const probe = ffprobeJson([...inOpts, '-show_packets', '-show_entries', 'packet=stream_index,size,pts_time,dts_time,flags', mediaPath], `${assetId} packets`);
  const pkts = probe.packets || [];
  return pkts.map((p) => {
    const ptsUs = p.pts_time != null && p.pts_time !== 'N/A' ? Math.round(Number(p.pts_time) * 1e6) : 0;
    const dtsUs = p.dts_time != null && p.dts_time !== 'N/A' ? Math.round(Number(p.dts_time) * 1e6) : ptsUs;
    const keyframe = typeof p.flags === 'string' ? p.flags.includes('K') : false;
    return {
      trackIndex: Number(p.stream_index) || 0,
      size: Number(p.size) || 0,
      ptsUs,
      dtsUs,
      keyframe,
    };
  });
}

/**
 * Frame-digest golden is the BROWSER's normalized-RGBA sha256 (oracles.ts/digest.ts). ffmpeg cannot
 * produce these bytes (color conversion + canvas rasterization differ), so we emit a clearly marked
 * placeholder that the browser frame pass overwrites. We DO record ffmpeg's frame PTS list so the
 * browser pass knows which presentation times to digest. This is a TODO hook, NOT a fake digest.
 */
function frameHookFor(assetId, mediaPath, meta) {
  const hasVideo = (meta.tracks || []).some((t) => t.type === 'video');
  if (!hasVideo) return null; // audio-only / image: no frame-digest golden
  // Pull the first ~12 video frame PTS so the browser pass digests a deterministic, bounded set.
  let ptsList = [];
  try {
    const inOpts = goldenInputOpts(assetId);
    const probe = ffprobeJson(
      [...inOpts, '-select_streams', 'v:0', '-show_frames', '-show_entries', 'frame=pts_time,key_frame', '-read_intervals', '%+#12', mediaPath],
      `${assetId} frames-hook`,
    );
    ptsList = (probe.frames || [])
      .filter((f) => f.pts_time != null && f.pts_time !== 'N/A')
      .map((f) => ({ ptsUs: Math.round(Number(f.pts_time) * 1e6), keyframe: f.key_frame === 1 || f.key_frame === '1' }));
  } catch {
    ptsList = [];
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
    /** the deterministic, bounded presentation times the browser pass must digest, in order */
    frames: ptsList.map((p, index) => ({
      index,
      ptsUs: p.ptsUs,
      keyframe: p.keyframe,
      sha256: null, // <-- filled by the browser frame pass
    })),
  };
}

function writeJson(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2) + '\n');
}

// ── Manifest IO ────────────────────────────────────────────────────────────────────────────────

function loadManifest() {
  const raw = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  if (!Array.isArray(raw.assets)) throw new Error('manifest.json missing assets[]');
  return raw;
}

// ── Main ─────────────────────────────────────────────────────────────────────────────────────

function selected(assetId) {
  if (!flags.subset) return true;
  return flags.subset.some((term) => assetId.includes(term));
}

async function main() {
  mkdirSync(MEDIA_DIR, { recursive: true });
  mkdirSync(GOLDEN_DIR, { recursive: true });

  const manifest = loadManifest();
  const summary = { generated: [], reused: [], skipped: [], golden: [], goldenPending: [], goldenSkipped: [], errors: [], missing: [] };

  log('media-browser-test fixture bake');
  log(
    `  tools: ffmpeg=${TOOLS.ffmpeg} ffprobe=${TOOLS.ffprobe} metaflac=${TOOLS.metaflac} ` +
      `mp4encrypt=${TOOLS.mp4encrypt} shaka=${TOOLS.packager}`,
  );
  if (flags.subset) log(`  subset: ${flags.subset.join(', ')}`);
  log('');

  for (const entry of manifest.assets) {
    const id = entry.id;
    if (!id || id.startsWith('$')) continue;
    if (!selected(id)) continue;

    const out = join(MEDIA_DIR, id);

    // In golden-only mode we don't generate, but we still flag any provided/captured asset that
    // hasn't been dropped in yet so the MISSING ASSETS block stays accurate.
    if (flags.goldenOnly && !existsSync(out) && (entry.source === 'provided' || entry.source === 'captured')) {
      summary.missing.push({ id, entry, reason: `source:'${entry.source}' and not present on disk (golden-only run).` });
    }

    // 1. Generate media (unless golden-only).
    if (!flags.goldenOnly) {
      const recipe = RECIPES[id];
      const exists = existsSync(out);

      if (exists && !flags.force) {
        // Idempotent: reuse the existing file (incl. drop-in `provided`/`captured` assets), just
        // refresh its checksum below. This is how a manually-dropped 'provided' asset enters the
        // corpus: on the next bake it is found on disk and checksummed like anything else.
        summary.reused.push(id);
        log(`  = ${id} (reuse existing)`);
      } else if (!recipe) {
        // No generator. For a `provided`/`captured` asset this is EXPECTED (the bake can't make it).
        // Record it as MISSING (drop-in needed) rather than a hard error.
        entry.sha256 = null;
        entry.sizeBytes = null;
        if (entry.source === 'provided' || entry.source === 'captured') {
          summary.missing.push({ id, entry, reason: `source:'${entry.source}' and not present on disk (no generator).` });
          log(`  ◌ ${id}: MISSING (${entry.source}; drop into fixtures/media/ — see MISSING ASSETS)`);
        } else {
          summary.errors.push({ id, reason: 'no recipe defined in bake.mjs' });
          log(`  ! ${id}: NO RECIPE — skipped (add one to RECIPES)`);
        }
        continue;
      } else {
        try {
          mkdirSync(dirname(out), { recursive: true });
          // Recipes may be sync or async (the pinned BigBuckBunny fetch is async). They also receive
          // the manifest `entry` so fetch recipes can read sourceUrl / a recorded sha256.
          const res = await recipe(out, entry);
          if (res && typeof res === 'object' && res.skipped) {
            entry.sha256 = null;
            entry.sizeBytes = null;
            // A skipped `provided`/`captured` asset (cbcs without Bento4, BigBuckBunny without a
            // trusted sha256, the recorder WebM) is a drop-in requirement → MISSING ASSETS, not a
            // plain skip. Other skips (e.g. --skip-longform on a generated asset) stay informational.
            if (entry.source === 'provided' || entry.source === 'captured') {
              summary.missing.push({ id, entry, reason: res.reason });
              log(`  ◌ ${id}: MISSING (${entry.source}) — ${res.reason}`);
            } else {
              summary.skipped.push({ id, reason: res.reason });
              log(`  ⨯ ${id}: SKIPPED — ${res.reason}`);
            }
            continue;
          }
          summary.generated.push(id);
          log(`  + ${id}`);
        } catch (e) {
          summary.errors.push({ id, reason: String(e?.message || e) });
          log(`  ! ${id}: ERROR — ${String(e?.message || e)}`);
          continue;
        }
      }

      // Checksum + size into the manifest (covers freshly-generated, fetched, AND reused/drop-in files).
      if (existsSync(out)) {
        entry.sha256 = sha256File(out);
        entry.sizeBytes = statSync(out).size;
      }
    }

    // 2. Golden derivation (unless media-only). Skip for assets that don't exist (were skipped).
    if (!flags.mediaOnly) {
      if (!existsSync(out)) {
        log(`  · ${id}: golden skipped (no media present)`);
        continue;
      }
      // Intentionally-broken robustness assets: ffprobe SHOULD fail on these. Skip golden derivation
      // and record a clear note instead of emitting a GOLDEN ERROR (which would fail the bake). The
      // graceful-failure oracle compares the engine's behavior, not against ffprobe-derived golden.
      if (EXPECT_GOLDEN_FAILURE.has(id)) {
        summary.goldenSkipped.push(id);
        log(`  · ${id}: no golden (intentionally broken — graceful-failure oracle, ffprobe failure expected)`);
        continue;
      }
      // image negatives: ffprobe may legitimately produce minimal/odd output. We still emit whatever
      // golden we can; the oracle for negatives is graceful-failure, not meta.
      try {
        const meta = normalizedMetadataFor(id, out);
        writeJson(join(GOLDEN_DIR, `${id}.meta.json`), meta);

        const packets = packetsFor(id, out);
        writeJson(join(GOLDEN_DIR, `${id}.packets.json`), packets);

        const frames = frameHookFor(id, out, meta);
        if (frames) {
          // Don't clobber a browser-filled frames golden: if an existing file has real digests, keep it.
          const fp = join(GOLDEN_DIR, `${id}.frames.json`);
          if (existsSync(fp)) {
            try {
              const prev = JSON.parse(readFileSync(fp, 'utf8'));
              const hasReal = Array.isArray(prev.frames) && prev.frames.some((f) => f.sha256);
              if (hasReal) {
                summary.golden.push(id);
                log(`  ◷ ${id} golden (meta+packets; frames already filled by browser pass)`);
                maybeWriteEncGolden(id);
                continue;
              }
            } catch {
              /* fall through to rewrite the placeholder */
            }
          }
          writeJson(fp, frames);
          summary.goldenPending.push(id);
        }
        summary.golden.push(id);
        log(`  ◷ ${id} golden (meta+packets${frames ? '+frames-hook' : ''})`);
      } catch (e) {
        summary.errors.push({ id, reason: `golden: ${String(e?.message || e)}` });
        log(`  ! ${id}: GOLDEN ERROR — ${String(e?.message || e)}`);
      }
    }

    // 3. Encryption-key golden for the decrypt oracle (when this asset produced secrets).
    maybeWriteEncGolden(id);
  }

  // Persist manifest (checksums + sizes).
  if (!flags.goldenOnly) {
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  }

  // Record HLS segment listing in golden notes (streaming oracle needs to know the segment files).
  recordHlsSegments(summary);

  printSummary(summary);
  printMissingAssets(summary);

  // Exit non-zero if any hard error occurred (skips and MISSING are NOT errors — MISSING is an
  // expected, honest state for provided/captured assets the bake cannot produce, §5.4).
  if (summary.errors.length) process.exitCode = 1;
}

function maybeWriteEncGolden(id) {
  const secret = ENC_SECRETS[id];
  if (!secret) return;
  writeJson(join(GOLDEN_DIR, `${id}.keys.json`), {
    $note: 'Decrypt-oracle ground truth (key/KID/IV) baked offline. Browser decrypt output is compared bit-exact against the golden frames decoded from the cleartext.',
    assetId: id,
    ...secret,
  });
}

function recordHlsSegments(summary) {
  for (const playlist of ['hls_vod.m3u8', 'hls_aes128.m3u8']) {
    const p = join(MEDIA_DIR, playlist);
    if (!existsSync(p)) continue;
    const base = playlist.replace(/\.m3u8$/, '');
    const segments = readdirSync(MEDIA_DIR).filter((f) => f.startsWith(`${base}_`) && f.endsWith('.ts'));
    writeJson(join(GOLDEN_DIR, `${playlist}.segments.json`), {
      $note: 'HLS segment listing for the streaming oracle. Segments are served as siblings of the playlist under fixtures/media/.',
      playlist,
      segments: segments.sort(),
      ...(playlist === 'hls_aes128.m3u8' ? { keyFile: 'hls_aes128.key' } : {}),
    });
    summary.golden.push(`${playlist} (segments)`);
  }
}

function printSummary(s) {
  log('');
  log('── bake summary ───────────────────────────────────────────────');
  log(`  generated : ${s.generated.length}  ${s.generated.join(', ') || '—'}`);
  log(`  reused    : ${s.reused.length}  ${s.reused.join(', ') || '—'}`);
  log(`  golden    : ${[...new Set(s.golden)].length} assets (meta+packets[+frames-hook])`);
  if (s.goldenPending.length) {
    log(`  frames TODO: ${s.goldenPending.length} assets need a browser frame-digest pass — ${s.goldenPending.join(', ')}`);
  }
  if (s.skipped.length) {
    log(`  skipped   : ${s.skipped.length}`);
    for (const k of s.skipped) log(`      ⨯ ${k.id} — ${k.reason}`);
  }
  if (s.goldenSkipped?.length) {
    log(`  no golden : ${s.goldenSkipped.length} (intentionally broken — ffprobe failure expected) — ${s.goldenSkipped.join(', ')}`);
  }
  if (NOSEEKTABLE_CAVEAT) {
    log('  caveat    : flac_noseektable.flac — metaflac not installed; SEEKTABLE could not be stripped (asset kept, golden notes the discrepancy).');
  }
  if (s.errors.length) {
    log(`  ERRORS    : ${s.errors.length}`);
    for (const k of s.errors) log(`      ! ${k.id} — ${k.reason}`);
  }
  log('────────────────────────────────────────────────────────────────');
  log('Re-run is idempotent: existing files are reused (use --force to regenerate).');
}

/**
 * MISSING ASSETS block (§5.4). For every asset the bake could NOT produce/fetch (source:'provided'
 * or 'captured' and not present, or a skipped provided fetch), print: the exact drop path, where to
 * obtain it, and the expected size/sha256 when known. The suite marks dependent cases
 * NA(asset-missing) until each file is dropped in and `bun fixtures/bake.mjs --golden-only` is re-run.
 * This is printed to BOTH log and (always, even with --quiet) console so the orchestrator surfaces it.
 */
function printMissingAssets(s) {
  // De-dupe by id (golden-only + generate passes can both push the same id).
  const byId = new Map();
  for (const m of s.missing) if (!byId.has(m.id)) byId.set(m.id, m);
  const items = [...byId.values()];

  // Always print the block (even under --quiet) so a wrapper/agent can relay it verbatim.
  const out = (...m) => console.log(...m);
  out('');
  out('═══ MISSING ASSETS ═══════════════════════════════════════════════');
  if (!items.length) {
    out('  (none) — every corpus asset is generated, fetched, or already present.');
    out('══════════════════════════════════════════════════════════════════');
    return;
  }
  out(`  ${items.length} asset(s) the bake cannot produce in this environment. Drop each file into`);
  out('  the path shown, then re-run `bun fixtures/bake.mjs --golden-only` to checksum + bake golden.');
  out('  Until present, every case needing one is NA(asset-missing) (never FAIL, never fabricated).');
  out('');
  for (const { id, entry, reason } of items) {
    const dropPath = `fixtures/media/${id}`;
    const expSize =
      entry?.expectedSizeBytes != null
        ? `${entry.expectedSizeBytes} bytes (~${(entry.expectedSizeBytes / (1024 * 1024)).toFixed(0)} MiB)`
        : entry?.sizeBytes != null
          ? `${entry.sizeBytes} bytes`
          : 'unknown (compute after acquisition)';
    const expSha = entry?.sha256 || 'unknown (compute with `shasum -a 256` after acquisition, then record in manifest)';
    out(`  • ${id}  [${entry?.sizeBucket ?? '?'} / ${entry?.source ?? '?'}]`);
    out(`      drop at      : ${dropPath}`);
    if (entry?.sourceUrl) out(`      obtain from  : ${entry.sourceUrl}`);
    if (entry?.acquire) out(`      how          : ${entry.acquire}`);
    out(`      expected size: ${expSize}`);
    out(`      expected sha : ${expSha}`);
    if (reason) out(`      why missing  : ${reason}`);
    out('');
  }
  out('══════════════════════════════════════════════════════════════════');
}

main().catch((e) => {
  console.error(`FATAL bake error: ${String(e?.stack || e?.message || e)}`);
  process.exit(1);
});
