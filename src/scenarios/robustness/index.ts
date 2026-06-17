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
    op: 'probe',
    asset: 'wav_s16be.wav',
    containersIn: ['wav'],
    audioCodecs: ['pcm-s16be'],
    oracles: ['golden-metadata'],
    notes: 'Big-endian PCM format detection.',
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
    notes: 'Zero-length file: must reject cleanly (empty input is not parseable), never hang/crash.',
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
    notes: '128 random bit-flips across an MP4; probe must reject or report degraded, never crash.',
  },
  {
    id: 'fuzz_mp4_header_truncated_demux',
    asset: 'h264_1080p_30s.mp4',
    op: 'demux',
    containersIn: ['mp4'],
    videoCodecs: ['h264'],
    mutate: truncateHeader(256),
    notes: 'First 256 bytes dropped (ftyp/moov head gone); demux must fail gracefully.',
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
    notes: 'Six 2KB zeroed payload spans: decoder must error/conceal without hang or OOM.',
  },
  {
    id: 'fuzz_webm_bitflip_probe',
    asset: 'vp9_1080p_10s.webm',
    op: 'probe',
    containersIn: ['webm'],
    mutate: bitFlip(96, 0x222),
    notes: 'EBML/Matroska bit-flips; probe must not crash on a mangled element size.',
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
    notes: 'Zero whole 188-byte TS packets: sync-byte loss; demux must resync or reject gracefully.',
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
    notes: 'Drop ID3/Xing head; probe falls back to frame scan or rejects — no hang.',
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
    notes: 'Corrupt samples then remux: engine must reject or emit a clean partial, never OOM.',
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
      // an engine that DOES try must fail gracefully (graceful-failure), never crash.
      containersIn: [c.pseudoContainer],
    },
    oracles: ['graceful-failure'],
    metrics: ['wall'],
    timeoutMs: FUZZ_TIMEOUT_MS,
    notes:
      c.notes ?? 'Still image fed to a media probe: expect clean NA (no engine declares it) or graceful error.',
  }),
);

export const robustnessScenarios: Scenario[] = [
  ...edgeScenarios,
  ...fuzzScenarios,
  ...propertyScenarios,
  ...imageNegativeScenarios,
];

export default robustnessScenarios;
