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
  deterministicFixtureBytes,
  validateFixtureManifest,
} from './lib/golden-contract.mjs';
import {
  activeArtifactsForMerge,
  activeAvailabilityForMerge,
  assessMediaReuse,
  publishGeneration,
  readActiveGenerationIndex,
  resolveExplicitAssetUpdateScope,
  stageReadyPublicationRecord,
  stageUnavailablePublicationRecord,
} from './lib/generation-publication.mjs';
import {
  HLS_RESOURCE_FIXTURE_IDS,
  validatePinnedHlsResourceClosure,
} from './lib/hls-resource-fixtures.mjs';

// ── Paths ──────────────────────────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = __dirname;
const MEDIA_DIR = join(FIXTURES_DIR, 'media');
const GOLDEN_DIR = join(FIXTURES_DIR, 'golden');
const MANIFEST_PATH = join(FIXTURES_DIR, 'manifest.json');
const FIXTURE_SEED_PATH = join(FIXTURES_DIR, 'fixture-seed.json');
const TOOLCHAIN_LOCK_PATH = join(FIXTURES_DIR, 'toolchain.lock.json');
const FIXTURE_SEED = JSON.parse(readFileSync(FIXTURE_SEED_PATH, 'utf8')).seedHex;
const TOOLCHAIN_LOCK = JSON.parse(readFileSync(TOOLCHAIN_LOCK_PATH, 'utf8'));
const FIXTURE_SOURCE_DATE_EPOCH = process.env.SOURCE_DATE_EPOCH ?? TOOLCHAIN_LOCK.sourceDateEpoch;
const FFMPEG_BIN = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE_BIN = process.env.FFPROBE_PATH || 'ffprobe';

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
  update: false,
  subset: /** @type {string[] | null} */ (null),
};
const subsetTerms = [];
let explicitUpdateScope;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--force') flags.force = true;
  else if (a === '--quiet') flags.quiet = true;
  else if (a === '--golden-only') flags.goldenOnly = true;
  else if (a === '--media-only') flags.mediaOnly = true;
  else if (a === '--skip-longform') flags.skipLongform = true;
  else if (a === '--update') flags.update = true;
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
      '                      [--media-only] [--skip-longform] [--update] [--quiet]',
      '  --update explicitly replaces a mismatched source identity and invalidates dependent evidence',
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
  ffmpeg: toolExists(FFMPEG_BIN),
  ffprobe: toolExists(FFPROBE_BIN),
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
const TOOL_PERIMETER = collectToolPerimeter();
TOOL_PERIMETER.declaredLock = {
  sha256: sha256File(TOOLCHAIN_LOCK_PATH),
  sourceDateEpoch: TOOLCHAIN_LOCK.sourceDateEpoch,
  locale: TOOLCHAIN_LOCK.locale,
  timezone: TOOLCHAIN_LOCK.timezone,
  required: TOOLCHAIN_LOCK.required,
  optional: TOOLCHAIN_LOCK.optional,
};
TOOL_PERIMETER.environment.SOURCE_DATE_EPOCH = String(FIXTURE_SOURCE_DATE_EPOCH);

function ffmpeg(args, label) {
  // -y overwrite, -nostdin so a background run never blocks on a prompt, -loglevel error to keep
  // the bake quiet unless something breaks.
  const full = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args];
  const res = spawnSync(FFMPEG_BIN, full, { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (res.status !== 0) {
    throw new Error(`ffmpeg failed for ${label}: ${res.stderr || res.error?.message || `exit ${res.status}`}`);
  }
}

function ffprobeJson(args, label) {
  const full = ['-hide_banner', '-loglevel', 'error', '-of', 'json', ...args];
  const res = spawnSync(FFPROBE_BIN, full, { encoding: 'utf8', maxBuffer: 1 << 28 });
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

function generateCencCtrClearBaseline(out, label = 'cenc_ctr_clear.mp4') {
  ffmpeg(
    [
      '-f', 'lavfi', '-i', TESTSRC(1280, 720, 30, 5),
      '-f', 'lavfi', '-i', SINE(440, 5),
      ...BITEXACT, ...NOMETA,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-g', '60', '-keyint_min', '60',
      '-x264-params', 'scenecut=0:bframes=0',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
      '-movflags', '+faststart+frag_keyframe',
      out,
    ],
    label,
  );
}

// Deterministic malformed-fixture helpers. These intentionally produce real files on disk under
// fixtures/media so robustness scenarios do not depend on in-memory mutation.
function mutateFixture(sourceId, mutate) {
  return (out) => {
    const sourcePath = join(MEDIA_DIR, sourceId);
    if (!existsSync(sourcePath)) {
      return { skipped: true, reason: `source fixture '${sourceId}' is not present; bake it first.` };
    }
    const bytes = new Uint8Array(readFileSync(sourcePath));
    writeFileSync(out, Buffer.from(mutate(bytes)));
    return 'ok';
  };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bitFlipFixture(count = 64, seed = 0x9e3779b9) {
  return (bytes) => {
    const out = bytes.slice();
    if (out.length === 0) return out;
    const rnd = mulberry32(seed);
    for (let i = 0; i < count; i++) {
      const pos = Math.floor(rnd() * out.length);
      const bit = 1 << Math.floor(rnd() * 8);
      out[pos] = (out[pos] ?? 0) ^ bit;
    }
    return out;
  };
}

function truncateHeadFixture(headerBytes) {
  return (bytes) => (bytes.length <= headerBytes ? new Uint8Array(0) : bytes.slice(headerBytes));
}

function truncateTailFixture(fraction) {
  return (bytes) => bytes.slice(0, Math.max(0, Math.floor(bytes.length * fraction)));
}

function zeroAllFixture() {
  return (bytes) => new Uint8Array(bytes.length);
}

function zeroRandomSpansFixture(spans = 4, spanLen = 1024, seed = 0x1234abcd, skipHead = 512) {
  return (bytes) => {
    const out = bytes.slice();
    if (out.length <= skipHead) return out;
    const rnd = mulberry32(seed);
    const range = out.length - skipHead - spanLen;
    if (range <= 0) return out;
    for (let s = 0; s < spans; s++) {
      const start = skipHead + Math.floor(rnd() * range);
      out.fill(0, start, start + spanLen);
    }
    return out;
  };
}

function truncateAtFixture(keep) {
  return (bytes) => bytes.slice(0, Math.min(keep, bytes.length));
}

function corruptWavFmtFixture() {
  return (bytes) => {
    const out = bytes.slice();
    out.fill(0, 16, Math.min(36, out.length));
    return out;
  };
}

let curatedHlsFixturesReady = false;
function ensureCuratedHlsFixtures() {
  if (curatedHlsFixturesReady) return;
  const result = spawnSync(process.execPath, [join(FIXTURES_DIR, 'curate-hls-resource-indices.mjs')], {
    encoding: 'utf8',
    maxBuffer: 1 << 24,
  });
  if (result.status !== 0) {
    throw new Error(
      `HLS resource fixture curation failed: ${result.stderr || result.stdout || result.error?.message || `exit ${result.status}`}`,
    );
  }
  curatedHlsFixturesReady = true;
}

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
  'hdr10_pq_micro_hevc.mp4': (out) => {
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(128, 72, 5, 2),
        ...BITEXACT, ...NOMETA,
        '-vf', 'format=yuv420p10le',
        '-c:v', 'libx265', '-pix_fmt', 'yuv420p10le', '-profile:v', 'main10',
        '-crf', '28', '-preset', 'ultrafast', '-tag:v', 'hvc1',
        '-x265-params',
        [
          'log-level=error',
          'keyint=5',
          'min-keyint=5',
          'scenecut=0',
          'bframes=0',
          'colorprim=bt2020',
          'transfer=smpte2084',
          'colormatrix=bt2020nc',
          'hdr10=1',
          'repeat-headers=1',
        ].join(':'),
        '-color_primaries', 'bt2020',
        '-color_trc', 'smpte2084',
        '-colorspace', 'bt2020nc',
        '-movflags', '+faststart',
        out,
      ],
      'hdr10_pq_micro_hevc.mp4',
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
    // The pinned FFmpeg build writes the ISO-BMFF display matrix while stream-copying an authored
    // track; setting rotate on the initial encoder invocation is silently discarded.
    const tmp = mkdtempBake();
    try {
      const plain = join(tmp, 'plain.mp4');
      ffmpeg(
        [
          '-f', 'lavfi', '-i', TESTSRC(1280, 720, 30, 10),
          '-f', 'lavfi', '-i', SINE(440, 10),
          ...BITEXACT, ...NOMETA,
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-g', '60', '-keyint_min', '60',
          '-x264-params', 'scenecut=0:bframes=0',
          '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
          '-movflags', '+faststart', plain,
        ],
        'h264_rotated90.mp4 encode',
      );
      ffmpeg(
        [
          '-display_rotation:v:0', '90', '-i', plain, ...NOMETA,
          '-map', '0', '-c', 'copy',
          '-movflags', '+faststart', out,
        ],
        'h264_rotated90.mp4 display matrix',
      );
      return 'ok';
    } finally {
      rmSafe(tmp);
    }
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
  'h264_two_video_tracks.mp4': (out) => {
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(1280, 720, 30, 10),
        '-f', 'lavfi', '-i', SINE(440, 10),
        ...BITEXACT, ...NOMETA,
        '-map', '0:v', '-map', '0:v', '-map', '1:a',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-g', '60', '-keyint_min', '60',
        '-x264-params', 'scenecut=0:bframes=0',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
        '-movflags', '+faststart', out,
      ],
      'h264_two_video_tracks.mp4',
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
  'h264_10bit_1080p_5s.mp4': (out) => {
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(1920, 1080, 30, 5),
        '-f', 'lavfi', '-i', SINE(440, 5),
        ...BITEXACT, ...NOMETA,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p10le', '-profile:v', 'high10', '-crf', '24',
        '-g', '60', '-keyint_min', '60', '-x264-params', 'scenecut=0:bframes=0',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
        '-movflags', '+faststart',
        out,
      ],
      'h264_10bit_1080p_5s.mp4',
    );
    return 'ok';
  },
  'h264_open_gop_1080p.mp4': (out) => {
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(1920, 1080, 30, 5),
        '-f', 'lavfi', '-i', SINE(440, 5),
        ...BITEXACT, ...NOMETA,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22',
        '-g', '60', '-keyint_min', '60', '-bf', '3',
        '-x264-params', 'open-gop=1:b-adapt=2:scenecut=40',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
        '-movflags', '+faststart',
        out,
      ],
      'h264_open_gop_1080p.mp4',
    );
    return 'ok';
  },
  'h264_1fps_30s.mp4': (out) => {
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(320, 240, 1, 30),
        ...BITEXACT, ...NOMETA,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28',
        '-g', '1', '-keyint_min', '1', '-x264-params', 'scenecut=0:bframes=0',
        '-movflags', '+faststart',
        out,
      ],
      'h264_1fps_30s.mp4',
    );
    return 'ok';
  },
  'h264_video_only.mp4': (out) => {
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(1280, 720, 30, 5),
        ...BITEXACT, ...NOMETA,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24',
        '-g', '60', '-keyint_min', '60', '-x264-params', 'scenecut=0:bframes=0',
        '-movflags', '+faststart',
        out,
      ],
      'h264_video_only.mp4',
    );
    return 'ok';
  },
  'aac_audio_only.m4a': (out) => {
    ffmpeg(
      [
        '-f', 'lavfi', '-i', SINE(440, 10),
        ...BITEXACT, ...NOMETA,
        '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
        '-movflags', '+faststart', '-f', 'mp4',
        out,
      ],
      'aac_audio_only.m4a',
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
      const keyBytes = randomBytes16('hls_aes128:key');
      const ivBytes = randomBytes16('hls_aes128:iv');
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
  'hls_aes128_clear.mp4': (out) => {
    // Offline plaintext reference for the HLS AES-128 decrypt oracle. The browser cannot decode HLS
    // playlists in Chromium, so decrypt rows compare engine output against this browser-decodable MP4
    // remux of the encrypted playlist, generated by native ffmpeg using the committed fixture key.
    ffmpeg(
      [
        '-allowed_extensions', 'ALL',
        '-protocol_whitelist', 'file,crypto',
        '-i', join(MEDIA_DIR, 'hls_aes128.m3u8'),
        '-c', 'copy',
        '-movflags', '+faststart',
        out,
      ],
      'hls_aes128_clear.mp4',
    );
    return 'ok';
  },
  'hls_sample_aes.m3u8': () => {
    ensureCuratedHlsFixtures();
    return 'ok';
  },
  'hls_aes128_seq0.m3u8': () => {
    ensureCuratedHlsFixtures();
    return 'ok';
  },
  'hls_aes128_seq42.m3u8': () => {
    ensureCuratedHlsFixtures();
    return 'ok';
  },
  'hls_aes128_rotation.m3u8': () => {
    ensureCuratedHlsFixtures();
    return 'ok';
  },
  'hls_aes128_method_none.m3u8': () => {
    ensureCuratedHlsFixtures();
    return 'ok';
  },

  // ── Encrypted MP4 (CENC) ─────────────────────────────────────────────────────────────────────
  'cenc_ctr_clear.mp4': (out) => {
    // Clear baseline used to produce cenc_ctr.mp4. Browser frame-bake digests for this asset are the
    // independent plaintext oracle that CENC-CTR decrypt output must match.
    generateCencCtrClearBaseline(out);
    return 'ok';
  },
  'cenc_ctr.mp4': (out) => {
    // cenc-aes-ctr: ffmpeg's mov muxer supports -encryption_scheme cenc-aes-ctr (since ~4.x). We
    // re-encrypt a freshly built clear baseline so the asset is self-contained.
    const tmp = mkdtempBake();
    try {
      const plain = join(tmp, 'plain.mp4');
      generateCencCtrClearBaseline(plain, 'cenc_ctr.mp4(plain)');
      const keyHex = '00112233445566778899aabbccddeeff';
      const kidHex = '11223344556677889900aabbccddeeff';
      ffmpeg(
        [
          '-i', plain,
          '-c', 'copy',
          '-encryption_scheme', 'cenc-aes-ctr',
          '-encryption_key', keyHex,
          '-encryption_kid', kidHex,
          '-movflags', '+faststart',
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
          'cbcs (pattern) encryption requires Bento4 (mp4encrypt --method MPEG-CBCS) ' +
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
      const cbcs = buildBento4CbcsEncryptionArgs({
        keyHex,
        kidHex,
        seedHex: FIXTURE_SEED,
        plainPath: plain,
        outputPath: out,
      });
      if (TOOLS.mp4encrypt) {
        // Bento4 cbcs pattern (1:9 crypt:skip is the common AVC cbcs pattern).
        const res = spawnSync(
          'mp4encrypt',
          cbcs.args,
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
            '--keys', `label=:key_id=${kidHex}:key=${keyHex}:iv=${cbcs.ivHex}`,
          ],
          { encoding: 'utf8' },
        );
        if (res.status !== 0) throw new Error(res.stderr || `packager exit ${res.status}`);
      }
      ENC_SECRETS['cenc_cbcs.mp4'] = { keyHex, kid: kidHex, ivHex: cbcs.ivHex, scheme: 'cenc-cbcs' };
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
  'wav_s16_44k1.wav': (out) => {
    ffmpeg(['-f', 'lavfi', '-i', SINE(440, 10, 44100), ...BITEXACT, ...NOMETA, '-c:a', 'pcm_s16le', '-ar', '44100', '-ac', '2', '-f', 'wav', out], 'wav_s16_44k1.wav');
    return 'ok';
  },
  'wav_s16_mono.wav': (out) => {
    ffmpeg(['-f', 'lavfi', '-i', SINE(440, 10, 48000, 1), ...BITEXACT, ...NOMETA, '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '1', '-f', 'wav', out], 'wav_s16_mono.wav');
    return 'ok';
  },
  'wav_5_1.wav': (out) => {
    ffmpeg(
      [
        '-f', 'lavfi', '-i', SINE(440, 10, 48000, 1),
        ...BITEXACT, ...NOMETA,
        '-af', 'pan=5.1|c0=c0|c1=c0|c2=c0|c3=c0|c4=c0|c5=c0',
        '-c:a', 'pcm_s16le', '-ar', '48000', '-f', 'wav',
        out,
      ],
      'wav_5_1.wav',
    );
    return 'ok';
  },
  'pcm_s24be.aiff': (out) => {
    ffmpeg(['-f', 'lavfi', '-i', SINE(440, 5), ...BITEXACT, ...NOMETA, '-c:a', 'pcm_s24be', '-ar', '48000', '-ac', '2', '-f', 'aiff', out], 'pcm_s24be.aiff');
    return 'ok';
  },
  'pcm_s16.caf': (out) => {
    ffmpeg(['-f', 'lavfi', '-i', SINE(440, 5), ...BITEXACT, ...NOMETA, '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', '-f', 'caf', out], 'pcm_s16.caf');
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
  'longform_1h_audio_pcm.wav': (out) => {
    if (flags.skipLongform) {
      return { skipped: true, reason: '--skip-longform: 1h PCM WAV intentionally not generated this run.' };
    }
    ffmpeg(
      [
        '-f', 'lavfi', '-i', SINE(440, 3600, 44100, 1),
        ...BITEXACT, ...NOMETA,
        '-c:a', 'pcm_s16le', '-ar', '44100', '-ac', '1', '-f', 'wav',
        out,
      ],
      'longform_1h_audio_pcm.wav',
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

  // ── Size-ladder cross-family completeness (§5.3) ──────────────────────────────────────────────
  // §5.3: "For each bucket we keep at least one asset per major container/codec it is meant to
  // stress (e.g. a *huge* H.264 MP4 AND a *huge* VP9 WebM), so the size axis crosses the format
  // axis." The huge + massive rungs had only the MP4/H.264 family; these add the WebM/VP9 twin so
  // BOTH rungs cross container/codec exactly as the spec's worked example requires. VERY slow
  // (VP9 sw encode of long 1080p) + large → gated by --skip-longform like their MP4 siblings.
  'huge_vp9_1080p_240s.webm': (out) => {
    if (flags.skipLongform) {
      return { skipped: true, reason: '--skip-longform: huge ~240s 1080p VP9 WebM (huge-rung WebM/VP9 twin) intentionally not generated this run (VP9 sw encode is very slow).' };
    }
    // 240s @ ~1080p VP9 CRF34 lands in the ~500-700 MB "huge" band, matching huge_h264_1080p_600s.mov.
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(1920, 1080, 30, 240),
        '-f', 'lavfi', '-i', SINE(440, 240),
        ...BITEXACT, ...NOMETA,
        '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p', '-b:v', '0', '-crf', '34',
        '-row-mt', '1', '-deadline', 'good', '-cpu-used', '5', '-g', '60',
        '-c:a', 'libopus', '-b:a', '96k', '-ar', '48000', '-ac', '2',
        '-f', 'webm',
        out,
      ],
      'huge_vp9_1080p_240s.webm',
    );
    return 'ok';
  },
  'massive_vp9_1080p_2h.webm': (out) => {
    if (flags.skipLongform) {
      return { skipped: true, reason: '--skip-longform: massive 2h 1080p VP9 WebM (massive-rung WebM/VP9 twin) intentionally not generated this run.' };
    }
    // Low-bitrate capped VP9 so 2h lands ~1-1.4 GB / many-thousand-sample with bounded encode time,
    // mirroring massive_h264_1080p_2h.mp4 in the other family.
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(1920, 1080, 30, 7200),
        '-f', 'lavfi', '-i', SINE(440, 7200, 48000, 1),
        ...BITEXACT, ...NOMETA,
        '-c:v', 'libvpx-vp9', '-b:v', '700k', '-maxrate', '800k', '-bufsize', '1600k',
        '-row-mt', '1', '-deadline', 'good', '-cpu-used', '5', '-g', '60', '-pix_fmt', 'yuv420p',
        '-c:a', 'libopus', '-b:a', '64k', '-ar', '48000', '-ac', '1',
        '-f', 'webm',
        out,
      ],
      'massive_vp9_1080p_2h.webm',
    );
    return 'ok';
  },

  // ── Deep-edge assets (§7 / §A.16) ─────────────────────────────────────────────────────────────
  // Degenerate tiny dimensions. §A.16: "0×0 or 1×1 video". libx264/yuv420p REQUIRES even
  // dimensions, so a real 1×1 cannot be H.264 — VP9 carries 1×1 honestly. The MP4/H.264 family's
  // smallest-even degenerate twin (2×2) lives in video_2x2_h264.mp4 below. (The 1-fps end of the
  // "extreme fps" edge is already covered by micro_h264_1frame.mp4 @ rate=1.)
  'video_1x1.webm': (out) => {
    // Build at 4×4 then scale to 1×1 (testsrc2 won't synthesize a 1×1 source directly).
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(4, 4, 30, 2),
        ...BITEXACT, ...NOMETA,
        '-vf', 'scale=1:1',
        '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p', '-b:v', '0', '-crf', '40',
        '-deadline', 'good', '-cpu-used', '5', '-g', '30',
        '-f', 'webm',
        out,
      ],
      'video_1x1.webm',
    );
    return 'ok';
  },
  'video_2x2_h264.mp4': (out) => {
    // Smallest even-dimension H.264 (libx264 cannot do 1×1). The MP4/H.264 degenerate-size twin of
    // video_1x1.webm so the tiny-dimension edge crosses both major families.
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(2, 2, 30, 2),
        ...BITEXACT, ...NOMETA,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '30', '-g', '30', '-keyint_min', '30',
        '-x264-params', 'scenecut=0:bframes=0',
        '-movflags', '+faststart',
        out,
      ],
      'video_2x2_h264.mp4',
    );
    return 'ok';
  },
  'video_240fps.mp4': (out) => {
    // Extreme high fps (240 fps) end of §A.16's "extreme fps (1 fps, 240 fps)".
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(320, 240, 240, 2),
        ...BITEXACT, ...NOMETA,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', '-g', '240', '-keyint_min', '240',
        '-x264-params', 'scenecut=0:bframes=0',
        '-movflags', '+faststart',
        out,
      ],
      'video_240fps.mp4',
    );
    return 'ok';
  },
  'fragmented_cmaf.mp4': (out) => {
    // CMAF-style fragmented MP4: empty moov + moof/mdat fragments (init+media split). §A.16
    // "fragmented/CMAF init+media split". Clean (unencrypted) so it isolates the fragmentation edge
    // from the encryption edge.
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(1280, 720, 30, 4),
        '-f', 'lavfi', '-i', SINE(440, 4),
        ...BITEXACT, ...NOMETA,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-g', '60', '-keyint_min', '60',
        '-x264-params', 'scenecut=0:bframes=0',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
        // CMAF-ish: fragment on each keyframe, empty moov, default_base_moof for self-contained moofs.
        '-movflags', '+frag_keyframe+empty_moov+default_base_moof',
        '-f', 'mp4',
        out,
      ],
      'fragmented_cmaf.mp4',
    );
    return 'ok';
  },
  'mislabeled_h264.webm': (out) => {
    // Mismatched container/codec (§A.16 "h264 mislabeled"): genuine H.264/MP4 (ISOBMFF) BYTES written
    // into a file whose extension claims WebM. `-f mp4` forces the muxer regardless of the .webm name,
    // so the bytes start with `ftyp...` (NOT the EBML 1A45DFA3 magic). The probe oracle must trust the
    // sniffed content, not the lying extension/MIME. Golden meta is derived from the true bytes (mp4).
    ffmpeg(
      [
        '-f', 'lavfi', '-i', TESTSRC(320, 240, 30, 2),
        '-f', 'lavfi', '-i', SINE(440, 2),
        ...BITEXACT, ...NOMETA,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', '-g', '60', '-keyint_min', '60',
        '-x264-params', 'scenecut=0:bframes=0',
        '-c:a', 'aac', '-b:a', '96k', '-ar', '48000', '-ac', '2',
        '-movflags', '+faststart',
        '-f', 'mp4', // <-- override the .webm extension: real container is MP4
        out,
      ],
      'mislabeled_h264.webm',
    );
    return 'ok';
  },
  'gapless_aac.m4a': (out) => {
    // Gapless audio edge (§A.16 "gapless audio (encoder delay/padding)"). AAC always carries encoder
    // delay (priming samples) + end padding; a non-frame-aligned duration (1.013 s @ 44.1 kHz) makes
    // the padding non-trivial. iTunSMPB/edit-list gapless info must be honored so the decoded sample
    // count matches the nominal duration (no audible gap on loop).
    ffmpeg(
      ['-f', 'lavfi', '-i', SINE(440, 1.013, 44100), ...BITEXACT, ...NOMETA, '-c:a', 'aac', '-b:a', '96k', '-ar', '44100', '-ac', '2', '-movflags', '+faststart', '-f', 'mp4', out],
      'gapless_aac.m4a',
    );
    return 'ok';
  },
  'audio_6ch_51.m4a': (out) => {
    // Variable / non-stereo channel count (§A.16 "variable channel count"): a 6-channel 5.1 AAC track
    // (the rest of the audio corpus is mono/stereo). Exercises channel-layout-aware probe + downmix.
    ffmpeg(
      [
        '-f', 'lavfi', '-i', SINE(440, 3),
        ...BITEXACT, ...NOMETA,
        // Fan the mono sine out to a full 5.1 layout so channels=6 / layout=5.1.
        '-af', 'pan=5.1|c0=c0|c1=c0|c2=c0|c3=c0|c4=c0|c5=c0',
        '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
        '-movflags', '+faststart', '-f', 'mp4',
        out,
      ],
      'audio_6ch_51.m4a',
    );
    return 'ok';
  },
  'ts_discontinuity.ts': (out) => {
    // Timestamp discontinuity (§A.16 "timestamp wraparound / discontinuity (TS)"). A reliable,
    // deterministic discontinuity is built by concatenating two independently-timestamped MPEG-TS
    // segments: segment B is muxed with a large +output_ts_offset, so the joined stream's PTS jumps
    // forward (~+597 s) at the splice. TS is byte-concatenable at the packet boundary, so we write
    // segA then segB into one .ts. The demux oracle must tolerate the forward PTS jump without
    // treating it as a corrupt stream (no negative-duration / no hang).
    const tmp = mkdtempBake();
    try {
      const segA = join(tmp, 'a.ts');
      const segB = join(tmp, 'b.ts');
      const tsArgs = (freq, extra) => [
        '-f', 'lavfi', '-i', TESTSRC(320, 240, 30, 2),
        '-f', 'lavfi', '-i', SINE(freq, 2),
        ...BITEXACT, ...NOMETA,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', '-g', '30', '-keyint_min', '30',
        '-x264-params', 'scenecut=0:bframes=0',
        '-c:a', 'aac', '-b:a', '96k', '-ar', '48000', '-ac', '2',
        '-bsf:v', 'h264_mp4toannexb',
        ...extra,
        '-f', 'mpegts',
      ];
      ffmpeg([...tsArgs(440, []), segA], 'ts_discontinuity.ts(segA)');
      ffmpeg([...tsArgs(660, ['-output_ts_offset', '600', '-muxpreload', '0', '-muxdelay', '0']), segB], 'ts_discontinuity.ts(segB)');
      // Raw byte-concat of the two TS files → one stream with a PTS discontinuity at the boundary.
      writeFileSync(out, Buffer.concat([readFileSync(segA), readFileSync(segB)]));
      return 'ok';
    } finally {
      rmSafe(tmp);
    }
  },

  // ── File-backed malformed/fuzz fixtures (§A.16) ─────────────────────────────────────────────
  'demux_mp4_header_destroyed.mp4': mutateFixture('h264_1080p_30s.mp4', truncateHeadFixture(256)),
  'demux_webm_header_destroyed.webm': mutateFixture('vp9_1080p_10s.webm', truncateHeadFixture(128)),
  'remux_zeroed_mp4.mp4': mutateFixture('h264_1080p_30s.mp4', zeroAllFixture()),
  'remux_truncated_h264_50p.mp4': mutateFixture('h264_1080p_30s.mp4', truncateTailFixture(0.5)),
  'remux_headerless_webm.webm': mutateFixture('vp9_1080p_10s.webm', truncateHeadFixture(128)),
  'transcode_truncated_h264_60p.mp4': mutateFixture('h264_1080p_30s.mp4', truncateTailFixture(0.6)),
  'trim_truncated_h264_55p.mp4': mutateFixture('h264_1080p_30s.mp4', truncateTailFixture(0.55)),
  'trim_bitflipped_h264.mp4': mutateFixture('h264_1080p_30s.mp4', bitFlipFixture(128, 0x7711)),
  'cenc_ctr_senc_bitflip.mp4': mutateFixture('cenc_ctr.mp4', bitFlipFixture(96, 0x5e9c01)),
  'cenc_ctr_protection_zeroed.mp4': mutateFixture('cenc_ctr.mp4', zeroRandomSpansFixture(4, 512, 0x5e9c02, 1024)),
  'cenc_ctr_truncated_mdat.mp4': mutateFixture('cenc_ctr.mp4', truncateTailFixture(0.6)),
  'metadata_garbled_id3_mp3.mp3': mutateFixture('mp3_xing.mp3', zeroRandomSpansFixture(1, 320, 0x1d3, 0)),
  'metadata_garbled_ilst_mp4.mp4': mutateFixture('h264_1080p_30s.mp4', zeroRandomSpansFixture(1, 256, 0x1157, 0)),
  'wav_header_truncated.wav': mutateFixture('wav_s16.wav', truncateAtFixture(20)),
  'wav_fmt_corrupt.wav': mutateFixture('wav_s16.wav', corruptWavFmtFixture()),
  'wav_bitflip.wav': mutateFixture('wav_s16.wav', bitFlipFixture(96, 0x5117a)),
  'aiff_header_truncated.aiff': mutateFixture('pcm_s16be.aiff', truncateAtFixture(24)),
  'fuzz_mp4_bitflip.mp4': mutateFixture('h264_1080p_30s.mp4', bitFlipFixture(128, 0x111)),
  'fuzz_mp4_header_truncated.mp4': mutateFixture('h264_1080p_30s.mp4', truncateHeadFixture(256)),
  'fuzz_mp4_tail_truncated.mp4': mutateFixture('h264_1080p_30s.mp4', truncateTailFixture(0.55)),
  'fuzz_mp4_zeroed_spans.mp4': mutateFixture('h264_1080p_30s.mp4', zeroRandomSpansFixture(6, 2048, 0xabc, 1024)),
  'fuzz_webm_bitflip.webm': mutateFixture('vp9_1080p_10s.webm', bitFlipFixture(96, 0x222)),
  'fuzz_webm_header_truncated.webm': mutateFixture('vp9_1080p_10s.webm', truncateHeadFixture(128)),
  'fuzz_ts_zeroed_spans.ts': mutateFixture('h264_ts.ts', zeroRandomSpansFixture(8, 188, 0xdef, 376)),
  'fuzz_flac_bitflip.flac': mutateFixture('flac_seektable.flac', bitFlipFixture(48, 0x333)),
  'fuzz_mp3_header_truncated.mp3': mutateFixture('mp3_xing.mp3', truncateHeadFixture(64)),
  'fuzz_remux_zeroed_spans.mp4': mutateFixture('h264_1080p_30s.mp4', zeroRandomSpansFixture(5, 4096, 0x555, 2048)),
  'fuzz_encrypted_mp4_ciphertext.mp4': mutateFixture('cenc_ctr.mp4', zeroRandomSpansFixture(6, 2048, 0xc0ffee, 2048)),
  'fuzz_adts_aac_bitflip.aac': mutateFixture('aac_adts.aac', bitFlipFixture(64, 0x44a)),
  'fuzz_ogg_opus_header_truncated.ogg': mutateFixture('opus.ogg', truncateHeadFixture(96)),
  'fuzz_mux_target_corrupt_remux.mp4': mutateFixture('h264_1080p_30s.mp4', zeroRandomSpansFixture(5, 4096, 0x5e6, 2048)),
};

// ── Intentionally-broken robustness assets ───────────────────────────────────────────────────
//
// These assets are deliberately malformed (zero-length / header-truncated) to exercise the
// graceful-failure oracle. ffprobe failing to read them is the EXPECTED outcome, not a bake error,
// so we skip golden (meta/packets/frames) derivation for them and record a clear "no golden
// (intentionally broken)" note. They keep their checksum + size in the manifest.
const EXPECT_GOLDEN_FAILURE = new Set([
  'zero_length.mp4',
  'truncated_h264.mp4',
  'demux_mp4_header_destroyed.mp4',
  'demux_webm_header_destroyed.webm',
  'remux_zeroed_mp4.mp4',
  'remux_truncated_h264_50p.mp4',
  'remux_headerless_webm.webm',
  'transcode_truncated_h264_60p.mp4',
  'trim_truncated_h264_55p.mp4',
  'trim_bitflipped_h264.mp4',
  'cenc_ctr_senc_bitflip.mp4',
  'cenc_ctr_protection_zeroed.mp4',
  'cenc_ctr_truncated_mdat.mp4',
  'metadata_garbled_id3_mp3.mp3',
  'metadata_garbled_ilst_mp4.mp4',
  'wav_header_truncated.wav',
  'wav_fmt_corrupt.wav',
  'wav_bitflip.wav',
  'aiff_header_truncated.aiff',
  'fuzz_mp4_bitflip.mp4',
  'fuzz_mp4_header_truncated.mp4',
  'fuzz_mp4_tail_truncated.mp4',
  'fuzz_mp4_zeroed_spans.mp4',
  'fuzz_webm_bitflip.webm',
  'fuzz_webm_header_truncated.webm',
  'fuzz_ts_zeroed_spans.ts',
  'fuzz_flac_bitflip.flac',
  'fuzz_mp3_header_truncated.mp3',
  'fuzz_remux_zeroed_spans.mp4',
  'fuzz_encrypted_mp4_ciphertext.mp4',
  'fuzz_adts_aac_bitflip.aac',
  'fuzz_ogg_opus_header_truncated.ogg',
  'fuzz_mux_target_corrupt_remux.mp4',
]);

// ── Encryption secret + caveat side-channels (filled by recipes, consumed by golden bake) ────────

/** @type {Record<string, { keyHex: string; kid?: string; ivHex?: string; scheme: string }>} */
const ENC_SECRETS = {};
let NOSEEKTABLE_CAVEAT = false;

// ── Small helpers ────────────────────────────────────────────────────────────────────────────

function toHex(buf) {
  return Buffer.from(buf).toString('hex');
}
function randomBytes16(label) {
  return deterministicFixtureBytes(FIXTURE_SEED, label, 16);
}

export const BENTO4_CBCS_IV_LABEL = 'cenc_cbcs.mp4:bento4:track-1:iv';

/** Build the exact Bento4 CBCS arguments with seed-derived IV material and unchanged key/KID. */
export function buildBento4CbcsEncryptionArgs({
  keyHex,
  kidHex,
  seedHex,
  plainPath,
  outputPath,
}) {
  if (!/^[0-9a-f]{32}$/i.test(keyHex)) throw new TypeError('CBCS key must be 16-byte hex');
  if (!/^[0-9a-f]{32}$/i.test(kidHex)) throw new TypeError('CBCS KID must be 16-byte hex');
  const ivHex = deterministicFixtureBytes(seedHex, BENTO4_CBCS_IV_LABEL, 16).toString('hex');
  return {
    ivHex,
    args: [
      '--method', 'MPEG-CBCS',
      '--key', `1:${keyHex.toLowerCase()}:${ivHex}`,
      '--property', `1:KID:${kidHex.toLowerCase()}`,
      plainPath,
      outputPath,
    ],
  };
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

/**
 * Per-asset ffprobe/ffmpeg *input* options for the golden derivation. HLS playlists that reference
 * a sibling AES-128 key file need `-allowed_extensions ALL` (the .key extension is blocked for
 * "security" by default) and `-protocol_whitelist file,crypto,data` so ffprobe will open the key and
 * the encrypted segments. Returned args must precede the input path (they are *input* demux options).
 */
function goldenInputOpts(assetId) {
  return goldenInputOptions(assetId);
}

/** Build NormalizedMetadata (engine.ts) from ffprobe -show_format -show_streams JSON. */
export function normalizeFlatProbeForGolden(probe, frameProbe, assetId = 'fixture.bin') {
  return normalizeProbeMetadata(probe, { assetId, frameProbe });
}

export function flatFramePlaceholderForGolden(assetId, sourceMedia, frameProbe) {
  return buildFramePlaceholder(assetId, sourceMedia, frameProbe);
}

function normalizedMetadataFor(assetId, mediaPath) {
  const inOpts = goldenInputOpts(assetId);
  const probe = ffprobeJson([...inOpts, '-show_format', '-show_streams', mediaPath], `${assetId} meta`);
  const frameProbe = ffprobeJson(
    [...inOpts, '-select_streams', 'v', '-show_frames', '-show_entries', 'frame=stream_index,pts_time,best_effort_timestamp_time,key_frame', '-read_intervals', `%+#${DEFAULT_FRAME_READ_COUNT}`, mediaPath],
    `${assetId} cadence`,
  );
  return normalizeFlatProbeForGolden(probe, frameProbe, assetId);
}

/** Build PacketInfo[] (engine.ts) from ffprobe -show_packets JSON. Times normalized to integer µs. */
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
    FFMPEG_BIN,
    buildGoldenSemanticDecodeArgs(inOpts, mediaPath),
    { encoding: 'utf8', maxBuffer: 1 << 28 },
  );
  if (result.status !== 0) {
    if (assetId.endsWith('hls_sample_aes.m3u8')) {
      // FFmpeg's HLS demuxer does not currently provide an independent SAMPLE-AES reference decode.
      // Only classify that limitation after the strict runtime resource-index contract proves the
      // playlist and every key/segment byte are the pinned fixture. Corrupt/missing bytes still throw.
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

/**
 * Frame-digest golden is the BROWSER's normalized-RGBA sha256 (oracles.ts/digest.ts). ffmpeg cannot
 * produce these bytes (color conversion + canvas rasterization differ), so we emit a clearly marked
 * placeholder that the browser frame pass overwrites. We DO record ffmpeg's frame PTS list so the
 * browser pass knows which presentation times to digest. This is a TODO hook, NOT a fake digest.
 */
function frameHookFor(assetId, mediaPath, meta) {
  const hasVideo = (meta.metadata?.tracks || []).some((t) => t.type === 'video');
  if (!hasVideo) return null; // audio-only / image: no frame-digest golden
  let probe = { frames: [] };
  try {
    const inOpts = goldenInputOpts(assetId);
    probe = ffprobeJson(
      [...inOpts, '-select_streams', 'v:0', '-show_frames', '-show_entries', 'frame=stream_index,pts_time,best_effort_timestamp_time,key_frame', '-read_intervals', `%+#${DEFAULT_FRAME_READ_COUNT}`, mediaPath],
      `${assetId} frames-hook`,
    );
  } catch {
    // Shared placeholder emits an explicit producer-failed record for this observation.
  }
  return flatFramePlaceholderForGolden(assetId, sourceIdentity(mediaPath), probe);
}

function writeJson(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2) + '\n');
}

function sourceIdentity(path) {
  return { sha256: sha256File(path), sizeBytes: statSync(path).size };
}

function artifactEnvelope(artifactKind, assetId, mediaPath, payload, availability = { state: 'ready' }) {
  const sourceMedia = sourceIdentity(mediaPath);
  const provenance = createGoldenProvenance({
    artifactKind,
    assetId,
    sourceMedia,
    recipe: `fixtures/bake.mjs#${artifactKind}`,
    normalizedArguments: {
      assetId,
      artifactKind,
      sourceSha256: sourceMedia.sha256,
      normalizationVersion: payload.schemaVersion ?? null,
    },
    baker: 'media-test/bake@1',
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
  } else if (artifactKind === 'frames') {
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
  } else {
    legacy = { ...payload };
  }
  return createGoldenEnvelope({ artifactKind, assetId, sourceMedia, payload, legacy, provenance, availability });
}

const staged = new Map();
const stagedAvailability = new Map();
// Exact root assets represented by this invocation. HLS key/map/segment sidecars are deliberately
// staged through stageRawArtifact, so they never become independent selected asset IDs.
const stagedRootAssetIds = new Set();

function stageEnvelope(relativeGoldenPath, document) {
  stagedRootAssetIds.add(document.assetId);
  const logicalPath = `golden/${relativeGoldenPath}`;
  stageReadyPublicationRecord(staged, stagedAvailability, {
    logicalPath,
    artifactKind: document.artifactKind,
    bytes: `${JSON.stringify(document, null, 2)}\n`,
    sourceMediaSha256: document.sourceMedia.sha256,
    provenanceSha256: canonicalSha256(document.provenance),
    directPath: join(FIXTURES_DIR, logicalPath),
    document,
  });
}

function stageMedia(assetId, path, sourceMedia, oldSha256) {
  stagedRootAssetIds.add(assetId);
  const logicalPath = `media/${assetId}`;
  const provenance = {
    schema: 'media-test/media-provenance@1', assetId, sourceMedia,
    recipe: 'fixtures/bake.mjs#media', baker: 'media-test/bake@1', perimeter: TOOL_PERIMETER,
  };
  stageReadyPublicationRecord(staged, stagedAvailability, {
    logicalPath,
    artifactKind: 'media',
    sourcePath: path,
    sourceMediaSha256: sourceMedia.sha256,
    provenanceSha256: canonicalSha256(provenance),
    audit: {
      recipe: provenance.recipe,
      bakerVersion: provenance.baker,
      outputArtifactSha256: sourceMedia.sha256,
    },
  });
  if (oldSha256 && oldSha256 !== sourceMedia.sha256) invalidateOldDependents(oldSha256);
}

function stageRawArtifact({ logicalPath, artifactKind, sourcePath, sourceMediaSha256, recipe }) {
  const output = sourceIdentity(sourcePath);
  const provenance = {
    schema: 'media-test/indexed-artifact-provenance@1',
    logicalPath,
    artifactKind,
    sourceMediaSha256,
    output,
    recipe,
    baker: 'media-test/bake@1',
    perimeter: TOOL_PERIMETER,
  };
  stageReadyPublicationRecord(staged, stagedAvailability, {
    logicalPath,
    artifactKind,
    sourcePath,
    sourceMediaSha256,
    provenanceSha256: canonicalSha256(provenance),
    audit: {
      recipe,
      bakerVersion: provenance.baker,
      outputArtifactSha256: output.sha256,
    },
  });
}

function stageAvailability(logicalPath, state, reasonCode, detail) {
  if (logicalPath.startsWith('media/')) stagedRootAssetIds.add(logicalPath.slice('media/'.length));
  stageUnavailablePublicationRecord(staged, stagedAvailability, { logicalPath, state, reasonCode, detail });
}

function invalidateOldDependents(oldSha256) {
  const active = readActiveGenerationIndex(FIXTURES_DIR);
  if (!active) return;
  for (const entry of active.entries) {
    if (entry.sourceMediaSha256 !== oldSha256 || entry.artifactKind === 'media') continue;
    stageAvailability(
      entry.logicalPath,
      'pending',
      'FIXTURE_SOURCE_UPDATED_REBAKE_REQUIRED',
      'source media identity changed; old dependent evidence was invalidated',
    );
  }
}

function publishStaged(manifest) {
  const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestSha256 = createHash('sha256').update(manifestBytes).digest('hex');
  const manifestProvenance = {
    schema: 'media-test/manifest-provenance@1', manifestSha256,
    recipe: 'fixtures/bake.mjs#manifest', baker: 'media-test/bake@1', perimeter: TOOL_PERIMETER,
  };
  stageReadyPublicationRecord(staged, stagedAvailability, {
    logicalPath: 'manifest.json', artifactKind: 'manifest', bytes: manifestBytes,
    sourceMediaSha256: manifestSha256,
    provenanceSha256: canonicalSha256(manifestProvenance),
    audit: {
      recipe: manifestProvenance.recipe,
      bakerVersion: manifestProvenance.baker,
      outputArtifactSha256: manifestSha256,
    },
    directPath: MANIFEST_PATH, document: manifest,
  });
  const replacements = [...new Set([...staged.keys(), ...stagedAvailability.keys()])];
  const additions = [...staged.values()].map(({ directPath: _directPath, document: _document, ...artifact }) => artifact);
  const artifacts = [...activeArtifactsForMerge(FIXTURES_DIR, replacements), ...additions];
  const availability = [...activeAvailabilityForMerge(FIXTURES_DIR, replacements), ...stagedAvailability.values()];
  const publicationScope = publicationScopeForMerge(manifest, artifacts, availability);
  const publication = publishGeneration({
    rootDir: FIXTURES_DIR,
    artifacts,
    availability,
    publicationScope,
    sourceDateEpoch: FIXTURE_SOURCE_DATE_EPOCH,
  });
  for (const artifact of staged.values()) {
    if (!artifact.directPath || artifact.document === undefined) continue;
    if (artifact.logicalPath === 'manifest.json') writeFileSync(artifact.directPath, manifestBytes);
    else writeJson(artifact.directPath, artifact.document);
  }
  return publication;
}

function publicationScopeForMerge(manifest, artifacts, availability) {
  const activeScope = readActiveGenerationIndex(FIXTURES_DIR)?.publicationScope;
  if (activeScope?.mode === 'complete-corpus') return { mode: 'complete-corpus' };

  const representedPaths = new Set([
    ...artifacts.map((entry) => entry.logicalPath),
    ...availability.map((entry) => entry.logicalPath),
  ]);
  const manifestAssetIds = manifest.assets.map((asset) => asset.id);
  if (manifestAssetIds.every((assetId) => representedPaths.has(`media/${assetId}`))) {
    return { mode: 'complete-corpus' };
  }

  const assetIds = new Set(activeScope?.mode === 'selected-assets' ? activeScope.assetIds : []);
  for (const assetId of stagedRootAssetIds) assetIds.add(assetId);
  return { mode: 'selected-assets', assetIds: [...assetIds].sort(compareCodepoint) };
}

function compareCodepoint(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

// ── Manifest IO ────────────────────────────────────────────────────────────────────────────────

function loadManifest() {
  const raw = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  if (!Array.isArray(raw.assets)) throw new Error('manifest.json missing assets[]');
  return raw;
}

// ── Main ─────────────────────────────────────────────────────────────────────────────────────

function selected(assetId) {
  if (explicitUpdateScope) return explicitUpdateScope.has(assetId);
  if (!flags.subset) return true;
  return flags.subset.some((term) => assetId.includes(term));
}

async function main() {
  mkdirSync(MEDIA_DIR, { recursive: true });
  mkdirSync(GOLDEN_DIR, { recursive: true });

  const manifest = loadManifest();
  explicitUpdateScope = resolveExplicitAssetUpdateScope({
    explicit: flags.update,
    selectionTerms: flags.subset ?? [],
    assetIds: manifest.assets.map((asset) => asset.id),
  });
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
    const previousIdentity = {
      sha256: typeof entry.sha256 === 'string' ? entry.sha256 : null,
      sizeBytes: Number.isSafeInteger(entry.sizeBytes) ? entry.sizeBytes : null,
    };

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
        if (previousIdentity.sha256 && previousIdentity.sizeBytes !== null) {
          const reuse = assessMediaReuse(out, previousIdentity);
          if (reuse.state !== 'REUSABLE' && !flags.update) {
            summary.errors.push({ id, reason: `${reuse.reasonCode}: existing bytes do not match manifest digest+size; use --update for an intentional replacement` });
            log(`  ! ${id}: REUSE REJECTED — ${reuse.reasonCode} (pass --update only if replacement is intentional)`);
            continue;
          }
        } else if (!flags.update) {
          summary.errors.push({ id, reason: 'unidentified existing bytes require explicit --update admission' });
          log(`  ! ${id}: REUSE REJECTED — manifest has no digest+size (pass --update to admit these bytes)`);
          continue;
        }
        summary.reused.push(id);
        log(`  = ${id} (${flags.update ? 'explicit update/admission' : 'digest+size verified reuse'})`);
      } else if (!recipe) {
        if (entry.source === 'fetched') {
          mkdirSync(dirname(out), { recursive: true });
          const expectedSha256 = typeof entry.sha256 === 'string' ? entry.sha256 : null;
          const res = await fetchPinned(entry.sourceUrl, out, expectedSha256, id);
          if (res && typeof res === 'object' && res.skipped) {
            summary.missing.push({ id, entry, reason: res.reason });
            log(`  ◌ ${id}: MISSING (fetched) — ${res.reason}`);
            continue;
          }
          summary.generated.push(id);
          log(`  + ${id} (fetched, sha256-verified)`);
        } else {
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
        }
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

    // Golden-only still verifies identity. A contaminated local path can never redefine truth by
    // being merely present; only --update may bind a new digest and invalidate old dependents.
    if (existsSync(out)) {
      if (previousIdentity.sha256 && previousIdentity.sizeBytes !== null) {
        const reuse = assessMediaReuse(out, previousIdentity);
        if (reuse.state !== 'REUSABLE' && !flags.update) {
          summary.errors.push({ id, reason: `${reuse.reasonCode}: media quarantined before golden derivation` });
          log(`  ! ${id}: QUARANTINED — ${reuse.reasonCode}`);
          continue;
        }
      } else if (flags.goldenOnly && !previousIdentity.sha256 && !flags.update) {
        summary.errors.push({ id, reason: 'golden-only cannot admit unidentified source bytes without --update' });
        continue;
      }
      const identity = sourceIdentity(out);
      if (
        previousIdentity.sha256 &&
        (previousIdentity.sha256 !== identity.sha256 || previousIdentity.sizeBytes !== identity.sizeBytes) &&
        !flags.update
      ) {
        summary.errors.push({ id, reason: 'freshly produced bytes differ from the committed identity; pass --update to publish a replacement generation' });
        continue;
      }
      entry.sha256 = identity.sha256;
      entry.sizeBytes = identity.sizeBytes;
      stageMedia(id, out, identity, previousIdentity.sha256);
    }

    // 2. Golden derivation (unless media-only). Skip for assets that don't exist (were skipped).
    if (!flags.mediaOnly) {
      if (!existsSync(out)) {
        stageAvailability(`media/${id}`, 'absent-expected', 'FIXTURE_MEDIA_NOT_ACQUIRED', `source '${entry.source}' is not present in this checkout`);
        log(`  · ${id}: golden skipped (no media present)`);
        continue;
      }
      // Intentionally-broken robustness assets: ffprobe SHOULD fail on these. Skip golden derivation
      // and record a clear note instead of emitting a GOLDEN ERROR (which would fail the bake). The
      // graceful-failure oracle compares the engine's behavior, not against ffprobe-derived golden.
      if (EXPECT_GOLDEN_FAILURE.has(id)) {
        for (const suffix of ['meta.json', 'packets.json', 'frames.json']) {
          stageAvailability(`golden/${id}.${suffix}`, 'absent-expected', 'INTENTIONALLY_MALFORMED_NO_GOLDEN', 'malformed-input rejection is the expected oracle; no reference golden is produced');
        }
        summary.goldenSkipped.push(id);
        log(`  · ${id}: no golden (intentionally broken — graceful-failure oracle, ffprobe failure expected)`);
        continue;
      }
      // image negatives: ffprobe may legitimately produce minimal/odd output. We still emit whatever
      // golden we can; the oracle for negatives is graceful-failure, not meta.
      try {
        const meta = normalizedMetadataFor(id, out);
        stageEnvelope(`${id}.meta.json`, artifactEnvelope('metadata', id, out, meta));

        const packets = packetsFor(id, out);
        stageEnvelope(`${id}.packets.json`, artifactEnvelope('packets', id, out, packets));

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
          const availability = frames.evidenceState === 'producer-failed'
            ? { state: 'producer-failed', reasonCode: frames.producerFailure?.reasonCode ?? 'FRAME_PLACEHOLDER_EMPTY', detail: frames.producerFailure?.detail }
            : { state: 'pending', reasonCode: 'FRAME_PIXELS_NOT_BAKED', detail: 'browser-qualified pixels have not been produced' };
          stageEnvelope(`${id}.frames.json`, artifactEnvelope('frames', id, out, frames, availability));
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

  // Record HLS segment listing in golden notes (streaming oracle needs to know the segment files).
  if (!flags.mediaOnly) recordHlsSegments(summary);
  recordHlsResourceClosures(summary, !flags.mediaOnly);

  printSummary(summary);
  printMissingAssets(summary);

  // Exit non-zero if any hard error occurred (skips and MISSING are NOT errors — MISSING is an
  // expected, honest state for provided/captured assets the bake cannot produce, §5.4).
  if (summary.errors.length) {
    process.exitCode = 1;
    return;
  }
  const manifestValidation = validateFixtureManifest(manifest);
  if (!manifestValidation.ok) throw new Error(`manifest schema validation failed: ${manifestValidation.issues.join('; ')}`);
  publishStaged(manifest);
}

function maybeWriteEncGolden(id) {
  const secret = ENC_SECRETS[id];
  if (!secret) return;
  const mediaPath = join(MEDIA_DIR, id);
  if (!existsSync(mediaPath)) return;
  const payload = {
    $note: 'Decrypt-oracle ground truth (key/KID/IV) baked offline. Browser decrypt output is compared bit-exact against the golden frames decoded from the cleartext.',
    assetId: id,
    ...secret,
  };
  stageEnvelope(`${id}.keys.json`, artifactEnvelope('keys', id, mediaPath, payload));
}

function recordHlsSegments(summary) {
  for (const playlist of ['hls_vod.m3u8', 'hls_aes128.m3u8']) {
    if (!selected(playlist)) continue;
    const p = join(MEDIA_DIR, playlist);
    if (!existsSync(p)) continue;
    const base = playlist.replace(/\.m3u8$/, '');
    const segmentPattern = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_\\d{3}\\.ts$`);
    const segments = readdirSync(MEDIA_DIR).filter((file) => segmentPattern.test(file));
    const payload = {
      $note: 'HLS segment listing for the streaming oracle. Segments are served as siblings of the playlist under fixtures/media/.',
      playlist,
      segments: segments.sort(),
      ...(playlist === 'hls_aes128.m3u8' ? { keyFile: 'hls_aes128.key' } : {}),
    };
    stageEnvelope(`${playlist}.segments.json`, artifactEnvelope('segments', playlist, p, payload));
    summary.golden.push(`${playlist} (segments)`);
  }
}

/** Publish every HLS key/map/segment plus the exact resource index and authoritative key record. */
function recordHlsResourceClosures(summary, includeEvidence) {
  for (const assetId of HLS_RESOURCE_FIXTURE_IDS) {
    if (!selected(assetId)) continue;
    const playlistPath = join(MEDIA_DIR, assetId);
    const indexPath = join(GOLDEN_DIR, `${assetId}.resources.json`);
    const keysPath = join(GOLDEN_DIR, `${assetId}.keys.json`);
    if (!existsSync(playlistPath)) {
      if (includeEvidence) {
        stageAvailability(`golden/${assetId}.resources.json`, 'absent-expected', 'HLS_PLAYLIST_NOT_ACQUIRED', 'playlist root is absent');
      }
      continue;
    }
    try {
      const index = validatePinnedHlsResourceClosure({ assetId, mediaPath: playlistPath, goldenDir: GOLDEN_DIR });
      const rootIdentity = sourceIdentity(playlistPath);
      if (includeEvidence) {
        stageRawArtifact({
          logicalPath: `golden/${assetId}.resources.json`,
          artifactKind: 'hls-resource-index',
          sourcePath: indexPath,
          sourceMediaSha256: rootIdentity.sha256,
          recipe: 'fixtures/curate-hls-resource-indices.mjs#resource-index',
        });
      }
      for (const resource of index.resources) {
        const resourcePath = join(MEDIA_DIR, resource.uri);
        stageRawArtifact({
          logicalPath: `media/${resource.uri}`,
          artifactKind: 'media',
          sourcePath: resourcePath,
          sourceMediaSha256: resource.sha256,
          recipe: 'fixtures/curate-hls-resource-indices.mjs#resource-sidecar',
        });
      }
      if (includeEvidence) {
        if (!existsSync(keysPath)) throw new Error(`authoritative key record '${keysPath}' is absent`);
        const keyDocument = JSON.parse(readFileSync(keysPath, 'utf8'));
        const keyPayload = keyDocument.schema === 'media-test/golden-artifact@1'
          ? keyDocument.payload
          : keyDocument;
        stageEnvelope(`${assetId}.keys.json`, artifactEnvelope('keys', assetId, playlistPath, keyPayload));
        summary.golden.push(`${assetId} (resource-closure+keys)`);
      }
    } catch (error) {
      summary.errors.push({ id: assetId, reason: `HLS resource closure: ${String(error?.message || error)}` });
    }
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
  log('Re-run is idempotent: --force may recompute pinned bytes; identity changes require scoped --update with exact asset ids.');
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

if (import.meta.main) {
  main().catch((e) => {
    console.error(`FATAL bake error: ${String(e?.stack || e?.message || e)}`);
    process.exit(1);
  });
}
