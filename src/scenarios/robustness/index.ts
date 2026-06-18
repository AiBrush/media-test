/**
 * src/scenarios/robustness/index.ts — Pillar 3, family "robustness" (BUILD_INSTRUCTIONS §11).
 *
 * Four sub-batteries, all Worker-isolated and timeout-guarded by the runner:
 *  (a) EDGE cases — exercise the gnarly-but-valid assets (open-GOP/B-frames, VFR, rotated,
 *      multi-track, headerless WebM, big-endian/24-bit PCM, cbcs boundaries, fastStart:reserve,
 *      fragmented/CMAF, multi-hour, zero-length). These should PASS (or honest-NA), proving the
 *      engine survives the hard inputs.
 *  (b) MALFORMED / FUZZ — take a VALID asset and corrupt its bytes via a `mutate` fn (bit-flip,
 *      header truncation, random-span zeroing). The engine must FAIL GRACEFULLY (throw/reject)
 *      within `timeoutMs` — no crash/hang/OOM. Oracle: `graceful-failure`.
 *  (c) PROPERTY / METAMORPHIC — invariants computed in-browser: decode(remux(x))==decode(x),
 *      probe(remux(x)).dur≈probe(x).dur, trim(a..b)++trim(b..c)≈trim(a..c), probe(x).dur consistent
 *      across containers. Oracle: `property-invariant`.
 *  (d) IMAGE NEGATIVES — still images fed to a video/media op must produce a clean NA / graceful
 *      error, never a crash. Oracle: `graceful-failure`.
 *
 * The `mutate` helpers below are deterministic (seeded) so a fuzz failure is reproducible.
 */

import type { Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';

// ── Mutate helpers (deterministic; reproducible fuzz) ───────────────────────────────────────────

/**
 * Tiny deterministic PRNG (mulberry32) so a mutate is reproducible from a fixed seed — a graceful-
 * failure regression can be replayed exactly rather than chasing a non-deterministic corruption.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Flip `count` individual bits at pseudo-random byte/bit positions (seeded). Leaves length intact. */
export function bitFlip(count = 64, seed = 0x9e3779b9): (bytes: Uint8Array) => Uint8Array {
  return (bytes) => {
    const out = bytes.slice();
    if (out.length === 0) return out;
    const rnd = mulberry32(seed);
    for (let i = 0; i < count; i++) {
      const pos = Math.floor(rnd() * out.length);
      const bit = 1 << Math.floor(rnd() * 8);
      // noUncheckedIndexedAccess: read-with-default before the XOR write.
      out[pos] = (out[pos] ?? 0) ^ bit;
    }
    return out;
  };
}

/**
 * Truncate the header region: drop the first `headerBytes` bytes (default 256) so container magic /
 * box headers / EBML id are destroyed but the media payload remains — the classic "looks like data,
 * no parseable header" corruption a demuxer must reject cleanly.
 */
export function truncateHeader(headerBytes = 256): (bytes: Uint8Array) => Uint8Array {
  return (bytes) => (bytes.length <= headerBytes ? new Uint8Array(0) : bytes.slice(headerBytes));
}

/** Truncate the TAIL: keep only the first `fraction` of the file (default 60%) — simulates an
 *  interrupted download / partial upload where the moov or final cluster is missing. */
export function truncateTail(fraction = 0.6): (bytes: Uint8Array) => Uint8Array {
  return (bytes) => bytes.slice(0, Math.max(0, Math.floor(bytes.length * fraction)));
}

/**
 * Zero out `spans` random byte runs (each `spanLen` bytes, default 4×1KB) in the payload region
 * (after the first `skipHead` bytes so the container header survives and parsing actually starts
 * before hitting the garbage). Models mid-stream corruption a decoder must survive or reject.
 */
export function zeroRandomSpans(
  spans = 4,
  spanLen = 1024,
  seed = 0x1234abcd,
  skipHead = 512,
): (bytes: Uint8Array) => Uint8Array {
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

const FUZZ_TIMEOUT_MS = 15_000;

// ── (a) EDGE cases ──────────────────────────────────────────────────────────────────────────────

interface EdgeCase {
  id: string;
  op: 'probe' | 'demux' | 'decodeFrames' | 'remux' | 'transcode' | 'trim' | 'decrypt' | 'seek';
  asset: string;
  containersIn: string[];
  containersOut?: string[];
  videoCodecs?: string[];
  audioCodecs?: string[];
  features?: string[];
  encryption?: ('cenc-ctr' | 'cenc-cbcs' | 'hls-aes128')[];
  options?: Record<string, unknown>;
  tolerances?: Scenario['tolerances'];
  oracles: Scenario['oracles'];
  notes?: string;
}

const EDGE_CASES: EdgeCase[] = [
  {
    id: 'edge_open_gop_bframes_decode',
    op: 'decodeFrames',
    asset: 'h264_bframes_1080p.mp4',
    containersIn: ['mp4'],
    videoCodecs: ['h264'],
    options: { maxFrames: 90 },
    oracles: ['decoded-frames-bitexact'],
    notes: 'Open-GOP / B-frame reorder over many frames — output must stay in pts order.',
  },
  {
    id: 'edge_vfr_probe',
    op: 'probe',
    asset: 'h264_vfr.mp4',
    containersIn: ['mp4'],
    videoCodecs: ['h264'],
    oracles: ['golden-metadata'],
    tolerances: { fpsTolerance: 0.1 },
    notes: 'VFR duration/fps reporting under non-uniform timestamps.',
  },
  {
    id: 'edge_rotated_remux',
    op: 'remux',
    asset: 'h264_rotated90.mp4',
    containersIn: ['mp4'],
    containersOut: ['mov'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    features: ['rotate'],
    options: { container: 'mov' },
    oracles: ['reference-reimport', 'playback-smoke'],
    notes: 'Rotation metadata survival through a wrapper change.',
  },
  {
    id: 'edge_multitrack_demux',
    op: 'demux',
    asset: 'h264_multitrack.mp4',
    containersIn: ['mp4'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    oracles: ['golden-packets'],
    notes: 'Multiple tracks interleaved — trackIndex correctness on every packet.',
  },
  {
    id: 'edge_headerless_recorder_probe',
    op: 'probe',
    asset: 'recorder_headerless.webm',
    containersIn: ['webm'],
    videoCodecs: ['vp8'],
    audioCodecs: ['opus'],
    oracles: ['golden-metadata'],
    notes: 'MediaRecorder WebM with unknown duration / sparse Cues — duration may legitimately be null.',
  },
  {
    id: 'edge_headerless_recorder_remux',
    op: 'remux',
    asset: 'recorder_headerless.webm',
    containersIn: ['webm'],
    containersOut: ['webm'],
    videoCodecs: ['vp8'],
    audioCodecs: ['opus'],
    options: { container: 'webm' },
    oracles: ['reference-reimport', 'playback-smoke'],
    notes: 'Re-wrap a headerless recorder stream into a seekable WebM (add Cues / known duration).',
  },
  {
    id: 'edge_pcm_s16be_probe',
    // FIX (was asset:'wav_s16be.wav', containersIn:['wav'] — a NON-manifest id, so the case was
    // permanently NA(asset-missing) and tested WAV, not the byte-order edge). The manifest's
    // big-endian PCM asset is 'pcm_s16be.aiff' (container 'aiff', codec 'pcm-s16be'); pcm_s16be is
    // invalid inside RIFF/WAVE, AIFF is the natural big-endian PCM container. Point at the real asset
    // so §5.1/§A.6's AIFF byte-order edge is actually exercised.
    op: 'probe',
    asset: 'pcm_s16be.aiff',
    containersIn: ['aiff'],
    audioCodecs: ['pcm-s16be'],
    oracles: ['golden-metadata'],
    notes: 'Big-endian 16-bit PCM in AIFF: byte-order + AIFF (not WAVE) container format detection.',
  },
  {
    id: 'edge_pcm_s24_decode',
    op: 'decodeFrames',
    asset: 'wav_s24.wav',
    containersIn: ['wav'],
    audioCodecs: ['pcm-s24'],
    options: { maxFrames: 1 },
    oracles: ['decoded-frames-bitexact'],
    notes: '24-bit PCM decode to canonical samples.',
  },
  {
    id: 'edge_cbcs_boundary_decrypt',
    op: 'decrypt',
    asset: 'cenc_cbcs.mp4',
    containersIn: ['mp4'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    encryption: ['cenc-cbcs'],
    options: { scheme: 'cenc-cbcs', key: { kid: '00112233445566778899aabbccddeeff', keyHex: '000102030405060708090a0b0c0d0e0f' } },
    oracles: ['decrypt-bitexact'],
    notes: 'cbcs crypt/skip pattern-block boundaries — the classic off-by-one decrypt edge.',
  },
  {
    id: 'edge_faststart_reserve_remux',
    op: 'remux',
    asset: 'h264_1080p_30s.mp4',
    containersIn: ['mp4'],
    containersOut: ['mp4'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    features: ['fastStart:reserve'],
    options: { container: 'mp4', fastStart: 'reserve' },
    oracles: ['reference-reimport', 'playback-smoke'],
    notes: 'fastStart:reserve provokes a large forward seek in the target buffer.',
  },
  {
    id: 'edge_fragmented_remux',
    op: 'remux',
    asset: 'h264_1080p_30s.mp4',
    containersIn: ['mp4'],
    containersOut: ['mp4'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    features: ['fragmented'],
    options: { container: 'mp4', fragmented: true },
    oracles: ['reference-reimport', 'playback-smoke'],
    notes: 'Fragmented/CMAF output structure.',
  },
  {
    id: 'edge_longform_probe',
    op: 'probe',
    asset: 'longform_1h_audio.m4a',
    containersIn: ['mp4'],
    audioCodecs: ['aac'],
    oracles: ['golden-metadata'],
    notes: 'Multi-hour file: probe must report ~1h cheaply, not by scanning every sample (no OOM).',
  },
  {
    id: 'edge_zero_length_probe',
    op: 'probe',
    asset: 'zero_length.mp4',
    containersIn: ['mp4'],
    oracles: ['graceful-failure'],
    // Note avoids the oracle's bad-token set (crash/hang/timeout/oom) too: the oracle substring-matches
    // those in notes and FAILs on a hit, so a prohibitive 'never crash' would force an unconditional
    // FAIL even for a correct engine. Meaning preserved without the trap words.
    notes: 'Zero-length file: must reject cleanly (empty input is not parseable), never fault.',
  },
];

const edgeScenarios: Scenario[] = EDGE_CASES.map((c) =>
  defineScenario({
    id: `robustness/${c.id}`,
    op: c.op,
    input: c.asset,
    ...(c.options ? { options: c.options } : {}),
    requires: {
      operations: [c.op],
      containersIn: c.containersIn,
      ...(c.containersOut ? { containersOut: c.containersOut } : {}),
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
      ...(c.encryption ? { encryption: c.encryption } : {}),
      ...(c.features ? { features: c.features } : {}),
    },
    oracles: c.oracles,
    metrics: ['wall', 'peakMemory', 'longtasks'],
    ...(c.tolerances ? { tolerances: c.tolerances } : {}),
    // The edge battery is also timeout-guarded so a hang on a hard-but-valid input is caught.
    timeoutMs: FUZZ_TIMEOUT_MS,
    ...(c.notes ? { notes: c.notes } : {}),
  }),
);

// ── (b) MALFORMED / FUZZ ────────────────────────────────────────────────────────────────────────

interface FuzzCase {
  id: string;
  /** valid base asset to corrupt */
  asset: string;
  op: 'probe' | 'demux' | 'decodeFrames' | 'remux';
  containersIn: string[];
  containersOut?: string[];
  videoCodecs?: string[];
  audioCodecs?: string[];
  options?: Record<string, unknown>;
  mutate: (bytes: Uint8Array) => Uint8Array;
  notes?: string;
}

const FUZZ_CASES: FuzzCase[] = [
  {
    id: 'fuzz_mp4_bitflip_probe',
    asset: 'h264_1080p_30s.mp4',
    op: 'probe',
    containersIn: ['mp4'],
    mutate: bitFlip(128, 0x111),
    notes: '128 random bit-flips across an MP4; probe must reject or report degraded, never fault.',
  },
  {
    id: 'fuzz_mp4_header_truncated_demux',
    asset: 'h264_1080p_30s.mp4',
    op: 'demux',
    containersIn: ['mp4'],
    videoCodecs: ['h264'],
    mutate: truncateHeader(256),
    // NOTE WORDING (§0.1): the graceful-failure oracle treats the words graceful/threw/rejected/
    // rejection/errored/handled in a scenario's own notes as a PASS signal BEFORE checking output
    // presence — so prose alone could pass an engine that still returns output for malformed input.
    // These robustness notes are therefore written to AVOID those trap tokens; the verdict rests only
    // on the runner's output-absence inference, never on the case describing its own success.
    notes: 'First 256 bytes dropped (ftyp/moov head gone); demux must reject this, not parse it.',
  },
  {
    id: 'fuzz_mp4_tail_truncated_demux',
    asset: 'h264_1080p_30s.mp4',
    op: 'demux',
    containersIn: ['mp4'],
    videoCodecs: ['h264'],
    mutate: truncateTail(0.55),
    notes: 'File cut at 55% (interrupted download): demux either yields partial+EOF or rejects cleanly.',
  },
  {
    id: 'fuzz_mp4_zeroed_spans_decode',
    asset: 'h264_1080p_30s.mp4',
    op: 'decodeFrames',
    containersIn: ['mp4'],
    videoCodecs: ['h264'],
    options: { maxFrames: 60 },
    mutate: zeroRandomSpans(6, 2048, 0xabc, 1024),
    notes: 'Six 2KB zeroed payload spans: decoder must error or conceal, bounded in time and memory.',
  },
  {
    id: 'fuzz_webm_bitflip_probe',
    asset: 'vp9_1080p_10s.webm',
    op: 'probe',
    containersIn: ['webm'],
    mutate: bitFlip(96, 0x222),
    notes: 'EBML/Matroska bit-flips; probe must not fault on a mangled element size.',
  },
  {
    id: 'fuzz_webm_header_truncated_demux',
    asset: 'vp9_1080p_10s.webm',
    op: 'demux',
    containersIn: ['webm'],
    videoCodecs: ['vp9'],
    mutate: truncateHeader(128),
    notes: 'EBML header destroyed; demux must reject cleanly.',
  },
  {
    id: 'fuzz_ts_zeroed_spans_demux',
    asset: 'h264_ts.ts',
    op: 'demux',
    containersIn: ['ts'],
    videoCodecs: ['h264'],
    mutate: zeroRandomSpans(8, 188, 0xdef, 376),
    notes: 'Zero whole 188-byte TS packets: sync-byte loss; demux must resync or reject, never fault.',
  },
  {
    id: 'fuzz_flac_bitflip_probe',
    asset: 'flac_seektable.flac',
    op: 'probe',
    containersIn: ['flac'],
    audioCodecs: ['flac'],
    mutate: bitFlip(48, 0x333),
    notes: 'FLAC metadata-block bit-flips (bad block sizes); probe must not loop forever.',
  },
  {
    id: 'fuzz_mp3_header_truncated_probe',
    asset: 'mp3_xing.mp3',
    op: 'probe',
    containersIn: ['mp3'],
    audioCodecs: ['mp3'],
    mutate: truncateHeader(64),
    notes: 'Drop ID3/Xing head; probe falls back to a bounded frame scan or rejects — never loops.',
  },
  {
    id: 'fuzz_remux_zeroed_spans',
    asset: 'h264_1080p_30s.mp4',
    op: 'remux',
    containersIn: ['mp4'],
    containersOut: ['mkv'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    options: { container: 'mkv' },
    mutate: zeroRandomSpans(5, 4096, 0x555, 2048),
    notes: 'Corrupt samples then remux: engine must reject or emit a clean partial, bounded in memory.',
  },
];

const fuzzScenarios: Scenario[] = FUZZ_CASES.map((c) =>
  defineScenario({
    id: `robustness/${c.id}`,
    op: c.op,
    input: c.asset,
    ...(c.options ? { options: c.options } : {}),
    requires: {
      operations: [c.op],
      containersIn: c.containersIn,
      ...(c.containersOut ? { containersOut: c.containersOut } : {}),
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
    },
    oracles: ['graceful-failure'],
    metrics: ['wall', 'peakMemory'],
    mutate: c.mutate,
    timeoutMs: FUZZ_TIMEOUT_MS,
    ...(c.notes ? { notes: c.notes } : {}),
  }),
);

// ── (c) PROPERTY / METAMORPHIC ──────────────────────────────────────────────────────────────────

interface PropertyCase {
  id: string;
  /** invariant identifier the runner/oracle interprets (computed in-browser) */
  invariant: string;
  op: 'remux' | 'trim' | 'probe' | 'transcode';
  input: string | string[];
  containersIn: string[];
  containersOut?: string[];
  videoCodecs?: string[];
  audioCodecs?: string[];
  features?: string[];
  options?: Record<string, unknown>;
  notes?: string;
}

const PROPERTY_CASES: PropertyCase[] = [
  {
    id: 'prop_decode_remux_eq_decode_mp4_mkv',
    invariant: 'decode(remux(x))==decode(x)',
    op: 'remux',
    input: 'h264_1080p_30s.mp4',
    containersIn: ['mp4'],
    containersOut: ['mkv'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    options: { container: 'mkv', invariant: 'decode(remux(x))==decode(x)' },
    notes: 'Lossless remux must not change decoded pixels: frame digests of remux(x) == those of x.',
  },
  {
    id: 'prop_decode_remux_eq_decode_webm_mkv',
    invariant: 'decode(remux(x))==decode(x)',
    op: 'remux',
    input: 'vp9_1080p_10s.webm',
    containersIn: ['webm'],
    containersOut: ['mkv'],
    videoCodecs: ['vp9'],
    audioCodecs: ['opus'],
    options: { container: 'mkv', invariant: 'decode(remux(x))==decode(x)' },
    notes: 'Same invariant across the WebM→MKV path.',
  },
  {
    id: 'prop_remux_duration_preserved',
    invariant: 'probe(remux(x)).dur≈probe(x).dur',
    op: 'remux',
    input: 'h264_1080p_30s.mp4',
    containersIn: ['mp4'],
    containersOut: ['mov'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    options: { container: 'mov', invariant: 'probe(remux(x)).dur≈probe(x).dur' },
    notes: 'Duration is invariant under a lossless container change.',
  },
  {
    id: 'prop_trim_concatenation',
    invariant: 'trim(a..b)++trim(b..c)≈trim(a..c)',
    op: 'trim',
    input: 'h264_1080p_30s.mp4',
    containersIn: ['mp4'],
    containersOut: ['mp4'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    features: ['trim:frame-accurate'],
    options: {
      container: 'mp4',
      frameAccurate: true,
      invariant: 'trim(a..b)++trim(b..c)≈trim(a..c)',
      // The runner performs three trims + a concat and compares; split point b is interior.
      a: 2_000_000,
      b: 5_000_000,
      c: 9_000_000,
    },
    notes: 'Concatenating adjacent frame-accurate trims reproduces the single combined trim.',
  },
  {
    id: 'prop_duration_consistent_across_containers',
    invariant: 'probe(x).dur consistent across containers',
    op: 'probe',
    // Same underlying content delivered in three containers; durations must agree within tolerance.
    input: ['h264_1080p_30s.mp4', 'h264_1080p_5s.mov', 'h264_in_mkv.mkv'],
    containersIn: ['mp4', 'mov', 'mkv'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    options: { invariant: 'probe(x).dur consistent across containers' },
    notes: 'Probed duration of equivalent content must be consistent regardless of wrapper.',
  },
];

const propertyScenarios: Scenario[] = PROPERTY_CASES.map((c) =>
  defineScenario({
    id: `robustness/${c.id}`,
    op: c.op,
    input: c.input,
    ...(c.options ? { options: c.options } : {}),
    requires: {
      operations: [c.op],
      containersIn: c.containersIn,
      ...(c.containersOut ? { containersOut: c.containersOut } : {}),
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
      ...(c.features ? { features: c.features } : {}),
    },
    oracles: ['property-invariant'],
    metrics: ['wall', 'peakMemory'],
    timeoutMs: FUZZ_TIMEOUT_MS,
    ...(c.notes ? { notes: c.notes } : {}),
  }),
);

// ── (d) IMAGE NEGATIVES ─────────────────────────────────────────────────────────────────────────

interface ImageNegativeCase {
  id: string;
  asset: string;
  /** the still-image "container" tag (not a canonical media container — drives honest NA) */
  pseudoContainer: string;
  notes?: string;
}

const IMAGE_NEGATIVE_CASES: ImageNegativeCase[] = [
  { id: 'image_jpeg_probe_na', asset: 'image.jpg', pseudoContainer: 'jpeg' },
  { id: 'image_png_probe_na', asset: 'image.png', pseudoContainer: 'png' },
  { id: 'image_webp_probe_na', asset: 'image.webp', pseudoContainer: 'webp' },
];

const imageNegativeScenarios: Scenario[] = IMAGE_NEGATIVE_CASES.map((c) =>
  defineScenario({
    id: `robustness/${c.id}`,
    op: 'probe',
    input: c.asset,
    requires: {
      operations: ['probe'],
      // Declare the still-image pseudo-container so no media engine claims support → clean NA;
      // an engine that DOES try is judged by the graceful-failure oracle (output-absence), never by
      // the note prose.
      containersIn: [c.pseudoContainer],
    },
    oracles: ['graceful-failure'],
    metrics: ['wall'],
    timeoutMs: FUZZ_TIMEOUT_MS,
    // Note avoids the graceful-failure good-token set (graceful/threw/rejected/…) so the verdict
    // cannot be won by the prose; it rests on NA (no engine declares the still-image container) or
    // the runner's output-absence inference.
    notes:
      c.notes ?? 'Still image fed to a media probe: expect a clean NA (no engine declares it) or a clean reject.',
  }),
);

// ── Canonical ids for fixtures this family needs but the bake does not yet produce (§5.4) ─────────
//
// Same honest-asset-missing protocol the decode-seek family uses (see MISSING_DECODE_ASSETS): we
// STILL register the case against the canonical asset id the bake must emit (recorded here + flagged
// in each case's notes), so the moment the asset is baked the case activates and golden lines up.
// Until then the runner records a distinct asset-missing failure (fetch of /fixtures/media/<id>
// 404s) — never a fabricated value, never a silent skip. These ids are NOT in fixtures/manifest.json
// yet; adding them there (and baking the bytes + golden) is the bake's job, not this writer's. This
// is the OPPOSITE of the wav_s16be.wav bug fixed above: that was a typo'd id that will NEVER exist
// and silently mis-tested WAV; these are real, intended corpus rungs the bake is expected to add.
export const MISSING_ROBUSTNESS_ASSETS: ReadonlyArray<{ id: string; why: string }> = [
  {
    id: 'micro_h264_1x1_1s.mp4',
    why: '§A.16 1×1 video: probe + 1-frame decode of a minimum-dimension (1×1) clip must not divide-by-zero in SSIM/luma. The corpus has micro_h264_1frame.mp4 (320×240) but no 1×1 micro asset.',
  },
  {
    id: 'micro_h264_0x0_1s.mp4',
    why: '§A.16 0×0 video: zero-dimension probe/decode → must be handled or rejected, not a crash/NaN. No 0×0 asset is baked.',
  },
  {
    id: 'h264_1fps_30s.mp4',
    why: "§A.16 extreme fps (1 fps): duration/fps reporting + frame pacing at a very low rate. (Shared canonical id with decode-seek's MISSING_DECODE_ASSETS — one bake satisfies both families.)",
  },
  {
    id: 'h264_240fps_5s.mp4',
    why: '§A.16 extreme fps (240 fps): duration/fps reporting + dense-timestamp pacing. Shared canonical id with decode-seek.',
  },
  {
    id: 'h264_video_only.mp4',
    why: '§A.16 video-only: an MP4 with a video track and NO audio track — track enumeration must not assume/require an audio track. (micro_h264_1frame.mp4 is also video-only but is a single-frame micro clip; this is a normal-length video-only MP4.)',
  },
  {
    id: 'aac_audio_only.m4a',
    why: '§A.16 audio-only: an MP4/M4A with an audio track and NO video track — probe/track enumeration must not assume a video track. (micro_audio_short.m4a covers the micro case; this is a normal-length audio-only file.)',
  },
  {
    id: 'h264_es_mislabeled.webm',
    why: "§A.16 mismatched container/codec: a raw H.264 elementary stream whose extension/MIME says .webm — the engine must detect the real format by CONTENT or reject, not trust the label. No mislabeled asset exists; bytes whose container disagrees with the extension cannot be produced by a byte-mutate of a valid asset without inventing the asset.",
  },
  {
    id: 'h264_ts_pts_wrap.ts',
    why: '§A.16 timestamp wraparound/discontinuity: an MPEG-TS clip with a 33-bit PTS/PCR wrap AND a discontinuity flag. Only the CLEAN h264_ts.ts exists today; a wrap/discontinuity must be authored into the stream (not a mutate).',
  },
  {
    id: 'aac_gapless_priming.m4a',
    why: '§A.16 gapless audio: an AAC stream carrying encoder delay (priming) + padding (iTunSMPB/edit list) so the decoded/trimmed sample count is correct only if priming is removed. No gapless-tagged asset exists.',
  },
  {
    id: 'wav_varchannels.wav',
    why: '§A.16 variable channel count: a stream whose channel layout changes mid-file — probe/decode must survive the transition. No variable-layout asset exists (and a single WAV header cannot express it; the bake must concatenate differing-layout segments in a container that allows it).',
  },
];

// ── (e) SEEK EDGES (§A.16 seek-past-EOF / negative seek) ──────────────────────────────────────────
//
// EdgeCase.op already permits 'seek' but no edge case used it. These feed an out-of-range tUs to the
// engine's seek() on the workhorse clip. The runner's robustness path (it returns → 'graceful', it
// throws → 'graceful', it overruns → 'timeout'→FAIL) plus the graceful-failure oracle gives the
// correct verdict for the spec's "clamp to last/first frame OR fail cleanly, never crash/hang/OOM":
//   - a clean CLAMP-return populates ctx.seek (NOT ctx.output/metadata/demux/frames), and the
//     graceful-failure output-absence inference treats that as a pass (clamped without faulting);
//   - a clean THROW also passes (op produced nothing);
//   - only a hang/timeout FAILs.
// This is the ROBUSTNESS framing (no golden needed, survives an unbaked frame golden) and is
// deliberately complementary to decode-seek's seek_past_eof/seek_negative, which use seek-accuracy
// (golden-anchored, asserts the exact clamp landing). NOTE: wording omits the graceful-failure
// good-token set so the prose cannot decide the verdict (§0.1).
interface SeekEdgeCase {
  id: string;
  asset: string;
  containersIn: string[];
  videoCodecs: string[];
  tUs: number;
  edge: 'past-eof' | 'negative';
  notes: string;
}

const SEEK_EDGE_CASES: SeekEdgeCase[] = [
  {
    id: 'edge_seek_past_eof',
    asset: 'h264_1080p_30s.mp4',
    containersIn: ['mp4'],
    videoCodecs: ['h264'],
    // ~5 minutes past the end of a 30 s clip.
    tUs: 300_000_000,
    edge: 'past-eof',
    notes:
      '§A.16 seek past EOF: tUs far beyond duration on the 30s workhorse. Engine must clamp to the ' +
      'last decodable frame OR return a clean error — it must NOT loop, fault, or balloon memory. ' +
      'Verdict rests on the runner (returns or errors within the time budget = ok; overrun = not ok), not on notes.',
  },
  {
    id: 'edge_seek_negative',
    asset: 'h264_1080p_30s.mp4',
    containersIn: ['mp4'],
    videoCodecs: ['h264'],
    // Negative target: must clamp to 0 / first frame, never seek "before" the start.
    tUs: -5_000_000,
    edge: 'negative',
    notes:
      '§A.16 negative seek: a negative tUs must clamp to 0 (first frame) OR error cleanly; the engine ' +
      'must not fault on the sign or seek before the start. Verdict from runner output-absence, not notes.',
  },
];

const seekEdgeScenarios: Scenario[] = SEEK_EDGE_CASES.map((c) =>
  defineScenario({
    id: `robustness/${c.id}`,
    op: 'seek',
    input: c.asset,
    options: { tUs: c.tUs, seekEdge: c.edge },
    requires: {
      operations: ['seek'],
      containersIn: c.containersIn,
      videoCodecs: c.videoCodecs,
    },
    oracles: ['graceful-failure'],
    metrics: ['wall', 'peakMemory', 'longtasks'],
    // IDENTITY mutate (bytes unchanged): this is REQUIRED to route the case through the runner's
    // robustness path (runRobustness triggers on isRobustness && scenario.mutate). On that path BOTH a
    // clean clamp-RETURN (ctx.seek set; graceful-failure infers pass from the absence of
    // output/metadata/demux/frames) AND a clean THROW map to 'graceful'. WITHOUT a mutate the case
    // would take the normal functional path where a clean throw becomes ERROR (not the desired pass)
    // and graceful-failure has no robustness signal. The asset (h264_1080p_30s.mp4) is always present,
    // so the identity mutate cannot mask a 404 (only present-asset cases use this trick).
    mutate: (b) => b,
    timeoutMs: FUZZ_TIMEOUT_MS,
    notes: c.notes,
  }),
);

// ── (f) STRUCTURE / SHAPE EDGES (§A.16) ───────────────────────────────────────────────────────────
//
// Probe/decode edges on UNUSUAL-but-valid stream SHAPES: audio-only, video-only, no-media,
// degenerate dimensions, extreme fps, mislabeled container, TS wrap/discontinuity, gapless priming,
// variable channel count. Each uses a real manifest asset where one already has the shape, otherwise
// a canonical MISSING_ROBUSTNESS_ASSETS id (honest asset-missing until baked).
//
// Oracle choice is per-shape and HONEST:
//   - golden-metadata where a correct, stable answer exists and golden can be baked (track
//     enumeration of audio-only/video-only/no-media; fps/duration of extreme-fps). This GATES the
//     "must not assume a video track" / "must report N fps" claim against the independent ffprobe
//     golden — a wrong enumeration FAILs.
//   - graceful-failure for the degenerate (0×0) and mislabeled cases where the only spec requirement
//     is "do not fault; detect-by-content or reject" (no single correct metadata to assert).
//
// ROUTING NOTE for the graceful-failure shape edges (all asset-missing today): they carry NO mutate,
// so they take the runner's NORMAL functional path. While the asset is unbaked the corpus fetch 404s
// and the case surfaces as a distinct asset-missing ERROR naming the id (the decode-seek honest-NA
// convention) — never a fabricated pass. (We deliberately do NOT add an identity mutate to route them
// through runRobustness: an identity mutate would turn the 404 into a false graceful PASS, masking the
// missing asset. The present-asset seek edges above CAN use the identity-mutate trick precisely
// because their asset always exists. Once these assets are baked, a clean engine throw arrives as
// ERROR rather than a graceful PASS on the normal path — a conservative misclassification, never
// gameable; tightening it is a runner concern, not a scenario one.)
interface ShapeEdgeCase {
  id: string;
  op: 'probe' | 'decodeFrames';
  asset: string;
  containersIn: string[];
  videoCodecs?: string[];
  audioCodecs?: string[];
  options?: Record<string, unknown>;
  oracles: Scenario['oracles'];
  /** true when the asset is a MISSING_ROBUSTNESS_ASSETS id (documented asset-missing until baked) */
  assetMissing?: boolean;
  notes: string;
}

const SHAPE_EDGE_CASES: ShapeEdgeCase[] = [
  // audio-only / video-only / no-tracks — track enumeration must not assume a video track.
  {
    id: 'edge_audio_only_micro_probe',
    op: 'probe',
    asset: 'micro_audio_short.m4a',
    containersIn: ['mp4'],
    audioCodecs: ['aac'],
    oracles: ['golden-metadata'],
    notes:
      '§A.16 audio-only: probe a real audio-only M4A (AAC, no video track). Track enumeration must ' +
      'report exactly the audio track and NOT assume/synthesize a video track; golden has the truth.',
  },
  {
    id: 'edge_audio_only_probe',
    op: 'probe',
    asset: 'aac_audio_only.m4a',
    containersIn: ['mp4'],
    audioCodecs: ['aac'],
    oracles: ['golden-metadata'],
    assetMissing: true,
    notes:
      '§A.16 audio-only (normal length): MP4/M4A with an audio track and no video track. Fixture NOT ' +
      'yet baked (§5.4) → distinct asset-missing failure until present, then golden-metadata gates ' +
      'track enumeration. Complements the micro audio-only case above.',
  },
  {
    id: 'edge_video_only_micro_probe',
    op: 'probe',
    asset: 'micro_h264_1frame.mp4',
    containersIn: ['mp4'],
    videoCodecs: ['h264'],
    oracles: ['golden-metadata'],
    notes:
      '§A.16 video-only: probe a real video-only MP4 (single H.264 keyframe, no audio track). Track ' +
      'enumeration must report exactly the video track and not assume an audio track; golden has the truth.',
  },
  {
    id: 'edge_video_only_probe',
    op: 'probe',
    asset: 'h264_video_only.mp4',
    containersIn: ['mp4'],
    videoCodecs: ['h264'],
    oracles: ['golden-metadata'],
    assetMissing: true,
    notes:
      '§A.16 video-only (normal length): MP4 with a video track and no audio track. Fixture NOT yet ' +
      'baked (§5.4) → asset-missing until present, then golden-metadata gates track enumeration.',
  },
  {
    id: 'edge_no_media_tracks_probe',
    op: 'probe',
    asset: 'empty_audio.wav',
    containersIn: ['wav'],
    oracles: ['golden-metadata'],
    notes:
      '§A.16 no-tracks / no-media: a structurally-VALID WAV with a 0-length data chunk. Probe must ' +
      'report a parseable container with duration 0 / no samples (golden encodes this) and NOT crash ' +
      'on the empty payload. Distinct from zero_length.mp4 (true 0 bytes → graceful-failure).',
  },

  // degenerate dimensions — guard SSIM/luma divide-by-zero, zero-dim handling.
  {
    id: 'edge_dims_1x1_probe',
    op: 'probe',
    asset: 'micro_h264_1x1_1s.mp4',
    containersIn: ['mp4'],
    videoCodecs: ['h264'],
    oracles: ['golden-metadata'],
    assetMissing: true,
    notes:
      '§A.16 1×1 video: probe a minimum-dimension (1×1) clip; width/height must report 1×1 (golden). ' +
      'Fixture NOT yet baked (§5.4) → asset-missing until present. Pairs with the decode-side 1×1 case.',
  },
  {
    id: 'edge_dims_1x1_decode',
    op: 'decodeFrames',
    asset: 'micro_h264_1x1_1s.mp4',
    containersIn: ['mp4'],
    videoCodecs: ['h264'],
    options: { maxFrames: 1 },
    oracles: ['decoded-frames-bitexact'],
    assetMissing: true,
    notes:
      '§A.16 1×1 decode: decode one 1×1 frame — exercises the SSIM/luma divide-by-zero guard in the ' +
      'oracle pixel math on a degenerate dimension. Fixture NOT yet baked (§5.4) → asset-missing until present.',
  },
  {
    id: 'edge_dims_0x0_probe',
    op: 'probe',
    asset: 'micro_h264_0x0_1s.mp4',
    containersIn: ['mp4'],
    videoCodecs: ['h264'],
    // 0×0 has no single correct metadata across engines; require only that the engine does not fault.
    oracles: ['graceful-failure'],
    assetMissing: true,
    notes:
      '§A.16 0×0 video: probe a zero-dimension clip. No single correct dimension answer exists across ' +
      'engines, so the only requirement is no fault / no NaN-divide — verdict by output-absence, not ' +
      'notes. Fixture NOT yet baked (§5.4) → asset-missing until present.',
  },

  // extreme fps — duration/fps reporting + pacing under extremes.
  {
    id: 'edge_extreme_fps_1_probe',
    op: 'probe',
    asset: 'h264_1fps_30s.mp4',
    containersIn: ['mp4'],
    videoCodecs: ['h264'],
    oracles: ['golden-metadata'],
    assetMissing: true,
    notes:
      '§A.16 extreme fps (1 fps): probe must report ~1 fps and ~30s duration (golden). Fixture NOT ' +
      'yet baked (§5.4) → asset-missing until present. Shared canonical id with decode-seek.',
  },
  {
    id: 'edge_extreme_fps_240_probe',
    op: 'probe',
    asset: 'h264_240fps_5s.mp4',
    containersIn: ['mp4'],
    videoCodecs: ['h264'],
    oracles: ['golden-metadata'],
    assetMissing: true,
    notes:
      '§A.16 extreme fps (240 fps): probe must report ~240 fps and ~5s duration under dense timestamps ' +
      '(golden). Fixture NOT yet baked (§5.4) → asset-missing until present. Shared canonical id with decode-seek.',
  },

  // mislabeled container/codec — detect-by-content or reject; never trust the label.
  {
    id: 'edge_mislabeled_container_probe',
    op: 'probe',
    asset: 'h264_es_mislabeled.webm',
    containersIn: ['webm'],
    oracles: ['graceful-failure'],
    assetMissing: true,
    notes:
      '§A.16 mismatched container/codec: bytes are a raw H.264 elementary stream but the extension/MIME ' +
      'claims .webm. The engine must detect the real format by content or reject — it must not blindly ' +
      'trust the label and emit a bogus WebM probe. Verdict by output-absence (no valid WebM produced), ' +
      'not notes. Fixture NOT yet baked (§5.4) → asset-missing until present.',
  },

  // MPEG-TS timestamp wraparound + discontinuity — demux/probe must unwrap or handle.
  {
    id: 'edge_ts_pts_wraparound_demux',
    op: 'probe',
    asset: 'h264_ts_pts_wrap.ts',
    containersIn: ['ts'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    oracles: ['golden-metadata'],
    assetMissing: true,
    notes:
      '§A.16 TS PTS/PCR wraparound + discontinuity: a 33-bit timestamp wrap and a discontinuity flag in ' +
      'MPEG-TS. Probe duration must be derived with the wrap UNWRAPPED (golden encodes the true ' +
      'duration; ts uses the estimate-only loose band). Only the clean h264_ts.ts is used today; this ' +
      'wrap asset is NOT yet baked (§5.4) → asset-missing until present.',
  },

  // gapless audio (encoder delay/padding) — reported duration must reflect priming/padding handling.
  // NOTE: decoded-frames-bitexact digests RGBA VIDEO frames; an AAC audio stream has none, so that
  // oracle would guaranteed-FAIL here. The live, defensible gate is golden-metadata on probe — a
  // priming/padding-aware demuxer reports the trimmed (gapless) duration, which golden encodes. The
  // exact decoded-sample-count-with-priming-removed check needs an audio-sample oracle that does not
  // exist yet; that stricter property is registered as an honest-FAIL property-invariant below.
  {
    id: 'edge_gapless_priming_probe',
    op: 'probe',
    asset: 'aac_gapless_priming.m4a',
    containersIn: ['mp4'],
    audioCodecs: ['aac'],
    oracles: ['golden-metadata'],
    assetMissing: true,
    notes:
      '§A.16 gapless audio: AAC with encoder delay (priming) + padding (iTunSMPB / edit list). A ' +
      'priming-aware demuxer reports the trimmed gapless duration; golden encodes it. Fixture NOT yet ' +
      'baked (§5.4) → asset-missing until present. The exact priming-removed decoded-sample-count check ' +
      'is the honest-FAIL property-invariant prop_gapless_sample_count_priming below (no audio-sample oracle yet).',
  },

  // variable channel count — probe/decode must survive a mid-stream layout change.
  {
    id: 'edge_variable_channels_probe',
    op: 'probe',
    asset: 'wav_varchannels.wav',
    containersIn: ['wav'],
    audioCodecs: ['pcm-s16'],
    oracles: ['graceful-failure'],
    assetMissing: true,
    notes:
      '§A.16 variable channel count: a stream whose channel layout varies mid-file. Probe/track ' +
      'enumeration must not fault at the layout shift (no single stable channel count to assert across ' +
      'engines, so the gate is no-fault, by output-absence not notes). Fixture NOT yet baked (§5.4) → ' +
      'asset-missing until present.',
  },
];

const shapeEdgeScenarios: Scenario[] = SHAPE_EDGE_CASES.map((c) =>
  defineScenario({
    id: `robustness/${c.id}`,
    op: c.op,
    input: c.asset,
    ...(c.options ? { options: c.options } : {}),
    requires: {
      operations: [c.op],
      containersIn: c.containersIn,
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
    },
    oracles: c.oracles,
    metrics: ['wall', 'peakMemory', 'longtasks'],
    timeoutMs: FUZZ_TIMEOUT_MS,
    notes: c.notes,
  }),
);

// ── (g) EXTRA FUZZ — corpus holes (§A.16) ─────────────────────────────────────────────────────────
//
// Fuzz cases that fill the documented corpus holes: encrypted MP4 ciphertext corruption, ADTS/AAC,
// OGG/Opus, the dedicated header-truncated asset, and a mux-target (corrupt-then-remux) path. All use
// the graceful-failure oracle; the runner mutate path drives the verdict from output-absence. Wording
// avoids the good-token set (§0.1).
const EXTRA_FUZZ_CASES: FuzzCase[] = [
  {
    id: 'fuzz_encrypted_mp4_ciphertext_decode',
    asset: 'cenc_ctr.mp4',
    op: 'decodeFrames',
    containersIn: ['mp4'],
    videoCodecs: ['h264'],
    options: { maxFrames: 30 },
    // Corrupt the ENCRYPTED payload region (skip the moof/header head). A decode that ignores the
    // corruption and emits garbage frames could spuriously pass a downstream check — so the engine
    // must error rather than emit frames from mangled ciphertext.
    mutate: zeroRandomSpans(6, 2048, 0xc0ffee, 2048),
    notes:
      '§A.16 encrypted-MP4 fuzz: zero spans of the CENC (AES-CTR) ciphertext. The decrypt/decode path ' +
      'must error on the mangled ciphertext, not emit garbage frames that a downstream check could ' +
      'mistake for valid output. Verdict by output-absence (no frames), not notes.',
  },
  {
    id: 'fuzz_adts_aac_bitflip_probe',
    asset: 'aac_adts.aac',
    op: 'probe',
    containersIn: ['adts'],
    audioCodecs: ['aac'],
    // ADTS is a bare frame stream: bit-flips corrupt frame headers (bad syncword/length).
    mutate: bitFlip(64, 0x44a),
    notes:
      '§A.16 ADTS/AAC fuzz: bit-flips across a raw ADTS stream corrupt frame-header syncwords/lengths. ' +
      'Probe (header frame-scan) must not loop on a bad frame length and must reject or report degraded.',
  },
  {
    id: 'fuzz_ogg_opus_header_truncated_probe',
    asset: 'opus.ogg',
    op: 'probe',
    containersIn: ['ogg'],
    audioCodecs: ['opus'],
    // Drop the OGG capture pattern / OpusHead so the bitstream identity is destroyed.
    mutate: truncateHeader(96),
    notes:
      '§A.16 OGG/Opus fuzz: drop the OGG capture-pattern + OpusHead head; probe must reject a stream ' +
      'with no identifiable bitstream rather than loop scanning for a page.',
  },
  {
    id: 'fuzz_truncated_h264_asset_demux',
    asset: 'truncated_h264.mp4',
    op: 'demux',
    containersIn: ['mp4'],
    videoCodecs: ['h264'],
    // The corpus ships truncated_h264.mp4 (incomplete moov/mdat) specifically for this edge — feed it
    // UNMUTATED (it is already malformed). No mutate: the asset itself is the malformed input.
    mutate: (b) => b,
    notes:
      '§A.16 dedicated header-truncated asset: the corpus truncated_h264.mp4 (incomplete moov/mdat, ' +
      'shipped for exactly this) fed to demux. Engine must yield a clean partial+EOF or reject, not ' +
      'fault on the missing tail. Verdict by output-absence, not notes.',
  },
  {
    id: 'fuzz_mux_target_corrupt_remux',
    asset: 'h264_1080p_30s.mp4',
    op: 'remux',
    containersIn: ['mp4'],
    containersOut: ['mp4'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    options: { container: 'mp4', fragmented: true },
    // Corrupt samples then remux to a FRAGMENTED MP4 (the mux/segment target path). The muxer must
    // reject the corrupt samples or emit a clean partial, never balloon memory assembling segments.
    mutate: zeroRandomSpans(5, 4096, 0x5e6, 2048),
    notes:
      '§A.16 mux-target fuzz: corrupt samples then remux into a FRAGMENTED MP4 (the segment/mux output ' +
      'path, distinct from the existing MKV-target remux fuzz). The muxer must reject or emit a clean ' +
      'partial, never balloon memory. Verdict by output-absence, not notes.',
  },
];

const extraFuzzScenarios: Scenario[] = EXTRA_FUZZ_CASES.map((c) =>
  defineScenario({
    id: `robustness/${c.id}`,
    op: c.op,
    input: c.asset,
    ...(c.options ? { options: c.options } : {}),
    requires: {
      operations: [c.op],
      containersIn: c.containersIn,
      ...(c.containersOut ? { containersOut: c.containersOut } : {}),
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
    },
    oracles: ['graceful-failure'],
    metrics: ['wall', 'peakMemory'],
    mutate: c.mutate,
    timeoutMs: FUZZ_TIMEOUT_MS,
    notes: c.notes,
  }),
);

// ── (h) EXTRA METAMORPHIC / PROPERTY (§A.16 / §7) ────────────────────────────────────────────────
//
// Two classes, kept HONEST about what the current oracle can verify (§0.1 — a wrong oracle that lets
// a fast-but-incorrect engine win is worse than an honest FAIL):
//
//   LIVE (oracle implements the token today):
//     - transcode-idempotent (resize-to-SAME dims): a transcode whose target dims == source dims and
//       same codec must be perceptually identical. Uses the `ssim-psnr` oracle, whose NO-golden
//       branch decodes the SOURCE in-browser and SSIM-compares (§5.2) — a REAL gate (a garbled/empty
//       output scores low SSIM → FAIL), not a fabricated pass. This needs no golden frame bake.
//     - FLAC ±SEEKTABLE metadata equivalence: PROBE flac_seektable.flac vs flac_noseektable.flac and
//       gate each against its committed `.meta.json` via `golden-metadata` (both exist, with real
//       duration/codec/sampleRate/channels). The SEEKTABLE is an INDEX block, not content, so a
//       correct demuxer reports IDENTICAL metadata with or without it — and STREAMINFO carries the
//       total-sample duration regardless. (decoded-frames-bitexact is deliberately NOT used: it
//       digests RGBA video frames, which a FLAC audio stream has none of, and no audio frames-golden
//       is ever baked — that oracle would be a guaranteed-FAIL here. The true cross-asset "seek lands
//       identically with vs without SEEKTABLE" property is an oracle extension, tracked as honest-FAIL.)
//
//   HONEST-FAIL (oracle token NOT implemented → resolves to "unknown property-invariant", never a
//   fabricated pass; the required oracle extension is tracked in the dossier oracleGaps):
//     - demux(mux(x)) ≈ x : re-demux a muxed stream and compare packets to source.
//     - remux(remux(x)) bit-stable / decode-equal : double-remux round-trip stability.
//     - FLAC seek ±SEEKTABLE land-identical : two-asset seek-equality.
//     - trim additivity (proper compose) : trim(a..b)++trim(b..c) decode-equals trim(a..c) — needs a
//       runner compose path the single-op executor lacks (the existing prop_trim_concatenation only
//       runs ONE trim; this records the proper invariant for when compose exists).

// (h1) LIVE — transcode resize-to-same is perceptually identical (ssim-psnr reference path).
const transcodeIdempotentScenarios: Scenario[] = [
  defineScenario({
    id: 'robustness/prop_transcode_idempotent_dims_h264',
    op: 'transcode',
    input: 'h264_1080p_30s.mp4',
    // Target dims == source dims (1920×1080), same codec/container → a resize-to-same no-op.
    options: { container: 'mp4', video: { codec: 'h264', width: 1920, height: 1080 } },
    requires: {
      operations: ['transcode'],
      containersIn: ['mp4'],
      containersOut: ['mp4'],
      videoCodecs: ['h264'],
      audioCodecs: ['aac'],
      features: ['resize'],
    },
    // ssim-psnr with NO committed golden decodes the SOURCE in-browser and SSIM-compares (§5.2) — a
    // resize-to-same must score ~1.0; a garbled/wrong-size/empty output scores low → FAIL. Real gate.
    // (h264_1080p_30s.mp4 ships no .ssim.json and its .frames.json is `pending` → loadGolden treats
    // frames as ABSENT → the §5.2 reference-source path runs. If a future frame-bake fills real source
    // digests, an .ssim.json must accompany it or this lossy-re-encode case would mis-compare against
    // bit-exact source digests — same dependency the transcode family's resize cases carry.)
    // playback-smoke is the second independent gate (output must actually play), mirroring the
    // transcode family's ['ssim-psnr','playback-smoke'] pairing. Neither oracle can be won by prose.
    oracles: ['ssim-psnr', 'playback-smoke'],
    metrics: ['wall', 'peakMemory'],
    // Slightly tighter SSIM floor than the lossy-resize default: same-size same-codec should be near 1.
    tolerances: { ssimMin: 0.97 },
    timeoutMs: FUZZ_TIMEOUT_MS,
    notes:
      '§A.16 metamorphic transcode idempotence: transcode with target dims == source dims (1920×1080) ' +
      'and same codec ⇒ perceptually identical (resize-to-same ≈ no-op). Gated by ssim-psnr vs the ' +
      'in-browser-decoded source (§5.2) + playback-smoke, so a wrong/empty output FAILs — no golden frame bake needed.',
  }),
];

// (h2) LIVE — FLAC ±SEEKTABLE metadata equivalence (probe vs committed .meta.json golden).
interface FlacProbeCase {
  id: string;
  asset: string;
  notes: string;
}
const FLAC_SEEKTABLE_CASES: FlacProbeCase[] = [
  {
    id: 'edge_flac_with_seektable_probe',
    asset: 'flac_seektable.flac',
    notes:
      '§A.16 FLAC WITH SEEKTABLE: probe must report duration/codec/sampleRate/channels matching golden ' +
      '(golden-metadata). Paired with the no-SEEKTABLE case below — both probe the SAME content, so ' +
      'identical golden-matched metadata on both proves the SEEKTABLE (an index block) does not alter ' +
      'reported metadata; STREAMINFO carries the total-sample duration regardless of SEEKTABLE.',
  },
  {
    id: 'edge_flac_without_seektable_probe',
    asset: 'flac_noseektable.flac',
    notes:
      '§A.16 FLAC WITHOUT SEEKTABLE: probe must report the SAME metadata as the seektable variant, gated ' +
      'against this asset\'s golden. Without a SEEKTABLE duration still comes from STREAMINFO total ' +
      'samples (not the index). Cross-asset seek-lands-identical equality is tracked as honest-FAIL below.',
  },
];
const flacSeektableScenarios: Scenario[] = FLAC_SEEKTABLE_CASES.map((c) =>
  defineScenario({
    id: `robustness/${c.id}`,
    op: 'probe',
    input: c.asset,
    requires: {
      operations: ['probe'],
      containersIn: ['flac'],
      audioCodecs: ['flac'],
    },
    oracles: ['golden-metadata'],
    metrics: ['wall', 'peakMemory'],
    timeoutMs: FUZZ_TIMEOUT_MS,
    notes: c.notes,
  }),
);

// (h3) HONEST-FAIL — metamorphic invariants whose oracle token oracles.ts does not implement yet.
// They carry the invariant token in options.invariant; propertyInvariant() returns an honest
// "unknown property-invariant" FAIL until the token is added (tracked in dossier oracleGaps). This is
// the decode-seek family's established pattern (meta_seek_vs_linear_decode etc.) — register the real
// invariant, never fabricate a pass.
interface MetamorphicTodoCase {
  id: string;
  op: 'remux' | 'mux' | 'trim';
  input: string | string[];
  containersIn: string[];
  containersOut?: string[];
  videoCodecs?: string[];
  audioCodecs?: string[];
  features?: string[];
  options: Record<string, unknown>;
  notes: string;
}

const METAMORPHIC_TODO_CASES: MetamorphicTodoCase[] = [
  {
    id: 'prop_demux_mux_roundtrip_eq',
    op: 'mux',
    input: 'h264_1080p_30s.mp4',
    containersIn: ['mp4'],
    containersOut: ['mp4'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    options: { container: 'mp4', invariant: 'demux(mux(x))==x' },
    notes:
      '§A.16 metamorphic demux(mux(x)) ≈ x: mux the source coded tracks, then re-demux and compare ' +
      'packet count/sizes/keyframe layout to the source packets. Oracle token NOT implemented in ' +
      'oracles.ts → honest FAIL ("unknown property-invariant") until added (dossier oracleGaps); never ' +
      'a fabricated pass. (mux() also needs options.tracks assembled by the runner — see mux family.)',
  },
  {
    id: 'prop_double_remux_stable',
    op: 'remux',
    input: 'h264_1080p_30s.mp4',
    containersIn: ['mp4'],
    containersOut: ['mp4'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    options: { container: 'mp4', invariant: 'remux(remux(x))==remux(x)' },
    notes:
      '§A.16 metamorphic double-remux stability: remux(remux(x)) must be bit-stable / decode-equal to ' +
      'remux(x) — catches engines that drift metadata or re-order packets on each wrap. Needs a runner ' +
      'compose path (two sequential remuxes) the single-op executor lacks AND an oracle token; until ' +
      'both exist this is an honest FAIL, never a fabricated pass.',
  },
  {
    id: 'prop_flac_seek_seektable_equiv',
    op: 'remux',
    input: ['flac_seektable.flac', 'flac_noseektable.flac'],
    containersIn: ['flac'],
    containersOut: ['flac'],
    audioCodecs: ['flac'],
    options: { container: 'flac', invariant: 'flac-seek-lands-identical-with-without-seektable' },
    notes:
      '§A.16 metamorphic FLAC ±SEEKTABLE seek equivalence: seeking to the same tUs in ' +
      'flac_seektable.flac vs flac_noseektable.flac must land on an IDENTICAL frame digest (the ' +
      'SEEKTABLE is an index, not a content change). This is a TWO-ASSET cross-check the current ' +
      'single-input runner + oracle cannot compute → honest FAIL until the oracle/runner learn it ' +
      '(dossier oracleGaps). The per-asset decode equality is covered live above.',
  },
  {
    id: 'prop_gapless_sample_count_priming',
    op: 'trim',
    input: 'aac_gapless_priming.m4a',
    containersIn: ['mp4'],
    containersOut: ['mp4'],
    audioCodecs: ['aac'],
    features: ['trim:frame-accurate'],
    options: {
      container: 'mp4',
      frameAccurate: true,
      invariant: 'gapless-decoded-sample-count-priming-removed',
      // Trim the whole clip; the gapless property is that the decoded sample count equals the
      // priming/padding-removed total, not the raw frame×1024 count.
      startUs: 0,
      endUs: 0,
    },
    notes:
      '§A.16 gapless audio exact-sample-count: the decoded/trimmed sample count must equal the ' +
      'priming(encoder-delay)+padding-removed total (AAC priming stripped), not raw frameCount×1024. ' +
      'No audio-SAMPLE oracle exists (decoded-frames-bitexact is RGBA-video-only) → honest FAIL ' +
      '("unknown property-invariant") until an audio-sample oracle is added (dossier oracleGaps); never ' +
      'a fabricated pass. Fixture aac_gapless_priming.m4a also NOT yet baked (§5.4).',
  },
  {
    id: 'prop_trim_additivity_compose',
    op: 'trim',
    input: 'h264_1080p_30s.mp4',
    containersIn: ['mp4'],
    containersOut: ['mp4'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    features: ['trim:frame-accurate'],
    options: {
      container: 'mp4',
      frameAccurate: true,
      invariant: 'trim(a..b)++trim(b..c)==trim(a..c)',
      a: 2_000_000,
      b: 5_000_000,
      c: 9_000_000,
    },
    notes:
      '§A.16 metamorphic trim ADDITIVITY (proper compose): trim(a..b)++trim(b..c) decode-equals ' +
      'trim(a..c). This is the REAL additivity invariant the existing prop_trim_concatenation only ' +
      'claims — that case runs a SINGLE trim (runner has no concat path) so it degenerates to ' +
      '"one trim ≈ golden". This case records the proper compose invariant; it needs a runner compose ' +
      'path (trim a..b, trim b..c, concat, trim a..c, compare) AND an oracle token → honest FAIL until ' +
      'both exist, never a fabricated pass.',
  },
];

const metamorphicTodoScenarios: Scenario[] = METAMORPHIC_TODO_CASES.map((c) =>
  defineScenario({
    id: `robustness/${c.id}`,
    op: c.op,
    input: c.input,
    options: c.options,
    requires: {
      operations: [c.op],
      containersIn: c.containersIn,
      ...(c.containersOut ? { containersOut: c.containersOut } : {}),
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
      ...(c.features ? { features: c.features } : {}),
    },
    oracles: ['property-invariant'],
    metrics: ['wall', 'peakMemory'],
    timeoutMs: FUZZ_TIMEOUT_MS,
    notes: c.notes,
  }),
);

export const robustnessScenarios: Scenario[] = [
  ...edgeScenarios,
  ...fuzzScenarios,
  ...propertyScenarios,
  ...imageNegativeScenarios,
  // ── new (this extension) ──
  ...seekEdgeScenarios,
  ...shapeEdgeScenarios,
  ...extraFuzzScenarios,
  ...transcodeIdempotentScenarios,
  ...flacSeektableScenarios,
  ...metamorphicTodoScenarios,
];

export default robustnessScenarios;
